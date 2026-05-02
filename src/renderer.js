const ROAD_WIDTH = 12;
const ROUNDABOUT_R = 32;

class Renderer {
  constructor(canvas, camera) {
    this.canvas = canvas;
    this.ctx    = canvas.getContext('2d');
    this.camera = camera;
  }

  resize() {
    this.canvas.width  = window.innerWidth  * devicePixelRatio;
    this.canvas.height = window.innerHeight * devicePixelRatio;
    this.canvas.style.width  = window.innerWidth  + 'px';
    this.canvas.style.height = window.innerHeight + 'px';
  }

  clear() {
    const { ctx, canvas } = this;
    ctx.setTransform(1,0,0,1,0,0);
    ctx.fillStyle = '#16213e';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  applyCamera() {
    const cam = this.camera;
    this.ctx.setTransform(
      cam.zoom * devicePixelRatio, 0,
      0, cam.zoom * devicePixelRatio,
      cam.x * devicePixelRatio,
      cam.y * devicePixelRatio
    );
  }

  drawGrid(gridSize) {
    const { ctx, canvas, camera } = this;
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth   = 1 / camera.zoom;
    const left  = -camera.x / camera.zoom;
    const top   = -camera.y / camera.zoom;
    const right = left + canvas.width  / camera.zoom / devicePixelRatio;
    const bot   = top  + canvas.height / camera.zoom / devicePixelRatio;
    for (let x = Math.floor(left / gridSize) * gridSize; x < right; x += gridSize) {
      ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x, bot); ctx.stroke();
    }
    for (let y = Math.floor(top / gridSize) * gridSize; y < bot; y += gridSize) {
      ctx.beginPath(); ctx.moveTo(left, y); ctx.lineTo(right, y); ctx.stroke();
    }
    ctx.restore();
  }

  drawEdges(edges) {
    const { ctx } = this;
    ctx.lineCap = 'round';

    for (const e of edges) {
      const congColor = lerpColor('#3a7d4f', '#c0392b', e.congestion);

      // Shadow
      ctx.beginPath();
      ctx.moveTo(e.a.x, e.a.y); ctx.lineTo(e.b.x, e.b.y);
      ctx.strokeStyle = 'rgba(0,0,0,0.5)';
      ctx.lineWidth   = ROAD_WIDTH + 4;
      ctx.stroke();

      // Asphalt
      ctx.beginPath();
      ctx.moveTo(e.a.x, e.a.y); ctx.lineTo(e.b.x, e.b.y);
      ctx.strokeStyle = '#2c2c3e';
      ctx.lineWidth   = ROAD_WIDTH;
      ctx.stroke();

      // Congestion overlay
      ctx.beginPath();
      ctx.moveTo(e.a.x, e.a.y); ctx.lineTo(e.b.x, e.b.y);
      ctx.strokeStyle  = congColor;
      ctx.lineWidth    = ROAD_WIDTH;
      ctx.globalAlpha  = 0.45 + e.congestion * 0.45;
      ctx.stroke();
      ctx.globalAlpha  = 1;

      // Center dashes
      ctx.beginPath();
      ctx.moveTo(e.a.x, e.a.y); ctx.lineTo(e.b.x, e.b.y);
      ctx.strokeStyle = 'rgba(255,255,200,0.18)';
      ctx.lineWidth   = 1.5;
      ctx.setLineDash([10, 14]);
      ctx.stroke();
      ctx.setLineDash([]);

      // One-way arrow
      if (e.oneWay) this._drawArrow(e);
    }
  }

  _drawArrow(edge) {
    const { ctx } = this;
    const src  = edge.oneWay === 'ab' ? edge.a : edge.b;
    const dst  = edge.oneWay === 'ab' ? edge.b : edge.a;
    const mx   = (src.x + dst.x) / 2;
    const my   = (src.y + dst.y) / 2;
    const dx   = dst.x - src.x, dy = dst.y - src.y;
    const len  = Math.hypot(dx, dy) || 1;
    const ux   = dx / len, uy = dy / len;
    const size = 9;

    ctx.save();
    ctx.translate(mx, my);
    ctx.rotate(Math.atan2(uy, ux));
    ctx.beginPath();
    ctx.moveTo( size,  0);
    ctx.lineTo(-size,  size * 0.55);
    ctx.lineTo(-size * 0.4, 0);
    ctx.lineTo(-size, -size * 0.55);
    ctx.closePath();
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.fill();
    ctx.restore();
  }

