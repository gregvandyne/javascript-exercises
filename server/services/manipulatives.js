// Virtual math manipulatives (docs/decisions.md "Virtual math manipulatives"): 18 tools on one board, saved boards with
// share codes, live class sessions and an AI lesson drafter. Hidden while it is tested (config.manipulatives).
//
// Who may use it:
//   - hosts: the platform admin, and school staff whose username is in MANIPULATIVES_USERS. Only hosts save boards
//     (each saved board gets a share code), run live sessions, push boards, export and draft with AI.
//   - students: a signed-in student of a class whose teacher (a host) is running a session for it. A join code finds
//     the session, but only that class's own students get in; for anyone else the code is the same 404 as a wrong one.
//   - everyone else: the normal 404, on the page and on every API.
// What each person sees:
//   - a saved board is its owner's: only the owner lists it or deletes it. Opening a share code copies the board into
//     the opener's own board (the saved one never changes).
//   - a student's work in a session (their board, their sticky notes) is seen by that student and the session's teacher
//     (and the platform admin) only. Students never see another student's work; there is no text between students.
//   - the teacher sees students by the name the class roster shows them (roster name, else display name), as on the
//     class page. Names stay on the teacher's dashboard and its PDF; they are never sent to the AI.
// Every board that is saved, pushed or sent in is rebuilt here (cleanState): an object, at most STATE_MAX characters,
// sticky notes and labels checked with the site's word rules (textfilter.js), counts and sizes capped.
import crypto from 'node:crypto';
import { q, uid, now, audit } from '../db.js';
import { config } from '../config.js';
import { isGrownup, getUser } from '../auth.js';
import * as S from './schools.js';
import { anthropic } from '../builder/anthropic.js';
import * as aiBudget from './ai-budget.js';
import { hasProfanity, personalInfo } from './textfilter.js';
import { TOOLS, toolOf, pieceDefs } from '../../public/js/manip-data.js';
import { TASKS } from '../../public/js/manip-tasks.js';

export { TOOLS, TASKS };
export const STATE_MAX = 200000;
export const LIMITS = { boards: 500, notes: 12, noteChars: 300, strokes: 80, points: 600, pieces: 400, titleChars: 80, briefChars: 1000 };
/** A session ends on its own this long after it starts; ended sessions (and their work) go after KEEP_DAYS. */
export const SESSION_HOURS = 12;
export const KEEP_DAYS = 30;
const HOUR = 3600e3, DAY = 86400e3;
const CODE_ABC = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
/** Test hooks: create replaces the AI client's messages.create (no network in tests). */
export const hooks = { create: null };

const ok = (x = {}) => ({ ok: true, ...x });
const fail = code => ({ ok: false, code });
const json = (s, d) => { try { return JSON.parse(s); } catch { return d; } };

// ---------------------------------------------------------------- who may use it
export const on = () => !!config.manipulatives;
/** May this account host (save boards with share codes, run sessions, draft with AI)? */
export function canHost(u) {
  if (!on() || !u || u.is_guest || u.banned || isGrownup(u)) return false;
  if (S.isPlatformAdmin(u)) return true;
  return config.manipulativesUsers.includes(String(u.username || '').toLowerCase()) && S.isSchoolStaff(u);
}
const isStudentOf = (u, classId) => {
  const c = S.getClass(classId);
  const m = u && c && !c.archived_at ? S.classMember(c.id, u.id) : null;
  return !!(m && m.role === 'student' && S.membership(c.school_id, u.id));
};
/** May this host run a session for this class? Its own teacher, or an admin of its school (by membership). */
export function canHostClass(u, c) {
  if (!canHost(u) || !c || c.archived_at) return false;
  const m = S.membership(c.school_id, u.id);
  return !!m && (S.teaches(u, c.id) || m.role === 'admin');
}
/** Lazy upkeep: sessions past SESSION_HOURS end; ended ones older than KEEP_DAYS go (their work with them). */
export function prune(t = now()) {
  q.run("UPDATE manip_sessions SET status='ended', ended_at=? WHERE status='active' AND created_at<?", t, t - SESSION_HOURS * HOUR);
  q.run("DELETE FROM manip_sessions WHERE status='ended' AND ended_at<?", t - KEEP_DAYS * DAY);
}
/** The sessions a student can see now: active ones for their classes (whose teacher may still host), and ones they
 *  joined that ended in the last hours. */
