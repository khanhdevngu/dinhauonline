// City Beer Station — live server
// Runs on the streaming PC. Serves the overlay + control panel, listens to a TikTok LIVE room,
// keeps the list of seated guests, generates Vietnamese voice lines with Edge/Google TTS and
// pushes everything to the overlay over WebSocket.
//
//   cd live && npm install && node server.mjs        → http://localhost:3000/live/control.html
//
import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');            // repo root: serves /assets, /live
const TTS_DIR = path.join(__dirname, 'tts');
fs.mkdirSync(TTS_DIR, { recursive: true });
for (const f of fs.readdirSync(TTS_DIR)) { try { fs.unlinkSync(path.join(TTS_DIR, f)); } catch {} }
const AVATAR_DIR = path.join(__dirname, 'avatar-cache');
fs.mkdirSync(AVATAR_DIR, { recursive: true });
const PORT = +process.env.PORT || 3000;

/* ------------------------------------------------------------------ state */
const settings = {
  title: 'City Beer Station',
  subtitle: 'Một hoa hồng · Một ly bia',
  voice: 'google',                   // 'google' (stable, fast) | vi-VN-NamMinhNeural | vi-VN-HoaiMyNeural (Edge)
  pitch: -8,                         // Hz
  rate: -4,                          // %
  music: true, musicVolume: 50, musicTrack: '',      // musicTrack: '' = play the library in order
  sfx: true, ambience: true,                         // ambience: crowd murmur, clinks, cheers
  autoToast: true, toastEveryMin: 3,
  seatMode: 'auto',                  // auto | 24 | 36 | 48 | 64
  autoSeatFollowers: true,           // seat viewers who already follow the channel when they enter
  phaseMode: 'auto',                 // auto (clock) | food (always day) | beer (always night)
  foodFrom: 5,                       // hour the rice/pho day starts
  beerFrom: 16,                      // hour the beer evening starts
  gifts: { readAll: true, minDiamonds: 1 },
};
const viewers = new Map();           // id -> { id, name, skin, avatar, beers, followed, joinedAt, lastAt, lastText, lastTextAt, demo }
const startedAt = Date.now();
let totalBeers = 0;                  // every beer ever poured this session (stays after a guest leaves)
let tiktok = null, tiktokConnecting = false, tiktokState = { status: 'idle', uniqueId: '', error: '' };
const seenEventIds = new Map();
function firstEvent(key){
  if (!key) return true;
  const now = Date.now();
  if (seenEventIds.has(key)) return false;
  seenEventIds.set(key, now);
  if (seenEventIds.size > 3000){
    for (const [k, t] of seenEventIds) if (now - t > 120_000) seenEventIds.delete(k);
  }
  return true;
}
const msgKey = (d, type) => {
  const id = d?.common?.msgId ?? d?.msgId ?? d?.messageId;
  return id ? `${type}:${id}` : '';
};
const log = [];
function addLog(s){ const line = `[${new Date().toLocaleTimeString('vi-VN')}] ${s}`; log.push(line); if (log.length > 300) log.shift(); broadcast({ t:'log', line }, 'control'); console.log(line); }

/* ---------------------------------------------------------- avatar cache */
// Avatar URLs come from untrusted live events. Fetch them only over https from known TikTok CDN hosts,
// re-check redirects, cap the response size, shrink to 160px WebP and cache on disk. Viewers never hit the CDN.
const AVATAR_HOSTS = /\.(tiktokcdn\.com|tiktokcdn-us\.com|tiktokcdn-eu\.com|tiktokcdn-asia\.com|ibytedtos\.com|byteimg\.com|tiktokv\.com)$/i;
const AVATAR_MAX_BYTES = 3 * 1024 * 1024, AVATAR_MAX_FILES = 400, AVATAR_SIZE = 160, AVATAR_CONCURRENCY = 4;
function avatarUrl(raw){
  const s = String(raw || '');
  if (s.length > 2048) return null;
  let u; try { u = new URL(s); } catch { return null; }
  if (u.protocol !== 'https:' || !AVATAR_HOSTS.test(u.hostname)) return null;
  return u;
}
let avatarActive = 0;
const avatarQueue = [];
function avatarSlot(){ return new Promise(resolve => { if (avatarActive < AVATAR_CONCURRENCY){ avatarActive++; resolve(); } else avatarQueue.push(resolve); }); }
function avatarFree(){ const next = avatarQueue.shift(); if (next) next(); else avatarActive--; }
async function downloadAvatar(url, depth = 0){
  const res = await fetch(url, {
    redirect: 'manual',
    signal: AbortSignal.timeout(8000),
    headers: {
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36',
      'accept': 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
    },
  });
  if (res.status >= 300 && res.status < 400){
    const loc = res.headers.get('location');
    if (!loc || depth >= 2) throw new Error('avatar redirect');
    const next = avatarUrl(new URL(loc, url).href);
    if (!next) throw new Error('avatar redirect host');
    return downloadAvatar(next.href, depth + 1);
  }
  if (!res.ok) throw new Error('avatar HTTP ' + res.status);
  if (!/^image\//i.test(res.headers.get('content-type') || '')) throw new Error('avatar not an image');
  if (+res.headers.get('content-length') > AVATAR_MAX_BYTES) throw new Error('avatar too large');
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > AVATAR_MAX_BYTES) throw new Error('avatar too large');
  return buf;
}
const avatarJobs = new Map();
let avatarPrunedAt = 0;
async function pruneAvatars(){
  if (Date.now() - avatarPrunedAt < 30_000) return;
  avatarPrunedAt = Date.now();
  const files = await fs.promises.readdir(AVATAR_DIR).catch(() => []);
  if (files.length <= AVATAR_MAX_FILES) return;
  const list = (await Promise.all(files.map(async f => {
    const st = await fs.promises.stat(path.join(AVATAR_DIR, f)).catch(() => null);
    return st ? { f, t: st.mtimeMs } : null;
  }))).filter(Boolean).sort((a, b) => a.t - b.t);
  for (const x of list.slice(0, list.length - AVATAR_MAX_FILES)) fs.promises.unlink(path.join(AVATAR_DIR, x.f)).catch(() => {});
}
async function buildAvatar(url, file){
  await avatarSlot();
  try {
    const raw = await downloadAvatar(url);
    const webp = await sharp(raw).rotate()
      .resize(AVATAR_SIZE, AVATAR_SIZE, { fit: 'cover', withoutEnlargement: true })
      .webp({ quality: 82, effort: 4 }).toBuffer();
    const tmp = file + '.tmp';
    await fs.promises.writeFile(tmp, webp);
    await fs.promises.rename(tmp, file);
    pruneAvatars();
  } finally { avatarFree(); }
}
async function serveAvatar(req, res, rawUrl){
  const u = avatarUrl(rawUrl);
  if (!u){ res.writeHead(400).end('bad avatar url'); return; }
  const file = path.join(AVATAR_DIR, createHash('sha256').update(u.href).digest('hex').slice(0, 40) + '.webp');
  const send = size => {
    res.writeHead(200, { 'Content-Type': 'image/webp', 'Content-Length': String(size),
      'Cache-Control': 'private, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff' });
    if (req.method === 'HEAD') res.end();
    else fs.createReadStream(file).pipe(res);
  };
  try { const st = await fs.promises.stat(file); if (st.isFile()){ send(st.size); return; } } catch {}
  let job = avatarJobs.get(file);
  if (!job){ job = buildAvatar(u.href, file).finally(() => avatarJobs.delete(file)); avatarJobs.set(file, job); }
  try { await job; } catch { res.writeHead(404).end('avatar unavailable'); return; }
  try { const st = await fs.promises.stat(file); send(st.size); } catch { res.writeHead(404).end('avatar unavailable'); }
}

