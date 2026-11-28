// Figures, the worksheet builder (routes/figures.js GET /figures/worksheets/new and /:id). A worksheet is a title and
// figure questions in order. Each question can move up or down, be deleted, get new numbers from its generator, or open
// in the editor; "Add figure question" adds one of any kind; Oomba (the site's one companion chat, public/js/companion.js,
// with this page's workflow: services/figures-chat.js)
// drafts the questions from the teacher's first message and adjusts them after ("make 3 and 7 harder and use inches"):
// the server checks every figure with OF.check and works every answer out with OF.solve; the questions Oomba changed are
// marked, and each answer has Undo. "Ask Oomba about this" (a question's More menu) quotes it into the chat. The print preview (student sheet and
// answer key, black on white) is the server's printable page. A new worksheet is saved the first time something is
// added to it. "Assign to class" picks one of the teacher's classes, open and due dates and "Show answers after the due
// date" (off by default), and makes a lesson with the worksheet's questions as they are now (services/figures-steps.js).
// Each question is answered with a number (any sign) or is multiple choice: 2 to 6 options, one marked right. A choice
// question from a generator has its right option worked out from the figure (OF.solve) until the teacher changes its
// options or marks another one.
// The same builder makes a test (purpose 'test': Oomba drafts it mostly from the question generators, so each question
// can be dealt new numbers) and a lesson's Figure
// step (purpose 'lesson': "Save to lesson" puts the questions in the step, in place of Assign). Kinds are picked by
// subject. A question's row is kept quiet (the owner's "less busy" rule): the row or its figure opens the editor, ⟳
// deals new numbers (only for a question from a generator), and ⋯ More has Move up, Move down, Swap figure and Delete
// (last, red, after a question). Alt+Arrow Up and Down move the question the keyboard is in.
import { t, api, toast, esc, pageData, ask, sheet } from '/js/app.js';
import { iconHtml } from '/js/icons.js';
import { moreMenu, menuItem, menuSep, bindMenus } from '/js/figures-menu.js';
import { oombaMark } from '/js/oomba-chat.js';
import * as BUS from '/js/oomba-bus.js';

const P = pageData('fg-sheet');
const app = document.getElementById('fg-sheet-app');
let W = null, tab = 'sheet', busy = false, note = '';
/** Oomba's chat; the questions its newest answer added or changed (marked until the teacher edits); the quoted one;
 *  with the chat open on a laptop, which half shows ('sheet' the questions, 'preview' the print preview). */
let chat = null, marked = new Set(), quoted = '', half = 'sheet';
const TEST = P.purpose === 'test', LESSON = !!P.lesson;
let pickSubject = Object.keys(P.subjects)[0];
const kindName = id => (P.kinds.find(k => k.id === id) || { name: id }).name;
const MAX_OPTS = 6, letter = k => String.fromCharCode(65 + k);
/** Blank option rows a teacher added that are not saved yet (the server keeps only options with words), per question. */
const blanks = {};
const optsOf = it => [...(it.choices || []), ...Array.from({ length: blanks[it.id] || 0 }, () => '')];
/** A question's answer type switch and, for multiple choice, its options with the right one marked. */
function answerUi(it, i) {
  const id = esc(it.id), choice = it.answerType === 'choice';
  const sw = `<fieldset class="fg-atype"><legend>${esc(t('js.figures-sheet.answerType'))}</legend>
    <label><input type="radio" name="fg-t-${id}" value="number" data-atype${choice ? '' : ' checked'}> ${esc(t('js.figures-sheet.typeNumber'))}</label>
    <label><input type="radio" name="fg-t-${id}" value="choice" data-atype${choice ? ' checked' : ''}> ${esc(t('js.figures-sheet.typeChoice'))}</label></fieldset>`;
  if (!choice) return sw;
  const opts = optsOf(it);
  const rows = opts.map((o, k) => `<div class="fg-opt" data-k="${k}">
      <label class="fg-oright" title="${esc(t('js.figures-sheet.markRight'))}"><input type="radio" name="fg-r-${id}" value="${k}" data-oright${it.correct === k ? ' checked' : ''}><span class="sr-only">${esc(t('js.figures-sheet.rightN', { letter: letter(k) }))}</span></label>
      <b aria-hidden="true">${letter(k)}</b>
      <label class="sr-only" for="fg-o-${id}-${k}">${esc(t('js.figures-sheet.optionN', { letter: letter(k), n: i + 1 }))}</label>
      <input class="input" id="fg-o-${id}-${k}" maxlength="80" value="${esc(o)}" data-otext dir="auto">
      <button class="btn fg-icon" type="button" data-act="odel" data-k="${k}" aria-label="${esc(t('js.figures-sheet.removeOption', { letter: letter(k) }))}" title="${esc(t('js.figures-sheet.removeOption', { letter: letter(k) }))}">✕</button></div>`).join('');
  const hint = String(it.answerKey || '').startsWith('gen:') ? t('js.figures-sheet.fromFigure') : opts.filter(Boolean).length < 2 ? t('js.figures-sheet.needTwo') : it.correct === null ? t('js.figures-sheet.needRight') : '';
  return `${sw}<fieldset class="fg-opts"><legend>${esc(t('js.figures-sheet.options'))}</legend>${rows}
    <div class="row"><button class="btn btn-sm" type="button" data-act="oadd" id="fg-oadd-${id}"${opts.length >= MAX_OPTS ? ' disabled' : ''}>+ ${esc(t('js.figures-sheet.addOption'))}</button></div>
    ${hint ? `<p class="muted fg-small">${esc(hint)}</p>` : ''}</fieldset>`;
}
/** What the option rows of a question say now, and which one is marked right. */
function readOpts(li) {
  const texts = [...li.querySelectorAll('[data-otext]')].map(x => x.value);
  const r = li.querySelector('[data-oright]:checked');
  return { texts, correct: r ? +r.value : null };
}
/** Save a question's options: the server keeps those with words (the blanks stay on screen until they are filled). */
async function saveOpts(li, texts, correct) {
  const id = li.dataset.id;
  blanks[id] = texts.filter(x => !x.trim()).length;
  await call(`/items/${encodeURIComponent(id)}`, { choices: texts, correct, answerKey: null });
}

