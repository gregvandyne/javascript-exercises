// Oomba Canvas: the activity on the page. A task card, a graph-paper workspace with one manipulative, a Steps panel,
// and a bottom band with the problem's question and Check / Hint / Clear. Each student works on their own copy, on
// their own device: their place in the set is kept in their own game save (BRB.storage 'oc-progress-v1'), and nothing
// leaves the device but the end result (BRB.gameOver once per set). Students only tap, drag and type digits (the
// kit's own keypad and digit keys): there is no text field anywhere.
// 1.3.0: the teacher's controls (teach.js) for the activity's maker and school staff (BRB.canTeach), and the worked
// answer's own lines on screen when it is shown.
// 1.4.0: worksheets (sets.js). A link with a teacher's saved worksheet (BRB.questionSet) plays exactly its questions,
// for everyone; school staff get "My worksheets" in the teacher's controls (BRB.canListSets) to save the questions on
// screen, open, print, share, copy, rename and delete them.
// 1.4.1: 1.4.0 with the phone layout (first made as 1.3.1, which never shipped). The top strip is three groups (the
// title; the status: help mode, ✓, ✗, to go; the actions: New sheet, Print, Teacher, Keypad), each one row that
// scrolls sideways when it cannot fit, never a lone button on a line of its own; short labels on narrow phones; 44 px
// tap targets; the end card's buttons stack full width on a narrow card and wrap whole otherwise (style.js).
// 1.5.0: 1.4.1 in the Crossword look (style.js only): the dotted mint board, the problem line in the dark Now bar, and
// Check Crossword's flat green Go pill. Same data, same behavior as 1.4.1.
// 1.6.0: the owner's fourth audit (docs/decisions.md "Builder class games: audit 4 quality"). A wrong step box says so
// (kindly, marked, counted as a Not yet); Check reads a step box that is not done yet, and "Nothing is there yet" only
// when nothing is; Clear empties the step boxes too; typing in a full box starts it again; tapping the box already
// chosen keeps it chosen (the lost first digit in the Tens box). Hints use the problem's own digits and answer the last
// mistake, under one 💡 Hint label. Stars for each problem (3 first time, 2 after a Not yet or a hint, 1 after more)
// and the stars on the end card, a sound switch (the site's own mute), carried digits shown over their column, and the
// activity's theme (task.theme: an icon, cheers, an end line; a problem's story) on screen. No timer, no ranking.
import { TOOLS, SUPPORTS, PURPOSES, MAX_COUNT, MAX_PROBLEMS, deal, selfTest, seeded, manipulativeOf, cleanProblem, numText, themeOf } from './logic.js';
import { sheet } from './sheet.js';
import { WORDS, wordsFor } from './words.js';
import { CSS } from './style.js';
import { teachControls } from './teach.js';
import { worksheets } from './sets.js';

const VERSION = '1.6.0';
const SAVE_KEY = 'oc-progress-v1';
const IDLE_MS = 45000;

const B = () => (typeof window !== 'undefined' && window.BRB) || {};
const call = (fn, ...a) => { try { return fn ? fn(...a) : undefined; } catch (e) { return undefined; } };
const sfx = name => call(() => { const s = B().sfx; if (s && s.play) s.play(name); });
const hasSfx = () => !!(B().sfx && typeof B().sfx.mute === 'function');
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

/** A worksheet's class code as a teacher reads it: s-c5exp1cm9h -> "C5EXP 1CM9H". */
const wsCode = id => { const c = String(id).replace(/^s-/, '').toUpperCase(); return `${c.slice(0, 5)} ${c.slice(5)}`; };
/** One stacked fraction (the dashboard's .dt-frac). */
const frac = (n, d) => h('span', { class: 'oc-frac', role: 'img', 'aria-label': `${n}/${d}` }, h('span', { class: 'oc-fn' }, n), h('span', { class: 'oc-fl', 'aria-hidden': 'true' }), h('span', { class: 'oc-fd' }, d));

