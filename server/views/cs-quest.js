// CS Quest teacher pages (plan section 10.1; docs/cs-quest.md "Teacher pages"): the signed-in program page
// /teach/cs-quest, the plan page /teach/cs-quest/:key, the coverage map /teach/cs-quest/coverage and the banner on the
// lesson editor. The print view, the printables and the projector questions are in cs-quest-sheets.js; the public program
// page /teachers/cs-quest is built in routes/cs-quest.js with the landing-page helpers of routes/teachers.js.
//
// Everything a teacher clicks or reads as chrome is a cs.* key (13 languages). Lesson text, bank items, rubric lines and
// CSTA statements are English data from seed-lessons/cs-quest: they are rendered with en() so the element is
// lang="en" dir="ltr" on every page language. Kids never see these pages; the program name and the standard codes may
// appear here. Styles: public/css/cs-quest.css (same spacing scale as schools.css; nothing scrolls sideways on a phone).
import { html, raw, esc } from './html.js';
import { VERSION } from './layout.js';
import { tHtml } from '../i18n/index.js';
import * as T from '../services/lesson-templates.js';
import * as CSTA from '../standards/csta.js';

export const CSS = raw(`<link rel="stylesheet" href="/css/community.css?v=${VERSION}"><link rel="stylesheet" href="/css/schools.css?v=${VERSION}"><link rel="stylesheet" href="/css/cs-quest.css?v=${VERSION}">`);
/** The four games' emoji (plan section 1) and the live games a lesson may name. */
export const GAME_EMOJI = { 'robo-route': '🛤️', 'data-detective': '🔎', 'packet-post': '📮', 'inside-the-machine': '🔧', 'quest-race': '🏝️', 'question-battle': '⚡', 'brain-board': '🌟', 'would-you-rather-live': '🤔' };
export const WARMUP_MODE = { '1B': 'quest-race', '2': 'battle' };
export const BAND_KEY = { '1B': 'cs.band.b1', '2': 'cs.band.b2' };
export const otherBand = band => (band === '1B' ? '2' : '1B');

// ---------------------------------------------------------------- English data on a translated page
/** An element holding English lesson text: lang="en" dir="ltr" so screen readers and bidi get it right. */
export const en = (tag, text, attrs = '') => raw(`<${tag}${attrs} lang="en" dir="ltr">${esc(text)}</${tag}>`);
/** English paragraphs: a blank line starts a new paragraph, a newline a line break, "- " a list item. */
export function paras(text, cls = '') {
  const blocks = String(text || '').split(/\n{2,}/).filter(Boolean);
  return blocks.map(b => {
    const lines = b.split('\n');
    if (lines.length > 1 && lines.slice(1).every(l => /^- /.test(l))) return raw(`<p lang="en" dir="ltr"${cls ? ` class="${cls}"` : ''}>${esc(lines[0])}</p><ul class="csq-list" lang="en" dir="ltr">${lines.slice(1).map(l => `<li>${esc(l.slice(2))}</li>`).join('')}</ul>`);
    if (lines.every(l => /^- /.test(l))) return raw(`<ul class="csq-list" lang="en" dir="ltr">${lines.map(l => `<li>${esc(l.slice(2))}</li>`).join('')}</ul>`);
    return raw(`<p lang="en" dir="ltr"${cls ? ` class="${cls}"` : ''}>${lines.map(esc).join('<br>')}</p>`);
  });
}
/** A bulleted English list. */
export const enList = (items, cls = 'csq-list') => raw(`<ul class="${cls}" lang="en" dir="ltr">${(items || []).map(x => `<li>${esc(x)}</li>`).join('')}</ul>`);
/** A CSTA id as a chip with its statement as the title. */
export const idChip = id => { const s = CSTA.byId(id); return raw(`<span class="csq-badge csq-ids" lang="en" dir="ltr"${s ? ` title="${esc(s.statement)}"` : ''}>${esc(id)}</span>`); };
export const idChips = ids => html`<span class="csq-idrow">${(ids || []).map(idChip)}</span>`;
/** The "CS Quest · CSTA 1B/2" badge teachers see (never students). */
export const programBadge = cat => raw(`<span class="csq-badge" lang="en" dir="ltr">${esc(cat.program.teacherBadge)}</span>`);
/** The quest code, big, left to right. */
export const questCode = code => (code ? raw(`<span class="csq-code" dir="ltr" lang="en">${esc(code)}</span>`) : '');
/** A period table ([clock, minutes, label]) that scrolls by itself on a phone. */
export function periodTable(t, rows, cls = '') {
  return html`<div class="csq-tbl"><table class="tbl csq-period ${cls}"><thead><tr><th>${t('cs.plan.clock')}</th><th>${t('cs.plan.min')}</th><th>${t('cs.plan.segment')}</th></tr></thead>
    <tbody>${rows.map(([clock, min, label]) => html`<tr><td dir="ltr">${clock}</td><td dir="ltr">${min}</td><td>${en('span', label)}</td></tr>`)}</tbody></table></div>`;
}
/** One bank item with its choices; the right one marked when `showAnswer`. */
export function itemView(it, { showAnswer = true, n = null } = {}) {
  return html`<li lang="en" dir="ltr">${n ? html`<b class="csq-n">${n}.</b> ` : ''}${it.q}
    <ul class="csq-choices-sm">${it.choices.map((c, i) => html`<li class="${showAnswer && i === it.answer ? 'is-right' : ''}"><span class="csq-letter">${'ABCD'[i]}</span>${c}${showAnswer && i === it.answer ? ' ✓' : ''}</li>`)}</ul></li>`;
}
/** The Builder status line (P18): on / resting, and about how many teams can build this period. No prices. */
export function builderLine(t, b) {
  if (!b) return '';
  return html`<p class="csq-builder ${b.on ? 'is-on' : 'is-resting'}"><span>${b.on ? '🟢' : '🟡'} ${t(b.on ? 'cs.builder.on' : 'cs.builder.resting')}</span><span>· ${t('cs.builder.teams', { count: b.teamsPerPeriod })}</span>${!b.on && b.why === 'noKey' ? html`<span class="small muted">· ${t('cs.builder.noKey')}</span>` : ''}</p>`;
}
const lessonUrl = (key, extra = '') => `/teach/cs-quest/${key}${extra}`;
const stateChip = (t, st) => (!st || !st.inLibrary ? html`<span class="chip-s">${t('cs.state.notAdded')}</span>`
  : st.updateAvailable ? html`<span class="chip-s warn">⬆️ ${t('cs.state.update')}</span>` : html`<span class="chip-s csq-chip-ok">✅ ${t('cs.state.inLibrary')}</span>`);

