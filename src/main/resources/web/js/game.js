'use strict';
/* Core Tetris rules: SRS rotation, 7-bag, hold, lock delay, T-spins, guideline scoring.
   Pure logic – no DOM. Communicates via the onEvent callback. */

const COLS = 10;
const ROWS = 22;          // 20 visible + 2 hidden spawn rows on top
const HIDDEN = 2;
const LOCK_DELAY = 500;
const MAX_LOCK_RESETS = 15;
const CLEAR_DELAY = 280;

const SHAPES = {
  I: [[0, 0, 0, 0], [1, 1, 1, 1], [0, 0, 0, 0], [0, 0, 0, 0]],
  J: [[1, 0, 0], [1, 1, 1], [0, 0, 0]],
  L: [[0, 0, 1], [1, 1, 1], [0, 0, 0]],
  O: [[1, 1], [1, 1]],
  S: [[0, 1, 1], [1, 1, 0], [0, 0, 0]],
  T: [[0, 1, 0], [1, 1, 1], [0, 0, 0]],
  Z: [[1, 1, 0], [0, 1, 1], [0, 0, 0]],
};
const TYPES = Object.keys(SHAPES);

function rotateCW(m) {
  const n = m.length;
  return m.map((row, r) => row.map((_, c) => m[n - 1 - c][r]));
}

// ROTATIONS[type][rot] -> list of [x, y] cell offsets
const ROTATIONS = {};
for (const t of TYPES) {
  let m = SHAPES[t];
  ROTATIONS[t] = [];
  for (let r = 0; r < 4; r++) {
    const cells = [];
    m.forEach((row, y) => row.forEach((v, x) => { if (v) cells.push([x, y]); }));
    ROTATIONS[t].push(cells);
    m = rotateCW(m);
  }
}

