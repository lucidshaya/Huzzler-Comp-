-- Opportunities (richer offers), the token wallet and its funding pool, Workstation tools, staff
-- invites by email, and the AI decision log the AI PM portal reads. Run after 20261020000003.

-- ---------------------------------------------------------------------------
-- Opportunities: a company persona is now a full listing (title, pay, stipend, length).
-- Offers copy the listing's terms when they are sent, so later edits don't change sent offers.
-- ---------------------------------------------------------------------------
alter table company_personas
  add column if not exists title text check (char_length(title) <= 120),
  add column if not exists engagement_type text not null default 'internship' check (engagement_type in ('internship','job')),
  add column if not exists location text not null default 'Remote',
  add column if not exists compensation text check (char_length(compensation) <= 80),
  add column if not exists stipend_tokens int not null default 0 check (stipend_tokens between 0 and 100000),
  add column if not exists duration_weeks int not null default 8 check (duration_weeks between 1 and 52),
  add column if not exists logo_text text check (char_length(logo_text) <= 3),
  add column if not exists role_ids text[] not null default '{}',
  add column if not exists sort_order int not null default 0;

alter table offers
  add column if not exists title text,
  add column if not exists engagement_type text not null default 'internship',
  add column if not exists location text,
  add column if not exists compensation text,
  add column if not exists stipend_tokens int not null default 0,
  add column if not exists duration_weeks int,
  add column if not exists match_score int,
  add column if not exists stipend_paid boolean not null default false;

-- The opportunities from the Frontend design, as approved listings.
insert into company_personas (name, archetype_id, mission, product_brief, culture, status, title, engagement_type, location, compensation, stipend_tokens, duration_weeks, logo_text, role_ids, sort_order)
select * from (values
  ('Amala Marketplace', 'saas_mobile', 'Help buyers find local vendors fast, even on 3G.',
   'Ship v0.2 of the Amala Marketplace search & discovery experience: faceted filtering and live vendor availability badges, optimised for 3G mobile networks.',
   'A 4-builder cross-functional squad that ships weekly and pairs often.', 'approved',
   'Frontend Product Intern', 'internship', 'Remote · Lagos', '₦180,000 / mo', 1500, 8, 'A', array['software_engineer','uiux_designer','product_manager'], 1),
  ('Zowa Pay', 'web3_fintech', 'Let cross-border SMEs get paid in any network conditions.',
   'Build offline-resilient merchant checkout flows and USSD fallback screens for cross-border SMEs.',
   'Remote-first, written communication, careful with money.', 'approved',
   'Product Engineer Sprint', 'job', 'Remote · Pan-Africa', '₦1.2M / mo', 2500, 12, 'Z', array['software_engineer','qa_engineer','devops_engineer'], 2),
  ('Kola Studio', 'saas_mobile', 'Accessible banking tools for field agents.',
   'Design accessible mobile-first agent banking flows and component tokens for field operators.',
   'Design-led studio; critiques on Wednesdays.', 'approved',
   'UI/UX Systems Intern', 'internship', 'Hybrid · Abuja', '₦450k / mo', 1200, 8, 'K', array['uiux_designer','technical_writer'], 3),
  ('Suru Labs', 'data_driven', 'Understand why payments drop off across African rails.',
   'Analyse cohort retention and payment drop-offs across M-Pesa and bank transfer rails.',
   'Curious and rigorous: every claim needs a number.', 'approved',
   'Growth Data Analyst', 'internship', 'Remote · Nairobi / Lagos', '₦650k / mo', 1800, 6, 'S', array['data_analyst','growth_marketer','product_manager'], 4),
  ('LagosCare', 'saas_mobile', 'Connect patients to nearby clinics.',
   'LagosCare connects patients to nearby clinics: the onboarding flow and SMS appointment reminders.',
   'Patient-first, privacy-conscious, steady pace.', 'approved',
   'Frontend Intern', 'internship', 'Remote', '₦350,000 completion payout', 1000, 8, 'L', array['software_engineer','qa_engineer'], 5),
  ('Core Ledger Microfinance', 'infrastructure', 'Settle microfinance ledgers reliably.',
   'Core ledger settlement microservice migration for a microfinance platform.',
   'Methodical platform team; blameless postmortems.', 'approved',
   'Platform Engineering Intern', 'internship', 'Hybrid · Lagos', '₦400k / mo', 1500, 8, 'CL', array['software_engineer','devops_engineer'], 6)
) as v(name, archetype_id, mission, product_brief, culture, status, title, engagement_type, location, compensation, stipend_tokens, duration_weeks, logo_text, role_ids, sort_order)
where not exists (select 1 from company_personas p where p.name = v.name);

