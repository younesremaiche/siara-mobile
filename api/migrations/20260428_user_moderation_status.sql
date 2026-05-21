-- Adds a moderation_status column to auth.users so admins can warn / suspend /
-- ban users without losing the meaning of is_active. Existing rows default to
-- 'active' which keeps current behavior unchanged.

alter table auth.users
  add column if not exists moderation_status text not null default 'active';

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'auth_users_moderation_status_check'
       and conrelid = 'auth.users'::regclass
  ) then
    alter table auth.users
      add constraint auth_users_moderation_status_check
      check (moderation_status in ('active', 'warned', 'suspended', 'banned'));
  end if;
end $$;

create index if not exists auth_users_moderation_status_idx
  on auth.users (moderation_status);
