// Classroom dashboards, stage 3: teaching tools, the whiteboard and the Picture widget (docs/decisions.md "Classroom
// dashboards, stage 3"). Each renderer gets the widget's body, its settings and ctx (public/js/dash-widgets.js says what
// ctx holds), plus for the tools:
//   ctx.common      the words every tool shares (Send to students, Options...)
//   ctx.keep(state) keep the tool's state: the teacher's layout or a student's own screen saves it; a student's copy of a
//                   sent tool keeps it in this browser only
//   ctx.send(state) the teacher sends the tool to every student screen (each student gets their own copy)
//   ctx.copy        this is a student's copy of a tool the teacher sent (nothing is saved unless they pin it)
//   ctx.upload(file) the Picture widget's upload (the stage 1 picture checks; the class's teacher only)
// The maths is in public/js/dash-math.js (pure, tested). Everything is drawn with SVG or HTML from code: no libraries,
// no network but the app's own, no AI. Whiteboard drawings live in this page's memory only: never stored, never sent.
import * as M from './dash-math.js';
import { questionFor } from './dash-ask.js';
import { tip } from './dash-tip.js';

const SVGNS = 'http://www.w3.org/2000/svg';
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const svg = (tag, attrs = {}, text) => { const e = document.createElementNS(SVGNS, tag); for (const [k, v] of Object.entries(attrs)) if (v != null) e.setAttribute(k, v); if (text != null) e.textContent = text; return e; };
const btn = (label, cls = 'btn btn-sm', aria) => { const b = el('button', cls, label); b.type = 'button'; if (aria) { b.setAttribute('aria-label', aria); b.title = aria; } return b; };
const fill = (s, vars = {}) => String(s || '').replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
const clone = x => JSON.parse(JSON.stringify(x));
/** Math reads left to right in every language: numbers, fractions and equations keep their order on a Hebrew page. */
const ltr = (tag, cls, text) => { const e = el(tag, cls, text); e.dir = 'ltr'; return e; };
/** A pointer's place in an SVG's own units (whatever its size and letterboxing). */
const svgPoint = (sv, e) => { const m = sv.getScreenCTM(); if (!m) return { x: 0, y: 0 }; const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse()); return { x: p.x, y: p.y }; };
const svgText = text => String(text).replace(/-/g, '−');
const isEn = intl => /^en\b/i.test(intl || 'en');
/** Numbers, fractions and signs put into a sentence keep their own left-to-right order (an Arabic sentence with "6/8, 5/8"). */
const iso = v => `\u2066${v}\u2069`;

/** "3 of 8 parts shaded, three eighths" (the words in English; other languages read the numbers). */
export function shadedWords(n, d, words, intl) {
  const base = fill(words.shadedOf, { n, d });
  return isEn(intl) ? `${base}, ${M.fractionWords(n, d)}` : base;
}
/** A decimal for screen readers: "0.333…" -> "0.333 repeating". */
const spoken = (s, rep) => String(s).replace('…', ` ${rep}`);

/** The parts every tool shares: the state (the widget's own, or the type's starting state), a row of mode buttons on top,
 *  the model, a readout, and a row of buttons below ending with Options and Send to students (the one primary button). */
function shell(body, s, ctx, id) {
  const W = ctx.type.words, C = ctx.common || {};
  const def = ((ctx.type.settings || []).find(f => f.key === 'state') || {}).def || {};
  const st = { ...clone(def), ...clone(s.state || {}) };
  body.classList.add('dt', `dt-${id}`);
  if (ctx.editing) body.classList.add('is-static');
  const top = el('div', 'dt-top dw-row'), stage = el('div', 'dt-stage'), read = el('div', 'dt-read'), foot = el('div', 'dt-foot dw-row');
  read.setAttribute('aria-live', 'polite');
  // The one-line instruction under the title (a maths tool's `howto`; T.howto changes it, e.g. for a mode).
  const howRow = el('div', 'dt-howrow'), how = el('p', 'dt-howto'); how.dir = 'auto'; howRow.appendChild(how);
  const setHow = text => { how.textContent = text || ''; howRow.hidden = !text && !howRow.querySelector('.dt-info'); };
  setHow(W.howto);
  body.append(howRow, top, stage, read, foot);
  // Drawn again when the model's area changes size, so labels stay readable (see T.ts).
  let lw = 0, lh = 0, raf = 0;
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => {
    const w = stage.clientWidth, h = stage.clientHeight;
    if (Math.abs(w - lw) > 2 || Math.abs(h - lh) > 2) { const first = !lw && !lh; lw = w; lh = h; if (!first || T.sized) { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => T.draw()); } }
  }) : null;
  if (ro) ro.observe(stage);
  const T = {
    W, C, st, top, stage, read, foot, draw: () => {}, sized: true, howto: setHow,
    /** Stage 4: a quick check made from what the tool shows now, or null. */
    question: () => questionFor(id, st, W, ctx.askWords || {}, ctx.intl),
    /** How much to grow an SVG's text so it is at least min px on screen: the model's viewBox is vbW x vbH user units and
     *  its text is base units. -> a factor >= 1 (CSS --ts). */
    /** Screen pixels per SVG unit for a viewBox of vbW x vbH drawn in the model's area (0 before it has a size). */
    scale(vbW, vbH) { const w = stage.clientWidth, h = stage.clientHeight; return matchMedia('(max-width: 719px)').matches || !h ? w / vbW : Math.min(w / vbW, h / vbH); },
    /** The smallest text, in screen pixels: 14 (16 on the projector). */
    minPx: () => (document.body.classList.contains('dash-projector') ? 16 : 14),
    ts(vbW, vbH, base = 20, min = 13) {
      const k = T.scale(vbW, vbH);
      // On the projector the text is read from the back of the room: a bigger floor.
      const floor = document.body.classList.contains('dash-projector') ? min * 1.35 : min;
      return k > 0 ? Math.max(1, floor / (base * k)) : 1;
    },
    /** Changed: redraw, keep, and say what changed. */
    commit(msg) { T.draw(); if (!ctx.editing && ctx.keep) ctx.keep(clone(st)); if (msg) ctx.say(msg); },
    /** A group of buttons where one is on (aria-pressed). */
    seg(label, options, get, set) {
      const g = el('div', 'dt-seg'); g.setAttribute('role', 'group'); g.setAttribute('aria-label', label);
      const bs = options.map(([v, text, aria, icon]) => {
        const b = btn(icon ? '' : text, 'btn btn-sm', aria);
        // An icon and its words; on a narrow widget only the icon shows (the button keeps its name).
        if (icon) { const i = el('span', 'dt-ic', icon); i.setAttribute('aria-hidden', 'true'); const l = el('span', 'dt-lbl', text); l.setAttribute('aria-hidden', 'true'); b.append(i, l); b.setAttribute('aria-label', text); tip(b, text); }
        b.addEventListener('click', () => set(v)); g.appendChild(b); return [v, b];
      });
      g.sync = () => { for (const [v, b] of bs) b.setAttribute('aria-pressed', String(get() === v)); };
      g.sync();
      return g;
    },
    /** − value + with a label; the value is announced. */
    stepper(label, get, dec, inc, decAria, incAria) {
      const g = el('div', 'dt-step'); g.setAttribute('role', 'group'); g.setAttribute('aria-label', label);
      const lab = el('span', 'dt-steplab', label); lab.setAttribute('aria-hidden', 'true');
      const minus = btn('−', 'btn btn-sm dt-pm', decAria), plus = btn('+', 'btn btn-sm dt-pm', incAria);
      const val = ltr('b', 'dt-stepval');
      minus.addEventListener('click', dec); plus.addEventListener('click', inc);
      g.append(lab, minus, val, plus);
      g.sync = () => { val.textContent = String(get()); };
      g.sync();
      return g;
    },
    toggle(text, aria, get, set) {
      const b = btn(text, 'btn btn-sm', aria);
      b.addEventListener('click', () => set(!get()));
      b.sync = () => b.setAttribute('aria-pressed', String(!!get()));
      b.sync();
      return b;
    },
    /** Options in a sheet (built by fn into the sheet's body); Send to students for the class's teacher. */
    finish({ options } = {}) {
      if (options && !ctx.editing) {
        const ob = btn(`⚙️ ${C.options}`, 'btn btn-sm dt-opt', fill(C.optionsFor, { name: ctx.type.name }));
        ob.addEventListener('click', () => {
          const sh = ctx.sheet({ title: fill(C.optionsFor, { name: ctx.type.name }), content: '' });
          const box = el('div', 'stack dt-opts'); sh.el.querySelector('.sheet-body').appendChild(box);
          options(box, sh);
          box.querySelector('input,select,button')?.focus();
        });
        foot.appendChild(ob);
      }
      // Stage 4: "Practice it" (official games every student can open; nothing when there is no clean match) and "Make a
      // question from it" (the teacher's own screen: what the tool shows now, as a multiple-choice quick check).
      let ask = null;
      const games = ctx.editing ? [] : (ctx.practice || []).slice(0, 2);
      if (games.length) {
        // One game: a link straight to it. Two: a short list to pick from.
        const one = games.length === 1, a = el(one ? 'a' : 'button', 'btn btn-sm dt-practice');
        const name = one ? fill(C.practiceName, { title: games[0].title }) : C.practice;
        if (one) a.href = games[0].href; else a.type = 'button';
        a.setAttribute('aria-label', name); tip(a, name);
        const i = el('span', 'dt-ic', '🎮'), l = el('span', 'dt-lbl', C.practice); i.setAttribute('aria-hidden', 'true'); l.setAttribute('aria-hidden', 'true');
        a.append(i, l);
        if (!one) a.addEventListener('click', () => {
          const sh = ctx.sheet({ title: C.practice, content: '' });
          const ul = el('ul', 'plain stack dt-practicelist'); sh.el.querySelector('.sheet-body').appendChild(ul);
          for (const g of games) { const li = el('li'), link = el('a', 'btn dt-practicego'); link.href = g.href; const t = el('span', null, g.title); t.dir = 'auto'; link.append(el('span', 'dt-ic', g.icon || '🎮'), t); li.appendChild(link); ul.appendChild(li); }
          ul.querySelector('a')?.focus();
        });
        foot.appendChild(a);
      }
      if (ctx.teacher && !ctx.copy && !ctx.editing && ctx.ask) {
        ask = tip(btn('', 'btn btn-sm dt-ask', C.ask), C.ask);
        const i = el('span', 'dt-ic', '❓'), l = el('span', 'dt-lbl', C.ask); i.setAttribute('aria-hidden', 'true'); l.setAttribute('aria-hidden', 'true');
        ask.append(i, l);
        ask.addEventListener('click', () => askSheet(ctx, T.question()));
        foot.appendChild(ask);
      }
      if (ctx.teacher && !ctx.copy && !ctx.editing && ctx.send && ctx.type.send) {
        const sb = btn(`📤 ${C.send}`, 'btn btn-sm btn-primary dt-send');
        sb.addEventListener('click', async () => { sb.disabled = true; try { await ctx.send(clone(st)); } finally { sb.disabled = false; } });
        foot.appendChild(sb);
      }
      if (ctx.copy) foot.appendChild(el('p', 'small muted dt-copynote', C.copyNote));
      if (ask) { const d = T.draw; T.draw = () => { d(); ask.hidden = !T.question(); }; }
      const help = W.helpUse && !ctx.editing ? helpButton(body, howRow, ctx) : null;
      setHow(how.textContent);
      T.draw();
      return { destroy() { if (ro) ro.disconnect(); cancelAnimationFrame(raf); if (help) help.destroy(); } };
    },
  };
  return T;
}
/** ⓘ in the widget's header (top right; on a student's copy in a sheet, at the end of the instruction row): a short panel
 *  inside the widget: the title ("How to use Fraction bars"), at most three short points (helpUse, one a line) and, for
 *  the teacher only, one "Try:" idea for class (helpIdeas). Nothing on Make a question, Send or Practice it: those
 *  buttons say what they do. Closed by ✕, Escape or a tap outside; the focus goes into it and back to the button.
 *  Hidden on the projector (public/css/dash.css). */
let helpIds = 0;
function helpButton(body, howRow, ctx) {
  const W = ctx.type.words, C = ctx.common || {}, name = ctx.type.name;
  const card = body.closest('.dash-w') || body.parentElement, head = card && card.querySelector(':scope > .dash-wh');
  const id = `dt-help${++helpIds}`, label = fill(C.helpFor, { name });
  const b = btn('', 'dt-info', label); b.setAttribute('aria-expanded', 'false'); b.setAttribute('aria-controls', id);
  const i = el('span', 'dt-infoi', 'i'); i.setAttribute('aria-hidden', 'true'); b.appendChild(i);
  const panel = el('div', 'dt-help'); panel.id = id; panel.hidden = true; panel.tabIndex = -1;
  panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-label', label);
  const top = el('div', 'dt-helphead'), h = el('h3', 'dt-helpt', label); h.dir = 'auto';
  const x = btn('✕', 'btn btn-sm dt-helpx', C.helpClose); top.append(h, x); panel.appendChild(top);
  const lines = text => String(text || '').split('\n').map(t => t.trim()).filter(Boolean);
  const ul = el('ul', 'dt-helpl');
  for (const t of lines(W.helpUse).slice(0, 3)) { const li = el('li', null, t); li.dir = 'auto'; ul.appendChild(li); }
  panel.appendChild(ul);
  const idea = ctx.copy || !ctx.teacher ? '' : lines(W.helpIdeas)[0];
  if (idea) {
    const p = el('p', 'dt-helptry'); p.dir = 'auto';
    p.append(el('b', 'dt-helptryl', C.helpTry), el('span', null, idea)); panel.appendChild(p);
  }
  (head || howRow).appendChild(b); card.appendChild(panel);
  if (!head) howRow.hidden = false;
  const outside = e => { if (!panel.contains(e.target) && !b.contains(e.target)) close(false); };
  function open() { panel.hidden = false; b.setAttribute('aria-expanded', 'true'); panel.focus(); document.addEventListener('pointerdown', outside, true); }
  function close(back = true) {
    if (panel.hidden) return;
    panel.hidden = true; b.setAttribute('aria-expanded', 'false'); document.removeEventListener('pointerdown', outside, true);
    if (back) b.focus();
  }
  b.addEventListener('click', e => { e.stopPropagation(); if (panel.hidden) open(); else close(); });
  x.addEventListener('click', () => close());
  panel.addEventListener('keydown', e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); } });
  return { destroy() { document.removeEventListener('pointerdown', outside, true); b.remove(); panel.remove(); } };
}
/** Stage 4: the teacher checks the question made from the tool (every word can be changed), sees which answer is right
 *  (only here: quick checks never mark answers on students' screens) and sends it as a stage 2 quick check. */
function askSheet(ctx, made) {
  if (!made) return;
  const C = ctx.common || {};
  const sh = ctx.sheet({ title: C.askTitle, content: '' });
  const f = el('form', 'stack dt-askform'); f.noValidate = true; sh.el.querySelector('.sheet-body').appendChild(f);
  f.appendChild(el('p', 'small muted', C.askNote));
  const q = field(f, C.askQ, Object.assign(el('input', 'input'), { maxLength: 120, value: made.q })); q.dir = 'auto';
  const list = el('ol', 'plain stack dt-askopts'); f.appendChild(list);
  const inputs = made.options.map((o, i) => {
    const li = el('li', `dt-askopt${i === made.answer ? ' is-right' : ''}`);
    const id = `dt-ao${Math.random().toString(36).slice(2, 8)}`;
    const lab = el('label', null, fill(C.askOpt, { n: String.fromCharCode(65 + i) })); lab.htmlFor = id;
    const inp = Object.assign(el('input', 'input'), { maxLength: 60, value: o, id }); inp.dir = 'auto';
    li.append(lab, inp);
    if (i === made.answer) { const r = el('span', 'dt-right', `✔ ${C.askRight}`); li.appendChild(r); inp.setAttribute('aria-describedby', `${id}r`); r.id = `${id}r`; }
    list.appendChild(li); return inp;
  });
  const err = el('p', 'err form-err'); err.setAttribute('role', 'alert'); f.appendChild(err);
  const row = el('div', 'row'), go = el('button', 'btn btn-primary', `📤 ${C.askSend}`); go.type = 'submit'; row.appendChild(go); f.appendChild(row);
  f.addEventListener('submit', async e => {
    e.preventDefault();
    const options = inputs.map(i => i.value.trim()).filter(Boolean);
    if (options.length < 2) { inputs[0].focus(); return; }
    go.disabled = true;
    const r = await ctx.ask({ question: q.value.trim(), options }, err);
    go.disabled = false;
    if (r) sh.close();
  });
  q.focus();
}
/** A labelled field for an Options sheet. */
function field(box, label, input) {
  const f = el('div', 'field'), id = `dt-f${Math.random().toString(36).slice(2, 8)}`;
  const l = el('label', null, label); l.htmlFor = id; input.id = id;
  f.append(l, input); box.appendChild(f); return input;
}
function selectOf(options, value) {
  const s = el('select', 'input');
  for (const [v, text] of options) { const o = el('option', null, text); o.value = String(v); if (String(v) === String(value)) o.selected = true; s.appendChild(o); }
  return s;
}
function numberIn(value, min, max) { const i = el('input', 'input'); Object.assign(i, { type: 'number', inputMode: 'numeric', min, max, value }); i.dir = 'ltr'; return i; }
function checkRow(box, label, value, on) {
  const row = el('div', 'dash-tog'), id = `dt-c${Math.random().toString(36).slice(2, 8)}`;
  const l = el('label', null, label); l.htmlFor = id;
  const i = el('input'); i.type = 'checkbox'; i.id = id; i.checked = !!value;
  i.addEventListener('change', () => on(i.checked));
  row.append(l, i); box.appendChild(row); return i;
}
/** Arrow keys on a roving grid of cells (one tab stop). cols: cells per row. */
function roving(container, cells, cols, onMove) {
  let at = Math.max(0, cells.findIndex(c => c.tabIndex === 0));
  cells.forEach((c, i) => { c.tabIndex = i === at ? 0 : -1; });
  container.addEventListener('keydown', e => {
    const i = cells.indexOf(document.activeElement); if (i < 0) return;
    const rtl = getComputedStyle(container).direction === 'rtl';
    const d = { ArrowRight: rtl ? -1 : 1, ArrowLeft: rtl ? 1 : -1, ArrowDown: cols, ArrowUp: -cols }[e.key];
    let j = i;
    if (d) j = i + d; else if (e.key === 'Home') j = i - (i % cols); else if (e.key === 'End') j = i - (i % cols) + cols - 1; else return;
    if (j < 0 || j >= cells.length) return;
    e.preventDefault();
    cells[i].tabIndex = -1; cells[j].tabIndex = 0; cells[j].focus(); at = j;
    if (onMove) onMove(j);
  });
}
/** A fraction stacked as on paper (aria: "3/4"). */
function stacked(n, d, cls = 'dt-frac') {
  const f = el('span', cls); f.dir = 'ltr'; f.setAttribute('role', 'img'); f.setAttribute('aria-label', `${n}/${d}`);
  const a = el('span', 'dt-fn', String(n)), line = el('span', 'dt-fl'), b = el('span', 'dt-fd', String(d));
  a.setAttribute('aria-hidden', 'true'); b.setAttribute('aria-hidden', 'true'); line.setAttribute('aria-hidden', 'true');
  f.append(a, line, b); return f;
}

