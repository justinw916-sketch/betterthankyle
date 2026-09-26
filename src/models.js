// Procedural low-poly models built from primitives: enemies (with rigs for
// procedural animation), first-person weapon viewmodels and pickups.
import * as THREE from 'three';
import { getMaterials } from './textures.js';

const GEO = new Map();
const geo = (key, make) => { let g = GEO.get(key); if (!g) { g = make(); GEO.set(key, g); } return g; };
export const box = (w, h, d) => geo(`b${w},${h},${d}`, () => new THREE.BoxGeometry(w, h, d));
export const cyl = (rt, rb, h, s = 10) => geo(`c${rt},${rb},${h},${s}`, () => new THREE.CylinderGeometry(rt, rb, h, s));
export const sph = (r, w = 12, h = 8) => geo(`s${r},${w},${h}`, () => new THREE.SphereGeometry(r, w, h));
export const cone = (r, h, s = 8) => geo(`k${r},${h},${s}`, () => new THREE.ConeGeometry(r, h, s));

export function part(g, mat, x = 0, y = 0, z = 0, parent = null, shadow = true) {
  const m = new THREE.Mesh(g, mat);
  m.position.set(x, y, z);
  m.castShadow = shadow;
  if (parent) parent.add(m);
  return m;
}

export function pivot(parent, x = 0, y = 0, z = 0) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  parent.add(g);
  return g;
}

const MAT = {};
function mats() {
  if (MAT.ready) return MAT;
  const S = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.75, ...extra });
  Object.assign(MAT, {
    skin: S(0xc88a5c), skinDark: S(0x8a5a3a), pantsWhite: S(0xdedad0), pantsGreen: S(0x3b4a2a), pantsBlue: S(0x2a3550),
    shoe: S(0x2a1e14), belt: S(0x3a2a1a), stump: S(0x7a0808, { roughness: 0.4 }),
    bomb: S(0x151515, { roughness: 0.4, metalness: 0.4 }),
    fuse: new THREE.MeshBasicMaterial({ color: 0xffdd66 }),
    bone: S(0xe6dcc0, { roughness: 0.6 }), boneDark: S(0xb0a488),
    eyeRed: new THREE.MeshStandardMaterial({ color: 0x220000, emissive: 0xff2200, emissiveIntensity: 4 }),
    eyeGreen: new THREE.MeshStandardMaterial({ color: 0x002200, emissive: 0x44ff22, emissiveIntensity: 4 }),
    eyeWhite: S(0xf0f0e8, { roughness: 0.2 }),
    fur: S(0x4a3322, { roughness: 1, flatShading: true }),
    furRed: S(0x6a2818, { roughness: 1, flatShading: true }),
    horn: S(0xe8dcc0, { roughness: 0.5 }),
    hoof: S(0x1a1410),
    teeth: S(0xf4f0dc),
    mouth: S(0x300505),
    chitin: S(0x4a5a2a, { roughness: 0.45, metalness: 0.2, flatShading: true }),
    chitinDark: S(0x2a3418, { roughness: 0.5, flatShading: true }),
    alienSkin: S(0x7a9a5a),
    harpySkin: S(0x9ab0c0), wing: S(0x4a2a5a, { side: THREE.DoubleSide, flatShading: true }), hair: S(0x202030),
    mech: S(0x707a88, { roughness: 0.35, metalness: 0.8, flatShading: true }),
    mechDark: S(0x303640, { roughness: 0.4, metalness: 0.7 }),
    visor: new THREE.MeshStandardMaterial({ color: 0x220000, emissive: 0xff3300, emissiveIntensity: 3 }),
    glowOrange: new THREE.MeshBasicMaterial({ color: 0xffaa33 }),
    glowCyan: new THREE.MeshStandardMaterial({ color: 0x003344, emissive: 0x33ddff, emissiveIntensity: 3 }),
    glowRed: new THREE.MeshStandardMaterial({ color: 0x330000, emissive: 0xff2222, emissiveIntensity: 3 }),
    blueStripe: S(0x1a3a8a, { roughness: 0.5 }),
  });
  MAT.ready = true;
  return MAT;
}

// ---------------------------------------------------------------------------
// Enemy models. Each returns {root, rig, height}; rigs are animated in enemies.js.
function humanoid(o) {
  const M = mats();
  const root = new THREE.Group();
  const body = pivot(root);
  const r = { body };
  for (const side of [-1, 1]) {
    const hip = pivot(body, side * 0.13, 0.95, 0);
    part(box(0.17, 0.48, 0.19), o.pants, 0, -0.24, 0, hip);
    const knee = pivot(hip, 0, -0.48, 0);
    part(box(0.15, 0.46, 0.17), o.pants, 0, -0.23, 0, knee);
    part(box(0.16, 0.08, 0.28), M.shoe, 0, -0.47, -0.06, knee);
    r[side < 0 ? 'hipL' : 'hipR'] = hip; r[side < 0 ? 'kneeL' : 'kneeR'] = knee;
  }
  const torso = pivot(body, 0, 0.95, 0);
  part(box(0.52, 0.12, 0.3), M.belt, 0, 0.04, 0, torso);
  part(box(0.5, 0.62, 0.28), o.skin, 0, 0.4, 0, torso);
  part(box(0.3, 0.2, 0.05), o.skin, 0, 0.5, -0.15, torso); // pecs
  if (o.headless) {
    part(cyl(0.1, 0.12, 0.08), M.stump, 0, 0.74, 0, torso);
  }
  for (const side of [-1, 1]) {
    const sh = pivot(torso, side * 0.32, 0.64, 0);
    part(box(0.13, 0.4, 0.14), o.skin, 0, -0.2, 0, sh);
    const el = pivot(sh, 0, -0.4, 0);
    part(box(0.11, 0.36, 0.12), o.skin, 0, -0.18, 0, el);
    part(box(0.12, 0.12, 0.12), o.skin, 0, -0.4, 0, el);
    r[side < 0 ? 'armL' : 'armR'] = sh; r[side < 0 ? 'elbowL' : 'elbowR'] = el;
  }
  r.torso = torso;
  return { root, rig: r };
}