export function studentSessions(u) {
  if (!on() || !u || u.is_guest || u.banned) return [];
  const t = now();
  const rows = q.all(`SELECT s.*, c.name class_name, (SELECT 1 FROM manip_work w WHERE w.session_id=s.id AND w.user_id=?) joined FROM manip_sessions s
    JOIN class_members m ON m.class_id=s.class_id AND m.user_id=? AND m.status='active' AND m.role='student' JOIN classrooms c ON c.id=s.class_id
    WHERE c.archived_at IS NULL AND (s.status='active' AND s.created_at>? OR s.ended_at>?) ORDER BY s.created_at DESC`, u.id, u.id, t - SESSION_HOURS * HOUR, t - SESSION_HOURS * HOUR);
  return rows.filter(s => (s.status === 'active' || s.joined) && isStudentOf(u, s.class_id) && canHost(getUser(s.host_id)));
}
/** 'host' | 'student' | null (null: the normal 404). */
export function roleOf(u) {
  if (canHost(u)) return 'host';
  return studentSessions(u).length ? 'student' : null;
}

// ---------------------------------------------------------------- boards (the JSON a tool saves)
const HEX = /^#[0-9a-fA-F]{6}$/;
const num = (v, lo, hi, d = 0) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
const clipStr = (s, n) => String(s ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f‪-‮⁦-⁩]/g, '').slice(0, n);
/** Every string in a value (keys too), at most a few thousand. */
function strings(v, out = [], depth = 0) {
  if (out.length > 5000 || depth > 8) return out;
  if (typeof v === 'string') out.push(v);
  else if (Array.isArray(v)) for (const x of v) strings(x, out, depth + 1);
  else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) { out.push(k); strings(x, out, depth + 1); }
  return out;
}
/** Text someone typed (a sticky note, a bar label): null when fine, else 'words' | 'personal'. The site's word list and
 *  its personal-information rules (phone numbers, emails, links, addresses, contact talk). Not the family link-code
 *  shape: a note only ever reaches its writer and their teacher, and "Build 246 with blocks" looks like one. */
export function textProblem(s) {
  const v = String(s || '');
  if (!v.trim()) return null;
  if (hasProfanity(v)) return 'words';
  const pi = personalInfo(v);
  return pi && pi !== 'handle' ? 'personal' : null;
}
/** A board as it may be stored: { ok, state (JSON text) } | { ok:false, code: 'badState'|'tooBig'|'words'|'personal' }. */
export function cleanState(raw) {
  const o = typeof raw === 'string' ? (raw.length > STATE_MAX ? null : json(raw, null)) : raw;
  if (!o || typeof o !== 'object' || Array.isArray(o)) return fail('badState');
  const st = { ...o };
  if (Array.isArray(st.pieces)) st.pieces = st.pieces.slice(0, LIMITS.pieces).filter(p => p && typeof p === 'object');
  const ann = st.__ann && typeof st.__ann === 'object' ? st.__ann : null;
  if (ann) {
    st.__ann = {
      notes: (Array.isArray(ann.notes) ? ann.notes : []).filter(n => n && typeof n === 'object').slice(0, LIMITS.notes)
        .map((n, i) => ({ id: clipStr(n.id || `n${i}`, 40), text: clipStr(n.text, LIMITS.noteChars), x: num(n.x, 0, 1), y: num(n.y, 0, 1) })),
      strokes: (Array.isArray(ann.strokes) ? ann.strokes : []).filter(s => s && Array.isArray(s.pts)).slice(0, LIMITS.strokes)
        .map(s => ({ c: HEX.test(s.c) ? s.c : '#FF6B4A', pts: s.pts.slice(0, LIMITS.points).map(p => ({ x: num(p && p.x, 0, 1), y: num(p && p.y, 0, 1) })) })),
      // The board's size on the screen it was made on (the teacher's view draws it at that size, scaled to fit).
      ...(ann.size && typeof ann.size === 'object' ? { size: { w: Math.round(num(ann.size.w, 100, 4000, 800)), h: Math.round(num(ann.size.h, 100, 4000, 430)) } } : {}),
    };
  }
  // Typed text: sticky notes and bar labels are read with the word rules; every other string must at least be clean.
  const typed = [...(st.__ann ? st.__ann.notes.map(n => n.text) : []),
    ...(Array.isArray(st.bars) ? st.bars.flatMap(b => [b && b.name, ...((b && Array.isArray(b.segs)) ? b.segs.map(x => x && x.label) : [])]) : [])];
  for (const s of typed) { const p = textProblem(s); if (p) return fail(p); }
  if (strings(st).some(s => hasProfanity(s))) return fail('words');
  const text = JSON.stringify(st);
  if (text.length > STATE_MAX) return fail('tooBig');
  return ok({ state: text });
}
function newCode() {
  for (;;) {
    const c = Array.from({ length: 8 }, () => CODE_ABC[crypto.randomInt(CODE_ABC.length)]).join('');
    if (!q.get('SELECT 1 FROM manip_boards WHERE code=?', c) && !q.get('SELECT 1 FROM manip_sessions WHERE code=?', c)) return c;
  }
}
export const normCode = s => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
const cleanTitle = (s, d) => { const v = clipStr(s, LIMITS.titleChars).trim(); return v && !textProblem(v) ? v : d; };

