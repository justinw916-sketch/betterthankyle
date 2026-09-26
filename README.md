# SAM — Serious Arena Mayhem

A browser-based, old-school arena FPS built as a homage to the 2001 classic: huge Egyptian arenas, screaming headless
kamikazes, charging bulls, a ten-weapon arsenal and a 22-metre boss. Everything is procedural: textures, models,
sound effects and music are generated at load time, so there are no binary assets and it runs offline. Built on a
vendored Three.js.

**▶ Play online: https://sam.jwhitton.com** (auto-deployed from this repo via Cloudflare Pages: build `node build.mjs`, output `dist`).

**Full manual (controls, arsenal, bestiary, architecture, testing): open [`GUIDE.html`](GUIDE.html).**

## Play

```bash
npx http-server -c-1 -p 8080 .      # or: python -m http.server 8080
# Docker: docker build -t sam . && docker run --rm -p 8080:80 sam
```

Open http://localhost:8080, click **New Game**, then WASD + mouse, 1–0 for weapons, Space to jump and Esc to pause.

## Features

- 9 levels: day temple, dusk oasis, moonlit Karnak, the blood-red Great Pyramid (boss), a **sandstorm survival siege**,
  the **lava-filled underworld** with jump pads, the **Tomb of Thoth** (key-sealed doors, spike traps), the **Gauntlet of Anubis**
  (spike-strip hall + lava island), and **floating sky islands** over a cloud sea (falls are fatal) with a final boss
- Objective tracker with a goal compass, per-level personal bests, auto-pause on tab switch, level fade-ins
- **Endless Arena** mode with escalating waves, a Colossus every 10th wave, and a saved best run
- **Kill combos** (score multiplier up to x5) and **gamepad support** (Xbox/PlayStation standard mapping)
- Wave-based arena encounters, timed survival holds, locking doors, checkpoints, secrets and exit portals
- 10 weapons: knife, (dual) revolvers, pump and double shotguns, tommygun, minigun, rocket and grenade launchers,
  laser gun and a chargeable cannon
- Power-ups: Serious Damage, Serious Protection, Serious Speed and the screen-clearing Serious Bomb (B)
- 9 enemy types (incl. the splitting Lava Golem) plus two bosses (the Colossus and Ra, the Sun Colossus), with individual AI (charging, leaping, flying/diving, burst-firing, homing
  rockets, summoning)
- Gibs, blood decals, bloom, ACES tone mapping, shadows, a sky-baked environment map, and pooled lights and particles
- WebAudio SFX (including the kamikaze scream) and a generative music score that reacts to combat
- 5 difficulties, options (sensitivity, FOV, quality presets, volume), saved progress and Continue
- Hardened runtime: frame-error recovery, WebGL context-loss handling, horde cap, NaN guards, and free-mouse fallback when pointer lock is blocked

## Test

```bash
npm install
npm test   # unit + headless smoke + a bot that plays all 9 levels to victory
LEVEL=5 node tests/playthrough.mjs   # bot-play a single level
```

Unofficial fan project; all art and audio is original and procedural.
