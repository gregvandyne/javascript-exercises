// Game page, play page, the sandboxed frame, and the game APIs the SDK talks to (via the parent page).
import { Router } from 'express';
import { html, raw, jsonData } from '../views/html.js';
import { ico } from '../views/icon.js';
import { page, notFound, signedOut } from '../views/layout.js';
import { lessonWaitPage } from '../views/lesson-wait.js';
import { inClassLine } from './teachers.js';
import { coverArt, avatar, cardGrid, statusLabel, categoryLabel } from '../views/components.js';
import { OFFICIAL } from '../auth.js';
import { isSchoolStaff } from '../services/schools.js';
import * as seo from '../seo.js';
import { LEARNING, isLearningGame, gradeBand, ageBand, hubOfGame } from '../learn.js';
import * as games from '../services/games.js';
import * as presence from '../services/presence.js';
import { frameDocument, sendFrame, sendFrameText, frameOrigins, requestOrigin, SANDBOX } from '../services/frame.js';
import { signToken, readToken, requireUser, getUser, createGuest, startSession, isGrownup } from '../auth.js';
import { rateLimit, allow, count as countLimit, ipOf, GUESTS_PER_IP_HOUR } from '../services/ratelimit.js';
import { q, uid, now, audit } from '../db.js';
import { alert as adminAlert } from '../services/admin-alerts.js';
import { config } from '../config.js';
import { tEn, tFor, normalizeCode, localeInfo, keepLang } from '../i18n/index.js';
import { fileFor } from '../services/shots.js';
import * as progress from '../services/progress.js';
import * as L from '../services/lessons.js';
import * as PS from '../services/proof-steps.js';
import * as proofAi from '../services/proof-ai.js';
import * as proofChat from '../services/proof-chat.js';
import { characterOf } from '../services/character.js';
import * as match from '../services/match.js';
import * as polls from '../services/polls.js';
import * as TY from '../services/typing.js';
import * as gameSets from '../services/game-sets.js';
import { draftClues, DOC_FOCUS_MAX } from '../services/set-ai.js';
import * as VC from '../services/verify-change.js';
import { wordsFromFile, textFromFile, LIMITS as CW_DOC } from '../services/crossword-doc.js';
import { quizFromFile } from '../services/atlas-doc.js';
import { cleanText } from '../services/textfilter.js';
import { PRINTERS } from '../services/game-print.js';
import { canvasPrintable, cleanCanvasPrintDoc, canvasPrintHtml } from '../services/canvas-print.js';
import { canvasVersion, activityData } from '../services/canvaskit.js';
import { hasModel } from '../builder/anthropic.js';
import { onlineGame } from './match.js';
import fs from 'node:fs';
import { canHost as liveCanHost } from '../services/classlive-access.js';
import { liveOn } from '../services/classlive-sessions.js';
import { gameReady as gameLiveReady } from '../services/classlive-check.js';
import { liveGameOf } from '../live/live-games.js';
import { playData as ttsPlayData, frameData as ttsFrameData, listedGame as ttsListed, builtGame as ttsBuilt } from './tts.js';
import { parseParams, packParams, unpackParams, hasParams } from '../services/play-params.js';
import * as ttsGames from '../services/tts-games.js';

import { courseOfSlug } from '../services/course-catalog.js';
import * as focus from '../services/game-focus.js';
import * as courses from '../services/courses.js';
import { isStaff } from '../services/schools.js';
import { micGame, MIC_POLICY } from '../services/mic-games.js';
import { fenceLets } from './family.js';
export const router = Router();
/** Art styles a play page may pass on to its game frame (?style=, the kit's okStyle). */
export const FRAME_STYLES = Object.freeze(['cartoon', 'breeze']);
const REASON_KEYS = ['scary', 'mean', 'grownup', 'broken', 'copy', 'other'];
/** [key, label] pairs in the reader's language (English by default; the admin panel uses English). */
export const reportReasons = (t = tEn) => REASON_KEYS.map(k => [k, t(`game.report.reasons.${k}`)]);
export const REPORT_REASONS = reportReasons();

/** An official game hidden while ARCADE is off (services/game-focus.js): a calm page with the way to Learn, not an error. */
export function unavailable(req, res) {
  const t = req.t;
  return page(req, res, { title: t('game.unavailable.title'), body: html`<div class="empty" id="game-unavailable"><div class="emo">${ico('🧭', { size: 64 })}</div><h1>${t('game.unavailable.title')}</h1><p>${t('game.unavailable.text')}</p><a class="btn btn-primary" href="/learn">${t('game.unavailable.play')}</a></div>` }, 404);
}
function loadViewable(req, res) {
  const g = games.getGameBySlug(req.params.slug);
  if (!g || !games.canView(req.user, g)) { notFound(req, res, req.t('game.notShared')); return null; }
  return games.localizeGame(g, req.locale);
}

