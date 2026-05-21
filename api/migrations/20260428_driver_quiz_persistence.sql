create extension if not exists pgcrypto;

create table if not exists app.driver_quiz_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  quiz_version text,
  status text not null default 'in_progress'
    check (status in ('in_progress', 'completed', 'abandoned')),
  total_questions integer,
  answered_questions integer not null default 0,
  raw_score numeric(8, 2),
  max_score numeric(8, 2),
  risk_score numeric(5, 2),
  result_label text,
  result_title text,
  result_description text,
  recommendation_description text,
  category_scores jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists driver_quiz_attempts_user_id_idx
  on app.driver_quiz_attempts (user_id, completed_at desc nulls last, created_at desc);
create index if not exists driver_quiz_attempts_status_idx
  on app.driver_quiz_attempts (status);

create table if not exists app.driver_quiz_responses (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references app.driver_quiz_attempts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  question_id text not null,
  question_text text,
  question_category text,
  selected_option_id text,
  selected_option_text text,
  selected_value text,
  risk_points numeric(8, 2),
  max_points numeric(8, 2),
  answer_snapshot jsonb not null default '{}'::jsonb,
  answered_at timestamptz not null default now(),
  constraint uq_driver_quiz_response_attempt_question
    unique (attempt_id, question_id)
);

create index if not exists driver_quiz_responses_attempt_id_idx
  on app.driver_quiz_responses (attempt_id);
create index if not exists driver_quiz_responses_user_id_idx
  on app.driver_quiz_responses (user_id);

create table if not exists app.user_driver_quiz_profile (
  user_id uuid primary key references auth.users(id) on delete cascade,
  latest_attempt_id uuid references app.driver_quiz_attempts(id) on delete set null,
  latest_risk_score numeric(5, 2),
  latest_result_label text,
  latest_result_title text,
  latest_result_description text,
  latest_recommendation_description text,
  category_scores jsonb not null default '{}'::jsonb,
  completed_attempts_count integer not null default 0,
  best_risk_score numeric(5, 2),
  worst_risk_score numeric(5, 2),
  average_risk_score numeric(5, 2),
  last_completed_at timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists user_driver_quiz_profile_latest_attempt_idx
  on app.user_driver_quiz_profile (latest_attempt_id);
