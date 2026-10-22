# Build Playloom: a kid-safe "Roblox for web games" with an AI game builder

You are the lead engineer and product designer for **Playloom** (working name, easy to rename later): a free website where anyone of any age can play web games, and where anyone can build and publish their own games by talking to Claude. Think of the audience as a 7-year-old, a 12-year-old, and their parent sharing one phone, plus a teenager building games on a laptop. The bar is "as easy to navigate as Roblox", with graphics and polish that make every game feel finished.

Work in this repository. Read this whole brief before you touch anything. Build the real thing, not a prototype: a working platform with accounts, play mode, build mode, sharing, search, ratings, live player counts, ads that fund builders, moderation, tests and a deploy path.

---

## 0. How to work (the graph method)

Build this as a dependency graph, not a to-do list.

1. **Plan first.** Enter plan mode. Produce `docs/build-graph.md`: a DAG of nodes where each node has an owner (you or a subagent), its inputs (edges in), the files it owns, and the proof that it is done (a test or a scripted check). Nodes with no edge between them run in parallel. Keep the graph updated with status as you go. Also keep `docs/decisions.md` (every non-obvious choice, one line each, with the reason) and `docs/status.md` (what works, what does not, how to run it).
2. **Levels.** L0 foundation (schema, auth, design system, sandbox, seed games, discovery). L1 the three big independent nodes: Studio and builder harness; Community (friends, sharing, profiles, reports, admin); Money (ads, impressions, ledger, creator dashboard). L2 integration and end-to-end tests. L3 deploy and docs.
3. **Subagents.** Use subagents for L1 nodes in parallel, each with a brief that lists exactly which files it owns and the contracts it must not change (the schema, the SDK message protocol, the layout API). Review their output yourself before integrating.
4. **Proof over claims.** A node is done only when its proof passes. Run the tests. Open the pages in a headless browser and screenshot them. Never report something as working that you did not exercise.
5. **Decisions.** Decide sensible defaults yourself and log them. Only stop to ask me when a choice is both expensive to reverse and genuinely a product call (for example, the exact revenue split). Everything else: pick, log, move on.
6. **Commits.** Commit per node with a clear message. Keep the tree runnable at every commit.
7. **Do not finish early.** When you think you are done, run the full checklist in section 13, fix what fails, and only then write the final report.

A starter may exist in `starter/` (schema, auth, game queries, presence, build graph) and seed games in `seed-games/`. Reuse what is sound, rewrite what is not, and say which you did.

---

## 1. Product definition

Two experiences, one account:

**Play mode** (default). Anyone can play as a guest in one tap, or create a free account with a username and password (no email required, no personal details, COPPA-friendly). Players discover games on a home page with rails, search, open a game page, play in a sandbox, rate, like, see who is playing, add friends by code, and keep progress across devices when signed in.

**Build mode** (Studio). Any signed-in account can open the Studio, start a new game, and build it by talking to the Playloom Builder (Claude). The Builder asks a few smart questions, anticipates needs, generates a complete playable game, shows it in a live preview, and keeps iterating on request. Builders choose sharing: **Private** (only me), **Friends** (my friends list), or **Public** (everyone, after review). Builders can keep iterating forever; every change is a new version with history and restore.

**Money.** Everything is free to play and free to build. The platform shows a small number of subtle, non-invasive ads (section 8) and shares that revenue with builders based on plays of their games. No purchases, no loot boxes, no in-game currency that costs money.

**Safety** is a first principle, not a feature. See section 6.

Seed content: three finished games are provided in `seed-games/` and must be live on day one: **Shark Plank** (hangman for early readers), **Ring Rumble** (two-player landscape wrestling), and **Footy Tycoon** (a soccer property-trading board game with a trophy shop). Import them as featured public games owned by an official "Playloom" account.

---

## 2. Tech stack and repository layout

Choose boring, fast, deployable technology. Defaults (override only with a logged reason):

