// Procedural texture generation: every surface in the game is generated at
// load time (colour + height-derived normal maps), so there are no external assets.
import * as THREE from 'three';
import { mulberry32 } from './util.js';

function makeCanvas(size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return { c, ctx: c.getContext('2d', { willReadFrequently: true }) };
}

// Tileable value noise with integer period.
function makeNoise(seed) {
  const rng = mulberry32(seed);
  const N = 256;
  const perm = new Uint8Array(N * 2);
  const vals = new Float32Array(N);
  for (let i = 0; i < N; i++) { perm[i] = i; vals[i] = rng(); }
  for (let i = N - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const t = perm[i]; perm[i] = perm[j]; perm[j] = t;
  }
  for (let i = 0; i < N; i++) perm[i + N] = perm[i];
  const h = (x, y) => vals[perm[(perm[x & 255] + y) & 511] & 255];
  const s = (t) => t * t * (3 - 2 * t);
  function noise(x, y, period) {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const x0 = ((xi % period) + period) % period, y0 = ((yi % period) + period) % period;
    const x1 = (x0 + 1) % period, y1 = (y0 + 1) % period;
    const u = s(xf), v = s(yf);
    const a = h(x0, y0), b = h(x1, y0), c = h(x0, y1), d = h(x1, y1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  function fbm(x, y, period, oct = 4) {
    let sum = 0, amp = 0.5, norm = 0, p = period;
    for (let o = 0; o < oct; o++) {
      sum += noise(x, y, p) * amp;
      norm += amp;
      x *= 2; y *= 2; p *= 2; amp *= 0.5;
    }
    return sum / norm;
  }
  return { noise, fbm };
}

// Builds colour + normal textures from a per-pixel callback.
// fn(u, v, px, py) -> [r,g,b,height] with rgb in 0..255, height 0..1
function generate(size, fn, normalStrength = 2.0, heightOverride = null) {
  const { c, ctx } = makeCanvas(size);
  const img = ctx.createImageData(size, size);
  const heights = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const r = fn(x / size, y / size, x, y);
      const i = (y * size + x) * 4;
      img.data[i] = r[0]; img.data[i + 1] = r[1]; img.data[i + 2] = r[2]; img.data[i + 3] = 255;
      heights[y * size + x] = r[3];
    }
  }
  ctx.putImageData(img, 0, 0);
  if (heightOverride) heightOverride(ctx, heights, size);
  const normal = heightToNormal(heights, size, normalStrength);
  return { color: c, normal };
}