export function activity(input) {
  if (typeof document === 'undefined') return null;
  const A0 = input && typeof input === 'object' ? input : {};
  // 1.4.0: a teacher's worksheet that the link opened (BRB.questionSet: the questions they saved, which the server
  // cleaned for this activity): exactly those questions, in their order, for everyone who opens the link
  const qsIn = B().questionSet, qsMissing = !!(qsIn && qsIn.missing);
  const QS = qsIn && !qsIn.missing && typeof qsIn.id === 'string' && Array.isArray(qsIn.items) && qsIn.items.length ? qsIn : null;
  const A = QS ? { ...A0, problems: JSON.parse(JSON.stringify(QS.items)).slice(0, MAX_PROBLEMS), gen: null, config: { ...(A0.config && typeof A0.config === 'object' ? A0.config : {}), fresh: false } } : A0;
  const cfg = A.config && typeof A.config === 'object' ? A.config : {};
  const lang = (B().user && B().user.lang) || cfg.lang || 'en', W = wordsFor(lang), dir = (B().user && B().user.dir) || (/^(ar|he)\b/.test(lang) ? 'rtl' : 'ltr');
  // 1.1.0: config.supports, the help modes this activity offers (in SUPPORTS order). More than one: the support chip is a
  // small switcher, so a student (or the teacher on the board) moves between them; it starts on config.support when that
  // is one of them, else on the first. One, or none (a 1.0.0 activity): the chip, as before.
  const supports = Array.isArray(cfg.supports) ? SUPPORTS.filter(x => cfg.supports.includes(x)) : [];
  let support = SUPPORTS.includes(cfg.support) && (!supports.length || supports.includes(cfg.support)) ? cfg.support : supports[0] || 'guided';
  const modes = supports.length > 1 ? supports : null, board = cfg.board === true;
  // 1.3.0: the teacher's controls, only where the server says this viewer may have them (never a student)
  const teach = B().canTeach === true;
  const task = A.task && typeof A.task === 'object' ? A.task : {};
  const ownSteps = A.steps && typeof A.steps === 'object' ? A.steps : {}, ownHints = A.hints && typeof A.hints === 'object' ? A.hints : {};
  // 1.6.0: the activity's theme (task.theme, written by the Builder in the builder's language): an icon beside the
  // problem line and on the end card, a few short cheers for a right answer, and the end card's own line
  const TH = themeOf(task.theme);
  // 1.2.0: what it is for (config.purpose): practice on screen (always), a printable worksheet, a question generator.
  // Printing goes through the page (BRB.print: the frame cannot print); the answer key only where the page says the
  // viewer may print it (BRB.canPrintKey: the activity's maker, school staff; never a student).
  const purpose = Array.isArray(cfg.purpose) && cfg.purpose.some(x => PURPOSES.includes(x)) ? PURPOSES.filter(x => cfg.purpose.includes(x)) : ['screen'];
  const printable = (purpose.includes('worksheet') || purpose.includes('generator')) && B().canPrint === true && typeof B().print === 'function';
  const fresh = purpose.includes('generator') && !!(A.gen && TOOLS[A.gen.tool]);

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
  const arrow = c => h('span', { dir: 'ltr', 'aria-hidden': 'true' }, c);
  // a label with a shorter twin for narrow phones (1.4.1: style.js shows one of the two)
  const dual = (long, short) => [h('span', { class: 'oc-ll' }, long), h('span', { class: 'oc-ls', 'aria-hidden': 'true' }, short)];
  const strip = h('header', { class: 'oc-strip' },
    el.title = h('h1', { dir: 'auto' }, String(task.title || document.title || '').slice(0, 80)),
    el.stat = h('div', { class: 'oc-stat' },
      modes ? (el.modes = h('div', { class: 'oc-modes', role: 'group', 'aria-label': T('helpMode') }, ...modes.map(m => h('button', { type: 'button', class: 'oc-mode', 'data-mode': m, 'aria-pressed': String(m === support), onclick: () => setSupport(m) }, T(m)))))
        : (el.sup = h('span', { class: 'oc-chip oc-sup' }, T(support))),
      board ? h('span', { class: 'oc-chip' }, T('board')) : null,
      teach ? (el.boardChip = h('span', { class: 'oc-chip oc-bchip', hidden: true }, h('span', { 'aria-hidden': 'true' }, '📽 '), T('boardChip'))) : null,
      el.ok = h('span', { class: 'oc-chip oc-ok' }), el.no = h('span', { class: 'oc-chip oc-no' }), el.stars = h('span', { class: 'oc-chip oc-stars' }), el.left = h('span', { class: 'oc-chip oc-togo' })),
    // (Back and Next follow the reading direction: the strip is a row in the page's direction, the arrows point outward;
    // each arrow is set left to right so the browser never mirrors it a second time)
    teach ? (el.nav = h('span', { class: 'oc-bnav', hidden: true }, h('button', { type: 'button', class: 'oc-btn oc-sm', onclick: () => boardGo(-1) }, arrow(dir === 'rtl' ? '›' : '‹'), ' ', T('back')), el.navAt = h('b', { 'aria-live': 'polite' }), h('button', { type: 'button', class: 'oc-btn oc-sm', onclick: () => boardGo(1) }, T('next'), ' ', arrow(dir === 'rtl' ? '‹' : '›')))) : null,
    el.acts = h('div', { class: 'oc-acts' },
      fresh ? h('button', { type: 'button', class: 'oc-btn oc-sm', 'aria-label': T('newSheet'), onclick: () => again(true) }, h('span', { 'aria-hidden': 'true' }, '🎲'), ' ', ...dual(T('newSheet'), T('newShort'))) : null,
      printable ? (el.printBtn = h('button', { type: 'button', class: 'oc-btn oc-sm', 'aria-label': T('print'), 'aria-expanded': 'false', 'aria-controls': 'oc-print', onclick: () => printPanel(!PR.open) }, h('span', { 'aria-hidden': 'true' }, '🖨'), ' ', ...dual(T('print'), T('printGo')))) : null,
      // 1.6.0: sound on or off, the site's own switch (BRB.sfx.mute: the choice is kept for every game)
      hasSfx() ? (el.snd = h('button', { type: 'button', class: 'oc-btn oc-sm oc-snd', 'aria-label': T('sound'), onclick: toggleSound })) : null,
      el.keyBtn = h('button', { type: 'button', class: 'oc-btn oc-sm oc-keybtn', 'aria-pressed': 'false', 'aria-controls': 'oc-keys', onclick: () => keypad(!S.keys) }, h('span', { 'aria-hidden': 'true' }, '⌨'), ' ', T('keypad'))));
  function paintSound() { if (!el.snd) return; const off = !!call(() => B().sfx.muted); el.snd.textContent = off ? '🔇' : '🔊'; el.snd.setAttribute('aria-pressed', String(!off)); el.snd.title = T(off ? 'soundOff' : 'soundOn'); }
  function toggleSound() { call(() => B().sfx.mute()); paintSound(); if (!call(() => B().sfx.muted)) sfx('click'); }
  paintSound();
  // 1.3.0: the teacher's controls (teach.js): a bar under the strip, or one Teacher button and its menu on phones
  // (1.4.1: the button sits with the other actions, not on top of the title)
  // 1.4.0: My worksheets, only where the page offers the list (school staff in the published activity; never a student)
  const hasSets = teach && B().canListSets === true && typeof B().mySets === 'function' && typeof B().saveQuestionSet === 'function';
  const TC = teach ? teachControls({ h, T, supports: SUPPORTS, gen: !!(A.gen && TOOLS[A.gen.tool]), sets: hasSets, state: () => ({ board: S.boardOn }), on: { show: showAnswer, board: setBoard, help: m => setSupport(m, true), newSet: () => again(true), sets: () => setTimeout(() => wsPanel(!WS.isOpen()), 0) } }) : null;
  if (TC) el.acts.insertBefore(TC.button, el.keyBtn);
  const canSay = !!(task.say && B().speak);
  const card = h('section', { class: 'oc-task', 'aria-label': T('task') },
    TH && TH.icon ? h('span', { class: 'oc-ticon', 'aria-hidden': 'true' }, TH.icon) : null,
    h('div', { class: 'oc-taskt' }, el.n = h('span', { class: 'oc-n' }), el.task = h('p', { id: 'oc-taskline', dir: 'auto' })),
    canSay ? h('button', { type: 'button', class: 'oc-say', 'aria-label': T('readAloud'), onclick: () => call(() => B().speak(String(task.say).slice(0, 300), { lang: cfg.lang || lang })) }, '🔊') : null);
  el.work = h('section', { class: 'oc-card oc-work', 'aria-label': T('workspace') });
  el.stepsBox = h('aside', { class: 'oc-card oc-steps', 'aria-labelledby': 'oc-steps-h' },
    h('div', { class: 'oc-steps-top' }, el.stepsH = h('h2', { id: 'oc-steps-h' }, h('span', { 'aria-hidden': 'true' }, '🪜 '), T('steps')),
      el.stepsToggle = h('button', { type: 'button', class: 'oc-btn oc-sm', 'aria-expanded': support === 'own' ? 'false' : 'true', 'aria-controls': 'oc-steps-list', onclick: () => { S.stepsOpen = !S.stepsOpen; paintSteps(); } })),
    el.steps = h('ol', { id: 'oc-steps-list' }));
  el.hint = h('div', { class: 'oc-hint', role: 'note', hidden: true });
  el.fb = h('div', { class: 'oc-fb', role: 'status', 'aria-live': 'polite' });
  el.ask = h('p', { class: 'oc-ask', dir: 'auto' });
  el.check = h('button', { type: 'button', class: 'oc-btn oc-primary', onclick: () => (S.phase === 'done' ? next() : doCheck()) });
  el.hintBtn = h('button', { type: 'button', class: 'oc-btn', onclick: showHint });
  el.clear = h('button', { type: 'button', class: 'oc-btn', onclick: clear }, '⌫ ', T('clear'));
  el.keys = h('div', { class: 'oc-keys', id: 'oc-keys', hidden: true, dir: 'ltr', role: 'group', 'aria-label': T('keypad') },
    ...['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'].map(d => h('button', { type: 'button', class: 'oc-key', onclick: () => typeDigit(+d) }, d)),
    el.dot = h('button', { type: 'button', class: 'oc-key', 'aria-label': T('point'), hidden: true, onclick: () => typeDigit('.') }, '.'),
    h('button', { type: 'button', class: 'oc-key', 'aria-label': T('del'), onclick: () => typeDigit(null) }, '⌫'));
  const band = h('footer', { class: 'oc-band' }, el.hint, el.fb, h('div', { class: 'oc-act' }, el.ask, h('div', { class: 'oc-btns' }, el.check, el.hintBtn, el.clear)), el.keys);
  el.end = h('section', { class: 'oc-end', hidden: true, 'aria-labelledby': 'oc-end-h' });
  el.main = h('div', { class: 'oc-main' }, el.work, el.stepsBox);
  el.print = h('section', { class: 'oc-card oc-print', id: 'oc-print', hidden: true, 'aria-labelledby': 'oc-print-h' });
  // 1.4.0: the worksheet on screen (teachers), or a link whose worksheet is gone (everyone)
  el.wsNote = h('p', { class: 'oc-wsbar', role: 'status', hidden: true });
  const WS = hasSets ? worksheets({ h, T, lang, B, current: () => ({ items: S.set.slice(0, 20), title: task.title || '' }), onScreen: () => S.ws, open: openWorksheet, paper: () => PR.paper,
    opener: () => (TC.setsButton && TC.setsButton.offsetParent ? TC.setsButton : TC.menuButton) }) : null;
  const shell = h('div', { class: `oc${board ? ' oc-board' : ''}${teach ? ' oc-teach' : ''}`, 'data-support': support }, strip, TC ? TC.bar : null, el.wsNote, el.print, WS ? WS.panel : null, card, el.main, band, el.end, TC ? TC.scrim : null, TC ? TC.menu : null);
  root.append(shell);

  // ---- the set: fresh per student (a seed of their own, never the same problem twice), and where they were
  const sig = sigOf(A);
  const saved = (() => { const v = call(() => B().storage && B().storage.get(SAVE_KEY)); return v && typeof v === 'object' && v.sig === sig ? v : null; })();
  const S = {
    seed: saved && Number.isInteger(saved.seed) ? saved.seed : (Math.floor(Math.random() * 2 ** 31) || 7), seen: saved && Array.isArray(saved.seen) ? saved.seen.slice(-200) : [],
    set: [], i: 0, right: 0, wrong: 0, st: null, tries: 0, phase: 'work', hintN: 0, stuck: false, keys: false, stepsOpen: support !== 'own', stepVal: [], stepDone: [], sel: null, watching: false, reported: false, idle: 0,
    // 1.3.0: shown (the problems whose answer the teacher showed: not counted), boardOn (board mode now), boardUsed (this
    // set was run on the board: no score), revealed (the worked answer is on screen)
    shown: saved && Array.isArray(saved.sh) ? saved.sh.filter(Number.isInteger) : [], boardOn: false, boardUsed: false, revealed: false, byTeacher: false,
    // 1.4.0: the worksheet on screen: { id, code, title, items? } (link: true when the link opened it; else a teacher
    // opened it from My worksheets, and its questions replace the set on this screen only)
    ws: QS ? { id: QS.id, code: wsCode(QS.id), title: '', link: true } : null,
    // 1.6.0: stars (0 to 3 for each problem, by its place in the set), notYet (every Not yet in this set: a wrong Check or
    // a wrong step box; the ✗ chip), and for the problem on screen: miss (its Not yets), hinted (a hint was opened),
    // focus (the column the last mistake was in: the hints answer it), badCol (the answer box marked after a Check)
    stars: saved && Array.isArray(saved.stars) ? saved.stars.map(x => (Number.isInteger(x) && x >= 0 && x <= 3 ? x : 0)).slice(0, MAX_PROBLEMS) : [],
    notYet: saved && Number.isInteger(saved.ny) && saved.ny >= 0 ? saved.ny : 0, miss: 0, hinted: false, focus: null, badCol: null, stepBad: null,
  };
  function dealSet(resume) {
    S.set = S.ws && !S.ws.link ? deal({ ...A, problems: S.ws.items, gen: null, config: { ...cfg, fresh: false } }, { seed: S.seed }) : deal(A, { seed: S.seed, seen: S.seen });
    S.i = 0; S.right = 0; S.wrong = 0; S.reported = false; S.boardUsed = S.boardOn;
    if (resume && saved && !saved.done && Number.isInteger(saved.i) && saved.i < S.set.length) { S.i = saved.i; S.right = saved.right | 0; S.wrong = saved.wrong | 0; } else { S.shown = []; S.stars = []; S.notYet = 0; }
    for (const p of S.set) { const k = TOOLS[p.tool].key(p); if (!S.seen.includes(k)) S.seen.push(k); }
  }
  // (a worksheet a teacher opened here is not their place in the activity: nothing is kept for it)
  const save = (extra = {}) => !(S.ws && !S.ws.link) && call(() => B().storage && B().storage.set(SAVE_KEY, { sig, seed: S.seed, seen: S.seen.slice(-200), i: S.i, right: S.right, wrong: S.wrong, st: S.phase === 'work' ? S.st : null, ...(S.shown.length ? { sh: S.shown } : {}), stars: S.stars, ny: S.notYet, ...extra }));

  // ---- one problem
  const P = () => S.set[S.i];
  const Tool = () => TOOLS[P().tool];
  function begin(resumeSt) {
    const p = P(), t = Tool();
    S.st = resumeSt && typeof resumeSt === 'object' ? resumeSt : t.start(p); S.tries = 0; S.phase = 'work'; S.hintN = 0; S.stuck = false; S.sel = null; S.idle = Date.now(); S.revealed = false; S.byTeacher = false;
    S.miss = 0; S.hinted = false; S.focus = null; S.badCol = null; S.stepBad = null;
    const steps = stepList(p); S.stepVal = steps.map(() => null); S.stepDone = steps.map(() => false);
    el.hint.hidden = true; el.fb.textContent = ''; el.fb.className = 'oc-fb';
    if (p.tool === 'figure.number') S.sel = 'fig';
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
  /** 1.6.0: the digits carried, by column, for the steps done so far (adding and multiplying, the kit's own steps):
   *  the digit boxes show each one small over its column, as on paper. */
  function carries(p) {
    if (p.tool !== 'digits.add' && p.tool !== 'digits.mul') return null;
    const out = {};
    stepList(p).forEach((s, i) => { if (Number.isInteger(s.col) && S.stepDone[i] && s.ans >= 10) out[s.col + 1] = Math.floor(s.ans / 10); });
    return out;
  }
  /** 1.6.0: the hints for the problem as it stands: the kit's use its own digits and the column of the last mistake
   *  (S.focus); the Builder's own lines come after the kit's line for that mistake, when there was one. */
  function hintList(p) {
    const own = ownHints[p.tool], kit = TOOLS[p.tool].hints(p, S.st, S.focus).slice(0, 3);
    if (Array.isArray(own) && own.length) return [...(S.focus !== null && p.tool.startsWith('digits.') ? [kit[1]] : []), ...own.slice(0, 3).map(s => ({ text: String(s).slice(0, 160) }))].slice(0, 3);
    return kit;
  }
  const line = x => (x.text !== undefined ? document.createTextNode(x.text) : rich(x.k, x.v));
  /** The switcher (1.1.0): another help mode for the problem on screen. It starts that problem again in the new mode
   *  (Watch shows the worked answer first; On my own closes the Steps panel); the set, the score and the place stay. */
  function setSupport(m, byTeacher = false) {
    // 1.3.0: the teacher's Help (byTeacher) may pick any of the four, for this screen only; students only the offered ones
    if (byTeacher ? !SUPPORTS.includes(m) : !modes || !modes.includes(m)) return;
    if (m === support) return;
    support = m; shell.dataset.support = m;
    if (el.modes) for (const b of el.modes.children) b.setAttribute('aria-pressed', String(b.dataset.mode === m));
    if (el.sup) el.sup.textContent = T(m);
    S.stepsOpen = m !== 'own';
    if (S.phase === 'work') begin(null); else paint();
  }

  function paint() {
    const p = P(), t = Tool(), total = S.set.length;
    el.ok.textContent = `✓ ${S.right}`; el.ok.setAttribute('aria-label', `${T('right')} ${S.right}`);
    el.no.textContent = `✗ ${S.notYet}`; el.no.setAttribute('aria-label', `${T('notYet')} ${S.notYet}`);
    const stars = S.stars.reduce((a, x) => a + (x || 0), 0);
    el.stars.textContent = `⭐ ${stars}`; el.stars.setAttribute('aria-label', T('starsN', { n: stars }));
    el.left.textContent = T('toGo', { n: total - S.i - (S.phase === 'done' ? 1 : 0) });
    el.n.textContent = T('problemOf', { n: S.i + 1, total });
    const tk = t.task(p); el.task.textContent = ''; el.task.append(line(tk));
    const q = t.ask(p); el.ask.textContent = ''; el.ask.append(line(q));
    el.dot.hidden = p.tool !== 'figure.number';
    el.check.textContent = S.phase === 'done' ? `${T('next')} ›` : `✓ ${T('check')}`;
    el.check.disabled = S.watching;
    // 1.6.0: one label, always (it lights up when a hint would help: after a Not yet, or 45 s without a move)
    el.hintBtn.textContent = ''; el.hintBtn.append('💡 ', T('hint'));
    el.hintBtn.classList.toggle('oc-lit', S.stuck && S.phase === 'work'); el.hintBtn.disabled = S.phase !== 'work' || S.watching;
    el.clear.disabled = S.phase !== 'work' || S.watching;
    el.work.dataset.tool = p.tool;
    el.work.textContent = '';
    el.work.append(VIEWS[p.tool](p, S.st, { locked: S.phase !== 'work' || S.watching, set, rich, T, lang, guide: support !== 'own', select: sel => { S.sel = sel; if (sel && coarse()) keypad(true); paint(); }, sel: S.sel, bad: S.badCol, carry: carries(p) }));
    paintSteps();
    if (TC) {
      el.navAt.textContent = T('nOfN', { n: S.i + 1, total });
      TC.paint({ support, board: S.boardOn, shown: S.shown.includes(S.i), done: S.phase === 'done' });
    }
  }
  function paintSteps() {
    const p = P();
    // 1.3.0: a worked answer on screen (the teacher's Show answer, or the kit's after a second try) lists a figure
    // question's own "work" lines, the last one (the answer) marked
    const work = S.revealed && Array.isArray(p.work) && p.work.length ? p.work : null;
    el.stepsBox.classList.toggle('oc-worked', !!work);
    el.stepsH.textContent = '';
    el.stepsH.append(h('span', { 'aria-hidden': 'true' }, work ? '👀 ' : '🪜 '), T(work ? 'workedAnswer' : 'steps'));
    el.stepsToggle.hidden = !!work;
    if (work) {
      el.steps.hidden = false; el.stepsBox.classList.remove('oc-closed'); el.steps.textContent = '';
      work.forEach((w, i) => el.steps.append(h('li', { class: i === work.length - 1 ? 'oc-done oc-last' : 'oc-done' }, h('span', { class: 'oc-k', 'aria-hidden': 'true' }, String(i + 1)), h('div', {}, h('p', { dir: 'auto' }, w)))));
      return;
    }
    const steps = stepList(p), now = steps.findIndex((s, i) => s.ans !== undefined && !S.stepDone[i]);
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
    const box = h('button', { type: 'button', class: `oc-box${selected ? ' oc-sel' : ''}${S.stepBad === i ? ' oc-bad' : ''}`, 'aria-label': `${T('box')} ${i + 1}${S.stepBad === i ? `: ${T('notYet')}` : ''}`, 'aria-pressed': String(selected), disabled: done || S.phase !== 'work' || S.watching, dir: 'ltr',
      onclick: () => { S.sel = `step:${i}`; if (support !== 'count' && coarse()) keypad(true); paint(); } }, v === null ? '' : String(v));
    if (support !== 'count' || done) return h('span', { class: 'oc-ans' }, box);
    const bump = d => { S.stepVal[i] = Math.max(0, Math.min(999, (S.stepVal[i] || 0) + d)); sfx('click'); paintSteps(); };
    return h('span', { class: 'oc-ans' }, h('button', { type: 'button', class: 'oc-btn oc-sm', 'aria-label': T('down'), onclick: () => bump(-1) }, '▼'), box,
      h('button', { type: 'button', class: 'oc-btn oc-sm', 'aria-label': T('up'), onclick: () => bump(1) }, '▲'),
      h('button', { type: 'button', class: 'oc-btn oc-sm oc-primary', 'aria-label': T('check'), onclick: () => stepCheck(i) }, '✓'));
  }
  /** A step box is checked as soon as it has as many digits as its answer (or by Check). 1.6.0: a wrong one says so,
   *  kindly, and is marked; it counts as a Not yet (the ✗ chip, and the problem's stars) but never uses up a Check,
   *  and the hints turn to that step's column. The next right step box is chosen by itself. */
  function stepCheck(i) {
    const steps = stepList(P()), s = steps[i]; if (!s || s.ans === undefined || S.stepVal[i] === null) return;
    if (S.stepVal[i] === s.ans) {
      S.stepDone[i] = true; S.stepBad = null; sfx('coin');
      const nx = steps.findIndex((x, j) => j > i && x.ans !== undefined && !S.stepDone[j]);
      // (the last one done: a column sum's ones box, when it is still empty, so the answer can be typed straight away)
      const ones = S.st && Array.isArray(S.st.ans) && (S.st.ans[0] === null || S.st.ans[0] === undefined) ? 'col:0' : null;
      S.sel = support === 'count' ? null : nx >= 0 ? `step:${nx}` : ones;
      if (S.focus === s.col) S.focus = null;
      if (S.fbStep) { S.fbStep = false; feedback('', ''); }
    } else {
      S.stepBad = i; S.notYet++; S.miss++; S.stuck = true; S.focus = Number.isInteger(s.col) ? s.col : S.focus; S.hintN = 0; S.fbStep = true;
      const f = document.createDocumentFragment(); f.append(h('b', {}, T('notYet')), ' ', T('fbStep', { n: S.stepVal[i] }));
      feedback('try', f); save();
    }
    paint();
  }
  /** A digit from the keypad or the keyboard: into the selected step box or digit box (null: delete). */
  function typeDigit(d) {
    S.idle = Date.now();
    if (S.sel === 'seed' && PR.open) { if (d === '.') return; const cur = PR.retype && d !== null ? '' : String(PR.seed); PR.retype = false; const nx = d === null ? cur.slice(0, -1) : (cur === '0' ? '' : cur) + d; PR.seed = Math.min(999999, +nx.slice(0, 6) || 0); paintPrint(); return; }
    if (!S.sel || S.phase !== 'work' || S.watching) return;
    if (S.sel === 'fig' && P().tool === 'figure.number') {
      const cur = (S.st && typeof S.st.typed === 'string' ? S.st.typed : '');
      if (d === '.' && cur.includes('.')) return;
      const nx = d === null ? cur.slice(0, -1) : (cur + (d === '.' && !cur ? '0.' : d)).slice(0, 9);
      set({ typed: nx }); return;
    }
    if (d === '.') return;
    if (S.sel.startsWith('step:')) {
      const i = +S.sel.slice(5), s = stepList(P())[i]; if (!s || s.ans === undefined || S.stepDone[i]) return;
      // 1.6.0: a box that is full (it was checked, right or not) starts again with the new digit: 8 then 9 is 9, not 89
      const want = String(s.ans).length, full = S.stepBad === i || (S.stepVal[i] !== null && String(S.stepVal[i]).length >= want);
      const cur = S.stepVal[i] === null || (full && d !== null) ? '' : String(S.stepVal[i]);
      const nx = d === null ? (S.stepVal[i] === null ? '' : String(S.stepVal[i]).slice(0, -1)) : (cur + d).slice(-3);
      S.stepVal[i] = nx === '' ? null : +nx; S.stepBad = null;
      if (d !== null && nx.length >= want) stepCheck(i); else paint();
      return;
    }
    if (S.sel.startsWith('col:') && S.st && Array.isArray(S.st.ans)) {
      // one digit a box; the next box to the left is chosen by itself (1.6.0: in the same paint, so no digit is lost)
      const c = +S.sel.slice(4), ans = S.st.ans.slice();
      ans[c] = d; if (S.badCol === c) S.badCol = null;
      if (d !== null && c + 1 < ans.length) S.sel = `col:${c + 1}`;
      set({ ans });
    }
  }
  /** A new state for the manipulative (a move). */
  function set(st) { if (S.phase !== 'work' || S.watching) return; S.st = st; S.idle = Date.now(); sfx('click'); save(); paint(); }
  /** Clear: the answer and (1.6.0) every step box not done yet; the steps already right stay right. */
  function clear() {
    if (S.phase !== 'work' || S.watching) return;
    S.st = Tool().start(P()); S.sel = null; S.badCol = null; S.stepBad = null; S.fbStep = false;
    S.stepVal = S.stepVal.map((v, i) => (S.stepDone[i] ? v : null));
    feedback('', ''); save(); paint();
  }
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
    S.stuck = false; S.hinted = true; paint();
  }
  /** 1.6.0: the stars a right answer earns: 3 first time with no hint, 2 after one Not yet or a hint, 1 after more. */
  const starsNow = () => (S.miss === 0 && !S.hinted ? 3 : S.miss <= 1 ? 2 : 1);
  const starText = n => '⭐'.repeat(n) + '☆'.repeat(3 - n);
  function doCheck() {
    if (S.phase !== 'work' || S.watching) return;
    const p = P(), t = Tool(), r = t.check(p, S.st);
    // 1.6.0: nothing in the answer yet. A step box with digits in it that is not done is checked instead (a wrong one
    // says so); "Nothing is there yet" only when nothing is anywhere, and that is not a try.
    if (!r.ok && r.hint && r.hint.k === 'fbEmpty') {
      const steps = stepList(p), k = steps.findIndex((s, i) => s.ans !== undefined && !S.stepDone[i] && S.stepVal[i] !== null);
      if (k >= 0 && S.stepBad !== k) return stepCheck(k);
      if (k < 0) {
        const f = document.createDocumentFragment(); f.append(h('b', {}, T('fbEmpty')), ' ', T(p.tool.startsWith('digits.') ? 'fbEmptyHow' : 'tryAgain'));
        feedback('try', f);
      }
      return;
    }
    S.tries++;
    if (r.ok) {
      const n = starsNow();
      S.right++; S.phase = 'done'; S.lastOk = true; S.stars[S.i] = n; S.badCol = null; sfx(n === 3 ? 'powerup' : 'coin');
      const cheer = TH && TH.cheers.length ? TH.cheers[S.i % TH.cheers.length] : '';
      const f = document.createDocumentFragment(); f.append(h('b', {}, T('right')), ' ', h('span', { class: 'oc-starrow', role: 'img', 'aria-label': T('starsN', { n }) }, starText(n)), cheer ? ` ${cheer}` : '');
      feedback('good', f);
      call(() => { if (!reduced() && B().fx && B().fx.pop) B().fx.pop(el.work); });
    } else if (S.tries < 2) {
      S.stuck = true; S.wrongMoves = 0; S.notYet++; S.miss++; S.hintN = 0;
      if (Number.isInteger(r.col)) { S.focus = r.col; S.badCol = r.col; }
      const f = document.createDocumentFragment(); f.append(h('b', {}, T('notYet')), ' ', r.hint ? rich(r.hint.k, r.hint.v) : '', ' ', T('tryAgain'));
      feedback('try', f);
    } else {
      S.wrong++; S.notYet++; S.phase = 'done'; S.lastOk = false; S.stars[S.i] = 0; S.badCol = null; reveal(p);
      feedback('shown', rich('shown'));
    }
    save({ i: S.phase === 'done' ? S.i + 1 : S.i });
    paint();
    el.check.focus({ preventScroll: true });
  }
  /** The worked answer on screen: the manipulative solved, every step box filled, and a figure's own work lines. */
  function reveal(p) {
    S.st = Tool().solve(p) || S.st; S.revealed = true;
    stepList(p).forEach((s, i) => { if (s.ans !== undefined) S.stepVal[i] = s.ans; S.stepDone[i] = true; });
  }
  // ---- 1.3.0: the teacher's controls (teach.js). None of them reaches the server.
  /** Show answer: the worked answer of the problem on screen. Unanswered, it counts neither right nor wrong. */
  function showAnswer() {
    if (!TC) return;
    const p = P(); if (!p) return;
    if (S.phase === 'work') {
      S.watching = false; S.phase = 'done'; S.lastOk = false; S.byTeacher = true;
      if (!S.shown.includes(S.i)) S.shown.push(S.i);
      reveal(p);
      const f = document.createDocumentFragment(); f.append(h('span', { 'aria-hidden': 'true' }, '👀 '), T('shownByTeacher'));
      feedback('shown oc-tans', f);
      save({ i: S.i + 1 });
    } else S.revealed = true;
    paint();
  }
  /** Board mode: big type, Back / n of N / Next, no ✓ ✗ and no keypad; a set run on the board sends no score. */
  function setBoard(on) {
    if (!TC) return;
    S.boardOn = !!on; if (S.boardOn) S.boardUsed = true;
    document.documentElement.classList.toggle('oc-boardon', S.boardOn);
    shell.classList.toggle('oc-boardmode', S.boardOn);
    el.boardChip.hidden = !S.boardOn; el.nav.hidden = !S.boardOn;
    if (S.boardOn) keypad(false);
    TC.close(); paint();
  }
  /** Board mode's Back and Next: the teacher moves through the set (nothing is counted on the board). */
  function boardGo(d) {
    if (!S.boardOn || !el.end.hidden) return;
    const to = S.i + d;
    if (to < 0) return;
    if (to >= S.set.length) return finish();
    S.i = to; save(); begin();
  }
  function next() {
    if (S.i + 1 >= S.set.length) return finish();
    S.i++; save(); begin(); el.task.scrollIntoView && call(() => el.task.scrollIntoView({ block: 'nearest' }));
    el.check.focus({ preventScroll: true });
  }
  function finish() {
    const total = S.set.length;
    save({ i: total, done: true });
    // 1.3.0: a problem the teacher showed is not counted (won: every other one right), and the result says so (helped);
    // a set run in board mode sends nothing, like config.board
    const shown = S.shown.filter(i => i < total).length;
    if (!board && !S.boardUsed && !S.reported) { S.reported = true; call(() => B().gameOver && B().gameOver({ won: S.right === total - shown && total > shown, score: S.right, ...(shown ? { helped: true } : {}) })); }
    sfx('win'); call(() => { if (S.right && !reduced() && B().fx && B().fx.confetti) B().fx.confetti(); });
    el.main.hidden = true; card.hidden = true; band.hidden = true;
    el.end.hidden = false; el.end.textContent = '';
    // 1.6.0: the stars earned (3 a problem; a problem the teacher showed is left out), one row of them, and the theme
    const counted = Array.from({ length: total }, (_, i) => i).filter(i => !S.shown.includes(i)), got = counted.reduce((a, i) => a + (S.stars[i] || 0), 0);
    el.end.append(TH && TH.icon ? h('div', { class: 'oc-endicon', 'aria-hidden': 'true' }, TH.icon) : null,
      h('h2', { id: 'oc-end-h' }, T('endH', { right: S.right, total })),
      counted.length ? h('p', { class: 'oc-endstars' }, h('span', { class: 'oc-starrow', 'aria-hidden': 'true' }, counted.map(i => starText(S.stars[i] || 0)).join(' ')), h('b', {}, T('endStars', { n: got, total: counted.length * 3 }))) : null,
      h('p', {}, TH && TH.end ? TH.end : T(S.right === total ? 'endAll' : 'endSome')),
      h('div', { class: 'oc-btns oc-endbtns' },
        h('button', { type: 'button', class: 'oc-btn oc-primary', onclick: () => again() }, A.gen ? `🎲 ${T('newSet')}` : `↻ ${T('again')}`),
        printable ? h('button', { type: 'button', class: 'oc-btn', onclick: () => printPanel(true) }, `🖨 ${T('print')}`) : null,
        B().back ? h('button', { type: 'button', class: 'oc-btn', onclick: () => call(() => B().back()) }, arrow(dir === 'rtl' ? '→' : '←'), ` ${T('back')}`) : null));   // (1.4.1: points back in Hebrew and Arabic too)
    el.left.textContent = T('toGo', { n: 0 });
    el.end.querySelector('button').focus({ preventScroll: true });
  }
  function again(newSheet) {
    if (A.gen) S.seed = (S.seed * 48271 + 11) % 2147483647 || 7;
    if (newSheet === true) S.seen = [];   // "New sheet" (1.2.0): a fresh set from the generator, on screen
    if (newSheet === true && S.ws && !S.ws.link) { S.ws = null; paintWs(); }   // (1.4.0) New set leaves a worksheet opened here
    dealSet(false); save();
    el.main.hidden = false; card.hidden = false; band.hidden = false; el.end.hidden = true;
    begin();
  }
  // ---- printing (1.2.0): a sheet of N questions from a seed (its number, printed on the sheet, makes it again), on A4
  // or US Letter, with the answer key on a page of its own when the viewer may print it. The page and the server make
  // the printable page from the activity's own data (sheet.js); the frame only asks.
  const maxQ = A.gen && TOOLS[A.gen.tool] ? MAX_PROBLEMS : Math.max(1, deal(A, { count: MAX_PROBLEMS }).length);
  const PR = { open: false, n: Math.min(maxQ, Number.isInteger(cfg.count) ? cfg.count : 5), paper: /^en$|^en-US/.test(lang) ? 'letter' : 'a4', key: false, seed: 0, busy: false, msg: '' };
  function printPanel(on) {
    PR.open = !!on; el.print.hidden = !PR.open; if (el.printBtn) el.printBtn.setAttribute('aria-expanded', String(PR.open));
    if (PR.open) { if (!PR.seed) PR.seed = (S.seed % 999999) || 1; PR.msg = ''; paintPrint(); call(() => el.print.querySelector('h2').focus()); } else { if (S.sel === 'seed') S.sel = null; call(() => el.printBtn && el.printBtn.focus()); }
  }
  function paintPrint() {
    const canKey = B().canPrintKey === true, seedSel = S.sel === 'seed';
    const tog = (on, label, fn) => h('button', { type: 'button', class: 'oc-btn oc-sm oc-tog', 'aria-pressed': String(on), onclick: fn }, label);
    el.print.textContent = '';
    // 1.4.0: a worksheet on screen prints its own questions, with its class code on the sheet
    if (S.ws) {
      el.print.append(
        h('div', { class: 'oc-ptop' }, h('h2', { id: 'oc-print-h', tabindex: '-1' }, '🖨 ', T('printH')), h('button', { type: 'button', class: 'oc-btn oc-sm', 'aria-label': T('close'), onclick: () => printPanel(false) }, '✕')),
        h('p', { class: 'oc-psmall' }, T('wsPrints', { code: S.ws.code, n: S.set.length })),
        h('div', { class: 'oc-prow' }, h('span', { class: 'oc-plab', id: 'oc-pp' }, T('paper')),
          h('span', { class: 'oc-pseg', role: 'group', 'aria-labelledby': 'oc-pp' }, tog(PR.paper === 'a4', T('a4'), () => { PR.paper = 'a4'; paintPrint(); }), tog(PR.paper === 'letter', T('letter'), () => { PR.paper = 'letter'; paintPrint(); }))),
        canKey ? h('div', { class: 'oc-prow' }, tog(PR.key, `🔑 ${T('keyAdd')}`, () => { PR.key = !PR.key; paintPrint(); })) : null,
        h('div', { class: 'oc-prow' }, h('button', { type: 'button', class: 'oc-btn oc-primary', disabled: PR.busy, onclick: doPrint }, '🖨 ', T('printGo')), h('span', { class: 'oc-pmsg', role: 'status' }, PR.msg)));
      return;
    }
    el.print.append(
      h('div', { class: 'oc-ptop' }, h('h2', { id: 'oc-print-h', tabindex: '-1' }, '🖨 ', T('printH')), h('button', { type: 'button', class: 'oc-btn oc-sm', 'aria-label': T('close'), onclick: () => printPanel(false) }, '✕')),
      h('div', { class: 'oc-prow' }, h('span', { class: 'oc-plab', id: 'oc-pn' }, T('printCount')),
        h('span', { class: 'oc-pstep', role: 'group', 'aria-labelledby': 'oc-pn' },
          h('button', { type: 'button', class: 'oc-btn oc-sm', 'aria-label': T('fewer'), disabled: PR.n <= 1, onclick: () => { PR.n = Math.max(1, PR.n - 1); paintPrint(); } }, '−'),
          h('b', { class: 'oc-pnum', 'aria-live': 'polite' }, String(PR.n)),
          h('button', { type: 'button', class: 'oc-btn oc-sm', 'aria-label': T('more'), disabled: PR.n >= maxQ, onclick: () => { PR.n = Math.min(maxQ, PR.n + 1); paintPrint(); } }, '+'))),
      h('div', { class: 'oc-prow' }, h('span', { class: 'oc-plab', id: 'oc-pp' }, T('paper')),
        h('span', { class: 'oc-pseg', role: 'group', 'aria-labelledby': 'oc-pp' }, tog(PR.paper === 'a4', T('a4'), () => { PR.paper = 'a4'; paintPrint(); }), tog(PR.paper === 'letter', T('letter'), () => { PR.paper = 'letter'; paintPrint(); }))),
      canKey ? h('div', { class: 'oc-prow' }, tog(PR.key, `🔑 ${T('keyAdd')}`, () => { PR.key = !PR.key; paintPrint(); })) : null,
      h('div', { class: 'oc-prow' }, h('span', { class: 'oc-plab', id: 'oc-ps' }, T('sheetNoH')),
        h('button', { type: 'button', class: `oc-box oc-seed${seedSel ? ' oc-sel' : ''}`, dir: 'ltr', 'aria-labelledby': 'oc-ps', 'aria-pressed': String(seedSel), onclick: () => { S.sel = seedSel ? null : 'seed'; PR.retype = !seedSel; if (!seedSel && coarse()) keypad(true); paintPrint(); } }, String(PR.seed || '')),
        A.gen ? h('button', { type: 'button', class: 'oc-btn oc-sm', onclick: () => { PR.seed = 1 + Math.floor(Math.random() * 999998); paintPrint(); } }, '🎲 ', T('newSheet')) : null),
      h('p', { class: 'oc-psmall' }, T('sheetType')),
      h('div', { class: 'oc-prow' }, h('button', { type: 'button', class: 'oc-btn oc-primary', disabled: PR.busy || !PR.seed, onclick: doPrint }, '🖨 ', T('printGo')), h('span', { class: 'oc-pmsg', role: 'status' }, PR.msg)));
  }
  function doPrint() {
    if (PR.busy || (!PR.seed && !S.ws)) return;
    PR.busy = true; PR.msg = T('printBusy'); paintPrint();
    const which = S.ws ? { set: S.ws.id, n: Math.max(1, Math.min(MAX_PROBLEMS, S.set.length)) } : { seed: PR.seed, n: PR.n };
    let r = null; try { r = B().print({ k: 'canvas', ...which, paper: PR.paper, key: PR.key && B().canPrintKey === true }); } catch (e) { r = null; }
    Promise.resolve(r).then(x => {
      PR.busy = false;
      PR.msg = x && x.ok ? T('printOk') : T(x && x.error === 'tap' ? 'printTap' : x && x.error === 'key' ? 'keyTeacher' : x && x.error === 'notAllowed' ? 'printNo' : 'printErr');
      paintPrint();
    });
  }
  // ---- 1.4.0: worksheets
  /** A worksheet from My worksheets on this screen: its questions in their order (a new set or New sheet leaves it). */
  function openWorksheet(set) {
    if (!set || !Array.isArray(set.items) || !set.items.length) return;
    S.ws = { id: set.id, code: set.code || wsCode(set.id), title: set.title || set.label || '', items: JSON.parse(JSON.stringify(set.items)) };
    if (PR.open) printPanel(false);
    dealSet(false);
    if (!S.set.length) { S.ws = null; dealSet(false); }
    el.main.hidden = false; card.hidden = false; band.hidden = false; el.end.hidden = true;
    paintWs(); begin();
  }
  function wsPanel(on) {
    if (!WS) return;
    if (on && PR.open) printPanel(false);
    WS.show(on);
    if (TC.setsButton) TC.setsButton.setAttribute('aria-expanded', String(!!on));
  }
  /** The line under the teacher's controls: the worksheet on screen (teachers), or a link whose worksheet is gone. */
  function paintWs() {
    el.wsNote.textContent = '';
    if (S.ws && teach) el.wsNote.append(h('span', { 'aria-hidden': 'true' }, '📄 '), T('wsOnScreen', { title: S.ws.title || T('wsUntitled') }), ' ', h('span', { class: 'oc-wsc', dir: 'ltr' }, S.ws.code));
    else if (qsMissing) el.wsNote.append(T('wsMissing'));
    el.wsNote.hidden = !el.wsNote.textContent;
    if (WS) WS.paint();
  }
  function keypad(on) { S.keys = !!on; el.keys.hidden = !S.keys; el.keyBtn.setAttribute('aria-pressed', String(S.keys)); }
  const coarse = () => typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;

  // ---- keys: digits and Backspace for the selected box; Enter checks
  addEventListener('keydown', e => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (/^[0-9]$/.test(e.key) && S.sel) { e.preventDefault(); typeDigit(+e.key); }
    else if ((e.key === '.' || e.key === ',') && S.sel === 'fig') { e.preventDefault(); typeDigit('.'); }
    else if (e.key === 'Escape' && PR.open) { printPanel(false); }
    else if (e.key === 'Backspace' && S.sel) { e.preventDefault(); typeDigit(null); }
  });
  // "Stuck?" lights up after 45 s without a move, the same as the Big Divide
  setInterval(() => { if (S.phase === 'work' && !S.watching && !S.stuck && Date.now() - S.idle > IDLE_MS) { S.stuck = true; paint(); } }, 5000);

  dealSet(true);
  paintWs();
  if (!S.set.length) { el.work.append(h('p', {}, T('fbEmpty'))); return { selfTest: () => selfTest(A, WORDS.en) }; }
  if (saved && saved.done) { S.i = 0; }
  begin(saved && !saved.done && saved.i === S.i ? saved.st : null);
  if (support === 'own') S.stepsOpen = false, paintSteps();
  const api = {
    version: VERSION, selfTest: () => selfTest(A, WORDS.en),
    state: () => ({ screen: el.end.hidden ? 'work' : 'end', problem: S.i + 1, problems: S.set.length, right: S.right, wrong: S.wrong, notYet: S.notYet, stars: S.stars.reduce((a, x) => a + (x || 0), 0), tool: P() && P().tool, phase: S.phase, score: S.right, controls: 'none', support, supports: modes || [support], purpose, seed: S.seed, worksheet: S.ws ? S.ws.id : null }),
    /** The printable sheet for a seed (sheet.js), as data: what the page prints for this activity. */
    sheet: (seed, n) => sheet(A, { seed, n, lang }),
  };
  // 1.6.0: giveUp() is the platform's way through a set without knowing its answers (the layout check of the end card:
  // services/layout-check.js canvasToEnd): the worked answer of the problem on screen, as after a second wrong Check
  // (no stars, not right). An empty Check is no longer a try, so pressing Check twice no longer does it.
  const giveUp = () => { if (S.phase !== 'work' || !el.end.hidden) return false; if (S.watching) { S.watching = false; } S.tries = 2; S.wrong++; S.notYet++; S.phase = 'done'; S.lastOk = false; S.stars[S.i] = 0; reveal(P()); feedback('shown', rich('shown')); save({ i: S.i + 1 }); paint(); return true; };
  call(() => { window.__brbTest = { state: api.state, start() {}, giveUp }; });
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
    const bar = h('div', { class: 'oc-bar oc-tall', role: 'group', 'aria-label': c.T('workspace'), 'data-oc-dense': '' }, ...Array.from({ length: p.d }, (_, i) => tapped(h('button', { type: 'button', class: `oc-part${on.has(i) ? ' oc-on oc-c1' : ''}`, style: `width:${pct(1 / p.d)}`, 'aria-pressed': String(on.has(i)), 'aria-label': `${i + 1}/${p.d}`, disabled: c.locked }), () => { const n = new Set(on); n.has(i) ? n.delete(i) : n.add(i); c.set({ on: [...n] }); })));
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
/** A figure question (1.2.0): the figure (Oomba Figures, when its pinned tag is on the page), then the answer: a box
 *  the kit's keypad and the digit keys type into (figure.number), or 2 to 4 answers to tap (figure.choice). */
