// Games in folders, assigned to classes (services/game-folders.js): the folder pages under Build, "Save to folder" for
// any game a person can see (their own and Oomba's), and the Assign page (a class, an optional due day, and "Also post
// to Google Classroom"). These replace the teacher's lesson library: see docs/decisions.md "Games, not lessons".
import { Router } from 'express';
import { html, raw } from '../views/html.js';
import { page, notFound, VERSION } from '../views/layout.js';
import { coverArt, emptyState } from '../views/components.js';
import { requireUser, requireBuilder } from '../auth.js';
import { rateLimit } from '../services/ratelimit.js';
import * as S from '../services/schools.js';
import * as L from '../services/lessons.js';
import * as games from '../services/games.js';
import * as F from '../services/game-folders.js';
import { liveGameOf } from '../live/live-games.js';
import { canHost as liveCanHost } from '../services/classlive-access.js';
import { liveOn } from '../services/classlive-sessions.js';
import { gcAssignField, gcAfterAssign } from './gclassroom.js';
import * as gameSets from '../services/game-sets.js';
import { cleanOptions, parseParams } from '../services/play-params.js';

/** An official game that opens at a teacher's problem or question set (services/game-sets.js SET_GAMES): its Assign
 *  carries those lesson options (opts), and the lesson is named after them. -> { opts, what, title } | null (not one) */
const setGameOf = g => !!g && gameSets.SET_GAMES.has(g.slug) && g.source === 'seed';
function setAssign(t, g, raw) {
  if (!setGameOf(g)) return null;
  const opts = cleanOptions(String(raw || '')) || '';
  const what = gameSets.describe(g.id, parseParams(opts), g.slug);
  const label = what ? (what.kind === 'set' ? t('teach.assign.set', { count: what.n }) : what.label) : '';
  return { opts, what, label, title: what ? `${g.title}: ${label}` : '' };
}
import { zoneNote } from './lessons.js';

export const router = Router();
const CSS = raw(`<link rel="stylesheet" href="/css/studio.css?v=${VERSION}"><link rel="stylesheet" href="/css/schools.css?v=${VERSION}">`);
const b = req => req.body || {};
const ERR = { folderName: 'folders.errors.name', tooManyFolders: 'folders.errors.tooMany', folderFull: 'folders.errors.full', publishFirst: 'folders.errors.publishFirst' };
const errText = (req, code, vars) => req.t(ERR[code] || `lessons.errors.${code}`, vars);
const fail = (req, res, r) => res.status(r.code === 'notFound' ? 404 : 400).json({ error: errText(req, r.code, { class: r.className || '' }) });
/** A game by id, or an Oomba game by its slug (?game=fraction-factory). */
const gameOf = (id, slug) => (id ? games.getGame(String(id)) : slug ? games.getGameBySlug(String(slug)) : null);
/** Where a game card's Play goes: its page (Oomba's and published ones), else the Studio (a draft of one's own). */
const playHref = (u, g) => (g.published_version_id || g.source === 'seed' ? `/g/${g.slug}` : `/studio/${g.id}`);

/** The "📁 My folders" strip on Build: each folder (with its count) and New folder. */
export function foldersStrip(req, current = '') {
  const t = req.t, list = F.foldersOf(req.user.id);
  return html`<section class="build-sec gfo-strip" aria-labelledby="gf-h">
    <h2 id="gf-h">📁 ${t('folders.title')}</h2>
    <p class="small muted">${t('folders.why')}</p>
    <ul class="plain gfo-list">${list.map(f => html`<li><a class="gfo-chip${f.id === current ? ' is-on' : ''}" href="/build/folders/${f.id}" ${f.id === current ? raw('aria-current="page"') : ''}>📁 <b dir="auto">${f.name}</b> <span class="muted">${f.games}</span></a></li>`)}
      <li><details class="libdrop gfo-new"><summary class="btn">➕ ${t('folders.new')}</summary>
        <form class="row" data-api="/api/game-folders" novalidate><label class="sr-only" for="gf-name">${t('folders.name')}</label>
          <input class="input grow" id="gf-name" name="name" maxlength="60" placeholder="${t('folders.namePlaceholder')}" required>
          <button class="btn btn-primary" type="submit">📁 ${t('folders.create')}</button></form></details></li></ul>
  </section>${sharedStrip(req, current)}`;
}
/** "🤝 Shared by colleagues" on Build: folders staff of the same school shared (only when there are some). */
function sharedStrip(req, current = '') {
  const t = req.t, list = F.sharedWith(req.user);
  if (!list.length) return '';
  return html`<section class="build-sec gfo-strip" aria-labelledby="gfs-h"><h2 id="gfs-h">🤝 ${t('folders.sharedTitle')}</h2>
    <ul class="plain gfo-list">${list.map(f => html`<li><a class="gfo-chip${f.id === current ? ' is-on' : ''}" href="/build/folders/${f.id}" ${f.id === current ? raw('aria-current="page"') : ''}>📁 <b dir="auto">${f.name}</b> <span class="muted"><bdi>${t('folders.by', { name: f.owner_name })}</bdi> · ${f.games}</span></a></li>`)}</ul>
  </section>`;
}

