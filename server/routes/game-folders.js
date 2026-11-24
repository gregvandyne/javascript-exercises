// Games in folders, assigned to classes (services/game-folders.js): the old folder page's redirect (folders are a
// sidebar on Build and the class page now: routes/game-shelf.js), "Assign all" for a folder, "Save to folder" for
// any game a person can see (their own and Oomba's), and the Assign page (a class, an optional due day, and "Also post
// to Google Classroom"). These replace the teacher's lesson library: see docs/decisions.md "Games, not lessons".
import { Router } from 'express';
import { html, raw } from '../views/html.js';
import { ico } from '../views/icon.js';
import { page, notFound, VERSION } from '../views/layout.js';
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
import * as PS from '../services/proof-steps.js';
import * as TY from '../services/typing.js';

/** An official game that opens at a teacher's problem or question set (services/game-sets.js SET_GAMES): its Assign
 *  carries those lesson options (opts), and the lesson is named after them. -> { opts, what, title } | null (not one) */
const setGameOf = g => !!g && gameSets.SET_GAMES.has(g.slug) && g.source === 'seed';
function setAssign(t, g, raw) {
  if (!setGameOf(g)) return null;
  const opts = cleanOptions(String(raw || '')) || '';
  if (!opts && gameSets.OPEN_SET_GAMES.has(g.slug)) return null;   // Word Hunt with no set: the game as it is
  // Typing Pets: only a teacher's own lesson (a set code) goes this way; its built-in lessons and tests are the picker's.
  if (g.slug === TY.SLUG && !gameSets.SET_ID.test(parseParams(opts).chapter || '')) return null;
  const what = gameSets.describe(g.id, parseParams(opts), g.slug);
  const label = what ? (what.kind === 'set' ? t('teach.assign.set', { count: what.n }) : what.label) : '';
  return { opts, what, label, title: what ? `${g.title}: ${label}` : '' };
}
import { zoneNote } from './lessons.js';
import { gameHidden, mayOpenHidden } from '../services/game-focus.js';

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

/** Where a folder action goes back to: the class page it was made from (its classId, when this person manages that
 *  class), else Build; with the folder picked in the sidebar when there is one. */
function backTo(req, folderId = '') {
  const c = b(req).classId ? S.getClass(String(b(req).classId)) : null;
  const base = c && S.canManageClass(req.user, c) ? `/class/${c.id}` : '/build';
  return folderId ? `${base}?folder=${encodeURIComponent(folderId)}` : base;
}

// The folder page is now the sidebar on Build (docs/decisions.md "Folders in a sidebar, on Build and the class page"):
// its old address (in emails, bookmarks and links already sent) opens Build with that folder picked. A folder this
// person can't open is still not found.
router.get('/build/folders/:id', requireBuilder, (req, res) => {
  const f = F.getFolder(req.params.id);
  if (!f || !F.canSee(req.user, f)) return notFound(req, res);
  res.redirect(302, `/build?folder=${encodeURIComponent(f.id)}`);
});

