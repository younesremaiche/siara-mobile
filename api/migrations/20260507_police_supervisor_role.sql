-- Migration: 20260507_police_supervisor_role
-- Purpose: Add police_supervisor role to support operational supervision hierarchy

-- Insert police_supervisor role (idempotent)
INSERT INTO auth.roles (name)
SELECT 'police_supervisor'
WHERE NOT EXISTS (
  SELECT 1 FROM auth.roles WHERE LOWER(name) = 'police_supervisor'
);
