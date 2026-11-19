// "New ones for each student": a pattern the kit fills in afresh for each student (the activity's "gen"). The teacher
// picks a problem to make more like ("Make problems like problem 1"); the panel turns it into a pattern, shows three
// examples (🎲 Try others) and checks 30 made-up problems with the kit's own self-test before it can be saved. The
// ranges (from, to, step) sit under "More options", already set from that problem.
import { P, E, clone, valText, kit } from './shared.js';

const numText = x => String(Math.round(x * 1000) / 1000);
/** The pattern for problem p, or null when its kind cannot make new ones here (the Builder can). r: { from, to, step }. */
export function patternFor(p, r = null) {
  if (!p) return null;
  if (p.tool === 'figure.number' && p.fig && p.fig.kind === 'reading' && +p.answer === +p.fig.value) {
    const R = r || { from: p.fig.min, to: p.fig.max, step: p.fig.step || 1 }, u = p.unit ? ` ${p.unit}` : '';
    return { r: R, gen: { tool: 'figure.number', vars: { v: [R.from, R.to, R.step] }, q: p.q, fig: { ...clone(p.fig), value: '{v}' }, answer: 'v', ...(p.dp ? { dp: p.dp } : {}), ...(p.unit ? { unit: p.unit } : {}), work: [P('genWork1'), P('genWork2', { v: '{v}', u })] } };
  }
  if (p.tool === 'numberline.point' || p.tool === 'numberline.jump') {
    const R = r || { from: p.lo, to: p.hi, step: p.sub };
    return { r: R, gen: { tool: p.tool, lo: R.from, hi: R.to, subs: [R.step] } };
  }
  if (/^fractions\./.test(p.tool)) {
    const d = p.tool === 'fractions.shade' ? p.d : p.tool === 'fractions.equiv' ? p.from[1] : Math.max(p.a[1], p.b[1]);
    const R = r || { from: 2, to: Math.max(4, Math.min(12, d)), step: 1 }, dens = [];
    for (let x = R.from; x <= R.to && dens.length < 11; x += Math.max(1, R.step)) dens.push(x);
    return { r: R, gen: { tool: p.tool, dens } };
  }
  if (/^digits\./.test(p.tool)) {
    const R = r || { from: 1, to: String(p.a).length, step: 1 };
    return { r: R, gen: { tool: p.tool, digits: Math.max(1, Math.min(4, R.to)) } };
  }
  return null;
}
/** Three problems the pattern makes (seeded, so Try others shows new ones). */
function examples(gen, seed) {
  const K = kit(); if (!K) return [];
  const T = K.logic.TOOLS[gen.tool], out = [];
  for (let i = 0; i < 12 && out.length < 3; i++) { const c = K.logic.cleanProblem(T.gen(K.logic.seeded(seed + i * 7919), gen)); if (c.p) out.push(c.p); }
  return out;
}
const short = p => (p.tool === 'figure.number' ? `${numText(p.answer)}${p.unit ? ` ${p.unit}` : ''}` : p.tool === 'numberline.point' ? valText(p.at)
  : p.tool === 'numberline.jump' ? `${valText(p.from)} + ${valText(p.by)}` : p.tool === 'fractions.shade' ? `${p.n}/${p.d}` : p.tool === 'fractions.equiv' ? `${p.from[0]}/${p.from[1]} → /${p.to}`
    : p.tool === 'fractions.compare' ? `${p.a.join('/')} ? ${p.b.join('/')}` : /^digits/.test(p.tool) ? `${p.a} ${{ 'digits.add': '+', 'digits.sub': '−', 'digits.mul': '×' }[p.tool]} ${p.b}` : '…');

