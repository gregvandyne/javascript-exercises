// Oomba Live pages (docs/decisions.md "Oomba Live"). Server-rendered shells: every state a page can be in is drawn
// here, translated, with hidden sections the page scripts (public/js/live-*.js) show and fill. Player pages (/join,
// /live/play) use the bare layout: no menus, no footer, nothing for sale, no sign-up prompts. The roster never links
// to anyone (no profiles, no messages). Element ids and data attributes are the page scripts' hooks
// (docs/live-protocol.md "Page hooks").
import { html, raw, jsonData } from './html.js';
import { appMark, wordmark, BRAND } from './brand.js';
import { qrSvg } from '../services/qr.js';
import { EMOTES, HOST_ACTIONS, SAY, BONUS_REASONS, ADD_SECS, EXTRA_TIME } from '../services/classlive-protocol.js';
import { PRESETS, presetsFor } from '../services/classlive-teams.js';
import { KEYS as SETTING_KEYS, QUIZ_ONLY, view as settingsView } from '../services/classlive-settings.js';
import { config } from '../config.js';
import { lookup } from '../i18n/index.js';
/** A message as written (not formatted), for page scripts that fill it in with their own values (plurals included):
 *  live-common.js fill(). */
const rawT = t => key => lookup(t.locale, key) ?? t(key);
import { REPORT_REASONS } from '../services/classlive-results.js';
import { kitSrc, KIT_VERSIONS, KIT_LATEST } from '../services/kit.js';

/** The kit the pages draw avatar portraits with (in a hidden same-origin frame, as on the Me page). */
const KIT = () => ({ src: kitSrc(), sri: KIT_VERSIONS[KIT_LATEST] });

/** Codes the join and play pages may need to explain, with their messages in the page's language. */
export const JOIN_CODES = ['notFound', 'badCode', 'locked', 'full', 'ended', 'signIn', 'notMember', 'removed', 'slowDown', 'takenDown', 'off'];
export const PLAY_CODES = ['removed', 'ended', 'full', 'locked', 'replaced', 'expired', 'restart', 'flood', 'takenDown', 'reconnecting', 'gone'];
const msgs = (t, prefix, codes) => Object.fromEntries(codes.map(c => [c, t(`${prefix}.${c}`)]));
/** A 7-digit code shown as two groups ("482 9137"), always left to right. */
export const groupCode = code => `${String(code).slice(0, 3)} ${String(code).slice(3)}`;

// ---------------------------------------------------------------- part 3 shared pieces (teams, messages, settings)
/** The 8 team shapes as an SVG sprite (<use href="#lv-shape-circle">): drawn shapes, never font glyphs. */
const SHAPE_PATHS = {
  circle: '<circle cx="12" cy="12" r="9"/>',
  triangle: '<path d="M12 3 22 20H2z"/>',
  square: '<rect x="4" y="4" width="16" height="16" rx="2"/>',
  heart: '<path d="M12 21s-8-5.2-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 10c0 5.8-8 11-8 11z"/>',
  star: '<path d="m12 2 3 6.5 7 .8-5.2 4.8 1.5 7L12 17.6 5.7 21.1l1.5-7L2 9.3l7-.8z"/>',
  hexagon: '<path d="M12 2.5 20.5 7.3v9.4L12 21.5 3.5 16.7V7.3z"/>',
  diamond: '<path d="M12 2 22 12 12 22 2 12z"/>',
  moon: '<path d="M15 3a9 9 0 1 0 6 15.7A8 8 0 0 1 15 3z"/>',
};
export const shapesSprite = () => raw(`<svg id="lv-shapes" width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false">${PRESETS.map(p => `<symbol id="lv-shape-${p.shape}" viewBox="0 0 24 24">${SHAPE_PATHS[p.shape]}</symbol>`).join('')}</svg>`);
/** Fixed lists, translated, for the page scripts (sent as indexes on the wire; never free text). */
const sayList = t => SAY.map(id => t(`live.say.${id}`));
const bonusList = t => BONUS_REASONS.map(id => t(`live.bonus.reason.${id}`));
/** Labels for every game setting and its values (the settings dialog and the landing). */
export function settingsText(t) {
  return {
    title: t('live.settings.title'), more: t('live.settings.more'), remembered: t('live.settings.remembered'), reset: t('live.settings.reset'), save: t('live.settings.save'),
    secs: t('live.settings.secs'), secsSet: t('live.settings.secsSet'), count: t('live.settings.count'), countAll: t('live.settings.countAll'),
    shuffleQ: t('live.settings.shuffleQ'), shuffleA: t('live.settings.shuffleA'), points: t('live.settings.points'), pointsSpeed: t('live.settings.pointsSpeed'), pointsAccuracy: t('live.settings.pointsAccuracy'),
    board: t('live.settings.board'), boardAll: t('live.settings.boardAll'), boardTop5: t('live.settings.boardTop5'), boardOff: t('live.settings.boardOff'),
    late: t('live.settings.late'), names: t('live.settings.names'), namesNames: t('live.settings.namesNames'), namesNicknames: t('live.settings.namesNicknames'), namesHidden: t('live.settings.namesHidden'), namesHint: t('live.settings.namesHint'),
    sound: t('live.settings.sound'), emotes: t('live.settings.emotes'),
  };
}
/** Team words the host, dashboard and class editor scripts show. */
export function teamText(t) {
  const k = ['heading', 'off', 'count', 'edit', 'done', 'more', 'scoring', 'scoringAvg', 'scoringAvgHint', 'scoringSum', 'unassigned', 'empty', 'emptyWarn', 'uneven', 'balance', 'shuffle', 'choose', 'chooseHint', 'lock', 'unlock', 'locked', 'useLast', 'noLast', 'forgetLast', 'forgetConfirm', 'saved', 'moveHere', 'selectHint', 'moved', 'you', 'pick', 'full', 'size', 'rank', 'score', 'perPlayer', 'board', 'podium', 'none', 'savedCount', 'notSaved'];
  const r = rawT(t);
  return Object.fromEntries(k.map(x => [x, r(`live.team.${x}`)]));
}
/** The game settings as form fields (the landing form and the settings dialogs). values: the current settings (with
 *  late); quiz: show the quiz-only ones; accounts: the room can show account names. Checkboxes carry a hidden "0"
 *  first, so an unticked box still says so (the form posts the last value). */
