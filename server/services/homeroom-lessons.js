// Homeroom lessons, step 2b (docs/homeroom.md "Handouts and lessons"; docs/decisions.md "Homeroom, step 2b"): a teacher
// builds a lesson in Homeroom for Arithmetic Lab, Algebra Builder or Crossword with that game's own settings (shared with
// the builder: public/js/homeroom-lesson-make.js), a name, instructions and, when they want, a version for each group;
// keeps it in My lessons (theirs, for any of their classes: edit, duplicate, delete); prints its worksheet; and hands it
// out like a game, each student getting their group's version.
//
// A lesson is built from what is already there, never beside it:
//   - each version IS a question set of the game (services/game-sets.js save: the game's own cleaner checks it, and it
//     is in the teacher's My worksheets in the game too), opened as any set is: ?chapter=s-xxxxxxxxxx&lock=1;
//   - homeroom_lessons (0126) only links them: the game, the name, the instructions, the settings the builder edits and
//     each version's set (base: everyone without a version; versions: [{ key, label, s, set }], key a group's identity,
//     its name or an unnamed default group's key, so a lesson's versions find the same groups in another class);
//   - handing out (handOutLesson) makes one class assignment per version through services/game-folders.js assignGame
//     with the set in the step's options, exactly the students of that version, and a homeroom_handouts row (in_order,
//     grade (Score by default for lessons), hr_lesson, version, problems, batch: the versions of one hand-out);
//   - the worksheet is the game's own printer (services/game-print.js: Arithmetic Lab's and Crossword's pages);
//     Algebra Builder has no printer, so its sheet is made here on the same paper (the cwp page frame).
// Who: only a teacher Homeroom lets in (services/homeroom.js canUse) has lessons, and only their own: anyone else's
// lesson reads exactly as one that isn't there. Nothing here knows a student: a set is numbers and the teacher's words.
import { q, now, uid, audit } from '../db.js';
import { getUserByName, OFFICIAL } from '../auth.js';
import * as games from './games.js';
import * as gameSets from './game-sets.js';
import * as F from './game-folders.js';
import * as L from './lessons.js';
import * as H from './homeroom.js';
import * as HO from './homeroom-handouts.js';
import { PRINTERS } from './game-print.js';
import { textProblem } from './manipulatives.js';
import { cleanText } from './textfilter.js';
import { GROUPS_MAX, GROUP_NAME_MAX } from '../../public/js/homeroom-seats.js';
import { LESSON_SLUGS, fill, countOf, crossLayout, algebraText, groupIdent } from '../../public/js/homeroom-lesson-make.js';

export { LESSON_SLUGS };
const ok = (x = {}) => ({ ok: true, ...x });
const fail = (code, x = {}) => ({ ok: false, code, ...x });
const json = (s, d) => { try { const v = JSON.parse(s); return v ?? d; } catch { return d; } };
/** Lessons one teacher may keep. */
export const LESSONS_MAX = 100;
export const TITLE_MAX = 60;

// ---------------------------------------------------------------- the games
/** The official game a lesson of this slug is for (it keeps question sets), or null. */
export function lessonGame(slug) {
  if (!LESSON_SLUGS.includes(slug)) return null;
  const g = games.getGameBySlug(slug), off = getUserByName(OFFICIAL);
  return g && g.source === 'seed' && off && g.owner_id === off.id && g.status !== 'deleted' && gameSets.SET_GAMES.has(slug) ? g : null;
}
/** The games this teacher can build a lesson for: [{ slug, id, title, icon }] in the builder's order. */
export function lessonGames(u, locale = 'en') {
  return LESSON_SLUGS.map(slug => lessonGame(slug)).filter(g => g && HO.handable(u, g)).map(g => { const x = games.localizeGame(g, locale); return { slug: g.slug, id: g.id, title: x.title, icon: g.icon || '🎮' }; });
}

