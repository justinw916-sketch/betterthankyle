// Projectiles for both the player and enemies: rockets, grenades, laser bolts,
// cannonballs, fireballs, homing rockets etc.
import * as THREE from 'three';
import { getMaterials } from './textures.js';
import { raySphere, rand } from './util.js';

const TYPES = {
  rocket: { grav: 0, r: 0.2, life: 6, explode: true, trail: 'rocket', spriteColor: 0xffaa44, spriteSize: 0.8 },
  grenade: { grav: 20, r: 0.14, life: 2.3, bounce: 0.45, explode: true, fuseOnly: true, trail: 'smoke' },
  laser: { grav: 0, r: 0.14, life: 2, bolt: 0x33ff99, spriteColor: 0x33ffaa, spriteSize: 0.7 },
  cannonball: { grav: 14, r: 0.38, life: 3.8, bounce: 0.3, explode: true, pierce: true, fuseOnly: true },
  fireball: { grav: 0, r: 0.3, life: 5, spriteColor: 0xff7722, spriteSize: 1.1, trail: 'fire' },
  chain: { grav: 3, r: 0.25, life: 4, spriteColor: 0x99aaff, spriteSize: 0.7, ball: true, trail: 'spark' },
  bullet: { grav: 0, r: 0.12, life: 3, bolt: 0xffdd66, spriteColor: 0xffcc55, spriteSize: 0.35 },
  mrocket: { grav: 0, r: 0.3, life: 7, explode: true, homing: 1.3, trail: 'rocket', spriteColor: 0xff4422, spriteSize: 1.0 },
  magma: { grav: 12, r: 0.4, life: 5, explode: true, spriteColor: 0xff6611, spriteSize: 1.4, trail: 'fire' },
  bossfire: { grav: 0, r: 0.8, life: 7, explode: true, spriteColor: 0xff5511, spriteSize: 3.2, trail: 'fire' },
  spit: { grav: 4, r: 0.25, life: 4, spriteColor: 0xcc44ff, spriteSize: 0.8, trail: 'spit' },
};

