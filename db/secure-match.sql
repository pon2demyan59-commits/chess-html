-- Apply atomically after schema.sql, legacy-functions.sql, matchmaking.sql and online-presence.sql.
-- This migration deliberately disables unvalidated legacy move/timeout writes.
begin;
alter table public.matches add column if not exists move_history jsonb not null default '[]';
alter table public.matches add column if not exists start_fen text;
create or replace function public.commit_validated_match(p_actor uuid,p_match_id uuid,p_version bigint,p_action text,p_fen text,p_move jsonb,p_status text,p_timeout_draw boolean)
returns public.matches language plpgsql security invoker set search_path='' as $$
declare m public.matches%rowtype;elapsed bigint;remaining bigint;winner uuid;loser uuid;outcome text;
begin
 if auth.role()<>'service_role' then raise exception 'trusted server required'; end if;
 select * into m from public.matches where id=p_match_id for update;
 if m.id is null or p_actor not in(m.white_id,m.black_id) then raise exception 'not a participant'; end if;
 if m.status<>'active' then return m; end if;
 if m.version<>p_version then raise exception 'stale position'; end if;
 if p_action not in('move','timeout','leave') then raise exception 'invalid action'; end if;
 elapsed:=greatest(0,(extract(epoch from(clock_timestamp()-m.turn_started_at))*1000)::bigint);
 remaining:=case when m.clock_type='per_move' then m.initial_seconds*1000 when m.turn='white' then m.white_time_ms else m.black_time_ms end-elapsed;
 if p_action='leave' then
  outcome:=case when p_actor=m.white_id then 'black_won' else 'white_won' end;m.finish_reason:='resigned';
 elsif remaining<=0 then
  outcome:=case when p_timeout_draw then 'draw' when m.turn='white' then 'black_won' else 'white_won' end;m.finish_reason:='timeout';if m.turn='white' then m.white_time_ms:=0;else m.black_time_ms:=0;end if;
 elsif p_action='timeout' then return m;
 else
  if (m.turn='white' and p_actor<>m.white_id) or (m.turn='black' and p_actor<>m.black_id) then raise exception 'not your turn'; end if;
  if p_fen is null or p_move is null or p_status not in('active','white_won','black_won','draw') then raise exception 'invalid trusted move'; end if;
  m.fen:=p_fen;m.last_move:=p_move;m.move_history:=m.move_history||jsonb_build_array(p_move);
  if m.clock_type='total' then
   if m.turn='white' then m.white_time_ms:=remaining+m.increment_seconds*1000;else m.black_time_ms:=remaining+m.increment_seconds*1000;end if;
  else m.white_time_ms:=m.initial_seconds*1000;m.black_time_ms:=m.initial_seconds*1000;end if;
  m.turn:=case when m.turn='white' then 'black' else 'white' end;m.turn_started_at:=clock_timestamp();
  outcome:=p_status;m.finish_reason:=case when outcome='active' then null else 'board' end;
 end if;
 if outcome<>'active' and not m.result_scored then
  if outcome='draw' then update public.pvp_profiles set rating=rating+2.5,games=games+1,draws=draws+1,updated_at=clock_timestamp() where user_id in(m.white_id,m.black_id);
  else
   winner:=case when outcome='white_won' then m.white_id else m.black_id end;loser:=case when outcome='white_won' then m.black_id else m.white_id end;
   update public.pvp_profiles set rating=rating+5,games=games+1,wins=wins+1,updated_at=clock_timestamp() where user_id=winner;
   update public.pvp_profiles set rating=greatest(0,rating-2),games=games+1,losses=losses+1,updated_at=clock_timestamp() where user_id=loser;
  end if;m.result_scored:=true;
 end if;
 update public.matches set fen=m.fen,last_move=m.last_move,move_history=m.move_history,turn=m.turn,status=outcome,white_time_ms=m.white_time_ms,black_time_ms=m.black_time_ms,turn_started_at=m.turn_started_at,finish_reason=m.finish_reason,result_scored=m.result_scored,version=version+1,updated_at=clock_timestamp() where id=m.id returning * into m;
 return m;
end;
$$;
revoke all on function public.commit_validated_match(uuid,uuid,bigint,text,text,jsonb,text,boolean) from public,anon,authenticated;
grant execute on function public.commit_validated_match(uuid,uuid,bigint,text,text,jsonb,text,boolean) to service_role;
revoke all on function public.submit_match_state(uuid,text,jsonb,text,text),public.claim_timeout(uuid),public.leave_match(uuid) from public,anon,authenticated;
-- Guest PvP needs no user-editable table access.
revoke insert,update,delete on public.matches,public.pvp_profiles,public.matchmaking_queue from anon,authenticated;
revoke all on function public.ensure_pvp_profile(text),public.cancel_matchmaking() from public,anon;
grant execute on function public.ensure_pvp_profile(text),public.cancel_matchmaking() to authenticated;
commit;