// ---------------------------------------------------------------- checking what the builder sends
/** A version's or the base's settings -> { ok, s (filled), items (the game's clean set) } | fail('settings'|'words'). */
export function cleanSettings(slug, raw, title = '') {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return fail('settings');
  const s = fill(slug, raw);
  let items = null;
  if (slug === 'arithmetic-lab') items = gameSets.cleanBoxItems([{ k: s.op, p: s.problems, l: s.level, ...(s.method !== 'standard' ? { m: s.method } : {}) }]);
  else if (slug === 'algebra-builder') items = gameSets.cleanItems(s.problems.map(p => ({ a: s.mode, p, s: s.tiles, l: true })));
  else if (slug === 'crossword') {
    if (s.words.length < gameSets.CROSS.min) return fail('fewWords');
    if (s.words.some(([w, c]) => !w.trim() || !c.trim())) return fail('missingClue');
    items = gameSets.cleanCrossItems([{ t: String(title).slice(0, gameSets.CROSS.title), w: s.words, r: s.seed, b: s.bank, h: s.hints }]);
    if (!items) return fail('words');
    s.words = items[0].w;
  }
  return items ? ok({ s, items }) : fail('settings');
}
function cleanTitle(raw) {
  if (typeof raw !== 'string') return fail('needTitle');
  const v = raw.replace(/\s+/g, ' ').trim();
  if (!v) return fail('needTitle');
  if (v.length > TITLE_MAX) return fail('titleLong');
  const c = cleanText(v, TITLE_MAX);
  return c.ok ? ok({ value: c.value }) : fail('words');
}
function cleanInstr(raw) {
  if (raw !== undefined && raw !== null && typeof raw !== 'string') return fail('tooLong');
  if (String(raw || '').trim().length > HO.INSTRUCTIONS_MAX) return fail('tooLong');
  const text = HO.cleanInstructions(raw || ''), bad = textProblem(text);
  return bad ? fail(bad) : ok({ value: text });
}
/** The versions as sent: [{ key, label, s }] -> clean ones (at most one per group) or a failure. */
function cleanVersions(slug, list, title) {
  if (list === undefined || list === null) return ok({ list: [] });
  if (!Array.isArray(list) || list.length > GROUPS_MAX) return fail('settings');
  const out = [], seen = new Set();
  for (const v of list) {
    if (!v || typeof v !== 'object') return fail('settings');
    const key = String(v.key || ''), label = String(v.label || '').replace(/\s+/g, ' ').trim().slice(0, GROUP_NAME_MAX);
    if (!/^[nk]:.{1,40}$/su.test(key) || seen.has(key) || !label || textProblem(label)) return fail('settings');
    const c = cleanSettings(slug, v.s, title); if (!c.ok) return c;
    seen.add(key); out.push({ key, label, s: c.s, items: c.items });
  }
  return ok({ list: out });
}

// ---------------------------------------------------------------- reading
const rowOf = id => q.get('SELECT * FROM homeroom_lessons WHERE id=?', String(id || '')) || null;
/** The teacher's own lesson as stored ({ ...row, base: { s, set }, versions: [{ key, label, s, set }] }), or null. */
export function getMine(u, id) {
  const r = rowOf(id);
  if (!r || !u || r.owner_id !== u.id) return null;
  return { ...r, base: json(r.base, {}), versions: json(r.versions, []) };
}
/** One lesson as My lessons and the builder show it. */
function view(l, locale) {
  const g = games.getGame(l.game_id), x = g ? games.localizeGame(g, locale) : null;
  return { id: l.id, slug: l.slug, title: l.title, instructions: l.instructions, icon: (g && g.icon) || '📄', game: x ? x.title : '', gameId: l.game_id,
    n: countOf(l.slug, l.base.s || {}), base: l.base.s || {}, code: l.base.set ? gameSets.codeOf(l.base.set) : '',
    versions: l.versions.map(v => ({ key: v.key, label: v.label, s: v.s, n: countOf(l.slug, v.s || {}) })), updated: l.updated_at };
}
/** The teacher's lessons, newest first. */
export function listMine(u, locale = 'en') {
  return q.all('SELECT * FROM homeroom_lessons WHERE owner_id=? ORDER BY updated_at DESC, id LIMIT ?', u.id, LESSONS_MAX)
    .map(r => view({ ...r, base: json(r.base, {}), versions: json(r.versions, []) }, locale));
}

