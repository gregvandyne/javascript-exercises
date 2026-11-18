// Oomba Canvas: the activity on the page. A task card, a graph-paper workspace with one manipulative, a Steps panel,
// and a bottom band with the problem's question and Check / Hint / Clear. Each student works on their own copy, on
// their own device: their place in the set is kept in their own game save (BRB.storage 'oc-progress-v1'), and nothing
// leaves the device but the end result (BRB.gameOver once per set). Students only tap, drag and type digits (the
// kit's own keypad and digit keys): there is no text field anywhere.
import { TOOLS, SUPPORTS, MAX_COUNT, deal, selfTest, seeded, manipulativeOf, cleanProblem } from './logic.js';
import { WORDS, wordsFor } from './words.js';
import { CSS } from './style.js';

const VERSION = '1.0.0';
const SAVE_KEY = 'oc-progress-v1';
const IDLE_MS = 45000;

const B = () => (typeof window !== 'undefined' && window.BRB) || {};
const call = (fn, ...a) => { try { return fn ? fn(...a) : undefined; } catch (e) { return undefined; } };
const sfx = name => call(() => { const s = B().sfx; if (s && s.play) s.play(name); });
const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const h = (tag, attrs = {}, ...kids) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') el.className = v; else if (k === 'text') el.textContent = v; else if (k.startsWith('on')) el.addEventListener(k.slice(2), v); else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of kids.flat()) if (c !== null && c !== undefined && c !== false) el.append(c.nodeType ? c : document.createTextNode(String(c)));
  return el;
};
/** A short signature of the activity, so a saved place is only resumed in the same activity. */
function sigOf(a) { const s = JSON.stringify([a.problems || null, a.gen || null, (a.config || {}).count || null]); let x = 5381; for (let i = 0; i < s.length; i++) x = ((x * 33) ^ s.charCodeAt(i)) >>> 0; return x.toString(36); }

/** One stacked fraction (the dashboard's .dt-frac). */
const frac = (n, d) => h('span', { class: 'oc-frac', role: 'img', 'aria-label': `${n}/${d}` }, h('span', { class: 'oc-fn' }, n), h('span', { class: 'oc-fl', 'aria-hidden': 'true' }), h('span', { class: 'oc-fd' }, d));

