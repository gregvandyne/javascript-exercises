// Courses: a few official games taught as one course (docs/decisions.md "Courses on the home page" and "Course flow").
// A course is listed on the home page as one wide card and has its own page (/courses/<slug>): a band picker the first
// time, then the course map. Each step is a short slide deck, a quick check of three questions and then one game module
// (a chapter of a game, locked). Step i opens when step i-1 is complete.
//
// Where a step comes from:
//   - the teacher lesson file (seed-lessons/cs-quest/lessons/<u.n>-<band>.json, units 1-6): the order, the game module
//     (play.game + play.chapter + params) and the exit items; this is the source of truth for the /play gate;
//   - the slide deck (seed-lessons/cs-quest/course/<band>/<u.n>.json, written for kids): title, slides, check, talk.
//     A step whose deck is not there yet gets a short deck made from its lesson file, so the course always works;
//   - the quiz banks (seed-lessons/cs-quest/sets/*.json): the check questions. Answers never leave the server before
//     the player has answered (grade(), answerOne()).
// Cyber Defenders (seed-lessons/cyber-defenders) is a second, deck-native course on the same machinery: its
// units.json is the source of truth for the order, the game module and the standards of each step, its decks and
// check banks live beside it, and its steps play two games it borrows (course-catalog.js "shared": CS Quest's
// Packet Post and the open Would You Rather) plus two of its own course-only games (Trick Inbox, Escape the
// Post Office), so nothing about it is read from CS Quest's lesson files.
// Progress (course_progress, course_bands) is per player. Guests play freely, but a guest's check
// passes and game wins are NOT progress (Greg's addendum, 2026-11-04): they are kept as pending facts
// (course_pending_wins, migration 0050) and honoured only when the student signs in — see the
// pending-wins section below. In the guest's own views the facts stand in for progress (they open
// the next step and fill the street the guest is looking at), but they never enter course_progress,
// so no grown-up surface, mark, lap, placement or grade ever sees them.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { q, now } from '../db.js';
import * as games from './games.js';
import { onAccountMerge } from './schools.js';

import { COURSES, courseOfSlug } from './course-catalog.js';
import { DIAGRAM_TYPES, cleanDiagram } from './diagrams.js';
import { numberlineOptions } from './diagrams-pro.js';
import * as NQT from './number-quest-tiers.js';
import { mathText } from '../../seed-lessons/number-quest/math-text.js';
export { COURSES, courseOfSlug };
export const getCourse = slug => COURSES.find(c => c.slug === slug) || null;

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const CSQ = path.join(ROOT, 'seed-lessons/cs-quest');
const CD = path.join(ROOT, 'seed-lessons/cyber-defenders');
const NQD = path.join(ROOT, 'seed-lessons/number-quest');
export const BANDS = Object.freeze(['1b', '2']);
const isNq = course => !!course && course.slug === 'number-quest';
/** The bands a course offers this viewer: the two graded bands for CS Quest and Cyber Defenders; for Number
 *  Quest, its tiers (services/number-quest-tiers.js: launchpad / explorer / pro, the band value and the
 *  prefix of its step keys, e.g. explorer-1.1 — the same node names the placement service places students
 *  at). Only the tiers the viewer may see are offered: the open ones, plus a tier still being built for
 *  the platform admin. With no viewer named, the open tiers. */
export const bandsFor = (course, user = null) => (isNq(course) ? NQT.visibleTiers(user) : BANDS);
/** Every band a course has, whoever is looking (Number Quest: every tier that has units, open or not). */
export const allBandsFor = course => (isNq(course) ? NQT.existingTiers() : BANDS);
/** The band a viewer with no band of their own is shown: the first graded band; Number Quest's Explorer street. */
export const defaultBand = (course, user = null) => {
  const bands = bandsFor(course, user);
  return isNq(course) && bands.includes(NQT.DEFAULT_TIER) ? NQT.DEFAULT_TIER : bands[0] || null;
};
/** May this viewer see this band of the course at all (false for a Number Quest tier still being built)? */
export const bandVisible = (user, course, band) => bandsFor(course, user).includes(band);
/** A check passes with this many right out of three. */
export const PASS = 2;

// ------------------------------------------------------------------------------------------------- loading
let deckDir = process.env.BRB_COURSE_DIR ? path.resolve(ROOT, process.env.BRB_COURSE_DIR) : path.join(CSQ, 'course');
let cache = null;
/** Read the slide decks from another folder (tests use tests/fixtures/course). */
export function useDeckDir(dir) { deckDir = path.resolve(ROOT, dir); cache = null; }
export const deckDirNow = () => deckDir;
const readJson = f => JSON.parse(fs.readFileSync(f, 'utf8'));

function load() {
  if (cache) return cache;
  const items = new Map();
  for (const f of fs.readdirSync(path.join(CSQ, 'sets')).filter(f => /^u\d-(1b|2)\.json$/.test(f))) {
    for (const it of readJson(path.join(CSQ, 'sets', f)).items || []) items.set(it.id, it);
  }
  cache = { items, csq: loadCsq(items), cyber: loadCyber(items), nq: loadNumberQuest(items) };
  return cache;
}

function loadCsq(items) {
  const gameInfo = readJson(path.join(CSQ, 'games.json')).games || {};
  // Course-only steps (extras.json in the deck folder): their check items join the item map first, so decks
  // can point at them like any bank item. A deck folder without extras.json simply has none (test fixtures).
  let extras = [], extrasError = null;
  const extrasFile = path.join(deckDir, 'extras.json');
  if (fs.existsSync(extrasFile)) {
    try {
      extras = readJson(extrasFile).steps || [];
      for (const x of extras) for (const band of BANDS) for (const it of (x.items && x.items[band]) || []) items.set(it.id, { ...it, lesson: x.n });
    } catch (e) { extras = []; extrasError = e.message; }
  }
  const steps = {};
  const problems = {};
  for (const band of BANDS) {
    const lessons = fs.readdirSync(path.join(CSQ, 'lessons')).filter(f => f.endsWith(`-${band}.json`))
      .map(f => readJson(path.join(CSQ, 'lessons', f))).filter(l => l.unit >= 1 && l.unit <= 6)
      .sort((a, b) => a.unit - b.unit || a.order - b.order);
    problems[band] = [];
    if (extrasError) problems[band].push(`extras.json: ${extrasError}`);
    steps[band] = lessons.map((l, index) => {
      const key = `${band}-${l.n}`;
      const file = path.join(deckDir, band, `${l.n}.json`);
      let deck = null;
      if (fs.existsSync(file)) {
        try { deck = readJson(file); } catch (e) { problems[band].push(`${key}: ${e.message}`); }
      }
      const play = l.play && l.play.type === 'game' ? l.play : null;
      const game = play ? { slug: play.game, chapter: play.chapter, chapterTitle: play.chapterTitle || play.chapter, params: l.params || '', title: (gameInfo[play.game] || {}).title || play.game } : null;
      const step = deck ? fromDeck(key, l, deck, game, items, problems[band]) : fromLesson(key, l, game);
      return { ...step, key, n: l.n, unit: l.unit, band, index, game, lesson: l.key, group: groupOf(l.unit) };
    });
    // Splice the course-only steps in (intro first, finale last, or after a named step) and renumber:
    // stateOf() indexes by step.index. An extra may be scoped to some bands (x.bands) and may carry a
    // game module (x.game), for a practice step that exists only in the student course (2-3.4 Fair Data).
    for (const x of extras) {
      if (Array.isArray(x.bands) && !x.bands.includes(band)) continue;
      const key = `${band}-${x.n}`;
      const file = path.join(deckDir, band, `${x.n}.json`);
      let deck = null;
      if (fs.existsSync(file)) { try { deck = readJson(file); } catch (e) { problems[band].push(`${key}: ${e.message}`); } }
      if (!deck) { problems[band].push(`${key}: a course-only step needs its deck`); continue; }
      let game = null;
      if (x.game) {
        const info = gameInfo[x.game.slug] || {};
        const ch = (info.chapters || []).find(c => c.id === x.game.chapter && c.band === (band === '1b' ? '1B' : '2'));
        if (!ch) problems[band].push(`${key}: extras game chapter ${x.game.slug}/${x.game.chapter} does not exist for band ${band}`);
        else game = { slug: x.game.slug, chapter: x.game.chapter, chapterTitle: ch.title || x.game.chapter, params: x.game.params || '', title: info.title || x.game.slug };
      }
      const step = fromExtra(key, x, deck, ((x.items || {})[band] || []).map(it => it.id), items, problems[band], game);
      // The intro (pos "first") is the course's own "Start here" group on the map, never a unit's game world.
      const full = { ...step, key, n: x.n, unit: x.unit, band, index: -1, game, lesson: null, group: x.pos === 'first' ? 'start' : groupOf(x.unit), extra: true };
      if (x.pos === 'first') steps[band].unshift(full);
      else if (typeof x.pos === 'string' && x.pos.startsWith('after-')) {
        const at = steps[band].findIndex(s => s.n === x.pos.slice('after-'.length));
        if (at < 0) { problems[band].push(`${key}: pos ${x.pos} names no step in band ${band}`); steps[band].push(full); }
        else steps[band].splice(at + 1, 0, full);
      }
      else steps[band].push(full);
    }
    steps[band].forEach((s, i) => { s.index = i; });
  }
  return { steps, problems };
}

