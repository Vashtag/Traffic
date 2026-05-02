// Road network as a graph of nodes (intersections/endpoints) and edges (road segments)
class RoadGraph {
  constructor() {
    this.nodes = [];   // { id, x, y, control?: { light, stop } }
    this.edges = [];   // { id, a, b, congestion: 0-1, vehicles: [] }
    this._nextNodeId = 0;
    this._nextEdgeId = 0;
  }

  addNode(x, y) {
    // Reuse existing node if very close
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
    const edge = { id: this._nextEdgeId++, a: nodeA, b: nodeB, length, congestion: 0, vehicles: [] };
    this.edges.push(edge);
    return edge;
  }

  removeEdge(edge) {
    this.edges = this.edges.filter(e => e.id !== edge.id);
    // Clean up orphan nodes (connected to nothing)
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
      if (e.a.id === node.id) result.push({ node: e.b, edge: e });
      else if (e.b.id === node.id) result.push({ node: e.a, edge: e });
    }
    return result;
  }

  // Find edge or node near world coords within radius
  hitTest(x, y, radius = 16) {
    // Check nodes first
    for (const n of this.nodes) {
      if (dist(n, {x,y}) < radius) return { type: 'node', node: n };
    }
    // Check edges
    for (const e of this.edges) {
      const cp = closestPointOnSegment({x,y}, e.a, e.b);
      if (dist(cp, {x,y}) < radius) return { type: 'edge', edge: e };
    }
    return null;
  }

  allNodes() { return this.nodes; }
  allEdges() { return this.edges; }
}