export function makeEnemyModel(type, variant = null) {
  const M = mats();
  const G = getMaterials();
  switch (type) {
    case 'kamikaze': {
      const h = humanoid({ skin: M.skin, pants: M.pantsWhite, headless: true });
      const r = h.rig;
      // arms raised holding bombs
      r.fuses = [];
      for (const el of [r.elbowL, r.elbowR]) {
        part(sph(0.17, 10, 8), M.bomb, 0, -0.52, 0, el);
        const f = part(sph(0.05, 6, 4), M.fuse, 0, -0.72, 0, el, false);
        r.fuses.push(f);
      }
      return { ...h, height: 1.9 };
    }
    case 'gunner': {
      const h = humanoid({ skin: M.skinDark, pants: M.pantsGreen, headless: true });
      const r = h.rig;
      const gun = pivot(r.elbowR, 0, -0.4, 0);
      part(box(0.12, 0.14, 0.55), G.darkmetal, 0, 0, -0.18, gun);
      part(cyl(0.05, 0.05, 0.3, 8), G.gunmetal, 0, 0, -0.55, gun).rotation.x = Math.PI / 2;
      r.muzzle = pivot(gun, 0, 0, -0.72);
      part(box(0.54, 0.4, 0.12), G.darkmetal, 0, 0.45, 0.2, r.torso); // backpack
      return { ...h, height: 1.9 };
    }
    case 'skeleton': {
      const root = new THREE.Group();
      const body = pivot(root);
      const r = { body };
      for (const side of [-1, 1]) {
        const hip = pivot(body, side * 0.18, 1.2, 0);
        part(box(0.1, 0.62, 0.1), M.bone, 0, -0.31, 0, hip);
        const knee = pivot(hip, 0, -0.62, 0);
        part(box(0.08, 0.6, 0.08), M.bone, 0, -0.3, 0, knee);
        part(box(0.14, 0.06, 0.32), M.bone, 0, -0.6, -0.1, knee);
        r[side < 0 ? 'hipL' : 'hipR'] = hip; r[side < 0 ? 'kneeL' : 'kneeR'] = knee;
      }
      const torso = pivot(body, 0, 1.2, 0);
      part(box(0.42, 0.14, 0.2), M.boneDark, 0, 0.05, 0, torso); // pelvis
      part(box(0.07, 0.7, 0.07), M.bone, 0, 0.4, 0.05, torso); // spine
      for (let i = 0; i < 5; i++) {
        const w = 0.5 - Math.abs(i - 1.5) * 0.06;
        part(box(w, 0.045, 0.34), M.bone, 0, 0.35 + i * 0.1, -0.04, torso);
      }
      const head = pivot(torso, 0, 0.9, -0.05);
      part(sph(0.2, 10, 8), M.bone, 0, 0.05, 0, head);
      part(box(0.22, 0.12, 0.2), M.bone, 0, -0.1, -0.08, head); // jaw
      for (const s of [-1, 1]) {
        part(sph(0.05, 6, 4), M.eyeRed, s * 0.08, 0.06, -0.17, head, false);
        const hn = part(cone(0.06, 0.45, 6), M.horn, s * 0.16, 0.25, 0.05, head);
        hn.rotation.z = -s * 0.6; hn.rotation.x = 0.4;
      }
      for (const side of [-1, 1]) {
        const sh = pivot(torso, side * 0.3, 0.8, 0);
        part(box(0.07, 0.55, 0.07), M.bone, 0, -0.27, 0, sh);
        const el = pivot(sh, 0, -0.55, 0);
        part(box(0.06, 0.5, 0.06), M.bone, 0, -0.25, 0, el);
        part(sph(0.16, 8, 6), M.bomb, 0, -0.62, 0, el); // chain ball
        r[side < 0 ? 'armL' : 'armR'] = sh; r[side < 0 ? 'elbowL' : 'elbowR'] = el;
      }
      r.torso = torso; r.head = head;
      return { root, rig: r, height: 2.4 };
    }
    case 'gnasher': {
      const root = new THREE.Group();
      const body = pivot(root);
      const r = { body };
      const ball = part(new THREE.IcosahedronGeometry(0.72, 1), M.fur, 0, 1.05, 0, body);
      ball.scale.set(1, 0.9, 0.95);
      const eyeP = pivot(body, 0, 1.3, -0.52);
      part(sph(0.28, 14, 10), M.eyeWhite, 0, 0, 0, eyeP);
      part(sph(0.12, 10, 8), M.eyeRed, 0, 0, -0.2, eyeP, false);
      const jaw = pivot(body, 0, 0.85, -0.55);
      part(box(0.7, 0.2, 0.2), M.mouth, 0, 0, 0, jaw);
      for (let i = 0; i < 6; i++) {
        const t = part(cone(0.05, 0.14, 4), M.teeth, -0.28 + i * 0.11, 0.1, -0.1, jaw);
        t.rotation.x = Math.PI;
        part(cone(0.05, 0.14, 4), M.teeth, -0.25 + i * 0.1, -0.12, -0.1, jaw);
      }
      for (const side of [-1, 1]) {
        const hip = pivot(body, side * 0.35, 0.45, 0);
        part(box(0.2, 0.4, 0.22), M.fur, 0, -0.18, 0, hip);
        part(box(0.26, 0.1, 0.34), M.hoof, 0, -0.4, -0.06, hip);
        const sh = pivot(body, side * 0.72, 1.1, 0);
        part(box(0.16, 0.55, 0.16), M.fur, 0, -0.27, 0, sh);
        for (let c = -1; c <= 1; c++) part(cone(0.03, 0.14, 4), M.horn, c * 0.05, -0.6, -0.05, sh).rotation.x = Math.PI;
        r[side < 0 ? 'hipL' : 'hipR'] = hip; r[side < 0 ? 'armL' : 'armR'] = sh;
      }
      r.jaw = jaw;
      return { root, rig: r, height: 1.8 };
    }
    case 'bull': {
      const root = new THREE.Group();
      const body = pivot(root);
      const r = { body };
      const trunk = pivot(body, 0, 1.45, 0);
      part(box(1.1, 1.0, 2.2), M.furRed, 0, 0, 0, trunk);
      part(box(1.2, 0.7, 0.9), M.furRed, 0, 0.45, -0.6, trunk); // hump
      const head = pivot(trunk, 0, 0.1, -1.2);
      part(box(0.7, 0.7, 0.8), M.furRed, 0, 0, -0.3, head);
      part(box(0.55, 0.4, 0.4), M.skinDark, 0, -0.2, -0.75, head); // snout
      for (const s of [-1, 1]) {
        const hn = pivot(head, s * 0.35, 0.25, -0.3);
        const h1 = part(cone(0.12, 0.7, 6), M.horn, s * 0.3, 0.05, 0, hn); h1.rotation.z = -s * 1.3;
        const h2 = part(cone(0.07, 0.5, 6), M.horn, s * 0.6, 0.35, -0.1, hn); h2.rotation.x = -0.4;
        part(sph(0.07, 6, 4), M.eyeRed, s * 0.3, 0.05, -0.62, head, false);
      }
      const tail = pivot(trunk, 0, 0.3, 1.1);
      part(box(0.08, 0.08, 0.7), M.furRed, 0, 0, 0.35, tail).rotation.x = -0.5;
      const legs = [];
      for (const [x, z] of [[-0.4, -0.75], [0.4, -0.75], [-0.4, 0.8], [0.4, 0.8]]) {
        const hip = pivot(trunk, x, -0.3, z);
        part(box(0.3, 0.7, 0.34), M.furRed, 0, -0.3, 0, hip);
        const knee = pivot(hip, 0, -0.65, 0);
        part(box(0.2, 0.55, 0.22), M.furRed, 0, -0.25, 0, knee);
        part(box(0.24, 0.12, 0.26), M.hoof, 0, -0.55, 0, knee);
        legs.push({ hip, knee });
      }
      r.trunk = trunk; r.head = head; r.legs = legs;
      return { root, rig: r, height: 2.4 };
    }
    case 'arachnid': {
      const root = new THREE.Group();
      const body = pivot(root);
      const r = { body };
      const abdomen = pivot(body, 0, 1.4, 0.4);
      for (let i = 0; i < 3; i++) {
        const seg = part(sph(0.75 - i * 0.12, 10, 8), i % 2 ? M.chitinDark : M.chitin, 0, 0, i * 0.7, abdomen);
        seg.scale.set(1.2, 0.7, 0.9);
      }
      const legs = [];
      for (let i = 0; i < 3; i++) for (const s of [-1, 1]) {
        const hip = pivot(abdomen, s * 0.7, 0, i * 0.6 - 0.2);
        const up = part(box(1.0, 0.12, 0.12), M.chitinDark, s * 0.45, 0.25, 0, hip); up.rotation.z = s * 0.5;
        const knee = pivot(hip, s * 0.9, 0.5, 0);
        const lo = part(box(0.1, 1.9, 0.1), M.chitin, s * 0.2, -0.9, 0, knee); lo.rotation.z = s * 0.2;
        legs.push({ hip, knee, side: s, i });
      }
      // tail curling over the top
      const tail = pivot(abdomen, 0, 0.2, 1.7);
      let p = tail;
      const tailSegs = [];
      for (let i = 0; i < 5; i++) {
        const seg = pivot(p, 0, 0, i === 0 ? 0 : 0.45);
        seg.rotation.x = 0.5;
        part(sph(0.26 - i * 0.03, 8, 6), M.chitin, 0, 0, 0.2, seg);
        tailSegs.push(seg); p = seg;
      }
      part(cone(0.12, 0.5, 6), M.glowRed, 0, -0.15, 0.55, p).rotation.x = Math.PI * 0.7;
      // humanoid torso up front
      const torso = pivot(body, 0, 1.7, -0.6);
      part(box(0.8, 1.0, 0.5), M.alienSkin, 0, 0.5, 0, torso);
      part(box(0.9, 0.3, 0.55), G.darkmetal, 0, 0.9, 0, torso);
      const head = pivot(torso, 0, 1.2, 0);
      part(sph(0.25, 10, 8), M.alienSkin, 0, 0.1, 0, head);
      part(box(0.3, 0.08, 0.05), M.eyeGreen, 0, 0.12, -0.23, head, false);
      r.guns = [];
      for (const s of [-1, 1]) {
        const sh = pivot(torso, s * 0.55, 0.85, 0);
        part(box(0.2, 0.55, 0.2), M.alienSkin, 0, -0.25, 0, sh);
        const gun = pivot(sh, 0, -0.5, 0);
        part(box(0.22, 0.22, 0.8), G.darkmetal, 0, 0, -0.3, gun);
        for (const b of [-0.05, 0.05]) part(cyl(0.035, 0.035, 0.5, 6), G.gunmetal, b, 0, -0.9, gun).rotation.x = Math.PI / 2;
        const mz = pivot(gun, 0, 0, -1.15);
        r.guns.push(mz);
        r[s < 0 ? 'armL' : 'armR'] = sh;
      }
      r.legs = legs; r.tail = tailSegs; r.torso = torso; r.abdomen = abdomen;
      return { root, rig: r, height: 3.3 };
    }
    case 'harpy': {
      const root = new THREE.Group();
      const body = pivot(root);
      const r = { body };
      const torso = pivot(body, 0, 0, 0);
      part(box(0.38, 0.6, 0.22), M.harpySkin, 0, 0, 0, torso);
      part(sph(0.15, 10, 8), M.harpySkin, 0, 0.45, 0, torso);
      part(box(0.34, 0.3, 0.22), M.hair, 0, 0.5, 0.06, torso);
      for (const s of [-1, 1]) part(sph(0.03, 6, 4), M.eyeRed, s * 0.06, 0.47, -0.13, torso, false);
      r.wings = [];
      for (const s of [-1, 1]) {
        const w = pivot(torso, s * 0.18, 0.2, 0.05);
        const shape = new THREE.Shape();
        shape.moveTo(0, 0); shape.lineTo(1.6, 0.4); shape.lineTo(1.9, -0.3); shape.lineTo(1.3, -0.5); shape.lineTo(0.9, -0.9); shape.lineTo(0.4, -0.5); shape.lineTo(0, -0.3);
        const wg = geo('harpywing', () => new THREE.ShapeGeometry(shape));
        const wm = part(wg, M.wing, 0, 0, 0, w);
        wm.scale.x = s; wm.rotation.x = Math.PI / 2;
        r.wings.push({ w, s });
      }
      for (const s of [-1, 1]) {
        const leg = pivot(torso, s * 0.1, -0.3, 0);
        part(box(0.07, 0.45, 0.07), M.hoof, 0, -0.22, 0.05, leg).rotation.x = 0.3;
        part(cone(0.05, 0.18, 4), M.horn, 0, -0.5, 0, leg).rotation.x = Math.PI;
      }
      r.torso = torso;
      return { root, rig: r, height: 1.2 };
    }
    case 'biomech': {
      const root = new THREE.Group();
      const body = pivot(root);
      const r = { body };
      for (const side of [-1, 1]) {
        const hip = pivot(body, side * 0.6, 2.4, 0);
        part(box(0.4, 1.3, 0.5), M.mech, 0, -0.6, -0.1, hip);
        const knee = pivot(hip, 0, -1.2, -0.2);
        part(box(0.3, 1.3, 0.35), M.mechDark, 0, -0.6, 0.15, knee).rotation.x = -0.25;
        part(box(0.6, 0.18, 0.8), M.mech, 0, -1.2, 0.1, knee);
        r[side < 0 ? 'hipL' : 'hipR'] = hip; r[side < 0 ? 'kneeL' : 'kneeR'] = knee;
      }
      const torso = pivot(body, 0, 2.5, 0);
      part(box(1.5, 0.5, 1.0), M.mechDark, 0, 0, 0, torso);
      part(box(1.3, 1.3, 1.1), M.mech, 0, 0.9, 0, torso);
      part(box(0.9, 0.25, 0.1), M.visor, 0, 1.2, -0.56, torso, false);
      r.pods = [];
      for (const s of [-1, 1]) {
        const pod = pivot(torso, s * 0.95, 1.4, 0);
        part(box(0.6, 0.6, 1.0), M.mechDark, 0, 0, 0, pod);
        for (const [a, b] of [[-0.14, -0.14], [0.14, -0.14], [-0.14, 0.14], [0.14, 0.14]]) {
          part(cyl(0.1, 0.1, 0.1, 8), M.glowOrange, a, b, -0.5, pod, false).rotation.x = Math.PI / 2;
        }
        r.pods.push(pivot(pod, 0, 0, -0.6));
        const sh = pivot(torso, s * 0.85, 0.9, 0);
        part(box(0.3, 1.0, 0.3), M.mech, 0, -0.5, 0, sh);
        part(box(0.35, 0.3, 0.6), M.mechDark, 0, -1.05, -0.15, sh);
        r[s < 0 ? 'armL' : 'armR'] = sh;
      }
      r.torso = torso;
      return { root, rig: r, height: 4.6 };
    }
    case 'golem': {
      // Hulking basalt brute with molten cracks glowing between the rocks
      const root = new THREE.Group();
      const body = pivot(root);
      const r = { body };
      const rock = G.basalt, magma = G.lava;
      const torso = pivot(body, 0, 1.7, 0);
      const chest = part(new THREE.IcosahedronGeometry(1.0, 0), rock, 0, 0.5, 0, torso); chest.scale.set(1.25, 1.05, 0.95);
      const core = part(new THREE.IcosahedronGeometry(0.62, 0), magma, 0, 0.5, -0.38, torso, false); core.scale.set(1.2, 1, 0.9);
      part(new THREE.IcosahedronGeometry(0.5, 0), rock, 0, 1.45, -0.15, torso); // head
      for (const s of [-1, 1]) part(box(0.16, 0.08, 0.06), magma, s * 0.18, 1.5, -0.6, torso, false); // eyes
      for (const side of [-1, 1]) {
        const sh = pivot(torso, side * 1.25, 0.9, 0);
        part(new THREE.IcosahedronGeometry(0.5, 0), rock, 0, 0, 0, sh);
        part(box(0.45, 1.0, 0.45), rock, 0, -0.65, 0, sh);
        part(new THREE.IcosahedronGeometry(0.42, 0), magma, 0, -1.25, 0, sh, false);
        const fist = part(new THREE.IcosahedronGeometry(0.5, 0), rock, 0, -1.3, 0, sh); fist.scale.setScalar(1.05);
        r[side < 0 ? 'armL' : 'armR'] = sh;
        const hip = pivot(body, side * 0.55, 1.05, 0);
        part(box(0.55, 1.0, 0.6), rock, 0, -0.5, 0, hip);
        part(box(0.7, 0.2, 0.85), rock, 0, -1.0, -0.1, hip);
        r[side < 0 ? 'hipL' : 'hipR'] = hip;
      }
      r.torso = torso;
      return { root, rig: r, height: 3.4 };
    }
    case 'boss': {
      // Colossal black-basalt pharaoh with gold regalia and a burning core.
      const root = new THREE.Group();
      const body = pivot(root);
      const r = { body };
      const ra = variant === 'ra';
      const stone = ra ? G.gold : G.basalt, trim = ra ? G.basalt : G.gold;
      for (const side of [-1, 1]) {
        const hip = pivot(body, side * 1.6, 6, 0);
        part(box(1.4, 3.2, 1.5), stone, 0, -1.5, 0, hip);
        const knee = pivot(hip, 0, -3.1, 0);
        part(box(1.2, 3.0, 1.3), stone, 0, -1.4, 0, knee);
        part(box(1.6, 0.6, 2.4), trim, 0, -2.8, -0.4, knee);
        part(box(1.45, 0.4, 1.55), trim, 0, 0, 0, knee);
        part(box(0.2, 1.6, 0.1), M.glowOrange, 0, -1.2, -0.66, knee, false);
        r[side < 0 ? 'hipL' : 'hipR'] = hip; r[side < 0 ? 'kneeL' : 'kneeR'] = knee;
      }
      const torso = pivot(body, 0, 6, 0);
      for (let i = 0; i < 5; i++) part(box(4.0 - i * 0.02, 0.28, 2.2), i % 2 ? M.blueStripe : trim, 0, -0.3 + i * 0.28, 0, torso); // striped kilt belt
      part(box(3.6, 4.2, 2.2), stone, 0, 3.0, 0, torso);
      part(box(4.6, 0.9, 2.6), trim, 0, 4.6, 0, torso); // collar
      for (let i = 0; i < 3; i++) part(box(3.8 - i * 0.6, 0.18, 0.1), M.glowOrange, 0, 1.6 + i * 0.5, -1.12, torso, false); // glowing ribs
      r.core = part(sph(0.6, 16, 12), M.glowRed, 0, 3.4, -1.0, torso, false);
      const head = pivot(torso, 0, 5.2, 0);
      part(box(1.5, 1.9, 1.6), stone, 0, 0.9, 0, head);
      for (let i = 0; i < 6; i++) part(box(2.4 - i * 0.12, 0.25, 1.9), i % 2 ? M.blueStripe : trim, 0, 1.9 - i * 0.28, 0.1, head);
      for (const s of [-1, 1]) {
        part(box(0.6, 2.2, 0.6), trim, s * 1.05, 0.2, 0.2, head);
        part(box(0.42, 0.24, 0.12), M.glowRed, s * 0.38, 1.1, -0.82, head, false);
      }
      part(cone(0.25, 0.7, 4), trim, 0, 2.4, -0.7, head).rotation.x = -0.3; // uraeus cobra
      part(box(0.35, 0.9, 0.3), trim, 0, -0.3, -0.7, head); // beard
      if (ra) {
        // blazing sun disc crowning Ra's head
        const disc = part(new THREE.TorusGeometry(2.2, 0.35, 10, 32), M.glowOrange, 0, 3.6, 0.6, head, false);
        disc.rotation.y = 0;
        r.sunDisc = part(new THREE.CircleGeometry(2.0, 32), new THREE.MeshBasicMaterial({ color: 0xffaa33, transparent: true, opacity: 0.55, side: THREE.DoubleSide }), 0, 3.6, 0.62, head, false);
      }
      r.cannons = [];
      for (const s of [-1, 1]) {
        const sh = pivot(torso, s * 2.4, 4.2, 0);
        part(box(1.1, 1.1, 1.1), trim, 0, 0, 0, sh);
        part(box(0.9, 2.8, 0.9), stone, 0, -1.6, 0, sh);
        const el = pivot(sh, 0, -3.0, 0);
        part(box(1.0, 1.0, 3.2), G.darkmetal, 0, 0, -1.2, el);
        for (let i = 0; i < 3; i++) part(box(1.15, 1.15, 0.2), trim, 0, 0, -0.2 - i * 0.9, el);
        part(cyl(0.5, 0.5, 0.5, 10), M.glowOrange, 0, 0, -2.85, el, false).rotation.x = Math.PI / 2;
        r.cannons.push(pivot(el, 0, 0, -3.2));
        r[s < 0 ? 'armL' : 'armR'] = sh; r[s < 0 ? 'elbowL' : 'elbowR'] = el;
      }
      r.torso = torso; r.head = head;
      return { root, rig: r, height: 14 };
    }
  }
  throw new Error('unknown enemy model ' + type);
}

