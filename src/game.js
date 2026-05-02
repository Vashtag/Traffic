const ZOOM_MIN = 0.2, ZOOM_MAX = 4;

class Game {
  constructor() {
    this.canvas   = document.getElementById('gameCanvas');
    this.camera   = { x: 0, y: 0, zoom: 1 };
    this.renderer = new Renderer(this.canvas, this.camera);
    this.graph    = new RoadGraph();
    this.traffic  = new TrafficManager(this.graph);

    this.tool     = 'road';
    this.gridSnap = false;
    this.paused   = false;

    this._drawStart     = null;
    this._mouseWorld    = { x: 0, y: 0 };
    this._isDragging    = false;
    this._dragStart     = null;
    this._dragCamStart  = null;
    this._downPos       = null;
    this._deleteHeld    = false;   // true while pointer is down in delete mode
    this._deletedIds    = new Set(); // edges deleted this drag stroke

    this._setupUI();
    this._input = new InputHandler(this.canvas, this);
    this.renderer.resize();
    window.addEventListener('resize', () => this.renderer.resize());

    this._last = performance.now();
    requestAnimationFrame(t => this._loop(t));
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
      road:       'Tap to start a road, tap again to extend it. Double-tap end to stop.',
      light:      'Tap an intersection to place a traffic light.',
      stop:       'Tap an intersection to place a stop sign.',
      roundabout: 'Tap an intersection to convert it to a roundabout.',
      oneway:     'Tap a road to cycle: two-way → one-way → reverse → two-way.',
      delete:     'Tap or drag over roads/controls to delete them.',
    };
    document.getElementById('hint').textContent = hints[this.tool] || '';
  }

  _loop(now) {
    const dt = Math.min((now - this._last) / 1000, 0.1);
    this._last = now;

    if (!this.paused) this.traffic.update(dt);

    this.renderer.clear();
    this.renderer.applyCamera();
    if (this.gridSnap) this.renderer.drawGrid(GRID);
    this.renderer.drawEdges(this.graph.allEdges());
    this.renderer.drawNodes(this.graph.allNodes());
    this.renderer.drawCars(this.traffic.cars);

    if (this.tool === 'road' && this._drawStart) {
      const snap = this.gridSnap ? snapToGrid(this._mouseWorld.x, this._mouseWorld.y) : this._mouseWorld;
      this.renderer.drawPreviewEdge(this._drawStart, snap);
      this.renderer.drawPreviewNode(snap);
    }

    this._updateStats();
    requestAnimationFrame(t => this._loop(t));
  }

  _updateStats() {
    const alive = this.traffic.cars.filter(c => c.alive).length;
    document.getElementById('carCount').textContent = `Cars: ${alive}`;

    const score  = this.traffic.flowScore();
    const flowEl = document.getElementById('flowScore');
    if (score === null) { flowEl.textContent = 'Flow: –'; flowEl.style.color = '#aaa'; }
    else {
      flowEl.textContent  = `Flow: ${score}%`;
      flowEl.style.color  = score > 60 ? '#2ecc71' : score > 30 ? '#f39c12' : '#e74c3c';
    }

    const rushEl = document.getElementById('rushIndicator');
    if (this.traffic.isRushHour) {
      rushEl.textContent  = '🚨 Rush Hour!';
      rushEl.style.opacity = '1';
    } else {
      rushEl.textContent  = `Rush in ${this.traffic.timeUntilRush()}s`;
      rushEl.style.opacity = '0.45';
    }
  }

  screenToWorld(pos) {
    return {
      x: (pos.x - this.camera.x) / this.camera.zoom,
      y: (pos.y - this.camera.y) / this.camera.zoom,
    };
  }

  handleDown(pos) {
    this._downPos      = pos;
    this._isDragging   = false;
    this._dragStart    = pos;
    this._dragCamStart = { x: this.camera.x, y: this.camera.y };

    if (this.tool === 'delete') {
      this._deleteHeld = true;
      this._deletedIds.clear();
      // Immediate hit on press
      this._eraseAt(this.screenToWorld(pos));
    }
  }

  handleMove(pos) {
    this._mouseWorld = this.screenToWorld(pos);

    if (this._downPos) {
      const dx = pos.x - this._downPos.x;
      const dy = pos.y - this._downPos.y;
      if (Math.hypot(dx, dy) > 8) {
        if (this.tool !== 'road' || !this._drawStart) this._isDragging = true;
      }
      if (this._isDragging && this.tool !== 'delete' && this._dragStart) {
        this.camera.x = this._dragCamStart.x + (pos.x - this._dragStart.x);
        this.camera.y = this._dragCamStart.y + (pos.y - this._dragStart.y);
      }
    }

    // Drag-erase
    if (this._deleteHeld && this._downPos) {
      const dx = pos.x - this._downPos.x, dy = pos.y - this._downPos.y;
      if (Math.hypot(dx, dy) > 6) this._eraseAt(this._mouseWorld);
    }
  }

  handleUp(pos) {
    const wasDragging   = this._isDragging;
    this._isDragging    = false;
    this._downPos       = null;
    this._deleteHeld    = false;

    if (this.tool === 'delete') return; // deletion handled in handleDown/handleMove

    if (wasDragging) return;

    const world   = this.screenToWorld(pos);
    const snapped = this.gridSnap ? snapToGrid(world.x, world.y) : world;

    if      (this.tool === 'road')       this._handleRoadTap(snapped);
    else if (this.tool === 'light')      this._handleControlTap(world, 'light');
    else if (this.tool === 'stop')       this._handleControlTap(world, 'stop');
    else if (this.tool === 'roundabout') this._handleControlTap(world, 'roundabout');
    else if (this.tool === 'oneway')     this._handleOneWayTap(world);
  }

  cancelDown() {
    this._drawStart  = null;
    this._downPos    = null;
    this._isDragging = false;
    this._deleteHeld = false;
  }

  _handleRoadTap(pos) {
    if (!this._drawStart) {
      this._drawStart = { ...pos };
    } else {
      if (dist(this._drawStart, pos) < 10) { this._drawStart = null; return; }
      const a = this.graph.addNode(this._drawStart.x, this._drawStart.y);
      const b = this.graph.addNode(pos.x, pos.y);
      this.graph.addEdge(a, b);
      this._drawStart = { ...pos };
    }
  }

  _handleControlTap(world, type) {
    const hit = this.graph.hitTest(world.x, world.y, 22);
    if (!hit) return;
    const node = hit.type === 'node' ? hit.node : null;
    if (!node) return;
    if      (type === 'light')      this.traffic.addTrafficLight(node);
    else if (type === 'stop')       this.traffic.addStopSign(node);
    else if (type === 'roundabout') this.traffic.addRoundabout(node);
  }

  _handleOneWayTap(world) {
    const hit = this.graph.hitTest(world.x, world.y, 22);
    if (!hit || hit.type !== 'edge') return;
    this.graph.cycleOneWay(hit.edge);
    // Reroute cars whose path used this edge in the now-blocked direction
    this.traffic.cars.forEach(c => { if (c.edge?.id === hit.edge.id) c.alive = false; });
  }

  _eraseAt(world) {
    const hit = this.graph.hitTest(world.x, world.y, 22);
    if (!hit) return;
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

  pan(dx, dy) {
    this.camera.x += dx;
    this.camera.y += dy;
  }
}

window.addEventListener('DOMContentLoaded', () => { window.game = new Game(); });
