// Enemy roster, AI behaviours and procedural animation.
import * as THREE from 'three';
import { makeEnemyModel } from './models.js';
import { rand, clamp, wrapAngle, raySphere, pick } from './util.js';

// spheres: [yOffset, radius, forwardOffset]
export const ENEMY_DEFS = {
  kamikaze: { name: 'Headless Kamikaze', hp: 10, speed: 9.5, r: 0.45, h: 1.9, score: 10, spheres: [[1.25, 0.4], [0.6, 0.36]], blood: [0.55, 0.02, 0.02], gib: ['flesh', 'bone'], pain: 'grunt' },
  gunner: { name: 'Headless Rocketeer', hp: 25, speed: 4.2, r: 0.45, h: 1.9, score: 20, spheres: [[1.25, 0.4], [0.6, 0.36]], blood: [0.55, 0.02, 0.02], gib: ['flesh', 'bone'], pain: 'grunt' },
  gnasher: { name: 'One-Eyed Gnasher', hp: 40, speed: 7.5, r: 0.75, h: 1.8, score: 15, spheres: [[1.05, 0.78]], blood: [0.5, 0.05, 0.02], gib: ['fur', 'flesh'], pain: 'gnasher' },
  skeleton: { name: 'Horned Skeleton', hp: 90, speed: 9, r: 0.5, h: 2.4, score: 50, spheres: [[1.55, 0.42], [2.15, 0.26], [0.75, 0.32]], blood: [0.85, 0.8, 0.7], gib: ['bone'], pain: 'skeleton', bloodless: true },
  bull: { name: 'Horned Bull', hp: 220, speed: 16, r: 1.1, h: 2.4, score: 100, spheres: [[1.45, 0.8, -0.6], [1.45, 0.8, 0.6], [1.55, 0.55, -1.5]], blood: [0.5, 0.02, 0.02], gib: ['flesh', 'fur', 'bone'], pain: 'bullroar' },
  arachnid: { name: 'Arachnid Soldier', hp: 500, speed: 3.2, r: 1.6, h: 3.3, score: 250, spheres: [[1.4, 0.95, 0.6], [1.4, 0.8, 1.4], [2.3, 0.62, -0.6], [3.0, 0.35, -0.6]], blood: [0.3, 0.6, 0.1], gib: ['green', 'flesh'], pain: 'mech' },
  harpy: { name: 'Winged Harpy', hp: 40, speed: 10, r: 0.6, h: 1.2, score: 30, fly: true, spheres: [[0.1, 0.55]], blood: [0.55, 0.02, 0.02], gib: ['flesh'], pain: 'harpy' },
  golem: { name: 'Lava Golem', hp: 380, speed: 3.6, r: 1.25, h: 3.4, score: 180, spheres: [[2.2, 1.2], [3.2, 0.55], [1.0, 0.7]], blood: [1, 0.4, 0.1], gib: ['stone', 'stone'], pain: 'mech', bloodless: true },
  golemling: { name: 'Golemling', model: 'golem', hp: 60, speed: 7, r: 0.65, h: 1.7, scale: 0.5, score: 30, spheres: [[1.1, 0.6], [1.6, 0.28]], blood: [1, 0.4, 0.1], gib: ['stone'], pain: 'skeleton', bloodless: true },
  biomech: { name: 'Biomechanoid', hp: 700, speed: 2.8, r: 1.3, h: 4.6, score: 400, spheres: [[3.4, 1.0], [2.4, 0.9], [1.2, 0.65]], blood: [0.3, 0.3, 0.35], gib: ['metal', 'flesh'], pain: 'mech', bloodless: true },
  ra: { name: 'Ra, the Sun Colossus', model: 'boss', variant: 'ra', hp: 22000, speed: 4.6, r: 5.2, h: 22, scale: 1.6, score: 20000, spheres: [[9, 2.6], [12.3, 1.5], [6.2, 2.4], [3.5, 1.6]], blood: [1, 0.8, 0.3], gib: ['stone', 'metal'], pain: 'mech', bloodless: true, boss: true },
  boss: { name: 'The Colossus', hp: 14000, speed: 4.2, r: 5.2, h: 22, scale: 1.6, score: 10000, spheres: [[9, 2.6], [12.3, 1.5], [6.2, 2.4], [3.5, 1.6]], blood: [0.7, 0.6, 0.45], gib: ['stone'], pain: 'mech', bloodless: true, boss: true },
};

const FLASH = new THREE.MeshBasicMaterial({ color: 0xffd0c0 });

class Enemy {
  constructor(mgr, type, x, y, z, opts) {
    this.mgr = mgr; this.game = mgr.game;
    this.type = type;
    this.def = ENEMY_DEFS[type];
    const model = makeEnemyModel(ENEMY_DEFS[type].model || type, ENEMY_DEFS[type].variant);
    this.root = model.root; this.rig = model.rig;
    this.root.position.set(x, y, z);
    this.pos = this.root.position;
    this.vel = new THREE.Vector3();
    this.yaw = opts.yaw ?? Math.atan2(-(this.game.player.pos.x - x), -(this.game.player.pos.z - z));
    this.maxHp = this.def.hp * this.game.difficulty.hp;
    this.hp = this.maxHp;
    this.alive = true;
    this.encounter = opts.encounter || null;
    this.bounds = opts.bounds || null;
    this.floorY = opts.floorY || 0; // [minX, minZ, maxX, maxZ] enemies may never leave
    this.onGround = !this.def.fly;
    this.phase = rand(0, 10);
    this.t = 0;
    this.attackT = rand(1, 2.5);
    this.painT = 0;
    this.deadT = 0;
    this.spawnT = 0.35;
    this.state = 'chase';
    this.stateT = 0;
    this.strafe = Math.random() < 0.5 ? -1 : 1;
    this.screamT = rand(0, 1.5);
    this.soundT = rand(1, 4);
    this.animSpeed = 0;
    this.blockedT = 0; this.avoid = 0;
    this.meleeT = 0;
    this.burst = 0; this.burstT = 0;
    this.alt = rand(5, 8);
    this.summonCount = 0;
    this.meshes = [];
    this.root.traverse((o) => {
      if (!o.isMesh) return;
      // only the larger parts cast shadows: halves the shadow-pass draw calls in big hordes
      if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
      o.castShadow = o.geometry.boundingSphere.radius > 0.24;
      this.meshes.push(o); o.userData.mat = o.material;
    });
    this.flashT = 0;
    this.root.rotation.y = this.yaw;
    this.root.scale.setScalar(0.01);
    if (this.def.fly) this.pos.y = y + this.alt;
  }

