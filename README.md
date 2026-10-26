# Oomba Academy

A free, kid-safe website where anyone can **play** web games and **build** their own by talking to an AI Builder (Claude).
Think "Roblox for web games", for a 7-year-old, a 12-year-old and their parent sharing one phone.

- **Play**: one-tap guest play, home rails, search (games and builders), ratings, likes, leaderboards, live "N playing" counts, cloud saves.
- **Build**: the Studio — chat with the Builder (a live **Behind the scenes** card shows each step it takes, with short tips about how AI works that can be switched off), live sandboxed preview, version history with restore, Private / Friends / Everyone sharing, and **updates to games you already published** (players keep the old version while an update is reviewed).
- **Friends + chat**: add friends by a 6-character code; friends-only, filtered text chat with quick-chat chips, block and report.
- **Safety**: every game runs in an opaque-origin sandbox with a strict CSP and no network; every version is scanned; public games are reviewed; reports auto-hide games; an admin panel handles review, reports, chat reports, bans and the audit log.
- **13 languages**: English (US/UK), Português, Français, Español, Deutsch, עברית, 日本語, العربية, Русский, Italiano, 繁體中文 and Nederlands, picked with the 🌐 menu; right-to-left for Hebrew and Arabic; the Builder replies in the kid's language. Translators start at `server/i18n/README.md`.
- **Schools** (enterprise, step 1): schools, school admins, teachers, classrooms with join codes, school accounts with printable login cards, students joining with their own account (teacher approves), and school rules for school accounts on the game site.
- **Lesson plans** (schools, step 2): a lesson library with folders, lessons made of read, play and build steps, ✨ Draft with AI, sharing and copying within the school, and assigning lessons to classes in units with open and due dates. See `docs/decisions.md`.
- **Progress and gradebook** (schools, step 3): students mark steps done, answer written questions and play games from the lesson (scores and play time count); teachers see a gradebook per class (CSV), each lesson's progress, review answers and give feedback. See `docs/decisions.md`.
- **No ads**: there are no ads, sponsored cards or purchases anywhere on the site.

## Run it locally (Node 22)

```bash
npm install && npm run seed && npm start
# open http://localhost:3000
```

`npm run seed` creates the admin account (prints a random password unless you set `ADMIN_PASSWORD`), the official **Oomba Academy** builder account (`OombaAcademy`), and the featured launch games: Shark Plank (hangman for early readers), Ring Rumble (two-player wrestling; on a desktop both players share one keyboard), Footy Tycoon (a soccer property board game), Drop Four (connect-four with a three-level robot), Happy Putt (18-hole mini golf inspired by *Happy Gilmore*), Castle Clash (chess with lessons, puzzles and a four-level robot), Brick Drop (a falling-blocks puzzle with Marathon, Sprint 40 and Zen modes), Word Hunt (themed word searches with a daily puzzle and a pass-the-phone race), Sum Racer (a maths kart race over seven tracks, from adding within 10 to mixed operations), Munch Maze (an original arcade maze chase with three mazes and an Easy mode), Word Peek (a daily guess-the-word game with 4, 5 and 6-letter modes), Swish Flick (flick-to-shoot basketball with an arcade mode and a 24-level story mode), Loop Lab (a beat-making music studio with starter beats, challenges and saved songs) and Beat Lanes (a tap-to-the-beat rhythm game with nine synthesized songs and three difficulties). The list lives in `SEED_GAMES` in `scripts/seed.js`. Re-running the seed is safe and publishes an updated version of a launch game when its HTML changed.

No API key is needed: without `ANTHROPIC_API_KEY` the Builder uses a built-in mock that still makes real, playable games from templates, and public publishing goes to the human review queue.

## Tests

