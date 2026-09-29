// Учебные шахматы: основные ходы, простой бот и эффект взятия.

const boardElement=document.querySelector("#board");
const statusElement=document.querySelector("#status");
const resetButton=document.querySelector("#reset");
const screens={welcome:document.querySelector("#welcome"),menu:document.querySelector("#menu"),game:document.querySelector("#game")};
const levelsElement=document.querySelector("#levels");
const spriteCache={};
const customSprites={
 "white-pawn":"assets/pieces/fantasy/white-pawn.png",
 "black-pawn":"assets/pieces/fantasy/black-pawn.png",
 "white-rook":"assets/pieces/fantasy/white-rook.png",
 "black-rook":"assets/pieces/fantasy/black-rook.png",
 "white-bishop":"assets/pieces/fantasy/white-bishop.png",
 "black-bishop":"assets/pieces/fantasy/black-bishop.png",
 "white-knight":"assets/pieces/fantasy/white-knight.png",
 "black-knight":"assets/pieces/fantasy/black-knight.png",
 "white-queen":"assets/pieces/fantasy/white-queen.png",
 "black-queen":"assets/pieces/fantasy/black-queen.png",
 "white-king":"assets/pieces/fantasy/white-king.png",
 "black-king":"assets/pieces/fantasy/black-king.png"
};
const names={p:"pawn",n:"knight",b:"bishop",r:"rook",q:"queen",k:"king"};
const colorName=x=>x==="w"?"white":"black";
let chess=new Chess();
const square=(r,c)=>files[c]+(8-r);
function syncBoard(){board=chess.board().map(row=>row.map(p=>p&&{type:names[p.type],color:colorName(p.color)}));turn=colorName(chess.turn())}
const files="abcdefgh";
const puzzles=[
 {side:"white",fen:"k7/8/1QK5/8/8/8/8/8 w - - 0 1",from:[2,1],to:[1,1]},
 {side:"white",fen:"7k/8/5KQ1/8/8/8/8/8 w - - 0 1",from:[2,6],to:[1,6]},
 {side:"black",fen:"8/8/8/8/8/5kq1/8/7K b - - 0 1",from:[5,6],to:[6,6]}
];
let board,selected,moves,turn,finished,botTimer,audioContext;
let drag=null,pendingPromotion=null;
let sceneTimers=[];
let playerColor="white",botColor="black",menuSide="white",difficultyLevel=5,gameStarted=false,gameMode="match",puzzleIndex=0;
const statsKey="free-time-chess-stats-v1";
const levelStatsKey="free-time-chess-level-stats-v1";
function emptyStats(){return {white:{wins:0,losses:0,draws:0},black:{wins:0,losses:0,draws:0}}}
function loadStats(){
 try{
  const saved=JSON.parse(localStorage.getItem(statsKey));
  const result=emptyStats();
  for(const side of ["white","black"])for(const outcome of ["wins","losses","draws"])
   if(Number.isSafeInteger(saved?.[side]?.[outcome])&&saved[side][outcome]>=0)result[side][outcome]=saved[side][outcome];
  return result;
 }catch{return emptyStats()}
}
const stats=loadStats();
function loadLevelStats(){
 const result=Array.from({length:10},()=>({wins:0,losses:0,draws:0}));
 try{
  const saved=JSON.parse(localStorage.getItem(levelStatsKey));
  for(let i=0;i<10;i++)for(const outcome of ["wins","losses","draws"])
   if(Number.isSafeInteger(saved?.[i]?.[outcome])&&saved[i][outcome]>=0)result[i][outcome]=saved[i][outcome];
 }catch{/* Новая статистика. */}
 return result;
}
const levelStats=loadLevelStats();
function showStats(){
 let total=0;
 for(const side of ["white","black"]){
  const games=stats[side].wins+stats[side].losses+stats[side].draws;
  total+=games;
  for(const outcome of ["wins","losses","draws"])
   document.querySelector(`#${side}-${outcome}`).textContent=stats[side][outcome];
  document.querySelector(`#${side}-games`).textContent=games;
  document.querySelector(`#${side}-rate`).textContent=`${games?Math.round(stats[side].wins/games*100):0}%`;
 }
 document.querySelector("#overall-stats").textContent=`Сыграно партий: ${total}`;
 const body=document.querySelector("#level-stats-body");body.replaceChildren();
 for(let i=0;i<10;i++){
  const row=document.createElement("tr"),data=levelStats[i];
  const cells=[i+1,data.wins+data.losses+data.draws,data.wins,data.losses,data.draws];
  cells.forEach((value,j)=>{
   const cell=document.createElement(j===0?"th":"td");
   if(j===0)cell.setAttribute("scope","row");
   cell.textContent=value;row.append(cell);
  });
  body.append(row);
 }
}
function recordResult(outcome){
 if(!gameStarted||gameMode!=="match")return;
 stats[playerColor][outcome]++;
 levelStats[difficultyLevel-1][outcome]++;
 try{
  localStorage.setItem(statsKey,JSON.stringify(stats));
  localStorage.setItem(levelStatsKey,JSON.stringify(levelStats));
 }catch{/* Партия продолжается без сохранения. */}
 showStats();
}
function showScreen(name){
 for(const [key,element] of Object.entries(screens))element.hidden=key!==name;
 if(name==="menu"){showStats();document.querySelector("#menu-title").focus()}
 if(name==="game")document.querySelector("#game-title").focus();
 window.scrollTo(0,0);
}
const displayIndex=(r,c)=>playerColor==="white"?r*8+c:(7-r)*8+(7-c);
function startGame(){
 clearTimeout(botTimer);
 cancelDrag();clearScene();
 gameMode="match";
 playerColor=menuSide;botColor=playerColor==="white"?"black":"white";
 chess.reset();syncBoard();closePromotion();
 selected=null;moves=[];finished=false;gameStarted=true;
 document.querySelector("#player-side").textContent=playerColor==="white"?"Белые":"Чёрные";
 document.querySelector("#opponent-side").textContent=botColor==="white"?"Белые":"Чёрные";
 document.querySelector("#player-avatar").textContent=playerColor==="white"?"♔":"♚";
 document.querySelector("#opponent-avatar").textContent=botColor==="white"?"♔":"♚";
 document.querySelector("#match-info").textContent=`Ты играешь за ${playerColor==="white"?"белых":"чёрных"} • уровень бота ${difficultyLevel}/10`;
 document.querySelector("#opponent-name").textContent="Компьютер";
 resetButton.textContent="Новая партия";document.querySelector("#claim-draw").hidden=true;
 document.querySelector("#next-puzzle").hidden=true;
 statusElement.textContent=playerColor==="white"?"Твой ход: возьми белую фигуру.":"Компьютер ходит первым…";
 render();
 if(playerColor==="black")botTimer=setTimeout(botMove,550);
}
function startPuzzle(index){
 clearTimeout(botTimer);cancelDrag();clearScene();
 puzzleIndex=index;gameMode="puzzle";gameStarted=true;finished=false;
 const puzzle=puzzles[index];
 playerColor=puzzle.side;botColor=playerColor==="white"?"black":"white";
 chess.load(puzzle.fen);syncBoard();closePromotion();
 selected=null;moves=[];
 document.querySelector("#player-side").textContent=playerColor==="white"?"Белые":"Чёрные";
 document.querySelector("#opponent-side").textContent=botColor==="white"?"Белые":"Чёрные";
 document.querySelector("#player-avatar").textContent=playerColor==="white"?"♔":"♚";
 document.querySelector("#opponent-avatar").textContent=botColor==="white"?"♔":"♚";
 document.querySelector("#opponent-name").textContent="Задача";
 document.querySelector("#match-info").textContent=`Задача ${index+1}/${puzzles.length} • мат в один ход`;
 statusElement.textContent="Найди ход, после которого королю не спастись.";
 resetButton.textContent="Повторить задачу";document.querySelector("#claim-draw").hidden=true;
 document.querySelector("#next-puzzle").hidden=true;
 render();
}
function playPuzzleMove(fr,fc,r,c){
 const puzzle=puzzles[puzzleIndex];
 if(fr!==puzzle.from[0]||fc!==puzzle.from[1]||r!==puzzle.to[0]||c!==puzzle.to[1]){
  render();statusElement.textContent="Это не мат. Попробуй другой ход.";return;
 }
 chess.move({from:square(fr,fc),to:square(r,c)});syncBoard();
 finished=true;render();playScene("mate",{to:square(r,c),color:playerColor==="white"?"w":"b"},"Верно! Мат в один ход.");
 statusElement.textContent="Верно! Шах и мат в один ход.";
 const next=document.querySelector("#next-puzzle");
 next.textContent=puzzleIndex===puzzles.length-1?"Начать задачи заново":"Следующая задача";
 next.hidden=false;
}
function getMoves(r,c){return chess.moves({square:square(r,c),verbose:true}).map(m=>({r:8-Number(m.to[1]),c:files.indexOf(m.to[0]),promotion:m.promotion}))}
function closePromotion(){pendingPromotion=null;document.querySelector("#promotion").hidden=true}
function needsPromotion(fr,fc,r,c){return chess.moves({square:square(fr,fc),verbose:true}).some(m=>m.to===square(r,c)&&m.promotion)}
function requestPromotion(fr,fc,r,c){
 pendingPromotion={fr,fc,r,c};const choices=document.querySelector("#promotion-choices");choices.replaceChildren();
 for(const [code,label] of [["q","Ферзь"],["r","Ладья"],["b","Слон"],["n","Конь"]]){
  const button=document.createElement("button"),img=document.createElement("img"),caption=document.createElement("span");
  button.type="button";button.setAttribute("aria-label",label);img.src=getPieceSprite(names[code],playerColor);img.alt="";caption.textContent=label;
  button.append(img,caption);button.addEventListener("click",()=>{const m=pendingPromotion;closePromotion();move(m.fr,m.fc,m.r,m.c,code)});choices.append(button);
 }
 document.querySelector("#promotion").hidden=false;choices.firstElementChild.focus();
}
function repetitionCount(){
 const history=chess.history({verbose:true});
 const replay=new Chess(history[0]?.before||chess.fen()),target=chess.fen().split(" ").slice(0,4).join(" ");let count=0;
 if(replay.fen().split(" ").slice(0,4).join(" ")===target)count++;
 for(const m of history){
  replay.move({from:m.from,to:m.to,promotion:m.promotion});
  if(replay.fen().split(" ").slice(0,4).join(" ")===target)count++;
 }
 return count;
}
function drawState(){const n=Number(chess.fen().split(" ")[4]),reps=repetitionCount();return {
 automatic:n>=150?"75 ходов без взятия и хода пешкой":reps>=5?"пятикратное повторение позиции":null,
 claim:n>=100?"50 ходов без взятия и хода пешкой":reps>=3?"троекратное повторение позиции":null};}
