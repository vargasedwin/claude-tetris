'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

const COLORS = [
  null,
  '#4dd0e1', // I - cyan
  '#f06292', // O - pink
  '#ba68c8', // T - purple
  '#81c784', // S - green
  '#e57373', // Z - red
  '#ffff00', // J - neon yellow
  '#ffb74d', // L - orange
];

// ---- Skins ----
const SKIN_KEY = 'tetris-skin';
const DEFAULT_SKIN = 'retro';

// Traza un rectángulo redondeado (sin depender de ctx.roundRect)
function roundRectPath(c, x, y, w, h, r) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

// Cada skin: paleta (null = usa COLORS, que sigue el tema claro/oscuro) y
// draw(c, px, py, size, color, alpha) para un bloque. alpha < 1 indica pieza
// fantasma: se dibuja además un contorno para que siga siendo legible.
const SKINS = {
  retro: {
    colors: null,
    draw(c, px, py, size, color, alpha) {
      c.globalAlpha = alpha;
      c.fillStyle = color;
      c.fillRect(px + 1, py + 1, size - 2, size - 2);
      c.fillStyle = highlightColor;
      c.fillRect(px + 1, py + 1, size - 2, 4);
    },
  },
  neon: {
    colors: [null, '#00e5ff', '#ff2d95', '#bf5af2', '#39ff14', '#ff3131', '#ffff00', '#ff9100'],
    draw(c, px, py, size, color, alpha) {
      const ghost = alpha < 1;
      c.shadowColor = color;
      c.shadowBlur = ghost ? 0 : 12;
      c.fillStyle = color;
      c.globalAlpha = ghost ? alpha : 0.28;
      c.fillRect(px + 3, py + 3, size - 6, size - 6);
      c.globalAlpha = ghost ? 0.7 : 1;
      c.strokeStyle = color;
      c.lineWidth = 2;
      c.strokeRect(px + 3, py + 3, size - 6, size - 6);
    },
  },
  pastel: {
    colors: [null, '#a8e6ef', '#f8b4cb', '#d5b8ea', '#b9e8c4', '#f7b7b7', '#fff0a0', '#fbd5a5'],
    draw(c, px, py, size, color, alpha) {
      const ghost = alpha < 1;
      c.globalAlpha = alpha;
      c.fillStyle = color;
      roundRectPath(c, px + 1.5, py + 1.5, size - 3, size - 3, size * 0.28);
      c.fill();
      if (ghost) {
        c.globalAlpha = 0.8;
        c.strokeStyle = color;
        c.lineWidth = 2;
        c.stroke();
      } else {
        c.fillStyle = 'rgba(255,255,255,0.45)';
        roundRectPath(c, px + size * 0.22, py + size * 0.18, size * 0.32, size * 0.14, size * 0.07);
        c.fill();
      }
    },
  },
  pixel: {
    colors: [null, '#3fb6c9', '#e0507f', '#9b4fb5', '#4caf50', '#d94a4a', '#e6d200', '#e6892a'],
    draw(c, px, py, size, color, alpha) {
      const inner = size - 2;
      const u = inner / 6; // rejilla de 6x6 "píxeles"
      const ox = px + 1, oy = py + 1;
      c.globalAlpha = alpha;
      c.fillStyle = color;
      c.fillRect(ox, oy, inner, inner);
      // luz arriba/izquierda, sombra abajo/derecha
      c.fillStyle = 'rgba(255,255,255,0.45)';
      c.fillRect(ox, oy, inner, u);
      c.fillRect(ox, oy, u, inner);
      c.fillStyle = 'rgba(0,0,0,0.4)';
      c.fillRect(ox + u, oy + inner - u, inner - u, u);
      c.fillRect(ox + inner - u, oy + u, u, inner - u);
      // textura tramada (dither) en el centro
      c.fillStyle = 'rgba(0,0,0,0.18)';
      for (let i = 1; i < 5; i++)
        for (let j = 1; j < 5; j++)
          if ((i + j) % 2 === 0) c.fillRect(ox + i * u, oy + j * u, u, u);
      if (alpha < 1) {
        c.globalAlpha = 0.8;
        c.strokeStyle = color;
        c.lineWidth = 2;
        c.strokeRect(ox + 1, oy + 1, inner - 2, inner - 2);
      }
    },
  },
};