/** "Save to folder": the person's folders, each with Add or (already there) Remove, and a new folder made with the game in it. */
router.get('/build/save', requireUser, (req, res) => {
  const t = req.t, u = req.user, g = gameOf(req.query.id, req.query.game);
  if (!g || g.status === 'deleted' || !games.canView(u, g)) return notFound(req, res);
  const gl = g.source === 'seed' ? games.localizeGame(g) : g;
  const list = F.foldersOf(u.id), have = F.foldersWith(u.id, g.id);
  const body = html`<div class="pagehead"><h1>${ico('📁', { size: 36 })} ${t('folders.saveTitle', { game: gl.title })}</h1></div>
  <section class="panel gfo-save" aria-labelledby="gs-h"><h2 id="gs-h" class="sr-only">${t('folders.title')}</h2>
    ${list.length ? html`<ul class="plain gfo-pick">${list.map(f => html`<li class="${have.has(f.id) ? 'is-in' : ''}">
      <span class="gfo-fname"><b dir="auto">${ico('📁', { size: 18 })} ${f.name}</b><span class="small muted">${have.has(f.id) ? `✅ ${t('folders.saved')} · ` : ''}${t('folders.gamesN', { count: f.games })}</span></span>
      ${have.has(f.id) ? html`<form class="gfo-fact" data-api="/api/game-folders/${f.id}/games/${g.id}/delete" data-reload><button class="btn btn-sm" type="submit">${t('folders.removeGame')}</button></form>`
        : html`<form class="gfo-fact" data-api="/api/game-folders/${f.id}/games" data-reload><input type="hidden" name="gameId" value="${g.id}"><button class="btn btn-sm btn-primary" type="submit">${ico('📁', { size: 18 })} ${t('folders.addHere')}</button></form>`}</li>`)}</ul>`
      : html`<p class="muted">${t('folders.none')}</p>`}
    <form class="gfo-newsave" data-api="/api/game-folders" data-reload novalidate><input type="hidden" name="gameId" value="${g.id}">
      <label for="gs-name">${ico('➕', { size: 18 })} ${t('folders.new')}</label>
      <div class="row"><input class="input grow" id="gs-name" name="name" maxlength="60" placeholder="${t('folders.namePlaceholder')}" required>
      <button class="btn" type="submit">${t('folders.newWithGame')}</button></div></form>
    <p class="row"><a class="btn btn-ghost" href="${playHref(u, g)}">▶ ${t('game.play')}</a><a class="btn btn-ghost" href="/build">${ico('🛠️', { size: 18 })} ${t('nav.build')}</a></p>
  </section>`;
  page(req, res, { title: t('folders.saveTitle', { game: gl.title }), active: 'build', back: '/build', backLabel: t('nav.build'), body, head: CSS });
});

/** The "Save to folder" pop-up (public/js/folder-save.js): the game, the person's folders (which already hold it), and
 *  the pop-up's words. The page /build/save stays for a browser without script. */
router.get('/api/game-folders/save', requireUser, (req, res) => {
  const t = req.t, u = req.user, g = gameOf(req.query.id, req.query.game);
  if (!g || g.status === 'deleted' || !games.canView(u, g)) return res.status(404).json({ error: t('game.api.notFound') });
  const gl = g.source === 'seed' ? games.localizeGame(g) : g, have = F.foldersWith(u.id, g.id);
  res.set('Cache-Control', 'no-store').json({
    game: { id: g.id, title: gl.title },
    folders: F.foldersOf(u.id).map(f => ({ id: f.id, name: f.name, count: t('folders.gamesN', { count: f.games }), has: have.has(f.id) })),
    words: { title: t('folders.saveTitle', { game: gl.title }), pick: t('folders.pick'), none: t('folders.none'), saved: t('folders.saved'),
      newFolder: t('folders.new'), name: t('folders.name'),
      namePlaceholder: t('folders.namePlaceholder'), save: t('folders.save'), keep: t('folders.keepBrowsing'), open: t('folders.openFolder', { folder: '{folder}' }),
      savedTo: t('folders.savedTo', { folder: '{folder}' }), already: t('folders.already', { folder: '{folder}' }), needName: t('folders.errors.name') },
  });
});
router.post('/api/game-folders/order', requireUser, rateLimit('game-folder-order', 600, 3600e3), (req, res) => { const r = F.orderFolders(req.user, b(req).ids); r.ok ? res.json({ ok: true }) : fail(req, res, r); });
router.post('/api/game-folders', requireUser, rateLimit('game-folder', 120, 3600e3), (req, res) => {
  const r = F.createFolder(req.user, b(req).name);
  if (!r.ok) return fail(req, res, r);
  if (b(req).gameId) { const a = F.addGame(req.user, r.folder.id, b(req).gameId); if (!a.ok) return fail(req, res, a); return res.json({ ok: true, folder: { id: r.folder.id, name: r.folder.name }, toast: req.t('folders.savedTo', { folder: r.folder.name }) }); }
  res.json({ ok: true, redirect: backTo(req, r.folder.id) });
});
router.post('/api/game-folders/:id', requireUser, (req, res) => { const r = F.renameFolder(req.user, req.params.id, b(req).name); r.ok ? res.json({ ok: true }) : fail(req, res, r); });
router.post('/api/game-folders/:id/delete', requireUser, (req, res) => { const r = F.deleteFolder(req.user, req.params.id); r.ok ? res.json({ ok: true, redirect: backTo(req) }) : fail(req, res, r); });
router.post('/api/game-folders/:id/up', requireUser, (req, res) => { const r = F.moveFolder(req.user, req.params.id, -1); r.ok ? res.json({ ok: true }) : fail(req, res, r); });
router.post('/api/game-folders/:id/down', requireUser, (req, res) => { const r = F.moveFolder(req.user, req.params.id, 1); r.ok ? res.json({ ok: true }) : fail(req, res, r); });
router.post('/api/game-folders/:id/games', requireUser, rateLimit('game-folder', 120, 3600e3), (req, res) => {
  const r = F.addGame(req.user, req.params.id, b(req).gameId);
  r.ok ? res.json({ ok: true, already: !!r.already, folder: { id: r.folder.id, name: r.folder.name }, toast: req.t(r.already ? 'folders.already' : 'folders.savedTo', { folder: r.folder.name }) }) : fail(req, res, r);
});
router.post('/api/game-folders/:id/order', requireUser, rateLimit('game-folder-order', 600, 3600e3), (req, res) => { const r = F.orderGames(req.user, req.params.id, b(req).ids); r.ok ? res.json({ ok: true }) : fail(req, res, r); });
router.post('/api/game-folders/:id/share', requireUser, (req, res) => { const r = F.shareFolder(req.user, req.params.id, b(req).schoolId); r.ok ? res.json({ ok: true, toast: req.t(r.folder.school_id ? 'folders.sharedToast' : 'folders.unsharedToast') }) : fail(req, res, r); });
router.post('/api/game-folders/:id/copy', requireUser, rateLimit('game-folder', 120, 3600e3), (req, res) => { const r = F.copyFolder(req.user, req.params.id); r.ok ? res.json({ ok: true, toast: req.t('folders.copied'), redirect: backTo(req, r.folder.id) }) : fail(req, res, r); });
router.post('/api/game-folders/:id/games/:gid/delete', requireUser, (req, res) => { const r = F.removeGame(req.user, req.params.id, req.params.gid); r.ok ? res.json({ ok: true }) : fail(req, res, r); });