// ================================================================ 1. fraction bars and circles
// Compare (one to three fractions, as in stage 3) and, since "help on the maths tools", Add, Subtract, Multiply and
// Divide two fractions (docs/decisions.md "Classroom dashboards: help on the maths tools"). The maths is M.operate (exact); a new
// operation is an entry in M.OPS plus its words and, if it needs one, its own picture (opModel).
const FCOLORS = 3;
const MODE_ICON = { compare: '⚖️', add: '➕', sub: '➖', mul: '✖️', div: '➗' };
const MODE_WORD = { compare: 'modeCompare', add: 'modeAdd', sub: 'modeSub', mul: 'modeMul', div: 'modeDiv' };
/** Pieces drawn in one strip at most (more would be slivers): past it the answer is drawn without same-size pieces. */
const MAX_PIECES = 96;
function fractions(body, s, ctx) {
  const T = shell(body, s, ctx, 'fractions'), { W, st } = T;
  const mode = () => (M.OPS[st.mode] ? st.mode : 'compare');
  const modes = T.seg(W.mode, M.FRACTION_MODES.map(m => [m, W[MODE_WORD[m]], null, MODE_ICON[m]]), mode, v => {
    st.mode = v; if (M.OPS[v]) { st.a = M.clampOperand(st.a || M.OP_START.a); st.b = M.clampOperand(st.b || M.OP_START.b); }
    zeroNote = v === 'div' && !st.b.n; if (zeroNote) st.b.n = 1;
    T.commit(M.OPS[v] ? `${W[MODE_WORD[v]]}: ${opSay()}` : W[MODE_WORD[v]]);
  });
  const shapes = T.seg(W.bar, [['bar', W.bar], ['circle', W.circle]], () => st.shape, v => { st.shape = v; T.commit(); });
  const same = T.toggle(`🧩 ${W.same}`, null, () => st.same, v => { st.same = v; T.commit(sameText()); });
  T.top.append(modes, shapes, same);
  const add = btn(`➕ ${W.add}`, 'btn btn-sm'), rm = btn(`➖ ${W.remove}`, 'btn btn-sm'), hide = T.toggle(`🙈 ${W.hide}`, null, () => st.hide, v => { st.hide = v; T.commit(v ? '' : opSay()); });
  const swap = btn(`⇄ ${W.swap}`, 'btn btn-sm dt-fswap');
  add.addEventListener('click', () => { if (st.bars.length < 3) { st.bars.push({ n: 1, d: st.bars[st.bars.length - 1]?.d || 4 }); T.commit(); T.stage.querySelectorAll('.dt-fshape')[st.bars.length - 1]?.focus(); } });
  rm.addEventListener('click', () => { if (st.bars.length > 1) { st.bars.pop(); T.commit(); } });
  swap.addEventListener('click', () => { [st.a, st.b] = [st.b, st.a]; T.commit(opSay()); });
  T.foot.append(add, rm, swap, hide);
  let zeroNote = false;   // Divide: the divisor's top number was kept at 1 (nothing is divided by zero); say why
  const cd = () => M.commonDenominator(st.bars);
  const sameText = () => {
    if (!st.same) return '';
    const c = cd();
    if (c.L > 48) return fill(W.tooSmall, { n: c.L });
    return fill(W.sameText, { n: c.L, list: c.list.map(f => iso(`${f.n}/${f.d}`)).join(', ') });
  };
  const say = i => { const b = st.bars[i]; ctx.say(shadedWords(b.n, b.d, W, ctx.intl)); };
  /** "1/2 + 1/3 = 5/6" (the answer left out while it is hidden). */
  const opSay = () => {
    if (!M.OPS[mode()]) return '';
    const r = M.operate(mode(), st.a, st.b);
    return iso(`${r.a.n}/${r.a.d} ${r.sign} ${r.b.n}/${r.b.d}${st.hide ? '' : ` = ${r.mixed}`}`);
  };
  T.draw = () => {
    const op = mode();
    modes.sync(); shapes.sync(); same.sync(); hide.sync();
    same.hidden = add.hidden = rm.hidden = op !== 'compare'; shapes.hidden = op === 'mul';
    T.howto(op === 'compare' ? W.howto : op === 'mul' ? W.howtoMul : op === 'div' ? W.howtoDiv : W.howtoOp);
    if (op === 'compare') { swap.hidden = true; compareView(); } else opView(op);
  };
  function compareView() {
    add.disabled = st.bars.length >= 3; rm.disabled = st.bars.length <= 1;
    const c = cd(), useL = st.same && c.L <= 48;
    T.stage.textContent = '';
    const wrap = el('div', `dt-fwrap dt-f-${st.shape}`); wrap.style.setProperty('--rows', st.bars.length); T.stage.appendChild(wrap);
    st.bars.forEach((b, i) => {
      const row = el('div', 'dt-frow');
      const lab = el('div', 'dt-flab'); lab.appendChild(stacked(b.n, b.d));
      if (useL && c.L !== b.d) { const eq = el('span', 'dt-feq'); eq.dir = 'ltr'; const sign = el('span', 'dt-eqsign', '='); sign.setAttribute('aria-hidden', 'true'); eq.append(sign, stacked(c.list[i].n, c.L)); lab.appendChild(eq); }
      const parts = useL ? c.L : b.d, shaded = useL ? c.list[i].n : b.n;
      const shape = st.shape === 'bar' ? barSvg(parts, shaded, i, useL ? c.L / b.d : 1) : pieSvg(parts, shaded, i, useL ? c.L / b.d : 1);
      shape.classList.add('dt-fshape');
      shape.setAttribute('role', 'slider'); shape.setAttribute('tabindex', ctx.editing ? '-1' : '0');
      shape.setAttribute('aria-valuemin', '0'); shape.setAttribute('aria-valuemax', String(b.d)); shape.setAttribute('aria-valuenow', String(b.n));
      shape.setAttribute('aria-valuetext', shadedWords(b.n, b.d, W, ctx.intl));
      shape.setAttribute('aria-label', fill(W.which, { n: i + 1 }));
      const setN = (n, keep = true) => { n = Math.max(0, Math.min(b.d, n)); if (n === b.n) return; b.n = n; T.commit(); if (keep) T.stage.querySelectorAll('.dt-fshape')[i]?.focus(); say(i); };
      shape.addEventListener('keydown', e => {
        // A bar is mirrored on a right-to-left page (it fills from the side next to its fraction).
        const rtl = st.shape === 'bar' && getComputedStyle(shape).direction === 'rtl';
        const k = { ArrowRight: rtl ? -1 : 1, ArrowUp: 1, ArrowLeft: rtl ? 1 : -1, ArrowDown: -1 }[e.key];
        if (k) { e.preventDefault(); setN(b.n + k); } else if (e.key === 'Home') { e.preventDefault(); setN(0); } else if (e.key === 'End') { e.preventDefault(); setN(b.d); }
      });
      // A tap shades up to the piece tapped (tapping the last shaded piece unshades it).
      shape.addEventListener('click', e => {
        const p = e.target.closest('[data-piece]'); if (!p || ctx.editing) return;
        const k = Math.floor(+p.dataset.piece / (useL ? c.L / b.d : 1)) + 1;
        setN(k === b.n ? k - 1 : k);
      });
      const pm = el('div', 'dt-fpm');
      const minus = btn('−', 'btn btn-sm dt-pm', `${W.fewer} (${i + 1})`), plus = btn('+', 'btn btn-sm dt-pm', `${W.more} (${i + 1})`);
      minus.disabled = b.d <= 1; plus.disabled = b.d >= 12;
      const parts2 = d => { b.d = d; b.n = Math.min(b.n, d); T.commit(fill(W.parts, { n: d })); };
      minus.addEventListener('click', () => { if (b.d > 1) parts2(b.d - 1); });
      plus.addEventListener('click', () => { if (b.d < 12) parts2(b.d + 1); });
      const pl = el('span', 'dt-fpl', fill(W.parts, { n: b.d }));
      pm.append(minus, pl, plus);
      row.append(lab, shape, pm);
      wrap.appendChild(row);
    });
    // The comparison: two in order of the rows (3/4 > 5/8), three smallest first.
    T.read.textContent = '';
    if (st.bars.length > 1) {
      const big = el('div', 'dt-big dt-cmp'); big.dir = 'ltr';
      if (st.hide) big.textContent = '?';
      else if (st.bars.length === 2) { const [a, b] = st.bars; const k = M.compare(a, b); big.append(stacked(a.n, a.d), el('span', 'dt-sign', k > 0 ? '>' : k < 0 ? '<' : '='), stacked(b.n, b.d)); }
      else { const o = M.ordered(st.bars); o.list.forEach((x, k) => { if (k) big.appendChild(el('span', 'dt-sign', o.signs[k - 1])); big.appendChild(stacked(x.f.n, x.f.d)); }); }
      const why = el('div', 'dt-sub', st.hide ? W.order : st.same ? sameText() : W.samePrompt);
      T.read.append(big, why);
    } else T.read.appendChild(el('div', 'dt-sub', shadedWords(st.bars[0].n, st.bars[0].d, W, ctx.intl)));
  }
  /** Add, Subtract, Multiply or Divide: a number sentence. Circles: each fraction's circles above its − and + (stacked as
   *  on paper), then the sign, the second, = and the answer, in one row (two rows on a narrow widget). Bars: the bars
   *  stacked on one scale, each with its fraction (its − and +) beside it. Multiply: the sentence above the area model.
   *  The sizes come from the model's area as it is now (drawn again when it changes): the readout is built first, so
   *  the area is measured at its final size. */
  function opView(op) {
    st.a = M.clampOperand(st.a || M.OP_START.a); st.b = M.clampOperand(st.b || M.OP_START.b);
    const r = M.operate(op, st.a, st.b), had = T.stage.contains(document.activeElement) ? document.activeElement.dataset.k : '';
    swap.hidden = op !== 'sub' || !r.negative;
    readout(op, r);
    T.stage.textContent = '';
    // A phone's model area grows with what it holds: it is given a fixed room instead of being measured.
    const narrow = matchMedia('(max-width: 719px)').matches;
    const room = { w: T.stage.clientWidth, h: narrow ? 460 : T.stage.clientHeight };
    const wrap = el('div', `dt-fop dt-fop-${op} dt-fo-${op === 'mul' ? 'area' : st.shape}`); wrap.dir = 'ltr';
    T.stage.appendChild(wrap);
    if (op === 'mul') mulView(r, wrap, room);
    else if (st.shape === 'circle') circleView(r, wrap, room);
    else barView(r, wrap, room);
    if (had) (T.stage.querySelector(`[data-k="${had}"]:not(:disabled)`) || T.stage.querySelector(`[data-k^="${had.slice(0, 2)}"]:not(:disabled)`))?.focus();
  }
  /** The readout: 1/2 + 1/3 = 3/6 + 2/6 = 5/6 (= the simplest form), then in words what that is. */
  function readout(op, r) {
    T.read.textContent = '';
    const big = el('div', 'dt-big dt-cmp dt-fchain'); big.dir = 'ltr';
    const put = (...xs) => { for (const x of xs) big.appendChild(typeof x === 'string' ? el('span', 'dt-sign', x) : x); };
    put(stacked(r.a.n, r.a.d), r.sign, stacked(r.b.n, r.b.d), '=');
    const notes = [];
    if (zeroNote) notes.push(W.noZero);
    if (st.hide) { put('?'); notes.push(W.think); } else {
      // Divide: a/b ÷ c/d = a/b × d/c (the second turned over).
      if (op === 'div') put(stacked(r.a.n, r.a.d), '×', stacked(r.flip.n, r.flip.d), '=');
      else if (op !== 'mul' && (r.a.d !== r.L || r.b.d !== r.L)) put(fracEl(r.a2), r.sign, fracEl(r.b2), '=');
      put(fracEl(r.raw));
      const simpler = r.simple.n !== r.raw.n || r.simple.d !== r.raw.d;
      if (simpler) put('=', fracEl(r.simple));
      if (op === 'mul') notes.push(fill(W.overlap, { n: Math.abs(r.raw.n), d: r.raw.d }));
      if (op === 'div') notes.push(fill(W.fits, { n: iso(r.mixed), a: iso(`${r.a.n}/${r.a.d}`), b: iso(`${r.b.n}/${r.b.d}`) }));
      if (r.negative) notes.push(fill(W.below, { a: iso(`${r.a.n}/${r.a.d}`), b: iso(`${r.b.n}/${r.b.d}`) }));
      if (r.more) notes.push(fill(W.mixed, { m: iso(r.mixed) }));
      else if (simpler && !r.whole) notes.push(fill(W.simplest, { f: iso(r.mixed) }));
      else if (!simpler && !r.whole && r.raw.n && !r.negative) notes.push(fill(W.already, { f: iso(M.fracRaw(r.raw)) }));
      if (op !== 'mul' && !sameSize(r)) notes.push(fill(W.tooSmall, { n: r.L }));
    }
    T.read.appendChild(big);
    if (notes.length) T.read.appendChild(el('div', 'dt-sub', notes.join(' ')));
  }
  /** A fraction stacked (a whole number plain, a minus in front). */
  const fracEl = f => {
    const a = Math.abs(f.n), x = f.d === 1 ? ltr('span', 'dt-fwhole', String(a)) : stacked(a, f.d);
    if (f.n >= 0) return x;
    const w = el('span', 'dt-fneg'); w.dir = 'ltr'; w.append(el('span', 'dt-sign', '−'), x); return w;
  };
  /** Whether the pictures can show the same-size pieces (not too many slivers). */
  const sameSize = r => r.L <= 48 && wholesOf(r) * r.L <= MAX_PIECES;
  const wholesOf = r => Math.max(1, ...(r.op === 'div' ? [r.a, r.b] : [r.a, r.b, r.raw]).map(f => Math.ceil(Math.abs(f.n) / f.d)));
  /** One fraction of the sentence: − and + on its top and its bottom number, stacked as on paper. */
  function operand(k, i) {
    const f = st[k], who = i ? W.second : W.first;
    const g = el('div', `dt-fo dt-fo${i}`); g.setAttribute('role', 'group'); g.setAttribute('aria-label', `${who}: ${f.n}/${f.d}`);
    const row = (key, lo, hi, word) => {
      const r = el('div', 'dt-forow');
      const m = btn('−', 'btn btn-sm dt-pm', `${word} − (${who})`), p = btn('+', 'btn btn-sm dt-pm', `${word} + (${who})`);
      m.dataset.k = `${k}${key}-`; p.dataset.k = `${k}${key}+`;
      const v = ltr('b', 'dt-fov', String(f[key])); v.setAttribute('aria-hidden', 'true');
      // Divide: the second fraction's top number stops at 1 (nothing is divided by zero); − there says why instead.
      const noZero = mode() === 'div' && k === 'b' && key === 'n';
      m.disabled = ctx.editing || f[key] <= lo && !(noZero && f[key] === 1); p.disabled = ctx.editing || f[key] >= hi;
      const set = x => { zeroNote = noZero && x < 1; if (zeroNote) { T.draw(); ctx.say(W.noZero); return; } st[k] = M.clampOperand({ ...f, [key]: x }); T.commit(opSay()); };
      m.addEventListener('click', () => set(f[key] - 1)); p.addEventListener('click', () => set(f[key] + 1));
      r.append(m, v, p); return r;
    };
    const line = el('div', 'dt-fol'); line.setAttribute('aria-hidden', 'true');
    g.append(row('n', 0, Math.min(M.OP_LIMITS.nMax, M.OP_LIMITS.wholes * f.d), W.num), line, row('d', 1, M.OP_LIMITS.dMax, W.den));
    return g;
  }
  /** A fraction with its − and +, and what it is in same-size pieces (= 3/6) when that is drawn. */
  function operandBox(k, i, same) {
    const box = el('div', 'dt-fopnd'); box.appendChild(operand(k, i));
    if (same) { const q = el('span', 'dt-feqv'); q.dir = 'ltr'; const s = el('span', 'dt-eqsign', '='); s.setAttribute('aria-hidden', 'true'); q.append(s, fracEl(same)); box.appendChild(q); }
    return box;
  }
  /** The answer's place in the sentence: the fraction, or ? while it is hidden. */
  const answerEl = f => { const x = el('span', 'dt-fans'); x.dir = 'ltr'; x.appendChild(f ? fracEl(f) : el('span', 'dt-fq', '?')); return x; };
  const signEl = t => { const x = el('div', 'dt-fsg'); const s = el('span', 'dt-fosign', t); s.setAttribute('aria-hidden', 'true'); x.appendChild(s); return x; };
  /** The fractions' − and + in each form: [height, width] in px (see .dt-fs-stack, -tight, -inline in dash.css). */
  const FORMS = { stack: [100, 150], tight: [84, 128], inline: [44, 300], mini: [36, 260] }, EQW = 56, GAP = 12, SIGN = 40;
  /** Add, Subtract, Divide: what each picture shows. A and B are the two fractions (in same-size pieces when they are
   *  drawn), ans the answer: cells[i] is piece i's class, per pieces a whole, group pieces between bold lines, part one
   *  bar or wedge as long as the answer (too many pieces to draw), f the fraction it is. */
  function pictures(r) {
    const useL = !st.hide && sameSize(r);
    const pieces = (f, cls) => Array.from({ length: Math.abs(f.n) }, () => cls);
    const fa = useL ? r.a2 : r.a, fb = useL ? r.b2 : r.b;
    const A = { f: fa, cells: pieces(fa, 'dt-on dt-c0'), per: fa.d, group: useL ? r.L / r.a.d : 1, same: useL && r.a.d !== r.L ? r.a2 : null };
    const B = { f: fb, cells: pieces(fb, 'dt-on dt-c1'), per: fb.d, group: useL ? r.L / r.b.d : 1, same: useL && r.b.d !== r.L ? r.b2 : null };
    let ans;
    if (st.hide) ans = { f: null, cells: [], per: 1, group: 1 };
    // Divide: the first fraction measured in lots of the second (same-size pieces): whole lots take turns in two shades
    // with a bold line between them, and what is left over is hatched (it is that part of one more lot).
    else if (r.op === 'div') {
      if (!useL) ans = { f: r.simple, cells: [], per: 1, group: 1, part: { v: r.a.n / r.a.d, cls: 'dt-on dt-c1' } };
      else {
        const lot = r.b2.n, full = Math.floor(r.a2.n / lot) * lot;
        ans = { f: r.simple, per: r.L, group: lot, cells: Array.from({ length: r.a2.n }, (_, i) => (i >= full ? 'dt-on dt-fleft' : Math.floor(i / lot) % 2 ? 'dt-on dt-c1b' : 'dt-on dt-c1')) };
      }
    } else {
      // Adding puts the second's pieces after the first's; taking away crosses the second's off the first's end. Below
      // zero, the pieces missing are drawn hatched and the answer has its minus. With too many pieces to draw, the answer
      // is one bar (or wedge) as long as it is.
      const show = useL ? r.raw : r.simple, many = wholesOf(r) * show.d > MAX_PIECES, neg = r.negative ? 'dt-on dt-fneg' : null;
      let cells;
      if (many) cells = [];
      else if (!useL || r.negative) cells = Array.from({ length: Math.abs(show.n) }, () => neg || 'dt-on dt-c2');
      else if (r.op === 'add') cells = Array.from({ length: r.raw.n }, (_, i) => (i < r.a2.n ? 'dt-on dt-c0' : 'dt-on dt-c1'));
      else cells = Array.from({ length: r.a2.n }, (_, i) => (i < r.raw.n ? 'dt-on dt-c0' : 'dt-took'));
      ans = { f: show, cells, per: many ? 1 : show.d, group: 1, part: many ? { v: Math.abs(show.n) / show.d, cls: neg || 'dt-on dt-c2' } : null };
    }
    A.aria = shadedWords(fa.n, fa.d, W, ctx.intl); B.aria = shadedWords(fb.n, fb.d, W, ctx.intl);
    ans.aria = `= ${!ans.f ? '?' : r.op === 'div' ? r.mixed : M.fracRaw(ans.f)}`;
    for (const x of [A, B, ans]) x.wholes = Math.max(1, Math.ceil(x.part ? x.part.v : x.cells.length / x.per));
    return { A, B, ans };
  }
  /** Circles: A − B = ? in a row, each fraction's circles above it; two rows (A − B, then = ?) when one row would make the
   *  circles too small. The circle size, and how big the − and + are, are worked out from the room. */
  function circleView(r, wrap, room) {
    const p = pictures(r), ns = [p.A.wholes, p.B.wholes, p.ans.wholes];
    const size = (form, lines, eqOn) => {
      const [hs, ws] = FORMS[form], eq = [p.A.same && eqOn ? EQW : 0, p.B.same && eqOn ? EQW : 0];
      const under = i => (i < 2 ? ws + eq[i] : 72), pics = (i, s) => ns[i] * s + (ns[i] - 1) * 6;
      const col = (i, s) => Math.max(under(i), pics(i, s));
      // 1: one row; 2: A − B, then = ?; 3 (a phone): each fraction a row of its own, its circles beside it.
      const wide = { 1: s => col(0, s) + col(1, s) + col(2, s) + 2 * SIGN + 4 * GAP, 2: s => Math.max(col(0, s) + col(1, s) + SIGN + 2 * GAP, SIGN + col(2, s) + GAP),
        3: s => Math.max(...[0, 1, 2].map(i => pics(i, s) + GAP + under(i))) }[lines];
      const high = { 1: room.h - hs - GAP, 2: (room.h - 2 * hs - 3 * GAP) / 2, 3: (room.h - 2 * SIGN - 4 * GAP) / 3 }[lines];
      let s = Math.floor(Math.min(lines === 3 ? 110 : 220, high - 4));
      while (s >= 20 && wide(s) > room.w) s -= 2;
      return s;
    };
    // Each way to lay it out, best first (with "= 3/6" beside each fraction, then without it).
    const ways = [];
    for (const [form, lines] of [['stack', 1], ['tight', 1], ['stack', 2], ['tight', 2], ['stack', 3], ['tight', 3], ['inline', 1], ['inline', 2], ['mini', 1], ['mini', 2]])
      for (const eqOn of p.A.same || p.B.same ? [true, false] : [false]) ways.push({ form, lines, eqOn, s: size(form, lines, eqOn) });
    const build = w => {
      wrap.textContent = ''; wrap.className = wrap.className.replace(/ dt-fs-\S+/g, ''); wrap.classList.add(...formClass(w.form));
      const sent = el('div', `dt-fsent dt-fsent${w.lines}`);
      sent.style.setProperty('--ps', `${Math.max(20, w.s)}px`); sent.style.setProperty('--hs', `${FORMS[w.form][0]}px`);
      const term = (x, i, under) => {
        const col = el('div', `dt-fterm dt-ft${i}`);
        const pic = pies(x.wholes, x.per, x.cells, x.group, x.part);
        pic.setAttribute('role', 'img'); pic.setAttribute('aria-label', x.aria);
        if (!x.f && i === 2) pic.classList.add('dt-fqpie');
        const u = el('div', 'dt-funder'); u.appendChild(under);
        col.append(pic, u); return col;
      };
      sent.append(term(p.A, 0, operandBox('a', 0, w.eqOn && p.A.same)), signEl(r.sign), term(p.B, 1, operandBox('b', 1, w.eqOn && p.B.same)));
      if (w.lines === 2) sent.appendChild(el('div', 'dt-fbrk'));
      sent.append(signEl('='), term(p.ans, 2, answerEl(p.ans.f)));
      wrap.appendChild(sent);
      return sent;
    };
    // The first way whose circles are big enough (at least 72px and three quarters of the biggest any way gives) and
    // that really fits (measured), else the one with the biggest circles that fits, else the smallest.
    const fits = sent => sent.scrollWidth <= room.w + 1 && sent.offsetHeight <= room.h + 1;
    const good = ways.filter(w => w.s >= 20), big = Math.max(72, 0.75 * Math.max(0, ...good.map(w => w.s)));
    for (const w of [...good.filter(x => x.s >= big), ...good.slice().sort((x, y) => y.s - x.s)]) if (fits(build(w))) return;
    build({ form: 'mini', lines: 2, eqOn: false, s: 20 });
  }
  /** The classes for a form of − and + (mini: on one row, with the smaller buttons). */
  const formClass = form => (form === 'mini' ? ['dt-fs-inline', 'dt-fs-tight'] : [`dt-fs-${form}`]);
  /** Bars: one bar a row on one scale, each with its sign and fraction beside it (lined up on the bars' side); on a
   *  phone (or when that does not fit) each fraction above its bar. The first form of − and + that fits (measured) is used. */
  function barView(r, wrap, room) {
    const p = pictures(r), wholes = wholesOf(r);
    const ansH = { stack: 56, tight: 48, inline: 36, mini: 30 }, gap = { stack: GAP, tight: GAP, inline: 6, mini: 6 };
    const build = (form, eqOn, above) => {
      wrap.textContent = ''; wrap.className = wrap.className.replace(/ dt-fs-\S+/g, ''); wrap.classList.add(...formClass(form));
      const hs = FORMS[form][0];
      // The bars: as tall as the room allows, never taller than the fractions beside them (and at most 72px).
      const bh = above ? 48 : Math.max(20, Math.min(72, hs, room.h - 2 * hs - 2 * gap[form] - 2));
      const grid = el('div', `dt-fbars${above ? ' dt-fbars-above' : ''}`); grid.style.setProperty('--bh', `${bh}px`); grid.style.setProperty('--gp', `${gap[form]}px`);
      const row = (sign, label, x) => {
        const lab = el('div', 'dt-fblab');
        if (sign) { const t = el('span', 'dt-fosign', sign); t.setAttribute('aria-hidden', 'true'); lab.appendChild(t); }
        lab.appendChild(label);
        const bar = stripSvg(wholes, x.per, x.cells, x.group, x.part);
        bar.setAttribute('role', 'img'); bar.setAttribute('aria-label', x.aria);
        grid.append(lab, bar);
      };
      row('', operandBox('a', 0, eqOn && p.A.same), p.A);
      row(r.sign, operandBox('b', 1, eqOn && p.B.same), p.B);
      row('=', answerEl(p.ans.f), p.ans);
      wrap.appendChild(grid);
      return grid;
    };
    // Fits: no wider or taller than the room, and the bars at least 120px long.
    const fits = g => g.scrollWidth <= room.w + 1 && g.offsetHeight <= room.h + 1 && g.querySelector('.dt-fobar').getBoundingClientRect().width >= Math.min(120, room.w / 3);
    const eqs = p.A.same || p.B.same ? [true, false] : [false];
    // A phone: each fraction above its bar first; a widget: beside it first.
    const phone = matchMedia('(max-width: 719px)').matches;
    for (const above of phone ? [true, false] : [false, true]) for (const form of ['stack', 'tight', 'inline', 'mini']) for (const eqOn of eqs) {
      if ((above || 2 * FORMS[form][0] + ansH[form] + 2 * gap[form] <= room.h) && fits(build(form, eqOn, above))) return;
    }
    build('mini', false, false);
  }
  /** Multiply: the sentence (A × B = ?) above the area model. */
  function mulView(r, wrap, room) {
    // The sentence in one row (A × B = answer) with the biggest − and + that leave the square room (the answer is left
    // out when it would not fit on the row: the readout has it).
    const build = (form, answer) => {
      wrap.textContent = ''; wrap.className = wrap.className.replace(/ dt-fs-\S+/g, ''); wrap.classList.add(...formClass(form));
      const eq = el('div', 'dt-foeq');
      eq.append(operand('a', 0), signEl(r.sign), operand('b', 1));
      if (answer) eq.append(signEl('='), answerEl(st.hide ? null : r.simple));
      wrap.appendChild(eq);
      return eq;
    };
    const room2 = { stack: 170, tight: 120, inline: 90, mini: 0 };
    let eq = null;
    for (const form of ['stack', 'tight', 'inline', 'mini']) for (const answer of [true, false]) {
      if (eq) break;
      const e = build(form, answer);
      if (e.scrollWidth <= room.w + 1 && e.offsetHeight <= FORMS[form][0] + 8 && room.h - e.offsetHeight - GAP >= room2[form]) eq = e;
    }
    if (!eq) eq = build('mini', false);
    wrap.appendChild(eq);
    wrap.appendChild(areaModel(r, eq));
  }
  /** Multiply: a unit square cut one way by the first bottom number (its top number shaded) and the other way by the
   *  second; where the shading overlaps is the product. Past one whole, the square repeats (3/1 is three squares). */
  function areaModel(r, eq) {
    const { a, b } = r, hide = st.hide;
    const A = Math.max(1, Math.ceil(a.n / a.d)), B = Math.max(1, Math.ceil(b.n / b.d)), U = 100, P = 46;
    const cw = U / a.d, rh = U / b.d, wv = A * U + P + 12, hv = B * U + P + 12;
    // The labels are at least 13px (more on the projector) in the room left under the sum, not the whole model area.
    const w = T.stage.clientWidth, h = T.stage.clientHeight - eq.offsetHeight - 12;
    const k = matchMedia('(max-width: 719px)').matches || h <= 0 ? w / wv : Math.min(w / wv, h / hv);
    const ts = k > 0 ? Math.max(1, (document.body.classList.contains('dash-projector') ? 13 * 1.35 : 13) / (16 * k)) : 1;
    const sv = svg('svg', { viewBox: `${-P} -12 ${wv} ${hv}`, class: 'dt-farea', role: 'img', style: `--ts:${ts.toFixed(3)}`,
      'aria-label': hide ? `${a.n}/${a.d} × ${b.n}/${b.d}` : fill(W.overlap, { n: r.raw.n, d: r.raw.d }) });
    sv.setAttribute('direction', 'ltr');
    for (let i = 0; i < A * a.d; i++) for (let j = 0; j < B * b.d; j++) {
      const inA = i < a.n, inB = j < b.n;
      sv.appendChild(svg('rect', { x: i * cw, y: j * rh, width: cw, height: rh, class: inA && inB && !hide ? 'dt-mx' : inA && inB ? 'dt-mab' : inA ? 'dt-ma' : inB ? 'dt-mb' : 'dt-off' }));
    }
    for (let i = 1; i < A * a.d; i++) sv.appendChild(svg('line', { x1: i * cw, x2: i * cw, y1: 0, y2: B * U, class: i % a.d ? 'dt-thin' : 'dt-edge' }));
    for (let j = 1; j < B * b.d; j++) sv.appendChild(svg('line', { x1: 0, x2: A * U, y1: j * rh, y2: j * rh, class: j % b.d ? 'dt-thin' : 'dt-edge' }));
    sv.appendChild(svg('rect', { x: 0, y: 0, width: A * U, height: B * U, class: 'dt-outline' }));
    // What each way is cut into: the first fraction along the bottom, the second up the side.
    if (a.n) { sv.appendChild(svg('path', { d: `M0 ${B * U + 8}v8H${a.n * cw}v-8`, class: 'dt-fbrace dt-c0s' })); sv.appendChild(svg('text', { x: (a.n * cw) / 2, y: B * U + 20 + 18 * ts, 'text-anchor': 'middle', class: 'dt-ftl' }, `${a.n}/${a.d}`)); }
    if (b.n) { sv.appendChild(svg('path', { d: `M-8 0h-8V${b.n * rh}h8`, class: 'dt-fbrace dt-c1s' })); sv.appendChild(svg('text', { x: -22, y: (b.n * rh) / 2 + 6 * ts, 'text-anchor': 'end', class: 'dt-ftl' }, `${b.n}/${b.d}`)); }
    const box = el('div', 'dt-fareabox'); box.appendChild(sv);
    return box;
  }
  return T.finish();
}
/** A strip of `wholes` wholes cut into `per` pieces each; cells[i] is piece i's class (unshaded when missing); a bold line
 *  at every whole and every `group` pieces (the pieces before they were cut smaller). */
