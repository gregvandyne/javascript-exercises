// Homeroom: week plans (docs/homeroom.md "The day's plan", build order step 5; docs/decisions.md "Homeroom: week plans,
// due dates, copying plans"). Planning stays in the Oomba chat and the plan pill: there is no plan row on the board.
//
// - A week plan: { id, name, topic, start: Monday 'YYYY-MM-DD', days: [{ date, half, plan | null }] }: the class's school
//   days (Monday to Friday) with a short day plan each (the same parts as a day plan: services/homeroom-plan.js), drafted
//   in the chat (the companion's draftWeekPlan, or fallbackWeek without the AI) as a card with Monday to Friday.
// - cleanWeek: whatever the AI sends is checked here: known days only, each day's plan through cleanPlan (kinds, minutes,
//   lessons, games and groups), a half day at most HALF_MAX minutes; never a student's name.
// - Use this week (useWeek): each day's plan saved as a dated day plan (homeroom_week_days, migration 0139). On that day,
//   in the class's time zone, the plan pill picks it up ("Today: <name>", Start): nothing goes on desks and no part starts
//   until the teacher taps Start (or Put on desks); parts never move on by themselves (services/homeroom-plan.js).
// - The pill's week strip (stripOf): Monday to Friday of this week, each day's plan's name and minutes; the teacher opens
//   a day, swaps two days or clears one (dayAction). Past days stay as they were.
// - Copying (copyWeek, nextWeek): to another class of the same teacher, or to next week; groups are found there by name
//   or default key (a group the class doesn't have gets the everyone version); lessons and handouts are only made in that
//   class when the day's plan is used.
import { q, uid, now, audit } from '../db.js';
import * as S from './schools.js';
import * as H from './homeroom.js';
import * as HP from './homeroom-plan.js';
import * as HL from './homeroom-lessons.js';
import * as HO from './homeroom-handouts.js';
import * as AT from './homeroom-attendance.js';
import * as games from './games.js';
import { studentNames } from '../builder/lesson.js';
import { tFor } from '../i18n/index.js';

const DAY = 86400e3;
export const DAYS = Object.freeze(['mon', 'tue', 'wed', 'thu', 'fri']);
/** A half day's plan: at most this many minutes. */
export const HALF_MAX = 60;
const ok = (x = {}) => ({ ok: true, ...x });
const fail = (code, x = {}) => ({ ok: false, code, ...x });
const json = (s, d) => { try { const v = JSON.parse(s); return v ?? d; } catch { return d; } };
const isoOf = day => new Date(day).toISOString().slice(0, 10);
const dayOfIso = s => Date.parse(`${s}T00:00:00Z`);
const ISO = /^\d{4}-\d{2}-\d{2}$/;

// ---------------------------------------------------------------- the class's week
/** The class's zone (the school's, else UTC) and its day now: 'YYYY-MM-DD'. */
export const todayIso = (c, at = now()) => isoOf(AT.localDay(AT.zoneFor(c), at));
/** The school week holding `at` in the class's zone (Saturday and Sunday: the next one), `offset` weeks on.
 *  -> { start, days: [5 x 'YYYY-MM-DD'], today } */
export function weekOf(c, at = now(), offset = 0) {
  const today = AT.localDay(AT.zoneFor(c), at), dow = new Date(today).getUTCDay();
  const mon = today + (dow === 0 ? 1 : dow === 6 ? 2 : 1 - dow) * DAY + offset * 7 * DAY;
  return { start: isoOf(mon), days: DAYS.map((_, i) => isoOf(mon + i * DAY)), today: isoOf(today) };
}
/** Which school day of the week a word means: 'Monday', 'mon', 'Wed', a date of the week, or 0..4. -> index | -1 */
export function dayIndex(v, week = null) {
  if (Number.isInteger(v) && v >= 0 && v < 5) return v;
  const s = String(v ?? '').trim().toLowerCase();
  if (week && ISO.test(s)) return week.days.indexOf(s);
  const m = /^(mon|tue|wed|thu|fri)/.exec(s);
  return m ? DAYS.indexOf(m[1]) : -1;
}
/** A day's short name in a language ("Mon"). */
export const dayName = (iso, lang = 'en', long = false) => { try { return new Date(dayOfIso(iso)).toLocaleDateString(lang, { weekday: long ? 'long' : 'short', timeZone: 'UTC' }); } catch { return iso; } };