let currentSkin = DEFAULT_SKIN;

const PIECES = [
  null,
  [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], // I
  [[2,2],[2,2]],                               // O
  [[0,3,0],[3,3,3],[0,0,0]],                  // T
  [[0,4,4],[4,4,0],[0,0,0]],                  // S
  [[5,5,0],[0,5,5],[0,0,0]],                  // Z
  [[6,0,0],[6,6,6],[0,0,0]],                  // J
  [[0,0,7],[7,7,7],[0,0,0]],                  // L
];

const LINE_SCORES = [0, 100, 300, 500, 800];

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-canvas');
const nextCtx = nextCanvas.getContext('2d');
const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayScore = document.getElementById('overlay-score');
const restartBtn = document.getElementById('restart-btn');
const themeToggle = document.getElementById('theme-toggle');
const skinSelect = document.getElementById('skin-select');

const THEME_KEY = 'tetris-theme';
let gridColor = '#22222e';
let highlightColor = 'rgba(255,255,255,0.12)';

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId;

function createBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}

function randomPiece() {
  const type = Math.floor(Math.random() * 7) + 1;
  const shape = PIECES[type].map(row => [...row]);
  return { type, shape, x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2), y: 0 };
}

function collide(shape, ox, oy) {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const nx = ox + c;
      const ny = oy + r;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && board[ny][nx]) return true;
    }
  }
  return false;
}

function rotateCW(shape) {
  const rows = shape.length, cols = shape[0].length;
  const result = Array.from({ length: cols }, () => new Array(rows).fill(0));
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      result[c][rows - 1 - r] = shape[r][c];
  return result;
}

function tryRotate() {
  const rotated = rotateCW(current.shape);
  const kicks = [0, -1, 1, -2, 2];
  for (const kick of kicks) {
    if (!collide(rotated, current.x + kick, current.y)) {
      current.shape = rotated;
      current.x += kick;
      return;
    }
  }
}

function merge() {
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        board[current.y + r][current.x + c] = current.shape[r][c];
}

function clearLines() {
  let cleared = 0;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r].every(v => v !== 0)) {
      board.splice(r, 1);
      board.unshift(new Array(COLS).fill(0));
      cleared++;
      r++;
    }
  }
  if (cleared) {
    lines += cleared;
    score += (LINE_SCORES[cleared] || 0) * level;
    level = Math.floor(lines / 10) + 1;
    dropInterval = Math.max(100, 1000 - (level - 1) * 90);
    updateHUD();
  }
}

function ghostY() {
  let gy = current.y;
  while (!collide(current.shape, current.x, gy + 1)) gy++;
  return gy;
}

function hardDrop() {
  const gy = ghostY();
  score += (gy - current.y) * 2;
  current.y = gy;
  lockPiece();
}

function softDrop() {
  if (!collide(current.shape, current.x, current.y + 1)) {
    current.y++;
    score += 1;
    updateHUD();
  } else {
    lockPiece();
  }
}

function lockPiece() {
  merge();
  clearLines();
  spawn();
}

function spawn() {
  current = next;
  next = randomPiece();
  if (collide(current.shape, current.x, current.y)) {
    endGame();
  }
  drawNext();
}

function updateHUD() {
  scoreEl.textContent = score.toLocaleString();
  linesEl.textContent = lines;
  levelEl.textContent = level;
}

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  const skin = SKINS[currentSkin];
  const color = (skin.colors || COLORS)[colorIndex];
  // save/restore evita que shadowBlur, shadowColor y globalAlpha se filtren
  context.save();
  skin.draw(context, x * size, y * size, size, color, alpha ?? 1);
  context.restore();
}

function drawGrid() {
  ctx.strokeStyle = gridColor;
  ctx.lineWidth = 0.5;
  for (let c = 1; c < COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * BLOCK, 0);
    ctx.lineTo(c * BLOCK, ROWS * BLOCK);
    ctx.stroke();
  }
  for (let r = 1; r < ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * BLOCK);
    ctx.lineTo(COLS * BLOCK, r * BLOCK);
    ctx.stroke();
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();

  // board
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      drawBlock(ctx, c, r, board[r][c], BLOCK);

  // ghost
  const gy = ghostY();
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        drawBlock(ctx, current.x + c, gy + r, current.shape[r][c], BLOCK, 0.2);

  // current piece
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      drawBlock(ctx, current.x + c, current.y + r, current.shape[r][c], BLOCK);
}

