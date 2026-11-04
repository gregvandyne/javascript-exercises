// Game page, play page, the sandboxed frame, and the game APIs the SDK talks to (via the parent page).
import { Router } from 'express';
import { html, raw, jsonData } from '../views/html.js';
import { page, notFound } from '../views/layout.js';
import { inClassLine } from './teachers.js';
import { coverArt, avatar, cardGrid, statusLabel, categoryLabel } from '../views/components.js';
import { OFFICIAL } from '../auth.js';
import * as seo from '../seo.js';
import { LEARNING, isLearningGame, gradeBand, ageBand, hubOfGame } from '../learn.js';
import * as games from '../services/games.js';
import * as presence from '../services/presence.js';
import { frameDocument, sendFrame, sendFrameText, frameOrigins, SANDBOX } from '../services/frame.js';
import { signToken, readToken, requireUser, getUser, createGuest, startSession, isGrownup } from '../auth.js';
import { rateLimit, allow, ipOf, GUESTS_PER_IP_HOUR } from '../services/ratelimit.js';
import { q, uid, now, audit } from '../db.js';
import { config } from '../config.js';
import { tEn, tFor, normalizeCode, localeInfo } from '../i18n/index.js';
import { fileFor } from '../services/shots.js';
import * as progress from '../services/progress.js';
import { characterOf } from '../services/character.js';
import * as match from '../services/match.js';
import * as polls from '../services/polls.js';
import { onlineGame } from './match.js';
import fs from 'node:fs';
import { canHost as liveCanHost } from '../services/classlive-access.js';
import { liveOn } from '../services/classlive-sessions.js';
import { gameReady as gameLiveReady } from '../services/classlive-check.js';
import { liveGameOf } from '../live/live-games.js';
import { playData as ttsPlayData, frameData as ttsFrameData, listedGame as ttsListed } from './tts.js';
import { parseParams, packParams, unpackParams, hasParams } from '../services/play-params.js';
import * as ttsGames from '../services/tts-games.js';

import { courseOfSlug } from '../services/course-catalog.js';
import * as courses from '../services/courses.js';
import { isStaff } from '../services/schools.js';
export const router = Router();
const REASON_KEYS = ['scary', 'mean', 'grownup', 'broken', 'copy', 'other'];
/** [key, label] pairs in the reader's language (English by default; the admin panel uses English). */
export const reportReasons = (t = tEn) => REASON_KEYS.map(k => [k, t(`game.report.reasons.${k}`)]);
export const REPORT_REASONS = reportReasons();

function loadViewable(req, res) {
  const g = games.getGameBySlug(req.params.slug);
  if (!g || !games.canView(req.user, g)) { notFound(req, res, req.t('game.notShared')); return null; }
  return games.localizeGame(g, req.locale);
}