// ---------------------------------------------------------------- the program page (/teach/cs-quest)
/**
 * d: { cat, band, school, schools, lib: Map key -> status, flags: { quizSteps, live }, builder, classes, zone,
 *      published: slug -> game | null, misses: pathId -> [ids the path leaves out for this band], q: extra query for links }
 */
export function programBody(req, d) {
  const t = req.t, { cat, band, school, lib } = d;
  const b = cat.bands[band];
  const href = (bandCode, extra = '') => `/teach/cs-quest?band=${bandCode}${d.schools.length > 1 ? `&school=${school.id}` : ''}${extra}`;
  const schoolIn = html`<input type="hidden" name="schoolId" value="${school.id}">`;
  const bandIn = html`<input type="hidden" name="band" value="${band}">`;
  const missingGames = ['robo-route', 'data-detective', 'packet-post', 'inside-the-machine'].filter(s => !d.published[s]).map(s => cat.games[s]?.title || s);
  const before = html`<section class="panel csq-before" aria-labelledby="before-h"><h2 id="before-h">🧭 ${t('cs.before.h')}</h2>
    <ul class="csq-plain">
      <li><span>${missingGames.length ? '⚠️' : '✅'}</span><span>${missingGames.length ? t('cs.before.gamesMissing', { games: missingGames.join(', ') }) : t('cs.before.gamesOk')}</span></li>
      <li><span>${d.flags.live ? '✅' : 'ℹ️'}</span><span>${t(d.flags.live ? 'cs.before.liveOn' : 'cs.before.liveOff')}</span></li>
      <li><span>${d.flags.quizSteps ? '✅' : 'ℹ️'}</span><span>${t(d.flags.quizSteps ? 'cs.before.quizOn' : 'cs.before.quizOff')}</span></li>
      <li><span>${d.classes.length ? '✅' : '⚠️'}</span><span>${t('cs.before.classes', { count: d.classes.length })} ${d.classes.length ? '' : html`<a href="/teach">${t('school.teach.title')}</a>`}</span></li>
      <li><span>${d.zone ? '✅' : 'ℹ️'}</span><span>${d.zone ? t('cs.before.zone', { zone: d.zone.replace(/_/g, ' ') }) : t('cs.before.zoneNone')}</span></li>
      <li><span>🎧</span><span>${t('cs.before.headphones')}</span></li>
      <li><span>🛠️</span><span>${t('cs.before.unit7')}</span></li>
    </ul>
    ${builderLine(t, d.builder)}</section>`;
  const pathCard = p => {
    const miss = d.misses[p.id] || [];
    return html`<article class="panel" aria-labelledby="path-${p.id}">
      <h3 id="path-${p.id}">${en('span', p.title)} ${p.default ? html`<span class="csq-badge">${t('cs.paths.recommended')}</span>` : ''}</h3>
      <p class="small muted">${t('cs.paths.periods', { count: p.lessons.length })} · <span lang="en" dir="ltr">${p.lessons.join(', ')}</span></p>
      ${p.note ? en('p', p.note, ' class="small"') : ''}
      <p class="small">${miss.length ? html`${t('cs.paths.misses')} ${idChips(miss)}` : t('cs.paths.coversAll')}</p>
      <div class="csq-pfoot"><form data-api="/api/lessons/from-template/path/${p.id}" data-reload data-toast="${t('cs.toast.many')}">${schoolIn}${bandIn}<button class="btn btn-primary" type="submit">➕ ${t('cs.add')}</button></form></div>
    </article>`;
  };
  const lessonRow = (u, l) => {
    const key = l.keys[band], tpl = T.getTemplate(key), st = lib.get(key);
    const game = tpl && tpl.play && tpl.play.type === 'game' ? tpl.play.game : null;
    const pub = game ? d.published[game] : null;
    return html`<li class="csq-lrow" id="l-${key}">
      <div class="csq-lmain"><b lang="en" dir="ltr">${l.n} · ${l.title}</b>
        <span class="small muted">${idChips(l.primary[band])}${game ? html` · <span lang="en" dir="ltr">${GAME_EMOJI[game] || '🎮'} ${cat.games[game]?.title || game}</span>` : ''}</span>
        ${tpl ? stateChip(t, st) : html`<span class="chip-s">${t('cs.state.soon')}</span>`}${game && !pub ? html` <span class="chip-s warn">⚠️ ${t('cs.state.gameNotYet', { game: cat.games[game]?.title || game })}</span>` : ''}</div>
      ${tpl ? html`<span class="acts">
        <a class="btn btn-sm" href="${lessonUrl(key)}">📋 ${t('cs.lesson.openPlan')}</a>
        ${pub && tpl.params ? html`<a class="btn btn-sm" href="/play/${game}?${tpl.params}&mode=projector" target="_blank" rel="noopener">▶ ${t('cs.lesson.preview')}</a>` : ''}
        ${st && st.inLibrary && !st.updateAvailable ? html`<a class="btn btn-sm" href="/teach/lessons/${st.current.id}">✅ ${t('cs.state.added')}</a>`
          : html`<form data-api="/api/lessons/from-template/${key}" data-reload data-toast="${t('cs.toast.one')}">${schoolIn}<button class="btn btn-sm btn-primary" type="submit">➕ ${t('cs.add')}</button></form>`}
      </span>` : ''}</li>`;
  };
  const unitCard = u => html`<section class="panel csq-unit" id="unit-${u.n}" aria-labelledby="unit-h-${u.n}">
    <div class="csq-unit-head"><h2 id="unit-h-${u.n}">${t('cs.unit.n', { n: u.n })} · ${en('span', u.title)}
        ${u.optional ? html` <span class="chip-s">${t('cs.unit.optional')}</span>` : ''}${u.needsSchoolPlan ? html` <span class="chip-s warn">${t('cs.unit.needsPlan')}</span>` : ''}</h2>
      <span class="acts">
        <form data-api="/api/lessons/from-template/unit/${u.n}" data-reload data-toast="${t('cs.toast.many')}">${schoolIn}${bandIn}<button class="btn" type="submit">➕ ${t('cs.unit.add')}</button></form>
        ${d.classes.length ? html`<a class="btn" href="${lessonUrl(u.lessons[0].keys[band], '#assign-unit')}">📅 ${t('cs.unit.assign')}</a>` : ''}
      </span></div>
    <p class="small muted">${t('cs.unit.lessonsN', { count: u.lessons.length })} · <span lang="en" dir="ltr">${u.tool}</span></p>
    ${u.n === 7 ? builderLine(t, d.builder) : ''}
    <ul class="csq-lrows">${u.lessons.map(l => lessonRow(u, l))}</ul>
  </section>`;
  const added = [...lib.values()].filter(s => s.inLibrary && T.getTemplate(s.key).band === band).length;
  return html`
  <div class="pagehead csq-plan-head"><div><span class="small muted">${school.name}</span><h1>💻 CS Quest ${programBadge(cat)}</h1>
    <p class="muted">${t('cs.program.tagline')} · ${t('cs.program.counts', { lessons: 23, units: 7 })}</p></div>
    <div class="row"><a class="btn" href="/teach/cs-quest/coverage">🗺️ ${t('cs.program.coverage')}</a><a class="btn" href="/teach/lessons?school=${school.id}">📚 ${t('lessons.library.title')}</a></div></div>
  ${d.schools.length > 1 ? html`<nav class="seg schoolpick" aria-label="${t('school.class.school')}">${d.schools.map(s => html`<a class="btn btn-sm ${s.id === school.id ? 'btn-primary' : ''}" href="/teach/cs-quest?band=${band}&school=${s.id}">${s.name}</a>`)}</nav>` : ''}
  <div class="csq-seg"><span class="small muted">${t('cs.band.label')}</span>
    <nav class="seg" aria-label="${t('cs.band.label')}" data-band-toggle>${T.BANDS.map(bc => html`<a href="${href(bc)}" data-band="${bc}" ${bc === band ? raw('aria-current="page"') : ''}>${t(BAND_KEY[bc])} · <span lang="en" dir="ltr">${cat.bands[bc].inGame}</span></a>`)}</nav>
    <span class="small muted">${t('cs.program.inLibrary', { count: added })}</span></div>
  <p class="small muted">${t('cs.program.lead')}</p>
  ${before}
  <section aria-labelledby="paths-h"><h2 id="paths-h" class="sec-h">🧭 ${t('cs.paths.h')}</h2><p class="small muted">${t('cs.paths.lead', { band: t(BAND_KEY[band]) })}</p>
    <div class="csq-paths">${cat.paths.map(pathCard)}</div></section>
  <h2 class="sec-h">📚 ${t('cs.units.h')}</h2>
  ${cat.units.map(unitCard)}
  <p class="small muted">${t('cs.program.footer')} <a href="/teachers/cs-quest">${t('cs.program.public')}</a> · <a href="/teach/cs-quest/coverage">${t('cs.program.coverage')}</a> · <span lang="en" dir="ltr">${b.grade}: ${b.inGame}</span></p>`;
}