// ---------------------------------------------------------------------------
// First-person weapon viewmodels (barrel points to -Z).
const LASER_GLOW = new THREE.MeshStandardMaterial({ color: 0x003322, emissive: 0x33ffcc, emissiveIntensity: 1.2 });
export function makeWeaponModel(id) {
  const G = getMaterials();
  const M = mats();
  const g = new THREE.Group();
  const r = { group: g, muzzles: [], spin: null };
  const P = (geom, mat, x, y, z, parent = g) => part(geom, mat, x, y, z, parent, false);
  const tube = (rad, len, mat, x, y, z, parent = g, seg = 12) => { const m = P(cyl(rad, rad, len, seg), mat, x, y, z, parent); m.rotation.x = Math.PI / 2; return m; };
  switch (id) {
    case 'knife': {
      const blade = new THREE.Shape();
      blade.moveTo(0, 0); blade.lineTo(0.035, 0); blade.lineTo(0.03, 0.3); blade.lineTo(0, 0.36); blade.lineTo(-0.005, 0.28);
      const bg = geo('knifeblade', () => new THREE.ExtrudeGeometry(blade, { depth: 0.006, bevelEnabled: false }));
      const bm = P(bg, new THREE.MeshStandardMaterial({ color: 0xaab0b8, metalness: 0.85, roughness: 0.32 }), -0.015, 0, 0);
      bm.rotation.x = -Math.PI / 2;
      P(box(0.08, 0.02, 0.03), G.brass, 0.003, 0, 0.005);
      P(box(0.035, 0.03, 0.12), G.wood, 0.003, 0, 0.08);
      break;
    }
    case 'revolver': {
      P(box(0.05, 0.06, 0.16), G.gunmetal, 0, 0, 0);
      tube(0.022, 0.07, G.darkmetal, 0, 0.004, -0.02, g, 6);
      tube(0.011, 0.24, G.gunmetal, 0, 0.018, -0.18);
      const grip = P(box(0.042, 0.13, 0.05), G.wood, 0, -0.07, 0.07); grip.rotation.x = -0.35;
      P(box(0.012, 0.02, 0.012), G.darkmetal, 0, 0.04, -0.28);
      r.muzzles.push(new THREE.Vector3(0, 0.018, -0.31));
      break;
    }
    case 'shotgun': {
      tube(0.022, 0.62, G.gunmetal, 0, 0.02, -0.26);
      tube(0.016, 0.5, G.darkmetal, 0, -0.025, -0.22);
      P(box(0.055, 0.045, 0.12), G.wood, 0, -0.025, -0.2); // pump
      P(box(0.06, 0.08, 0.2), G.darkmetal, 0, 0, 0.08);
      const stock = P(box(0.05, 0.1, 0.3), G.wood, 0, -0.05, 0.3); stock.rotation.x = 0.12;
      r.pump = g.children[2];
      r.muzzles.push(new THREE.Vector3(0, 0.02, -0.58));
      break;
    }
    case 'dshotgun': {
      tube(0.024, 0.6, G.gunmetal, -0.026, 0.02, -0.25);
      tube(0.024, 0.6, G.gunmetal, 0.026, 0.02, -0.25);
      P(box(0.1, 0.03, 0.4), G.wood, 0, -0.015, -0.18);
      P(box(0.1, 0.08, 0.16), G.darkmetal, 0, 0, 0.1);
      const stock = P(box(0.06, 0.11, 0.3), G.wood, 0, -0.05, 0.32); stock.rotation.x = 0.15;
      r.muzzles.push(new THREE.Vector3(-0.026, 0.02, -0.56), new THREE.Vector3(0.026, 0.02, -0.56));
      break;
    }
    case 'tommy': {
      P(box(0.06, 0.08, 0.36), G.darkmetal, 0, 0, -0.05);
      tube(0.018, 0.3, G.gunmetal, 0, 0.015, -0.38);
      for (let i = 0; i < 6; i++) tube(0.026, 0.012, G.gunmetal, 0, 0.015, -0.28 - i * 0.03);
      const drum = P(cyl(0.085, 0.085, 0.05, 16), G.darkmetal, 0, -0.1, -0.08); drum.rotation.z = Math.PI / 2;
      P(box(0.04, 0.1, 0.05), G.wood, 0, -0.08, -0.26);
      P(box(0.04, 0.1, 0.05), G.wood, 0, -0.08, 0.06);
      P(box(0.05, 0.09, 0.26), G.wood, 0, -0.03, 0.26);
      r.muzzles.push(new THREE.Vector3(0, 0.015, -0.54));
      break;
    }
    case 'minigun': {
      const spin = new THREE.Group(); g.add(spin); spin.position.set(0, 0, -0.25);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        tube(0.014, 0.6, G.gunmetal, Math.cos(a) * 0.04, Math.sin(a) * 0.04, -0.1, spin, 6);
      }
      tube(0.06, 0.03, G.darkmetal, 0, 0, -0.35, spin);
      tube(0.06, 0.03, G.darkmetal, 0, 0, 0.1, spin);
      P(box(0.16, 0.14, 0.3), G.darkmetal, 0, 0, 0.12);
      P(box(0.1, 0.1, 0.18), G.brass, 0.1, -0.05, 0.12);
      r.spin = spin;
      r.muzzles.push(new THREE.Vector3(0, 0, -0.66));
      break;
    }
    case 'rocket': {
      tube(0.07, 0.8, G.darkmetal, 0, 0, -0.1, g, 14);
      tube(0.085, 0.1, G.gunmetal, 0, 0, -0.5, g, 14);
      const back = P(cyl(0.1, 0.07, 0.12, 14), G.gunmetal, 0, 0, 0.35); back.rotation.x = Math.PI / 2;
      P(box(0.04, 0.12, 0.06), G.darkmetal, 0, -0.1, 0.05);
      P(box(0.03, 0.06, 0.12), G.gunmetal, 0.06, 0.09, -0.15);
      P(sph(0.06, 10, 8), new THREE.MeshStandardMaterial({ color: 0xaa1111, roughness: 0.4 }), 0, 0, -0.52);
      r.rocketTip = g.children[g.children.length - 1];
      r.muzzles.push(new THREE.Vector3(0, 0, -0.58));
      break;
    }
    case 'grenade': {
      tube(0.075, 0.45, G.gunmetal, 0, 0, -0.18, g, 14);
      const drum = P(cyl(0.11, 0.11, 0.2, 8), G.darkmetal, 0, -0.02, 0.1); drum.rotation.x = Math.PI / 2;
      P(box(0.05, 0.14, 0.06), G.wood, 0, -0.14, 0.12);
      P(box(0.06, 0.1, 0.25), G.wood, 0, -0.05, 0.34);
      r.drum = drum;
      r.muzzles.push(new THREE.Vector3(0, 0, -0.42));
      break;
    }
    case 'laser': {
      P(box(0.14, 0.12, 0.4), new THREE.MeshStandardMaterial({ color: 0x7a8490, roughness: 0.4, metalness: 0.6 }), 0, 0, -0.05);
      P(box(0.04, 0.03, 0.28), LASER_GLOW, 0, 0.07, -0.05);
      for (const [x, y] of [[-0.035, 0.03], [0.035, 0.03], [-0.035, -0.03], [0.035, -0.03]]) {
        tube(0.018, 0.3, G.gunmetal, x, y, -0.35, g, 8);
        P(sph(0.02, 8, 6), LASER_GLOW, x, y, -0.5);
        r.muzzles.push(new THREE.Vector3(x, y, -0.52));
      }
      P(box(0.05, 0.12, 0.06), G.darkmetal, 0, -0.1, 0.05);
      break;
    }
    case 'cannon': {
      tube(0.13, 0.7, M.mechDark, 0, 0, -0.2, g, 16);
      tube(0.16, 0.08, G.brass, 0, 0, -0.56, g, 16);
      tube(0.15, 0.08, G.brass, 0, 0, 0.12, g, 16);
      P(sph(0.15, 12, 10), M.mechDark, 0, 0, 0.18);
      for (const s of [-1, 1]) P(box(0.04, 0.04, 0.3), G.wood, s * 0.2, -0.08, 0);
      r.muzzles.push(new THREE.Vector3(0, 0, -0.62));
      break;
    }
    default:
      throw new Error('unknown weapon model ' + id);
  }
  return r;
}

