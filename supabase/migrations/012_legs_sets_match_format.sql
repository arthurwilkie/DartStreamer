-- Extend games with match format (legs/sets), score variants, and in/out modes
alter table games drop constraint if exists games_mode_check;
alter table games add constraint games_mode_check
  check (mode in ('501', '301', '701', 'cricket', 'custom'));

alter table games add column if not exists match_format text not null default 'legs'
  check (match_format in ('legs', 'sets'));
alter table games add column if not exists target int not null default 1;
alter table games add column if not exists starting_score int;
alter table games add column if not exists in_mode text not null default 'straight'
  check (in_mode in ('straight', 'double', 'master'));
alter table games add column if not exists out_mode text not null default 'double'
  check (out_mode in ('straight', 'double', 'master'));
alter table games add column if not exists player1_legs int not null default 0;
alter table games add column if not exists player2_legs int not null default 0;
alter table games add column if not exists player1_sets int not null default 0;
alter table games add column if not exists player2_sets int not null default 0;
alter table games add column if not exists current_leg int not null default 1;
alter table games add column if not exists current_set int not null default 1;
alter table games add column if not exists leg_starter_id uuid references players(id);

-- Backfill starting_score and in_mode based on old mode for existing games
update games set starting_score = 501, in_mode = 'straight' where mode = '501' and starting_score is null;
update games set starting_score = 301, in_mode = 'double' where mode = '301' and starting_score is null;
update games set leg_starter_id = player1_id where leg_starter_id is null and player1_id is not null;

-- Leg/set tracking on turns (so stats & history can segment)
alter table turns add column if not exists leg_number int not null default 1;
alter table turns add column if not exists set_number int not null default 1;

-- Mirror new settings on game invites so accept creates a game with the right format
alter table game_invites drop constraint if exists game_invites_game_mode_check;
alter table game_invites add constraint game_invites_game_mode_check
  check (game_mode in ('501', '301', '701', 'cricket', 'custom'));

alter table game_invites add column if not exists match_format text not null default 'legs'
  check (match_format in ('legs', 'sets'));
alter table game_invites add column if not exists target int not null default 1;
alter table game_invites add column if not exists starting_score int;
alter table game_invites add column if not exists in_mode text not null default 'straight'
  check (in_mode in ('straight', 'double', 'master'));
alter table game_invites add column if not exists out_mode text not null default 'double'
  check (out_mode in ('straight', 'double', 'master'));
