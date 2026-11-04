// The course card on the home page, the course page (/courses/<slug>: band picker, then the course map) and a course
// step (/courses/<slug>/<step>: slides, quick check, game module). See server/services/courses.js.
// Slides are English for now (lang="en"); everything around them comes from the courses.* strings.
import { html, raw, jsonData } from './html.js';
import { coverArt } from './components.js';
import { current } from '../i18n/index.js';
import * as C from '../services/courses.js';

const BAND_INFO = { '1b': { key: 'explorer', emoji: '🧭' }, 2: { key: 'pro', emoji: '🚀' } };
export const bandName = (t, band) => t(`courses.band.${BAND_INFO[band].key}`);
const bandGrades = (t, band) => t(`courses.band.${BAND_INFO[band].key}Sub`);
/** Text still in English on this language's page is marked so. */
const en = raw(' lang="en" dir="ltr"');

/** The home page's "Courses" row: each course as one wide card, its games nested in order as the unit overview (links to
 *  the course map's units), progress in steps, and Start / Keep going to the next open step (or the band picker). */
export function courseRow(items) {
  const { t } = current();
  if (!items.some(it => it.games.length)) return '';
  return html`<section class="rail courses" aria-labelledby="courses-h">
    <div class="rail-head"><h2 id="courses-h">📚 ${t('courses.row')}</h2></div>
    ${items.filter(it => it.games.length).map(({ course: c, games, ov }) => {
      const go = ov.next ? `/courses/${c.slug}/${ov.next.step.key}` : `/courses/${c.slug}`;
      const begun = ov.list.some(s => s.read || s.checked);
      return html`<article class="course-card" aria-labelledby="course-${c.slug}-h">
        <div class="course-head">
          <span class="course-emo" aria-hidden="true">${c.emoji}</span>
          <div class="course-ht"><h3 id="course-${c.slug}-h"><a href="/courses/${c.slug}">${t(`${c.key}.title`)}</a></h3><p>${t(`${c.key}.sub`)}</p></div>
        </div>
        <ol class="course-steps">${games.map(g => html`<li class="course-step"><a href="/courses/${c.slug}#${g.slug}" class="course-game">
          <span class="course-n" aria-hidden="true">${g.step}</span>
          <span class="course-cover">${coverArt(g)}</span>
          <span class="course-gt"><span class="course-gname">${g.title}</span><span class="course-topic">${t(`courses.topics.${g.topic}`)}</span></span>
        </a></li>`)}</ol>
        ${ov.band ? html`<div class="cprog" aria-hidden="true"><span style="width:${Math.round(ov.done / Math.max(1, ov.total) * 100)}%"></span></div>` : ''}
        <div class="course-foot">
          <a class="btn btn-primary" href="${go}" id="course-${c.slug}-go">▶ ${begun ? t('courses.continue') : t('courses.start')}</a>
          <a class="btn btn-ghost" href="/courses/${c.slug}">${t('courses.about')}</a>
          ${ov.band ? html`<span class="muted course-prog">${t('courses.stepsDone', { n: ov.done, total: ov.total })}</span>` : ''}
        </div>
      </article>`;
    })}
  </section>`;
}

/** The course's name and what it is (the longer line only until a band is picked: then the map is the page). */
function hero(t, c, short = false) {
  return html`<header class="course-hero">
      <span class="course-emo big" aria-hidden="true">${c.emoji}</span>
      <div><h1>${t(`${c.key}.title`)}</h1><p class="lead">${t(`${c.key}.sub`)}</p>${short ? '' : html`<p>${t(`${c.key}.about`)}</p>`}</div>
    </header>`;
}
function teachersBox(t, c) {
  return html`<aside class="course-teach"><h2>🍎 ${t('courses.teachers.h')}</h2><p>${t(`${c.key}.teachers`)}</p>
      <a class="btn btn-ghost" href="${c.teacherPath}">${t('courses.teachers.link')}</a></aside>`;
}
/** The two band cards (a form: works without the page script). */
function bandPicker(t, c) {
  return html`<section class="bandpick" aria-labelledby="bandpick-h">
    <h2 id="bandpick-h">${t('courses.band.h')}</h2>
    <p class="muted">${t('courses.band.text')}</p>
    <form method="post" action="/courses/${c.slug}/band" class="bandpick-cards">
      ${C.BANDS.map(b => html`<button class="bandcard" type="submit" name="band" value="${b}" id="band-${b}">
        <span class="bandcard-e" aria-hidden="true">${BAND_INFO[b].emoji}</span>
        <span class="bandcard-t"><span class="bandcard-h">${bandName(t, b)}</span><span class="bandcard-s">${bandGrades(t, b)}</span></span>
        <span class="bandcard-go flip" aria-hidden="true">›</span>
      </button>`)}
    </form>
  </section>`;
}