const CAPS = [24, 36, 48, 64];
function capacity(){
  const need = CAPS.find(c => viewers.size <= c) || 64;
  return settings.seatMode === 'auto' ? need : Math.max(+settings.seatMode, need);
}

/* skins: dáng ngồi that exist in /assets. */
// A comment changes the outfit only when it IS the keyword (≤ 3 words).
// Each keyword maps to a group of characters; the system picks one at random from the group.
const SKIN_GROUPS = {
  male:     ['man', 'cap'],
  female:   ['woman', 'sexy'],
  oldman:   ['uncle'],
  oldwoman: ['oldwoman'],
};
const SKIN_LABEL = { man: 'nam', cap: 'nam mũ lưỡi trai', woman: 'nữ', sexy: 'nữ gợi cảm', uncle: 'ông già', oldwoman: 'bà già' };
const SKIN_WORDS = [
  [['man', 'cap'],      ['nam','anh','trai']],
  [['woman', 'sexy'],   ['nữ','nu','chị','chi','gái','gai','em','bé','be']],
  [['uncle'],           ['ông','ong','chú','chu','bác','bac','già','gia','cụ ông','cu ong']],
  [['oldwoman'],        ['bà','ba','má','ma','cụ bà','cu ba','bà già']],
  [['cap'],             ['mũ','mu','nón','non','cap','mũ lưỡi trai','mu lui trai']],
  [['sexy'],            ['sexy','gợi cảm','quyến rũ','goi cam']],
  [['uncle', 'oldwoman'], ['cụ','cu']],
];
function pickSkin(list, current){
  if (list.length === 1) return list[0];
  const other = list.filter(s => s !== current);       // prefer a visible change
  const pool = other.length ? other : list;
  return pool[Math.floor(Math.random() * pool.length)];
}
function skinFromText(t, current){
  const w = String(t).toLowerCase().normalize('NFC').replace(/[^\p{L}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
  if (!w || w.split(' ').length > 3) return null;
  for (const [skins, words] of SKIN_WORDS) if (words.some(k => w === k || w.startsWith(k + ' '))) return pickSkin(skins, current);
  return null;
}
const DEFAULT_SKINS = ['man', 'woman', 'woman', 'cap', 'sexy', 'uncle', 'oldwoman'];

/* -------------------------------------------------------------- menu / order
   Gift value is measured in xu (1 xu = 1 coin). The menu turns xu into dishes:
   1 xu = 1 bia, 5 xu = 1 phở, so a bigger gift buys phở instead of more bia. */
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

function pub(v){ return { id:v.id, name:v.name, skin:v.skin, avatar:v.avatar||'', beers:v.beers, followed:!!v.followed, demo:!!v.demo }; }
function snapshot(){ return { t:'state', settings, viewers:[...viewers.values()].map(pub), cap: capacity(), startedAt, tiktok: tiktokState, barBeers: totalBeers, menu: MENU }; }

function seat(id, name, opts = {}){
  let v = viewers.get(id);
  if (v){ v.lastAt = Date.now(); if (opts.avatar) v.avatar = opts.avatar; if (opts.followed) v.followed = true; return { v, isNew:false }; }
  if (viewers.size >= 64){                      // full: the longest-quiet non-drinker stands up
    const quiet = [...viewers.values()].filter(x => x.beers === 0).sort((a,b) => a.lastAt - b.lastAt)[0];
    if (!quiet) return { v:null, isNew:false };
    viewers.delete(quiet.id); broadcast({ t:'leave', id: quiet.id });
  }
  v = { id, name: (name||id).slice(0, 18), skin: opts.skin || DEFAULT_SKINS[viewers.size % DEFAULT_SKINS.length],
        avatar: opts.avatar || '', beers: 0, followed: !!opts.followed, joinedAt: Date.now(), lastAt: Date.now(), demo: !!opts.demo };
  viewers.set(id, v);
  broadcast({ t:'join', v: pub(v), cap: capacity() });
  return { v, isNew:true };
}

/* ------------------------------------------------------------- events in */
const chatMemo = new Map();
const followerIds = new Set();     // seen following during this live, in case a join event omits followInfo
function rememberChat(id, text){
  if (!id) return;
  if (chatMemo.size > 500) chatMemo.clear();
  chatMemo.set(id, { text, at: Date.now() });
}
const isCheer = t => /(^|\s)(dz[oô]|zo|dzo|dzô)(\s|$|[!.,])/iu.test(String(t || '').normalize('NFC'));

function onChat(id, name, text, avatar){
  text = String(text || '').slice(0, 120);
  rememberChat(id, text);
  const v = viewers.get(id);
  if (!v) return;                               // only seated (following) viewers appear on the overlay
  v.lastAt = Date.now();
  if (avatar) v.avatar = avatar;
  v.lastText = text; v.lastTextAt = Date.now();
  const want = skinFromText(text, v.skin);
  if (want && want !== v.skin){ v.skin = want; broadcast({ t:'skin', id, skin: want }); addLog(`🎭 ${v.name} đổi sang dáng ${SKIN_LABEL[want] || want}`); }
  broadcast({ t:'chat', id, name: v.name, text });
  if (isCheer(text)){
    broadcast({ t:'cheer', id, name: v.name });
    addLog(`🥂 ${v.name} hô dzô`);
  }
}

function onFollow(id, name, avatar){
  if (!id) return;
  if (followerIds.size > 5000) followerIds.clear();
  followerIds.add(id);
  const { v } = seat(id, name, { avatar, followed: true });
  const who = v?.name || String(name || 'ẩn danh').slice(0, 18);
  broadcast({ t:'follow', id, name: who });
  addLog(`❤ ${who} theo dõi chủ quán`);
  say(`Dzô! Chào mừng ${spoken(who)} vừa ghé quán bia City Beer Station. Mời chọn một bàn trống và nâng ly!`, { tag:'follow', id });
}

const normGift = s => String(s || '').toLowerCase().normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/[^a-z0-9\s]/g, ' ')
  .replace(/\s+/g, ' ').trim();
const ROSE_GIFTS = new Set(['hoa hong', 'rose', 'hong']);
const DICE_GIFTS = new Set(['co bon la', 'shamrock', 'xuc xac', 'dice', 'bau cua']);
const isFollower = u => Number(u?.followInfo?.followStatus ?? 0) >= 1 || u?.isFollower === true;

function onGift(id, name, giftName, count, diamonds, avatar, followed){
  giftName = String(giftName || 'quà').slice(0, 30); count = Math.max(1, Math.min(9999, +count || 1));
  const { v } = seat(id, name, { avatar, followed });
  if (!v) return;
  if (followed) followerIds.add(id);
  const beers = Math.max(1, Math.min(999, (diamonds || 1) * (count || 1)));
  v.beers += beers; totalBeers += beers;
  const order = orderFromCoins(beers);
  const key = normGift(giftName);
  const rose = ROSE_GIFTS.has(key) || key.startsWith('hoa hong');
  const diceGift = DICE_GIFTS.has(key);
  const kind = rose ? 'rose' : beers >= 20 ? 'tower' : 'beer';
  const tier = beers >= 20 ? 3 : beers >= 5 ? 2 : 1;
  broadcast({ t:'beer', id, name: v.name, giftName, beers, total: v.beers, barBeers: totalBeers, tier, kind, card: !diceGift, order });
  addLog(`🍺 ${v.name} đã gọi ${order.text} (${beers} xu) · ${giftName}`);
  if (diceGift){ rollDiceFor(v, giftName, 0); return; }
  // Every gift gets the giver's name called out, not only the rose.
  const line = beers >= 20
    ? `Quá đỉnh! Xin xướng danh ${spoken(v.name)} vừa tặng ${giftName}, đã gọi ${order.text}. Tổng cộng ${v.beers} xu. Cả quán nâng ly chúc mừng. Dzô dzô dzô!`
    : rose
      ? `Xin xướng danh ${spoken(v.name)} vừa tặng ${giftName}, đã gọi ${order.text}. Tổng cộng ${v.beers} xu. Cả quán dzô!`
      : `Xin xướng danh ${spoken(v.name)} vừa tặng ${giftName}, đã gọi ${order.text}. Tổng cộng ${v.beers} xu. Dzô!`;
  if (settings.gifts.readAll || beers >= settings.gifts.minDiamonds) say(line, { tag:'gift', id });
}

const spoken = s => String(s).replace(/[_@.]+/g, ' ').replace(/[^\p{L}\p{N}\s]/gu, '').trim() || 'ẩn danh';

/* ------------------------------------------------------------ xúc xắc */
// One "Cỏ bốn lá" gift = one roll of three dice. The gift's own beer value is already
// counted by onGift; the roll adds a bonus on top.
const CHALLENGES = [
  'Mời người bên trái một ly.', 'Uống cạn trong một hơi.', 'Cả bàn cùng nâng ly.', 'Chia ly cho người đối diện.',
  'Hát một câu rồi uống.', 'Chọn người kế tiếp mời bia.', 'Kể một câu chuyện vui rồi dzô.', 'Cụng ly với người gần nhất.',
];
function rollDiceFor(v, giftName = 'Cỏ bốn lá', base = 0){
  if (!v) return;
  const dice = [1, 2, 3].map(() => 1 + Math.floor(Math.random() * 6));
  const sum = dice.reduce((a, b) => a + b, 0);
  let label, cls, bonus;
  if (dice[0] === dice[1] && dice[1] === dice[2]){ label = 'BÃO!'; cls = 'bao'; bonus = 3; }
  else if (sum >= 15){ label = 'TAY CHƠI'; cls = 'lon'; bonus = 2; }
  else if (sum >= 9){ label = 'CHUẨN BÀI'; cls = 'thuong'; bonus = 1; }
  else { label = 'NON'; cls = 'nho'; bonus = 0; }
  const gained = Math.max(0, base) + bonus;
  if (gained){ v.beers += gained; totalBeers += gained; }
  const challenge = CHALLENGES[Math.floor(Math.random() * CHALLENGES.length)];
  broadcast({ t:'dice', id: v.id, viewer: v.name, giftName, dice, sum, label, class: cls, bonus, gained,
              challenge, total: v.beers, barBeers: totalBeers });
  addLog(`🎲 ${v.name} lắc ${dice.join('-')} = ${sum} · ${label} (thưởng ${bonus} bia, tổng ${v.beers} xu)`);
  say(`Xin xướng danh ${spoken(v.name)} vừa tặng ${giftName}, lắc xúc xắc được ${label}, tổng ${sum} điểm. ${challenge} ${bonus > 0 ? 'Thưởng ' + bonus + ' bia.' : 'Không thưởng thêm, nhưng vẫn vui.'} Tổng cộng ${v.beers} xu. Dzô!`, { tag:'dice', id: v.id });
  if (cls === 'bao') broadcast({ t:'toast', text:'CẢ QUÁN DZÔ!', sub:`${v.name} lắc được BÃO` });
}

/* ------------------------------------------------------------------ TTS */
const ttsQueue = []; let ttsBusy = false, ttsSeq = 0;
// The public Edge endpoint streams at roughly playback speed and drops sockets (close 1006) once
// it throttles a client, so long lines used to arrive minutes late or half-spoken. Google
// Translate TTS answers a 150-character chunk in well under a second, so it is the default voice.
// Edge stays in the voice picker, and if Google fails a line falls back to Edge. Chunks are cached
// in memory: fixed lines repeat, so they cost nothing after the first read.
const TTS_IDLE_MS = 5 * 60_000, TTS_TIMEOUT_MS = 20_000, TTS_RETRY_COOLDOWN_MS = 5000;
const TTS_CHUNK_CHARS = 150, TTS_EDGE_PAUSE_MS = 30_000, TTS_CACHE_MAX = 200;
const TTS_FAMILY = process.env.TTS_IP_FAMILY === '6' ? 6 : process.env.TTS_IP_FAMILY === '0' ? 0 : 4;
const ttsAgent = new https.Agent({ keepAlive: true, family: TTS_FAMILY });
let tts = null, ttsIdleTimer = null, ttsCooldownUntil = 0, ttsEdgeDownUntil = 0;
const ttsCache = new Map();
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ttsEngine = () => settings.voice === 'google' ? 'google' : 'edge';
function cacheKey(engine, text){ return `${engine}|${text}`; }
function cacheGet(key){
  const hit = ttsCache.get(key); if (!hit) return null;
  ttsCache.delete(key); ttsCache.set(key, hit);        // refresh its place in the queue
  return hit;
}
function cachePut(key, audio){
  ttsCache.set(key, audio);
  while (ttsCache.size > TTS_CACHE_MAX) ttsCache.delete(ttsCache.keys().next().value);
}
function ttsClient(){
  clearTimeout(ttsIdleTimer); ttsIdleTimer = null;
  if (!tts) tts = new MsEdgeTTS({ synthesisTimeoutMs: TTS_TIMEOUT_MS, agent: ttsAgent });
  return tts;
}
function closeTTS(){
  clearTimeout(ttsIdleTimer); ttsIdleTimer = null;
  const old = tts; tts = null;
  if (old) try { old.close(); } catch {}
}
function scheduleTTSIdle(){
  clearTimeout(ttsIdleTimer);
  ttsIdleTimer = setTimeout(() => { if (!ttsBusy && !ttsQueue.length) closeTTS(); }, TTS_IDLE_MS);
}
function esc(s){ return String(s).replace(/[<>&"']/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&apos;'}[c])); }
function say(text, meta = {}){
  const s = String(text).trim();
  if (!s) return;
  if (ttsQueue.length >= 15) { addLog('Hàng đợi giọng đọc đầy, bỏ qua 1 câu'); return; }
  ttsQueue.push({ text: s.slice(0, 500), meta }); pumpTTS();
}
async function warmTTS(){
  if (ttsEngine() === 'google') return;
  try {
    await ttsClient().setMetadata(settings.voice, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3);
    if (!ttsBusy) scheduleTTSIdle();
  } catch (e) {
    console.warn('TTS warm-up:', e?.message || e);
    closeTTS();
  }
}
function splitChunks(text, max = TTS_CHUNK_CHARS){
  const sentences = String(text).replace(/\s+/g, ' ').trim().split(/(?<=[.!?…;:])\s+/u);
  const chunks = [];
  let buf = '';
  for (const sentence of sentences){
    let s = sentence;
    while (s.length > max){                       // no punctuation to lean on: cut at a word boundary
      let cut = s.lastIndexOf(' ', max);
      if (cut < max * 0.5) cut = max;
      chunks.push(s.slice(0, cut).trim());
      s = s.slice(cut).trim();
    }
    if (!s) continue;
    if (!buf) buf = s;
    else if (buf.length + 1 + s.length <= max) buf += ' ' + s;
    else { chunks.push(buf); buf = s; }
  }
  if (buf) chunks.push(buf);
  return chunks.length ? chunks : [String(text).slice(0, max)];
}
async function synthChunk(text){
  const t = ttsClient();
  await t.setMetadata(settings.voice, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3);
  const { audioStream } = t.toStream(esc(text), { pitch: `${settings.pitch >= 0 ? '+' : ''}${settings.pitch}Hz`, rate: `${settings.rate >= 0 ? '+' : ''}${settings.rate}%` });
  const parts = [];
  await new Promise((res, rej) => { audioStream.on('data', c => parts.push(c)); audioStream.on('close', res); audioStream.on('error', rej); });
  if (!parts.length) throw new Error('không nhận được âm thanh');
  return Buffer.concat(parts);
}
async function synthChunkSafe(text){
  let lastError;
  for (let attempt = 1; attempt <= 2; attempt++){
    try { return await synthChunk(text); }
    catch (e) {
      lastError = e;
      closeTTS();                                 // force a clean socket for the retry
      if (attempt < 2) await sleep(400 + Math.random() * 300);   // let Edge clear the dropped socket before reconnecting
    }
  }
  throw lastError;
}
async function edgeChunk(text){ return synthChunkSafe(text); }
async function googleChunk(text){
  const key = cacheKey('google', text);
  const hit = cacheGet(key); if (hit) return hit;
  const url = 'https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=vi&q=' + encodeURIComponent(text);
  let lastError;
  for (let attempt = 1; attempt <= 2; attempt++){
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36',
          'Referer': 'https://translate.google.com/',
        },
        signal: AbortSignal.timeout(TTS_TIMEOUT_MS),
      });
      if (!res.ok) throw new Error(`giọng Google HTTP ${res.status}`);
      const audio = Buffer.from(await res.arrayBuffer());
      if (audio.length < 2 || audio[0] !== 0xff || (audio[1] & 0xe0) !== 0xe0)
        throw new Error('giọng Google trả về dữ liệu không phải MP3');
      cachePut(key, audio);
      return audio;
    } catch (e) {
      lastError = e;
      if (attempt < 2) await sleep(350 + Math.random() * 250);
    }
  }
  throw lastError;
}
async function synthAll(chunks, fn, label){
  const parts = [], t0 = Date.now();
  for (const chunk of chunks) parts.push(await fn(chunk));
  const audio = Buffer.concat(parts);
  if (!audio.length) throw new Error('không nhận được âm thanh');
  if (process.env.TTS_DEBUG) console.log(`TTS ${label}: ${chunks.length} đoạn, ${audio.length} byte, ${Date.now() - t0} ms`);
  return audio;
}
async function synthLine(text){
  const chunks = splitChunks(text);
  if (ttsEngine() === 'google'){
    try { return { audio: await synthAll(chunks, googleChunk, 'Google'), engine: 'google' }; }
    catch (e) {
      addLog(`Google TTS lỗi, chuyển sang Edge cho câu này: ${e?.message || e}`);
      return { audio: await synthAll(chunks, edgeChunk, 'Edge'), engine: 'edge' };
    }
  }
  if (Date.now() < ttsEdgeDownUntil)
    return { audio: await synthAll(chunks, googleChunk, 'Google'), engine: 'google' };
  try { return { audio: await synthAll(chunks, edgeChunk, 'Edge'), engine: 'edge' }; }
  catch (e) {
    ttsEdgeDownUntil = Date.now() + TTS_EDGE_PAUSE_MS;
    addLog(`Edge TTS trục trặc, dùng giọng Google cho câu này: ${e?.message || e}`);
    return { audio: await synthAll(chunks, googleChunk, 'Google'), engine: 'google' };
  }
}
async function pumpTTS(){
  if (ttsBusy || !ttsQueue.length) return;
  const wait = ttsCooldownUntil - Date.now();
  if (wait > 0){ setTimeout(pumpTTS, wait); return; }   // Edge just failed: let the queue wait instead of hammering
  ttsBusy = true;
  const { text, meta } = ttsQueue.shift();
  try {
    const { audio, engine } = await synthLine(text);
    const file = `tts_${Date.now()}_${++ttsSeq}.mp3`;
    fs.writeFileSync(path.join(TTS_DIR, file), audio);
    broadcast({ t:'tts', url: `/live/tts/${file}`, text, rate: engine === 'google' ? settings.rate : 0, ...meta });
    const old = fs.readdirSync(TTS_DIR).sort(); while (old.length > 40) { try { fs.unlinkSync(path.join(TTS_DIR, old.shift())); } catch {} }
  } catch (e) {
    addLog('TTS lỗi: ' + (e?.message || e));
    ttsCooldownUntil = Date.now() + TTS_RETRY_COOLDOWN_MS;   // Edge is likely throttling: stop hammering it
  } finally {
    ttsBusy = false; scheduleTTSIdle(); setTimeout(pumpTTS, 50);
  }
}

