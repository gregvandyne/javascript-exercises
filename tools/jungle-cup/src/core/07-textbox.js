// ======================================================================================================
// TEXT BOX: the typewriter dialogue at the bottom of the screen.
//   JC.say([{ who: 'mango', key: 'd.mango.hi' }, ...], onDone)   who: a speaker id (portrait + name), key: an I18N key
// Tap / A: finishes the line being typed, then goes on to the next. B skips nothing (kids read at their own pace).
// With AI voices on for the player's language (BRB.aiVoice) and sound on, each line is also read aloud.
// ======================================================================================================
const SPEAKERS = { cappy: 'cappy_down', mango: 'mango', coco: 'coco_down', pip: 'pip_down', tapir: 'tapir', ants: 'ant', elder: 'elder', zuzu: 'zuzu',
  jada: 'jada', sloane: 'sloane', tico: 'tico', otters: 'otter', rana: 'rana', mico: 'mico', kiki: 'kiki', pecca: 'pecca', marm: 'marmoset', sign: '', lift: '' };
JC.speakers = SPEAKERS;
const TB = { lines: null, i: 0, pg: 0, shown: 0, full: '', done: null, open: false, t: 0, spoke: false };
JC.textbox = TB;
function voiceRole(key, who) {
  const k = String(key || ''); let best = '';
  for (const p in VOICE_KEY_ROLES) if (k.indexOf(p) === 0 && p.length > best.length) best = p;
  return (best ? VOICE_KEY_ROLES[best] : VOICE_ROLES[who] || VOICE_ROLES.story) || 'narrator';
}
function voiceOn() { try { return !BRBX.muted() && typeof BRB.aiVoice === 'function' && BRB.aiVoice(LANG); } catch (e) { return false; } }
TB.start = function (lines, done) {
  TB.lines = lines; TB.i = 0; TB.done = done || null; TB.open = true; TB.t = 0; TB.pg = 0;
  if (voiceOn()) { try { lines.forEach(l => BRB.prefetchSpeech([t(l.key, l.vars)], { lang: LANG, voice: voiceRole(l.key, l.who) })); } catch (e) { /* older SDK */ } }
  TB.load();
};
TB.load = function () {
  const l = TB.lines[TB.i]; TB.full = t(l.key, l.vars); TB.shown = 0; TB.t = 0; TB.pg = 0;
  TB.spoke = false;
  if (voiceOn()) { try { TB.spoke = !!BRB.speak(TB.full, { lang: LANG, voice: voiceRole(l.key, l.who) }); } catch (e) { TB.spoke = false; } }
};
TB.stop = function () { if (TB.spoke) { try { BRB.stopSpeaking(); } catch (e) { /* ignore */ } TB.spoke = false; } };
/* The box's place and the line cut into pages of 4 rows (a long line, or a long language, gets a next page: tap to
   read on). Typing counts the characters actually drawn, so nothing is lost where a line breaks (CJK breaks between
   characters, with no space eaten). Cached per line, width and text style. */
