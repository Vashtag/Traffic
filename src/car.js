const CAR_SPEED = 80;        // px/s on clear road
const MIN_GAP = 18;          // px between cars before braking
const STOP_DISTANCE = 22;    // px before intersection to stop for red/stop sign

class Car {
  constructor(id, graph) {
    this.id = id;
    this.graph = graph;
    this.path = null;        // array of nodes
    this.pathIdx = 0;        // current target node index
    this.edge = null;        // current edge travelling
    this.t = 0;              // 0-1 progress along current edge
    this.x = 0;
    this.y = 0;
    this.angle = 0;
    this.speed = 0;
    this.waiting = 0;        // seconds spent waiting (congestion metric)
    this.alive = true;
    this.color = '#e8e8e8';
    this._spawn();
  }

  _spawn() {
    const nodes = this.graph.allNodes();
    if (nodes.length < 2) { this.alive = false; return; }

    // Pick random start and goal
    const start = nodes[Math.floor(Math.random() * nodes.length)];
    let goal;
    do { goal = nodes[Math.floor(Math.random() * nodes.length)]; } while (goal.id === start.id);

    const path = findPath(this.graph, start, goal);
    if (!path || path.length < 2) { this.alive = false; return; }

    this.path = path;
    this.pathIdx = 1;
    this.edge = this._edgeBetween(path[0], path[1]);
    this.t = 0;
    this.x = path[0].x;
    this.y = path[0].y;
  }

  _edgeBetween(a, b) {
    return this.graph.allEdges().find(e =>
      (e.a.id === a.id && e.b.id === b.id) || (e.a.id === b.id && e.b.id === a.id)
    ) || null;
  }

  _forward() {
    if (!this.edge || !this.path) return { x: 1, y: 0 };
    const target = this.path[this.pathIdx];
    const prev = this.path[this.pathIdx - 1];
    // Direction from prev to target
    const dx = target.x - prev.x, dy = target.y - prev.y;
    const len = Math.hypot(dx, dy) || 1;
    return { x: dx/len, y: dy/len };
  }

  update(dt, allCars) {
    if (!this.alive || !this.path || !this.edge) return;

    const targetNode = this.path[this.pathIdx];
    const prevNode = this.path[this.pathIdx - 1];
    const edgeLen = this.edge.length || 1;

    // Distance remaining on this edge
    const distRemaining = edgeLen * (1 - this.t);

    // Check for stop control at target node
    let mustStop = false;
    if (targetNode.control) {
      const ctrl = targetNode.control;
      if (ctrl.type === 'stop' && distRemaining < STOP_DISTANCE) {
        // Stop briefly if others haven't cleared
        mustStop = ctrl.stopTimer > 0;
      }
      if (ctrl.type === 'light') {
        mustStop = ctrl.state === 'red' && distRemaining < STOP_DISTANCE;
      }
    }

    // Check car ahead on same edge
    let carAhead = false;
    for (const other of allCars) {
      if (other.id === this.id || !other.alive) continue;
      if (other.edge && other.edge.id === this.edge.id) {
        const sameDir = (other.path[other.pathIdx]?.id === targetNode.id);
        if (sameDir && other.t > this.t) {
          const gap = (other.t - this.t) * edgeLen;
          if (gap < MIN_GAP) { carAhead = true; break; }
        }
      }
    }

    const baseSpeed = CAR_SPEED;
    let targetSpeed = (mustStop || carAhead) ? 0 : baseSpeed;
    this.speed = lerp(this.speed, targetSpeed, Math.min(1, dt * 5));

    if (this.speed < 1) {
      this.waiting += dt;
    }

    this.t += (this.speed * dt) / edgeLen;

    // Interpolate position
    const fwd = this._forward();
    const base = prevNode;
    this.x = base.x + fwd.x * this.t * edgeLen;
    this.y = base.y + fwd.y * this.t * edgeLen;
    this.angle = Math.atan2(fwd.y, fwd.x);

    // Advance to next segment
    if (this.t >= 1) {
      this.t = 0;
      this.pathIdx++;
      if (this.pathIdx >= this.path.length) {
        // Reached destination — respawn
        this._spawn();
        return;
      }
      this.edge = this._edgeBetween(this.path[this.pathIdx - 1], this.path[this.pathIdx]);
      if (!this.edge) { this._spawn(); }
    }
  }
}
