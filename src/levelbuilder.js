// Level construction toolkit: arenas, corridors, doors, platforms and
// Egyptian set dressing. Produces a World (collision) + a THREE.Group (render).
import * as THREE from 'three';
import { World, GeometryBatcher } from './world.js';
import { getMaterials } from './textures.js';
import { part, box, cyl, cone, sph } from './models.js';
import { mulberry32 } from './util.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const T = 1.5; // wall thickness

export class LevelBuilder {
  constructor(def) {
    this.def = def;
    this.world = new World();
    this.group = new THREE.Group();
    this.batch = new GeometryBatcher();
    this.M = getMaterials();
    this.doors = {};
    this.pickups = [];
    this.encounters = [];
    this.torches = [];
    this.animated = [];
    this.secrets = [];
    this.messages = [];
    this.exit = null;
    this.spawn = { x: 0, z: 0, yaw: 0 };
    this.rng = mulberry32(def.seed || 1234);
    this.lightBudget = 8;
  }

  // Solid box (collision + render)
  solid(minX, minY, minZ, maxX, maxY, maxZ, mat, uv = 4, tag = null) {
    this.world.add({ minX, minY, minZ, maxX, maxY, maxZ, tag });
    if (mat) this.batch.addBox(mat, minX, minY, minZ, maxX, maxY, maxZ, uv);
  }

  // Centered convenience
  block(cx, cz, w, d, h, mat, y0 = 0, uv = 4) {
    this.solid(cx - w / 2, y0, cz - d / 2, cx + w / 2, y0 + h, cz + d / 2, mat, uv);
  }

  visual(minX, minY, minZ, maxX, maxY, maxZ, mat, uv = 4) {
    this.batch.addBox(mat, minX, minY, minZ, maxX, maxY, maxZ, uv);
  }

  floor(x0, z0, x1, z1, mat = this.M.tiles, uv = 4) {
    this.visual(x0, -0.3, z0, x1, 0.0, z1, mat, uv);
  }

  // Wall along X (z fixed) from x0..x1 with optional gaps [[center,width],...]
  wallX(x0, x1, zA, zB, h, mat, gaps = []) {
    let segs = [[x0, x1]];
    for (const [c, w] of gaps) {
      const g0 = c - w / 2, g1 = c + w / 2;
      segs = segs.flatMap(([a, b]) => (g1 <= a || g0 >= b) ? [[a, b]] : [[a, g0], [g1, b]].filter(([p, q]) => q - p > 0.01));
    }
    for (const [a, b] of segs) {
      this.solid(a, 0, zA, b, h, zB, mat);
      this.visual(a - 0.2, h, zA - 0.2, b + 0.2, h + 0.6, zB + 0.2, this.trim);
    }
    // lintel over gaps
    for (const [c, w] of gaps) {
      if (h > 7.5) this.solid(c - w / 2, 7, zA, c + w / 2, h, zB, mat);
    }
  }

  wallZ(z0, z1, xA, xB, h, mat, gaps = []) {
    let segs = [[z0, z1]];
    for (const [c, w] of gaps) {
      const g0 = c - w / 2, g1 = c + w / 2;
      segs = segs.flatMap(([a, b]) => (g1 <= a || g0 >= b) ? [[a, b]] : [[a, g0], [g1, b]].filter(([p, q]) => q - p > 0.01));
    }
    for (const [a, b] of segs) {
      this.solid(xA, 0, a, xB, h, b, mat);
      this.visual(xA - 0.2, h, a - 0.2, xB + 0.2, h + 0.6, b + 0.2, this.trim);
    }
    for (const [c, w] of gaps) {
      if (h > 7.5) this.solid(xA, 7, c - w / 2, xB, h, c + w / 2, mat);
    }
  }

  get trim() { return this.def.theme === 'night' ? this.M.basalt : this.M.sandstoneDark; }

