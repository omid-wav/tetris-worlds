'use strict';
/* Rendering, input, effects and menus. Depends on game.js and audio.js. */

const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));

// ---------------------------------------------------------------- storage
const store = {
  get(key, fallback) {
    try {
      const v = localStorage.getItem('tetris.' + key);
      return v === null ? fallback : JSON.parse(v);
    } catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem('tetris.' + key, JSON.stringify(value)); } catch { /* ignore */ }
  },
};

// ---------------------------------------------------------------- settings
const ACTIONS = {
  left: 'Links', right: 'Rechts', soft: 'Soft Drop', hard: 'Hard Drop',
  cw: 'Rechts drehen', ccw: 'Links drehen', r180: '180° drehen',
  hold: 'Hold', pause: 'Pause', restart: 'Neustart',
};
const DEFAULT_KEYS = {
  left: ['ArrowLeft'], right: ['ArrowRight'], soft: ['ArrowDown'], hard: ['Space'],
  cw: ['ArrowUp', 'KeyX'], ccw: ['KeyZ', 'KeyY', 'ControlLeft'], r180: ['KeyA'],
  hold: ['KeyC', 'ShiftLeft', 'ShiftRight'], pause: ['Escape', 'KeyP'], restart: ['KeyR'],
};
const SETTINGS_VERSION = 2;
const DEFAULT_SETTINGS = {
  das: 160, arr: 33, sdf: 20, music: 50, sfx: 70,
  ghost: true, grid: true, shake: true, particles: true, og: false, ogPalette: 'dmg',
  dasCut: true, rumble: true,
  keys: DEFAULT_KEYS,
};
const settings = Object.assign({}, DEFAULT_SETTINGS, store.get('settings', {}));
settings.keys = Object.assign({}, DEFAULT_KEYS, settings.keys);
if ((settings.v || 1) < 2) {
  // v1 shipped with very twitchy handling (DAS 133 / ARR 10); move untouched values to the calmer defaults
  if (settings.das === 133) settings.das = DEFAULT_SETTINGS.das;
  if (settings.arr === 10) settings.arr = DEFAULT_SETTINGS.arr;
}
settings.v = SETTINGS_VERSION;
const saveSettings = () => store.set('settings', settings);

let layoutMap = null;
if (navigator.keyboard && navigator.keyboard.getLayoutMap) {
  navigator.keyboard.getLayoutMap().then(m => { layoutMap = m; renderKeybinds(); }).catch(() => {});
}
function keyName(code) {
  const special = {
    ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓', Space: 'Space',
    ShiftLeft: 'Shift', ShiftRight: 'Shift R', ControlLeft: 'Strg', ControlRight: 'Strg R',
    AltLeft: 'Alt', Escape: 'Esc', Enter: 'Enter', Backspace: '⌫', Tab: 'Tab',
  };
  if (special[code]) return special[code];
  if (layoutMap && layoutMap.get(code)) return layoutMap.get(code).toUpperCase();
  return code.replace(/^Key|^Digit/, '');
}

// ---------------------------------------------------------------- visuals
const COLORS = {
  I: '#00e5ff', O: '#ffd500', T: '#b04dff', S: '#39e75f',
  Z: '#ff3b4f', J: '#2f6bff', L: '#ff8c1a', G: '#6c7384',
};
const WORLDS = [
  { name: 'Terra', a: [30, 70, 170], b: [6, 10, 34], accent: '#4fc3ff', accent2: '#b04dff' },
  { name: 'Aqua', a: [10, 120, 140], b: [2, 18, 32], accent: '#39f0d8', accent2: '#2f6bff' },
  { name: 'Verdant', a: [40, 130, 60], b: [4, 22, 12], accent: '#7dff6b', accent2: '#ffd500' },
  { name: 'Ignis', a: [170, 50, 20], b: [30, 6, 4], accent: '#ff8c1a', accent2: '#ff3b4f' },
  { name: 'Nebula', a: [120, 40, 170], b: [18, 4, 32], accent: '#d27bff', accent2: '#ff4fd8' },
  { name: 'Solaris', a: [180, 130, 20], b: [30, 18, 4], accent: '#ffd500', accent2: '#ff8c1a' },
  { name: 'Glacies', a: [120, 170, 220], b: [10, 20, 36], accent: '#bfe8ff', accent2: '#4fc3ff' },
  { name: 'Void', a: [110, 10, 40], b: [4, 2, 8], accent: '#ff3b6a', accent2: '#b04dff' },
];

// ---------------------------------------------------------------- OG skin (Game Boy)
const OG_UNLOCK_SCORE = 100000;
// four-shade palettes, lightest first; the OG skin is drawn with exactly one of them
const GB_PALETTES = {
  dmg: { name: 'DMG', sub: 'Grün, 1989', unlock: OG_UNLOCK_SCORE, colors: ['#9bbc0f', '#8bac0f', '#306230', '#0f380f'] },
  pocket: { name: 'Pocket', sub: 'Graugrün', unlock: 150000, colors: ['#c4cfa1', '#8b956d', '#4d533c', '#1f1f1f'] },
  classic: { name: 'Klassik', sub: 'Beige', unlock: 150000, colors: ['#e0dbc4', '#a9a58b', '#6b6856', '#2a2a24'] },
  light: { name: 'Light', sub: 'Türkis', unlock: 200000, colors: ['#00b581', '#009a71', '#00694a', '#004f3b'] },
  super: { name: 'Super', sub: 'Sepia', unlock: 200000, colors: ['#f7e7c6', '#d68e49', '#a63725', '#331e50'] },
};
let GB = GB_PALETTES.dmg.colors;
// 8×8 pixel patterns per piece, indices into GB (0 = lightest)
const GB_PATTERNS = {
  I: ['33333333', '30000003', '31111113', '32222223', '32222223', '31111113', '30000003', '33333333'],
  O: ['33333333', '30000003', '30333303', '30300303', '30300303', '30333303', '30000003', '33333333'],
  T: ['33333333', '31111113', '31111113', '31111113', '31111113', '31111113', '31111113', '33333333'],
  S: ['33333333', '31212123', '32121213', '31212123', '32121213', '31212123', '32121213', '33333333'],
  Z: ['33333333', '32222223', '32000023', '32000023', '32000023', '32000023', '32222223', '33333333'],
  J: ['33333333', '30000003', '30000003', '30033003', '30033003', '30000003', '30000003', '33333333'],
  L: ['33333333', '30000033', '30333333', '30333333', '30333333', '30333333', '33333333', '33333333'],
  G: ['33333333', '32222223', '32333323', '32322323', '32322323', '32333323', '32222223', '33333333'],
};
function makeGbSprite(type, size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const rows = GB_PATTERNS[type];
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      g.fillStyle = GB[+rows[y][x]];
      const x0 = Math.round(x * size / 8), y0 = Math.round(y * size / 8);
      g.fillRect(x0, y0, Math.round((x + 1) * size / 8) - x0, Math.round((y + 1) * size / 8) - y0);
    }
  }
  return c;
}
const makeSprite = (type, size) => settings.og ? makeGbSprite(type, size) : makeBlockSprite(COLORS[type], size);
const pieceColor = type => settings.og ? GB[3] : COLORS[type];

function bestScore() {
  return Math.max(0, ...['marathon', 'ultra', 'sprint'].map(m => (store.get(pbKey(m), null) || {}).score || 0));
}
const paletteKey = id => id === 'dmg' ? 'ogUnlocked' : 'ogUnlocked.' + id;
function paletteUnlocked(id) {
  return store.get(paletteKey(id), false) || bestScore() > GB_PALETTES[id].unlock;
}
const ogUnlocked = () => paletteUnlocked('dmg');
function applySkin() {
  if (settings.og && !ogUnlocked()) settings.og = false;
  if (!GB_PALETTES[settings.ogPalette] || !paletteUnlocked(settings.ogPalette)) settings.ogPalette = 'dmg';
  GB = GB_PALETTES[settings.ogPalette].colors;
  document.documentElement.classList.toggle('og', settings.og);
  GB.forEach((c, i) => {
    if (settings.og) document.documentElement.style.setProperty('--gb' + i, c);
    else document.documentElement.style.removeProperty('--gb' + i);
  });
  sound.setRetro(settings.og);
  applyAccent();
  resize();
}

function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  let r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  if (amt >= 0) { r += (255 - r) * amt; g += (255 - g) * amt; b += (255 - b) * amt; }
  else { r *= 1 + amt; g *= 1 + amt; b *= 1 + amt; }
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}
function rgba(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
}

/** Glossy bevelled block, pre-rendered per color. */
function makeBlockSprite(color, size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const s = size, b = Math.max(2, Math.round(s * 0.15));
  g.fillStyle = color;
  g.fillRect(0, 0, s, s);
  const poly = (pts, fill) => {
    g.beginPath();
    g.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]);
    g.closePath();
    g.fillStyle = fill;
    g.fill();
  };
  poly([0, 0, s, 0, s - b, b, b, b], shade(color, 0.55));
  poly([0, 0, b, b, b, s - b, 0, s], shade(color, 0.25));
  poly([s, 0, s, s, s - b, s - b, s - b, b], shade(color, -0.3));
  poly([0, s, b, s - b, s - b, s - b, s, s], shade(color, -0.5));
  const grad = g.createLinearGradient(b, b, s - b, s - b);
  grad.addColorStop(0, shade(color, 0.2));
  grad.addColorStop(1, shade(color, -0.15));
  g.fillStyle = grad;
  g.fillRect(b, b, s - 2 * b, s - 2 * b);
  const gloss = g.createRadialGradient(s * 0.35, s * 0.3, 0, s * 0.35, s * 0.3, s * 0.45);
  gloss.addColorStop(0, 'rgba(255,255,255,0.55)');
  gloss.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gloss;
  g.fillRect(b, b, s - 2 * b, s - 2 * b);
  g.strokeStyle = 'rgba(0,0,0,0.45)';
  g.lineWidth = Math.max(1, s / 32);
  g.strokeRect(0.5, 0.5, s - 1, s - 1);
  return c;
}

