const LIGHT_CYCLE    = 8;
const TARGET_CARS    = 10;
const MAX_CARS       = 28;
const SPAWN_INTERVAL = 2.5;
const RUSH_START     = 45;
const RUSH_DURATION  = 40;
const RUSH_CYCLE     = 120;

class TrafficManager {
  constructor(graph) {
    this.graph  = graph;
    this.cars   = [];
    this.zones  = [];   // { id, x, y, radius, type: 'slow'|'fast' }
    this._nextCarId  = 0;
    this._nextZoneId = 0;
    this._spawnTimer = 0;
    this._elapsed    = 0;
    this.isRushHour  = false;
    this.smoothScore = 100;   // exponential moving average of flowScore
    this.pressure    = 0;     // 0 (calm) → 1 (gridlock), drives the pressure bar
    this._prevGrade  = 'A';
    this.gradeChanged = false;
  }

  update(dt) {
    this._elapsed += dt;
    this._updateRushHour();
    this._updateLights(dt);
    this._spawnCars(dt);
    this._updateCars(dt);
    this._updateCongestion();
    this._updateScore(dt);
  }

  _updateScore(dt) {
    const raw = this.flowScore();
    if (raw !== null) {
      // Slow EMA — takes ~30s to fully react so grade feels earned
      this.smoothScore = lerp(this.smoothScore, raw, clamp(dt * 0.04, 0, 1));
    }
    // Pressure: congestion load + rush hour adds a spike
    const basePressure = 1 - this.smoothScore / 100;
    const rushSpike    = this.isRushHour ? 0.22 : 0;
    this.pressure = clamp(lerp(this.pressure, basePressure + rushSpike, clamp(dt * 0.5, 0, 1)), 0, 1);

    const g = this.grade();
    this.gradeChanged = g !== this._prevGrade;
    this._prevGrade   = g;
  }

  _updateRushHour() {
    const phase = this._elapsed % RUSH_CYCLE;
    this.isRushHour = phase >= RUSH_START && phase < RUSH_START + RUSH_DURATION;
  }

  _updateLights(dt) {
    for (const node of this.graph.allNodes()) {
      if (node.control?.type !== 'light') continue;
      const ctrl = node.control;
      ctrl.timer = (ctrl.timer || 0) + dt;
      if (ctrl.timer >= LIGHT_CYCLE) {
        ctrl.timer = 0;
        ctrl.state = ctrl.state === 'green' ? 'red' : 'green';
      }
    }
  }

  _spawnCars(dt) {
    const nodes = this.graph.allNodes();
    if (nodes.length < 2) return;
    this._spawnTimer += dt;
    const interval = this.isRushHour ? SPAWN_INTERVAL * 0.5 : SPAWN_INTERVAL;
    if (this._spawnTimer < interval) return;
    this._spawnTimer = 0;
    this.cars = this.cars.filter(c => c.alive);
    const target = this.isRushHour ? MAX_CARS : TARGET_CARS;
    if (this.cars.length < target) {
      const car = new Car(this._nextCarId++, this.graph);
      if (car.alive) this.cars.push(car);
    }
  }

  _updateCars(dt) {
    for (const car of this.cars) car.update(dt, this.cars, this.zones);
  }

  _updateCongestion() {
    // O(cars + edges) — build count map in one pass instead of filtering per edge
    const counts = new Map();
    for (const car of this.cars) {
      if (car.alive && car.edge) counts.set(car.edge.id, (counts.get(car.edge.id) || 0) + 1);
    }
    for (const edge of this.graph.allEdges()) {
      const count    = counts.get(edge.id) || 0;
      const capacity = Math.max(1, (edge.length / MIN_GAP) * edge.lanes);
      edge.congestion = lerp(edge.congestion, clamp(count / capacity, 0, 1), 0.08);
    }
  }

  flowScore() {
    const edges = this.graph.allEdges();
    if (!edges.length) return null;
    const avg = edges.reduce((s, e) => s + e.congestion, 0) / edges.length;
    return Math.round((1 - avg) * 100);
  }

  grade() {
    const s = this.smoothScore;
    if (s >= 85) return 'A';
    if (s >= 70) return 'B';
    if (s >= 50) return 'C';
    if (s >= 30) return 'D';
    return 'F';
  }

  timeUntilRush() {
    const phase = this._elapsed % RUSH_CYCLE;
    if (this.isRushHour) return 0;
    return phase < RUSH_START ? Math.ceil(RUSH_START - phase) : Math.ceil(RUSH_CYCLE - phase + RUSH_START);
  }

  addTrafficLight(node) { node.control = { type: 'light', state: 'green', timer: 0 }; }
  addStopSign(node)     { node.control = { type: 'stop' }; }
  addRoundabout(node)   { node.control = { type: 'roundabout' }; }

  addZone(x, y, radius, type) {
    const zone = { id: this._nextZoneId++, x, y, radius, type };
    this.zones.push(zone);
    return zone;
  }

  removeZoneAt(x, y) {
    const idx = this.zones.findIndex(z => dist(z, {x,y}) < z.radius);
    if (idx !== -1) this.zones.splice(idx, 1);
  }
}
