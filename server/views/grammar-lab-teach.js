// Grammar Lab's teacher pages (routes/grammar-lab-teach.js; services/grammar-lab-assign.js): the units to assign
// (/teach/grammar-lab, with the Assign dialog), a class's grid (/class/:id/grammar-lab) and one student's view
// (/class/:id/grammar-lab/:student, with their starting grades). Teachers only. Counts and states only: students are
// listed in roster order, never ranked. Course text (unit and topic names) is English for now and marked lang="en".
import { html, raw, jsonData } from './html.js';
import { VERSION } from './layout.js';
import * as GL from '../services/grammar-lab.js';

export const HEAD = raw(`<link rel="stylesheet" href="/css/grammar-lab.css?v=${VERSION}">`);
/** The class pages (the grid, one student): the class header's and the gradebook's styles too, as the Progress page. */
export const CLASS_HEAD = raw(`<link rel="stylesheet" href="/css/community.css?v=${VERSION}"><link rel="stylesheet" href="/css/schools.css?v=${VERSION}"><link rel="stylesheet" href="/css/grammar-lab.css?v=${VERSION}">`);
const en = raw(' lang="en" dir="ltr"');
const base = '/courses/grammar-lab';
const gradesOf = band => (GL.band(band) || {}).grades || band;
const dayOf = (f, ts) => (ts ? f.day(ts) : '');

/** One Assign button: what it gives (unit, topic or room), named for the dialog. */
const assignBtn = (t, { what, unit, band, topic = '', title, label, primary = false }) => html`<button type="button" class="btn btn-sm${primary ? ' btn-primary' : ''} glt-assign" data-glassign
  data-what="${what}" data-unit="${unit}" data-band="${band}" data-topic="${topic}" data-title="${title}" aria-label="${t('grammarLab.teach.assignLabel', { title })}">${label}</button>`;

/** The Assign dialog: the class, who in it (whole class, a group, one student), an optional due day. */
function assignDialog(t, classes) {
  return html`<dialog class="gl-dialog glt-dialog" id="glt-dialog" aria-labelledby="glt-dialog-h">
    <form data-api="/api/grammar-lab/assign" data-reload novalidate class="glt-form">
      <h2 id="glt-dialog-h"></h2>
      <p class="muted glt-what" id="glt-what" data-unit="${t('grammarLab.teach.whatUnit')}" data-topic="${t('grammarLab.teach.whatTopic')}" data-room="${t('grammarLab.teach.whatRoom')}"></p>
      <input type="hidden" name="what"><input type="hidden" name="unit"><input type="hidden" name="band"><input type="hidden" name="topic">
      <label class="gl-label" for="glt-class">${t('grammarLab.teach.class')}</label>
      <select class="input" id="glt-class" name="classId" required>${classes.map(c => html`<option value="${c.id}">${c.name}</option>`)}</select>
      <label class="gl-label" for="glt-who">${t('grammarLab.teach.who')}</label>
      <select class="input" id="glt-who" name="to">
        ${classes.map(c => html`<option value="all" data-class="${c.id}">${t('grammarLab.teach.wholeClass')}</option>
          ${c.groups.length ? html`<optgroup label="${t('grammarLab.teach.groups')}" data-class="${c.id}">${c.groups.map(g => html`<option value="group:${g.id}" data-class="${c.id}">${g.name}</option>`)}</optgroup>` : ''}
          ${c.students.length ? html`<optgroup label="${t('grammarLab.teach.oneStudent')}" data-class="${c.id}">${c.students.map(s => html`<option value="desk:${s.id}" data-class="${c.id}">${s.name}</option>`)}</optgroup>` : ''}`)}
      </select>
      <label class="gl-label" for="glt-due">${t('grammarLab.teach.due')}</label>
      <input class="input" type="date" id="glt-due" name="dueAt">
      <p class="small muted">${t('grammarLab.teach.dueHint')}</p>
      <p class="form-err err" aria-live="polite"></p>
      <p class="gl-dialog-go"><button type="button" class="btn" id="glt-cancel">${t('grammarLab.teach.cancel')}</button><button type="submit" class="btn btn-primary" id="glt-ok">${t('grammarLab.teach.assign')}</button></p>
    </form>
  </dialog>`;
}