  // Rectangular walled arena. gaps: {n:[[cx,w]], s:[[cx,w]], e:[[cz,w]], w:[[cz,w]]}
  // n = minZ side (forward), s = maxZ side.
  arena(x0, z0, x1, z1, { h = 9, wall = this.M.hieroglyph, floor = this.M.tiles, gaps = {}, pilasters = true } = {}) {
    this.floor(x0, z0, x1, z1, floor);
    this.wallX(x0 - T, x1 + T, z0 - T, z0, h, wall, gaps.n || []);
    this.wallX(x0 - T, x1 + T, z1, z1 + T, h, wall, gaps.s || []);
    this.wallZ(z0, z1, x0 - T, x0, h, wall, gaps.w || []);
    this.wallZ(z0, z1, x1, x1 + T, h, wall, gaps.e || []);
    if (pilasters) {
      const pm = this.trim;
      const avoid = (v, list) => list.some(([c, w]) => Math.abs(v - c) < w / 2 + 1.5);
      for (let x = x0 + 4; x <= x1 - 4; x += 8) {
        if (!avoid(x, gaps.n || [])) this.solid(x - 0.6, 0, z0, x + 0.6, h, z0 + 0.6, pm);
        if (!avoid(x, gaps.s || [])) this.solid(x - 0.6, 0, z1 - 0.6, x + 0.6, h, z1, pm);
      }
      for (let z = z0 + 4; z <= z1 - 4; z += 8) {
        if (!avoid(z, gaps.w || [])) this.solid(x0, 0, z - 0.6, x0 + 0.6, h, z + 0.6, pm);
        if (!avoid(z, gaps.e || [])) this.solid(x1 - 0.6, 0, z - 0.6, x1, h, z + 0.6, pm);
      }
    }
  }

  // Corridor along Z between z0 < z1 centred on x.
  corridorZ(x, z0, z1, w = 6, h = 8, wall = this.M.sandstone, floor = this.M.tiles) {
    this.floor(x - w / 2, z0, x + w / 2, z1, floor);
    this.solid(x - w / 2 - T, 0, z0, x - w / 2, h, z1, wall);
    this.solid(x + w / 2, 0, z0, x + w / 2 + T, h, z1, wall);
    this.visual(x - w / 2 - T - 0.2, h, z0, x - w / 2 + 0.2, h + 0.6, z1, this.trim);
    this.visual(x + w / 2 - 0.2, h, z0, x + w / 2 + T + 0.2, h + 0.6, z1, this.trim);
    // roof beams for a sense of enclosure
    for (let z = z0 + 2; z < z1 - 1; z += 4) this.visual(x - w / 2 - T, h, z, x + w / 2 + T, h + 0.8, z + 0.8, this.trim);
  }

  corridorX(z, x0, x1, w = 6, h = 8, wall = this.M.sandstone, floor = this.M.tiles) {
    this.floor(x0, z - w / 2, x1, z + w / 2, floor);
    this.solid(x0, 0, z - w / 2 - T, x1, h, z - w / 2, wall);
    this.solid(x0, 0, z + w / 2, x1, h, z + w / 2 + T, wall);
    for (let x = x0 + 2; x < x1 - 1; x += 4) this.visual(x, h, z - w / 2 - T, x + 0.8, h + 0.8, z + w / 2 + T, this.trim);
  }

  // Sliding stone door filling a gap. axis 'x' = door spans along X (in an X wall).
  door(id, cx, cz, w, axis = 'x', h = 7, open = false) {
    const geo = axis === 'x' ? new THREE.BoxGeometry(w, h, T * 0.8) : new THREE.BoxGeometry(T * 0.8, h, w);
    const mesh = new THREE.Mesh(geo, this.M.door);
    mesh.position.set(cx, h / 2, cz);
    mesh.castShadow = true; mesh.receiveShadow = true;
    mesh.userData.dynamic = true;
    this.group.add(mesh);
    const hw = axis === 'x' ? w / 2 : T * 0.4, hd = axis === 'x' ? T * 0.4 : w / 2;
    const b = this.world.add({ minX: cx - hw, minY: 0, minZ: cz - hd, maxX: cx + hw, maxY: h, maxZ: cz + hd, tag: 'door' });
    const d = { id, mesh, box: b, h, state: open ? 'open' : 'closed', t: 0, cx, cz };
    if (open) { b.active = false; mesh.position.y = -h / 2 + 0.05; mesh.visible = false; }
    this.doors[id] = d;
    return d;
  }