// ---------------------------------------------------------------- Assign a game to a class
router.get('/teach/assign', requireUser, (req, res) => {
  const t = req.t, u = req.user;
  if (!S.isSchoolStaff(u)) return notFound(req, res);
  const g0 = gameOf(req.query.id, req.query.game);
  if (!g0 || g0.status === 'deleted' || !games.canView(u, g0) || g0.course_only) return notFound(req, res);
  // A hidden official game (ARCADE off, services/game-focus.js) is not assigned anew, except by a teacher whose class has it.
  if (gameHidden(g0) && !mayOpenHidden(u, g0)) return notFound(req, res);
  const g = g0.source === 'seed' ? games.localizeGame(g0) : g0;
  const lg = g0.source === 'seed' ? liveGameOf(g0) : null, liveOnly = !!(lg && !lg.play);
  const classes = F.assignClasses(u), pre = String(req.query.class || '');
  const gc = classes.map(c => gcAssignField(req, c)).find(Boolean) || '';
  const draft = g0.source !== 'seed' && !g0.published_version_id;
  // Algebra Builder: what students open (from the game's Assign button), or a note to choose it in the game first (the
  // class would otherwise land on the teacher's gallery).
  const sa = setAssign(t, g0, req.query.opts);
  // Mistake Hunt (services/proof-steps.js): the teacher's own passage set is either handed in for a grade or played as practice
  // in the game (the game step below); the teacher picks one, nothing is picked for them.
  const proofSet = g0.slug === PS.SLUG && sa && sa.what ? PS.ownSet(u, parseParams(sa.opts).chapter) : null;
  const practiceForm = classes.length ? html`<form class="formgrid assigngrid" data-api="/api/teach/assign-game" novalidate><input type="hidden" name="gameId" value="${g0.id}">${sa && sa.opts ? html`<input type="hidden" name="opts" value="${sa.opts}">` : ''}
      <div class="field"><label for="ag-c">${t('teach.assign.pickClass')}</label><select class="input" id="ag-c" name="classId">${classes.map(c => html`<option value="${c.id}"${c.id === pre ? raw(' selected') : ''}>${c.name}</option>`)}</select></div>
      ${g0.slug === TY.SLUG && g0.source === 'seed' && !(sa && sa.opts) ? html`<div class="field"><label for="ag-o">${t('progress.typing.assignPick')}</label><select class="input" id="ag-o" name="opts"><option value="">${t('progress.typing.assignFree')}</option>${TY.assignChoices(t).map(o => html`<option value="${o.value}">${o.label}</option>`)}</select></div>` : ''}
      ${g0.slug === TY.SLUG && g0.source === 'seed' ? html`<fieldset class="field wide ty-pass"><legend>${t('progress.typing.passH')}</legend>
        <label>${t('progress.typing.goalAcc')} <input class="input" type="number" name="passAcc" min="${TY.PASS.acc[0]}" max="${TY.PASS.acc[1]}" inputmode="numeric" placeholder="90"></label>
        <label>${t('progress.typing.goalWpm')} <input class="input" type="number" name="passWpm" min="${TY.PASS.wpm[0]}" max="${TY.PASS.wpm[1]}" inputmode="numeric" placeholder="20"></label>
        <span class="small muted">${t('progress.typing.passHint')}</span></fieldset>` : ''}
      <div class="field"><label for="ag-d">${t('lessons.assign.due')}</label><input class="input" id="ag-d" name="dueAt" type="date"></div>
      ${gc}
      <div class="field end"><button class="btn btn-primary" type="submit" id="ag-go">${ico('📌', { size: 18 })} ${t('teach.assign.submit')}</button></div>
      <p class="small muted wide">${t('folders.assignNote')}</p>${gc ? html`<p class="small muted wide">${ico('🎓', { size: 18 })} ${t('teach.assign.gcGrades')}</p>` : ''}${classes[0] ? html`<p class="small muted wide">${zoneNote(t, classes[0].school_id, u)}</p>` : ''}<p class="form-err err wide" role="alert"></p></form>` : '';
  const proofClasses = proofSet ? PS.classesFor(u) : [];
  // The teacher chooses how students do it (docs/decisions.md "Mistake Hunt: free AI cap, hints, assign choice"): two
  // radio cards, nothing picked; only the picked option's form shows (CSS :has(), no script). The radios belong to no
  // form, so neither form can be sent before a choice. Without :has() both forms show, each under its own heading.
  const gradeForm = proofClasses.length ? html`<form class="formgrid assigngrid pf-assign" data-api="/api/teach/assign-proofread" novalidate><input type="hidden" name="setId" value="${proofSet.id}">
      <div class="field wide"><label for="pa-c">${t('teach.assign.pickClass')}</label><select class="input" id="pa-c" name="classId">${proofClasses.map(c => html`<option value="${c.id}"${c.id === pre ? raw(' selected') : ''}>${c.name}</option>`)}</select></div>
      <div class="field"><label for="pa-o">${t('proof.assign.opens')}</label><input class="input" id="pa-o" name="opensAt" type="date"></div>
      <div class="field"><label for="pa-d">${t('lessons.assign.due')}</label><input class="input" id="pa-d" name="dueAt" type="date"></div>
      <div class="field wide"><label class="chk"><input type="checkbox" name="showAnswers" value="1" id="pa-show"> <b>${t('figures.step.showAnswers')}</b></label><p class="small muted">${t('proof.assign.showHint')}</p></div>
      <div class="field wide"><label class="chk"><input type="checkbox" name="allowHints" value="1" id="pa-hints"> <b>${t('proof.assign.allowHints')}</b></label><p class="small muted">${t('proof.assign.hintsHint')}</p></div>
      <p class="small muted wide">${t('proof.assign.snapshotNote')}</p>${classes[0] ? html`<p class="small muted wide">${zoneNote(t, classes[0].school_id, u)}</p>` : ''}
      <div class="field end wide"><button class="btn btn-primary" type="submit" id="pa-go">${ico('📌', { size: 18 })} ${t('proof.assign.submit')}</button></div>
      <p class="form-err err wide" role="alert"></p></form>` : html`<p class="muted">${t('teach.assign.none')}</p>`;
  const choice = (id, value, title, sub) => html`<label class="pf-opt" for="${id}"><input type="radio" name="pf-mode" value="${value}" id="${id}" aria-describedby="${id}-sub"><span class="pf-opt-t"><b>${title}</b><span class="small muted" id="${id}-sub">${sub}</span></span></label>`;
  const proofForm = proofSet ? html`<div class="pf-setcard"><span class="pf-setic" aria-hidden="true">${ico('📄', { size: 24 })}</span><div><b dir="auto">${proofSet.title || proofSet.items[0].t || t('proof.assign.untitled')}</b>
      <p class="small muted">${t('proof.step.passagesN', { count: proofSet.items.length })} · ${t('proof.step.mistakesN', { count: proofSet.items.reduce((n, it) => n + it.m.length, 0) })}</p></div></div>
    <fieldset class="pf-choice" id="pf-choice"><legend class="pf-assign-h">${t('proof.assign.chooseH')}</legend>
      <div class="pf-opts">${choice('pf-mode-grade', 'grade', t('proof.assign.title'), t('proof.assign.gradeSub'))}${choice('pf-mode-practice', 'practice', t('proof.assign.practiceH'), t('proof.assign.practiceSub'))}</div></fieldset>
    <div class="pf-pane" id="pf-pane-grade"><h3>${t('proof.assign.title')}</h3>${gradeForm}</div>
    <div class="pf-pane" id="pf-pane-practice"><h3>${t('proof.assign.practiceH')}</h3><p class="small muted">${t('proof.assign.practiceHint')}</p>${practiceForm || html`<p class="muted">${t('teach.assign.none')}</p>`}</div>` : '';
  const body = html`<div class="pagehead"><h1>${ico('📌', { size: 36 })} ${t('teach.assign.title', { game: g.title })}</h1></div>
  <section class="panel assign-game" aria-labelledby="ag-h">
    <h2 id="ag-h" class="sr-only">${t('teach.assign.pickClass')}</h2>
    ${proofSet ? proofForm : sa && sa.what ? html`<p class="lead">${t('teach.assign.opens', { what: sa.label })}</p>` : ''}
    ${proofSet ? '' : sa && !sa.what ? html`<p class="notice">${t('teach.assign.pickFirst')}</p><p><a class="btn btn-primary" href="/play/${g0.slug}">▶ ${t('teach.assign.openGame')}</a></p>`
      : liveOnly ? html`<p class="notice">${t('teach.assign.liveOnly')}</p>${liveOn() && liveCanHost(u) ? html`<p><a class="btn btn-primary" href="/live?mode=${lg.mode}">${ico('📡', { size: 18 })} ${t('live.entry.hostLive')}</a></p>` : ''}`
      : draft ? html`<p class="notice">${t('folders.errors.publishFirst')}</p><p><a class="btn btn-primary" href="/studio/${g0.id}">${ico('✏️', { size: 18 })} ${t('game.edit')}</a></p>`
      : classes.length ? practiceForm
      : html`<p class="muted">${t('teach.assign.none')}</p><p><a class="btn" href="/teach">${t('nav.classroom')}</a></p>`}
    <p class="row"><a class="btn" href="${playHref(u, g0)}">▶ ${t('learn.tab.try')}</a><a class="btn btn-ghost" href="/build/save?id=${g0.id}">${ico('📁', { size: 18 })} ${t('folders.save')}</a></p>
  </section>`;
  page(req, res, { title: t('teach.assign.title', { game: g.title }), active: 'teach', back: pre ? `/class/${pre}` : '/build', backLabel: pre ? t('nav.classroom') : t('nav.build'), body, head: CSS });
});
router.post('/api/teach/assign-game', requireUser, rateLimit('lesson-new', 120, 3600e3), async (req, res) => {
  const u = req.user, { game, gameId, classId, dueAt } = b(req);
  if (!S.isSchoolStaff(u)) return res.status(404).json({ error: req.t('lessons.errors.notFound') });
  const g = gameOf(gameId, game);
  if (gameHidden(g) && !mayOpenHidden(u, g)) return res.status(404).json({ error: req.t('lessons.errors.notFound') });
  if (g && g.source === 'seed') { const lg = liveGameOf(g); if (lg && !lg.play) return res.status(400).json({ error: req.t('teach.assign.liveOnly') }); }
  const sa = setAssign(req.t, g, b(req).opts);
  if (sa && !sa.what) return res.status(400).json({ error: req.t('teach.assign.pickFirst') });
  // Typing Pets: one lesson or test (services/typing.js assignChoices), or the whole game when none is picked.
  const typing = !!g && g.slug === TY.SLUG && g.source === 'seed';
  const tc = typing && !sa ? TY.assignChoice(req.t, b(req).opts) : null;
  let extra = sa ? { options: sa.opts, title: sa.title } : tc ? { options: tc.value, title: `${g.title}: ${tc.label}` } : {};
  // A pass mark (mode=a90-w20): the game reports the step done only for a run that reaches it.
  const pass = typing ? TY.passMode(b(req).passAcc, b(req).passWpm) : null;
  if (pass) extra = { options: `${extra.options ? `${extra.options}&` : ''}mode=${pass.mode}`, title: `${extra.title || g.title} (${TY.passLabel(req.t, pass)})`.slice(0, 100) };
  const r = F.assignGame(u, classId, g && g.id, { dueAt, ...extra });
  if (!r.ok) return fail(req, res, r);
  const also = await gcAfterAssign(req, r.classLesson);
  const toast = req.t('lessons.assign.done', { class: r.class.name });
  // From a folder on the class page's sidebar: back to that folder, to assign the next one.
  // From the phone's "All my games" (view=all): back there.
  const fid = String(b(req).folder || ''), back = /^[\w-]{1,40}$/.test(fid) ? `?folder=${encodeURIComponent(fid)}` : b(req).view === 'all' ? '?view=all' : '';
  res.json({ ok: true, toast: also ? `${toast} · ${also}` : toast, redirect: `/class/${r.class.id}${back}` });
});
/** Mistake Hunt "Hand in for a grade" (services/proof-steps.js assignSet): { setId, classId, opensAt, dueAt, showAnswers,
 *  allowHints }.
 *  A lesson with one proofread step (a snapshot of the set), assigned with its dates. */