/* ------------------------------------------------------------- group toast */
const TOASTS = [
  ['CẢ QUÁN DZÔ!', 'Một, hai, ba…'],
  ['NÂNG LY NÀO!', 'Một hoa hồng, một ly bia'],
  ['DZÔ DZÔ DZÔ!', 'Bia lạnh đã sẵn'],
];
let toastTimer = null, toastIdx = 0;
function groupToast(){
  const [text, sub] = TOASTS[toastIdx++ % TOASTS.length];
  broadcast({ t:'toast', text, sub });
  say('Cả quán ơi. Một, hai, ba, dzô!', { tag:'toast' });
  addLog('📣 Cả quán dzô');
}
function scheduleToast(){ clearInterval(toastTimer); if (settings.autoToast) toastTimer = setInterval(groupToast, Math.max(1, settings.toastEveryMin) * 60_000); }
scheduleToast();

/* --------------------------------------------------------------- TikTok */
let TikTokLib = null;
let tiktokGen = 0;                    // bumps on every connect/disconnect; stale connections are ignored
async function connectTikTok(uniqueId){
  uniqueId = String(uniqueId || '').trim().replace(/^.*tiktok\.com\/@?/i, '').replace(/^@/, '').replace(/\/.*$/, '');
  if (!uniqueId) return;
  // Two concurrent connect requests used to open two live sockets → every event fired twice.
  if (tiktokConnecting){ addLog('TikTok: đang kết nối, bỏ qua yêu cầu trùng'); return; }
  tiktokConnecting = true;
  const gen = ++tiktokGen;
  const alive = () => gen === tiktokGen;
  try {
    if (tiktok){ const old = tiktok; tiktok = null; try { await old.disconnect(); } catch {} }
    if (!alive()) return;
    seenEventIds.clear();
    tiktokState = { status: 'connecting', uniqueId, error: '' }; broadcast({ t:'tiktok', ...tiktokState });
    try {
      TikTokLib ||= await import('piratetok-live-js');
      if (!alive()) return;
      const { TikTokLiveClient, EventType, isStreakOver } = TikTokLib;
      // Signs the WebSocket locally — no paid signing server / API key required.
      const conn = new TikTokLiveClient(uniqueId);
      const av = u => u?.avatarThumb?.urlList?.[0] || u?.profilePicture?.urlList?.[0] || '';
      const nm = u => u?.nickname || u?.uniqueId || 'ẩn danh';
      const uid = u => u?.uniqueId || u?.id;
      conn.on(EventType.chat, d => {
        if (!alive() || !firstEvent(msgKey(d, 'chat'))) return;
        onChat(uid(d.user), nm(d.user), d.content, av(d.user));
      });
      conn.on(EventType.follow, d => {
        if (!alive() || !firstEvent(msgKey(d, 'follow'))) return;
        onFollow(uid(d.user), nm(d.user), av(d.user));
      });
      conn.on(EventType.gift, d => {
        if (!alive() || !isStreakOver(d)) return;                   // streak still running
        if (!firstEvent(msgKey(d, 'gift'))) return;
        const gname = d.gift?.name || 'quà';
        const per = Math.max(1, +d.gift?.diamondCount || 1);
        const count = Math.max(1, +d.repeatCount || 1);
        onGift(uid(d.user), nm(d.user), gname, count, per, av(d.user), isFollower(d.user));
        addLog(`🎁 ${nm(d.user)} tặng ${gname} x${count}`);
      });
      conn.on(EventType.join, d => {
        if (!alive() || !firstEvent(msgKey(d, 'join'))) return;
        const id = uid(d.user);
        if (!settings.autoSeatFollowers || !id || (!followerIds.has(id) && !isFollower(d.user))) return;
        followerIds.add(id);
        seat(id, nm(d.user), { avatar: av(d.user), followed: true });
      });
      conn.on(EventType.like, d => {
        if (!alive() || !firstEvent(msgKey(d, 'like'))) return;
        broadcast({ t:'like', id: uid(d.user), n: +d.count || 1 });
      });
      conn.on(EventType.liveEnded, () => { if (!alive()) return; addLog('TikTok: live đã kết thúc'); disconnectTikTok(); });
      conn.on(EventType.reconnecting, () => { if (alive()) addLog('TikTok: đang kết nối lại…'); });
      conn.on(EventType.disconnected, () => {
        if (!alive()) return;
        tiktokState = { ...tiktokState, status: 'disconnected' }; broadcast({ t:'tiktok', ...tiktokState });
        addLog('TikTok: mất kết nối');
      });
      conn.on('error', e => { if (alive()) addLog('TikTok lỗi: ' + (e?.message || e)); });
      const roomId = await conn.connect();
      if (!alive()){ try { await conn.disconnect(); } catch {} return; }
      tiktok = conn;
      tiktokState = { status: 'connected', uniqueId, error: '', roomId: roomId || '' };
      addLog(`✅ Đã kết nối live @${uniqueId}`);
    } catch (e) {
      if (!alive()) return;
      tiktokState = { status: 'error', uniqueId, error: String(e?.message || e) };
      addLog(`❌ Không kết nối được @${uniqueId}: ${tiktokState.error}`);
    }
    if (alive()) broadcast({ t:'tiktok', ...tiktokState });
  } finally {
    tiktokConnecting = false;
  }
}
async function disconnectTikTok(){
  tiktokGen++;
  if (tiktok){ const c = tiktok; tiktok = null; try { await c.disconnect(); } catch {} }
  tiktokState = { status:'idle', uniqueId:'', error:'' };
  broadcast({ t:'tiktok', ...tiktokState });
}

