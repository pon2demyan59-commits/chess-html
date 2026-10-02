create table if not exists private.player_presence (
 user_id uuid primary key references auth.users(id) on delete cascade,
 last_seen timestamptz not null default now()
);
alter table private.player_presence enable row level security;
revoke all on private.player_presence from public,anon,authenticated;
create index if not exists player_presence_last_seen_idx on private.player_presence(last_seen);
create or replace function private.heartbeat_presence_internal()
returns bigint language plpgsql security definer set search_path='' as $$
declare me uuid:=auth.uid(); players bigint;
begin
 if me is null then raise exception 'authentication required'; end if;
 insert into private.player_presence(user_id,last_seen) values(me,now())
 on conflict(user_id) do update set last_seen=excluded.last_seen;
 select count(*) into players from private.player_presence where last_seen>now()-interval '30 seconds';
 return players;
end;
$$;
revoke all on function private.heartbeat_presence_internal() from public,anon;
grant usage on schema private to authenticated;
grant execute on function private.heartbeat_presence_internal() to authenticated;
create or replace function public.heartbeat_presence()
returns bigint language sql security invoker set search_path='' as $$
select private.heartbeat_presence_internal();
$$;
revoke all on function public.heartbeat_presence() from public,anon;
grant execute on function public.heartbeat_presence() to authenticated;