const ART = new Set(['robot', 'grid', 'loop', 'branch', 'box', 'gears', 'bug', 'map', 'chart', 'table', 'magnifier', 'pencil', 'envelope', 'network', 'lock', 'shield', 'mask', 'key', 'cipher', 'chip', 'battery', 'screen', 'wrench', 'bits', 'pixel', 'people', 'globe', 'lightbulb', 'star', 'trophy',
  'ruler', 'clock', 'coins', 'scale', 'cake', 'shapes', 'angle', 'dice', 'cat']);
export const ART_IDS = Object.freeze([...ART]);
/** The story layer (the course's story & intro pack): the four characters, in course order, and the scenes a
 *  slide's `story` stage can play. Sprites are extracted from the characters' own games (scripts/csq-sprites.js)
 *  at public/img/csq/chars/<id>.webp. Number Quest's guide joins the cast as a fifth id — 'tally', the cat who
 *  keeps the Numberworks (her sprite is Fraction Factory's own Tally, at public/img/csq/chars/tally.webp) —
 *  with one scene of her own, 'street': the Numberworks street, its workshop windows lit per `lit`, Tally on
 *  stage. CS Quest's four and their eight scenes are untouched: no CSQ or Cyber deck names tally or street,
 *  so their validation and rendering are exactly as before. */
export const CHAR_IDS = Object.freeze(['bolt', 'dot', 'pim', 'gizmo', 'tally']);
export const STORY_SCENES = Object.freeze(['dim', 'drain', 'team', 'map', 'handoff', 'relight', 'celebrate', 'finale', 'street']);
const str = (v, max = 600) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
/** A slide picture's manifest key: "csq/<game>/<state>" -> public/img/csq/<game>/<state>.webp (see
 *  public/img/csq/manifest.json), or "nq/<game>/<state>" -> public/img/nq/<game>/<state>.webp for Number
 *  Quest's own games (see public/img/nq/manifest.json; captures by scripts/nq-shots.js). */
export const IMG_KEY = /^(?:csq|nq)\/[a-z0-9]+(?:-[a-z0-9]+)*\/[a-z0-9]+(?:-[a-z0-9]+)*$/;
/** What a slide's crop hides of its own tour: each focus box (and path point) must sit inside the view, since
 *  the viewer can only draw what it shows (boxes stay in % of the original picture). -> problem strings. */
export function viewMisses(sl) {
  if (!sl || !sl.view || !sl.focus) return [];
  const [vx, vy, vw, vh] = sl.view, out = [];
  const inside = (x, y) => x >= vx - 0.5 && x <= vx + vw + 0.5 && y >= vy - 0.5 && y <= vy + vh + 0.5;
  sl.focus.forEach((st, k) => {
    const [x, y, w, h] = st.box;
    if (!inside(x, y) || !inside(x + w, y + h)) out.push(`focus step ${k + 1} box [${st.box.join(', ')}] is not inside the view [${sl.view.join(', ')}]`);
    if (st.path && !st.path.every(p => inside(p[0], p[1]))) out.push(`focus step ${k + 1} path leaves the view [${sl.view.join(', ')}]`);
  });
  return out;
}
/** The shapes a `shapes` diagram draws. */
export const SHAPE_KINDS = Object.freeze(['triangle', 'square', 'rectangle', 'pentagon', 'hexagon', 'rhombus', 'parallelogram', 'trapezoid']);
/** The looks a drawn shape may take and still be itself (Launchpad Unit 6): a triangle upside down (`flip`), long and
 *  thin (`thin`) or with a square corner (`right`), a square turned on its corner (`turned`). */
export const SHAPE_LOOKS = Object.freeze({ triangle: ['flip', 'thin', 'right'], square: ['turned'] });
/** The smaller shapes a drawn shape may be shown made of (Launchpad Unit 6), by how many: a square of 2 triangles, a
 *  rectangle of 2 squares, a hexagon of 2 trapezoids or 6 triangles. */