async function ensure() {
  if (W) return W.id;
  const r = await api('/api/figures/worksheets', { method: 'POST', body: { title: document.getElementById('fg-title').value || P.untitled, purpose: TEST ? 'test' : 'worksheet' } });
  W = r.worksheet; history.replaceState(null, '', `/figures/worksheets/${W.id}`);
  return W.id;
}
async function call(path, body = {}) {
  if (busy) return; busy = true; draw(true);
  try { const id = await ensure(); const r = await api(`/api/figures/worksheets/${encodeURIComponent(id)}${path}`, { method: 'POST', body }); if (r.worksheet) W = r.worksheet; return r; }
  catch (e) { toast(e.message, { bad: true }); return null; } finally { busy = false; draw(); }
}

/** The kinds of one subject, as the Add picker's and Swap's options. */
const kindOptions = (s, sel = '') => P.kinds.filter(k => k.subject === s).map(k => `<option value="${esc(k.id)}"${k.id === sel ? ' selected' : ''}>${esc(k.name)}</option>`).join('');
const editHref = it => `/figures/${encodeURIComponent(it.kind)}?ws=${encodeURIComponent(W.id)}&item=${encodeURIComponent(it.id)}`;
/** The words for this set: a worksheet, a test or a lesson's figure questions. */
const NOUN = LESSON ? 'Lesson' : TEST ? 'Test' : '';
const allKindOptions = sel => Object.entries(P.subjects).map(([s, name]) => `<optgroup label="${esc(name)}">${kindOptions(s, sel)}</optgroup>`).join('');
/** The aside's last box: Save to lesson (a lesson's Figure step), else Assign to class. */
const lessonBox = () => `<div class="fg-assign fg-tolesson"><button class="btn btn-primary" type="button" id="fg-save-lesson" aria-describedby="fg-save-why"${P.lesson.started ? ' disabled' : ''}>💾 ${esc(t('js.figures-sheet.saveLesson'))}</button>
      <p class="muted fg-small" id="fg-save-why">${esc(P.lesson.started ? t('js.figures-sheet.lessonStarted') : t(P.lesson.stepId ? 'js.figures-sheet.saveLessonAgain' : 'js.figures-sheet.saveLessonHint', { title: P.lesson.title }))}</p>
      <p class="err" id="fg-save-err" role="alert"></p>
      <a class="btn btn-sm" href="/teach/lessons/${esc(P.lesson.id)}">${esc(t('js.figures-sheet.backToLesson'))}</a></div>`;
