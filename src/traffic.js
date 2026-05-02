const LIGHT_CYCLE = 8;       // seconds per phase
const STOP_HOLD = 2;         // seconds a stop sign holds cars
const TARGET_CARS = 12;      // sandbox car count
const SPAWN_INTERVAL = 3;    // seconds between new car attempts
const CONGESTION_DECAY = 0.3;// how fast congestion fades

class TrafficManager {
  constructor(graph) {
    this.graph = graph;
    this.cars = [];
    this._nextCarId = 0;
    this._spawnTimer = 0;
    this._lightTimer = 0;
  }

  update(dt) {
    this._updateLights(dt);
    this._updateStopSigns(dt);
    this._spawnCars(dt);
    this._updateCars(dt);
    this._updateCongestion();
  }

  _updateLights(dt) {
    this._lightTimer += dt;
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

  _updateStopSigns(dt) {
    for (const node of this.graph.allNodes()) {
      if (node.control?.type !== 'stop') continue;
      if (node.control.stopTimer > 0) node.control.stopTimer -= dt;
    }
  }

  _spawnCars(dt) {
    const nodes = this.graph.allNodes();
    if (nodes.length < 2) return;

    this._spawnTimer += dt;
    if (this._spawnTimer < SPAWN_INTERVAL) return;
    this._spawnTimer = 0;

    // Remove dead cars
    this.cars = this.cars.filter(c => c.alive);

    if (this.cars.length < TARGET_CARS) {
      const car = new Car(this._nextCarId++, this.graph);
      if (car.alive) this.cars.push(car);
    }
  }

  _updateCars(dt) {
    // Track which cars are on which edges for proximity checks
    for (const car of this.cars) {
      car.update(dt, this.cars);
    }
  }

  _updateCongestion() {
    // Reset then recompute
    for (const edge of this.graph.allEdges()) {
      const carsOnEdge = this.cars.filter(c => c.edge?.id === edge.id).length;
      const capacity = Math.max(1, edge.length / MIN_GAP);
      const load = carsOnEdge / capacity;
      // Smooth towards new value
      edge.congestion = lerp(edge.congestion, clamp(load, 0, 1), 0.1);
    }
  }

  flowScore() {
    const edges = this.graph.allEdges();
    if (edges.length === 0) return null;
    const avg = edges.reduce((s, e) => s + e.congestion, 0) / edges.length;
    return Math.round((1 - avg) * 100);
  }

  addTrafficLight(node) {
    node.control = { type: 'light', state: 'green', timer: 0 };
  }

  addStopSign(node) {
    node.control = { type: 'stop', stopTimer: 0 };
  }
}