/** /teach/grammar-lab: a band's units, each with its topics; Assign a unit, a topic, or a topic's proofread room. */
export function teachPage({ t, band, units, classes }) {
  return html`<div class="gl glt">
    <header class="gl-top"><h1>${t('grammarLab.teach.h1')}</h1><p class="muted">${t('grammarLab.teach.lead')}</p></header>
    <nav class="glt-bands" aria-label="${t('grammarLab.teach.bands')}">${GL.BAND_IDS.map(b => html`<a class="chip${b === band ? ' on' : ''}" href="/teach/grammar-lab?band=${b}"${b === band ? raw(' aria-current="page"') : ''}>${t('grammarLab.band', { grades: gradesOf(b) })}</a>`)}</nav>
    ${classes.length ? '' : html`<p class="notice">${t('grammarLab.teach.noClasses')} <a href="/teach?new=1">${t('grammarLab.teach.newClass')}</a></p>`}
    <ul class="glt-units">${units.map(p => html`<li class="glt-unit" id="glt-${p.id}">
      <div class="glt-unit-head"><div class="glt-unit-t"><h2${en}>${p.title}</h2><p class="muted">${t('grammarLab.topicsN', { count: p.topics.length })}</p></div>
        ${classes.length ? assignBtn(t, { what: 'unit', unit: p.id, band: p.band, title: p.title, label: t('grammarLab.teach.assignUnit'), primary: true }) : ''}</div>
      <details class="glt-topics"><summary>${t('grammarLab.teach.seeTopics')}</summary><ol class="glt-tlist">${p.topics.map(id => { const tp = GL.topic(id), room = !!GL.room(id); return html`<li>
        <span class="glt-tname"${en}>${tp.title}</span>
        <span class="glt-tacts">${classes.length ? html`${assignBtn(t, { what: 'topic', unit: p.id, band: p.band, topic: id, title: tp.title, label: t('grammarLab.teach.assignTopic') })}${room ? assignBtn(t, { what: 'room', unit: p.id, band: p.band, topic: id, title: t('grammarLab.teach.roomTitle', { topic: tp.title }), label: t('grammarLab.teach.assignRoom') }) : ''}` : ''}
          <a class="btn btn-sm btn-ghost" href="${base}/${p.band}/${p.id}/${id}/card">${t('grammarLab.card.heading')}</a></span></li>`; })}</ol></details>
    </li>`)}</ul>
    ${classes.length ? assignDialog(t, classes) : ''}
    ${jsonData('glt-data', { titleOf: t('grammarLab.teach.dialogTitle', { title: '{title}' }) })}
  </div>`;
}

