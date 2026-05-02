// A* pathfinding on RoadGraph
// Returns array of nodes from start to goal, or null if no path
function findPath(graph, startNode, goalNode) {
  if (startNode.id === goalNode.id) return [startNode];

  const open = new Map(); // id -> { node, g, f, parent }
  const closed = new Set();

  const h = n => dist(n, goalNode);
  open.set(startNode.id, { node: startNode, g: 0, f: h(startNode), parent: null });

  while (open.size > 0) {
    // Pick lowest f
    let current = null;
    for (const entry of open.values()) {
      if (!current || entry.f < current.f) current = entry;
    }

    if (current.node.id === goalNode.id) {
      // Reconstruct path
      const path = [];
      let cur = current;
      while (cur) { path.unshift(cur.node); cur = cur.parent; }
      return path;
    }

    open.delete(current.node.id);
    closed.add(current.node.id);

    for (const { node: neighbor, edge } of graph.neighbors(current.node)) {
      if (closed.has(neighbor.id)) continue;
      // Cost includes edge length and congestion penalty
      const congestionPenalty = 1 + edge.congestion * 3;
      const g = current.g + edge.length * congestionPenalty;
      const existing = open.get(neighbor.id);
      if (!existing || g < existing.g) {
        open.set(neighbor.id, { node: neighbor, g, f: g + h(neighbor), parent: current });
      }
    }
  }
  return null; // no path
}
