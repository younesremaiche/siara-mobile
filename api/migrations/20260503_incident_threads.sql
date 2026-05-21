-- Phase 12: duplicate report linking via incident threads.
-- Adds two new tables. Existing reports are unaffected.

CREATE TABLE IF NOT EXISTS app.incident_threads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  primary_report_id UUID NOT NULL REFERENCES app.accident_reports(id) ON DELETE CASCADE,
  created_by UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  member_count INT NOT NULL DEFAULT 1,
  notes TEXT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS incident_threads_primary_report_idx
  ON app.incident_threads(primary_report_id);

CREATE TABLE IF NOT EXISTS app.incident_thread_reports (
  thread_id UUID NOT NULL REFERENCES app.incident_threads(id) ON DELETE CASCADE,
  report_id UUID NOT NULL REFERENCES app.accident_reports(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'related' CHECK (role IN ('primary', 'related')),
  added_by UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (thread_id, report_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS incident_thread_reports_unique_report_idx
  ON app.incident_thread_reports(report_id);

CREATE INDEX IF NOT EXISTS incident_thread_reports_thread_idx
  ON app.incident_thread_reports(thread_id);
