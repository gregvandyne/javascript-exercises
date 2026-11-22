// The game shelf (docs/decisions.md "Folders in a sidebar, on Build and the class page"): one left column (New game,
// All my games or Assigned to <class>, My folders, Shared by colleagues, Games students shared) and, on the right, what
// is picked, so a teacher never leaves the page to open a folder. Build (routes/studio.js) and the class page's Games tab
// (routes/schools.js) both render it from here, so the two stay the same.
//
// What is picked is in the address (?folder=<id>, or ?view=all | assigned | students), so a reload, Back and a shared
// link keep it. Every item is a plain link; public/js/shelf.js fetches the same address with the X-Shelf header and
// swaps in only the right side (shelfReply), then pushes the address. Nothing here widens who may see what: folders are
// the owner's own (F.foldersOf) or shared with their school (F.sharedWith, F.gamesIn: only games they can open), Assign
// is for school staff, sharing needs a school one is staff of, and students never see a teacher's folders or Assign
// (the class page's shelf is behind its manager check; a student's Build shelf holds only their own folders).
import * as LIB from '../services/library.js';
import { html, raw } from '../views/html.js';
import { ico } from '../views/icon.js';
import { coverArt, emptyState } from '../views/components.js';
import { accountKind } from '../auth.js';
import * as S from '../services/schools.js';
import * as F from '../services/game-folders.js';
import * as games from '../services/games.js';
import * as gameSets from '../services/game-sets.js';
import { liveGameOf } from '../live/live-games.js';
import { gcAssignField } from './gclassroom.js';
import { SUBJECTS, SHELF_INFO, shelfGrades } from '../learn.js';
import { liveOn } from '../services/classlive-sessions.js';

/** A grown-up's or teacher's account (school staff, or signed up as a teacher): "All my games" offers Find Oomba games.
 *  Kids and students keep their own folders on Build as before, without it. */
export const shelfOn = u => !!u && !u.is_guest && (['grownup', 'staff'].includes(accountKind(u)) || u.signup_as === 'teacher');

const ICON = {
  all: '<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>',
  folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  assigned: '<path d="M9 11l3 3 8-8"/><path d="M20 12v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h9"/>',
  find: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
  book: '<path d="M4 5a2 2 0 0 1 2-2h5v17H6a2 2 0 0 0-2 2z"/><path d="M20 5a2 2 0 0 0-2-2h-5v17h5a2 2 0 0 1 2 2z"/>',
  students: '<circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2.5"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6M14 20c0-2.5 1.5-4.5 3.5-5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
};
const icon = (k, size = 20) => raw(`<svg class="shelf-ico" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${k === 'plus' ? 2.5 : 2}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${ICON[k]}</svg>`);
const DOTS = raw('<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>');
const PLAY = raw('<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false"><path d="M7 4l13 8-13 8z"/></svg>');

/** Where a game's Play goes: its page (Oomba's and published ones), else the Studio (a draft of one's own). */
export const playHref = g => (g.published_version_id || g.source === 'seed' ? `/g/${g.slug}` : `/studio/${g.id}`);
/** "{name}: {n} of {total}" with its placeholders kept, for public/js/reorder.js to fill in. */
const movedTpl = t => t('folders.moved', { name: '{name}', n: '{n}', total: '{total}' });
/** A game that opens at a teacher's problem or question set (Algebra Builder): assigned from its own page, after picking. */
const setGame = g => !!g && g.source === 'seed' && gameSets.SET_GAMES.has(g.slug);
const liveOnly = g => { if (!g || g.source !== 'seed') return false; const lg = liveGameOf(g); return !!(lg && !lg.play); };

/**
 * ctx: { kind: 'build' | 'class', base: the page's address, c (the class), folders: show folders (bool), staff: may
 * assign (bool), assigned / students: { count, pane() } (the class page), status(g): a Build card's status chips,
 * gc: the Google Classroom button, top: markup over the right side (Build's "Make your own game by chatting") }.
 * -> the picked item: { key, view } | { key, folder, own }
 */
function picked(req, ctx, mine, shared) {
  const fid = String(req.query.folder || ''), view = String(req.query.view || '');
  if (fid && ctx.folders) {
    const f = mine.find(x => x.id === fid) || shared.find(x => x.id === fid);
    if (f) return { key: `f-${f.id}`, folder: f, own: f.owner_id === req.user.id };
  }
  const views = [...(ctx.kind === 'build' ? ['all'] : ['assigned', 'students']), ...(oombaOn(ctx) ? ['oomba'] : [])];
  if (views.includes(view)) return { key: view, view };
  if (ctx.kind === 'build') return { key: 'all', view: 'all' };
  // The class page: its assigned games when it has some, else the first folder, else the (empty) assigned games.
  if (!ctx.assigned.count && ctx.folders && mine.length) return { key: `f-${mine[0].id}`, folder: mine[0], own: true };
  return { key: 'assigned', view: 'assigned' };
}
const hrefOf = (ctx, sel, req = null) => (sel.folder ? `${ctx.base}?folder=${encodeURIComponent(sel.folder.id)}` : ctx.kind === 'build' && sel.view === 'all' ? ctx.base
  : sel.view === 'oomba' && req ? oombaHref(ctx, oombaFilters(req)) : `${ctx.base}?view=${sel.view}`);

// ---------------------------------------------------------------- Oomba's games, in the right side
// docs/decisions.md "Find Oomba games in the shelf": "Find Oomba games" opens Oomba's Learn games on the right instead of
// going to /learn, with one simple strip of filters (search, grade, subject) in place of Learn's four rows. Staff on the
// class page and teachers on Build (who can assign); the filters are in the address like everything else here.
const GRADES = ['K', '1', '2', '3', '4', '5', '6', '7', '8'];
const oombaOn = ctx => (ctx.kind === 'class' ? !!ctx.staff : !!ctx.adult);
function oombaFilters(req) {
  const subject = SUBJECTS.some(x => x.key === req.query.subject) ? String(req.query.subject) : '';
  const grade = GRADES.includes(String(req.query.grade || '')) ? String(req.query.grade) : '';
  return { subject, grade, q: String(req.query.q || '').trim().slice(0, 60) };
}
function oombaHref(ctx, f, over = {}) {
  const p = { view: 'oomba', ...f, ...over }, qs = new URLSearchParams(Object.entries(p).filter(([, v]) => v)).toString();
  return `${ctx.base}?${qs}`;
}
const gradeNum = g => (g === 'K' ? 0 : +g);
const oombaFits = (info, f) => !!info && (!f.subject || info.subject === f.subject) && (!f.grade || (info.from <= gradeNum(f.grade) && gradeNum(f.grade) <= info.to));

