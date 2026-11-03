// CS Quest catalogue and materialiser (docs/cs-quest.md "Curriculum"; plan section 10.4, P15). The catalogue is data in
// seed-lessons/cs-quest/ (units.json, lessons/<u.n>-<band>.json, games.json, owner B's sets/ banks and wyr-tech.json);
// nothing in it is served by itself. The materialiser turns one lesson file into an ordinary lesson in a teacher's library
// for one school: the folder "CS Quest" with a sub-folder per unit and band, the lesson (title, summary, I-can lines as
// objectives, template_key / template_version), its student-visible steps in order, and the derived live sets in the
// teacher's My sets (subject 'cs-quest', lesson_id set): the lesson's warm-up (5 items, 15 s), its exit ticket (3 items,
// cat kept) and, once per unit and band, the unit review (the whole bank, cat replaced by the lesson topic so Brain Board
// columns read "Loops", never a code). Everything downstream (assign, progress, live, gradebook, copy, share, the editor)
// then works unchanged, and the teacher may edit the copy.
//
// Steps per lesson file (seed-lessons/cs-quest/README.md): Today (text) · Warm-up (live) (a game step on the band's live
// mode game: Quest Race at 1B, Question Battle at 2; the platform hides Play and says "Your teacher hosts this live") ·
// Play: <chapter> (a game step with options = the lesson params, standards, the quest code in the body) · Exit ticket (a
// quiz step from the exit set with cat kept, or, with QUIZ_STEPS off, a text step "Exit ticket (paper or live)") · In your
// own words (a question step with the sentence frame and one rubric line per primary id). Variants come from the file
// itself: 6.1 / 6.3 a Would You Rather (live) step, 6.2 Pro two Play steps, 7.1 three question steps, 7.2 Builder etiquette
// + a build step on the quiz template with the Program rubric line, 7.3 text + question, 7.4 a question step. A game step
// whose game is not published becomes a text step that says the game is not available yet (never silently skipped).
//
// Idempotent per (owner, school, key, version): materialising a key the teacher already has at the catalogue's version
// answers the existing copy (created: false); again: true makes a fresh copy ("Add again"); a copy at an older version
// shows "Update available" (status / libraryStatus). Reset (P21) materialises a fresh copy and moves the old copy's class
// assignments (same unit, opens_at, due_at) to it; the old copy keeps the students' work.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { q, tx, audit } from '../db.js';
import { config } from '../config.js';
import * as S from './schools.js';
import * as L from './lessons.js';
import * as SETS from './classlive-sets.js';
import * as games from './games.js';
import * as CSTA from '../standards/csta.js';

export const DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../seed-lessons/cs-quest');
/** lessons.subject of every materialised lesson (teacher chrome; the library's subject filter). */
export const SUBJECT = 'Computer science';
/** live_sets.subject of every derived set: the program slug, which the /live picker groups as "CS Quest" (owner B). */
export const SET_SUBJECT = 'cs-quest';
/** The library folder every CS Quest lesson lands in, with a sub-folder per unit and band. */
export const FOLDER = 'CS Quest';
/** A catalogue key: csq-<1b|2>-<unit>.<n>. */
export const KEY = /^csq-(1b|2)-([1-7])\.(\d)$/;
export const BANDS = Object.freeze(['1B', '2']);
export const GRADES = Object.freeze({ '1B': '3-5', '2': '6-8' });
export const WARMUP_GAME = Object.freeze({ '1B': 'quest-race', '2': 'question-battle' });
export const WYR_SLUG = 'would-you-rather-live';
/** The text step that stands in for an exit ticket while QUIZ_STEPS is off (plan D3). */
export const PAPER_EXIT_TITLE = 'Exit ticket (paper or live)';
const PAPER_EXIT_NOTE = 'Your teacher hands out the paper half-sheet or hosts the questions live.';
const NOT_YET_NOTE = 'This game is not available yet. Your teacher will tell you what to do instead.';
/** Why a step was not made the way the catalogue says (the plan page shows these as state chips). */
export const NOTE_CODES = Object.freeze(['gameNotPublished', 'quizStepsOff', 'bankMissing']);

