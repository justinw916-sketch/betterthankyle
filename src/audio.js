// Fully procedural audio: sound effects are synthesised once into AudioBuffers
// with OfflineAudioContext, then played back positionally. Music is a live
// generative sequencer (calm ambient + combat metal layer in a Hijaz scale).

const SR = 44100;

function noiseBuffer(ctx, dur) {
  const b = ctx.createBuffer(1, Math.ceil(dur * ctx.sampleRate), ctx.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return b;
}

function distCurve(k) {
  const n = 1024, c = new Float32Array(n);
  for (let i = 0; i < n; i++) { const x = (i / n) * 2 - 1; c[i] = ((1 + k) * x) / (1 + k * Math.abs(x)); }
  return c;
}

// --- Synthesis building blocks (all operate on an arbitrary BaseAudioContext) ---
function env(ctx, node, t, a, peak, d, sustain = 0.0001) {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + a);
  g.gain.exponentialRampToValueAtTime(Math.max(sustain, 0.0001), t + a + d);
  node.connect(g);
  return g;
}

function noiseSrc(ctx, dur) {
  const s = ctx.createBufferSource();
  s.buffer = noiseBuffer(ctx, dur);
  return s;
}

function filt(ctx, type, f, q = 1) {
  const b = ctx.createBiquadFilter();
  b.type = type; b.frequency.value = f; b.Q.value = q;
  return b;
}

function osc(ctx, type, f) {
  const o = ctx.createOscillator();
  o.type = type; o.frequency.value = f;
  return o;
}

// Gunshot: noise crack + low body thump.
function gunshot(ctx, out, { crack = 3000, body = 90, len = 0.3, bodyLen = 0.2, vol = 1, tail = 1500 }) {
  const t = 0;
  const n = noiseSrc(ctx, len + 0.1);
  const f = filt(ctx, 'lowpass', crack, 0.7);
  f.frequency.setValueAtTime(crack, t);
  f.frequency.exponentialRampToValueAtTime(Math.max(tail * 0.3, 200), t + len);
  n.connect(f);
  env(ctx, f, t, 0.002, vol, len).connect(out);
  const o = osc(ctx, 'sine', body * 2);
  o.frequency.exponentialRampToValueAtTime(body * 0.5, t + bodyLen);
  env(ctx, o, t, 0.002, vol * 0.9, bodyLen).connect(out);
  n.start(t); o.start(t); o.stop(t + bodyLen + 0.05);
}

function explosion(ctx, out, { size = 1 }) {
  const len = 1.6 * size;
  const n = noiseSrc(ctx, len);
  const f = filt(ctx, 'lowpass', 2400, 0.5);
  f.frequency.setValueAtTime(3000, 0);
  f.frequency.exponentialRampToValueAtTime(80, len);
  const ws = ctx.createWaveShaper(); ws.curve = distCurve(8);
  n.connect(ws); ws.connect(f);
  env(ctx, f, 0, 0.005, 1.0, len).connect(out);
  const o = osc(ctx, 'sine', 120);
  o.frequency.exponentialRampToValueAtTime(28, 0.9 * size);
  env(ctx, o, 0, 0.005, 1.2, 0.9 * size).connect(out);
  // crackle
  const n2 = noiseSrc(ctx, len);
  const hp = filt(ctx, 'bandpass', 900, 2);
  n2.connect(hp);
  env(ctx, hp, 0.05, 0.02, 0.35, len * 0.6).connect(out);
  n.start(0); o.start(0); n2.start(0.05); o.stop(len);
}

