-- ============================================================
-- Migration 010: Allow camera devices to update heartbeat on paired rows
-- ============================================================
-- The disconnect policies (008) only allow changing status to 'expired'.
-- The heartbeat needs to update last_heartbeat while keeping status = 'paired'.

create policy "camera_pairings_anon_heartbeat"
  on camera_pairings for update to anon
  using (status = 'paired')
  with check (status = 'paired');

create policy "camera_pairings_authenticated_heartbeat"
  on camera_pairings for update to authenticated
  using (status = 'paired')
  with check (status = 'paired');