/** One item in the left column: a link, its icon, name and count (the count read as "n games"). */
function item(req, ctx, sel, it, { grip = false, drop = '' } = {}) {
  const on = it.key === sel.key;
  return html`<a class="shelf-item${on ? ' is-on' : ''}" href="${it.href}" data-shelf-key="${it.key}"${on ? raw(' aria-current="true"') : ''}${grip ? raw(' data-grip') : ''}${drop ? html` data-drop-folder="${drop}"` : ''}>${icon(it.icon)}<span class="shelf-name" dir="auto">${it.name}</span>${it.count === undefined ? '' : html`<span class="n" aria-hidden="true">${it.count}</span><span class="sr-only">, ${req.t('folders.gamesN', { count: it.count })}</span>`}</a>`;
}

/** The New folder box in the left column (a fold: its name and Create). On the class page it comes back to the class. */
function newFolder(req, ctx) {
  const t = req.t;
  return html`<details class="shelf-newf"><summary class="shelf-item shelf-add">${icon('plus')}<span class="shelf-name">${t('folders.new')}</span></summary>
    <form class="shelf-newf-panel" data-api="/api/game-folders" novalidate>${ctx.c ? html`<input type="hidden" name="classId" value="${ctx.c.id}">` : ''}
      <label for="shelf-nf-name">${t('folders.name')}</label>
      <div class="row"><input class="input grow" id="shelf-nf-name" name="name" maxlength="60" placeholder="${t('folders.namePlaceholder')}" required>
      <button class="btn btn-primary" type="submit">${t('folders.create')}</button></div><p class="form-err err" role="alert"></p></form></details>`;
}

/** The left column. */
function side(req, ctx, sel, mine, shared) {
  const t = req.t, c = ctx.c;
  const fItem = f => ({ key: `f-${f.id}`, href: `${ctx.base}?folder=${encodeURIComponent(f.id)}`, icon: 'folder', name: f.name, count: f.games });
  const top = ctx.kind === 'build'
    ? html`<a class="btn btn-primary shelf-go" href="/build/new" id="newgame">${icon('plus', 18)} ${t('build.newGame')}</a>`
    : ctx.staff ? html`<a class="btn btn-primary shelf-go" href="/build/new?for=class&amp;class=${ctx.c.id}" id="cl-newgame">${icon('plus', 18)} ${t('folders.buildNew')}</a>` : '';
  const first = ctx.kind === 'build'
    ? [{ key: 'all', href: ctx.base, icon: 'all', name: t('folders.allGames'), count: ctx.allCount }]
    : [{ key: 'assigned', href: `${ctx.base}?view=assigned`, icon: 'assigned', name: t('folders.assignedTo', { class: c.name }), count: ctx.assigned.count }];
  return html`<div class="shelf-side">
    ${top}
    <nav class="shelf-nav" aria-label="${ctx.kind === 'build' ? t('folders.myGamesFolders') : t('folders.sideClass')}">
      <ul class="shelf-group${ctx.kind === 'class' ? ' shelf-cltop' : ''}">${first.map(it => html`<li>${item(req, ctx, sel, it)}</li>`)}
        ${oombaOn(ctx) ? html`<li>${item(req, ctx, sel, { key: 'oomba', href: `${ctx.base}?view=oomba`, icon: 'find', name: t('folders.findOomba') })}</li>` : ''}
        ${ctx.kind === 'class' && ctx.staff ? html`<li>${item(req, ctx, sel, { key: 'library', href: `/library?class=${ctx.c.id}`, icon: 'book', name: t('library.findStories') })}</li>` : ''}</ul>
      ${ctx.folders ? html`<p class="shelf-lab" id="shelf-lab-mine">${t('folders.title')}</p>
      ${mine.length ? html`<ul class="shelf-group" aria-labelledby="shelf-lab-mine"${mine.length > 1 ? html` data-reorder="/api/game-folders/order" data-moved="${movedTpl(t)}" aria-describedby="shelf-order"` : ''}>${mine.map(f => html`<li data-id="${f.id}">${item(req, ctx, sel, fItem(f), { grip: mine.length > 1, drop: f.id })}</li>`)}</ul>
      <p class="small muted shelf-drophint">${t('folders.dropHint')}</p>
      <template id="drop-ask" data-title="${t('folders.dropAsk.title', { game: '{game}', folder: '{folder}' })}" data-move="${t('folders.dropAsk.move')}" data-move-note="${t('folders.dropAsk.moveNote', { from: '{from}' })}" data-keep="${t('folders.dropAsk.keep')}" data-cancel="${t('folders.dropAsk.cancel')}" data-moved="${t('folders.dropAsk.moved', { game: '{game}', folder: '{folder}' })}"></template>` : ''}
      ${mine.length > 1 ? html`<p class="sr-only" id="shelf-order">${t('folders.reorderHint')}</p>` : ''}
      ${newFolder(req, ctx)}
      ${shared.length ? html`<p class="shelf-lab" id="shelf-lab-shared">${t('folders.sharedTitle')}</p>
      <ul class="shelf-group" aria-labelledby="shelf-lab-shared">${shared.map(f => html`<li>${item(req, ctx, sel, fItem(f))}</li>`)}</ul>` : ''}` : ''}
      ${ctx.kind === 'class' ? html`<p class="shelf-lab" id="shelf-lab-class">${t('folders.fromClass')}</p>
      <ul class="shelf-group" aria-labelledby="shelf-lab-class"><li>${item(req, ctx, sel, { key: 'students', href: `${ctx.base}?view=students`, icon: 'students', name: t('folders.studentShared'), count: ctx.students.count })}</li></ul>` : ''}
    </nav>
    ${ctx.gc ? html`<div class="shelf-foot">${ctx.gc}</div>` : ''}
  </div>`;
}