```bash
npm test             # unit + safety suites (node:test, in-memory DB)
npm run test:e2e     # Playwright end-to-end (starts its own server + temp DB, mock Builder)
npm run screenshots  # BASE=http://localhost:3000 ADMIN_PASSWORD=... → screenshots/ at 390/1280 px, light/dark
node scripts/layout-audit.js  # BASE=... AUDIT_USERS="guest,teacher:name:pass" → boxes that touch, on every page it can reach
node scripts/contrast.js      # every text/background token pair, light and dark, against WCAG AA
npm run i18n:check   # per language: missing / extra keys and placeholder problems
```

In environments with a pre-installed Chromium at `/opt/pw-browsers`, the e2e config uses it automatically; otherwise run `npx playwright install chromium` once.

## Configuration (env vars)

One row per variable. The server reads them in `server/config.js` (plus `TRUST_PROXY` in `server/app.js`); the
container start (`scripts/entrypoint.sh`) reads the Litestream ones; `deploy/docker-compose.yml` reads the last group.

**Site and hosting**

| Variable | Default | What it does |
|---|---|---|
| `PORT` | `3000` | HTTP port. |
| `NODE_ENV` | `development` | `production` turns on secure cookies, HSTS, long static caching and screenshots. The Docker image sets it. |
| `BRB_DATA_DIR` | `./data` (`/data` in Docker) | The SQLite file (`brb.db`), cover pictures (`shots/`), profile photos (`avatars/`), Builder uploads (`uploads/`) and `npm run backup` copies (`backups/`). Must be a persistent **block** disk; see `BRB_JOURNAL_MODE`. |
| `BRB_JOURNAL_MODE` | `WAL` | SQLite journal mode: `WAL` on a local/block disk (EBS, Azure managed disk, Render disk). `DELETE` on a network file system (EFS/NFS, Azure Files/SMB), where WAL's shared memory doesn't work. Also accepted: `TRUNCATE`, `PERSIST`. Either way: **one app instance, one writer**. |
| `PUBLIC_URL` | unset | The site's public address, e.g. `https://oomba.ai` (origin only). Login cards print it, and the same-origin checks accept it, so a CDN or gateway that rewrites the Host header (CloudFront, Front Door, Application Gateway) works. It also moves people off old names: once the server has checked that `PUBLIC_URL` really reaches it (a self-check at start, retried until it passes), page loads on an old name (Render's own `*.onrender.com` name, the `www.` twin of `PUBLIC_URL`, and `REDIRECT_HOSTS`) go to the same page on `PUBLIC_URL`, and signed-in people stay signed in (a one-minute, single-use hand-off). API calls and game frames are still answered on the old name, so open tabs keep working. Other names (a CDN's origin name) are never redirected. Unset: the Host header, as before, and no redirects. |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | unset | Sign in with Google (school Google accounts, e.g. Chromebooks). Off until both are set, and in production also `PUBLIC_URL` (the redirect address is `PUBLIC_URL/auth/google/callback`). Make a "Web application" OAuth client in Google Cloud with that redirect address and only the `openid email profile` scopes. The secret is never logged. |
| `REDIRECT_HOSTS` | unset | Extra old names to move to `PUBLIC_URL`, comma-separated (`old.example.com,www.old.example.com`, `host:port` allowed). Only used when `PUBLIC_URL` is set. |
| `TRUST_PROXY` | off | How many proxies in front of the app to trust for the client's IP (rate limits): see [the table below](#trust_proxy-per-platform). Leave off when the app is reached directly. If a proxy's `X-Forwarded-For` arrives while it is off, the log warns once. The compose stack sets it to Caddy's network, `172.30.42.0/24`; `2` in `deploy/.env` with a CDN in front of Caddy. |
| `SESSION_SECRET` | stored in the DB | Signs sign-in cookies and game-frame tokens. Unset, the app makes one and keeps it in the database (`settings` table) and **warns at every production start**. Moving hosts: `node scripts/export-session-secret.js` copies the current one into a file so nobody is signed out. |
| `REQUIRE_SESSION_SECRET` | off | `1`: refuse to start without `SESSION_SECRET` (no database fallback), or with one shorter than 32 characters. Set it on new hosts. |
| `SHUTDOWN_GRACE_SECONDS` | `25` | After SIGTERM, how long open requests and running Builder turns get to finish before the process exits. Keep it below the platform's kill timeout (Render ~30 s; Docker 10 s unless `stop_grace_period`/`--stop-timeout` is raised; ECS `stopTimeout`). |
| `KEEPALIVE_TIMEOUT_SECONDS` | `65` | Idle keep-alive connections stay open this long, longer than the load balancer's idle timeout (AWS ALB 60 s), which avoids random 502s. Raise it if you raise the balancer's. |
| `MAINTENANCE_MODE` | off | `1`: every page answers 503 "moving to a new home, back in a few minutes" (`/health` still answers), so nothing writes while data is copied. |
| `MOVED_TO_URL` | unset | e.g. `https://play.example.com`: every request is redirected there with the same path (302; 307 for POSTs). For the old host after a move. A request that arrives on that same name (its DNS still points at the old host) gets the "moving" page instead of a redirect loop. |
| `MOVED_PERMANENTLY` | off | `1`: make the `MOVED_TO_URL` redirects permanent (301 / 308) once the new site is known to work. Browsers remember these. |
| `LOG_REQUESTS` | `1` | `0` turns off the JSON request log (`/health` probes are never logged). |

On/off settings (`REQUIRE_SESSION_SECRET`, `MAINTENANCE_MODE`, `MOVED_PERMANENTLY`) take `1`/`true`/`yes`/`on` or
`0`/`false`/`no`/`off`; anything else stops the start with a message, like a malformed `PUBLIC_URL` does.

**Accounts, AI and limits**

| Variable | Default | What it does |
|---|---|---|
| `ADMIN_USERNAME` | `admin` | Admin account made by the seed (every container start runs it). |
| `ADMIN_PASSWORD` | random | The admin's password, set when the seed first sees this value (every container start runs the seed): a password the admin then changes on the Me page survives restarts, until `ADMIN_PASSWORD` itself changes (set a new value to reset a forgotten one). Unset, the first seed prints a random one. |
| `DEMO_TEACHER_PASSWORD` | unset | Demo school for showing schools: creates "Oomba Academy Demo School" (at `/school/magic-cups-demo-school`) with `DemoTeacher` and `DemoStudent` (this password, reset on every boot), four classmates, a Demo Class and sample lessons (added again only if the teacher's library is empty). |
| `ANTHROPIC_API_KEY` | – | Enables the real Builder, input screening classifier and model review. Without it the built-in mock Builder runs. |
| `BUILDER_MODEL` | built in (`server/config.js`) | Model for normal Builder turns (and public reviews unless `REVIEW_MODEL` is set). |
| `BUILDER_PRO_MODEL` | built in (`server/config.js`) | Model for "Pro quality" Builder turns. |
| `BUILDER_SCREEN_MODEL` | built in | Small model for input screening and picture checks. |
| `REVIEW_MODEL` | `BUILDER_MODEL` | Model for the automatic review of public games. |
| `BUILDER_FALLBACKS` | on | `0` turns off the API's server-side model fallback for Builder turns (used when the first model is overloaded). |
| `BUILDER_DAILY_TURNS` | `60` | Builder turns per user per day. |
| `BUILDER_MAX_TOKENS` | `32000` | Max output tokens per Builder turn. |
| `AI_DAILY_BUDGET_USD` | `5` | Most the site spends on the AI per UTC day. At the cap the Builder goes offline (mock builder), picture uploads pause and public reviews wait for a person. `0` turns the AI off. |
| `AI_MONTHLY_BUDGET_USD` | `50` | Same, per calendar month. Today's and this month's spend show on `/admin`. Also set a spend limit in the Anthropic Console as the hard backstop. |
| `CHAT_DAILY_LIMIT` | `300` | Max chat messages per user per day. |
| `REPORTS_TO_HIDE` | `3` | Open reports from different players that auto-hide a game. |
| `CONTACT_EMAIL` | – | Where grown-ups write to the team (deletion, export, a lost password). Shown on `/parents` and in the footer; set it before launch (production logs a warning without it). |
| `BOOTSTRAP_SCHOOLS` | unset | Schools to set up at start-up without the admin pages, each with an existing account as its school admin: `[{"name":"Oak Hill Primary","admin":"MsSmith"}]`. Safe to leave set (done steps are skipped); a bad value or a missing account is logged and skipped. A school admin can also create classes and teaches the ones they create. |
| `POSTHOG_KEY` | – | Optional product analytics (off unless set; never sends usernames or text). |
| `POSTHOG_HOST` | `https://us.i.posthog.com` | PostHog address. |

**Screenshots (headless Chromium)**

| Variable | Default | What it does |
|---|---|---|
| `BRB_SNAPSHOTS` | on in production | Game screenshots: cover pictures of Studio games, the Builder's `playtest_game` tool and the pictures for the public review. `1` on in development; `0` off, also when `SNAPSHOT_URL` is set. Without a worker, Chromium runs inside the app (Render today) and needs about 1 GB of RAM on top of it: plan **2 GB+** for that server. |
| `BRB_CHROMIUM` | Playwright's | Path to a Chromium / headless-shell binary, if not the one Playwright installed. |
| `SNAPSHOT_URL` | unset | The screenshot worker's address (`server/shots-worker.js`), e.g. `http://shots:4900`: the app then sends every screenshot job there and never starts Chromium itself. The compose stack sets it (the worker runs by default there). Unset: Chromium in the app (Render). If the worker is down, busy or refuses the token, nothing breaks: covers wait and are taken when it is back, playtests and reviews go ahead without pictures. |
| `SHOTS_TOKEN` | – | Shared secret between the app and the worker (`openssl rand -hex 32`); set the same value on both. The worker refuses to start without it. Required in `deploy/.env`: the compose file hands it to the app and to the worker (`shots`), which always runs. |
| `SHOTS_PORT` | `4900` | The worker's port (set on the worker). |

The worker is the same image started as `node server/shots-worker.js`. Give it **only** `SHOTS_TOKEN` and `SHOTS_PORT`
(plus `HOME=/tmp` with a read-only file system):
it reads its settings from the same `config.js`, which reads every variable it is given, so never hand it the app's
environment file, the session secret, the AI key or the data disk. It needs no internet: the 3D library comes from the
image's own `public/vendor/three/`. Each job writes one JSON log line (`job done` / `job failed`, never the game).

**Off-host backups with Litestream (container only)**

| Variable | Default | What it does |
|---|---|---|
| `LITESTREAM_REPLICA_URL` | unset | Turns on continuous replication of `brb.db`: `s3://BUCKET/PATH` or `abs://STORAGEACCOUNT@CONTAINER/PATH`; an S3-compatible store that isn't AWS: `s3://BUCKET/PATH?endpoint=https://...&forcePathStyle=true`. The container then runs the app under `litestream replicate` (config: `deploy/litestream.yml`, in the image at `/etc/litestream.yml`). Needs `BRB_JOURNAL_MODE=WAL`. Turn on bucket versioning / soft delete first (deploy guides, section 2). Restore: `docs/runbook-restore.md`. |
| `LITESTREAM_ACCESS_KEY_ID` / `LITESTREAM_SECRET_ACCESS_KEY` | – | S3 keys. Leave empty on EC2/ECS with an IAM role. |
| `AWS_REGION` | – | The S3 bucket's region (read by Litestream's AWS client). |
| `LITESTREAM_AZURE_SAS_TOKEN` | – | Azure Blob: a SAS token for the one container. Leave empty on an Azure VM whose managed identity has *Storage Blob Data Contributor* on the container. |
| `LITESTREAM_AZURE_ACCOUNT_KEY` | – | Azure Blob storage account key. Avoid: it controls the whole account, soft-delete settings included. |
| `LITESTREAM_AUTO_RESTORE` | `1` | With a replica set and **no** `brb.db` on the disk, the container restores the latest backup before starting (a replaced or empty disk heals itself). `0` starts empty instead. If the restore fails the container stops rather than back up an empty database over the good one. |
| `LITESTREAM_RESTORE_TIMEOUT` | `600` | Seconds before that automatic restore gives up. |

The storage keys go to Litestream only: the entrypoint removes them from the app's environment. (The app runs as the
same user as Litestream, so this keeps them out of reach of a careless leak, not of an attacker who controls the
app: bucket versioning / soft delete is what protects the backups.)

