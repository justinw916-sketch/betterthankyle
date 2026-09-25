// First-person player: fast old-school movement (no stamina, huge speed,
// strong air control), health/armor, damage feedback.
import { clamp } from './util.js';

export const PLAYER = {
  radius: 0.42, height: 1.8, eye: 1.62,
  maxSpeed: 10.5, accel: 90, airAccel: 28, friction: 11,
  jump: 7.6, gravity: 24, step: 0.65,
};

export class Player {
  constructor(game) {
    this.game = game;
    this.pos = { x: 0, y: 0, z: 0 };
    this.vel = { x: 0, y: 0, z: 0 };
    this.yaw = 0; this.pitch = 0;
    this.reset();
  }

  reset() {
    this.health = 100; this.armor = 0;
    this.alive = true;
    this.onGround = true;
    this.bob = 0; this.bobAmt = 0;
    this.stepT = 0;
    this.landKick = 0;
    this.hurtT = 0;
    this.damageDirs = [];
    this.seriousDamage = 0;
    this.protectT = 0;   // Serious Protection: invulnerable
    this.speedT = 0;     // Serious Speed: +55% movement
    this.bombs = this.bombs || 0; // Serious Bombs carry across deaths within a level via checkpoint
    this.god = false;
    this.vel.x = this.vel.y = this.vel.z = 0;
    this.eyeOffset = 0;
  }

  place(x, z, yaw) {
    this.pos.x = x; this.pos.z = z;
    this.pos.y = this.game.world.groundHeight(x, z, PLAYER.radius, 50, 50);
    this.yaw = yaw; this.pitch = 0;
    this.vel.x = this.vel.y = this.vel.z = 0;
  }

  update(dt, input) {
    const world = this.game.world;
    // stability guard: restore the last good state if physics ever produces NaN
    const p0 = this.pos;
    if (!Number.isFinite(p0.x) || !Number.isFinite(p0.y) || !Number.isFinite(p0.z)) {
      if (this.lastGood) Object.assign(p0, this.lastGood);
      this.vel.x = this.vel.y = this.vel.z = 0;
    } else this.lastGood = { x: p0.x, y: p0.y, z: p0.z };
    if (!Number.isFinite(this.yaw)) this.yaw = 0;
    if (!Number.isFinite(this.pitch)) this.pitch = 0;
    if (!this.alive) {
      // death cam: sink to floor
      this.eyeOffset = Math.max(-1.3, this.eyeOffset - dt * 2.5);
      return;
    }
    // --- look ---
    const sens = this.game.settings.sensitivity * 0.0022;
    this.yaw -= input.mouseDX * sens;
    this.pitch -= input.mouseDY * sens * (this.game.settings.invertY ? -1 : 1);
    this.pitch = clamp(this.pitch, -1.5, 1.5);
    // --- wish direction ---
    let fx = 0, fz = 0;
    if (input.down('KeyW') || input.down('ArrowUp')) fz -= 1;
    if (input.down('KeyS') || input.down('ArrowDown')) fz += 1;
    if (input.down('KeyA') || input.down('ArrowLeft')) fx -= 1;
    if (input.down('KeyD') || input.down('ArrowRight')) fx += 1;
    const walk = input.down('ShiftLeft') || input.down('ShiftRight');
    const len = Math.hypot(fx, fz);
    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    let wx = 0, wz = 0;
    if (len > 0) {
      fx /= len; fz /= len;
      wx = fx * cos + fz * sin;
      wz = -fx * sin + fz * cos;
    }
    const maxSpeed = PLAYER.maxSpeed * (walk ? 0.45 : 1) * (this.speedT > 0 ? 1.55 : 1);
    const v = this.vel;
    if (this.onGround) {
      // friction
      const sp = Math.hypot(v.x, v.z);
      if (sp > 0) {
        const drop = sp * PLAYER.friction * dt;
        const ns = Math.max(0, sp - drop) / sp;
        v.x *= ns; v.z *= ns;
      }
    }
    // accelerate (Quake-style: only up to max speed along wish dir)
    const cur = v.x * wx + v.z * wz;
    const add = maxSpeed - cur;
    if (add > 0 && len > 0) {
      const acc = Math.min((this.onGround ? PLAYER.accel : PLAYER.airAccel) * dt * maxSpeed / 10, add);
      v.x += wx * acc; v.z += wz * acc;
    }
    // jump
    if (this.onGround && input.down('Space')) {
      v.y = PLAYER.jump;
      this.onGround = false;
      this.game.audio.play('jump', { vol: 0.6 });
    }
    // gravity
    v.y -= PLAYER.gravity * dt;

    // integrate horizontally with collision (sub-steps for high speeds)
    const steps = Math.max(1, Math.ceil(Math.hypot(v.x, v.z) * dt / 0.3));
    const p = this.pos;
    for (let i = 0; i < steps; i++) {
      p.x += v.x * dt / steps;
      p.z += v.z * dt / steps;
      world.collide(p, PLAYER.radius, PLAYER.height, PLAYER.step);
    }
    // vertical
    const wasGround = this.onGround;
    const prevVy = v.y;
    p.y += v.y * dt;
    const ceil = world.ceiling(p.x, p.z, PLAYER.radius, p.y + 0.5);
    if (p.y + PLAYER.height > ceil && v.y > 0) { p.y = ceil - PLAYER.height; v.y = 0; }
    const g = world.groundHeight(p.x, p.z, PLAYER.radius, Math.max(p.y, p.y - v.y * dt), PLAYER.step);
    if (p.y <= g + 0.001) {
      // stepped up onto a step: smooth the camera
      if (wasGround && g > p.y + 0.05) this.eyeOffset -= (g - p.y);
      p.y = g;
      if (!wasGround && prevVy < -6) {
        this.landKick = Math.min(0.25, -prevVy * 0.02);
        this.game.audio.play('land', { vol: 0.7 });
      }
      v.y = 0;
      this.onGround = true;
    } else if (wasGround && p.y - g < PLAYER.step && v.y <= 0) {
      // stick to ground when walking down steps
      this.eyeOffset += p.y - g;
      p.y = g; v.y = 0; this.onGround = true;
    } else {
      this.onGround = false;
    }
    this.eyeOffset *= Math.exp(-dt * 14);

    // head bob + footsteps
    const hs = Math.hypot(v.x, v.z);
    this.bobAmt += ((this.onGround ? Math.min(1, hs / PLAYER.maxSpeed) : 0) - this.bobAmt) * Math.min(1, dt * 10);
    this.bob += dt * hs * 0.9;
    if (this.onGround && hs > 2) {
      this.stepT -= dt * hs;
      if (this.stepT <= 0) { this.stepT = 3.2; this.game.audio.play('step', { vol: 0.45 }); }
    }
    this.landKick *= Math.exp(-dt * 8);
    this.hurtT = Math.max(0, this.hurtT - dt);
    if (this.seriousDamage > 0) this.seriousDamage = Math.max(0, this.seriousDamage - dt);
    if (this.protectT > 0) this.protectT = Math.max(0, this.protectT - dt);
    if (this.speedT > 0) this.speedT = Math.max(0, this.speedT - dt);
    // overheal slowly decays above 100 like the classics
    if (this.health > 100) this.health = Math.max(100, this.health - dt * 1.0);
  }

