# CS Quest · Phase 2 build brief (read this first, then your contract, then the plan sections named for you)

You are one builder on a seven-owner program. Everything you need is in this folder:
`/tmp/claude-0/-home-user-javascript-exercises/db321ed6-437e-588f-beaf-65f7e9b106cd/scratchpad/cs-quest/`

| File | What | Who reads it |
|---|---|---|
| `plan.md` (1,730 lines) | The agreed design. Read ONLY the line ranges named for your item below (use `sed -n A,Bp`). "Critic additions" (lines 1561–1730) override earlier sections where they conflict. | everyone, by section |
| `contract-<your item>.json` | Your machine-readable contract (chapters, params, progress grammar, files, lessons that use you). `criticAdditions` inside it wins over the base. | you |
| `map-games.md` | How official games are built here (kit, scanner, fit audit, tests, SDK). ~15k tokens; game owners read it all. | game owners (C–F) |
| `map-teach.md` | How lessons, classes, live sets, progress and teacher pages work. | A and B |
| `csta.json` / repo `server/standards/csta-2017.json` | The 44 standards (21 at level 1B grades 3–5, 23 at level 2 grades 6–8). Only these ids exist. | everyone |

## Decisions already made (do not reopen)

The critic's six "human decisions" were decided by the orchestrator as follows:

1. **Assessment (CA-5):** Checked = "≥ 2 tagged items right on the most recent exit ticket, or all of them when fewer than 2 are tagged". Per-lesson 0–3 rubric mark on every "In your own words" step counts as *Applied* evidence. Every standard id has ≥ 3 bank items program-wide (add the 5 review items the critic named).
2. **Capstone (CA-11):** Unit 7 is optional; the default path shown first is **Core 10 (no Builder)**. No prices anywhere on public or teacher pages. The plan page's Builder status line shows "Builder: on / resting" and "about N teams can build this period" with N from config `CS_QUEST_BUILD_TEAMS_PER_PERIOD` (default 8). Lesson 7.2 is "one good message, then one fix", paper path first.
3. **Translations (CA-7):** the implementing workflow writes all 11 translations itself (as every official game here was translated), budget chrome ≤ 450 + level text ≤ 1,000 strings per game, through `scripts/cs-quest-i18n.mjs`. Native review is a launch note for the owner, not a gate for merging.
4. **Capstone teams (CA-4):** captain-login rule plus the "Also mark these teammates" multi-select on review (P11). No team feature in v1.
5. **Lesson shapes (CA-1, CA-9):** 6.1 has no live warm-up and uses `wyr:tech:8:20`; 6.2 Pro is two Play steps; 4.1 Pro locks `protocols` with `routes` as the Explore demo. The curriculum owner updates `gen-contracts.py`/the catalogue so the data matches (no reliance on override blobs).
6. **US English (CA-8):** US spelling everywhere (color, gray, favorite, labeled, practiced, neighbor, recognize, math, catalog, center). The program is sold as 45 minutes with a documented 40-minute cut on every plan page.

Other fixed facts: CSTA level 2 has **23** standards (not 31). Kids never see "CS Quest" or standard codes; teachers see "CS Quest · CSTA 1B/2". Program slug `cs-quest`. Bands in-game are **Explorer** (3–5, `1b`) and **Pro** (6–8, `2`).

## Shared scaffolding already on main (use it, do not rewrite it)

- `scripts/cs-quest-i18n.mjs <slug> check|build|stub` — pack data in `scripts/data/cs-quest/<slug>/en.json` (`{"strings": ["English text", ...]}`, English IS the key) and `<lang>.json` for `es fr de it pt nl ru ja zh-Hant he ar` (`{"strings": {"English": "translation"}}`; plural objects `{one, other}` allowed). `build` writes `public/vendor/data/<slug>/1.0.0-<hash>/<lang>.js` as `(window.CsqPacks ||= {})[slug][lang] = {strings}` and prints the `PACK_VER` / `PACK_SRI` line to paste into the game. The game loads its pack exactly like `seed-games/atlas-quest.html` lines 196–208 (dynamic script, `integrity`, `crossOrigin='anonymous'`, 9 s fallback to English, then `Oomba.strings({[lang]: PACK.strings})`), and must contain the literal text `PACK_VER = '...'`, `PACK_SRI = {...};` and `CsqPacks`.
- `tests/unit/cs-quest-content-lint.test.js` — runs automatically for any of the four slugs that exist: real scanner must `pass`, no 7+ digit runs / `@` / `//host.tld` / `http` in any literal or pack string, US spelling in sentences, ≤ 1,450 strings, pack pins match disk. Run it often: `node --test tests/unit/cs-quest-content-lint.test.js`.
- `server/standards/csta-2017.json` — `{standards:[{id, level, grades, concept, subconcept, practices, practiceCodes, statement, clarification}]}`.