const fail = code => ({ ok: false, code });
const ok = (extra = {}) => ({ ok: true, ...extra });
const readJson = f => JSON.parse(fs.readFileSync(f, 'utf8'));
const normKey = k => String(k == null ? '' : k).trim().toLowerCase();
const bandKey = b => { const s = String(b == null ? '' : b).trim().toUpperCase(); return s === '1B' || s === '2' ? s : null; };
const cap = s => (s ? s[0].toUpperCase() + s.slice(1) : s);
const isoDay = t => new Date(t).toISOString().slice(0, 10);

// ---------------------------------------------------------------- the catalogue (read once; reload() for tests)
let cache = null;
/** Forget the cached catalogue and read it again (tests that write lesson files). */
export function reload() { cache = null; return catalogue(); }
/**
 * The whole catalogue: { program, bands, units, paths, period, periodVariants, rules, materials, faq, derivedSets,
 * lessons: Map key -> lesson file (+ unitTitle, file, needsSchoolPlan), missing: [keys without a file], banks: Map setId -> bank,
 * games: the chapter table, wyr: the Would You Rather prompts file or null }.
 */
export function catalogue() {
  if (cache) return cache;
  const units = readJson(path.join(DIR, 'units.json'));
  const chapters = readJson(path.join(DIR, 'games.json')).games;
  const lessons = new Map(), missing = [], banks = new Map();
  for (const u of units.units) {
    for (const band of BANDS) {
      const bankFile = u.banks && u.banks[band] ? path.join(DIR, u.banks[band]) : null;
      if (bankFile && fs.existsSync(bankFile)) { const bk = readJson(bankFile); banks.set(bk.id, Object.freeze(bk)); }
      for (const l of u.lessons) {
        const key = l.keys[band], file = path.join(DIR, l.files[band]);
        if (!fs.existsSync(file)) { missing.push(key); continue; }
        lessons.set(key, Object.freeze({ ...readJson(file), unitTitle: u.title, file: l.files[band], needsSchoolPlan: !!u.needsSchoolPlan }));
      }
    }
  }
  const wyrFile = path.join(DIR, 'wyr-tech.json');
  cache = Object.freeze({
    program: units.program, bands: units.bands, units: units.units, paths: units.paths, period: units.period, periodVariants: units.periodVariants,
    rules: units.rules, materials: units.materials, faq: units.faq, derivedSets: units.derivedSets, lessons, missing, banks, games: chapters,
    wyr: fs.existsSync(wyrFile) ? readJson(wyrFile) : null,
  });
  return cache;
}
/** Is this a catalogue key (whether or not its file exists yet)? */
export const isKey = key => KEY.test(normKey(key));
/** One lesson file by key ('csq-1b-1.2'), or null. */
export const getTemplate = key => catalogue().lessons.get(normKey(key)) || null;
/** The lesson files present, in program order (unit, lesson, band); band / unit narrow the list. */
export function templates({ band = null, unit = null } = {}) {
  const b = band ? bandKey(band) : null;
  return [...catalogue().lessons.values()].filter(l => (!b || l.band === b) && (!unit || l.unit === +unit)).sort((x, y) => x.order - y.order || (x.band === '1B' ? -1 : 1));
}
/** A unit's entry in units.json ({ n, title, tool, optional, needsSchoolPlan, banks, lessons }), or null. */
export const unitOf = n => catalogue().units.find(u => u.n === +n) || null;
/** A path's entry in units.json ({ id, title, default?, lessons: ['1.2', ...], note }), or null. */
export const pathOf = id => catalogue().paths.find(p => p.id === String(id || '')) || null;
/** The keys of a unit for a band, in order: { keys: [present], missing: [no file yet] }; null for an unknown unit or band. */
export function unitKeys(n, band) {
  const u = unitOf(n), b = bandKey(band); if (!u || !b) return null;
  return split(u.lessons.map(l => l.keys[b]));
}
/** The keys of a published path for a band, in the path's order: { keys, missing }; null for an unknown path or band. */
export function pathKeys(id, band) {
  const p = pathOf(id), b = bandKey(band); if (!p || !b) return null;
  const byN = new Map(catalogue().units.flatMap(u => u.lessons.map(l => [l.n, l.keys[b]])));
  return split(p.lessons.map(n => byN.get(n)).filter(Boolean));
}
const split = keys => ({ keys: keys.filter(k => catalogue().lessons.has(k)), missing: keys.filter(k => !catalogue().lessons.has(k)) });
/** A unit bank by set id ('csq-u1-1b'), or null when owner B's file is not there. */
export const bankOf = setId => catalogue().banks.get(String(setId || '')) || null;
/** Bank items by id, in the order given; null when the bank or any item is missing. */
export function bankItems(setId, ids) {
  const bank = bankOf(setId); if (!bank) return null;
  const byId = new Map(bank.items.map(it => [it.id, it]));
  const out = (ids || []).map(id => byId.get(id));
  return out.every(Boolean) ? out : null;
}
/** The derived set titles for a lesson file: { warmup, exit, review } (units.json derivedSets). */
export function setTitles(l) {
  const g = GRADES[l.band];
  return { warmup: `CSQ ${l.n} warm-up · ${l.short} (${g})`, exit: `CSQ ${l.n} exit ticket (${g})`, review: `CSQ Unit ${l.unit} review (${g})` };
}