const boardCanvas = $('#board'), bctx = boardCanvas.getContext('2d');
const holdCanvas = $('#hold'), hctx = holdCanvas.getContext('2d');
const nextCanvas = $('#next'), nctx = nextCanvas.getContext('2d');
const bgCanvas = $('#bg'), bgctx = bgCanvas.getContext('2d');
const fxCanvas = $('#fx'), fxctx = fxCanvas.getContext('2d');
let CELL = 32, DPR = 1, sprites = {};

function sizeCanvas(canvas, ctx, w, h) {
  canvas.width = Math.round(w * DPR);
  canvas.height = Math.round(h * DPR);
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
}

function resize() {
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  const byHeight = (window.innerHeight - 24) / (ROWS + 0.5);
  const byWidth = (window.innerWidth - 24) / 23;
  CELL = Math.max(14, Math.floor(Math.min(byHeight, byWidth, 40)));
  document.documentElement.style.setProperty('--cell', CELL + 'px');
  sizeCanvas(boardCanvas, bctx, COLS * CELL, ROWS * CELL);
  sizeCanvas(holdCanvas, hctx, CELL * 4.6, CELL * 2.8);
  sizeCanvas(nextCanvas, nctx, CELL * 4.6, CELL * 11.6);
  sizeCanvas(bgCanvas, bgctx, window.innerWidth, window.innerHeight);
  sizeCanvas(fxCanvas, fxctx, window.innerWidth, window.innerHeight);
  sprites = {};
  for (const k of Object.keys(COLORS)) sprites[k] = makeSprite(k, Math.round(CELL * DPR));
  bgPattern = null;
  miniSprites = {};
  initStars();
}
let miniSprites = {};
function miniSprite(type, size) {
  const key = type + size;
  if (!miniSprites[key]) miniSprites[key] = makeSprite(type, Math.round(size * DPR));
  return miniSprites[key];
}

