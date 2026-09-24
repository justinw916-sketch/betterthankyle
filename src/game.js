// Game orchestrator: renderer & post-processing, level lifecycle, encounters,
// combat resolution (hitscan / melee / explosions), state machine and menus.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { Input } from './input.js';
import { AudioSystem } from './audio.js';
import { getMaterials } from './textures.js';
import { LevelBuilder } from './levelbuilder.js';
import { LEVELS, THEMES, makeWater } from './levels.js';
import { Player, PLAYER } from './player.js';
import { Weapons } from './weapons.js';
import { EnemyManager, ENEMY_DEFS } from './enemies.js';
import { Projectiles } from './projectiles.js';
import { Effects } from './effects.js';
import { Pickups } from './pickups.js';
import { HUD } from './hud.js';
import { World } from './world.js';
import { rand } from './util.js';

export const DIFFICULTIES = [
  { id: 'tourist', name: 'Tourist', hp: 0.6, dmg: 0.35 },
  { id: 'easy', name: 'Easy', hp: 0.8, dmg: 0.65 },
  { id: 'normal', name: 'Normal', hp: 1.0, dmg: 1.0 },
  { id: 'hard', name: 'Hard', hp: 1.25, dmg: 1.35 },
  { id: 'serious', name: 'Serious', hp: 1.5, dmg: 1.8 },
];

const DEFAULT_SETTINGS = { sensitivity: 1.0, invertY: false, fov: 90, quality: 'high', volume: 0.8, music: 0.55, difficulty: 2, showFps: false };