/** A host saves a board: it gets its own share code. -> { ok, board: { id, code } } | fail */
export function saveBoard(u, { tool, title, state } = {}) {
  if (!canHost(u)) return fail('notFound');
  const tl = toolOf(tool); if (!tl) return fail('badTool');
  const c = cleanState(state); if (!c.ok) return c;
  if (q.get('SELECT COUNT(*) n FROM manip_boards WHERE owner_id=?', u.id).n >= LIMITS.boards) return fail('tooMany');
  const id = uid(12), code = newCode();
  q.run('INSERT INTO manip_boards(id, owner_id, code, tool, title, state, created_at) VALUES (?,?,?,?,?,?,?)', id, u.id, code, tl.slug, cleanTitle(title, tl.name), c.state, now());
  return ok({ board: { id, code } });
}
/** The owner's own boards, newest first (no states). */
export const listBoards = u => (canHost(u) ? q.all('SELECT id, code, tool, title, created_at FROM manip_boards WHERE owner_id=? ORDER BY created_at DESC, rowid DESC LIMIT 100', u.id) : []);
/** One of the owner's boards, with its state. */
export const ownBoard = (u, id) => (u ? q.get('SELECT id, code, tool, title, state, created_at FROM manip_boards WHERE id=? AND owner_id=?', String(id || ''), u.id) || null : null);
/** Only the owner deletes a board. */
export function deleteBoard(u, id) {
  const b = ownBoard(u, id); if (!b) return fail('notFound');
  q.run('DELETE FROM manip_boards WHERE id=? AND owner_id=?', b.id, u.id);
  return ok();
}
/** A share code opens a copy: the tool and the board, for the opener's own board. Anyone who may use the page. */
export function openCode(u, code) {
  if (!roleOf(u)) return fail('notFound');
  const b = q.get('SELECT code, tool, title, state FROM manip_boards WHERE code=?', normCode(code));
  return b ? ok({ board: { code: b.code, tool: b.tool, title: b.title, state: b.state } }) : fail('noCode');
}

