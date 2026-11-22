// Figures, the worksheet builder (routes/figures.js GET /figures/worksheets/new and /:id). A worksheet is a title and
// figure questions in order. Each question can move up or down, be deleted, get new numbers from its generator, or open
// in the editor; "Add figure question" adds one of any kind; "Power with AI" drafts questions from a brief (the server
// checks every figure with OF.check and works every answer out with OF.solve). The print preview (student sheet and
// answer key, black on white) is the server's printable page. A new worksheet is saved the first time something is
// added to it. "Assign to class" picks one of the teacher's classes, open and due dates and "Show answers after the due
// date" (off by default), and makes a lesson with the worksheet's questions as they are now (services/figures-steps.js).
// Each question is answered with a number (any sign) or is multiple choice: 2 to 6 options, one marked right. A choice
// question from a generator has its right option worked out from the figure (OF.solve) until the teacher changes its
// options or marks another one.
// The same builder makes a test ("Build a test", purpose 'test': with "Power with AI" on, a topic, a grade and a subject
// draft a whole test from the question generators, so each question can be dealt new numbers) and a lesson's Figure
// step (purpose 'lesson': "Save to lesson" puts the questions in the step, in place of Assign). Kinds are picked by
// subject. A question's row is kept quiet (the owner's "less busy" rule): the row or its figure opens the editor, ⟳
// deals new numbers (only for a question from a generator), and ⋯ More has Move up, Move down, Swap figure and Delete
// (last, red, after a question). Alt+Arrow Up and Down move the question the keyboard is in.
import { t, api, toast, esc, pageData, ask, sheet } from '/js/app.js';
import { moreMenu, menuItem, menuSep, bindMenus } from '/js/figures-menu.js';

const P = pageData('fg-sheet');
const app = document.getElementById('fg-sheet-app');
let W = null, ai = !!P.ai, tab = 'sheet', busy = false, note = '';
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
/** "Power with AI" for a test: topic, subject, how many (the grade is the page's). */
const testAiBox = () => `<section class="fg-aibox" id="fg-aibox"${ai ? '' : ' hidden'}><h2>${esc(t('js.figures-sheet.testAiTitle'))}</h2>
      <label class="fg-block"><span>${esc(t('js.figures-sheet.topicLabel'))}</span><input class="input" id="fg-topic" maxlength="200" placeholder="${esc(t('js.figures-sheet.topicHint'))}"></label>
      <div class="row"><label class="fg-count"><span>${esc(t('js.figures-sheet.subject'))}</span><select class="input" id="fg-subject"><option value="">${esc(t('js.figures-sheet.anySubject'))}</option>${Object.entries(P.subjects).map(([s, name]) => `<option value="${esc(s)}">${esc(name)}</option>`).join('')}</select></label>
      <label class="fg-count"><span>${esc(t('js.figures-sheet.howMany'))}</span><select class="input" id="fg-count">${[4, 5, 6, 8, 10, 12].map(n => `<option${n === 8 ? ' selected' : ''}>${n}</option>`).join('')}</select></label>
      <button class="btn btn-primary" type="button" data-act="draftTest">✨ ${esc(t('js.figures-sheet.draftTest'))}</button></div>
      <p class="muted fg-small">${esc(t('js.figures-sheet.testBudget'))}</p></section>`;
