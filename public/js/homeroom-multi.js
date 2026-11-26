// Handing out several at once (docs/decisions.md "Homeroom: live games inside Homeroom, a simpler Find lessons"). The
// owner: "You should also be able to assign multiple lessons at once." Select in Find lessons (the laptop's panel and the
// phone's sheet) turns each card into a check: tap several (lessons, lesson plans, Manipulatives practice and a tool;
// never a live game, which is hosted instead), in the order they go on the desks. A bar under them says how many, with
// Hand out: the yellow bar then asks where (a desk, a group, a team or Whole class), and one sheet sets them all (In order
// or Any order in the order picked, one due day, each one's grading, the practice's number of questions, a note for any
// of them), then puts them on the desks one after another. Dragging the selection onto a desk or a group hands them all
// out there with the sheet's defaults. One Manipulatives tool runs in a class at a time (the bar says so).
import { t, api, toast, esc, sheet } from '/js/app.js';
import { iconHtml } from '/js/icons.js';
import { dueField, wireDue } from '/js/homeroom-due.js';

const tm = (k, v) => t(`js.homeroom-multi.${k}`, v);
const btn = (cls, attrs, label) => `<button type="button" class="${cls}" ${attrs}>${label}</button>`;
/** What kind a card is: game, lesson (a lesson plan), task (practice), tool (a Manipulatives tool), reading, mine (My desk only). */
export const kindOf = id => (id.startsWith('L:') ? 'lesson' : id.startsWith('T:task:') ? 'task' : id.startsWith('T:manip:') ? 'tool' : id.startsWith('R:') ? 'reading' : id.startsWith('T:') ? 'mine' : 'game');
const defaultGrade = k => (k === 'task' || k === 'lesson' ? 'score' : 'completion');

/**
 * ctx: { api2(path), setPick(p), onHanded(r), whoLabel(to), putLabel(to, who), emptyNote(to, who), gcField(to), gcPicked(form),
 * room: () => the Manipulatives room running in the class ({ tool }) or null }. -> the catalog's onSelect, plus pick(),
 * sheet(to, picks), direct(to, picks)
 */
