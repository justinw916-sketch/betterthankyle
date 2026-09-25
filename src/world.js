// Static world: axis-aligned solid boxes with a spatial hash for fast collision,
// ground-height queries and ray casts. Also builds merged render geometry.
import * as THREE from 'three';

const CELL = 6;

export class World {
  constructor() {
    this.boxes = [];
    this.grid = new Map();
    this.stamp = 0;
    this.bounds = { minX: -500, maxX: 500, minZ: -500, maxZ: 500 };
    this.floor = 0; // base ground plane height; -Infinity for void (floating-island) levels
  }

  // box: {minX,minY,minZ,maxX,maxY,maxZ, active=true, tag}
  add(box) {
    box.active = box.active !== false;
    box._s = 0;
    this.boxes.push(box);
    const x0 = Math.floor(box.minX / CELL), x1 = Math.floor(box.maxX / CELL);
    const z0 = Math.floor(box.minZ / CELL), z1 = Math.floor(box.maxZ / CELL);
    for (let x = x0; x <= x1; x++) {
      for (let z = z0; z <= z1; z++) {
        const k = x * 100003 + z;
        let arr = this.grid.get(k);
        if (!arr) { arr = []; this.grid.set(k, arr); }
        arr.push(box);
      }
    }
    return box;
  }

  // Calls cb for each active box overlapping the XZ rectangle (deduplicated).
  query(minX, minZ, maxX, maxZ, cb) {
    const s = ++this.stamp;
    const x0 = Math.floor(minX / CELL), x1 = Math.floor(maxX / CELL);
    const z0 = Math.floor(minZ / CELL), z1 = Math.floor(maxZ / CELL);
    for (let x = x0; x <= x1; x++) {
      for (let z = z0; z <= z1; z++) {
        const arr = this.grid.get(x * 100003 + z);
        if (!arr) continue;
        for (let i = 0; i < arr.length; i++) {
          const b = arr[i];
          if (b._s === s || !b.active) continue;
          b._s = s;
          cb(b);
        }
      }
    }
  }

  // Highest walkable surface under a circle whose top is <= feetY + step.
  groundHeight(x, z, r, feetY, step = 0.65) {
    let g = this.floor === -Infinity ? -1e4 : this.floor;
    this.query(x - r, z - r, x + r, z + r, (b) => {
      if (b.maxY > feetY + step || b.maxY <= g) return;
      if (circleRect(x, z, r * 0.7, b)) g = b.maxY;
    });
    return g;
  }

  // Push a vertical cylinder out of solid boxes. Mutates pos. Returns true if hit.
  collide(pos, r, h, step = 0.65) {
    let hit = false;
    this.query(pos.x - r, pos.z - r, pos.x + r, pos.z + r, (b) => {
      if (b.maxY <= pos.y + step || b.minY >= pos.y + h) return;
      // closest point on rect to circle centre
      const cx = Math.max(b.minX, Math.min(pos.x, b.maxX));
      const cz = Math.max(b.minZ, Math.min(pos.z, b.maxZ));
      let dx = pos.x - cx, dz = pos.z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 >= r * r) return;
      hit = true;
      if (d2 > 1e-8) {
        const d = Math.sqrt(d2);
        pos.x = cx + (dx / d) * r;
        pos.z = cz + (dz / d) * r;
      } else {
        // centre inside the box: push out along the shallowest axis
        const pl = pos.x - b.minX, pr = b.maxX - pos.x, pb = pos.z - b.minZ, pf = b.maxZ - pos.z;
        const m = Math.min(pl, pr, pb, pf);
        if (m === pl) pos.x = b.minX - r; else if (m === pr) pos.x = b.maxX + r;
        else if (m === pb) pos.z = b.minZ - r; else pos.z = b.maxZ + r;
      }
    });
    return hit;
  }

  // Lowest box bottom above headY overlapping the circle (for ceilings), or Infinity.
  ceiling(x, z, r, y) {
    let c = Infinity;
    this.query(x - r, z - r, x + r, z + r, (b) => {
      if (b.minY >= y && b.minY < c && circleRect(x, z, r * 0.7, b)) c = b.minY;
    });
    return c;
  }

  // Ray cast against boxes and the ground plane (y=0). Returns {t, nx, ny, nz} or null.
  raycast(ox, oy, oz, dx, dy, dz, maxT) {
    let best = maxT, nx = 0, ny = 0, nz = 0, found = false;
    if (dy < -1e-6 && this.floor !== -Infinity) {
      const t = (this.floor - oy) / dy;
      if (t >= 0 && t < best) { best = t; nx = 0; ny = 1; nz = 0; found = true; }
    }
    // Broad phase: walk the grid cells the ray passes through in XZ.
    const s = ++this.stamp;
    const test = (b) => {
      if (b._s === s || !b.active) return;
      b._s = s;
      const r = rayBox(ox, oy, oz, dx, dy, dz, b, best);
      if (r) { best = r.t; nx = r.nx; ny = r.ny; nz = r.nz; found = true; }
    };
    const endT = Math.min(best, maxT);
    let cx = Math.floor(ox / CELL), cz = Math.floor(oz / CELL);
    const ex = Math.floor((ox + dx * endT) / CELL), ez = Math.floor((oz + dz * endT) / CELL);
    const stepX = dx > 0 ? 1 : -1, stepZ = dz > 0 ? 1 : -1;
    const tdx = Math.abs(dx) > 1e-9 ? CELL / Math.abs(dx) : Infinity;
    const tdz = Math.abs(dz) > 1e-9 ? CELL / Math.abs(dz) : Infinity;
    let tmx = Math.abs(dx) > 1e-9 ? ((dx > 0 ? (cx + 1) * CELL - ox : ox - cx * CELL) / Math.abs(dx)) : Infinity;
    let tmz = Math.abs(dz) > 1e-9 ? ((dz > 0 ? (cz + 1) * CELL - oz : oz - cz * CELL) / Math.abs(dz)) : Infinity;
    for (let guard = 0; guard < 400; guard++) {
      const arr = this.grid.get(cx * 100003 + cz);
      if (arr) for (let i = 0; i < arr.length; i++) test(arr[i]);
      if (cx === ex && cz === ez) break;
      const tNext = Math.min(tmx, tmz);
      if (tNext > best) break;
      if (tmx < tmz) { tmx += tdx; cx += stepX; } else { tmz += tdz; cz += stepZ; }
    }
    return found ? { t: best, nx, ny, nz } : null;
  }

  // True if a segment between two points is unobstructed.
  lineOfSight(ax, ay, az, bx, by, bz) {
    const dx = bx - ax, dy = by - ay, dz = bz - az;
    const len = Math.hypot(dx, dy, dz);
    if (len < 1e-4) return true;
    const hit = this.raycast(ax, ay, az, dx / len, dy / len, dz / len, len);
    return !hit || hit.t >= len - 0.05;
  }
}

