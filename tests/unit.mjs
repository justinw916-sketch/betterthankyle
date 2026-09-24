// Unit tests for collision / ray casting math (runs in plain Node).
import assert from 'node:assert/strict';
import { World, rayBox } from '../src/world.js';
import { raySphere, wrapAngle } from '../src/util.js';

let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log('  ✓', name); };

console.log('world.js');
const w = new World();
w.add({ minX: -1, minY: 0, minZ: -1, maxX: 1, maxY: 3, maxZ: 1 }); // pillar
w.add({ minX: 5, minY: 0, minZ: -2, maxX: 9, maxY: 0.5, maxZ: 2 }); // low step
w.add({ minX: 5, minY: 0, minZ: 4, maxX: 9, maxY: 2.0, maxZ: 8 }); // tall platform

test('collide pushes a cylinder out of a pillar', () => {
  const p = { x: 1.2, y: 0, z: 0 };
  assert.equal(w.collide(p, 0.5, 1.8), true);
  assert.ok(p.x >= 1.5 - 1e-6, `x=${p.x}`);
});

test('collide ignores steppable boxes', () => {
  const p = { x: 5.2, y: 0, z: 0 };
  assert.equal(w.collide(p, 0.4, 1.8, 0.65), false);
});

test('collide blocks tall platforms', () => {
  const p = { x: 4.8, y: 0, z: 6 };
  assert.equal(w.collide(p, 0.4, 1.8, 0.65), true);
  assert.ok(p.x <= 4.6 + 1e-6);
});

test('groundHeight finds step top', () => {
  assert.equal(w.groundHeight(7, 0, 0.4, 0, 0.65), 0.5);
  assert.equal(w.groundHeight(7, 6, 0.4, 0, 0.65), 0, 'tall platform not steppable from ground');
  assert.equal(w.groundHeight(7, 6, 0.4, 2.0, 0.65), 2.0, 'standing on it');
  assert.equal(w.groundHeight(20, 20, 0.4, 0), 0);
});

test('raycast hits pillar face with correct normal', () => {
  const h = w.raycast(-10, 1, 0, 1, 0, 0, 100);
  assert.ok(h); assert.ok(Math.abs(h.t - 9) < 1e-6); assert.equal(h.nx, -1);
});

test('raycast hits the ground plane', () => {
  const d = Math.SQRT1_2;
  const h = w.raycast(20, 5, 20, d, -d, 0, 100);
  assert.ok(h); assert.equal(h.ny, 1); assert.ok(Math.abs(h.t - 5 / d) < 1e-6);
});

test('raycast respects maxT and inactive boxes', () => {
  assert.equal(w.raycast(-10, 1, 0, 1, 0, 0, 5), null);
  const b = w.add({ minX: -6, minY: 0, minZ: -1, maxX: -5, maxY: 3, maxZ: 1 });
  assert.ok(Math.abs(w.raycast(-10, 1, 0, 1, 0, 0, 100).t - 4) < 1e-6);
  b.active = false;
  assert.ok(Math.abs(w.raycast(-10, 1, 0, 1, 0, 0, 100).t - 9) < 1e-6);
});

test('raycast across many grid cells (long diagonal)', () => {
  const w2 = new World();
  w2.add({ minX: 80, minY: 0, minZ: 80, maxX: 82, maxY: 10, maxZ: 82 });
  const l = Math.hypot(1, 1);
  const h = w2.raycast(0, 2, 0, 1 / l, 0, 1 / l, 200);
  assert.ok(h && h.t > 100 && h.t < 120, JSON.stringify(h));
});

test('lineOfSight', () => {
  assert.equal(w.lineOfSight(-5, 1, 0, 5, 1, 0), false);
  assert.equal(w.lineOfSight(-5, 1, 5, 5, 1, 5), true);
});

console.log('util.js');
test('raySphere', () => {
  assert.ok(Math.abs(raySphere(0, 0, 0, 1, 0, 0, 5, 0, 0, 1) - 4) < 1e-9);
  assert.equal(raySphere(0, 0, 0, 1, 0, 0, 5, 3, 0, 1), -1);
  assert.equal(raySphere(0, 0, 0, -1, 0, 0, 5, 0, 0, 1), -1);
});
test('rayBox from inside returns null', () => {
  assert.equal(rayBox(0, 1, 0, 1, 0, 0, { minX: -1, minY: 0, minZ: -1, maxX: 1, maxY: 3, maxZ: 1 }, 100), null);
});
test('wrapAngle', () => {
  assert.ok(Math.abs(wrapAngle(3 * Math.PI) - Math.PI) < 1e-9);
  assert.ok(Math.abs(wrapAngle(-3.5 * Math.PI) - 0.5 * Math.PI) < 1e-9);
});

console.log(`\n${passed} unit tests passed`);
