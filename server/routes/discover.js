// Home rails, search (games + builders), live counts.
import { Router } from 'express';
import { html, raw } from '../views/html.js';
import { ico } from '../views/icon.js';
import { page, parentsKey, notFound } from '../views/layout.js';
import { cardGrid, emptyState, avatar, categoryLabel } from '../views/components.js';
import * as games from '../services/games.js';
import * as presence from '../services/presence.js';
import { rateLimit } from '../services/ratelimit.js';
import { requireUser, isGrownup, OFFICIAL } from '../auth.js';
import * as seo from '../seo.js';
import { CLASS_TOOLS, SHELF_INFO } from '../learn.js';
import { arcadeHidden } from '../services/game-focus.js';
import { availableCodes } from '../i18n/index.js';
import * as funnel from '../services/funnel.js';
import { countable } from '../services/traffic.js';
import { liveOn } from '../services/classlive-sessions.js';
import { liveGameOf } from '../live/live-games.js';
import { isStaff, classesOf } from '../services/schools.js';
import { toDoFor } from '../services/progress.js';
import { openForClass } from '../services/classlive-sessions.js';
import { courseOwned } from '../services/course-catalog.js';
import * as GLL from '../services/grammar-lab-listing.js';
import { searchCard as glSearchCard } from '../views/grammar-lab.js';
/** A student in a class: "Your class" at the top of Home: a live game their teacher just opened, else the next lesson to
 *  do (soonest due) with Continue, so Home never pulls them away from what's assigned. '' for everyone else. */
export function classStrip(req) {
  const t = req.t, f = req.fmt, u = req.user;
  if (!u || u.is_guest || isStaff(u)) return '';
  const mine = classesOf(u.id, 'student'); if (!mine.length) return '';
  for (const c of mine) {
    const s = liveOn() ? openForClass(c.id) : null;
    if (s && s.phase !== 'ended') return html`<section class="notice good home-class" id="home-class" aria-label="${t('home.class.h')}"><b>${ico('📡', { size: 18 })} ${t('classes.live.title')}</b> <span>${s.title}</span> <a class="btn btn-primary" href="/join#${s.code}">${t('classes.live.join')}</a></section>`;
  }
  for (const c of mine) {
    const todo = toDoFor(c.id, u.id); if (!todo.length) continue;
    const n = todo[0];
    return html`<section class="panel home-class" id="home-class" aria-labelledby="home-class-h"><h2 id="home-class-h">${ico('🏫', { size: 28 })} ${t('home.class.h')} <span class="small muted">${c.name}</span></h2>
      <p><b dir="auto">${n.title}</b>${n.due_at ? html` · <span class="chip-s">${ico('📅', { size: 18 })} ${t('lessons.class.dueOn', { date: f.day(n.due_at) })}</span>` : ''} <span class="small muted">${t('home.class.todo', { count: todo.length })}</span></p>
      <a class="btn btn-primary" href="/class/${c.id}/lessons/${n.id}">▶ ${t('home.class.continue')}</a> <a class="btn" href="/class/${c.id}">${t('home.class.open')}</a></section>`;
  }
  return '';
}

export const router = Router();

// "Build your own game" lives in its own banner, separate from the featured-game hero.
export function buildBanner(req) {
  const t = req.t; const u = req.user;
  const mine = u && !u.is_guest;
  return html`<section class="buildbanner" aria-labelledby="bb-h">
    <div class="bb-art" aria-hidden="true">${ico('🛠️', { size: 36 })}</div>
    <div class="bb-text"><h2 id="bb-h">${t('home.build.title')}</h2><p>${t('home.build.text')}</p></div>
    <a class="btn btn-hot" href="/build">${mine ? t('home.build.openStudio') : t('home.build.start')}</a>
  </section>`;
}

// My favorites: every game this player tapped ❤️ on.
router.get('/favorites', requireUser, (req, res) => {
  const t = req.t;
  const favs = games.favorites(req.user, req.user.id, 200);
  const body = html`<div class="pagehead"><h1>${ico('❤️', { size: 36 })} ${t('favorites.title')}</h1></div>
  ${favs.length ? cardGrid(favs, {}) : emptyState({ emoji: '🤍', title: t('favorites.emptyTitle'), text: t('favorites.emptyText'), action: { href: '/', label: t('favorites.emptyAction') } })}`;
  page(req, res, { title: t('favorites.title'), active: 'me', body, back: '/me', backLabel: t('nav.me') });
});