router.post('/api/teach/assign-proofread', requireUser, rateLimit('lesson-new', 120, 3600e3), (req, res) => {
  const u = req.user, x = b(req);
  if (!PS.canAssign(u)) return res.status(404).json({ error: req.t('lessons.errors.notFound') });
  const on = v => v === true || v === '1' || v === 'on';
  const r = PS.assignSet(u, String(x.setId || ''), String(x.classId || ''), { opensAt: x.opensAt || null, dueAt: x.dueAt || null, showAnswers: on(x.showAnswers), hints: on(x.allowHints) });
  if (!r.ok) return res.status(r.code === 'notFound' ? 404 : 400).json({ error: req.t(r.code === 'notFound' ? 'lessons.errors.notFound' : ['noClass', 'badDate', 'dueBeforeOpen', 'needsDue'].includes(r.code) ? `figures.assign.errors.${r.code}` : 'errors.api.badRequest'), code: r.code });
  res.json({ ok: true, toast: req.t('lessons.assign.done', { class: r.class.name }), redirect: `/class/${r.class.id}/progress/${r.classLesson.id}` });
});
/** "Assign all" (a folder on the class page): each game in the folder (one's own, or shared with one) that the class can
 *  play and doesn't have yet, with one due day, and posted to Google Classroom when asked. Games that need setting up
 *  first (a draft, a live-only game, a problem set) and games the class already has are skipped and counted. */
