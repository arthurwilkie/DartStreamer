-- ============================================================
-- Migration 005: Allow anonymous camera devices to create and poll pairings
-- ============================================================
-- The camera device (/camera page) is unauthenticated. It needs to:
--   1. INSERT a pairing row (code + status=pending, no player_id)
--   2. SELECT its own row to poll whether the code has been claimed

-- Anonymous insert: only allow inserting with status='pending' and no player_id
create policy "camera_pairings_anon_insert"
  on camera_pairings for insert to anon
  with check (status = 'pending' and player_id is null);

-- Anonymous select: camera device polls by pairing_code
create policy "camera_pairings_anon_select"
  on camera_pairings for select to anon
  using (true);