/** One game card in a folder: cover, title, Play, Assign (school staff), Remove from the folder. */
function folderGame(req, f, g, staff, mine = true) {
  const t = req.t;
  return html`<li class="mygame panel gfo-game">
    <a class="mg-cover" href="${playHref(req.user, g)}" tabindex="-1" aria-hidden="true">${coverArt(g, '', { draft: !g.published_version_id && g.source !== 'seed' })}</a>
    <div class="mg-body"><h3><a href="${playHref(req.user, g)}" dir="auto">${g.title}</a></h3>
      <p class="small muted">${g.source === 'seed' ? `🦉 ${t('folders.oombaGame')}` : g.owner_id === req.user.id ? `🛠️ ${t('folders.myGame')}` : ''}</p></div>
    <div class="mg-actions"><div class="mg-row">
      <a class="btn" href="${playHref(req.user, g)}">▶ ${t('game.play')}</a>
      ${staff ? html`<a class="btn btn-primary" href="/teach/assign?id=${g.id}">📌 ${t('folders.assign')}</a>` : ''}
    </div>${mine ? html`<div class="mg-row mg-more">
      <form data-api="/api/game-folders/${f.id}/games/${g.id}/delete" data-reload><button class="btn" type="submit">${t('folders.removeGame')}</button></form>
    </div>` : html`<div class="mg-row mg-more"><a class="btn" href="/build/save?id=${g.id}">📁 ${t('folders.save')}</a></div>`}</div></li>`;
}