  get eyeY() {
    return this.pos.y + PLAYER.eye + this.eyeOffset - this.landKick + Math.sin(this.bob * 2) * 0.05 * this.bobAmt;
  }

  // Instant death regardless of armor (falling into the void).
  kill() {
    if (!this.alive) return;
    this.health = 0; this.alive = false;
    this.game.audio.play('death');
    this.game.onPlayerDeath();
  }

  damage(amount, from, knock = 0) {
    if (!this.alive || this.god) return;
    if (this.protectT > 0) { this.game.hud.pickupFlash('rgba(255,215,90,0.12)'); return; }
    amount *= this.game.difficulty.dmg;
    // armor absorbs two thirds while it lasts
    const absorbed = Math.min(this.armor, amount * 0.66);
    this.armor -= absorbed;
    amount -= absorbed;
    this.health -= amount;
    this.hurtT = Math.min(1, this.hurtT + amount / 25 + 0.2);
    this.game.effects.addShake(Math.min(0.6, amount / 40));
    if (from) {
      const ang = Math.atan2(from.x - this.pos.x, from.z - this.pos.z);
      this.game.hud.damageFrom(ang - this.yaw + Math.PI);
      if (knock) {
        const dx = this.pos.x - from.x, dz = this.pos.z - from.z;
        const d = Math.hypot(dx, dz) || 1;
        this.vel.x += (dx / d) * knock; this.vel.z += (dz / d) * knock; this.vel.y += knock * 0.4;
        this.onGround = false;
      }
    }
    if (this.health <= 0) {
      this.health = 0;
      this.alive = false;
      this.game.audio.play('death');
      this.game.onPlayerDeath();
    } else if (amount > 3) {
      this.game.audio.play('pain', { vol: 0.8, group: 'playerpain', maxVoices: 1 });
    }
  }
}
