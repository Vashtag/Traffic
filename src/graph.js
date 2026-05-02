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
    // oneWay: null = bidirectional, 'ab' = a→b only, 'ba' = b→a only
    const edge = { id: this._nextEdgeId++, a: nodeA, b: nodeB, length, congestion: 0, oneWay: null };
    this.edges.push(edge);
    return edge;
  }

  cycleOneWay(edge) {
    if (!edge.oneWay)        edge.oneWay = 'ab';
    else if (edge.oneWay === 'ab') edge.oneWay = 'ba';
    else                     edge.oneWay = null;
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
    // Keep nodes that are still connected or are roundabout centers
    this.nodes = this.nodes.filter(n => used.has(n.id));
  }

  // Returns traversable neighbors respecting one-way direction
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
}