// Vowel-formant scream: the iconic headless kamikaze "AAAAAAAH".
function scream(ctx, out, { f0 = 330, len = 1.6 }) {
  const src = osc(ctx, 'sawtooth', f0);
  const vib = osc(ctx, 'sine', 6.5);
  const vg = ctx.createGain(); vg.gain.value = f0 * 0.04;
  vib.connect(vg); vg.connect(src.frequency);
  src.frequency.setValueAtTime(f0 * 0.9, 0);
  src.frequency.linearRampToValueAtTime(f0 * 1.08, 0.25);
  src.frequency.linearRampToValueAtTime(f0 * 0.95, len);
  const ws = ctx.createWaveShaper(); ws.curve = distCurve(3);
  src.connect(ws);
  const mix = ctx.createGain(); mix.gain.value = 1;
  for (const [fr, q, g] of [[850, 8, 1], [1250, 9, 0.7], [2700, 10, 0.4], [3400, 12, 0.2]]) {
    const b = filt(ctx, 'bandpass', fr, q);
    const bg = ctx.createGain(); bg.gain.value = g * 3;
    ws.connect(b); b.connect(bg); bg.connect(mix);
  }
  const n = noiseSrc(ctx, len);
  const nb = filt(ctx, 'bandpass', 1500, 1);
  const ng = ctx.createGain(); ng.gain.value = 0.25;
  n.connect(nb); nb.connect(ng); ng.connect(mix);
  const e = ctx.createGain();
  e.gain.setValueAtTime(0.0001, 0);
  e.gain.exponentialRampToValueAtTime(0.9, 0.08);
  e.gain.setValueAtTime(0.9, len - 0.3);
  e.gain.exponentialRampToValueAtTime(0.0001, len);
  mix.connect(e); e.connect(out);
  src.start(0); vib.start(0); n.start(0);
  src.stop(len); vib.stop(len);
}

function roar(ctx, out, { f0 = 90, len = 1.2, formant = 500, vol = 1 }) {
  const src = osc(ctx, 'sawtooth', f0);
  src.frequency.setValueAtTime(f0 * 1.3, 0);
  src.frequency.exponentialRampToValueAtTime(f0 * 0.7, len);
  const lfo = osc(ctx, 'sine', 23);
  const lg = ctx.createGain(); lg.gain.value = f0 * 0.2;
  lfo.connect(lg); lg.connect(src.frequency);
  const ws = ctx.createWaveShaper(); ws.curve = distCurve(12);
  src.connect(ws);
  const b1 = filt(ctx, 'bandpass', formant, 3), b2 = filt(ctx, 'bandpass', formant * 2.2, 4);
  ws.connect(b1); ws.connect(b2);
  const m = ctx.createGain(); b1.connect(m); b2.connect(m);
  const n = noiseSrc(ctx, len); const nf = filt(ctx, 'lowpass', 800);
  n.connect(nf); nf.connect(m);
  const e = ctx.createGain();
  e.gain.setValueAtTime(0.0001, 0);
  e.gain.exponentialRampToValueAtTime(vol, 0.1);
  e.gain.exponentialRampToValueAtTime(0.0001, len);
  m.connect(e); e.connect(out);
  src.start(0); lfo.start(0); n.start(0); src.stop(len); lfo.stop(len);
}

function zap(ctx, out, { f1 = 2400, f2 = 300, len = 0.18, type = 'sawtooth', vol = 0.5 }) {
  const o = osc(ctx, type, f1);
  o.frequency.exponentialRampToValueAtTime(f2, len);
  const o2 = osc(ctx, 'square', f1 * 1.01);
  o2.frequency.exponentialRampToValueAtTime(f2 * 1.5, len);
  const f = filt(ctx, 'lowpass', 6000);
  o.connect(f); o2.connect(f);
  env(ctx, f, 0, 0.003, vol, len).connect(out);
  o.start(0); o2.start(0); o.stop(len + 0.02); o2.stop(len + 0.02);
}

function blip(ctx, out, notes, { type = 'square', step = 0.07, vol = 0.25, dur = 0.12 }) {
  notes.forEach((f, i) => {
    const o = osc(ctx, type, f);
    const lp = filt(ctx, 'lowpass', 5000);
    o.connect(lp);
    env(ctx, lp, i * step, 0.005, vol, dur).connect(out);
    o.start(i * step); o.stop(i * step + dur + 0.05);
  });
}

