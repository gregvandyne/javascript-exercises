// Oomba Academy database: SQLite via better-sqlite3. One file, WAL mode (BRB_JOURNAL_MODE), versioned migrations.
// SQLite wants a local block disk and one writing process: never two app instances on the same file. The same goes
// for the Builder: one runner (server/builder/runner.js) owns every build, and boot recovery assumes it is the only one.
// Reused from the starter with chat tables and update-review fields added.
// Everything else talks to the DB through `q` (and the service modules), so a Postgres swap is a repository-layer change.
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { config, JOURNAL_MODES } from './config.js';

fs.mkdirSync(config.dataDir, { recursive: true });
export const DB_PATH = config.db === ':memory:' ? ':memory:' : (config.db || path.join(config.dataDir, 'brb.db'));

export const db = new Database(DB_PATH);
// WAL by default. On a network file system (NFS, SMB: EFS, Azure Files) WAL's shared memory doesn't work: use DELETE.
if (!JOURNAL_MODES.includes(config.journalMode)) throw new Error(`BRB_JOURNAL_MODE must be one of ${JOURNAL_MODES.join(', ')}`);
/** The journal mode in use ('memory' for the in-memory test DB). */
export const JOURNAL_MODE = db.pragma(`journal_mode = ${config.journalMode}`, { simple: true });
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 5000');

export const now = () => Date.now();
export const uid = (n = 12) => crypto.randomBytes(24).toString('base64url').replace(/[^a-zA-Z0-9]/g, '').slice(0, n);
export const today = (t = Date.now()) => new Date(t).toISOString().slice(0, 10);

