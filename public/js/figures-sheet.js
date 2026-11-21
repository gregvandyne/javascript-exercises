// Figures, the worksheet builder (routes/figures.js GET /figures/worksheets/new and /:id). A worksheet is a title and
// figure questions in order. Each question can move up or down, be deleted, get new numbers from its generator, or open
// in the editor; "Add figure question" adds one of any kind; "Power with AI" drafts questions from a brief (the server
// checks every figure with OF.check and works every answer out with OF.solve). The print preview (student sheet and
// answer key, black on white) is the server's printable page. A new worksheet is saved the first time something is
// added to it. "Assign to class" picks one of the teacher's classes, open and due dates and "Show answers after the due
// date" (off by default), and makes a lesson with the worksheet's questions as they are now (services/figures-steps.js).
import { t, api, toast, esc, pageData, ask } from '/js/app.js';

const P = pageData('fg-sheet');
const app = document.getElementById('fg-sheet-app');
let W = null, ai = !!P.ai, tab = 'sheet', busy = false, note = '';
const kindName = id => (P.kinds.find(k => k.id === id) || { name: id }).name;

async function ensure() {
  if (W) return W.id;
  const r = await api('/api/figures/worksheets', { method: 'POST', body: { title: document.getElementById('fg-title').value || P.untitled } });
  W = r.worksheet; history.replaceState(null, '', `/figures/worksheets/${W.id}`);
  return W.id;
}
async function call(path, body = {}) {
  if (busy) return; busy = true; draw(true);
  try { const id = await ensure(); const r = await api(`/api/figures/worksheets/${encodeURIComponent(id)}${path}`, { method: 'POST', body }); if (r.worksheet) W = r.worksheet; return r; }
  catch (e) { toast(e.message, { bad: true }); return null; } finally { busy = false; draw(); }
}