// SRS kick tables, y-up as in the guideline (converted when applied)
const KICKS_JLSTZ = {
  '01': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  '10': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
  '12': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
  '21': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  '23': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
  '32': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  '30': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  '03': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
};
const KICKS_I = {
  '01': [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
  '10': [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
  '12': [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]],
  '21': [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
  '23': [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
  '32': [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
  '30': [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
  '03': [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]],
};
const KICKS_180 = [[0, 0], [0, 1], [1, 1], [-1, 1], [1, 0], [-1, 0], [0, -1]];

const MODES = {
  marathon: { name: 'Marathon' }, // endless: runs until top-out
  sprint: { name: 'Sprint 40L', goalLines: 40 },
  ultra: { name: 'Ultra 2:00', timeLimit: 120000 },
};

function gravityMs(level) {
  const l = Math.min(level, 20);
  return Math.pow(0.8 - (l - 1) * 0.007, l - 1) * 1000;
}

class Game {
  constructor({ mode = 'marathon', startLevel = 1, nextCount = 5, onEvent = () => {} }) {
    this.mode = mode;
    this.modeInfo = MODES[mode];
    this.startLevel = mode === 'marathon' ? startLevel : 1;
    this.nextCount = nextCount;
    this.emit = onEvent;

    this.board = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
    this.bag = [];
    this.queue = [];
    this.holdType = null;
    this.holdUsed = false;
    this.piece = null;

    this.level = this.startLevel;
    this.lines = 0;
    this.score = 0;
    this.combo = -1;
    this.b2b = false;
    this.time = 0;
    this.pieces = 0;
    this.stats = { singles: 0, doubles: 0, triples: 0, tetrises: 0, tspins: 0, maxCombo: 0, perfects: 0 };

    this.over = false;
    this.won = false;
    this.clearing = null;
    this.gravityAcc = 0;
    this.lockTimer = 0;
    this.lockResets = 0;
    this.lowestY = 0;
    this.lastAction = null;
    this.lastKick = 0;
    this.fillQueue();
  }

  fillQueue() {
    while (this.queue.length < Math.max(this.nextCount, 7)) {
      if (this.bag.length === 0) {
        this.bag = TYPES.slice();
        for (let i = this.bag.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [this.bag[i], this.bag[j]] = [this.bag[j], this.bag[i]];
        }
      }
      this.queue.push(this.bag.pop());
    }
  }

  cells(p = this.piece) {
    return ROTATIONS[p.type][p.rot].map(([cx, cy]) => [p.x + cx, p.y + cy]);
  }

  collides(type, rot, x, y) {
    for (const [cx, cy] of ROTATIONS[type][rot]) {
      const bx = x + cx, by = y + cy;
      if (bx < 0 || bx >= COLS || by >= ROWS) return true;
      if (by >= 0 && this.board[by][bx]) return true;
    }
    return false;
  }

  fits(dx, dy, rot = this.piece.rot) {
    const p = this.piece;
    return !this.collides(p.type, rot, p.x + dx, p.y + dy);
  }

  grounded() {
    return !this.fits(0, 1);
  }

  spawn(type = null) {
    if (!type) {
      type = this.queue.shift();
      this.fillQueue();
    }
    this.piece = { type, rot: 0, x: type === 'O' ? 4 : 3, y: 0 };
    if (this.collides(type, 0, this.piece.x, this.piece.y)) {
      this.gameOver('blockout');
      return false;
    }
    if (this.fits(0, 1)) this.piece.y++;
    this.gravityAcc = 0;
    this.lockTimer = 0;
    this.lockResets = 0;
    this.lowestY = this.piece.y;
    this.lastAction = null;
    this.landed = false;
    this.emit('spawn', { type });
    return true;
  }

  start() {
    this.spawn();
  }

  afterManipulation() {
    // Move reset: manipulating a grounded piece refreshes lock delay (limited)
    if (this.lockResets < MAX_LOCK_RESETS) {
      if (this.lockTimer > 0 || this.grounded()) {
        this.lockTimer = 0;
        this.lockResets++;
      }
    }
  }

  move(dx) {
    if (!this.piece || this.over) return false;
    if (!this.fits(dx, 0)) return false;
    this.piece.x += dx;
    this.lastAction = 'move';
    this.afterManipulation();
    return true;
  }

  rotate(dir) {
    const p = this.piece;
    if (!p || this.over || p.type === 'O') return false;
    const to = (p.rot + (dir === 2 ? 2 : dir) + 4) % 4;
    const kicks = dir === 2 ? KICKS_180 : (p.type === 'I' ? KICKS_I : KICKS_JLSTZ)[`${p.rot}${to}`];
    for (let i = 0; i < kicks.length; i++) {
      const [kx, ky] = kicks[i];
      if (!this.collides(p.type, to, p.x + kx, p.y - ky)) {
        p.x += kx;
        p.y -= ky;
        p.rot = to;
        this.lastAction = 'rotate';
        this.lastKick = i;
        if (p.y > this.lowestY) { this.lowestY = p.y; this.lockResets = 0; }
        this.afterManipulation();
        return true;
      }
    }
    return false;
  }

  stepDown(soft) {
    if (!this.fits(0, 1)) return false;
    this.piece.y++;
    this.lastAction = 'fall';
    if (soft) this.score += 1;
    if (this.piece.y > this.lowestY) {
      this.lowestY = this.piece.y;
      this.lockResets = 0;
      this.lockTimer = 0;
    }
    return true;
  }

  ghostY() {
    const p = this.piece;
    let y = p.y;
    while (!this.collides(p.type, p.rot, p.x, y + 1)) y++;
    return y;
  }

  hardDrop() {
    if (!this.piece || this.over) return;
    const from = this.cells();
    const gy = this.ghostY();
    const dist = gy - this.piece.y;
    if (dist > 0) this.lastAction = 'fall';
    this.piece.y = gy;
    this.score += dist * 2;
    this.emit('harddrop', { from, to: this.cells(), type: this.piece.type, dist });
    this.lock();
  }

  hold() {
    if (!this.piece || this.over || this.holdUsed) return false;
    const current = this.piece.type;
    const swap = this.holdType;
    this.holdType = current;
    this.holdUsed = true;
    this.emit('hold', { type: current });
    this.spawn(swap);
    return true;
  }

  detectTSpin() {
    const p = this.piece;
    if (p.type !== 'T' || this.lastAction !== 'rotate') return null;
    const occ = (x, y) => x < 0 || x >= COLS || y >= ROWS || (y >= 0 && this.board[y][x] !== null);
    const corners = [occ(p.x, p.y), occ(p.x + 2, p.y), occ(p.x, p.y + 2), occ(p.x + 2, p.y + 2)];
    if (corners.filter(Boolean).length < 3) return null;
    const front = [[0, 1], [1, 3], [2, 3], [0, 2]][p.rot];
    if ((corners[front[0]] && corners[front[1]]) || this.lastKick === 4) return 'full';
    return 'mini';
  }

  lock() {
    const p = this.piece;
    const tspin = this.detectTSpin();
    const cells = this.cells();
    for (const [x, y] of cells) {
      if (y >= 0) this.board[y][x] = p.type;
    }
    this.piece = null;
    this.pieces++;
    this.holdUsed = false;
    this.emit('lock', { cells, type: p.type });

    if (cells.every(([, y]) => y < HIDDEN)) {
      this.gameOver('lockout');
      return;
    }

    const rows = [];
    for (let y = 0; y < ROWS; y++) {
      if (this.board[y].every(c => c !== null)) rows.push(y);
    }
    const n = rows.length;

    let base;
    if (tspin === 'full') base = [400, 800, 1200, 1600][n];
    else if (tspin === 'mini') base = [100, 200, 400, 400][n];
    else base = [0, 100, 300, 500, 800][n];

    let b2bBonus = false;
    let comboPoints = 0;
    let perfect = false;
    if (n > 0) {
      const difficult = n === 4 || tspin !== null;
      if (difficult && this.b2b) { base *= 1.5; b2bBonus = true; }
      this.b2b = difficult;
      this.combo++;
      comboPoints = this.combo > 0 ? 50 * this.combo * this.level : 0;
      perfect = this.board.every((row, y) => rows.includes(y) || row.every(c => c === null));
      if (perfect) base += [800, 1200, 1800, 2000][n - 1] * (b2bBonus && n === 4 ? 1.6 : 1);
      this.stats[['singles', 'doubles', 'triples', 'tetrises'][n - 1]]++;
      if (perfect) this.stats.perfects++;
      this.stats.maxCombo = Math.max(this.stats.maxCombo, this.combo);
    } else {
      this.combo = -1;
    }
    if (tspin) this.stats.tspins++;

    const points = Math.round(base * this.level) + comboPoints;
    this.score += points;

    if (n > 0 || tspin) {
      this.emit('clear', { rows, n, tspin, b2b: b2bBonus, combo: this.combo, perfect, points });
    }

    if (n > 0) {
      this.clearing = { rows, t: 0 };
      this.lines += n;
      if (this.mode === 'marathon') {
        const newLevel = Math.max(this.startLevel, Math.floor(this.lines / 10) + 1);
        if (newLevel > this.level) {
          this.level = newLevel;
          this.emit('levelup', { level: newLevel });
        }
      }
      if (this.modeInfo.goalLines && this.lines >= this.modeInfo.goalLines) {
        this.finish();
      }
    } else {
      this.spawn();
    }
  }

  finishClear() {
    const rows = new Set(this.clearing.rows);
    const kept = this.board.filter((_, y) => !rows.has(y));
    while (kept.length < ROWS) kept.unshift(Array(COLS).fill(null));
    this.board = kept;
    this.clearing = null;
  }

  finish() {
    this.over = true;
    this.won = true;
    this.emit('finish', {});
  }

  gameOver(reason) {
    this.over = true;
    this.emit('gameover', { reason });
  }

  /** Lines until the next level (marathon) or until the goal. */
  progress() {
    if (this.mode === 'marathon') return { value: this.lines % 10, max: 10 };
    if (this.mode === 'sprint') return { value: this.lines, max: 40 };
    return { value: this.time, max: this.modeInfo.timeLimit };
  }

  /** Highest occupied visible row, counted from the bottom (0 = empty board). */
  stackHeight() {
    for (let y = HIDDEN; y < ROWS; y++) {
      if (this.board[y].some(c => c !== null)) return ROWS - y;
    }
    return 0;
  }

  update(dt, softDrop, sdf) {
    if (this.over) {
      // let the final line clear (e.g. the 40th sprint line) finish its animation
      if (this.clearing && (this.clearing.t += dt) >= CLEAR_DELAY) this.finishClear();
      return;
    }
    this.time += dt;

    if (this.modeInfo.timeLimit && this.time >= this.modeInfo.timeLimit) {
      this.time = this.modeInfo.timeLimit;
      this.finish();
      return;
    }

    if (this.clearing) {
      this.clearing.t += dt;
      if (this.clearing.t >= CLEAR_DELAY) {
        this.finishClear();
        if (!this.over) this.spawn();
      }
      return;
    }
    if (!this.piece) return;

    let interval = gravityMs(this.level);
    if (softDrop) interval = sdf >= 41 ? 0 : interval / sdf;

    if (!this.grounded()) {
      if (interval === 0) {
        while (this.stepDown(true)) { /* instant soft drop */ }
      } else {
        this.gravityAcc += dt;
        while (this.gravityAcc >= interval) {
          this.gravityAcc -= interval;
          if (!this.stepDown(softDrop)) break;
          if (softDrop) this.emit('softdrop', {});
        }
      }
    }

    const grounded = this.grounded();
    if (grounded && !this.landed) this.emit('land', { cells: this.cells(), type: this.piece.type });
    this.landed = grounded;
    if (grounded) {
      this.gravityAcc = 0;
      this.lockTimer += dt;
      if (this.lockTimer >= LOCK_DELAY || this.lockResets >= MAX_LOCK_RESETS) {
        this.lock();
      }
    } else {
      this.lockTimer = 0;
    }
  }
}
