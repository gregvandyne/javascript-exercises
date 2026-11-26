// Homeroom: Oomba follow-ups (docs/homeroom.md build order step 5; docs/decisions.md "Homeroom: onboarding, Needs a
// look, Oomba follow-ups"). After Finish class (at the end of a planned day, and of a planned week), Oomba offers a short
// card in the teacher's chat (services/companion.js offerFollowUp; drawn by public/js/companion.js):
//   - what went well, as counts (parts done, handouts finished of how many, students who finished everything);
//   - who might need a look tomorrow: the students on Needs a look (services/homeroom-look.js), kept as ids; their names
//     are put in by the page in the browser, never written in the chat's text (which the AI reads later);
//   - one-tap suggestions, each something the teacher confirms first, never done by itself: a review lesson tomorrow for
//     the group with the most unfinished work, re-teach the part that went least well, move unfinished work to tomorrow's
//     plan (each one a part added to the class's dated plan for the next school day: services/homeroom-week.js, the plan
//     pill picks it up that morning and nothing goes on desks until the teacher taps Start), and a note to the class
//     (the teacher writes it; it goes on the teacher's area once they tap Send).
// The card is made by rules from the plan's summary, with no AI call. Oomba never talks to students; nothing here
// reaches students or parents unless the teacher sends the note or starts tomorrow's plan.
import { q, uid, now, audit } from '../db.js';
import * as S from './schools.js';
import * as H from './homeroom.js';
import * as HO from './homeroom-handouts.js';
import * as HP from './homeroom-plan.js';
import * as HW from './homeroom-week.js';
import * as AT from './homeroom-attendance.js';
import * as NL from './homeroom-look.js';
import { textProblem } from './manipulatives.js';
import { tFor } from '../i18n/index.js';

const DAY = 86400e3;
const ok = (x = {}) => ({ ok: true, ...x });
const fail = code => ({ ok: false, code });
const isoOf = d => new Date(d).toISOString().slice(0, 10);
const dayOf = s => Date.parse(`${s}T00:00:00Z`);
/** How long each suggestion's part is (minutes). */
export const MINUTES = Object.freeze({ review: 15, reteach: 10, move: 15 });
/** A part that went least well: under this share of its handouts finished. */
export const RETEACH_UNDER = 0.6;
export const NOTE_MAX = 300, LOOK_MAX = 8;

/** The class's next school day after `at` (Monday to Friday, in the class's time zone): 'YYYY-MM-DD'. */
export function nextSchoolDay(c, at = now()) {
  let d = AT.localDay(AT.zoneFor(c), at) + DAY;
  while ([0, 6].includes(new Date(d).getUTCDay())) d += DAY;
  return isoOf(d);
}
const mondayOf = iso => { const d = dayOf(iso), dow = new Date(d).getUTCDay(); return isoOf(d - ((dow + 6) % 7) * DAY); };

/**
 * The follow-up card for a class whose plan of today was just finished, or null (no finished plan). Counts and ids
 * only: { id, classId, lang, day, next, weekEnd, counts, look: [student ids], sug: [{ id, kind, state, ... }], v }.
 */