  get fwdX() { return -Math.sin(this.yaw); }
  get fwdZ() { return -Math.cos(this.yaw); }

  // world-space hit spheres
  spheres(out) {
    const s = this.root.scale.x;
    for (const [y, r, f = 0] of this.def.spheres) {
      out.push(this.pos.x + this.fwdX * f * s, this.pos.y + y * s, this.pos.z + this.fwdZ * f * s, r * s);
    }
    return out;
  }

  // brief bright flash so every hit reads clearly
  hitFlash() {
    if (this.flashT <= 0) for (const m of this.meshes) if (!m.material.isMeshBasicMaterial || m.material === FLASH) m.material = FLASH;
    this.flashT = 0.06;
  }

  damage(amount, dir, kind = 'bullet') {
    if (!this.alive) return;
    this.hp -= amount;
    if (!this.def.boss || amount >= 60) this.hitFlash();
    this.mgr.onHit(this);
    if (this.hp <= 0) { this.die(kind, amount); return; }
    if (this.def.hp < 150 && amount >= 8) this.painT = Math.max(this.painT, this.def.boss ? 0 : 0.18);
    if (this.soundT < 3 && Math.random() < 0.35) {
      this.game.audio.play(this.def.pain, { pos: this.pos, vol: 0.7, group: 'pain', maxVoices: 3 });
      this.soundT = 4;
    }
    // knock small enemies back a little
    if (dir && this.def.hp < 100) {
      const k = Math.min(6, amount * 0.15);
      this.vel.x += dir.x * k; this.vel.z += dir.z * k;
    }
  }

