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
    this.audio    = new AudioManager();
    this.heatmap  = new HeatmapManager();

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

    this._elapsed     = 0;
    this._minimapRect = null;
    this._undoStack   = [];       // max 60 entries
    this.buildings    = this._generateBuildings();

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

    document.getElementById('muteBtn').addEventListener('click', e => {
      const muted = this.audio.toggleMute();
      e.currentTarget.textContent = muted ? '🔇' : '🔊';
    });

    document.getElementById('heatmapBtn').addEventListener('click', e => {
      const on = this.heatmap.toggle();
      e.currentTarget.classList.toggle('active', on);
    });

    document.getElementById('shareBtn').addEventListener('click', () => this.save());
    document.getElementById('undoBtn').addEventListener('click', () => this.undo());

    // Keyboard: Ctrl+Z / Cmd+Z
    window.addEventListener('keydown', e => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') { e.preventDefault(); this.undo(); }
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
      this.audio.tick(this.traffic);
      this.heatmap.update(this.traffic.cars, dt);
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
    this.renderer.drawHeatmap(this.heatmap);
    this.renderer.drawCars(this.traffic.cars);
    this.renderer.drawAlerts(this.graph.allEdges(), this.traffic.cars, this._elapsed);

    // Previews
    if (this.tool === 'road' && this._drawStart) {
      // Snap to nearby existing node if within 22px world-space
      const raw       = this.gridSnap ? snapToGrid(this._mouseWorld.x, this._mouseWorld.y) : this._mouseWorld;
      const nearNode  = this.graph.allNodes().find(n => dist(n, raw) < 22);
      const snapPoint = nearNode ? { x: nearNode.x, y: nearNode.y } : raw;
      this.renderer.drawPreviewEdge(this._drawStart, snapPoint);
      if (nearNode) this.renderer.drawSnapHint(nearNode);
      else          this.renderer.drawPreviewNode(snapPoint);
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

  // ── Undo ─────────────────────────────────────────────────────────────────
  _pushUndo(record) {
    this._undoStack.push(record);
    if (this._undoStack.length > 60) this._undoStack.shift();
  }

  undo() {
    const record = this._undoStack.pop();
    if (!record) { this._showToast('Nothing to undo'); return; }

    if (record.type === 'edge_add') {
      const edge = this.graph.allEdges().find(e => e.id === record.edgeId);
      if (edge) {
        this.traffic.cars.forEach(c => { if (c.edge?.id === edge.id) c.alive = false; });
        this.graph.removeEdge(edge);
      }

    } else if (record.type === 'edge_del') {
      const nA = this.graph._ensureNode(record.nA.id, record.nA.x, record.nA.y);
      const nB = this.graph._ensureNode(record.nB.id, record.nB.x, record.nB.y);
      this.graph._restoreEdge(record.eId, nA, nB, record.ow, record.lanes);
      if (record.nA.ctrl) nA.control = record.nA.ctrl;
      if (record.nB.ctrl) nB.control = record.nB.ctrl;

    } else if (record.type === 'control') {
      const node = this.graph.allNodes().find(n => n.id === record.nodeId);
      if (node) node.control = record.prev;

    } else if (record.type === 'oneway') {
      const edge = this.graph.allEdges().find(e => e.id === record.edgeId);
      if (edge) {
        edge.oneWay = record.prev;
        this.traffic.cars.forEach(c => { if (c.edge?.id === edge.id) c.alive = false; });
      }

    } else if (record.type === 'lanes') {
      const edge = this.graph.allEdges().find(e => e.id === record.edgeId);
      if (edge) edge.lanes = record.prev;

    } else if (record.type === 'zone_add') {
      const idx = this.traffic.zones.findIndex(z => z.id === record.zoneId);
      if (idx !== -1) this.traffic.zones.splice(idx, 1);

    } else if (record.type === 'zone_del') {
      this.traffic.zones.push(record.zone);
    }

    this._showToast('↩ Undone');
  }

  _handleRoadTap(pos) {
    // Snap endpoint to a nearby existing node
    const nearNode = this.graph.allNodes().find(n => dist(n, pos) < 22);
    const snapped  = nearNode ? { x: nearNode.x, y: nearNode.y } : pos;

    if (!this._drawStart) { this._drawStart = { ...snapped }; return; }
    if (dist(this._drawStart, snapped) < 10) { this._drawStart = null; return; }
    const a    = this.graph.addNode(this._drawStart.x, this._drawStart.y);
    const b    = this.graph.addNode(snapped.x, snapped.y);
    const edge = this.graph.addEdge(a, b);
    if (edge) this._pushUndo({ type: 'edge_add', edgeId: edge.id });
    this.audio.playClick();
    this._drawStart = { ...snapped };
  }

  _handleControlTap(world, type) {
    const hit = this.graph.hitTest(world.x, world.y, 22);
    if (!hit || hit.type !== 'node') return;
    this._pushUndo({ type: 'control', nodeId: hit.node.id, prev: hit.node.control });
    if      (type === 'light')      this.traffic.addTrafficLight(hit.node);
    else if (type === 'stop')       this.traffic.addStopSign(hit.node);
    else if (type === 'roundabout') this.traffic.addRoundabout(hit.node);
    this.audio.playPlop();
  }

  _handleOneWayTap(world) {
    const hit = this.graph.hitTest(world.x, world.y, 22);
    if (!hit || hit.type !== 'edge') return;
    this._pushUndo({ type: 'oneway', edgeId: hit.edge.id, prev: hit.edge.oneWay });
    this.graph.cycleOneWay(hit.edge);
    this.traffic.cars.forEach(c => { if (c.edge?.id === hit.edge.id) c.alive = false; });
  }

  _handleUpgradeTap(world) {
    const hit = this.graph.hitTest(world.x, world.y, 22);
    if (!hit || hit.type !== 'edge') return;
    this._pushUndo({ type: 'lanes', edgeId: hit.edge.id, prev: hit.edge.lanes });
    this.graph.upgradeLanes(hit.edge);
  }

  _handleZoneTap(world) {
    const existing = this.traffic.zones.find(z => dist(z, world) < z.radius && z.type === this.zoneType);
    if (existing) {
      this._pushUndo({ type: 'zone_del', zone: { ...existing } });
      this.traffic.zones.splice(this.traffic.zones.indexOf(existing), 1);
    } else {
      const zone = this.traffic.addZone(world.x, world.y, ZONE_RADIUS, this.zoneType);
      this._pushUndo({ type: 'zone_add', zoneId: zone.id });
    }
  }

  _eraseAt(world) {
    const hit = this.graph.hitTest(world.x, world.y, 22);
    if (!hit) {
      const zone = this.traffic.zones.find(z => dist(z, world) < z.radius);
      if (zone) {
        this._pushUndo({ type: 'zone_del', zone: { ...zone } });
        this.traffic.removeZoneAt(world.x, world.y);
      }
      return;
    }
    if (hit.type === 'edge' && !this._deletedIds.has(hit.edge.id)) {
      const e = hit.edge;
      this._pushUndo({
        type: 'edge_del', eId: e.id, ow: e.oneWay, lanes: e.lanes,
        nA: { id: e.a.id, x: e.a.x, y: e.a.y, ctrl: e.a.control },
        nB: { id: e.b.id, x: e.b.x, y: e.b.y, ctrl: e.b.control },
      });
      this._deletedIds.add(e.id);
      this.traffic.cars.forEach(c => { if (c.edge?.id === e.id) c.alive = false; });
      this.graph.removeEdge(e);
    } else if (hit.type === 'node' && hit.node.control) {
      this._pushUndo({ type: 'control', nodeId: hit.node.id, prev: hit.node.control });
      this.graph.removeControl(hit.node.id);
    }
  }

  // ── Save / Load ───────────────────────────────────────────────────────────
  _serialize() {
    const CTRL = { light: 1, stop: 2, roundabout: 3 };
    const nodes = this.graph.allNodes().map(n => {
      const row = [n.id, Math.round(n.x), Math.round(n.y)];
      if (n.control) {
        row.push(CTRL[n.control.type] ?? 0);
        if (n.control.type === 'light') row.push(n.control.state === 'red' ? 1 : 0);
      }
      return row;
    });
    const edges = this.graph.allEdges().map(e => [
      e.id, e.a.id, e.b.id,
      e.oneWay === 'ab' ? 1 : e.oneWay === 'ba' ? 2 : 0,
      e.lanes || 1,
    ]);
    const zones = this.traffic.zones.map(z => [
      Math.round(z.x), Math.round(z.y), Math.round(z.radius), z.type === 'slow' ? 0 : 1,
    ]);
    const cam = [
      Math.round(this.camera.x), Math.round(this.camera.y),
      Math.round(this.camera.zoom * 1000) / 1000,
    ];
    return { v: 1, nodes, edges, zones, cam };
  }

  _deserialize(data) {
    if (data.v !== 1) return;

    // Rebuild graph
    this.graph   = new RoadGraph();
    this.traffic = new TrafficManager(this.graph);
    // Re-attach audio which still refs old traffic — update reference
    const nodeMap = this.graph.loadData({ nodes: data.nodes, edges: data.edges });

    // Restore controls
    const CTRL = { 1: 'light', 2: 'stop', 3: 'roundabout' };
    for (const row of data.nodes) {
      const [id,,,ctrlType, ctrlState] = row;
      if (!ctrlType) continue;
      const node = nodeMap[id];
      const type = CTRL[ctrlType];
      if (type === 'light')      this.traffic.addTrafficLight(node);
      else if (type === 'stop')  this.traffic.addStopSign(node);
      else if (type === 'roundabout') this.traffic.addRoundabout(node);
      if (type === 'light' && node.control) node.control.state = ctrlState === 1 ? 'red' : 'green';
    }

    // Restore zones
    for (const [x, y, r, t] of (data.zones || [])) {
      this.traffic.addZone(x, y, r, t === 0 ? 'slow' : 'fast');
    }

    // Restore camera
    if (data.cam) {
      [this.camera.x, this.camera.y, this.camera.zoom] = data.cam;
    }
  }

  save() {
    const json  = JSON.stringify(this._serialize());
    const hash  = btoa(unescape(encodeURIComponent(json)));
    history.replaceState(null, '', '#' + hash);
    navigator.clipboard?.writeText(location.href)
      .then(()  => this._showToast('🔗 Link copied!'))
      .catch(()  => this._showToast('🔗 URL updated — copy from address bar'));
  }

  _loadFromHash() {
    const hash = location.hash.slice(1);
    if (!hash) return;
    try {
      const json = decodeURIComponent(escape(atob(hash)));
      this._deserialize(JSON.parse(json));
      this._showToast('City loaded!');
    } catch (e) {
      console.warn('Could not load city from URL:', e);
    }
  }

  _showToast(msg) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
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

window.addEventListener('DOMContentLoaded', () => {
  window.game = new Game();
  window.game._loadFromHash();
});