// '/' is the Learn page for everyone who lands on it (routes/teachers.js learnPage; layout.js landingFor). /play was the
// Play page until Play and Learn became one page (docs/decisions.md "Learn and Read"): it answers 301 to /learn, with
// its query string, and /<language>/play to /<language>/learn. /play/<slug> (playing a game) is another route.
const qsOf = req => { const i = req.originalUrl.indexOf('?'); return i >= 0 ? req.originalUrl.slice(i) : ''; };
router.get('/play', (req, res) => res.redirect(301, `/learn${qsOf(req)}`));
router.get(/^\/([a-z]{2}(?:-[a-z]{2,4})?)\/play\/?$/, (req, res, next) => {
  const code = availableCodes().find(c => seo.segOf(c) === req.params[0]);
  if (!code) return next();
  res.redirect(301, `${seo.localeUrl('/learn', code)}${qsOf(req)}`);
});

/** The games by topic (docs/decisions.md "Play by topic, My favorites", "Learn and Read"): the owner asked for no
 *  Popular or Top rated rows, just the games by topic ("Math, Reading, Geography, etc."). The Learn page (routes/
 *  teachers.js learnPage) shows topic chips that jump to one section per topic, each official game in exactly one of
 *  them. Sections with no game are left out. */
export const TOPICS = [
  { id: 'math', key: 'home.topics.math', emoji: '➗' },
  { id: 'reading', key: 'home.topics.reading', emoji: '📖' },
  { id: 'geography', key: 'home.topics.geography', emoji: '🌍' },
  { id: 'live', key: 'learn.tab.live', emoji: '📡' },
  { id: 'strategy', key: 'home.topics.strategy', emoji: '♟️' },
  { id: 'tools', key: 'home.focus.tools', emoji: '🤫' },
  { id: 'more', key: 'home.focus.more', emoji: '🎮' },
];
/** Kept for older links to the sections by kind (#sec-puzzles...): the topics above. */
export const FOCUS_SECTIONS = TOPICS;
/** The Learn shelf's subjects (learn.js SHELF_INFO) and the seed categories, as Play topics. */
const SUBJECT_TOPIC = { math: 'math', words: 'reading', maps: 'geography', thinking: 'strategy' };
const CATEGORY_TOPIC = { words: 'reading', board: 'strategy' };
/** Where the subject data says something else (or nothing): Sudoku is a number puzzle (Math), and the Play-shelf math
 *  games have no Learn subject. */
const TOPIC_OF = { sudoku: 'math', 'algebra-builder': 'math', 'arithmetic-lab': 'math' };
/** An official game's topic: a live class game is under Live class games (it is played with the whole class, whatever
 *  its subject), a noise meter under Classroom tools, then the explicit map, the Learn subject, the seed category. */
export function topicOf(g) {
  if (liveGameOf(g)) return 'live';
  if (CLASS_TOOLS.includes(g.slug)) return 'tools';
  if (TOPIC_OF[g.slug]) return TOPIC_OF[g.slug];
  const subj = SHELF_INFO[g.slug] && SUBJECT_TOPIC[SHELF_INFO[g.slug].subject];
  return subj || CATEGORY_TOPIC[g.category] || 'more';
}
/** -> { sections: [{ id, key, emoji, games }] } from the official games this viewer may open, each in one section. */
export function focusSections(u) {
  // Course-owned games are reached through their course, never listed here.
  const all = games.listVisible(u, { official: true, order: 'plays', limit: 100 }).filter(g => !courseOwned(g));
  const sections = TOPICS.map(sec => ({ ...sec, games: all.filter(g => topicOf(g) === sec.id) })).filter(sec => sec.games.length);
  return { hero: null, sections };
}
// ---------------------------------------------------------------------------------------------------- home doors
/** The three doors on the signed-out home page. The kid door scrolls down this page to the featured game and the game
 *  rows (#play), so a kid picks what to play rather than being sent into one game. The parent and teacher doors link
 *  straight to their page in this page's language (/es/parents), so every home page keeps a crawlable link to its own
 *  language's parent and teacher pages. Every door's click is counted on the way by a beacon (data-count -> POST
 *  /go/<door>, public/js/app.js), no redirect. Until a language has the door labels, the ones it already has stand in
 *  ("Play", "For parents", "For teachers") and the small lines are left out, so a translated home page never shows
 *  English doors (a door with no label in this language at all is English, marked so). */
