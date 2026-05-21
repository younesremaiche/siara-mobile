-- 20260430_travel_histories.sql
-- "My Travel History" feature: store completed route-guidance trips per user.

create extension if not exists pgcrypto;

create table if not exists app.travel_histories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,

  origin_name text,
  origin_lat double precision not null,
  origin_lng double precision not null,

  destination_name text,
  destination_lat double precision not null,
  destination_lng double precision not null,

  route_type text,
  started_at timestamptz not null,
  arrived_at timestamptz,
  duration_seconds integer,
  distance_km numeric(10, 2),

  overall_risk_percent numeric(5, 2),
  overall_risk_level text,

  route_snapshot jsonb not null default '{}'::jsonb,
  segments_snapshot jsonb not null default '[]'::jsonb,

  rating smallint check (rating between 1 and 5),
  feedback_text text,

  created_at timestamptz not null default now()
);

create index if not exists idx_travel_histories_user_created
  on app.travel_histories (user_id, created_at desc);
