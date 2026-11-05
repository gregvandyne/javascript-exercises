// The Number Quest path home (/courses/number-quest): the Numberworks street (math course spec §6.1) — a
// winding path of workshop units, each a cluster of three step nodes, with the Duolingo-lite layer on top:
// Tally Marks in the header, today's daily-goal progress, mastery-lap rings around each workshop, the
// placement start Tally chose, and the units still being built shown greyed at the top of the street.
// It reuses the course page's shell, panels, buttons and tokens (views/courses.js idioms); its own rules
// live in public/css/number-quest.css. Course copy is English data, rendered lang="en" like the decks.
// Character art: Tally's sprite is extracted from her own game, Fraction Factory (scripts/csq-sprites.js,
// public/img/csq/chars/tally.webp) — never a redrawn or substituted character. The street itself stays
// typographic: emoji, stones and tally bundles.
import { html, raw } from './html.js';
import { current } from '../i18n/index.js';
import * as NQ from '../services/number-quest-progress.js';

/** Tally Marks as tally bundles (spec §6.1: five-bar gates, legible to a five-year-old): full bundles of
 *  five, then the loose marks, then the number in words for anyone counting along. */
export function tallyBundles(total) {
  const bundles = Math.floor(total / 5), loose = total % 5;
  if (!total) return html`<span class="nqp-tally-none">No marks yet — your first check plants the first one.</span>`;
  return html`<span class="nqp-tally" aria-hidden="true">${Array.from({ length: bundles }, () => raw('<span class="nqp-t5"><i></i><i></i><i></i><i></i></span>'))}${loose ? raw(`<span class="nqp-tl">${'<i></i>'.repeat(loose)}</span>`) : ''}</span> <b>${total} Tally Mark${total === 1 ? '' : 's'}</b>`;
}

/** One step node on the street: a circle (done ✓, current ▶ with a pulse, open number, locked 🔒) and its
 *  title. A link only when the step is open and the viewer may play (a grown-up previewing sees the street,
 *  not doors into lessons). */
function node(t, c, s, { canPick, here }) {
  const { step } = s;
  // A step the learner has begun (read, checked or opened its mission) but not finished is its own
  // state — 'started' — visibly different from a step that is merely unlocked and untouched.
  const started = !s.complete && !!(s.played || s.read || s.checked);
  const state = s.complete ? 'done' : here ? 'here' : started ? 'started' : s.open ? 'open' : 'locked';
  const face = s.complete ? '✓' : state === 'locked' ? '🔒' : step.n;
  const inner = html`<span class="nqp-node nqp-node-${state}" aria-hidden="true">${face}</span>
    <span class="nqp-node-t">${step.title}</span>
    ${here ? html`<span class="nqp-here"><img class="nqp-here-tally" src="/img/csq/chars/tally.webp" alt="">You are here</span>` : ''}
    ${started ? html`<span class="nqp-started">Started</span>` : ''}`;
  return html`<li class="nqp-step nqp-step-${state}" id="step-${step.key}">
    ${canPick && s.open ? html`<a class="nqp-door" href="/courses/${c.slug}/${step.key}" aria-label="${step.title}: ${state === 'done' ? 'done' : state === 'here' ? 'your next step' : 'open'}">${inner}</a>` : html`<span class="nqp-door">${inner}</span>`}
  </li>`;
}

/** One workshop (unit) on the street: its banner (emoji, name, its stone once planted, its lap rings) and
 *  its three step nodes winding under it. The rings are the unit's mastery laps (0-3, spec §6.3): a ring
 *  fills for each lap done, and the words say which lap is next — laps are optional, nothing gates on them. */