function figPic(p, c) {
  if (!p.fig) return null;
  const OF = typeof globalThis !== 'undefined' ? globalThis.OombaFigures : null;
  if (!OF || typeof OF.draw !== 'function') { call(() => console.warn('[oomba] figure: add the pinned Oomba Figures tag (docs/figures-api.md)')); return h('p', { class: 'oc-figmiss' }, c.T('figMissing')); }
  let el = null; const { kind, hide, ...data } = p.fig;
  try { el = OF.draw(kind, { kind, ...data }, { lang: c.lang, title: p.q, hide: hide || false }); } catch (e) { el = null; }
  return h('div', { class: 'oc-fig' }, el || h('p', { class: 'oc-figmiss' }, c.T('figMissing')));
}
VIEWS['figure.number'] = (p, st, c) => {
  const on = c.sel === 'fig', typed = typeof st.typed === 'string' ? st.typed : '';
  return h('div', { class: 'oc-stack oc-figq' }, figPic(p, c),
    h('div', { class: 'oc-figans', dir: 'ltr' }, tapped(h('button', { type: 'button', class: `oc-box oc-figbox${on ? ' oc-sel' : ''}`, 'aria-pressed': String(on), 'aria-label': c.T('box'), disabled: c.locked }, typed), () => { if (!on) c.select('fig'); }),
      p.unit ? h('span', { class: 'oc-unit', dir: 'auto' }, p.unit) : null));
};
VIEWS['figure.choice'] = (p, st, c) => h('div', { class: 'oc-stack oc-figq' }, figPic(p, c),
  h('div', { class: 'oc-choices', role: 'group', 'aria-label': c.T('figPickQ') }, ...p.choices.map((t, i) => tapped(h('button', { type: 'button', class: 'oc-btn oc-choice', 'aria-pressed': String(st.pick === i), disabled: c.locked, dir: 'auto' }, h('b', { 'aria-hidden': 'true' }, `${String.fromCharCode(65 + i)}`), ' ', t), () => c.set({ pick: i })))));