router.get('/g/:slug', (req, res) => {
  // A course game (services/course-catalog.js) has no page of its own: it lives on its course's page.
  const course = courseOfSlug(req.params.slug);
  if (course && !(req.user && req.user.role === 'admin')) return res.redirect(302, `/courses/${course.slug}#${req.params.slug}`);
  const g = loadViewable(req, res); if (!g) return;
  const t = req.t, f = req.fmt;
  const u = req.user;
  const [d] = games.decorate([{ ...g, ...(() => { const o = games.getOwner(g); return { owner_name: o.username, owner_display: o.display_name, owner_avatar: o.avatar, owner_color: o.color }; })() }]);
  const owner = games.getOwner(g);
  const isOwner = u && u.id === g.owner_id;
  // Grown-up accounts (routes/family.js) play and build, but don't like, rate or open profiles.
  const grownup = isGrownup(u);
  // A grown-up builder's game: their name and a "Grown-up builder" tag, never a link (grown-ups have no /u/ profile), for
  // every viewer. Nothing on this page leads to contacting them, and nothing says which children are theirs.
  const byGrownup = isGrownup(owner);
  const myStars = games.userRating(g.id, u && u.id), liked = games.userLiked(g.id, u && u.id);
  const lb = games.leaderboard(g.id, 10, u);
  // Signed out (search engines too), an official game's page suggests only launch games: a child's game title is
  // free text that may hold their name, and this page is indexed.
  const more = games.similar(u, g, 6, { official: !u && g.source === 'seed' });
  const cat = games.categoryInfo(g.category);
  const playable = !!g.published_version_id || (isOwner && g.current_version_id);
  const players = g.players_max > 1 ? `👥 ${t('game.about.players', { count: g.players_max })} · ` : `👤 ${t('game.about.onePlayer')} · `;
  // "Shared with: 5B, Art Club" (only reached after canView). The owner and admins see every class; anyone else sees
  // the classes they are in and a count of the others.
  const shared = games.classNamesFor(g, u);
  // Search engines index official launch games only. A game a child made (even a published, reviewed one) is never
  // indexed: its page carries the builder's name.
  const official = g.source === 'seed' && owner && owner.username === OFFICIAL && g.visibility === 'public' && g.status === 'published' && !g.hidden_reason;
  const crumbs = official ? gameCrumbs(req, g) : null;
  const fbl = key => (t.own(key) ? '' : raw(' lang="en" dir="ltr"'));
  const learn = official && LEARNING[g.slug];
  const hub = official && hubOfGame(g.slug);
  const band = learn && gradeBand([g.slug]);
  // The age line only once this language has it, so a translated sentence never carries an unmarked English phrase.
  const ages = learn && t.own('learn.ages.line') && ageBand(g.slug);
  // An Oomba Live mode: the page leads with joining (a code from the board) and hosting, solo practice comes second.
  const liveEntry = liveOn() && official ? liveGameOf(g) : null;
  const body = html`
  <article>
    ${crumbs ? html`<nav class="crumbs small" aria-label="${t('learn.crumbs')}" style="margin-bottom:var(--s3)"><ol>${crumbs.map(([name, p], i) => html`<li>${i < crumbs.length - 1 ? html`<a href="${lp(req, p)}">${name}</a>` : html`<span aria-current="page">${name}</span>`}</li>`)}</ol></nav>` : ''}
    <div class="gamehero">
      <div class="gh-cover" style="position:relative">${coverArt(d, '', { eager: true })}</div>
      <div>
        <h1>${g.title}</h1>
        ${byGrownup ? html`<span class="person ownerchip ownerchip-grownup">${avatar(owner, 32)}<span class="nm"><bdi>${owner.display_name}</bdi></span><span class="gu-tag"${fbl('game.grownupBuilder')}>🧑 ${t('game.grownupBuilder')}</span></span>`
          : grownup ? html`<span class="person ownerchip">${avatar(owner, 32)}<span class="nm">${owner.display_name}</span></span>` : html`<a class="person ownerchip" href="/u/${owner.username}">${avatar(owner, 32)}<span class="nm">${owner.display_name}</span></a>`}
        ${shared && shared.names.length ? html`<div class="sharedwith small"><span>🎒 ${t('game.sharedWith')}</span> <ul class="chips-inline">${shared.names.map(n => html`<li dir="auto">${n}</li>`)}</ul>${shared.others ? html` <span class="muted">${t('game.sharedWithMore', { count: shared.others })}</span>` : ''}</div>` : ''}
        <div class="statrow">
          <div class="stat"><b>${d.rating_count ? d.rating.toFixed(1) + ' ★' : t('cards.new')}</b>${d.rating_count ? t('game.stats.ratings', { count: d.rating_count, n: f.num(d.rating_count) }) : t('game.stats.noRatings')}</div>
          <div class="stat"><b data-live="${g.id}" data-live-format="number">${d.playing}</b>${t('game.stats.playingNow')}</div>
          <div class="stat"><b>${f.num(g.plays)}</b>${t('game.stats.plays', { count: +g.plays || 0 })}</div>
          <div class="stat"><b id="likecount">${f.num(g.likes)}</b>${t('game.stats.likes', { count: +g.likes || 0 })}</div>
        </div>
        ${liveEntry && playable ? '' : html`<div class="row actions">
          ${playable ? html`<a class="btn btn-primary btn-big playbig" href="/play/${g.slug}" id="playbtn">▶ ${t('game.play')}</a>` : html`<span class="notice">${t('game.notReady')}</span>`}
          ${playable && liveOn() && liveCanHost(req.user) && gameLiveReady(g) ? html`<a class="btn btn-big" href="/live?game=${g.id}" id="hostlive">📡 ${t('live.entry.hostLive')}</a>` : ''}
        </div>`}
        ${isOwner ? html`<p class="small muted" style="margin-top:8px">${statusLabel(g, t, shared ? shared.names.length : 1, byGrownup)}${g.pending_version_id ? ` · ${t('game.updateWaiting')}` : ''}${g.review_note ? html` · ${t('game.reviewer', { note: g.review_note })}` : ''}</p>` : ''}
      </div>
      ${liveEntry && playable ? livePanel(req, g, liveEntry) : ''}
      <div class="quietacts">
          ${grownup ? '' : html`<button class="qact" type="button" id="likebtn" aria-pressed="${String(!!liked)}"><span class="emo" aria-hidden="true">${liked ? '❤️' : '🤍'}</span>${t('game.like')}</button>`}
          <button class="qact" type="button" id="sharebtn"><span class="emo" aria-hidden="true">🔗</span>${t('game.share')}</button>
          ${isOwner ? html`<a class="qact" href="/studio/${g.id}"><span class="emo" aria-hidden="true">🛠️</span>${t('game.edit')}</a>` : ''}
          ${isOwner || !t.own('game.makeLike') ? '' : html`<a class="qact" href="/build" id="makelike"><span class="emo" aria-hidden="true">🛠️</span>${t.own('game.makeLikeShort') ? t('game.makeLikeShort') : t('game.makeLike')}</a>`}
        </div>
    </div>
    <div class="grid2">
      <div class="stack">
        ${adminVoices(u, g)}
        <section class="panel"><h2>${t('game.about.heading')}</h2>
          <p class="ugc" style="white-space:pre-line">${g.description || t('game.about.noDescription')}</p>
          ${learn ? html`<p class="lp-practise"${fbl(`learn.games.${learn.key}`)}><b>${t('learn.practise')}</b> ${t(`learn.games.${learn.key}`)}${band ? ` · ${t('learn.grades', band)}` : ''}${ages ? ` · ${t('learn.ages.line', ages)}` : ''}${hub ? html` · <a href="${lp(req, `/learn/${hub.slug}`)}">${t('learn.seeAll', { name: t(`learn.hubs.${hub.key}.name`) })}</a>` : ''}</p>` : ''}
          <div class="taglist"><a class="tag" href="/search?cat=${cat.key}">${cat.icon} ${categoryLabel(cat.key, t)}</a>${d.tagList.map(tag => html`<a class="tag" href="/search?q=${encodeURIComponent(tag)}">#${tag}</a>`)}</div>
          ${inClassLine(req)}
          <p class="small muted" style="margin:12px 0 0">${players}${g.orientation === 'landscape' ? `📱↔️ ${t('game.about.sideways')} · ` : ''}${t('game.about.updated', { when: f.ago(g.updated_at) })}</p>
        </section>
        ${grownup ? '' : html`<section class="panel" aria-labelledby="rate-h"><h2 id="rate-h">${t('game.rate.heading')}</h2>
          ${u ? html`<div class="rate" role="radiogroup" aria-label="${t('game.rate.yourRating')}" id="rate">${[1, 2, 3, 4, 5].map(n => html`<button type="button" role="radio" aria-checked="${myStars === n}" aria-label="${t('game.rate.stars', { count: n })}" data-stars="${n}" class="${n <= myStars ? 'on' : ''}">★</button>`)}</div>
            <p class="small muted" id="ratemsg">${myStars ? t('game.rate.thanks') : t('game.rate.tap')}</p>`
          : html`<p><button class="btn" type="button" data-guest-play="">${t('game.rate.guest')}</button></p>`}
        </section>`}
        <section class="panel" aria-labelledby="lb-h"><h2 id="lb-h">🏆 ${t('game.leaderboard.heading')}</h2>
          ${lb.length ? html`<ol class="lb">${lb.map(r => html`<li>${avatar(r, 30)}<span>${u ? r.display_name : ''}</span><span class="sc" dir="ltr">${f.int(r.score)}${r.label ? ' ' + r.label : ''}</span></li>`)}</ol>
            ${u ? '' : html`<p class="small muted" style="margin:10px 0 0"${fbl('game.leaderboard.signIn')}>${t('game.leaderboard.signIn')}</p>`}` : html`<p class="muted">${t('game.leaderboard.empty')}</p>`}
        </section>
      </div>
      <aside class="stack" aria-label="${t('game.more.label')}">
        ${more.length ? html`<section><h2>${t('game.more.heading')}</h2>${cardGrid(more, {})}</section>` : ''}
      </aside>
    </div>
    ${isOwner ? '' : html`<p class="reportline"><button class="linkbtn" type="button" id="reportbtn"><span class="emo" aria-hidden="true">🚩</span> ${t('game.report.button')}</button></p>`}
  </article>
  ${jsonData('page-data', { gameId: g.id, slug: g.slug, title: g.title, visibility: g.visibility, shareText: t(`game.shareText.${g.visibility === 'friends' && byGrownup ? 'connections' : g.visibility}`), reasons: reportReasons(t), signedIn: !!u })}`;
  if (!official) res.set('X-Robots-Tag', 'noindex, nofollow');
  // Search titles only where this language really has the wording (t.own alone is true for every key in English).
  const written = key => t.has(key) && t.own(key);
  const title = official && written(`seo.games.${g.slug}`) ? t(`seo.games.${g.slug}`) : official && written(`seo.game.kind.${cat.key}`) ? t('seo.game.title', { title: g.title, kind: t(`seo.game.kind.${cat.key}`) }) : g.title;
  page(req, res, { title, active: 'home', back: '/', backLabel: t('nav.home'), body, description: seo.clip(g.description, 158), scripts: ['/js/game.js', ...(u && u.role === 'admin' ? ['/js/admin-game-voices.js'] : [])],
    seo: official ? gameSeo(req, g, d, owner) : null });
});

/** The platform admin's "AI voices for this game" switch on a game's page (services/tts-games.js; English like the
 *  admin panel, and only ever shown to the admin). */
/** An Oomba Live mode's game page: join with a code (the board shows it), host it (grown-ups and teachers; a signed-out
 *  visitor gets the teachers' page), then practise alone. The code form works without the page script: /join?code=...
 *  sends a live code on to the join page (routes/live.js). */
function livePanel(req, g, entry) {
  const t = req.t, u = req.user;
  const out = !u || u.is_guest;
  const host = !out && liveCanHost(u) ? html`<a class="btn btn-big" href="/live?mode=${entry.mode}" id="hostlive">📡 ${t('live.entry.host')}</a>`
    : out ? html`<a class="btn" href="${lp(req, '/teachers/live')}" id="hostlive">📡 ${t('live.entry.teacherHost')}</a>` : '';
  return html`<section class="livepanel" aria-labelledby="livepanel-h">
    <p class="livepanel-tag" id="livepanel-h"><span aria-hidden="true">📡</span> ${t('live.entry.badgeLong')}</p>
    <p class="livepanel-how">${t('live.entry.howJoin')}</p>
    <form class="livepanel-join" method="get" action="/join" novalidate><input type="hidden" name="go" value="1">
      <label class="sr-only" for="lpjc">${t('live.join.codeLabel')}</label>
      <input class="input lv-code-input" id="lpjc" name="code" inputmode="numeric" autocomplete="off" spellcheck="false" maxlength="9" dir="ltr" placeholder="123 4567" required>
      <button class="btn btn-primary btn-big" type="submit" id="lpjoin">🎟️ ${t('live.entry.joinGo')}</button>
    </form>
    <div class="row actions">${host}<a class="btn" href="/play/${entry.solo}" id="playbtn">▶ ${t('live.entry.solo')}</a></div>
  </section>`;
}

function adminVoices(u, g) {
  if (!u || u.role !== 'admin') return '';
  if (ttsListed(g)) return html`<section class="panel small" id="admin-voices" lang="en" dir="ltr"><h2>🔊 AI voices for this game</h2><p>On: an official game listed for AI voices. Languages: <a href="/admin/voices">AI voices</a>.</p>${ttsGames.silentWhy() ? html`<p id="admin-voices-note"><b>Nothing plays yet.</b> ${ttsGames.silentWhy()}</p>` : ''}</section>`;
  const x = ttsGames.info(g);
  return html`<section class="panel small" id="admin-voices" lang="en" dir="ltr" data-game="${g.id}"><h2>🔊 AI voices for this game</h2>
    <p class="muted">Admin only. Reads this game's own words (from its published version) with AI voices in the languages switched on at <a href="/admin/voices">AI voices</a>; never what a player types. ${x.on && !x.live ? 'It starts once the game is published and not hidden.' : ''}</p>
    ${x.ok || x.on ? html`<label class="row" style="gap:8px"><input type="checkbox" id="admin-voices-on" ${x.on ? raw('checked') : ''}> AI voices for this game</label>` : ''}
    ${x.on && x.ok && ttsGames.silentWhy() ? html`<p id="admin-voices-note"><b>Nothing plays yet.</b> ${ttsGames.silentWhy()}</p>` : ''}
    ${x.ok ? '' : html`<p id="admin-voices-why"><b>Can't be switched on.</b> ${x.why}</p>`}
    <p id="admin-voices-status" role="status"></p></section>`;
}

/** A link that stays in the language address the page was opened at (/es/g/… -> /es/learn/…). */
const lp = (req, p) => (req.pathLocale && seo.localizable(p) ? seo.localeUrl(p, req.pathLocale) : p);
/** An official launch game's breadcrumb, shown on the page and in its structured data: [[name, path], …]. */
function gameCrumbs(req, g) {
  const t = req.t; const hub = hubOfGame(g.slug);
  return [[t('nav.home'), '/'], ...(hub ? [[t('nav.teachers'), '/teachers'], [t(`learn.hubs.${hub.key}.name`), `/learn/${hub.slug}`]] : []), [g.title, `/g/${g.slug}`]];
}

/** Search and sharing data of an official launch game's page: its languages, its picture, and VideoGame (plus
 *  LearningResource for a learning game) structured data. */
function gameSeo(req, g, d, owner) {
  let l10n = {}; try { l10n = JSON.parse(g.l10n || '{}') || {}; } catch { /* none */ }
  const langs = seo.pageLangs(Object.keys(l10n));
  const path = `/g/${g.slug}`;
  const t = req.t; const cat = games.categoryInfo(g.category);
  const og = fs.existsSync(new URL(`../../public/og/${g.slug}.jpg`, import.meta.url)) ? `/og/${g.slug}.jpg` : null;
  const image = og || `/covers/${g.slug}.jpg`;
  const learn = LEARNING[g.slug];
  const game = {
    '@type': isLearningGame(g.slug) ? ['VideoGame', 'LearningResource'] : 'VideoGame',
    '@id': seo.abs(req, path) + '#game',
    name: g.title, description: g.description, url: seo.abs(req, seo.localeUrl(path, langs.includes(req.pathLocale) ? req.pathLocale : 'en')),
    image: [seo.abs(req, image), seo.abs(req, `/covers/${g.slug}.jpg`)].filter((v, i, a) => a.indexOf(v) === i),
    genre: tEn(`categories.${cat.key}`), gamePlatform: 'Web browser',
    inLanguage: langs, isFamilyFriendly: true, isAccessibleForFree: true, typicalAgeRange: `${seo.AGE.min}-${seo.AGE.max}`,
    audience: seo.audienceLd(),
    numberOfPlayers: { '@type': 'QuantitativeValue', minValue: 1, maxValue: Math.max(1, +g.players_max || 1) },
    offers: { '@type': 'Offer', price: 0, priceCurrency: 'USD', availability: 'https://schema.org/InStock' },
    publisher: { '@id': seo.orgId(req) }, author: { '@id': seo.orgId(req) },
    ...(g.published_at ? { datePublished: new Date(g.published_at).toISOString().slice(0, 10) } : {}),
    ...(g.updated_at ? { dateModified: new Date(g.updated_at).toISOString().slice(0, 10) } : {}),
    // Only real ratings, shown on the page, and only once there are enough to mean something.
    // applicationCategory and operatingSystem make this a Software App rich result, which Google rejects without a
    // rating or review, so they come only with the rating.
    ...(d.rating_count >= 5 ? { aggregateRating: { '@type': 'AggregateRating', ratingValue: +d.rating.toFixed(1), ratingCount: d.rating_count, bestRating: 5, worstRating: 1 }, applicationCategory: 'GameApplication', operatingSystem: 'Any (web browser)' } : {}),
    ...(learn && isLearningGame(g.slug) ? { teaches: learn.teaches, educationalLevel: learn.level, learningResourceType: 'Game', interactivityType: 'active' } : {}),
  };
  const crumbs = gameCrumbs(req, g);
  return {
    index: true, path, langs, type: 'website', image, imageAlt: t('seo.game.imageAlt', { title: g.title }),
    jsonld: [seo.graph([game, seo.breadcrumbLd(req, crumbs), seo.organizationLd(req)])],
  };
}

router.get('/play/:slug', (req, res) => {
  const t = req.t;
  const g = games.localizeGame(games.getGameBySlug(req.params.slug), req.locale);
  if (!g || !games.canView(req.user, g)) return notFound(req, res, t('game.notShared'));
  // One tap to play: a visitor without a session becomes a guest so progress saves (rate-limited per IP).
  if (!req.user && req.headers['sec-fetch-mode'] === 'navigate' && !seo.isBot(req.headers['user-agent']) && allow(`guestip:${ipOf(req)}`, GUESTS_PER_IP_HOUR, 3600e3)) {
    const guest = createGuest(); req.sessionId = startSession(res, guest.id, req.headers['user-agent']); req.user = guest;
  }
  const u = req.user;
  const isOwner = u && (u.id === g.owner_id || u.role === 'admin');
  // A course game is played as part of its course (docs/decisions.md "Course flow"). It opens only
  //   (a) from an open course step whose quick check is passed and whose game module is this game
  //       (?course=<slug>&cstep=<key>): opening sets the step's played_at (the module is started, not
  //       finished); the step completes only when the game reports its chapter won — the play page posts
  //       that to /api/courses/<slug>/<step>/complete, which sets completed_at. The course in the URL
  //       need not be the game's owner: a course may share another course's game (Cyber Defenders plays
  //       Packet Post) or an open game (Would You Rather), and the step's own course is what counts;
  //   (b) from a class lesson step of this game (?lesson=&step=, checked below);
  //   (c) for a teacher (school staff) with lesson parameters (?chapter=...), as on their lesson pages;
  //   (d) for the platform admin (isOwner);
  //   and in an online match the player is seated in (?match=, checked below).
  // Anything else goes to the course map. An open (unowned) game has no gate at all, but a valid step
  // context still marks the step started, and its mission then completes the same way as any other:
  // when the game reports the chapter won (above).
  const course = courseOfSlug(g.slug);
  // Opened from a lesson step (?lesson=<class lesson>&step=<step>): play time and scores count for that step. Not for a
  // hosted-live step (Quest Race, Would You Rather Live…): the teacher's live run writes that cell, so a hand-typed URL
  // plays the game without the lesson context (services/progress.js hostedLive).
  const lc = req.query.lesson && req.query.step && u ? progress.context(u, String(req.query.lesson), String(req.query.step)) : null;
  const lesson = lc && lc.ok && lc.step.kind === 'game' && lc.step.game_id === g.id && !progress.hostedLive(lc.step) ? { cl: lc.cl.id, step: lc.step.id, back: `/class/${lc.cl.class_id}/lessons/${lc.cl.id}` } : null;
  const asked = req.query.course ? courses.getCourse(String(req.query.course)) : null;
  let cstep = null;
  if (asked && !isOwner && req.query.cstep) cstep = courses.playable(u, asked, String(req.query.cstep), g.slug);
  if (course && !isOwner) {
    const teacher = !!req.query.chapter && isStaff(u);
    const inMatchQ = !!req.query.match && (() => { const m = match.get(req.query.match); return !!m && match.seatOf(m, u) >= 0 && m.gameId === g.id; })();
    if (!cstep && !lesson && !teacher && !inMatchQ) return res.redirect(302, `/courses/${asked && asked.slug !== course.slug ? asked.slug : course.slug}`);
  }
  if (cstep) courses.markPlayed(u, asked, cstep);
  const badge = cstep ? asked : (course && req.query.course === course.slug ? course : null);
  const inCourse = badge ? { course: badge, n: badge.games.findIndex(x => x.slug === g.slug) + 1, total: badge.games.length } : null;
  const versionId = g.published_version_id || (isOwner ? g.current_version_id : null);
  if (!versionId) return notFound(req, res, t('game.notReadyYet'));
  // An online match (?match=<id>, routes/match.js): only its two players, while it lasts; anyone else gets the game.
  let inMatch = null;
  if (req.query.match) {
    const m = match.get(req.query.match), seat = m ? match.seatOf(m, u) : -1;
    if (seat < 0 || m.state === 'ended' || m.gameId !== g.id) return res.redirect(`/play/${g.slug}`);
    inMatch = { id: m.id, seat };
  }
  // Lesson parameters (?chapter=&band=&mode=&level=&lock=, services/play-params.js): a lesson step's Play link says where
  // the game opens. Only the five known keys with valid values go into the token (o), nothing else from the URL.
  const o = packParams(parseParams(req.query));
  const token = signToken({ v: versionId, g: g.id, u: u ? u.id : null, l: req.locale, ...(inMatch ? { m: inMatch.id } : {}), ...(o ? { o } : {}) }, 15 * 60);
  const liked = games.userLiked(g.id, u && u.id);
  const grownup = isGrownup(u);   // no Like or Rate for grown-up accounts
  // AI voices (routes/tts.js): official games only, when TTS is on and a language is switched on; absent otherwise.
  const ttsData = ttsPlayData(u, g);
  // The way back (to the lesson, the course step, the course map or the game's page). It appears twice: in the
  // playbar, and again inside the stage (.fsback) — fullscreen paints only the stage's subtree, so the playbar
  // never shows there, and without the second link a player in fullscreen has no way back but the browser's own
  // escape (the game's own screens offer only Play again / Next).
  const backHref = lesson ? lesson.back : cstep ? `/courses/${asked.slug}/${cstep.key}#play` : course ? `/courses/${course.slug}` : `/g/${g.slug}`;
  const backLabel = lesson ? t('progress.play.backToLesson') : cstep ? t('courses.back', { course: t(`${asked.key}.title`) }) : course ? t('courses.back', { course: t(`${course.key}.title`) }) : t('play.backTo', { title: g.title });
  const body = html`
  <header class="playbar">
    <a class="iconbtn" href="${backHref}" aria-label="${backLabel}"><span class="emo flip" aria-hidden="true">←</span><span class="lbl">${t('layout.back')}</span></a>
    <h1 class="ptitle">${g.icon} ${g.title}${inCourse ? html` <a class="pcourse" href="/courses/${inCourse.course.slug}">📚 ${t('courses.step', { course: t(`${inCourse.course.key}.title`), n: inCourse.n, total: inCourse.total })}</a>` : ''}</h1>
    <span class="livecount" data-live="${g.id}" data-live-format="bar"></span>
    ${grownup ? '' : html`<button class="iconbtn" type="button" id="p-like" aria-pressed="${String(!!liked)}" aria-label="${t('game.like')}"><span class="emo" aria-hidden="true">${liked ? '❤️' : '🤍'}</span><span class="lbl">${t('game.like')}</span></button>
    <button class="iconbtn" type="button" id="p-rate" aria-label="${t('play.rate')}"><span class="emo" aria-hidden="true">⭐</span><span class="lbl">${t('play.rate')}</span></button>`}
    ${ttsData ? html`<button class="iconbtn" type="button" id="p-voices" aria-haspopup="dialog" aria-label="${t('play.voices')}"><span class="emo" aria-hidden="true">🔊</span><span class="lbl">${t('play.voices')}</span></button>` : ''}
    <button class="iconbtn" type="button" id="p-full" aria-label="${t('play.fullScreen')}"><span class="emo" aria-hidden="true">⛶</span><span class="lbl">${t('play.fullScreen')}</span></button>
  </header>
  <div class="stage" id="stage" dir="ltr">
    <a class="fsback" href="${backHref}" aria-label="${backLabel}"><span class="emo flip" aria-hidden="true">←</span><span class="lbl">${t('layout.back')}</span></a>
    <template id="gameframe-tpl"><iframe id="gameframe" title="${g.title}" data-src="/frame/${token}" sandbox="${SANDBOX}" allow="fullscreen; autoplay" allowfullscreen referrerpolicy="no-referrer"></iframe></template>
  </div>
  <div class="orient-hint ${g.orientation === 'landscape' ? 'show' : ''}" id="orient" role="dialog" aria-labelledby="orient-h" aria-describedby="orient-p"><div><div class="emo" aria-hidden="true">📱</div><h2 id="orient-h">${t('play.turn.heading')}</h2><p id="orient-p">${t('play.turn.text')}</p><button class="btn" type="button" id="orient-ok">${t('play.turn.ok')}</button></div></div>
  ${jsonData('page-data', { gameId: g.id, slug: g.slug, title: g.title, signedIn: !!u, myStars: games.userRating(g.id, u && u.id), canSave: !!u, lesson, match: inMatch, polls: !!(u && pollGame(g)), online: !!(u && onlineGame(u, g.id)), ...(cstep ? { cstep: { course: asked.slug, step: cstep.key } } : {}), ...(ttsData ? { tts: ttsData } : {}) })}`;
  page(req, res, { title: g.title, bare: true, bodyClass: `playmode ${g.orientation === 'landscape' ? 'wants-landscape' : ''}`, body, scripts: ['/js/play.js'], i18n: ['js.match'] });
});

