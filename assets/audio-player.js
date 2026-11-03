/* Shared music library for City Beer Station.
   Used by the static hall (index.html) and the LIVE overlay (live/overlay.html).
   Tracks are declared in assets/music/library.json — add files + entries there, no code changes needed.
   A track with "engine": "band" is the live band synthesised by assets/bar-sound.js. */
(function (global) {
  'use strict';

  const PREFS_VERSION = 2;
  const FALLBACK_TRACKS = [
    { id: 'house-band', title: 'Ban nhạc quán · sôi động', engine: 'band' },
    { id: 'dem-via-he', title: 'Đêm vỉa hè', src: 'music1.mp3' },
    { id: 'saigon-chill', title: 'Sài Gòn chill', src: 'music2.mp3' },
  ];
  const clamp01 = v => Math.max(0, Math.min(1, +v || 0));

  async function loadLibrary(manifestUrl = 'assets/music/library.json') {
    const base = new URL(manifestUrl, location.href);
    let data = null;
    try {
      const res = await fetch(base.href, { cache: 'no-cache' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      data = await res.json();
    } catch (e) {
      console.warn('[BarAudio] không đọc được library.json (' + e.message + '), dùng danh sách mặc định');
    }
    const categories = [], tracks = [], byId = new Map();
    for (const c of (data && Array.isArray(data.categories) ? data.categories : [])) {
      const cat = { id: String(c.id || c.name || 'khac'), name: String(c.name || c.id || 'Khác'), tracks: [] };
      for (const t of (Array.isArray(c.tracks) ? c.tracks : [])) {
        if (!t) continue;
        const engine = t.engine === 'band' ? 'band' : '';
        if (!t.src && !engine) continue;
        let url = '';
        if (t.src) { try { url = new URL(String(t.src), base).href; } catch { if (!engine) continue; } }
        const track = {
          id: String(t.id || t.src || 'house-band'),
          title: String(t.title || t.id || 'Không tên'),
          url,
          engine,
          category: cat.name,
          credit: t.credit ? String(t.credit) : '',
          license: t.license ? String(t.license) : '',
        };
        if (byId.has(track.id)) continue;
        byId.set(track.id, track);
        cat.tracks.push(track);
        tracks.push(track);
      }
      categories.push(cat);
    }
    if (!tracks.length) {
      const cat = { id: 'quan', name: 'Nhạc quán', tracks: [] };
      for (const t of FALLBACK_TRACKS) {
        const track = { ...t, url: t.src ? new URL(t.src, base).href : '', engine: t.engine || '', category: cat.name };
        byId.set(track.id, track);
        cat.tracks.push(track);
        tracks.push(track);
      }
      categories.push(cat);
    }
    return { categories, tracks, byId, source: base.href };
  }

  class MusicPlayer {
    constructor(opts = {}) {
      this.manifestUrl = opts.manifestUrl || 'assets/music/library.json';
      this.storageKey = opts.storageKey || 'barMusic';
      this.fadeIn = opts.fadeIn ?? 3;
      this.duckLevel = clamp01(opts.duckLevel ?? 0.28);
      const prefs = this._readPrefs();
      this.volume = clamp01(prefs.volume ?? opts.volume ?? 0.55);
      this.enabled = prefs.enabled !== false;
      this.ducked = false;
      this.ctx = null;
      this.bus = null;
      this.current = null;
      this._el = null;
      this._gain = null;
      this._node = null;
      this._band = null;
      this._bandGain = null;
      this._bandPlaying = false;
      this._started = false;
      this._failures = 0;
      this._listeners = new Set();
      this._library = null;
      this._loading = null;
    }

    _readPrefs() {
      try { return JSON.parse(global.localStorage.getItem(this.storageKey)) || {}; } catch { return {}; }
    }
    _writePrefs(patch) {
      try { global.localStorage.setItem(this.storageKey, JSON.stringify({ ...this._readPrefs(), ...patch })); } catch {}
    }
    _ensureLibrary() {
      this._loading ||= loadLibrary(this.manifestUrl).then(lib => (this._library = lib));
      return this._loading;
    }

    onTrack(fn) {
      this._listeners.add(fn);
      fn(this.state());
      return () => this._listeners.delete(fn);
    }
    state() {
      return {
        track: this.current,
        categories: this._library?.categories || [],
        enabled: this.enabled,
        volume: this.volume,
        playing: this._bandPlaying || (!!this._el && !this._el.paused),
      };
    }
    _emit() { const s = this.state(); for (const fn of this._listeners) { try { fn(s); } catch {} } }

    attach(ctx, destination) {
      this.ctx = ctx;
      this.bus = ctx.createGain();
      this.bus.gain.value = 0;
      this.bus.connect(destination);
      this._applyVolume(0);
      if (this._started && this.current && !this._el && !this._band) this._play(this.current, 0.8);
      return this;
    }

    async start() {
      this._started = true;
      const lib = await this._ensureLibrary();
      if (!this.current) {
        const prefs = this._readPrefs();
        const savedId = prefs.v === PREFS_VERSION ? prefs.trackId : '';
        this.current = (savedId && lib.byId.get(savedId)) || lib.tracks[0] || null;
      }
      if (this.ctx && this.current && !this._el && !this._band) this._play(this.current, 0.8);
      else this._emit();
    }

    _stopElement(fade) {
      const el = this._el, gain = this._gain, node = this._node;
      if (!el) return;
      this._el = this._gain = this._node = null;
      if (gain && this.ctx) {
        const t = this.ctx.currentTime, p = gain.gain;
        p.cancelScheduledValues(t);
        p.setValueAtTime(p.value, t);
        p.linearRampToValueAtTime(0, t + Math.max(.05, fade));
      }
      setTimeout(() => {
        try { el.pause(); node?.disconnect(); gain?.disconnect(); } catch {}
      }, (fade + .3) * 1000);
    }

    _stopBand(fade) {
      const band = this._band, gain = this._bandGain;
      this._band = this._bandGain = null;
      this._bandPlaying = false;
      if (!band) return;
      if (gain && this.ctx) {
        const t = this.ctx.currentTime, p = gain.gain;
        p.cancelScheduledValues(t);
        p.setValueAtTime(p.value, t);
        p.linearRampToValueAtTime(0, t + Math.max(.05, fade));
      }
      setTimeout(() => {
        try { band.stop(); gain?.disconnect(); } catch {}
      }, (fade + .25) * 1000);
    }

    _playBand(track, fade) {
      if (!this.ctx || !this.bus || !global.BarSound) return;
      const ctx = this.ctx;
      this._stopElement(fade);
      if (!this._band) {
        this._bandGain = ctx.createGain();
        this._bandGain.gain.value = 0;
        this._bandGain.connect(this.bus);
        this._band = new global.BarSound.Band(ctx, this._bandGain);
        this._band.start();
        this._bandPlaying = true;
      }
      const t = ctx.currentTime, p = this._bandGain.gain;
      p.cancelScheduledValues(t);
      p.setValueAtTime(p.value, t);
      p.linearRampToValueAtTime(1, t + Math.max(.05, fade));
      this.current = track;
      this._writePrefs({ v: PREFS_VERSION, trackId: track.id });
      this._emit();
    }

    _play(track, fade = this.fadeIn) {
      if (!this.ctx || !this.bus) return;
      if (track.engine === 'band') return this._playBand(track, fade);
      this._stopBand(fade);
      const ctx = this.ctx;
      this._stopElement(fade);
      const el = new Audio(track.url);
      el.preload = 'auto';
      el.crossOrigin = 'anonymous';
      const node = ctx.createMediaElementSource(el);
      const gain = ctx.createGain();
      gain.gain.value = 0;
      node.connect(gain);
      gain.connect(this.bus);
      const now = ctx.currentTime;
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(1, now + Math.max(.05, fade));
      el.addEventListener('playing', () => { this._failures = 0; el._next = false; this._emit(); });
      el.addEventListener('timeupdate', () => {
        if (el._next || !el.duration || !isFinite(el.duration)) return;
        const tail = Math.max(3.5, fade);
        if (el.duration > tail * 2 && el.duration - el.currentTime < tail) { el._next = true; this.next(fade); }
      });
      el.addEventListener('ended', () => { if (!el._next) { el._next = true; this.next(fade); } });
      el.addEventListener('error', () => {
        if (el._next) return;
        el._next = true;
        this._failures++;
        if (this._failures <= Math.min(3, (this._library?.tracks.length || 1) - 1)) this.next(fade);
      });
      el.play().catch(() => {});
      this._el = el; this._gain = gain; this._node = node;
      this.current = track;
      this._writePrefs({ v: PREFS_VERSION, trackId: track.id });
      this._emit();
    }

    async playTrack(id, { fade = this.fadeIn, force = false } = {}) {
      const lib = await this._ensureLibrary();
      const track = lib.byId.get(String(id));
      if (!track) return false;
      const live = this._band ? this._bandPlaying : !!this._el && !this._el.paused;
      if (!force && this.current?.id === track.id && live) return true;
      this.current = track;
      this._writePrefs({ v: PREFS_VERSION, trackId: track.id });
      this._emit();
      if (this.ctx && this._started) this._play(track, fade);
      return true;
    }

    async next(fade = this.fadeIn) {
      const lib = await this._ensureLibrary();
      if (!lib.tracks.length) return false;
      const i = this.current ? lib.tracks.findIndex(t => t.id === this.current.id) : -1;
      return this.playTrack(lib.tracks[(i + 1) % lib.tracks.length].id, { fade, force: true });
    }
    async prev(fade = this.fadeIn) {
      const lib = await this._ensureLibrary();
      if (!lib.tracks.length) return false;
      const i = this.current ? lib.tracks.findIndex(t => t.id === this.current.id) : 0;
      return this.playTrack(lib.tracks[(i - 1 + lib.tracks.length) % lib.tracks.length].id, { fade, force: true });
    }
    async playCategory(id) {
      const lib = await this._ensureLibrary();
      const cat = lib.categories.find(c => c.id === id);
      if (!cat || !cat.tracks.length) return false;
      return this.playTrack(cat.tracks[0].id, { force: true });
    }

    setEnabled(on) {
      const v = !!on;
      if (v === this.enabled) return;
      this.enabled = v;
      this._writePrefs({ enabled: v });
      this._applyVolume();
      this._emit();
    }
    setVolume(v) {
      this.volume = clamp01(v);
      this._writePrefs({ volume: this.volume });
      this._applyVolume();
      this._emit();
    }
    duck(on) {
      const v = !!on;
      if (v === this.ducked) return;
      this.ducked = v;
      this._applyVolume();
    }
    _applyVolume(ramp = .4) {
      if (!this.ctx || !this.bus) return;
      const target = this.enabled ? this.volume * (this.ducked ? this.duckLevel : 1) : 0;
      const t = this.ctx.currentTime, p = this.bus.gain;
      p.cancelScheduledValues(t);
      p.setValueAtTime(p.value, t);
      p.linearRampToValueAtTime(target, t + ramp);
    }

    release() {
      try { this._el?.pause(); } catch {}
      try { this._band?.stop(); } catch {}
      try { this._node?.disconnect(); this._gain?.disconnect(); this._bandGain?.disconnect(); this.bus?.disconnect(); } catch {}
      this._el = this._gain = this._node = this._band = this._bandGain = this.bus = this.ctx = null;
      this._bandPlaying = false;
      this._started = false;
      this._emit();
    }
  }

  global.BarAudio = { loadLibrary, MusicPlayer };
})(window);