function heightToNormal(h, size, strength) {
  const { c, ctx } = makeCanvas(size);
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const l = h[y * size + ((x - 1 + size) % size)];
      const r = h[y * size + ((x + 1) % size)];
      const u = h[((y - 1 + size) % size) * size + x];
      const d = h[((y + 1) % size) * size + x];
      let nx = (l - r) * strength, ny = (d - u) * strength, nz = 1;
      const len = Math.hypot(nx, ny, nz);
      nx /= len; ny /= len; nz /= len;
      const i = (y * size + x) * 4;
      img.data[i] = (nx * 0.5 + 0.5) * 255;
      img.data[i + 1] = (ny * 0.5 + 0.5) * 255;
      img.data[i + 2] = (nz * 0.5 + 0.5) * 255;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

const clampByte = (v) => (v < 0 ? 0 : v > 255 ? 255 : v);

// Block pattern helper: returns {edge (0..1 distance to mortar), id} for a brick layout.
function blockAt(px, py, bw, bh, offsetRows = true) {
  const row = Math.floor(py / bh);
  const ox = offsetRows && row % 2 ? bw / 2 : 0;
  const col = Math.floor((px + ox) / bw);
  const lx = (px + ox) - col * bw, ly = py - row * bh;
  const ex = Math.min(lx, bw - lx), ey = Math.min(ly, bh - ly);
  return { edge: Math.min(ex, ey), row, col, lx, ly };
}

function stoneBlocks(seed, size, base, opts = {}) {
  const N = makeNoise(seed);
  const rng = mulberry32(seed + 7);
  const tints = [];
  for (let i = 0; i < 256; i++) tints.push(0.82 + rng() * 0.3);
  const bw = opts.bw || 128, bh = opts.bh || 64, mortar = opts.mortar || 3;
  return generate(size, (u, v, px, py) => {
    const b = blockAt(px, py, bw, bh, opts.offset !== false);
    const tint = tints[((b.row * 7 + b.col * 13) % 256 + 256) % 256];
    const n = N.fbm(u * 8, v * 8, 8, 5);
    const fine = N.noise(u * 64, v * 64, 64);
    let h = 1;
    const bevel = 4;
    if (b.edge < mortar) h = 0.1;
    else if (b.edge < mortar + bevel) h = 0.1 + 0.9 * ((b.edge - mortar) / bevel);
    // erosion pits
    const pit = N.fbm(u * 16 + 3, v * 16 + 5, 16, 3);
    if (pit > 0.68) h -= (pit - 0.68) * 2.2;
    h += (n - 0.5) * 0.25 + (fine - 0.5) * 0.08;
    let k = tint * (0.8 + n * 0.4) * (0.94 + fine * 0.12);
    if (b.edge < mortar) k *= 0.55;
    if (pit > 0.68) k *= 0.85;
    // sun-bleached top edge and grime at the bottom of each block
    k *= 1 + (1 - b.ly / bh) * 0.06 - (b.ly / bh > 0.85 ? 0.08 : 0);
    return [clampByte(base[0] * k), clampByte(base[1] * k), clampByte(base[2] * k), h];
  }, opts.normal || 3.0);
}

// Glyph shapes drawn with canvas paths (both carved into height and colour).
function drawGlyph(ctx, kind, x, y, s) {
  ctx.beginPath();
  switch (kind) {
    case 0: // ankh
      ctx.ellipse(x, y - s * 0.25, s * 0.18, s * 0.22, 0, 0, Math.PI * 2);
      ctx.moveTo(x, y - s * 0.03); ctx.lineTo(x, y + s * 0.45);
      ctx.moveTo(x - s * 0.28, y + 0.05 * s); ctx.lineTo(x + s * 0.28, y + 0.05 * s);
      break;
    case 1: // eye
      ctx.ellipse(x, y, s * 0.35, s * 0.15, 0, 0, Math.PI * 2);
      ctx.moveTo(x + s * 0.08, y); ctx.arc(x, y, s * 0.08, 0, Math.PI * 2);
      ctx.moveTo(x - s * 0.1, y + s * 0.15); ctx.quadraticCurveTo(x - s * 0.15, y + s * 0.4, x - s * 0.3, y + s * 0.35);
      break;
    case 2: // bird
      ctx.moveTo(x - s * 0.3, y + s * 0.3); ctx.lineTo(x - s * 0.05, y - s * 0.05);
      ctx.lineTo(x + s * 0.1, y - s * 0.35); ctx.lineTo(x + s * 0.28, y - s * 0.28);
      ctx.moveTo(x - s * 0.05, y - s * 0.05); ctx.lineTo(x + s * 0.25, y + s * 0.15);
      ctx.moveTo(x - s * 0.05, y + s * 0.1); ctx.lineTo(x - s * 0.05, y + s * 0.42);
      ctx.moveTo(x + s * 0.1, y + s * 0.08); ctx.lineTo(x + s * 0.1, y + s * 0.42);
      break;
    case 3: // sun disc with rays
      ctx.arc(x, y, s * 0.2, 0, Math.PI * 2);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        ctx.moveTo(x + Math.cos(a) * s * 0.27, y + Math.sin(a) * s * 0.27);
        ctx.lineTo(x + Math.cos(a) * s * 0.42, y + Math.sin(a) * s * 0.42);
      }
      break;
    case 4: // wavy water
      for (let r = -1; r <= 1; r++) {
        ctx.moveTo(x - s * 0.4, y + r * s * 0.2);
        for (let i = 0; i <= 8; i++) ctx.lineTo(x - s * 0.4 + i * s * 0.1, y + r * s * 0.2 + (i % 2 ? -1 : 1) * s * 0.06);
      }
      break;
    case 5: // snake
      ctx.moveTo(x - s * 0.35, y + s * 0.3);
      ctx.bezierCurveTo(x - s * 0.1, y - s * 0.1, x + s * 0.1, y + s * 0.5, x + s * 0.3, y - s * 0.1);
      ctx.lineTo(x + s * 0.3, y - s * 0.4);
      ctx.moveTo(x + s * 0.3, y - s * 0.4); ctx.lineTo(x + s * 0.4, y - s * 0.35);
      break;
    case 6: // standing figure
      ctx.arc(x, y - s * 0.33, s * 0.1, 0, Math.PI * 2);
      ctx.moveTo(x, y - s * 0.22); ctx.lineTo(x, y + s * 0.15);
      ctx.lineTo(x - s * 0.15, y + s * 0.45); ctx.moveTo(x, y + s * 0.15); ctx.lineTo(x + s * 0.15, y + s * 0.45);
      ctx.moveTo(x - s * 0.25, y - s * 0.1); ctx.lineTo(x, y - s * 0.15); ctx.lineTo(x + s * 0.3, y - s * 0.3);
      break;
    default: // cartouche
      ctx.roundRect(x - s * 0.22, y - s * 0.42, s * 0.44, s * 0.84, s * 0.2);
      ctx.moveTo(x - s * 0.1, y - s * 0.15); ctx.lineTo(x + s * 0.1, y - s * 0.15);
      ctx.moveTo(x, y); ctx.arc(x, y + s * 0.05, s * 0.06, 0, Math.PI * 2);
      ctx.moveTo(x - s * 0.1, y + s * 0.22); ctx.lineTo(x + s * 0.1, y + s * 0.22);
  }
  ctx.stroke();
}

