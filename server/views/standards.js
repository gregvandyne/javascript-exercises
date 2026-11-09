// Standards beyond computer science (docs/decisions.md, 9 Nov 2026): the framework picker on the class Standards tab,
// the Common Core class view (coverage and per-student mastery), its CSV, the lesson's standards picker and the small
// code chips. Teacher-facing only: codes are never shown to kids. Words under standards.*; codes and statements are the
// official English ones (lang="en"). Every page that lists Common Core standards carries attribution() (CCSS license).
import { html } from './html.js';
import { emptyState, jumpNav } from './components.js';
import * as FW from '../standards/frameworks.js';

const SHORT = { month: 'short', day: 'numeric' };
const dash = html`<span class="muted">–</span>`;
const FW_KEY = { csta: 'csta', 'ccss-math': 'math', 'ccss-ela': 'ela' };
export const fwName = (t, id) => t(`standards.fw.${FW_KEY[id] || 'csta'}`);
export const gradeName = (t, g) => (g === 'K' ? t('learn.tab.gradeK') : t('learn.tab.gradeN', { n: g }));

/** The CCSS public-license notice, on every page that lists Common Core standards. */
export const attribution = t => html`<p class="std-notice small muted"><span>${t('standards.notice')}</span> <span lang="en" dir="ltr">${FW.NOTICE}</span></p>`;

/** Framework chips on the class Standards tab (CSTA is the default: no ?fw=). */
export function frameworkPicker(req, c, current) {
  const t = req.t;
  const href = id => (id === 'csta' ? `/class/${c.id}/standards` : `/class/${c.id}/standards?fw=${id}`);
  return html`<nav class="chips std-fw noprint" aria-label="${t('standards.picker')}">${FW.IDS.map(id => html`<a class="chip${id === current ? ' on' : ''}" href="${href(id)}"${id === current ? html` aria-current="page"` : ''}>${fwName(t, id)}</a>`)}</nav>`;
}

/** A row of code chips ("3.OA.C.7"), statements as tooltips. */
export function codeChips(t, framework, codes, { label = null } = {}) {
  const fw = FW.CCSS[framework]; if (!fw || !codes.length) return '';
  return html`<ul class="std-codes" aria-label="${label || fwName(t, framework)}">${codes.map(c => { const s = fw.byId(c); return html`<li><span class="std-code" lang="en" dir="ltr" title="${s ? s.statement : ''}">${c}</span></li>`; })}</ul>`;
}

const groupBy = (rows, key) => { const m = new Map(); for (const r of rows) { const k = key(r); if (!m.has(k)) m.set(k, []); m.get(k).push(r); } return [...m]; };
const groupName = (t, fw, r) => html`<bdi>${gradeName(t, r.grade)}</bdi> · <bdi lang="en" dir="ltr">${fw.domains[r.domain] || r.domain}</bdi>`;

function legend(t) {
  return html`<details class="csq-std-legend panel"><summary><b>${t('standards.legend.h')}</b></summary><ul class="plain small">
    ${['sources', 'practiced', 'checked', 'rubric', 'meets', 'needs'].map(k => html`<li>${t(`standards.legend.${k}`)}</li>`)}
  </ul><p class="small muted">${t('cs.standards.privacy')}</p></details>`;
}
const chip = (t, s) => html`<span class="csq-std-status st-${s}">${t(`standards.status.${s}`)}</span>`;
const levelChip = (t, l) => html`<span class="csq-std-status st-${{ none: 'notYet', practiced: 'practiced', developing: 'checked', meets: 'meets' }[l]}">${t(`standards.level.${l}`)}</span>`;
export const checkedText = (t, r) => (r.pct === null ? null : t('standards.checkedVal', { pct: r.pct, answered: r.answered, students: r.checkedStudents }));
export const rubricText = (t, r) => (r.rubricMean === null ? null : t('standards.rubricVal', { pct: Math.round(r.rubricMean * 100), count: r.rubricN }));