export const SHAPE_MADE = Object.freeze({ square: [2], rectangle: [2], hexagon: [2, 6] });
/** The drawn diagram types a slide's `visual` may be. */
export const VISUAL_TYPES = Object.freeze(['places', 'numberline', 'bars', 'fraction', 'array', 'tiles', 'shapes', ...DIAGRAM_TYPES]);
/** One slide, cleaned: only the fields the viewer draws. */
export function cleanSlide(s) {
  const kind = ['example', 'words', 'mission'].includes(s && s.kind) ? s.kind : 'text';
  const out = { kind, title: str(s.title, 120), text: str(s.text, 400), art: ART.has(s.art) ? s.art : 'lightbulb', say: str(s.say, 600) };
  // An in-game picture replaces the emoji art only when it is well formed: a manifest key plus its own alt text
  // (required, <= 160 chars). Anything else is dropped and the slide keeps its art (fromDeck reports the loss).
  const img = typeof s.img === 'string' ? s.img.trim() : '';
  const alt = str(s.alt, 160);
  if (IMG_KEY.test(img) && alt && alt === (typeof s.alt === 'string' ? s.alt.trim() : '')) { out.img = img; out.alt = alt; }
  // The picture's crop (the cross-team picture contract): `view` [x, y, w, h] in % of the ORIGINAL 1280x720
  // screenshot. The viewer shows only that region, scaled to the frame's width (frame aspect = w*1280 : h*720),
  // and remaps the focus boxes and paths, which stay written in % of the original picture. At least 15% each
  // way (a smaller region is a blur on a laptop), inside the picture. A malformed view is dropped (the whole
  // picture shows; fromDeck reports the loss).
  if (out.img && s.view != null) {
    const v = s.view, n = x => typeof x === 'number' && Number.isFinite(x);
    if (Array.isArray(v) && v.length === 4 && v.every(n) && v[0] >= 0 && v[1] >= 0 && v[2] >= 15 && v[3] >= 15
      && v[0] + v[2] <= 100.001 && v[1] + v[3] <= 100.001) {
      out.view = v.map(x => Math.round(x * 100) / 100);
      // `whole: true`: the view IS the whole picture (a phone-width band set on a padded 16:9 canvas, Number Quest's
      // mission shots from scripts/nq-shots.js), so the frame has no expand button and no zoom: there is nothing
      // more to see, and the button would sit on the game's own words.
      if (s.whole === true) out.whole = true;
    }
  }
  // A drawn maths diagram (Number Quest's pictorial step): the slide's own numbers drawn as place-value
  // cards, a number line, a bar model, fraction bars, an array or a tile strip — data the view renders
  // as SVG (views/courses.js visualSvg), in the same frame a picture would fill. Strictly shaped per
  // type; anything malformed drops the whole visual (fromDeck reports the loss, like a dropped img).
  if (s.visual != null && typeof s.visual === 'object' && !Array.isArray(s.visual)) {
    const v = s.visual, num = x => typeof x === 'number' && Number.isFinite(x);
    const label = str(v.label, 160);
    let vis = null;
    if (label) {
      if (v.type === 'places' && Array.isArray(v.cols) && v.cols.length >= 2 && v.cols.length <= 4
        && v.cols.every(c => c && str(c.d, 2) && str(c.place, 12) && str(c.value, 8))) {
        vis = { type: 'places', label, cols: v.cols.map(c => ({ d: str(c.d, 2), place: str(c.place, 12), value: str(c.value, 8) })) };
      } else if (v.type === 'numberline' && num(v.min) && num(v.max) && v.min < v.max
        // up to 11 marks (a line from -5 to 5, or a dot plot from 0 to 10, names every whole number)
        && Array.isArray(v.marks) && v.marks.length <= 11 && v.marks.every(m => m && num(m.at) && m.at >= v.min && m.at <= v.max && str(m.label, 6))
        && (v.point == null || (num(v.point.at) && v.point.at >= v.min && v.point.at <= v.max && str(v.point.label, 6)))
        // a hop starts and lands on the line, either way along it (a hop back is a subtraction, or a step below zero)
        && (v.hops == null || (Array.isArray(v.hops) && v.hops.length <= 3 && v.hops.every(h => h && num(h.from) && num(h.to) && Math.min(h.from, h.to) >= v.min && Math.max(h.from, h.to) <= v.max && h.from !== h.to && str(h.label, 8))))
        && (v.stacks == null || (Array.isArray(v.stacks) && v.stacks.length <= 12 && v.stacks.every(k => k && num(k.at) && k.at >= v.min && k.at <= v.max && Number.isInteger(k.n) && k.n >= 1 && k.n <= 6)))
        && numberlineOptions(v)) {
        // (the Pro pack's options, services/diagrams-pro.js: `upright`, `tube` and `ray`)
        vis = { type: 'numberline', label, min: v.min, max: v.max, marks: v.marks.map(m => ({ at: m.at, label: str(m.label, 6) })),
          ...(v.point ? { point: { at: v.point.at, label: str(v.point.label, 6) } } : {}),
          ...(v.hops ? { hops: v.hops.map(h => ({ from: h.from, to: h.to, label: str(h.label, 8) })) } : {}),
          ...(v.stacks ? { stacks: v.stacks.map(k => ({ at: k.at, n: k.n })) } : {}),
          ...numberlineOptions(v) };
      } else if (v.type === 'bars' && Array.isArray(v.rows) && v.rows.length >= 1 && v.rows.length <= 3
        // (up to 10 parts a row: a tape diagram of a ratio such as 3 : 7, or a percent bar in tenths)
        && v.rows.every(r => r && str(r.label, 60) && Array.isArray(r.parts) && r.parts.length >= 1 && r.parts.length <= 10
          && r.parts.every(p => p && num(p.w) && p.w > 0 && p.w <= 1 && (p.tone == null || (Number.isInteger(p.tone) && p.tone >= -1 && p.tone <= 3)))
          && r.parts.reduce((sum, p) => sum + p.w, 0) <= 1.02)) {
        vis = { type: 'bars', label, ...(v.half ? { half: true } : {}), ...(v.big ? { big: true } : {}), rows: v.rows.map(r => ({ label: str(r.label, 60), parts: r.parts.map(p => ({ w: p.w, label: str(p.label, 20), ...(p.tone != null ? { tone: p.tone } : {}), ...(p.unknown ? { unknown: true } : {}) })) })) };
      } else if (v.type === 'fraction' && Array.isArray(v.rows) && v.rows.length >= 1 && v.rows.length <= 3
        && v.rows.every(r => r && str(r.label, 60) && Number.isInteger(r.cuts) && r.cuts >= 2 && r.cuts <= 12 && Number.isInteger(r.shaded) && r.shaded >= 0 && r.shaded <= r.cuts)) {
        vis = { type: 'fraction', label, ...(v.half ? { half: true } : {}), ...(v.big ? { big: true } : {}), rows: v.rows.map(r => ({ label: str(r.label, 60), cuts: r.cuts, shaded: r.shaded })) };
      } else if (v.type === 'array' && Number.isInteger(v.rows) && v.rows >= 1 && v.rows <= 8 && Number.isInteger(v.cols) && v.cols >= 1 && v.cols <= 10) {
        vis = { type: 'array', label, rows: v.rows, cols: v.cols, ...(v.extra ? { extra: 1, extraLabel: str(v.extraLabel, 20) } : {}), ...(v.turn && !v.extra ? { turn: true } : {}) };
      } else if (v.type === 'tiles' && Array.isArray(v.values) && v.values.length >= 3 && v.values.length <= 7
        && v.values.every(x => str(String(x), 10))
        && (v.bad == null || [].concat(v.bad).every(b => Number.isInteger(b) && b >= 0 && b < v.values.length) && [].concat(v.bad).length >= 1)) {
        // `bad`: one swapped tile's index, or several ([0, 1]: both tiles of a swap marked).
        vis = { type: 'tiles', label, values: v.values.map(x => str(String(x), 10)), ...(v.bad != null ? { bad: [...new Set([].concat(v.bad))] } : {}) };
      } else if (v.type === 'shapes' && Array.isArray(v.items) && v.items.length >= 2 && v.items.length <= 4
        && v.items.every(it => it && SHAPE_KINDS.includes(it.shape) && str(it.name, 14) && (it.corners == null || typeof it.corners === 'boolean')
          && (it.look == null || (SHAPE_LOOKS[it.shape] || []).includes(it.look)) && (it.made == null || ((SHAPE_MADE[it.shape] || []).includes(it.made) && it.look == null)))) {
        // Real drawn shapes (the geometry steps): each a regular outline with its name under it, and
        // optional right-angle marks in its corners; `look` draws it another way it can look (an upside-down triangle,
        // a turned square) and `made` draws the lines that show the smaller shapes it is made of.
        vis = { type: 'shapes', label, items: v.items.map(it => ({ shape: it.shape, name: str(it.name, 14), ...(it.corners ? { corners: true } : {}), ...(it.look ? { look: it.look } : {}), ...(it.made ? { made: it.made } : {}) })) };
      } else if (DIAGRAM_TYPES.includes(v.type)) {
        vis = cleanDiagram(v, label); // grid, squares, lines, chart, table (services/diagrams.js)
      }
    }
    if (vis) out.visual = vis;
  }
  // Guided focus: optional animation steps over the picture (only alongside a valid img or a valid drawn
  // visual). Each step is a short cue (<= 80 chars), a target box in % of the frame (inside it, at least
  // 2% wide/tall) and an optional dotted path of 2-16 points in %. 1-4 steps. Anything malformed drops the
  // whole focus and the slide keeps its plain picture (fromDeck reports the loss, like a dropped img).
  if ((out.img || out.visual) && Array.isArray(s.focus) && s.focus.length >= 1 && s.focus.length <= 4) {
    const num = v => typeof v === 'number' && Number.isFinite(v);
    const pct = v => num(v) && v >= 0 && v <= 100;
    const r1 = v => Math.round(v * 10) / 10;
    const steps = [];
    let ok = true;
    for (const st of s.focus) {
      const cue = st && typeof st.cue === 'string' ? st.cue : '';
      const b = st && st.box;
      const boxOk = Array.isArray(b) && b.length === 4 && b.every(num)
        && b[0] >= 0 && b[1] >= 0 && b[2] >= 2 && b[3] >= 2 && b[0] + b[2] <= 100 && b[1] + b[3] <= 100;
      let path;
      if (st && st.path != null) {
        if (Array.isArray(st.path) && st.path.length >= 2 && st.path.length <= 16 && st.path.every(p => Array.isArray(p) && p.length === 2 && p.every(pct))) path = st.path.map(p => [r1(p[0]), r1(p[1])]);
        else ok = false;
      }
      if (!ok || !cue || cue !== cue.trim() || cue.length > 80 || !boxOk) { ok = false; break; }
      steps.push(path ? { cue, box: b.map(r1), path } : { cue, box: b.map(r1) });
    }
    if (ok) out.focus = steps;
  }
  // Story stage: an optional animated scene (the Spark, its four pieces, the characters) that replaces the
  // slide's art. Only the intro step, the five unit transition beats and the finale carry one — teaching
  // slides keep guided focus only. Shape: { scene, lit (pieces lit after the scene, 0-4), chars (the cast on
  // stage, in entrance order), out / in / fly (the handoff's actors and the piece that flies) }. Anything
  // malformed drops the whole story and the slide keeps its art (fromDeck / fromExtra report the loss).
  if (s.story != null && typeof s.story === 'object' && !Array.isArray(s.story)) {
    const st = s.story;
    const charOk = v => CHAR_IDS.includes(v);
    const chars = st.chars == null ? [] : st.chars;
    const storyOk = STORY_SCENES.includes(st.scene)
      && Number.isInteger(st.lit) && st.lit >= 0 && st.lit <= 4
      && Array.isArray(chars) && chars.length <= 4 && chars.every(charOk) && new Set(chars).size === chars.length
      && (st.out == null || charOk(st.out)) && (st.in == null || charOk(st.in)) && (st.fly == null || charOk(st.fly));
    if (storyOk) {
      out.story = { scene: st.scene, lit: st.lit, chars: [...chars] };
      if (st.out) out.story.out = st.out;
      if (st.in) out.story.in = st.in;
      if (st.fly) out.story.fly = st.fly;
    }
  }
  if (kind === 'example') {
    if (Array.isArray(s.steps)) out.steps = s.steps.map(x => str(String(x), 60)).filter(Boolean).slice(0, 12);
    const rows = Array.isArray(s.rows) ? s.rows : Array.isArray(s.table) ? s.table : null;
    if (rows) out.rows = rows.filter(Array.isArray).slice(0, 8).map(r => r.slice(0, 5).map(c => str(String(c), 40)));
  }
  if (kind === 'words') out.words = (Array.isArray(s.words) ? s.words : []).filter(w => w && w.word).slice(0, 6).map(w => ({ word: str(w.word, 40), means: str(w.means, 160) }));
  return out;
}
/** How many pairs of slides in a row show the same picture, each through its own crop (`view`). */
export function splitPictures(slides) {
  let n = 0;
  for (let i = 1; i < slides.length; i++) {
    const a = slides[i - 1], b = slides[i];
    if (a.img && a.img === b.img && a.view && b.view && a.view.join() !== b.view.join()) n++;
  }
  return n;
}
function fromDeck(key, l, d, game, items, problems) {
  const slides = (Array.isArray(d.slides) ? d.slides : []).filter(s => s && typeof s === 'object').map(cleanSlide);
  const check = Array.isArray(d.check) && d.check.length === 3 && d.check.every(id => items.has(id)) ? d.check : l.exit.items;
  // What a deck says that does not match its lesson (reported by deckProblems; the lesson file wins).
  const say = m => problems.push(`${key}: ${m}`);
  if (d.key !== key) say(`key is ${JSON.stringify(d.key)}, expected "${key}"`);
  if (d.n !== l.n) say(`n is ${JSON.stringify(d.n)}`);
  if (d.band !== l.bandCode) say(`band is ${JSON.stringify(d.band)}`);
  if (slides.length < 5 || slides.length > 7) {
    // A deck carrying a story transition beat (the story pack) gets one extra slide: the beat is a story
    // moment inserted before the mission, not a teaching slide.
    // So does a deck that splits one wide picture across two slides in a row, each showing its own crop (two
    // side-by-side panels too small on a phone together): one teaching point, told in two legible halves.
    const beats = slides.filter(s => s.story && s.story.scene === 'handoff').length;
    if (!(slides.length === 8 && (beats === 1 || splitPictures(slides) === 1))) say(`${slides.length} slides (5-7 expected)`);
  }
  if (slides.filter(s => s.kind === 'example').length !== 1) say('needs exactly one example slide');
  if (slides.filter(s => s.kind === 'words').length !== 1) say('needs exactly one words slide');
  if (!slides.length || slides[slides.length - 1].kind !== 'mission') say('the last slide must be the mission');
  for (const [i, s] of (d.slides || []).entries()) {
    if (!s || !s.title || !s.text) say(`slide ${i + 1} has no title or text`);
    else if (!ART.has(s.art)) say(`slide ${i + 1} art ${JSON.stringify(s.art)} is not a known art id`);
    if (s && s.view != null && slides[i].img && !slides[i].view) say(`slide ${i + 1} view was dropped: it needs [x, y, w, h] in % of the picture, inside it, w and h at least 15`);
    for (const m of viewMisses(slides[i])) say(`slide ${i + 1} ${m}`);
    if (s && s.img != null && !slides[i].img) say(`slide ${i + 1} img ${JSON.stringify(s.img)} was dropped: it needs a csq/<game>/<state> or nq/<game>/<state> key and an alt of 1-160 chars`);
    if (s && s.visual != null && !slides[i].visual) say(`slide ${i + 1} visual was dropped: it needs a known type, a label of 1-160 chars and the type's own well-formed data`);
    if (s && s.focus != null && !slides[i].focus) say(`slide ${i + 1} focus was dropped: it needs a valid img or drawn visual and 1-4 steps, each a cue of 1-80 chars, a box [x, y, w, h] in % inside the frame (w, h >= 2), and an optional path of 2-16 points in %`);
    if (s && s.story != null && !slides[i].story) say(`slide ${i + 1} story was dropped: it needs a known scene, a lit count of 0-4, up to 4 known character ids in chars, and out/in/fly naming known characters`);
    if (s && s.kind === 'example' && !Array.isArray(s.steps) && !Array.isArray(s.rows) && !Array.isArray(s.table)) say(`slide ${i + 1} example has no steps`);
  }
  if (check !== d.check) say(`check ${JSON.stringify(d.check)} is not 3 known item ids`);
  else for (const id of check) if (items.get(id).lesson !== l.n || !id.startsWith(`${l.bandCode}-`)) say(`check item ${id} is not from lesson ${l.n}`);
  const want = game ? { slug: game.slug, chapter: game.chapter, params: game.params } : null;
  const got = d.game ? { slug: d.game.slug, chapter: d.game.chapter, params: d.game.params } : null;
  if (JSON.stringify(want) !== JSON.stringify(got)) say(`game ${JSON.stringify(d.game)} does not match the lesson (${JSON.stringify(want)})`);
  if (!game && !str(d.talk)) say('a step without a game needs "talk"');
  return { title: str(d.title, 80) || l.short, topic: str(d.topic, 40) || l.short, minutes: +d.minutes || 6, slides, check, talk: str(d.talk, 400), deck: true };
}
/** A course-only step (the story pack's intro 0.1 and finale 6.4, and the Pro-only practice step 3.4): no
 *  teacher lesson file stands behind it — the 23-lesson catalogue is a CSTA program in both bands and these
 *  steps carry no standards of their own — so its definition lives in the deck folder's extras.json (title,
 *  topic, unit, position, bands, an optional game module and the check items themselves), and its deck is
 *  validated the same way as a lesson deck, against the extras entry instead of a lesson. */