function hieroglyphWall(seed, size, base, night = false) {
  const N = makeNoise(seed);
  const rng = mulberry32(seed);
  const glyphs = [];
  const cell = size / 6;
  const bandH = size * 0.14;
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 6; col++) {
      glyphs.push({ k: Math.floor(rng() * 8), x: col * cell + cell / 2, y: bandH + 12 + row * ((size - bandH - 24) / 5) + (size - bandH - 24) / 10 });
    }
  }
  const bandColors = [[40, 70, 140], [170, 40, 30], [200, 160, 40], [40, 110, 90]];
  const res = generate(size, (u, v, px, py) => {
    const n = N.fbm(u * 8, v * 8, 8, 5);
    const fine = N.noise(u * 64, v * 64, 64);
    let k = 0.82 + n * 0.35 + (fine - 0.5) * 0.08;
    let col = [base[0] * k, base[1] * k, base[2] * k];
    let h = 0.7 + (n - 0.5) * 0.2;
    if (py < bandH) {
      // painted frieze band
      const stripe = Math.floor(px / (size / 16));
      const bc = bandColors[stripe % 4];
      const faded = 0.55 + n * 0.3;
      col = [bc[0] * faded + base[0] * (1 - faded) * k, bc[1] * faded + base[1] * (1 - faded) * k, bc[2] * faded + base[2] * (1 - faded) * k];
      if (py < 6 || py > bandH - 6 || px % (size / 16) < 3) { col = col.map((c) => c * 0.6); h = 0.5; }
    }
    if (Math.abs(py - bandH) < 3) { col = col.map((c) => c * 0.5); h = 0.3; }
    // vertical panel separators
    if (py > bandH && px % cell < 3) { col = col.map((c) => c * 0.7); h = 0.45; }
    if (night) col = col.map((c) => c * 0.9);
    return [clampByte(col[0]), clampByte(col[1]), clampByte(col[2]), h];
  }, 3.5, (ctx, heights, sz) => {
    // carve glyphs: draw into a temporary mask then apply to colour + height
    const { c: mc, ctx: mctx } = makeCanvas(sz);
    mctx.fillStyle = '#000'; mctx.fillRect(0, 0, sz, sz);
    mctx.strokeStyle = '#fff'; mctx.lineWidth = sz / 110; mctx.lineCap = 'round'; mctx.lineJoin = 'round';
    for (const g of glyphs) drawGlyph(mctx, g.k, g.x, g.y, cell * 0.72);
    const mask = mctx.getImageData(0, 0, sz, sz).data;
    const img = ctx.getImageData(0, 0, sz, sz);
    for (let i = 0; i < sz * sz; i++) {
      const m = mask[i * 4] / 255;
      if (m > 0) {
        heights[i] -= m * 0.45;
        const d = 1 - m * 0.45;
        img.data[i * 4] *= d; img.data[i * 4 + 1] *= d * 0.97; img.data[i * 4 + 2] *= d * 0.95;
      }
    }
    ctx.putImageData(img, 0, 0);
    void mc;
  });
  return res;
}