/** The Common Core class view: the whole class, or one student. names: slug -> game title (official games). */
export function classBody(req, { c, view, student = null, gameTitles = new Map() }) {
  const t = req.t, f = req.fmt, fw = FW.CCSS[view.framework];
  const base = `/class/${c.id}/standards`;
  const qs = (over = {}) => { const p = new URLSearchParams({ fw: view.framework }); const g = over.grade !== undefined ? over.grade : view.grade; if (g) p.set('grade', g);
    const who = over.student !== undefined ? over.student : student ? student.id : ''; if (who) p.set('student', who); return `${base}?${p}`; };
  const cl = new Map(view.lessons.map(x => [x.id, x]));
  const tools = html`<div class="row csq-std-tools std-tools noprint">
    <form method="get" action="${base}" class="row csq-std-pick"><input type="hidden" name="fw" value="${view.framework}">${view.grade ? html`<input type="hidden" name="grade" value="${view.grade}">` : ''}
      <label class="small" for="std-student">${t('cs.standards.pick')}</label>
      <select class="input input-sm" id="std-student" name="student" data-autosubmit><option value="">${t('cs.standards.everyone')}</option>${view.students.map(p => html`<option value="${p.id}" ${student && student.id === p.id ? 'selected' : ''}>${p.name}</option>`)}</select>
      <button class="btn btn-sm" type="submit" data-nojs>${t('cs.standards.show')}</button></form>
    <form method="get" action="${base}" class="row csq-std-pick"><input type="hidden" name="fw" value="${view.framework}">${student ? html`<input type="hidden" name="student" value="${student.id}">` : ''}
      <label class="small" for="std-grade">${t('standards.class.grade')}</label>
      <select class="input input-sm" id="std-grade" name="grade" data-autosubmit><option value="">${t('standards.class.covered')}</option>${fw.grades.map(g => html`<option value="${g}" ${view.grade === g ? 'selected' : ''}>${t('standards.class.allOf', { grade: gradeName(t, g) })}</option>`)}</select>
      <button class="btn btn-sm" type="submit" data-nojs>${t('cs.standards.show')}</button></form>
    <a class="btn btn-sm" href="${base}.csv?fw=${view.framework}${view.grade ? `&grade=${view.grade}` : ''}" download>⬇️ ${t('cs.standards.csv')}</a></div>`;
  const summary = view.summary.length ? html`<ul class="std-summary" aria-label="${t('standards.class.summaryH')}">${view.summary.map(s => html`<li class="panel"><b>${gradeName(t, s.grade)}</b><span>${t('standards.class.summary', { covered: s.covered, total: s.total })}</span>
    <span class="std-bar" aria-hidden="true"><span style="width:${s.total ? Math.round((100 * s.covered) / s.total) : 0}%"></span></span></li>`)}</ul>` : '';
  if (!view.rows.length) {
    return html`${tools}<section class="panel">${emptyState({ emoji: '🧭', title: t('standards.empty.title'), text: t('standards.empty.text') })}</section>${legend(t)}${attribution(t)}`;
  }
  const groups = groupBy(view.rows, r => `${r.grade}|${r.domain}`);
  const jump = groups.length > 1 ? jumpNav(t, groups.map(([k, list], i) => [`std-g${i}`, html`<bdi dir="ltr">${list[0].grade} · ${list[0].domain}</bdi>`, list.length])) : '';
  const stdCell = r => html`<th scope="row" class="csq-std-id${r.parent ? ' std-sub' : ''}"><b lang="en" dir="ltr">${r.id}</b><span class="small muted" lang="en" dir="ltr">${r.statement}</span></th>`;
  const L = k => t(`standards.cols.${k}`);
  const sourcesCell = r => {
    const out = [];
    for (const id of r.sources.lessons) { const x = cl.get(id); if (x) out.push(html`<a href="/class/${c.id}/progress/${x.id}" dir="auto">${x.title}</a>${x.due_at ? html` <span class="nw small muted">📅 ${f.day(x.due_at, SHORT)}</span>` : ''}`); }
    for (const s of r.sources.games) out.push(html`🎮 <span dir="auto">${gameTitles.get(s) || s}</span>`);
    if (r.sources.live) out.push(html`📡 ${t('standards.src.live', { count: r.sources.live })}`);
    for (const s of r.sources.courses) out.push(html`🔢 ${s === 'number-quest' ? t('courses.nq.title') : s}`);
    return out.length ? out.map((x, i) => html`${i ? html`<br>` : ''}${x}`) : dash;
  };
  const m = view.students.length;
  if (student) {
    const nd = html`<span class="muted csq-nodata" title="${t('cs.standards.noDataHint')}">${t('cs.standards.noData')}</span>`;
    return html`${tools}${jump}<section class="panel"><h2>${student.name}</h2>${student.noData ? html`<p class="notice">${t('cs.standards.noDataHint')}</p>` : ''}
      <div class="gbwrap" tabindex="0" role="region" aria-label="${t('cs.standards.title')}"><table class="tbl csq-std std-ccss">
      <thead><tr>${['standard', 'practiced', 'checked', 'rubric', 'level'].map(k => html`<th scope="col">${L(k)}</th>`)}</tr></thead>
      ${groups.map(([, rows], gi) => html`<tbody id="std-g${gi}"><tr class="csq-std-concept"><th colspan="5" scope="colgroup">${groupName(t, fw, rows[0])}</th></tr>${rows.map(r => { const x = r.by.get(student.id);
        if (student.noData || !x || x.level === 'none') return html`<tr class="csq-std-quiet">${stdCell(r)}<td data-label="${L('practiced')}">${x && x.practiced ? '✅' : nd}</td><td data-label="${L('checked')}">${nd}</td><td data-label="${L('rubric')}">${nd}</td><td data-label="${L('level')}">${levelChip(t, 'none')}</td></tr>`;
        return html`<tr>${stdCell(r)}<td data-label="${L('practiced')}">${x.practiced ? '✅' : dash}</td>
          <td data-label="${L('checked')}">${x.answered ? html`${t('standards.mine', { right: x.right, answered: x.answered })}<span class="small muted"> · ${x.pct}%</span>` : nd}</td>
          <td data-label="${L('rubric')}">${x.rubric ? t('standards.rubricBest', { pct: Math.round(x.rubric.best * 100), count: x.rubric.n }) : nd}</td>
          <td data-label="${L('level')}">${levelChip(t, x.level)}</td></tr>`; })}</tbody>`)}
      </table></div></section>${legend(t)}${attribution(t)}`;
  }
  const names = new Map(view.students.map(p => [p.id, p.name]));
  return html`${tools}${summary}${jump}<section class="panel"><div class="gbwrap" tabindex="0" role="region" aria-label="${t('cs.standards.title')}"><table class="tbl csq-std std-ccss">
    <thead><tr>${['standard', 'sources', 'practiced', 'checked', 'rubric', 'needsLook', 'last', 'status'].map(k => html`<th scope="col">${L(k)}</th>`)}</tr></thead>
    ${groups.map(([, rows], gi) => html`<tbody id="std-g${gi}"><tr class="csq-std-concept"><th colspan="8" scope="colgroup">${groupName(t, fw, rows[0])}</th></tr>${rows.map(r => html`<tr class="${r.status === 'notYet' ? 'csq-std-quiet' : ''}">
      ${stdCell(r)}<td class="csq-std-lessons" data-label="${L('sources')}">${sourcesCell(r)}</td>
      <td data-label="${L('practiced')}"><b>${r.practiced}</b> / ${m}</td>
      <td data-label="${L('checked')}">${checkedText(t, r) || dash}</td>
      <td data-label="${L('rubric')}">${rubricText(t, r) || dash}</td>
      <td data-label="${L('needsLook')}">${r.needsLook.length ? r.needsLook.map((id, i) => html`${i ? ', ' : ''}<a href="${qs({ student: id })}" dir="auto">${names.get(id)}</a>`) : dash}</td>
      <td class="nw" data-label="${L('last')}">${r.last ? f.day(r.last, SHORT) : dash}</td><td data-label="${L('status')}">${chip(t, r.status)}</td></tr>`)}</tbody>`)}
  </table></div></section>${legend(t)}${attribution(t)}`;
}

