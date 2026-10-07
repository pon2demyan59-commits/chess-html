import { createClient } from 'npm:@supabase/supabase-js@2.117.2';
import { restoreMatch, validateMove, timeoutIsDraw } from './rules.js';
const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS'};
const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,'Content-Type':'application/json'}});
Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers:cors});
 if(req.method!=='POST')return reply({error:'Method not allowed'},405);
 const token=req.headers.get('Authorization')?.replace(/^Bearer\s+/i,'');if(!token)return reply({error:'Authentication required'},401);
 const admin=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data:{user},error:authError}=await admin.auth.getUser(token);if(authError||!user)return reply({error:'Invalid session'},401);
 try{
  const input=await req.json();if(!['snapshot','move','timeout','leave'].includes(input.action))return reply({error:'Invalid action'},400);
  const {data:row,error}=await admin.from('matches').select('*').eq('id',input.match_id).single();if(error||!row)return reply({error:'Match not found'},404);
  if(![row.white_id,row.black_id].includes(user.id))return reply({error:'Not a participant'},403);
  if(input.action==='snapshot')return reply({row,server_now:new Date().toISOString()});
  const validated=input.action==='move'?validateMove(row,user.id,input.move):null;
  if(input.action==='move'&&Number(input.version)!==Number(row.version))return reply({error:'Stale position'},409);
  const {data:result,error:commitError}=await admin.rpc('commit_validated_match',{p_actor:user.id,p_match_id:row.id,p_version:row.version,p_action:input.action,p_fen:validated?.fen||null,p_move:validated?.move||null,p_status:validated?.status||null,p_timeout_draw:input.action==='leave'?false:timeoutIsDraw(row)});
  if(commitError)return reply({error:'Position changed; reload the match'},409);
  return reply({row:result,server_now:new Date().toISOString()});
 }catch{return reply({error:'Invalid move or unavailable match history'},400)}
});
