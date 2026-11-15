// Classroom dashboards, stage 1 (docs/decisions.md "Classroom dashboards, stage 1"). A teacher's screen per class (the
// projector) and a student's screen per class, built from widgets on a 12-column grid, plus what the teacher sends to
// every student screen (pushes, the "From your teacher" tray, Eyes up) and the class's approved links.
//
// - The widget registry (WIDGETS) is the one list of widget types: id, group, who may add it (teacher, student or both),
//   default and smallest size, and the settings schema. Names and labels are i18n keys (dash.w.<id>.*); the browser's
//   renderers live in public/js/dash-widgets.js, keyed by the same id. A later stage adds a type here and a renderer
//   there; everything else (library, grid, settings form, saving, validation) already works from the schema.
// - Every layout the browser sends is rebuilt here from the schema (cleanWidgets): unknown types, settings and ids are
//   dropped, sizes clamped, text clipped. Nothing a browser sends is stored as it came.
// - Teacher text (agenda, objective) reaches students only through pinned widgets. A student's own widgets and settings
//   are stored for that student alone: never shown to another student, never sent anywhere else.
// - No AI anywhere in this module: background pictures pass the profile photo's file checks (photos.cleanJpeg: JPEG
//   only, size limits, metadata removed) and nothing else, and only the owner and the class's teachers can fetch them.
// - Pushes are kept per class per school day; the tray shows today's until the teacher ends one or the day ends.
import fs from 'node:fs';
import path from 'node:path';
import { q, tx, now, uid, audit } from '../db.js';
import { config } from '../config.js';
import * as S from './schools.js';
import * as games from './games.js';
import * as L from './lessons.js';
import { cleanJpeg, PhotoError } from './photos.js';
import { liveOn, openForClass } from './classlive-sessions.js';

// ---------------------------------------------------------------- the widget registry
/** Library groups, in order. Groups without a widget yet (stage 2 and later) are not shown. */
export const GROUPS = ['join', 'time', 'class', 'show', 'tools', 'check', 'oomba'];
/**
 * Widget types. who: 'teacher' | 'student' | 'both' (who may add it to their own screen; a teacher can pin any of
 * theirs to student screens). size/min: [columns, rows]. words: other strings its renderer shows (dash.w.<id>.<word>).
 * settings: [{ key, type: 'text'|'textarea'|'select'|'bool', max (text), options (select), def }].
 */
export const WIDGETS = [
  { id: 'clock', icon: '🕒', group: 'time', who: 'both', size: [3, 2], min: [2, 1], words: [], settings: [
    { key: 'face', type: 'select', options: ['digital', 'analog'], def: 'digital' },
    { key: 'hour12', type: 'bool', def: true },
    { key: 'seconds', type: 'bool', def: false },
    { key: 'date', type: 'bool', def: true }] },
  { id: 'text', icon: '📝', group: 'show', who: 'teacher', size: [4, 3], min: [2, 1], words: ['empty'], settings: [
    { key: 'title', type: 'text', max: 40, def: '' },
    { key: 'body', type: 'textarea', max: 800, def: '' },
    { key: 'style', type: 'select', options: ['list', 'text'], def: 'list' }] },
  { id: 'ican', icon: '🎯', group: 'show', who: 'both', size: [4, 2], min: [2, 1], words: ['lead', 'empty'], settings: [
    { key: 'goal', type: 'textarea', max: 200, def: '' }] },
];
const BY_ID = new Map(WIDGETS.map(w => [w.id, w]));
export const widgetType = id => BY_ID.get(String(id)) || null;
export const COLS = 12, MAX_ROWS = 24, MAX_H = 8, MAX_WIDGETS = 24, MAX_LAYOUTS = 12;
export const canAdd = (type, role) => !!type && (type.who === 'both' || type.who === role);

