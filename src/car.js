const CAR_SPEED      = 80;
const SPEED_VARIANCE = 20;
const MIN_GAP        = 20;
const STOP_DISTANCE  = 26;
const STOP_HOLD      = 2.2;
const LANE_OFFSET    = 3;

const CAR_PALETTE = [
  '#e8e8e8','#f1c40f','#3498db','#e74c3c',
  '#9b59b6','#1abc9c','#e67e22','#2ecc71',
  '#c0392b','#2980b9','#f39c12','#8e44ad',
];

class Car {
  constructor(id, graph) {
    this.id       = id;
    this.graph    = graph;
    this.path     = null;
    this.pathIdx  = 0;
    this.edge     = null;
    this.t        = 0;
    this.x        = 0;
    this.y        = 0;
    this.angle    = 0;
    this.speed    = 0;
    this.maxSpeed = CAR_SPEED + (Math.random() - 0.5) * SPEED_VARIANCE;
    this.waiting  = 0;
    this.alive    = true;
    this.color    = CAR_PALETTE[Math.floor(Math.random() * CAR_PALETTE.length)];
    this.w        = 10 + Math.random() * 3;
    this.h        = 5  + Math.random() * 2;
    this._stopTimer  = 0;
    this._stopNodeId = -1;
    this.stuckTime   = 0;
    this.opacity     = 0;
    this._spawn();
  }

  _spawn() {
    const nodes = this.graph.allNodes();
    if (nodes.length < 2) { this.alive = false; return; }
    const start = nodes[Math.floor(Math.random() * nodes.length)];
    let goal, attempts = 0;
    do { goal = nodes[Math.floor(Math.random() * nodes.length)]; } while (goal.id === start.id && ++attempts < 10);
    const path = findPath(this.graph, start, goal);
    if (!path || path.length < 2) { this.alive = false; return; }
    this.path = path; this.pathIdx = 1;
    this.edge = this._edgeBetween(path[0], path[1]);
    this.t = 0; this.x = path[0].x; this.y = path[0].y;
    this._stopTimer = 0; this._stopNodeId = -1;
  }

  _edgeBetween(a, b) {
    return this.graph.allEdges().find(e =>
      (e.a.id === a.id && e.b.id === b.id) || (e.a.id === b.id && e.b.id === a.id)
    ) || null;
  }

  _forward() {
    if (!this.edge || !this.path) return { x: 1, y: 0 };
    const target = this.path[this.pathIdx], prev = this.path[this.pathIdx - 1];
    const dx = target.x - prev.x, dy = target.y - prev.y;
    const len = Math.hypot(dx, dy) || 1;
    return { x: dx / len, y: dy / len };
  }

  update(dt, allCars, zones = []) {
    if (!this.alive || !this.path || !this.edge) return;

    const targetNode    = this.path[this.pathIdx];
    const prevNode      = this.path[this.pathIdx - 1];
    const edgeLen       = this.edge.length || 1;
    const distRemaining = edgeLen * (1 - this.t);
    let mustStop = false;

    // Stop sign
    if (targetNode.control?.type === 'stop' && distRemaining < STOP_DISTANCE) {
      if (this._stopNodeId !== targetNode.id) { this._stopNodeId = targetNode.id; this._stopTimer = STOP_HOLD; }
      if (this._stopTimer > 0) { this._stopTimer -= dt; mustStop = true; }
    }
    // Traffic light
    if (targetNode.control?.type === 'light' && targetNode.control.state === 'red' && distRemaining < STOP_DISTANCE) mustStop = true;
    // Roundabout yield
    if (targetNode.control?.type === 'roundabout' && distRemaining < STOP_DISTANCE * 1.5) {
      for (const other of allCars) {
        if (other.id === this.id || !other.alive || !other.edge) continue;
        if (other.path[other.pathIdx]?.id !== targetNode.id || other.edge.id === this.edge.id) continue;
        if (other.edge.length * (1 - other.t) < distRemaining - 5) { mustStop = true; break; }
      }
    }
    // Car following
    for (const other of allCars) {
      if (other.id === this.id || !other.alive || !other.edge) continue;
      if (other.edge.id !== this.edge.id) continue;
      const sameDir = other.path[other.pathIdx]?.id === targetNode.id;
      if (sameDir && other.t > this.t && (other.t - this.t) * edgeLen < MIN_GAP) { mustStop = true; break; }
    }

    // Speed zone multiplier
    let speedMult = 1;
    for (const z of zones) {
      if (dist({ x: this.x, y: this.y }, z) < z.radius) {
        speedMult = z.type === 'slow' ? 0.38 : 1.65;
        break;
      }
    }

    const targetSpeed = mustStop ? 0 : this.maxSpeed * speedMult;
    this.speed = lerp(this.speed, targetSpeed, Math.min(1, dt * 6));
    if (this.speed < 2) { this.waiting += dt; this.stuckTime += dt; }
    else                  this.stuckTime = 0;
    if (this.opacity < 1) this.opacity = Math.min(1, this.opacity + dt * 3);

    this.t += (this.speed * dt) / edgeLen;

    const fwd  = this._forward();
    const perp = { x: -fwd.y, y: fwd.x };
    const prog = this.t * edgeLen;
    this.x = prevNode.x + fwd.x * prog + perp.x * LANE_OFFSET;
    this.y = prevNode.y + fwd.y * prog + perp.y * LANE_OFFSET;
    this.angle = Math.atan2(fwd.y, fwd.x);

    if (this.t >= 1) {
      this.t = 0; this.pathIdx++;
      if (this.pathIdx >= this.path.length) { this._spawn(); return; }
      this.edge = this._edgeBetween(this.path[this.pathIdx - 1], this.path[this.pathIdx]);
      if (!this.edge) this._spawn();
    }
  }
}