export function activity(input) {
  if (typeof document === 'undefined') return null;
  const A = input && typeof input === 'object' ? input : {};
  const cfg = A.config && typeof A.config === 'object' ? A.config : {};
  const lang = (B().user && B().user.lang) || cfg.lang || 'en', W = wordsFor(lang), dir = (B().user && B().user.dir) || (/^(ar|he)\b/.test(lang) ? 'rtl' : 'ltr');
  const support = SUPPORTS.includes(cfg.support) ? cfg.support : 'guided', board = cfg.board === true;
  const task = A.task && typeof A.task === 'object' ? A.task : {};
  const ownSteps = A.steps && typeof A.steps === 'object' ? A.steps : {}, ownHints = A.hints && typeof A.hints === 'object' ? A.hints : {};

  // ---- words: {name} values are numbers, fractions [n, d], keys of the table, or { k, v } / { text } groups
  const val = v => (Array.isArray(v) && v.length === 2 ? frac(v[0], v[1]) : v && typeof v === 'object' ? (v.text !== undefined ? String(v.text) : rich(v.k, v.v)) : typeof v === 'string' && v in WORDS.en ? W[v] : String(v));
  function rich(key, vars = {}) {
    const out = document.createDocumentFragment(), src = String(W[key] != null ? W[key] : key);
    let at = 0; const re = /\{(\w+)\}/g; let m;
    while ((m = re.exec(src))) { if (m.index > at) out.append(src.slice(at, m.index)); const v = vars[m[1]]; out.append(v === undefined ? m[0] : val(v)); at = m.index + m[0].length; }
    if (at < src.length) out.append(src.slice(at));
    return out;
  }
  const plain = (key, vars = {}) => String(W[key] != null ? W[key] : key).replace(/\{(\w+)\}/g, (m, n) => { const v = vars[n]; return v === undefined ? m : Array.isArray(v) ? `${v[0]}/${v[1]}` : v && typeof v === 'object' ? (v.text !== undefined ? String(v.text) : plain(v.k, v.v)) : typeof v === 'string' && v in WORDS.en ? W[v] : String(v); });
  const T = (k, v) => plain(k, v);

  // ---- the page
  document.documentElement.lang = lang; document.documentElement.dir = dir;
  const theme = B().theme; if (theme === 'dark' || theme === 'light') document.documentElement.setAttribute('data-oc-theme', theme);
  if (!document.getElementById('oc-style')) document.head.append(h('style', { id: 'oc-style' }, CSS));
  loadFont();
  const root = document.getElementById('oc-app') || document.body.appendChild(h('div', { id: 'oc-app' }));
  root.textContent = '';
  const el = {};
  const strip = h('header', { class: 'oc-strip' },
    el.title = h('h1', { dir: 'auto' }, String(task.title || document.title || '').slice(0, 80)),
    h('span', { class: 'oc-chip oc-sup' }, T(support)),
    board ? h('span', { class: 'oc-chip' }, T('board')) : null,
    h('span', { class: 'oc-grow' }),
    el.ok = h('span', { class: 'oc-chip oc-ok' }), el.no = h('span', { class: 'oc-chip oc-no' }), el.left = h('span', { class: 'oc-chip' }),
    el.keyBtn = h('button', { type: 'button', class: 'oc-btn oc-sm oc-keybtn', 'aria-pressed': 'false', 'aria-controls': 'oc-keys', onclick: () => keypad(!S.keys) }, '⌨ ', T('keypad')));
  const canSay = !!(task.say && B().speak);
  const card = h('section', { class: 'oc-task', 'aria-label': T('task') },
    h('div', { class: 'oc-taskt' }, el.n = h('span', { class: 'oc-n' }), el.task = h('p', { id: 'oc-taskline' })),
    canSay ? h('button', { type: 'button', class: 'oc-say', 'aria-label': T('readAloud'), onclick: () => call(() => B().speak(String(task.say).slice(0, 300), { lang: cfg.lang || lang })) }, '🔊') : null);
  el.work = h('section', { class: 'oc-card oc-work', 'aria-label': T('workspace') });
  el.stepsBox = h('aside', { class: 'oc-card oc-steps', 'aria-labelledby': 'oc-steps-h' },
    h('div', { class: 'oc-steps-top' }, h('h2', { id: 'oc-steps-h' }, h('span', { 'aria-hidden': 'true' }, '🪜 '), T('steps')),
      el.stepsToggle = h('button', { type: 'button', class: 'oc-btn oc-sm', 'aria-expanded': support === 'own' ? 'false' : 'true', 'aria-controls': 'oc-steps-list', onclick: () => { S.stepsOpen = !S.stepsOpen; paintSteps(); } })),
    el.steps = h('ol', { id: 'oc-steps-list' }));
  el.hint = h('div', { class: 'oc-hint', role: 'note', hidden: true });
  el.fb = h('div', { class: 'oc-fb', role: 'status', 'aria-live': 'polite' });
  el.ask = h('p', { class: 'oc-ask' });
  el.check = h('button', { type: 'button', class: 'oc-btn oc-primary', onclick: () => (S.phase === 'done' ? next() : doCheck()) });
  el.hintBtn = h('button', { type: 'button', class: 'oc-btn', onclick: showHint });
  el.clear = h('button', { type: 'button', class: 'oc-btn', onclick: clear }, '⌫ ', T('clear'));
  el.keys = h('div', { class: 'oc-keys', id: 'oc-keys', hidden: true, dir: 'ltr', role: 'group', 'aria-label': T('keypad') },
    ...['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'].map(d => h('button', { type: 'button', class: 'oc-key', onclick: () => typeDigit(+d) }, d)),
    h('button', { type: 'button', class: 'oc-key', 'aria-label': T('del'), onclick: () => typeDigit(null) }, '⌫'));
  const band = h('footer', { class: 'oc-band' }, el.hint, el.fb, h('div', { class: 'oc-act' }, el.ask, h('div', { class: 'oc-btns' }, el.check, el.hintBtn, el.clear)), el.keys);
  el.end = h('section', { class: 'oc-end', hidden: true, 'aria-labelledby': 'oc-end-h' });
  el.main = h('div', { class: 'oc-main' }, el.work, el.stepsBox);
  const shell = h('div', { class: `oc${board ? ' oc-board' : ''}`, 'data-support': support }, strip, card, el.main, band, el.end);
  root.append(shell);

  // ---- the set: fresh per student (a seed of their own, never the same problem twice), and where they were
  const sig = sigOf(A);
  const saved = (() => { const v = call(() => B().storage && B().storage.get(SAVE_KEY)); return v && typeof v === 'object' && v.sig === sig ? v : null; })();
  const S = {
    seed: saved && Number.isInteger(saved.seed) ? saved.seed : (Math.floor(Math.random() * 2 ** 31) || 7), seen: saved && Array.isArray(saved.seen) ? saved.seen.slice(-200) : [],
    set: [], i: 0, right: 0, wrong: 0, st: null, tries: 0, phase: 'work', hintN: 0, stuck: false, keys: false, stepsOpen: support !== 'own', stepVal: [], stepDone: [], sel: null, watching: false, reported: false, idle: 0,
  };
  function dealSet(resume) {
    S.set = deal(A, { seed: S.seed, seen: S.seen });
    S.i = 0; S.right = 0; S.wrong = 0; S.reported = false;
    if (resume && saved && !saved.done && Number.isInteger(saved.i) && saved.i < S.set.length) { S.i = saved.i; S.right = saved.right | 0; S.wrong = saved.wrong | 0; }
    for (const p of S.set) { const k = TOOLS[p.tool].key(p); if (!S.seen.includes(k)) S.seen.push(k); }
  }
  const save = (extra = {}) => call(() => B().storage && B().storage.set(SAVE_KEY, { sig, seed: S.seed, seen: S.seen.slice(-200), i: S.i, right: S.right, wrong: S.wrong, st: S.phase === 'work' ? S.st : null, ...extra }));

  // ---- one problem
  const P = () => S.set[S.i];
  const Tool = () => TOOLS[P().tool];
  function begin(resumeSt) {
    const p = P(), t = Tool();
    S.st = resumeSt && typeof resumeSt === 'object' ? resumeSt : t.start(p); S.tries = 0; S.phase = 'work'; S.hintN = 0; S.stuck = false; S.sel = null; S.idle = Date.now();
    const steps = stepList(p); S.stepVal = steps.map(() => null); S.stepDone = steps.map(() => false);
    el.hint.hidden = true; el.fb.textContent = ''; el.fb.className = 'oc-fb';
    S.watching = support === 'watch' && !resumeSt;
    if (S.watching) { S.st = t.solve(p) || S.st; steps.forEach((s, i) => { if (s.ans !== undefined) { S.stepVal[i] = s.ans; } S.stepDone[i] = true; }); }
    paint();
    if (S.watching) feedback('', rich('watchNow'), { button: [T('youTry'), () => { S.watching = false; S.st = t.start(p); S.stepVal = S.stepVal.map(() => null); S.stepDone = S.stepDone.map(() => false); feedback('', ''); paint(); }] });
  }
  /** The steps of this problem: the Builder's own lines for this tool (text only), or the kit's (with step answers). */
  function stepList(p) {
    const own = ownSteps[p.tool];
    if (Array.isArray(own) && own.length) return own.slice(0, 6).map(s => ({ text: String(s).slice(0, 160) }));
    return TOOLS[p.tool].steps(p);
  }
  function hintList(p) {
    const own = ownHints[p.tool];
    if (Array.isArray(own) && own.length) return own.slice(0, 3).map(s => ({ text: String(s).slice(0, 160) }));
    return TOOLS[p.tool].hints(p).slice(0, 3);
  }
  const line = x => (x.text !== undefined ? document.createTextNode(x.text) : rich(x.k, x.v));

  function paint() {
    const p = P(), t = Tool(), total = S.set.length;
    el.ok.textContent = `✓ ${S.right}`; el.ok.setAttribute('aria-label', `${T('right')} ${S.right}`);
    el.no.textContent = `✗ ${S.wrong}`; el.no.setAttribute('aria-label', `${T('notYet')} ${S.wrong}`);
    el.left.textContent = T('toGo', { n: total - S.i - (S.phase === 'done' ? 1 : 0) });
    el.n.textContent = T('problemOf', { n: S.i + 1, total });
    const tk = t.task(p); el.task.textContent = ''; el.task.append(rich(tk.k, tk.v));
    const q = t.ask(p); el.ask.textContent = ''; el.ask.append(rich(q.k, q.v));
    el.check.textContent = S.phase === 'done' ? `${T('next')} ›` : `✓ ${T('check')}`;
    el.check.disabled = S.watching;
    el.hintBtn.textContent = ''; el.hintBtn.append(S.stuck ? '🙋 ' : '💡 ', T(S.stuck ? 'stuck' : 'hint'));
    el.hintBtn.classList.toggle('oc-lit', S.stuck && S.phase === 'work'); el.hintBtn.disabled = S.phase !== 'work' || S.watching;
    el.clear.disabled = S.phase !== 'work' || S.watching;
    el.work.dataset.tool = p.tool;
    el.work.textContent = '';
    el.work.append(VIEWS[p.tool](p, S.st, { locked: S.phase !== 'work' || S.watching, set, rich, T, guide: support !== 'own', select: sel => { S.sel = sel; paint(); }, sel: S.sel }));
    paintSteps();
  }
  function paintSteps() {
    const p = P(), steps = stepList(p), now = steps.findIndex((s, i) => s.ans !== undefined && !S.stepDone[i]);
    const at = now >= 0 ? now : Math.max(0, steps.findIndex(s => s.k === 'pressCheck'));
    const allDone = S.phase === 'done' && S.lastOk;
    el.stepsToggle.textContent = T(S.stepsOpen ? 'hideSteps' : 'showSteps'); el.stepsToggle.setAttribute('aria-expanded', String(S.stepsOpen));
    el.steps.hidden = !S.stepsOpen;
    el.stepsBox.classList.toggle('oc-closed', !S.stepsOpen);
    el.steps.textContent = '';
    steps.forEach((s, i) => {
      const done = allDone || S.stepDone[i] || (s.ans === undefined && i < at), cur = !done && i === at;
      const li = h('li', { class: done ? 'oc-done' : cur ? 'oc-now' : 'oc-todo', ...(cur ? { 'aria-current': 'step' } : {}) },
        h('span', { class: 'oc-k', 'aria-hidden': 'true' }, done ? '✓' : String(i + 1)), h('div', {}, h('p', {}, line(s))));
      if (s.ans !== undefined && (support !== 'own' || S.stepsOpen)) li.lastChild.append(stepBox(i, s, done));
      el.steps.append(li);
    });
  }
  /** A step's answer box: digits from the keypad or the keyboard (Guided, On my own), or ▲ ▼ (Count up). */
  function stepBox(i, s, done) {
    const v = S.stepVal[i], selected = S.sel === `step:${i}`;
    const box = h('button', { type: 'button', class: `oc-box${selected ? ' oc-sel' : ''}${S.stepBad === i ? ' oc-try' : ''}`, 'aria-label': `${T('box')} ${i + 1}`, 'aria-pressed': String(selected), disabled: done || S.phase !== 'work' || S.watching, dir: 'ltr',
      onclick: () => { S.sel = `step:${i}`; if (support !== 'count' && coarse()) keypad(true); paint(); } }, v === null ? '' : String(v));
    if (support !== 'count' || done) return h('span', { class: 'oc-ans' }, box);
    const bump = d => { S.stepVal[i] = Math.max(0, Math.min(999, (S.stepVal[i] || 0) + d)); sfx('click'); paintSteps(); };
    return h('span', { class: 'oc-ans' }, h('button', { type: 'button', class: 'oc-btn oc-sm', 'aria-label': T('down'), onclick: () => bump(-1) }, '▼'), box,
      h('button', { type: 'button', class: 'oc-btn oc-sm', 'aria-label': T('up'), onclick: () => bump(1) }, '▲'),
      h('button', { type: 'button', class: 'oc-btn oc-sm oc-primary', 'aria-label': T('check'), onclick: () => stepCheck(i) }, '✓'));
  }
  function stepCheck(i) {
    const s = stepList(P())[i]; if (!s || s.ans === undefined) return;
    if (S.stepVal[i] === s.ans) { S.stepDone[i] = true; S.stepBad = null; S.sel = null; sfx('coin'); }
    else { S.stepBad = i; S.wrongMoves = (S.wrongMoves || 0) + 1; if (S.wrongMoves >= 2) S.stuck = true; }
    paint();
  }
  /** A digit from the keypad or the keyboard: into the selected step box or digit box (null: delete). */
  function typeDigit(d) {
    S.idle = Date.now();
    if (!S.sel || S.phase !== 'work' || S.watching) return;
    if (S.sel.startsWith('step:')) {
      const i = +S.sel.slice(5), s = stepList(P())[i]; if (!s || s.ans === undefined || S.stepDone[i]) return;
      const cur = S.stepVal[i] === null ? '' : String(S.stepVal[i]);
      const nx = d === null ? cur.slice(0, -1) : (cur + d).slice(-3);
      S.stepVal[i] = nx === '' ? null : +nx; S.stepBad = null;
      if (d !== null && nx.length >= String(s.ans).length) stepCheck(i); else paint();
      return;
    }
    if (S.sel.startsWith('col:') && S.st && Array.isArray(S.st.ans)) {
      const c = +S.sel.slice(4), ans = S.st.ans.slice();
      ans[c] = d; set({ ans });
      if (d !== null && c + 1 < ans.length) { S.sel = `col:${c + 1}`; paint(); }
    }
  }
  /** A new state for the manipulative (a move). */
  function set(st) { if (S.phase !== 'work' || S.watching) return; S.st = st; S.idle = Date.now(); sfx('click'); save(); paint(); }
  function clear() { if (S.phase !== 'work') return; S.st = Tool().start(P()); S.sel = null; feedback('', ''); save(); paint(); }
  function feedback(kind, content, o = {}) {
    el.fb.className = `oc-fb${kind ? ` oc-${kind}` : ''}`; el.fb.textContent = '';
    if (content) el.fb.append(content);
    if (o.button) el.fb.append(' ', h('button', { type: 'button', class: 'oc-btn oc-sm', onclick: o.button[1] }, o.button[0]));
  }
  function showHint() {
    if (S.phase !== 'work') return;
    const list = hintList(P());
    el.hint.hidden = false; el.hint.textContent = '';
    if (S.hintN >= list.length) { el.hint.append(h('span', { 'aria-hidden': 'true' }, '💡'), h('div', {}, h('p', {}, T('noMoreHints')))); return; }
    const x = list[S.hintN++];
    el.hint.append(h('span', { 'aria-hidden': 'true' }, '💡'), h('div', {}, h('b', {}, T('hintOf', { n: S.hintN, total: list.length })), h('p', {}, line(x))));
    S.stuck = false; paint();
  }
  function doCheck() {
    if (S.phase !== 'work' || S.watching) return;
    const p = P(), t = Tool(), r = t.check(p, S.st);
    S.tries++;
    if (r.ok) {
      S.right++; S.phase = 'done'; S.lastOk = true; sfx('coin');
      feedback('good', rich('right'));
      call(() => { if (!reduced() && B().fx && B().fx.pop) B().fx.pop(el.work); });
    } else if (S.tries < 2) {
      S.stuck = true; S.wrongMoves = 0;
      const f = document.createDocumentFragment(); f.append(h('b', {}, T('notYet')), ' ', r.hint ? rich(r.hint.k, r.hint.v) : '', ' ', T('tryAgain'));
      feedback('try', f);
    } else {
      S.wrong++; S.phase = 'done'; S.lastOk = false; S.st = t.solve(p) || S.st;
      const steps = stepList(p); steps.forEach((s, i) => { if (s.ans !== undefined) S.stepVal[i] = s.ans; S.stepDone[i] = true; });
      feedback('shown', rich('shown'));
    }
    save({ i: S.phase === 'done' ? S.i + 1 : S.i });
    paint();
    el.check.focus({ preventScroll: true });
  }
  function next() {
    if (S.i + 1 >= S.set.length) return finish();
    S.i++; save(); begin(); el.task.scrollIntoView && call(() => el.task.scrollIntoView({ block: 'nearest' }));
    el.check.focus({ preventScroll: true });
  }
  function finish() {
    const total = S.set.length;
    save({ i: total, done: true });
    if (!board && !S.reported) { S.reported = true; call(() => B().gameOver && B().gameOver({ won: S.right === total, score: S.right })); }
    sfx('win'); call(() => { if (S.right && !reduced() && B().fx && B().fx.confetti) B().fx.confetti(); });
    el.main.hidden = true; card.hidden = true; band.hidden = true;
    el.end.hidden = false; el.end.textContent = '';
    el.end.append(h('h2', { id: 'oc-end-h' }, T('endH', { right: S.right, total })), h('p', {}, T(S.right === total ? 'endAll' : 'endSome')),
      h('div', { class: 'oc-btns' },
        h('button', { type: 'button', class: 'oc-btn oc-primary', onclick: again }, A.gen ? `🎲 ${T('newSet')}` : `↻ ${T('again')}`),
        B().back ? h('button', { type: 'button', class: 'oc-btn', onclick: () => call(() => B().back()) }, `← ${T('back')}`) : null));
    el.left.textContent = T('toGo', { n: 0 });
    el.end.querySelector('button').focus({ preventScroll: true });
  }
  function again() {
    if (A.gen) S.seed = (S.seed * 48271 + 11) % 2147483647 || 7;
    dealSet(false); save();
    el.main.hidden = false; card.hidden = false; band.hidden = false; el.end.hidden = true;
    begin();
  }
  function keypad(on) { S.keys = !!on; el.keys.hidden = !S.keys; el.keyBtn.setAttribute('aria-pressed', String(S.keys)); }
  const coarse = () => typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;

  // ---- keys: digits and Backspace for the selected box; Enter checks
  addEventListener('keydown', e => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (/^[0-9]$/.test(e.key) && S.sel) { e.preventDefault(); typeDigit(+e.key); }
    else if (e.key === 'Backspace' && S.sel) { e.preventDefault(); typeDigit(null); }
  });
  // "Stuck?" lights up after 45 s without a move, the same as the Big Divide
  setInterval(() => { if (S.phase === 'work' && !S.watching && !S.stuck && Date.now() - S.idle > IDLE_MS) { S.stuck = true; paint(); } }, 5000);

  dealSet(true);
  if (!S.set.length) { el.work.append(h('p', {}, T('fbEmpty'))); return { selfTest: () => selfTest(A, WORDS.en) }; }
  if (saved && saved.done) { S.i = 0; }
  begin(saved && !saved.done && saved.i === S.i ? saved.st : null);
  if (support === 'own') S.stepsOpen = false, paintSteps();
  const api = {
    version: VERSION, selfTest: () => selfTest(A, WORDS.en),
    state: () => ({ screen: el.end.hidden ? 'work' : 'end', problem: S.i + 1, problems: S.set.length, right: S.right, wrong: S.wrong, tool: P() && P().tool, phase: S.phase, score: S.right, controls: 'none' }),
  };
  call(() => { window.__brbTest = { state: api.state, start() {} }; });
  return api;
}