export function cardFor(u, c, { lang = 'en', at = now() } = {}) {
  if (!H.canUseClass(u, c)) return null;
  const p = HP.todayOf(c, at);
  if (!p || !p.finishedAt) return null;
  const sum = p.summary || HP.summaryOf(c, p), board = HO.boardView(c, lang), att = board.att || {};
  const room = H.roomOf(c.id), present = room.students.filter(s => att[s.id] !== 'absent');
  const ids = p.parts.flatMap(x => x.handouts || []);
  const cardsOf = sid => (board.desks[sid] || []).filter(k => ids.includes(k.id));
  const allDone = ids.length ? present.filter(s => { const k = cardsOf(s.id); return k.length && k.every(x => x.done); }).length : 0;
  const counts = { partsDone: sum.partsDone, partsTotal: sum.partsTotal, finished: sum.parts.reduce((n, x) => n + (x.finished || 0), 0), of: sum.parts.reduce((n, x) => n + (x.of || 0), 0),
    allDone, homework: sum.homework, absent: sum.absent, used: sum.used, planned: sum.planned };
  // who might need a look: Needs a look as the teacher sees it now, without a hand up (that is about this minute)
  const look = NL.shown(c, NL.compute(c, { board, at, lang }), at).items.filter(x => x.reasons.some(r => r.rule !== 'hand')).map(x => x.id).slice(0, LOOK_MAX);
  const sug = [];
  const unfinished = (part, members) => (part.handouts || []).reduce((n, id) => n + members.filter(s => { const k = (board.desks[s.id] || []).find(x => x.id === id); return k && !k.done; }).length, 0);
  const work = p.parts.filter(x => x.versions && x.versions.length && (x.handouts || []).length);
  // a review lesson for the group with the most unfinished work (counts of cards, never students compared)
  if (work.length) {
    let best = null;
    for (const g of room.groups) {
      const members = present.filter(s => room.members[s.id] === g.id);
      if (!members.length) continue;
      const n = work.reduce((m, part) => m + unfinished(part, members), 0);
      if (n > 0 && (!best || n > best.n)) best = { g, n };
    }
    if (best) {
      const part = work[0], v = part.versions.find(x => x.group === best.g.id) || part.versions.find(x => !x.group) || part.versions[0];
      sug.push({ id: 'review', kind: 'review', state: 'open', group: best.g.id, pick: v.pick, what: HP.pickTitle(u, v.pick, lang) });
    }
  }
  // re-teach the part with the smallest share finished (under RETEACH_UNDER, at least two handouts)
  const weak = sum.parts.map((x, i) => ({ x, i })).filter(({ x }) => x.of >= 2 && x.finished / x.of < RETEACH_UNDER).sort((a, b) => a.x.finished / a.x.of - b.x.finished / b.x.of)[0];
  if (weak) sug.push({ id: 'reteach', kind: 'reteach', state: 'open', title: weak.x.title || '', partKind: weak.x.kind });
  // unfinished work: time tomorrow to finish the part with the most left (its handouts stay on desks as homework)
  if (sum.homework > 0 && work.length) {
    const part = [...work].sort((a, b) => unfinished(b, present) - unfinished(a, present))[0];
    if (unfinished(part, present) > 0) sug.push({ id: 'move', kind: 'move', state: 'open', versions: part.versions, what: part.title || HP.pickTitle(u, part.versions[0].pick, lang) });
  }
  sug.push({ id: 'note', kind: 'note', state: 'open' });
  const strip = HW.stripOf(c, at), today = HW.todayIso(c, at);
  const weekEnd = !!p.week && !(strip && strip.days.some(d => d.date > today && d.plan));
  return { id: uid(10), classId: c.id, lang, at, day: today, next: nextSchoolDay(c, at), weekEnd, counts, look, sug, v: 1 };
}

/** A part added to the class's dated plan for a day after today (a new plan for that day when it has none). */
export function addToDay(u, c, iso, part, { lang = 'en', at = now() } = {}) {
  if (!H.canUseClass(u, c)) return fail('notFound');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(iso || '')) || iso <= HW.todayIso(c, at)) return fail('pastDay');
  const cur = HW.datedOf(c, iso), t = tFor(lang);
  const base = cur || { id: uid(10), name: t('js.companion.follow.planName'), topic: '', parts: [] };
  const r = HP.cleanPlan(u, c, { name: base.name, topic: base.topic, parts: [...base.parts, part] }, { lang, id: base.id, totalMax: cur && cur.half ? HW.HALF_MAX : HP.TOTAL_MAX });
  if (r.plan.parts.length < base.parts.length + 1) return fail('planFull');
  const { date, ...keep } = cur || {};
  const plan = { ...keep, ...r.plan, name: r.plan.name || base.name };
  const tt = now();
  q.run(`INSERT INTO homeroom_week_days(class_id, day, week, plan, created_by, created_at, updated_at) VALUES (?,?,?,?,?,?,?)
    ON CONFLICT(class_id, day) DO UPDATE SET plan=excluded.plan, updated_at=excluded.updated_at`, c.id, iso, mondayOf(iso), JSON.stringify(plan), u.id, tt, tt);
  return ok({ plan });
}