// ---------------------------------------------------------------- the teacher's library
const isStaffOf = (u, schoolId) => { const r = S.roleIn(u, schoolId); return r === 'admin' || r === 'teacher'; };
/** The teacher's copies of a catalogue lesson in a school, newest first (lessons.template_key = key). */
export const copiesOf = (u, schoolId, key) => (u && schoolId ? q.all('SELECT * FROM lessons WHERE owner_id=? AND school_id=? AND template_key=? AND archived_at IS NULL ORDER BY created_at DESC', u.id, schoolId, normKey(key)) : []);
const statusOf = (tpl, copies) => {
  const current = copies[0] || null;
  return { key: tpl.key, version: tpl.version, inLibrary: !!current, current, copies, updateAvailable: !!current && current.template_version < tpl.version };
};
/** Is this catalogue lesson in the teacher's library for the school, and at which version?
 *  -> { key, version, inLibrary, current (newest copy | null), copies, updateAvailable } | null (unknown key) */
export function status(u, schoolId, key) {
  const tpl = getTemplate(key); if (!tpl) return null;
  const st = statusOf(tpl, copiesOf(u, schoolId, key));
  return { ...st, gamesReady: st.current ? pendingGames(st.current, tpl).length : 0 };
}
/** The same for every catalogue lesson at once: Map key -> status (one query). */
export function libraryStatus(u, schoolId) {
  const rows = u && schoolId ? q.all("SELECT * FROM lessons WHERE owner_id=? AND school_id=? AND template_key LIKE 'csq-%' AND archived_at IS NULL ORDER BY created_at DESC", u.id, schoolId) : [];
  const by = new Map();
  for (const r of rows) { if (!by.has(r.template_key)) by.set(r.template_key, []); by.get(r.template_key).push(r); }
  return new Map([...catalogue().lessons.values()].map(tpl => [tpl.key, statusOf(tpl, by.get(tpl.key) || [])]));
}

/** The folder a lesson lands in: "CS Quest" at the top of the library, then "Unit 1 · Think Like a Robot (Grades 3-5)". */
function ensureFolders(u, schoolId, tpl) {
  const tree = L.folderTree(u.id, schoolId);
  let top = tree.find(f => !f.parent_id && f.name === FOLDER);
  if (!top) { const r = L.createFolder(u, schoolId, { name: FOLDER }); if (!r.ok) throw Object.assign(new Error('folder'), { code: r.code }); top = r.folder; }
  const name = `Unit ${tpl.unit} · ${tpl.unitTitle} (${tpl.grade})`;
  let sub = tree.find(f => f.parent_id === top.id && f.name === name);
  if (!sub) { const r = L.createFolder(u, schoolId, { name, parentId: top.id }); if (!r.ok) throw Object.assign(new Error('folder'), { code: r.code }); sub = r.folder; }
  return sub.id;
}