const STATE_ICON = { done: '✓', next: '▶', locked: '🔒' };
function stateTag(t, state) {
  return html`<span class="cstate cstate-${state}"><span aria-hidden="true">${STATE_ICON[state]}</span> ${t(`courses.map.${state}`)}</span>`;
}
/** One step on the map: its lesson row and its game module row (or "talk about it"). */
function mapStep(t, c, s, total) {
  const { step } = s;
  const lesson = !s.open ? 'locked' : s.checked ? 'done' : 'next';
  const game = !step.game ? null : s.won ? 'done' : s.open && s.checked ? 'next' : 'locked';
  const href = `/courses/${c.slug}/${step.key}`;
  const cls = s.complete ? 'is-done' : s.open ? 'is-next' : 'is-locked';
  return html`<li class="cmap-step ${cls}" id="step-${step.key}">
    <span class="cmap-n" aria-hidden="true">${s.complete ? '✓' : step.index + 1}</span>
    <div class="cmap-body">
      <h4 class="cmap-title"><span class="sr-only">${t('courses.lesson.of', { n: step.index + 1, total })}: </span><span${en}>${step.title}</span></h4>
      ${s.open ? html`<a class="cmap-row" href="${href}"><span class="cmap-k">📖 ${t('courses.map.lesson')}</span>${stateTag(t, lesson)}</a>`
        : html`<span class="cmap-row"><span class="cmap-k">📖 ${t('courses.map.lesson')}</span>${stateTag(t, lesson)}</span>`}
      ${step.game ? (game === 'locked' ? html`<span class="cmap-row"><span class="cmap-k">🎮 ${t('courses.map.game')} <span class="cmap-gm"${en}>· ${step.game.chapterTitle}</span></span>${stateTag(t, game)}</span>`
        : html`<a class="cmap-row" href="${href}#play"><span class="cmap-k">🎮 ${t('courses.map.game')} <span class="cmap-gm"${en}>· ${step.game.chapterTitle}</span></span>${stateTag(t, game)}</a>`)
        : html`<span class="cmap-row cmap-talk"><span class="cmap-k">💬 ${t('courses.map.talk')}</span></span>`}
    </div>
  </li>`;
}

/** The course page: the band picker (first time), then the course map. */
export function coursePage({ course: c, games, ov, canPick }) {
  const { t } = current();
  const bySlug = new Map(games.map(g => [g.slug, g]));
  const other = ov.band && C.BANDS.find(b => b !== ov.band);
  const unitsLabel = units => (units.length > 1 ? t('courses.map.units', { from: units[0], to: units[units.length - 1] }) : t('courses.map.unit', { n: units[0] }));
  return html`<section class="course-page">
    <a class="back small" href="/">← ${t('courses.home')}</a>
    ${hero(t, c, !!ov.band)}
    ${!ov.band ? (canPick ? bandPicker(t, c) : '') : html`
    <section class="cmap-top" aria-labelledby="cmap-h">
      <h2 id="cmap-h" class="sr-only">${t('courses.map.h')}</h2>
      <div class="cmap-band"><span>${BAND_INFO[ov.band].emoji} <b>${bandName(t, ov.band)}</b> · ${bandGrades(t, ov.band)}</span>
        <form method="post" action="/courses/${c.slug}/band"><button class="linkbtn" type="submit" name="band" value="${other}" id="band-switch">${t('courses.band.switch', { band: bandName(t, other) })}</button></form></div>
      <div class="cprog" role="progressbar" aria-valuemin="0" aria-valuemax="${ov.total}" aria-valuenow="${ov.done}" aria-label="${t('courses.stepsDone', { n: ov.done, total: ov.total })}"><span style="width:${Math.round(ov.done / Math.max(1, ov.total) * 100)}%"></span></div>
      <p class="cmap-count">${t('courses.stepsDone', { n: ov.done, total: ov.total })}</p>
      ${ov.next ? html`<a class="btn btn-primary btn-big cmap-go" href="/courses/${c.slug}/${ov.next.step.key}" id="cmap-go">▶ ${ov.done ? t('courses.continue') : t('courses.start')}</a>` : ''}
    </section>
    ${C.groupsFor(c).map(gr => {
      const list = ov.list.filter(s => s.step.group === gr.id);
      if (!list.length) return '';
      const g = gr.game && bySlug.get(gr.game);
      return html`<section class="cmap-group" id="${gr.id}" aria-labelledby="${gr.id}-h">
        <header class="cmap-gh">
          ${g ? html`<span class="cmap-cover">${coverArt(g)}</span>` : html`<span class="cmap-cover cmap-cover-e" aria-hidden="true">${gr.emoji || '💡'}</span>`}
          <div><h3 id="${gr.id}-h">${gr.title ? html`<span${en}>${gr.title}</span>` : g ? g.title : t('courses.groups.techChoices')}</h3><p class="muted small">${gr.sub ? html`<span${en}>${gr.sub}</span>` : unitsLabel(gr.units)}</p></div>
        </header>
        <ol class="cmap-steps">${list.map(s => mapStep(t, c, s, ov.total))}</ol>
      </section>`;
    })}
    <aside class="cmap-build"><span class="cmap-build-e" aria-hidden="true">🛠️</span><div><h3>${t('courses.map.build.h')}</h3><p>${t('courses.map.build.text')}</p>
      <a class="btn" href="/build">${t('courses.map.build.go')}</a></div></aside>`}
    ${teachersBox(t, c)}
  </section>`;
}