// ---------------------------------------------------------------- background (space worlds)
let stars = [];
const worldState = { from: WORLDS[0], to: WORLDS[0], t: 1, index: 0 };
function initStars() {
  const count = Math.round(window.innerWidth * window.innerHeight / 5000);
  stars = Array.from({ length: count }, () => ({
    x: Math.random() * window.innerWidth,
    y: Math.random() * window.innerHeight,
    z: Math.random() * 0.9 + 0.1,
    tw: Math.random() * Math.PI * 2,
  }));
}
function setWorld(level) {
  const index = (level - 1) % WORLDS.length;
  if (index === worldState.index && worldState.t >= 1) return;
  worldState.from = currentWorldColors();
  worldState.to = WORLDS[index];
  worldState.index = index;
  worldState.t = 0;
  $('#world-name').textContent = WORLDS[index].name;
  applyAccent();
}
function applyAccent() {
  const root = document.documentElement.style;
  if (settings.og) {
    // the stylesheet defines the Game Boy accents; inline world colors would override them
    root.removeProperty('--accent');
    root.removeProperty('--accent-2');
    return;
  }
  const w = WORLDS[worldState.index];
  root.setProperty('--accent', w.accent);
  root.setProperty('--accent-2', w.accent2);
}
function currentWorldColors() {
  const { from, to, t } = worldState;
  const mix = (x, y) => x.map((v, i) => v + (y[i] - v) * t);
  return { a: mix(from.a, to.a), b: mix(from.b, to.b) };
}
let bgTime = 0;
let bgPattern = null;
/** Static brick wall like the sides of the Game Boy playfield. */
function drawGbBackground() {
  const w = window.innerWidth, h = window.innerHeight;
  if (!bgPattern) {
    const bw = Math.max(8, Math.round(CELL * 0.5)), bh = Math.round(bw / 2);
    const tile = document.createElement('canvas');
    tile.width = bw * 2;
    tile.height = bh * 2;
    const t = tile.getContext('2d');
    t.fillStyle = GB[3];
    t.fillRect(0, 0, tile.width, tile.height);
    t.fillStyle = GB[1];
    const px = Math.max(1, Math.round(bw / 8));
    const brick = (x, y) => t.fillRect(x + px, y + px, bw - px, bh - px);
    brick(0, 0); brick(bw, 0);
    brick(-bw / 2, bh); brick(bw / 2, bh); brick(bw * 1.5, bh);
    bgPattern = bgctx.createPattern(tile, 'repeat');
  }
  bgctx.fillStyle = bgPattern;
  bgctx.fillRect(0, 0, w, h);
}
function drawBackground(dt) {
  const w = window.innerWidth, h = window.innerHeight;
  bgTime += dt / 1000;
  worldState.t = Math.min(1, worldState.t + dt / 1500);
  if (settings.og) { drawGbBackground(); return; }
  const { a, b } = currentWorldColors();
  const rgb = (c, al = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${al})`;
  bgctx.fillStyle = rgb(b);
  bgctx.fillRect(0, 0, w, h);
  // drifting nebula blobs
  const blobs = [
    [0.25 + Math.sin(bgTime * 0.05) * 0.1, 0.3 + Math.cos(bgTime * 0.07) * 0.1, 0.55, 0.55],
    [0.8 + Math.cos(bgTime * 0.04) * 0.08, 0.75 + Math.sin(bgTime * 0.06) * 0.1, 0.5, 0.4],
    [0.6, 0.15 + Math.sin(bgTime * 0.03) * 0.05, 0.35, 0.25],
  ];
  for (const [bx, by, r, al] of blobs) {
    const g = bgctx.createRadialGradient(bx * w, by * h, 0, bx * w, by * h, r * Math.max(w, h));
    g.addColorStop(0, rgb(a, al));
    g.addColorStop(1, rgb(a, 0));
    bgctx.fillStyle = g;
    bgctx.fillRect(0, 0, w, h);
  }
  // stars fall faster at higher levels
  const speed = 12 + (game ? Math.min(game.level, 20) * 5 : 0);
  for (const s of stars) {
    s.y += s.z * speed * dt / 1000;
    if (s.y > h) { s.y = 0; s.x = Math.random() * w; }
    const tw = 0.6 + Math.sin(bgTime * 3 + s.tw) * 0.4;
    bgctx.fillStyle = `rgba(255,255,255,${s.z * tw})`;
    const size = s.z * 2;
    bgctx.fillRect(s.x, s.y, size, size);
  }
}

// ---------------------------------------------------------------- effects
const particles = [];
const trails = [];
const lockFlashes = [];
const shake = { amount: 0, x: 0, y: 0 };
const bump = { y: 0, v: 0 };
const wallKick = { x: 0, v: 0 };          // sideways spring of the well when bumping into a wall
const pieceFx = { nudge: 0, rot: 0, fail: 0, streaks: [] }; // input feedback on the active piece
let displayScore = 0;

function boardRect() { return boardCanvas.getBoundingClientRect(); }

function spawnParticles(x, y, color, count, power = 1, opts = {}) {
  if (!settings.particles || settings.og) return;
  for (let i = 0; i < count; i++) {
    const ang = opts.angle !== undefined ? opts.angle + (Math.random() - 0.5) * (opts.spread || 1) : Math.random() * Math.PI * 2;
    const sp = (150 + Math.random() * 450) * power;
    particles.push({
      x, y,
      vx: Math.cos(ang) * sp,
      vy: Math.sin(ang) * sp - (opts.lift || 200),
      life: 0,
      max: 500 + Math.random() * 600,
      size: (opts.size || CELL * 0.22) * (0.5 + Math.random()),
      color,
      rot: Math.random() * 6,
      vr: (Math.random() - 0.5) * 12,
      sparkle: Math.random() < (opts.sparkle || 0.2),
    });
  }
}

function addShake(v) {
  if (settings.shake && !settings.og) shake.amount = Math.min(shake.amount + v, CELL * 0.9);
}

function popup(cls, lines) {
  const el = document.createElement('div');
  el.className = 'popup ' + cls;
  for (const [c, text] of lines) {
    const d = document.createElement('div');
    d.className = c;
    d.textContent = text;
    el.appendChild(d);
  }
  const container = $('#popups');
  // Keep at most two popups on screen, the newest on top
  while (container.children.length > 1) container.firstChild.remove();
  container.appendChild(el);
  el.addEventListener('animationend', () => el.remove());
}

function bumpValue(el) {
  el.classList.remove('bump');
  void el.offsetWidth;
  el.classList.add('bump');
}

function updateEffects(dt) {
  const s = dt / 1000;
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life += dt;
    if (p.life >= p.max) { particles.splice(i, 1); continue; }
    p.vy += 1500 * s;
    p.vx *= Math.pow(0.35, s);
    p.x += p.vx * s;
    p.y += p.vy * s;
    p.rot += p.vr * s;
  }
  for (let i = trails.length - 1; i >= 0; i--) if ((trails[i].t += dt) > 260) trails.splice(i, 1);
  for (let i = lockFlashes.length - 1; i >= 0; i--) if ((lockFlashes[i].t += dt) > 160) lockFlashes.splice(i, 1);

  shake.amount *= Math.pow(0.0005, s);
  if (shake.amount < 0.3) shake.amount = 0;
  shake.x = (Math.random() - 0.5) * 2 * shake.amount;
  shake.y = (Math.random() - 0.5) * 2 * shake.amount;
  // spring for the well "thud"
  const acc = -500 * bump.y - 22 * bump.v;
  bump.v += acc * s;
  bump.y += bump.v * s;
  const wAcc = -900 * wallKick.x - 30 * wallKick.v;
  wallKick.v += wAcc * s;
  wallKick.x += wallKick.v * s;
  $('#stage').style.transform = shake.amount ? `translate(${shake.x}px, ${shake.y}px)` : '';
  const moving = Math.abs(bump.y) > 0.05 || Math.abs(wallKick.x) > 0.05;
  $('#well-wrap').style.transform = moving ? `translate(${wallKick.x}px, ${bump.y}px)` : '';

  // piece feedback: the visual nudge snaps back within ~2 frames so the grid position always reads exactly
  pieceFx.nudge *= Math.pow(0.0005, s * 8);
  if (Math.abs(pieceFx.nudge) < 0.01) pieceFx.nudge = 0;
  pieceFx.rot = Math.max(0, pieceFx.rot - dt);
  pieceFx.fail = Math.max(0, pieceFx.fail - dt);
  for (let i = pieceFx.streaks.length - 1; i >= 0; i--) if ((pieceFx.streaks[i].t += dt) > 90) pieceFx.streaks.splice(i, 1);
}

function drawFx() {
  const w = window.innerWidth, h = window.innerHeight;
  fxctx.clearRect(0, 0, w, h);
  for (const p of particles) {
    const a = 1 - p.life / p.max;
    fxctx.save();
    fxctx.globalAlpha = a;
    fxctx.translate(p.x, p.y);
    fxctx.rotate(p.rot);
    if (p.sparkle) {
      fxctx.fillStyle = '#fff';
      fxctx.shadowColor = p.color;
      fxctx.shadowBlur = 8;
      const r = p.size * 0.6;
      fxctx.fillRect(-r * 1.8, -r * 0.25, r * 3.6, r * 0.5);
      fxctx.fillRect(-r * 0.25, -r * 1.8, r * 0.5, r * 3.6);
    } else {
      fxctx.fillStyle = p.color;
      fxctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
      fxctx.fillStyle = 'rgba(255,255,255,0.35)';
      fxctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.3);
    }
    fxctx.restore();
  }
}

// ---------------------------------------------------------------- board rendering
function drawCell(ctx, type, x, y, size = CELL, alpha = 1) {
  const sprite = size === CELL ? sprites[type] : miniSprite(type, size);
  if (alpha !== 1) ctx.globalAlpha = alpha;
  ctx.drawImage(sprite, x, y, size, size);
  if (alpha !== 1) ctx.globalAlpha = 1;
}

function drawBoard() {
  const W = COLS * CELL, H = ROWS * CELL, top = HIDDEN * CELL;
  bctx.clearRect(0, 0, W, H);

  if (settings.grid) {
    bctx.strokeStyle = settings.og ? rgba(GB[3], 0.12) : 'rgba(255,255,255,0.05)';
    bctx.lineWidth = 1;
    bctx.beginPath();
    for (let x = 1; x < COLS; x++) { bctx.moveTo(x * CELL + 0.5, top); bctx.lineTo(x * CELL + 0.5, H); }
    for (let y = HIDDEN + 1; y < ROWS; y++) { bctx.moveTo(0, y * CELL + 0.5); bctx.lineTo(W, y * CELL + 0.5); }
    bctx.stroke();
  }
  if (!game) return;

  const clearingRows = game.clearing ? new Set(game.clearing.rows) : null;
  const deadT = gameOverAnim ? gameOverAnim.t : -1;

  for (let y = 0; y < ROWS; y++) {
    if (clearingRows && clearingRows.has(y)) continue;
    for (let x = 0; x < COLS; x++) {
      const c = game.board[y][x];
      if (!c) continue;
      // game-over: stack turns gray row by row from the bottom
      const gray = deadT >= 0 && (ROWS - y) * 40 < deadT;
      drawCell(bctx, gray ? 'G' : c, x * CELL, y * CELL);
    }
  }

  // line clear animation: bright flash, then the row collapses into a beam
  if (game.clearing && settings.og) {
    // Game Boy style: the cleared rows blink a few times, no glow
    const blinkOn = Math.floor(game.clearing.t / 45) % 2 === 0;
    for (const y of game.clearing.rows) {
      if (blinkOn) for (let x = 0; x < COLS; x++) drawCell(bctx, game.board[y][x], x * CELL, y * CELL);
      else { bctx.fillStyle = GB[3]; bctx.fillRect(0, y * CELL, W, CELL); }
    }
  } else if (game.clearing) {
    const p = game.clearing.t / CLEAR_DELAY;
    for (const y of game.clearing.rows) {
      if (p < 0.45) {
        for (let x = 0; x < COLS; x++) drawCell(bctx, game.board[y][x], x * CELL, y * CELL);
        bctx.fillStyle = `rgba(255,255,255,${0.9 - p})`;
        bctx.fillRect(0, y * CELL, W, CELL);
      } else {
        const q = (p - 0.45) / 0.55;
        const bw = W * (1 - q), bh = CELL * (1 - q * 0.8);
        bctx.fillStyle = `rgba(255,255,255,${1 - q * 0.6})`;
        bctx.shadowColor = '#fff';
        bctx.shadowBlur = 20;
        bctx.fillRect((W - bw) / 2, y * CELL + (CELL - bh) / 2, bw, bh);
        bctx.shadowBlur = 0;
      }
    }
  }

  // hard drop trails
  if (!settings.og) for (const tr of trails) {
    const a = 1 - tr.t / 260;
    const g = bctx.createLinearGradient(0, tr.y0, 0, tr.y1);
    g.addColorStop(0, rgba(COLORS[tr.type], 0));
    g.addColorStop(1, rgba(COLORS[tr.type], 0.55 * a));
    bctx.fillStyle = g;
    bctx.fillRect(tr.x + CELL * 0.1, tr.y0, CELL * 0.8, tr.y1 - tr.y0);
  }

  const p = game.piece;
  if (p && !gameOverAnim) {
    if (settings.ghost && settings.og) {
      const gy = game.ghostY();
      bctx.strokeStyle = GB[2];
      bctx.lineWidth = Math.max(1, Math.round(CELL / 16));
      bctx.setLineDash([Math.max(2, CELL / 8), Math.max(2, CELL / 8)]);
      for (const [cx, cy] of ROTATIONS[p.type][p.rot]) {
        bctx.strokeRect((p.x + cx) * CELL + 2, (gy + cy) * CELL + 2, CELL - 4, CELL - 4);
      }
      bctx.setLineDash([]);
    } else if (settings.ghost) {
      const gy = game.ghostY();
      const col = COLORS[p.type];
      for (const [cx, cy] of ROTATIONS[p.type][p.rot]) {
        const x = (p.x + cx) * CELL, y = (gy + cy) * CELL;
        bctx.fillStyle = rgba(col, 0.16);
        bctx.fillRect(x + 1, y + 1, CELL - 2, CELL - 2);
        bctx.strokeStyle = rgba(col, 0.75);
        bctx.lineWidth = 2;
        bctx.strokeRect(x + 2, y + 2, CELL - 4, CELL - 4);
      }
    }
    // piece glows brighter while its lock delay runs out
    // short speed lines on the side the piece just left
    if (!settings.og) {
      for (const st of pieceFx.streaks) {
        const a = 1 - st.t / 90;
        bctx.fillStyle = rgba(COLORS[p.type], 0.45 * a);
        for (const [x, y] of st.cells) {
          const sx = st.dx > 0 ? x * CELL - CELL * 0.35 : (x + 1) * CELL + CELL * 0.05;
          bctx.fillRect(sx, y * CELL + CELL * 0.2, CELL * 0.3, CELL * 0.14);
          bctx.fillRect(sx + CELL * 0.08, y * CELL + CELL * 0.62, CELL * 0.22, CELL * 0.1);
        }
      }
    }
    const failShake = pieceFx.fail > 0 ? Math.sin(pieceFx.fail * 0.25) * CELL * 0.08 * (pieceFx.fail / 120) : 0;
    const offX = pieceFx.nudge * CELL + failShake;
    const lockP = settings.og ? 0 : game.grounded() ? Math.min(1, Math.max(game.lockTimer / LOCK_DELAY, game.lockResets / MAX_LOCK_RESETS)) : 0;
    for (const [cx, cy] of ROTATIONS[p.type][p.rot]) {
      const x = (p.x + cx) * CELL + offX, y = (p.y + cy) * CELL;
      drawCell(bctx, p.type, x, y);
      if (pieceFx.rot > 0) {
        bctx.fillStyle = settings.og ? rgba(GB[0], pieceFx.rot / 90 * 0.6) : `rgba(255,255,255,${pieceFx.rot / 90 * 0.5})`;
        bctx.fillRect(x, y, CELL, CELL);
      }
      if (lockP > 0) {
        bctx.fillStyle = `rgba(255,255,255,${lockP * 0.45})`;
        bctx.fillRect(x, y, CELL, CELL);
      }
    }
  }

  if (!settings.og) for (const f of lockFlashes) {
    bctx.fillStyle = `rgba(255,255,255,${0.7 * (1 - f.t / 160)})`;
    for (const [x, y] of f.cells) bctx.fillRect(x * CELL, y * CELL, CELL, CELL);
  }

  // fade the hidden spawn zone slightly so it reads as "outside" the well
  const fade = bctx.createLinearGradient(0, 0, 0, top);
  fade.addColorStop(0, 'rgba(0,0,0,0.35)');
  fade.addColorStop(1, 'rgba(0,0,0,0)');
  bctx.globalCompositeOperation = 'destination-out';
  bctx.fillStyle = fade;
  bctx.fillRect(0, 0, W, top);
  bctx.globalCompositeOperation = 'source-over';
}

function drawMini(ctx, type, cx, cy, size, alpha = 1) {
  const cells = ROTATIONS[type][0];
  const xs = cells.map(c => c[0]), ys = cells.map(c => c[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const w = (maxX - minX + 1) * size, h = (maxY - minY + 1) * size;
  for (const [x, y] of cells) {
    drawCell(ctx, type, Math.round(cx - w / 2 + (x - minX) * size), Math.round(cy - h / 2 + (y - minY) * size), size, alpha);
  }
}

function drawSide() {
  const hw = CELL * 4.6, hh = CELL * 2.8;
  hctx.clearRect(0, 0, hw, hh);
  if (game && game.holdType) drawMini(hctx, game.holdType, hw / 2, hh / 2, Math.round(CELL * 0.85));
  $('.hold-box').classList.toggle('used', !!(game && game.holdUsed));

  const nw = CELL * 4.6, nh = CELL * 11.6;
  nctx.clearRect(0, 0, nw, nh);
  if (!game) return;
  const big = Math.round(CELL * 0.85), small = Math.round(CELL * 0.62);
  let y = CELL * 1.4;
  game.queue.slice(0, 5).forEach((t, i) => {
    drawMini(nctx, t, nw / 2, y, i === 0 ? big : small, i === 0 ? 1 : 0.85);
    y += i === 0 ? CELL * 2.7 : CELL * 2.05;
  });
}

// ---------------------------------------------------------------- HUD
function fmtTime(ms, cs = true) {
  const m = Math.floor(ms / 60000), s = Math.floor(ms / 1000) % 60, c = Math.floor(ms / 10) % 100;
  return `${m}:${String(s).padStart(2, '0')}` + (cs ? `.${String(c).padStart(2, '0')}` : '');
}
const fmtNum = n => Math.round(n).toLocaleString('de-DE');

let lastHud = {};
function setText(id, text) {
  if (lastHud[id] !== text) { lastHud[id] = text; $('#' + id).textContent = text; }
}
function updateHud(dt) {
  if (!game) return;
  displayScore += (game.score - displayScore) * Math.min(1, dt / 90);
  if (Math.abs(game.score - displayScore) < 1) displayScore = game.score;
  setText('score', fmtNum(displayScore));
  setText('level', String(game.level));
  if (game.mode === 'sprint') {
    setText('lines-label', 'LINES LEFT');
    setText('lines', String(Math.max(0, 40 - game.lines)));
  } else {
    setText('lines-label', 'LINES');
    setText('lines', String(game.lines));
  }
  if (game.mode === 'ultra') {
    setText('time-label', 'TIME LEFT');
    setText('time', fmtTime(Math.max(0, MODES.ultra.timeLimit - game.time)));
  } else {
    setText('time-label', 'TIME');
    setText('time', fmtTime(game.time));
  }
  setText('pps', game.time > 0 ? (game.pieces / (game.time / 1000)).toFixed(2) : '0.00');
  const pr = game.progress();
  $('#level-bar').style.width = (pr.value / pr.max * 100) + '%';
}

function pbKey(mode) { return 'pb.' + mode; }
function formatPb(mode, pb) {
  if (!pb) return '–';
  return mode === 'sprint' ? fmtTime(pb.timeMs) : fmtNum(pb.score);
}
function showPb(mode) { $('#pb').textContent = formatPb(mode, store.get(pbKey(mode), null)); }

// ---------------------------------------------------------------- game lifecycle
let game = null;
let state = 'title';          // title | countdown | playing | paused | over
let currentMode = 'marathon';
let startLevel = store.get('startLevel', 1);
let countdownTimer = null;
let gameOverAnim = null;
let dangerOn = false, dangerBeat = 0;
let buffered = [];

/** Stereo position / column of the active piece for positional sound. */
function pieceSound() {
  if (!game || !game.piece) return {};
  const xs = game.cells().map(c => c[0]);
  const col = (Math.min(...xs) + Math.max(...xs)) / 2;
  return { col, pan: (col / (COLS - 1) - 0.5) * 1.1 };
}

function rumble(strong, weak, ms) {
  if (!settings.rumble || !navigator.getGamepads) return;
  const pad = Array.from(navigator.getGamepads()).find(p => p && p.connected);
  const act = pad && pad.vibrationActuator;
  if (act && act.playEffect) act.playEffect('dual-rumble', { duration: ms, strongMagnitude: strong, weakMagnitude: weak }).catch(() => {});
}

function onGameEvent(type, e) {
  const rect = boardRect();
  const cx = x => rect.left + (x + 0.5) * CELL;
  const cy = y => rect.top + (y + 0.5) * CELL;
  switch (type) {
    case 'spawn':
      // don't let a direction held from the previous piece fling the new one into the wall
      if (settings.dasCut && das.dir) { das.timer = 0; das.arrTimer = 0; }
      das.wallHit = false;
      pieceFx.nudge = 0;
      pieceFx.streaks.length = 0;
      break;
    case 'land': {
      sound.play('land', pieceSound());
      bump.v += 22;
      rumble(0, 0.25, 40);
      // a little dust under each bottom cell of the piece
      for (const [x, y] of e.cells) {
        if (e.cells.some(([ox, oy]) => ox === x && oy === y + 1)) continue;
        spawnParticles(cx(x), rect.top + (y + 1) * CELL, 'rgba(255,255,255,0.8)', 1, 0.25,
          { angle: -Math.PI / 2, spread: 3, lift: 20, size: CELL * 0.1, sparkle: 0 });
      }
      break;
    }
    case 'harddrop': {
      sound.play('harddrop', { dist: e.dist, ...pieceSound() });
      rumble(0.35 + Math.min(e.dist, 20) * 0.02, 0.5, 90);
      const top = {}, bottom = {};
      for (const [x, y] of e.from) top[x] = Math.min(top[x] ?? 99, y);
      for (const [x, y] of e.to) bottom[x] = Math.max(bottom[x] ?? -1, y);
      if (e.dist > 0) {
        for (const x of Object.keys(bottom)) {
          trails.push({ x: x * CELL, y0: top[x] * CELL, y1: (bottom[x] + 1) * CELL, type: e.type, t: 0 });
        }
      }
      for (const [x, y] of Object.entries(bottom)) {
        spawnParticles(cx(+x), rect.top + (y + 1) * CELL, pieceColor(e.type), 3 + Math.min(6, e.dist / 3), 0.5,
          { angle: -Math.PI / 2, spread: 2.6, lift: 60, size: CELL * 0.14, sparkle: 0.4 });
      }
      addShake(2 + Math.min(e.dist, 20) * 0.25);
      bump.v += 60 + e.dist * 12;
      break;
    }
    case 'lock':
      if (!game.over) sound.play('lock', { pan: ((Math.min(...e.cells.map(c => c[0])) + 1) / (COLS - 1) - 0.5) * 1.1 });
      lockFlashes.push({ cells: e.cells, t: 0 });
      break;
    case 'hold':
      sound.play('hold');
      break;
    case 'softdrop':
      sound.play('softdrop');
      break;
    case 'clear': onClear(e, rect, cx, cy); break;
    case 'levelup':
      sound.play('levelup');
      setWorld(e.level);
      popup('level', [['main', `LEVEL ${e.level}`], ['sub', `World ${WORLDS[(e.level - 1) % WORLDS.length].name}`]]);
      $('#well').classList.remove('flash'); void $('#well').offsetWidth; $('#well').classList.add('flash');
      bumpValue($('#level'));
      for (let i = 0; i < 40; i++) {
        spawnParticles(rect.left + Math.random() * rect.width, rect.top + rect.height * 0.3, WORLDS[(e.level - 1) % WORLDS.length].accent, 1, 1, { sparkle: 0.8 });
      }
      break;
    case 'gameover': endGame(false); break;
    case 'finish': endGame(true); break;
    default: break;
  }
}

function onClear(e, rect, cx, cy) {
  const { n, tspin, b2b, combo, perfect, points } = e;
  if (n === 0) {
    sound.play('tspinNoLines');
    popup('tspin', [['main', tspin === 'mini' ? 'T-SPIN MINI' : 'T-SPIN'], ['pts', `+${fmtNum(points)}`]]);
    return;
  }
  sound.play('clear', { n, tspin, b2b, combo, perfect });
  const names = ['', 'SINGLE', 'DOUBLE', 'TRIPLE', 'TETRIS'];
  const lines = [];
  let cls = '';
  if (tspin) {
    cls = 'tspin';
    lines.push(['main', `T-SPIN ${tspin === 'mini' ? 'MINI ' : ''}${names[n]}`]);
  } else if (n === 4) {
    cls = 'tetris';
    lines.push(['main', 'TETRIS!']);
  } else {
    lines.push(['main', names[n]]);
  }
  if (b2b) lines.push(['sub', 'BACK-TO-BACK']);
  if (combo > 0) lines.push(['sub', `${combo} COMBO`]);
  lines.push(['pts', `+${fmtNum(points)}`]);
  if (!cls && combo > 1) cls = 'combo';
  popup(cls, lines);
  if (perfect) setTimeout(() => popup('pc', [['main', 'PERFECT CLEAR'], ['sub', 'ALL CLEAR!']]), 500);

  const power = n === 4 || tspin ? 1.4 : 0.8 + n * 0.1;
  for (const y of e.rows) {
    for (let x = 0; x < COLS; x++) {
      const t = game.board[y][x];
      spawnParticles(cx(x), cy(y), pieceColor(t), n >= 4 || tspin ? 4 : 2, power,
        { angle: x < COLS / 2 ? Math.PI + 0.3 : -0.3, spread: 1.6, sparkle: n === 4 ? 0.35 : 0.15 });
    }
  }
  if (perfect) {
    for (let i = 0; i < 120; i++) {
      const t = TYPES[i % 7];
      spawnParticles(rect.left + Math.random() * rect.width, rect.bottom - CELL * 2, COLORS[t], 1, 1.8, { angle: -Math.PI / 2, spread: 1.2, sparkle: 0.3 });
    }
  }
  addShake(n === 4 || tspin ? 10 : 2 + n * 2);
  bump.v += 80 * n;
  rumble(n === 4 || tspin ? 0.9 : 0.3 + n * 0.1, 0.6, n === 4 || tspin ? 260 : 120);
  bumpValue($('#score'));
  bumpValue($('#lines'));
}

function newGame(mode = currentMode) {
  currentMode = mode;
  clearTimeout(countdownTimer);
  game = new Game({ mode, startLevel, onEvent: onGameEvent });
  gameOverAnim = null;
  buffered = [];
  displayScore = 0;
  gameMedals = [];
  medalCheckTimer = 0;
  particles.length = trails.length = lockFlashes.length = 0;
  dangerOn = false;
  $('#well').classList.remove('danger');
  $('#popups').innerHTML = '';
  $('#mode-name').textContent = MODES[mode].name + (mode === 'marathon' && startLevel > 1 ? ` (ab Lv ${startLevel})` : '');
  setWorld(game.level);
  showPb(mode);
  hideOverlay();
  sound.init();
  sound.setVolumes(settings.music / 100, settings.sfx / 100);
  sound.stopMusic();
  sound.setTempo(1);
  startCountdown();
}

function startCountdown() {
  state = 'countdown';
  const el = $('#countdown');
  const steps = ['3', '2', '1', 'GO!'];
  let i = 0;
  const tick = () => {
    if (state !== 'countdown') return;
    el.innerHTML = `<span>${steps[i]}</span>`;
    sound.play(i < 3 ? 'countdown' : 'go');
    i++;
    if (i < steps.length) {
      countdownTimer = setTimeout(tick, 550);
    } else {
      countdownTimer = setTimeout(() => { el.innerHTML = ''; }, 500);
      state = 'playing';
      game.start();
      sound.startMusic();
    }
  };
  tick();
}

function pauseGame() {
  if (state !== 'playing' && state !== 'countdown') return;
  if (state === 'countdown') {
    clearTimeout(countdownTimer);
    $('#countdown').innerHTML = '';
  }
  state = state === 'countdown' ? 'paused-countdown' : 'paused';
  // don't keep soft-dropping/auto-shifting after the pause ends
  for (const a of Object.keys(held)) if (held[a]) release(a);
  sound.play('pause');
  sound.muffle(true);
  showScreen('pause');
}

function resumeGame() {
  if (state !== 'paused' && state !== 'paused-countdown') return;
  const wasCountdown = state === 'paused-countdown';
  hideOverlay();
  sound.play('unpause');
  sound.muffle(false);
  if (wasCountdown) startCountdown();
  else state = 'playing';
}

function quitToMenu() {
  clearTimeout(countdownTimer);
  $('#countdown').innerHTML = '';
  sound.stopMusic();
  game = null;
  state = 'title';
  $('#well').classList.remove('danger');
  setWorld(1);
  showScreen('title');
}

function endGame(won) {
  state = 'over';
  recordLifetime(game);
  checkMedals(true);
  sound.stopMusic();
  $('#well').classList.remove('danger');
  if (won) {
    sound.play('win');
    const rect = boardRect();
    for (let i = 0; i < 150; i++) {
      spawnParticles(rect.left + Math.random() * rect.width, rect.top + rect.height * Math.random() * 0.5,
        COLORS[TYPES[i % 7]], 1, 1.3, { sparkle: 0.4 });
    }
    setTimeout(showResults, 1400);
  } else {
    sound.play('gameover');
    gameOverAnim = { t: 0 };
    addShake(8);
    setTimeout(showResults, 1600);
  }
}

// ---------------------------------------------------------------- medals / milestones
const TIERS = ['Bronze', 'Silber', 'Gold', 'Platin'];
const pps = g => g.pieces / Math.max(1, g.time / 1000);
/*
 * Each medal has four goals (bronze → platinum). `get` reads the current game, `life` the lifetime stats.
 * `lower` = smaller is better (times). `final` = only judged when the game ends.
 */
const MEDALS = [
  { id: 'score', name: 'Punktejäger', desc: 'Punkte in einem Spiel', goals: [10000, 50000, 150000, 400000], get: g => g.score },
  { id: 'lines', name: 'Linienleger', desc: 'Lines in einem Spiel', goals: [40, 100, 200, 400], get: g => g.lines },
  { id: 'level', name: 'Aufsteiger', desc: 'Level im Marathon (Start auf Level 1)', goals: [5, 10, 15, 25],
    get: g => (g.mode === 'marathon' && g.startLevel === 1 ? g.level : 0) },
  { id: 'tetris', name: 'Tetris-Meister', desc: 'Tetrisse in einem Spiel', goals: [1, 5, 12, 25], get: g => g.stats.tetrises },
  { id: 'tspin', name: 'Dreher', desc: 'T-Spins in einem Spiel', goals: [1, 4, 10, 20], get: g => g.stats.tspins },
  { id: 'combo', name: 'Kettenreaktion', desc: 'Höchste Combo', goals: [3, 5, 8, 12], get: g => Math.max(0, g.stats.maxCombo) },
  { id: 'pc', name: 'Saubermann', desc: 'Perfect Clears in einem Spiel', goals: [1, 2, 3, 5], get: g => g.stats.perfects },
  { id: 'sprint', name: 'Sprinter', desc: 'Sprint 40L geschafft in unter', goals: [180000, 120000, 90000, 60000], lower: true, final: true,
    get: g => (g.mode === 'sprint' && g.won ? g.time : null), fmt: v => fmtTime(v, false) },
  { id: 'ultra', name: 'Ultra-Profi', desc: 'Punkte im Ultra-Modus', goals: [15000, 40000, 80000, 150000],
    get: g => (g.mode === 'ultra' ? g.score : 0) },
  { id: 'speed', name: 'Flinke Finger', desc: 'Teile pro Sekunde (ab 100 Teilen)', goals: [1, 1.5, 2, 3], final: true,
    get: g => (g.pieces >= 100 ? pps(g) : 0), fmt: v => v.toFixed(1) },
  { id: 'veteran', name: 'Veteran', desc: 'Lines insgesamt', goals: [500, 2000, 5000, 15000], life: l => l.lines },
  { id: 'regular', name: 'Stammspieler', desc: 'Gespielte Spiele', goals: [10, 50, 150, 500], life: l => l.games },
];
const medalFmt = (m, v) => (m.fmt ? m.fmt(v) : fmtNum(v));
const medalTiers = () => store.get('medals', {});
const medalBests = () => store.get('medalBest', {});
let gameMedals = [];   // [{ medal, tier }] earned during the current game
let medalCheckTimer = 0;

function tierFor(m, v) {
  if (v === null || v === undefined) return 0;
  return m.goals.filter(goal => (m.lower ? v < goal : v >= goal)).length;
}

/** Awards newly reached tiers. Live checks skip medals that are only meaningful at the end of a game. */
function checkMedals(final) {
  if (!game) return;
  const tiers = medalTiers(), bests = medalBests(), life = store.get('lifetime', { lines: 0, games: 0 });
  let changed = false;
  for (const m of MEDALS) {
    if (m.final && !final) continue;
    if (m.life && !final) continue;
    const v = m.life ? m.life(life) : m.get(game);
    if (v === null || v === undefined) continue;
    const better = bests[m.id] === undefined || (m.lower ? v < bests[m.id] : v > bests[m.id]);
    if (better && (v || m.lower)) { bests[m.id] = v; changed = true; }
    const tier = tierFor(m, v);
    if (tier > (tiers[m.id] || 0)) {
      tiers[m.id] = tier;
      changed = true;
      gameMedals = gameMedals.filter(x => x.medal !== m);
      gameMedals.push({ medal: m, tier });
      medalToast(m, tier);
    }
  }
  if (changed) {
    store.set('medals', tiers);
    store.set('medalBest', bests);
  }
}

function medalIcon(tier, earned = true) {
  return `<span class="medal t${tier}${earned ? '' : ' dim'}" title="${TIERS[tier - 1]}">★</span>`;
}

let toastQueue = Promise.resolve();
function medalToast(m, tier) {
  // queue toasts so several medals at once don't pile up on top of each other
  toastQueue = toastQueue.then(() => new Promise(resolve => {
    const el = document.createElement('div');
    el.className = 'toast';
    el.innerHTML = `${medalIcon(tier)}<div><div class="tt">MEDAILLE · ${TIERS[tier - 1].toUpperCase()}</div>` +
      `<div class="tn">${escapeHtml(m.name)}</div><div class="td">${escapeHtml(m.desc)}: ${medalFmt(m, m.goals[tier - 1])}</div></div>`;
    $('#toasts').appendChild(el);
    sound.play('medal');
    rumble(0.2, 0.4, 120);
    setTimeout(() => { el.classList.add('out'); setTimeout(() => { el.remove(); resolve(); }, 300); }, 2600);
    setTimeout(resolve, 900); // next toast may start while this one is still visible
  }));
}

/** One-time silent backfill from personal bests recorded before medals existed. */
function backfillMedals() {
  if (store.get('medalsInit', false)) return;
  const tiers = medalTiers(), bests = medalBests();
  const pbs = { marathon: store.get(pbKey('marathon'), null), sprint: store.get(pbKey('sprint'), null), ultra: store.get(pbKey('ultra'), null) };
  const known = {
    score: Math.max(0, ...Object.values(pbs).map(p => (p ? p.score : 0))),
    lines: Math.max(0, ...Object.values(pbs).map(p => (p ? p.lines : 0))),
    ultra: pbs.ultra ? pbs.ultra.score : undefined,
    sprint: pbs.sprint && pbs.sprint.lines >= 40 ? pbs.sprint.timeMs : undefined,
  };
  for (const m of MEDALS) {
    const v = known[m.id];
    if (v === undefined || (!v && !m.lower)) continue;
    bests[m.id] = v;
    tiers[m.id] = Math.max(tiers[m.id] || 0, tierFor(m, v));
  }
  store.set('medals', tiers);
  store.set('medalBest', bests);
  store.set('medalsInit', true);
}

function recordLifetime(g) {
  const life = store.get('lifetime', { lines: 0, games: 0 });
  life.lines += g.lines;
  life.games += 1;
  store.set('lifetime', life);
}

function renderMedals() {
  const tiers = medalTiers(), bests = medalBests(), life = store.get('lifetime', { lines: 0, games: 0 });
  const total = MEDALS.reduce((n, m) => n + (tiers[m.id] || 0), 0);
  $('#medal-summary').innerHTML = TIERS.map((t, i) =>
    `<span>${medalIcon(i + 1)} ${MEDALS.filter(m => (tiers[m.id] || 0) > i).length}</span>`).join('') +
    `<span class="of">${total} / ${MEDALS.length * 4}</span>`;
  $('#medal-grid').innerHTML = MEDALS.map(m => {
    const tier = tiers[m.id] || 0;
    const best = m.life ? m.life(life) : bests[m.id];
    const next = tier < 4 ? `Nächste: ${medalFmt(m, m.goals[tier])}` : 'Alle geschafft!';
    const bestText = best === undefined || best === null || (!best && !m.lower) ? '–' : medalFmt(m, best);
    return `<div class="medal-card${tier === 4 ? ' done' : ''}">
      <div class="mh"><span class="mn">${escapeHtml(m.name)}</span><span class="icons">${[1, 2, 3, 4].map(t => medalIcon(t, tier >= t)).join('')}</span></div>
      <div class="md">${escapeHtml(m.desc)}</div>
      <div class="goals">${m.goals.map((goal, i) => `<span class="${tier > i ? 'hit' : ''}">${medalFmt(m, goal)}</span>`).join('')}</div>
      <div class="mp">Bestwert: <b>${bestText}</b> · ${next}</div>
    </div>`;
  }).join('');
}

// ---------------------------------------------------------------- results & highscores
let lastResult = null;

function showResults() {
  if (state !== 'over' || !game) return;
  const g = game;
  const canSave = g.mode !== 'sprint' || g.won;
  lastResult = {
    mode: g.mode, score: g.score, lines: g.lines, level: g.level,
    timeMs: Math.round(g.time), saved: false,
  };
  $('#result-title').textContent = g.won ? (g.mode === 'ultra' ? 'TIME UP!' : 'GESCHAFFT!') : 'GAME OVER';

  const pb = store.get(pbKey(g.mode), null);
  let isPb = false;
  const unlockedBefore = Object.keys(GB_PALETTES).filter(paletteUnlocked);
  if (canSave) {
    isPb = !pb || (g.mode === 'sprint' ? lastResult.timeMs < pb.timeMs : lastResult.score > pb.score);
    if (isPb && (g.mode === 'sprint' || g.score > 0)) store.set(pbKey(g.mode), lastResult);
    else isPb = false;
  }
  $('#result-badge').classList.toggle('hidden', !isPb);
  const reached = canSave ? Object.keys(GB_PALETTES).filter(id => g.score > GB_PALETTES[id].unlock) : [];
  for (const id of reached) store.set(paletteKey(id), true);
  const newlyUnlocked = reached.filter(id => !unlockedBefore.includes(id));
  if (newlyUnlocked.length) {
    $('#unlock-text').textContent = newlyUnlocked.includes('dmg')
      ? 'OG SKIN FREIGESCHALTET!'
      : `NEUE OG-VARIANTE${newlyUnlocked.length > 1 ? 'N' : ''}: ${newlyUnlocked.map(id => GB_PALETTES[id].name.toUpperCase()).join(' & ')}!`;
  }
  $('#unlock-badge').classList.toggle('hidden', !newlyUnlocked.length);

  const mainVal = g.mode === 'sprint'
    ? (g.won ? fmtTime(g.time) : `${g.lines}/40 Lines`)
    : fmtNum(g.score);
  const items = [
    ['main', g.mode === 'sprint' ? 'ZEIT' : 'SCORE', mainVal],
    ['', 'LINES', g.lines], ['', 'LEVEL', g.level], ['', 'ZEIT', fmtTime(g.time)],
    ['', 'PPS', (g.pieces / Math.max(1, g.time / 1000)).toFixed(2)],
    ['', 'TETRIS', g.stats.tetrises], ['', 'T-SPINS', g.stats.tspins],
    ['', 'MAX COMBO', Math.max(0, g.stats.maxCombo)], ['', 'PERFECT', g.stats.perfects],
  ];
  $('#result-grid').innerHTML = items.map(([c, k, v]) =>
    `<div class="${c}"><div class="k">${k}</div><div class="v">${v}</div></div>`).join('');
  $('#result-medals').innerHTML = gameMedals.length
    ? '<div class="k">NEUE MEDAILLEN</div>' + gameMedals.map(({ medal, tier }) =>
      `<span class="rm">${medalIcon(tier)} ${escapeHtml(medal.name)} <em>${TIERS[tier - 1]}</em></span>`).join('')
    : '';

  $('#save-form').classList.toggle('hidden', !canSave);
  $('#player-name').value = store.get('name', '');
  $('#result-board').innerHTML = '';
  showScreen('results');
  if (isPb) sound.play('levelup');
  loadScores(g.mode).then(list => renderBoard($('#result-board'), g.mode, list, -1));
  if (canSave) setTimeout(() => $('#player-name').focus(), 50);
}

async function loadScores(mode) {
  try {
    const res = await fetch(`api/scores?mode=${mode}`);
    if (!res.ok) throw new Error();
    return await res.json();
  } catch {
    return store.get('localScores.' + mode, []);
  }
}

async function submitScore(name) {
  const r = lastResult;
  const body = new URLSearchParams({ name, mode: r.mode, score: r.score, lines: r.lines, level: r.level, timeMs: r.timeMs });
  try {
    const res = await fetch('api/scores', { method: 'POST', body });
    if (!res.ok) throw new Error();
    return await res.json();
  } catch {
    // offline fallback: keep the table in localStorage
    const list = store.get('localScores.' + r.mode, []);
    const entry = { ...r, name, date: Date.now() };
    list.push(entry);
    list.sort((a, b) => r.mode === 'sprint' ? a.timeMs - b.timeMs : b.score - a.score);
    list.length = Math.min(list.length, 10);
    store.set('localScores.' + r.mode, list);
    const idx = list.indexOf(entry);
    return { rank: idx < 0 ? -1 : idx + 1, scores: list };
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function renderBoard(el, mode, list, highlight) {
  if (!list.length) {
    el.innerHTML = '<div class="empty">Noch keine Einträge – sei der Erste!</div>';
    return;
  }
  const main = mode === 'sprint' ? 'ZEIT' : 'SCORE';
  el.innerHTML = `<table><tr><th>#</th><th>NAME</th><th class="num">${main}</th><th class="num">LINES</th><th class="num">${mode === 'sprint' ? 'PPS' : 'LEVEL'}</th></tr>` +
    list.map((s, i) => `<tr class="${i + 1 === highlight ? 'me' : ''}"><td>${i + 1}</td><td>${escapeHtml(s.name)}</td>` +
      `<td class="num">${mode === 'sprint' ? fmtTime(s.timeMs) : fmtNum(s.score)}</td><td class="num">${s.lines}</td>` +
      `<td class="num">${mode === 'sprint' ? '' : s.level}</td></tr>`).join('') + '</table>';
}

