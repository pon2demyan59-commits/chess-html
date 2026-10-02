const t=(message,values)=>window.ChessI18n.t(message,values);
// Учебные шахматы: основные ходы, простой бот и эффект взятия.

const boardElement=document.querySelector("#board");
const statusElement=document.querySelector("#status");
const resetButton=document.querySelector("#reset");
const screens={welcome:document.querySelector("#welcome"),menu:document.querySelector("#menu"),puzzles:document.querySelector("#puzzles"),stats:document.querySelector("#stats"),game:document.querySelector("#game")};
const levelsElement=document.querySelector("#levels");
const SUPABASE_URL="https://rcttgctmieaaegdywbnz.supabase.co";
const SUPABASE_KEY="sb_publishable_6wPIJdK8YSke4Gx3_s0E6A_0uLmi9tP";
const supabaseClient=window.supabase?.createClient(SUPABASE_URL,SUPABASE_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
let onlineMatchId=null,onlineColor=null,onlineOpponent="",onlineVersion=0,onlineChannel=null;
let matchmakingTimer=null,matchmakingStartedAt=0,onlinePolling=false;
const onlineTimeControls={
 blitz3_2:{label:t("Блиц 3+2"),clock:"total",initial:180,increment:2},
 blitz5_0:{label:t("Блиц 5+0"),clock:"total",initial:300,increment:0},
 blitz5_3:{label:t("Блиц 5+3"),clock:"total",initial:300,increment:3},
 rapid10_0:{label:t("Рапид 10+0"),clock:"total",initial:600,increment:0},
 rapid10_5:{label:t("Рапид 10+5"),clock:"total",initial:600,increment:5},
 rapid15_10:{label:t("Рапид 15+10"),clock:"total",initial:900,increment:10},
 standard30:{label:t("Стандарт · 30 сек/ход"),clock:"per_move",initial:30,increment:0}
};
const onlineTimeControlKey="chess-online-time-control-v1";
let selectedOnlineTimeControl=localStorage.getItem(onlineTimeControlKey)||"standard30";
if(!onlineTimeControls[selectedOnlineTimeControl])selectedOnlineTimeControl="standard30";
let onlineClockRow=null,onlineClockTimer=null,onlineTimeoutClaiming=false;
let cloudSyncTimer=null,cloudLoading=false,cloudLoadPromise=null,cloudSaveQueue=Promise.resolve();
const progressTimeKey="chess-progress-updated-at-v1";
let progressUpdatedAt=localStorage.getItem(progressTimeKey)||"1970-01-01T00:00:00.000Z";
function yandexPlatform(){return window.YandexPlatform||null}
function yandexAuthorized(){return !!yandexPlatform()?.isAuthorized?.()}
function setAccountMessage(text,error=false){
 const el=document.querySelector("#account-message");if(!el)return;
 el.textContent=text||"";el.hidden=!text;el.classList.toggle("is-error",!!error);
}
function refreshAccountUI(){
 const platform=yandexPlatform(),connected=!!platform?.isAuthorized?.();
 const chip=document.querySelector("#open-account");
 const title=document.querySelector("#account-chip-title");
 const note=document.querySelector("#account-chip-note");
 if(chip)chip.classList.toggle("is-connected",connected);
 if(title)title.textContent=connected?t("Прогресс в облаке"):t("Играть без авторизации");
 if(note)note.textContent=connected?t("Яндекс ID подключён"):t("Авторизация необязательна");
 const guest=document.querySelector("#account-yandex-guest");
 const signed=document.querySelector("#account-yandex-signed");
 if(guest)guest.hidden=connected;
 if(signed)signed.hidden=!connected;
 const name=document.querySelector("#account-yandex-name");
 if(name&&connected){
  let playerName=t("Игрок");
  try{playerName=platform.player?.getName?.()||t("Игрок")}catch{}
  name.textContent=playerName;
 }
}
function openAccountModal(){
 const modal=document.querySelector("#account-modal");if(!modal)return;
 setAccountMessage("");
 refreshAccountUI();
 modal.hidden=false;
}
function closeAccountModal(){const modal=document.querySelector("#account-modal");if(modal)modal.hidden=true}
function cloudSnapshot(){
 return {
  version:2,
  nickname:getPlayerNickname()||null,
  energy,
  energy_last_at:energyLastAt,
  completed_puzzles:[...completedPuzzles],
  stats,
  level_stats:levelStats,
  piece_theme:pieceTheme,
  updated_at:progressUpdatedAt
 };
}
function saveCloudProgressNow(){
 const platform=yandexPlatform();
 if(!platform?.isAuthorized?.()||cloudLoading)return Promise.resolve(false);
 const snapshot=JSON.parse(JSON.stringify(cloudSnapshot()));
 cloudSaveQueue=cloudSaveQueue.catch(()=>false).then(async()=>{
  try{return await platform.setCloudProgress(snapshot,true)}
  catch(error){console.warn("Yandex cloud save failed:",error);return false}
 });
 return cloudSaveQueue;
}
function scheduleCloudSync(){
 if(cloudLoading)return;
 progressUpdatedAt=new Date().toISOString();
 try{localStorage.setItem(progressTimeKey,progressUpdatedAt)}catch{}
 if(!yandexAuthorized())return;
 clearTimeout(cloudSyncTimer);
 cloudSyncTimer=setTimeout(()=>saveCloudProgressNow(),700);
}
function applyCloudProgress(row){
 if(!row||typeof row!=="object")return;
 cloudLoading=true;
 const localTime=Date.parse(progressUpdatedAt)||0,cloudTime=Date.parse(row.updated_at)||0;
 const cloudIsNewer=cloudTime>localTime;
 const counter=value=>Number.isSafeInteger(value)&&value>=0?value:0;
 try{
  if(cloudIsNewer&&row.nickname){localStorage.setItem(nicknameKey,String(row.nickname).slice(0,24))}
  if(cloudIsNewer&&Number.isInteger(row.energy)){energy=Math.max(0,Math.min(MAX_ENERGY,row.energy));localStorage.setItem(energyKey,String(energy))}
  if(cloudIsNewer&&Number.isFinite(Number(row.energy_last_at))&&Number(row.energy_last_at)>0){energyLastAt=Number(row.energy_last_at);localStorage.setItem(energyTimeKey,String(energyLastAt))}
  if(Array.isArray(row.completed_puzzles)){completedPuzzles=new Set([...completedPuzzles,...row.completed_puzzles.filter(id=>typeof id==="string")]);saveCompletedPuzzles()}
  if(row.stats&&typeof row.stats==="object"){
   for(const side of ["white","black"])for(const outcome of ["wins","losses","draws"])stats[side][outcome]=Math.max(stats[side][outcome],counter(row.stats[side]?.[outcome]));
   localStorage.setItem(statsKey,JSON.stringify(stats));
  }
  if(Array.isArray(row.level_stats)){
   for(let i=0;i<levelStats.length;i++)for(const outcome of ["wins","losses","draws"])levelStats[i][outcome]=Math.max(levelStats[i][outcome],counter(row.level_stats[i]?.[outcome]));
   localStorage.setItem(levelStatsKey,JSON.stringify(levelStats));
  }
  if(cloudIsNewer&&["fantasy","classic","wood","neon"].includes(row.piece_theme))setPieceTheme(row.piece_theme);
  progressUpdatedAt=new Date(Math.max(localTime,cloudTime)).toISOString();
  localStorage.setItem(progressTimeKey,progressUpdatedAt);
  refreshProfileUI();renderEnergy();renderPuzzleHub();showStats();
 }finally{cloudLoading=false}
}
function loadCloudProgress(){
 if(cloudLoadPromise)return cloudLoadPromise;
 cloudLoadPromise=loadCloudProgressOnce().finally(()=>{cloudLoadPromise=null});
 return cloudLoadPromise;
}
async function loadCloudProgressOnce(){
 const platform=yandexPlatform();if(!platform?.isAuthorized?.())return false;
 cloudLoading=true;clearTimeout(cloudSyncTimer);
 const wasInert=Object.values(screens).map(screen=>screen.inert);
 for(const screen of Object.values(screens))screen.inert=true;
 try{
  await cloudSaveQueue;
  const data=await platform.getCloudProgress();
  if(data)applyCloudProgress(data);
  cloudLoading=false;
  // Keep writes serialized, but do not lock the board while an optional save waits.
  saveCloudProgressNow();
  return true;
 }catch(error){console.warn("Yandex cloud load failed:",error);return false}
 finally{cloudLoading=false;Object.values(screens).forEach((screen,index)=>screen.inert=wasInert[index])}
}
async function accountYandexLogin(){
 const platform=yandexPlatform();
 if(!platform){setAccountMessage(t("SDK Яндекс Игр пока недоступен."),true);return}
 setAccountMessage(t("Открываем вход через Яндекс…"));
 try{
  const player=await platform.authorize();
  if(!player?.isAuthorized?.()){setAccountMessage(t("Вход не выполнен. Можно продолжить играть без авторизации."));refreshAccountUI();return}
  refreshAccountUI();
  const synced=await loadCloudProgress();
  setAccountMessage(synced?t("Яндекс ID подключён. Прогресс синхронизирован."):t("Вход выполнен. Облако недоступно, локальный прогресс сохранён."),!synced);
 }catch(error){
  console.warn("Yandex authorization failed:",error);
  setAccountMessage(t("Не удалось выполнить вход через Яндекс. Попробуй позже."),true);
 }
}
async function accountYandexSync(){
 setAccountMessage(t("Синхронизируем прогресс…"));
 const ok=await saveCloudProgressNow();
 setAccountMessage(ok?t("Прогресс сохранён в облаке."):t("Не удалось сохранить прогресс."),!ok);
}
async function initializeAccount(){
 const platform=yandexPlatform();if(!platform)return;
 try{
  await platform.init();
  refreshAccountUI();
  if(platform.isAuthorized())await loadCloudProgress();
 }catch(error){console.warn("Yandex Player init failed:",error)}
 window.addEventListener("yandex-player-changed",refreshAccountUI);
}

// The introductory visit stays free across reloads in the same tab.
const onboardingSessionKey="chess-intro-session-v1";
let introductorySession=sessionStorage.getItem(onboardingSessionKey);
if(introductorySession===null){
 introductorySession=localStorage.getItem("chess-intro-seen-v1")?"returning":"first";
 sessionStorage.setItem(onboardingSessionKey,introductorySession);
 localStorage.setItem("chess-intro-seen-v1","1");
}
let introductoryActiveMs=Math.max(0,Number(localStorage.getItem("chess-intro-active-ms-v1"))||0);
let introductoryTickAt=performance.now();
let lastIntroductoryFree=null;
function introductoryFreePlay(){return introductorySession==="first"||introductoryActiveMs<180000}
function completedIntroActivities(){
 return completedPuzzles.size+Object.values(stats).reduce((sum,side)=>sum+side.wins+side.losses+side.draws,0);
}
function canOfferEnergyAd(){return !introductoryFreePlay()&&completedIntroActivities()>=5}
function tickIntroduction(){
 const now=performance.now(),elapsed=Math.min(1500,Math.max(0,now-introductoryTickAt));introductoryTickAt=now;
 if(!document.hidden&&!platformPaused&&screens.welcome.hidden){
  introductoryActiveMs+=elapsed;
  localStorage.setItem("chess-intro-active-ms-v1",String(introductoryActiveMs));
 }
}

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
const pieceThemeKey="chess-piece-theme-v1";
let pieceTheme=localStorage.getItem(pieceThemeKey)||"fantasy";
const pieceGlyphs={
 white:{king:"♔",queen:"♕",rook:"♖",bishop:"♗",knight:"♘",pawn:"♙"},
 black:{king:"♚",queen:"♛",rook:"♜",bishop:"♝",knight:"♞",pawn:"♟"}
};
function themedGlyphSprite(type,color,theme){
 const glyph=pieceGlyphs[color]?.[type]||"♟";
 const palettes={
  classic:color==="white"
   ?{fill:"#f7f1df",stroke:"#28231f",glow:"transparent"}
   :{fill:"#24211f",stroke:"#eadfc7",glow:"transparent"},
  wood:color==="white"
   ?{fill:"#e1b56e",stroke:"#5b3219",glow:"#b36d2a"}
   :{fill:"#6f3e20",stroke:"#e0b16c",glow:"#4b240f"},
  neon:color==="white"
   ?{fill:"#9ff5ff",stroke:"#e9feff",glow:"#24d7ff"}
   :{fill:"#ff6bd5",stroke:"#ffe4f7",glow:"#ff2bbf"}
 };
 const p=palettes[theme]||palettes.classic;
 const filter=theme==="neon"
  ?`<filter id="g"><feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>`
  :"";
 const svg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120">${filter}<text x="60" y="91" text-anchor="middle" font-size="91" font-family="Georgia,Times New Roman,serif" font-weight="700" fill="${p.fill}" stroke="${p.stroke}" stroke-width="2.2" paint-order="stroke" ${theme==="neon"?'filter="url(#g)"':""}>${glyph}</text></svg>`;
 return "data:image/svg+xml;charset=UTF-8,"+encodeURIComponent(svg);
}
function setPieceTheme(theme,markProgress=true){
 if(!["fantasy","classic","wood","neon"].includes(theme))theme="fantasy";
 pieceTheme=theme;
 try{localStorage.setItem(pieceThemeKey,theme)}catch{}
 document.documentElement.dataset.pieceTheme=theme;
 document.querySelectorAll("[data-piece-theme]").forEach(button=>{
  const selected=button.dataset.pieceTheme===theme;
  button.classList.toggle("is-selected",selected);
  button.setAttribute("aria-pressed",String(selected));
 });
 if(boardElement&&typeof board!=="undefined")render();
 if(markProgress)scheduleCloudSync();
}
const names={p:"pawn",n:"knight",b:"bishop",r:"rook",q:"queen",k:"king"};
const colorName=x=>x==="w"?"white":"black";
let chess=new Chess();
const square=(r,c)=>files[c]+(8-r);
function syncBoard(){board=chess.board().map(row=>row.map(p=>p&&{type:names[p.type],color:colorName(p.color)}));turn=colorName(chess.turn())}
const files="abcdefgh";
const puzzles=[ {id:"m1-12",category:"mate1",side:"black",piece:"R",label:t("Мат ладьёй"),fen:"8/8/8/7K/3k4/8/6r1/1r6 b - - 0 1",from:[7,1],to:[7,7]}, {id:"m1-43",category:"mate1",side:"white",piece:"P",label:t("Мат пешкой"),fen:"7k/5K2/6P1/8/4B3/8/8/8 w - - 0 1",from:[2,6],to:[1,6]}, {id:"m1-16",category:"mate1",side:"black",piece:"R",label:t("Мат ладьёй"),fen:"5k2/2q5/8/1p6/r7/1K6/8/1N4r1 b - - 0 1",from:[7,6],to:[7,1]}, {id:"m1-31",category:"mate1",side:"white",piece:"N",label:t("Мат конём"),fen:"8/8/8/K4QNN/7k/8/4N3/8 w - - 0 1",from:[3,6],to:[5,5]}, {id:"m1-38",category:"mate1",side:"black",piece:"N",label:t("Мат конём"),fen:"8/8/8/2n1R3/8/8/4n1r1/k4b1K b - - 0 1",from:[6,4],to:[5,6]}, {id:"m1-20",category:"mate1",side:"black",piece:"R",label:t("Мат ладьёй"),fen:"7K/2r5/8/8/3r4/8/5k2/7b b - - 0 1",from:[4,3],to:[0,3]}, {id:"m1-45",category:"mate1",side:"white",piece:"P",label:t("Мат пешкой"),fen:"k7/2K5/1P6/8/8/8/5B2/8 w - - 0 1",from:[2,1],to:[1,1]}, {id:"m1-02",category:"mate1",side:"black",piece:"Q",label:t("Мат ферзём"),fen:"6K1/3q4/8/8/1q6/8/2n5/k7 b - - 0 1",from:[4,1],to:[0,1]}, {id:"m1-33",category:"mate1",side:"white",piece:"N",label:t("Мат конём"),fen:"4kN2/1K2P3/8/1N6/8/8/8/4R3 w - - 0 1",from:[3,1],to:[2,3]}, {id:"m1-42",category:"mate1",side:"black",piece:"P",label:t("Мат пешкой"),fen:"8/8/4b3/8/8/1p6/2k5/K7 b - - 0 1",from:[5,1],to:[6,1]}, {id:"m1-50",category:"mate1",side:"black",piece:"P",label:t("Мат пешкой"),fen:"8/8/7b/8/3r4/K4p1q/8/1k6 b - - 0 1",from:[5,5],to:[6,5]}, {id:"m1-06",category:"mate1",side:"black",piece:"Q",label:t("Мат ферзём"),fen:"8/8/3q2r1/8/4k3/8/2q3n1/5K2 b - - 0 1",from:[2,3],to:[7,3]}, {id:"m1-41",category:"mate1",side:"white",piece:"P",label:t("Мат пешкой"),fen:"7k/5K2/6P1/8/8/8/2B5/8 w - - 0 1",from:[2,6],to:[1,6]}, {id:"m1-13",category:"mate1",side:"white",piece:"R",label:t("Мат ладьёй"),fen:"3k4/8/3K4/1R5B/1Q4N1/8/8/8 w - - 0 1",from:[3,1],to:[0,1]}, {id:"m1-23",category:"mate1",side:"white",piece:"B",label:t("Мат слоном"),fen:"7k/7N/4B2K/8/7B/8/2n5/8 w - - 0 1",from:[4,7],to:[2,5]}, {id:"m1-14",category:"mate1",side:"black",piece:"R",label:t("Мат ладьёй"),fen:"8/8/4k3/8/3r4/8/5r2/1K6 b - - 0 1",from:[4,3],to:[7,3]}, {id:"m1-34",category:"mate1",side:"black",piece:"N",label:t("Мат конём"),fen:"2K1n1q1/8/1k6/8/8/7p/6n1/8 b - - 0 1",from:[0,4],to:[2,5]}, {id:"m1-17",category:"mate1",side:"white",piece:"R",label:t("Мат ладьёй"),fen:"1k6/8/K1R5/8/8/8/8/2R5 w - - 0 1",from:[2,2],to:[0,2]}, {id:"m1-30",category:"mate1",side:"black",piece:"B",label:t("Мат слоном"),fen:"8/6k1/8/8/7p/2p5/8/2K2br1 b - - 0 1",from:[7,5],to:[5,3]}, {id:"m1-32",category:"mate1",side:"black",piece:"N",label:t("Мат конём"),fen:"8/3n4/8/8/4n3/8/r3n2k/1K6 b - - 0 1",from:[4,4],to:[5,2]}, {id:"m1-04",category:"mate1",side:"black",piece:"Q",label:t("Мат ферзём"),fen:"6K1/2q5/8/5n2/8/2k4b/8/8 b - - 0 1",from:[1,2],to:[1,6]}, {id:"m1-09",category:"mate1",side:"white",piece:"Q",label:t("Мат ферзём"),fen:"1K6/8/8/8/Q2Q4/8/8/1k6 w - - 0 1",from:[4,3],to:[7,0]}, {id:"m1-26",category:"mate1",side:"black",piece:"B",label:t("Мат слоном"),fen:"8/8/5b2/8/4k3/7q/8/6K1 b - - 0 1",from:[2,5],to:[4,3]}, {id:"m1-10",category:"mate1",side:"black",piece:"Q",label:t("Мат ферзём"),fen:"8/8/6q1/1p6/7K/k4bp1/8/8 b - - 0 1",from:[2,6],to:[4,6]}, {id:"m1-11",category:"mate1",side:"white",piece:"R",label:t("Мат ладьёй"),fen:"k7/B6R/8/8/4R3/3K4/8/8 w - - 0 1",from:[4,4],to:[0,4]}, {id:"m1-46",category:"mate1",side:"black",piece:"P",label:t("Мат пешкой"),fen:"8/8/3b4/8/8/6p1/5k2/7K b - - 0 1",from:[5,6],to:[6,6]}, {id:"m1-21",category:"mate1",side:"white",piece:"B",label:t("Мат слоном"),fen:"8/1P6/8/8/5K2/6Bk/4B3/8 w - - 0 1",from:[6,4],to:[7,5]}, {id:"m1-27",category:"mate1",side:"white",piece:"B",label:t("Мат слоном"),fen:"1K4B1/7p/8/8/8/8/5Q2/7k w - - 0 1",from:[0,6],to:[3,3]}, {id:"m1-01",category:"mate1",side:"white",piece:"Q",label:t("Мат ферзём"),fen:"1k6/8/7K/4N3/4Q3/3P1Q2/8/8 w - - 0 1",from:[4,4],to:[1,1]}, {id:"m1-47",category:"mate1",side:"white",piece:"P",label:t("Мат пешкой"),fen:"k7/2K5/1P6/8/3B4/8/8/8 w - - 0 1",from:[2,1],to:[1,1]}, {id:"m1-28",category:"mate1",side:"black",piece:"B",label:t("Мат слоном"),fen:"3K1b2/1r6/k2n4/8/8/8/8/8 b - - 0 1",from:[0,5],to:[1,4]}, {id:"m1-07",category:"mate1",side:"white",piece:"Q",label:t("Мат ферзём"),fen:"7B/7k/5Q2/8/1B6/8/8/5K2 w - - 0 1",from:[2,5],to:[1,6]}, {id:"m1-44",category:"mate1",side:"black",piece:"P",label:t("Мат пешкой"),fen:"8/8/8/8/2b5/1p6/2k5/K7 b - - 0 1",from:[5,1],to:[6,1]}, {id:"m1-05",category:"mate1",side:"white",piece:"Q",label:t("Мат ферзём"),fen:"2B1Q3/6P1/6B1/8/8/7K/8/7k w - - 0 1",from:[0,4],to:[7,4]}, {id:"m1-39",category:"mate1",side:"white",piece:"N",label:t("Мат конём"),fen:"2k5/2PN4/8/8/K5B1/6Q1/8/8 w - - 0 1",from:[1,3],to:[3,2]}, {id:"m1-08",category:"mate1",side:"black",piece:"Q",label:t("Мат ферзём"),fen:"K7/3n1k2/8/8/8/8/8/1q6 b - - 0 1",from:[7,1],to:[0,1]}, {id:"m1-19",category:"mate1",side:"white",piece:"R",label:t("Мат ладьёй"),fen:"8/7K/8/8/R7/8/2R5/7k w - - 0 1",from:[4,0],to:[7,0]}, {id:"m1-25",category:"mate1",side:"white",piece:"B",label:t("Мат слоном"),fen:"1B3K2/8/8/8/8/k4B2/2Q3Q1/8 w - - 0 1",from:[0,1],to:[2,3]}, {id:"m1-36",category:"mate1",side:"black",piece:"N",label:t("Мат конём"),fen:"kN5K/4r3/8/7n/6b1/8/8/7r b - - 0 1",from:[3,7],to:[2,5]}, {id:"m1-40",category:"mate1",side:"black",piece:"N",label:t("Мат конём"),fen:"6k1/8/7b/8/8/8/8/1n1Kn1r1 b - - 0 1",from:[7,1],to:[5,2]}, {id:"m1-48",category:"mate1",side:"black",piece:"P",label:t("Мат пешкой"),fen:"8/8/8/8/5b2/6p1/5k2/7K b - - 0 1",from:[5,6],to:[6,6]}, {id:"m1-03",category:"mate1",side:"white",piece:"Q",label:t("Мат ферзём"),fen:"8/2Pb4/8/8/1K6/Q7/Q7/4k3 w - - 0 1",from:[5,0],to:[7,2]}, {id:"m1-35",category:"mate1",side:"white",piece:"N",label:t("Мат конём"),fen:"8/1P1R4/8/8/8/3K4/3B4/3k3N w - - 0 1",from:[7,7],to:[6,5]}, {id:"m1-22",category:"mate1",side:"black",piece:"B",label:t("Мат слоном"),fen:"4b3/8/3b4/8/8/1q6/3K4/5k2 b - - 0 1",from:[2,3],to:[4,5]}, {id:"m1-18",category:"mate1",side:"black",piece:"R",label:t("Мат ладьёй"),fen:"8/K3p3/8/1q6/8/6k1/8/2r5 b - - 0 1",from:[7,2],to:[7,0]}, {id:"m1-37",category:"mate1",side:"white",piece:"N",label:t("Мат конём"),fen:"4R3/5k2/8/6K1/P3N3/8/1B6/8 w - - 0 1",from:[4,4],to:[2,3]}, {id:"m1-24",category:"mate1",side:"black",piece:"B",label:t("Мат слоном"),fen:"k2q4/8/K3p3/4b3/8/8/2b5/8 b - - 0 1",from:[6,2],to:[5,3]}, {id:"m1-49",category:"mate1",side:"white",piece:"P",label:t("Мат пешкой"),fen:"2k3r1/3R4/1P6/8/8/2K4B/7B/8 w - - 0 1",from:[2,1],to:[1,1]}, {id:"m1-29",category:"mate1",side:"white",piece:"B",label:t("Мат слоном"),fen:"5k2/5P2/5K2/8/8/8/7B/8 w - - 0 1",from:[6,7],to:[2,3]}, {id:"m1-15",category:"mate1",side:"white",piece:"R",label:t("Мат ладьёй"),fen:"8/5R2/8/1Q6/8/2P5/3P4/k4K2 w - - 0 1",from:[1,5],to:[1,0]}];
const mate2Puzzles=window.MATE2_PUZZLES||[];
const mate3Puzzles=window.MATE3_PUZZLES||[];
const mate4Puzzles=window.MATE4_PUZZLES||[];
const mate5Puzzles=window.MATE5_PUZZLES||[];
const tacticPuzzles=window.TACTIC_PUZZLES||{};
const tacticCategories=Object.keys(tacticPuzzles);
const tacticLabels={
 "tactic-fork":t("Вилка"),"tactic-pin":t("Связка"),"tactic-skewer":t("Сквозной удар"),
 "tactic-discovered":t("Вскрытое нападение"),"tactic-doublecheck":t("Двойной шах"),
 "tactic-deflection":t("Отвлечение"),"tactic-defender":t("Уничтожение защитника"),
 "tactic-interference":t("Перекрытие"),"tactic-sacrifice":t("Жертва")
};
let selectedTacticCategory="tactic-fork";
let puzzleCategory="mate1",puzzleStep=0,puzzleLine=[];
const PUZZLES_PER_CHAPTER=25,CHAPTERS_PER_PAGE=10;
const puzzleChapterState={
 mate1:{selected:0,page:0},mate2:{selected:0,page:0},mate3:{selected:0,page:0},mate4:{selected:0,page:0},mate5:{selected:0,page:0},
 ...Object.fromEntries(tacticCategories.map(category=>[category,{selected:0,page:0}]))
};
const isTacticCategory=category=>category.startsWith("tactic-")&&Array.isArray(tacticPuzzles[category]);
function normalizePuzzleCategory(category){
 if(["mate1","mate2","mate3","mate4","mate5"].includes(category)||isTacticCategory(category))return category;
 return "mate1";
}
const introductoryPuzzleIds=["m1-17","m1-09","m1-12","m1-14","m1-43"];
const introductoryPuzzles=[...introductoryPuzzleIds.map(id=>puzzles.find(p=>p.id===id)),...puzzles.filter(p=>!introductoryPuzzleIds.includes(p.id))];
function listForCategory(category){
 if(isTacticCategory(category))return tacticPuzzles[category]||[];
 return category==="mate5"?mate5Puzzles:category==="mate4"?mate4Puzzles:category==="mate3"?mate3Puzzles:category==="mate2"?mate2Puzzles:introductoryPuzzles;
}
const activePuzzles=()=>listForCategory(puzzleCategory);
const puzzleMoveCount=()=>puzzleCategory==="mate5"?5:puzzleCategory==="mate4"?4:puzzleCategory==="mate3"?3:puzzleCategory==="mate2"?2:1;
let board,selected,moves,turn,finished,botTimer,audioContext;
let drag=null,pendingPromotion=null;
let sceneTimers=[];
let moving=false,motionToken=0,motionTimer=null,motionGhosts=[];
let lastMove=null,reviewMode=false,reviewPly=0,reviewMoves=[],reviewStartFen="",finalMessage="";
const difficultyNames=[t("Пешка"),t("Слон"),t("Конь"),t("Ладья"),t("Офицер"),t("Король")];
let playerColor="white",botColor="black",menuSide="white",difficultyLevel=1,gameStarted=false,gameMode="match",puzzleIndex=0;
let platformPaused=false;
const pauseReasons=new Set(document.hidden?["hidden"]:[]);
platformPaused=pauseReasons.size>0;
const gameplayTimers=new Set();
let pausedAnimations=[];
function gameplayAfter(delay,fn){
 const timer={remaining:delay,started:0,id:null,fn};
 gameplayTimers.add(timer);armGameplayTimer(timer);return timer;
}
function armGameplayTimer(timer){
 if(platformPaused)return;
 timer.started=performance.now();
 timer.id=setTimeout(()=>{timer.id=null;gameplayTimers.delete(timer);timer.fn()},timer.remaining);
}
function cancelGameplayTimer(timer){
 if(!timer)return;clearTimeout(timer.id);gameplayTimers.delete(timer);
}
function platformGameplayStart(){if(!platformPaused)window.YandexPlatform?.gameplayStart?.()}
function platformGameplayStop(){window.YandexPlatform?.gameplayStop?.()}
function gameplayIsActive(){return gameStarted&&!finished&&!screens.game.hidden&&!platformPaused}
function audioIsAllowed(){return !platformPaused&&!document.hidden&&!screens.game.hidden}
function suspendGameAudio(){
 try{if(audioContext&&audioContext.state==="running")audioContext.suspend()}catch{}
}
function resumeGameAudio(){
 try{if(audioContext&&audioContext.state==="suspended"&&audioIsAllowed())audioContext.resume()}catch{}
}
function setPauseReason(reason,paused){
 if(paused)pauseReasons.add(reason);else pauseReasons.delete(reason);
 const next=pauseReasons.size>0;if(next===platformPaused)return;
 platformPaused=next;
 if(next){
  platformGameplayStop();suspendGameAudio();clearTimeout(botTimer);
  for(const timer of gameplayTimers){if(timer.id!==null){clearTimeout(timer.id);timer.id=null;timer.remaining=Math.max(0,timer.remaining-(performance.now()-timer.started))}}
  pausedAnimations=(document.getAnimations?.()||[]).filter(animation=>animation.playState==="running");
  for(const animation of pausedAnimations)animation.pause();
  cancelDrag();selected=null;moves=[];if(board&&!moving)render();
 }else{
  for(const animation of pausedAnimations){try{animation.play()}catch{}}pausedAnimations=[];
  for(const timer of gameplayTimers)armGameplayTimer(timer);
  if(gameplayIsActive())platformGameplayStart();resumeGameAudio();
  if(gameplayIsActive()&&gameMode==="match"&&turn===botColor&&!moving){clearTimeout(botTimer);botTimer=setTimeout(botMove,500)}
 }
}
function handlePlatformPause(){setPauseReason("sdk",true)}
function handlePlatformResume(){setPauseReason("sdk",false)}
function isMobileViewport(){
 return matchMedia("(pointer:coarse)").matches||Math.min(innerWidth,innerHeight)<700;
}
async function requestMobileFullscreen(){
 if(!isMobileViewport()||document.fullscreenElement)return;
 try{
  if(window.YandexPlatform?.requestFullscreen){
   const ok=await window.YandexPlatform.requestFullscreen();
   if(ok)return;
  }
  const target=document.documentElement;
  if(target.requestFullscreen)await target.requestFullscreen({navigationUI:"hide"});
  else if(target.webkitRequestFullscreen)target.webkitRequestFullscreen();
 }catch{/* Полноэкранный режим может быть недоступен в конкретном браузере/iframe. */}
}
function currentScreenElement(){return Object.values(screens).find(el=>!el.hidden)||screens.welcome}

const statsKey="free-time-chess-stats-v1";
const levelStatsKey="free-time-chess-level-stats-v1";
const energyKey="free-time-chess-energy-v1";
const energyTimeKey="free-time-chess-energy-time-v1";
const completedPuzzleKey="free-time-chess-completed-puzzles-v1";
const screenKey="free-time-chess-screen-v1";
const gameStateKey="free-time-chess-game-state-v1";
const scrollKey="free-time-chess-scroll-v1";
const MAX_ENERGY=50;
const ENERGY_REGEN_MS=30*60*1000;
let energy=loadEnergy();
let energyLastAt=loadEnergyTime();
let completedPuzzles=loadCompletedPuzzles();

function loadEnergy(){
 const raw=localStorage.getItem(energyKey);
 if(raw===null)return MAX_ENERGY;
 const saved=Number(raw);
 return Number.isInteger(saved)?Math.max(0,Math.min(MAX_ENERGY,saved)):MAX_ENERGY;
}
function loadEnergyTime(){
 const saved=Number(localStorage.getItem(energyTimeKey));
 return Number.isFinite(saved)&&saved>0?saved:Date.now();
}
function loadCompletedPuzzles(){
 try{
  const saved=JSON.parse(localStorage.getItem(completedPuzzleKey)||"[]");
  return new Set(Array.isArray(saved)?saved:[]);
 }catch{return new Set()}
}
function saveCompletedPuzzles(){
 try{localStorage.setItem(completedPuzzleKey,JSON.stringify([...completedPuzzles]))}catch{}
}
function markPuzzleComplete(id){
 if(!id||completedPuzzles.has(id))return false;
 completedPuzzles.add(id);saveCompletedPuzzles();renderPuzzleHub();scheduleCloudSync();return true;
}
function applyTimedEnergy(){
 if(energy>=MAX_ENERGY)return;
 const now=Date.now();
 const elapsed=Math.max(0,now-energyLastAt);
 const gained=Math.floor(elapsed/ENERGY_REGEN_MS);
 if(!gained)return;
 energy=Math.min(MAX_ENERGY,energy+gained);
 energyLastAt=energy>=MAX_ENERGY?now:energyLastAt+gained*ENERGY_REGEN_MS;
 saveEnergy();
}
function energyCountdown(){
 if(energy>=MAX_ENERGY)return t("Запас энергии полный");
 const remain=Math.max(0,ENERGY_REGEN_MS-(Date.now()-energyLastAt));
 const total=Math.ceil(remain/1000);
 const minutes=Math.floor(total/60);
 const seconds=total%60;
 return t("+1 ⚡ через {0}:{1}",[String(minutes).padStart(2,"0"),String(seconds).padStart(2,"0")]);
}
function renderEnergy(message=""){
 const free=introductoryFreePlay();
 if(lastIntroductoryFree!==null&&lastIntroductoryFree!==free)renderPuzzleHub();
 lastIntroductoryFree=free;
 const adNote=document.querySelector(".puzzle-hero__adnote");if(adNote)adNote.hidden=!canOfferEnergyAd();
 for(const selector of [".energy-card",".puzzles-energy","#energy-timer"]){const element=document.querySelector(selector);if(element)element.hidden=free}
 for(const selector of ["#energy-ad","#puzzles-energy-ad"]){const element=document.querySelector(selector);if(element)element.hidden=!canOfferEnergyAd()}
 if(free){message=message||(introductorySession==="first"?t("Знакомься с игрой без ограничений: задачи в первой сессии бесплатны."):t("Первые минуты знакомства — без расхода энергии."))}
 else if(!message){
  const note=document.querySelector("#energy-note");
  if(note?.textContent.includes(t("без ограничений"))||note?.textContent.includes(t("без расхода энергии")))message=t("Новые задачи расходуют 1 ⚡. Первые пять задач и повтор решённых — бесплатно.");
 }
 applyTimedEnergy();
 for(const id of ["#energy-value","#puzzles-energy-value"]){
  const el=document.querySelector(id);if(el)el.textContent=energy;
 }
 for(const id of ["#energy-max","#puzzles-energy-max"]){
  const el=document.querySelector(id);if(el)el.textContent=MAX_ENERGY;
 }
 const timerText=energyCountdown();
 for(const id of ["#energy-timer","#puzzles-energy-timer"]){
  const el=document.querySelector(id);if(el)el.textContent=timerText;
 }
 const note=document.querySelector("#energy-note");
 const puzzleMessage=document.querySelector("#puzzles-energy-message");
 if(note&&message)note.textContent=message;
 if(puzzleMessage&&message)puzzleMessage.textContent=message;
}
function saveEnergy(){
 try{
  localStorage.setItem(energyKey,String(energy));
  localStorage.setItem(energyTimeKey,String(energyLastAt));
 }catch{}
 scheduleCloudSync();
}
function addEnergy(amount,message){
 applyTimedEnergy();
 energy=Math.min(MAX_ENERGY,energy+amount);
 if(energy>=MAX_ENERGY)energyLastAt=Date.now();
 saveEnergy();renderEnergy(message||t("Энергия пополнена: {0}/{1}.",[energy,MAX_ENERGY]));
}
function spendEnergy(amount=1){
 if(introductoryFreePlay())return true;
 applyTimedEnergy();
 if(energy<amount){
  renderEnergy(t("Энергия закончилась. Подожди восстановления, сыграй партию или посмотри рекламу."));
  return false;
 }
 if(energy===MAX_ENERGY)energyLastAt=Date.now();
 energy-=amount;saveEnergy();renderEnergy();return true;
}
function categoryGridId(category){return isTacticCategory(category)?"#tactic-grid":category==="mate1"?"#puzzle-grid":`#${category}-grid`}
function renderPuzzleCategory(category){
 const list=listForCategory(category),state=puzzleChapterState[category];
 const chapterCount=Math.max(1,Math.ceil(list.length/PUZZLES_PER_CHAPTER));
 state.selected=Math.max(0,Math.min(chapterCount-1,state.selected));
 const pageCount=Math.max(1,Math.ceil(chapterCount/CHAPTERS_PER_PAGE));
 state.page=Math.max(0,Math.min(pageCount-1,state.page));
 const chapterStart=state.selected*PUZZLES_PER_CHAPTER;
 const chapterEnd=Math.min(list.length,chapterStart+PUZZLES_PER_CHAPTER);
 const tactic=isTacticCategory(category);
 if(tactic){
  const bankTitle=document.querySelector("#tactic-bank-title");
  const desc=document.querySelector("#tactic-bank-description");
  if(bankTitle)bankTitle.textContent=tacticLabels[category]||t("Тактика");
  if(desc)desc.textContent=t("Найди лучший ход и проведи тактическую комбинацию до конца.");
 }
 const title=document.querySelector(tactic?"#tactic-chapter-title":`#${category}-chapter-title`);
 if(title)title.textContent=t("Глава {0} · задачи {1}–{2}",[state.selected+1,chapterStart+1,chapterEnd]);

 const chapters=document.querySelector(tactic?"#tactic-chapters":`#${category}-chapters`);
 if(chapters){
  chapters.replaceChildren();
  const first=state.page*CHAPTERS_PER_PAGE,last=Math.min(chapterCount,first+CHAPTERS_PER_PAGE);
  for(let chapter=first;chapter<last;chapter++){
   const start=chapter*PUZZLES_PER_CHAPTER,end=Math.min(list.length,start+PUZZLES_PER_CHAPTER);
   const solved=list.slice(start,end).filter(p=>completedPuzzles.has(p.id)).length;
   const total=end-start;
   const button=document.createElement("button");
   button.type="button";
   button.className="puzzle-chapter"+(solved===total?" is-complete":"")+(chapter===state.selected?" is-selected":"");
   button.innerHTML=t("<strong>Глава {0}</strong><span>Задачи {1}–{2}</span><b>{3}/{4} решено</b>",[chapter+1,start+1,end,solved,total]);
   button.addEventListener("click",()=>{
    state.selected=chapter;
    renderPuzzleCategory(category);
    document.querySelector(categoryGridId(category))?.scrollIntoView({behavior:"smooth",block:"center"});
   });
   chapters.append(button);
  }
 }
 const pager=tactic?null:document.querySelector(`#${category}-chapter-pager`);
 if(pager){
  pager.replaceChildren();
  const prev=document.createElement("button");prev.type="button";prev.textContent="←";prev.disabled=state.page===0;
  const info=document.createElement("span");info.textContent=`${state.page+1}/${pageCount}`;
  const next=document.createElement("button");next.type="button";next.textContent="→";next.disabled=state.page===pageCount-1;
  prev.addEventListener("click",()=>{state.page--;renderPuzzleCategory(category)});
  next.addEventListener("click",()=>{state.page++;renderPuzzleCategory(category)});
  pager.append(prev,info,next);
 }
 const grid=document.querySelector(categoryGridId(category));
 if(grid){
  grid.replaceChildren();
  for(let index=chapterStart;index<chapterEnd;index++){
   const p=list[index],done=completedPuzzles.has(p.id);
   const button=document.createElement("button");
   button.type="button";button.className="puzzle-tile"+(done?" is-complete":"");
   button.setAttribute("aria-label",t("Задача {0}{1}",[index+1,done?t(", решена"):""]));
   const number=document.createElement("strong");number.textContent=index+1;
   const status=document.createElement("span");status.textContent=done?t("✓ Решена"):introductoryFreePlay()||introductoryPuzzleIds.includes(p.id)?t("Бесплатно"):"1 ⚡";
   button.append(number,status);
   button.addEventListener("click",()=>startPuzzleWithEnergy(index,category));
   grid.append(button);
  }
 }
}
function renderPuzzleHub(){
 for(const category of ["mate1","mate2","mate3","mate4","mate5"]){
  const list=listForCategory(category);
  const solved=list.filter(p=>completedPuzzles.has(p.id)).length;
  const progress=document.querySelector(`#${category}-progress`);
  if(progress)progress.textContent=t("{0}/{1} решено",[solved,list.length]);
  renderPuzzleCategory(category);
 }
 for(const category of tacticCategories){
  const list=listForCategory(category);
  const solved=list.filter(p=>completedPuzzles.has(p.id)).length;
  const progress=document.querySelector(`#${category}-progress`);
  if(progress)progress.textContent=`${solved}/${list.length}`;
 }
 const bank=document.querySelector("#tactic-bank");
 if(bank&&!bank.hidden&&isTacticCategory(selectedTacticCategory))renderPuzzleCategory(selectedTacticCategory);
}
function nextUnsolvedPuzzleIndex(category=puzzleCategory){
 const list=listForCategory(category);
 const index=list.findIndex(p=>!completedPuzzles.has(p.id));
 return index>=0?index:0;
}
function focusPuzzleChapter(category,index){
 const state=puzzleChapterState[category],chapter=Math.floor(index/PUZZLES_PER_CHAPTER);
 state.selected=chapter;state.page=Math.floor(chapter/CHAPTERS_PER_PAGE);
 renderPuzzleCategory(category);
}
function saveGameState(){
 if(!gameStarted||!chess)return;
 try{
  sessionStorage.setItem(gameStateKey,JSON.stringify({
   puzzleId:gameMode==="puzzle"?activePuzzles()[puzzleIndex]?.id:null,fen:chess.fen(),startFen:chess.history({verbose:true})[0]?.before||chess.fen(),history:chess.history({verbose:true}).map(m=>({from:m.from,to:m.to,...(m.promotion?{promotion:m.promotion}:{})})),gameMode,playerColor,botColor,menuSide,difficultyLevel,puzzleIndex,puzzleCategory,puzzleStep,finished,
   onlineMatchId,onlineColor,onlineOpponent,onlineVersion,selectedOnlineTimeControl,
   lastMove:lastMove?{from:lastMove.from,to:lastMove.to,san:lastMove.san,promotion:lastMove.promotion||null}:null
  }));
 }catch{}
}
function syncMenuSelections(){
 document.querySelector("#level-value").textContent=difficultyNames[difficultyLevel-1];
 for(const item of levelsElement.children){
  const selected=Number(item.dataset.level)===difficultyLevel;
  item.classList.toggle("is-selected",selected);item.setAttribute("aria-pressed",String(selected));
 }
 for(const item of document.querySelectorAll(".side-option")){
  const selected=item.dataset.side===menuSide;
  item.classList.toggle("is-selected",selected);item.setAttribute("aria-pressed",String(selected));
 }
}
function restoreChessPosition(saved){
 if(Array.isArray(saved.history)&&saved.startFen){
  const restored=new Chess();restored.load(saved.startFen);
  for(const move of saved.history){if(!restored.move(move))throw new Error("Invalid saved move")}
  if(restored.fen()!==saved.fen)throw new Error("Saved history does not match position");
  chess=restored;
 }else{chess.load(saved.fen)} // Compatibility with earlier position-only saves.
}
function restoreSession(){
 let savedScreen="welcome";
 try{savedScreen=sessionStorage.getItem(screenKey)||"welcome"}catch{}
 if(savedScreen==="game"){
  try{
   const saved=JSON.parse(sessionStorage.getItem(gameStateKey)||"null");
   if(saved?.fen){
    gameMode=saved.gameMode==="puzzle"?"puzzle":saved.gameMode==="hotseat"?"hotseat":saved.gameMode==="online"?"online":"match";
    playerColor=saved.playerColor==="black"?"black":"white";
    botColor=playerColor==="white"?"black":"white";
    menuSide=saved.menuSide==="black"?"black":"white";
    difficultyLevel=Math.max(1,Math.min(6,Number(saved.difficultyLevel)||5));
    puzzleCategory=normalizePuzzleCategory(saved.puzzleCategory);if(isTacticCategory(puzzleCategory))selectedTacticCategory=puzzleCategory;
    const restoredList=activePuzzles();
    const restoredPuzzleId=saved.puzzleId||(puzzleCategory==="mate1"?puzzles[Number(saved.puzzleIndex)||0]?.id:null);
    const restoredPuzzleIndex=restoredPuzzleId?restoredList.findIndex(p=>p.id===restoredPuzzleId):-1;
    puzzleIndex=restoredPuzzleIndex>=0?restoredPuzzleIndex:Math.max(0,Math.min(restoredList.length-1,Number(saved.puzzleIndex)||0));
    puzzleStep=Math.max(0,Math.min(8,Number(saved.puzzleStep)||0));
    finished=!!saved.finished;gameStarted=true;
    onlineMatchId=saved.onlineMatchId||null;onlineColor=saved.onlineColor||null;onlineOpponent=saved.onlineOpponent||"";onlineVersion=Number(saved.onlineVersion)||0;if(onlineTimeControls[saved.selectedOnlineTimeControl])selectedOnlineTimeControl=saved.selectedOnlineTimeControl;
    restoreChessPosition(saved);syncBoard();closePromotion();resetReview();
    if(gameMode==="puzzle"){const puzzle=activePuzzles()[puzzleIndex];puzzleLine=(isTacticCategory(puzzleCategory)||puzzleMoveCount()>1)?buildPuzzleLine(puzzle):[]}
    lastMove=saved.lastMove||null;selected=null;moves=[];
    document.querySelector("#player-side").textContent=playerColor==="white"?t("Белые"):t("Чёрные");
    document.querySelector("#opponent-side").textContent=botColor==="white"?t("Белые"):t("Чёрные");
    document.querySelector("#player-avatar").textContent=playerColor==="white"?"♔":"♚";
    document.querySelector("#opponent-avatar").textContent=botColor==="white"?"♔":"♚";
    if(gameMode==="puzzle"){
     document.querySelector("#opponent-name").textContent=t("Задача");
     document.querySelector("#match-info").textContent=t("Задача {0}/{1} • {2}",[puzzleIndex+1,activePuzzles().length,isTacticCategory(puzzleCategory)?(tacticLabels[puzzleCategory]||t("тактика")).toLowerCase():puzzleCategory==="mate5"?t("мат в пять ходов"):puzzleCategory==="mate4"?t("мат в четыре хода"):puzzleCategory==="mate3"?t("мат в три хода"):puzzleCategory==="mate2"?t("мат в два хода"):t("мат в один ход")]);
     resetButton.textContent=t("Повторить задачу");
     document.querySelector("#resign").hidden=true;
    }else if(gameMode==="hotseat"){
     playerColor=turn;
     setHotseatPlayers();
     document.querySelector("#match-info").textContent=t("Один экран • после каждого хода доска поворачивается");
     resetButton.textContent=t("Новая партия");
     document.querySelector("#resign").hidden=true;
    }else if(gameMode==="online"){
     playerColor=onlineColor==="black"?"black":"white";botColor=playerColor==="white"?"black":"white";
     document.querySelector("#opponent-name").textContent=onlineOpponent||t("Соперник");
     document.querySelector("#opponent-side").textContent=botColor==="white"?t("Белые"):t("Чёрные");
     document.querySelector("#player-side").textContent=playerColor==="white"?t("Белые"):t("Чёрные");
     document.querySelector("#player-avatar").textContent=playerColor==="white"?"♔":"♚";
     document.querySelector("#opponent-avatar").textContent=botColor==="white"?"♔":"♚";
     document.querySelector("#match-info").textContent=t("Онлайн-партия · {0}",[onlineTimeControls[selectedOnlineTimeControl]?.label||t("контроль времени")]);
     resetButton.hidden=true;
     document.querySelector("#resign").hidden=true;
    }else{
     document.querySelector("#opponent-name").textContent=t("Компьютер");
     document.querySelector("#match-info").textContent=t("Ты играешь за {0} • уровень бота: {1}",[playerColor==="white"?t("белых"):t("чёрных"),difficultyNames[difficultyLevel-1]]);
     resetButton.textContent=t("Новая партия");
     document.querySelector("#resign").hidden=finished;
    }
    document.querySelector("#claim-draw").hidden=true;
    document.querySelector("#next-puzzle").hidden=true;
    statusElement.textContent=finished?t("Партия завершена."):gameMode==="puzzle"?t("Продолжай решать задачу."):gameMode==="hotseat"?t("Ход {0}.",[turn==="white"?t("белых — Игрок 1"):t("чёрных — Игрок 2")]):gameMode==="online"?(turn===playerColor?t("Твой ход."):t("Ход соперника…")):turn===playerColor?t("Твой ход."):t("Компьютер думает…");
    syncMenuSelections();render();renderMoveList();showScreen("game",false);
    if(!finished&&gameMode==="match"&&turn===botColor)botTimer=setTimeout(botMove,700);
    if(gameMode==="online"&&onlineMatchId)subscribeOnlineMatch(onlineMatchId);
    restoreScroll();return;
   }
  }catch{}
 }
 if(savedScreen==="menu"){syncMenuSelections();showScreen("menu",false);restoreScroll();return}
 if(savedScreen==="puzzles"){showScreen("puzzles",false);restoreScroll();return}
 if(savedScreen==="stats"){showScreen("stats",false);restoreScroll();return}
 showScreen("welcome",false);restoreScroll();
}
function restoreScroll(){
 let y=0;try{y=Number(sessionStorage.getItem(scrollKey))||0}catch{}
 requestAnimationFrame(()=>{const active=currentScreenElement();if(active)active.scrollTop=y});
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
 const result=Array.from({length:6},()=>({wins:0,losses:0,draws:0}));
 try{
  const saved=JSON.parse(localStorage.getItem(levelStatsKey));
  for(let i=0;i<6;i++)for(const outcome of ["wins","losses","draws"])
   if(Number.isSafeInteger(saved?.[i]?.[outcome])&&saved[i][outcome]>=0)result[i][outcome]=saved[i][outcome];
 }catch{/* Новая статистика. */}
 return result;
}
const levelStats=loadLevelStats();
async function loadPvpStats(){
 const rating=document.querySelector("#pvp-rating");
 const menuRating=document.querySelector("#menu-pvp-rating");
 const games=document.querySelector("#pvp-games");
 const wins=document.querySelector("#pvp-wins");
 const draws=document.querySelector("#pvp-draws");
 const losses=document.querySelector("#pvp-losses");
 const note=document.querySelector("#pvp-stats-note");
 if(!rating)return;
 const nickname=getPlayerNickname();
 if(!nickname){
  rating.textContent="0";if(menuRating)menuRating.textContent="0";games.textContent="0";wins.textContent="0";draws.textContent="0";losses.textContent="0";
  if(note)note.textContent=t("Создай игровой ник, чтобы начать играть PvP.");
  return;
 }
 try{
  await ensureOnlineAuth();
  await supabaseClient.rpc("ensure_pvp_profile",{p_nickname:nickname});
  const {data,error}=await supabaseClient.rpc("get_my_pvp_stats");
  if(error)throw error;
  const row=Array.isArray(data)?data[0]:data;
  if(!row)return;
  rating.textContent=Number(row.rating||0).toFixed(1).replace(".0","");
  if(menuRating)menuRating.textContent=rating.textContent;
  games.textContent=row.games||0;
  wins.textContent=row.wins||0;
  draws.textContent=row.draws||0;
  losses.textContent=row.losses||0;
  if(note)note.textContent=t("Рейтинг используется при подборе наиболее близкого по силе соперника.");
 }catch{
  if(note)note.textContent=t("PvP-статистика временно недоступна.");
 }
}
function showStats(){
 let total=0;
 for(const side of ["white","black"]){
  const games=stats[side].wins+stats[side].losses+stats[side].draws;
  total+=games;
  const gamesEl=document.querySelector(`#${side}-games`);
  const winsEl=document.querySelector(`#${side}-wins`);
  const lossesEl=document.querySelector(`#${side}-losses`);
  const drawsEl=document.querySelector(`#${side}-draws`);
  const rateEl=document.querySelector(`#${side}-rate`);
  if(gamesEl)gamesEl.textContent=games;
  if(winsEl)winsEl.textContent=stats[side].wins;
  if(lossesEl)lossesEl.textContent=stats[side].losses;
  if(drawsEl)drawsEl.textContent=stats[side].draws;
  if(rateEl)rateEl.textContent=`${games?Math.round(stats[side].wins/games*100):0}%`;
 }
 const overall=document.querySelector("#overall-stats");
 if(overall)overall.textContent=total;
 const solved=document.querySelector("#solved-puzzles-stat");
 if(solved)solved.textContent=completedPuzzles.size;

 const body=document.querySelector("#level-stats-body");
 if(!body)return;
 body.replaceChildren();
 for(let i=0;i<6;i++){
  const data=levelStats[i],games=data.wins+data.losses+data.draws;
  const row=document.createElement("article");
  row.className="stats-level-row";
  row.innerHTML=t("\n   <span class=\"stats-level-row__level\">{0}</span>\n   <div class=\"stats-level-row__main\">\n    <strong>{1}</strong>\n    <small>{2} партий</small>\n   </div>\n   <div class=\"stats-level-row__numbers\">\n    <span><b>{3}</b><small>победы</small></span>\n    <span><b>{4}</b><small>поражения</small></span>\n    <span><b>{5}</b><small>ничьи</small></span>\n   </div>",[i+1,difficultyNames[i],games,data.wins,data.losses,data.draws]);
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
 showStats();scheduleCloudSync();
}
function showScreen(name,resetScroll=true){
 document.querySelector("#language-picker").hidden=name!=="welcome"&&name!=="menu";
 for(const [key,element] of Object.entries(screens))element.hidden=key!==name;
 try{sessionStorage.setItem(screenKey,name)}catch{}
 if(name==="menu"){showStats();loadPvpStats();document.querySelector("#menu-title").focus()}
 if(name==="puzzles"){renderPuzzleHub();renderEnergy();document.querySelector("#puzzles-title").focus()}
 if(name==="stats"){showStats();loadPvpStats();document.querySelector("#stats-title").focus()}
 if(name==="game")document.querySelector("#game-title").focus();
 if(resetScroll){const active=screens[name];if(active)active.scrollTop=0}
 if(name==="game"&&gameStarted&&!finished&&!platformPaused)platformGameplayStart();else platformGameplayStop();
}
const displayIndex=(r,c)=>playerColor==="white"?r*8+c:(7-r)*8+(7-c);
const nicknameKey="chess-online-nickname";
function getPlayerNickname(){
 return (localStorage.getItem(nicknameKey)||"").trim();
}
function refreshProfileUI(){
 const nickname=getPlayerNickname();
 const chip=document.querySelector("#profile-chip-name");
 const onlineName=document.querySelector("#online-profile-name");
 if(chip)chip.textContent=nickname||t("Создать ник");
 if(onlineName)onlineName.textContent=nickname||t("Игрок");
}
function openProfileModal(focus=true){
 const modal=document.querySelector("#profile-modal");
 const input=document.querySelector("#profile-nickname");
 const error=document.querySelector("#profile-error");
 if(error)error.hidden=true;
 input.value=getPlayerNickname();
 modal.hidden=false;
 if(focus)setTimeout(()=>input.focus(),0);
}
function closeProfileModal(){
 document.querySelector("#profile-modal").hidden=true;
}
async function savePlayerNickname(){
 const input=document.querySelector("#profile-nickname");
 const error=document.querySelector("#profile-error");
 const nickname=input.value.trim().replace(/\s+/g," ").slice(0,24);
 if(nickname.length<2){
  error.textContent=t("Ник должен содержать минимум 2 символа.");
  error.hidden=false;input.focus();return false;
 }
 localStorage.setItem(nicknameKey,nickname);
 scheduleCloudSync();
 try{
  const user=await ensureOnlineAuth();
  if(user&&supabaseClient){
   await supabaseClient.auth.updateUser({data:{nickname}});
   await supabaseClient.rpc("ensure_pvp_profile",{p_nickname:nickname});
  }
 }catch{}
 refreshProfileUI();
 closeProfileModal();
 return true;
}

function formatChessClock(ms){
 const safe=Math.max(0,Math.ceil(ms/1000)),minutes=Math.floor(safe/60),seconds=safe%60;
 return `${String(minutes).padStart(2,"0")}:${String(seconds).padStart(2,"0")}`;
}
function setOnlineClocksVisible(visible){
 for(const id of ["#player-clock","#opponent-clock"]){const el=document.querySelector(id);if(el)el.hidden=!visible}
 if(!visible){clearInterval(onlineClockTimer);onlineClockTimer=null;onlineClockRow=null}
}
function getDisplayedClockTimes(){
 const row=onlineClockRow;
 if(!row)return {white:0,black:0};
 const elapsed=row.status==="active"?Math.max(0,Date.now()-Date.parse(row.turn_started_at||new Date().toISOString())):0;
 let white=Number(row.white_time_ms)||0,black=Number(row.black_time_ms)||0;
 if(row.clock_type==="per_move"){
  white=(Number(row.initial_seconds)||30)*1000;
  black=(Number(row.initial_seconds)||30)*1000;
 }
 if(row.status==="active"){
  if(row.turn==="white")white-=elapsed;
  else black-=elapsed;
 }
 return {white:Math.max(0,white),black:Math.max(0,black)};
}
async function claimOnlineTimeout(){
 if(onlineTimeoutClaiming||!onlineMatchId||!supabaseClient)return;
 onlineTimeoutClaiming=true;
 try{
  const {data,error}=await supabaseClient.rpc("claim_timeout",{p_match_id:onlineMatchId});
  if(!error&&data)applyOnlineMatch(data,false);
 }finally{setTimeout(()=>{onlineTimeoutClaiming=false},900)}
}
function updateOnlineClocks(){
 if(gameMode!=="online"||!onlineClockRow)return;
 const times=getDisplayedClockTimes();
 const own=onlineColor==="black"?times.black:times.white;
 const opp=onlineColor==="black"?times.white:times.black;
 const ownEl=document.querySelector("#player-clock"),oppEl=document.querySelector("#opponent-clock");
 if(ownEl){ownEl.textContent=formatChessClock(own);ownEl.classList.toggle("is-active",onlineClockRow.status==="active"&&onlineClockRow.turn===onlineColor);ownEl.classList.toggle("is-low",own<=10000)}
 if(oppEl){oppEl.textContent=formatChessClock(opp);oppEl.classList.toggle("is-active",onlineClockRow.status==="active"&&onlineClockRow.turn!==onlineColor);oppEl.classList.toggle("is-low",opp<=10000)}
 const activeRemaining=onlineClockRow.turn==="white"?times.white:times.black;
 if(onlineClockRow.status==="active"&&activeRemaining<=0)claimOnlineTimeout();
}
function syncOnlineClock(row){
 onlineClockRow=row;
 setOnlineClocksVisible(true);
 updateOnlineClocks();
 if(!onlineClockTimer)onlineClockTimer=setInterval(updateOnlineClocks,250);
}
function selectOnlineTimeControl(control){
 if(!onlineTimeControls[control])return;
 selectedOnlineTimeControl=control;
 try{localStorage.setItem(onlineTimeControlKey,control)}catch{}
 document.querySelectorAll("[data-time-control]").forEach(button=>{
  const selected=button.dataset.timeControl===control;
  button.classList.toggle("is-selected",selected);
  button.setAttribute("aria-pressed",String(selected));
 });
 document.querySelector("#online-selected-format").textContent=onlineTimeControls[control].label;
}
function setOnlineSearching(searching){
 document.querySelector(".online-modal__card").dataset.searching=String(searching);
 document.querySelectorAll("[data-time-control], [data-search-control]").forEach(button=>button.disabled=searching);
}
async function ensureOnlineAuth(){
 if(!supabaseClient)throw new Error(t("Supabase не загрузился"));
 const {data:{session}}=await supabaseClient.auth.getSession();
 if(session?.user)return session.user;
 const {data,error}=await supabaseClient.auth.signInAnonymously();
 if(error)throw error;
 return data.user;
}
function openOnlineModal(){
 setOnlineSearching(false);
 const nickname=getPlayerNickname();
 if(!nickname){openProfileModal();return}
 const modal=document.querySelector("#online-modal");
 refreshProfileUI();
 selectOnlineTimeControl(selectedOnlineTimeControl);
 modal.hidden=false;
 document.querySelector("#online-waiting").hidden=true;
 document.querySelector("#online-search").hidden=false;
}
async function cancelOnlineSearch(close=true){
 setOnlineSearching(false);
 clearInterval(matchmakingTimer);matchmakingTimer=null;onlinePolling=false;
 try{if(supabaseClient)await supabaseClient.rpc("cancel_matchmaking")}catch{}
 document.querySelector("#online-waiting").hidden=true;
 document.querySelector("#online-search").hidden=false;
 if(close)document.querySelector("#online-modal").hidden=true;
}
function updateOnlineTimer(){
 if(!matchmakingStartedAt)return;
 const sec=Math.floor((Date.now()-matchmakingStartedAt)/1000);
 document.querySelector("#online-wait-time").textContent=`${String(Math.floor(sec/60)).padStart(2,"0")}:${String(sec%60).padStart(2,"0")}`;
}
async function pollMatchmaking(nickname){
 if(onlinePolling)return;
 onlinePolling=true;
 try{
  const {data,error}=await supabaseClient.rpc("find_match",{p_nickname:nickname,p_time_control:selectedOnlineTimeControl});
  if(error)throw error;
  const row=Array.isArray(data)?data[0]:data;
  if(row?.state==="matched"&&row.match_id){
   clearInterval(matchmakingTimer);matchmakingTimer=null;
   document.querySelector("#online-status").textContent=t("Соперник найден!");
   setTimeout(()=>startOnlineMatch(row.match_id,row.color,row.opponent_nickname),450);
  }else{
   document.querySelector("#online-status").textContent=t("Ищем соперника · {0}",[onlineTimeControls[selectedOnlineTimeControl].label]);
  }
 }catch(error){
  document.querySelector("#online-status").textContent=error.message?.includes("Anonymous")||error.message?.includes("anonymous")
   ?t("Онлайн-поединки временно недоступны. Можно сыграть с компьютером.")
   :t("Ошибка соединения. Повторяем…");
 }finally{onlinePolling=false}
}
async function beginOnlineSearch(){
 requestMobileFullscreen();
 const nickname=getPlayerNickname();
 if(!nickname){document.querySelector("#online-modal").hidden=true;openProfileModal();return}
 setOnlineSearching(true);
 document.querySelector("#online-search").hidden=true;
 document.querySelector("#online-waiting").hidden=false;
 document.querySelector("#online-status").textContent=t("Подключаемся…");
 try{
  await ensureOnlineAuth();
  matchmakingStartedAt=Date.now();updateOnlineTimer();
  await pollMatchmaking(nickname);
  matchmakingTimer=setInterval(()=>{updateOnlineTimer();pollMatchmaking(nickname)},1200);
 }catch(error){
  document.querySelector("#online-status").textContent=t("Не удалось подключиться. Попробуй позже или сыграй с компьютером.");
 }
}
async function startOnlineMatch(matchId,color,opponent){
 clearInterval(matchmakingTimer);matchmakingTimer=null;onlinePolling=false;
 document.querySelector("#online-modal").hidden=true;
 onlineMatchId=matchId;onlineColor=color;onlineOpponent=opponent||t("Соперник");onlineVersion=0;
 gameMode="online";gameStarted=true;finished=false;
 playerColor=color==="black"?"black":"white";botColor=playerColor==="white"?"black":"white";
 chess.reset();syncBoard();closePromotion();resetReview();
 selected=null;moves=[];lastMove=null;
 document.querySelector("#player-side").textContent=playerColor==="white"?t("Белые"):t("Чёрные");
 document.querySelector("#opponent-side").textContent=botColor==="white"?t("Белые"):t("Чёрные");
 document.querySelector("#player-avatar").textContent=playerColor==="white"?"♔":"♚";
 document.querySelector("#opponent-avatar").textContent=botColor==="white"?"♔":"♚";
 document.querySelector("#opponent-name").textContent=onlineOpponent;
 document.querySelector("#match-info").textContent=t("Онлайн-партия");
 resetButton.hidden=true;document.querySelector("#claim-draw").hidden=true;
 document.querySelector("#resign").hidden=true;document.querySelector("#next-puzzle").hidden=true;
 showScreen("game");
 setOnlineClocksVisible(true);
 await subscribeOnlineMatch(matchId);
 statusElement.textContent=turn===playerColor?t("Твой ход."):t("Ход соперника…");
 saveGameState();platformGameplayStart();
}
async function subscribeOnlineMatch(matchId){
 if(!supabaseClient||!matchId)return;
 if(onlineChannel){await supabaseClient.removeChannel(onlineChannel);onlineChannel=null}
 onlineChannel=supabaseClient.channel(`match:${matchId}`);
 onlineChannel
  .on("postgres_changes",{event:"UPDATE",schema:"public",table:"matches",filter:`id=eq.${matchId}`},payload=>applyOnlineMatch(payload.new,true))
  .subscribe();
 const {data}=await supabaseClient.from("matches").select("*").eq("id",matchId).single();
 if(data)applyOnlineMatch(data,false);
}
function applyOnlineMatch(row,animateRemote=true){
 if(!row||row.id!==onlineMatchId)return;
 const version=Number(row.version)||0;
 if(version<=onlineVersion&&animateRemote)return;
 onlineVersion=version;
 if(row.time_control&&onlineTimeControls[row.time_control])selectedOnlineTimeControl=row.time_control;
 syncOnlineClock(row);
 const apply=()=>{
  if(row.fen&&row.fen!=="start")chess.load(row.fen);else chess.reset();
  syncBoard();lastMove=row.last_move||null;selected=null;moves=[];
  finished=row.status!=="active";
  if(finished)platformGameplayStop();
  render();renderMoveList();saveGameState();
  if(finished){
   loadPvpStats();
   const won=(row.status==="white_won"&&playerColor==="white")||(row.status==="black_won"&&playerColor==="black");
   const message=row.status==="draw"?t("Ничья."):row.status==="abandoned"?t("Соперник покинул партию."):row.finish_reason==="timeout"?(won?t("Время соперника вышло. Ты победил!"):t("Твоё время вышло. Победа соперника.")):won?t("Шах и мат! Ты победил!"):t("Шах и мат! Соперник победил.");
   statusElement.textContent=message;
   showResult(row.status==="draw"?"draw":"mate",message);
  }else{
   document.querySelector("#match-info").textContent=t("Онлайн-партия · {0}",[onlineTimeControls[row.time_control]?.label||t("контроль времени")]);
   statusElement.textContent=turn===playerColor?t("Твой ход."):t("Ход соперника…");
  }
 };
 if(!animateRemote||!row.last_move||row.fen===chess.fen()){apply();return}
 const m=row.last_move;
 const legal=chess.moves({square:m.from,verbose:true}).find(x=>x.to===m.to&&(!m.promotion||x.promotion===m.promotion));
 if(!legal){apply();return}
 moving=true;animateMoveBeforeCommit(legal,apply);
}
async function submitOnlineMove(played,status="active"){
 if(!supabaseClient||!onlineMatchId)return false;
 const {data,error}=await supabaseClient.rpc("submit_match_state",{
  p_match_id:onlineMatchId,
  p_fen:chess.fen(),
  p_last_move:{from:played.from,to:played.to,promotion:played.promotion||null,san:played.san||""},
  p_next_turn:turn,
  p_status:status
 });
 if(error){
  statusElement.textContent=t("Не удалось отправить ход. Восстанавливаю позицию…");
  const {data:row}=await supabaseClient.from("matches").select("*").eq("id",onlineMatchId).single();
  if(row)applyOnlineMatch(row,false);
  return false;
 }
 onlineVersion=Number(data?.version)||onlineVersion;
 if(data?.status&&data.status!=="active"){applyOnlineMatch(data,false);return false}
 if(data)syncOnlineClock(data);
 saveGameState();return true;
}

function setHotseatPlayers(){
 const whiteTurn=turn==="white";
 document.querySelector("#player-side").textContent=whiteTurn?t("Белые"):t("Чёрные");
 document.querySelector("#opponent-side").textContent=whiteTurn?t("Чёрные"):t("Белые");
 document.querySelector("#player-avatar").textContent=whiteTurn?"♔":"♚";
 document.querySelector("#opponent-avatar").textContent=whiteTurn?"♚":"♔";
 document.querySelector("#opponent-name").textContent=whiteTurn?t("Игрок 2"):t("Игрок 1");
 document.querySelector(".player--human strong").textContent=whiteTurn?t("Игрок 1"):t("Игрок 2");
}
function startHotseat(){
 setOnlineClocksVisible(false);
 clearTimeout(botTimer);
 cancelDrag();cancelMotion();clearScene();
 gameMode="hotseat";
 chess.reset();syncBoard();closePromotion();resetReview();
 playerColor="white";botColor="black";
 selected=null;moves=[];finished=false;gameStarted=true;
 setHotseatPlayers();
 document.querySelector("#match-info").textContent=t("Один экран • после каждого хода доска поворачивается");
 resetButton.textContent=t("Новая партия");
 document.querySelector("#claim-draw").hidden=true;
 document.querySelector("#resign").hidden=true;
 document.querySelector("#next-puzzle").hidden=true;
 statusElement.textContent=t("Ход белых — Игрок 1.");
 render();saveGameState();platformGameplayStart();
}
function restartCurrentGame(){
 if(gameMode==="puzzle")startPuzzle(puzzleIndex);
 else if(gameMode==="hotseat")startHotseat();
 else startGame();
}

function startGame(){
 setOnlineClocksVisible(false);
 clearTimeout(botTimer);
 cancelDrag();cancelMotion();clearScene();
 gameMode="match";
 playerColor=menuSide;botColor=playerColor==="white"?"black":"white";
 chess.reset();syncBoard();closePromotion();resetReview();
 selected=null;moves=[];finished=false;gameStarted=true;
 document.querySelector("#player-side").textContent=playerColor==="white"?t("Белые"):t("Чёрные");
 document.querySelector("#opponent-side").textContent=botColor==="white"?t("Белые"):t("Чёрные");
 document.querySelector("#player-avatar").textContent=playerColor==="white"?"♔":"♚";
 document.querySelector("#opponent-avatar").textContent=botColor==="white"?"♔":"♚";
 document.querySelector("#match-info").textContent=t("Ты играешь за {0} • уровень бота: {1}",[playerColor==="white"?t("белых"):t("чёрных"),difficultyNames[difficultyLevel-1]]);
 document.querySelector("#opponent-name").textContent=t("Компьютер");
 resetButton.textContent=t("Новая партия");document.querySelector("#claim-draw").hidden=true;
 document.querySelector("#resign").hidden=false;
 document.querySelector("#next-puzzle").hidden=true;
 statusElement.textContent=playerColor==="white"?t("Твой ход: возьми белую фигуру."):t("Компьютер ходит первым…");
 render();saveGameState();platformGameplayStart();
 if(playerColor==="black")botTimer=setTimeout(botMove,850);
}
function playUciOn(gameObj,uci){
 const move={from:uci.slice(0,2),to:uci.slice(2,4)};
 if(uci.length>4)move.promotion=uci[4];
 return gameObj.move(move);
}
function buildPuzzleLine(puzzle){
 if(Array.isArray(puzzle.line))return puzzle.line.slice();
 if(Array.isArray(puzzle.sanLine)){
  const temp=new Chess(puzzle.sourceFen),line=[];
  for(const san of puzzle.sanLine){
   const played=temp.move(san);
   if(!played)throw new Error(t("Неверная SAN-линия задачи {0}: {1}",[puzzle.id,san]));
   line.push(played.from+played.to+(played.promotion||""));
  }
  return line;
 }
 return [];
}
function startPuzzle(index){
 setOnlineClocksVisible(false);
 clearTimeout(botTimer);cancelDrag();cancelMotion();clearScene();
 puzzleIndex=index;gameMode="puzzle";gameStarted=true;finished=false;puzzleStep=0;
 const list=activePuzzles(),puzzle=list[index],longPuzzle=puzzleCategory!=="mate1";
 if(longPuzzle){
  puzzleLine=buildPuzzleLine(puzzle);
  chess.load(puzzle.sourceFen);
  playUciOn(chess,puzzleLine[0]);
  playerColor=colorName(chess.turn());
 }else{
  puzzleLine=[];
  playerColor=puzzle.side;
  chess.load(puzzle.fen);
 }
 botColor=playerColor==="white"?"black":"white";
 syncBoard();closePromotion();resetReview();
 selected=null;moves=[];
 document.querySelector("#player-side").textContent=playerColor==="white"?t("Белые"):t("Чёрные");
 document.querySelector("#opponent-side").textContent=botColor==="white"?t("Белые"):t("Чёрные");
 document.querySelector("#player-avatar").textContent=playerColor==="white"?"♔":"♚";
 document.querySelector("#opponent-avatar").textContent=botColor==="white"?"♔":"♚";
 document.querySelector("#opponent-name").textContent=t("Задача");
 const modeText=isTacticCategory(puzzleCategory)?t("тактика: {0}",[(tacticLabels[puzzleCategory]||t("комбинация")).toLowerCase()]):puzzleCategory==="mate5"?t("мат в пять ходов"):puzzleCategory==="mate4"?t("мат в четыре хода"):puzzleCategory==="mate3"?t("мат в три хода"):puzzleCategory==="mate2"?t("мат в два хода"):t("мат в один ход");
 document.querySelector("#match-info").textContent=t("Задача {0}/{1} • {2}",[index+1,list.length,modeText]);
 statusElement.textContent=isTacticCategory(puzzleCategory)?t("{0} начинают. Найди лучший тактический ход.",[playerColor==="white"?t("Белые"):t("Чёрные")]):longPuzzle?t("{0} начинают. Найди форсирующий первый ход.",[playerColor==="white"?t("Белые"):t("Чёрные")]):t("Найди ход, после которого королю не спастись.");
 if(introductoryPuzzleIds.includes(puzzle.id)&&!completedPuzzles.has(puzzle.id)){
  const pieceLabel={R:t("ладьи"),Q:t("ферзя"),P:t("пешки")}[puzzle.piece];
  statusElement.textContent=t("Разминка: поставь мат одним ходом. Начни с {0} на {1}.",[pieceLabel,square(...puzzle.from)]);
 }
 resetButton.textContent=t("Повторить задачу");document.querySelector("#claim-draw").hidden=true;
 document.querySelector("#resign").hidden=true;document.querySelector("#next-puzzle").hidden=true;
 render();saveGameState();platformGameplayStart();
}
function finishPuzzle(puzzle,to,message){
 finished=true;platformGameplayStop();render();renderMoveList();
 const firstSolve=markPuzzleComplete(puzzle.id);
 playScene("mate",{to,color:playerColor==="white"?"w":"b"},message);
 statusElement.textContent=firstSolve?t("Верно! Задача решена и сохранена."):t("Верно! Повтор пройден — энергия не тратилась.");
 const list=activePuzzles(),next=document.querySelector("#next-puzzle");
 next.textContent=puzzleIndex===list.length-1?t("Начать задачи заново"):t("Следующая задача");
 next.hidden=false;saveGameState();
}
function playPuzzleMove(fr,fc,r,c,dragState=null,promotion=null){
 const list=activePuzzles(),puzzle=list[puzzleIndex];
 const from=square(fr,fc),to=square(r,c);
 const uci=from+to+(promotion||"");
 if(puzzleCategory==="mate1"){
  if(fr!==puzzle.from[0]||fc!==puzzle.from[1]||r!==puzzle.to[0]||c!==puzzle.to[1]){
   dragState?.ghost?.remove();render();statusElement.textContent=t("Это не мат. Попробуй другой ход.");return;
  }
  const legal=chess.moves({square:from,verbose:true}).find(m=>m.to===to&&(!promotion||m.promotion===promotion));
  moving=true;animateMoveBeforeCommit(legal,()=>{
   chess.move({from,to,promotion:promotion||undefined});syncBoard();lastMove=chess.history({verbose:true}).at(-1);
   finishPuzzle(puzzle,to,t("Верно! Мат в один ход."));
  },dragState);return;
 }
 if(!puzzleLine.length)puzzleLine=buildPuzzleLine(puzzle);
 const expectedIndex=1+puzzleStep*2;
 const expected=puzzleLine[expectedIndex];
 if(uci!==expected){
  dragState?.ghost?.remove();render();
  statusElement.textContent=puzzleStep===0?t("Неверный первый ход. Попробуй ещё раз."):isTacticCategory(puzzleCategory)?t("Этот ход не продолжает комбинацию. Попробуй другой."):t("Этот ход не продолжает форсированный мат. Попробуй другой.");
  return;
 }
 const legal=chess.moves({square:from,verbose:true}).find(m=>m.to===to&&(!promotion||m.promotion===promotion));
 if(!legal){dragState?.ghost?.remove();render();statusElement.textContent=t("Этот ход сейчас невозможен.");return}
 moving=true;animateMoveBeforeCommit(legal,()=>{
  const played=chess.move({from,to,promotion:promotion||undefined});syncBoard();lastMove=played;render();renderMoveList();
  const finalUserMove=expectedIndex===puzzleLine.length-1;
  if(finalUserMove){
   if(isTacticCategory(puzzleCategory)){
    finishPuzzle(puzzle,to,t("Верно! Тактика «{0}» решена.",[tacticLabels[puzzleCategory]||puzzle.label]));return;
   }
   if(!chess.isCheckmate()){moving=false;statusElement.textContent=t("Линия завершилась, но мат не подтверждён.");return}
   finishPuzzle(puzzle,to,t("Верно! Мат в {0} хода.",[puzzleMoveCount()]));return;
  }
  puzzleStep++;saveGameState();
  statusElement.textContent=t("Верно. Соперник отвечает…");
  const replyUci=puzzleLine[puzzleStep*2];
  sceneAfter(450,()=>{
   const reply={from:replyUci.slice(0,2),to:replyUci.slice(2,4)};
   if(replyUci.length>4)reply.promotion=replyUci[4];
   const replyLegal=chess.moves({square:reply.from,verbose:true}).find(m=>m.to===reply.to&&(!reply.promotion||m.promotion===reply.promotion));
   if(!replyLegal){moving=false;statusElement.textContent=t("Ошибка линии задачи: ответ соперника нелегален.");return}
   moving=true;animateMoveBeforeCommit(replyLegal,()=>{
    const answered=chess.move(reply);syncBoard();lastMove=answered;render();renderMoveList();
    moving=false;
    const total=isTacticCategory(puzzleCategory)?Math.ceil((puzzleLine.length-1)/2):puzzleMoveCount();
    statusElement.textContent=isTacticCategory(puzzleCategory)?t("Ответ сделан. Продолжи комбинацию."):puzzleStep<total-1?t("Ответ сделан. Найди {0} форсирующий ход.",[puzzleStep===1?t("второй"):puzzleStep===2?t("третий"):puzzleStep===3?t("четвёртый"):t("следующий")]):t("Ход соперника сделан. Теперь поставь мат.");
    saveGameState();
   });
  });
 },dragState);
}
function getMoves(r,c){return chess.moves({square:square(r,c),verbose:true}).map(m=>({r:8-Number(m.to[1]),c:files.indexOf(m.to[0]),promotion:m.promotion}))}
function closePromotion(){pendingPromotion=null;document.querySelector("#promotion").hidden=true}
function needsPromotion(fr,fc,r,c){return chess.moves({square:square(fr,fc),verbose:true}).some(m=>m.to===square(r,c)&&m.promotion)}
function requestPromotion(fr,fc,r,c){
 pendingPromotion={fr,fc,r,c};const choices=document.querySelector("#promotion-choices");choices.replaceChildren();
 for(const [code,label] of [["q",t("Ферзь")],["r",t("Ладья")],["b",t("Слон")],["n",t("Конь")]]){
  const button=document.createElement("button"),img=document.createElement("img"),caption=document.createElement("span");
  button.type="button";button.setAttribute("aria-label",label);img.src=getPieceSprite(names[code],playerColor);img.alt="";caption.textContent=label;
  button.append(img,caption);button.addEventListener("click",()=>{const m=pendingPromotion;closePromotion();if(gameMode==="puzzle")playPuzzleMove(m.fr,m.fc,m.r,m.c,null,code);else move(m.fr,m.fc,m.r,m.c,code)});choices.append(button);
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
 automatic:n>=150?t("75 ходов без взятия и хода пешкой"):reps>=5?t("пятикратное повторение позиции"):null,
 claim:n>=100?t("50 ходов без взятия и хода пешкой"):reps>=3?t("троекратное повторение позиции"):null};}
function endMatch(result,message,awardEnergy=true){
 finished=true;platformGameplayStop();finalMessage=message;statusElement.textContent=message;
 document.querySelector("#claim-draw").hidden=true;document.querySelector("#resign").hidden=true;
 document.querySelector("#analysis-entry").hidden=false;recordResult(result);
 if(awardEnergy)addEnergy(1,t("Партия завершена: +1 ⚡ энергии для задач."));
 saveGameState();
}
function render(){
 boardElement.replaceChildren();
 for(let dr=0;dr<8;dr++)for(let dc=0;dc<8;dc++){
  const r=playerColor==="white"?dr:7-dr,c=playerColor==="white"?dc:7-dc;
  const cell=document.createElement("button"),p=board[r][c],canGo=moves.some(m=>m.r===r&&m.c===c);
  cell.type="button";cell.className="square "+((r+c)%2?"square--dark":"square--light");
  cell.setAttribute("role","gridcell");cell.setAttribute("aria-label",files[c]+(8-r)+(p?" "+p.color+" "+p.type:t(" пусто")));
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
 if(!gameStarted||finished||platformPaused||reviewMode||moving||pendingPromotion||turn!==playerColor||event.button!==0||drag)return;
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
 statusElement.textContent=t("Перетащи фигуру на подсвеченную клетку.");
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
  statusElement.textContent=t("Ход отменён. Возьми фигуру и перетащи её на другую клетку.");
 }
}
boardElement.addEventListener("pointerdown",onPointerDown);
boardElement.addEventListener("pointermove",onPointerMove);
boardElement.addEventListener("pointerup",onPointerUp);
boardElement.addEventListener("pointercancel",()=>{cancelDrag();selected=null;moves=[];if(board&&!moving)render()});
window.addEventListener("blur",()=>setPauseReason("blur",true));
window.addEventListener("focus",()=>setPauseReason("blur",false));
document.addEventListener("visibilitychange",()=>setPauseReason("hidden",document.hidden));
window.addEventListener("yandex-game-pause",handlePlatformPause);
window.addEventListener("yandex-game-resume",handlePlatformResume);
window.addEventListener("yandex-sdk-ready",()=>setPauseReason("sdk",!!yandexPlatform()?.state.platformPaused));
boardElement.addEventListener("contextmenu",event=>event.preventDefault());
boardElement.addEventListener("selectstart",event=>event.preventDefault());
function move(fr,fc,r,c,promotion,dragState=null){
 if(moving||platformPaused)return;
 clearScene();
 const from=square(fr,fc),to=square(r,c);
 const legal=chess.moves({square:from,verbose:true}).find(m=>m.to===to&&m.promotion===promotion);
 if(!legal)return;
 moving=true;
 animateMoveBeforeCommit(legal,async()=>{
  const played=chess.move({from,to,promotion});syncBoard();lastMove=played;
  selected=null;moves=[];
  if(gameMode==="hotseat")playerColor=turn;
  render();renderMoveList();saveGameState();
  if(played.captured){
   const takenAt=played.isEnPassant()?square(fr,c):to;
   playCaptureEffect(takenAt,played.captured,played.color==="w"?"black":"white");
   impact(8-Number(takenAt[1]),files.indexOf(takenAt[0]));playMetalClash();
  }
  if(gameMode==="online"){
   let onlineStatus="active";
   if(chess.isCheckmate())onlineStatus=played.color==="w"?"white_won":"black_won";
   else if(chess.isStalemate()||chess.isInsufficientMaterial())onlineStatus="draw";
   else {const d=drawState();if(d.automatic)onlineStatus="draw"}
   const sent=await submitOnlineMove(played,onlineStatus);
   if(!sent)return;
   if(onlineStatus!=="active"){
    loadPvpStats();
    finished=true;
    const won=(onlineStatus==="white_won"&&playerColor==="white")||(onlineStatus==="black_won"&&playerColor==="black");
    const message=onlineStatus==="draw"?t("Ничья."):won?t("Шах и мат! Ты победил!"):t("Шах и мат! Соперник победил.");
    statusElement.textContent=message;
    if(chess.isCheckmate())playScene("mate",played,message);else showResult("draw",message);
   }else{
    const check=chess.isCheck();if(check)playScene("check",played);
    statusElement.textContent=t("Ход отправлен. Ждём соперника…");
   }
   return;
  }
  if(chess.isCheckmate()){
   if(gameMode==="hotseat"){
    finished=true;
    const winner=played.color==="w"?t("Игрок 1 (белые)"):t("Игрок 2 (чёрные)");
    const message=t("Шах и мат! Победил {0}.",[winner]);
    statusElement.textContent=message;saveGameState();playScene("mate",played,message);return;
   }
   const result=colorName(played.color)===playerColor?"wins":"losses";
   const message=result==="wins"?t("Шах и мат! Ты победил!"):t("Шах и мат! Компьютер победил!");
   endMatch(result,message);playScene("mate",played,message);return;
  }
  if(chess.isStalemate()){
   if(gameMode==="hotseat"){
    finished=true;const message=t("Пат — ничья.");
    statusElement.textContent=message;saveGameState();playScene("stalemate",played,message);return;
   }
   endMatch("draws",t("Пат — ничья."));playScene("stalemate",played,t("Пат — ничья."));return;
  }
  if(chess.isInsufficientMaterial()){const message=t("Ничья: мат невозможен при оставшихся фигурах.");if(gameMode==="hotseat"){finished=true;statusElement.textContent=message;saveGameState();showResult("draw",message)}else{endMatch("draws",message);showResult("draw",message)}return}
  const draw=drawState();if(draw.automatic){const message=t("Ничья: {0}.",[draw.automatic]);if(gameMode==="hotseat"){finished=true;statusElement.textContent=message;saveGameState();showResult("draw",message)}else{endMatch("draws",message);showResult("draw",message)}return}
  document.querySelector("#claim-draw").hidden=!(draw.claim&&turn===playerColor);
  if(turn===botColor&&draw.claim){const message=t("Компьютер заявил ничью: {0}.",[draw.claim]);endMatch("draws",message);showResult("draw",message);return}
  const check=chess.isCheck();if(check)playScene("check",played);
  if(gameMode==="hotseat"){
   setHotseatPlayers();
   boardElement.classList.remove("board--turn-switch");
   void boardElement.offsetWidth;
   boardElement.classList.add("board--turn-switch");
   statusElement.textContent=check
    ?t("Шах! Ход {0}.",[turn==="white"?t("белых — Игрок 1"):t("чёрных — Игрок 2")])
    :t("Ход {0}.",[turn==="white"?t("белых — Игрок 1"):t("чёрных — Игрок 2")]);
   saveGameState();return;
  }
  if(turn===botColor){
   statusElement.textContent=check?t("Шах компьютеру! Он думает…"):played.captured?t("Попадание! Компьютер думает…"):t("Компьютер думает…");
   botTimer=setTimeout(botMove,check?1700:650);
  }else statusElement.textContent=check?t("Шах твоему королю! Защити его."):played.captured?t("Компьютер взял фигуру! Твой ход."):t("Твой ход.");
 },dragState);
}
function botMove(){
 if(!gameStarted||finished||platformPaused||moving||turn!==botColor)return;
 const options=chess.moves({verbose:true}).filter(m=>!m.promotion||m.promotion==="q");
 const choice=chooseBotMove(options,difficultyLevel);
 move(8-Number(choice.from[1]),files.indexOf(choice.from[0]),8-Number(choice.to[1]),files.indexOf(choice.to[0]),choice.promotion);
}
const pieceValues={pawn:100,knight:320,bishop:330,rook:500,queen:900,king:0};
function evaluatePosition(){
 if(chess.isCheckmate())return colorName(chess.turn())===botColor?-100000:100000;
 if(chess.isStalemate()||chess.isInsufficientMaterial())return 0;
 let score=0;
 const center=new Set(["d4","e4","d5","e5"]);
 const boardNow=chess.board();
 for(let r=0;r<8;r++)for(let c=0;c<8;c++){
  const p=boardNow[r][c];if(!p)continue;
  const color=colorName(p.color),type=names[p.type];
  let value=pieceValues[type]||0;
  const sq=files[c]+(8-r);
  if(center.has(sq))value+=type==="pawn"?18:12;
  if(type==="pawn"){
   const advance=color==="white"?6-r:r-1;
   value+=Math.max(0,advance)*3;
  }
  score+=(color===botColor?1:-1)*value;
 }
 return score;
}
function orderedMoves(){
 const values={p:100,n:320,b:330,r:500,q:900,k:10000};
 return chess.moves({verbose:true})
  .filter(m=>!m.promotion||m.promotion==="q")
  .sort((a,b)=>(values[b.captured]||0)-(values[a.captured]||0));
}
function searchPosition(depth,alpha,beta){
 if(depth<=0||chess.isGameOver())return evaluatePosition();
 const maximizing=colorName(chess.turn())===botColor;
 const moves=orderedMoves();
 if(maximizing){
  let best=-Infinity;
  for(const m of moves){
   chess.move({from:m.from,to:m.to,promotion:m.promotion});
   const score=searchPosition(depth-1,alpha,beta);
   chess.undo();
   if(score>best)best=score;
   if(best>alpha)alpha=best;
   if(beta<=alpha)break;
  }
  return best;
 }
 let best=Infinity;
 for(const m of moves){
  chess.move({from:m.from,to:m.to,promotion:m.promotion});
  const score=searchPosition(depth-1,alpha,beta);
  chess.undo();
  if(score<best)best=score;
  if(best<beta)beta=best;
  if(beta<=alpha)break;
 }
 return best;
}
function chooseBotMove(options,level){
 if(level===1)return options[Math.floor(Math.random()*options.length)];
 if(level===2){
  const captures=options.filter(m=>m.captured);
  const pool=captures.length&&Math.random()<.65?captures:options;
  return pool[Math.floor(Math.random()*pool.length)];
 }
 const depth=level===3?1:level===4?2:level===5?2:3;
 const noise=level===3?70:level===4?24:level===5?7:0;
 let best=-Infinity,choices=[];
 const root=[...options].sort((a,b)=>{
  const va=pieceValues[names[a.captured]]||0;
  const vb=pieceValues[names[b.captured]]||0;
  return vb-va;
 });
 for(const move of root){
  chess.move({from:move.from,to:move.to,promotion:move.promotion});
  let score=chess.isCheckmate()?100000:searchPosition(depth-1,-Infinity,Infinity);
  if(chess.isCheck())score+=18;
  chess.undo();
  if(noise)score+=(Math.random()-.5)*noise;
  if(score>best+0.001){best=score;choices=[move]}
  else if(Math.abs(score-best)<0.001)choices.push(move);
 }
 return choices[Math.floor(Math.random()*choices.length)]||options[0];
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
 if(!history.length){const empty=document.createElement("p");empty.className="moves-empty";empty.textContent=t("Пока ходов нет");list.append(empty);return}
 for(let i=0;i<history.length;i+=2){
  const row=document.createElement("div");row.className="moves-row";
  const number=document.createElement("span");number.className="moves-row__number";number.textContent=`${Math.floor(i/2)+1}.`;row.append(number);
  for(let j=i;j<Math.min(i+2,history.length);j++){
   const item=document.createElement("button");item.type="button";item.className="moves-row__move";
   item.textContent=history[j].san;item.title=t("Ход {0}: {1}",[j+1,history[j].san]);
   item.disabled=!reviewMode;
   if(reviewMode&&reviewPly===j+1)item.classList.add("is-current");
   item.addEventListener("click",()=>setReviewPly(j+1));row.append(item);
  }
  list.append(row);
 }
 if(!reviewMode){list.scrollTop=list.scrollHeight;list.scrollLeft=list.scrollWidth;}
}
function setReviewPly(ply){
 if(!reviewMode)return;
 reviewPly=Math.max(0,Math.min(reviewMoves.length,ply));
 const replay=new Chess(reviewStartFen);
 for(let i=0;i<reviewPly;i++){const m=reviewMoves[i];replay.move({from:m.from,to:m.to,promotion:m.promotion})}
 board=replay.board().map(row=>row.map(p=>p&&{type:names[p.type],color:colorName(p.color)}));
 lastMove=reviewMoves[reviewPly-1]||null;selected=null;moves=[];render();renderMoveList();
 document.querySelector("#review-position").textContent=reviewPly?t("Ход {0}: {1}",[Math.ceil(reviewPly/2),lastMove.san]):t("Начальная позиция");
 for(const [id,disabled] of [["#review-first",!reviewPly],["#review-prev",!reviewPly],["#review-next",reviewPly===reviewMoves.length],["#review-last",reviewPly===reviewMoves.length]])document.querySelector(id).disabled=disabled;
}
function openReview(){
 if(gameMode!=="match"||!finished)return;
 clearScene();reviewMoves=chess.history({verbose:true});reviewStartFen=reviewMoves[0]?.before||chess.fen();reviewMode=true;
 document.querySelector("#analysis-entry").hidden=true;document.querySelector("#review-controls").hidden=false;
 setReviewPly(reviewMoves.length);
 statusElement.textContent=t("Разбор партии: выбирай ход в записи или листай стрелками.");
 document.querySelector("#review-controls").scrollIntoView?.({block:"nearest",behavior:"smooth"});
}
function closeReview(){
 if(!reviewMode)return;reviewMode=false;syncBoard();lastMove=chess.history({verbose:true}).at(-1)||null;
 render();renderMoveList();document.querySelector("#review-controls").hidden=true;
 document.querySelector("#analysis-entry").hidden=false;statusElement.textContent=finalMessage;
}
function cancelMotion(){
 motionToken++;cancelGameplayTimer(motionTimer);motionTimer=null;moving=false;
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
  gameplayAfter(0,()=>{
   if(token!==motionToken)return;
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
  if(done||token!==motionToken||platformPaused)return;done=true;
  cancelGameplayTimer(motionTimer);motionTimer=null;
  for(const {ghost,source} of motionGhosts){
   ghost.remove();
   if(source)source.style.visibility="";
  }
  motionGhosts=[];moving=false;commit();
 }

 main.addEventListener("transitionend",finish,{once:true});
 motionTimer=gameplayAfter(320,finish);
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
 for(const timer of sceneTimers)cancelGameplayTimer(timer);sceneTimers=[];
 document.querySelector("#board-effects").replaceChildren();
 document.querySelector("#result-panel").hidden=true;
 boardElement.querySelectorAll(".square--fear,.square--king-hidden").forEach(el=>el.classList.remove("square--fear","square--king-hidden"));
}
function sceneAfter(delay,fn){sceneTimers.push(gameplayAfter(delay,fn))}
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
 document.querySelector("#result-eyebrow").textContent=kind==="mate"?t("БИТВА ОКОНЧЕНА"):kind==="stalemate"?t("ХОДОВ БОЛЬШЕ НЕТ"):t("ПАРТИЯ ЗАВЕРШЕНА");
 document.querySelector("#result-title").textContent=kind==="mate"?t("ШАХ И МАТ!"):kind==="stalemate"?t("ПАТ!"):kind==="resign"?t("ПОРАЖЕНИЕ"):t("НИЧЬЯ");
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
  sceneAnchor(attackers.includes(played.to)?played.to:attackers[0]||played.to,"scene-bubble scene-bubble--attack",kind==="mate"?t("ШАХ И МАТ!"):t("ШАХ!"));
  sceneAnchor(king,"scene-bubble scene-bubble--king",kind==="mate"?t("А-а-а!"):t("Ой! Шах!"));
  cell?.classList.add("square--fear");

 }else{
  sceneAnchor(king,"scene-bubble scene-bubble--king",t("Ходить некуда…"));
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
 if(!audioIsAllowed())return;
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
 if(!audioIsAllowed())return;
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
 if(pieceTheme==="classic")return `assets/pieces/classic/${key}.svg`;
 if(pieceTheme!=="fantasy")return themedGlyphSprite(type,color,pieceTheme);
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

function startPuzzleWithEnergy(index,category=puzzleCategory){
 requestMobileFullscreen();
 category=normalizePuzzleCategory(category);
 if(isTacticCategory(category)){selectedTacticCategory=category;const bank=document.querySelector("#tactic-bank");if(bank)bank.hidden=false}
 focusPuzzleChapter(category,index);
 puzzleCategory=category;
 const list=activePuzzles(),puzzle=list[index];
 if(!puzzle)return false;
 const freeReplay=completedPuzzles.has(puzzle.id);
 const freeIntroduction=introductoryFreePlay()||introductoryPuzzleIds.includes(puzzle.id);
 if(!freeReplay&&!freeIntroduction&&!spendEnergy(1))return false;
 showScreen("game");startPuzzle(index);
 if(freeReplay)statusElement.textContent=t("Эта задача уже решена — повтор бесплатный.");
 return true;
}

resetButton.addEventListener("click",restartCurrentGame);
document.querySelector("#next-puzzle").addEventListener("click",()=>{const list=activePuzzles();startPuzzleWithEnergy((puzzleIndex+1)%list.length,puzzleCategory)});
for(let level=1;level<=6;level++){
 const button=document.createElement("button");
 button.type="button";
 button.textContent=difficultyNames[level-1];
 button.dataset.level=String(level);
 button.setAttribute("aria-label",t("Сложность: {0}",[difficultyNames[level-1]]));
 button.addEventListener("click",()=>{
  difficultyLevel=level;
  document.querySelector("#level-value").textContent=difficultyNames[level-1];
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
document.querySelector("#open-account").addEventListener("click",openAccountModal);
document.querySelector("#account-close").addEventListener("click",closeAccountModal);
document.querySelector("#account-yandex-login").addEventListener("click",accountYandexLogin);
document.querySelector("#account-yandex-sync").addEventListener("click",accountYandexSync);
document.querySelector("#enter").addEventListener("click",()=>{
 requestMobileFullscreen();
 try{const Ctx=window.AudioContext||window.webkitAudioContext;if(Ctx){audioContext ||= new Ctx();if(audioIsAllowed())audioContext.resume()}}catch{}
 showScreen("menu");
});
document.querySelector("#open-stats").addEventListener("click",()=>showScreen("stats"));
document.querySelector("#stats-back").addEventListener("click",()=>showScreen("menu"));
document.querySelectorAll("[data-piece-theme]").forEach(button=>button.addEventListener("click",()=>setPieceTheme(button.dataset.pieceTheme)));
setPieceTheme(pieceTheme,false);
document.querySelector("#start-online").addEventListener("click",openOnlineModal);
document.querySelector("#online-close").addEventListener("click",()=>cancelOnlineSearch(true));
document.querySelector("#online-cancel").addEventListener("click",()=>cancelOnlineSearch(true));
document.querySelector("#online-search").addEventListener("click",beginOnlineSearch);
document.querySelectorAll("[data-time-control]").forEach(button=>button.addEventListener("click",()=>selectOnlineTimeControl(button.dataset.timeControl)));
document.querySelectorAll("[data-search-control]").forEach(button=>{
 button.setAttribute("aria-label",t("Искать: {0}",[onlineTimeControls[button.dataset.searchControl].label]));
 button.addEventListener("click",()=>{
  if(document.querySelector(".online-modal__card").dataset.searching==="true")return;
  selectOnlineTimeControl(button.dataset.searchControl);
  beginOnlineSearch();
 });
});
document.querySelector("#open-profile").addEventListener("click",()=>openProfileModal());
document.querySelector("#profile-close").addEventListener("click",closeProfileModal);
document.querySelector("#profile-save").addEventListener("click",savePlayerNickname);
document.querySelector("#profile-nickname").addEventListener("keydown",e=>{if(e.key==="Enter")savePlayerNickname()});
document.querySelector("#start-match").addEventListener("click",()=>{
 requestMobileFullscreen();showScreen("game");startGame();
});
document.querySelector("#start-hotseat").addEventListener("click",()=>{
 requestMobileFullscreen();showScreen("game");startHotseat();
});
document.querySelector("#puzzle-entry").addEventListener("click",()=>showScreen("puzzles"));
document.querySelector("#puzzles-back").addEventListener("click",()=>showScreen("menu"));
document.querySelector("[data-puzzle-category='mate1']").addEventListener("click",()=>{focusPuzzleChapter("mate1",nextUnsolvedPuzzleIndex("mate1"));document.querySelector("#mate1-bank")?.scrollIntoView({behavior:"smooth",block:"start"})});
document.querySelector("[data-puzzle-category='mate2']").addEventListener("click",()=>{focusPuzzleChapter("mate2",nextUnsolvedPuzzleIndex("mate2"));document.querySelector("#mate2-bank")?.scrollIntoView({behavior:"smooth",block:"start"})});
document.querySelector("[data-puzzle-category='mate3']").addEventListener("click",()=>{focusPuzzleChapter("mate3",nextUnsolvedPuzzleIndex("mate3"));document.querySelector("#mate3-bank")?.scrollIntoView({behavior:"smooth",block:"start"})});
document.querySelector("[data-puzzle-category='mate4']").addEventListener("click",()=>{focusPuzzleChapter("mate4",nextUnsolvedPuzzleIndex("mate4"));document.querySelector("#mate4-bank")?.scrollIntoView({behavior:"smooth",block:"start"})});
document.querySelector("[data-puzzle-category='mate5']").addEventListener("click",()=>{focusPuzzleChapter("mate5",nextUnsolvedPuzzleIndex("mate5"));document.querySelector("#mate5-bank")?.scrollIntoView({behavior:"smooth",block:"start"})});
document.querySelector("#continue-puzzle").addEventListener("click",()=>startPuzzleWithEnergy(nextUnsolvedPuzzleIndex("mate1"),"mate1"));
document.querySelector("#continue-mate2").addEventListener("click",()=>startPuzzleWithEnergy(nextUnsolvedPuzzleIndex("mate2"),"mate2"));
document.querySelector("#continue-mate3").addEventListener("click",()=>startPuzzleWithEnergy(nextUnsolvedPuzzleIndex("mate3"),"mate3"));
document.querySelector("#continue-mate4").addEventListener("click",()=>startPuzzleWithEnergy(nextUnsolvedPuzzleIndex("mate4"),"mate4"));
document.querySelector("#continue-mate5").addEventListener("click",()=>startPuzzleWithEnergy(nextUnsolvedPuzzleIndex("mate5"),"mate5"));
document.querySelectorAll("[data-tactic-category]").forEach(button=>button.addEventListener("click",()=>{
 const category=button.dataset.tacticCategory;
 if(!isTacticCategory(category))return;
 selectedTacticCategory=category;
 const bank=document.querySelector("#tactic-bank");if(bank)bank.hidden=false;
 focusPuzzleChapter(category,nextUnsolvedPuzzleIndex(category));
 bank?.scrollIntoView({behavior:"smooth",block:"start"});
}));
document.querySelector("#continue-tactic").addEventListener("click",()=>startPuzzleWithEnergy(nextUnsolvedPuzzleIndex(selectedTacticCategory),selectedTacticCategory));
document.querySelector("#back-menu").addEventListener("click",async()=>{
 clearTimeout(botTimer);cancelDrag();cancelMotion();clearScene();closePromotion();resetReview();
 if(gameMode==="online"&&onlineMatchId&&supabaseClient){
  try{await supabaseClient.rpc("leave_match",{p_match_id:onlineMatchId})}catch{}
  if(onlineChannel){await supabaseClient.removeChannel(onlineChannel);onlineChannel=null}
  onlineMatchId=null;onlineColor=null;onlineOpponent="";onlineVersion=0;setOnlineClocksVisible(false);
 }
 gameStarted=false;platformGameplayStop();resetButton.hidden=false;showScreen("menu");
});
function requestRewardedEnergy(){
 if(!canOfferEnergyAd())return;
 const sdk=window.YandexPlatform?.ysdk||window.ysdk;
 if(gameMode==="online"&&gameStarted&&!finished){
  renderEnergy(t("Во время онлайн-партии реклама недоступна."));
  return;
 }
 if(sdk?.adv?.showRewardedVideo){
  if(pauseReasons.has("ad"))return;
  setPauseReason("ad",true);
  let rewarded=false;
  const closeAd=()=>setPauseReason("ad",false);
  const adError=()=>{renderEnergy(t("Реклама сейчас недоступна. Попробуй позже."));closeAd()};
  try{
   sdk.adv.showRewardedVideo({callbacks:{
    onOpen:()=>setPauseReason("ad",true),
    onRewarded:()=>{if(!rewarded){rewarded=true;addEnergy(10,t("Реклама просмотрена: +10 ⚡ энергии."));saveCloudProgressNow()}},
    onClose:closeAd,
    onError:adError
   }});
  }catch(error){adError()}

 }else{
  renderEnergy(t("Реклама доступна в версии игры на Яндекс Играх."));
 }
}
document.querySelector("#energy-ad").addEventListener("click",requestRewardedEnergy);
document.querySelector("#puzzles-energy-ad").addEventListener("click",requestRewardedEnergy);
showStats();renderEnergy();renderPuzzleHub();refreshProfileUI();const accountReady=initializeAccount();
for(const screen of Object.values(screens))screen.inert=true;
accountReady.finally(()=>{for(const screen of Object.values(screens))screen.inert=false});
setInterval(()=>{tickIntroduction();renderEnergy()},1000);

document.querySelector("#claim-draw").addEventListener("click",()=>{if(gameMode!=="match"||finished||moving||turn!==playerColor)return;const draw=drawState();if(draw.claim){const message=t("Ничья по заявлению: {0}.",[draw.claim]);endMatch("draws",message);showResult("draw",message)}});
document.querySelector("#promotion-cancel").addEventListener("click",()=>{closePromotion();render();statusElement.textContent=t("Превращение отменено. Выбери ход снова.")});
window.addEventListener("keydown",e=>{if(e.key==="Escape"&&pendingPromotion){closePromotion();render()}});

document.querySelector("#analysis-entry").addEventListener("click",openReview);
document.querySelector("#result-analysis").addEventListener("click",openReview);
document.querySelector("#result-new").addEventListener("click",restartCurrentGame);
document.querySelector("#result-next").addEventListener("click",()=>{const list=activePuzzles();startPuzzleWithEnergy((puzzleIndex+1)%list.length,puzzleCategory)});
document.querySelector("#result-menu").addEventListener("click",()=>document.querySelector("#back-menu").click());
document.querySelector("#resign").addEventListener("click",()=>{
 if(!gameStarted||finished||gameMode!=="match")return;
 clearTimeout(botTimer);cancelMotion();clearScene();const message=t("Ты сдался. Победа компьютера.");
 endMatch("losses",message,false);showResult("resign",message);
});
for(const [id,position] of [["#review-first",0],["#review-prev",-1],["#review-next",1],["#review-last",Infinity]])
 document.querySelector(id).addEventListener("click",()=>setReviewPly(position===Infinity?reviewMoves.length:position===0?0:reviewPly+position));
document.querySelector("#review-close").addEventListener("click",closeReview);
document.querySelector("#copy-pgn").addEventListener("click",async()=>{
 const pgn=chess.pgn();
 try{await navigator.clipboard.writeText(pgn);document.querySelector("#copy-pgn").textContent=t("PGN скопирован")}
 catch{
  const file=new Blob([pgn],{type:"application/x-chess-pgn;charset=utf-8"}),url=URL.createObjectURL(file),link=document.createElement("a");
  link.href=url;link.download="partiya.pgn";link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  document.querySelector("#copy-pgn").textContent=t("PGN скачан");
 }
});


window.addEventListener("pagehide",()=>{
 try{
  sessionStorage.setItem(scrollKey,String(currentScreenElement()?.scrollTop||0));
  saveGameState();
 }catch{}
});
restoreSession();
// Game Ready also waits for the artwork on the currently visible screen.
const initialArtworkReady=Promise.all([...currentScreenElement().querySelectorAll("img")].map(image=>
 image.complete?Promise.resolve():new Promise(resolve=>{
  image.addEventListener("load",resolve,{once:true});
  image.addEventListener("error",resolve,{once:true});
 })
));
Promise.all([accountReady,initialArtworkReady]).then(()=>window.YandexPlatform?.gameReady?.()).catch(error=>console.warn("Game Ready failed:",error));


function fitGameBoard(){
 if(screens.game.hidden)return;
 const arena=document.querySelector(".game__arena");
 const panel=document.querySelector(".game__panel");
 const sidebar=innerWidth>800||(innerHeight<=540&&innerWidth>innerHeight);
 let width,height;
 if(sidebar){
  const style=getComputedStyle(panel);
  const paddingX=(parseFloat(style.paddingLeft)||0)+(parseFloat(style.paddingRight)||0);
  const paddingY=(parseFloat(style.paddingTop)||0)+(parseFloat(style.paddingBottom)||0);
  const columns=style.gridTemplateColumns?.split(" ")||[];
  const sideWidth=parseFloat(columns[1])||Math.min(300,Math.max(200,innerWidth*.22));
  width=panel.clientWidth-paddingX-sideWidth-(parseFloat(style.columnGap)||12);
  height=panel.clientHeight-paddingY;
 }else{
  const movesPanel=arena.querySelector(".moves-panel");
  width=arena.clientWidth;
  height=arena.clientHeight-movesPanel.getBoundingClientRect().height-(parseFloat(getComputedStyle(arena).rowGap)||6);
 }
 const size=Math.max(0,Math.floor(Math.min(width,height)));
 arena.style.setProperty("--board-size",size+"px");
}
const boardLayoutObserver=new ResizeObserver(fitGameBoard);
boardLayoutObserver.observe(document.querySelector(".game__panel"));
boardLayoutObserver.observe(document.querySelector(".game__arena"));
window.addEventListener("resize",fitGameBoard);
fitGameBoard();
