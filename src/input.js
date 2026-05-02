class InputHandler {
  constructor(canvas, game) {
    this.canvas = canvas;
    this.game = game;
    this._touches = new Map();
    this._lastPinchDist = null;
    this._bind();
  }

  _bind() {
    const c = this.canvas;
    c.addEventListener('mousedown', e => this._onDown(this._mousePos(e)));
    c.addEventListener('mousemove', e => this._onMove(this._mousePos(e)));
    c.addEventListener('mouseup',   e => this._onUp(this._mousePos(e)));
    c.addEventListener('wheel', e => { e.preventDefault(); this._onWheel(e); }, { passive: false });

    c.addEventListener('touchstart',  e => { e.preventDefault(); this._onTouchStart(e); }, { passive: false });
    c.addEventListener('touchmove',   e => { e.preventDefault(); this._onTouchMove(e); },  { passive: false });
    c.addEventListener('touchend',    e => { e.preventDefault(); this._onTouchEnd(e); },   { passive: false });
    c.addEventListener('touchcancel', e => { e.preventDefault(); this._onTouchEnd(e); },   { passive: false });
  }

  _mousePos(e) {
    const r = this.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  _onDown(pos) { this.game.handleDown(pos); }
  _onMove(pos) { this.game.handleMove(pos); }
  _onUp(pos)   { this.game.handleUp(pos); }

  _onWheel(e) {
    const factor = e.deltaY < 0 ? 1.1 : 0.9;
    const r = this.canvas.getBoundingClientRect();
    this.game.zoom(factor, { x: e.clientX - r.left, y: e.clientY - r.top });
  }

  _onTouchStart(e) {
    for (const t of e.changedTouches) {
      this._touches.set(t.identifier, { x: t.clientX, y: t.clientY });
    }
    if (e.touches.length === 1) {
      const r = this.canvas.getBoundingClientRect();
      const t = e.touches[0];
      this._onDown({ x: t.clientX - r.left, y: t.clientY - r.top });
    } else if (e.touches.length === 2) {
      this.game.cancelDown();
      this._lastPinchDist = this._pinchDist(e);
    }
  }

  _onTouchMove(e) {
    if (e.touches.length === 2) {
      const d = this._pinchDist(e);
      if (this._lastPinchDist) {
        const center = this._pinchCenter(e);
        const r = this.canvas.getBoundingClientRect();
        this.game.zoom(d / this._lastPinchDist, { x: center.x - r.left, y: center.y - r.top });
      }
      this._lastPinchDist = d;
      // Pan with two fingers
      const dx = e.touches[0].clientX - (this._touches.get(e.touches[0].identifier)?.x ?? e.touches[0].clientX);
      const dy = e.touches[0].clientY - (this._touches.get(e.touches[0].identifier)?.y ?? e.touches[0].clientY);
      this.game.pan(dx, dy);
      for (const t of e.touches) this._touches.set(t.identifier, { x: t.clientX, y: t.clientY });
    } else if (e.touches.length === 1) {
      const r = this.canvas.getBoundingClientRect();
      const t = e.touches[0];
      this._onMove({ x: t.clientX - r.left, y: t.clientY - r.top });
      this._touches.set(t.identifier, { x: t.clientX, y: t.clientY });
    }
  }

  _onTouchEnd(e) {
    if (e.touches.length === 0) {
      const r = this.canvas.getBoundingClientRect();
      const t = e.changedTouches[0];
      this._onUp({ x: t.clientX - r.left, y: t.clientY - r.top });
      this._lastPinchDist = null;
    }
    for (const t of e.changedTouches) this._touches.delete(t.identifier);
  }

  _pinchDist(e) {
    return Math.hypot(e.touches[1].clientX - e.touches[0].clientX, e.touches[1].clientY - e.touches[0].clientY);
  }
  _pinchCenter(e) {
    return { x: (e.touches[0].clientX + e.touches[1].clientX) / 2, y: (e.touches[0].clientY + e.touches[1].clientY) / 2 };
  }
}
