// Chroma-keys the generated beer-garden cast into trimmed transparent WebP sprites.
// Original guests use a #00FF00 backdrop; the newer walk/eat poses use #FF00FF because
// the cast wears green, navy and denim. Run from live/: node scripts/key-sprites.mjs
import sharp from 'sharp';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, '..', '..');
const SRC = path.join(ROOT, 'vibe_images');
const OUT = path.join(ROOT, 'assets');

// output key -> { file, chroma, height }
// Guest torso sprites stay 420 high; a walk sprite is a full body (~1.8x the torso),
// so both can be drawn with the same scale factor.
const inputs = {
  man:       { file: 'guest-man_1793608507896_681ce415.png',   chroma: 'green',   height: 420 },
  woman:     { file: 'guest-woman_1793608533724_d9b7fb54.png', chroma: 'green',   height: 420 },
  uncle:     { file: 'guest-uncle_1793608556339_95044442.png', chroma: 'green',   height: 420 },
  cap:       { file: 'guest-cap_1793608602970_15575981.png',   chroma: 'green',   height: 420 },
  eat_man:   { file: 'eat-man_1793616255099_9ac9a4c4.png',     chroma: 'magenta', height: 420 },
  eat_woman: { file: 'eat-woman_1793616275966_6dd57618.png',   chroma: 'magenta', height: 420 },
  eat_uncle: { file: 'eat-uncle_1793616297567_bd49453a.png',   chroma: 'magenta', height: 420 },
  eat_cap:   { file: 'eat-cap_1793616318617_2c4be74e.png',     chroma: 'magenta', height: 420 },
  walk_man:   { file: 'walk-man_1793616146973_5b424c0c.png',   chroma: 'magenta', height: 760 },
  walk_woman: { file: 'walk-woman_1793616175502_bfb0476c.png', chroma: 'magenta', height: 760 },
  walk_uncle: { file: 'walk-uncle_1793616195213_32602c5f.png', chroma: 'magenta', height: 760 },
  walk_cap:   { file: 'walk-cap_1793616214323_dd3c21bb.png',   chroma: 'magenta', height: 760 },
  front_beer_man:   { file: 'sit-beer-man_1793616514541_4c4f4793.png',   chroma: 'magenta', height: 420 },
  front_beer_woman: { file: 'sit-beer-woman2_1793616725493_a3642b25.png', chroma: 'magenta', height: 420 },
  front_beer_uncle: { file: 'sit-beer-uncle_1793616564897_a10b5ee0.png', chroma: 'magenta', height: 420 },
  front_beer_cap:   { file: 'sit-beer-cap_1793616587666_9b459b94.png',   chroma: 'magenta', height: 420 },
  front_eat_man:    { file: 'sit-eat-man_1793616617304_d2eeb772.png',    chroma: 'magenta', height: 420 },
  front_eat_woman:  { file: 'sit-eat-woman_1793616636339_72886ff9.png',  chroma: 'magenta', height: 420 },
  front_eat_uncle:  { file: 'sit-eat-uncle_1793616658057_ec06d771.png',  chroma: 'magenta', height: 420 },
  front_eat_cap:    { file: 'sit-eat-cap_1793616680220_38b20151.png',    chroma: 'magenta', height: 420 },
  sexy:            { file: 'sexy-guest-beer_1793670100172_3c7fb628.png',      chroma: 'magenta', height: 420 },
  eat_sexy:        { file: 'sexy-eat-pho_1793670130986_504d53bc.png',        chroma: 'magenta', height: 420 },
  walk_sexy:       { file: 'sexy-walk_1793670159889_8b0e9098.png',            chroma: 'magenta', height: 760 },
  front_beer_sexy: { file: 'sexy-front-beer_1793670184678_8f357f08.png',     chroma: 'magenta', height: 420 },
  front_eat_sexy:  { file: 'sexy-front-eat_1793670214237_70b4b34f.png',      chroma: 'magenta', height: 420 },
  oldwoman:            { file: 'oldwoman-guest-beer_1793670243153_d20c9478.png',      chroma: 'magenta', height: 420 },
  eat_oldwoman:        { file: 'oldwoman-eat-pho_1793670634288_fbf8b268.png',        chroma: 'magenta', height: 420 },
  walk_oldwoman:       { file: 'oldwoman-walk_1793670662774_7caacd7a.png',            chroma: 'magenta', height: 760 },
  front_beer_oldwoman: { file: 'oldwoman-front-beer_1793670692817_76564139.png',     chroma: 'magenta', height: 420 },
  front_eat_oldwoman:  { file: 'oldwoman-front-eat_1793670718705_bb033fb4.png',      chroma: 'magenta', height: 420 },
};

