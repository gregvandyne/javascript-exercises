// Manipulatives: a tool's tasks as practice (docs/decisions.md "Manipulatives: tasks you can practice and assign").
//   - #practice/<tool>: the tool's task list. Students: tap a task to practice it ("3 right in a row" on the ones they
//     have practiced; no rankings). Teachers also see each task's notes, Common Core code and grade, Preview (try it
//     yourself, as a student sees it) and Assign; ticking tasks assigns several at once;
//   - Assign: a sheet (the site's own): the tasks, how many questions of each (5 by default), the class, open and due
//     days. It makes a class lesson (POST /api/manipulatives/assign): each student gets their own variations;
//   - the student's home lists every tool with how many tasks it has to practice;
//   - the tool view's task box and the Task library get the same Practice / Preview / Assign buttons (actionsHtml).
import { t, api, toast, esc, sheet } from '/js/app.js';
import { iconHtml, toolIconHtml } from '/js/icons.js';
import { TOOLS, CATS, toolOf } from '/js/manip-data.js';
import { TASKS, isPractice, idOf } from '/js/manip-tasks.js';

const tl = (k, v) => t(`js.manip-task-list.${k}`, v);
const btn = (cls, attrs, label) => `<button type="button" class="${cls}" ${attrs}>${label}</button>`;
export const COUNT_DEFAULT = 5, COUNT_MAX = 10;

/** The buttons under a task: Practice (students), Preview and Assign (teachers); '' for a task not yet practice. */
export function actionsHtml(slug, task, host) {
  if (!isPractice(task)) return '';
  const href = `#practice/${esc(slug)}/${esc(task.key)}`;
  return `<div class="row mp-taskacts">${host ? `<a class="btn btn-sm" href="${href}">${iconHtml('👀', { size: 16 })} ${esc(tl('preview'))}</a>${btn('btn btn-sm btn-primary', `data-assign="${esc(idOf(slug, task))}"`, `${iconHtml('📤', { size: 16 })} ${esc(tl('assign'))}`)}`
    : `<a class="btn btn-sm btn-primary" href="${href}">${iconHtml('▶️', { size: 16 })} ${esc(tl('practice'))}</a>`}</div>`;
}
/** A progress line for a task the person has practiced ("3 right in a row", "Solved 5"). */
const progressHtml = p => (!p || !p.solved ? '' : `<span class="mp-streak small">${p.streak >= 2 ? `${iconHtml('⭐', { size: 14 })} ${esc(tl('streak', { n: p.streak }))}` : esc(tl('solved', { n: p.solved }))}</span>`);

/** #practice/<tool>: the tool's tasks. state: the page's STATE (practice counts, assignTo). */
export function listView(root, slug, { host, state }) {
  const tool = toolOf(slug), list = TASKS[slug] || [], n = list.filter(isPractice).length;
  root.innerHTML = `<div class="pagehead"><h1>${toolIconHtml(slug, { size: 40 })} ${esc(tl('title', { tool: tool.name }))}</h1><a class="btn btn-sm" href="#${esc(slug)}">${iconHtml('🧮', { size: 18 })} ${esc(tl('openTool'))}</a><a class="btn btn-sm" href="#">${esc(tl('allTools'))}</a></div>
    <p class="mp-lead">${esc(n ? tl(host ? 'leadHost' : 'lead', { n }) : tl('noneYet'))}</p>
    ${host && n ? `<div class="row mp-tlbar"><span class="small muted" id="mp-tlpicked" role="status"></span>${btn('btn btn-sm', 'id="mp-tlassign" disabled', `${iconHtml('📤', { size: 16 })} ${esc(tl('assignPicked'))}`)}</div>` : ''}
    <ol class="plain mp-tlist">${list.map(task => {
      const id = idOf(slug, task), on = isPractice(task), p = (state.practice || {})[id];
      return `<li class="panel mp-tlrow${on ? '' : ' off'}">${host && on ? `<label class="mp-tlpick"><input type="checkbox" data-pick="${esc(id)}"><span class="sr-only">${esc(tl('pick', { title: task.title }))}</span></label>` : ''}
        <div class="mp-tlbody"><p class="row mp-tlhead"><b class="mp-tltitle">${esc(task.title)}</b><span class="mp-tag">${esc(tl('grade', { grade: task.grade }))}</span>${host ? `<span class="mp-tag">${esc(task.ccss)}</span>` : ''}${progressHtml(p)}</p>
          <p class="small">${esc(task.prompt)}</p>${host ? `<p class="small muted"><b>${esc(tl('teacherNote'))}</b> ${esc(task.notes)}</p>` : ''}
          ${on ? actionsHtml(slug, task, host) : `<p class="small muted">${esc(tl('soon'))}</p>`}</div></li>`;
    }).join('')}</ol>`;
  if (host) {
    const picked = () => [...root.querySelectorAll('[data-pick]:checked')].map(x => x.dataset.pick);
    const b = root.querySelector('#mp-tlassign'), line = root.querySelector('#mp-tlpicked');
    root.addEventListener('change', e => { if (!e.target.matches('[data-pick]')) return; const k = picked().length; if (b) b.disabled = !k; if (line) line.textContent = k ? tl('picked', { n: k }) : ''; });
    if (b) b.onclick = () => assignSheet(picked(), state);
  }
}
/** Assign buttons anywhere on the page open the sheet (the task box, the Task library, the list). */
export function bindAssign(state) {
  document.addEventListener('click', e => { const b = e.target.closest && e.target.closest('[data-assign]'); if (b) { e.preventDefault(); assignSheet([b.dataset.assign], state); } });
}

