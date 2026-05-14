// Weighted pool — clear is most common, snow is rare
const WEATHER_POOL = [
  'clear','clear','clear','clear',
  'rain','rain','rain',
  'storm','storm',
  'fog',
  'snow',
];
const WEATHER_DURATION = {
  clear: [80,  160],
  rain:  [40,   80],
  storm: [25,   55],
  fog:   [35,   70],
  snow:  [50,  110],
};
const WEATHER_SPEED = { clear:1.00, rain:0.78, storm:0.52, fog:0.88, snow:0.68 };
const WEATHER_ICON  = { clear:'☀️', rain:'🌧️', storm:'⛈️', fog:'🌫️', snow:'❄️' };

class WeatherManager {
  constructor() {
    this.state      = 'clear';
    this.stateTimer = 90 + Math.random() * 60; // delay first change 90–150 s
    this.particles  = [];
    this.icePatches = [];
    this._needsInit = true;
    this._sw = 0; this._sh = 0;
  }

  // ── public API ──────────────────────────────────────────────────────────────
  speedMult() { return WEATHER_SPEED[this.state] ?? 1; }

  fogAlpha() {
    if (this.state === 'fog')   return 0.48;
    if (this.state === 'storm') return 0.18;
    return 0;
  }
  rainTint() {
    if (this.state === 'storm') return 0.20;
    if (this.state === 'rain')  return 0.09;
    return 0;
  }
  icon() { return WEATHER_ICON[this.state] ?? '☀️'; }

  update(dt, screenW, screenH, edges) {
    if (this._needsInit || screenW !== this._sw || screenH !== this._sh) {
      this._sw = screenW; this._sh = screenH;
      this._initParticles();
      this._needsInit = false;
    }

    this.stateTimer -= dt;
    if (this.stateTimer <= 0) {
      this._transition(edges);
    }

    // Advance particles
    for (const p of this.particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.y > screenH + 12 || p.x < -25 || p.x > screenW + 25) {
        Object.assign(p, this._newParticle(false));
      }
    }
  }

  // ── internal ────────────────────────────────────────────────────────────────
  _transition(edges) {
    const pool = WEATHER_POOL.filter(s => s !== this.state);
    this.state = pool[Math.floor(Math.random() * pool.length)];
    const [lo, hi] = WEATHER_DURATION[this.state];
    this.stateTimer = lo + Math.random() * (hi - lo);
    this._initParticles();
    if (this.state !== 'snow') this.icePatches = [];
    if (this.state === 'snow') this._placeIce(edges);
  }

  _initParticles() {
    const counts = { rain: 110, storm: 230, snow: 80 };
    const n = counts[this.state] ?? 0;
    this.particles = [];
    for (let i = 0; i < n; i++) this.particles.push(this._newParticle(true));
  }

  _newParticle(scatter = false) {
    const isSnow  = this.state === 'snow';
    const isStorm = this.state === 'storm';
    return {
      x:  Math.random() * (this._sw || 800),
      y:  scatter ? Math.random() * (this._sh || 600) : -8,
      vx: isSnow ? (Math.random() - 0.5) * 18
                 : (isStorm ? -38 : -20) - Math.random() * 10,
      vy: isSnow ? 28 + Math.random() * 22
                 : (isStorm ? 390 : 215) + Math.random() * 120,
      size:  isSnow ? 1.5 + Math.random() * 2 : 0.7 + Math.random() * 0.6,
      alpha: isSnow ? 0.55 + Math.random() * 0.35 : 0.22 + Math.random() * 0.35,
    };
  }

  _placeIce(edges) {
    this.icePatches = [];
    if (!edges?.length) return;
    const count = 3 + Math.floor(Math.random() * 5);
    for (let i = 0; i < count; i++) {
      const e = edges[Math.floor(Math.random() * edges.length)];
      const t = 0.15 + Math.random() * 0.7;
      this.icePatches.push({
        x:      e.a.x + (e.b.x - e.a.x) * t,
        y:      e.a.y + (e.b.y - e.a.y) * t,
        radius: 18 + Math.random() * 14,
      });
    }
  }
}
