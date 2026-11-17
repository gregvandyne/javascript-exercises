// Classroom dashboards: bar models, a mode of Multiply and divide (docs/decisions.md "Bar models and number rods").
// Three kinds: multiply/divide (equal groups make a total), part–whole (parts make a whole) and compare (two bars and
// their difference). The parts are drawn to scale; any one quantity can be the "?"; braces label the whole and one part;
// the number sentences under the model are filled in and checked gently (✓ or "not yet"); "New problem" makes another
// within the teacher's limit. The maths is public/js/dash-math5.js (pure, tested).
// Privacy: the word problem a teacher writes is teacher text (their layout; a copy they send). On a student's sent copy it
// stays in that browser (ctx.keep keeps copies in the page); on a student's own screen it is never part of what is kept
// (the server drops it too: cleanToolState(..., { student: true })). The numbers typed into the sentence boxes are never
// kept or sent anywhere: this page's memory only. No network, no storage, text set as text only.
import * as B from './dash-math5.js';
import { parts } from './dash-tools.js';
import { tip } from './dash-tip.js';
import { format } from './i18n-format.js';

const { shell, field, numberIn, checkRow, el, svg, btn, ltr, iso } = parts;
const fill = (s, vars = {}) => String(s || '').replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
/** This page's memory: the numbers typed into a widget's sentence boxes, and a student's word problem on their own screen. */
const boxes = new Map(), stories = new Map();

/** A button with an icon and its words (the words hide on a narrow tool; the tooltip names it). */
function ibtn(icon, text, cls = 'btn btn-sm') {
  const b = tip(btn('', cls), text); b.setAttribute('aria-label', text);
  const i = el('span', 'dt-ic', icon), l = el('span', 'dt-lbl', text);
  i.setAttribute('aria-hidden', 'true'); l.setAttribute('aria-hidden', 'true');
  b.append(i, l); return b;
}
/** − value + with a visible label; the buttons are named in a tooltip (no native title). The value is typed too (the
 *  tool's shared field, public/js/dash-num.js): set(n) is the buttons' own change, inside the limits sync() is given;
 *  masked() hides the value ("?") while it is the unknown. */
function stepper(T, key, label, get, dec, inc, set, masked) {
  const g = el('div', 'dt-step'); g.setAttribute('role', 'group'); g.setAttribute('aria-label', label);
  const lab = el('span', 'dt-steplab', label); lab.setAttribute('aria-hidden', 'true');
  const minus = tip(btn('−', 'btn btn-sm dt-pm'), `${label}: −`), plus = tip(btn('+', 'btn btn-sm dt-pm'), `${label}: +`);
  minus.setAttribute('aria-label', `${label} −`); plus.setAttribute('aria-label', `${label} +`);
  let lim = [1, 999];
  const val = T.num({ label, key, get, set, min: () => lim[0], max: () => lim[1], up: () => { if (get() < lim[1]) inc(); }, down: () => { if (get() > lim[0]) dec(); }, mask: masked, cls: 'dt-stepval' });
  minus.addEventListener('click', dec); plus.addEventListener('click', inc);
  g.append(lab, minus, val, plus);
  g.sync = (lo, hi) => { lim = [lo, hi]; const v = get(); val.sync(); minus.disabled = v <= lo; plus.disabled = v >= hi; g.setAttribute('aria-label', `${label}: ${masked() ? '?' : v}`); };
  g.name = text => val.setAttribute('aria-label', text);
  return g;
}

