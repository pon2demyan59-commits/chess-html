// Первое занятие: создаём доску и начальную расстановку.
// Правила передвижения фигур и компьютерного соперника добавим следующим шагом.
const boardElement = document.querySelector("#board");
const statusElement = document.querySelector("#status");
const resetButton = document.querySelector("#reset");

const symbols = {
  white: { king: "♔", queen: "♕", rook: "♖", bishop: "♗", knight: "♘", pawn: "♙" },
  black: { king: "♚", queen: "♛", rook: "♜", bishop: "♝", knight: "♞", pawn: "♟" }
};
const firstRow = ["rook", "knight", "bishop", "queen", "king", "bishop", "knight", "rook"];
const files = "abcdefgh";
let board = [];
let selected = null;

function startGame() {
  board = Array.from({ length: 8 }, () => Array(8).fill(null));
  firstRow.forEach((type, col) => {
    board[0][col] = { color: "black", type };
    board[7][col] = { color: "white", type };
  });
  for (let col = 0; col < 8; col++) {
    board[1][col] = { color: "black", type: "pawn" };
    board[6][col] = { color: "white", type: "pawn" };
  }
  selected = null;
  statusElement.textContent = "Выбери белую фигуру.";
  renderBoard();
}

function renderBoard() {
  boardElement.replaceChildren();
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const square = document.createElement("button");
      square.type = "button";
      square.className = "square " + ((row + col) % 2 ? "square--dark" : "square--light");
      square.setAttribute("role", "gridcell");
      const piece = board[row][col];
      const coordinate = files[col] + (8 - row);
      square.setAttribute("aria-label", coordinate + (piece ? ", " + (piece.color === "white" ? "белая" : "чёрная") + " фигура: " + piece.type : ", пустая клетка"));
      if (selected && selected.row === row && selected.col === col) {
        square.classList.add("square--selected");
      }
      if (piece) {
        const span = document.createElement("span");
        span.className = "piece piece--" + piece.color;
        span.textContent = symbols[piece.color][piece.type];
        square.append(span);
      }
      square.addEventListener("click", () => selectSquare(row, col));
      boardElement.append(square);
    }
  }
}

function selectSquare(row, col) {
  const piece = board[row][col];
  if (!piece || piece.color !== "white") {
    statusElement.textContent = "Пока можно выбирать только белые фигуры.";
    return;
  }
  selected = { row, col };
  statusElement.textContent = "Выбрана фигура на " + files[col] + (8 - row) + ". Ходы добавим следующим шагом.";
  renderBoard();
}

resetButton.addEventListener("click", startGame);
startGame();
