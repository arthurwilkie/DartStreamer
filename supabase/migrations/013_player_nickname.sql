-- Add optional short nickname for players (shown in scoreboards/broadcasts)
alter table players add column if not exists nickname text;
