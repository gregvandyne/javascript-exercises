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
import { html, raw } from '../views/html.js';
import { coverArt, emptyState } from '../views/components.js';
import { accountKind } from '../auth.js';
import * as S from '../services/schools.js';
import * as F from '../services/game-folders.js';
import * as games from '../services/games.js';
import * as gameSets from '../services/game-sets.js';
import { liveGameOf } from '../live/live-games.js';
import { gcAssignField } from './gclassroom.js';

/** A grown-up's or teacher's account (school staff, or signed up as a teacher): "All my games" offers Find Oomba games.
 *  Kids and students keep their own folders on Build as before, without it. */
export const shelfOn = u => !!u && !u.is_guest && (['grownup', 'staff'].includes(accountKind(u)) || u.signup_as === 'teacher');

const ICON = {
  all: '<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>',
  folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  assigned: '<path d="M9 11l3 3 8-8"/><path d="M20 12v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h9"/>',
  find: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
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
  const views = ctx.kind === 'build' ? ['all'] : ['assigned', 'students'];
  if (views.includes(view)) return { key: view, view };
  if (ctx.kind === 'build') return { key: 'all', view: 'all' };
  // The class page: its assigned games when it has some, else the first folder, else the (empty) assigned games.
  if (!ctx.assigned.count && ctx.folders && mine.length) return { key: `f-${mine[0].id}`, folder: mine[0], own: true };
  return { key: 'assigned', view: 'assigned' };
}
const hrefOf = (ctx, sel) => (sel.folder ? `${ctx.base}?folder=${encodeURIComponent(sel.folder.id)}` : ctx.kind === 'build' && sel.view === 'all' ? ctx.base : `${ctx.base}?view=${sel.view}`);

/** One item in the left column: a link, its icon, name and count (the count read as "n games"). */
function item(req, ctx, sel, it, { grip = false } = {}) {
  const on = it.key === sel.key;
  return html`<a class="shelf-item${on ? ' is-on' : ''}" href="${it.href}" data-shelf-key="${it.key}"${on ? raw(' aria-current="true"') : ''}${grip ? raw(' data-grip') : ''}>${icon(it.icon)}<span class="shelf-name" dir="auto">${it.name}</span>${it.count === undefined ? '' : html`<span class="n" aria-hidden="true">${it.count}</span><span class="sr-only">, ${req.t('folders.gamesN', { count: it.count })}</span>`}</a>`;
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
    : ctx.staff ? html`<a class="btn btn-primary shelf-go" href="/build/new" id="cl-newgame">${icon('plus', 18)} ${t('folders.buildNew')}</a>` : '';
  const first = ctx.kind === 'build'
    ? [{ key: 'all', href: ctx.base, icon: 'all', name: t('folders.allGames'), count: ctx.allCount }]
    : [{ key: 'assigned', href: `${ctx.base}?view=assigned`, icon: 'assigned', name: t('folders.assignedTo', { class: c.name }), count: ctx.assigned.count }];
  return html`<div class="shelf-side">
    ${top}
    <nav class="shelf-nav" aria-label="${ctx.kind === 'build' ? t('folders.myGamesFolders') : t('folders.sideClass')}">
      <ul class="shelf-group">${first.map(it => html`<li>${item(req, ctx, sel, it)}</li>`)}
        ${ctx.kind === 'class' && ctx.staff ? html`<li><a class="shelf-item" href="/learn">${icon('find')}<span class="shelf-name">${t('folders.findOomba')}</span></a></li>` : ''}</ul>
      ${ctx.folders ? html`<p class="shelf-lab" id="shelf-lab-mine">${t('folders.title')}</p>
      ${mine.length ? html`<ul class="shelf-group" aria-labelledby="shelf-lab-mine"${mine.length > 1 ? html` data-reorder="/api/game-folders/order" data-moved="${movedTpl(t)}" aria-describedby="shelf-order"` : ''}>${mine.map(f => html`<li data-id="${f.id}">${item(req, ctx, sel, fItem(f), { grip: mine.length > 1 })}</li>`)}</ul>` : ''}
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
  if (setGame(g) || liveOnly(g) || !F.assignable(u, g, c).ok) return html`<a class="btn btn-primary" href="/teach/assign?id=${g.id}&amp;class=${c.id}">📌 ${label}</a>`;
  if (F.assignmentOf(c.id, g.id)) return html`<span class="stchip good shelf-done">✅ ${t('folders.assignedChip')}</span>`;
  return html`<details class="shelf-pop"><summary class="btn btn-primary">📌 ${label}</summary>
    <form class="shelf-pop-panel" data-api="/api/teach/assign-game" novalidate><input type="hidden" name="gameId" value="${g.id}"><input type="hidden" name="classId" value="${c.id}">${folderId ? html`<input type="hidden" name="folder" value="${folderId}">` : ''}
      <div class="field"><label for="sa-d-${g.id}">${t('lessons.assign.due')}</label><input class="input" id="sa-d-${g.id}" name="dueAt" type="date"></div>
      ${gcAssignField(req, c)}
      <button class="btn btn-primary" type="submit">📌 ${t('teach.assign.submit')}</button><p class="form-err err" role="alert"></p></form></details>`;
}