function stripSvg(wholes, per, cells, group = 1, part = null) {
  const w = 600, h = 80, n = wholes * per, sv = svg('svg', { viewBox: `0 0 ${w} ${h}`, preserveAspectRatio: 'none', class: 'dt-fbar dt-fobar' });
  if (part) sv.appendChild(svg('rect', { x: 0, y: 0, width: (w * part.v) / wholes, height: h, class: part.cls }));
  for (let i = 0; i < n; i++) {
    if (!part) sv.appendChild(svg('rect', { x: (i * w) / n, y: 0, width: w / n, height: h, class: cells[i] || 'dt-off' }));
    if (cells[i] === 'dt-took') sv.appendChild(svg('path', { d: `M${(i * w) / n} 0L${((i + 1) * w) / n} ${h}`, class: 'dt-tookx' }));
  }
  for (let i = 1; i < n; i++) sv.appendChild(svg('line', { x1: (i * w) / n, x2: (i * w) / n, y1: 0, y2: h, class: i % per === 0 ? 'dt-whole' : i % group ? 'dt-thin' : 'dt-edge' }));
  sv.appendChild(svg('rect', { x: 0, y: 0, width: w, height: h, class: 'dt-outline' }));
  return sv;
}
/** The same as circles: one circle a whole (part: one wedge as big as it is, for too many pieces to draw). */
function pies(wholes, per, cells, group = 1, part = null) {
  const box = el('div', 'dt-fpies');
  for (let k = 0; k < wholes; k++) {
    const sv = svg('svg', { viewBox: '-52 -52 104 104', class: 'dt-fpie' });
    const pt = a => `${(48 * Math.sin(a)).toFixed(3)} ${(-48 * Math.cos(a)).toFixed(3)}`;
    if (part) {
      const v = Math.max(0, Math.min(1, part.v - k)), a1 = v * 2 * Math.PI;
      sv.appendChild(svg('circle', { r: 48, class: 'dt-off' }));
      if (v >= 1) sv.appendChild(svg('circle', { r: 48, class: part.cls }));
      else if (v > 0) sv.appendChild(svg('path', { d: `M0 0 L0 -48 A48 48 0 ${a1 > Math.PI ? 1 : 0} 1 ${pt(a1)} Z`, class: part.cls }));
      sv.appendChild(svg('circle', { cx: 0, cy: 0, r: 48, class: 'dt-outline' }));
      box.appendChild(sv); continue;
    }
    for (let i = 0; i < per; i++) {
      const a0 = (i / per) * 2 * Math.PI, a1 = ((i + 1) / per) * 2 * Math.PI, c = cells[k * per + i] || 'dt-off';
      const d = per === 1 ? 'M0 -48 A48 48 0 1 1 -0.01 -48 Z' : `M0 0 L${pt(a0)} A48 48 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${pt(a1)} Z`;
      sv.appendChild(svg('path', { d, class: `${c} ${i % group ? 'dt-thinp' : ''}` }));
      if (c === 'dt-took') { const m = (a0 + a1) / 2; sv.appendChild(svg('path', { d: `M${(14 * Math.sin(m)).toFixed(2)} ${(-14 * Math.cos(m)).toFixed(2)}L${(44 * Math.sin(m)).toFixed(2)} ${(-44 * Math.cos(m)).toFixed(2)}`, class: 'dt-tookx' })); }
    }
    if (per > 1) for (let i = 0; i < per; i += group) sv.appendChild(svg('line', { x1: 0, y1: 0, x2: 48 * Math.sin((i / per) * 2 * Math.PI), y2: -48 * Math.cos((i / per) * 2 * Math.PI), class: 'dt-edge' }));
    sv.appendChild(svg('circle', { cx: 0, cy: 0, r: 48, class: 'dt-outline' }));
    box.appendChild(sv);
  }
  return box;
}
/** A bar of `parts` pieces, the first `shaded` filled; every `group` pieces a bold line (the original pieces). */
function barSvg(parts, shaded, color, group = 1) {
  const w = 600, h = 80, sv = svg('svg', { viewBox: `0 0 ${w} ${h}`, preserveAspectRatio: 'none', class: 'dt-fbar' });
  for (let i = 0; i < parts; i++) sv.appendChild(svg('rect', { x: (i * w) / parts, y: 0, width: w / parts, height: h, class: i < shaded ? `dt-on dt-c${color % FCOLORS}` : 'dt-off', 'data-piece': i }));
  for (let i = 1; i < parts; i++) sv.appendChild(svg('line', { x1: (i * w) / parts, x2: (i * w) / parts, y1: 0, y2: h, class: i % group ? 'dt-thin' : 'dt-edge' }));
  sv.appendChild(svg('rect', { x: 0, y: 0, width: w, height: h, class: 'dt-outline' }));
  return sv;
}
function pieSvg(parts, shaded, color, group = 1) {
  const sv = svg('svg', { viewBox: '-52 -52 104 104', class: 'dt-fpie' });
  const pt = a => `${(48 * Math.sin(a)).toFixed(3)} ${(-48 * Math.cos(a)).toFixed(3)}`;
  for (let i = 0; i < parts; i++) {
    const a0 = (i / parts) * 2 * Math.PI, a1 = ((i + 1) / parts) * 2 * Math.PI;
    const d = parts === 1 ? 'M0 -48 A48 48 0 1 1 -0.01 -48 Z' : `M0 0 L${pt(a0)} A48 48 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${pt(a1)} Z`;
    sv.appendChild(svg('path', { d, class: `${i < shaded ? `dt-on dt-c${color % FCOLORS}` : 'dt-off'} ${i % group ? 'dt-thinp' : ''}`, 'data-piece': i }));
  }
  if (parts > 1) for (let i = 0; i < parts; i += group) sv.appendChild(svg('line', { x1: 0, y1: 0, x2: 48 * Math.sin((i / parts) * 2 * Math.PI), y2: -48 * Math.cos((i / parts) * 2 * Math.PI), class: 'dt-edge' }));
  sv.appendChild(svg('circle', { cx: 0, cy: 0, r: 48, class: 'dt-outline' }));
  return sv;
}