  // Raised platform with stairs on one side ('n','s','e','w').
  platform(cx, cz, w, d, h, mat = this.M.sandstone, stairs = 's', top = this.M.tiles) {
    this.solid(cx - w / 2, 0, cz - d / 2, cx + w / 2, h - 0.01, cz + d / 2, mat);
    this.visual(cx - w / 2 - 0.05, h - 0.2, cz - d / 2 - 0.05, cx + w / 2 + 0.05, h, cz + d / 2 + 0.05, top);
    this.world.add({ minX: cx - w / 2, minY: h - 0.2, minZ: cz - d / 2, maxX: cx + w / 2, maxY: h, maxZ: cz + d / 2 });
    const steps = Math.ceil(h / 0.4);
    const sh = h / steps, sd = 0.7, sw = Math.min(w, d) * 0.5;
    for (const side of stairs.split('')) {
      for (let i = 0; i < steps - 1; i++) {
        const top = sh * (i + 1);
        const off = (steps - 1 - i) * sd;
        if (side === 's') this.solid(cx - sw / 2, 0, cz + d / 2, cx + sw / 2, top, cz + d / 2 + off, mat);
        if (side === 'n') this.solid(cx - sw / 2, 0, cz - d / 2 - off, cx + sw / 2, top, cz - d / 2, mat);
        if (side === 'e') this.solid(cx + w / 2, 0, cz - sw / 2, cx + w / 2 + off, top, cz + sw / 2, mat);
        if (side === 'w') this.solid(cx - w / 2 - off, 0, cz - sw / 2, cx - w / 2, top, cz + sw / 2, mat);
      }
    }
  }

  // --- set dressing -------------------------------------------------------
  pillar(x, z, h = 8, r = 0.9, broken = false) {
    const M = this.M;
    const ph = broken ? h * (0.3 + this.rng() * 0.4) : h;
    const col = part(cyl(r, r * 1.05, ph, 14), M.sandstone, x, ph / 2 + 0.5, z, this.group);
    col.receiveShadow = true;
    part(box(r * 2.6, 0.5, r * 2.6), M.sandstoneDark, x, 0.25, z, this.group).receiveShadow = true;
    if (!broken) {
      const cap = part(cyl(r * 1.6, r, 0.9, 14), M.gold, x, ph + 0.95, z, this.group);
      cap.receiveShadow = true;
      part(box(r * 3.2, 0.5, r * 3.2), M.sandstoneDark, x, ph + 1.65, z, this.group);
    } else {
      const chunk = part(cyl(r, r, 1.2, 14), M.sandstone, x + 1.6, r, z + 0.8, this.group);
      chunk.rotation.z = Math.PI / 2; chunk.rotation.y = this.rng() * 3;
    }
    this.world.add({ minX: x - r, minY: 0, minZ: z - r, maxX: x + r, maxY: ph + 2, maxZ: z + r });
  }

  obelisk(x, z, h = 12) {
    const M = this.M;
    part(box(3, 1, 3), M.sandstoneDark, x, 0.5, z, this.group).receiveShadow = true;
    const g = new THREE.CylinderGeometry(0.55, 1.0, h, 4, 1);
    g.rotateY(Math.PI / 4);
    const o = part(g, M.hieroglyph, x, h / 2 + 1, z, this.group);
    o.receiveShadow = true;
    const tip = new THREE.ConeGeometry(0.78, 1.4, 4); tip.rotateY(Math.PI / 4);
    part(tip, M.gold, x, h + 1.7, z, this.group);
    this.world.add({ minX: x - 1.5, minY: 0, minZ: z - 1.5, maxX: x + 1.5, maxY: 1, maxZ: z + 1.5 });
    this.world.add({ minX: x - 0.9, minY: 0, minZ: z - 0.9, maxX: x + 0.9, maxY: h + 2, maxZ: z + 0.9 });
  }

  palm(x, z, h = 7 + this.rng() * 4, collide = true) {
    const M = this.M;
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    const lean = (this.rng() - 0.5) * 0.3, dir = this.rng() * Math.PI * 2;
    const segs = 6;
    let px = 0, py = 0;
    for (let i = 0; i < segs; i++) {
      const s = part(cyl(0.18 - i * 0.012, 0.22 - i * 0.012, h / segs + 0.05, 7), M.bark, px, py + h / segs / 2, 0, g);
      s.rotation.z = lean * (i / segs);
      px += Math.sin(lean * (i / segs)) * -h / segs;
      py += h / segs;
    }
    const top = new THREE.Group(); top.position.set(px, py, 0); g.add(top);
    top.userData.dynamic = true;
    const fg = new THREE.PlaneGeometry(3.2, 1.3, 4, 1);
    // droop the fronds by bending the plane
    const p = fg.attributes.position;
    for (let i = 0; i < p.count; i++) { const xx = p.getX(i) + 1.6; p.setX(i, xx); p.setZ(i, -xx * xx * 0.08); }
    fg.rotateX(-Math.PI / 2);
    for (let i = 0; i < 9; i++) {
      const f = part(fg, M.frond, 0, 0, 0, top);
      f.rotation.y = (i / 9) * Math.PI * 2 + this.rng() * 0.3;
      f.rotation.z = -0.2 - this.rng() * 0.3;
    }
    part(sph(0.28, 8, 6), M.bark, 0, -0.1, 0, top);
    g.rotation.y = dir;
    this.group.add(g);
    this.animated.push({ type: 'palm', obj: top, phase: this.rng() * 10 });
    if (collide) this.world.add({ minX: x - 0.3, minY: 0, minZ: z - 0.3, maxX: x + 0.3, maxY: h, maxZ: z + 0.3 });
  }