// ---------------------------------------------------------------- the plan page (/teach/cs-quest/:key)
/**
 * d: { cat, tpl, other (the other band's file or null), st (library status), copy (the current copy's steps or null),
 *      assigned: [{ class_id, name, id }], sets: { warmup, exit, review }, bank: bool, warmupItems, exitItems,
 *      classes: [{ id, name, teaches }], flags, builder, published: slug -> game | null, school, zoneNote }
 */
export function planBody(req, d) {
  const t = req.t, { cat, tpl, st } = d;
  const key = tpl.key, play = tpl.play || {};
  const game = play.type === 'game' ? play.game : null, pub = game ? d.published[game] : null;
  const wyr = play.type === 'live';
  const inLib = !!(st && st.inLibrary), current = inLib ? st.current : null;
  const classOptions = sel => d.classes.map(c => html`<option value="${c.id}" ${c.id === sel ? raw('selected') : ''}>${c.name}</option>`);
  const classField = (id, name = 'classId') => (d.classes.length ? html`<div class="field"><label for="${id}">${t('lessons.assign.class')}</label><select class="input" id="${id}" name="${name}">${classOptions(d.preselect)}</select></div>` : '');
  const liveForm = (what, label, emoji, primary = false) => html`<form class="csq-liveform" data-api="/api/cs-quest/lessons/${key}/live">${d.classes.length ? html`<input type="hidden" name="classId" value="${d.preselect || d.classes[0].id}" data-class-follow>` : ''}<input type="hidden" name="schoolId" value="${d.school.id}"><input type="hidden" name="what" value="${what}"><button class="btn ${primary ? 'btn-primary' : ''}" type="submit">${emoji} ${label}</button></form>`;
  // The two equal warm-up buttons (D2): live, or the projector; 6.1 and 6.3 start Would You Rather instead.
  const warmupLive = !d.flags.live ? html`<p class="notice csq-notice-line">ℹ️ ${t('cs.plan.liveOff')}</p>`
    : tpl.warmup ? liveForm('warmup', t('cs.buttons.warmup'), '📡', true) : wyr ? liveForm('wyr', t('cs.buttons.wyr'), '📡', true) : '';
  const projector = tpl.warmup ? html`<a class="btn btn-primary" href="${lessonUrl(key, '?projector=warmup')}" target="_blank" rel="noopener">🖥️ ${t('cs.buttons.projector')}</a>` : '';
  const steps = (d.copy || []).filter(Boolean);
  const printables = ['exit-half', 'sub-plan', 'unplugged', 'rubric', 'planning-sheet', 'etiquette-card', ...(tpl.unpluggedTwin?.printables || [])].filter((x, i, a) => a.indexOf(x) === i);
  const sheetName = s => (t.has(`cs.sheets.${s}`) ? t(`cs.sheets.${s}`) : s.replace(/-/g, ' '));
  const printMenu = html`<details class="csq-menu"><summary class="btn">🖨️ ${t('cs.buttons.printables')}</summary><div class="menu">
    ${printables.map(s => html`<a href="${lessonUrl(key, `?sheet=${s}`)}" target="_blank" rel="noopener">${sheetName(s)}</a>`)}</div></details>`;
  const assignForm = d.classes.length ? html`<details class="panel csq-assign" id="assign"><summary>📌 ${t('cs.buttons.assign')}</summary>
    <form class="formgrid" data-api="/api/cs-quest/lessons/${key}/assign" data-reload novalidate><input type="hidden" name="schoolId" value="${d.school.id}">
      ${classField('as-c')}
      <div class="field"><label for="as-o">${t('lessons.assign.opens')}</label><input class="input" id="as-o" name="opensAt" type="date"></div>
      <div class="field"><label for="as-d">${t('lessons.assign.due')}</label><input class="input" id="as-d" name="dueAt" type="date"></div>
      <div class="field end"><button class="btn btn-primary" type="submit">📌 ${t('lessons.assign.button')}</button></div>
      <p class="small muted wide">${t('cs.plan.assignNote')} ${d.zoneNote}</p></form></details>` : html`<p class="notice csq-notice-line" id="assign">ℹ️ ${t('lessons.assign.noClasses')}</p>`;
  const unitForm = d.classes.length ? html`<details class="panel csq-assign csq-unitform" id="assign-unit"><summary>📅 ${t('cs.buttons.assignUnit')}</summary>
    <form class="formgrid" data-api="/api/cs-quest/assign-unit" data-reload novalidate><input type="hidden" name="schoolId" value="${d.school.id}"><input type="hidden" name="band" value="${tpl.band}">
      ${classField('au-c')}
      <div class="field"><label for="au-w">${t('cs.unitForm.what')}</label><select class="input" id="au-w" name="what"><option value="unit:${tpl.unit}">${t('cs.unit.n', { n: tpl.unit })} · ${tpl.unitTitle}</option>${cat.paths.map(p => html`<option value="path:${p.id}">${p.title}</option>`)}</select></div>
      <div class="field"><label for="au-s">${t('cs.unitForm.start')}</label><input class="input" id="au-s" name="start" type="date"></div>
      <div class="field"><label for="au-cad">${t('cs.unitForm.cadence')}</label><select class="input" id="au-cad" name="cadence">${['weekdays', 'daily', 'twice-weekly', 'weekly'].map(c => html`<option value="${c}">${t(`cs.unitForm.cadences.${c.replace('-', '')}`)}</option>`)}</select></div>
      <div class="field"><label for="au-due">${t('cs.unitForm.dueDays')}</label><input class="input" id="au-due" name="dueDays" type="number" min="0" max="60" placeholder="${t('cs.unitForm.dueAuto')}"></div>
      <div class="field end"><button class="btn btn-primary" type="submit">📅 ${t('cs.unitForm.button')}</button></div>
      <p class="small muted wide">${t('cs.unitForm.note')} ${d.zoneNote}</p></form></details>` : '';
  const state = html`<div class="csq-state">
    ${stateChip(t, st)}
    ${current ? html`<a class="btn btn-sm" href="/teach/lessons/${current.id}">✏️ ${t('cs.state.open')}</a>` : html`<form data-api="/api/lessons/from-template/${key}" data-reload data-toast="${t('cs.toast.one')}"><input type="hidden" name="schoolId" value="${d.school.id}"><button class="btn btn-sm btn-primary" type="submit">➕ ${t('cs.add')}</button></form>`}
    ${current ? html`<form data-api="/api/lessons/${current.id}/reset-template" data-reload data-toast="${t('cs.state.resetDone')}" data-confirm="${t('cs.state.resetConfirm')}"><button class="btn btn-sm" type="submit">♻️ ${t('cs.state.reset')}</button></form>` : ''}
    ${d.assigned.map(a => html`<a class="chip-s" href="/class/${a.class_id}/progress/${a.id}">📌 ${a.name}</a>`)}
    ${d.other ? html`<a class="btn btn-sm" href="${lessonUrl(d.other.key)}">🔁 ${t('cs.plan.switchBand', { band: t(BAND_KEY[d.other.band]) })}</a>` : ''}
  </div>`;
  const notes = html`${!d.bank ? html`<p class="notice warn">⚠️ ${t('cs.plan.bankMissing')}</p>` : ''}${game && !pub ? html`<p class="notice warn">⚠️ ${t('cs.plan.gameNotYet', { game: cat.games[game]?.title || game })}</p>` : ''}`;
  const buttons = html`<section class="panel" aria-labelledby="go-h"><h2 id="go-h" class="sr-only">${t('cs.plan.actions')}</h2>
    <div class="csq-two">${warmupLive}${projector}</div>
    <div class="acts csq-acts">
      ${game && pub && tpl.params ? html`<a class="btn" href="/play/${game}?${tpl.params}&mode=projector" target="_blank" rel="noopener">▶ ${t('cs.buttons.game')}</a>` : ''}
      ${d.flags.live && d.bank ? liveForm('exit', t('cs.buttons.exitLive'), '📡') : ''}
      ${d.flags.live && d.bank ? liveForm('review', t('cs.buttons.review'), '🌟') : ''}
      <a class="btn" href="${lessonUrl(key, '?projector=exit')}" target="_blank" rel="noopener">🖥️ ${t('cs.buttons.exitProjector')}</a>
      <a class="btn" href="${lessonUrl(key, '?print=1')}" target="_blank" rel="noopener">🖨️ ${t('cs.buttons.print')}</a>
      ${printMenu}
      ${d.classes.length ? html`<a class="btn" href="#assign">📌 ${t('cs.buttons.assign')}</a><a class="btn" href="#assign-unit">📅 ${t('cs.buttons.assignUnit')}</a>` : ''}
    </div>
    ${d.classes.length > 1 ? html`<p class="small muted csq-classpick"><label for="live-class">${t('cs.plan.liveClass')}</label> <select class="input input-sm" id="live-class" data-class-pick>${classOptions(d.preselect)}</select></p>` : ''}
    ${questCode(tpl.questCode)}</section>`;
  const exitRubric = (tpl.exit.rubric || []).length ? html`<div class="csq-tbl"><table class="tbl csq-rubric-tbl" lang="en" dir="ltr"><thead><tr><th>${t('cs.plan.rubricLine')}</th><th>0</th><th>1</th><th>2</th><th>3</th></tr></thead>
    <tbody>${tpl.exit.rubric.map(r => html`<tr><td><b>${r.line}</b><br>${idChips(r.ids)}</td>${(r.levels || []).map(l => html`<td>${l}</td>`)}</tr>`)}</tbody></table></div>` : '';
  const playBlock = () => {
    const rows = [];
    const row = (k, v) => v && rows.push(html`<dt>${t(k)}</dt><dd>${Array.isArray(v) ? enList(v) : en('span', String(v))}</dd>`);
    if (game) { rows.push(html`<dt>${t('cs.plan.game')}</dt><dd lang="en" dir="ltr">${GAME_EMOJI[game] || '🎮'} ${cat.games[game]?.title || game} · ${play.chapterTitle || play.chapter}${play.levels ? ` · ${t('cs.plan.levelsN', { count: play.levels })}` : ''}${play.then ? ` → ${play.then.chapter} ${play.then.levels || ''}` : ''}${play.second ? ` · ${cat.games[play.second.game]?.title || play.second.game} · ${play.second.chapterTitle}` : ''}</dd>`); }
    if (wyr) row('cs.plan.starter', play.starter);
    row('cs.plan.goal', play.goal); row('cs.plan.stretch', play.stretch); row('cs.plan.pairs', play.pairs || play.solo || play.teams);
    for (const k of ['protocol', 'artifact', 'shape', 'message', 'partnerNote', 'handIn', 'roles', 'rules', 'defend', 'room', 'builderStatus', 'prefill', 'paperPath']) if (typeof play[k] === 'string') rows.push(html`<dt lang="en" dir="ltr">${k.replace(/([A-Z])/g, ' $1').toLowerCase()}</dt><dd>${en('span', play[k])}</dd>`);
    for (const k of ['rotations', 'etiquette', 'sheet', 'creditsTemplate', 'demoCircles']) if (Array.isArray(play[k])) rows.push(html`<dt lang="en" dir="ltr">${k.replace(/([A-Z])/g, ' $1').toLowerCase()}</dt><dd>${enList(play[k])}</dd>`);
    if (play.audit) rows.push(html`<dt lang="en" dir="ltr">audit (${play.audit.minutes} min)</dt><dd>${enList(play.audit.steps)}</dd>`);
    if (play.timelineWalk) rows.push(html`<dt lang="en" dir="ltr">timeline walk (${play.timelineWalk.minutes} min)</dt><dd>${enList(play.timelineWalk.steps)}</dd>`);
    row('cs.plan.lookFors', play.lookFors); row('cs.plan.misconception', play.misconception); row('cs.plan.early', play.earlyFinishers);
    return html`<dl class="csq-script">${rows}</dl>`;
  };
  const ex = tpl.explore || {};
  const stepsList = html`<ol class="csq-steps csq-plain">${tpl.steps.map(s => html`<li><span class="csq-kind" aria-hidden="true">${{ game: '🎮', build: '🛠️', text: '📖', question: '✍️', quiz: '🧩' }[s.kind]}</span><span><b lang="en" dir="ltr">${s.title}</b> <span class="small muted">${t(`lessons.kinds.${s.kind}`)}${s.gameSlug ? html` · <span lang="en" dir="ltr">${cat.games[s.gameSlug]?.title || s.gameSlug}</span>` : ''}${Array.isArray(s.standards) ? html` · ${idChips(s.standards)}` : ''}</span></span><span class="csq-min">${t('lessons.minutesN', { count: s.minutes })}</span></li>`)}</ol>`;
  return html`
  <div class="pagehead csq-plan-head"><div><span class="small muted">${t('cs.unit.n', { n: tpl.unit })} · ${en('span', tpl.unitTitle)} · ${t(BAND_KEY[tpl.band])}</span>
    <h1 lang="en" dir="ltr">${tpl.title}</h1>
    <p class="csq-meta">${programBadge(cat)}<span>⏱️ ${t('lessons.minutesN', { count: tpl.duration })}</span>${idChips(tpl.csta.primary)}</p></div>
    ${state}</div>
  ${notes}
  ${buttons}
  ${tpl.unit === 7 ? builderLine(t, d.builder) : ''}
  <div class="csq-grid">
    <section class="panel"><h2>🎯 ${t('cs.plan.iCan')}</h2>${enList(tpl.iCan.map(s => `I can ${s}`))}
      ${tpl.summary ? paras(tpl.summary, 'small') : ''}</section>
    <section class="panel"><h2>📐 ${t('cs.plan.standards')}</h2>
      <ul class="csq-plain">${tpl.csta.primary.map(id => { const s = CSTA.byId(id); return html`<li>${idChip(id)} ${s ? en('span', s.statement, ' class="small"') : ''}</li>`; })}</ul>
      ${tpl.csta.also.length ? html`<p class="small"><b>${t('cs.plan.also')}</b> ${idChips(tpl.csta.also)}</p>` : ''}
      ${tpl.csta.buildsToward.length ? html`<p class="small"><b>${t('cs.plan.toward')}</b> ${idChips(tpl.csta.buildsToward)}</p>` : ''}
      <p class="small"><b>${t('cs.plan.vocab')}</b> <span lang="en" dir="ltr">${(ex.vocab || []).join(' · ')}</span></p></section>
    <section class="panel"><h2>🧰 ${t('cs.plan.materials')}</h2>${enList(tpl.materials, 'csq-list csq-materials')}</section>
    <section class="panel"><h2>✏️ ${t('cs.plan.doNow')}</h2>${en('p', tpl.doNow)}</section>
    <section class="panel wide"><h2>⏱️ ${t('cs.plan.period')}</h2>${periodTable(t, tpl.plan)}
      <div class="csq-two" style="margin-top:var(--s4)">
        <div class="csq-cut"><h3>⏳ ${t('cs.plan.short40')}</h3>${periodTable(t, tpl.shortPeriod40.table)}${en('p', tpl.shortPeriod40.keep, ' class="small"')}${tpl.shortPeriod40.discuss ? html`<p class="small"><b>${t('cs.plan.discuss')}:</b> ${en('span', tpl.shortPeriod40.discuss)}</p>` : ''}</div>
        <div class="csq-cut"><h3>🧱 ${t('cs.plan.block')}</h3>${enList(tpl.block?.add || [])}</div></div></section>
    ${tpl.warmup ? html`<section class="panel wide"><h2>🏁 ${t('cs.plan.warmup')}</h2>
      <p class="small muted">${t('cs.plan.warmupHow', { mode: cat.games[T.WARMUP_GAME[tpl.band]]?.title || T.WARMUP_GAME[tpl.band], secs: tpl.warmup.secs || 15 })}${tpl.warmup.why ? html` · ${en('span', tpl.warmup.why)}` : ''}</p>
      ${d.warmupItems ? html`<ol class="csq-exititems">${d.warmupItems.map((it, i) => itemView(it, { n: i + 1 }))}</ol>` : html`<p class="muted">${t('cs.plan.bankMissing')}</p>`}</section>` : ''}
    <section class="panel wide"><h2>🖥️ ${t('cs.plan.explore')} <span class="small muted">· ${t('lessons.minutesN', { count: ex.minutes || 6 })}</span></h2>
      <dl class="csq-script">
        ${ex.demo ? html`<dt>${t('cs.plan.demo')}</dt><dd lang="en" dir="ltr">${ex.demo.chapter} · ${t('cs.plan.levelN', { n: ex.demo.level })}</dd>` : ''}
        <dt>${t('cs.plan.do')}</dt><dd>${enList(ex.do)}</dd>
        <dt>${t('cs.plan.say')}</dt><dd>${enList(ex.say)}</dd>
        <dt>${t('cs.plan.ask')}</dt><dd>${enList(ex.ask)}</dd>
        ${ex.afterAsk ? html`<dt>${t('cs.plan.afterAsk')}</dt><dd>${en('p', ex.afterAsk)}</dd>` : ''}
        <dt>${t('cs.plan.bigIdea')}</dt><dd>${en('p', ex.bigIdea, ' class="csq-answer-ok"')}</dd></dl></section>
    <section class="panel wide"><h2>🎮 ${t('cs.plan.play')} <span class="small muted">· ${t('lessons.minutesN', { count: play.minutes || 18 })}</span></h2>${playBlock()}</section>
    <section class="panel"><h2>💬 ${t('cs.plan.discuss')}</h2>${enList(tpl.discuss)}${tpl.showMe ? html`<p class="small"><b>${t('cs.plan.showMe')}</b> ${en('span', tpl.showMe)}</p>` : ''}</section>
    <section class="panel"><h2>🧩 ${t('cs.plan.exit')}</h2>
      ${d.exitItems ? html`<ol class="csq-exititems">${d.exitItems.map((it, i) => itemView(it, { n: i + 1 }))}</ol>` : html`<p class="muted">${t('cs.plan.bankMissing')}</p>`}
      <p><b>${t('cs.plan.sentence')}</b> ${en('span', tpl.exit.sentencePrompt)}<br><span class="small muted">${t('cs.plan.frame')}</span> ${en('span', tpl.exit.frame)}</p></section>
    <section class="panel wide"><h2>📏 ${t('cs.plan.rubric')}</h2><p class="small muted">${t('cs.plan.rubricHow')}</p>${exitRubric}</section>
    <section class="panel"><h2>🪜 ${t('cs.plan.diff')}</h2><p><b>${t('cs.plan.support')}</b></p>${enList(tpl.differentiation.support)}<p><b>${t('cs.plan.stretch')}</b></p>${enList(tpl.differentiation.stretch)}</section>
    <section class="panel"><h2>✂️ ${t('cs.plan.unplugged')} <span class="small muted">· ${en('span', tpl.unpluggedTwin.title)} · ${t('lessons.minutesN', { count: tpl.unpluggedTwin.minutes })}</span></h2>
      <p class="small"><b>${t('cs.plan.materials')}</b> <span lang="en" dir="ltr">${tpl.unpluggedTwin.materials.join('; ')}</span></p>${raw(`<ol class="csq-list" lang="en" dir="ltr">${tpl.unpluggedTwin.steps.map(s => `<li>${esc(s)}</li>`).join('')}</ol>`)}
      <p class="small">${tpl.unpluggedTwin.printables.map(s => html`<a href="${lessonUrl(key, `?sheet=${s}`)}" target="_blank" rel="noopener">🖨️ ${sheetName(s)}</a> `)}</p></section>
    <section class="panel csq-box"><h2>🧑‍🏫 ${t('cs.plan.sub')}</h2>${raw(`<ol class="csq-list" lang="en" dir="ltr">${tpl.subPlan.map(s => `<li>${esc(s)}</li>`).join('')}</ol>`)}</section>
    ${tpl.notes?.length ? html`<section class="panel"><h2>📝 ${t('cs.plan.notes')}</h2>${enList(tpl.notes)}</section>` : ''}
    <section class="panel wide"><h2>👩‍🎓 ${t('cs.plan.steps')}</h2><p class="small muted">${t('cs.plan.stepsNote')}</p>${stepsList}</section>
  </div>
  ${assignForm}${unitForm}`;
}

