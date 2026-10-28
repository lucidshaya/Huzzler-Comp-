-- AI stand-ins and meeting notes.
-- 1. Stand-ins do their own tasks with Huzzler AI: their deliverables have no user, only the
--    stand-in's seat (team_members row). They aren't graded and never count towards anyone's score.
-- 2. Teams paste or upload meeting notes; the AI PM proposes plan changes and the team's PM (or
--    any real teammate when the PM seat is a stand-in) approves them.

alter table deliverables alter column user_id drop not null;
alter table deliverables add column if not exists standin_member_id uuid references team_members(id) on delete set null;
alter table deliverables drop constraint if exists deliverables_author_check;
alter table deliverables add constraint deliverables_author_check check (user_id is not null or standin_member_id is not null);

create table if not exists team_meetings (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams(id) on delete cascade,
  project_instance_id uuid references project_instances(id) on delete set null,
  created_by uuid references profiles(id) on delete set null,
  title text not null check (char_length(title) between 1 and 160),
  held_at timestamptz not null default now(),
  source text not null default 'paste' check (source in ('paste','upload','google_meet')),
  notes text not null check (char_length(notes) between 20 and 60000),
  -- processing -> proposed -> applied | dismissed; no_changes when nothing needs to change;
  -- failed when the AI couldn't read the notes (the notes are still kept).
  status text not null default 'processing' check (status in ('processing','proposed','applied','dismissed','no_changes','failed')),
  -- {summary, decisions[], action_items[], changes[{kind, ...}]} written by the AI PM
  proposal jsonb,
  -- indexes of proposal.changes the approver accepted
  accepted jsonb,
  decided_by uuid references profiles(id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists team_meetings_team_idx on team_meetings (team_id, held_at desc);
drop trigger if exists team_meetings_updated_at on team_meetings;
create trigger team_meetings_updated_at before update on team_meetings for each row execute function set_updated_at();
alter table team_meetings enable row level security;
drop policy if exists "team read" on team_meetings;
create policy "team read" on team_meetings for select using (is_team_member(team_id));

alter table ai_decisions drop constraint if exists ai_decisions_kind_check;
alter table ai_decisions add constraint ai_decisions_kind_check
  check (kind in ('squad_matching','grading','wbs','offer_ranking','task_routing','workstation','test_generation','team_review','standin_work','meeting_notes'));