export function settingsFields(t, { values, quiz = true, accounts = false, idp = 'lv-st' }) {
  const sel = (k, opts) => html`<div class="field${QUIZ_ONLY.includes(k) ? ' lv-quiz-only' : ''}"${QUIZ_ONLY.includes(k) && !quiz ? raw(' hidden') : ''}><label for="${idp}-${k}">${t(`live.settings.${k}`)}</label><select id="${idp}-${k}" name="${k}">${opts.map(([v, label]) => html`<option value="${v}"${values[k] === v ? raw(' selected') : ''}>${label}</option>`)}</select></div>`;
  const box = k => html`<div class="lv-check-row${QUIZ_ONLY.includes(k) ? ' lv-quiz-only' : ''}"${QUIZ_ONLY.includes(k) && !quiz ? raw(' hidden') : ''}><input type="hidden" name="${k}" value="0"><label class="lv-check"><input type="checkbox" id="${idp}-${k}" name="${k}" value="1"${values[k] ? raw(' checked') : ''}> ${t(`live.settings.${k}`)}</label></div>`;
  const secs = SETTING_KEYS.secs.values.map(v => [v, v ? t('live.settings.secsN', { count: v }) : t('live.settings.secsSet')]);
  const count = SETTING_KEYS.count.values.map(v => [v, v ? String(v) : t('live.settings.countAll')]);
  const names = [...(accounts ? [['names', t('live.settings.namesNames')]] : []), ['nicknames', t('live.settings.namesNicknames')], ['hidden', t('live.settings.namesHidden')]];
  return html`<div class="lv-settings-main">
    ${sel('secs', secs)}${sel('count', count)}
    ${sel('points', [['speed', t('live.settings.pointsSpeed')], ['accuracy', t('live.settings.pointsAccuracy')]])}
    ${sel('board', [['all', t('live.settings.boardAll')], ['top5', t('live.settings.boardTop5')], ['off', t('live.settings.boardOff')]])}
  </div>
  <details class="lv-settings-more"><summary>${t('live.settings.more')}</summary>
    ${box('shuffleQ')}${box('shuffleA')}${box('late')}
    ${sel('names', names)}<p class="small muted">${t('live.settings.namesHint')}</p>
    ${box('sound')}${box('emotes')}
  </details>`;
}
/** The teams row: Off · 2 · 3 · 4 · 5 · 6 (a radio group), and how teams score. */
export function teamsRow(t, { n = 0, scoring = 'avg', name = 'teams', id = 'lv-teams-n', withScoring = true } = {}) {
  return html`<fieldset class="lv-teams-row" id="${id}"><legend>${t('live.team.heading')}</legend>
    <div class="lv-seg" role="radiogroup">${[0, 2, 3, 4, 5, 6].map(v => html`<label class="lv-seg-opt"><input type="radio" name="${name}" value="${v}"${v === n ? raw(' checked') : ''}> ${v ? String(v) : t('live.team.off')}</label>`)}</div>
    ${withScoring ? html`<div class="lv-team-scoring"><label class="lv-radio"><input type="radio" name="scoring" value="avg"${scoring !== 'sum' ? raw(' checked') : ''}> ${t('live.team.scoringAvg')}</label> <span class="small muted">${t('live.team.scoringAvgHint')}</span>
      <label class="lv-radio"><input type="radio" name="scoring" value="sum"${scoring === 'sum' ? raw(' checked') : ''}> ${t('live.team.scoringSum')}</label></div>` : ''}
  </fieldset>`;
}
const teamChip = (presets, x, extra = '') => { const p = presets[x.p]; return html`<span class="lv-team-chip" style="--team:${p.color};--team-ink:${p.ink}" data-team="${x.k}"><svg class="lv-shape" aria-hidden="true"><use href="#lv-shape-${p.shape}"/></svg><span aria-hidden="true">${p.icon}</span> <span class="lv-team-name">${p.name}</span>${extra}</span>`; };

const logo = () => html`<a class="lv-logo" href="/" aria-label="${BRAND}">${appMark()}<span class="logo-lockup" dir="ltr" aria-hidden="true">${wordmark()}</span></a>`;

/** /join: one box for a live game code (7 digits) or, when Google sign-in is on, a class code (6 characters). */
export function joinBody(req, { googleOn = false, bad = false, nicks = [] } = {}) {
  const t = req.t, u = req.user && !req.user.is_guest ? req.user : null;
  return html`<div class="lv lv-join" data-lv-page="join">
  <header class="lv-top">${logo()}</header>
  <section class="lv-panel" id="lv-code-step">
    <h1 class="lv-h1">${t('live.join.heading')}</h1>
    <p class="lv-intro">${t('live.join.intro')}</p>
    <form class="stack" id="lv-join" method="get" action="/join" novalidate data-lv-join>
      <div class="field"><label for="jc">${t(googleOn ? 'live.join.codeLabelBoth' : 'live.join.codeLabel')}</label>
        <input id="jc" name="code" class="lv-code-input" inputmode="${googleOn ? 'text' : 'numeric'}" autocomplete="off" autocapitalize="characters" spellcheck="false" maxlength="9" dir="ltr" required aria-describedby="lv-err"></div>
      <p class="err lv-err" id="lv-err" role="alert">${bad ? t('live.join.badCode') : ''}</p>
      <button class="btn btn-primary btn-block btn-big" type="submit">${t('live.join.go')}</button>
    </form>
    ${googleOn ? html`<p class="small muted center lv-classhint">${t('live.join.classHint')}</p>` : ''}
  </section>
  <section class="lv-panel" id="lv-who-step" hidden>
    <h2 class="lv-h2" id="lv-who-name">${u ? t('live.join.asYou', { name: u.display_name }) : ''}</h2>
    <label class="lv-check" id="lv-use-mine-row" hidden><input type="checkbox" id="lv-use-mine"> ${t('live.join.useMine')}</label>
    <button class="btn btn-primary btn-block btn-big" type="button" id="lv-as-me">${t('live.join.joinNow')}</button>
    <button class="btn btn-block" type="button" id="lv-as-guest" hidden>${t('live.join.notYou')}</button>
    <p class="err lv-err" id="lv-who-err" role="alert"></p>
  </section>
  <section class="lv-panel lv-card" id="lv-card-step" hidden>
    <h2 class="lv-h2">${t('live.join.cardHeading')}</h2>
    <div class="lv-portrait" id="lv-avatar" aria-hidden="true"></div>
    <p class="lv-nick" id="lv-nick" aria-live="polite"></p>
    <p class="small muted">${t('live.join.cardHint')}</p>
    <button class="btn btn-block" type="button" id="lv-reroll">🎲 ${t('live.join.reroll')}</button>
    <button class="btn btn-primary btn-block btn-big" type="button" id="lv-go">${t('live.join.ready')}</button>
    <p class="err lv-err" id="lv-card-err" role="alert"></p>
  </section>
  ${jsonData('lv-join-data', { signedIn: !!u, name: u ? u.display_name : '', googleOn, nicks, msgs: msgs(t, 'live.join', JOIN_CODES), signInHref: '/login?next=%2Fjoin', kit: KIT() })}
</div>`;
}

