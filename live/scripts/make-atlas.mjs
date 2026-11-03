// Builds assets/atlas.webp + assets/atlas.json from the guest sprites.
// Run from live/: npm run assets:atlas
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const ASSETS = path.resolve(here, '..', '..', 'assets');

const SPRITES = {
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

const WIDTH = 1280, GAP = 6;

const items = [];
for (const [key, file] of Object.entries(SPRITES)) {
  const { width, height } = await sharp(path.join(ASSETS, file)).metadata();
  items.push({ key, file, w: width, h: height });
}

items.sort((a, b) => b.h - a.h);
let x = GAP, y = GAP, rowH = 0;
for (const it of items) {
  if (x + it.w + GAP > WIDTH) { x = GAP; y += rowH + GAP; rowH = 0; }
  it.x = x; it.y = y;
  x += it.w + GAP;
  rowH = Math.max(rowH, it.h);
}
const height = Math.ceil((y + rowH + GAP) / 2) * 2;

const atlas = await sharp({ create: { width: WIDTH, height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
  .composite(items.map(it => ({ input: path.join(ASSETS, it.file), left: it.x, top: it.y })))
  .webp({ quality: 92, alphaQuality: 95, effort: 6 })
  .toBuffer();

fs.writeFileSync(path.join(ASSETS, 'atlas.webp'), atlas);
const meta = {
  image: 'atlas.webp',
  width: WIDTH,
  height,
  sprites: Object.fromEntries(items.map(it => [it.key, { x: it.x, y: it.y, w: it.w, h: it.h }])),
};
fs.writeFileSync(path.join(ASSETS, 'atlas.json'), JSON.stringify(meta, null, 1) + '\n');
console.log(`atlas.webp ${WIDTH}x${height} · ${(atlas.length / 1024).toFixed(1)} KB · ${items.length} sprites`);