// ---------------------------------------------------------------- checking a week
/**
 * A week as the AI (or a change) sent it, made safe for this class. raw: { name, topic, week: 'this' | 'next' | start,
 * days: [{ day, half, name, parts }] }. -> { week, notes } (notes: { day: 'Wed', ...what cleanPlan said })
 */
export function cleanWeek(u, c, raw, { lang = 'en', names = studentNames(u), start = null, id = null, at = now() } = {}) {
  const src = raw && typeof raw === 'object' ? raw : {}, notes = [];
  const wk = start && ISO.test(start) ? { start, days: DAYS.map((_, i) => isoOf(dayOfIso(start) + i * DAY)) } : weekOf(c, at, src.week === 'next' ? 1 : 0);
  const days = wk.days.map(date => ({ date, half: false, plan: null }));
  const seen = new Set();
  for (const d of (Array.isArray(src.days) ? src.days : []).slice(0, 10)) {
    if (!d || typeof d !== 'object') continue;
    const i = dayIndex(d.day ?? d.date, wk);
    if (i < 0) { notes.push({ k: 'day', day: HP.cleanTitle(d.day, { max: 20 }) }); continue; }
    if (seen.has(i)) { notes.push({ k: 'dayTwice', day: dayName(wk.days[i]) }); continue; }
    seen.add(i);
    const half = !!d.half;
    const r = HP.cleanPlan(u, c, { name: d.name || '', topic: src.topic, parts: d.parts }, { lang, names, totalMax: half ? HALF_MAX : HP.TOTAL_MAX, id: typeof d.id === 'string' && /^[A-Za-z0-9_-]{6,16}$/.test(d.id) ? d.id : null });
    for (const n of r.notes) notes.push({ ...n, day: dayName(wk.days[i]) });
    days[i] = { date: wk.days[i], half, plan: r.plan.parts.length ? r.plan : null };
  }
  const name = HP.cleanTitle(src.name, { names, max: HP.NAME_MAX }), topic = HP.cleanTitle(src.topic, { names, max: HP.TOPIC_MAX });
  return { week: { id: id || uid(10), name, topic, start: wk.start, days }, notes };
}
/** The week as the AI is told it landed: each day with its date, half day or not, and its plan read back. */
export function readBackWeek(u, c, w, lang = 'en') {
  return { name: w.name || '', topic: w.topic || '', start: w.start,
    days: w.days.map(d => ({ day: dayName(d.date, 'en', true), date: d.date, ...(d.half ? { halfDay: true } : {}), ...(d.plan ? { plan: HP.readBack(u, c, d.plan, lang) } : { plan: null }) })) };
}
/** The planning rules for weeks (services/companion.js adds them to the day plan's). */
export function weekRules() {
  return [
    'Week plans: when the teacher asks for this week\'s (or next week\'s) plan, call draftWeekPlan with Monday to Friday, each day a SHORT day plan with the same parts as a day plan (slides, work time, brain break, exit check). Spread the teacher\'s lessons and saved plans over the days; one topic step a day. The card shows the week; nothing is saved until the teacher taps Use this week.',
    'Changes to the week ("move the quiz to Thursday", "Wednesday is a half day", "swap Monday and Tuesday"): call draftWeekPlan again with the WHOLE week changed (the week on the card is in getPageContext as weekOnCard). A half day has half: true and at most 60 minutes.',
  ].join('\n');
}

