// Schools: schools, their members (school admins, teachers, students), classrooms, class rosters and join requests.
//
// Who can do what (one place, tested in tests/unit/schools.test.js):
//   platform admin (users.role='admin')  everything; creates schools and appoints school admins
//   school admin                          the whole school: classes, teachers, students, settings
//   teacher                               creates classes (unless the school turns that off) and runs their own classes:
//                                         roster, adding and moving students, join requests, resetting school passwords
//   student                               sees their classes; joins with a class code (teacher approves)
//
// Names: teachers' real names (roster_name) are shown to their students, like a class list on the door. Students' real
// names are shown only to staff; other students see usernames.
// Accounts: a school can create accounts ("school accounts": users.managed_school = school id; the school owns them)
// or let students join with their own personal account (with teacher approval). Real names live only in
// school_members.roster_name, shown to teachers and school admins, never on the public site.
// Nothing is ever hard-deleted from a roster: people are marked 'left' with a date, so history survives moves.
import crypto from 'node:crypto';
import { q, uid, now, tx, audit } from '../db.js';
import { config } from '../config.js';
import { createUser, setPassword, getUser } from '../auth.js';
import { unlinkAll } from './family.js';
import * as funnel from './funnel.js';
import { clear, loginLockKey } from './ratelimit.js';

export const ROLES = ['admin', 'teacher', 'student'];
export const DEFAULT_SETTINGS = {
  teachersCreateClasses: true,   // teachers may create classes (school admins always can)
  allowOwnAccounts: true,        // students may join with their personal account (teacher approves)
  chat: 'classmates',            // school accounts: 'classmates' (chat with classmate friends) | 'off'
  publishing: 'school',          // school accounts: 'school' (share games within the school) | 'public' (allowed to go public)
  googleDomains: [],             // the school's Google Workspace domains, for Sign in with Google (services/google.js); [] = off
  timeZone: '',                  // IANA zone, e.g. 'Europe/London': lessons open and fall due at the school's midnight; '' = not set
  builderDailyCap: null,         // school plans: Builder messages per person per day from the pool; null = SCHOOL_DAILY_CAP_DEFAULT
                                 // (never below the free daily messages: services/school-billing.js effectiveCap)
};
/** The highest daily Builder cap a school can set. */
export const MAX_DAILY_CAP = 500;
/** The lowest daily cap a school can set: the free daily Builder messages (a lower cap would change nothing). */
export const minDailyCap = () => Math.max(1, config.builderDailyTurns | 0);
/** Time zones a school can pick (IANA names Node knows). */
export const ZONES = Intl.supportedValuesOf('timeZone');
const ZONE_SET = new Set(ZONES);
export const isZone = tz => typeof tz === 'string' && ZONE_SET.has(tz);
/** The school's time zone, or null when it hasn't been set (then days are counted in UTC with a 36-hour grace). */
export const zoneOf = school => { const tz = settingsOf(school).timeZone; return isZone(tz) ? tz : null; };
const ok = (extra = {}) => ({ ok: true, ...extra });
const fail = code => ({ ok: false, code });
const clip = (s, n) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, n);

// ---------------------------------------------------------------- schools
const slugify = name => clip(name, 60).toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'school';
function uniqueSlug(name) {
  const base = slugify(name);
  for (let i = 1; ; i++) { const s = i === 1 ? base : `${base}-${i}`; if (!q.get('SELECT 1 FROM schools WHERE slug=?', s)) return s; }
}
export const getSchool = id => (id ? q.get('SELECT * FROM schools WHERE id=?', id) : null) || null;
export const getSchoolBySlug = slug => q.get('SELECT * FROM schools WHERE slug=?', String(slug || '')) || null;
export function settingsOf(school) {
  let s = {}; try { s = JSON.parse((school && school.settings) || '{}'); } catch { /* bad json */ }
  return { ...DEFAULT_SETTINGS, ...s };
}
/** Each school's admins' real names (for the platform admin's list): { schoolId: 'Ana Silva, Ben Okafor' }. */
export function schoolAdminNames() {
  const out = {};
  for (const r of q.all(`SELECT m.school_id sid, COALESCE(NULLIF(m.roster_name,''), u.display_name) name FROM school_members m JOIN users u ON u.id=m.user_id
    WHERE m.role='admin' AND m.status='active' ORDER BY name COLLATE NOCASE`)) (out[r.sid] = out[r.sid] || []).push(r.name);
  return Object.fromEntries(Object.entries(out).map(([k, v]) => [k, v.join(', ')]));
}
/** Each member's live classes in a school: { userId: [{ id, name, role }] }. */
export function memberClasses(schoolId) {
  const out = {};
  for (const r of q.all(`SELECT cm.user_id u, c.id, c.name, cm.role FROM class_members cm JOIN classrooms c ON c.id=cm.class_id
    WHERE c.school_id=? AND cm.status='active' AND c.archived_at IS NULL ORDER BY c.name COLLATE NOCASE`, schoolId)) (out[r.u] = out[r.u] || []).push({ id: r.id, name: r.name, role: r.role });
  return out;
}
/** Staff of a school (not only the platform admin's all-access). */
export const isSchoolStaff = u => !!u && !!q.get("SELECT 1 FROM school_members WHERE user_id=? AND status='active' AND role!='student'", u.id);
export function listSchools() {
  return q.all(`SELECT s.*, (SELECT COUNT(*) FROM school_members m WHERE m.school_id=s.id AND m.status='active' AND m.role='student') students,
      (SELECT COUNT(*) FROM school_members m WHERE m.school_id=s.id AND m.status='active' AND m.role!='student') staff,
      (SELECT COUNT(*) FROM classrooms c WHERE c.school_id=s.id AND c.archived_at IS NULL) classes
    FROM schools s ORDER BY s.archived_at IS NOT NULL, s.name COLLATE NOCASE`);
}
export function createSchool(by, { name }) {
  const n = clip(name, 80); if (n.length < 2) return fail('schoolName');
  const id = uid(10);
  q.run('INSERT INTO schools(id, name, slug, settings, created_by, created_at) VALUES (?,?,?,?,?,?)', id, n, uniqueSlug(n), '{}', by.id, now());
  audit(by.id, 'school.create', id, { name: n });
  funnel.bump('teacher.school');
  return ok({ school: getSchool(id) });
}
// Google Workspace domains a school lists for Sign in with Google. Personal mail services are refused: their accounts
// aren't managed by a school (no hd), so they would never match anyway.
export const CONSUMER_DOMAINS = new Set(['gmail.com', 'googlemail.com', 'outlook.com', 'hotmail.com', 'live.com', 'msn.com', 'yahoo.com',
  'ymail.com', 'icloud.com', 'me.com', 'mac.com', 'aol.com', 'proton.me', 'protonmail.com', 'gmx.com', 'gmx.de', 'web.de', 'mail.com',
  'yandex.ru', 'qq.com', '163.com']);