router.get('/g/:slug', (req, res) => {
  // A course game (services/course-catalog.js) has no page of its own: it lives on its course's page.
  const hiddenRow = games.getGameBySlug(req.params.slug);
  if (focus.gameHidden(hiddenRow) && !focus.mayOpenHidden(req.user, hiddenRow)) return unavailable(req, res);
  const course = courseOfSlug(req.params.slug);
  if (course && !(req.user && req.user.role === 'admin')) {
    // With the courses hidden (COURSES off) a course game's page has nowhere to send a new visitor.
    if (!focus.mayOpenCourses(req.user)) return notFound(req, res);
    return res.redirect(302, `/courses/${course.slug}#${req.params.slug}`);
  }
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
  // Signed in, Home is another tab (or another first page): the trail starts at Learn (Learn › Math games › Tug of Math).
  const seenCrumbs = crumbs && (signedOut(req.user) ? crumbs : crumbs.slice(1));
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
    ${seenCrumbs && seenCrumbs.length > 1 ? html`<nav class="crumbs small" aria-label="${t('learn.crumbs')}" style="margin-bottom:var(--s3)"><ol>${seenCrumbs.map(([name, p], i) => html`<li>${i < seenCrumbs.length - 1 ? html`<a href="${lp(req, p)}">${name}</a>` : html`<span aria-current="page">${name}</span>`}</li>`)}</ol></nav>` : ''}
    <div class="gamehero">
      <div class="gh-cover" style="position:relative">${coverArt(d, '', { eager: true })}</div>
      <div>
        <h1>${g.title}</h1>
        ${byGrownup ? html`<span class="person ownerchip ownerchip-grownup">${avatar(owner, 32)}<span class="nm"><bdi>${owner.display_name}</bdi></span><span class="gu-tag"${fbl('game.grownupBuilder')}>${ico('🧑', { size: 18 })} ${t('game.grownupBuilder')}</span></span>`
          : grownup ? html`<span class="person ownerchip">${avatar(owner, 32)}<span class="nm">${owner.display_name}</span></span>` : html`<a class="person ownerchip" href="/u/${owner.username}">${avatar(owner, 32)}<span class="nm">${owner.display_name}</span></a>`}
        ${shared && shared.names.length ? html`<div class="sharedwith small"><span>${ico('🎒', { size: 18 })} ${t('game.sharedWith')}</span> <ul class="chips-inline">${shared.names.map(n => html`<li dir="auto">${n}</li>`)}</ul>${shared.others ? html` <span class="muted">${t('game.sharedWithMore', { count: shared.others })}</span>` : ''}</div>` : ''}
        <div class="statrow">
          <div class="stat"><b>${d.rating_count ? d.rating.toFixed(1) + ' ★' : t('cards.new')}</b>${d.rating_count ? t('game.stats.ratings', { count: d.rating_count, n: f.num(d.rating_count) }) : t('game.stats.noRatings')}</div>
          <div class="stat"><b data-live="${g.id}" data-live-format="number">${d.playing}</b>${t('game.stats.playingNow')}</div>
          <div class="stat"><b>${f.num(g.plays)}</b>${t('game.stats.plays', { count: +g.plays || 0 })}</div>
          <div class="stat"><b id="likecount">${f.num(g.likes)}</b>${t('game.stats.likes', { count: +g.likes || 0 })}</div>
        </div>
        ${liveEntry && playable ? '' : html`<div class="row actions">
          ${playable ? html`<a class="btn btn-primary btn-big playbig" href="${keepLang(req, `/play/${g.slug}`)}" id="playbtn">▶ ${t('game.play')}</a>` : html`<span class="notice">${t('game.notReady')}</span>`}
          ${playable && liveOn() && liveCanHost(req.user) && gameLiveReady(g) ? html`<a class="btn btn-big" href="/live?game=${g.id}" id="hostlive">${ico('📡', { size: 18 })} ${t('live.entry.hostLive')}</a>` : ''}
        </div>`}
        ${isOwner ? html`<p class="small muted" style="margin-top:8px">${statusLabel(g, t, shared ? shared.names.length : 1, byGrownup)}${g.pending_version_id ? ` · ${t('game.updateWaiting')}` : ''}${g.review_note ? html` · ${t('game.reviewer', { note: g.review_note })}` : ''}</p>` : ''}
      </div>
      ${liveEntry && playable ? livePanel(req, g, liveEntry) : ''}
      <div class="quietacts">
          ${grownup ? '' : html`<button class="qact" type="button" id="likebtn" aria-pressed="${String(!!liked)}"><span class="emo" aria-hidden="true">${liked ? '❤️' : '🤍'}</span>${t('game.like')}</button>`}
          <button class="qact" type="button" id="sharebtn"><span class="emo">${ico('🔗', { size: 20 })}</span>${t('game.share')}</button>
          ${isOwner ? html`<a class="qact" href="/studio/${g.id}"><span class="emo">${ico('🛠️', { size: 20 })}</span>${t('game.edit')}</a>` : ''}
          ${u && isSchoolStaff(u) ? html`<a class="qact" href="/build/save?id=${g.id}"><span class="emo">${ico('📁', { size: 20 })}</span>${t('folders.save')}</a>${playable && !g.course_only ? html`<a class="qact" href="/teach/assign?id=${g.id}"><span class="emo">${ico('📌', { size: 20 })}</span>${t('folders.assign')}</a>` : ''}` : ''}
          ${isOwner || !t.own('game.makeLike') ? '' : html`<a class="qact" href="/build" id="makelike"><span class="emo">${ico('🛠️', { size: 20 })}</span>${t.own('game.makeLikeShort') ? t('game.makeLikeShort') : t('game.makeLike')}</a>`}
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
        <section class="panel" aria-labelledby="lb-h"><h2 id="lb-h">${ico('🏆', { size: 28 })} ${t('game.leaderboard.heading')}</h2>
          ${lb.length ? html`<ol class="lb">${lb.map(r => html`<li>${avatar(r, 30)}<span>${u ? r.display_name : ''}</span><span class="sc" dir="ltr">${f.int(r.score)}${r.label ? ' ' + r.label : ''}</span></li>`)}</ol>
            ${u ? '' : html`<p class="small muted" style="margin:10px 0 0"${fbl('game.leaderboard.signIn')}>${t('game.leaderboard.signIn')}</p>`}` : html`<p class="muted">${t('game.leaderboard.empty')}</p>`}
        </section>
      </div>
      <aside class="stack" aria-label="${t('game.more.label')}">
        ${more.length ? html`<section><h2>${t('game.more.heading')}</h2>${cardGrid(more, {})}</section>` : ''}
      </aside>
    </div>
    ${isOwner ? '' : html`<p class="reportline"><button class="linkbtn" type="button" id="reportbtn"><span class="emo">${ico('🚩', { size: 20 })}</span> ${t('game.report.button')}</button></p>`}
  </article>
  ${jsonData('page-data', { gameId: g.id, slug: g.slug, title: g.title, visibility: g.visibility, shareText: t(`game.shareText.${g.visibility === 'friends' && byGrownup ? 'connections' : games.legacyWide(g) ? 'connectionsClasses' : g.visibility}`), reasons: reportReasons(t), signedIn: !!u })}`;
  if (!official) res.set('X-Robots-Tag', 'noindex, nofollow');
  // Search titles only where this language really has the wording (t.own alone is true for every key in English).
  const written = key => t.has(key) && t.own(key);
  const title = official && written(`seo.games.${g.slug}`) ? t(`seo.games.${g.slug}`) : official && written(`seo.game.kind.${cat.key}`) ? t('seo.game.title', { title: g.title, kind: t(`seo.game.kind.${cat.key}`) }) : g.title;
  // Every game is on Learn now (docs/decisions.md "Learn and Read"): the Learn tab is current and Back goes there.
  page(req, res, { title, active: 'learn', back: '/learn', backLabel: t('nav.learn'), body, description: seo.clip(g.description, 158), scripts: ['/js/game.js', ...(u && u.role === 'admin' ? ['/js/admin-game-voices.js'] : [])],
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
  const host = !out && liveCanHost(u) ? html`<a class="btn btn-big" href="/live?mode=${entry.mode}" id="hostlive">${ico('📡', { size: 18 })} ${t('live.entry.host')}</a>`
    : out ? html`<a class="btn" href="${lp(req, '/teachers/live')}" id="hostlive">${ico('📡', { size: 18 })} ${t('live.entry.teacherHost')}</a>` : '';
  return html`<section class="livepanel" aria-labelledby="livepanel-h">
    <p class="livepanel-tag" id="livepanel-h">${ico('📡', { size: 18 })} ${t('live.entry.badgeLong')}</p>
    <p class="livepanel-how">${t('live.entry.howJoin')}</p>
    <form class="livepanel-join" method="get" action="/join" novalidate><input type="hidden" name="go" value="1">
      <label class="sr-only" for="lpjc">${t('live.join.codeLabel')}</label>
      <input class="input lv-code-input" id="lpjc" name="code" inputmode="numeric" autocomplete="off" spellcheck="false" maxlength="9" dir="ltr" placeholder="123 4567" required>
      <button class="btn btn-primary btn-big" type="submit" id="lpjoin">${ico('🎟️', { size: 18 })} ${t('live.entry.joinGo')}</button>
    </form>
    <div class="row actions">${host}${focus.slugHidden(entry.solo) ? '' : html`<a class="btn" href="${keepLang(req, `/play/${entry.solo}`)}" id="playbtn">▶ ${t(entry.play ? entry.playKey || 'live.entry.play' : 'live.entry.solo')}</a>`}</div>
  </section>`;
}

function adminVoices(u, g) {
  if (!u || u.role !== 'admin') return '';
  if (ttsListed(g)) return html`<section class="panel small" id="admin-voices" lang="en" dir="ltr"><h2>${ico('🔊', { size: 28 })} AI voices for this game</h2><p>On: an official game listed for AI voices. Languages: <a href="/admin/voices">AI voices</a>.</p>${ttsGames.silentWhy() ? html`<p id="admin-voices-note"><b>Nothing plays yet.</b> ${ttsGames.silentWhy()}</p>` : ''}</section>`;
  const x = ttsGames.info(g);
  return html`<section class="panel small" id="admin-voices" lang="en" dir="ltr" data-game="${g.id}"><h2>${ico('🔊', { size: 28 })} AI voices for this game</h2>
    <p class="muted">Admin only. Reads this game's own words (from its published version) with AI voices in the languages switched on at <a href="/admin/voices">AI voices</a>; never what a player types. ${x.on && !x.live ? 'It starts once the game is published and not hidden.' : ''}</p>
    <p id="admin-voices-default"><b>By default:</b> ${ttsBuilt(g) ? 'on. Only the exact lines fixed in the published version (it passed the safety check) are read, in one friendly voice.' : 'off for this game now. A Builder game gets AI voices once it is published, not hidden, and its published version passed the safety check (and TTS_BUILT_GAMES is not 0).'} The switch below goes further for this one game: lines with changing numbers, the game's own names and a few of its sentences read as one.</p>
    ${x.ok || x.on ? html`<label class="row" style="gap:8px"><input type="checkbox" id="admin-voices-on" ${x.on ? raw('checked') : ''}> AI voices for this game</label>` : ''}
    ${x.student ? html`<p id="admin-voices-student"><b>A student's game.</b> ${x.on && !x.stale ? 'On for the version published when you switched it on.' : 'Switching on covers the version published now: play it first.'} If the student publishes a new version, the voices stop until you switch them on again.</p>` : ''}
    ${x.stale ? html`<p id="admin-voices-stale"><b>Paused:</b> the student published a new version. Play it, then switch the voices off and on again to cover it.</p>` : ''}
    ${x.on && x.ok && ttsGames.silentWhy() ? html`<p id="admin-voices-note"><b>Nothing plays yet.</b> ${ttsGames.silentWhy()}</p>` : ''}
    ${x.ok ? '' : html`<p id="admin-voices-why"><b>Can't be switched on.</b> ${x.why}</p>`}
    <p id="admin-voices-status" role="status"></p></section>`;
}

/** A link that stays in the language address the page was opened at (/es/g/… -> /es/learn/…). */
const lp = (req, p) => (req.pathLocale && seo.localizable(p) ? seo.localeUrl(p, req.pathLocale) : p);
/** An official launch game's breadcrumb, shown on the page and in its structured data: [[name, path], …]. */
function gameCrumbs(req, g) {
  const t = req.t; const hub = hubOfGame(g.slug);
  return [[t('nav.home'), '/'], ...(hub ? [[t('learn.index.crumb'), '/learn'], [t(`learn.hubs.${hub.key}.name`), `/learn/${hub.slug}`]] : []), [g.title, `/g/${g.slug}`]];
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
  // A hidden official game (ARCADE off, services/game-focus.js) still plays for the admin, a class that has it assigned
  // (a lesson step, Assign), and a step of a course this player may still open.
  if (focus.gameHidden(g) && !focus.mayOpenHidden(req.user, g)) {
    const viaCourse = req.user && req.query.course && req.query.cstep && focus.mayOpenCourses(req.user) && (() => {
      const c = courses.getCourse(String(req.query.course)); return !!(c && courses.playable(req.user, c, String(req.query.cstep), g.slug));
    })();
    if (!viaCourse) return unavailable(req, res);
  }
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
  // A graded Mistake Hunt step (services/proof-steps.js) opens the game in its hand-in mode: proof marks it, and the frame
  // gets the step's passages (never the key until it is allowed) instead of a game score.
  const proofStep = !!(lc && lc.ok && lc.step.kind === L.PROOF_KIND && g.slug === PS.SLUG && g.source === 'seed');
  const lesson = lc && lc.ok && ((lc.step.kind === 'game' && lc.step.game_id === g.id && !progress.hostedLive(lc.step)) || proofStep) ? { cl: lc.cl.id, step: lc.step.id, back: `/class/${lc.cl.class_id}/lessons/${lc.cl.id}`, ...(proofStep ? { proof: true } : {}) } : null;
  // A lesson that waits for this student (Homeroom: an In order handout behind unfinished ones; services/lessons.js
  // lessonWait): the calm message and the way back, not the game.
  const wait = lesson ? L.lessonWait(u, lc.cl, t) : null;
  if (wait) return lessonWaitPage(req, res, wait);
  const asked = req.query.course ? courses.getCourse(String(req.query.course)) : null;
  let cstep = null;
  // The step context is honoured for every signed-in player who arrives with one, the game's owner and
  // the admin included: courses.playable is the gate (step open, its check passed, its module this game),
  // so honouring it weakens nothing. Dropping it for owners (the old !isOwner condition) made the win a
  // game reports impossible to record for exactly the people testing the course end to end — no played_at,
  // no cstep in the page data, no completion call, and no sign anywhere that anything was missing
  // (live finding, 2026-11-05: the admin's Sum Racer and Robo Route wins recorded nothing at all).
  // The owner bypass further down still governs merely OPENING a course game with no step context.
  // (PR #197 first restored the context for the admin; this keeps that and extends it to any owner,
  // since the context only ever arrives on a URL the course itself generated.)
  if (asked && req.query.cstep) cstep = courses.playable(u, asked, String(req.query.cstep), g.slug);
  if (course && !isOwner) {
    const teacher = !!req.query.chapter && isStaff(u);
    const inMatchQ = !!req.query.match && (() => { const m = match.get(req.query.match); return !!m && match.seatOf(m, u) >= 0 && m.gameId === g.id; })();
    if (!cstep && !lesson && !teacher && !inMatchQ) {
      if (!focus.mayOpenCourses(u)) return notFound(req, res);   // COURSES off: no course map to send them to
      return res.redirect(302, `/courses/${asked && asked.slug !== course.slug ? asked.slug : course.slug}`);
    }
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
  const token = signToken({ v: versionId, g: g.id, u: u ? u.id : null, l: req.locale, ...(inMatch ? { m: inMatch.id } : {}), ...(o ? { o } : {}), ...(lesson && lesson.proof ? { pf: [lesson.cl, lesson.step] } : {}) }, 15 * 60);
  // An art style the page asks for (?style=cartoon): it goes on to the frame as the Oomba Kit's ?okStyle=, and a game that
  // offers that style (Oomba.three's styles) draws it; every other game ignores it. Only the known style names pass.
  const frameQ = FRAME_STYLES.includes(String(req.query.style || '')) ? `?okStyle=${req.query.style}` : '';
  const liked = games.userLiked(g.id, u && u.id);
  const grownup = isGrownup(u);   // no Like or Rate for grown-up accounts
  // AI voices (routes/tts.js): official games, a game the admin switched on and Builder games whose published version
  // passed the safety scanner, when TTS is on and a language is switched on; absent otherwise.
  const ttsData = ttsPlayData(u, g);
  // The way back (to the lesson, the course step, the course map or the game's page). It appears twice: in the
  // playbar, and again inside the stage (.fsback) — fullscreen paints only the stage's subtree, so the playbar
  // never shows there, and without the second link a player in fullscreen has no way back but the browser's own
  // escape (the game's own screens offer only Play again / Next).
  // A game handed out from a class's Homeroom (services/lessons.js playFrame): back to the student's desk, and the
  // teacher's instructions again at the top of the game (the game itself is unchanged).
  const frame = lesson ? L.playFrame(u, lc.cl, lc.step, t) : null;
  if (frame) lesson.back = frame.backHref;
  const backHref = lesson ? lesson.back : cstep ? `/courses/${asked.slug}/${cstep.key}#play` : course ? `/courses/${course.slug}` : `/g/${g.slug}`;
  const backLabel = lesson ? (frame ? frame.backLabel : t('progress.play.backToLesson')) : cstep ? t('courses.back', { course: t(`${asked.key}.title`) }) : course ? t('courses.back', { course: t(`${course.key}.title`) }) : t('play.backTo', { title: g.title });
  // Loudness (services/mic-games.js): the official noise meters, and any Builder game whose code uses BRB.loudness; never
  // in an online match. This page (not the game frame, which keeps microphone=()) may then open the mic after a tap and
  // pass the game a number.
  const mic = !inMatch && micGame(g, games.getVersion(versionId)?.html);
  if (mic) res.set('Permissions-Policy', MIC_POLICY);
  // Played inside Homeroom (?in=hr, docs/decisions.md "Homeroom: one page, three views"): the teacher's board and a
  // student's desk open a game in a layer over themselves instead of leaving. Only then, and only in a frame of this
  // site, may the page be framed (by this site alone); its own Back links give way to the layer's, and a game's own
  // "back" asks the layer to close (public/js/play.js).
  const embed = req.query.in === 'hr' && req.headers['sec-fetch-dest'] === 'iframe';
  if (embed) { res.set('Content-Security-Policy', String(res.get('Content-Security-Policy') || '').replace("frame-ancestors 'none'", "frame-ancestors 'self'")); res.removeHeader('X-Frame-Options'); }
  const body = html`
  <header class="playbar">
    <a class="iconbtn" href="${backHref}" aria-label="${backLabel}"><span class="emo flip" aria-hidden="true">←</span><span class="lbl">${t('layout.back')}</span></a>
    <h1 class="ptitle">${g.icon} ${g.title}${inCourse ? html` <a class="pcourse" href="/courses/${inCourse.course.slug}">${ico('📚', { size: 18 })} ${t('courses.step', { course: t(`${inCourse.course.key}.title`), n: inCourse.n, total: inCourse.total })}</a>` : ''}</h1>
    <span class="livecount" data-live="${g.id}" data-live-format="bar"></span>
    ${grownup ? '' : html`<button class="iconbtn" type="button" id="p-like" aria-pressed="${String(!!liked)}" aria-label="${t('game.like')}"><span class="emo" aria-hidden="true">${liked ? '❤️' : '🤍'}</span><span class="lbl">${t('game.like')}</span></button>
    <button class="iconbtn" type="button" id="p-rate" aria-label="${t('play.rate')}"><span class="emo">${ico('⭐', { size: 20 })}</span><span class="lbl">${t('play.rate')}</span></button>`}
    ${ttsData ? html`<button class="iconbtn" type="button" id="p-voices" aria-haspopup="dialog" aria-label="${t('play.voices')}"><span class="emo">${ico('🔊', { size: 20 })}</span><span class="lbl">${t('play.voices')}</span></button>` : ''}
    <button class="iconbtn" type="button" id="p-full" aria-label="${t('play.fullScreen')}"><span class="emo" aria-hidden="true">⛶</span><span class="lbl">${t('play.fullScreen')}</span></button>
  </header>
  ${frame && frame.note ? html`<details class="playnote"><summary><span class="playnote-h">${ico('📝', { size: 18 })}<span class="lbl-h">${t('homeroom.desk.fromTeacher')}</span></span><span class="playnote-t" dir="auto">${frame.note}</span></summary><p class="playnote-full" dir="auto">${frame.note}</p></details>` : ''}
  <div class="stage" id="stage" dir="ltr">
    <a class="fsback" href="${backHref}" aria-label="${backLabel}"><span class="emo flip" aria-hidden="true">←</span><span class="lbl">${t('layout.back')}</span></a>
    <template id="gameframe-tpl"><iframe id="gameframe" title="${g.title}" data-src="/frame/${token}${frameQ}" sandbox="${SANDBOX}" allow="fullscreen; autoplay" allowfullscreen referrerpolicy="no-referrer"></iframe></template>
  </div>
  <div class="orient-hint ${g.orientation === 'landscape' ? 'show' : ''}" id="orient" role="dialog" aria-labelledby="orient-h" aria-describedby="orient-p"><div><div class="emo">${ico('📱', { size: 56 })}</div><h2 id="orient-h">${t('play.turn.heading')}</h2><p id="orient-p">${t('play.turn.text')}</p><button class="btn" type="button" id="orient-ok">${t('play.turn.ok')}</button></div></div>
  ${jsonData('page-data', { gameId: g.id, slug: g.slug, title: g.title, signedIn: !!u, myStars: games.userRating(g.id, u && u.id), canSave: !!u, lesson, match: inMatch, polls: !!(u && pollGame(g)), online: !!(u && onlineGame(u, g.id)), ...(cstep ? { cstep: { course: asked.slug, step: cstep.key } } : {}), ...((cstep || lesson) ? { backHref, backLabel } : {}), ...(ttsData ? { tts: ttsData } : {}), ...(mic ? { mic: true } : {}), ...(printGame(g) || canvasPrintVersion(g, u, null) ? { print: true } : {}), ...(frame && frame.data ? frame.data : {}), ...(embed ? { embed: 'hr' } : {}) })}`;
  // (keyboard: Doodle Hoot's guess box; an on-screen keyboard shrinks the page, so the box and the drawing stay in view)
  page(req, res, { title: g.title, bare: true, keyboard: g.slug === 'doodle-hoot', bodyClass: `playmode ${g.orientation === 'landscape' ? 'wants-landscape' : ''}${frame && frame.note ? ' has-playnote' : ''}${embed ? ' play-embed' : ''}`, body, scripts: ['/js/play.js', ...(frame && frame.script ? [frame.script] : [])], i18n: mic ? ['js.match', 'js.loudness'] : ['js.match'] });
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
  const open = live && games.openToAll(g) && g.status === 'published' && !g.hidden_reason;
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
  // Which question sets this frame's game keeps (setKind): an official set game's, or a classroom activity's worksheets
  // in its published version (never a preview of another version).
  const kind = setGame(g) ? g.slug : !preview && (canvasSetVersion(g) || {}).id === v.id ? gameSets.CANVAS_KIND : null;
  const init = {
    user: { ...(u ? { displayName: u.display_name, avatar: u.avatar, isGuest: !!u.is_guest, character: characterOf(u) } : { displayName: t('play.defaultPlayer'), avatar: '🙂', isGuest: true }), lang, dir: localeInfo(lang).dir },
    // url: the game's own play page, for a game that shares a link to itself (BRB.gameUrl: a link with lesson
    // parameters, as Algebra Builder' activity links are). Never another page.
    game: { id: g.id, title: g.title, url: `${requestOrigin(req)}/play/${g.slug}` },
    // The site theme for games that follow it (Oomba Kit games); 'system' is left out so the device decides.
    ...(req.theme === 'light' || req.theme === 'dark' ? { theme: req.theme } : {}),
    save: u && !preview ? games.getSave(g.id, u.id) : {},
    canSave: !!u && !preview,
    preview,
    // Typing Zoo: what the student's teacher asks to unlock each next lesson (BRB.classRules: { acc, wpm }; services/typing.js
    // rulesFor, the strictest among their classes), for a signed-in student only, never a preview.
    ...(!preview && u && !u.is_guest && g.source === 'seed' && g.slug === TY.SLUG ? (r => (r ? { classRules: r } : {}))(TY.rulesFor(u.id)) : {}),
    // Lesson parameters from the token (BRB.params in the game; absent when the game was opened without any).
    ...(hasParams(unpackParams(tok.o)) ? { params: unpackParams(tok.o) } : {}),
    // A question set (services/game-sets.js) a teacher saved in this game, when the link's chapter is its code
    // (BRB.questionSet: { id, items, mine }); a code with no set: { id, missing: true }.
    ...(setFor(g, unpackParams(tok.o).chapter, u, kind)),
    // Saving a set and looking up a class code (BRB.canSaveSet / BRB.canFindSet): false only where the grown-up fence
    // (routes/family.js) refuses that call, so the game hides what would fail; absent means the game may offer it.
    ...setRights(g, u, kind),
    // A teacher (school staff) in a set game may assign what they made to a class (BRB.canAssign / BRB.assign: the page
    // opens /teach/assign with it, where "Also post to Google Classroom" is offered for a linked class).
    ...(!preview && setGame(g) && isSchoolStaff(u) ? { canAssign: true } : {}),
    // "My worksheets" (BRB.canListSets / BRB.mySets): school staff and the platform admin get their own saved sets in a
    // set game, to open again, print, share, copy, rename and delete. Never a student, a child, a guest or a family
    // grown-up (the fence keeps them to playing), never in a preview. A Builder classroom activity that keeps
    // worksheets (canvasSetVersion: Oomba Canvas 1.4.0 for a worksheet or a generator) offers it the same way, in its
    // published version only, and never under the Studio's "As a student".
    ...(!preview && !tok.st && kind && u && !u.is_guest && isStaff(u) && fenceLets(u, 'GET', `/api/games/${g.id}/sets`) ? { mySets: true } : {}),
    // "Make your own" (BRB.canMake): the builder in Crossword, Word Hunt and Atlas Quest, and the drafts it keeps in the
    // player's own game save ("Your crosswords", "Your word hunts", "Your quizzes"), for grown-ups who may host (school
    // staff, the platform admin, a family grown-up: the same people as live games), with AI on or off. Never a student,
    // a child, a guest or a signed-out player, never in a preview. A student with a link or a class code plays as before.
    ...(!preview && makeGame(g) && liveCanHost(u) && fenceLets(u, 'POST', `/api/games/${g.id}/save`) ? { make: true } : {}),
    // Crossword's "Write clues with AI" (BRB.canWriteClues / BRB.writeClues): grown-ups who may host, with a model set.
    // The fence has the last word: a family grown-up may host, but these calls are school tools (routes/family.js).
    // Atlas Quest's "Upload a geography lesson" rides on the same flag and the same document call (BRB.wordsFromDoc).
    ...(!preview && (cluesGame(g) || atlasDocGame(g)) && liveCanHost(u) && hasModel() && fenceLets(u, 'POST', `/api/games/${g.id}/clues`) && fenceLets(u, 'POST', `/api/games/${g.id}/words-from-doc`) ? { clues: true } : {}),
    // Word Hunt's "Upload a word list (PDF or Word)" (BRB.canWriteClues / BRB.wordsFromDoc; no AI clues there): the same
    // grown-ups and the same path as Crossword's, words only.
    ...(!preview && huntGame(g) && liveCanHost(u) && hasModel() && fenceLets(u, 'POST', `/api/games/${g.id}/words-from-doc`) ? { clues: true } : {}),
    // Mistake Hunt's "Upload a passage" (BRB.canReadDocs / BRB.textFromDoc): the text of a PDF or Word file, no AI, for the
    // same grown-ups as Crossword's word lists (who may host), where the fence lets the call through.
    ...(!preview && docTextGame(g) && liveCanHost(u) && fenceLets(u, 'POST', `/api/games/${g.id}/text-from-doc`) ? { docText: true } : {}),
    // Mistake Hunt's AI tools (BRB.proofAi; services/proof-ai.js): teachers only (school staff and the platform admin),
    // with how many free requests are left today (null: the Teacher plan, no daily cap) and whether plans are on.
    ...(!preview && docTextGame(g) && proofAi.aiInfo(u) && fenceLets(u, 'POST', `/api/games/${g.id}/proof/draft`) ? { proofAi: proofAi.aiInfo(u) } : {}),
    // A graded Mistake Hunt step (BRB.proofStep; services/proof-steps.js viewFor): the words students see and their
    // saved fixes, never the key or the why lines before they are allowed. Only for the student the token was made for.
    ...(!preview && tok.pf && u && docTextGame(g) ? (() => { const r = progress.proofFor(u, String(tok.pf[0]), String(tok.pf[1])); return r.ok ? { proofStep: r.view } : {}; })() : {}),
    // Print (BRB.canPrint / BRB.print; Crossword, Arithmetic Lab, Mistake Hunt): the play page prints for the frame (POST /api/games/:id/print).
    ...(!preview && printGame(g) ? { print: true } : {}),
    // A classroom activity that prints (canvas-print.js), in the Studio's preview too (its maker): printKey offers the
    // answer key (BRB.canPrintKey) to its maker and school staff only; the print route checks again.
    // tok.st: the Studio's "As a student" preview, which shows the activity exactly as a student gets it.
    ...(canvasPrintable(v.html) ? { print: true, ...(!tok.st && canvasKeyFor(u, g) ? { printKey: true } : {}) } : {}),
    // Oomba Canvas 1.3.0: the teacher's controls inside an activity (BRB.canTeach: Show answer, Board mode, Help on this
    // screen, New set), by the same rule as the answer key; never for a student, never under "As a student".
    ...(!tok.st && canvasVersion(v.html) && canvasKeyFor(u, g) ? { teach: true } : {}),
    // AI voices (routes/tts.js): the TTS locales on now, for games that may use them (official games, a game the admin
    // switched on, and a Builder game's published, scanner-passed version); absent otherwise and in every preview (the
    // SDK then speaks with the device's voice exactly as before).
    ...(!preview && ttsFrameData(u, g, v.id) ? { tts: ttsFrameData(u, g, v.id) } : {}),
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
// Question sets (services/game-sets.js): an official game on the list keeps a teacher's list of questions under a short
// code. Body { items, id? } (id: change that set, the caller's own). -> { id }. Not for guests (a set outlives a guest).
const setGame = g => gameSets.SET_GAMES.has(g.slug) && g.source === 'seed' && (games.getOwner(g) || {}).username === OFFICIAL;
/** A Builder classroom activity that keeps worksheets (docs/canvas-api.md "Worksheets"): its published version is an
 *  Oomba Canvas 1.4.0 (or later) activity, whatever it is for (one for a worksheet or a generator also prints them).
 *  -> that version, or null. Its sets are the teacher's saved questions (game-sets.js cleanCanvasItems, cleaned for
 *  that version). */
function canvasSetVersion(g) {
  if (!g || !g.published_version_id || setGame(g)) return null;
  const v = games.getVersion(g.published_version_id);
  return v && v.game_id === g.id && gameSets.canvasSetKit(v.html) && (activityData(v.html) || {}).data ? v : null;
}
/** Which sets a game keeps: an official set game's slug (its cleaner), gameSets.CANVAS_KIND for a classroom activity
 *  that keeps worksheets, or null. */
const setKind = g => (setGame(g) ? g.slug : canvasSetVersion(g) ? gameSets.CANVAS_KIND : null);
/** What the fence lets this viewer do with a set game's sets: { setSave: false } and/or { setFind: false }, else {}. A
 *  classroom activity's worksheets are saved by school staff only (BRB.canSaveSet false for anyone else); a game with
 *  "Make your own" (makeGame) by grown-ups who may host only, as its builder is theirs (BRB.canMake). */
function setRights(g, u, kind = setKind(g)) {
  if (!kind) return {};
  const save = fenceLets(u, 'POST', `/api/games/${g.id}/sets`) && (kind !== gameSets.CANVAS_KIND || (!!u && !u.is_guest && isStaff(u))) && (!makeGame(g) || mayMake(u));
  return { ...(save ? {} : { setSave: false }), ...(fenceLets(u, 'GET', `/api/games/${g.id}/sets/code`) ? {} : { setFind: false }) };
}
/** INIT.set for a link's chapter. kind: the frame's (a classroom activity's worksheet opens only in its published
 *  version; a preview gets none). */
function setFor(g, chapter, u, kind) {
  if (!chapter || !gameSets.SET_ID.test(chapter) || !kind) return {};
  const s = gameSets.get(g.id, chapter);
  return { set: s ? { id: s.id, items: s.items, mine: !!u && s.ownerId === u.id } : { id: chapter, missing: true } };
}
// A class code a student typed in the game (BRB.findQuestionSet): the set, to play straight away. Anyone who can open the
// game may look one up (a code is what a teacher hands out); slowed per address, so codes can't be guessed in bulk.
router.get('/api/games/:id/sets/:code', rateLimit('game-set-code', 30, 60e3, 'errors.api.slowDown', { byIp: true }), (req, res) => {
  const g = apiGame(req, res); if (!g) return;
  if (!setKind(g)) return res.status(404).json({ error: req.t('game.api.notFound') });
  const id = gameSets.codeToId(req.params.code);
  const s = id && gameSets.get(g.id, id);
  if (!s) return res.status(404).json({ error: req.t('game.api.notFound'), code: 'noSet' });
  res.json({ id: s.id, items: s.items });
});
router.post('/api/games/:id/sets', requireUser, rateLimit('game-sets', 60, 60e3), (req, res) => {
  const g = apiGame(req, res); if (!g) return;
  const kind = setKind(g);
  if (!kind) return res.status(404).json({ error: req.t('game.api.notFound') });
  if (req.user.is_guest) return res.status(403).json({ error: req.t('errors.api.badRequest'), code: 'guest' });
  // A classroom activity's worksheet: school staff and the platform admin only (never a student or a child: a set is
  // a teacher's handout), cleaned for the activity's published version.
  const canvas = kind === gameSets.CANVAS_KIND;
  if (canvas && !isStaff(req.user)) return res.status(403).json({ error: req.t('errors.api.badRequest'), code: 'notAllowed' });
  // Crossword, Word Hunt and Atlas Quest: "Make your own" is for grown-ups who may host (BRB.canMake), never a student or
  // a child, so a set is theirs to save too (a student still opens one by its code).
  if (makeGame(g) && !mayMake(req.user)) return res.status(403).json({ error: req.t('errors.api.badRequest'), code: 'notAllowed' });
  const b = req.body || {}, id = b.id === undefined || b.id === null ? null : String(b.id);
  if (id !== null && !gameSets.SET_ID.test(id)) return res.status(400).json({ error: req.t('errors.api.badRequest') });
  const r = gameSets.save(g.id, req.user.id, b.items, id, kind, { ...(typeof b.title === 'string' ? { title: b.title } : {}), ...(canvas ? { html: canvasSetVersion(g).html } : {}) });
  if (r.error) return res.status(r.error === 'notYours' ? 404 : 400).json({ error: req.t('errors.api.badRequest'), code: r.error });
  res.json({ id: r.id });
});
// "My worksheets" (docs/sdk.md "Question sets"; BRB.mySets and friends): the signed-in teacher's own sets in this game,
// to open again, print, share, copy, rename and delete. Never a guest; anyone else's set answers 404, exactly as one
// that isn't there. Slowed per account like saving.
/** The set game and its signed-in, non-guest owner, or null (the answer already sent). g.kind: which sets it keeps
 *  (setKind: its slug, or a classroom activity's). */
function mySetsGame(req, res) {
  const g = apiGame(req, res); if (!g) return null;
  const kind = setKind(g);
  if (!kind) { res.status(404).json({ error: req.t('game.api.notFound') }); return null; }
  if (req.user.is_guest) { res.status(403).json({ error: req.t('errors.api.badRequest'), code: 'guest' }); return null; }
  return { ...g, kind };
}
const setIdOf = (req, res) => {
  const id = String(req.params.set || '');
  if (gameSets.SET_ID.test(id)) return id;
  res.status(404).json({ error: req.t('game.api.notFound'), code: 'noSet' });
  return null;
};
const noSet = (req, res) => res.status(404).json({ error: req.t('game.api.notFound'), code: 'noSet' });
router.get('/api/games/:id/sets', requireUser, rateLimit('game-sets-list', 60, 60e3), (req, res) => {
  const g = mySetsGame(req, res); if (!g) return;
  res.json({ sets: gameSets.listMine(g.id, req.user.id, g.kind), max: gameSets.MAX_PER_OWNER });
});
router.delete('/api/games/:id/sets/:set', requireUser, rateLimit('game-sets', 60, 60e3), (req, res) => {
  const g = mySetsGame(req, res); if (!g) return;
  const id = setIdOf(req, res); if (!id) return;
  if (!gameSets.remove(g.id, req.user.id, id)) return noSet(req, res);
  res.json({ ok: true });
});
router.post('/api/games/:id/sets/:set/rename', requireUser, rateLimit('game-sets', 60, 60e3), (req, res) => {
  const g = mySetsGame(req, res); if (!g) return;
  const id = setIdOf(req, res); if (!id) return;
  const title = (req.body || {}).title;
  if (typeof title !== 'string') return res.status(400).json({ error: req.t('errors.api.badRequest'), code: 'title' });
  const r = gameSets.rename(g.id, req.user.id, id, title, g.kind);
  if (r.error === 'notYours') return noSet(req, res);
  if (r.error) return res.status(400).json({ error: req.t('errors.api.badRequest'), code: r.error });
  res.json({ ok: true, title: r.title });
});
router.post('/api/games/:id/sets/:set/duplicate', requireUser, rateLimit('game-sets', 60, 60e3), (req, res) => {
  const g = mySetsGame(req, res); if (!g) return;
  const id = setIdOf(req, res); if (!id) return;
  const was = gameSets.get(g.id, id);
  if (!was || was.ownerId !== req.user.id) return noSet(req, res);
  const name = req.t('game.sets.copyOf', { title: was.title || gameSets.labelOf(g.kind, was.items) });
  const r = gameSets.duplicate(g.id, req.user.id, id, name, g.kind);
  if (r.error === 'notYours') return noSet(req, res);
  if (r.error) return res.status(400).json({ error: req.t('errors.api.badRequest'), code: r.error });
  res.json({ id: r.id, set: gameSets.oneMine(g.id, req.user.id, r.id, g.kind) });
});
// Crossword clues (services/set-ai.js draftClues): Claude writes a clue for each of the teacher's words, for the game's
// word list only (nothing is saved here). Body { words: [string] (1-30), level }. -> { clues: [string] } | { code }.
const cluesGame = g => setGame(g) && g.slug === 'crossword';
/** Word Hunt: a teacher's word list from a document (the words only), through Crossword's path. */
const huntGame = g => setGame(g) && g.slug === 'word-hunt';
/** The games with a "Make your own" builder (INIT.make / BRB.canMake): their sets are made by grown-ups who may host. */
const MAKE_GAMES = new Set(['crossword', 'word-hunt', 'atlas-quest', 'typing-zoo']);
const makeGame = g => setGame(g) && MAKE_GAMES.has(g.slug);
const mayMake = u => !!u && liveCanHost(u);
/** Who may print a game's answer key: school staff; in Atlas Quest also the grown-ups who may make a quiz there (BRB.canMake:
 *  a family grown-up, the platform admin), the same check as INIT.make. Never a student, a child, a guest or signed out. */
const printKeyFor = (u, g) => isSchoolStaff(u) || (g.slug === 'atlas-quest' && makeGame(g) && mayMake(u) && fenceLets(u, 'POST', `/api/games/${g.id}/save`));
/** Atlas Quest: questions from a teacher's geography lesson (services/atlas-doc.js quizFromFile), through words-from-doc. */
const atlasDocGame = g => setGame(g) && g.slug === 'atlas-quest';
/** Mistake Hunt: a passage from a teacher's document (services/crossword-doc.js textFromFile). */
const docTextGame = g => setGame(g) && g.slug === 'mistake-hunt';
/** A game that prints (services/game-print.js): Crossword's puzzles, Arithmetic Lab's worksheets. */
const printGame = g => setGame(g) && PRINTERS.has(g.slug);
/** A Builder classroom activity that prints (Oomba Canvas 1.2.0 with a worksheet or generator purpose,
 *  services/canvas-print.js): the published version, or (for its maker or an admin) the version they ask for, as in
 *  the Studio's preview. -> the version or null. */
function canvasPrintVersion(g, u, vid) {
  const id = typeof vid === 'string' && vid ? vid : g.published_version_id;
  const v = id ? games.getVersion(id) : null;
  if (!v || v.game_id !== g.id) return null;
  if (v.id !== g.published_version_id && !games.canEdit(u, g)) return null;
  return canvasPrintable(v.html) ? v : null;
}
/** Who may print an activity's answer key: school staff and the activity's own maker (never a student playing it). */
const canvasKeyFor = (u, g) => !!u && !u.is_guest && (isSchoolStaff(u) || games.canEdit(u, g));
router.post('/api/games/:id/clues', requireUser, rateLimit('game-clues', 30, 3600e3), async (req, res) => {
  const g = apiGame(req, res); if (!g) return;
  if (!cluesGame(g)) return res.status(404).json({ error: req.t('game.api.notFound') });
  if (!liveCanHost(req.user)) return res.status(403).json({ error: req.t('errors.api.badRequest'), code: 'notAllowed' });
  const b = req.body || {};
  if (!Array.isArray(b.words) || !b.words.length || b.words.length > 30 || !b.words.every(w => typeof w === 'string' && w.length <= 40)) return res.status(400).json({ error: req.t('errors.api.badRequest'), code: 'words' });
  let r;
  try { r = await draftClues({ words: b.words, level: typeof b.level === 'string' ? b.level : '', locale: req.locale }); }
  catch { r = { ok: false, code: 'aiFailed' }; }
  if (!r.ok) return res.status(r.code === 'words' ? 400 : 503).json({ error: req.t('errors.api.badRequest'), code: r.code });
  audit(req.user.id, 'game.clues', g.id, { count: b.words.length });
  // Checked work (services/verify-change.js): what the teacher actually gets, said plainly when it is not everything.
  const got = r.clues.filter(Boolean).length;
  res.json({ clues: r.clues, report: VC.kept({ asked: r.asked || b.words.length, kept: got, removed: { 'left blank by the checks': (r.asked || b.words.length) - got }, noun: 'clues' }) });
});
// Crossword words from a word list or document (services/crossword-doc.js wordsFromFile): a PDF (at most 5 pages) or a
// Word file, at most 2 MB; its text read here (at most about 5 pages), a plain "word - definition" list used without AI,
// else one small AI call. Grown-ups who may host only (staff, a signed-in grown-up), never a kid or a guest; 10 a day
// each. Body { kind: 'pdf'|'docx', data: base64, level, focus }. -> { title, words: [[word, clue]], cut, ai } | { code }.
// focus: the teacher's own optional line for the AI ("Science words only"), trimmed, at most DOC_FOCUS_MAX characters,
// through the site's text filter (refused: 400 code 'focusBad', before any AI); Crossword and Word Hunt only.
// The file is never stored or logged (only its kind and how many words), and nor is the focus.
function docFocus(v) {
  if (v === undefined || v === null) return { ok: true, value: '' };
  if (typeof v !== 'string') return { ok: false };
  const s = v.replace(/\s+/g, ' ').trim().slice(0, DOC_FOCUS_MAX).trim();
  if (!s) return { ok: true, value: '' };
  const c = cleanText(s, DOC_FOCUS_MAX);
  return c.ok ? { ok: true, value: c.value } : { ok: false };
}
router.post('/api/games/:id/words-from-doc', requireUser, rateLimit('game-doc', 20, 60e3), async (req, res) => {
  const g = apiGame(req, res); if (!g) return;
  const atlas = atlasDocGame(g);
  if (!cluesGame(g) && !huntGame(g) && !atlas) return res.status(404).json({ error: req.t('game.api.notFound') });
  if (!liveCanHost(req.user)) return res.status(403).json({ error: req.t('errors.api.badRequest'), code: 'notAllowed' });
  const b = req.body || {}, max = CW_DOC.bytes;   // 2 MB either way (base64 inside the site's 3 MB JSON limit)
  // Atlas Quest also takes a plain text lesson (.txt).
  if (!['pdf', 'docx'].includes(b.kind) && !(atlas && b.kind === 'txt')) return res.status(400).json({ error: req.t('errors.api.badRequest'), code: 'docType' });
  if (typeof b.data !== 'string' || !/^[A-Za-z0-9+/]+=*$/.test(b.data)) return res.status(400).json({ error: req.t('errors.api.badRequest'), code: 'docBad' });
  if (b.data.length > Math.ceil(max / 3) * 4 + 4) return res.status(413).json({ error: req.t('errors.api.badRequest'), code: 'docBig' });
  const focus = docFocus(b.focus);
  if (!focus.ok) return res.status(400).json({ error: req.t('errors.api.badRequest'), code: 'focusBad' });
  const day = `game-doc-day:${req.user.id}`;
  if (countLimit(day) >= CW_DOC.perDay) return res.status(429).json({ error: req.t('errors.api.slowDown'), code: 'docLimit' });
  // Atlas Quest: the lesson's questions in the same answer ([question, answer], or ['@kind', code] for a question about
  // a country the game asks itself); a file is never stored or logged here either.
  const r = atlas ? await quizFromFile({ kind: b.kind, buf: Buffer.from(b.data, 'base64'), level: typeof b.level === 'string' ? b.level : '', locale: req.locale })
    : await wordsFromFile({ kind: b.kind, buf: Buffer.from(b.data, 'base64'), level: typeof b.level === 'string' ? b.level : '', focus: focus.value, locale: req.locale });
  // Every file read counts towards the day's 10 (a file turned away for its size, pages or type does not).
  if (r.ok || ['docNone', 'aiFailed'].includes(r.code)) allow(day, CW_DOC.perDay, 864e5);
  if (!r.ok) return res.status(r.code === 'aiOff' || r.code === 'aiFailed' ? 503 : 400).json({ error: req.t('errors.api.badRequest'), code: r.code });
  // Word Hunt keeps only the words a word search takes (2 to 15 letters), without their clues.
  const words = huntGame(g) ? r.words.filter(([w]) => { const n = [...gameSets.crossLetters(w)].length; return n >= 2 && n <= gameSets.HUNT.letters; }).slice(0, gameSets.HUNT.max).map(([w]) => [w, '']) : r.words;
  if (!words.length) return res.status(400).json({ error: req.t('errors.api.badRequest'), code: 'docNone' });
  audit(req.user.id, atlas ? 'game.doc_quiz' : 'game.doc_words', g.id, { kind: b.kind, count: words.length, ai: r.ai, cut: r.cut });
  // Checked work: how many of what the AI (or the list) offered landed in the list after the checks, and why not.
  const asked = Math.max(r.asked || 0, r.words.length);
  const report = VC.kept({ asked, kept: words.length, noun: atlas ? 'questions' : 'words', removed: { 'removed by the checks': asked - r.words.length, ...(huntGame(g) ? { 'left out (too long or too short for a word search, or past its limit)': r.words.length - words.length } : {}) } });
  res.json({ title: r.title, words, cut: r.cut, ai: r.ai, report });
});
// Mistake Hunt's passage from a document (services/crossword-doc.js textFromFile): the text of a PDF (at most 5 pages)
// or a Word file, at most 2 MB, read here with no AI; Crossword's limits and its 10 files a day (the same counter).
// Grown-ups who may host only, never a kid or a guest. Body { kind: 'pdf'|'docx', data: base64 } -> { text, cut } | { code }.
// The file is never stored or logged (the audit line has its kind and how long the text was).
router.post('/api/games/:id/text-from-doc', requireUser, rateLimit('game-doc', 20, 60e3), (req, res) => {
  const g = apiGame(req, res); if (!g) return;
  if (!docTextGame(g)) return res.status(404).json({ error: req.t('game.api.notFound') });
  if (!liveCanHost(req.user)) return res.status(403).json({ error: req.t('errors.api.badRequest'), code: 'notAllowed' });
  const b = req.body || {}, max = CW_DOC.bytes;
  if (!['pdf', 'docx'].includes(b.kind)) return res.status(400).json({ error: req.t('errors.api.badRequest'), code: 'docType' });
  if (typeof b.data !== 'string' || !/^[A-Za-z0-9+/]+=*$/.test(b.data)) return res.status(400).json({ error: req.t('errors.api.badRequest'), code: 'docBad' });
  if (b.data.length > Math.ceil(max / 3) * 4 + 4) return res.status(413).json({ error: req.t('errors.api.badRequest'), code: 'docBig' });
  const day = `game-doc-day:${req.user.id}`;
  if (countLimit(day) >= CW_DOC.perDay) return res.status(429).json({ error: req.t('errors.api.slowDown'), code: 'docLimit' });
  const r = textFromFile({ kind: b.kind, buf: Buffer.from(b.data, 'base64') });
  if (r.ok || r.code === 'docEmpty') allow(day, CW_DOC.perDay, 864e5);
  if (!r.ok) return res.status(400).json({ error: req.t('errors.api.badRequest'), code: r.code });
  audit(req.user.id, 'game.doc_text', g.id, { kind: b.kind, chars: r.text.length, cut: r.cut });
  res.json({ text: r.text, cut: r.cut });
});
// Mistake Hunt's AI tools (docs/decisions.md "Mistake Hunt, Phase 2"; services/proof-ai.js): Power with AI passages,
// Check my passage and why lines. Teachers only (school staff and the platform admin; students, kids, family grown-ups
// and guests get 403 notAllowed); free teachers have a daily cap kept in the database (config.proofAiFreePerDay: 429
// code 'cap'; why lines count only for passages Oomba did not draft for them), Teacher plan holders none. Nothing here is stored: the teacher reviews everything before saving the set.
const proofAiReply = (req, res, r, data) => {
  if (r.ok) return res.json(data(r));
  const status = r.code === 'notAllowed' ? 403 : r.code === 'cap' ? 429 : 400;
  res.status(status).json({ error: req.t('errors.api.badRequest'), code: r.code, ...(r.code === 'cap' ? { left: 0 } : {}) });
};
router.post('/api/games/:id/proof/draft', requireUser, rateLimit('proof-ai', 30, 3600e3), async (req, res) => {
  const g = apiGame(req, res); if (!g) return;
  if (!docTextGame(g)) return res.status(404).json({ error: req.t('game.api.notFound') });
  const b = req.body || {};
  if (typeof b.topic !== 'string' || b.topic.length > 400) return res.status(400).json({ error: req.t('errors.api.badRequest'), code: 'topic' });
  const r = await proofAi.draftPassages(req.user, { topic: b.topic, grade: b.grade, length: b.length, n: b.n, types: b.types, count: b.count, seed: b.seed });
  proofAiReply(req, res, r, x => ({ passages: x.passages, ai: x.ai, ...(x.reason ? { reason: x.reason } : {}), ...(x.dropped ? { dropped: x.dropped } : {}), left: Number.isFinite(x.left) ? x.left : null }));
});
router.post('/api/games/:id/proof/scan', requireUser, rateLimit('proof-ai', 30, 3600e3), async (req, res) => {
  const g = apiGame(req, res); if (!g) return;
  if (!docTextGame(g)) return res.status(404).json({ error: req.t('game.api.notFound') });
  const b = req.body || {};
  if (typeof b.text !== 'string' || b.text.length > 8000) return res.status(400).json({ error: req.t('errors.api.badRequest'), code: 'short' });
  const r = await proofAi.scanPassage(req.user, { text: b.text });
  proofAiReply(req, res, r, x => ({ flags: x.flags, ai: x.ai, ...(x.reason ? { reason: x.reason } : {}), left: Number.isFinite(x.left) ? x.left : null }));
});
router.post('/api/games/:id/proof/why', requireUser, rateLimit('proof-ai', 30, 3600e3), async (req, res) => {
  const g = apiGame(req, res); if (!g) return;
  if (!docTextGame(g)) return res.status(404).json({ error: req.t('game.api.notFound') });
  const b = req.body || {};
  const r = await proofAi.whyLines(req.user, { grade: b.grade, items: b.items });
  proofAiReply(req, res, r, x => ({ lines: x.lines, ai: x.ai, ...(x.reason ? { reason: x.reason } : {}), left: Number.isFinite(x.left) ? x.left : null }));
});
// Oomba's chat on a passage set (docs/decisions.md "Mistake Hunt, Phase 3"; services/proof-chat.js): a turn is a job.
// The Teacher plan's people only (plan holders, testers, the platform admin); a teacher without the plan gets 403
// teacherPlan, anyone else 403 notAllowed. GET ?setId= -> { chat }; POST { setId?, text, set, retry? } -> { chat } (the
// answer comes later: the page asks again); POST .../applied { setId?, turnId }: the change was put in the builder.
const proofChatReply = (req, res, r) => {
  if (r.ok) { res.set('Cache-Control', 'no-store'); return res.json(r.chat ? { chat: r.chat } : { ok: true }); }
  const status = r.code === 'notAllowed' || r.code === 'teacherPlan' ? 403 : r.code === 'chatBusy' ? 409 : r.code === 'notFound' ? 404 : 400;
  res.status(status).json({ error: req.t('errors.api.badRequest'), code: r.code });
};
router.get('/api/games/:id/proof/chat', requireUser, (req, res) => {
  const g = apiGame(req, res); if (!g) return;
  if (!docTextGame(g)) return res.status(404).json({ error: req.t('game.api.notFound') });
  proofChatReply(req, res, proofChat.current(req.user, { setId: typeof req.query.setId === 'string' ? req.query.setId.slice(0, 40) : null }));
});
router.post('/api/games/:id/proof/chat', requireUser, rateLimit('proof-ai', 30, 3600e3), (req, res) => {
  const g = apiGame(req, res); if (!g) return;
  if (!docTextGame(g)) return res.status(404).json({ error: req.t('game.api.notFound') });
  const b = req.body || {};
  if (typeof b.text !== 'string' || b.text.length > 4000) return res.status(400).json({ error: req.t('errors.api.badRequest'), code: 'brief' });
  proofChatReply(req, res, proofChat.send(req.user, { setId: typeof b.setId === 'string' ? b.setId : null, text: b.text, set: b.set, retry: b.retry, lang: req.locale }));
});
router.post('/api/games/:id/proof/chat/applied', requireUser, (req, res) => {
  const g = apiGame(req, res); if (!g) return;
  if (!docTextGame(g)) return res.status(404).json({ error: req.t('game.api.notFound') });
  const b = req.body || {};
  proofChatReply(req, res, proofChat.applied(req.user, { setId: typeof b.setId === 'string' ? b.setId : null, turnId: b.turnId }));
});
// Print (services/game-print.js): a game's own data -> { html }, the printable page the play page prints for the frame, in
// the viewer's language. Crossword: its puzzle (its words and clues, the word bank option and the layout as numbers;
// services/crossword-print.js); Arithmetic Lab: an activity's problems as a question set's item (numbers and fixed
// words only; services/box-by-box-print.js). Anyone who can open the game may print (a student, a guest with the sample,
// a teacher's unsaved draft); the answer key only school staff (BRB.canAssign's check), and in Atlas Quest the grown-ups
// who may make a quiz (printKeyFor). Words pass the site's text
// filter as a saved set's do; nothing is kept. Body { doc }.
router.post('/api/games/:id/print', rateLimit('game-print', 20, 60e3, 'errors.api.slowDown', { byIp: true }), (req, res) => {
  const g = apiGame(req, res); if (!g) return;
  const printer = printGame(g) && PRINTERS.get(g.slug);
  // A Builder classroom activity (Oomba Canvas 1.2.0): its sheet from the version's own data; body { doc, v? } (v: the
  // version a Studio preview shows; the published one otherwise). The key: its maker and school staff only.
  if (!printer) {
    const v = canvasPrintVersion(g, req.user, (req.body || {}).v);
    if (!v) return res.status(404).json({ error: req.t('game.api.notFound') });
    const r = cleanCanvasPrintDoc((req.body || {}).doc);
    if (!r.ok) return res.status(400).json({ error: req.t('errors.api.badRequest'), code: r.code });
    if (r.doc.key && !canvasKeyFor(req.user, g)) return res.status(403).json({ error: req.t('errors.api.badRequest'), code: 'key' });
    // 1.4.0: a saved worksheet (doc.set): its own questions, from the published version that keeps worksheets
    let set = null;
    if (r.doc.set) {
      const cv = canvasSetVersion(g), s = cv && cv.id === v.id && gameSets.get(g.id, r.doc.set);
      if (!s) return res.status(404).json({ error: req.t('game.api.notFound'), code: 'noSet' });
      set = { items: s.items, code: gameSets.codeOf(s.id), link: `${requestOrigin(req)}/play/${g.slug}?chapter=${s.id}&lock=1` };
    }
    const out = canvasPrintHtml(v.html, r.doc, { t: req.t, dir: localeInfo(req.locale).dir, lang: req.locale, set });
    return out ? res.json({ html: out }) : res.status(404).json({ error: req.t('game.api.notFound') });
  }
  const r = printer.clean((req.body || {}).doc);
  if (!r.ok) return res.status(400).json({ error: req.t('errors.api.badRequest'), code: r.code });
  if (r.doc.key && !printKeyFor(req.user, g)) return res.status(403).json({ error: req.t('errors.api.badRequest'), code: 'key' });
  // The footer's class code and link: only for a set of this game that is on Oomba.
  const s = r.doc.set && gameSets.get(g.id, r.doc.set);
  const code = s ? s.id.slice(2).toUpperCase().replace(/^(.{5})/, '$1 ') : '';
  const link = s ? `${requestOrigin(req)}/play/${g.slug}?chapter=${s.id}&lock=1` : '';
  res.json({ html: printer.html(r.doc, { t: req.t, dir: localeInfo(req.locale).dir, lang: req.locale, code, link }) });
});
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
  adminAlert('report', { ref: g.id, summary: `A game was reported (${reason})`, url: '/admin?tab=reports' });   // the reason word, never the details
  // Only trustworthy distinct reporters count toward auto-hiding (not guests, not the owner): a few throwaway guest
  // reports must not silently take a game down. Guest reports are still stored for admin review.
  const open = q.get("SELECT COUNT(DISTINCT r.user_id) n FROM reports r JOIN users u ON u.id=r.user_id WHERE r.game_id=? AND r.status='open' AND u.is_guest=0 AND r.user_id!=?", g.id, g.owner_id).n;
  if (open >= config.reportsToHide && !g.hidden_reason && g.owner_id !== req.user.id) {
    q.run("UPDATE games SET hidden_reason='reports', updated_at=? WHERE id=?", now(), g.id);
    audit(null, 'game.auto_hidden', g.id, { reports: open });
    adminAlert('report', { ref: g.id, summary: 'A game was hidden after several reports', url: '/admin?tab=reports' });
  }
  res.json({ ok: true, message: t('game.report.thanks') });
});