/** "Send a note to the class": the teacher's words as a sticky note on the teacher's area (everyone sees it). */
export function addNote(u, c, text) {
  if (!H.canUseClass(u, c)) return fail('notFound');
  const v = HO.cleanInstructions(String(text || '').slice(0, NOTE_MAX));
  if (!v) return fail('needText');
  const bad = textProblem(v); if (bad) return fail(bad);
  const area = H.roomOf(c.id).area || {}, ann = area.__ann || {}, notes = Array.isArray(ann.notes) ? ann.notes : [];
  if (notes.length >= 12) return fail('areaFull');
  const n = notes.length;
  const note = { id: `fu${uid(6)}`, text: v, x: Math.round((0.04 + (n % 4) * 0.13) * 1000) / 1000, y: Math.round((0.14 + Math.floor(n / 4) * 0.28) * 1000) / 1000, by: 't' };
  return H.saveArea(u, c, { ...area, __ann: { notes: [...notes, note], texts: Array.isArray(ann.texts) ? ann.texts : [], strokes: Array.isArray(ann.strokes) ? ann.strokes : [] } });
}

/**
 * The teacher confirmed one suggestion (the page asked first): review, reteach and move add a part to the next school
 * day's plan; note puts their words on the teacher's area. -> { ok, card (with that suggestion done), toast }
 */
export function doSuggestion(u, card, sugId, value = '', { at = now() } = {}) {
  const c = card && S.getClass(card.classId);
  if (!c || !H.canUseClass(u, c)) return fail('notFound');
  const s = (card.sug || []).find(x => x.id === String(sugId || ''));
  if (!s) return fail('notFound');
  if (s.state === 'done') return fail('already');
  const lang = card.lang || 'en', t = tFor(lang), day = HW.dayName(card.next, lang, true);
  let r;
  if (s.kind === 'note') r = addNote(u, c, value);
  else {
    const part = s.kind === 'review' ? { kind: 'work', minutes: MINUTES.review, title: t('js.companion.follow.reviewTitle'), versions: [{ group: s.group, pick: s.pick }], only: true }
      : s.kind === 'reteach' ? { kind: 'slides', minutes: MINUTES.reteach, title: t('js.companion.follow.reteachTitle', { title: s.title || t(`js.companion.plan.kind.${s.partKind || 'work'}`) }).slice(0, HP.TITLE_MAX) }
        : s.kind === 'move' ? { kind: 'work', minutes: MINUTES.move, title: t('js.companion.follow.finishTitle'), versions: s.versions }
          : null;
    if (!part) return fail('notFound');
    r = addToDay(u, c, card.next, part, { lang, at });
  }
  if (!r.ok) return r;
  audit(u.id, 'homeroom.followUp', c.id, { kind: s.kind, day: s.kind === 'note' ? '' : card.next });
  const next = { ...card, v: (card.v || 1) + 1, sug: card.sug.map(x => (x.id === s.id ? { ...x, state: 'done' } : x)) };
  return ok({ card: next, c, toast: s.kind === 'note' ? t('js.companion.follow.noteDone') : t('js.companion.follow.added', { day }) });
}

/** The card as the teacher's page draws it: labels in their language (group names, the next day's name), counts, the
 *  students to look at as ids (the page puts their names in), and each suggestion with what Confirm will do. */
export function cardView(u, card, tt) {
  const c = card && S.getClass(card.classId);
  if (!c || !H.canUseClass(u, c)) return { id: card && card.id, gone: true };
  const lang = card.lang || 'en', day = HW.dayName(card.next, lang, true);
  const groups = H.roomOf(c.id).groups, gname = id => HP.groupLabel(groups.find(g => g.id === id), lang);
  const kindName = k => tt(`js.companion.plan.kind.${k || 'work'}`);
  const sug = (card.sug || []).map(s => {
    const base = { id: s.id, kind: s.kind, state: s.state };
    if (s.kind === 'review') return { ...base, label: tt('js.companion.follow.review', { group: gname(s.group), day }), confirm: tt('js.companion.follow.reviewAsk', { what: s.what || kindName('work'), group: gname(s.group), day, minutes: MINUTES.review }) };
    if (s.kind === 'reteach') return { ...base, label: tt('js.companion.follow.reteach', { part: s.title || kindName(s.partKind), day }), confirm: tt('js.companion.follow.reteachAsk', { part: s.title || kindName(s.partKind), day, minutes: MINUTES.reteach }) };
    if (s.kind === 'move') return { ...base, label: tt('js.companion.follow.move', { day }), confirm: tt('js.companion.follow.moveAsk', { what: s.what || kindName('work'), day, minutes: MINUTES.move }) };
    return { ...base, label: tt('js.companion.follow.note'), text: tt('js.companion.follow.noteText') };
  });
  return { id: card.id, classId: c.id, className: c.name, day, weekEnd: !!card.weekEnd, counts: card.counts || {}, look: card.look || [], sug, v: card.v || 1 };
}
