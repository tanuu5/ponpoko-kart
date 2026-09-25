// Keyboard + gamepad input, mapped to racing controls.
//   accel: ArrowUp / W / gamepad A (or RT)
//   brake: ArrowDown / S / gamepad B (or LT)
//   steer: ArrowLeft/Right, A/D, left stick
//   jump/drift: Space / Shift(R) / gamepad RB
//   item: E / X / Z / gamepad LB  (hold down/brake while using to throw backward)
//   look back: C / gamepad Y ; pause: Escape / P / gamepad Start
export class Input {
  constructor() {
    this.keys = new Set();
    this.pressed = new Set(); // edge-triggered this frame
    this.enabled = true;
    this.gamepadIndex = null;
    this._padPrev = {};
    this.padState = { steer: 0, accel: 0, brake: 0, jump: false, item: false, look: false, pause: false };
    this.menuActions = []; // gamepad-generated menu actions
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      this.pressed.add(e.code);
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code) && this.gameActive) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
    });
    window.addEventListener('blur', () => this.keys.clear());
    window.addEventListener('gamepadconnected', (e) => {
      this.gamepadIndex = e.gamepad.index;
    });
    this.gameActive = false;
  }

  down(...codes) {
    for (const c of codes) if (this.keys.has(c)) return true;
    return false;
  }

  hit(...codes) {
    for (const c of codes) if (this.pressed.has(c)) return true;
    return false;
  }

  pollGamepad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    let gp = null;
    if (this.gamepadIndex != null) gp = pads[this.gamepadIndex];
    if (!gp) for (const p of pads) if (p) { gp = p; this.gamepadIndex = p.index; break; }
    const s = this.padState;
    if (!gp) {
      s.steer = 0; s.accel = 0; s.brake = 0; s.jump = false; s.item = false; s.look = false; s.pause = false;
      return;
    }
    const b = (i) => (gp.buttons[i] ? gp.buttons[i].value > 0.5 || gp.buttons[i].pressed : false);
    const bv = (i) => (gp.buttons[i] ? gp.buttons[i].value : 0);
    let sx = gp.axes[0] || 0;
    if (Math.abs(sx) < 0.15) sx = 0;
    if (b(14)) sx = -1;
    if (b(15)) sx = 1;
    s.steer = Math.max(-1, Math.min(1, sx));
    s.accel = Math.max(b(0) ? 1 : 0, bv(7));
    s.brake = Math.max(b(1) ? 1 : 0, bv(6) > 0.5 ? 1 : 0);
    s.jump = b(5) || b(2);
    s.item = b(4);
    s.look = b(3);
    s.pause = b(9);
    // menu edges
    const edge = (name, now) => {
      const was = this._padPrev[name];
      this._padPrev[name] = now;
      return now && !was;
    };
    const ay = gp.axes[1] || 0;
    if (edge('up', b(12) || ay < -0.6)) this.menuActions.push('up');
    if (edge('down', b(13) || ay > 0.6)) this.menuActions.push('down');
    if (edge('left', b(14) || sx < -0.6)) this.menuActions.push('left');
    if (edge('right', b(15) || sx > 0.6)) this.menuActions.push('right');
    if (edge('ok', b(0))) this.menuActions.push('ok');
    if (edge('back', b(1))) this.menuActions.push('back');
    if (edge('start', b(9))) this.menuActions.push('start');
    if (edge('jumpBtn', s.jump)) this.pressed.add('PadJump');
    if (edge('itemBtn', s.item)) this.pressed.add('PadItem');
  }

  /** Racing controls snapshot. */
  controls() {
    const s = this.padState;
    let steer = 0;
    if (this.down('ArrowLeft', 'KeyA')) steer -= 1;
    if (this.down('ArrowRight', 'KeyD')) steer += 1;
    if (steer === 0) steer = s.steer;
    const accel = this.down('ArrowUp', 'KeyW') ? 1 : s.accel;
    const brake = this.down('ArrowDown', 'KeyS') ? 1 : s.brake;
    const jump = this.down('Space', 'ShiftLeft', 'ShiftRight', 'KeyK') || s.jump;
    const jumpPressed = this.hit('Space', 'ShiftLeft', 'ShiftRight', 'KeyK', 'PadJump');
    const itemPressed = this.hit('KeyE', 'KeyX', 'KeyZ', 'KeyJ', 'PadItem');
    const lookBack = this.down('KeyC') || s.look;
    return { steer, accel, brake, jump, jumpPressed, itemPressed, lookBack };
  }

  pausePressed() {
    return this.hit('Escape', 'KeyP') || this.menuActions.includes('start');
  }

  endFrame() {
    this.pressed.clear();
    this.menuActions.length = 0;
  }
}