/** The Assign sheet: the tasks, questions of each, the class, open and due days. */
export function assignSheet(ids, state) {
  const all = Object.entries(TASKS).flatMap(([slug, l]) => l.filter(isPractice).map(task => ({ slug, task, id: idOf(slug, task) })));
  const picked = all.filter(x => ids.includes(x.id));
  if (!picked.length) return;
  const classes = state.assignTo || [];
  const { el, close } = sheet({ title: `📤 ${tl('assignTitle')}`, content: `<form class="mp-assign" novalidate>
    <p class="small muted">${esc(tl('assignLead'))}</p>
    <ul class="plain mp-assignlist">${picked.map(x => `<li>${toolIconHtml(x.slug, { size: 20 })} <b>${esc(x.task.title)}</b> <span class="small muted">${esc(tl('grade', { grade: x.task.grade }))} · ${esc(x.task.ccss)}</span></li>`).join('')}</ul>
    <label class="mp-set mp-block"><span>${esc(tl('count'))}</span><input class="input" type="number" name="count" min="1" max="${COUNT_MAX}" value="${COUNT_DEFAULT}" inputmode="numeric" required></label>
    <p class="small muted" id="mp-asum" role="status"></p>
    ${classes.length ? `<label class="mp-set mp-block"><span>${esc(tl('klass'))}</span><select class="input" name="classId" required>${classes.map(c => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('')}</select></label>`
    : `<p class="notice">${esc(tl('noClasses'))}</p>`}
    <div class="mp-adates"><label class="mp-set"><span>${esc(tl('opens'))}</span><input class="input" type="date" name="opensAt"></label><label class="mp-set"><span>${esc(tl('due'))}</span><input class="input" type="date" name="dueAt"></label></div>
    <p class="err" id="mp-aerr" aria-live="polite"></p>
    <div class="row">${btn('btn', 'data-acancel', esc(tl('cancel')))}<button class="btn btn-primary" type="submit"${classes.length ? '' : ' disabled'}>${esc(tl('assignGo'))}</button></div></form>` });
  const f = el.querySelector('form'), sum = el.querySelector('#mp-asum');
  const say = () => { const n = Math.max(1, Math.min(COUNT_MAX, Math.floor(+f.elements.count.value) || 1)); sum.textContent = tl('total', { n: n * picked.length }); };
  f.elements.count.addEventListener('input', say); say();
  el.querySelector('[data-acancel]').onclick = () => close();
  f.onsubmit = async e => {
    e.preventDefault();
    const go = f.querySelector('[type="submit"]'); go.disabled = true;
    try {
      const r = await api('/api/manipulatives/assign', { method: 'POST', body: { classId: f.elements.classId.value, tasks: picked.map(x => x.id), count: +f.elements.count.value, opensAt: f.elements.opensAt.value || null, dueAt: f.elements.dueAt.value || null } });
      close(); toast(r.toast);
    } catch (err) { el.querySelector('#mp-aerr').textContent = err.message; go.disabled = false; }
  };
  requestAnimationFrame(() => f.elements.count.focus());
}

/** The student's home: every tool, with its tasks to practice. */
export function studentToolsHtml() {
  return `<section class="panel mp-practools"><h2 id="mp-practh">${iconHtml('🧮', { size: 28 })} ${esc(tl('practiceTitle'))}</h2><p class="small muted">${esc(tl('practiceLead'))}</p>
    ${CATS.map((c, i) => { const l = TOOLS.filter(x => x.cat === i); return l.length ? `<h3 class="mp-group">${esc(c)}</h3><div class="mp-toolgrid">${l.map(x => { const n = (TASKS[x.slug] || []).filter(isPractice).length;
      return `<a class="panel mp-toolcard" href="#practice/${x.slug}"><span class="mp-ico" style="--tc:${x.color}">${toolIconHtml(x.slug, { size: 40 })}</span><span><b>${esc(x.name)}</b><span class="small muted">${esc(n ? tl('nTasks', { n }) : tl('freePlay'))}</span><span class="small">${esc(x.desc)}</span></span></a>`; }).join('')}</div>` : ''; }).join('')}</section>`;
}
