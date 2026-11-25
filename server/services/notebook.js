// The student notebook (docs/homeroom.md "The student desk"; docs/decisions.md "Homeroom: the notebook"): a running
// notepad a student keeps across sessions, opened from the green corner button on every Oomba page they see
// (public/js/notebook.js), and inside Homeroom from the desk's dock.
//
// What is stored: notebook_tabs (one row per tab: the student's own tabs, kind 'own', named by them; and one tab per
// class with Homeroom, kind 'class', for that class's handout notes) and notebook_pages (the pages of a tab: an own tab
// has one; a class tab has its "Class notes" page and a page per handout the student wrote notes for, titled with the
// handout's name). A page's body is rich text cleaned here on a strict allowlist (cleanHtml): paragraphs, line breaks,
// bold, italic, underline, bullet and numbered lists, checklists (ul.nb-check, li.done) and highlights in four colors
// (mark.hl-y / hl-g / hl-b / hl-p). Every attribute other than those classes, every other tag (its words kept) and
// script-like elements (their content too) are dropped. Its plain words (text) are kept beside it for search.
//
// Who reads it: the student (read and write, only their own); a teacher of a class the student is in now (read only,
// the whole notebook: the students are told at its top); nobody else. Aides, subs, other teachers, school admins and
// parents get 403 (parents' view is a later step: the tab's kind is what makes "handout notes only" possible). No AI
// ever reads it: nothing here is passed to services/companion.js or any model.
//
// Limits: a page's cleaned body at most PAGE_MAX characters, a student's notebook at most TOTAL_MAX characters in all,
// TABS_MAX own tabs, PAGES_MAX pages. Gone with the account (services/account-delete.js), a class's tab and its pages
// with the class or the school (services/school-delete.js BY_CLASS, the class-leave hook); moved with a school account
// merged into the student's own.
import { q, now, uid, audit } from '../db.js';
import { config } from '../config.js';
import { accountKind } from '../auth.js';
import * as S from './schools.js';
import * as H from './homeroom.js';
import * as AT from './homeroom-attendance.js';

const ok = (x = {}) => ({ ok: true, ...x });
const fail = code => ({ ok: false, code });
const clip = (s, n) => String(s ?? '').replace(/[\u0000-\u001f\u007f‪-‮⁦-⁩]/g, '').slice(0, n);

export const LIMITS = { page: 20000, total: 400000, tabs: 30, pages: 300, name: 30, title: 80 };
/** A page's drawing (K-2 notebooks draw or type; docs/decisions.md "Homeroom: K-2 mode, absent and at home"): pen strokes
 *  as the desk's pad keeps them (services/homeroom.js cleanStrokes), on a 3:2 page. */
export const DRAWING = Object.freeze({ strokes: 80, points: 400, total: 8000, bytes: 200000 });
const drawingOf = p => { try { const v = JSON.parse(p.drawing || '[]'); return Array.isArray(v) ? v : []; } catch { return []; } };
/** The colors a tab can have (its dot): Mint, Sky, Sunny, Coral, Lilac, Leaf. A class tab is Leaf. */
export const TAB_COLORS = ['#66C792', '#5BA8E8', '#FFD23F', '#FF8A6B', '#A98BE0', '#1F9D63'];
export const HIGHLIGHTS = ['hl-y', 'hl-g', 'hl-b', 'hl-p'];

// ---------------------------------------------------------------- cleaning the rich text
// A small scanner, not a browser: it keeps only the allowed tags (and only their allowed classes), escapes every bit of
// text again, closes what it opened, and never nests deeper than DEPTH. Whatever came in, what goes out is plain markup
// a browser can only show as words, lists and highlights.
const RENAME = { strong: 'b', em: 'i', div: 'p' };
const ALLOWED = new Set(['p', 'br', 'b', 'i', 'u', 'ul', 'ol', 'li', 'mark']);
const DROP_ALL = new Set(['script', 'style', 'template', 'iframe', 'object', 'embed', 'textarea', 'select', 'svg', 'math', 'noscript', 'title', 'head', 'xmp', 'noembed', 'noframes', 'plaintext']);
const BLOCK = new Set(['p', 'ul', 'ol', 'li']);
const DEPTH = 12, IN_MAX = 200000;
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" };
const decode = s => s.replace(/&(#x[0-9a-f]{1,6}|#[0-9]{1,7}|[a-z]{2,6}|#39);/gi, (m, e) => {
  if (e[0] === '#') { const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return n > 0 && n < 0x110000 && !(n >= 0xd800 && n <= 0xdfff) ? String.fromCodePoint(n) : ''; }
  return ENT[e.toLowerCase()] ?? m;
});
const escText = s => s.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])).replace(/ /g, '&nbsp;');
const classOf = attrs => { const m = /(?:^|\s)class\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/i.exec(attrs || ''); return m ? (m[1] ?? m[2] ?? m[3] ?? '').split(/\s+/).filter(Boolean) : []; };
/** The one class a kept tag may carry, or ''. */
function keptClass(tag, cls) {
  if (tag === 'mark') return HIGHLIGHTS.find(h => cls.includes(h)) || 'hl-y';
  if (tag === 'ul') return cls.includes('nb-check') ? 'nb-check' : '';
  if (tag === 'li') return cls.includes('done') ? 'done' : '';
  return '';
}
const TAG_RE = /<(\/?)([a-zA-Z][a-zA-Z0-9-]*)((?:\s[^>]*)?)\/?>/y;

