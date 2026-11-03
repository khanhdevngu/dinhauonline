/* City Beer Station — canvas icons shared by the static page and the LIVE overlay.
   Everything here is drawn with paths so the beer glass, foam and hop stay crisp at
   any scale and need no extra image requests. */
window.BeerFX = (function(){
  function rr(g, x, y, w, h, r){
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }

  /* A frosty mug. (x, y) is the centre of the base. s=1 is ~76×96 px. */
  function mug(g, x, y, s, opt = {}){
    const { tilt = 0, alpha = 1, fill = 1 } = opt;
    if (s <= 0 || alpha <= 0) return;
    g.save();
    g.translate(x, y);
    g.rotate(tilt);
    g.scale(s, s);
    g.globalAlpha *= alpha;

    // handle (drawn behind the glass)
    g.strokeStyle = 'rgba(255,241,214,.72)';
    g.lineWidth = 9;
    g.beginPath();
    g.arc(27, -34, 19, -Math.PI * 0.46, Math.PI * 0.46);
    g.stroke();
    g.strokeStyle = 'rgba(255,193,94,.55)';
    g.lineWidth = 3;
    g.beginPath();
    g.arc(27, -34, 23, -Math.PI * 0.42, Math.PI * 0.42);
    g.stroke();

    // glass body
    const top = -74, bot = 0, hwTop = 33, hwBot = 27;
    const grd = g.createLinearGradient(-hwTop, top, hwTop, bot);
    grd.addColorStop(0, '#ffe28f');
    grd.addColorStop(.35, '#ffc24d');
    grd.addColorStop(.72, '#e79a1f');
    grd.addColorStop(1, '#b9680d');
    g.beginPath();
    g.moveTo(-hwTop, top);
    g.lineTo(hwTop, top);
    g.lineTo(hwBot, bot - 3);
    g.quadraticCurveTo(hwBot, bot, hwBot - 5, bot);
    g.lineTo(-hwBot + 5, bot);
    g.quadraticCurveTo(-hwBot, bot, -hwBot, bot - 3);
    g.closePath();
    g.fillStyle = grd;
    g.fill();
    g.globalAlpha *= .55;
    g.fillStyle = 'rgba(255,255,255,.45)';
    g.fillRect(-hwTop + 7, top + 8, 7, 52);
    g.globalAlpha /= .55;

    // foam cap
    g.fillStyle = '#fffaf0';
    g.beginPath();
    g.ellipse(0, top - 1, hwTop - 1, 11, 0, 0, 6.29);
    g.fill();
    for (const [bx, by, br] of [[-24, -8, 11], [-11, -12, 13], [3, -10, 12], [17, -8, 11], [26, -4, 9], [-31, -2, 8]]){
      g.beginPath(); g.arc(bx, top + by + 6, br, 0, 6.29); g.fill();
    }
    if (fill > 0.85) {
      g.globalAlpha *= .85;
      g.fillStyle = '#fff3d8';
      g.beginPath(); g.arc(-6, top + 18, 3.2, 0, 6.29); g.fill();
      g.beginPath(); g.arc(11, top + 30, 2.4, 0, 6.29); g.fill();
      g.globalAlpha /= .85;
    }

    // rim
    g.strokeStyle = 'rgba(255,248,230,.65)';
    g.lineWidth = 2.4;
    g.beginPath();
    g.moveTo(-hwTop, top); g.lineTo(hwTop, top);
    g.stroke();
    g.restore();
  }

  /* Foam burst: a handful of soft circles, used for gift pops and spills. */
  function foam(g, x, y, s, alpha = 1){
    if (s <= 0 || alpha <= 0) return;
    g.save();
    g.globalAlpha *= alpha;
    g.fillStyle = '#fffaf0';
    for (const [bx, by, br] of [[-18, 0, 9], [-7, -7, 12], [5, -4, 10], [15, 2, 8], [0, 4, 7]]){
      g.beginPath(); g.arc(x + bx * s, y + by * s, br * s, 0, 6.29); g.fill();
    }
    g.restore();
  }

  /* Hop cone, drifts down as ambient confetti. */
  function hop(g, x, y, s, rot = 0, alpha = 1){
    if (s <= 0 || alpha <= 0) return;
    g.save();
    g.globalAlpha *= alpha;
    g.translate(x, y);
    g.rotate(rot);
    g.scale(s, s);
    g.strokeStyle = '#5c8f3a';
    g.lineWidth = 2;
    g.beginPath(); g.moveTo(0, -20); g.lineTo(0, -13); g.stroke();
    for (let i = 0; i < 4; i++){
      g.fillStyle = i % 2 ? '#7fbf4f' : '#96d465';
      g.beginPath();
      g.ellipse(0, -9 + i * 6, 10 - i * 1.3, 5.2, (i % 2 ? 1 : -1) * .35, 0, 6.29);
      g.fill();
    }
    g.restore();
  }

  /* Dice face for canvas effects. pips: 1..6. */
  function dice(g, x, y, s, value = 1, rot = 0, alpha = 1){
    if (s <= 0 || alpha <= 0) return;
    const P = {
      1: [[0, 0]], 2: [[-1, -1], [1, 1]], 3: [[-1, -1], [0, 0], [1, 1]],
      4: [[-1, -1], [1, -1], [-1, 1], [1, 1]],
      5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]],
      6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]],
    };
    g.save();
    g.translate(x, y);
    g.rotate(rot);
    g.scale(s, s);
    g.globalAlpha *= alpha;
    g.fillStyle = '#fff8e8';
    g.strokeStyle = '#e2a437';
    g.lineWidth = 3;
    rr(g, -24, -24, 48, 48, 10);
    g.fill(); g.stroke();
    g.fillStyle = '#2b1a0a';
    for (const [px, py] of (P[value] || P[1])){
      g.beginPath(); g.arc(px * 12, py * 12, 4.6, 0, 6.29); g.fill();
    }
    g.restore();
  }

  return { mug, foam, hop, dice, roundRect: rr };
})();
