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
// Progress (course_progress, course_bands) is per player, guests included.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { q, now } from '../db.js';
import * as games from './games.js';
import { onAccountMerge } from './schools.js';

import { COURSES, courseOfSlug } from './course-catalog.js';
export { COURSES, courseOfSlug };
export const getCourse = slug => COURSES.find(c => c.slug === slug) || null;

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const CSQ = path.join(ROOT, 'seed-lessons/cs-quest');
const CD = path.join(ROOT, 'seed-lessons/cyber-defenders');
export const BANDS = Object.freeze(['1b', '2']);
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
  cache = { items, csq: loadCsq(items), cyber: loadCyber(items) };
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
      const full = { ...step, key, n: x.n, unit: x.unit, band, index: -1, game, lesson: null, group: groupOf(x.unit), extra: true };
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

const ART = new Set(['robot', 'grid', 'loop', 'branch', 'box', 'gears', 'bug', 'map', 'chart', 'table', 'magnifier', 'pencil', 'envelope', 'network', 'lock', 'shield', 'mask', 'key', 'cipher', 'chip', 'battery', 'screen', 'wrench', 'bits', 'pixel', 'people', 'globe', 'lightbulb', 'star', 'trophy']);
export const ART_IDS = Object.freeze([...ART]);
/** The story layer (the course's story & intro pack): the four characters, in course order, and the scenes a
 *  slide's `story` stage can play. Sprites are extracted from the characters' own games (scripts/csq-sprites.js)
 *  at public/img/csq/chars/<id>.webp. */
export const CHAR_IDS = Object.freeze(['bolt', 'dot', 'pim', 'gizmo']);
export const STORY_SCENES = Object.freeze(['dim', 'drain', 'team', 'map', 'handoff', 'relight', 'celebrate', 'finale']);
const str = (v, max = 600) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
/** A slide picture's manifest key: "csq/<game>/<state>" -> public/img/csq/<game>/<state>.webp (see public/img/csq/manifest.json). */
export const IMG_KEY = /^csq\/[a-z0-9]+(?:-[a-z0-9]+)*\/[a-z0-9]+(?:-[a-z0-9]+)*$/;
/** One slide, cleaned: only the fields the viewer draws. */
function cleanSlide(s) {
  const kind = ['example', 'words', 'mission'].includes(s && s.kind) ? s.kind : 'text';
  const out = { kind, title: str(s.title, 120), text: str(s.text, 400), art: ART.has(s.art) ? s.art : 'lightbulb', say: str(s.say, 600) };
  // An in-game picture replaces the emoji art only when it is well formed: a manifest key plus its own alt text
  // (required, <= 160 chars). Anything else is dropped and the slide keeps its art (fromDeck reports the loss).
  const img = typeof s.img === 'string' ? s.img.trim() : '';
  const alt = str(s.alt, 160);
  if (IMG_KEY.test(img) && alt && alt === (typeof s.alt === 'string' ? s.alt.trim() : '')) { out.img = img; out.alt = alt; }
  // Guided focus: optional animation steps over the picture (only alongside a valid img). Each step is a short cue
  // (<= 80 chars), a target box in % of the frame (inside it, at least 2% wide/tall) and an optional dotted path of
  // 2-8 points in %. 1-4 steps. Anything malformed drops the whole focus and the slide keeps its plain picture
  // (fromDeck reports the loss, like a dropped img).
  if (out.img && Array.isArray(s.focus) && s.focus.length >= 1 && s.focus.length <= 4) {
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
        if (Array.isArray(st.path) && st.path.length >= 2 && st.path.length <= 8 && st.path.every(p => Array.isArray(p) && p.length === 2 && p.every(pct))) path = st.path.map(p => [r1(p[0]), r1(p[1])]);
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
    const beats = slides.filter(s => s.story && s.story.scene === 'handoff').length;
    if (!(slides.length === 8 && beats === 1)) say(`${slides.length} slides (5-7 expected)`);
  }
  if (slides.filter(s => s.kind === 'example').length !== 1) say('needs exactly one example slide');
  if (slides.filter(s => s.kind === 'words').length !== 1) say('needs exactly one words slide');
  if (!slides.length || slides[slides.length - 1].kind !== 'mission') say('the last slide must be the mission');
  for (const [i, s] of (d.slides || []).entries()) {
    if (!s || !s.title || !s.text) say(`slide ${i + 1} has no title or text`);
    else if (!ART.has(s.art)) say(`slide ${i + 1} art ${JSON.stringify(s.art)} is not a known art id`);
    if (s && s.img != null && !slides[i].img) say(`slide ${i + 1} img ${JSON.stringify(s.img)} was dropped: it needs a csq/<game>/<state> key and an alt of 1-160 chars`);
    if (s && s.focus != null && !slides[i].focus) say(`slide ${i + 1} focus was dropped: it needs a valid img and 1-4 steps, each a cue of 1-80 chars, a box [x, y, w, h] in % inside the frame (w, h >= 2), and an optional path of 2-8 points in %`);
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
    if (s && s.img != null && !slides[i].img) say(`slide ${i + 1} img ${JSON.stringify(s.img)} was dropped: it needs a csq/<game>/<state> key and an alt of 1-160 chars`);
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
  const groups = (reg.units || []).map(u => ({ id: u.group, units: [u.n], game: u.tool || null, emoji: u.emoji || '💡', title: u.title, ...(u.sub ? { sub: u.sub } : {}) }));
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
    if (sl && sl.img != null && !slides[i].img) say(`slide ${i + 1} img ${JSON.stringify(sl.img)} was dropped: it needs a csq/<game>/<state> key and an alt of 1-160 chars`);
    if (sl && sl.focus != null && !slides[i].focus) say(`slide ${i + 1} focus was dropped: it needs a valid img and 1-4 steps, each a cue of 1-80 chars, a box [x, y, w, h] in % inside the frame (w, h >= 2), and an optional path of 2-8 points in %`);
    if (sl && sl.kind === 'example' && !Array.isArray(sl.steps) && !Array.isArray(sl.rows) && !Array.isArray(sl.table)) say(`slide ${i + 1} example has no steps`);
  }
  if (!check.length) say(`check ${JSON.stringify(d.check)} is not 3 known item ids`);
  else for (const id of check) if (items.get(id).lesson !== s.n || !id.startsWith(`cd-${band}-`)) say(`check item ${id} is not from step ${s.n}`);
  const want = game ? { slug: game.slug, chapter: game.chapter, params: game.params } : null;
  const got = d.game ? { slug: d.game.slug, chapter: d.game.chapter, params: d.game.params } : null;
  if (JSON.stringify(want) !== JSON.stringify(got)) say(`game ${JSON.stringify(d.game)} does not match units.json (${JSON.stringify(want)})`);
  if (!game && !str(d.talk)) say('a step without a game needs "talk"');
  return { title: str(d.title, 80) || (s.titles || {})[band] || s.n, topic: str(d.topic, 40) || (s.shorts || {})[band] || '', minutes: +d.minutes || 6, slides, check, talk: str(d.talk, 400), deck: true };
}

