// End-to-end smoke test: serves the game, boots it in headless Chromium,
// plays through scripted scenarios via the window.__game debug handle and
// fails on any console/page error. Screenshots go to test-results/.
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'test-results');
fs.mkdirSync(outDir, { recursive: true });
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p === '/') p = '/index.html';
  const f = path.join(root, p);
  if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});
await new Promise((r) => server.listen(0, r));
const url = `http://localhost:${server.address().port}/`;

const exe = fs.existsSync('/opt/pw-browsers/chromium') ? undefined : undefined;
const browser = await chromium.launch({
  executablePath: exe,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.setDefaultTimeout(180000);
const errors = [];
page.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g|ERR_|Failed to load resource/.test(m.text())) errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message + '\n' + e.stack));

let failures = 0;
async function step(name, fn) {
  const t0 = Date.now();
  try { await fn(); console.log(`  ✓ ${name} (${Date.now() - t0}ms)`); }
  catch (e) { failures++; console.log(`  ✗ ${name}\n    ${e.message}`); }
  if (errors.length) { failures++; console.log('    console errors:\n    ' + errors.splice(0).join('\n    ')); }
}
const assert = (c, m) => { if (!c) throw new Error(m); };
const shot = (n) => page.screenshot({ path: path.join(outDir, n + '.png') });
const wait = (ms) => page.waitForTimeout(ms);
const G = (fn, arg) => page.evaluate(fn, arg);

console.log('smoke test @', url);
await step('boots to main menu', async () => {
  await page.goto(url);
  await page.waitForFunction(() => window.__game && window.__game.state === 'menu', null, { timeout: 90000 });
  await wait(800);
  await shot('01-menu');
});

await step('audio synthesises all effects', async () => {
  const n = await G(async () => { await window.__game.ensureAudio(); return Object.keys(window.__game.audio.buffers).length; });
  assert(n > 40, 'only ' + n + ' buffers');
});

await step('new game starts level 1', async () => {
  await G(() => { window.__game.newGame(0); window.__game.simulate(0.5); });
  await wait(500);
  const s = await G(() => ({ state: __game.state, hp: __game.player.health, w: __game.weapons.current, boxes: __game.world.boxes.length }));
  assert(s.state === 'playing', 'state ' + s.state);
  assert(s.w === 'revolver', 'weapon ' + s.w);
  assert(s.boxes > 50, 'boxes ' + s.boxes);
  await shot('02-level1-start');
});

await step('player movement + collision keeps player in bounds', async () => {
  await page.keyboard.down('KeyW');
  await G(() => __game.simulate(0.8));
  await page.keyboard.up('KeyW');
  const p = await G(() => ({ ...__game.player.pos }));
  assert(p.z < 9, 'did not move forward: z=' + p.z);
  // run into the side wall and check we don't pass through it
  await G(() => { __game.player.yaw = Math.PI / 2; });
  await page.keyboard.down('KeyW'); await G(() => __game.simulate(2)); await page.keyboard.up('KeyW');
  const p2 = await G(() => ({ ...__game.player.pos }));
  assert(p2.x > -8 + 0.3, 'passed through wall x=' + p2.x);
});

await step('every weapon fires without errors', async () => {
  await G(() => {
    const g = __game;
    for (const id of ['shotgun', 'dshotgun', 'tommy', 'minigun', 'rocket', 'grenade', 'laser', 'cannon']) g.weapons.give(id);
    g.player.god = true;
  });
  for (const id of ['knife', 'revolver', 'shotgun', 'dshotgun', 'tommy', 'minigun', 'rocket', 'grenade', 'laser', 'cannon']) {
    await G((id) => {
      const g = __game, W = g.weapons;
      W.current = id; W.pending = null; W.state = 'ready'; W.showModel();
      g.player.pitch = -0.1;
      for (let i = 0; i < 3; i++) { W.cool = 0; W.charge = 1; W.fire(W.def(), 1); }
    }, id);
    await G(() => __game.simulate(0.2));
  }
  await G(() => __game.simulate(1));
  const n = await G(() => __game.projectiles.list.length);
  assert(n >= 0, 'projectiles');
  await shot('03-weapons');
});

await step('enemies spawn, animate, take damage, die and gib', async () => {
  const types = ['kamikaze', 'gunner', 'gnasher', 'skeleton', 'bull', 'arachnid', 'harpy', 'biomech'];
  await G((types) => {
    const g = __game;
    g.player.place(0, -27, 0);
    types.forEach((t, i) => g.enemies.spawnSafe(t, -16 + i * 4.5, -42, 1));
  }, types);
  await G(() => __game.simulate(1.5));
  await shot('04-enemies');
  const alive = await G(() => __game.enemies.list.filter((e) => e.alive).map((e) => e.type));
  assert(alive.length >= 6, 'alive: ' + alive.join(','));
  await G(() => { for (const e of __game.enemies.list) if (e.alive) e.damage(e.hp + 1000, { x: 0, y: 0, z: -1 }, 'explosive'); });
  await G(() => __game.simulate(0.3));
  await shot('05-gibs');
  const left = await G(() => __game.enemies.alive);
  assert(left === 0, 'still alive ' + left);
});