// The frame: no cookies are needed; access comes from the short-lived signed token minted for the play/studio page.
// The token also carries the player's language (l), which games read as BRB.user.lang / BRB.user.dir.
// A Studio game's cover picture. Players get the live version's picture of a game they may open; the builder (and
// admins) can also see their drafts'. Anything else is a 404, so unreviewed pictures never leak.
router.get('/shots/:file', (req, res) => {
  const m = /^([A-Za-z0-9_-]{4,40})\.jpg$/.exec(req.params.file);
  const v = m && games.getVersion(m[1]);
  const g = v && v.shot_at && games.getGame(v.game_id);
  if (!g) return res.status(404).end();
  const live = g.published_version_id === v.id && games.canView(req.user, g);
  if (!live && !games.canEdit(req.user, g)) return res.status(404).end();
  const file = fileFor(v.id);
  if (!fs.existsSync(file)) return res.status(404).end();
  const open = live && g.visibility === 'public' && g.status === 'published' && !g.hidden_reason;
  res.set({ 'Cache-Control': open ? 'public, max-age=604800, immutable' : 'private, max-age=3600', 'X-Content-Type-Options': 'nosniff' });
  res.type('jpg').sendFile(file);
});

router.get('/frame/:token', (req, res) => {
  const t = req.t;
  const tok = readToken(req.params.token);
  if (!tok) return sendFrameText(res, 403, t('play.frameExpired'));
  const v = games.getVersion(tok.v); const g = v && games.getGame(v.game_id);
  if (!v || !g || g.id !== tok.g) return sendFrameText(res, 404, t('errors.api.notFound'));
  const preview = !!tok.p;
  // Bind the token to the viewer so a leaked frame URL is useless to anyone else: the sandboxed iframe is same-site, so
  // the SameSite=Lax session cookie rides along and req.user is the minter (guest-play sets its cookie before the frame loads).
  // Only when the page loads the frame: a reload the frame starts itself has no cookie, so the SDK's "Try again" asks the page.
  const u = req.user;
  if (tok.u && (!u || u.id !== tok.u)) return sendFrameText(res, 403, t('play.frameExpired'));
  // Re-check the live game against the viewer (catches a game since hidden, unpublished or made private); preview is owner/admin-only at mint.
  if (!preview && !games.canView(u, g)) return sendFrameText(res, 404, t('errors.api.notFound'));
  const lang = normalizeCode(tok.l) || req.locale;
  const init = {
    user: { ...(u ? { displayName: u.display_name, avatar: u.avatar, isGuest: !!u.is_guest, character: characterOf(u) } : { displayName: t('play.defaultPlayer'), avatar: '🙂', isGuest: true }), lang, dir: localeInfo(lang).dir },
    game: { id: g.id, title: g.title },
    // The site theme for games that follow it (Oomba Kit games); 'system' is left out so the device decides.
    ...(req.theme === 'light' || req.theme === 'dark' ? { theme: req.theme } : {}),
    save: u && !preview ? games.getSave(g.id, u.id) : {},
    canSave: !!u && !preview,
    preview,
    // Lesson parameters from the token (BRB.params in the game; absent when the game was opened without any).
    ...(hasParams(unpackParams(tok.o)) ? { params: unpackParams(tok.o) } : {}),
    // AI voices (routes/tts.js): the TTS locales on now, only for official games with TTS on; absent otherwise (the SDK
    // then speaks with the device's voice exactly as before).
    ...(!preview && ttsFrameData(u, g) ? { tts: ttsFrameData(u, g) } : {}),
    // An online match frame (BRB.match): the seat only; names and moves come from the page over a private port.
    ...(tok.m && u && match.get(tok.m) && match.seatOf(match.get(tok.m), u) >= 0 ? { match: { v: 1, seat: match.seatOf(match.get(tok.m), u) } } : {}),
    // Shown by the SDK, in the game's language: the "newer device" card (can't run 3D) and the "3D picture
    // stopped" card (a lost WebGL context on any device) with its Try again button.
    deviceText: {
      title: tFor(lang)('play.device.title'), text: tFor(lang)('play.device.text'),
      lostTitle: tFor(lang)('play.device.lostTitle'), lostText: tFor(lang)('play.device.lostText'), retry: tFor(lang)('play.device.retry'),
    },
  };
  sendFrame(res, frameDocument(v.html, init), frameOrigins(req));
});

