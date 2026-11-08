// The class Standards tab (plan section 9.4, P12): the table per CSTA id, one student's drill-down, the CSV and the
// principal's coverage report (aggregate only, no names). Teacher-facing: standard codes are shown here, never to kids.
// Data from server/services/standards.js; words under cs.standards.*.
import { html } from './html.js';
import { emptyState, jumpNav } from './components.js';

const SHORT = { month: 'short', day: 'numeric' };
const groupBy = rows => { const m = new Map(); for (const r of rows) { if (!m.has(r.concept)) m.set(r.concept, []); m.get(r.concept).push(r); } return [...m]; };
/** "Jump to" chips, one per CSTA concept (each concept's group of rows, a <tbody>, carries the id std-c0, std-c1, …). */
const conceptJump = (t, rows) => { const g = groupBy(rows); return g.length > 1 ? jumpNav(t, g.map(([concept, list], i) => [`std-c${i}`, concept, list.length])) : ''; };
const dash = html`<span class="muted">–</span>`;

/** "72% · 6 items · 24 students" / "2.1 · 12 marked" (null when nothing yet). */
export const checkedText = (t, r) => (r.checkedPct === null ? null : t('cs.standards.checkedVal', { pct: r.checkedPct, items: r.items, students: r.checkedStudents }));
export const appliedText = (t, r) => (r.appliedMean === null ? null : t('cs.standards.appliedVal', { mean: r.appliedMean, count: r.marked }));

function legend(t) {
  return html`<details class="csq-std-legend panel" open><summary><b>${t('cs.standards.legend.h')}</b></summary><ul class="plain small">
    ${['practiced', 'checked', 'applied', 'meets', 'needs', 'pairs'].map(k => html`<li>${t(`cs.standards.legend.${k}`)}</li>`)}
  </ul><p class="small muted">${t('cs.standards.privacy')}</p></details>`;
}