$('#save-form').addEventListener('submit', async ev => {
  ev.preventDefault();
  if (!lastResult || lastResult.saved) return;
  const name = $('#player-name').value.trim() || 'PLAYER';
  store.set('name', name);
  lastResult.saved = true;
  $('#save-form').classList.add('hidden');
  sound.play('menuSelect');
  const res = await submitScore(name);
  renderBoard($('#result-board'), lastResult.mode, res.scores, res.rank);
  $('#btn-retry').focus();
});

let scoresTab = 'marathon';
async function showScoresTab(mode) {
  scoresTab = mode;
  $$('.tabs button').forEach(b => b.classList.toggle('active', b.dataset.tab === mode));
  renderBoard($('#scores-board'), mode, await loadScores(mode), -1);
}
$$('.tabs button').forEach(b => b.addEventListener('click', () => { sound.play('menuMove'); showScoresTab(b.dataset.tab); }));

// ---------------------------------------------------------------- screens
let screenStack = [];
function showScreen(name, push = false) {
  if (push) screenStack.push(currentScreen());
  else screenStack = [];
  $$('.screen').forEach(s => s.classList.remove('active'));
  $('#screen-' + name).classList.add('active');
  $('#overlay').classList.add('visible');
  if (name === 'scores') showScoresTab(scoresTab);
  if (name === 'settings') loadSettingsUI();
  if (name === 'controls') renderControls();
  if (name === 'medals') renderMedals();
  const first = $('#screen-' + name).querySelector('button:not(.hidden), input');
  if (first && name !== 'results') first.focus();
}
function currentScreen() {
  const s = $('.screen.active');
  return s ? s.id.replace('screen-', '') : null;
}
function hideOverlay() {
  $('#overlay').classList.remove('visible');
  $$('.screen').forEach(s => s.classList.remove('active'));
  screenStack = [];
  if (document.activeElement) document.activeElement.blur();
}
function back() {
  const prev = screenStack.pop();
  if (prev) {
    sound.play('menuMove');
    $$('.screen').forEach(s => s.classList.remove('active'));
    $('#screen-' + prev).classList.add('active');
    const first = $('#screen-' + prev).querySelector('button');
    if (first) first.focus();
  } else if (currentScreen() === 'pause') {
    resumeGame();
  }
}