// ================================================================ 2. number line
function numline(body, s, ctx) {
  const T = shell(body, s, ctx, 'numline'), { W, st } = T;
  const tools = T.seg(W.mode, [['point', `● ${W.point}`], ['jump', `⤻ ${W.jump}`]], () => st.tool, v => { st.tool = v; start = null; T.commit(); });
  T.top.appendChild(tools);
  const clear = btn(`🧹 ${W.clear}`, 'btn btn-sm');
  clear.addEventListener('click', () => { st.points = []; st.jumps = []; start = null; T.commit(W.clear); });
  T.foot.appendChild(clear);
  let cursor = null, start = null, drag = null;
  const lo = () => st.lo * st.sub, hi = () => st.hi * st.sub;
  const label = t => M.tickLabel(t, st.sub, st.mode);
  const X0 = 40, X1 = 960, Y = 112;
  const togglePoint = t => {
    const had = st.points.includes(t);
    st.points = had ? st.points.filter(p => p !== t) : [...st.points, t].slice(-20);
    T.commit(fill(had ? W.removed : W.placed, { v: iso(label(t)) }));
  };
  const addJump = (a, b) => { if (a === b) return; st.jumps = [...st.jumps, { a, b }].slice(-12); T.commit(fill(W.jumped, { a: iso(label(a)), b: iso(label(b)), d: iso(M.jumpLabel(a, b, st.sub, st.mode)) })); };
  let line;
  T.draw = () => {
    tools.sync(); clear.disabled = !st.points.length && !st.jumps.length;
    if (cursor === null || cursor < lo() || cursor > hi()) cursor = Math.max(lo(), Math.min(hi(), 0));
    T.stage.textContent = '';
    // Stage 4 review: with no jumps the room for arcs above the line is left out, so the line fills a wide, short tool.
    const vbY = st.jumps.length ? 0 : 58, vbH = 176 - vbY;
    const ts = T.ts(1000, vbH, 22, 13);
    line = svg('svg', { viewBox: `0 ${vbY} 1000 ${vbH}`, class: 'dt-nl', style: `--ts:${ts.toFixed(3)}`, role: 'slider', tabindex: ctx.editing ? '-1' : '0', 'aria-label': W.cursor, 'aria-valuemin': lo(), 'aria-valuemax': hi(), 'aria-valuenow': cursor, 'aria-valuetext': label(cursor) });
    line.setAttribute('direction', 'ltr');
    const x = t => M.tickX(t, lo(), hi(), X0, X1);
    line.appendChild(svg('line', { x1: X0 - 24, x2: X1 + 24, y1: Y, y2: Y, class: 'dt-axis' }));
    line.appendChild(svg('path', { d: `M${X1 + 30} ${Y} l-14 -9 v18 z`, class: 'dt-arrow' }));
    line.appendChild(svg('path', { d: `M${X0 - 30} ${Y} l14 -9 v18 z`, class: 'dt-arrow' }));
    // As many labels as fit without touching: the longest label decides.
    let chars = 1; for (let t = lo(); t <= hi(); t++) chars = Math.max(chars, label(t).length);
    const every = M.labelEvery(lo(), hi(), st.sub, Math.max(2, Math.floor((X1 - X0) / ((chars * 12.5 + 22) * ts))));
    for (let t = lo(); t <= hi(); t++) {
      const whole = t % st.sub === 0, lab = (t - lo()) % every === 0 || (every > 1 && whole && (t / st.sub) % (every / st.sub) === 0);
      line.appendChild(svg('line', { x1: x(t), x2: x(t), y1: Y - (whole ? 18 : 10), y2: Y + (whole ? 18 : 10), class: whole ? 'dt-tick dt-tickw' : 'dt-tick' }));
      if (lab) line.appendChild(svg('text', { x: x(t), y: Y + 30 + 22 * ts, class: `dt-tl${whole ? ' dt-tlw' : ''}`, 'text-anchor': 'middle' }, label(t)));
    }
    st.jumps.forEach((j, k) => {
      const a = x(j.a), b = x(j.b), h = Math.min(90, 26 + Math.abs(b - a) * 0.35);
      line.appendChild(svg('path', { d: `M${a} ${Y - 4} Q${(a + b) / 2} ${Y - 4 - h * 1.6} ${b} ${Y - 4}`, class: `dt-jump dt-j${k % 3}` }));
      line.appendChild(svg('path', { d: `M${b} ${Y - 4} l${b > a ? -14 : 14} -6 l${b > a ? 2 : -2} 12 z`, class: `dt-jhead dt-j${k % 3}` }));
      line.appendChild(svg('text', { x: (a + b) / 2, y: Y - 10 - h * 0.8, class: 'dt-jl', 'text-anchor': 'middle' }, M.jumpLabel(j.a, j.b, st.sub, st.mode)));
    });
    for (const p of st.points) line.appendChild(svg('circle', { cx: x(p), cy: Y, r: 11, class: 'dt-pt' }));
    if (start !== null) line.appendChild(svg('circle', { cx: x(start), cy: Y, r: 14, class: 'dt-start' }));
    if (!ctx.editing) line.appendChild(svg('path', { d: `M${x(cursor)} ${Y + 22} l-11 16 h22 z`, class: 'dt-cursor' }));
    if (drag && drag.to !== drag.from) { const a = x(drag.from), b = x(drag.to); line.appendChild(svg('path', { d: `M${a} ${Y - 4} Q${(a + b) / 2} ${Y - 80} ${b} ${Y - 4}`, class: 'dt-jump dt-preview' })); }
    T.stage.appendChild(line);
    wire();
    const last = st.jumps[st.jumps.length - 1];
    T.read.textContent = '';
    const big = ltr('div', 'dt-big');
    if (last) {
      const chain = contiguous(st.jumps);
      // 0 + 3/4 + 3/4 + 3/4 = 2 1/4 (a jump back is a minus)
      big.textContent = `${label(chain[0].a)}${chain.map(j => ` ${j.b >= j.a ? '+' : '−'} ${M.tickLabel(Math.abs(j.b - j.a), st.sub, st.mode)}`).join('')} = ${label(chain[chain.length - 1].b)}`;
      T.read.append(big, el('div', 'dt-sub', fill(W.jumped, { a: iso(label(last.a)), b: iso(label(last.b)), d: iso(M.jumpLabel(last.a, last.b, st.sub, st.mode)) })));
    } else {
      // Stage 4 review: no lone number under the line (it read as a label); the cursor is on the line and in its slider value.
      // Help on the maths tools: the instruction line above says how to use the line (no second hint here).
      if (start !== null) T.read.append(el('div', 'dt-sub', fill(W.jumpFrom, { v: iso(label(start)) })));
    }
  };
  /** The last jumps that follow on from each other (0 → 1/4 → 1/2...). */
  const contiguous = js => { const out = [js[js.length - 1]]; for (let i = js.length - 2; i >= 0 && js[i].b === out[0].a; i--) out.unshift(js[i]); return out; };
  const tickAt = e => M.nearestTick(svgPoint(line, e).x, lo(), hi(), X0, X1);
  function wire() {
    if (ctx.editing) return;
    line.addEventListener('keydown', e => {
      const k = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1, PageUp: st.sub, PageDown: -st.sub }[e.key];
      if (k) { e.preventDefault(); cursor = Math.max(lo(), Math.min(hi(), cursor + k)); T.draw(); line.focus(); return; }
      if (e.key === 'Home' || e.key === 'End') { e.preventDefault(); cursor = e.key === 'Home' ? lo() : hi(); T.draw(); line.focus(); return; }
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        if (st.tool === 'point') togglePoint(cursor);
        else if (start === null) { start = cursor; T.draw(); ctx.say(fill(W.jumpFrom, { v: iso(label(cursor)) })); }
        else { const a = start; start = null; addJump(a, cursor); }
        line.focus();
      }
      if (e.key === 'Escape' && start !== null) { start = null; T.draw(); line.focus(); }
    });
    line.addEventListener('pointerdown', e => {
      const t = tickAt(e); cursor = t;
      if (st.tool === 'jump') { drag = { from: start ?? t, to: t, id: e.pointerId }; line.setPointerCapture(e.pointerId); }
      e.preventDefault(); line.focus();
    });
    line.addEventListener('pointermove', e => { if (!drag || e.pointerId !== drag.id) return; const t = tickAt(e); if (t !== drag.to) { drag.to = t; cursor = t; T.draw(); line.focus(); } });
    const up = e => {
      if (st.tool === 'point') { togglePoint(cursor); line.focus(); return; }
      if (!drag || e.pointerId !== drag.id) return;
      const d = drag; drag = null;
      if (d.to !== d.from) { start = null; addJump(d.from, d.to); }
      else if (start === null) { start = d.from; T.draw(); ctx.say(fill(W.jumpFrom, { v: iso(label(start)) })); }
      else { const a = start; start = null; addJump(a, d.to); }
      line.focus();
    };
    line.addEventListener('pointerup', up);
    line.addEventListener('pointercancel', () => { drag = null; T.draw(); });
  }
  return T.finish({
    options: box => {
      const from = field(box, W.from, numberIn(st.lo, -100, 999)), to = field(box, W.to, numberIn(st.hi, -99, 1000));
      const mode = field(box, W.mode, selectOf([['whole', W.whole], ['fraction', W.fraction], ['decimal', W.decimal]], st.mode));
      const steps = field(box, W.steps, selectOf([1, 2, 3, 4, 5, 6, 8, 10, 12].map(n => [n, n === 1 ? '1' : `1/${n}`]), st.sub));
      box.appendChild(el('p', 'small muted', W.range));
      const apply = () => {
        let a = Math.round(+from.value), b = Math.round(+to.value);
        if (!Number.isFinite(a)) a = st.lo; if (!Number.isFinite(b)) b = st.hi;
        a = Math.max(-100, Math.min(999, a)); b = Math.max(a + 1, Math.min(1000, b));
        let sub = +steps.value; const m = mode.value;
        if (m === 'whole') sub = 1; else if (sub === 1) sub = m === 'decimal' ? 10 : 4;
        if (m === 'decimal' && [3, 6, 12].includes(sub)) sub = 10;
        while ((b - a) * sub > 240 && sub > 1) sub = [1, 2, 3, 4, 5, 6, 8, 10, 12].filter(x => x < sub).pop();
        if ((b - a) * sub > 240) b = a + 240;
        Object.assign(st, { lo: a, hi: b, sub, mode: m });
        const inside = t => t >= a * sub && t <= b * sub;
        st.points = st.points.filter(inside); st.jumps = st.jumps.filter(j => inside(j.a) && inside(j.b));
        steps.value = String(sub); from.value = a; to.value = b;
        cursor = null; start = null; T.commit();
      };
      for (const i of [from, to, mode, steps]) i.addEventListener('change', apply);
    },
  });
}

// ================================================================ 3. coordinate plane
function coord(body, s, ctx) {
  const T = shell(body, s, ctx, 'coord'), { W, st } = T;
  const m = () => M.SLOPES[st.mi];
  const eqWords = () => M.equationText(m(), st.b);
  const slope = T.stepper(W.slope, () => M.fracText(m()), () => { if (st.mi > 0) { st.mi--; T.commit(eqWords()); } }, () => { if (st.mi < M.SLOPES.length - 1) { st.mi++; T.commit(eqWords()); } }, `${W.slope} −`, `${W.slope} +`);
  const startS = T.stepper(W.start, () => (st.b < 0 ? `−${-st.b}` : st.b), () => { if (st.b > -10) { st.b--; T.commit(eqWords()); } }, () => { if (st.b < 10) { st.b++; T.commit(eqWords()); } }, `${W.start} −`, `${W.start} +`);
  T.top.append(slope, startS);
  let cur = { x: 0, y: 0 }, plane, planeRO = null;
  const range = () => (st.quads === 1 ? [0, 2 * st.size] : [-st.size, st.size]);
  T.draw = () => {
    slope.sync(); startS.sync();
    const [lo, hi] = range(), n = hi - lo, P = 40, S = 520, u = (S - 2 * P) / n;
    cur.x = Math.max(lo, Math.min(hi, cur.x)); cur.y = Math.max(lo, Math.min(hi, cur.y));
    const X = v => P + (v - lo) * u, Y = v => S - P - (v - lo) * u;
    const lastPlane = T.stage.querySelector('.dt-plane'), lastBox = lastPlane && lastPlane.getBoundingClientRect();
    T.stage.textContent = '';
    const box = el('div', 'dt-cwrap');
    // Text size from the plane as it was last drawn (the table beside it takes a share of the width); the first time,
    // a guess, checked once it is on screen.
    const floorPx = document.body.classList.contains('dash-projector') ? 16 : 13;
    const box0 = lastBox, side = r => Math.min(r.width, r.height || r.width);
    const kNow = box0 && box0.width ? side(box0) / S : T.scale(st.table && !matchMedia('(max-width: 719px)').matches ? S * 1.9 : S, S);
    const ts = kNow > 0 ? Math.max(1, floorPx / (20 * kNow)) : 1;
    plane = svg('svg', { viewBox: `0 0 ${S} ${S}`, class: 'dt-plane', style: `--ts:${ts.toFixed(3)}`, role: 'application', tabindex: ctx.editing ? '-1' : '0', 'aria-label': `${W.plot}. ${W.hint}`, 'aria-roledescription': W.plot });
    plane.setAttribute('direction', 'ltr');
    plane.appendChild(svg('rect', { x: P, y: P, width: S - 2 * P, height: S - 2 * P, class: 'dt-paper' }));
    const step = n > 12 || n * 20 * ts > S * 0.95 ? 2 : 1;
    let grid = '';
    for (let v = lo; v <= hi; v++) grid += `M${X(v)} ${P}V${S - P}M${P} ${Y(v)}H${S - P}`;
    plane.appendChild(svg('path', { d: grid, class: 'dt-grid' }));
    const ax = st.quads === 1 ? lo : 0;
    plane.appendChild(svg('path', { d: `M${P - 8} ${Y(ax)}H${S - P + 14}M${X(ax)} ${S - P + 8}V${P - 14}`, class: 'dt-axis' }));
    plane.appendChild(svg('path', { d: `M${S - P + 20} ${Y(ax)} l-12 -7 v14 z M${X(ax)} ${P - 20} l-7 12 h14 z`, class: 'dt-arrow' }));
    // Axis names clear of the tick numbers: x above the end of the x axis, y to the right of the top of the y axis.
    plane.appendChild(svg('text', { x: S - P + 16, y: Y(ax) - 14, class: 'dt-axl', 'text-anchor': 'middle' }, 'x'));
    plane.appendChild(svg('text', { x: X(ax) + 14, y: P - 6, class: 'dt-axl', 'text-anchor': 'start' }, 'y'));
    for (let v = lo; v <= hi; v += step) {
      if (v === ax && st.quads === 4) continue;
      plane.appendChild(svg('text', { x: X(v), y: Y(ax) + 24, class: 'dt-cl', 'text-anchor': 'middle' }, svgText(v)));
      plane.appendChild(svg('text', { x: X(ax) - 10, y: Y(v) + 6, class: 'dt-cl', 'text-anchor': 'end' }, svgText(v)));
    }
    // The origin's 0 only where it can't run into the −1 beside it (so "−1 0" never reads as "−10").
    if (st.quads === 4 && u * step > 20 * ts * 2.6) plane.appendChild(svg('text', { x: X(0) - 10, y: Y(0) + 24, class: 'dt-cl', 'text-anchor': 'end' }, '0'));
    if (st.line) {
      const seg = M.lineInBox(m(), st.b, lo, hi, lo, hi);
      if (seg) {
        plane.appendChild(svg('line', { x1: X(seg[0][0]), y1: Y(seg[0][1]), x2: X(seg[1][0]), y2: Y(seg[1][1]), class: 'dt-line' }));
        // Rise over run, from where the line starts (0, b) when that is on the grid.
        const sl = m();
        if (st.b >= lo && st.b <= hi && sl.n && 0 >= lo && sl.d <= hi && st.b + sl.n >= lo && st.b + sl.n <= hi) {
          plane.appendChild(svg('path', { d: `M${X(0)} ${Y(st.b)}H${X(sl.d)}V${Y(st.b + sl.n)}`, class: 'dt-tri' }));
          plane.appendChild(svg('text', { x: (X(0) + X(sl.d)) / 2, y: Y(st.b) + (sl.n > 0 ? 22 : -10), class: 'dt-tril', 'text-anchor': 'middle' }, `${W.run} ${sl.d}`));
          plane.appendChild(svg('text', { x: X(sl.d) + 8, y: (Y(st.b) + Y(st.b + sl.n)) / 2 + 6, class: 'dt-tril' }, `${W.rise} ${svgText(sl.n)}`));
        }
        for (const p of M.valueTable(m(), st.b, xsOf())) if (p.y.d === 1 && p.y.n >= lo && p.y.n <= hi && p.x >= lo && p.x <= hi) plane.appendChild(svg('circle', { cx: X(p.x), cy: Y(p.y.n), r: 6, class: 'dt-lpt' }));
      }
    }
    for (const p of st.points) plane.appendChild(svg('circle', { cx: X(p.x), cy: Y(p.y), r: 9, class: 'dt-pt' }));
    if (!ctx.editing) plane.appendChild(svg('path', { d: `M${X(cur.x) - 16} ${Y(cur.y)}h32M${X(cur.x)} ${Y(cur.y) - 16}v32`, class: 'dt-cross' }));
    box.appendChild(plane);
    if (st.table) {
      const tb = el('table', 'dt-table'); tb.dir = 'ltr';
      const r1 = el('tr'), r2 = el('tr');
      r1.appendChild(el('th', null, 'x')); r2.appendChild(el('th', null, 'y'));
      for (const p of M.valueTable(m(), st.b, xsOf())) { r1.appendChild(el('td', null, svgText(p.x))); r2.appendChild(el('td', null, M.fracText(p.y))); }
      tb.append(r1, r2); box.appendChild(tb);
    }
    T.stage.appendChild(box);
    // The plane's size can change without the model area changing (the table beside it grows when fonts arrive): watch
    // the plane itself and draw again when its scale moves.
    if (planeRO) planeRO.disconnect();
    planeRO = typeof ResizeObserver === 'function' ? new ResizeObserver(() => { const k2 = side(plane.getBoundingClientRect()) / S; if (k2 > 0 && Math.abs(k2 - kNow) / k2 > 0.03 && plane.isConnected) requestAnimationFrame(() => T.draw()); }) : null;
    if (planeRO) planeRO.observe(plane);
    const eq = el('div', 'dt-big dt-eq'); eq.dir = 'ltr'; eq.setAttribute('aria-label', eqWords());
    for (const p of M.equationParts(m(), st.b)) eq.appendChild(p.f ? stacked(p.f.n, p.f.d, 'dt-frac dt-frac-s') : document.createTextNode(p.t));
    T.read.textContent = ''; T.read.appendChild(eq);
    if (!st.line) eq.hidden = true;
    if (!st.line) T.read.appendChild(el('div', 'dt-sub', W.noLine));
    wire(lo, hi, X, Y);
  };
  const xsOf = () => (st.quads === 1 ? [0, 1, 2, 3, 4] : [-2, -1, 0, 1, 2]);
  const pt = () => `(${svgText(cur.x)}, ${svgText(cur.y)})`;
  const toggle = () => {
    const i = st.points.findIndex(p => p.x === cur.x && p.y === cur.y);
    if (i >= 0) st.points.splice(i, 1); else st.points = [...st.points, { ...cur }].slice(-20);
    T.commit(fill(i >= 0 ? W.unplotted : W.plotted, { p: iso(pt()) }));
    plane.focus();
  };
  function wire(lo, hi, X, Y) {
    if (ctx.editing) return;
    plane.addEventListener('keydown', e => {
      const d = { ArrowRight: [1, 0], ArrowLeft: [-1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] }[e.key];
      if (d) { e.preventDefault(); cur = { x: Math.max(lo, Math.min(hi, cur.x + d[0])), y: Math.max(lo, Math.min(hi, cur.y + d[1])) }; T.draw(); plane.focus(); ctx.say(pt()); }
      else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); }
    });
    plane.addEventListener('click', e => {
      const { x: vx, y: vy } = svgPoint(plane, e);
      const u = (520 - 80) / (hi - lo);
      cur = { x: Math.max(lo, Math.min(hi, Math.round(lo + (vx - 40) / u))), y: Math.max(lo, Math.min(hi, Math.round(lo + (520 - 40 - vy) / u))) };
      toggle();
    });
  }
  return T.finish({
    options: box => {
      const q = field(box, W.quads, selectOf([[4, W.four], [1, W.one]], st.quads));
      const sz = field(box, W.size, selectOf([[5, '5'], [10, '10']], st.size));
      q.addEventListener('change', () => { st.quads = +q.value; st.points = []; T.commit(); });
      sz.addEventListener('change', () => { st.size = +sz.value; st.points = []; T.commit(); });
      checkRow(box, W.line, st.line, v => { st.line = v; T.commit(); });
      checkRow(box, W.table, st.table, v => { st.table = v; T.commit(); });
      const c = btn(`🧹 ${W.clear}`); c.addEventListener('click', () => { st.points = []; T.commit(W.clear); }); box.appendChild(c);
    },
  });
}