  die(kind, amount) {
    if (!this.alive) return;
    this.alive = false;
    this.hp = 0;
    const game = this.game, fx = game.effects;
    const p = this.pos;
    const selfDestruct = kind === 'self';
    const explosive = kind === 'explosive' || kind === 'cannon';
    const overkill = amount > this.maxHp * 0.9 || -this.hp > this.maxHp;
    const gib = this.def.boss ? false : (this.type === 'kamikaze' || (explosive && this.def.hp < 300) || (overkill && this.def.hp < 150 && amount > 30) || kind === 'cannon');
    if (this.type === 'kamikaze') {
      // detonates regardless of how it died
      game.explode(p.x, p.y + 1, p.z, 4.2, 40, selfDestruct ? 'enemy' : 'kamikaze', 1);
      game.audio.play('explosion', { pos: p, range: 40, group: 'boom', maxVoices: 8 });
    }
    if (this.def.boss) {
      this.state = 'dying'; this.deadT = 0;
      game.onBossDeath(this);
    } else if (gib) {
      const h = this.def.h * 0.5;
      fx.gibs(p.x, p.y + h, p.z, Math.min(14, 5 + Math.floor(this.def.hp / 25)), this.def.gib, explosive ? 10 : 7, !this.def.bloodless);
      if (!this.def.bloodless) { fx.blood(p.x, p.y + h, p.z, 0, 1, 0, 30, this.def.blood); fx.decal(p.x, p.z, 1.5 + this.def.r, game.world.groundHeight(p.x, p.z, 0.2, p.y + 1) + 0.02); }
      else fx.dust(p.x, p.y + h, p.z, 0, 1, 0, 14, this.def.blood);
      game.audio.play('gib', { pos: p });
      this.remove = true;
    } else {
      game.audio.play(this.def.hp > 200 ? 'mech' : 'death', { pos: p, vol: 0.8, rate: this.def.hp > 200 ? 0.7 : 1.3, group: 'death', maxVoices: 3 });
      if (!this.def.bloodless) fx.decal(p.x, p.z, 1 + this.def.r, game.world.groundHeight(p.x, p.z, 0.2, p.y + 1) + 0.02);
      if (this.type === 'biomech' || this.type === 'arachnid' || this.type === 'golem') {
        fx.explosion(p.x, p.y + this.def.h * 0.6, p.z, 1.2, this.type === 'golem' ? [1, 0.35, 0.05] : null);
        game.audio.play('explosion', { pos: p, range: 40 });
      }
      this.state = 'dead'; this.deadT = 0;
    }
    this.mgr.onDeath(this, selfDestruct);
    // a slain golem crumbles into three smaller golemlings
    if (this.type === 'golem') {
      fx.gibs(p.x, p.y + 2, p.z, 8, ['stone'], 8, false);
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2 + Math.random();
        const c = this.mgr.spawnSafe('golemling', p.x + Math.cos(a) * 2, p.z + Math.sin(a) * 2, 2, { encounter: this.encounter, bounds: this.bounds, floorY: this.floorY, silent: true });
        if (c) { c.summoned = true; c.vel.set(Math.cos(a) * 6, 6, Math.sin(a) * 6); c.onGround = false; c.spawnT = 0.01; }
      }
    }
  }

  update(dt) {
    const game = this.game;
    this.t += dt;
    if (this.flashT > 0) {
      this.flashT -= dt;
      if (this.flashT <= 0) for (const m of this.meshes) m.material = m.userData.mat;
    }
    if (this.spawnT > 0) {
      this.spawnT -= dt;
      this.root.scale.setScalar(this.def.boss ? this.def.scale : clamp(1 - this.spawnT / 0.35, 0.01, 1) * (this.def.scale || 1));
      if (this.spawnT > 0) return;
      this.root.scale.setScalar(this.def.scale || 1);
    }
    if (!this.alive) return this.updateDead(dt);
    const pl = game.player;
    const dx = pl.pos.x - this.pos.x, dz = pl.pos.z - this.pos.z;
    const dist = Math.hypot(dx, dz);
    const toYaw = Math.atan2(-dx, -dz);
    this.painT = Math.max(0, this.painT - dt);
    this.soundT -= dt;
    this.meleeT -= dt;
    let mx = 0, mz = 0, speed = this.def.speed, face = toYaw, turn = 8;
    const toX = dist > 0 ? dx / dist : 0, toZ = dist > 0 ? dz / dist : 0;
    const plAlive = pl.alive;

    switch (this.type) {
      case 'kamikaze': {
        mx = toX; mz = toZ;
        this.screamT -= dt;
        if (this.screamT <= 0 && dist < 70) {
          game.audio.play('scream' + Math.floor(Math.random() * 3), { pos: this.pos, group: 'scream', maxVoices: 4, range: 22 });
          this.screamT = rand(1.4, 2.2);
        }
        if (plAlive && dist < 1.7 && Math.abs(pl.pos.y - this.pos.y) < 2) this.die('self', 0);
        if (this.rig.fuses) for (const f of this.rig.fuses) f.scale.setScalar(0.6 + Math.random() * 1.2);
        break;
      }
      case 'gunner': {
        this.stateT -= dt;
        if (this.stateT <= 0) { this.strafe = -this.strafe; this.stateT = rand(1.2, 2.8); }
        if (dist > 22) { mx = toX; mz = toZ; }
        else if (dist < 9) { mx = -toX; mz = -toZ; speed *= 0.8; }
        else { mx = -toZ * this.strafe; mz = toX * this.strafe; speed *= 0.7; }
        this.attackT -= dt;
        if (this.attackT <= 0 && plAlive && dist < 55) {
          this.attackT = rand(1.6, 2.8);
          const m = this.muzzle(0.7, 1.45, 0.3);
          if (game.world.lineOfSight(m.x, m.y, m.z, pl.pos.x, pl.pos.y + 1.4, pl.pos.z)) {
            this.shoot('fireball', m, 17, 9);
            this.fireAnim = 0.3;
          }
        }
        break;
      }
      case 'gnasher': {
        mx = toX; mz = toZ;
        if (this.soundT <= 0 && dist < 30) { game.audio.play('gnasher', { pos: this.pos, vol: 0.5, group: 'gnasher', maxVoices: 2 }); this.soundT = rand(3, 6); }
        if (plAlive && dist < this.def.r + 1.3 && this.meleeT <= 0) {
          this.meleeT = 0.9; this.biteT = 0.3;
          pl.damage(10, this.pos);
          game.audio.play('splat', { pos: this.pos });
        }
        if (dist < this.def.r + 0.8) speed = 0;
        break;
      }
      case 'skeleton': {
        mx = toX; mz = toZ;
        this.attackT -= dt;
        if (this.onGround && dist > 7 && dist < 22 && Math.random() < dt * 0.6) {
          this.vel.y = 8.5; this.vel.x += toX * 6; this.vel.z += toZ * 6; this.onGround = false;
          game.audio.play('skeleton', { pos: this.pos, vol: 0.6 });
        }
        if (this.attackT <= 0 && plAlive && dist > 5 && dist < 42) {
          this.attackT = rand(2.2, 3.4);
          const m = this.muzzle(0.4, 1.3, 0);
          if (game.world.lineOfSight(m.x, m.y, m.z, pl.pos.x, pl.pos.y + 1.4, pl.pos.z)) {
            for (const s of [-1, 1]) {
              const mm = { x: m.x - this.fwdZ * s * 0.3, y: m.y, z: m.z + this.fwdX * s * 0.3 };
              this.shoot('chain', mm, 22, 14, s * 0.05);
            }
            game.audio.play('chain', { pos: this.pos });
            this.fireAnim = 0.4;
          }
        }
        if (plAlive && dist < 2.2 && this.meleeT <= 0) { this.meleeT = 1.2; pl.damage(14, this.pos); this.fireAnim = 0.3; }
        if (dist < 1.6) speed = 0;
        break;
      }
      case 'bull': {
        this.stateT -= dt;
        if (this.state === 'chase' || this.state === 'turn') {
          // pick a charge target beyond the player
          if (this.state === 'chase' || this.stateT <= 0) {
            this.target = { x: pl.pos.x + toX * 12, z: pl.pos.z + toZ * 12 };
            this.state = 'charge'; this.stateT = 5;
            if (dist < 60) game.audio.play('bullroar', { pos: this.pos, vol: 0.8, group: 'bull', maxVoices: 2 });
          } else speed *= 0.2;
          face = toYaw; turn = 3;
          mx = toX; mz = toZ;
        }
        if (this.state === 'charge') {
          const tx = this.target.x - this.pos.x, tz = this.target.z - this.pos.z;
          const td = Math.hypot(tx, tz);
          // steer slowly toward the player while charging (hard to dodge late)
          const want = Math.atan2(-(tx), -(tz));
          face = want; turn = 1.6;
          mx = this.fwdX; mz = this.fwdZ;
          if (plAlive && dist < 2.6 && this.meleeT <= 0 && Math.abs(pl.pos.y - this.pos.y) < 2) {
            this.meleeT = 1.2;
            pl.damage(28, this.pos, 16);
            game.audio.play('land', { pos: this.pos, vol: 1 });
          }
          if (td < 3 || this.stateT <= 0 || this.blockedT > 0.3) { this.state = 'turn'; this.stateT = rand(0.6, 1.2); this.blockedT = 0; }
        }
        break;
      }
      case 'arachnid': {
        face = toYaw; turn = 1.5;
        if (dist > 26) { mx = toX; mz = toZ; } else speed = 0;
        this.attackT -= dt;
        if (this.burst > 0) {
          this.burstT -= dt;
          speed = 0;
          if (this.burstT <= 0) {
            this.burstT = 0.075; this.burst--;
            const gun = this.rig.guns[this.burst % 2];
            const m = gun.getWorldPosition(this._tmp || (this._tmp = new THREE.Vector3()));
            this.shoot('bullet', m, 42, 4, rand(-0.04, 0.04));
            game.audio.play('tommy', { pos: this.pos, vol: 0.6, rate: 0.8, group: 'arachnid', maxVoices: 3 });
          }
        } else if (this.attackT <= 0 && plAlive && dist < 65) {
          const m = this.muzzle(0.9, 2.3, 0);
          if (game.world.lineOfSight(m.x, m.y, m.z, pl.pos.x, pl.pos.y + 1.4, pl.pos.z)) { this.burst = 14; this.burstT = 0.3; }
          this.attackT = rand(3, 4.5);
        }
        if (plAlive && dist < 3.8 && this.meleeT <= 0) { this.meleeT = 1.5; pl.damage(22, this.pos, 10); this.stingT = 0.4; }
        break;
      }
      case 'harpy': {
        this.stateT -= dt;
        const tAlt = (this.state === 'dive' ? pl.pos.y + 1.4 : pl.pos.y + this.alt);
        if (this.state === 'chase') {
          // circle around the player
          const ang = Math.atan2(this.pos.z - pl.pos.z, this.pos.x - pl.pos.x) + this.strafe * 0.9;
          const rad = 12;
          const tx = pl.pos.x + Math.cos(ang) * rad - this.pos.x, tz = pl.pos.z + Math.sin(ang) * rad - this.pos.z;
          const l = Math.hypot(tx, tz) || 1; mx = tx / l; mz = tz / l;
          face = Math.atan2(-mx, -mz);
          if (this.stateT <= 0) {
            this.state = Math.random() < 0.55 ? 'dive' : 'chase';
            this.stateT = rand(2, 4);
            if (this.state === 'chase' && plAlive) {
              const m = this.muzzle(0.3, 0, 0);
              this.shoot('spit', m, 20, 7);
              game.audio.play('harpy', { pos: this.pos, vol: 0.7 });
            }
          }
        } else if (this.state === 'dive') {
          mx = toX; mz = toZ; speed *= 1.5;
          if (plAlive && dist < 1.6 && Math.abs(this.pos.y - (pl.pos.y + 1.4)) < 1.6 && this.meleeT <= 0) {
            this.meleeT = 1; pl.damage(12, this.pos);
            game.audio.play('harpy', { pos: this.pos });
            this.state = 'climb'; this.stateT = 1.5; this.alt = rand(5, 9);
          }
          if (this.stateT <= 0) { this.state = 'climb'; this.stateT = 1.2; }
        } else if (this.state === 'climb') {
          mx = -toX; mz = -toZ;
          if (this.stateT <= 0) { this.state = 'chase'; this.stateT = rand(2, 4); }
        }
        this.vel.y += ((this.state === 'climb' ? pl.pos.y + this.alt + 2 : tAlt) - this.pos.y) * dt * 3 - this.vel.y * dt * 2;
        break;
      }
      case 'golem': case 'golemling': {
        const big = this.type === 'golem';
        face = toYaw; turn = big ? 2 : 6;
        mx = toX; mz = toZ;
        this.attackT -= dt;
        // lob a glob of magma in a high arc
        if (big && this.attackT <= 0 && plAlive && dist > 8 && dist < 45) {
          this.attackT = rand(2.6, 3.6);
          const m = this.muzzle(0.6, 3.4, 1.2);
          const T = Math.max(0.8, dist / 16), G = 12;
          const tx = pl.pos.x + pl.vel.x * T * 0.5, tz = pl.pos.z + pl.vel.z * T * 0.5;
          game.projectiles.spawn('magma', m, { x: (tx - m.x) / T, y: (pl.pos.y + 1 - m.y + 0.5 * G * T * T) / T, z: (tz - m.z) / T }, 'enemy', { dmg: 18, splash: 14, radius: 3.5, source: this });
          game.audio.play('enemyfire', { pos: this.pos, rate: 0.7 });
          this.fireAnim = 0.5;
        }
        const reach = this.def.r + (big ? 1.8 : 1.0);
        if (plAlive && dist < reach && this.meleeT <= 0) {
          this.meleeT = big ? 1.6 : 0.9;
          pl.damage(big ? 24 : 9, this.pos, big ? 12 : 0);
          this.fireAnim = 0.4;
          if (big) { game.audio.play('stomp', { pos: this.pos }); game.effects.addShake(0.2); game.effects.dust(this.pos.x, this.pos.y + 0.2, this.pos.z, 0, 1, 0, 12); }
          else game.audio.play('splat', { pos: this.pos });
        }
        if (dist < reach - 0.4) speed = 0;
        if (big) {
          this.stepT = (this.stepT || 0) - dt * (Math.hypot(this.vel.x, this.vel.z) > 0.5 ? 1 : 0);
          if (this.stepT <= 0) { this.stepT = 0.8; game.audio.play('stomp', { pos: this.pos, vol: 0.35, range: 20 }); }
          if (Math.random() < dt * 6) game.effects.add.spawn(this.pos.x + rand(-0.8, 0.8), this.pos.y + rand(1, 3), this.pos.z + rand(-0.8, 0.8), 0, rand(0.5, 1.5), 0, 0.8, 0.15, 0.05, 3, 1.1, 0.2, 1, 0.2, 0, 1, -0.5, 0.5);
        }
        break;
      }
      case 'biomech': {
        face = toYaw; turn = 1.2;
        if (dist > 28) { mx = toX; mz = toZ; } else if (dist < 12) { mx = -toX; mz = -toZ; } else speed = 0;
        this.attackT -= dt;
        if (this.attackT <= 0 && plAlive && dist < 70) {
          this.attackT = rand(2.8, 4);
          for (const pod of this.rig.pods) {
            const m = pod.getWorldPosition(new THREE.Vector3());
            this.shoot('mrocket', m, 16, 22, 0, { splash: 15, radius: 3 });
          }
          game.audio.play('rocket', { pos: this.pos, rate: 0.8 });
          this.fireAnim = 0.5;
        }
        this.stepT = (this.stepT || 0) - dt * (Math.hypot(this.vel.x, this.vel.z) > 0.5 ? 1 : 0);
        if (this.stepT <= 0) { this.stepT = 0.9; game.audio.play('stomp', { pos: this.pos, vol: 0.5, range: 25 }); if (dist < 25) game.effects.addShake(0.05); }
        break;
      }
      case 'ra':
      case 'boss': this.bossAI(dt, dist, toX, toZ, toYaw); face = toYaw; turn = 0.8;
        if (this.state === 'walk') { mx = toX; mz = toZ; } else speed = 0;
        break;
    }

    if (this.painT > 0) speed *= 0.35;
    if (!plAlive && this.type !== 'harpy') { speed *= 0.3; }

    // obstacle avoidance: if we got stuck, sidestep for a while
    if (this.avoid !== 0) {
      const ax = -mz * this.avoid, az = mx * this.avoid;
      mx = mx * 0.3 + ax; mz = mz * 0.3 + az;
      const l = Math.hypot(mx, mz) || 1; mx /= l; mz /= l;
      this.avoidT -= dt;
      if (this.avoidT <= 0) this.avoid = 0;
    }

    // --- facing ---
    const dyaw = wrapAngle(face - this.yaw);
    this.yaw += clamp(dyaw, -turn * dt, turn * dt);
    this.root.rotation.y = this.yaw;

    // --- locomotion ---
    const accel = this.def.fly ? 6 : this.type === 'bull' ? 5 : (this.jumpT > 0 ? 1 : 10);
    this.jumpT = Math.max(0, (this.jumpT || 0) - dt);
    const tvx = mx * speed, tvz = mz * speed;
    this.vel.x += (tvx - this.vel.x) * Math.min(1, accel * dt);
    this.vel.z += (tvz - this.vel.z) * Math.min(1, accel * dt);
    this.move(dt);
    this.animSpeed = Math.hypot(this.vel.x, this.vel.z);
    this.animate(dt);
  }

  muzzle(fwd, up, side) {
    return { x: this.pos.x + this.fwdX * fwd - this.fwdZ * side, y: this.pos.y + up, z: this.pos.z + this.fwdZ * fwd + this.fwdX * side };
  }

  // Fire a projectile at the player with some target leading.
  shoot(type, from, speed, dmg, spread = 0, extra = {}) {
    const pl = this.game.player;
    const d0 = Math.hypot(pl.pos.x - from.x, pl.pos.z - from.z);
    const lead = (d0 / speed) * 0.6;
    const tx = pl.pos.x + pl.vel.x * lead, ty = pl.pos.y + 1.2, tz = pl.pos.z + pl.vel.z * lead;
    let dx = tx - from.x, dy = ty - from.y, dz = tz - from.z;
    const l = Math.hypot(dx, dy, dz) || 1;
    dx /= l; dy /= l; dz /= l;
    if (spread) { const c = Math.cos(spread), s = Math.sin(spread); const nx = dx * c - dz * s; dz = dx * s + dz * c; dx = nx; }
    if (type !== 'bullet' && type !== 'chain' && type !== 'spit') this.game.audio.play(type === 'mrocket' ? 'rocket' : 'enemyfire', { pos: from, vol: 0.6, group: 'efire', maxVoices: 4 });
    this.game.projectiles.spawn(type, from, { x: dx * speed, y: dy * speed, z: dz * speed }, 'enemy', { dmg: dmg, source: this, ...extra });
  }

  move(dt) {
    const world = this.game.world;
    const p = this.pos;
    const ox = p.x, oz = p.z;
    p.x += this.vel.x * dt; p.z += this.vel.z * dt;
    const b = this.bounds;
    if (b) {
      const r = this.def.r;
      p.x = clamp(p.x, b[0] + r, b[2] - r);
      p.z = clamp(p.z, b[1] + r, b[3] - r);
    }
    if (this.def.fly) {
      p.y += this.vel.y * dt;
      p.y = Math.max(1.2, p.y);
      world.collide(p, this.def.r, 1.2, 0);
    } else {
      const hit = world.collide(p, this.def.r, this.def.h, 0.7);
      this.vel.y -= 24 * dt;
      p.y += this.vel.y * dt;
      const g = world.groundHeight(p.x, p.z, this.def.r, p.y + 0.7, 0);
      if (p.y <= g) { p.y = g; this.vel.y = 0; this.onGround = true; } else if (p.y - g > 0.1) this.onGround = false;
      if (hit && Math.hypot(p.x - ox, p.z - oz) < this.def.speed * dt * 0.3) {
        this.blockedT += dt;
        // hop up onto ledges/platforms when the player is above us (like the classics' monsters)
        const pl = this.game.player;
        if (this.onGround && this.def.hp < 300 && pl.pos.y > p.y + 0.8 && this.blockedT > 0.15) {
          const dh = pl.pos.y - p.y + 0.9;
          this.vel.y = Math.sqrt(2 * 24 * dh);
          const tx = pl.pos.x - p.x, tz = pl.pos.z - p.z, tl = Math.hypot(tx, tz) || 1;
          this.vel.x = tx / tl * 5; this.vel.z = tz / tl * 5;
          this.onGround = false; this.blockedT = 0; this.jumpT = 0.6;
        }
        if (this.blockedT > 0.25 && this.avoid === 0) { this.avoid = Math.random() < 0.5 ? -1 : 1; this.avoidT = rand(0.6, 1.4); }
      } else this.blockedT = Math.max(0, this.blockedT - dt);
    }
  }

  animate(dt) {
    const r = this.rig;
    const sp = this.animSpeed;
    const k = clamp(sp / Math.max(3, this.def.speed * 0.7), 0, 1.2);
    this.phase += dt * (2 + sp * 1.3);
    const ph = this.phase;
    const s = Math.sin(ph), c = Math.cos(ph);
    this.fireAnim = Math.max(0, (this.fireAnim || 0) - dt);
    switch (this.type) {
      case 'kamikaze': case 'gunner': {
        r.hipL.rotation.x = s * 0.9 * k; r.hipR.rotation.x = -s * 0.9 * k;
        r.kneeL.rotation.x = -Math.max(0, -c) * 1.3 * k; r.kneeR.rotation.x = -Math.max(0, c) * 1.3 * k;
        r.body.position.y = Math.abs(s) * 0.08 * k;
        r.torso.rotation.x = 0.15 * k;
        if (this.type === 'kamikaze') {
          r.armL.rotation.set(Math.PI - 0.25 + s * 0.25, 0, -0.35); r.armR.rotation.set(Math.PI - 0.25 - s * 0.25, 0, 0.35);
          r.elbowL.rotation.x = -0.3; r.elbowR.rotation.x = -0.3;
        } else {
          r.armR.rotation.x = Math.PI / 2 - 0.15 + (this.fireAnim > 0 ? 0.3 : 0); r.elbowR.rotation.x = 0;
          r.armL.rotation.x = -s * 0.6 * k; r.elbowL.rotation.x = 0.4;
        }
        break;
      }
      case 'skeleton': {
        r.hipL.rotation.x = s * 1.0 * k; r.hipR.rotation.x = -s * 1.0 * k;
        r.kneeL.rotation.x = -Math.max(0, -c) * 1.4 * k; r.kneeR.rotation.x = -Math.max(0, c) * 1.4 * k;
        r.body.position.y = Math.abs(s) * 0.1 * k;
        r.torso.rotation.x = 0.25 * k;
        const lift = this.fireAnim > 0 ? 1.4 : 0;
        r.armL.rotation.x = -s * 0.8 * k + lift; r.armR.rotation.x = s * 0.8 * k + lift;
        r.elbowL.rotation.x = 0.5; r.elbowR.rotation.x = 0.5;
        r.head.rotation.x = Math.sin(this.t * 3) * 0.1;
        if (!this.onGround) { r.hipL.rotation.x = -0.8; r.hipR.rotation.x = 0.4; r.kneeL.rotation.x = -1.2; }
        break;
      }
      case 'gnasher': {
        r.body.position.y = Math.abs(s) * 0.18 * k;
        r.body.rotation.z = s * 0.08 * k;
        r.hipL.rotation.x = s * 0.8 * k; r.hipR.rotation.x = -s * 0.8 * k;
        r.armL.rotation.x = -s * 0.9 * k; r.armR.rotation.x = s * 0.9 * k;
        this.biteT = Math.max(0, (this.biteT || 0) - dt);
        r.jaw.rotation.x = this.biteT > 0 ? 0.6 : 0.15 + Math.sin(this.t * 6) * 0.05;
        if (this.biteT > 0) { r.armL.rotation.x = 1.6; r.armR.rotation.x = 1.6; }
        break;
      }
      case 'bull': {
        r.legs.forEach((l, i) => {
          const off = i < 2 ? 0 : Math.PI * 0.8;
          const sgn = i % 2 ? 1 : -1;
          l.hip.rotation.x = Math.sin(ph * 0.8 + off + sgn * 0.3) * 0.8 * k;
          l.knee.rotation.x = -Math.max(0, Math.cos(ph * 0.8 + off)) * 0.9 * k;
        });
        r.trunk.rotation.x = Math.sin(ph * 0.8) * 0.06 * k;
        r.body.position.y = Math.abs(Math.sin(ph * 0.8)) * 0.2 * k;
        r.head.rotation.x = this.state === 'charge' ? 0.35 : Math.sin(this.t * 2) * 0.1;
        break;
      }
      case 'arachnid': {
        r.legs.forEach((l) => {
          const o = (l.i + (l.side > 0 ? 1 : 0)) % 2 ? Math.PI : 0;
          l.hip.rotation.y = Math.sin(ph * 0.7 + o) * 0.35 * k;
          l.hip.rotation.z = Math.max(0, Math.cos(ph * 0.7 + o)) * 0.25 * k * l.side;
        });
        r.tail.forEach((sg, i) => { sg.rotation.x = 0.5 + Math.sin(this.t * 2 + i * 0.5) * 0.08 + (this.stingT > 0 ? -0.35 : 0); });
        this.stingT = Math.max(0, (this.stingT || 0) - dt);
        const aim = this.burst > 0 ? 1.45 : 0.4;
        r.armL.rotation.x = aim + Math.sin(this.t * 25) * (this.burst > 0 ? 0.03 : 0); r.armR.rotation.x = aim;
        r.body.position.y = Math.abs(Math.sin(ph * 1.4)) * 0.05 * k;
        break;
      }
      case 'harpy': {
        for (const w of r.wings) w.w.rotation.z = w.s * (Math.sin(this.t * 11) * 0.7 + 0.1);
        r.torso.rotation.x = this.state === 'dive' ? 0.9 : 0.25;
        r.body.position.y = Math.sin(this.t * 11) * 0.06;
        break;
      }
      case 'golem': case 'golemling': {
        r.hipL.rotation.x = s * 0.5 * k; r.hipR.rotation.x = -s * 0.5 * k;
        r.body.position.y = -Math.abs(s) * 0.1 * k;
        r.torso.rotation.z = s * 0.06 * k;
        const swing = this.fireAnim > 0 ? -2.2 : 0;
        r.armL.rotation.x = -s * 0.6 * k + swing; r.armR.rotation.x = s * 0.6 * k + swing;
        break;
      }
      case 'biomech': {
        r.hipL.rotation.x = s * 0.45 * k; r.hipR.rotation.x = -s * 0.45 * k;
        r.kneeL.rotation.x = Math.max(0, -c) * 0.5 * k; r.kneeR.rotation.x = Math.max(0, c) * 0.5 * k;
        r.body.position.y = -Math.abs(s) * 0.12 * k;
        r.torso.rotation.z = s * 0.05 * k;
        r.armL.rotation.x = 0.6 + (this.fireAnim > 0 ? 0.4 : 0); r.armR.rotation.x = 0.6 + (this.fireAnim > 0 ? 0.4 : 0);
        break;
      }
      case 'ra':
      case 'boss': {
        const kk = this.state === 'walk' ? 1 : 0;
        r.hipL.rotation.x = s * 0.35 * kk; r.hipR.rotation.x = -s * 0.35 * kk;
        r.kneeL.rotation.x = -Math.max(0, -c) * 0.4 * kk; r.kneeR.rotation.x = -Math.max(0, c) * 0.4 * kk;
        r.body.position.y = -Math.abs(s) * 0.25 * kk;
        const stomp = this.state === 'stomp' ? Math.sin(clamp(this.stateT / 1.2, 0, 1) * Math.PI) : 0;
        r.torso.rotation.x = -stomp * 0.25;
        const aim = this.state === 'volley' || this.state === 'barrage' ? Math.PI / 2 - 0.1 : 0.3 + Math.sin(this.t) * 0.1;
        r.armL.rotation.x += (aim - r.armL.rotation.x) * Math.min(1, dt * 4);
        r.armR.rotation.x += (aim - r.armR.rotation.x) * Math.min(1, dt * 4);
        r.elbowL.rotation.x = 0; r.elbowR.rotation.x = 0;
        r.head.rotation.y = Math.sin(this.t * 0.7) * 0.15;
        r.core.scale.setScalar(1 + Math.sin(this.t * (this.hp < this.maxHp * 0.5 ? 9 : 4)) * 0.15);
        if (r.sunDisc) r.sunDisc.material.opacity = 0.45 + Math.sin(this.t * 3) * 0.15;
        break;
      }
    }
  }

  bossAI(dt, dist, toX, toZ) {
    const game = this.game;
    const enraged = this.hp < this.maxHp * 0.5;
    this.stateT -= dt;
    if (!this.state || this.state === 'chase') { this.state = 'walk'; this.stateT = 3; }
    if (this.state === 'walk') {
      if (dist < 30) this.stateT -= dt * 2;
      if (this.stateT <= 0) {
        const opts = ['volley', 'barrage', 'volley', 'summon'];
        if (this.def.variant === 'ra') opts.push('nova', 'nova');
        if (dist < 34) opts.push('stomp', 'stomp');
        this.state = pick(opts);
        if (this.state === 'summon' && this.mgr.list.filter((e) => e.alive && e.summoned).length > 16) this.state = 'barrage';
        this.stateT = { volley: 2.4, barrage: 3.2, summon: 2.2, stomp: 1.4, nova: 2.6 }[this.state];
        this.shots = 0; this.shotT = 0.4;
        game.audio.play('bossroar', { pos: this.pos, range: 120, vol: 1 });
      }
      return;
    }
    this.shotT -= dt;
    if (this.state === 'volley' && this.shotT <= 0 && this.shots < 3) {
      this.shots++; this.shotT = enraged ? 0.5 : 0.75;
      this.rig.cannons.forEach((c, ci) => {
        const m = c.getWorldPosition(new THREE.Vector3());
        for (let i = -2; i <= 2; i++) this.shoot('bossfire', m, 20, 25, i * 0.14 + (ci ? 0.07 : -0.07), { splash: 20, radius: 4 });
      });
      game.effects.flash(this.pos.x, this.pos.y + 8, this.pos.z, 0xff5511, 60, 30, 0.3);
    }
    // Ra's sun nova: rings of fireballs radiating from the core
    if (this.state === 'nova' && this.shotT <= 0 && this.shots < 3) {
      this.shots++; this.shotT = 0.7;
      const c = this.rig.core.getWorldPosition(new THREE.Vector3());
      const n = enraged ? 22 : 16;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + this.shots * 0.2;
        game.projectiles.spawn('bossfire', c, { x: Math.cos(a) * 17, y: -4.5, z: Math.sin(a) * 17 }, 'enemy', { dmg: 22, splash: 15, radius: 3.5, source: this });
      }
      game.effects.flash(c.x, c.y, c.z, 0xffaa33, 90, 45, 0.4);
      game.audio.play('enemyfire', { pos: c, vol: 1, range: 80 });
    }
    if (this.state === 'barrage' && this.shotT <= 0) {
      this.shots++; this.shotT = enraged ? 0.14 : 0.22;
      const c = this.rig.cannons[this.shots % 2];
      const m = c.getWorldPosition(new THREE.Vector3());
      this.shoot(this.shots % 3 === 0 ? 'mrocket' : 'fireball', m, 26, 14, rand(-0.05, 0.05), { splash: 12, radius: 3 });
    }
    if (this.state === 'stomp' && this.stateT <= 0.5 && !this.stomped) {
      this.stomped = true;
      const pl = game.player;
      game.effects.addShake(1);
      game.audio.play('stomp', { vol: 1.2 });
      game.audio.play('bigexplosion', { pos: this.pos, range: 80 });
      for (let i = 0; i < 60; i++) {
        const a = (i / 60) * Math.PI * 2;
        game.effects.alpha.spawn(this.pos.x + Math.cos(a) * 4, 0.5, this.pos.z + Math.sin(a) * 4, Math.cos(a) * 22, 1, Math.sin(a) * 22, 1.2, 1.5, 3.5, 0.8, 0.7, 0.55, 0.6, 0.5, 0.4, 0.6, 0, 1.2);
      }
      if (pl.onGround && dist < 38) pl.damage(35 * (1 - dist / 48), this.pos, 18);
    }
    if (this.state === 'summon' && this.shotT <= 0 && this.shots < 1) {
      this.shots++;
      const n = enraged ? 10 : 7;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const type = i % 4 === 3 ? 'harpy' : enraged && i % 3 === 0 ? 'gnasher' : 'kamikaze';
        const e = this.mgr.spawnSafe(type, this.pos.x + Math.cos(a) * 12, this.pos.z + Math.sin(a) * 12, 4, { encounter: this.encounter, bounds: this.bounds, floorY: this.floorY });
        if (e) e.summoned = true;
      }
      game.audio.play('spawn', { vol: 1 });
    }
    if (this.stateT <= 0) { this.state = 'walk'; this.stateT = enraged ? rand(1.5, 2.5) : rand(2.5, 4); this.stomped = false; }
    void toX; void toZ;
  }

  updateDead(dt) {
    this.deadT += dt;
    const game = this.game;
    if (this.state === 'dying') {
      // boss: explosion chain then collapse
      if (Math.random() < dt * 12) {
        const p = this.pos;
        game.effects.explosion(p.x + rand(-3, 3), p.y + rand(2, 13), p.z + rand(-3, 3), rand(0.8, 1.6));
        game.audio.play('explosion', { pos: p, range: 80, group: 'bossdie', maxVoices: 4 });
        game.effects.addShake(0.15);
      }
      this.root.rotation.x = Math.min(0.2, this.deadT * 0.05);
      this.root.position.y -= dt * this.deadT * 0.3;
      if (this.deadT > 4) {
        const p = this.pos;
        game.effects.gibs(p.x, p.y + 7, p.z, 40, ['stone', 'metal'], 16, false);
        game.effects.explosion(p.x, p.y + 6, p.z, 3);
        game.audio.play('bigexplosion', { vol: 1.5 });
        game.effects.addShake(1.2);
        this.remove = true;
        game.onBossGone();
      }
      return;
    }
    const t = Math.min(1, this.deadT / 0.45);
    const ease = t * t;
    if (this.def.fly) {
      this.vel.y -= 20 * dt;
      this.pos.y = Math.max(0, this.pos.y + this.vel.y * dt);
      this.root.rotation.z = ease * 1.5;
    } else if (this.type === 'bull' || this.type === 'arachnid') this.root.rotation.z = ease * (Math.PI / 2) * 0.95;
    else this.root.rotation.x = -ease * (Math.PI / 2) * 0.95;
    if (this.deadT > 4) this.pos.y -= dt * 0.6;
    if (this.deadT > 6) this.remove = true;
  }
}