function shell() {
  const groups = Object.entries(P.subjects).map(([s, name]) => `<optgroup label="${esc(name)}">${P.kinds.filter(k => k.subject === s).map(k => `<option value="${esc(k.id)}">${esc(k.name)}</option>`).join('')}</optgroup>`).join('');
  app.innerHTML = `<div class="fg-sh-head">
    <label class="fg-titlebox"><span class="sr-only">${esc(t('js.figures-sheet.title'))}</span><input class="input fg-titlein" id="fg-title" maxlength="80" placeholder="${esc(P.untitled)}"></label>
    <label class="fg-grade"><span>${esc(t('js.figures-sheet.grade'))}</span><select class="input" id="fg-grade"><option value="">${esc(t('js.figures-sheet.anyGrade'))}</option>${['K', ...Array.from({ length: 12 }, (_, i) => String(i + 1))].map(g => `<option value="${g}">${esc(t('js.figures-sheet.gradeN', { grade: g }))}</option>`).join('')}</select></label>
    <label class="fg-switch fg-aiswitch"><span>✨ ${esc(t('js.figures-sheet.powerAi'))}</span><input type="checkbox" id="fg-ai"${ai ? ' checked' : ''}></label></div>
  <div class="fg-sh-grid"><div class="fg-sh-main">
    <section class="fg-aibox" id="fg-aibox"${ai ? '' : ' hidden'}><h2><label for="fg-brief">${esc(t('js.figures-sheet.briefLabel'))}</label></h2>
      <textarea class="input" id="fg-brief" rows="3" maxlength="1000" placeholder="${esc(t('js.figures-sheet.briefHint'))}"></textarea>
      <div class="row"><label class="fg-count"><span>${esc(t('js.figures-sheet.howMany'))}</span><select class="input" id="fg-count">${[3, 4, 5, 6, 8, 10, 12].map(n => `<option${n === 6 ? ' selected' : ''}>${n}</option>`).join('')}</select></label>
      <button class="btn btn-primary" type="button" data-act="draft">✨ ${esc(t('js.figures-sheet.draft'))}</button></div>
      <p class="muted fg-small">${esc(t('js.figures-sheet.budget'))}</p></section>
    <div id="fg-note" role="status"></div>
    <ol class="fg-items" id="fg-items"></ol>
    <div class="panel fg-addq"><label class="fg-block"><span>${esc(t('js.figures-sheet.addLabel'))}</span><select class="input" id="fg-addkind">${groups}</select></label>
      <button class="btn btn-primary" type="button" data-act="add">+ ${esc(t('js.figures-sheet.add'))}</button></div>
  </div>
  <aside class="panel fg-preview" aria-label="${esc(t('js.figures-sheet.preview'))}"><div class="fg-pv-head"><h2>${esc(t('js.figures-sheet.preview'))}</h2><span class="muted fg-small">${esc(t('js.figures-sheet.paper'))}</span></div>
    <div class="chips" role="group"><button class="chip" type="button" data-tab="sheet">${esc(t('js.figures-sheet.studentSheet'))}</button><button class="chip" type="button" data-tab="key">${esc(t('js.figures-sheet.answerKey'))}</button></div>
    <div class="fg-paperwrap"><div class="fg-paper" id="fg-paper"></div></div>
    <div class="fg-pv-actions" id="fg-pv-actions"></div>
    <div class="fg-assign"><button class="btn" type="button" id="fg-assign-open" aria-expanded="false" aria-controls="fg-assign-form" aria-describedby="fg-assign-why" disabled>📅 ${esc(t('js.figures-sheet.assign'))}</button>
      <p class="muted fg-small" id="fg-assign-why"></p>
      <form class="fg-assignform" id="fg-assign-form" hidden novalidate aria-labelledby="fg-assign-h">
        <h3 id="fg-assign-h">${esc(t('js.figures-sheet.assignTitle'))}</h3>
        <label class="fg-block"><span>${esc(t('js.figures-sheet.assignClass'))}</span><select class="input" id="fg-as-class" name="classId">${(P.classes || []).map(c => `<option value="${esc(c.id)}">${esc(c.name)}${c.school && new Set((P.classes || []).map(x => x.school)).size > 1 ? ` (${esc(c.school)})` : ''}</option>`).join('')}</select></label>
        <div class="fg-as-dates"><label class="fg-block"><span>${esc(t('js.figures-sheet.assignOpens'))}</span><input class="input" type="date" id="fg-as-opens" name="opensAt"></label>
          <label class="fg-block"><span>${esc(t('js.figures-sheet.assignDue'))}</span><input class="input" type="date" id="fg-as-due" name="dueAt"></label></div>
        <label class="fg-check"><input type="checkbox" id="fg-as-show" name="showAnswers"> <span>${esc(t('js.figures-sheet.assignShow'))}</span></label>
        <p class="muted fg-small" id="fg-as-show-hint">${esc(t('js.figures-sheet.assignShowHint'))}</p>
        <p class="muted fg-small">${esc(t('js.figures-sheet.assignSnapshot'))}</p>
        <p class="err" id="fg-as-err" role="alert"></p>
        <div class="row"><button class="btn btn-primary" type="submit" id="fg-as-go">${esc(t('js.figures-sheet.assignGo'))}</button><button class="btn" type="button" id="fg-as-cancel">${esc(t('js.figures-sheet.assignCancel'))}</button></div>
      </form>
      <div id="fg-assign-done" role="status"></div></div>
  </aside></div>`;
}
function draw(wait = false) {
  const items = W ? W.items : [];
  const title = document.getElementById('fg-title');
  if (W && document.activeElement !== title) title.value = W.title;
  if (W && document.activeElement !== document.getElementById('fg-grade')) document.getElementById('fg-grade').value = W.grade || '';
  document.getElementById('fg-note').innerHTML = note;
  document.getElementById('fg-items').innerHTML = items.length ? items.map((it, i) => `<li class="fg-item" data-id="${esc(it.id)}">
    <span class="fg-n" aria-hidden="true">${i + 1}</span><div class="fg-ithumb">${it.svg}</div>
    <div class="fg-itext"><span class="fg-ikind">${esc(kindName(it.kind))}</span>
      <label class="sr-only" for="fg-q-${esc(it.id)}">${esc(t('js.figures-sheet.questionN', { n: i + 1 }))}</label>
      <textarea class="input fg-iq" id="fg-q-${esc(it.id)}" rows="2" maxlength="400" data-q placeholder="${esc(t('js.figures-sheet.questionHint'))}">${esc(it.question)}</textarea>
      <p class="fg-ians">${it.answer ? `${esc(t('js.figures-sheet.answer'))} <b>${esc(it.answer)}</b>` : `<span class="muted">${esc(t('js.figures-sheet.noAnswer'))}</span>`}</p></div>
    <div class="fg-iacts">
      <button class="btn fg-icon" type="button" data-act="up" aria-label="${esc(t('js.figures-sheet.up'))}" title="${esc(t('js.figures-sheet.up'))}"${i ? '' : ' disabled'}>↑</button>
      <button class="btn fg-icon" type="button" data-act="down" aria-label="${esc(t('js.figures-sheet.down'))}" title="${esc(t('js.figures-sheet.down'))}"${i < items.length - 1 ? '' : ' disabled'}>↓</button>
      <button class="btn fg-icon" type="button" data-act="regen" aria-label="${esc(t('js.figures-sheet.regen'))}" title="${esc(t('js.figures-sheet.regen'))}"${it.hasGen ? '' : ' disabled'}>⟳</button>
      <a class="btn fg-icon" href="/figures/${esc(it.kind)}?ws=${esc(W.id)}&amp;item=${esc(it.id)}" aria-label="${esc(t('js.figures-sheet.edit'))}" title="${esc(t('js.figures-sheet.edit'))}">✏️</a>
      <button class="btn fg-icon" type="button" data-act="del" aria-label="${esc(t('js.figures-sheet.delete'))}" title="${esc(t('js.figures-sheet.delete'))}">🗑️</button></div></li>`).join('')
    : `<li class="fg-empty muted">${esc(t('js.figures-sheet.empty'))}</li>`;
  for (const b of app.querySelectorAll('[data-tab]')) { const on = b.dataset.tab === tab; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); }
  document.getElementById('fg-paper').innerHTML = W && items.length ? (tab === 'key' ? W.preview.key : W.preview.sheet) : `<p class="muted">${esc(t('js.figures-sheet.previewEmpty'))}</p>`;
  document.getElementById('fg-pv-actions').innerHTML = W && items.length ? `<a class="btn btn-primary" href="/figures/worksheets/${esc(W.id)}/print?key=0">🖨️ ${esc(t('js.figures-sheet.print'))}</a>
    <a class="btn" href="/figures/worksheets/${esc(W.id)}/print?key=1">${esc(t('js.figures-sheet.printKey'))}</a>
    <button class="btn fg-danger" type="button" data-act="remove">${esc(t('js.figures-sheet.remove'))}</button>` : '';
  for (const b of app.querySelectorAll('button[data-act]')) if (wait) b.setAttribute('aria-busy', 'true'); else b.removeAttribute('aria-busy');
  // Assign to class: once the worksheet has questions, for a teacher with a class.
  const why = !(W && items.length) ? t('js.figures-sheet.assignEmpty') : !(P.classes || []).length ? t('js.figures-sheet.assignNoClasses') : '';
  const open = document.getElementById('fg-assign-open');
  open.disabled = !!why; document.getElementById('fg-assign-why').textContent = why;
  if (why) { document.getElementById('fg-assign-form').hidden = true; open.setAttribute('aria-expanded', 'false'); }
}
function assignUi() {
  const open = document.getElementById('fg-assign-open'), form = document.getElementById('fg-assign-form'), err = document.getElementById('fg-as-err');
  const show = v => { form.hidden = !v; open.setAttribute('aria-expanded', String(!!v)); if (v) { document.getElementById('fg-assign-done').innerHTML = ''; document.getElementById('fg-as-class').focus(); } };
  open.addEventListener('click', () => show(form.hidden));
  document.getElementById('fg-as-cancel').addEventListener('click', () => { show(false); open.focus(); });
  form.addEventListener('submit', async e => {
    e.preventDefault(); if (!W) return;
    err.textContent = '';
    const go = document.getElementById('fg-as-go'); go.disabled = true;
    const sel = document.getElementById('fg-as-class');
    const body = { classId: sel.value, opensAt: document.getElementById('fg-as-opens').value, dueAt: document.getElementById('fg-as-due').value, showAnswers: document.getElementById('fg-as-show').checked };
    try {
      const r = await api(`/api/figures/worksheets/${encodeURIComponent(W.id)}/assign`, { method: 'POST', body });
      const name = sel.options[sel.selectedIndex] ? sel.options[sel.selectedIndex].textContent : '';
      show(false); form.reset();
      document.getElementById('fg-assign-done').innerHTML = `<p class="notice good fg-small">${esc(t('js.figures-sheet.assignDone', { class: name }))}</p>
        <div class="row"><a class="btn btn-sm" href="${esc(r.view)}">${esc(t('js.figures-sheet.assignSee'))}</a><a class="btn btn-sm" href="${esc(r.progress)}">${esc(t('js.figures-sheet.assignProgress'))}</a></div>`;
      toast(t('js.figures-sheet.assignDone', { class: name }));
    } catch (x) { err.textContent = x.message; } finally { go.disabled = false; }
  });
}
const itemId = el => el.closest('[data-id]')?.dataset.id;
const ACTS = {
  async add() { const r = await call('/items', { kind: document.getElementById('fg-addkind').value }); if (r) { note = ''; draw(); } },
  up: b => call(`/items/${encodeURIComponent(itemId(b))}/move`, { dir: 'up' }),
  down: b => call(`/items/${encodeURIComponent(itemId(b))}/move`, { dir: 'down' }),
  regen: b => call(`/items/${encodeURIComponent(itemId(b))}/regen`),
  async del(b) { if (await ask({ title: t('js.figures-sheet.deleteQ'), ok: t('js.figures-sheet.delete'), danger: true })) call(`/items/${encodeURIComponent(itemId(b))}/delete`); },
  async remove() {
    if (!(await ask({ title: t('js.figures-sheet.removeQ'), text: t('js.figures-sheet.removeText'), ok: t('js.figures-sheet.remove'), danger: true }))) return;
    try { await api(`/api/figures/worksheets/${encodeURIComponent(W.id)}/delete`, { method: 'POST', body: {} }); location.href = '/figures'; } catch (e) { toast(e.message, { bad: true }); }
  },
  async draft() {
    const brief = document.getElementById('fg-brief').value.trim();
    if (brief.length < 3) { toast(t('js.figures-sheet.briefFirst'), { bad: true }); return; }
    note = `<p class="notice fg-small">${esc(t('js.figures-sheet.drafting'))}</p>`; draw(true);
    const r = await call('/draft', { brief, grade: document.getElementById('fg-grade').value, count: +document.getElementById('fg-count').value });
    if (!r) { note = ''; draw(); return; }
    const bits = [r.ai ? t('js.figures-sheet.drafted', { count: r.added }) : t('js.figures-sheet.resting', { count: r.added })];
    if (r.repaired) bits.push(t('js.figures-sheet.repaired', { count: r.repaired }));
    if (r.dropped) bits.push(t('js.figures-sheet.dropped', { count: r.dropped }));
    note = `<p class="notice ${r.ai ? 'good' : ''} fg-small">${esc(bits.join(' '))}</p>`; draw();
  },
};
async function boot() {
  shell();
  assignUi();
  if (P.id) { try { W = (await api(`/api/figures/worksheets/${encodeURIComponent(P.id)}`)).worksheet; } catch (e) { toast(e.message, { bad: true }); } }
  if (P.startAi && !ai) { ai = true; document.getElementById('fg-ai').checked = true; document.getElementById('fg-aibox').hidden = false; }
  draw();
  if (P.startAi) document.getElementById('fg-brief').focus();
  app.addEventListener('click', e => {
    const tb = e.target.closest('[data-tab]'); if (tb) { tab = tb.dataset.tab; draw(); return; }
    const b = e.target.closest('button[data-act]'); if (!b || b.disabled || busy) return;
    const f = ACTS[b.dataset.act]; if (f) f(b);
  });
  document.getElementById('fg-ai').addEventListener('change', async e => {
    ai = e.target.checked; document.getElementById('fg-aibox').hidden = !ai;
    try { await api('/api/figures/prefs', { method: 'POST', body: { ai } }); } catch { /* remembered next time */ }
  });
  const saveMeta = async () => { if (!W && !document.getElementById('fg-title').value.trim()) return; const id = await ensure().catch(() => null); if (!id) return;
    try { const r = await api(`/api/figures/worksheets/${encodeURIComponent(id)}`, { method: 'POST', body: { title: document.getElementById('fg-title').value, grade: document.getElementById('fg-grade').value } }); W = r.worksheet; draw(); } catch (e) { toast(e.message, { bad: true }); } };
  document.getElementById('fg-title').addEventListener('change', saveMeta);
  document.getElementById('fg-grade').addEventListener('change', saveMeta);
  app.addEventListener('change', async e => {
    const q = e.target.closest('[data-q]'); if (!q) return;
    await call(`/items/${encodeURIComponent(itemId(q))}`, { question: q.value });
  });
}
boot();
