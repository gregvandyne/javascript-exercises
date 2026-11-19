// "New ones for each student": a pattern the kit fills in afresh for each student (the activity's "gen"). The teacher
// picks a problem to make more like ("Make problems like problem 1"); the panel turns it into a pattern, shows three
// examples (🎲 Try others) and checks 30 made-up problems with the kit's own self-test before it can be saved. The
// ranges (from, to, step) sit under "More options", already set from that problem (patterns.js makes the pattern).
import { esc } from '/js/app.js';
import { P, E, clone, valText, kit, figures, kindName } from './shared.js';
import { patternFor } from './patterns.js';

const numText = x => String(Math.round(x * 1000) / 1000);

/** Three problems the pattern makes (seeded, so Try others shows new ones). */
function examples(gen, seed) {
  const K = kit(); if (!K) return [];
  const T = K.logic.TOOLS[gen.tool], out = [];
  for (let i = 0; i < 12 && out.length < 3; i++) { const c = K.logic.cleanProblem(T.gen(K.logic.seeded(seed + i * 7919), gen)); if (c.p) out.push(c.p); }
  return out;
}
const short = p => (p.tool === 'figure.number' ? `${numText(p.answer)}${p.unit ? ` ${p.unit}` : ''}` : p.tool === 'numberline.point' ? valText(p.at)
  : p.tool === 'numberline.jump' ? `${valText(p.from)} + ${valText(p.by)}` : p.tool === 'fractions.shade' ? `${p.n}/${p.d}` : p.tool === 'fractions.equiv' ? `${p.from[0]}/${p.from[1]} → /${p.to}`
    : p.tool === 'fractions.compare' ? `${p.a.join('/')} ? ${p.b.join('/')}` : /^digits/.test(p.tool) ? `${p.a} ${{ 'digits.add': '+', 'digits.sub': '−', 'digits.mul': '×' }[p.tool]} ${p.b}`
      : /^tiles/.test(p.tool) ? p.items.slice(0, 4).map(valText).join(' · ') : '…');

/** The kit's self-test of 30 made-up problems, and each one's figure checked by Oomba Figures (as the server does). */
function checkGen(gen) {
  const K = kit(), F = figures(), r = K.selfTest({ problems: [], gen });
  if (!r.ok || !gen.fig || !F || typeof F.check !== 'function') return r;
  const T = K.logic.TOOLS[gen.tool];
  for (let i = 1; i <= 30; i++) {
    const c = K.logic.cleanProblem(T.gen(K.logic.seeded(i * 7919), gen)); if (!c.p || !c.p.fig) continue;
    const { kind, hide, ...rest } = c.p.fig, why = F.check(kind, { kind, ...rest });
    if (why && why.length) return { ok: false, problems: [{ at: 'generator', why: why.slice(0, 2).join('; ') }] };
  }
  return r;
}
export function renderGenerator(M, box) {
  const list = M.data.problems, K = kit();
  const can = list.map((p, i) => [i, patternFor(p)]).filter(([, x]) => x);
  box.innerHTML = '';
  if (!M.data.gen && !can.length) { box.innerHTML = `<p class="small muted">${E('genNone')}</p>`; return; }
  const from = Number.isInteger(M.genFrom) ? M.genFrom : null;
  const opts = `${from === null && M.data.gen ? `<option value="">${E('genBuilder')}</option>` : ''}${can.map(([i, x]) => `<option value="${i}"${from === i ? ' selected' : ''}>${E('genLike', { n: i + 1 })}: ${esc(kindName(list[i]))}</option>`).join('')}`;
  const R = M.genRange, K_ = M.genKeys || {};
  const field = (name, k) => `<div class="field"><label for="ap-g-${name}-${k}">${(k === 'to' && K_[name].length === 1 ? E('gDigits') : E(`g.${k}`))}</label><input class="input" id="ap-g-${name}-${k}" data-g-name="${name}" data-g-key="${k}" inputmode="decimal" dir="ltr" value="${R[name][k]}"></div>`;
  box.innerHTML = `<div class="field"><label for="ap-like">${E('genMake')}</label><select class="input" id="ap-like">${opts}</select></div>
    ${from !== null && R ? `<button type="button" class="btn btn-sm ap-more" data-g="more" aria-expanded="${!!M.genMore}">${E(M.genMore ? 'lessOptions' : 'moreOptions')}</button>
      <div class="ap-more-box"${M.genMore ? '' : ' hidden'}>${Object.keys(R).map(name => `${R[name].x !== undefined ? `<p class="small ap-gvar">${E('gVar', { x: numText(R[name].x) })}</p>` : ''}<div class="ap-three">${K_[name].map(k => field(name, k)).join('')}</div>`).join('')}</div>` : ''}
    <p class="ap-ex"><span>${E('genExamples')}</span> <span class="ap-chips"></span> <button type="button" class="btn btn-sm" data-g="try">🎲 ${E('genTry')}</button></p>
    <p class="ap-check" role="status" aria-live="polite"></p>`;
  const gen = M.data.gen;
  const chips = box.querySelector('.ap-chips');
  if (gen && K) for (const p of examples(gen, M.genSeed)) { const c = document.createElement('span'); c.className = 'stchip'; c.dir = 'ltr'; c.textContent = short(p); chips.append(c); }
  const chk = box.querySelector('.ap-check');
  const r = gen && K ? checkGen(gen) : { ok: false, problems: [{ why: '' }] };
  if (r.ok) { chk.className = 'ap-check good'; chk.textContent = `✓ ${P('genChecked')}`; } else { chk.className = 'ap-check bad'; chk.innerHTML = `⚠️ <b>${E('notYet')}</b> <span lang="en" dir="ltr"></span>`; chk.querySelector('span').textContent = (r.problems[0] || {}).why || ''; }
  M.genOk = !!r.ok;
  box.querySelector('#ap-like').addEventListener('change', e => { if (e.target.value === '') return; use(M, +e.target.value, null); M.render(); });
  const try_ = box.querySelector('[data-g="try"]'); try_.addEventListener('click', () => { M.genSeed = (M.genSeed * 48271 + 11) % 2147483647 || 7; M.render(); });
  const more = box.querySelector('[data-g="more"]'); if (more) more.addEventListener('click', () => { M.genMore = !M.genMore; M.render(); box.querySelector('[data-g="more"]').focus(); });
  for (const el of box.querySelectorAll('[data-g-key]')) el.addEventListener('change', () => {
    const v = +String(el.value).replace(',', '.'), { gName: n, gKey: k } = el.dataset; if (!Number.isFinite(v)) return;
    use(M, from, { ...M.genRange, [n]: { ...M.genRange[n], [k]: v } }); M.render();
  });
}
/** Make the generator from problem i (r: the ranges, else that problem's own). */
export function use(M, i, r) {
  const x = patternFor(M.data.problems[i], r); if (!x) return;
  M.genFrom = i; M.genRange = x.ranges; M.genKeys = x.keys;
  M.commit({ k: 'gen' }, d => { d.gen = x.gen; });
}
/** "New ones for each student" switched on: the Builder's pattern if there is one, else one from the first problem that can. */
export function genOn(M) {
  if (M.data.gen) return true;
  if (M.genKeep) { M.commit({ k: 'gen' }, d => { d.gen = clone(M.genKeep); }); return true; }
  const i = M.data.problems.findIndex(p => patternFor(p)); if (i < 0) return false;
  use(M, i, null); return true;
}