/** /live/play/:sid: the player's page. The seat token is in sessionStorage['lv:'+sid] (from /join). */
export function playBody(req, { sid, title, nicks, open = true } = {}) {
  const t = req.t;
  return html`<div class="lv lv-play" data-lv-page="play" data-sid="${sid}">
  <header class="lv-bar">
    <span class="lv-title" id="lv-title">${title}</span>
    <span class="lv-me" id="lv-me"><span class="lv-me-avatar" id="lv-me-avatar" aria-hidden="true"></span><span id="lv-me-name"></span></span>
    <span class="lv-me-team" id="lv-me-team" hidden><svg class="lv-shape" aria-hidden="true"><use href=""/></svg><span class="lv-me-team-name"></span><span class="lv-me-team-rank"></span></span>
    <button class="btn btn-sm" type="button" id="lv-simple" aria-pressed="false">${t('live.play.simpleView')}</button>
    <button class="btn btn-sm" type="button" id="lv-report-open" aria-haspopup="dialog">🚩 ${t('live.play.report')}</button>
    <button class="btn btn-sm" type="button" id="lv-leave" data-confirm="${t('live.play.leaveConfirm')}">${t('live.play.leave')}</button>
  </header>
  <p class="lv-phase" id="lv-phase" role="status" aria-live="polite">${open ? t('live.play.waiting') : t('live.play.gone')}</p>
  <p class="lv-say-banner" id="lv-say-banner" role="status" hidden></p>
  <p class="lv-toast lv-bonus-toast" id="lv-bonus-toast" role="status" hidden></p>
  <p class="sr-only" id="lv-team-live" aria-live="polite"></p>
  <section class="lv-panel lv-team-pick" id="lv-team-pick" hidden aria-labelledby="lv-team-pick-h">
    <h2 class="lv-h2" id="lv-team-pick-h">${t('live.play.pickTeam')}</h2>
    <div class="lv-team-pick-list" id="lv-team-pick-list" role="group" aria-labelledby="lv-team-pick-h"></div>
  </section>
  <button class="btn lv-read" type="button" id="lv-read" hidden>🔊 ${t('live.play.read')}</button>
  <div class="lv-stage" id="lv-stage" dir="ltr"></div>
  <div class="lv-eyes" id="lv-eyes" hidden><p class="lv-eyes-icon" aria-hidden="true">👀</p><p class="lv-eyes-text" role="alert">${t('live.eyes.cover')}</p><p class="small">${t('live.eyes.coverHint')}</p></div>
  <canvas class="lv-watch" id="lv-watch" hidden aria-label="${t('live.play.watchHint')}"></canvas>
  <div class="lv-emotes" id="lv-emotes" role="group" aria-label="${t('live.play.emotes')}">
    ${EMOTES.map((e, i) => html`<button class="btn btn-sm lv-emote" type="button" data-emote="${i}">${t(`live.emote.${e}`)}</button>`)}
  </div>
  <section class="lv-panel lv-end" id="lv-end" hidden aria-live="polite">
    <h2 class="lv-h2" id="lv-end-title">${t('live.play.ended')}</h2>
    <p class="lv-place" id="lv-place"></p>
    <ol class="lv-end-teams" id="lv-end-teams" hidden aria-label="${t('live.team.board')}"></ol>
    <p class="small muted" id="lv-again-wait" hidden>${t('live.play.again')}</p>
    <a class="btn btn-primary" id="lv-again" href="/join">${t('live.play.playAgain')}</a>
  </section>
  <dialog class="lv-dialog" id="lv-report" aria-labelledby="lv-report-h">
    <form method="dialog" class="stack">
      <h2 id="lv-report-h">${t('live.play.reportHeading')}</h2>
      ${REPORT_REASONS.map(r => html`<button class="btn btn-block" type="submit" value="${r}" data-report="${r}">${t(`live.play.reason.${r}`)}</button>`)}
      <button class="btn btn-block" type="submit" value="">${t('live.play.cancel')}</button>
    </form>
  </dialog>
  ${shapesSprite()}
  ${jsonData('lv-play-data', { sid, title, open, nicks, msgs: msgs(t, 'live.play', PLAY_CODES), phases: phaseText(t), emotes: EMOTES, thanks: rawT(t)('live.play.reportThanks'), place: rawT(t)('live.play.place'), late: rawT(t)('live.play.late'), watchHint: rawT(t)('live.play.watchHint'), kit: KIT(),
    presets: presetsFor(t), say: sayList(t), bonus: bonusList(t),
    text: { team: rawT(t)('live.play.team'), you: rawT(t)('live.team.you'), moved: rawT(t)('live.play.moved'), rank: rawT(t)('live.team.rank'), full: rawT(t)('live.team.full'), locked: rawT(t)('live.team.locked'), size: rawT(t)('live.team.size'), toastSeat: rawT(t)('live.bonus.toastSeat'), toastTeam: rawT(t)('live.bonus.toastTeam'), read: rawT(t)('live.play.read'), readAgain: rawT(t)('live.play.readAgain'), eyes: rawT(t)('live.play.eyes'), again: rawT(t)('live.play.again'), perPlayer: rawT(t)('live.team.perPlayer') } })}
</div>`;
}
const phaseText = t => ({ lobby: t('live.play.waiting'), loading: t('live.play.loading'), countdown: t('live.play.countdown'), playing: '', paused: t('live.play.paused'), between: t('live.play.between'), ended: t('live.play.ended') });

