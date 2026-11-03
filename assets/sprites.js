/* Shared sprite loader for City Beer Station.
   One atlas request covers every guest; if the atlas is missing it falls back to
   the individual WebP files, which is also what happens when a page is opened
   straight from disk (file:// refuses the atlas.json fetch but still loads images). */
window.BeerSprites = (function(){
  const FILES = {
    man: 'guest_man.webp',
    woman: 'guest_woman.webp',
    uncle: 'guest_uncle.webp',
    cap: 'guest_cap.webp',
    eat_man: 'eat_man.webp',
    eat_woman: 'eat_woman.webp',
    eat_uncle: 'eat_uncle.webp',
    eat_cap: 'eat_cap.webp',
    walk_man: 'walk_man.webp',
    walk_woman: 'walk_woman.webp',
    walk_uncle: 'walk_uncle.webp',
    walk_cap: 'walk_cap.webp',
    front_beer_man: 'front_beer_man.webp',
    front_beer_woman: 'front_beer_woman.webp',
    front_beer_uncle: 'front_beer_uncle.webp',
    front_beer_cap: 'front_beer_cap.webp',
    front_eat_man: 'front_eat_man.webp',
    front_eat_woman: 'front_eat_woman.webp',
    front_eat_uncle: 'front_eat_uncle.webp',
    front_eat_cap: 'front_eat_cap.webp',
    sexy: 'guest_sexy.webp',
    eat_sexy: 'eat_sexy.webp',
    walk_sexy: 'walk_sexy.webp',
    front_beer_sexy: 'front_beer_sexy.webp',
    front_eat_sexy: 'front_eat_sexy.webp',
    oldwoman: 'guest_oldwoman.webp',
    eat_oldwoman: 'eat_oldwoman.webp',
    walk_oldwoman: 'walk_oldwoman.webp',
    front_beer_oldwoman: 'front_beer_oldwoman.webp',
    front_eat_oldwoman: 'front_eat_oldwoman.webp',
  };
  function loadImage(src){
    const im = new Image();
    im.decoding = 'async';
    im.src = src;
    return im;
  }
  function create(base = 'assets/'){
    const parts = new Map();                 // key -> {im, sx, sy, sw, sh}
    const waiting = [];
    let done = false;
    function finish(){
      if (done) return;
      done = true;
      for (const fn of waiting.splice(0)) fn();
    }
    function fallback(){
      const keys = Object.keys(FILES);
      let left = keys.length;
      const step = () => { if (--left === 0) finish(); };
      for (const k of keys){
        const im = loadImage(base + FILES[k]);
        im.onload = () => { parts.set(k, { im }); step(); };
        im.onerror = () => { console.warn('missing sprite', base + FILES[k]); step(); };
      }
    }
    // No forced cache: the server answers with an ETag, so the atlas is revalidated
    // (304) instead of silently serving a stale build after a sprite rebuild.
    fetch(base + 'atlas.json')
      .then(r => { if (!r.ok) throw new Error('atlas ' + r.status); return r.json(); })
      .then(meta => {
        if (!meta || !meta.sprites) throw new Error('atlas json');
        const im = loadImage(base + meta.image);
        im.onload = () => {
          for (const k of Object.keys(FILES)){ const r = meta.sprites[k]; if (r) parts.set(k, { im, sx:r.x, sy:r.y, sw:r.w, sh:r.h }); }
          finish();
        };
        im.onerror = () => { console.warn('atlas image failed, using separate sprites'); fallback(); };
      })
      .catch(() => fallback());

    function has(key){ const p = parts.get(key); return !!p && p.im.naturalWidth > 0; }
    /* centered horizontally, bottom-anchored at y (anchorY = 0 centres vertically) */
    function draw(c, key, x, y, s, anchorY = 1){
      const p = parts.get(key);
      if (!p || !p.im.naturalWidth) return false;
      const sw = p.sw || p.im.naturalWidth, sh = p.sh || p.im.naturalHeight;
      const w = sw * s, h = sh * s;
      if (p.sw) c.drawImage(p.im, p.sx, p.sy, sw, sh, x - w/2, y - h*anchorY, w, h);
      else c.drawImage(p.im, x - w/2, y - h*anchorY, w, h);
      return true;
    }
    function natural(key){ const p = parts.get(key); return p ? (p.sw || p.im.naturalWidth) : 0; }
    function dim(key){
      const p = parts.get(key);
      return p ? { w: p.sw || p.im.naturalWidth, h: p.sh || p.im.naturalHeight } : { w: 0, h: 0 };
    }
    function onReady(fn){ if (done) fn(); else waiting.push(fn); }
    return { has, draw, natural, dim, onReady };
  }
  return { create };
})();