/* ------------------------------------------------------------- test data */
const DEMO_NAMES = ['Minh An','Hải Đăng','Thu Hà','Quốc Bảo','Ngọc Lan','Tuấn Kiệt','Mai Linh','Đức Anh','Phương Thảo','Trung Kiên','Bảo Ngọc','Hoàng Nam','Lan Anh','Văn Hùng','Thanh Tùng','Kim Chi','Mỹ Duyên','Quang Huy','Hồng Nhung','Duy Khánh','Thùy Linh','Công Thành','Gia Bảo','Yến Nhi','Bích Ngọc','Mạnh Cường','Hà My','Đình Khoa','Tuyết Mai','Việt Anh','Ngân Hà','Sỹ Hùng'];
function fillDemo(n){
  const have = [...viewers.values()].filter(v => v.demo).length;
  for (let i = have; i < n && viewers.size < 64; i++){
    const name = DEMO_NAMES[i % DEMO_NAMES.length] + (i >= DEMO_NAMES.length ? ' ' + (Math.floor(i / DEMO_NAMES.length) + 1) : '');
    const { v } = seat('demo_' + i, name, { demo: true, skin: ['man','woman','woman','uncle','cap','sexy','oldwoman'][i % 7] });
    if (v){ v.beers = Math.floor(Math.random() * 12); totalBeers += v.beers; }
  }
  broadcast({ t:'state', settings, viewers:[...viewers.values()].map(pub), cap: capacity(), startedAt, tiktok: tiktokState, barBeers: totalBeers });
}
function clearSeats(){ viewers.clear(); totalBeers = 0; broadcast(snapshot()); addLog('Đã làm trống quán'); }