## Where you work

Each item has its own git worktree and branch, already created from main. Work ONLY there. `node_modules` is a symlink to the main checkout (do not `npm install`).

| Item | Worktree (absolute) | Branch |
|---|---|---|
| platform-slice (A1) | `/home/user/javascript-exercises/.worktrees/platform-slice` | `cs-quest/platform-slice` |
| live-sets (B) | `/home/user/javascript-exercises/.worktrees/live-sets` | `cs-quest/live-sets` |
| robo-route (C) | `/home/user/javascript-exercises/.worktrees/robo-route` | `cs-quest/robo-route` |
| data-detective (D) | `/home/user/javascript-exercises/.worktrees/data-detective` | `cs-quest/data-detective` |
| packet-post (E) | `/home/user/javascript-exercises/.worktrees/packet-post` | `cs-quest/packet-post` |
| inside-the-machine (F) | `/home/user/javascript-exercises/.worktrees/inside-the-machine` | `cs-quest/inside-the-machine` |

Rules:
- Edit only the files your contract's `files`/`owns` list names. **Never** edit `scripts/seed.js`, `tests/unit/scanner.test.js`, `tests/safety/scanner.test.js`, `tests/e2e/seeds.spec.js`, `scripts/covers.js`, `docs/decisions.md`, `docs/status.md`, or any locale file outside your namespace. Those are the integration step's. If you truly need a change in another owner's file, write it in your final report under `crossOwnerRequests` instead.
- Commit early and often on your branch (every finished chunk), with real messages; end every commit message with exactly these two lines:
  ```
  Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01KYpNxumPhmWGwbVSmRUEXt
  ```
  Use `git -c user.name=Claude -c user.email=noreply@anthropic.com commit`. Push with `git push -u origin <branch>` at the end of every stage. Never `git reset --hard`, never force-push, never rebase. Do not open pull requests (the orchestrator does).
- Never paste secrets, tokens or the owner's email anywhere. Never fetch from the internet except GitHub/npm (everything else is blocked).
- Local server for manual checks: `PORT=3177 BRB_DATA_DIR=/tmp/claude-0/csq-<item> node server/index.js &` after `BRB_DATA_DIR=... node scripts/seed.js`. Pick a port unique to your item (A 3171, B 3172, C 3173, D 3174, E 3175, F 3176) and kill it when done.
- Chromium is at `/opt/pw-browsers/chromium`; Playwright is installed (`playwright-core`), never run `playwright install`.
- Time: the whole program runs in parallel on a 4-CPU box. Run only your own tests while building; run the full `npm test` and `npm run i18n:check` once at the end of a stage.

## Definition of done for a game (C, D, E, F)

1. `seed-games/<slug>.html` + `.json` on Oomba Kit **1.1.2** with the byte-exact tag from `kitTag()`/`kitPackTag()` (see `map-games.md`); `category: learning`, `featured: true`, `orientation: any`, `age_rating: everyone`, the `cover` word and `players_max` from your contract; JSON `l10n` descriptions in all 11 non-English locales.
2. Every chapter/level in your contract exists, is solvable by its `sol`, has learn card (level 1 of each chapter), 3 hint tiers, a `check` (Case-closed card), stars per plan §5.0, Skip after two failed runs, quest-code keypad (4 digits, never 7, hidden in live frames), `BRB.params` honoured (`(window.BRB && BRB.params) || {}`), `lock=1` semantics from `criticAdditions.lockSemantics`, projector mode, band toggle, Explorer stars silver for Pro players.
3. Progress out exactly per `progressEvents` (label regex `^\d{1,2}\/\d{1,2} (levels|cases|tickets|cards), \d{1,3} stars(, \d{1,2}\/\d{1,2} checks)?$`, ≤ 40 ASCII chars; `BRB.gameOver({won:true, score})` at chapter end).
4. Tap-only controls (no text inputs anywhere), keyboard support, `Oomba.ui.announce`, RTL-safe (`dir="ltr"` on code/numbers), `--ok-ts` text sizing, `.ok-rm` for your own motion, `Oomba.settings.reduced`, `cvd` shapes; everything under `var(--ok-safe-top)`; every control ≥ 48 px (28 px only inside `data-fit-dense` grids/tables); ≤ 8 buttons per palette page.
5. `__brbTest` hooks: `start({chapter, band, mode, level, seed, lesson})`, `step(n)`, `skipAnimations()`, `cover()`, `state()` plus your game-specific ones; deterministic with `seed`.
6. Fit audit green at all five sizes on the title AND after Play AND on your densest level: `GAMES=<slug> node scripts/games-fit-audit.js` (the `GAMES` env var overrides the seed list; it needs the game seeded into a local DB first, see `map-games.md`; do NOT commit a seed.js change). Also `tests/e2e/frame-fit.js` rules.
7. `tests/unit/<slug>.test.js`: vm-loads the level data, solves every level with `sol`, asserts starters fail where present, `par ≥ blocks(sol)`, every `csta`/`csta2` id exists in `server/standards/csta-2017.json`, codecs round-trip, 11-locale JSON `l10n`, **and** a real-Chromium frame test (gulp-city pattern: `frameDocument` + CSP + route interception) that plays level 1 of two chapters via `__brbTest`, checks the score label matches the regex, and renders at 390×844 and 1280×800 with no console errors, in `en` and `ar`.
8. `tests/e2e/<slug>.spec.js` (kit-pilots pattern) and `scripts/covers/<slug>.recipe.js` (`export default { '<slug>': { viewport: { width: 360, height: 480 }, touch: true, async prep(f) { /* f is the game frame: f.waitForFunction / f.evaluate on window.__brbTest, then __brbTest.cover() */ } } }`, the same entry shape as `scripts/covers.js RECIPES['gulp-city']`; use only Playwright frame calls, no covers.js helpers).
9. Strings: all English text through your `window.<Game>I18n`/`tr()` path; `scripts/data/cs-quest/<slug>/en.json` lists every English string (chrome + level prose, ≤ 1,450); the 11 translations complete (`node scripts/cs-quest-i18n.mjs <slug> check` prints "complete"); packs built and pinned; content lint green.
10. `node --test tests/unit/<slug>.test.js tests/unit/cs-quest-content-lint.test.js` green; `npm test` has no NEW failures (known pre-existing failures on main: two `three-frame` tests, `class-sharing` screenshot 500, parents "How it works" test); `npm run i18n:check` green.
11. Final report (structured) lists: chapters/levels built, test commands and their last output lines, the five fit sizes checked, open issues, `crossOwnerRequests`.

