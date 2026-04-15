-- ============================================================
-- Migration 008: Allow camera devices to mark pairings as expired (disconnect)
-- ============================================================
-- The camera device (anon or authenticated) needs to update a paired
-- row to expired when disconnecting.

create policy "camera_pairings_anon_disconnect"
  on camera_pairings for update to anon
  using (status = 'paired')
  with check (status = 'expired');

create policy "camera_pairings_authenticated_disconnect"
  on camera_pairings for update to authenticated
  using (status = 'paired')
  with check (status = 'expired');