function fromExtra(key, x, d, wantIds, items, problems, game) {
  const slides = (Array.isArray(d.slides) ? d.slides : []).filter(s => s && typeof s === 'object').map(cleanSlide);
  const check = Array.isArray(d.check) && JSON.stringify(d.check) === JSON.stringify(wantIds) ? d.check : wantIds;
  const say = m => problems.push(`${key}: ${m}`);
  if (d.key !== key) say(`key is ${JSON.stringify(d.key)}, expected "${key}"`);
  if (d.n !== x.n) say(`n is ${JSON.stringify(d.n)}`);
  if (d.band !== key.slice(0, key.indexOf('-'))) say(`band is ${JSON.stringify(d.band)}`);
  if (str(d.title, 80) !== x.title) say(`title ${JSON.stringify(d.title)} does not match extras.json (${JSON.stringify(x.title)})`);
  if (str(d.topic, 40) !== x.topic) say(`topic ${JSON.stringify(d.topic)} does not match extras.json (${JSON.stringify(x.topic)})`);
  if (slides.length < 5 || slides.length > 7) say(`${slides.length} slides (5-7 expected)`);
  if (slides.filter(s => s.kind === 'example').length !== 1) say('needs exactly one example slide');
  if (slides.filter(s => s.kind === 'words').length !== 1) say('needs exactly one words slide');
  if (!slides.length || slides[slides.length - 1].kind !== 'mission') say('the last slide must be the mission');
  for (const [i, s] of (d.slides || []).entries()) {
    if (!s || !s.title || !s.text) say(`slide ${i + 1} has no title or text`);
    else if (!ART.has(s.art)) say(`slide ${i + 1} art ${JSON.stringify(s.art)} is not a known art id`);
    if (s && s.view != null && slides[i].img && !slides[i].view) say(`slide ${i + 1} view was dropped: it needs [x, y, w, h] in % of the picture, inside it, w and h at least 15`);
    for (const m of viewMisses(slides[i])) say(`slide ${i + 1} ${m}`);
    if (s && s.img != null && !slides[i].img) say(`slide ${i + 1} img ${JSON.stringify(s.img)} was dropped: it needs a csq/<game>/<state> or nq/<game>/<state> key and an alt of 1-160 chars`);
    if (s && s.visual != null && !slides[i].visual) say(`slide ${i + 1} visual was dropped: it needs a known type, a label of 1-160 chars and the type's own well-formed data`);
    if (s && s.story != null && !slides[i].story) say(`slide ${i + 1} story was dropped: it needs a known scene, a lit count of 0-4, up to 4 known character ids in chars, and out/in/fly naming known characters`);
    if (s && s.kind === 'example' && !Array.isArray(s.steps) && !Array.isArray(s.rows) && !Array.isArray(s.table)) say(`slide ${i + 1} example has no steps`);
  }
  if (check !== d.check) say(`check ${JSON.stringify(d.check)} is not the step's 3 extras item ids`);
  else for (const id of check) if (items.get(id).lesson !== x.n) say(`check item ${id} is not from step ${x.n}`);
  const want = game ? { slug: game.slug, chapter: game.chapter, params: game.params } : null;
  const got = d.game ? { slug: d.game.slug, chapter: d.game.chapter, params: d.game.params } : null;
  if (JSON.stringify(want) !== JSON.stringify(got)) say(`game ${JSON.stringify(d.game)} does not match extras.json (${JSON.stringify(want)})`);
  if (!game && !str(d.talk)) say('a step without a game needs "talk"');
  return { title: x.title, topic: x.topic, minutes: +d.minutes || 6, slides, check, talk: str(d.talk, 400), deck: true };
}
/** No deck yet: a short one from the lesson file (its big idea, words and mission), so the step still works. */
function fromLesson(key, l, game) {
  const ex = l.explore || {};
  const slides = [
    { kind: 'text', title: l.short, text: ex.bigIdea || l.summary.split('. ')[0] + '.', art: 'lightbulb', say: '' },
    ...(ex.vocab && ex.vocab.length ? [{ kind: 'words', title: l.short, text: '', art: 'pencil', say: '', words: ex.vocab.slice(0, 4).map(w => ({ word: w, means: '' })) }] : []),
    { kind: 'mission', title: l.short, text: (l.iCan || []).join('. ') + '.', art: game ? 'trophy' : 'people', say: '' },
  ];
  return { title: l.short, topic: l.short, minutes: 4, slides, check: l.exit.items, talk: game ? '' : (l.discuss || [])[0] || '', deck: false };
}

/** A game's display title: CS Quest's chapter table first, then the game's own seed file (Would You Rather). */
function gameTitle(slug, gameInfo) {
  if ((gameInfo[slug] || {}).title) return gameInfo[slug].title;
  try { return readJson(path.join(ROOT, 'seed-games', `${slug}.json`)).title || slug; } catch { return slug; }
}