  sphinx(x, z, rotY = 0) {
    const M = this.M;
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = rotY;
    part(box(3.2, 1.2, 6.5), M.sandstoneDark, 0, 0.6, 0, g);
    part(box(2.4, 1.6, 4.2), M.sandstone, 0, 2.0, 0.6, g);
    part(box(2.2, 2.4, 1.8), M.sandstone, 0, 2.8, -1.8, g);
    part(box(1.4, 1.5, 1.2), M.sandstone, 0, 4.6, -2.1, g);
    for (let i = 0; i < 4; i++) part(box(2.0 - i * 0.1, 0.22, 1.5), i % 2 ? M.sandstoneDark : M.gold, 0, 5.2 - i * 0.3, -1.9, g);
    for (const s of [-1, 1]) part(box(0.6, 0.6, 2.2), M.sandstone, s * 0.8, 1.5, -3.0, g);
    g.traverse((o) => { if (o.isMesh) o.receiveShadow = true; });
    this.group.add(g);
    // approximate collision (axis-aligned bounds of the rotated footprint)
    const c = Math.abs(Math.cos(rotY)), s = Math.abs(Math.sin(rotY));
    const hw = 1.6 * c + 3.3 * s, hd = 1.6 * s + 3.3 * c;
    this.world.add({ minX: x - hw, minY: 0, minZ: z - hd, maxX: x + hw, maxY: 5.5, maxZ: z + hd });
  }

  statue(x, z, rotY = 0, h = 6) {
    // Anubis-like guardian holding a staff
    const M = this.M;
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = rotY;
    const k = h / 6;
    part(box(2 * k, 0.8 * k, 2 * k), M.sandstoneDark, 0, 0.4 * k, 0, g);
    part(box(0.9 * k, 2 * k, 0.6 * k), M.sandstone, 0, 1.8 * k, 0, g);
    part(box(1.3 * k, 1.8 * k, 0.8 * k), M.sandstone, 0, 3.7 * k, 0, g);
    part(box(1.6 * k, 0.35 * k, 0.9 * k), M.gold, 0, 4.5 * k, 0, g);
    part(box(0.6 * k, 0.8 * k, 0.9 * k), M.basalt, 0, 5.1 * k, -0.1 * k, g);
    part(box(0.35 * k, 0.3 * k, 0.6 * k), M.basalt, 0, 5.0 * k, -0.7 * k, g);
    for (const s of [-1, 1]) {
      const ear = part(cone(0.15 * k, 0.6 * k, 4), M.basalt, s * 0.2 * k, 5.7 * k, 0, g);
      ear.rotation.z = -s * 0.15;
    }
    part(cyl(0.08 * k, 0.08 * k, 5.5 * k, 6), M.gold, 0.9 * k, 3 * k, -0.4 * k, g);
    g.traverse((o) => { if (o.isMesh) o.receiveShadow = true; });
    this.group.add(g);
    this.world.add({ minX: x - k, minY: 0, minZ: z - k, maxX: x + k, maxY: h, maxZ: z + k });
  }

