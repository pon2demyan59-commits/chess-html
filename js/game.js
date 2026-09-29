// Учебные шахматы: основные ходы, простой бот и эффект взятия.
// Пока без шаха, мата, рокировки и взятия на проходе.
const boardElement=document.querySelector("#board");
const statusElement=document.querySelector("#status");
const resetButton=document.querySelector("#reset");
const spriteCache={};
const firstRow=["rook","knight","bishop","queen","king","bishop","knight","rook"];
const files="abcdefgh";
let board,selected,moves,turn,finished,botTimer,audioContext;
let drag=null;
function startGame(){
 clearTimeout(botTimer);
 cancelDrag();
 board=Array.from({length:8},()=>Array(8).fill(null));
 firstRow.forEach((type,c)=>{board[0][c]={type,color:"black"};board[7][c]={type,color:"white"}});
 for(let c=0;c<8;c++){board[1][c]={type:"pawn",color:"black"};board[6][c]={type:"pawn",color:"white"}}
 selected=null;moves=[];turn="white";finished=false;
 statusElement.textContent="Твой ход: выбери белую фигуру.";render();
}
const inside=(r,c)=>r>=0&&r<8&&c>=0&&c<8;
function getMoves(r,c){
 const p=board[r][c];if(!p)return [];
 const result=[];
 function add(y,x){
  if(!inside(y,x))return false;
  const target=board[y][x];
  if(!target){result.push({r:y,c:x});return true}
  if(target.color!==p.color)result.push({r:y,c:x});
  return false;
 }
 function ray(dy,dx){let y=r+dy,x=c+dx;while(inside(y,x)){if(!add(y,x))break;y+=dy;x+=dx}}
 if(p.type==="pawn"){
  const d=p.color==="white"?-1:1,home=p.color==="white"?6:1;
  if(inside(r+d,c)&&!board[r+d][c]){
   result.push({r:r+d,c});if(r===home&&!board[r+2*d][c])result.push({r:r+2*d,c});
  }
  for(const dx of [-1,1])if(inside(r+d,c+dx)&&board[r+d][c+dx]&&board[r+d][c+dx].color!==p.color)result.push({r:r+d,c:c+dx});
 }else if(p.type==="knight"){
  for(const [dy,dx] of [[2,1],[2,-1],[-2,1],[-2,-1],[1,2],[1,-2],[-1,2],[-1,-2]])add(r+dy,c+dx);
 }else if(p.type==="king"){
  for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)if(dy||dx)add(r+dy,c+dx);
 }else{
  if(p.type==="rook"||p.type==="queen")for(const [dy,dx] of [[1,0],[-1,0],[0,1],[0,-1]])ray(dy,dx);
  if(p.type==="bishop"||p.type==="queen")for(const [dy,dx] of [[1,1],[1,-1],[-1,1],[-1,-1]])ray(dy,dx);
 }
 return result;
}
function render(){
 boardElement.replaceChildren();
 for(let r=0;r<8;r++)for(let c=0;c<8;c++){
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
 if(finished||turn!=="white"||event.button!==0||drag)return;
 const cell=event.target.closest(".square");
 if(!cell||!boardElement.contains(cell))return;
 const r=Number(cell.dataset.row),c=Number(cell.dataset.col);
 const piece=board[r][c];
 if(!piece||piece.color!=="white")return;
 event.preventDefault();
 selected={r,c};moves=getMoves(r,c);render();
 const source=boardElement.children[r*8+c];
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
 if(valid){move(fromR,fromC,toR,toC)}
 else{render();statusElement.textContent="Ход отменён. Возьми фигуру и перетащи её на другую клетку."}
}
boardElement.addEventListener("pointerdown",onPointerDown);
boardElement.addEventListener("pointermove",onPointerMove);
boardElement.addEventListener("pointerup",onPointerUp);
boardElement.addEventListener("pointercancel",()=>{cancelDrag();selected=null;moves=[];render()});
window.addEventListener("blur",()=>{cancelDrag();selected=null;moves=[];render()});
function move(fr,fc,r,c){
 const victim=board[r][c],p=board[fr][fc];
 board[r][c]=p;board[fr][fc]=null;
 if(p.type==="pawn"&&(r===0||r===7))p.type="queen";
 selected=null;moves=[];render();
 if(victim){impact(r,c);playHit()}
 if(victim?.type==="king"){finished=true;statusElement.textContent=p.color==="white"?"Ты победил!":"Компьютер победил!";return}
 turn=p.color==="white"?"black":"white";
 if(turn==="black"){statusElement.textContent=victim?"Попадание! Компьютер думает…":"Компьютер думает…";botTimer=setTimeout(botMove,550)}
 else statusElement.textContent=victim?"Компьютер взял фигуру! Твой ход.":"Твой ход.";
}
function botMove(){
 if(finished||turn!=="black")return;
 const options=[];
 for(let r=0;r<8;r++)for(let c=0;c<8;c++)if(board[r][c]?.color==="black")
  for(const m of getMoves(r,c))options.push({fr:r,fc:c,r:m.r,c:m.c,capture:!!board[m.r][m.c]});
 if(!options.length){finished=true;statusElement.textContent="У компьютера нет ходов.";return}
 const hits=options.filter(o=>o.capture);
 const pool=hits.length&&Math.random()<.8?hits:options;
 const choice=pool[Math.floor(Math.random()*pool.length)];
 move(choice.fr,choice.fc,choice.r,choice.c);
}
function impact(r,c){
 const cell=boardElement.children[r*8+c];if(!cell)return;
 cell.classList.add("square--impact");
 for(let i=0;i<8;i++){const spark=document.createElement("span");spark.className="spark";spark.style.setProperty("--angle",i*45+"deg");cell.append(spark)}
 setTimeout(()=>{cell.classList.remove("square--impact");cell.querySelectorAll(".spark").forEach(s=>s.remove())},650);
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
// Деревянные шахматные фигуры в едином классическом стиле:
// светлый клён против тёмного ореха, мягкие блики и резной контур.
function getPieceSprite(type,color){
 const key=color+"-"+type;
 if(spriteCache[key])return spriteCache[key];
 const light=color==="white";
 const top=light?"#fff3d9":"#976746";
 const middle=light?"#d9b581":"#5b3829";
 const bottom=light?"#aa7747":"#2c1b17";
 const outline=light?"#77512e":"#1c1410";
 const shine=light?"#ffffff":"#bb8a61";
 const shape={
  pawn:'<circle cx="60" cy="31" r="15"/><path d="M47 49 Q60 43 73 49 L71 58 Q63 68 72 86 H48 Q57 68 49 58 Z"/>',
  rook:'<path d="M36 22 H47 V33 H55 V22 H65 V33 H73 V22 H84 V44 L79 50 H41 L36 44 Z"/><path d="M43 52 H77 L73 82 H47 Z"/>',
  knight:'<path d="M40 84 Q44 67 41 55 L32 53 Q28 49 33 42 L43 33 L47 21 L59 30 Q69 29 75 37 Q81 48 73 55 Q66 59 64 68 L72 84 Z"/><path d="M48 24 L53 16 L64 29 Z"/><path d="M35 45 L47 45 L43 52 L33 51 Z"/>',
  bishop:'<path d="M60 16 C75 27 83 38 76 50 Q70 57 69 61 L75 84 H45 L51 61 Q39 53 43 40 Q46 28 60 16 Z"/><path d="M60 25 L54 48" fill="none"/>',
  queen:'<path d="M31 29 L43 47 L48 22 L60 43 L72 22 L77 47 L89 29 L81 63 H39 Z"/><path d="M43 64 H77 L72 84 H48 Z"/>',
  king:'<path d="M57 12 H63 V23 H73 V29 H63 V38 H57 V29 H47 V23 H57 Z"/><path d="M36 43 Q60 28 84 43 L79 61 H41 Z"/><path d="M43 62 H77 L72 84 H48 Z"/>'
 }[type];
 const eyes=type==="knight"?'<circle cx="55" cy="43" r="3.2" fill="'+outline+'"/><path d="M40 49 Q45 51 50 48" fill="none" stroke="'+outline+'" stroke-width="2"/>':'';
 const jewel=type==="queen"?'<circle cx="60" cy="49" r="4" fill="'+(light?"#ad543b":"#d3a65e")+'" stroke="'+outline+'" stroke-width="1.5"/>':'';
 const svg='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120">'+
 '<defs><linearGradient id="wood" x1="0" y1="0" x2="1" y2="0"><stop stop-color="'+bottom+'"/><stop offset=".29" stop-color="'+top+'"/><stop offset=".68" stop-color="'+middle+'"/><stop offset="1" stop-color="'+bottom+'"/></linearGradient>'+
 '<linearGradient id="base" x1="0" y1="0" x2="0" y2="1"><stop stop-color="'+top+'"/><stop offset="1" stop-color="'+bottom+'"/></linearGradient></defs>'+
 '<ellipse cx="60" cy="107" rx="34" ry="6" fill="#000" opacity=".2"/>'+
 '<g fill="url(#wood)" stroke="'+outline+'" stroke-width="3.2" stroke-linejoin="round" stroke-linecap="round">'+shape+
 '<path d="M45 83 H75 Q80 83 81 88 H39 Q40 83 45 83 Z" fill="url(#base)"/>'+
 '<rect x="32" y="88" width="56" height="11" rx="4" fill="url(#base)"/>'+
 '<path d="M33 94 Q60 100 87 94" fill="none" stroke="'+outline+'" opacity=".5" stroke-width="1.7"/></g>'+
 '<path d="M46 88 H72" stroke="'+shine+'" stroke-linecap="round" stroke-width="2.2" opacity=".55"/>'+eyes+jewel+
 '</svg>';
 spriteCache[key]="data:image/svg+xml;charset=UTF-8,"+encodeURIComponent(svg);
 return spriteCache[key];
}

resetButton.addEventListener("click",startGame);
startGame();
