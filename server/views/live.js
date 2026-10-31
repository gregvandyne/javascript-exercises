// Oomba Live pages (docs/decisions.md "Oomba Live"). Server-rendered shells: every state a page can be in is drawn
// here, translated, with hidden sections the page scripts (public/js/live-*.js) show and fill. Player pages (/join,
// /live/play) use the bare layout: no menus, no footer, nothing for sale, no sign-up prompts. The roster never links
// to anyone (no profiles, no messages). Element ids and data attributes are the page scripts' hooks
// (docs/live-protocol.md "Page hooks").
import { html, raw, jsonData } from './html.js';
import { appMark, wordmark, BRAND } from './brand.js';
import { qrSvg } from '../services/qr.js';
import { EMOTES, HOST_ACTIONS } from '../services/classlive-protocol.js';
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
    <button class="btn btn-sm" type="button" id="lv-simple" aria-pressed="false">${t('live.play.simpleView')}</button>
    <button class="btn btn-sm" type="button" id="lv-report-open" aria-haspopup="dialog">🚩 ${t('live.play.report')}</button>
    <button class="btn btn-sm" type="button" id="lv-leave" data-confirm="${t('live.play.leaveConfirm')}">${t('live.play.leave')}</button>
  </header>
  <p class="lv-phase" id="lv-phase" role="status" aria-live="polite">${open ? t('live.play.waiting') : t('live.play.gone')}</p>
  <div class="lv-stage" id="lv-stage" dir="ltr"></div>
  <canvas class="lv-watch" id="lv-watch" hidden aria-label="${t('live.play.watchHint')}"></canvas>
  <div class="lv-emotes" id="lv-emotes" role="group" aria-label="${t('live.play.emotes')}">
    ${EMOTES.map((e, i) => html`<button class="btn btn-sm lv-emote" type="button" data-emote="${i}">${t(`live.emote.${e}`)}</button>`)}
  </div>
  <section class="lv-panel lv-end" id="lv-end" hidden aria-live="polite">
    <h2 class="lv-h2" id="lv-end-title">${t('live.play.ended')}</h2>
    <p class="lv-place" id="lv-place"></p>
    <a class="btn btn-primary" id="lv-again" href="/join">${t('live.play.playAgain')}</a>
  </section>
  <dialog class="lv-dialog" id="lv-report" aria-labelledby="lv-report-h">
    <form method="dialog" class="stack">
      <h2 id="lv-report-h">${t('live.play.reportHeading')}</h2>
      ${REPORT_REASONS.map(r => html`<button class="btn btn-block" type="submit" value="${r}" data-report="${r}">${t(`live.play.reason.${r}`)}</button>`)}
      <button class="btn btn-block" type="submit" value="">${t('live.play.cancel')}</button>
    </form>
  </dialog>
  ${jsonData('lv-play-data', { sid, title, open, nicks, msgs: msgs(t, 'live.play', PLAY_CODES), phases: phaseText(t), emotes: EMOTES, thanks: t('live.play.reportThanks'), place: t('live.play.place'), late: t('live.play.late'), watchHint: t('live.play.watchHint'), kit: KIT() })}
</div>`;
}
const phaseText = t => ({ lobby: t('live.play.waiting'), loading: t('live.play.loading'), countdown: t('live.play.countdown'), playing: '', paused: t('live.play.paused'), between: t('live.play.between'), ended: t('live.play.ended') });

/** /live/host/:sid: the projector page. Code, QR, address, roster, controls, the game's host view. */
export function hostBody(req, { s, origin, token, nicks, classSignIn }) {
  const t = req.t;
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
    <p class="small muted" id="lv-autolock"${s.settings.autoLock ? '' : raw(' hidden')}>${t('live.host.autoLock')}</p>
  </section>
  <section class="lv-rosterbox" aria-labelledby="lv-roster-h">
    <h2 class="lv-h2" id="lv-roster-h">${t('live.host.players')}</h2>
    <p class="muted" id="lv-empty">${t('live.host.empty')}</p>
    <ul class="lv-roster" id="lv-roster"></ul>
    <template id="lv-player-tpl"><li class="lv-player"><span class="lv-p-avatar" aria-hidden="true"></span><span class="lv-p-name"></span><span class="lv-p-marks"></span><button class="btn btn-sm lv-p-remove" type="button" data-lv-kick>${t('live.host.remove')}</button></li></template>
  </section>
  <p class="notice warn" id="lv-reports" hidden role="status">${t('live.host.reports')}</p>
  ${jsonData('lv-host-data', {
    sid: s.id, tok: token, code: s.code, joinUrl, audience: s.audience, nameMode: s.nameMode, mode: s.mode, title: s.title, max: s.settings.maxPlayers, nicks,
    actions: HOST_ACTIONS, results: `/live/results/${s.id}`, kit: KIT(),
    text: { removeConfirm: t('live.host.removeConfirm'), ready: t('live.host.ready'), late: t('live.host.late'), watching: t('live.host.watching'), offline: t('live.host.offline'), showCode: t('live.host.showCode'), hideCode: t('live.host.hideCode'), locked: t('live.host.locked'), count: t('live.host.count'), answers: t('live.host.answers'), phases: phaseText(t) },
  })}
</div>`;
}