/** The registry as the browser gets it: labels in the reader's language. role: 'teacher' | 'student'. */
export function registryFor(t, role) {
  const types = WIDGETS.map(w => ({
    id: w.id, icon: w.icon, group: w.group, who: w.who, size: w.size, min: w.min, add: canAdd(w, role),
    name: t(`dash.w.${w.id}.name`), desc: t(`dash.w.${w.id}.desc`),
    words: Object.fromEntries(w.words.map(k => [k, t(`dash.w.${w.id}.${k}`)])),
    settings: w.settings.map(s => ({ ...s, label: t(`dash.w.${w.id}.s.${s.key}`),
      ...(s.options ? { labels: Object.fromEntries(s.options.map(o => [o, t(`dash.w.${w.id}.o.${s.key}.${o}`)])) } : {}) })),
  }));
  const used = new Set(WIDGETS.map(w => w.group));
  return { types, groups: GROUPS.filter(g => used.has(g)).map(g => ({ id: g, name: t(`dash.groups.${g}`) })) };
}

// ---------------------------------------------------------------- cleaning what browsers send
const ID = /^[A-Za-z0-9_-]{1,24}$/;
const int = (v, lo, hi, d) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
/** Text a person typed: no control characters except new lines (textarea), trimmed, at most max characters. */
export const cleanText = (v, max, multi = false) => {
  let s = String(v ?? '').replace(multi ? /[\u0000-\u0009\u000B-\u001F\u007F]/g : /[\u0000-\u001F\u007F]/g, '').replace(/[‪-‮⁦-⁩]/g, '');
  if (multi) s = s.replace(/\r/g, '').replace(/\n{3,}/g, '\n\n');
  return [...s.trim()].slice(0, max).join('');
};
/** One widget's settings, rebuilt from its schema. */
export function cleanSettings(type, s = {}) {
  const out = {}; const src = s && typeof s === 'object' ? s : {};
  for (const f of type.settings) {
    const v = src[f.key];
    if (f.type === 'bool') out[f.key] = v === undefined ? f.def : v === true || v === 1 || v === '1' || v === 'true';
    else if (f.type === 'select') out[f.key] = f.options.includes(v) ? v : f.def;
    else out[f.key] = v === undefined ? f.def : cleanText(v, f.max, f.type === 'textarea');
  }
  return out;
}
/** One widget's place on the grid, clamped to the grid and its type's smallest size. */
export function cleanBox(type, b = {}) {
  const w = int(b.w, type.min[0], COLS, type.size[0]), h = int(b.h, type.min[1], MAX_H, type.size[1]);
  return { x: int(b.x, 0, COLS - w, 0), y: int(b.y, 0, MAX_ROWS - 1, 0), w, h };
}
/** A layout's widgets as a browser sent them -> what may be stored. role: whose screen ('teacher' may pin). */
export function cleanWidgets(list, role) {
  const out = [], seen = new Set();
  for (const raw of Array.isArray(list) ? list : []) {
    if (out.length >= MAX_WIDGETS) break;
    if (!raw || typeof raw !== 'object') continue;
    const type = widgetType(raw.type);
    if (!canAdd(type, role) || !ID.test(String(raw.id || '')) || seen.has(raw.id)) continue;
    seen.add(raw.id);
    out.push({ id: String(raw.id), type: type.id, ...cleanBox(type, raw), s: cleanSettings(type, raw.s), ...(role === 'teacher' && raw.pin ? { pin: true } : {}) });
  }
  return out;
}

