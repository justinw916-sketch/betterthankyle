// Weapon arsenal: definitions, inventory, firing logic and animated
// first-person viewmodels rendered in their own overlay scene.
import * as THREE from 'three';
import { makeWeaponModel } from './models.js';
import { getMaterials } from './textures.js';
import { rand, clamp } from './util.js';

export const MAX_AMMO = { shells: 100, bullets: 500, rockets: 50, grenades: 50, cells: 400, cannonballs: 30 };
export const AMMO_PICKUP = { shells: 10, bullets: 50, rockets: 5, grenades: 5, cells: 50, cannonballs: 2 };

export const WEAPONS = [
  { id: 'knife', key: 'Digit1', name: 'Military Knife', short: 'Knife', rate: 0.5, dmg: 70, melee: true, pos: [0.21, -0.25, -0.42], rot: [0.5, 0.35, -0.25], hands: [[0.003, 0, 0.08]] },
  { id: 'revolver', key: 'Digit2', name: 'Schofield Revolver', short: 'Colt', rate: 0.32, dmg: 20, spread: 0.004, clip: 6, reload: 1.1, pos: [0.2, -0.235, -0.46], rot: [0, 0.07, 0], hands: [[0, -0.075, 0.075]] },
  { id: 'shotgun', key: 'Digit3', name: 'Pump Shotgun', short: 'Shotgun', hands: [[0, -0.05, 0.13], [0, -0.03, -0.2]], ammo: 'shells', use: 1, rate: 0.9, dmg: 11, pellets: 8, spread: 0.055, pos: [0.2, -0.25, -0.44], rot: [0, 0.06, 0], give: 10 },
  { id: 'dshotgun', key: 'Digit4', name: 'Double Coach Gun', short: 'Double', hands: [[0, -0.06, 0.13], [0, -0.03, -0.2]], ammo: 'shells', use: 2, rate: 1.25, dmg: 11, pellets: 18, spread: 0.1, pos: [0.2, -0.255, -0.44], rot: [0, 0.06, 0], give: 20 },
  { id: 'tommy', key: 'Digit5', name: 'Tommygun', short: 'Tommy', hands: [[0, -0.09, 0.06], [0, -0.09, -0.26]], ammo: 'bullets', use: 1, rate: 0.095, dmg: 12, spread: 0.018, pos: [0.2, -0.25, -0.46], rot: [0, 0.06, 0], give: 50 },
  { id: 'minigun', key: 'Digit6', name: 'XM-214 Minigun', short: 'Minigun', hands: [[0.1, -0.05, 0.14], [-0.1, -0.06, 0.02]], ammo: 'bullets', use: 1, rate: 0.05, dmg: 12, spread: 0.032, pos: [0.23, -0.29, -0.52], rot: [0, 0.06, 0], give: 100 },
  { id: 'rocket', key: 'Digit7', name: 'Rocket Launcher', short: 'Rocket', hands: [[0, -0.12, 0.05], [0, -0.08, -0.25]], ammo: 'rockets', use: 1, rate: 0.62, proj: 'rocket', pos: [0.25, -0.25, -0.62], rot: [0, 0.07, 0], give: 5 },
  { id: 'grenade', key: 'Digit8', name: 'Grenade Launcher', short: 'Grenade', hands: [[0, -0.15, 0.12], [0, -0.08, -0.22]], ammo: 'grenades', use: 1, rate: 0.7, proj: 'grenade', pos: [0.24, -0.27, -0.52], rot: [0, 0.07, 0], give: 5 },
  { id: 'laser', key: 'Digit9', name: 'XL2 Laser Gun', short: 'Laser', hands: [[0, -0.12, 0.05], [0, -0.07, -0.2]], ammo: 'cells', use: 1, rate: 0.085, proj: 'laser', pos: [0.22, -0.25, -0.52], rot: [0, 0.06, 0], give: 50 },
  { id: 'cannon', key: 'Digit0', name: 'SBC Cannon', short: 'Cannon', hands: [[0.2, -0.08, 0.02], [-0.2, -0.08, 0.02]], ammo: 'cannonballs', use: 1, rate: 1.1, proj: 'cannonball', charge: true, pos: [0.2, -0.31, -0.64], rot: [0, 0.06, 0], give: 3 },
];
export const WEAPON_BY_ID = Object.fromEntries(WEAPONS.map((w) => [w.id, w]));