/* ------------------------------------------------------------- control */
function onControl(m){
  switch (m.cmd){
    case 'connect': connectTikTok(m.uniqueId); break;
    case 'disconnect': disconnectTikTok(); addLog('Đã ngắt kết nối TikTok'); break;
    case 'chat': { const n = String(m.name || 'Khách').slice(0, 18); seat('sim_' + n, n); onChat('sim_' + n, n, String(m.text || 'dzô').slice(0, 120)); break; }
    case 'follow': { const n = String(m.name || 'Khách').slice(0, 18); onFollow('sim_' + n, n); break; }
    case 'beer': { const n = String(m.name || 'Khách').slice(0, 18); onGift('sim_' + n, n, String(m.gift || 'Hoa hồng').slice(0, 30), clamp(m.count, 1, 99), clamp(m.diamonds, 1, 50000)); break; }
    case 'dice': { const n = String(m.name || 'Khách').slice(0, 18); const { v } = seat('sim_' + n, n); rollDiceFor(v, 'Cỏ bốn lá', 1); break; }
    case 'cheer': {
      if (m.global){ groupToast(); break; }
      const n = String(m.name || 'Khách').slice(0, 18), { v } = seat('sim_' + n, n);
      broadcast({ t:'cheer', id: v.id, name: v.name });
      addLog(`🥂 ${v.name} hô dzô`); break;
    }
    case 'fill': fillDemo(clamp(m.n, 1, 64)); addLog(`Đổ người mẫu: ${viewers.size} người`); break;
    case 'clear': clearSeats(); break;
    case 'kick': {                                 // only simulated viewers: real ones leave when the live ends
      const id = String(m.id || '').slice(0, 64), v = viewers.get(id);
      if (!v || !/^(sim|demo|bot)_/.test(id)) break;
      viewers.delete(id); broadcast({ t:'leave', id });
      addLog(`Đã xoá người xem mô phỏng: ${v.name}`); break;
    }
    case 'toast': groupToast(); break;
    case 'say': if (m.text) say(String(m.text).slice(0, 400), { tag:'say' }); break;
    case 'settings':
      applySettings(m.settings || {});
      scheduleToast(); broadcast({ t:'settings', settings, cap: capacity(), barBeers: totalBeers }); break;
    case 'bots': setBots(!!m.on, +m.n || 12, m.pace); break;
  }
}