  // Torch/brazier with flickering flame; a limited number get real lights.
  brazier(x, z, y = 0, withLight = true) {
    const M = this.M;
    if (y === 0) {
      part(cyl(0.15, 0.25, 1.4, 8), M.darkmetal, x, 0.7, z, this.group);
      this.world.add({ minX: x - 0.35, minY: 0, minZ: z - 0.35, maxX: x + 0.35, maxY: 1.6, maxZ: z + 0.35 });
    }
    const top = y === 0 ? 1.4 : y;
    part(cyl(0.45, 0.2, 0.35, 10), M.gold, x, top + 0.15, z, this.group);
    const mat = new THREE.SpriteMaterial({ map: M._sprites.flame, color: 0xffffff, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
    const fl = new THREE.Sprite(mat); fl.position.set(x, top + 0.8, z); fl.scale.set(1.1, 1.6, 1);
    this.group.add(fl);
    let light = null;
    if (withLight && this.lightBudget > 0) {
      this.lightBudget--;
      light = new THREE.PointLight(0xff9944, 18, 16, 1.5);
      light.position.set(x, top + 1.1, z);
      this.group.add(light);
    }
    this.torches.push({ sprite: fl, light, phase: this.rng() * 10, base: 18 });
  }

  // Distant pyramids / dunes / mountains to sell the scale.
  scenery(opts = {}) {
    const M = this.M;
    const rng = mulberry32(99);
    const pyrs = opts.pyramids || [[-260, -420, 120], [180, -520, 90], [420, -200, 70], [-420, 150, 60]];
    for (const [x, z, s] of pyrs) {
      const g = new THREE.ConeGeometry(s, s * 0.85, 4, 1);
      g.rotateY(Math.PI / 4);
      const uv = g.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * s / 6, uv.getY(i) * s / 8);
      const p = new THREE.Mesh(g, opts.night ? M.basalt : M.sandstone);
      p.userData.noMerge = true;
      p.position.set(x, s * 0.425 - 1, z);
      this.group.add(p);
    }
    // dune ring
    const inner = 160, outer = 700, seg = 96, rings = 10;
    const pos = [], uvs = [], idx = [];
    for (let r = 0; r <= rings; r++) {
      const rad = inner + (outer - inner) * (r / rings);
      for (let s = 0; s <= seg; s++) {
        const a = (s / seg) * Math.PI * 2;
        const hgt = (Math.sin(a * 5 + r) * 0.5 + 0.5) * (r / rings) * 45 + rng() * 6 * (r / rings) + (r === 0 ? -2 : 0);
        pos.push(Math.cos(a) * rad, hgt, Math.sin(a) * rad);
        uvs.push(Math.cos(a) * rad / 12, Math.sin(a) * rad / 12);
      }
    }
    for (let r = 0; r < rings; r++) for (let s = 0; s < seg; s++) {
      const a = r * (seg + 1) + s, b = a + seg + 1;
      idx.push(a, a + 1, b, a + 1, b + 1, b);
    }
    const dg = new THREE.BufferGeometry();
    dg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    dg.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    dg.setIndex(idx); dg.computeVertexNormals();
    const dunes = new THREE.Mesh(dg, M.sand);
    dunes.userData.noMerge = true;
    dunes.receiveShadow = false;
    this.group.add(dunes);
    // ground plane
    const gg = new THREE.PlaneGeometry(1000, 1000).rotateX(-Math.PI / 2);
    const uv = gg.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 1000 / 12, uv.getY(i) * 1000 / 12);
    const ground = new THREE.Mesh(gg, M.sand);
    ground.userData.noMerge = true;
    ground.position.y = -0.03;
    ground.receiveShadow = true;
    this.group.add(ground);
  }

  pickup(kind, sub, x, z, y = 0) { this.pickups.push({ kind, sub, x, y, z }); }

  encounter(e) { this.encounters.push(e); }

  finish() {
    this.batch.build(this.group);
    this.mergeStatic();
    return this;
  }

  // Merge every static decoration mesh into one mesh per material: a level has
  // hundreds of pillar/statue/brazier parts and this cuts draw calls massively.
  mergeStatic() {
    this.group.updateMatrixWorld(true);
    const buckets = new Map();
    const remove = [];
    const keep = new Set(['position', 'normal', 'uv']);
    this.group.traverse((o) => {
      if (!o.isMesh || o.userData.noMerge || o.matrixAutoUpdate === false) return;
      for (let a = o; a && a !== this.group; a = a.parent) if (a.userData.dynamic) return;
      const mat = o.material;
      if (Array.isArray(mat) || mat.transparent) return;
      const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
      for (const k of Object.keys(g.attributes)) if (!keep.has(k)) g.deleteAttribute(k);
      if (!g.attributes.uv || !g.attributes.normal) return;
      g.morphAttributes = {};
      g.applyMatrix4(o.matrixWorld);
      if (!buckets.has(mat)) buckets.set(mat, []);
      buckets.get(mat).push(g);
      remove.push(o);
    });
    for (const o of remove) o.parent.remove(o);
    for (const [mat, list] of buckets) {
      const merged = mergeGeometries(list, false);
      for (const g of list) g.dispose();
      if (!merged) continue;
      const m = new THREE.Mesh(merged, mat);
      m.castShadow = true; m.receiveShadow = true;
      m.matrixAutoUpdate = false;
      this.group.add(m);
    }
  }
}