// ================================================================ 4. graph maker
const GRAPH_ICONS = ['🍎', '⭐', '🐶', '🐱', '⚽', '🌻', '🚌', '📚', '🍕', '🐟', '🎈', '❤️'];
function graph(body, s, ctx) {
  const T = shell(body, s, ctx, 'graph'), { W, st } = T;
  const kinds = T.seg(W.kind, [['bar', W.bar, null, '📊'], ['line', W.line, null, '📈'], ['picture', W.picture, null, '🍎'], ['dot', W.dot, null, '⚫']], () => st.kind, v => { st.kind = v; T.commit(W[v]); });
  T.top.appendChild(kinds);
  const labelOf = (r, i) => r.l || String.fromCharCode(65 + i);
  T.draw = () => {
    kinds.sync();
    T.stage.textContent = '';
    const rows = st.rows.length ? st.rows : [];
    if (st.title) { const h = el('div', 'dt-gtitle', st.title); h.dir = 'auto'; T.stage.appendChild(h); }
    if (!rows.length) { T.stage.appendChild(el('p', 'dw-empty', W.empty)); T.read.textContent = ''; return; }
    const max = Math.max(...rows.map(r => r.v));
    const n = rows.length, Wd = 640, H = 360, L = 56, R = 16, Tp = 18, cw = (Wd - L - R) / n;
    // The title sits above the chart, so the chart is drawn a little smaller than its viewBox suggests: measure with room.
    const ts = T.ts(Wd, H + 70, 20, document.body.classList.contains('dash-projector') ? 11.5 : 13);
    // Category labels are never cut: they wrap onto two lines (three at most) and shrink, never below 12px (13 on the
    // projector).
    const px = T.scale(Wd, H + 70) || 1, floor = (document.body.classList.contains('dash-projector') ? 15 : 13.5) / px;
    // Whole words only: a word longer than the column means the labels turn instead.
    const wrap = (text, f, max) => {
      const room = Math.max(1, Math.floor((cw * 0.94) / (f * 0.58))), out = [];
      for (const word of String(text).split(/\s+/)) {
        if ([...word].length > room) return null;
        if (out.length && [...`${out[out.length - 1]} ${word}`].length <= room) out[out.length - 1] += ` ${word}`; else out.push(word);
      }
      return out.length <= max ? out : null;
    };
    let lf = Math.max(20, floor), lines = null, turn = false;
    for (let f = Math.max(20, floor); f >= floor - 1e-6; f -= 1) { const all = rows.map((r, i) => wrap(labelOf(r, i), f, 2)); if (all.every(Boolean)) { lf = f; lines = all; break; } }
    if (!lines) { turn = true; lf = Math.max(floor, Math.min(20, cw * 0.55)); lines = rows.map((r, i) => [labelOf(r, i)]); }
    const longest = Math.max(...rows.map((r, i) => [...labelOf(r, i)].length));
    const B = turn ? 16 + longest * lf * 0.58 * Math.sin(Math.PI / 4) + lf : 14 + Math.max(...lines.map(x => x.length)) * lf * 1.15 + 6;
    const g = svg('svg', { viewBox: `0 0 ${Wd} ${H}`, class: 'dt-graph', style: `--ts:${ts.toFixed(3)}`, role: 'img', 'aria-label': `${W[st.kind]}: ${rows.map((r, i) => `${labelOf(r, i)} ${r.v}`).join(', ')}` });
    g.setAttribute('direction', 'ltr');
    const sc = st.kind === 'picture' ? M.niceScale(Math.ceil(max / st.per)) : st.kind === 'dot' ? { top: Math.max(1, Math.min(max, 20)), step: max > 10 ? 2 : 1 } : M.niceScale(max);
    const Y = v => H - B - (v / sc.top) * (H - B - Tp);
    if (st.kind === 'bar' || st.kind === 'line') {
      for (let v = 0; v <= sc.top; v += sc.step) {
        g.appendChild(svg('line', { x1: L, x2: Wd - R, y1: Y(v), y2: Y(v), class: v ? 'dt-gridl' : 'dt-axis' }));
        g.appendChild(svg('text', { x: L - 10, y: Y(v) + 6, class: 'dt-cl', 'text-anchor': 'end' }, v));
      }
    } else g.appendChild(svg('line', { x1: L - 20, x2: Wd - R, y1: H - B, y2: H - B, class: 'dt-axis' }));
    const pts = [];
    rows.forEach((r, i) => {
      const cx = L + cw * (i + 0.5);
      if (st.kind === 'bar') {
        const bw = Math.min(90, cw * 0.62);
        g.appendChild(svg('rect', { x: cx - bw / 2, y: Y(r.v), width: bw, height: Math.max(0, H - B - Y(r.v)), rx: 6, class: `dt-gbar dt-c${i % FCOLORS}` }));
        g.appendChild(svg('text', { x: cx, y: Y(r.v) - 8, class: 'dt-gv', 'text-anchor': 'middle' }, r.v));
      } else if (st.kind === 'line') pts.push([cx, Y(r.v), r.v]);
      else if (st.kind === 'picture') {
        const icon = GRAPH_ICONS[st.icon] || '🍎', size = Math.min(cw * 0.8, (H - B - Tp) / Math.max(1, sc.top), 40);
        const whole = Math.floor(r.v / st.per), part = (r.v % st.per) / st.per;
        for (let k = 0; k < whole + (part ? 1 : 0); k++) {
          const y = H - B - (k + 1) * size;
          if (k === whole && part) {
            const id = `dtc${Math.random().toString(36).slice(2, 8)}`;
            const cp = svg('clipPath', { id }); cp.appendChild(svg('rect', { x: cx - size / 2, y: y - 2, width: size * part, height: size + 4 })); g.appendChild(cp);
            g.appendChild(svg('text', { x: cx, y: y + size * 0.82, 'font-size': size * 0.85, 'text-anchor': 'middle', 'clip-path': `url(#${id})` }, icon));
          } else g.appendChild(svg('text', { x: cx, y: y + size * 0.82, 'font-size': size * 0.85, 'text-anchor': 'middle' }, icon));
        }
      } else {
        const shown = Math.min(r.v, 20), size = Math.min(cw * 0.6, (H - B - Tp) / Math.max(sc.top, 1), 28);
        for (let k = 0; k < shown; k++) g.appendChild(svg('circle', { cx, cy: H - B - (k + 0.5) * size, r: size * 0.4, class: `dt-gdot dt-c${i % FCOLORS}` }));
        if (r.v > 20) g.appendChild(svg('text', { x: cx, y: H - B - 20.5 * size - 4, class: 'dt-gv', 'text-anchor': 'middle' }, r.v));
      }
      const ly = H - B + 10 + lf;
      const lab = svg('text', turn ? { x: cx, y: H - B + 14, class: 'dt-gl', 'text-anchor': 'end', transform: `rotate(-45 ${cx} ${H - B + 14})`, style: `font-size:${lf.toFixed(2)}px`, 'dominant-baseline': 'hanging' } : { x: cx, y: ly, class: 'dt-gl', 'text-anchor': 'middle', style: `font-size:${lf.toFixed(2)}px` });
      lines[i].forEach((ln, k) => lab.appendChild(svg('tspan', { x: cx, dy: k ? lf * 1.15 : 0 }, ln)));
      g.appendChild(lab);
    });
    if (pts.length) {
      g.appendChild(svg('polyline', { points: pts.map(p => `${p[0]},${p[1]}`).join(' '), class: 'dt-gline' }));
      for (const p of pts) { g.appendChild(svg('circle', { cx: p[0], cy: p[1], r: 8, class: 'dt-gpt' })); g.appendChild(svg('text', { x: p[0], y: p[1] - 14, class: 'dt-gv', 'text-anchor': 'middle' }, p[2])); }
    }
    T.stage.appendChild(g);
    // The same numbers as a table, for screen readers.
    const tb = el('table', 'sr-only');
    rows.forEach((r, i) => { const tr = el('tr'); tr.append(el('th', null, labelOf(r, i)), el('td', null, String(r.v))); tb.appendChild(tr); });
    T.stage.appendChild(tb);
    T.read.textContent = '';
    if (st.kind === 'picture') T.read.appendChild(el('div', 'dt-sub', fill(W.key, { icon: GRAPH_ICONS[st.icon] || '🍎', n: st.per })));
    else if (st.kind === 'dot') T.read.appendChild(el('div', 'dt-sub', fill(W.key, { icon: '●', n: 1 })));
  };
  return T.finish({
    options: (box, sh) => {
      const title = field(box, W.title, Object.assign(el('input', 'input'), { maxLength: 60, value: st.title }));
      title.dir = 'auto';
      title.addEventListener('input', () => { st.title = title.value; T.commit(); });
      const list = el('ol', 'plain dash-prows dt-grows'); const lab = el('span', 'dash-lab', W.data);
      box.append(lab, list);
      const drawRows = () => {
        list.textContent = '';
        st.rows.forEach((r, i) => {
          const li = el('li', 'dash-perrow');
          const l = Object.assign(el('input', 'input dash-pername'), { maxLength: 24, value: r.l, placeholder: labelOf({}, i) }); l.dir = 'auto'; l.setAttribute('aria-label', `${W.label} ${i + 1}`);
          const v = numberIn(r.v, 0, 999); v.setAttribute('aria-label', `${W.value} ${i + 1}`); v.classList.add('dt-gnum');
          const x = btn('✖', 'btn btn-sm dash-perrm', `${W.removeRow} ${i + 1}`);
          l.addEventListener('input', () => { r.l = l.value; T.commit(); });
          v.addEventListener('change', () => { r.v = Math.max(0, Math.min(999, Math.round(+v.value) || 0)); v.value = r.v; T.commit(); });
          x.addEventListener('click', () => { st.rows.splice(i, 1); T.commit(); drawRows(); list.querySelector('input')?.focus(); });
          li.append(l, x, v); list.appendChild(li);
        });
        addB.disabled = st.rows.length >= 12;
      };
      const addB = btn(`➕ ${W.addRow}`);
      addB.addEventListener('click', () => { if (st.rows.length < 12) { st.rows.push({ l: '', v: 0 }); T.commit(); drawRows(); list.querySelectorAll('input.dash-pername')[st.rows.length - 1]?.focus(); } });
      box.appendChild(addB);
      drawRows();
      const icon = field(box, W.icon, selectOf(GRAPH_ICONS.map((x, i) => [i, x]), st.icon));
      icon.addEventListener('change', () => { st.icon = +icon.value; T.commit(); });
      const per = field(box, W.per, selectOf([1, 2, 5, 10].map(n => [n, String(n)]), st.per));
      per.addEventListener('change', () => { st.per = +per.value; T.commit(); });
      // From a quick check: its totals only (never who answered what).
      if (ctx.teacher && !ctx.copy && ctx.checks) {
        const sel = field(box, W.fromCheck, selectOf([['', '…']], ''));
        box.appendChild(el('p', 'small muted', W.counts));
        ctx.checks().then(list2 => {
          if (!list2.length) { sel.innerHTML = ''; sel.appendChild(Object.assign(el('option', null, W.noChecks), { value: '' })); sel.disabled = true; return; }
          list2.forEach((c, i) => sel.appendChild(Object.assign(el('option', null, c.title), { value: String(i) })));
          sel.addEventListener('change', () => {
            const c = list2[+sel.value]; if (!c) return;
            st.rows = c.rows.slice(0, 12).map(r => ({ l: r.l.slice(0, 24), v: Math.max(0, Math.min(999, r.v)) }));
            if (!st.title) st.title = c.q.slice(0, 60);
            title.value = st.title; T.commit(); drawRows();
          });
        }).catch(() => {});
      }
      return sh;
    },
  });
}

// ================================================================ 5. base-ten blocks
function base10(body, s, ctx) {
  const T = shell(body, s, ctx, 'base10'), { W, st } = T;
  const PL = [['h', W.hundreds, 100], ['t', W.tens, 10], ['o', W.ones, 1]];
  let sel = 'o';
  const mats = el('div', 'dt-mats');
  T.stage.appendChild(mats);
  const up = btn('', 'btn btn-sm'), down = btn('', 'btn btn-sm');
  up.addEventListener('click', () => doTrade('up')); down.addEventListener('click', () => doTrade('down'));
  const clear = btn(`🧹 ${W.clear}`, 'btn btn-sm');
  clear.addEventListener('click', () => { Object.assign(st, { h: 0, t: 0, o: 0 }); T.commit(W.clear); });
  T.foot.append(up, down, clear);
  const say = () => ctx.say(`${M.blocksValue(st)}: ${st.h} ${W.hundreds}, ${st.t} ${W.tens}, ${st.o} ${W.ones}`);
  const change = (p, d) => { const n = st[p] + d; if (n < 0 || n > M.BASE10_MAX[p]) return false; st[p] = n; sel = p; T.commit(); say(); return true; };
  const tradeFor = dir => (dir === 'up' ? (sel === 'h' ? null : sel === 't' ? ['t', 'up'] : ['o', 'up']) : (sel === 'o' ? null : [sel, 'down']));
  const doTrade = dir => {
    let tr = tradeFor(dir); if (!tr) tr = dir === 'up' ? ['o', 'up'] : ['t', 'down'];
    const x = M.trade(st, tr[0], tr[1]); if (!x) return;
    Object.assign(st, x); T.commit(); ctx.say(`${W.traded} ${M.blocksValue(st)}: ${st.h} ${W.hundreds}, ${st.t} ${W.tens}, ${st.o} ${W.ones}`);
  };
  /** Drag a block in from the header (or out of the mat to take it away). */
  let drag = null;
  const ghost = el('div', 'dt-ghost'); ghost.hidden = true; ghost.setAttribute('aria-hidden', 'true');
  body.appendChild(ghost);
  T.draw = () => {
    mats.textContent = '';
    for (const [p, name] of PL) {
      const col = el('section', `dt-mat${sel === p ? ' is-sel' : ''}`); col.dataset.place = p;
      const head = el('div', 'dt-mathead');
      const piece = el('span', `dt-piece dt-piece-${p}`); piece.setAttribute('aria-hidden', 'true'); piece.title = W.drop;
      head.append(piece, el('b', 'dt-matname', name), ltr('span', 'dt-matn', String(st[p])));
      const area = el('div', 'dt-matarea'); area.setAttribute('role', 'img'); area.setAttribute('aria-label', `${st[p]} ${name}`);
      area.appendChild(blocksSvg(p, st[p]));
      const pm = el('div', 'dt-fpm');
      const minus = btn('−', 'btn btn-sm dt-pm', `${W.take} (${name})`), plus = btn('+', 'btn btn-sm dt-pm', `${W.add} (${name})`);
      minus.disabled = st[p] <= 0; plus.disabled = st[p] >= M.BASE10_MAX[p];
      minus.addEventListener('click', () => change(p, -1)); plus.addEventListener('click', () => change(p, 1));
      for (const b of [minus, plus]) b.addEventListener('focus', () => { if (sel !== p) { sel = p; syncSel(); } });
      pm.append(minus, plus);
      col.append(head, area, pm);
      col.addEventListener('pointerdown', e => {
        if (ctx.editing || e.target.closest('button')) return;
        sel = p; syncSel();
        const fromPiece = !!e.target.closest('.dt-piece'), fromArea = !!e.target.closest('.dt-matarea') && st[p] > 0;
        if (!fromPiece && !fromArea) return;
        drag = { p, add: fromPiece, id: e.pointerId, x: e.clientX, y: e.clientY, moved: false };
        col.setPointerCapture(e.pointerId); e.preventDefault();
      });
      col.addEventListener('pointermove', e => {
        if (!drag || drag.id !== e.pointerId) return;
        if (!drag.moved && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 6) return;
        drag.moved = true;
        ghost.hidden = false; ghost.className = `dt-ghost dt-piece dt-piece-${drag.p}`;
        const r = body.getBoundingClientRect();
        ghost.style.left = `${e.clientX - r.left}px`; ghost.style.top = `${e.clientY - r.top}px`;
      });
      const end = e => {
        if (!drag || drag.id !== e.pointerId) return;
        const d = drag; drag = null; ghost.hidden = true;
        const over = document.elementFromPoint(e.clientX, e.clientY)?.closest('.dt-mat');
        if (!d.moved) { if (d.add) change(d.p, 1); return; }
        if (d.add && over && over.dataset.place === d.p && mats.contains(over)) change(d.p, 1);
        else if (!d.add && !(over && mats.contains(over))) change(d.p, -1);
      };
      col.addEventListener('pointerup', end); col.addEventListener('pointercancel', () => { drag = null; ghost.hidden = true; });
      mats.appendChild(col);
    }
    syncSel();
    const v = M.blocksValue(st);
    T.read.textContent = '';
    T.read.append(ltr('div', 'dt-big', String(v)), ltr('div', 'dt-sub', `${st.h * 100} + ${st.t * 10} + ${st.o}`));
    if (st.o >= 10 || st.t >= 10) T.read.appendChild(el('div', 'dt-sub dt-note', W.hint));
  };
  function syncSel() {
    for (const c of mats.children) c.classList.toggle('is-sel', c.dataset.place === sel);
    const u = tradeFor('up') || ['o', 'up'], d = tradeFor('down') || ['t', 'down'];
    up.textContent = u[0] === 't' ? W.tradeUpT : W.tradeUp; down.textContent = d[0] === 'h' ? W.tradeDownH : W.tradeDown;
    up.disabled = !M.trade(st, u[0], u[1]); down.disabled = !M.trade(st, d[0], d[1]);
    clear.disabled = !M.blocksValue(st);
  }
  return T.finish();
}
/** Flats (10 x 10), rods (1 x 10) or unit cubes, all drawn with the same unit (a cube is as wide as a rod; a flat is ten
 *  rods), so the sizes compare as they should. Flats pile up with an offset, so each one's edge shows. */