/** The ⋯ menu (a fold of buttons, links and small forms). */
const menu = (label, items) => html`<details class="shelf-menu"><summary class="btn btn-ghost shelf-more" aria-label="${label}" title="${label}">${DOTS}</summary><div class="shelf-menu-panel">${items}</div></details>`;

/** "Assign to <class>" on the class page: the due day and "Also post to Google Classroom", in a fold under the button.
 *  A game that needs setting up first (a draft, a live-only game, a problem set) opens the Assign page, which says why. */
function assignHere(req, ctx, g, folderId) {
  const t = req.t, c = ctx.c, u = req.user;
  const label = t('folders.assignTo', { class: c.name });
  if (setGame(g) || liveOnly(g) || !F.assignable(u, g, c).ok) return html`<a class="btn btn-primary" href="/teach/assign?id=${g.id}&amp;class=${c.id}">${ico('📌', { size: 18 })} ${label}</a>`;
  if (F.assignmentOf(c.id, g.id)) return html`<span class="stchip good shelf-done">${ico('✅', { size: 18 })} ${t('folders.assignedChip')}</span>`;
  return html`<details class="shelf-pop"><summary class="btn btn-primary">${ico('📌', { size: 18 })} ${label}</summary>
    <form class="shelf-pop-panel" data-api="/api/teach/assign-game" novalidate><input type="hidden" name="gameId" value="${g.id}"><input type="hidden" name="classId" value="${c.id}">${folderId ? html`<input type="hidden" name="folder" value="${folderId}">` : ''}
      <div class="field"><label for="sa-d-${g.id}">${t('lessons.assign.due')}</label><input class="input" id="sa-d-${g.id}" name="dueAt" type="date"></div>
      ${gcAssignField(req, c)}
      <button class="btn btn-primary" type="submit">${ico('📌', { size: 18 })} ${t('teach.assign.submit')}</button><p class="form-err err" role="alert"></p></form></details>`;
}

/** One game: cover, title, what it is, Edit (one's own, on Build), Play, Assign, and ⋯ (Remove from folder, Save to
 *  another folder, and on Build Rename and Delete for one's own). */
function gameRow(req, ctx, g0, { folder = null, own = false, grip = false } = {}) {
  const t = req.t, u = req.user, g = g0.source === 'seed' ? games.localizeGame(g0) : g0;
  const mineGame = g.owner_id === u.id && g.source !== 'seed', play = playHref(g);
  const kind = g.source === 'seed' ? `🦉 ${t('folders.oombaGame')}` : mineGame ? `🛠️ ${t('folders.myGame')}` : '';
  const assign = !ctx.staff ? ''
    : ctx.kind === 'class' ? assignHere(req, ctx, g0, folder && folder.id)
      : folder || g.source === 'seed' || g.published_version_id ? html`<a class="btn btn-primary" href="/teach/assign?id=${g.id}">${ico('📌', { size: 18 })} ${t('folders.assign')}</a>` : '';
  const more = [
    folder && own ? html`<form data-api="/api/game-folders/${folder.id}/games/${g.id}/delete" data-reload><button class="btn" type="submit">${t('folders.removeGame')}</button></form>` : '',
    html`<a class="btn" href="/build/save?id=${g.id}">${ico('📁', { size: 18 })} ${folder && own ? t('folders.saveAnother') : t('folders.save')}</a>`,
    ctx.kind === 'build' && mineGame ? html`<button class="btn" type="button" data-rename>${ico('🏷️', { size: 18 })} ${t('build.rename')}</button><button class="btn mg-del" type="button" data-delete>${ico('🗑️', { size: 18 })} ${t('build.delete')}</button>` : '',
  ];
  const live = mineGame && g.status === 'published' && g.published_version_id;
  return html`<li class="mygame shelf-game" data-id="${g.id}" data-title="${g.title}" data-published="${live ? '1' : ''}"${folder && own ? html` data-folder="${folder.id}" data-folder-name="${folder.name}"` : ''}>
    ${grip ? html`<button class="gfo-grip" type="button" data-grip aria-label="${t('folders.move', { name: g.title })}" aria-describedby="shelf-gorder"><span aria-hidden="true">⠿</span></button>` : ''}
    <a class="mg-cover" href="${mineGame && ctx.kind === 'build' ? `/studio/${g.id}` : play}" tabindex="-1" aria-hidden="true">${coverArt(g, '', { draft: mineGame })}</a>
    <div class="mg-body"><h3><a href="${mineGame && ctx.kind === 'build' ? `/studio/${g.id}` : play}" dir="auto">${g.title}</a></h3>
      ${kind ? html`<p class="small muted shelf-kind">${kind}</p>` : ''}
      ${mineGame && ctx.status ? ctx.status(g0) : ''}</div>
    <div class="mg-actions"><div class="mg-row">
      ${mineGame && ctx.kind === 'build' ? html`<a class="btn" href="/studio/${g.id}">${ico('✏️', { size: 18 })} ${t('game.edit')}</a>` : ''}
      ${!mineGame || ctx.kind !== 'build' || g.published_version_id ? html`<a class="btn" href="${play}">${PLAY} ${t('game.play')}</a>` : ''}
      ${assign}
      ${menu(t('folders.more', { name: g.title }), more)}
    </div></div></li>`;
}

/** The right side's head: the name, a line under it, and its buttons. */
const head = (title, meta, tools) => html`<div class="shelf-head"><div class="shelf-title"><h2 id="shelf-h" tabindex="-1" dir="auto">${title}</h2>${meta ? html`<p class="small muted">${meta}</p>` : ''}</div>${tools ? html`<div class="shelf-tools">${tools}</div>` : ''}</div>`;
const findBtn = (t, ctx = null) => html`<a class="btn" href="${ctx && oombaOn(ctx) ? `${ctx.base}?view=oomba` : '/learn'}"${ctx && oombaOn(ctx) ? raw(' data-shelf-go') : ''}>${ico('🦉', { size: 18 })} ${t('folders.findOomba')}</a>`;