// ---------------------------------------------------------------- backgrounds
/** Colour and Oomba art presets (public/css/dash.css draws them with the theme's tokens, so they follow light/dark). */
export const BG_COLORS = ['cream', 'mint', 'spark', 'sky', 'leaf', 'ink'];
export const BG_ART = ['sparks', 'eyes', 'hills', 'night'];
export const DEFAULT_BG = { kind: 'color', id: 'cream' };
/** A background as sent -> stored. A picture must be one of this person's pictures for this class. */
export function cleanBg(bg, user, classId) {
  if (!bg || typeof bg !== 'object') return DEFAULT_BG;
  if (bg.kind === 'color' && BG_COLORS.includes(bg.id)) return { kind: 'color', id: bg.id };
  if (bg.kind === 'art' && BG_ART.includes(bg.id)) return { kind: 'art', id: bg.id };
  if (bg.kind === 'pic' && ID.test(String(bg.id || '')) && q.get('SELECT 1 FROM dash_pictures WHERE id=? AND owner_id=? AND class_id=?', bg.id, user.id, classId)) return { kind: 'pic', id: bg.id };
  return DEFAULT_BG;
}
const json = (s, d) => { try { const v = JSON.parse(s); return v ?? d; } catch { return d; } };

// ---------------------------------------------------------------- who may do what
/** The class's own teacher (still staff at its school), on a class that isn't archived: the only one who changes the
 *  class dashboard, pushes, approves links or starts Eyes up. A school admin who doesn't teach the class may not. */
export function isTeacher(u, c) {
  if (!u || !c || c.archived_at || u.is_guest) return false;
  return S.teaches(u, c.id) && ['teacher', 'admin'].includes(S.roleIn(u, c.school_id));
}
/** An active student of the class (and of its school), on a class that isn't archived. */
export function isStudent(u, c) {
  if (!u || !c || c.archived_at || u.is_guest) return false;
  const m = S.classMember(c.id, u.id);
  return !!m && m.role === 'student' && !!S.membership(c.school_id, u.id);
}
/** 'teacher' | 'student' | null */
export const roleOf = (u, c) => (isTeacher(u, c) ? 'teacher' : isStudent(u, c) ? 'student' : null);

// ---------------------------------------------------------------- teacher layouts
const LAYOUT_COLS = 'id, class_id, owner_id, name, widgets, bg, position, used_at, created_at, updated_at';
const readLayout = r => (r ? { ...r, widgets: json(r.widgets, []), bg: json(r.bg, DEFAULT_BG) } : null);
export const getLayout = id => readLayout(q.get(`SELECT ${LAYOUT_COLS} FROM dash_layouts WHERE id=?`, String(id || '')));
export const layoutsOf = (classId, ownerId) => q.all(`SELECT ${LAYOUT_COLS} FROM dash_layouts WHERE class_id=? AND owner_id=? ORDER BY position, created_at`, classId, ownerId).map(readLayout);
export const classState = classId => q.get('SELECT * FROM dash_class WHERE class_id=?', classId) || { class_id: classId, layout_id: null, pins: '[]', pins_at: 0, eyes_until: 0, eyes_by: null, eyes_at: 0 };
const ensureClassRow = classId => q.run('INSERT OR IGNORE INTO dash_class(class_id) VALUES (?)', classId);