// ---------------------------------------------------------------- derived live sets
const liveItem = (it, secs = null) => ({ q: it.q, choices: it.choices, answer: it.answer, secs: secs || it.secs, cat: it.cat });
const reviewItem = it => ({ q: it.q, choices: it.choices, answer: it.answer, secs: it.secs, cat: it.topic });
const findSet = (u, title) => q.get('SELECT * FROM live_sets WHERE owner_id=? AND subject=? AND title=? AND archived_at IS NULL ORDER BY updated_at DESC LIMIT 1', u.id, SET_SUBJECT, title) || null;
/** One derived set: the teacher's existing one by title (its items refreshed from the bank), or a new one (lesson_id set). */
function ensureSet(u, lessonId, title, items) {
  const old = findSet(u, title);
  const r = old ? SETS.updateSet(u, old.id, { items }) : SETS.createSet(u, { title, subject: SET_SUBJECT, grade: '', lang: 'en', items, lessonId });
  if (!r.ok) throw Object.assign(new Error(`set ${title}: ${r.code}`), { code: 'set', set: title, why: r.code });
  return r.set;
}
/**
 * The lesson's derived sets in the teacher's My sets (made or refreshed): the warm-up (the lesson file's five items at
 * 15 s), the exit ticket (its three items, cat kept) and the unit review (the whole bank, cat = topic).
 * -> { warmup, exit, review } (null where the lesson has none or the bank is missing), notes: [{ code: 'bankMissing', ... }].
 */
function derivedSets(u, tpl, lessonId, notes) {
  const titles = setTitles(tpl), out = { warmup: null, exit: null, review: null };
  const bank = bankOf(tpl.exit.setId);
  if (!bank) { notes.push({ code: 'bankMissing', set: tpl.exit.setId }); return out; }
  if (tpl.warmup) {
    const items = bankItems(tpl.warmup.setId, tpl.warmup.items);
    if (items) out.warmup = ensureSet(u, lessonId, titles.warmup, items.map(it => liveItem(it, tpl.warmup.secs || 15)));
    else notes.push({ code: 'bankMissing', set: tpl.warmup.setId, items: tpl.warmup.items });
  }
  const exit = bankItems(tpl.exit.setId, tpl.exit.items);
  if (exit) out.exit = ensureSet(u, lessonId, titles.exit, exit.map(it => liveItem(it)));
  else notes.push({ code: 'bankMissing', set: tpl.exit.setId, items: tpl.exit.items });
  out.review = ensureSet(u, lessonId, titles.review, bank.items.map(reviewItem));
  return out;
}

// ---------------------------------------------------------------- steps
/** A published official game by slug (live, public, not hidden), or null: an unpublished game makes a text step instead. */
export function publishedGame(slug) {
  const g = games.getGameBySlug(slug);
  return g && g.status === 'published' && g.published_version_id && !g.hidden_reason && g.visibility === 'public' ? g : null;
}
const rubricFor = (s, tpl) => (s.rubric === 'exit' ? tpl.exit.rubric : Array.isArray(s.rubric) ? s.rubric : undefined);
const addOrThrow = (r, s) => { if (!r.ok) throw Object.assign(new Error(`step ${s.title}: ${r.code}`), { code: 'step', step: s.title, why: r.code }); return r.step; };
/** The steps of a lesson file, created on the new lesson in order (see the header for the shapes). */
function makeSteps(u, lesson, tpl, sets, notes) {
  const made = [];
  for (const s of tpl.steps) {
    const nb = tpl.questCode ? String(tpl.questCode).replace(/ /g, '\u00a0') : null;
    const base = { title: s.title, body: nb ? String(s.body || '').split(tpl.questCode).join(nb) : s.body || '', minutes: s.minutes };
    if (s.kind === 'text') made.push(addOrThrow(L.addStep(u, lesson.id, { kind: 'text', ...base }), s));
    else if (s.kind === 'game') {
      const g = publishedGame(s.gameSlug);
      if (!g) {
        notes.push({ code: 'gameNotPublished', step: s.title, slug: s.gameSlug });
        made.push(addOrThrow(L.addStep(u, lesson.id, { kind: 'text', ...base, body: `${base.body}\n\n${NOT_YET_NOTE}`.trim() }), s));
      } else made.push(addOrThrow(L.addStep(u, lesson.id, { kind: 'game', ...base, gameId: g.id, options: s.options || '', standards: s.standards || '' }), s));
    } else if (s.kind === 'quiz') {
      const items = sets.exit ? SETS.itemsOf(sets.exit) : null;
      if (config.quizSteps && items && items.length) made.push(addOrThrow(L.addQuizStep(u, lesson.id, { title: s.title, setId: sets.exit.id, items, minutes: s.minutes, body: base.body }), s));
      else {
        if (config.quizSteps) notes.push({ code: 'bankMissing', step: s.title, set: tpl.exit.setId }); else notes.push({ code: 'quizStepsOff', step: s.title });
        made.push(addOrThrow(L.addStep(u, lesson.id, { kind: 'text', title: PAPER_EXIT_TITLE, body: `${base.body}\n\n${PAPER_EXIT_NOTE}`.trim(), minutes: s.minutes }), s));
      }
    } else if (s.kind === 'question' || s.kind === 'build') {
      made.push(addOrThrow(L.addStep(u, lesson.id, { kind: s.kind, ...base, standards: s.standards || '', rubric: rubricFor(s, tpl), ...(s.kind === 'build' ? { template: s.template || '' } : {}) }), s));
    } else throw Object.assign(new Error(`step ${s.title}: kind ${s.kind}`), { code: 'step', step: s.title, why: 'stepKind' });
  }
  return made;
}

