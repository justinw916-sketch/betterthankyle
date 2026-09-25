// Floating, spinning item pickups: health, armor, ammo, weapons, power-ups.
import * as THREE from 'three';
import { makePickupModel } from './models.js';
import { AMMO_PICKUP, WEAPON_BY_ID, MAX_AMMO } from './weapons.js';
import { getMaterials } from './textures.js';

const HEALTH = { small: [10, 200], medium: [25, 100], large: [50, 100], super: [100, 200] };
const ARMOR = { small: [10, 200], medium: [50, 100], large: [100, 200] };
const GLOW = { health: 0x55ff88, armor: 0xffd044, ammo: 0xffaa55, weapon: 0x88ccff, powerup: 0xff3355 };

export class Pickups {
  constructor(game) {
    this.game = game;
    this.list = [];
    this.group = new THREE.Group();
    game.scene.add(this.group);
    this.glowMats = {};
    const S = getMaterials()._sprites;
    for (const [k, c] of Object.entries(GLOW)) this.glowMats[k] = new THREE.SpriteMaterial({ map: S.glow, color: c, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.35 });
    this.cache = new Map();
  }

  clear() {
    for (const p of this.list) this.group.remove(p.obj);
    this.list.length = 0;
  }

  add(kind, sub, x, y, z, { effect = false, index = -1 } = {}) {
    const key = kind + ':' + sub;
    let proto = this.cache.get(key);
    if (!proto) { proto = makePickupModel(kind, sub); this.cache.set(key, proto); }
    const obj = new THREE.Group();
    const model = proto.clone();
    obj.add(model);
    const glow = new THREE.Sprite(this.glowMats[kind]);
    glow.scale.setScalar(kind === 'weapon' ? 2.2 : 1.6);
    obj.add(glow);
    const baseY = y + (kind === 'weapon' ? 0.8 : 0.7);
    obj.position.set(x, baseY, z);
    this.group.add(obj);
    const p = { kind, sub, obj, model, baseY, phase: Math.random() * 6, index };
    this.list.push(p);
    if (effect) this.game.effects.teleport(x, y, z, 1.5);
    return p;
  }

  update(dt) {
    const pl = this.game.player;
    const t = performance.now() * 0.001;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      p.model.rotation.y += dt * 1.6;
      p.obj.position.y = p.baseY + Math.sin(t * 2.2 + p.phase) * 0.12;
      if (!pl.alive) continue;
      const dx = pl.pos.x - p.obj.position.x, dz = pl.pos.z - p.obj.position.z;
      const dy = pl.pos.y + 0.9 - p.obj.position.y;
      if (dx * dx + dz * dz < 1.6 * 1.6 && Math.abs(dy) < 1.8) {
        if (this.collect(p)) {
          this.group.remove(p.obj);
          this.list.splice(i, 1);
          if (p.index >= 0) this.game.collected.add(p.index);
        }
      }
    }
  }

  collect(p) {
    const g = this.game, pl = g.player, W = g.weapons, hud = g.hud;
    switch (p.kind) {
      case 'health': {
        const [amt, cap] = HEALTH[p.sub];
        if (pl.health >= cap) return false;
        pl.health = Math.min(cap, pl.health + amt);
        g.audio.play('health');
        hud.log(`+${amt} Health`, '#7dff9a');
        hud.pickupFlash('rgba(120,255,150,0.2)');
        return true;
      }
      case 'armor': {
        const [amt, cap] = ARMOR[p.sub];
        if (pl.armor >= cap) return false;
        pl.armor = Math.min(cap, pl.armor + amt);
        g.audio.play('armor');
        hud.log(`+${amt} Armor`, '#ffd044');
        hud.pickupFlash('rgba(255,210,80,0.2)');
        return true;
      }
      case 'ammo': {
        if (!W.addAmmo(p.sub, AMMO_PICKUP[p.sub])) return false;
        g.audio.play('pickup');
        hud.log(`+${AMMO_PICKUP[p.sub]} ${p.sub}`, '#ffcc88');
        hud.pickupFlash();
        return true;
      }
      case 'weapon': {
        const w = WEAPON_BY_ID[p.sub];
        const owned = W.owned.has(p.sub);
        if (owned) {
          if (p.sub === 'revolver' ? W.dual : !w.ammo || W.ammo[w.ammo] >= MAX_AMMO[w.ammo]) return false;
        }
        W.give(p.sub);
        g.audio.play('weapon');
        hud.message(owned ? w.name + ' ammo' : `You got the ${w.name}!`, 2.5, owned ? '' : 'big');
        hud.pickupFlash('rgba(140,200,255,0.25)');
        return true;
      }
      case 'powerup': {
        g.audio.play('powerup');
        if (p.sub === 'protect') {
          pl.protectT = 20;
          hud.message('SERIOUS PROTECTION!', 3, 'big');
          hud.pickupFlash('rgba(255,210,80,0.3)');
        } else if (p.sub === 'speed') {
          pl.speedT = 20;
          hud.message('SERIOUS SPEED!', 3, 'big');
          hud.pickupFlash('rgba(80,220,255,0.3)');
        } else if (p.sub === 'bomb') {
          if (pl.bombs >= 3) return false;
          pl.bombs++;
          hud.message('SERIOUS BOMB! Press B to detonate', 3.5, 'big');
          hud.pickupFlash('rgba(255,255,255,0.3)');
        } else {
          pl.seriousDamage = 30;
          hud.message('SERIOUS DAMAGE!', 3, 'big red');
          hud.pickupFlash('rgba(255,60,80,0.3)');
        }
        return true;
      }
    }
    return false;
  }
}
