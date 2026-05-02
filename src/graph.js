class RoadGraph {
  constructor() {
    this.nodes = [];
    this.edges = [];
    this._nextNodeId = 0;
    this._nextEdgeId = 0;
  }

  addNode(x, y) {
    const existing = this.nodes.find(n => dist(n, {x,y}) < 12);
    if (existing) return existing;
    const node = { id: this._nextNodeId++, x, y, control: null };
    this.nodes.push(node);
    return node;
  }

  addEdge(nodeA, nodeB) {
    if (nodeA.id === nodeB.id) return null;
    const existing = this.edges.find(e =>
      (e.a.id === nodeA.id && e.b.id === nodeB.id) ||
      (e.a.id === nodeB.id && e.b.id === nodeA.id)
    );
    if (existing) return existing;
    const length = dist(nodeA, nodeB);
    const edge = { id: this._nextEdgeId++, a: nodeA, b: nodeB, length, congestion: 0, oneWay: null, lanes: 1 };
    this.edges.push(edge);
    return edge;
  }

  cycleOneWay(edge) {
    if (!edge.oneWay)            edge.oneWay = 'ab';
    else if (edge.oneWay === 'ab') edge.oneWay = 'ba';
    else                         edge.oneWay = null;
  }

  upgradeLanes(edge) {
    edge.lanes = edge.lanes === 1 ? 2 : 1;
  }

  removeEdge(edge) {
    this.edges = this.edges.filter(e => e.id !== edge.id);
    this._pruneOrphans();
  }

  removeControl(nodeId) {
    const node = this.nodes.find(n => n.id === nodeId);
    if (node) node.control = null;
  }

  _pruneOrphans() {
    const used = new Set();
    this.edges.forEach(e => { used.add(e.a.id); used.add(e.b.id); });
    this.nodes = this.nodes.filter(n => used.has(n.id));
  }

  neighbors(node) {
    const result = [];
    for (const e of this.edges) {
      if (e.a.id === node.id && e.oneWay !== 'ba') result.push({ node: e.b, edge: e });
      if (e.b.id === node.id && e.oneWay !== 'ab') result.push({ node: e.a, edge: e });
    }
    return result;
  }

  hitTest(x, y, radius = 18) {
    for (const n of this.nodes) {
      if (dist(n, {x,y}) < radius) return { type: 'node', node: n };
    }
    for (const e of this.edges) {
      const cp = closestPointOnSegment({x,y}, e.a, e.b);
      if (dist(cp, {x,y}) < radius) return { type: 'edge', edge: e };
    }
    return null;
  }

  allNodes() { return this.nodes; }
  allEdges() { return this.edges; }

  // Bypass snap/dedup checks — used only by the save/load system
  loadData({ nodes, edges }) {
    this.nodes = [];
    this.edges = [];
    const map  = {};

    for (const [id, x, y] of nodes) {
      const node = { id, x, y, control: null };
      this.nodes.push(node);
      map[id] = node;
    }
    this._nextNodeId = nodes.length ? Math.max(...nodes.map(n => n[0])) + 1 : 0;

    for (const [id, aId, bId, ow, lanes] of edges) {
      const a = map[aId], b = map[bId];
      if (!a || !b) continue;
      const edge = { id, a, b, length: dist(a, b), congestion: 0,
        oneWay: ow === 1 ? 'ab' : ow === 2 ? 'ba' : null,
        lanes:  lanes || 1 };
      this.edges.push(edge);
    }
    this._nextEdgeId = edges.length ? Math.max(...edges.map(e => e[0])) + 1 : 0;

    return map; // node id → node object, needed to restore controls
  }
}
