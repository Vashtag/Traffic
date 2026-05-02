class AudioManager {
  constructor() {
    this._ctx        = null;
    this._master     = null;
    this._ambOsc     = null;
    this._ambGain    = null;
    this._ambFilter  = null;
    this.muted       = false;
    this._lastHorn   = 0;
    this._lastRush   = 0;
    this._prevGrade  = null;
  }

  // Call on first user gesture — browsers block AudioContext before that
  _boot() {
    if (this._ctx) return;
    this._ctx    = new (window.AudioContext || window.webkitAudioContext)();
    this._master = this._ctx.createGain();
    this._master.gain.value = 0.45;
    this._master.connect(this._ctx.destination);
    this._startAmbient();
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this._master) this._master.gain.setTargetAtTime(this.muted ? 0 : 0.45, this._ctx.currentTime, 0.1);
    return this.muted;
  }

  // ── Ambient engine hum ────────────────────────────────────────────────────
  _startAmbient() {
    const ctx = this._ctx;

    // Two slightly detuned oscillators for a richer hum
    this._ambOsc  = ctx.createOscillator();
    this._ambOsc2 = ctx.createOscillator();
    this._ambOsc.type  = 'sawtooth';
    this._ambOsc2.type = 'sawtooth';
    this._ambOsc.frequency.value  = 82;
    this._ambOsc2.frequency.value = 86;

    this._ambFilter = ctx.createBiquadFilter();
    this._ambFilter.type            = 'lowpass';
    this._ambFilter.frequency.value = 220;
    this._ambFilter.Q.value         = 1.2;

    this._ambGain = ctx.createGain();
    this._ambGain.gain.value = 0;

    this._ambOsc.connect(this._ambFilter);
    this._ambOsc2.connect(this._ambFilter);
    this._ambFilter.connect(this._ambGain);
    this._ambGain.connect(this._master);

    this._ambOsc.start();
    this._ambOsc2.start();
  }

  updateAmbient(pressure, carCount) {
    if (!this._ctx || !this._ambGain) return;
    const t          = this._ctx.currentTime;
    const targetGain = carCount > 0 ? 0.04 + pressure * 0.09 : 0;
    const targetFreq = 78 + pressure * 45;
    this._ambGain.gain.linearRampToValueAtTime(targetGain, t + 0.8);
    this._ambOsc.frequency.linearRampToValueAtTime(targetFreq, t + 0.8);
    this._ambOsc2.frequency.linearRampToValueAtTime(targetFreq + 4, t + 0.8);
  }

  // ── One-shot sounds ───────────────────────────────────────────────────────
  // Short snap when a road segment is placed
  playClick() {
    this._boot();
    if (this.muted) return;
    const ctx = this._ctx, t = ctx.currentTime;

    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type            = 'square';
    osc.frequency.value = 520;
    gain.gain.setValueAtTime(0.18, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
    osc.connect(gain); gain.connect(this._master);
    osc.start(t); osc.stop(t + 0.07);
  }

  // Softer thock when a control is placed
  playPlop() {
    this._boot();
    if (this.muted) return;
    const ctx = this._ctx, t = ctx.currentTime;

    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(280, t);
    osc.frequency.exponentialRampToValueAtTime(120, t + 0.12);
    gain.gain.setValueAtTime(0.22, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
    osc.connect(gain); gain.connect(this._master);
    osc.start(t); osc.stop(t + 0.14);
  }

  // Car horn — rate-limited, called with the stuck-car list each frame
  maybePlayHorn(cars) {
    this._boot();
    if (this.muted) return;
    const now = performance.now();
    if (now - this._lastHorn < 3200) return;
    const jammed = cars.find(c => c.alive && c.stuckTime > 9);
    if (!jammed) return;
    this._lastHorn = now;
    this._playHorn();
  }

  _playHorn() {
    const ctx = this._ctx, t = ctx.currentTime;
    const dur = 0.18 + Math.random() * 0.12;

    for (const freq of [420, 530]) {
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type            = 'sawtooth';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.08, t + 0.02);
      gain.gain.setValueAtTime(0.08, t + dur - 0.03);
      gain.gain.linearRampToValueAtTime(0, t + dur);
      osc.connect(gain); gain.connect(this._master);
      osc.start(t); osc.stop(t + dur);
    }
  }

  // Three rising beeps when rush hour starts
  playRushHour() {
    this._boot();
    if (this.muted) return;
    const now = performance.now();
    if (now - this._lastRush < 10000) return;
    this._lastRush = now;
    const ctx = this._ctx;
    [0, 0.18, 0.36].forEach((offset, i) => {
      const t    = ctx.currentTime + offset;
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type            = 'square';
      osc.frequency.value = 440 + i * 120;
      gain.gain.setValueAtTime(0.12, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
      osc.connect(gain); gain.connect(this._master);
      osc.start(t); osc.stop(t + 0.14);
    });
  }

  // Ascending two-note chime on grade improvement
  playGradeUp() {
    this._boot();
    if (this.muted) return;
    const ctx = this._ctx;
    [[0, 523], [0.14, 659]].forEach(([offset, freq]) => {
      const t    = ctx.currentTime + offset;
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type            = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.14, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
      osc.connect(gain); gain.connect(this._master);
      osc.start(t); osc.stop(t + 0.35);
    });
  }

  // Low descending thud on grade drop
  playGradeDown() {
    this._boot();
    if (this.muted) return;
    const ctx = this._ctx, t = ctx.currentTime;
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(220, t);
    osc.frequency.exponentialRampToValueAtTime(80, t + 0.22);
    gain.gain.setValueAtTime(0.18, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
    osc.connect(gain); gain.connect(this._master);
    osc.start(t); osc.stop(t + 0.25);
  }

  // Call each frame from game loop — handles grade change sounds + horn + rush
  tick(traffic) {
    const grade = traffic.grade();

    if (traffic.gradeChanged && this._prevGrade !== null) {
      const order = ['F','D','C','B','A'];
      const prev  = order.indexOf(this._prevGrade);
      const curr  = order.indexOf(grade);
      if (curr > prev) this.playGradeUp();
      else             this.playGradeDown();
    }
    this._prevGrade = grade;

    if (traffic.isRushHour && !this._wasRush) this.playRushHour();
    this._wasRush = traffic.isRushHour;

    this.maybePlayHorn(traffic.cars);
    this.updateAmbient(traffic.pressure, traffic.cars.filter(c => c.alive).length);
  }
}
