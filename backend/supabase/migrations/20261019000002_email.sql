-- Bulk email ("announcements") from the admin dashboard, sent through Resend in batches by the job
-- queue. Every announcement carries a one-click unsubscribe link (NDPA); transactional emails
-- (guardian consent, receipts) are unaffected by the opt-out.

alter table profiles add column if not exists email_opt_out boolean not null default false;

create table email_campaigns (
  id uuid primary key default gen_random_uuid(),
  subject text not null check (char_length(subject) between 3 and 150),
  body text not null check (char_length(body) between 10 and 20000),
  audience jsonb not null default '{}',     -- {segment, role_id}
  status text not null default 'draft' check (status in ('draft','sending','sent','failed','cancelled')),
  recipients_total int not null default 0,
  sent_count int not null default 0,
  failed_count int not null default 0,
  last_error text,
  created_by uuid references profiles(id) on delete set null,
  test_sent_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger email_campaigns_updated_at before update on email_campaigns for each row execute function set_updated_at();
alter table email_campaigns enable row level security; -- service role only

-- One row per recipient, snapshotted when sending starts, so a resumed send never emails twice.
create table email_deliveries (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references email_campaigns(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  email text not null,
  first_name text,
  status text not null default 'pending' check (status in ('pending','sent','failed')),
  error text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (campaign_id, user_id)
);
create index email_deliveries_pending on email_deliveries (campaign_id) where status = 'pending';
create trigger email_deliveries_updated_at before update on email_deliveries for each row execute function set_updated_at();
alter table email_deliveries enable row level security; -- service role only

-- Learners' emails live in auth.users; the API reads them in one call when snapshotting recipients.
create or replace function emails_for_users(p_ids uuid[]) returns table (id uuid, email text)
language sql stable security definer set search_path = public, auth as $$
  select u.id, u.email::text from auth.users u where u.id = any(p_ids) and u.email is not null;
$$;
revoke all on function emails_for_users(uuid[]) from public, anon, authenticated;