// ---------------------------------------------------------------- without the AI
const WEEK_WORDS = /\bweek\b|\bweekly\b|\bmonday|\btuesday|\bwednesday|\bthursday|\bfriday|\bhalf[ -]?day/i;
/** Is this request about a week (the fallback without the AI decides between a day and a week by it)? */
export const aboutWeek = text => WEEK_WORDS.test(String(text || ''));
const DAY_RE = /\b(mon|tues?|wed(?:nes)?|thu(?:rs)?|fri)(?:day)?\b/gi;
const daysIn = text => [...String(text || '').matchAll(DAY_RE)].map(m => dayIndex(m[1]));
/** A week's plans as raw parts again (to change and check once more). */
const rawDays = w => w.days.map((d, i) => ({ day: i, half: d.half, ...(d.plan ? { id: d.plan.id, name: d.plan.name, parts: d.plan.parts.map(p => ({ ...p, versions: p.versions.map(v => ({ ...v })) })) } : { parts: [] }) }));
/**
 * A small change to the week in the teacher's words, without the AI: "move the quiz to Thursday" (the exit check, or a
 * part titled quiz, moves to that day), "Wednesday is a half day" (that day's minutes halved, at most HALF_MAX), "swap
 * Monday and Tuesday". A part moved to a day that has one of its kind changes places with it. -> { week, notes, did } | null
 */
export function quickWeekEdit(u, c, w, text, { lang = 'en' } = {}) {
  if (!w || !Array.isArray(w.days)) return null;
  const s = String(text || ''), ds = daysIn(s).filter(i => i >= 0), days = rawDays(w);
  const again = (did) => ({ ...cleanWeek(u, c, { name: w.name, topic: w.topic, days }, { lang, start: w.start, id: w.id }), did });
  if (/\bhalf[ -]?day\b/i.test(s) && ds.length) {
    const d = days[ds[0]];
    d.half = !/\bnot\b|\bfull\b/i.test(s);
    if (d.half) for (const p of d.parts) p.minutes = Math.max(1, Math.round(p.minutes / 2));
    return again('half');
  }
  if (/\bswap\b/i.test(s) && ds.length >= 2) {
    const [a, b] = ds; [days[a], days[b]] = [{ ...days[b], day: a }, { ...days[a], day: b }];
    return again('swap');
  }
  if (/\bmove\b/i.test(s) && ds.length) {
    const to = ds[ds.length - 1], word = /\b(quiz|exit|check|slides?|break|work)\b/i.exec(s);
    const kind = !word ? 'exit' : /quiz|exit|check/i.test(word[1]) ? 'exit' : /slide/i.test(word[1]) ? 'slides' : /break/i.test(word[1]) ? 'break' : 'work';
    const quiz = word && /quiz/i.test(word[1]);
    // from the first other day that has it (a part titled "quiz" anywhere first); the target day's part of the same
    // kind goes the other way, so both days keep their shape
    const find = test => { for (const [i, d] of days.entries()) { if (i === to) continue; const k = d.parts.findIndex(test); if (k >= 0) return [i, k]; } return null; };
    const hit = (quiz && find(p => /quiz/i.test(p.title || ''))) || find(p => p.kind === kind);
    if (!hit) return null;
    const [from, at] = hit, part = days[from].parts[at];
    const mine = days[to].parts.findIndex(p => p.kind === part.kind);
    if (mine >= 0) { days[from].parts[at] = days[to].parts[mine]; days[to].parts[mine] = part; }
    else { days[from].parts.splice(at, 1); days[to].parts.push(part); }
    return again('move');
  }
  return null;
}
/**
 * A week without the AI: a change to the newest week card, a saved plan the words name repeated on every day ("use my
 * Fractions plan all week"), or the teacher's lessons (and Oomba games that fit the topic) spread over the days, one a
 * day, each with slides, a brain break and an exit check around it. -> { week, notes, how }
 */
