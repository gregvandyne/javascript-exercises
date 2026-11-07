// The course card on the home page, the course page (/courses/<slug>: band picker, then the course map) and a course
// step (/courses/<slug>/<step>: slides, quick check, game module). See server/services/courses.js.
// Slides are English for now (lang="en"); everything around them comes from the courses.* strings.
import { html, raw, jsonData } from './html.js';
import { coverArt } from './components.js';
import { current } from '../i18n/index.js';
import * as C from '../services/courses.js';
import { DIAGRAM_TYPES, diagramSvg, diagramExtent } from './nq-diagrams.js';

const BAND_INFO = { '1b': { key: 'explorer', emoji: '🧭' }, 2: { key: 'pro', emoji: '🚀' }, explorer: { key: 'explorer', emoji: '🧭' } };
export const bandName = (t, band) => t(`courses.band.${BAND_INFO[band].key}`);
const bandGrades = (t, band) => t(`courses.band.${BAND_INFO[band].key}Sub`);
/** Text still in English on this language's page is marked so. */
const en = raw(' lang="en" dir="ltr"');
/** A course subtitle ("Computer science in four games · grades 3–8"): the part after the last " · " never
 *  breaks inside itself, and where the line is narrow (phones, the home page's course cards) it takes its
 *  own line without the dot — never a line that starts with a dangling "·". */
export function subLine(text) {
  const at = String(text).lastIndexOf(' · ');
  if (at < 0) return text;
  return html`<span class="sub-a">${text.slice(0, at)}</span> <span class="sub-b"><span class="sub-dot">· </span>${text.slice(at + 3)}</span>`;
}

/** The home page's "Courses" row: the wide course cards side by side in one snap-scrolled rail (the shared .rail-track,
 *  at course-card width), each card's games nested in order as the unit overview (links to the course map's units),
 *  progress in steps, and Start / Keep going to the next open step (or the band picker). The track is a labelled,
 *  focusable scroll region; the arrows ride the shared rail-arrow wiring and hide when the rail has nothing to scroll. */