export function bars(body, s, ctx) {
  const ownScreen = !ctx.teacher && !ctx.copy;
  // A student's own screen keeps the model, never the word problem (it stays in this page).
  const keepCtx = ownScreen && ctx.keep ? { ...ctx, keep: p => ctx.keep({ ...p, story: '' }) } : ctx;
  const T = shell(body, s, keepCtx, 'bars'), { W, st } = T;
  T.read.removeAttribute('aria-live');   // it holds the boxes being typed in; changes are said through ctx.say
  Object.assign(st, B.clampBars(st));
  if (ownScreen) st.story = stories.get(ctx.id) || '';
  let pick = 0;   // part–whole: the part the second stepper changes
  const LIM = B.BAR_LIMITS;
  const slotName = key => ({ total: W.total, groups: W.groups, each: W.each, whole: W.whole, diff: W.diff, a: W.first, b: W.second }[key] || fill(W.partN, { n: Number(key.slice(1)) + 1 }));
  const shown = (m, i) => !(st.hide && m.unk === i);
  /** "3 groups of 4 make 12" with "?" for what is hidden. */
  const sayModel = () => {
    const m = B.barModel(st), v = i => (shown(m, i) ? m.slots[i].value : '?');
    if (m.kind === 'mul') return fill(W.sayMul, { g: v(1), e: v(2), t: v(0) });
    if (m.kind === 'part') return fill(W.sayPart, { p: m.slots.slice(1).map((x, i) => v(i + 1)).join(' + '), w: v(0) });
    return fill(W.sayCmp, { a: v(1), b: v(2), d: v(0) });
  };
  const change = (fn, msg) => { fn(); Object.assign(st, B.clampBars(st)); T.commit(msg || sayModel()); };

  // ---- top: the kind, two steppers, a new problem
  const kinds = T.seg(W.kind, [['mul', W.mul, null, '✖️'], ['part', W.part, null, '➕'], ['cmp', W.cmp, null, '⚖️']], () => st.kind, v => {
    if (v === st.kind) return;
    pick = 0; st.kind = v; st.unk = 0; Object.assign(st, B.clampBars(st));
    T.commit(`${W[v]}: ${sayModel()}`);
  });
  // The model's slot each stepper changes (its number shows "?" while that slot is the hidden one).
  const slotOf = which => { const m = B.barModel(st); return m.kind === 'part' ? (which === 2 ? pick + 1 : -1) : which; };
  const masked = which => () => st.hide && slotOf(which) === B.barModel(st).unk;
  const s1 = stepper(T, 's1', W.groups, () => (st.kind === 'mul' ? st.g : st.kind === 'part' ? st.p.length : st.ca),
    () => change(() => { if (st.kind === 'mul') st.g--; else if (st.kind === 'part') { st.p.pop(); pick = Math.min(pick, st.p.length - 1); if (st.unk > st.p.length) st.unk = 0; } else st.ca--; }),
    () => change(() => { if (st.kind === 'mul') st.g++; else if (st.kind === 'part') st.p.push(Math.max(1, Math.min(LIM.v[1], st.p.at(-1)))); else st.ca++; }),
    n => change(() => {
      if (st.kind === 'mul') st.g = n;
      else if (st.kind === 'part') { while (st.p.length < n) st.p.push(Math.max(1, Math.min(LIM.v[1], st.p.at(-1)))); st.p.length = n; pick = Math.min(pick, st.p.length - 1); if (st.unk > st.p.length) st.unk = 0; }
      else st.ca = n;
    }), masked(1));
  const s2 = stepper(T, 's2', W.each, () => (st.kind === 'mul' ? st.e : st.kind === 'part' ? st.p[pick] : st.cb),
    () => change(() => { if (st.kind === 'mul') st.e--; else if (st.kind === 'part') st.p[pick]--; else st.cb--; }),
    () => change(() => { if (st.kind === 'mul') st.e++; else if (st.kind === 'part') st.p[pick]++; else st.cb++; }),
    n => change(() => { if (st.kind === 'mul') st.e = n; else if (st.kind === 'part') st.p[pick] = n; else st.cb = n; }), masked(2));
  const fresh = tip(btn('', 'btn btn-sm dt-bnew'), W.newProblem); fresh.setAttribute('aria-label', W.newProblem);
  { const i = el('span', 'dt-ic', '🎲'); i.setAttribute('aria-hidden', 'true'); fresh.appendChild(i); }
  fresh.addEventListener('click', () => {
    let next = st, k = 0;
    do next = B.newBarProblem(st); while (k++ < 20 && JSON.stringify(B.barModel(next).slots) === JSON.stringify(B.barModel(st).slots) && next.unk === st.unk);
    pick = 0; Object.assign(st, { g: next.g, e: next.e, p: next.p, ca: next.ca, cb: next.cb, unk: next.unk, hide: true });
    T.commit(`${W.newProblem}: ${sayModel()}`);
  });
  const ctl = el('div', 'dt-bctl'); ctl.append(s1, s2, fresh);
  T.top.append(kinds, ctl);

  // ---- foot: what is unknown, the braces, hide/show the answer, the word problem
  const unk = el('select', 'input dt-select'); unk.setAttribute('aria-label', W.unknown);
  unk.addEventListener('change', () => change(() => { st.unk = Number(unk.value); st.hide = true; }));
  const hide = T.toggle('', null, () => !st.hide, v => change(() => { st.hide = !v; }, v ? fill(W.answerIs, { n: B.barModel(st).answer }) : sayModel()));
  const hideIc = el('span', 'dt-ic', '👁️'), hideL = el('span', 'dt-lbl'); hideIc.setAttribute('aria-hidden', 'true'); hideL.setAttribute('aria-hidden', 'true'); hide.append(hideIc, hideL);
  let storyOpen = !!st.story;
  const write = T.toggle('', null, () => storyOpen, v => { storyOpen = v; T.draw(); if (v) T.read.querySelector('.dt-bstory textarea')?.focus(); });
  tip(write, W.story); write.setAttribute('aria-label', W.story);
  { const i = el('span', 'dt-ic', '✏️'), l = el('span', 'dt-lbl', W.storyBtn); i.setAttribute('aria-hidden', 'true'); l.setAttribute('aria-hidden', 'true'); write.append(i, l); }
  T.foot.append(unk, hide, write);

  // ---- the sentence boxes (this page only)
  const sig = () => JSON.stringify([st.kind, st.g, st.e, st.p, st.ca, st.cb]);
  const vals = () => {
    let m = boxes.get(ctx.id);
    if (!m || m.sig !== sig()) { m = { sig: sig(), v: B.barSentences(st).map(x => Array(x.n + 1).fill('')) }; boxes.set(ctx.id, m); }
    return m.v;
  };
  const checkOf = (i, row) => B.checkSentence(st, i, row.map(x => (x === '' ? NaN : Number(x))));

  function model() {
    const m = B.barModel(st), V = 1000, x0 = 20, BW = V - 40;
    const items = [];   // { x, w, y, h, label, cls, slot, part }
    let bh = 120, rows = 1;
    const label = i => (shown(m, i) ? String(m.slots[i].value) : '?');
    const at = (vals, min) => {
      // To scale, but no part thinner than min (a part of 1 beside 999 can still be read and tapped).
      const tot = vals.reduce((a, b) => a + b, 0) || 1; let w = vals.map(v => Math.max(min, v / tot));
      const k = w.reduce((a, b) => a + b, 0); w = w.map(x => (x / k) * BW);
      let x = x0; return w.map(ww => { const r = { x, w: ww }; x += ww; return r; });
    };
    if (m.kind === 'mul') {
      const groupsHidden = !shown(m, 1);
      if (groupsHidden && st.g > 1) {
        // How many groups is the question: one group is drawn, the rest of the total is left whole.
        const w1 = BW / st.g;
        items.push({ x: x0, w: w1, label: label(2), cls: 'dt-bp dt-c0', slot: 2 });
        items.push({ x: x0 + w1, w: BW - w1, label: '…', cls: 'dt-bp dt-brest', slot: -1 });
      } else for (let i = 0; i < st.g; i++) items.push({ x: x0 + (BW / st.g) * i, w: BW / st.g, label: label(2), cls: 'dt-bp dt-c0', slot: 2 });
    } else if (m.kind === 'part') {
      at(st.p, 0.07).forEach((r, i) => items.push({ ...r, label: label(i + 1), cls: `dt-bp dt-c${i % 3}${i === pick ? ' is-pick' : ''}`, slot: i + 1, part: i }));
    } else {
      rows = 2; bh = 100;
      const big = Math.max(st.ca, st.cb), wA = Math.max(0.08, st.ca / big) * BW, wB = Math.max(0.08, st.cb / big) * BW;
      items.push({ x: x0, w: wA, y: 0, label: label(1), cls: 'dt-bp dt-c0', slot: 1 });
      items.push({ x: x0, w: wB, y: 1, label: label(2), cls: 'dt-bp dt-c1', slot: 2 });
    }
    // Room above for the whole's brace and below for one part's (or the difference's).
    const top = st.bw && m.kind !== 'cmp' ? 110 : 30;
    const gapY = 46;
    // Below: one part's brace (and, for equal groups, how many groups: a line lower when the brace's label is in its way).
    const f0 = 34 * T.ts(V, top + rows * bh + 150, 34, T.minPx()), gText = m.kind === 'mul' ? (shown(m, 1) ? format(W.nGroups, { n: st.g }, ctx.intl) : W.qGroups) : '';
    const gLab = st.bp && m.kind === 'mul' ? fill(W.oneGroup, { n: label(2) }) : '';
    const busy = !!gLab && x0 + (shown(m, 1) || st.g < 2 ? BW / st.g : BW / st.g) / 2 + ([...gLab].length * f0 * 0.62) / 2 > x0 + BW - [...gText].length * f0 * 0.62 - 12;
    const bottom = m.kind === 'mul' ? (st.bp ? 96 + (busy ? f0 * 1.3 : 0) : 70) : st.bp ? 100 : 30;
    const H = top + rows * bh + (rows - 1) * gapY + bottom;
    const ts = T.ts(V, H, 34, T.minPx());
    const sv = svg('svg', { viewBox: `0 0 ${V} ${H}`, class: 'dt-bm', style: `--ts:${ts.toFixed(3)}`, role: 'group', 'aria-label': `${W.model}: ${sayModel()}` });
    sv.setAttribute('direction', 'ltr');
    const yOf = r => top + r * (bh + gapY);
    const brace = (xa, xb, y, up, text, cls) => {
      // A curly brace from xa to xb: its point at the middle, away from the bar.
      const d = up ? -1 : 1, h = 26, mid = (xa + xb) / 2, q = Math.min(18, (xb - xa) / 4);
      sv.appendChild(svg('path', { d: `M${xa} ${y}q0 ${d * h / 2} ${q} ${d * h / 2}H${mid - q}q${q} 0 ${q} ${d * h / 2}q0 ${-d * h / 2} ${q} ${-d * h / 2}H${xb - q}q${q} 0 ${q} ${-d * h / 2}`, class: `dt-brace ${cls || ''}` }));
      const t = svg('text', { x: mid, y: up ? y - h - 14 : y + h + 40, 'text-anchor': 'middle', class: `dt-blab${text === '?' ? ' is-unk' : ''}` }, text);
      sv.appendChild(t);
    };
    for (const it of items) {
      const y = yOf(it.y || 0);
      const g = svg('g', { class: 'dt-bpart' });
      g.appendChild(svg('rect', { x: it.x, y, width: it.w, height: bh, class: it.cls, rx: 4 }));
      if (it.label) {
        const fs = Math.min(1, (it.w - 8) / Math.max(1, [...it.label].length * 0.62 * 34 * ts));
        g.appendChild(svg('text', { x: it.x + it.w / 2, y: y + bh / 2, 'text-anchor': 'middle', 'dominant-baseline': 'central', class: `dt-bin${it.label === '?' ? ' is-unk' : ''}${shown(m, it.slot) && it.slot === m.unk ? ' is-ans' : ''}`, style: fs < 1 ? `font-size:calc(34px * var(--ts) * ${fs.toFixed(3)})` : null }, it.label));
      }
      if (it.part !== undefined && !ctx.editing) {
        g.setAttribute('role', 'button'); g.setAttribute('tabindex', it.part === pick ? '0' : '-1'); g.dataset.part = it.part;
        g.setAttribute('aria-label', `${fill(W.partN, { n: it.part + 1 })}: ${it.label}`); g.setAttribute('aria-pressed', String(it.part === pick));
      }
      sv.appendChild(g);
    }
    const y0 = yOf(0), yEnd = yOf(rows - 1) + bh;
    if (m.kind === 'mul') {
      // How many groups, under the bar's end: "4 groups" (or "? groups"); a line lower when one part's brace label is
      // in the way.
      const text = gText, f = f0;
      const y = st.bp ? yEnd + 8 + 26 + 40 + (busy ? f * 1.3 : 0) : yEnd + 40;
      sv.appendChild(svg('text', { x: x0 + BW, y, 'text-anchor': 'end', class: `dt-blab dt-bgroups${shown(m, 1) ? '' : ' is-unk'}` }, text));
    }
    if (st.bw && m.kind !== 'cmp') brace(x0, x0 + BW, y0 - 8, true, label(0));
    if (m.kind === 'cmp') {
      // The difference: a dashed piece after the shorter bar, up to the longer one's end, with its bracket.
      const short = st.ca >= st.cb ? items[1] : items[0], long = st.ca >= st.cb ? items[0] : items[1];
      const ys = yOf(short.y), xs = short.x + short.w, xe = long.x + long.w;
      if (xe - xs > 1) {
        sv.appendChild(svg('rect', { x: xs, y: ys, width: xe - xs, height: bh, class: 'dt-bdiff', rx: 4 }));
        if (st.bp) brace(xs, xe, ys + bh + 8, false, label(0), 'is-diff');
        else sv.appendChild(svg('text', { x: (xs + xe) / 2, y: ys + bh / 2, 'text-anchor': 'middle', 'dominant-baseline': 'central', class: `dt-bin${label(0) === '?' ? ' is-unk' : ''}` }, label(0)));
      }
    } else if (st.bp) {
      const it = m.kind === 'part' ? items[pick] : items[0];
      brace(it.x, it.x + it.w, yEnd + 8, false, m.kind === 'part' ? label(pick + 1) : fill(W.oneGroup, { n: label(2) }));
    }
    return sv;
  }

  function sentences() {
    const wrap = el('div', 'dt-bsents');
    wrap.setAttribute('role', 'group'); wrap.setAttribute('aria-label', W.sentences);
    const head = el('p', 'dt-bsh', W.sentences); head.dir = 'auto'; wrap.appendChild(head);
    const all = vals();
    B.barSentences(st).forEach((sn, i) => {
      const row = el('div', 'dt-bsent'); row.dir = 'ltr';
      const inputs = [];
      for (let k = 0; k <= sn.n; k++) {
        if (k === sn.n) row.appendChild(el('span', 'dt-bop', '='));
        else if (k > 0) row.appendChild(el('span', 'dt-bop', sn.op));
        const inp = el('input', 'input dt-bbox');
        Object.assign(inp, { type: 'text', inputMode: 'numeric', autocomplete: 'off', maxLength: 5, value: all[i][k] });
        inp.setAttribute('aria-label', fill(W.box, { n: k + 1, s: i + 1 }));
        inp.setAttribute('enterkeyhint', 'next');
        if (ctx.editing) inp.disabled = true;
        inputs.push(inp); row.appendChild(inp);
      }
      const mark = el('span', 'dt-bmark'); mark.setAttribute('aria-hidden', 'true');
      row.appendChild(mark);
      const show = say => {
        const r = checkOf(i, all[i]);
        mark.textContent = r === true ? '✓' : r === false ? '✗' : '';
        row.classList.toggle('is-right', r === true); row.classList.toggle('is-wrong', r === false);
        if (say && r !== null) ctx.say(r ? W.right : W.wrong);
      };
      inputs.forEach((inp, k) => {
        inp.addEventListener('input', () => {
          const clean = inp.value.replace(/[^\d]/g, '').slice(0, 5);
          if (clean !== inp.value) inp.value = clean;
          all[i][k] = clean; show(false);
        });
        inp.addEventListener('change', () => show(true));
        inp.addEventListener('keydown', e => {
          if (e.key === 'Enter') { e.preventDefault(); const next = inputs[k + 1] || wrap.querySelectorAll('.dt-bbox')[[...wrap.querySelectorAll('.dt-bbox')].indexOf(inp) + 1]; if (next) next.focus(); else show(true); }
        });
      });
      show(false);
      wrap.appendChild(row);
    });
    const fb = el('p', 'dt-bfb'); fb.dir = 'auto';
    const rs = B.barSentences(st).map((x, i) => checkOf(i, all[i]));
    fb.textContent = rs.includes(false) ? W.wrong : rs.every(r => r === true) ? W.right : '';
    wrap.appendChild(fb);
    wrap.addEventListener('input', () => { const r2 = B.barSentences(st).map((x, i) => checkOf(i, all[i])); fb.textContent = r2.includes(false) ? W.wrong : r2.every(r => r === true) ? W.right : ''; });
    return wrap;
  }

  function story() {
    const box = el('div', 'dt-bstory');
    const id = `dt-bs${Math.random().toString(36).slice(2, 8)}`;
    const ta = el('textarea', 'input dt-bsta'); ta.id = id; ta.rows = 2; ta.maxLength = 240; ta.dir = 'auto'; ta.value = st.story || '';
    if (ctx.editing) ta.disabled = true;
    let t = 0;
    ta.addEventListener('input', () => {
      st.story = ta.value;
      if (ownScreen) { stories.set(ctx.id, ta.value); return; }
      clearTimeout(t); t = setTimeout(() => { if (!ctx.editing && keepCtx.keep) keepCtx.keep(JSON.parse(JSON.stringify(st))); }, 600);
    });
    ta.setAttribute('aria-label', W.story); ta.placeholder = W.story; ta.rows = 2;
    box.append(ta);
    if (ctx.copy || ownScreen) { const n = el('p', 'small muted dt-bslocal', W.storyLocal); n.dir = 'auto'; box.appendChild(n); }
    return box;
  }

  T.stage.addEventListener('click', e => {
    const g = e.target.closest('[data-part]'); if (!g || ctx.editing) return;
    pick = Number(g.dataset.part); T.draw(); T.stage.querySelector(`[data-part="${pick}"]`)?.focus();
    ctx.say(`${fill(W.partN, { n: pick + 1 })}: ${st.p[pick]}`);
  });
  T.stage.addEventListener('keydown', e => {
    const g = e.target.closest('[data-part]'); if (!g) return;
    const i = Number(g.dataset.part), d = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); g.dispatchEvent(new MouseEvent('click', { bubbles: true })); }
    else if (d && st.p[i + d] !== undefined) { e.preventDefault(); pick = i + d; T.draw(); T.stage.querySelector(`[data-part="${pick}"]`)?.focus(); ctx.say(`${fill(W.partN, { n: pick + 1 })}: ${st.p[pick]}`); }
    else if (e.key === 'ArrowUp' || e.key === '+') { e.preventDefault(); if (st.p[i] < LIM.v[1]) { change(() => { st.p[i]++; }); T.stage.querySelector(`[data-part="${i}"]`)?.focus(); } }
    else if (e.key === 'ArrowDown' || e.key === '-') { e.preventDefault(); if (st.p[i] > LIM.v[0]) { change(() => { st.p[i]--; }); T.stage.querySelector(`[data-part="${i}"]`)?.focus(); } }
  });

  let sentBox = null, storyBox = null;
  T.draw = () => {
    const m = B.barModel(st);
    kinds.sync(); hide.sync(); write.sync();
    // The steppers say what they change in this kind.
    const lab = (g, text) => { g.querySelector('.dt-steplab').textContent = text; g.dataset.label = text; };
    if (m.kind === 'mul') { lab(s1, W.groups); lab(s2, W.each); s1.sync(...LIM.g); s2.sync(...LIM.e); }
    else if (m.kind === 'part') { lab(s1, W.parts); lab(s2, fill(W.partN, { n: pick + 1 })); s1.sync(...LIM.n); s2.sync(...LIM.v); }
    else { lab(s1, W.first); lab(s2, W.second); s1.sync(...LIM.v); s2.sync(...LIM.v); }
    // A stepper never gives the answer away: the hidden quantity reads "?" (and can't be typed in).
    for (const [g, text] of [[s1, s1.dataset.label], [s2, s2.dataset.label]]) {
      const [mi, pl] = g.querySelectorAll('.dt-pm'), v = g.querySelector('.dt-stepval');
      g.setAttribute('aria-label', `${text}: ${v.value}`); g.name(text);
      mi.setAttribute('aria-label', `${text} −`); pl.setAttribute('aria-label', `${text} +`); tip(mi, `${text}: −`); tip(pl, `${text}: +`);
    }
    // What is unknown.
    unk.textContent = '';
    m.slots.forEach((x, i) => { const o = el('option', null, fill(W.unknownIs, { name: slotName(x.key) })); o.value = String(i); if (i === m.unk) o.selected = true; unk.appendChild(o); });
    hideL.textContent = st.hide ? W.show : W.hide; tip(hide, st.hide ? W.show : W.hide); hide.setAttribute('aria-label', st.hide ? W.show : W.hide);
    hideIc.textContent = st.hide ? '👁️' : '🙈';
    T.stage.textContent = ''; T.stage.appendChild(model());
    // The sentences and the word problem are built again only when the model's numbers change, so a redraw (the widget
    // changing size) never takes the focus out of a box someone is typing in.
    T.read.classList.add('dt-bread');
    if (!sentBox || sentBox.dataset.sig !== sig() || !T.read.contains(sentBox)) { const fresh = sentences(); fresh.dataset.sig = sig(); if (sentBox && T.read.contains(sentBox)) sentBox.replaceWith(fresh); else T.read.prepend(fresh); sentBox = fresh; }
    if (!storyBox) { storyBox = story(); T.read.appendChild(storyBox); }
    storyBox.hidden = !(storyOpen || st.story);
  };
  return T.finish({
    options: box => {
      // The braces (Compare has no whole to brace; its lower brace marks the difference).
      const m0 = B.barModel(st);
      if (m0.kind !== 'cmp') checkRow(box, W.braceWhole, st.bw, v => change(() => { st.bw = v; }));
      checkRow(box, m0.kind === 'cmp' ? W.braceDiff : W.braceOne, st.bp, v => change(() => { st.bp = v; }));
      const mx = field(box, W.max, numberIn(st.max, LIM.max[0], LIM.max[1]));
      mx.addEventListener('change', () => { const v = Math.max(LIM.max[0], Math.min(LIM.max[1], Math.round(+mx.value) || 50)); mx.value = v; change(() => { st.max = v; }, `${W.max}: ${iso(v)}`); });
      const m = B.barModel(st);
      // The model's numbers, typed exactly (the steppers go one at a time).
      const exact = m.kind === 'mul' ? [['g', W.groups, LIM.g], ['e', W.each, LIM.e]] : m.kind === 'cmp' ? [['ca', W.first, LIM.v], ['cb', W.second, LIM.v]] : st.p.map((v, i) => [i, fill(W.partN, { n: i + 1 }), LIM.v]);
      const slot = k => (m.kind === 'part' ? k + 1 : { g: 1, e: 2, ca: 1, cb: 2 }[k]);
      for (const [k, text, [lo, hi]] of exact.filter(([k]) => !(st.hide && slot(k) === m.unk))) {
        const inp = field(box, text, numberIn(typeof k === 'number' ? st.p[k] : st[k], lo, hi));
        inp.addEventListener('change', () => { const v = Math.max(lo, Math.min(hi, Math.round(+inp.value) || lo)); inp.value = v; change(() => { if (typeof k === 'number') st.p[k] = v; else st[k] = v; }); });
      }
    },
  });
}