router.post('/api/teach/assign-folder', requireUser, rateLimit('lesson-new', 120, 3600e3), async (req, res) => {
  const u = req.user, { folderId, classId, dueAt } = b(req);
  if (!S.isSchoolStaff(u)) return res.status(404).json({ error: req.t('lessons.errors.notFound') });
  const f = F.getFolder(folderId), c = S.getClass(String(classId || ''));
  if (!f || !F.canSee(u, f) || !c || c.archived_at || !S.canManageClass(u, c)) return res.status(404).json({ error: req.t('lessons.errors.notFound') });
  let done = 0, skipped = 0; const also = [];
  for (const g of F.gamesIn(u, f.id)) {
    const lg = g.source === 'seed' ? liveGameOf(g) : null;
    if ((setGameOf(g) && !gameSets.OPEN_SET_GAMES.has(g.slug)) || (lg && !lg.play)) { skipped++; continue; }
    const r = F.assignGame(u, c.id, g.id, { dueAt });
    if (!r.ok) { skipped++; continue; }
    done++;
    const line = await gcAfterAssign(req, r.classLesson); if (line && !also.includes(line)) also.push(line);
  }
  if (!done) return res.status(400).json({ error: req.t('folders.assignAllNone', { class: c.name }) });
  const toast = [req.t('folders.assignAllDone', { count: done, class: c.name }), skipped ? req.t('folders.assignAllSkipped', { count: skipped }) : '', ...also].filter(Boolean).join(' · ');
  res.json({ ok: true, toast, redirect: `/class/${c.id}?view=assigned` });
});