// ---------------------------------------------------------------- live sessions
/** The classes a host may run a session for. */
export function hostClasses(u) {
  if (!canHost(u)) return [];
  const mine = S.classesOf(u.id, 'teacher');
  const admin = S.schoolsOf(u.id).filter(s => s.role === 'admin').flatMap(s => S.classesOfSchool(s.id));
  const seen = new Set();
  return [...mine, ...admin].filter(c => !seen.has(c.id) && seen.add(c.id) && canHostClass(u, c)).map(c => ({ id: c.id, name: c.name, school: c.school_name, students: c.students }));
}
export const getSession = id => q.get('SELECT * FROM manip_sessions WHERE id=?', String(id || '')) || null;
export function createSession(u, { classId, tool, title } = {}) {
  const c = S.getClass(classId);
  if (!canHostClass(u, c)) return fail('notFound');
  const tl = toolOf(tool); if (!tl) return fail('badTool');
  prune();
  // One running session per class: a new one ends the one before it.
  q.run("UPDATE manip_sessions SET status='ended', ended_at=? WHERE class_id=? AND status='active'", now(), c.id);
  const id = uid(12), code = newCode();
  q.run('INSERT INTO manip_sessions(id, code, host_id, class_id, tool, title, created_at) VALUES (?,?,?,?,?,?,?)', id, code, u.id, c.id, tl.slug, cleanTitle(title, `${tl.name} session`), now());
  audit(u.id, 'manip.session', id, { class: c.id });
  return ok({ session: { id, code } });
}
/** The host's own sessions (newest first). */
export function hostSessions(u) {
  if (!canHost(u)) return [];
  prune();
  return q.all(`SELECT s.id, s.code, s.tool, s.title, s.status, s.created_at, s.class_id, c.name class_name,
    (SELECT COUNT(*) FROM manip_work w WHERE w.session_id=s.id) joined FROM manip_sessions s JOIN classrooms c ON c.id=s.class_id
    WHERE s.host_id=? ORDER BY s.created_at DESC LIMIT 30`, u.id);
}
/** The session's teacher, or the platform admin. */
export const isSessionHost = (u, s) => !!(s && canHost(u) && (s.host_id === u.id || S.isPlatformAdmin(u)));
/** A student's session, if they may be in it (its class's student; its teacher may still host). */
function studentSession(u, id) {
  const s = getSession(id);
  if (!s || !on() || !u || u.is_guest || u.banned || !isStudentOf(u, s.class_id) || !canHost(getUser(s.host_id))) return null;
  return s;
}
/** Join with a code (or by id from the class list). A code from another class gets the same answer as a wrong one. */
export function join(u, { code, id } = {}) {
  prune();
  const s = id ? getSession(id) : q.get('SELECT * FROM manip_sessions WHERE code=?', normCode(code));
  if (!s || !studentSession(u, s.id)) return fail('notFound');
  if (s.status !== 'active') return fail('ended');
  const t = now();
  q.run("INSERT OR IGNORE INTO manip_work(session_id, user_id, state, joined_at, updated_at) VALUES (?,?,'{}',?,?)", s.id, u.id, t, t);
  return ok({ session: { id: s.id, tool: s.tool } });
}
/** What a student's page reads: the session, the board their teacher pushed, their own board. Never anyone else's. */
export function studentView(u, id) {
  const s = studentSession(u, id);
  const w = s && q.get('SELECT state, updated_at FROM manip_work WHERE session_id=? AND user_id=?', s.id, u.id);
  if (!w) return null;
  return { id: s.id, code: s.code, tool: s.tool, title: s.title, status: s.status, pushed: s.pushed_state || null, pushedAt: s.pushed_at || 0, mine: w.state };
}
export function submitWork(u, id, state) {
  const s = studentSession(u, id);
  if (!s || !q.get('SELECT 1 FROM manip_work WHERE session_id=? AND user_id=?', s.id, u.id)) return fail('notFound');
  if (s.status !== 'active') return fail('ended');
  const c = cleanState(state); if (!c.ok) return c;
  q.run('UPDATE manip_work SET state=?, updated_at=? WHERE session_id=? AND user_id=?', c.state, now(), s.id, u.id);
  return ok();
}
/** The roster name the class page shows its teachers (roster name, else display name). */
const rosterNames = classId => new Map(S.roster(classId).map(p => [p.id, p.roster_name || p.display_name]));
/** The teacher's dashboard: the session and each joined student's board. Host (or platform admin) only. */
export function teacherView(u, id) {
  const s = getSession(id);
  if (!isSessionHost(u, s)) return null;
  prune();
  const fresh = getSession(s.id); if (!fresh) return null;
  const names = rosterNames(fresh.class_id), c = S.getClass(fresh.class_id);
  const work = q.all('SELECT user_id, state, joined_at, updated_at FROM manip_work WHERE session_id=? ORDER BY updated_at DESC', fresh.id)
    .filter(w => names.has(w.user_id)).map(w => ({ id: w.user_id, name: names.get(w.user_id), state: w.state, joinedAt: w.joined_at, updatedAt: w.updated_at }));
  return { id: fresh.id, code: fresh.code, tool: fresh.tool, title: fresh.title, status: fresh.status, createdAt: fresh.created_at, className: c ? c.name : '',
    classId: fresh.class_id, pushed: !!fresh.pushed_state, pushedAt: fresh.pushed_at || 0, students: work };
}
/** Push one of the host's own saved boards to every student in the session. */
export function push(u, id, boardId) {
  const s = getSession(id);
  if (!isSessionHost(u, s)) return fail('notFound');
  if (s.status !== 'active') return fail('ended');
  const b = ownBoard(u, boardId); if (!b) return fail('noBoard');
  if (b.tool !== s.tool) return fail('otherTool');
  const c = cleanState(b.state); if (!c.ok) return c;
  q.run('UPDATE manip_sessions SET pushed_state=?, pushed_at=? WHERE id=?', JSON.stringify({ tool: b.tool, code: b.code, state: c.state }), now(), s.id);
  return ok();
}
export function end(u, id) {
  const s = getSession(id);
  if (!isSessionHost(u, s)) return fail('notFound');
  if (s.status === 'active') q.run("UPDATE manip_sessions SET status='ended', ended_at=? WHERE id=?", now(), s.id);
  return ok();
}