// ------------------------------------------------------------------------------------------------- the step page
/** The pictures: a big emoji on a soft shape, with two small ones beside it (no image files). [main, a, b, tone] */
const ART = {
  robot: ['🤖', '⚙️', '✨', 'mint'], grid: ['🗺️', '🟩', '🚩', 'mint'], loop: ['🔁', '🤖', '➡️', 'spark'], branch: ['🔀', '❓', '✅', 'sky'],
  box: ['📦', '🏷️', '🔢', 'spark'], gears: ['⚙️', '🔩', '🤖', 'sky'], bug: ['🐞', '🔍', '🛠️', 'rose'], map: ['🗺️', '📍', '🚩', 'mint'],
  chart: ['📊', '📈', '🦊', 'sky'], table: ['📋', '✏️', '🔢', 'spark'], magnifier: ['🔍', '🦊', '❓', 'sky'], pencil: ['✏️', '📝', '💡', 'spark'],
  envelope: ['✉️', '🦉', '📬', 'spark'], network: ['🌐', '📡', '✉️', 'sky'], lock: ['🔒', '🔑', '🛡️', 'rose'], shield: ['🛡️', '✅', '🔒', 'mint'],
  mask: ['🎭', '❓', '🚫', 'rose'], key: ['🔑', '🔒', '✨', 'spark'], cipher: ['🔐', '🔤', '🦉', 'sky'], chip: ['💾', '⚡', '🐭', 'mint'],
  battery: ['🔋', '⚡', '🔌', 'mint'], screen: ['🖥️', '🖱️', '⌨️', 'sky'], wrench: ['🔧', '🐭', '🔩', 'spark'], bits: ['🔢', '0️⃣', '1️⃣', 'sky'],
  pixel: ['🟥', '🟩', '🟦', 'spark'], people: ['🧑‍🤝‍🧑', '💬', '💡', 'rose'], globe: ['🌍', '📡', '✨', 'mint'], lightbulb: ['💡', '✨', '🧠', 'spark'],
  star: ['⭐', '✨', '🏅', 'spark'], trophy: ['🏆', '⭐', '🎉', 'spark'],
};
function art(id) {
  const [main, a, b, tone] = ART[id] || ART.lightbulb;
  return html`<div class="sart sart-${tone}" aria-hidden="true"><span class="sart-shape"></span><span class="sart-a">${a}</span><span class="sart-main">${main}</span><span class="sart-b">${b}</span></div>`;
}
/** A slide's picture: the in-game screenshot when the slide carries one (img = manifest key, file at
 *  /img/<key>.webp), else the emoji art above, which stays as every slide's fallback. A slide with guided
 *  focus steps also gets the overlay layer (boxes, dotted paths, cue chips — public/js/course.js plays them
 *  once per view; the CSS static mode serves reduced motion), a replay button, and its cues as a real list
 *  inside the figure (visually hidden while the animation can run, visible in the static mode) so the cue
 *  text is never animation-only. The overlay layer itself is aria-hidden decoration. A step whose box
 *  centre sits in the picture's bottom third (centre y > 66%) gets its cue chip at the top of the
 *  picture instead (gf-cue--top), so the chip never covers the target it points at; the box also carries
 *  its own % position as --bx/--by so the CSS can keep the corner badge inside the frame at the edges. */
