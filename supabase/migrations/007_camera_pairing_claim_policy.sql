-- ============================================================
-- Migration 007: Allow authenticated users to claim pending camera pairings
-- ============================================================
-- When the scoring device claims a pairing code, it needs to UPDATE
-- a row where player_id is currently null. The existing "writable by owner"
-- policy requires auth.uid() = player_id, which fails on unclaimed rows.

create policy "camera_pairings_claim_pending"
  on camera_pairings for update to authenticated
  using (status = 'pending' and player_id is null)
  with check (status = 'paired' and player_id = auth.uid());
