-- Test accounts (automated smoke tests, @example.com) are never matched into squads with real people.
alter table profiles add column if not exists is_test boolean not null default false;
update profiles p set is_test = true
from auth.users u
where u.id = p.id and u.email ilike '%@example.com' and not p.is_test;

-- New @example.com accounts (smoke tests) are flagged as soon as their profile is created.
create or replace function flag_test_profile() returns trigger language plpgsql security definer set search_path = public, auth as $$
begin
  if exists (select 1 from auth.users u where u.id = new.id and u.email ilike '%@example.com') then
    new.is_test := true;
  end if;
  return new;
end $$;
drop trigger if exists profiles_flag_test on profiles;
create trigger profiles_flag_test before insert on profiles for each row execute function flag_test_profile();
