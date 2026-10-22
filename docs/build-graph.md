# BRB Gaming build graph

The platform is built as a dependency graph. Each node has an owner, inputs (edges in), the files it owns, and a proof.
Nodes on the same level have no edges between them and are built in parallel.

```
L0  foundation (lead)                F1 schema  F2 auth  F3 design+layout  F4 sandbox+SDK  F5 seeds  F6 discovery
                                        │            │            │              │             │          │
L1   ┌──────────────────────────────────┼────────────┴────────────┼──────────────┴─────────────┴──────────┐
     │ S  Studio + Builder (subagent)   │ C  Community + Chat (subagent)        │ M  Money (subagent)     │
     │    builder harness, templates,   │    friends, profiles, friends-only    │    ad provider, impres- │
     │    versions, publish/update UI,  │    chat, blocks, chat reports, admin  │    sions, ledger, roll- │
     │    model review, safety suite    │    queue + reports + audit            │    up, creator dashboard│
     └──────────────────┬───────────────┴──────────────────┬────────────────────┴───────────┬─────────────┘
L2                      └───────────► I  integration + Playwright e2e (lead) ◄────────────────┘
L3                                    D  Docker, render.yaml, README, docs (lead)
```

## Nodes

| Node | Owner | Owns | Inputs | Proof | Status |
|------|-------|------|--------|-------|--------|
| F1 schema | lead | `server/db.js`, `server/config.js` | – | `tests/unit/db.test.js` | done |
| F2 auth | lead | `server/auth.js`, `server/routes/auth.js`, `server/services/textfilter.js`, `services/ratelimit.js` | F1 | `tests/unit/auth.test.js`, e2e signup/upgrade | done |
| F3 design | lead | `public/css/app.css`, `server/views/*`, `public/js/app.js` | – | screenshots 390/1280 light+dark | done |
| F4 sandbox | lead | `routes/games.js` (frame, play, game APIs), `public/sdk/brb-sdk.js`, `services/frame.js`, `services/sanitize.js`, `services/scanner.js`, `public/js/play.js` | F1,F2 | e2e: save round-trip, no cookies/network in frame; `tests/unit/scanner.test.js` | done |
| F5 seeds | lead | `scripts/seed.js`, `scripts/import-game.js`, `seed-games/*` | F1,F4 | seed runs; 3 games play in sandbox | done |
| F6 discovery | lead | `routes/discover.js`, `services/games.js`, `services/presence.js`, `public/js/search.js`, `public/js/game.js` | F1 | e2e search by title + builder | done |
| P publish | lead | `services/publish.js` (publish, update, approve, reject) | F1,F4 | `tests/unit/publish.test.js` | done |
| S studio (+ uploads, migration 0002_studio_uploads) | subagent | `server/builder/*`, `server/services/review.js`, `server/routes/studio.js`, `public/js/studio.js`, `server/builder/templates/*`, `tests/safety/*`, `tests/unit/builder*.test.js` | F1–F4, P | mock-provider flow: questions → chips → game → edit → v2 → restore → publish | done |
| C community | subagent | `server/routes/social.js`, `server/routes/chat.js`, `server/routes/admin.js`, `server/services/{friends,chat,moderation}.js`, `public/js/{friends,chat,profile,admin}.js`, `tests/unit/{chat,friends}.test.js` | F1,F2,P | friends-only visibility; chat filter; admin approve; reports | done |
| M money | subagent | `server/services/ads.js`, `server/services/earnings.js`, `server/routes/ads.js`, `server/routes/creator.js`, `public/js/ads.js`, `public/js/creator.js`, `data/house-ads.json`→`server/ads/house.json`, `scripts/rollup.js`, `tests/unit/earnings.test.js` | F1,F6 | beacon → ledger → dashboard | done |
| T templates | subagent | `server/builder/templates/*`, `tests/unit/templates.test.js` | F4 | 7 templates pass scan, played to results in sandbox | done |
| I integration | lead + subagent | `tests/e2e/*`, `playwright.config.js` | all | full e2e suite green twice | in progress |
| D deploy | lead | `Dockerfile`, `render.yaml`, `README.md`, `scripts/backup.js` | I | container boots | done (see status.md) |

## Contracts L1 nodes must not change

- **Schema**: `server/db.js` migration `0001_init`. Need more? Add a new migration `0002_<node>` in your own module via `migrate([...])`, never edit 0001.
- **Layout API**: `layout(req, { title, active, body, scripts, head, back, backLabel, bodyClass, bare })` from `server/views/layout.js`; components in `server/views/components.js`; `html` tagged template escapes by default.
- **SDK protocol**: messages `{ brb: 1, type }` with types `brb:ready|save|score|gameover|fullscreen|orientation`; parent validates in `public/js/play.js`.
- **Visibility**: `canView(user, game)` and `visibleWhere(user)` in `services/games.js` are the only visibility rules.
- **Publishing**: only `services/publish.js` moves a version live.
- **Client helpers**: `import { api, toast, sheet, pageData, $, $$, esc, copyText } from '/js/app.js'`.
