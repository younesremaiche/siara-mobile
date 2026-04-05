create extension if not exists pgcrypto;

create table if not exists app.report_ml_predictions (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references app.accident_reports (id) on delete cascade,
  model_name text not null,
  model_version text not null,
  predicted_label text,
  spam_score numeric(5, 2),
  real_score numeric(5, 2),
  confidence_score numeric(5, 2),
  threshold_used numeric(5, 2),
  inference_status text not null default 'pending',
  raw_response jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table if exists app.accident_reports
  add column if not exists ml_status text,
  add column if not exists latest_predicted_label text,
  add column if not exists latest_spam_score numeric(5, 2),
  add column if not exists latest_ml_confidence numeric(5, 2),
  add column if not exists latest_model_version text,
  add column if not exists latest_classified_at timestamptz,
  add column if not exists review_verdict text,
  add column if not exists reviewed_by uuid,
  add column if not exists reviewed_at timestamptz,
  add column if not exists review_notes text;

alter table if exists auth.users
  add column if not exists trust_score numeric(5, 2),
  add column if not exists trust_last_updated_at timestamptz;

create index if not exists report_ml_predictions_report_id_idx
  on app.report_ml_predictions (report_id, created_at desc);

create index if not exists accident_reports_ml_status_idx
  on app.accident_reports (ml_status);

create index if not exists accident_reports_latest_predicted_label_idx
  on app.accident_reports (latest_predicted_label);

create index if not exists accident_reports_latest_spam_score_idx
  on app.accident_reports (latest_spam_score desc nulls last);

create index if not exists accident_reports_review_verdict_idx
  on app.accident_reports (review_verdict);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'report_ml_predictions_predicted_label_check'
      and conrelid = 'app.report_ml_predictions'::regclass
  ) then
    alter table app.report_ml_predictions
      add constraint report_ml_predictions_predicted_label_check
      check (predicted_label is null or predicted_label in ('spam', 'real'));
  end if;
end $$;