// ---------------------------------------------------------------------------
// Pickup models
export function makePickupModel(kind, sub) {
  const G = getMaterials();
  const M = mats();
  const g = new THREE.Group();
  const P = (geom, mat, x, y, z) => part(geom, mat, x, y, z, g, true);
  if (kind === 'health') {
    const colors = { small: 0x33dd55, medium: 0x33aaff, large: 0xffcc22, super: 0xff3355 };
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: colors[sub] || 0x33dd55, emissiveIntensity: 1.2, roughness: 0.3 });
    const s = { small: 0.6, medium: 0.8, large: 1.0, super: 1.2 }[sub] || 0.8;
    if (sub === 'super') {
      P(new THREE.OctahedronGeometry(0.35), mat, 0, 0, 0);
    } else {
      P(box(0.5 * s, 0.16 * s, 0.16 * s), mat, 0, 0, 0);
      P(box(0.16 * s, 0.5 * s, 0.16 * s), mat, 0, 0, 0);
    }
  } else if (kind === 'armor') {
    const colors = { small: 0x88ff88, medium: 0xffd044, large: 0xff5533 };
    const mat = new THREE.MeshStandardMaterial({ color: colors[sub] || 0xffd044, roughness: 0.3, metalness: 0.7, emissive: colors[sub] || 0xffd044, emissiveIntensity: 0.25 });
    P(box(0.55, 0.6, 0.18), mat, 0, 0, 0);
    for (const s of [-1, 1]) P(box(0.18, 0.2, 0.2), mat, s * 0.3, 0.26, 0);
    P(box(0.2, 0.12, 0.2), M.mechDark, 0, 0.3, 0);
  } else if (kind === 'ammo') {
    const colors = { shells: 0xcc3322, bullets: 0xd0a030, rockets: 0x6a8a2a, grenades: 0x3a6a8a, cells: 0x33ccee, cannonballs: 0x333333 };
    const col = colors[sub] || 0x888888;
    const mat = new THREE.MeshStandardMaterial({ color: col, roughness: 0.5, metalness: 0.3 });
    P(box(0.6, 0.35, 0.4), G.wood, 0, 0, 0);
    P(box(0.62, 0.08, 0.42), mat, 0, 0.1, 0);
    if (sub === 'cannonballs') { P(sph(0.16, 10, 8), mat, -0.12, 0.3, 0); P(sph(0.16, 10, 8), mat, 0.14, 0.3, 0); }
    else if (sub === 'rockets' || sub === 'grenades') { const t = P(cyl(0.06, 0.06, 0.5, 8), mat, 0, 0.26, 0); t.rotation.z = Math.PI / 2; }
    else if (sub === 'cells') P(box(0.3, 0.2, 0.2), M.glowCyan, 0, 0.25, 0);
    else for (let i = 0; i < 4; i++) P(cyl(0.035, 0.035, 0.18, 6), sub === 'shells' ? mat : G.brass, -0.18 + i * 0.12, 0.26, 0);
  } else if (kind === 'weapon') {
    const w = makeWeaponModel(sub);
    w.group.scale.setScalar(1.8);
    w.group.rotation.y = Math.PI / 2;
    w.group.traverse((o) => { o.castShadow = true; });
    g.add(w.group);
  } else if (kind === 'key') {
    // Golden ankh: loop + cross-bar + shaft, glowing
    const mat = new THREE.MeshStandardMaterial({ color: 0xffd060, emissive: 0xffaa22, emissiveIntensity: 1.4, metalness: 0.9, roughness: 0.25 });
    const loop = P(new THREE.TorusGeometry(0.2, 0.06, 10, 24), mat, 0, 0.28, 0); loop.scale.set(0.85, 1.15, 1);
    P(box(0.5, 0.1, 0.1), mat, 0, 0.02, 0);
    P(box(0.1, 0.6, 0.1), mat, 0, -0.28, 0);
  } else if (kind === 'powerup' && sub === 'bomb') {
    // Serious Bomb: black sphere, gold band, glowing fuse
    P(sph(0.36, 16, 12), new THREE.MeshStandardMaterial({ color: 0x111114, roughness: 0.3, metalness: 0.6 }), 0, 0, 0);
    const band = P(new THREE.TorusGeometry(0.37, 0.05, 8, 24), G.gold, 0, 0, 0); band.rotation.x = Math.PI / 2;
    P(cyl(0.06, 0.06, 0.18, 8), G.gold, 0, 0.4, 0);
    P(sph(0.08, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffdd66 }), 0, 0.52, 0);
  } else if (kind === 'powerup') {
    const col = { damage: 0xff2244, protect: 0xffcc33, speed: 0x33ddff }[sub] || 0xffcc33;
    const mat = new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 2.5, roughness: 0.2, flatShading: true });
    P(new THREE.IcosahedronGeometry(0.4, 0), mat, 0, 0, 0);
    const halo = new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false });
    part(sph(0.7, 16, 12), halo, 0, 0, 0, g, false);
  }
  return g;
}
