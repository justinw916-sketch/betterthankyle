// Level definitions. Each level is built procedurally through LevelBuilder.
// Layout convention: the player progresses toward -Z through a chain of arenas.
// Encounters trigger when the player enters their area, lock doors, spawn
// waves (next wave when `when` or fewer enemies remain) and open doors on clear.
import * as THREE from 'three';

export const THEMES = {
  day: {
    skyTop: 0x2a66c8, skyHorizon: 0xcfe2f0, skyBottom: 0xe8d2a8, sunColor: 0xfff1d6, sunIntensity: 3.2,
    sunDir: [0.45, 0.72, 0.35], hemi: [0xbfd8ff, 0xc8a878, 1.25], fog: [0xd8e4ec, 90, 520], exposure: 1.0, clouds: 0.6,
  },
  dusk: {
    skyTop: 0x3a4a9a, skyHorizon: 0xffb070, skyBottom: 0xd89060, sunColor: 0xffc890, sunIntensity: 3.0,
    sunDir: [-0.6, 0.35, -0.5], hemi: [0xffc8a0, 0xa07050, 1.05], fog: [0xe8a878, 80, 480], exposure: 1.05, clouds: 0.8,
  },
  night: {
    skyTop: 0x040818, skyHorizon: 0x1a2a50, skyBottom: 0x101828, sunColor: 0x9ab8ff, sunIntensity: 1.1,
    sunDir: [0.3, 0.6, -0.5], hemi: [0x40508a, 0x201810, 0.55], fog: [0x141e38, 50, 360], exposure: 1.25, clouds: 0.3, stars: true, moon: true,
  },
  storm: {
    skyTop: 0x8a5a30, skyHorizon: 0xd8a060, skyBottom: 0xb07a48, sunColor: 0xffd8a0, sunIntensity: 2.1,
    sunDir: [0.5, 0.55, -0.3], hemi: [0xffd0a0, 0x906040, 1.15], fog: [0xc89660, 28, 190], exposure: 1.1, clouds: 1.0, storm: true,
  },
  inferno: {
    skyTop: 0x120404, skyHorizon: 0x5a1408, skyBottom: 0x200606, sunColor: 0xff7040, sunIntensity: 1.1,
    sunDir: [0.3, 0.6, -0.4], hemi: [0x803020, 0x200808, 0.6], fog: [0x3a0c06, 45, 280], exposure: 1.3, clouds: 0.5, embers: true,
  },
  sky: {
    skyTop: 0x2a70e0, skyHorizon: 0xe8f2ff, skyBottom: 0xf4f8ff, sunColor: 0xfff4e0, sunIntensity: 3.2,
    sunDir: [0.3, 0.75, -0.45], hemi: [0xcfe4ff, 0xe0d8c8, 1.3], fog: [0xe4eefa, 140, 800], exposure: 1.0, clouds: 0.7, void: true,
  },
  boss: {
    skyTop: 0x4a1020, skyHorizon: 0xff6a30, skyBottom: 0x802010, sunColor: 0xffa070, sunIntensity: 2.8,
    sunDir: [0.2, 0.4, -0.8], hemi: [0xff9070, 0x603020, 0.95], fog: [0xc05a3a, 70, 460], exposure: 1.05, clouds: 1.0,
  },
};

// Helper to build a waves list compactly: S(type, count, x, z, spread)
const S = (type, n, x, z, spread = 6) => [type, n, x, z, spread];

