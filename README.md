# Magic Cups

A free, kid-safe website where anyone can **play** web games and **build** their own by talking to an AI Builder (Claude).
Think "Roblox for web games", for a 7-year-old, a 12-year-old and their parent sharing one phone.

- **Play**: one-tap guest play, home rails, search (games and builders), ratings, likes, leaderboards, live "N playing" counts, cloud saves.
- **Build**: the Studio — chat with the Builder, live sandboxed preview, version history with restore, Private / Friends / Everyone sharing, and **updates to games you already published** (players keep the old version while an update is reviewed).
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

`npm run seed` creates the admin account (prints a random password unless you set `ADMIN_PASSWORD`), the official **Magic Cups** builder account, and the featured launch games: Shark Plank (hangman for early readers), Ring Rumble (two-player wrestling; on a desktop both players share one keyboard), Footy Tycoon (a soccer property board game), Drop Four (connect-four with a three-level robot), Happy Putt (18-hole mini golf inspired by *Happy Gilmore*), Castle Clash (chess with lessons, puzzles and a four-level robot), Brick Drop (a falling-blocks puzzle with Marathon, Sprint 40 and Zen modes), Word Hunt (themed word searches with a daily puzzle and a pass-the-phone race), Sum Racer (a maths kart race over seven tracks, from adding within 10 to mixed operations), Munch Maze (an original arcade maze chase with three mazes and an Easy mode), Word Peek (a daily guess-the-word game with 4, 5 and 6-letter modes), Swish Flick (flick-to-shoot basketball with an arcade mode and a 24-level story mode), Loop Lab (a beat-making music studio with starter beats, challenges and saved songs) and Beat Lanes (a tap-to-the-beat rhythm game with nine synthesized songs and three difficulties). The list lives in `SEED_GAMES` in `scripts/seed.js`. Re-running the seed is safe and publishes an updated version of a launch game when its HTML changed.

No API key is needed: without `ANTHROPIC_API_KEY` the Builder uses a built-in mock that still makes real, playable games from templates, and public publishing goes to the human review queue.

## Tests

```bash
npm test             # unit + safety suites (node:test, in-memory DB)
npm run test:e2e     # Playwright end-to-end (starts its own server + temp DB, mock Builder)
npm run screenshots  # BASE=http://localhost:3000 ADMIN_PASSWORD=... → screenshots/ at 390/1280 px, light/dark
node scripts/layout-audit.js  # BASE=... AUDIT_USERS="guest,teacher:name:pass" → boxes that touch, on every page it can reach
npm run i18n:check   # per language: missing / extra keys and placeholder problems
```

In environments with a pre-installed Chromium at `/opt/pw-browsers`, the e2e config uses it automatically; otherwise run `npx playwright install chromium` once.

## Configuration (env vars)

