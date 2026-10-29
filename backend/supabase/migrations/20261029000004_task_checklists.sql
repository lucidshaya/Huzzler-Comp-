-- Step-by-step checklists on squad tasks. The AI writes the steps for each task (code falls back to
-- a standard list without AI); the assignee ticks them off on the task page.
-- Shape: {"steps":[{"id":"s1","text":"...","detail":"..."}],"checked":{"s1":"<iso>"},"source":"ai"|"library","generated_at":"<iso>"}
alter table team_tasks add column if not exists checklist jsonb;

notify pgrst, 'reload schema';