/** A first layout: a clock, today's goal and the agenda (both pinned on student screens). */
export function starterWidgets() {
  return [
    { id: 'clock1', type: 'clock', x: 0, y: 0, w: 4, h: 2, s: cleanSettings(widgetType('clock')) },
    { id: 'ican1', type: 'ican', x: 0, y: 2, w: 4, h: 2, s: cleanSettings(widgetType('ican')), pin: true },
    { id: 'text1', type: 'text', x: 4, y: 0, w: 8, h: 4, s: cleanSettings(widgetType('text')), pin: true },
  ];
}
/** The teacher's layouts for this class, making the first one if there are none. */
export function ensureLayouts(u, c, name) {
  let list = layoutsOf(c.id, u.id);
  if (!list.length) { createLayout(u, c, { name, widgets: starterWidgets() }); list = layoutsOf(c.id, u.id); }
  return list;
}
/** The layout the teacher sees now: the class's current one if it is theirs, else their last used. */
export function currentLayout(u, c, list = layoutsOf(c.id, u.id)) {
  const st = classState(c.id);
  return list.find(l => l.id === st.layout_id) || [...list].sort((a, b) => b.used_at - a.used_at)[0] || null;
}
export function createLayout(u, c, { name, widgets = [], bg = DEFAULT_BG } = {}) {
  const n = cleanText(name, 40); if (!n) return { error: 'name' };
  const count = q.get('SELECT COUNT(*) n FROM dash_layouts WHERE class_id=? AND owner_id=?', c.id, u.id).n;
  if (count >= MAX_LAYOUTS) return { error: 'tooMany' };
  const id = uid(12), t = now();
  q.run(`INSERT INTO dash_layouts(${LAYOUT_COLS}) VALUES (?,?,?,?,?,?,?,?,?,?)`, id, c.id, u.id, n, JSON.stringify(cleanWidgets(widgets, 'teacher')), JSON.stringify(cleanBg(bg, u, c.id)), count, t, t, t);
  // The first layout anyone makes for a class is the one students follow.
  ensureClassRow(c.id);
  if (!classState(c.id).layout_id) useLayout(u, c, id);
  return { layout: getLayout(id) };
}
const ownLayout = (u, c, id) => { const l = getLayout(id); return l && l.class_id === c.id && l.owner_id === u.id ? l : null; };
export function updateLayout(u, c, id, { name, widgets, bg } = {}) {
  const l = ownLayout(u, c, id); if (!l) return { error: 'notFound' };
  const n = name === undefined ? l.name : cleanText(name, 40); if (!n) return { error: 'name' };
  const w = widgets === undefined ? l.widgets : cleanWidgets(widgets, 'teacher');
  const b = bg === undefined ? l.bg : cleanBg(bg, u, c.id);
  q.run('UPDATE dash_layouts SET name=?, widgets=?, bg=?, updated_at=? WHERE id=?', n, JSON.stringify(w), JSON.stringify(b), now(), id);
  if (classState(c.id).layout_id === id) publishPins(c.id, w);
  return { layout: getLayout(id) };
}
/** One tap: this layout is now the teacher's screen and the one students follow (its pinned widgets). */
export function useLayout(u, c, id) {
  const l = ownLayout(u, c, id); if (!l) return { error: 'notFound' };
  tx(() => {
    q.run('UPDATE dash_layouts SET used_at=? WHERE id=?', now(), id);
    ensureClassRow(c.id);
    q.run('UPDATE dash_class SET layout_id=? WHERE class_id=?', id, c.id);
    publishPins(c.id, l.widgets);
  });
  return { layout: getLayout(id) };
}
export function deleteLayout(u, c, id) {
  const l = ownLayout(u, c, id); if (!l) return { error: 'notFound' };
  const list = layoutsOf(c.id, u.id);
  if (list.length <= 1) return { error: 'last' };
  tx(() => {
    q.run('DELETE FROM dash_layouts WHERE id=?', id);
    if (classState(c.id).layout_id === id) { const next = list.find(x => x.id !== id); useLayout(u, c, next.id); }
  });
  return { ok: true };
}
/** What students get from the teacher's layout: the pinned widgets only. */
function publishPins(classId, widgets) {
  const pins = widgets.filter(w => w.pin).map(({ pin, ...w }) => w);
  ensureClassRow(classId);
  q.run('UPDATE dash_class SET pins=?, pins_at=? WHERE class_id=?', JSON.stringify(pins), now(), classId);
}
export const pinsOf = classId => json(classState(classId).pins, []);

// ---------------------------------------------------------------- student screens
export function studentState(classId, userId) {
  const r = q.get('SELECT widgets, pins, bg FROM dash_students WHERE class_id=? AND user_id=?', classId, userId);
  if (!r) return { widgets: [{ id: 'clock1', type: 'clock', x: 0, y: 0, w: 4, h: 2, s: cleanSettings(widgetType('clock')) }], pins: {}, bg: { kind: 'color', id: 'sky' }, fresh: true };
  return { widgets: json(r.widgets, []), pins: json(r.pins, {}), bg: json(r.bg, DEFAULT_BG) };
}
/** A student saves their screen: their own widgets (types students may add), where they put the pinned ones (a place
 *  only: pinned widgets can't be removed or changed), and their background. */