export class EnemyManager {
  constructor(game) {
    this.game = game;
    this.list = [];
    this.group = new THREE.Group();
    game.scene.add(this.group);
    this._sph = [];
  }

  clear() {
    for (const e of this.list) this.group.remove(e.root);
    this.list.length = 0;
  }

  get alive() { let n = 0; for (const e of this.list) if (e.alive) n++; return n; }

  spawn(type, x, z, opts = {}) {
    // stand on the arena floor (or a low platform up to 3.2 m above it), never on pillar tops
    const y = this.game.world.groundHeight(x, z, ENEMY_DEFS[type].r, (opts.floorY || 0) + 3.2, 0);
    const e = new Enemy(this, type, x, y, z, opts);
    this.list.push(e);
    this.group.add(e.root);
    if (!opts.silent) {
      this.game.effects.teleport(x, y + (e.def.fly ? e.alt - 1 : 0), z, Math.min(6, e.def.h));
    }
    if (e.def.boss) this.game.setBoss(e);
    return e;
  }

  // Spawn near (x,z) within `spread`, avoiding solid geometry.
  spawnSafe(type, x, z, spread, opts = {}) {
    const def = ENEMY_DEFS[type];
    const w = this.game.world;
    const B = opts.bounds;
    const ok = (px, pz) => {
      if (B && (px < B[0] + def.r || px > B[2] - def.r || pz < B[1] + def.r || pz > B[3] - def.r)) return false;
      let bad = false;
      const fy = opts.floorY || 0;
      w.query(px - def.r - 0.3, pz - def.r - 0.3, px + def.r + 0.3, pz + def.r + 0.3, (b) => { if (b.maxY > fy + 3.1 && b.minY < fy + 3) bad = true; });
      if (!bad && w.floor === -Infinity && w.groundHeight(px, pz, 0.1, fy + 3.2, 0) < fy - 1) bad = true; // no floor here (sky level)
      return !bad;
    };
    for (let tries = 0; tries < 30; tries++) {
      const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * spread * (tries < 15 ? 1 : 2);
      const px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
      if (ok(px, pz)) return this.spawn(type, px, pz, opts);
    }
    // last resort: anywhere valid inside the bounds
    if (B) for (let tries = 0; tries < 40; tries++) {
      const px = B[0] + Math.random() * (B[2] - B[0]), pz = B[1] + Math.random() * (B[3] - B[1]);
      if (ok(px, pz)) return this.spawn(type, px, pz, opts);
    }
    return null;
  }

