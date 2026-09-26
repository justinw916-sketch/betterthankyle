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
import { LEVELS, THEMES, ARENA, makeWater } from './levels.js';
import { Player, PLAYER } from './player.js';
import { Weapons } from './weapons.js';
import { EnemyManager, ENEMY_DEFS } from './enemies.js';
import { Projectiles } from './projectiles.js';
import { Effects } from './effects.js';
import { Pickups } from './pickups.js';
import { HUD } from './hud.js';
import { World } from './world.js';
import { rand } from './util.js';

// Classic "hor+" FOV: the setting is the horizontal FOV at 4:3, converted to vertical.
const vfov = (h) => (2 * Math.atan(Math.tan((h * Math.PI) / 360) * 0.75) * 180) / Math.PI;

export const DIFFICULTIES = [
  { id: 'tourist', name: 'Tourist', hp: 0.6, dmg: 0.35 },
  { id: 'easy', name: 'Easy', hp: 0.8, dmg: 0.65 },
  { id: 'normal', name: 'Normal', hp: 1.0, dmg: 1.0 },
  { id: 'hard', name: 'Hard', hp: 1.25, dmg: 1.35 },
  { id: 'serious', name: 'Serious', hp: 1.5, dmg: 1.8 },
];

const MAX_ALIVE = 90;
const getDef = (i) => (i === 'arena' ? ARENA : LEVELS[i]);