export class Weapons {
  constructor(game) {
    this.game = game;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(62, 1, 0.01, 10);
    this.scene.add(new THREE.HemisphereLight(0xfff0e0, 0x806040, 1.6));
    this.sun = new THREE.DirectionalLight(0xffffff, 2.4);
    this.sun.position.set(1, 2, 1);
    this.scene.add(this.sun);
    this.flashLight = new THREE.PointLight(0xffbb66, 0, 3, 1);
    this.flashLight.position.set(0.2, -0.1, -0.7);
    this.scene.add(this.flashLight);
    this.holder = new THREE.Group();
    this.scene.add(this.holder);

    this.models = {};
    const S = getMaterials()._sprites;
    this.flashMat = new THREE.SpriteMaterial({ map: S.flame, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, color: 0xffffff });
    const skin = new THREE.MeshStandardMaterial({ color: 0xd09a70, roughness: 0.65 });
    const sleeve = new THREE.MeshStandardMaterial({ color: 0xece8e0, roughness: 0.9 });
    for (const w of WEAPONS) {
      const list = [makeWeaponModel(w.id)];
      if (w.id === 'revolver') list.push(makeWeaponModel('revolver'));
      for (const m of list) {
        (w.hands || []).forEach((h, hi) => addArm(m.group, h, hi, skin, sleeve));
        m.group.visible = false;
        m.flashes = m.muzzles.map((p) => {
          const s = new THREE.Sprite(this.flashMat.clone());
          s.position.copy(p); s.visible = false;
          s.scale.setScalar(w.id === 'cannon' ? 0.6 : w.id === 'minigun' || w.id.includes('shotgun') ? 0.35 : 0.25);
          if (w.id === 'laser') s.material.color.set(0x66ffcc);
          m.group.add(s);
          return s;
        });
        this.holder.add(m.group);
      }
      this.models[w.id] = list;
    }
    this.reset();
  }

  reset(keep = null) {
    this.owned = new Set(keep?.owned || ['knife', 'revolver']);
    this.ammo = { shells: 0, bullets: 0, rockets: 0, grenades: 0, cells: 0, cannonballs: 0, ...(keep?.ammo || {}) };
    this.dual = keep?.dual ?? false;
    this.current = null;
    this.last = 'knife';
    this.pending = keep?.current || 'revolver';
    this.state = 'lower'; this.stateT = 0;
    this.cool = 0;
    this.clip = [6, 6]; this.reloadT = 0; this.gunIdx = 0;
    this.spin = 0; this.spinAngle = 0;
    this.charge = 0; this.charging = false;
    this.kick = 0; this.kickRot = 0;
    this.swayX = 0; this.swayY = 0;
    this.flashT = 0;
    this.laserIdx = 0;
    this.knifeT = 0;
    for (const list of Object.values(this.models)) for (const m of list) m.group.visible = false;
  }

  snapshot() { return { owned: [...this.owned], ammo: { ...this.ammo }, dual: this.dual, current: this.current || this.pending }; }

  def() { return WEAPON_BY_ID[this.current]; }

  hasAmmo(id) {
    const w = WEAPON_BY_ID[id];
    return !w.ammo || this.ammo[w.ammo] >= (w.use || 1) || (w.id === 'dshotgun' && this.ammo.shells >= 1);
  }

  give(id) {
    const w = WEAPON_BY_ID[id];
    const isNew = !this.owned.has(id);
    this.owned.add(id);
    if (w.ammo) this.addAmmo(w.ammo, w.give);
    if (id === 'revolver' && !isNew && !this.dual) { this.dual = true; if (this.current === 'revolver') this.showModel(); return true; }
    if (isNew) this.select(id);
    return isNew;
  }

  addAmmo(type, n) {
    const before = this.ammo[type];
    this.ammo[type] = Math.min(MAX_AMMO[type], this.ammo[type] + n);
    return this.ammo[type] > before;
  }