function endMatch(result,message){finished=true;statusElement.textContent=message;document.querySelector("#claim-draw").hidden=true;recordResult(result)}
function render(){
 boardElement.replaceChildren();
 for(let dr=0;dr<8;dr++)for(let dc=0;dc<8;dc++){
  const r=playerColor==="white"?dr:7-dr,c=playerColor==="white"?dc:7-dc;
  const cell=document.createElement("button"),p=board[r][c],canGo=moves.some(m=>m.r===r&&m.c===c);
  cell.type="button";cell.className="square "+((r+c)%2?"square--dark":"square--light");
  cell.setAttribute("role","gridcell");cell.setAttribute("aria-label",files[c]+(8-r)+(p?" "+p.color+" "+p.type:" пусто"));
  if(selected&&selected.r===r&&selected.c===c)cell.classList.add("square--selected");
  if(canGo)cell.classList.add(p?"square--capture":"square--move");
  if(p){
   const fig=document.createElement("img");
   fig.className="piece-image";
   fig.src=getPieceSprite(p.type,p.color);
   fig.alt="";
   fig.draggable=false;
   cell.append(fig);
  }
  if(dc===0){
   const rank=document.createElement("span");
   rank.className="square__rank";rank.textContent=8-r;rank.setAttribute("aria-hidden","true");cell.append(rank);
  }
  if(dr===7){
   const file=document.createElement("span");
   file.className="square__file";file.textContent=files[c];file.setAttribute("aria-hidden","true");cell.append(file);
  }
  cell.dataset.row=r;cell.dataset.col=c;boardElement.append(cell);
 }
}
// Зажми фигуру мышью или пальцем, перетащи и отпусти на нужной клетке.
function cancelDrag(){
 if(!drag)return;
 drag.ghost?.remove();
 drag.source?.classList.remove("square--drag-source");
 if(drag.pointerId!==undefined && boardElement.hasPointerCapture?.(drag.pointerId)){
  boardElement.releasePointerCapture(drag.pointerId);
 }
 drag=null;
}
function onPointerDown(event){
 if(!gameStarted||finished||pendingPromotion||turn!==playerColor||event.button!==0||drag)return;
 const cell=event.target.closest(".square");
 if(!cell||!boardElement.contains(cell))return;
 const r=Number(cell.dataset.row),c=Number(cell.dataset.col);
 const piece=board[r][c];
 if(!piece||piece.color!==playerColor)return;
 event.preventDefault();
 selected={r,c};moves=getMoves(r,c);render();
 const source=boardElement.children[displayIndex(r,c)];
 const rect=source.getBoundingClientRect();
 const ghost=document.createElement("img");
 ghost.src=getPieceSprite(piece.type,piece.color);
 ghost.className="drag-ghost";
 ghost.alt="";ghost.draggable=false;
 ghost.style.width=rect.width+"px";ghost.style.height=rect.height+"px";
 document.body.append(ghost);
 drag={pointerId:event.pointerId,fromR:r,fromC:c,source,ghost};
 source.classList.add("square--drag-source");
 positionGhost(event);
 boardElement.setPointerCapture(event.pointerId);
 statusElement.textContent="Перетащи фигуру на подсвеченную клетку.";
}
function positionGhost(event){
 if(!drag)return;
 drag.ghost.style.left=event.clientX+"px";
 drag.ghost.style.top=event.clientY+"px";
}
function onPointerMove(event){
 if(!drag||drag.pointerId!==event.pointerId)return;
 event.preventDefault();
 positionGhost(event);
 const cell=cellFromPoint(event.clientX,event.clientY);
 boardElement.querySelectorAll(".square--drop-hover").forEach(el=>el.classList.remove("square--drop-hover"));
 if(cell&&moves.some(m=>m.r===Number(cell.dataset.row)&&m.c===Number(cell.dataset.col)))cell.classList.add("square--drop-hover");
}
function cellFromPoint(x,y){
 const rect=boardElement.getBoundingClientRect();
 const inset=parseFloat(getComputedStyle(boardElement).borderLeftWidth)||0;
 const gridX=x-rect.left-inset,gridY=y-rect.top-inset;
 const innerWidth=rect.width-inset*2,innerHeight=rect.height-inset*2;
 if(gridX<0||gridY<0||gridX>=innerWidth||gridY>=innerHeight)return null;
 const col=Math.min(7,Math.floor(gridX/(innerWidth/8)));
 const row=Math.min(7,Math.floor(gridY/(innerHeight/8)));
 return boardElement.children[row*8+col]||null;
}
function onPointerUp(event){
 if(!drag||drag.pointerId!==event.pointerId)return;
 const fromR=drag.fromR,fromC=drag.fromC;
 const target=cellFromPoint(event.clientX,event.clientY);
 const toR=target?Number(target.dataset.row):-1;
 const toC=target?Number(target.dataset.col):-1;
 const valid=moves.some(m=>m.r===toR&&m.c===toC);
 cancelDrag();selected=null;moves=[];
 if(valid){if(gameMode==="puzzle")playPuzzleMove(fromR,fromC,toR,toC);else if(needsPromotion(fromR,fromC,toR,toC))requestPromotion(fromR,fromC,toR,toC);else move(fromR,fromC,toR,toC)}
 else{render();statusElement.textContent="Ход отменён. Возьми фигуру и перетащи её на другую клетку."}
}
boardElement.addEventListener("pointerdown",onPointerDown);
boardElement.addEventListener("pointermove",onPointerMove);
boardElement.addEventListener("pointerup",onPointerUp);
boardElement.addEventListener("pointercancel",()=>{cancelDrag();selected=null;moves=[];if(board)render()});
window.addEventListener("blur",()=>{cancelDrag();selected=null;moves=[];if(board)render()});
function move(fr,fc,r,c,promotion){
 clearScene();
 const played=chess.move({from:square(fr,fc),to:square(r,c),promotion});syncBoard();selected=null;moves=[];render();
 const captured=!!played.captured;if(captured){impact(r,c);playHit()}
 if(chess.isCheckmate()){
  const result=colorName(played.color)===playerColor?"wins":"losses";
  const message=result==="wins"?"Шах и мат! Ты победил!":"Шах и мат! Компьютер победил!";
  endMatch(result,message);playScene("mate",played,message);return;
 }
 if(chess.isStalemate()){
  endMatch("draws","Пат — ничья.");playScene("stalemate",played,"Пат — ничья.");return;
 }
 if(chess.isInsufficientMaterial()){endMatch("draws","Ничья: мат невозможен при оставшихся фигурах.");return}
 const draw=drawState();if(draw.automatic){endMatch("draws",`Ничья: ${draw.automatic}.`);return}
 document.querySelector("#claim-draw").hidden=!(draw.claim&&turn===playerColor);
 const check=chess.isCheck();
 if(check)playScene("check",played);
 if(turn===botColor){
  if(draw.claim){endMatch("draws",`Компьютер заявил ничью: ${draw.claim}.`);return}
  statusElement.textContent=check?"Шах компьютеру! Он думает…":captured?"Попадание! Компьютер думает…":"Компьютер думает…";
  botTimer=setTimeout(botMove,check?1700:550);
 }else statusElement.textContent=check?"Шах твоему королю! Защити его.":captured?"Компьютер взял фигуру! Твой ход.":"Твой ход.";
}
function botMove(){
 if(!gameStarted||finished||turn!==botColor)return;
 const options=chess.moves({verbose:true}).filter(m=>!m.promotion||m.promotion==="q");
 const choice=chooseBotMove(options,difficultyLevel);
 move(8-Number(choice.from[1]),files.indexOf(choice.from[0]),8-Number(choice.to[1]),files.indexOf(choice.to[0]),choice.promotion);
}
const pieceValues={pawn:1,knight:3,bishop:3,rook:5,queen:9,king:0};
function materialScore(){let score=0;for(const row of chess.board())for(const p of row)if(p)score+=(colorName(p.color)===botColor?1:-1)*pieceValues[names[p.type]];return score}
function chooseBotMove(options,level){
 if(level===1)return options[Math.floor(Math.random()*options.length)];
 if(level<=3){const hits=options.filter(o=>o.captured),pool=hits.length&&Math.random()<(level===2?.3:.6)?hits:options;return pool[Math.floor(Math.random()*pool.length)]}
 let best=-Infinity,choices=[];
 for(const o of options){
  chess.move({from:o.from,to:o.to,promotion:o.promotion});
  let score=chess.isCheckmate()?1000:chess.isStalemate()||chess.isInsufficientMaterial()?0:materialScore();
  if(level>=7&&!chess.isGameOver()){
   let worst=Infinity;
   for(const reply of chess.moves({verbose:true})){
    chess.move({from:reply.from,to:reply.to,promotion:reply.promotion});
    worst=Math.min(worst,chess.isCheckmate()?-1000:materialScore());chess.undo();
   }
   score=worst;
  }
  chess.undo();score+=Math.random()*({4:3,5:2,6:1.2,7:2,8:1.1,9:.4,10:0}[level]||0);
  if(score>best){best=score;choices=[o]}else if(score===best)choices.push(o);
 }
 return choices[Math.floor(Math.random()*choices.length)];
}
function impact(r,c){
 const cell=boardElement.children[displayIndex(r,c)];if(!cell)return;
 cell.classList.add("square--impact");
 for(let i=0;i<8;i++){const spark=document.createElement("span");spark.className="spark";spark.style.setProperty("--angle",i*45+"deg");cell.append(spark)}
 setTimeout(()=>{cell.classList.remove("square--impact");cell.querySelectorAll(".spark").forEach(s=>s.remove())},650);
}
// Сцены поверх поля не участвуют в выборе клетки и не меняют шахматную позицию.
function clearScene(){
 for(const timer of sceneTimers)clearTimeout(timer);sceneTimers=[];
 document.querySelector("#board-effects").replaceChildren();
 document.querySelector("#result-panel").hidden=true;
 boardElement.querySelectorAll(".square--fear,.square--king-hidden").forEach(el=>el.classList.remove("square--fear","square--king-hidden"));
 try{window.speechSynthesis?.cancel()}catch{}
}
function sceneAfter(delay,fn){sceneTimers.push(setTimeout(fn,delay))}
function kingSquare(){
 for(let r=0;r<8;r++)for(let c=0;c<8;c++)if(board[r][c]?.type==="king"&&board[r][c].color===turn)return square(r,c);
 return null;
}
function sceneAnchor(squareName,className,content){
 if(!squareName)return null;
 const r=8-Number(squareName[1]),c=files.indexOf(squareName[0]);
 const dr=playerColor==="white"?r:7-r,dc=playerColor==="white"?c:7-c;
 const anchor=document.createElement("div");anchor.className=`scene-anchor ${className}`;
 anchor.style.left=`${(dc+.5)*12.5}%`;anchor.style.top=`${(dr+.5)*12.5}%`;
 if(content)anchor.textContent=content;
 document.querySelector("#board-effects").append(anchor);
 return anchor;
}
function kingCell(squareName){
 if(!squareName)return null;
 const r=8-Number(squareName[1]),c=files.indexOf(squareName[0]);
 return boardElement.children[displayIndex(r,c)];
}
function showResult(kind,message){
 const panel=document.querySelector("#result-panel");panel.className=`result-panel result-panel--${kind}`;
 document.querySelector("#result-eyebrow").textContent=kind==="mate"?"БИТВА ОКОНЧЕНА":"ХОДОВ БОЛЬШЕ НЕТ";
 document.querySelector("#result-title").textContent=kind==="mate"?"ШАХ И МАТ!":"ПАТ!";
 document.querySelector("#result-detail").textContent=message;
 panel.hidden=false;
}
function playScene(kind,played,message){
 const king=kingSquare(),cell=kingCell(king);
 if(kind!=="stalemate"){
  const attackers=king?chess.attackers(king,played.color):[];
  sceneAnchor(attackers.includes(played.to)?played.to:attackers[0]||played.to,"scene-bubble scene-bubble--attack",kind==="mate"?"ШАХ И МАТ!":"ШАХ!");
  sceneAnchor(king,"scene-bubble scene-bubble--king",kind==="mate"?"А-а-а!":"Ой! Шах!");
  cell?.classList.add("square--fear");
  playVoice("Шах!");playDramaSound("shout");
 }else{
  sceneAnchor(king,"scene-bubble scene-bubble--king","Ходить некуда…");
  cell?.classList.add("square--fear");playDramaSound("stalemate");
 }
 if(kind==="check"){
  sceneAfter(1450,()=>{document.querySelector("#board-effects").replaceChildren();cell?.classList.remove("square--fear")});return;
 }
 if(kind==="stalemate"){sceneAfter(850,()=>showResult(kind,message));return}
 sceneAfter(720,()=>{
  cell?.classList.remove("square--fear");cell?.classList.add("square--king-hidden");
  const victim=sceneAnchor(king,"scene-defeat");
  if(victim){
   for(const side of ["left","right"]){
    const half=document.createElement("img");half.className=`scene-defeat__half scene-defeat__half--${side}`;
    half.src=getPieceSprite("king",turn);half.alt="";victim.append(half);
   }
   const slash=document.createElement("span");slash.className="scene-defeat__slash";victim.append(slash);
  }
  playDramaSound("slash");playVoice("А-а-а!");
 });
 sceneAfter(1750,()=>{document.querySelector("#board-effects").replaceChildren();showResult(kind,message);playDramaSound("fanfare")});
}
function playVoice(line){
 try{
  if(!window.speechSynthesis||!window.SpeechSynthesisUtterance)return;
  const voice=new window.SpeechSynthesisUtterance(line);
  voice.lang="ru-RU";voice.rate=line==="Шах!"?1.15:1.35;voice.pitch=line==="Шах!"?.65:1.55;voice.volume=.8;
  window.speechSynthesis.speak(voice);
 }catch{/* Текст в облачках остаётся видимым без голосового движка. */}
}
function playDramaSound(kind){
 try{
  const Ctx=window.AudioContext||window.webkitAudioContext;if(!Ctx)return;
  audioContext ||= new Ctx();if(audioContext.state==="suspended")audioContext.resume();
  const t=audioContext.currentTime;
  const notes=kind==="shout"?[[290,160,.2],[180,95,.26]]:kind==="slash"?[[900,60,.35],[130,45,.38]]:kind==="stalemate"?[[240,185,.28],[175,130,.4]]:[[260,390,.16],[330,495,.16],[390,590,.34]];
  let offset=0;
  for(const [start,end,duration] of notes){
   const osc=audioContext.createOscillator(),gain=audioContext.createGain();
   osc.type=kind==="slash"?"sawtooth":"triangle";
   osc.frequency.setValueAtTime(start,t+offset);osc.frequency.exponentialRampToValueAtTime(end,t+offset+duration);
   gain.gain.setValueAtTime(.0001,t+offset);gain.gain.exponentialRampToValueAtTime(.13,t+offset+.015);
   gain.gain.exponentialRampToValueAtTime(.0001,t+offset+duration);
   osc.connect(gain);gain.connect(audioContext.destination);osc.start(t+offset);osc.stop(t+offset+duration+.02);
   offset+=kind==="fanfare"?duration*.85:duration*.42;
  }
 }catch{/* Без звука анимация продолжится. */}
}
function playHit(){
 try{
  const Ctx=window.AudioContext||window.webkitAudioContext;if(!Ctx)return;
  audioContext ||= new Ctx();
  if(audioContext.state==="suspended")audioContext.resume();
  const t=audioContext.currentTime,osc=audioContext.createOscillator(),gain=audioContext.createGain();
  osc.type="sawtooth";osc.frequency.setValueAtTime(170,t);osc.frequency.exponentialRampToValueAtTime(55,t+.17);
  gain.gain.setValueAtTime(.0001,t);gain.gain.exponentialRampToValueAtTime(.15,t+.009);gain.gain.exponentialRampToValueAtTime(.0001,t+.2);
  osc.connect(gain);gain.connect(audioContext.destination);osc.start(t);osc.stop(t+.21);
 }catch(e){/* Если звук запрещён, партия продолжается. */}
}
// Фэнтези-спрайты: светлая армия паладинов против темных демонических рыцарей.
// Картинки генерируются как SVG с прозрачным фоном, поэтому не требуют внешних файлов.
function getPieceSprite(type,color){
 const key=color+"-"+type;
 if(customSprites[key])return customSprites[key];
 if(spriteCache[key])return spriteCache[key];
 const light=color==="white";
 const palette=light?{
  armor:"#eef2f8",armor2:"#aeb9c7",deep:"#68748b",trim:"#f5c85b",trim2:"#fff0ad",cape:"#f6f0dc",glow:"#76d7ff",outline:"#463d32",eye:"#1f67a7"
 }:{
  armor:"#151923",armor2:"#343947",deep:"#07080d",trim:"#8a1620",trim2:"#ff5a3f",cape:"#251019",glow:"#d33bff",outline:"#050509",eye:"#ff3b2f"
 };
 const shape={
  pawn:'<path d="M60 18 L78 31 L73 50 L85 62 L78 87 H42 L35 62 L47 50 L42 31 Z"/><path class="trim" d="M41 62 Q60 52 79 62 L75 75 Q60 82 45 75 Z"/><path class="shield" d="M60 42 L73 50 L69 71 Q60 79 51 71 L47 50 Z"/>',
  rook:'<path d="M31 22 H43 V33 H52 V22 H68 V33 H77 V22 H89 V49 L82 56 H38 L31 49 Z"/><path d="M41 55 H79 L75 88 H45 Z"/><path class="trim" d="M38 42 H82 V53 H38 Z"/><path class="slit" d="M49 62 H56 V78 H49 Z"/><path class="slit" d="M64 62 H71 V78 H64 Z"/>',
  knight:'<path d="M34 88 Q42 72 39 58 L30 55 Q25 50 31 43 L43 35 L48 21 L61 30 Q75 28 82 40 Q89 54 76 62 Q67 67 66 77 L77 88 Z"/><path class="trim" d="M47 22 L54 12 L67 31 Z"/><path class="trim" d="M34 44 L52 45 L46 54 L31 53 Z"/><path class="plate" d="M49 60 Q61 54 72 62 L68 76 H48 Z"/>',
  bishop:'<path d="M60 13 Q78 26 82 42 Q85 57 70 66 L77 88 H43 L50 66 Q35 57 39 42 Q42 26 60 13 Z"/><path class="trim" d="M50 39 Q60 28 70 39 Q68 54 60 61 Q52 54 50 39 Z"/><path class="staff" d="M76 22 L86 15 L89 25 L82 29 L91 82"/>',
  queen:'<path d="M28 31 L42 51 L49 20 L60 45 L71 20 L78 51 L92 31 L83 66 H37 Z"/><path d="M43 66 H77 L73 88 H47 Z"/><path class="trim" d="M36 57 Q60 47 84 57 L81 67 H39 Z"/><circle class="gem" cx="60" cy="56" r="5"/>',
  king:'<path class="trim" d="M56 10 H64 V22 H76 V30 H64 V41 H56 V30 H44 V22 H56 Z"/><path d="M32 45 Q60 25 88 45 L80 66 H40 Z"/><path d="M43 66 H77 L73 88 H47 Z"/><path class="trim" d="M40 50 Q60 39 80 50 L77 62 H43 Z"/><circle class="gem" cx="60" cy="54" r="5"/>'
 }[type];
 const horn=light?"":'<path class="horn" d="M38 25 L28 10 L45 21 Z"/><path class="horn" d="M82 25 L92 10 L75 21 Z"/>';
 const weapon=(type==="pawn"||type==="king"||type==="queen")?"":'<path class="weapon" d="M25 84 L93 16"/>';
 const leftEye=type==="knight"?57:54;
 const rightEye=type==="knight"?70:66;
 const eyeY=type==="knight"?43:48;
 const svg='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120">'+
 '<defs><linearGradient id="body" x1="0" y1="0" x2="1" y2="1"><stop stop-color="'+palette.armor+'"/><stop offset=".45" stop-color="'+palette.armor2+'"/><stop offset="1" stop-color="'+palette.deep+'"/></linearGradient><linearGradient id="trim" x1="0" y1="0" x2="1" y2="1"><stop stop-color="'+palette.trim2+'"/><stop offset="1" stop-color="'+palette.trim+'"/></linearGradient><filter id="soft"><feDropShadow dx="0" dy="4" stdDeviation="2.2" flood-color="#000" flood-opacity=".45"/></filter></defs>'+
 '<ellipse cx="60" cy="107" rx="35" ry="7" fill="#000" opacity=".25"/>'+
 '<g filter="url(#soft)" stroke="'+palette.outline+'" stroke-width="3.3" stroke-linejoin="round" stroke-linecap="round">'+
 '<path d="M40 88 H80 Q88 88 90 98 H30 Q32 88 40 88 Z" fill="url(#trim)"/><rect x="25" y="96" width="70" height="12" rx="5" fill="url(#body)"/><g fill="url(#body)">'+shape+'</g>'+horn+weapon+
 '</g>'+
 '<style>.trim,.horn{fill:url(#trim)}.shield,.plate{fill:'+palette.cape+';opacity:.9}.slit{fill:'+palette.deep+'}.gem{fill:'+palette.glow+';stroke:'+palette.outline+';stroke-width:2}.staff,.weapon{fill:none;stroke:url(#trim);stroke-width:4;stroke-linecap:round}.horn{stroke:'+palette.outline+';stroke-width:3}.pieceGlow{opacity:.42}</style>'+
 '<path class="pieceGlow" d="M43 30 Q59 20 75 31" fill="none" stroke="'+palette.trim2+'" stroke-width="3" stroke-linecap="round"/>'+
 '<circle cx="'+leftEye+'" cy="'+eyeY+'" r="3" fill="'+palette.eye+'"/><circle cx="'+rightEye+'" cy="'+eyeY+'" r="3" fill="'+palette.eye+'" opacity="'+(type==="knight"?0:1)+'"/></svg>';
 spriteCache[key]="data:image/svg+xml;charset=UTF-8,"+encodeURIComponent(svg);
 return spriteCache[key];
}

