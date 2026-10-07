CREATE OR REPLACE FUNCTION public.cancel_matchmaking()
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  delete from public.matchmaking_queue where player_id = auth.uid();
$function$

CREATE OR REPLACE FUNCTION public.claim_timeout(p_match_id uuid)
 RETURNS matches
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  me uuid:=auth.uid();
  m public.matches%rowtype;
  elapsed_ms bigint;
  remaining_ms bigint;
  winner_status text;
begin
  if me is null then raise exception 'authentication required'; end if;
  select * into m from public.matches where id=p_match_id for update;
  if m.id is null then raise exception 'match not found'; end if;
  if me<>m.white_id and me<>m.black_id then raise exception 'not a participant'; end if;
  if m.status<>'active' then return m; end if;

  elapsed_ms:=greatest(0,(extract(epoch from (now()-m.turn_started_at))*1000)::bigint);
  if m.clock_type='per_move' then remaining_ms:=m.initial_seconds*1000-elapsed_ms;
  elsif m.turn='white' then remaining_ms:=m.white_time_ms-elapsed_ms;
  else remaining_ms:=m.black_time_ms-elapsed_ms;
  end if;

  if remaining_ms>0 then return m; end if;

  winner_status:=case when m.turn='white' then 'black_won' else 'white_won' end;
  update public.matches
  set status=winner_status,finish_reason='timeout',version=version+1,updated_at=now()
  where id=p_match_id returning * into m;

  if not m.result_scored then
    if winner_status='white_won' then
      update public.pvp_profiles set rating=rating+5,games=games+1,wins=wins+1,updated_at=now() where user_id=m.white_id;
      update public.pvp_profiles set rating=greatest(0,rating-2),games=games+1,losses=losses+1,updated_at=now() where user_id=m.black_id;
    else
      update public.pvp_profiles set rating=rating+5,games=games+1,wins=wins+1,updated_at=now() where user_id=m.black_id;
      update public.pvp_profiles set rating=greatest(0,rating-2),games=games+1,losses=losses+1,updated_at=now() where user_id=m.white_id;
    end if;
    update public.matches set result_scored=true where id=p_match_id returning * into m;
  end if;
  return m;
end;
$function$

CREATE OR REPLACE FUNCTION public.ensure_pvp_profile(p_nickname text)
 RETURNS pvp_profiles
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  me uuid := auth.uid();
  clean_name text;
  p public.pvp_profiles%rowtype;
begin
  if me is null then raise exception 'authentication required'; end if;
  clean_name := left(trim(coalesce(p_nickname,'')),24);
  if char_length(clean_name) < 1 then raise exception 'nickname required'; end if;

  insert into public.pvp_profiles(user_id,nickname)
  values (me,clean_name)
  on conflict (user_id) do update
    set nickname = excluded.nickname,
        updated_at = now()
  returning * into p;

  return p;
end;
$function$