function workshop(t, c, u, list, lap, { canPick, nextKey, testedOut }) {
  const steps = list.filter(s => s.step.unit === u.n);
  const done = steps.length > 0 && steps.every(s => s.complete);
  // The ring measures the laps that EXIST: Lap 1 is the only playable lap (2 and 3 are being built),
  // so a finished unit fills the ring completely — a ring stuck at a third read as "incomplete" when
  // the learner had in fact done everything there is to do.
  const lap1Done = !!(lap && lap.completed.includes(1));
  const ringPct = lap1Done ? 100 : 0;
  return html`<li class="nqp-unit" id="${u.group}">
    <header class="nqp-unit-h">
      <span class="nqp-medal ${lap1Done ? 'is-complete' : ''}" style="--ring:${ringPct}%" aria-hidden="true"><span class="nqp-medal-in">${u.emoji || '🔢'}</span></span>
      <div class="nqp-unit-t">
        <h3 lang="en" dir="ltr">${u.n === 0 ? u.title : `Unit ${u.n} · ${u.title}`}</h3>
        ${u.n >= 1 ? html`<p class="small muted nqp-laps">${lap && lap.rings ? `Lap${lap.rings > 1 ? 's' : ''} ${lap.completed.join(', ')} done · Laps 2 and 3 are being built` : 'Finish the unit to plant its stone and record Lap 1. Laps 2 and 3 are being built.'}</p>` : html`<p class="small muted nqp-laps">Start here: meet Tally, the Jumble and the Numberworks.</p>`}
      </div>
      ${u.stamp ? html`<span class="nqp-stone ${done ? 'is-planted' : ''}">${done ? '🏅' : '🪨'} <span lang="en" dir="ltr">${u.stamp}${done ? ' planted' : ''}</span></span>` : ''}
      ${testedOut ? html`<span class="nqp-stone is-tested">⭐ Tested out</span>` : ''}
    </header>
    <ol class="nqp-nodes">${steps.map(s => node(t, c, s, { canPick, here: nextKey === s.step.key }))}</ol>
  </li>`;
}

/** A workshop still being built: on the street, greyed, honestly labelled — never a door. */
const futureUnit = n => html`<li class="nqp-unit nqp-unit-future" aria-disabled="true">
  <header class="nqp-unit-h"><span class="nqp-medal nqp-medal-future" aria-hidden="true"><span class="nqp-medal-in">🚧</span></span>
    <div class="nqp-unit-t"><h3>Unit ${n}</h3><p class="small muted nqp-laps">Still being built. The Numberworks crew is on it.</p></div>
    <span class="nqp-stone">Coming later</span></header>
</li>`;

/** The path home. d: { course, ov (the Explorer overview), marks, daily, laps (unit -> lapState),
 *  placement, testedOut (unit numbers), canPick, bandSet } */