export const MIGRATIONS = [
  ['0001_init', `
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL COLLATE NOCASE, display_name TEXT NOT NULL, password_hash TEXT,
    role TEXT NOT NULL DEFAULT 'player', is_guest INTEGER NOT NULL DEFAULT 0, avatar TEXT NOT NULL DEFAULT '🙂',
    color TEXT NOT NULL DEFAULT '#2f6bff', friend_code TEXT UNIQUE, bio TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL, last_seen INTEGER NOT NULL DEFAULT 0, builder_enabled INTEGER NOT NULL DEFAULT 1,
    banned INTEGER NOT NULL DEFAULT 0, chat_enabled INTEGER NOT NULL DEFAULT 1);
  CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, ua TEXT NOT NULL DEFAULT '');
  CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);
  CREATE TABLE IF NOT EXISTS games (
    id TEXT PRIMARY KEY, slug TEXT UNIQUE NOT NULL, owner_id TEXT NOT NULL, title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '', icon TEXT NOT NULL DEFAULT '🎮', cover TEXT NOT NULL DEFAULT 'sunset',
    category TEXT NOT NULL DEFAULT 'arcade', tags TEXT NOT NULL DEFAULT '', visibility TEXT NOT NULL DEFAULT 'private',
    status TEXT NOT NULL DEFAULT 'draft', current_version_id TEXT, published_version_id TEXT, pending_version_id TEXT,
    plays INTEGER NOT NULL DEFAULT 0, likes INTEGER NOT NULL DEFAULT 0, rating_sum INTEGER NOT NULL DEFAULT 0,
    rating_count INTEGER NOT NULL DEFAULT 0, featured INTEGER NOT NULL DEFAULT 0, players_max INTEGER NOT NULL DEFAULT 1,
    orientation TEXT NOT NULL DEFAULT 'any', source TEXT NOT NULL DEFAULT 'studio', age_rating TEXT NOT NULL DEFAULT 'everyone',
    review_note TEXT NOT NULL DEFAULT '', hidden_reason TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, published_at INTEGER);
  CREATE INDEX IF NOT EXISTS games_owner ON games(owner_id);
  CREATE INDEX IF NOT EXISTS games_status ON games(status, visibility);
  CREATE TABLE IF NOT EXISTS game_versions (
    id TEXT PRIMARY KEY, game_id TEXT NOT NULL, number INTEGER NOT NULL, html TEXT NOT NULL, notes TEXT NOT NULL DEFAULT '',
    safety_status TEXT NOT NULL DEFAULT 'unchecked', safety_report TEXT NOT NULL DEFAULT '{}',
    review_status TEXT NOT NULL DEFAULT 'none', review_report TEXT NOT NULL DEFAULT '{}',
    created_by TEXT, created_at INTEGER NOT NULL);
  CREATE INDEX IF NOT EXISTS versions_game ON game_versions(game_id, number);
  CREATE TABLE IF NOT EXISTS friends (user_id TEXT NOT NULL, friend_id TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', created_at INTEGER NOT NULL, PRIMARY KEY(user_id, friend_id));
  CREATE TABLE IF NOT EXISTS plays (id TEXT PRIMARY KEY, game_id TEXT NOT NULL, user_id TEXT, started_at INTEGER NOT NULL, ended_at INTEGER, seconds INTEGER NOT NULL DEFAULT 0);
  CREATE INDEX IF NOT EXISTS plays_game ON plays(game_id, started_at);
  CREATE TABLE IF NOT EXISTS saves (game_id TEXT NOT NULL, user_id TEXT NOT NULL, data TEXT NOT NULL DEFAULT '{}', updated_at INTEGER NOT NULL, PRIMARY KEY(game_id, user_id));
  CREATE TABLE IF NOT EXISTS scores (id TEXT PRIMARY KEY, game_id TEXT NOT NULL, user_id TEXT NOT NULL, score INTEGER NOT NULL, label TEXT NOT NULL DEFAULT '', created_at INTEGER NOT NULL);
  CREATE INDEX IF NOT EXISTS scores_game ON scores(game_id, score);
  CREATE TABLE IF NOT EXISTS ratings (game_id TEXT NOT NULL, user_id TEXT NOT NULL, stars INTEGER NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY(game_id, user_id));
  CREATE TABLE IF NOT EXISTS likes (game_id TEXT NOT NULL, user_id TEXT NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY(game_id, user_id));
  CREATE TABLE IF NOT EXISTS reports (id TEXT PRIMARY KEY, game_id TEXT NOT NULL, user_id TEXT, reason TEXT NOT NULL, details TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'open', created_at INTEGER NOT NULL, resolved_by TEXT, resolved_at INTEGER);
  CREATE INDEX IF NOT EXISTS reports_game ON reports(game_id, status);
  CREATE TABLE IF NOT EXISTS builder_chats (id TEXT PRIMARY KEY, game_id TEXT UNIQUE NOT NULL, user_id TEXT NOT NULL, messages TEXT NOT NULL DEFAULT '[]', state TEXT NOT NULL DEFAULT '{}', tokens_in INTEGER NOT NULL DEFAULT 0, tokens_out INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS builder_usage (user_id TEXT NOT NULL, day TEXT NOT NULL, turns INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(user_id, day));
  CREATE TABLE IF NOT EXISTS audit_log (id TEXT PRIMARY KEY, actor_id TEXT, action TEXT NOT NULL, target TEXT NOT NULL DEFAULT '', details TEXT NOT NULL DEFAULT '', created_at INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  -- Friends-only chat (added at the owner's request; see docs/decisions.md and docs/safety.md)
  CREATE TABLE IF NOT EXISTS chat_messages (id TEXT PRIMARY KEY, from_id TEXT NOT NULL, to_id TEXT NOT NULL, body TEXT NOT NULL, kind TEXT NOT NULL DEFAULT 'text', status TEXT NOT NULL DEFAULT 'ok', created_at INTEGER NOT NULL, read_at INTEGER);
  CREATE INDEX IF NOT EXISTS chat_pair ON chat_messages(from_id, to_id, created_at);
  CREATE INDEX IF NOT EXISTS chat_to ON chat_messages(to_id, read_at);
  CREATE TABLE IF NOT EXISTS chat_blocks (user_id TEXT NOT NULL, blocked_id TEXT NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY(user_id, blocked_id));
  CREATE TABLE IF NOT EXISTS chat_reports (id TEXT PRIMARY KEY, message_id TEXT NOT NULL, reporter_id TEXT NOT NULL, reason TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'open', created_at INTEGER NOT NULL, resolved_by TEXT, resolved_at INTEGER);
  CREATE TABLE IF NOT EXISTS chat_usage (user_id TEXT NOT NULL, day TEXT NOT NULL, sent INTEGER NOT NULL DEFAULT 0, blocked INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(user_id, day));
  `],
  // The site language a signed-in player picked ('' = not chosen; see server/i18n).
  ['0003_user_lang', `ALTER TABLE users ADD COLUMN lang TEXT NOT NULL DEFAULT '';`],
  ['0004_game_l10n', `ALTER TABLE games ADD COLUMN l10n TEXT NOT NULL DEFAULT '';`],
  ['0005_ai_spend', `CREATE TABLE IF NOT EXISTS ai_spend (day TEXT PRIMARY KEY, usd REAL NOT NULL DEFAULT 0, calls INTEGER NOT NULL DEFAULT 0);`],
  // Screenshot covers: when a version's picture was taken (0 = none yet) and how many tries failed.
  ['0006_version_shots', `ALTER TABLE game_versions ADD COLUMN shot_at INTEGER NOT NULL DEFAULT 0; ALTER TABLE game_versions ADD COLUMN shot_tries INTEGER NOT NULL DEFAULT 0;`],
  // Admin stats: page views per day and area (area '_visitors' = distinct visitors that day), the day's visitor
  // fingerprints (salted hashes, deleted after two days), AI tokens per day and model, and indexes for daily counts.
  ['0007_stats', `CREATE TABLE IF NOT EXISTS traffic (day TEXT NOT NULL, area TEXT NOT NULL, views INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(day, area));
    CREATE TABLE IF NOT EXISTS visit_seen (day TEXT NOT NULL, h TEXT NOT NULL, PRIMARY KEY(day, h));
    CREATE TABLE IF NOT EXISTS ai_usage (day TEXT NOT NULL, model TEXT NOT NULL, calls INTEGER NOT NULL DEFAULT 0, input INTEGER NOT NULL DEFAULT 0, output INTEGER NOT NULL DEFAULT 0,
      cache_read INTEGER NOT NULL DEFAULT 0, cache_write INTEGER NOT NULL DEFAULT 0, usd REAL NOT NULL DEFAULT 0, PRIMARY KEY(day, model));
    CREATE INDEX IF NOT EXISTS plays_started ON plays(started_at);
    CREATE INDEX IF NOT EXISTS users_created ON users(created_at);`],
  // Profile photos: when the photo was set (0 = using the emoji). The file is <dataDir>/avatars/<userId>.jpg.
  ['0008_user_photo', `ALTER TABLE users ADD COLUMN photo_at INTEGER NOT NULL DEFAULT 0;`],
  // Schools (enterprise). Every school record carries school_id. Members and class members are never deleted, only
  // marked 'left' with a date, so history survives class moves and transfers. users.managed_school = the school that
  // created (and owns) the account; '' for personal accounts.
  ['0009_schools', `CREATE TABLE IF NOT EXISTS schools (id TEXT PRIMARY KEY, name TEXT NOT NULL, slug TEXT UNIQUE NOT NULL, settings TEXT NOT NULL DEFAULT '{}',
      created_by TEXT, created_at INTEGER NOT NULL, archived_at INTEGER);
    CREATE TABLE IF NOT EXISTS school_members (school_id TEXT NOT NULL, user_id TEXT NOT NULL, role TEXT NOT NULL, roster_name TEXT NOT NULL DEFAULT '',
      grade TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'active', joined_at INTEGER NOT NULL, left_at INTEGER, PRIMARY KEY(school_id, user_id));
    CREATE INDEX IF NOT EXISTS school_members_user ON school_members(user_id, status);
    CREATE TABLE IF NOT EXISTS classrooms (id TEXT PRIMARY KEY, school_id TEXT NOT NULL, name TEXT NOT NULL, subject TEXT NOT NULL DEFAULT '',
      grade TEXT NOT NULL DEFAULT '', join_code TEXT UNIQUE NOT NULL, created_by TEXT, created_at INTEGER NOT NULL, archived_at INTEGER);
    CREATE INDEX IF NOT EXISTS classrooms_school ON classrooms(school_id);
    CREATE TABLE IF NOT EXISTS class_members (class_id TEXT NOT NULL, user_id TEXT NOT NULL, role TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'active',
      joined_at INTEGER NOT NULL, left_at INTEGER, PRIMARY KEY(class_id, user_id));
    CREATE INDEX IF NOT EXISTS class_members_user ON class_members(user_id, status);
    CREATE TABLE IF NOT EXISTS join_requests (id TEXT PRIMARY KEY, class_id TEXT NOT NULL, user_id TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending',
      created_at INTEGER NOT NULL, decided_by TEXT, decided_at INTEGER);
    CREATE INDEX IF NOT EXISTS join_requests_class ON join_requests(class_id, status);
    ALTER TABLE users ADD COLUMN managed_school TEXT NOT NULL DEFAULT '';`],
  // Lesson plans: a teacher's library (folders inside folders, lessons, steps), and lessons assigned to classes in units.
  // Assigned lessons are live links: editing a lesson updates it for every class it is assigned to.
  ['0010_lessons', `CREATE TABLE IF NOT EXISTS lesson_folders (id TEXT PRIMARY KEY, school_id TEXT NOT NULL, owner_id TEXT NOT NULL, parent_id TEXT,
      name TEXT NOT NULL, position INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS lesson_folders_owner ON lesson_folders(owner_id, school_id);
    CREATE TABLE IF NOT EXISTS lessons (id TEXT PRIMARY KEY, school_id TEXT NOT NULL, owner_id TEXT NOT NULL, folder_id TEXT, title TEXT NOT NULL,
      summary TEXT NOT NULL DEFAULT '', subject TEXT NOT NULL DEFAULT '', grade TEXT NOT NULL DEFAULT '', objectives TEXT NOT NULL DEFAULT '',
      position INTEGER NOT NULL DEFAULT 0, shared INTEGER NOT NULL DEFAULT 0, copied_from TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, archived_at INTEGER);
    CREATE INDEX IF NOT EXISTS lessons_owner ON lessons(owner_id, school_id, folder_id);
    CREATE INDEX IF NOT EXISTS lessons_shared ON lessons(school_id, shared);
    CREATE TABLE IF NOT EXISTS lesson_steps (id TEXT PRIMARY KEY, lesson_id TEXT NOT NULL, position INTEGER NOT NULL DEFAULT 0, kind TEXT NOT NULL,
      title TEXT NOT NULL DEFAULT '', body TEXT NOT NULL DEFAULT '', game_id TEXT, minutes INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS lesson_steps_lesson ON lesson_steps(lesson_id, position);
    CREATE TABLE IF NOT EXISTS class_units (id TEXT PRIMARY KEY, class_id TEXT NOT NULL, name TEXT NOT NULL, position INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS class_lessons (id TEXT PRIMARY KEY, class_id TEXT NOT NULL, lesson_id TEXT NOT NULL, unit_id TEXT, position INTEGER NOT NULL DEFAULT 0,
      opens_at INTEGER, due_at INTEGER, assigned_by TEXT, assigned_at INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS class_lessons_class ON class_lessons(class_id, unit_id, position);`],
  // Step 3: each student's progress on each step of an assigned lesson (done, best game score, play time, written
  // answers and the teacher's feedback, the game made in a "build" step).
  ['0011_progress', `CREATE TABLE IF NOT EXISTS step_progress (class_lesson_id TEXT NOT NULL, step_id TEXT NOT NULL, user_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'started', score INTEGER, label TEXT NOT NULL DEFAULT '', plays INTEGER NOT NULL DEFAULT 0, seconds INTEGER NOT NULL DEFAULT 0,
      answer TEXT NOT NULL DEFAULT '', game_id TEXT, feedback TEXT NOT NULL DEFAULT '', reviewed_at INTEGER, reviewed_by TEXT,
      started_at INTEGER NOT NULL, done_at INTEGER, updated_at INTEGER NOT NULL, PRIMARY KEY (class_lesson_id, step_id, user_id));
    CREATE INDEX IF NOT EXISTS step_progress_user ON step_progress(user_id, updated_at);
    CREATE INDEX IF NOT EXISTS step_progress_review ON step_progress(class_lesson_id, reviewed_at);`],
  // Removing a lesson from a class keeps students' work: the assignment is marked removed (and comes back, with the
  // work, if the lesson is assigned to that class again).
  ['0012_class_lesson_removed', `ALTER TABLE class_lessons ADD COLUMN removed_at INTEGER;`],
  ['0013_orphan_class_rows', `DELETE FROM class_lessons WHERE class_id NOT IN (SELECT id FROM classrooms); DELETE FROM class_units WHERE class_id NOT IN (SELECT id FROM classrooms);`],
  // The site theme a signed-in player picked: '' = same as the device, 'light' or 'dark' (see server/theme.js).
  ['0014_user_theme', `ALTER TABLE users ADD COLUMN theme TEXT NOT NULL DEFAULT '';`],
  // When each session was last used (written at most once a minute), for the session limits in server/auth.js. Sessions
  // open at upgrade time count as used now, and one the new caps would end at once (school students 10 hours, staff and
  // the platform admin 7 days, counted from sign-in) gets one more hour, so the deploy itself signs nobody out mid-lesson.
  ['0015_session_activity', `ALTER TABLE sessions ADD COLUMN last_active INTEGER NOT NULL DEFAULT 0;
    UPDATE sessions SET last_active=CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER);
    UPDATE sessions SET created_at=MAX(created_at, last_active - 9 * 3600000) WHERE user_id IN (SELECT id FROM users WHERE managed_school!=''
      AND role!='admin' AND id NOT IN (SELECT user_id FROM school_members WHERE status='active' AND role!='student'));
    UPDATE sessions SET created_at=MAX(created_at, last_active - 167 * 3600000) WHERE user_id IN (SELECT id FROM users WHERE role='admin'
      OR id IN (SELECT user_id FROM school_members WHERE status='active' AND role!='student'));`],
  // 1 when a staff member or the platform admin last signed in with a password shorter than 12 characters: they are asked
  // to choose a longer one (auth.notePasswordLength). Changing the password clears it.
  ['0016_password_short', `ALTER TABLE users ADD COLUMN password_short INTEGER NOT NULL DEFAULT 0;`],
  // "Share with my classes": games shared with chosen classes (visibility 'class'), one row per (game, class). The list
  // is the owner's explicit choice and only counts while games.visibility='class' and the rule in services/games.js
  // (CLASS_SQL) holds. removed_at/removed_by: a teacher (or school admin) took the game off that class, and the owner
  // can't add it back. games.pending_visibility: what a waiting review is for ('public' | 'school' | 'class'; '' when
  // nothing waits), so an approval applies the audience the builder asked for instead of always 'public'.
  // games.pending_classes: for a waiting 'class' request on a game already live for some classes, the new class list
  // (JSON), applied only when a person approves it. Reviews already waiting at upgrade time get the narrowest audience
  // they could have meant: 'school' for anyone in a school (the old code queued flagged school requests too; a builder
  // can ask for public again), 'public' only for people in no school.
  ['0018_class_sharing', `CREATE TABLE IF NOT EXISTS game_classes (game_id TEXT NOT NULL, class_id TEXT NOT NULL,
      added_by TEXT, added_at INTEGER NOT NULL, removed_by TEXT, removed_at INTEGER, PRIMARY KEY (game_id, class_id));
    CREATE INDEX IF NOT EXISTS game_classes_class ON game_classes(class_id, removed_at);
    ALTER TABLE games ADD COLUMN pending_visibility TEXT NOT NULL DEFAULT '';
    ALTER TABLE games ADD COLUMN pending_classes TEXT NOT NULL DEFAULT '';
    UPDATE games SET pending_visibility = CASE WHEN EXISTS (SELECT 1 FROM school_members sm WHERE sm.user_id=games.owner_id
        AND sm.status='active') THEN 'school' ELSE 'public' END
      WHERE pending_version_id IS NOT NULL;`],
  // One row per Builder build: a message, an automatic follow-on build, or a Continue. Lifecycle for restarts and the
  // live view (server/builder/runner.js), numbers for time estimates. Single app instance only (runner.js header).
  // status: queued | running | interrupted | done | failed | cancelled. end_reason: ok | refused | limit | error |
  // timeout | restart | deleted | banned | disabled | stopped. request: {text, uploadIds, cid, continueOf} (text cleared
  // 7 days after the end). provider: 'ai' | 'blocks' (never a model id). attempt: 1 = first run, 2 = resumed after a
  // restart; a queued row counts the boots that re-ran it. chain: 0 = from a message, 1..3 = automatic follow-on build.
  // base_version: the newest version number when the build started (NULL = no game yet). charged_day: the builder_usage
  // day it was charged to (NULL = not charged). can_continue: 1 = the chat offers "Carry on building" for it.
  // sample: 1 = build sample, 2 = question sample, 0 = not used for estimates.
  ['0019_builder_turns', `CREATE TABLE IF NOT EXISTS builder_turns (
      id TEXT PRIMARY KEY, game_id TEXT NOT NULL, user_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'queued', end_reason TEXT NOT NULL DEFAULT '', request TEXT NOT NULL DEFAULT '{}',
      locale TEXT NOT NULL DEFAULT 'en', pro INTEGER NOT NULL DEFAULT 0, provider TEXT NOT NULL DEFAULT '',
      attempt INTEGER NOT NULL DEFAULT 0, chain INTEGER NOT NULL DEFAULT 0, base_version INTEGER, charged_day TEXT,
      refunded INTEGER NOT NULL DEFAULT 0, can_continue INTEGER NOT NULL DEFAULT 0,
      est_key TEXT NOT NULL DEFAULT '', eta_hi_ms INTEGER NOT NULL DEFAULT 0, eta_over_ms INTEGER NOT NULL DEFAULT 0,
      kind TEXT NOT NULL DEFAULT '', duration_ms INTEGER NOT NULL DEFAULT 0, first_version_ms INTEGER NOT NULL DEFAULT 0,
      versions INTEGER NOT NULL DEFAULT 0, model_calls INTEGER NOT NULL DEFAULT 0, tokens_in INTEGER NOT NULL DEFAULT 0,
      tokens_out INTEGER NOT NULL DEFAULT 0, followups INTEGER NOT NULL DEFAULT 0, sample INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL, started_at INTEGER, ended_at INTEGER, seen_at INTEGER, notified_at INTEGER);
    CREATE INDEX IF NOT EXISTS builder_turns_game ON builder_turns(game_id, created_at);
    CREATE UNIQUE INDEX IF NOT EXISTS builder_turns_one_live ON builder_turns(game_id) WHERE status IN ('queued','running','interrupted');
    CREATE INDEX IF NOT EXISTS builder_turns_owner ON builder_turns(user_id, notified_at, ended_at);
    CREATE INDEX IF NOT EXISTS builder_turns_eta ON builder_turns(est_key, sample, ended_at) WHERE sample > 0;`],
  // Sign in with Google (docs/decisions.md "Sign in with Google"). Rows are found by Google's account id (sub), never by
  // email. One Google account per Oomba account, both ways. Invites are bound to a school email (no link or token);
  // class_id NULL = a staff invite, user_id set = connect this existing school account. 0019 is the Builder's.
  ['0020_google_sign_in', `CREATE TABLE IF NOT EXISTS google_identities (sub TEXT PRIMARY KEY, user_id TEXT NOT NULL UNIQUE,
      email TEXT NOT NULL DEFAULT '', hd TEXT NOT NULL DEFAULT '', linked_by TEXT, created_at INTEGER NOT NULL,
      last_used_at INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS google_invites (id TEXT PRIMARY KEY, school_id TEXT NOT NULL, class_id TEXT,
      role TEXT NOT NULL DEFAULT 'student', email TEXT NOT NULL, roster_name TEXT NOT NULL DEFAULT '',
      grade TEXT NOT NULL DEFAULT '', user_id TEXT, status TEXT NOT NULL DEFAULT 'open', created_by TEXT,
      created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, used_by TEXT, used_at INTEGER, revoked_by TEXT,
      revoked_at INTEGER);
    CREATE INDEX IF NOT EXISTS google_invites_email ON google_invites(email, status);
    CREATE INDEX IF NOT EXISTS google_invites_class ON google_invites(class_id, status);
    CREATE INDEX IF NOT EXISTS google_invites_school ON google_invites(school_id, status);
    CREATE UNIQUE INDEX IF NOT EXISTS google_invites_open ON google_invites(school_id, IFNULL(class_id, ''), email) WHERE status='open';
    ALTER TABLE classrooms ADD COLUMN google_join INTEGER NOT NULL DEFAULT 0;`],
];