export function saveStudent(u, c, { widgets, pins, bg } = {}) {
  const old = studentState(c.id, u.id);
  const w = widgets === undefined ? old.widgets : cleanWidgets(widgets, 'student');
  let p = old.pins;
  if (pins !== undefined) {
    p = {};
    const current = new Map(pinsOf(c.id).map(x => [x.id, x]));
    for (const [id, box] of Object.entries(pins && typeof pins === 'object' ? pins : {}).slice(0, MAX_WIDGETS)) {
      const pin = current.get(id); if (!pin || !box || typeof box !== 'object') continue;
      p[id] = cleanBox(widgetType(pin.type), box);
    }
  }
  const b = bg === undefined ? old.bg : cleanBg(bg, u, c.id);
  q.run(`INSERT INTO dash_students(class_id, user_id, widgets, pins, bg, updated_at) VALUES (?,?,?,?,?,?)
    ON CONFLICT(class_id, user_id) DO UPDATE SET widgets=excluded.widgets, pins=excluded.pins, bg=excluded.bg, updated_at=excluded.updated_at`,
  c.id, u.id, JSON.stringify(w), JSON.stringify(p), JSON.stringify(b), now());
  return { state: studentState(c.id, u.id) };
}

// ---------------------------------------------------------------- the school day
export const FALLBACK_TZ = 'America/New_York';
/** Today's date (YYYY-MM-DD) where the class's school is. */
export function dayOf(c, t = now()) {
  const tz = S.zoneOf(S.getSchool(c.school_id)) || FALLBACK_TZ;
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(t));
}

// ---------------------------------------------------------------- approved links
export const MAX_LINKS = 50;
/** An approved link: https only, a real host name, no user name or password in it, at most 500 characters. Anything
 *  else (javascript:, data:, http:, file:...) is refused. -> the normalised URL or null. */
export function cleanUrl(v) {
  const s = String(v ?? '').trim();
  if (!s || s.length > 500 || /[\u0000- \u007F-\u009F‪-‮⁦-⁩]/.test(s)) return null;
  let u; try { u = new URL(s); } catch { return null; }
  if (u.protocol !== 'https:' || u.username || u.password || u.port && u.port !== '443') return null;
  const host = u.hostname.toLowerCase();
  if (!/^[a-z0-9.-]+$/.test(host) || !host.includes('.') || host.startsWith('.') || host.endsWith('.') || /^[\d.]+$/.test(host)) return null;
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) return null;
  return u.href;
}
export const linksOf = classId => q.all('SELECT id, url, title, created_at FROM dash_links WHERE class_id=? AND removed_at IS NULL ORDER BY created_at', classId);
export const getLink = (classId, id) => q.get('SELECT * FROM dash_links WHERE id=? AND class_id=? AND removed_at IS NULL', String(id || ''), classId) || null;
export function addLink(u, c, { url, title } = {}) {
  const href = cleanUrl(url); if (!href) return { error: 'url' };
  const name = cleanText(title, 60) || new URL(href).hostname;
  if (linksOf(c.id).length >= MAX_LINKS) return { error: 'tooManyLinks' };
  const dup = linksOf(c.id).find(l => l.url === href); if (dup) return { link: dup };
  const id = uid(12);
  q.run('INSERT INTO dash_links(id, class_id, url, title, added_by, created_at) VALUES (?,?,?,?,?,?)', id, c.id, href, name, u.id, now());
  audit(u.id, 'dash.link_add', c.id, { link: id, host: new URL(href).hostname });
  return { link: getLink(c.id, id) };
}
export function removeLink(u, c, id) {
  const l = getLink(c.id, id); if (!l) return { error: 'notFound' };
  q.run('UPDATE dash_links SET removed_at=? WHERE id=?', now(), l.id);
  // A pushed link that is no longer approved leaves the tray at once.
  q.run("UPDATE dash_pushes SET ended_at=? WHERE class_id=? AND kind='link' AND ref=? AND ended_at IS NULL", now(), c.id, l.id);
  audit(u.id, 'dash.link_remove', c.id, { link: l.id });
  return { ok: true };
}