function whoosh(ctx, out, { len = 0.6, f1 = 400, f2 = 3000, vol = 0.6 }) {
  const n = noiseSrc(ctx, len);
  const b = filt(ctx, 'bandpass', f1, 2);
  b.frequency.exponentialRampToValueAtTime(f2, len * 0.3);
  b.frequency.exponentialRampToValueAtTime(f1, len);
  n.connect(b);
  env(ctx, b, 0, 0.02, vol, len).connect(out);
  n.start(0);
}

function thud(ctx, out, { f = 60, len = 0.25, vol = 0.8, noise = 0.3 }) {
  const o = osc(ctx, 'sine', f * 2);
  o.frequency.exponentialRampToValueAtTime(f * 0.6, len);
  env(ctx, o, 0, 0.003, vol, len).connect(out);
  const n = noiseSrc(ctx, len); const lp = filt(ctx, 'lowpass', 600);
  n.connect(lp); env(ctx, lp, 0, 0.002, noise, len * 0.6).connect(out);
  o.start(0); n.start(0); o.stop(len + 0.05);
}

function grunt(ctx, out, { f0 = 140, len = 0.35, formant = 600, vol = 0.7 }) {
  const o = osc(ctx, 'sawtooth', f0);
  o.frequency.exponentialRampToValueAtTime(f0 * 0.6, len);
  const b = filt(ctx, 'bandpass', formant, 4), b2 = filt(ctx, 'bandpass', formant * 1.8, 5);
  o.connect(b); o.connect(b2);
  const m = ctx.createGain(); b.connect(m); b2.connect(m);
  env(ctx, m, 0, 0.01, vol * 2, len).connect(out);
  o.start(0); o.stop(len + 0.05);
}

function clack(ctx, out, { vol = 0.5 }) {
  for (let i = 0; i < 3; i++) {
    const n = noiseSrc(ctx, 0.05);
    const b = filt(ctx, 'bandpass', 2500 + i * 700, 8);
    n.connect(b); env(ctx, b, i * 0.045, 0.001, vol, 0.04).connect(out);
    n.start(i * 0.045);
  }
}

function rumble(ctx, out, { len = 2.5 }) {
  const n = noiseSrc(ctx, len);
  const lp = filt(ctx, 'lowpass', 180, 1);
  n.connect(lp);
  const e = ctx.createGain();
  e.gain.setValueAtTime(0.0001, 0);
  e.gain.exponentialRampToValueAtTime(1.2, 0.3);
  e.gain.setValueAtTime(1.2, len - 0.5);
  e.gain.exponentialRampToValueAtTime(0.0001, len);
  lp.connect(e); e.connect(out);
  const o = osc(ctx, 'triangle', 42); const og = ctx.createGain(); og.gain.value = 0.3;
  o.connect(og); og.connect(e);
  n.start(0); o.start(0); o.stop(len);
}

