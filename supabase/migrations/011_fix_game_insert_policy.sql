-- Fix: allow game creation when accepting an invite
-- The existing policy only allows auth.uid() = player1_id,
-- but when player2 accepts an invite, the API inserts with
-- player1_id = the inviting player. Allow either participant.

drop policy "Authenticated users can create games" on games;
create policy "Authenticated users can create games"
  on games for insert to authenticated
  with check (auth.uid() = player1_id or auth.uid() = player2_id);