/** The story layer's cast, in course order: name and piece colour (sprites extracted from their own games —
 *  scripts/csq-sprites.js — at /img/csq/chars/<id>.webp). */
const CHAR_META = {
  bolt: { name: 'Bolt', color: '#4FA8F0' }, dot: { name: 'Dot', color: '#F2994A' },
  pim: { name: 'Pim', color: '#FFD23F' }, gizmo: { name: 'Gizmo', color: '#8FC1F5' },
};
const CHAR_ORDER = ['bolt', 'dot', 'pim', 'gizmo'];
/** Where each character's centre stands on the handoff stage (cqw): the flown piece's start offset is
 *  computed from it, so the piece begins above its owner's head and lands in its progress slot. */
const CHAR_CX = { bolt: 23, dot: 19.5, pim: 23, gizmo: 21.5 };
/** Twinkling stars for the two quiet intro scenes (dim, drain): [left%, top%] spread across the sky. */
const TWINKLES = [[7, 14], [20, 7], [29, 22], [44, 5], [68, 10], [79, 20], [90, 9], [95, 26]];
/** Lit windows on the Netville skyline for dim/drain: [x, y] in the town SVG's 400x60 space (the band
 *  y 36-54 is solid skyline everywhere). Two windows stay faintly lit after the rest go out. */
const WINDOWS = [[24, 40], [52, 46], [84, 38], [112, 48], [140, 42], [172, 50], [206, 40], [238, 47], [272, 39], [306, 49], [338, 43], [372, 46]];
const LATE_WINDOWS = new Set([4, 9]);
/** Drain threads: the Spark's energy streaming out of it — [x, y] travel in cqw, one wave step each. */
const THREADS = [[-26, -4], [24, -10], [-18, 10], [28, 6], [-8, -14], [12, 14]];
/** The map scene: where each world stands on the stage ([left%, top%], the same points the route
 *  visits, in course order), and the route itself, drawn from under the Spark through all four. */
const WORLD_POS = { bolt: [15.5, 54], dot: [37, 80], pim: [62.5, 56], gizmo: [85, 81] };
const ROUTE_D = 'M50 22.5 C40 27 25 23 15.5 30.5 C24 37 29 41 37 45 C45 49 53 38 62.5 31.5 C71 26 78 35 85 45.5';
/** A character on the story stage: its game sprite, its name chip (the team scene shows them) and, for Bolt,
 *  the little antenna light his signature move blinks. --d is the entrance delay step. */
const storyChar = (id, d, extra = '') => html`<span class="story-char story-char--${id} ${extra}" style="--d:${d}"><img src="/img/csq/chars/${id}.webp" alt="" loading="lazy" decoding="async">${id === 'bolt' ? html`<span class="story-antenna"></span>` : ''}<span class="story-name">${CHAR_META[id].name}</span></span>`;
/** The Spark motif: one reusable glowing spark (SVG) with the four piece gems around it. A piece is lit when
 *  its index is below the scene's lit count; on the relight scene every piece flies in from its corner. */
