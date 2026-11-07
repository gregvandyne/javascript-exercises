// ======================================================================================================
// TEXT BOX: the typewriter dialogue at the bottom of the screen.
//   JC.say([{ who: 'mango', key: 'd.mango.hi' }, ...], onDone)   who: a speaker id (portrait + name), key: an I18N key
// Tap / A: finishes the line being typed, then goes on to the next. B skips nothing (kids read at their own pace).
// With AI voices on for the player's language (BRB.aiVoice) and sound on, each line is also read aloud.
// ======================================================================================================
const SPEAKERS = { cappy: 'cappy_down', mango: 'mango', coco: 'coco_down', pip: 'pip_down', tapir: 'tapir', ants: 'ant', elder: 'elder', zuzu: 'zuzu',
  jada: 'jada', sloane: 'sloane', tico: 'tico', otters: 'otter', rana: 'rana', mico: 'mico', kiki: 'kiki', pecca: 'pecca', marm: 'marmoset', sign: '', lift: '' };
JC.speakers = SPEAKERS;
const TB = { lines: null, i: 0, shown: 0, full: '', done: null, open: false, t: 0, spoke: false };
JC.textbox = TB;
function voiceRole(key, who) {
  const k = String(key || ''); let best = '';
  for (const p in VOICE_KEY_ROLES) if (k.indexOf(p) === 0 && p.length > best.length) best = p;
  return (best ? VOICE_KEY_ROLES[best] : VOICE_ROLES[who] || VOICE_ROLES.story) || 'narrator';
}
function voiceOn() { try { return !BRBX.muted() && typeof BRB.aiVoice === 'function' && BRB.aiVoice(LANG); } catch (e) { return false; } }
TB.start = function (lines, done) {
  TB.lines = lines; TB.i = 0; TB.done = done || null; TB.open = true; TB.t = 0;
  if (voiceOn()) { try { lines.forEach(l => BRB.prefetchSpeech([t(l.key, l.vars)], { lang: LANG, voice: voiceRole(l.key, l.who) })); } catch (e) { /* older SDK */ } }
  TB.load();
};
TB.load = function () {
  const l = TB.lines[TB.i]; TB.full = t(l.key, l.vars); TB.shown = 0; TB.t = 0;
  TB.spoke = false;
  if (voiceOn()) { try { TB.spoke = !!BRB.speak(TB.full, { lang: LANG, voice: voiceRole(l.key, l.who) }); } catch (e) { TB.spoke = false; } }
};
TB.stop = function () { if (TB.spoke) { try { BRB.stopSpeaking(); } catch (e) { /* ignore */ } TB.spoke = false; } };
TB.advance = function () {
  if (!TB.open) return;
  if (TB.shown < TB.full.length) { TB.shown = TB.full.length; return; }
  AUDIO.sfx('blip');
  TB.i++;
  if (TB.i >= TB.lines.length) { TB.stop(); TB.open = false; const d = TB.done; TB.done = null; TB.lines = null; if (d) d(); return; }
  TB.load();
};
TB.skipAll = function () { while (TB.open) { TB.shown = TB.full.length; TB.advance(); } };
TB.update = function (dt) {
  if (!TB.open) return;
  TB.t += dt;
  if (TB.shown < TB.full.length) {
    const before = TB.shown | 0;
    TB.shown = Math.min(TB.full.length, TB.shown + dt * 45);
    if (!TB.spoke && (TB.shown | 0) !== before && (before % 3) === 0) AUDIO.sfx('blip');
  }
};
/** Input while the box is open: true if it used the event. */
TB.input = function (e) {
  if (!TB.open) return false;
  if ((e.type === 'press' && (e.key === 'a' || e.key === 'b')) || e.type === 'tap') { if (e.key !== 'b') TB.advance(); return true; }
  return e.type === 'down' || e.type === 'up' || e.type === 'press' || e.type === 'release' || e.type === 'swipe' || e.type === 'move';
};
TB.draw = function (g) {
  if (!TB.open) return;
  const l = TB.lines[TB.i], who = l.who, sp = SPEAKERS[who] ? SPRITES[SPEAKERS[who]] : null;
  const w = Math.min(VIEW.W - 8, 380), x = Math.round((VIEW.W - w) / 2), h = 58, y = VIEW.H - h - 4;
  const inner = UI.card(g, x, y, w, h);
  let tx = inner.x + 2, tw = inner.w - 4;
  if (sp) {
    const pw = 36; box(g, inner.x, inner.y + 1, pw, pw, '#cde8a8', PAL.ink);
    rect(g, inner.x + 1, inner.y + 2 + pw - 10, pw - 2, 8, '#a8d27a');
    const k = sp.w > 18 ? 1 : 2; sprK(g, sp, inner.x + ((pw - sp.w * k) >> 1), inner.y + 1 + pw - 2 - sp.h * k, k);
    tx = inner.x + pw + 5; tw = inner.w - pw - 7;
  }
  const name = t('name.' + who);
  if (name && name !== 'name.' + who) {
    const nw = textW(name) + 10;
    box(g, x + 10, y - 9, nw, 13, '#3d8a3a', PAL.ink); rect(g, x + 11, y - 8, nw - 2, 1, '#6ad34a');
    text(g, name, x + 15, y - 8, { col: PAL.white });
  }
  const shown = TB.full.slice(0, TB.shown | 0);
  const lines = wrap(TB.full, tw);
  let used = 0;
  for (let i = 0; i < lines.length && i < 4; i++) {
    const ln = lines[i], left = shown.length - used;
    if (left <= 0) break;
    const part = left >= ln.length ? ln : ln.slice(0, left);
    text(g, part, RTL ? tx + tw : tx, inner.y + 1 + i * 11, { col: PAL.ink, edge: null, align: RTL ? 'right' : 'left' });
    used += ln.length + 1;
  }
  if (TB.shown >= TB.full.length && ((TB.t * 2) | 0) % 2 === 0) {
    const ax = x + w - 14, ay = y + h - 13;
    rect(g, ax, ay, 7, 1, PAL.r2); rect(g, ax + 1, ay + 1, 5, 1, PAL.r2); rect(g, ax + 2, ay + 2, 3, 1, PAL.r2); rect(g, ax + 3, ay + 3, 1, 1, PAL.r2);
  }
};
JC.say = (lines, done) => TB.start(lines, done);
