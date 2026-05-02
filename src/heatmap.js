const HEATMAP_CELL    = 28;    // world-space cell size in px
const HEAT_DEPOSIT    = 0.18;  // heat added per car per second
const HEAT_DECAY_BASE = 0.992; // per-frame decay base (frame-rate independent via dt)
const HEAT_MIN        = 0.008; // prune cells below this

// Multi-stop colour scale: cool → warm → hot
const HEAT_STOPS = [
  [0,    [50,   0, 160, 0   ]],
  [0.12, [0,   80, 220, 0.22]],
  [0.30, [0,  200,  90, 0.32]],
  [0.52, [220, 200,   0, 0.42]],
  [0.72, [255, 100,   0, 0.52]],
  [1.0,  [255,  15,   0, 0.62]],
];

function heatColor(t) {
  let lo = HEAT_STOPS[0], hi = HEAT_STOPS[HEAT_STOPS.length - 1];
  for (let i = 0; i < HEAT_STOPS.length - 1; i++) {
    if (t >= HEAT_STOPS[i][0] && t <= HEAT_STOPS[i + 1][0]) { lo = HEAT_STOPS[i]; hi = HEAT_STOPS[i + 1]; break; }
  }
  const f = lo[0] === hi[0] ? 0 : (t - lo[0]) / (hi[0] - lo[0]);
  const c = lo[1].map((v, i) => lerp(v, hi[1][i], f));
  return `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${c[3].toFixed(2)})`;
}

class HeatmapManager {
  constructor() {
    this.cells    = new Map(); // "cx,cy" → heat 0-1
    this.enabled  = false;
    this.cellSize = HEATMAP_CELL;
  }

  toggle() {
    this.enabled = !this.enabled;
    if (!this.enabled) this.cells.clear();
    return this.enabled;
  }

  update(cars, dt) {
    if (!this.enabled) return;

    // Deposit heat at each live car's cell
    for (const car of cars) {
      if (!car.alive) continue;
      const key = `${Math.floor(car.x / HEATMAP_CELL)},${Math.floor(car.y / HEATMAP_CELL)}`;
      this.cells.set(key, Math.min(1, (this.cells.get(key) || 0) + HEAT_DEPOSIT * dt));
    }

    // Frame-rate-independent decay — prune cold cells
    const decay = Math.pow(HEAT_DECAY_BASE, dt * 60);
    for (const [key, heat] of this.cells) {
      const next = heat * decay;
      if (next < HEAT_MIN) this.cells.delete(key);
      else                 this.cells.set(key, next);
    }
  }
}