// ---------------------------------------------------------------- summaries and the PDF export
/** A board in a few plain lines (the teacher's dashboard and the PDF). */
export function summarize(stateText) {
  const o = json(stateText, null);
  if (!o || typeof o !== 'object') return ['The board could not be read.'];
  const lines = [];
  if (Array.isArray(o.pieces)) {
    if (!o.pieces.length) lines.push('No pieces on the board yet.');
    else {
      const counts = new Map(); let total = 0;
      for (const p of o.pieces) { const l = String((p && p.label) || 'piece'); counts.set(l, (counts.get(l) || 0) + 1); total += typeof (p && p.value) === 'number' ? p.value : 0; }
      lines.push(`${o.pieces.length} pieces: ${[...counts].map(([l, n]) => `${n} x ${l}`).join(', ')}.`, `Combined value: ${Math.round(total * 1000) / 1000}.`);
    }
  } else {
    const rest = Object.entries(o).filter(([k]) => !k.startsWith('__')).slice(0, 8).map(([k, v]) => `${k}: ${String(JSON.stringify(v)).slice(0, 110)}`);
    lines.push(...(rest.length ? rest : ['Nothing on the board yet.']));
  }
  const ann = o.__ann || {};
  const notes = (Array.isArray(ann.notes) ? ann.notes : []).map(n => String(n.text || '').trim()).filter(Boolean);
  for (const n of notes) lines.push(`Note: ${n}`);
  if (Array.isArray(ann.strokes) && ann.strokes.length) lines.push(`Pen marks: ${ann.strokes.length}.`);
  return lines;
}
// The PDF is plain text in Helvetica (WinAnsi): every character must be one byte, so others are mapped or folded.
const WINANSI = { '€': 0x80, '‚': 0x82, 'ƒ': 0x83, '„': 0x84, '…': 0x85, '†': 0x86, '‡': 0x87, '‰': 0x89, 'Š': 0x8a, '‹': 0x8b, 'Œ': 0x8c, 'Ž': 0x8e,
  '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94, '•': 0x95, '–': 0x96, '™': 0x99, 'š': 0x9a, '›': 0x9b, 'œ': 0x9c, 'ž': 0x9e, 'Ÿ': 0x9f };
const PDF_MAP = { '−': '-', '\u2014': '-', '✓': 'OK', '★': '*', '→': '->', '↔': '<->', '≤': '<=', '≥': '>=' };
export function pdfSafe(s) {
  let out = '';
  for (const ch of String(s)) {
    const code = ch.codePointAt(0);
    if ((code >= 32 && code <= 126) || (code >= 0xa1 && code <= 0xff)) { out += ch; continue; }
    if (WINANSI[ch] !== undefined) { out += String.fromCharCode(WINANSI[ch]); continue; }
    if (PDF_MAP[ch] !== undefined) { out += PDF_MAP[ch]; continue; }
    if (ch === '\n' || ch === '\t') { out += ' '; continue; }
    const base = ch.normalize('NFD').replace(/[̀-ͯ]/g, '');
    out += base.length === 1 && base.charCodeAt(0) >= 32 && base.charCodeAt(0) <= 126 ? base : '?';
  }
  return out;
}
const pdfEsc = s => pdfSafe(s).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
/** A text-only PDF: a title, then blocks of a heading and lines. -> Buffer */
export function makePdf(title, blocks) {
  const wrap = (s, n) => { const out = []; let cur = String(s); while (cur.length > n) { let cut = cur.lastIndexOf(' ', n); if (cut < 20) cut = n; out.push(cur.slice(0, cut)); cur = cur.slice(cut).trim(); } if (cur) out.push(cur); return out; };
  const all = [...wrap(title, 80), ''];
  for (const b of blocks) { all.push(...wrap(b.heading, 88)); for (const l of b.lines) all.push(...wrap(`  ${l}`, 92)); all.push(''); }
  const pages = []; for (let i = 0; i < all.length; i += 46) pages.push(all.slice(i, i + 46));
  const objects = []; const fontId = 3 + pages.length * 2;
  pages.forEach((lines, pi) => {
    const contentId = 3 + pi * 2;
    const stream = ['BT', '/F1 11 Tf', '50 790 Td', '15 TL', ...lines.map((l, i) => `${i ? 'T* ' : ''}(${pdfEsc(l)}) Tj`), 'ET'].join('\n');
    objects[contentId] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
    objects[contentId + 1] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${contentId} 0 R /Resources << /Font << /F1 ${fontId} 0 R >> >> >>`;
  });
  objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objects[2] = `<< /Type /Pages /Kids [${pages.map((_, i) => `${4 + i * 2} 0 R`).join(' ')}] /Count ${pages.length} >>`;
  objects[fontId] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';
  let pdf = '%PDF-1.4\n'; const offsets = [];
  for (let id = 1; id <= fontId; id++) { offsets[id] = pdf.length; pdf += `${id} 0 obj\n${objects[id] || '<< >>'}\nendobj\n`; }
  const xref = pdf.length;
  pdf += `xref\n0 ${fontId + 1}\n0000000000 65535 f \n`;
  for (let id = 1; id <= fontId; id++) pdf += `${String(offsets[id]).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${fontId + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf, 'latin1');
}
const stamp = (ms, tz) => { try { return new Date(ms).toLocaleString('en-US', { timeZone: tz || 'UTC', dateStyle: 'medium', timeStyle: 'short' }) + (tz ? '' : ' UTC'); } catch { return new Date(ms).toISOString(); } };
/** The teacher's export of a session. Host (or platform admin) only. -> { ok, pdf, filename } | fail */
export function exportPdf(u, id) {
  const v = teacherView(u, id); if (!v) return fail('notFound');
  const c = S.getClass(v.classId), tz = c ? S.zoneOf(S.getSchool(c.school_id)) : null, tl = toolOf(v.tool);
  const blocks = v.students.length ? v.students.map(w => ({ heading: `${w.name}  (last saved ${stamp(w.updatedAt, tz)})`, lines: summarize(w.state) }))
    : [{ heading: 'No student work yet', lines: ['No student has joined or sent work in this session yet.'] }];
  const pdf = makePdf(`${v.title} - ${tl ? tl.name : v.tool} - ${v.className} - started ${stamp(v.createdAt, tz)}`, blocks);
  audit(u.id, 'manip.export', v.id, { students: v.students.length });
  return ok({ pdf, filename: `manipulatives-${v.code.toLowerCase()}.pdf` });
}

// ---------------------------------------------------------------- the AI lesson drafter (hosts only)
const DRAFT_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['board_title', 'pieces', 'notes', 'strokes'],
  properties: {
    board_title: { type: 'string' },
    pieces: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['kind', 'x', 'y'], properties: { kind: { type: 'string' }, x: { type: 'number' }, y: { type: 'number' } } } },
    notes: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['text', 'x', 'y'], properties: { text: { type: 'string' }, x: { type: 'number' }, y: { type: 'number' } } } },
    strokes: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['color', 'points'], properties: { color: { type: 'string' },
      points: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['x', 'y'], properties: { x: { type: 'number' }, y: { type: 'number' } } } } } } },
  },
};
export const PEN_COLORS = ['#FF6B4A', '#141414', '#1F9D63', '#1E88E5'];
const clamp01 = v => num(v, 0, 1);
/** What the model sent, made safe: pieces only of the tool's own kinds (at most 30), 2 to 6 notes that pass the word rules
 *  (at most 300 characters), at most 4 strokes of known pen colors, every coordinate inside the board. */