// ---------------------------------------------------------------- drag and tap
// A tile can be tapped (then a place tapped) or dragged onto a place: both end in the same drop(). Pointer events only,
// so it works with a mouse, a pen and touch; the tap path is the keyboard's too (buttons).
function draggable(btn, payload, drop) {
  let start = null, ghost = null, moved = false;
  btn.addEventListener('pointerdown', e => { if (btn.disabled || e.button > 0) return; start = { x: e.clientX, y: e.clientY }; moved = false; btn.setPointerCapture && btn.setPointerCapture(e.pointerId); });
  btn.addEventListener('pointermove', e => {
    if (!start) return;
    if (!moved && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 8) { moved = true; ghost = btn.cloneNode(true); ghost.className += ' oc-ghost'; ghost.removeAttribute('id'); document.body.append(ghost); }
    if (ghost) { ghost.style.left = `${e.clientX - ghost.offsetWidth / 2}px`; ghost.style.top = `${e.clientY - ghost.offsetHeight / 2}px`; }
  });
  const end = e => {
    if (!start) return; start = null;
    if (ghost) { ghost.remove(); ghost = null; }
    if (!moved) return;
    btn.dataset.dragged = '1'; setTimeout(() => { delete btn.dataset.dragged; }, 0);
    const at = document.elementFromPoint(e.clientX, e.clientY), zone = at && at.closest('[data-drop]');
    if (zone) drop(payload, zone.dataset.drop);
  };
  btn.addEventListener('pointerup', end); btn.addEventListener('pointercancel', () => { start = null; if (ghost) { ghost.remove(); ghost = null; } });
  return btn;
}
const tapped = (btn, fn) => { btn.addEventListener('click', e => { if (btn.dataset.dragged) { e.preventDefault(); return; } fn(e); }); return btn; };

