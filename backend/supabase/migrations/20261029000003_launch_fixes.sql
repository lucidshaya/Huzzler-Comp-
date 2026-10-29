-- Launch fixes. Idempotent: safe to paste into the Supabase SQL editor more than once.

-- 1. Three onboarding attempts (an instant retry, then one after 7 days). attempt_no only ever grows,
--    including after an admin resets attempts, so it has no upper bound; the code enforces the limit.
alter table test_attempts drop constraint if exists test_attempts_attempt_no_check;
alter table test_attempts add constraint test_attempts_attempt_no_check check (attempt_no >= 1);

-- 2. Design Review: the designers' Workstation tool (AI critique of a screen against the brief and WCAG).
insert into token_prices (action, label, tool, cost, description, sort_order) values
  ('design_review', 'Design critique', 'Design Review', 30, 'Critiques a screen against your brief and accessibility rules.', 6)
on conflict (action) do nothing;