/** One Oomba game on the right side: cover, title, "Subject · Grades" (and Live), Try it, the main action (Host live for
 *  a live game, else Assign) and ⋯ (Save to folder; Assign for a live game that can also be assigned). */
function oombaRow(req, ctx, g0, idp) {
  const t = req.t, g = games.localizeGame(g0), info = SHELF_INFO[g0.slug], lg = liveGameOf(g0), live = !!(lg && liveOn());
  const gr = shelfGrades(g0.slug);
  // One grade reads "Grade 2", not "Grades 2–2".
  const grades = gr && gr.from === gr.to ? (gr.from === 'K' ? t('learn.tab.gradeK') : t('learn.tab.gradeN', { n: gr.from })) : gr ? t('learn.grades', gr) : '';
  const meta = info ? t('learn.tab.meta', { subject: t(`learn.tab.subjects.${info.subject}`), grades }) : '';
  const assign = ctx.kind === 'class' ? assignHere(req, ctx, g0, null)
    : html`<a class="btn btn-primary" href="/teach/assign?game=${g0.slug}">${ico('📌', { size: 18 })} ${t('learn.tab.assign')}</a>`;
  const main = live ? html`<a class="btn btn-hot" href="/live?mode=${lg.mode}">${ico('📡', { size: 18 })} ${t('learn.tab.host')}</a>` : lg && !lg.play ? '' : assign;
  const more = [
    live && !liveOnly(g0) ? (ctx.kind === 'class' ? html`<a class="btn" href="/teach/assign?id=${g0.id}&amp;class=${ctx.c.id}">${ico('📌', { size: 18 })} ${t('folders.assignTo', { class: ctx.c.name })}</a>` : html`<a class="btn" href="/teach/assign?game=${g0.slug}">${ico('📌', { size: 18 })} ${t('learn.tab.assign')}</a>`) : '',
    html`<a class="btn" href="/build/save?id=${g0.id}">${ico('📁', { size: 18 })} ${t('folders.save')}</a>`,
  ];
  const tryHref = `/play/${lg && lg.solo ? lg.solo : g0.slug}`;
  return html`<li class="mygame shelf-game oomba-game" data-id="${g0.id}" data-q="${`${g.title} ${meta}`.toLowerCase()}">
    <a class="mg-cover" href="/g/${g0.slug}" tabindex="-1" aria-hidden="true">${coverArt(g, '')}</a>
    <div class="mg-body"><h3><a href="/g/${g0.slug}" dir="auto">${g.title}</a></h3>
      <p class="small muted shelf-kind">${meta}${live ? html` · <span class="oomba-live">${ico('📡', { size: 18 })} ${t('folders.oomba.live')}</span>` : ''}</p></div>
    <div class="mg-actions"><div class="mg-row">
      <a class="btn" href="${tryHref}">${PLAY} ${t('learn.tab.try')}</a>
      ${main}
      ${menu(t('folders.more', { name: g.title }), more)}
    </div></div></li>`;
}

/** The right side for Find Oomba games: a search box, a grade and the subjects in one strip, then the games. idp keeps
 *  the phone's copy's ids apart from the wider screens'. */
function oombaPane(req, ctx, { idp = 'oo', heading = 'shelf-h' } = {}) {
  const t = req.t, f = oombaFilters(req);
  const all = games.listVisible(req.user, { shelf: 'learn', official: true, order: 'plays', limit: 60 }).filter(g => SHELF_INFO[g.slug]);
  const q = f.q.toLowerCase();
  const list = all.filter(g => oombaFits(SHELF_INFO[g.slug], f) && (!q || games.localizeGame(g).title.toLowerCase().includes(q)));
  const chip = (on, href, label, emoji = '') => html`<a class="chip${on ? ' on' : ''}" href="${href}" data-shelf-go${on ? raw(' aria-current="true"') : ''}>${emoji ? html`<span aria-hidden="true">${emoji}</span> ` : ''}${label}</a>`;
  const gradeLabel = g => (g === 'K' ? t('learn.tab.gradeK') : t('learn.tab.gradeN', { n: g }));
  return html`<div class="shelf-head"><div class="shelf-title"><h2 id="${heading}" tabindex="-1">${ico('🦉', { size: 28 })} ${t('folders.oomba.title')}</h2><p class="small muted" data-oomba-count data-one="${t('folders.gamesN', { count: 1 })}" data-many="${t('folders.gamesN', { count: 2 }).replace('2', '{n}')}">${t('folders.gamesN', { count: list.length })}</p></div></div>
    <form class="oomba-bar" method="get" action="${ctx.base}" role="search" data-oomba-form>
      <input type="hidden" name="view" value="oomba">${f.subject ? html`<input type="hidden" name="subject" value="${f.subject}">` : ''}
      <label class="sr-only" for="${idp}-q">${t('folders.oomba.search')}</label>
      <input class="input oomba-q" id="${idp}-q" type="search" name="q" value="${f.q}" placeholder="${t('folders.oomba.search')}" autocomplete="off" data-oomba-q>
      <label class="sr-only" for="${idp}-g">${t('learn.tab.grade')}</label>
      <select class="input oomba-grade" id="${idp}-g" name="grade" data-oomba-grade>${[['', t('learn.tab.gradeAny')], ...GRADES.map(g => [g, gradeLabel(g)])].map(([v, l]) => html`<option value="${v}"${f.grade === v ? raw(' selected') : ''}>${l}</option>`)}</select>
      <noscript><button class="btn" type="submit">${t('learn.tab.filter')}</button></noscript>
    </form>
    <div class="chips scroll oomba-subjects" role="group" aria-label="${t('learn.tab.subject')}">
      ${chip(!f.subject, oombaHref(ctx, f, { subject: '' }), t('learn.tab.subjects.all'))}
      ${SUBJECTS.map(x => chip(f.subject === x.key, oombaHref(ctx, f, { subject: x.key }), t(`learn.tab.subjects.${x.key}`), x.emoji))}
    </div>
    ${list.length ? html`<ul class="mygames shelf-games oomba-list">${list.map(g => oombaRow(req, ctx, g, idp))}</ul>` : ''}
    <div class="shelf-empty oomba-none"${list.length ? raw(' hidden') : ''}>${emptyState({ emoji: '🦉', title: t('folders.oomba.none'), text: '' })}</div>`;
}