// Only known keys, right types, sane ranges: the panel is local, but nothing from the socket is trusted blindly.
const SETTING_RULES = {
  title: v => String(v).slice(0, 40), subtitle: v => String(v).slice(0, 60),
  voice: v => ['google', 'vi-VN-NamMinhNeural', 'vi-VN-HoaiMyNeural'].includes(v) ? v : settings.voice,
  pitch: v => clamp(v, -50, 50), rate: v => clamp(v, -50, 50), toastEveryMin: v => clamp(v, 1, 60),
  music: Boolean, sfx: Boolean, ambience: Boolean, autoToast: Boolean, autoSeatFollowers: Boolean,
  musicVolume: v => clamp(v, 0, 100),
  musicTrack: v => /^[a-z0-9_-]{0,64}$/i.test(String(v)) ? String(v) : settings.musicTrack,
  seatMode: v => ['auto', '24', '36', '48', '64'].includes(String(v)) ? String(v) : 'auto',
  phaseMode: v => ['auto', 'food', 'beer'].includes(v) ? v : 'auto',
  foodFrom: v => clamp(v, 0, 23), beerFrom: v => clamp(v, 0, 23),
};
const clamp = (v, a, b) => Math.max(a, Math.min(b, Math.round(+v || 0)));
function applySettings(o){
  for (const [k, fn] of Object.entries(SETTING_RULES)) if (k in o) settings[k] = fn(o[k]);
  if (settings.beerFrom <= settings.foodFrom + 1){ settings.foodFrom = 5; settings.beerFrom = 16; }
}