const U = 6;
function blocksSvg(p, n) {
  const sv = svg('svg', { viewBox: '0 0 100 132', class: 'dt-blocks', 'aria-hidden': 'true' });
  const lines = (x, y, w, h, across, down) => { let d = ''; for (let k = 1; k < 10; k++) { if (down) d += `M${x + (k * w) / 10} ${y}v${h}`; if (across) d += `M${x} ${y + (k * h) / 10}h${w}`; } return svg('path', { d, class: 'dt-blkline' }); };
  if (p === 'h') {
    for (let i = 0; i < n; i++) {
      const x = 4 + i * 3.8, y = 130 - 10 * U - i * 3.8;
      sv.appendChild(svg('rect', { x, y, width: 10 * U, height: 10 * U, class: 'dt-blk dt-blk-h' }));
      sv.appendChild(lines(x, y, 10 * U, 10 * U, true, true));
    }
  } else if (p === 't') {
    for (let i = 0; i < n; i++) {
      const x = 4 + (i % 10) * (U + 2.4), y = 130 - (Math.floor(i / 10) + 1) * (10 * U + 4) + 2;
      sv.appendChild(svg('rect', { x, y, width: U, height: 10 * U, class: 'dt-blk dt-blk-t' }));
      sv.appendChild(lines(x, y, U, 10 * U, true, false));
    }
  } else {
    for (let i = 0; i < n; i++) { const x = 4 + (i % 5) * (U + 2.4), y = 130 - (Math.floor(i / 5) + 1) * (U + 2.4); sv.appendChild(svg('rect', { x, y, width: U, height: U, class: 'dt-blk dt-blk-o' })); }
  }
  return sv;
}

// ================================================================ 6. place value chart
const DISC = ['1000', '100', '10', '1', '0.1', '0.01', '0.001'];
function placeval(body, s, ctx) {
  const T = shell(body, s, ctx, 'placeval'), { W, st } = T;
  let sel = 3;
  const cols = () => (st.dec ? [0, 1, 2, 3, 4, 5, 6] : [0, 1, 2, 3]);
  const name = i => W[M.PLACES[i].k];
  const minus = btn('−', 'btn btn-sm dt-pm'), plus = btn('+', 'btn btn-sm dt-pm'), x10 = btn('× 10', 'btn btn-sm', W.times10), d10 = btn('÷ 10', 'btn btn-sm', W.div10);
  const set = (v, msg) => { if (v === null) return; st.v = v; T.commit(); ctx.say(`${M.pvFormat(st.v, ctx.intl)}${msg ? `. ${msg}` : ''}`); };
  minus.addEventListener('click', () => set(M.pvAdd(st.v, sel, -1)));
  plus.addEventListener('click', () => set(M.pvAdd(st.v, sel, 1)));
  x10.addEventListener('click', () => set(M.pvTimes10(st.v), W.times10));
  d10.addEventListener('click', () => set(st.dec ? M.pvDiv10(st.v) : null, W.div10));
  T.foot.append(minus, plus, x10, d10);
  const nf = new Intl.NumberFormat(ctx.intl, { maximumFractionDigits: 3 });
  T.draw = () => {
    if (!cols().includes(sel)) sel = 3;
    const dg = M.pvDigits(st.v);
    T.stage.textContent = '';
    const chart = el('div', `dt-pv${st.discs ? ' has-discs' : ''}`); chart.dir = 'ltr';
    chart.setAttribute('role', 'group'); chart.setAttribute('aria-label', ctx.type.name);
    const cells = [];
    for (const i of cols()) {
      if (i === 4) chart.appendChild(el('span', 'dt-pvdot', '.'));
      const c = el('div', `dt-pvcol dt-pv${i}${i === sel ? ' is-sel' : ''}`);
      c.setAttribute('role', 'spinbutton'); c.setAttribute('aria-label', name(i)); c.setAttribute('aria-valuenow', String(dg[i])); c.setAttribute('aria-valuemin', '0'); c.setAttribute('aria-valuemax', '9');
      c.tabIndex = i === sel && !ctx.editing ? 0 : -1;
      const head = el('div', 'dt-pvh', name(i)); head.dir = 'auto';
      const discs = el('div', 'dt-pvdiscs'); discs.setAttribute('aria-hidden', 'true');
      if (st.discs) for (let k = 0; k < dg[i]; k++) discs.appendChild(el('span', `dt-disc dt-disc${i}`)).appendChild(el('span', 'dt-disct', DISC[i]));
      c.append(head, discs, el('div', 'dt-pvd', String(dg[i])));
      c.addEventListener('click', () => { if (ctx.editing) return; sel = i; syncSel(); c.focus(); });
      c.addEventListener('focus', () => { if (sel !== i) { sel = i; syncSel(); } });
      c.addEventListener('keydown', e => {
        if (e.key === 'ArrowUp' || e.key === '+') { e.preventDefault(); set(M.pvAdd(st.v, i, 1)); focusSel(); }
        else if (e.key === 'ArrowDown' || e.key === '-') { e.preventDefault(); set(M.pvAdd(st.v, i, -1)); focusSel(); }
      });
      chart.appendChild(c); cells.push(c);
    }
    roving(chart, cells, cells.length, j => { sel = cols()[j]; syncSel(); });
    T.stage.appendChild(chart);
    T.read.textContent = '';
    const ex = M.pvExpanded(st.v).map(x => nf.format(x.value)).join(' + ') || '0';
    T.read.append(ltr('div', 'dt-big', M.pvFormat(st.v, ctx.intl)), ltr('div', 'dt-sub', `${W.expanded}: ${ex}`));
    syncSel();
  };
  const focusSel = () => T.stage.querySelector('.dt-pvcol.is-sel')?.focus();
  function syncSel() {
    for (const c of T.stage.querySelectorAll('.dt-pvcol')) { const on = c.classList.contains(`dt-pv${sel}`); c.classList.toggle('is-sel', on); c.tabIndex = on && !ctx.editing ? 0 : -1; }
    minus.setAttribute('aria-label', `${W.less}: ${name(sel)}`); plus.setAttribute('aria-label', `${W.more}: ${name(sel)}`);
    minus.title = minus.getAttribute('aria-label'); plus.title = plus.getAttribute('aria-label');
    minus.disabled = M.pvAdd(st.v, sel, -1) === null; plus.disabled = M.pvAdd(st.v, sel, 1) === null;
    x10.disabled = M.pvTimes10(st.v) === null; d10.disabled = !st.dec || M.pvDiv10(st.v) === null;
  }
  return T.finish({
    options: box => {
      checkRow(box, W.discs, st.discs, v => { st.discs = v; T.commit(); });
      checkRow(box, W.decimals, st.dec, v => { st.dec = v; if (!v) st.v -= st.v % 1000; T.commit(); });
      const c = btn(`🧹 ${W.clear}`); c.addEventListener('click', () => { st.v = 0; T.commit(W.clear); }); box.appendChild(c);
    },
  });
}

// ================================================================ 7. ten frames and counters
function tenframe(body, s, ctx) {
  const T = shell(body, s, ctx, 'tenframe'), { W, st } = T;
  const addR = btn(`🔴 +`, 'btn btn-sm', `${W.red} +`), addY = btn(`🟡 +`, 'btn btn-sm', `${W.yellow} +`), take = btn(`➖ ${W.take}`, 'btn btn-sm'), clear = btn(`🧹 ${W.clear}`, 'btn btn-sm');
  const n = () => st.frames * 10;
  const counts = () => { const c = st.cells.slice(0, n()); return { r: c.filter(x => x === 1).length, y: c.filter(x => x === 2).length }; };
  const say = () => { const c = counts(); ctx.say(fill(W.counts, { r: c.r, y: c.y, n: c.r + c.y })); };
  const put = color => { const i = st.cells.slice(0, n()).indexOf(0); if (i < 0) return; st.cells[i] = color; T.commit(); say(); };
  addR.addEventListener('click', () => put(1)); addY.addEventListener('click', () => put(2));
  take.addEventListener('click', () => { for (let i = n() - 1; i >= 0; i--) if (st.cells[i]) { st.cells[i] = 0; T.commit(); say(); return; } });
  clear.addEventListener('click', () => { st.cells = st.cells.map(() => 0); T.commit(W.clear); });
  T.foot.append(addR, addY, take, clear);
  let focusAt = -1;
  T.draw = () => {
    const c = counts(), full = c.r + c.y, wasHere = !!document.activeElement?.classList?.contains('dt-tfcell') && body.contains(document.activeElement);
    addR.disabled = addY.disabled = full >= n(); take.disabled = clear.disabled = !full;
    T.stage.textContent = '';
    const wrap = el('div', 'dt-tfwrap'); wrap.dir = 'ltr';
    const cells = [];
    for (let f = 0; f < st.frames; f++) {
      const fr = el('div', 'dt-tf'); fr.setAttribute('role', 'group'); fr.setAttribute('aria-label', `${W.frames} ${f + 1}`);
      for (let k = 0; k < 10; k++) {
        const i = f * 10 + k, v = st.cells[i] || 0;
        const b = btn('', `dt-tfcell${v ? ` has-${v === 1 ? 'r' : 'y'}` : ''}`, `${fill(W.cell, { n: i + 1 })}: ${v === 1 ? W.red : v === 2 ? W.yellow : W.empty}`);
        b.title = '';
        b.removeAttribute('title');
        if (ctx.editing) b.disabled = true;
        b.addEventListener('click', () => { st.cells[i] = ((st.cells[i] || 0) + 1) % 3; focusAt = i; T.commit(); say(); });
        fr.appendChild(b); cells.push(b);
      }
      wrap.appendChild(fr);
    }
    if (cells.length && !ctx.editing) { cells.forEach(x => { x.tabIndex = -1; }); (cells[focusAt] || cells[0]).tabIndex = 0; roving(wrap, cells, 5, j => { focusAt = j; }); }
    T.stage.appendChild(wrap);
    if (focusAt >= 0 && cells[focusAt] && wasHere) cells[focusAt].focus();
    T.read.textContent = '';
    const big = ltr('div', 'dt-big', `${c.r} + ${c.y} = ${full}`);
    T.read.appendChild(big);
    if (st.bond) {
      const bond = el('div', 'dt-bond'); bond.dir = 'ltr'; bond.setAttribute('aria-label', `${W.bond}: ${full} = ${c.r} + ${c.y}`); bond.setAttribute('role', 'img');
      const sv = svg('svg', { viewBox: '0 0 120 80', 'aria-hidden': 'true' });
      sv.append(svg('line', { x1: 60, y1: 22, x2: 26, y2: 58, class: 'dt-bondl' }), svg('line', { x1: 60, y1: 22, x2: 94, y2: 58, class: 'dt-bondl' }));
      for (const [x, y, v, cls] of [[60, 20, full, 'dt-bw'], [26, 60, c.r, 'dt-br'], [94, 60, c.y, 'dt-by']]) { sv.appendChild(svg('circle', { cx: x, cy: y, r: 17, class: `dt-bondc ${cls}` })); sv.appendChild(svg('text', { x, y: y + 6, 'text-anchor': 'middle', class: 'dt-bondt' }, v)); }
      bond.appendChild(sv); T.read.appendChild(bond);
    }
    const toTen = 10 - (full % 10);
    T.read.appendChild(el('div', 'dt-sub', full && full % 10 ? fill(W.makeTen, { n: toTen }) : ''));
  };
  return T.finish({
    options: box => {
      const fr = field(box, W.frames, selectOf([[1, '1'], [2, '2']], st.frames));
      fr.addEventListener('change', () => { st.frames = +fr.value; for (let i = st.frames * 10; i < 20; i++) st.cells[i] = 0; T.commit(); });
      checkRow(box, W.bond, st.bond, v => { st.bond = v; T.commit(); });
      const flip = btn(`🔄 ${W.flip}`); flip.addEventListener('click', () => { st.cells = st.cells.map(x => (x === 1 ? 2 : x === 2 ? 1 : 0)); T.commit(W.flip); }); box.appendChild(flip);
      const fillB = btn(`🔴 ${W.fill}`); fillB.addEventListener('click', () => { st.cells = st.cells.map((x, i) => (i < n() ? x || 1 : 0)); T.commit(W.fill); }); box.appendChild(fillB);
    },
  });
}

// ================================================================ 8. hundreds chart
function hundreds(body, s, ctx) {
  const T = shell(body, s, ctx, 'hundreds'), { W, st } = T;
  // Maths tools combined: the chart also runs 1-120 (upto; from 1 only), twelve rows of ten.
  const last = () => (st.start && st.upto === 120 ? 120 : st.start ? 100 : 99);
  const skip = selectOf([[0, W.noSkip], ...[2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => [n, fill(W.skipBy, { n })])], st.skip);
  skip.classList.add('dt-select'); skip.setAttribute('aria-label', W.skip);
  skip.addEventListener('change', () => { st.skip = +skip.value; T.commit(st.skip ? `${fill(W.skipBy, { n: st.skip })}: ${M.skipCount(st.skip, st.start, last()).slice(0, 5).join(', ')}…` : W.noSkip); });
  const hide = selectOf([['none', W.none], ['shaded', W.shaded], ['all', W.all]], st.hide);
  hide.classList.add('dt-select'); hide.setAttribute('aria-label', W.hide);
  hide.addEventListener('change', () => { st.hide = hide.value; T.commit(); });
  const clear = btn(`🧹 ${W.clear}`, 'btn btn-sm');
  clear.addEventListener('click', () => { st.shade = []; st.skip = 0; T.commit(W.clear); });
  T.foot.append(skip, hide, clear);
  let focusAt = 0;
  T.draw = () => {
    skip.value = String(st.skip); hide.value = st.hide; clear.disabled = !st.shade.length && !st.skip;
    const shaded = new Set(st.shade), counted = new Set(M.skipCount(st.skip, st.start, last()));
    T.stage.textContent = '';
    const g = el('div', `dt-hgrid${last() === 120 ? ' is-120' : ''}`); g.dir = 'ltr'; g.setAttribute('role', 'group'); g.setAttribute('aria-label', ctx.type.name);
    const cells = [];
    for (let k = 0; k <= last() - st.start; k++) {
      const v = k + st.start, on = shaded.has(v), sk = counted.has(v);
      const hid = st.hide === 'all' || (st.hide === 'shaded' && (on || sk));
      const b = btn(hid ? '' : String(v), `dt-hcell${on ? ' is-on' : ''}${sk ? ' is-skip' : ''}`);
      b.setAttribute('aria-label', `${hid ? W.hidden : v}${on ? `, ${W.shaded}` : ''}${sk ? `, ${fill(W.skipBy, { n: st.skip })}` : ''}`);
      b.setAttribute('aria-pressed', String(on));
      if (ctx.editing) b.disabled = true;
      b.addEventListener('click', () => {
        st.shade = on ? st.shade.filter(x => x !== v) : [...st.shade, v].sort((a, c) => a - c);
        focusAt = k; T.commit(`${hid ? W.hidden : v}${on ? '' : `, ${W.shaded}`}`);
        T.stage.querySelectorAll('.dt-hcell')[k]?.focus();
      });
      g.appendChild(b); cells.push(b);
    }
    cells.forEach((c, i) => { c.tabIndex = i === focusAt ? 0 : -1; });
    if (!ctx.editing) roving(g, cells, 10, j => { focusAt = j; });
    T.stage.appendChild(g);
    T.read.textContent = '';
    T.read.appendChild(el('div', 'dt-sub', [st.shade.length ? fill(W.shadedN, { n: st.shade.length }) : '', st.skip ? `${fill(W.skipBy, { n: st.skip })}: ${M.skipCount(st.skip, st.start, last()).slice(0, 4).join(', ')}…` : ''].filter(Boolean).join(' · ') || ' '));
  };
  return T.finish({
    options: box => {
      const start = field(box, W.start, selectOf([[1, '1–100'], [0, '0–99'], [120, '1–120']], st.start && st.upto === 120 ? 120 : st.start));
      start.addEventListener('change', () => {
        const v = +start.value; st.start = v ? 1 : 0; if (v === 120) st.upto = 120; else delete st.upto;
        st.shade = st.shade.filter(x => x >= st.start && x <= last()); T.commit();
      });
    },
  });
}

