// Full playthrough: a bot plays every level through the real game systems
// (aiming, hitscan, projectiles, encounter waves, doors, exit portal, boss).
// Proves every level can be completed and nothing soft-locks.
import { launch } from './harness.mjs';

const { page, errors, shot, close } = await launch();
let failures = 0;

// Installed in the page: one bot decision per simulation tick.
await page.evaluate(() => {
  window.botTick = (g, t) => {
    const p = g.player, W = g.weapons;
    for (const k of Object.keys(W.ammo)) W.ammo[k] = 999;
    let best = null, bd = 1e9;
    for (const e of g.enemies.list) {
      if (!e.alive || e.spawnT > 0) continue;
      const d = Math.hypot(e.pos.x - p.pos.x, e.pos.z - p.pos.z);
      if (d < bd) { bd = d; best = e; }
    }
    if (!best) return;
    // periodically relocate near the target inside its arena (simulates the player hunting it down)
    const los = g.world.lineOfSight(p.pos.x, p.eyeY, p.pos.z, best.pos.x, best.pos.y + best.def.h * 0.5, best.pos.z);
    // "seeing" isn't enough: only count it if the target is actually losing health
    if (best !== window.lastTarget || best.hp < (window.lastHp ?? Infinity)) window.lastProgress = t;
    window.lastTarget = best; window.lastHp = best.hp;
    if (los && t - (window.lastProgress || 0) < 5) window.lastSeen = t;
    if (t - (window.lastHunt || 0) > 4 && (bd > 25 || t - (window.lastSeen || 0) > 3)) {
      window.lastHunt = t;
      const a = Math.random() * Math.PI * 2;
      let x = best.pos.x + Math.cos(a) * 10, z = best.pos.z + Math.sin(a) * 10;
      if (best.bounds) { const b = best.bounds; x = Math.max(b[0] + 1, Math.min(b[2] - 1, x)); z = Math.max(b[1] + 1, Math.min(b[3] - 1, z)); }
      p.pos.x = x; p.pos.z = z;
    }
    const tx = best.pos.x, ty = best.pos.y + best.def.h * 0.55 * (best.def.scale || 1), tz = best.pos.z;
    const dx = tx - p.pos.x, dy = ty - p.eyeY, dz = tz - p.pos.z;
    p.yaw = Math.atan2(-dx, -dz);
    p.pitch = Math.atan2(dy, Math.hypot(dx, dz));
    g.placeCamera(0);
    const id = best.def.hp >= 400 ? 'rocket' : bd < 9 ? 'dshotgun' : 'minigun';
    if (W.current !== id) { W.current = id; W.pending = null; W.state = 'ready'; W.showModel(); }
    W.spin = 1;
    if (W.cool <= 0) W.fire(W.def(), 1);
  };
  window.playFor = (seconds, stopWhen) => {
    const g = window.__game;
    const dt = 1 / 30;
    for (let t = 0; t < seconds; t += dt) {
      window.botTick(g, (window.simT = (window.simT || 0) + dt));
      g.step(dt);
      if (stopWhen && stopWhen(g)) return t;
    }
    return -1;
  };
});

const levelCount = await page.evaluate(() => window.__game.levelCount);
const only = process.env.LEVEL ? Number(process.env.LEVEL) - 1 : -1;
for (let li = 0; li < levelCount; li++) {
  if (only >= 0 && li !== only) continue;
  const t0 = Date.now();
  try {
    const res = await page.evaluate(async (li) => {
      const g = window.__game;
      g.settings.difficulty = 2;
      g.newGame(li);
      g.player.god = true;
      for (const id of ['shotgun', 'dshotgun', 'tommy', 'minigun', 'rocket', 'grenade', 'laser', 'cannon']) g.weapons.owned.add(id);
      const log = [];
      for (const enc of g.encounters) {
        // walk in through the entrance
        const [x0, z0, x1, z1] = enc.area;
        g.player.place((x0 + x1) / 2, z1 - 2, 0);
        window.playFor(0.5);
        if (enc.state !== 'active') return { ok: false, why: `encounter ${enc.id} did not trigger (${enc.state})` };
        const took = window.playFor(600, () => enc.state === 'done');
        if (took < 0) {
          const alive = g.enemies.list.filter((e) => e.alive).map((e) => `${e.type}@${e.pos.x.toFixed(1)},${e.pos.y.toFixed(1)},${e.pos.z.toFixed(1)}`);
          const pp = g.player.pos;
          return { ok: false, why: `encounter ${enc.id} stuck at wave ${enc.wave}/${enc.waves.length}; player ${pp.x.toFixed(1)},${pp.y.toFixed(1)},${pp.z.toFixed(1)}; alive: ${alive.join(' ')}; queue ${g.spawnQueue.length}` };
        }
        log.push(`${enc.id}:${took.toFixed(0)}s`);
        for (const d of enc.open || []) if (g.level.doors[d].state === 'closed') return { ok: false, why: `door ${d} stayed closed` };
      }
      if (g.exit) {
        // walk (really move) from the last arena into the exit portal
        g.player.place(g.exit.x, g.exit.z + 4, 0);
        g.input.keys.add('KeyW');
        const t = window.playFor(5, () => g.state !== 'playing');
        g.input.keys.delete('KeyW');
        if (t < 0) return { ok: false, why: 'exit portal not reached: ' + g.state };
        return { ok: g.state === 'complete', why: 'state ' + g.state, log, kills: `${g.stats.kills}/${g.stats.total}`, score: g.stats.score };
      }
      const t = window.playFor(20, () => g.state === 'victory');
      return { ok: t >= 0, why: 'state ' + g.state, log, kills: `${g.stats.kills}/${g.stats.total}`, score: g.stats.score };
    }, li);
    if (!res.ok) throw new Error(res.why);
    console.log(`  ✓ level ${li + 1} completed by bot: ${res.log.join(' ')} kills ${res.kills} score ${res.score} (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
    await shot(`play-level${li + 1}-end`).catch(() => {});
  } catch (e) {
    failures++;
    console.log(`  ✗ level ${li + 1}: ${e.message}`);
    await shot(`play-level${li + 1}-fail`).catch(() => {});
  }
  if (errors.length) { failures++; console.log('    errors:\n    ' + errors.splice(0).join('\n    ')); }
}

await close();
if (failures) { console.log(`\n${failures} playthrough failure(s)`); process.exit(1); }
console.log('\nfull playthrough passed');
