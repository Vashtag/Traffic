const ZOOM_MIN    = 0.2, ZOOM_MAX = 4;
const DAY_CYCLE   = 180;   // seconds for full day/night cycle
const ZONE_RADIUS = 60;    // default speed zone radius
const BUILDING_WORLD = 2400;
const BUILDING_BLOCK = 120;

class Game {
  constructor() {
    this.canvas   = document.getElementById('gameCanvas');
    this.camera   = { x: 0, y: 0, zoom: 1 };
    this.renderer = new Renderer(this.canvas, this.camera);
    this.graph    = new RoadGraph();
    this.traffic  = new TrafficManager(this.graph);

    this.tool         = 'road';
    this.gridSnap     = false;
    this.paused       = false;
    this.zoneType     = 'slow';   // current zone tool subtype

    this._drawStart    = null;
    this._mouseWorld   = { x: 0, y: 0 };
    this._isDragging   = false;
    this._dragStart    = null;
    this._dragCamStart = null;
    this._downPos      = null;
    this._deleteHeld   = false;
    this._deletedIds   = new Set();

    this._elapsed    = 0;
    this._minimapRect = null;
    this.buildings   = this._generateBuildings();

    this._setupUI();
    this._input = new InputHandler(this.canvas, this);
    this.renderer.resize();
    window.addEventListener('resize', () => this.renderer.resize());

    this._last = performance.now();
    requestAnimationFrame(t => this._loop(t));
  }

  _generateBuildings() {
    const out = [];
    const rng = (n) => Math.random() * n;
    for (let bx = -BUILDING_WORLD; bx < BUILDING_WORLD; bx += BUILDING_BLOCK) {
      for (let by = -BUILDING_WORLD; by < BUILDING_WORLD; by += BUILDING_BLOCK) {
        if (Math.random() < 0.62) {
          const pad  = 10 + rng(14);
          const w    = BUILDING_BLOCK - pad * 2 - rng(18);
          const h    = BUILDING_BLOCK - pad * 2 - rng(18);
          const shade = 0.55 + rng(0.45);  // relative brightness multiplier
          out.push({ x: bx + pad, y: by + pad, w: Math.max(w, 8), h: Math.max(h, 8), shade });
        }
      }
    }
    return out;
  }