- Node 22, Express, server-rendered HTML with small vanilla JS modules per page (no SPA framework, no build step for the site itself). Fast first paint on cheap phones matters more than developer fashion.
- SQLite via `better-sqlite3` (WAL mode) with versioned migrations, behind a thin repository layer so Postgres is a later swap, not a rewrite.
- Sessions in signed HttpOnly cookies. Passwords with bcrypt. Same-origin checks on all state-changing requests.
- `@anthropic-ai/sdk` for the Builder, with a mock provider used when `ANTHROPIC_API_KEY` is absent so the whole platform and test suite run without a key.
- Playwright for end-to-end tests, `node:test` for unit tests.
- Docker image plus `render.yaml` (or fly.toml) with a persistent disk.

```
/server            app factory, routes, services, views (template functions), builder
/public            css, js, sdk (the in-frame SDK), icons
/seed-games        seed game HTML + metadata JSON
/scripts           seed.js, import-game.js, backup.js
/tests/unit  /tests/e2e
/docs              build-graph.md, decisions.md, status.md, safety.md, sdk.md
```

Everything configurable through env vars with sane defaults, documented in README.

---

## 3. Data model (create all of it in the first migration)

users(id, username unique, display_name, password_hash nullable for guests, role player|admin, is_guest, avatar emoji, color, friend_code unique, bio, created_at, last_seen, builder_enabled, banned)
sessions(id, user_id, created_at, expires_at, ua)
games(id, slug unique, owner_id, title, description, icon, cover, category, tags, visibility private|friends|public, status draft|in_review|published|rejected|suspended, current_version_id, published_version_id, plays, likes, rating_sum, rating_count, featured, players_max, orientation any|portrait|landscape, source seed|studio, age_rating, review_note, created_at, updated_at, published_at)
game_versions(id, game_id, number, html, notes, safety_status unchecked|pass|flag|fail, safety_report json, created_by, created_at)
friends(user_id, friend_id, status pending|accepted, created_at)
plays(id, game_id, user_id, started_at, ended_at, seconds)
saves(game_id, user_id, data json, updated_at)
scores(id, game_id, user_id, score, label, created_at)
ratings(game_id, user_id, stars 1..5, created_at)
likes(game_id, user_id, created_at)
reports(id, game_id, user_id, reason, details, status, created_at, resolved_by, resolved_at)
builder_chats(id, game_id, user_id, messages json, state json, tokens_in, tokens_out, created_at, updated_at)
builder_usage(user_id, day, turns)
ad_impressions(id, game_id, placement, user_id, session_id, day, created_at)
earnings(game_id, day, impressions, revenue_cents)
payouts(id, user_id, amount_cents, status, note, created_at)
audit_log(id, actor_id, action, target, details, created_at)
settings(key, value)

Rules: `current_version_id` is what the Studio edits and previews; `published_version_id` is what everyone else plays. Ratings are a rolling sum and count. Presence (who is playing now) lives in memory with a heartbeat, not in the database.

---

## 4. Play experience (what players see)

**Navigation, Roblox-style and age-agnostic.** A top bar with logo, a search box, and four big destinations: Home, Search, Build, Friends, plus Me (avatar). On phones, the same four as a bottom tab bar with icon and label. Every tap target at least 44px. Every page reachable within two taps from Home. No hover-only affordances.

**Home.** Horizontal rails with large cards: Featured (seed games first), Playing now (sorted by live player count), Popular, Top rated, New, From friends (if any), My games (if a builder), then category rows. Each card shows icon art on a colored cover, title, builder name, star rating, and a live "N playing" pill when non-zero.

**Search.** One search box that matches title, description, tags, category and **builder username or display name**. Filters: category chips; sort by Popular, Top rated, New, Playing now. Instant results as you type (debounced), with an empty state that suggests categories. Search also finds builders and shows their profile cards.