/** Cyber Defenders: steps come from its units.json (order, game module, standards) plus its decks and banks. */
function loadCyber(items) {
  for (const f of fs.readdirSync(path.join(CD, 'sets')).filter(f => /^u\d-(1b|2)\.json$/.test(f))) {
    for (const it of readJson(path.join(CD, 'sets', f)).items || []) items.set(it.id, it);
  }
  const reg = readJson(path.join(CD, 'units.json'));
  const registry = readJson(path.join(CD, 'standards.json'));
  const gameInfo = readJson(path.join(CSQ, 'games.json')).games || {};
  const groups = (reg.units || []).map(u => ({ id: u.group, units: [u.n], game: u.tool || null, emoji: u.emoji || '💡', title: u.title, ...(u.sub ? { sub: u.sub } : {}), ...(u.stamp ? { stamp: u.stamp } : {}) }));
  const steps = {};
  const problems = {};
  for (const band of BANDS) {
    problems[band] = [];
    const flat = (reg.units || []).flatMap(u => (u.steps || []).map(s => ({ u, s }))).sort((a, b) => a.s.order - b.s.order);
    steps[band] = flat.map(({ u, s }, index) => {
      const key = `${band}-${s.n}`;
      const spec = (s.game || {})[band] || null;
      const game = spec ? { slug: spec.slug, chapter: spec.chapter, chapterTitle: spec.chapterTitle || spec.chapter, params: spec.params || '', title: gameTitle(spec.slug, gameInfo) } : null;
      const file = path.join(CD, 'course', band, `${s.n}.json`);
      let deck = null;
      if (fs.existsSync(file)) {
        try { deck = readJson(file); } catch (e) { problems[band].push(`${key}: ${e.message}`); }
      }
      const base = { key, n: s.n, unit: u.n, band, index, game, lesson: null, group: u.group, standards: (s.standards || {})[band] || null };
      if (!deck) {
        problems[band].push(`${key}: no deck at course/${band}/${s.n}.json`);
        return { ...base, title: (s.titles || {})[band] || s.n, topic: (s.shorts || {})[band] || '', minutes: 6, slides: [{ kind: 'text', title: (s.titles || {})[band] || s.n, text: reg.program.tagline, art: 'shield', say: '' }], check: [], talk: '', deck: false };
      }
      return { ...base, ...fromCyberDeck(key, s, band, deck, game, items, problems[band]) };
    });
  }
  return { steps, problems, groups, catalogue: { program: reg.program, units: reg.units || [], registry, trickPack: fs.existsSync(path.join(CD, 'trick-pack.json')) ? readJson(path.join(CD, 'trick-pack.json')) : { cards: [], moves: [] } } };
}
/** One Cyber Defenders deck, cleaned and checked against its units.json entry (the same rules as fromDeck). */
function fromCyberDeck(key, s, band, d, game, items, problems) {
  const slides = (Array.isArray(d.slides) ? d.slides : []).filter(x => x && typeof x === 'object').map(cleanSlide);
  const check = Array.isArray(d.check) && d.check.length === 3 && d.check.every(id => items.has(id)) ? d.check : [];
  const say = m => problems.push(`${key}: ${m}`);
  if (d.key !== key) say(`key is ${JSON.stringify(d.key)}, expected "${key}"`);
  if (d.n !== s.n) say(`n is ${JSON.stringify(d.n)}`);
  if (d.band !== band) say(`band is ${JSON.stringify(d.band)}`);
  if (slides.length < 5 || slides.length > 8) say(`${slides.length} slides (5-8 expected)`);
  if (slides.filter(x => x.kind === 'example').length !== 1) say('needs exactly one example slide');
  if (slides.filter(x => x.kind === 'words').length !== 1) say('needs exactly one words slide');
  if (!slides.length || slides[slides.length - 1].kind !== 'mission') say('the last slide must be the mission');
  for (const [i, sl] of (d.slides || []).entries()) {
    if (!sl || !sl.title || !sl.text) say(`slide ${i + 1} has no title or text`);
    else if (!ART.has(sl.art)) say(`slide ${i + 1} art ${JSON.stringify(sl.art)} is not a known art id`);
    if (sl && sl.view != null && slides[i].img && !slides[i].view) say(`slide ${i + 1} view was dropped: it needs [x, y, w, h] in % of the picture, inside it, w and h at least 15`);
    for (const m of viewMisses(slides[i])) say(`slide ${i + 1} ${m}`);
    if (sl && sl.img != null && !slides[i].img) say(`slide ${i + 1} img ${JSON.stringify(sl.img)} was dropped: it needs a csq/<game>/<state> or nq/<game>/<state> key and an alt of 1-160 chars`);
    if (sl && sl.visual != null && !slides[i].visual) say(`slide ${i + 1} visual was dropped: it needs a known type, a label of 1-160 chars and the type's own well-formed data`);
    if (sl && sl.focus != null && !slides[i].focus) say(`slide ${i + 1} focus was dropped: it needs a valid img or drawn visual and 1-4 steps, each a cue of 1-80 chars, a box [x, y, w, h] in % inside the frame (w, h >= 2), and an optional path of 2-16 points in %`);
    if (sl && sl.kind === 'example' && !Array.isArray(sl.steps) && !Array.isArray(sl.rows) && !Array.isArray(sl.table)) say(`slide ${i + 1} example has no steps`);
  }
  if (!check.length) say(`check ${JSON.stringify(d.check)} is not 3 known item ids`);
  else for (const id of check) if (items.get(id).lesson !== s.n || !id.startsWith(`cd-${band}-`)) say(`check item ${id} is not from step ${s.n}`);
  const want = game ? { slug: game.slug, chapter: game.chapter, params: game.params } : null;
  const got = d.game ? { slug: d.game.slug, chapter: d.game.chapter, params: d.game.params } : null;
  if (JSON.stringify(want) !== JSON.stringify(got)) say(`game ${JSON.stringify(d.game)} does not match units.json (${JSON.stringify(want)})`);
  if (!game && !str(d.talk)) say('a step without a game needs "talk"');
  // An optional alternate deck for a kid meeting the course for the first time in this band (the Pro
  // welcome, 2-0.1: "a year has passed" only reads right to a kid who walked Explorer). `slides_first_time`
  // follows the same slide rules as `slides` (same count, one example, one words slide, mission last) and
  // is shown instead of `slides` when the kid has finished no step of the other band (slidesFor below).
  let first = null;
  if (d.slides_first_time != null) {
    const alt = Array.isArray(d.slides_first_time) ? d.slides_first_time.filter(x => x && typeof x === 'object').map(cleanSlide) : [];
    const bad = alt.length < 5 || alt.length > 8 || alt.filter(x => x.kind === 'example').length !== 1 || alt.filter(x => x.kind === 'words').length !== 1
      || alt[alt.length - 1].kind !== 'mission' || d.slides_first_time.some(x => !x || !x.title || !x.text || !ART.has(x.art));
    if (bad) say('slides_first_time needs 5-8 slides with a title, text and known art each, exactly one example and one words slide, and the mission last');
    else first = alt;
  }
  return { title: str(d.title, 80) || (s.titles || {})[band] || s.n, topic: str(d.topic, 40) || (s.shorts || {})[band] || '', minutes: +d.minutes || 6, slides, ...(first ? { slidesFirstTime: first } : {}), check, talk: str(d.talk, 400), deck: true };
}

/** Number Quest: a third, deck-native course on the same machinery, with one difference of shape — its bands
 *  are its tiers (services/number-quest-tiers.js): sequential streets on one path, each with its OWN units and
 *  steps, where CS Quest and Cyber Defenders teach the same steps in two bands. Its units.json is the source of
 *  truth for the tiers, the order, the game module, the locked CCSS-M statements and each step's Mathematical
 *  Practice spotlight; its decks (course/<tier>/<n>.json) and check banks (sets/u<n>-<tier>.json) live beside
 *  it. Step keys are "<tier>-<n>", the very node names the placement service
 *  (services/number-quest-placement.js) routes to. Every tier that has units is loaded, open or not: who may
 *  see a tier is decided where a viewer is known (bandsFor, stepFor, stateOf), never here. */
function loadNumberQuest(items) {
  NQT.reload();
  for (const f of fs.readdirSync(path.join(NQD, 'sets')).filter(f => /^u\d-(launchpad|explorer|pro)\.json$/.test(f))) {
    // A Pro item's words go through mathText like its deck's (a true minus sign, ², √, ×): see proText below.
    const pro = f.endsWith('-pro.json');
    for (const it of readJson(path.join(NQD, 'sets', f)).items || []) items.set(it.id, pro ? proItem(it) : it);
  }
  const reg = NQT.catalogue();
  const registry = readJson(path.join(NQD, 'standards.json'));
  const gameInfo = readJson(path.join(CSQ, 'games.json')).games || {};
  const groupOf = u => ({ id: u.group, units: [u.n], game: u.tool || null, emoji: u.emoji || '💡', title: u.title });
  const steps = {}, problems = {}, groups = {};
  for (const tier of NQT.existingTiers()) {
    problems[tier] = [];
    groups[tier] = NQT.unitsOf(tier).map(groupOf);
    steps[tier] = NQT.stepsOf(tier).map(({ key, unit: u, s }, index) => {
      const spec = (s.game || {})[tier] || null;
      const game = spec ? { slug: spec.slug, chapter: spec.chapter, chapterTitle: spec.chapterTitle || spec.chapter, params: spec.params || '', title: gameTitle(spec.slug, gameInfo) } : null;
      const file = path.join(NQD, 'course', tier, `${s.n}.json`);
      let deck = null;
      if (fs.existsSync(file)) {
        try { deck = readJson(file); } catch (e) { problems[tier].push(`${key}: ${e.message}`); }
      }
      const base = { key, n: s.n, unit: u.n, band: tier, index, game, lesson: null, group: u.group, standards: (s.standards || {})[tier] || null, mp: s.mp || null };
      if (!deck) {
        problems[tier].push(`${key}: no deck at course/${tier}/${s.n}.json`);
        return { ...base, title: (s.titles || {})[tier] || s.n, topic: (s.shorts || {})[tier] || '', minutes: 6, slides: [{ kind: 'text', title: (s.titles || {})[tier] || s.n, text: reg.program.tagline, art: 'star', say: '' }], check: [], talk: '', deck: false };
      }
      return { ...base, ...fromNqDeck(key, s, tier, deck, game, items, problems[tier]) };
    });
  }
  return { steps, problems, groups, reg, registry };
}
/** Number Quest's teacher-facing catalogue as one viewer may see it: the units of the tiers they may see (the
 *  open ones; a tier still being built only for the platform admin), in path order, each unit carrying its
 *  `tier`; `tiers` lists those tiers with their catalogue line and status; `tier` is Explorer's line; `planned`
 *  lists the units a building tier has reserved but not built (the admin's preview only). */