// ================================================================ 9. area model and arrays
function area(body, s, ctx) {
  const T = shell(body, s, ctx, 'area'), { W, st } = T;
  const view = () => (st.a > 12 || st.b > 12 ? 'area' : st.view);
  const fix = () => { if (st.sa >= st.a) st.sa = 0; if (st.sb >= st.b) st.sb = 0; };
  const pp = () => M.partialProducts(st.a, st.b, st.sa, st.sb);
  const sayIt = () => { const r = pp(); return `${st.a} × ${st.b} = ${r.total}${r.parts.length > 1 ? `: ${r.parts.map(x => `${x.a} × ${x.b}`).join(' + ')}` : ''}`; };
  const views = T.seg(W.array, [['array', `⁙ ${W.array}`], ['area', `▦ ${W.area}`]], () => view(), v => { st.view = v; T.commit(); });
  const rows = T.stepper(W.rows, () => st.a, () => { if (st.a > 1) { st.a--; fix(); T.commit(sayIt()); } }, () => { if (st.a < 99) { st.a++; T.commit(sayIt()); } }, `${W.rows} −`, `${W.rows} +`);
  const cols = T.stepper(W.cols, () => st.b, () => { if (st.b > 1) { st.b--; fix(); T.commit(sayIt()); } }, () => { if (st.b < 99) { st.b++; T.commit(sayIt()); } }, `${W.cols} −`, `${W.cols} +`);
  T.top.append(views, rows, cols);
  const split = T.toggle(`✂️ ${W.place}`, null, () => st.sa || st.sb, v => { st.sa = v ? M.placeSplit(st.a) : 0; st.sb = v ? M.placeSplit(st.b) : 0; if (v && !st.sa && !st.sb) { st.sb = Math.ceil(st.b / 2) < st.b ? Math.ceil(st.b / 2) : 0; } T.commit(sayIt()); });
  T.foot.appendChild(split);
  T.draw = () => {
    views.sync(); rows.sync(); cols.sync(); split.sync();
    views.querySelectorAll('button')[0].disabled = st.a > 12 || st.b > 12;
    const r = pp(), V = view();
    const pad = 46, maxW = 560, maxH = 400, k = Math.min((maxW - pad) / st.b, (maxH - pad) / st.a);
    const w = st.b * k, h = st.a * k;
    // Partial products go inside their part when they fit at a readable size (14px, 16 on the projector); a part too
    // small for its label gets it outside, with a leader line: to the right, or below for the bottom row.
    const tw = (str, f) => [...String(str)].length * f * 0.6;
    let mR = 0, mB = 0, px = 0, place = [];
    for (let pass = 0; pass < 3; pass++) {
      px = T.scale(w + pad + 8 + mR, h + pad + 8 + mB) || 1;
      const fMin = T.minPx() / px;
      place = []; let needR = 0, nB = 0;
      if (V === 'area') {
        let y = Y0of(pad);
        r.rows.forEach((ra, i) => {
          let x = pad;
          r.cols.forEach((cb, j) => {
            const part = r.parts.find(p => p.i === i && p.j === j), cw = cb * k, ch = ra * k, top = `${part.a} × ${part.b}`;
            const fs = Math.min(Math.max(34, fMin * 1.6), cw / ([...String(part.p)].length * 0.62), ch / 2.3, (cw - 8) / (top.length * 0.6 * 0.72));
            if (fs * 0.72 >= fMin) place.push({ part, inside: true, x, y, cw, ch, fs, top });
            else {
              const below = i === r.rows.length - 1 && r.rows.length > 1, fo = fMin * 1.1, text = `${top} = ${part.p}`;
              place.push({ part, inside: false, below, x, y, cw, ch, fo, text, line: below ? nB++ : 0 });
              if (!below) needR = Math.max(needR, tw(text, fo) + 28);
            }
            x += cw;
          });
          y += ra * k;
        });
      }
      const fo = fMin * 1.1, wantR = Math.ceil(needR), wantB = Math.ceil(nB ? nB * fo * 1.5 + 14 : 0);
      if (wantR === mR && wantB === mB) break;
      mR = wantR; mB = wantB;
    }
    function Y0of(p) { return p; }
    const VW = w + pad + 8 + mR, VH = h + pad + 8 + mB;
    const ts = T.ts(VW, VH, 22, T.minPx());
    const sv = svg('svg', { viewBox: `0 0 ${VW} ${VH}`, class: 'dt-area', style: `--ts:${ts.toFixed(3)}`, role: 'img', 'aria-label': sayIt() });
    sv.setAttribute('direction', 'ltr');
    const X0 = pad, Y0 = pad;
    if (V === 'array') {
      const rad = Math.min(k * 0.36, 22);
      for (let i = 0; i < st.a; i++) for (let j = 0; j < st.b; j++) {
        const region = (st.sa && i >= st.sa ? 1 : 0) * 2 + (st.sb && j >= st.sb ? 1 : 0);
        sv.appendChild(svg('circle', { cx: X0 + (j + 0.5) * k, cy: Y0 + (i + 0.5) * k, r: rad, class: `dt-dot dt-c${region % FCOLORS}` }));
      }
    } else {
      for (const c of place) sv.appendChild(svg('rect', { x: c.x, y: c.y, width: c.cw, height: c.ch, class: `dt-region dt-c${(c.part.i * 2 + c.part.j) % FCOLORS}` }));
      if (st.a <= 30 && st.b <= 30) { let grid = ''; for (let i = 1; i < st.a; i++) grid += `M${X0} ${Y0 + i * k}h${w}`; for (let j = 1; j < st.b; j++) grid += `M${X0 + j * k} ${Y0}v${h}`; sv.appendChild(svg('path', { d: grid, class: 'dt-unit' })); }
      sv.appendChild(svg('rect', { x: X0, y: Y0, width: w, height: h, class: 'dt-outline' }));
      const usedY = [];
      for (const c of place) {
        const cx = c.x + c.cw / 2, cy = c.y + c.ch / 2;
        if (c.inside) {
          sv.appendChild(svg('text', { x: cx, y: cy - c.fs * 0.12, 'font-size': c.fs * 0.72, 'text-anchor': 'middle', class: 'dt-rl' }, c.top));
          sv.appendChild(svg('text', { x: cx, y: cy + c.fs * 0.85, 'font-size': c.fs, 'text-anchor': 'middle', class: 'dt-rv' }, c.part.p));
        } else if (c.below) {
          const ly = Y0 + h + 14 + (c.line + 1) * c.fo * 1.5 - c.fo * 0.35, lx = Math.max(X0 + tw(c.text, c.fo) / 2, Math.min(X0 + w - tw(c.text, c.fo) / 2 + mR, cx));
          sv.appendChild(svg('path', { d: `M${cx} ${cy}V${ly - c.fo * 1.05}`, class: 'dt-leader' }));
          sv.appendChild(svg('circle', { cx, cy, r: 3.5, class: 'dt-leaderdot' }));
          sv.appendChild(svg('text', { x: lx, y: ly, 'font-size': c.fo, 'text-anchor': 'middle', class: 'dt-rout' }, c.text));
        } else {
          let ly = cy; while (usedY.some(u => Math.abs(u - ly) < c.fo * 1.3)) ly += c.fo * 1.3;
          usedY.push(ly);
          const lx = X0 + w + 24;
          sv.appendChild(svg('path', { d: `M${cx} ${cy}L${lx - 6} ${ly - c.fo * 0.35}`, class: 'dt-leader' }));
          sv.appendChild(svg('circle', { cx, cy, r: 3.5, class: 'dt-leaderdot' }));
          sv.appendChild(svg('text', { x: lx, y: ly, 'font-size': c.fo, class: 'dt-rout' }, c.text));
        }
      }
    }
    // Side lengths along the top and the left.
    let x = X0; r.cols.forEach(cb => { sv.appendChild(svg('text', { x: x + (cb * k) / 2, y: Y0 - 14, class: 'dt-side', 'text-anchor': 'middle' }, cb)); x += cb * k; });
    let y = Y0; r.rows.forEach(ra => { sv.appendChild(svg('text', { x: X0 - 12, y: y + (ra * k) / 2 + 8, class: 'dt-side', 'text-anchor': 'end' }, ra)); y += ra * k; });
    if (st.sb) sv.appendChild(svg('line', { x1: X0 + st.sb * k, x2: X0 + st.sb * k, y1: Y0 - 6, y2: Y0 + h + 6, class: 'dt-split' }));
    if (st.sa) sv.appendChild(svg('line', { x1: X0 - 6, x2: X0 + w + 6, y1: Y0 + st.sa * k, y2: Y0 + st.sa * k, class: 'dt-split' }));
    T.stage.textContent = ''; T.stage.appendChild(sv);
    T.read.textContent = '';
    T.read.appendChild(ltr('div', 'dt-big', `${st.a} × ${st.b} = ${r.total}`));
    if (r.parts.length > 1) {
      const dist = `(${r.rows.join(' + ')}) × (${r.cols.join(' + ')})`.replace(/\((\d+)\)/g, '$1');
      T.read.appendChild(ltr('div', 'dt-sub', `${dist} = ${r.parts.map(p => p.p).join(' + ')}`));
    }
  };
  return T.finish({
    options: box => {
      const sa = field(box, W.splitRows, numberIn(st.sa, 0, Math.max(0, st.a - 1))), sb = field(box, W.splitCols, numberIn(st.sb, 0, Math.max(0, st.b - 1)));
      box.appendChild(el('p', 'small muted', W.noSplit));
      sa.addEventListener('change', () => { st.sa = Math.max(0, Math.min(st.a - 1, Math.round(+sa.value) || 0)); sa.value = st.sa; T.commit(sayIt()); });
      sb.addEventListener('change', () => { st.sb = Math.max(0, Math.min(st.b - 1, Math.round(+sb.value) || 0)); sb.value = st.sb; T.commit(sayIt()); });
    },
  });
}

// ================================================================ 10. times table grid
function times(body, s, ctx) {
  const T = shell(body, s, ctx, 'times'), { W, st } = T;
  const mark = selectOf(['fact', 'row', 'col', 'squares', 'turn'].map(k => [k, W[k]]), st.mark);
  mark.classList.add('dt-select'); mark.setAttribute('aria-label', W.pick);
  mark.addEventListener('change', () => { st.mark = mark.value; T.commit(describe()); });
  const hide = T.toggle(`🙈 ${W.hide}`, null, () => st.hide, v => { st.hide = v; T.commit(); });
  const clear = btn(`🧹 ${W.clear}`, 'btn btn-sm');
  clear.addEventListener('click', () => { st.r = 0; st.c = 0; T.commit(W.clear); });
  T.foot.append(mark, hide, clear);
  let focusAt = -1;
  const describe = () => {
    const N = st.size, r = st.r, c = st.c;
    if (st.mark === 'squares') return `${W.squaresAre}: ${Array.from({ length: N }, (_, i) => (i + 1) ** 2).join(', ')}`;
    if (!r || !c) return W.pick;
    if (st.mark === 'row') return `${W.row} ${r}: ${Array.from({ length: N }, (_, i) => r * (i + 1)).join(', ')}`;
    if (st.mark === 'col') return `${W.col} ${c}: ${Array.from({ length: N }, (_, i) => c * (i + 1)).join(', ')}`;
    if (st.mark === 'turn') return `${r} × ${c} = ${c} × ${r} = ${r * c}`;
    return `${r} × ${c} = ${r * c}`;
  };
  const lit = (i, j) => {
    const r = st.r, c = st.c;
    if (st.mark === 'squares') return i === j;
    if (!r || !c) return false;
    if (st.mark === 'row') return i === r;
    if (st.mark === 'col') return j === c;
    if (st.mark === 'turn') return (i === r && j === c) || (i === c && j === r);
    return (i === r && j <= c) || (j === c && i <= r);
  };
  T.draw = () => {
    mark.value = st.mark; hide.sync(); clear.disabled = !st.r;
    const N = st.size;
    T.stage.textContent = '';
    const g = el('div', 'dt-tgrid'); g.dir = 'ltr'; g.style.setProperty('--n', N + 1);
    g.setAttribute('role', 'group'); g.setAttribute('aria-label', ctx.type.name);
    const cells = [];
    g.appendChild(el('span', 'dt-th dt-tcorner', '×'));
    for (let j = 1; j <= N; j++) g.appendChild(el('span', `dt-th${st.c === j ? ' is-lit' : ''}`, String(j)));
    for (let i = 1; i <= N; i++) {
      g.appendChild(el('span', `dt-th${st.r === i ? ' is-lit' : ''}`, String(i)));
      for (let j = 1; j <= N; j++) {
        const on = lit(i, j), here = (i === st.r && j === st.c) || (st.mark === 'turn' && i === st.c && j === st.r);
        const show = !st.hide || on;
        const b = btn(show ? String(i * j) : '', `dt-tcell${on ? ' is-lit' : ''}${here ? ' is-here' : ''}${i === j ? ' is-sq' : ''}`, `${i} × ${j}${show ? ` = ${i * j}` : ''}`);
        b.removeAttribute('title');
        if (ctx.editing) b.disabled = true;
        b.addEventListener('click', () => { st.r = i; st.c = j; if (st.mark === 'squares') st.mark = 'fact'; focusAt = cells.indexOf(b); T.commit(describe()); T.stage.querySelectorAll('.dt-tcell')[focusAt]?.focus(); });
        g.appendChild(b); cells.push(b);
      }
    }
    if (focusAt < 0) focusAt = 0;
    cells.forEach((c, k) => { c.tabIndex = k === focusAt ? 0 : -1; });
    if (!ctx.editing) roving(g, cells, N, j => { focusAt = j; });
    T.stage.appendChild(g);
    T.read.textContent = '';
    T.read.appendChild(ltr('div', st.r && st.c && st.mark !== 'squares' && st.mark !== 'row' && st.mark !== 'col' ? 'dt-big' : 'dt-sub', describe()));
  };
  return T.finish({
    options: box => {
      const sz = field(box, W.size, selectOf([[10, '10 × 10'], [12, '12 × 12']], st.size));
      sz.addEventListener('change', () => { st.size = +sz.value; if (st.r > st.size) st.r = 0; if (st.c > st.size) st.c = 0; T.commit(); });
    },
  });
}

// ================================================================ 11. teaching clock
function tclock(body, s, ctx) {
  const T = shell(body, s, ctx, 'tclock'), { W, st } = T;
  let editing = 't';
  const which = T.seg(W.elapsed, [['t', W.start], ['end', W.endTime]], () => editing, v => { editing = v; T.draw(); });
  T.top.appendChild(which);
  const step = (d, label) => { const b = btn(label, 'btn btn-sm', `${label}`); b.addEventListener('click', () => setT(st[editing] + d)); return b; };
  const m5 = step(-5, '−5'), p5 = step(5, '+5'), mh = step(-60, `−1 ${W.hours}`), ph = step(60, `+1 ${W.hours}`);
  m5.setAttribute('aria-label', `−5 ${W.minutes}`); p5.setAttribute('aria-label', `+5 ${W.minutes}`);
  T.foot.append(m5, p5, mh, ph);
  const fmt = () => new Intl.DateTimeFormat(ctx.intl, { hour: 'numeric', minute: '2-digit', hour12: !st.h24, timeZone: 'UTC' });
  const timeText = min => fmt().format(new Date(Date.UTC(2020, 0, 1, 0, M.wrapMin(min))));
  const dur = mins => { const x = M.hm(mins); return fill(x.h && x.m ? W.elapsedIs : x.h ? W.onlyH : W.onlyM, { h: x.h, m: x.m }); };
  const setT = v => { st[editing] = M.wrapMin(v); T.commit(); ctx.say(timeText(st[editing])); };
  let face, drag = null;
  T.draw = () => {
    which.hidden = !st.el; which.sync();
    if (!st.el) editing = 't';
    const t = st[editing], a = M.handAngles(t);
    T.stage.textContent = '';
    face = svg('svg', { viewBox: '-110 -110 220 220', class: 'dt-clock', style: `--ts:${T.ts(220, 220, 20, 14).toFixed(3)}`, role: 'slider', tabindex: ctx.editing ? '-1' : '0', 'aria-label': st.el ? (editing === 't' ? W.start : W.endTime) : W.time, 'aria-valuemin': 0, 'aria-valuemax': 1439, 'aria-valuenow': t, 'aria-valuetext': timeText(t) });
    face.setAttribute('direction', 'ltr');
    face.appendChild(svg('circle', { r: 104, class: 'dt-face' }));
    for (let i = 0; i < 60; i++) { const ang = (i * Math.PI) / 30, r0 = i % 5 ? 92 : 86; face.appendChild(svg('line', { x1: r0 * Math.sin(ang), y1: -r0 * Math.cos(ang), x2: 99 * Math.sin(ang), y2: -99 * Math.cos(ang), class: i % 5 ? 'dt-mtick' : 'dt-htick' })); }
    for (let h = 1; h <= 12; h++) { const ang = (h * Math.PI) / 6; face.appendChild(svg('text', { x: 70 * Math.sin(ang), y: -70 * Math.cos(ang) + 8, 'text-anchor': 'middle', class: 'dt-hnum' }, h)); }
    if (st.el) {
      // The elapsed time as a wedge between the two minute hands.
      const other = st[editing === 't' ? 'end' : 't'], o = M.handAngles(other);
      const ghostH = svg('line', { x1: 0, y1: 0, x2: 0, y2: -48, class: 'dt-ghosth', transform: `rotate(${o.hour})` }), ghostM = svg('line', { x1: 0, y1: 0, x2: 0, y2: -76, class: 'dt-ghosth', transform: `rotate(${o.minute})` });
      face.append(ghostH, ghostM);
    }
    const hh = svg('line', { x1: 0, y1: 10, x2: 0, y2: -50, class: 'dt-hh', transform: `rotate(${a.hour})`, 'data-hand': 'h' });
    const mh2 = svg('line', { x1: 0, y1: 12, x2: 0, y2: -80, class: 'dt-mh', transform: `rotate(${a.minute})`, 'data-hand': 'm' });
    face.append(hh, mh2, svg('circle', { r: 6, class: 'dt-pin' }));
    // Fat invisible copies to grab.
    face.append(svg('line', { x1: 0, y1: 0, x2: 0, y2: -50, class: 'dt-grab', transform: `rotate(${a.hour})`, 'data-hand': 'h' }), svg('line', { x1: 0, y1: 0, x2: 0, y2: -84, class: 'dt-grab', transform: `rotate(${a.minute})`, 'data-hand': 'm' }));
    const box = el('div', 'dt-clockwrap'); box.appendChild(face); T.stage.appendChild(box);
    wire();
    T.read.textContent = '';
    if (st.digital) T.read.appendChild(ltr('div', 'dt-big dt-digital', timeText(st.t) + (st.el ? ` → ${timeText(st.end)}` : '')));
    if (st.el) {
      const e = M.elapsed(st.t, st.end);
      T.read.appendChild(el('div', 'dt-sub dt-elapsed', `${W.elapsed}: ${dur(e)}`));
      const j = M.elapsedJumps(st.t, st.end);
      if (j.length > 1) {
        // Each jump stays on one line; the jumps wrap between them.
        const line = ltr('div', 'dt-sub dt-jumps');
        j.forEach((x, n) => { if (n) line.append(' · '); line.appendChild(el('span', 'dt-nowrap', `${timeText(x.from)} → ${timeText(x.to)} (${dur(x.mins)})`)); });
        T.read.appendChild(line);
      }
    }
  };
  const angleOf = e => { const r = face.getBoundingClientRect(); const x = e.clientX - (r.left + r.width / 2), y = e.clientY - (r.top + r.height / 2); return (Math.atan2(x, -y) * 180) / Math.PI; };
  function wire() {
    if (ctx.editing) return;
    face.addEventListener('keydown', e => {
      const d = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1, PageUp: 60, PageDown: -60 }[e.key];
      if (d) { e.preventDefault(); setT(st[editing] + (e.shiftKey ? d * 5 : d)); face.focus(); }
    });
    face.addEventListener('pointerdown', e => {
      const hand = e.target.closest('[data-hand]'); if (!hand) return;
      drag = { hand: hand.dataset.hand, id: e.pointerId }; face.setPointerCapture(e.pointerId); e.preventDefault();
    });
    face.addEventListener('pointermove', e => {
      if (!drag || drag.id !== e.pointerId) return;
      const deg = angleOf(e), was = st[editing];
      const next = drag.hand === 'm' ? M.dragMinute(was, deg) : M.dragHour(was, deg);
      if (next !== was) { st[editing] = next; const id = drag.id, hand = drag.hand; T.draw(); drag = { hand, id }; face.setPointerCapture(id); }
    });
    const end = e => { if (!drag || drag.id !== e.pointerId) return; drag = null; T.commit(); ctx.say(timeText(st[editing])); face.focus(); };
    face.addEventListener('pointerup', end); face.addEventListener('pointercancel', end);
  }
  return T.finish({
    options: box => {
      checkRow(box, W.digital, st.digital, v => { st.digital = v; T.commit(); });
      checkRow(box, W.h24, st.h24, v => { st.h24 = v; T.commit(); });
      checkRow(box, W.elapsed, st.el, v => { st.el = v; T.commit(); });
    },
  });
}