export function courseRow(items) {
  const { t } = current();
  if (!items.some(it => it.games.length)) return '';
  const title = t('courses.row');
  return html`<section class="rail courses">
    <div class="rail-head"><h2 id="courses-h">📚 ${title}</h2>
      <div class="rail-arrows" data-railnav="courses-track" hidden><button type="button" data-rail="courses-track" data-dir="-1" aria-label="${t('cards.scrollBack', { title })}"><span class="flip" aria-hidden="true">←</span></button><button type="button" data-rail="courses-track" data-dir="1" aria-label="${t('cards.scrollForward', { title })}"><span class="flip" aria-hidden="true">→</span></button></div>
    </div>
    <div class="course-rail"><div class="rail-track course-track" id="courses-track" role="region" aria-label="${title}" tabindex="0">
    ${items.filter(it => it.games.length).map(({ course: c, games, ov }) => {
      const go = ov.next ? `/courses/${c.slug}/${ov.next.step.key}` : `/courses/${c.slug}`;
      const begun = ov.list.some(s => s.read || s.checked);
      return html`<article class="course-card" aria-labelledby="course-${c.slug}-h">
        <div class="course-head">
          <span class="course-emo" aria-hidden="true">${c.emoji}</span>
          <div class="course-ht"><h3 id="course-${c.slug}-h"><a href="/courses/${c.slug}">${t(`${c.key}.title`)}</a></h3><p>${subLine(t(`${c.key}.sub`))}</p></div>
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
    </div></div>
  </section>`;
}

/** The course's name and what it is (the longer line only until a band is picked: then the map is the page). */
function hero(t, c, short = false) {
  return html`<header class="course-hero">
      <span class="course-emo big" aria-hidden="true">${c.emoji}</span>
      <div><h1>${t(`${c.key}.title`)}</h1><p class="lead">${subLine(t(`${c.key}.sub`))}</p>${short ? '' : html`<p>${t(`${c.key}.about`)}</p>`}</div>
    </header>`;
}
function teachersBox(t, c) {
  return html`<aside class="course-teach"><h2>🍎 ${t('courses.teachers.h')}</h2><p>${t(`${c.key}.teachers`)}</p>
      <a class="btn course-teach-go" href="${c.teacherPath}">${t('courses.teachers.link')}</a></aside>`;
}
/** The two band cards (a form: works without the page script). */
function bandPicker(t, c) {
  return html`<section class="bandpick" aria-labelledby="bandpick-h">
    <h2 id="bandpick-h">${t('courses.band.h')}</h2>
    <p class="muted">${t('courses.band.text')}</p>
    <form method="post" action="/courses/${c.slug}/band" class="bandpick-cards">
      ${C.bandsFor(c).map(b => html`<button class="bandcard" type="submit" name="band" value="${b}" id="band-${b}">
        <span class="bandcard-e" aria-hidden="true">${BAND_INFO[b].emoji}</span>
        <span class="bandcard-t"><span class="bandcard-h">${bandName(t, b)}</span><span class="bandcard-s">${bandGrades(t, b)}</span></span>
        <span class="bandcard-go flip" aria-hidden="true">›</span>
      </button>`)}
    </form>
  </section>`;
}

const STATE_ICON = { done: '✓', next: '▶', locked: '🔒', preview: '👁' };
function stateTag(t, state) {
  return html`<span class="cstate cstate-${state}"><span aria-hidden="true">${STATE_ICON[state]}</span> ${t(`courses.map.${state}`)}</span>`;
}
/** One step on the map: its lesson row and its game module row (or "talk about it"). Staff and the admin
 *  (preview) may open any lesson to look at it: their not-yet-done lessons read "Preview", not "Next" on
 *  every row (which looked like a broken lock). The game module row is two lines: the small "Game module"
 *  label, and the chapter's name under it. */
function mapStep(t, c, s, total, preview = false) {
  const { step } = s;
  const lesson = s.checked ? 'done' : preview ? 'preview' : !s.open ? 'locked' : 'next';
  const gameK = () => html`<span class="cmap-k cmap-k2"><span class="cmap-kl">🎮 ${t('courses.map.game')}</span><span class="cmap-gm"${en}>${step.game.chapterTitle}</span></span>`;
  const game = !step.game ? null : s.won ? 'done' : s.open && s.checked ? 'next' : 'locked';
  const href = `/courses/${c.slug}/${step.key}`;
  const cls = s.complete ? 'is-done' : s.open ? 'is-next' : 'is-locked';
  return html`<li class="cmap-step ${cls}" id="step-${step.key}">
    <span class="cmap-n" aria-hidden="true">${s.complete ? '✓' : step.index + 1}</span>
    <div class="cmap-body">
      <h4 class="cmap-title"><span class="sr-only">${t('courses.lesson.of', { n: step.index + 1, total })}: </span><span${en}>${step.title}</span></h4>
      ${s.open || preview ? html`<a class="cmap-row" href="${href}"><span class="cmap-k">📖 ${t('courses.map.lesson')}</span>${stateTag(t, lesson)}</a>`
        : html`<span class="cmap-row"><span class="cmap-k">📖 ${t('courses.map.lesson')}</span>${stateTag(t, lesson)}</span>`}
      ${step.game ? (game === 'locked' ? html`<span class="cmap-row">${gameK()}${stateTag(t, game)}</span>`
        : html`<a class="cmap-row" href="${href}#play">${gameK()}${stateTag(t, game)}</a>`)
        : html`<span class="cmap-row cmap-talk"><span class="cmap-k">💬 ${t('courses.map.talk')}</span></span>`}
    </div>
  </li>`;
}

/** A course's unit stamps (Cyber Defenders' six Defender stamps): a unit's stamp is earned when every step of the
 *  unit is done. Each unit header carries its own stamp, and the progress panel shows all of them at once. */
const stampEarned = (ov, gr) => { const l = ov.list.filter(s => s.step.group === gr.id); return l.length > 0 && l.every(s => s.complete); };
function stampBadge(t, name, earned, small = false) {
  const tip = earned ? t('courses.map.stampEarned') : t('courses.map.stampToEarn');
  return html`<span class="cstamp${earned ? ' is-earned' : ''}${small ? ' cstamp-s' : ''}" title="${tip}"><span class="cstamp-i" aria-hidden="true">${earned ? '🏅' : '🔖'}</span><span class="cstamp-n"${en}>${name}</span><span class="sr-only">: ${tip}</span></span>`;
}
function stampStrip(t, c, ov) {
  const gs = C.groupsFor(c).filter(gr => gr.stamp);
  if (!gs.length) return '';
  const got = gs.filter(gr => stampEarned(ov, gr)).length;
  return html`<div class="cstamps" id="cmap-stamps"><p class="cstamps-h"><b>${t('courses.map.stamps')}</b> · ${t('courses.map.stampsCount', { n: got, total: gs.length })}</p>
      <ul class="cstamps-l">${gs.map(gr => html`<li><a href="#${gr.id}">${stampBadge(t, gr.stamp, stampEarned(ov, gr), true)}</a></li>`)}</ul></div>`;
}

/** The note a kid sees on the map after a locked step sent them back (?locked=<step key>): which step to
 *  finish first (the first open step not done yet). */
export function lockedNote(t, ov, key) {
  if (!key || !ov.next || !ov.list.some(s => s.step.key === key && !s.open)) return '';
  return html`<p class="notice cmap-locked" role="status" id="cmap-locked"><span aria-hidden="true">🔒</span> ${t('courses.map.lockedNote', { n: ov.next.step.index + 1 })} <a href="#step-${ov.next.step.key}"${en}>${ov.next.step.title}</a></p>`;
}
/** The course page: the band picker (first time), then the course map. On a laptop the map runs in the
 *  main column and the progress, the Studio card and the teachers' box ride beside it (.cmap-side). */
export function coursePage({ course: c, games, ov, canPick, preview = false, locked = '' }) {
  const { t } = current();
  const bySlug = new Map(games.map(g => [g.slug, g]));
  const other = ov.band && C.bandsFor(c).find(b => b !== ov.band);
  const unitsLabel = units => (units.length > 1 ? t('courses.map.units', { from: units[0], to: units[units.length - 1] }) : t('courses.map.unit', { n: units[0] }));
  return html`<section class="course-page">
    <a class="back small" href="/">← ${t('courses.home')}</a>
    ${hero(t, c, !!ov.band)}
    ${!ov.band ? html`${canPick ? bandPicker(t, c) : ''}${teachersBox(t, c)}` : html`
    <div class="cmap-layout">
    <div class="cmap-side">
    <section class="cmap-top" aria-labelledby="cmap-h">
      <h2 id="cmap-h" class="sr-only">${t('courses.map.h')}</h2>
      <div class="cmap-band"><span>${BAND_INFO[ov.band].emoji} <b>${bandName(t, ov.band)}</b> · ${bandGrades(t, ov.band)}</span>
        ${other ? html`<form method="post" action="/courses/${c.slug}/band"><button class="linkbtn" type="submit" name="band" value="${other}" id="band-switch">${t('courses.band.switch', { band: bandName(t, other) })}</button></form>` : ''}</div>
      <div class="cprog" role="progressbar" aria-valuemin="0" aria-valuemax="${ov.total}" aria-valuenow="${ov.done}" aria-label="${t('courses.stepsDone', { n: ov.done, total: ov.total })}"><span style="width:${Math.round(ov.done / Math.max(1, ov.total) * 100)}%"></span></div>
      <p class="cmap-count">${t('courses.stepsDone', { n: ov.done, total: ov.total })}</p>
      ${stampStrip(t, c, ov)}
      ${ov.next ? html`<a class="btn btn-primary btn-big cmap-go" href="/courses/${c.slug}/${ov.next.step.key}" id="cmap-go">▶ ${ov.done ? t('courses.continue') : t('courses.start')}</a>` : ''}
    </section>
    <aside class="cmap-build"><span class="cmap-build-e" aria-hidden="true">🛠️</span><div><h3>${t('courses.map.build.h')}</h3><p>${t('courses.map.build.text')}</p>
      <a class="btn" href="/build">${t('courses.map.build.go')}</a></div></aside>
    ${teachersBox(t, c)}
    </div>
    <div class="cmap-main">
    ${lockedNote(t, ov, locked)}
    ${C.groupsFor(c).map(gr => {
      const list = ov.list.filter(s => s.step.group === gr.id);
      if (!list.length) return '';
      const g = gr.game && bySlug.get(gr.game);
      const sub = gr.sub ? html`<span${en}>${gr.sub}</span>` : gr.units.length ? unitsLabel(gr.units) : '';
      return html`<section class="cmap-group" id="${gr.id}" aria-labelledby="${gr.id}-h">
        <header class="cmap-gh">
          <span class="cmap-cover cmap-cover-e" aria-hidden="true">${gr.emoji || '💡'}</span>
          <div><h3 id="${gr.id}-h">${gr.title ? html`<span${en}>${gr.title}</span>` : gr.titleKey ? t(gr.titleKey) : g ? g.title : gr.id}</h3>${sub ? html`<p class="muted small">${sub}</p>` : ''}</div>
          ${gr.stamp ? stampBadge(t, gr.stamp, stampEarned(ov, gr)) : ''}
        </header>
        <ol class="cmap-steps">${list.map(s => mapStep(t, c, s, ov.total, preview))}</ol>
      </section>`;
    })}
    </div>
    </div>`}
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
  // Number Quest's topics: measuring, time, money, weighing, fractions, shapes, angles, chance, Tally.
  ruler: ['📏', '📐', '🔢', 'sky'], clock: ['🕒', '⏱️', '📅', 'sky'], coins: ['🪙', '💵', '🧾', 'spark'], scale: ['⚖️', '📦', '🔢', 'mint'],
  cake: ['🍰', '🔪', '🍽️', 'rose'], shapes: ['🔺', '🟦', '📐', 'sky'], angle: ['📐', '↪️', '🧭', 'mint'], dice: ['🎲', '🎡', '❓', 'spark'],
  cat: ['🐱', '🔢', '✨', 'mint'],
};
function art(id) {
  const [main, a, b, tone] = ART[id] || ART.lightbulb;
  return html`<div class="sart sart-${tone}" aria-hidden="true"><span class="sart-shape"></span><span class="sart-a">${a}</span><span class="sart-main">${main}</span><span class="sart-b">${b}</span></div>`;
}
/** A slide's picture: the in-game screenshot (img: manifest key, file at /img/<key>.webp; its `view` crop), a drawn
 *  diagram (visual) or the story stage, else the emoji art above, every slide's fallback. See "pictures" below. */
