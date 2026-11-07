// ======================================================================================================
// SAVE: progress in the platform's per-player storage (BRB.storage key 'jungle-cup-v1'); it resumes next time.
// Shape (docs/jungle-cup-plan.md "Storage"):
//   { v, started, pos: {x, y, d}, feathers: {id: true}, best: {id: n}, stars: {id: 0-3}, plays: {id: n}, warm: {id: true},
//     cos: { bandana, hat, flag, own: [...] }, quests: {id: 'active'|'got'|'done'}, flags: {...}, settings: { font, easy }, cup, t }
// Sound on/off is the platform's own mute (BRB.sfx.mute), which the SDK remembers.
// ======================================================================================================
const SAVE_KEY = 'jungle-cup-v1';
const START_POS = { x: 36, y: 64, d: 'up' };
function freshSave() {
  return { v: 1, started: false, pos: { x: START_POS.x, y: START_POS.y, d: START_POS.d }, feathers: {}, best: {}, stars: {}, plays: {}, warm: {},
    cos: { bandana: 'green', hat: '', flag: '', own: ['green'] }, quests: {}, flags: {}, settings: { font: 'pixel', easy: false }, cup: false, t: 0 };
}
const SAVE = { data: freshSave(), dirty: false, timer: 0 };
JC.save = SAVE;
function sanitize(d) {
  const f = freshSave();
  if (!d || typeof d !== 'object') return f;
  const obj = (v, keep) => { const o = {}; if (v && typeof v === 'object') for (const k in v) if (JC.sportOrder.includes(k) || keep) o[k] = v[k]; return o; };
  f.started = !!d.started;
  if (d.pos && Number.isFinite(d.pos.x) && Number.isFinite(d.pos.y)) f.pos = { x: d.pos.x | 0, y: d.pos.y | 0, d: ['up', 'down', 'left', 'right'].includes(d.pos.d) ? d.pos.d : 'down' };
  f.feathers = obj(d.feathers); f.best = obj(d.best); f.stars = obj(d.stars); f.plays = obj(d.plays); f.warm = obj(d.warm);
  for (const k in f.best) f.best[k] = Math.max(0, Math.round(+f.best[k] || 0));
  for (const k in f.stars) f.stars[k] = clamp(Math.round(+f.stars[k] || 0), 0, 3);
  if (d.cos && typeof d.cos === 'object') {
    f.cos.bandana = String(d.cos.bandana || 'green'); f.cos.hat = String(d.cos.hat || ''); f.cos.flag = String(d.cos.flag || '');
    f.cos.own = Array.isArray(d.cos.own) ? d.cos.own.filter(x => typeof x === 'string').slice(0, 40) : ['green'];
    if (!f.cos.own.includes('green')) f.cos.own.unshift('green');
  }
  f.quests = obj(d.quests, true); f.flags = obj(d.flags, true);
  if (d.settings && typeof d.settings === 'object') { f.settings.font = d.settings.font === 'clear' ? 'clear' : 'pixel'; f.settings.easy = !!d.settings.easy; }
  f.cup = !!d.cup; f.t = +d.t || 0;
  return f;
}
SAVE.exists = () => { const d = BRBX.get(SAVE_KEY); return !!(d && typeof d === 'object' && d.started); };
SAVE.load = function () { SAVE.data = sanitize(BRBX.get(SAVE_KEY)); SAVE.apply(); return SAVE.data; };
/** Write now (the SDK sends it to the server; it also batches writes). */
SAVE.write = function () { SAVE.data.t = Date.now(); BRBX.set(SAVE_KEY, SAVE.data); SAVE.dirty = false; };
/** Ask for a write soon (position changes while walking). */
SAVE.soon = function () { SAVE.dirty = true; };
SAVE.update = function (dt) { if (!SAVE.dirty) return; SAVE.timer += dt; if (SAVE.timer > 2) { SAVE.timer = 0; SAVE.write(); } };
SAVE.reset = function (keepSettings) { const s = SAVE.data.settings; SAVE.data = freshSave(); if (keepSettings) SAVE.data.settings = s; SAVE.apply(); };
SAVE.set = function (obj) { SAVE.data = sanitize(obj); SAVE.apply(); SAVE.write(); };
SAVE.apply = function () { TEXT.clear = SAVE.data.settings.font === 'clear'; TEXTCACHE.clear(); WRAPS.clear(); };
SAVE.featherCount = () => JC.sportOrder.reduce((n, id) => n + (SAVE.data.feathers[id] ? 1 : 0), 0);
SAVE.starCount = () => JC.sportOrder.reduce((n, id) => n + (SAVE.data.stars[id] || 0), 0);
/** The score shown on the platform's leaderboard: 100 per star, 250 per Feather, 500 for the Cup. */
SAVE.cupPoints = () => SAVE.starCount() * 100 + SAVE.featherCount() * 250 + (SAVE.data.cup ? 500 : 0);
JC.easy = () => !!SAVE.data.settings.easy;
