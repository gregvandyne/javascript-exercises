# Status

_Last updated: 2026-10-25_

## How to run
`npm install && npm run seed && npm start` → http://localhost:3000 (Node 22, no API key needed). Tests: `npm test` (unit + safety), `npm run test:e2e` (Playwright). Details in README.

## Verified working (exercised, not just written)
| Area | Proof |
|---|---|
| Guest play in one tap, cloud saves via the localStorage shim, guest → account keeps saves | e2e `play.spec.js` |
| Seed games: Shark Plank, Ring Rumble (fullscreen via SDK; two players on one keyboard with on-screen key guides on desktop), Footy Tycoon (trophy wallet persists; doubles roll again; $200 for passing Kick Off) | e2e `play.spec.js`, `seeds.spec.js` |
| Drop Four (connect-four, 2 players or a three-level robot) and Happy Putt (18-hole mini golf homage to Happy Gilmore): each built, then verified over several rounds by independent playtest, visual and code review agents in the real sandbox | e2e `seeds.spec.js`, scanner tests, workflow verification logs |
| Sandbox: opaque origin, no cookies, no network, no parent access, no `allow-same-origin` | e2e `play.spec.js`, unit `scanner.test.js` |
| Search by title, tag and builder name; builder cards | e2e + unit |
| Ratings (rolling sum/count), likes, leaderboards, live player counts across two browsers | e2e + unit |
| Studio with mock Builder: questions → chips → game in preview → edit v2 → restore → publish Friends → Public → admin approve → on Home | e2e `studio.spec.js` |
| **Updating a published game**: update reviewed while strangers keep the old version, then switched after approval | e2e `studio.spec.js`, unit `publish.test.js` |
| **Inspiration uploads** in the Studio (private, metadata stripped, inspiration only) | e2e `studio.spec.js`, unit `builder-uploads.test.js` |
| Friends by code; friends-only visibility | e2e `community.spec.js`, unit `visibility.test.js` |
| **Friends-only chat**: delivery by polling, phone numbers/links/profanity refused, block, report | e2e `community.spec.js`, unit `chat.test.js` |
| Reports: 3 distinct reporters auto-hide a game | e2e `reports.spec.js` |
| Admin: review queue, reports, chat reports, users/bans, audit log; 404 for non-admins | e2e + unit `moderation.test.js` |
| Schools: platform admin creates schools; school admins run classes, people and settings; teachers run classes, add students with login cards, approve own-account joins (with matching); school rules for school accounts | unit `schools.test.js`, e2e `schools.spec.js` |
| Lesson plans: library with folders and order, read/play/build steps, Draft with AI (template without a key), share and copy in the school, assign to classes in units with dates, students open lessons and start build steps | unit `lessons.test.js`, e2e `lessons.spec.js` |
| Progress: mark done, answers and feedback, game scores and play time from a lesson, build hand-in (one game per student), gradebook and CSV, lesson progress, class tabs | unit `progress.test.js`, e2e `progress.spec.js` |
| Teacher/admin UX deep dive: sign-in homes, soft-removed class lessons (work kept), one assignment per class, due-day rules, school page teacher choice, staff and student adding flows, duplicate-name guard, class login cards, leave/archive/delete, lesson editor header and step form | unit `schools.test.js`, `lessons.test.js`, `progress.test.js`; e2e `schools.spec.js`, `lessons.spec.js`, `progress.spec.js`, `layout.spec.js` |
| Layout: no two boxes touch on the main pages (phone, tablet, desktop; light and dark; sections opened) | e2e `layout.spec.js`; `scripts/layout-audit.js` for the whole site |
| Admin stats: visits (no tracking), accounts, plays, games, AI cost and tokens; admin-only | unit `stats.test.js` |
| Safety suite: 76 adversarial prompts refused, 40 kid prompts allowed; scanner fails fetch/links/eval, flags flashing | `tests/safety/` |
| **Light / dark / same as my device**: ☀️/🌙/🌓 menu (mouse, keyboard, no-JS links) and Me page form, instant switch, `?theme=` → cookie → account → device, saved to the account, no flash on first paint, prints in light, dark colours only in two identical token blocks | unit `theme.test.js`, e2e `theme.spec.js`, `layout.spec.js` (Dark picked on a light device), screenshots at 320/390/820/1280 in both themes |
| **13 site languages**: 🌐 picker (mouse, keyboard, phone, no-JS links), `?lang=` → cookie → account → Accept-Language → en, choice saved to the account, `<html lang dir>`, RTL for he/ar, English fallback per key, `BRB.user.lang` in games | unit `i18n.test.js`, e2e `i18n.spec.js`, RTL screenshots of home, game, play, Studio, chat, friends and Me |
| Locale-file guard for translators: no extra keys, placeholders kept, code keys exist, notes valid (`npm run i18n:check`) | unit `i18n.test.js` |
| Phone numbers and emails in full-width or Arabic-Indic digits/letters are refused; per-language word lists apply to everyone | safety `i18n-filters.test.js` |
| 7 starter templates pass the scanner and play to the results screen | unit `templates.test.js` + manual headless run |
| Every page at 390 px and 1280 px, light and dark: no horizontal overflow, reviewed by eye | `npm run screenshots` |
| Docker: image boots, seeds, serves `/health`, home and game pages | built locally with pre-installed deps (see limits) |
| Container start and stop: tini → node (no shell or su left), root-owned disk made writable without recursion, chown refused (network share) is only a warning, SIGTERM during a Builder stream lets it finish and exits 0 (directly and behind Caddy), `/health` 503 on an unwritable disk, `REQUIRE_SESSION_SECRET`, worker-style read-only run as uid 1000 | Docker 29 here, test copy of the Dockerfile (see limits) |
| Render-like boot (root-owned mount point, uid-1000 files, root-only `lost+found`, `PORT=10000`, only Render's variables): symbolic links planted by uid 1000 at `/etc/passwd`, the node binary and the entrypoint stay root-owned; node runs as uid 1000 with NoNewPrivs; data kept across a restart; SIGTERM exits 0 | Docker, test copy of the Dockerfile; `deploy.test.js` symlink test run inside the image (fails on the old loop) |
| `/health` sees what matters: full 12 MB tmpfs → 503 `disk full`; `brb.db` moved away or replaced under the running app → 503, back to 200 when restored | Docker + unit `deploy.test.js` |
| `MOVED_TO_URL`: old host 302 to the same path, POST 307, a request on the new name gets the "moving" page (no loop), a non-path request line goes to `/` | Docker + unit |
| Litestream: replication under the app, signal hand-off, last sync on stop, empty disk restores itself, point-in-time restore, restore drill, failed restore refuses to start; the app process has none of the storage keys (Litestream's own process still does) | Docker, file replica |
| `deploy/` stack: compose config, Caddy (HTTPS, gzip but not the event stream, `X-Forwarded-For` replaced, headers), app not published; worker off by default (profile); app refuses to start when the data folder is missing; trust by Caddy's subnet: 31 sign-ups with fake `X-Forwarded-For` hit the 30/hour limit both through Caddy and from the worker's network (with `TRUST_PROXY=1` the worker network got all 31) | `docker compose up` with a local-CA certificate |
| Graceful shutdown, `/health`, `PUBLIC_URL`, TRUST_PROXY warning, secret rules, on/off settings, journal mode, maintenance / moved modes, export scripts | unit `deploy.test.js` |

Counts at this commit: unit + safety 234/235 with 1 skipped here (the entrypoint test needs root and a `node` user; it passes inside the image), e2e 49/49.

## Not verified / known limits
- **Real Claude calls are untested** (no `ANTHROPIC_API_KEY` here). Request shapes (cache_control, tools, models, review schema) are tested against a local fake Messages API. Set the key and try one Studio game before launch.
- **Full `docker build` not run here**: this sandbox blocks Debian package mirrors and Playwright's download site, so the `apt-get` (tini, Chromium's libraries) + `npm ci` steps could not run. The container tests used a copy of the Dockerfile where only those steps are swapped (worktree `node_modules`, Docker's bundled tini 0.19.0, no Chromium); everything else, including the entrypoint and Litestream, is the real thing. Render/any normal network should build it as-is.
- **Not tried on real AWS or Azure accounts.** The guides follow the consoles as documented; ECS Fargate, Container Apps and App Service were not deployed. Litestream's Azure managed-identity and SAS paths were only checked to be the ones it tries (no Azure account here).
- **The screenshot worker** (`server/shots-worker.js`, `SNAPSHOT_URL`, `SHOTS_TOKEN`) is a separate change and not merged: until then Chromium runs inside the app (compose gives the app 2 GB), and the compose file's `shots` service stays off behind `COMPOSE_PROFILES=worker`.
- Litestream runs as the same user as the app, so an attacker who controls the app could still read the storage keys from Litestream's process. Bucket versioning / soft delete (required in the guides) is the real protection.
- The GitHub repo name is unchanged (no tool for that here). Rename it in GitHub → Settings.
- Presence (live counts), rate limits and one-time login cards are in memory: **one server process only, no autoscaling** (README, Deploy). Multi-instance needs Redis (and Postgres instead of SQLite).
- Chat uses polling every ~3.5 s, not WebSockets.
- No ads and no creator payouts: removed when Oomba Academy became an ed-tech product. Old ad/earnings tables are left untouched in existing databases.
- The mock Builder makes real games from templates and real find/replace edits, but it is not creative. The real Builder needs the API key.
- **Only English is written so far**: `server/i18n/locales/en.json` has every string (832 keys); the other 12 locale files are `{}` stubs waiting for translators, and the per-language word lists are empty. Until then those languages show English text (in the right direction for he/ar). The Builder already replies in the kid's language when an API key is set; the offline mock Builder speaks English.
- Without an API key, Builder input screening for non-English messages relies on the word lists only (the keyword rules are English).

## Recommended next steps
1. Add `ANTHROPIC_API_KEY`, build a few games end to end, tune the system prompt.
1. Fill the 12 locale files and word lists (see `server/i18n/README.md`; `npm run i18n:check` shows progress), then let the launch games read `BRB.user.lang`.
2. Real-time multiplayer and live chat over WebSockets (plus Redis for presence/rate limits).
5. Builder analytics (retention, where players quit), game remixing, and 3D later.