  update(dt) {
    const list = this.list;
    for (const e of list) {
      e.update(dt);
      // stability guards: corrupted positions or enemies that fell out of the world
      if (e.alive && (!Number.isFinite(e.pos.x) || !Number.isFinite(e.pos.y) || !Number.isFinite(e.pos.z) || e.pos.y < -40)) {
        e.alive = false; e.remove = true; this.onDeath(e, true);
      }
    }
    // separation so hordes don't collapse into one point
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      if (!a.alive || a.def.boss) continue;
      for (let j = i + 1; j < list.length; j++) {
        const b = list[j];
        if (!b.alive || b.def.boss || a.def.fly !== b.def.fly) continue;
        const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z;
        const rr = a.def.r + b.def.r;
        const d2 = dx * dx + dz * dz;
        if (d2 < rr * rr && d2 > 1e-6) {
          const d = Math.sqrt(d2), push = (rr - d) * 0.5;
          const nx = dx / d, nz = dz / d;
          const wa = b.def.hp / (a.def.hp + b.def.hp);
          a.pos.x -= nx * push * wa * 2; a.pos.z -= nz * push * wa * 2;
          b.pos.x += nx * push * (1 - wa) * 2; b.pos.z += nz * push * (1 - wa) * 2;
        }
      }
    }
    for (let i = list.length - 1; i >= 0; i--) {
      if (list[i].remove) { this.group.remove(list[i].root); list.splice(i, 1); }
    }
  }

  // Closest enemy hit by a ray. pad enlarges spheres (projectile radius).
  rayHit(ox, oy, oz, dx, dy, dz, maxT, pad = 0, exclude = null) {
    let best = null, bestT = maxT;
    const s = this._sph;
    for (const e of this.list) {
      if (!e.alive || (exclude && exclude.has(e))) continue;
      // cheap reject: distance from ray to enemy centre
      const cx = e.pos.x - ox, cy = e.pos.y + e.def.h * 0.5 - oy, cz = e.pos.z - oz;
      const along = cx * dx + cy * dy + cz * dz;
      const reach = e.def.h + e.def.r + 2 + pad;
      if (along < -reach || along > bestT + reach) continue;
      const px = cx - dx * along, py = cy - dy * along, pz = cz - dz * along;
      if (px * px + py * py + pz * pz > reach * reach) continue;
      s.length = 0;
      e.spheres(s);
      for (let i = 0; i < s.length; i += 4) {
        const t = raySphere(ox, oy, oz, dx, dy, dz, s[i], s[i + 1], s[i + 2], s[i + 3] + pad);
        if (t >= 0 && t < bestT) { bestT = t; best = { enemy: e, t, head: i === 4 && e.type === 'skeleton' }; }
      }
    }
    return best;
  }

  onHit(e) { void e; }

  onDeath(e, selfDestruct) { this.game.onEnemyKilled(e, selfDestruct); }
}