// ---- APIs used by game.js / play.js ----
function apiGame(req, res) {
  const g = games.getGame(req.params.id);
  if (!g || !games.canView(req.user, g)) { res.status(404).json({ error: req.t('game.api.notFound') }); return null; }
  return g;
}
// Game polls (services/polls.js): an official game on the list counts a choice and gets the totals back.
// Body { item, choice: 0|1, seat?: 0-5 }. -> { a, b, total, min }
const pollGame = g => polls.POLL_GAMES.has(g.slug) && g.source === 'seed' && (games.getOwner(g) || {}).username === OFFICIAL;
router.post('/api/games/:id/poll', requireUser, rateLimit('poll', 240, 60e3), (req, res) => {
  const g = apiGame(req, res); if (!g) return;
  if (!pollGame(g)) return res.status(404).json({ error: req.t('game.api.notFound') });
  const b = req.body || {}, item = String(b.item || ''), choice = +b.choice, seat = b.seat === undefined ? 0 : +b.seat;
  if (!polls.ITEM.test(item) || !(choice === 0 || choice === 1) || !(Number.isInteger(seat) && seat >= 0 && seat <= 5)) return res.status(400).json({ error: req.t('errors.api.badRequest') });
  res.json({ ...polls.vote(g.id, req.user.id, item, choice, seat), min: polls.MIN_SHOWN });
});
router.post('/api/games/:id/rate', requireUser, rateLimit('rate', 30, 60e3), (req, res) => {
  const g = apiGame(req, res); if (!g) return;
  const s = Math.round(+(req.body || {}).stars);
  if (!(s >= 1 && s <= 5)) return res.status(400).json({ error: req.t('game.api.pickStars') });
  res.json({ ok: true, ...games.rate(g.id, req.user.id, s) });
});
router.post('/api/games/:id/like', requireUser, rateLimit('like', 30, 60e3), (req, res) => {
  const g = apiGame(req, res); if (!g) return;
  res.json({ ok: true, ...games.toggleLike(g.id, req.user.id) });
});
router.post('/api/games/:id/play', requireUser, rateLimit('play', 60, 60e3), (req, res) => {
  const g = apiGame(req, res); if (!g) return;
  const key = req.sessionId || `anon:${ipOf(req)}`;
  presence.touch(g.id, key, req.user ? req.user.id : null);
  const playId = games.recordPlay(g.id, req.user && req.user.id);
  res.json({ ok: true, playId, playing: presence.count(g.id) });
});
router.post('/api/games/:id/heartbeat', requireUser, rateLimit('hb', 30, 60e3), (req, res) => {
  const g = apiGame(req, res); if (!g) return;
  presence.touch(g.id, req.sessionId || `anon:${ipOf(req)}`, req.user ? req.user.id : null);
  res.json({ ok: true, playing: presence.count(g.id) });
});
// sendBeacon posts text/plain; accept both.
router.post('/api/games/:id/leave', (req, res) => {
  const g = games.getGame(req.params.id); if (!g) return res.status(404).end();
  presence.leave(g.id, req.sessionId || `anon:${ipOf(req)}`);
  let body = req.body; if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  if (body && body.playId) games.endPlay(String(body.playId), req.user ? req.user.id : null);
  res.status(204).end();
});
router.post('/api/games/:id/save', requireUser, rateLimit('save', 60, 60e3), (req, res) => {
  const g = apiGame(req, res); if (!g) return;
  try { games.putSave(g.id, req.user.id, (req.body || {}).data); res.json({ ok: true }); }
  catch { res.status(400).json({ error: req.t('game.api.saveFailed') }); }
});
router.get('/api/games/:id/save', requireUser, (req, res) => {
  const g = apiGame(req, res); if (!g) return;
  res.json({ data: games.getSave(g.id, req.user.id) });
});
router.post('/api/games/:id/score', requireUser, rateLimit('score', 30, 60e3), (req, res) => {
  const g = apiGame(req, res); if (!g) return;
  const { score, label } = req.body || {};
  if (!Number.isFinite(+score) || +score < 0) return res.status(400).json({ error: req.t('game.api.badScore') });
  // A score only counts after the player actually opened the game (a recorded play in the last 24h): this stops a
  // script from poisoning a leaderboard without ever loading the game. Scores are still client-reported (see docs/safety.md).
  if (!games.hasRecentPlay(g.id, req.user.id)) return res.status(400).json({ error: req.t('game.api.badScore') });
  // Grown-up accounts play, but are on no leaderboard: their scores are never stored.
  if (isGrownup(req.user)) return res.json({ ok: true, best: Math.max(0, Math.floor(+score)), improved: false });
  res.json({ ok: true, ...games.submitScore(g.id, req.user.id, +score, label) });
});
router.get('/api/games/:id/leaderboard', (req, res) => {
  const g = apiGame(req, res); if (!g) return;
  // Children's names only to someone signed in, as on the game page (a signed-out caller may be any scraper).
  res.json({ rows: games.leaderboard(g.id, 10, req.user).map(r => ({ ...(req.user ? { name: r.display_name } : {}), avatar: r.avatar, score: r.score, label: r.label })) });
});
// Reports: any signed-in player (guests included) can report with a simple reason. N open reports auto-hide the game.
router.post('/api/games/:id/report', requireUser, rateLimit('report', 10, 3600e3), (req, res) => {
  const t = req.t;
  const g = games.getGame(req.params.id);
  if (!g || !games.canView(req.user, g)) return res.status(404).json({ error: t('game.api.notFound') });
  const reason = String((req.body || {}).reason || '');
  if (!REASON_KEYS.includes(reason)) return res.status(400).json({ error: t('game.api.pickReason') });
  const details = String((req.body || {}).details || '').slice(0, 300);
  if (q.get("SELECT 1 FROM reports WHERE game_id=? AND user_id=? AND status='open'", g.id, req.user.id)) return res.json({ ok: true, already: true, message: t('game.report.already') });
  q.run('INSERT INTO reports(id, game_id, user_id, reason, details, created_at) VALUES (?,?,?,?,?,?)', uid(), g.id, req.user.id, reason, details, now());
  // Only trustworthy distinct reporters count toward auto-hiding (not guests, not the owner): a few throwaway guest
  // reports must not silently take a game down. Guest reports are still stored for admin review.
  const open = q.get("SELECT COUNT(DISTINCT r.user_id) n FROM reports r JOIN users u ON u.id=r.user_id WHERE r.game_id=? AND r.status='open' AND u.is_guest=0 AND r.user_id!=?", g.id, g.owner_id).n;
  if (open >= config.reportsToHide && !g.hidden_reason && g.owner_id !== req.user.id) {
    q.run("UPDATE games SET hidden_reason='reports', updated_at=? WHERE id=?", now(), g.id);
    audit(null, 'game.auto_hidden', g.id, { reports: open });
  }
  res.json({ ok: true, message: t('game.report.thanks') });
});
