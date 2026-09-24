// Visual effects: GPU point particles (additive + alpha), gibs, blood decals,
// bullet tracers, pooled flash lights and camera shake.
import * as THREE from 'three';
import { rand } from './util.js';

const VERT = /* glsl */`
attribute float size;
attribute float alpha;
attribute vec3 pcolor;
varying float vA;
varying vec3 vC;
uniform float scale;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = min(size * scale / max(-mv.z, 0.1), 512.0);
  vA = alpha; vC = pcolor;
}`;

const FRAG_ADD = /* glsl */`
varying float vA; varying vec3 vC;
void main() {
  float d = length(gl_PointCoord - 0.5) * 2.0;
  float a = pow(max(1.0 - d, 0.0), 1.6) * vA;
  gl_FragColor = vec4(vC * a, a);
}`;

const FRAG_ALPHA = /* glsl */`
varying float vA; varying vec3 vC;
void main() {
  float d = length(gl_PointCoord - 0.5) * 2.0;
  float a = smoothstep(1.0, 0.35, d) * vA;
  if (a < 0.01) discard;
  gl_FragColor = vec4(vC, a);
}`;

class ParticlePool {
  constructor(max, additive) {
    this.max = max; this.count = 0;
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.alpha = new Float32Array(max);
    this.size = new Float32Array(max);
    // simulation state
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.s0 = new Float32Array(max);
    this.s1 = new Float32Array(max);
    this.a0 = new Float32Array(max);
    this.grav = new Float32Array(max);
    this.drag = new Float32Array(max);
    this.c0 = new Float32Array(max * 3);
    this.c1 = new Float32Array(max * 3);
    const g = new THREE.BufferGeometry();
    this.aPos = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.aCol = new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage);
    this.aAlpha = new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage);
    this.aSize = new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.aPos);
    g.setAttribute('pcolor', this.aCol);
    g.setAttribute('alpha', this.aAlpha);
    g.setAttribute('size', this.aSize);
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
    this.uniforms = { scale: { value: 600 } };
    const m = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: additive ? FRAG_ADD : FRAG_ALPHA,
      uniforms: this.uniforms, transparent: true, depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    if (additive) { m.blending = THREE.CustomBlending; m.blendSrc = THREE.OneFactor; m.blendDst = THREE.OneFactor; }
    this.points = new THREE.Points(g, m);
    this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 11 : 10;
  }

  spawn(x, y, z, vx, vy, vz, life, s0, s1, r, g, b, r1, g1, b1, a0, grav, drag) {
    let i = this.count;
    if (i >= this.max) i = Math.floor(Math.random() * this.max); else this.count++;
    const i3 = i * 3;
    this.pos[i3] = x; this.pos[i3 + 1] = y; this.pos[i3 + 2] = z;
    this.vel[i3] = vx; this.vel[i3 + 1] = vy; this.vel[i3 + 2] = vz;
    this.c0[i3] = r; this.c0[i3 + 1] = g; this.c0[i3 + 2] = b;
    this.c1[i3] = r1; this.c1[i3 + 1] = g1; this.c1[i3 + 2] = b1;
    this.life[i] = life; this.maxLife[i] = life;
    this.s0[i] = s0; this.s1[i] = s1; this.a0[i] = a0;
    this.grav[i] = grav; this.drag[i] = drag;
  }

  update(dt) {
    let n = this.count;
    for (let i = 0; i < n; i++) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        // swap-remove with last
        n--;
        this.copy(n, i);
        i--;
        continue;
      }
      const i3 = i * 3;
      const dr = Math.max(0, 1 - this.drag[i] * dt);
      this.vel[i3] *= dr; this.vel[i3 + 1] = this.vel[i3 + 1] * dr - this.grav[i] * dt; this.vel[i3 + 2] *= dr;
      this.pos[i3] += this.vel[i3] * dt; this.pos[i3 + 1] += this.vel[i3 + 1] * dt; this.pos[i3 + 2] += this.vel[i3 + 2] * dt;
      if (this.pos[i3 + 1] < 0.02 && this.grav[i] > 0) { this.pos[i3 + 1] = 0.02; this.vel[i3 + 1] *= -0.2; this.vel[i3] *= 0.5; this.vel[i3 + 2] *= 0.5; }
      const t = 1 - this.life[i] / this.maxLife[i];
      this.size[i] = this.s0[i] + (this.s1[i] - this.s0[i]) * t;
      this.alpha[i] = this.a0[i] * (t < 0.1 ? t * 10 * 0.5 + 0.5 : 1) * (1 - t * t);
      this.col[i3] = this.c0[i3] + (this.c1[i3] - this.c0[i3]) * t;
      this.col[i3 + 1] = this.c0[i3 + 1] + (this.c1[i3 + 1] - this.c0[i3 + 1]) * t;
      this.col[i3 + 2] = this.c0[i3 + 2] + (this.c1[i3 + 2] - this.c0[i3 + 2]) * t;
    }
    this.count = n;
    const g = this.points.geometry;
    g.setDrawRange(0, n);
    for (const a of [this.aPos, this.aCol, this.aAlpha, this.aSize]) {
      a.clearUpdateRanges(); a.addUpdateRange(0, n * a.itemSize); a.needsUpdate = true;
    }
  }

  copy(from, to) {
    const f3 = from * 3, t3 = to * 3;
    for (let k = 0; k < 3; k++) {
      this.pos[t3 + k] = this.pos[f3 + k]; this.vel[t3 + k] = this.vel[f3 + k];
      this.c0[t3 + k] = this.c0[f3 + k]; this.c1[t3 + k] = this.c1[f3 + k]; this.col[t3 + k] = this.col[f3 + k];
    }
    this.life[to] = this.life[from]; this.maxLife[to] = this.maxLife[from];
    this.s0[to] = this.s0[from]; this.s1[to] = this.s1[from]; this.a0[to] = this.a0[from];
    this.grav[to] = this.grav[from]; this.drag[to] = this.drag[from];
    this.size[to] = this.size[from]; this.alpha[to] = this.alpha[from];
  }

  clear() { this.count = 0; }
}