  select(id) {
    if (!this.owned.has(id) || id === this.current || id === this.pending) return;
    if (!this.hasAmmo(id)) { this.game.audio.play('empty'); return; }
    this.pending = id;
    if (this.state !== 'lower') { this.state = 'lower'; this.stateT = 0; }
    this.charging = false; this.charge = 0;
  }

  bestWeapon() {
    const order = ['cannon', 'rocket', 'minigun', 'laser', 'dshotgun', 'tommy', 'shotgun', 'grenade', 'revolver', 'knife'];
    return order.find((id) => this.owned.has(id) && this.hasAmmo(id)) || 'knife';
  }

  cycle(dir) {
    const owned = WEAPONS.filter((w) => this.owned.has(w.id) && this.hasAmmo(w.id));
    const cur = this.pending || this.current;
    let i = owned.findIndex((w) => w.id === cur);
    i = (i + dir + owned.length) % owned.length;
    this.select(owned[i].id);
  }

  showModel() {
    for (const [id, list] of Object.entries(this.models)) {
      list.forEach((m, i) => { m.group.visible = id === this.current && (i === 0 || this.dual); });
    }
  }

  update(dt, input) {
    const game = this.game, player = game.player;
    if (!player.alive) { this.holder.position.y = damp(this.holder.position.y, -0.6, dt, 4); return; }
    // --- selection input ---
    for (const w of WEAPONS) if (input.wasPressed(w.key)) {
      // pressing a slot twice cycles shotgun <-> double shotgun like the classic
      this.select(w.id);
    }
    if (input.wasPressed('KeyQ')) this.select(this.last);
    if (input.wheel) this.cycle(input.wheel > 0 ? 1 : -1);

    // --- raise/lower state machine ---
    this.stateT += dt;
    if (this.state === 'lower') {
      if (this.stateT >= 0.14 || !this.current) {
        if (this.current) this.last = this.current;
        this.current = this.pending || this.current || 'knife';
        this.pending = null;
        this.showModel();
        this.state = 'raise'; this.stateT = 0;
        this.game.audio.play('switch', { vol: 0.6 });
        this.game.hud.weaponChanged();
      }
    } else if (this.state === 'raise' && this.stateT >= 0.2) {
      this.state = 'ready';
    }

    const w = this.def();
    this.cool -= dt;
    const trigger = input.mouse(0) || input.padFire;
    const dmgMul = player.seriousDamage > 0 ? 4 : 1;

    // revolver reload
    if (this.reloadT > 0) {
      this.reloadT -= dt;
      if (this.reloadT <= 0) this.clip = [6, 6];
    }

    // minigun barrel spin
    if (w && w.id === 'minigun') {
      const target = trigger && this.state === 'ready' && this.hasAmmo('minigun') ? 1 : 0;
      if (target && this.spin < 0.05) this.game.audio.play('spin', { vol: 0.5 });
      this.spin = clamp(this.spin + (target ? dt * 2.2 : -dt * 1.0), 0, 1);
      this.spinAngle += this.spin * dt * 40;
      this.models.minigun[0].spin.rotation.z = this.spinAngle;
    } else this.spin = 0;

    if (w && this.state === 'ready') {
      if (w.charge) {
        // cannon: hold to charge, release to fire
        if (trigger && this.hasAmmo(w.id) && this.cool <= 0) {
          this.charging = true;
          this.charge = Math.min(1, this.charge + dt / 1.2);
        } else if (this.charging) {
          this.fire(w, dmgMul);
          this.charging = false; this.charge = 0;
        }
      } else if (trigger && this.cool <= 0) {
        if (w.id === 'minigun' && this.spin < 0.55) { /* spinning up */ }
        else if (!this.hasAmmo(w.id)) {
          this.game.audio.play('empty');
          this.cool = 0.3;
          this.select(this.bestWeapon());
        } else if (w.id === 'revolver' && this.reloadT > 0) { /* reloading */ }
        else this.fire(w, dmgMul);
      }
    }
    if (w && w.ammo && this.state === 'ready' && !this.hasAmmo(w.id) && !trigger && this.cool <= 0) this.select(this.bestWeapon());

    this.animate(dt, input);
  }