// ---------------------------------------------------------------- materialise
/**
 * Put one catalogue lesson in the teacher's library for a school.
 * -> { ok, lesson, created, steps, sets: { warmup, exit, review }, notes: [{ code, ... }] } | { ok: false, code }
 * codes: notFound (unknown key, or not staff of the school), set / step (a platform refusal; why says which), folder.
 * The copy the teacher already has at this version is answered as is (created: false) unless again: true.
 */
export function materialise(u, schoolId, key, { folderId = null, again = false } = {}) {
  const tpl = getTemplate(key);
  if (!tpl || !u || !schoolId || !isStaffOf(u, schoolId)) return fail('notFound');
  if (!again) {
    const have = copiesOf(u, schoolId, tpl.key).find(c => c.template_version === tpl.version);
    if (have) return ok({ lesson: have, created: false, steps: L.steps(have.id), sets: derivedSetsOf(u, tpl), notes: [] });
  }
  const notes = [];
  try {
    return tx(() => {
      const folder = folderId || ensureFolders(u, schoolId, tpl);
      const r = L.createLesson(u, schoolId, { title: tpl.title, folderId: folder, summary: tpl.kidSummary || '', subject: SUBJECT, grade: tpl.grade,
        objectives: (tpl.iCan || []).map(cap).join('\n'), templateKey: tpl.key, templateVersion: tpl.version });
      if (!r.ok) throw Object.assign(new Error('lesson'), { code: r.code });
      const sets = derivedSets(u, tpl, r.lesson.id, notes);
      const steps = makeSteps(u, r.lesson, tpl, sets, notes);
      audit(u.id, 'lesson.materialise', r.lesson.id, { key: tpl.key, version: tpl.version, school: schoolId, notes: notes.map(n => n.code) });
      return ok({ lesson: L.getLesson(r.lesson.id), created: true, steps, sets, notes });
    });
  } catch (e) {
    if (e && e.code) return { ok: false, code: e.code, ...(e.step ? { step: e.step } : {}), ...(e.set ? { set: e.set } : {}), ...(e.why ? { why: e.why } : {}) };
    throw e;
  }
}
/**
 * Text steps of a copy that stand in for a game which was not published when the copy was made, and whose game is
 * published now (the catalogue step with the same title is a game step). -> [{ stepId, slug, game, tplStep }]
 */