// ---------------------------------------------------------------- pushes and the tray
export const PUSH_KINDS = ['game', 'live', 'lesson', 'link'];
export const MAX_PUSHES_A_DAY = 40;
/** A game students of the class can open: live, and public, shared with the school, or shared with this class. */
export function pushableGame(c, g) {
  if (!g || g.status !== 'published' || !g.published_version_id || g.hidden_reason) return false;
  if (g.visibility === 'public') return true;
  if (g.visibility === 'school') return !!S.membership(c.school_id, g.owner_id);
  if (g.visibility === 'class') return games.gameLiveInClass(g.id, c.id);
  return false;
}
/** The class's open live room (hosted by its teacher): students only ever join, never host. */
export const liveRoom = c => { const s = liveOn() ? openForClass(c.id) : null; return s && s.phase !== 'ended' ? { title: s.title, code: s.code } : null; };
/** Lessons of the class open today. */
export const openLessons = c => L.classLessons(c.id).filter(cl => L.isOpen(cl)).map(cl => ({ id: cl.id, title: cl.title }));

/** What the teacher can send right now: games (search), the open live room, open lessons, approved links. */
export function pushOptions(u, c, text = '') {
  const found = String(text || '').trim()
    ? games.search(u, { text, limit: 30 })
    : [...games.classGames(c.id, { limit: 12 }), ...games.listVisible(u, { official: true, limit: 24 })];
  const seen = new Set(), list = [];
  for (const g of found) { if (seen.has(g.id) || !pushableGame(c, g)) continue; seen.add(g.id); list.push({ id: g.id, title: g.title, icon: g.icon }); if (list.length >= 12) break; }
  return { games: list, live: liveRoom(c), lessons: openLessons(c), links: linksOf(c.id) };
}
export function push(u, c, { kind, ref } = {}) {
  if (!PUSH_KINDS.includes(kind)) return { error: 'kind' };
  const day = dayOf(c);
  if (q.get('SELECT COUNT(*) n FROM dash_pushes WHERE class_id=? AND day=?', c.id, day).n >= MAX_PUSHES_A_DAY) return { error: 'tooManyPushes' };
  let title, r = String(ref || '');
  if (kind === 'game') { const g = games.getGame(r); if (!pushableGame(c, g)) return { error: 'game' }; title = g.title; }
  else if (kind === 'live') { const room = liveRoom(c); if (!room) return { error: 'noLive' }; title = room.title; r = room.code; }
  else if (kind === 'lesson') { const cl = openLessons(c).find(x => x.id === r); if (!cl) return { error: 'lesson' }; title = cl.title; }
  else { const l = getLink(c.id, r); if (!l) return { error: 'link' }; title = l.title; }
  const id = uid(12);
  tx(() => {
    // Older days' pushes are only history nobody reads: keep two weeks.
    q.run('DELETE FROM dash_push_hidden WHERE push_id IN (SELECT id FROM dash_pushes WHERE class_id=? AND created_at<?)', c.id, now() - 14 * 86400e3);
    q.run('DELETE FROM dash_pushes WHERE class_id=? AND created_at<?', c.id, now() - 14 * 86400e3);
    q.run('INSERT INTO dash_pushes(id, class_id, day, kind, ref, title, by_id, created_at) VALUES (?,?,?,?,?,?,?,?)', id, c.id, day, kind, r, cleanText(title, 80) || '…', u.id, now());
  });
  audit(u.id, 'dash.push', c.id, { push: id, kind });
  return { push: id };
}
export function endPush(u, c, id) {
  const r = q.run('UPDATE dash_pushes SET ended_at=? WHERE id=? AND class_id=? AND ended_at IS NULL', now(), String(id || ''), c.id);
  return r.changes ? { ok: true } : { error: 'notFound' };
}
/** Where a push opens, for a student of the class. A live push whose room has closed (or changed) has nowhere to go. */
export function pushHref(c, p) {
  if (p.kind === 'game') { const g = games.getGame(p.ref); return pushableGame(c, g) ? `/play/${g.slug}` : null; }
  if (p.kind === 'live') { const room = liveRoom(c); return room && room.code === p.ref ? `/join#${p.ref}` : null; }
  if (p.kind === 'lesson') return openLessons(c).some(x => x.id === p.ref) ? `/class/${c.id}/lessons/${p.ref}` : null;
  if (p.kind === 'link') return getLink(c.id, p.ref) ? `/class/${c.id}/dashboard/link/${p.ref}` : null;
  return null;
}
/** Today's pushes still on (the tray), newest first, each with where it opens. Ones with nowhere to go are left out. */
export function todaysPushes(c, userId = null) {
  const hidden = userId ? new Set(q.all('SELECT h.push_id FROM dash_push_hidden h JOIN dash_pushes p ON p.id=h.push_id WHERE p.class_id=? AND h.user_id=?', c.id, userId).map(r => r.push_id)) : new Set();
  return q.all('SELECT id, kind, ref, title, created_at FROM dash_pushes WHERE class_id=? AND day=? AND ended_at IS NULL ORDER BY created_at DESC, rowid DESC', c.id, dayOf(c))
    .map(p => ({ id: p.id, kind: p.kind, title: p.title, at: p.created_at, href: pushHref(c, p), hidden: hidden.has(p.id) }))
    .filter(p => p.href);
}
/** A student hides a push from their banner (or brings it back). It stays in their tray either way. */
export function hidePush(u, c, id, hidden = true) {
  const p = q.get('SELECT id FROM dash_pushes WHERE id=? AND class_id=?', String(id || ''), c.id); if (!p) return { error: 'notFound' };
  if (hidden) q.run('INSERT OR IGNORE INTO dash_push_hidden(push_id, user_id, at) VALUES (?,?,?)', p.id, u.id, now());
  else q.run('DELETE FROM dash_push_hidden WHERE push_id=? AND user_id=?', p.id, u.id);
  return { ok: true };
}

