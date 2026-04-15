-- ============================================================
-- Migration 006: Allow authenticated users to create camera pairings
-- ============================================================
-- The existing "Camera pairings writable by owner" policy uses
-- auth.uid() = player_id, which blocks inserts where player_id
-- is null (i.e. when the camera device creates the code).
-- This happens when the user opens /camera in the same browser
-- they are logged into.

create policy "camera_pairings_authenticated_insert"
  on camera_pairings for insert to authenticated
  with check (status = 'pending' and player_id is null);