export function pendingGames(lesson, tpl = lesson && getTemplate(lesson.template_key)) {
  if (!lesson || !tpl) return [];
  const want = new Map(tpl.steps.filter(s => s.kind === 'game').map(s => [s.title, s]));
  const out = [];
  for (const st of L.steps(lesson.id)) {
    const s = st.kind === 'text' && want.get(st.title); if (!s) continue;
    const g = publishedGame(s.gameSlug); if (g) out.push({ stepId: st.id, slug: s.gameSlug, game: g, tplStep: s });
  }
  return out;
}
/** "Switch on the game": those text steps become the catalogue's game steps in place (students' work on the lesson stays).
 *  -> { ok, switched: n } | { ok: false, code } */
export function switchOnGames(u, lessonId) {
  const l = L.getLesson(lessonId);
  if (!l || !L.canEditLesson(u, l) || !getTemplate(l.template_key)) return fail('notFound');
  const tpl = getTemplate(l.template_key), p = pendingGames(l, tpl);
  try {
    tx(() => { for (const x of p) addOrThrow(L.updateStep(u, x.stepId, { kind: 'game', gameId: x.game.id, body: x.tplStep.body || '', options: x.tplStep.options || '', standards: x.tplStep.standards || '' }), x.tplStep); });
  } catch (e) { if (e && e.code) return fail(e.code); throw e; }
  if (p.length) audit(u.id, 'lesson.switchOnGames', l.id, { key: l.template_key, steps: p.length });
  return ok({ switched: p.length });
}
/** The teacher's derived sets for a lesson file, by title: { warmup, exit, review } (null where there is none yet). */
export function derivedSetsOf(u, tpl) { const t = setTitles(tpl); return { warmup: tpl.warmup ? findSet(u, t.warmup) : null, exit: findSet(u, t.exit), review: findSet(u, t.review) }; }
/** Several keys in order (a unit, a path): each through materialise(); a failure skips that key and the rest go on.
 *  -> { ok: true, lessons: [{ key, lesson, created, notes }], skipped: [{ key, code }] } */
export function materialiseMany(u, schoolId, keys, opts = {}) {
  const lessons = [], skipped = [];
  for (const key of keys) {
    const r = materialise(u, schoolId, key, opts);
    if (r.ok) lessons.push({ key: normKey(key), lesson: r.lesson, created: r.created, notes: r.notes });
    else skipped.push({ key: normKey(key), code: r.code });
  }
  return ok({ lessons, skipped });
}
/** A whole unit for a band -> materialiseMany's answer plus missing (keys without a file yet); notFound for an unknown unit / band. */
export function materialiseUnit(u, schoolId, n, band, opts = {}) {
  const k = unitKeys(n, band); if (!k) return fail('notFound');
  return { ...materialiseMany(u, schoolId, k.keys, opts), missing: k.missing };
}
/** A published path for a band (Core 10 (no Builder), Full, CS Ed Week, Device-first) -> as materialiseUnit. */
export function materialisePath(u, schoolId, id, band, opts = {}) {
  const k = pathKeys(id, band); if (!k) return fail('notFound');
  return { ...materialiseMany(u, schoolId, k.keys, opts), missing: k.missing };
}
/**
 * Reset to the CS Quest version (P21): a fresh copy of the lesson's catalogue version, assigned to the same classes with
 * the old unit, opens_at and due_at; the old copy is unassigned there (its students' work stays in the removed rows and
 * comes back if it is assigned again). Classes the teacher does not manage keep the old copy (reported in kept).
 * -> { ok, lesson (the new copy), old, moved: [{ classId, classLesson }], kept: [classIds], notes } | { ok: false, code }
 */
export function resetLesson(u, lessonId) {
  const old = L.getLesson(lessonId);
  if (!old || !L.canEditLesson(u, old) || !getTemplate(old.template_key)) return fail('notFound');
  const r = materialise(u, old.school_id, old.template_key, { folderId: old.owner_id === u.id ? old.folder_id || null : null, again: true });
  if (!r.ok) return r;
  const moved = [], kept = [];
  tx(() => { for (const cl of q.all('SELECT * FROM class_lessons WHERE lesson_id=? AND removed_at IS NULL ORDER BY position, assigned_at', old.id)) {
    const a = L.assign(u, cl.class_id, r.lesson.id, { unitId: cl.unit_id, opensAt: cl.opens_at ? isoDay(cl.opens_at) : null, dueAt: cl.due_at ? isoDay(cl.due_at) : null });
    if (!a.ok) { kept.push(cl.class_id); continue; }
    L.unassign(u, cl.id);
    moved.push({ classId: cl.class_id, classLesson: a.classLesson });
  } });
  audit(u.id, 'lesson.reset', r.lesson.id, { from: old.id, key: old.template_key, moved: moved.length, kept: kept.length });
  return ok({ lesson: r.lesson, old, moved, kept, notes: r.notes });
}

