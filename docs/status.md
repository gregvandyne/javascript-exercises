# Status

_Last updated: 2026-10-24_

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
| **13 site languages**: 🌐 picker (mouse, keyboard, phone, no-JS links), `?lang=` → cookie → account → Accept-Language → en, choice saved to the account, `<html lang dir>`, RTL for he/ar, English fallback per key, `BRB.user.lang` in games | unit `i18n.test.js`, e2e `i18n.spec.js`, RTL screenshots of home, game, play, Studio, chat, friends and Me |
| Locale-file guard for translators: no extra keys, placeholders kept, code keys exist, notes valid (`npm run i18n:check`) | unit `i18n.test.js` |
| Phone numbers and emails in full-width or Arabic-Indic digits/letters are refused; per-language word lists apply to everyone | safety `i18n-filters.test.js` |
| 7 starter templates pass the scanner and play to the results screen | unit `templates.test.js` + manual headless run |
| Every page at 390 px and 1280 px, light and dark: no horizontal overflow, reviewed by eye | `npm run screenshots` |
| Docker: image boots, seeds, serves `/health`, home and game pages | built locally with pre-installed deps (see limits) |

Counts at this commit: unit + safety 156/156, e2e 28/28.

## Not verified / known limits
- **Real Claude calls are untested** (no `ANTHROPIC_API_KEY` here). Request shapes (cache_control, tools, models, review schema) are tested against a local fake Messages API. Set the key and try one Studio game before launch.
- **Full `docker build` not run here**: this sandbox blocks Debian package mirrors, so the `apt-get` + `npm ci` steps could not run. The image was verified to boot with the same layout using pre-built dependencies. Render/any normal network should build it as-is.
- The GitHub repo name is unchanged (no tool for that here). Rename it in GitHub → Settings.
- Presence (live counts) and rate limits are in memory: one server process only. Multi-instance needs Redis.
- Chat uses polling every ~3.5 s, not WebSockets.
- No ads and no creator payouts: removed when Magic Cups became an ed-tech product. Old ad/earnings tables are left untouched in existing databases.
- The mock Builder makes real games from templates and real find/replace edits, but it is not creative. The real Builder needs the API key.
- **Only English is written so far**: `server/i18n/locales/en.json` has every string (832 keys); the other 12 locale files are `{}` stubs waiting for translators, and the per-language word lists are empty. Until then those languages show English text (in the right direction for he/ar). The Builder already replies in the kid's language when an API key is set; the offline mock Builder speaks English.
- Without an API key, Builder input screening for non-English messages relies on the word lists only (the keyword rules are English).

## Recommended next steps
1. Add `ANTHROPIC_API_KEY`, build a few games end to end, tune the system prompt.
1. Fill the 12 locale files and word lists (see `server/i18n/README.md`; `npm run i18n:check` shows progress), then let the launch games read `BRB.user.lang`.
2. Real-time multiplayer and live chat over WebSockets (plus Redis for presence/rate limits).
5. Builder analytics (retention, where players quit), game remixing, and 3D later.