**Docker Compose on one server (`deploy/.env` only)**

| Variable | Default | What it does |
|---|---|---|
| `SITE_DOMAIN` | – (required) | Domain Caddy serves and gets a Let's Encrypt certificate for. |
| `ACME_EMAIL` | – (required) | Email Let's Encrypt writes to about certificate problems. |
| `DATA_DIR` | `/srv/oomba/data` | Host folder on the block disk that becomes `/data`. |
| `OOMBA_IMAGE` | `oomba-academy:latest` | A pre-built image to run instead of building on the server. |

**Development and tests only**

| Variable | Default | What it does |
|---|---|---|
| `BRB_DB` | `<BRB_DATA_DIR>/brb.db` | Database file; `:memory:` in tests. |
| `BRB_LOCALES_DIR` | `server/i18n/locales` | Another folder of locale files (the e2e tests use one with stub translations). |
| `BRB_ALL_LOCALES` | off | `1` offers every language, even unfinished ones (tests, translators). |
| `BRB_SILENT` | off | `1` hides info/warn log lines (tests). |
| `BRB_BUILDER_PROVIDER` | – | `mock` forces the mock Builder even with an API key. |
| `BRB_MOCK_DELAY_MS` | `12` | Delay between the mock Builder's streamed chunks. |

### TRUST_PROXY per platform