const DOMAIN_RE = /^(?=.{3,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{1,62}$/;
export const MAX_DOMAINS = 10;
/** "@dwes.org, https://students.dwes.org/" -> { ok, domains } or { ok:false, code, value }. */
export function parseDomains(text) {
  const out = [];
  for (const raw of String(text || '').split(/[\s,;]+/)) {
    const d = raw.toLowerCase().replace(/^@/, '').replace(/^https?:\/\//, '').replace(/[/?#].*$/, '').replace(/\.$/, '');
    if (!d) continue;
    if (!DOMAIN_RE.test(d)) return { ok: false, code: 'badDomain', value: raw.slice(0, 60) };
    if (CONSUMER_DOMAINS.has(d)) return { ok: false, code: 'personalDomain', value: d };
    if (!out.includes(d)) out.push(d);
  }
  if (out.length > MAX_DOMAINS) return { ok: false, code: 'tooManyDomains' };
  return { ok: true, domains: out };
}
export function updateSchool(by, schoolId, { name, settings } = {}) {
  const s = getSchool(schoolId); if (!s) return fail('notFound');
  if (name !== undefined) { const n = clip(name, 80); if (n.length < 2) return fail('schoolName'); q.run('UPDATE schools SET name=? WHERE id=?', n, s.id); }
  if (settings) {
    const cur = settingsOf(s), next = { ...cur };
    for (const k of ['teachersCreateClasses', 'allowOwnAccounts']) if (settings[k] !== undefined) next[k] = !!settings[k];
    if (['classmates', 'off'].includes(settings.chat)) next.chat = settings.chat;
    if (['school', 'public'].includes(settings.publishing)) next.publishing = settings.publishing;
    if (Array.isArray(settings.googleDomains)) next.googleDomains = settings.googleDomains.slice(0, MAX_DOMAINS);
    if (settings.timeZone !== undefined) { if (settings.timeZone !== '' && !isZone(settings.timeZone)) return fail('badZone'); next.timeZone = settings.timeZone; }
    if (settings.builderDailyCap !== undefined && settings.builderDailyCap !== null && settings.builderDailyCap !== '') {
      const n = Number(settings.builderDailyCap);
      if (!Number.isInteger(n) || n < minDailyCap() || n > MAX_DAILY_CAP) return fail('badCap');
      next.builderDailyCap = n;
    }
    q.run('UPDATE schools SET settings=? WHERE id=?', JSON.stringify(next), s.id);
  }
  audit(by.id, 'school.update', s.id, { name, settings });
  return ok({ school: getSchool(s.id) });
}

// ---------------------------------------------------------------- members
export const membership = (schoolId, userId) => q.get("SELECT * FROM school_members WHERE school_id=? AND user_id=? AND status='active'", schoolId, userId) || null;
/** The schools a user belongs to (active), with their role. */
export const schoolsOf = userId => (userId ? q.all(`SELECT s.id, s.name, s.slug, s.settings, m.role, m.roster_name, m.grade FROM school_members m JOIN schools s ON s.id=m.school_id
    WHERE m.user_id=? AND m.status='active' AND s.archived_at IS NULL ORDER BY s.name COLLATE NOCASE`, userId) : []);
export function members(schoolId, role = null) {
  return q.all(`SELECT u.id, u.username, u.display_name, u.avatar, u.color, u.photo_at, u.managed_school, u.last_seen, u.banned, m.role, m.roster_name, m.grade, m.joined_at,
      (SELECT COUNT(*) FROM class_members cm JOIN classrooms c ON c.id=cm.class_id WHERE cm.user_id=u.id AND cm.status='active' AND c.school_id=m.school_id AND c.archived_at IS NULL) classes
    FROM school_members m JOIN users u ON u.id=m.user_id WHERE m.school_id=? AND m.status='active' ${role === 'staff' ? "AND m.role!='student'" : role ? 'AND m.role=?' : ''}
    ORDER BY CASE m.role WHEN 'admin' THEN 0 WHEN 'teacher' THEN 1 ELSE 2 END, COALESCE(NULLIF(m.roster_name,''), u.display_name) COLLATE NOCASE`, schoolId, ...(role && role !== 'staff' ? [role] : []));
}
/** Add (or re-activate, or change the role of) a member. */
export function addMember(by, schoolId, userId, role, { rosterName = '', grade = '' } = {}) {
  if (!ROLES.includes(role)) return fail('badRole');
  const s = getSchool(schoolId); const u = getUser(userId);
  if (!s) return fail('notFound');
  if (!u || u.is_guest || u.account_type === 'grownup') return fail('noAccount');   // grown-up accounts never join a school
  if (u.managed_school && u.managed_school !== s.id) return fail('otherSchoolAccount');
  const old = q.get('SELECT * FROM school_members WHERE school_id=? AND user_id=?', s.id, u.id);
  const rn = clip(rosterName, 60) || (old && old.roster_name) || '';
  const gr = clip(grade, 12) || (old && old.grade) || '';
  if (old) q.run("UPDATE school_members SET role=?, roster_name=?, grade=?, status='active', left_at=NULL, joined_at=CASE WHEN status='active' THEN joined_at ELSE ? END WHERE school_id=? AND user_id=?", role, rn, gr, now(), s.id, u.id);
  else q.run("INSERT INTO school_members(school_id, user_id, role, roster_name, grade, status, joined_at) VALUES (?,?,?,?,?,'active',?)", s.id, u.id, role, rn, gr, now());
  // Now staff here: their old requests to join a class of this school as a student are closed.
  if (role !== 'student') q.run("UPDATE join_requests SET status='declined', decided_by=?, decided_at=? WHERE user_id=? AND status='pending' AND class_id IN (SELECT id FROM classrooms WHERE school_id=?)", by.id, now(), u.id, s.id);
  audit(by.id, 'school.member_add', s.id, { user: u.id, role });
  return ok({ user: u });
}
export function updateMember(by, schoolId, userId, { rosterName, grade, role } = {}) {
  const m = membership(schoolId, userId); if (!m) return fail('notFound');
  if (role !== undefined && !ROLES.includes(role)) return fail('badRole');
  q.run('UPDATE school_members SET roster_name=?, grade=?, role=? WHERE school_id=? AND user_id=?',
    rosterName !== undefined ? clip(rosterName, 60) : m.roster_name, grade !== undefined ? clip(grade, 12) : m.grade, role || m.role, schoolId, userId);
  audit(by.id, 'school.member_update', schoolId, { user: userId, role, grade });
  return ok();
}
/** Remove from the school: marked 'left', and leaves every class of that school. School accounts are switched off. */
export function removeMember(by, schoolId, userId) {
  const m = membership(schoolId, userId); if (!m) return fail('notFound');
  tx(() => {
    q.run("UPDATE school_members SET status='left', left_at=? WHERE school_id=? AND user_id=?", now(), schoolId, userId);
    q.run("UPDATE class_members SET status='left', left_at=? WHERE user_id=? AND status='active' AND class_id IN (SELECT id FROM classrooms WHERE school_id=?)", now(), userId, schoolId);
    // Their games stop being shared with this school's classes (the rule already hides them; coming back re-shares nothing).
    pruneGameClasses(userId, q.all('SELECT id FROM classrooms WHERE school_id=?', schoolId).map(r => r.id));
    const u = getUser(userId);
    if (u && u.managed_school === schoolId) {
      q.run('UPDATE users SET banned=1 WHERE id=?', userId); q.run('DELETE FROM sessions WHERE user_id=?', userId);
      unlinkAll(userId, by.id, 'school_remove');
      // Its Google sign-in goes too, so a later invite of the same Google account makes a fresh account.
      q.run('DELETE FROM google_identities WHERE user_id=?', userId);
      q.run("UPDATE google_invites SET status='revoked', revoked_at=? WHERE user_id=? AND status='open'", now(), userId);
    }
  });
  audit(by.id, 'school.member_remove', schoolId, { user: userId });
  return ok();
}

// ---------------------------------------------------------------- school accounts
const ADJ = ['Sunny', 'Brave', 'Happy', 'Bouncy', 'Clever', 'Swift', 'Lucky', 'Jolly', 'Cosmic', 'Mighty', 'Shiny', 'Zippy', 'Cozy', 'Bright', 'Giggly', 'Speedy'];
const ANIMAL = ['Otter', 'Panda', 'Koala', 'Tiger', 'Penguin', 'Dolphin', 'Falcon', 'Lynx', 'Owl', 'Fox', 'Turtle', 'Robin', 'Badger', 'Gecko', 'Llama', 'Beaver'];
// Short, everyday words a child can read and type (ASCII only).
export const WORDS = [
  'maple', 'river', 'comet', 'pebble', 'cloud', 'tulip', 'acorn', 'sparkle', 'meadow', 'pickle', 'rocket', 'sunset', 'puzzle', 'banjo',
  'waffle', 'cactus', 'harbor', 'zigzag', 'otter', 'panda', 'koala', 'tiger', 'zebra', 'camel', 'horse', 'goose', 'eagle', 'robin',
  'raven', 'heron', 'finch', 'swan', 'duck', 'lamb', 'pony', 'frog', 'toad', 'newt', 'crab', 'squid', 'whale', 'shark', 'seal', 'moose',
  'bison', 'llama', 'lemur', 'sloth', 'hippo', 'rhino', 'gecko', 'puffin', 'parrot', 'beaver', 'badger', 'ferret', 'rabbit', 'kitten',
  'puppy', 'mouse', 'owl', 'fox', 'bee', 'yak', 'emu', 'wolf', 'bear', 'deer', 'hare', 'mole', 'lynx', 'orca', 'walrus', 'turtle',
  'salmon', 'trout', 'snail', 'beetle', 'moth', 'dolphin', 'penguin', 'falcon', 'pigeon', 'magpie', 'toucan', 'jaguar', 'donkey',
  'rooster', 'kiwi', 'forest', 'valley', 'canyon', 'island', 'lake', 'ocean', 'beach', 'desert', 'rainbow', 'breeze', 'snow', 'frost',
  'leaf', 'petal', 'daisy', 'rose', 'lily', 'fern', 'moss', 'cedar', 'pine', 'oak', 'willow', 'birch', 'bamboo', 'clover', 'lotus',
  'poppy', 'iris', 'violet', 'ivy', 'sprout', 'seed', 'twig', 'stone', 'sand', 'shell', 'coral', 'wave', 'tide', 'moon', 'star', 'planet',
  'orbit', 'sky', 'dawn', 'spring', 'summer', 'autumn', 'winter', 'hill', 'cliff', 'cave', 'pond', 'brook', 'creek', 'reef', 'dune',
  'apple', 'mango', 'peach', 'plum', 'pear', 'lemon', 'lime', 'melon', 'grape', 'cherry', 'berry', 'banana', 'carrot', 'potato', 'tomato',
  'pepper', 'onion', 'celery', 'radish', 'turnip', 'pumpkin', 'olive', 'bagel', 'muffin', 'cookie', 'donut', 'pretzel', 'noodle', 'pasta',
  'pizza', 'taco', 'rice', 'bread', 'toast', 'honey', 'butter', 'cheese', 'yogurt', 'popcorn', 'pancake', 'syrup', 'jelly', 'cocoa',
  'vanilla', 'ginger', 'pudding', 'kite', 'drum', 'flute', 'piano', 'violin', 'guitar', 'trumpet', 'bell', 'lantern', 'candle', 'compass',
  'anchor', 'sail', 'boat', 'train', 'wagon', 'scooter', 'robot', 'magnet', 'button', 'pencil', 'crayon', 'marker', 'paper', 'ruler',
  'eraser', 'blanket', 'pillow', 'teapot', 'kettle', 'basket', 'bucket', 'ladder', 'hammer', 'shovel', 'rake', 'mitten', 'scarf', 'sock',
  'boot', 'helmet', 'crown', 'castle', 'tower', 'bridge', 'tunnel', 'garden', 'window', 'chimney', 'amber', 'azure', 'golden', 'indigo',
  'ivory', 'jade', 'lilac', 'silver', 'teal', 'ruby', 'emerald', 'topaz', 'igloo', 'jigsaw', 'marble', 'whistle', 'tractor', 'glider',
  'canoe', 'kayak', 'paddle', 'jacket', 'sandal', 'slipper', 'bubble', 'feather', 'ribbon', 'sticker', 'balloon', 'cupcake', 'sundae'
];
const rnd = a => a[crypto.randomInt(a.length)];
export function newUsername() {
  for (let i = 0; i < 200; i++) { const u = `${rnd(ADJ)}${rnd(ANIMAL)}${crypto.randomInt(10, 100)}`; if (!q.get('SELECT 1 FROM users WHERE username=? COLLATE NOCASE', u)) return u; }
  throw new Error('could not make a username');
}
// Three words + two digits from the 273-word list: about 273^3 * 90 ≈ 1.8 billion combinations (~31 bits), so
// guessing stays hopeless even with the loose per-address sign-in limits a school network needs, while the card still
// reads like "maple-otter-pizza-42".
export const newPassword = () => `${rnd(WORDS)}-${rnd(WORDS)}-${rnd(WORDS)}-${crypto.randomInt(10, 100)}`;

/** Create a school account (owned by the school) and add it as a member. Returns the one-time password. */
export function createSchoolAccount(by, schoolId, { rosterName, role = 'student', grade = '' }) {
  const s = getSchool(schoolId); if (!s) return fail('notFound');
  const rn = clip(rosterName, 60); if (!rn) return fail('rosterName');
  if (!ROLES.includes(role)) return fail('badRole');
  const username = newUsername(), password = newPassword();
  const u = createUser({ username, password, displayName: username });
  q.run('UPDATE users SET managed_school=? WHERE id=?', s.id, u.id);
  addMember(by, s.id, u.id, role, { rosterName: rn, grade });
  audit(by.id, 'school.account_create', s.id, { user: u.id, role });
  return ok({ user: getUser(u.id), username, password, rosterName: rn });
}
/** New password for a school account (personal accounts keep their own passwords). */
export function resetSchoolPassword(by, schoolId, userId) {
  const u = getUser(userId);
  const m = membership(schoolId, userId);
  if (!u || u.managed_school !== schoolId || !m) return fail('notSchoolAccount');
  // Only school admins reset a staff member's password (teachers reset their students' only).
  if (m.role !== 'student' && !canManageSchool(by, schoolId)) return fail('notSchoolAccount');
  const password = newPassword();
  setPassword(u.id, password, { signOutEverywhere: true });
  clear(loginLockKey(u.username)); // a child locked out by wrong guesses can sign in with the new password straight away
  audit(by.id, 'school.password_reset', schoolId, { user: u.id });
  return ok({ user: u, username: u.username, password });
}

// ---------------------------------------------------------------- classrooms
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
function newJoinCode() {
  for (;;) { const c = Array.from({ length: 6 }, () => CODE_CHARS[crypto.randomInt(CODE_CHARS.length)]).join(''); if (!q.get('SELECT 1 FROM classrooms WHERE join_code=?', c)) return c; }
}
export const normCode = s => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
export const getClass = id => (id ? q.get('SELECT * FROM classrooms WHERE id=?', id) : null) || null;
export const getClassByCode = code => q.get('SELECT * FROM classrooms WHERE join_code=?', normCode(code)) || null;
const CLASS_COLS = `c.*, s.name school_name, s.slug school_slug,
  (SELECT COUNT(*) FROM class_members m WHERE m.class_id=c.id AND m.status='active' AND m.role='student') students,
  (SELECT GROUP_CONCAT(COALESCE(NULLIF(sm.roster_name,''), u.display_name), ', ') FROM class_members m JOIN users u ON u.id=m.user_id
     LEFT JOIN school_members sm ON sm.school_id=c.school_id AND sm.user_id=u.id WHERE m.class_id=c.id AND m.status='active' AND m.role='teacher') teachers,
  (SELECT COUNT(*) FROM join_requests r WHERE r.class_id=c.id AND r.status='pending') requests,
  (SELECT COUNT(*) FROM class_lessons cl WHERE cl.class_id=c.id AND cl.removed_at IS NULL) lessons,
  (SELECT MAX(p.updated_at) FROM step_progress p JOIN class_lessons cl ON cl.id=p.class_lesson_id WHERE cl.class_id=c.id AND cl.removed_at IS NULL) last_activity`;
export const classesOfSchool = (schoolId, { archived = false } = {}) => q.all(`SELECT ${CLASS_COLS} FROM classrooms c JOIN schools s ON s.id=c.school_id
  WHERE c.school_id=? AND c.archived_at IS ${archived ? 'NOT ' : ''}NULL ORDER BY c.name COLLATE NOCASE`, schoolId);
/** Active classes a user is in, as teacher or student. */
export const classesOf = (userId, role = null, { archived = false } = {}) => (userId ? q.all(`SELECT ${CLASS_COLS}, m.role my_role FROM class_members m JOIN classrooms c ON c.id=m.class_id JOIN schools s ON s.id=c.school_id
  WHERE m.user_id=? AND m.status='active' AND c.archived_at IS ${archived ? 'NOT ' : ''}NULL AND s.archived_at IS NULL ${role ? 'AND m.role=?' : ''} ORDER BY s.name, c.name COLLATE NOCASE`, userId, ...(role ? [role] : [])) : []);
/** teacherId: who teaches it (from the school page: a staff member's id, or 'none'). Without it (a teacher's own
 *  "New class"), the creator teaches the class. */
export function createClass(by, schoolId, { name, subject = '', grade = '', teacherId } = {}) {
  if (!getSchool(schoolId)) return fail('notFound');
  const n = clip(name, 60); if (n.length < 1) return fail('className');
  let teacher = teacherId === undefined ? (membership(schoolId, by.id) ? by.id : null) : null;
  if (teacherId !== undefined && teacherId !== 'none') {
    const m = membership(schoolId, teacherId);
    if (!m || m.role === 'student') return fail('badTeacher');
    teacher = m.user_id;
  }
  const id = uid(10);
  tx(() => {
    q.run('INSERT INTO classrooms(id, school_id, name, subject, grade, join_code, created_by, created_at) VALUES (?,?,?,?,?,?,?,?)', id, schoolId, n, clip(subject, 40), clip(grade, 12), newJoinCode(), by.id, now());
    if (teacher) q.run("INSERT INTO class_members(class_id, user_id, role, status, joined_at) VALUES (?,?,'teacher','active',?)", id, teacher, now());
  });
  audit(by.id, 'class.create', id, { school: schoolId, name: n });
  return ok({ class: getClass(id) });
}
export function updateClass(by, classId, { name, subject, grade } = {}) {
  const c = getClass(classId); if (!c) return fail('notFound');
  const n = name !== undefined ? clip(name, 60) : c.name; if (!n) return fail('className');
  q.run('UPDATE classrooms SET name=?, subject=?, grade=? WHERE id=?', n, subject !== undefined ? clip(subject, 40) : c.subject, grade !== undefined ? clip(grade, 12) : c.grade, c.id);
  audit(by.id, 'class.update', c.id, { name: n });
  return ok({ class: getClass(c.id) });
}
/** Archive (or restore) a class. Games shared with it stop reaching it while it is archived (the rule checks
 *  archived_at) and come back on restore: archiving keeps everything. */
export function archiveClass(by, classId, archived = true) {
  const c = getClass(classId); if (!c) return fail('notFound');
  q.run('UPDATE classrooms SET archived_at=? WHERE id=?', archived ? now() : null, c.id);
  audit(by.id, archived ? 'class.archive' : 'class.restore', c.id);
  return ok();
}
/** Delete only an empty class (no students ever); otherwise archive it, which keeps its history. */
/** A class that never had a student can be deleted (it has no student work); otherwise it can only be archived. */
export const everHadStudents = classId => !!q.get("SELECT 1 FROM class_members WHERE class_id=? AND role='student'", classId);
export function deleteClass(by, classId) {
  const c = getClass(classId); if (!c) return fail('notFound');
  if (everHadStudents(c.id)) return fail('classHasStudents');
  tx(() => {
    q.run('DELETE FROM class_members WHERE class_id=?', c.id); q.run('DELETE FROM join_requests WHERE class_id=?', c.id);
    q.run('DELETE FROM class_lessons WHERE class_id=?', c.id); q.run('DELETE FROM class_units WHERE class_id=?', c.id);
    q.run('DELETE FROM game_classes WHERE class_id=?', c.id);
    q.run('DELETE FROM classrooms WHERE id=?', c.id);
  });
  audit(by.id, 'class.delete', c.id, { name: c.name });
  return ok();
}
export function newCode(by, classId) {
  const c = getClass(classId); if (!c) return fail('notFound');
  q.run('UPDATE classrooms SET join_code=? WHERE id=?', newJoinCode(), c.id);
  audit(by.id, 'class.code', c.id);
  return ok({ class: getClass(c.id) });
}

// ---------------------------------------------------------------- rosters
export const classMember = (classId, userId) => q.get("SELECT * FROM class_members WHERE class_id=? AND user_id=? AND status='active'", classId, userId) || null;
export function roster(classId) {
  return q.all(`SELECT u.id, u.username, u.display_name, u.avatar, u.color, u.photo_at, u.managed_school, u.last_seen, m.role, m.joined_at, sm.roster_name, sm.grade
    FROM class_members m JOIN users u ON u.id=m.user_id JOIN classrooms c ON c.id=m.class_id LEFT JOIN school_members sm ON sm.school_id=c.school_id AND sm.user_id=u.id
    WHERE m.class_id=? AND m.status='active' ORDER BY m.role='student', COALESCE(NULLIF(sm.roster_name,''), u.display_name) COLLATE NOCASE`, classId);
}
/** Put a school member in a class (students as 'student', staff as 'teacher' unless told). */
export function addToClass(by, classId, userId, role = null) {
  const c = getClass(classId); if (!c) return fail('notFound');
  const m = membership(c.school_id, userId); if (!m) return fail('notInSchool');
  const r = role || (m.role === 'student' ? 'student' : 'teacher');
  if (r === 'teacher' && m.role === 'student') return fail('badRole');
  // Funnel counts (services/funnel.js): the school's first class with a student, once per school, ever (a student who
  // left still counts as "had one", so moving or re-adding never counts again).
  const firstStudent = r === 'student' && !q.get("SELECT 1 FROM class_members x JOIN classrooms k ON k.id=x.class_id WHERE k.school_id=? AND x.role='student'", c.school_id);
  q.run(`INSERT INTO class_members(class_id, user_id, role, status, joined_at) VALUES (?,?,?,'active',?)
    ON CONFLICT(class_id, user_id) DO UPDATE SET role=excluded.role, status='active', left_at=NULL, joined_at=CASE WHEN class_members.status='active' THEN class_members.joined_at ELSE excluded.joined_at END`, c.id, userId, r, now());
  audit(by.id, 'class.member_add', c.id, { user: userId, role: r });
  if (firstStudent) funnel.bump('teacher.class');
  return ok();
}
/** Take someone out of a class (a teacher removing a student, a co-teacher leaving, a student moved). Their games stop
 *  being shared with it at once, and coming back later doesn't re-share them (explicit lists). */
export function removeFromClass(by, classId, userId) {
  let r;
  tx(() => {
    r = q.run("UPDATE class_members SET status='left', left_at=? WHERE class_id=? AND user_id=? AND status='active'", now(), classId, userId);
    if (r.changes) pruneGameClasses(userId, [classId]);
  });
  if (!r.changes) return fail('notFound');
  audit(by.id, 'class.member_remove', classId, { user: userId });
  return ok();
}
/** Move a student to another class of the same school (they leave the old one; its records stay with it). */
export function moveStudent(by, fromClassId, toClassId, userId) {
  const a = getClass(fromClassId), b = getClass(toClassId);
  if (!a || !b || b.archived_at) return fail('notFound');
  if (a.school_id !== b.school_id) return fail('otherSchool');
  if (!classMember(a.id, userId)) return fail('notFound');
  let res;
  tx(() => { removeFromClass(by, a.id, userId); res = addToClass(by, b.id, userId, 'student'); });
  return res.ok ? ok() : res;
}

// ---------------------------------------------------------------- join requests (students with their own account)
/** A signed-in student types a class code. School members join straight away; others wait for the teacher. */
export function requestJoin(user, code) {
  if (!user || user.is_guest) return fail('noAccount');
  const c = getClassByCode(code);
  if (!c || c.archived_at) return fail('badCode');
  const s = getSchool(c.school_id); if (!s || s.archived_at) return fail('badCode');
  if (classMember(c.id, user.id)) return ok({ state: 'already', class: c });
  if (user.managed_school && user.managed_school !== s.id) return fail('otherSchoolAccount');
  const m = membership(s.id, user.id);
  if (m && m.role === 'student') { addToClass(user, c.id, user.id, 'student'); return ok({ state: 'joined', class: c }); }
  if (m) return fail('staffUseTeach');
  if (isPlatformAdmin(user)) return fail('adminNotStudent');
  if (!settingsOf(s).allowOwnAccounts) return fail('ownAccountsOff');
  if (q.get("SELECT 1 FROM join_requests WHERE class_id=? AND user_id=? AND status='pending'", c.id, user.id)) return ok({ state: 'pending', class: c });
  q.run("INSERT INTO join_requests(id, class_id, user_id, status, created_at) VALUES (?,?,?,'pending',?)", uid(10), c.id, user.id, now());
  audit(user.id, 'class.join_request', c.id);
  return ok({ state: 'pending', class: c });
}
export const pendingRequests = classId => q.all(`SELECT r.id, r.created_at, u.id user_id, u.username, u.display_name, u.avatar, u.color, u.photo_at
  FROM join_requests r JOIN users u ON u.id=r.user_id WHERE r.class_id=? AND r.status='pending' AND u.banned=0
    AND NOT EXISTS (SELECT 1 FROM school_members sm JOIN classrooms k ON k.school_id=sm.school_id WHERE k.id=r.class_id AND sm.user_id=r.user_id AND sm.status='active' AND sm.role!='student')
  ORDER BY r.created_at`, classId);
export const myPendingRequests = userId => q.all(`SELECT r.id, c.name class_name, s.name school_name FROM join_requests r JOIN classrooms c ON c.id=r.class_id JOIN schools s ON s.id=c.school_id
  WHERE r.user_id=? AND r.status='pending' ORDER BY r.created_at DESC`, userId);
const getRequest = id => q.get('SELECT * FROM join_requests WHERE id=?', String(id || '')) || null;
export const requestClass = id => { const r = getRequest(id); return r ? getClass(r.class_id) : null; };
/**
 * Teacher approves. rosterName: the student's real name for the class list. sameAs: the id of a school account the
 * school already made for this student; its school records move to this account and the empty school account goes away.
 */
export function approveRequest(by, requestId, { rosterName = '', sameAs = null } = {}) {
  const r = getRequest(requestId); if (!r || r.status !== 'pending') return fail('notFound');
  const c = getClass(r.class_id); const u = getUser(r.user_id);
  if (!c || !u || u.banned) return fail('notFound');
  // Asked before they became staff here: the old request no longer applies (approving it would make them a student).
  const cur = membership(c.school_id, u.id);
  if (cur && cur.role !== 'student') return fail('notFound');
  let res = ok();
  tx(() => {
    if (sameAs) { res = mergeSchoolAccount(by, c.school_id, sameAs, u.id); if (!res.ok) return; }
    const m = membership(c.school_id, u.id);
    if (!m) addMember(by, c.school_id, u.id, 'student', { rosterName });
    else if (clip(rosterName, 60)) updateMember(by, c.school_id, u.id, { rosterName });
    addToClass(by, c.id, u.id, 'student');
    q.run("UPDATE join_requests SET status='approved', decided_by=?, decided_at=? WHERE id=?", by.id, now(), r.id);
  });
  if (res.ok) audit(by.id, 'class.join_approve', c.id, { user: u.id, merged: sameAs || undefined });
  return res;
}
export function declineRequest(by, requestId) {
  const r = getRequest(requestId); if (!r || r.status !== 'pending') return fail('notFound');
  q.run("UPDATE join_requests SET status='declined', decided_by=?, decided_at=? WHERE id=?", by.id, now(), r.id);
  audit(by.id, 'class.join_decline', r.class_id, { user: r.user_id });
  return ok();
}
/** Move a school account's school records (membership, classes, games) onto the student's own account, then remove it. */
export function mergeSchoolAccount(by, schoolId, schoolAccountId, intoUserId) {
  const a = getUser(schoolAccountId);
  // Only a student school account of this school can be merged (never a teacher's or school admin's account).
  const old = a && membership(schoolId, a.id);
  if (!a || a.managed_school !== schoolId || a.id === intoUserId || !old || old.role !== 'student') return fail('notSchoolAccount');
  const into = membership(schoolId, intoUserId);
  if (into && into.role !== 'student') return fail('notSchoolAccount');
  // Only a student the actor actually manages (a class they teach, or any as a school admin): a teacher can't reach
  // into another teacher's class and merge away a child they don't teach.
  if (!canManageStudent(by, schoolId, a.id)) return fail('notSchoolAccount');
  tx(() => {
    if (old) {
      q.run('DELETE FROM school_members WHERE school_id=? AND user_id=?', schoolId, intoUserId);
      q.run('UPDATE school_members SET user_id=? WHERE school_id=? AND user_id=?', intoUserId, schoolId, a.id);
    }
    for (const cm of q.all('SELECT * FROM class_members WHERE user_id=?', a.id)) {
      q.run('DELETE FROM class_members WHERE class_id=? AND user_id=?', cm.class_id, intoUserId);
      q.run('UPDATE class_members SET user_id=? WHERE class_id=? AND user_id=?', intoUserId, cm.class_id, a.id);
    }
    q.run('UPDATE games SET owner_id=? WHERE owner_id=?', intoUserId, a.id);
    // Games stay shared with the classes the student is still in; links to classes the merged places say they left go.
    pruneGameClasses(intoUserId, q.all("SELECT class_id FROM class_members WHERE user_id=? AND status!='active'", intoUserId).map(r => r.class_id));
    // Lesson work moves too (if both accounts did the same step, the student's own account keeps theirs).
    q.run('UPDATE OR IGNORE step_progress SET user_id=? WHERE user_id=?', intoUserId, a.id);
    q.run('DELETE FROM step_progress WHERE user_id=?', a.id);
    for (const t of ['sessions', 'friends', 'join_requests', 'google_identities']) q.run(`DELETE FROM ${t} WHERE user_id=?`, a.id);
    q.run("UPDATE google_invites SET status='revoked', revoked_at=? WHERE user_id=? AND status='open'", now(), a.id);
    q.run('DELETE FROM friends WHERE friend_id=?', a.id);
    q.run("UPDATE users SET banned=1, password_hash=NULL, managed_school='', username=? WHERE id=?", `merged_${a.id}`, a.id);
    unlinkAll(a.id, by.id, 'merge');
  });
  audit(by.id, 'school.account_merge', schoolId, { from: a.id, into: intoUserId });
  return ok();
}

// ---------------------------------------------------------------- permissions
export const isPlatformAdmin = u => !!u && u.role === 'admin';
/** 'admin' | 'teacher' | 'student' | null. Platform admins count as school admins everywhere. */
export function roleIn(u, schoolId) {
  if (!u) return null;
  if (isPlatformAdmin(u)) return 'admin';
  const m = membership(schoolId, u.id);
  return m ? m.role : null;
}
export const canManageSchool = (u, schoolId) => roleIn(u, schoolId) === 'admin';
export function canCreateClass(u, schoolId) {
  const r = roleIn(u, schoolId);
  return r === 'admin' || (r === 'teacher' && settingsOf(getSchool(schoolId)).teachersCreateClasses);
}
export const teaches = (u, classId) => { const m = u && classMember(classId, u.id); return !!m && m.role === 'teacher'; };
/** School admins, and the class's own teachers (who must still be staff of the school). */
export function canManageClass(u, c) {
  if (!u || !c) return false;
  const r = roleIn(u, c.school_id);
  return r === 'admin' || (r === 'teacher' && teaches(u, c.id));
}
export function canViewClass(u, c) {
  if (!u || !c) return false;
  return canManageClass(u, c) || (!c.archived_at && !!classMember(c.id, u.id) && !!membership(c.school_id, u.id));
}
/** Can u manage this student (reset a school password, edit the roster name)? School admins, or a teacher of one of the student's classes. */
export function canManageStudent(u, schoolId, studentId) {
  const r = roleIn(u, schoolId);
  if (r === 'admin') return true;
  if (r !== 'teacher') return false;
  return !!q.get(`SELECT 1 FROM class_members t JOIN class_members s ON s.class_id=t.class_id JOIN classrooms c ON c.id=t.class_id
    WHERE t.user_id=? AND t.role='teacher' AND t.status='active' AND s.user_id=? AND s.status='active' AND c.school_id=?`, u.id, studentId, schoolId);
}
/** Is the user staff (admin or teacher) anywhere? */
export const isStaff = u => !!u && (isPlatformAdmin(u) || !!q.get("SELECT 1 FROM school_members WHERE user_id=? AND status='active' AND role!='student'", u.id));

// ---------------------------------------------------------------- school rules for the game site
/** Do two people share an active class (as students or teacher)? */
export const classmates = (a, b) => !!(a && b && a !== b && q.get(`SELECT 1 FROM class_members x JOIN class_members y ON y.class_id=x.class_id JOIN classrooms c ON c.id=x.class_id
  WHERE x.user_id=? AND y.user_id=? AND x.status='active' AND y.status='active' AND c.archived_at IS NULL`, a, b));
/** Do two people belong to the same school? */
export const schoolmates = (a, b) => !!(a && b && q.get(`SELECT 1 FROM school_members x JOIN school_members y ON y.school_id=x.school_id
  WHERE x.user_id=? AND y.user_id=? AND x.status='active' AND y.status='active'`, a, b));
/** The rules for a school account (its owning school's settings), or null for personal accounts. */
export function accountRules(u) {
  if (!u || !u.managed_school) return null;
  const s = getSchool(u.managed_school);
  return s ? settingsOf(s) : { ...DEFAULT_SETTINGS };
}
export const inAnySchool = u => !!(u && q.get("SELECT 1 FROM school_members WHERE user_id=? AND status='active'", u.id));

/** Who a game can be shared with, for its owner (in games.VISIBILITIES order): private and friends always; 'class'
 *  for an active member (student or teacher) of at least one live class; 'school' for school members; 'public' unless
 *  the owner is a school account whose school keeps games inside the school. 'class' is narrower than both school
 *  settings ('school' and 'public'), so every school allows it; a future "private only" setting must turn it off too. */
export function sharingOptions(owner) {
  const opts = ['private', 'friends'];
  if (owner && shareableClasses(owner.id).length) opts.push('class');
  if (inAnySchool(owner)) opts.push('school');
  const rules = accountRules(owner);
  if (!rules || rules.publishing === 'public') opts.push('public');
  return opts;
}

// ---------------------------------------------------------------- "Share with my classes" (game_classes)
// Who sees a 'class' game is decided by the rule in services/games.js (CLASS_SQL); these write the owner's list.
/** Classes a person can share a game with: active member (any role) of a non-archived class of a non-archived school,
 *  and still an active member of that school. [{ id, name, school_id, school_name }] ordered by school, then name. */
export const shareableClasses = userId => (userId ? q.all(`SELECT c.id, c.name, c.school_id, s.name school_name FROM class_members m
  JOIN classrooms c ON c.id=m.class_id AND c.archived_at IS NULL JOIN schools s ON s.id=c.school_id AND s.archived_at IS NULL
  JOIN school_members sm ON sm.school_id=c.school_id AND sm.user_id=m.user_id AND sm.status='active'
  WHERE m.user_id=? AND m.status='active' ORDER BY s.name COLLATE NOCASE, c.name COLLATE NOCASE`, userId) : []);
/** The classes a game is shared with (the owner's list, not taken off by a teacher), whether or not they count now. */
export const gameClassIds = gameId => q.all('SELECT class_id FROM game_classes WHERE game_id=? AND removed_at IS NULL ORDER BY added_at, class_id', gameId).map(r => r.class_id);
/** The classes a teacher took this game off (the owner can't add them back). */
export const removedClassIds = gameId => q.all('SELECT class_id FROM game_classes WHERE game_id=? AND removed_at IS NOT NULL', gameId).map(r => r.class_id);
export const MAX_CLASS_PICK = 50;
/** Check the classes an owner picked for a game. classIds: an array of class ids (strings); trimmed and de-duplicated.
 *  -> { ok: true, ids } or { ok: false, code: 'pickClass' | 'classGone' | 'classRemoved', name? }. 'classGone' is the
 *  same answer for an unknown class, another school's, one the owner left and an archived one (no existence oracle). */
export function validateClassPick(owner, gameId, classIds) {
  if (!Array.isArray(classIds) || classIds.some(x => typeof x !== 'string')) return fail('pickClass');
  const ids = [...new Set(classIds.map(x => x.trim()).filter(Boolean))];
  if (!ids.length || ids.length > MAX_CLASS_PICK) return fail('pickClass');
  const mine = new Map(shareableClasses(owner && owner.id).map(c => [c.id, c]));
  if (ids.some(id => !mine.has(id))) return fail('classGone');
  const removed = new Set(removedClassIds(gameId));
  const blocked = ids.find(id => removed.has(id));
  if (blocked) return { ok: false, code: 'classRemoved', name: mine.get(blocked).name };
  return ok({ ids });
}
/** Replace a game's list with these (already validated) classes. Classes kept keep their added_at; teacher-removed
 *  rows stay as they are (validation never lets them back in). Call inside the publish transaction. */
export function setGameClasses(gameId, ids, by) {
  tx(() => {
    const keep = ids.length ? ` AND class_id NOT IN (${ids.map(() => '?').join(',')})` : '';
    q.run(`DELETE FROM game_classes WHERE game_id=? AND removed_at IS NULL${keep}`, gameId, ...ids);
    const t = now();
    for (const id of ids) q.run('INSERT INTO game_classes(game_id, class_id, added_by, added_at) VALUES (?,?,?,?) ON CONFLICT(game_id, class_id) DO NOTHING', gameId, id, by || null, t);
  });
}
/** A person left (or was removed from) these classes: their games' links to them go (teacher-removed rows stay, as the
 *  record that the game may not come back there). */
export function pruneGameClasses(userId, classIds) {
  if (!userId || !classIds || !classIds.length) return;
  for (let i = 0; i < classIds.length; i += 500) {
    const part = classIds.slice(i, i + 500);
    q.run(`DELETE FROM game_classes WHERE removed_at IS NULL AND class_id IN (${part.map(() => '?').join(',')}) AND game_id IN (SELECT id FROM games WHERE owner_id=?)`, ...part, userId);
  }
}
const gameOwner = gameId => (q.get('SELECT owner_id FROM games WHERE id=?', gameId) || {}).owner_id || null;
/** A class's teacher (or a school admin) takes a game off the class: it stops reaching the class at once, and its
 *  owner can't add the class back for that game. The route has checked canManageClass. Audited. */
export function removeClassGame(by, classId, gameId) {
  const r = q.run('UPDATE game_classes SET removed_at=?, removed_by=? WHERE class_id=? AND game_id=? AND removed_at IS NULL', now(), by.id, classId, gameId);
  if (!r.changes) return fail('gameNotHere');
  audit(by.id, 'class.game_remove', classId, { game: gameId, owner: gameOwner(gameId) });
  return ok();
}
/** "Put back": lift a teacher's block. The game does NOT start reaching the class again by itself: the class just becomes
 *  pickable again in its owner's Studio, and the owner adds it back if they want to (an audience only ever grows when
 *  its owner chooses it). */
export function restoreClassGame(by, classId, gameId) {
  const r = q.run('DELETE FROM game_classes WHERE class_id=? AND game_id=? AND removed_at IS NOT NULL', classId, gameId);
  if (!r.changes) return fail('gameNotHere');
  audit(by.id, 'class.game_restore', classId, { game: gameId, owner: gameOwner(gameId) });
  return ok();
}