/** The story layer's cast, in course order: name and piece colour (sprites extracted from their own games —
 *  scripts/csq-sprites.js — at /img/csq/chars/<id>.webp). */
const CHAR_META = {
  bolt: { name: 'Bolt', color: '#4FA8F0' }, dot: { name: 'Dot', color: '#F2994A' },
  pim: { name: 'Pim', color: '#FFD23F' }, gizmo: { name: 'Gizmo', color: '#8FC1F5' },
  tally: { name: 'Tally', color: '#66C792' },
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
/** The Numberworks street (Number Quest's story scene): four workshop fronts — roofs, shutter doors, one
 *  window each — drawn in the town silhouette's own ink, with the windows lit per the scene's lit count
 *  (0-4: how many workshops are awake). Tally stands in front of them in the usual cast row. No Spark, no
 *  pieces: that plot is CS Quest's; the street is Number Quest's own stage, animated by the same CSS
 *  discipline (entrance under [data-story-on], her purr idle on the sprite, the finished frame otherwise). */
function streetHtml(st) {
  const front = (x, i) => html`<g>
    <path d="M${x - 4} 48 L${x + 44} 16 L${x + 92} 48 Z"/>
    <rect x="${x}" y="48" width="88" height="102"/>
    <rect x="${x + 27}" y="70" width="34" height="12"/>
    <rect x="${x + 29}" y="92" width="30" height="58"/>
    ${[102, 114, 126, 138].map(y => html`<line x1="${x + 31}" y1="${y}" x2="${x + 57}" y2="${y}" stroke-width="2"/>`)}
    <rect class="story-swin${i < st.lit ? ' is-lit' : ''}" x="${x + 10}" y="56" width="24" height="20" rx="2"/>
  </g>`;
  return html`<svg class="story-street" viewBox="0 0 400 150" preserveAspectRatio="none" aria-hidden="true">${[8, 106, 204, 302].map((x, i) => front(x, i))}</svg>`;
}
function streetArt(st) {
  return html`<figure class="smedia story" data-story data-scene="street" data-lit="${st.lit}">
    <div class="story-stage" aria-hidden="true">
      ${streetHtml(st)}
      <div class="story-cast">${st.chars.map((id, i) => storyChar(id, i))}</div>
    </div>
  </figure>`;
}
/** A slide's story stage (the story & intro pack): the Spark, its pieces and the characters, animated by
 *  public/js/course.js + CSS keyframes when the stage scrolls into view. The stage is decoration (aria-hidden):
 *  the slide's title and text always carry the story in words. With no script, or under reduced motion, the
 *  CSS shows the finished frame — pieces lit per the scene's count, the cast in place, the Spark as bright as
 *  the story has made it. The script first arms the stage (start positions) and then plays it once per view. */
function storyArt(t, s) {
  const st = s.story;
  if (st.scene === 'street') return streetArt(st);
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
// ------------------------------------------------------------------------------------------------- pictures
// Every slide picture sits in a frame (.sframe) whose aspect is the region it shows:
//   - a screenshot (img) shows its `view` [x, y, w, h] (% of the original 1280x720 picture; the whole picture
//     without one), scaled to the frame's width, so a phone can read the part the slide is about. A cropped
//     picture opens whole in a small viewer on a tap (the frame's .szoom link: the image itself without script);
//   - a drawn diagram (visual) shows the drawing's own content band (visualFit): no empty band above or below.
// Focus boxes and paths stay authored in % of the ORIGINAL picture (diagrams: of the 100 x 56.25 drawing) and
// are remapped into the frame here. The overlay's SVG space is 100 wide and `fh` tall (the frame's height for a
// width of 100), so a path is drawn at the frame's own aspect and its stroke and dashes stay even.
const r2 = v => Math.round(v * 100) / 100;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
/** The region a slide's frame shows: { vx, vy, vw, vh } in % of the original picture, fh (frame height per
 *  100 of width) and, for a diagram, its viewBox top y0. */
export function frameOf(s) {
  if (s.visual) {
    const [y0, y1] = visualFit(s.visual, s.focus);
    return { vx: 0, vy: y0 / 0.5625, vw: 100, vh: (y1 - y0) / 0.5625, fh: r2(y1 - y0), y0: r2(y0) };
  }
  const [vx, vy, vw, vh] = s.view || [0, 0, 100, 100];
  return { vx, vy, vw, vh, fh: r2(56.25 * vh / vw), y0: 0 };
}
/** A focus box, from % of the original picture to % of the frame (clamped inside it). */
export function boxIn(f, b) {
  const x1 = clamp((b[0] - f.vx) / f.vw * 100, 0, 100), y1 = clamp((b[1] - f.vy) / f.vh * 100, 0, 100);
  const x2 = clamp((b[0] + b[2] - f.vx) / f.vw * 100, 0, 100), y2 = clamp((b[1] + b[3] - f.vy) / f.vh * 100, 0, 100);
  return [r2(x1), r2(y1), r2(Math.max(1, x2 - x1)), r2(Math.max(1, y2 - y1))];
}
/** A path point, from % of the original picture to the overlay's SVG space (100 x fh). */
const ptIn = (f, p) => [r2((p[0] - f.vx) / f.vw * 100), r2((p[1] - f.vy) / f.vh * f.fh)];
/** The guided-focus layer, shared by screenshot slides (img) and drawn-diagram slides (visual): one numbered
 *  box (and dotted path) per step, played by public/js/course.js. A screenshot's cue rides on the picture as a
 *  chip the script parks clear of the step's box and badge (falling back to the caption strip under the
 *  picture when no spot is clear); a diagram's cue always goes in the strip, never over the drawing. */
function gfLayer(t, s, f) {
  const vf = !!s.visual;
  return html`<div class="gf-layer" aria-hidden="true">${s.focus.map((st, i) => {
    const b = boxIn(f, st.box);
    return html`
      <div class="gf-step" data-i="${i}">
        ${st.path ? html`<svg class="gf-path" viewBox="0 0 100 ${f.fh}" preserveAspectRatio="none"><polyline points="${st.path.map(p => ptIn(f, p).join(',')).join(' ')}" pathLength="100" vector-effect="non-scaling-stroke"></polyline></svg>` : ''}
        <div class="gf-box" style="--bx:${b[0]};--by:${b[1]};left:${b[0]}%;top:${b[1]}%;width:${b[2]}%;height:${b[3]}%"><span class="gf-badge">${i + 1}</span></div>
        ${vf ? '' : html`<div class="gf-cue${b[1] + b[3] / 2 > 66 ? ' gf-cue--top' : ''}"><span class="gf-cue-n">${i + 1}</span>${st.cue}</div>`}
      </div>`;
  })}
    </div>`;
}
/** The caption strip under a toured picture: the active step's numbered cue (a diagram's always; a
 *  screenshot's only when its chip finds no clear spot on the picture). The cells share one grid cell, so the
 *  strip is as tall as its longest cue and never jumps between steps. Decoration (aria-hidden): the cue list
 *  in the figcaption carries the words for assistive tech, and is the visible list in the static mode. */
function gfStrip(t, s) {
  return html`<div class="gf-strip" aria-hidden="true">${s.focus.map((st, i) => html`<p class="gf-sc" data-i="${i}"><span class="gf-cue-n">${i + 1}</span><span>${st.cue}</span></p>`)}</div>`;
}
const gfReplay = t => html`<button class="gf-replay" type="button" hidden><span aria-hidden="true">↻</span> ${t('courses.lesson.replayFocus')}</button>`;
const gfCues = s => html`<figcaption class="gf-cues"><ol>${s.focus.map(st => html`<li>${st.cue}</li>`)}</ol></figcaption>`;
/** A drawn math diagram (Number Quest's CPA pictorial step): the slide's `visual` data rendered as one
 *  SVG in the same 100 x 56.25 space the guided-focus boxes are written in, on the brand Cream ground so it
 *  reads the same in light and dark themes. These are the lesson's own worked numbers drawn — place-value
 *  cards, a number line with hops, bar models, fraction bars, an array, a tile strip — never decoration:
 *  every label is a number or word the slide's text teaches. Layouts are fixed per type so the authored
 *  focus boxes land on the part they name; the frame then shows only the drawing's content band (visualFit).
 *  Tones cycle the brand palette. */
const VF_TONES = ['#66C792', '#FFD23F', '#8FC1F5', '#F2A65A'];
/** The one drawn caption a diagram carries (tiles and array visuals) is centred over the frame, so
 *  at the standard 3.8 units a long caption overflows the 100-wide frame and clips at both edges —
 *  measured on the rendered slides: a 69-character caption renders 120 units wide. The fit size
 *  below comes from the measured per-character width of the slide font at weight 700 (worst observed
 *  0.52em across every caption in the decks, with headroom); short captions keep the standard size. */
const labelFs = s => Math.min(3.8, 168 / String(s).length);
/** Shape names a tile strip draws as real shapes (the geometry steps): a polygon's corner count (0: circle). */
const SHAPES = { triangle: 3, square: 4, rectangle: 4, rhombus: 4, pentagon: 5, hexagon: 6, octagon: 8, circle: 0 };
const isShapeStrip = v => v.type === 'tiles' && v.values.every(x => Object.hasOwn(SHAPES, String(x).toLowerCase()));
/** The top and bottom of a text line drawn at baseline y with this font size (the slide font's ascent and
 *  descent, with a little room). */
const tTop = (y, size) => y - 0.84 * size, tBot = (y, size) => y + 0.28 * size;
/** Where a diagram's drawing sits, top to bottom, in the 100 x 56.25 space: [a, b]. The same numbers
 *  visualSvg draws with (the two must change together). */
function visualExtent(v) {
  if (v.type === 'places') return [9, tBot(43, 4.2)];
  if (v.type === 'numberline') {
    const tallest = Math.max(0, ...(v.stacks || []).map(k => k.n));
    const a = Math.min(33.4, v.point ? tTop(28.5, 4.6) : 99, v.hops && v.hops.length ? tTop(17.5, 3.8) : 99, tallest ? 33 - tallest * 4.2 - 1.6 : 99);
    return [a, tBot(numberlineLabels(v).some(m => m.y > 45) ? 52.3 : 45, 3.6)];
  }
  if (v.type === 'bars' || v.type === 'fraction') {
    const n = v.rows.length, yOff = n === 1 ? 13 : n === 2 ? 5 : 0;
    return [v.half ? tTop(3.4 + yOff, 3.2) : tTop(8 + yOff - 1.8, 3.7), 8 + yOff + (n - 1) * 17 + 8.5];
  }
  if (v.type === 'array') {
    const a = v.label ? tTop(6.5, labelFs(v.label)) : 10 + 17 / v.rows - 2.3;
    return [a, v.extra ? 53 : 10 + (v.rows - 0.5) * 34 / v.rows + 2.3];
  }
  if (v.type === 'tiles') {
    const shapes = isShapeStrip(v);
    return [v.label ? tTop(10, labelFs(v.label)) : shapes ? 14 : 18, shapes ? 44 : v.bad != null ? tBot(40, 3.4) : 33];
  }
  if (v.type === 'shapes') return [9, tBot(48, shapeNameFs(v))];
  if (DIAGRAM_TYPES.has(v.type)) return diagramExtent(v); // grid, squares, lines, chart, table: views/nq-diagrams.js
  return [0, 56.25];
}
/** The diagram's content band [y0, y1] in the 100 x 56.25 space: the drawing with a margin, grown to hold
 *  every focus box (and its ring), never flatter than 4.4 : 1. */
export function visualFit(v, focus) {
  let [a, b] = visualExtent(v);
  a -= 4; b += 4;
  for (const st of focus || []) { a = Math.min(a, st.box[1] * 0.5625 - 4); b = Math.max(b, (st.box[1] + st.box[3]) * 0.5625 + 4); }
  a = Math.max(0, a); b = Math.min(56.25, b);
  if (b - a < 22.7) { const m = (22.7 - (b - a)) / 2; a = Math.max(0, a - m); b = Math.min(56.25, a + 22.7); a = Math.max(0, b - 22.7); }
  return [r2(a), r2(b)];
}
/** A number line's mark labels, placed (see visualSvg): { at, label, cx, hw, y }. */
function numberlineLabels(v) {
  const X = at => 6 + ((at - v.min) / (v.max - v.min)) * 88;
  // Mark labels are centred on their ticks; where two ticks sit close together (287 and 300 on the
  // counting-up line) the centred labels print over each other — measured overlap 1.7 units — so
  // label centres are nudged apart until they clear. The ticks stay at their true positions;
  // only the words move, and only on lines whose labels actually collide.
  const mlabels = (v.marks || []).map(m => ({ at: m.at, label: m.label, cx: X(m.at), hw: Math.max(1.7, String(m.label).length * 1.12), y: 45 }));
  const byX = [...mlabels].sort((a, b) => a.cx - b.cx);
  const trueCx = byX.map(c => c.cx);
  for (let i = 1; i < byX.length; i++) { const p = byX[i - 1], c = byX[i]; const min = p.cx + p.hw + 1.2 + c.hw; if (c.cx < min) c.cx = min; }
  for (let i = byX.length - 1; i >= 0; i--) {
    const c = byX[i];
    if (c.cx > 99.3 - c.hw) c.cx = 99.3 - c.hw;
    if (i > 0) { const p = byX[i - 1]; const maxP = c.cx - c.hw - 1.2 - p.hw; if (p.cx > maxP) p.cx = maxP; }
  }
  for (const c of byX) if (c.cx < 0.7 + c.hw) c.cx = 0.7 + c.hw;
  // A cluster of ticks so close that nudging would shove a label more than 4 units off its own
  // tick (398 and 400 on the 398–703 line: centres 0.6 apart, labels 6.7 wide, measured print
  // overlap 49 units²) reads worse than the collision it fixes — the word ends up nearer the
  // neighbour's tick than its own. Those clusters keep their true centres and take turns on a
  // second row instead, the way textbooks stagger crowded axis labels.
  for (let i = 0; i < byX.length; i++) {
    let j = i;
    while (j + 1 < byX.length && trueCx[j + 1] - byX[j + 1].hw < trueCx[j] + byX[j].hw) j++;
    if (j > i && Math.max(...byX.slice(i, j + 1).map((c, k) => Math.abs(c.cx - trueCx[i + k]))) > 4) {
      byX.slice(i, j + 1).forEach((c, k) => { c.cx = trueCx[i + k]; c.y = k % 2 ? 52.3 : 45; });
    }
    i = j;
  }
  return mlabels;
}
function visualSvg(v, f) {
  const ink = '#141414', leaf = '#1F9D63';
  const tx = (x, y, str, size, anchor = 'middle', weight = 700, fill = ink) =>
    raw(`<text x="${x}" y="${y}" font-size="${size}" text-anchor="${anchor}" font-weight="${weight}" fill="${fill}">${String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;')}</text>`);
  let body = '';
  if (v.type === 'places') {
    const n = v.cols.length, cw = 88 / n;
    body = v.cols.map((c, i) => {
      const x = 6 + i * cw;
      return raw(`<rect x="${(x + 1.5).toFixed(2)}" y="9" width="${(cw - 3).toFixed(2)}" height="19" rx="2" fill="#FFFFFF" stroke="${ink}" stroke-width="0.7"/>`)
        + tx(x + cw / 2, 23.5, c.d, 11) + tx(x + cw / 2, 35, c.place, 3.6, 'middle', 600)
        + tx(x + cw / 2, 43, c.value, 4.2, 'middle', 800, leaf);
    }).join('');
  } else if (v.type === 'numberline') {
    const X = at => 6 + ((at - v.min) / (v.max - v.min)) * 88;
    const mlabels = numberlineLabels(v);
    body = raw(`<line x1="6" y1="36" x2="94" y2="36" stroke="${ink}" stroke-width="0.8"/><path d="M94 36 l-3 -1.8 v3.6 z" fill="${ink}"/>`)
      + (v.hops || []).map(h => {
        const x1 = X(h.from), x2 = X(h.to), mid = (x1 + x2) / 2;
        return raw(`<path d="M${x1.toFixed(2)} 34 Q${mid.toFixed(2)} 20 ${x2.toFixed(2)} 34" fill="none" stroke="${leaf}" stroke-width="0.9"/>`)
          + tx(mid, 17.5, h.label, 3.8, 'middle', 800, leaf);
      }).join('')
      + mlabels.map(m => raw(`<line x1="${X(m.at).toFixed(2)}" y1="33.4" x2="${X(m.at).toFixed(2)}" y2="38.6" stroke="${ink}" stroke-width="0.7"/>`)
        + tx(m.cx, m.y, m.label, 3.6, 'middle', 700)).join('')
      + (v.stacks || []).map(k => Array.from({ length: k.n }, (_, j) => {
        // A line plot's stack: one x per data point, piled up above its mark.
        const cx = X(k.at), cy = 31.2 - j * 4.2, d = 1.7; // an X 3.4 units tall: 11 px on a 390 px phone
        return raw(`<path d="M${r2(cx - d)} ${r2(cy - d)} L${r2(cx + d)} ${r2(cy + d)} M${r2(cx + d)} ${r2(cy - d)} L${r2(cx - d)} ${r2(cy + d)}" stroke="${leaf}" stroke-width="1" stroke-linecap="round"/>`);
      }).join('')).join('')
      + (v.point ? raw(`<circle cx="${X(v.point.at).toFixed(2)}" cy="36" r="2.3" fill="#FFD23F" stroke="${ink}" stroke-width="0.7"/>`)
        + tx(X(v.point.at), 28.5, v.point.label, 4.6, 'middle', 800) : '');
  } else if (v.type === 'bars' || v.type === 'fraction') {
    const rows = v.type === 'fraction'
      ? v.rows.map(r => ({ label: r.label, parts: Array.from({ length: r.cuts }, (_, i) => ({ w: 1 / r.cuts, label: '', tone: i < r.shaded ? 0 : -1 })) }))
      : v.rows;
    const yOff = rows.length === 1 ? 13 : rows.length === 2 ? 5 : 0;
    body = rows.map((r, ri) => {
      const y = 8 + yOff + ri * 17;
      let x = 6, parts = '';
      for (const p of r.parts) {
        const w = p.w * 88;
        const fill = p.unknown ? '#FFFFFF' : p.tone === -1 || p.tone == null && v.type === 'fraction' ? '#FFFFFF' : VF_TONES[(p.tone || 0) % VF_TONES.length];
        parts += raw(`<rect x="${x.toFixed(2)}" y="${y}" width="${w.toFixed(2)}" height="8.5" fill="${fill}" stroke="${ink}" stroke-width="0.6"${p.unknown ? ' stroke-dasharray="1.6 1.2"' : ''}/>`)
          + (p.label ? tx(x + w / 2, y + 5.9, p.label, Math.min(3.6, Math.max(2.4, w / Math.max(3, String(p.label).length) * 1.5))) : '')
          + (p.unknown ? tx(x + w / 2, y + 5.9, '?', 4.4, 'middle', 800, leaf) : '');
        x += w;
      }
      return tx(6, y - 1.8, r.label, 3.7, 'start', 700) + parts;
    }).join('') + (v.half ? raw(`<line x1="50" y1="${(4 + yOff).toFixed(1)}" x2="50" y2="${(8 + yOff + rows.length * 17 - 6).toFixed(1)}" stroke="${leaf}" stroke-width="0.7" stroke-dasharray="2 1.6"/>`) + tx(50, (3.4 + yOff).toFixed(1), 'halfway', 3.2, 'middle', 700, leaf) : '');
  } else if (v.type === 'array') {
    const R = v.rows, C = v.cols;
    let dots = '';
    // One array across the middle; or, turned (`turn`), the R x C array and its C x R twin side by side.
    const grids = v.turn ? [[R, C, 6, 42], [C, R, 52, 42]] : [[R, C, 14, 72]];
    for (const [gr, gc, x0, gw] of grids) {
      const step = Math.min(gw / gc, 34 / gr), w = step * gc, h = step * gr, left = x0 + (gw - w) / 2, top = 10 + (34 - h) / 2;
      const rad = Math.min(2.05, step * 0.36);
      for (let r = 0; r < gr; r++) for (let c = 0; c < gc; c++) {
        const cx = left + (c + 0.5) * step, cy = v.turn ? top + (r + 0.5) * step : 10 + (r + 0.5) * (34 / gr);
        const cxx = v.turn ? cx : 14 + (c + 0.5) * (72 / gc);
        dots += raw(`<circle cx="${cxx.toFixed(2)}" cy="${cy.toFixed(2)}" r="${v.turn ? r2(rad) : 2.05}" fill="${VF_TONES[0]}" stroke="${ink}" stroke-width="0.45"/>`);
      }
    }
    if (v.extra) dots += raw(`<circle cx="50" cy="50.5" r="2.05" fill="#FFD23F" stroke="${ink}" stroke-width="0.6"/>`) + tx(55, 52, v.extraLabel || '1 left over', 3.6, 'start', 800, leaf);
    body = dots + (v.label ? tx(50, 6.5, v.label, labelFs(v.label), 'middle', 700) : '');
  } else if (v.type === 'tiles') {
    const n = v.values.length, bw = (88 - (n - 1) * 2) / n;
    // One text size for the whole row (the longest value sets it): "12 seeds" and "9:05" side by side read
    // as one strip, not as a big tile and a small one.
    const fs = r2(Math.min(...v.values.map(x => Math.min(3.8, (bw - 3) / (String(x).length * 0.56)))));
    const shapes = isShapeStrip(v);
    body = v.values.map((val, i) => {
      const x = 6 + i * (bw + 2), bad = [].concat(v.bad ?? []).includes(i), cx = x + bw / 2;
      if (shapes) {
        const name = String(val).toLowerCase(), k = SHAPES[name], cy = 25.5, rr = Math.min(7.2, bw / 2 - 2.5);
        let shape;
        if (!k) shape = `<circle cx="${r2(cx)}" cy="${cy}" r="${r2(rr)}"`;
        else if (name === 'rectangle') shape = `<rect x="${r2(cx - rr * 1.25)}" y="${r2(cy - rr * 0.7)}" width="${r2(rr * 2.5)}" height="${r2(rr * 1.4)}"`;
        else {
          const rot = name === 'rhombus' ? 0 : k === 4 ? Math.PI / 4 : -Math.PI / 2;
          const sy = name === 'rhombus' ? 1.25 : 1, dy = k === 3 ? rr * 0.18 : 0;
          const pts = Array.from({ length: k }, (_, j) => { const a = rot + j * 2 * Math.PI / k; return `${r2(cx + rr * Math.cos(a))},${r2(cy + dy + rr * sy * Math.sin(a))}`; }).join(' ');
          shape = `<polygon points="${pts}"`;
        }
        return raw(`<rect x="${x.toFixed(2)}" y="14" width="${bw.toFixed(2)}" height="30" rx="1.8" fill="#FFFFFF" stroke="${ink}" stroke-width="0.7"/>`)
          + raw(`${shape} fill="${VF_TONES[i % VF_TONES.length]}" stroke="${ink}" stroke-width="0.7"/>`)
          + tx(cx, 40.2, val, fs);
      }
      return raw(`<rect x="${x.toFixed(2)}" y="18" width="${bw.toFixed(2)}" height="15" rx="1.8" fill="${bad ? '#FFE1D6' : '#FFFFFF'}" stroke="${bad ? '#C2431F' : ink}" stroke-width="${bad ? 1 : 0.7}"${bad ? ' stroke-dasharray="2 1.4"' : ''}/>`)
        + tx(cx, r2(25.5 + fs * 0.36), val, fs)
        + (bad ? tx(cx, 40, 'swapped!', 3.4, 'middle', 800, '#C2431F') : '');
    }).join('') + (v.label ? tx(50, 10, v.label, labelFs(v.label), 'middle', 700) : '');
  }
  else if (v.type === 'shapes') body = shapesBody(v, tx, ink);
  else if (DIAGRAM_TYPES.has(v.type)) body = raw(diagramSvg(v));
  return raw(`<svg class="vf-svg" viewBox="0 ${f.y0} 100 ${f.fh}" role="img" aria-label="${String(v.label || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;')}" preserveAspectRatio="xMidYMid meet"><rect x="0" y="0" width="100" height="56.25" fill="#FFFDF2"/>${body}</svg>`);
}
/** A shapes diagram's one name size: the longest name sets it (one text size per row). */
function shapeNameFs(v) {
  const cw = 88 / v.items.length;
  return r2(Math.min(...v.items.map(it => Math.min(3.8, (cw - 3) / (it.name.length * 0.56)))));
}
/** Real drawn shapes: n equal cells across 6-94, each a regular outline centred in the band y 10-40 and its
 *  name under it at y 48; `corners` marks the right angles with small squares. */
function shapesBody(v, tx, ink) {
  const n = v.items.length, cw = 88 / n, fs = shapeNameFs(v);
  return v.items.map((it, i) => {
    const cx = 6 + cw * (i + 0.5), cy = 25, R = Math.min(13, cw / 2 - 3);
    let pts;
    const poly = (k, rot) => Array.from({ length: k }, (_, j) => { const a = rot + j * 2 * Math.PI / k; return [cx + R * Math.cos(a), cy + R * Math.sin(a)]; });
    if (it.shape === 'triangle') pts = poly(3, -Math.PI / 2).map(([x, y]) => [x, y + R * 0.25]);
    else if (it.shape === 'square') { const h = R * 0.78; pts = [[cx - h, cy - h], [cx + h, cy - h], [cx + h, cy + h], [cx - h, cy + h]]; }
    else if (it.shape === 'rectangle') { const w = R, h = R * 0.6; pts = [[cx - w, cy - h], [cx + w, cy - h], [cx + w, cy + h], [cx - w, cy + h]]; }
    else if (it.shape === 'pentagon') pts = poly(5, -Math.PI / 2).map(([x, y]) => [x, y + R * 0.1]);
    else if (it.shape === 'hexagon') pts = poly(6, 0);
    else if (it.shape === 'rhombus') pts = [[cx, cy - R], [cx + R * 0.72, cy], [cx, cy + R], [cx - R * 0.72, cy]];
    else if (it.shape === 'parallelogram') { const w = R * 0.75, h = R * 0.55, k = R * 0.32; pts = [[cx - w + k, cy - h], [cx + w + k, cy - h], [cx + w - k, cy + h], [cx - w - k, cy + h]]; }
    else { const h = R * 0.6; pts = [[cx - R * 0.5, cy - h], [cx + R * 0.5, cy - h], [cx + R, cy + h], [cx - R, cy + h]]; } // trapezoid
    let marks = '';
    if (it.corners) {
      // A right-angle mark in every square corner (the corner's two sides meet at 90 degrees).
      const m = Math.min(2.2, R * 0.2);
      pts.forEach((p, j) => {
        const a = pts[(j + pts.length - 1) % pts.length], b = pts[(j + 1) % pts.length];
        const u = [a[0] - p[0], a[1] - p[1]], w = [b[0] - p[0], b[1] - p[1]];
        const lu = Math.hypot(...u), lw = Math.hypot(...w);
        if (Math.abs((u[0] * w[0] + u[1] * w[1]) / (lu * lw)) > 0.02) return;
        const q1 = [p[0] + u[0] / lu * m, p[1] + u[1] / lu * m], q2 = [p[0] + w[0] / lw * m, p[1] + w[1] / lw * m];
        const c = [q1[0] + w[0] / lw * m, q1[1] + w[1] / lw * m];
        marks += `<path d="M${r2(q1[0])} ${r2(q1[1])} L${r2(c[0])} ${r2(c[1])} L${r2(q2[0])} ${r2(q2[1])}" fill="none" stroke="${ink}" stroke-width="0.5"/>`;
      });
    }
    return raw(`<polygon points="${pts.map(([x, y]) => `${r2(x)},${r2(y)}`).join(' ')}" fill="${VF_TONES[i % VF_TONES.length]}" stroke="${ink}" stroke-width="0.7" stroke-linejoin="round"/>${marks}`)
      + tx(r2(cx), 48, it.name, fs);
  }).join('');
}
/** A screenshot in its frame: the whole picture, or its `view` region scaled to the frame's width. */
function shotImg(s, f) {
  const crop = !!s.view;
  const style = crop ? `width:${r2(10000 / f.vw)}%;height:${r2(10000 / f.vh)}%;left:${r2(-f.vx / f.vw * 100)}%;top:${r2(-f.vy / f.vh * 100)}%` : '';
  return html`<img class="simg${crop ? ' simg--crop' : ''}" src="/img/${s.img}.webp" alt="${s.alt || ''}" width="1280" height="720" loading="lazy" decoding="async"${style ? raw(` style="${style}"`) : ''}>`;
}
function slideArt(t, s) {
  if (s.story) return storyArt(t, s);
  if (!s.visual && !s.img) return art(s.art);
  const f = frameOf(s);
  const gf = !!s.focus, vf = !!s.visual, crop = !vf && !!s.view;
  // --ar: the frame's width / height; --fhr: its height as a fraction of its width (the badge's clamps).
  const style = `--ar:${r2(100 / f.fh)};--fhr:${r2(f.fh / 100)}`;
  const pic = vf ? visualSvg(s.visual, f) : shotImg(s, f);
  return html`<figure class="smedia${gf ? ' gf' : ''}${vf ? ' vf' : ''}${crop ? ' crop' : ''}" style="${style}"${gf ? raw(' data-gf') : ''}>
    <div class="sframe">${pic}${gf ? gfLayer(t, s, f) : ''}${crop ? html`<a class="szoom" href="/img/${s.img}.webp" data-zoom aria-label="${t('courses.lesson.wholePicture')}"><span aria-hidden="true">⤢</span></a>` : ''}${gf && !vf ? gfReplay(t) : ''}</div>
    ${gf ? html`${gfStrip(t, s)}${vf ? gfReplay(t) : ''}${gfCues(s)}` : ''}
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
    ${qs.map((qq, qi) => html`<fieldset class="qq" data-q="${qq.id}" id="q-${qi + 1}" aria-describedby="q-${qi + 1}-fb">
      <legend><span class="qq-n">${t('courses.check.q', { n: qi + 1, total: qs.length })}</span><span class="qq-t"${en}>${qq.q}</span></legend>
      <div class="qq-choices"${en}>${qq.choices.map(ch => html`<label class="qchoice"><input type="radio" name="${qq.id}" value="${ch.i}" required><span>${ch.text}</span></label>`)}</div>
      <p class="qq-fb" id="q-${qi + 1}-fb" role="status" aria-live="polite"></p>
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
export function stepPage({ course: c, s, total, next, seed, result, signedIn, slides: deckSlides }) {
  const { t } = current();
  const { step } = s;
  const qs = C.questions(step, seed);
  const slides = deckSlides || step.slides;
  const n = slides.length;
  return html`<article class="cl-page" data-step="${step.key}">
    <a class="back small" href="/courses/${c.slug}#step-${step.key}">← ${t('courses.lesson.map')}</a>
    <header class="cl-head">
      <p class="cl-kicker">${t(`${c.key}.title`)} · ${t('courses.lesson.of', { n: step.index + 1, total })} · <span${en}>${step.topic}</span></p>
      <h1${en}>${step.title}</h1>
    </header>
    <div class="deck" id="deck" lang="en" dir="ltr" role="region" aria-roledescription="carousel" aria-label="${step.title}">
      ${slides.map((sl, i) => slide(t, sl, i, n, step))}
    </div>
    <nav class="deck-nav" id="deck-nav" hidden aria-label="${t('courses.lesson.slides')}">
      <button class="btn" type="button" id="deck-back">‹ ${t('courses.lesson.back')}</button>
      <div class="deck-dots" id="deck-dots">${slides.map((_, i) => html`<button type="button" class="dot" data-i="${i}" aria-label="${t('courses.lesson.slide', { n: i + 1, total: n })}"></button>`)}</div>
      <button class="btn btn-primary" type="button" id="deck-next" data-next="${t('courses.lesson.next')} ›" data-check="${t('courses.lesson.toCheck')} ›">${t('courses.lesson.next')} ›</button>
    </nav>
    <section class="cl-check" id="check" aria-labelledby="check-h" data-done="${s.checked ? '1' : ''}" data-read="${s.read ? '1' : ''}">
      <h2 id="check-h">✅ ${t('courses.check.h')}</h2>
      ${s.checked ? html`<p class="cl-passed">✓ ${t('courses.check.done')}</p>
        ${c.slug === 'number-quest' ? html`<p class="nq-passed-tally"><img class="nq-tally-img" src="/img/csq/chars/tally.webp" alt="" width="219" height="353"> <span lang="en" dir="ltr">Tally is purring: check passed. The mission is open below.</span></p>` : ''}`
        : html`<p class="muted">${t(step.game ? 'courses.check.intro' : 'courses.check.introTalk')}</p>
        ${result ? html`<div class="cl-result ${result.passed ? 'ok' : 'bad'}" role="status">${result.passed ? t('courses.check.passed', { score: result.score, total: 3 }) : t('courses.check.failed', { score: result.score, total: 3 })}
          ${result.passed ? '' : html`<ul${en}>${result.results.filter(r => !r.right).map(r => html`<li>${C.item(r.id).q} → <b>${r.text}</b></li>`)}</ul>`}</div>` : ''}
        ${signedIn ? checkForm(t, c, step, qs) : html`<p class="notice">${t('errors.api.signInFirst')}</p>`}`}
    </section>
    ${s.checked ? afterSection(t, c, step, s, next) : html`<div id="play-slot"></div>`}
    ${slides.some(sl => sl.img && sl.view) ? html`<dialog class="szoom-dlg" id="szoom" aria-label="${t('courses.lesson.wholePicture')}">
      <button class="btn szoom-x" type="button" id="szoom-x"><span aria-hidden="true">✕</span> ${t('courses.lesson.close')}</button>
      <img id="szoom-img" alt="" width="1280" height="720">
    </dialog>` : ''}
    ${jsonData('page-data', { course: c.slug, step: step.key, slides: n, checked: s.checked, read: s.read })}
  </article>`;
}