function nqCatalogue(nq, user) {
  const seen = NQT.visibleTiers(user);
  return { program: nq.reg.program, units: seen.flatMap(t => NQT.unitsOf(t)), registry: nq.registry, tier: NQT.tierInfo('explorer'),
    tiers: seen.map(t => ({ key: t, ...(NQT.tierInfo(t) || {}), status: NQT.statusOf(t), name: NQT.tierName(t), units: NQT.unitsOf(t) })),
    // Units reserved in the catalogue and not built yet (units.json `planned`): only ever those of a tier that is
    // still being built, which only the platform admin sees. For everyone else this list is empty.
    planned: seen.filter(t => !NQT.isOpen(t)).flatMap(t => NQT.plannedUnitsOf(t)) };
}
/** Pro (grades 6-8) text is printed with the real signs: a true minus sign, ², ³, √, ×, ÷, ≤, ≥. An author may
 *  type "-3", "x^2", "sqrt(16)" or "3 x 4"; mathText (seed-lessons/number-quest/math-text.js) prints them properly.
 *  Applied to what a Pro learner reads in a deck (title, text, the read-aloud line, example chips and rows, word
 *  meanings, focus cues) and in a check item (question, choices, why). A diagram's own labels are handled by the
 *  diagram cleaners. The other tiers' text never passes through here. */
const mt = v => (typeof v === 'string' ? mathText(v) : v);
function proSlide(x) {
  const out = { ...x, title: mt(x.title), text: mt(x.text) };
  if (typeof x.say === 'string') out.say = mt(x.say);
  if (Array.isArray(x.steps)) out.steps = x.steps.map(c => mt(typeof c === 'number' ? String(c) : c));
  for (const k of ['rows', 'table']) if (Array.isArray(x[k])) out[k] = x[k].map(r => (Array.isArray(r) ? r.map(c => mt(typeof c === 'number' ? String(c) : c)) : r));
  if (Array.isArray(x.words)) out.words = x.words.map(w => (w && typeof w === 'object' ? { ...w, means: mt(w.means) } : w));
  if (Array.isArray(x.focus)) out.focus = x.focus.map(f => (f && typeof f === 'object' ? { ...f, cue: mt(f.cue) } : f));
  return out;
}
const proItem = it => ({ ...it, q: mt(it.q), choices: Array.isArray(it.choices) ? it.choices.map(mt) : it.choices, why: mt(it.why) });
/** The two Pro text passes, for the tests that pin them (a deck or a bank is only ever read through the loader). */
export const proText = Object.freeze({ slide: proSlide, item: proItem });
/** One Number Quest deck, cleaned and checked against its units.json entry (the same rules as fromCyberDeck;
 *  its check items are the step's own bank items, ids "nq-<tier>-<n>-e<k>", each tagged to a locked code). */
function fromNqDeck(key, s, tier, d, game, items, problems) {
  const slides = (Array.isArray(d.slides) ? d.slides : []).filter(x => x && typeof x === 'object').map(x => cleanSlide(tier === 'pro' ? proSlide(x) : x));
  const check = Array.isArray(d.check) && d.check.length === 3 && d.check.every(id => items.has(id)) ? d.check : [];
  const say = m => problems.push(`${key}: ${m}`);
  if (d.key !== key) say(`key is ${JSON.stringify(d.key)}, expected "${key}"`);
  if (d.n !== s.n) say(`n is ${JSON.stringify(d.n)}`);
  if (d.band !== tier) say(`band is ${JSON.stringify(d.band)}`);
  if (slides.length < 5 || slides.length > 7) say(`${slides.length} slides (5-7 expected)`);
  if (slides.filter(x => x.kind === 'example').length !== 1) say('needs exactly one example slide');
  if (slides.filter(x => x.kind === 'words').length !== 1) say('needs exactly one words slide');
  if (!slides.length || slides[slides.length - 1].kind !== 'mission') say('the last slide must be the mission');
  for (const [i, sl] of (d.slides || []).entries()) {
    if (!sl || !sl.title || !sl.text) say(`slide ${i + 1} has no title or text`);
    else if (!ART.has(sl.art)) say(`slide ${i + 1} art ${JSON.stringify(sl.art)} is not a known art id`);
    if (sl && sl.view != null && slides[i].img && !slides[i].view) say(`slide ${i + 1} view was dropped: it needs [x, y, w, h] in % of the picture, inside it, w and h at least 15`);
    for (const m of viewMisses(slides[i])) say(`slide ${i + 1} ${m}`);
    if (sl && sl.img != null && !slides[i].img) say(`slide ${i + 1} img ${JSON.stringify(sl.img)} was dropped: Number Quest decks carry no character art until a sprite is extracted from its own game`);
    if (sl && sl.focus != null && !slides[i].focus) say(`slide ${i + 1} focus was dropped: it needs a valid img or drawn visual and 1-4 steps, each a cue of 1-80 chars, a box [x, y, w, h] in % inside the frame (w, h >= 2), and an optional path of 2-16 points in %`);
    if (sl && sl.kind === 'example' && !Array.isArray(sl.steps) && !Array.isArray(sl.rows) && !Array.isArray(sl.table)) say(`slide ${i + 1} example has no steps`);
  }
  if (!check.length) say(`check ${JSON.stringify(d.check)} is not 3 known item ids`);
  else for (const id of check) if (items.get(id).lesson !== s.n || !id.startsWith(`nq-${tier}-`)) say(`check item ${id} is not from step ${s.n}`);
  const want = game ? { slug: game.slug, chapter: game.chapter, params: game.params } : null;
  const got = d.game ? { slug: d.game.slug, chapter: d.game.chapter, params: d.game.params } : null;
  if (JSON.stringify(want) !== JSON.stringify(got)) say(`game ${JSON.stringify(d.game)} does not match units.json (${JSON.stringify(want)})`);
  if (!game && !str(d.talk)) say('a step without a game needs "talk"');
  return { title: str(d.title, 80) || (s.titles || {})[tier] || s.n, topic: str(d.topic, 40) || (s.shorts || {})[tier] || '', minutes: +d.minutes || 6, slides, check, talk: str(d.talk, 400), deck: true };
}

/** The unit groups on the course map, each headed by its game (unit 6 by its theme), after the course's own
 *  "Start here" group (the intro step, course-only: it belongs to no game world). Every header carries one
 *  emoji tile (the map draws one icon style for every unit header, in every course). */
export const GROUPS = Object.freeze([
  { id: 'start', units: [], game: null, emoji: '🧭', titleKey: 'courses.groups.start' },
  { id: 'robo-route', units: [1, 2], game: 'robo-route', emoji: '🤖' },
  { id: 'data-detective', units: [3], game: 'data-detective', emoji: '🔍' },
  { id: 'packet-post', units: [4], game: 'packet-post', emoji: '✉️' },
  { id: 'inside-the-machine', units: [5], game: 'inside-the-machine', emoji: '🖥️' },
  { id: 'tech-choices', units: [6], game: null, emoji: '💡', titleKey: 'courses.groups.techChoices' },
]);
const groupOf = unit => (GROUPS.find(g => g.units.includes(unit)) || GROUPS[1]).id;
/** The course map's groups for a course: CS Quest's game worlds, Cyber Defenders' units from its units.json,
 *  Number Quest's units of one tier (its Explorer street unless a band is named). */
export function groupsFor(course, band = NQT.DEFAULT_TIER) {
  if (course && course.slug === 'cyber-defenders') return load().cyber.groups;
  if (isNq(course)) return load().nq.groups[band] || [];
  return GROUPS;
}

/** The course's steps for a band, in order. Number Quest: any tier that has units, open or still being built
 *  (a tier with no units has no steps) — who may OPEN a step is stepFor's and stateOf's question, not this one's. */
export function steps(course, band) {
  if (!course || !allBandsFor(course).includes(band)) return [];
  if (course.slug === 'cs-quest') return load().csq.steps[band];
  if (course.slug === 'cyber-defenders') return load().cyber.steps[band];
  if (course.slug === 'number-quest') return load().nq.steps[band] || [];
  return [];
}
/** A step key's shape, for any course: "1b-1.2", "2-3.1", "explorer-1.2", "launchpad-0.1", "pro-2.1". */
export const STEP_KEY = /^(1b|2|launchpad|explorer|pro)-(\d\.\d)$/;
/** One step by key, or null. It answers for the catalogue, not for a viewer: use stepFor where one is known. */
export function getStep(course, key) {
  const m = STEP_KEY.exec(String(key || ''));
  return m ? steps(course, m[1]).find(s => s.n === m[2]) || null : null;
}
/** One step by key as this viewer may meet it: null for an unknown key AND for a step of a band the viewer
 *  may not see (a Number Quest tier still being built, for anyone but the platform admin), so such a step
 *  reads exactly as a step that does not exist. */
export function stepFor(user, course, key) {
  const step = getStep(course, key);
  return step && bandVisible(user, course, step.band) ? step : null;
}
/** A bank item by id (with its answer: server side only). */
export const item = id => load().items.get(id) || null;
/** What the decks say that does not fit their course data (empty when every deck is right). */
export const deckProblems = (band, slug = 'cs-quest') => (slug === 'cyber-defenders' ? load().cyber.problems[band] : slug === 'number-quest' ? load().nq.problems[band] : load().csq.problems[band]) || [];
/** Cyber Defenders' teacher-facing catalogue: the program line, the units with their steps, standards and
 *  teacher notes, and the standards registry — the data the teacher page renders (units.json + standards.json). */
export const cyberCatalogue = () => load().cyber.catalogue;
/** Number Quest's teacher-facing catalogue: the program line, the units (each with its tier, steps, locked
 *  CCSS-M statements and teacher notes) of the tiers this viewer may see, and the standards registry
 *  (units.json + standards.json). With no viewer: the open tiers. */
