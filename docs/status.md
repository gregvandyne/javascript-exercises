# Status

_Last updated: 2026-10-23_

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
| Ads: impression after ≥50% visible for 1 s, dedupe, owner views ignored → roll-up → creator dashboard; no ads on play page | e2e `money.spec.js`, unit `earnings.test.js`, `ads.test.js` |
| Safety suite: 76 adversarial prompts refused, 40 kid prompts allowed; scanner fails fetch/links/eval, flags flashing | `tests/safety/` |
| 7 starter templates pass the scanner and play to the results screen | unit `templates.test.js` + manual headless run |
| Every page at 390 px and 1280 px, light and dark: no horizontal overflow, reviewed by eye | `npm run screenshots` |
| Docker: image boots, seeds, serves `/health`, home and game pages | built locally with pre-installed deps (see limits) |

Counts at this commit: unit + safety 133/133, e2e 16/16 (run three times).

## Not verified / known limits
- **Real Claude calls are untested** (no `ANTHROPIC_API_KEY` here). Request shapes (cache_control, tools, models, review schema) are tested against a local fake Messages API. Set the key and try one Studio game before launch.
- **Full `docker build` not run here**: this sandbox blocks Debian package mirrors, so the `apt-get` + `npm ci` steps could not run. The image was verified to boot with the same layout using pre-built dependencies. Render/any normal network should build it as-is.
- The GitHub repo name is unchanged (no tool for that here). Rename it in GitHub → Settings.
- Presence (live counts) and rate limits are in memory: one server process only. Multi-instance needs Redis.
- Chat uses polling every ~3.5 s, not WebSockets.
- Payouts are recorded for manual handling; Stripe Connect is designed but stubbed.
- Ads are BRB's own house promos; a kid-safe ad network adapter point exists but no partner is wired in.
- The mock Builder makes real games from templates and real find/replace edits, but it is not creative. The real Builder needs the API key.

## Recommended next steps
1. Add `ANTHROPIC_API_KEY`, build a few games end to end, tune the system prompt.
2. Real-time multiplayer and live chat over WebSockets (plus Redis for presence/rate limits).
3. A kid-safe ad partner (COPPA-compliant, contextual only) behind the adapter.
4. Stripe Connect payouts with parent/guardian verification.
5. Builder analytics (retention, where players quit), game remixing, and 3D later.