router.get('/build/folders/:id', requireBuilder, (req, res) => {
  const t = req.t, f = F.getFolder(req.params.id);
  if (!f || !F.canSee(req.user, f)) return notFound(req, res);
  const list = F.gamesIn(req.user, f.id), staff = S.isSchoolStaff(req.user), mine = f.owner_id === req.user.id;
  const schools = mine ? F.staffSchools(req.user) : [], sharedIn = f.school_id ? (S.getSchool(f.school_id) || {}).name || '' : '';
  const owner = mine ? null : (F.sharedWith(req.user).find(x => x.id === f.id) || {}).owner_name || '';
  // Sharing (the owner): with one of their schools, or not; colleagues only see games they can open.
  const share = mine && schools.length ? html`<section class="panel gfo-share" aria-labelledby="gsh-h"><h2 id="gsh-h" class="sr-only">🤝 ${t('folders.shareTitle')}</h2>
    ${f.school_id ? html`<p>🤝 ${t('folders.sharedWithSchool', { school: sharedIn })}</p><p class="small muted">${t('folders.shareNote')}</p>
      <form data-api="/api/game-folders/${f.id}/share" data-reload><input type="hidden" name="schoolId" value=""><button class="btn btn-sm" type="submit">${t('folders.unshare')}</button></form>`
    : html`<form class="row" data-api="/api/game-folders/${f.id}/share" data-reload>${schools.length > 1 ? html`<label class="sr-only" for="gsh-s">${t('folders.shareTitle')}</label><select class="input" id="gsh-s" name="schoolId">${schools.map(x => html`<option value="${x.id}">${x.name}</option>`)}</select>` : html`<input type="hidden" name="schoolId" value="${schools[0].id}">`}
      <button class="btn" type="submit">🤝 ${schools.length > 1 ? t('folders.shareTitle') : t('folders.shareWith', { school: schools[0].name })}</button></form><p class="small muted">${t('folders.shareNote')}</p>`}
  </section>` : '';
  // The owner's tools in one row under the name (a row, not a ⋯ menu: it never runs off a phone's screen).
  const head = mine ? html`<div class="row gfo-tools">
      <details class="libdrop gfo-rename"><summary class="btn btn-sm">🏷️ ${t('build.rename')}</summary>
        <form class="row" data-api="/api/game-folders/${f.id}" data-reload><label class="sr-only" for="gf-rn">${t('folders.name')}</label><input class="input input-sm grow" id="gf-rn" name="name" value="${f.name}" maxlength="60"><button class="btn btn-sm btn-primary" type="submit">${t('school.save')}</button></form></details>
      <form data-api="/api/game-folders/${f.id}/up" data-reload><button class="btn btn-sm" type="submit" aria-label="${t('lessons.up')}">↑</button></form>
      <form data-api="/api/game-folders/${f.id}/down" data-reload><button class="btn btn-sm" type="submit" aria-label="${t('lessons.down')}">↓</button></form>
      <form data-api="/api/game-folders/${f.id}/delete" data-redirect="/build" data-confirm="${t('folders.deleteConfirm', { name: f.name })}"><button class="btn btn-sm btn-danger" type="submit">🗑️ ${t('folders.delete')}</button></form>
    </div>` : '';
  const body = html`<div class="pagehead"><h1 dir="auto">📁 ${f.name}</h1></div>${head}
  ${mine ? '' : html`<p class="muted">🤝 <bdi>${t('folders.by', { name: owner })}</bdi> · ${t('folders.sharedWithSchool', { school: sharedIn })}</p>
    <form data-api="/api/game-folders/${f.id}/copy"><button class="btn btn-primary" type="submit">📁 ${t('folders.copy')}</button></form>`}
  ${share}
  ${foldersStrip(req, f.id)}
  <section class="build-sec" aria-labelledby="gf-in-h"><h2 id="gf-in-h" class="sr-only">${f.name}</h2>
    ${mine ? html`<p class="row"><a class="btn btn-primary" href="/build/new?folder=${f.id}">✨ ${t('build.newGame')}</a><a class="btn" href="/learn">🦉 ${t('folders.findOomba')}</a></p>` : ''}
    ${list.length ? html`<ul class="mygames">${list.map(g => folderGame(req, f, g, staff, mine))}</ul>`
      : emptyState({ emoji: '📁', title: t('folders.emptyTitle'), text: t('folders.emptyText') })}
  </section>`;
  page(req, res, { title: f.name, active: 'build', back: '/build', backLabel: req.t('nav.build'), body, head: CSS });
});

/** "Save to folder": the person's folders, each with Add or (already there) Remove, and a new folder made with the game in it. */
router.get('/build/save', requireUser, (req, res) => {
  const t = req.t, u = req.user, g = gameOf(req.query.id, req.query.game);
  if (!g || g.status === 'deleted' || !games.canView(u, g)) return notFound(req, res);
  const gl = g.source === 'seed' ? games.localizeGame(g) : g;
  const list = F.foldersOf(u.id), have = F.foldersWith(u.id, g.id);
  const body = html`<div class="pagehead"><h1>📁 ${t('folders.saveTitle', { game: gl.title })}</h1></div>
  <section class="panel gfo-save" aria-labelledby="gs-h"><h2 id="gs-h" class="sr-only">${t('folders.title')}</h2>
    ${list.length ? html`<ul class="plain gfo-pick">${list.map(f => html`<li class="${have.has(f.id) ? 'is-in' : ''}">
      <span class="gfo-fname"><b dir="auto">📁 ${f.name}</b><span class="small muted">${have.has(f.id) ? `✅ ${t('folders.saved')} · ` : ''}${t('folders.gamesN', { count: f.games })}</span></span>
      ${have.has(f.id) ? html`<form class="gfo-fact" data-api="/api/game-folders/${f.id}/games/${g.id}/delete" data-reload><button class="btn btn-sm" type="submit">${t('folders.removeGame')}</button></form>`
        : html`<form class="gfo-fact" data-api="/api/game-folders/${f.id}/games" data-reload><input type="hidden" name="gameId" value="${g.id}"><button class="btn btn-sm btn-primary" type="submit">📁 ${t('folders.addHere')}</button></form>`}</li>`)}</ul>`
      : html`<p class="muted">${t('folders.none')}</p>`}
    <form class="gfo-newsave" data-api="/api/game-folders" data-reload novalidate><input type="hidden" name="gameId" value="${g.id}">
      <label for="gs-name">➕ ${t('folders.new')}</label>
      <div class="row"><input class="input grow" id="gs-name" name="name" maxlength="60" placeholder="${t('folders.namePlaceholder')}" required>
      <button class="btn" type="submit">${t('folders.newWithGame')}</button></div></form>
    <p class="row"><a class="btn btn-ghost" href="${playHref(u, g)}">▶ ${t('game.play')}</a><a class="btn btn-ghost" href="/build">🛠️ ${t('nav.build')}</a></p>
  </section>`;
  page(req, res, { title: t('folders.saveTitle', { game: gl.title }), active: 'build', back: '/build', backLabel: t('nav.build'), body, head: CSS });
});