// ---------------------------------------------------------------- saving
/** Is this set still opened by an assignment (a step's options name it)? Then it stays when its lesson changes. */
const setInUse = (gameId, set) => !!q.get("SELECT 1 FROM lesson_steps WHERE game_id=? AND kind='game' AND options LIKE ?", gameId, `%chapter=${set}%`);
function dropSet(u, gameId, set) { if (set && !setInUse(gameId, set)) gameSets.remove(gameId, u.id, set); }
/** Save a set for a version (the one it had, changed; a new one when it had none or it is gone). -> { id } | { error } */
function saveSet(u, g, items, was, title) {
  const keep = was && gameSets.get(g.id, was) && gameSets.get(g.id, was).ownerId === u.id && !setInUse(g.id, was);
  return gameSets.save(g.id, u.id, items, keep ? was : null, g.slug, { title });
}
/**
 * Save a lesson: a new one, or (id) the teacher's own one changed. { id?, slug, title, instructions, base: settings,
 * versions: [{ key, label, s }] }. A version's set that an assignment already opens is never changed under it: the lesson
 * gets a new set and the old one stays for that assignment. -> { ok, lesson } | { ok: false, code }
 */
export function saveLesson(u, { id = null, slug, title, instructions = '', base, versions } = {}) {
  if (!H.canUse(u)) return fail('notFound');
  const was = id ? getMine(u, id) : null;
  if (id && !was) return fail('noLesson');
  if (was && was.slug !== slug) return fail('badGame');
  const g = lessonGame(String(slug || ''));
  if (!g || !HO.handable(u, g)) return fail('badGame');
  const tt = cleanTitle(title); if (!tt.ok) return tt;
  const ins = cleanInstr(instructions); if (!ins.ok) return ins;
  const b = cleanSettings(g.slug, base, tt.value); if (!b.ok) return b;
  const vs = cleanVersions(g.slug, versions, tt.value); if (!vs.ok) return vs;
  if (!was && q.get('SELECT COUNT(*) n FROM homeroom_lessons WHERE owner_id=?', u.id).n >= LESSONS_MAX) return fail('tooManyLessons');
  // the sets: the base, then each version (its own set kept when it had one, matched by its group)
  const made = [];
  const undo = () => { for (const s of made) gameSets.remove(g.id, u.id, s); };
  const put = (items, old, name) => {
    const r = saveSet(u, g, items, old, name);
    if (r.error) return r;
    if (r.id !== old) made.push(r.id);
    return r;
  };
  const rb = put(b.items, was && was.base.set, tt.value);
  if (rb.error) { undo(); return fail(rb.error === 'full' ? 'setsFull' : 'settings'); }
  const outVersions = [];
  for (const v of vs.list) {
    const old = was && (was.versions.find(x => x.key === v.key) || {}).set;
    const r = put(v.items, old, `${tt.value} · ${v.label}`.slice(0, gameSets.TITLE_MAX));
    if (r.error) { undo(); return fail(r.error === 'full' ? 'setsFull' : 'settings'); }
    outVersions.push({ key: v.key, label: v.label, s: v.s, set: r.id });
  }
  // sets the lesson no longer uses (a version taken away, or replaced by a new set) go, unless an assignment opens them
  if (was) {
    const now2 = new Set([rb.id, ...outVersions.map(v => v.set)]);
    for (const s of [was.base.set, ...was.versions.map(v => v.set)]) if (s && !now2.has(s)) dropSet(u, g.id, s);
  }
  const t = now(), lid = was ? was.id : uid(12);
  const row = [g.id, g.slug, tt.value, ins.value, JSON.stringify({ s: b.s, set: rb.id }), JSON.stringify(outVersions)];
  if (was) q.run('UPDATE homeroom_lessons SET game_id=?, slug=?, title=?, instructions=?, base=?, versions=?, updated_at=? WHERE id=?', ...row, t, lid);
  else q.run('INSERT INTO homeroom_lessons(id, owner_id, game_id, slug, title, instructions, base, versions, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)', lid, u.id, ...row, t, t);
  audit(u.id, was ? 'homeroom.lessonEdit' : 'homeroom.lessonNew', lid, { game: g.slug, versions: outVersions.length });
  return ok({ lesson: getMine(u, lid) });
}
/** A copy of the teacher's lesson, with new sets, named title ("Copy of ..."). -> { ok, lesson } */
export function duplicateLesson(u, id, title) {
  const l = getMine(u, id); if (!l) return fail('noLesson');
  return saveLesson(u, { slug: l.slug, title: String(title || l.title).slice(0, TITLE_MAX), instructions: l.instructions, base: l.base.s, versions: l.versions.map(v => ({ key: v.key, label: v.label, s: v.s })) });
}
/** Delete the teacher's lesson and its sets (a set an assignment still opens stays, so desks keep working). */
export function deleteLesson(u, id) {
  const l = getMine(u, id); if (!l) return fail('noLesson');
  for (const s of [l.base.set, ...l.versions.map(v => v.set)]) dropSet(u, l.game_id, s);
  q.run('DELETE FROM homeroom_lessons WHERE id=? AND owner_id=?', l.id, u.id);
  audit(u.id, 'homeroom.lessonDelete', l.id, { game: l.slug });
  return ok();
}
/** An account's lessons go with it (their sets go with services/game-sets.js forgetUser). */
export function forgetUser(userId) { q.run('DELETE FROM homeroom_lessons WHERE owner_id=?', userId); }