export function homeDoors(req) {
  const t = req.t;
  const lp = p => (req.pathLocale ? seo.localeUrl(p, req.pathLocale) : p);
  const label = (key, stand) => (t.own(key) ? key : t.own(stand) ? stand : key);
  const fb = key => (t.own(key) ? '' : raw(' lang="en" dir="ltr"'));
  const door = (name, emoji, key, stand, sub, href) => {
    const k = label(key, stand);
    return html`<a class="door door-${name}" href="${href}" data-count="/go/${name}"><span class="door-e" aria-hidden="true">${emoji}</span><span class="door-t"><span class="door-h"${fb(k)}>${t(k)}</span>${t.own(sub) || !t.own(k) ? html`<span class="door-s"${fb(sub)}>${t(sub)}</span>` : ''}</span><span class="door-go flip" aria-hidden="true">›</span></a>`;
  };
  return html`<div class="doors" role="group"${t.own('home.doors.label') ? html` aria-label="${t('home.doors.label')}"` : ''}>
    ${door('kid', '🎮', 'home.doors.kid', 'home.hero.play', 'home.doors.kidSub', '#play')}
    ${door('parent', '👪', 'home.doors.parent', parentsKey(t, 'home.intro.parents'), 'home.doors.parentSub', lp('/parents'))}
    ${door('teacher', '🍎', 'home.doors.teacher', 'home.intro.teachers', 'home.doors.teacherSub', lp('/teachers'))}
  </div>`;
}
/** Door -> funnel step (services/funnel.js "doors"). play is the top bar's "▶ Play now" (views/layout.js). */
const DOORS = new Map([['kid', 'door.kid'], ['play', 'door.bar'], ['parent', 'door.parent'], ['teacher', 'door.teacher']]);
/** Where an old /go/ link leads: kids to the game rows on the home page (#play), parents and teachers to their page in
 *  the language the home page was in (?l=es -> /es/parents). */