$$('.mode-btn').forEach(b => b.addEventListener('click', () => { sound.init(); sound.play('menuSelect'); newGame(b.dataset.mode); }));
$$('[data-open]').forEach(b => b.addEventListener('click', () => { sound.init(); sound.play('menuSelect'); showScreen(b.dataset.open, true); }));
$$('.back-btn').forEach(b => b.addEventListener('click', back));
$('#btn-resume').addEventListener('click', resumeGame);
$('#btn-restart').addEventListener('click', () => newGame());
$('#btn-quit').addEventListener('click', quitToMenu);
$('#btn-retry').addEventListener('click', () => newGame());
$('#btn-menu').addEventListener('click', quitToMenu);

function setStartLevel(v) {
  startLevel = Math.max(1, Math.min(15, v));
  store.set('startLevel', startLevel);
  $('#start-level').textContent = startLevel;
}
$('#lvl-down').addEventListener('click', () => { sound.play('menuMove'); setStartLevel(startLevel - 1); });
$('#lvl-up').addEventListener('click', () => { sound.play('menuMove'); setStartLevel(startLevel + 1); });
setStartLevel(startLevel);

// ---------------------------------------------------------------- settings UI
const sliderFmt = {
  das: v => v + 'ms', arr: v => v + 'ms', sdf: v => (v >= 41 ? '∞' : v + '×'),
  music: v => v + '%', sfx: v => v + '%',
};
// Sensitivity presets 1..10: one slider that sets DAS and ARR together (5 = the default)
const SENS_PRESETS = [
  [260, 70], [230, 58], [200, 47], [180, 40], [160, 33],
  [140, 25], [125, 18], [110, 10], [95, 5], [80, 0],
];
const SENS_NAMES = ['sehr ruhig', 'sehr ruhig', 'ruhig', 'ruhig', 'ausgewogen', 'ausgewogen', 'flott', 'flott', 'schnell', 'maximal'];
function updateSensUI() {
  const exact = SENS_PRESETS.findIndex(([d, a]) => d === settings.das && a === settings.arr);
  // custom DAS/ARR values: park the slider on the closest preset and label it as custom
  const nearest = exact >= 0 ? exact : SENS_PRESETS.reduce((best, [d, a], i) => {
    const dist = Math.abs(d - settings.das) + Math.abs(a - settings.arr) * 2;
    return dist < best.dist ? { i, dist } : best;
  }, { i: 0, dist: Infinity }).i;
  const input = $('#set-sens');
  input.value = nearest + 1;
  input.nextElementSibling.textContent = exact >= 0 ? String(exact + 1) : 'eigen';
  $('#sens-desc').textContent = exact >= 0
    ? `${SENS_NAMES[exact]} · setzt DAS & ARR`
    : `eigene Werte (DAS ${settings.das} / ARR ${settings.arr})`;
}
$('#set-sens').addEventListener('input', ev => {
  const [d, a] = SENS_PRESETS[+ev.target.value - 1];
  settings.das = d;
  settings.arr = a;
  for (const key of ['das', 'arr']) {
    $('#set-' + key).value = settings[key];
    $('#set-' + key).nextElementSibling.textContent = sliderFmt[key](settings[key]);
  }
  updateSensUI();
  sound.init();
  sound.play('move');
  saveSettings();
});