const TB_ROWS = 4, TBL = { key: '', x: 0, y: 0, w: 0, h: 0, tx: 0, tw: 0, px: 0, pages: [[]], lens: [0] };
function tbLayout() {
  const l = TB.lines[TB.i], sp = SPEAKERS[l.who] ? SPRITES[SPEAKERS[l.who]] : null;
  const w = Math.min(VIEW.W - 8, 380), h = 64, x = Math.round((VIEW.W - w) / 2), y = VIEW.H - h - 8;
  const pw = sp ? 36 : 0, ix = x + 7, iw = w - 14;
  const tw = sp ? iw - pw - 7 : iw - 4, tx = sp ? (RTL ? ix + 2 : ix + pw + 5) : ix + 2;
  const key = TB.full + '|' + tw + '|' + TEXT.clear + '|' + VIEW.gen;
  TBL.x = x; TBL.y = y; TBL.w = w; TBL.h = h; TBL.tx = tx; TBL.tw = tw; TBL.px = RTL ? ix + iw - pw : ix;
  if (TBL.key !== key) {
    const all = wrap(TB.full, tw); TBL.pages = []; TBL.lens = [];
    for (let i = 0; i < all.length; i += TB_ROWS) { const pg = all.slice(i, i + TB_ROWS); TBL.pages.push(pg); TBL.lens.push(pg.reduce((n, ln) => n + ln.length, 0)); }
    if (!TBL.pages.length) { TBL.pages.push(['']); TBL.lens.push(0); }
    TBL.key = key;
  }
  return TBL;
}
TB.pages = () => (TB.open ? tbLayout().pages.length : 0);
const pageLen = () => { const L = tbLayout(); return L.lens[Math.min(TB.pg, L.lens.length - 1)]; };
TB.advance = function () {
  if (!TB.open) return;
  if (TB.shown < pageLen()) { TB.shown = pageLen(); return; }
  AUDIO.sfx('blip');
  if (TB.pg < tbLayout().pages.length - 1) { TB.pg++; TB.shown = 0; return; }   // the next page of the same line
  TB.i++;
  if (TB.i >= TB.lines.length) { TB.stop(); TB.open = false; const d = TB.done; TB.done = null; TB.lines = null; if (d) d(); return; }
  TB.load();
};
/** Finish the line being typed (every page of it) and go on to the next line. */
TB.nextLine = function () { if (!TB.open) return; TB.pg = tbLayout().pages.length - 1; TB.shown = pageLen(); TB.advance(); };
TB.skipAll = function () { let n = 0; while (TB.open && n++ < 500) TB.nextLine(); };
TB.update = function (dt) {
  if (!TB.open) return;
  TB.t += dt;
  const len = pageLen();
  if (TB.shown < len) {
    const before = TB.shown | 0;
    TB.shown = Math.min(len, TB.shown + dt * 45);
    if (!TB.spoke && (TB.shown | 0) !== before && (before % 3) === 0) AUDIO.sfx('blip');
  }
};
/** Input while the box is open: true if it used the event. */
TB.input = function (e) {
  if (!TB.open) return false;
  if ((e.type === 'press' && (e.key === 'a' || e.key === 'b')) || e.type === 'tap') { if (e.key !== 'b') TB.advance(); return true; }
  return e.type === 'down' || e.type === 'up' || e.type === 'press' || e.type === 'release' || e.type === 'swipe' || e.type === 'move';
};
const TB_TEXT = { col: PAL.ink, edge: null, align: 'left' }, TB_NAME = { col: PAL.white };
TB.draw = function (g) {
  if (!TB.open) return;
  const l = TB.lines[TB.i], who = l.who, sp = SPEAKERS[who] ? SPRITES[SPEAKERS[who]] : null;
  const L = tbLayout(), x = L.x, y = L.y, w = L.w, h = L.h;
  const inner = UI.card(g, x, y, w, h);
  if (sp) {
    // the speaker's portrait (on the right in Arabic and Hebrew)
    const pw = 36, px = L.px; box(g, px, inner.y + 1, pw, pw, '#cde8a8', PAL.ink);
    rect(g, px + 1, inner.y + 2 + pw - 10, pw - 2, 8, '#a8d27a');
    const k = sp.w > 18 ? 1 : 2; sprK(g, sp, px + ((pw - sp.w * k) >> 1), inner.y + 1 + pw - 2 - sp.h * k, k, RTL);
  }
  const name = t('name.' + who);
  if (name && name !== 'name.' + who) {
    const nw = textW(name) + 10, nx = RTL ? x + w - 10 - nw : x + 10;
    box(g, nx, y - 9, nw, 13, '#3d8a3a', PAL.ink); rect(g, nx + 1, y - 8, nw - 2, 1, '#6ad34a');
    text(g, name, nx + 5, y - 8, TB_NAME);
  }
  const page = L.pages[Math.min(TB.pg, L.pages.length - 1)];
  TB_TEXT.align = RTL ? 'right' : 'left';
  let left = TB.shown | 0;
  for (let i = 0; i < page.length && left > 0; i++) {
    const ln = page[i], part = left >= ln.length ? ln : ln.slice(0, left);
    text(g, part, RTL ? L.tx + L.tw : L.tx, inner.y + 1 + i * 11, TB_TEXT);
    left -= ln.length;
  }
  // the blinking "next" arrow, in its own space under the last row (on the left in Arabic and Hebrew)
  if (TB.shown >= pageLen() && ((TB.t * 2) | 0) % 2 === 0) {
    const ax = RTL ? x + 10 : x + w - 17, ay = y + h - 12;
    rect(g, ax, ay, 7, 1, PAL.r2); rect(g, ax + 1, ay + 1, 5, 1, PAL.r2); rect(g, ax + 2, ay + 2, 3, 1, PAL.r2); rect(g, ax + 3, ay + 3, 1, 1, PAL.r2);
  }
};
JC.say = (lines, done) => TB.start(lines, done);