/** /live: pick a game or mode, a question set, who can join, then open the room (a data-api form: works without the
 *  page script). */
export function landingBody(req, { modes, groups, sets, starters, classes, family, pre, recent, maxPlayers, origin }) {
  const t = req.t;
  const radio = (name, value, checked) => raw(`<input type="radio" name="${name}" value="${value}"${checked ? ' checked' : ''}>`);
  const card = (value, icon, title, text, checked, quiz = false) => html`<label class="lv-pick"${quiz ? raw(' data-quiz="1"') : ''}>${radio('pick', value, checked)}<span class="lv-pick-icon" aria-hidden="true">${icon}</span><span class="lv-pick-t">${title}</span>${text ? html`<span class="small muted">${text}</span>` : ''}</label>`;
  const anyPicked = !!pre.pick;
  const audiences = [classes.length ? 'class' : null, family ? 'family' : null, 'open'].filter(Boolean);
  const audDefault = pre.audience && audiences.includes(pre.audience) ? pre.audience : audiences[0];
  return html`<div class="lv lv-landing" data-lv-page="landing">
  <h1>${t('live.landing.heading')}</h1>
  <p class="muted">${t('live.landing.intro', { url: `${origin.replace(/^https?:\/\//, '')}/join` })}</p>
  <form class="stack" id="lv-new" data-api="/api/live/sessions" novalidate>
    <fieldset class="lv-group"><legend>${t('live.landing.modes')}</legend><div class="lv-picks">
      ${modes.map((m, i) => card(`mode:${m.id}`, m.icon, m.title, m.text, pre.pick ? pre.pick === `mode:${m.id}` : i === 0 && !anyPicked))}
    </div></fieldset>
    ${groups.map(g => html`<fieldset class="lv-group"><legend>${t(`live.landing.${g.key}`)}</legend>${g.games.length ? html`<div class="lv-picks">${g.games.map(x => card(`game:${x.id}`, x.icon, x.title, x.quiz ? t('live.landing.usesQuestions') : '', pre.pick === `game:${x.id}`, x.quiz))}</div>` : html`<p class="small muted">${t('live.landing.none')}</p>`}</fieldset>`)}
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
    ${pre.clId ? html`<input type="hidden" name="clId" value="${pre.clId}"><input type="hidden" name="stepId" value="${pre.stepId || ''}">` : ''}
    <p class="err form-err" aria-live="polite"></p>
    <button class="btn btn-primary btn-big" type="submit">${t('live.landing.open')}</button>
  </form>
  ${recent.length ? html`<section class="lv-group"><h2>${t('live.landing.recent')}</h2><ul class="lv-recent">${recent.map(r => html`<li><a href="/live/results/${r.id}">${r.title || t('live.results.title')}</a> <span class="small muted">${t('live.results.playersCount', { count: r.players })}</span></li>`)}</ul></section>` : ''}
</div>`;
}

/** Results: the session's own summary (from memory, 10 minutes) or a saved run (counts, class students). */
export function resultsBody(req, { title, players = [], items = [], guests = 0, nicks = [], csv = null, saved = false, gradebook = false, nameMode = 'nicknames' }) {
  const t = req.t;
  const nameOf = p => (typeof p.name === 'number' ? nicks[p.name] || '' : p.name || '');
  return html`<div class="lv lv-results" data-lv-page="results">
  <h1>${t('live.results.heading', { title })}</h1>
  ${gradebook ? html`<p class="notice good">${t('live.results.gradebook')}</p>` : ''}
  ${players.length ? html`<table class="table lv-table"><thead><tr><th scope="col">${t('live.results.rank')}</th><th scope="col">${t('live.results.player')}</th><th scope="col">${t('live.results.score')}</th><th scope="col">${t('live.results.correct')}</th>${saved ? '' : html`<th scope="col">${t('live.results.scoredBy')}</th>`}</tr></thead>
    <tbody>${players.map(p => html`<tr><td>${p.rank}</td><td>${nameOf(p)}${p.left ? html` <span class="small muted">(${t('live.results.left')})</span>` : ''}</td><td>${p.score}</td><td>${p.answered ? t('live.results.accuracy', { right: p.correct, answered: p.answered }) : '–'}</td>${saved ? '' : html`<td>${t(p.scoredBy === 'game' ? 'live.results.byGame' : 'live.results.byLive')}</td>`}</tr>`)}</tbody></table>` : ''}
  ${guests ? html`<p class="muted">${t('live.results.guests', { count: guests })}</p>` : ''}
  ${items.length ? html`<h2>${t('live.results.questions')}</h2><ol class="lv-items">${items.map(it => html`<li>${it.q ? html`<span>${it.q}</span> ` : ''}<span class="small">${t('live.results.accuracy', { right: it.right, answered: it.answered })}</span>${it.topWrong || it.top_wrong ? html` <span class="small muted">${t('live.results.topWrong', { answer: it.topWrong || it.top_wrong })}</span>` : ''}</li>`)}</ol>` : ''}
  ${csv ? html`<p><a class="btn" href="${csv}" download>${t('live.results.csv')}</a></p>` : ''}
  <input type="hidden" id="lv-name-mode" value="${nameMode}">
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