/** "Assign all N" (the class page, in a folder): each game the class can play and doesn't have yet, one due day. */
function assignAll(req, ctx, f, list, idp = 'sa-all-d') {
  const t = req.t, c = ctx.c;
  if (!ctx.staff || !list.length) return '';
  return html`<details class="shelf-pop"><summary class="btn">${ico('📌', { size: 18 })} ${t('folders.assignAll', { count: list.length })}</summary>
    <form class="shelf-pop-panel" data-api="/api/teach/assign-folder" novalidate><input type="hidden" name="folderId" value="${f.id}"><input type="hidden" name="classId" value="${c.id}">
      <p class="small muted">${t('folders.assignAllNote', { class: c.name })}</p>
      <div class="field"><label for="${idp}">${t('lessons.assign.due')}</label><input class="input" id="${idp}" name="dueAt" type="date"></div>
      ${gcAssignField(req, c)}
      <button class="btn btn-primary" type="submit">${ico('📌', { size: 18 })} ${t('folders.assignAll', { count: list.length })}</button><p class="form-err err" role="alert"></p></form></details>`;
}

/** The owner's folder menu: Rename, Share or Stop sharing, Move up / down, Delete. */
function folderMenu(req, ctx, f, mine, idp = 'shelf') {
  const t = req.t, schools = F.staffSchools(req.user), i = mine.findIndex(x => x.id === f.id);
  const back = ctx.c ? html`<input type="hidden" name="classId" value="${ctx.c.id}">` : '';
  const share = !schools.length ? ''
    : f.school_id ? html`<form data-api="/api/game-folders/${f.id}/share" data-reload><input type="hidden" name="schoolId" value=""><button class="btn" type="submit">${t('folders.unshare')}</button></form>`
      : html`<form class="shelf-share" data-api="/api/game-folders/${f.id}/share" data-reload>${schools.length > 1 ? html`<label class="sr-only" for="${idp}-share-s">${t('folders.shareTitle')}</label><select class="input" id="${idp}-share-s" name="schoolId">${schools.map(x => html`<option value="${x.id}">${x.name}</option>`)}</select>` : html`<input type="hidden" name="schoolId" value="${schools[0].id}">`}
        <button class="btn" type="submit">${ico('🤝', { size: 18 })} ${schools.length > 1 ? t('folders.shareTitle') : t('folders.shareWith', { school: schools[0].name })}</button></form>`;
  return menu(t('folders.more', { name: f.name }), [
    html`<form class="shelf-rename" data-api="/api/game-folders/${f.id}" data-reload><label for="${idp}-rn">${ico('🏷️', { size: 18 })} ${t('build.rename')}</label><div class="row"><input class="input grow" id="${idp}-rn" name="name" value="${f.name}" maxlength="60"><button class="btn btn-primary" type="submit">${t('school.save')}</button></div></form>`,
    share, schools.length ? html`<p class="small muted">${t('folders.shareNote')}</p>` : '',
    i > 0 ? html`<form data-api="/api/game-folders/${f.id}/up" data-reload><button class="btn" type="submit">↑ ${t('folders.moveUp')}</button></form>` : '',
    i >= 0 && i < mine.length - 1 ? html`<form data-api="/api/game-folders/${f.id}/down" data-reload><button class="btn" type="submit">↓ ${t('folders.moveDown')}</button></form>` : '',
    html`<form data-api="/api/game-folders/${f.id}/delete" data-confirm="${t('folders.deleteConfirm', { name: f.name })}">${back}<button class="btn btn-danger" type="submit">${ico('🗑️', { size: 18 })} ${t('folders.delete')}</button></form>`,
  ]);
}

/** The right side for a folder: its games (one's own can be dragged into order), or why it is empty. */
function folderPane(req, ctx, sel, mine) {
  const t = req.t, f = sel.folder, own = sel.own, list = F.gamesIn(req.user, f.id);
  const school = f.school_id ? (S.getSchool(f.school_id) || {}).name || '' : '';
  const meta = [t('folders.gamesN', { count: list.length }), own ? '' : t('folders.by', { name: f.owner_name || '' }), school ? t('folders.sharedWithSchool', { school }) : ''].filter(Boolean).join(' · ');
  const tools = [
    ctx.kind === 'class' ? assignAll(req, ctx, f, list) : findBtn(t, ctx),
    own ? folderMenu(req, ctx, f, mine) : html`<form data-api="/api/game-folders/${f.id}/copy">${ctx.c ? html`<input type="hidden" name="classId" value="${ctx.c.id}">` : ''}<button class="btn btn-primary" type="submit">${ico('📁', { size: 18 })} ${t('folders.copy')}</button></form>`,
  ];
  const drag = own && list.length > 1;
  return html`${head(f.name, meta, tools)}
    ${list.length ? html`<ul class="mygames shelf-games"${drag ? html` data-reorder="/api/game-folders/${f.id}/order" data-moved="${movedTpl(t)}"` : ''}>${list.map(g => gameRow(req, ctx, g, { folder: f, own, grip: drag }))}</ul>
      ${drag || ctx.kind === 'class' ? html`<div class="small muted shelf-note">${drag ? html`<p id="shelf-gorder">↕️ ${t('folders.reorderHint')}</p>` : ''}${ctx.kind === 'class' ? html`<p>${t('folders.assignedWhere', { class: ctx.c.name })}</p>` : ''}</div>` : ''}`
      : html`<div class="shelf-empty">${emptyState({ emoji: '📁', title: t('folders.emptyTitle'), text: own ? t('folders.emptyText') : t('folders.sharedEmpty') })}${ctx.kind === 'class' ? html`<p>${findBtn(t, ctx)}</p>` : ''}</div>`}`;
}