// Endless-arena wave director: [type, first wave it appears, budget cost]
const ARENA_POOL = [
  ['kamikaze', 1, 1], ['gnasher', 1, 1.2], ['gunner', 1, 1.5], ['skeleton', 2, 3], ['harpy', 3, 2],
  ['bull', 4, 6], ['golem', 5, 9], ['arachnid', 6, 12], ['biomech', 8, 14],
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
    this.stats = { score: 0, kills: 0, total: 0, time: 0, secrets: 0, secretTotal: 0 };
    this.collected = new Set();

    const r = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFShadowMap;
    r.info.autoReset = false;
    r.autoClear = false;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(vfov(this.settings.fov), 1, 0.1, 1500);
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

    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      this.contextLost = true;
      if (this.state === 'playing') this.pause();
      this.hud.message('Graphics device was reset — restoring...', 5, 'big red');
    });
    canvas.addEventListener('webglcontextrestored', () => { this.contextLost = false; location.reload(); });
    // auto-pause when the tab is hidden (switching apps, minimising)
    document.addEventListener('visibilitychange', () => { if (document.hidden && this.state === 'playing') this.pause(); });
    this.input.onPad = (id) => this.hud.log('Controller connected: ' + id.slice(0, 40), '#9fe0ff');
    this.input.onFallback = () => this.hud.log('Mouse capture unavailable: free-mouse look enabled', '#9fe0ff');
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
    this.camera.fov = vfov(this.settings.fov);
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
    this.player.bombs = 0;
    this.startLevel(levelIndex);
  }

  // Saved run from the last completed level (see levelComplete)
  get savedRun() {
    try {
      const s = JSON.parse(localStorage.getItem('sam.save') || 'null');
      if (!s) return null;
      // saves reference levels by id so inserting new levels never shifts them
      if (s.levelId) { const i = LEVELS.findIndex((l) => l.id === s.levelId); if (i < 0) return null; s.level = i; }
      return s.level < LEVELS.length ? s : null;
    } catch { return null; }
  }

  continueGame() {
    const s = this.savedRun;
    if (!s) return this.newGame(0);
    this.carry = s.carry;
    this.stats.score = s.score || 0;
    this.player.bombs = s.carry?.bombs || 0;
    if (typeof s.difficulty === 'number') this.settings.difficulty = s.difficulty;
    this.startLevel(s.level);
  }

  startLevel(i, checkpoint = null) {
    this.loadLevel(i, checkpoint);
    this.state = 'playing';
    this.ui?.hideAll();
    this.hud.show(true);
    this.input.lock();
    const L = getDef(i);
    this.arenaBestCache = this.arenaBest.wave;
    document.getElementById('hud-level').textContent = typeof i === 'number' ? `${i + 1}. ${L.name}` : L.name;
    if (!checkpoint) this.hud.levelCard(L.name, L.subtitle);
    const fade = document.getElementById('fx-fade');
    fade.classList.remove('in'); void fade.offsetWidth; fade.classList.add('in');
    this.combo = 0; this.lastKillT = -99;
    this.hints = i === 0 && !checkpoint ? [
      [5, 'WASD move · Mouse aim · Click fire · Space jump'],
      [10, 'Never stop moving: circle-strafe around the horde!'],
      [15, '1–0 switch weapons · Q previous · B detonates Serious Bombs'],
      [20, 'Chain kills quickly for a COMBO score multiplier'],
    ] : null;
    this.audio.startMusic(L.music);
  }

  loadLevel(i, checkpoint = null, warmup = false) {
    const def = getDef(i);
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
    if (theme.void) b.skyScenery();
    else if (!b.customScenery) b.scenery({ night: def.theme === 'night', inferno: def.theme === 'inferno' });
    b.finish();
    if (b.water) b.group.add(makeWater(b.water, def.theme === 'night'));
    this.level = b;
    this.world = b.world;
    if (theme.void) this.world.floor = -Infinity;
    this.theme = theme;
    this.effects.world = this.world;
    this.levelGroup = b.group;
    this.scene.add(b.group);
    this.applyTheme(theme);
    this.buildExit(b.exit);

    // encounters
    this.spawnQueue = [];
    this.encounters = b.encounters.map((e) => ({ ...e, state: 'idle', wave: 0, waveT: 0, spawned: 0, time: 0 }));
    this.secrets = b.secrets.map((s) => ({ ...s, found: false }));
    this.keys = new Set(checkpoint?.keys || []);
    this.doorHintT = 0;
    this.stats.secrets = 0; this.stats.secretTotal = this.secrets.length;
    this.padCool = 0; this.lavaT = 0;
    this.stats.total = 0;
    for (const e of this.encounters) for (const w of e.waves) for (const s of w.spawn) this.stats.total += s[1];
    this.stats.kills = 0; this.stats.time = 0; this.stats.levelScoreStart = this.stats.score; this.stats.bestCombo = 0;

    // player & inventory
    this.player.reset();
    this.player.god = !!this.settings.godMode;
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
      this.player.bombs = checkpoint.bombs || 0;
      for (const s of this.secrets) if ((checkpoint.secrets || []).includes(this.secrets.indexOf(s))) { s.found = true; this.stats.secrets++; }
      for (const k of this.keys) for (const d of b.keyDoors[k] || []) this.openDoor(d, true);
      this.weapons.reset(checkpoint.weapons);
      this.player.place(checkpoint.x, checkpoint.z, checkpoint.yaw);
    } else {
      this.collected = new Set();
      if (this.carry) {
        this.player.health = Math.max(100, this.carry.health); this.player.armor = this.carry.armor;
        this.player.bombs = this.carry.bombs || 0;
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
      if (this.enemies.alive >= MAX_ALIVE) break; // hold spawns while the arena is saturated
      q.t -= dt;
      if (q.t <= 0) { this.spawnQueue.splice(i, 1); this.enemies.spawnSafe(q.type, q.x, q.z, q.spread, { encounter: q.enc, bounds: q.bounds, floorY: q.floorY }); }
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
      if (e.endless) {
        // Endless arena: next wave once the field is (nearly) clear
        if (e.waveT <= 0 && alive <= 2) this.nextArenaWave(e);
        continue;
      }
      if (e.survive) {
        // survival: waves arrive on a clock; done once time is up and the stragglers are dead
        e.time += dt;
        while (e.wave < e.waves.length && e.time >= (e.waves[e.wave].at ?? 0)) this.spawnWave(e, e.waves[e.wave++]);
        if (e.time >= e.survive && !e.timeUp) { e.timeUp = true; this.hud.message('HELD THE LINE! Finish them!', 3, 'big'); this.audio.play('secret'); }
        if (e.time >= e.survive && alive === 0) this.finishEncounter(e);
        continue;
      }
      if (e.wave < e.waves.length) {
        const w = e.waves[e.wave];
        if (e.waveT <= 0 && alive <= (w.when ?? 0)) {
          this.spawnWave(e, w);
          e.wave++;
          e.waveT = 2.5;
        }
      } else if (alive === 0 && e.waveT <= 0) this.finishEncounter(e);
    }
  }

  // Personal bests per level (fastest time, best score, most kills/secrets).
  get records() { try { return JSON.parse(localStorage.getItem('sam.records') || '{}'); } catch { return {}; } }

  recordLevel() {
    const id = this.levelDef.id, s = this.stats, all = this.records;
    const prev = all[id] || {};
    const cur = { time: s.time, score: s.score - (s.levelScoreStart || 0), kills: s.kills, total: s.total, secrets: s.secrets, secretTotal: s.secretTotal };
    const best = {
      time: prev.time ? Math.min(prev.time, cur.time) : cur.time,
      score: Math.max(prev.score || 0, cur.score),
      kills: Math.max(prev.kills || 0, cur.kills), total: cur.total,
      secrets: Math.max(prev.secrets || 0, cur.secrets), secretTotal: cur.secretTotal,
    };
    this.lastRecord = { newTime: !prev.time || cur.time < prev.time, newScore: cur.score > (prev.score || 0) };
    all[id] = best;
    try { localStorage.setItem('sam.records', JSON.stringify(all)); } catch { /* ignore */ }
  }

  startArena() {
    this.carry = null;
    this.stats.score = 0;
    this.player.bombs = 0;
    this.startLevel('arena');
  }

  get arenaBest() {
    try { return JSON.parse(localStorage.getItem('sam.arena') || 'null') || { wave: 0, score: 0 }; } catch { return { wave: 0, score: 0 }; }
  }

  nextArenaWave(e) {
    const n = (e.waveNum || 0) + 1;
    e.waveNum = n;
    e.waveT = 6;
    const pool = ARENA_POOL.filter(([, from]) => n >= from);
    let budget = 8 + n * 5;
    const counts = {};
    if (n % 10 === 0) { counts.boss = 1; budget *= 0.4; }
    while (budget > 0) {
      const [type, , cost] = pool[Math.floor(Math.random() * pool.length)];
      counts[type] = (counts[type] || 0) + (type === 'kamikaze' ? 4 : 1);
      budget -= cost * (type === 'kamikaze' ? 4 : 1);
    }
    // spread each type across the four walls
    const gates = [[0, -36], [0, 36], [-36, 0], [36, 0]];
    const spawn = [];
    for (const [type, c] of Object.entries(counts)) {
      if (type === 'boss') { spawn.push(['boss', 1, 0, -28, 0]); continue; }
      const per = Math.ceil(c / 2);
      for (let k = 0, left = c; left > 0; k++) {
        const g = gates[Math.floor(Math.random() * 4)];
        const m = Math.min(per, left);
        spawn.push([type, m, g[0], g[1], 8]);
        left -= m;
      }
    }
    for (const s of spawn) this.stats.total += s[1];
    const rnd = () => (Math.random() - 0.5) * 50;
    const ammo = ['shells', 'bullets', 'rockets', 'grenades', 'cells', 'cannonballs'];
    const items = [['ammo', ammo[n % 6], rnd(), rnd()], ['ammo', ammo[(n + 3) % 6], rnd(), rnd()], ['health', n % 2 ? 'medium' : 'large', rnd(), rnd()]];
    if (n % 2 === 0) items.push(['armor', 'medium', rnd(), rnd()]);
    if (n % 3 === 0) items.push(['powerup', ['damage', 'protect', 'speed'][(n / 3) % 3], rnd(), rnd()]);
    if (n % 5 === 0) items.push(['powerup', 'bomb', rnd(), rnd()]);
    this.spawnWave(e, { spawn, items, msg: n % 10 === 0 ? `WAVE ${n}: THE COLOSSUS!` : `WAVE ${n}` });
    if (n > 1) { this.stats.score += n * 100; this.audio.play('secret'); }
  }

  recordArena() {
    const e = this.encounters.find((x) => x.endless);
    if (!e) return null;
    if (this.settings.godMode) return { wave: e.waveNum || 0, score: this.stats.score, isBest: false, best: this.arenaBest, god: true };
    const run = { wave: e.waveNum || 0, score: this.stats.score };
    const best = this.arenaBest;
    const isBest = run.wave > best.wave || (run.wave === best.wave && run.score > best.score);
    if (isBest) try { localStorage.setItem('sam.arena', JSON.stringify(run)); } catch { /* ignore */ }
    return { ...run, isBest, best: isBest ? run : best };
  }

  collectKey(id) {
    if (this.keys.has(id)) return;
    this.keys.add(id);
    const name = this.level.keys[id] || 'key';
    this.hud.message(`You found the ${name}!`, 3, 'big');
    this.hud.log('A sealed door has opened', '#7fdcff');
    this.audio.play('secret');
    for (const d of this.level.keyDoors[id] || []) this.openDoor(d);
  }

  // Secret invincibility toggle (logo x5 on the main menu, or type "serious" in game).
  toggleGodMode() {
    this.settings.godMode = !this.settings.godMode;
    this.saveSettings();
    this.player.god = this.settings.godMode;
    this.audio.play(this.settings.godMode ? 'powerup' : 'switch');
    const txt = this.settings.godMode ? 'INVINCIBILITY ON' : 'INVINCIBILITY OFF';
    if (this.state === 'playing') this.hud.message(txt, 2.5, 'big');
    this.ui?.toast(txt);
  }

  // What the player should do next, and where (for the HUD tracker + compass).
  objective() {
    const p = this.player.pos;
    const active = this.encounters.find((e) => e.state === 'active');
    if (active) {
      if (active.endless) return { text: `Survive wave ${active.waveNum || 1}` };
      let n = this.spawnQueue.filter((q) => q.enc === active.id).length;
      for (const en of this.enemies.list) if (en.alive && en.encounter === active.id) n++;
      if (active.survive && active.time < active.survive) return { text: `Hold out! ${n} enemies on the field` };
      if (this.boss && this.boss.alive) return { text: `Defeat ${this.boss.def.name}` };
      return { text: n ? `Clear the area: ${n} enem${n === 1 ? 'y' : 'ies'} left` : 'Clear the area' };
    }
    if (this.exit?.active) return { text: 'Reach the exit portal', x: this.exit.x, z: this.exit.z };
    const next = this.encounters.find((e) => e.state === 'idle');
    // the next area is behind a sealed door: point at the missing key instead
    const sealed = next && (next.lock || []).map((d) => this.level.doors[d]).find((d) => d && d.keyId && !this.keys.has(d.keyId) && d.state === 'closed');
    if (sealed) {
      const key = this.pickups.list.find((k) => k.kind === 'key' && k.sub === sealed.keyId);
      if (key) return { text: `Find the ${this.level.keys[sealed.keyId]}`, x: key.obj.position.x, z: key.obj.position.z };
    }
    if (next) {
      const [x0, z0, x1, z1] = next.area;
      return { text: 'Press onward', x: (x0 + x1) / 2, z: Math.min(z1 - 3, Math.max(z0 + 3, p.z)) };
    }
    return { text: '' };
  }

  finishEncounter(e) {
    e.state = 'done';
    for (const d of e.open || []) this.openDoor(d);
    if (e.message) this.hud.message(e.message, 3);
    if (e.checkpoint) this.saveCheckpoint(e.checkpoint);
  }

  // Serious Bomb: wipes out every non-boss enemy nearby and batters the boss.
  seriousBomb() {
    const p = this.player;
    if (p.bombs <= 0 || !p.alive) return;
    p.bombs--;
    const fx = this.effects;
    this.hud.pickupFlash('rgba(255,255,255,0.95)');
    this.hud.message('SERIOUS BOMB!', 2, 'big');
    this.audio.play('bigexplosion', { vol: 1.5 });
    this.audio.play('powerup', { rate: 0.6 });
    fx.addShake(1.2);
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      fx.explosion(p.pos.x + Math.cos(a) * 14, p.pos.y + 1.5, p.pos.z + Math.sin(a) * 14, 1.6);
    }
    for (const e of this.enemies.list) {
      if (!e.alive) continue;
      const d = Math.hypot(e.pos.x - p.pos.x, e.pos.z - p.pos.z);
      if (d > 110) continue;
      if (e.def.boss) e.damage(3000, null, 'explosive');
      else e.die('explosive', 9999);
    }
    this.projectiles.clearEnemy();
  }

  // Secrets, jump pads, lava and the void.
  updateHazards(dt) {
    const p = this.player, pp = p.pos;
    for (const s of this.secrets) {
      if (!s.found && Math.hypot(pp.x - s.x, pp.z - s.z) < s.r && Math.abs(pp.y - s.y) < 3) {
        s.found = true; this.stats.secrets++; this.stats.score += 500;
        this.hud.message('SECRET FOUND!', 2.5, 'big');
        this.audio.play('secret');
      }
    }
    this.padCool -= dt;
    for (const pad of this.level.jumpPads) {
      pad.glow.material.opacity = 0.55 + Math.sin(this.time * 6 + pad.x) * 0.25;
      if (Math.random() < dt * 12) this.effects.add.spawn(pad.x + rand(-1, 1), pad.y + 0.3, pad.z + rand(-1, 1), 0, rand(3, 7), 0, 0.5, 0.25, 0.05, 0.4, 1.4, 3, 0.1, 0.4, 2, 1, 0, 0);
      if (p.alive && this.padCool <= 0 && Math.hypot(pp.x - pad.x, pp.z - pad.z) < 1.5 && Math.abs(pp.y - (pad.y + 0.25)) < 0.6) {
        p.vel.x = pad.vx; p.vel.y = pad.vy; p.vel.z = pad.vz;
        p.onGround = false; pp.y += 0.1;
        this.padCool = 0.5;
        this.audio.play('rocket', { rate: 1.4, vol: 0.7 });
        this.audio.play('jump');
      }
    }
    // sealed doors explain themselves
    this.doorHintT -= dt;
    for (const d of Object.values(this.level.doors)) {
      if (!d.keyId || d.state !== 'closed' || this.doorHintT > 0 || this.keys.has(d.keyId)) continue;
      if (Math.hypot(pp.x - d.cx, pp.z - d.cz) < 5) { this.doorHintT = 4; this.hud.message(`Sealed. Find the ${this.level.keys[d.keyId]}`, 2.5); this.audio.play('empty'); }
    }
    // spike traps: warn, strike, retract
    for (const S of this.level.spikeTraps) {
      const t = this.stats.time + S.offset;
      const cycle = Math.floor(t / S.period), ph = t - cycle * S.period;
      const striking = ph < S.up, warning = ph > S.period - 0.55;
      const target = striking ? S.y + 0.55 : warning ? S.y - 0.75 : S.y - 1.2;
      S.mesh.position.y += (target - S.mesh.position.y) * Math.min(1, dt * (striking ? 30 : 10));
      const cx = (S.x0 + S.x1) / 2, cz = (S.z0 + S.z1) / 2;
      const near = Math.hypot(pp.x - cx, pp.z - cz) < 30;
      if (warning && S.warnCycle !== cycle) { S.warnCycle = cycle; if (near) this.audio.play('switch', { pos: { x: cx, y: S.y, z: cz }, vol: 0.8 }); }
      if (!striking) continue;
      const inS = (x, z) => x > S.x0 && x < S.x1 && z > S.z0 && z < S.z1;
      if (S.hitCycle !== cycle) {
        S.hitCycle = cycle;
        if (near) this.audio.play('chain', { pos: { x: cx, y: S.y, z: cz }, rate: 1.4 });
        if (p.alive && inS(pp.x, pp.z) && pp.y < S.y + 0.9) {
          p.damage(30, null);
          p.vel.y = Math.max(p.vel.y, 6); p.onGround = false;
          this.effects.blood(pp.x, pp.y + 0.5, pp.z, 0, 1, 0, 10);
        }
        for (const e of this.enemies.list) {
          if (e.alive && !e.def.fly && !e.def.boss && inS(e.pos.x, e.pos.z) && e.pos.y < S.y + 0.9) e.damage(70, { x: 0, y: 1, z: 0 }, 'melee');
        }
      }
    }
    // lava: burns the player and any grounded enemy standing in it
    this.lavaT -= dt;
    for (const L of this.level.lavas) {
      const inL = (x, z) => x > L.x0 && x < L.x1 && z > L.z0 && z < L.z1;
      if (p.alive && inL(pp.x, pp.z) && pp.y < L.y + 0.35) {
        if (this.lavaT <= 0) {
          this.lavaT = 0.25;
          p.damage(7, null);
          this.audio.play('splat', { rate: 1.6, vol: 0.5 });
          for (let i = 0; i < 6; i++) this.effects.add.spawn(pp.x + rand(-0.5, 0.5), L.y + 0.2, pp.z + rand(-0.5, 0.5), rand(-1, 1), rand(2, 5), rand(-1, 1), 0.5, 0.3, 0.05, 3, 1.2, 0.2, 1, 0.2, 0, 1, 6, 1);
        }
      }
      for (const e of this.enemies.list) {
        if (e.alive && !e.def.fly && !e.def.boss && e.def.model !== 'golem' && e.type !== 'golem' && inL(e.pos.x, e.pos.z) && e.pos.y < L.y + 0.35) e.damage(18 * dt, null, 'fire');
      }
    }
    // falling off a sky island
    if (this.world.floor === -Infinity && p.alive && pp.y < -30) {
      if (p.god) { const c = this.checkpoint || this.level.spawn; p.place(c.x, c.z, c.yaw || 0); }
      else { this.hud.message('LOST TO THE VOID', 3, 'big red'); p.kill(); }
    }
  }

  // Sandstorm dust / underworld embers drifting around the player.
  updateWeather(dt) {
    const t = this.theme;
    if (!t || (!t.storm && !t.embers)) return;
    const c = this.camera.position, fx = this.effects;
    if (t.storm) {
      const n = Math.floor(dt * 260 + Math.random());
      for (let i = 0; i < n; i++) {
        fx.alpha.spawn(c.x + rand(-30, 30) - 10, c.y + rand(-2, 10), c.z + rand(-30, 30), rand(14, 22), rand(-1.5, 0.5), rand(3, 7),
          rand(1.4, 2.4), 0.5, 1.4, 0.82, 0.62, 0.38, 0.75, 0.55, 0.32, 0.28, 0, 0);
      }
    }
    if (t.embers) {
      const n = Math.floor(dt * 70 + Math.random());
      for (let i = 0; i < n; i++) {
        fx.add.spawn(c.x + rand(-25, 25), rand(0, 3), c.z + rand(-25, 25), rand(-0.5, 0.5), rand(1, 3), rand(-0.5, 0.5),
          rand(2, 4), 0.12, 0.04, 3, 1.1, 0.2, 1.2, 0.2, 0, 1, -0.2, 0.2);
      }
    }
  }

  spawnWave(e, w) {
    if (w.msg) this.hud.message(w.msg, 2.5, 'big');
    // stagger spawns slightly (in game time) so hordes pour in
    const [x0, z0, x1, z1] = e.area;
    const bounds = [x0 - 1.5, z0 - 1.5, x1 + 1.5, z1 + 1.5];
    for (const [type, n, x, z, spread] of w.spawn) {
      for (let i = 0; i < n; i++) this.spawnQueue.push({ t: i * (type === 'kamikaze' ? 0.09 : 0.16), type, x, z, spread, enc: e.id, bounds, floorY: e.floor || 0 });
    }
    this.audio.play('spawn', { vol: 0.7 });
    for (const [kind, sub, x, z] of w.items || []) this.pickups.add(kind, sub, x, this.world.groundHeight(x, z, 0.3, (e.floor || 0) + 3.2, 0), z, { effect: true });
  }

  saveCheckpoint(cp) {
    this.checkpoint = {
      ...cp, done: this.encounters.filter((e) => e.state === 'done').map((e) => e.id),
      health: Math.max(this.player.health, 50), armor: this.player.armor, weapons: this.weapons.snapshot(),
      score: this.stats.score, collected: [...this.collected], bombs: this.player.bombs, keys: [...this.keys],
      secrets: this.secrets.map((s, i) => (s.found ? i : -1)).filter((i) => i >= 0),
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
      if (e.type === 'biomech' || e.def.boss || e.type === 'arachnid') fx.sparks(hx, hy, hz, -d.x, -d.y, -d.z, 3);
      this.hud.hitmarker(!e.alive);
      this.audio.play('hitmarker', { vol: 0.35, group: 'hit', maxVoices: 2, jitter: false });
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
    if (!selfDestruct) {
      // kill combos: chain kills within 1.8 s to raise the score multiplier (up to x5)
      const now = this.stats.time;
      this.combo = now - (this.lastKillT ?? -99) < 1.8 ? (this.combo || 0) + 1 : 1;
      this.lastKillT = now;
      const mult = Math.min(5, 1 + Math.floor((this.combo - 1) / 4));
      this.stats.score += e.def.score * mult;
      this.stats.bestCombo = Math.max(this.stats.bestCombo || 0, this.combo);
      if (this.combo >= 3) this.hud.combo(this.combo, mult);
      if (this.combo > 0 && this.combo % 4 === 1 && this.combo > 1) this.audio.play('combo');
    }
    if (e.summoned) this.stats.total++;
  }

  setBoss(e) { this.boss = e; }

  onBossDeath(e) {
    this.hud.message('THE COLOSSUS FALLS!', 4, 'big');
    for (const o of this.enemies.list) if (o !== e && o.alive) o.die('explosive', 9999);
    this.projectiles.clearEnemy();
  }

  // The final level ends in victory; earlier boss fights open the exit portal instead.
  onBossGone() {
    const enc = this.encounters.find((e) => e.state !== 'idle' && e.final);
    if (enc) this.bossGoneT = 3;
    else this.hud.message('The way forward is open!', 3, 'big');
  }

  onPlayerDeath() {
    this.deadT = 0;
    this.arenaResult = this.levelIndex === 'arena' ? this.recordArena() : null;
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
    if (this.levelIndex === 'arena') return this.startArena();
    if (this.checkpoint) this.startLevel(this.levelIndex, this.checkpoint);
    else {
      this.carry = this.levelStart ? { health: this.levelStart.health, armor: this.levelStart.armor, weapons: this.levelStart.weapons } : null;
      this.stats.score = this.stats.levelScoreStart || 0;
      this.startLevel(this.levelIndex);
    }
  }

  quitToMenu() {
    if (this.levelIndex === 'arena' && this.player.alive) this.recordArena();
    // restore the temple as the attract-mode backdrop
    if (this.levelIndex !== 0) this.loadLevel(0, null, true);
    this.state = 'menu';
    this.input.unlock();
    this.hud.show(false);
    this.audio.stopMusic();
    this.ui?.show('main');
  }

  levelComplete() {
    this.state = 'complete';
    this.input.unlock();
    this.hud.show(false);
    this.audio.play('victory');
    this.carry = { health: this.player.health, armor: this.player.armor, weapons: this.weapons.snapshot(), bombs: this.player.bombs };
    this.recordLevel();
    const next = this.levelIndex + 1;
    try { localStorage.setItem('sam.save', JSON.stringify({ level: next, levelId: LEVELS[next]?.id, carry: this.carry, score: this.stats.score, difficulty: this.settings.difficulty })); } catch { /* ignore */ }
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
    this.hud.show(false);
    this.audio.play('victory');
    this.progress.unlocked = LEVELS.length;
    this.progress.beaten = true;
    try { localStorage.removeItem('sam.save'); } catch { /* ignore */ }
    this.saveProgress();
    this.ui?.showVictory(this.stats);
  }

  // ------------------------------------------------------------ main loop
  loop() {
    requestAnimationFrame(this.loop);
    const now = performance.now();
    const dt = Math.min(0.05, (now - this.lastT) / 1000);
    this.lastT = now;
    if (this.contextLost) return;
    try {
      this.step(dt);
      this.render();
    } catch (err) {
      // never let one bad frame kill the game loop; surface it once
      this.errorCount = (this.errorCount || 0) + 1;
      if (this.errorCount <= 3) console.error('frame error', err);
      if (this.errorCount === 1) this.hud.log('Recovered from an internal error (see console)', '#ff8a7a');
    }
  }

  step(dt) {
    this.time += dt;
    this.skyUniforms.time.value = this.time;
    const input = this.input;
    input.active = this.state === 'playing';
    input.pollPad();
    // controller menu shortcuts: A confirms, Start resumes
    if (this.state !== 'playing' && this.state !== 'loading' && (input.wasPressed('PadA') || (this.state === 'paused' && input.wasPressed('Escape')))) {
      const act = { menu: this.savedRun ? 'continue' : 'new', paused: 'resume', dead: 'respawn', complete: 'next', victory: 'quit' }[this.state];
      if (act && this.ui && (this.state !== 'menu' || this.ui.current === 'main')) this.ui.act(act);
    }
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
      this.updateHazards(dt);
      this.updateLevelFx(dt);
      this.updateWeather(dt);
      if (input.wasPressed('KeyB')) this.seriousBomb();
      // typed cheat: "serious" toggles invincibility
      for (const code of input.pressed) {
        if (!code.startsWith('Key')) continue;
        this.cheatBuf = ((this.cheatBuf || '') + code.slice(3).toLowerCase()).slice(-7);
        if (this.cheatBuf === 'serious') { this.cheatBuf = ''; this.toggleGodMode(); }
      }
      // low-health heartbeat
      if (this.player.alive && this.player.health <= 25) {
        this.heartT = (this.heartT || 0) - dt;
        if (this.heartT <= 0) { this.heartT = 0.85; this.audio.play('heartbeat', { vol: 0.9, jitter: false }); }
      }
      // first-level tutorial hints
      while (this.hints && this.hints.length && this.stats.time >= this.hints[0][0]) this.hud.log(this.hints.shift()[1], '#ffe9a0');
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
      if (t.sprite) t.sprite.scale.set(1.1 * f, 1.6 * f, 1);
      if (t.light) t.light.intensity = t.base * f;
    }
    for (const a of this.level.animated) {
      a.phase += dt;
      if (a.type === 'clouds') {
        const m = a.obj.material.map; if (m) { m.offset.x += dt * 0.004; m.offset.y += dt * 0.002; }
        continue;
      }
      a.obj.rotation.x = Math.sin(a.phase * 0.9) * 0.05;
      a.obj.rotation.z = Math.sin(a.phase * 0.7) * 0.05;
    }
    // scroll molten lava
    const lm = getMaterials().lava.map;
    if (lm) { lm.offset.x += dt * 0.02; lm.offset.y += dt * 0.012; }
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

  get levelCount() { return LEVELS.length; }

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
