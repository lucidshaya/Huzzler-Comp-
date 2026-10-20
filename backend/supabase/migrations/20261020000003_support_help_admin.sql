-- Support tickets (report an issue), help-bot query log, protected admin account, OAuth profile data,
-- and storage limits. Run after 20261018000002_catalogue.sql.

-- ---------------------------------------------------------------------------
-- Protected admin: the main admin account can never lose the admin role, be suspended or deleted.
-- Enforced in the database so no API bug, script or dashboard edit can get around it.
-- ---------------------------------------------------------------------------
alter table profiles add column if not exists is_protected boolean not null default false;

create or replace function protect_admin_profile() returns trigger
language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    if old.is_protected then
      raise exception 'The protected admin account cannot be deleted' using errcode = '42501';
    end if;
    return old;
  end if;
  if old.is_protected then
    if new.is_protected is distinct from true then
      raise exception 'Admin protection cannot be removed' using errcode = '42501';
    end if;
    if new.app_role <> 'admin' then
      raise exception 'The protected admin account must keep the admin role' using errcode = '42501';
    end if;
    if new.deleted_at is not null then
      raise exception 'The protected admin account cannot be deleted' using errcode = '42501';
    end if;
  end if;
  -- Never leave the platform without an admin.
  if old.app_role = 'admin' and (new.app_role <> 'admin' or new.deleted_at is not null)
     and (select count(*) from profiles where app_role = 'admin' and deleted_at is null and id <> old.id) = 0 then
    raise exception 'At least one admin must remain' using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists protect_admin_profile on profiles;
create trigger protect_admin_profile before update or delete on profiles
for each row execute function protect_admin_profile();

create or replace function protect_admin_journey() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status in ('SUSPENDED', 'WITHDRAWN', 'LAPSED')
     and exists (select 1 from profiles where id = new.user_id and is_protected) then
    raise exception 'The protected admin account cannot be suspended or withdrawn' using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists protect_admin_journey on user_journey;
create trigger protect_admin_journey before update on user_journey
for each row execute function protect_admin_journey();

-- ---------------------------------------------------------------------------
-- OAuth (Google / GitHub): keep the provider's name and avatar on the profile.
-- ---------------------------------------------------------------------------
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', new.raw_user_meta_data->>'user_name'),
    coalesce(new.raw_user_meta_data->>'avatar_url', new.raw_user_meta_data->>'picture')
  );
  insert into public.user_journey (user_id) values (new.id);
  insert into public.journey_events (user_id, to_status, reason) values (new.id, 'REGISTERED', 'signup');
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- Report an issue: tickets + a conversation thread with staff.
-- ---------------------------------------------------------------------------
create table if not exists support_tickets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  category text not null check (category in ('bug','payment','account','tests','team','grading','other')),
  subject text not null check (char_length(subject) between 3 and 140),
  status text not null default 'open' check (status in ('open','awaiting_user','resolved','closed')),
  priority text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  page_url text,
  user_agent text,
  assigned_to uuid references profiles(id) on delete set null,
  unread_by_user boolean not null default false,
  unread_by_staff boolean not null default true,
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists support_tickets_user_idx on support_tickets (user_id);
create index if not exists support_tickets_status_idx on support_tickets (status, last_message_at desc);
create index if not exists support_tickets_assigned_idx on support_tickets (assigned_to);

create table if not exists support_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references support_tickets(id) on delete cascade,
  sender_id uuid references profiles(id) on delete set null,
  is_staff boolean not null default false,
  body text not null check (char_length(body) between 1 and 5000),
  attachment_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists support_messages_ticket_idx on support_messages (ticket_id, created_at);

-- ---------------------------------------------------------------------------
-- Help bot: every question is logged so admins can turn unanswered ones into FAQ entries.
-- ---------------------------------------------------------------------------
create table if not exists help_queries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete set null,
  question text not null check (char_length(question) <= 1000),
  answered boolean not null default false,
  source text check (source in ('faq','ai','none')),
  top_faq_id uuid references faq(id) on delete set null,
  score numeric(6,3),
  helpful boolean,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists help_queries_unanswered_idx on help_queries (answered, created_at desc);

do $$
declare t text;
begin
  foreach t in array array['support_tickets','support_messages','help_queries'] loop
    execute format('drop trigger if exists set_updated_at on public.%I', t);
    execute format('create trigger set_updated_at before update on public.%I for each row execute function set_updated_at()', t);
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- Users read their own tickets/messages (for live updates); staff read all. Writes go through the API.
drop policy if exists "own tickets" on support_tickets;
create policy "own tickets" on support_tickets for select using (user_id = auth.uid() or is_staff());
drop policy if exists "own ticket messages" on support_messages;
create policy "own ticket messages" on support_messages for select using (
  is_staff() or exists (select 1 from support_tickets t where t.id = ticket_id and t.user_id = auth.uid())
);
-- help_queries: service role only (no policies).

do $$
begin
  alter publication supabase_realtime add table support_messages;
exception when duplicate_object then null;
end $$;

-- ---------------------------------------------------------------------------
-- Storage limits: uploads are capped at 10 MB and restricted to safe types.
-- ---------------------------------------------------------------------------
update storage.buckets
set file_size_limit = 10485760,
    allowed_mime_types = array['image/png','image/jpeg','image/webp','image/gif','application/pdf','text/plain','text/markdown','application/zip']
where id = 'submissions';
update storage.buckets set file_size_limit = 5242880, allowed_mime_types = array['image/png','image/jpeg','image/webp'] where id = 'avatars';
update storage.buckets set file_size_limit = 10485760, allowed_mime_types = array['application/pdf'] where id = 'certificates';