/** One game: cover, title, what it is, Edit (one's own, on Build), Play, Assign, and ⋯ (Remove from folder, Save to
 *  another folder, and on Build Rename and Delete for one's own). */
function gameRow(req, ctx, g0, { folder = null, own = false, grip = false } = {}) {
  const t = req.t, u = req.user, g = g0.source === 'seed' ? games.localizeGame(g0) : g0;
  const mineGame = g.owner_id === u.id && g.source !== 'seed', play = playHref(g);
  const kind = g.source === 'seed' ? `🦉 ${t('folders.oombaGame')}` : mineGame ? `🛠️ ${t('folders.myGame')}` : '';
  const assign = !ctx.staff ? ''
    : ctx.kind === 'class' ? assignHere(req, ctx, g0, folder && folder.id)
      : folder || g.source === 'seed' || g.published_version_id ? html`<a class="btn btn-primary" href="/teach/assign?id=${g.id}">📌 ${t('folders.assign')}</a>` : '';
  const more = [
    folder && own ? html`<form data-api="/api/game-folders/${folder.id}/games/${g.id}/delete" data-reload><button class="btn" type="submit">${t('folders.removeGame')}</button></form>` : '',
    html`<a class="btn" href="/build/save?id=${g.id}">📁 ${folder && own ? t('folders.saveAnother') : t('folders.save')}</a>`,
    ctx.kind === 'build' && mineGame ? html`<button class="btn" type="button" data-rename>🏷️ ${t('build.rename')}</button><button class="btn mg-del" type="button" data-delete>🗑️ ${t('build.delete')}</button>` : '',
  ];
  const live = mineGame && g.status === 'published' && g.published_version_id;
  return html`<li class="mygame shelf-game" data-id="${g.id}" data-title="${g.title}" data-live="${live ? '1' : ''}">
    ${grip ? html`<button class="gfo-grip" type="button" data-grip aria-label="${t('folders.move', { name: g.title })}" aria-describedby="shelf-gorder"><span aria-hidden="true">⠿</span></button>` : ''}
    <a class="mg-cover" href="${mineGame && ctx.kind === 'build' ? `/studio/${g.id}` : play}" tabindex="-1" aria-hidden="true">${coverArt(g, '', { draft: mineGame })}</a>
    <div class="mg-body"><h3><a href="${mineGame && ctx.kind === 'build' ? `/studio/${g.id}` : play}" dir="auto">${g.title}</a></h3>
      ${kind ? html`<p class="small muted shelf-kind">${kind}</p>` : ''}
      ${mineGame && ctx.status ? ctx.status(g0) : ''}</div>
    <div class="mg-actions"><div class="mg-row">
      ${mineGame && ctx.kind === 'build' ? html`<a class="btn" href="/studio/${g.id}">✏️ ${t('game.edit')}</a>` : ''}
      ${!mineGame || ctx.kind !== 'build' || g.published_version_id ? html`<a class="btn" href="${play}">${PLAY} ${t('game.play')}</a>` : ''}
      ${assign}
      ${menu(t('folders.more', { name: g.title }), more)}
    </div></div></li>`;
}

