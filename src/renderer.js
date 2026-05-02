const ROAD_WIDTH   = 12;
const ROAD_WIDTH_2 = 20;  // 2-lane road
const ROUNDABOUT_R = 32;

// Day/night sky palette: [time 0-1] → color stops
const SKY = [
  { t: 0,    bg: '#0a0e1a', ambient: 0.06 },  // deep night
  { t: 0.22, bg: '#1a2535', ambient: 0.10 },  // pre-dawn
  { t: 0.30, bg: '#2a3f5c', ambient: 0.18 },  // dawn
  { t: 0.45, bg: '#1e3a5e', ambient: 0.22 },  // day
  { t: 0.55, bg: '#1e3a5e', ambient: 0.22 },  // midday
  { t: 0.70, bg: '#2d2040', ambient: 0.14 },  // dusk
  { t: 0.82, bg: '#14101e', ambient: 0.08 },  // evening
  { t: 1.0,  bg: '#0a0e1a', ambient: 0.06 },  // night
];

function skyAt(t) {
  let lo = SKY[0], hi = SKY[SKY.length - 1];
  for (let i = 0; i < SKY.length - 1; i++) {
    if (t >= SKY[i].t && t <= SKY[i+1].t) { lo = SKY[i]; hi = SKY[i+1]; break; }
  }
  const f = lo.t === hi.t ? 0 : (t - lo.t) / (hi.t - lo.t);
  return { bg: lerpColor(lo.bg, hi.bg, f), ambient: lerp(lo.ambient, hi.ambient, f) };
}

class Renderer {
  constructor(canvas, camera) {
    this.canvas  = canvas;
    this.ctx     = canvas.getContext('2d');
    this.camera  = camera;
    this.dayTime = 0;  // 0-1, set each frame by Game
  }

  resize() {
    this.canvas.width  = window.innerWidth  * devicePixelRatio;
    this.canvas.height = window.innerHeight * devicePixelRatio;
    this.canvas.style.width  = window.innerWidth  + 'px';
    this.canvas.style.height = window.innerHeight + 'px';
  }