/** The class table, or one student's rows when `student` is given. */
export function classBody(req, { c, data, all, student = null }) {
  const t = req.t, f = req.fmt, base = `/class/${c.id}/standards`;
  const qs = ({ all: a = all, student: who = student ? student.id : null } = {}) => { const p = new URLSearchParams(); if (a) p.set('all', '1'); if (who) p.set('student', who); const x = p.toString(); return x ? `${base}?${x}` : base; };
  const cl = new Map(data.lessons.map(x => [x.id, x]));
  const tools = html`<div class="row csq-std-tools noprint">
    <form method="get" action="${base}" class="row csq-std-pick">${all ? html`<input type="hidden" name="all" value="1">` : ''}
      <label class="small" for="std-student">${t('cs.standards.pick')}</label>
      <select class="input input-sm" id="std-student" name="student"><option value="">${t('cs.standards.everyone')}</option>${data.students.map(p => html`<option value="${p.id}" ${student && student.id === p.id ? 'selected' : ''}>${p.name}</option>`)}</select>
      <button class="btn btn-sm" type="submit">${t('cs.standards.show')}</button></form>
    <a class="btn btn-sm" href="${qs({ all: !all })}">${all ? t('cs.standards.levelsClass') : t('cs.standards.levelsAll')}</a>
    <a class="btn btn-sm" href="${base}.csv${all ? '?all=1' : ''}" download>⬇️ ${t('cs.standards.csv')}</a>
    <a class="btn btn-sm" href="${base}?report=1">🏫 ${t('cs.standards.report')}</a></div>`;
  if (!data.lessons.length && !data.rows.some(r => r.practiced || r.answered || r.marksN)) {
    return html`<section class="panel">${emptyState({ emoji: '🧭', title: t('cs.standards.empty.title'), text: t('cs.standards.empty.text') })}</section>${legend(t)}`;
  }
  const lessonLinks = r => (r.lessons.length ? r.lessons.map((id, i) => { const x = cl.get(id); if (!x) return '';
    return html`${i ? ' · ' : ''}<a href="/class/${c.id}/progress/${x.id}" dir="auto">${x.title}</a>${x.opens_at && x.opens_at > Date.now() ? html` <span class="chip-s">🔒 ${f.day(x.opens_at, SHORT)}</span>` : x.due_at ? html` <span class="nw small muted">📅 ${f.day(x.due_at, SHORT)}</span>` : ''}`; }) : dash);
  const stdCell = r => html`<th scope="row" class="csq-std-id"><b>${r.id}</b><span class="small muted">${r.statement}</span></th>`;
  const chip = s => html`<span class="csq-std-status st-${s}">${t(`cs.standards.status.${s}`)}</span>`;
  const m = data.students.length;
  if (student) {
    const nd = html`<span class="muted csq-nodata" title="${t('cs.standards.noDataHint')}">${t('cs.standards.noData')}</span>`;
    return html`${tools}${conceptJump(t, data.rows)}<section class="panel"><h2>${student.name}</h2>${student.noData ? html`<p class="notice">${t('cs.standards.noDataHint')}</p>` : ''}
      <div class="gbwrap" tabindex="0" role="region" aria-label="${t('cs.standards.title')}"><table class="tbl csq-std">
      <thead><tr><th scope="col">${t('cs.standards.cols.standard')}</th><th scope="col">${t('cs.standards.cols.practiced')}</th><th scope="col">${t('cs.standards.cols.checked')}</th><th scope="col">${t('cs.standards.cols.applied')}</th><th scope="col">${t('cs.standards.cols.status')}</th></tr></thead>
      ${groupBy(data.rows).map(([concept, rows], gi) => html`<tbody id="std-c${gi}"><tr class="csq-std-concept"><th colspan="5" scope="colgroup">${concept}</th></tr>${rows.map(r => { const x = r.by.get(student.id);
        const L = k => t(`cs.standards.cols.${k}`);
        if (student.noData || !x) return html`<tr>${stdCell(r)}<td data-label="${L('practiced')}">${nd}</td><td data-label="${L('checked')}">${nd}</td><td data-label="${L('applied')}">${nd}</td><td data-label="${L('status')}">${nd}</td></tr>`;
        return html`<tr>${stdCell(r)}<td data-label="${L('practiced')}">${x.practiced ? '✅' : dash}</td>
          <td data-label="${L('checked')}">${x.checked ? html`${t('cs.standards.ticket', { right: x.checked.ticket.right, tagged: x.checked.ticket.tagged })}<span class="small muted"> · ${x.checked.pct}%</span>` : nd}</td>
          <td data-label="${L('applied')}">${x.applied ? t('cs.standards.best', { best: x.applied.best, count: x.applied.n }) : nd}</td>
          <td data-label="${L('status')}">${x.meets ? chip('meets') : x.checked || x.applied ? chip('checked') : x.practiced ? chip('practiced') : r.lessons.length ? chip('assigned') : chip('notYet')}</td></tr>`; })}</tbody>`)}
      </table></div></section>${legend(t)}`;
  }
  const names = new Map(data.students.map(p => [p.id, p.name]));
  const L = k => t(`cs.standards.cols.${k}`);
  return html`${tools}${conceptJump(t, data.rows)}<section class="panel"><div class="gbwrap" tabindex="0" role="region" aria-label="${t('cs.standards.title')}"><table class="tbl csq-std">
    <thead><tr>${['standard', 'lessons', 'practiced', 'checked', 'applied', 'needsLook', 'last', 'status'].map(k => html`<th scope="col">${t(`cs.standards.cols.${k}`)}</th>`)}</tr></thead>
    ${groupBy(data.rows).map(([concept, rows], gi) => html`<tbody id="std-c${gi}"><tr class="csq-std-concept"><th colspan="8" scope="colgroup">${concept}</th></tr>${rows.map(r => html`<tr class="${r.status === 'notYet' ? 'csq-std-quiet' : ''}">
      ${stdCell(r)}<td class="csq-std-lessons" data-label="${L('lessons')}">${lessonLinks(r)}</td>
      <td data-label="${L('practiced')}"><b>${r.practiced}</b> / ${m}</td>
      <td data-label="${L('checked')}">${checkedText(t, r) || dash}</td>
      <td data-label="${L('applied')}">${appliedText(t, r) || dash}</td>
      <td data-label="${L('needsLook')}">${r.needsLook.length ? r.needsLook.map((id, i) => html`${i ? ', ' : ''}<a href="${qs({ student: id })}" dir="auto">${names.get(id)}</a>`) : dash}</td>
      <td class="nw" data-label="${L('last')}">${r.last ? f.day(r.last, SHORT) : dash}</td><td data-label="${L('status')}">${chip(r.status)}</td></tr>`)}</tbody>`)}
  </table></div></section>${legend(t)}`;
}