export function sanitizeDraft(d, vocab) {
  const kinds = new Set(vocab.map(v => v.kind));
  const o = d && typeof d === 'object' ? d : {};
  const title = clipStr(o.board_title, 120).trim();
  return {
    board_title: title && !textProblem(title) ? title : 'AI lesson draft',
    pieces: (Array.isArray(o.pieces) ? o.pieces : []).filter(p => p && kinds.has(p.kind)).slice(0, 30).map(p => ({ kind: p.kind, x: clamp01(p.x), y: clamp01(p.y) })),
    notes: (Array.isArray(o.notes) ? o.notes : []).map(n => ({ text: clipStr(n && n.text, LIMITS.noteChars).trim(), x: clamp01(n && n.x), y: clamp01(n && n.y) }))
      .filter(n => n.text && !textProblem(n.text)).slice(0, 6),
    strokes: (Array.isArray(o.strokes) ? o.strokes : []).slice(0, 4).map(s => ({
      color: PEN_COLORS.includes(String(s && s.color).toUpperCase()) ? String(s.color).toUpperCase() : PEN_COLORS[0],
      points: (s && Array.isArray(s.points) ? s.points : []).slice(0, 40).map(p => ({ x: clamp01(p && p.x), y: clamp01(p && p.y) })),
    })).filter(s => s.points.length > 1),
  };
}
/** Does the brief carry the name of one of the host's students? (Names never go to the AI.) */
export function namesIn(u, brief) {
  const words = new Set(String(brief || '').toLowerCase().split(/[^\p{L}\p{N}_]+/u).filter(w => w.length >= 3));
  const text = ` ${String(brief || '').toLowerCase().replace(/\s+/g, ' ')} `;
  for (const c of hostClasses(u)) {
    for (const p of S.roster(c.id).filter(x => x.role === 'student')) {
      for (const n of [p.roster_name, p.display_name, p.username]) {
        const v = String(n || '').toLowerCase().trim(); if (v.length < 3) continue;
        if (words.has(v) || text.includes(` ${v} `) || v.split(/\s+/).some(part => part.length >= 3 && words.has(part))) return true;
      }
    }
  }
  return false;
}
function prompt(tl, { grade, brief, task }, vocab) {
  return [
    'You are setting up a virtual math manipulative board for a teacher: pieces placed on the board, sticky notes with the instructions and questions, and a few pen marks. The teacher will teach from this board, then save it and give it to students.',
    `Tool: ${tl.name} (grades ${grade || tl.grades}).`,
    'Write in US English, plain and friendly for children. No names of people, no links, no brands or product names.',
    vocab.length ? `Placeable pieces (use ONLY these kinds, spelled exactly):\n${vocab.map(v => `- kind "${v.kind}": ${v.label} (value ${v.value})`).join('\n')}`
      : 'This tool has no placeable pieces: return an empty pieces list and carry the whole lesson in the sticky notes.',
    'Coordinates: x and y are fractions of the board, 0 is left/top, 1 is right/bottom. Keep pieces inside x 0.02..0.9 and y 0.05..0.85, in tidy groups or rows with small gaps so nothing overlaps. Keep the corners and edges for the sticky notes.',
    'board_title: a short title for the lesson (under 60 characters).',
    'pieces: exactly the pieces the lesson needs (at most 30). For a build-a-number lesson place the pieces that make the target; for an explore lesson place a useful working set grouped by kind.',
    'notes: 2 to 4 sticky notes. The first carries the lesson title and what students should do; the others carry questions, challenges or a "show your thinking" prompt. Each under 140 characters. Put notes at clear corners or edges (for example x 0.03 or 0.6, y 0.03 or 0.7), away from the pieces.',
    `strokes: 0 to 3 simple pen marks, color one of ${PEN_COLORS.join(', ')}: a ring around a group of pieces (12 to 16 points making a closed loop), an arrow (2 points) or an underline (2 points). Points are board fractions.`,
    `<lesson>\n${brief}${task ? `\nBased on this library task: ${task}` : ''}\n</lesson>`,
  ].join('\n');
}
/** Without the AI (no key, or the AI budget is resting): the brief as the first sticky note, nothing placed. */
const templateDraft = (tl, { brief, task }) => ({ board_title: (task ? task.split(':')[0] : '') || `${tl.name} lesson`, pieces: [], notes: [{ text: clipStr(brief, 140), x: 0.03, y: 0.03 }], strokes: [] });
/** -> { ok, draft, ai } | { ok:false, code: 'notFound'|'badTool'|'brief'|'words'|'personal'|'names'|'aiFailed' } */
export async function draftLesson(u, { tool, brief, grade = '', task = '' } = {}) {
  if (!canHost(u)) return fail('notFound');
  const tl = toolOf(tool); if (!tl) return fail('badTool');
  const b = clipStr(brief, LIMITS.briefChars).replace(/\s+/g, ' ').trim();
  if (b.length < 3) return fail('brief');
  const p = textProblem(b); if (p) return fail(p);
  if (namesIn(u, b)) return fail('names');
  const g = /^(K|[1-8])$/.test(String(grade)) ? String(grade) : '';
  // Only a task from this tool's own library is passed on (by its title and prompt).
  const tk = (TASKS[tl.slug] || []).find(x => `${x.title}: ${x.prompt}` === String(task)) || null;
  const taskText = tk ? `${tk.title}: ${tk.prompt}` : '';
  const vocab = pieceDefs(tl.slug);
  const client = hooks.create ? { messages: { create: hooks.create } } : anthropic('free');
  if (!client) return ok({ draft: sanitizeDraft(templateDraft(tl, { brief: b, task: taskText }), vocab), ai: false });
  let raw;
  try {
    const res = await client.messages.create({
      model: config.builderModel, max_tokens: 2500,
      output_config: { effort: 'low', format: { type: 'json_schema', schema: DRAFT_SCHEMA } },
      messages: [{ role: 'user', content: prompt(tl, { grade: g, brief: b, task: taskText }, vocab) }],
    }, { timeout: 60000, maxRetries: 1 });
    if (res && res.usage) aiBudget.recordUsage(res.model || config.builderModel, res.usage);
    const block = ((res && res.content) || []).find(c => c.type === 'text');
    raw = JSON.parse(block ? block.text : '');
  } catch { return fail('aiFailed'); }
  audit(u.id, 'manip.draft', tl.slug, {});
  return ok({ draft: sanitizeDraft(raw, vocab), ai: true });
}

// ---------------------------------------------------------------- cleanup (accounts and classes)
/** An account is deleted (services/account-delete.js): their boards, their work, the sessions they ran. */
export function forgetUser(userId) {
  q.run('DELETE FROM manip_boards WHERE owner_id=?', userId);
  q.run('DELETE FROM manip_work WHERE user_id=?', userId);
  q.run('DELETE FROM manip_sessions WHERE host_id=?', userId);
}
/** A student left a class: their work in its sessions goes. A class was deleted: its sessions go. */
export function classLeft({ classId, userId = null } = {}) {
  if (!classId) return;
  if (userId) q.run('DELETE FROM manip_work WHERE user_id=? AND session_id IN (SELECT id FROM manip_sessions WHERE class_id=?)', userId, classId);
  else q.run('DELETE FROM manip_sessions WHERE class_id=?', classId);
}
/** A school account merged into a student's own: the work moves with them (theirs wins where both joined). */
export function accountMerged({ from, into }) {
  q.run('UPDATE OR IGNORE manip_work SET user_id=? WHERE user_id=?', into, from);
  q.run('DELETE FROM manip_work WHERE user_id=?', from);
}
S.onClassLeave(classLeft);
S.onAccountMerge(accountMerged);