/** Build's "All my games": the person's own games, newest change first. */
function allPane(req, ctx) {
  const t = req.t, list = ctx.mine;
  return html`${head(t('folders.allGames'), t('folders.gamesN', { count: list.length }), ctx.adult ? findBtn(t, ctx) : '')}
    ${list.length ? html`<ul class="mygames shelf-games">${list.map(g => gameRow(req, ctx, g))}</ul>`
      : html`<div class="shelf-empty">${emptyState({ emoji: '🌱', title: t('home.empty.title'), text: t('build.empty'), action: { href: '/build/new', label: `✨ ${t('build.newGame')}` } })}</div>`}`;
}

// ================================================================ the class page's Games tab on a phone
// docs/decisions.md "The Games tab on phones: two clear tabs". Below 640px the sidebar and the right side give way to
// this (app.css): a two-part switch, "📌 Assigned (n)" (what this class has, in the order students see it) and
// "📁 My library" (the teacher's games and collections, where they assign from). Every part is a plain link with the
// state in the address (?view=assigned | library | all | students, ?folder=<id>, &reorder=1), so it works without
// script, a reload and Back keep it, and the same address on a wider screen still opens the sidebar. The wider
// screens' markup is untouched. Ids here start lib- so the two never clash.
const CHEV = raw('<svg class="lib-chev" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M9 6l6 6-6 6"/></svg>');
const BACK = raw('<svg class="lib-backarrow" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M19 12H5M11 18l-6-6 6-6"/></svg>');

/** What the phone shows: { view: 'assigned' | 'library' | 'all' | 'students' } | { view: 'folder', folder, own }. */
function phonePicked(req, ctx, mine, shared) {
  const fid = String(req.query.folder || ''), view = String(req.query.view || '');
  if (fid && ctx.folders) {
    const f = mine.find(x => x.id === fid) || shared.find(x => x.id === fid);
    if (f) return { view: 'folder', folder: f, own: f.owner_id === req.user.id };
  }
  if (view === 'students') return { view };
  if (view === 'oomba' && ctx.staff) return { view };
  if (ctx.folders && ['library', 'all'].includes(view)) return { view };
  return { view: 'assigned' };
}

/** One row of the library list: icon, name, a line under it, the count and a chevron. */
const libItem = (req, { href, emo, name, sub, count }) => html`<li><a class="lib-item" href="${href}"><span class="lib-ico" aria-hidden="true">${emo}</span>
  <span class="lib-text"><span class="lib-name" dir="auto">${name}</span>${sub ? html`<span class="lib-sub">${sub}</span>` : ''}</span>
  ${count === undefined ? '' : html`<span class="lib-n" aria-hidden="true">${count}</span><span class="sr-only">, ${req.t('folders.gamesN', { count })}</span>`}${CHEV}</a></li>`;

/** The library list: All my games, one's collections, + New collection, then From others. */
function libList(req, ctx, mine, shared, myGames) {
  const t = req.t, c = ctx.c, base = ctx.base;
  const fHref = f => `${base}?folder=${encodeURIComponent(f.id)}`;
  return html`<div class="lib-head"><div class="lib-title"><h2 id="lib-h">${t('folders.phone.library')}</h2><p>${t('folders.phone.libraryNote')}</p></div></div>
    <ul class="lib-items" aria-labelledby="lib-h">
      ${libItem(req, { href: `${base}?view=all`, emo: '🛠️', name: t('folders.allGames'), sub: t('folders.phone.allSub'), count: myGames.length })}
      ${mine.map(f => libItem(req, { href: fHref(f), emo: '📁', name: f.name, sub: f.school_id ? `🤝 ${t('folders.phone.sharedSub')}` : '', count: f.games }))}
      <li><details class="lib-newf"><summary class="lib-item lib-add"><span class="lib-ico" aria-hidden="true">+</span><span class="lib-text"><span class="lib-name">${t('folders.phone.newCollection')}</span></span></summary>
        <form class="lib-newf-panel" data-api="/api/game-folders" novalidate><input type="hidden" name="classId" value="${c.id}">
          <label for="lib-nf-name">${t('folders.phone.collectionName')}</label>
          <div class="row"><input class="input grow" id="lib-nf-name" name="name" maxlength="60" placeholder="${t('folders.namePlaceholder')}" required>
          <button class="btn btn-primary" type="submit">${t('folders.create')}</button></div><p class="form-err err" role="alert"></p></form></details></li>
    </ul>
    <h3 class="lib-group" id="lib-others">${t('folders.phone.fromOthers')}</h3>
    <ul class="lib-items" aria-labelledby="lib-others">
      ${shared.map(f => libItem(req, { href: fHref(f), emo: '🤝', name: f.name, sub: t('folders.phone.byReadOnly', { name: f.owner_name || '' }), count: f.games }))}
      ${libItem(req, { href: `${base}?view=students`, emo: '🎒', name: t('folders.studentShared'), sub: t('folders.phone.studentsSub', { class: c.name }), count: ctx.students.count })}
      ${ctx.staff ? libItem(req, { href: `${base}?view=oomba`, emo: '🦉', name: t('folders.phone.oomba'), sub: t('folders.phone.oombaSub') }) : ''}
      ${ctx.staff ? libItem(req, { href: `/library?class=${c.id}`, emo: '📚', name: t('library.findStories'), sub: t('library.door.staff', { count: LIB.books().length }) }) : ''}
    </ul>`;
}

/** "+ Assign" / "✓ Assigned" on a game row in a collection: assigns it to the class, or takes it off (the same endpoints
 *  as the wider screens' Assign and the Assigned list's Unassign). A game that needs setting up first opens the Assign
 *  page, as it does today. */
