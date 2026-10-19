-- AI PM portal (/aipm): a project_manager staff role, staff job titles, partner briefs that become
-- draft project templates (the WBS), and saved sponsor reports per team.

alter type app_role add value if not exists 'project_manager';

alter table profiles add column if not exists staff_title text check (char_length(staff_title) <= 80);

-- Lets the API add staff by email (emails live in auth.users, not profiles). Service role only.
create or replace function user_id_by_email(p_email text) returns uuid
language sql stable security definer set search_path = public, auth as $$
  select id from auth.users where lower(email) = lower(p_email) limit 1;
$$;
revoke all on function user_id_by_email(text) from public, anon, authenticated;

-- A partner brief and the work breakdown generated from it. The WBS itself is a draft
-- project_templates row, so it goes through the normal content approval before any team gets it.
create table partner_briefs (
  id uuid primary key default gen_random_uuid(),
  company text not null check (char_length(company) between 2 and 120),
  title text not null check (char_length(title) between 3 and 160),
  scope text not null check (char_length(scope) between 20 and 6000),
  timeline_weeks int not null check (timeline_weeks between 1 and 16),
  archetype_id text not null references archetypes(id),
  level int not null check (level between 1 and 5),
  template_id uuid references project_templates(id) on delete set null,
  persona_id uuid references company_personas(id) on delete set null,
  generated_by text not null check (generated_by in ('ai','rules')),
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger partner_briefs_updated_at before update on partner_briefs for each row execute function set_updated_at();
alter table partner_briefs enable row level security; -- service role only

-- Sponsor report snapshots: what a team shipped and how each member did, at a point in time.
create table team_reports (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams(id) on delete cascade,
  project_instance_id uuid references project_instances(id) on delete set null,
  summary jsonb not null,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index team_reports_team on team_reports (team_id, created_at desc);
create trigger team_reports_updated_at before update on team_reports for each row execute function set_updated_at();
alter table team_reports enable row level security; -- service role only