export function fallbackWeek(u, c, text, { lang = 'en', draft = null, at = now() } = {}) {
  const e = draft ? quickWeekEdit(u, c, draft, text, { lang }) : null;
  if (e) return { week: e.week, notes: e.notes, how: `week.${e.did}` };
  const next = /\bnext week\b/i.test(String(text || ''));
  if (/\b(again|saved|use my|reuse|repeat)\b/i.test(String(text || ''))) {
    const row = HP.findSaved(u, text);
    if (row) {
      const one = HP.fromSaved(u, c, row, { lang }).plan;
      const r = cleanWeek(u, c, { name: row.name, topic: row.topic, week: next ? 'next' : 'this', days: DAYS.map((_, i) => ({ day: i, name: row.name, parts: one.parts })) }, { lang, at });
      return { ...r, how: 'week.saved', savedFrom: { id: row.id, name: row.name } };
    }
  }
  const topic = HP.topicOf(text), t = tFor(lang);
  const lessons = HL.listMine(u, lang).filter(l => HO.handable(u, games.getGame(l.gameId)));
  const tw = String(topic || '').toLowerCase().split(/\W+/).filter(w => w.length > 2);
  const fits = s => tw.length && String(s || '').toLowerCase().split(/\W+/).some(w => tw.some(x => w.startsWith(x) || x.startsWith(w)));
  const oomba = games.listVisible(u, { shelf: 'learn', official: true, order: 'plays', limit: 24 }).filter(g => HO.handable(u, g));
  const picks = [...lessons.filter(l => fits(l.title) || fits(l.game)).map(l => ({ lessonId: l.id })), ...oomba.filter(g => fits(games.localizeGame(g, lang).title)).map(g => ({ gameId: g.id })),
    ...lessons.filter(l => !(fits(l.title) || fits(l.game))).map(l => ({ lessonId: l.id })), ...oomba.filter(g => !fits(games.localizeGame(g, lang).title)).map(g => ({ gameId: g.id }))].slice(0, 5);
  const days = DAYS.map((_, i) => ({ day: i, name: '', parts: [
    { kind: 'slides', minutes: 5, title: topic || '' },
    { kind: 'work', minutes: 20, ...(picks.length ? picks[i % picks.length] : {}) },
    { kind: 'break', minutes: 3, title: HP.BREAKS[i % HP.BREAKS.length] },
    { kind: 'exit', minutes: 5, title: t(i === 4 ? 'js.companion.week.quiz' : 'js.companion.plan.exitDefault') },
  ] }));
  return { ...cleanWeek(u, c, { name: topic ? t('js.companion.week.weekOf', { topic }) : '', topic, week: next ? 'next' : 'this', days }, { lang, at }), how: 'week.start' };
}

// ---------------------------------------------------------------- dated day plans
const rowsOf = (c, days) => (days.length ? q.all(`SELECT * FROM homeroom_week_days WHERE class_id=? AND day IN (${days.map(() => '?').join(',')})`, c.id, ...days) : []);
/** The dated day plan for one day of the class, or null. */
export function datedOf(c, iso) {
  const r = q.get('SELECT * FROM homeroom_week_days WHERE class_id=? AND day=?', c.id, String(iso || ''));
  const p = r ? json(r.plan, null) : null;
  return p && Array.isArray(p.parts) && p.parts.length ? { ...p, date: r.day } : null;
}
/** Today's dated day plan in the class's time zone (the pill picks it up), or null. */
export const datedToday = (c, at = now()) => datedOf(c, todayIso(c, at));
/**
 * Use this week: each day's plan saved as the class's dated day plan for that day (its date in the class's time zone);
 * the week's other days are cleared. A day already past is left as it was (counted). Nothing goes on desks now. The class's
 * teachers only. -> { ok, saved, skipped }
 */
export function useWeek(u, c, w, { lang = 'en', at = now() } = {}) {
  if (!H.canUseClass(u, c)) return fail('notFound');
  if (!w || !Array.isArray(w.days)) return fail('noPlan');
  const r = cleanWeek(u, c, { name: w.name, topic: w.topic, days: rawDays(w) }, { lang, start: w.start, id: w.id, at });
  const today = todayIso(c, at), t = now();
  let saved = 0, skipped = 0;
  for (const d of r.week.days) {
    if (d.date < today) { if (d.plan) skipped++; continue; }
    if (!d.plan) { q.run('DELETE FROM homeroom_week_days WHERE class_id=? AND day=?', c.id, d.date); continue; }
    const plan = { ...d.plan, name: d.plan.name || r.week.name || '', half: d.half, week: r.week.id };
    q.run(`INSERT INTO homeroom_week_days(class_id, day, week, plan, created_by, created_at, updated_at) VALUES (?,?,?,?,?,?,?)
      ON CONFLICT(class_id, day) DO UPDATE SET week=excluded.week, plan=excluded.plan, created_by=excluded.created_by, updated_at=excluded.updated_at`, c.id, d.date, r.week.start, JSON.stringify(plan), u.id, t, t);
    saved++;
  }
  if (!saved) return fail(skipped ? 'weekPast' : 'noPlan');
  audit(u.id, 'homeroom.weekUse', c.id, { week: r.week.start, days: saved, skipped });
  return ok({ saved, skipped, week: r.week });
}
/**
 * The plan pill's week strip: Monday to Friday of this school week, each with its dated plan's name, minutes and parts,
 * and whether it is today, past, or today's plan already in use. For the class's teachers (the pill).
 */
