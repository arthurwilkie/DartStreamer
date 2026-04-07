-- Players (extends Supabase auth.users)
create table players (
  id uuid primary key references auth.users(id),
  display_name text not null,
  avatar_url text,
  stream_key_encrypted text,
  created_at timestamptz default now()
);

-- Sessions (streaming sessions spanning multiple games)
create table sessions (
  id uuid primary key default gen_random_uuid(),
  created_by uuid references players(id),
  started_at timestamptz default now(),
  ended_at timestamptz,
  stream_status text default 'idle' check (stream_status in ('idle', 'live', 'ended'))
);

-- Games
create table games (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references sessions(id),
  mode text not null check (mode in ('501', '301', 'cricket')),
  player1_id uuid references players(id),
  player2_id uuid references players(id),
  current_player_id uuid references players(id),
  current_round int default 1,
  winner_id uuid references players(id),
  status text default 'waiting' check (status in ('waiting', 'active', 'finished')),
  created_at timestamptz default now(),
  finished_at timestamptz
);

-- Turns (per-dart detail is MANDATORY)
create table turns (
  id uuid primary key default gen_random_uuid(),
  game_id uuid references games(id) on delete cascade,
  player_id uuid references players(id),
  round_number int not null,
  score_entered int not null,
  darts_detail jsonb not null,
  is_edited boolean default false,
  created_at timestamptz default now()
);

-- Statistics (per player per mode, with running totals)
create table statistics (
  player_id uuid references players(id),
  game_mode text not null check (game_mode in ('501', '301', 'cricket')),
  primary key (player_id, game_mode),
  total_score_sum int default 0,
  total_darts_thrown int default 0,
  total_rounds int default 0,
  first_9_score_sum int default 0,
  first_9_darts int default 0,
  first_9_rounds int default 0,
  checkout_attempts int default 0,
  checkout_successes int default 0,
  three_dart_avg numeric generated always as (
    case when total_darts_thrown > 0 then total_score_sum::numeric / total_darts_thrown * 3 else 0 end
  ) stored,
  first_9_avg numeric generated always as (
    case when first_9_darts > 0 then first_9_score_sum::numeric / first_9_darts * 3 else 0 end
  ) stored,
  checkout_pct numeric generated always as (
    case when checkout_attempts > 0 then checkout_successes::numeric / checkout_attempts * 100 else 0 end
  ) stored,
  highest_checkout int default 0,
  wins int default 0,
  losses int default 0,
  best_leg int,
  count_180 int default 0,
  ton_plus int default 0,
  marks_per_round_sum int default 0,
  marks_per_round_rounds int default 0,
  marks_per_round numeric generated always as (
    case when marks_per_round_rounds > 0 then marks_per_round_sum::numeric / marks_per_round_rounds else 0 end
  ) stored,
  games_played int default 0,
  updated_at timestamptz default now()
);

-- Camera pairings (ephemeral)
create table camera_pairings (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references sessions(id),
  player_id uuid references players(id),
  pairing_code text not null unique,
  status text default 'pending' check (status in ('pending', 'paired', 'expired')),
  mediasoup_producer_id text,
  created_at timestamptz default now(),
  expires_at timestamptz not null
);

-- Enable RLS on all tables
alter table players enable row level security;
alter table sessions enable row level security;
alter table games enable row level security;
alter table turns enable row level security;
alter table statistics enable row level security;
alter table camera_pairings enable row level security;

-- RLS policies: authenticated users can read/write their own data
-- Players: users can read all players (for game display), write own
create policy "Players are viewable by authenticated users"
  on players for select to authenticated using (true);
create policy "Users can update own player record"
  on players for update to authenticated using (auth.uid() = id);
create policy "Users can insert own player record"
  on players for insert to authenticated with check (auth.uid() = id);

-- Sessions: both players can read/write (2-user app)
create policy "Sessions are viewable by authenticated users"
  on sessions for select to authenticated using (true);
create policy "Authenticated users can create sessions"
  on sessions for insert to authenticated with check (auth.uid() = created_by);
create policy "Session creator can update"
  on sessions for update to authenticated using (auth.uid() = created_by);

-- Games: both players can read, participants can write
create policy "Games are viewable by authenticated users"
  on games for select to authenticated using (true);
create policy "Authenticated users can create games"
  on games for insert to authenticated with check (auth.uid() = player1_id);
create policy "Game participants can update"
  on games for update to authenticated
  using (auth.uid() = player1_id or auth.uid() = player2_id);

-- Turns: readable by all authenticated, writable by turn owner
create policy "Turns are viewable by authenticated users"
  on turns for select to authenticated using (true);
create policy "Players can insert their own turns"
  on turns for insert to authenticated with check (auth.uid() = player_id);
create policy "Players can update their own turns"
  on turns for update to authenticated using (auth.uid() = player_id);

-- Statistics: readable by all, writable by owner
create policy "Statistics are viewable by authenticated users"
  on statistics for select to authenticated using (true);
create policy "Stats update by owner"
  on statistics for all to authenticated using (auth.uid() = player_id);

-- Camera pairings: readable/writable by authenticated
create policy "Camera pairings viewable by authenticated"
  on camera_pairings for select to authenticated using (true);
create policy "Camera pairings writable by owner"
  on camera_pairings for all to authenticated using (auth.uid() = player_id);

-- Enable realtime for games and turns tables
alter publication supabase_realtime add table games;
alter publication supabase_realtime add table turns;