-- ---------------------------------------------------------------------------
-- Tokens: each user has a wallet; the platform has one funding pool admins top up and grant from.
-- Every change goes through the functions below, which lock rows and write the ledger.
-- ---------------------------------------------------------------------------
create table if not exists token_wallets (
  user_id uuid primary key references profiles(id) on delete cascade,
  balance int not null default 0 check (balance >= 0),
  lifetime_purchased int not null default 0,
  lifetime_granted int not null default 0,
  lifetime_spent int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists token_pool (
  id int primary key default 1 check (id = 1),
  balance bigint not null default 0 check (balance >= 0),
  lifetime_funded bigint not null default 0,
  lifetime_granted bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
insert into token_pool (id) values (1) on conflict (id) do nothing;

-- user_id null = a pool entry.
create table if not exists token_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade,
  delta int not null,
  balance_after bigint not null,
  kind text not null check (kind in ('purchase','grant','stipend','spend','refund','pool_fund','pool_grant')),
  label text not null check (char_length(label) <= 200),
  tool text,
  reference text,
  actor_id uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists token_ledger_user on token_ledger (user_id, created_at desc);
create index if not exists token_ledger_pool on token_ledger (created_at desc) where user_id is null;

create table if not exists token_packs (
  id text primary key,
  name text not null,
  tokens int not null check (tokens > 0),
  amount_kobo int not null check (amount_kobo >= 10000),
  description text,
  active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
insert into token_packs (id, name, tokens, amount_kobo, description, sort_order) values
  ('starter', 'Starter Pack', 1500, 250000, '~50 Workstation runs', 1),
  ('sprint_pro', 'Sprint Pro', 4000, 500000, '~140 Workstation runs', 2),
  ('heavy_builder', 'Heavy Builder', 10000, 1000000, '~350 Workstation runs', 3)
on conflict (id) do nothing;

-- What each AI action costs. Admins can change prices; the API always reads them from here.
create table if not exists token_prices (
  action text primary key,
  label text not null,
  tool text not null,
  cost int not null check (cost between 0 and 10000),
  description text,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
insert into token_prices (action, label, tool, cost, description, sort_order) values
  ('code_autocomplete', 'Code autocomplete', 'Code Sandbox', 25, 'AI suggests the next block of code in the editor.', 1),
  ('docs_extract', 'API docs reader', 'Code Sandbox', 15, 'Summarises an API reference into types and endpoints.', 2),
  ('logic_canvas', 'Flowchart step', 'Logic Canvas', 40, 'Turns a sentence into a node on your system diagram.', 3),
  ('data_forge', 'SQL & chart', 'Data Forge', 35, 'Writes SQL from a question and charts the result.', 4),
  ('voice_summary', 'Stand-up summary', 'Voice Studio', 20, 'Turns your spoken or typed update into a stand-up.', 5)
on conflict (action) do nothing;

create table if not exists token_purchases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  pack_id text not null references token_packs(id),
  tokens int not null,
  amount_kobo int not null,
  reference text not null unique,
  status text not null default 'pending' check (status in ('pending','success','failed','abandoned')),
  channel text,
  paid_at timestamptz,
  paystack_transaction_id bigint,
  verified_via text check (verified_via in ('verify','webhook')),
  raw jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists token_purchases_user on token_purchases (user_id, created_at desc);

create or replace function token_credit(p_user uuid, p_amount int, p_kind text, p_label text, p_ref text default null, p_actor uuid default null)
returns int language plpgsql security definer set search_path = public as $$
declare v_balance int;
begin
  if p_amount <= 0 then raise exception 'Amount must be positive' using errcode = '22023'; end if;
  insert into token_wallets (user_id) values (p_user) on conflict (user_id) do nothing;
  update token_wallets set
    balance = balance + p_amount,
    lifetime_purchased = lifetime_purchased + case when p_kind = 'purchase' then p_amount else 0 end,
    lifetime_granted = lifetime_granted + case when p_kind in ('grant','stipend') then p_amount else 0 end,
    lifetime_spent = lifetime_spent - case when p_kind = 'refund' then p_amount else 0 end
  where user_id = p_user returning balance into v_balance;
  insert into token_ledger (user_id, delta, balance_after, kind, label, reference, actor_id)
  values (p_user, p_amount, v_balance, p_kind, p_label, p_ref, p_actor);
  return v_balance;
end $$;

create or replace function token_spend(p_user uuid, p_amount int, p_label text, p_tool text default null, p_ref text default null)
returns int language plpgsql security definer set search_path = public as $$
declare v_balance int;
begin
  if p_amount <= 0 then raise exception 'Amount must be positive' using errcode = '22023'; end if;
  update token_wallets set balance = balance - p_amount, lifetime_spent = lifetime_spent + p_amount
  where user_id = p_user and balance >= p_amount returning balance into v_balance;
  if v_balance is null then raise exception 'INSUFFICIENT_TOKENS' using errcode = 'P0001'; end if;
  insert into token_ledger (user_id, delta, balance_after, kind, label, tool, reference)
  values (p_user, -p_amount, v_balance, 'spend', p_label, p_tool, p_ref);
  return v_balance;
end $$;

create or replace function token_pool_fund(p_amount int, p_label text, p_actor uuid)
returns bigint language plpgsql security definer set search_path = public as $$
declare v_balance bigint;
begin
  if p_amount <= 0 then raise exception 'Amount must be positive' using errcode = '22023'; end if;
  update token_pool set balance = balance + p_amount, lifetime_funded = lifetime_funded + p_amount where id = 1 returning balance into v_balance;
  insert into token_ledger (user_id, delta, balance_after, kind, label, actor_id) values (null, p_amount, v_balance, 'pool_fund', p_label, p_actor);
  return v_balance;
end $$;

-- Moves tokens from the pool to a user in one transaction. Fails if the pool is short.
create or replace function token_pool_grant(p_user uuid, p_amount int, p_kind text, p_label text, p_actor uuid default null, p_ref text default null)
returns int language plpgsql security definer set search_path = public as $$
declare v_pool bigint;
begin
  if p_kind not in ('grant','stipend') then raise exception 'Invalid grant kind' using errcode = '22023'; end if;
  update token_pool set balance = balance - p_amount, lifetime_granted = lifetime_granted + p_amount
  where id = 1 and balance >= p_amount returning balance into v_pool;
  if v_pool is null then raise exception 'POOL_INSUFFICIENT' using errcode = 'P0001'; end if;
  insert into token_ledger (user_id, delta, balance_after, kind, label, actor_id, reference) values (null, -p_amount, v_pool, 'pool_grant', p_label, p_actor, p_user::text);
  return token_credit(p_user, p_amount, p_kind, p_label, p_ref, p_actor);
end $$;

revoke all on function token_credit(uuid, int, text, text, text, uuid) from public, anon, authenticated;
revoke all on function token_spend(uuid, int, text, text, text) from public, anon, authenticated;
revoke all on function token_pool_fund(int, text, uuid) from public, anon, authenticated;
revoke all on function token_pool_grant(uuid, int, text, text, uuid, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Workstation (team workspace AI tools)
-- ---------------------------------------------------------------------------
create table if not exists workstation_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  team_id uuid references teams(id) on delete set null,
  action text not null references token_prices(action),
  input jsonb not null default '{}',
  output jsonb not null default '{}',
  tokens int not null default 0,
  engine text not null check (engine in ('ai','mock')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists workstation_runs_user on workstation_runs (user_id, created_at desc);

create table if not exists canvas_boards (
  user_id uuid primary key references profiles(id) on delete cascade,
  nodes jsonb not null default '[]',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Staff invites: an admin invites an email address to a staff role; no account needed first.
-- ---------------------------------------------------------------------------
create table if not exists staff_invites (
  id uuid primary key default gen_random_uuid(),
  email text not null check (char_length(email) between 5 and 200),
  app_role app_role not null check (app_role <> 'user'),
  staff_title text check (char_length(staff_title) <= 80),
  token_hash text not null unique,
  status text not null default 'pending' check (status in ('pending','accepted','revoked')),
  invited_by uuid references profiles(id) on delete set null,
  accepted_by uuid references profiles(id) on delete set null,
  accepted_at timestamptz,
  expires_at timestamptz not null default now() + interval '7 days',
  last_sent_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists staff_invites_one_pending on staff_invites (lower(email)) where status = 'pending';

-- ---------------------------------------------------------------------------
-- AI decision log: what the AI (or the rules engine standing in for it) decided and why.
-- ---------------------------------------------------------------------------
create table if not exists ai_decisions (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('squad_matching','grading','wbs','offer_ranking','task_routing','workstation')),
  engine text not null check (engine in ('ai','rules','mock')),
  model text,
  subject_type text,
  subject_id text,
  user_id uuid references profiles(id) on delete set null,
  team_id uuid references teams(id) on delete set null,
  summary text not null check (char_length(summary) <= 600),
  reasoning jsonb not null default '[]',
  confidence numeric(4,3),
  latency_ms int,
  status text not null default 'committed' check (status in ('committed','flagged','overridden')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ai_decisions_kind on ai_decisions (kind, created_at desc);
create index if not exists ai_decisions_recent on ai_decisions (created_at desc);

do $$
declare t text;
begin
  foreach t in array array['token_wallets','token_pool','token_ledger','token_packs','token_prices','token_purchases','workstation_runs','canvas_boards','staff_invites','ai_decisions'] loop
    execute format('drop trigger if exists set_updated_at on public.%I', t);
    execute format('create trigger set_updated_at before update on public.%I for each row execute function set_updated_at()', t);
    execute format('alter table public.%I enable row level security', t); -- service role only
  end loop;
end $$;