function libToggle(req, ctx, g, folderId) {
  const t = req.t, c = ctx.c;
  if (!ctx.staff) return '';
  const plus = html`<span aria-hidden="true">+</span> ${t('folders.assign')}<span class="sr-only">: ${g.title}</span>`;
  if (setGame(g) || liveOnly(g) || !F.assignable(req.user, g, c).ok) return html`<a class="btn lib-toggle" href="/teach/assign?id=${g.id}&amp;class=${c.id}">${plus}</a>`;
  const cl = F.assignmentOf(c.id, g.id);
  if (cl) {
    return html`<form class="lib-tform" data-api="/api/class-lessons/${cl.id}/delete" data-reload data-confirm="${t('lessons.class.unassignConfirm', { name: g.title })}">
      <button class="btn lib-toggle is-on" type="submit" title="${t('lessons.class.unassign')}"><span aria-hidden="true">✓</span> ${t('folders.assignedChip')}<span class="sr-only">: ${g.title}. ${t('lessons.class.unassign')}</span></button></form>`;
  }
  return html`<form class="lib-tform" data-api="/api/teach/assign-game" novalidate><input type="hidden" name="gameId" value="${g.id}"><input type="hidden" name="classId" value="${c.id}">${folderId ? html`<input type="hidden" name="folder" value="${folderId}">` : html`<input type="hidden" name="view" value="all">`}
    <button class="btn lib-toggle" type="submit">${plus}</button></form>`;
}

/** One game in a collection (or All my games): cover, title, what it is, the Assign toggle and ⋯; in reorder mode, ↑/↓. */
function libGame(req, ctx, g0, i, ids, { folder = null, own = false, reorder = false } = {}) {
  const t = req.t, u = req.user, g = g0.source === 'seed' ? games.localizeGame(g0) : g0;
  const mineGame = g.owner_id === u.id && g.source !== 'seed', play = playHref(g);
  const kind = g.source === 'seed' ? html`🦉 <span class="lib-kindt">${t('folders.oombaGame')}</span>` : mineGame ? html`🛠️ <span class="lib-kindt">${t('folders.myGame')}</span>` : '';
  let acts, toggle = '';
  if (reorder) {
    const order = d => { const o = [...ids]; [o[i], o[i + d]] = [o[i + d], o[i]]; return o.map(id => html`<input type="hidden" name="ids" value="${id}">`); };
    const up = t('folders.phone.up', { name: g.title }), down = t('folders.phone.down', { name: g.title });
    acts = html`<span class="lib-moves">${i ? html`<form data-api="/api/game-folders/${folder.id}/order" data-reload>${order(-1)}<button class="btn lib-mv" type="submit" aria-label="${up}" title="${up}"><span class="lib-arrow" aria-hidden="true">↑</span></button></form>` : html`<span class="lib-mv-gap"></span>`}${i < ids.length - 1 ? html`<form data-api="/api/game-folders/${folder.id}/order" data-reload>${order(1)}<button class="btn lib-mv" type="submit" aria-label="${down}" title="${down}"><span class="lib-arrow" aria-hidden="true">↓</span></button></form>` : html`<span class="lib-mv-gap"></span>`}</span>`;
  } else {
    toggle = libToggle(req, ctx, g0, folder && folder.id);
    acts = html`${menu(t('folders.more', { name: g.title }), [
      html`<a class="btn" href="${play}">${PLAY} ${t('game.play')}</a>`,
      ctx.staff && (setGame(g0) || liveOnly(g0)) ? html`<a class="btn" href="/teach/assign?id=${g.id}&amp;class=${ctx.c.id}">${ico('📌', { size: 18 })} ${t('folders.assignTo', { class: ctx.c.name })}</a>` : '',
      folder && own ? html`<form data-api="/api/game-folders/${folder.id}/games/${g.id}/delete" data-reload><button class="btn" type="submit">${t('folders.removeGame')}</button></form>` : '',
      html`<a class="btn" href="/build/save?id=${g.id}">${ico('📁', { size: 18 })} ${folder && own ? t('folders.saveAnother') : t('folders.save')}</a>`,
    ])}`;
  }
  return html`<li class="lib-row${reorder ? ' is-moving' : ''}" data-id="${g.id}">
    <a class="lib-cover" href="${play}" tabindex="-1" aria-hidden="true">${coverArt(g, 'lib-thumb', { draft: mineGame })}</a>
    <div class="lib-body"><a class="lib-name" href="${play}" dir="auto">${g.title}</a>${kind || toggle ? html`<div class="lib-line">${kind ? html`<span class="lib-kind">${kind}</span>` : ''}${toggle}</div>` : ''}</div>
    <div class="lib-acts">${acts}</div></li>`;
}

/** Inside a collection (or All my games), opened in place in the library. */
function libFolder(req, ctx, sel, mine, myGames) {
  const t = req.t, base = ctx.base, reorder = String(req.query.reorder || '') === '1';
  const back = html`<a class="lib-back" href="${base}?view=library">${BACK} ${t('folders.phone.library')}</a>`;
  if (sel.view === 'all') {
    return html`${back}<div class="lib-head"><div class="lib-title"><h2 id="lib-h" dir="auto">${ico('🛠️', { size: 28 })} ${t('folders.allGames')}</h2><p>${t('folders.gamesN', { count: myGames.length })}</p></div></div>
      ${myGames.length ? html`<ul class="lib-list">${myGames.map((g, i) => libGame(req, ctx, g, i, []))}</ul>`
        : html`<div class="cl-none lib-none"><span class="emo" aria-hidden="true">${ico('🌱', { size: 32 })}</span><div><b>${t('folders.phone.allEmpty')}</b><p class="small"><a href="/build/new">${t('folders.buildNew')}</a></p></div></div>`}`;
  }
  const f = sel.folder, own = sel.own, list = F.gamesIn(req.user, f.id), ids = list.map(g => g.id);
  const canMove = own && list.length > 1, moving = canMove && reorder;
  const school = f.school_id ? (S.getSchool(f.school_id) || {}).name || '' : '';
  const meta = [t('folders.gamesN', { count: list.length }), own ? (school ? `🤝 ${t('folders.sharedWithSchool', { school })}` : '') : t('folders.phone.byReadOnly', { name: f.owner_name || '' })].filter(Boolean).join(' · ');
  const more = own ? folderMenu(req, ctx, f, mine, 'lib')
    : menu(t('folders.more', { name: f.name }), [html`<form data-api="/api/game-folders/${f.id}/copy"><input type="hidden" name="classId" value="${ctx.c.id}"><button class="btn" type="submit">${ico('📁', { size: 18 })} ${t('folders.copy')}</button></form>`]);
  const tools = moving ? html`<a class="btn btn-primary lib-tool" href="${base}?folder=${encodeURIComponent(f.id)}">${ico('✓', { size: 18 })} ${t('folders.phone.done')}</a>`
    : html`${ctx.kind === 'class' ? assignAll(req, ctx, f, list, 'lib-all-d') : ''}${canMove ? html`<a class="btn lib-tool" href="${base}?folder=${encodeURIComponent(f.id)}&amp;reorder=1">↕ ${t('folders.phone.reorder')}</a>` : ''}`;
  return html`${back}<div class="lib-head"><div class="lib-title lib-ftitle"><h2 id="lib-h" dir="auto"><span aria-hidden="true">${own ? '📁' : '🤝'}</span> ${f.name}</h2><p dir="auto">${meta}</p></div><div class="lib-fmore">${more}</div>
    ${String(tools).trim() ? html`<div class="lib-tools">${tools}</div>` : ''}</div>
    ${list.length ? html`<ul class="lib-list">${list.map((g, i) => libGame(req, ctx, g, i, ids, { folder: f, own, reorder: moving }))}</ul>`
      : html`<div class="cl-none lib-none"><span class="emo" aria-hidden="true">${ico('📁', { size: 32 })}</span><div><b>${t('folders.phone.collectionEmpty')}</b><p class="small muted">${own ? t('folders.emptyText') : t('folders.sharedEmpty')}</p></div></div>`}`;
}