const STATE_ICON = { mastered: '✅', started: '◐', none: '–' };
/** One grid cell: the state (mastered, level X of N, not started) and the room's mark. */
function cell(t, c) {
  const label = c.state === 'mastered' ? t('grammarLab.teach.mastered') : c.state === 'started' ? t('grammarLab.teach.level', { level: c.level, levels: c.levels }) : t('grammarLab.teach.notStarted');
  return html`<td class="glt-c glt-${c.state}" data-label=""><span class="glt-ci" aria-hidden="true">${c.state === 'started' ? `${c.level}/${c.levels}` : STATE_ICON[c.state]}</span><span class="sr-only">${label}</span>${c.room && (c.room.passed || c.room.tried)
    ? html`<span class="glt-room${c.room.passed ? ' on' : ''}" title="${t(c.room.passed ? 'grammarLab.teach.roomPassed' : 'grammarLab.teach.roomTried')}">🔎<span class="sr-only">${t(c.room.passed ? 'grammarLab.teach.roomPassed' : 'grammarLab.teach.roomTried')}</span></span>` : ''}</td>`;
}
/** The class grid (/class/:id/grammar-lab): filters, a key, then students by topics. */
export function gridBody({ t, c, g }) {
  const href = `/class/${c.id}/grammar-lab`;
  if (!g.assignments) return html`<section class="panel glt-empty"><p>${t('grammarLab.teach.gridEmpty')}</p><p><a class="btn btn-primary" href="/teach/grammar-lab">${t('grammarLab.teach.assignSome')}</a></p></section>`;
  const filters = html`<form method="get" action="${href}" class="glt-filters">
    <label><span class="gl-label">${t('grammarLab.teach.filterBand')}</span><select class="input" name="band"><option value="">${t('grammarLab.teach.all')}</option>${g.bands.map(b => html`<option value="${b}"${b === g.filters.band ? raw(' selected') : ''}>${t('grammarLab.band', { grades: gradesOf(b) })}</option>`)}</select></label>
    <label><span class="gl-label">${t('grammarLab.teach.filterUnit')}</span><select class="input" name="unit"><option value="">${t('grammarLab.teach.all')}</option>${g.all.filter(p => !g.filters.band || p.band === g.filters.band).map(p => html`<option value="${p.id}"${p.id === g.filters.unit ? raw(' selected') : ''}${en}>${p.title}</option>`)}</select></label>
    <button class="btn" type="submit">${t('grammarLab.teach.show')}</button></form>`;
  const key = html`<p class="small muted glt-key"><span>✅ ${t('grammarLab.teach.mastered')}</span><span>1/3 ${t('grammarLab.teach.levelKey')}</span><span>– ${t('grammarLab.teach.notStarted')}</span><span>🔎 ${t('grammarLab.teach.roomPassed')}</span></p>`;
  if (!g.students.length) return html`${filters}<section class="panel"><p>${t('grammarLab.teach.noStudents')}</p></section>`;
  const topics = g.units.flatMap(u => u.topics);
  return html`${filters}${key}
    ${g.units.map(u => html`<section class="panel glt-gridsec" aria-labelledby="glt-u-${u.band}-${u.id}">
      <h2 id="glt-u-${u.band}-${u.id}"><span${en}>${u.title}</span> <span class="small muted">${t('grammarLab.band', { grades: gradesOf(u.band) })}</span></h2>
      <div class="gbwrap glt-wrap" tabindex="0" role="region" aria-label="${u.title}"><table class="tbl glt-grid">
        <thead><tr><th scope="col" class="glt-name">${t('school.people.name')}</th>${u.topics.map((tp, i) => html`<th scope="col" class="glt-th"><span class="glt-thn" aria-hidden="true">${i + 1}</span><span class="glt-tht"${en}>${tp.title}</span></th>`)}</tr></thead>
        <tbody>${g.students.map(s => html`<tr><th scope="row" class="glt-name"><a href="${href}/${s.id}" dir="auto">${s.name}</a></th>${u.topics.map(tp => cell(t, s.cells[tp.id]))}</tr>`)}</tbody>
        <tfoot><tr><th scope="row" class="glt-name">${t('grammarLab.teach.counts')}</th>${u.topics.map(tp => html`<td class="glt-count small">${t('grammarLab.teach.count', { mastered: g.counts[tp.id].mastered, started: g.counts[tp.id].started })}</td>`)}</tr></tfoot>
      </table></div></section>`)}
    ${topics.length ? '' : html`<p class="notice">${t('grammarLab.teach.noneFit')}</p>`}`;
}
/** One student's view: their starting grades (with the teacher's override), then each unit with its ring and topics. */
export function studentBody({ t, f, c, v }) {
  const pl = v.place, s = v.student;
  const placeLine = pl.from === 'teacher' ? t('grammarLab.teach.placeTeacher', { grades: gradesOf(pl.band) })
    : pl.from === 'grade' ? t('grammarLab.teach.placeGrade', { grades: gradesOf(pl.band), grade: pl.grade === 0 ? 'K' : String(pl.grade) })
    : t('grammarLab.teach.placeNone');
  const status = x => (x.state === 'mastered' ? html`<span class="chip-s">✅ ${t('grammarLab.teach.mastered')}</span>` : x.state === 'started' ? html`<span class="chip-s warn">${t('grammarLab.teach.level', { level: x.level, levels: x.levels })}</span>` : html`<span class="muted">${t('grammarLab.teach.notStarted')}</span>`);
  return html`<p class="gl-crumb"><a href="/class/${c.id}/grammar-lab">${t('grammarLab.teach.backGrid')}</a></p>
    <h2 class="glt-sname" dir="auto">${t('grammarLab.teach.studentTitle', { name: s.roster_name || s.display_name })}</h2>
    <section class="panel glt-place" aria-labelledby="glt-place-h"><h3 id="glt-place-h">${t('grammarLab.teach.placeH')}</h3><p>${placeLine}</p>
      <form data-api="/api/class/${c.id}/grammar-lab/band" data-reload class="glt-placeform" novalidate><input type="hidden" name="student" value="${s.id}">
        <label class="gl-label" for="glt-band">${t('grammarLab.teach.placeSet')}</label>
        <select class="input" id="glt-band" name="band"><option value="">${t('grammarLab.teach.placeAuto')}</option>${GL.BAND_IDS.map(b => html`<option value="${b}"${pl.from === 'teacher' && pl.band === b ? raw(' selected') : ''}>${t('grammarLab.band', { grades: gradesOf(b) })}</option>`)}</select>
        <button class="btn btn-primary" type="submit" id="glt-band-save">${t('grammarLab.teach.placeSave')}</button><p class="form-err err" aria-live="polite"></p></form>
      <p class="small muted">${t('grammarLab.teach.placeNote')}</p></section>
    ${v.units.length ? v.units.map(u => html`<section class="panel glt-sunit" aria-labelledby="glt-su-${u.band}-${u.id}">
      <header class="gl-unithead"><span class="gl-ring" role="img" aria-label="${t('grammarLab.ringLabel', { done: u.done, total: u.total })}" style="--p:${u.total ? Math.round(u.done / u.total * 100) : 0}"><span>${u.done}/${u.total}</span></span>
        <div><h3 id="glt-su-${u.band}-${u.id}"${en}>${u.title}</h3><p class="muted small">${t('grammarLab.band', { grades: gradesOf(u.band) })}</p></div></header>
      <div class="gbwrap" tabindex="0" role="region" aria-label="${u.title}"><table class="tbl glt-stable">
        <thead><tr><th scope="col">${t('grammarLab.teach.colTopic')}</th><th scope="col">${t('grammarLab.teach.colStatus')}</th><th scope="col">${t('grammarLab.teach.colAttempts')}</th><th scope="col">${t('grammarLab.teach.colWrong')}</th><th scope="col">${t('grammarLab.teach.colRoom')}</th><th scope="col">${t('grammarLab.teach.colLast')}</th></tr></thead>
        <tbody>${u.topics.map(x => html`<tr><th scope="row"${en}>${x.title}</th><td data-label="${t('grammarLab.teach.colStatus')}">${status(x)}</td><td data-label="${t('grammarLab.teach.colAttempts')}">${x.attempts}</td><td data-label="${t('grammarLab.teach.colWrong')}">${x.wrong}</td>
          <td data-label="${t('grammarLab.teach.colRoom')}">${!x.room ? html`<span class="muted">–</span>` : x.room.passed ? html`🔎 ${t('grammarLab.teach.roomPassed')}` : x.room.tried ? t('grammarLab.teach.roomTried') : html`<span class="muted">${t('grammarLab.teach.notStarted')}</span>`}</td>
          <td data-label="${t('grammarLab.teach.colLast')}">${x.last ? dayOf(f, x.last) : html`<span class="muted">${t('grammarLab.teach.never')}</span>`}</td></tr>`)}</tbody></table></div>
    </section>`) : html`<section class="panel"><p>${t('grammarLab.teach.gridEmpty')}</p></section>`}`;
}
/** The class Progress page's Grammar Lab panel (routes/progress.js), beside the other courses' panels. */
export function progressPanel({ t, c, g }) {
  const started = g.students.filter(s => Object.values(s.cells).some(x => x.state !== 'none')).length;
  return html`<section class="panel coursepanel glt-panel" id="course-grammar-lab"><h2>🔤 ${t('grammarLab.title')}</h2>
    <p class="small muted">${t('progress.courses.started', { started, total: g.students.length })} · ${t('grammarLab.teach.unitsGiven', { count: g.all.length })}</p>
    <p><a class="btn" href="/class/${c.id}/grammar-lab" id="glt-progress-link">📊 ${t('grammarLab.teach.progressLink')}</a></p></section>`;
}