// ---------------------------------------------------------------- the manipulatives' views
// view(p, st, ctx) -> an element. ctx: { locked, set(newState), rich, T, guide (show the dotted guide), select, sel }.
const pct = x => `${Math.round(x * 100000) / 1000}%`;
/** A bar cut into d parts with n shaded (the target). */
const targetBar = (n, d, c = 'c0') => h('div', { class: 'oc-bar', role: 'img', 'aria-label': `${n}/${d}` }, ...Array.from({ length: d }, (_, i) => h('span', { class: `oc-part${i < n ? ` oc-on oc-${c}` : ''}`, style: `width:${pct(1 / d)}` })));
const row = (label, fr, body) => h('div', { class: 'oc-row' }, h('div', { class: 'oc-lab' }, label ? h('small', {}, label) : null, fr), body);
const sizes = p => { const set = new Set([p.to, ...(p.tray || [p.from[1], [3, 6, 5, 10, 12, 4, 2].find(x => x !== p.to && x !== p.from[1])])]); return [...set].sort((a, b) => a - b); };

const VIEWS = {
  'fractions.equiv'(p, st, c) {
    const pcs = st.pieces || [], used = pcs.reduce((s, d) => s + 1 / d, 0), all = pcs.every(d => d === p.to);
    const add = d => { if (c.locked) return; if (used + 1 / d > 1 + 1e-9) return; c.set({ pieces: [...pcs, d] }); };
    const yours = h('div', { class: 'oc-barwrap', 'data-drop': 'bar' },
      h('div', { class: 'oc-bar oc-yours', 'aria-label': c.T('placed', { n: pcs.length }) },
        ...pcs.map((d, i) => tapped(h('button', { type: 'button', class: `oc-part oc-on ${d === p.to ? 'oc-c1' : 'oc-c2'}`, style: `width:${pct(1 / d)}`, disabled: c.locked, 'aria-label': `1/${d}` }, frac(1, d)), () => { if (!c.locked) c.set({ pieces: pcs.filter((_, j) => j !== i) }); })),
        used < 1 - 1e-9 ? h('span', { class: 'oc-slot', style: `width:${pct(1 - used)}` }) : null),
      c.guide ? h('span', { class: 'oc-guide', style: `inset-inline-start:${pct(p.from[0] / p.from[1])}`, 'aria-hidden': 'true' }) : null);
    const tray = h('div', { class: 'oc-tray', role: 'group', 'aria-label': c.T('pieces') }, h('b', {}, c.T('pieces')),
      ...sizes(p).map(d => draggable(tapped(h('button', { type: 'button', class: `oc-tile ${d === p.to ? 'oc-c1' : 'oc-c2'}`, style: `min-width:${Math.max(56, 360 / d)}px`, disabled: c.locked, 'aria-label': `1/${d}` }, frac(1, d)), () => add(d)), d, (dd, zone) => { if (zone === 'bar') add(dd); })),
      h('span', { class: 'oc-count' }, c.T('placed', { n: pcs.length })));
    return h('div', { class: 'oc-stack', dir: 'ltr' }, row(c.T('target'), frac(p.from[0], p.from[1]), targetBar(p.from[0], p.from[1])),
      row(c.T('yours'), all && pcs.length ? frac(pcs.length, p.to) : h('span', { class: 'oc-q' }, pcs.length ? '?' : '–'), yours), tray);
  },
  'fractions.shade'(p, st, c) {
    const on = new Set(st.on || []);
    const bar = h('div', { class: 'oc-bar oc-tall', role: 'group', 'aria-label': c.T('workspace') }, ...Array.from({ length: p.d }, (_, i) => tapped(h('button', { type: 'button', class: `oc-part${on.has(i) ? ' oc-on oc-c1' : ''}`, style: `width:${pct(1 / p.d)}`, 'aria-pressed': String(on.has(i)), 'aria-label': `${i + 1}/${p.d}`, disabled: c.locked }), () => { const n = new Set(on); n.has(i) ? n.delete(i) : n.add(i); c.set({ on: [...n] }); })));
    return h('div', { class: 'oc-stack', dir: 'ltr' }, row(c.T('target'), frac(p.n, p.d), h('div', { class: 'oc-q oc-big' }, frac(p.n, p.d))), row(c.T('yours'), frac(on.size, p.d), bar));
  },
  'fractions.compare'(p, st, c) {
    const signs = ['<', '=', '>'].map(s => tapped(h('button', { type: 'button', class: 'oc-btn oc-sign', 'aria-pressed': String(st.pick === s), disabled: c.locked }, s), () => c.set({ pick: s })));
    return h('div', { class: 'oc-stack', dir: 'ltr' }, row('', frac(p.a[0], p.a[1]), targetBar(p.a[0], p.a[1], 'c0')), row('', frac(p.b[0], p.b[1]), targetBar(p.b[0], p.b[1], 'c2')),
      h('div', { class: 'oc-signs' }, frac(p.a[0], p.a[1]), h('div', { class: 'oc-signbtns', role: 'group' }, ...signs), frac(p.b[0], p.b[1])));
  },
  'numberline.point': (p, st, c) => lineView(p, st, c, null),
  'numberline.jump': (p, st, c) => lineView(p, st, c, p.from),
  'digits.add': (p, st, c) => colView(p, st, c, '+'),
  'digits.sub': (p, st, c) => colView(p, st, c, '−'),
  'digits.mul': (p, st, c) => colView(p, st, c, '×'),
  'tiles.sort'(p, st, c) {
    const at = st.at || p.items.map(() => null), T = TOOLS['tiles.sort'], bins = T.bins(p);
    const text = i => (p.rule ? (Array.isArray(p.items[i]) ? frac(p.items[i][0], p.items[i][1]) : String(p.items[i])) : p.items[i].t);
    const put = (i, b) => { if (c.locked) return; const n = at.slice(); n[i] = b; c.select(null); c.set({ at: n }); };
    const tile = i => draggable(tapped(h('button', { type: 'button', class: `oc-tile oc-word${c.sel === `tile:${i}` ? ' oc-sel' : ''}`, 'aria-pressed': String(c.sel === `tile:${i}`), disabled: c.locked, dir: 'auto' }, text(i)),
      () => { if (at[i] !== null && at[i] !== undefined && c.sel !== `tile:${i}`) return put(i, null); c.select(c.sel === `tile:${i}` ? null : `tile:${i}`); }), i, (ii, zone) => put(ii, zone === 'tray' ? null : +zone.slice(4)));
    const sel = c.sel && c.sel.startsWith('tile:') ? +c.sel.slice(5) : null;
    return h('div', { class: 'oc-stack' },
      h('div', { class: 'oc-tray', 'data-drop': 'tray', role: 'group', 'aria-label': c.T('tiles') }, h('b', {}, c.T('tiles')), ...p.items.map((_, i) => (at[i] === null || at[i] === undefined ? tile(i) : null)), h('span', { class: 'oc-count' }, c.T('pickTile'))),
      h('div', { class: 'oc-bins' }, ...bins.map((b, k) => tapped(h('div', { class: 'oc-bin', 'data-drop': `bin:${k}`, role: 'group', 'aria-label': b.text !== undefined ? b.text : c.T(b.k, b.v) },
        h('button', { type: 'button', class: 'oc-binlab', disabled: c.locked || sel === null, dir: 'auto' }, b.text !== undefined ? b.text : c.rich(b.k, b.v)), h('div', { class: 'oc-binin' }, ...p.items.map((_, i) => (at[i] === k ? tile(i) : null)))), () => { if (sel !== null) put(sel, k); }))));
  },
  'tiles.order'(p, st, c) {
    const slots = st.slots || p.items.map(() => null);
    const text = i => (Array.isArray(p.items[i]) ? frac(p.items[i][0], p.items[i][1]) : String(p.items[i]));
    const place = (i, k) => { if (c.locked) return; const n = slots.map(x => (x === i ? null : x)); n[k] = i; c.select(null); c.set({ slots: n }); };
    const sel = c.sel && c.sel.startsWith('tile:') ? +c.sel.slice(5) : null;
    const tile = i => draggable(tapped(h('button', { type: 'button', class: `oc-tile oc-word${sel === i ? ' oc-sel' : ''}`, 'aria-pressed': String(sel === i), disabled: c.locked }, text(i)), () => c.select(sel === i ? null : `tile:${i}`)), i, (ii, zone) => { if (zone.startsWith('slot:')) place(ii, +zone.slice(5)); });
    return h('div', { class: 'oc-stack', dir: 'ltr' },
      h('div', { class: 'oc-slots', role: 'group', 'aria-label': c.T('order') }, ...slots.map((x, k) => tapped(h('button', { type: 'button', class: `oc-slotbox${x === null ? '' : ' oc-full'}`, 'data-drop': `slot:${k}`, disabled: c.locked, 'aria-label': `${k + 1}` }, h('small', {}, k + 1), x === null ? '' : text(x)),
        () => { if (sel !== null) place(sel, k); else if (x !== null) { const n = slots.slice(); n[k] = null; c.set({ slots: n }); } }))),
      h('div', { class: 'oc-tray', role: 'group', 'aria-label': c.T('tiles') }, h('b', {}, c.T('tiles')), ...p.items.map((_, i) => (slots.includes(i) ? null : tile(i))), h('span', { class: 'oc-count' }, c.T('pickTile'))));
  },
};
function lineView(p, st, c, from) {
  const lo = p.lo * p.sub, hi = p.hi * p.sub, n = hi - lo, R = v => { const r = Array.isArray(v) ? { n: v[0], d: v[1] } : { n: v, d: 1 }; return (r.n * p.sub) / r.d; };
  const ticks = [];
  for (let t = lo; t <= hi; t++) {
    const whole = t % p.sub === 0, on = st.tick === t, start = from !== null && R(from) === t;
    ticks.push(tapped(h('button', { type: 'button', class: `oc-tick${whole ? ' oc-whole' : ''}${on ? ' oc-on' : ''}${start ? ' oc-start' : ''}`, style: `left:${pct((t - lo) / n)}`, 'aria-pressed': String(on), disabled: c.locked,
      'aria-label': whole ? String(t / p.sub) : `${t - Math.floor(t / p.sub) * p.sub}/${p.sub} + ${Math.floor(t / p.sub)}` }, h('i', { 'aria-hidden': 'true' }), whole ? h('span', { class: 'oc-tlab' }, String(t / p.sub)) : null), () => c.set({ tick: t })));
  }
  return h('div', { class: 'oc-stack', dir: 'ltr' }, h('div', { class: 'oc-line' }, h('div', { class: 'oc-axis', 'aria-hidden': 'true' }), ...ticks));
}
function colView(p, st, c, sign) {
  const ans = st.ans || [], cols = ans.length, A = String(p.a).split('').reverse(), Bd = String(p.b).split('').reverse();
  const cell = (txt, cls = '') => h('span', { class: `oc-cell ${cls}` }, txt === undefined ? '' : txt);
  const rowOf = (digits, lead) => h('div', { class: 'oc-crow' }, cell(lead, 'oc-sign'), ...Array.from({ length: cols }, (_, k) => cell(digits[cols - 1 - k])));
  const boxes = h('div', { class: 'oc-crow oc-answer' }, cell(''), ...Array.from({ length: cols }, (_, k) => {
    const i = cols - 1 - k, on = c.sel === `col:${i}`;
    return tapped(h('button', { type: 'button', class: `oc-cell oc-dbox${on ? ' oc-sel' : ''}`, 'aria-pressed': String(on), 'aria-label': `${c.T('box')}: ${c.T(['ones', 'tens', 'hundreds', 'thousands', 'tenThousands'][i] || 'ones')}`, disabled: c.locked }, ans[i] === null || ans[i] === undefined ? '' : String(ans[i])), () => c.select(on ? null : `col:${i}`));
  }));
  return h('div', { class: 'oc-stack oc-cols', dir: 'ltr' }, h('div', { class: 'oc-paper' }, rowOf(A, ''), rowOf(Bd, sign), h('div', { class: 'oc-rule', 'aria-hidden': 'true' }), boxes));
}

// ---------------------------------------------------------------- the font (Bricolage Grotesque, self-hosted next to the kit)
let fontDone = false;
const KIT_BASE = (() => { try { const s = document.currentScript && document.currentScript.src; return s ? s.replace(/[^/]*$/, '') : ''; } catch (e) { return ''; } })();
function loadFont() {
  if (fontDone || !KIT_BASE || typeof FontFace === 'undefined') return; fontDone = true;
  for (const [f, range] of [['bricolage-latin.woff2', 'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD'], ['bricolage-latin-ext.woff2', 'U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF']]) {
    try { const face = new FontFace('Bricolage Grotesque', `url(${KIT_BASE}fonts/${f}) format('woff2')`, { weight: '200 800', unicodeRange: range, display: 'swap' }); document.fonts.add(face); face.load().catch(() => {}); } catch (e) { /* the system font */ }
  }
}

export { TOOLS, deal, selfTest, seeded, manipulativeOf, cleanProblem, WORDS, VERSION, MAX_COUNT };