/** CSV cell, formula-injection safe like progress.csv. */
const cell = v => { const s = String(v == null ? '' : v); return /[",\n;]/.test(s) || /^[=+\-@]/.test(s) ? `"${s.replace(/^([=+\-@])/, "'$1").replace(/"/g, '""')}"` : s; };
/** One row per standard; counts only (the "needs a look" names stay on the page). */
export function classCsv(t, data) {
  const cl = new Map(data.lessons.map(x => [x.id, x]));
  const head = ['standard', 'concept', 'statement', 'lessons', 'practiced', 'students', 'checkedPct', 'items', 'checkedStudents', 'appliedMean', 'marked', 'needsLook', 'meets', 'last', 'status'].map(k => t(`cs.standards.csvCols.${k}`));
  const lines = [head.map(cell).join(',')];
  const day = ms => (ms ? new Date(ms).toISOString().slice(0, 10) : '');
  for (const r of data.rows) lines.push([r.id, r.concept, r.statement, r.lessons.map(id => (cl.get(id) || {}).title).filter(Boolean).join(' | '), r.practiced, data.students.length,
    r.checkedPct === null ? '' : r.checkedPct, r.items, r.checkedStudents, r.appliedMean === null ? '' : r.appliedMean, r.marked, r.needsLook.length, r.meets, day(r.last), t(`cs.standards.status.${r.status}`)].map(cell).join(','));
  return `﻿${lines.join('\r\n')}\r\n`;
}

/** The principal's coverage report (aggregate only, no student names). */
export function reportBody(req, { school, rep, backHref }) {
  const t = req.t, f = req.fmt;
  return html`<div class="printbar row noprint"><a class="btn" href="${backHref}">← ${t('cs.print.back')}</a><button class="btn btn-primary" type="button" data-print>🖨️ ${t('cs.print.print')}</button></div>
  <h1>${t('cs.standards.reportH.title')}</h1><p>${t('cs.standards.reportH.lead', { school: school.name })}</p>
  <p class="small">${t('cs.standards.reportH.classes')}: ${rep.classes.map((c, i) => html`${i ? ' · ' : ''}<span dir="auto">${c.name}</span>`)}</p>
  <table class="tbl csq-std csq-std-report"><thead><tr>${['standard', 'classes', 'lessons', 'items', 'accuracy', 'rubric', 'meets'].map(k => html`<th scope="col">${t(`cs.standards.reportH.cols.${k}`)}</th>`)}</tr></thead>
  ${groupBy(rep.rows).map(([concept, rows]) => html`<tbody><tr class="csq-std-concept"><th colspan="7" scope="colgroup">${concept}</th></tr>${rows.map(r => html`<tr>
    <th scope="row" class="csq-std-id"><b>${r.id}</b><span class="small muted">${r.statement}</span></th><td>${r.classes} / ${rep.classes.length}</td>
    <td class="csq-std-lessons">${r.lessons.length ? r.lessons.map((l, i) => html`${i ? ' · ' : ''}<span dir="auto">${l.title}</span> <span class="small muted nw">${f.day(l.first, SHORT)}</span>`) : dash}</td>
    <td>${r.items}</td><td>${r.pct === null ? dash : `${r.pct}%`}</td><td>${r.appliedMean === null ? dash : t('cs.standards.reportH.rubricVal', { mean: r.appliedMean, count: r.marksN })}</td><td>${r.meetsClasses}</td></tr>`)}</tbody>`)}
  </table><p class="small muted">${t('cs.standards.reportH.note')}</p>`;
}