function loadSettingsUI() {
  for (const key of Object.keys(sliderFmt)) {
    const input = $('#set-' + key);
    input.value = settings[key];
    input.nextElementSibling.textContent = sliderFmt[key](settings[key]);
  }
  updateSensUI();
  for (const key of ['ghost', 'grid', 'shake', 'particles', 'dasCut', 'rumble']) $('#set-' + key).checked = settings[key];
  const unlocked = ogUnlocked();
  $('#set-og').checked = settings.og;
  $('#set-og').disabled = !unlocked;
  $('#og-toggle').classList.toggle('locked', !unlocked);
  $('#og-hint').textContent = unlocked ? 'Game Boy, 1989' : `Gesperrt – Highscore über ${fmtNum(OG_UNLOCK_SCORE)} nötig (Rekord: ${fmtNum(bestScore())})`;
  renderPalettes(unlocked);
  renderKeybinds();
}
for (const key of Object.keys(sliderFmt)) {
  $('#set-' + key).addEventListener('input', ev => {
    settings[key] = +ev.target.value;
    ev.target.nextElementSibling.textContent = sliderFmt[key](settings[key]);
    if (key === 'music' || key === 'sfx') {
      sound.init();
      sound.setVolumes(settings.music / 100, settings.sfx / 100);
      if (key === 'sfx') sound.play('rotate');
    }
    if (key === 'das' || key === 'arr') updateSensUI();
    saveSettings();
  });
}
for (const key of ['ghost', 'grid', 'shake', 'particles', 'dasCut', 'rumble']) {
  $('#set-' + key).addEventListener('change', ev => { settings[key] = ev.target.checked; saveSettings(); });
}
$('#set-og').addEventListener('change', ev => {
  settings.og = ev.target.checked && ogUnlocked();
  saveSettings();
  applySkin();
  sound.play('menuSelect');
});