/** CSV cell, formula-injection safe like progress.csv. */
const cell = v => { const s = String(v == null ? '' : v); return /[",\n;]/.test(s) || /^[=+\-@]/.test(s) ? `"${s.replace(/^([=+\-@])/, "'$1").replace(/"/g, '""')}"` : s; };
/** One row per code; counts only (no student names). */
export function classCsv(t, view, gameTitles = new Map()) {
  const fw = FW.CCSS[view.framework];
  const cl = new Map(view.lessons.map(x => [x.id, x]));
  const head = ['code', 'grade', 'domain', 'statement', 'sources', 'practiced', 'students', 'pct', 'answered', 'checkedStudents', 'rubric', 'meets', 'needsLook', 'last', 'status'].map(k => t(`standards.csvCols.${k}`));
  const lines = [head.map(cell).join(',')];
  const day = ms => (ms ? new Date(ms).toISOString().slice(0, 10) : '');
  for (const r of view.rows) {
    const src = [...r.sources.lessons.map(id => (cl.get(id) || {}).title).filter(Boolean), ...r.sources.games.map(s => gameTitles.get(s) || s),
      ...(r.sources.live ? [t('standards.src.live', { count: r.sources.live })] : []), ...r.sources.courses.map(s => (s === 'number-quest' ? t('courses.nq.title') : s))];
    lines.push([r.id, r.grade, fw.domains[r.domain] || r.domain, r.statement, src.join(' | '), r.practiced, view.students.length, r.pct === null ? '' : r.pct, r.answered, r.checkedStudents,
      r.rubricMean === null ? '' : Math.round(r.rubricMean * 100), r.meets, r.needsLook.length, day(r.last), t(`standards.status.${r.status}`)].map(cell).join(','));
  }
  lines.push(cell(FW.NOTICE));
  return `﻿${lines.join('\r\n')}\r\n`;
}

/** The lesson's standards page: what is tagged (lesson and steps), and the picker. */
export function lessonBody(req, { l, steps, tags, framework, filters, results, edit }) {
  const t = req.t, fw = FW.CCSS[framework];
  const base = `/teach/lessons/${l.id}/standards`;
  const stepName = id => { const i = steps.findIndex(s => s.id === id); return i < 0 ? '' : t('standards.lesson.stepN', { n: i + 1, title: steps[i].title || t(`lessons.kinds.${steps[i].kind}`) }); };
  const targets = [['', t('standards.lesson.whole')], ...steps.map(s => [s.id, stepName(s.id)])];
  const tagged = tags.filter(x => FW.isCcss(x.framework));
  const byTarget = groupBy(tagged, x => x.step_id);
  const current = html`<section class="panel" id="tagged" aria-labelledby="tagged-h"><h2 id="tagged-h">🎯 ${t('standards.lesson.current')}</h2>
    ${tagged.length ? html`<ul class="plain std-tagged">${targets.filter(([id]) => byTarget.some(([k]) => k === id)).map(([id, name]) => html`<li><h3 class="small" dir="auto">${name}</h3>
      <ul class="plain std-taglist">${byTarget.find(([k]) => k === id)[1].map(x => { const s = FW.CCSS[x.framework].byId(x.code); return html`<li class="std-tag">
        <span class="std-tag-t"><b lang="en" dir="ltr">${x.code}</b> <span class="chip-s">${fwName(t, x.framework)}</span><span class="small muted" lang="en" dir="ltr">${s ? s.statement : ''}</span></span>
        ${edit ? html`<form data-api="/api/lessons/${l.id}/standards/remove" data-reload data-toast="${t('standards.lesson.removed', { code: x.code })}"><input type="hidden" name="framework" value="${x.framework}"><input type="hidden" name="code" value="${x.code}"><input type="hidden" name="stepId" value="${x.step_id}">
          <button class="btn btn-sm" type="submit" aria-label="${t('standards.lesson.removeLabel', { code: x.code })}">✕ ${t('standards.lesson.remove')}</button></form>` : ''}</li>`; })}</ul></li>`)}</ul>`
      : html`<p class="muted">${t('standards.lesson.none')}</p>`}</section>`;
  if (!edit) return html`${current}${attribution(t)}`;
  const fwTabs = html`<nav class="chips std-fw" aria-label="${t('standards.picker')}">${FW.CCSS_IDS.map(id => html`<a class="chip${id === framework ? ' on' : ''}" href="${base}?fw=${id}#find"${id === framework ? html` aria-current="page"` : ''}>${fwName(t, id)}</a>`)}</nav>`;
  const domains = fw.domainsIn(filters.grade);
  const isTagged = (code, stepId) => tagged.some(x => x.framework === framework && x.code === code && x.step_id === stepId);
  const picker = html`<section class="panel" id="find" aria-labelledby="find-h"><h2 id="find-h">🔎 ${t('standards.lesson.find')}</h2>${fwTabs}
    <form method="get" action="${base}#find" class="formgrid std-filters" role="search">
      <input type="hidden" name="fw" value="${framework}">
      <div class="field"><label for="sf-g">${t('standards.class.grade')}</label><select class="input" id="sf-g" name="grade" data-autosubmit><option value="">${t('standards.lesson.gradeAny')}</option>${fw.grades.map(g => html`<option value="${g}" ${filters.grade === g ? 'selected' : ''}>${gradeName(t, g)}</option>`)}</select></div>
      <div class="field"><label for="sf-d">${t('standards.lesson.domain')}</label><select class="input" id="sf-d" name="domain" data-autosubmit><option value="">${t('standards.lesson.domainAll')}</option>${domains.map(d => html`<option value="${d}" ${filters.domain === d ? 'selected' : ''}>${d} · ${fw.domains[d]}</option>`)}</select></div>
      <div class="field wide"><label for="sf-q">${t('standards.lesson.search')}</label><input class="input" id="sf-q" name="q" type="search" value="${filters.q}" maxlength="80" placeholder="${framework === 'ccss-ela' ? t('standards.lesson.searchHintEla') : t('standards.lesson.searchHint')}"></div>
      <div class="field"><label for="sf-t">${t('standards.lesson.addTo')}</label><select class="input" id="sf-t" name="to">${targets.map(([id, name]) => html`<option value="${id}" ${filters.to === id ? 'selected' : ''}>${name}</option>`)}</select></div>
      <div class="formacts wide"><button class="btn btn-primary" type="submit">🔎 ${t('standards.lesson.search')}</button></div>
    </form>
    <p class="small muted" role="status">${t('standards.lesson.results', { count: results.total })}${results.total > results.list.length ? html` ${t('standards.lesson.more', { shown: results.list.length })}` : ''}</p>
    ${results.list.length ? html`<ul class="plain std-results">${results.list.map(s => { const on = isTagged(s.id, filters.to); return html`<li class="std-result${s.parent ? ' std-sub' : ''}">
      <span class="std-tag-t"><b lang="en" dir="ltr">${s.id}</b><span class="small muted" lang="en" dir="ltr">${s.statement}</span></span>
      ${on ? html`<span class="chip-s good">✓ ${t('standards.lesson.tagged')}</span>` : html`<form data-api="/api/lessons/${l.id}/standards" data-reload data-toast="${t('standards.lesson.added', { code: s.id })}"><input type="hidden" name="framework" value="${framework}"><input type="hidden" name="code" value="${s.id}"><input type="hidden" name="stepId" value="${filters.to}">
        <button class="btn btn-sm btn-primary" type="submit" aria-label="${t('standards.lesson.addLabel', { code: s.id })}">＋ ${t('standards.lesson.add')}</button></form>`}</li>`; })}</ul>`
      : html`<p class="notice">${t('standards.lesson.noResults')}</p>`}
  </section>`;
  return html`${current}${picker}${attribution(t)}`;
}
