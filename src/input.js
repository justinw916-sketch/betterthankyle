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

  down(code) { return this.keys.has(code); }
  mouse(btn) { return (this.buttons & (1 << btn)) !== 0; }
  wasPressed(code) { return this.pressed.has(code); }

  // Called at the end of each frame.
  endFrame() {
    this.mouseDX = 0; this.mouseDY = 0; this.wheel = 0;
    this.pressed.clear();
  }
}