/** /live/host/:sid: the projector page. Code, QR, address, roster, controls, the game's host view. */
export function hostBody(req, { s, origin, token, nicks, classSignIn, teamsOn = false, hasLast = false }) {
  const t = req.t;
  const presets = presetsFor(t);
  const dashUrl = `${origin}/live/host/${s.id}/dash`;
  const st = settingsView(s.settings);
  const joinUrl = `${origin}/join#${s.code}`;
  const shown = `${origin.replace(/^https?:\/\//, '')}/join`;
  const keys = { start: 'S', pause: 'P', resume: 'P', next: 'N', skip: 'K', lock: 'L', unlock: 'L', end: 'E' };
  const control = a => html`<button class="btn lv-act lv-act-${a}" type="button" data-lv-act="${a}" aria-keyshortcuts="${keys[a]}"${['resume', 'unlock', 'pause', 'next', 'skip'].includes(a) ? raw(' hidden') : ''}${a === 'end' ? raw(` data-confirm="${t('live.host.endConfirm')}"`) : ''}>${t(`live.host.${a}`)}</button>`;
  return html`<div class="lv lv-host" data-lv-page="host" data-sid="${s.id}">
  <header class="lv-bar"><a class="btn btn-sm" href="/live"><span class="flip" aria-hidden="true">←</span> ${t('layout.back')}</a><span class="lv-title">${s.title}</span></header>
  <section class="lv-joinbox" id="lv-joinbox">
    <div class="lv-qr" id="lv-qr">${raw(qrSvg(joinUrl, { title: t('live.host.qrLabel') }))}</div>
    <div class="lv-codebox">
      <p class="lv-label">${t('live.host.code')}</p>
      <p class="lv-bigcode" id="lv-code" dir="ltr" translate="no">${groupCode(s.code)}</p>
      <p class="lv-joinat">${t('live.host.joinAt', { url: shown })}</p>
      ${classSignIn ? html`<p class="lv-joinat small">${t('live.host.signInFirst')}</p>` : ''}
      <p class="lv-count" id="lv-count" aria-live="polite">${t('live.host.count', { count: 0, max: s.settings.maxPlayers })}</p>
      <button class="btn btn-sm" type="button" id="lv-hide-code" aria-pressed="false">${t('live.host.hideCode')}</button>
    </div>
  </section>
  <div class="lv-stage lv-hoststage" id="lv-stage" dir="ltr"></div>
  <section class="lv-controls" id="lv-controls" aria-label="${t('live.host.controls')}">
    ${['start', 'pause', 'resume', 'next', 'skip', 'lock', 'unlock', 'end'].map(control)}
    <button class="btn lv-act lv-act-eyes" type="button" data-lv-act="eyes" aria-pressed="false" aria-keyshortcuts="Y">👀 ${t('live.host.eyes')}</button>
    ${s.quiz ? html`<span class="lv-time" id="lv-time" hidden>${ADD_SECS.map(x => html`<button class="btn btn-sm" type="button" data-lv-time="${x}">${t('live.time.add', { s: x })}</button>`)}</span>` : ''}
    <details class="lv-say" id="lv-say"><summary class="btn">💬 ${t('live.say.menu')}</summary><div class="lv-say-list" role="group" aria-label="${t('live.say.menu')}">${sayList(t).map((x, i) => html`<button class="btn btn-sm" type="button" data-lv-say="${i}">${x}</button>`)}</div></details>
    <button class="btn lv-act" type="button" data-lv-act="settings" aria-haspopup="dialog">⚙️ ${t('live.settings.open')}</button>
    <button class="btn lv-act" type="button" data-lv-act="sound" aria-pressed="${st.sound ? 'true' : 'false'}">${t(st.sound ? 'live.host.soundOn' : 'live.host.soundOff')}</button>
    <button class="btn lv-act" type="button" data-lv-act="dash" aria-haspopup="dialog">📱 ${t('live.host.teacherView')}</button>
    <p class="small muted" id="lv-autolock"${s.settings.autoLock ? '' : raw(' hidden')}>${t('live.host.autoLock')}</p>
  </section>
  <p class="lv-eyes-banner" id="lv-eyes-banner" role="status" hidden>👀 ${t('live.eyes.banner')}</p>
  <p class="lv-say-banner lv-say-big" id="lv-say-banner" role="status" hidden></p>
  <p class="lv-toast" id="lv-bonus-toast" role="status" hidden></p>
  ${teamsOn ? html`<section class="lv-teamsbox" id="lv-teamsbox" aria-labelledby="lv-teams-h">
    <h2 class="lv-h2" id="lv-teams-h">${t('live.team.heading')}</h2>
    ${teamsRow(t, { n: s.teams && s.teams.on ? s.teams.n : 0, name: 'lv-teams', withScoring: false })}
    <ul class="lv-teams-summary" id="lv-teams-summary"></ul>
    <button class="btn btn-sm" type="button" id="lv-teams-edit" aria-haspopup="dialog" hidden>${t('live.team.edit')}</button>
    <ol class="lv-team-board" id="lv-team-board" hidden aria-label="${t('live.team.board')}"></ol>
  </section>
  <dialog class="lv-dialog lv-teams-sheet" id="lv-teams-sheet" aria-labelledby="lv-teams-sheet-h">
    <div class="lv-sheet-head"><h2 id="lv-teams-sheet-h">${t('live.team.heading')}</h2><button class="btn btn-primary" type="button" id="lv-teams-done">${t('live.team.done')}</button></div>
    <div class="lv-sheet-tools" role="toolbar" aria-label="${t('live.team.heading')}">
      <button class="btn" type="button" data-lv-tm="balance">⚖️ ${t('live.team.balance')}</button>
      <button class="btn" type="button" data-lv-tm="shuffle">🔀 ${t('live.team.shuffle')}</button>
      ${hasLast ? html`<button class="btn" type="button" data-lv-tm="last">${t('live.team.useLast')}</button>` : ''}
      <details class="lv-teams-more" id="lv-teams-more"><summary class="btn">${t('live.team.more')}</summary>
        <div id="lv-teams-presets" class="lv-teams-presets"></div>
        <fieldset class="lv-team-scoring"><legend>${t('live.team.scoring')}</legend>
          <label class="lv-radio"><input type="radio" name="lv-scoring" value="avg" checked> ${t('live.team.scoringAvg')}</label> <span class="small muted">${t('live.team.scoringAvgHint')}</span>
          <label class="lv-radio"><input type="radio" name="lv-scoring" value="sum"> ${t('live.team.scoringSum')}</label></fieldset>
        <label class="lv-check"><input type="checkbox" id="lv-teams-choose"> ${t('live.team.choose')}</label> <span class="small muted">${t('live.team.chooseHint')}</span>
        <p><button class="btn btn-sm" type="button" data-lv-tm="lock">🔒 ${t('live.team.lock')}</button> <button class="btn btn-sm" type="button" data-lv-tm="unlock" hidden>${t('live.team.unlock')}</button></p>
      </details>
    </div>
    <p class="notice warn" id="lv-teams-warn" role="status" hidden></p>
    <p class="small muted">${t('live.team.selectHint')}</p>
    <div class="lv-team-cols" id="lv-teams-cols"></div>
    <div class="lv-unassigned" id="lv-teams-unassigned" hidden><h3 class="lv-h3">${t('live.team.unassigned')}</h3><div class="lv-chips"></div></div>
    <p class="sr-only" id="lv-teams-live" aria-live="polite"></p>
    <template id="lv-team-tpl"><section class="lv-team" data-team=""><h3 class="lv-team-head"><svg class="lv-shape" aria-hidden="true"><use href=""/></svg><span class="lv-team-icon" aria-hidden="true"></span><span class="lv-team-name"></span><span class="lv-team-size"></span></h3><div class="lv-chips"></div><p class="small muted lv-team-empty" hidden>${t('live.team.empty')}</p><button class="btn btn-sm lv-move-here" type="button" data-lv-move="" hidden>${t('live.team.moveHere')}</button></section></template>
    <template id="lv-chip-tpl"><button class="lv-chip" type="button" data-seat="" aria-pressed="false"><span class="lv-chip-avatar" aria-hidden="true"></span><span class="lv-chip-name"></span></button></template>
  </dialog>` : ''}
  <dialog class="lv-dialog" id="lv-settings" aria-labelledby="lv-settings-h">
    <form method="dialog" class="stack" id="lv-settings-form">
      <h2 id="lv-settings-h">${t('live.settings.title')}</h2>
      ${settingsFields(t, { values: st, quiz: !!s.quiz, accounts: s.nameMode === 'accounts', idp: 'lv-hs' })}
      <p class="small muted">${t('live.settings.remembered')}</p>
      <button class="btn btn-primary" type="submit" value="save">${t('live.settings.save')}</button>
    </form>
  </dialog>
  <dialog class="lv-dialog" id="lv-dash-qr" aria-labelledby="lv-dash-qr-h">
    <form method="dialog" class="stack">
      <h2 id="lv-dash-qr-h">${t('live.dash.qrTitle')}</h2>
      <div class="lv-qr">${raw(qrSvg(dashUrl, { title: t('live.dash.qrTitle') }))}</div>
      <p class="small" dir="ltr"><a href="/live/host/${s.id}/dash" target="_blank" rel="noopener">${dashUrl.replace(/^https?:\/\//, '')}</a></p>
      <p class="small muted">${t('live.dash.qrHint')}</p>
      <button class="btn" type="submit">${t('live.play.cancel')}</button>
    </form>
  </dialog>
  <section class="lv-panel lv-podium-hold" id="lv-podium-hold" hidden><button class="btn btn-primary" type="button" id="lv-see-results">${t('live.host.seeResultsNow')}</button></section>
  <section class="lv-rosterbox" aria-labelledby="lv-roster-h">
    <h2 class="lv-h2" id="lv-roster-h">${t('live.host.players')}</h2>
    <p class="muted" id="lv-empty">${t('live.host.empty')}</p>
    <ul class="lv-roster" id="lv-roster"></ul>
    <template id="lv-player-tpl"><li class="lv-player"><span class="lv-p-avatar" aria-hidden="true"></span><span class="lv-p-name"></span><span class="lv-p-marks"></span><button class="btn btn-sm lv-p-remove" type="button" data-lv-kick>${t('live.host.remove')}</button></li></template>
  </section>
  <p class="notice warn" id="lv-reports" hidden role="status">${t('live.host.reports')}</p>
  ${shapesSprite()}
  ${jsonData('lv-host-data', {
    sid: s.id, tok: token, code: s.code, joinUrl, audience: s.audience, nameMode: s.nameMode, mode: s.mode, title: s.title, max: s.settings.maxPlayers, nicks,
    actions: HOST_ACTIONS, results: `/live/results/${s.id}`, kit: KIT(),
    quiz: !!s.quiz, teamsOn, hasLast, presets, say: sayList(t), bonus: bonusList(t), settings: st, quizOnly: QUIZ_ONLY, dashUrl, podiumHoldMs: 6000,
    text: { removeConfirm: rawT(t)('live.host.removeConfirm'), ready: rawT(t)('live.host.ready'), late: rawT(t)('live.host.late'), watching: rawT(t)('live.host.watching'), offline: rawT(t)('live.host.offline'), showCode: rawT(t)('live.host.showCode'), hideCode: rawT(t)('live.host.hideCode'), locked: rawT(t)('live.host.locked'), count: rawT(t)('live.host.count'), answers: rawT(t)('live.host.answers'), phases: phaseText(t),
      revealNow: rawT(t)('live.time.revealNow'), waiting: rawT(t)('live.time.waiting'), eyesOn: rawT(t)('live.eyes.on'), eyesOff: rawT(t)('live.eyes.off'), soundOn: rawT(t)('live.host.soundOn'), soundOff: rawT(t)('live.host.soundOff'), toastTeam: rawT(t)('live.bonus.toastTeam'), toastSeat: rawT(t)('live.bonus.toastSeat'), team: teamText(t), settings: settingsText(t) },
  })}
</div>`;
}

