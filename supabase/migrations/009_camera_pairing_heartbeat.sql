-- ============================================================
-- Migration 009: Add heartbeat column for camera disconnect detection
-- ============================================================

alter table camera_pairings
  add column if not exists last_heartbeat timestamptz;