/* ----------------------------------------------------------------- bots */
let botTimer = null;
const BOT_LINES = ['dzô', 'Một hai ba dzô!', 'Bia lạnh quá!', 'Cả quán dzô!', 'Lên đi!', 'Nữ', 'Nam', 'Ông già', 'Bà già', 'Mũ',
  'Hôm nay vui quá', 'Chúc cả quán say vui', 'Uống đi nào', 'Cụng ly!', 'Bàn này mạnh ghê', 'Cho thêm đá!'];
function setBots(on, n, pace){
  clearInterval(botTimer); botTimer = null;
  if (on){
    n = clamp(n, 1, 64);
    for (let i = 0; i < n; i++) seat('bot_' + i, DEMO_NAMES[(i + 7) % DEMO_NAMES.length] + ' ·bot', { demo: true, followed: true });
    const every = { slow: 4000, mid: 1800, fast: 700 }[pace] || 1800;
    botTimer = setInterval(() => {
      const ids = [...viewers.keys()].filter(id => id.startsWith('bot_')); if (!ids.length) return;
      const id = ids[Math.floor(Math.random() * ids.length)], v = viewers.get(id), r = Math.random();
      if (r < .58) onChat(id, v.name, BOT_LINES[Math.floor(Math.random() * BOT_LINES.length)]);
      else if (r < .76) broadcast({ t:'like', id, n: 1 + Math.floor(Math.random() * 4) });
      else if (r < .9) onGift(id, v.name, Math.random() < .7 ? 'Hoa hồng' : 'Bia', 1 + Math.floor(Math.random() * 3), 1);
      else if (r < .97) onGift(id, v.name, 'Cỏ bốn lá', 1, 1);
      else onGift(id, v.name, 'Tháp bia', 1, 20);
    }, every);
    addLog(`🤖 Bật ${n} bot, nhịp ${pace}`);
  } else {
    for (const id of [...viewers.keys()]) if (id.startsWith('bot_')) { viewers.delete(id); broadcast({ t:'leave', id }); }
    addLog('🤖 Tắt bot');
  }
  broadcast({ t:'bots', on }, 'control');
}

