/* City Beer Station — shared street scene.
   Table/chair layout, plastic furniture, table props, day-night crossfade and the
   phase schedule used by the static demo, the LIVE overlay and the control panel. */
window.BeerScene = (function(){
  const SW = 1080, SH = 1920;

  /* ------------------------------------------------------------ schedule */
  const DEFAULT_FOOD_FROM = 5, DEFAULT_BEER_FROM = 16;
  const clamp01 = v => v < 0 ? 0 : v > 1 ? 1 : v;
  const smoothstep = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };

  function schedule(settings){
    let foodFrom = Number(settings?.foodFrom), beerFrom = Number(settings?.beerFrom);
    if (!(foodFrom >= 0 && foodFrom < 24)) foodFrom = DEFAULT_FOOD_FROM;
    if (!(beerFrom >= 0 && beerFrom < 24)) beerFrom = DEFAULT_BEER_FROM;
    if (beerFrom <= foodFrom + 1){ foodFrom = DEFAULT_FOOD_FROM; beerFrom = DEFAULT_BEER_FROM; }
    return { foodFrom, beerFrom };
  }

  /* 0 = full daylight food stall · 1 = full night beer garden.
     Each switch is a one-hour crossfade (e.g. 15:30–16:30 and 04:30–05:30). */
  function nightAt(settings, date = new Date()){
    const mode = settings?.phaseMode || 'auto';
    if (mode === 'food') return 0;
    if (mode === 'beer') return 1;
    const { foodFrom, beerFrom } = schedule(settings);
    const h = date.getHours() + date.getMinutes() / 60 + date.getSeconds() / 3600;
    if (h >= foodFrom + .5 && h < beerFrom - .5) return 0;
    if (h >= beerFrom + .5 || h < foodFrom - .5) return 1;
    if (h >= beerFrom - .5) return smoothstep(beerFrom - .5, beerFrom + .5, h);
    return 1 - smoothstep(foodFrom - .5, foodFrom + .5, h);
  }

  function nextSwitch(settings, date = new Date()){
    const { foodFrom, beerFrom } = schedule(settings);
    const h = date.getHours() + date.getMinutes() / 60 + date.getSeconds() / 3600;
    const night = nightAt(settings, date) >= .5;
    const target = night ? foodFrom : beerFrom;
    let wait = target - h;
    if (wait <= 0) wait += 24;
    return { at: target, wait, night, label: night ? 'Cơm · Phở' : 'Bia · Nhậu' };
  }

  function phaseInfo(settings, date = new Date()){
    const night = nightAt(settings, date);
    const food = night < .5;
    return {
      night, food,
      label: food ? 'Cơm · Phở' : 'Bia · Nhậu',
      short: food ? 'Ban ngày' : 'Ban đêm',
      icon: food ? '☀' : '🌙',
      next: nextSwitch(settings, date),
    };
  }

  /* -------------------------------------------------------------- layout */
  // The updated backgrounds (768×1376) already paint a wide plaza with small
  // plastic tables and stools. Table centres are stored in image pixels and
  // converted to stage pixels, so guests sit on the furniture that is already
  // in the picture. The empty foreground gets two extra rows of drawn tables
  // ("góc ngồi") for guests who walk in later.
  const IMG_W = 768, IMG_H = 1376;
  const gx = x => x * SW / IMG_W;
  const gy = y => y * SH / IMG_H;
  const WALK_HIP = 320;   // px from the feet to the hip in the 760-high walk sprites

  // Seat priority runs front to back but interleaves the big image row between
  // the two drawn rows, so 24 guests spread across the whole yard instead of
  // piling into one corner.
  const BG_ROWS = [
    // zone, sprite scale, near/far seats per table, [image x, image top y, image width]
    { zone: 1, scale: .245, near: 2, far: 2, tables: [[166, 1075, 57], [405, 1068, 57], [595, 1068, 57]] },
    { zone: 3, scale: .225, near: 1, far: 1, tables: [[225, 976, 47], [397, 982, 47], [552, 978, 47]] },
    { zone: 4, scale: .21, near: 1, far: 1, tables: [[234, 905, 42], [410, 910, 42], [565, 918, 42]] },
    // The 350/840 table hosts four guests; the cart at 655/840 is not a table.
    { zone: 5, scale: .195, near: 1, far: 1, tables: [[215, 848, 40], [350, 840, 40, 2, 2], [510, 846, 40]] },
    { zone: 6, scale: .185, near: 1, far: 1, tables: [[282, 805, 38], [390, 807, 38], [491, 800, 38], [592, 800, 38]] },
  ];

  // Drawn tables in the empty pavement at the bottom of the picture. The front
  // row keeps enough clearance for walkers' feet at 1920 px.
  const FOREGROUND_ROWS = [
    { zone: 0, ground: 1800, w: 140, scale: .285, xs: [185, 540, 895] },
    { zone: 2, ground: 1650, w: 120, scale: .25, xs: [185, 540, 895] },
  ];

  function makeSeat(table, side, index, x, y, scale){
    return {
      id: `${table.id}_${side}${index}`, table, side, index, x, y, scale,
      gap: table.w * (side === 'near' ? .9 : 1.3), tagLift: 0,
    };
  }

  function layout(cap){
    const tables = [];
    let seq = 0;

    for (const row of FOREGROUND_ROWS){
      for (const cx of row.xs){
        const w = row.w, depth = w * .36, red = seq % 2 === 0;
        const table = {
          kind: 'drawn', zone: row.zone, id: `f${seq++}`, cx, y: row.ground, w, depth, scale: row.scale,
          color: red ? 'red' : 'green', chairColor: red ? 'green' : 'red',
          nearSeats: [], farSeats: [], seats: [],
        };
        [-1, 1].forEach((side, i) => {
          const seat = makeSeat(table, 'near', i, cx + side * w * .46, row.ground + w * .14, row.scale);
          table.nearSeats.push(seat); table.seats.push(seat);
        });
        [-1, 1].forEach((side, i) => {
          const seat = makeSeat(table, 'far', i, cx + side * w * .40, row.ground - depth * .65, row.scale * .95);
          table.farSeats.push(seat); table.seats.push(seat);
        });
        tables.push(table);
      }
    }

    for (const row of BG_ROWS){
      for (const [ix, iyTop, iw, nearSeats, farSeats] of row.tables){
        const nNear = nearSeats ?? row.near, nFar = farSeats ?? row.far;
        const cx = gx(ix), w = gx(iw), topY = gy(iyTop);
        const ground = topY + w * .62, depth = w * .34;
        const table = {
          kind: 'image', zone: row.zone, id: `bg${seq++}`, cx, y: ground, topY, w, depth, scale: row.scale,
          // Background pixels redrawn over far guests so their cut-off waist
          // hides behind the tabletop that is already painted in the picture.
          patch: { x: cx - w * .8, y: topY - w * .62, w: w * 1.6, h: w * 1.25 },
          propScale: 1.15, chairColor: seq % 2 ? 'green' : 'red',
          nearSeats: [], farSeats: [], seats: [],
        };
        for (let i = 0; i < nNear; i++){
          const off = nNear > 1 ? (i - (nNear - 1) / 2) * w * .95 : 0;
          const seat = makeSeat(table, 'near', i, cx + off, ground - w * .28, row.scale);
          table.nearSeats.push(seat); table.seats.push(seat);
        }
        for (let i = 0; i < nFar; i++){
          const off = nFar > 1 ? (i - (nFar - 1) / 2) * w * .84 : 0;
          const seat = makeSeat(table, 'far', i, cx + off, topY - w * .02, row.scale * .96);
          table.farSeats.push(seat); table.seats.push(seat);
        }
        tables.push(table);
      }
    }

    // Walk the zones front to back; within a zone the near seats of every
    // table come first so a half-filled row still looks balanced.
    const all = [];
    for (const zone of [...new Set(tables.map(t => t.zone))].sort((a, b) => a - b)){
      const zoneTables = tables.filter(t => t.zone === zone);
      for (const t of zoneTables) for (const s of t.nearSeats) all.push(s);
      for (const t of zoneTables) for (const s of t.farSeats) all.push(s);
    }
    const want = Math.max(1, Math.min(64, Number(cap) || 24));
    const seats = all.slice(0, want);
    for (const s of seats) s.taken = null;
    return { cap: want, tables, seats };
  }

  /* ----------------------------------------------------------- sprite keys */
  const SKINS = ['man', 'woman', 'uncle', 'cap', 'sexy', 'oldwoman'];
  // Characters are grouped: a viewer who says "nam" gets a random member of the
  // male group, "nữ" a random member of the female group, and so on.
  const SKIN_GROUPS = {
    male:     { label: 'Nam',     skins: ['man', 'cap'] },
    female:   { label: 'Nữ',      skins: ['woman', 'sexy'] },
    oldman:   { label: 'Ông già', skins: ['uncle'] },
    oldwoman: { label: 'Bà già',  skins: ['oldwoman'] },
  };
  const backKey = (skin, activity) => activity === 'food' ? `eat_${skin}` : skin;
  const frontKey = (skin, activity) => activity === 'food' ? `front_eat_${skin}` : `front_beer_${skin}`;
  const walkKey = skin => `walk_${skin}`;
  function activityKey(skin, activity, side){
    return side === 'far' ? frontKey(skin, activity) : backKey(skin, activity);
  }

  /* ----------------------------------------------------------------- menu
     Gift value is measured in xu (1 xu = 1 coin). The menu turns xu into
     dishes: 1 xu buys a bia, 5 xu buys a phở. */
  const MENU = [
    { id: 'bia', label: 'Bia', coins: 1, unit: 'bia', icon: '🍺' },
    { id: 'pho', label: 'Phở', coins: 5, unit: 'phở', icon: '🍜' },
  ];
  function orderFromCoins(coins){
    const n = Math.max(0, Math.floor(coins || 0));
    const pho = Math.floor(n / 5), bia = n % 5;
    const text = [], label = [];
    if (pho){ text.push(`${pho} phở`); label.push(`${pho} PHỞ`); }
    if (bia){ text.push(`${bia} bia`); label.push(`${bia} BIA`); }
    return { bia, pho, coins: n, text: text.join(' và '), label: label.join(' + ') };
  }

  /* -------------------------------------------------------------- colours */
  const TABLE = {
    red:   { top: '#e15a4a', hi: '#ff8a72', mid: '#c0392b', low: '#96271f', rim: '#7c1d17', leg: '#cfd6de', legD: '#7f8b99' },
    green: { top: '#37b578', hi: '#7ce4ab', mid: '#1f8a57', low: '#136b42', rim: '#0c4d2f', leg: '#cfd6de', legD: '#7f8b99' },
  };
  const CHAIR = {
    red:   { top: '#ef6a58', mid: '#cf3f30', low: '#9c291f', hi: 'rgba(255,220,205,.55)' },
    green: { top: '#45c787', mid: '#249a60', low: '#136b42', hi: 'rgba(205,255,225,.55)' },
  };

  /* --------------------------------------------------------- draw helpers */
  function ellipse(g, x, y, rx, ry){ g.beginPath(); g.ellipse(x, y, Math.max(.1, rx), Math.max(.1, ry), 0, 0, 6.2832); }
  function roundRect(g, x, y, w, h, r){
    r = Math.min(r, w / 2, h / 2);
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }

  function shadow(g, x, y, s, alpha = .2){
    g.save();
    g.fillStyle = `rgba(5,9,16,${alpha})`;
    ellipse(g, x, y, 105 * s, 21 * s); g.fill();
    g.restore();
  }

  function drawBackground(g, imgs, night, w = SW, h = SH){
    if (imgs?.light?.naturalWidth) g.drawImage(imgs.light, 0, 0, w, h);
    else if (imgs?.dark?.naturalWidth) g.drawImage(imgs.dark, 0, 0, w, h);
    if (night > .001 && imgs?.dark?.naturalWidth){
      g.save(); g.globalAlpha = night; g.drawImage(imgs.dark, 0, 0, w, h); g.restore();
    }
  }

  function drawAmbient(g, night, t){
    const sunset = Math.sin(clamp01(night) * Math.PI);
    // daylight wash from the top-left
    if (night < .99){
      g.save();
      const d = g.createLinearGradient(0, 0, 700, 1000);
      d.addColorStop(0, `rgba(255,246,214,${.075 * (1 - night)})`);
      d.addColorStop(1, 'rgba(255,246,214,0)');
      g.fillStyle = d; g.fillRect(0, 0, SW, 1200);
      g.restore();
    }
    // sunset tint while the two backgrounds cross
    if (sunset > .01){
      g.save();
      const d = g.createLinearGradient(0, 0, 0, 1250);
      d.addColorStop(0, `rgba(255,120,70,${.14 * sunset})`);
      d.addColorStop(.55, `rgba(255,170,90,${.07 * sunset})`);
      d.addColorStop(1, 'rgba(120,60,100,0)');
      g.fillStyle = d; g.fillRect(0, 0, SW, 1250);
      g.restore();
    }
    // warm glow + string lights over the stall at night
    if (night > .01){
      g.save(); g.globalCompositeOperation = 'lighter';
      const grd = g.createRadialGradient(540, 940, 40, 540, 940, 560);
      grd.addColorStop(0, `rgba(255,168,74,${.16 * night})`);
      grd.addColorStop(.55, `rgba(255,132,48,${.06 * night})`);
      grd.addColorStop(1, 'rgba(255,120,30,0)');
      g.fillStyle = grd; g.fillRect(120, 520, 840, 760);
      for (let i = 0; i < 11; i++){
        const lx = 92 + i * 90, ly = 812 + Math.sin(i * 1.7) * 15;
        g.globalAlpha = night * Math.max(0, .12 + .085 * Math.sin(t * 2.4 + i * 1.9));
        g.fillStyle = i % 3 === 0 ? '#ff6b5a' : '#ffd07a';
        g.beginPath(); g.arc(lx, ly, 9, 0, 6.2832); g.fill();
      }
      g.restore();
    }
    // soft vignette; stronger at night
    g.save();
    const v = g.createRadialGradient(540, 980, 330, 540, 980, 1120);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, `rgba(2,6,16,${.16 + .16 * night})`);
    g.fillStyle = v; g.fillRect(0, 0, SW, SH);
    g.restore();
  }

  /* ------------------------------------------------------------ furniture */
  function legs(g, t, topY, ry){
    const { cx, y, w } = t;
    const rx = w / 2;
    const c = TABLE[t.color];
    g.save();
    g.lineCap = 'round';
    // rear legs, mostly hidden under the top
    g.strokeStyle = c.legD; g.lineWidth = Math.max(3, w * .016);
    for (const side of [-1, 1]){
      g.beginPath();
      g.moveTo(cx + side * rx * .30, topY - ry * .42);
      g.lineTo(cx + side * rx * .42, y - t.depth * .82);
      g.stroke();
    }
    // front legs
    for (const side of [-1, 1]){
      const lg = g.createLinearGradient(cx + side * rx * .58, 0, cx + side * rx * .72, 0);
      lg.addColorStop(0, '#eef2f6'); lg.addColorStop(.55, c.leg); lg.addColorStop(1, c.legD);
      g.strokeStyle = lg; g.lineWidth = Math.max(4, w * .022);
      g.beginPath();
      g.moveTo(cx + side * rx * .56, topY + ry * .24);
      g.lineTo(cx + side * rx * .72, y - 2);
      g.stroke();
      g.strokeStyle = 'rgba(255,255,255,.45)'; g.lineWidth = Math.max(1, w * .006);
      g.beginPath();
      g.moveTo(cx + side * rx * .56, topY + ry * .26);
      g.lineTo(cx + side * rx * .70, y - 8);
      g.stroke();
    }
    // cross brace
    g.strokeStyle = c.legD; g.lineWidth = Math.max(2, w * .012);
    g.beginPath(); g.moveTo(cx - rx * .62, y - t.depth * .22); g.lineTo(cx + rx * .62, y - t.depth * .18); g.stroke();
    g.restore();
  }

  function bottle(g, x, y, s, tint = 'green'){
    const body = tint === 'green' ? '#2f6a35' : '#6b4322';
    const hi = tint === 'green' ? '#7bbd68' : '#b98750';
    g.save(); g.translate(x, y); g.scale(s, s);
    g.fillStyle = 'rgba(0,0,0,.18)'; ellipse(g, 0, 2, 18, 5); g.fill();
    g.fillStyle = body;
    roundRect(g, -12, -52, 24, 53, 8); g.fill();
    g.fillRect(-5, -72, 10, 24);
    g.fillStyle = 'rgba(255,255,255,.62)'; roundRect(g, -12, -69, 24, 9, 3); g.fill();
    g.fillStyle = hi; g.fillRect(-9, -48, 4, 34);
    g.fillStyle = '#d9c9a2'; roundRect(g, -9, -34, 18, 16, 3); g.fill();
    g.restore();
  }

  function tissue(g, x, y, s){
    g.save(); g.translate(x, y); g.scale(s, s);
    g.fillStyle = 'rgba(0,0,0,.16)'; ellipse(g, 0, 3, 30, 7); g.fill();
    g.fillStyle = '#e9e1cf'; roundRect(g, -27, -30, 54, 33, 7); g.fill();
    g.fillStyle = '#f7f1e4'; roundRect(g, -22, -34, 44, 8, 4); g.fill();
    g.fillStyle = '#d8cfba'; roundRect(g, -6, -41, 12, 12, 4); g.fill();
    g.fillStyle = '#fdfaf3'; g.beginPath(); g.moveTo(-4, -40); g.quadraticCurveTo(2, -52, 9, -41); g.closePath(); g.fill();
    g.restore();
  }

  function bowl(g, x, y, s, steam = false, t = 0){
    g.save(); g.translate(x, y); g.scale(s, s);
    g.fillStyle = 'rgba(0,0,0,.18)'; ellipse(g, 0, 3, 26, 7); g.fill();
    const rg = g.createLinearGradient(0, -18, 0, 12);
    rg.addColorStop(0, '#fffdf8'); rg.addColorStop(.6, '#f2eadb'); rg.addColorStop(1, '#cfc2ad');
    g.fillStyle = rg;
    g.beginPath(); g.moveTo(-26, -10); g.quadraticCurveTo(0, 24, 26, -10); g.closePath(); g.fill();
    g.fillStyle = '#fffdf8'; ellipse(g, 0, -10, 26, 9); g.fill();
    g.fillStyle = '#c98c45'; ellipse(g, 0, -10, 20, 6); g.fill();
    g.fillStyle = '#e8c98c'; ellipse(g, -4, -11, 8, 3); g.fill();
    g.fillStyle = '#8fbf62'; ellipse(g, 5, -10, 6, 2.5); g.fill();
    if (steam) steamWisp(g, 0, -18, 1, t);
    g.restore();
  }

  function mug(g, x, y, s){
    g.save(); g.translate(x, y); g.scale(s, s);
    g.fillStyle = 'rgba(0,0,0,.16)'; ellipse(g, 0, 2, 18, 5); g.fill();
    g.strokeStyle = 'rgba(240,235,220,.75)'; g.lineWidth = 4;
    g.beginPath(); g.arc(16, -15, 10, -1.2, 1.2); g.stroke();
    const lg = g.createLinearGradient(0, -38, 0, 2);
    lg.addColorStop(0, '#ffd581'); lg.addColorStop(.55, '#e8a129'); lg.addColorStop(1, '#b86c0e');
    g.fillStyle = lg;
    g.beginPath(); g.moveTo(-15, -38); g.lineTo(15, -38); g.lineTo(12, 1); g.lineTo(-12, 1); g.closePath(); g.fill();
    g.fillStyle = '#fffaf0'; ellipse(g, 0, -38, 15, 5); g.fill();
    g.strokeStyle = 'rgba(255,255,255,.45)'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(-10, -32); g.lineTo(-9, -6); g.stroke();
    g.restore();
  }

  function steamWisp(g, x, y, s, t){
    g.save();
    g.strokeStyle = 'rgba(255,255,255,.30)';
    g.lineWidth = 2.4 * s;
    g.lineCap = 'round';
    for (let i = 0; i < 3; i++){
      const ph = t * 1.5 + i * 2.1;
      const dx = Math.sin(ph) * 7 * s;
      g.globalAlpha = .26 + .16 * Math.sin(ph * .7);
      g.beginPath();
      g.moveTo(x + (i - 1) * 7 * s, y);
      g.bezierCurveTo(x + dx, y - 13 * s, x - dx, y - 26 * s, x + dx * .6, y - 39 * s);
      g.stroke();
    }
    g.restore();
  }

  function props(g, t, phase, tSec){
    const { cx, w } = t;
    const topY = t.topY ?? (t.y - t.depth * .55);
    const ry = t.depth / 2;
    const s = Math.max(.34, w / 300) * (t.propScale || 1);
    const px = cx, py = topY + ry * .10;
    if (phase === 'food'){
      // tray with two bowls + chopsticks in the middle of the table
      g.save();
      g.fillStyle = 'rgba(30,40,50,.22)'; ellipse(g, px, py + 3, 54 * s, 16 * s); g.fill();
      g.fillStyle = '#c5ccd3'; ellipse(g, px, py, 54 * s, 15 * s); g.fill();
      g.fillStyle = '#eef2f5'; ellipse(g, px, py - 2, 50 * s, 13 * s); g.fill();
      g.strokeStyle = '#9aa5b0'; g.lineWidth = 2 * s; ellipse(g, px, py - 2, 49 * s, 12.5 * s); g.stroke();
      bowl(g, px - 23 * s, py - 12 * s, .62 * s, true, tSec);
      bowl(g, px + 19 * s, py - 14 * s, .58 * s, true, tSec + 1.3);
      g.strokeStyle = '#b28a58'; g.lineWidth = 3 * s; g.lineCap = 'round';
      for (const d of [-5, 5]){
        g.beginPath(); g.moveTo(px + (22 + d) * s, py + 4 * s); g.lineTo(px + (48 + d) * s, py - 9 * s); g.stroke();
      }
      g.restore();
      bottle(g, cx - w * .31, py + 4 * s, .95 * s, 'brown');
      tissue(g, cx + w * .31, py + 2 * s, .95 * s);
    } else {
      bottle(g, cx - w * .30, py + 3 * s, 1.02 * s, 'green');
      bottle(g, cx + w * .33, py + 1 * s, .9 * s, 'brown');
      mug(g, cx + w * .12, py - 1 * s, .92 * s);
      // ashtray
      g.save();
      g.fillStyle = 'rgba(20,26,34,.4)'; ellipse(g, cx - w * .14, py + 2 * s, 16 * s, 7 * s); g.fill();
      g.fillStyle = '#cfd6de'; ellipse(g, cx - w * .14, py, 15 * s, 6 * s); g.fill();
      g.fillStyle = '#89929e'; ellipse(g, cx - w * .14, py, 10 * s, 3.6 * s); g.fill();
      g.restore();
    }
  }

  function drawTable(g, t, phase, tSec){
    const { cx, y, w } = t;
    const topY = y - t.depth * .55;
    const rx = w / 2, ry = t.depth / 2;
    const c = TABLE[t.color];
    // ground shadow
    g.save();
    g.fillStyle = 'rgba(5,9,16,.20)';
    ellipse(g, cx, y + 1, rx * .96, t.depth * .20); g.fill();
    g.restore();
    legs(g, t, topY, ry);
    // underside / edge band (a second ellipse peeking out under the top)
    g.save();
    g.fillStyle = c.rim;
    ellipse(g, cx, topY + Math.max(5, w * .022), rx, ry); g.fill();
    // top
    const tg = g.createLinearGradient(0, topY - ry, 0, topY + ry);
    tg.addColorStop(0, c.hi); tg.addColorStop(.32, c.top); tg.addColorStop(.72, c.mid); tg.addColorStop(1, c.low);
    g.fillStyle = tg; ellipse(g, cx, topY, rx, ry); g.fill();
    // glossy sheen
    g.globalAlpha = .18;
    const sh = g.createLinearGradient(cx - rx, topY - ry, cx + rx, topY + ry);
    sh.addColorStop(0, 'rgba(255,255,255,.9)'); sh.addColorStop(.5, 'rgba(255,255,255,0)');
    g.fillStyle = sh; ellipse(g, cx, topY, rx, ry); g.fill();
    g.globalAlpha = 1;
    // rim
    g.strokeStyle = c.rim; g.lineWidth = Math.max(2, w * .011);
    ellipse(g, cx, topY, rx, ry); g.stroke();
    g.strokeStyle = 'rgba(255,255,255,.28)'; g.lineWidth = Math.max(1, w * .005);
    ellipse(g, cx, topY + ry * .18, rx * .94, ry * .8); g.stroke();
    g.restore();
    props(g, t, phase, tSec);
  }

  /* plastic chair seen from behind, used for the near-side guests */
  function drawChairBack(g, seat){
    const { x, y, scale: s, table } = seat;
    const c = CHAIR[table.chairColor];
    const w = 205 * s, h = 86 * s;
    g.save();
    // legs and seat show below the guest's hip; the backrest hides the sprite cut
    g.fillStyle = 'rgba(5,9,16,.17)'; ellipse(g, x, y + 112 * s, 92 * s, 17 * s); g.fill();
    g.strokeStyle = c.low; g.lineWidth = Math.max(3, 9 * s); g.lineCap = 'round';
    for (const side of [-1, 1]){
      g.beginPath(); g.moveTo(x + side * 76 * s, y + 64 * s); g.lineTo(x + side * 86 * s, y + 112 * s); g.stroke();
    }
    // seat
    g.fillStyle = c.low; ellipse(g, x, y + 63 * s, 92 * s, 24 * s); g.fill();
    g.fillStyle = c.mid; ellipse(g, x, y + 59 * s, 89 * s, 22 * s); g.fill();
    // backrest
    const bg = g.createLinearGradient(0, y - 12 * s, 0, y + 48 * s);
    bg.addColorStop(0, c.top); bg.addColorStop(.55, c.mid); bg.addColorStop(1, c.low);
    g.fillStyle = bg;
    roundRect(g, x - w / 2, y - 12 * s, w, h - 28 * s, 20 * s); g.fill();
    g.fillStyle = c.hi;
    roundRect(g, x - w / 2 + 10 * s, y - 12 * s, w - 20 * s, 9 * s, 4 * s); g.fill();
    g.fillStyle = 'rgba(255,255,255,.13)';
    roundRect(g, x - w / 2 + 14 * s, y - 30 * s, w - 28 * s, 14 * s, 7 * s); g.fill();
    // side posts
    g.fillStyle = c.mid;
    roundRect(g, x - w / 2 - 5 * s, y - 30 * s, 14 * s, 56 * s, 6 * s); g.fill();
    roundRect(g, x + w / 2 - 9 * s, y - 30 * s, 14 * s, 56 * s, 6 * s); g.fill();
    g.restore();
  }

  /* empty plastic chair standing at the end of a table */
  function drawEmptyChair(g, x, groundY, s, color){
    const c = CHAIR[color];
    g.save();
    g.fillStyle = 'rgba(5,9,16,.18)'; ellipse(g, x, groundY + 2, 40 * s, 12 * s); g.fill();
    // legs
    g.strokeStyle = c.low; g.lineWidth = Math.max(2, 6 * s); g.lineCap = 'round';
    for (const side of [-1, 1]){
      g.beginPath(); g.moveTo(x + side * 38 * s, groundY - 54 * s); g.lineTo(x + side * 44 * s, groundY); g.stroke();
    }
    // seat
    g.fillStyle = c.low; ellipse(g, x, groundY - 52 * s, 48 * s, 15 * s); g.fill();
    g.fillStyle = c.mid; ellipse(g, x, groundY - 55 * s, 45 * s, 13 * s); g.fill();
    // back posts + backrest
    g.fillStyle = c.mid;
    roundRect(g, x - 40 * s, groundY - 128 * s, 10 * s, 76 * s, 4 * s); g.fill();
    roundRect(g, x + 30 * s, groundY - 128 * s, 10 * s, 76 * s, 4 * s); g.fill();
    const bg = g.createLinearGradient(0, groundY - 138 * s, 0, groundY - 82 * s);
    bg.addColorStop(0, c.top); bg.addColorStop(1, c.low);
    g.fillStyle = bg;
    roundRect(g, x - 46 * s, groundY - 138 * s, 92 * s, 46 * s, 14 * s); g.fill();
    g.fillStyle = c.hi;
    roundRect(g, x - 40 * s, groundY - 138 * s, 80 * s, 7 * s, 3 * s); g.fill();
    g.restore();
  }

  function drawEndChairs(g, t){
    const ground = t.y + 2;
    const s = t.scale * .9;
    drawEmptyChair(g, t.cx - t.w * .58, ground, s, t.chairColor);
    drawEmptyChair(g, t.cx + t.w * .58, ground, s, t.chairColor);
  }

  function drawSteam(g, x, y, s, t, alpha = .8){
    g.save(); g.globalAlpha = alpha; steamWisp(g, x, y, s, t); g.restore();
  }

  return {
    SW, SH, SKINS, SKIN_GROUPS, MENU, orderFromCoins, WALK_HIP, layout, phaseInfo, nightAt, nextSwitch, schedule,
    backKey, frontKey, walkKey, activityKey,
    drawBackground, drawAmbient, drawTable, drawProps: props, drawChairBack, drawEndChairs, drawSteam,
    drawShadow: shadow, drawEmptyChair, drawBottle: bottle, drawBowl: bowl, drawMug: mug,
  };
})();
