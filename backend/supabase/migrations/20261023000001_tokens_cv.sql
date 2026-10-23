-- Token wallet (spent on AI tools such as the CV builder) and the CV builder itself.
-- Balances only change through spend_tokens / credit_tokens, which the API calls with the
-- service role; every change is recorded in token_ledger.

create table token_packs (
  id text primary key,
  name text not null,
  tokens int not null check (tokens > 0),
  amount_kobo int not null check (amount_kobo > 0),
  sort_order int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table token_wallets (
  user_id uuid primary key references profiles(id) on delete cascade,
  balance int not null default 0 check (balance >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table token_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  delta int not null check (delta <> 0),
  balance_after int not null,
  reason text not null check (reason in ('purchase','cv_generate','refund','admin_grant','welcome')),
  -- Idempotency key per reason (payment reference, spend id being refunded, ...).
  ref text,
  meta jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index on token_ledger (user_id, created_at desc);
create unique index token_ledger_reason_ref on token_ledger (reason, ref) where ref is not null;

create table token_purchases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  pack_id text not null references token_packs(id),
  reference text not null unique,
  tokens int not null,
  amount_kobo int not null,
  currency text not null default 'NGN',
  status text not null default 'pending' check (status in ('pending','success','failed','abandoned')),
  channel text,
  paid_at timestamptz,
  paystack_transaction_id bigint,
  verified_via text check (verified_via in ('verify','webhook')),
  raw jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on token_purchases (user_id);

create table cv_documents (
  user_id uuid primary key references profiles(id) on delete cascade,
  content jsonb not null,
  target_role text,
  generated_at timestamptz,
  generation_count int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
declare t text;
begin
  foreach t in array array['token_packs','token_wallets','token_purchases','cv_documents']
  loop
    execute format('create trigger set_updated_at before update on %I for each row execute function set_updated_at()', t);
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;
alter table token_ledger enable row level security;

create policy "catalogue readable" on token_packs for select using (true);
create policy "own wallet" on token_wallets for select using (user_id = auth.uid());
create policy "own ledger" on token_ledger for select using (user_id = auth.uid());
create policy "own token purchases" on token_purchases for select using (user_id = auth.uid());
create policy "own cv" on cv_documents for select using (user_id = auth.uid());

-- Atomically debits a wallet. Raises INSUFFICIENT_TOKENS (P0001) when the balance is too low.
create or replace function spend_tokens(p_user uuid, p_amount int, p_reason text, p_ref text, p_meta jsonb default '{}')
returns int language plpgsql security definer set search_path = public as $$
declare new_balance int;
begin
  if p_amount <= 0 then raise exception 'amount must be positive'; end if;
  update token_wallets set balance = balance - p_amount where user_id = p_user and balance >= p_amount
    returning balance into new_balance;
  if new_balance is null then raise exception 'INSUFFICIENT_TOKENS'; end if;
  insert into token_ledger (user_id, delta, balance_after, reason, ref, meta)
    values (p_user, -p_amount, new_balance, p_reason, p_ref, coalesce(p_meta, '{}'));
  return new_balance;
end $$;

-- Credits a wallet once per (reason, ref); a repeat call is a no-op returning the current balance.
create or replace function credit_tokens(p_user uuid, p_amount int, p_reason text, p_ref text, p_meta jsonb default '{}')
returns int language plpgsql security definer set search_path = public as $$
declare entry uuid; new_balance int;
begin
  if p_amount <= 0 then raise exception 'amount must be positive'; end if;
  insert into token_ledger (user_id, delta, balance_after, reason, ref, meta)
    values (p_user, p_amount, 0, p_reason, p_ref, coalesce(p_meta, '{}'))
    on conflict (reason, ref) where ref is not null do nothing
    returning id into entry;
  if entry is null then
    select balance into new_balance from token_wallets where user_id = p_user;
    return coalesce(new_balance, 0);
  end if;
  insert into token_wallets (user_id, balance) values (p_user, p_amount)
    on conflict (user_id) do update set balance = token_wallets.balance + excluded.balance
    returning balance into new_balance;
  update token_ledger set balance_after = new_balance where id = entry;
  return new_balance;
end $$;

revoke execute on function spend_tokens(uuid, int, text, text, jsonb) from public, anon, authenticated;
revoke execute on function credit_tokens(uuid, int, text, text, jsonb) from public, anon, authenticated;
grant execute on function spend_tokens(uuid, int, text, text, jsonb) to service_role;
grant execute on function credit_tokens(uuid, int, text, text, jsonb) to service_role;

insert into token_packs (id, name, tokens, amount_kobo, sort_order) values
  ('starter','Starter Pack',1500,250000,1),
  ('pro','Sprint Pro',4000,500000,2),
  ('heavy','Heavy Builder',10000,1000000,3);

-- cost: tokens per AI CV generation. welcome: one-off tokens on a user's first wallet visit (0 = off).
insert into feature_flags (key, enabled, value) values
  ('cv_builder', true, '{"cost":50,"welcome":0}')
on conflict (key) do nothing;