export function renderGenerator(M, box) {
  const list = M.data.problems, K = kit();
  const can = list.map((p, i) => [i, patternFor(p)]).filter(([, x]) => x);
  box.innerHTML = '';
  if (!M.data.gen && !can.length) { box.innerHTML = `<p class="small muted">${E('genNone')}</p>`; return; }
  const from = Number.isInteger(M.genFrom) ? M.genFrom : null;
  const opts = `${from === null && M.data.gen ? `<option value="">${E('genBuilder')}</option>` : ''}${can.map(([i, x]) => `<option value="${i}"${from === i ? ' selected' : ''}>${E('genLike', { n: i + 1 })}: ${list[i].fig ? (list[i].fig.type ? E(`kind.${list[i].fig.type}`) : '') : E(`kind.${list[i].tool.replace('.', '_')}`)}</option>`).join('')}`;
  const R = M.genRange;
  box.innerHTML = `<div class="field"><label for="ap-like">${E('genMake')}</label><select class="input" id="ap-like">${opts}</select></div>
    ${from !== null && R ? `<button type="button" class="btn btn-sm ap-more" data-g="more" aria-expanded="${!!M.genMore}">${E(M.genMore ? 'lessOptions' : 'moreOptions')}</button>
      <div class="ap-more-box ap-three"${M.genMore ? '' : ' hidden'}>${['from', 'to', 'step'].map(k => `<div class="field"><label for="ap-g-${k}">${E(`g.${k}`)}</label><input class="input" id="ap-g-${k}" inputmode="decimal" dir="ltr" value="${R[k]}"></div>`).join('')}</div>` : ''}
    <p class="ap-ex"><span>${E('genExamples')}</span> <span class="ap-chips"></span> <button type="button" class="btn btn-sm" data-g="try">🎲 ${E('genTry')}</button></p>
    <p class="ap-check" role="status" aria-live="polite"></p>`;
  const gen = M.data.gen;
  const chips = box.querySelector('.ap-chips');
  if (gen && K) for (const p of examples(gen, M.genSeed)) { const c = document.createElement('span'); c.className = 'stchip'; c.dir = 'ltr'; c.textContent = short(p); chips.append(c); }
  const chk = box.querySelector('.ap-check');
  const r = gen && K ? K.selfTest({ problems: [], gen }) : { ok: false, problems: [{ why: '' }] };
  if (r.ok) { chk.className = 'ap-check good'; chk.textContent = `✓ ${P('genChecked')}`; } else { chk.className = 'ap-check bad'; chk.innerHTML = `⚠️ <b>${E('notYet')}</b> <span lang="en" dir="ltr"></span>`; chk.querySelector('span').textContent = (r.problems[0] || {}).why || ''; }
  M.genOk = !!r.ok;
  box.querySelector('#ap-like').addEventListener('change', e => { if (e.target.value === '') return; use(M, +e.target.value, null); M.render(); });
  const try_ = box.querySelector('[data-g="try"]'); try_.addEventListener('click', () => { M.genSeed = (M.genSeed * 48271 + 11) % 2147483647 || 7; M.render(); });
  const more = box.querySelector('[data-g="more"]'); if (more) more.addEventListener('click', () => { M.genMore = !M.genMore; M.render(); box.querySelector('[data-g="more"]').focus(); });
  for (const k of ['from', 'to', 'step']) {
    const el = box.querySelector(`#ap-g-${k}`); if (!el) continue;
    el.addEventListener('change', () => { const v = +String(el.value).replace(',', '.'); if (!Number.isFinite(v)) return; use(M, from, { ...M.genRange, [k]: v }); M.render(); });
  }
}
/** Make the generator from problem i (r: the ranges, else that problem's own). */
export function use(M, i, r) {
  const x = patternFor(M.data.problems[i], r); if (!x) return;
  M.genFrom = i; M.genRange = x.r;
  M.commit({ k: 'gen' }, d => { d.gen = x.gen; });
}
/** "New ones for each student" switched on: the Builder's pattern if there is one, else one from the first problem that can. */
export function genOn(M) {
  if (M.data.gen) return true;
  if (M.genKeep) { M.commit({ k: 'gen' }, d => { d.gen = clone(M.genKeep); }); return true; }
  const i = M.data.problems.findIndex(p => patternFor(p)); if (i < 0) return false;
  use(M, i, null); return true;
}