// ---------------------------------------------------------------- the worksheet (preview and Print)
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
/** Algebra Builder's sheet (the game has no printer): the problems with room to work, on the crossword's paper. */
function algebraHtml(s, { title, note }, { t, dir, lang, code, link }) {
  const foot = `<footer class="cwp-foot"><span>${esc(t('play.print.made'))}</span>${code ? `<span>${esc(t('play.print.code', { code }))}</span>` : ''}${link ? `<span dir="ltr" class="cwp-link">${esc(link)}</span>` : ''}</footer>`;
  return `<div class="cwp abp" lang="${esc(lang)}" dir="${dir === 'rtl' ? 'rtl' : 'ltr'}"><section class="cwp-page">
<header class="cwp-head"><h1>${esc(title)}</h1><p class="cwp-lines"><span class="cwp-line">${esc(t('play.print.name'))}<i class="cwp-blank cwp-blank-name"></i></span><span class="cwp-line">${esc(t('play.print.date'))}<i class="cwp-blank"></i></span></p></header>
${note ? `<p class="bbp-mine" dir="auto">${esc(note)}</p>` : ''}<p class="bbp-how">${esc(t(`homeroom.lessons.print.${s.mode}`))}</p>
<ol class="abp-list">${s.problems.map(p => `<li><span class="abp-p" dir="ltr">${esc(algebraText(p))}</span><span class="abp-work" aria-hidden="true"></span></li>`).join('')}</ol>
${foot}</section></div>`;
}
/** The printable page of one version's settings (or the builder's draft): { ok, html } | fail. opts: { title, note,
 *  set (its set id: the footer's class code and link), key (the answer key: Arithmetic Lab and Crossword) }. */
export function sheetHtml(slug, settings, { title = '', note = '', set = '', key = false } = {}, { t, dir = 'ltr', lang = 'en', origin = '' }) {
  const c = cleanSettings(slug, settings, title); if (!c.ok) return c;
  const s = c.s, code = set ? gameSets.codeOf(set) : '', link = set ? `${origin}/play/${slug}?chapter=${set}&lock=1` : '';
  const ctx = { t, dir, lang, code, link };
  if (slug === 'algebra-builder') return ok({ html: algebraHtml(s, { title, note }, ctx), n: s.problems.length, s });
  const printer = PRINTERS.get(slug);
  const doc = slug === 'arithmetic-lab'
    ? { k: s.op, p: s.problems, ...(s.method !== 'standard' ? { m: s.method } : {}), ...(note ? { note } : {}), ...(set ? { set } : {}), key: !!key }
    : { t: String(title).slice(0, gameSets.CROSS.title), w: s.words, b: s.bank, g: crossLayout(s.words.map(w => w[0]), s.seed), ...(note ? { note } : {}), ...(set ? { set } : {}), key: !!key };
  const r = printer.clean(doc);
  if (!r.ok) return fail('settings');
  return ok({ html: printer.html(r.doc, { ...ctx, heading: title }), n: countOf(slug, s), s });
}
/** The builder's live preview: the draft's sheet, and its settings as they will be saved. */
export function preview(u, { slug, title, instructions, settings }, ctx) {
  if (!H.canUse(u)) return fail('notFound');
  if (!lessonGame(String(slug || ''))) return fail('badGame');
  const name = typeof title === 'string' && title.trim() ? title.replace(/\s+/g, ' ').trim().slice(0, TITLE_MAX) : ctx.t('homeroom.lessons.untitled');
  const ins = cleanInstr(instructions);
  return sheetHtml(slug, settings, { title: cleanText(name, TITLE_MAX).ok ? name : '', note: ins.ok ? ins.value : '' }, ctx);
}
/** Print one version of the teacher's lesson (key '' is the base: everyone without a version). */
export function printLesson(u, id, versionKey, { key = false } = {}, ctx) {
  const l = getMine(u, id); if (!l) return fail('noLesson');
  const v = versionKey ? l.versions.find(x => x.key === versionKey) : l.base;
  if (!v) return fail('noLesson');
  return sheetHtml(l.slug, v.s, { title: l.title, note: l.instructions, set: v.set, key }, ctx);
}

