# SAM — Serious Arena Mayhem

A browser-based, old-school arena FPS built as a homage to the 2001 classic: huge Egyptian arenas, screaming headless
kamikazes, charging bulls, a ten-weapon arsenal and a 22-metre boss. Everything is procedural: textures, models,
sound effects and music are generated at load time, so there are no binary assets and it runs offline. Built on a
vendored Three.js.

**Full manual (controls, arsenal, bestiary, architecture, testing): open [`GUIDE.html`](GUIDE.html).**

## Play

```bash
npx http-server -c-1 -p 8080 .      # or: python -m http.server 8080
# Docker: docker build -t sam . && docker run --rm -p 8080:80 sam
```

Open http://localhost:8080, click **New Game**, then WASD + mouse, 1–0 for weapons, Space to jump and Esc to pause.

## Features

- 4 levels (day temple, dusk oasis, moonlit Karnak, blood-red Great Pyramid) with wave-based arena encounters,
  locking doors, checkpoints and an exit portal
- 10 weapons: knife, (dual) revolvers, pump and double shotguns, tommygun, minigun, rocket and grenade launchers,
  laser gun and a chargeable cannon
- 8 enemy types plus the Colossus boss, with individual AI (charging, leaping, flying/diving, burst-firing, homing
  rockets, summoning)
- Gibs, blood decals, bloom, ACES tone mapping, shadows, a sky-baked environment map, and pooled lights and particles
- WebAudio SFX (including the kamikaze scream) and a generative music score that reacts to combat
- 5 difficulties, options (sensitivity, FOV, quality presets, volume) and saved progress

## Test

```bash
npm install
npm test   # unit + headless smoke (15 scenarios) + a bot that plays all 4 levels to victory
```

Unofficial fan project; all art and audio is original and procedural.