export class Projectiles {
  constructor(game) {
    this.game = game;
    this.list = [];
    this.group = new THREE.Group();
    game.scene.add(this.group);
    const M = getMaterials();
    this.spriteMats = {};
    for (const [k, t] of Object.entries(TYPES)) {
      if (t.spriteColor) this.spriteMats[k] = new THREE.SpriteMaterial({ map: M._sprites.glow, color: t.spriteColor, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
    }
    this.geo = {
      rocket: new THREE.CylinderGeometry(0.07, 0.07, 0.6, 8).rotateX(Math.PI / 2),
      grenade: new THREE.SphereGeometry(0.13, 10, 8),
      cannon: new THREE.SphereGeometry(0.38, 16, 12),
      bolt: new THREE.CylinderGeometry(0.05, 0.05, 1.6, 6).rotateX(Math.PI / 2),
      ball: new THREE.SphereGeometry(0.22, 10, 8),
    };
    this.mat = {
      rocket: new THREE.MeshStandardMaterial({ color: 0x556644, metalness: 0.5, roughness: 0.4 }),
      grenade: new THREE.MeshStandardMaterial({ color: 0x334a2a, metalness: 0.4, roughness: 0.5 }),
      cannon: new THREE.MeshStandardMaterial({ color: 0x18181a, metalness: 0.7, roughness: 0.35 }),
      ball: new THREE.MeshStandardMaterial({ color: 0x777788, metalness: 0.8, roughness: 0.3 }),
    };
    this.boltMats = {};
  }

  clear() {
    for (const p of this.list) this.group.remove(p.obj);
    this.list.length = 0;
  }

  spawn(type, pos, vel, owner, opts = {}) {
    const t = TYPES[type];
    const obj = new THREE.Group();
    obj.position.set(pos.x, pos.y, pos.z);
    if (type === 'rocket' || type === 'mrocket') { const m = new THREE.Mesh(this.geo.rocket, this.mat.rocket); obj.add(m); }
    if (type === 'grenade') { const m = new THREE.Mesh(this.geo.grenade, this.mat.grenade); m.castShadow = true; obj.add(m); }
    if (type === 'cannonball') { const m = new THREE.Mesh(this.geo.cannon, this.mat.cannon); m.castShadow = true; obj.add(m); }
    if (t.ball) obj.add(new THREE.Mesh(this.geo.ball, this.mat.ball));
    if (t.bolt) {
      let bm = this.boltMats[type];
      if (!bm) bm = this.boltMats[type] = new THREE.MeshBasicMaterial({ color: new THREE.Color(t.bolt).multiplyScalar(3), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false });
      const m = new THREE.Mesh(this.geo.bolt, bm);
      if (type === 'bullet') m.scale.set(0.6, 0.6, 0.7);
      obj.add(m);
    }
    if (this.spriteMats[type]) {
      const s = new THREE.Sprite(this.spriteMats[type]);
      s.scale.setScalar(t.spriteSize);
      if (type === 'rocket' || type === 'mrocket') s.position.z = 0.4;
      obj.add(s);
    }
    this.group.add(obj);
    const p = {
      type, t, obj, owner,
      pos: obj.position, vel: new THREE.Vector3(vel.x, vel.y, vel.z),
      life: t.life, dmg: opts.dmg ?? 10, splash: opts.splash ?? 0, radius: opts.radius ?? 0,
      hit: new Set(), source: opts.source || null, speed: Math.hypot(vel.x, vel.y, vel.z), age: 0,
    };
    this.orient(p);
    this.list.push(p);
    return p;
  }

  orient(p) {
    if (p.vel.lengthSq() > 0.01) {
      const o = p.obj;
      o.lookAt(o.position.x - p.vel.x, o.position.y - p.vel.y, o.position.z - p.vel.z);
    }
  }

  // Drop all enemy projectiles (e.g. when the boss dies). Deferred to the next
  // update so it is safe to call from inside damage callbacks.
  clearEnemy() { this.pendingEnemyClear = true; }

  update(dt) {
    const game = this.game;
    const fx = game.effects;
    if (this.pendingEnemyClear) {
      this.pendingEnemyClear = false;
      for (let i = this.list.length - 1; i >= 0; i--) if (this.list[i].owner === 'enemy') this.remove(i);
    }
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      if (!p) continue; // list may shrink while callbacks run
      p.life -= dt; p.age += dt;
      if (p.life <= 0) { this.detonate(p, i); continue; }
      const t = p.t;
      // homing enemy rockets
      if (t.homing && p.owner === 'enemy') {
        const pl = game.player.pos;
        const tx = pl.x - p.pos.x, ty = pl.y + 1.2 - p.pos.y, tz = pl.z - p.pos.z;
        const l = Math.hypot(tx, ty, tz) || 1;
        const sp = p.speed;
        p.vel.x += (tx / l * sp - p.vel.x) * t.homing * dt;
        p.vel.y += (ty / l * sp - p.vel.y) * t.homing * dt;
        p.vel.z += (tz / l * sp - p.vel.z) * t.homing * dt;
      }
      p.vel.y -= t.grav * dt;
      const sx = p.vel.x * dt, sy = p.vel.y * dt, sz = p.vel.z * dt;
      const len = Math.hypot(sx, sy, sz);
      if (len < 1e-6) continue;
      const dx = sx / len, dy = sy / len, dz = sz / len;
      // --- entity hits ---
      let consumed = false;
      if (p.owner === 'player') {
        const hitE = game.enemies.rayHit(p.pos.x, p.pos.y, p.pos.z, dx, dy, dz, len + t.r, t.r, p.hit);
        if (hitE) {
          const e = hitE.enemy;
          if (p.type === 'cannonball') {
            p.hit.add(e);
            const before = e.hp;
            e.damage(p.dmg, { x: dx, y: dy, z: dz }, 'cannon');
            if (e.hp > 0 && before > p.dmg * 0.5) { p.pos.set(p.pos.x + dx * hitE.t, p.pos.y + dy * hitE.t, p.pos.z + dz * hitE.t); this.detonate(p, i); consumed = true; }
            else p.vel.multiplyScalar(0.92);
          } else if (p.type === 'grenade') {
            p.pos.set(p.pos.x + dx * hitE.t, p.pos.y + dy * hitE.t, p.pos.z + dz * hitE.t);
            e.damage(p.dmg * 0.5, { x: dx, y: dy, z: dz }, 'explosive');
            this.detonate(p, i); consumed = true;
          } else {
            p.pos.set(p.pos.x + dx * hitE.t, p.pos.y + dy * hitE.t, p.pos.z + dz * hitE.t);
            e.damage(p.dmg, { x: dx, y: dy, z: dz }, t.explode ? 'explosive' : 'energy');
            if (p.type === 'laser') { fx.sparks(p.pos.x, p.pos.y, p.pos.z, -dx, -dy, -dz, 6, [0.3, 1, 0.7]); fx.blood(p.pos.x, p.pos.y, p.pos.z, dx, 0.2, dz, 4, e.def.blood); }
            if (t.explode) this.detonate(p, i, e); else this.remove(i);
            consumed = true;
          }
        }
      } else {
        const pl = game.player;
        if (pl.alive) {
          // closest approach between segment and the player's vertical axis
          const hit = segCapsule(p.pos.x, p.pos.y, p.pos.z, sx, sy, sz, pl.pos.x, pl.pos.y + 0.2, pl.pos.z, pl.pos.y + 1.7, 0.45 + t.r);
          if (hit >= 0) {
            p.pos.set(p.pos.x + sx * hit, p.pos.y + sy * hit, p.pos.z + sz * hit);
            pl.damage(p.dmg, { x: p.pos.x - dx, z: p.pos.z - dz });
            if (t.explode) this.detonate(p, i, null, true);
            else { fx.sparks(p.pos.x, p.pos.y, p.pos.z, -dx, -dy, -dz, 5, [1, 0.5, 0.2]); this.remove(i); }
            consumed = true;
          }
        }
      }
      if (consumed) continue;
      // --- world hits ---
      const wh = game.world.raycast(p.pos.x, p.pos.y, p.pos.z, dx, dy, dz, len + t.r);
      if (wh) {
        const hx = p.pos.x + dx * (wh.t - t.r * 0.5), hy = p.pos.y + dy * (wh.t - t.r * 0.5), hz = p.pos.z + dz * (wh.t - t.r * 0.5);
        if (t.bounce) {
          p.pos.set(hx, Math.max(hy, t.r * 0.5), hz);
          const vn = p.vel.x * wh.nx + p.vel.y * wh.ny + p.vel.z * wh.nz;
          p.vel.x -= (1 + t.bounce) * vn * wh.nx; p.vel.y -= (1 + t.bounce) * vn * wh.ny; p.vel.z -= (1 + t.bounce) * vn * wh.nz;
          if (wh.ny > 0.5) { p.vel.x *= 0.8; p.vel.z *= 0.8; if (Math.abs(p.vel.y) < 2) p.vel.y = 0; }
          if (Math.abs(vn) > 3) game.audio.play('bounce', { pos: p.pos, vol: p.type === 'cannonball' ? 1 : 0.6, rate: p.type === 'cannonball' ? 0.5 : 1 });
          if (p.type === 'cannonball' && Math.abs(vn) > 5) { fx.dust(hx, hy, hz, wh.nx, wh.ny, wh.nz, 8); fx.addShake(0.08); }
        } else {
          p.pos.set(hx, hy, hz);
          if (t.explode) { this.detonate(p, i); continue; }
          const col = p.type === 'laser' ? [0.3, 1, 0.7] : p.type === 'spit' ? [0.8, 0.3, 1] : [1, 0.6, 0.2];
          fx.sparks(hx, hy, hz, wh.nx, wh.ny, wh.nz, 8, col);
          if (p.type === 'fireball') fx.explosion(hx, hy, hz, 0.25);
          this.remove(i);
          continue;
        }
      } else {
        p.pos.x += sx; p.pos.y += sy; p.pos.z += sz;
      }
      if (p.type === 'cannonball') {
        p.obj.children[0].rotation.x -= len / t.r;
        // make the ball "roll" along the ground
        if (p.pos.y <= t.r + 0.05) { p.pos.y = Math.max(p.pos.y, t.r * 0.9); }
      } else if (!t.bounce) this.orient(p);
      if (p.type === 'grenade') p.obj.rotation.x += dt * 10;
      this.trail(p, dt);
    }
  }

  trail(p, dt) {
    const fx = this.game.effects;
    const x = p.pos.x, y = p.pos.y, z = p.pos.z;
    switch (p.t.trail) {
      case 'rocket':
        fx.alpha.spawn(x, y, z, rand(-0.3, 0.3), rand(0, 0.5), rand(-0.3, 0.3), rand(0.8, 1.4), 0.25, 1.4, 0.8, 0.8, 0.8, 0.5, 0.5, 0.5, 0.45, -0.3, 1);
        fx.add.spawn(x, y, z, 0, 0, 0, 0.1, 0.5, 0.2, 3, 1.8, 0.6, 1, 0.2, 0, 1, 0, 0);
        break;
      case 'smoke':
        if (Math.random() < 0.5) fx.alpha.spawn(x, y, z, 0, 0.3, 0, 0.6, 0.12, 0.5, 0.7, 0.7, 0.7, 0.5, 0.5, 0.5, 0.35, -0.2, 1);
        break;
      case 'fire':
        fx.add.spawn(x + rand(-0.1, 0.1), y, z + rand(-0.1, 0.1), rand(-0.5, 0.5), rand(0, 1), rand(-0.5, 0.5), 0.35, p.t.spriteSize * 0.6, 0.1, 3, 1.2, 0.3, 1, 0.1, 0, 1, -1, 1);
        break;
      case 'spark':
        if (Math.random() < 0.5) fx.add.spawn(x, y, z, rand(-1, 1), rand(-1, 1), rand(-1, 1), 0.3, 0.15, 0.02, 1, 1.5, 3, 0.2, 0.3, 1, 1, 0, 1);
        break;
      case 'spit':
        fx.add.spawn(x, y, z, 0, 0, 0, 0.3, 0.4, 0.1, 1.5, 0.4, 2, 0.4, 0, 0.6, 1, 0, 0);
        break;
    }
    void dt;
  }

  detonate(p, i, directHit = null, hitPlayer = false) {
    const game = this.game;
    if (this.list[i] !== p) { i = this.list.indexOf(p); if (i < 0) return; }
    this.remove(i);
    if (p.t.explode) {
      const big = p.type === 'cannonball' || p.type === 'bossfire';
      const sc = p.type === 'cannonball' ? 1.6 : p.type === 'bossfire' ? 1.4 : p.type === 'mrocket' ? 0.8 : 1;
      game.explode(p.pos.x, p.pos.y, p.pos.z, p.radius || (p.owner === 'enemy' ? 3.5 : 5), p.splash || p.dmg * 0.6, p.owner, sc, directHit, hitPlayer);
      game.audio.play(big ? 'bigexplosion' : 'explosion', { pos: p.pos, range: 40, group: 'boom', maxVoices: 8 });
    }
  }

  remove(i) {
    const p = this.list[i];
    if (!p) return;
    this.group.remove(p.obj);
    this.list[i] = this.list[this.list.length - 1];
    this.list.pop();
  }
}

// Segment (origin o, delta s) vs vertical capsule at (cx, cz) from y0..y1 with radius r.
// Returns the segment parameter [0..1] of first contact, or -1.
function segCapsule(ox, oy, oz, sx, sy, sz, cx, y0, cz, y1, r) {
  // sample a few points: segments are short thanks to per-frame integration
  const n = Math.max(1, Math.ceil(Math.hypot(sx, sy, sz) / (r * 0.8)));
  for (let k = 1; k <= n; k++) {
    const t = k / n;
    const x = ox + sx * t, y = oy + sy * t, z = oz + sz * t;
    const yy = Math.max(y0, Math.min(y1, y));
    const dx = x - cx, dy = y - yy, dz = z - cz;
    if (dx * dx + dy * dy + dz * dz < r * r) return t;
  }
  return -1;
}
export { raySphere };