router.post('/api/game-folders', requireUser, rateLimit('game-folder', 120, 3600e3), (req, res) => {
  const r = F.createFolder(req.user, b(req).name);
  if (!r.ok) return fail(req, res, r);
  if (b(req).gameId) { const a = F.addGame(req.user, r.folder.id, b(req).gameId); if (!a.ok) return fail(req, res, a); return res.json({ ok: true, toast: req.t('folders.savedTo', { folder: r.folder.name }) }); }
  res.json({ ok: true, redirect: `/build/folders/${r.folder.id}` });
});
router.post('/api/game-folders/:id', requireUser, (req, res) => { const r = F.renameFolder(req.user, req.params.id, b(req).name); r.ok ? res.json({ ok: true }) : fail(req, res, r); });
router.post('/api/game-folders/:id/delete', requireUser, (req, res) => { const r = F.deleteFolder(req.user, req.params.id); r.ok ? res.json({ ok: true, redirect: '/build' }) : fail(req, res, r); });
router.post('/api/game-folders/:id/up', requireUser, (req, res) => { const r = F.moveFolder(req.user, req.params.id, -1); r.ok ? res.json({ ok: true }) : fail(req, res, r); });
router.post('/api/game-folders/:id/down', requireUser, (req, res) => { const r = F.moveFolder(req.user, req.params.id, 1); r.ok ? res.json({ ok: true }) : fail(req, res, r); });
router.post('/api/game-folders/:id/games', requireUser, rateLimit('game-folder', 120, 3600e3), (req, res) => {
  const r = F.addGame(req.user, req.params.id, b(req).gameId);
  r.ok ? res.json({ ok: true, toast: req.t(r.already ? 'folders.already' : 'folders.savedTo', { folder: r.folder.name }) }) : fail(req, res, r);
});
router.post('/api/game-folders/:id/share', requireUser, (req, res) => { const r = F.shareFolder(req.user, req.params.id, b(req).schoolId); r.ok ? res.json({ ok: true, toast: req.t(r.folder.school_id ? 'folders.sharedToast' : 'folders.unsharedToast') }) : fail(req, res, r); });
router.post('/api/game-folders/:id/copy', requireUser, rateLimit('game-folder', 120, 3600e3), (req, res) => { const r = F.copyFolder(req.user, req.params.id); r.ok ? res.json({ ok: true, toast: req.t('folders.copied'), redirect: `/build/folders/${r.folder.id}` }) : fail(req, res, r); });
router.post('/api/game-folders/:id/games/:gid/delete', requireUser, (req, res) => { const r = F.removeGame(req.user, req.params.id, req.params.gid); r.ok ? res.json({ ok: true }) : fail(req, res, r); });