// Definitions: name -> [duration, fn(ctx,out)]
const DEFS = {
  revolver: [0.5, (c, o) => gunshot(c, o, { crack: 5000, body: 110, len: 0.35, vol: 0.9 })],
  shotgun: [0.8, (c, o) => gunshot(c, o, { crack: 3500, body: 70, len: 0.6, bodyLen: 0.35, vol: 1.2 })],
  dshotgun: [1.0, (c, o) => { gunshot(c, o, { crack: 3000, body: 55, len: 0.8, bodyLen: 0.45, vol: 1.4 }); }],
  tommy: [0.25, (c, o) => gunshot(c, o, { crack: 4500, body: 140, len: 0.18, bodyLen: 0.1, vol: 0.7 })],
  minigun: [0.18, (c, o) => gunshot(c, o, { crack: 6000, body: 160, len: 0.13, bodyLen: 0.07, vol: 0.55 })],
  rocket: [0.9, (c, o) => { whoosh(c, o, { len: 0.8, f1: 300, f2: 2500, vol: 0.9 }); thud(c, o, { f: 70, len: 0.2, vol: 0.6 }); }],
  grenade: [0.4, (c, o) => { thud(c, o, { f: 90, len: 0.25, vol: 0.9, noise: 0.5 }); }],
  laser: [0.25, (c, o) => zap(c, o, { f1: 1800, f2: 400, len: 0.15, vol: 0.35 })],
  cannon: [1.6, (c, o) => { gunshot(c, o, { crack: 1500, body: 40, len: 1.3, bodyLen: 0.8, vol: 1.6 }); }],
  knife: [0.3, (c, o) => whoosh(c, o, { len: 0.22, f1: 1200, f2: 5000, vol: 0.5 })],
  knifehit: [0.3, (c, o) => { thud(c, o, { f: 120, len: 0.15, vol: 0.6, noise: 0.8 }); }],
  explosion: [2.0, (c, o) => explosion(c, o, { size: 1 })],
  bigexplosion: [3.0, (c, o) => explosion(c, o, { size: 1.8 })],
  empty: [0.1, (c, o) => blip(c, o, [1800], { type: 'square', vol: 0.15, dur: 0.02 })],
  switch: [0.3, (c, o) => { clack(c, o, { vol: 0.3 }); }],
  pickup: [0.4, (c, o) => blip(c, o, [880, 1320], { type: 'square', vol: 0.15, step: 0.06 })],
  health: [0.5, (c, o) => blip(c, o, [523, 659, 784, 1046], { type: 'triangle', vol: 0.3, step: 0.05 })],
  armor: [0.5, (c, o) => blip(c, o, [392, 523, 784], { type: 'sawtooth', vol: 0.18, step: 0.06 })],
  weapon: [0.9, (c, o) => { clack(c, o, { vol: 0.5 }); blip(c, o, [294, 440, 587, 880], { type: 'sawtooth', vol: 0.15, step: 0.08, dur: 0.3 }); }],
  powerup: [1.5, (c, o) => blip(c, o, [220, 330, 440, 660, 880, 1320], { type: 'sawtooth', vol: 0.2, step: 0.1, dur: 0.4 })],
  scream0: [1.7, (c, o) => scream(c, o, { f0: 320, len: 1.6 })],
  scream1: [1.7, (c, o) => scream(c, o, { f0: 370, len: 1.6 })],
  scream2: [1.7, (c, o) => scream(c, o, { f0: 290, len: 1.6 })],
  bullroar: [1.4, (c, o) => roar(c, o, { f0: 70, len: 1.3, formant: 400 })],
  gnasher: [0.8, (c, o) => roar(c, o, { f0: 150, len: 0.7, formant: 900, vol: 0.7 })],
  harpy: [0.8, (c, o) => { zap(c, o, { f1: 3000, f2: 1400, len: 0.5, type: 'sawtooth', vol: 0.25 }); }],
  skeleton: [0.4, (c, o) => clack(c, o, { vol: 0.6 })],
  mech: [1.0, (c, o) => { roar(c, o, { f0: 50, len: 0.9, formant: 300, vol: 0.6 }); }],
  bossroar: [3.0, (c, o) => roar(c, o, { f0: 38, len: 2.8, formant: 260, vol: 1.2 })],
  grunt: [0.4, (c, o) => grunt(c, o, { f0: 150 })],
  pain: [0.4, (c, o) => grunt(c, o, { f0: 120, formant: 700, vol: 0.9 })],
  death: [1.0, (c, o) => grunt(c, o, { f0: 110, len: 0.9, formant: 500, vol: 1 })],
  enemyshot: [0.5, (c, o) => zap(c, o, { f1: 900, f2: 200, len: 0.35, type: 'square', vol: 0.3 })],
  enemyfire: [0.6, (c, o) => whoosh(c, o, { len: 0.5, f1: 200, f2: 1200, vol: 0.5 })],
  splat: [0.4, (c, o) => { thud(c, o, { f: 80, len: 0.2, vol: 0.4, noise: 0.9 }); }],
  gib: [0.7, (c, o) => { thud(c, o, { f: 60, len: 0.4, vol: 0.6, noise: 1.2 }); clack(c, o, { vol: 0.2 }); }],
  step: [0.12, (c, o) => { const n = noiseSrc(c, 0.1); const b = filt(c, 'bandpass', 700, 1); n.connect(b); env(c, b, 0, 0.005, 0.12, 0.08).connect(o); n.start(0); }],
  land: [0.25, (c, o) => thud(c, o, { f: 70, len: 0.2, vol: 0.4, noise: 0.4 })],
  jump: [0.25, (c, o) => grunt(c, o, { f0: 180, len: 0.18, formant: 800, vol: 0.25 })],
  door: [3.0, (c, o) => rumble(c, o, { len: 2.8 })],
  spawn: [1.0, (c, o) => { zap(c, o, { f1: 200, f2: 2000, len: 0.6, type: 'sine', vol: 0.3 }); whoosh(c, o, { len: 0.8, f1: 2000, f2: 400, vol: 0.3 }); }],
  bounce: [0.15, (c, o) => thud(c, o, { f: 200, len: 0.08, vol: 0.3, noise: 0.2 })],
  hitmarker: [0.08, (c, o) => blip(c, o, [2600], { type: 'sine', vol: 0.08, dur: 0.03 })],
  chain: [0.6, (c, o) => { clack(c, o, { vol: 0.4 }); whoosh(c, o, { len: 0.5, f1: 600, f2: 1500, vol: 0.3 }); }],
  stomp: [1.2, (c, o) => { thud(c, o, { f: 35, len: 1.0, vol: 1.3, noise: 1 }); }],
  spin: [0.3, (c, o) => { const x = osc(c, 'sawtooth', 120); x.frequency.linearRampToValueAtTime(420, 0.3); const lp = filt(c, 'lowpass', 1200); x.connect(lp); env(c, lp, 0, 0.02, 0.12, 0.28).connect(o); x.start(0); x.stop(0.3); }],
  victory: [2.5, (c, o) => blip(c, o, [294, 370, 440, 587, 740, 880, 1175], { type: 'sawtooth', vol: 0.18, step: 0.14, dur: 0.6 })],
  secret: [1.2, (c, o) => blip(c, o, [587, 740, 880, 1175], { type: 'triangle', vol: 0.3, step: 0.12, dur: 0.5 })],
};