export function stripOf(c, at = now()) {
  const wk = weekOf(c, at), rows = new Map(rowsOf(c, wk.days).map(r => [r.day, json(r.plan, null)])), used = HP.todayOf(c, at);
  if (![...rows.values()].some(Boolean)) return null;
  return { start: wk.start, today: wk.today, days: wk.days.map(date => {
    const p = rows.get(date);
    return { date, today: date === wk.today, past: date < wk.today, ...(p && Array.isArray(p.parts) && p.parts.length ? {
      plan: { id: p.id, name: p.name || '', half: !!p.half, minutes: p.parts.reduce((s, x) => s + (Number(x.minutes) || 0), 0), parts: p.parts.map(x => ({ kind: x.kind, title: x.title || '', minutes: x.minutes })) },
      used: !!used && used.id === p.id } : {}) };
  }) };
}
/** The strip's day taps: swap (two days' plans change places), clear (a day without a plan). Not on a day already past,
 *  and not today's plan once it is in use (Finish class first). The class's teachers only. -> { ok } */
export function dayAction(u, c, action, { day = '', with: other = '' } = {}, at = now()) {
  if (!H.canUseClass(u, c)) return fail(H.helperRole(u, c) ? 'forbidden' : 'notFound');
  const today = todayIso(c, at), wk = weekOf(c, at), used = HP.todayOf(c, at);
  const okDay = d => ISO.test(d) && wk.days.includes(d) && d >= today;
  const inUse = d => { const p = datedOf(c, d); return !!p && !!used && used.id === p.id; };
  if (action === 'weekClear') {
    if (!okDay(day)) return fail('pastDay');
    if (inUse(day)) return fail('planRunning');
    q.run('DELETE FROM homeroom_week_days WHERE class_id=? AND day=?', c.id, day);
  } else if (action === 'weekSwap') {
    if (!okDay(day) || !okDay(other) || day === other) return fail('pastDay');
    if (inUse(day) || inUse(other)) return fail('planRunning');
    const a = q.get('SELECT * FROM homeroom_week_days WHERE class_id=? AND day=?', c.id, day), b = q.get('SELECT * FROM homeroom_week_days WHERE class_id=? AND day=?', c.id, other);
    if (!a && !b) return fail('noPlan');
    const t = now();
    q.run('DELETE FROM homeroom_week_days WHERE class_id=? AND day IN (?,?)', c.id, day, other);
    if (a) q.run('INSERT INTO homeroom_week_days(class_id, day, week, plan, created_by, created_at, updated_at) VALUES (?,?,?,?,?,?,?)', c.id, other, a.week, a.plan, a.created_by, a.created_at, t);
    if (b) q.run('INSERT INTO homeroom_week_days(class_id, day, week, plan, created_by, created_at, updated_at) VALUES (?,?,?,?,?,?,?)', c.id, day, b.week, b.plan, b.created_by, b.created_at, t);
  } else return fail('badAction');
  audit(u.id, 'homeroom.weekDay', c.id, { action, day, ...(other ? { with: other } : {}) });
  return ok();
}

