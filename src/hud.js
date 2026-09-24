// DOM-based heads-up display: vitals, ammo, weapon bar, score, messages,
// boss bar, damage direction indicators and screen flashes.
import { WEAPONS, MAX_AMMO } from './weapons.js';

const $ = (id) => document.getElementById(id);

const AMMO_LABEL = { shells: 'Shells', bullets: 'Bullets', rockets: 'Rockets', grenades: 'Grenades', cells: 'Cells', cannonballs: 'Cannonballs' };
const AMMO_ICON = { shells: '▮', bullets: '•', rockets: '➤', grenades: '●', cells: '⚡', cannonballs: '⬤' };

export class HUD {
  constructor(game) {
    this.game = game;
    this.root = $('hud');
    this.el = {
      health: $('hud-health-val'), armor: $('hud-armor-val'), healthBox: $('hud-health'),
      ammo: $('hud-ammo-val'), ammoIcon: $('hud-ammo-icon'), weapon: $('hud-weapon-name'),
      ammoList: $('hud-ammolist'), weapons: $('hud-weapons'),
      score: $('hud-score-val'), kills: $('hud-kills-val'), level: $('hud-level'),
      msg: $('hud-msg'), log: $('hud-log'), boss: $('hud-boss'), bossFill: $('hud-boss-fill'), bossName: $('hud-boss-name'),
      power: $('hud-power'), vignette: $('fx-damage'), pickup: $('fx-pickup'), hit: $('hitmarker'),
      dmgDirs: $('dmg-dirs'), card: $('level-card'), cardName: $('level-card-name'), cardSub: $('level-card-sub'),
      fps: $('hud-fps'), charge: $('hud-charge'), chargeFill: $('hud-charge-fill'), crosshair: $('crosshair'),
      serious: $('fx-serious'),
    };
    this.cache = {};
    this.msgT = 0;
    this.hitT = 0;
    this.pickupT = 0;
    this.cardT = 0;
    this.frames = 0; this.fpsT = 0;
    this.buildAmmoList();
    this.buildWeaponBar();
  }

  buildAmmoList() {
    this.el.ammoList.innerHTML = '';
    this.ammoRows = {};
    for (const k of Object.keys(MAX_AMMO)) {
      const row = document.createElement('div');
      row.className = 'ammo-row';
      row.innerHTML = `<span class="ai">${AMMO_ICON[k]}</span><span class="an">${AMMO_LABEL[k]}</span><span class="ab"><i></i></span><span class="av">0</span>`;
      this.el.ammoList.appendChild(row);
      this.ammoRows[k] = { row, bar: row.querySelector('i'), val: row.querySelector('.av') };
    }
  }

  buildWeaponBar() {
    this.el.weapons.innerHTML = '';
    this.slots = {};
    for (const w of WEAPONS) {
      const d = document.createElement('div');
      d.className = 'wslot';
      d.innerHTML = `<b>${w.key.replace('Digit', '')}</b><span>${w.short}</span>`;
      this.el.weapons.appendChild(d);
      this.slots[w.id] = d;
    }
  }

  set(key, el, value, prop = 'textContent') {
    if (this.cache[key] === value) return;
    this.cache[key] = value;
    el[prop] = value;
  }

  show(v) { this.root.style.display = v ? 'block' : 'none'; }

  message(text, dur = 2.5, cls = '') {
    this.el.msg.textContent = text;
    this.el.msg.className = 'show ' + cls;
    this.msgT = dur;
  }

  log(text, color = '#ffe9a0') {
    const d = document.createElement('div');
    d.textContent = text;
    d.style.color = color;
    this.el.log.appendChild(d);
    while (this.el.log.children.length > 5) this.el.log.firstChild.remove();
    setTimeout(() => { d.classList.add('fade'); setTimeout(() => d.remove(), 600); }, 2600);
  }

  pickupFlash(color = 'rgba(255,220,120,0.25)') {
    this.el.pickup.style.background = color;
    this.el.pickup.style.opacity = 1;
    this.pickupT = 0.25;
  }

  hitmarker(kill = false) {
    this.hitT = kill ? 0.25 : 0.12;
    this.el.hit.className = kill ? 'show kill' : 'show';
  }

  damageFrom(relAngle) {
    const d = document.createElement('div');
    d.className = 'dmg-dir';
    d.style.transform = `rotate(${(-relAngle * 180) / Math.PI}deg)`;
    this.el.dmgDirs.appendChild(d);
    setTimeout(() => d.remove(), 900);
  }

