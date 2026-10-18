-- Huzzler core schema.
-- Conventions: UUID PKs, created_at/updated_at everywhere, soft deletes on user data,
-- RLS enabled on every table. The Express API uses the service role (bypasses RLS) and
-- performs its own ownership checks; RLS policies here protect direct client access
-- (Supabase Realtime subscriptions and any read the browser does with the anon key).

create extension if not exists "pgcrypto";
create extension if not exists "vector";

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type journey_status as enum (
  'REGISTERED','FIELD_CHOSEN','PREVIEW','ONBOARDING_STARTED','GUARDIAN_PENDING',
  'PAYMENT_PENDING','PAID','TESTING','TESTS_PASSED','TESTS_FAILED','OFFER_PENDING',
  'PLACED','PROJECT_1','PROJECT_2','PROJECT_3','PROJECT_4','PROJECT_5','CERTIFIED',
  'LAPSED','SUSPENDED','WITHDRAWN'
);

create type app_role as enum ('user','admin','moderator','content_reviewer','partnerships');

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function set_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- Catalogue
-- ---------------------------------------------------------------------------
create table roles (
  id text primary key,
  name text not null,
  description text not null,
  team_duty text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table archetypes (
  id text primary key,
  name text not null,
  description text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table role_archetype_compatibility (
  role_id text not null references roles(id),
  archetype_id text not null references archetypes(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (role_id, archetype_id)
);

create table squad_templates (
  id uuid primary key default gen_random_uuid(),
  archetype_id text not null references archetypes(id),
  -- {"required": {"product_manager":1,"software_engineer":2,...}, "optional": ["devops_engineer",...], "max_size": 7}
  template jsonb not null,
  version int not null default 1,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on squad_templates (archetype_id) where active;

-- ---------------------------------------------------------------------------
-- Users
-- ---------------------------------------------------------------------------
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  username text unique,
  dob date,
  phone text,
  phone_verified boolean not null default false,
  timezone text default 'Africa/Lagos',
  hours_per_week int check (hours_per_week between 1 and 60),
  role_id text references roles(id),
  is_minor boolean not null default false,
  field_switches_used int not null default 0,
  avatar_url text,
  bio text,
  open_to_opportunities boolean not null default false,
  identity_verified boolean not null default false,
  app_role app_role not null default 'user',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index on profiles (role_id);
create index on profiles (app_role);

create table guardian_consents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  guardian_name text not null,
  guardian_email text,
  guardian_phone text,
  relationship text,
  token_hash text not null unique,
  status text not null default 'pending' check (status in ('pending','accepted','declined','expired')),
  accepted_at timestamptz,
  accepted_ip text,
  expires_at timestamptz not null default now() + interval '7 days',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on guardian_consents (user_id);
create index on guardian_consents (status);

create table consents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  type text not null check (type in ('terms','privacy','ai_grading','cross_border','marketing','opportunities','analytics_cookies','marketing_cookies')),
  version text not null,
  granted boolean not null,
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on consents (user_id, type);

create table user_journey (
  user_id uuid primary key references profiles(id) on delete cascade,
  status journey_status not null default 'REGISTERED',
  status_changed_at timestamptz not null default now(),
  -- status to return to when leaving a side state (LAPSED/SUSPENDED)
  resume_status journey_status,
  plan_id text,
  access_expires_at timestamptz,
  grace_until timestamptz,
  lapsed_at timestamptz,
  attempts_used int not null default 0,
  next_attempt_at timestamptz,
  offers_declined int not null default 0,
  failed_projects int not null default 0,
  last_active_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on user_journey (status);

create table journey_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  from_status journey_status,
  to_status journey_status not null,
  reason text,
  actor_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on journey_events (user_id);

-- ---------------------------------------------------------------------------
-- Billing
-- ---------------------------------------------------------------------------
create table plans (
  id text primary key check (id in ('one_time','monthly')),
  name text not null,
  amount_kobo int not null,
  interval text check (interval in ('monthly')),
  paystack_plan_code text,
  access_days int,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  plan_id text not null references plans(id),
  paystack_subscription_code text unique,
  paystack_email_token text,
  paystack_customer_code text,
  status text not null default 'active' check (status in ('active','non_renewing','attention','cancelled','completed')),
  next_payment_date timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on subscriptions (user_id);
create index on subscriptions (status);

create table payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  plan_id text not null references plans(id),
  reference text not null unique,
  amount_kobo int not null,
  currency text not null default 'NGN',
  status text not null default 'pending' check (status in ('pending','success','failed','abandoned','refunded')),
  channel text,
  paid_at timestamptz,
  paystack_transaction_id bigint,
  verified_via text check (verified_via in ('verify','webhook')),
  raw jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on payments (user_id);
create index on payments (status);

create table payment_events (
  id uuid primary key default gen_random_uuid(),
  -- sha256 of the raw body: Paystack can resend the same event, we process it once
  event_hash text not null unique,
  event_type text not null,
  reference text,
  payload jsonb not null,
  processed_at timestamptz,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on payment_events (event_type);
create index on payment_events (reference);

create table refunds (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references payments(id),
  amount_kobo int not null,
  status text not null default 'pending' check (status in ('pending','processing','processed','failed')),
  paystack_refund_id bigint,
  reason text,
  admin_id uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on refunds (payment_id);

-- ---------------------------------------------------------------------------
-- Onboarding tests
-- ---------------------------------------------------------------------------
create table test_bank (
  id uuid primary key default gen_random_uuid(),
  role_id text not null references roles(id),
  test_no int not null check (test_no between 1 and 5),
  version int not null default 1,
  title text not null,
  kind text not null check (kind in ('mcq','ranking','seeded_issues','numeric','sql_result','code_sandbox','ai_rubric','sjt')),
  content jsonb not null,       -- what the candidate sees
  answer_key jsonb,             -- never sent to the browser
  rubric_id text,               -- packages: backend/src/content/rubrics/<rubric_id>.json
  time_limit_min int not null,
  status text not null default 'draft' check (status in ('draft','approved','retired')),
  created_by uuid references profiles(id),
  approved_by uuid references profiles(id),
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (role_id, test_no, version)
);
create index on test_bank (role_id, test_no, status);

create table test_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  role_id text not null references roles(id),
  attempt_no int not null check (attempt_no between 1 and 2),
  status text not null default 'in_progress' check (status in ('in_progress','grading','passed','failed')),
  weighted_score numeric(5,2),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, attempt_no)
);
create index on test_attempts (user_id);
create index on test_attempts (status);

create table test_submissions (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references test_attempts(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  test_bank_id uuid not null references test_bank(id),
  test_no int not null check (test_no between 1 and 5),
  answers jsonb,
  draft jsonb,
  ai_declaration boolean not null default false,
  carried_over boolean not null default false,   -- passing score kept from attempt 1
  score numeric(5,2),
  status text not null default 'not_started' check (status in ('not_started','in_progress','submitted','grading','awaiting_ai','needs_review','graded')),
  started_at timestamptz,
  deadline_at timestamptz,
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (attempt_id, test_no)
);
create index on test_submissions (user_id);
create index on test_submissions (status);
create index on test_submissions (test_bank_id);

create table test_results (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null unique references test_attempts(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  scores jsonb not null,           -- {"1": 80, "2": 65, ...}
  weighted_score numeric(5,2) not null,
  passed boolean not null,
  summary jsonb,                   -- strengths / gaps / next steps rolled up
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on test_results (user_id);

-- ---------------------------------------------------------------------------
-- Grading
-- ---------------------------------------------------------------------------
create table grades (
  id uuid primary key default gen_random_uuid(),
  subject_type text not null check (subject_type in ('test_submission','deliverable','demo')),
  subject_id uuid not null,
  user_id uuid not null references profiles(id) on delete cascade,
  grader text not null check (grader in ('auto','ai','human')),
  score numeric(5,2) not null,
  criteria jsonb not null default '{}',
  strengths text,
  gaps text,
  next_steps jsonb not null default '[]',
  feedback text,
  flags jsonb not null default '{}',
  model text,
  prompt_version text,
  rubric_version text,
  needs_review boolean not null default false,
  is_final boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on grades (subject_type, subject_id);
create index on grades (user_id);
create index on grades (needs_review) where needs_review;

create table appeals (
  id uuid primary key default gen_random_uuid(),
  grade_id uuid not null unique references grades(id) on delete cascade,  -- one appeal per graded item
  user_id uuid not null references profiles(id) on delete cascade,
  reason text not null,
  status text not null default 'open' check (status in ('open','upheld','adjusted','rejected')),
  response text,
  new_score numeric(5,2),
  resolved_by uuid references profiles(id),
  resolved_at timestamptz,
  due_at timestamptz not null default now() + interval '72 hours',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on appeals (status);
create index on appeals (user_id);

create table integrity_flags (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  subject_type text not null,
  subject_id uuid not null,
  other_subject_id uuid,
  similarity numeric(5,4),
  reason text not null,
  follow_up_question text,
  follow_up_answer text,
  status text not null default 'open' check (status in ('open','cleared','confirmed')),
  reviewed_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on integrity_flags (status);
create index on integrity_flags (user_id);

create table calibration_samples (
  id uuid primary key default gen_random_uuid(),
  role_id text not null references roles(id),
  rubric_id text not null,
  submission text not null,
  human_score numeric(5,2) not null,
  human_criteria jsonb,
  last_ai_score numeric(5,2),
  last_run_at timestamptz,
  last_prompt_version text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on calibration_samples (role_id, rubric_id);

-- ---------------------------------------------------------------------------
-- Offers, cohorts, teams
-- ---------------------------------------------------------------------------
create table company_personas (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  logo_url text,
  mission text not null,
  product_brief text not null,
  culture text not null,
  archetype_id text not null references archetypes(id),
  status text not null default 'draft' check (status in ('draft','approved','retired')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on company_personas (archetype_id, status);

create table cohorts (
  id uuid primary key default gen_random_uuid(),
  start_date date not null unique,
  status text not null default 'forming' check (status in ('forming','active','closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on cohorts (status);

create table offers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  persona_id uuid not null references company_personas(id),
  archetype_id text not null references archetypes(id),
  role_id text not null references roles(id),
  cohort_id uuid references cohorts(id),
  letter text not null,
  hours_per_week int,
  status text not null default 'pending' check (status in ('pending','accepted','declined','expired','superseded')),
  expires_at timestamptz not null,
  responded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on offers (user_id);
create index on offers (status);
create index on offers (cohort_id);

create table teams (
  id uuid primary key default gen_random_uuid(),
  cohort_id uuid references cohorts(id),
  archetype_id text not null references archetypes(id),
  persona_id uuid references company_personas(id),
  name text not null,
  status text not null default 'forming' check (status in ('forming','active','completed','disbanded')),
  current_level int not null default 0,
  score_band int,
  timezone_band text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on teams (status);
create index on teams (cohort_id);

create table team_members (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams(id) on delete cascade,
  user_id uuid references profiles(id) on delete set null,   -- null for stand-ins
  role_id text not null references roles(id),
  status text not null default 'active' check (status in ('active','removed','left','lapsed','replaced')),
  is_standin boolean not null default false,
  standin_name text,
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on team_members (team_id);
create index on team_members (user_id);
create index on team_members (status);
create unique index team_members_one_active_team on team_members (user_id) where status = 'active' and user_id is not null;

-- ---------------------------------------------------------------------------
-- Projects
-- ---------------------------------------------------------------------------
create table project_templates (
  id uuid primary key default gen_random_uuid(),
  archetype_id text not null references archetypes(id),
  level int not null check (level between 1 and 5),
  version int not null default 1,
  title text not null,
  brief text not null,
  length_days int not null,
  milestones jsonb not null,       -- [{key,title,day_offset}]
  role_tasks jsonb not null,       -- [{key,role_id,title,description,milestone_key,depends_on:[key],hints:[3],rubric_id}]
  acceptance_tests jsonb not null default '[]',
  starter_repo_url text,
  assets jsonb not null default '{}',
  status text not null default 'draft' check (status in ('draft','approved','retired')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (archetype_id, level, version)
);
create index on project_templates (archetype_id, level, status);

create table project_instances (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams(id) on delete cascade,
  template_id uuid not null references project_templates(id),
  level int not null check (level between 1 and 5),
  status text not null default 'active' check (status in ('active','grading','completed')),
  repo_url text,
  team_outcome_score numeric(5,2),
  started_at timestamptz not null default now(),
  due_at timestamptz not null,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (team_id, level)
);
create index on project_instances (team_id);
create index on project_instances (status);

create table milestones (
  id uuid primary key default gen_random_uuid(),
  project_instance_id uuid not null references project_instances(id) on delete cascade,
  key text not null,
  title text not null,
  due_at timestamptz not null,
  status text not null default 'open' check (status in ('open','submitted','closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_instance_id, key)
);
create index on milestones (project_instance_id);

create table team_tasks (
  id uuid primary key default gen_random_uuid(),
  project_instance_id uuid not null references project_instances(id) on delete cascade,
  milestone_id uuid references milestones(id) on delete set null,
  template_task_key text not null,
  role_id text not null references roles(id),
  assignee_id uuid references profiles(id) on delete set null,
  assignee_member_id uuid references team_members(id) on delete set null,
  title text not null,
  description text not null,
  depends_on uuid[] not null default '{}',
  hints jsonb not null default '[]',
  rubric_id text,
  due_at timestamptz,
  status text not null default 'todo' check (status in ('todo','in_progress','blocked','review','done')),
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on team_tasks (project_instance_id);
create index on team_tasks (assignee_id);
create index on team_tasks (status);
create index on team_tasks (milestone_id);

create table deliverables (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references team_tasks(id) on delete cascade,
  project_instance_id uuid not null references project_instances(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  content text not null,
  links jsonb not null default '[]',
  file_paths jsonb not null default '[]',
  ai_declaration boolean not null default false,
  status text not null default 'submitted' check (status in ('submitted','grading','awaiting_ai','needs_review','graded')),
  score numeric(5,2),
  submitted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on deliverables (task_id);
create index on deliverables (user_id);
create index on deliverables (project_instance_id);
create index on deliverables (status);

create table checkins (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams(id) on delete cascade,
  project_instance_id uuid not null references project_instances(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  checkin_date date not null default current_date,
  yesterday text not null,
  today text not null,
  blockers text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, project_instance_id, checkin_date)
);
create index on checkins (team_id, checkin_date);

create table peer_reviews (
  id uuid primary key default gen_random_uuid(),
  project_instance_id uuid not null references project_instances(id) on delete cascade,
  reviewer_id uuid not null references profiles(id) on delete cascade,
  reviewee_id uuid not null references profiles(id) on delete cascade,
  ratings jsonb not null,    -- {"communication":1-5,"quality":1-5,"reliability":1-5,"collaboration":1-5}
  comment text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_instance_id, reviewer_id, reviewee_id),
  check (reviewer_id <> reviewee_id)
);
create index on peer_reviews (reviewee_id);
create index on peer_reviews (project_instance_id);

create table project_results (
  id uuid primary key default gen_random_uuid(),
  project_instance_id uuid not null references project_instances(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  deliverables_score numeric(5,2) not null,
  team_score numeric(5,2) not null,
  peer_score numeric(5,2) not null,
  reliability_score numeric(5,2) not null,
  total numeric(5,2) not null,
  passed boolean not null,
  peer_review_count int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_instance_id, user_id)
);
create index on project_results (user_id);

-- ---------------------------------------------------------------------------
-- Chat & mentor
-- ---------------------------------------------------------------------------
create table messages (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams(id) on delete cascade,
  user_id uuid references profiles(id) on delete set null,
  kind text not null default 'user' check (kind in ('user','system','standin')),
  author_label text,
  body text not null check (char_length(body) <= 4000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index on messages (team_id, created_at desc);

create table hint_unlocks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  task_id uuid not null references team_tasks(id) on delete cascade,
  hint_index int not null check (hint_index between 0 and 2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, task_id, hint_index)
);
create index on hint_unlocks (task_id);

create table mentor_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  task_id uuid not null references team_tasks(id) on delete cascade,
  role text not null check (role in ('user','assistant')),
  content text not null,
  source text check (source in ('faq','ai','fallback')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on mentor_messages (user_id, created_at);
create index on mentor_messages (task_id);

-- ---------------------------------------------------------------------------
-- RAG (gte-small = 384 dimensions)
-- ---------------------------------------------------------------------------
create table kb_documents (
  id uuid primary key default gen_random_uuid(),
  role_id text references roles(id),
  archetype_id text references archetypes(id),
  rubric_id text,
  kind text not null check (kind in ('exemplar','reference','style_guide','project_doc','faq','hint')),
  title text not null,
  body text not null,
  score numeric(5,2),        -- for exemplars: the human grade
  metadata jsonb not null default '{}',
  status text not null default 'approved' check (status in ('draft','approved','retired')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on kb_documents (kind, role_id);
create index on kb_documents (rubric_id);

create table kb_chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references kb_documents(id) on delete cascade,
  content text not null,
  embedding vector(384),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on kb_chunks (document_id);
create index kb_chunks_embedding_idx on kb_chunks using hnsw (embedding vector_cosine_ops);

create table faq (
  id uuid primary key default gen_random_uuid(),
  role_id text references roles(id),
  question text not null,
  answer text not null,
  embedding vector(384),
  status text not null default 'approved' check (status in ('draft','approved','retired')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index faq_embedding_idx on faq using hnsw (embedding vector_cosine_ops);

create table submission_embeddings (
  id uuid primary key default gen_random_uuid(),
  subject_type text not null,
  subject_id uuid not null,
  user_id uuid not null references profiles(id) on delete cascade,
  scope text not null,      -- e.g. test_bank_id or task template key: only compare like with like
  embedding vector(384) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (subject_type, subject_id)
);
create index on submission_embeddings (scope);
create index submission_embeddings_idx on submission_embeddings using hnsw (embedding vector_cosine_ops);

create or replace function match_kb_chunks(query_embedding vector(384), filter_role text, filter_kinds text[], match_count int)
returns table (id uuid, document_id uuid, content text, title text, kind text, similarity float)
language sql stable as $$
  select c.id, c.document_id, c.content, d.title, d.kind, 1 - (c.embedding <=> query_embedding) as similarity
  from kb_chunks c join kb_documents d on d.id = c.document_id
  where d.status = 'approved'
    and (filter_role is null or d.role_id is null or d.role_id = filter_role)
    and (filter_kinds is null or d.kind = any(filter_kinds))
    and c.embedding is not null
  order by c.embedding <=> query_embedding
  limit match_count;
$$;

create or replace function match_faq(query_embedding vector(384), filter_role text, match_count int)
returns table (id uuid, question text, answer text, similarity float)
language sql stable as $$
  select f.id, f.question, f.answer, 1 - (f.embedding <=> query_embedding) as similarity
  from faq f
  where f.status = 'approved' and f.embedding is not null
    and (filter_role is null or f.role_id is null or f.role_id = filter_role)
  order by f.embedding <=> query_embedding
  limit match_count;
$$;

create or replace function match_similar_submissions(query_embedding vector(384), filter_scope text, exclude_user uuid, min_similarity float, match_count int)
returns table (subject_type text, subject_id uuid, user_id uuid, similarity float)
language sql stable as $$
  select s.subject_type, s.subject_id, s.user_id, 1 - (s.embedding <=> query_embedding) as similarity
  from submission_embeddings s
  where s.scope = filter_scope and s.user_id <> exclude_user
    and 1 - (s.embedding <=> query_embedding) >= min_similarity
  order by s.embedding <=> query_embedding
  limit match_count;
$$;

-- ---------------------------------------------------------------------------
-- Outcomes
-- ---------------------------------------------------------------------------
create table certifications (
  id uuid primary key default gen_random_uuid(),
  cert_code text not null unique,
  user_id uuid not null references profiles(id) on delete cascade,
  role_id text not null references roles(id),
  team_id uuid references teams(id),
  scores jsonb not null,
  projects jsonb not null,
  pdf_path text,
  status text not null default 'valid' check (status in ('valid','revoked')),
  issued_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on certifications (user_id);

create table portfolio_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  project_instance_id uuid references project_instances(id) on delete set null,
  title text not null,
  summary text not null,
  links jsonb not null default '[]',
  visible boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on portfolio_items (user_id);

create table opportunities (
  id uuid primary key default gen_random_uuid(),
  company_name text not null,
  role_id text not null references roles(id),
  level text,
  location text,
  start_date date,
  notes text,
  status text not null default 'open' check (status in ('open','shortlisting','closed')),
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on opportunities (status);

create table opportunity_candidates (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references opportunities(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  rank int,
  fit_note text,
  status text not null default 'proposed' check (status in ('proposed','consent_pending','consented','declined','shared','interview','offer','hired','not_selected')),
  consent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (opportunity_id, user_id)
);
create index on opportunity_candidates (user_id);
create index on opportunity_candidates (status);

-- ---------------------------------------------------------------------------
-- Ops
-- ---------------------------------------------------------------------------
create table ai_calls (
  id uuid primary key default gen_random_uuid(),
  feature text not null,
  model text not null,
  user_id uuid references profiles(id) on delete set null,
  role_id text,
  input_tokens int not null default 0,
  output_tokens int not null default 0,
  cache_read_tokens int not null default 0,
  cache_write_tokens int not null default 0,
  cost_usd numeric(12,6) not null default 0,
  latency_ms int,
  success boolean not null,
  error text,
  prompt_version text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on ai_calls (created_at);
create index on ai_calls (feature);
create index on ai_calls (user_id);

create table audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references profiles(id) on delete set null,
  action text not null,
  target_type text,
  target_id text,
  details jsonb not null default '{}',
  ip text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on audit_logs (actor_id);
create index on audit_logs (created_at);

create table notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  type text not null,
  title text not null,
  body text not null,
  data jsonb not null default '{}',
  read_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on notifications (user_id, created_at desc);

create table feature_flags (
  key text primary key,
  enabled boolean not null default false,
  value jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid references profiles(id) on delete set null,
  target_type text not null,
  target_id uuid not null,
  reason text not null,
  status text not null default 'open' check (status in ('open','actioned','dismissed')),
  resolved_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on reports (status);

-- ---------------------------------------------------------------------------
-- updated_at triggers on every table that has the column
-- ---------------------------------------------------------------------------
do $$
declare t record;
begin
  for t in
    select table_name from information_schema.columns
    where table_schema = 'public' and column_name = 'updated_at'
  loop
    execute format('create trigger set_updated_at before update on public.%I for each row execute function set_updated_at()', t.table_name);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- New auth user -> profile + journey row
-- ---------------------------------------------------------------------------
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'));
  insert into public.user_journey (user_id) values (new.id);
  insert into public.journey_events (user_id, to_status, reason) values (new.id, 'REGISTERED', 'signup');
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
for each row execute function handle_new_user();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
create or replace function is_team_member(t uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from team_members where team_id = t and user_id = auth.uid() and status = 'active');
$$;

create or replace function is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and app_role <> 'user');
$$;

do $$
declare t record;
begin
  for t in select tablename from pg_tables where schemaname = 'public'
  loop
    execute format('alter table public.%I enable row level security', t.tablename);
  end loop;
end $$;

-- Public catalogue
create policy "catalogue readable" on roles for select using (true);
create policy "catalogue readable" on archetypes for select using (true);
create policy "catalogue readable" on role_archetype_compatibility for select using (true);
create policy "catalogue readable" on plans for select using (true);

-- Own rows (read only; writes go through the API)
create policy "own profile" on profiles for select using (id = auth.uid() or is_staff());
create policy "own journey" on user_journey for select using (user_id = auth.uid() or is_staff());
create policy "own consents" on consents for select using (user_id = auth.uid());
create policy "own guardian consent" on guardian_consents for select using (user_id = auth.uid());
create policy "own payments" on payments for select using (user_id = auth.uid());
create policy "own subscriptions" on subscriptions for select using (user_id = auth.uid());
create policy "own attempts" on test_attempts for select using (user_id = auth.uid());
create policy "own results" on test_results for select using (user_id = auth.uid());
create policy "own grades" on grades for select using (user_id = auth.uid());
create policy "own appeals" on appeals for select using (user_id = auth.uid());
create policy "own offers" on offers for select using (user_id = auth.uid());
create policy "own notifications" on notifications for select using (user_id = auth.uid());
create policy "own mentor" on mentor_messages for select using (user_id = auth.uid());
create policy "own hints" on hint_unlocks for select using (user_id = auth.uid());
create policy "own project results" on project_results for select using (user_id = auth.uid());
create policy "own candidates" on opportunity_candidates for select using (user_id = auth.uid());

-- Team scoped (needed for Realtime subscriptions)
create policy "team read" on teams for select using (is_team_member(id));
create policy "team read" on team_members for select using (is_team_member(team_id));
create policy "team read" on messages for select using (is_team_member(team_id) and deleted_at is null);
create policy "team read" on project_instances for select using (is_team_member(team_id));
create policy "team read" on team_tasks for select using (
  exists (select 1 from project_instances p where p.id = project_instance_id and is_team_member(p.team_id))
);
create policy "team read" on checkins for select using (is_team_member(team_id));

-- Public verification
create policy "certificates public" on certifications for select using (status = 'valid');

-- Everything else (test_bank with answer keys, payment_events, ai_calls, audit_logs, ...) has RLS
-- enabled with no policies: only the service role can touch it.

-- Realtime
alter publication supabase_realtime add table messages;
alter publication supabase_realtime add table team_tasks;
alter publication supabase_realtime add table notifications;