// ---------------------------------------------------------------- copying a week
/** A week for another class of the same teacher: every day's plan with its groups found there (planFor). -> { ok, week, notes, c } */
export function copyWeek(u, from, w, toId, { lang = 'en' } = {}) {
  const to = S.getClass(String(toId || ''));
  if (!H.canUseClass(u, from) || !to || !H.canUseClass(u, to) || to.id === from.id) return fail('notFound');
  const notes = [];
  const days = w.days.map((d, i) => {
    if (!d.plan) return { day: i, half: d.half, parts: [] };
    const r = HP.planFor(u, from, to, d.plan, { lang, day: dayName(d.date), totalMax: d.half ? HALF_MAX : HP.TOTAL_MAX });
    notes.push(...r.notes);
    return { day: i, half: d.half, name: r.plan.name, parts: r.plan.parts };
  });
  const r = cleanWeek(u, to, { name: w.name, topic: w.topic, days }, { lang, start: w.start });
  return ok({ week: r.week, notes: [...notes, ...r.notes], c: to });
}
/** Copy to next week: the same days a week later in the same class (new plans; nothing is saved until Use this week). */
export function nextWeek(u, c, w, { lang = 'en' } = {}) {
  if (!H.canUseClass(u, c)) return fail('notFound');
  const start = isoOf(dayOfIso(w.start) + 7 * DAY);
  const days = rawDays(w).map(d => ({ ...d, id: undefined }));
  const r = cleanWeek(u, c, { name: w.name, topic: w.topic, days }, { lang, start });
  return ok({ week: r.week, notes: r.notes, c });
}
/** The copy preview of a week (nothing is changed): each day's preview (services/homeroom-plan.js previewOf). */
export function previewWeek(u, to, w, notes, lang = 'en') {
  const missing = new Map();
  const days = w.days.map(d => {
    if (!d.plan) return { date: d.date, day: dayName(d.date, lang), half: d.half, parts: [] };
    const pv = HP.previewOf(u, to, d.plan, notes.filter(n => n.day === dayName(d.date)), lang);
    for (const m of pv.missing) if (!missing.has(m.group) || m.to === 'everyone') missing.set(m.group, m);
    return { date: d.date, day: dayName(d.date, lang), half: d.half, name: d.plan.name || '', parts: pv.parts };
  });
  return { days, missing: [...missing.values()] };
}

// ---------------------------------------------------------------- the card in the chat
/** A week card for the chat (services/companion.js note.week). */
export const newWeekCard = (c, r, lang = 'en', extra = {}) => ({ id: uid(10), classId: c.id, week: r.week, notes: (r.notes || []).slice(0, 12), state: 'draft', lang, ...extra });
/** The week card as the teacher's page draws it: each school day with its plan's parts and what they hand out, where
 *  the week stands (saved for the class or a draft), the classes it can be copied to. Only for the card's own teacher. */
export function weekCardView(u, card, tt) {
  const c = card && S.getClass(card.classId);
  if (!c || !H.canUseClass(u, c)) return { id: card && card.id, gone: true };
  const lang = card.lang || 'en', w = card.week || { days: [] }, today = todayIso(c);
  const rows = new Map(rowsOf(c, w.days.map(d => d.date)).map(r => [r.day, json(r.plan, null)]));
  const saved = w.days.some(d => d.plan && rows.get(d.date) && rows.get(d.date).week === w.id);
  return {
    id: card.id, classId: c.id, className: c.name, name: w.name || '', start: w.start, state: saved ? 'used' : 'draft', how: card.how || '', from: card.from || null, copiedFrom: card.copiedFrom ? (S.getClass(card.copiedFrom) || {}).name || '' : '',
    changed: (card.notes || []).length, past: w.days.every(d => d.date < today),
    days: w.days.map(d => ({ date: d.date, day: dayName(d.date, lang), long: dayName(d.date, lang, true), today: d.date === today, past: d.date < today, half: !!d.half,
      ...(d.plan ? { name: d.plan.name || '', total: d.plan.parts.reduce((s, p) => s + p.minutes, 0), parts: HP.partsView(u, c, d.plan, tt, lang) } : {}) })),
    copy: HP.copyTargets(u, c).slice(0, 8),
  };
}

// ---------------------------------------------------------------- leaving
S.onClassLeave(({ classId, userId = null } = {}) => { if (classId && !userId) q.run('DELETE FROM homeroom_week_days WHERE class_id=?', classId); });