| Variable | Default | What it does |
|---|---|---|
| `PORT` | `3000` | HTTP port |
| `BRB_DATA_DIR` | `./data` | Where the SQLite file (`brb.db`) and backups live. Use a persistent disk in production. |
| `SESSION_SECRET` | random, stored in DB | Signs session cookies and game-frame tokens. Set it in production. |
| `TRUST_PROXY` | off | How many front proxies to trust for the real client IP (rate limits). Set to the proxy hop count (e.g. `1` on Render/Heroku) **only** when the app is behind a proxy whose edge sets `X-Forwarded-For`; leave off when the app is exposed directly, or a client could spoof its IP and bypass IP rate limits. Login brute-force is additionally capped per account, independent of this. |
| `ANTHROPIC_API_KEY` | – | Enables the real Builder, input screening classifier and model review. |
| `BUILDER_MODEL` / `BUILDER_PRO_MODEL` | `claude-sonnet-5-5` / `claude-opus-5-5` | Builder models (normal / "Pro quality"). |
| `BUILDER_DAILY_TURNS` | `60` | Builder turns per user per day. |
| `BUILDER_MAX_TOKENS` | `32000` | Max output tokens per Builder turn. |
| `AI_DAILY_BUDGET_USD` | `5` | Most the site spends on Claude per UTC day. At the cap the Builder goes offline (mock builder), picture uploads pause and public reviews wait for a person. `0` turns the AI off. |
| `AI_MONTHLY_BUDGET_USD` | `50` | Same, per calendar month. Today's and this month's spend show on `/admin`. Also set a spend limit in the Anthropic Console as the hard backstop. |
| `BRB_SNAPSHOTS` | on in production | Headless Chromium for game screenshots: cover pictures of Studio games and the Builder's `playtest_game` tool. `0` turns it off, `1` turns it on in development. |
| `BRB_CHROMIUM` | (Playwright's) | Path to a Chromium / headless-shell binary, if not the one Playwright installed. |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` | `admin` / random | Admin account created by `npm run seed`. |
| `DEMO_TEACHER_PASSWORD` | unset | Demo school for showing schools: creates "Magic Cups Demo School" with `DemoTeacher` and `DemoStudent` (this password, reset on every boot), four classmates, a Demo Class and sample lessons (added again only if the teacher's library is empty). |
| `AD_IP_DAILY_CAP` | `200` | Max counted ad impressions per IP per day. |
| `CHAT_DAILY_LIMIT` | `300` | Max chat messages per user per day. |
| `REPORTS_TO_HIDE` | `3` | Open reports from different players that auto-hide a game. |
| `POSTHOG_KEY` / `POSTHOG_HOST` | – | Optional product analytics (off unless set; never sends usernames or text). |
| `LOG_REQUESTS` | `1` | `0` turns off the JSON request log. |
| `BRB_LOCALES_DIR` | `server/i18n/locales` | Another folder of locale files (the e2e tests use one with stub translations). |

## Deploy

**Docker**: `docker build -t magic-cups . && docker run -p 3000:3000 -v brb-data:/data -e ADMIN_PASSWORD=... -e SESSION_SECRET=... magic-cups`. The container seeds on boot (idempotent) and stores everything in `/data`.

**Render**: push the repo and create a Blueprint from `render.yaml` (one web service + a 2 GB persistent disk at `/data`). Set `ADMIN_PASSWORD` and optionally `ANTHROPIC_API_KEY` in the dashboard.

**Ops**: `GET /health`; JSON request logs on stdout; graceful shutdown on SIGTERM; `npm run backup` (online SQLite backup, keeps 14). Site stats (visits, plays, accounts, AI cost and tokens) are on `/admin/stats`.

## Layout

```
server/            app factory (app.js), entry (index.js), db.js, auth.js, config.js
  routes/          auth, discover (home/search), games (game/play/frame/APIs), studio, social, chat, admin (incl. stats), schools (school page, My classes, class pages, login cards), lessons (library, editor, class lessons), progress (lesson pages for students, gradebook, answers), info
  services/        games, publish, scanner, sanitize, frame, presence, textfilter, ratelimit, review, chat, friends, moderation, schools, lessons, lesson-ai, progress, photos, stats, traffic, shots, snapshot, ai-budget, jobs, log
  builder/         Builder agent loop, providers (Claude + mock), screening, templates/
  views/           layout + components (server-rendered HTML)
  i18n/            languages: index.js (t, negotiation, Intl), locales/<code>.json, notes.json, blocklists/, README for translators
public/            css/app.css (design system), js/ (one small module per page), sdk/brb-sdk.js (in-frame SDK), fonts, icons
seed-games/        the launch games (HTML + metadata JSON)
scripts/           seed.js, import-game.js, backup.js, rollup.js, screenshots.js
tests/             unit/, safety/, e2e/
docs/              build-graph.md, decisions.md, status.md, safety.md, sdk.md, brief/
```

See `docs/status.md` for what works and known limits, and `docs/decisions.md` for choices that need the owner's confirmation.