/** The unit groups on the course map, each headed by its game (unit 6 by its theme). */
export const GROUPS = Object.freeze([
  { id: 'robo-route', units: [1, 2], game: 'robo-route' },
  { id: 'data-detective', units: [3], game: 'data-detective' },
  { id: 'packet-post', units: [4], game: 'packet-post' },
  { id: 'inside-the-machine', units: [5], game: 'inside-the-machine' },
  { id: 'tech-choices', units: [6], game: null },
]);
const groupOf = unit => (GROUPS.find(g => g.units.includes(unit)) || GROUPS[0]).id;
/** The course map's groups for a course: CS Quest's game worlds, Cyber Defenders' units from its units.json. */
export function groupsFor(course) {
  if (course && course.slug === 'cyber-defenders') return load().cyber.groups;
  return GROUPS;
}

/** The course's steps for a band, in order. */
export function steps(course, band) {
  if (!course || !BANDS.includes(band)) return [];
  if (course.slug === 'cs-quest') return load().csq.steps[band];
  if (course.slug === 'cyber-defenders') return load().cyber.steps[band];
  return [];
}
/** One step by key ("1b-1.2"), or null. */
export function getStep(course, key) {
  const m = /^(1b|2)-(\d\.\d)$/.exec(String(key || ''));
  return m ? steps(course, m[1]).find(s => s.n === m[2]) || null : null;
}
/** A bank item by id (with its answer: server side only). */
export const item = id => load().items.get(id) || null;
/** What the decks say that does not fit their course data (empty when every deck is right). */
export const deckProblems = (band, slug = 'cs-quest') => (slug === 'cyber-defenders' ? load().cyber.problems[band] : load().csq.problems[band]) || [];
/** Cyber Defenders' teacher-facing catalogue: the program line, the units with their steps, standards and
 *  teacher notes, and the standards registry — the data the teacher page renders (units.json + standards.json). */
export const cyberCatalogue = () => load().cyber.catalogue;
/** Forget the loaded files (tests that write decks). */
export const reload = () => { cache = null; };