export class AudioSystem {
  constructor() {
    this.ctx = null;
    this.buffers = {};
    this.ready = false;
    this.listener = { x: 0, y: 0, z: 0, yaw: 0 };
    this.voices = {};
    this.volume = { master: 0.8, sfx: 1, music: 0.55 };
  }

  async init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    const c = this.ctx;
    this.comp = c.createDynamicsCompressor();
    this.comp.threshold.value = -14; this.comp.ratio.value = 6;
    this.master = c.createGain(); this.master.gain.value = this.volume.master;
    this.sfxBus = c.createGain(); this.sfxBus.gain.value = this.volume.sfx;
    this.musicBus = c.createGain(); this.musicBus.gain.value = this.volume.music;
    this.sfxBus.connect(this.comp); this.musicBus.connect(this.comp);
    this.comp.connect(this.master); this.master.connect(c.destination);
    // Render all effects offline in parallel.
    await Promise.all(Object.entries(DEFS).map(async ([name, [dur, fn]]) => {
      try {
        const off = new OfflineAudioContext(1, Math.ceil(dur * SR), SR);
        const g = off.createGain(); g.connect(off.destination);
        fn(off, g);
        this.buffers[name] = await off.startRendering();
      } catch (e) { console.warn('sfx render failed', name, e); }
    }));
    this.music = new Music(c, this.musicBus);
    this.ready = true;
  }

  resume() { if (this.ctx && this.ctx.state !== 'running') this.ctx.resume(); }

  setVolumes(v) {
    Object.assign(this.volume, v);
    if (!this.ctx) return;
    this.master.gain.value = this.volume.master;
    this.sfxBus.gain.value = this.volume.sfx;
    this.musicBus.gain.value = this.volume.music;
  }

  setListener(x, y, z, yaw) { const l = this.listener; l.x = x; l.y = y; l.z = z; l.yaw = yaw; }

  // Play a synthesised effect. opts: {pos:{x,y,z}, vol, rate, group, maxVoices}
  play(name, opts = {}) {
    if (!this.ready) return null;
    const buf = this.buffers[name];
    if (!buf) return null;
    const c = this.ctx;
    let vol = opts.vol ?? 1;
    let pan = 0;
    if (opts.pos) {
      const l = this.listener;
      const dx = opts.pos.x - l.x, dy = (opts.pos.y ?? l.y) - l.y, dz = opts.pos.z - l.z;
      const d = Math.hypot(dx, dy, dz);
      const range = opts.range ?? 18;
      vol *= 1 / (1 + (d / range) * (d / range));
      if (vol < 0.01) return null;
      // Right vector for yaw (camera looks down -Z at yaw 0).
      const rx = Math.cos(this.listener.yaw), rz = -Math.sin(this.listener.yaw);
      pan = d > 0.01 ? Math.max(-1, Math.min(1, (dx * rx + dz * rz) / d)) * 0.85 : 0;
    }
    // Limit concurrent voices per group (e.g. many screaming kamikazes).
    const group = opts.group;
    if (group) {
      const list = (this.voices[group] ||= []);
      const now = c.currentTime;
      for (let i = list.length - 1; i >= 0; i--) if (list[i] < now) list.splice(i, 1);
      if (list.length >= (opts.maxVoices ?? 4)) return null;
      list.push(now + buf.duration / (opts.rate ?? 1));
    }
    const src = c.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = (opts.rate ?? 1) * (opts.jitter === false ? 1 : 0.94 + Math.random() * 0.12);
    const g = c.createGain(); g.gain.value = vol;
    const p = c.createStereoPanner(); p.pan.value = pan;
    src.connect(g); g.connect(p); p.connect(this.sfxBus);
    src.start();
    return src;
  }

  setMusicIntensity(v) { if (this.music) this.music.target = v; }
  startMusic(theme) { if (this.music) this.music.start(theme); }
  stopMusic() { if (this.music) this.music.stop(); }
}