/** The right side's head: the name, a line under it, and its buttons. */
const head = (title, meta, tools) => html`<div class="shelf-head"><div class="shelf-title"><h2 id="shelf-h" tabindex="-1" dir="auto">${title}</h2>${meta ? html`<p class="small muted">${meta}</p>` : ''}</div>${tools ? html`<div class="shelf-tools">${tools}</div>` : ''}</div>`;
const findBtn = t => html`<a class="btn" href="/learn">🦉 ${t('folders.findOomba')}</a>`;

/** "Assign all N" (the class page, in a folder): each game the class can play and doesn't have yet, one due day. */
function assignAll(req, ctx, f, list) {
  const t = req.t, c = ctx.c;
  if (!ctx.staff || !list.length) return '';
  return html`<details class="shelf-pop"><summary class="btn">📌 ${t('folders.assignAll', { count: list.length })}</summary>
    <form class="shelf-pop-panel" data-api="/api/teach/assign-folder" novalidate><input type="hidden" name="folderId" value="${f.id}"><input type="hidden" name="classId" value="${c.id}">
      <p class="small muted">${t('folders.assignAllNote', { class: c.name })}</p>
      <div class="field"><label for="sa-all-d">${t('lessons.assign.due')}</label><input class="input" id="sa-all-d" name="dueAt" type="date"></div>
      ${gcAssignField(req, c)}
      <button class="btn btn-primary" type="submit">📌 ${t('folders.assignAll', { count: list.length })}</button><p class="form-err err" role="alert"></p></form></details>`;
}

/** The owner's folder menu: Rename, Share or Stop sharing, Move up / down, Delete. */
function folderMenu(req, ctx, f, mine) {
  const t = req.t, schools = F.staffSchools(req.user), i = mine.findIndex(x => x.id === f.id);
  const back = ctx.c ? html`<input type="hidden" name="classId" value="${ctx.c.id}">` : '';
  const share = !schools.length ? ''
    : f.school_id ? html`<form data-api="/api/game-folders/${f.id}/share" data-reload><input type="hidden" name="schoolId" value=""><button class="btn" type="submit">${t('folders.unshare')}</button></form>`
      : html`<form class="shelf-share" data-api="/api/game-folders/${f.id}/share" data-reload>${schools.length > 1 ? html`<label class="sr-only" for="shelf-share-s">${t('folders.shareTitle')}</label><select class="input" id="shelf-share-s" name="schoolId">${schools.map(x => html`<option value="${x.id}">${x.name}</option>`)}</select>` : html`<input type="hidden" name="schoolId" value="${schools[0].id}">`}
        <button class="btn" type="submit">🤝 ${schools.length > 1 ? t('folders.shareTitle') : t('folders.shareWith', { school: schools[0].name })}</button></form>`;
  return menu(t('folders.more', { name: f.name }), [
    html`<form class="shelf-rename" data-api="/api/game-folders/${f.id}" data-reload><label for="shelf-rn">🏷️ ${t('build.rename')}</label><div class="row"><input class="input grow" id="shelf-rn" name="name" value="${f.name}" maxlength="60"><button class="btn btn-primary" type="submit">${t('school.save')}</button></div></form>`,
    share, schools.length ? html`<p class="small muted">${t('folders.shareNote')}</p>` : '',
    i > 0 ? html`<form data-api="/api/game-folders/${f.id}/up" data-reload><button class="btn" type="submit">↑ ${t('folders.moveUp')}</button></form>` : '',
    i >= 0 && i < mine.length - 1 ? html`<form data-api="/api/game-folders/${f.id}/down" data-reload><button class="btn" type="submit">↓ ${t('folders.moveDown')}</button></form>` : '',
    html`<form data-api="/api/game-folders/${f.id}/delete" data-confirm="${t('folders.deleteConfirm', { name: f.name })}">${back}<button class="btn btn-danger" type="submit">🗑️ ${t('folders.delete')}</button></form>`,
  ]);
}