// ---------------------------------------------------------------- Eyes up
/** How long Eyes up stays on if nobody ends it. */
export const EYES_MS = 3 * 60e3;
export function setEyes(u, c, on) {
  ensureClassRow(c.id);
  const t = now();
  q.run('UPDATE dash_class SET eyes_until=?, eyes_by=?, eyes_at=? WHERE class_id=?', on ? t + EYES_MS : 0, u.id, t, c.id);
  if (on) audit(u.id, 'dash.eyes', c.id, {});
  return { eyes: eyesOf(c.id, t) };
}
export const eyesOf = (classId, t = now()) => { const st = classState(classId); return st.eyes_until > t ? { until: st.eyes_until } : null; };

/** What a dashboard checks every few seconds: Eyes up, today's pushes, and when the pinned widgets last changed. */
export function liveState(c, u, role) {
  const st = classState(c.id);
  return { eyes: eyesOf(c.id), pushes: todaysPushes(c, role === 'student' ? u.id : null), pinsAt: st.pins_at, day: dayOf(c) };
}

// ---------------------------------------------------------------- background pictures
export const PIC_DIR = () => path.join(config.dataDir, 'dash-pictures');
export const picFile = id => path.join(PIC_DIR(), `${String(id).replace(/[^A-Za-z0-9_-]/g, '')}.jpg`);
/** A background is shown big, so it may be larger than a profile photo; the browser makes it at most 1600 wide. */
export const PIC_LIMITS = { maxBytes: 900 * 1024, maxSide: 2000 };
export const PICS_KEPT = 4;
/** Store a background picture: the profile photo's file checks (JPEG only, size, metadata removed). Never sent to an
 *  AI or anywhere else. Keeps the newest PICS_KEPT per person per class. -> { id } */
