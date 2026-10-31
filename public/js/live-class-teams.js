// The class teams editor (class progress page, "Live games" panel; docs/live-protocol.md "Part 3 hooks"). Teachers make
// their table groups before the lesson: the class's active students, 2-6 teams from the fixed presets (no typed team
// names), how teams score, then drag or select-then-move (the same board as the projector's Teams sheet). Saved inside
// the school (live_class_teams); in a live game "Use last teams" puts everyone back in them. "Forget saved teams"
// deletes them.
import { api, toast } from '/js/app.js';
import { readJson, fill, shapeSvg, paintTeam } from '/js/live-common.js';
import { board as teamBoard } from '/js/live-teams-ui.js';

const D = readJson('lv-class-teams-data');
const $ = id => document.getElementById(id);
const box = $('lv-class-teams'), wrap = $('lv-class-teams-board'), open = $('lv-class-teams-open');
const T = D.text || {}, presets = D.presets || [];
const ORDER = [0, 1, 2, 3, 4, 5, 6, 7];
if (box && wrap && open) {
  // the progress page does not load the live styles itself
  if (!document.querySelector('link[href^="/css/live.css"]')) { const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = '/css/live.css'; document.head.append(l); }
  let students = [], n = 4, pre = ORDER.slice(0, 4), scoring = 'avg', of = new Map(), ui = null;
  const seatOf = id => students.findIndex(s => s.id === id) + 1;
  const list = () => Array.from({ length: n }, (_, i) => ({ k: i + 1, p: pre[i] }));

  open.addEventListener('click', async () => {
    open.disabled = true;
    try {
      const r = await api(D.api);
      students = r.students || [];
      const sv = r.saved;
      n = sv ? sv.n : students.length <= 12 ? 2 : 4;
      pre = sv && sv.presets && sv.presets.length >= n ? sv.presets.slice(0, n) : ORDER.slice(0, n);
      scoring = sv ? sv.scoring : 'avg';
      of = new Map();
      for (const [u, k] of (sv && sv.plan) || []) { const seat = seatOf(u); if (seat && k <= n) of.set(seat, k); }
      build(!!sv);
    } catch (e) { toast(e.message, { bad: true }); open.disabled = false; }
  });

  function build(hasSaved) {
    open.hidden = true; wrap.hidden = false; wrap.textContent = '';
    wrap.innerHTML = `<div class="lv-class-tools row">
        <div class="field"><label for="lv-ct-n"></label><select id="lv-ct-n">${[2, 3, 4, 5, 6].map(x => `<option value="${x}">${x}</option>`).join('')}</select></div>
        <button class="btn btn-sm" type="button" data-ct="balance"></button>
        <button class="btn btn-sm" type="button" data-ct="shuffle"></button>
      </div>
      <details class="lv-teams-more"><summary class="btn btn-sm"></summary><div class="lv-teams-presets" id="lv-ct-presets"></div>
        <fieldset class="lv-team-scoring"><legend></legend>
          <label class="lv-radio"><input type="radio" name="lv-ct-scoring" value="avg"> <span data-t="scoringAvg"></span></label>
          <label class="lv-radio"><input type="radio" name="lv-ct-scoring" value="sum"> <span data-t="scoringSum"></span></label></fieldset></details>
      <p class="small muted" data-t="selectHint"></p>
      <div class="lv-team-cols" id="lv-ct-cols"></div>
      <div class="lv-unassigned" id="lv-ct-loose"><h4 class="lv-h3" data-t="unassigned"></h4><div class="lv-chips"></div></div>
      <p class="sr-only" id="lv-ct-live" aria-live="polite"></p>
      <div class="row lv-class-acts"><button class="btn btn-primary" type="button" data-ct="save"></button> <button class="btn" type="button" data-ct="cancel"></button>
        ${hasSaved ? '<button class="btn btn-sm lv-p-remove" type="button" data-ct="forget"></button>' : ''}</div>`;
    // all text set as text (never markup)
    wrap.querySelector('label[for="lv-ct-n"]').textContent = T.count;
    const label = { balance: `⚖️ ${T.balance}`, shuffle: `🔀 ${T.shuffle}`, save: T.save, cancel: T.cancel, forget: T.forgetLast };
    for (const b of wrap.querySelectorAll('[data-ct]')) b.textContent = label[b.dataset.ct];
    wrap.querySelector('summary').textContent = T.more; wrap.querySelector('legend').textContent = T.scoring;
    for (const el of wrap.querySelectorAll('[data-t]')) el.textContent = T[el.dataset.t];
    ui = teamBoard({ root: $('lv-ct-cols'), unassigned: $('lv-ct-loose'), live: $('lv-ct-live'), presets, text: { moveHere: T.moveHere, empty: T.empty, unassigned: T.unassigned, moved: T.moved, size: T.size },
      onMove: (seat, k) => { of.set(seat, k); draw(); } });
    wrap.addEventListener('change', onChange); wrap.addEventListener('click', onClick);
    draw();
  }
  function draw() {
    $('lv-ct-n').value = String(n);
    for (const r of wrap.querySelectorAll('input[name="lv-ct-scoring"]')) r.checked = r.value === scoring;
    const pp = $('lv-ct-presets'); pp.textContent = '';
    list().forEach(t => {
      const f = document.createElement('div'); f.className = 'field lv-preset-pick';
      const l = document.createElement('label'); l.htmlFor = `lv-ct-p${t.k}`; l.append(shapeSvg(presets[t.p].shape), ` ${presets[t.p].name}`); paintTeam(l, presets[t.p], t.k);
      const sel = document.createElement('select'); sel.id = `lv-ct-p${t.k}`; sel.dataset.k = t.k;
      presets.forEach((p, i) => { const o = document.createElement('option'); o.value = i; o.textContent = `${p.icon} ${p.name}`; o.selected = i === t.p; sel.append(o); });
      f.append(l, sel); pp.append(f);
    });
    ui.render({ list: list(), of, seats: students.map((s, i) => ({ seat: i + 1, name: s.name })), unassigned: true });
  }
  const sizes = () => { const z = new Map(list().map(t => [t.k, 0])); for (const k of of.values()) if (z.has(k)) z.set(k, z.get(k) + 1); return z; };
  const smallest = () => [...sizes()].sort((a, b) => a[1] - b[1] || a[0] - b[0])[0][0];
  const rnd = k => { const a = new Uint32Array(1); crypto.getRandomValues(a); return a[0] % k; };
  function balance() {
    for (let i = 1; i <= students.length; i++) if (!of.get(i) || of.get(i) > n) of.set(i, smallest());
    for (let guard = 0; guard < 2000; guard++) {
      const z = [...sizes()].sort((a, b) => a[1] - b[1]); const lo = z[0], hi = z[z.length - 1];
      if (hi[1] - lo[1] <= 1) break;
      const from = [...of].filter(([, k]) => k === hi[0]).map(([s]) => s).pop(); of.set(from, lo[0]);
    }
  }
  function shuffle() {
    const seats = students.map((_, i) => i + 1);
    for (let i = seats.length - 1; i > 0; i--) { const j = rnd(i + 1); [seats[i], seats[j]] = [seats[j], seats[i]]; }
    seats.forEach((s, i) => of.set(s, (i % n) + 1));
  }
  function onChange(e) {
    if (e.target.id === 'lv-ct-n') {
      const m = +e.target.value; if (m === n) return;
      if (m > n) { for (let k = n; k < m; k++) pre.push(ORDER.find(x => !pre.includes(x))); } else pre = pre.slice(0, m);
      n = m; for (const [s, k] of of) if (k > n) of.delete(s);
      balance(); draw();
    } else if (e.target.name === 'lv-ct-scoring') scoring = e.target.value;
    else if (e.target.dataset.k) {
      const k = +e.target.dataset.k, p = +e.target.value, old = pre[k - 1], other = pre.indexOf(p);
      if (other >= 0) pre[other] = old; pre[k - 1] = p; draw();
    }
  }
  async function onClick(e) {
    const b = e.target.closest('[data-ct]'); if (!b) return;
    const a = b.dataset.ct;
    if (a === 'balance') { balance(); draw(); }
    else if (a === 'shuffle') { shuffle(); draw(); }
    else if (a === 'cancel') { wrap.hidden = true; wrap.textContent = ''; open.hidden = false; open.disabled = false; open.focus(); }
    else if (a === 'save') {
      b.disabled = true;
      try {
        const plan = [...of].filter(([s, k]) => s >= 1 && s <= students.length && k >= 1 && k <= n).map(([s, k]) => [students[s - 1].id, k]);
        const r = await api(D.api, { method: 'PUT', body: { n, presets: pre, scoring, plan } });
        toast(r.toast || T.saved);
        const st = $('lv-class-teams-state'); if (st) st.textContent = fill(T.savedCount, { count: plan.length });
        wrap.hidden = true; wrap.textContent = ''; open.hidden = false; open.disabled = false;
      } catch (er) { toast(er.message, { bad: true }); b.disabled = false; }
    } else if (a === 'forget') {
      if (!confirm(T.forgetConfirm)) return;
      try { await api(D.api, { method: 'DELETE' }); const st = $('lv-class-teams-state'); if (st) st.textContent = T.notSaved; wrap.hidden = true; wrap.textContent = ''; open.hidden = false; open.disabled = false; }
      catch (er) { toast(er.message, { bad: true }); }
    }
  }
}