const SKY_VERT = /* glsl */`
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}`;
const SKY_FRAG = /* glsl */`
uniform vec3 top; uniform vec3 horizon; uniform vec3 bottom; uniform vec3 sunDir; uniform vec3 sunColor;
uniform float time; uniform float clouds; uniform float stars; uniform float moon;
varying vec3 vDir;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}
float fbm(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { s += noise(p) * a; p *= 2.03; a *= 0.5; } return s; }
void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 col = h > 0.0 ? mix(horizon, top, pow(clamp(h, 0.0, 1.0), 0.55)) : mix(horizon, bottom, pow(clamp(-h, 0.0, 1.0), 0.35));
  float s = max(dot(d, normalize(sunDir)), 0.0);
  if (moon > 0.5) {
    col += sunColor * (smoothstep(0.9993, 0.9996, s) * 3.0 + pow(s, 60.0) * 0.25);
  } else {
    col += sunColor * (smoothstep(0.9992, 0.9996, s) * 12.0 + pow(s, 24.0) * 0.5 + pow(s, 4.0) * 0.18);
  }
  if (h > 0.0) {
    vec2 uv = d.xz / (h + 0.12) * 1.3 + vec2(time * 0.006, time * 0.002);
    float n = fbm(uv * 1.5);
    float c = smoothstep(0.52, 0.85, n) * clouds * smoothstep(0.0, 0.25, h);
    vec3 cc = mix(horizon * 1.05, vec3(1.0), 0.5) + sunColor * pow(s, 6.0) * 0.4;
    if (moon > 0.5) cc = horizon * 1.4;
    col = mix(col, cc, c);
    if (stars > 0.5) {
      vec2 g = floor(d.xz / (h + 0.3) * 240.0);
      float st = step(0.9965, hash(g)) * (0.5 + 0.5 * sin(time * 2.0 + hash(g + 3.0) * 20.0));
      col += vec3(st) * (1.0 - c) * smoothstep(0.05, 0.3, h) * 1.5;
    }
  }
  gl_FragColor = vec4(col, 1.0);
}`;

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.settings = { ...DEFAULT_SETTINGS };
    try { Object.assign(this.settings, JSON.parse(localStorage.getItem('sam.settings') || '{}')); } catch { /* ignore */ }
    try { this.progress = JSON.parse(localStorage.getItem('sam.progress') || '{"unlocked":1}'); } catch { this.progress = { unlocked: 1 }; }
    this.state = 'loading';
    this.levelIndex = 0;
    this.stats = { score: 0, kills: 0, total: 0, time: 0, secrets: 0 };
    this.collected = new Set();

    const r = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFShadowMap;
    r.info.autoReset = false;
    r.autoClear = false;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(this.settings.fov * 0.75, 1, 0.1, 1500);
    this.camera.rotation.order = 'YXZ';
    this.scene.add(this.camera);

    // sky
    this.skyUniforms = {
      top: { value: new THREE.Color() }, horizon: { value: new THREE.Color() }, bottom: { value: new THREE.Color() },
      sunDir: { value: new THREE.Vector3(0, 1, 0) }, sunColor: { value: new THREE.Color() }, time: { value: 0 },
      clouds: { value: 0.5 }, stars: { value: 0 }, moon: { value: 0 },
    };
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(1000, 32, 16), new THREE.ShaderMaterial({
      vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, uniforms: this.skyUniforms, side: THREE.BackSide, depthWrite: false, fog: false,
    }));
    this.sky.renderOrder = -10;
    this.sky.frustumCulled = false;
    this.scene.add(this.sky);

    // lights
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x886644, 1);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xffffff, 3);
    this.sun.castShadow = true;
    const sc = this.sun.shadow.camera;
    sc.left = -60; sc.right = 60; sc.top = 60; sc.bottom = -60; sc.near = 1; sc.far = 400;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.04;
    this.scene.add(this.sun, this.sun.target);
    this.sunDir = new THREE.Vector3(0.5, 0.7, 0.3).normalize();
    this.scene.fog = new THREE.Fog(0xffffff, 100, 500);

    this.world = new World();
    this.input = new Input(canvas);
    this.audio = new AudioSystem();
    this.effects = new Effects(this.scene);
    this.player = new Player(this);
    this.weapons = new Weapons(this);
    this.enemies = new EnemyManager(this);
    this.projectiles = new Projectiles(this);
    this.pickups = new Pickups(this);
    this.hud = new HUD(this);
    this.levelGroup = null;
    this.boss = null;

    // post-processing
    const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(r, rt);
    this.renderPass = new RenderPass(this.scene, this.camera);
    this.weaponPass = new RenderPass(this.weapons.scene, this.weapons.camera);
    this.weaponPass.clear = false;
    this.weaponPass.clearDepth = true;
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.5, 0.45, 0.92);
    this.composer.addPass(this.renderPass);
    this.composer.addPass(this.weaponPass);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    this.applyQuality();
    addEventListener('resize', () => this.resize());
    this.resize();

    this.input.onLockChange = (locked) => {
      if (!locked && this.state === 'playing') this.pause();
    };
    this.lastT = performance.now();
    this.time = 0;
    this.pmrem = new THREE.PMREMGenerator(r);
    // small sky-only scene used to bake an environment map per theme (metal reflections)
    this.envScene = new THREE.Scene();
    const envSky = new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), new THREE.ShaderMaterial({
      vertexShader: SKY_VERT.replace('p.xyww', 'p'), fragmentShader: SKY_FRAG, uniforms: this.skyUniforms, side: THREE.BackSide, depthWrite: false,
    }));
    const envGround = new THREE.Mesh(new THREE.CircleGeometry(50, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x8a6a44 }));
    envGround.position.y = -2;
    this.envScene.add(envSky, envGround);
    this.envGround = envGround;
    this.loop = this.loop.bind(this);
  }

  get difficulty() { return DIFFICULTIES[this.settings.difficulty] || DIFFICULTIES[2]; }

  saveSettings() { try { localStorage.setItem('sam.settings', JSON.stringify(this.settings)); } catch { /* ignore */ } }
  saveProgress() { try { localStorage.setItem('sam.progress', JSON.stringify(this.progress)); } catch { /* ignore */ } }

  applyQuality() {
    const q = this.settings.quality;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const scale = { low: 0.6, medium: 0.85, high: 1, ultra: 1 }[q] ?? 1;
    this.pixelRatio = q === 'ultra' ? dpr : Math.min(dpr, 1.25) * scale;
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.shadowMap.enabled = q !== 'low';
    const sm = { low: 512, medium: 1024, high: 2048, ultra: 4096 }[q] ?? 2048;
    if (this.sun.shadow.mapSize.x !== sm) {
      this.sun.shadow.mapSize.set(sm, sm);
      if (this.sun.shadow.map) { this.sun.shadow.map.dispose(); this.sun.shadow.map = null; }
    }
    this.bloom.enabled = q !== 'low';
    this.camera.fov = this.settings.fov * 0.75;
    this.camera.updateProjectionMatrix();
    this.audio.setVolumes({ master: this.settings.volume, music: this.settings.music });
    document.getElementById('hud-fps').style.display = this.settings.showFps ? 'block' : 'none';
    this.resize();
  }

  resize() {
    const w = innerWidth, h = innerHeight;
    this.renderer.setSize(w, h, false);
    this.composer.setPixelRatio(this.pixelRatio);
    this.composer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.weapons.resize(w / h);
    const fovRad = (this.camera.fov * Math.PI) / 180;
    this.effects.setScale((h * this.pixelRatio) / (2 * Math.tan(fovRad / 2)));
  }

  async init(onProgress) {
    onProgress?.('Carving hieroglyphs...');
    await new Promise((r) => setTimeout(r, 20));
    getMaterials();
    onProgress?.('Summoning the horde...');
    await new Promise((r) => setTimeout(r, 20));
    // Warm up: build first level off-screen so shaders compile before play.
    this.loadLevel(0, null, true);
    this.renderer.compile(this.scene, this.camera);
    this.state = 'menu';
    requestAnimationFrame(this.loop);
  }

  async ensureAudio() {
    if (!this.audio.ctx) {
      await this.audio.init();
      this.audio.setVolumes({ master: this.settings.volume, music: this.settings.music });
    }
    this.audio.resume();
  }

  // ------------------------------------------------------------------ levels
  newGame(levelIndex = 0) {
    this.carry = null;
    this.stats.score = 0;
    this.startLevel(levelIndex);
  }

  startLevel(i, checkpoint = null) {
    this.loadLevel(i, checkpoint);
    this.state = 'playing';
    this.ui?.hideAll();
    this.hud.show(true);
    this.input.lock();
    const L = LEVELS[i];
    document.getElementById('hud-level').textContent = `${i + 1}. ${L.name}`;
    if (!checkpoint) this.hud.levelCard(L.name, L.subtitle);
    this.audio.startMusic(L.music);
  }

  loadLevel(i, checkpoint = null, warmup = false) {
    const def = LEVELS[i];
    this.levelIndex = i;
    this.levelDef = def;
    // teardown
    if (this.levelGroup) {
      this.scene.remove(this.levelGroup);
      this.levelGroup.traverse((o) => { if (o.isMesh && o.geometry && !o.geometry.userData.shared) o.geometry.dispose(); });
    }
    this.enemies.clear(); this.projectiles.clear(); this.pickups.clear(); this.effects.clear();
    this.boss = null; this.bossGoneT = 0;
    // build
    const b = new LevelBuilder(def);
    def.build(b);
    const theme = THEMES[def.theme];
    if (!b.customScenery) b.scenery({ night: def.theme === 'night' });
    b.finish();
    if (b.water) b.group.add(makeWater(b.water, def.theme === 'night'));
    this.level = b;
    this.world = b.world;
    this.effects.world = this.world;
    this.levelGroup = b.group;
    this.scene.add(b.group);
    this.applyTheme(theme);
    this.buildExit(b.exit);

    // encounters
    this.spawnQueue = [];
    this.encounters = b.encounters.map((e) => ({ ...e, state: 'idle', wave: 0, waveT: 0, spawned: 0 }));
    this.stats.total = 0;
    for (const e of this.encounters) for (const w of e.waves) for (const s of w.spawn) this.stats.total += s[1];
    this.stats.kills = 0; this.stats.time = 0; this.stats.levelScoreStart = this.stats.score;

    // player & inventory
    this.player.reset();
    if (checkpoint) {
      this.collected = new Set(checkpoint.collected);
      for (const e of this.encounters) {
        if (checkpoint.done.includes(e.id)) {
          e.state = 'done';
          for (const d of e.open || []) this.openDoor(d, true);
          for (const w of e.waves) for (const s of w.spawn) this.stats.kills += s[1];
        }
      }
      this.stats.score = checkpoint.score;
      this.player.health = checkpoint.health; this.player.armor = checkpoint.armor;
      this.weapons.reset(checkpoint.weapons);
      this.player.place(checkpoint.x, checkpoint.z, checkpoint.yaw);
    } else {
      this.collected = new Set();
      if (this.carry) {
        this.player.health = Math.max(100, this.carry.health); this.player.armor = this.carry.armor;
        this.weapons.reset(this.carry.weapons);
      } else if (def.loadout) {
        // starting a later level from Level Select: give a fair arsenal
        this.weapons.reset({ owned: def.loadout.owned, ammo: def.loadout.ammo, dual: true, current: def.loadout.owned[def.loadout.owned.length - 1] });
        this.player.armor = def.loadout.armor || 0;
      } else this.weapons.reset();
      this.player.place(b.spawn.x, b.spawn.z, b.spawn.yaw);
    }
    b.pickups.forEach((p, idx) => { if (!this.collected.has(idx)) this.pickups.add(p.kind, p.sub, p.x, p.y, p.z, { index: idx }); });
    this.levelStart = checkpoint ? null : { health: this.player.health, armor: this.player.armor, weapons: this.weapons.snapshot() };
    if (!checkpoint) this.checkpoint = null;
    this.deadT = 0;
    this.completeT = 0;
    if (warmup) this.state = 'menu';
  }

  applyTheme(t) {
    const U = this.skyUniforms;
    U.top.value.set(t.skyTop); U.horizon.value.set(t.skyHorizon); U.bottom.value.set(t.skyBottom);
    U.sunColor.value.set(t.sunColor);
    this.sunDir.set(...t.sunDir).normalize();
    U.sunDir.value.copy(this.sunDir);
    U.clouds.value = t.clouds; U.stars.value = t.stars ? 1 : 0; U.moon.value = t.moon ? 1 : 0;
    this.sun.color.set(t.sunColor); this.sun.intensity = t.sunIntensity;
    this.hemi.color.set(t.hemi[0]); this.hemi.groundColor.set(t.hemi[1]); this.hemi.intensity = t.hemi[2];
    this.scene.fog.color.set(t.fog[0]); this.scene.fog.near = t.fog[1]; this.scene.fog.far = t.fog[2];
    this.renderer.toneMappingExposure = t.exposure;
    this.weapons.sun.color.set(t.sunColor);
    this.weapons.sun.intensity = t.moon ? 1.4 : 2.2;
    // bake environment reflections from the sky
    this.envGround.material.color.set(t.skyBottom).multiplyScalar(0.5);
    if (this.envRT) this.envRT.dispose();
    this.envRT = this.pmrem.fromScene(this.envScene, 0.02, 0.1, 200);
    this.scene.environment = this.envRT.texture;
    this.scene.environmentIntensity = t.moon ? 0.6 : 0.45;
    this.weapons.scene.environment = this.envRT.texture;
    this.weapons.scene.environmentIntensity = t.moon ? 0.9 : 0.8;
  }

  buildExit(ex) {
    this.exit = null;
    if (!ex) return;
    const g = new THREE.Group();
    g.position.set(ex.x, 0, ex.z);
    const ringMat = new THREE.MeshStandardMaterial({ color: 0x223344, emissive: 0x33aaff, emissiveIntensity: 0.3, metalness: 0.8, roughness: 0.3 });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.6, 0.18, 12, 40), ringMat);
    ring.position.y = 2.1;
    const disc = new THREE.Mesh(new THREE.CircleGeometry(1.5, 40), new THREE.MeshBasicMaterial({ color: 0x66ccff, transparent: true, opacity: 0.0, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false }));
    disc.position.y = 2.1;
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 60, 24, 1, true), new THREE.MeshBasicMaterial({ color: 0x3399ff, transparent: true, opacity: 0.0, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false }));
    beam.position.y = 30;
    const base = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.4, 0.3, 24), getMaterials().gold);
    base.position.y = 0.15; base.receiveShadow = true;
    g.add(ring, disc, beam, base);
    this.levelGroup.add(g);
    this.exit = { ...ex, g, ring, disc, beam, ringMat, active: false };
  }

  openDoor(id, instant = false) {
    const d = this.level.doors[id];
    if (!d || d.state === 'open' || d.state === 'opening') return;
    if (instant) { d.state = 'open'; d.box.active = false; d.mesh.position.y = -d.h / 2 + 0.05; d.mesh.visible = false; return; }
    d.state = 'opening'; d.t = 0; d.mesh.visible = true;
    this.audio.play('door', { pos: { x: d.cx, y: 2, z: d.cz }, range: 40 });
  }

  closeDoor(id) {
    const d = this.level.doors[id];
    if (!d || d.state === 'closed' || d.state === 'closing') return;
    // never close a door on top of the player: nudge them through it first
    d.state = 'closing'; d.t = 0; d.mesh.visible = true; d.box.active = true;
    const p = this.player.pos;
    const b = d.box;
    if (p.x > b.minX - 0.5 && p.x < b.maxX + 0.5 && p.z > b.minZ - 0.5 && p.z < b.maxZ + 0.5) p.z = b.minZ - 0.6;
    this.audio.play('door', { pos: { x: d.cx, y: 2, z: d.cz }, range: 40 });
  }

  updateDoors(dt) {
    for (const d of Object.values(this.level.doors)) {
      if (d.state === 'opening') {
        d.t += dt / 2.2;
        d.mesh.position.y = d.h / 2 - Math.min(1, d.t) * (d.h - 0.05);
        if (d.t > 0.5) d.box.active = false;
        this.effects.addShake(0.006);
        if (Math.random() < 0.4) this.effects.dust(d.cx + rand(-3, 3), 0.2, d.cz + rand(-1, 1), 0, 1, 0, 1);
        if (d.t >= 1) { d.state = 'open'; d.mesh.visible = false; }
      } else if (d.state === 'closing') {
        d.t += dt / 1.2;
        d.mesh.position.y = -d.h / 2 + 0.05 + Math.min(1, d.t) * (d.h - 0.05);
        if (d.t >= 1) { d.state = 'closed'; d.mesh.position.y = d.h / 2; }
      }
    }
  }

  // ------------------------------------------------------------ encounters
  updateEncounters(dt) {
    for (let i = this.spawnQueue.length - 1; i >= 0; i--) {
      const q = this.spawnQueue[i];
      q.t -= dt;
      if (q.t <= 0) { this.spawnQueue.splice(i, 1); this.enemies.spawnSafe(q.type, q.x, q.z, q.spread, { encounter: q.enc, bounds: q.bounds }); }
    }
    const p = this.player.pos;
    for (const e of this.encounters) {
      if (e.state === 'idle') {
        const [x0, z0, x1, z1] = e.area;
        if (p.x > x0 && p.x < x1 && p.z > z0 && p.z < z1) {
          e.state = 'active'; e.wave = 0; e.waveT = 0.6;
          for (const d of e.lock || []) this.closeDoor(d);
        }
        continue;
      }
      if (e.state !== 'active') continue;
      let alive = 0;
      for (const en of this.enemies.list) if (en.alive && en.encounter === e.id) alive++;
      for (const q of this.spawnQueue) if (q.enc === e.id) alive++;
      e.waveT -= dt;
      if (e.wave < e.waves.length) {
        const w = e.waves[e.wave];
        if (e.waveT <= 0 && alive <= (w.when ?? 0)) {
          this.spawnWave(e, w);
          e.wave++;
          e.waveT = 2.5;
        }
      } else if (alive === 0 && e.waveT <= 0) {
        e.state = 'done';
        for (const d of e.open || []) this.openDoor(d);
        if (e.message) this.hud.message(e.message, 3);
        if (e.checkpoint) this.saveCheckpoint(e.checkpoint);
      }
    }
  }

  spawnWave(e, w) {
    if (w.msg) this.hud.message(w.msg, 2.5, 'big');
    // stagger spawns slightly (in game time) so hordes pour in
    const [x0, z0, x1, z1] = e.area;
    const bounds = [x0 - 1.5, z0 - 1.5, x1 + 1.5, z1 + 1.5];
    for (const [type, n, x, z, spread] of w.spawn) {
      for (let i = 0; i < n; i++) this.spawnQueue.push({ t: i * (type === 'kamikaze' ? 0.09 : 0.16), type, x, z, spread, enc: e.id, bounds });
    }
    this.audio.play('spawn', { vol: 0.7 });
    for (const [kind, sub, x, z] of w.items || []) this.pickups.add(kind, sub, x, this.world.groundHeight(x, z, 0.3, 50, 50), z, { effect: true });
  }

  saveCheckpoint(cp) {
    this.checkpoint = {
      ...cp, done: this.encounters.filter((e) => e.state === 'done').map((e) => e.id),
      health: Math.max(this.player.health, 50), armor: this.player.armor, weapons: this.weapons.snapshot(),
      score: this.stats.score, collected: [...this.collected],
    };
    this.hud.log('Checkpoint saved', '#9fe0ff');
  }

  // ------------------------------------------------------------ combat
  getAim() {
    const c = this.camera;
    const d = new THREE.Vector3(0, 0, -1).applyQuaternion(c.quaternion);
    const r = new THREE.Vector3(1, 0, 0).applyQuaternion(c.quaternion);
    const u = new THREE.Vector3(0, 1, 0).applyQuaternion(c.quaternion);
    return { o: { x: c.position.x, y: c.position.y, z: c.position.z }, d, r, u };
  }

  hitscan(o, d, dmg, range, opts = {}) {
    const wh = this.world.raycast(o.x, o.y, o.z, d.x, d.y, d.z, range);
    const maxT = wh ? wh.t : range;
    const eh = this.enemies.rayHit(o.x, o.y, o.z, d.x, d.y, d.z, maxT);
    const fx = this.effects;
    let end;
    if (eh) {
      const e = eh.enemy;
      const hx = o.x + d.x * eh.t, hy = o.y + d.y * eh.t, hz = o.z + d.z * eh.t;
      const mult = eh.head ? 2 : 1;
      e.damage(dmg * mult, d, opts.pellet ? 'pellet' : 'bullet');
      if (e.def.bloodless) fx.dust(hx, hy, hz, -d.x, -d.y, -d.z, 3, e.def.blood);
      else fx.blood(hx, hy, hz, d.x * 0.6, 0.3, d.z * 0.6, opts.pellet ? 3 : 6, e.def.blood);
      if (e.type === 'biomech' || e.type === 'boss' || e.type === 'arachnid') fx.sparks(hx, hy, hz, -d.x, -d.y, -d.z, 3);
      this.hud.hitmarker(!e.alive);
      end = { x: hx, y: hy, z: hz };
    } else if (wh) {
      const hx = o.x + d.x * wh.t, hy = o.y + d.y * wh.t, hz = o.z + d.z * wh.t;
      if (!opts.pellet || Math.random() < 0.5) {
        fx.sparks(hx, hy, hz, wh.nx, wh.ny, wh.nz, opts.pellet ? 2 : 4);
        fx.dust(hx, hy, hz, wh.nx, wh.ny, wh.nz, opts.pellet ? 1 : 3);
      }
      end = { x: hx, y: hy, z: hz };
    } else end = { x: o.x + d.x * range, y: o.y + d.y * range, z: o.z + d.z * range };
    if (opts.tracer && opts.muzzle) fx.tracer(opts.muzzle.x, opts.muzzle.y, opts.muzzle.z, end.x, end.y, end.z);
    return eh;
  }

  melee(o, d, range, dmg) {
    const hit = this.enemies.rayHit(o.x, o.y - 0.3, o.z, d.x, d.y, d.z, range, 0.5);
    if (!hit) return false;
    const e = hit.enemy;
    e.damage(dmg, d, 'melee');
    const hx = o.x + d.x * hit.t, hy = o.y + d.y * hit.t - 0.3, hz = o.z + d.z * hit.t;
    if (!e.def.bloodless) this.effects.blood(hx, hy, hz, d.x, 0.4, d.z, 14, e.def.blood);
    else this.effects.sparks(hx, hy, hz, -d.x, -d.y, -d.z, 8);
    this.hud.hitmarker(!e.alive);
    return true;
  }

  // Splash damage. owner: 'player' | 'enemy' | 'kamikaze'
  explode(x, y, z, radius, dmg, owner, scale = 1, directHit = null, hitPlayer = false) {
    this.effects.explosion(x, y, z, scale);
    const gy = this.world.groundHeight(x, z, 0.2, y + 0.5);
    if (y - gy < 1.5) this.effects.decal(x, z, radius * 0.5, gy + 0.02);
    if (owner === 'player' || owner === 'kamikaze') {
      for (const e of this.enemies.list) {
        if (!e.alive || e === directHit) continue;
        const cy = e.pos.y + e.def.h * 0.5;
        const d = Math.hypot(e.pos.x - x, cy - y, e.pos.z - z) - e.def.r;
        if (d < radius) {
          const f = 1 - Math.max(0, d) / radius;
          const dir = { x: e.pos.x - x, y: 0.5, z: e.pos.z - z };
          const l = Math.hypot(dir.x, dir.z) || 1; dir.x /= l; dir.z /= l;
          e.damage(dmg * (0.3 + 0.7 * f) * (owner === 'kamikaze' ? 1.5 : 1), dir, 'explosive');
          if (e.alive && e.def.hp < 100) { e.vel.x += dir.x * 10 * f; e.vel.z += dir.z * 10 * f; if (!e.def.fly) { e.vel.y += 5 * f; e.onGround = false; } }
        }
      }
    }
    const p = this.player;
    const pd = Math.hypot(p.pos.x - x, p.pos.y + 0.9 - y, p.pos.z - z);
    this.effects.addShake(Math.max(0, 0.7 * scale - pd / 40));
    if (p.alive && (pd < radius + 0.5 || hitPlayer)) {
      const f = hitPlayer ? 1 : 1 - Math.max(0, pd - 0.5) / radius;
      const self = owner === 'player';
      const amt = dmg * (0.3 + 0.7 * f) * (self ? 0.35 : owner === 'kamikaze' ? 0.8 : 1);
      if (!hitPlayer || owner !== 'enemy') p.damage(amt, { x, z }, self ? 0 : 6 * f);
      // rocket jumping
      const dx = p.pos.x - x, dy = p.pos.y + 0.9 - y, dz = p.pos.z - z;
      const l = Math.hypot(dx, dy, dz) || 1;
      const k = 14 * f * (self ? 1 : 0.5);
      p.vel.x += dx / l * k; p.vel.y += Math.max(0, dy / l) * k + (self && dy > 0 ? 3 : 0); p.vel.z += dz / l * k;
      if (dy / l > 0.3) p.onGround = false;
    }
  }

  onEnemyKilled(e, selfDestruct) {
    this.stats.kills++;
    if (!selfDestruct) this.stats.score += e.def.score;
    if (e.summoned) this.stats.total++;
  }

  setBoss(e) { this.boss = e; }

  onBossDeath(e) {
    this.hud.message('THE COLOSSUS FALLS!', 4, 'big');
    for (const o of this.enemies.list) if (o !== e && o.alive) o.die('explosive', 9999);
    this.projectiles.clearEnemy();
  }

  onBossGone() { this.bossGoneT = 3; }

  onPlayerDeath() {
    this.deadT = 0;
    this.hud.message('YOU DIED', 3, 'big red');
  }

  // ------------------------------------------------------------ state
  pause() {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.ui?.show('pause');
  }

  resume() {
    if (this.state !== 'paused') return;
    this.state = 'playing';
    this.ui?.hideAll();
    this.input.lock();
    this.lastT = performance.now();
  }

  respawn() {
    if (this.checkpoint) this.startLevel(this.levelIndex, this.checkpoint);
    else {
      this.carry = this.levelStart ? { health: this.levelStart.health, armor: this.levelStart.armor, weapons: this.levelStart.weapons } : null;
      this.stats.score = this.stats.levelScoreStart || 0;
      this.startLevel(this.levelIndex);
    }
  }

  quitToMenu() {
    this.state = 'menu';
    this.input.unlock();
    this.hud.show(false);
    this.audio.stopMusic();
    this.ui?.show('main');
  }

  levelComplete() {
    this.state = 'complete';
    this.input.unlock();
    this.audio.play('victory');
    this.carry = { health: this.player.health, armor: this.player.armor, weapons: this.weapons.snapshot() };
    const next = this.levelIndex + 1;
    this.progress.unlocked = Math.max(this.progress.unlocked || 1, Math.min(LEVELS.length, next + 1));
    this.saveProgress();
    this.ui?.showComplete(this.stats, LEVELS[this.levelIndex], next < LEVELS.length);
  }

  nextLevel() {
    const next = this.levelIndex + 1;
    if (next < LEVELS.length) this.startLevel(next);
    else this.quitToMenu();
  }

  victory() {
    this.state = 'victory';
    this.input.unlock();
    this.audio.play('victory');
    this.progress.unlocked = LEVELS.length;
    this.progress.beaten = true;
    this.saveProgress();
    this.ui?.showVictory(this.stats);
  }

  // ------------------------------------------------------------ main loop
  loop() {
    requestAnimationFrame(this.loop);
    const now = performance.now();
    const dt = Math.min(0.05, (now - this.lastT) / 1000);
    this.lastT = now;
    this.step(dt);
    this.render();
  }

  step(dt) {
    this.time += dt;
    this.skyUniforms.time.value = this.time;
    const input = this.input;
    if (this.state === 'playing') {
      this.stats.time += dt;
      if (input.wasPressed('Escape') || input.wasPressed('KeyP')) this.pause();
      this.player.update(dt, input);
      this.weapons.update(dt, input);
      this.enemies.update(dt);
      this.projectiles.update(dt);
      this.pickups.update(dt);
      this.updateEncounters(dt);
      this.updateDoors(dt);
      this.updateExit(dt);
      this.updateLevelFx(dt);
      this.effects.update(dt, this.camera);
      this.hud.update(dt);
      // intensity for music: how much action is going on
      const alive = this.enemies.alive;
      this.audio.setMusicIntensity(alive > 0 ? Math.min(1, 0.55 + alive / 20) : 0);
      if (!this.player.alive) {
        this.deadT += dt;
        if (this.deadT > 2.2 && this.state === 'playing') { this.state = 'dead'; this.input.unlock(); this.ui?.show('dead'); }
      }
      if (this.bossGoneT > 0) { this.bossGoneT -= dt; if (this.bossGoneT <= 0) this.victory(); }
    } else if (this.state === 'menu') {
      // attract mode: slow camera orbit over the first level
      const t = this.time * 0.05;
      this.player.pos.x = Math.sin(t) * 20; this.player.pos.z = -30 + Math.cos(t) * 20; this.player.pos.y = 4;
      this.player.yaw = t + Math.PI; this.player.pitch = -0.15;
      this.updateLevelFx(dt);
      this.effects.update(dt, this.camera);
    } else if (this.state === 'dead') {
      this.enemies.update(dt);
      this.projectiles.update(dt);
      this.effects.update(dt, this.camera);
      this.player.update(dt, input);
    }
    input.endFrame();
    this.placeCamera(dt);
  }

  updateExit(dt) {
    const ex = this.exit;
    if (!ex) return;
    const enc = this.encounters.find((e) => e.id === ex.requires);
    const active = !enc || enc.state === 'done';
    if (active && !ex.active) { ex.active = true; this.hud.log('The exit portal is open!', '#9fe0ff'); }
    ex.ring.rotation.z += dt * (active ? 2 : 0.3);
    ex.ringMat.emissiveIntensity = active ? 2.5 + Math.sin(this.time * 4) : 0.3;
    ex.disc.material.opacity = active ? 0.35 + Math.sin(this.time * 6) * 0.1 : 0;
    ex.beam.material.opacity = active ? 0.12 : 0;
    ex.disc.lookAt(this.camera.position.x, 2.1, this.camera.position.z);
    if (active) {
      if (Math.random() < dt * 30) this.effects.add.spawn(ex.x + rand(-1.4, 1.4), rand(0, 1), ex.z + rand(-1.4, 1.4), 0, rand(2, 5), 0, 1, 0.3, 0.05, 0.5, 1.2, 3, 0.2, 0.5, 2, 1, 0, 0);
      const p = this.player.pos;
      if (Math.hypot(p.x - ex.x, p.z - ex.z) < 1.8 && this.state === 'playing') this.levelComplete();
    }
  }

  updateLevelFx(dt) {
    if (!this.level) return;
    for (const t of this.level.torches) {
      t.phase += dt * 12;
      const f = 0.85 + Math.sin(t.phase) * 0.08 + Math.sin(t.phase * 2.3) * 0.06 + Math.random() * 0.05;
      t.sprite.scale.set(1.1 * f, 1.6 * f, 1);
      if (t.light) t.light.intensity = t.base * f;
    }
    for (const a of this.level.animated) {
      a.phase += dt;
      a.obj.rotation.x = Math.sin(a.phase * 0.9) * 0.05;
      a.obj.rotation.z = Math.sin(a.phase * 0.7) * 0.05;
    }
  }

  placeCamera(dt) {
    const c = this.camera, p = this.player;
    c.position.set(p.pos.x, this.state === 'menu' ? p.pos.y : p.eyeY, p.pos.z);
    const sh = this.effects.shake * this.effects.shake;
    c.rotation.set(p.pitch + (Math.random() - 0.5) * sh * 0.06, p.yaw + (Math.random() - 0.5) * sh * 0.06, (Math.random() - 0.5) * sh * 0.04 + (p.alive ? 0 : 0.4));
    c.updateMatrixWorld();
    this.sky.position.copy(c.position);
    this.audio.setListener(c.position.x, c.position.y, c.position.z, p.yaw);
    // sun shadow follows the camera, snapped to shadow texels to avoid shimmering
    const s = this.sun;
    const size = 120 / s.shadow.mapSize.x;
    const tx = Math.round(p.pos.x / size) * size, tz = Math.round(p.pos.z / size) * size;
    s.target.position.set(tx, 0, tz);
    s.position.set(tx + this.sunDir.x * 150, this.sunDir.y * 150, tz + this.sunDir.z * 150);
    s.target.updateMatrixWorld();
    void dt;
  }

  render() {
    this.weapons.holder.visible = this.state !== 'menu';
    this.renderer.info.reset();
    this.renderer.clear();
    this.composer.render();
  }

  // debug helpers for automated tests: advance the simulation deterministically
  simulate(seconds, dt = 1 / 30) {
    for (let t = 0; t < seconds; t += dt) this.step(dt);
    return this.state;
  }

  debugSpawn(type, dist = 15) {
    const p = this.player.pos;
    const a = this.player.yaw;
    return this.enemies.spawnSafe(type, p.x - Math.sin(a) * dist, p.z - Math.cos(a) * dist, 2);
  }
}

export { LEVELS, ENEMY_DEFS, PLAYER };