  levelCard(name, sub) {
    this.el.cardName.textContent = name;
    this.el.cardSub.textContent = sub;
    this.el.card.classList.remove('show');
    void this.el.card.offsetWidth;
    this.el.card.classList.add('show');
  }

  weaponChanged() {
    const w = this.game.weapons.def();
    if (w) this.log(w.name, '#9fe0ff');
  }

  update(dt) {
    const g = this.game, p = g.player, W = g.weapons;
    const hp = Math.ceil(p.health), ar = Math.ceil(p.armor);
    this.set('hp', this.el.health, String(hp));
    this.set('ar', this.el.armor, String(ar));
    this.set('hpc', this.el.healthBox, hp <= 25 ? 'vital low' : hp > 100 ? 'vital over' : 'vital', 'className');
    const w = W.def();
    if (w) {
      this.set('wn', this.el.weapon, w.name);
      const ammo = w.ammo ? String(W.ammo[w.ammo]) : w.id === 'revolver' ? String(W.dual ? W.clip[0] + W.clip[1] : W.clip[0]) : '∞';
      this.set('am', this.el.ammo, ammo);
      this.set('ai', this.el.ammoIcon, w.ammo ? AMMO_ICON[w.ammo] : w.melee ? '†' : '•');
    }
    for (const k of Object.keys(MAX_AMMO)) {
      const r = this.ammoRows[k];
      this.set('a_' + k, r.val, String(W.ammo[k]));
      this.set('ab_' + k, r.bar.style, `${(W.ammo[k] / MAX_AMMO[k]) * 100}%`, 'width');
      this.set('ac_' + k, r.row, 'ammo-row' + (w && w.ammo === k ? ' cur' : '') + (W.ammo[k] === 0 ? ' empty' : ''), 'className');
    }
    for (const wd of WEAPONS) {
      const cls = 'wslot' + (W.owned.has(wd.id) ? ' own' : '') + (W.current === wd.id ? ' cur' : '') + (W.owned.has(wd.id) && !W.hasAmmo(wd.id) ? ' dry' : '');
      this.set('ws_' + wd.id, this.slots[wd.id], cls, 'className');
    }
    this.set('sc', this.el.score, String(g.stats.score));
    this.set('kl', this.el.kills, `${g.stats.kills} / ${g.stats.total}`);
    // charge meter (cannon)
    const charging = W.charging;
    this.set('chv', this.el.charge.style, charging ? 'block' : 'none', 'display');
    if (charging) this.el.chargeFill.style.width = `${W.charge * 100}%`;
    // boss
    if (g.boss && (g.boss.alive || g.boss.state === 'dying')) {
      this.set('bv', this.el.boss.style, 'block', 'display');
      this.el.bossFill.style.width = `${Math.max(0, g.boss.hp / g.boss.maxHp) * 100}%`;
      this.set('bn', this.el.bossName, g.boss.def.name);
    } else this.set('bv', this.el.boss.style, 'none', 'display');
    // serious damage
    if (p.seriousDamage > 0) {
      this.set('pw', this.el.power.style, 'block', 'display');
      this.el.power.textContent = `SERIOUS DAMAGE ${Math.ceil(p.seriousDamage)}`;
    } else this.set('pw', this.el.power.style, 'none', 'display');
    this.set('ser', this.el.serious.style, p.seriousDamage > 0 ? '1' : '0', 'opacity');
    // effects
    this.el.vignette.style.opacity = Math.min(1, p.hurtT * 1.2 + (hp <= 25 && p.alive ? 0.25 + Math.sin(performance.now() * 0.006) * 0.1 : 0) + (p.alive ? 0 : 0.8));
    if (this.pickupT > 0) { this.pickupT -= dt; if (this.pickupT <= 0) this.el.pickup.style.opacity = 0; }
    if (this.hitT > 0) { this.hitT -= dt; if (this.hitT <= 0) this.el.hit.className = ''; }
    if (this.msgT > 0) { this.msgT -= dt; if (this.msgT <= 0) this.el.msg.className = ''; }
    // fps
    this.frames++; this.fpsT += dt;
    if (this.fpsT >= 0.5) {
      this.el.fps.textContent = `${Math.round(this.frames / this.fpsT)} FPS`;
      this.frames = 0; this.fpsT = 0;
    }
  }
}