  clear() {
    const { ctx, canvas } = this;
    const sky = skyAt(this.dayTime);
    ctx.setTransform(1,0,0,1,0,0);
    ctx.fillStyle = sky.bg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    this._skyAmbient = sky.ambient;
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
    const left  = -camera.x / camera.zoom, top = -camera.y / camera.zoom;
    const right = left + canvas.width / camera.zoom / devicePixelRatio;
    const bot   = top  + canvas.height / camera.zoom / devicePixelRatio;
    for (let x = Math.floor(left / gridSize) * gridSize; x < right; x += gridSize) {
      ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x, bot); ctx.stroke();
    }
    for (let y = Math.floor(top / gridSize) * gridSize; y < bot; y += gridSize) {
      ctx.beginPath(); ctx.moveTo(left, y); ctx.lineTo(right, y); ctx.stroke();
    }
    ctx.restore();
  }

  drawBuildings(buildings) {
    const { ctx } = this;
    const a = this._skyAmbient ?? 0.1;
    for (const b of buildings) {
      ctx.fillStyle = `rgba(255,255,255,${a * b.shade})`;
      ctx.fillRect(b.x, b.y, b.w, b.h);
      // Roof edge
      ctx.strokeStyle = `rgba(255,255,255,${a * b.shade * 1.6})`;
      ctx.lineWidth = 0.8;
      ctx.strokeRect(b.x, b.y, b.w, b.h);
    }
  }

  drawZones(zones) {
    const { ctx } = this;
    for (const z of zones) {
      const color = z.type === 'slow' ? '255,80,80' : '80,160,255';
      ctx.save();
      ctx.beginPath();
      ctx.arc(z.x, z.y, z.radius, 0, Math.PI * 2);
      ctx.fillStyle   = `rgba(${color},0.12)`;
      ctx.fill();
      ctx.strokeStyle = `rgba(${color},0.5)`;
      ctx.lineWidth   = 2;
      ctx.setLineDash([8, 6]); ctx.stroke(); ctx.setLineDash([]);
      // Label
      ctx.fillStyle = `rgba(${color},0.85)`;
      ctx.font = 'bold 11px sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(z.type === 'slow' ? '🐢' : '🚀', z.x, z.y);
      ctx.restore();
    }
  }

  drawEdges(edges) {
    const { ctx } = this;
    ctx.lineCap = 'round';
    for (const e of edges) {
      const rw         = e.lanes === 2 ? ROAD_WIDTH_2 : ROAD_WIDTH;
      const congColor  = lerpColor('#3a7d4f', '#c0392b', e.congestion);

      // Shadow
      ctx.beginPath(); ctx.moveTo(e.a.x, e.a.y); ctx.lineTo(e.b.x, e.b.y);
      ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = rw + 4; ctx.stroke();
      // Asphalt
      ctx.beginPath(); ctx.moveTo(e.a.x, e.a.y); ctx.lineTo(e.b.x, e.b.y);
      ctx.strokeStyle = '#2c2c3e'; ctx.lineWidth = rw; ctx.stroke();
      // Congestion overlay
      ctx.beginPath(); ctx.moveTo(e.a.x, e.a.y); ctx.lineTo(e.b.x, e.b.y);
      ctx.strokeStyle = congColor; ctx.lineWidth = rw;
      ctx.globalAlpha = 0.45 + e.congestion * 0.45; ctx.stroke(); ctx.globalAlpha = 1;

      if (e.lanes === 2) {
        // Two lane dividers
        for (const offset of [-rw * 0.22, rw * 0.22]) {
          const dx = e.b.x - e.a.x, dy = e.b.y - e.a.y;
          const len = Math.hypot(dx, dy) || 1;
          const px = (-dy / len) * offset, py = (dx / len) * offset;
          ctx.beginPath();
          ctx.moveTo(e.a.x + px, e.a.y + py);
          ctx.lineTo(e.b.x + px, e.b.y + py);
          ctx.strokeStyle = 'rgba(255,255,200,0.12)';
          ctx.lineWidth   = 1;
          ctx.setLineDash([10, 14]); ctx.stroke(); ctx.setLineDash([]);
        }
        // Solid center line
        ctx.beginPath(); ctx.moveTo(e.a.x, e.a.y); ctx.lineTo(e.b.x, e.b.y);
        ctx.strokeStyle = 'rgba(255,255,180,0.22)'; ctx.lineWidth = 1.5;
        ctx.stroke();
      } else {
        // Single center dash
        ctx.beginPath(); ctx.moveTo(e.a.x, e.a.y); ctx.lineTo(e.b.x, e.b.y);
        ctx.strokeStyle = 'rgba(255,255,200,0.18)'; ctx.lineWidth = 1.5;
        ctx.setLineDash([10, 14]); ctx.stroke(); ctx.setLineDash([]);
      }

      if (e.oneWay) this._drawArrow(e);
    }
  }

  _drawArrow(edge) {
    const { ctx } = this;
    const src  = edge.oneWay === 'ab' ? edge.a : edge.b;
    const dst  = edge.oneWay === 'ab' ? edge.b : edge.a;
    const mx   = (src.x + dst.x) / 2, my = (src.y + dst.y) / 2;
    const dx   = dst.x - src.x, dy = dst.y - src.y;
    const len  = Math.hypot(dx, dy) || 1;
    const s    = 9;
    ctx.save();
    ctx.translate(mx, my);
    ctx.rotate(Math.atan2(dy / len, dx / len));
    ctx.beginPath();
    ctx.moveTo(s, 0); ctx.lineTo(-s, s * 0.55); ctx.lineTo(-s * 0.4, 0); ctx.lineTo(-s, -s * 0.55);
    ctx.closePath();
    ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.fill();
    ctx.restore();
  }

  drawNodes(nodes) {
    const { ctx } = this;
    for (const n of nodes) {
      if (n.control) this._drawControl(n);
      else {
        ctx.beginPath(); ctx.arc(n.x, n.y, 5, 0, Math.PI * 2);
        ctx.fillStyle = '#2c2c3e'; ctx.fill();
        ctx.strokeStyle = '#555'; ctx.lineWidth = 1.5; ctx.stroke();
      }
    }
  }

  _drawControl(node) {
    const { ctx } = this;
    const ctrl = node.control;
    ctx.save(); ctx.translate(node.x, node.y);

    if (ctrl.type === 'light') {
      const color = ctrl.state === 'green' ? '#2ecc71' : '#e74c3c';
      ctx.beginPath(); ctx.arc(0, 0, 10, 0, Math.PI*2);
      ctx.fillStyle = '#1a1a2e'; ctx.fill();
      ctx.strokeStyle = '#555'; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.shadowColor = color; ctx.shadowBlur = 12;
      ctx.beginPath(); ctx.arc(0, 0, 6, 0, Math.PI*2);
      ctx.fillStyle = color; ctx.fill(); ctx.shadowBlur = 0;
      const frac = clamp((ctrl.timer || 0) / 8, 0, 1);
      ctx.beginPath(); ctx.arc(0, 0, 10, -Math.PI/2, -Math.PI/2 + frac * Math.PI*2);
      ctx.strokeStyle = color + '88'; ctx.lineWidth = 2; ctx.stroke();

    } else if (ctrl.type === 'stop') {
      ctx.beginPath(); ctx.arc(0, 0, 10, 0, Math.PI*2);
      ctx.fillStyle = '#c0392b'; ctx.fill();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.font = 'bold 7px sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('STOP', 0, 0);

    } else if (ctrl.type === 'roundabout') {
      ctx.beginPath(); ctx.arc(0, 0, ROUNDABOUT_R, 0, Math.PI*2);
      ctx.strokeStyle = '#4a9eff88'; ctx.lineWidth = 6;
      ctx.setLineDash([8, 6]); ctx.stroke(); ctx.setLineDash([]);
      ctx.beginPath(); ctx.arc(0, 0, 10, 0, Math.PI*2);
      ctx.fillStyle = '#1a2a3a'; ctx.fill();
      ctx.strokeStyle = '#4a9eff'; ctx.lineWidth = 2; ctx.stroke();
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 - Math.PI / 2;
        ctx.save();
        ctx.rotate(a + Math.PI / 2); ctx.translate(0, -ROUNDABOUT_R); ctx.rotate(-Math.PI / 2);
        ctx.beginPath(); ctx.moveTo(5, 0); ctx.lineTo(-4, 4); ctx.lineTo(-4, -4); ctx.closePath();
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
      ctx.translate(car.x, car.y); ctx.rotate(car.angle);
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath(); ctx.ellipse(1, 1, W/2, H/2, 0, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = car.color;
      ctx.beginPath(); ctx.roundRect(-W/2, -H/2, W, H, 2); ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.beginPath(); ctx.roundRect(-W/2+2, -H/2+1, W/2, H-2, 1); ctx.fill();
      ctx.fillStyle = '#fffde7';
      ctx.fillRect(W/2-2, -H/2+0.5, 2, 1.5);
      ctx.fillRect(W/2-2,  H/2-2,   2, 1.5);
      ctx.restore();
    }
  }

  drawPreviewEdge(from, to) {
    const { ctx } = this;
    ctx.beginPath(); ctx.moveTo(from.x, from.y); ctx.lineTo(to.x, to.y);
    ctx.strokeStyle = 'rgba(100,180,255,0.55)';
    ctx.lineWidth = ROAD_WIDTH; ctx.lineCap = 'round';
    ctx.setLineDash([10, 10]); ctx.stroke(); ctx.setLineDash([]);
  }

  drawPreviewNode(pos) {
    const { ctx } = this;
    ctx.beginPath(); ctx.arc(pos.x, pos.y, 8, 0, Math.PI*2);
    ctx.strokeStyle = 'rgba(100,180,255,0.9)'; ctx.lineWidth = 2; ctx.stroke();
  }

  // Congestion alert bubbles over jammed roads + stuck-car steam
  drawAlerts(edges, cars, time) {
    const { ctx } = this;
    const THRESHOLD = 0.62;

    // --- Edge congestion bubbles ---
    for (const e of edges) {
      if (e.congestion < THRESHOLD) continue;
      const severity = (e.congestion - THRESHOLD) / (1 - THRESHOLD); // 0-1
      const mx = (e.a.x + e.b.x) / 2;
      const my = (e.a.y + e.b.y) / 2 - 18;

      const pulse = 1 + 0.18 * Math.sin(time * 3.5 + e.id);
      const r     = (10 + severity * 5) * pulse;
      const alpha = 0.55 + severity * 0.4;

      ctx.save();
      ctx.globalAlpha = alpha;

      // Glow
      ctx.shadowColor = '#e74c3c';
      ctx.shadowBlur  = 10 + severity * 8;

      // Bubble
      ctx.beginPath(); ctx.arc(mx, my, r, 0, Math.PI * 2);
      ctx.fillStyle = severity > 0.6 ? '#c0392b' : '#e74c3c';
      ctx.fill();

      ctx.shadowBlur = 0;

      // "!" or "!!" depending on severity
      ctx.fillStyle = '#fff';
      ctx.font      = `bold ${Math.round(r * 0.9)}px sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(severity > 0.75 ? '!!' : '!', mx, my);

      ctx.globalAlpha = 1;
      ctx.restore();
    }

    // --- Stuck car steam puffs ---
    for (const car of cars) {
      if (!car.alive || car.stuckTime < 5) continue;
      const intensity = clamp((car.stuckTime - 5) / 10, 0, 1);
      const wobble    = Math.sin(time * 4 + car.id) * 3;
      const px        = car.x + wobble;
      const py        = car.y - car.h - 6 - Math.sin(time * 2 + car.id) * 2;

      ctx.save();
      ctx.globalAlpha = 0.5 + intensity * 0.4;
      ctx.font        = `${9 + intensity * 4}px sans-serif`;
      ctx.textAlign   = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('💢', px, py);
      ctx.globalAlpha = 1;
      ctx.restore();
    }
  }

  // Returns { x, y, w, h, toWorld } so game.js can detect taps and convert coords
  drawMinimap(edges, nodes, cars, camera, screenW, screenH) {
    const { ctx } = this;
    const dpr = devicePixelRatio;
    const MW = 155, MH = 105, MARGIN = 14;

    // Top-right corner (avoids bottom toolbar)
    const mx = screenW - MW - MARGIN;
    const my = MARGIN + 50; // below the stats bar

    // World bounds — fallback to a default view when no roads placed yet
    let minX = -250, maxX = 250, minY = -200, maxY = 200;
    if (nodes.length > 0) {
      minX = nodes.reduce((m, n) => Math.min(m, n.x), Infinity)  - 60;
      maxX = nodes.reduce((m, n) => Math.max(m, n.x), -Infinity) + 60;
      minY = nodes.reduce((m, n) => Math.min(m, n.y), Infinity)  - 60;
      maxY = nodes.reduce((m, n) => Math.max(m, n.y), -Infinity) + 60;
    }
    const worldW = maxX - minX || 1, worldH = maxY - minY || 1;
    const scale  = Math.min(MW / worldW, MH / worldH);

    // Center world content inside the minimap rect
    const ox = mx + (MW - worldW * scale) / 2 - minX * scale;
    const oy = my + (MH - worldH * scale) / 2 - minY * scale;
    const toMini  = (wx, wy) => ({ x: wx * scale + ox, y: wy * scale + oy });
    const toWorld = (sx, sy) => ({ x: (sx - ox) / scale, y: (sy - oy) / scale });

    // Draw in screen-pixel space
    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Background + border
    ctx.beginPath(); ctx.roundRect(mx - 1, my - 1, MW + 2, MH + 2, 7);
    ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.lineWidth = 1; ctx.stroke();
    ctx.beginPath(); ctx.roundRect(mx, my, MW, MH, 6);
    ctx.fillStyle = 'rgba(8,12,24,0.88)'; ctx.fill();

    // Clip to minimap area
    ctx.beginPath(); ctx.roundRect(mx, my, MW, MH, 6); ctx.clip();

    // Roads
    ctx.lineWidth = e => e.lanes === 2 ? 2.5 : 1.5;
    ctx.lineCap = 'round';
    for (const e of edges) {
      const a = toMini(e.a.x, e.a.y), b = toMini(e.b.x, e.b.y);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
      ctx.strokeStyle = lerpColor('#2a5c38', '#a93226', e.congestion);
      ctx.lineWidth   = e.lanes === 2 ? 2.5 : 1.5;
      ctx.stroke();
    }

    // Cars as tiny dots
    for (const car of cars) {
      if (!car.alive) continue;
      const p = toMini(car.x, car.y);
      ctx.beginPath(); ctx.arc(p.x, p.y, 1.2, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.fill();
    }

    // Camera viewport box
    const vL = toMini(-camera.x / camera.zoom, -camera.y / camera.zoom);
    const vR = toMini((-camera.x + screenW) / camera.zoom, (-camera.y + screenH) / camera.zoom);
    const vW = vR.x - vL.x, vH = vR.y - vL.y;
    ctx.fillStyle   = 'rgba(255,255,255,0.06)';
    ctx.fillRect(vL.x, vL.y, vW, vH);
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth   = 1;
    ctx.strokeRect(vL.x, vL.y, vW, vH);

    ctx.restore();

    return { x: mx, y: my, w: MW, h: MH, toWorld };
  }

  drawZonePreview(pos, radius, type) {
    const { ctx } = this;
    const color = type === 'slow' ? '255,80,80' : '80,160,255';
    ctx.beginPath(); ctx.arc(pos.x, pos.y, radius, 0, Math.PI*2);
    ctx.strokeStyle = `rgba(${color},0.6)`; ctx.lineWidth = 2;
    ctx.setLineDash([6, 5]); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = `rgba(${color},0.08)`; ctx.fill();
  }
}