// ---------------------------------------------------------------- handing a lesson out
/**
 * Hand out a lesson: { lessonId, to: { kind: all | group | desk, id }, order: in | any, grade (Score by default), dueAt }.
 * Each student gets their group's version (or the base): one class assignment per version, through assignGame with the
 * version's set in the game step's options. Whole class with one version for everyone stays the whole class ([]).
 * Refused while any of its students already has this lesson on their desk. -> { ok, students, versions, lesson }
 */
export function handOutLesson(u, c, { lessonId, to, order = 'in', grade = 'score', dueAt = null } = {}) {
  if (!H.canUseClass(u, c)) return fail('notFound');
  if (!['in', 'any'].includes(order)) return fail('badOrder');
  if (!HO.GRADES.includes(grade)) return fail('badGrade');
  const l = getMine(u, lessonId); if (!l) return fail('noLesson');
  const g = games.getGame(l.game_id);
  if (!HO.handable(u, g)) return fail('pickGame');
  const who = HO.studentsFor(c, to); if (!who.ok) return who;
  if (HO.openCount(c.id) >= HO.HANDOUTS_MAX) return fail('tooManyHandouts');
  const open = q.all(`SELECT h.class_lesson_id id FROM homeroom_handouts h JOIN class_lessons cl ON cl.id=h.class_lesson_id AND cl.removed_at IS NULL
    WHERE h.class_id=? AND h.hr_lesson=?`, c.id, l.id), picks = L.picksIn(c.id);
  const have = who.all.filter(id => open.some(r => !picks.has(r.id) || picks.get(r.id).has(id)));
  if (have.length) return fail('lessonOnDesk', { count: have.length });
  // each student's version: their group's (matched by the group's name, or an unnamed default group's key), else the base
  const room = H.roomOf(c.id), buckets = new Map();
  for (const sid of who.all) {
    const grp = room.groups.find(x => x.id === room.members[sid]), k = groupIdent(grp);
    const v = (k && l.versions.find(x => x.key === k)) || null, set = v ? v.set : l.base.set;
    if (!buckets.has(set)) buckets.set(set, { v, s: v ? v.s : l.base.s, ids: [] });
    buckets.get(set).ids.push(sid);
  }
  for (const set of buckets.keys()) if (!gameSets.get(g.id, set)) return fail('lessonGone');
  const batch = uid(10), made = [];
  for (const [set, b] of buckets) {
    const students = who.target === 'all' && buckets.size === 1 ? [] : b.ids;
    const r = F.assignGame(u, c.id, g.id, { dueAt: dueAt || null, students, body: l.instructions, again: true, options: `chapter=${set}&lock=1`, title: l.title });
    if (!r.ok) { for (const id of made) L.unassign(u, id); return r; }
    made.push(r.classLesson.id);
    q.run('INSERT INTO homeroom_handouts(class_lesson_id, class_id, in_order, grade, target, created_by, created_at, hr_lesson, version, problems, batch) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
      r.classLesson.id, c.id, order === 'in' ? 1 : 0, grade, who.target, u.id, now(), l.id, b.v ? b.v.label : '', countOf(l.slug, b.s || {}), batch);
  }
  audit(u.id, 'homeroom.lessonHandout', c.id, { lesson: l.id, game: g.slug, target: who.target, students: who.all.length, versions: buckets.size, order, grade });
  return ok({ students: who.all.length, versions: buckets.size, lesson: l, classLessons: made.map(id => L.getClassLesson(id)).filter(Boolean) });
}