function sparkHtml(st) {
  const orbit = st.scene !== 'handoff' && st.scene !== 'map';
  return html`<div class="story-spark">
    <svg class="spark-svg" viewBox="0 0 100 100" aria-hidden="true"><path class="spark-star" d="M50 4 C55 33 67 45 96 50 C67 55 55 67 50 96 C45 67 33 55 4 50 C33 45 45 33 50 4 Z"/><circle class="spark-core" cx="50" cy="50" r="7"/></svg>
    ${st.scene === 'dim' ? html`<span class="story-ember e1"></span><span class="story-ember e2"></span><span class="story-ember e3"></span><span class="story-ember e4"></span><span class="story-ember e5"></span>` : ''}
    ${st.scene === 'drain' ? THREADS.map((th, i) => html`<span class="story-thread" style="--tx:${th[0]};--ty:${th[1]};--d:${i}"></span>`) : ''}
    ${orbit ? CHAR_ORDER.map((id, i) => html`<span class="story-piece story-piece--${id}${i < st.lit ? ' is-lit' : ' is-off'}${st.scene === 'relight' ? ' is-fly' : ''}" style="--d:${i}"></span>`) : ''}
  </div>`;
}
/** The sky over Netville on the quiet scenes: stars that twinkle (and die as the Spark drains). */
const skyHtml = () => html`<div class="story-sky">${TWINKLES.map((p, i) => html`<span class="story-tw" style="left:${p[0]}%;top:${p[1]}%;--d:${i}"></span>`)}</div>`;
/** The town's lit windows, in the town SVG's own geometry so they sit inside the skyline's houses. */
const windowsHtml = () => html`<svg class="story-windows" viewBox="0 0 400 60" preserveAspectRatio="none" aria-hidden="true">${WINDOWS.map((w, i) => html`<rect class="story-win${LATE_WINDOWS.has(i) ? ' is-late' : ''}" x="${w[0]}" y="${w[1]}" width="7" height="9" rx="1.5" style="--d:${i}"/>`)}</svg>`;
/** The map scene's journey layer: the dotted route (a bright copy draws itself over it once) from the
 *  Spark through the four worlds in course order, and a node for each world — the friend's own sprite
 *  on a tinted disc, its name, and the piece gem that world will light. */
function mapHtml(st) {
  return html`<div class="story-map">
    <svg class="story-route" viewBox="0 0 100 56.25" preserveAspectRatio="none" aria-hidden="true"><path class="story-route-base" d="${ROUTE_D}" pathLength="100" vector-effect="non-scaling-stroke"/><path class="story-route-draw" d="${ROUTE_D}" pathLength="100" vector-effect="non-scaling-stroke"/></svg>
    ${CHAR_ORDER.map((id, i) => html`<div class="story-world story-world--${id}" style="left:${WORLD_POS[id][0]}%;top:${WORLD_POS[id][1]}%">
      <div class="story-world-in"><span class="story-world-disc"></span>${storyChar(id, i)}<span class="story-piece story-piece--${id}${i < st.lit ? ' is-lit' : ' is-off'}" style="--d:${i}"></span></div>
    </div>`)}
  </div>`;
}
/** A slide's story stage (the story & intro pack): the Spark, its pieces and the characters, animated by
 *  public/js/course.js + CSS keyframes when the stage scrolls into view. The stage is decoration (aria-hidden):
 *  the slide's title and text always carry the story in words. With no script, or under reduced motion, the
 *  CSS shows the finished frame — pieces lit per the scene's count, the cast in place, the Spark as bright as
 *  the story has made it. The script first arms the stage (start positions) and then plays it once per view. */
