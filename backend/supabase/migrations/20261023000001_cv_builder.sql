-- AI résumé builder (Profile → AI résumé). Drafts are paid from the existing token wallet at the
-- `cv_generate` price in token_prices (admins can change it in Admin → Tokens); editing is free.
-- Ported from the development branch's CV builder, which had its own wallet: this uses the shared one.

create table if not exists cv_documents (
  user_id uuid primary key references profiles(id) on delete cascade,
  content jsonb not null,
  target_role text,
  generated_at timestamptz,
  generation_count int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists set_updated_at on public.cv_documents;
create trigger set_updated_at before update on public.cv_documents for each row execute function set_updated_at();
alter table public.cv_documents enable row level security;
drop policy if exists "own cv" on cv_documents;
create policy "own cv" on cv_documents for select using (user_id = auth.uid());

insert into token_prices (action, label, tool, cost, description, sort_order) values
  ('cv_generate', 'AI résumé draft', 'Résumé Builder', 50, 'Writes your résumé from your verified tests, projects and certificate.', 6)
on conflict (action) do nothing;