function drawNext() {
  const NB = 30;
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  const shape = next.shape;
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      drawBlock(nextCtx, offX + c, offY + r, shape[r][c], NB);
}

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);
  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;
  overlay.classList.remove('hidden');
}

function togglePause() {
  if (gameOver) return;
  paused = !paused;
  if (!paused) {
    lastTime = performance.now();
    loop(lastTime);
  } else {
    cancelAnimationFrame(animId);
    overlayTitle.textContent = 'PAUSA';
    overlayScore.textContent = '';
    overlay.classList.remove('hidden');
  }
}

function loop(ts) {
  const dt = ts - lastTime;
  lastTime = ts;
  dropAccum += dt;
  if (dropAccum >= dropInterval) {
    dropAccum = 0;
    if (!collide(current.shape, current.x, current.y + 1)) {
      current.y++;
    } else {
      lockPiece();
    }
  }
  draw();
  animId = requestAnimationFrame(loop);
}

function init() {
  board = createBoard();
  score = 0;
  lines = 0;
  level = 1;
  paused = false;
  gameOver = false;
  dropInterval = 1000;
  dropAccum = 0;
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
  overlay.classList.add('hidden');
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  if (e.code === 'KeyP') { togglePause(); return; }
  if (paused || gameOver) return;
  switch (e.code) {
    case 'ArrowLeft':
      if (!collide(current.shape, current.x - 1, current.y)) current.x--;
      break;
    case 'ArrowRight':
      if (!collide(current.shape, current.x + 1, current.y)) current.x++;
      break;
    case 'ArrowDown':
      softDrop();
      break;
    case 'ArrowUp':
    case 'KeyX':
      tryRotate();
      break;
    case 'Space':
      e.preventDefault();
      hardDrop();
      break;
  }
  updateHUD();
});

restartBtn.addEventListener('click', init);

function applyTheme(theme, persist) {
  const isLight = theme === 'light';
  document.documentElement.dataset.theme = isLight ? 'light' : 'dark';
  themeToggle.setAttribute('aria-checked', String(isLight));
  if (persist) {
    try { localStorage.setItem(THEME_KEY, isLight ? 'light' : 'dark'); } catch (e) {}
  }
  const style = getComputedStyle(document.documentElement);
  gridColor = style.getPropertyValue('--grid').trim();
  highlightColor = style.getPropertyValue('--highlight').trim();
  COLORS[6] = style.getPropertyValue('--color-j').trim();
  // refrescar el canvas aunque el loop esté detenido (pausa / game over)
  if (current) draw();
  if (next) drawNext();
}

themeToggle.addEventListener('click', () => {
  const isLight = document.documentElement.dataset.theme === 'light';
  applyTheme(isLight ? 'dark' : 'light', true);
  themeToggle.blur(); // evita que Space vuelva a activar el botón
});

// Teclas pulsadas sobre el toggle no deben disparar controles del juego
themeToggle.addEventListener('keydown', e => e.stopPropagation());

// ---- Skins: selector ----
function loadSkin() {
  try {
    const saved = localStorage.getItem(SKIN_KEY);
    if (saved && Object.prototype.hasOwnProperty.call(SKINS, saved)) return saved;
  } catch (e) {}
  return DEFAULT_SKIN;
}

function applySkin(name, persist) {
  if (!Object.prototype.hasOwnProperty.call(SKINS, name)) name = DEFAULT_SKIN;
  currentSkin = name;
  document.documentElement.dataset.skin = name;
  skinSelect.value = name;
  if (persist) {
    try { localStorage.setItem(SKIN_KEY, name); } catch (e) {}
  }
  // relee --grid / --highlight (dependen de skin y tema) y redibuja
  applyTheme(document.documentElement.dataset.theme, false);
}

skinSelect.addEventListener('change', () => {
  applySkin(skinSelect.value, true);
  skinSelect.blur(); // evita que las flechas cambien el selector
});

// Teclas pulsadas sobre el selector no deben disparar controles del juego
skinSelect.addEventListener('keydown', e => e.stopPropagation());

applySkin(loadSkin(), false);
init();