CREATE OR REPLACE FUNCTION public.leave_match(p_match_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  me uuid := auth.uid();
  m public.matches%rowtype;
  winner_id uuid;
  loser_id uuid;
begin
  if me is null then raise exception 'authentication required'; end if;

  select * into m
  from public.matches
  where id = p_match_id
  for update;

  if m.id is null or m.status <> 'active' then return; end if;
  if me <> m.white_id and me <> m.black_id then raise exception 'not a participant'; end if;

  loser_id := me;
  winner_id := case when me = m.white_id then m.black_id else m.white_id end;

  update public.matches
  set status = case when winner_id = m.white_id then 'white_won' else 'black_won' end,
      result_scored = true,
      version = version + 1,
      updated_at = now()
  where id = p_match_id;

  update public.pvp_profiles
  set rating = rating + 5, games = games + 1, wins = wins + 1, updated_at = now()
  where user_id = winner_id;

  update public.pvp_profiles
  set rating = greatest(0, rating - 2), games = games + 1, losses = losses + 1, updated_at = now()
  where user_id = loser_id;
end;
$function$

CREATE OR REPLACE FUNCTION public.submit_match_state(p_match_id uuid, p_fen text, p_last_move jsonb, p_next_turn text, p_status text DEFAULT 'active'::text)
 RETURNS matches
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  me uuid := auth.uid();
  m public.matches%rowtype;
  elapsed_ms bigint;
  mover_remaining bigint;
  timed_out boolean := false;
  timeout_status text;
begin
  if me is null then raise exception 'authentication required'; end if;

  select * into m from public.matches where id=p_match_id for update;
  if m.id is null then raise exception 'match not found'; end if;
  if m.status<>'active' then return m; end if;

  if not ((m.turn='white' and m.white_id=me) or (m.turn='black' and m.black_id=me)) then
    raise exception 'not your turn';
  end if;

  elapsed_ms := greatest(0,(extract(epoch from (now()-m.turn_started_at))*1000)::bigint);
  if m.clock_type='per_move' then
    mover_remaining := (m.initial_seconds*1000)::bigint - elapsed_ms;
  elsif m.turn='white' then
    mover_remaining := m.white_time_ms - elapsed_ms;
  else
    mover_remaining := m.black_time_ms - elapsed_ms;
  end if;

  if mover_remaining<=0 then
    timed_out:=true;
    timeout_status:=case when m.turn='white' then 'black_won' else 'white_won' end;

    update public.matches
    set status=timeout_status,finish_reason='timeout',version=version+1,updated_at=now()
    where id=p_match_id returning * into m;

    if not m.result_scored then
      if timeout_status='white_won' then
        update public.pvp_profiles set rating=rating+5,games=games+1,wins=wins+1,updated_at=now() where user_id=m.white_id;
        update public.pvp_profiles set rating=greatest(0,rating-2),games=games+1,losses=losses+1,updated_at=now() where user_id=m.black_id;
      else
        update public.pvp_profiles set rating=rating+5,games=games+1,wins=wins+1,updated_at=now() where user_id=m.black_id;
        update public.pvp_profiles set rating=greatest(0,rating-2),games=games+1,losses=losses+1,updated_at=now() where user_id=m.white_id;
      end if;
      update public.matches set result_scored=true where id=p_match_id returning * into m;
    end if;
    return m;
  end if;

  if p_next_turn not in ('white','black') or p_next_turn=m.turn then raise exception 'invalid next turn'; end if;
  if p_status not in ('active','white_won','black_won','draw','abandoned') then raise exception 'invalid status'; end if;

  if m.clock_type='total' then
    if m.turn='white' then
      m.white_time_ms := greatest(0,mover_remaining + m.increment_seconds*1000);
    else
      m.black_time_ms := greatest(0,mover_remaining + m.increment_seconds*1000);
    end if;
  else
    m.white_time_ms := m.initial_seconds*1000;
    m.black_time_ms := m.initial_seconds*1000;
  end if;

  update public.matches
  set fen=p_fen,last_move=p_last_move,turn=p_next_turn,status=p_status,
      white_time_ms=m.white_time_ms,black_time_ms=m.black_time_ms,
      turn_started_at=now(),finish_reason=case when p_status='active' then null else 'board' end,
      version=version+1,updated_at=now()
  where id=p_match_id returning * into m;

  if p_status in ('white_won','black_won','draw') and not m.result_scored then
    if p_status='white_won' then
      update public.pvp_profiles set rating=rating+5,games=games+1,wins=wins+1,updated_at=now() where user_id=m.white_id;
      update public.pvp_profiles set rating=greatest(0,rating-2),games=games+1,losses=losses+1,updated_at=now() where user_id=m.black_id;
    elsif p_status='black_won' then
      update public.pvp_profiles set rating=rating+5,games=games+1,wins=wins+1,updated_at=now() where user_id=m.black_id;
      update public.pvp_profiles set rating=greatest(0,rating-2),games=games+1,losses=losses+1,updated_at=now() where user_id=m.white_id;
    else
      update public.pvp_profiles set rating=rating+2.5,games=games+1,draws=draws+1,updated_at=now() where user_id in(m.white_id,m.black_id);
    end if;
    update public.matches set result_scored=true where id=p_match_id returning * into m;
  end if;

  return m;
end;
$function$