// ---------------------------------------------------------------------------
// Generative music. Hijaz / Phrygian dominant on D, calm layer + combat layer.
const HIJAZ = [0, 1, 4, 5, 7, 8, 10];
const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

class Music {
  constructor(ctx, out) {
    this.ctx = ctx; this.out = out;
    this.target = 0; this.intensity = 0;
    this.playing = false;
    this.bpm = 148;
    this.step = 0;
    this.root = 50; // D3
    this.calmBus = ctx.createGain(); this.combatBus = ctx.createGain();
    this.calmBus.gain.value = 1; this.combatBus.gain.value = 0;
    // Simple generated reverb for space.
    this.verb = ctx.createConvolver();
    const len = ctx.sampleRate * 2.5;
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
    }
    this.verb.buffer = ir;
    const vg = ctx.createGain(); vg.gain.value = 0.35;
    this.verb.connect(vg); vg.connect(out);
    this.calmBus.connect(out); this.combatBus.connect(out);
    this.calmBus.connect(this.verb);
    this.noise = noiseBuffer(ctx, 1);
    this.dist = distCurve(40);
    this.theme = 0;
  }

  start(theme = 0) {
    this.theme = theme;
    this.root = [50, 48, 45, 47][theme % 4];
    if (this.playing) return;
    this.playing = true;
    this.nextTime = this.ctx.currentTime + 0.1;
    this.step = 0;
    this.timer = setInterval(() => this.tick(), 25);
  }

  stop() {
    this.playing = false;
    clearInterval(this.timer);
  }

  tick() {
    const c = this.ctx;
    // Smooth intensity towards target and crossfade layers.
    this.intensity += (this.target - this.intensity) * 0.02;
    const k = Math.max(0, Math.min(1, this.intensity));
    this.combatBus.gain.setTargetAtTime(k, c.currentTime, 0.3);
    this.calmBus.gain.setTargetAtTime(0.35 + (1 - k) * 0.65, c.currentTime, 0.3);
    const spb = 60 / this.bpm / 4; // 16th note
    // after a throttled/hidden tab, skip ahead instead of scheduling every missed note at once
    if (this.nextTime < c.currentTime - 0.1) this.nextTime = c.currentTime + 0.05;
    while (this.nextTime < c.currentTime + 0.12) {
      this.schedule(this.step, this.nextTime, spb, k);
      this.nextTime += spb;
      this.step++;
    }
  }

  note(deg, oct = 0) {
    const i = ((deg % 7) + 7) % 7;
    const o = Math.floor(deg / 7);
    return this.root + HIJAZ[i] + 12 * (o + oct);
  }

  schedule(step, t, spb, k) {
    const s16 = step % 16, bar = Math.floor(step / 16);
    const prog = [0, 0, 1, 0, 3, 3, 1, -1][bar % 8]; // degree shift per bar
    // --- calm layer ---
    if (s16 === 0 && bar % 2 === 0) this.pad(t, [this.note(prog, 0), this.note(prog + 4, 0), this.note(prog + 2, 1)], spb * 32);
    if (Math.random() < 0.18 && s16 % 2 === 0) this.pluck(t, midi(this.note(Math.floor(Math.random() * 10), 1)), this.calmBus, 0.12);
    if (s16 === 0 && bar % 4 === 1) this.flute(t, [4, 3, 2, 1, 0].map((d) => this.note(d + prog, 1)), spb * 3);
    // --- combat layer (only scheduled when audible) ---
    if (k < 0.02) return;
    const B = this.combatBus;
    const kicks = [0, 3, 6, 8, 10, 11, 14];
    if (kicks.includes(s16)) this.kick(t, B);
    if (s16 === 4 || s16 === 12) this.snare(t, B);
    if (s16 % 2 === 0) this.hat(t, B, s16 % 4 === 2 ? 0.14 : 0.07);
    const bassPat = [0, 0, 1, 0, 2, 0, 3, 2];
    if (s16 % 2 === 0) this.bass(t, midi(this.note(prog + bassPat[(s16 / 2) % 8], -1)), spb * 1.8, B);
    if (s16 === 0) this.power(t, midi(this.note(prog, 0)), spb * 6, B);
    const riffs = [
      [0, -1, 1, -1, 2, 1, 0, -1, 4, -1, 3, 2, 1, -1, 0, -1],
      [4, 4, 5, 4, 3, -1, 2, 1, 2, 3, 4, -1, 1, 0, 1, -1],
      [7, -1, 6, 5, 4, -1, 5, 4, 3, -1, 2, 1, 2, 3, 1, 0],
    ];
    const riff = riffs[Math.floor(bar / 2) % 3];
    const deg = riff[s16];
    if (deg >= 0 && bar % 4 >= 2) this.lead(t, midi(this.note(deg + prog, 1)), spb * 0.95, B);
  }

  kick(t, out) {
    const c = this.ctx, o = c.createOscillator(), g = c.createGain();
    o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.12);
    g.gain.setValueAtTime(0.9, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
    o.connect(g); g.connect(out); o.start(t); o.stop(t + 0.3);
  }

  snare(t, out) {
    const c = this.ctx, n = c.createBufferSource(); n.buffer = this.noise;
    const f = c.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 1200;
    const g = c.createGain(); g.gain.setValueAtTime(0.5, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    n.connect(f); f.connect(g); g.connect(out); n.start(t, Math.random() * 0.5); n.stop(t + 0.2);
    const o = c.createOscillator(), og = c.createGain(); o.frequency.value = 190;
    og.gain.setValueAtTime(0.3, t); og.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
    o.connect(og); og.connect(out); o.start(t); o.stop(t + 0.12);
  }

  hat(t, out, v) {
    const c = this.ctx, n = c.createBufferSource(); n.buffer = this.noise;
    const f = c.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 7000;
    const g = c.createGain(); g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
    n.connect(f); f.connect(g); g.connect(out); n.start(t, Math.random() * 0.5); n.stop(t + 0.06);
  }

  bass(t, f, d, out) {
    const c = this.ctx, o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(900, t); lp.frequency.exponentialRampToValueAtTime(200, t + d);
    const g = c.createGain(); g.gain.setValueAtTime(0.35, t); g.gain.exponentialRampToValueAtTime(0.001, t + d);
    o.connect(lp); lp.connect(g); g.connect(out); o.start(t); o.stop(t + d + 0.02);
  }

  power(t, f, d, out) {
    const c = this.ctx;
    const ws = c.createWaveShaper(); ws.curve = this.dist;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2200;
    const g = c.createGain(); g.gain.setValueAtTime(0.13, t); g.gain.exponentialRampToValueAtTime(0.001, t + d);
    ws.connect(lp); lp.connect(g); g.connect(out);
    for (const m of [1, 1.4983, 2]) {
      const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f * m; o.detune.value = Math.random() * 10 - 5;
      o.connect(ws); o.start(t); o.stop(t + d);
    }
  }

  lead(t, f, d, out) {
    const c = this.ctx, o = c.createOscillator(); o.type = 'square'; o.frequency.value = f;
    const o2 = c.createOscillator(); o2.type = 'sawtooth'; o2.frequency.value = f * 1.005;
    const ws = c.createWaveShaper(); ws.curve = this.dist;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3000;
    const g = c.createGain(); g.gain.setValueAtTime(0.06, t); g.gain.exponentialRampToValueAtTime(0.001, t + d);
    o.connect(ws); o2.connect(ws); ws.connect(lp); lp.connect(g); g.connect(out);
    o.start(t); o2.start(t); o.stop(t + d); o2.stop(t + d);
  }

  pad(t, notes, d) {
    const c = this.ctx;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.05, t + d * 0.3);
    g.gain.linearRampToValueAtTime(0.0001, t + d);
    lp.connect(g); g.connect(this.calmBus);
    for (const n of notes) for (const det of [-7, 7]) {
      const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = midi(n); o.detune.value = det;
      o.connect(lp); o.start(t); o.stop(t + d + 0.05);
    }
  }

  pluck(t, f, out, v) {
    const c = this.ctx, o = c.createOscillator(); o.type = 'triangle'; o.frequency.value = f;
    const g = c.createGain(); g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.8);
    o.connect(g); g.connect(out); o.start(t); o.stop(t + 0.85);
  }

  flute(t, notes, d) {
    const c = this.ctx;
    notes.forEach((n, i) => {
      const tt = t + i * d;
      const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = midi(n);
      const vib = c.createOscillator(); vib.frequency.value = 5; const vg = c.createGain(); vg.gain.value = 4;
      vib.connect(vg); vg.connect(o.frequency);
      const g = c.createGain(); g.gain.setValueAtTime(0.0001, tt); g.gain.linearRampToValueAtTime(0.07, tt + 0.08);
      g.gain.linearRampToValueAtTime(0.0001, tt + d * 1.1);
      o.connect(g); g.connect(this.calmBus); o.start(tt); vib.start(tt); o.stop(tt + d * 1.2); vib.stop(tt + d * 1.2);
    });
  }
}
