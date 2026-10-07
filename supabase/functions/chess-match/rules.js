import './chess.js';
export function restoreMatch(row){const game=new globalThis.Chess(row.start_fen||undefined);for(const move of row.move_history||[])game.move(move);const fen=row.fen==='start'?new globalThis.Chess().fen():row.fen;if(game.fen()!==fen)throw new Error('History unavailable: finish the old match before upgrade');return game}
export function validateMove(row,actor,move){
 if(row.status!=='active')throw new Error('Match finished');
 const own=row.turn==='white'?row.white_id:row.black_id;if(actor!==own)throw new Error('Not your turn');
 const game=restoreMatch(row);const played=game.move({from:move?.from,to:move?.to,promotion:move?.promotion||undefined});
 if(!played)throw new Error('Illegal move');
 const status=game.isCheckmate()?(played.color==='w'?'white_won':'black_won'):game.isStalemate()||game.isInsufficientMaterial()||Number(game.fen().split(' ')[4])>=150||repetitionCount(game)>=5?'draw':'active';
 return {fen:game.fen(),move:{from:played.from,to:played.to,...(played.promotion?{promotion:played.promotion}:{}),san:played.san},status};
}
function repetitionCount(game){const history=game.history({verbose:true});const replay=new globalThis.Chess(history[0]?.before||game.fen());const key=()=>replay.fen().split(' ').slice(0,4).join(' ');const target=game.fen().split(' ').slice(0,4).join(' ');let n=key()===target?1:0;for(const m of history){replay.move({from:m.from,to:m.to,promotion:m.promotion});if(key()===target)n++}return n}
// A bare king can never mate. A lone bishop/knight cannot mate a bare king.
// Other material is left to the normal timeout result (not a forced-mate test).
export function timeoutIsDraw(row){const game=restoreMatch(row);const winner=row.turn==='white'?'b':'w';const pieces=game.board().flat().filter(Boolean);const own=pieces.filter(p=>p.color===winner&&p.type!=='k');const other=pieces.filter(p=>p.color!==winner&&p.type!=='k');return own.length===0||game.isInsufficientMaterial()||(other.length===0&&own.length===1&&['b','n'].includes(own[0].type))}
