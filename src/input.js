// Keyboard / mouse input with pointer lock.
export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.pressed = new Set();
    this.mouseDX = 0; this.mouseDY = 0;
    this.buttons = 0;
    this.wheel = 0;
    this.locked = false;
    this.fallback = false; // true when pointer lock is refused: use free mouse movement instead
    this.active = false;   // set by the game while playing (enables fallback input)
    this.onLockChange = null;
    this.lastX = null; this.lastY = null;

    addEventListener('keydown', (e) => {
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
      if (this.locked && ['Space', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => { this.keys.clear(); this.buttons = 0; });
    addEventListener('mousemove', (e) => {
      if (!this.captured) { this.lastX = null; return; }
      let dx = e.movementX, dy = e.movementY;
      if (!this.locked) {
        // fallback: derive deltas from absolute position (movementX is unreliable without lock)
        if (this.lastX === null) { this.lastX = e.clientX; this.lastY = e.clientY; return; }
        dx = e.clientX - this.lastX; dy = e.clientY - this.lastY;
        this.lastX = e.clientX; this.lastY = e.clientY;
        dx *= 1.6; dy *= 1.6;
      }
      // guard against the occasional huge spike some browsers emit
      if (Math.abs(dx) > 400 || Math.abs(dy) > 400) return;
      this.mouseDX += dx; this.mouseDY += dy;
    });
    addEventListener('mousedown', (e) => {
      if (!this.captured) return;
      this.buttons |= 1 << e.button;
      this.pressed.add('Mouse' + e.button);
    });
    addEventListener('mouseup', (e) => { this.buttons &= ~(1 << e.button); });
    addEventListener('wheel', (e) => { if (this.captured) this.wheel += Math.sign(e.deltaY); }, { passive: true });
    addEventListener('contextmenu', (e) => { if (this.captured) e.preventDefault(); });
    document.addEventListener('pointerlockerror', () => {
      if (!this.fallback) { this.fallback = true; if (this.onFallback) this.onFallback(); }
    });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.canvas;
      if (!this.locked) { this.buttons = 0; this.keys.clear(); }
      if (this.onLockChange) this.onLockChange(this.locked);
    });
  }

  get captured() { return this.locked || (this.fallback && this.active); }

  lock() {
    try {
      const p = this.canvas.requestPointerLock({ unadjustedMovement: true });
      if (p && p.catch) p.catch(() => {
        try {
          const p2 = this.canvas.requestPointerLock();
          if (p2 && p2.catch) p2.catch(() => { if (!this.fallback) { this.fallback = true; if (this.onFallback) this.onFallback(); } });
        } catch { this.fallback = true; }
      });
    } catch { this.fallback = true; }
  }

  unlock() { if (document.pointerLockElement) document.exitPointerLock(); }

  // Gamepad (standard mapping). Called once per frame before the game reads input.
  pollPad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    let gp = null;
    for (const p of pads) if (p && p.connected) { gp = p; break; }
    if (!gp) { this.pad = null; this.padFire = this.padJump = false; return; }
    if (!this.padSeen) { this.padSeen = true; if (this.onPad) this.onPad(gp.id); }
    const dz = (v) => { v = v || 0; const a = Math.abs(v); return a < 0.16 ? 0 : Math.sign(v) * ((a - 0.16) / 0.84); };
    const btn = (i) => !!(gp.buttons[i] && (gp.buttons[i].pressed || gp.buttons[i].value > 0.5));
    const look = (v) => Math.sign(v) * v * v; // squared curve for fine aiming
    this.pad = { mx: dz(gp.axes[0]), my: dz(gp.axes[1]), lx: look(dz(gp.axes[2])), ly: look(dz(gp.axes[3])) };
    this.padFire = btn(7) || btn(6);
    this.padJump = btn(0);
    const prev = this.padPrev || [];
    const rise = (i) => btn(i) && !prev[i];
    if (rise(1)) this.pressed.add('KeyQ');
    if (rise(3)) this.pressed.add('KeyB');
    if (rise(9)) this.pressed.add('Escape');
    if (rise(0)) this.pressed.add('PadA');
    if (rise(4)) this.wheel -= 1;
    if (rise(5) || rise(2)) this.wheel += 1;
    this.padPrev = gp.buttons.map((_, i) => btn(i));
  }

  down(code) { return this.keys.has(code); }
  mouse(btn) { return (this.buttons & (1 << btn)) !== 0; }
  wasPressed(code) { return this.pressed.has(code); }

  // Called at the end of each frame.
  endFrame() {
    this.mouseDX = 0; this.mouseDY = 0; this.wheel = 0;
    this.pressed.clear();
  }
}