/** The right side for a folder: its games (one's own can be dragged into order), or why it is empty. */
function folderPane(req, ctx, sel, mine) {
  const t = req.t, f = sel.folder, own = sel.own, list = F.gamesIn(req.user, f.id);
  const school = f.school_id ? (S.getSchool(f.school_id) || {}).name || '' : '';
  const meta = [t('folders.gamesN', { count: list.length }), own ? '' : t('folders.by', { name: f.owner_name || '' }), school ? t('folders.sharedWithSchool', { school }) : ''].filter(Boolean).join(' · ');
  const tools = [
    ctx.kind === 'class' ? assignAll(req, ctx, f, list) : findBtn(t),
    own ? folderMenu(req, ctx, f, mine) : html`<form data-api="/api/game-folders/${f.id}/copy">${ctx.c ? html`<input type="hidden" name="classId" value="${ctx.c.id}">` : ''}<button class="btn btn-primary" type="submit">📁 ${t('folders.copy')}</button></form>`,
  ];
  const drag = own && list.length > 1;
  return html`${head(f.name, meta, tools)}
    ${list.length ? html`<ul class="mygames shelf-games"${drag ? html` data-reorder="/api/game-folders/${f.id}/order" data-moved="${movedTpl(t)}"` : ''}>${list.map(g => gameRow(req, ctx, g, { folder: f, own, grip: drag }))}</ul>
      ${drag || ctx.kind === 'class' ? html`<div class="small muted shelf-note">${drag ? html`<p id="shelf-gorder">↕️ ${t('folders.reorderHint')}</p>` : ''}${ctx.kind === 'class' ? html`<p>${t('folders.assignedWhere', { class: ctx.c.name })}</p>` : ''}</div>` : ''}`
      : html`<div class="shelf-empty">${emptyState({ emoji: '📁', title: t('folders.emptyTitle'), text: own ? t('folders.emptyText') : t('folders.sharedEmpty') })}${ctx.kind === 'class' ? html`<p>${findBtn(t)}</p>` : ''}</div>`}`;
}

/** Build's "All my games": the person's own games, newest change first. */
function allPane(req, ctx) {
  const t = req.t, list = ctx.mine;
  return html`${head(t('folders.allGames'), t('folders.gamesN', { count: list.length }), ctx.adult ? findBtn(t) : '')}
    ${list.length ? html`<ul class="mygames shelf-games">${list.map(g => gameRow(req, ctx, g))}</ul>`
      : html`<div class="shelf-empty">${emptyState({ emoji: '🌱', title: t('home.empty.title'), text: t('build.empty'), action: { href: '/build/new', label: `✨ ${t('build.newGame')}` } })}</div>`}`;
}

/** The right side for what is picked. */
function pane(req, ctx, sel, mine) {
  if (sel.folder) return folderPane(req, ctx, sel, mine);
  if (sel.view === 'all') return allPane(req, ctx);
  if (sel.view === 'students') return ctx.students.pane();
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
  return html`<div class="shelf" data-shelf${id ? html` id="${id}"` : ''}>
    ${side(req, ctx, sel, mine, shared)}
    <div class="shelf-col">${ctx.top || ''}<section class="shelf-main panel" id="shelf-main" aria-labelledby="shelf-h" data-shelf-key="${sel.key}" data-href="${hrefOf(ctx, sel)}">${main}</section></div>
    <p class="sr-only" id="shelf-say" aria-live="polite"></p>
  </div>`;
}
/** public/js/shelf.js asks for the right side only (the X-Shelf header): answer it as JSON and return true. Every answer
 *  of these pages varies on that header, so a cached page is never a cached fragment. */
export function shelfReply(req, res, ctx) {
  res.vary('X-Shelf');
  if (!req.get('x-shelf')) return false;
  const { sel, main } = parts(req, ctx);
  res.set('Cache-Control', 'no-store').json({ key: sel.key, href: hrefOf(ctx, sel), html: String(main) });
  return true;
}
