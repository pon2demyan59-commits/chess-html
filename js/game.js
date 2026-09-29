// Учебные шахматы: основные ходы, простой бот и эффект взятия.
// Пока без шаха, мата, рокировки и взятия на проходе.
const boardElement=document.querySelector("#board");
const statusElement=document.querySelector("#status");
const resetButton=document.querySelector("#reset");
const spriteCache={};
const customSprites={
 "white-pawn":"assets/pieces/fantasy/white-pawn.png",
 "black-pawn":"assets/pieces/fantasy/black-pawn.png"
};
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

resetButton.addEventListener("click",startGame);
startGame();
