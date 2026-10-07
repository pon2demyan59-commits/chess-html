(() => {
 function withTimeout(operation,ms=8000){let timer;return Promise.race([Promise.resolve(operation),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Network timeout')),ms)})]).finally(()=>clearTimeout(timer))}
 function restorePosition(current,row){
  const target=row.fen==='start'?new Chess().fen():row.fen;
  if(Array.isArray(row.move_history)){
   const restored=new Chess(row.start_fen||undefined);
   for(const move of row.move_history)restored.move(move);
   if(restored.fen()!==target)throw new Error('Server history does not match position');
   return restored;
  }
  if(current.fen()===target)return current;
  if(row.last_move){try{const next=new Chess(current.history({verbose:true})[0]?.before||current.fen());for(const m of current.history({verbose:true}))next.move({from:m.from,to:m.to,promotion:m.promotion});next.move(row.last_move);if(next.fen()===target)return next}catch{}}
  // Old position-only matches cannot recover history that the old server discarded.
  return new Chess(target);
 }
 function clockSnapshot(row,serverNow,monotonicNow){
  const started=Date.parse(row.turn_started_at),now=Date.parse(serverNow);
  if(!Number.isFinite(started)||!Number.isFinite(now))throw new Error('Invalid server clock');
  return {row,elapsed:Math.max(0,now-started),received:monotonicNow};
 }
 function clockTimes(snapshot,monotonicNow){
  const {row}=snapshot;const elapsed=row.status==='active'?snapshot.elapsed+Math.max(0,monotonicNow-snapshot.received):0;
  let white=row.clock_type==='per_move'&&row.status==='active'?row.initial_seconds*1000:Number(row.white_time_ms),black=row.clock_type==='per_move'&&row.status==='active'?row.initial_seconds*1000:Number(row.black_time_ms);
  if(row.status==='active'){if(row.turn==='white')white-=elapsed;else black-=elapsed}
  return {white:Math.max(0,white),black:Math.max(0,black)};
 }
 globalThis.ChessOnlineState={withTimeout,restorePosition,clockSnapshot,clockTimes};
})();