export function pathPage(d) {
  const { t } = current();
  const { course: c, ov, daily, placement } = d;
  const nextKey = ov.next ? ov.next.step.key : null;
  const groups = new Map();
  for (const s of ov.list) { if (!groups.has(s.step.unit)) groups.set(s.step.unit, []); groups.get(s.step.unit).push(s); }
  const units = d.units;
  return html`<section class="course-page nqpath">
    <a class="back small" href="/">← ${t('courses.home')}</a>
    <header class="course-hero">
      <span class="course-emo big" aria-hidden="true">${c.emoji}</span>
      <img class="nqp-tally-img" src="/img/csq/chars/tally.webp" alt="Tally the cat, keeper of the Numberworks" width="219" height="353">
      <div><h1>${t(`${c.key}.title`)}</h1><p class="lead">${t(`${c.key}.sub`)}</p><p lang="en" dir="ltr">Every number has a job to do. Walk the street, finish each workshop's steps, and plant its stone.</p></div>
    </header>

    ${!d.bandSet && d.canPick && !d.hasProgress ? html`<section class="bandpick" aria-labelledby="bandpick-h">
      <h2 id="bandpick-h">${t('courses.band.h')}</h2>
      <p class="muted">Number Quest opens with the Explorer street, for grades 3–5. More streets are being built.</p>
      <form method="post" action="/courses/${c.slug}/band" class="bandpick-cards">
        <button class="bandcard" type="submit" name="band" value="explorer" id="band-explorer">
          <span class="bandcard-e" aria-hidden="true">🧭</span>
          <span class="bandcard-t"><span class="bandcard-h">Explorer</span><span class="bandcard-s">Grades 3–5</span></span>
          <span class="bandcard-go flip" aria-hidden="true">›</span>
        </button>
      </form>
    </section>` : ''}

    <section class="panel nqp-hud" aria-labelledby="nqp-hud-h" lang="en">
      <h2 id="nqp-hud-h" class="sr-only">Your Number Quest progress</h2>
      <div class="nqp-hud-row">
        <div class="nqp-hud-cell"><span class="nqp-hud-k">🐱 Tally Marks</span>${tallyBundles(d.marks)}</div>
        <div class="nqp-hud-cell"><span class="nqp-hud-k">🌱 Today's goal</span>
          ${daily ? html`<span class="nqp-dots" aria-hidden="true">${Array.from({ length: daily.goal }, (_, i) => raw(`<span class="nqp-dot${i < daily.done ? ' is-done' : ''}"></span>`))}</span> <b>${Math.min(daily.done, daily.goal)} of ${daily.goal}</b> ${daily.met ? '· goal done! 🎉' : 'activities done'}
          ${d.canPick ? html`<form method="post" action="/api/number-quest/daily-goal" class="nqp-goalpick"><span class="small muted">My goal:</span>${NQ.DAILY_GOAL_CHOICES.map(g => html`<button type="submit" name="goal" value="${g}" class="nqp-goalbtn ${g === daily.goal ? 'is-on' : ''}" aria-pressed="${g === daily.goal ? 'true' : 'false'}">${g}</button>`)}<input type="hidden" name="back" value="/courses/number-quest"></form>` : ''}` : html`<span class="muted">Sign in to keep your marks and goal.</span>`}
        </div>
      </div>
      ${placement && placement.startNode ? html`<p class="nqp-placed">📍 Tally placed your start at <b lang="en" dir="ltr">${placement.workshop || ''}</b>. Every earlier workshop stays open for games, laps and test-out. ${d.canPick ? html`<a href="/number-quest/sorting-game">Play the Sorting Game again</a>` : ''}</p>`
        : d.canPick ? html`<p class="nqp-placed">📍 New here? <a href="/number-quest/sorting-game"><b>Play Tally's Sorting Game</b></a> and she will find your first workshop. Skipping it is always fine: the street starts at the beginning.</p>` : ''}
      <div class="cprog" role="progressbar" aria-valuemin="0" aria-valuemax="${ov.total}" aria-valuenow="${ov.done}" aria-label="${t('courses.stepsDone', { n: ov.done, total: ov.total })}"><span style="width:${Math.round(ov.done / Math.max(1, ov.total) * 100)}%"></span></div>
      <p class="cmap-count">${t('courses.stepsDone', { n: ov.done, total: ov.total })}</p>
      ${ov.next && d.canPick ? html`<a class="btn btn-primary btn-big cmap-go" href="/courses/${c.slug}/${ov.next.step.key}" id="cmap-go">▶ ${ov.done ? t('courses.continue') : t('courses.start')}</a>` : ''}
    </section>

    <ol class="nqp-path" aria-label="The Numberworks street, Explorer">
      ${units.map(u => workshop(t, c, u, ov.list, d.laps[u.n] || null, { canPick: d.canPick, nextKey, testedOut: d.testedOut.includes(u.n) }))}
      ${[5, 6, 7].map(futureUnit)}
      <li class="nqp-unit nqp-unit-future" aria-disabled="true">
        <header class="nqp-unit-h"><span class="nqp-medal nqp-medal-future" aria-hidden="true"><span class="nqp-medal-in">🔐</span></span>
          <div class="nqp-unit-t"><h3 lang="en" dir="ltr">The Vault of Measures</h3><p class="small muted nqp-laps">The street's end, for now: seven locks, one for every workshop, opened by the seven stones. Still being built.</p></div>
          <span class="nqp-stone">Coming later</span></header>
      </li>
    </ol>

    <aside class="cmap-build"><span class="cmap-build-e" aria-hidden="true">🛠️</span><div><h3>${t('courses.map.build.h')}</h3><p>${t('courses.map.build.text')}</p>
      <a class="btn" href="/build">${t('courses.map.build.go')}</a></div></aside>
    <aside class="course-teach"><h2>🍎 ${t('courses.teachers.h')}</h2><p>${t(`${c.key}.teachers`)}</p>
      <a class="btn btn-ghost" href="${c.teacherPath}">${t('courses.teachers.link')}</a></aside>
  </section>`;
}