// Returns 0..255 key strength for a pixel (higher = more chroma).
const CHROMA = {
  green: (r, g, b) => g - Math.max(r, b),
  magenta: (r, g, b) => Math.min(r, b) - g,
};
const STRONG = 45, WEAK = 12;          // green ramp
const M_STRONG = 150, M_WEAK = 55;     // magenta ramp

for (const [key, spec] of Object.entries(inputs)) {
  const { data, info } = await sharp(path.join(SRC, spec.file)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height } = info;
  const strength = CHROMA[spec.chroma];
  const strong = spec.chroma === 'green' ? STRONG : M_STRONG;
  const weak = spec.chroma === 'green' ? WEAK : M_WEAK;
  let minX = width, minY = height, maxX = -1, maxY = -1;
  const colHits = new Int32Array(width), rowHits = new Int32Array(height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const r = data[i], g = data[i + 1], b = data[i + 2];
      const m = strength(r, g, b);
      let a = 255;
      if (m > strong) a = 0;
      else if (m > weak) a = Math.round((strong - m) / (strong - weak) * 255);
      if (spec.chroma === 'green' && m > weak) {
        const mm = Math.max(r, b);
        data[i] = Math.round((r + mm) / 2);
        data[i + 1] = mm;
        data[i + 2] = Math.round((b + mm) / 2);
      } else if (spec.chroma === 'magenta' && m > 12) {
        // Pull magenta spill out of hair and fabric edges without touching warm skin.
        const cap = g + 42;
        if (data[i] > cap) data[i] = cap;
        if (data[i + 2] > cap) data[i + 2] = cap;
      }
      data[i + 3] = a;
      if (a < 80){ data[i] = 0; data[i + 1] = 0; data[i + 2] = 0; data[i + 3] = 0; continue; }
      if (a > 150){ colHits[x]++; rowHits[y]++; }
    }
  }
  // Trim on column/row density, not on single stray pixels: background noise and soft
  // shadows would otherwise stretch the sprite far beyond the character.
  const colMin = Math.max(3, Math.round(height * .004)), rowMin = Math.max(3, Math.round(width * .004));
  const edgeX = Math.round(width * .015), edgeY = Math.round(height * .01);
  for (let x = edgeX; x < width - edgeX; x++) if (colHits[x] >= colMin){ if (x < minX) minX = x; if (x > maxX) maxX = x; }
  for (let y = edgeY; y < height - edgeY; y++) if (rowHits[y] >= rowMin){ if (y < minY) minY = y; if (y > maxY) maxY = y; }
  if (maxX < 0) { console.warn(`skip ${key}: nothing left after keying`); continue; }
  const box = { left: minX, top: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
  const file = ['man', 'woman', 'uncle', 'cap', 'sexy', 'oldwoman'].includes(key) ? `guest_${key}.webp` : `${key}.webp`;
  await sharp(data, { raw: { width, height, channels: 4 } })
    .extract(box)
    .resize({ height: spec.height, fit: 'inside', withoutEnlargement: false })
    .webp({ quality: 90, alphaQuality: 96, effort: 6 })
    .toFile(path.join(OUT, file));
  const out = await sharp(path.join(OUT, file)).metadata();
  console.log(`${file} ${out.width}x${out.height}`);
}