  _setupUI() {
    document.querySelectorAll('.tool-btn[data-tool]').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.tool-btn[data-tool]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.tool = btn.dataset.tool;
        this._drawStart = null;
        this._setHint();
      });
    });

    // Zone type toggle within zone tool
    document.getElementById('zoneTypeToggle').addEventListener('click', () => {
      this.zoneType = this.zoneType === 'slow' ? 'fast' : 'slow';
      document.getElementById('zoneTypeToggle').textContent = this.zoneType === 'slow' ? '🐢' : '🚀';
    });

    document.getElementById('gridToggle').addEventListener('click', e => {
      this.gridSnap = !this.gridSnap;
      e.currentTarget.classList.toggle('grid-on', this.gridSnap);
    });

    document.getElementById('pauseBtn').addEventListener('click', e => {
      this.paused = !this.paused;
      e.currentTarget.textContent = this.paused ? '▶️' : '⏸️';
    });

    this._setHint();
  }

  _setHint() {
    const hints = {
      road:       'Tap to start a road, tap again to extend. Tap same point to stop.',
      light:      'Tap an intersection to place a traffic light.',
      stop:       'Tap an intersection to place a stop sign.',
      roundabout: 'Tap an intersection to convert it to a roundabout.',
      oneway:     'Tap a road to cycle: two-way → one-way → reverse → two-way.',
      upgrade:    'Tap a road to toggle single-lane / two-lane.',
      zone:       'Tap to place a speed zone. Toggle 🐢/🚀 to switch type.',
      delete:     'Tap or drag to erase roads and controls.',
    };
    document.getElementById('hint').textContent = hints[this.tool] || '';
  }

  _loop(now) {
    const dt = Math.min((now - this._last) / 1000, 0.1);
    this._last = now;

    if (!this.paused) {
      this._elapsed += dt;
      this.traffic.update(dt);
    }

    // Day/night: 0-1 over DAY_CYCLE seconds
    this.renderer.dayTime = (this._elapsed % DAY_CYCLE) / DAY_CYCLE;

    this.renderer.clear();
    this.renderer.applyCamera();

    this.renderer.drawBuildings(this.buildings);
    if (this.gridSnap) this.renderer.drawGrid(GRID);
    this.renderer.drawZones(this.traffic.zones);
    this.renderer.drawEdges(this.graph.allEdges());
    this.renderer.drawNodes(this.graph.allNodes());
    this.renderer.drawCars(this.traffic.cars);
    this.renderer.drawAlerts(this.graph.allEdges(), this.traffic.cars, this._elapsed);

    // Previews
    if (this.tool === 'road' && this._drawStart) {
      const snap = this.gridSnap ? snapToGrid(this._mouseWorld.x, this._mouseWorld.y) : this._mouseWorld;
      this.renderer.drawPreviewEdge(this._drawStart, snap);
      this.renderer.drawPreviewNode(snap);
    }
    if (this.tool === 'zone') {
      this.renderer.drawZonePreview(this._mouseWorld, ZONE_RADIUS, this.zoneType);
    }

    // Minimap drawn last so it's always on top (resets transform internally)
    this._minimapRect = this.renderer.drawMinimap(
      this.graph.allEdges(), this.graph.allNodes(), this.traffic.cars,
      this.camera, window.innerWidth, window.innerHeight
    );

    this._updateStats();
    requestAnimationFrame(t => this._loop(t));
  }

  _updateStats() {
    const alive = this.traffic.cars.filter(c => c.alive).length;
    document.getElementById('carCount').textContent = `Cars: ${alive}`;

    // Grade
    const grade      = this.traffic.grade();
    const score      = Math.round(this.traffic.smoothScore);
    const gradeColor = { A: '#2ecc71', B: '#27ae60', C: '#f39c12', D: '#e67e22', F: '#e74c3c' }[grade];
    const letterEl   = document.getElementById('gradeLetter');
    letterEl.textContent  = this.graph.allEdges().length ? grade : '–';
    letterEl.style.color  = gradeColor;
    document.getElementById('gradeScore').textContent = this.graph.allEdges().length ? `${score}%` : '';

    if (this.traffic.gradeChanged && this.graph.allEdges().length) {
      letterEl.style.animation = 'none';
      letterEl.offsetHeight;   // reflow to restart
      letterEl.style.animation = 'gradebump 0.3s ease-out forwards';
    }

    // Pressure bar
    const pct  = Math.round(this.traffic.pressure * 100);
    const fill = document.getElementById('pressureFill');
    fill.style.width      = pct + '%';
    fill.style.background = pct < 35
      ? `linear-gradient(90deg,#27ae60,#2ecc71)`
      : pct < 65
      ? `linear-gradient(90deg,#e67e22,#f39c12)`
      : `linear-gradient(90deg,#c0392b,#e74c3c)`;

    // Rush hour
    const rushEl = document.getElementById('rushIndicator');
    if (this.traffic.isRushHour) { rushEl.textContent = '🚨 Rush Hour!'; rushEl.style.opacity = '1'; }
    else { rushEl.textContent = `Rush in ${this.traffic.timeUntilRush()}s`; rushEl.style.opacity = '0.45'; }

    // Time of day
    const t = this.renderer.dayTime;
    document.getElementById('timeOfDay').textContent =
      t < 0.25 ? 'Night' : t < 0.35 ? 'Dawn' : t < 0.65 ? 'Day' : t < 0.80 ? 'Dusk' : 'Night';
  }

  screenToWorld(pos) {
    return { x: (pos.x - this.camera.x) / this.camera.zoom, y: (pos.y - this.camera.y) / this.camera.zoom };
  }

  _inMinimap(pos) {
    const m = this._minimapRect;
    return m && pos.x >= m.x && pos.x <= m.x + m.w && pos.y >= m.y && pos.y <= m.y + m.h;
  }

  handleDown(pos) {
    if (this._inMinimap(pos)) return; // let handleUp do the jump
    this._downPos      = pos;
    this._isDragging   = false;
    this._dragStart    = pos;
    this._dragCamStart = { x: this.camera.x, y: this.camera.y };
    if (this.tool === 'delete') {
      this._deleteHeld = true;
      this._deletedIds.clear();
      this._eraseAt(this.screenToWorld(pos));
    }
  }

  handleMove(pos) {
    this._mouseWorld = this.screenToWorld(pos);
    if (this._downPos) {
      const dx = pos.x - this._downPos.x, dy = pos.y - this._downPos.y;
      if (Math.hypot(dx, dy) > 8) {
        if (this.tool !== 'road' || !this._drawStart) this._isDragging = true;
      }
      if (this._isDragging && this.tool !== 'delete' && this._dragStart) {
        this.camera.x = this._dragCamStart.x + (pos.x - this._dragStart.x);
        this.camera.y = this._dragCamStart.y + (pos.y - this._dragStart.y);
      }
    }
    if (this._deleteHeld && this._downPos && Math.hypot(pos.x - this._downPos.x, pos.y - this._downPos.y) > 6) {
      this._eraseAt(this._mouseWorld);
    }
  }

  handleUp(pos) {
    const wasDragging = this._isDragging;
    this._isDragging  = false;
    this._downPos     = null;
    this._deleteHeld  = false;

    // Minimap tap → jump camera to that world position
    if (this._inMinimap(pos)) {
      const world = this._minimapRect.toWorld(pos.x, pos.y);
      this.camera.x = window.innerWidth  / 2 - world.x * this.camera.zoom;
      this.camera.y = window.innerHeight / 2 - world.y * this.camera.zoom;
      return;
    }

    if (this.tool === 'delete') return;
    if (wasDragging) return;

    const world   = this.screenToWorld(pos);
    const snapped = this.gridSnap ? snapToGrid(world.x, world.y) : world;

    if      (this.tool === 'road')       this._handleRoadTap(snapped);
    else if (this.tool === 'light')      this._handleControlTap(world, 'light');
    else if (this.tool === 'stop')       this._handleControlTap(world, 'stop');
    else if (this.tool === 'roundabout') this._handleControlTap(world, 'roundabout');
    else if (this.tool === 'oneway')     this._handleOneWayTap(world);
    else if (this.tool === 'upgrade')    this._handleUpgradeTap(world);
    else if (this.tool === 'zone')       this._handleZoneTap(world);
  }

  cancelDown() {
    this._drawStart = null; this._downPos = null;
    this._isDragging = false; this._deleteHeld = false;
  }

  _handleRoadTap(pos) {
    if (!this._drawStart) { this._drawStart = { ...pos }; return; }
    if (dist(this._drawStart, pos) < 10) { this._drawStart = null; return; }
    const a = this.graph.addNode(this._drawStart.x, this._drawStart.y);
    const b = this.graph.addNode(pos.x, pos.y);
    this.graph.addEdge(a, b);
    this._drawStart = { ...pos };
  }

  _handleControlTap(world, type) {
    const hit = this.graph.hitTest(world.x, world.y, 22);
    if (!hit || hit.type !== 'node') return;
    if      (type === 'light')      this.traffic.addTrafficLight(hit.node);
    else if (type === 'stop')       this.traffic.addStopSign(hit.node);
    else if (type === 'roundabout') this.traffic.addRoundabout(hit.node);
  }

  _handleOneWayTap(world) {
    const hit = this.graph.hitTest(world.x, world.y, 22);
    if (!hit || hit.type !== 'edge') return;
    this.graph.cycleOneWay(hit.edge);
    this.traffic.cars.forEach(c => { if (c.edge?.id === hit.edge.id) c.alive = false; });
  }

  _handleUpgradeTap(world) {
    const hit = this.graph.hitTest(world.x, world.y, 22);
    if (!hit || hit.type !== 'edge') return;
    this.graph.upgradeLanes(hit.edge);
  }

  _handleZoneTap(world) {
    // If tapping inside existing zone of same type, remove it; otherwise place new one
    const existing = this.traffic.zones.find(z => dist(z, world) < z.radius && z.type === this.zoneType);
    if (existing) this.traffic.zones.splice(this.traffic.zones.indexOf(existing), 1);
    else this.traffic.addZone(world.x, world.y, ZONE_RADIUS, this.zoneType);
  }

  _eraseAt(world) {
    const hit = this.graph.hitTest(world.x, world.y, 22);
    if (!hit) {
      // Also erase zones
      this.traffic.removeZoneAt(world.x, world.y);
      return;
    }
    if (hit.type === 'edge' && !this._deletedIds.has(hit.edge.id)) {
      this._deletedIds.add(hit.edge.id);
      this.traffic.cars.forEach(c => { if (c.edge?.id === hit.edge.id) c.alive = false; });
      this.graph.removeEdge(hit.edge);
    } else if (hit.type === 'node' && hit.node.control) {
      this.graph.removeControl(hit.node.id);
    }
  }

  zoom(factor, pivot) {
    const newZoom = clamp(this.camera.zoom * factor, ZOOM_MIN, ZOOM_MAX);
    const actual  = newZoom / this.camera.zoom;
    this.camera.x = pivot.x - (pivot.x - this.camera.x) * actual;
    this.camera.y = pivot.y - (pivot.y - this.camera.y) * actual;
    this.camera.zoom = newZoom;
  }

  pan(dx, dy) { this.camera.x += dx; this.camera.y += dy; }
}

window.addEventListener('DOMContentLoaded', () => { window.game = new Game(); });
