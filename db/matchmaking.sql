-- Queue heartbeat expires after 20 seconds; the browser polls every 1.2 seconds.
create schema if not exists private;
alter table public.matchmaking_queue add column if not exists accept_any boolean not null default false;
CREATE OR REPLACE FUNCTION private.find_match_internal(p_nickname text, p_time_control text)
 RETURNS TABLE(state text, match_id uuid, color text, opponent_nickname text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  me uuid:=auth.uid(); opponent public.matchmaking_queue%rowtype;
  existing_match public.matches%rowtype; new_match public.matches%rowtype;
  me_is_white boolean; clean_name text; my_rating numeric(10,1);
  accept_all boolean; tc text; clock_kind text; initial_s integer; increment_s integer;
begin
  if me is null then raise exception 'authentication required'; end if;
  clean_name:=left(trim(coalesce(p_nickname,'')),24);
  if char_length(clean_name)<1 then raise exception 'nickname required'; end if;
  perform pg_advisory_xact_lock(74382109);
  accept_all:=coalesce(p_time_control='any',false);
  tc:=case when accept_all then 'blitz5_3' else coalesce(p_time_control,'standard30') end;
  if tc not in ('blitz3_2','blitz5_0','blitz5_3','rapid10_0','rapid10_5','rapid15_10','standard30') then raise exception 'invalid time control'; end if;


  insert into public.pvp_profiles(user_id,nickname) values(me,clean_name)
  on conflict(user_id) do update set nickname=excluded.nickname,updated_at=now();
  select rating into my_rating from public.pvp_profiles where user_id=me;

  select * into existing_match from public.matches
  where status='active' and (white_id=me or black_id=me)
  order by created_at desc limit 1;
  if existing_match.id is not null then
    delete from public.matchmaking_queue where player_id=me;
    return query select 'matched'::text,existing_match.id,
      case when existing_match.white_id=me then 'white' else 'black' end,
      case when existing_match.white_id=me then existing_match.black_nickname else existing_match.white_nickname end;
    return;
  end if;

  delete from public.matchmaking_queue where joined_at<now()-interval '20 seconds';
  select q.* into opponent from public.matchmaking_queue q
  left join public.pvp_profiles p on p.user_id=q.player_id
  where q.player_id<>me and (accept_all or q.accept_any or q.time_control=tc)
  order by abs(coalesce(p.rating,0)-coalesce(my_rating,0)),q.joined_at
  for update of q skip locked limit 1;

  if opponent.player_id is null then
    insert into public.matchmaking_queue(player_id,nickname,joined_at,time_control,accept_any)
    values(me,clean_name,now(),tc,accept_all)
    on conflict(player_id) do update set nickname=excluded.nickname,joined_at=excluded.joined_at,time_control=excluded.time_control,accept_any=excluded.accept_any;
    return query select 'waiting'::text,null::uuid,null::text,null::text; return;
  end if;

  if accept_all then tc:=opponent.time_control; end if;
  if tc='blitz3_2' then clock_kind:='total';initial_s:=180;increment_s:=2;
  elsif tc='blitz5_0' then clock_kind:='total';initial_s:=300;increment_s:=0;
  elsif tc='blitz5_3' then clock_kind:='total';initial_s:=300;increment_s:=3;
  elsif tc='rapid10_0' then clock_kind:='total';initial_s:=600;increment_s:=0;
  elsif tc='rapid10_5' then clock_kind:='total';initial_s:=600;increment_s:=5;
  elsif tc='rapid15_10' then clock_kind:='total';initial_s:=900;increment_s:=10;
  else clock_kind:='per_move';initial_s:=30;increment_s:=0; end if;

  delete from public.matchmaking_queue where player_id in(me,opponent.player_id);
  me_is_white:=random()<0.5;
  if me_is_white then
    insert into public.matches(white_id,black_id,white_nickname,black_nickname,fen,turn,status,time_control,clock_type,initial_seconds,increment_seconds,white_time_ms,black_time_ms,turn_started_at)
    values(me,opponent.player_id,clean_name,opponent.nickname,'start','white','active',tc,clock_kind,initial_s,increment_s,initial_s*1000,initial_s*1000,now())
    returning * into new_match;
    return query select 'matched'::text,new_match.id,'white'::text,opponent.nickname;
  else
    insert into public.matches(white_id,black_id,white_nickname,black_nickname,fen,turn,status,time_control,clock_type,initial_seconds,increment_seconds,white_time_ms,black_time_ms,turn_started_at)
    values(opponent.player_id,me,opponent.nickname,clean_name,'start','white','active',tc,clock_kind,initial_s,increment_s,initial_s*1000,initial_s*1000,now())
    returning * into new_match;
    return query select 'matched'::text,new_match.id,'black'::text,opponent.nickname;
  end if;
end;
$function$

revoke all on function private.find_match_internal(text,text) from public,anon;
grant usage on schema private to authenticated;
grant execute on function private.find_match_internal(text,text) to authenticated;
create or replace function public.find_match(p_nickname text,p_time_control text)
returns table(state text,match_id uuid,color text,opponent_nickname text)
language sql security invoker set search_path='' as $$
select * from private.find_match_internal(p_nickname,p_time_control);
$$;
revoke all on function public.find_match(text,text) from public,anon;
grant execute on function public.find_match(text,text) to authenticated;

create or replace function private.queue_counts_internal()
returns table(time_control text,players bigint)
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'authentication required'; end if;
 return query select q.time_control,count(*) from public.matchmaking_queue q
 where q.joined_at>now()-interval '20 seconds' and not q.accept_any group by q.time_control
 union all select 'any'::text,count(*) from public.matchmaking_queue q
 where q.joined_at>now()-interval '20 seconds' and q.accept_any;
end;
$$;
revoke all on function private.queue_counts_internal() from public,anon;
grant execute on function private.queue_counts_internal() to authenticated;
create or replace function public.get_queue_counts()
returns table(time_control text,players bigint)
language sql security invoker set search_path='' as $$
select * from private.queue_counts_internal();
$$;
revoke all on function public.get_queue_counts() from public,anon;
grant execute on function public.get_queue_counts() to authenticated;