  drawNodes(nodes) {
    const { ctx } = this;
    for (const n of nodes) {
      if (n.control) this._drawControl(n);
      else {
        ctx.beginPath();
        ctx.arc(n.x, n.y, 5, 0, Math.PI * 2);
        ctx.fillStyle   = '#2c2c3e';
        ctx.fill();
        ctx.strokeStyle = '#555';
        ctx.lineWidth   = 1.5;
        ctx.stroke();
      }
    }
  }

  _drawControl(node) {
    const { ctx } = this;
    const ctrl = node.control;
    ctx.save();
    ctx.translate(node.x, node.y);

    if (ctrl.type === 'light') {
      const color = ctrl.state === 'green' ? '#2ecc71' : '#e74c3c';
      ctx.beginPath(); ctx.arc(0, 0, 10, 0, Math.PI * 2);
      ctx.fillStyle = '#1a1a2e'; ctx.fill();
      ctx.strokeStyle = '#555'; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.shadowColor = color; ctx.shadowBlur = 12;
      ctx.beginPath(); ctx.arc(0, 0, 6, 0, Math.PI * 2);
      ctx.fillStyle = color; ctx.fill();
      ctx.shadowBlur = 0;
      // Phase arc
      const frac = clamp((ctrl.timer || 0) / 8, 0, 1);
      ctx.beginPath();
      ctx.arc(0, 0, 10, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2);
      ctx.strokeStyle = color + '88'; ctx.lineWidth = 2; ctx.stroke();

    } else if (ctrl.type === 'stop') {
      ctx.beginPath(); ctx.arc(0, 0, 10, 0, Math.PI * 2);
      ctx.fillStyle = '#c0392b'; ctx.fill();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 7px sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('STOP', 0, 0);

    } else if (ctrl.type === 'roundabout') {
      // Outer ring
      ctx.beginPath(); ctx.arc(0, 0, ROUNDABOUT_R, 0, Math.PI * 2);
      ctx.strokeStyle = '#4a9eff88'; ctx.lineWidth = 6;
      ctx.setLineDash([8, 6]); ctx.stroke(); ctx.setLineDash([]);
      // Inner island
      ctx.beginPath(); ctx.arc(0, 0, 10, 0, Math.PI * 2);
      ctx.fillStyle = '#1a2a3a'; ctx.fill();
      ctx.strokeStyle = '#4a9eff'; ctx.lineWidth = 2; ctx.stroke();
      // Yield arrows around ring
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 - Math.PI / 2;
        ctx.save();
        ctx.rotate(a + Math.PI / 2);
        ctx.translate(0, -ROUNDABOUT_R);
        ctx.rotate(-Math.PI / 2);
        ctx.beginPath();
        ctx.moveTo(5, 0); ctx.lineTo(-4, 4); ctx.lineTo(-4, -4);
        ctx.closePath();
        ctx.fillStyle = 'rgba(74,158,255,0.5)'; ctx.fill();
        ctx.restore();
      }
    }
    ctx.restore();
  }

  drawCars(cars) {
    const { ctx } = this;
    for (const car of cars) {
      if (!car.alive) continue;
      const W = car.w, H = car.h;
      ctx.save();
      ctx.translate(car.x, car.y);
      ctx.rotate(car.angle);
      // Shadow
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath(); ctx.ellipse(1, 1, W / 2, H / 2, 0, 0, Math.PI * 2); ctx.fill();
      // Body
      ctx.fillStyle = car.color;
      ctx.beginPath(); ctx.roundRect(-W/2, -H/2, W, H, 2); ctx.fill();
      // Windshield
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.beginPath(); ctx.roundRect(-W/2 + 2, -H/2 + 1, W/2, H - 2, 1); ctx.fill();
      // Headlights
      ctx.fillStyle = '#fffde7';
      ctx.fillRect(W/2 - 2, -H/2 + 0.5, 2, 1.5);
      ctx.fillRect(W/2 - 2,  H/2 - 2,   2, 1.5);
      ctx.restore();
    }
  }

  drawPreviewEdge(from, to) {
    const { ctx } = this;
    ctx.beginPath();
    ctx.moveTo(from.x, from.y); ctx.lineTo(to.x, to.y);
    ctx.strokeStyle = 'rgba(100,180,255,0.55)';
    ctx.lineWidth   = ROAD_WIDTH;
    ctx.lineCap     = 'round';
    ctx.setLineDash([10, 10]); ctx.stroke(); ctx.setLineDash([]);
  }

  drawPreviewNode(pos) {
    const { ctx } = this;
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, 8, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(100,180,255,0.9)';
    ctx.lineWidth   = 2;
    ctx.stroke();
  }
}