export const numberQuestCatalogue = (user = null) => nqCatalogue(load().nq, user);
/** Forget the loaded files (tests that write decks). */
export const reload = () => { cache = null; NQT.reload(); };

// ------------------------------------------------------------------------------------------------- band
export function getBand(user, course) {
  if (!user || !course) return null;
  const r = q.get('SELECT band FROM course_bands WHERE user_id=? AND course=?', user.id, course.slug);
  return r && bandsFor(course, user).includes(r.band) ? r.band : null;
}
export function setBand(user, course, band) {
  if (!user || !course || !bandsFor(course, user).includes(band)) return false;
  q.run('INSERT INTO course_bands(user_id, course, band, updated_at) VALUES (?,?,?,?) ON CONFLICT(user_id, course) DO UPDATE SET band=excluded.band, updated_at=excluded.updated_at', user.id, course.slug, band, now());
  return true;
}

// ------------------------------------------------------------------------------------------------- progress
function rows(user, course) {
  if (!user) return new Map();
  return new Map(q.all('SELECT * FROM course_progress WHERE user_id=? AND course=?', user.id, course.slug).map(r => [r.step, r]));
}
/** Is this step done: slides read, check passed and (if it has one) its game module finished — the game itself
 *  reported the assigned chapter complete. Merely opening the module (played_at) starts it; it does not finish
 *  it, so a student has to actually play the module through. */
export const isComplete = (step, r) => !!(r && r.read_at && r.checked_at && (!step.game || r.completed_at));
/** Every step of the band with its state: { step, row, read, checked, played (module opened = started),
 *  won (module finished), complete, open }. */
export function states(user, course, band) {
  const all = steps(course, band); const rs = rows(user, course);
  // A guest's pending facts stand in for their progress in their own views (see the pending-wins
  // section): without them a guest could never open the second step of a course, since steps open in
  // sequence and nothing of theirs is ever recorded. The overlay touches only this read — the rows
  // are copies, course_progress itself is never written for a guest.
  if (isGuestUser(user)) {
    for (const f of q.all('SELECT step, kind FROM course_pending_wins WHERE user_id=? AND course=?', user.id, course.slug)) {
      const r = rs.get(f.step) || { read_at: null, checked_at: null, check_score: 0, played_at: null, completed_at: null };
      if (f.kind === 'check') { r.read_at = r.read_at || 1; r.checked_at = r.checked_at || 1; }
      else if (f.kind === 'played') r.played_at = r.played_at || 1;
      else if (f.kind === 'win') r.completed_at = r.completed_at || 1;
      rs.set(f.step, r);
    }
  }
  // Number Quest's placement promise, kept here so every reader of step state (path, step pages,
  // play, the step APIs) agrees: the workshops at and before the learner's placed start stay open
  // for games, laps and test-out, even before the steps in front of them are finished. The start
  // node is read from the placement row directly (no service import, so no cycle). A stored
  // 'explorer-5.1' read as Unit 4's door while Unit 5 was unbuilt (repair round 3); since Phase 2
  // built Unit 5, the node reads as itself, exactly as the placement service now reads it.
  let placedIdx = -1;
  if (course.slug === 'number-quest' && user && user.id) {
    const pr = q.get('SELECT start_node FROM nq_placement WHERE user_id=?', user.id);
    const node = pr && pr.start_node;
    if (node) {
      placedIdx = all.findIndex(s => s.key === node);
      // The streets are sequential: a learner placed on a LATER street has every workshop of this one
      // behind their start, so all of it stays open; a learner placed on an earlier street has none of
      // this one behind them, and it opens step by step like any street.
      const at = NQT.parseKey(node);
      if (placedIdx < 0 && at && NQT.TIERS.indexOf(at.tier) > NQT.TIERS.indexOf(band) && NQT.visibleTo(user, at.tier)) placedIdx = all.length - 1;
    }
  }
  // The platform admin tests the courses themselves (Greg, 2026-11-05): for the admin account every step
  // is open — enterable from the map in any order, whatever the account's own progress or placement — so
  // the whole course can be walked end to end. Access only, deliberately: completion is earned exactly as
  // for a student (opening a step completes nothing; its check still gates its game and a win still
  // completes it), the bypass writes no progress, and no other account's states change. The role is read
  // from the account's own user row, server-side; there is no client switch. (docs/decisions.md, Course flow.)
  const adminOpen = !!user && user.role === 'admin';
  let prevDone = true;
  return all.map((step, i) => {
    const r = rs.get(step.key) || null;
    const s = { step, row: r, read: !!(r && r.read_at), checked: !!(r && r.checked_at), played: !!(r && r.played_at), won: !!(r && r.completed_at), complete: isComplete(step, r), open: adminOpen || prevDone || i <= placedIdx };
    prevDone = s.complete;
    return s;
  });
}
/** The course map's summary: { band, list, done, total, next } (next: the first open step not complete, or null). */
export function overview(user, course, band = getBand(user, course)) {
  if (!band) return { band: null, list: [], done: 0, total: steps(course, defaultBand(course, user)).length, next: null };
  const list = states(user, course, band);
  return { band, list, done: list.filter(s => s.complete).length, total: list.length, next: (list.find(s => s.open && !s.complete) || null) };
}
/** A teacher's view of course progress for a given set of students (a class roster — the caller decides
 *  who is in it; this never widens the set). One row per student for one course, built on the same
 *  states() the student map uses, so a teacher sees exactly what the platform records: the band, the
 *  per-step states, steps complete of the band's total, a status (not-started / in-progress /
 *  completed) and the recorded check score (check_score is 0-3 per step that has a check, so the
 *  maximum is 3 per checked step). Any course registered in COURSES works, so a course that joins the
 *  registry (Number Quest) appears in the teacher view with no extra plumbing. Guests never appear:
 *  they have no accounts and no rows here. */
export function classCourseProgress(students, course) {
  return (students || []).map(user => {
    let band = getBand(user, course);
    if (!band && user && user.id != null) {
      const r = q.get('SELECT band, COUNT(*) AS n FROM course_progress WHERE user_id=? AND course=? GROUP BY band ORDER BY n DESC LIMIT 1', user.id, course.slug);
      band = r && bandsFor(course, user).includes(r.band) ? r.band : null;
    }
    if (!band) return { user, band: null, status: 'not-started', done: 0, total: steps(course, defaultBand(course, user)).length, score: 0, maxScore: 0, list: [] };
    const list = states(user, course, band);
    const done = list.filter(s => s.complete).length;
    const started = list.some(s => s.row);
    const score = list.reduce((n, s) => n + ((s.row && s.row.check_score) || 0), 0);
    const maxScore = list.reduce((n, s) => n + (s.step.check && s.step.check.length ? 3 : 0), 0);
    return { user, band, status: !started ? 'not-started' : done >= list.length ? 'completed' : 'in-progress', done, total: list.length, score, maxScore, list };
  });
}
/** The slides this player reads on a step: the step's own deck, or its first-time deck (`slides_first_time`,
 *  Cyber Defenders) when the step has one and the player has finished no step of the course's other band —
 *  a Pro kid who never walked Explorer gets a welcome written for a first visit. Read-aloud uses the same pick. */
export function slidesFor(user, course, step) {
  if (!step || !step.slidesFirstTime) return step ? step.slides : [];
  const other = bandsFor(course, user).find(b => b !== step.band);
  const veteran = !!other && !!user && states(user, course, other).some(s => s.complete);
  return veteran ? step.slides : step.slidesFirstTime;
}
/** One step's state for this player (open, read, checked...), or null when the key is unknown. */
export function stateOf(user, course, key) {
  const step = stepFor(user, course, key);
  return step ? states(user, course, step.band)[step.index] : null;
}

function upsert(user, course, step, fields) {
  const t = now();
  q.run('INSERT OR IGNORE INTO course_progress(user_id, course, step, band, read_at, checked_at, check_score, played_at, completed_at) VALUES (?,?,?,?,NULL,NULL,0,NULL,NULL)', user.id, course.slug, step.key, step.band);
  const sets = Object.keys(fields).map(k => `${k}=${fields[k] === 'now' ? `COALESCE(${k}, ${t})` : '?'}`);
  const vals = Object.values(fields).filter(v => v !== 'now');
  q.run(`UPDATE course_progress SET ${sets.join(', ')} WHERE user_id=? AND course=? AND step=?`, ...vals, user.id, course.slug, step.key);
}
/** The slides were read (the first time is kept). Reading is a bookmark, not progress toward a
 *  completion, so a guest's read is recorded like anyone's (and carries over when they sign up, the
 *  way a guest's game saves do). */
export function markRead(user, course, step) { upsert(user, course, step, { read_at: 'now' }); }
/** The game module was opened from this step: started, not finished. The step completes only at markCompleted.
 *  A guest's start is a pending fact, not progress (see the pending-wins section). */
export function markPlayed(user, course, step) {
  if (isGuestUser(user)) { stashPendingFact(user, course, step, 'played'); return; }
  upsert(user, course, step, { played_at: 'now' });
}
/** The game itself reported this step's assigned module finished (its chapter won): the step's game part is
 *  done. Recorded only for a player who started the module (markPlayed) — see the /complete API.
 *  A guest's win is never recorded here: the /complete API keeps it as a pending fact instead, and this
 *  guard keeps the rule true for any caller. */
export function markCompleted(user, course, step) {
  if (isGuestUser(user)) return;
  upsert(user, course, step, { completed_at: 'now' });
}