export function savePicture(u, c, bytes) {
  const clean = cleanJpeg(bytes, PIC_LIMITS);
  const id = uid(16);
  fs.mkdirSync(PIC_DIR(), { recursive: true });
  fs.writeFileSync(picFile(id), clean);
  q.run('INSERT INTO dash_pictures(id, owner_id, class_id, bytes, created_at) VALUES (?,?,?,?,?)', id, u.id, c.id, clean.length, now());
  const old = q.all('SELECT id FROM dash_pictures WHERE owner_id=? AND class_id=? ORDER BY created_at DESC, rowid DESC', u.id, c.id).slice(PICS_KEPT);
  for (const p of old) dropPicture(p.id);
  audit(u.id, 'dash.picture', c.id, { picture: id, bytes: clean.length });
  return { id };
}
function dropPicture(id) {
  try { fs.unlinkSync(picFile(id)); } catch { /* already gone */ }
  q.run('DELETE FROM dash_pictures WHERE id=?', id);
  // A screen that used it goes back to the plain background.
  const plain = JSON.stringify(DEFAULT_BG), mine = JSON.stringify({ kind: 'pic', id });
  q.run('UPDATE dash_layouts SET bg=? WHERE bg=?', plain, mine);
  q.run('UPDATE dash_students SET bg=? WHERE bg=?', plain, mine);
}
/** Who can fetch a picture: its owner, and the teachers of the class it was added for while the owner is still in that
 *  class. Nobody else: not other students, not another class's teacher, not a school admin, not a visitor. */
export function canSeePicture(viewer, pic) {
  if (!viewer || !pic || viewer.is_guest) return false;
  if (viewer.id === pic.owner_id) return true;
  const c = S.getClass(pic.class_id);
  return !!c && S.teaches(viewer, c.id) && ['teacher', 'admin'].includes(S.roleIn(viewer, c.school_id)) && !!S.classMember(c.id, pic.owner_id);
}
export const getPicture = id => q.get('SELECT * FROM dash_pictures WHERE id=?', String(id || '')) || null;
/** The class's students' background pictures in use, for its teacher to see and take down. */
export const studentPictures = c => q.all(`SELECT p.id, p.owner_id, p.created_at, u.display_name, sm.roster_name FROM dash_students d
    JOIN dash_pictures p ON p.id=json_extract(d.bg, '$.id') AND json_extract(d.bg, '$.kind')='pic' AND p.owner_id=d.user_id AND p.class_id=d.class_id
    JOIN users u ON u.id=d.user_id JOIN class_members m ON m.class_id=d.class_id AND m.user_id=d.user_id AND m.status='active' AND m.role='student'
    LEFT JOIN school_members sm ON sm.school_id=? AND sm.user_id=d.user_id
    WHERE d.class_id=? ORDER BY p.created_at DESC`, c.school_id, c.id);
/** The owner, or a teacher of the class for a student's picture, takes a picture down. */
export function removePicture(u, c, id) {
  const p = getPicture(id);
  if (!p || p.class_id !== c.id || !(p.owner_id === u.id || (isTeacher(u, c) && canSeePicture(u, p)))) return { error: 'notFound' };
  dropPicture(p.id);
  audit(u.id, 'dash.picture_removed', c.id, { picture: p.id, owner: p.owner_id });
  return { ok: true };
}
export { PhotoError };

/** Account deletion (services/account-delete.js): this person's screens and pictures go. */
export function forgetUser(userId) {
  for (const p of q.all('SELECT id FROM dash_pictures WHERE owner_id=?', userId)) dropPicture(p.id);
  q.run('DELETE FROM dash_students WHERE user_id=?', userId);
  q.run('DELETE FROM dash_push_hidden WHERE user_id=?', userId);
}