export function multiSelect(ctx) {
  let on = false, items = [];
  const boxes = () => [...document.querySelectorAll('[data-catalog]')];
  const tools = () => items.filter(x => kindOf(x.id) === 'tool');
  function refresh() {
    for (const box of boxes()) {
      box.classList.toggle('hr-cselecting', on);
      const sb = box.querySelector('[data-cselect]'); if (sb) sb.setAttribute('aria-pressed', String(on));
      for (const b of box.querySelectorAll('[data-hritem]')) {
        const i = items.findIndex(x => x.id === b.dataset.hritem);
        b.classList.toggle('hr-csel', i >= 0);
        if (on) b.setAttribute('aria-checked', String(i >= 0)); else b.removeAttribute('aria-checked');
        const c = b.querySelector('.hr-ccheck'); if (c) c.textContent = i >= 0 ? String(i + 1) : '';
      }
      const bar = box.querySelector('[data-cselbar]'); if (!bar) continue;
      bar.hidden = !on;
      if (!on) { bar.innerHTML = ''; continue; }
      const many = tools().length > 1;
      bar.innerHTML = `<span class="hr-cselt"><b>${esc(tm('selected', { count: items.length }))}</b>${many ? `<span class="small">${esc(tm('oneTool'))}</span>` : items.length ? '' : `<span class="small">${esc(tm('hint'))}</span>`}</span>
        ${btn('btn btn-sm', 'data-msel="clear"', esc(tm('clear')))}${btn('btn btn-sm btn-primary hr-chunk', `data-msel="go"${items.length && !many ? '' : ' disabled'}`, `${iconHtml('👆', { size: 16 })} ${esc(tm('handOut'))}`)}`;
    }
  }
  function toggle() { on = !on; if (!on) items = []; refresh(); }
  function tap(b) {
    const id = b.dataset.hritem, k = kindOf(id);
    if (k === 'mine') { toast(tm('notThis')); return; }
    const i = items.findIndex(x => x.id === id);
    if (i >= 0) items.splice(i, 1); else items.push({ id, icon: b.dataset.icon || '🎮', title: b.querySelector('.hr-itemt')?.textContent || '' });
    refresh();
  }
  /** The selection as one pick: the yellow bar asks where. */
  function pick() {
    if (!items.length || tools().length > 1) return null;
    return { id: 'MULTI', multi: items.slice(), icon: '📚', title: tm('nItems', { count: items.length }) };
  }
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-msel]'); if (!b) return;
    if (b.dataset.msel === 'clear') { items = []; refresh(); return; }
    const p = pick(); if (!p) return;
    const sh = b.closest('.sheet-bg'); if (sh) sh.querySelector('.close')?.click();
    ctx.setPick(p);
  });
  /** One item's request body. */
  function bodyOf(x, to, common, per) {
    const k = kindOf(x.id), c = { to, instructions: per.ins || '' };
    if (k === 'tool') return { tool: x.id.slice(8), ...c };
    const g = { ...c, order: common.order, grade: per.grade || defaultGrade(k), ...common.due, gcPost: common.gcPost };
    if (k === 'task') return { task: x.id.slice(7), count: common.count, ...g };
    if (k === 'reading') return { reading: true, bookId: x.id.slice(2), ...g };
    if (k === 'lesson') return { lessonId: x.id.slice(2), to, order: common.order, grade: per.grade || 'score', ...common.due, gcPost: common.gcPost };
    return { gameId: x.id, ...g };
  }
  /** Put them on the desks one after another (the order picked); -> how many went, and the first refusal. */
  async function send(list, to, common, perOf) {
    let last = null, done = 0, err = '';
    for (const x of list) {
      try { last = await api(ctx.api2('handouts'), { method: 'POST', body: bodyOf(x, to, common, perOf(x)) }); done++; }
      catch (e) { if (!err) err = `${x.title}: ${e.message}`; }
    }
    if (last) ctx.onHanded(last);
    return { done, err };
  }
  /** Dropped on a desk or a group: all of them, with the sheet's defaults. */
  async function direct(to, list) {
    const r = await send(list, to, { order: 'in', due: {}, count: 5, gcPost: false }, () => ({}));
    const who = ctx.whoLabel(to);
    if (r.done) toast(tm('done', { count: r.done, who: who.label }));
    if (r.err) toast(r.err, { bad: true });
    ctx.setPick(null); items = []; on = false; refresh();
  }
  function multiSheet(to, list) {
    const who = ctx.whoLabel(to);
    if (!who.n && to.kind !== 'all') { toast(tm('emptyTarget'), { bad: true }); return; }
    const room = ctx.room(), tool = list.find(x => kindOf(x.id) === 'tool'), busyTool = tool && room && room.tool !== tool.id.slice(8) ? room : null;
    const gradeSel = x => { const k = kindOf(x.id); if (k === 'tool') return `<span class="small muted">${esc(tm('toolNote'))}</span>`;
      const v = defaultGrade(k), opts = [['score', tm('score')], ['completion', tm('completion')], ...(k === 'lesson' ? [] : [['none', tm('notGraded')]])];
      return `<label class="sr-only" for="hrm-g-${esc(x.id)}">${esc(tm('gradeFor', { title: x.title }))}</label><select class="input hrm-grade" id="hrm-g-${esc(x.id)}" data-mgrade="${esc(x.id)}">${opts.map(([o, l]) => `<option value="${o}"${o === v ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select>`; };
    const sh = sheet({
      title: `📚 ${tm('title', { count: list.length, who: who.label })}`,
      onClose: () => ctx.onClosed(),
      content: `<form class="hr-giveform hrm-form" novalidate><p class="small muted">${esc(tm('lead'))}</p>${ctx.emptyNote(to, who)}
        ${busyTool ? `<p class="hr-onetool" role="note">${esc(tm('toolBusy', { tool: busyTool.title || '' }))}</p>` : ''}
        <ol class="hrm-list">${list.map(x => `<li class="hrm-item"><div class="hrm-row"><span class="hr-cico" aria-hidden="true">${iconHtml(x.icon, { size: 20 })}</span><b dir="auto">${esc(x.title)}</b><span class="hrm-kind small muted">${esc(tm(`kind.${kindOf(x.id)}`))}</span>${gradeSel(x)}</div>
          <details class="hrm-note"><summary>${esc(tm('addNote'))}</summary><label class="sr-only" for="hrm-i-${esc(x.id)}">${esc(tm('noteFor', { title: x.title }))}</label><textarea class="input" rows="2" maxlength="300" id="hrm-i-${esc(x.id)}" data-mins="${esc(x.id)}"></textarea></details></li>`).join('')}</ol>
        ${list.some(x => kindOf(x.id) === 'task') ? `<label class="hr-label" for="hrm-count">${esc(tm('count'))}</label><input class="input hr-tcount" id="hrm-count" type="number" min="1" max="10" value="5" inputmode="numeric">` : ''}
        <p class="hr-label" id="hrm-order">${esc(tm('order'))}</p><div class="hr-seg" role="radiogroup" aria-labelledby="hrm-order">${[['in', tm('inOrder')], ['any', tm('anyOrder')]].map(([v, l]) => btn(`hr-segb${v === 'in' ? ' on' : ''}`, `role="radio" aria-checked="${v === 'in'}" data-mseg="${v}"`, esc(l))).join('')}</div>
        <p class="small muted hr-seghint">${esc(tm('orderHint'))}</p>
        ${dueField('hrm')}
        ${ctx.gcField(to)}
        <p class="err" id="hrm-err" aria-live="polite"></p>
        <div class="row hr-giveacts">${btn('btn', 'data-mgive="cancel"', esc(tm('cancel')))}<button class="btn btn-primary hr-giveok" type="submit"${busyTool ? ' disabled' : ''}>${esc(tm('put', { count: list.length }))}</button></div></form>`,
    });
    const f = sh.el.querySelector('form'), dueOf = wireDue(f); let order = 'in';
    f.addEventListener('click', e => {
      const s = e.target.closest('[data-mseg]');
      if (s) { order = s.dataset.mseg; for (const x of f.querySelectorAll('[data-mseg]')) { const o = x === s; x.classList.toggle('on', o); x.setAttribute('aria-checked', String(o)); } return; }
      if (e.target.closest('[data-mgive="cancel"]')) sh.close();
    });
    f.addEventListener('submit', async e => {
      e.preventDefault();
      const ok = f.querySelector('.hr-giveok'); ok.disabled = true;
      const per = x => ({ grade: f.querySelector(`[data-mgrade="${CSS.escape(x.id)}"]`)?.value, ins: f.querySelector(`[data-mins="${CSS.escape(x.id)}"]`)?.value || '' });
      const r = await send(list, to, { order, due: dueOf(), count: +(f.querySelector('#hrm-count')?.value) || 5, gcPost: ctx.gcPicked(f) }, per);
      if (r.err && !r.done) { f.querySelector('#hrm-err').textContent = r.err; ok.disabled = false; return; }
      sh.close(); ctx.setPick(null); items = []; on = false; refresh();
      toast(tm('done', { count: r.done, who: who.label }));
      if (r.err) toast(r.err, { bad: true });
    });
  }
  return { on: () => on, toggle, tap, refresh, reset: () => refresh(), pick, sheet: multiSheet, direct, has: id => on && items.some(x => x.id === id) };
}