function renderPalettes(unlocked) {
  const el = $('#og-palettes');
  el.classList.toggle('hidden', !unlocked);
  el.innerHTML = '';
  for (const [id, p] of Object.entries(GB_PALETTES)) {
    const b = document.createElement('button');
    const open = paletteUnlocked(id);
    b.className = 'palette-btn' + (settings.ogPalette === id ? ' active' : '') + (open ? '' : ' locked');
    b.disabled = !open;
    b.title = open ? `${p.name} – ${p.sub}` : `Gesperrt – Highscore über ${fmtNum(p.unlock)} nötig`;
    b.innerHTML = `<span class="swatch">${p.colors.map(c => `<i style="background:${c}"></i>`).join('')}</span>`
      + `<span>${open ? p.name : '🔒 ' + fmtNum(p.unlock / 1000) + 'k'}</span>`;
    b.addEventListener('click', () => {
      settings.ogPalette = id;
      settings.og = true;
      saveSettings();
      applySkin();
      loadSettingsUI();
      sound.play('menuSelect');
    });
    el.appendChild(b);
  }
}

let listeningFor = null;
function renderKeybinds() {
  const el = $('#keybinds');
  el.innerHTML = '';
  for (const [action, label] of Object.entries(ACTIONS)) {
    const b = document.createElement('button');
    b.className = 'keybind' + (listeningFor === action ? ' listening' : '');
    b.innerHTML = `<span>${label}</span><span class="keys">` +
      (listeningFor === action ? '<kbd>Taste drücken…</kbd>' : settings.keys[action].map(k => `<kbd>${escapeHtml(keyName(k))}</kbd>`).join('')) +
      '</span>';
    b.addEventListener('click', () => {
      listeningFor = action;
      renderKeybinds();
      $$('.keybind')[Object.keys(ACTIONS).indexOf(action)].focus();
    });
    el.appendChild(b);
  }
}
$('#reset-keys').addEventListener('click', () => {
  settings.keys = JSON.parse(JSON.stringify(DEFAULT_KEYS));
  saveSettings();
  renderKeybinds();
  sound.play('menuSelect');
});
function renderControls() {
  $('#controls-keys').innerHTML = Object.entries(ACTIONS).map(([a, label]) =>
    `<tr><td>${label}</td><td>${settings.keys[a].map(k => `<kbd>${escapeHtml(keyName(k))}</kbd>`).join(' ')}</td></tr>`).join('');
}

// ---------------------------------------------------------------- input
const held = {};
const das = { dir: 0, timer: 0, arrTimer: 0, wallHit: false };

function actionFor(code) {
  for (const [action, codes] of Object.entries(settings.keys)) if (codes.includes(code)) return action;
  return null;
}

function tryMove(dx, fromPress = false) {
  if (game.move(dx)) {
    sound.play('move', pieceSound());
    das.wallHit = false;
    pieceFx.nudge = -dx * 0.22;
    pieceFx.streaks.push({ dx, cells: game.cells(), t: 0 });
    if (pieceFx.streaks.length > 3) pieceFx.streaks.shift();
    return true;
  }
  // blocked: one clear "thunk" per push, not a stream while auto-repeat keeps pressing
  if (fromPress || !das.wallHit) {
    das.wallHit = true;
    sound.play('wall', pieceSound());
    wallKick.v += dx * 70;
    rumble(0, 0.2, 30);
  }
  return false;
}

function tryRotate(dir) {
  if (game.rotate(dir)) {
    sound.play('rotate', pieceSound());
    pieceFx.rot = 90;
    pieceFx.nudge = 0;
    return;
  }
  sound.play('rotateFail', pieceSound());
  pieceFx.fail = 120;
}

function doAction(action) {
  if (!game || state !== 'playing') return;
  if (!game.piece) {
    // piece not spawned yet (line clear animation): buffer rotations/hold/hard drop
    if (['cw', 'ccw', 'r180', 'hold', 'hard'].includes(action)) buffered.push(action);
    return;
  }
  switch (action) {
    case 'cw': tryRotate(1); break;
    case 'ccw': tryRotate(-1); break;
    case 'r180': tryRotate(2); break;
    case 'hold': if (!game.hold()) sound.play('rotateFail'); break;
    case 'hard': game.hardDrop(); break;
    default: break;
  }
}