/** By hand (AI off), and always: what a test is built from. */
const handNote = () => (TEST ? `<p class="muted fg-small" id="fg-hand"${ai ? ' hidden' : ''}>${esc(t('js.figures-sheet.byHand'))}</p>` : '');
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
    <label class="fg-switch fg-aiswitch"><span>✨ ${esc(t('js.figures-sheet.powerAi'))}</span><input type="checkbox" id="fg-ai"${ai ? ' checked' : ''}></label></div>
  <div class="fg-sh-grid"><div class="fg-sh-main">
    ${TEST ? testAiBox() : `<section class="fg-aibox" id="fg-aibox"${ai ? '' : ' hidden'}><h2><label for="fg-brief">${esc(t('js.figures-sheet.briefLabel'))}</label></h2>
      <textarea class="input" id="fg-brief" rows="3" maxlength="1000" placeholder="${esc(t('js.figures-sheet.briefHint'))}"></textarea>
      <div class="row"><label class="fg-count"><span>${esc(t('js.figures-sheet.howMany'))}</span><select class="input" id="fg-count">${[3, 4, 5, 6, 8, 10, 12].map(n => `<option${n === 6 ? ' selected' : ''}>${n}</option>`).join('')}</select></label>
      <button class="btn btn-primary" type="button" data-act="draft">✨ ${esc(t('js.figures-sheet.draft'))}</button></div>
      <p class="muted fg-small">${esc(t('js.figures-sheet.budget'))}</p></section>`}
    ${handNote()}
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
  document.getElementById('fg-items').innerHTML = items.length ? items.map((it, i) => `<li class="fg-item" data-id="${esc(it.id)}">
    <span class="fg-n" aria-hidden="true">${i + 1}</span><a class="fg-ithumb" id="fg-e-${esc(it.id)}" href="${esc(editHref(it))}" aria-label="${esc(t('js.figures-sheet.editN', { n: i + 1, kind: kindName(it.kind) }))}" title="${esc(t('js.figures-sheet.edit'))}">${it.svg}</a>
    <div class="fg-itext"><span class="fg-ikind">${esc(kindName(it.kind))}</span>
      <label class="sr-only" for="fg-q-${esc(it.id)}">${esc(t('js.figures-sheet.questionN', { n: i + 1 }))}</label>
      <textarea class="input fg-iq" id="fg-q-${esc(it.id)}" rows="2" maxlength="400" data-q placeholder="${esc(t('js.figures-sheet.questionHint'))}">${esc(it.question)}</textarea>
      ${answerUi(it, i)}
      <p class="fg-ians">${it.answer ? `${esc(t('js.figures-sheet.answer'))} <b>${esc(it.answer)}</b>` : `<span class="muted">${esc(t('js.figures-sheet.noAnswer'))}</span>`}</p></div>
    <div class="fg-iacts">
      ${it.hasGen ? `<button class="btn fg-icon" type="button" id="fg-rg-${esc(it.id)}" data-act="regen" aria-label="${esc(t('js.figures-sheet.regenN', { n: i + 1 }))}" title="${esc(t('js.figures-sheet.regen'))}"><span aria-hidden="true">⟳</span></button>` : ''}
      ${moreMenu({ label: t('js.figures-sheet.moreN', { n: i + 1 }), btnId: `fg-mb-${it.id}`, items: menuItem('up', t('js.figures-sheet.up'), { icon: '↑', attrs: i ? ' aria-keyshortcuts="Alt+ArrowUp"' : ' disabled' })
        + menuItem('down', t('js.figures-sheet.down'), { icon: '↓', attrs: i < items.length - 1 ? ' aria-keyshortcuts="Alt+ArrowDown"' : ' disabled' })
        + menuItem('swap', t('js.figures-sheet.swapMenu'), { icon: '⇄' }) + menuSep() + menuItem('del', t('js.figures-sheet.delete'), { danger: true, icon: '🗑' }) })}</div></li>`).join('')
    : `<li class="fg-empty muted">${esc(t('js.figures-sheet.empty'))}</li>`;
  if (had && document.getElementById(had)) document.getElementById(had).focus({ preventScroll: true });
  for (const b of app.querySelectorAll('[data-tab]')) { const on = b.dataset.tab === tab; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); }
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
  async draftTest() {
    const topic = document.getElementById('fg-topic').value.trim();
    if (topic.length < 3) { toast(t('js.figures-sheet.topicFirst'), { bad: true }); document.getElementById('fg-topic').focus(); return; }
    note = `<p class="notice fg-small">${esc(t('js.figures-sheet.drafting'))}</p>`; draw(true);
    const r = await call('/draft-test', { topic, grade: document.getElementById('fg-grade').value, subject: document.getElementById('fg-subject').value, count: +document.getElementById('fg-count').value });
    if (!r) { note = ''; draw(); return; }
    const bits = [r.ai ? t('js.figures-sheet.drafted', { count: r.added }) : t('js.figures-sheet.resting', { count: r.added })];
    if (r.repaired) bits.push(t('js.figures-sheet.repaired', { count: r.repaired }));
    if (r.dropped) bits.push(t('js.figures-sheet.dropped', { count: r.dropped }));
    bits.push(t('js.figures-sheet.checkFirst'));
    note = `<p class="notice ${r.ai ? 'good' : ''} fg-small">${esc(bits.join(' '))}</p>`; draw();
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
async function boot() {
  shell();
  assignUi();
  lessonUi();
  if (P.id) { try { W = (await api(`/api/figures/worksheets/${encodeURIComponent(P.id)}`)).worksheet; } catch (e) { toast(e.message, { bad: true }); } }
  if (P.startAi && !ai) { ai = true; document.getElementById('fg-ai').checked = true; document.getElementById('fg-aibox').hidden = false; }
  draw();
  if (P.startAi) document.getElementById(TEST ? 'fg-topic' : 'fg-brief').focus();
  app.addEventListener('click', e => {
    const tb = e.target.closest('[data-tab]'); if (tb) { tab = tb.dataset.tab; draw(); return; }
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
  document.getElementById('fg-ai').addEventListener('change', async e => {
    ai = e.target.checked; document.getElementById('fg-aibox').hidden = !ai;
    const hand = document.getElementById('fg-hand'); if (hand) hand.hidden = ai;
    try { await api('/api/figures/prefs', { method: 'POST', body: { ai } }); } catch { /* remembered next time */ }
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
    await call(`/items/${encodeURIComponent(itemId(q))}`, { question: q.value });
  });
}
boot();
