-- ============================================================
-- Migration 004: Streaming UI — invites, favorites, presence
-- ============================================================

-- Session invitations (invite opponent to a streaming session)
create table session_invites (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references sessions(id) on delete cascade,
  from_player_id uuid not null references players(id),
  to_player_id uuid not null references players(id),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default now()
);

-- Game invitations (invite opponent to a specific game)
create table game_invites (
  id uuid primary key default gen_random_uuid(),
  from_player_id uuid not null references players(id),
  to_player_id uuid not null references players(id),
  game_mode text not null check (game_mode in ('501', '301', 'cricket')),
  session_id uuid references sessions(id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default now()
);

-- Favorites list (quick-access opponents)
create table favorites (
  player_id uuid not null references players(id) on delete cascade,
  favorite_id uuid not null references players(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (player_id, favorite_id),
  check (player_id <> favorite_id)
);

-- Online presence (heartbeat-based)
create table player_presence (
  player_id uuid primary key references players(id) on delete cascade,
  last_seen timestamptz not null default now(),
  is_online boolean not null default false
);

-- Extend sessions: add opponent and per-session stream key override
alter table sessions add column if not exists opponent_id uuid references players(id);
alter table sessions add column if not exists stream_key_override text;

-- ============================================================
-- RLS
-- ============================================================
alter table session_invites enable row level security;
alter table game_invites enable row level security;
alter table favorites enable row level security;
alter table player_presence enable row level security;

-- Session invites: sender and receiver can read
create policy "session_invites_select"
  on session_invites for select to authenticated
  using (auth.uid() = from_player_id or auth.uid() = to_player_id);
create policy "session_invites_insert"
  on session_invites for insert to authenticated
  with check (auth.uid() = from_player_id);
create policy "session_invites_update"
  on session_invites for update to authenticated
  using (auth.uid() = to_player_id);

-- Game invites: sender and receiver can read
create policy "game_invites_select"
  on game_invites for select to authenticated
  using (auth.uid() = from_player_id or auth.uid() = to_player_id);
create policy "game_invites_insert"
  on game_invites for insert to authenticated
  with check (auth.uid() = from_player_id);
create policy "game_invites_update"
  on game_invites for update to authenticated
  using (auth.uid() = to_player_id);

-- Favorites: owner only
create policy "favorites_select"
  on favorites for select to authenticated
  using (auth.uid() = player_id);
create policy "favorites_insert"
  on favorites for insert to authenticated
  with check (auth.uid() = player_id);
create policy "favorites_delete"
  on favorites for delete to authenticated
  using (auth.uid() = player_id);

-- Presence: anyone can read, owner can write
create policy "presence_select"
  on player_presence for select to authenticated
  using (true);
create policy "presence_insert"
  on player_presence for insert to authenticated
  with check (auth.uid() = player_id);
create policy "presence_update"
  on player_presence for update to authenticated
  using (auth.uid() = player_id);

-- ============================================================
-- Realtime
-- ============================================================
alter publication supabase_realtime add table session_invites;
alter publication supabase_realtime add table game_invites;
alter publication supabase_realtime add table player_presence;
alter publication supabase_realtime add table camera_pairings;
