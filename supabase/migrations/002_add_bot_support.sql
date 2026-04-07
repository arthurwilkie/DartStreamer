-- Add bot support: bot_level on games, bot player record

-- Allow non-auth players (for bot player)
ALTER TABLE players DROP CONSTRAINT IF EXISTS players_id_fkey;

-- Insert bot player with well-known UUID
INSERT INTO players (id, display_name, avatar_url)
VALUES ('00000000-0000-0000-0000-000000000000', 'DartBot', NULL)
ON CONFLICT (id) DO NOTHING;

-- Add bot_level to games (NULL = human vs human)
ALTER TABLE games ADD COLUMN IF NOT EXISTS bot_level int;

-- Allow authenticated users to insert turns for the bot in bot games
DROP POLICY IF EXISTS "Players can insert their own turns" ON turns;
CREATE POLICY "Players can insert turns" ON turns
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = player_id
    OR EXISTS (
      SELECT 1 FROM games
      WHERE games.id = game_id
      AND games.bot_level IS NOT NULL
      AND (games.player1_id = auth.uid() OR games.player2_id = auth.uid())
    )
  );
