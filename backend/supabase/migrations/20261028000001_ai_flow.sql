-- AI flow: AI-generated onboarding test pools (AI PM portal), AI team review of each project,
-- AI-assisted squad matching (decision log only), retrieval-only help bot, and a $3.50 monthly AI cap
-- while the account runs on its first $5 of credit.

-- Test pool: where a test came from and the idea it was generated from.
alter table test_bank
  add column if not exists source text not null default 'manual' check (source in ('manual','ai')),
  add column if not exists generation_brief text check (char_length(generation_brief) <= 2000),
  add column if not exists difficulty text check (difficulty in ('easier','standard','harder'));

-- Team review: the AI's proposal for the team outcome score of a project, and whether a PM confirmed it.
-- {score, summary, strengths, gaps, criteria[], confidence, status: applied|needs_pm|confirmed, proposed_at, model}
alter table project_instances add column if not exists team_review jsonb;
create index if not exists project_instances_team_review_pending on project_instances ((team_review->>'status')) where team_review is not null;

-- New decision kinds for the AI PM portal's reasoning log.
alter table ai_decisions drop constraint if exists ai_decisions_kind_check;
alter table ai_decisions add constraint ai_decisions_kind_check
  check (kind in ('squad_matching','grading','wbs','offer_ranking','task_routing','workstation','test_generation','team_review'));

-- Help bot answers from the FAQ only (no LLM) unless an admin turns this on.
insert into feature_flags (key, enabled, value) values ('help_bot', false, '{"ai": false}')
on conflict (key) do nothing;

-- Monthly AI cap while on the first $5 of credit; raise it in Admin → Flags.
update feature_flags set value = '{"amount": 3.5}', enabled = true where key = 'monthly_ai_budget_usd';
insert into feature_flags (key, enabled, value) values ('monthly_ai_budget_usd', true, '{"amount": 3.5}')
on conflict (key) do nothing;
