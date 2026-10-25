# Decisions

One line each: the choice, then why. **Bold = please confirm** (product calls that are expensive to reverse).

## Owner requests that change the original brief
- **Name: "Magic Cup"** (was "BRB Gaming", before that "Playloom"). Every visible name, the logo (a gold cup), the browser icon, page titles, Builder and safety copy, docs and the official account (`MagicCup`, renamed in place from `BRBGaming` by the seed so its games keep their owner) say Magic Cup. Internal technical names stay as they were: the game SDK global `window.BRB` and `brb:*` messages (every existing game calls them), `BRB_*` env vars, the `brb_session` cookie and `brb.db`. — Owner asked to rename the site; renaming the SDK would break every published game and renaming env vars/cookies would break the deploy and sign everyone out.
- New Render service `magic-cup` (https://magic-cup.onrender.com) replaces `brb-gaming`: Render can't change an existing service's onrender.com subdomain. — Owner asked for the onrender domain to change too.
- **Name: "BRB Gaming"** (was "Playloom"). SDK global is `window.BRB`, messages are `brb:*`, env vars are `BRB_*`, official account is `BRBGaming`. — Owner asked to rename.
- **Friends-only chat added** (brief said no chat). Text chat only between accepted friends (added by friend code), both with real accounts, filtered for profanity and personal info (phones, emails, links, addresses, "add me on snap"), quick-chat phrase chips for young kids, rate limits + daily cap, block, report → admin queue, grown-ups can switch chat off on the Me page. No public, group or stranger chat. — Owner asked for a way for users to chat; this is the safest version that meets it.
- **Updating published games is first-class.** The Studio shows "Live: vN · Editing: vM" and an "Update live game" button; for Public games the update is reviewed while players keep the old version (`games.pending_version_id`). — Owner asked that builders can update games they already published.
- **Inspiration uploads in the Studio** (photos, drawings, text files, PDFs). They are private to the builder and admins, metadata such as photo GPS is stripped, and images are screened when an API key is set. They are given to the Builder as reference only and never copied into games, so no real photos of kids end up in public games. — Owner asked for uploads for inspiration.
- Home hero shows only the featured game; "Make your own game" is its own banner below the Featured rail. — Owner feedback: mixing them in one card was confusing.
- The GitHub repository itself could not be renamed from this session (no repo-settings tool); rename it in GitHub → Settings → General. Everything inside the repo is renamed.

- **Two more launch games: Connect Four and an 18-hole mini golf homage to *Happy Gilmore*.** The golf course mimics the movie's gags (hockey slap-shot tee, the laughing clown's mouth, the alligator pond, grandma's house, the happy place, the TV-tower finale) but uses no character names or likenesses and no brands, so it stays kid-safe and copyright-safe; the description names the movie as the inspiration. Connect Four uses an original title (the "Connect 4" name is a trademark). — Owner asked for a connect-four game and a mini golf course from a famous movie or show ("just pick one"); Happy Gilmore is the best-known golf movie with an actual mini-golf scene and a 2025 sequel.
- Seed games are listed once in `scripts/seed.js` (`SEED_GAMES`) and the scanner tests read the same list of slugs. — One place to add a launch game.

## Revenue and models
- **Builder share 70% of ad revenue, eCPM 200¢ (house ads), payout threshold $10** — brief defaults, configurable via env; needs owner sign-off.
- **Builder model `claude-sonnet-5-5`, "Pro quality" uses `claude-opus-5-5`; screening/review classifier uses a small model** — brief defaults; cost vs quality is the owner's call.

## Engineering
- Account security: bcrypt cost 11; login compares against a dummy hash for unknown names (no timing leak) and gives one message for wrong name or password; the 50 most common passwords, one repeated character, and passwords containing the username are refused; the session id is rotated when a guest becomes an account; expired sessions are swept hourly; concurrent sign-ups with the same name get a friendly error. — Owner asked that new accounts are stored and secure.
- Express 5 + server-rendered HTML + vanilla ES modules, no build step. — Brief default; fast first paint on cheap phones.
- SQLite (better-sqlite3, WAL) behind `q` and service modules. — Brief default; Postgres swap stays a repository-layer change.
- Reused the starter's schema/auth/games/presence; rewrote: `canView` now also respects report auto-hide; added `pending_version_id`, `hidden_reason`, version `review_status`, chat tables, `users.chat_enabled`; bounded all filter regexes after a 2 MB input hung the scanner.
- Nunito is self-hosted from `@fontsource/nunito` instead of Google Fonts. — No third-party requests from the site itself (privacy) and no external CSP host.
- Site CSP has no inline scripts; page data goes in `<script type="application/json">`. — Strict CSP for the site, separate stricter CSP for game frames.
- Game frames are reached by a short-lived signed token URL (`/frame/<token>`), not cookies. — Frames are opaque-origin; the token carries version + viewer and expires in 6 h.
- The SDK is inlined into each frame. — The frame CSP only allows inline scripts + cdnjs, and `'self'` means nothing in an opaque origin.
- localStorage inside games is replaced by a synchronous in-memory shim pre-seeded with the cloud save and debounce-synced through the parent. — Opaque-origin frames cannot use real localStorage; existing games (seeds) just work.
- Scanner levels: `fail` blocks all sharing; `flag` (e.g. flashing, hidden text) allows Private/Friends but always needs a human before Public. — Brief says flashing is "flagged"; a human should decide.
- Publishing Public without an API key always goes to the human review queue. — Brief: if the model is unavailable, wait for a human.
- An already-approved version is not re-reviewed when visibility changes back to Public. — Same bytes, same verdict.
- One-tap play: opening `/play/...` without a session creates a guest (rate-limited per IP). — "Play as a guest in one tap", and saves work from the first game.
- Friends and chat require a real (non-guest) account; guests can play, rate, like and report. — Guest identities are throwaway; friendships and messages need accountability.
- Report auto-hide counts distinct reporters, ignores the owner, threshold `REPORTS_TO_HIDE` (3). — Brief rule; distinct users stop one person hiding a game.
- Saves are a string→string map per user per game, max 500 KB. — Matches the localStorage shape; bounded.
- Presence is in-memory per process (75 s TTL, 30 s heartbeat). — Brief rule; a multi-instance deploy would need Redis (roadmap).
- Rate limits are in-memory per process. — Fine for one instance; same Redis note.
- Ratings sort uses a Bayesian average (prior 3★ × 2) for "Top rated". — Stops one 5★ vote topping the chart.

## Real screenshots as cover art for launch games
Launch games show a real screenshot (`public/covers/<slug>.jpg`) on cards, the game page and the home hero instead of the emoji placeholder. `npm run covers [slug...]` makes them: it runs each game in the real sandbox wrapper, plays it to a good moment with a per-game recipe, and photographs it at the card's 3:4 shape. Studio games keep the emoji art (we never screenshot user games automatically). The image URL carries the file's mtime so a re-capture shows up past the 1h static cache.

## Renamed to Magic Cups
The site name is now **Magic Cups** (was Magic Cup). Every visible string, the page titles, the logo, the web manifest and the official account (`MagicCups`, renamed in place on boot from `MagicCup` or `BRBGaming`) changed. The Render service and its URL stay `magic-cup` (`magic-cup.onrender.com`) until a new service is set up, because Render can't change an `.onrender.com` address in place.

## Thirteen site languages (i18n)
The whole site is available in English (US, default), English (UK), Brazilian Portuguese, French, Spanish, German, Hebrew, Japanese, Arabic, Russian, Italian, Traditional Chinese and Dutch, picked with a 🌐 menu in the header (and on the Me page). — Owner asked for these languages with a picker like makie.kidsai.app.
- **Choosing a language**: `?lang=` → `lang` cookie (1 year, SameSite=Lax) → the signed-in player's saved choice (`users.lang`, migration `0003_user_lang`) → `Accept-Language` → English. A choice stores the cookie and the account value, then redirects to the same page without `?lang=`. The picker is a `<details>` menu of plain links, so it works with no JavaScript; `app.js` adds Escape, outside-click and arrow keys. A new account keeps a language picked before signing up; a language guessed from the browser is never saved. — The owner's order; links keep the picker CSP-safe and accessible.
- **Message format: ICU-lite** (`{name}`, `{count, plural, one {...} other {...}}`, `select`) in nested JSON files, one parser shared by server and browser (`public/js/i18n-format.js`), English fallback per key. — ICU plurals cover Arabic's six forms and Russian's three in one key, so every locale has exactly the same keys and the subset/placeholder test can guard the translators' work. A `_one/_other` key convention would make keys differ per language.
- Services that produce kid-facing messages take an optional `t` (default English), and shared view helpers read the request's language through AsyncLocalStorage. — Tests, scripts and the admin panel stay English with no changes; no global mutable locale.
- **Quick chat phrases are stored by id** and shown to each reader in their own language, so friends with different languages can still send "Good game!". Typed messages are never translated. Older rows with English text still show. — Safer and simpler than machine translation of kids' chat.
- **Arabic uses Western digits (0-9)** (`ar-u-nu-latn`), like the games and scores. — One line to change in `server/i18n/index.js` (`LOCALES[].intl`) if the owner prefers Arabic-Indic digits.
- Right-to-left (he, ar): the stylesheets use logical properties, back/forward arrows mirror, games, friend codes and scores stay left-to-right, and text people typed takes its direction from its own letters. Game frames stay left-to-right; games get `BRB.user.lang` / `BRB.user.dir` to localize themselves later.
- **The Builder answers in the kid's language** (a LANGUAGE system block after the cached ones, so prompt caching still works) and writes in-game text in it unless asked otherwise; the input classifier is told messages can be in any language. Canned refusals come from the locale files. Without an API key the keyword pre-filter and mock classifier are English-only, so other languages rely on the word lists and the model classifier in production. The offline mock Builder stays English (its idea chips are parsed back by English keyword rules).
- **Safety filters in every language**: input is NFKC-normalised (full-width letters and digits), invisible characters are dropped, digits of any script count for the phone detector, emails with non-Latin letters are caught, and per-language word lists in `server/i18n/blocklists/<code>.txt` (ROT13, like the launch games' list) apply to every message whatever the sender's language. The lists ship empty with a header for the translators to fill. **Usernames stay Latin letters and digits** (`A-Z a-z 0-9 _`) in every language. — Names are seen by everyone; one script keeps look-alike tricks and impersonation out.
- **The admin panel stays English** (internal tool); its page frame follows the admin's language. Scanner issue texts (e.g. "Uses fetch()") and model review reasons stay English: they are technical and also go back to the Builder.
- Template ("Start from") names and descriptions are translated on the Build page; the games they create, and the launch games, are not translated (separate work).

## Only finished languages are offered
The 🌐 picker, the account language setting and browser-language matching only offer English plus locales that have at least 90% of the English keys (`en-GB` counts once it has any, since it only lists UK differences). A half-done translation never appears as a choice; an explicit `?lang=` or an old cookie still works and falls back to English for missing keys. With only English ready, the picker is hidden. `BRB_ALL_LOCALES=1` offers every locale (used by the e2e tests and by translators checking their work).

## AI spending cap
Every Claude API call (Builder, chat classifier, picture check, public review) records its cost from the response's `usage` (list prices per model in `server/services/ai-budget.js`; an unknown model is priced like the most expensive one). Once today's spend reaches `AI_DAILY_BUDGET_USD` (default $5) or this month's reaches `AI_MONTHLY_BUDGET_USD` (default $50), the shared client stops being handed out: the Builder switches to the offline builder and says it's resting, picture uploads are refused (they can't be safety-checked), the chat classifier steps aside (word filters still run) and public reviews go to the human queue. A Builder turn already running finishes its current call and stops. Spend is kept per UTC day in the `ai_spend` table (so it only survives deploys once the service has a disk) and shown on `/admin`. This is the site's own guard; the Anthropic Console spend limit is the hard backstop.

## Real people: facts yes, characters no
Kid feedback showed the Builder refusing a soccer quiz about famous players and World Cup records. The rule is now: true, kind, well-established facts about well-known public figures are fine in quiz, trivia and learning games; a real person as a character, hero, enemy or picture, any jokes or made-up things about them, and any private person the child knows stay refused. The model classifier, the Builder's system prompt and public review all use this wording; the offline name list skips its real-people rule for quiz/trivia/facts requests unless they mock someone.

## Builders can delete their own games (soft delete)
"My games" on /build has Rename and Delete. Delete asks first, then marks the game `status='deleted'`: it leaves every
list, the review queue and search, and its Studio and play page answer 404, even for the owner. The row and its versions
stay in the database so reports, earnings history and the audit log still point at something; admins can still open it.
Starter (seed) games can't be deleted, since they belong to the site.

## Favorites are the ❤️ button (formerly "Like")
The ❤️ button on a game was already saving a list (profiles showed it as "Favorite games"), so it is now called
Favorite instead of adding a second, look-alike button. Signed-in players (accounts and guests) get a ❤️ My favorites
row at the top of Home, a /favorites page and a Me tile. The list only shows games the player may still open, so games
that go private or get deleted drop off. Existing likes became favorites with no migration.

## Real screenshots for Studio games, and a Builder that playtests
A headless Chromium on the server (installed in the Docker image, one game at a time, closed when idle) runs games in the
same sandbox players get. It is used for two things:
- **Cover pictures.** Every new version is photographed in the background (title screen, then about two seconds after Play;
  the gameplay picture wins unless it came out blank). Players only ever see the picture of the version that is live; the
  builder sees their draft's on My games. Launch games keep their hand-made covers. `/shots/<version>.jpg` checks access.
- **The Builder's playtest_game tool.** After building, the model gets the two pictures plus errors and layout problems
  (wider than the screen, text past the edge, small buttons, missing test hook) and fixes what it sees before showing the kid,
  the same build, look, fix loop used to make the launch games. The Game Contract now asks for `window.__brbTest` and the
  prompt carries the launch games' art direction.
The home hero shows the featured game's picture on phones too (it used to hide it under 640px).

## Admin stats dashboard (/admin/stats)
Admins get a Stats page (button on /admin): headline tiles for today and this week, one bar chart per measure for the
last 7, 30 or 90 days (visitors, new accounts, plays, games started, Builder messages, AI cost, AI tokens; each with a
table view, tap a bar for its day), and lists of top games, top builders, page areas, AI use by model and newest accounts.
Site visits are counted without tracking anyone: only daily totals per page area are stored, and a visitor counts once a
day through a salted hash of (day, IP, browser) that changes every day and is deleted after two days. Bots, APIs, files,
game frames, errors and admin pages are not counted. AI tokens are logged per day and model next to the spend cap.
Counting of visits and tokens starts with this update; plays, accounts, games and AI cost already had history.

## No ads, no creator money (ed-tech pivot)
Magic Cups is becoming an enterprise ed-tech product, so it will not be paid for by ads. The Sponsored cards, ad impression
tracking, the earnings roll-up, the Creator money page, payout requests and the admin Money page are removed, with their
settings (AD_ECPM_CENTS, BUILDER_SHARE, PAYOUT_THRESHOLD_CENTS) and texts. Existing databases keep the old ad_impressions,
earnings and payouts tables untouched (nothing reads them); new databases no longer create them.

## Profile photos: friends-only, safety-checked
Players with a real account can use a photo instead of their emoji (Me → Pick your look). The browser crops it to a 512px
square JPEG; the server accepts only that, strips all metadata, and runs an AI safety check first (nothing unsafe, no
private details such as name tags, school logos or addresses; faces are fine). Without the check (no API key or the AI
budget is resting) photos wait. A child's face is never public: /avatars/<id> sends the photo only to the player, their
accepted friends and admins, and the emoji to everyone else. Admins can remove a photo from the Users tab; all changes
are audited. Guests keep emoji only.

## Schools, step 1 (enterprise foundation)
The game site stays as it is; schools are a layer on the same app and the same accounts.
- **Roles:** platform admin (users.role='admin') creates schools and appoints school admins (/admin/schools). School
  admins run the whole school (/school/<slug>: classes, people, settings). Teachers create classes (unless the school
  turns that off) and run their own: roster, adding students (one name per line -> school accounts + printable login
  cards), moving students between classes of the school, resetting school passwords, approving join requests, adding
  co-teachers. Students see My classes (/classes) and a class page. All checks live in services/schools.js.
- **Accounts:** teachers create school accounts by default (users.managed_school = the school; usernames like
  SunnyOtter27, passwords like maple-comet-42, shown once on login cards). Students who already have their own account
  join with the class code; a teacher approves and types their real name for the class list, and can match them to a
  school account made earlier (its class records move over, the empty school account is switched off). Schools can turn
  own accounts off.
- **Names:** real names live only in school_members.roster_name. Staff see students' real names; students see their
  teachers' real names and only usernames for classmates; the public site never shows real names.
- **History:** members and class members are never deleted, only marked 'left' with a date, so class moves keep
  records; classes with students are archived rather than deleted. School years and grade rollover come in step 4.
- **Game-site rules for school accounts (school-adjustable):** friends only with classmates; chat with classmate friends
  or off; games shared inside the school ('school' visibility, a new sharing level any school member can use) and not
  public unless the school allows it; profile photos also visible to classmates and teachers. Students' own accounts
  keep their normal settings outside class.

## Schools, step 2 (lesson plans)
- **Library:** each teacher has a lesson library per school (/teach/lessons) with nested folders and their own order
  (↑/↓ on folders and lessons; deleting a folder moves its contents up). A lesson can be shared with the school; other
  teachers see shared lessons read-only and can copy them into their own library. School admins can edit any lesson.
- **Lessons are steps:** read (instructions or a short text), play a game (any game the class can open: the teacher's,
  shared in the school, or public) and build a game (the idea a student types to the Builder). If a game step uses the
  teacher's own unshared game, the editor warns and offers "Share with my school". "Make a new game" opens the Studio
  with the idea filled in.
- **✨ Draft with AI:** Claude drafts title, summary, objectives and 3 to 7 steps from a topic and grade, in the
  teacher's language, choosing only from games the teacher can use. Counts towards the AI spending cap; without an API
  key a simple template draft is made instead. The teacher edits the draft before using it.
- **Assigning:** lessons are assigned to classes, optionally in units, with an optional open date and due date.
  Assignments are live links: edits to the lesson show up for every class. Students see open lessons on their class
  page; a build step makes a game in the student's own Studio with the idea filled in.
- **Later (step 3):** progress, scores from games, written answers and the gradebook.

## Spacing: containers never touch
- The schools/teaching module uses one spacing scale (4 · 8 · 12 · 16 · 24 · 32 px, `--s1`…`--s6` in
  public/css/schools.css) and shared rules instead of per-page margins: blocks stacked in a page keep 16px, items
  stacked inside a panel keep 12px, forms, button rows, lists, menus and phone tables each have one rule.
- `tests/e2e/touching.js` measures every box on a page (a border, shadow or different background) and reports any
  two that touch (< 8px, < 4px between controls). `tests/e2e/layout.spec.js` runs it on the main pages at phone,
  tablet and desktop widths, light and dark, with collapsible sections closed and opened; `scripts/layout-audit.js`
  crawls every page it can reach as several people and runs the same check.

## Schools, step 3 (progress and gradebook)
- **What counts as done:** read steps when the student marks them done; questions when they send an answer; game
  steps when the game reports a score or the end of a game, after 2 minutes of play, or when the student marks it
  played; build steps when the student hands in their game (it is shared with the school so the teacher can play it).
- **Game scores** come from the game SDK: a lesson's Play button opens `/play/<game>?lesson=<class lesson>&step=<step>`,
  and the play page reports start, play time, scores and game over for that step (best score kept). Only students of
  the class, on open lessons, and only for that step's game.
- **Written answers:** a new step type, "Answer a question". Answers are seen only by the class's teachers and school
  admins. Feedback marks an answer read; a changed answer goes back to the teacher's "to read" list. Counts of
  answers to review show on My classes, on the class's Progress tab and on the lesson.
- **Build steps** make one Studio game per student (reopened later, not a new game each time).
- **Class page tabs:** Lessons, Progress (the gradebook: students × lessons, steps done, past-due and to-read marks,
  CSV download), Students (join requests, roster, add students, class code) and Settings (details, co-teachers,
  archive). New classes open on Students. One lesson's progress page shows every student × step (scores, answers,
  handed-in games) and the answers with feedback forms.
- **Keeping work:** removing a lesson from a class keeps its students' work (assigning it again brings it back); deleting
  a step or a lesson deletes its work, and the confirm says how much (see the UX deep dive below).
- Not yet: grading scales/marks, rubrics, parent views, LMS grade sync (step 5).

## Teacher and admin UX deep dive
A review of every teacher, school-admin and platform-admin flow (plan with teacher and engineer verdicts kept in the
session notes), done in three batches. The main decisions:
- **One name per thing** (glossary): "My classes" is the teacher's home (/teach) and the student's (/classes); the
  platform admin has "Schools"; the school page is reached with "Manage {school}"; "Lesson library" / "My lessons" /
  "Shared by colleagues"; teachers *review* answers (not "read"); "Class code"; "Make a copy".
- **Sign-in home:** staff land on My classes, school-account students on their classes, the platform admin on Admin,
  everyone else on the game home (an explicit ?next= still wins). The platform admin who isn't staff of a school is
  sent from /teach, /teach/lessons and /classes to Schools; staff with no student classes are sent from /classes to
  /teach; the platform admin can't join a class as a student.
- **Student work is never lost by tidying:** class lessons are soft-removed (`class_lessons.removed_at`, migration
  0012); every query skips removed rows, a removed lesson takes no more work, and assigning it again revives the row
  with its work. A lesson can be in a class only once. Colleagues' shared lessons must be copied before they are
  assigned (so a colleague's edits or delete can't change another teacher's class).
- **Due dates:** nobody is late on the due day. Without a school time zone, late = 36 hours after the start of the due
  date in UTC, so the whole due day counts in every time zone; lessons that haven't opened are greyed out in the
  gradebook and don't count towards Overall (page and CSV agree).
- **Time zone per school** (school Settings, `settings.timeZone`, an IANA name): dates stay stored as the calendar day at
  00:00 UTC (no migration); class-lesson rows carry the school's `tz` (one join, never a lookup per row) and
  `isOpen`/`dueState` count the day from that zone's local midnight to the next (DST handled from Intl offsets, with a
  one-step re-adjustment and a check for zones that switch at midnight), so "Due today" and "Late" flip at the school's
  midnight and the 36-hour grace is only for schools with no zone. Stored days print with `fmt.day` (UTC), never
  `fmt.date`, so the server's own zone can't shift a date. Teachers see which rule applies next to the assign forms and
  on the gradebook.
- **Counts lead somewhere:** class cards link "✋ requests" to the Students tab's requests and "✍️ to review" to the
  gradebook's review list; gradebook cells with new answers open the first new answer; class lesson rows open that
  lesson's progress. All "to review" counts only count current students, so they always agree.
- **School page:** a new class asks who teaches it (a staff member, or "No teacher yet"); the admin no longer becomes
  everyone's teacher. Archive/Delete sit in a ⋯ menu per row (and in class Settings); Delete only for classes no
  student ever joined. A new school opens on People to appoint its school admin; /admin/schools shows each school's
  admins or "None yet".
- **Adding people:** staff are added with an explicit "school account" / "existing Magic Cups account" choice (a toast
  or a clear error either way; usernames are never made from real names). Students are added either as new school
  accounts (names) or by ticking students already at the school; a typed name that exactly matches an existing
  student is refused (all matches listed, nothing created). People-tab students can go straight into a class.
- **Login cards** name the school (and class, and role for staff), say where to sign in (`<host>/login`), use the
  sign-in page's "Magic Cups name", and go back to the page they came from. "New login cards for the class" resets
  every school account in a class at once (confirm says they'll be signed out; own accounts are listed as skipped).
- **Roster rows:** "New password" stays visible (the most common daily request); Move and Remove live in a ⋯ menu;
  Move starts on "Move to…" and asks first. Teachers can leave a class they co-teach.
- **Lesson editor:** Assign / Make a copy / Share at the top; details folded under "Edit details"; a live notice says
  which classes have the lesson and how many students started; the step form shows only the fields for its type;
  a copy opens straight away in the original's folder. Delete confirms say how much student work goes.
- **Offline lesson drafts** (no API key) say so honestly, match games by tags then titles, and scale step minutes to
  the requested length.
- **Who can reset or merge accounts** (found by the adversarial review): from a class, teachers reset passwords of
  students only; staff passwords are reset by school admins on People (never your own: it would sign you out).
  Approving a join request "same as" a school account only takes a student school account, never into someone who is
  now staff; the account's lesson work moves with it. Someone made staff has their old join requests closed.
- **Top bar on small laptops and landscape tablets** (821–1180px): the profile name and logo text hide and nav links
  tighten, so the bar fits with the Classes or Schools tab in every language. app.js adds its page-wide listeners once
  even when a page module imports it a second time (one click, one request).
- Left for later: school-level dashboards (per-teacher activity), SSO, and roll-over of classes between school years.

## Security review (pre-launch pen test)
A defensive security review (8 areas, each finding independently verified against a seeded two-school server) led to these fixes:
- **Credential brute-force.** `trust proxy` now defaults off, so a directly-exposed server can't be given a spoofed
  `X-Forwarded-For` to reset IP rate limits (set `TRUST_PROXY` when behind a real proxy). Login is additionally capped
  per account (10 / 15 min), independent of IP, and auto-generated school passwords went from ~29k to ~525k combinations.
- **Report griefing.** Auto-hide now counts only distinct non-guest, non-owner reporters, so a few throwaway guest
  reports can't silently take a game down (guest reports are still queued for admin review).
- **Cross-teacher account merge.** Approving a join request "same student as" an existing account now requires the
  teacher to actually manage that student (`canManageStudent`), so one teacher can't hijack another's pupil.
- **School-wide publishing.** A game shared to a whole school now needs a human look when the safety scan flagged it,
  the same as public (private/friends stay instant).
- **Game frame.** Frame tokens are bound to their viewer and re-check live visibility, their lifetime dropped from 6h to
  minutes, and the frame CSP carries a `sandbox` directive so a leaked frame URL is opaque-origin even if opened top-level.
- **Smaller fixes.** `?lang=` only persists for same-origin requests; play/heartbeat need a session; a score only counts
  after a recorded play; the chat/text link filter detects any TLD (not a short allowlist) without flagging filenames.

## Light, dark or "same as my device"
Players pick a theme from a ☀️/🌙/🌓 menu next to 🌐 in the top bar, or in the Appearance panel on the Me page. The
default, "Same as my device", follows the phone or computer's own setting, as the site always did.
- **Choosing works like choosing a language:** `?theme=` → `theme` cookie (1 year, SameSite=Lax) → the signed-in player's
  saved choice (`users.theme`, migration `0014_user_theme`, `''` = same as the device) → the device. A `?theme=` link only
  saves for same-origin or direct requests and then redirects to the page without it, so the menu and the Me page form
  work with no JavaScript; with JavaScript the switch is instant and `POST /api/me/theme` saves it (signed out: cookie
  only). A choice made before signing up comes along to the new account; a new device with no cookie uses the account's.
- **No flash:** the server writes `<html data-theme="light|dark">` (only for an explicit choice) and a matching
  `<meta name="color-scheme">` (`light dark` when following the device), so the first paint is right before any script runs.
- **Two-block rule for CSS:** every colour that differs between the themes is a token on `:root` in `public/css/app.css`
  (including `--on-accent` for text on blue, coral and red fills, `--warn-bg`/`--warn-ink`, `--bad-ink`, `--viz-1`). The dark
  values live in exactly two blocks with the same body: `@media screen and (prefers-color-scheme:dark){:root:not([data-theme="light"]){…}}`
  and `@media screen{:root[data-theme="dark"]{…}}`. No other `prefers-color-scheme` or `[data-theme]` rules anywhere in
  `public/css`: a component that needs a different dark colour gets a token instead. `tests/unit/theme.test.js` checks
  this. The `screen` wrapper means printing (login cards) always uses the light palette.
- In dark mode, text on blue, coral and red fills is now dark (it was white on a few of them: the current nav tab, badges,
  the coral buttons, the friends-chat bubble, error toasts), because white on the lighter dark-mode accents was below 3:1.
- The narrowest phones (under 360px) keep today's top bar, since the search box would get too small; they choose on the Me
  page (signed-out visitors there follow their device). From 821 to 1180px the bar's gaps tighten and 🌐 drops its "EN" so
  the extra button fits in every language. Game frames and games keep their own colours.