/** /live/host/:sid/dash: the teacher's dashboard (phone first). The host only; nothing here reaches the projector. */
export function dashBody(req, { s, token, nicks, presets, saveSupport = false }) {
  const t = req.t;
  const st = settingsView(s.settings);
  const act = (a, label, extra = '') => html`<button class="btn btn-sm lv-act lv-act-${a}" type="button" data-lv-act="${a}"${raw(extra)}>${label}</button>`;
  const tabs = ['players', 'question', 'teams', 'messages', 'settings'];
  return html`<div class="lv lv-dash" data-lv-page="dash" data-sid="${s.id}">
  <header class="lv-dash-bar">
    <span class="lv-title">${s.title}</span>
    <span class="lv-dash-code" id="lv-dash-code" dir="ltr" translate="no">${groupCode(s.code)}</span>
    <span class="lv-phase" id="lv-dash-phase" role="status" aria-live="polite"></span>
    <div class="lv-dash-acts" role="toolbar" aria-label="${t('live.host.controls')}">
      ${act('start', t('live.host.start'))}${act('pause', t('live.host.pause'), ' hidden')}${act('resume', t('live.host.resume'), ' hidden')}
      ${act('next', s.quiz ? t('live.time.revealNow') : t('live.host.next'), ' hidden')}${act('skip', t('live.host.skip'), ' hidden')}
      ${s.quiz ? html`<button class="btn btn-sm" type="button" data-lv-time="10" hidden>${t('live.time.add', { s: 10 })}</button>` : ''}
      ${act('eyes', `👀 ${t('live.host.eyes')}`, ' aria-pressed="false"')}
      ${act('lock', t('live.host.lock'))}${act('unlock', t('live.host.unlock'), ' hidden')}
      ${act('end', t('live.host.end'), ` data-confirm="${t('live.host.endConfirm')}"`)}
    </div>
  </header>
  <p class="notice warn" id="lv-dash-notice" hidden>${t('live.dash.notice')} <button class="btn btn-sm" type="button" id="lv-dash-notice-ok">${t('live.team.done')}</button></p>
  <div class="lv-tabs" role="tablist" aria-label="${t('live.dash.title')}">
    ${tabs.map((x, i) => html`<button class="lv-tab" type="button" role="tab" id="lv-tab-${x}-btn" data-lv-tab="${x}" aria-controls="lv-tab-${x}" aria-selected="${i === 0 ? 'true' : 'false'}"${x === 'question' && !s.quiz ? raw(' hidden') : ''}>${t(`live.dash.tab${x[0].toUpperCase()}${x.slice(1)}`)}</button>`)}
  </div>
  <section class="lv-tabpanel" role="tabpanel" id="lv-tab-players" aria-labelledby="lv-tab-players-btn">
    <button class="btn btn-sm" type="button" id="lv-dash-help-toggle" aria-pressed="false">${t('live.dash.showHelp')}</button>
    <p class="muted" id="lv-dash-empty">${t('live.host.empty')}</p>
    <ul class="lv-dash-players" id="lv-dash-players"></ul>
    <template id="lv-dash-card-tpl"><li class="lv-dash-card" data-seat=""><span class="lv-p-avatar" aria-hidden="true"></span><span class="lv-p-name"></span><span class="lv-dash-team"></span><span class="lv-dash-status"></span><span class="lv-dash-help" hidden></span><span class="lv-dash-sup" hidden></span><button class="btn btn-sm lv-dash-menu" type="button" aria-haspopup="dialog">⋯</button></li></template>
  </section>
  <section class="lv-tabpanel" role="tabpanel" id="lv-tab-question" aria-labelledby="lv-tab-question-btn" hidden>
    <p class="lv-dash-q" id="lv-dash-q"></p>
    <button class="btn btn-sm" type="button" id="lv-dash-answer-toggle" aria-pressed="false">${t('live.dash.showAnswer')}</button>
    <ol class="lv-dash-bars" id="lv-dash-bars" type="A"></ol>
    <p id="lv-dash-answered" aria-live="polite"></p>
    <p class="small muted" id="lv-dash-extra" hidden></p>
  </section>
  <section class="lv-tabpanel" role="tabpanel" id="lv-tab-teams" aria-labelledby="lv-tab-teams-btn" hidden>
    <ol class="lv-team-board" id="lv-dash-teams"></ol>
    <p class="small muted" id="lv-dash-noteams">${t('live.team.none')}</p>
  </section>
  <section class="lv-tabpanel" role="tabpanel" id="lv-tab-messages" aria-labelledby="lv-tab-messages-btn" hidden>
    <div class="lv-say-list" role="group" aria-label="${t('live.say.menu')}">${sayList(t).map((x, i) => html`<button class="btn" type="button" data-lv-say="${i}">${x}</button>`)}</div>
  </section>
  <section class="lv-tabpanel" role="tabpanel" id="lv-tab-settings" aria-labelledby="lv-tab-settings-btn" hidden>
    <form class="stack" id="lv-dash-settings">${settingsFields(t, { values: st, quiz: !!s.quiz, accounts: s.nameMode === 'accounts', idp: 'lv-ds' })}
      <button class="btn btn-primary" type="submit">${t('live.settings.save')}</button></form>
  </section>
  <dialog class="lv-dialog" id="lv-dash-player" aria-labelledby="lv-dash-player-h">
    <form method="dialog" class="stack">
      <h2 id="lv-dash-player-h"></h2>
      <fieldset><legend>${t('live.bonus.give')}</legend><div class="lv-say-list">${bonusList(t).map((x, i) => html`<button class="btn btn-sm" type="button" data-lv-bonus="${i}">${x}</button>`)}</div></fieldset>
      <div class="field" id="lv-dash-move-row"><label for="lv-dash-move">${t('live.dash.move')}</label><select id="lv-dash-move"></select></div>
      <button class="btn btn-sm" type="button" id="lv-dash-rename">${t('live.dash.rename')}</button>
      <fieldset id="lv-dash-support"><legend>${t('live.dash.support')}</legend>
        <p class="small muted">${t('live.dash.supportPrivate')}</p>
        <div class="lv-seg" role="radiogroup" aria-label="${t('live.dash.supportTime')}">${EXTRA_TIME.map(x => html`<label class="lv-seg-opt"><input type="radio" name="lv-acc-time" value="${x}"${x === 100 ? raw(' checked') : ''}> ${t(`live.dash.time${x}`)}</label>`)}</div>
        <label class="lv-check"><input type="checkbox" id="lv-acc-read"> ${t('live.dash.read')}</label>
        <label class="lv-check"><input type="checkbox" id="lv-acc-simple"> ${t('live.dash.simple')}</label>
        ${saveSupport ? html`<label class="lv-check"><input type="checkbox" id="lv-acc-save"> ${t('live.dash.remember')}</label>` : ''}
        <p class="small muted">${t('live.dash.supportWaits')}</p>
        <button class="btn btn-sm" type="button" id="lv-acc-apply">${t('live.settings.save')}</button>
      </fieldset>
      <button class="btn btn-sm lv-p-remove" type="button" id="lv-dash-remove" data-confirm="${t('live.host.removeConfirm')}">${t('live.host.remove')}</button>
      <button class="btn" type="submit">${t('live.play.cancel')}</button>
    </form>
  </dialog>
  <p class="lv-toast" id="lv-bonus-toast" role="status" hidden></p>
  ${shapesSprite()}
  ${jsonData('lv-dash-data', {
    sid: s.id, tok: token, code: s.code, audience: s.audience, mode: s.mode, quiz: !!s.quiz, title: s.title, nicks, presets, say: sayList(t), bonus: bonusList(t), settings: st, quizOnly: QUIZ_ONLY,
    teamsOn: !!config.liveTeams, saveSupport, results: `/live/results/${s.id}`, kit: KIT(),
    text: { phases: phaseText(t), answered: rawT(t)('live.dash.answered'), thinking: rawT(t)('live.dash.thinking'), offline: rawT(t)('live.dash.offline'), late: rawT(t)('live.dash.late'), needsHelp: rawT(t)('live.dash.needsHelp'),
      showHelp: rawT(t)('live.dash.showHelp'), hideHelp: rawT(t)('live.dash.hideHelp'), why: { lowScore: rawT(t)('live.dash.why.lowScore'), wrongRun: rawT(t)('live.dash.why.wrongRun'), missRun: rawT(t)('live.dash.why.missRun') },
      extraWaiting: rawT(t)('live.dash.extraWaiting'), showAnswer: rawT(t)('live.dash.showAnswer'), hideAnswer: rawT(t)('live.dash.hideAnswer'), answers: rawT(t)('live.host.answers'), revealNow: rawT(t)('live.time.revealNow'),
      eyesOn: rawT(t)('live.eyes.on'), eyesOff: rawT(t)('live.eyes.off'), toastSeat: rawT(t)('live.bonus.toastSeat'), toastTeam: rawT(t)('live.bonus.toastTeam'), noTeam: rawT(t)('live.team.unassigned'), team: teamText(t),
      supportBadge: rawT(t)('live.dash.support'), next: rawT(t)('live.host.next'), bonusGive: rawT(t)('live.bonus.give'), saved: rawT(t)('live.dash.saved') },
  })}
</div>`;
}