**Game page.** Big cover and icon, title, builder (link to profile), stats: star rating with count, live players, total plays, likes. A huge Play button. Description, category and tags. Star rating widget (tap to rate, change any time). Like button. Leaderboard (top scores if the game submits any). "More like this". Report button (simple reasons, no free text required). Share button that copies a link, with the sharing level shown so kids understand who can open it.

**Play page.** The game fills the screen in a sandboxed iframe (section 6). A slim bar with Back, title, live player count, fullscreen, rate and like. Orientation hint if the game wants landscape. Heartbeat every 30 s keeps the player counted; leaving removes them. Guest progress is kept in the guest session; signing up later keeps it.

**Accounts.** Guest play in one tap (generated name like "Guest Otter", avatar emoji). Sign up with username + password only; usernames filtered for profanity and for things that look like phone numbers or real names. Guest to account upgrade keeps everything. No email, no age gate that collects data, no public free-text chat anywhere.

**Profiles and friends.** Profile shows avatar, display name, games built, favourite games, badges. Friends are added by a 6-character friend code (no searching people by name for kids' safety), with accept/decline. Friends-only games appear for accepted friends. A "Friends" page shows requests, your code, and what friends are playing.

---

## 5. Build experience (the Studio and the Game Builder skill)

**Studio page layout.** Left: the conversation with the Builder. Right (or below on phones): live preview in the same sandbox players use, with Phone/Tablet/Landscape size toggles, Reload, Fullscreen. Top: game title and icon (editable), Save version, Version history with restore, Share (Private/Friends/Public), Publish, Settings (description, category, tags, orientation, max players). Builders can always come back and keep iterating; the chat history and every version persist.

**The Game Builder skill.** This is the heart of the product. Implement it as a server-side agent loop with a fixed system prompt (never user-editable), streaming text to the client over SSE, and a small set of tools:

- `ask_user(question, options[])`: renders quick-reply chips plus a free-text box.
- `write_game(html, notes)`: writes a complete new version.
- `edit_game(edits[] of {find, replace}, notes)`: surgical changes to the current version.
- `set_game(title, icon, description, category, tags, orientation, players)`.
- `test_notes(checklist[])`: what the builder should try in the preview.

Conversation design the skill must follow:
1. **Start by understanding, in at most three short questions**, choosing them based on what the user already said: what kind of game (offer 6 to 8 concrete, kid-friendly ideas as chips), who plays it (solo, pass-the-phone, two players on one screen), the theme or characters they love, and whether there is something to learn (spelling, maths, geography, music) because an educational hook is encouraged but never forced.
2. **Anticipate needs.** Propose the controls (tap, swipe, keyboard), the scoring, the win and lose conditions, difficulty ramp, a round length under three minutes, sound on by default but mutable, a pause, and a "play again" loop. Say what you plan in two or three sentences, then build. Do not interrogate.
3. **Generate the whole game** as one self-contained HTML document following the Game Contract (section 7), with real graphics drawn in canvas or SVG, animation, juice (screen shake, particles, hit flashes, confetti), synthesized sound through WebAudio, a title screen, an in-game HUD, a results screen, and touch plus keyboard controls.
4. **Then iterate.** After every version, tell the builder what to try, and offer three concrete next steps as chips ("Make it harder", "Add a second level", "Change the hero to a dragon"). Every follow-up request goes through `edit_game` when the change is small and `write_game` when it is structural. Never ask the builder to paste code.
5. **Polish pass.** When the builder says it is ready, do a self-review against the quality checklist (readable at phone size, no dead ends, no text overflow, restart works, sound toggle works, nothing offensive, performance on a cheap phone) and fix what you find before saying it is ready to publish.
6. **Tone.** Encouraging, short, plain words, no jargon, works for an eight-year-old and a parent. Celebrate progress. Never say "as an AI".

Use `claude-sonnet-5-5` by default and `claude-opus-5-5` when the builder picks "Pro quality" for a version. Cache the system prompt. Keep the game source out of the chat transcript (store it in versions, pass the current source to the model as a separate cached block). Limit turns per user per day (default 60) and tokens per turn; show remaining turns in the Studio.

**Templates.** Offer "Start from" cards for fast wins: Quiz, Runner, Catch the falling things, Memory match, Word game, Two-player duel, Board game. Each is a real finished mini-game the Builder adapts, so even a first attempt looks great.

---

## 6. Safety and the sandbox (non-negotiable)

Treat every game as untrusted code and every builder prompt as untrusted input.

**Runtime sandbox.**
- Games run only inside `<iframe sandbox="allow-scripts allow-pointer-lock allow-orientation-lock" allowfullscreen>` with **no** `allow-same-origin`, served from a dedicated frame route with a strict CSP: `default-src 'none'; script-src 'unsafe-inline' https://cdnjs.cloudflare.com; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com data:; img-src data: blob:; media-src data: blob:; connect-src 'none'; frame-ancestors 'self'; form-action 'none'; base-uri 'none'`.
- No network from games, no cookies, no storage of their own. Everything a game may do with the platform goes through the injected SDK and `postMessage`; the parent page validates origin, source and shape of every message; the server validates and rate-limits every resulting API call.
- Size limit 2 MB per version. Strip `<base>`, `<meta http-equiv>`, `<iframe>`, `<object>`, `<embed>`, `<form>` targets, and external `<link>`s other than Google Fonts.

**Builder harness.**
- Input screening before the model sees it: a fast classifier call (and a keyword pre-filter) that refuses sexual content, graphic violence, hate, self-harm, drugs, gambling, real people, brands and copyrighted characters, personal information, and attempts to change the Builder's rules. Refuse kindly, suggest an alternative, log it.
- Static scan of every generated version: banned APIs (`fetch`, `XMLHttpRequest`, `WebSocket`, `navigator.sendBeacon`, `window.top`, `parent.location`, `document.cookie`, `eval` of strings from text, `import(`), external URLs, forms, hidden text, flashing patterns (more than three flashes per second), and visible-text profanity.
- Model review before anything becomes Public: Claude reads the visible strings and a summary of the game and returns a structured verdict (allowed, needs changes with reasons, blocked). Private and Friends publishing require only the static scan to pass. Public publishing requires the model review; if the API is unavailable, the game waits in a human review queue.
- Reports: any signed-in player can report a public game with a reason. Three open reports auto-hide the game pending admin review.
- Admin panel (role admin): review queue with preview and safety report, approve or reject with a note that the builder sees, suspend, ban, view reports and the audit log. Every moderation action is audited.
- Kid rules baked into the Builder's system prompt and enforced in review: no chat between players, no collecting names or personal details inside games, no external links, no real brands or real people, no gore, no horror jump-scares, no gambling mechanics, cartoon slapstick is fine, educational hooks are good.

Write `docs/safety.md` describing all of this in plain language, and `tests/safety/` with an adversarial prompt suite the mock provider and the static scanner must pass.

---

## 7. The Game Contract and SDK

Every game, seeded or generated, is a single HTML document that the platform wraps (charset, viewport, a small reset, the SDK script) and serves in the sandbox. Document it in `docs/sdk.md` and inject `public/sdk/playloom-sdk.js` into every frame. The SDK exposes `window.Playloom`:

- `Playloom.user` (display name, avatar, isGuest), `Playloom.game` (id, title)
- `Playloom.storage.get(key)` / `set(key, value)`: per-user, per-game cloud save (synchronous read, debounced write). Also install a `localStorage` shim backed by the same store, pre-seeded with the user's save before the game script runs, so existing games just work.
- `Playloom.score.submit(score, label)`: leaderboard, best score only.
- `Playloom.gameOver({won, score})`, `Playloom.fullscreen()`, `Playloom.orientation('landscape')`
- Juice helpers that raise the floor of generated games: `Playloom.fx.confetti()`, `shake(el)`, `flash()`, `sfx.play('jump'|'hit'|'win'|'lose'|'coin')` (WebAudio synth, no files), `tween()`, `fit(canvas, w, h)` for crisp scaling.
- Nothing else. No network, no DOM access to the parent, no identity beyond a display name.

The parent play page handles the messages (`pl:ready`, `pl:save`, `pl:score`, `pl:gameover`, `pl:fullscreen`, `pl:orientation`) and talks to the server. Monkey-patch `requestFullscreen` inside the frame to route through the SDK so the seed games' fullscreen buttons work.

---

## 8. Ads and builder earnings

The whole platform is free. Ads pay for it and for builders, and they must be so subtle that a kid never notices friction:

- Exactly two placements: one small "Sponsored" card that appears as every eighth tile in home and search grids, and one quiet card in the sidebar of the game page below the description. Same card style as a game card, labelled "Sponsored" in plain words.
- Never inside a game, never over a game, never on the play page, never a popup or interstitial, never autoplay, never sound, never a countdown, no tracking pixels from third parties, no behavioural targeting. Contextual only (category of the page).
- Build an ad provider interface with a `house` provider (JSON of Playloom's own promos such as "Make your own game", "Invite a friend") so the system works with zero partners, and leave a documented adapter point for a kid-safe network later.
- Impressions count only when the card is at least 50 percent visible for one second (IntersectionObserver), beaconed to the server, deduplicated per session, per placement, per hour. Fraud controls: ignore impressions from the owner's own sessions, cap per IP per day.
- Earnings ledger: impressions on a game's page accrue to that game at a configurable eCPM (default 200 cents per 1000) with a builder share (default 70 percent, log this as a decision for me to confirm). Home-grid impressions are split across the games shown in that grid row. Nightly job rolls `ad_impressions` into `earnings`.
- Creator dashboard: plays, unique players, average rating, live players, impressions, estimated earnings per day and lifetime, per game and total. Payout requests above a threshold (default $10) create a `payouts` row for manual handling; design the Stripe Connect adapter but stub it.

---

## 9. UX and UI standard

The UI must be excellent for a 6-year-old and a 60-year-old. Build one design system in `public/css/app.css` and use it everywhere:

- Tokens: a bright, friendly palette (one primary blue, one coral accent, one lime success, one sunshine yellow for stars and highlights), neutral greys with a slight blue bias, light and dark themes following the system setting.
- Type: a rounded readable family for everything (Nunito or similar) with a display weight for titles; minimum 16px body on phones; headings that wrap.
- Components: game card (3:4 cover, icon art, title, builder, stars, live pill), rail with snap scrolling and arrow buttons on desktop, big primary button, icon buttons with labels, chips, star rating, toast, modal sheet, tabs, empty states with a friendly illustration and one action, skeleton loading, form fields with inline validation in plain words.
- Navigation: top bar plus bottom tab bar on phones; current section always highlighted; Back always visible on inner pages; no dead ends.
- Accessibility: WCAG AA contrast, keyboard operable, focus visible, labels on every control, reduced-motion respected, screen-reader text on icons.
- Performance: no page over 150 KB of CSS and JS, first paint under one second on a mid-range phone, images are emoji or generated gradients so nothing heavy loads.
- Copy: plain words a child can read, one idea per sentence, verbs on buttons ("Play", "Build", "Add friend"), never system jargon.

Screenshot every page at 390px and 1280px in light and dark and fix what looks wrong before calling a node done.

---

## 10. Seed games

Import the three games from `seed-games/` with `scripts/import-game.js` (reads an HTML file and a metadata JSON) and `scripts/seed.js` (creates the admin from `ADMIN_USERNAME`/`ADMIN_PASSWORD`, the official "Playloom" builder account, and the three featured games). The games were written to be wrapped by a skeleton (they start with `<title>` and `<style>`), which matches the Game Contract. They use `localStorage` inside try/catch; the SDK shim makes those saves cloud-backed per user. Verify each one plays end to end in the sandbox, including Footy Tycoon's trophy shop persisting between visits and Ring Rumble's fullscreen button.

---

## 11. Social, sharing and discovery details

- Visibility rules enforced in one place (a `canView(user, game)` service) used by every route and query. Private: owner and admins. Friends: accepted friends. Public: everyone, only while status is published.
- A game can change visibility any time; moving to Public re-triggers review if the published version was never reviewed.
- Share sheet copies a link and explains in one sentence who can open it.
- Friends page: your code, enter a code, pending requests, accepted friends with what they are playing right now, and their shared games.
- Profiles are public but show only username, avatar, games and stats. No bios with free text for kids' accounts (keep bio admin-only for now).
- Live player counts everywhere a game appears, updated every 30 s on the client without reloads.

---

## 12. Testing, operations, deployment

- Unit tests: scanner, visibility rules, rating maths, earnings maths, username filter, SDK message validation.
- End-to-end (Playwright, headless): guest plays Shark Plank and a save round-trips; sign up, upgrade from guest keeps saves; search by title and by builder name; rate and like; live player count rises when a second browser context opens a game; friends-only game invisible to a stranger and visible to an accepted friend; Studio with the mock provider: questions, chips, generated game appears in preview, an edit produces version 2, restore version 1, publish Friends then Public, admin approves, game appears on Home; report flow hides a game after three reports; ad impression beacon lands in the ledger and shows on the dashboard; admin cannot be reached by non-admins.
- Safety suite: adversarial prompts are refused; a version containing `fetch(` or an external link fails the scan; a flashing animation is flagged.
- Ops: `scripts/backup.js` for the SQLite file, nightly earnings roll-up as a scheduled job or an admin button, structured request logs, health endpoint, graceful shutdown. Optional PostHog hook behind an env flag.
- Deploy: Dockerfile, `render.yaml` with a persistent disk, README with env vars (`SESSION_SECRET`, `ANTHROPIC_API_KEY`, `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `AD_ECPM_CENTS`, `BUILDER_SHARE`, `BUILDER_DAILY_TURNS`, `PLAYLOOM_DATA_DIR`), and a one-command local start (`npm install && npm run seed && npm start`).

---

## 13. Definition of done (run this checklist before you report)

1. Fresh clone, `npm install`, `npm run seed`, `npm start` works on Node 22 with no API key; the three seed games are playable as a guest.
2. All unit, e2e and safety tests pass; the commands are in README.
3. Every page screenshot reviewed at phone and desktop widths, light and dark, with no overflow, no unreadable text, no dead ends.
4. A builder can go from "New game" to a published Public game using the mock provider, and the same flow works with a real `ANTHROPIC_API_KEY` (document how you verified it, or that you could not).
5. Sharing levels, ratings, search by builder, live player counts, reports, admin review, ad impressions and the creator dashboard all demonstrably work.
6. `docs/build-graph.md`, `docs/decisions.md`, `docs/status.md`, `docs/safety.md`, `docs/sdk.md` and `README.md` are current and honest about limits.
7. Docker image builds and boots.

Then report: what is live, how to run and deploy it, the decisions you want me to confirm (revenue split, model choice, names), and the roadmap you recommend next (real-time multiplayer over WebSockets, a kid-safe ad partner, Stripe Connect payouts, builder analytics, game remixing, 3D later).

---

## 14. Things that are not allowed

- No real-money purchases, loot boxes, or paid boosts.
- No third-party trackers, no behavioural ad targeting, no data brokers.
- No free-text chat between users, no DMs, no comments in v1.
- No external links inside games, no real brands, no real people or copyrighted characters in generated games.
- No shortcuts on the sandbox: never `allow-same-origin`, never a relaxed CSP "just for this game".