await step('encounter triggers waves, locks and opens doors', async () => {
  await G(() => { __game.startLevel(0); __game.player.place(0, -12, 0); __game.player.god = true; __game.simulate(2.5); });
  const s = await G(() => ({ st: __game.encounters[0].state, door: __game.level.doors.a_in.state, n: __game.enemies.alive }));
  assert(s.st === 'active', 'encounter ' + s.st);
  assert(s.door === 'closing' || s.door === 'closed', 'door ' + s.door);
  assert(s.n > 0, 'no enemies spawned');
  await shot('06-encounter');
  // kill everything wave by wave
  for (let i = 0; i < 40; i++) {
    const st = await G(() => { for (const e of __game.enemies.list) if (e.alive) e.damage(9999, null, 'bullet'); return __game.encounters[0].state; });
    if (st === 'done') break;
    await G(() => __game.simulate(1));
  }
  const d = await G(() => ({ st: __game.encounters[0].state, out: __game.level.doors.a_out.state, cp: !!__game.checkpoint }));
  assert(d.st === 'done', 'encounter not done: ' + d.st);
  assert(d.out === 'opening' || d.out === 'open', 'exit door ' + d.out);
  assert(d.cp, 'no checkpoint');
});

await step('real combat: AI fights the player', async () => {
  await G(() => { const g = __game; g.startLevel(1); g.player.god = false; g.settings.difficulty = 0; g.player.place(0, -20, 0); g.player.armor = 0; g.player.health = 200; for (const t of ['gunner', 'kamikaze', 'bull', 'skeleton', 'gnasher']) g.debugSpawn(t, 16); });
  const s = await G(() => { __game.simulate(8); return { hp: __game.player.health, alive: __game.player.alive, en: __game.enemies.list.map((e) => e.type + ':' + e.alive).join(',') }; });
  console.log('    player after 8s of AI attacks:', JSON.stringify(s));
  assert(s.hp < 199 || !s.alive, 'enemies did no damage');
  await shot('07-combat');
});

await step('death -> respawn at checkpoint flow', async () => {
  await G(() => { __game.player.god = false; __game.player.damage(9999, null); });
  const st = await G(() => __game.simulate(3));
  assert(st === 'dead', 'state ' + st);
  await G(() => { __game.respawn(); __game.simulate(0.3); });
  const s = await G(() => ({ st: __game.state, hp: __game.player.health }));
  assert(s.st === 'playing' && s.hp > 0, JSON.stringify(s));
});

for (let i = 0; i < 4; i++) {
  await step(`level ${i + 1} builds and renders`, async () => {
    await G((i) => { __game.startLevel(i); __game.player.god = true; __game.simulate(0.5); }, i);
    await wait(300);
    await shot(`1${i}-level${i + 1}`);
    // view from the middle of the first arena
    await G(() => { const g = __game; const e = g.encounters[0]; const [x0, z0, x1, z1] = e.area; g.player.place((x0 + x1) / 2, z1 + 1, 0); g.player.pitch = 0.05; g.simulate(0.2); });
    await wait(300);
    if (i === 0) console.log('    draw calls:', await G(() => __game.renderer.info.render.calls), 'triangles:', await G(() => __game.renderer.info.render.triangles));
    await shot(`1${i}-level${i + 1}-arena`);
  }, i);
}

await step('boss fight: spawns, attacks, dies, victory', async () => {
  await G(() => { const g = __game; g.startLevel(3); g.player.god = true; for (const e of g.encounters) if (e.id !== 'BOSS') { e.state = 'done'; for (const d of e.open) g.openDoor(d, true); } g.player.place(0, -75, 0); g.simulate(3); });
  const b = await G(() => ({ boss: !!__game.boss, st: __game.boss?.state, hp: __game.boss?.hp }));
  assert(b.boss, 'boss did not spawn');
  await shot('20-boss');
  await G(() => __game.simulate(8));
  await shot('21-boss-attack');
  await G(() => { __game.boss.damage(1e6, null, 'explosive'); __game.simulate(2); });
  await shot('21b-boss-dying');
  const st = await G(() => __game.simulate(8));
  assert(st === 'victory', 'state ' + st);
  await shot('22-victory');
});

await step('level exit portal completes level 1', async () => {
  await G(() => { const g = __game; g.newGame(0); for (const e of g.encounters) { e.state = 'done'; for (const d of e.open) g.openDoor(d, true); } g.player.place(g.exit.x, g.exit.z + 3, 0); g.simulate(0.2); });
  await page.keyboard.down('KeyW'); await G(() => __game.simulate(1)); await page.keyboard.up('KeyW');
  const st = await G(() => ({ st: __game.state, un: __game.progress.unlocked }));
  assert(st.st === 'complete', 'state ' + st.st);
  assert(st.un >= 2, 'unlock ' + st.un);
  await shot('23-complete');
});

const perf = await G(async () => {
  const g = __game; g.startLevel(2); g.player.god = true;
  await new Promise((r) => setTimeout(r, 500));
  let frames = 0; const t0 = performance.now();
  await new Promise((r) => { const f = () => { frames++; if (performance.now() - t0 < 3000) requestAnimationFrame(f); else r(); }; requestAnimationFrame(f); });
  return (frames / 3).toFixed(1);
});
console.log(`  (software-rendered fps in CI: ${perf})`);

await browser.close();
server.close();
if (failures) { console.log(`\n${failures} smoke failure(s)`); process.exit(1); }
console.log('\nall smoke tests passed');