db.exec('CREATE TABLE IF NOT EXISTS migrations (name TEXT PRIMARY KEY, applied_at INTEGER NOT NULL)');
export function migrate(extra = []) {
  const applied = new Set(db.prepare('SELECT name FROM migrations').all().map(r => r.name));
  for (const [name, sql] of [...MIGRATIONS, ...extra]) {
    if (applied.has(name)) continue;
    db.transaction(() => { db.exec(sql); db.prepare('INSERT INTO migrations(name, applied_at) VALUES (?, ?)').run(name, now()); })();
  }
}
migrate();

const cache = new Map();
const prep = sql => { let s = cache.get(sql); if (!s) { s = db.prepare(sql); if (cache.size < 500) cache.set(sql, s); } return s; };
export const q = {
  get: (sql, ...p) => prep(sql).get(...p),
  all: (sql, ...p) => prep(sql).all(...p),
  run: (sql, ...p) => prep(sql).run(...p),
};
export const tx = fn => db.transaction(fn)();
export function audit(actorId, action, target = '', details = '') {
  q.run('INSERT INTO audit_log(id, actor_id, action, target, details, created_at) VALUES (?,?,?,?,?,?)', uid(), actorId || null, action, target, typeof details === 'string' ? details : JSON.stringify(details), now());
}
export function setting(key, value) {
  if (value === undefined) { const r = q.get('SELECT value FROM settings WHERE key=?', key); return r ? r.value : null; }
  q.run('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', key, String(value));
  return value;
}
