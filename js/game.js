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
let moving=false,motionToken=0,motionTimer=null,motionGhosts=[];
let lastMove=null,reviewMode=false,reviewPly=0,reviewMoves=[],reviewStartFen="",finalMessage="";
let playerColor="white",botColor="black",menuSide="white",difficultyLevel=5,gameStarted=false,gameMode="match",puzzleIndex=0;
const statsKey="free-time-chess-stats-v1";
const levelStatsKey="free-time-chess-level-stats-v1";
const energyKey="free-time-chess-energy-v1";
const screenKey="free-time-chess-screen-v1";
const gameStateKey="free-time-chess-game-state-v1";
const scrollKey="free-time-chess-scroll-v1";
const MAX_ENERGY=6;
let energy=loadEnergy();

function loadEnergy(){
 const raw=localStorage.getItem(energyKey);
 if(raw===null)return MAX_ENERGY;
 const saved=Number(raw);
 return Number.isInteger(saved)?Math.max(0,Math.min(MAX_ENERGY,saved)):MAX_ENERGY;
}
function renderEnergy(message=""){
 const value=document.querySelector("#energy-value");
 const max=document.querySelector("#energy-max");
 const note=document.querySelector("#energy-note");
 if(value)value.textContent=energy;
 if(max)max.textContent=MAX_ENERGY;
 if(note&&message)note.textContent=message;
 const button=document.querySelector("#puzzle-entry");
 if(button)button.disabled=energy<=0;
}
function saveEnergy(){try{localStorage.setItem(energyKey,String(energy))}catch{}}
function addEnergy(amount,message){
 energy=Math.min(MAX_ENERGY,energy+amount);saveEnergy();renderEnergy(message||`Энергия пополнена: ${energy}/${MAX_ENERGY}.`);
}
function spendEnergy(amount=1){
 if(energy<amount){
  renderEnergy("Энергия закончилась. Сыграй партию или пополни её за рекламу.");
  return false;
 }
 energy-=amount;saveEnergy();renderEnergy();return true;
}
function saveGameState(){
 if(!gameStarted||!chess)return;
 try{
  sessionStorage.setItem(gameStateKey,JSON.stringify({
   fen:chess.fen(),gameMode,playerColor,botColor,menuSide,difficultyLevel,puzzleIndex,finished,
   lastMove:lastMove?{from:lastMove.from,to:lastMove.to,san:lastMove.san}:null
  }));
 }catch{}
}
function syncMenuSelections(){
 document.querySelector("#level-value").textContent=difficultyLevel;
 for(const item of levelsElement.children){
  const selected=Number(item.textContent)===difficultyLevel;
  item.classList.toggle("is-selected",selected);item.setAttribute("aria-pressed",String(selected));
 }
 for(const item of document.querySelectorAll(".side-option")){
  const selected=item.dataset.side===menuSide;
  item.classList.toggle("is-selected",selected);item.setAttribute("aria-pressed",String(selected));
 }
}
function restoreSession(){
 let savedScreen="welcome";
 try{savedScreen=sessionStorage.getItem(screenKey)||"welcome"}catch{}
 if(savedScreen==="game"){
  try{
   const saved=JSON.parse(sessionStorage.getItem(gameStateKey)||"null");
   if(saved?.fen){
    gameMode=saved.gameMode==="puzzle"?"puzzle":"match";
    playerColor=saved.playerColor==="black"?"black":"white";
    botColor=playerColor==="white"?"black":"white";
    menuSide=saved.menuSide==="black"?"black":"white";
    difficultyLevel=Math.max(1,Math.min(10,Number(saved.difficultyLevel)||5));
    puzzleIndex=Math.max(0,Math.min(puzzles.length-1,Number(saved.puzzleIndex)||0));
    finished=!!saved.finished;gameStarted=true;
    chess.load(saved.fen);syncBoard();closePromotion();resetReview();
    lastMove=saved.lastMove||null;selected=null;moves=[];
    document.querySelector("#player-side").textContent=playerColor==="white"?"Белые":"Чёрные";
    document.querySelector("#opponent-side").textContent=botColor==="white"?"Белые":"Чёрные";
    document.querySelector("#player-avatar").textContent=playerColor==="white"?"♔":"♚";
    document.querySelector("#opponent-avatar").textContent=botColor==="white"?"♔":"♚";
    if(gameMode==="puzzle"){
     document.querySelector("#opponent-name").textContent="Задача";
     document.querySelector("#match-info").textContent=`Задача ${puzzleIndex+1}/${puzzles.length} • мат в один ход`;
     resetButton.textContent="Повторить задачу";
     document.querySelector("#resign").hidden=true;
    }else{
     document.querySelector("#opponent-name").textContent="Компьютер";
     document.querySelector("#match-info").textContent=`Ты играешь за ${playerColor==="white"?"белых":"чёрных"} • уровень бота ${difficultyLevel}/10`;
     resetButton.textContent="Новая партия";
     document.querySelector("#resign").hidden=finished;
    }
    document.querySelector("#claim-draw").hidden=true;
    document.querySelector("#next-puzzle").hidden=true;
    statusElement.textContent=finished?"Партия завершена.":gameMode==="puzzle"?"Продолжай решать задачу.":turn===playerColor?"Твой ход.":"Компьютер думает…";
    syncMenuSelections();render();renderMoveList();showScreen("game",false);
    if(!finished&&gameMode==="match"&&turn===botColor)botTimer=setTimeout(botMove,700);
    restoreScroll();return;
   }
  }catch{}
 }
 if(savedScreen==="menu"){syncMenuSelections();showScreen("menu",false);restoreScroll();return}
 showScreen("welcome",false);restoreScroll();
}
function restoreScroll(){
 let y=0;try{y=Number(sessionStorage.getItem(scrollKey))||0}catch{}
 requestAnimationFrame(()=>window.scrollTo(0,y));
}
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
function showScreen(name,resetScroll=true){
 for(const [key,element] of Object.entries(screens))element.hidden=key!==name;
 try{sessionStorage.setItem(screenKey,name)}catch{}
 if(name==="menu"){showStats();document.querySelector("#menu-title").focus()}
 if(name==="game")document.querySelector("#game-title").focus();
 if(resetScroll)window.scrollTo(0,0);
}
const displayIndex=(r,c)=>playerColor==="white"?r*8+c:(7-r)*8+(7-c);
function startGame(){
 clearTimeout(botTimer);
 cancelDrag();cancelMotion();clearScene();
 gameMode="match";
 playerColor=menuSide;botColor=playerColor==="white"?"black":"white";
 chess.reset();syncBoard();closePromotion();resetReview();
 selected=null;moves=[];finished=false;gameStarted=true;
 document.querySelector("#player-side").textContent=playerColor==="white"?"Белые":"Чёрные";
 document.querySelector("#opponent-side").textContent=botColor==="white"?"Белые":"Чёрные";
 document.querySelector("#player-avatar").textContent=playerColor==="white"?"♔":"♚";
 document.querySelector("#opponent-avatar").textContent=botColor==="white"?"♔":"♚";
 document.querySelector("#match-info").textContent=`Ты играешь за ${playerColor==="white"?"белых":"чёрных"} • уровень бота ${difficultyLevel}/10`;
 document.querySelector("#opponent-name").textContent="Компьютер";
 resetButton.textContent="Новая партия";document.querySelector("#claim-draw").hidden=true;
 document.querySelector("#resign").hidden=false;
 document.querySelector("#next-puzzle").hidden=true;
 statusElement.textContent=playerColor==="white"?"Твой ход: возьми белую фигуру.":"Компьютер ходит первым…";
 render();saveGameState();
 if(playerColor==="black")botTimer=setTimeout(botMove,850);
}
function startPuzzle(index){
 clearTimeout(botTimer);cancelDrag();cancelMotion();clearScene();
 puzzleIndex=index;gameMode="puzzle";gameStarted=true;finished=false;
 const puzzle=puzzles[index];
 playerColor=puzzle.side;botColor=playerColor==="white"?"black":"white";
 chess.load(puzzle.fen);syncBoard();closePromotion();resetReview();
 selected=null;moves=[];
 document.querySelector("#player-side").textContent=playerColor==="white"?"Белые":"Чёрные";
 document.querySelector("#opponent-side").textContent=botColor==="white"?"Белые":"Чёрные";
 document.querySelector("#player-avatar").textContent=playerColor==="white"?"♔":"♚";
 document.querySelector("#opponent-avatar").textContent=botColor==="white"?"♔":"♚";
 document.querySelector("#opponent-name").textContent="Задача";
 document.querySelector("#match-info").textContent=`Задача ${index+1}/${puzzles.length} • мат в один ход`;
 statusElement.textContent="Найди ход, после которого королю не спастись.";
 resetButton.textContent="Повторить задачу";document.querySelector("#claim-draw").hidden=true;
 document.querySelector("#resign").hidden=true;
 document.querySelector("#next-puzzle").hidden=true;
 render();saveGameState();
}
function playPuzzleMove(fr,fc,r,c,dragState=null){
 const puzzle=puzzles[puzzleIndex];
 if(fr!==puzzle.from[0]||fc!==puzzle.from[1]||r!==puzzle.to[0]||c!==puzzle.to[1]){
  dragState?.ghost?.remove();
  render();statusElement.textContent="Это не мат. Попробуй другой ход.";return;
 }
 const from=square(fr,fc),to=square(r,c);
 const legal=chess.moves({square:from,verbose:true}).find(m=>m.to===to);
 moving=true;
 animateMoveBeforeCommit(legal,()=>{
  chess.move({from,to});syncBoard();lastMove=chess.history({verbose:true}).at(-1);
  finished=true;render();renderMoveList();
  playScene("mate",{to,color:playerColor==="white"?"w":"b"},"Верно! Мат в один ход.");
  statusElement.textContent="Верно! Шах и мат в один ход.";
  const next=document.querySelector("#next-puzzle");
  next.textContent=puzzleIndex===puzzles.length-1?"Начать задачи заново":"Следующая задача";
  next.hidden=false;saveGameState();
 },dragState);
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
function endMatch(result,message,awardEnergy=true){
 finished=true;finalMessage=message;statusElement.textContent=message;
 document.querySelector("#claim-draw").hidden=true;document.querySelector("#resign").hidden=true;
 document.querySelector("#analysis-entry").hidden=false;recordResult(result);
 if(awardEnergy)addEnergy(1,"Партия завершена: +1 ⚡ энергии для задач.");
 saveGameState();
}
function render(){
 boardElement.replaceChildren();
 for(let dr=0;dr<8;dr++)for(let dc=0;dc<8;dc++){
  const r=playerColor==="white"?dr:7-dr,c=playerColor==="white"?dc:7-dc;
  const cell=document.createElement("button"),p=board[r][c],canGo=moves.some(m=>m.r===r&&m.c===c);
  cell.type="button";cell.className="square "+((r+c)%2?"square--dark":"square--light");
  cell.setAttribute("role","gridcell");cell.setAttribute("aria-label",files[c]+(8-r)+(p?" "+p.color+" "+p.type:" пусто"));
  if(lastMove?.from===square(r,c))cell.classList.add("square--last-from");
  if(lastMove?.to===square(r,c))cell.classList.add("square--last-to");
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
 if(!gameStarted||finished||reviewMode||moving||pendingPromotion||turn!==playerColor||event.button!==0||drag)return;
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

 if(valid){
  const activeDrag=drag;
  if(boardElement.hasPointerCapture?.(activeDrag.pointerId)){
   boardElement.releasePointerCapture(activeDrag.pointerId);
  }
  activeDrag.source?.classList.remove("square--drag-source");
  drag=null;selected=null;moves=[];

  if(needsPromotion(fromR,fromC,toR,toC)){
   activeDrag.ghost?.remove();
   requestPromotion(fromR,fromC,toR,toC);
  }else if(gameMode==="puzzle"){
   playPuzzleMove(fromR,fromC,toR,toC,activeDrag);
  }else{
   move(fromR,fromC,toR,toC,undefined,activeDrag);
  }
 }else{
  cancelDrag();selected=null;moves=[];render();
  statusElement.textContent="Ход отменён. Возьми фигуру и перетащи её на другую клетку.";
 }
}
boardElement.addEventListener("pointerdown",onPointerDown);
boardElement.addEventListener("pointermove",onPointerMove);
boardElement.addEventListener("pointerup",onPointerUp);
boardElement.addEventListener("pointercancel",()=>{cancelDrag();selected=null;moves=[];if(board&&!moving)render()});
window.addEventListener("blur",()=>{cancelDrag();selected=null;moves=[];if(board&&!moving)render()});
function move(fr,fc,r,c,promotion,dragState=null){
 if(moving)return;
 clearScene();
 const from=square(fr,fc),to=square(r,c);
 const legal=chess.moves({square:from,verbose:true}).find(m=>m.to===to&&m.promotion===promotion);
 if(!legal)return;
 moving=true;
 animateMoveBeforeCommit(legal,()=>{
  const played=chess.move({from,to,promotion});syncBoard();lastMove=played;
  selected=null;moves=[];render();renderMoveList();saveGameState();
  if(played.captured){
   const takenAt=played.isEnPassant()?square(fr,c):to;
   playCaptureEffect(takenAt,played.captured,played.color==="w"?"black":"white");
   impact(8-Number(takenAt[1]),files.indexOf(takenAt[0]));playMetalClash();
  }
  if(chess.isCheckmate()){
   const result=colorName(played.color)===playerColor?"wins":"losses";
   const message=result==="wins"?"Шах и мат! Ты победил!":"Шах и мат! Компьютер победил!";
   endMatch(result,message);playScene("mate",played,message);return;
  }
  if(chess.isStalemate()){
   endMatch("draws","Пат — ничья.");playScene("stalemate",played,"Пат — ничья.");return;
  }
  if(chess.isInsufficientMaterial()){const message="Ничья: мат невозможен при оставшихся фигурах.";endMatch("draws",message);showResult("draw",message);return}
  const draw=drawState();if(draw.automatic){const message=`Ничья: ${draw.automatic}.`;endMatch("draws",message);showResult("draw",message);return}
  document.querySelector("#claim-draw").hidden=!(draw.claim&&turn===playerColor);
  if(turn===botColor&&draw.claim){const message=`Компьютер заявил ничью: ${draw.claim}.`;endMatch("draws",message);showResult("draw",message);return}
  const check=chess.isCheck();if(check)playScene("check",played);
  if(turn===botColor){
   statusElement.textContent=check?"Шах компьютеру! Он думает…":played.captured?"Попадание! Компьютер думает…":"Компьютер думает…";
   botTimer=setTimeout(botMove,check?1700:650);
  }else statusElement.textContent=check?"Шах твоему королю! Защити его.":played.captured?"Компьютер взял фигуру! Твой ход.":"Твой ход.";
 },dragState);
}
function botMove(){
 if(!gameStarted||finished||moving||turn!==botColor)return;
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
function resetReview(){
 reviewMode=false;reviewPly=0;reviewMoves=[];reviewStartFen="";finalMessage="";lastMove=null;
 document.querySelector("#analysis-entry").hidden=true;
 document.querySelector("#review-controls").hidden=true;
 renderMoveList();
}
function renderMoveList(){
 const list=document.querySelector("#moves-list");list.replaceChildren();
 const history=reviewMode?reviewMoves:chess.history({verbose:true});
 if(!history.length){const empty=document.createElement("p");empty.className="moves-empty";empty.textContent="Пока ходов нет";list.append(empty);return}
 for(let i=0;i<history.length;i+=2){
  const row=document.createElement("div");row.className="moves-row";
  const number=document.createElement("span");number.className="moves-row__number";number.textContent=`${Math.floor(i/2)+1}.`;row.append(number);
  for(let j=i;j<Math.min(i+2,history.length);j++){
   const item=document.createElement("button");item.type="button";item.className="moves-row__move";
   item.textContent=history[j].san;item.title=`Ход ${j+1}: ${history[j].san}`;
   item.disabled=!reviewMode;
   if(reviewMode&&reviewPly===j+1)item.classList.add("is-current");
   item.addEventListener("click",()=>setReviewPly(j+1));row.append(item);
  }
  list.append(row);
 }
 if(!reviewMode)list.scrollTop=list.scrollHeight;
}
function setReviewPly(ply){
 if(!reviewMode)return;
 reviewPly=Math.max(0,Math.min(reviewMoves.length,ply));
 const replay=new Chess(reviewStartFen);
 for(let i=0;i<reviewPly;i++){const m=reviewMoves[i];replay.move({from:m.from,to:m.to,promotion:m.promotion})}
 board=replay.board().map(row=>row.map(p=>p&&{type:names[p.type],color:colorName(p.color)}));
 lastMove=reviewMoves[reviewPly-1]||null;selected=null;moves=[];render();renderMoveList();
 document.querySelector("#review-position").textContent=reviewPly?`Ход ${Math.ceil(reviewPly/2)}: ${lastMove.san}`:"Начальная позиция";
 for(const [id,disabled] of [["#review-first",!reviewPly],["#review-prev",!reviewPly],["#review-next",reviewPly===reviewMoves.length],["#review-last",reviewPly===reviewMoves.length]])document.querySelector(id).disabled=disabled;
}
function openReview(){
 if(gameMode!=="match"||!finished)return;
 clearScene();reviewMoves=chess.history({verbose:true});reviewStartFen=reviewMoves[0]?.before||chess.fen();reviewMode=true;
 document.querySelector("#analysis-entry").hidden=true;document.querySelector("#review-controls").hidden=false;
 setReviewPly(reviewMoves.length);
 statusElement.textContent="Разбор партии: выбирай ход в записи или листай стрелками.";
 document.querySelector("#review-controls").scrollIntoView?.({block:"nearest",behavior:"smooth"});
}
function closeReview(){
 if(!reviewMode)return;reviewMode=false;syncBoard();lastMove=chess.history({verbose:true}).at(-1)||null;
 render();renderMoveList();document.querySelector("#review-controls").hidden=true;
 document.querySelector("#analysis-entry").hidden=false;statusElement.textContent=finalMessage;
}
function cancelMotion(){
 motionToken++;clearTimeout(motionTimer);motionTimer=null;moving=false;
 for(const {ghost,source} of motionGhosts){ghost.remove();if(source)source.style.visibility=""}
 motionGhosts=[];
}
function animateMoveBeforeCommit(m,commit,dragState=null){
 const token=++motionToken;
 const reduce=window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
 const fromCell=kingCell(m.from),toCell=kingCell(m.to);
 if(reduce||!fromCell||!toCell){
  dragState?.ghost?.remove();
  moving=false;commit();return;
 }

 function travellingPiece(sourceCell,destinationCell,type,color,existingGhost=null){
  const a=sourceCell.getBoundingClientRect(),b=destinationCell.getBoundingClientRect();
  const ghost=existingGhost||document.createElement("img");

  if(!existingGhost){
   ghost.src=getPieceSprite(type,color);
   ghost.alt="";ghost.draggable=false;
   ghost.style.width=a.width+"px";
   ghost.style.height=a.height+"px";
   ghost.style.left=(a.left+a.width/2)+"px";
   ghost.style.top=(a.top+a.height/2)+"px";
   document.body.append(ghost);
  }else{
   const current=ghost.getBoundingClientRect();
   ghost.style.left=(current.left+current.width/2)+"px";
   ghost.style.top=(current.top+current.height/2)+"px";
  }

  ghost.classList.remove("drag-ghost","travel-piece");
  ghost.classList.add("move-ghost");
  ghost.style.transition="none";
  ghost.style.transform="translate(-50%,-50%)";

  const source=sourceCell.querySelector(".piece-image");
  if(source)source.style.visibility="hidden";
  motionGhosts.push({ghost,source});

  ghost.getBoundingClientRect();
  requestAnimationFrame(()=>{
   ghost.style.transition="left .22s linear, top .22s linear";
   ghost.style.left=(b.left+b.width/2)+"px";
   ghost.style.top=(b.top+b.height/2)+"px";
  });
  return ghost;
 }

 const main=travellingPiece(fromCell,toCell,names[m.piece],colorName(m.color),dragState?.ghost||null);

 if(m.isKingsideCastle()||m.isQueensideCastle()){
  const row=8-Number(m.from[1]),start=m.isKingsideCastle()?7:0,end=m.isKingsideCastle()?5:3;
  const rookFrom=boardElement.children[displayIndex(row,start)];
  const rookTo=boardElement.children[displayIndex(row,end)];
  travellingPiece(rookFrom,rookTo,"rook",colorName(m.color));
 }

 let done=false;
 function finish(){
  if(done||token!==motionToken)return;done=true;
  clearTimeout(motionTimer);motionTimer=null;
  for(const {ghost,source} of motionGhosts){
   ghost.remove();
   if(source)source.style.visibility="";
  }
  motionGhosts=[];moving=false;commit();
 }

 main.addEventListener("transitionend",finish,{once:true});
 motionTimer=setTimeout(finish,320);
}
function playCaptureEffect(squareName,type,color){
 const victim=sceneAnchor(squareName,"scene-defeat scene-defeat--capture");
 if(!victim)return;
 for(const side of ["left","right"]){
  const half=document.createElement("img");half.className=`scene-defeat__half scene-defeat__half--${side}`;
  half.src=getPieceSprite(names[type],color);half.alt="";victim.append(half);
 }
 const slash=document.createElement("span");slash.className="scene-defeat__slash";victim.append(slash);
 sceneAfter(980,()=>victim.remove());
}
// Сцены поверх поля не участвуют в выборе клетки и не меняют шахматную позицию.
function clearScene(){
 for(const timer of sceneTimers)clearTimeout(timer);sceneTimers=[];
 document.querySelector("#board-effects").replaceChildren();
 document.querySelector("#result-panel").hidden=true;
 boardElement.querySelectorAll(".square--fear,.square--king-hidden").forEach(el=>el.classList.remove("square--fear","square--king-hidden"));
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
 document.querySelector("#result-eyebrow").textContent=kind==="mate"?"БИТВА ОКОНЧЕНА":kind==="stalemate"?"ХОДОВ БОЛЬШЕ НЕТ":"ПАРТИЯ ЗАВЕРШЕНА";
 document.querySelector("#result-title").textContent=kind==="mate"?"ШАХ И МАТ!":kind==="stalemate"?"ПАТ!":kind==="resign"?"ПОРАЖЕНИЕ":"НИЧЬЯ";
 document.querySelector("#result-detail").textContent=message;
 document.querySelector("#result-analysis").hidden=gameMode!=="match";
 document.querySelector("#result-new").hidden=gameMode!=="match";
 document.querySelector("#result-next").hidden=gameMode!=="puzzle";
 panel.hidden=false;
}
function playScene(kind,played,message){
 const king=kingSquare(),cell=kingCell(king);
 if(kind!=="stalemate"){
  const attackers=king?chess.attackers(king,played.color):[];
  sceneAnchor(attackers.includes(played.to)?played.to:attackers[0]||played.to,"scene-bubble scene-bubble--attack",kind==="mate"?"ШАХ И МАТ!":"ШАХ!");
  sceneAnchor(king,"scene-bubble scene-bubble--king",kind==="mate"?"А-а-а!":"Ой! Шах!");
  cell?.classList.add("square--fear");

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
  playMetalClash();
 });
 sceneAfter(1750,()=>{document.querySelector("#board-effects").replaceChildren();showResult(kind,message);playDramaSound("fanfare")});
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
function playMetalClash(){
 try{
  const Ctx=window.AudioContext||window.webkitAudioContext;if(!Ctx)return;
  audioContext ||= new Ctx();if(audioContext.state==="suspended")audioContext.resume();
  const t=audioContext.currentTime;
  // Несовпадающие частоты дают короткий звон металла, без голосовой озвучки.
  if(audioContext.createBuffer&&audioContext.createBufferSource&&audioContext.createBiquadFilter){
   const length=Math.floor(audioContext.sampleRate*.09),buffer=audioContext.createBuffer(1,length,audioContext.sampleRate);
   const data=buffer.getChannelData(0);for(let i=0;i<length;i++)data[i]=(Math.random()*2-1)*(1-i/length);
   const noise=audioContext.createBufferSource(),filter=audioContext.createBiquadFilter(),noiseGain=audioContext.createGain();
   noise.buffer=buffer;filter.type="highpass";filter.frequency.value=1700;
   noiseGain.gain.setValueAtTime(.13,t);noiseGain.gain.exponentialRampToValueAtTime(.0001,t+.09);
   noise.connect(filter);filter.connect(noiseGain);noiseGain.connect(audioContext.destination);noise.start(t);
  }
  for(const [frequency,duration,volume] of [[560,.26,.10],[910,.38,.065],[1490,.51,.035],[2240,.25,.018]]){
   const osc=audioContext.createOscillator(),gain=audioContext.createGain();osc.type="sine";
   osc.frequency.setValueAtTime(frequency,t);osc.frequency.exponentialRampToValueAtTime(frequency*.82,t+duration);
   gain.gain.setValueAtTime(.0001,t);gain.gain.exponentialRampToValueAtTime(volume,t+.008);
   gain.gain.exponentialRampToValueAtTime(.0001,t+duration);
   osc.connect(gain);gain.connect(audioContext.destination);osc.start(t);osc.stop(t+duration+.02);
  }
 }catch{/* Партия продолжается без звука. */}
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

function startPuzzleWithEnergy(index){
 if(!spendEnergy(1))return false;
 showScreen("game");startPuzzle(index);return true;
}

resetButton.addEventListener("click",()=>gameMode==="puzzle"?startPuzzle(puzzleIndex):startGame());
document.querySelector("#next-puzzle").addEventListener("click",()=>startPuzzleWithEnergy((puzzleIndex+1)%puzzles.length));
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
document.querySelector("#puzzle-entry").addEventListener("click",()=>startPuzzleWithEnergy(0));
document.querySelector("#back-menu").addEventListener("click",()=>{
 clearTimeout(botTimer);cancelDrag();cancelMotion();clearScene();closePromotion();resetReview();gameStarted=false;showScreen("menu");
});
document.querySelector("#energy-ad").addEventListener("click",()=>{
 const sdk=window.ysdk;
 if(sdk?.adv?.showRewardedVideo){
  sdk.adv.showRewardedVideo({callbacks:{
   onRewarded:()=>addEnergy(3,"Реклама просмотрена: +3 ⚡ энергии."),
   onError:()=>renderEnergy("Реклама сейчас недоступна. Попробуй позже.")
  }});
 }else{
  renderEnergy("Наградная реклама заработает после подключения SDK Яндекс Игр.");
 }
});
showStats();renderEnergy();

document.querySelector("#claim-draw").addEventListener("click",()=>{if(gameMode!=="match"||finished||moving||turn!==playerColor)return;const draw=drawState();if(draw.claim){const message=`Ничья по заявлению: ${draw.claim}.`;endMatch("draws",message);showResult("draw",message)}});
document.querySelector("#promotion-cancel").addEventListener("click",()=>{closePromotion();render();statusElement.textContent="Превращение отменено. Выбери ход снова."});
window.addEventListener("keydown",e=>{if(e.key==="Escape"&&pendingPromotion){closePromotion();render()}});

document.querySelector("#analysis-entry").addEventListener("click",openReview);
document.querySelector("#result-analysis").addEventListener("click",openReview);
document.querySelector("#result-new").addEventListener("click",startGame);
document.querySelector("#result-next").addEventListener("click",()=>startPuzzleWithEnergy((puzzleIndex+1)%puzzles.length));
document.querySelector("#result-menu").addEventListener("click",()=>document.querySelector("#back-menu").click());
document.querySelector("#resign").addEventListener("click",()=>{
 if(!gameStarted||finished||gameMode!=="match")return;
 clearTimeout(botTimer);cancelMotion();clearScene();const message="Ты сдался. Победа компьютера.";
 endMatch("losses",message,false);showResult("resign",message);
});
for(const [id,position] of [["#review-first",0],["#review-prev",-1],["#review-next",1],["#review-last",Infinity]])
 document.querySelector(id).addEventListener("click",()=>setReviewPly(position===Infinity?reviewMoves.length:position===0?0:reviewPly+position));
document.querySelector("#review-close").addEventListener("click",closeReview);
document.querySelector("#copy-pgn").addEventListener("click",async()=>{
 const pgn=chess.pgn();
 try{await navigator.clipboard.writeText(pgn);document.querySelector("#copy-pgn").textContent="PGN скопирован"}
 catch{
  const file=new Blob([pgn],{type:"application/x-chess-pgn;charset=utf-8"}),url=URL.createObjectURL(file),link=document.createElement("a");
  link.href=url;link.download="partiya.pgn";link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  document.querySelector("#copy-pgn").textContent="PGN скачан";
 }
});


window.addEventListener("pagehide",()=>{
 try{
  sessionStorage.setItem(scrollKey,String(window.scrollY||0));
  saveGameState();
 }catch{}
});
restoreSession();
