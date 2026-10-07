-- Reproducible PvP schema. Apply before legacy-functions.sql and matchmaking.sql.
create schema if not exists private;
create table if not exists public.pvp_profiles(user_id uuid primary key references auth.users on delete cascade,nickname text not null check(char_length(nickname) between 1 and 24),rating numeric not null default 0 check(rating>=0),games integer not null default 0,wins integer not null default 0,draws integer not null default 0,losses integer not null default 0,updated_at timestamptz not null default now());
create table if not exists public.matchmaking_queue(player_id uuid primary key references auth.users on delete cascade,nickname text not null,joined_at timestamptz not null default now(),time_control text not null default 'standard30',accept_any boolean not null default false);
create table if not exists public.matches(id uuid primary key default gen_random_uuid(),white_id uuid not null references auth.users,black_id uuid not null references auth.users,white_nickname text not null,black_nickname text not null,fen text not null default 'start',last_move jsonb,turn text not null default 'white',status text not null default 'active',version bigint not null default 0,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),result_scored boolean not null default false,time_control text not null default 'standard30',clock_type text not null default 'per_move',initial_seconds integer not null default 30,increment_seconds integer not null default 0,white_time_ms bigint not null default 30000,black_time_ms bigint not null default 30000,turn_started_at timestamptz not null default now(),finish_reason text);
alter table public.pvp_profiles enable row level security;
alter table public.matchmaking_queue enable row level security;
alter table public.matches enable row level security;
revoke all on public.pvp_profiles,public.matchmaking_queue,public.matches from anon,authenticated;
grant select on public.pvp_profiles,public.matches to authenticated;
grant all on public.pvp_profiles,public.matchmaking_queue,public.matches to service_role;
drop policy if exists pvp_profile_read_own on public.pvp_profiles;
create policy pvp_profile_read_own on public.pvp_profiles for select to authenticated using(user_id=(select auth.uid()));
drop policy if exists matches_read_participants on public.matches;
create policy matches_read_participants on public.matches for select to authenticated using((select auth.uid()) in(white_id,black_id));
create index if not exists matchmaking_queue_joined_idx on public.matchmaking_queue(joined_at);
create index if not exists matches_white_active_idx on public.matches(white_id) where status='active';
create index if not exists matches_black_active_idx on public.matches(black_id) where status='active';
-- Realtime delivery is optional; the client also polls authoritative snapshots.
do $$ begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime') and not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='matches') then alter publication supabase_realtime add table public.matches; end if;
end $$;