resetButton.addEventListener("click",()=>gameMode==="puzzle"?startPuzzle(puzzleIndex):startGame());
document.querySelector("#next-puzzle").addEventListener("click",()=>startPuzzle((puzzleIndex+1)%puzzles.length));
for(let level=1;level<=10;level++){
 const button=document.createElement("button");
 button.type="button";button.textContent=level;
 button.setAttribute("aria-label",`Уровень сложности ${level}`);
 button.addEventListener("click",()=>{
  difficultyLevel=level;
  document.querySelector("#level-value").textContent=level;
  for(const item of levelsElement.children){
   const selected=item===button;
   item.classList.toggle("is-selected",selected);
   item.setAttribute("aria-pressed",String(selected));
  }
 });
 button.classList.toggle("is-selected",level===difficultyLevel);
 button.setAttribute("aria-pressed",String(level===difficultyLevel));
 levelsElement.append(button);
}
for(const button of document.querySelectorAll(".side-option"))button.addEventListener("click",()=>{
 menuSide=button.dataset.side;
 for(const item of document.querySelectorAll(".side-option")){
  const selected=item===button;
  item.classList.toggle("is-selected",selected);
  item.setAttribute("aria-pressed",String(selected));
 }
});
document.querySelector("#enter").addEventListener("click",()=>{
 try{const Ctx=window.AudioContext||window.webkitAudioContext;if(Ctx){audioContext ||= new Ctx();audioContext.resume()}}catch{}
 showScreen("menu");
});
document.querySelector("#start-match").addEventListener("click",()=>{
 showScreen("game");startGame();
});
document.querySelector("#puzzle-entry").addEventListener("click",()=>{
 showScreen("game");startPuzzle(0);
});
document.querySelector("#back-menu").addEventListener("click",()=>{
 clearTimeout(botTimer);cancelDrag();clearScene();closePromotion();gameStarted=false;showScreen("menu");
});
showStats();

document.querySelector("#claim-draw").addEventListener("click",()=>{if(gameMode!=="match"||finished||turn!==playerColor)return;const draw=drawState();if(draw.claim)endMatch("draws",`Ничья по заявлению: ${draw.claim}.`)});
document.querySelector("#promotion-cancel").addEventListener("click",()=>{closePromotion();render();statusElement.textContent="Превращение отменено. Выбери ход снова."});
window.addEventListener("keydown",e=>{if(e.key==="Escape"&&pendingPromotion){closePromotion();render()}});