Express counts trusted hops from the connection inward, so the number must be exact: too low and every visitor shares
the proxy's address (rate limits hit everyone), too high and a visitor can fake their address. Two rules for every
setup: the app port must **not** be reachable without going through the proxy, and the edge proxy should **overwrite**,
not append to, `X-Forwarded-For` where it can (a proxy that appends is still safe only with the exact count).

| Setup | `TRUST_PROXY` |
|---|---|
| App reached directly (no proxy) | unset |
| Render | `1` |
| One VM with Caddy (`deploy/`) | Caddy's network, `172.30.42.0/24` (set in the compose file; Caddy replaces `X-Forwarded-For`) |
| AWS ALB → app (EC2 or ECS) | `1` |
| CloudFront → ALB → app | `2`, and lock the ALB to CloudFront (AWS guide, section 7) |
| CloudFront → VM with Caddy | `2` (in `deploy/.env`), and give Caddy `trusted_proxies` for CloudFront's ranges so it keeps the header |
| Azure App Service (Linux container) | `1` |
| Azure Container Apps (built-in ingress) | `1` |
| Front Door → VM with Caddy | `2` (in `deploy/.env`), plus the Caddy changes in the Azure guide (section 6) |
| Front Door → App Service or Container Apps | `2`, and lock the origin to your Front Door (Azure guide, section 7) |
| Application Gateway → App Service | `2`, with a rewrite rule that sets `X-Forwarded-For` to `{var_add_x_forwarded_for_proxy}` (Application Gateway adds ports otherwise; the app also drops a `:port`) |

