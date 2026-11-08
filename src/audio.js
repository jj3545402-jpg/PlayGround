// Procedural sound design — no external audio assets, everything is synthesized.
export class SoundEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.musicGain = null;
    this.sfxGain = null;
    this.enabled = true;
    this.rainGain = null;
    this.started = false;
    this.step = 0;
    this.nextBeat = 0;
    this._timer = null;
    this._noise = null;
  }

  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.72;
    this.master.connect(this.ctx.destination);
    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = 0.3;
    this.musicGain.connect(this.master);
    this.sfxGain = this.ctx.createGain();
    this.sfxGain.gain.value = 0.85;
    this.sfxGain.connect(this.master);
    this._noise = this._makeNoise(2.5);
    this._startAmbience();
  }

  async resume() {
    this.init();
    if (this.ctx?.state === 'suspended') await this.ctx.resume();
    if (!this.started && this.ctx) {
      this.started = true;
      this.nextBeat = this.ctx.currentTime + 0.1;
      this._timer = setInterval(() => this._scheduleMusic(), 90);
    }
  }

  setEnabled(on) {
    this.enabled = on;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(on ? 0.72 : 0, this.ctx.currentTime, 0.04);
    }
  }

  _makeNoise(seconds = 2) {
    const length = Math.floor(this.ctx.sampleRate * seconds);
    const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < length; i++) {
      const white = Math.random() * 2 - 1;
      last = last * 0.72 + white * 0.28;
      data[i] = last;
    }
    return buffer;
  }

  _startAmbience() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    // Storm wash — filtered noise bed.
    const rain = ctx.createBufferSource();
    rain.buffer = this._noise;
    rain.loop = true;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 1400;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 7200;
    this.rainGain = ctx.createGain();
    this.rainGain.gain.value = 0.022;
    rain.connect(hp).connect(lp).connect(this.rainGain).connect(this.musicGain);
    rain.start();
    // Low tension drone.
    const droneGain = ctx.createGain();
    droneGain.gain.value = 0.035;
    droneGain.connect(this.musicGain);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 260;
    filter.Q.value = 3;
    filter.connect(droneGain);
    [55, 82.41, 110].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      osc.type = i === 2 ? 'triangle' : 'sawtooth';
      osc.frequency.value = freq * (i === 1 ? 1.004 : 1.001);
      const g = ctx.createGain();
      g.gain.value = i === 2 ? 0.35 : 0.2;
      osc.connect(g).connect(filter);
      osc.start();
    });
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.08;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 100;
    lfo.connect(lfoGain).connect(filter.frequency);
    lfo.start();
  }

  _scheduleMusic() {
    if (!this.ctx || this.ctx.state !== 'running' || !this.enabled) return;
    const ctx = this.ctx;
    const bpm = 88;
    const beat = 60 / bpm;
    while (this.nextBeat < ctx.currentTime + 0.22) {
      this._playStep(this.step, this.nextBeat);
      this.nextBeat += beat / 2;
      this.step = (this.step + 1) % 16;
    }
  }

  _playStep(step, time) {
    const ctx = this.ctx;
    const s = step % 16;
    if (s === 0 || s === 6 || s === 10) this._taiko(time, s === 0 ? 0.4 : 0.19);
    if (s === 4 || s === 12) this._taiko(time, 0.14, 1.5);
    if (s % 4 === 2) this._hat(time);
    if ([0, 3, 8, 11].includes(s)) {
      const seq = [110, 130.81, 98, 123.47];
      this._bass(time, seq[Math.floor(s / 4)] * 0.5, step);
    }
    if (s === 0 && Math.floor(this.step / 16) % 4 === 1) {
      this._shimmer(time, 440);
    }
  }

  _taiko(t = this.ctx.currentTime, gain = 0.3, pitch = 1) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(112 * pitch, t);
    osc.frequency.exponentialRampToValueAtTime(44 * pitch, t + 0.16);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    osc.connect(g).connect(this.musicGain);
    osc.start(t);
    osc.stop(t + 0.32);
    const noise = ctx.createBufferSource();
    noise.buffer = this._noise;
    const nf = ctx.createBiquadFilter();
    nf.type = 'lowpass';
    nf.frequency.value = 380;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(gain * 0.35, t);
    ng.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
    noise.connect(nf).connect(ng).connect(this.musicGain);
    noise.start(t);
    noise.stop(t + 0.1);
  }

  _hat(t) {
    const ctx = this.ctx;
    const noise = ctx.createBufferSource();
    noise.buffer = this._noise;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 8400;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.022, t);
    g.gain.exponentialRampToValueAtTime(0.0005, t + 0.035);
    noise.connect(hp).connect(g).connect(this.musicGain);
    noise.start(t, Math.random());
    noise.stop(t + 0.04);
  }

  _bass(t, freq, step) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = freq;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 320;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.06, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.33);
    osc.connect(lp).connect(g).connect(this.musicGain);
    osc.start(t);
    osc.stop(t + 0.35);
  }

  _shimmer(t, freq) {
    const ctx = this.ctx;
    for (let i = 0; i < 3; i++) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq * (i + 1) * 1.5;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.012, t + 0.25);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 2.2);
      osc.connect(g).connect(this.musicGain);
      osc.start(t);
      osc.stop(t + 2.3);
    }
  }

  // ── SFX ──────────────────────────────────────────────────────────
  whoosh(pan = 0) {
    if (!this.ctx || !this.enabled) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const noise = ctx.createBufferSource();
    noise.buffer = this._noise;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 1.6;
    bp.frequency.setValueAtTime(480, t);
    bp.frequency.exponentialRampToValueAtTime(1800, t + 0.14);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.08, t + 0.025);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    const p = ctx.createStereoPanner();
    p.pan.value = pan;
    noise.connect(bp).connect(g).connect(p).connect(this.sfxGain);
    noise.start(t);
    noise.stop(t + 0.24);
  }

  hit(power = 1, blocked = false) {
    if (!this.ctx || !this.enabled) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const noise = ctx.createBufferSource();
    noise.buffer = this._noise;
    const bp = ctx.createBiquadFilter();
    bp.type = blocked ? 'bandpass' : 'lowpass';
    bp.frequency.value = blocked ? 2200 : 520 + power * 300;
    bp.Q.value = blocked ? 4 : 0.8;
    const g = ctx.createGain();
    g.gain.setValueAtTime(blocked ? 0.16 : 0.28 + power * 0.08, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + (blocked ? 0.18 : 0.34));
    noise.connect(bp).connect(g).connect(this.sfxGain);
    noise.start(t);
    noise.stop(t + 0.36);
    if (!blocked) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(94, t);
      osc.frequency.exponentialRampToValueAtTime(32, t + 0.22);
      const og = ctx.createGain();
      og.gain.setValueAtTime(0.4 + power * 0.12, t);
      og.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
      osc.connect(og).connect(this.sfxGain);
      osc.start(t);
      osc.stop(t + 0.32);
    }
  }

  block() {
    if (!this.ctx || !this.enabled) return;
    const ctx = this.ctx, t = ctx.currentTime;
    [1320, 1980, 2640].forEach((f, i) => {
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = f;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.05 / (i + 1), t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
      osc.connect(g).connect(this.sfxGain);
      osc.start(t);
      osc.stop(t + 0.18);
    });
  }

  charge(duration = 0.45, pitch = 220) {
    if (!this.ctx || !this.enabled) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(pitch, t);
    osc.frequency.exponentialRampToValueAtTime(pitch * 3.8, t + duration);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(400, t);
    lp.frequency.exponentialRampToValueAtTime(3600, t + duration);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.09, t + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration + 0.08);
    osc.connect(lp).connect(g).connect(this.sfxGain);
    osc.start(t);
    osc.stop(t + duration + 0.1);
  }

  zap() {
    if (!this.ctx || !this.enabled) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.setValueAtTime(880, t);
    osc.frequency.exponentialRampToValueAtTime(110, t + 0.24);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.12, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.27);
    osc.connect(g).connect(this.sfxGain);
    osc.start(t);
    osc.stop(t + 0.28);
    this.hit(1.4);
  }

  thunder() {
    if (!this.ctx || !this.enabled) return;
    const ctx = this.ctx, t = ctx.currentTime + 0.3;
    const noise = ctx.createBufferSource();
    noise.buffer = this._noise;
    noise.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 240;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.22, t + 0.06);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 2.4);
    noise.connect(lp).connect(g).connect(this.musicGain);
    noise.start(t);
    noise.stop(t + 2.5);
  }

  bell() {
    if (!this.ctx || !this.enabled) return;
    const ctx = this.ctx, t = ctx.currentTime;
    [660, 990, 1320].forEach((f, i) => {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = f;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.07 / (i + 1), t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 1.2);
      osc.connect(g).connect(this.sfxGain);
      osc.start(t);
      osc.stop(t + 1.25);
    });
  }

  uiClick() {
    if (!this.ctx || !this.enabled) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = 720;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.05, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
    osc.connect(g).connect(this.sfxGain);
    osc.start(t);
    osc.stop(t + 0.09);
  }

  ko() {
    if (!this.ctx || !this.enabled) return;
    this.charge(0.9, 90);
    const ctx = this.ctx, t = ctx.currentTime + 0.1;
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(110, t);
    osc.frequency.exponentialRampToValueAtTime(26, t + 1.1);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.22, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.3);
    osc.connect(g).connect(this.sfxGain);
    osc.start(t);
    osc.stop(t + 1.35);
    this.thunder();
  }
}