  fire(w, dmgMul) {
    const game = this.game;
    const aim = game.getAim();
    const { o, d, r, u } = aim;
    this.cool = w.rate;
    if (w.ammo) this.ammo[w.ammo] = Math.max(0, this.ammo[w.ammo] - (w.id === 'dshotgun' ? Math.min(2, this.ammo.shells) : w.use));
    const muzzle = { x: o.x + d.x * 0.7 + r.x * 0.2 - u.x * 0.15, y: o.y + d.y * 0.7 + r.y * 0.2 - u.y * 0.15, z: o.z + d.z * 0.7 + r.z * 0.2 - u.z * 0.15 };
    const spreadDir = (s) => {
      const a = Math.random() * Math.PI * 2, m = Math.sqrt(Math.random()) * s;
      const cx = Math.cos(a) * m, cy = Math.sin(a) * m;
      const x = d.x + r.x * cx + u.x * cy, y = d.y + r.y * cx + u.y * cy, z = d.z + r.z * cx + u.z * cy;
      const l = Math.hypot(x, y, z);
      return { x: x / l, y: y / l, z: z / l };
    };
    let kick = 0.05, kickRot = 0.08, camKick = 0.004, flash = true, flashCol = 0xffaa55;
    switch (w.id) {
      case 'knife': {
        this.knifeT = 0.35;
        const hit = game.melee(o, d, 2.6, w.dmg * dmgMul);
        game.audio.play(hit ? 'knifehit' : 'knife');
        flash = false; kick = 0; kickRot = 0; camKick = 0;
        break;
      }
      case 'revolver': {
        const gi = this.dual ? this.gunIdx : 0;
        this.gunIdx = this.dual ? 1 - this.gunIdx : 0;
        this.clip[gi]--;
        if (this.dual) this.cool = w.rate * 0.6;
        game.hitscan(o, spreadDir(w.spread), w.dmg * dmgMul, 300, { tracer: false, muzzle });
        game.audio.play('revolver');
        this.flashGun('revolver', gi);
        if ((this.dual ? this.clip[0] + this.clip[1] : this.clip[0]) <= 0) this.reloadT = w.reload;
        kick = 0.06; kickRot = 0.25; camKick = 0.008;
        this.lastGun = gi;
        break;
      }
      case 'shotgun': case 'dshotgun': {
        for (let i = 0; i < w.pellets; i++) game.hitscan(o, spreadDir(w.spread), w.dmg * dmgMul, 120, { tracer: i % 3 === 0, muzzle, pellet: true });
        game.audio.play(w.id === 'shotgun' ? 'shotgun' : 'dshotgun');
        kick = w.id === 'dshotgun' ? 0.16 : 0.1; kickRot = w.id === 'dshotgun' ? 0.35 : 0.22; camKick = w.id === 'dshotgun' ? 0.03 : 0.018;
        game.effects.addShake(w.id === 'dshotgun' ? 0.15 : 0.08);
        this.flashGun(w.id);
        break;
      }
      case 'tommy': case 'minigun': {
        game.hitscan(o, spreadDir(w.spread), w.dmg * dmgMul, 250, { tracer: Math.random() < 0.5, muzzle });
        game.audio.play(w.id, { vol: 0.8 });
        kick = 0.025; kickRot = 0.03; camKick = w.id === 'minigun' ? 0.0025 : 0.004;
        this.flashGun(w.id);
        break;
      }
      case 'rocket': {
        game.projectiles.spawn('rocket', muzzle, scale(d, 45), 'player', { dmg: 100 * dmgMul, splash: 90 * dmgMul, radius: 5 });
        game.audio.play('rocket');
        kick = 0.14; kickRot = 0.15; camKick = 0.02;
        this.flashGun('rocket');
        break;
      }
      case 'grenade': {
        const v = scale(d, 26); v.y += 4;
        game.projectiles.spawn('grenade', muzzle, v, 'player', { dmg: 100 * dmgMul, splash: 110 * dmgMul, radius: 5.5 });
        game.audio.play('grenade');
        kick = 0.1; kickRot = 0.15; camKick = 0.012;
        flash = false;
        if (this.models.grenade[0].drum) this.models.grenade[0].drum.rotation.y += Math.PI / 4;
        break;
      }
      case 'laser': {
        const m = this.models.laser[0];
        const i = this.laserIdx++ % 4;
        const mp = m.muzzles[i];
        const lm = { x: muzzle.x + r.x * (mp.x * 1.5) + u.x * mp.y * 1.5, y: muzzle.y + r.y * mp.x * 1.5 + u.y * mp.y * 1.5, z: muzzle.z + r.z * mp.x * 1.5 + u.z * mp.y * 1.5 };
        game.projectiles.spawn('laser', lm, scale(spreadDir(0.006), 110), 'player', { dmg: 20 * dmgMul });
        game.audio.play('laser', { vol: 0.8 });
        kick = 0.02; kickRot = 0.02; camKick = 0.002;
        flashCol = 0x44ffcc;
        this.flashGun('laser', 0, i);
        break;
      }
      case 'cannon': {
        const power = 0.35 + this.charge * 0.65;
        game.projectiles.spawn('cannonball', muzzle, scale(d, 30 + 45 * power), 'player', { dmg: 700 * dmgMul, splash: 250 * dmgMul, radius: 7 });
        game.audio.play('cannon');
        kick = 0.3; kickRot = 0.4; camKick = 0.05;
        game.effects.addShake(0.35);
        this.flashGun('cannon');
        break;
      }
    }
    this.kick += kick; this.kickRot += kickRot;
    game.player.pitch += camKick * (0.7 + Math.random() * 0.6);
    // eject brass (bullets) / red hulls (shells) to the right
    if (w.id === 'tommy' || w.id === 'minigun' || w.id === 'shotgun' || w.id === 'dshotgun') {
      const shell = w.ammo === 'shells';
      const n = w.id === 'dshotgun' ? 2 : 1;
      for (let i = 0; i < n; i++) {
        const ex = o.x + d.x * 0.35 + r.x * 0.22 - u.x * 0.12, ey = o.y + d.y * 0.35 + r.y * 0.22 - u.y * 0.12, ez = o.z + d.z * 0.35 + r.z * 0.22 - u.z * 0.12;
        const sp = 2.5 + Math.random() * 1.5;
        const c = shell ? [0.7, 0.08, 0.05] : [0.85, 0.62, 0.2];
        game.effects.alpha.spawn(ex, ey, ez, r.x * sp + u.x * 2, r.y * sp + 2.2, r.z * sp + u.z * 2, 0.9, shell ? 0.07 : 0.045, shell ? 0.07 : 0.045, c[0], c[1], c[2], c[0], c[1], c[2], 1, 16, 0.5);
      }
    }
    if (flash) {
      game.effects.flash(muzzle.x, muzzle.y, muzzle.z, flashCol, 12, 8, 0.06);
      this.flashLight.intensity = 3; this.flashLight.color.set(flashCol);
    }
  }