/** A seeded order of a question's four choices: the same for this player, step and try, different on the next try. */
export function choiceOrder(seed, n = 4) {
  const h = crypto.createHash('sha256').update(String(seed)).digest();
  const order = [...Array(n).keys()];
  for (let i = n - 1; i > 0; i--) { const j = h[i] % (i + 1); [order[i], order[j]] = [order[j], order[i]]; }
  return order;
}
/** The check's questions as the page shows them: no answers. choices: [{ i (index in the bank), text }] in a seeded order. */
export function questions(step, seed = '') {
  return step.check.map(id => {
    const it = item(id);
    return { id, q: it.q, choices: choiceOrder(`${seed}|${step.key}|${id}`, it.choices.length).map(i => ({ i, text: it.choices[i] })) };
  });
}
/** One answer, graded: { right, answer (the right choice's bank index), text (the right answer) } or null if not this check's. */
export function answerOne(step, id, choice) {
  if (!step.check.includes(id)) return null;
  const it = item(id);
  return { right: Number.isInteger(choice) && choice === it.answer, answer: it.answer, text: it.choices[it.answer], why: it.why || '' };
}
/** All three answers ({ id: choice }), graded on the server: { score, passed, results: [{ id, right, answer, text }] }. */
export function grade(step, answers) {
  const results = step.check.map(id => ({ id, ...answerOne(step, id, answers && typeof answers === 'object' ? toInt(answers[id]) : null) }));
  const score = results.filter(r => r.right).length;
  return { score, passed: score >= PASS, results };
}
const toInt = v => (v === '' || v === null || v === undefined ? null : Number.isInteger(+v) ? +v : null);
/** Record a graded check. Reaching the check counts as having read the slides; a pass is kept once earned; the best
 *  score is kept. A guest's pass is kept as a pending fact instead (with its score): it earns no
 *  recorded progress, but it opens the step's game module for this sitting and is honoured with the
 *  win it leads to once the student signs in. */
export function recordCheck(user, course, step, { score, passed }) {
  if (isGuestUser(user)) { if (passed) stashPendingFact(user, course, step, 'check', score); return; }
  upsert(user, course, step, { read_at: 'now', ...(passed ? { checked_at: 'now' } : {}) });
  q.run('UPDATE course_progress SET check_score=MAX(check_score, ?) WHERE user_id=? AND course=? AND step=?', score, user.id, course.slug, step.key);
}

// ------------------------------------------------------------------------------------------------- pending wins
// Greg's addendum (2026-11-04 20:57): course completion requires a signed-in account, because a
// guest's progress is not tracked. Guests still browse lessons and play games freely — what is gated
// is the completion itself. So a guest's earned facts live in course_pending_wins (migration 0050),
// never in course_progress: 'check' (the step's check passed, with its score), 'played' (the module
// was entered from the step), 'win' (the game reported its assigned module won). The /complete API
// refuses a guest with the sign-in prompt and stashes the 'win'; when the student signs in — the same
// user row after a guest upgrade, or another account the pending facts are transferred to at login —
// applyPendingWins turns each stashed win into the step's real progress and clears the facts. A check
// passed on a step with a game, without its win, is cleared unrecorded: that student still owes the
// game. (A check on a step with no game is honoured: there, the check is the finished step.)
export const isGuestUser = u => !!u && !!u.is_guest;
/** Keep one earned fact for a guest (idempotent; a check keeps its best score). Accounts never need
 *  this — their facts are progress the moment they happen — so it writes nothing for them. */
export function stashPendingFact(user, course, step, kind, score = null) {
  if (!isGuestUser(user) || !course || !step || !['check', 'played', 'win'].includes(kind)) return;
  q.run('INSERT OR IGNORE INTO course_pending_wins(user_id, course, step, kind, score, created_at) VALUES (?,?,?,?,?,?)',
    user.id, course.slug, step.key, kind, Number.isInteger(score) ? score : null, now());
  if (kind === 'check' && Number.isInteger(score)) {
    q.run('UPDATE course_pending_wins SET score=MAX(COALESCE(score, 0), ?) WHERE user_id=? AND course=? AND step=? AND kind=?',
      score, user.id, course.slug, step.key, kind);
  }
}
/** A player's pending facts for one step: { check, played, win, checkScore }. */
export function pendingFacts(user, course, step) {
  const out = { check: false, played: false, win: false, checkScore: null };
  if (!user || !user.id || !course || !step) return out;
  for (const r of q.all('SELECT kind, score FROM course_pending_wins WHERE user_id=? AND course=? AND step=?', user.id, course.slug, step.key)) {
    if (r.kind === 'check') { out.check = true; out.checkScore = r.score; }
    else if (r.kind === 'played') out.played = true;
    else if (r.kind === 'win') out.win = true;
  }
  return out;
}
/** Honour the pending wins of a student who has signed in: each stashed 'win' becomes the step's real
 *  progress (read, check passed with its stashed score, module played and finished — the win proves
 *  the whole flow). A stashed 'check' on a step with NO game is honoured the same way, because there
 *  the passed check is itself the finished step; a 'check' on a game step without its win is not —
 *  that student still owes the game, and the fact is cleared unrecorded with the rest. Guests and
 *  unknown users keep their facts untouched.
 *  -> [{ course, step, via }] the completions applied, in the order earned ('win' | 'check'). */
export function applyPendingWins(user) {
  if (!user || !user.id || user.is_guest) return [];
  const facts = q.all('SELECT * FROM course_pending_wins WHERE user_id=? ORDER BY created_at, step', user.id);
  if (!facts.length) return [];
  const byStep = new Map();
  for (const f of facts) {
    const k = `${f.course} ${f.step}`;
    if (!byStep.has(k)) byStep.set(k, { course: f.course, step: f.step, kinds: new Set(), score: null });
    const e = byStep.get(k); e.kinds.add(f.kind);
    if (f.kind === 'check' && Number.isInteger(f.score)) e.score = f.score;
  }
  const applied = [];
  for (const e of byStep.values()) {
    const course = getCourse(e.course); const step = course && getStep(course, e.step);
    if (!step) continue;
    const via = e.kinds.has('win') ? 'win' : (!step.game && e.kinds.has('check') ? 'check' : null);
    if (!via) continue;
    upsert(user, course, step, { read_at: 'now', checked_at: 'now', ...(step.game ? { played_at: 'now', completed_at: 'now' } : {}) });
    if (Number.isInteger(e.score)) {
      q.run('UPDATE course_progress SET check_score=MAX(check_score, ?) WHERE user_id=? AND course=? AND step=?', e.score, user.id, course.slug, step.key);
    }
    applied.push({ course: course.slug, step: step.key, via });
  }
  q.run('DELETE FROM course_pending_wins WHERE user_id=?', user.id);
  return applied;
}
/** Hand a guest's pending facts to the account they signed in as (login replaces the guest session
 *  with another account's; the win the student earned must not be stranded on the guest row). */
export function transferPendingWins(fromId, toId) {
  if (!fromId || !toId || fromId === toId) return;
  q.run('UPDATE OR IGNORE course_pending_wins SET user_id=? WHERE user_id=?', toId, fromId);
  q.run('DELETE FROM course_pending_wins WHERE user_id=?', fromId);
}

/** May this player open this game from this step (/play?course=&cstep=)? The step must be open, its check passed and
 *  its game module this game. -> the step, or null. A guest's passed check is a pending fact rather
 *  than a recorded one, and it opens the module the same way — guests play freely; only completion
 *  waits for an account. */
export function playable(user, course, key, slug) {
  if (!user) return null;
  const s = stateOf(user, course, key);
  if (!s || !s.open || !s.step.game || s.step.game.slug !== slug) return null;
  if (s.checked) return s.step;
  return isGuestUser(user) && pendingFacts(user, course, s.step).check ? s.step : null;
}
/** The Play link of a step's game module. */
export const playHref = (course, step) => (step.game ? `/play/${step.game.slug}?course=${course.slug}&cstep=${step.key}${step.game.params ? `&${step.game.params}` : ''}` : null);

// A school account merged into a student's own account brings its course progress (the student's own rows win).
onAccountMerge(({ from, into }) => {
  q.run('UPDATE OR IGNORE course_progress SET user_id=? WHERE user_id=?', into, from);
  q.run('DELETE FROM course_progress WHERE user_id=?', from);
  q.run('UPDATE OR IGNORE course_bands SET user_id=? WHERE user_id=?', into, from);
  q.run('DELETE FROM course_bands WHERE user_id=?', from);
  q.run('UPDATE OR IGNORE course_pending_wins SET user_id=? WHERE user_id=?', into, from);
  q.run('DELETE FROM course_pending_wins WHERE user_id=?', from);
});

// ------------------------------------------------------------------------------------------------- the games
/** The course's games the viewer may see, in course order, decorated like any card (localized, rated, plays). */
export function courseGames(user, course) {
  const slugs = course.games.map(g => g.slug);
  const v = games.visibleWhere(user);
  const rows = q.all(`${games.SELECT} WHERE g.slug IN (${slugs.map(() => '?').join(',')}) AND ${v.sql}`, ...slugs, ...v.params);
  const bySlug = new Map(games.decorate(rows).map(g => [g.slug, g]));
  return course.games.map((cg, i) => bySlug.get(cg.slug) && { ...bySlug.get(cg.slug), step: i + 1, topic: cg.topic }).filter(Boolean);
}
