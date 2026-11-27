// A Grammar Lab topic's practice (server/views/grammar-lab.js practicePage; routes/grammar-lab.js): the welcome screen
// (doorway and greeting, with a skip), the first-visit double-tap tip, the quiz one question at a time (tap a word to
// mark it, tap again to clear it, Submit), the green "Correct!" confirmation, the calm wrong-answer notice with its
// hint, the near-miss notice, the level-complete overlay and the mastery screen. The server grades every try and keeps
// the counter, the streak and the bar (services/grammar-lab-mastery.js); this page only shows what it sends back.
// Pictures and animations: public/js/grammar-lab-art.js (they respect reduced motion and never block a control).
import { api, pageData, $, $$, t, toast } from '/js/app.js';
import { mountWelcome, mountGreeting, mountMastery, mountTapTip } from '/js/grammar-lab-art.js';

const d = pageData();
const base = `/api/courses/grammar-lab/topic/${d.topic}`;
const TIP_KEY = 'gl:tip-seen';
const screens = ['gl-welcome', 'gl-quiz', 'gl-done'];
let summary = null, question = null, busy = false;
const marked = new Set();
const scenes = {};

const show = id => { for (const s of screens) $(`#${s}`).hidden = s !== id; $('#gl-meter').hidden = id === 'gl-welcome'; };
const stored = k => { try { return localStorage.getItem(k); } catch { return null; } };
const store = (k, v) => { try { localStorage.setItem(k, v); } catch { /* storage off */ } };
const norm = w => String(w || '').toLowerCase().replace(/[^\p{L}\p{N}'-]/gu, '');
function scene(key, el, mount, opts = {}) {
  if (scenes[key]) scenes[key].destroy();
  el.textContent = '';
  scenes[key] = mount(el, { band: d.band, ...opts });
  return scenes[key];
}

// ---------------------------------------------------------------------------------------------- the header
function renderHeader() {
  if (!summary) return;
  $('#gl-dots').hidden = false; $('#gl-levels-btn').hidden = false;
  const dots = $$('#gl-dots i');
  dots.forEach((i, k) => i.classList.toggle('on', k < summary.levelsDone));
  $('#gl-dots').setAttribute('aria-label', t('js.grammar-lab.levelsDone', { done: summary.levelsDone, total: summary.levels }));
  $('#gl-levels-btn').textContent = t('js.grammar-lab.levelOf', { n: summary.level, total: summary.levels });
  $('#gl-counter').textContent = t('js.grammar-lab.counter', { n: Math.min(summary.counter, summary.total), total: summary.total });
  const bar = $('#gl-bar');
  bar.textContent = '';
  for (const b of summary.bar) { const li = document.createElement('li'); li.className = `gl-seg gl-seg-${b}`; bar.appendChild(li); }
  $$('#gl-streak .gl-pips i').forEach((i, k) => i.classList.toggle('on', k < summary.streak));
  $('#gl-streak-t').textContent = t('js.grammar-lab.streak', { n: Math.min(summary.streak, summary.need), need: summary.need });
}

// ---------------------------------------------------------------------------------------------- a question
/** The line that asks, with its grammar words double-tappable. */
function renderAsk(text) {
  const ask = $('#gl-ask');
  ask.textContent = '';
  String(text).split(/(\s+)/).forEach(part => {
    const k = norm(part);
    if (k && d.glossary[k]) {
      const m = /^([^\p{L}]*)(.*?)([^\p{L}]*)$/u.exec(part);
      ask.append(m[1]);
      const s = document.createElement('span');
      s.className = 'gl-term'; s.tabIndex = 0; s.dataset.term = k; s.textContent = m[2];
      ask.append(s, m[3]);
    } else ask.append(part);
  });
}
function renderQuestion() {
  marked.clear();
  const q = question;
  renderAsk(q.ask);
  const box = $('#gl-sentence');
  box.textContent = '';
  q.words.forEach((w, i) => {
    if (i) box.append(' ');
    if (w.pre) box.append(w.pre);
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'gl-w'; b.dataset.i = String(i); b.setAttribute('aria-pressed', 'false'); b.textContent = w.t;
    box.append(b);
    if (w.post) box.append(w.post);
  });
  notice(null);
  hint(null);
  $('#gl-submit').disabled = true;
  renderHeader();
}
function notice(kind, text = '') {
  const n = $('#gl-notice');
  n.hidden = !kind; n.className = `gl-notice${kind ? ` gl-notice-${kind}` : ''}`; n.textContent = text;
}
/** The hint control: shown after a wrong answer only, closed until asked for. */
function hint(text) {
  const btn = $('#gl-hint-btn'), box = $('#gl-hint');
  if (text === null) { btn.hidden = true; box.hidden = true; btn.setAttribute('aria-expanded', 'false'); btn.textContent = t('js.grammar-lab.hint'); return; }
  $('#gl-hint-text').textContent = text;
  btn.hidden = false;
}
$('#gl-hint-btn').addEventListener('click', () => {
  const box = $('#gl-hint'), btn = $('#gl-hint-btn');
  box.hidden = !box.hidden;
  btn.setAttribute('aria-expanded', String(!box.hidden));
  btn.textContent = box.hidden ? t('js.grammar-lab.hint') : t('js.grammar-lab.hideHint');
});
$('#gl-sentence').addEventListener('click', e => {
  const b = e.target.closest('.gl-w');
  if (!b || busy) return;
  const i = +b.dataset.i;
  if (marked.has(i)) marked.delete(i); else marked.add(i);
  b.setAttribute('aria-pressed', String(marked.has(i)));
  $('#gl-submit').disabled = !marked.size;
});

// ---------------------------------------------------------------------------------------------- answering
$('#gl-submit').addEventListener('click', async () => {
  if (busy || !marked.size || !question) return;
  busy = true; $('#gl-submit').disabled = true;
  let r;
  try {
    r = await api(`${base}/answer`, { method: 'POST', body: { unit: d.unit, id: question.id, marked: [...marked].sort((a, b) => a - b) } });
  } catch (e) {
    busy = false;
    // The question moved on elsewhere (another tab): pick up where the server is.
    if (e.status === 409 && e.data && e.data.question) { summary = e.data.summary; question = e.data.question; renderQuestion(); return; }
    $('#gl-submit').disabled = !marked.size;
    return toast(t('js.grammar-lab.wentWrong'), { bad: true });
  }
  summary = r.summary;
  if (r.kind === 'near') { busy = false; notice('near', t('js.grammar-lab.near')); $('#gl-submit').disabled = !marked.size; return; }
  if (r.kind === 'wrong' || r.kind === 'again') {
    busy = false;
    notice('wrong', t(r.kind === 'wrong' ? 'js.grammar-lab.wrong' : 'js.grammar-lab.again'));
    hint(r.hint);
    renderHeader();
    $('#gl-submit').disabled = !marked.size;
    return;
  }
  // Right (or a missed question fixed): the green confirmation, then what comes next.
  question = r.question;
  renderHeader();
  await flash();
  busy = false;
  if (r.mastered) return done(r.closing);
  if (r.levelDone !== null && r.levelDone !== undefined) return levelDone(r.levelDone);
  renderQuestion();
});

/** The full-screen green "Correct!" for a moment (a tap, or Enter, moves on sooner). */
function flash() {
  const f = $('#gl-correct');
  f.hidden = false;
  return new Promise(res => {
    let over = false;
    const end = () => { if (over) return; over = true; f.hidden = true; f.removeEventListener('click', end); document.removeEventListener('keydown', end); res(); };
    f.addEventListener('click', end); document.addEventListener('keydown', end);
    setTimeout(end, 1000);
  });
}

function levelDone(level) {
  const o = $('#gl-level');
  $$('#gl-level-stars i').forEach((i, k) => i.classList.toggle('on', k <= level));
  $('#gl-level-h').textContent = t('js.grammar-lab.levelDone', { n: level + 1 });
  $('#gl-level-text').textContent = t('js.grammar-lab.levelText');
  o.hidden = false;
  scene('levelGreet', $('#gl-level-greet'), mountGreeting);
  $('#gl-level-next').focus();
}
$('#gl-level-next').addEventListener('click', () => { $('#gl-level').hidden = true; renderQuestion(); $('#gl-sentence .gl-w') && $('#gl-sentence .gl-w').focus(); });

function done(closing) {
  show('gl-done');
  renderHeader();
  scene('mastery', $('#gl-mastery'), mountMastery);
  $('#gl-done-n').textContent = t('js.grammar-lab.answered', { count: closing.answered });
  const guest = $('#gl-done-guest');
  if (guest) guest.hidden = closing.win !== 'pending';
  const next = $('#gl-done-next');
  if (closing.next) { next.hidden = false; next.href = closing.next.href; next.textContent = t('js.grammar-lab.next', { topic: closing.next.title }); }
  $('#gl-done-h').focus && $('#gl-done-h').setAttribute('tabindex', '-1');
  $('#gl-done-h').focus();
}

// ---------------------------------------------------------------------------------------------- welcome and start
function welcome() {
  show('gl-welcome');
  scene('door', $('#gl-door'), mountWelcome);
  scene('greet', $('#gl-greet'), mountGreeting);
}
async function start() {
  for (const k of ['door', 'greet']) if (scenes[k]) { scenes[k].destroy(); delete scenes[k]; }
  let r;
  try { r = await api(`${base}/start`, { method: 'POST', body: { unit: d.unit, again: !!d.again } }); }
  catch { return toast(t('js.grammar-lab.wentWrong'), { bad: true }); }
  d.again = false;
  enter(r);
}
function enter(r) {
  summary = r.summary; question = r.question;
  show('gl-quiz');
  renderQuestion();
  if (!stored(TIP_KEY)) openTip();
}
$('#gl-go').addEventListener('click', start);
$('#gl-skip').addEventListener('click', start);

// ---------------------------------------------------------------------------------------------- the tip, levels, flag
function openTip() {
  const dlg = $('#gl-tip');
  if (!dlg.open) dlg.showModal();
  scene('tip', $('#gl-tip-stage'), mountTapTip, { before: d.tip.before, word: d.tip.word, after: d.tip.after, def: d.tip.def, replayLabel: d.tip.replay });
  $('#gl-tip-ok').focus();
}
$('#gl-tip-ok').addEventListener('click', () => $('#gl-tip').close());
$('#gl-tip').addEventListener('close', () => { store(TIP_KEY, '1'); if (scenes.tip) { scenes.tip.destroy(); delete scenes.tip; } });
$('#gl-tip-btn').addEventListener('click', openTip);
$('#gl-levels-btn').addEventListener('click', () => {
  if (summary) $('#gl-levels-now').textContent = t('js.grammar-lab.levelsNow', { n: summary.level, total: summary.levels });
  $('#gl-levels').showModal();
});
$('#gl-levels-ok').addEventListener('click', () => $('#gl-levels').close());
$('#gl-flag').addEventListener('click', () => $('#gl-flagbox').showModal());
$('#gl-flag-no').addEventListener('click', () => $('#gl-flagbox').close());
$('#gl-flag-yes').addEventListener('click', async () => {
  $('#gl-flagbox').close();
  try { await api(`${base}/flag`, { method: 'POST', body: { unit: d.unit, id: question && question.id } }); toast(t('js.grammar-lab.flagSent')); }
  catch { toast(t('js.grammar-lab.wentWrong'), { bad: true }); }
});

// ---------------------------------------------------------------------------------------------- double-tap meanings
const bubble = $('#gl-bubble');
function showMeaning(el) {
  const g = d.glossary[el.dataset.term];
  if (!g) return;
  bubble.textContent = '';
  const b = document.createElement('b'); b.textContent = g.word;
  bubble.append(b, ' ', g.def);
  bubble.hidden = false;
  const r = el.getBoundingClientRect(), w = bubble.offsetWidth;
  const left = Math.max(8, Math.min(document.documentElement.clientWidth - w - 8, r.left + r.width / 2 - w / 2));
  bubble.style.left = `${left + window.scrollX}px`;
  bubble.style.top = `${r.top + window.scrollY - bubble.offsetHeight - 10}px`;
}
const hideMeaning = () => { bubble.hidden = true; };
let lastTap = { el: null, at: 0 };
document.addEventListener('pointerup', e => {
  const el = e.target.closest('[data-term]');
  if (!el) { if (!e.target.closest('#gl-bubble')) hideMeaning(); return; }
  const now = Date.now();
  if (lastTap.el === el && now - lastTap.at < 400) { showMeaning(el); lastTap = { el: null, at: 0 }; }
  else lastTap = { el, at: now };
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') hideMeaning();
  const el = e.target.closest && e.target.closest('[data-term]');
  if (el && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); showMeaning(el); }
});
window.addEventListener('scroll', hideMeaning, { passive: true });

// ---------------------------------------------------------------------------------------------- go
if (d.run && d.run.question) enter(d.run); else welcome();