/** The phone's Games tab: the two-part switch and the picked part. */
function phoneLib(req, ctx, mine, shared) {
  const t = req.t, base = ctx.base, sel = phonePicked(req, ctx, mine, shared);
  const onAssigned = sel.view === 'assigned';
  const myGames = ctx.folders ? games.myGames(req.user.id, 100) : [];
  let body;
  if (onAssigned) body = ctx.assigned.phone({ base, reorder: String(req.query.reorder || '') === '1' });
  else if (sel.view === 'library') body = libList(req, ctx, mine, shared, myGames);
  else if (sel.view === 'students') {
    // The wider screens' list, with its ids made the phone's own.
    const pane = String(ctx.students.pane()).replace('id="shelf-h" tabindex="-1"', 'id="lib-h"').replace(' id="shared-games"', '');
    body = html`${ctx.folders ? html`<a class="lib-back" href="${base}?view=library">${BACK} ${t('folders.phone.library')}</a>` : ''}<div class="lib-students">${raw(pane)}</div>`;
  } else if (sel.view === 'oomba') {
    body = html`<a class="lib-back" href="${base}?view=library">${BACK} ${t('folders.phone.library')}</a><div class="lib-oomba">${oombaPane(req, ctx, { idp: 'lib-oo', heading: 'lib-h' })}</div>`;
  } else body = libFolder(req, ctx, sel, mine, myGames);
  const seg = (on, href, emo, label, n) => html`<a class="lib-seg${on ? ' is-on' : ''}" href="${href}"${on ? raw(' aria-current="page"') : ''}><span aria-hidden="true">${emo}</span> <span class="lib-segl">${label}</span>${n === undefined ? '' : html` <span class="lib-segn">${n}</span>`}</a>`;
  return html`<div class="lib" data-lib="${sel.view}">
    ${ctx.folders ? html`<nav class="lib-segs" aria-label="${t('folders.sideClass')}">${seg(onAssigned, `${base}?view=assigned`, '📌', t('folders.phone.assigned'), ctx.assigned.count)}${seg(!onAssigned, `${base}?view=library`, '📁', t('folders.phone.library'))}</nav>` : ''}
    <section class="lib-card panel" aria-labelledby="lib-h">${body}</section>
  </div>`;
}

/** The right side for what is picked. */
function pane(req, ctx, sel, mine) {
  if (sel.folder) return folderPane(req, ctx, sel, mine);
  if (sel.view === 'all') return allPane(req, ctx);
  if (sel.view === 'students') return ctx.students.pane();
  if (sel.view === 'oomba') return oombaPane(req, ctx);
  return ctx.assigned.pane();
}

function parts(req, ctx) {
  const mine = ctx.folders ? F.foldersOf(req.user.id) : [], shared = ctx.folders ? F.sharedWith(req.user) : [];
  const sel = picked(req, ctx, mine, shared);
  return { mine, shared, sel, main: pane(req, ctx, sel, mine) };
}
/** The shelf: the left column and the picked item's side. */
export function shelf(req, ctx, { id = '' } = {}) {
  const { mine, shared, sel, main } = parts(req, ctx);
  const ph = ctx.kind === 'class' ? phoneLib(req, ctx, mine, shared) : '';
  // The class page's shelf (shelf-class): on a phone its Build button, Assigned and Find chips (shelf-cltop) and the
  // Google Classroom foot give way to the class header's tiles, the Games tab and the Assigned card's head (app.css).
  return html`${ph}<div class="shelf${ctx.kind === 'class' ? ' shelf-class' : ''}" data-shelf${id ? html` id="${id}"` : ''}>
    ${side(req, ctx, sel, mine, shared)}
    <div class="shelf-col">${ctx.top || ''}<section class="shelf-main panel" id="shelf-main" aria-labelledby="shelf-h" data-shelf-key="${sel.key}" data-href="${hrefOf(ctx, sel, req)}">${main}</section></div>
    <p class="sr-only" id="shelf-say" aria-live="polite"></p>
  </div>`;
}
/** public/js/shelf.js asks for the right side only (the X-Shelf header): answer it as JSON and return true. Every answer
 *  of these pages varies on that header, so a cached page is never a cached fragment. */
export function shelfReply(req, res, ctx) {
  res.vary('X-Shelf');
  if (!req.get('x-shelf')) return false;
  const { sel, main } = parts(req, ctx);
  res.set('Cache-Control', 'no-store').json({ key: sel.key, href: hrefOf(ctx, sel, req), html: String(main) });
  return true;
}