// ================================================================ 12. fraction, decimal, percent
function fdp(body, s, ctx) {
  const T = shell(body, s, ctx, 'fdp'), { W, st } = T;
  const say = () => ctx.say(`${st.n}/${st.d} = ${spoken(M.decimalString(st.n, st.d), W.hint)} = ${spoken(M.percentString(st.n, st.d), W.hint)}`);
  const top = T.stepper(W.top, () => st.n, () => { if (st.n > 0) { st.n--; T.commit(); say(); } }, () => { if (st.n < st.d) { st.n++; T.commit(); say(); } }, `${W.top} −`, `${W.top} +`);
  const bot = T.stepper(W.bottom, () => st.d, () => { if (st.d > 1) { st.d--; st.n = Math.min(st.n, st.d); T.commit(); say(); } }, () => { if (st.d < 100) { st.d++; T.commit(); say(); } }, `${W.bottom} −`, `${W.bottom} +`);
  T.top.append(top, bot);
  let grid;
  T.draw = () => {
    top.sync(); bot.sync();
    T.stage.textContent = '';
    const wrap = el('div', 'dt-fdpwrap');
    const cards = el('div', 'dt-cards');
    const card = (label, value, aria) => {
      const c = el('div', 'dt-card'); c.append(el('div', 'dt-cardl', label));
      if (typeof value === 'string') { const v = ltr('div', 'dt-cardv dt-cardt', value); v.style.setProperty('--len', Math.max(4, [...value].length)); if (aria) v.setAttribute('aria-label', aria); c.append(v); } else c.append(value);
      return c;
    };
    const simp = M.simplify(st.n, st.d);
    const fr = el('div', 'dt-cardv'); fr.dir = 'ltr'; fr.appendChild(stacked(st.n, st.d));
    if (simp.d !== st.d && st.n) { fr.append(' = '); fr.appendChild(stacked(simp.n, simp.d)); }
    const dec = M.decimalString(st.n, st.d), pct = M.percentString(st.n, st.d);
    cards.append(card(W.fraction, fr), card(W.decimal, dec, spoken(dec, W.hint)), card(W.percent, pct, spoken(pct, W.hint)));
    // 10 x 10: a square is one hundredth; tap one to show that many hundredths.
    const h = M.hundredGrid(st.n, st.d);
    grid = svg('svg', { viewBox: '0 0 104 104', class: 'dt-hund', role: 'slider', tabindex: ctx.editing ? '-1' : '0', 'aria-label': W.grid, 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': Math.round(h.full + h.part), 'aria-valuetext': fill(W.outOf, { n: spoken(M.decimalString(st.n * 100, st.d), W.hint) }) });
    grid.setAttribute('direction', 'ltr');
    for (let k = 0; k < 100; k++) {
      const x = 2 + (k % 10) * 10, y = 2 + Math.floor(k / 10) * 10;
      grid.appendChild(svg('rect', { x, y, width: 10, height: 10, class: k < h.full ? 'dt-on dt-c0' : 'dt-off', 'data-k': k }));
      if (k === h.full && h.part) grid.appendChild(svg('rect', { x, y, width: 10 * h.part, height: 10, class: 'dt-on dt-c0 dt-part' }));
    }
    let lines = ''; for (let i = 1; i < 10; i++) lines += `M${2 + i * 10} 2v100M2 ${2 + i * 10}h100`;
    grid.appendChild(svg('path', { d: lines, class: 'dt-thin' }));
    grid.appendChild(svg('rect', { x: 2, y: 2, width: 100, height: 100, class: 'dt-outline' }));
    wrap.append(cards, grid);
    T.stage.appendChild(wrap);
    T.read.textContent = '';
    T.read.appendChild(ltr('div', 'dt-sub', `${st.n}/${st.d} = ${dec} = ${pct}`));
    if (!ctx.editing) {
      const setK = k => { if (k === 0) st.n = 0; else { const f = M.simplify(k, 100); st.n = f.n; st.d = f.d; } T.commit(); say(); grid.focus(); };
      grid.addEventListener('click', e => { const r = e.target.closest('[data-k]'); if (r) setK(+r.dataset.k + 1); });
      grid.addEventListener('keydown', e => {
        const cur = Math.round(h.full + h.part), d = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1, PageUp: 10, PageDown: -10 }[e.key];
        if (d) { e.preventDefault(); setK(Math.max(0, Math.min(100, cur + d))); }
      });
    }
  };
  return T.finish();
}

// ================================================================ 13. whiteboard (the teacher's projector; never stored or sent)
const PENS = ['ink', 'red', 'blue', 'green', 'orange', 'purple'];
const boards = new Map();   // widget id -> strokes, this page's memory only (gone on reload)
function board(body, s, ctx) {
  const W = ctx.type.words;
  body.classList.add('dt', 'dt-board');
  const st = boards.get(ctx.id) || { strokes: [], undone: [], tool: 'pen', color: 'ink' };
  boards.set(ctx.id, st);
  const top = el('div', 'dt-top dw-row');
  const tools = el('div', 'dt-seg'); tools.setAttribute('role', 'group'); tools.setAttribute('aria-label', W.pen);
  const toolBtns = [['pen', '✏️', W.pen], ['marker', '🖍️', W.marker], ['eraser', '🧽', W.eraser]].map(([k, ic, label]) => { const b = btn(ic, 'btn btn-sm', label); b.addEventListener('click', () => { st.tool = k; sync(); ctx.say(label); }); tools.appendChild(b); return [k, b]; });
  const colors = el('div', 'dt-seg dt-colors'); colors.setAttribute('role', 'group'); colors.setAttribute('aria-label', W.color);
  const colBtns = PENS.map(k => { const b = btn('', `btn btn-sm dt-sw dt-pen-${k}`, `${W.color}: ${W[k] || k}`); b.addEventListener('click', () => { st.color = k; if (st.tool === 'eraser') st.tool = 'pen'; sync(); ctx.say(b.getAttribute('aria-label')); }); colors.appendChild(b); return [k, b]; });
  top.append(tools, colors);
  const stage = el('div', `dt-stage dt-boardbg dt-bg-${s.bg || 'grid'}`);
  const canvas = el('canvas', 'dt-canvas');
  canvas.tabIndex = ctx.editing ? -1 : 0; canvas.setAttribute('role', 'img'); canvas.setAttribute('aria-label', `${W.canvas}. ${W.keys}`);
  stage.appendChild(canvas);
  const foot = el('div', 'dt-foot dw-row');
  const undo = btn(`↶ ${W.undo}`, 'btn btn-sm'), clear = btn(`🧹 ${W.clear}`, 'btn btn-sm');
  const note = el('p', 'small muted dt-boardnote', W.note);
  foot.append(undo, clear, note);
  body.append(top, stage, foot);
  if (ctx.editing) body.classList.add('is-static');
  const ink = k => { const cs = getComputedStyle(body); return k === 'ink' ? cs.getPropertyValue('--text').trim() || '#141414' : cs.getPropertyValue(`--dt-pen-${k}`).trim() || '#c33'; };
  const widthOf = (tool, w) => (tool === 'marker' ? Math.max(14, w / 40) : tool === 'eraser' ? Math.max(22, w / 26) : Math.max(3, w / 220));
  let cw = 0, ch = 0;
  const paint = () => {
    const r = stage.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
    cw = Math.max(1, Math.floor(r.width)); ch = Math.max(1, Math.floor(r.height));
    canvas.width = cw * dpr; canvas.height = ch * dpr; canvas.style.width = `${cw}px`; canvas.style.height = `${ch}px`;
    const g = canvas.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, cw, ch);
    for (const sk of st.strokes) drawStroke(g, sk);
    if (kb.on || kb.shown) { g.save(); g.globalCompositeOperation = 'source-over'; g.strokeStyle = ink('ink'); g.lineWidth = 2; g.beginPath(); g.arc(kb.x * cw, kb.y * cw, 9, 0, Math.PI * 2); g.stroke(); if (kb.on) { g.fillStyle = ink(st.color); g.fill(); } g.restore(); }
  };
  // A stroke's points are kept as fractions of the board's width (x and y), so it keeps its shape when the widget resizes.
  const drawStroke = (g, sk) => {
    if (sk.clear) { g.clearRect(0, 0, cw, ch); return; }
    g.save();
    g.globalCompositeOperation = sk.tool === 'eraser' ? 'destination-out' : 'source-over';
    g.globalAlpha = sk.tool === 'marker' ? 0.35 : 1;
    g.strokeStyle = ink(sk.color); g.fillStyle = ink(sk.color); g.lineCap = 'round'; g.lineJoin = 'round'; g.lineWidth = widthOf(sk.tool, cw);
    g.beginPath();
    sk.pts.forEach(([x, y], i) => (i ? g.lineTo(x * cw, y * cw) : g.moveTo(x * cw, y * cw)));
    if (sk.pts.length === 1) { g.arc(sk.pts[0][0] * cw, sk.pts[0][1] * cw, g.lineWidth / 2, 0, Math.PI * 2); g.fill(); } else g.stroke();
    g.restore();
  };
  const sync = () => {
    for (const [k, b] of toolBtns) b.setAttribute('aria-pressed', String(st.tool === k));
    for (const [k, b] of colBtns) b.setAttribute('aria-pressed', String(st.color === k && st.tool !== 'eraser'));
    undo.disabled = !st.strokes.length; clear.disabled = !st.strokes.length || st.strokes[st.strokes.length - 1].clear;
  };
  let cur = null;
  const at = e => { const r = canvas.getBoundingClientRect(); return [(e.clientX - r.left) / r.width, ((e.clientY - r.top) / r.height) * (ch / cw)]; };
  if (!ctx.editing) {
    canvas.addEventListener('pointerdown', e => {
      if (e.button > 0) return;
      cur = { tool: st.tool, color: st.color, pts: [at(e)], id: e.pointerId };
      st.strokes.push(cur); canvas.setPointerCapture(e.pointerId); e.preventDefault(); paint(); sync();
    });
    canvas.addEventListener('pointermove', e => {
      if (!cur || cur.id !== e.pointerId) return;
      for (const ev of e.getCoalescedEvents ? e.getCoalescedEvents() : [e]) cur.pts.push(at(ev));
      paint();
    });
    const end = e => { if (!cur || cur.id !== e.pointerId) return; delete cur.id; cur = null; sync(); };
    canvas.addEventListener('pointerup', end); canvas.addEventListener('pointercancel', end);
  }
  // The keyboard pen: arrows move it, Space puts it down or lifts it (drawing as it moves).
  const kb = { x: 0.5, y: 0.25, on: false, shown: false, sk: null };
  canvas.addEventListener('focus', () => { kb.shown = true; paint(); });
  canvas.addEventListener('blur', () => { kb.shown = false; kb.on = false; kb.sk = null; paint(); });
  canvas.addEventListener('keydown', e => {
    if (ctx.editing) return;
    const step = (e.shiftKey ? 2 : 12) / cw, d = { ArrowRight: [1, 0], ArrowLeft: [-1, 0], ArrowDown: [0, 1], ArrowUp: [0, -1] }[e.key];
    if (d) {
      e.preventDefault();
      kb.x = Math.max(0, Math.min(1, kb.x + d[0] * step)); kb.y = Math.max(0, Math.min(ch / cw, kb.y + d[1] * step));
      if (kb.on && kb.sk) kb.sk.pts.push([kb.x, kb.y]);
      paint();
    } else if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      kb.on = !kb.on;
      if (kb.on) { kb.sk = { tool: st.tool, color: st.color, pts: [[kb.x, kb.y]] }; st.strokes.push(kb.sk); } else kb.sk = null;
      paint(); sync(); ctx.say(kb.on ? W.down : W.up);
    }
  });
  undo.addEventListener('click', () => { st.strokes.pop(); paint(); sync(); ctx.say(W.undo); });
  clear.addEventListener('click', () => { st.strokes.push({ clear: true }); paint(); sync(); ctx.say(W.cleared); });
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => paint()) : null;
  if (ro) ro.observe(stage);
  const dark = matchMedia('(prefers-color-scheme: dark)'); const re = () => paint();
  dark.addEventListener?.('change', re);
  sync(); requestAnimationFrame(paint);
  return { destroy() { ro?.disconnect(); dark.removeEventListener?.('change', re); } };
}

// ================================================================ 14. picture (the teacher's upload; pinned ones reach students)
function picture(body, s, ctx) {
  const W = ctx.type.words;
  body.classList.add('dt-pic');
  const control = ctx.teacher && !ctx.pinned && !ctx.editing;
  if (!s.pic) {
    body.appendChild(el('p', 'dw-empty', ctx.teacher ? W.empty : ''));
    if (control && ctx.upload) body.appendChild(uploadBtn(W.upload, true));
    return null;
  }
  const frame = el('div', `dt-picframe dt-fit-${s.fit === 'cover' ? 'cover' : 'contain'}`);
  const img = el('img'); img.src = `/dash/pictures/${encodeURIComponent(s.pic)}`; img.alt = s.alt || ''; img.decoding = 'async'; img.draggable = false;
  img.addEventListener('error', () => { frame.textContent = ''; frame.appendChild(el('p', 'dw-empty', W.gone)); });
  frame.appendChild(img);
  body.appendChild(frame);
  if (!s.alt && ctx.teacher) {
    // A picture needs its description before anyone else sees it (students never get one without it).
    frame.classList.add('needs-alt');
    const row = el('div', 'dw-row dt-picrow');
    row.appendChild(el('p', 'small dt-alterr', W.needAlt));
    if (control) {
      const b = btn(`✏️ ${W.note}`, 'btn btn-sm btn-primary');
      b.addEventListener('click', () => {
        const sh = ctx.sheet({ title: W.note, content: '' });
        const box = el('form', 'stack'); sh.el.querySelector('.sheet-body').appendChild(box);
        const ta = field(box, ctx.type.settings.find(f => f.key === 'alt').label, Object.assign(el('textarea', 'input'), { maxLength: 200, rows: 3 }));
        ta.dir = 'auto'; ta.required = true;
        const ok = el('button', 'btn btn-primary', C(ctx).done); ok.type = 'submit'; box.appendChild(ok);
        box.addEventListener('submit', e => { e.preventDefault(); if (ta.value.trim()) { sh.close(); ctx.set('alt', ta.value.trim()); } });
        ta.focus();
      });
      row.appendChild(b);
    }
    body.appendChild(row);
  }
  return null;
  function uploadBtn(label, primary) {
    const b = btn(`🖼️ ${label}`, `btn btn-sm${primary ? ' btn-primary' : ''}`);
    const file = el('input'); file.type = 'file'; file.accept = 'image/*'; file.hidden = true;
    b.addEventListener('click', () => file.click());
    file.addEventListener('change', async () => {
      const f = file.files && file.files[0]; if (!f) return; file.value = '';
      b.disabled = true; b.textContent = W.uploading;
      try { const r = await ctx.upload(f); if (r && r.id) ctx.set('pic', r.id); } catch (err) { ctx.toast(err.message || W.bad, { bad: true }); b.disabled = false; b.textContent = `🖼️ ${label}`; }
    });
    const row = el('div', 'dw-row dt-picrow'); row.append(b, file); return row;
  }
}
const C = ctx => ctx.common || {};

/** id -> renderer (merged into public/js/dash-widgets.js RENDER). */
export const TOOLS = { fractions, numline, coord, graph, base10, placeval, tenframe, hundreds, area, times, tclock, fdp, board, picture };
export const PEN_COLORS = PENS;
/** The shared parts, for stage 4's tools (public/js/dash-tools4.js). */
export const parts = { shell, field, selectOf, numberIn, checkRow, roving, stacked, el, svg, btn, fill, clone, ltr, svgPoint, svgText, iso };