// ------------------------------------------------------------------------------------------------- band
export function getBand(user, course) {
  if (!user || !course) return null;
  const r = q.get('SELECT band FROM course_bands WHERE user_id=? AND course=?', user.id, course.slug);
  return r && BANDS.includes(r.band) ? r.band : null;
}
export function setBand(user, course, band) {
  if (!user || !course || !BANDS.includes(band)) return false;
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
  let prevDone = true;
  return all.map(step => {
    const r = rs.get(step.key) || null;
    const s = { step, row: r, read: !!(r && r.read_at), checked: !!(r && r.checked_at), played: !!(r && r.played_at), won: !!(r && r.completed_at), complete: isComplete(step, r), open: prevDone };
    prevDone = s.complete;
    return s;
  });
}
/** The course map's summary: { band, list, done, total, next } (next: the first open step not complete, or null). */
export function overview(user, course, band = getBand(user, course)) {
  if (!band) return { band: null, list: [], done: 0, total: steps(course, '1b').length, next: null };
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
      band = r && BANDS.includes(r.band) ? r.band : null;
    }
    if (!band) return { user, band: null, status: 'not-started', done: 0, total: steps(course, '1b').length, score: 0, maxScore: 0, list: [] };
    const list = states(user, course, band);
    const done = list.filter(s => s.complete).length;
    const started = list.some(s => s.row);
    const score = list.reduce((n, s) => n + ((s.row && s.row.check_score) || 0), 0);
    const maxScore = list.reduce((n, s) => n + (s.step.check && s.step.check.length ? 3 : 0), 0);
    return { user, band, status: !started ? 'not-started' : done >= list.length ? 'completed' : 'in-progress', done, total: list.length, score, maxScore, list };
  });
}
/** One step's state for this player (open, read, checked...), or null when the key is unknown. */
export function stateOf(user, course, key) {
  const step = getStep(course, key);
  return step ? states(user, course, step.band)[step.index] : null;
}

function upsert(user, course, step, fields) {
  const t = now();
  q.run('INSERT OR IGNORE INTO course_progress(user_id, course, step, band, read_at, checked_at, check_score, played_at, completed_at) VALUES (?,?,?,?,NULL,NULL,0,NULL,NULL)', user.id, course.slug, step.key, step.band);
  const sets = Object.keys(fields).map(k => `${k}=${fields[k] === 'now' ? `COALESCE(${k}, ${t})` : '?'}`);
  const vals = Object.values(fields).filter(v => v !== 'now');
  q.run(`UPDATE course_progress SET ${sets.join(', ')} WHERE user_id=? AND course=? AND step=?`, ...vals, user.id, course.slug, step.key);
}
/** The slides were read (the first time is kept). */
export function markRead(user, course, step) { upsert(user, course, step, { read_at: 'now' }); }
/** The game module was opened from this step: started, not finished. The step completes only at markCompleted. */
export function markPlayed(user, course, step) { upsert(user, course, step, { played_at: 'now' }); }
/** The game itself reported this step's assigned module finished (its chapter won): the step's game part is
 *  done. Recorded only for a player who started the module (markPlayed) — see the /complete API. */
export function markCompleted(user, course, step) { upsert(user, course, step, { completed_at: 'now' }); }

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
 *  score is kept. */
export function recordCheck(user, course, step, { score, passed }) {
  upsert(user, course, step, { read_at: 'now', ...(passed ? { checked_at: 'now' } : {}) });
  q.run('UPDATE course_progress SET check_score=MAX(check_score, ?) WHERE user_id=? AND course=? AND step=?', score, user.id, course.slug, step.key);
}

/** May this player open this game from this step (/play?course=&cstep=)? The step must be open, its check passed and
 *  its game module this game. -> the step, or null. */
export function playable(user, course, key, slug) {
  if (!user) return null;
  const s = stateOf(user, course, key);
  return s && s.open && s.checked && s.step.game && s.step.game.slug === slug ? s.step : null;
}
/** The Play link of a step's game module. */
export const playHref = (course, step) => (step.game ? `/play/${step.game.slug}?course=${course.slug}&cstep=${step.key}${step.game.params ? `&${step.game.params}` : ''}` : null);

// A school account merged into a student's own account brings its course progress (the student's own rows win).
onAccountMerge(({ from, into }) => {
  q.run('UPDATE OR IGNORE course_progress SET user_id=? WHERE user_id=?', into, from);
  q.run('DELETE FROM course_progress WHERE user_id=?', from);
  q.run('UPDATE OR IGNORE course_bands SET user_id=? WHERE user_id=?', into, from);
  q.run('DELETE FROM course_bands WHERE user_id=?', from);
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