## Definition of done for platform-slice (A1)

P1 `BRB.params` (allow-listed `chapter band mode level lock`, token field `o`, `/frame` copies `init.params`, SDK frozen object, docs/sdk.md), P2 `lesson_steps.options`, P3 `lesson_steps.standards` + `server/standards/csta.js` loader, P4 keep `cat`/`secs` in `addQuizStep` snapshots, P5 Host-live `mode=` + hide Play and "I played it" on MODES-slug and WYR-live steps, P7 `QUIZ_STEPS` flag (default on; `LIVE_HOMEWORK` only gates "Set as homework"; do NOT touch `routes/live.js` — integration does that gate), P8 `copyLesson` copies `options/standards/template/set_id` and regenerates quiz items, P9 `lessons.template_key/template_version`, P10 `lesson_steps.template` → `templateHtml(key)` on the build route, P11 review `marks` 0–3 per rubric line + "Also mark these teammates", P17 `assign-unit` cadence setting `opens_at`/`due_at` (service-level function; the route lands with curriculum), P18 Builder status helper reading `ai-budget` + `CS_QUEST_BUILD_TEAMS_PER_PERIOD`. Migrations are additive and idempotent. Unit tests for each; `npm test` no new failures; README/config docs updated. Everything backwards compatible: existing lessons, steps and games behave exactly as before when the new columns are empty.

## Definition of done for live-sets (B)

14 unit banks (202 items; plan §6.2/§6.3 verbatim plus the 5 critic review items and the 13 US-spelling fixes) as `seed-lessons/cs-quest/sets/*.json` with the `itemSchema` from the contract (4 choices, `cat` = a primary id of the item's lesson, ≤ 300/120 chars, no digits runs); `tests/unit/cs-quest-sets.test.js` validates counts, cats against `csta-2017.json`, lengths, uniqueness, US spelling. WYR topics `tech` (20) and `online` (10): data in all 13 files (English fallback per item allowed in the 12), `ui.json` cat names in 13 languages, `TOPICS`/`CATS`, pack rebuild via `scripts/wyr-bank.js`, seed and test counts; `seed-lessons/cs-quest/wyr-tech.json` with prompts + CSTA ids. P6 `/live?starter=<wyr:…|bank:…>` preselect; P4-live keep `cat` in `classlive-results.itemRow`; P20 "CS Quest" optgroup in the /live set picker. `live.cs.*` keys in all 13 locale files (append at the end of each file; `npm run i18n:check` green). Kid-safe, no brands, no real people, US spelling.

## Reporting

Return a structured object (the orchestrator parses it): `{ item, branch, commits: [sha...], pushed: bool, done: [...], notDone: [...], tests: {command: lastLines}, fitSizes: [...], crossOwnerRequests: [...], risks: [...] }`.
