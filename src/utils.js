const GRID = 40;

function snapToGrid(x, y) {
  return { x: Math.round(x / GRID) * GRID, y: Math.round(y / GRID) * GRID };
}

function dist(a, b) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function lerp(a, b, t) { return a + (b - a) * t; }

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

function lerpColor(a, b, t) {
  const parse = hex => [parseInt(hex.slice(1,3),16), parseInt(hex.slice(3,5),16), parseInt(hex.slice(5,7),16)];
  const [ar,ag,ab] = parse(a);
  const [br,bg,bb] = parse(b);
  const r = Math.round(lerp(ar,br,t));
  const g = Math.round(lerp(ag,bg,t));
  const bl2 = Math.round(lerp(ab,bb,t));
  return `rgb(${r},${g},${bl2})`;
}

// Point on segment closest to p
function closestPointOnSegment(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len2 = dx*dx + dy*dy;
  if (len2 === 0) return { ...a, t: 0 };
  const t = clamp(((p.x-a.x)*dx + (p.y-a.y)*dy) / len2, 0, 1);
  return { x: a.x + t*dx, y: a.y + t*dy, t };
}