export function circleRect(x, z, r, b) {
  const cx = Math.max(b.minX, Math.min(x, b.maxX));
  const cz = Math.max(b.minZ, Math.min(z, b.maxZ));
  const dx = x - cx, dz = z - cz;
  return dx * dx + dz * dz < r * r || (x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ);
}

// Slab test. Returns {t,nx,ny,nz} for entry point if < maxT.
export function rayBox(ox, oy, oz, dx, dy, dz, b, maxT) {
  let tmin = -Infinity, tmax = Infinity, axis = -1, sign = 0;
  const o = [ox, oy, oz], d = [dx, dy, dz];
  const mn = [b.minX, b.minY, b.minZ], mx = [b.maxX, b.maxY, b.maxZ];
  for (let i = 0; i < 3; i++) {
    if (Math.abs(d[i]) < 1e-9) {
      if (o[i] < mn[i] || o[i] > mx[i]) return null;
    } else {
      let t1 = (mn[i] - o[i]) / d[i], t2 = (mx[i] - o[i]) / d[i];
      let s = -1;
      if (t1 > t2) { const t = t1; t1 = t2; t2 = t; s = 1; }
      if (t1 > tmin) { tmin = t1; axis = i; sign = s; }
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) return null;
    }
  }
  if (tmax < 0 || tmin > maxT) return null;
  if (tmin < 0) return null; // origin inside box: ignore (lets shots escape)
  const n = [0, 0, 0];
  n[axis] = sign;
  return { t: tmin, nx: n[0], ny: n[1], nz: n[2] };
}

// ---------------------------------------------------------------------------
// Geometry: boxes with world-space UVs so textures tile seamlessly, merged per material.
export class GeometryBatcher {
  constructor() { this.batches = new Map(); }

  addBox(mat, minX, minY, minZ, maxX, maxY, maxZ, uvScale = 4) {
    let b = this.batches.get(mat);
    if (!b) { b = { pos: [], nrm: [], uv: [], idx: [] }; this.batches.set(mat, b); }
    appendBox(b, minX, minY, minZ, maxX, maxY, maxZ, uvScale);
  }

  build(group, { castShadow = true, receiveShadow = true } = {}) {
    for (const [mat, b] of this.batches) {
      const mesh = new THREE.Mesh(toGeometry(b), mat);
      mesh.castShadow = castShadow; mesh.receiveShadow = receiveShadow;
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      group.add(mesh);
    }
    this.batches.clear();
  }
}

export function toGeometry(b) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(b.nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2));
  g.setIndex(b.idx);
  g.computeBoundingSphere();
  return g;
}

export function appendBox(b, x0, y0, z0, x1, y1, z1, s) {
  const faces = [
    // normal, 4 corners (counter-clockwise seen from outside), uv axes
    [[1, 0, 0], [[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]], 'zy', -1],
    [[-1, 0, 0], [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], 'zy', 1],
    [[0, 1, 0], [[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]], 'xz', 1],
    [[0, -1, 0], [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], 'xz', 1],
    [[0, 0, 1], [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], 'xy', 1],
    [[0, 0, -1], [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]], 'xy', -1],
  ];
  for (const [n, verts, ax, flip] of faces) {
    const base = b.pos.length / 3;
    for (const v of verts) {
      b.pos.push(v[0], v[1], v[2]);
      b.nrm.push(n[0], n[1], n[2]);
      let u, w;
      if (ax === 'zy') { u = v[2] * flip; w = v[1]; }
      else if (ax === 'xz') { u = v[0]; w = -v[2]; }
      else { u = v[0] * flip; w = v[1]; }
      b.uv.push(u / s, w / s);
    }
    b.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
}