  flashGun(id, gi = 0, only = -1) {
    const m = this.models[id][gi];
    m.flashes.forEach((f, i) => {
      if (only >= 0 && i !== only) return;
      f.visible = true; f.material.rotation = Math.random() * Math.PI * 2;
    });
    this.flashT = 0.05;
  }

  animate(dt, input) {
    const w = this.def();
    if (!w) return;
    const p = this.game.player;
    this.flashT -= dt;
    if (this.flashT <= 0) for (const list of Object.values(this.models)) for (const m of list) for (const f of m.flashes) f.visible = false;
    this.flashLight.intensity = Math.max(0, this.flashLight.intensity - dt * 60);
    // spring back recoil
    this.kick = damp(this.kick, 0, dt, 12);
    this.kickRot = damp(this.kickRot, 0, dt, 10);
    // sway from mouse
    this.swayX = damp(this.swayX, clamp(-input.mouseDX * 0.0006, -0.04, 0.04), dt, 8);
    this.swayY = damp(this.swayY, clamp(input.mouseDY * 0.0006, -0.04, 0.04), dt, 8);
    const bob = p.bob * 2, amt = p.bobAmt;
    let lower = 0;
    if (this.state === 'lower') lower = Math.min(1, this.stateT / 0.14);
    else if (this.state === 'raise') lower = 1 - Math.min(1, this.stateT / 0.2);
    const [px, py, pz] = w.pos;
    this.holder.position.set(0, 0, 0);
    const list = this.models[w.id];
    list.forEach((m, i) => {
      const side = i === 0 ? 1 : -1;
      const g = m.group;
      const isKick = w.id !== 'revolver' || !this.dual || this.lastGun === i;
      const k = isKick ? this.kick : this.kick * 0.2, kr = isKick ? this.kickRot : this.kickRot * 0.2;
      g.position.set(
        px * side + Math.sin(bob * 0.5) * 0.012 * amt + this.swayX,
        py + Math.abs(Math.cos(bob * 0.5)) * 0.012 * amt + this.swayY - lower * 0.35 - p.landKick * 0.3,
        pz + k,
      );
      g.rotation.set(kr + (w.rot?.[0] || 0), (w.rot?.[1] || 0) * side, (w.rot?.[2] || 0) * side);
      if (w.id === 'revolver' && this.reloadT > 0) g.rotation.x += Math.sin((1 - this.reloadT / w.reload) * Math.PI) * 0.9;
      if (w.id === 'revolver' && this.reloadT > 0) g.rotation.z += (1 - this.reloadT / w.reload) * Math.PI * 2 * side;
    });
    if (w.id === 'knife' && this.knifeT > 0) {
      this.knifeT -= dt;
      const t = 1 - this.knifeT / 0.35;
      const g = list[0].group;
      g.position.x -= Math.sin(t * Math.PI) * 0.22;
      g.position.z -= Math.sin(t * Math.PI) * 0.15;
      g.rotation.z += Math.sin(t * Math.PI) * 1.2;
      g.rotation.y += Math.sin(t * Math.PI) * 0.6;
    }
    if (w.id === 'cannon' && this.charging) {
      const g = list[0].group;
      g.position.z += this.charge * 0.06;
      g.position.x += (Math.random() - 0.5) * this.charge * 0.006;
    }
    if (w.id === 'shotgun' && this.cool > 0) {
      const t = 1 - this.cool / w.rate;
      list[0].pump.position.z = -0.2 + (t > 0.3 && t < 0.8 ? Math.sin((t - 0.3) / 0.5 * Math.PI) * 0.08 : 0);
    }
    if (w.id === 'laser') {
      // laser glows pulse
      list[0].group.children.forEach((c) => { if (c.material && c.material.emissive && c.material.emissive.g > 0.5) c.material.emissiveIntensity = 1.1 + Math.sin(performance.now() * 0.01) * 0.35; });
    }
  }