export const LEVELS = [
  // ------------------------------------------------------------------ LEVEL 1
  {
    id: 'temple', name: 'Temple of the Sun', subtitle: 'Hatshepsut Courtyard', theme: 'day', music: 0, seed: 11,
    build(b) {
      const M = b.M;
      b.spawn = { x: 0, z: 10, yaw: 0 };
      // Start hall
      b.arena(-8, -2, 8, 14, { h: 8, wall: M.sandstone, gaps: { n: [[0, 6]] } });
      b.statue(-5.5, 11, Math.PI / 2, 5); b.statue(5.5, 11, -Math.PI / 2, 5);
      b.brazier(-6, 2); b.brazier(6, 2);
      b.pickup('health', 'medium', -5, 6); b.pickup('armor', 'small', 5, 6);
      b.pickup('health', 'small', 0, 2);

      // Arena A: sunlit courtyard
      b.arena(-24, -50, 24, -5, { gaps: { s: [[0, 6]], n: [[0, 6]] } });
      b.door('a_in', 0, -4.25, 6, 'x', 7, true);
      b.door('a_out', 0, -50.75, 6, 'x', 7, false);
      for (const z of [-14, -24, -34, -44]) { b.pillar(-14, z, 7); b.pillar(14, z, 7); }
      b.platform(0, -27, 8, 8, 1.6, M.sandstone, 'ns');
      b.obelisk(-20, -9, 10); b.obelisk(20, -9, 10);
      b.brazier(-21, -47); b.brazier(21, -47);
      b.pickup('weapon', 'shotgun', 0, -27, 1.6);
      b.pickup('ammo', 'shells', -18, -12); b.pickup('ammo', 'shells', 18, -12);
      b.pickup('health', 'medium', -20, -40); b.pickup('health', 'medium', 20, -40);
      b.pickup('armor', 'medium', 0, -46);
      b.encounter({
        id: 'A', area: [-22, -48, 22, -9], lock: ['a_in'], open: ['a_in', 'a_out'],
        message: 'The courtyard is clear. Onward!', checkpoint: { x: 0, z: -30, yaw: 0 },
        waves: [
          { spawn: [S('gunner', 3, 0, -45, 10), S('gnasher', 2, -15, -40), S('gnasher', 2, 15, -40)] },
          { when: 2, spawn: [S('kamikaze', 8, 0, -46, 12)], msg: 'Here they come!' },
          { when: 2, spawn: [S('gnasher', 3, -18, -30), S('gnasher', 3, 18, -30), S('gunner', 4, 0, -45, 14)], items: [['ammo', 'shells', 0, -20]] },
          { when: 1, spawn: [S('kamikaze', 6, -15, -46), S('kamikaze', 6, 15, -46), S('harpy', 2, 0, -30)], items: [['health', 'large', 0, -15]] },
        ],
      });

      // Corridor
      b.corridorZ(0, -72, -51.5, 6, 8);
      b.pickup('weapon', 'tommy', 0, -58);
      b.pickup('ammo', 'bullets', -1.5, -64); b.pickup('ammo', 'bullets', 1.5, -64);
      b.pickup('health', 'small', 0, -68);

      // Arena C: temple plaza
      b.arena(-32, -130, 32, -73.5, { h: 10, gaps: { s: [[0, 6]], n: [[0, 6]] } });
      b.door('c_in', 0, -72.75, 6, 'x', 7, true);
      b.door('c_out', 0, -130.75, 6, 'x', 7, false);
      for (const [x, z] of [[-10, -92], [10, -92], [-10, -112], [10, -112]]) b.pillar(x, z, 9, 1.2);
      b.platform(-24, -101, 8, 30, 2.4, M.sandstone, 'e');
      b.platform(24, -101, 8, 30, 2.4, M.sandstone, 'w');
      b.sphinx(-16, -80, Math.PI / 2); b.sphinx(16, -80, -Math.PI / 2);
      b.obelisk(0, -102, 13);
      b.brazier(-28, -126); b.brazier(28, -126); b.brazier(-28, -77); b.brazier(28, -77);
      b.pickup('armor', 'large', -24, -101, 2.4);
      b.pickup('ammo', 'bullets', 24, -95, 2.4); b.pickup('ammo', 'shells', 24, -107, 2.4);
      b.pickup('health', 'medium', -4, -84); b.pickup('health', 'medium', 4, -84);
      b.secret(30, -128, ['health', 'super']); // tucked in a corner behind the platform
      b.encounter({
        id: 'C', area: [-30, -128, 30, -78], lock: ['c_in'], open: ['c_in', 'c_out'],
        message: 'Temple plaza secured.', checkpoint: { x: 0, z: -95, yaw: 0 },
        waves: [
          { spawn: [S('gnasher', 8, 0, -124, 18), S('gunner', 3, -24, -104, 5), S('gunner', 3, 24, -104, 5)] },
          { when: 3, spawn: [S('kamikaze', 10, -26, -126, 5), S('kamikaze', 10, 26, -126, 5)], msg: 'AAAAAAAAH!' },
          { when: 2, spawn: [S('harpy', 4, 0, -100, 12), S('skeleton', 2, 0, -124, 8), S('gunner', 4, 0, -124, 16)], items: [['weapon', 'dshotgun', 0, -88], ['ammo', 'shells', -3, -88]] },
          { when: 2, spawn: [S('bull', 1, 0, -124, 2), S('kamikaze', 10, 0, -126, 16), S('gnasher', 6, 0, -115, 20)], items: [['health', 'large', 0, -80]] },
        ],
      });

      // Exit chamber
      b.arena(-8, -146, 8, -133, { h: 8, wall: M.sandstone, gaps: { s: [[0, 6]] } });
      b.brazier(-6, -144); b.brazier(6, -144);
      b.exit = { x: 0, z: -141, requires: 'C' };
    },
  },
  // ------------------------------------------------------------------ LEVEL 2
  {
    id: 'oasis', name: 'Oasis of Scorpions', subtitle: 'The Sand Canyon', theme: 'dusk', music: 1, seed: 22,
    loadout: { owned: ['knife', 'revolver', 'shotgun', 'dshotgun', 'tommy'], ammo: { shells: 40, bullets: 150 }, armor: 50 },
    build(b) {
      const M = b.M;
      b.spawn = { x: 0, z: 10, yaw: 0 };
      b.arena(-10, -3, 10, 14, { h: 8, wall: M.sandstone, floor: M.sand, gaps: { n: [[0, 6]] } });
      b.pickup('ammo', 'shells', -6, 6); b.pickup('ammo', 'bullets', 6, 6); b.pickup('health', 'medium', 0, 2);
      b.palm(-7, 11, 6, true); b.palm(7, 11, 6, true);

      // Arena A: the oasis
      b.arena(-40, -70, 40, -6, { h: 9, wall: M.sandstone, floor: M.sand, gaps: { s: [[0, 6]], n: [[0, 6]] } });
      b.door('a_in', 0, -5.25, 6, 'x', 7, true);
      b.door('a_out', 0, -70.75, 6, 'x', 7, false);
      b.water = [{ x: 0, z: -38, r: 10 }];
      for (let i = 0; i < 9; i++) { const a = (i / 9) * Math.PI * 2; b.palm(Math.cos(a) * 13.5, -38 + Math.sin(a) * 13.5); }
      for (const [x, z] of [[-30, -20], [30, -20], [-32, -55], [26, -45], [-20, -64]]) b.pillar(x, z, 6, 1, true);
      b.platform(30, -60, 10, 10, 2, M.sandstone, 'w');
      b.pickup('weapon', 'rocket', 30, -60, 2);
      b.pickup('ammo', 'rockets', -30, -30); b.pickup('ammo', 'rockets', 30, -30);
      b.pickup('armor', 'medium', -36, -66); b.pickup('health', 'large', 0, -24);
      b.encounter({
        id: 'A', area: [-38, -68, 38, -10], lock: ['a_in'], open: ['a_in', 'a_out'],
        message: 'The oasis is quiet again.', checkpoint: { x: 0, z: -20, yaw: 0 },
        waves: [
          { spawn: [S('gnasher', 6, -30, -60, 6), S('skeleton', 2, 30, -64, 4), S('gunner', 4, 0, -65, 20)] },
          { when: 2, spawn: [S('bull', 3, 0, -64, 20)], msg: 'Stampede!' },
          { when: 2, spawn: [S('kamikaze', 8, -35, -65, 4), S('kamikaze', 8, 0, -67, 6), S('kamikaze', 8, 35, -65, 4)], items: [['ammo', 'rockets', 0, -15], ['health', 'medium', -10, -15]] },
          { when: 2, spawn: [S('skeleton', 4, 0, -64, 20), S('harpy', 4, 0, -40, 15), S('bull', 2, 0, -64, 15)], items: [['armor', 'medium', 10, -15]] },
        ],
      });

      b.corridorZ(0, -95.5, -71.5, 6, 8);
      b.pickup('weapon', 'minigun', 0, -80);
      b.pickup('ammo', 'bullets', -1.5, -88); b.pickup('ammo', 'bullets', 1.5, -88);

      // Arena B: fortress of dunes
      b.arena(-45, -165, 45, -97, { h: 10, wall: M.hieroglyph, gaps: { s: [[0, 6]], n: [[0, 6]] } });
      b.door('b_in', 0, -96.25, 6, 'x', 7, true);
      b.door('b_out', 0, -165.75, 6, 'x', 7, false);
      b.platform(0, -131, 14, 14, 3, M.sandstone, 'nsew');
      for (const [x, z] of [[-22, -112], [22, -112], [-22, -150], [22, -150], [-36, -131], [36, -131]]) b.pillar(x, z, 9, 1.1);
      b.sphinx(-12, -104, Math.PI / 2); b.sphinx(12, -104, -Math.PI / 2);
      for (const [x, z] of [[-42, -100], [42, -100], [-42, -162], [42, -162]]) b.brazier(x, z);
      b.palm(-40, -118); b.palm(40, -118); b.palm(-40, -145); b.palm(40, -145);
      b.pickup('armor', 'large', 0, -131, 3);
      b.pickup('ammo', 'rockets', -30, -105); b.pickup('ammo', 'bullets', 30, -105);
      b.pickup('ammo', 'shells', -30, -158); b.pickup('ammo', 'rockets', 30, -158);
      b.pickup('health', 'large', -40, -131); b.pickup('health', 'large', 40, -131);
      b.pickup('powerup', 'damage', 0, -160);
      b.secret(-43, -163, ['powerup', 'bomb']);
      b.encounter({
        id: 'B', area: [-43, -163, 43, -101], lock: ['b_in'], open: ['b_in', 'b_out'],
        message: 'Fortress taken!', checkpoint: { x: 0, z: -110, yaw: 0 },
        waves: [
          { spawn: [S('arachnid', 1, 0, -158, 2), S('gunner', 6, 0, -160, 30), S('gnasher', 6, 0, -145, 20)] },
          { when: 3, spawn: [S('bull', 6, 0, -160, 30)], msg: 'Stampede!' },
          { when: 2, spawn: [S('kamikaze', 10, -40, -160, 4), S('kamikaze', 10, 40, -160, 4), S('kamikaze', 10, 0, -162, 10), S('skeleton', 4, 0, -150, 25)], items: [['ammo', 'rockets', 0, -108], ['ammo', 'bullets', 5, -108]] },
          { when: 2, spawn: [S('arachnid', 2, 0, -158, 25), S('harpy', 6, 0, -130, 20), S('gunner', 6, 0, -160, 30)], items: [['health', 'large', 0, -108], ['armor', 'medium', -5, -108]] },
        ],
      });

      b.arena(-8, -181, 8, -168, { h: 8, wall: M.sandstone, gaps: { s: [[0, 6]] } });
      b.exit = { x: 0, z: -176, requires: 'B' };
    },
  },
  // ------------------------------------------------------------------ LEVEL 3
  {
    id: 'moon', name: 'Valley of the Moon', subtitle: 'Karnak by Night', theme: 'night', music: 2, seed: 33,
    loadout: { owned: ['knife', 'revolver', 'shotgun', 'dshotgun', 'tommy', 'minigun', 'rocket'], ammo: { shells: 50, bullets: 250, rockets: 15 }, armor: 75 },
    build(b) {
      const M = b.M;
      const W = M.basaltGlyph, F = M.tilesDark;
      b.spawn = { x: 0, z: 10, yaw: 0 };
      b.arena(-8, -3, 8, 14, { h: 8, wall: M.basalt, floor: F, gaps: { n: [[0, 6]] } });
      b.brazier(-6, 11); b.brazier(6, 11, 0, false);
      b.pickup('ammo', 'rockets', -5, 5); b.pickup('ammo', 'shells', 5, 5); b.pickup('armor', 'medium', 0, 2);

      b.arena(-30, -60, 30, -6, { h: 10, wall: W, floor: F, gaps: { s: [[0, 6]], n: [[0, 6]] } });
      b.door('a_in', 0, -5.25, 6, 'x', 7, true);
      b.door('a_out', 0, -60.75, 6, 'x', 7, false);
      for (const x of [-18, -9, 9, 18]) for (const z of [-20, -33, -46]) b.pillar(x, z, 9, 1.0);
      b.brazier(-26, -10); b.brazier(26, -10); b.brazier(-26, -56); b.brazier(26, -56);
      b.brazier(0, -33);
      b.pickup('weapon', 'grenade', 0, -20);
      b.pickup('ammo', 'grenades', -26, -33); b.pickup('ammo', 'grenades', 26, -33);
      b.pickup('health', 'medium', -26, -45); b.pickup('health', 'medium', 26, -45);
      b.encounter({
        id: 'A', area: [-28, -58, 28, -10], lock: ['a_in'], open: ['a_in', 'a_out'],
        message: 'The hall falls silent.', checkpoint: { x: 0, z: -30, yaw: 0 },
        waves: [
          { spawn: [S('skeleton', 4, 0, -55, 20), S('gnasher', 8, 0, -45, 20)] },
          { when: 3, spawn: [S('harpy', 6, 0, -35, 15), S('gunner', 8, 0, -55, 22)] },
          { when: 2, spawn: [S('kamikaze', 8, -25, -56, 4), S('kamikaze', 8, 25, -56, 4)], items: [['ammo', 'grenades', 0, -14]] },
          { when: 2, spawn: [S('biomech', 1, 0, -54, 2), S('gnasher', 6, 0, -50, 20)], msg: 'A biomechanoid!', items: [['health', 'large', 0, -14]] },
        ],
      });

      b.corridorZ(0, -92, -61.5, 6, 8, M.basalt, F);
      b.pickup('weapon', 'laser', 0, -72);
      b.pickup('ammo', 'cells', -1.5, -80); b.pickup('ammo', 'cells', 1.5, -80);
      b.brazier(-2.2, -86, 0, false); b.brazier(2.2, -86, 0, false);

      b.arena(-50, -172, 50, -93.5, { h: 12, wall: W, floor: F, gaps: { s: [[0, 6]], n: [[0, 6]] } });
      b.door('b_in', 0, -92.75, 6, 'x', 7, true);
      b.door('b_out', 0, -172.75, 6, 'x', 7, false);
      for (let z = -105; z >= -160; z -= 18) { b.statue(-44, z, Math.PI / 2, 8); b.statue(44, z, -Math.PI / 2, 8); }
      b.platform(-25, -133, 12, 20, 2.5, M.basalt, 'e', F);
      b.platform(25, -133, 12, 20, 2.5, M.basalt, 'w', F);
      b.obelisk(0, -120, 14); b.obelisk(0, -150, 14);
      b.brazier(-20, -100); b.brazier(20, -100); b.brazier(-20, -166); b.brazier(20, -166);
      b.pickup('armor', 'large', -25, -133, 2.5); b.pickup('health', 'large', 25, -133, 2.5);
      b.pickup('ammo', 'cells', -10, -100); b.pickup('ammo', 'rockets', 10, -100);
      b.pickup('ammo', 'grenades', -45, -168); b.pickup('ammo', 'bullets', 45, -168);
      b.pickup('powerup', 'damage', 0, -135);
      b.secret(47, -170, ['powerup', 'protect']);
      b.encounter({
        id: 'B', area: [-48, -170, 48, -98], lock: ['b_in'], open: ['b_in', 'b_out'],
        message: 'The valley is yours.', checkpoint: { x: 0, z: -105, yaw: 0 },
        waves: [
          { spawn: [S('biomech', 2, 0, -165, 30), S('arachnid', 1, 0, -160, 5), S('gunner', 6, 0, -150, 30)] },
          { when: 3, spawn: [S('harpy', 10, 0, -130, 30)], msg: 'Harpies!' },
          { when: 3, spawn: [S('kamikaze', 14, -45, -168, 4), S('kamikaze', 14, 45, -168, 4), S('kamikaze', 12, 0, -170, 10)], items: [['ammo', 'cells', 0, -100], ['ammo', 'rockets', 4, -100]] },
          { when: 3, spawn: [S('skeleton', 8, 0, -160, 35), S('bull', 4, 0, -165, 30)], items: [['health', 'large', -6, -100]] },
          { when: 2, spawn: [S('arachnid', 2, 0, -160, 30), S('biomech', 1, 0, -166, 4), S('gnasher', 10, 0, -150, 35)], items: [['armor', 'medium', 6, -100]] },
        ],
      });

      b.arena(-8, -188, 8, -175, { h: 8, wall: M.basalt, floor: F, gaps: { s: [[0, 6]] } });
      b.brazier(-6, -186); b.brazier(6, -186, 0, false);
      b.exit = { x: 0, z: -183, requires: 'B' };
    },
  },
  // ------------------------------------------------------------------ LEVEL 4
  {
    id: 'pyramid', name: 'The Great Pyramid', subtitle: 'Wrath of the Colossus', theme: 'boss', music: 3, seed: 44,
    loadout: { owned: ['knife', 'revolver', 'shotgun', 'dshotgun', 'tommy', 'minigun', 'rocket', 'grenade', 'laser'], ammo: { shells: 60, bullets: 300, rockets: 20, grenades: 10, cells: 150 }, armor: 100 },
    build(b) {
      const M = b.M;
      b.spawn = { x: 0, z: 10, yaw: 0 };
      b.arena(-10, -3, 10, 14, { h: 8, wall: M.sandstone, gaps: { n: [[0, 6]] } });
      b.pickup('weapon', 'cannon', 0, 4);
      b.pickup('ammo', 'cannonballs', -4, 6); b.pickup('ammo', 'rockets', 4, 6);
      b.pickup('ammo', 'cells', -7, 10); b.pickup('ammo', 'bullets', 7, 10);
      b.pickup('armor', 'large', 0, 12);

      b.arena(-30, -55, 30, -6, { h: 10, gaps: { s: [[0, 6]], n: [[0, 6]] } });
      b.door('a_in', 0, -5.25, 6, 'x', 7, true);
      b.door('a_out', 0, -55.75, 6, 'x', 7, false);
      for (const [x, z] of [[-15, -20], [15, -20], [-15, -40], [15, -40]]) b.pillar(x, z, 9, 1.2);
      b.obelisk(0, -30, 12);
      b.pickup('ammo', 'shells', -25, -30); b.pickup('ammo', 'grenades', 25, -30);
      b.pickup('health', 'large', 0, -50);
      b.encounter({
        id: 'A', area: [-28, -53, 28, -10], lock: ['a_in'], open: ['a_in', 'a_out'],
        message: 'The Colossus awaits beyond...', checkpoint: { x: 0, z: -45, yaw: 0 },
        waves: [
          { spawn: [S('gnasher', 10, 0, -50, 22), S('gunner', 6, 0, -50, 22)] },
          { when: 3, spawn: [S('bull', 4, 0, -50, 20), S('skeleton', 4, 0, -50, 20)] },
          { when: 3, spawn: [S('kamikaze', 12, -26, -52, 4), S('kamikaze', 12, 26, -52, 4), S('harpy', 6, 0, -30, 20)] },
          { when: 2, spawn: [S('biomech', 2, 0, -50, 20), S('arachnid', 1, 0, -50, 4)], items: [['health', 'large', 0, -12], ['ammo', 'cannonballs', 3, -12]] },
        ],
      });

      // Boss arena
      b.arena(-70, -200, 70, -58, { h: 14, gaps: { s: [[0, 6]] } });
      b.door('boss_in', 0, -57.25, 6, 'x', 7, true);
      for (const [x, z] of [[-35, -90], [35, -90], [-50, -130], [50, -130], [-25, -160], [25, -160], [0, -115]]) b.pillar(x, z, 10, 1.6, x === 0);
      b.platform(-55, -80, 10, 10, 2.5, M.sandstone, 'e'); b.platform(55, -80, 10, 10, 2.5, M.sandstone, 'w');
      b.sphinx(-60, -185, 0); b.sphinx(60, -185, 0);
      for (const [x, z] of [[-65, -62], [65, -62], [-65, -195], [65, -195], [-30, -195], [30, -195]]) b.brazier(x, z);
      b.pickup('armor', 'large', -55, -80, 2.5); b.pickup('armor', 'large', 55, -80, 2.5);
      for (const [x, z] of [[-60, -110], [60, -110], [-60, -150], [60, -150]]) {
        b.pickup('ammo', 'rockets', x, z); b.pickup('ammo', 'cannonballs', x + 3, z); b.pickup('health', 'large', x, z + 3);
      }
      b.pickup('ammo', 'cells', -20, -70); b.pickup('ammo', 'bullets', 20, -70);
      b.pickup('powerup', 'damage', 0, -130);
      b.pickup('health', 'super', 0, -196);
      b.encounter({
        id: 'BOSS', area: [-68, -198, 68, -64], lock: ['boss_in'], open: [], message: 'The Colossus is dust. The portal awaits!',
        checkpoint: { x: 0, z: -68, yaw: 0 },
        waves: [{ spawn: [S('boss', 1, 0, -175, 0)], msg: 'THE COLOSSUS AWAKENS!' }],
      });
      b.exit = { x: 0, z: -188, requires: 'BOSS' };
      b.secret(-66, -196, ['powerup', 'bomb']);
      b.scenery({ pyramids: [[0, -420, 160], [-300, -380, 90], [300, -380, 90], [-420, 150, 60]] });
      b.customScenery = true;
    },
  },
  // ------------------------------------------------------------------ LEVEL 5
  {
    id: 'siege', name: 'Sandstorm Siege', subtitle: 'Hold the Desert Fortress', theme: 'storm', music: 1, seed: 55,
    loadout: { owned: ['knife', 'revolver', 'shotgun', 'dshotgun', 'tommy', 'minigun', 'rocket', 'grenade', 'laser', 'cannon'], ammo: { shells: 60, bullets: 300, rockets: 25, grenades: 15, cells: 200, cannonballs: 4 }, armor: 100 },
    build(b) {
      const M = b.M;
      b.spawn = { x: 0, z: 10, yaw: 0 };
      b.arena(-10, -3, 10, 14, { h: 8, wall: M.sandstone, floor: M.sand, gaps: { n: [[0, 6]] } });
      b.pickup('armor', 'medium', -6, 6); b.pickup('health', 'medium', 6, 6); b.pickup('ammo', 'bullets', 0, 3);

      // The fortress: one huge walled yard you must hold for 2.5 minutes
      b.arena(-55, -116, 55, -6, { h: 10, wall: M.sandstone, floor: M.sand, gaps: { s: [[0, 6]], n: [[0, 6]] } });
      b.door('a_in', 0, -5.25, 6, 'x', 7, true);
      b.door('a_out', 0, -116.75, 6, 'x', 7, false);
      b.platform(0, -61, 16, 16, 3, M.sandstone, 'nsew');
      b.platform(-42, -22, 8, 8, 4, M.sandstone, 'e'); b.platform(42, -22, 8, 8, 4, M.sandstone, 'w');
      b.platform(-42, -100, 8, 8, 4, M.sandstone, 'e'); b.platform(42, -100, 8, 8, 4, M.sandstone, 'w');
      for (const [x, z, w, d] of [[-20, -40, 6, 1], [20, -40, 6, 1], [-20, -82, 6, 1], [20, -82, 6, 1], [0, -30, 8, 1], [0, -92, 8, 1], [-30, -61, 1, 6], [30, -61, 1, 6]]) b.cover(x, z, w, d);
      for (const [x, z] of [[-25, -20], [25, -104], [-12, -106], [12, -18]]) b.pillar(x, z, 6, 1, true);
      b.palm(-50, -60); b.palm(50, -60); b.palm(-50, -84); b.palm(50, -38);
      for (const [x, z] of [[-52, -9], [52, -9], [-52, -113], [52, -113]]) b.brazier(x, z);
      b.pickup('powerup', 'protect', 0, -61, 3);
      b.pickup('weapon', 'rocket', -42, -22, 4); b.pickup('weapon', 'minigun', 42, -22, 4);
      b.pickup('weapon', 'grenade', -42, -100, 4); b.pickup('powerup', 'speed', 42, -100, 4);
      b.pickup('powerup', 'bomb', 0, -46);
      for (const [x, z] of [[-35, -40], [35, -40], [-35, -82], [35, -82]]) { b.pickup('ammo', 'rockets', x, z); b.pickup('ammo', 'bullets', x + 2, z); b.pickup('health', 'medium', x, z + 2); }
      b.pickup('ammo', 'shells', -10, -20); b.pickup('ammo', 'cells', 10, -20); b.pickup('armor', 'large', 0, -104);
      b.secret(53, -107, ['health', 'super']);
      b.encounter({
        id: 'SIEGE', area: [-53, -114, 53, -10], lock: ['a_in'], open: ['a_in', 'a_out'], survive: 150,
        message: 'The siege is broken!',
        waves: [
          { at: 0, spawn: [S('gnasher', 10, 0, -100, 30), S('gunner', 8, 0, -105, 40)], msg: 'SURVIVE THE SIEGE!' },
          { at: 15, spawn: [S('kamikaze', 20, 0, -110, 40)], msg: 'Kamikazes from the north!' },
          { at: 30, spawn: [S('bull', 5, 0, -105, 40), S('skeleton', 6, 0, -100, 40)], items: [['ammo', 'rockets', -10, -50], ['health', 'large', 10, -72]] },
          { at: 45, spawn: [S('harpy', 8, 0, -60, 30), S('kamikaze', 8, -50, -60, 4), S('kamikaze', 8, 50, -60, 4)], msg: 'Flanked!' },
          { at: 60, spawn: [S('arachnid', 2, 0, -105, 30), S('gunner', 10, 0, -100, 45)], items: [['ammo', 'bullets', -8, -50], ['armor', 'medium', 8, -50]] },
          { at: 75, spawn: [S('kamikaze', 12, -48, -110, 5), S('kamikaze', 12, 48, -110, 5), S('kamikaze', 12, 0, -13, 20)], msg: 'AAAAAAAAH!' },
          { at: 90, spawn: [S('biomech', 2, 0, -108, 35), S('bull', 6, 0, -20, 35)], items: [['ammo', 'rockets', 0, -50], ['health', 'large', 0, -72]] },
          { at: 105, spawn: [S('skeleton', 8, 0, -100, 40), S('harpy', 8, 0, -60, 30), S('gnasher', 12, 0, -105, 40)] },
          { at: 120, spawn: [S('kamikaze', 20, -45, -60, 8), S('kamikaze', 20, 45, -60, 8), S('arachnid', 2, 0, -105, 30)], msg: 'FINAL ASSAULT!', items: [['powerup', 'damage', 0, -75]] },
        ],
      });
      b.arena(-8, -131, 8, -119, { h: 8, wall: M.sandstone, floor: M.sand, gaps: { s: [[0, 6]] } });
      b.brazier(-6, -129); b.brazier(6, -129);
      b.exit = { x: 0, z: -126, requires: 'SIEGE' };
    },
  },
  // ------------------------------------------------------------------ LEVEL 6
  {
    id: 'duat', name: 'Halls of the Duat', subtitle: 'Rivers of Fire', theme: 'inferno', music: 2, seed: 66,
    loadout: { owned: ['knife', 'revolver', 'shotgun', 'dshotgun', 'tommy', 'minigun', 'rocket', 'grenade', 'laser', 'cannon'], ammo: { shells: 70, bullets: 350, rockets: 30, grenades: 20, cells: 250, cannonballs: 6 }, armor: 100 },
    build(b) {
      const M = b.M;
      const W = M.basaltGlyph, F = M.tilesDark;
      b.spawn = { x: 0, z: 10, yaw: 0 };
      b.arena(-8, -3, 8, 14, { h: 8, wall: M.basalt, floor: F, gaps: { n: [[0, 6]] } });
      b.brazier(-6, 11, 0, false); b.brazier(6, 11, 0, false);
      b.pickup('ammo', 'cells', -5, 5); b.pickup('ammo', 'rockets', 5, 5); b.pickup('armor', 'medium', 0, 2);

      // Arena A: a river of fire with two stone crossings and a launch pad over the flames
      b.arena(-35, -70, 35, -6, { h: 11, wall: W, floor: F, gaps: { s: [[0, 6]], n: [[0, 6]] } });
      b.door('a_in', 0, -5.25, 6, 'x', 7, true);
      b.door('a_out', 0, -70.75, 6, 'x', 7, false);
      b.lava(-35, -42, -22, -34); b.lava(-15, -42, 15, -34); b.lava(22, -42, 35, -34);
      b.jumpPad(0, -28, 0, 0, -48, 0); b.jumpPad(0, -52, 0, 0, -26, 0);
      for (const [x, z] of [[-25, -18], [25, -18], [-25, -58], [25, -58]]) b.pillar(x, z, 10, 1.1);
      b.statue(-31, -20, Math.PI / 2, 7); b.statue(31, -20, -Math.PI / 2, 7);
      for (const [x, z] of [[-32, -9], [32, -9], [-32, -67], [32, -67]]) b.brazier(x, z, 0, false);
      b.pickup('powerup', 'damage', 0, -38); // dash through the fire for it
      b.pickup('weapon', 'cannon', 0, -62); b.pickup('ammo', 'cannonballs', 3, -62);
      b.pickup('health', 'medium', -30, -30); b.pickup('health', 'medium', 30, -30);
      b.pickup('ammo', 'cells', -30, -50); b.pickup('ammo', 'grenades', 30, -50);
      b.secret(-33, -62, ['powerup', 'bomb']);
      b.encounter({
        id: 'A', area: [-33, -68, 33, -10], lock: ['a_in'], open: ['a_in', 'a_out'],
        message: 'The river is crossed.', checkpoint: { x: 0, z: -55, yaw: 0 },
        waves: [
          { spawn: [S('skeleton', 6, 0, -62, 25), S('gnasher', 8, 0, -60, 25)] },
          { when: 3, spawn: [S('harpy', 8, 0, -40, 20), S('gunner', 8, 0, -64, 28)] },
          { when: 2, spawn: [S('kamikaze', 14, -28, -64, 5), S('kamikaze', 14, 28, -64, 5), S('bull', 3, 0, -62, 20)], msg: 'Across the fire!' },
          { when: 2, spawn: [S('biomech', 2, 0, -62, 20), S('skeleton', 6, 0, -60, 25)], items: [['health', 'large', 0, -14], ['ammo', 'rockets', 4, -14]] },
        ],
      });

      b.corridorZ(0, -92, -71.5, 6, 8, M.basalt, F);
      b.pickup('ammo', 'bullets', -1.5, -80); b.pickup('ammo', 'shells', 1.5, -80);
      b.lava(-2.9, -88, 2.9, -84); // a short fire trench: jump it

      // Arena B: Hall of Judgement - a dais ringed by a lava moat
      b.arena(-45, -165, 45, -93.5, { h: 12, wall: W, floor: F, gaps: { s: [[0, 6]], n: [[0, 6]] } });
      b.door('b_in', 0, -92.75, 6, 'x', 7, true);
      b.door('b_out', 0, -165.75, 6, 'x', 7, false);
      b.platform(0, -129, 20, 20, 4, M.basalt, 'ns', F);
      b.lava(-15, -144, 15, -139); b.lava(-15, -119, 15, -114); b.lava(-15, -139, -10, -119); b.lava(10, -139, 15, -119);
      b.jumpPad(-22, -129, 0, -5, -129, 4); b.jumpPad(22, -129, 0, 5, -129, 4);
      for (const [x, z] of [[-30, -108], [30, -108], [-30, -150], [30, -150]]) b.obelisk(x, z, 13);
      for (const z of [-105, -129, -153]) { b.statue(-41, z, Math.PI / 2, 8); b.statue(41, z, -Math.PI / 2, 8); }
      for (const [x, z] of [[-42, -96], [42, -96], [-42, -162], [42, -162]]) b.brazier(x, z, 0, false);
      b.pickup('powerup', 'bomb', -4, -129, 4); b.pickup('armor', 'large', 4, -129, 4);
      b.pickup('ammo', 'rockets', -38, -110); b.pickup('ammo', 'cells', 38, -110);
      b.pickup('ammo', 'cannonballs', -38, -150); b.pickup('ammo', 'bullets', 38, -150);
      b.pickup('health', 'large', -20, -160); b.pickup('health', 'large', 20, -160);
      b.encounter({
        id: 'B', area: [-43, -163, 43, -98], lock: ['b_in'], open: ['b_in', 'b_out'],
        message: 'Judgement is passed.', checkpoint: { x: 0, z: -104, yaw: 0 },
        waves: [
          { spawn: [S('arachnid', 2, 0, -158, 30), S('gunner', 8, 0, -155, 35)] },
          { when: 3, spawn: [S('bull', 6, 0, -158, 35), S('gnasher', 10, 0, -150, 35)] },
          { when: 3, spawn: [S('kamikaze', 16, -40, -160, 4), S('kamikaze', 16, 40, -160, 4), S('harpy', 8, 0, -129, 30)], msg: 'The damned pour in!' },
          { when: 3, spawn: [S('biomech', 3, 0, -158, 35), S('skeleton', 8, 0, -150, 35)], items: [['ammo', 'rockets', -6, -102], ['health', 'large', 6, -102]] },
          { when: 2, spawn: [S('kamikaze', 20, 0, -160, 30), S('arachnid', 2, 0, -158, 30), S('harpy', 6, 0, -129, 30)], items: [['armor', 'medium', 0, -102]] },
        ],
      });
      b.arena(-8, -181, 8, -168, { h: 8, wall: M.basalt, floor: F, gaps: { s: [[0, 6]] } });
      b.brazier(-6, -179); b.brazier(6, -179, 0, false);
      b.exit = { x: 0, z: -176, requires: 'B' };
    },
  },
  // ------------------------------------------------------------------ LEVEL 7
  {
    id: 'sky', name: 'Sky Temple of Ra', subtitle: 'Above the Clouds', theme: 'sky', music: 3, seed: 77,
    loadout: { owned: ['knife', 'revolver', 'shotgun', 'dshotgun', 'tommy', 'minigun', 'rocket', 'grenade', 'laser', 'cannon'], ammo: { shells: 80, bullets: 400, rockets: 35, grenades: 25, cells: 300, cannonballs: 8 }, armor: 100 },
    build(b) {
      const M = b.M;
      b.spawn = { x: 0, z: 10, yaw: 0 };
      // I0: launch island
      b.island(-10, -2, 10, 14, 0, { gaps: { n: [[0, 4]] } });
      b.brazier(-7, 11); b.brazier(7, 11, 0, false);
      b.pickup('ammo', 'rockets', -5, 5); b.pickup('ammo', 'cells', 5, 5); b.pickup('health', 'medium', 0, 2);
      b.bridge(-2, -20, 2, -2, 0);

      // I1: Garden of Winds
      b.island(-30, -60, 30, -20, 0, { gaps: { s: [[0, 4]], w: [[-41, 4]] } });
      for (const [x, z] of [[-20, -30], [20, -30], [-20, -50], [20, -50]]) b.pillar(x, z, 7, 0.9);
      b.palm(-26, -24); b.palm(26, -24); b.palm(-26, -56); b.palm(26, -56);
      b.jumpPad(0, -55, 0, 0, -77, 6);
      b.pickup('ammo', 'bullets', -12, -40); b.pickup('ammo', 'shells', 12, -40); b.pickup('armor', 'medium', 0, -26);
      // hidden islet off the west edge, reached by a pad hidden behind a pillar
      b.jumpPad(-25, -41, 0, -46, -41, 2);
      b.island(-51, -46, -41, -36, 2, { parapet: 0 });
      b.secret(-46, -41, ['health', 'super'], 2);
      b.pickup('powerup', 'damage', -48, -38, 2);
      b.encounter({
        id: 'A', area: [-28, -58, 28, -22], checkpoint: { x: 0, z: -45, yaw: 0 }, message: 'The gardens are calm. Take the launch pad!',
        waves: [
          { spawn: [S('harpy', 8, 0, -40, 20), S('gnasher', 6, 0, -52, 20)], msg: 'They come on the wind!' },
          { when: 2, spawn: [S('kamikaze', 10, -24, -54, 4), S('kamikaze', 10, 24, -54, 4), S('gunner', 6, 0, -52, 20)] },
          { when: 2, spawn: [S('harpy', 10, 0, -40, 20), S('skeleton', 4, 0, -50, 20)], items: [['health', 'large', 0, -30]] },
        ],
      });

      // I2: the Colonnade (6 m higher)
      b.island(-25, -110, 25, -70, 6, { gaps: { n: [[0, 5]] } });
      for (const z of [-80, -92, -104]) { b.pillarAt(-12, z, 6, 8); b.pillarAt(12, z, 6, 8); }
      for (const [x, z, w, d] of [[-6, -86, 4, 1], [6, -98, 4, 1]]) b.cover(x, z, w, d, 1.3, M.sandstoneDark, 6);
      b.pickup('ammo', 'rockets', -20, -75, 6); b.pickup('ammo', 'cannonballs', 20, -75, 6);
      b.pickup('powerup', 'speed', 0, -106, 6);
      b.encounter({
        id: 'B', area: [-23, -108, 23, -72], floor: 6, checkpoint: { x: 0, z: -84, yaw: 0 }, message: 'The colonnade is clear. Cross the bridge!',
        waves: [
          { spawn: [S('skeleton', 6, 0, -104, 18), S('gunner', 6, 0, -104, 18)] },
          { when: 2, spawn: [S('bull', 4, 0, -104, 15), S('gnasher', 8, 0, -100, 18)], msg: 'Stampede in the sky!' },
          { when: 3, spawn: [S('arachnid', 2, 0, -104, 15), S('harpy', 8, 0, -90, 18)], items: [['health', 'large', 0, -76]] },
          { when: 2, spawn: [S('biomech', 2, 0, -104, 15), S('kamikaze', 16, 0, -106, 18)], items: [['armor', 'large', 0, -76]] },
        ],
      });
      b.bridge(-2.5, -130, 2.5, -110, 6);

      // I3: the Sun Temple - Ra's arena
      b.island(-45, -200, 45, -130, 6, { gaps: { s: [[0, 5]] } });
      for (const [x, z] of [[-30, -150], [30, -150], [-30, -185], [30, -185]]) b.obeliskAt(x, z, 6, 14);
      for (const [x, z] of [[-15, -165], [15, -165]]) b.pillarAt(x, z, 6, 9, 1.4);
      for (const [x, z] of [[-42, -133], [42, -133], [-42, -197], [42, -197]]) b.brazierAt(x, z, 6, false);
      for (const [x, z] of [[-38, -145], [38, -145], [-38, -180], [38, -180]]) { b.pickup('ammo', 'rockets', x, z, 6); b.pickup('ammo', 'cells', x + 2, z, 6); b.pickup('health', 'large', x, z + 2, 6); }
      b.pickup('powerup', 'protect', 0, -140, 6); b.pickup('powerup', 'bomb', 0, -196, 6);
      b.pickup('ammo', 'cannonballs', -5, -140, 6); b.pickup('armor', 'large', 5, -140, 6);
      b.encounter({
        id: 'RA', area: [-43, -198, 43, -134], floor: 6, final: true,
        waves: [{ spawn: [S('ra', 1, 0, -185, 0)], msg: 'RA DESCENDS FROM THE SUN!' }],
      });
    },
  },
];

// Water surface helper (visual only)
export function makeWater(list, night) {
  const g = new THREE.Group();
  for (const w of list || []) {
    const m = new THREE.Mesh(new THREE.CircleGeometry(w.r, 48).rotateX(-Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: night ? 0x102030 : 0x2a7a8a, roughness: 0.05, metalness: 0.6, transparent: true, opacity: 0.85 }));
    m.position.set(w.x, 0.03, w.z);
    m.receiveShadow = true;
    const rim = new THREE.Mesh(new THREE.RingGeometry(w.r, w.r + 1.2, 48).rotateX(-Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: 0x5a7a2a, roughness: 1 }));
    rim.position.set(w.x, 0.02, w.z);
    g.add(m, rim);
  }
  return g;
}