/* -------------------------------------------------------------- server */
// Security notes (this file is meant to be shared publicly):
//  • listens on 127.0.0.1 only; nothing is reachable from the LAN or internet unless HOST is changed on purpose
//  • Host header must be localhost/127.0.0.1 (blocks DNS-rebinding pages from talking to the server)
//  • WebSocket only accepts pages served by this server (Origin check), so other sites open in the
//    same browser cannot send control commands
//  • static files: only /assets and /live, no dot-files, no node_modules, no server source, no path escapes
//  • avatars are fetched by this machine only, over https from TikTok CDN hosts (redirects re-checked), max 3 MB,
//    8 s timeout, 4 parallel fetches, resized to 160 px WebP; the overlay falls back to the CDN URL if that fails
//  • no TikTok password, cookie or session is ever used or stored; only public room events are read
const HOST = process.env.HOST || '127.0.0.1';
const MIME = { '.html':'text/html; charset=utf-8', '.js':'text/javascript', '.css':'text/css', '.json':'application/json',
  '.png':'image/png', '.jpg':'image/jpeg', '.webp':'image/webp', '.mp3':'audio/mpeg', '.svg':'image/svg+xml', '.ico':'image/x-icon' };
const ALLOWED_HOSTS = new Set([`localhost:${PORT}`, `127.0.0.1:${PORT}`, `[::1]:${PORT}`]);
const okHost = h => ALLOWED_HOSTS.has(String(h || '').toLowerCase());
const SEP = path.sep;
function resolveStatic(urlPath){
  let p = urlPath === '/' ? '/live/control.html' : urlPath;
  if (!/^\/(assets|live)\//.test(p)) return null;
  if (p.split('/').some(seg => seg.startsWith('.') || seg === 'node_modules')) return null;
  if (/\.(mjs|json|md|log)$/i.test(p) && !p.startsWith('/assets/')) return null;      // never serve server code / package files
  const file = path.normalize(path.join(ROOT, p));
  if (!file.startsWith(ROOT + SEP)) return null;
  return file;
}
const server = http.createServer((req, res) => {
  if (!okHost(req.headers.host)) { res.writeHead(421).end('wrong host'); return; }
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405).end(); return; }
  let reqUrl, p;
  try { reqUrl = new URL(req.url, 'http://x'); p = decodeURIComponent(reqUrl.pathname); } catch { res.writeHead(400).end(); return; }
  if (p === '/live/avatar') { serveAvatar(req, res, reqUrl.searchParams.get('u')).catch(() => { try { res.writeHead(500).end(); } catch {} }); return; }
  const file = resolveStatic(p);
  if (!file) { res.writeHead(404).end('not found'); return; }
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404).end('not found'); return; }
    const etag = `W/"${st.size.toString(16)}-${Math.floor(st.mtimeMs).toString(16)}"`;
    const headers = {
      'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': p.startsWith('/live/tts/') ? 'no-store' : 'no-cache',
      'ETag': etag, 'Accept-Ranges': 'bytes',
      'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer',
    };
    if (req.headers['if-none-match'] === etag) { res.writeHead(304, headers); res.end(); return; }
    let start = 0, end = st.size - 1, status = 200;
    const range = req.headers.range;
    if (range && st.size > 0) {
      const m = /^bytes=(\d*)-(\d*)$/.exec(range);
      if (m && (m[1] || m[2])) {
        if (m[1]) { start = +m[1]; end = m[2] ? Math.min(+m[2], st.size - 1) : st.size - 1; }
        else { start = Math.max(0, st.size - +m[2]); }
        if (start > end || start >= st.size) {
          res.writeHead(416, { 'Content-Range': `bytes */${st.size}`, 'Accept-Ranges': 'bytes' }); res.end(); return;
        }
        status = 206;
        headers['Content-Range'] = `bytes ${start}-${end}/${st.size}`;
      }
    }
    if (st.size > 0) headers['Content-Length'] = String(end - start + 1);
    res.writeHead(status, headers);
    if (req.method === 'HEAD') { res.end(); return; }
    fs.createReadStream(file, st.size > 0 ? { start, end } : undefined).pipe(res);
  });
});
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 64 * 1024,
  verifyClient: ({ origin, req }) => {
    if (!okHost(req.headers.host)) return false;
    if (!origin) return true;                                   // OBS / non-browser clients send no Origin
    try { return okHost(new URL(origin).host); } catch { return false; }
  } });
function broadcast(msg, only){ const s = JSON.stringify(msg); for (const c of wss.clients) if (c.readyState === 1 && (!only || c.role === only)) c.send(s); }
wss.on('connection', (ws, req) => {
  ws.role = new URL(req.url, 'http://x').searchParams.get('role') === 'control' ? 'control' : 'overlay';
  ws.send(JSON.stringify(snapshot()));
  if (ws.role === 'control') ws.send(JSON.stringify({ t:'logs', lines: log }));
  ws.on('message', buf => {
    if (ws.role !== 'control') return;                          // overlays only listen
    try { const m = JSON.parse(buf); if (m && m.t === 'ctl') onControl(m); } catch (e) { addLog('Lệnh lỗi: ' + e.message); }
  });
});
server.listen(PORT, HOST, () => {
  addLog(`Server chạy tại http://localhost:${PORT}  ·  Bảng điều khiển: http://localhost:${PORT}/live/control.html  ·  Overlay: http://localhost:${PORT}/live/overlay.html`);
  setTimeout(warmTTS, 1200);
});