// ---------------------------------------------------------------- Assign a game to a class
router.get('/teach/assign', requireUser, (req, res) => {
  const t = req.t, u = req.user;
  if (!S.isSchoolStaff(u)) return notFound(req, res);
  const g0 = gameOf(req.query.id, req.query.game);
  if (!g0 || g0.status === 'deleted' || !games.canView(u, g0) || g0.course_only) return notFound(req, res);
  const g = g0.source === 'seed' ? games.localizeGame(g0) : g0;
  const lg = g0.source === 'seed' ? liveGameOf(g0) : null, liveOnly = !!(lg && !lg.play);
  const classes = F.assignClasses(u), pre = String(req.query.class || '');
  const gc = classes.map(c => gcAssignField(req, c)).find(Boolean) || '';
  const draft = g0.source !== 'seed' && !g0.published_version_id;
  // Algebra Builder: what students open (from the game's Assign button), or a note to choose it in the game first (the
  // class would otherwise land on the teacher's gallery).
  const sa = setAssign(t, g0, req.query.opts);
  const body = html`<div class="pagehead"><h1>📌 ${t('teach.assign.title', { game: g.title })}</h1></div>
  <section class="panel assign-game" aria-labelledby="ag-h">
    <h2 id="ag-h" class="sr-only">${t('teach.assign.pickClass')}</h2>
    ${sa && sa.what ? html`<p class="lead">${t('teach.assign.opens', { what: sa.label })}</p>` : ''}
    ${sa && !sa.what ? html`<p class="notice">${t('teach.assign.pickFirst')}</p><p><a class="btn btn-primary" href="/play/${g0.slug}">▶ ${t('teach.assign.openGame')}</a></p>`
      : liveOnly ? html`<p class="notice">${t('teach.assign.liveOnly')}</p>${liveOn() && liveCanHost(u) ? html`<p><a class="btn btn-primary" href="/live?mode=${lg.mode}">📡 ${t('live.entry.hostLive')}</a></p>` : ''}`
      : draft ? html`<p class="notice">${t('folders.errors.publishFirst')}</p><p><a class="btn btn-primary" href="/studio/${g0.id}">✏️ ${t('game.edit')}</a></p>`
      : classes.length ? html`<form class="formgrid assigngrid" data-api="/api/teach/assign-game" novalidate><input type="hidden" name="gameId" value="${g0.id}">${sa && sa.opts ? html`<input type="hidden" name="opts" value="${sa.opts}">` : ''}
      <div class="field"><label for="ag-c">${t('teach.assign.pickClass')}</label><select class="input" id="ag-c" name="classId">${classes.map(c => html`<option value="${c.id}"${c.id === pre ? raw(' selected') : ''}>${c.name}</option>`)}</select></div>
      <div class="field"><label for="ag-d">${t('lessons.assign.due')}</label><input class="input" id="ag-d" name="dueAt" type="date"></div>
      ${gc}
      <div class="field end"><button class="btn btn-primary" type="submit" id="ag-go">📌 ${t('teach.assign.submit')}</button></div>
      <p class="small muted wide">${t('folders.assignNote')}</p>${gc ? html`<p class="small muted wide">🎓 ${t('teach.assign.gcGrades')}</p>` : ''}${classes[0] ? html`<p class="small muted wide">${zoneNote(t, classes[0].school_id, u)}</p>` : ''}<p class="form-err err wide" role="alert"></p></form>`
      : html`<p class="muted">${t('teach.assign.none')}</p><p><a class="btn" href="/teach">${t('nav.classroom')}</a></p>`}
    <p class="row"><a class="btn" href="${playHref(u, g0)}">▶ ${t('learn.tab.try')}</a><a class="btn btn-ghost" href="/build/save?id=${g0.id}">📁 ${t('folders.save')}</a></p>
  </section>`;
  page(req, res, { title: t('teach.assign.title', { game: g.title }), active: 'teach', back: pre ? `/class/${pre}` : '/build', backLabel: pre ? t('nav.classroom') : t('nav.build'), body, head: CSS });
});
router.post('/api/teach/assign-game', requireUser, rateLimit('lesson-new', 120, 3600e3), async (req, res) => {
  const u = req.user, { game, gameId, classId, dueAt } = b(req);
  if (!S.isSchoolStaff(u)) return res.status(404).json({ error: req.t('lessons.errors.notFound') });
  const g = gameOf(gameId, game);
  if (g && g.source === 'seed') { const lg = liveGameOf(g); if (lg && !lg.play) return res.status(400).json({ error: req.t('teach.assign.liveOnly') }); }
  const sa = setAssign(req.t, g, b(req).opts);
  if (sa && !sa.what) return res.status(400).json({ error: req.t('teach.assign.pickFirst') });
  const r = F.assignGame(u, classId, g && g.id, { dueAt, ...(sa ? { options: sa.opts, title: sa.title } : {}) });
  if (!r.ok) return fail(req, res, r);
  const also = await gcAfterAssign(req, r.classLesson);
  const toast = req.t('lessons.assign.done', { class: r.class.name });
  res.json({ ok: true, toast: also ? `${toast} · ${also}` : toast, redirect: `/class/${r.class.id}` });
});