function lineView(p, st, c, from) {
  const lo = p.lo * p.sub, hi = p.hi * p.sub, n = hi - lo, R = v => { const r = Array.isArray(v) ? { n: v[0], d: v[1] } : { n: v, d: 1 }; return (r.n * p.sub) / r.d; };
  const ticks = [];
  for (let t = lo; t <= hi; t++) {
    const whole = t % p.sub === 0, on = st.tick === t, start = from !== null && R(from) === t;
    ticks.push(tapped(h('button', { type: 'button', class: `oc-tick${whole ? ' oc-whole' : ''}${on ? ' oc-on' : ''}${start ? ' oc-start' : ''}`, style: `left:${pct((t - lo) / n)}`, 'aria-pressed': String(on), disabled: c.locked,
      'aria-label': whole ? String(t / p.sub) : `${t - Math.floor(t / p.sub) * p.sub}/${p.sub} + ${Math.floor(t / p.sub)}` }, h('i', { 'aria-hidden': 'true' }), whole ? h('span', { class: 'oc-tlab' }, String(t / p.sub)) : null), () => c.set({ tick: t })));
  }
  // (1.4.1: each tick is as wide as its share of the line, at most 44 px, so a tap anywhere on the line lands on the
  // nearest tick and neighbours never overlap; data-oc-dense tells the Builder's layout check they are small by design)
  return h('div', { class: 'oc-stack', dir: 'ltr' }, h('div', { class: 'oc-line', style: `--oc-gap:${(100 / n).toFixed(3)}%`, 'data-oc-dense': '' }, h('div', { class: 'oc-axis', 'aria-hidden': 'true' }), ...ticks));
}
function colView(p, st, c, sign) {
  const ans = st.ans || [], cols = ans.length, A = String(p.a).split('').reverse(), Bd = String(p.b).split('').reverse();
  const cell = (txt, cls = '') => h('span', { class: `oc-cell ${cls}` }, txt === undefined ? '' : txt);
  const rowOf = (digits, lead) => h('div', { class: 'oc-crow' }, cell(lead, 'oc-sign'), ...Array.from({ length: cols }, (_, k) => cell(digits[cols - 1 - k])));
  // 1.6.0: tapping the box already chosen keeps it chosen (it used to let go of it, so after the kit moved on to the
  // Tens box by itself, tapping that box and typing lost the digit); a box a Check found wrong is marked
  const boxes = h('div', { class: 'oc-crow oc-answer' }, cell(''), ...Array.from({ length: cols }, (_, k) => {
    const i = cols - 1 - k, on = c.sel === `col:${i}`, bad = c.bad === i;
    return tapped(h('button', { type: 'button', class: `oc-cell oc-dbox${on ? ' oc-sel' : ''}${bad ? ' oc-bad' : ''}`, 'data-col': i, 'aria-pressed': String(on), 'aria-label': `${c.T('box')}: ${c.T(['ones', 'tens', 'hundreds', 'thousands', 'tenThousands'][i] || 'ones')}${bad ? `: ${c.T('notYet')}` : ''}`, disabled: c.locked }, ans[i] === null || ans[i] === undefined ? '' : String(ans[i])), () => { if (!on) c.select(`col:${i}`); });
  }));
  // the carried digits, small over their columns (only once a step has carried them)
  const carry = c.carry && Object.keys(c.carry).length ? h('div', { class: 'oc-crow oc-carry', 'aria-hidden': 'true' }, cell(''), ...Array.from({ length: cols }, (_, k) => cell(c.carry[cols - 1 - k] === undefined ? '' : String(c.carry[cols - 1 - k]), 'oc-cc'))) : null;
  return h('div', { class: 'oc-stack oc-cols', dir: 'ltr' }, h('div', { class: 'oc-paper' }, carry, rowOf(A, ''), rowOf(Bd, sign), h('div', { class: 'oc-rule', 'aria-hidden': 'true' }), boxes));
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

export { TOOLS, deal, selfTest, seeded, manipulativeOf, cleanProblem, WORDS, VERSION, MAX_COUNT, sheet, numText };