## Deploy

Run **one instance** of the app, never more and no autoscaling: rate limits, live "N playing" counts and one-time
login cards are kept in memory, and SQLite takes one writer. (More instances would need Redis and Postgres; not now.)

- **Render** (today): `render.yaml`, one web service with a disk at `/data`. The container fixes the disk's owner
  (never through a symbolic link), drops to the `node` user for good (no-new-privs), seeds and starts; SIGTERM lets
  requests and Builder turns finish (25 s).
- **AWS**: [`docs/deploy-aws.md`](docs/deploy-aws.md). **Azure**: [`docs/deploy-azure.md`](docs/deploy-azure.md).
  Recommended on both: one VM with a block disk running `deploy/docker-compose.yml`: the app, the screenshot worker
  (Chromium in its own container with no data, no secrets and no internet) and Caddy for HTTPS. Managed-container
  options and their catches are in the same documents.
- **Backups**: set `LITESTREAM_REPLICA_URL` for continuous off-host copies; [`docs/runbook-restore.md`](docs/runbook-restore.md)
  has the restore steps and a restore drill. `npm run backup` (online SQLite copy into `<data>/backups`, keeps 14)
  still works.
- **Plain Docker**: `docker build -t oomba-academy . && docker run -p 3000:3000 -v brb-data:/data -e ADMIN_PASSWORD=... -e SESSION_SECRET=... --stop-timeout 30 oomba-academy`.
  The image runs tini as PID 1 (as the unprivileged `node` user, so signals reach the app even without CAP_KILL), seeds
  on boot (idempotent) and keeps everything in `/data`. Chromium then runs inside the app; to move it out, run the same
  image again as the worker (command `node server/shots-worker.js`, settings as in the compose file's `shots` service)
  and give the app `SNAPSHOT_URL` and the same `SHOTS_TOKEN`.
- **Ops**: `GET /health` answers 503 when the database doesn't answer or its file was deleted or replaced under the
  running app, when the data disk is full (under 100 MB free, or 2 % on a small disk) or takes no new file, and while
  shutting down. The disk part runs at most every 2 seconds; probes are never logged. JSON logs on stdout; site stats
  on `/admin/stats`.

## Layout

```
server/            app factory (app.js), entry (index.js), shutdown.js, site.js (PUBLIC_URL), db.js, auth.js, config.js, shots-worker.js (screenshot worker)
  routes/          auth, discover (home/search), games (game/play/frame/APIs), studio, social, chat, admin (incl. stats), schools (school page, My classes, class pages, login cards), lessons (library, editor, class lessons), progress (lesson pages for students, gradebook, answers), info
  services/        games, publish, scanner, sanitize, frame, presence, textfilter, ratelimit, review, chat, friends, moderation, schools, lessons, lesson-ai, progress, photos, stats, traffic, shots, snapshot, ai-budget, jobs, log, health
  builder/         Builder agent loop, providers (Claude + mock), screening, templates/
  views/           layout + components (server-rendered HTML)
  i18n/            languages: index.js (t, negotiation, Intl), locales/<code>.json, notes.json, blocklists/, README for translators
public/            css/app.css (design system), js/ (one small module per page), sdk/brb-sdk.js (in-frame SDK), fonts (Bricolage Grotesque), icons (made by scripts/icons.js), vendor/three/<version>/ (the pinned, self-hosted Three.js for 3D games; see docs/decisions.md to bump it)
seed-games/        the launch games (HTML + metadata JSON)
scripts/           seed.js, import-game.js, backup.js, rollup.js, screenshots.js, icons.js (the logo icons in public/icons), contrast.js (colour contrast of the design tokens),
                   entrypoint.sh (container start), export-session-secret.js, export-data.js and upload-file.js (moving hosts)
deploy/            docker-compose.yml (app + screenshot worker + Caddy on one server), Caddyfile, .env.example, litestream.yml
tests/             unit/, safety/, e2e/
docs/              build-graph.md, decisions.md, status.md, safety.md, sdk.md, deploy-aws.md, deploy-azure.md, runbook-restore.md, brief/
```

See `docs/status.md` for what works and known limits, and `docs/decisions.md` for choices that need the owner's confirmation.
