const boardElement=document.querySelector("#board");
const statusElement=document.querySelector("#status");
const progressElement=document.querySelector("#puzzle-progress");
const ratingElement=document.querySelector("#puzzle-rating");
const sourceElement=document.querySelector("#source");
const nextButton=document.querySelector("#next");
const retryButton=document.querySelector("#retry");

const files="abcdefgh";
const pieceNames={p:"pawn",r:"rook",n:"knight",b:"bishop",q:"queen",k:"king"};
let puzzles=[];
let index=0;
let game=null;
let current=null;
let actualFen="";
let solutionSan=[];
let selectedSquare=null;
let legalTargets=[];
let stage=0;
let locked=false;
let solved=false;

function parseUci(uci){
  return {from:uci.slice(0,2),to:uci.slice(2,4),promotion:uci[4]||"q"};
}

function playUci(chess,uci){
  const m=parseUci(uci);
  return chess.move({from:m.from,to:m.to,promotion:m.promotion});
}

function derivePuzzle(source){
  const chess=new Chess(source.source_fen);
  const sourceMoves=source.source_moves_uci;
  const setupMove=playUci(chess,sourceMoves[0]);
  if(!setupMove)throw new Error("Некорректный подготовительный ход "+source.source_puzzle_id);
  const fen=chess.fen();
  const solutionUci=sourceMoves.slice(1,4);
  const san=[];
  for(const uci of solutionUci){
    const move=playUci(chess,uci);
    if(!move)throw new Error("Некорректное решение "+source.source_puzzle_id+": "+uci);
    san.push(move.san);
  }
  return {...source,fen,solution_uci:solutionUci,solution_san:san};
}

function getSprite(piece){
  const color=piece.color==="w"?"white":"black";
  return "assets/pieces/fantasy/"+color+"-"+pieceNames[piece.type]+".png";
}

function render(){
  boardElement.replaceChildren();
  const position=game.board();
  for(let r=0;r<8;r++){
    for(let c=0;c<8;c++){
      const square=files[c]+(8-r);
      const cell=document.createElement("button");
      cell.type="button";
      cell.className="square "+((r+c)%2?"square--dark":"square--light");
      cell.dataset.square=square;
      cell.setAttribute("role","gridcell");
      const piece=position[r][c];
      if(selectedSquare===square)cell.classList.add("square--selected");
      if(legalTargets.includes(square))cell.classList.add(piece?"square--capture":"square--move");
      if(piece){
        const img=document.createElement("img");
        img.className="piece-image";
        img.src=getSprite(piece);
        img.alt="";
        img.draggable=false;
        cell.append(img);
      }
      boardElement.append(cell);
    }
  }
}

function clearSelection(){
  selectedSquare=null;
  legalTargets=[];
}

function selectSquare(square){
  const piece=game.get(square);
  if(!piece||piece.color!=="w")return;
  selectedSquare=square;
  legalTargets=game.moves({square,verbose:true}).map(m=>m.to);
  render();
}

function wrongMove(){
  statusElement.textContent="Неверно. Попробуй ещё раз.";
  boardElement.classList.remove("square--wrong");
  void boardElement.offsetWidth;
  boardElement.classList.add("square--wrong");
}

function expectedFirstMove(uci){
  return uci===current.solution_uci[0];
}

function expectedMateMove(uci){
  if(game.in_checkmate())return true;
  return false;
}

function makePlayerMove(from,to){
  if(locked||solved)return;
  const promotion=(game.get(from)?.type==="p"&&(to[1]==="8"||to[1]==="1"))?"q":undefined;
  const move=game.move({from,to,promotion});
  clearSelection();
  if(!move){render();return;}

  const uci=from+to+(move.promotion||"");
  if(stage===0 && !expectedFirstMove(uci)){
    game.undo();
    render();
    wrongMove();
    return;
  }

  if(stage===1){
    if(!game.in_checkmate()){
      game.undo();
      render();
      wrongMove();
      return;
    }
    solved=true;
    locked=false;
    render();
    statusElement.textContent="Мат! Задача решена.";
    nextButton.disabled=false;
    return;
  }

  render();
  locked=true;
  statusElement.textContent="Верно. Ход чёрных…";
  window.setTimeout(playBlackReply,450);
}

function playBlackReply(){
  const reply=current.solution_uci[1];
  const move=playUci(game,reply);
  if(!move){
    locked=false;
    statusElement.textContent="Ошибка данных задачи.";
    console.error("Invalid black reply",current.source_puzzle_id,reply);
    return;
  }
  stage=1;
  locked=false;
  render();
  statusElement.textContent="Теперь поставь мат.";
}

function onBoardClick(event){
  if(locked||solved||game.turn()!=="w")return;
  const cell=event.target.closest(".square");
  if(!cell)return;
  const square=cell.dataset.square;
  if(selectedSquare){
    if(legalTargets.includes(square)){
      const from=selectedSquare;
      makePlayerMove(from,square);
      return;
    }
    clearSelection();
  }
  selectSquare(square);
}

function loadPuzzle(i){
  index=(i+puzzles.length)%puzzles.length;
  current=derivePuzzle(puzzles[index]);
  actualFen=current.fen;
  solutionSan=current.solution_san;
  game=new Chess(actualFen);
  stage=0;
  locked=false;
  solved=false;
  clearSelection();
  nextButton.disabled=true;
  progressElement.textContent="Задача "+(index+1)+" из "+puzzles.length;
  ratingElement.textContent=current.difficulty+" • рейтинг "+current.rating;
  statusElement.textContent="Белые ходят. Мат в 2.";
  sourceElement.innerHTML='Lichess Puzzle DB · <a href="'+current.source_url+'" target="_blank" rel="noopener">задача '+current.source_puzzle_id+"</a>";
  render();
}

async function init(){
  try{
    const response=await fetch("data/mate-in-2-source.json");
    if(!response.ok)throw new Error("HTTP "+response.status);
    puzzles=await response.json();
    if(puzzles.length!==50)throw new Error("Ожидалось 50 задач, получено "+puzzles.length);
    loadPuzzle(0);
  }catch(error){
    console.error(error);
    statusElement.textContent="Не удалось загрузить задачи.";
  }
}

boardElement.addEventListener("click",onBoardClick);
retryButton.addEventListener("click",()=>loadPuzzle(index));
nextButton.addEventListener("click",()=>loadPuzzle(index+1));
init();
