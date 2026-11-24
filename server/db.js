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

/** Migration 0055: the live version of every game that is public now counts as approved by the team for everyone. Safe
 *  to run again (the tests run it on rows they made). */
export const GRANDFATHER_SQL = `UPDATE game_versions SET review_status='approved', review_report=json_set(
      CASE WHEN json_valid(review_report) THEN review_report ELSE '{}' END,
      '$.was', json_extract(CASE WHEN json_valid(review_report) THEN review_report ELSE '{}' END, '$.by'),
      '$.verdict', 'allowed', '$.by', 'admin', '$.for', 'public', '$.grandfathered', 1)
    WHERE id IN (SELECT published_version_id FROM games WHERE visibility='public' AND published_version_id IS NOT NULL
      AND status IN ('published', 'suspended'))
    AND NOT (review_status='approved' AND json_valid(review_report) AND json_extract(review_report, '$.by')='admin' AND json_extract(review_report, '$.for')='public');`;
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
  // What each Builder message cost and who paid (docs/decisions.md "Paid plans", chunk 1). charged_to: the allowance
  // source that paid ('free' today; later 'family:<id>' | 'school:<id>'), weight: the turns it used (Pro may count
  // more), usd: what the build's own model calls cost, usd_known: 1 when usd was measured (builds from before this
  // migration have 0: /admin/stats estimates them from their token counts). ai_spend_pool: spend per UTC day and money pool
  // ('free' | 'paid'); ai_spend keeps the site total. All spend so far was the free pool's.
  ['0021_turn_cost', `ALTER TABLE builder_turns ADD COLUMN charged_to TEXT NOT NULL DEFAULT 'free';
    ALTER TABLE builder_turns ADD COLUMN weight INTEGER NOT NULL DEFAULT 1;
    ALTER TABLE builder_turns ADD COLUMN usd REAL NOT NULL DEFAULT 0;
    ALTER TABLE builder_turns ADD COLUMN usd_known INTEGER NOT NULL DEFAULT 0;
    CREATE INDEX IF NOT EXISTS builder_turns_charged ON builder_turns(charged_day) WHERE charged_day IS NOT NULL;
    CREATE TABLE IF NOT EXISTS ai_spend_pool (day TEXT NOT NULL, pool TEXT NOT NULL, usd REAL NOT NULL DEFAULT 0,
      calls INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (day, pool));
    INSERT OR IGNORE INTO ai_spend_pool(day, pool, usd, calls) SELECT day, 'free', usd, calls FROM ai_spend;`],
  // Paid plans, chunk 2: the Stripe mirror (docs/decisions.md "Paid plans"). Owners are ('family'|'school', id); every
  // row carries livemode and every query filters on the current key's mode. Stripe ids are case-sensitive TEXT. Times
  // are ms like the rest of the database (Stripe's seconds are converted). Grown-up accounts and family links (chunk 3)
  // add their own migration. billing_subscriptions.payment_pending: a Checkout completed with a delayed payment (ACH)
  // that hasn't arrived yet. billing_events.stripe_customer_id / stripe_object_id: for linking an 'unlinked' event later.
  ['0022_billing_core', `CREATE TABLE IF NOT EXISTS billing_customers (stripe_customer_id TEXT PRIMARY KEY,
      owner_kind TEXT NOT NULL, owner_id TEXT NOT NULL, livemode INTEGER NOT NULL, created_at INTEGER NOT NULL,
      UNIQUE (owner_kind, owner_id, livemode));
    CREATE TABLE IF NOT EXISTS billing_checkouts (owner_kind TEXT NOT NULL, owner_id TEXT NOT NULL, livemode INTEGER NOT NULL,
      session_id TEXT NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY (owner_kind, owner_id, livemode));
    CREATE TABLE IF NOT EXISTS billing_subscriptions (stripe_subscription_id TEXT PRIMARY KEY, stripe_customer_id TEXT NOT NULL,
      owner_kind TEXT NOT NULL, owner_id TEXT NOT NULL, plan TEXT NOT NULL, price_id TEXT, price_lookup_key TEXT, interval TEXT,
      quantity INTEGER DEFAULT 1, pool_quantity INTEGER DEFAULT 0, next_quantity INTEGER,
      status TEXT NOT NULL, collection_method TEXT, current_period_start INTEGER, current_period_end INTEGER,
      cancel_at_period_end INTEGER NOT NULL DEFAULT 0, grace_until INTEGER, payment_pending INTEGER NOT NULL DEFAULT 0,
      orphaned_at INTEGER, flag TEXT, livemode INTEGER NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS billing_subs_owner ON billing_subscriptions(owner_kind, owner_id, livemode);
    CREATE INDEX IF NOT EXISTS billing_subs_status ON billing_subscriptions(livemode, status);
    CREATE TABLE IF NOT EXISTS billing_events (event_id TEXT PRIMARY KEY, type TEXT NOT NULL, livemode INTEGER,
      api_version TEXT, stripe_created INTEGER, received_at INTEGER NOT NULL, result TEXT,
      stripe_object_id TEXT, stripe_subscription_id TEXT, stripe_customer_id TEXT);
    CREATE INDEX IF NOT EXISTS billing_events_result ON billing_events(result, received_at);
    CREATE TABLE IF NOT EXISTS billing_grants (id TEXT PRIMARY KEY, owner_kind TEXT NOT NULL, owner_id TEXT NOT NULL,
      plan TEXT NOT NULL, seats INTEGER, until INTEGER NOT NULL, reason TEXT, granted_by TEXT, created_at INTEGER NOT NULL,
      revoked_at INTEGER);
    CREATE INDEX IF NOT EXISTS billing_grants_owner ON billing_grants(owner_kind, owner_id);`],
  // Paid plans, chunk 3: grown-up accounts and family links (docs/decisions.md "Paid plans"; server/services/family.js).
  // users.account_type: 'kid' (every account so far) or 'grownup'. A family belongs to one grown-up. family_children:
  // 'pending' until the child says yes, then 'linked'; unlinked rows keep unlinked_at (deleted 90 days later). At most
  // one live row per child (pending or linked), so a child is in one family and answers one request at a time.
  // family_link_codes: only an HMAC of the code is stored; valid 24 hours (services/family.js CODE_TTL), single use, one open per child.
  // link_reports: a child's Report, for the platform admin's queue (no free text).
  ['0023_families', `ALTER TABLE users ADD COLUMN account_type TEXT NOT NULL DEFAULT 'kid';
    CREATE TABLE IF NOT EXISTS families (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL UNIQUE REFERENCES users(id), created_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS family_children (family_id TEXT NOT NULL REFERENCES families(id), child_id TEXT NOT NULL REFERENCES users(id),
      status TEXT NOT NULL, requested_at INTEGER NOT NULL, linked_at INTEGER, unlinked_at INTEGER, PRIMARY KEY (family_id, child_id));
    CREATE UNIQUE INDEX IF NOT EXISTS family_children_live ON family_children(child_id) WHERE unlinked_at IS NULL;
    CREATE TABLE IF NOT EXISTS family_link_codes (code_hash TEXT PRIMARY KEY, child_id TEXT NOT NULL, created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL, used_at INTEGER, used_by TEXT);
    CREATE INDEX IF NOT EXISTS family_link_codes_child ON family_link_codes(child_id, expires_at);
    CREATE TABLE IF NOT EXISTS link_reports (id TEXT PRIMARY KEY, child_id TEXT NOT NULL, family_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open', created_at INTEGER NOT NULL, resolved_by TEXT, resolved_at INTEGER);
    CREATE INDEX IF NOT EXISTS link_reports_status ON link_reports(status, created_at);`],
  // Paid plans, chunk 4: family checkout (docs/decisions.md "Paid plans"). users.billing_tester: while the Stripe key is
  // a test key, only these accounts may check out (set on /admin, D14). sessions.reauth_at: when the password was last
  // typed again on this sign-in (checkout and the Customer Portal need it within 10 minutes). The latest invoice of a
  // subscription (for /admin/billing: what was paid, when and why, so the refund window shows) and the payment a dispute
  // or an early fraud warning was about (risk_payment_intent, for the Refund link). builder_turns_charged_to: the family
  // month's sums.
  ['0024_family_checkout', `ALTER TABLE users ADD COLUMN billing_tester INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE sessions ADD COLUMN reauth_at INTEGER;
    ALTER TABLE billing_subscriptions ADD COLUMN latest_invoice_id TEXT;
    ALTER TABLE billing_subscriptions ADD COLUMN latest_paid_at INTEGER;
    ALTER TABLE billing_subscriptions ADD COLUMN latest_billing_reason TEXT;
    ALTER TABLE billing_subscriptions ADD COLUMN latest_amount_paid INTEGER;
    ALTER TABLE billing_subscriptions ADD COLUMN risk_payment_intent TEXT;
    CREATE INDEX IF NOT EXISTS builder_turns_charged_to ON builder_turns(charged_to, charged_day);`],
  // Paid plans, chunk 5: school plans (docs/decisions.md "Paid plans" §5; server/services/school-billing.js).
  // billing_subscriptions: pool_quantity (already there) is the highest quantity paid (card) or invoiced (send_invoice)
  // in the period that starts at pool_period_start; next_quantity (already there) is next year's seats, applied just
  // before the renewal. latest_invoice_status and open_invoices (JSON [{id, amount_due, due_date}], send_invoice only)
  // show what is unpaid on the Billing tab and /admin/billing ("Mark paid by check").
  // billing_requests: a school's request for an invoice; contact_email and address_json are deleted 2 years after
  // closed_at. The school's pool is counted from builder_turns (charged_to 'school:<id>', refunds given back), like the
  // family's extras, so there is no separate counter table.
  ['0025_school_billing', `ALTER TABLE billing_subscriptions ADD COLUMN pool_period_start INTEGER;
    ALTER TABLE billing_subscriptions ADD COLUMN latest_invoice_status TEXT;
    ALTER TABLE billing_subscriptions ADD COLUMN open_invoices TEXT;
    CREATE TABLE IF NOT EXISTS billing_requests (id TEXT PRIMARY KEY, school_id TEXT NOT NULL, requested_by TEXT NOT NULL,
      seats INTEGER NOT NULL, po TEXT NOT NULL DEFAULT '', contact_name TEXT, contact_email TEXT, address_json TEXT,
      tax_exempt_claimed INTEGER NOT NULL DEFAULT 0, note TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'open',
      livemode INTEGER NOT NULL DEFAULT 0, stripe_subscription_id TEXT, created_at INTEGER NOT NULL, closed_at INTEGER, closed_by TEXT);
    CREATE INDEX IF NOT EXISTS billing_requests_school ON billing_requests(school_id, status);
    CREATE INDEX IF NOT EXISTS billing_requests_status ON billing_requests(status, created_at);`],
  // "Set up my school" requests from /teachers (server/services/school-requests.js; docs/decisions.md "Doors for
  // grown-ups"). An adult's work email, kept only here and deleted 1 year after the request is closed. status: 'open',
  // 'done' or 'declined'; school_id: the school the platform admin made for it. user_id: the sender's account, if any.
  ['0026_school_requests', `CREATE TABLE IF NOT EXISTS school_requests (id TEXT PRIMARY KEY, school_name TEXT NOT NULL,
      role TEXT NOT NULL, email TEXT NOT NULL, students INTEGER NOT NULL, country TEXT NOT NULL, locale TEXT NOT NULL DEFAULT '',
      user_id TEXT, status TEXT NOT NULL DEFAULT 'open', created_at INTEGER NOT NULL, closed_at INTEGER, closed_by TEXT, school_id TEXT);
    CREATE INDEX IF NOT EXISTS school_requests_status ON school_requests(status, created_at);`],
  // Funnel step counts for /admin/stats (server/services/funnel.js; docs/decisions.md "Funnel counts"): one daily total
  // per step, like the traffic table. No user, family, school or class ids: nothing here can follow a person.
  ['0027_funnel', `CREATE TABLE IF NOT EXISTS funnel_counts (day TEXT NOT NULL, step TEXT NOT NULL, n INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY(day, step));`],
  // The /family checklist (routes/family.js familyChecklist): when the grown-up said a free family is fine and hid the
  // "Pick a plan" step. On the grown-up's own family row; NULL = not hidden. Nothing about the child.
  ['0028_family_checklist', `ALTER TABLE families ADD COLUMN checklist_hidden_at INTEGER;`],
  // "Ask my admin" (server/services/plan-asks.js; docs/decisions.md "Navigation shells"): a teacher asks their school's
  // admins for a School plan. Ids and dates only, never a message. One open ask per teacher per school; closed when an
  // admin dismisses it ('dismissed') or the school's plan comes on ('plan'); deleted 90 days after it was closed.
  ['0029_plan_asks', `CREATE TABLE IF NOT EXISTS school_plan_asks (id TEXT PRIMARY KEY, school_id TEXT NOT NULL, teacher_id TEXT NOT NULL,
      created_at INTEGER NOT NULL, closed_at INTEGER, closed_by TEXT, close_reason TEXT);
    CREATE UNIQUE INDEX IF NOT EXISTS school_plan_asks_open ON school_plan_asks(school_id, teacher_id) WHERE closed_at IS NULL;
    CREATE INDEX IF NOT EXISTS school_plan_asks_closed ON school_plan_asks(closed_at) WHERE closed_at IS NOT NULL;`],
  // Parent-made child accounts (services/family.js createChildAccount; docs/decisions.md "Parent-made child accounts"),
  // behind PARENT_MADE_CHILDREN. users.made_by / made_by_family / made_at: which grown-up (and family) made the account,
  // never cleared (also after an unlink or a deletion, so the yearly cap and the admin still count it). None of these
  // changes how the account is treated: it is an ordinary kid account. made_note_seen_at: the child answered the
  // first-sign-in card; pw_reset_note_at: the grown-up set a new password, told to the child once. family_notice_acks:
  // the record that the grown-up acknowledged the notice (notice version, method) and made the guardian statement; a
  // record, not a consent. link_reports.parent_made: the child reported the grown-up who made their account.
  // reserved_names: a deleted child's old username, kept from sign-up until `until`.
  ['0030_parent_made', `ALTER TABLE users ADD COLUMN made_by TEXT;
    ALTER TABLE users ADD COLUMN made_by_family TEXT;
    ALTER TABLE users ADD COLUMN made_at INTEGER;
    ALTER TABLE users ADD COLUMN made_note_seen_at INTEGER;
    ALTER TABLE users ADD COLUMN pw_reset_note_at INTEGER;
    CREATE INDEX IF NOT EXISTS users_made_by_family ON users(made_by_family, made_at) WHERE made_by_family IS NOT NULL;
    CREATE TABLE IF NOT EXISTS family_notice_acks (id TEXT PRIMARY KEY, child_id TEXT NOT NULL UNIQUE, family_id TEXT NOT NULL,
      grownup_id TEXT NOT NULL, notice_version TEXT NOT NULL, method TEXT NOT NULL, guardian_statement INTEGER NOT NULL, created_at INTEGER NOT NULL);
    ALTER TABLE link_reports ADD COLUMN parent_made INTEGER NOT NULL DEFAULT 0;
    CREATE TABLE IF NOT EXISTS reserved_names (name TEXT PRIMARY KEY COLLATE NOCASE, until INTEGER NOT NULL);`],
  // Parent-made child accounts, part 2. family_children.made_link: 1 only on the row createChildAccount wrote, for as long
  // as that link lasts; a code link (also the same family linking again after the child left) writes 0, so the made-only
  // powers (Switch, Change password, What we keep, Delete) never come back once the child has cut the adult out.
  // sessions.via: 'switch' for a sign-in the grown-up's Switch started (routes/family.js), else NULL; the child's
  // first-sign-in card and the new-password note are only answered or used up in a sign-in the child made themselves.
  // sessions.made_card_ok: OK on that card in a Switch sign-in, which hides it for that sign-in only.
  ['0031_made_link', `ALTER TABLE family_children ADD COLUMN made_link INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE sessions ADD COLUMN via TEXT;
    ALTER TABLE sessions ADD COLUMN made_card_ok INTEGER NOT NULL DEFAULT 0;
    UPDATE family_children SET made_link=1 WHERE unlinked_at IS NULL AND status='linked' AND EXISTS (SELECT 1 FROM users u
      WHERE u.id=family_children.child_id AND u.made_by_family=family_children.family_id AND u.made_at=family_children.linked_at);`],
  // The Builder's web searches, for the admin to review (server/builder/search.js). Never a user id or name: the build
  // (turn_id) and the game are enough to follow one up. A query that looks like personal details is stored as
  // [redacted]. Kept 90 days.
  ['0032_builder_searches', `CREATE TABLE IF NOT EXISTS builder_searches (id TEXT PRIMARY KEY, turn_id TEXT, game_id TEXT,
      day TEXT NOT NULL, query TEXT NOT NULL, domains TEXT NOT NULL DEFAULT '[]', results INTEGER NOT NULL DEFAULT 0,
      flagged INTEGER NOT NULL DEFAULT 0, reason TEXT, created_at INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS builder_searches_at ON builder_searches(created_at);
    CREATE INDEX IF NOT EXISTS builder_searches_flagged ON builder_searches(flagged, created_at);`],
  // Speech to text use per UTC day and builder (server/services/stt-usage.js): clips and counted seconds only, never
  // audio or words. For the per-builder daily cap and the site-wide daily minutes cap, which survive a restart. Kept 3 days.
  ['0033_stt_usage', `CREATE TABLE IF NOT EXISTS stt_usage (day TEXT NOT NULL, user_id TEXT NOT NULL, clips INTEGER NOT NULL DEFAULT 0,
      seconds REAL NOT NULL DEFAULT 0, PRIMARY KEY(day, user_id));`],
  // Live speech to text sessions that may still have their clip uploaded once instead (server/services/stt-live.js):
  // the session's random id, whose it is, and until when. Ids only, never audio or words; in the database so the one
  // upload after a restart (the reason the live link failed) is not counted as a second clip. Rows go when used or late.
  ['0034_stt_live', `CREATE TABLE IF NOT EXISTS stt_live (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, game_id TEXT NOT NULL,
      state TEXT NOT NULL, until INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS stt_live_until ON stt_live(until);`],
  // Grown-ups can build (docs/decisions.md "Grown-ups can build"). games.visibility gets a new value, 'family' (the owner
  // and their linked children), with no new column. Grown-ups get a friend code, for connections with OTHER grown-ups
  // only (services/friends.js keeps adults and kids apart in both directions): the backfill below gives every grown-up
  // without one a new unique code. Defence in depth: no friendship (or request) between a grown-up and a kid may exist.
  ['0035_grownup_builder', `DELETE FROM friends WHERE EXISTS (SELECT 1 FROM users a, users b
      WHERE a.id=friends.user_id AND b.id=friends.friend_id AND (a.account_type='grownup') <> (b.account_type='grownup'));`,
  conn => {
    for (const r of conn.prepare("SELECT id FROM users WHERE account_type='grownup' AND friend_code IS NULL AND is_guest=0").all()) {
      conn.prepare('UPDATE users SET friend_code=? WHERE id=?').run(newFriendCode(conn), r.id);
    }
  }],
  // The player's own Oomba character (server/services/character.js): a small JSON parts spec from the kit's own lists
  // (species, body, skin tone 0-7, hair, eyes, outfit, colours, one accessory, Bold wear), never a picture or a name.
  // NULL = not designed yet (games then get the kit's default look). Deleted with the account row. Adds the column only
  // when it is missing: a development database may already have it from before this migration was renamed (it was 0035).
  ['0036_character_spec', '', conn => {
    if (!conn.prepare('PRAGMA table_info(users)').all().some(c => c.name === 'character_spec')) conn.exec('ALTER TABLE users ADD COLUMN character_spec TEXT;');
  }],
  // Oomba Live (docs/decisions.md "Oomba Live"; server/services/classlive-*.js). Sessions themselves live in memory only;
  // these tables keep what outlives one:
  // - live_sets: question sets teachers and grown-ups write (1-50 items, checked by classlive-sets.js);
  // - live_runs: one row per ended session: counts and the host-written question texts, never a code, a nickname, a
  //   guest identifier or a name. Runs with no class go after 90 days (classlive-results.js retention);
  // - live_run_scores: only active students of the run's class, in a class run hosted by one of its teachers;
  // - live_reports: players' reports with fixed reasons, never who reported. Resolved ones go after a year.
  ['0037_live', `CREATE TABLE IF NOT EXISTS live_sets (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, school_id TEXT,
      title TEXT NOT NULL, subject TEXT NOT NULL DEFAULT '', grade TEXT NOT NULL DEFAULT '', lang TEXT NOT NULL DEFAULT 'en',
      items TEXT NOT NULL, lesson_id TEXT, shared INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, archived_at INTEGER);
    CREATE INDEX IF NOT EXISTS live_sets_owner ON live_sets(owner_id, archived_at);
    CREATE INDEX IF NOT EXISTS live_sets_school ON live_sets(school_id, shared);
    CREATE TABLE IF NOT EXISTS live_runs (id TEXT PRIMARY KEY, host_id TEXT NOT NULL, class_id TEXT, class_lesson_id TEXT, step_id TEXT,
      audience TEXT NOT NULL, mode TEXT NOT NULL, game_id TEXT, version_id TEXT, set_id TEXT, title TEXT NOT NULL DEFAULT '',
      started_at INTEGER NOT NULL, ended_at INTEGER NOT NULL, players INTEGER NOT NULL DEFAULT 0, guests INTEGER NOT NULL DEFAULT 0,
      items TEXT NOT NULL DEFAULT '[]', scored_by TEXT NOT NULL DEFAULT 'server');
    CREATE INDEX IF NOT EXISTS live_runs_host ON live_runs(host_id, ended_at);
    CREATE INDEX IF NOT EXISTS live_runs_class ON live_runs(class_id, ended_at);
    CREATE TABLE IF NOT EXISTS live_run_scores (run_id TEXT NOT NULL, user_id TEXT NOT NULL, score INTEGER NOT NULL DEFAULT 0,
      rank INTEGER NOT NULL DEFAULT 0, correct INTEGER NOT NULL DEFAULT 0, answered INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (run_id, user_id));
    CREATE INDEX IF NOT EXISTS live_run_scores_user ON live_run_scores(user_id);
    CREATE TABLE IF NOT EXISTS live_reports (id TEXT PRIMARY KEY, host_id TEXT NOT NULL, game_id TEXT, version_id TEXT, set_id TEXT,
      reason TEXT NOT NULL, items TEXT NOT NULL DEFAULT '', created_at INTEGER NOT NULL, resolved_at INTEGER, resolved_by TEXT);
    CREATE INDEX IF NOT EXISTS live_reports_open ON live_reports(resolved_at, created_at);`],
  // Oomba Live part 3: teams and teacher tools (docs/decisions.md "Oomba Live, part 3"; legal-review item 42).
  // - live_runs.teams / settings: the run's team results (preset numbers and scores, never names) and its game settings;
  // - live_run_scores.team / bonus / marks: a class student's team, bonus points (never in the gradebook score) and
  //   per-question marks ('1' right, '0' wrong, '-' none);
  // - live_class_teams + live_class_team_cfg: a class's saved teams (student -> team number) and their setup, kept with
  //   the class and deleted with the membership, the class or the account;
  // - live_prefs: a host's own remembered game settings.
  ['0038_live_teams', `ALTER TABLE live_runs ADD COLUMN teams TEXT NOT NULL DEFAULT '';
    ALTER TABLE live_runs ADD COLUMN settings TEXT NOT NULL DEFAULT '';
    ALTER TABLE live_run_scores ADD COLUMN team INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE live_run_scores ADD COLUMN bonus INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE live_run_scores ADD COLUMN marks TEXT NOT NULL DEFAULT '';
    CREATE TABLE IF NOT EXISTS live_class_teams (class_id TEXT NOT NULL, user_id TEXT NOT NULL, team INTEGER NOT NULL, PRIMARY KEY (class_id, user_id));
    CREATE INDEX IF NOT EXISTS live_class_teams_user ON live_class_teams(user_id);
    CREATE TABLE IF NOT EXISTS live_class_team_cfg (class_id TEXT PRIMARY KEY, n INTEGER NOT NULL, presets TEXT NOT NULL,
      scoring TEXT NOT NULL DEFAULT 'avg', saved_by TEXT, saved_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS live_prefs (user_id TEXT PRIMARY KEY, prefs TEXT NOT NULL, updated_at INTEGER NOT NULL);`],
  // Per-student support in a class's live games (extra time, read aloud, simple view). Written only while
  // LIVE_SAVE_SUPPORT=1 (legal-review item 42); seen only by the class's teachers; deleted with the membership, the class
  // or the account, or on demand ("Clear support").
  ['0039_live_support', `CREATE TABLE IF NOT EXISTS live_support (class_id TEXT NOT NULL, user_id TEXT NOT NULL,
      extra_time INTEGER NOT NULL DEFAULT 100, read_aloud INTEGER NOT NULL DEFAULT 0, simple INTEGER NOT NULL DEFAULT 0,
      set_by TEXT, updated_at INTEGER NOT NULL, PRIMARY KEY (class_id, user_id));
    CREATE INDEX IF NOT EXISTS live_support_user ON live_support(user_id);`],
  // Homework from a question set (LIVE_HOMEWORK): a lesson step of kind 'quiz' keeps the set it came from and a snapshot
  // of its items; step_progress.marks keeps the student's per-question marks.
  ['0040_quiz_steps', `ALTER TABLE lesson_steps ADD COLUMN set_id TEXT;
    ALTER TABLE lesson_steps ADD COLUMN items TEXT NOT NULL DEFAULT '';
    ALTER TABLE step_progress ADD COLUMN marks TEXT NOT NULL DEFAULT '';`],
  // Who ran a live game with co-hosts: joins, leaves, removals, handoffs and key actions (docs/decisions.md "Oomba Live,
  // part 4"; legal-review item 43). Only runs that had a co-host. actor_id: an adult (host or co-host); target_user: a
  // class student, only in class runs (else NULL; never a guest, a nickname or a seat token); other_id: the other adult
  // in a co-host event; detail: a small number or token, never text anyone typed. Follows live_runs.
  ['0041_live_cohost', `CREATE TABLE IF NOT EXISTS live_run_log (run_id TEXT NOT NULL, i INTEGER NOT NULL, at INTEGER NOT NULL,
      actor_id TEXT, action TEXT NOT NULL, target_user TEXT, other_id TEXT, detail TEXT NOT NULL DEFAULT '',
      PRIMARY KEY (run_id, i));
    CREATE INDEX IF NOT EXISTS live_run_log_actor ON live_run_log(actor_id);
    CREATE INDEX IF NOT EXISTS live_run_log_target ON live_run_log(target_user);
    CREATE INDEX IF NOT EXISTS live_run_log_other ON live_run_log(other_id);`],
  // AI voices (docs/decisions.md "AI voices"; server/services/tts.js): the audio cache on disk (<dataDir>/tts) and its
  // index, and the site's daily use. Never the text, a user id or an address: a row has the audio's hash, sizes and
  // which voice made it. The admin's choices live in settings ('tts.voices').
  ['0042_tts', `CREATE TABLE IF NOT EXISTS tts_cache (hash TEXT PRIMARY KEY, bytes INTEGER NOT NULL, chars INTEGER NOT NULL,
      provider TEXT NOT NULL, model TEXT NOT NULL, voice TEXT NOT NULL, locale TEXT NOT NULL, role TEXT NOT NULL,
      pinned INTEGER NOT NULL DEFAULT 0, hits INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, last_used INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS tts_cache_lru ON tts_cache(pinned, last_used);
    CREATE TABLE IF NOT EXISTS tts_usage (day TEXT PRIMARY KEY, calls INTEGER NOT NULL DEFAULT 0, chars INTEGER NOT NULL DEFAULT 0,
      hits INTEGER NOT NULL DEFAULT 0, fails INTEGER NOT NULL DEFAULT 0);`],
  // Game polls (services/polls.js): how many players chose each side of an item, and who already chose (one vote per
  // player and seat per item; a seat is a pass-and-play player on one device).
  ['0043_game_polls', `CREATE TABLE IF NOT EXISTS game_polls (game_id TEXT NOT NULL, item TEXT NOT NULL, a INTEGER NOT NULL DEFAULT 0,
      b INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (game_id, item));
    CREATE TABLE IF NOT EXISTS game_poll_votes (game_id TEXT NOT NULL, item TEXT NOT NULL, user_id TEXT NOT NULL, seat INTEGER NOT NULL,
      choice INTEGER NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (game_id, item, user_id, seat));`],
  // CS Quest platform slice (docs/cs-quest.md; the curriculum materialiser fills these; empty = today's behaviour):
  // - lesson_steps.options: the game step's lesson parameters as a query string (chapter=&band=&mode=&level=&lock=,
  //   services/play-params.js), appended to the Play link and signed into the frame token as BRB.params;
  // - lesson_steps.standards: a comma list of CSTA ids (server/standards/csta.js) on game, question and build steps;
  // - lesson_steps.template: the Studio template a build step starts from (builder/catalog.js TEMPLATE_KEYS);
  // - lesson_steps.rubric: JSON [{ line, ids, levels }] on question and build steps; the teacher's 0-3 mark per line
  //   goes in step_progress.marks (one character per line: 0-3, '-' not marked; quiz steps keep their 1/0/- there);
  // - lessons.template_key / template_version: which catalogue lesson (and version) a library copy was made from.
  // Each column is added only when missing, so a database that already has one is left alone.
  ['0044_cs_quest_steps', '', conn => {
    const add = (table, col, type) => { if (!conn.prepare(`PRAGMA table_info(${table})`).all().some(c => c.name === col)) conn.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${type};`); };
    add('lesson_steps', 'options', "TEXT NOT NULL DEFAULT ''");
    add('lesson_steps', 'standards', "TEXT NOT NULL DEFAULT ''");
    add('lesson_steps', 'template', "TEXT NOT NULL DEFAULT ''");
    add('lesson_steps', 'rubric', "TEXT NOT NULL DEFAULT ''");
    add('lessons', 'template_key', "TEXT NOT NULL DEFAULT ''");
    add('lessons', 'template_version', 'INTEGER NOT NULL DEFAULT 0');
  }],
  // The course flow (services/courses.js, docs/decisions.md "Course flow"): per player and course step, when the slides
  // were read, when the quick check was passed (and the best score of 3), when the game module was opened from the
  // step; and the grade band the player picked for the course. Removed with the account (services/account-delete.js).
  ['0045_course_progress', `CREATE TABLE IF NOT EXISTS course_progress (user_id TEXT NOT NULL, course TEXT NOT NULL, step TEXT NOT NULL,
      band TEXT NOT NULL, read_at INTEGER, checked_at INTEGER, check_score INTEGER NOT NULL DEFAULT 0, played_at INTEGER,
      PRIMARY KEY (user_id, course, step));
    CREATE TABLE IF NOT EXISTS course_bands (user_id TEXT NOT NULL, course TEXT NOT NULL, band TEXT NOT NULL, updated_at INTEGER NOT NULL,
      PRIMARY KEY (user_id, course));`],
  // A course step used to complete when its game module was merely opened (played_at). played_at now means only
  // "started"; a step with a game completes when the game itself reports the assigned chapter finished, recorded
  // here (set by POST /api/courses/:slug/:step/complete from the play page's brb:gameover). No backfill: a step
  // that was only ever opened is not finished, and there is no way to tell the two apart in the old rows.
  ['0046_course_completed_at', `ALTER TABLE course_progress ADD COLUMN completed_at INTEGER;`],
  // Course-only games (built solely as a course's game modules: Cyber Defenders' Trick Inbox and Escape the Post
  // Office) carry course_only=1: they are played only inside their course and stay out of every public catalogue
  // surface (services/games.js NOT_COURSE, the sitemap, the /g page redirect). Set here for existing databases and
  // in the seed JSONs ("course_only": true, scripts/import-game.js) for fresh ones.
  ['0047_course_only_games', '', conn => {
    if (!conn.prepare('PRAGMA table_info(games)').all().some(c => c.name === 'course_only')) conn.exec('ALTER TABLE games ADD COLUMN course_only INTEGER NOT NULL DEFAULT 0;');
    conn.exec(`UPDATE games SET course_only=1 WHERE slug IN ('trick-inbox', 'escape-the-post-office')`);
  }],
  // Number Quest's Duolingo-lite progress layer (spec §6; services/number-quest-progress.js). Feature-scoped:
  // every row is keyed by course and the service only ever writes course='number-quest', so CS Quest and Cyber
  // Defenders progress (course_progress / course_bands above) is untouched. Four small tables:
  // - nq_xp_events: the Tally Marks ledger, one row per distinct thing done (UNIQUE on user+course+kind+ref is
  //   what makes an award idempotent: doing the same check again never pays twice, and the amount never depends
  //   on the score or the number of tries — marks are for doing, not for being right first time);
  // - nq_daily_goals: the student's own daily goal, 1-3 activities (one row per player);
  // - nq_daily_activity: one row per distinct activity on a day (day = UTC date, db.js `today`), so a day's
  //   count is COUNT(*) and meeting the goal is count >= goal. Nothing is stored for a missed day: no streak
  //   can break, because no streak is kept;
  // - nq_laps: one row per completed mastery lap of a unit (tier + unit number + lap 1-3).
  // Removed with the account (services/account-delete.js) and carried over on a school-account merge.
  ['0048_number_quest_progress', `
    CREATE TABLE IF NOT EXISTS nq_xp_events (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, course TEXT NOT NULL,
      kind TEXT NOT NULL, ref TEXT NOT NULL, marks INTEGER NOT NULL, day TEXT NOT NULL, created_at INTEGER NOT NULL,
      UNIQUE (user_id, course, kind, ref));
    CREATE INDEX IF NOT EXISTS nq_xp_user ON nq_xp_events(user_id, course);
    CREATE TABLE IF NOT EXISTS nq_daily_goals (user_id TEXT NOT NULL, course TEXT NOT NULL,
      goal INTEGER NOT NULL DEFAULT 1, updated_at INTEGER NOT NULL, PRIMARY KEY (user_id, course));
    CREATE TABLE IF NOT EXISTS nq_daily_activity (user_id TEXT NOT NULL, course TEXT NOT NULL, day TEXT NOT NULL,
      ref TEXT NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY (user_id, course, day, ref));
    CREATE TABLE IF NOT EXISTS nq_laps (user_id TEXT NOT NULL, course TEXT NOT NULL, tier TEXT NOT NULL,
      unit INTEGER NOT NULL, lap INTEGER NOT NULL, completed_at INTEGER NOT NULL,
      PRIMARY KEY (user_id, course, tier, unit, lap));`],
  // Tally's Sorting Game (spec §4; services/number-quest-placement.js). Feature-scoped the same way:
  // - nq_placement: one row per student — the grade seed (never a birthday), the four strand rungs as JSON,
  //   the start node, how it got there (sorting-game / beginning door / retake / grown-up override), the
  //   soft-landing state, and whether a teacher/parent has disabled the game for this student;
  // - nq_sort_runs: one adaptive run (or one unit test-out) in flight or finished — the staircase state as
  //   JSON plus the item currently on screen, so grading stays on the server and a run survives a reload;
  // - nq_testout: units the student has demonstrated with the 5-item test-out (spec §4.6). A stone is never
  //   written here: stones live in course_progress and are earned by doing the unit's mission.
  // Removed with the account (services/account-delete.js).
  ['0049_number_quest_placement', `
    CREATE TABLE IF NOT EXISTS nq_placement (user_id TEXT PRIMARY KEY, course TEXT NOT NULL,
      grade INTEGER, rungs TEXT, start_node TEXT, source TEXT NOT NULL DEFAULT 'sorting-game',
      disabled INTEGER NOT NULL DEFAULT 0, start_fails INTEGER NOT NULL DEFAULT 0,
      soft_land_node TEXT, updated_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS nq_sort_runs (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, course TEXT NOT NULL,
      kind TEXT NOT NULL, unit INTEGER, seed TEXT NOT NULL, state TEXT NOT NULL,
      current_item TEXT, status TEXT NOT NULL DEFAULT 'active', created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS nq_sort_runs_user ON nq_sort_runs(user_id, course, status);
    CREATE TABLE IF NOT EXISTS nq_testout (user_id TEXT NOT NULL, course TEXT NOT NULL, tier TEXT NOT NULL,
      unit INTEGER NOT NULL, passed_at INTEGER NOT NULL, PRIMARY KEY (user_id, course, tier, unit));`],
  // Greg's addendum (2026-11-04 20:57): guests cannot complete courses. A guest's earned course facts —
  // a check passed ('check', with its score), a game module entered from the step ('played'), a module
  // the game reported won ('win') — are kept HERE, never in course_progress, so a guest's street shows
  // nothing completed and no marks, laps, placement or grade are recorded. The win is honoured when the
  // student signs in: services/courses.js applyPendingWins turns a stashed 'win' into the step's real
  // progress (and the check that led to it), then clears the facts. Removed with the account.
  ['0050_course_pending_wins', `
    CREATE TABLE IF NOT EXISTS course_pending_wins (user_id TEXT NOT NULL, course TEXT NOT NULL,
      step TEXT NOT NULL, kind TEXT NOT NULL, score INTEGER, created_at INTEGER NOT NULL,
      PRIMARY KEY (user_id, course, step, kind));`],
  // Greg's addendum (2026-11-04 20:55): the student's grade is stored and moves with time. nq_placement.grade
  // becomes the DECLARED grade and this column the date it was declared; the current grade is derived
  // (declared + 1 per September 1 rollover since the declaration, capped at grade 8) by
  // services/number-quest-placement.js deriveGrade, never stored frozen. Existing rows start their clock
  // at their last placement update.
  ['0051_nq_grade_declared_at', `
    ALTER TABLE nq_placement ADD COLUMN grade_declared_at INTEGER;
    UPDATE nq_placement SET grade_declared_at = updated_at WHERE grade IS NOT NULL;`],
  // Brain Breaks (Oomba Breathe & Bend, the /move area): one row per finished episode per signed-in,
  // non-guest user, written only when playback reaches the end of the episode's Rest segment
  // (services/move.js). Guests store nothing.
  ['0052_brain_breaks', `CREATE TABLE IF NOT EXISTS move_completions (user_id TEXT NOT NULL, episode TEXT NOT NULL,
    completed_at INTEGER NOT NULL, PRIMARY KEY(user_id, episode));`],
  // Story Builder (docs/story-builder.md; services/story-jobs.js): one row per story video and its job. status walks
  // queued -> writing -> voicing -> rendering -> assembling -> done (or failed); progress is 0..1 for the page's bar;
  // script is the checked story JSON; meta the timings and render numbers. share: private | pending (a kid asked, a
  // linked grown-up or their teacher must say yes) | shared (anyone with the link). worker/heartbeat_at: which worker
  // runs it and when it last said so (a job whose worker stopped is put back in the queue). Removed with the account.
  ['0053_stories', `CREATE TABLE IF NOT EXISTS stories (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, idea TEXT NOT NULL,
      age_band TEXT NOT NULL DEFAULT 'all', seconds INTEGER NOT NULL DEFAULT 60, locale TEXT NOT NULL DEFAULT 'en',
      status TEXT NOT NULL DEFAULT 'queued', progress REAL NOT NULL DEFAULT 0, error TEXT NOT NULL DEFAULT '',
      title TEXT NOT NULL DEFAULT '', script TEXT NOT NULL DEFAULT '', meta TEXT NOT NULL DEFAULT '{}',
      share TEXT NOT NULL DEFAULT 'private', approved_by TEXT, approved_at INTEGER, attempts INTEGER NOT NULL DEFAULT 0,
      worker TEXT NOT NULL DEFAULT '', heartbeat_at INTEGER, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
      started_at INTEGER, finished_at INTEGER);
    CREATE INDEX IF NOT EXISTS stories_owner ON stories(owner_id, created_at);
    CREATE INDEX IF NOT EXISTS stories_status ON stories(status, created_at);`],
  // Story Builder choices and edits (docs/story-builder.md "Choices" and "Changing a story"; services/story-options.js,
  // story-jobs.js). style/tone/voice/music: closed lists (old rows get the original bedtime + music box). characters,
  // lesson: the optional short texts (screened like the idea). version: the finished video's number (1, then +1 per
  // remake). remake: the change waiting or being made (JSON), with its own small state (remake_status '' | queued |
  // working | failed) beside the story's, so the finished video keeps playing (and stays shared) while a new one is
  // made; remake_at: when it was asked for (queue order). story_edits: one row per change asked for, for the daily
  // limits (a rewrite counts like a new story; words, voice and music changes have their own allowance). Kept when a
  // story is deleted (deleting can't reset a limit); removed with the account.
  ['0054_story_options', `
    ALTER TABLE stories ADD COLUMN style TEXT NOT NULL DEFAULT 'bedtime';
    ALTER TABLE stories ADD COLUMN tone TEXT NOT NULL DEFAULT 'cozy';
    ALTER TABLE stories ADD COLUMN voice TEXT NOT NULL DEFAULT 'auto';
    ALTER TABLE stories ADD COLUMN music TEXT NOT NULL DEFAULT 'lullaby';
    ALTER TABLE stories ADD COLUMN characters TEXT NOT NULL DEFAULT '';
    ALTER TABLE stories ADD COLUMN lesson TEXT NOT NULL DEFAULT '';
    ALTER TABLE stories ADD COLUMN version INTEGER NOT NULL DEFAULT 1;
    ALTER TABLE stories ADD COLUMN remake TEXT NOT NULL DEFAULT '';
    ALTER TABLE stories ADD COLUMN remake_status TEXT NOT NULL DEFAULT '';
    ALTER TABLE stories ADD COLUMN remake_progress REAL NOT NULL DEFAULT 0;
    ALTER TABLE stories ADD COLUMN remake_error TEXT NOT NULL DEFAULT '';
    ALTER TABLE stories ADD COLUMN remake_at INTEGER;
    CREATE INDEX IF NOT EXISTS stories_remake ON stories(remake_status, remake_at);
    CREATE TABLE IF NOT EXISTS story_edits (id INTEGER PRIMARY KEY AUTOINCREMENT, story_id TEXT NOT NULL, owner_id TEXT NOT NULL,
      kind TEXT NOT NULL, created_at INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS story_edits_owner ON story_edits(owner_id, created_at);`],
  // Oomba admin approval before a game is public, and the Oomba team inbox (docs/decisions.md "Admin approval before a
  // game goes public" and "Admin messages: the Oomba team inbox"; services/publish.js, services/team.js).
  // Grandfathering: the version every game that is public today plays is marked approved by the team for everyone
  // (review_report by 'admin', for 'public', grandfathered 1, the earlier reviewer kept in 'was'), so nothing already public
  // is taken down and moving one off public and back needs no new review. Seed games are approved the same way.
  // games.review_reason: the preset reason a game was sent back with (chat.js REVIEW_REASONS; shown in the builder's
  // language next to review_note). chat_messages.sent_by: the admin behind a team message (NULL for automatic notices).
  // announcements: one row per announcement (the fan-out is one 'announce' message per person). plays_user: the new-users
  // list counts plays per person.
  ['0055_admin_review', `
    ALTER TABLE games ADD COLUMN review_reason TEXT NOT NULL DEFAULT '';
    ALTER TABLE chat_messages ADD COLUMN sent_by TEXT;
    CREATE TABLE IF NOT EXISTS announcements (id TEXT PRIMARY KEY, sent_by TEXT NOT NULL, audience TEXT NOT NULL, school_id TEXT,
      body TEXT NOT NULL, recipients INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS announcements_at ON announcements(created_at);
    CREATE INDEX IF NOT EXISTS plays_user ON plays(user_id, started_at);
    ${GRANDFATHER_SQL}`],
  // User analytics for the platform admin (docs/decisions.md "Admin: user analytics"; services/admin-analytics.js).
  // Sessions are deleted when someone signs out or a sign-in ends, so they can't tell when someone last signed in:
  // - users.last_login_at: the latest sign-in (auth.startSession, never for guests);
  // - sign_ins: one row per sign-in with how (password, google, switch, signup; '' for rows copied from old sessions),
  //   no IP and no browser; kept 400 days;
  // - user_days: one row per account per UTC day it was used (a sign-in or any signed-in request), for "days active"
  //   and DAU / WAU / MAU; kept 400 days. Guests write neither.
  // Backfill: last_login_at from the newest session still stored, else the sign-up itself for accounts people made for
  // themselves; sign_ins from stored sessions; user_days from plays, Builder messages, stored sessions, course and Number
  // Quest activity, the last-seen day of anyone who signed in and the sign-up day of self sign-ups. Older history is
  // only as good as those rows. plays_user_game: plays and distinct games per player read from the index alone.
  ['0056_user_analytics', `
    ALTER TABLE users ADD COLUMN last_login_at INTEGER NOT NULL DEFAULT 0;
    UPDATE users SET last_login_at=COALESCE((SELECT MAX(s.created_at) FROM sessions s WHERE s.user_id=users.id),
      CASE WHEN made_by IS NULL AND managed_school='' THEN created_at ELSE 0 END) WHERE is_guest=0;
    CREATE TABLE IF NOT EXISTS sign_ins (user_id TEXT NOT NULL, at INTEGER NOT NULL, method TEXT NOT NULL DEFAULT '');
    CREATE INDEX IF NOT EXISTS sign_ins_user ON sign_ins(user_id, at);
    CREATE INDEX IF NOT EXISTS sign_ins_at ON sign_ins(at);
    INSERT INTO sign_ins(user_id, at, method) SELECT s.user_id, s.created_at, CASE WHEN s.via='switch' THEN 'switch' ELSE '' END
      FROM sessions s JOIN users u ON u.id=s.user_id WHERE u.is_guest=0;
    CREATE TABLE IF NOT EXISTS user_days (user_id TEXT NOT NULL, day TEXT NOT NULL, PRIMARY KEY (user_id, day)) WITHOUT ROWID;
    CREATE INDEX IF NOT EXISTS user_days_day ON user_days(day);
    INSERT OR IGNORE INTO user_days SELECT p.user_id, strftime('%Y-%m-%d', p.started_at / 1000, 'unixepoch') FROM plays p JOIN users u ON u.id=p.user_id WHERE u.is_guest=0;
    INSERT OR IGNORE INTO user_days SELECT b.user_id, b.day FROM builder_usage b JOIN users u ON u.id=b.user_id WHERE u.is_guest=0 AND b.turns>0;
    INSERT OR IGNORE INTO user_days SELECT s.user_id, strftime('%Y-%m-%d', s.created_at / 1000, 'unixepoch') FROM sessions s JOIN users u ON u.id=s.user_id WHERE u.is_guest=0;
    INSERT OR IGNORE INTO user_days SELECT s.user_id, strftime('%Y-%m-%d', s.last_active / 1000, 'unixepoch') FROM sessions s JOIN users u ON u.id=s.user_id WHERE u.is_guest=0 AND s.last_active>0;
    INSERT OR IGNORE INTO user_days SELECT c.user_id, strftime('%Y-%m-%d', COALESCE(c.completed_at, c.checked_at, c.read_at, c.played_at) / 1000, 'unixepoch')
      FROM course_progress c JOIN users u ON u.id=c.user_id WHERE u.is_guest=0 AND COALESCE(c.completed_at, c.checked_at, c.read_at, c.played_at)>1;
    INSERT OR IGNORE INTO user_days SELECT a.user_id, a.day FROM nq_daily_activity a JOIN users u ON u.id=a.user_id WHERE u.is_guest=0;
    INSERT OR IGNORE INTO user_days SELECT id, strftime('%Y-%m-%d', last_seen / 1000, 'unixepoch') FROM users WHERE is_guest=0 AND last_login_at>0 AND last_seen>0;
    INSERT OR IGNORE INTO user_days SELECT id, strftime('%Y-%m-%d', created_at / 1000, 'unixepoch') FROM users WHERE is_guest=0 AND made_by IS NULL AND managed_school='';
    CREATE INDEX IF NOT EXISTS plays_user_game ON plays(user_id, game_id);`],
  // The Oomba team's automatic welcomes (services/team.js, docs/decisions.md "Automatic welcome from the Oomba team"):
  // one row per account and audience ('kid', 'grownup', 'teacher'), so each is sent at most once. state: 'sent',
  // 'withdrawn' (a kid welcome taken back when the account turned out to be a teacher's), 'wait' (a kid-type account
  // made on its way from a teacher door: the kid welcome waits) or 'skipped' (it waited, and they became staff).
  // Backfill: the kid welcomes already sent (audit 'team.welcome').
  ['0057_team_welcomes', `
    CREATE TABLE IF NOT EXISTS team_welcomes (user_id TEXT NOT NULL, audience TEXT NOT NULL, state TEXT NOT NULL,
      message_id TEXT, at INTEGER NOT NULL, PRIMARY KEY (user_id, audience)) WITHOUT ROWID;
    INSERT OR IGNORE INTO team_welcomes(user_id, audience, state, message_id, at)
      SELECT target, 'kid', 'sent', CASE WHEN json_valid(details) THEN json_extract(details, '$.message') END, created_at
      FROM audit_log WHERE action='team.welcome' AND target<>'';`],
  // Spark Packs (services/sparks.js, docs/decisions.md "Spark Packs"): one-time top-ups of Builder messages for a family.
  // spark_packs: one row per Checkout Session (made before the redirect, status 'open') or admin grant. status: open |
  // processing (a delayed payment) | active | failed | expired (the Checkout was never paid) | refunded | disputed |
  // revoked | ended (its time ran out). remaining never goes below 0 (CHECK). spark_ledger: every change of a pack's
  // credit (purchase, grant, use, refund_use (a build given back), refund, dispute, revoke, expire), with the build
  // (turn_id) a use paid for, so giving a build back returns the very credits it took. builder_asks: a child's "Ask my
  // grown-up" at the Builder's daily limit, one open per child (kind 'plan' | 'spark'); the family's grown-up sees it on
  // /family (and a badge) until they dismiss it, a plan or pack is bought, or a week passes.
  ['0058_spark_packs', `
    CREATE TABLE IF NOT EXISTS spark_packs (id TEXT PRIMARY KEY, family_id TEXT NOT NULL, size TEXT NOT NULL,
      messages INTEGER NOT NULL, remaining INTEGER NOT NULL DEFAULT 0 CHECK (remaining >= 0), status TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'stripe', stripe_session_id TEXT UNIQUE, stripe_payment_intent TEXT, amount_total INTEGER,
      currency TEXT, livemode INTEGER NOT NULL DEFAULT 0, bought_by TEXT, note TEXT, created_at INTEGER NOT NULL,
      paid_at INTEGER, expires_at INTEGER, ended_at INTEGER);
    CREATE INDEX IF NOT EXISTS spark_packs_family ON spark_packs(family_id, status, expires_at);
    CREATE INDEX IF NOT EXISTS spark_packs_pi ON spark_packs(stripe_payment_intent);
    CREATE TABLE IF NOT EXISTS spark_ledger (id INTEGER PRIMARY KEY AUTOINCREMENT, pack_id TEXT NOT NULL, family_id TEXT NOT NULL,
      delta INTEGER NOT NULL, reason TEXT NOT NULL, user_id TEXT, turn_id TEXT, event_id TEXT, by_user TEXT, day TEXT, at INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS spark_ledger_pack ON spark_ledger(pack_id);
    CREATE INDEX IF NOT EXISTS spark_ledger_turn ON spark_ledger(turn_id);
    CREATE INDEX IF NOT EXISTS spark_ledger_family ON spark_ledger(family_id, day);
    CREATE TABLE IF NOT EXISTS builder_asks (id TEXT PRIMARY KEY, family_id TEXT NOT NULL, child_id TEXT NOT NULL, kind TEXT NOT NULL,
      created_at INTEGER NOT NULL, seen_at INTEGER, closed_at INTEGER, close_reason TEXT);
    CREATE UNIQUE INDEX IF NOT EXISTS builder_asks_open ON builder_asks(child_id) WHERE closed_at IS NULL;
    CREATE INDEX IF NOT EXISTS builder_asks_family ON builder_asks(family_id, closed_at);`],
  // A school admin adding someone's own existing account as staff sends an invite: they become staff only when they
  // accept it (services/schools.js inviteStaff). One open invite per school and person. And "Set up my school" asks for
  // the sender's name (school_requests.contact_name), which fills in the school admin's real name for the platform admin.
  ['0059_staff_invites', `
    CREATE TABLE IF NOT EXISTS staff_invites (school_id TEXT NOT NULL, user_id TEXT NOT NULL, role TEXT NOT NULL,
      roster_name TEXT NOT NULL DEFAULT '', invited_by TEXT NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY (school_id, user_id));
    CREATE INDEX IF NOT EXISTS staff_invites_user ON staff_invites(user_id);
    ALTER TABLE school_requests ADD COLUMN contact_name TEXT NOT NULL DEFAULT '';`],
  // The Teacher plan (services/teacher-plan.js; docs/decisions.md "Teacher plan"). billing_subscriptions.trial_end: a
  // free trial's end (ms). trial_notice_at: when the teacher was told their trial is ending (customer.subscription.
  // trial_will_end), so the notice goes once. teacher_trials: one row per free trial ever started, by a teacher (owner
  // 'teacher') or a school (owner 'school'): a teacher, an email (an HMAC of it, never the address) and a school each
  // get one trial ever, per Stripe mode. teacher_seats: which staff a school with teacher seats gave a seat to.
  // billing_requests.unit: what an invoice request counts ('teacher' seats; 'student' for requests made before).
  ['0060_teacher_plan', `
    ALTER TABLE billing_subscriptions ADD COLUMN trial_end INTEGER;
    ALTER TABLE billing_subscriptions ADD COLUMN trial_notice_at INTEGER;
    CREATE TABLE IF NOT EXISTS teacher_trials (id TEXT PRIMARY KEY, owner_kind TEXT NOT NULL, owner_id TEXT NOT NULL,
      user_id TEXT, school_id TEXT, email_hash TEXT, stripe_subscription_id TEXT UNIQUE, livemode INTEGER NOT NULL,
      created_at INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS teacher_trials_user ON teacher_trials(user_id, livemode);
    CREATE INDEX IF NOT EXISTS teacher_trials_email ON teacher_trials(email_hash, livemode);
    CREATE INDEX IF NOT EXISTS teacher_trials_school ON teacher_trials(school_id, livemode);
    CREATE TABLE IF NOT EXISTS teacher_seats (school_id TEXT NOT NULL, user_id TEXT NOT NULL, assigned_by TEXT NOT NULL,
      assigned_at INTEGER NOT NULL, PRIMARY KEY (school_id, user_id));
    CREATE INDEX IF NOT EXISTS teacher_seats_user ON teacher_seats(user_id);
    ALTER TABLE billing_requests ADD COLUMN unit TEXT NOT NULL DEFAULT 'student';`],
  // Trial emails (services/email.js, services/nudges.js; docs/decisions.md "Trial emails"). email_prefs: one row per
  // grown-up or teacher account we may email: the address a trial gave us (email_source 'checkout'; a Google sign-in's
  // verified address is read from google_identities and wins) and nudges_off_at (the one-click unsubscribe; receipts and
  // other transactional emails still go). email_log: one row per send attempt (to, template, status, the provider's id,
  // a short error): never a body. trial_emails: one row per account's trial (the first one only: a second trial gets
  // no second sequence). trial_nudges: one row per email of the sequence with due_at / latest_at (never sent after it)
  // and sent_at, so a restart never sends one twice. status: pending | sending | sent | skipped | failed | canceled.
  ['0061_trial_emails', `
    CREATE TABLE IF NOT EXISTS email_prefs (user_id TEXT PRIMARY KEY, email TEXT NOT NULL DEFAULT '', email_source TEXT NOT NULL DEFAULT '',
      nudges_off_at INTEGER, updated_at INTEGER NOT NULL) WITHOUT ROWID;
    CREATE TABLE IF NOT EXISTS email_log (id TEXT PRIMARY KEY, user_id TEXT, to_email TEXT NOT NULL DEFAULT '', template TEXT NOT NULL,
      category TEXT NOT NULL, status TEXT NOT NULL, provider_id TEXT, error TEXT, idem_key TEXT, attempts INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS email_log_at ON email_log(created_at);
    CREATE INDEX IF NOT EXISTS email_log_user ON email_log(user_id);
    CREATE TABLE IF NOT EXISTS trial_emails (user_id TEXT PRIMARY KEY, trial_start INTEGER NOT NULL, trial_end INTEGER NOT NULL,
      state TEXT NOT NULL DEFAULT 'trialing', converted_at INTEGER, ended_at INTEGER, created_at INTEGER NOT NULL) WITHOUT ROWID;
    CREATE TABLE IF NOT EXISTS trial_nudges (user_id TEXT NOT NULL, step TEXT NOT NULL, due_at INTEGER NOT NULL, latest_at INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending', reason TEXT, attempts INTEGER NOT NULL DEFAULT 0, claimed_at INTEGER, sent_at INTEGER,
      created_at INTEGER NOT NULL, PRIMARY KEY (user_id, step)) WITHOUT ROWID;
    CREATE INDEX IF NOT EXISTS trial_nudges_due ON trial_nudges(status, due_at);`],
  // The two shelves of the game library (docs/decisions.md "Play and Learn"): each official game is 'play' (fun first)
  // or 'learn' (teaches something). Set from the seed JSONs ("shelf", scripts/import-game.js) for fresh databases and
  // here for existing ones; players' games keep '' and services/games.js SHELF_SQL derives theirs from the category.
  ['0062_game_shelf', '', conn => {
    if (!conn.prepare('PRAGMA table_info(games)').all().some(c => c.name === 'shelf')) conn.exec("ALTER TABLE games ADD COLUMN shelf TEXT NOT NULL DEFAULT '';");
    const learn = ['shark-plank', 'castle-clash', 'word-hunt', 'sum-racer', 'word-peek', 'loop-lab', 'code-isle', 'quest-race', 'question-battle', 'brain-board', 'atlas-quest', 'would-you-rather-live', 'atlas-quest-live', 'packet-post', 'trick-inbox', 'inside-the-machine', 'data-detective', 'robo-route', 'escape-the-post-office', 'fraction-factory', 'tug-of-math', 'doodle-hoot', 'word-trail', 'garden-count', 'lily-hop', 'crate-stacker', 'balance-bridge', 'rocket-supply', 'shape-hunt', 'kitchen-rush', 'lantern-mix', 'sub-zero', 'machine-line', 'scale-scout', 'sky-lines', 'keep-builder', 'launch-lab', 'sudoku'];
    const list = learn.map(s => `'${s}'`).join(',');
    conn.exec(`UPDATE games SET shelf='learn' WHERE source='seed' AND slug IN (${list})`);
    conn.exec(`UPDATE games SET shelf='play' WHERE source='seed' AND slug NOT IN (${list})`);
    conn.exec("UPDATE games SET featured=2 WHERE source='seed' AND slug='jungle-cup' AND featured>0");
  }],
  // Rubrics (services/rubrics.js; docs/decisions.md "Rubrics"). rubrics: a teacher's reusable rubric in a school's lesson
  // library: levels (JSON [{ label, points }], 2-6 columns) and criteria (JSON [{ name, descs: [one per level] }], 1-12
  // rows); shared=1 lets the school's staff see and copy it; source says where it came from ('', 'ai', 'csq:<key>',
  // 'copy:<id>'); version goes up on every edit. lessons.rubric_id / lesson_steps.rubric_id attach one to a whole lesson
  // or to a step that collects work (question, build). rubric_scores: one row per assigned lesson, step ('' = the whole
  // lesson) and student: the level picked per criterion (picks, JSON), per-criterion comments, the points and the most
  // possible, and a snapshot of the rubric as it was scored (so editing or deleting the rubric never changes a result).
  ['0063_rubrics', `
    CREATE TABLE IF NOT EXISTS rubrics (id TEXT PRIMARY KEY, school_id TEXT NOT NULL, owner_id TEXT NOT NULL, title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '', levels TEXT NOT NULL, criteria TEXT NOT NULL, shared INTEGER NOT NULL DEFAULT 0,
      source TEXT NOT NULL DEFAULT '', version INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS rubrics_owner ON rubrics(owner_id, school_id);
    CREATE INDEX IF NOT EXISTS rubrics_school ON rubrics(school_id, shared);
    ALTER TABLE lessons ADD COLUMN rubric_id TEXT;
    ALTER TABLE lesson_steps ADD COLUMN rubric_id TEXT;
    CREATE INDEX IF NOT EXISTS lessons_rubric ON lessons(rubric_id);
    CREATE INDEX IF NOT EXISTS lesson_steps_rubric ON lesson_steps(rubric_id);
    CREATE TABLE IF NOT EXISTS rubric_scores (class_lesson_id TEXT NOT NULL, step_id TEXT NOT NULL DEFAULT '', user_id TEXT NOT NULL,
      rubric_id TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1, snapshot TEXT NOT NULL, picks TEXT NOT NULL, comments TEXT NOT NULL DEFAULT '[]',
      feedback TEXT NOT NULL DEFAULT '', points REAL NOT NULL DEFAULT 0, max_points REAL NOT NULL DEFAULT 0, scored_by TEXT,
      scored_at INTEGER NOT NULL, PRIMARY KEY (class_lesson_id, step_id, user_id)) WITHOUT ROWID;
    CREATE INDEX IF NOT EXISTS rubric_scores_user ON rubric_scores(user_id);`],
  // Standards beyond computer science (docs/decisions.md, 9 Nov 2026): a teacher's Common Core tags on their own lessons
  // and steps (step_id '' = the whole lesson). framework 'ccss-math' | 'ccss-ela'; code checked against
  // server/standards/ccss-*.json before it is stored. Deleted and copied with the lesson (services/lessons.js).
  ['0064_lesson_standards', `CREATE TABLE IF NOT EXISTS lesson_standards (lesson_id TEXT NOT NULL, step_id TEXT NOT NULL DEFAULT '',
      framework TEXT NOT NULL, code TEXT NOT NULL, added_by TEXT, created_at INTEGER NOT NULL, PRIMARY KEY (lesson_id, step_id, framework, code)) WITHOUT ROWID;
    CREATE INDEX IF NOT EXISTS lesson_standards_code ON lesson_standards(framework, code);`],
  // Google Classroom sync (services/gclassroom.js; docs/google-classroom.md). gc_connections: one per teacher who
  // connected Classroom: their Google account id and email, the scopes Google granted, and the refresh token encrypted
  // with GOOGLE_TOKEN_KEY (AES-256-GCM; key_tag names the key, so a new key asks teachers to connect again). Access
  // tokens are never stored. gc_links: an Oomba class linked to one Classroom course. gc_posts: a class lesson posted as
  // Classroom coursework, and the last grades sent for it. gc_syncs: what each sync did (counts and a short error code,
  // never names or grades), shown on the class's Google Classroom page; kept 180 days. gc_pending: a student from the
  // Classroom roster that Oomba doesn't know yet, waiting (30 days) to sign in with Google on the school's domain, when
  // their school account is made.
  ['0065_google_classroom', `
    CREATE TABLE IF NOT EXISTS gc_connections (user_id TEXT PRIMARY KEY, sub TEXT NOT NULL, email TEXT NOT NULL DEFAULT '',
      scopes TEXT NOT NULL DEFAULT '', token_enc TEXT NOT NULL, key_tag TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'ok',
      last_error TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL) WITHOUT ROWID;
    CREATE TABLE IF NOT EXISTS gc_links (class_id TEXT PRIMARY KEY, course_id TEXT NOT NULL, course_name TEXT NOT NULL DEFAULT '',
      linked_by TEXT NOT NULL, linked_at INTEGER NOT NULL, roster_at INTEGER, roster_counts TEXT) WITHOUT ROWID;
    CREATE TABLE IF NOT EXISTS gc_posts (class_lesson_id TEXT PRIMARY KEY, class_id TEXT NOT NULL, course_id TEXT NOT NULL,
      coursework_id TEXT NOT NULL, link TEXT NOT NULL DEFAULT '', posted_by TEXT NOT NULL, posted_at INTEGER NOT NULL,
      grades_at INTEGER, grades_mode TEXT, grades_counts TEXT) WITHOUT ROWID;
    CREATE INDEX IF NOT EXISTS gc_posts_class ON gc_posts(class_id);
    CREATE TABLE IF NOT EXISTS gc_syncs (id TEXT PRIMARY KEY, class_id TEXT, user_id TEXT NOT NULL, kind TEXT NOT NULL,
      status TEXT NOT NULL, counts TEXT, error TEXT, created_at INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS gc_syncs_class ON gc_syncs(class_id, created_at);
    CREATE TABLE IF NOT EXISTS gc_pending (class_id TEXT NOT NULL, sub TEXT NOT NULL, school_id TEXT NOT NULL, course_id TEXT NOT NULL,
      roster_name TEXT NOT NULL DEFAULT '', grade TEXT NOT NULL DEFAULT '', created_by TEXT NOT NULL, created_at INTEGER NOT NULL,
      PRIMARY KEY(class_id, sub)) WITHOUT ROWID;
    CREATE INDEX IF NOT EXISTS gc_pending_sub ON gc_pending(sub);`],
  // The weekly class summary email (services/digest.js; docs/decisions.md "Weekly class summary email"). email_prefs
  // gains the teacher's own switch and schedule: digest_off_at (their off switch, separate from the trial nudges'),
  // digest_day (0 Sunday … 6 Saturday, default Monday), digest_hour (0-23, default 7) and digest_tz ('' = their
  // school's time zone), digest_lang (the site language in effect when the teacher last saved or opened the summary;
  // the email goes in users.lang, else this, else English). digest_sends: one row per teacher per week (week = the local
  // date of that week's send slot), claimed before it is sent and marked after, so a restart never sends a week twice.
  // It keeps counts only (classes in the email), never a name or an answer; message holds the rendered email (counts,
  // class names, the teacher's first name) only while a send is being retried, so every try sends the same bytes under
  // the same Idempotency-Key, and is cleared once the row is done. status: sending | pending | sent | skipped | failed.
  ['0066_class_digest', `
    ALTER TABLE email_prefs ADD COLUMN digest_off_at INTEGER;
    ALTER TABLE email_prefs ADD COLUMN digest_day INTEGER NOT NULL DEFAULT 1;
    ALTER TABLE email_prefs ADD COLUMN digest_hour INTEGER NOT NULL DEFAULT 7;
    ALTER TABLE email_prefs ADD COLUMN digest_tz TEXT NOT NULL DEFAULT '';
    ALTER TABLE email_prefs ADD COLUMN digest_lang TEXT NOT NULL DEFAULT '';
    CREATE TABLE IF NOT EXISTS digest_sends (user_id TEXT NOT NULL, week TEXT NOT NULL, slot_at INTEGER NOT NULL,
      status TEXT NOT NULL, reason TEXT, classes INTEGER NOT NULL DEFAULT 0, attempts INTEGER NOT NULL DEFAULT 0,
      claimed_at INTEGER, sent_at INTEGER, message TEXT, created_at INTEGER NOT NULL, PRIMARY KEY (user_id, week)) WITHOUT ROWID;
    CREATE INDEX IF NOT EXISTS digest_sends_status ON digest_sends(status, claimed_at);`],
  // Google Classroom sync, part 2 (services/gclassroom.js; docs/decisions.md "Google Classroom sync: optional scopes and
  // automatic sync"). gc_links gains the class's settings and state: auto_grades ('' off, 'draft' or 'assigned') and
  // auto_by (the teacher whose connection sends them), auto_fails / auto_next_at (back-off after errors), auto_roster
  // (1 = re-import the roster every 6 hours, the default), roster_next_at, topic_name ('' = the default, in the
  // teacher's language) and topic_id / topic_course_id (the Classroom topic made once per linked course). gc_posts gains
  // kind ('assignment' | 'material'): a lesson may be posted once of each kind, so the primary key becomes
  // (class_lesson_id, kind); auto_at: when automatic grades last looked at it. gc_grades: per posted assignment and
  // student, the grade and mode last sent (so an unchanged grade is never sent again); deleted with the post.
  // gc_roster: the students a roster import matched in this class (by Google account id), and gone_at when they left the
  // Classroom roster: the page lists them for the teacher to remove (nothing is removed automatically).
  ['0067_gclassroom_auto', `
    ALTER TABLE gc_links ADD COLUMN auto_grades TEXT NOT NULL DEFAULT '';
    ALTER TABLE gc_links ADD COLUMN auto_by TEXT;
    ALTER TABLE gc_links ADD COLUMN auto_fails INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE gc_links ADD COLUMN auto_next_at INTEGER;
    ALTER TABLE gc_links ADD COLUMN auto_roster INTEGER NOT NULL DEFAULT 1;
    ALTER TABLE gc_links ADD COLUMN roster_next_at INTEGER;
    ALTER TABLE gc_links ADD COLUMN topic_name TEXT NOT NULL DEFAULT '';
    ALTER TABLE gc_links ADD COLUMN topic_id TEXT;
    ALTER TABLE gc_links ADD COLUMN topic_course_id TEXT;
    CREATE TABLE gc_posts_new (class_lesson_id TEXT NOT NULL, kind TEXT NOT NULL DEFAULT 'assignment', class_id TEXT NOT NULL, course_id TEXT NOT NULL,
      coursework_id TEXT NOT NULL, link TEXT NOT NULL DEFAULT '', posted_by TEXT NOT NULL, posted_at INTEGER NOT NULL,
      grades_at INTEGER, grades_mode TEXT, grades_counts TEXT, auto_at INTEGER, PRIMARY KEY (class_lesson_id, kind)) WITHOUT ROWID;
    INSERT INTO gc_posts_new(class_lesson_id, kind, class_id, course_id, coursework_id, link, posted_by, posted_at, grades_at, grades_mode, grades_counts)
      SELECT class_lesson_id, 'assignment', class_id, course_id, coursework_id, link, posted_by, posted_at, grades_at, grades_mode, grades_counts FROM gc_posts;
    DROP TABLE gc_posts;
    ALTER TABLE gc_posts_new RENAME TO gc_posts;
    CREATE INDEX IF NOT EXISTS gc_posts_class ON gc_posts(class_id);
    CREATE TABLE IF NOT EXISTS gc_grades (class_lesson_id TEXT NOT NULL, user_id TEXT NOT NULL, coursework_id TEXT NOT NULL, grade INTEGER NOT NULL,
      mode TEXT NOT NULL, sent_at INTEGER NOT NULL, PRIMARY KEY (class_lesson_id, user_id)) WITHOUT ROWID;
    CREATE TABLE IF NOT EXISTS gc_roster (class_id TEXT NOT NULL, sub TEXT NOT NULL, user_id TEXT NOT NULL, course_id TEXT NOT NULL,
      seen_at INTEGER NOT NULL, gone_at INTEGER, PRIMARY KEY (class_id, sub)) WITHOUT ROWID;
    CREATE INDEX IF NOT EXISTS gc_roster_user ON gc_roster(user_id);`],
  // (0067 belongs to the Google Classroom work.)
  // Child safety (docs/decisions.md "Staff have no friends; school chat is off by default").
  // 1. Staff never have friends: the platform admin and everyone who is or was a teacher or school admin (a
  //    school_members row whose role is not 'student', in any status; services/schools.js noFriendsAccount). Every
  //    friendship and friend request they hold is ended here, in both directions, their friend code is taken away, and
  //    unread friends' messages to or from them stop counting. The messages themselves are kept (a report may need them)
  //    but no page or API shows them any more (services/chat.js canChat).
  // 2. Classmate chat is off unless a school switches it on. Until now every save of a school's settings wrote
  //    chat:'classmates' (the old default) into the row whether or not anyone looked at the Chat box, so a stored
  //    'classmates' does not show a choice. The one trace of a real choice is the audit log: a school that saved "No
  //    chat" and later saved "classmates" again chose it, and keeps it. Every other school follows the new default
  //    (the safer reading): its stored 'classmates' is removed. A school whose own accounts have ever chatted gets
  //    chatNotice, shown on its Settings tab until an admin saves a chat choice. A stored 'off' is left alone.
  ['0068_staff_no_friends_chat_off', `
    CREATE TEMP TABLE IF NOT EXISTS _staff68 AS SELECT id FROM users WHERE role='admin'
      UNION SELECT user_id FROM school_members WHERE role!='student';
    DELETE FROM friends WHERE user_id IN (SELECT id FROM _staff68) OR friend_id IN (SELECT id FROM _staff68);
    UPDATE users SET friend_code=NULL WHERE id IN (SELECT id FROM _staff68);
    UPDATE chat_messages SET read_at=CAST(strftime('%s','now') AS INTEGER)*1000 WHERE read_at IS NULL AND kind IN ('text','quick','game')
      AND (to_id IN (SELECT id FROM _staff68) OR from_id IN (SELECT id FROM _staff68));
    DROP TABLE _staff68;`,
  conn => {
    const saves = conn.prepare("SELECT details FROM audit_log WHERE action='school.update' AND target=? ORDER BY created_at, rowid");
    const chatted = conn.prepare(`SELECT 1 FROM chat_messages m WHERE m.kind IN ('text','quick','game')
      AND (m.from_id IN (SELECT id FROM users WHERE managed_school=?) OR m.to_id IN (SELECT id FROM users WHERE managed_school=?)) LIMIT 1`);
    for (const row of conn.prepare('SELECT id, settings FROM schools').all()) {
      let st; try { st = JSON.parse(row.settings || '{}'); } catch { continue; }
      if (!st || typeof st !== 'object' || st.chat !== 'classmates') continue;
      // Did this school ever save "No chat" and afterwards "classmates"? Then 'classmates' is its own choice.
      let sawOff = false, chose = false;
      for (const a of saves.all(row.id)) {
        let c; try { c = (JSON.parse(a.details || '{}').settings || {}).chat; } catch { c = undefined; }
        if (c === 'off') { sawOff = true; chose = false; } else if (c === 'classmates' && sawOff) chose = true;
      }
      if (chose) continue;
      delete st.chat;
      if (chatted.get(row.id, row.id)) st.chatNotice = true;
      conn.prepare('UPDATE schools SET settings=? WHERE id=?').run(JSON.stringify(st), row.id);
    }
  }],
  // Google Classroom automatic grades: retrying students whose grade didn't go through (docs/decisions.md "Google
  // Classroom sync: hardening"). gc_posts gains retry_at (when the automatic sync tries that assignment's failed grades
  // again, even if nobody's progress moved) and retry_fails (sends in a row with a failure, for the back-off: 1 h, 2 h,
  // 4 h... at most a day). Both clear once every grade went.
  ['0072_gclassroom_retry', `
    ALTER TABLE gc_posts ADD COLUMN retry_at INTEGER;
    ALTER TABLE gc_posts ADD COLUMN retry_fails INTEGER NOT NULL DEFAULT 0;`],
  // Admin alerts (services/admin-alerts.js; docs/decisions.md "Admin alerts by email"). admin_alerts: one row per thing
  // that needs the platform admin (a game waiting for review, a new account, a message to the team...): its kind, the
  // id it is about (ref), a short non-personal note (summary: e.g. 'update', a report reason) and the admin page path.
  // Never a message's text, a name or an address: the email reads public usernames and titles at send time.
  // admin_alert_batches: one summary email per run (claimed before it is sent; its rendered message is kept only while
  // it may be retried), with the addresses it went to (admins' own) for the log on /admin/emails.
  ['0073_admin_alerts', `
    CREATE TABLE IF NOT EXISTS admin_alerts (
      id TEXT PRIMARY KEY, kind TEXT NOT NULL, ref TEXT, summary TEXT NOT NULL DEFAULT '', url TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pending', batch_id TEXT, created_at INTEGER NOT NULL, sent_at INTEGER);
    CREATE INDEX IF NOT EXISTS idx_admin_alerts_status ON admin_alerts(status, created_at);
    CREATE INDEX IF NOT EXISTS idx_admin_alerts_batch ON admin_alerts(batch_id);
    CREATE TABLE IF NOT EXISTS admin_alert_batches (
      id TEXT PRIMARY KEY, status TEXT NOT NULL, test INTEGER NOT NULL DEFAULT 0, items INTEGER NOT NULL DEFAULT 0,
      kinds TEXT NOT NULL DEFAULT '{}', recipients TEXT NOT NULL DEFAULT '[]', delivered TEXT NOT NULL DEFAULT '[]',
      message TEXT, attempts INTEGER NOT NULL DEFAULT 0, claimed_at INTEGER, sent_at INTEGER, error TEXT, created_at INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS idx_admin_alert_batches_created ON admin_alert_batches(created_at);`],
  // One sign-up (docs/decisions.md "One sign-up"): an account made on the teacher path before it has a school says so
  // ('teacher'), so signing in again goes back to the school step instead of a kid's home. Cleared once they are staff.
  ['0074_signup_as', "ALTER TABLE users ADD COLUMN signup_as TEXT NOT NULL DEFAULT '';"],
  // The automatic trial at sign-up (docs/decisions.md "Automatic trial at sign-up"): a teacher's own free trial closed
  // because a school admin gave them a seat. replaced_by_school: that school; replaced_at: when. Such a trial is neither
  // "converted" nor "ended" (no trial-ended email, its own count on /admin/billing). 0075 and 0076 are taken elsewhere.
  ['0077_trial_replaced', `
    ALTER TABLE teacher_trials ADD COLUMN replaced_by_school TEXT;
    ALTER TABLE teacher_trials ADD COLUMN replaced_at INTEGER;`],
  // Classroom dashboards, stage 1 (services/dash.js; docs/decisions.md "Classroom dashboards, stage 1").
  // dash_layouts: a teacher's named layouts per class (widgets and background as JSON). dash_class: per class, the layout
  // students follow (layout_id), its pinned widgets as students get them (pins, pins_at), and Eyes up (eyes_until).
  // dash_students: one student's own widgets, where they moved the pinned ones, their background. dash_links: the
  // class's approved links (removed ones keep their row). dash_pushes: what the teacher sent today (day in the school's
  // time zone; ended_at when ended). dash_push_hidden: which pushes a student hid. dash_pictures: background pictures
  // (the file is <dataDir>/dash-pictures/<id>.jpg), seen only by the owner and the teachers of class_id.
  ['0078_class_dashboards', `
    CREATE TABLE IF NOT EXISTS dash_layouts (id TEXT PRIMARY KEY, class_id TEXT NOT NULL, owner_id TEXT NOT NULL, name TEXT NOT NULL,
      widgets TEXT NOT NULL DEFAULT '[]', bg TEXT NOT NULL DEFAULT '{}', position INTEGER NOT NULL DEFAULT 0, used_at INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS idx_dash_layouts_owner ON dash_layouts(class_id, owner_id, position);
    CREATE TABLE IF NOT EXISTS dash_class (class_id TEXT PRIMARY KEY, layout_id TEXT, pins TEXT NOT NULL DEFAULT '[]', pins_at INTEGER NOT NULL DEFAULT 0,
      eyes_until INTEGER NOT NULL DEFAULT 0, eyes_by TEXT, eyes_at INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS dash_students (class_id TEXT NOT NULL, user_id TEXT NOT NULL, widgets TEXT NOT NULL DEFAULT '[]',
      pins TEXT NOT NULL DEFAULT '{}', bg TEXT NOT NULL DEFAULT '{}', updated_at INTEGER NOT NULL, PRIMARY KEY (class_id, user_id));
    CREATE TABLE IF NOT EXISTS dash_links (id TEXT PRIMARY KEY, class_id TEXT NOT NULL, url TEXT NOT NULL, title TEXT NOT NULL,
      added_by TEXT NOT NULL, created_at INTEGER NOT NULL, removed_at INTEGER);
    CREATE INDEX IF NOT EXISTS idx_dash_links_class ON dash_links(class_id, removed_at);
    CREATE TABLE IF NOT EXISTS dash_pushes (id TEXT PRIMARY KEY, class_id TEXT NOT NULL, day TEXT NOT NULL, kind TEXT NOT NULL, ref TEXT NOT NULL,
      title TEXT NOT NULL, by_id TEXT NOT NULL, created_at INTEGER NOT NULL, ended_at INTEGER);
    CREATE INDEX IF NOT EXISTS idx_dash_pushes_class ON dash_pushes(class_id, day);
    CREATE TABLE IF NOT EXISTS dash_push_hidden (push_id TEXT NOT NULL, user_id TEXT NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (push_id, user_id));
    CREATE TABLE IF NOT EXISTS dash_pictures (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, class_id TEXT NOT NULL, bytes INTEGER NOT NULL,
      created_at INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS idx_dash_pictures_owner ON dash_pictures(owner_id, class_id);`],
  // Classroom dashboards, stage 2 (services/dash.js; docs/decisions.md "Classroom dashboards, stage 2").
  // dash_class.timers: the teacher's timers and stopwatches by widget id ({ mode, dur, base, start, on }: a start time
  // and a duration, never a ticking value). dash_class.picker: today's random picker (who was picked, who is away).
  // dash_help: the help queue (one row per student: help or done, today only). dash_checks / dash_answers: quick checks
  // the teacher broadcast (a tap per student, no free text); kept for the school day unless the teacher saves them.
  ['0079_dash_everyday', `
    ALTER TABLE dash_class ADD COLUMN timers TEXT NOT NULL DEFAULT '{}';
    ALTER TABLE dash_class ADD COLUMN picker TEXT NOT NULL DEFAULT '{}';
    CREATE TABLE IF NOT EXISTS dash_help (class_id TEXT NOT NULL, user_id TEXT NOT NULL, kind TEXT NOT NULL, day TEXT NOT NULL, at INTEGER NOT NULL,
      PRIMARY KEY (class_id, user_id));
    CREATE TABLE IF NOT EXISTS dash_checks (id TEXT PRIMARY KEY, class_id TEXT NOT NULL, day TEXT NOT NULL, kind TEXT NOT NULL, question TEXT NOT NULL DEFAULT '',
      options TEXT NOT NULL DEFAULT '[]', by_id TEXT NOT NULL, created_at INTEGER NOT NULL, ended_at INTEGER, saved_at INTEGER);
    CREATE INDEX IF NOT EXISTS idx_dash_checks_class ON dash_checks(class_id, day);
    CREATE TABLE IF NOT EXISTS dash_answers (check_id TEXT NOT NULL, user_id TEXT NOT NULL, value INTEGER NOT NULL, at INTEGER NOT NULL,
      PRIMARY KEY (check_id, user_id));`],
  // Classroom dashboards, stage 3 (services/dash.js, services/dash-tools.js; docs/decisions.md "Classroom dashboards,
  // stage 3"). dash_pushes.data: what a pushed teaching tool starts from ({ type, state }, rebuilt from the tool's spec;
  // '{}' for other kinds). dash_pictures.use: 'bg' (a background) or 'show' (a teacher's Picture widget; the class's
  // students may fetch it while it is pinned on their screens).
  ['0080_dash_teaching_tools', `
    ALTER TABLE dash_pushes ADD COLUMN data TEXT NOT NULL DEFAULT '{}';
    ALTER TABLE dash_pictures ADD COLUMN use TEXT NOT NULL DEFAULT 'bg';`],
  // Classroom dashboards, stage 5 (services/dash.js; docs/decisions.md "Classroom dashboards, stage 5"). dash_passes: a
  // student's hall pass for today (one row per student: asked, out or declined; the row goes when they are back, and
  // older days' rows whenever the class's passes are read). dash_points: a student's positive points per reason (a
  // count, never below zero). dash_moods: today's mood check-in (a face's index, one per student).
  ['0081_dash_class_tools', `
    CREATE TABLE IF NOT EXISTS dash_passes (id TEXT PRIMARY KEY, class_id TEXT NOT NULL, user_id TEXT NOT NULL, place TEXT NOT NULL, day TEXT NOT NULL,
      state TEXT NOT NULL, asked_at INTEGER NOT NULL, out_at INTEGER, UNIQUE (class_id, user_id));
    CREATE TABLE IF NOT EXISTS dash_points (class_id TEXT NOT NULL, user_id TEXT NOT NULL, reason TEXT NOT NULL, n INTEGER NOT NULL DEFAULT 0, at INTEGER NOT NULL,
      PRIMARY KEY (class_id, user_id, reason));
    CREATE TABLE IF NOT EXISTS dash_moods (class_id TEXT NOT NULL, user_id TEXT NOT NULL, day TEXT NOT NULL, mood INTEGER NOT NULL, at INTEGER NOT NULL,
      PRIMARY KEY (class_id, user_id));`],
  // Sum Spotter, a new official game on the Learn shelf (docs/decisions.md "Sum Spotter"): a database seeded before it
  // existed gets its row from the seed import, which reads "shelf" from its JSON; this makes sure an existing row is
  // on Learn too. 0062's list is left as it was (a migration that ran never runs again).
  ['0082_sum_spotter_shelf', "UPDATE games SET shelf='learn' WHERE source='seed' AND slug='sum-spotter';"],
  // Staff invites by email (services/staff-email-invites.js): a school admin (any role) or a teacher (Teachers only)
  // invites an address; the email's link /join-staff/<token> lets the person with that address join once they sign in.
  // Only the token's SHA-256 is kept (token_hash), never the token. status: 'open' (until expires_at, 14 days after the
  // last send), 'accepted' / 'declined' (used_at, used_by), 'cancelled'. email (lowercased) is shown only to the school's
  // admins and the inviter; the audit log keeps the row's id, never the address. lang: the email's language.
  ['0083_staff_email_invites', `
    CREATE TABLE IF NOT EXISTS staff_email_invites (id TEXT PRIMARY KEY, school_id TEXT NOT NULL, email TEXT NOT NULL, roster_name TEXT NOT NULL DEFAULT '',
      role TEXT NOT NULL, token_hash TEXT NOT NULL UNIQUE, lang TEXT NOT NULL DEFAULT '', invited_by TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'open',
      created_at INTEGER NOT NULL, sent_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, used_at INTEGER, used_by TEXT);
    CREATE INDEX IF NOT EXISTS staff_email_invites_school ON staff_email_invites(school_id, status);
    CREATE INDEX IF NOT EXISTS staff_email_invites_by ON staff_email_invites(invited_by);
    CREATE INDEX IF NOT EXISTS staff_email_invites_email ON staff_email_invites(email);`],
  // Classroom dashboards: "Build it" practice sets (services/dash.js; docs/decisions.md "Classroom dashboards: Build
  // it"). The set itself (the tool, its targets, the instruction) is a push's data (dash_pushes, kind 'build').
  // dash_builds: one row per student per target they have checked: ok (1 once it was right; it stays right) and tries
  // (how many checks). Nothing a student built is kept. Rows go with their push (14 days), their class and account.
  ['0084_dash_builds', `
    CREATE TABLE IF NOT EXISTS dash_builds (push_id TEXT NOT NULL, class_id TEXT NOT NULL, user_id TEXT NOT NULL, item INTEGER NOT NULL,
      ok INTEGER NOT NULL DEFAULT 0, tries INTEGER NOT NULL DEFAULT 0, at INTEGER NOT NULL, PRIMARY KEY (push_id, user_id, item));
    CREATE INDEX IF NOT EXISTS idx_dash_builds_class ON dash_builds(class_id);
    CREATE INDEX IF NOT EXISTS idx_dash_builds_user ON dash_builds(user_id);`],
  // Games, not lessons (owner, 17 Nov 2026: "get rid of lessons and instead just have the builder here with games that
  // teachers can put in folders and assign"). lessons.kind says what a lesson row is now: 'game' (one game assigned to a
  // class, made by Assign), 'course' (a ready-made course's copy, CS Quest: template_key), 'homework' (a live question
  // set sent as homework) or 'lesson' (a teacher-made lesson: no longer shown anywhere). game_folders / game_folder_items:
  // a person's folders of games, any game they can see (their own Builder games and Oomba's), one level deep.
  // Backfill: each teacher-made lesson with games becomes a folder named after it holding those games (from_lesson), and
  // its assignments leave their classes with the usual soft remove (class_lessons.removed_at); lessons_retired keeps
  // which rows this did, so it can be undone. Nothing is deleted: lessons, steps and students' work all stay.
  ['0085_game_folders', `
    ALTER TABLE lessons ADD COLUMN kind TEXT NOT NULL DEFAULT 'lesson';
    CREATE TABLE IF NOT EXISTS game_folders (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, name TEXT NOT NULL, position INTEGER NOT NULL DEFAULT 0,
      from_lesson TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS game_folders_owner ON game_folders(owner_id, position);
    CREATE TABLE IF NOT EXISTS game_folder_items (folder_id TEXT NOT NULL, game_id TEXT NOT NULL, position INTEGER NOT NULL DEFAULT 0, added_at INTEGER NOT NULL,
      PRIMARY KEY (folder_id, game_id));
    CREATE INDEX IF NOT EXISTS game_folder_items_game ON game_folder_items(game_id);
    CREATE TABLE IF NOT EXISTS lessons_retired (class_lesson_id TEXT PRIMARY KEY, lesson_id TEXT NOT NULL, retired_at INTEGER NOT NULL);`,
  retireLessons],
  // Shared folders (owner: "Teachers should also still be able to share games"): a folder shared with one school its owner
  // is staff of (school_id; NULL = private). That school's staff see it under "Shared by colleagues" on Build, open it
  // read-only (only the games they can open), play or assign its games, and copy it into their own folders.
  ['0086_game_folder_sharing', `
    ALTER TABLE game_folders ADD COLUMN school_id TEXT;
    ALTER TABLE game_folders ADD COLUMN shared_at INTEGER;
    CREATE INDEX IF NOT EXISTS game_folders_school ON game_folders(school_id, shared_at);`],
  // Question sets an official game keeps for a teacher (services/game-sets.js; Algebra Builder): id is the short code
  // its link carries (s-xxxxxxxxxx), items the questions as JSON (an activity, a short math problem, two settings).
  // Rows go with their owner's account.
  ['0087_game_sets', `
    CREATE TABLE IF NOT EXISTS game_sets (id TEXT PRIMARY KEY, game_id TEXT NOT NULL, owner_id TEXT NOT NULL, items TEXT NOT NULL,
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS idx_game_sets_owner ON game_sets(owner_id, game_id);`],
  // A calendar a teacher connects to a class's schedule widget (services/dash-calendar.js; docs/decisions.md "Schedule: a
  // standard week, uploaded agendas, a connected calendar"). The address is a private link, so it lives here, never in
  // the widget's settings (which pinned widgets send to students): the widget keeps only this row's id and a name.
  ['0088_dash_feeds', `
    CREATE TABLE IF NOT EXISTS dash_feeds (id TEXT PRIMARY KEY, class_id TEXT NOT NULL, owner_id TEXT NOT NULL, url TEXT NOT NULL,
      name TEXT NOT NULL DEFAULT '', created_at INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS idx_dash_feeds_class ON dash_feeds(class_id);`],
  // Crossword (seed-games/crossword.json, docs/decisions.md "Crossword") is a Learn game: its own shelf step, as each new
  // Learn game gets (0062 is never edited).
  ['0089_crossword_shelf', "UPDATE games SET shelf='learn' WHERE source='seed' AND slug='crossword';"],
  // A game step's best score that came from a set where the teacher showed an answer (Oomba Canvas 1.3.0's Show answer:
  // those problems are not in the score). Shown to the class's staff only, beside that score (routes/progress.js).
  ['0090_step_progress_helped', 'ALTER TABLE step_progress ADD COLUMN helped INTEGER NOT NULL DEFAULT 0;'],
  // Story Library (docs/decisions.md "Story Library"; server/services/library.js). story_reads: each reader's own progress
  // on a book (furthest page, whether Read to me was used, the questions: marks = first try per question '1'/'0'/'-',
  // solved = got it right in the end '1'/'-'). A book assigned to a class is a lesson of kind 'story' with one step of
  // kind 'story' whose story_id names the book (lesson_steps.story_id), so the class page, due dates, the gradebook and
  // the Score treat it like an assigned game; its step_progress row holds done, the first-try marks and the score.
  ['0091_story_library', `CREATE TABLE IF NOT EXISTS story_reads (user_id TEXT NOT NULL, book_id TEXT NOT NULL, page INTEGER NOT NULL DEFAULT 0,
      pages INTEGER NOT NULL DEFAULT 0, aloud INTEGER NOT NULL DEFAULT 0, marks TEXT NOT NULL DEFAULT '', solved TEXT NOT NULL DEFAULT '',
      finished_at INTEGER, quiz_at INTEGER, started_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, PRIMARY KEY (user_id, book_id));
    CREATE INDEX IF NOT EXISTS story_reads_user ON story_reads(user_id, updated_at);
    ALTER TABLE lesson_steps ADD COLUMN story_id TEXT;`],
  // Virtual math manipulatives (docs/decisions.md "Virtual math manipulatives"; services/manipulatives.js), hidden while
  // it is tested. (0091 is also taken on an unmerged branch, so this starts at 0092; migrations run by name, a gap is fine.)
  // manip_boards: a grown-up's saved boards, each with its own share code (owner only lists and deletes them).
  // manip_sessions: a live session, owned by its teacher (host_id) and for one of their classes; its join code works
  // only for that class's students. manip_work: each joined student's own board in a session (state: the board as JSON,
  // their sticky notes included), seen by that student and the session's teacher only.
  ['0092_manipulatives', `
    CREATE TABLE IF NOT EXISTS manip_boards (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      code TEXT NOT NULL UNIQUE, tool TEXT NOT NULL, title TEXT NOT NULL, state TEXT NOT NULL, created_at INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS idx_manip_boards_owner ON manip_boards(owner_id, created_at);
    CREATE TABLE IF NOT EXISTS manip_sessions (id TEXT PRIMARY KEY, code TEXT NOT NULL UNIQUE,
      host_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, class_id TEXT NOT NULL REFERENCES classrooms(id) ON DELETE CASCADE,
      tool TEXT NOT NULL, title TEXT NOT NULL, pushed_state TEXT, pushed_at INTEGER, status TEXT NOT NULL DEFAULT 'active',
      created_at INTEGER NOT NULL, ended_at INTEGER);
    CREATE INDEX IF NOT EXISTS idx_manip_sessions_class ON manip_sessions(class_id, status);
    CREATE INDEX IF NOT EXISTS idx_manip_sessions_host ON manip_sessions(host_id, created_at);
    CREATE TABLE IF NOT EXISTS manip_work (session_id TEXT NOT NULL REFERENCES manip_sessions(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, state TEXT NOT NULL DEFAULT '{}', joined_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL, PRIMARY KEY (session_id, user_id));
    CREATE INDEX IF NOT EXISTS idx_manip_work_user ON manip_work(user_id);`],
  // Manipulatives live sessions as one shared room (docs/decisions.md "Virtual math manipulatives: the shared room"):
  // the teacher's own area on the room's board (room, as JSON, and when it last changed) and each student's square in
  // the room's grid (slot). Cursors and "Bring everyone to me" are never stored (services/manip-live.js).
  ['0093_manipulatives_room', `
    ALTER TABLE manip_sessions ADD COLUMN room TEXT NOT NULL DEFAULT '{}';
    ALTER TABLE manip_sessions ADD COLUMN room_at INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE manip_work ADD COLUMN slot INTEGER NOT NULL DEFAULT 0;`],
  // A live room's "Hide students' work" (docs/decisions.md "Virtual math manipulatives: hidden work"): 0, the default,
  // sends a student nothing of a classmate's square but its frame, name and hand; 1 when the teacher shows the work.
  ['0094_manipulatives_show_work', 'ALTER TABLE manip_sessions ADD COLUMN show_work INTEGER NOT NULL DEFAULT 0;'],
  // Figures, the standalone product (docs/decisions.md "Figures, the standalone product"; services/figures.js), hidden
  // while it is tested. One question-set model that a Figures worksheet uses now (purpose 'worksheet') and a test or a
  // lesson's Figure step can use later ('test', 'lesson'). question_sets: owned by its teacher (only the owner lists,
  // opens, prints or deletes it), of_version pins the Oomba Figures version its figures were checked with.
  // question_set_items: one figure question each, in order (pos): the kind, its data (JSON that passed OF.check), the
  // generator it came from (gen, with its seed: "regenerate numbers"), hide (what the student's copy leaves out), the
  // question text, answer_key (the OF.solve value the answer is), and the answer and worked lines worked out on the
  // server. figure_presets: a teacher's own saved figures per kind. figure_prefs: the teacher's "Power with AI" switch.
  ['0095_figures_question_sets', `
    CREATE TABLE IF NOT EXISTS question_sets (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL, grade TEXT NOT NULL DEFAULT '', subject TEXT NOT NULL DEFAULT '', purpose TEXT NOT NULL DEFAULT 'worksheet',
      of_version TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS idx_question_sets_owner ON question_sets(owner_id, purpose, updated_at);
    CREATE TABLE IF NOT EXISTS question_set_items (id TEXT PRIMARY KEY, set_id TEXT NOT NULL REFERENCES question_sets(id) ON DELETE CASCADE,
      pos INTEGER NOT NULL, kind TEXT NOT NULL, data TEXT NOT NULL, gen TEXT, seed INTEGER, hide TEXT, question TEXT NOT NULL DEFAULT '',
      answer_key TEXT, answer TEXT NOT NULL DEFAULT '', work TEXT NOT NULL DEFAULT '[]', points INTEGER NOT NULL DEFAULT 1);
    CREATE INDEX IF NOT EXISTS idx_question_set_items_set ON question_set_items(set_id, pos);
    CREATE TABLE IF NOT EXISTS figure_presets (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      kind TEXT NOT NULL, name TEXT NOT NULL, data TEXT NOT NULL, created_at INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS idx_figure_presets_owner ON figure_presets(owner_id, kind, created_at);
    CREATE TABLE IF NOT EXISTS figure_prefs (user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      ai INTEGER NOT NULL DEFAULT 1, updated_at INTEGER NOT NULL);`],
  // A Figures worksheet assigned to a class (docs/decisions.md "Figures: Assign to class"; services/figures-steps.js): a
  // lesson of kind 'figures' with one lesson step of kind 'figures'. The step keeps a snapshot of the worksheet's
  // questions in lesson_steps.items (figure data, question, answer, unit, value, dp, worked lines), so later edits to
  // the worksheet never change an assigned lesson; set_id names the worksheet it came from (question_sets.id, never read
  // back). of_version: the Oomba Figures version the figures are drawn with. show_answers: 1 when the teacher lets
  // students who handed in see the answers and worked lines once the due date is over (0, the default: never).
  ['0096_figures_steps', `
    ALTER TABLE lesson_steps ADD COLUMN of_version TEXT NOT NULL DEFAULT '';
    ALTER TABLE lesson_steps ADD COLUMN show_answers INTEGER NOT NULL DEFAULT 0;`],
  // An official game's question sets get a name of their own (docs/decisions.md "My worksheets in Crossword, The Big
  // Divide and Algebra Builder"): what the teacher calls it in their list. '' until they name it (the list then shows a
  // label made from the set). Only its owner ever sees it; it passes the site's text filter.
  ['0097_game_sets_title', "ALTER TABLE game_sets ADD COLUMN title TEXT NOT NULL DEFAULT '';"],
  // Manipulatives saving (docs/decisions.md "Virtual math manipulatives: saving and AI drafts"). manip_drafts: an AI
  // draft as a server job (services/manip-drafts.js, the Builder's pattern): status queued | running | interrupted |
  // done | failed, at most one unfinished per teacher (the unique index), step (the progress card's row) and steps (when
  // each row started, ms after the start, JSON), the request (the teacher's checked words, JSON), the result's summary
  // (JSON) and the board it was saved as (board_id). seen_at: the teacher saw how it ended. manip_boards.kind: 'template'
  // (a saved board with a share code: every board saved before this) or 'recent' (saved as the teacher works);
  // updated_at and opened_at for "Recent boards" and their 60 days. manip_sessions.opened_at: when the room was started
  // or last reopened (its 12 hours count from there).
  ['0098_manipulatives_saving', `
    CREATE TABLE IF NOT EXISTS manip_drafts (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      tool TEXT NOT NULL, request TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'queued', step INTEGER NOT NULL DEFAULT 0,
      steps TEXT NOT NULL DEFAULT '[]', result TEXT, error TEXT, board_id TEXT, attempt INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL, started_at INTEGER, ended_at INTEGER, seen_at INTEGER);
    CREATE UNIQUE INDEX IF NOT EXISTS manip_drafts_one_live ON manip_drafts(owner_id) WHERE status IN ('queued','running','interrupted');
    CREATE INDEX IF NOT EXISTS idx_manip_drafts_owner ON manip_drafts(owner_id, created_at);
    ALTER TABLE manip_boards ADD COLUMN kind TEXT NOT NULL DEFAULT 'template';
    ALTER TABLE manip_boards ADD COLUMN updated_at INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE manip_boards ADD COLUMN opened_at INTEGER NOT NULL DEFAULT 0;
    UPDATE manip_boards SET updated_at=created_at, opened_at=created_at;
    CREATE INDEX IF NOT EXISTS idx_manip_boards_kind ON manip_boards(owner_id, kind);
    ALTER TABLE manip_sessions ADD COLUMN opened_at INTEGER NOT NULL DEFAULT 0;
    UPDATE manip_sessions SET opened_at=created_at;`],
  // Figures answer types (docs/decisions.md "Figures: multiple choice and negative answers"): a worksheet question is
  // answered with a number (any sign) or by picking one of 2 to 6 options. answer_type 'number' (every question before
  // this) | 'choice'; choices: the options as a JSON list of strings, in the order students see them; correct: the index
  // of the right one (NULL while the teacher has not marked one). A number question keeps options it had, so switching
  // back to multiple choice brings them back. A lesson step's snapshot keeps the same three fields
  // in its items JSON (no column: an older snapshot without them is a number question).
  ['0099_figures_answer_types', `
    ALTER TABLE question_set_items ADD COLUMN answer_type TEXT NOT NULL DEFAULT 'number';
    ALTER TABLE question_set_items ADD COLUMN choices TEXT NOT NULL DEFAULT '[]';
    ALTER TABLE question_set_items ADD COLUMN correct INTEGER;`],
  // A lesson's Figure step and "Build a test" (docs/decisions.md "Figures: the lesson Figure step and Build a test"):
  // question_sets with purpose 'lesson' are the questions of one lesson's Figure step while the teacher edits them;
  // lesson_id names that lesson (NULL for a worksheet or a test). "Save to lesson" snapshots the set into the step
  // (lesson_steps.set_id names the set), as Assign does; deleting the lesson deletes its sets.
  ['0100_figures_lesson_sets', `
    ALTER TABLE question_sets ADD COLUMN lesson_id TEXT;
    CREATE INDEX IF NOT EXISTS idx_question_sets_lesson ON question_sets(lesson_id);`],
  // Figures opens to all teachers (docs/decisions.md): the language a worksheet, test or lesson set was made in, so its
  // generators deal their questions in it. Every set before this one was English.
  ['0101_figures_lang', `
    ALTER TABLE question_sets ADD COLUMN lang TEXT NOT NULL DEFAULT 'en';`],
  // The Builder's full playthrough of each version (services/playthrough.js): '' not played yet, 'pass' it reached the
  // game's end, 'fail' it did not (playthrough_report says why). Publishing needs a pass. (First numbered 0091 on its
  // branch; 0091 to 0101 were taken first.)
  ['0102_version_playthrough', "ALTER TABLE game_versions ADD COLUMN playthrough_status TEXT NOT NULL DEFAULT ''; ALTER TABLE game_versions ADD COLUMN playthrough_report TEXT NOT NULL DEFAULT '';"],
  // Oomba on the Manipulatives board (docs/decisions.md "Virtual math manipulatives: Oomba chat", services/manip-chat.js):
  // one conversation per teacher and board (board_key: a recent board's id, or 'new:<tool>' before its first save). turns:
  // the newest 20 as JSON ({ id, role 'me'|'oomba', text, at, change?, failed?, applied? }); pending_id: the teacher's
  // message whose answer is on its way (one at a time). Never student names or work. Goes with the board and the account.
  ['0103_manipulatives_chat', `
    CREATE TABLE IF NOT EXISTS manip_chats (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      board_key TEXT NOT NULL, tool TEXT NOT NULL, grade TEXT NOT NULL DEFAULT '', turns TEXT NOT NULL DEFAULT '[]',
      pending_id TEXT, pending_at INTEGER, updated_at INTEGER NOT NULL);
    CREATE UNIQUE INDEX IF NOT EXISTS manip_chats_board ON manip_chats(owner_id, board_key);`],
  // Mistake Hunt (seed-games/mistake-hunt.json, docs/decisions.md "Mistake Hunt") is a Learn game: its own shelf step, as
  // each new Learn game gets (0062 is never edited). Its passage sets live in game_sets (0097's title); no new table.
  ['0104_mistake_hunt_shelf', "UPDATE games SET shelf='learn' WHERE source='seed' AND slug='mistake-hunt';"],
  // Mistake Hunt, Phase 3 (docs/decisions.md "Mistake Hunt, Phase 3"). proof_chats: Oomba's chat on a passage set
  // (services/proof-chat.js), one per teacher and set (set_key: the saved set's id, or 'new' before its first save), the
  // newest 20 turns as JSON, like manip_chats; never student names or work; goes with the set and the account.
  // proof_insights: "Oomba's read" of a graded proofread step (services/proof-insights.js), cached per assigned lesson
  // and step until a new hand-in arrives (handed: how many had handed in when it was made). Counts only went to the AI;
  // the row holds Oomba's few sentences, no names.
  ['0105_mistake_hunt_chat', `
    CREATE TABLE IF NOT EXISTS proof_chats (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      set_key TEXT NOT NULL, grade TEXT NOT NULL DEFAULT '', turns TEXT NOT NULL DEFAULT '[]',
      pending_id TEXT, pending_at INTEGER, updated_at INTEGER NOT NULL);
    CREATE UNIQUE INDEX IF NOT EXISTS proof_chats_set ON proof_chats(owner_id, set_key);
    CREATE TABLE IF NOT EXISTS proof_insights (class_lesson_id TEXT NOT NULL, step_id TEXT NOT NULL, lang TEXT NOT NULL DEFAULT 'en',
      handed INTEGER NOT NULL, body TEXT NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY (class_lesson_id, step_id));`],
  // Mistake Hunt: the free AI cap, hints (docs/decisions.md "Mistake Hunt: free AI cap, hints, assign choice").
  // proof_ai_days: a free teacher's AI requests on one UTC calendar day (services/proof-ai.js take: one atomic upsert, so
  // a restart or a deploy never resets the count); rows older than a week are pruned. proof_ai_drafts: a hash of each
  // passage Oomba drafted for a teacher (never the text), kept 7 days, so why lines for those passages stay free.
  // step_progress.hints: how many hints a student asked for on a graded proofread step (counted by the server).
  ['0106_mistake_hunt_limits', `
    CREATE TABLE IF NOT EXISTS proof_ai_days (user_id TEXT NOT NULL, day TEXT NOT NULL, n INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (user_id, day));
    CREATE INDEX IF NOT EXISTS proof_ai_days_day ON proof_ai_days(day);
    CREATE TABLE IF NOT EXISTS proof_ai_drafts (user_id TEXT NOT NULL, hash TEXT NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY (user_id, hash));
    CREATE INDEX IF NOT EXISTS proof_ai_drafts_at ON proof_ai_drafts(created_at);
    ALTER TABLE step_progress ADD COLUMN hints INTEGER NOT NULL DEFAULT 0;`],
  // Oomba's shared chat engine (services/oomba-chat.js; docs/decisions.md "Figures: Oomba's chat and the shared chat
  // engine"), first used by Figures. oomba_chats: one conversation per teacher, surface ('figures') and context key (a
  // worksheet's id); turns: the newest turns as JSON ({ id, role 'me'|'oomba', text, at, quote?, change?, undo?, failed?,
  // for? }), never student names or work. oomba_turns: each message's answer as a server job (queued | running |
  // interrupted | done | failed), its progress (step, steps: ms after the start each row began), attempt, error, and
  // seen_at (the teacher saw how it ended: "finished while you were away"). live_key: the surface's one-live-turn rule
  // ('<surface>:<owner>' for one per teacher, 'chat:<id>' for one per conversation), held by the partial unique index.
  // (First numbered 0106 on its branch; main took 0106 for Mistake Hunt's limits first.)
  ['0107_figures_chat', `
    CREATE TABLE IF NOT EXISTS oomba_chats (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      surface TEXT NOT NULL, ctx_key TEXT NOT NULL, turns TEXT NOT NULL DEFAULT '[]', updated_at INTEGER NOT NULL);
    CREATE UNIQUE INDEX IF NOT EXISTS oomba_chats_ctx ON oomba_chats(owner_id, surface, ctx_key);
    CREATE TABLE IF NOT EXISTS oomba_turns (id TEXT PRIMARY KEY, chat_id TEXT NOT NULL REFERENCES oomba_chats(id) ON DELETE CASCADE,
      owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, surface TEXT NOT NULL, live_key TEXT NOT NULL, me_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'queued', step INTEGER NOT NULL DEFAULT 0, steps TEXT NOT NULL DEFAULT '[]', attempt INTEGER NOT NULL DEFAULT 0,
      error TEXT, created_at INTEGER NOT NULL, started_at INTEGER, ended_at INTEGER, seen_at INTEGER);
    CREATE UNIQUE INDEX IF NOT EXISTS oomba_turns_one_live ON oomba_turns(live_key) WHERE status IN ('queued','running','interrupted');
    CREATE INDEX IF NOT EXISTS idx_oomba_turns_owner ON oomba_turns(owner_id, surface, ended_at);
    CREATE INDEX IF NOT EXISTS idx_oomba_turns_chat ON oomba_turns(chat_id);`],
  // Oomba, the teaching companion (services/companion.js; docs/decisions.md "Oomba teaching companion"), a surface of the
  // shared chat engine. oomba_chats.opts: a conversation's own switches as JSON ({ web: false } when the teacher turned
  // web search off for it). oomba_files: what a teacher attached to a conversation: a document's text (read and scrubbed
  // on upload, at most 10,000 characters; the file itself is never kept) or a picture (a cleaned JPEG with no metadata,
  // kept only until the answer that reads it is done and never longer than a day: then bytes is emptied and only its
  // name and size stay). Both go with the conversation (and with the account).
  ['0108_teacher_companion', `
    ALTER TABLE oomba_chats ADD COLUMN opts TEXT NOT NULL DEFAULT '{}';
    CREATE TABLE IF NOT EXISTS oomba_files (id TEXT PRIMARY KEY, chat_id TEXT NOT NULL REFERENCES oomba_chats(id) ON DELETE CASCADE,
      owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, kind TEXT NOT NULL, name TEXT NOT NULL DEFAULT '', meta TEXT NOT NULL DEFAULT '{}',
      text TEXT, bytes BLOB, used_at INTEGER, created_at INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS idx_oomba_files_chat ON oomba_files(chat_id);
    CREATE INDEX IF NOT EXISTS idx_oomba_files_owner ON oomba_files(owner_id, created_at);`],
  // Dashboard points: reasons, whole-class points, the student's view and Google Classroom (services/dash.js;
  // docs/decisions.md "Dashboard points: reasons, whole-class points, the student's view and Google Classroom").
  // dash_point_awards: one row per point given (who gave it, the student or NULL for the whole class, the reason, when;
  // gc: '' not posted, 'posted' or 'failed', gc_id the Classroom announcement's id so Undo can take it back), for the
  // Recent lists and Undo. At most a year and 2,000 rows per class. dash_class_points: the whole class's points per
  // reason (one point for the class is one row's count, never one per student). dash_class.points_gc: "Also post to
  // Google Classroom" for this class (off unless a teacher turns it on).
  ['0109_dash_point_awards', `
    CREATE TABLE IF NOT EXISTS dash_point_awards (id TEXT PRIMARY KEY, class_id TEXT NOT NULL, user_id TEXT, reason TEXT NOT NULL, by_id TEXT,
      at INTEGER NOT NULL, gc TEXT NOT NULL DEFAULT '', gc_id TEXT);
    CREATE INDEX IF NOT EXISTS idx_dash_point_awards_class ON dash_point_awards(class_id, at);
    CREATE INDEX IF NOT EXISTS idx_dash_point_awards_user ON dash_point_awards(user_id);
    CREATE TABLE IF NOT EXISTS dash_class_points (class_id TEXT NOT NULL, reason TEXT NOT NULL, n INTEGER NOT NULL DEFAULT 0, at INTEGER NOT NULL,
      PRIMARY KEY (class_id, reason));
    ALTER TABLE dash_class ADD COLUMN points_gc INTEGER NOT NULL DEFAULT 0;`],
  // The book maker in the Story Library (services/storybook.js; docs/storybook-builder.md). made_books: a teacher's own
  // books (the book as JSON: pages, words, choices, picture specs; setup: what the teacher chose and typed before the
  // first draft, already scrubbed of names, emails, phone numbers and links; rev: bumped on every save, for conflicts).
  // made_book_pics: the teacher's own pictures (a cleaned JPEG with no metadata, checked for people; book_id NULL while
  // the setup steps hold it, claimed by the book on Start, and dropped after a day if never claimed). made_book_classes:
  // the classes a book is shared with (students of those classes read it in the library). made_book_reads: where each
  // reader is (the page, the way they came: a CYOA trail, and the endings found). made_book_ai_days: a teacher's Oomba
  // turns on one UTC day (the daily cap: one atomic upsert, never in memory).
  ['0110_storybooks', `
    CREATE TABLE IF NOT EXISTS made_books (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL DEFAULT '', kind TEXT NOT NULL DEFAULT 'linear', source TEXT NOT NULL DEFAULT 'ai', setup TEXT NOT NULL DEFAULT '{}',
      book TEXT NOT NULL DEFAULT '{}', rev INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS idx_made_books_owner ON made_books(owner_id, updated_at);
    CREATE TABLE IF NOT EXISTS made_book_pics (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      book_id TEXT REFERENCES made_books(id) ON DELETE CASCADE, name TEXT NOT NULL DEFAULT '', width INTEGER NOT NULL DEFAULT 0,
      height INTEGER NOT NULL DEFAULT 0, bytes BLOB NOT NULL, created_at INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS idx_made_book_pics_book ON made_book_pics(book_id);
    CREATE INDEX IF NOT EXISTS idx_made_book_pics_owner ON made_book_pics(owner_id, created_at);
    CREATE TABLE IF NOT EXISTS made_book_classes (book_id TEXT NOT NULL REFERENCES made_books(id) ON DELETE CASCADE, class_id TEXT NOT NULL,
      shared_by TEXT, shared_at INTEGER NOT NULL, PRIMARY KEY (book_id, class_id));
    CREATE INDEX IF NOT EXISTS idx_made_book_classes_class ON made_book_classes(class_id);
    CREATE TABLE IF NOT EXISTS made_book_reads (user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, book_id TEXT NOT NULL REFERENCES made_books(id) ON DELETE CASCADE,
      page_id TEXT NOT NULL DEFAULT '', trail TEXT NOT NULL DEFAULT '', endings TEXT NOT NULL DEFAULT '', finished_at INTEGER,
      started_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, PRIMARY KEY (user_id, book_id));
    CREATE INDEX IF NOT EXISTS idx_made_book_reads_book ON made_book_reads(book_id);
    CREATE TABLE IF NOT EXISTS made_book_ai_days (user_id TEXT NOT NULL, day TEXT NOT NULL, n INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (user_id, day));
    CREATE INDEX IF NOT EXISTS idx_made_book_ai_days_day ON made_book_ai_days(day);`],
  // The book maker's picture maker (services/storybook-draw.js; docs/storybook-builder.md "Pictures"). made_book_pics
  // also holds the pictures the picture model drew (kind 'page' or 'sheet', a checked WebP; mime says which file type a
  // row holds; 'upload' is the teacher's own JPEG). made_book_draws: one row per picture to draw for a book (target
  // 'page:<page id>' or 'cast:<name>'), the queue the in-process drawer works through (state queued, drawing, done or
  // fallback with a reason), the picture kept (pic_id), the fingerprint of what it drew (hash) and the teacher's
  // Redraw note (scrubbed). The daily picture count is a made_book_ai_days row ('<day>:draw').
  ['0111_storybook_draws', `
    ALTER TABLE made_book_pics ADD COLUMN kind TEXT NOT NULL DEFAULT 'upload';
    ALTER TABLE made_book_pics ADD COLUMN mime TEXT NOT NULL DEFAULT 'image/jpeg';
    CREATE TABLE IF NOT EXISTS made_book_draws (id TEXT PRIMARY KEY, book_id TEXT NOT NULL REFERENCES made_books(id) ON DELETE CASCADE,
      owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, target TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'queued',
      reason TEXT NOT NULL DEFAULT '', note TEXT NOT NULL DEFAULT '', pic_id TEXT, hash TEXT NOT NULL DEFAULT '',
      attempts INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, UNIQUE (book_id, target));
    CREATE INDEX IF NOT EXISTS idx_made_book_draws_state ON made_book_draws(state, created_at);
    CREATE INDEX IF NOT EXISTS idx_made_book_draws_owner ON made_book_draws(owner_id);`],
  // Book pictures and Google's rate limits (services/storybook-draw.js; docs/storybook-builder.md "Pictures: rate limits
  // and quota"): a picture Google answered with a 429 goes back to the queue with not_before (ms: not tried before then)
  // and wait_since (ms: when it first had to wait), so it is tried again later without using up its attempts, and falls
  // back to the art pack only once it has waited too long.
  ['0112_storybook_draw_wait', `
    ALTER TABLE made_book_draws ADD COLUMN not_before INTEGER;
    ALTER TABLE made_book_draws ADD COLUMN wait_since INTEGER;`],
  // Book pictures: what Oomba asked the picture maker for (services/storybook-draw.js; docs/storybook-builder.md "What
  // Oomba asked for"): the final prompt text of each picture, as sent to Google (students' names already taken out; no
  // pictures), so the book's owner can see it under the picture and anyone checking can see no art-kit words went out.
  ['0113_storybook_draw_prompt', `
    ALTER TABLE made_book_draws ADD COLUMN prompt TEXT NOT NULL DEFAULT '';`],
  // Typing Pets (seed-games/typing-pets.json) is a Learn game: its own shelf step, as each new Learn game gets.
  ['0114_typing_pets_shelf', "UPDATE games SET shelf='learn' WHERE source='seed' AND slug='typing-pets';"],
  // Typing Pets class goals (services/typing.js getGoal/setGoal): one speed and accuracy goal per class.
  ['0115_typing_goals', `
    CREATE TABLE IF NOT EXISTS typing_goals (class_id TEXT PRIMARY KEY REFERENCES classrooms(id) ON DELETE CASCADE,
      wpm INTEGER NOT NULL, acc INTEGER NOT NULL, updated_at INTEGER NOT NULL);`],
  // A daily practice goal beside it (minutes a day; 0 = none).
  ['0116_typing_goal_minutes', "ALTER TABLE typing_goals ADD COLUMN mins INTEGER NOT NULL DEFAULT 0;"],
  // A minimum to unlock each next Typing Pets lesson (accuracy %, speed wpm; 0 = none), for the class's students.
  ['0117_typing_unlock', `
    ALTER TABLE typing_goals ADD COLUMN unlock_acc INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE typing_goals ADD COLUMN unlock_wpm INTEGER NOT NULL DEFAULT 0;`],
];

/** 0085's backfill (exported for its test): what each lesson is (a ready-made course's copy; one game assigned, by
 *  Assign or the same shape; a live set sent as homework; else a teacher-made lesson), then a folder for each teacher-made
 *  lesson that has games (its games in step order, de-duplicated), and its open assignments retired (soft-removed,
 *  listed in lessons_retired). Lessons, steps and students' work are all kept. */
export function retireLessons(conn) {
  conn.exec(`UPDATE lessons SET kind='course' WHERE kind='lesson' AND template_key!='';
    UPDATE lessons SET kind='game' WHERE kind='lesson' AND (id IN (SELECT target FROM audit_log WHERE action='lesson.assignGame')
      OR (summary='' AND (SELECT COUNT(*) FROM lesson_steps s WHERE s.lesson_id=lessons.id)=1
        AND EXISTS (SELECT 1 FROM lesson_steps s JOIN games g ON g.id=s.game_id WHERE s.lesson_id=lessons.id AND s.kind='game' AND g.title=lessons.title)));
    UPDATE lessons SET kind='homework' WHERE kind='lesson' AND summary='' AND (SELECT COUNT(*) FROM lesson_steps s WHERE s.lesson_id=lessons.id)=1
      AND EXISTS (SELECT 1 FROM lesson_steps s WHERE s.lesson_id=lessons.id AND s.kind='quiz' AND s.set_id IS NOT NULL AND s.title=lessons.title);`);
  const t = Date.now();
  const lessons = conn.prepare("SELECT id, owner_id, title FROM lessons WHERE kind='lesson' AND archived_at IS NULL AND id NOT IN (SELECT from_lesson FROM game_folders WHERE from_lesson IS NOT NULL) ORDER BY created_at").all();
  const gamesOf = conn.prepare(`SELECT DISTINCT s.game_id FROM lesson_steps s JOIN games g ON g.id=s.game_id
    WHERE s.lesson_id=? AND s.kind='game' AND s.game_id IS NOT NULL AND g.status!='deleted' ORDER BY s.position`);
  const pos = new Map();
  for (const l of lessons) {
    const ids = gamesOf.all(l.id).map(r => r.game_id); if (!ids.length) continue;
    const id = uid(12), p = (pos.get(l.owner_id) ?? (conn.prepare('SELECT COALESCE(MAX(position),-1) m FROM game_folders WHERE owner_id=?').get(l.owner_id).m)) + 1;
    pos.set(l.owner_id, p);
    conn.prepare('INSERT INTO game_folders(id, owner_id, name, position, from_lesson, created_at, updated_at) VALUES (?,?,?,?,?,?,?)').run(id, l.owner_id, String(l.title || '').slice(0, 60) || 'Lesson', p, l.id, t, t);
    ids.forEach((g, i) => conn.prepare('INSERT OR IGNORE INTO game_folder_items(folder_id, game_id, position, added_at) VALUES (?,?,?,?)').run(id, g, i, t));
  }
  const open = conn.prepare("SELECT cl.id, cl.lesson_id FROM class_lessons cl JOIN lessons l ON l.id=cl.lesson_id WHERE l.kind='lesson' AND cl.removed_at IS NULL").all();
  for (const cl of open) {
    conn.prepare('INSERT OR IGNORE INTO lessons_retired(class_lesson_id, lesson_id, retired_at) VALUES (?,?,?)').run(cl.id, cl.lesson_id, t);
    conn.prepare('UPDATE class_lessons SET removed_at=? WHERE id=?').run(t, cl.id);
  }
}

const CODE_LETTERS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
/** A new 6-character friend code no account has (no 0/O, 1/I/L, so it reads aloud clearly). */
export function newFriendCode(conn = db) {
  const taken = conn.prepare('SELECT 1 FROM users WHERE friend_code=?');
  for (;;) { const c = Array.from({ length: 6 }, () => CODE_LETTERS[crypto.randomInt(CODE_LETTERS.length)]).join(''); if (!taken.get(c)) return c; }
}

db.exec('CREATE TABLE IF NOT EXISTS migrations (name TEXT PRIMARY KEY, applied_at INTEGER NOT NULL)');
export function migrate(extra = []) {
  // The game-folder migrations were numbered 0084/0085 on their branch until main took 0084 (dash_builds): a database
  // that ran them under the old names keeps them as run (renamed), so they never run twice.
  if (db.prepare("SELECT 1 FROM migrations WHERE name='0084_game_folders'").get()) {
    db.prepare("UPDATE migrations SET name='0086_game_folder_sharing' WHERE name='0085_game_folder_sharing'").run();
    db.prepare("UPDATE migrations SET name='0085_game_folders' WHERE name='0084_game_folders'").run();
  }
  const applied = new Set(db.prepare('SELECT name FROM migrations').all().map(r => r.name));
  // An entry is [name, sql] or [name, sql, after]: after(db) runs in the same transaction, for a backfill SQL can't do.
  for (const [name, sql, after] of [...MIGRATIONS, ...extra]) {
    if (applied.has(name)) continue;
    db.transaction(() => { db.exec(sql); if (after) after(db); db.prepare('INSERT INTO migrations(name, applied_at) VALUES (?, ?)').run(name, now()); })();
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