// ---------------------------------------------------------------- the coverage map (/teach/cs-quest/coverage)
const PRACTICE_NAMES = { 1: 'Fostering an inclusive computing culture', 2: 'Collaborating around computing', 3: 'Recognizing and defining computational problems', 4: 'Developing and using abstractions', 5: 'Creating computational artifacts', 6: 'Testing and refining computational artifacts', 7: 'Communicating about computing' };
/** d: { map (T.coverage()), level: '1B' | '2' | null, print } */
export function coverageBody(req, d) {
  const t = req.t, { map } = d;
  const levels = T.BANDS.filter(l => !d.level || l === d.level);
  const lessonsCell = s => html`<span lang="en" dir="ltr">${s.primary.map(n => html`<b>${n}</b> `)}${s.also.map(n => html`<span class="csq-also">${n}</span> `)}${s.buildsToward.map(n => html`<span class="csq-toward">${n}</span> `)}</span>`;
  const activityCell = s => {
    const seen = new Set();
    const acts = s.activities.map(a => `${a.game} · ${a.chapterTitle}${a.levels ? ` (${a.levels})` : ''}${a.then ? ` → ${a.then.chapter} ${a.then.levels || ''}` : ''}`).filter(x => !seen.has(x) && seen.add(x));
    const other = s.steps.filter(x => x.kind !== 'game').map(x => `${x.lesson} ${x.step}`);
    return raw(`<span lang="en" dir="ltr">${[...acts, ...other].map(esc).join('; ') || '—'}</span>`);
  };
  const itemsCell = s => (map.banks ? html`<span dir="ltr">${s.items.exit} · ${s.items.review} · ${s.items.opener}</span>` : html`<span class="muted">${t('cs.coverage.noBanks')}</span>`);
  const rubricCell = s => raw(`<span lang="en" dir="ltr">${[...new Set(s.rubric.map(r => `${r.lesson} ${r.line}`))].map(esc).join('; ') || '—'}</span>`);
  const table = lv => html`<section class="panel wide" aria-labelledby="cov-${lv}"><h2 id="cov-${lv}">${t('cs.coverage.level', { level: lv, grades: T.GRADES[lv] })}</h2>
    <div class="csq-tbl"><table class="tbl csq-cov"><thead><tr><th>${t('cs.coverage.cols.id')}</th><th>${t('cs.coverage.cols.concept')}</th><th>${t('cs.coverage.cols.practices')}</th><th>${t('cs.coverage.cols.lessons')}</th><th>${t('cs.coverage.cols.activity')}</th><th>${t('cs.coverage.cols.items')}</th><th>${t('cs.coverage.cols.rubric')}</th></tr></thead>
    <tbody>${map.ids.filter(s => s.level === lv).map(s => html`<tr><td class="id" lang="en" dir="ltr" title="${s.statement}">${s.id}</td><td lang="en" dir="ltr">${s.concept} · ${s.subconcept}</td><td dir="ltr">${s.practiceCodes.join(', ')}</td><td>${lessonsCell(s)}</td><td>${activityCell(s)}</td><td>${itemsCell(s)}</td><td>${rubricCell(s)}</td></tr>`)}</tbody></table></div></section>`;
  const practices = html`<section class="panel wide" aria-labelledby="pr-h"><h2 id="pr-h">${t('cs.coverage.practicesH')}</h2>
    <div class="csq-tbl"><table class="tbl csq-practices"><thead><tr><th>${t('cs.coverage.practice')}</th>${map.units.map(n => html`<th dir="ltr">U${n}</th>`)}<th>${t('cs.coverage.units')}</th></tr></thead>
    <tbody>${[1, 2, 3, 4, 5, 6, 7].map(p => { const cells = map.units.map(n => (map.practices[p][n] || [])); return html`<tr><th scope="row" lang="en" dir="ltr">P${p} ${PRACTICE_NAMES[p]}</th>${cells.map(c => html`<td class="${c.length ? 'on' : ''}" lang="en" dir="ltr">${c.join(', ')}</td>`)}<td dir="ltr">${cells.filter(c => c.length).length}</td></tr>`; })}</tbody></table></div></section>`;
  const noPrimary = map.ids.filter(s => !s.primaryOutsideUnit7).map(s => s.id);
  return html`
  <div class="pagehead"><div><span class="small muted">CS Quest</span><h1>🗺️ ${t('cs.coverage.title')}</h1>
    <p class="muted">${t('cs.coverage.lead', { ids: map.ids.length, lessons: map.lessons, banks: map.banks })}</p></div>
    ${d.print ? '' : html`<div class="row"><a class="btn" href="/teach/cs-quest/coverage?print=1" target="_blank" rel="noopener">🖨️ ${t('cs.buttons.print')}</a><a class="btn" href="/teach/cs-quest">💻 CS Quest</a></div>`}</div>
  ${d.print ? '' : html`<nav class="seg" aria-label="${t('cs.coverage.level', { level: '', grades: '' })}"><a href="/teach/cs-quest/coverage" ${!d.level ? raw('aria-current="page"') : ''}>${t('cs.coverage.both')}</a>${T.BANDS.map(l => html`<a href="/teach/cs-quest/coverage?level=${l}" ${d.level === l ? raw('aria-current="page"') : ''}>${t(BAND_KEY[l])}</a>`)}</nav>`}
  <section class="panel"><h2>${t('cs.coverage.legendH')}</h2>
    <ul class="csq-legend"><li><b>${t('cs.coverage.practiced')}</b> ${t('cs.coverage.practicedText')}</li><li><b>${t('cs.coverage.checked')}</b> ${t('cs.coverage.checkedText')}</li><li><b>${t('cs.coverage.applied')}</b> ${t('cs.coverage.appliedText')}</li></ul>
    <p class="small muted">${t('cs.coverage.bold')} · ${t('cs.coverage.itemsNote')}</p>
    ${map.missing.length ? html`<p class="notice warn">${t('cs.coverage.missing', { count: map.missing.length })} <span lang="en" dir="ltr">${map.missing.join(', ')}</span></p>` : html`<p class="notice good">${t('cs.coverage.complete')}</p>`}
    ${noPrimary.length ? html`<p class="notice warn">${t('cs.coverage.noPrimary')} ${idChips(noPrimary)}</p>` : ''}</section>
  ${levels.map(table)}
  ${practices}`;
}

// ---------------------------------------------------------------- the lesson editor banner (/teach/lessons/:id)
/** "From CS Quest 1.2 (v1) · Open the plan page" with Reset (P21) when a newer catalogue version exists. */
export function editorBanner(req, l, tpl, { edit = false } = {}) {
  const t = req.t;
  const newer = tpl.version > (l.template_version || 0);
  return html`<div class="notice csq-notice-line ${newer ? 'warn' : ''}"><span>💻 ${t('cs.editor.from', { n: tpl.n, version: l.template_version || tpl.version })}${newer ? ` · ${t('cs.editor.newer', { version: tpl.version })}` : ''}</span>
    <a class="btn btn-sm" href="${lessonUrl(tpl.key)}">📋 ${t('cs.editor.plan')}</a>
    ${edit && newer ? html`<form data-api="/api/lessons/${l.id}/reset-template" data-reload data-toast="${t('cs.state.resetDone')}" data-confirm="${t('cs.state.resetConfirm')}"><button class="btn btn-sm" type="submit">♻️ ${t('cs.state.reset')}</button></form>` : ''}</div>`;
}