/** /live: pick a game or mode, a question set, who can join, then open the room (a data-api form: works without the
 *  page script). */
export function landingBody(req, { modes, groups, sets, starters, classes, family, pre, recent, maxPlayers, origin, prefs = null, teamsOn = false }) {
  const t = req.t;
  // The host's remembered defaults fill the settings in (the room's own defaults otherwise; the server applies the
  // room's rules again when it opens).
  const values = { secs: 0, count: 0, shuffleQ: false, shuffleA: true, points: 'speed', board: 'all', late: true, names: classes.length ? 'names' : 'nicknames', sound: true, emotes: true, ...((prefs && prefs.settings) || {}) };
  const radio = (name, value, checked) => raw(`<input type="radio" name="${name}" value="${value}"${checked ? ' checked' : ''}>`);
  const card = (value, icon, title, text, checked, quiz = false, teams = false) => html`<label class="lv-pick"${quiz ? raw(' data-quiz="1"') : ''}>${radio('pick', value, checked)}<span class="lv-pick-icon" aria-hidden="true">${icon}</span><span class="lv-pick-t">${title}</span>${text ? html`<span class="small muted">${text}</span>` : ''}${teams && teamsOn ? html`<span class="badge lv-teams-badge">${t('live.team.madeFor')}</span>` : ''}</label>`;
  const anyPicked = !!pre.pick;
  const firstGame = (groups.find(g => g.games.length) || { games: [{}] }).games[0].id;
  const audiences = [classes.length ? 'class' : null, family ? 'family' : null, 'open'].filter(Boolean);
  const audDefault = pre.audience && audiences.includes(pre.audience) ? pre.audience : audiences[0];
  return html`<div class="lv lv-landing" data-lv-page="landing">
  <h1>${t('live.landing.heading')}</h1>
  <p class="muted">${t('live.landing.intro', { url: `${origin.replace(/^https?:\/\//, '')}/join` })}</p>
  <form class="stack" id="lv-new" data-api="/api/live/sessions" novalidate>
    ${modes.length ? html`<fieldset class="lv-group"><legend>${t('live.landing.modes')}</legend><div class="lv-picks">
      ${modes.map((m, i) => card(`mode:${m.id}`, m.icon, m.title, m.text, pre.pick ? pre.pick === `mode:${m.id}` : i === 0 && !anyPicked, true, true))}
    </div></fieldset>` : ''}
    ${groups.map(g => html`<fieldset class="lv-group"><legend>${t(`live.landing.${g.key}`)}</legend>${g.games.length ? html`<div class="lv-picks">${g.games.map(x => card(`game:${x.id}`, x.icon, x.title, x.quiz ? t('live.landing.usesQuestions') : '', anyPicked ? pre.pick === `game:${x.id}` : !modes.length && x.id === firstGame, x.quiz, x.teams))}</div>` : html`<p class="small muted">${t('live.landing.none')}</p>`}</fieldset>`)}
    <fieldset class="lv-group" id="lv-sets"><legend>${t('live.landing.questions')}</legend>
      <div class="field"><label for="lv-set">${t('live.landing.questionsLabel')}</label>
        <select id="lv-set" name="set">
          <optgroup label="${t('live.landing.starters')}">${starters.map(s => html`<option value="starter:${s.id}"${pre.set === `starter:${s.id}` ? raw(' selected') : ''}>${s.title}</option>`)}</optgroup>
          ${sets.mine.length ? html`<optgroup label="${t('live.landing.mySets')}">${sets.mine.map(s => html`<option value="set:${s.id}"${s.ready ? '' : raw(' disabled')}${pre.set === `set:${s.id}` ? raw(' selected') : ''}>${s.title}${s.ready ? '' : ` (${t('live.sets.draft')})`}</option>`)}</optgroup>` : ''}
          ${sets.school.length ? html`<optgroup label="${t('live.landing.schoolSets')}">${sets.school.map(s => html`<option value="set:${s.id}"${s.ready ? '' : raw(' disabled')}>${s.title}</option>`)}</optgroup>` : ''}
        </select></div>
      <a class="small" href="/live/sets">${t('live.landing.newSet')}</a>
    </fieldset>
    <fieldset class="lv-group"><legend>${t('live.landing.who')}</legend>
      ${audiences.map(a => html`<label class="lv-radio">${radio('audience', a, a === audDefault)} ${t(`live.landing.audience.${a}`)}</label>`)}
      ${classes.length ? html`<div class="field"><label for="lv-class">${t('live.landing.classPick')}</label><select id="lv-class" name="classId">${classes.map(c => html`<option value="${c.id}"${pre.classId === c.id ? raw(' selected') : ''}>${c.name}</option>`)}</select></div>` : ''}
      <div class="field"><label for="lv-max">${t('live.landing.maxPlayers')}</label><input id="lv-max" name="maxPlayers" type="number" inputmode="numeric" min="2" max="${maxPlayers}" value="${maxPlayers}"></div>
      <p class="small muted">${t('live.landing.openHint')}</p>
    </fieldset>
    ${teamsOn ? html`<div class="lv-group">${teamsRow(t, { n: prefs && prefs.teams && prefs.teams.on ? prefs.teams.n : 0, scoring: prefs && prefs.teams ? prefs.teams.scoring : 'avg' })}</div>` : ''}
    <details class="lv-group lv-settings-landing" id="lv-settings-landing"><summary>⚙️ ${t('live.settings.title')}</summary>
      ${settingsFields(t, { values, quiz: true, accounts: classes.length > 0, idp: 'lv-ls' })}
      <p class="small muted">${t('live.settings.remembered')}${prefs ? html` <button class="btn btn-sm" type="button" id="lv-prefs-reset" data-href="/api/live/prefs">${t('live.settings.reset')}</button>` : ''}</p>
    </details>
    ${pre.clId ? html`<input type="hidden" name="clId" value="${pre.clId}"><input type="hidden" name="stepId" value="${pre.stepId || ''}">` : ''}
    <p class="err form-err" aria-live="polite"></p>
    <button class="btn btn-primary btn-big" type="submit">${t('live.landing.open')}</button>
  </form>
  ${recent.length ? html`<section class="lv-group"><h2>${t('live.landing.recent')}</h2><ul class="lv-recent">${recent.map(r => html`<li><a href="/live/results/${r.id}">${r.title || t('live.results.title')}</a> <span class="small muted">${t('live.results.playersCount', { count: r.players })}</span></li>`)}</ul></section>` : ''}
</div>`;
}

/**
 * Results: the session's own summary (from memory, 10 minutes) or a saved run. Split for a projector (the host's page
 * moves here at the end, often on the class's screen): a class-safe part (team podium and table, hardest questions,
 * question review: no student names) and "Student details" (a <details>, closed): marks, bonus, needs help, CSV.
 * Teams that never had a member are left out. Every name a page shows for a team is its preset's, in the viewer's
 * language.
 */
export function resultsBody(req, { id = '', title, mode = '', players = [], items = [], teams = [], scoring = null, guests = 0, nicks = [], csv = null, saved = false, gradebook = false, nameMode = 'nicknames',
  presets = [], still = 0, quiz = false, againRun = false, homework = false, setId = null, classes = [] }) {
  const t = req.t;
  const nameOf = p => (typeof p.name === 'number' ? nicks[p.name] || '' : p.name || '');
  const chip = k => { const x = teams.find(r => r.k === k); return x && presets[x.p] ? teamChip(presets, x) : ''; };
  const podium = teams.filter(x => x.rank >= 1 && x.rank <= 3).slice(0, 3);
  const hard = items.filter(it => it.answered).sort((a, b) => (a.right / a.answered) - (b.right / b.answered) || a.i - b.i).slice(0, 3);
  const L = i => String.fromCharCode(65 + i);
  const pctOf = (n, d) => (d ? Math.round((100 * n) / d) : 0);
  const mark = c => (c === '1' ? html`<span class="lv-mark lv-mark-right" title="${t('live.results.markRight')}">✓<span class="sr-only"> ${t('live.results.markRight')}</span></span>`
    : c === '0' ? html`<span class="lv-mark lv-mark-wrong" title="${t('live.results.markWrong')}">✗<span class="sr-only"> ${t('live.results.markWrong')}</span></span>`
      : html`<span class="lv-mark lv-mark-none" title="${t('live.results.markNone')}">–<span class="sr-only"> ${t('live.results.markNone')}</span></span>`);
  const missedOk = quiz && items.some(it => Array.isArray(it.choices) && it.answered && it.right < it.answered);
  const help = players.filter(p => p.help);
  return html`<div class="lv lv-results" data-lv-page="results" data-run="${id}">
  ${shapesSprite()}
  <h1>${t('live.results.heading', { title })}</h1>
  <p class="muted">${t('live.results.playersCount', { count: players.length })}</p>
  ${gradebook ? html`<p class="notice good">${t('live.results.gradebook')}</p>` : ''}
  ${teams.length ? html`<section class="lv-group lv-results-teams" aria-labelledby="lv-rt-h">
    <h2 id="lv-rt-h">${t('live.team.podium')}</h2>
    <ol class="lv-team-podium" id="lv-team-podium">${podium.map(x => html`<li class="lv-step lv-step-${x.rank}" style="--team:${presets[x.p].color};--team-ink:${presets[x.p].ink}"><span class="lv-step-rank">${x.rank}</span>${teamChip(presets, x)}<span class="lv-step-score">${x.score}</span></li>`)}</ol>
    <div class="lv-table-wrap"><table class="table lv-table" id="lv-team-table"><caption class="small muted">${t('live.results.rankedBy', { how: t(scoring === 'sum' ? 'live.team.scoringSum' : 'live.team.scoringAvg') })}</caption><thead><tr><th scope="col">${t('live.results.rank')}</th><th scope="col">${t('live.results.team')}</th><th scope="col"${scoring === 'sum' ? raw(' aria-sort="descending" class="lv-rankby"') : ''}>${t('live.results.sum')}</th><th scope="col"${scoring !== 'sum' ? raw(' aria-sort="descending" class="lv-rankby"') : ''}>${t('live.results.avg')}</th><th scope="col">${t('live.results.teamPlayers')}</th></tr></thead>
      <tbody>${teams.map(x => html`<tr><td>${x.rank || '–'}</td><td>${teamChip(presets, x)}</td><td${scoring === 'sum' ? raw(' class="lv-rankby"') : ''}>${x.sum}</td><td${scoring !== 'sum' ? raw(' class="lv-rankby"') : ''}>${x.avg}</td><td>${x.size}</td></tr>`)}</tbody></table></div>
  </section>` : ''}
  ${hard.length && quiz ? html`<section class="lv-group" aria-labelledby="lv-hard-h"><h2 id="lv-hard-h">${t('live.results.hardest')}</h2>
    <ol class="lv-hardest" id="lv-hardest">${hard.map(it => html`<li>${it.q ? html`<span>${it.q}</span> ` : ''}<span class="small">${t('live.results.accuracy', { right: it.right, answered: it.answered })}</span>${it.topWrong || it.top_wrong ? html` <span class="small muted">${t('live.results.topWrong', { answer: it.topWrong || it.top_wrong })}</span>` : ''}</li>`)}</ol></section>` : ''}
  ${items.length ? html`<section class="lv-group" aria-labelledby="lv-review-h"><h2 id="lv-review-h">${quiz ? t('live.results.review') : t('live.results.questions')}</h2>
    <ol class="lv-items lv-review" id="lv-review">${items.map(it => html`<li class="lv-review-item">${it.q ? html`<p class="lv-review-q">${it.q}</p>` : ''}
      <p class="small">${t('live.results.accuracy', { right: it.right, answered: it.answered })}${it.topWrong || it.top_wrong ? html` · <span class="muted">${t('live.results.topWrong', { answer: it.topWrong || it.top_wrong })}</span>` : ''}</p>
      ${Array.isArray(it.choices) ? html`<div class="lv-bars" role="list">${it.choices.map((c, i) => html`<div role="listitem" class="lv-bar${i === it.answer ? ' lv-bar-right' : ''}"><span class="lv-bar-label">${L(i)}. ${c}${i === it.answer ? html` <span class="lv-bar-ok">✓ ${t('live.results.markRight')}</span>` : ''}</span><span class="lv-bar-fill" style="--w:${pctOf((it.counts || [])[i] || 0, it.answered)}%"></span><span class="lv-bar-n">${(it.counts || [])[i] || 0} (${pctOf((it.counts || [])[i] || 0, it.answered)}%)</span></div>`)}</div>` : ''}
    </li>`)}</ol></section>` : ''}
  ${guests ? html`<p class="muted">${t('live.results.guests', { count: guests })}</p>` : ''}
  <div class="lv-results-acts" id="lv-results-acts">
    ${missedOk ? html`<form class="lv-inline" data-api="/api/live/sessions"><input type="hidden" name="fromRun" value="${id}"><input type="hidden" name="only" value="missed"><button class="btn" type="submit">${t('live.results.playMissed')}</button><p class="err form-err" aria-live="polite"></p></form>` : ''}
    ${still ? html`<form class="lv-inline" data-api="/api/live/sessions" id="lv-play-again"><input type="hidden" name="again" value="${id}"><button class="btn btn-primary" type="submit">${t('live.results.playAgain')}</button> <span class="small muted" id="lv-still">${t('live.results.stillHere', { count: still })}</span><p class="err form-err" aria-live="polite"></p></form>`
      : againRun ? html`<form class="lv-inline" data-api="/api/live/sessions"><input type="hidden" name="againRun" value="${id}"><button class="btn" type="submit">${t('live.results.playAgainTeams')}</button><p class="err form-err" aria-live="polite"></p></form>` : ''}
    <a class="btn" href="/live">${t('live.results.newGame')}</a>
    <button class="btn" type="button" id="lv-print" data-print>${t('live.results.print')}</button>
  </div>
  ${homework && setId && quiz && classes.length ? html`<details class="lv-group lv-homework" id="lv-homework"><summary class="btn">📚 ${t('live.results.homework')}</summary>
    <form class="stack" data-api="/api/live/sets/${setId}/homework" novalidate>
      <p class="small muted">${t('live.homework.hint')}</p>
      <div class="field"><label for="lv-hw-class">${t('live.landing.classPick')}</label><select id="lv-hw-class" name="classId">${classes.map(c => html`<option value="${c.id}">${c.name}</option>`)}</select></div>
      <div class="field"><label for="lv-hw-due">${t('live.homework.due')}</label><input class="input" type="date" id="lv-hw-due" name="dueAt"></div>
      <p class="err form-err" aria-live="polite"></p>
      <button class="btn btn-primary" type="submit">${t('live.homework.assign')}</button>
    </form></details>` : ''}
  <details class="lv-group lv-details" id="lv-details">
    <summary>${t('live.results.details')}</summary>
    <p class="notice warn">${t('live.results.detailsHint')}</p>
    ${players.length ? html`<div class="lv-table-wrap"><table class="table lv-table" id="lv-student-table"><thead><tr><th scope="col">${t('live.results.rank')}</th><th scope="col">${t('live.results.player')}</th>${teams.length ? html`<th scope="col">${t('live.results.team')}</th>` : ''}<th scope="col">${t('live.results.score')}</th><th scope="col">${t('live.results.bonus')}</th><th scope="col">${t('live.results.correct')}</th>${saved ? '' : html`<th scope="col">${t('live.results.scoredBy')}</th>`}<th scope="col">${t('live.results.marks')}</th></tr></thead>
      <tbody>${players.map(p => html`<tr><td>${p.rank}</td><td>${nameOf(p)}${p.left ? html` <span class="small muted">(${t('live.results.left')})</span>` : ''}</td>${teams.length ? html`<td>${chip(p.team)}</td>` : ''}<td>${p.score}</td><td>${p.bonus || 0}</td><td>${p.answered ? t('live.results.accuracy', { right: p.correct, answered: p.answered }) : '–'}</td>${saved ? '' : html`<td>${t(p.scoredBy === 'game' ? 'live.results.byGame' : 'live.results.byLive')}</td>`}<td class="lv-marks" dir="ltr">${[...(p.marks || '')].map(mark)}</td></tr>`)}</tbody></table></div>` : ''}
    ${help.length ? html`<h3>${t('live.results.needsHelp')}</h3><ul class="lv-needs-help" id="lv-needs-help">${help.map(p => html`<li>${nameOf(p)} <span class="small muted">${t(`live.dash.why.${p.help}`)}</span></li>`)}</ul>` : ''}
    ${csv ? html`<p><a class="btn" href="${csv}" download>${t('live.results.csv')}</a></p>` : ''}
  </details>
  <input type="hidden" id="lv-name-mode" value="${nameMode}">
  ${jsonData('lv-results-data', { id, mode, still, again: !!still })}
</div>`;
}

/** /live/sets: the host's question sets (the editor is the page script's; this lists them). */
export function setsBody(req, { sets }) {
  const t = req.t;
  return html`<div class="lv lv-sets" data-lv-page="sets">
  <h1>${t('live.sets.heading')}</h1>
  <p><button class="btn btn-primary" type="button" id="lv-set-new">${t('live.sets.new')}</button></p>
  ${sets.mine.length ? html`<ul class="lv-setlist" id="lv-setlist">${sets.mine.map(s => html`<li data-set="${s.id}"><span class="lv-set-title">${s.title}</span> <span class="small muted">${t('live.sets.items', { count: s.count })}${s.ready ? '' : ` · ${t('live.sets.draft')}`}</span></li>`)}</ul>` : html`<p class="muted" id="lv-setlist-empty">${t('live.sets.empty')}</p>`}
  <section class="lv-panel" id="lv-set-editor" hidden></section>
</div>`;
}
