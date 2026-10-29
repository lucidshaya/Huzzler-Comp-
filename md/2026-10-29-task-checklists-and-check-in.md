# Task checklists, check-in pop-up and a more readable workspace — 29 Oct 2026

## ⚠️ One step for you: switch the checklists on
The checklists need one new database column. Open the Supabase SQL editor for project `wszohrtiiwugtsehumrt`, paste this and click Run:

```sql
alter table team_tasks add column if not exists checklist jsonb;
notify pgrst, 'reload schema';
```

(The file is `backend/supabase/migrations/20261029000004_task_checklists.sql`.) Until you run it, task pages work as before but have no checklist. Within a minute of running it, checklists start appearing.

While you're in the SQL editor, also run `backend/supabase/migrations/20261029000003_launch_fixes.sql`. That's the attempt-3 fix, still pending from the launch plan.

## Step-by-step checklists on every task
- **The AI writes the steps.** When a project starts, each real person's task gets 3 to 6 steps written by the AI for that role and task. The AI uses:
  - the task;
  - the project brief;
  - whose work the task starts from;
  - the role's style guide.

  Existing tasks get a checklist the first time someone opens the Board or the task.
- **The last steps are always the same.** Code adds them:
  1. **Hand off:** post the work in Squad chat and @mention the roles who need it, by name. For example, the PM's spec says to @mention the designer, engineer, analyst and marketer.
  2. **Submit:** submit on the task with a link and a short summary.
- **If the AI isn't available** (no key or budget spent), the task gets a standard list: read what it starts from, list what to produce, draft, check against the quality bar, hand off, submit.
- **The AI doesn't see the task's hints**, so the checklist doesn't give away the hints people unlock.
- **On the task page**, a "Your steps" card has big checkboxes, a progress bar and a "Next step" marker. Ticks save straight away. Only the person doing the task can tick. Teammates see the list read-only.
- **Progress shows elsewhere too:** each Board card has a small "3/6" bar, and "Your part" in the Project brief shows the same count.
- **Cost:** one small AI call per task, about 8 to 10 per project, using the cheapest model setting.

## Daily check-in pop-up
- The check-in is now a **"Check in for today"** button. It opens a pop-up with three questions:
  - what you got done;
  - what's next;
  - anything blocking you.
- After sending, the card says **"You've checked in for today"** with a green tick.
- A small **Check in / Checked in today** button is also in the workspace header, so it's reachable from every tab.

## Readability
- Team chat: taller window, bigger message text with more spacing, and readable names and times.
- Stand-ups: "Did", "Next" and "Blocked" are on separate lines in normal-size text.
- Project brief: bigger body text and line spacing. The "Starts from" and "Hand off to" lines are larger.
- Board cards: slightly wider, with larger small print.

## Files
- `backend/src/services/checklists.ts`: AI generation, the standard fallback list, ticking.
- `backend/src/services/projects.ts`: checklists start with projects; the workspace and task responses include them.
- `backend/src/routes/team.ts`: `POST /tasks/:id/checklist`.
- `frontend/src/components/app/TaskChecklist.tsx`: the steps card.
- `frontend/src/components/app/CheckIn.tsx`: the button and pop-up.
- `frontend/src/components/app/Board.tsx`, `ProjectBrief.tsx`, `routes/_app/workspace/*`: progress display and readability.
- `backend/tests/checklists.test.ts`: tests for the standard list.

## Checks
- 77 backend tests pass.
- Both backend type checks, frontend lint and the frontend build pass.
- Not checked in a browser.
- The AI-written steps can only be seen after the SQL runs.