/** Rich text from the notebook's editor, made safe: only the allowed tags and classes, the words escaped. -> string */
export function cleanHtml(input) {
  const src = String(input ?? '').slice(0, IN_MAX);
  const out = [], stack = [];
  let i = 0, drop = null;
  const close = tag => { const k = stack.lastIndexOf(tag); if (k < 0) return; while (stack.length > k) out.push(`</${stack.pop()}>`); };
  while (i < src.length) {
    const lt = src.indexOf('<', i);
    const text = src.slice(i, lt < 0 ? src.length : lt);
    if (text && !drop) out.push(escText(decode(text)));
    if (lt < 0) break;
    if (src.startsWith('<!--', lt)) { const e = src.indexOf('-->', lt + 4); i = e < 0 ? src.length : e + 3; continue; }
    TAG_RE.lastIndex = lt;
    const m = TAG_RE.exec(src);
    if (!m) {
      if (/^<[!?/]/.test(src.slice(lt, lt + 2))) { const e = src.indexOf('>', lt); i = e < 0 ? src.length : e + 1; continue; }
      if (!drop) out.push('&lt;');
      i = lt + 1; continue;
    }
    i = lt + m[0].length;
    const end = m[1] === '/', raw = m[2].toLowerCase();
    if (drop) { if (end && raw === drop) drop = null; continue; }
    if (DROP_ALL.has(raw)) { if (!end) drop = raw; continue; }
    const tag = RENAME[raw] || raw;
    if (!ALLOWED.has(tag)) continue;
    if (tag === 'br') { if (!end) out.push('<br>'); continue; }
    if (end) { close(tag); continue; }
    if (tag === 'li' && !stack.some(x => x === 'ul' || x === 'ol')) continue;
    // A paragraph or a list item opened inside an open paragraph (or item) ends that one first, as a browser would.
    if (tag === 'p' && stack.at(-1) === 'p') close('p');
    if (tag === 'li' && stack.includes('li') && stack.lastIndexOf('li') > Math.max(stack.lastIndexOf('ul'), stack.lastIndexOf('ol'))) close('li');
    if (stack.length >= DEPTH || (BLOCK.has(tag) && stack.some(x => x === 'b' || x === 'i' || x === 'u' || x === 'mark'))) continue;
    const c = keptClass(tag, classOf(m[3]));
    stack.push(tag); out.push(c ? `<${tag} class="${c}">` : `<${tag}>`);
  }
  while (stack.length) out.push(`</${stack.pop()}>`);
  // Nothing but empty paragraphs and breaks is an empty page.
  const html = out.join('');
  return /^(?:<\/?p>|<br>|\s|&nbsp;)*$/.test(html) ? '' : html;
}
/** The page's words, for search: lines from paragraphs, items and breaks, the tags gone. */
export function textOf(html) {
  return decode(String(html || '').replace(/<br>|<\/?(p|li|ul|ol)\b[^>]*>/g, '\n').replace(/<[^>]*>/g, '')).replace(/[ \t ]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim();
}

// ---------------------------------------------------------------- who
const isKid = u => !!u && !u.is_guest && !u.banned && !['grownup', 'staff'].includes(accountKind(u));
const studentClasses = userId => q.all(`SELECT c.* FROM class_members m JOIN classrooms c ON c.id=m.class_id
  WHERE m.user_id=? AND m.role='student' AND m.status='active' AND c.archived_at IS NULL ORDER BY m.joined_at`, userId);
/** The classes of this student that have Homeroom (each gets a class tab). */
const homeroomClasses = userId => studentClasses(userId).filter(c => H.classHasHomeroom(c));
const hasNotes = userId => !!q.get('SELECT 1 FROM notebook_tabs WHERE user_id=? LIMIT 1', userId);
/** May this account keep a notebook? HOMEROOM on; a student (never a grown-up, staff, a guest) in a class with
 *  Homeroom, or one who already has a notebook (it stays theirs to read and write when a plan ends). */
export function canUse(u) {
  if (!config.homeroom || !isKid(u)) return false;
  return hasNotes(u.id) || homeroomClasses(u.id).length > 0;
}
/** Is this student in a class with a teacher (who can read the notebook)? The line at the top says so. */
const hasTeacher = userId => !!q.get(`SELECT 1 FROM class_members s JOIN class_members t ON t.class_id=s.class_id AND t.role='teacher' AND t.status='active'
  JOIN classrooms c ON c.id=s.class_id WHERE s.user_id=? AND s.role='student' AND s.status='active' AND c.archived_at IS NULL LIMIT 1`, userId);
/** A class this viewer teaches now and this student is in now (not archived), or null: the only way a grown-up reads a
 *  notebook. A class's teachers only (class_members role 'teacher'): aides (homeroom_aides) and subs are never members. */
export function sharedClass(viewer, studentId) {
  if (!viewer || viewer.is_guest || viewer.banned || viewer.id === studentId || accountKind(viewer) !== 'staff') return null;
  return q.get(`SELECT c.* FROM class_members t JOIN class_members s ON s.class_id=t.class_id JOIN classrooms c ON c.id=t.class_id
    WHERE t.user_id=? AND t.role='teacher' AND t.status='active' AND s.user_id=? AND s.role='student' AND s.status='active' AND c.archived_at IS NULL LIMIT 1`, viewer.id, studentId) || null;
}

// ---------------------------------------------------------------- the notebook
const tabRow = (userId, id) => q.get('SELECT * FROM notebook_tabs WHERE id=? AND user_id=?', String(id || ''), userId) || null;
const pageRow = (userId, id) => q.get('SELECT * FROM notebook_pages WHERE id=? AND user_id=?', String(id || ''), userId) || null;
const used = userId => q.get('SELECT COALESCE(SUM(LENGTH(body)),0) n, COUNT(*) c FROM notebook_pages WHERE user_id=?', userId);
function addTabRow(userId, { kind = 'own', classId = null, name, color }) {
  const t = now(), id = uid(12), pos = (q.get('SELECT COALESCE(MAX(position),-1) m FROM notebook_tabs WHERE user_id=?', userId).m) + 1;
  q.run('INSERT INTO notebook_tabs(id, user_id, kind, class_id, name, color, position, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)', id, userId, kind, classId, name, color, pos, t, t);
  return id;
}
function addPageRow(userId, tab, { title = '', handout = null } = {}) {
  const t = now(), id = uid(12);
  q.run('INSERT INTO notebook_pages(id, tab_id, user_id, class_id, class_lesson_id, title, body, text, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
    id, tab.id, userId, tab.class_id || null, handout, clip(title, LIMITS.title), '', '', t, t);
  return id;
}
/** A new notebook gets "My notes"; every class of theirs with Homeroom gets its tab (with its Class notes page). */
function ensure(u) {
  if (!q.get('SELECT 1 FROM notebook_tabs WHERE user_id=? LIMIT 1', u.id)) {
    const id = addTabRow(u.id, { name: '', color: TAB_COLORS[0] });
    addPageRow(u.id, tabRow(u.id, id));
  }
  for (const c of homeroomClasses(u.id)) {
    if (q.get('SELECT 1 FROM notebook_tabs WHERE user_id=? AND class_id=?', u.id, c.id)) continue;
    const id = addTabRow(u.id, { kind: 'class', classId: c.id, name: clip(c.name, 60), color: TAB_COLORS[5] });
    addPageRow(u.id, tabRow(u.id, id));
  }
}
/** The whole notebook as the page draws it: tabs in order, each with its pages (a class tab: Class notes first, then a
 *  page per handout in the order they were started). A class tab shows the class's name as it is now. */
function bookOf(userId) {
  const tabs = q.all(`SELECT t.*, c.name class_name FROM notebook_tabs t LEFT JOIN classrooms c ON c.id=t.class_id WHERE t.user_id=? ORDER BY t.position, t.created_at`, userId);
  const pages = q.all('SELECT * FROM notebook_pages WHERE user_id=? ORDER BY (class_lesson_id IS NOT NULL), created_at', userId);
  const by = new Map(tabs.map(t => [t.id, []]));
  for (const p of pages) if (by.has(p.tab_id)) { const d = drawingOf(p); by.get(p.tab_id).push({ id: p.id, title: p.title, body: p.body, ...(d.length ? { drawing: d } : {}), handout: p.class_lesson_id || null, updatedAt: p.updated_at }); }
  return tabs.map(t => ({ id: t.id, kind: t.kind, name: t.kind === 'class' ? (t.class_name || t.name) : t.name, color: t.color, ...(t.class_id ? { classId: t.class_id } : {}), pages: by.get(t.id) }));
}
const limits = () => ({ page: LIMITS.page, total: LIMITS.total, tabs: LIMITS.tabs, name: LIMITS.name, drawing: { strokes: DRAWING.strokes, points: DRAWING.points, total: DRAWING.total } });
/** The student's own notebook. -> { ok, tabs, used, limits, teacherReads } */
export function mine(u) {
  if (!canUse(u)) return fail('notFound');
  ensure(u);
  // K-2 mode in a class of theirs: the notebook draws or types, with a simpler toolbar and no tabs to manage
  return ok({ tabs: bookOf(u.id), used: used(u.id).n, limits: limits(), teacherReads: hasTeacher(u.id), ...(AT.k2Anywhere(u) ? { k2: true } : {}) });
}
/** A student's notebook for their teacher, read only (and audited: who read whose notebook, never what it says).
 *  -> { ok, tabs, student } | forbidden */
export function forTeacher(viewer, studentId) {
  const c = sharedClass(viewer, String(studentId || ''));
  if (!c) return fail('forbidden');
  const st = q.get(`SELECT u.display_name, sm.roster_name FROM users u LEFT JOIN school_members sm ON sm.user_id=u.id AND sm.school_id=? WHERE u.id=?`, c.school_id, studentId) || {};
  audit(viewer.id, 'notebook.read', studentId, { class: c.id });
  return ok({ tabs: bookOf(studentId), student: { id: studentId, name: st.roster_name || st.display_name || '' } });
}

/** Own tabs: { action: 'add', name } | { action: 'rename', id, name } | { action: 'delete', id } (its pages go too) |
 *  { action: 'move', id, dir: -1 | 1 }. A class tab is named by its class and stays. -> { ok, tabs, tab? } */
export function tabs(u, { action, id, name, dir } = {}) {
  if (!canUse(u)) return fail('notFound');
  const nm = clip(name, LIMITS.name).replace(/\s+/g, ' ').trim();
  if (action === 'add') {
    if (!nm) return fail('tabName');
    if (q.get("SELECT COUNT(*) n FROM notebook_tabs WHERE user_id=? AND kind='own'", u.id).n >= LIMITS.tabs) return fail('tooManyTabs');
    if (used(u.id).c >= LIMITS.pages) return fail('notebookFull');
    const n = q.get("SELECT COUNT(*) n FROM notebook_tabs WHERE user_id=? AND kind='own'", u.id).n;
    const tid = addTabRow(u.id, { name: nm, color: TAB_COLORS[n % 5] });
    addPageRow(u.id, tabRow(u.id, tid));
    return ok({ tabs: bookOf(u.id), tab: tid });
  }
  const t = tabRow(u.id, id);
  if (!t) return fail('notFound');
  if (action === 'move') {
    const list = q.all('SELECT id FROM notebook_tabs WHERE user_id=? ORDER BY position, created_at', u.id).map(r => r.id);
    const at = list.indexOf(t.id), to = at + (Number(dir) < 0 ? -1 : 1);
    if (to < 0 || to >= list.length) return ok({ tabs: bookOf(u.id) });
    [list[at], list[to]] = [list[to], list[at]];
    list.forEach((x, i) => q.run('UPDATE notebook_tabs SET position=? WHERE id=?', i, x));
    return ok({ tabs: bookOf(u.id) });
  }
  if (t.kind !== 'own') return fail('classTab');
  if (action === 'rename') {
    if (!nm) return fail('tabName');
    q.run('UPDATE notebook_tabs SET name=?, updated_at=? WHERE id=?', nm, now(), t.id);
    return ok({ tabs: bookOf(u.id) });
  }
  if (action === 'delete') {
    q.run('DELETE FROM notebook_pages WHERE tab_id=?', t.id);
    q.run('DELETE FROM notebook_tabs WHERE id=?', t.id);
    if (!q.get('SELECT 1 FROM notebook_tabs WHERE user_id=? LIMIT 1', u.id)) ensure(u);
    return ok({ tabs: bookOf(u.id) });
  }
  return fail('badAction');
}

/** Save a page (autosave): the body cleaned, within the page's and the notebook's limits; drawing (optional): the page's
 *  pen strokes (DRAWING's limits; left as it was when not sent). -> { ok, id, body, drawing, updatedAt, used } */
export function savePage(u, id, body, drawing = undefined) {
  if (!canUse(u)) return fail('notFound');
  const p = pageRow(u.id, id); if (!p) return fail('notFound');
  if (typeof body !== 'string') return fail('badState');
  const clean = cleanHtml(body);
  if (clean.length > LIMITS.page) return fail('pageFull');
  if (used(u.id).n - (p.body || '').length + clean.length > LIMITS.total) return fail('notebookFull');
  let draw = p.drawing || '';
  if (drawing !== undefined && drawing !== null) {
    const d = H.cleanStrokes(drawing, DRAWING);
    if (!d.ok) return fail(d.code === 'padFull' ? 'drawingFull' : 'badState');
    draw = d.strokes.length ? JSON.stringify(d.strokes) : '';
  }
  const t = Math.max(now(), p.updated_at + 1);
  q.run('UPDATE notebook_pages SET body=?, text=?, drawing=?, updated_at=? WHERE id=?', clean, textOf(clean).slice(0, LIMITS.page), draw, t, p.id);
  q.run('UPDATE notebook_tabs SET updated_at=? WHERE id=?', t, p.tab_id);
  return ok({ id: p.id, body: clean, drawing: drawingOf({ drawing: draw }), updatedAt: t, used: used(u.id).n });
}

/** A handout's note area on the desk: the page in that class's tab titled with the handout's name (made the first
 *  time). Only for a handout on this student's own desk. handouts: their desk's cards (services/homeroom-handouts.js
 *  deskView), passed by the route. -> { ok, tab, page, tabs } */
export function handoutPage(u, c, handoutId, handouts = []) {
  if (!canUse(u) || !H.canUseDesk(u, c)) return fail('notFound');
  const h = handouts.find(x => x.id === String(handoutId || ''));
  if (!h) return fail('notFound');
  ensure(u);
  const tab = q.get('SELECT * FROM notebook_tabs WHERE user_id=? AND class_id=?', u.id, c.id);
  if (!tab) return fail('notFound');
  let p = q.get('SELECT id FROM notebook_pages WHERE user_id=? AND tab_id=? AND class_lesson_id=?', u.id, tab.id, h.id);
  if (!p) {
    if (used(u.id).c >= LIMITS.pages) return fail('notebookFull');
    p = { id: addPageRow(u.id, tab, { title: h.title, handout: h.id }) };
  }
  return ok({ tab: tab.id, page: p.id, tabs: bookOf(u.id) });
}

// ---------------------------------------------------------------- leaving, deleting, merging
// A class deleted: its tab and pages in every student's notebook go with it. A student who only leaves the class keeps
// their notes (theirs), but the class's teachers can no longer read the notebook through that class.
S.onClassLeave(({ classId, userId = null } = {}) => {
  if (!classId || userId) return;
  q.run('DELETE FROM notebook_pages WHERE class_id=?', classId);
  q.run('DELETE FROM notebook_tabs WHERE class_id=?', classId);
});
S.onAccountMerge(({ from, into } = {}) => {
  if (!from || !into) return;
  // a class tab both accounts have: the merged one's pages move into the kept tab
  for (const t of q.all('SELECT id, class_id FROM notebook_tabs WHERE user_id=? AND class_id IS NOT NULL', from)) {
    const keep = q.get('SELECT id FROM notebook_tabs WHERE user_id=? AND class_id=?', into, t.class_id);
    if (keep) { q.run('UPDATE notebook_pages SET tab_id=? WHERE tab_id=?', keep.id, t.id); q.run('DELETE FROM notebook_tabs WHERE id=?', t.id); }
  }
  q.run('UPDATE notebook_tabs SET user_id=? WHERE user_id=?', into, from);
  q.run('UPDATE notebook_pages SET user_id=? WHERE user_id=?', into, from);
});
/** The account is deleted (services/account-delete.js). */
export function forget(userId) {
  q.run('DELETE FROM notebook_pages WHERE user_id=?', userId);
  q.run('DELETE FROM notebook_tabs WHERE user_id=?', userId);
}
