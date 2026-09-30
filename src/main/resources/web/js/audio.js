'use strict';
/* Synthesized sound effects and chiptune music (Korobeiniki, public domain) via Web Audio. */

const NOTE_INDEX = { C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5, 'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11 };

function midi(name) {
  const m = /^([A-G]#?)(-?\d)$/.exec(name);
  return NOTE_INDEX[m[1]] + (parseInt(m[2], 10) + 1) * 12;
}
const freq = n => 440 * Math.pow(2, (n - 69) / 12);

// Melody as [note, beats]; null = rest
const SONG_A = [
  ['E5', 1], ['B4', .5], ['C5', .5], ['D5', 1], ['C5', .5], ['B4', .5],
  ['A4', 1], ['A4', .5], ['C5', .5], ['E5', 1], ['D5', .5], ['C5', .5],
  ['B4', 1.5], ['C5', .5], ['D5', 1], ['E5', 1],
  ['C5', 1], ['A4', 1], ['A4', 2],
  [null, .5], ['D5', 1], ['F5', .5], ['A5', 1], ['G5', .5], ['F5', .5],
  ['E5', 1.5], ['C5', .5], ['E5', 1], ['D5', .5], ['C5', .5],
  ['B4', 1], ['B4', .5], ['C5', .5], ['D5', 1], ['E5', 1],
  ['C5', 1], ['A4', 1], ['A4', 1], [null, 1],
];
const SONG_B = [
  ['E5', 2], ['C5', 2], ['D5', 2], ['B4', 2], ['C5', 2], ['A4', 2], ['G#4', 2], ['B4', 2],
  ['E5', 2], ['C5', 2], ['D5', 2], ['B4', 2], ['C5', 1], ['E5', 1], ['A5', 2], ['G#5', 4],
];
const BASS_A = ['E2', 'A2', 'E2', 'A2', 'D2', 'C2', 'E2', 'A2'];
const BASS_B = ['A2', 'E2', 'A2', 'E2', 'A2', 'E2', 'A2', 'E2'];

function buildSong() {
  // Returns an array of eighth-note slots, each holding a list of events
  const sections = [[SONG_A, BASS_A], [SONG_A, BASS_A], [SONG_B, BASS_B]];
  const slots = [];
  let offset = 0;
  for (const [melody, bass] of sections) {
    const len = bass.length * 8;
    for (let i = 0; i < len; i++) slots.push([]);
    let beat = 0;
    for (const [note, dur] of melody) {
      if (note) slots[offset + beat * 2].push({ v: 'lead', n: midi(note), d: dur });
      beat += dur;
    }
    bass.forEach((root, bar) => {
      for (let e = 0; e < 8; e++) {
        const n = midi(root) + (e % 2 ? 12 : 0);
        slots[offset + bar * 8 + e].push({ v: 'bass', n, d: .5 });
        if (e % 4 === 0) slots[offset + bar * 8 + e].push({ v: 'kick' });
        if (e % 2 === 1) slots[offset + bar * 8 + e].push({ v: 'hat' });
        if (e === 4) slots[offset + bar * 8 + e].push({ v: 'snare' });
      }
    });
    offset += len;
  }
  return slots;
}

class Sound {
  constructor() {
    this.ctx = null;
    this.musicVolume = 0.5;
    this.sfxVolume = 0.7;
    this.song = buildSong();
    this.playing = false;
    this.tempo = 1;
    this.lastPlayed = {};
    this.retro = false;
    this.pan = 0;
  }

  /** Game Boy mode: pulse/wave/noise channels instead of the modern synth. */
  setRetro(on) {
    this.retro = !!on;
  }

  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    const ctx = this.ctx;

    this.master = ctx.createDynamicsCompressor();
    this.master.threshold.value = -12;
    this.master.ratio.value = 4;
    this.master.connect(ctx.destination);

    this.sfxGain = ctx.createGain();
    this.sfxGain.connect(this.master);

    this.musicFilter = ctx.createBiquadFilter();
    this.musicFilter.type = 'lowpass';
    this.musicFilter.frequency.value = 18000;
    this.musicGain = ctx.createGain();
    this.musicFilter.connect(this.musicGain);
    this.musicGain.connect(this.master);
    this.setVolumes(this.musicVolume, this.sfxVolume);

    const len = ctx.sampleRate;
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

    // Game Boy style noise: 15-bit LFSR, sample-and-hold like the DMG noise channel
    this.lfsrBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const ld = this.lfsrBuf.getChannelData(0);
    let lfsr = 0x7fff, out = 1;
    for (let i = 0; i < len; i++) {
      if (i % 6 === 0) {
        const bit = (lfsr ^ (lfsr >> 1)) & 1;
        lfsr = (lfsr >> 1) | (bit << 14);
        out = lfsr & 1 ? -1 : 1;
      }
      ld[i] = out;
    }

    // DMG pulse channels (12.5 / 25 / 50 % duty) and a 4-bit stepped triangle for the wave channel
    const pulse = duty => {
      const n = 64, re = new Float32Array(n), im = new Float32Array(n);
      for (let k = 1; k < n; k++) {
        re[k] = Math.sin(2 * Math.PI * k * duty) / (k * Math.PI);
        im[k] = (1 - Math.cos(2 * Math.PI * k * duty)) / (k * Math.PI);
      }
      return ctx.createPeriodicWave(re, im);
    };
    this.waves = { p12: pulse(0.125), p25: pulse(0.25), p50: pulse(0.5) };
    const steps = 32, n = 64, re = new Float32Array(n), im = new Float32Array(n);
    const sample = i => Math.round((1 - Math.abs((i / steps) * 2 - 1)) * 15) / 7.5 - 1;
    for (let k = 1; k < n; k++) {
      for (let i = 0; i < steps; i++) {
        const ph = 2 * Math.PI * k * i / steps;
        re[k] += sample(i) * Math.cos(ph) * 2 / steps;
        im[k] += sample(i) * Math.sin(ph) * 2 / steps;
      }
    }
    this.waves.wave = ctx.createPeriodicWave(re, im);
  }

  setVolumes(music, sfx) {
    this.musicVolume = music;
    this.sfxVolume = sfx;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.musicGain.gain.setTargetAtTime(music * 0.5, t, 0.05);
    this.sfxGain.gain.setTargetAtTime(sfx, t, 0.05);
  }

  // ---------- primitives ----------
  tone({ f, type = 'square', dur = 0.1, vol = 0.2, attack = 0.005, slide = null, at = 0, dest = null, detune = 0 }) {
    const ctx = this.ctx;
    const t = ctx.currentTime + at;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    if (this.waves && this.waves[type]) o.setPeriodicWave(this.waves[type]);
    else o.type = type;
    o.frequency.setValueAtTime(f, t);
    o.detune.value = detune;
    if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(dest || this.panned());
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  noise({ dur = 0.1, vol = 0.2, filter = 'lowpass', f = 2000, fEnd = null, at = 0, dest = null, q = 1 }) {
    const ctx = this.ctx;
    const t = ctx.currentTime + at;
    const src = ctx.createBufferSource();
    src.buffer = this.retro ? this.lfsrBuf : this.noiseBuf;
    const bf = ctx.createBiquadFilter();
    bf.type = filter;
    bf.Q.value = q;
    bf.frequency.setValueAtTime(f, t);
    if (fEnd) bf.frequency.exponentialRampToValueAtTime(fEnd, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(bf);
    bf.connect(g);
    g.connect(dest || this.panned());
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.02);
  }

  /** SFX output, panned by where on the board the sound comes from (set per play() call). */
  panned() {
    if (!this.pan || !this.ctx.createStereoPanner) return this.sfxGain;
    const p = this.ctx.createStereoPanner();
    p.pan.value = this.pan;
    p.connect(this.sfxGain);
    return p;
  }

  throttle(name, ms) {
    const now = performance.now();
    if (this.lastPlayed[name] && now - this.lastPlayed[name] < ms) return false;
    this.lastPlayed[name] = now;
    return true;
  }

  // ---------- sound effects ----------
  play(name, opt = {}) {
    if (!this.ctx || this.sfxVolume <= 0) return;
    this.pan = Math.max(-1, Math.min(1, opt.pan || 0));
    try {
      if (this.retro) this.playRetro(name, opt);
      else this.playModern(name, opt);
    } finally {
      this.pan = 0;
    }
  }

  playModern(name, opt) {
    const jitter = 1 + (Math.random() - 0.5) * 0.04;
    // column 0..9 -> slight pitch rise from left to right so moves are "readable" by ear
    const col = opt.col === undefined ? 4.5 : opt.col;
    switch (name) {
      case 'move':
        if (!this.throttle('move', 25)) return;
        this.tone({ f: (820 + col * 40) * jitter, type: 'square', dur: 0.022, vol: 0.06, attack: 0.001 });
        this.noise({ dur: 0.012, vol: 0.05, filter: 'highpass', f: 6000 });
        break;
      case 'wall':
        if (!this.throttle('wall', 60)) return;
        this.tone({ f: 130, slide: 90, type: 'triangle', dur: 0.06, vol: 0.3 });
        this.noise({ dur: 0.03, vol: 0.1, filter: 'bandpass', f: 900, q: 2 });
        break;
      case 'land':
        this.tone({ f: 160, slide: 80, type: 'sine', dur: 0.08, vol: 0.35 });
        this.noise({ dur: 0.035, vol: 0.08, filter: 'lowpass', f: 1500 });
        break;
      case 'medal':
        [0, 7, 12, 16, 19, 24].forEach((s, i) => this.tone({ f: freq(76 + s), type: 'triangle', dur: 0.35, vol: 0.12, at: i * 0.06 }));
        [0, 12].forEach(s => this.tone({ f: freq(88 + s), type: 'sine', dur: 0.9, vol: 0.06, at: 0.36 }));
        this.noise({ dur: 0.6, vol: 0.05, filter: 'highpass', f: 8000, at: 0.3 });
        break;
      case 'rotate':
        this.tone({ f: 620 * jitter, slide: 980, type: 'triangle', dur: 0.07, vol: 0.18 });
        this.tone({ f: 1240 * jitter, type: 'square', dur: 0.03, vol: 0.03 });
        break;
      case 'rotateFail':
        this.tone({ f: 180, type: 'square', dur: 0.05, vol: 0.05 });
        break;
      case 'softdrop':
        if (!this.throttle('softdrop', 30)) return;
        this.tone({ f: 330 * jitter, type: 'triangle', dur: 0.025, vol: 0.06 });
        break;
      case 'harddrop': {
        const power = Math.min(1, 0.55 + (opt.dist || 0) / 30);
        this.tone({ f: 190, slide: 38, type: 'sine', dur: 0.22, vol: 0.75 * power });
        this.noise({ dur: 0.14, vol: 0.35 * power, f: 1800, fEnd: 200 });
        this.noise({ dur: 0.03, vol: 0.2, filter: 'highpass', f: 5000 });
        break;
      }
      case 'lock':
        this.tone({ f: 240, slide: 140, type: 'square', dur: 0.06, vol: 0.07 });
        this.noise({ dur: 0.04, vol: 0.08, filter: 'bandpass', f: 1200, q: 3 });
        break;
      case 'hold':
        this.tone({ f: 523, type: 'triangle', dur: 0.08, vol: 0.18 });
        this.tone({ f: 784, type: 'triangle', dur: 0.1, vol: 0.18, at: 0.06 });
        break;
      case 'clear': this.playClear(opt); break;
      case 'tspinNoLines':
        this.tone({ f: 300, slide: 1400, type: 'sawtooth', dur: 0.18, vol: 0.08 });
        this.tone({ f: 1400, type: 'triangle', dur: 0.12, vol: 0.12, at: 0.15 });
        break;
      case 'levelup': {
        const notes = [0, 4, 7, 12, 16];
        notes.forEach((s, i) => this.tone({ f: freq(72 + s), type: 'square', dur: 0.12, vol: 0.12, at: i * 0.07 }));
        [0, 4, 7, 12].forEach(s => this.tone({ f: freq(72 + s), type: 'triangle', dur: 0.7, vol: 0.12, at: 0.38 }));
        this.noise({ dur: 0.9, vol: 0.06, filter: 'highpass', f: 6000, at: 0.35 });
        break;
      }
      case 'gameover':
        [0, -3, -6, -9, -12, -15].forEach((s, i) =>
          this.tone({ f: freq(64 + s), type: 'square', dur: 0.22, vol: 0.12, at: i * 0.14 }));
        this.tone({ f: 90, slide: 30, type: 'sine', dur: 1.2, vol: 0.5, at: 0.8 });
        break;
      case 'win':
        [[0, 0], [4, .1], [7, .2], [12, .3], [7, .45], [12, .55], [16, .65], [19, .75], [24, .9]].forEach(([s, at]) =>
          this.tone({ f: freq(72 + s), type: 'square', dur: 0.16, vol: 0.11, at }));
        [0, 4, 7, 12, 24].forEach(s => this.tone({ f: freq(60 + s), type: 'triangle', dur: 1.4, vol: 0.12, at: 1.0 }));
        break;
      case 'countdown':
        this.tone({ f: 660, type: 'square', dur: 0.12, vol: 0.12 });
        break;
      case 'go':
        this.tone({ f: 1320, type: 'square', dur: 0.35, vol: 0.12 });
        this.tone({ f: 660, type: 'triangle', dur: 0.4, vol: 0.2 });
        break;
      case 'menuMove':
        this.tone({ f: 880, type: 'triangle', dur: 0.04, vol: 0.1 });
        break;
      case 'menuSelect':
        this.tone({ f: 660, type: 'square', dur: 0.06, vol: 0.08 });
        this.tone({ f: 990, type: 'square', dur: 0.1, vol: 0.08, at: 0.05 });
        break;
      case 'pause':
        this.tone({ f: 700, slide: 350, type: 'triangle', dur: 0.15, vol: 0.15 });
        break;
      case 'unpause':
        this.tone({ f: 350, slide: 700, type: 'triangle', dur: 0.15, vol: 0.15 });
        break;
      case 'danger':
        this.tone({ f: 70, type: 'sine', dur: 0.12, vol: 0.4 });
        this.tone({ f: 60, type: 'sine', dur: 0.14, vol: 0.3, at: 0.16 });
        break;
      default:
        break;
    }
  }

  playClear({ n = 1, tspin = null, b2b = false, combo = 0, perfect = false }) {
    const shift = Math.min(Math.max(combo, 0), 12); // rising pitch with combo
    const root = 67 + shift;
    const arps = {
      1: [0, 7],
      2: [0, 4, 7],
      3: [0, 4, 7, 12],
      4: [0, 4, 7, 12, 16, 19, 24],
    };
    const arp = arps[n] || arps[1];
    const step = n === 4 ? 0.045 : 0.055;
    arp.forEach((s, i) => {
      this.tone({ f: freq(root + s), type: 'square', dur: 0.14, vol: 0.1, at: i * step });
      this.tone({ f: freq(root + s + 12), type: 'triangle', dur: 0.12, vol: 0.06, at: i * step, detune: 6 });
    });
    this.noise({ dur: 0.25 + n * 0.08, vol: 0.12 + n * 0.03, filter: 'bandpass', f: 800, fEnd: 8000, q: 0.8 });
    if (n === 4 || tspin) {
      // big "whoosh" and bass hit for tetrises and t-spins
      this.tone({ f: 120, slide: 40, type: 'sine', dur: 0.4, vol: 0.5 });
      this.tone({ f: 220, slide: 1760, type: 'sawtooth', dur: 0.3, vol: 0.05 });
      [0, 4, 7, 12].forEach(s => this.tone({ f: freq(root + s), type: 'sawtooth', dur: 0.5, vol: 0.035, at: arp.length * step, detune: -8 }));
    }
    if (b2b) {
      [24, 28, 31, 36].forEach((s, i) => this.tone({ f: freq(root + s), type: 'triangle', dur: 0.1, vol: 0.07, at: 0.25 + i * 0.04 }));
    }
    if (perfect) {
      [0, 4, 7, 11, 14, 19, 24].forEach((s, i) => this.tone({ f: freq(60 + s), type: 'square', dur: 0.8, vol: 0.06, at: 0.3 + i * 0.06 }));
    }
  }

  /** Handheld-style effects: short pulse blips, noise thuds, no reverb or sweeps beyond what a DMG could do. */
  playRetro(name, opt) {
    const p = (f, dur, vol = 0.1, type = 'p50', at = 0, slide = null) =>
      this.tone({ f, type, dur, vol, at, slide, attack: 0.002 });
    const nz = (dur, vol, at = 0, f = 6000) => this.noise({ dur, vol, filter: 'lowpass', f, at });
    switch (name) {
      case 'move':
        if (!this.throttle('move', 25)) return;
        p(1046, 0.025, 0.06, 'p25');
        break;
      case 'wall':
        if (!this.throttle('wall', 60)) return;
        p(131, 0.04, 0.09, 'p12');
        break;
      case 'land':
        nz(0.03, 0.14, 0, 1200);
        break;
      case 'medal':
        [0, 4, 7, 12, 16, 19, 24].forEach((s, i) => p(freq(79 + s), 0.08, 0.08, i % 2 ? 'p25' : 'p50', i * 0.06));
        p(freq(103), 0.4, 0.07, 'p50', 0.45);
        break;
      case 'rotate':
        p(1568, 0.025, 0.07, 'p50');
        p(2093, 0.03, 0.06, 'p50', 0.025);
        break;
      case 'rotateFail':
        p(262, 0.04, 0.05, 'p25');
        break;
      case 'softdrop':
        if (!this.throttle('softdrop', 30)) return;
        nz(0.015, 0.04, 0, 3000);
        break;
      case 'harddrop':
        nz(0.09, 0.3, 0, 2500);
        p(196, 0.07, 0.08, 'p25', 0, 98);
        break;
      case 'lock':
        nz(0.05, 0.2, 0, 1800);
        break;
      case 'hold':
        p(784, 0.05, 0.08, 'p50');
        p(1046, 0.06, 0.08, 'p50', 0.05);
        break;
      case 'clear': {
        const { n = 1, perfect = false } = opt;
        if (n === 4) {
          // the classic "tetris" fanfare: rapid rising pulse arpeggio plus crash
          [0, 4, 7, 12, 16, 19, 24, 28].forEach((s, i) => p(freq(72 + s), 0.07, 0.09, 'p25', i * 0.045));
          nz(0.45, 0.22, 0, 7000);
        } else {
          // line clear: descending noise sweep with a pulse blip per line
          this.noise({ dur: 0.3, vol: 0.2, filter: 'lowpass', f: 8000, fEnd: 400 });
          for (let i = 0; i < n; i++) p(freq(76 + i * 3), 0.06, 0.07, 'p50', i * 0.06);
        }
        if (perfect) [0, 4, 7, 12].forEach((s, i) => p(freq(84 + s), 0.12, 0.08, 'p50', 0.4 + i * 0.1));
        break;
      }
      case 'tspinNoLines':
        p(523, 0.06, 0.08, 'p25', 0, 1046);
        break;
      case 'levelup':
        [0, 4, 7, 12, 7, 12, 16, 24].forEach((s, i) => p(freq(72 + s), 0.06, 0.08, 'p50', i * 0.055));
        break;
      case 'gameover':
        // falling blocks rumble, then a slow descending pulse line
        nz(1.0, 0.18, 0, 1200);
        [0, -2, -4, -5, -7, -9, -12].forEach((s, i) => p(freq(69 + s), 0.18, 0.09, 'p50', 0.9 + i * 0.16));
        break;
      case 'win':
        [0, 4, 7, 12, 16, 12, 16, 19, 24].forEach((s, i) => p(freq(72 + s), 0.12, 0.09, 'p50', i * 0.1));
        p(freq(48), 1.0, 0.12, 'wave', 0.9);
        break;
      case 'countdown':
        p(1046, 0.08, 0.08, 'p50');
        break;
      case 'go':
        p(2093, 0.25, 0.08, 'p50');
        break;
      case 'menuMove':
        p(1318, 0.03, 0.06, 'p50');
        break;
      case 'menuSelect':
        p(1046, 0.04, 0.07, 'p50');
        p(1568, 0.06, 0.07, 'p50', 0.04);
        break;
      case 'pause':
        p(1568, 0.05, 0.07, 'p50');
        p(1046, 0.08, 0.07, 'p50', 0.06);
        break;
      case 'unpause':
        p(1046, 0.05, 0.07, 'p50');
        p(1568, 0.08, 0.07, 'p50', 0.06);
        break;
      case 'danger':
        p(147, 0.08, 0.1, 'p12');
        break;
      default:
        break;
    }
  }

  // ---------- music ----------
  startMusic() {
    if (!this.ctx || this.playing) return;
    this.playing = true;
    this.slot = 0;
    this.nextTime = this.ctx.currentTime + 0.1;
    this.muffle(false);
    this.timer = setInterval(() => this.schedule(), 25);
  }

  stopMusic() {
    this.playing = false;
    clearInterval(this.timer);
  }

  muffle(on) {
    if (!this.ctx) return;
    this.musicFilter.frequency.setTargetAtTime(on ? 500 : 18000, this.ctx.currentTime, 0.08);
  }

  setTempo(mult) {
    this.tempo = mult;
  }

  schedule() {
    const ctx = this.ctx;
    const eighth = 60 / ((this.retro ? 150 : 144) * this.tempo) / 2;
    while (this.nextTime < ctx.currentTime + 0.12) {
      for (const ev of this.song[this.slot]) this.playMusicEvent(ev, this.nextTime, eighth);
      this.slot = (this.slot + 1) % this.song.length;
      this.nextTime += eighth;
    }
  }

  playMusicEvent(ev, t, eighth) {
    const ctx = this.ctx;
    const dest = this.musicFilter;
    const at = t - ctx.currentTime;
    if (this.retro) {
      // Type-A arrangement: pulse lead, quieter pulse echo an octave down, wave-channel bass, no drum kit
      if (ev.v === 'lead') {
        const dur = ev.d * eighth * 2 * 0.85;
        this.tone({ f: freq(ev.n), type: 'p25', dur, vol: 0.1, attack: 0.003, at, dest });
        this.tone({ f: freq(ev.n - 12), type: 'p12', dur, vol: 0.04, attack: 0.003, at, dest });
      } else if (ev.v === 'bass') {
        this.tone({ f: freq(ev.n), type: 'wave', dur: eighth * 0.8, vol: 0.22, attack: 0.003, at, dest });
      } else if (ev.v === 'snare') {
        this.noise({ dur: 0.04, vol: 0.06, filter: 'lowpass', f: 7000, at, dest });
      }
      return;
    }
    switch (ev.v) {
      case 'lead': {
        const dur = ev.d * eighth * 2 * 0.92;
        this.tone({ f: freq(ev.n), type: 'square', dur, vol: 0.09, attack: 0.01, at, dest });
        this.tone({ f: freq(ev.n), type: 'square', dur, vol: 0.035, attack: 0.01, at, dest, detune: 12 });
        break;
      }
      case 'bass':
        this.tone({ f: freq(ev.n), type: 'triangle', dur: eighth * 0.9, vol: 0.28, attack: 0.005, at, dest });
        break;
      case 'kick':
        this.tone({ f: 150, slide: 45, type: 'sine', dur: 0.12, vol: 0.35, at, dest });
        break;
      case 'snare':
        this.noise({ dur: 0.1, vol: 0.12, filter: 'highpass', f: 1800, at, dest });
        break;
      case 'hat':
        this.noise({ dur: 0.03, vol: 0.05, filter: 'highpass', f: 8000, at, dest });
        break;
      default:
        break;
    }
  }
}

const sound = new Sound();
