// Учебные шахматы: основные ходы, простой бот и эффект взятия.
// Пока без шаха, мата, рокировки и взятия на проходе.
const boardElement=document.querySelector("#board");
const statusElement=document.querySelector("#status");
const resetButton=document.querySelector("#reset");
const spriteCache={};
const firstRow=["rook","knight","bishop","queen","king","bishop","knight","rook"];
const files="abcdefgh";
let board,selected,moves,turn,finished,botTimer,audioContext;
function startGame(){
 clearTimeout(botTimer);
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
  cell.addEventListener("click",()=>onSquare(r,c));boardElement.append(cell);
 }
}
function onSquare(r,c){
 if(finished||turn!=="white")return;
 if(selected&&moves.some(m=>m.r===r&&m.c===c)){move(selected.r,selected.c,r,c);return}
 const p=board[r][c];
 if(!p||p.color!=="white"){selected=null;moves=[];statusElement.textContent="Выбери белую фигуру.";render();return}
 selected={r,c};moves=getMoves(r,c);statusElement.textContent="Выбери подсвеченную клетку.";render();
}
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
function getPieceSprite(type,color){
 const key=color+"-"+type;
 if(spriteCache[key])return spriteCache[key];
 const light=color==="white";
 const body=light?"#fff0c7":"#5a527d";
 const shade=light?"#f3b84f":"#9a7cff";
 const edge=light?"#6c4932":"#f1e8ff";
 const face=light?"#4a3428":"#ffffff";
 const accent=light?"#56c8ff":"#ff8c7a";
 const top={
  pawn:'<circle cx="60" cy="30" r="15"/><path d="M42 55 Q60 40 78 55 L75 85 H45 Z"/>',
  rook:'<path d="M34 25 H47 V36 H55 V25 H65 V36 H73 V25 H86 V53 H34 Z"/><rect x="41" y="53" width="38" height="31" rx="8"/>',
  knight:'<path d="M39 83 V59 Q39 43 52 36 L46 27 Q63 22 76 31 Q82 40 79 52 Q76 63 68 67 L78 83 Z"/><path d="M50 35 L61 20 L69 35"/>',
  bishop:'<path d="M60 16 Q79 20 79 39 Q79 51 69 59 L73 82 H47 L51 59 Q41 51 41 39 Q41 20 60 16 Z"/><path d="M53 34 L67 34"/>',
  queen:'<path d="M36 43 L45 24 L59 36 L73 24 L84 43 L78 58 H42 Z"/><rect x="43" y="58" width="34" height="25" rx="9"/>',
  king:'<path d="M56 10 H64 V23 H73 V31 H64 V39 H56 V31 H47 V23 H56 Z"/><path d="M36 46 L47 30 L60 41 L73 30 L84 46 L78 59 H42 Z"/><rect x="43" y="59" width="34" height="24" rx="9"/>'
 }[type];
 const svg='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><ellipse cx="60" cy="105" rx="31" ry="7" fill="rgba(0,0,0,.18)"/><g fill="'+body+'" stroke="'+edge+'" stroke-width="4" stroke-linejoin="round">'+top+'<rect x="34" y="83" width="52" height="14" rx="7" fill="'+shade+'"/></g><circle cx="53" cy="57" r="3.5" fill="'+face+'"/><circle cx="67" cy="57" r="3.5" fill="'+face+'"/><path d="M52 67 Q60 74 68 67" fill="none" stroke="'+face+'" stroke-width="3" stroke-linecap="round"/><circle cx="60" cy="44" r="3.5" fill="'+accent+'"/></svg>';
 spriteCache[key]="data:image/svg+xml;charset=UTF-8,"+encodeURIComponent(svg);
 return spriteCache[key];
}

resetButton.addEventListener("click",startGame);
startGame();