function storyArt(t, s) {
  const st = s.story;
  const town = ['dim', 'drain', 'team', 'map'].includes(st.scene);
  const quiet = st.scene === 'dim' || st.scene === 'drain';
  return html`<figure class="smedia story" data-story data-scene="${st.scene}" data-lit="${st.lit}">
    <div class="story-stage" aria-hidden="true">
      ${town ? html`<svg class="story-town" viewBox="0 0 400 60" preserveAspectRatio="none" aria-hidden="true"><path d="M0 60 V34 h30 V20 h8 v14 h26 V28 h34 v6 h24 V16 h10 v18 h30 V30 h36 v4 h22 V24 h40 v10 h28 V26 h34 v8 h26 V20 h10 v14 h30 V32 h34 v28 Z"/></svg>` : ''}
      ${quiet ? skyHtml() : ''}
      ${quiet ? windowsHtml() : ''}
      ${sparkHtml(st)}
      ${st.scene === 'handoff' ? html`
      <div class="story-cast story-cast--handoff">
        ${st.out ? storyChar(st.out, 0, 'is-out') : ''}
        ${st.in ? storyChar(st.in, 0, 'is-in') : ''}
      </div>
      <div class="story-progress">${CHAR_ORDER.map((id, i) => html`<span class="story-slot"><span class="story-gem story-gem--${id}${st.fly === id ? ' is-new' : i < st.lit ? ' is-lit' : ' is-off'}" style="--fx:${((CHAR_CX[st.out] || 22) - (36.5 + i * 9)).toFixed(1)}"></span></span>`)}</div>` : st.scene === 'map' ? mapHtml(st) : html`
      <div class="story-cast">${st.chars.map((id, i) => storyChar(id, i))}</div>`}
    </div>
  </figure>`;
}
function slideArt(t, s) {
  if (s.story) return storyArt(t, s);
  if (!s.img) return art(s.art);
  const img = html`<img class="simg" src="/img/${s.img}.webp" alt="${s.alt || ''}" width="1280" height="720" loading="lazy" decoding="async">`;
  if (!s.focus) return html`<figure class="smedia">${img}</figure>`;
  return html`<figure class="smedia gf" data-gf>
    ${img}
    <div class="gf-layer" aria-hidden="true">${s.focus.map((st, i) => html`
      <div class="gf-step" data-i="${i}">
        ${st.path ? html`<svg class="gf-path" viewBox="0 0 100 56.25" preserveAspectRatio="none"><polyline points="${st.path.map(p => `${p[0]},${p[1] * 0.5625}`).join(' ')}" pathLength="100" vector-effect="non-scaling-stroke"></polyline></svg>` : ''}
        <div class="gf-box" style="--bx:${st.box[0]};--by:${st.box[1]};left:${st.box[0]}%;top:${st.box[1]}%;width:${st.box[2]}%;height:${st.box[3]}%"><span class="gf-badge">${i + 1}</span></div>
        <div class="gf-cue${st.box[1] + st.box[3] / 2 > 66 ? ' gf-cue--top' : ''}"><span class="gf-cue-n">${i + 1}</span>${st.cue}</div>
      </div>`)}
    </div>
    <button class="gf-replay" type="button" hidden><span aria-hidden="true">↻</span> ${t('courses.lesson.replayFocus')}</button>
    <figcaption class="gf-cues"><ol>${s.focus.map(st => html`<li>${st.cue}</li>`)}</ol></figcaption>
  </figure>`;
}
/** What read-aloud says for a slide: its own line if it has one, else its title and text (and the words). */
export function sayOf(s) {
  if (s.say) return s.say;
  const words = s.words ? s.words.map(w => `${w.word}${w.means ? `: ${w.means}` : ''}.`).join(' ') : '';
  const steps = s.steps ? s.steps.join(', ') + '.' : '';
  return [s.title + '.', s.text, steps, words].filter(Boolean).join(' ');
}
function slide(t, s, i, n, step) {
  return html`<section class="slide slide--${s.kind}" id="slide-${i + 1}" aria-roledescription="slide" aria-label="${t('courses.lesson.slide', { n: i + 1, total: n })}" data-say="${sayOf(s)}">
    ${slideArt(t, s)}
    <div class="slide-body">
      <h2 class="slide-h">${s.title}</h2>
      ${s.text ? html`<p class="slide-p">${s.text}</p>` : ''}
      ${s.steps ? html`<ol class="chips-prog">${s.steps.map(x => html`<li class="chipblock">${x}</li>`)}</ol>` : ''}
      ${s.rows ? html`<table class="slide-table">${s.rows.map((r, ri) => html`<tr>${r.map(cell => (ri === 0 ? html`<th>${cell}</th>` : html`<td>${cell}</td>`))}</tr>`)}</table>` : ''}
      ${s.words ? html`<dl class="slide-wordlist">${s.words.map(w => html`<div><dt>${w.word}</dt>${w.means ? html`<dd>${w.means}</dd>` : ''}</div>`)}</dl>` : ''}
      ${s.kind === 'mission' && step.game ? html`<p class="slide-mission">🎮 <b>${step.game.title}</b> · ${step.game.chapterTitle}</p>` : ''}
    </div>
    <button class="btn slide-say" type="button" hidden data-say-btn><span aria-hidden="true">🔊</span> <span class="lbl" lang="${current().locale}">${t('courses.lesson.listen')}</span></button>
  </section>`;
}

/** The quick check: one fieldset per question, choices in a seeded order, no answers. A plain form without the script. */
function checkForm(t, c, step, qs) {
  return html`<form class="qcheck" method="post" action="/courses/${c.slug}/${step.key}/check" id="qcheck">
    ${qs.map((qq, qi) => html`<fieldset class="qq" data-q="${qq.id}" id="q-${qi + 1}">
      <legend><span class="qq-n">${t('courses.check.q', { n: qi + 1, total: qs.length })}</span><span class="qq-t"${en}>${qq.q}</span></legend>
      <div class="qq-choices"${en}>${qq.choices.map(ch => html`<label class="qchoice"><input type="radio" name="${qq.id}" value="${ch.i}" required><span>${ch.text}</span></label>`)}</div>
      <p class="qq-fb" role="status" aria-live="polite"></p>
    </fieldset>`)}
    <button class="btn btn-primary btn-big" type="submit" id="qcheck-send">${t('courses.check.send')}</button>
  </form>`;
}

