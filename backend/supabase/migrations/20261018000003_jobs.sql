-- Background jobs live in the database (no Redis): the API inserts rows, and a drain endpoint
-- (`POST /api/jobs/drain`) claims and runs them. pg_cron enqueues the recurring jobs and pings
-- the drain endpoint every minute through pg_net, so nothing else needs to be hosted.
--
-- The ping needs two Vault secrets (set once per environment, see README "Deploying"):
--   huzzler_api_url      e.g. https://huzzlerr-api.vercel.app
--   huzzler_cron_secret  same value as CRON_SECRET in the API's environment
-- Until both exist the ping is a no-op and jobs wait in the table.

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

create table jobs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  data jsonb not null default '{}'::jsonb,
  job_key text,                         -- dedupe: one pending/running job per key
  status text not null default 'pending' check (status in ('pending','running','done','failed')),
  run_at timestamptz not null default now(),
  attempts int not null default 0,
  max_attempts int not null default 5,
  locked_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger jobs_updated_at before update on jobs for each row execute function set_updated_at();
create unique index jobs_key_open on jobs (job_key) where status in ('pending','running');
create index jobs_due on jobs (run_at) where status = 'pending';
alter table jobs enable row level security; -- service role only

-- Claims up to `max_jobs` due jobs. Jobs stuck in `running` for 15 minutes (a crashed function)
-- are claimed again. SKIP LOCKED lets several drains run at once without double-processing.
create or replace function claim_jobs(max_jobs int default 10) returns setof jobs
language sql security definer set search_path = public as $$
  update jobs set status = 'running', attempts = attempts + 1, locked_at = now()
  where id in (
    select id from jobs
    where (status = 'pending' and run_at <= now())
       or (status = 'running' and locked_at < now() - interval '15 minutes')
    order by run_at
    limit max_jobs
    for update skip locked
  )
  returning *;
$$;
revoke all on function claim_jobs(int) from public, anon, authenticated;

-- Recurring jobs. A tick is skipped while the previous one is still open (jobs_key_open).
create or replace function enqueue_recurring(job_name text) returns void
language sql security definer set search_path = public as $$
  insert into jobs (name, job_key) values (job_name, 'cron:' || job_name) on conflict do nothing;
$$;
revoke all on function enqueue_recurring(text) from public, anon, authenticated;

create or replace function ping_job_drain() returns void
language plpgsql security definer set search_path = public as $$
declare
  api_url text := (select decrypted_secret from vault.decrypted_secrets where name = 'huzzler_api_url');
  secret text := (select decrypted_secret from vault.decrypted_secrets where name = 'huzzler_cron_secret');
begin
  if api_url is null or secret is null then return; end if;
  if not exists (select 1 from jobs where (status = 'pending' and run_at <= now()) or (status = 'running' and locked_at < now() - interval '15 minutes')) then return; end if;
  perform net.http_post(
    url := rtrim(api_url, '/') || '/api/jobs/drain',
    headers := jsonb_build_object('Authorization', 'Bearer ' || secret, 'Content-Type', 'application/json'),
    body := '{}'::jsonb,
    timeout_milliseconds := 5000
  );
end $$;
revoke all on function ping_job_drain() from public, anon, authenticated;

-- Finished jobs are kept a week for debugging, failed ones a month.
create or replace function prune_jobs() returns void
language sql security definer set search_path = public as $$
  delete from jobs where (status = 'done' and updated_at < now() - interval '7 days')
                      or (status = 'failed' and updated_at < now() - interval '30 days');
$$;
revoke all on function prune_jobs() from public, anon, authenticated;

-- Schedules (UTC). cron.schedule upserts by name, so re-running this file is safe.
select cron.schedule('huzzler:expire_offers',     '15 * * * *',   $$select enqueue_recurring('expire_offers')$$);
select cron.schedule('huzzler:run_matching',      '*/30 * * * *', $$select enqueue_recurring('run_matching')$$);
select cron.schedule('huzzler:retry_awaiting_ai', '*/10 * * * *', $$select enqueue_recurring('retry_awaiting_ai')$$);
select cron.schedule('huzzler:nudges',            '0 16 * * *',   $$select enqueue_recurring('nudges')$$);  -- 17:00 WAT
select cron.schedule('huzzler:inactivity_check',  '0 6 * * *',    $$select enqueue_recurring('inactivity_check')$$);
select cron.schedule('huzzler:lapse_check',       '0 7 * * *',    $$select enqueue_recurring('lapse_check')$$);
select cron.schedule('huzzler:prune_jobs',        '30 3 * * *',   $$select prune_jobs()$$);
select cron.schedule('huzzler:drain',             '* * * * *',    $$select ping_job_drain()$$);