// ---------------------------------------------------------------- coverage (the map the pages and scripts/cs-quest-coverage.js print)
const rubricLinesOf = l => l.steps.flatMap(s => { const lines = rubricFor(s, l); return (lines || []).map(r => ({ step: s.title, ...r })); });
/**
 * The program's coverage of the 44 CSTA ids, from the catalogue data (plan section 3): per id the lessons that list it as
 * primary / also / builds-toward, the steps whose standards carry it (Practiced), the game chapters among them, the bank
 * items tagged with it (Checked; by use), the rubric lines that carry it (Applied), and its practices; plus the practices
 * table (practice -> unit -> primary ids) and what is still missing.
 * -> { ids: [...], practices: { 1: { 1: [ids], ... }, ... }, units: [n], lessons: n, missing: [keys], complete, banks: n }
 */
export function coverage() {
  const cat = catalogue(), all = [...cat.lessons.values()];
  const items = [...cat.banks.values()].flatMap(b => b.items);
  const ids = CSTA.all().map(s => {
    const mine = all.filter(l => l.band === s.level);
    const has = (list, l) => (l.csta[list] || []).includes(s.id);
    const steps = mine.flatMap(l => l.steps.filter(x => Array.isArray(x.standards) && x.standards.includes(s.id)).map(x => ({ lesson: l.n, key: l.key, step: x.title, kind: x.kind })));
    const activities = mine.flatMap(l => l.steps.filter(x => x.kind === 'game' && Array.isArray(x.standards) && x.standards.includes(s.id) && x.options).map(x => {
      const chapter = /(?:^|&)chapter=([a-z0-9-]+)/.exec(x.options)?.[1];
      const g = cat.games[x.gameSlug], ch = g && g.chapters.find(c => c.id === chapter && c.band === l.band);
      return { lesson: l.n, game: g ? g.title : x.gameSlug, slug: x.gameSlug, chapter, chapterTitle: ch ? ch.title : chapter, levels: ch ? ch.levels : null, then: l.play && l.play.then && l.play.chapter === chapter ? l.play.then : null };
    }));
    const tagged = items.filter(it => it.cat === s.id);
    const byUse = use => tagged.filter(it => it.use === use).length;
    return {
      id: s.id, level: s.level, grades: s.grades, concept: s.concept, subconcept: s.subconcept, statement: s.statement, practices: [...s.practices], practiceCodes: [...s.practiceCodes],
      primary: mine.filter(l => has('primary', l)).map(l => l.n), also: mine.filter(l => has('also', l)).map(l => l.n), buildsToward: mine.filter(l => has('buildsToward', l)).map(l => l.n),
      primaryOutsideUnit7: mine.some(l => l.unit !== 7 && has('primary', l)),
      steps, activities, items: { total: tagged.length, exit: byUse('exit'), review: byUse('review'), opener: byUse('opener'), byLesson: [...new Set(tagged.map(it => it.lesson))].sort() },
      rubric: mine.flatMap(l => rubricLinesOf(l).filter(r => (r.ids || []).includes(s.id)).map(r => ({ lesson: l.n, line: r.line, step: r.step }))),
    };
  });
  const practices = {};
  for (let p = 1; p <= 7; p++) { practices[p] = {}; for (const u of cat.units) practices[p][u.n] = []; }
  for (const l of all) for (const id of l.csta.primary) for (const p of CSTA.byId(id).practices) if (!practices[p][l.unit].includes(id)) practices[p][l.unit].push(id);
  return { ids, practices, units: cat.units.map(u => u.n), lessons: all.length, missing: [...cat.missing], complete: cat.missing.length === 0, banks: cat.banks.size };
}
