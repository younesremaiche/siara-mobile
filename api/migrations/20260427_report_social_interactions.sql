create extension if not exists pgcrypto;

alter table app.accident_reports
  add column if not exists comments_count integer not null default 0,
  add column if not exists likes_count integer not null default 0,
  add column if not exists saw_it_too_count integer not null default 0,
  add column if not exists last_commented_at timestamptz;

create table if not exists app.report_comments (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references app.accident_reports(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  body text not null,
  is_deleted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists app.report_reactions (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references app.accident_reports(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  reaction_type varchar(30) not null check (reaction_type in ('like', 'saw_it_too')),
  created_at timestamptz not null default now(),
  constraint uq_report_reaction_once unique (report_id, user_id, reaction_type)
);

create index if not exists report_comments_report_id_created_at_idx
  on app.report_comments (report_id, created_at desc);

create index if not exists report_comments_user_id_idx
  on app.report_comments (user_id);

create index if not exists report_reactions_report_id_idx
  on app.report_reactions (report_id);

create index if not exists report_reactions_user_id_idx
  on app.report_reactions (user_id);

create index if not exists report_reactions_report_id_type_idx
  on app.report_reactions (report_id, reaction_type);
