class Renderer {
  constructor(canvas, camera) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.camera = camera;
  }

  resize() {
    this.canvas.width = window.innerWidth * devicePixelRatio;
    this.canvas.height = window.innerHeight * devicePixelRatio;
    this.canvas.style.width = window.innerWidth + 'px';
    this.canvas.style.height = window.innerHeight + 'px';
  }

  clear() {
    const { ctx, canvas } = this;
    ctx.setTransform(1,0,0,1,0,0);
    ctx.fillStyle = '#16213e';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  applyCamera() {
    const { ctx } = this;
    const cam = this.camera;
    ctx.setTransform(
      cam.zoom * devicePixelRatio, 0,
      0, cam.zoom * devicePixelRatio,
      cam.x * devicePixelRatio,
      cam.y * devicePixelRatio
    );
  }

  drawGrid(gridSize) {
    const { ctx, canvas, camera } = this;
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.04)';
    ctx.lineWidth = 1 / camera.zoom;

    const left = -camera.x / camera.zoom;
    const top  = -camera.y / camera.zoom;
    const right = left + canvas.width / camera.zoom / devicePixelRatio;
    const bot   = top  + canvas.height / camera.zoom / devicePixelRatio;

    const startX = Math.floor(left / gridSize) * gridSize;
    const startY = Math.floor(top  / gridSize) * gridSize;

    for (let x = startX; x < right; x += gridSize) {
      ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x, bot); ctx.stroke();
    }
    for (let y = startY; y < bot; y += gridSize) {
      ctx.beginPath(); ctx.moveTo(left, y); ctx.lineTo(right, y); ctx.stroke();
    }
    ctx.restore();
  }

  drawEdges(edges) {
    const { ctx } = this;
    for (const e of edges) {
      const color = lerpColor('#2ecc71', '#e74c3c', e.congestion);
      const baseW = 8;
      // Road shadow
      ctx.beginPath();
      ctx.moveTo(e.a.x, e.a.y);
      ctx.lineTo(e.b.x, e.b.y);
      ctx.strokeStyle = 'rgba(0,0,0,0.4)';
      ctx.lineWidth = baseW + 3;
      ctx.lineCap = 'round';
      ctx.stroke();
      // Road surface
      ctx.beginPath();
      ctx.moveTo(e.a.x, e.a.y);
      ctx.lineTo(e.b.x, e.b.y);
      ctx.strokeStyle = color;
      ctx.lineWidth = baseW;
      ctx.stroke();
      // Center dashes
      ctx.beginPath();
      ctx.moveTo(e.a.x, e.a.y);
      ctx.lineTo(e.b.x, e.b.y);
      ctx.strokeStyle = 'rgba(255,255,255,0.15)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([10, 12]);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  drawNodes(nodes) {
    const { ctx } = this;
    for (const n of nodes) {
      if (n.control) {
        this._drawControl(n);
      } else {
        ctx.beginPath();
        ctx.arc(n.x, n.y, 5, 0, Math.PI*2);
        ctx.fillStyle = '#aaa';
        ctx.fill();
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
      ctx.beginPath(); ctx.arc(0, 0, 9, 0, Math.PI*2);
      ctx.fillStyle = '#111'; ctx.fill();
      ctx.beginPath(); ctx.arc(0, 0, 6, 0, Math.PI*2);
      ctx.fillStyle = color; ctx.fill();
      // Glow
      ctx.shadowColor = color; ctx.shadowBlur = 10;
      ctx.beginPath(); ctx.arc(0, 0, 6, 0, Math.PI*2);
      ctx.fillStyle = color; ctx.fill();
      ctx.shadowBlur = 0;
    } else if (ctrl.type === 'stop') {
      ctx.beginPath(); ctx.arc(0, 0, 9, 0, Math.PI*2);
      ctx.fillStyle = '#c0392b'; ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 8px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('S', 0, 0);
    }
    ctx.restore();
  }

  drawCars(cars) {
    const { ctx } = this;
    const W = 10, H = 6;
    for (const car of cars) {
      if (!car.alive) continue;
      ctx.save();
      ctx.translate(car.x, car.y);
      ctx.rotate(car.angle);
      // Body
      ctx.fillStyle = car.color;
      ctx.beginPath();
      ctx.roundRect(-W/2, -H/2, W, H, 2);
      ctx.fill();
      // Headlights
      ctx.fillStyle = '#fffde7';
      ctx.fillRect(W/2 - 2, -H/2 + 1, 2, 1.5);
      ctx.fillRect(W/2 - 2,  H/2 - 2.5, 2, 1.5);
      ctx.restore();
    }
  }

  drawPreviewEdge(from, to) {
    const { ctx } = this;
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.strokeStyle = 'rgba(100,180,255,0.6)';
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    ctx.setLineDash([8,8]);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  drawPreviewNode(pos) {
    const { ctx } = this;
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, 7, 0, Math.PI*2);
    ctx.strokeStyle = 'rgba(100,180,255,0.8)';
    ctx.lineWidth = 2;
    ctx.stroke();
  }
}