function floorTiles(seed, size, base, tile = 128) {
  const N = makeNoise(seed);
  const rng = mulberry32(seed + 3);
  const tints = [];
  for (let i = 0; i < 64; i++) tints.push(0.85 + rng() * 0.25);
  return generate(size, (u, v, px, py) => {
    const b = blockAt(px, py, tile, tile, false);
    const t = tints[((b.row * 5 + b.col * 3) % 64 + 64) % 64];
    const n = N.fbm(u * 8, v * 8, 8, 5);
    const crack = Math.abs(N.fbm(u * 6 + 11, v * 6 + 2, 6, 4) - 0.5);
    let h = 1, k = t * (0.82 + n * 0.3);
    if (b.edge < 3) { h = 0.2; k *= 0.55; }
    else if (b.edge < 6) h = 0.2 + (b.edge - 3) / 3 * 0.8;
    if (crack < 0.012) { h -= 0.4; k *= 0.7; }
    h += (n - 0.5) * 0.15;
    return [clampByte(base[0] * k), clampByte(base[1] * k), clampByte(base[2] * k), h];
  }, 2.5);
}

function sandTex(seed, size, base) {
  const N = makeNoise(seed);
  return generate(size, (u, v) => {
    const n = N.fbm(u * 4, v * 4, 4, 6);
    const warp = N.fbm(u * 3 + 5, v * 3 + 1, 3, 3);
    const ripple = Math.sin((v * 22 + warp * 6 + u * 3) * Math.PI * 2) * 0.5 + 0.5;
    const grain = N.noise(u * 128, v * 128, 128);
    const h = ripple * 0.35 + n * 0.5 + grain * 0.1;
    const k = 0.86 + n * 0.22 + ripple * 0.06 + (grain - 0.5) * 0.1;
    return [clampByte(base[0] * k), clampByte(base[1] * k), clampByte(base[2] * k), h];
  }, 2.0);
}

function metalTex(seed, size, base, scratch = true) {
  const N = makeNoise(seed);
  return generate(size, (u, v) => {
    const n = N.fbm(u * 8, v * 8, 8, 4);
    const s = scratch ? N.noise(u * 2, v * 96, 96) : 0.5;
    const k = 0.75 + n * 0.35 + (s > 0.8 ? 0.15 : 0);
    return [clampByte(base[0] * k), clampByte(base[1] * k), clampByte(base[2] * k), n * 0.4];
  }, 1.0);
}

function woodTex(seed, size) {
  const N = makeNoise(seed);
  return generate(size, (u, v) => {
    const w = N.fbm(u * 2, v * 16, 16, 4);
    const ring = Math.sin((u * 30 + w * 8) * Math.PI) * 0.5 + 0.5;
    const k = 0.6 + ring * 0.3 + w * 0.2;
    return [clampByte(120 * k), clampByte(72 * k), clampByte(38 * k), ring * 0.5];
  }, 1.5);
}

function barkTex(seed, size) {
  const N = makeNoise(seed);
  return generate(size, (u, v) => {
    const n = N.fbm(u * 8, v * 8, 8, 4);
    const band = (v * 16) % 1;
    const ridge = band < 0.2 ? 0.2 : 1;
    const dia = Math.abs(((u * 8 + v * 16) % 1) - 0.5) * 2;
    const k = (0.55 + n * 0.4) * (ridge > 0.5 ? 1 : 0.6) * (0.85 + dia * 0.2);
    return [clampByte(125 * k), clampByte(95 * k), clampByte(60 * k), ridge * 0.6 + n * 0.3 + dia * 0.2];
  }, 3.0);
}

// Palm frond with alpha: drawn with canvas paths.
function palmFrond() {
  const { c, ctx } = makeCanvas(256);
  ctx.clearRect(0, 0, 256, 256);
  const grd = ctx.createLinearGradient(0, 0, 256, 0);
  grd.addColorStop(0, '#2f5a1c'); grd.addColorStop(1, '#6f9a2e');
  ctx.strokeStyle = '#3d5a1a'; ctx.lineWidth = 5;
  ctx.beginPath(); ctx.moveTo(0, 128); ctx.quadraticCurveTo(128, 110, 256, 140); ctx.stroke();
  ctx.strokeStyle = grd; ctx.lineWidth = 3;
  for (let i = 4; i < 250; i += 5) {
    const y0 = 128 - (i / 256) * 18 + (i / 256) ** 2 * 30;
    const len = 60 * Math.sin((i / 256) * Math.PI) + 8;
    ctx.beginPath(); ctx.moveTo(i, y0); ctx.lineTo(i + 18, y0 - len); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(i, y0); ctx.lineTo(i + 18, y0 + len); ctx.stroke();
  }
  return c;
}