/** After the check: the game module (or the talk prompt) and the next step. */
export function afterSection(t, c, step, s, next) {
  const play = C.playHref(c, step);
  return html`<section class="cl-after" id="play" aria-labelledby="play-h">
    <h2 id="play-h">${s.complete ? html`✓ ${t('courses.lesson.complete')}` : step.game ? t('courses.lesson.unlocked') : t('courses.lesson.talk')}</h2>
    ${step.game ? html`<a class="btn btn-hot btn-big cl-play" href="${play}" id="cl-play">▶ ${t('courses.play', { game: step.game.title, chapter: step.game.chapterTitle })}</a>
      ${s.won ? '' : html`<p class="muted small">${t('courses.lesson.playToFinish')}</p>`}`
      : html`<p class="cl-talk"${en}>💬 ${step.talk}</p>`}
    ${next ? html`<a class="btn ${s.complete ? 'btn-primary' : ''}" href="/courses/${c.slug}/${next.key}" id="cl-next" ${s.complete ? '' : raw('hidden')}>${t('courses.lesson.nextStep')} ›</a>` : ''}
    <a class="btn btn-ghost" href="/courses/${c.slug}#step-${step.key}">${t('courses.lesson.map')}</a>
  </section>`;
}

/** A course step: the slides, the quick check and the game module. */
export function stepPage({ course: c, s, total, next, seed, result, signedIn }) {
  const { t } = current();
  const { step } = s;
  const qs = C.questions(step, seed);
  const n = step.slides.length;
  return html`<article class="cl-page" data-step="${step.key}">
    <a class="back small" href="/courses/${c.slug}#step-${step.key}">← ${t('courses.lesson.map')}</a>
    <header class="cl-head">
      <p class="cl-kicker">${t(`${c.key}.title`)} · ${t('courses.lesson.of', { n: step.index + 1, total })} · <span${en}>${step.topic}</span></p>
      <h1${en}>${step.title}</h1>
    </header>
    <div class="deck" id="deck" lang="en" dir="ltr" aria-roledescription="carousel" aria-label="${step.title}">
      ${step.slides.map((sl, i) => slide(t, sl, i, n, step))}
    </div>
    <nav class="deck-nav" id="deck-nav" hidden aria-label="${t('courses.lesson.slides')}">
      <button class="btn" type="button" id="deck-back">‹ ${t('courses.lesson.back')}</button>
      <div class="deck-dots" id="deck-dots">${step.slides.map((_, i) => html`<button type="button" class="dot" data-i="${i}" aria-label="${t('courses.lesson.slide', { n: i + 1, total: n })}"></button>`)}</div>
      <button class="btn btn-primary" type="button" id="deck-next" data-next="${t('courses.lesson.next')} ›" data-check="${t('courses.lesson.toCheck')} ›">${t('courses.lesson.next')} ›</button>
    </nav>
    <section class="cl-check" id="check" aria-labelledby="check-h" data-done="${s.checked ? '1' : ''}" data-read="${s.read ? '1' : ''}">
      <h2 id="check-h">✅ ${t('courses.check.h')}</h2>
      ${s.checked ? html`<p class="cl-passed">✓ ${t('courses.check.done')}</p>`
        : html`<p class="muted">${t('courses.check.intro')}</p>
        ${result ? html`<div class="cl-result ${result.passed ? 'ok' : 'bad'}" role="status">${result.passed ? t('courses.check.passed', { score: result.score, total: 3 }) : t('courses.check.failed', { score: result.score, total: 3 })}
          ${result.passed ? '' : html`<ul${en}>${result.results.filter(r => !r.right).map(r => html`<li>${C.item(r.id).q} → <b>${r.text}</b></li>`)}</ul>`}</div>` : ''}
        ${signedIn ? checkForm(t, c, step, qs) : html`<p class="notice">${t('errors.api.signInFirst')}</p>`}`}
    </section>
    ${s.checked ? afterSection(t, c, step, s, next) : html`<div id="play-slot"></div>`}
    ${jsonData('page-data', { course: c.slug, step: step.key, slides: n, checked: s.checked, read: s.read })}
  </article>`;
}
