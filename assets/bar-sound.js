/* Live-bar sound for City Beer Station.
   Band: a lively vina-house style loop synthesised with Web Audio (no audio files, no licence worries).
   Crowd: continuous murmur plus random clinks, chair scrapes and cheers, so the yard sounds busy.
   Both are plain gain stages; the MusicPlayer and the pages own volume/ducking. */
(function (global) {
  'use strict';

  const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
  const buffers = new WeakMap();

  function noiseBuffer(ctx, brown) {
    let set = buffers.get(ctx);
    if (!set) buffers.set(ctx, set = {});
    const key = brown ? 'brown' : 'white';
    if (set[key]) return set[key];
    const len = Math.ceil(ctx.sampleRate * 2);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      if (brown) { last = (last + 0.02 * w) / 1.02; d[i] = Math.max(-1, Math.min(1, last * 3.4)); }
      else d[i] = w;
    }
    return (set[key] = buf);
  }

  function panner(ctx, pan) {
    if (!ctx.createStereoPanner) return null;
    const p = ctx.createStereoPanner();
    p.pan.value = pan;
    return p;
  }

  /* ------------------------------------------------------------- band */
  const BPM = 118;
  const STEP = 60 / BPM / 4;
  const PROG = [
    { chord: [57, 60, 64], bass: 45 },   // Am7
    { chord: [57, 60, 65], bass: 41 },   // Fmaj7
    { chord: [55, 60, 64], bass: 48 },   // Cmaj7
    { chord: [55, 59, 62], bass: 43 },   // G6
  ];
  const PHRASES = [
    [[0, 76, 2], [2, 72, 2], [4, 74, 2], [6, 72, 1], [8, 69, 3], [12, 72, 2], [14, 76, 2]],
    [[0, 72, 2], [2, 69, 2], [4, 72, 1], [6, 74, 2], [8, 76, 4], [13, 74, 1], [14, 72, 2]],
    [[0, 79, 2], [2, 76, 2], [4, 72, 2], [6, 76, 1], [8, 79, 2], [10, 76, 2], [12, 72, 4]],
    [[0, 74, 2], [2, 71, 2], [4, 74, 1], [6, 76, 2], [8, 79, 3], [12, 76, 2], [14, 74, 2]],
  ];
  const BASS = [[0, 0, 2], [3, 0, 2], [6, 7, 2], [8, 0, 2], [11, 12, 1], [12, 7, 2], [14, 7, 2]];

  class Band {
    constructor(ctx, destination) {
      this.ctx = ctx;
      this.mix = ctx.createGain();
      this.mix.gain.value = 1.15;
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -18; comp.knee.value = 18; comp.ratio.value = 3;
      comp.attack.value = .004; comp.release.value = .18;
      this.out = ctx.createGain();
      this.out.gain.value = 1;
      this.mix.connect(comp); comp.connect(this.out); this.out.connect(destination);

      const delay = ctx.createDelay(.8);
      delay.delayTime.value = STEP * 3;
      const fb = ctx.createGain(); fb.gain.value = .28;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1700;
      delay.connect(lp); lp.connect(fb); fb.connect(delay); delay.connect(this.mix);
      this.delaySend = ctx.createGain(); this.delaySend.gain.value = .34;
      this.delaySend.connect(delay);
      this._started = false;
    }

    start() {
      if (this._started) return;
      this._started = true;
      this._step = 0;
      this._next = this.ctx.currentTime + .12;
      this._timer = setInterval(() => this._tick(), 180);
      this._tick();
    }

    stop() {
      clearInterval(this._timer);
      this._started = false;
      try { this.out.disconnect(); } catch {}
    }

    _tick() {
      const ahead = this.ctx.currentTime + .45;
      while (this._next < ahead) {
        this._at(this._step, this._next);
        this._next += STEP;
        this._step++;
      }
    }

    _at(step, t) {
      const s = step % 16, bar = Math.floor(step / 16), b8 = bar % 8, prog = PROG[b8 % 4];

      if (s % 4 === 0) this._kick(t, s === 0 ? .95 : .78);
      if (s === 4 || s === 12) this._clap(t);
      if (s % 4 === 0) this._hat(t, .035, .04, 7200);
      if (s === 2 || s === 6 || s === 10 || s === 14) this._hat(t, .07, .055, 6800);
      if (s % 2 === 1) this._hat(t, .015, .03, 8200);

      for (const [at, off, dur] of BASS) if (at === s) this._bass(t, prog.bass + off, dur * STEP - .02);
      if (s === 2 || s === 6 || s === 10 || s === 14) this._stab(t, prog.chord, .1);

      for (const [at, midi, len] of PHRASES[b8 % 4]) if (at === s) this._lead(t, midi, len * STEP);

      if (b8 % 4 === 3 && (s === 13 || s === 15)) this._tom(t, s === 13 ? 190 : 140);
      if (b8 === 7 && s === 15) { this._bass(t, prog.bass + 12, .12); this._stab(t + STEP * .5, prog.chord.map(n => n + 12), .12); }
    }

    _kick(t, v) {
      const ctx = this.ctx;
      const o = ctx.createOscillator(); o.type = 'sine';
      o.frequency.setValueAtTime(155, t);
      o.frequency.exponentialRampToValueAtTime(44, t + .13);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(v, t + .004);
      g.gain.exponentialRampToValueAtTime(.001, t + .3);
      o.connect(g); g.connect(this.mix); o.start(t); o.stop(t + .32);
    }

    _tom(t, f) {
      const ctx = this.ctx;
      const o = ctx.createOscillator(); o.type = 'sine';
      o.frequency.setValueAtTime(f, t);
      o.frequency.exponentialRampToValueAtTime(f * .55, t + .18);
      const g = ctx.createGain();
      g.gain.setValueAtTime(.16, t);
      g.gain.exponentialRampToValueAtTime(.001, t + .22);
      o.connect(g); g.connect(this.mix); o.start(t); o.stop(t + .24);
    }

    _clap(t) {
      this._hit(t, 1500, 1.1, .075, .09, 0);
      this._hit(t + .014, 2100, 1.3, .05, .07, .08);
    }

    _hat(t, gain, decay, freq) {
      this._hit(t, freq, .9, gain, decay, (Math.random() - .5) * .3, 'highpass');
    }

    _hit(t, freq, q, gain, decay, pan = 0, type = 'bandpass') {
      const ctx = this.ctx;
      const src = ctx.createBufferSource(); src.buffer = noiseBuffer(ctx, false);
      const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
      const g = ctx.createGain();
      g.gain.setValueAtTime(gain, t);
      g.gain.exponentialRampToValueAtTime(.0008, t + decay);
      const p = panner(ctx, pan);
      src.connect(f); f.connect(g);
      if (p) { g.connect(p); p.connect(this.mix); } else g.connect(this.mix);
      src.start(t, Math.random() * 1.4); src.stop(t + decay + .03);
    }

    _bass(t, midi, dur) {
      const ctx = this.ctx;
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 760; f.Q.value = .8;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(.15, t + .008);
      g.gain.exponentialRampToValueAtTime(.001, t + dur);
      const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = mtof(midi);
      const sub = ctx.createOscillator(); sub.type = 'sine'; sub.frequency.value = mtof(midi - 12);
      const trim = ctx.createGain(); trim.gain.value = .5;
      o.connect(f); sub.connect(trim); trim.connect(f); f.connect(g); g.connect(this.mix);
      o.start(t); sub.start(t); o.stop(t + dur + .03); sub.stop(t + dur + .03);
    }

    _stab(t, notes, dur) {
      const ctx = this.ctx;
      for (const midi of notes) {
        const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = mtof(midi);
        const f = ctx.createBiquadFilter(); f.type = 'lowpass';
        f.frequency.setValueAtTime(2400, t);
        f.frequency.exponentialRampToValueAtTime(700, t + dur);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(.032, t + .006);
        g.gain.exponentialRampToValueAtTime(.0008, t + dur);
        o.connect(f); f.connect(g); g.connect(this.mix); o.start(t); o.stop(t + dur + .02);
      }
    }

    _lead(t, midi, dur) {
      const ctx = this.ctx;
      const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = mtof(midi);
      const o2 = ctx.createOscillator(); o2.type = 'sine'; o2.frequency.value = mtof(midi + 12);
      const trim = ctx.createGain(); trim.gain.value = .18;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(.055, t + .012);
      g.gain.exponentialRampToValueAtTime(.016, t + dur * .65);
      g.gain.exponentialRampToValueAtTime(.0008, t + dur);
      o.connect(g); o2.connect(trim); trim.connect(g);
      g.connect(this.mix); g.connect(this.delaySend);
      o.start(t); o2.start(t); o.stop(t + dur + .03); o2.stop(t + dur + .03);
    }
  }

  /* ------------------------------------------------------------ crowd */
  class Crowd {
    constructor(ctx, destination) {
      this.ctx = ctx;
      this.out = ctx.createGain();
      this.out.gain.value = 0;
      this.out.connect(destination);
      this.enabled = true;
      this.ducked = false;
      this.level = .8;
      this.started = false;
      this._nodes = [];
    }

    start() {
      if (this.started) return;
      this.started = true;
      const ctx = this.ctx, buf = noiseBuffer(ctx, true);
      const layers = [
        [330, .8, .05, .05],
        [640, 1.1, .032, .08],
        [1150, 1.3, .018, .12],
      ];
      for (const [freq, q, gain, rate] of layers) {
        const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
        const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = freq; bp.Q.value = q;
        const g = ctx.createGain(); g.gain.value = gain;
        const lfo = ctx.createOscillator(); lfo.frequency.value = rate;
        const lg = ctx.createGain(); lg.gain.value = gain * .55;
        lfo.connect(lg); lg.connect(g.gain);
        src.connect(bp); bp.connect(g); g.connect(this.out);
        src.start(); lfo.start();
        this._nodes.push(src, lfo);
      }
      const room = ctx.createBufferSource(); room.buffer = buf; room.loop = true;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 190;
      const rg = ctx.createGain(); rg.gain.value = .06;
      room.connect(lp); lp.connect(rg); rg.connect(this.out); room.start();
      this._nodes.push(room);
      this._apply(.6);
      this._schedule();
    }

    stop() {
      clearTimeout(this._timer);
      this.started = false;
      for (const n of this._nodes) { try { n.stop(); } catch {} }
      this._nodes = [];
      try { this.out.disconnect(); } catch {}
    }

    _schedule() {
      clearTimeout(this._timer);
      if (!this.started) return;
      this._timer = setTimeout(() => {
        if (this.enabled && !this.ducked) this._random();
        this._schedule();
      }, 2400 + Math.random() * 6200);
    }

    _random() {
      const r = Math.random();
      if (r < .58) this.clink();
      else if (r < .72) this.scrape();
      else if (r < .88) this.chatter();
      else this.cheer(.55);
    }

    clink(power = 1) {
      if (!this.started) return;
      const ctx = this.ctx, t0 = ctx.currentTime + .02;
      const pan = panner(ctx, (Math.random() - .5) * 1.2);
      const n = 2 + (Math.random() * 2 | 0);
      for (let i = 0; i < n; i++) {
        const t = t0 + i * (.015 + Math.random() * .02);
        const f0 = 1900 + Math.random() * 2100;
        const o = ctx.createOscillator(); o.type = 'sine';
        o.frequency.setValueAtTime(f0, t);
        o.frequency.exponentialRampToValueAtTime(f0 * .96, t + .3);
        const g = ctx.createGain();
        g.gain.setValueAtTime(.0001, t);
        g.gain.linearRampToValueAtTime(.05 * power, t + .005);
        g.gain.exponentialRampToValueAtTime(.0004, t + .3 + Math.random() * .25);
        o.connect(g);
        if (pan) g.connect(pan); else g.connect(this.out);
        o.start(t); o.stop(t + .65);
      }
      if (pan) pan.connect(this.out);
      this._hit(t0, 3300, 2, .022 * power, .05, (Math.random() - .5) * .6);
    }

    scrape() {
      if (!this.started) return;
      const ctx = this.ctx, t = ctx.currentTime + .02;
      const src = ctx.createBufferSource(); src.buffer = noiseBuffer(ctx, false);
      const f = ctx.createBiquadFilter(); f.type = 'lowpass';
      f.frequency.setValueAtTime(900, t);
      f.frequency.exponentialRampToValueAtTime(260, t + .3);
      const g = ctx.createGain();
      g.gain.setValueAtTime(.0001, t);
      g.gain.linearRampToValueAtTime(.035, t + .03);
      g.gain.exponentialRampToValueAtTime(.0005, t + .34);
      src.connect(f); f.connect(g); g.connect(this.out);
      src.start(t, Math.random() * 1.4); src.stop(t + .36);
    }

    chatter() {
      if (!this.started) return;
      const ctx = this.ctx, t = ctx.currentTime + .02;
      const src = ctx.createBufferSource(); src.buffer = noiseBuffer(ctx, true);
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 620 + Math.random() * 320; bp.Q.value = .9;
      const g = ctx.createGain();
      g.gain.setValueAtTime(.0001, t);
      g.gain.linearRampToValueAtTime(.05, t + .25);
      g.gain.linearRampToValueAtTime(.05, t + 1.2);
      g.gain.linearRampToValueAtTime(.0001, t + 1.9);
      const trem = ctx.createOscillator(); trem.frequency.value = 3.2 + Math.random() * 2;
      const tg = ctx.createGain(); tg.gain.value = .022;
      trem.connect(tg); tg.connect(g.gain);
      src.connect(bp); bp.connect(g); g.connect(this.out);
      src.start(t, Math.random()); src.stop(t + 1.95);
      trem.start(t); trem.stop(t + 1.95);
    }

    cheer(power = 1) {
      if (!this.started || !this.enabled) return;
      const ctx = this.ctx, t = ctx.currentTime + .02;
      for (const [freq, gain, dur] of [[700, .1, 1.4], [1500, .05, 1.1]]) {
        const src = ctx.createBufferSource(); src.buffer = noiseBuffer(ctx, true);
        const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = freq; bp.Q.value = .6;
        const g = ctx.createGain();
        g.gain.setValueAtTime(.0001, t);
        g.gain.linearRampToValueAtTime(gain * power, t + .16);
        g.gain.linearRampToValueAtTime(gain * power * .8, t + .45);
        g.gain.exponentialRampToValueAtTime(.0004, t + dur);
        src.connect(bp); bp.connect(g); g.connect(this.out);
        src.start(t, Math.random()); src.stop(t + dur + .05);
      }
      for (let i = 0; i < 12; i++) this._hit(t + Math.random() * .95, 1300 + Math.random() * 900, 1.2, .035 * power, .07, (Math.random() - .5) * 1.4);
      for (let i = 0; i < 2; i++) {
        const at = t + .3 + Math.random() * .6;
        const o = ctx.createOscillator(); o.type = 'sine';
        o.frequency.setValueAtTime(1500, at);
        o.frequency.exponentialRampToValueAtTime(2300, at + .18);
        o.frequency.exponentialRampToValueAtTime(1750, at + .45);
        const g = ctx.createGain();
        g.gain.setValueAtTime(.0001, at);
        g.gain.linearRampToValueAtTime(.018 * power, at + .04);
        g.gain.exponentialRampToValueAtTime(.0004, at + .5);
        o.connect(g); g.connect(this.out); o.start(at); o.stop(at + .52);
      }
    }

    _hit(t, freq, q, gain, decay, pan) {
      const ctx = this.ctx;
      const src = ctx.createBufferSource(); src.buffer = noiseBuffer(ctx, false);
      const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q;
      const g = ctx.createGain();
      g.gain.setValueAtTime(gain, t);
      g.gain.exponentialRampToValueAtTime(.0006, t + decay);
      src.connect(f); f.connect(g);
      const p = pan ? panner(ctx, pan) : null;
      if (p) { g.connect(p); p.connect(this.out); } else g.connect(this.out);
      src.start(t, Math.random() * 1.5); src.stop(t + decay + .03);
    }

    setEnabled(on) {
      this.enabled = !!on;
      this._apply(.5);
    }

    setLevel(x) {
      this.level = Math.max(.2, Math.min(1, +x || .8));
      this._apply(.4);
    }

    duck(on) {
      const v = !!on;
      if (v === this.ducked) return;
      this.ducked = v;
      this._apply(.35);
    }

    _apply(ramp) {
      const t = this.ctx.currentTime;
      const target = this.enabled ? .75 * this.level * (this.ducked ? .25 : 1) : 0;
      const p = this.out.gain;
      p.cancelScheduledValues(t);
      p.setValueAtTime(p.value, t);
      p.linearRampToValueAtTime(target, t + (ramp || .4));
    }
  }

  /* ----------------------------------------------------------- street */
  /* Recorded street bed + horns. Kept as media elements so long files stream instead of decoding 4 minutes up front. */
  class Street {
    constructor(ctx, destination, opts = {}) {
      this.ctx = ctx;
      this.base = opts.base || 'assets/audio/';
      this.out = ctx.createGain();
      this.out.gain.value = 0;
      this.out.connect(destination);
      this.enabled = true;
      this.ducked = false;
      this.level = .8;
      this.started = false;
      this._els = [];
      this._bed = null;
      this._traffic = null;
      this._dzoo = null;
    }

    _make(file, gain, pan) {
      const el = new Audio(this.base + file);
      el.preload = 'auto';
      const src = this.ctx.createMediaElementSource(el);
      const g = this.ctx.createGain();
      g.gain.value = gain;
      const p = panner(this.ctx, pan);
      src.connect(g);
      if (p) { g.connect(p); p.connect(this.out); } else g.connect(this.out);
      el._gain = g;
      el._base = gain;
      this._els.push(el);
      return el;
    }

    _resetEl(el) {
      clearTimeout(el._stop);
      clearTimeout(el._reset);
      const t = this.ctx.currentTime, p = el._gain.gain;
      p.cancelScheduledValues(t);
      p.setValueAtTime(el._base, t);
    }

    _fadeStop(el, afterMs) {
      clearTimeout(el._stop);
      el._stop = setTimeout(() => {
        const t = this.ctx.currentTime, p = el._gain.gain;
        p.cancelScheduledValues(t);
        p.setValueAtTime(p.value, t);
        p.linearRampToValueAtTime(.0001, t + .16);
        clearTimeout(el._reset);
        el._reset = setTimeout(() => {
          try { el.pause(); } catch {}
          const now = this.ctx.currentTime;
          p.cancelScheduledValues(now);
          p.setValueAtTime(el._base, now);
        }, 200);
      }, afterMs);
    }

    start() {
      if (this.started) return;
      this.started = true;
      try {
        this._bed = this._make('street-restaurant.mp3', .3, 0);
        this._bed.loop = true;
        this._bed.play().catch(() => {});
        this._traffic = this._make('street-traffic.mp3', .09, .15);
        this._dzoo = this._make('cheer-23-dzo.mp3', .55, 0);
      } catch {}
      this._apply(.8);
      this._schedule(6000 + Math.random() * 7000);
    }

    _schedule(wait) {
      clearTimeout(this._timer);
      if (!this.started) return;
      this._timer = setTimeout(() => {
        if (this.enabled && !this.ducked) this.trafficSwell();
        this._schedule(11000 + Math.random() * 18000);
      }, wait);
    }

    trafficSwell() {
      const el = this._traffic;
      if (!el) return;
      try {
        const dur = Number.isFinite(el.duration) ? el.duration : 31;
        this._resetEl(el);
        el.currentTime = Math.random() * Math.max(0, dur - 10);
        el.play().catch(() => {});
        this._fadeStop(el, 6000 + Math.random() * 5000);
      } catch {}
    }

    /* recorded "hai, ba, dzô" for whole-bar cheers; the clip ends on its own */
    cheer() {
      if (!this.started || !this.enabled) return;
      const el = this._dzoo;
      if (!el) return;
      try {
        this._resetEl(el);
        el.currentTime = 0;
        el.play().catch(() => {});
      } catch {}
    }

    setEnabled(on) {
      this.enabled = !!on;
      clearTimeout(this._pauseTimer);
      if (!this.enabled) {
        this._apply(.35);
        /* let the output fade before pausing, so a toggle never clicks */
        this._pauseTimer = setTimeout(() => {
          if (this.enabled) return;
          for (const el of this._els) {
            clearTimeout(el._stop); clearTimeout(el._reset);
            try { el.pause(); } catch {}
          }
        }, 600);
      } else {
        for (const el of this._els) this._resetEl(el);
        try { this._bed?.play().catch(() => {}); } catch {}
        this._apply(.5);
      }
    }

    setLevel(x) {
      this.level = Math.max(.2, Math.min(1, +x || .8));
      this._apply(.5);
    }

    duck(on) {
      const v = !!on;
      if (v === this.ducked) return;
      this.ducked = v;
      this._apply(.35);
    }

    _apply(ramp) {
      const t = this.ctx.currentTime;
      const target = this.enabled ? .85 * this.level * (this.ducked ? .3 : 1) : 0;
      const p = this.out.gain;
      p.cancelScheduledValues(t);
      p.setValueAtTime(p.value, t);
      p.linearRampToValueAtTime(target, t + (ramp || .4));
    }

    stop() {
      clearTimeout(this._timer);
      clearTimeout(this._pauseTimer);
      this.started = false;
      for (const el of this._els) {
        clearTimeout(el._stop);
        clearTimeout(el._reset);
        try { el.pause(); } catch {}
        try { el._gain?.disconnect(); } catch {}
      }
      this._els = [];
      try { this.out.disconnect(); } catch {}
    }
  }

  global.BarSound = { Band, Crowd, Street };
})(window);
