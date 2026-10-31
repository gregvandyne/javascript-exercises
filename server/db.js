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
  // The player's own Oomba character (server/services/character.js): a small JSON parts spec from the kit's own lists
  // (species, body, skin tone 0-7, hair, eyes, outfit, colours, one accessory, Bold wear), never a picture or a name.
  // NULL = not designed yet (games then get the kit's default look). Deleted with the account row.
  ['0035_character_spec', `ALTER TABLE users ADD COLUMN character_spec TEXT;`],
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