  resize(aspect) { this.camera.aspect = aspect; this.camera.updateProjectionMatrix(); }
}

// Sam's forearm + hand gripping the weapon at grip point h (model space).
function addArm(group, h, index, skin, sleeve) {
  const hand = new THREE.Group();
  hand.position.set(h[0], h[1], h[2]);
  group.add(hand);
  const palm = new THREE.Mesh(new THREE.CapsuleGeometry(0.036, 0.05, 4, 10), skin);
  palm.rotation.x = Math.PI / 2;
  palm.scale.set(1.05, 1, 1.15);
  hand.add(palm);
  for (let i = 0; i < 3; i++) {
    const f = new THREE.Mesh(new THREE.CapsuleGeometry(0.013, 0.05, 3, 6), skin);
    f.position.set(index ? 0.03 : -0.03, -0.012, -0.03 + i * 0.024);
    f.rotation.z = Math.PI / 2;
    hand.add(f);
  }
  const arm = new THREE.Group();
  hand.add(arm);
  // right arm comes from the lower right, left arm reaches across from lower left
  const target = index === 0 ? new THREE.Vector3(0.14, -0.38, 0.5) : new THREE.Vector3(-0.32, -0.32, 0.42);
  arm.lookAt(target);
  const fore = new THREE.Mesh(new THREE.CapsuleGeometry(0.036, 0.46, 4, 10), skin);
  fore.rotation.x = Math.PI / 2;
  fore.position.z = 0.27;
  fore.scale.set(1, 1, 0.9);
  arm.add(fore);
  const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.058, 0.052, 0.2, 12), sleeve);
  cuff.rotation.x = Math.PI / 2;
  cuff.position.z = 0.6;
  arm.add(cuff);
}

function scale(v, s) { return { x: v.x * s, y: v.y * s, z: v.z * s }; }
function damp(a, b, dt, l) { return a + (b - a) * (1 - Math.exp(-l * dt)); }
void rand;