function radialSprite(size, stops) {
  const { c, ctx } = makeCanvas(size);
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [o, col] of stops) g.addColorStop(o, col);
  ctx.fillStyle = g; ctx.fillRect(0, 0, size, size);
  return c;
}

function runeDoor(seed, size, base) {
  const stone = stoneBlocks(seed, size, base, { bw: size / 2, bh: size / 4, offset: false });
  // emissive glyph overlay
  const { c, ctx } = makeCanvas(size);
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = '#fff'; ctx.lineWidth = size / 40; ctx.lineCap = 'round';
  ctx.shadowColor = '#fff'; ctx.shadowBlur = size / 20;
  drawGlyph(ctx, 3, size / 2, size / 2, size * 0.7);
  drawGlyph(ctx, 1, size / 2, size * 0.18, size * 0.3);
  // tint colour map with carve
  const col = stone.color.getContext('2d');
  col.globalAlpha = 0.6; col.drawImage(c, 0, 0); col.globalAlpha = 1;
  return { color: stone.color, normal: stone.normal, emissive: c };
}

function toTex(canvas, { repeat = true, srgb = true } = {}) {
  const t = new THREE.CanvasTexture(canvas);
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = 8;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

let cache = null;

// Returns a library of materials keyed by name. Created once and reused.
export function getMaterials() {
  if (cache) return cache;
  const M = {};
  const std = (set, extra = {}) => new THREE.MeshStandardMaterial({
    map: toTex(set.color), normalMap: toTex(set.normal, { srgb: false }),
    roughness: 0.92, metalness: 0.0, ...extra,
  });

  M.sandstone = std(stoneBlocks(11, 512, [214, 178, 124]));
  M.sandstoneDark = std(stoneBlocks(12, 512, [168, 128, 88]));
  M.hieroglyph = std(hieroglyphWall(21, 512, [220, 186, 132]));
  M.tiles = std(floorTiles(31, 512, [205, 180, 140]));
  M.tilesDark = std(floorTiles(32, 512, [120, 110, 120]));
  M.sand = std(sandTex(41, 512, [226, 190, 130]));
  M.basalt = std(stoneBlocks(51, 512, [92, 92, 110], { bw: 170, bh: 85 }));
  M.basaltGlyph = std(hieroglyphWall(52, 512, [110, 108, 128], true));
  M.gold = new THREE.MeshStandardMaterial({ map: toTex(metalTex(61, 128, [240, 190, 70], false).color), roughness: 0.35, metalness: 0.9 });
  M.bark = std(barkTex(71, 256));
  const frond = toTex(palmFrond());
  M.frond = new THREE.MeshStandardMaterial({ map: frond, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.8 });
  const rune = runeDoor(81, 256, [190, 150, 105]);
  M.door = new THREE.MeshStandardMaterial({
    map: toTex(rune.color), normalMap: toTex(rune.normal, { srgb: false }), emissiveMap: toTex(rune.emissive),
    emissive: new THREE.Color(0xffaa33), emissiveIntensity: 2.0, roughness: 0.85,
  });
  M.gunmetal = new THREE.MeshStandardMaterial({ map: toTex(metalTex(91, 128, [110, 112, 122]).color), roughness: 0.38, metalness: 0.75 });
  M.darkmetal = new THREE.MeshStandardMaterial({ map: toTex(metalTex(92, 128, [72, 72, 80]).color), roughness: 0.45, metalness: 0.65 });
  M.brass = new THREE.MeshStandardMaterial({ color: 0xc8a040, roughness: 0.35, metalness: 0.9 });
  M.wood = new THREE.MeshStandardMaterial({ map: toTex(woodTex(93, 128).color), roughness: 0.7 });
  M.redStone = std(stoneBlocks(94, 256, [160, 70, 50]));
  M.lava = new THREE.MeshStandardMaterial({ color: 0x331100, emissive: 0xff5500, emissiveIntensity: 1.6, roughness: 1 });

  M._sprites = {
    glow: toTex(radialSprite(64, [[0, 'rgba(255,255,255,1)'], [0.3, 'rgba(255,255,255,0.6)'], [1, 'rgba(255,255,255,0)']]), { repeat: false }),
    flame: toTex(radialSprite(64, [[0, 'rgba(255,255,220,1)'], [0.25, 'rgba(255,190,60,0.9)'], [0.6, 'rgba(255,80,10,0.4)'], [1, 'rgba(255,0,0,0)']]), { repeat: false }),
  };
  cache = M;
  return M;
}