export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.add = new ParticlePool(6000, true);
    this.alpha = new ParticlePool(5000, false);
    scene.add(this.add.points, this.alpha.points);
    this.shake = 0;
    this.world = null;

    // Pooled flash lights: fixed count so shader programs never recompile.
    this.lights = [];
    for (let i = 0; i < 6; i++) {
      const l = new THREE.PointLight(0xffaa55, 0, 12, 1.6);
      l.userData = { t: 0, dur: 1, peak: 0 };
      scene.add(l);
      this.lights.push(l);
    }

    // Tracers
    const tg = new THREE.CylinderGeometry(0.018, 0.018, 1, 4, 1, true).rotateX(Math.PI / 2).translate(0, 0, 0.5);
    this.tracerMat = new THREE.MeshBasicMaterial({ color: 0xffe9a0, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    this.tracers = [];
    for (let i = 0; i < 40; i++) {
      const m = new THREE.Mesh(tg, this.tracerMat.clone());
      m.visible = false; m.userData.t = 0;
      scene.add(m); this.tracers.push(m);
    }

    // Gibs
    this.gibGeo = [new THREE.BoxGeometry(0.22, 0.14, 0.18), new THREE.DodecahedronGeometry(0.12), new THREE.BoxGeometry(0.08, 0.35, 0.08)];
    this.gibMats = {
      flesh: new THREE.MeshStandardMaterial({ color: 0x8a1010, roughness: 0.5 }),
      bone: new THREE.MeshStandardMaterial({ color: 0xe8e0c8, roughness: 0.6 }),
      metal: new THREE.MeshStandardMaterial({ color: 0x555a66, roughness: 0.4, metalness: 0.8 }),
      fur: new THREE.MeshStandardMaterial({ color: 0x4a3020, roughness: 1 }),
      stone: new THREE.MeshStandardMaterial({ color: 0xa08868, roughness: 1 }),
      green: new THREE.MeshStandardMaterial({ color: 0x3a6a2a, roughness: 0.6 }),
    };
    this.gibPool = [];
    for (let i = 0; i < 140; i++) {
      const m = new THREE.Mesh(this.gibGeo[i % 3], this.gibMats.flesh);
      m.visible = false; m.castShadow = true;
      m.userData = { v: new THREE.Vector3(), av: new THREE.Vector3(), life: 0, blood: true };
      scene.add(m); this.gibPool.push(m);
    }
    this.gibIdx = 0;

    // Blood decals on the floor
    const dc = document.createElement('canvas'); dc.width = dc.height = 128;
    const x = dc.getContext('2d');
    for (let i = 0; i < 14; i++) {
      const r = rand(8, 30), px = 64 + rand(-30, 30), py = 64 + rand(-30, 30);
      const gr = x.createRadialGradient(px, py, 0, px, py, r);
      gr.addColorStop(0, 'rgba(90,0,0,0.95)'); gr.addColorStop(0.7, 'rgba(70,0,0,0.8)'); gr.addColorStop(1, 'rgba(60,0,0,0)');
      x.fillStyle = gr; x.beginPath(); x.arc(px, py, r, 0, Math.PI * 2); x.fill();
    }
    const dtex = new THREE.CanvasTexture(dc); dtex.colorSpace = THREE.SRGBColorSpace;
    this.decalMat = new THREE.MeshStandardMaterial({ map: dtex, transparent: true, depthWrite: false, roughness: 0.3, polygonOffset: true, polygonOffsetFactor: -2 });
    const dg = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    this.decals = [];
    for (let i = 0; i < 60; i++) {
      const m = new THREE.Mesh(dg, this.decalMat); m.visible = false; m.receiveShadow = true;
      scene.add(m); this.decals.push(m);
    }
    this.decalIdx = 0;
  }

  setScale(v) { this.add.uniforms.scale.value = v; this.alpha.uniforms.scale.value = v; }

  clear() {
    this.add.clear(); this.alpha.clear();
    for (const g of this.gibPool) { g.visible = false; g.userData.life = 0; }
    for (const d of this.decals) d.visible = false;
    for (const t of this.tracers) t.visible = false;
    for (const l of this.lights) l.intensity = 0;
    this.shake = 0;
  }

  flash(x, y, z, color = 0xffaa55, peak = 30, dist = 14, dur = 0.25) {
    let best = this.lights[0];
    for (const l of this.lights) if (l.userData.t <= 0 || l.userData.t < best.userData.t) { best = l; if (l.userData.t <= 0) break; }
    best.position.set(x, y, z); best.color.set(color); best.distance = dist;
    best.userData.t = dur; best.userData.dur = dur; best.userData.peak = peak;
    best.intensity = peak;
  }

  tracer(ax, ay, az, bx, by, bz, color = 0xffe9a0) {
    const t = this.tracers.find((m) => !m.visible) || this.tracers[0];
    const len = Math.hypot(bx - ax, by - ay, bz - az);
    t.position.set(ax, ay, az);
    t.lookAt(bx, by, bz);
    t.scale.set(1, 1, len);
    t.material.color.set(color);
    t.material.opacity = 1;
    t.visible = true; t.userData.t = 0.06;
  }

  addShake(v) { this.shake = Math.min(1.2, this.shake + v); }

  // --- composite effects ---
  sparks(x, y, z, nx, ny, nz, n = 8, color = [1, 0.8, 0.4]) {
    for (let i = 0; i < n; i++) {
      const s = rand(3, 9);
      this.add.spawn(x, y, z, (nx + rand(-0.7, 0.7)) * s, (ny + rand(-0.3, 0.9)) * s, (nz + rand(-0.7, 0.7)) * s,
        rand(0.15, 0.4), 0.08, 0.02, color[0] * 3, color[1] * 3, color[2] * 3, 1, 0.3, 0, 1, 18, 1);
    }
  }

  dust(x, y, z, nx, ny, nz, n = 5, c = [0.75, 0.65, 0.5]) {
    for (let i = 0; i < n; i++) {
      const s = rand(0.5, 2);
      this.alpha.spawn(x, y, z, (nx + rand(-0.5, 0.5)) * s, (ny + rand(0, 0.5)) * s, (nz + rand(-0.5, 0.5)) * s,
        rand(0.5, 1.1), 0.25, rand(0.8, 1.4), c[0], c[1], c[2], c[0] * 0.8, c[1] * 0.8, c[2] * 0.8, 0.6, -0.3, 2);
    }
  }

  blood(x, y, z, dx, dy, dz, n = 10, c = [0.55, 0.02, 0.02]) {
    for (let i = 0; i < n; i++) {
      const s = rand(1, 5);
      this.alpha.spawn(x, y, z, (dx + rand(-0.8, 0.8)) * s, (dy + rand(-0.2, 1.2)) * s, (dz + rand(-0.8, 0.8)) * s,
        rand(0.4, 0.9), rand(0.12, 0.25), rand(0.3, 0.5), c[0], c[1], c[2], c[0] * 0.5, c[1] * 0.5, c[2] * 0.5, 0.95, 14, 0.5);
    }
  }

  decal(x, z, size = 1.5, y = 0.02) {
    const d = this.decals[this.decalIdx++ % this.decals.length];
    d.position.set(x, y + Math.random() * 0.01, z);
    d.rotation.y = Math.random() * Math.PI * 2;
    d.scale.set(size, 1, size);
    d.visible = true;
  }

  explosion(x, y, z, scale = 1, color = null) {
    const fire = color || [1.0, 0.55, 0.15];
    for (let i = 0; i < 28 * scale; i++) {
      const s = rand(2, 9) * scale;
      const th = rand(0, Math.PI * 2), ph = rand(-0.2, 1);
      this.add.spawn(x, y, z, Math.cos(th) * s * (1 - ph * 0.5), ph * s, Math.sin(th) * s * (1 - ph * 0.5),
        rand(0.3, 0.7), rand(1.2, 2) * scale, rand(2.5, 4) * scale, fire[0] * 2.2, fire[1] * 2.2, fire[2] * 2.2, 0.5, 0.08, 0.02, 0.8, -2, 3);
    }
    for (let i = 0; i < 30 * scale; i++) {
      const s = rand(8, 22);
      this.add.spawn(x, y, z, rand(-1, 1) * s, rand(0, 1) * s, rand(-1, 1) * s, rand(0.3, 0.9), 0.12, 0.05, 2.5, 1.8, 0.9, 1, 0.3, 0, 1, 16, 0.5);
    }
    for (let i = 0; i < 18 * scale; i++) {
      const s = rand(1, 4) * scale;
      this.alpha.spawn(x + rand(-1, 1) * scale, y + rand(0, 1), z + rand(-1, 1) * scale, rand(-1, 1) * s, rand(0.5, 2) * s, rand(-1, 1) * s,
        rand(1.5, 3), 1.5 * scale, rand(4, 7) * scale, 0.12, 0.1, 0.09, 0.3, 0.28, 0.26, 0.6, -0.6, 1.2);
    }
    this.flash(x, y + 1, z, 0xff8833, 50 * scale, 18 * scale, 0.45);
  }

  teleport(x, y, z, h = 2) {
    for (let i = 0; i < 40; i++) {
      const a = rand(0, Math.PI * 2), r = rand(0.6, 1.4);
      this.add.spawn(x + Math.cos(a) * r, y + rand(0, h), z + Math.sin(a) * r, -Math.cos(a) * 2, rand(2, 6), -Math.sin(a) * 2,
        rand(0.4, 0.9), 0.35, 0.05, 0.6, 1.6, 3, 0.2, 0.5, 2, 1, 0, 1);
    }
    this.flash(x, y + 1, z, 0x66ccff, 25, 10, 0.5);
  }

  gibs(x, y, z, count, mats = ['flesh', 'bone'], force = 8, blood = true) {
    for (let i = 0; i < count; i++) {
      const g = this.gibPool[this.gibIdx++ % this.gibPool.length];
      g.material = this.gibMats[mats[i % mats.length]];
      g.position.set(x + rand(-0.4, 0.4), y + rand(-0.3, 0.6), z + rand(-0.4, 0.4));
      g.userData.v.set(rand(-1, 1) * force, rand(0.4, 1.4) * force, rand(-1, 1) * force);
      g.userData.av.set(rand(-15, 15), rand(-15, 15), rand(-15, 15));
      g.userData.life = rand(5, 8);
      g.userData.blood = blood;
      g.scale.setScalar(rand(0.8, 1.6));
      g.visible = true;
    }
    if (blood) this.blood(x, y, z, 0, 1, 0, 30);
  }

  update(dt, camera) {
    this.add.update(dt); this.alpha.update(dt);
    for (const l of this.lights) {
      const u = l.userData;
      if (u.t > 0) { u.t -= dt; l.intensity = Math.max(0, u.peak * (u.t / u.dur)); }
      else l.intensity = 0;
    }
    for (const t of this.tracers) {
      if (!t.visible) continue;
      t.userData.t -= dt;
      t.material.opacity = Math.max(0, t.userData.t / 0.06);
      if (t.userData.t <= 0) t.visible = false;
    }
    for (const g of this.gibPool) {
      if (!g.visible) continue;
      const u = g.userData;
      u.life -= dt;
      if (u.life <= 0) { g.visible = false; continue; }
      const ground = this.world ? this.world.groundHeight(g.position.x, g.position.z, 0.1, g.position.y + 0.05, 0.2) : 0;
      if (g.position.y > ground + 0.08 || u.v.y > 0) {
        u.v.y -= 22 * dt;
        g.position.addScaledVector(u.v, dt);
        g.rotation.x += u.av.x * dt; g.rotation.y += u.av.y * dt; g.rotation.z += u.av.z * dt;
        if (u.blood && Math.random() < 0.3) this.alpha.spawn(g.position.x, g.position.y, g.position.z, 0, 0, 0, 0.5, 0.12, 0.05, 0.5, 0, 0, 0.3, 0, 0, 0.8, 2, 0);
        if (g.position.y <= ground + 0.08) {
          g.position.y = ground + 0.08;
          if (u.v.y < -4) {
            if (u.blood && Math.random() < 0.5) this.decal(g.position.x, g.position.z, rand(0.4, 1.0), ground + 0.02);
            u.v.y *= -0.35; u.v.x *= 0.6; u.v.z *= 0.6; u.av.multiplyScalar(0.5);
          } else { u.v.set(0, 0, 0); }
        }
      }
      if (u.life < 1) g.position.y -= dt * 0.3;
    }
    // camera shake applied by the game after camera placement
    this.shake = Math.max(0, this.shake - dt * 1.8);
    void camera;
  }
}