function shell() {
  const tabs = `<div class="chips fg-picktabs" role="group" aria-label="${esc(t('js.figures-sheet.subjects'))}">${Object.entries(P.subjects).map(([s, name]) => `<button class="chip${s === pickSubject ? ' on' : ''}" type="button" data-pick="${esc(s)}" aria-pressed="${s === pickSubject}">${esc(name)}</button>`).join('')}</div>`;
  app.innerHTML = `<div class="fg-sh-head">
    <label class="fg-titlebox"><span class="sr-only">${esc(t('js.figures-sheet.title'))}</span><input class="input fg-titlein" id="fg-title" maxlength="80" placeholder="${esc(P.untitled)}"></label>
    <label class="fg-grade"><span>${esc(t('js.figures-sheet.grade'))}</span><select class="input" id="fg-grade"><option value="">${esc(t('js.figures-sheet.anyGrade'))}</option>${['K', ...Array.from({ length: 12 }, (_, i) => String(i + 1))].map(g => `<option value="${g}">${esc(t('js.figures-sheet.gradeN', { grade: g }))}</option>`).join('')}</select></label>
    <button type="button" class="fg-oomba" id="fg-oomba">${oombaMark(26)}<span>${esc(t('js.figures-sheet.oomba'))}</span></button></div>
  <div class="chips fg-halves" role="group" aria-label="${esc(t('js.figures-sheet.halves'))}"><button class="chip" type="button" data-half="sheet">${esc(t('js.figures-sheet.halfSheet'))}</button><button class="chip" type="button" data-half="preview">${esc(t('js.figures-sheet.preview'))}</button></div>
  <div class="fg-sh-grid"><div class="fg-sh-main">
    <div id="fg-note" role="status"></div><p class="sr-only" id="fg-moved" role="status" aria-live="polite"></p>
    <ol class="fg-items" id="fg-items"></ol>
    <div class="panel fg-addq">${tabs}<label class="fg-block"><span>${esc(t('js.figures-sheet.addLabel'))}</span><select class="input" id="fg-addkind">${kindOptions(pickSubject)}</select></label>
      <button class="btn btn-primary" type="button" data-act="add">+ ${esc(t('js.figures-sheet.add'))}</button></div>
  </div>
  <aside class="panel fg-preview" aria-label="${esc(t('js.figures-sheet.preview'))}"><div class="fg-pv-head"><h2>${esc(t('js.figures-sheet.preview'))}</h2><span class="muted fg-small">${esc(t('js.figures-sheet.paper'))}</span></div>
    <div class="chips" role="group"><button class="chip" type="button" data-tab="sheet">${esc(t('js.figures-sheet.studentSheet'))}</button><button class="chip" type="button" data-tab="key">${esc(t('js.figures-sheet.answerKey'))}</button></div>
    <div class="fg-paperwrap"><div class="fg-paper" id="fg-paper"></div></div>
    <div class="fg-pv-actions" id="fg-pv-actions"></div>
    ${LESSON ? lessonBox() : ''}<div class="fg-assign"${LESSON ? ' hidden' : ''}><button class="btn" type="button" id="fg-assign-open" aria-expanded="false" aria-controls="fg-assign-form" aria-describedby="fg-assign-why" disabled>📅 ${esc(t('js.figures-sheet.assign'))}</button>
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
  // Redrawing the list keeps the keyboard where it was (the same box, by its id).
  const had = document.activeElement && document.getElementById('fg-items').contains(document.activeElement) ? document.activeElement.id : '';
  document.getElementById('fg-items').innerHTML = items.length ? items.map((it, i) => `<li class="fg-item${marked.has(it.id) ? ' fg-marked' : ''}${quoted === it.id ? ' fg-quoted' : ''}" data-id="${esc(it.id)}">
    <span class="fg-n" aria-hidden="true">${i + 1}</span><a class="fg-ithumb" id="fg-e-${esc(it.id)}" href="${esc(editHref(it))}" aria-label="${esc(t('js.figures-sheet.editN', { n: i + 1, kind: kindName(it.kind) }))}" title="${esc(t('js.figures-sheet.edit'))}">${it.svg}</a>
    <div class="fg-itext"><span class="fg-ikind">${esc(kindName(it.kind))}${marked.has(it.id) ? ` <span class="fg-badge">${esc(t('js.figures-sheet.byOomba'))}</span>` : ''}${quoted === it.id ? ` <span class="fg-badge q">${esc(t('js.figures-sheet.inChat'))}</span>` : ''}</span>
      <label class="sr-only" for="fg-q-${esc(it.id)}">${esc(t('js.figures-sheet.questionN', { n: i + 1 }))}</label>
      <textarea class="input fg-iq" id="fg-q-${esc(it.id)}" rows="2" maxlength="400" data-q placeholder="${esc(t('js.figures-sheet.questionHint'))}">${esc(it.question)}</textarea>
      ${answerUi(it, i)}
      <p class="fg-ians">${it.answer ? `${esc(t('js.figures-sheet.answer'))} <b>${esc(it.answer)}</b>` : `<span class="muted">${esc(t('js.figures-sheet.noAnswer'))}</span>`}</p></div>
    <div class="fg-iacts">
      ${it.hasGen ? `<button class="btn fg-icon" type="button" id="fg-rg-${esc(it.id)}" data-act="regen" aria-label="${esc(t('js.figures-sheet.regenN', { n: i + 1 }))}" title="${esc(t('js.figures-sheet.regen'))}"><span aria-hidden="true">⟳</span></button>` : ''}
      ${moreMenu({ label: t('js.figures-sheet.moreN', { n: i + 1 }), btnId: `fg-mb-${it.id}`, items: menuItem('up', t('js.figures-sheet.up'), { icon: '↑', attrs: i ? ' aria-keyshortcuts="Alt+ArrowUp"' : ' disabled' })
        + menuItem('down', t('js.figures-sheet.down'), { icon: '↓', attrs: i < items.length - 1 ? ' aria-keyshortcuts="Alt+ArrowDown"' : ' disabled' })
        + menuItem('swap', t('js.figures-sheet.swapMenu'), { icon: '⇄' }) + menuItem('ask', t('js.figures-sheet.askOomba'), { icon: '💬' }) + menuSep() + menuItem('del', t('js.figures-sheet.delete'), { danger: true, icon: '🗑' }) })}</div></li>`).join('')
    // a saved worksheet not read yet: a neutral line, never "No questions yet" before it is known
    : !W && P.id ? `<li class="fg-empty muted">${esc(t('js.figures-sheet.loading'))}</li>`
    : `<li class="fg-empty muted">${esc(t(chat && chat.state().chat.pending ? 'js.figures-sheet.draftingHere' : 'js.figures-sheet.empty'))}</li>`;
  if (had && document.getElementById(had)) document.getElementById(had).focus({ preventScroll: true });
  for (const b of app.querySelectorAll('[data-tab]')) { const on = b.dataset.tab === tab; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); }
  for (const b of app.querySelectorAll('[data-half]')) { const on = b.dataset.half === half; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); }
  document.body.classList.toggle('fg-half-preview', half === 'preview');
  document.getElementById('fg-paper').innerHTML = W && items.length ? (tab === 'key' ? W.preview.key : W.preview.sheet) : `<p class="muted">${esc(t('js.figures-sheet.previewEmpty'))}</p>`;
  document.getElementById('fg-pv-actions').innerHTML = W && items.length ? `<a class="btn btn-primary" href="/figures/worksheets/${esc(W.id)}/print?key=0">🖨️ ${esc(t('js.figures-sheet.print'))}</a>
    <a class="btn" href="/figures/worksheets/${esc(W.id)}/print?key=1">${esc(t('js.figures-sheet.printKey'))}</a>
    <button class="btn fg-danger" type="button" data-act="remove">${esc(t(`js.figures-sheet.remove${NOUN}`))}</button>` : '';
  for (const b of app.querySelectorAll('button[data-act]')) if (wait) b.setAttribute('aria-busy', 'true'); else b.removeAttribute('aria-busy');
  // Assign to class: once the worksheet has questions, for a teacher with a class.
  const why = !(W && items.length) ? t('js.figures-sheet.assignEmpty') : !(P.classes || []).length ? t('js.figures-sheet.assignNoClasses') : '';
  const open = document.getElementById('fg-assign-open');
  open.disabled = !!why; document.getElementById('fg-assign-why').textContent = why;
  if (why) { document.getElementById('fg-assign-form').hidden = true; open.setAttribute('aria-expanded', 'false'); }
}
function assignUi() {
  const open = document.getElementById('fg-assign-open'), form = document.getElementById('fg-assign-form'), err = document.getElementById('fg-as-err');
  const show = v => { form.hidden = !v; open.setAttribute('aria-expanded', String(!!v)); if (v) { document.getElementById('fg-assign-done').innerHTML = ''; form.scrollIntoView({ block: 'nearest' }); document.getElementById('fg-as-class').focus({ preventScroll: true }); } };
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
  up: b => move(itemId(b), 'up', b),
  down: b => move(itemId(b), 'down', b),
  regen: b => call(`/items/${encodeURIComponent(itemId(b))}/regen`),
  oadd(b) {
    const li = b.closest('[data-id]'), id = li.dataset.id, it = W.items.find(x => x.id === id); if (!it) return;
    if (optsOf(it).length >= MAX_OPTS) return;
    blanks[id] = (blanks[id] || 0) + 1; draw();
    const k = optsOf(it).length - 1, el = document.getElementById(`fg-o-${id}-${k}`); if (el) el.focus();
  },
  async odel(b) {
    const li = b.closest('[data-id]'), k = +b.dataset.k, { texts, correct } = readOpts(li);
    const id = li.dataset.id, it = W.items.find(x => x.id === id);
    if (!texts[k].trim() && it && k >= (it.choices || []).length) { blanks[id] = Math.max(0, (blanks[id] || 0) - 1); draw(); document.getElementById(`fg-oadd-${id}`)?.focus(); return; }
    texts.splice(k, 1);
    await saveOpts(li, texts, correct === k ? null : correct !== null && correct > k ? correct - 1 : correct);
    document.getElementById(`fg-oadd-${id}`)?.focus();
  },
  async del(b) {
    const id = itemId(b), i = W.items.findIndex(x => x.id === id);
    if (!(await ask({ title: t('js.figures-sheet.deleteQ', { n: i + 1 }), text: t('js.figures-sheet.deleteText'), ok: t('js.figures-sheet.delete'), danger: true }))) return;
    const r = await call(`/items/${encodeURIComponent(id)}/delete`); if (!r) return;
    // The keyboard goes to the question that took its place (or the one before it, or Add).
    const next = W.items[Math.min(i, W.items.length - 1)];
    (next ? document.getElementById(`fg-mb-${next.id}`) : document.getElementById('fg-addkind'))?.focus();
  },
  async remove() {
    if (!(await ask({ title: t(`js.figures-sheet.remove${NOUN}Q`), text: t(LESSON ? 'js.figures-sheet.removeLessonText' : 'js.figures-sheet.removeText'), ok: t(`js.figures-sheet.remove${NOUN}`), danger: true }))) return;
    try { await api(`/api/figures/worksheets/${encodeURIComponent(W.id)}/delete`, { method: 'POST', body: {} }); location.href = LESSON ? `/teach/lessons/${encodeURIComponent(P.lesson.id)}` : '/figures'; } catch (e) { toast(e.message, { bad: true }); }
  },
  /** Swap figure: another kind in the same place (a box with the kinds, by subject). */
  swap(b) {
    const id = itemId(b), it = W.items.find(x => x.id === id); if (!it) return;
    const n = W.items.indexOf(it) + 1;
    const sh = sheet({ title: t('js.figures-sheet.swapTitle', { n }), content: `<form class="fg-swapform" novalidate><label class="fg-block"><span>${esc(t('js.figures-sheet.swapLabel'))}</span><select class="input" id="fg-swapkind" data-swapkind>${allKindOptions(it.kind)}</select></label>
      <p class="muted fg-small">${esc(t('js.figures-sheet.swapHint'))}</p><div class="row"><button class="btn btn-primary" type="submit">${esc(t('js.figures-sheet.swap'))}</button></div></form>` });
    setTimeout(() => sh.el.querySelector('#fg-swapkind')?.focus(), 40);
    sh.el.querySelector('form').addEventListener('submit', async e => {
      e.preventDefault();
      const kind = sh.el.querySelector('#fg-swapkind').value;
      sh.close();
      await call(`/items/${encodeURIComponent(id)}/swap`, { kind });
      document.getElementById(`fg-mb-${id}`)?.focus();
    });
  },
  /** "Ask Oomba about this": the question, quoted above the chat's message box. */
  ask(b) {
    const id = itemId(b), i = W.items.findIndex(x => x.id === id); if (i < 0 || !chat) return;
    quoted = id; draw();
    const q = W.items[i].question;
    chat.quote({ ref: `${W.id}:${id}`, html: `<b>${esc(t('js.figures-sheet.questionN', { n: i + 1 }))}:</b> ${esc(q)}` });
  },
};
/** Move a question up or down (⋯ More, or Alt+Arrow): the keyboard stays with it, and a screen reader hears where. */
async function move(id, dir, from) {
  const i = W.items.findIndex(x => x.id === id), j = dir === 'up' ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= W.items.length) return;
  const focusId = from && from.id && from.id.startsWith('fg-') && !from.closest('.fg-mm-list') ? from.id : `fg-mb-${id}`;
  const r = await call(`/items/${encodeURIComponent(id)}/move`, { dir });
  if (!r) return;
  document.getElementById(focusId)?.focus({ preventScroll: false });
  const said = document.getElementById('fg-moved'); if (said) { said.textContent = ''; setTimeout(() => { said.textContent = t('js.figures-sheet.movedTo', { n: j + 1 }); }, 30); }
}
function lessonUi() {
  const go = document.getElementById('fg-save-lesson'); if (!go) return;
  go.addEventListener('click', async () => {
    const err = document.getElementById('fg-save-err'); err.textContent = '';
    if (!W || !W.items.length) { err.textContent = t('js.figures-sheet.assignEmpty'); return; }
    go.disabled = true;
    try { const r = await api(`/api/figures/worksheets/${encodeURIComponent(W.id)}/save-to-lesson`, { method: 'POST', body: {} }); location.href = r.redirect; }
    catch (x) { err.textContent = x.message; go.disabled = false; }
  });
}
// ---------------------------------------------------------------- Oomba's chat
const listN = ns => ns.join(', ');
/** A unit's name in the page's language ("inches"), from the browser's own unit names; else its symbol. */
const UNIT_NAMES = { mm: 'millimeter', cm: 'centimeter', m: 'meter', km: 'kilometer', in: 'inch', ft: 'foot', yd: 'yard', mi: 'mile' };
function unitName(u) {
  try { const p = new Intl.NumberFormat(document.documentElement.lang || 'en', { style: 'unit', unit: UNIT_NAMES[u], unitDisplay: 'long' }).formatToParts(2).find(x => x.type === 'unit'); return p ? p.value : u; } catch { return u; }
}
async function reload() { if (!W) return; try { W = (await api(`/api/figures/worksheets/${encodeURIComponent(W.id)}`, { background: true })).worksheet; } catch { /* next time */ } BUS.setPage(BUS.page()); draw(); }
function showMarked() {
  half = 'sheet'; draw();
  const first = W && W.items.find(x => marked.has(x.id));
  const li = first && app.querySelector(`.fg-item[data-id="${CSS.escape(first.id)}"]`);
  if (li) { li.scrollIntoView({ block: 'center', behavior: 'smooth' }); document.getElementById(`fg-q-${first.id}`)?.focus({ preventScroll: true }); }
}
/** Checked work, on the screen (docs/decisions.md "Builders check their work"): every question Oomba's change added or
 *  changed is drawn on the page now. If one is not, the worksheet is loaded again once; still not, the teacher is told. */
async function onScreen(x) {
  const ids = x.change.ids || [];
  const missing = () => ids.filter(id => !app.querySelector(`.fg-item[data-id="${CSS.escape(id)}"]`));
  if (!missing().length || tab !== 'sheet' || !app.querySelector('.fg-item[data-id]')) return;
  await reload();
  if (missing().length && W && W.items.some(it => ids.includes(it.id))) toast(t('js.figures-sheet.notOnScreen'));
}
/** "What changed" under one of Oomba's answers, from the server's summary of the change. */
function changeHtml(x) {
  const c = x.change, lines = [];
  if (c.first || (!c.changed.length && !c.removed.length && c.added.length && c.added.length === c.count)) lines.push(t('js.figures-sheet.chAddedAll', { count: c.added.length }));
  else if (c.added.length) lines.push(t('js.figures-sheet.chAdded', { count: c.added.length, list: listN(c.added) }));
  if (c.changed.length) lines.push(t('js.figures-sheet.chChanged', { count: c.changed.length, list: listN(c.changed) }));
  if (c.removed.length) lines.push(t('js.figures-sheet.chRemoved', { count: c.removed.length, list: listN(c.removed) }));
  if (c.units) lines.push(t('js.figures-sheet.chUnits', { unit: unitName(c.units), count: c.unitsOn }));
  if (c.title) lines.push(t('js.figures-sheet.chTitle', { title: c.title }));
  if (c.grade) lines.push(t('js.figures-sheet.chGrade', { grade: c.grade }));
  if (c.repaired || c.dropped) lines.push(t('js.figures-sheet.chRepaired', { count: c.repaired + c.dropped }));
  lines.push(t('js.figures-sheet.chAnswers'));
  return `<p><b>${iconHtml('✓', { size: 16 })} ${esc(t('js.figures-sheet.chTitleWhat'))}</b></p><ul class="oc-list">${lines.map(l => `<li>${esc(l)}</li>`).join('')}</ul>`;
}
/** This page's workflow in Oomba, the site's one companion chat (public/js/oomba-bus.js, services/companion.js with
 *  services/figures-chat.js): the companion knows this worksheet, drafts and changes it (each answer with Undo), quotes a
 *  question ("Ask Oomba about this") and offers "Add a starter set instead" when it could not draft. */
const mine = x => !!(x && x.change && x.change.kind === 'figures' && W && x.change.sheetId === W.id);
const meOf = (c, x) => (c && x ? c.turns.find(y => y.id === x.for) : null);
function chatUi() {
  const opener = document.getElementById('fg-oomba');
  const empty = () => !W || !W.items.length;
  BUS.setPage({
    kind: 'figures',
    page: () => (W ? { type: 'figures-sheet', sheetId: W.id } : { type: 'figures' }),
    label: () => (W && W.title) || document.getElementById('fg-title')?.value || P.untitled,
    ensure: async () => { await ensure(); },
    // The second line under Oomba's greeting on this page (no example prompts: nothing is typed for the teacher).
    hello: () => t(empty() ? (TEST ? 'js.figures-sheet.greetLineTest' : 'js.figures-sheet.greetLine') : 'js.figures-sheet.greetLineHas'),
    ready: () => !P.id || !!W,
    placeholder: () => t(empty() ? 'js.figures-sheet.placeholderEmpty' : 'js.figures-sheet.placeholder'),
    change: x => (x.change && x.change.kind === 'figures' ? changeHtml(x) : undefined),
    changeLinks: x => (mine(x) && !x.change.first && x.change.ids && x.change.ids.length ? `<a href="#fg-items" data-c="act" data-act="show" data-turn="${esc(x.id)}">${esc(t('js.figures-sheet.showMe'))}</a>` : ''),
    note: x => (x.note && x.note.starter ? `<span>${esc(t('js.figures-sheet.starterDone'))}</span>` : ''),
    extra: (x, c) => { const me = meOf(c, x); return x.failed && !x.starter && empty() && me && me.meta && me.meta.page && W && me.meta.page.sheetId === W.id && ['resting', 'timeout', 'busy', 'error', 'restart'].includes(x.failed)
      ? `<button type="button" class="btn btn-sm" data-c="act" data-act="starter" data-turn="${esc(x.id)}">${esc(t('js.figures-sheet.starter'))}</button>` : ''; },
    async onAct(act, turn) {
      if (act === 'show') { if (turn && turn.change) marked = new Set(turn.change.ids || []); showMarked(); return null; }
      if (act === 'starter' && turn) {
        try { const r = await api('/api/companion/chat/act', { method: 'POST', body: { turnId: turn.id, act: 'starter' } }); marked = new Set(); await reload(); return r; }
        catch (e) { toast(e.message, { bad: true }); return null; }
      }
      return undefined;
    },
    // A first draft marks nothing (every question is new); a later change marks the questions it added or changed.
    onAnswer(x) { if (mine(x)) { marked = new Set(x.change.first ? [] : x.change.ids || []); quoted = ''; } reload().then(() => { if (mine(x)) onScreen(x); }); },
    onUndo() { marked = new Set(); reload(); },
    onQuote(q) { if (!q && quoted) { quoted = ''; draw(); } },
    onSync() { if (!busy) draw(); },
    onMode(mode) {
      if (opener) { opener.setAttribute('aria-expanded', String(mode === 'open')); opener.classList.toggle('on', mode === 'open'); }
      if (mode !== 'open') { quoted = ''; }
      draw();
      api('/api/figures/prefs', { method: 'POST', body: { ai: mode === 'open' }, background: true }).catch(() => {});
    },
    // Open by itself on a laptop for a new, empty worksheet or test (the teacher's choice is remembered: Power with AI's
    // old switch), and after "Describe what you need"; a lesson's figure questions start by hand, Oomba one tap away.
    start: () => (P.startAi || new URLSearchParams(location.search).get('ai') === '1' || (P.ai && !LESSON && empty() && window.matchMedia('(min-width: 900px)').matches) ? 'open' : 'closed'),
  });
  // Drawn again once the chat is here: a worksheet Oomba is drafting says so at once ("Oomba is drafting your
  // questions"), never "No questions yet" while the answer runs (the owner's live audit, 27 Nov 2026).
  BUS.whenChat(c => { chat = c; draw(); if (opener) opener.addEventListener('click', () => c.setMode(c.state().mode === 'open' ? 'closed' : 'open')); });
}
async function boot() {
  // The server sends the worksheet with the page (its real title and questions on the first paint); read it only when not.
  if (P.worksheet) W = P.worksheet;
  shell();
  assignUi();
  lessonUi();
  chatUi();
  if (!W && P.id) { try { W = (await api(`/api/figures/worksheets/${encodeURIComponent(P.id)}`)).worksheet; } catch (e) { toast(e.message, { bad: true }); } }
  BUS.setPage(BUS.page());   // the "Sees:" line takes the worksheet's title
  draw();
  app.addEventListener('click', e => {
    const tb = e.target.closest('[data-tab]'); if (tb) { tab = tb.dataset.tab; draw(); return; }
    const hb = e.target.closest('[data-half]'); if (hb) { half = hb.dataset.half; draw(); return; }
    const pk = e.target.closest('[data-pick]');
    if (pk) { pickSubject = pk.dataset.pick; for (const c of app.querySelectorAll('[data-pick]')) { const on = c === pk; c.classList.toggle('on', on); c.setAttribute('aria-pressed', String(on)); } document.getElementById('fg-addkind').innerHTML = kindOptions(pickSubject); return; }
    const b = e.target.closest('button[data-act]'); if (b) { if (!b.disabled && !busy) { const f = ACTS[b.dataset.act]; if (f) f(b); } return; }
    // The row itself opens the figure in the editor (not its boxes, buttons, links or menu).
    const li = e.target.closest('.fg-item[data-id]');
    if (li && !e.target.closest('a,button,input,textarea,select,label,fieldset,.fg-mm') && W) { const it = W.items.find(x => x.id === li.dataset.id); if (it) location.href = editHref(it); }
  });
  bindMenus(app, it => { if (busy) return; const f = ACTS[it.dataset.mi]; if (f) f(it); });
  // Alt+Arrow Up/Down moves the question the keyboard is in (not while typing in a box, where the keys move the caret).
  app.addEventListener('keydown', e => {
    if (!e.altKey || e.ctrlKey || e.metaKey || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
    const li = e.target.closest('.fg-item[data-id]'); if (!li || e.target.closest('input[type="text"],input:not([type]),textarea,.fg-mm-list') || busy) return;
    e.preventDefault(); move(li.dataset.id, e.key === 'ArrowUp' ? 'up' : 'down', e.target);
  });
  const saveMeta = async () => { if (!W && !document.getElementById('fg-title').value.trim()) return; const id = await ensure().catch(() => null); if (!id) return;
    try { const r = await api(`/api/figures/worksheets/${encodeURIComponent(id)}`, { method: 'POST', body: { title: document.getElementById('fg-title').value, grade: document.getElementById('fg-grade').value } }); W = r.worksheet; draw(); } catch (e) { toast(e.message, { bad: true }); } };
  document.getElementById('fg-title').addEventListener('change', saveMeta);
  document.getElementById('fg-grade').addEventListener('change', saveMeta);
  app.addEventListener('change', async e => {
    const li = e.target.closest('[data-id]');
    if (li && e.target.matches('[data-atype]')) {
      const choice = e.target.value === 'choice', it = W && W.items.find(x => x.id === li.dataset.id);
      if (choice && it && !(it.choices || []).length) blanks[it.id] = 2;
      await call(`/items/${encodeURIComponent(li.dataset.id)}`, { answerType: choice ? 'choice' : 'number' });
      return;
    }
    if (li && (e.target.matches('[data-otext]') || e.target.matches('[data-oright]'))) { const { texts, correct } = readOpts(li); await saveOpts(li, texts, correct); return; }
    const q = e.target.closest('[data-q]'); if (!q) return;
    marked.delete(itemId(q));
    await call(`/items/${encodeURIComponent(itemId(q))}`, { question: q.value });
  });
}
boot();