export function doorTarget(req, door) {
  const code = availableCodes().includes(req.query.l) ? req.query.l : null;
  if (door === 'kid' || door === 'play') return (code ? seo.localeUrl('/', code) : '/') + '#play';
  const p = door === 'parent' ? '/parents' : '/teachers';
  return code ? seo.localeUrl(p, code) : p;
}
// Older links through /go/ (the doors used to go through it) still count and redirect; /go/ is disallowed in robots.txt
// and answers noindex. Counted once per click, for people's browsers only (not robots, link previews or scripts): one
// daily total per door, nothing about who clicked.
router.get('/go/:door', (req, res) => {
  const step = DOORS.get(req.params.door);
  if (!step) return notFound(req, res);
  if (req.method === 'GET' && countable(req)) funnel.bump(step);
  res.set({ 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' });
  res.redirect(302, doorTarget(req, req.params.door));
});
// The doors' and Play now's beacon (they are plain links): counts only, same rules, same-origin only (csrfCheck in
// app.js turns away other sites).
router.post('/go/:door', rateLimit('door', 30, 60e3), (req, res) => {
  const step = DOORS.get(req.params.door);
  if (!step) return res.status(404).end();
  if (req.headers['sec-fetch-site'] === 'same-origin' && countable(req)) funnel.bump(step);
  res.set('Cache-Control', 'no-store').status(204).end();
});

function searchResults(req) {
  const t = req.t;
  const u = req.user;
  const text = String(req.query.q || '').slice(0, 60);
  const cat = games.CATEGORY_KEYS.includes(req.query.cat) ? req.query.cat : null;
  const sort = ['relevance', 'popular', 'rated', 'new', 'playing'].includes(req.query.sort) ? req.query.sort : (text ? 'relevance' : 'popular');
  const list = games.search(u, { text, category: cat, order: sort, limit: 60 });
  // Children's names never reach a signed-out page (search engines included): signed out, only the official account.
  const builders = text ? games.searchBuilders(u, text).filter(b => u || b.username === OFFICIAL) : [];
  // Grammar Lab, where it lets this visitor in (services/grammar-lab-listing.js): its card when the words are a grammar
  // search, with the units they name; never with a category picked (it is not a game of one).
  const gl = text && !cat && GLL.listedFor(u) && GLL.matches(text, t, u) ? { units: GLL.unitsFor(text, u, { t }) } : null;
  const markup = html`
    ${gl ? glSearchCard({ t, units: gl.units, text, meta: GLL.metaLine(t) }) : ''}
    ${builders.length ? html`<section aria-labelledby="bh" style="margin-bottom:20px"><h2 id="bh" class="small muted" style="text-transform:uppercase;letter-spacing:.05em">${t('search.builders')}</h2>
      <div class="cardgrid" style="grid-template-columns:repeat(auto-fill,minmax(220px,1fr))">${builders.map(b => { const inner = html`${avatar(b, 48)}<span style="flex:1;min-width:0"><span class="nm">${b.display_name}</span><br><span class="sub"><bdi>@${b.username}</bdi> · ${t('search.gameCount', { count: b.games })}</span></span>`; return isGrownup(u) ? html`<div class="person panel" style="padding:12px">${inner}</div>` : html`<a class="person panel" style="padding:12px" href="/u/${b.username}">${inner}</a>`; })}</div></section>` : ''}
    ${list.length ? html`<h2 class="sr-only">${t('search.games')}</h2>${cardGrid(list, { user: u, category: cat })}` : gl ? '' :
      html`${emptyState({ emoji: '🔭', title: text ? t('search.noMatch', { text }) : t('search.noneYet'), text: t('search.tryCategory') })}
      <div class="chips" style="justify-content:center">${games.CATEGORIES.map(([k, e]) => html`<a class="chip" href="/search?cat=${k}">${e} ${categoryLabel(k, t)}</a>`)}</div>`}`;
  return { text, cat, sort, list, builders, gl, markup };
}
router.get('/search', (req, res) => {
  const t = req.t;
  const r = searchResults(req);
  // While the arcade is hidden there are no Popular / Top rated / New orders to pick (docs/decisions.md "Play by topic").
  const sortBtns = arcadeHidden() ? [] : ['relevance', 'popular', 'rated', 'new', 'playing'].filter(k => k !== 'relevance' || r.text);
  const body = html`
  <h1>${t('search.title')}</h1>
  <form id="searchform" role="search" action="/search" method="get" style="margin-bottom:14px">
    <label class="sr-only" for="q">${t('search.label')}</label>
    <input class="input searchbig" id="q" name="q" type="search" value="${r.text}" placeholder="${t('search.placeholder')}" autocomplete="off">
    <input type="hidden" name="cat" value="${r.cat || ''}"><input type="hidden" name="sort" value="${r.sort}">
  </form>
  <div class="chips scroll" role="group" aria-label="${t('search.category')}" style="margin-bottom:10px">
    <button class="chip" type="button" data-cat="" aria-pressed="${!r.cat}">${t('search.all')}</button>
    ${games.CATEGORIES.map(([k, e]) => html`<button class="chip" type="button" data-cat="${k}" aria-pressed="${r.cat === k}"><span aria-hidden="true">${e}</span>${categoryLabel(k, t)}</button>`)}
  </div>
  ${sortBtns.length ? html`<div class="row" style="margin-bottom:18px"><span class="small muted" style="font-weight:700">${t('search.sortLabel')}</span>
    <div class="seg" role="group" aria-label="${t('search.sort')}">${sortBtns.map(k => html`<button type="button" data-sort="${k}" aria-pressed="${r.sort === k}">${t(`search.sorts.${k}`)}</button>`)}</div></div>` : ''}
  <div id="results" aria-live="polite">${r.markup}</div>`;
  page(req, res, { title: r.text ? t('search.titleQuery', { text: r.text }) : t('search.title'), active: 'search', body, scripts: ['/js/search.js'] });
});
router.get('/api/search', rateLimit('search', 120, 60e3), (req, res) => {
  const r = searchResults(req);
  res.json({ html: String(r.markup), count: r.list.length, builders: r.builders.length, courses: r.gl ? 1 : 0 });
});
router.get('/api/live', (req, res) => {
  const ids = String(req.query.ids || '').split(',').filter(Boolean).slice(0, 100);
  res.set('Cache-Control', 'no-store').json({ counts: presence.counts(ids), online: presence.totalOnline() });
});