function press(action) {
  if (held[action]) return;
  held[action] = true;
  sound.init();
  if (action === 'pause') {
    if (state === 'playing' || state === 'countdown') pauseGame();
    else if (state === 'paused' || state === 'paused-countdown') { if (screenStack.length) back(); else resumeGame(); }
    return;
  }
  if (action === 'restart') {
    if (state === 'playing' || state === 'over' || state === 'countdown') newGame();
    return;
  }
  if (action === 'left' || action === 'right') {
    const dir = action === 'left' ? -1 : 1;
    das.dir = dir;
    das.timer = 0;
    das.arrTimer = 0;
    das.wallHit = false;
    if (state === 'playing' && game.piece) tryMove(dir, true);
    return;
  }
  doAction(action);
}

function release(action) {
  held[action] = false;
  if (action === 'left' || action === 'right') {
    const other = action === 'left' ? 'right' : 'left';
    const dir = action === 'left' ? -1 : 1;
    if (das.dir === dir) {
      das.dir = held[other] ? -dir : 0;
      das.timer = 0;
      das.arrTimer = 0;
    }
  }
}

function updateDas(dt) {
  if (!das.dir || state === 'paused' || state === 'paused-countdown') return;
  das.timer += dt;
  if (state !== 'playing' || !game.piece || das.timer < settings.das) return;
  if (settings.arr === 0) {
    let moved = false;
    while (game.move(das.dir)) moved = true;
    if (moved) { sound.play('move', pieceSound()); das.wallHit = false; }
    tryMove(das.dir); // plays the wall thunk once when the piece arrives
  } else {
    das.arrTimer += dt;
    // at most 2 steps per frame: a hitch in frame timing must not teleport the piece several cells
    let steps = 0;
    while (das.arrTimer >= settings.arr && steps < 2) {
      das.arrTimer -= settings.arr;
      steps++;
      if (!tryMove(das.dir)) { das.arrTimer = 0; break; }
    }
    if (steps === 2) das.arrTimer = Math.min(das.arrTimer, settings.arr);
  }
}

document.addEventListener('keydown', ev => {
  sound.init();
  if (listeningFor) {
    ev.preventDefault();
    if (ev.code !== 'Escape' || listeningFor === 'pause') {
      // a key can only belong to one action
      for (const a of Object.keys(settings.keys)) settings.keys[a] = settings.keys[a].filter(k => k !== ev.code);
      settings.keys[listeningFor] = [ev.code];
      saveSettings();
      sound.play('menuSelect');
    }
    const idx = Object.keys(ACTIONS).indexOf(listeningFor);
    listeningFor = null;
    renderKeybinds();
    $$('.keybind')[idx].focus();
    return;
  }

  const overlayOpen = $('#overlay').classList.contains('visible');
  const inInput = document.activeElement && document.activeElement.tagName === 'INPUT' && document.activeElement.type !== 'range' && document.activeElement.type !== 'checkbox';
  if (inInput) {
    if (ev.code === 'Escape') document.activeElement.blur();
    return;
  }

  if (overlayOpen && state !== 'playing') {
    if (menuKey(ev)) return;
  }
  const action = actionFor(ev.code);
  if (action) {
    ev.preventDefault();
    if (ev.repeat) return;
    press(action);
  }
});
document.addEventListener('keyup', ev => {
  const action = actionFor(ev.code);
  if (action) release(action);
});

/** Arrow/Enter/Escape navigation inside menus. Returns true when the key was consumed. */
function menuKey(ev) {
  const screen = currentScreen();
  if (!screen) return false;
  if (ev.code === 'Escape' || ev.code === 'Backspace') {
    if (screen === 'title') return true;
    if (screen === 'results') { quitToMenu(); return true; }
    if (screen === 'pause' && state.startsWith('paused')) { ev.preventDefault(); resumeGame(); return true; }
    back();
    return true;
  }
  if (screen === 'results' && ev.code === 'KeyR') { newGame(); return true; }
  const vertical = { ArrowUp: -1, ArrowDown: 1 }[ev.code];
  const horizontal = { ArrowLeft: -1, ArrowRight: 1 }[ev.code];
  const active = document.activeElement;
  if (screen === 'title' && horizontal && active && active.dataset.mode === 'marathon') {
    ev.preventDefault();
    sound.play('menuMove');
    setStartLevel(startLevel + horizontal);
    return true;
  }
  if (screen === 'scores' && horizontal) {
    const tabs = ['marathon', 'sprint', 'ultra'];
    sound.play('menuMove');
    showScoresTab(tabs[(tabs.indexOf(scoresTab) + horizontal + 3) % 3]);
    return true;
  }
  if (active && active.type === 'range' && horizontal) return true; // let slider handle it
  if (vertical || (horizontal && screen !== 'settings')) {
    ev.preventDefault();
    focusStep(vertical || horizontal);
    return true;
  }
  if (ev.code === 'Enter' || ev.code === 'Space') {
    if (active && active !== document.body && $('#overlay').contains(active)) {
      if (active.type === 'checkbox') return false;
      ev.preventDefault();
      active.click();
      return true;
    }
  }
  return false;
}

function focusStep(dir) {
  const screen = $('.screen.active');
  const items = Array.from(screen.querySelectorAll('button, input')).filter(el => el.offsetParent !== null);
  if (!items.length) return;
  const i = items.indexOf(document.activeElement);
  const next = items[(i + dir + items.length) % items.length];
  next.focus();
  sound.play('menuMove');
}

window.addEventListener('blur', () => {
  for (const a of Object.keys(held)) if (held[a]) release(a);
  if (state === 'playing') pauseGame();
});
document.addEventListener('visibilitychange', () => { if (document.hidden && state === 'playing') pauseGame(); });

// Gamepad (standard mapping, GameCube adapters usually map A/B/X/Y the same way)
const PAD_MAP = { 14: 'left', 15: 'right', 13: 'soft', 12: 'hard', 0: 'cw', 1: 'ccw', 2: 'r180', 3: 'hold', 4: 'hold', 5: 'hold', 6: 'hold', 7: 'hold', 9: 'pause', 8: 'restart' };
let padPrev = {};
let padMenuRepeat = 0;
function pollGamepad(dt) {
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  const pad = Array.from(pads).find(p => p && p.connected);
  if (!pad) return;
  const now = {};
  for (const [btn, action] of Object.entries(PAD_MAP)) {
    if (pad.buttons[btn] && pad.buttons[btn].pressed) now[action] = true;
  }
  const ax = pad.axes[0] || 0, ay = pad.axes[1] || 0;
  if (ax < -0.5) now.left = true;
  if (ax > 0.5) now.right = true;
  if (ay > 0.6) now.soft = true;

  const overlayOpen = $('#overlay').classList.contains('visible');
  if (overlayOpen && state !== 'playing') {
    // menu navigation
    padMenuRepeat -= dt;
    const dir = now.hard ? -1 : now.soft ? 1 : now.left ? -1 : now.right ? 1 : 0;
    if (dir && (padMenuRepeat <= 0)) {
      const code = now.hard ? 'ArrowUp' : now.soft ? 'ArrowDown' : now.left ? 'ArrowLeft' : 'ArrowRight';
      menuKey({ code, preventDefault() {} });
      padMenuRepeat = padPrevDir(dir) ? 140 : 320;
    }
    if (!dir) padMenuRepeat = 0;
    if (now.cw && !padPrev.cw) menuKey({ code: 'Enter', preventDefault() {} });
    if (now.ccw && !padPrev.ccw) menuKey({ code: 'Escape', preventDefault() {} });
    if (now.pause && !padPrev.pause && state.startsWith('paused')) resumeGame();
    padPrev = now;
    padLastDir = dir;
    return;
  }
  for (const action of new Set([...Object.keys(now), ...Object.keys(padPrev)])) {
    if (now[action] && !padPrev[action]) press(action);
    if (!now[action] && padPrev[action]) release(action);
  }
  padPrev = now;
}
let padLastDir = 0;
function padPrevDir(dir) { return padLastDir === dir; }

// ---------------------------------------------------------------- main loop
let last = performance.now();
function frame(now) {
  const dt = Math.min(100, now - last);
  last = now;

  pollGamepad(dt);

  if (game && state === 'playing') {
    updateDas(dt);
    game.update(dt, !!held.soft, settings.sdf);
    if (game.piece && buffered.length && state === 'playing') {
      const actions = buffered;
      buffered = [];
      for (const a of actions) doAction(a);
    }
    // danger mode: stack reaching the top
    const danger = !game.over && game.stackHeight() >= 17;
    if (danger !== dangerOn) {
      dangerOn = danger;
      $('#well').classList.toggle('danger', danger);
      dangerBeat = 0;
    }
    if (dangerOn) {
      dangerBeat -= dt;
      if (dangerBeat <= 0) { sound.play('danger'); dangerBeat = 900; }
    }
    if ((medalCheckTimer -= dt) <= 0) { medalCheckTimer = 250; checkMedals(false); }
    sound.setTempo((1 + Math.min(game.level - 1, 14) * 0.02) * (dangerOn ? 1.15 : 1));
  } else if (game && state === 'over') {
    game.update(dt, false, settings.sdf);
  } else if (game && state === 'countdown') {
    updateDas(dt); // allow pre-charging DAS during the countdown
  }
  if (gameOverAnim) gameOverAnim.t += dt;

  drawBackground(dt);
  updateEffects(dt);
  updateHud(dt);
  drawBoard();
  drawSide();
  drawFx();
  requestAnimationFrame(frame);
}

window.addEventListener('resize', resize);
setWorld(1);
applySkin();
backfillMedals();
showScreen('title');
requestAnimationFrame(frame);
