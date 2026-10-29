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
- The site font is self-hosted (now Bricolage Grotesque in `public/fonts`, before that Nunito) instead of Google Fonts. — No third-party requests from the site itself (privacy) and no external CSP host.
- Site CSP has no inline scripts; page data goes in `<script type="application/json">`. — Strict CSP for the site, separate stricter CSP for game frames.
- Game frames are reached by a short-lived signed token URL (`/frame/<token>`), not cookies. — Frames are opaque-origin; the token carries version + viewer and expires in 6 h.
- The SDK is inlined into each frame. — The frame CSP only allows inline scripts + cdnjs, and `'self'` means nothing in an opaque origin.
- Game voices: `BRB.speak` / `BRB.voice` pick the most natural voice the browser offers (Web Speech API, scored by region match and voice quality) at normal pitch and rate. Order within the language: on-device natural voices (Natural/Neural, Premium, Siri, Enhanced, ChromeOS natural), then the browser's **online** voices (`localService === false` / `-network`: Edge's "Microsoft … Online (Natural)", Chrome's "Google US English"…), then plain on-device voices (Microsoft David/Zira, "Desktop", Apple compact), then eSpeak / Eloquence / Apple novelty voices; a wrong-language voice is never used. Same ranking in the SDK and the standalone copies in word-peek and shark-plank. — Owner: the voices sounded robotic; free, no server or paid TTS of our own. **Decided 29 Oct 2026 (owner): online voices are allowed**, even though they send the spoken text to the browser vendor (Microsoft or Google): games already used them before this change, and skipping them left Chrome/Edge on Windows with robotic "Desktop"/David voices in English and silence for other languages. On-device natural voices still come first, so Macs, iPhones, Chromebooks and Windows 11 with natural voices installed keep the text on the device.
- Better voices in **every** game, not only those using `BRB.speak`: the SDK (inlined into every frame) wraps `window.speechSynthesis.speak` once, so official games and Builder games already saved that call it directly get the same ranking without being edited. An utterance with no voice gets the best voice for its `lang` (or the game's language); a voice the game picked is replaced only when it is penalised (eSpeak, Eloquence, Apple novelty/MacinTalk, Windows "Desktop", Apple compact) and the best voice for the same language scores 30+ points higher (so Desktop/compact only give way to natural or online voices); a voice in another language than the utterance is never changed. A mild pitch shift (0.85–1.25, not 1) becomes 1; stronger shifts (character voices), rate and volume are kept. Nothing is delayed or split: before the voice list loads, utterances are spoken as made. — **Decided 29 Oct 2026 (owner): upgrade voices in all games, Oomba and Builder, via the SDK.** Old games picked the first matching voice (often Albert, eSpeak or a Desktop voice) and raised the pitch slightly, which is what sounded robotic.
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

## Renamed to Magic Cups (history; now Oomba Academy, see the last section)
The site name became **Magic Cups** (was Magic Cup). Every visible string, the page titles, the logo, the web manifest and the official account (`MagicCups`, renamed in place on boot from `MagicCup` or `BRBGaming`) changed. The Render service and its URL stay `magic-cup` (`magic-cup.onrender.com`) until a new service is set up, because Render can't change an `.onrender.com` address in place.

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
Every Claude API call (Builder, chat classifier, picture check, public review) records its cost from the response's `usage` (list prices per model in `server/services/ai-budget.js`; an unknown model is priced like the most expensive one). Once today's spend reaches `AI_DAILY_BUDGET_USD` (default $5) or this month's reaches `AI_MONTHLY_BUDGET_USD` (default $150, "Paid plans" D0), the shared client stops being handed out: the Builder switches to the offline builder and says it's resting, picture uploads are refused (they can't be safety-checked), the chat classifier steps aside (word filters still run) and public reviews go to the human queue. A Builder turn already running finishes its current call and stops. Spend is kept per UTC day in the `ai_spend` table (so it only survives deploys once the service has a disk) and shown on `/admin`. This is the site's own guard; the Anthropic Console spend limit is the hard backstop.

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
The site is becoming an enterprise ed-tech product, so it will not be paid for by ads. The Sponsored cards, ad impression
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
- **Adding people:** staff are added with an explicit "school account" / "existing Oomba Academy account" choice (a toast
  or a clear error either way; usernames are never made from real names). Students are added either as new school
  accounts (names) or by ticking students already at the school; a typed name that exactly matches an existing
  student is refused (all matches listed, nothing created). People-tab students can go straight into a class.
- **Login cards** name the school (and class, and role for staff), say where to sign in (`<host>/login`), use the
  sign-in page's "Oomba Academy name", and go back to the page they came from. "New login cards for the class" resets
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
- **Top bar on small laptops and landscape tablets** (821–1180px): the profile name hides, the logo becomes the app-icon
  mark (to 1000px, or 1100px with five nav items) and nav links tighten, so the bar fits with the Classes or Schools tab in every language. app.js adds its page-wide listeners once
  even when a page module imports it a second time (one click, one request).
- Left for later: school-level dashboards (per-teacher activity), SSO, and roll-over of classes between school years.

## Security review (pre-launch pen test)
A defensive security review (8 areas, each finding independently verified against a seeded two-school server) led to these fixes:
- **Credential brute-force.** `trust proxy` now defaults off, so a directly-exposed server can't be given a spoofed
  `X-Forwarded-For` to reset IP rate limits (set `TRUST_PROXY` when behind a real proxy). Login is additionally capped
  per account (10 / 15 min), independent of IP, and auto-generated school passwords went from ~29k to ~525k combinations.
  Later (rating review): per-address limits count only failures and are keyed on the address, never the session (fresh
  guest cookies no longer buy guesses), so a whole school behind one address can sign in at once; school passwords now
  use a 273-word list (~1.8 billion combinations); a teacher's reset clears the per-username lock; the login check
  always runs bcrypt so timing doesn't reveal which names exist; 3000 tries per address per 15 min caps bcrypt work.
  Known limit: bcrypt (bcryptjs, ~170 ms) runs on the main thread, so a big sign-in rush slows other pages for a few
  seconds (bcryptjs's async mode doesn't help under concurrency). Move it to a worker thread or native bcrypt later.
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
  (named for their job since the rebrand: `--accent`, `--link`, `--current`, `--spark`, `--danger`, `--on-accent`, …). The dark
  values live in exactly two blocks with the same body: `@media screen and (prefers-color-scheme:dark){:root:not([data-theme="light"]){…}}`
  and `@media screen{:root[data-theme="dark"]{…}}`. No other `prefers-color-scheme` or `[data-theme]` rules anywhere in
  `public/css`: a component that needs a different dark colour gets a token instead. `tests/unit/theme.test.js` checks
  this. The `screen` wrapper means printing (login cards) always uses the light palette.
- In dark mode, text on the filled colours is Ink: on Mint (primary buttons, the current nav tab, your own friends-chat
  bubble), Spark (badges, the "go" button) and the danger red (error toasts), because Cream on the lighter dark-mode fills
  was below 3:1. In light mode the current nav tab and error toasts keep Cream text on Ink and on the deeper red.
- The theme button is in the top bar at every width. On the narrowest phones (under 360px) the search field becomes a
  round 🔎 button to the search page (Search is in the tab bar too), so the logo mark, search, 🌐, the theme button and
  Me fit side by side without the search words being cut off. From 821 to 1180px the bar's gaps tighten and 🌐 drops its
  "EN" so the extra button fits in every language. Game frames and games keep their own colours.

## Renamed to Oomba Academy (new brand)
The site is now **Oomba Academy**, with the owner's logo board as the source of every value (name, artwork, palette, type).
The mascot is Oomba: the two o's of the wordmark are its eyes, looking up at a spark of an idea.
- **Name:** "Oomba Academy" everywhere the product is named (pages, titles, the 13 locale files, the manifest, login cards,
  Builder/review/lesson prompts, docs). It is a brand, so it stays in Latin letters and is never translated; grammar around
  it was fixed where a plain swap read wrong (German compounds `Oomba-Academy-Name`, feminine articles in Portuguese, and
  agreement in Italian and Russian). The PWA short name is "Oomba". Internal names stay: `brb_*` cookies, the `BRB` SDK
  global, file names, the Render service `magic-cup`, and the demo school's address `/school/magic-cups-demo-school`.
- **Official account:** `MagicCups` is renamed in place to `OombaAcademy` on boot (so the launch games keep their owner),
  shown as "Oomba Academy". `/u/MagicCups` (and the older `MagicCup`, `BRBGaming`) 301-redirect to `/u/OombaAcademy`, and
  sign-up refuses those old names so nobody can pose as the old official account. The demo school is found by its address
  and renamed in place to "Oomba Academy Demo School" (a fresh database creates it at the same address).
  The official account is told apart by owning the launch games: a player who signed up as `OombaAcademy` before the
  rename is moved to `OombaAcademy_1` (logged in the audit log) rather than being adopted, and a player who took a freed
  old name (`MagicCup`, `BRBGaming`) is never renamed. An archived demo school is left alone; a new one is made.
- **Logo:** the wordmark is inline SVG (`server/views/brand.js`): letters and pupils in `currentColor`, so it follows the
  theme, the spark in Spark yellow with an Ink outline in light and none in dark, ACADEMY under it (Leaf on light, Mint on
  dark). The link's accessible name is "Oomba Academy". On phones (600px and less) and beside the full nav on small
  laptops (821–1000px, and up to 1100px when there are five nav items, as for teachers) the top bar shows the mint
  app-icon mark instead, so the search box keeps its room. Login cards
  carry the small mark. The trophy that stood for the old logo is gone.
- **Icons:** `scripts/icons.js` draws them from the same artwork: `icon.svg` (the Spark favicon), 192/512 PNGs and a
  maskable 512 (Mint, art inside the safe circle) for the manifest, and a 180px apple-touch-icon. `theme-color` is the top
  bar's colour: Cream in light, Ink in dark (one meta per device scheme for "Same as my device", one value for a choice;
  app.js swaps them when the theme changes); the play page, whose bar is always Ink, is always Ink.
- **Type:** Bricolage Grotesque, self-hosted as two variable woff2 files (Latin, Latin Extended; weights 200–800 and optical
  sizes, `font-optical-sizing:auto`) with its OFL licence next to them; copied from `@fontsource-variable/bricolage-grotesque`
  5.3.0 (no runtime dependency). Headings 800 with slight negative tracking, body 450, buttons and labels 700. Other scripts
  (Cyrillic, Arabic, Hebrew, Japanese, Chinese) fall back to system fonts as before.
- **Palette:** tokens are named for their job (`--accent`, `--accent-press`, `--link`, `--current`, `--spark`, `--ok`,
  `--danger`, …) instead of a hue. Light: page `#F4F1E6`, Cream cards, Ink text; primary buttons are Mint with Ink text on a
  Leaf pressed edge; links are a deeper Leaf (`#14744A`) because Leaf itself is only 3.4:1 on Cream; the current nav item is
  an Ink pill; badges and stars are Spark; the focus ring is a 3px Ink outline (the old yellow ring failed contrast).
  Dark is the board's reversed look: Ink page, warm lifted cards, Cream text, Mint links and current item, a Spark focus
  ring. Field edges use `--edge` (3:1 against cards, so text boxes can be found); empty rating stars are outlines.
  `node scripts/contrast.js` prints every text/background pair in both palettes and `tests/unit/theme.test.js` fails if one
  drops below WCAG AA. Game covers, game frames and players' avatar colours are game content and keep their colours.
- **Shape:** big panels and heroes 32px corners, cards and tiles 20px, small controls 12px; calmer Ink-based shadows. The
  "go" button (publish, start building) is Spark (`.btn-hot`, was coral); deleting a game confirms with the danger button.


## Ready to leave Render (AWS / Azure)

- **Recommended host: one VM with a block disk** (EC2 + EBS, Azure VM + managed disk) running `deploy/docker-compose.yml`
  (the app, the screenshot worker and Caddy for HTTPS; see "Screenshot worker on by default" below). Managed containers (ECS Fargate + EFS,
  Container Apps / App Service + Azure Files) are documented as alternatives with their catches: a network share needs
  `BRB_JOURNAL_MODE=DELETE`, rules out Litestream and makes deploys stop-before-start. App Runner is closed to new AWS
  accounts (30 Apr 2026) and ECS Express Mode has no block disk. — SQLite and the in-memory state want one process on a
  local disk; a VM is also the cheapest and simplest to reason about.
- **One instance, no autoscaling**, written in README, the compose file and both guides. — Rate limits, presence and
  one-time login cards are in memory; SQLite has one writer. Redis/Postgres later, not now.
- **Container start** (`scripts/entrypoint.sh`): tini becomes PID 1 *after* the drop to the `node` user, so it runs as
  the same user as the app (Render's containers have no CAP_KILL, and a root tini there could not pass SIGTERM on:
  "Unexpected error when forwarding signal: 'Operation not permitted'", which killed the app without a drain); the data folder (and only the entries directly in it)
  gets `chown -h` to uid 1000 only when not already writable, symbolic links are skipped (a link planted by the app user
  must never make root hand it `/etc/passwd`), and a failed chown is a warning, not a crash (Azure Files); privileges
  drop with `setpriv --no-new-privs` via `exec`, so no parent shell lingers (the old `su` killed node ~2 s after SIGTERM
  on Render) and setuid programs can't give them back. With a command (`node server/shots-worker.js`, a script) it skips
  the data folder entirely. Render's disk works unchanged.
- **Graceful shutdown**: SIGTERM → `/health` 503 and `Connection: close`, stop accepting, wait up to
  `SHUTDOWN_GRACE_SECONDS` (25) for requests and Builder turns (also those whose phone disconnected), close the database.
  Keep-alive 65 s (above ALB's 60 s). The Builder stream already sent `X-Accel-Buffering: no` and 15 s heartbeats.
- **`/health`** answers 503 when the database doesn't answer a query that reads its file, when that file was deleted or
  replaced under the running app (inode changed), when the data disk has less than 100 MB free (2 % on disks under
  5 GB) or refuses a new, uniquely named test file (written, then deleted), and while draining. The file-system part
  runs one at a time, at most every 2 s, with a 2 s limit, so floods and hung network disks stay cheap; it is never in
  the request log.
- **`PUBLIC_URL`** is used for login cards and as an extra accepted origin in both same-origin checks (`csrfCheck`,
  `sameOrigin`); the Host comparison stays, so unset = today's behaviour. No other absolute site URLs are built on the
  server (share links use the browser's `location.origin`).
- **`SESSION_SECRET`**: production warns at every start while it comes from the database; `REQUIRE_SESSION_SECRET=1`
  refuses to start (not set on Render, so Render is unaffected). `scripts/export-session-secret.js` writes the current
  secret to a mode-600 file and never prints it. Note for the owner: carrying it over keeps people signed in only if the
  web address stays the same; a move to a new domain *on another server* (`MOVED_TO_URL`) signs everyone in once. A
  new domain on the same server keeps everyone signed in (see "Moving to oomba.ai").
- **Litestream 0.5.17** (binary copied from the official image, pinned by digest) runs only when `LITESTREAM_REPLICA_URL` is set.
  On an empty disk the container restores the latest backup first (`LITESTREAM_AUTO_RESTORE=1`), and refuses to start
  if that restore fails, so an empty database is never backed up over a good one. It covers the database only; disk
  snapshots cover pictures, photos and uploads. The storage keys are removed from the app's environment (`env -u`);
  since the app runs as the same user as Litestream that only stops careless leaks, so the guides make bucket
  versioning (AWS) and soft delete + versioning (Azure) required, and Azure uses the VM's managed identity scoped to the
  container instead of the account key.
- **Moving day**: `MAINTENANCE_MODE=1` (503 "moving" page, health still 200) and `MOVED_TO_URL` (302/307 every path to
  the new site; `MOVED_PERMANENTLY=1` for 301/308 once it works) so `magic-cup.onrender.com` keeps working as a redirect.
  A request arriving on the new site's own name gets the "moving" page instead (no loop while DNS spreads), and only
  a path is ever appended to the new address. `scripts/export-data.js` packs a consistent database
  copy plus the picture folders into one mode-600 archive, and `scripts/upload-file.js` sends it to a pre-signed S3 /
  SAS link, because Render's Docker shell has no scp.
- **Trust in the compose stack**: `TRUST_PROXY` is the `web` network's fixed subnet (`172.30.42.0/24`, only Caddy and
  the app on it), not a hop count, so the screenshot worker's network can't choose its own `X-Forwarded-For`.
- **On/off settings** (`REQUIRE_SESSION_SECRET`, `MAINTENANCE_MODE`, `MOVED_PERMANENTLY`) accept 1/true/yes/on and
  0/false/no/off; anything else stops the start. With `REQUIRE_SESSION_SECRET` on, a `SESSION_SECRET` under 32
  characters is refused; otherwise production only warns. Rejected values are never echoed with credentials.
- **Screenshot worker network**: in the compose file the worker is on an internal network with no internet, as asked.
  Since Three.js became self-hosted (answered from the image) the costs are small: covers of games that use Google
  Fonts show the fallback font, and a game that loads a cdnjs library (the scanner flags those for an admin, it doesn't
  fail them, and the allow-list is empty) is photographed without it, so an approved one's cover and review pictures
  are likely blank or broken. An internal network fails the lookup at once, so nothing waits. Kept that way; adding
  the `web` network to the worker would allow both.
- **Request bodies**: `inflate: false` on every body parser (browsers never compress uploads; a compressed body gets
  415), and `body-parser` 2.4.0 in the lockfile (GHSA-27r3-jxmh-p828).
- Caddy is pinned to the 2.11 line (`caddy:2.11-alpine`) so `docker compose pull` brings security fixes; it replaces any
  incoming `X-Forwarded-For`, never compresses the Builder's event stream and flushes it at once.

## Accounts: passwords, signing out, session lifetimes, honest privacy text
From a rating of the accounts side: nobody could change their own password, every sign-in lasted 60 days (children on
shared school Chromebooks, staff who can see children's work), the sign-in page said nothing about a forgotten password,
Sign out sat at the bottom of the Me page, and the grown-ups page promised "no real name" although school accounts
store one.
- **Change password** (Me page) for own accounts, school staff and the platform admin: current password, new password
  twice, the usual rules (`auth.checkPassword`) and at least 12 characters for staff and the platform admin. Rule
  mistakes are answered before the bcrypt check. Wrong current passwords count 5 per 15 minutes per account and also
  toward the account's sign-in lock (10 per 15 minutes), so someone at a device left signed in gets no more guesses
  than at the sign-in page; a flood guard caps every try (20). On success every session ends, this one too, and this
  device gets a fresh one: it stays signed in, and a copied cookie is useless. `user.password_change` is audited (never
  the password). School students see "Your teacher looks after your password — ask them if you forget it." (their
  teacher resets it from the class, which also clears a sign-in lock); guests see nothing.
- **Staff with short passwords:** the 12-character rule only applies when a password is chosen, so staff and the
  platform admin who sign in with a shorter one (the only moment the password itself is known) get
  `users.password_short` (migration `0016_password_short`) and a notice on every page linking to the Me page form, until
  they change it. Not enforced before /teach or /admin: a nudge, not a lock-out mid-term.
- **Sign out everywhere** ends every session, this one too. — One clear promise for a lost device or a password
  someone saw; "end the others and stay here" is what changing the password already does, so the two don't overlap.
- **Session lifetimes by account type**, checked on every request from the account as it is now (`SESSION_RULES` in
  `server/auth.js`): school students 1 hour idle and 10 hours at most; staff of any school and the platform admin 12
  hours idle and 7 days at most; own accounts and guests 60 days as before. The cookie lasts a day longer than its
  session, so a device that comes back to an ended sign-in (even the next morning) is told so. Activity is written to
  `sessions.last_active` (migration `0015_session_activity`) at most once a minute per session.
- **What counts as activity is decided on the server** (`auth.isActivity`), so it fails closed: opening a page (a GET
  with `Sec-Fetch-Dest: document`, or a non-API GET from a browser that doesn't send it) and requests that change
  something. Background reads (any fetch GET, live counts, chat and friends polling), anything sent with
  `X-Brb-Background: 1`, and the calls a game page makes on its own (play, heartbeat, leave, save, score, lesson play
  time) don't, so a page or a game left open on a classroom device still times out after an hour. — A game can save,
  score and keep its heartbeat going with nobody at the keyboard, so playing counts only when the play page marks a
  call `X-Brb-Active: 1`: the player pressed a key, clicked or tapped in the last 5 minutes. The page knows from
  `navigator.userActivation`, which the browser sets for a few seconds after real input, even input inside the
  sandboxed game frame, and which a game can't fake (presses on the play page itself count too). Browsers without it
  (Safari before 16.4) only see presses outside the frame, so a child there may be signed out after an hour of play
  with no saves or scores.
- **An ended session behaves like signed out:** pages go to `/login?next=…&signedout=1`, APIs answer 401 with
  `signedOut: true`, and the stale cookie is dropped. A calm "You were signed out" notice is shown once, on the sign-in
  page or on whatever page comes next (Home, a game), with a link to sign in again. In the browser, any 401 on a page
  that was opened signed in is shown with one client string (`js.app.signedOut`), because only the first request after
  the end hears it from the server. Forms keep what was typed on the page (text only, never passwords) for the same
  person after signing in again (`signedOut()` in `public/js/app.js`; drafts of anyone else are dropped on a shared
  device); the Studio puts an unsent Builder message back in the box with a "Sign in again" button, and its other
  actions (rename, settings, save, versions, publish, uploads, waiting for a build after a dropped connection) go to
  the sign-in page the same way.
- **The next child on a shared device isn't sent to the last child's page:** when a session ends on its own, a signed
  `brb_ended` cookie (1 day) remembers who was signed in. Signing in follows `?next=` only for that same person (or when
  no sign-in ended here); anyone else lands on their own home (`/classes` for school students). For this, sessions
  ended from another device (sign out everywhere, a new password, a teacher's reset) are marked ended rather than
  deleted, and ended or expired rows are kept a day (like their cookie) before the sweep; if a row is already gone,
  nobody knows whose it was and everyone lands on their own home.
- **Deploying `0015`:** sessions open at upgrade count as used now, and one the new caps would end at once (school
  students 10 hours, staff 7 days, counted from sign-in) gets one more hour, so the deploy itself signs nobody out
  mid-lesson. Still, deploy outside school hours: an hour later every school student signed in for more than 9 hours,
  and every staff member signed in for more than 7 days, is signed out together.
- **Sign-in help** under the form: school accounts ask their teacher for a new login card (staff: their school admin,
  the only one who can reset a staff password); own accounts are told the truth: we never ask for an email, so we
  can't send a new password; keep it somewhere safe; if it's lost, a grown-up can contact us.
- **"Not you? Sign out"** with the signed-in name on school students' My classes, class and lesson pages, and also for
  own accounts on the pages of a class they are a student in (they use the same shared Chromebooks), and on the Me
  page under the name for school students. Own accounts get a plain "Sign out" there instead (their own device). One
  tap signs out and opens the sign-in page. Own accounts in a class keep 60-day sessions: a product decision for later
  (for example shorter sessions for own accounts that sign in from a class page).
- **Privacy text:** the grown-ups page (`info.parents.stored/never/ai/keep`) and docs/safety.md §10 now say only what is
  true: what own and school accounts store (and what the school keeps when an own account joins a class with a code),
  what is never asked for, what goes to Anthropic's Claude (Builder messages, pictures and files, profile photos, games
  for the public review, with our team checking any it is unsure about) and what doesn't (friends' chats, lesson
  answers), how long data is kept and how to ask for deletion. The kid-facing /safety page no longer says "we never ask
  for your real name" without saying a school may add it. All 13 locales are translated.
- **Contact:** `CONTACT_EMAIL` shows a "Contact us" section on /parents and a footer link; production logs a warning
  without it.
- **Still missing — recommended before a wide launch:**
  - a **legal review** of the privacy text and of the school terms (children's privacy law such as COPPA and GDPR, and
    the agreements schools expect when they hand over a class list), including whether Anthropic keeps or trains on
    what the Builder sends: parents will ask, and the page should answer only once the API terms are confirmed;
  - an **account deletion and data export feature** (today data is kept while the account exists, deleted games are
    only hidden, and leavers are marked 'left'), for parents and for schools;
  - a **real contact address**: the site says "a grown-up can contact us" (paused accounts, building switched off, the
    sign-in help and the grown-ups page). Owner decision: set `CONTACT_EMAIL` (a monitored address) before launch;
  - an **admin "reset password" for own accounts**, with an ownership check (for example the account's games or friend
    code described by the grown-up), so the team can actually help when a grown-up writes about a lost password: today
    only school accounts can be reset (by their school), and the seed script only resets the platform admin.

## 3D games, step 1 (Star Island and a self-hosted Three.js)
Games can now be real 3D worlds. The sandbox does not change (opaque-origin iframe, the frame CSP, the SDK lockdown).
- **One pinned Three.js, self-hosted: r185.1** in `public/vendor/three/0.185.1/` (`three.module.min.js`, `three.core.min.js`
  and the MIT `LICENSE`, copied from the npm package `three@0.185.1`, tarball integrity
  `sha512-5aojFCXKwnjBRZvUnt3WFfEcvUJgkN5LlijRFN95hMy8WVkG4I0QNcJE+OuWvuJ0bOdStrbfXn0pkd6/QyiAlg==`). — No third-party request
  from a child's browser (like the self-hosted font), works offline and behind school filters that block CDNs, one version
  to review, and cdnjs has no Three.js add-ons anyway. Loading Three.js from cdnjs (the earlier plan, r186.1) now fails the
  scan; the cdnjs allow-list is empty, and any other cdnjs library is still flagged for a person.
- **Exactly one import map, with relative URLs and SRI** for both files (the text is `threeImportMap()` in
  `server/services/vendor.js`). — Relative URLs resolve against the frame's own address, so the same game works on any domain
  (Render, AWS, Azure, localhost); `integrity` pins the bytes in Chrome 127+, Safari 18+ and Firefox 138+ (older browsers
  ignore it). The scanner accepts that exact form (any whitespace or key order) and fails every other way of loading
  Three.js, with a message the Builder can act on.
- **Frame CSP: the site's origin plus `/vendor/three/`**: `PUBLIC_URL`'s origin and the origin the request came in on
  (`req.protocol` and `req.host`, both honour `TRUST_PROXY`); see "PUBLIC_URL" in the review fixes below. —
  `'self'` was tested in Chromium: it does match in a CSP-sandboxed opaque-origin frame, but it would also let every other
  script on the site run inside a game, and Safari and Firefox could not be checked here. The path covers every vendored
  version, so published games keep working after a bump. An odd `Host` header just leaves the vendor source out.
- `/vendor` is served with `Cache-Control: public, max-age=31536000, immutable`, `Access-Control-Allow-Origin: *` and
  `Cross-Origin-Resource-Policy: cross-origin`, and answers CORS preflights. — Module scripts from an opaque-origin frame are
  CORS requests; a versioned folder never changes. The screenshot service (local and worker) answers `/vendor/three/` from
  the code's own files, so covers and playtests of 3D games work with no network.
- **Device check.** The frame marks 3D games (`init.device`: WebGL 2 and import maps, with the message in the game's
  language); the SDK shows a kid-sized "This game needs a newer device or browser" card when `HTMLScriptElement.supports('importmap')`
  is false, no WebGL 2 context can be made, or a lost WebGL context is not asked back / not restored within 4 s (and hides it
  if it comes back). — A blank screen is the worst outcome for a child; games should not each write their own.
- **SDK.** `BRB.fx.fit()` never creates a 2D context any more: it scales a 2D context the game already has, or the one it
  makes later (the SDK notes which kind of context each canvas gets). It used to call `getContext('2d')`, which made the canvas
  useless for WebGL. New `BRB.fx.fit3d(renderer, camera, { maxDpr = 1.5, onResize })`: pixel ratio first, then size, then
  camera aspect, on every resize; `maxDpr(n)` for quality ladders. The touch joystick stays in the template (games want
  different controls), not in the SDK.
- **Star Island** (`server/builder/templates/island.html`, key `island`, the 8th "Start from" card): run and jump around an
  island, hop up floating rocks, find the stars before the timer ends. Field of view 60 (landscape) / 70 (portrait), pixel
  ratio capped at 1.5, a quality ladder (pixel ratio 1.5 → 1.25 → 1 → 0.75, shadows off, then decoration off when frames
  stay under 45 fps, ignoring pauses and shader warm-up), context loss handled, reduced motion respected (no orbit, bob or
  squash), no flashing, keyboard + floating joystick + jump button, BRB sound, score and save, and every word in the 13
  languages. Builder tunables are CONFIG lines: `hero` (one of ~30 emoji, each dressed as a 3D character; any other emoji gets a
  round friend), `heroName`, `heroColor`, `title`, `sky` (day/sunset/night), `colors`, `stars`, `platforms`, `roundSeconds`,
  `speed`, `jump`. It also reads the tune-up layer's `BRB_TUNE.hero`, so "change the hero to a dragon" works without an API key.
- **Builder.** The 3D rules are their own fixed system block (`THREE_D_RULES` in `server/builder/prompt.js`), sent only once
  the builder asks for 3D (the word "3D" or its translation in the site's languages; remembered for the chat) or when the game
  is already 3D; the main system prompt stays byte-identical, so 2D builds keep the same cached prefix. The rules: the pinned
  import map only, nothing loaded by URL, no add-ons (`GLTFLoader.parse` of inline data is the only way a model could ever be
  read, and it is not available), the fit order, comfort, the performance budget for school Chromebooks and iPads (≤ 100 draw
  calls, ≤ 150k triangles, one 1024 shadow map, InstancedMesh, no post-processing), and to start from Star Island. A new tool,
  `start_from_template("island")`, copies Star Island in as a new version on the server (no 70 KB of output tokens); the
  Builder then edits its CONFIG. The mock Builder picks Star Island for 3D requests (a new "🏝️ A 3D island adventure" chip
  replaces "🃏 A memory match", which is still there by asking), and in a 3D game changes the stars, floating rocks and sky
  (`stars`, `platforms`, `sky` lines); there "stars" are things to collect, not a new hero.
- **How to bump Three.js**
  1. `npm pack three@<version>` into a scratch folder and check the tarball against `npm view three@<version> dist.integrity`.
  2. Copy `build/three.module.min.js`, `build/three.core.min.js` and `LICENSE` into `public/vendor/three/<version>/`. Keep the
     old folder: published games keep loading it.
  3. Check the files: no dynamic `import(`, the module still imports `./three.core.min.js`, and the release notes for breaking
     changes (r163 dropped WebGL 1, for example).
  4. In `server/services/vendor.js` set `THREE_VERSION` and the two sha384 hashes
     (`openssl dgst -sha384 -binary <file> | openssl base64 -A`). Update the import map in
     `server/builder/templates/island.html` and `docs/sdk.md` (tests check the template carries `threeImportMap()`).
  5. `npm test` (`tests/unit/vendor.test.js` checks the hashes against the files and the scanner rules) and the e2e
     `three.spec.js`; play Star Island on a phone and a school laptop.
  6. New versions must use the new build; versions already scanned keep their result. Remove an old folder only when no
     version uses it (`SELECT count(*) FROM game_versions WHERE html LIKE '%/vendor/three/<old>/%'`).
- **Older iPads are not supported for 3D**: iPadOS 15 has WebGL 2 but no import maps, so those devices get the "newer
  device" card. Supporting them would need a non-module Three.js build, which stopped shipping after r160. **Please confirm.**

## 3D step 1 review fixes (sandbox, worker, template, i18n)
A review of the 3D batch led to these fixes (smallest correct change each):
- **Sandbox window-borrowing holes closed.** The SDK lockdown now rejects/scrubs two more DOM-insertion paths a frame
  could ride in on — `insertAdjacentElement` (and a plain wrapper that hides a frame among its descendants, which
  `isFrameish` now detects) and `Range.insertNode`/`surroundContents` — and a `MutationObserver` backstop removes any
  frame that still reaches the document. The scanner also *flags* `insertAdjacentElement`, `Range.insertNode`/
  `surroundContents` and `window[<number>]`, and runs the frame rules against the de-obfuscated copy too (so an
  assembled `createElement('i'+'frame')` is flagged). The real guarantee is still that no nested browsing context is
  ever created, so there is no second window with live WebRTC. `public/sdk/brb-sdk.js`, `server/services/scanner.js`.
- **A game navigating its own frame away** (phishing/exfiltration in the URL) is undone by the play page: it pins the
  frame back to the game on any unexpected `load`. `public/js/play.js`. (Corrected at the merge review: no off-site
  request leaves at all, because the page's own CSP, `frame-src 'self'`, refuses the navigation before any request;
  pinning only swaps the browser's error page back to the game. See `docs/safety.md` §9.)
- **Screenshot worker.** WebRTC is removed in the screenshot browser (local and worker), the one outbound path
  Playwright's route cannot abort. The worker must be deployed with no database and no secret env vars (it imports
  `config.js`, which reads all of `process.env`) — documented in the README env table. `server/services/snapshot.js`.
- **Quality ladder.** `watchFps()` now only ignores a window for a real stall (one frame over a second, or far longer
  than the window's typical frame), steps down whenever average fps is under ~20 even with a hitch, and reports fps for
  every window — so a 4–6 fps device actually drops quality and `state().fps` is never 0 while playing.
- **Lost-3D-picture card.** A lost WebGL context (which also happens on new phones/tablets) gets its own translated
  message and a big "Try again" button that reloads the game (through the page: see the merge review fixes); the
  "needs a newer device" wording is kept only for missing import maps / WebGL 2. Two new locale keys (`play.device.lostTitle`, `lostText`, `retry`) × 13 languages.
- **3D template:** stars capped at 20 (template clamp, mock and the 3D rules) and stars no longer cast shadows, to stay
  inside the ~100 draw-call budget; covers start play with the tip and touch hint hidden; the in-game title shows in the
  player's language when it is still the default, and the mock keeps `CONFIG.title` in step with a Studio rename.
- **Mock Builder:** "call it Moon Hop" no longer turns the sky to night (the name is dropped before matching sky words),
  and version notes keep their brackets and numbers (only trailing emoji are stripped now).
- **Build page:** the 3D "Start from" card is marked "Needs a newer device" when import maps or WebGL 2 are missing,
  before the child makes the game; a browser with no `HTMLScriptElement.supports()` is treated as unknown and left alone.
- **ja/ar wording:** the ja "newer device" title avoids the 機械化 misreading; the ar jump hint reads "زر المسافة".
- **PUBLIC_URL (for AWS/Azure).** `requestOrigin()` is `config.publicUrl` when it is set (a CDN/gateway that rewrites
  Host, like CloudFront or Front Door, leaves an internal name in `req.host`), else the request's origin. The frame CSP
  allows `/vendor/three/` from **both** (`frameOrigins()`): the import map is relative, so the browser loads Three.js
  from whatever name it used, and the guides have people test on a temporary name (`SITE_DOMAIN=new.example.com`)
  while `PUBLIC_URL` is already the final address; with `PUBLIC_URL` alone 3D games would not load there (nor on any
  other name that reaches the app directly). The request's origin was already what the CSP used without `PUBLIC_URL`,
  so this allows nothing new. On Render (no `PUBLIC_URL`) nothing changes. `tests/unit/vendor.test.js`.

## Screenshot worker on by default (compose stack)
The migration kit was written before the worker existed, so the compose file kept it behind a `worker` profile and gave
the app 2 GB for Chromium. Now that `server/shots-worker.js` is merged:
- **The compose stack always runs the worker** (`shots`, no profile) and the app always uses it (`SNAPSHOT_URL:
  http://shots:4900` in the compose file; `SHOTS_TOKEN` is required in `deploy/.env`, and compose refuses to start
  without it). — The security reviewers asked for Chromium to be kept away from the data: the browser that runs
  children's untrusted games then has no database, no data disk, no session secret or AI key, no internet, a read-only
  file system and uid 1000. Opting in would leave the safer setup to whoever reads the comments. The image declares
  `/data` a volume, so the worker gets a tiny read-only tmpfs there; otherwise Docker hands it an empty, writable
  volume of its own that survives restarts (found in the container test).
- **Memory: app 1 GB, worker 1 GB** (was app 2 GB with Chromium inside). — Node and SQLite stay well under 1 GB; Chromium
  runs one game at a time and closes when idle. A game that blows the worker's limit kills its browser, never the app, so
  a 2 GB server is now a safe minimum rather than a gamble (`BRB_SNAPSHOTS=0` remains the way to turn covers off).
- **Render stays on local mode** (`render.yaml` has no `SNAPSHOT_URL`; one container, Chromium launched from a scrubbed
  environment and an empty temp folder as before). App Service is documented the same way; ECS Fargate and Container
  Apps run the worker as a second container, where it shares the app's network (so it can reach the internet there) and
  must be non-essential so a crash restarts it instead of stopping the task.
- **A worker that is down, busy or refuses the token does not use up a cover's tries.** Before, every failure counted, so
  covers made during a worker outage of more than three sweeps (about 6 minutes) were never taken. Now such errors are
  marked `workerDown`: the app logs `cover picture waiting for the screenshot worker` with the reason
  (`unreachable (ECONNREFUSED)`, `refused SHOTS_TOKEN (401)`, `busy`, `timed out (busy)`) and the sweeper takes the
  cover when the worker is back; a game that fails inside the worker still counts. A job the app gives up on (after
  55 s) is marked busy too: the worker cuts every job off at 40 s, so running past that means it waited in the worker's
  queue (a classroom building at once), not that the game froze. The Builder's playtest then says playtesting is unavailable
  instead of blaming the game, and the public review goes ahead without pictures as before.
- **`BRB_SNAPSHOTS=0` now wins over `SNAPSHOT_URL`**, so the README's "0 off" is true with a worker too.
- **The worker logs** one JSON line per job (`job done` with time and size, `job failed`, `refused a job`), never the
  game, and at start says whether the pinned Three.js is in its own `public/vendor` (`"three":"0.185.1"`, or a
  warning that covers of 3D games will fail). The Dockerfile copies `public/` and `.dockerignore` does not drop it
  (checked by `tests/unit/deploy.test.js`).
- **Checked live (25 Oct):** a worker started from a scrubbed environment (only `SHOTS_TOKEN`, `SHOTS_PORT`, `PATH`,
  `HOME`) in an empty folder, and the app with its own data folder, `SNAPSHOT_URL` and no Chromium of its own. A player
  started Star Island and Catch in the Studio and published them: both covers came from the worker (`job done` lines;
  the app never started a child process) and the 3D cover shows the island (3,700 colours, nothing blank). A wrong,
  missing or partial token gets 401; the worker exits 1 without `SHOTS_TOKEN`; with the worker stopped, and then
  running with another token, the app kept serving and the version made meanwhile got its cover at the next sweep
  after the worker came back. Then the same with the real compose file (`docker compose config` passes, worker on
  without a profile) on a test copy of the image built from the real Dockerfile and `.dockerignore` (only the blocked
  downloads swapped, Chromium and its libraries mounted from the host into `shots`): the worker container, read-only,
  uid 1000, no internet and only the internal network, rendered Star Island's cover from the image's own Three.js.

## The home-page hero
The big hero on Home is the featured game marked `"hero": true` in its seed JSON (stored as `featured=2`), else the
most played featured game. Before, it was always the most played one, so a new official game could never take the spot.

## Share with my classes (visibility 'class')
Students (and teachers) in a class can share a game with just their class, or pick several of their classes, besides
Only me, Friends, My school and Everyone.
- **An explicit list, not "all my classes, always".** "All my classes" ticks every class the builder can pick now;
  classes joined later are not added by themselves (the dialog says so). An audience only grows when its builder
  chooses it: leaving a class stops sharing there at once, and joining it again shares nothing by itself.
- **Who sees it:** the builder, platform admins, live members (students and teachers) of a chosen class, and the admins
  of that class's school (safeguarding leads who already run every class). Teachers of other classes don't.
- **One rule for every path.** `CLASS_SQL` is used by `canView` and `visibleWhere`. It starts from the viewer's own
  classes (a non-correlated subquery SQLite builds once per query), so a listing's cost follows the viewer's classes,
  not the number of class games on the site.
- **Review like My school.** Clean or approved versions go live at once, flagged ones wait for a person. An approval
  covers only the audience it was given for (see docs/safety.md §6), and a new, wider class list waits in
  `games.pending_classes` until then.
- **School rules.** 'class' is narrower than both school settings ("inside the school" and "everyone"), so every school
  allows it; a future "private only" setting must turn it off too.
- **Teachers can take a game off their class** (audited). Its builder can't share it there again; "Allow again" lifts
  that block without re-sharing. A taken-off game the teacher can't open now shows as "A game you can't open right now".
- **Hand-in shares with the lesson's class** instead of the whole school, so it never widens a child's "My class" choice.
- **Migration 0018** fills `pending_visibility` for reviews already waiting with the narrowest audience they could have
  meant: 'school' for anyone in a school (the builder can ask for public again), 'public' only for people in no school.

## Merge review fixes (accounts + migration + 3D)
A review of the three batches together found these; each got the smallest correct change:
- **"Try again" on the lost-3D-picture card is done by the page.** The SDK used `location.reload()` inside the frame, but
  a navigation the opaque-origin frame starts itself carries no `SameSite=Lax` cookie, so the viewer-bound frame link
  was refused (403, shown as "refused to connect"). The button now posts `brb:retry`; the play page reloads itself
  (a fresh link, sent with the cookie), the Studio fetches a fresh preview link, the admin queue reloads that preview.
  Each only acts right after a real tap (`navigator.userActivation`, which a game can't fake; one a minute where a
  browser can't tell). `/frame`'s refusals (403/404, and the "moving" 503) are now sent so the site's own pages may
  frame them, so a player reads "This game link expired" instead of the browser's error.
- **Frame pinning is armed before the frame's first load.** The play page's module script often attached its `load`
  listener after the game had loaded, so the first unexpected navigation was taken for the game's own load. The frame
  now waits in a `<template>` and `play.js` adds it after the listener (a frame created without `src` would fire an
  `about:blank` load at a time that differs between browsers).
- **A game that keeps reloading itself is stopped, not looped.** Each refused reload was pinned back and reloaded again,
  forever (and each cycle cost the server a frame render). After two pins in 30 s without a tap from the player, the
  play page stops and shows "This game stopped working." with a Start again button. Pins right after a tap don't count,
  so a "Play again" button that calls `location.reload()` keeps working. The scanner does not flag `location.reload()`
  (too many honest games use it).
- **ADMIN_PASSWORD is applied when it changes, not on every start** (`applyAdminPassword` in `scripts/seed.js`, a bcrypt
  hash of the last applied value in `settings`). Before, an admin who followed the "choose a longer password" nudge, or
  rotated a leaked password on the Me page, was silently reverted at the next deploy. To reset a forgotten password,
  set a new `ADMIN_PASSWORD`.
- **Smaller ones:** a malformed `%` escape under `/vendor` gets express.static's 404 instead of a 500 with an error
  log; the "moving to a new home" page is in the visitor's language; the self-navigation docs now say what really
  stops it (the page's `frame-src 'self'`, asserted in `tests/e2e/play.spec.js`); the README env tables are one row per
  variable again; the compose and decisions notes say that an approved cdnjs game is photographed without its library.
- **Test helper:** `uniq()` in `tests/e2e/helpers.js` skips the ~1% of random consonant names that spell a refused
  abbreviation, which made sign-ups (and so random e2e tests) fail now and then.

## Live build steps ("Behind the scenes")
- **The Studio shows what the Builder is really doing, step by step, with a short learning line** (owner request:
  the three dots looked like nothing was happening, and kids should learn what an AI does behind the scenes). A calm
  card at the bottom of the chat lists each step as it happens and folds into "How the AI did this · N steps · time"
  at the end; "💡 Tips" hides the learning lines per viewer (default on, for lessons).
- **Steps come only from real server events** (`step`/`stepinfo` over SSE, `server/builder/steps.js`): screening, each
  model call ("Round N", with why it started: the first message, looking at playtest pictures, reading a failed safety
  report, a tool error, or deciding what's next), a thinking block that really streamed, writing or changing code, the
  safety program and the new version, a playtest that really ran, naming, the checklist, a question. Nothing is
  timer-driven. The practice builder is "the simple building blocks", never an AI, and never gets AI rows. A playtest
  the AI asks for always gets a row, but without screenshots that row says "Couldn't run the test this time" and never
  claims a test. "Working out what went wrong" only follows a failure the card shows (a write/edit or playtest row); a
  tool that failed without a row of its own leads to a plain "deciding what to do next". The safety program's row
  counts what it listed ("2 things to look at"), like the version card. — Honest is the point: a step that did not
  happen would teach the wrong thing.
- "Round N" instead of "AI step N", one row per model call, and the scan and the new version share one row. Thinking is
  a small "🤔 thinking" / "🤔 thought first" note on the round (it turns to "thought first" when the answer starts to
  stream), never its own row or label: the round keeps saying why it started, because that reason is the lesson (the
  models think before almost every reply, so a "thinking" label would hide it every round). A write or edit counts as a "fix" only after a failed scan or a playtest
  whose automatic checks found problems, and its done label says "made changes", not "fixed": only the next check can
  say whether it worked. — The summary counts steps; the Builder's models think before almost every reply, so separate
  rows would double the list.
- **The AI's own plan is shown, its raw thinking is not.** The `notes` of write_game/edit_game now come first in the
  tool schema (and the prompt says to write them first, as a short line naming what the version adds, e.g. "A dragon
  hero and a lava level", which reads right both as "Plan: …" while the code streams and in the version history), so
  they stream before the code and are shown as "Plan: …" while it is written (read from the streaming input by a one-pass scanner; replaced by the real notes once the tool
  runs; model text, cleaned like version notes, capped at 120 characters, rendered as text only). Raw thinking is not
  shown because: on the Builder's models thinking text is omitted by default (the blocks stream empty), so showing it
  would need a request change (`thinking.display`) that we chose not to make, and the request is unchanged by this
  feature; it would be unscreened model text shown to children and would need its own screening calls (cost); it is
  long and technical (code, not kid words) and is not written in the child's language; and the system prompt asks the
  model to decide the design privately. The plan is written for the child, in their language, as one sentence.
- **One 💡 line under the running step**, in this order: a "Just now" line for a step that was over in a flash (the
  safety program, a ready-made world, the checklist, naming the game, a question: one per step, each once a turn), the
  step's own line, once a turn what thinking is, then "Did you know?" facts. Each stays a while (6 s, 8 s, 8 s, 11 s)
  and the line only grows within a step. — Instant steps last milliseconds, so their lessons (like "a safety program,
  not an AI, checks every version") were never seen live; three stacked blocks made the card taller than a phone's chat.
- "Did you know?" facts appear only after the step's own line (8 s) on an AI step and only when true for every server (no playtest fact,
  because playtesting is off without screenshots; no "a small AI screens messages" fact, because it doesn't without a
  key). — Facts must stay accurate everywhere.
- A compact record (`['steps', …]`: step keys, start times, numbers and the short plan; no labels or learning text)
  is saved as the last event of the reply and sent with `done`, so the summary survives a reload and is drawn in the
  reader's language. `summariseEvents` ignores it, so it never reaches the model. Refusals, the turn limit and early
  errors have no record (no learning card under a refusal). The old `progress` SSE event is gone.
- **The card in the chat (client):** it sits where the reply is being written and stays last while the turn runs
  (replies, cards and chips build up above it), then folds in place into the reply's footer. It appears once a turn
  has lasted 0.7 s (a quick turn, like most practice-builder turns, goes straight to its summary) and, once shown,
  stays at least 1.2 s, so it never flashes. While live it shows the running step plus one finished step on a phone
  (two on wider screens), each finished step one line without seconds; older ones fold behind "N earlier steps", which
  takes the title's place on a phone, so the card stays shorter than the chat and the AI's reply stays in view. The
  running step's seconds appear after 3 s; the plan keeps to two lines while it runs. Rows are updated in place (the
  spinner keeps turning, a selection survives the counters). The chat only follows new steps when the reader is at the
  bottom, a focused step is never folded away, and focus moves to the summary when the card folds. A ✓, a spinner,
  ⚠️ or "…" sits at the line's end, always with a screen-reader word too. Tips off stops the automatic lines; a step
  someone taps open still shows its own. Screen readers hear step changes, the plan, problems and the summary through
  one polite region outside the chat log: changes within 0.4 s are read together (at most three, a problem is never
  dropped), never the ticking seconds. The preview pill mirrors the current step. An error leaves the step it stopped
  on in its present wording with "Stopped here". A dropped connection leaves the interrupted step in its present
  wording with "…" (nobody here knows how it ended) and shows "Connection lost. Checking if the Builder got your
  message…" until a step or a busy poll confirms the server has it, then "…The Builder keeps going on the server",
  until the saved reply (with its summary) is redrawn. The opened summary can be folded again from its bottom too. —
  Calm and honest beats busy: one card, one current step, no fake progress bar.

## Moving to oomba.ai (one server, two names)
- **`PUBLIC_URL` is the switch.** Unset, nothing changes. Set, old names redirect only after a self-check: the server
  fetches `PUBLIC_URL/.well-known/oomba-host-check/<boot id>` and must get its own 204 back (retried with backoff
  until it does). — A typo, DNS that hasn't spread, a missing certificate or an edge redirect would otherwise send
  everyone to a dead address or round a loop.
- **Only listed names redirect:** `RENDER_EXTERNAL_HOSTNAME`, the `www.` twin of `PUBLIC_URL` and `REDIRECT_HOSTS`;
  never "any other host". — The AWS/Azure guides use `PUBLIC_URL` behind gateways that rewrite the Host header, and a
  rehearsal on a temporary name; redirecting every other host would loop there.
- **Only page loads redirect** (Fetch Metadata `Sec-Fetch-Dest: document`, or page-looking paths without it). API
  calls, the Builder stream, game frames and files are answered on the old name. Non-GET is never redirected. — A
  redirected POST loses its cookies and fails the same-origin check; open tabs must keep saving. Same server, same
  database, so serving both names is safe.
- **How each case is answered:** no cookies → 301 (`max-age=86400`, `Vary: Cookie`, so a rollback heals in a day);
  a sign-in, language or theme cookie → 302 into the hand-off; a page load from inside an old tab
  (`Sec-Fetch-Site: same-origin`) → a 200 "we moved" page that refreshes to the new address. — The old pages' own CSP
  `form-action 'self'` blocks a 30x after a form (search, language and theme pickers).
- **Hand-off keeps the same session:** the new name sets a 2-minute `__Host-` nonce cookie and sends the browser to
  the old name, which makes a 60-second single-use token (in memory, tied to the nonce) and sends it back; the new
  name checks token + nonce and gives a cookie for **the same session row**. — Same idle/maximum limits, sign out
  everywhere and bans keep working; only random values ever appear in a URL; the nonce stops login CSRF. Language
  and theme are carried when the new name doesn't have them yet.
- **HSTS is not sent when `PUBLIC_URL` is http.** Cookies stay host-only. Tests: `tests/unit/domain.test.js`,
  `tests/e2e/domain-move.spec.js` (127.0.0.1 plays the old name, localhost the new one).

## Sign in with Google (school Google accounts, Chromebooks)
- **Off until `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are set** (and `PUBLIC_URL` in production). While off,
  every new route answers like an unknown page and no panel, privacy text or header changes; migration 0020 only adds
  empty tables and a column.
- **OpenID Connect code flow, server side**: PKCE (S256), `state`, `nonce`, `prompt=select_account` (shared
  Chromebooks always show the chooser), scopes `openid email profile` only (no Google app verification needed). The ID
  token's RS256 signature is checked against Google's keys with Node's crypto (no dependency), plus issuer, audience,
  times, nonce and `email_verified`. The access token is thrown away. A signed, HttpOnly, 10-minute cookie scoped to
  `/auth/google` holds the flow; a used `state` is refused. The same per-address sign-in limits as passwords apply.
- **Matching is by Google's account id (`sub`) only; an email never links an account.** A new Google account gets an
  Oomba account only through its school: a teacher's invite (bound to a school email, no link or token, 30 days), or
  the class code when the teacher turned on "join with Google". Both need the school's Google Workspace domains, and
  the token's `hd` and email domain must both be in them, so a personal Gmail with the same address never claims an
  invite. Anyone else is turned away kindly; no own account is made from Google (keeps the "no email" promise).
- **A Google domain belongs to one school.** Saving a domain another live school lists is refused ("contact us").
  Otherwise another school could invite, and so claim, this school's students first. If two schools somehow share a
  domain (set before this rule), the oldest invite's school decides a first sign-in and only its invites apply; a
  later "connect this account" invite from another school can't jump ahead. A re-pasted list only renews an invite:
  a waiting "connect this account" invite stays one. The class-code Google join is instant only for the school's own
  people; anyone else follows the usual class-code rules (own accounts wait, or are refused when the school says so).
- **School accounts made through Google have no password**; removing Google from one prints a login card at once.
  Clearing the school's domains turns Google off for its own accounts. Staff and own-account students in a school with
  domains can connect Google on the Me page after re-entering their password; school-account students can't (their
  teacher connects it).
- **The Google name is never public**: it is only the staff-only class-list name when the teacher typed none; the
  username is generated. The photo is never stored.
- **The class-code option** is off per class by default, limited to 100 new accounts a class a day and 300 an hour
  from one address, and says the same thing for a wrong code and for the option being off.
- Tests: `tests/unit/google-signin.test.js` (protocol, tampered tokens, key cache), `google-invites.test.js`
  (domains, invites, attach, staff, class code, Me page, clean-up, off), `tests/e2e/google.spec.js` against the fake
  Google in `tests/support/fake-google.js`.

## Builds run apart from the page (runner, live stream)
- **A build is a server job, not a request.** `server/builder/runner.js` runs each build; `builder_turns` (migration
  0019) records it. Closing the tab, reloading, signing out or a second tab never stops it. A deploy hands running
  builds off and the next process carries them on (`recover()` before `listen`); a build interrupted twice stops, gives
  the turn back and offers "Carry on building". Single app instance only, like the rest of the in-memory state.
- **The Studio follows a build over `GET /api/studio/:id/live`** (server-sent events): `hello` with the running
  turn (the user's message, the steps so far, the text so far), then live events, so a reload or another tab shows the
  chat, the message being worked on and the steps card at once and keeps updating. Sending a message answers 202 and
  the result arrives on the same stream. — Before this, a reload showed only the saved chat, and the message being
  built wasn't saved until the build ended, so it looked lost.
- **Round 1 says "planning how to build it" once the AI starts answering** (the first stream event, fact `a`), not
  "reading your message"; after 45 s a line says big ideas can take a minute or two to plan. — A new game can spend
  most of its first minute or two planning before any code streams, and "reading" for two minutes looked stuck.
- **When the site's AI budget is spent, the Builder rests instead of falling back.** No build starts (nothing stored or
  charged); the Studio says when the AI is back (the next UTC midnight, or the 1st for the monthly limit), shown in the
  reader's own time zone, and the message stays in the box. — The simple building blocks used to take over and ask
  questions they couldn't follow up on, which was misleading. A build already running stops at its next round and
  says so (`builder.budgetStop`).

## Paid plans (billing decisions D0-D16)
The owner approved every recommendation of the billing design (October 2026). The full design (allowance sources,
Stripe integration, data model, tests and the owner's setup steps) is built in chunks: 0 settings and docs, 1 cost per
message, 2 Stripe plumbing, 3 grown-up accounts and family links, 4 family checkout, 5 school plans, 6 admin billing,
7 copy and policy, 8 going live. Billing stays off until the Stripe keys are set; without them the site works as before.
All numbers below are settings, tuned once the real cost per message is measured (owner Step 0: set the AI key, build
about 20 games, read the cost per message on /admin/stats).

- **What is for sale:** more Builder messages, never a feature. Playing stays free, the free daily allowance stays.
- **D0. Free AI budget:** $150 a month (`AI_MONTHLY_BUDGET_USD=150`), $5 a day (`AI_DAILY_BUDGET_USD=5`, about
  monthly ÷ 30) so it lasts the month. No higher daily override on the dashboard. `render.yaml` holds the same values
  (a blueprint sync resets the dashboard to the file). /admin/stats shows the expected free messages per month.
- **D1. Who pays:** a separate grown-up account (name and a 12+ character password) that links to a child with a short
  code the child confirms on their own page (Yes / No / Report).
- **D2. Children per family plan:** up to 4.
- **D3. Free daily allowance:** stays 60 for now. Any change is decided from the cost data (with D0) and ships on its
  own, weeks before paid plans, never in the same release.
- **D4. Family allowance:** the free daily messages plus a shared pool of extra messages each month (start: 40, about
  half the net price ÷ cost per message). Only messages beyond the free daily ones use extras; when the free Builder is
  resting, family children build from the extras. A hidden $4/month AI-cost backstop. Never advertised as "per day".
- **D5. Pro quality:** 2 messages per Pro message for everyone (`PRO_TURN_WEIGHT`); still open to free users. Chunk 1
  ships the weight at 1 (no change) and the switch to 2 ships with paid plans.
- **D6. School price:** $20 per student per year, minimum 25 students ($500/year), 100 messages per paid student per
  year shared by the school (about 10 Builder lessons a student; the Billing tab says it in lessons). Students get at
  least the free daily amount (school setting, default 30/day). Teachers use the same pool.
- **D7. Invoice / PO schools:** yes, through Stripe Invoicing (net 30). The school admin asks on the Billing tab; the
  owner creates the invoice subscription on /admin/billing. Card checkout for small schools.
- **D8. Free trial:** none at launch. The free allowance is the trial.
- **D9. Countries and tax:** family plans for US families only at launch (billing address, a Radar rule blocks non-US
  cards, Stripe Tax for US sales tax). Worldwide later through a merchant of record. Invoice schools are handled deal
  by deal.
- **D10. Refunds:** cancel anytime from "Manage billing" (the Stripe Customer Portal) (the plan runs to the end of the paid period); a full refund on
  request within 14 days of a first payment or yearly renewal. Always cancel first, then refund.
- **D11. Late payment:** cards get 7 days of grace while Stripe retries; invoice schools 30 days after the due date.
  Then back to free. Nothing is deleted or locked.
- **D12. A school stops paying:** students go back to the free allowance. Never banned or removed; classes keep working.
- **D13. Coupons:** yes, Stripe promotion codes for schools (pilots) and testers; the owner can also grant a free plan
  from /admin.
- **D14. Testing on the real site in test mode:** only the owner and accounts marked "billing tester" on /admin see
  billing.
- **D15. Legal before going live:** Terms of Service, a refund and cancellation policy, privacy text for grown-ups and
  payments, and the COPPA/GDPR review. Paying is never "parental consent"; the legal review decides the consent model
  for every child account.
- **D16. Site wording:** the footer and kid pages keep "Free to play, free to build". The plans sentence goes only on
  /parents and /grown-ups. Kid pages never show prices, plans or a nudge to ask a grown-up; at the limit the Builder
  says "More tomorrow!".
- **Support email:** `CONTACT_EMAIL=greg@oomba.ai` (in `render.yaml`), also the support email in Stripe.

**Chunk 1: cost per message.** Each Builder build records what its own model calls cost (`builder_turns.usd`, from
the same prices as the AI cap, written as each call is paid, so a crash or a stop keeps it; a round cut off mid-stream
counts its input tokens and an estimate of what it streamed), who paid (`charged_to`, today always `free`) and its weight (`weight`). One function,
`usage.allowanceFor(user)` (`server/builder/usage.js`), says how many messages a user gets today and from which source;
every limit check and every "{count} messages" reads it, so family and school sources plug in there later. Spend is
also kept per money pool (`ai_spend_pool`, today only `free`; earlier days were copied in as `free`). /admin/stats
shows the average, median and 90th-percentile cost per message (normal and Pro), messages per day, and the free
messages per month the budget pays for. Builds from before this update have no stored cost: their cost is estimated
from their stored token counts, with the input price blended from that model's real calls in `ai_usage` (cached
prompt tokens are cheaper), and the page says how many were estimated. Builder rows are kept 35 days, so the numbers
cover at most the last 30 days. Screening, picture checks and reviews are not part of a message's cost; the expected
free messages per month subtract what they cost, paced over the days since the first free spend or the first
message, whichever came first. Messages per day counts charged builds not given back (a Pro message is one message,
whatever turns it used).

**Chunk 2: Stripe plumbing (nothing visible).** The official `stripe` Node SDK, pinned to an exact version
(`23.0.0`), is the one new dependency: unlike Google sign-in (no dependency), it gives Stripe's own webhook signature
check (`constructEvent`), retries with idempotency keys and request shapes that match the API version. Only
`server/services/stripe.js` imports it, makes one client (never a global key) and loads it only when billing is on.
`STRIPE_API_VERSION` defaults to `2026-09-30.endive` (the SDK's own default, passed explicitly). Keys: a restricted
key is expected, `sk_live_` stops the start, a live key needs `STRIPE_LIVE_OK=1`, `sk_test_` warns; keys and secrets
are never logged (Stripe errors are logged as type, code, status and request id only), and `npm run check-keys` plus a
pre-commit hook refuse real-looking keys in the repository. The webhook `POST /api/billing/webhook` sits before the
request log, maintenance and the JSON parser (raw body), checks the signature first (current or previous secret),
drops events of the other mode, and is idempotent on the event id. One shared sync path (webhooks, the 6-hourly
`billing-reconcile` job, later the Checkout return page) reads Stripe first, outside any transaction (a failed read
answers 500 so Stripe retries), then writes in one transaction; syncs of one subscription run one after another, and
there is no ordering by event time (the re-fetch is the current state). Owners come from the Stripe Customer id,
metadata only as a checked fallback; an unknown customer is stored as an `unlinked` event and answered 200. Refunds,
disputes and early fraud warnings find their subscription through invoice payments (a Charge no longer names its
invoice). Grace: cards get `BILLING_GRACE_DAYS` once past_due; invoice schools get `SCHOOL_INVOICE_GRACE_DAYS` after
the earliest open invoice's due date, whatever the status. A Checkout paid by a delayed method grants nothing until the
money arrives. Every entitlement query filters on the key's mode. Prices are found by lookup key. The jobs runner now
awaits async jobs, logs a rejection instead of crashing, and never overlaps two runs of one job. Cancelling on a
dispute or fraud warning, refunding duplicates and the school seat pool come with checkout (chunks 4 and 5).

**Chunk 3: grown-up accounts and family links (no payments).** On only while billing is on; grown-up accounts stay
fenced in either way. `users.account_type` is `kid` or `grownup`. Grown-ups sign up at `/grown-ups/signup` (the kids'
sign-up limits and buckets, a password of at least 12 characters, a "parent or guardian, 18 or older" box that is a
statement, never a check, audit `user.signup {grownup:true}`), never from a guest or a kid account, get no friend
code, use the staff session rules (12 hours idle, 7 days at most) and land on `/family`. A fence before every route
(`routes/family.js` `grownupGuard`) lists what a grown-up may open (game pages and play, search, info pages, signing in
and out, their password and theme, the family pages); everything else, the Builder, Studio, friends, chat, profiles,
classes, schools and admin included, is a 404, and `requireAccount` itself refuses them too. They are on no
leaderboard (their scores aren't stored), in no builder search, have no profile and can't join a school. Linking: the
child (an own kid account; never a guest, a school account or staff, whose code endpoints 404) gets a code like
`K7Q-4MZ9` on /me (only an HMAC is stored; 24 hours, single use, one open per child, rate-limited; it was 1 hour, but a child who hits the
Builder's daily limit at school shows it to a grown-up that evening), the grown-up types
it on `/family/link` (10 wrong codes per 15 minutes), and the child answers Yes / No / Report on /me (a badge on Me
while a request waits; it ends after 24 hours). The child only ever sees "your grown-up". One live row per child
(pending or linked) and up to `FAMILY_MAX_CHILDREN`. A Report (on a request or a link) leaves no link and goes to the
admin's Link reports tab (done, ban the grown-up); the admin's user lookup shows links with Break link. /family shows
each child's family-charged extra messages for yesterday and this month up to yesterday, never today, school-charged
messages or anything about school. Chat refuses messages shaped like a code. A ban ends the account's links in the
same transaction. A daily job deletes codes 30 days after use or expiry, unanswered requests after 24 hours, unlinked
rows 90 days after unlinking and resolved reports after a year. Families are registered as billing owners (a family
whose grown-up isn't banned). Linking and plans are never consent (/grown-ups says so).

**Chunk 4: family checkout.** Everything behind the families gate (`familiesOn(req)`: BILLING_PUBLIC or the preview
cookie). A grown-up with at least one confirmed child subscribes on /family (two buttons, monthly and yearly, prices read
by lookup key); before paying the page lists renewal, cancelling, the refund rule (first payment and yearly renewals,
14 days), the limits (`FAMILY_CHILD_DAILY_MAX` a day per child, and a monthly cap on unusually expensive use, as the
legal draft asks), tax and US-only. Checkout and Manage billing (the Customer Portal, its default configuration) need
the password typed again within 10 minutes on that sign-in (`sessions.reauth_at`; 5 wrong tries per 15 minutes); with a
test key only grown-ups marked billing tester on /admin may use them (`users.billing_tester`, audit
`admin.billing.tester`). Checkout is Stripe-hosted (a top-level redirect: no Stripe.js, no CSP change), `mode=subscription`,
the Customer made first (metadata only) and reused, `client_reference_id` and metadata the family id,
`subscription_data.billing_mode=flexible`, `integration_identifier` `oomba_family_<8 letters>`, address required with
`customer_update[address]=auto`, promotion codes, `automatic_tax` only with `STRIPE_TAX=1`,
`payment_method_configuration` = `STRIPE_PMC_FAMILY` (never `payment_method_types`; unset, family plans are not on sale at
all, a start-up warning and an /admin/billing banner say so: no fallback to the account's default configuration, which
may have Link on), and Terms consent
only once `/terms` is published (`TERMS_PUBLISHED=1`). One open session per family (an earlier one is expired; one paid
meanwhile stops a new one). The return page waits for the webhook and asks the shared sync's fallback, which takes the
owner only from the session; until the plan is on it shows only the wait (no Subscribe). A new Checkout is refused
('fixPayment', Manage billing instead) while the family has a plan that isn't entitled but Stripe may still charge
(past_due after grace, unpaid, incomplete, paused, or a delayed payment). A subscription that starts to entitle its owner
(a second Checkout, or an old plan's card retry succeeding late) while another plan of the same owner is entitled is
cancelled and its latest payment refunded at once (flag `duplicate`, audit `billing.duplicate`); those syncs run one at
a time. The step-up's wrong passwords also count toward the account's sign-in lock, and a locked account can't step up. A full refund of the latest payment ends a live
plan; another refund flags `refunded_active`; a dispute or an early fraud warning ends the plan (flags `dispute`/`efw`,
refunding stays the owner's choice). Family extra messages (`usage.allowanceFor`): the free daily ones first, then
`FAMILY_EXTRA_MESSAGES` a UTC month shared by the family's confirmed children (Pro weight counted, refunds given back),
or the extras right away while the free AI pool rests; they stop at `FAMILY_CHILD_DAILY_MAX` for a child's day, at
`FAMILY_MONTHLY_AI_USD` of AI cost for the family's month, or when the paid pool is spent. The paid pool's ceiling is
families with a plan, or whose extras were used this UTC month (a family that stops paying keeps its share until the
month ends, as its spend stays in the pool), × `FAMILY_MONTHLY_AI_USD` (capped by `AI_PAID_MONTHLY_BUDGET_USD`); `AI_HARD_MONTHLY_USD` stops
both pools. A child in any active school gets no family extras (and no "+N" counter) until
builds know whether they come from class (chunk 5): family money is never used in class. The child's Studio shows "+N
extra this month" (numbers only) and the limit says "More tomorrow!" with no
number; /family shows extras left counted up to yesterday (never today). /admin/billing (read-only) lists subscriptions
(filters by status and flag), refund windows, webhook problems and recent events, and the Stripe Tax banner.

**Chunk 5: school plans.** A Billing tab on the school page, for school admins and the platform admin only and only
behind the families gate (`familiesOn(req)`); teachers and students never see billing, and every
`/api/billing/school/:id/*` route is a 404 for anyone else. With a test key only billing testers (grown-ups or school
staff, set on /admin) and the platform admin may pay. Pay by card: Stripe-hosted Checkout, `quantity` = students (at
least `SCHOOL_MIN_SEATS`), the price by lookup key `oomba_school_seat_yearly`, `payment_method_configuration` only when
`STRIPE_PMC_SCHOOL` is set (else the account default; never `payment_method_types`), flexible billing, `integration_identifier`
`oomba_school_<8 letters>`, the same one-open-session, return-page and duplicate rules as families. Delayed (ACH) payments
grant nothing until they arrive. More students: `proration_behavior=always_invoice` (card schools with
`payment_behavior=pending_if_incomplete`, so the quantity changes only once paid); fewer students are next year's seats
(`next_quantity`), set at Stripe with no proration by a 6-hourly job in the two days before the renewal; the tab shows a
renewal reminder 30 days ahead with today's student count proposed. The pool (`pool_quantity`) is the highest quantity
paid (card) or invoiced (send_invoice) in the period and never shrinks within it; a grant's pool runs a year from its
date and each anniversary. Messages charged to a school are counted from `builder_turns` (`charged_to='school:<id>'`,
refunds given back) rather than a separate `school_builder_usage` table, the same way as family extras. Invoices (D7):
the school admin's request (seats, PO, billing contact, billing address, a tax-exempt claim; one open per school; audited
with ids only; contact details deleted 2 years after it closes) shows on /admin/billing, where the owner clicks
**Create invoice subscription**: the school's Customer gets its name, the contact's email, the address and the PO as an
invoice field (`tax_exempt=exempt` only when the owner ticks that the certificate arrived), then a `send_invoice`
subscription, `days_until_due=30`, metadata with the school id and PO, flexible billing, `automatic_tax` only with
`STRIPE_TAX=1`, no payment method list. **Mark paid by check** pays an open invoice out of band. An overdue invoice
keeps the plan until `SCHOOL_INVOICE_GRACE_DAYS` after its due date (flag `overdue`). The school source in
`usage.allowanceFor`: an active student or staff member of a school with a plan and messages left builds from its pool
(paid AI pool, so never resting with free users), up to the school's daily cap (`builderDailyCap`, default
`SCHOOL_DAILY_CAP_DEFAULT`, never below the free messages); with the pool empty, the free messages and never a family's
extras. Class contexts (a student of any school, or anyone paid by a school) see only "{left} left today" and a limit
message that names the class; a family child in a school without a plan keeps the family's extras but sees no "+N"
counter. The paid AI pool adds paid students × `SCHOOL_SEAT_AI_USD` ÷ 12 a month. When a plan ends everyone is back on
the free allowance; nothing is removed or archived.

**Chunk 5 review fixes.** The pool grows only on the invoice that covers the new seats: the quantity on its lines, or
else the quantity at the sync where the latest invoice is new or has just become paid (card) / finalized
(send_invoice). Next year's seats applied before the renewal with no proration, or a Dashboard change whose proration
waits for the next invoice, grow nothing until that invoice. A new period keeps last year's pool *and its start date*
until its invoice is paid (card) or finalized (send_invoice), so a past-due card school keeps only what was left of
last year's messages during its grace days, never a fresh year's. Billing off (no Stripe keys) means no school side at
all: school students keep today's counter and limit message. The daily cap box shows the cap in force and refuses
anything below `BUILDER_DAILY_TURNS`; it and the "up to N a day" line show only while the school has a plan.
`SCHOOL_DAILY_CAP_DEFAULT` stays 30 (spec §8), so with the default 60 free messages the cap in force is 60 until a
school sets more. Invoice requests are per Stripe mode (`livemode`) like every other billing row, so a test-mode
leftover never blocks a live request. Create invoice subscription's idempotency keys carry what the owner may change
between attempts (the students, the exemption box; separate create and update keys for the Customer). The 2-year purge
of closed invoice requests also clears the note and the PO number.

**Chunk 7: legal pages.** /terms, /refunds and /privacy are always public (also before `BILLING_PUBLIC`, with a "not
on sale yet" notice), with no prices: anyone can type the address. The footer departs from spec §9 ("/parents only")
in one way: it links **Privacy** on every page (COPPA wants a prominent link to the privacy notice), and **Terms** only
for grown-up accounts, school staff and the platform admin (`legalReader`). For kids, students, guests and the
signed-out, /privacy leaves out the sections that name plans (grown-up accounts, linking, payments, school billing,
billing retention, where plans are sold); the signed-out also get a "For grown-ups and schools" link to the full text
(`/privacy?for=grownups`), which grown-ups and staff see by default. /parents gets the D16 plans sentence and links to
/terms, /refunds and the full /privacy once paid plans are public; /grown-ups, /family's Subscribe box and the school
Billing tab's Pay by card and invoice panels link /terms and /refunds. Legal text is not counted in the 90% share that
puts a language in the picker (`UNCOUNTED_PREFIXES`: `info.terms.`, `info.refunds.`, `info.privacy.`), so adding it
takes no language away; it shows in English, marked `lang="en" dir="ltr"`, until translated. The paid-plan wording on
/parents and /safety is `paidN` items that replace `pN` once paid plans are public (`familiesOn`). Untranslated
footer, Studio class counter and Billing tab words get the same `lang="en" dir="ltr"` marking until their translations
land; the new keys still have to be translated in all 12 locales before `BILLING_PUBLIC` (§9).

**Plans page and the Basic plan (owner decisions of 2026-10-27, spec §17; they replace D16 and the "no plan words on
kid pages" rule where they conflict).** A **Plans** link is in everyone's top menu (and phone tab bar) while paid-plan
pages are on (`familiesOn(req)`: billing on, and `BILLING_PUBLIC` or the preview cookie). `/plans` shows four cards like
any pricing page: **Free**, **Basic** (one young builder; never "child plan" or "Plus"), **Family** (up to
`FAMILY_MAX_CHILDREN`, the Recommended one) and **School**, with a monthly / yearly switch (plain links, no script). Its
prices are read from Stripe's Price objects by lookup key (`oomba_basic_monthly`, `oomba_basic_yearly`,
`oomba_family_*`, `oomba_school_seat_yearly`; cached, refreshed by the reconcile job), so the page always says what
Checkout charges; a price Stripe doesn't return shows "Price coming soon". Prices may appear on `/plans` (and the grown-up
pages) only: the Studio, Me, games and limit messages stay free of them (tests: `tests/unit/plans.test.js`, the kid
crawl in `tests/e2e/billing.spec.js`). Everyone may look; only a grown-up account (Basic, Family) or a school admin
(School) can buy. A kid who taps a paid plan gets a calm panel ("A grown-up buys plans. They can sign up at
oomba.ai/plans", text, not a link; no countdown or pressure); school staff are told Basic and Family are for families
and pointed at the School card; School goes to a school admin's own Billing tab, else to `/plans/schools` (price, what a
school gets, how a school is set up, the contact email). Untranslated words on `/plans` are marked `lang="en" dir="ltr"`
because children read it too.
**Pay first, link children after.** Signed out, a paid plan leads to the grown-up sign-up (or sign-in) with the plan
kept (`?plan=basic|family&interval=month|year`), then `/family?plan=…` offers that plan (password again, then Stripe's
Checkout; the Checkout's cancel link comes back to it), and Checkout's return shows "Now add your child" with the steps.
No child has to be linked before paying. `/family` shows the plan card (Free, Basic or Family), its state, the extras
left, Manage billing and Change plan (`/plans`); `/parents` and `/grown-ups` link to `/plans`.
**The Basic plan** is a family-type plan (owner kind `family`, `billing_subscriptions.plan='basic'`, Product metadata
`oomba_plan=basic`): `BASIC_EXTRA_MESSAGES` (25) extra messages a UTC month for **one** linked child, its own AI
backstop `BASIC_MONTHLY_AI_USD` (2.5; also its share of the paid AI pool), the same `FAMILY_CHILD_DAILY_MAX`. A family
holds one plan at a time: `ownerPlan('family', …)` reads Basic and Family rows, and the duplicate guard treats a Basic
and a Family plan of one family as two plans. Switching between them happens in the Customer Portal (both Portal
configurations allow it, prorated): the same subscription gets the other price, and the shared sync picks up the new
plan from the price (audit `billing.plan.change`). With Basic, linking a second child is refused; a Family plan
switched to Basic keeps every link, but only the **first linked** child gets the extras (`coveredChildren`), and
/family names that child and says the others build with the free messages.

## Search engines (SEO)
- **Default noindex.** A page is indexed only when its route passes `seo: { index: true, … }` to `layout()` (home,
  /teachers, /learn/*, official launch games, /safety, /parents, legal pages, /sdk/, /plans once `BILLING_PUBLIC`).
  Private areas also get `X-Robots-Tag: noindex, nofollow` (server/seo.js `PRIVATE_RE`): profiles, Studio, classes,
  schools, families, sign-in, search, play, frames, APIs, player and game pictures. Child-made games are never indexed,
  even when published and reviewed.
- **Children's names never reach a signed-out page:** game cards credit only the official account, the leaderboard shows
  scores without names (the page and `/api/games/:id/leaderboard`), and search shows no builders except the official
  account (tests/unit/seo.test.js).
- **Children's game titles on indexed pages:** an official game's "More like this", signed out, lists launch games
  only (a title is free text and could hold a first name). The home page rails still show reviewed public games made
  by children, title and cover only, never the builder's name: that is the community the site is for, and every such
  title passed the word and personal-information filters and a review before going public.
- **The page's language is its address's** (`req.pathLocale`): robots, canonical, og:url and og:locale never follow
  the visitor's cookie or Accept-Language, so a plain address is always the indexable English (x-default) page. Search
  robots (`isBot`) also get the page's text in that language whatever Accept-Language they send; people still get
  their browser's language.
- **Game structured data:** `VideoGame` (plus `LearningResource`) with `gamePlatform`. `applicationCategory` and
  `operatingSystem` are added only with an `aggregateRating` (5+ ratings): without a rating or review, Google reports
  them as an invalid Software App item.
- **Language addresses:** public pages also answer at `/<code>/…` (`/es/teachers`, `/zh-hant/g/sum-racer`) in that
  language, without writing the cookie. hreflang and the sitemap list a language only where the page is written in it
  (its heading key in that locale file, or a game's own `l10n`); other language addresses point their canonical to
  English and are noindex. The teacher/subject copy (`teachers.*`, `learn.*`, `seo.*`) is outside the 90 % readiness
  share, like the legal text, so it never takes a language out of the picker.
- **Claims:** /teachers says nothing about COPPA/FERPA compliance (still with the lawyer, docs/legal-review.md), shows
  Sign in with Google only when it is on, and plan wording only once plans are public.
- **Speed:** signed-out text responses are gzip/brotli compressed; signed-in ones are not (BREACH: they can hold codes
  and login-card passwords). `?v=` CSS/JS/covers/icons are cached for a year. Share pictures: `node scripts/og-images.js`.
- **Owner steps (not code):** verify oomba.ai in Google Search Console and Bing Webmaster Tools (DNS TXT), submit
  /sitemap.xml, watch coverage for any /u/ or child-game URL, and pursue teacher directory listings (see the SEO plan).

## Parent pages (SEO for parents)
- **/parents stays the address** (already indexed, in every footer, the URL parents expect); no /families next to
  /family and /grown-ups. It is now a landing page for parents (routes/parents.js): learning games, games by age and
  subject, making games, what makes it safe, privacy, at home and homeschool, then every old privacy and safety section
  under "Safety and privacy, in detail" with the same ids (`#what`, `#stored`, `#ai`, `#contact`…) and the same text as
  /privacy (only their heading level changed, h2 → h3). Signed out, "Parents" is in the top menu next to "Teachers";
  the footer says "For parents".
- **New pages:** /parents/ai-builder-safety, /parents/safety-and-screen-time, and three age pages
  /learn/games-for-8-and-9-year-olds, /learn/games-for-10-and-11-year-olds, /learn/games-for-12-to-14-year-olds
  (grouped ages: one page per age would be thin with 15 launch games). Subject pages gained an "At home" paragraph
  and a parent question; /learn/make-a-game gained a parent section, starting ideas and an honest Scratch comparison.
  Game pages show an age range next to the grades (`ageBand`: grade N ≈ age N+5 to N+6, within 8–14).
- **Claims:** no "parental controls", dashboard, monitoring or time limits are promised (there are none: the pages say
  so and point to Apple Screen Time, Google Family Link and Microsoft Family Safety); nothing about COPPA (still with the
  lawyer); never a price. Plans and grown-up accounts are linked (/plans, /grown-ups/signup) only while `familiesOn`. Ring Rumble, Happy Putt, Footy
  Tycoon and children's games are never on a parent page (tests/unit/seo-parents.test.js).
- **Languages:** the parent copy (`parents.*`, `learn.ages.*`) is English for now and outside the 90 % readiness share
  (`UNCOUNTED_PREFIXES`). Until a language has `parents.h1`, `/es/parents` and the other language addresses point their
  canonical to the English page and are noindex (before, /parents was listed in every language because its old heading
  was translated).
- **Not built yet:** /parents/roblox-alternative (wait for the lawyer's glance at naming Roblox) and
  /parents/summer-learning-games (publish by mid-May). The guides' external links (healthychildren.org, Common Sense
  Media, Apple, Google, Microsoft) should be checked once from a network that reaches them.

## Doors for grown-ups (navigation, week 1)
- **Signed out means signed out or a guest** (`signedOut(u)` in views/layout.js: `!u || u.is_guest`) for the menus, the
  home intro and the footer. One tap on Play makes a guest; before, that hid the intro and both Teachers links.
- **Signed-out tab bar:** Home · Search · Build · 👪 Grown-ups · Plans (while `familiesOn`) · Sign in. Friends waits for an
  account (also on desktop). The Grown-ups tab opens /parents straight away rather than a chooser menu: one page, no new
  UI to build and translate, and /parents has the teacher link right under its two buttons. The tab is current on
  /parents and /teachers. Desktop keeps Parents and Teachers in the top bar. Signed-in kids, students, staff and
  grown-ups keep their bars.
- **/parents:** the first button is "Set up your child — free" (the grown-up sign-up) while plans are public, "Let your
  child start free" (the kid sign-up) before; "▶ Try a game" next to it; the buttons come before the badges. A signed-in
  grown-up gets "Go to your family page". The Plans card links /plans and shows no amounts.
- **/safety** ends with "Set up your child": the set-up itself when signed out, /parents for a kid or a guest (a kid's
  page never links a grown-up sign-up; billing.spec.js crawls /safety as a guest).
- **/login and /signup:** "Grown-up or teacher? Parents sign in/start here · Teachers start here" (the grown-up pages
  while plans are public). Before that the parents' link goes to /parents, and the sign-in line says "Oomba Academy for
  parents" (`auth.page.grownupLoginSoon`) rather than promising a sign-in. Not shown to a guest keeping their progress.
- **Tab bar details:** the signed-out Sign in tab is current on /login and /signup, never on a guest's own /me. Each tab
  label is one line (`.tab-t`, nowrap, a smaller size under 400px), so "Grown-ups" doesn't break at its hyphen.
- **Builder daily-limit card on a phone:** it takes the typing row's place (Send is off anyway) and scrolls past
  ~260px, so the chat log keeps a usable height; untranslated, it is marked `lang="en" dir="ltr"`. A game with nothing
  built yet gets "New Builder messages come tomorrow" (no "Your game is saved").
- **/build for a grown-up** is a short page ("The Builder is for kids' accounts") instead of a 404; the Builder APIs stay
  404. **/learn** is an indexed hub of every subject and age page (canonical, sitemap, CollectionPage).
- **Game pages:** "🛠️ Make a game like this" (to /build) for everyone but grown-ups and the game's owner. Subject, age and
  game pages show "Using this in class? See Oomba Academy for teachers" to signed-out visitors and guests.
- **Grown-up names and pictures:** the grown-up sign-up's name is "Your sign-in name" and may be a real name
  (`cleanName(…, { realNames: true })` skips the real-name and birth-year checks; profanity, digits and link codes are
  still refused). Grown-ups get 👤 on a neutral colour, never a kid's animal; older grown-up accounts show it too
  (components.js `avatar`). Kids' name rules are unchanged.
- **Teachers: "Set up my school"** replaces the mailto on /teachers: school name, role (teacher, principal / head,
  IT lead, district / group, other), a work email, about how many students, country. It is the one place the site asks
  for an email, and only an adult's: a kid's own or school account sees "Show this page to your teacher!" instead, and
  its POST is a 404. Stored in `school_requests` (migration 0026, `services/school-requests.js`), deleted 1 year after it
  is closed (or made, if never closed); the audit log has ids only. The sender's account id is kept only for an adult
  account (grown-up, school staff, platform admin): never a guest's, since a guest is often a child and signing up
  keeps the guest's id. Same-origin only (`csrfCheck`). Limits like sign-up: only a stored request spends the 5 per
  address per hour and the 200 a day from everyone (each with its own message: "in an hour" / "tomorrow"); any post,
  a robot's or one with mistakes, spends a separate 100 tries per address per hour. Every field to fix comes back at
  once. At most 500 open, a hidden field for robots (thanked, not stored). Works without JavaScript (a plain form post
  answered with a redirect). The thank-you (`/teachers?sent=1`) shows nothing that was typed. The page promises an
  answer "within 1 school day"; the site sends no email, so the platform admin replies by hand. The Privacy Policy
  (full text, `?for=grownups#schoolSetup`, which the form links) lists what is kept, why, who sees it and for how long.
- **Legal text changed on 2026-10-28 (`LEGAL_UPDATED`):** the family link code now lasts 24 hours (Terms › Accounts,
  Privacy › Linking), and the Privacy Policy has a "School set-up requests" section. **Owner review needed before
  this ships.** The reworded strings got new keys (`me.family.codeHowDay`, `info.terms.accounts.li16`,
  `info.privacy.linking.li7`, `family.link.step2Day`, `family.errors.badCodeDay`, `family.billing.welcomeStep2Day`)
  and the old "1 hour" translations were removed from the other locales, so no language states the old lifetime: they
  show the English (marked `lang="en" dir="ltr"`) and i18n:check lists them as missing until translated. A legal list
  is marked English only when every item in it is.
- **/admin › School requests:** open requests oldest first, with Create school (the usual Add a school form, name
  filled in; adding it marks the request done and links the school), Mark done, Decline, and Reopen on the latest
  closed. The count is on the tab and on the Schools button.
- **/plans/schools:** a seat calculator (students × Stripe's `oomba_school_seat_yearly` price, at least
  `SCHOOL_MIN_SEATS`; a plain GET form, so no JavaScript) and "Send this to my admin": `/plans/schools/print`, a
  noindex page with the price, the total and how to set up, and a print stylesheet that hides the menus. Both are gated
  like /plans/schools (`familiesOn`). Setting up now points to the /teachers form, not an email.

## Funnel counts (navigation, week 1: "How we'll know it worked")
- **What is counted:** one daily total per step in `funnel_counts` (migration 0027: `day, step, n`, nothing else), from
  `services/funnel.js`. Parents: parent page views → grown-up sign-ups → child linked (the child says yes) → checkout
  started (a Checkout Session made) → paid. Teachers: teacher page views → school requests (stored, not robots) →
  schools set up (Add a school on /admin) → first class with students (once per school, ever) → School plan.
  Guardrail: kid sign-ups (new accounts and guests keeping their progress) and games played (each play started).
- **How:** each step is counted on the server where it happens, in the same code (and transaction) as the thing itself.
  Page views go through the visit counter (`services/traffic.js`: real GET page loads, no bots, no 404s or redirects):
  parent pages are /parents, its guides and /grown-ups; teacher pages are /teachers and /plans/schools (after the
  language prefix). /learn is left out: it mixes subject pages for teachers and age pages for parents.
- **Paid / School plan:** the sync (webhook, or the Checkout return's fallback, which share one path) that first sees
  a subscription's first invoice (`subscription_create`) paid while the plan is entitled, counted in the sync's
  transaction, so a replayed event or a later update can't count it twice. An invoiced school (send_invoice, entitled
  as soon as the invoice is issued) counts when it pays, not before; a school that never pays never counts. Renewals,
  seat changes, a plan coming back from past_due, trials and gifted plans (grants) don't count.
- **Checkout started:** a new Checkout Session counts only when the family had no session in the last day (the one
  open session row `billing_checkouts` already keeps), so coming back from Checkout and clicking again doesn't
  inflate it; nothing new is stored. Teacher page views
  skip /teachers?sent=1 and ?failed=1 (the page the form returns to), which isn't a new visit.
- **Privacy:** no cookies, no third-party trackers, no ids of anyone (user, family, school, class), no per-person rows,
  and nothing joins one step to the next: the report compares totals, not people. Kid pages add nothing but the two
  guardrail totals. Kept like the traffic table (daily totals, no expiry).
- **Report:** /admin/stats › "Funnels, last 7 days vs the 7 before": one table per funnel with both weeks, the change,
  and each step as a share of the step before (last 7 days). A guardrail that dropped is marked. Counting started with
  this change, so the first two weeks read low; write down the baseline once the first full week is in.

## Home doors (navigation, week 2)
- **Home, signed out or a guest** (`signedOut(u)`): the heading and one-line promise (unchanged keys, so search results
  and hreflang stay as they were), then three doors, then the subject chips, the featured game and the rows, so it still
  feels like the app. 🎮 "I'm a kid — play now" is the big Spark door and scrolls down the same page to the featured
  game, the category chips and the game rows (`#play`, which wraps them), so a kid picks what to play: the owner's
  decision of 29 Oct ("play now should just take you lower in the page to the featured section"), replacing the first
  version, which went straight into the featured game. A game is two taps from home (the door, then the hero's Play or
  any card), still with no sign-up (a guest is made as on any /play). The scroll is smooth (`scroll-behavior`), instant
  with reduced motion, and lands just under the sticky top bar (`scroll-padding-top`). 👪 "I'm a parent" → /parents;
  🍎 "I'm a teacher" → /teachers. They replace Week 1's "For parents" / "For teachers" buttons (no duplicates). Phones:
  one door under the other on the first screen; tablets: the kid's door on its own row; ≥960px: one row, kid's widest.
  Signed-in kids, students, staff and grown-ups see no doors and no Play now.
- **No English doors on translated pages:** until a language has `home.doors.*`, its own "Play" (`home.hero.play`),
  "For parents" (`parentsKey`) and "For teachers" (`home.intro.teachers`) stand in and the small lines are left out.
  The group's screen-reader label is left out too until translated. Play now borrows "Play" the same way.
- **Counting (beacon, `/go/<door>`):** every door and the top bar's Play now is a plain link: the kid door `#play`,
  Play now the home page's `#play` in the page's language (`/#play`, `/es#play`), the parent and teacher doors their
  page in the home page's language (/es → /es/parents), so every translated home page keeps a crawlable link to its
  own parent and teacher pages. Each click is counted by a beacon on the way (`data-count` → `navigator.sendBeacon`
  POST `/go/kid|play|parent|teacher`, public/js/app.js: steps `door.kid`, `door.bar`, `door.parent`, `door.teacher`;
  204, same-origin only, rate-limited, nothing else stored). Without JavaScript the link still works, just uncounted. Only a person's click counts (`traffic.countable`): a GET (never HEAD, which link
  checkers send with browser-like user agents) or the beacon, not a prefetch, from a `Mozilla/` user agent that is
  neither a robot by the visit counter's rule nor `seo.isBot`. GET /go/<door> stays for older links (the doors used to
  go through it): it still counts the click and redirects, `/go/kid` and `/go/play` to `/#play` (`?l=es` → `/es#play`),
  `/go/parent?l=es` to /es/parents (an unknown code is ignored, so it never leads off the site). No new indexable
  address: /go/ is disallowed in robots.txt and answers `X-Robots-Tag: noindex, nofollow` (`PRIVATE_RE`) and `no-store`;
  nothing on the site links to it any more. Counting on the way was picked over `?from=home-door` on the target pages, which would add
  a second address of /parents and /teachers and count reloads.
- **Report:** /admin/stats › Funnels has a "Home doors (signed out)" table under the three funnels: clicks per door,
  last 7 days vs the 7 before, no "of step before" (a tally, not a funnel). The guardrail (kid sign-ups, games played)
  is what tells whether the doors cost kids anything.
- **Desktop top bar, signed out or a guest:** Home · Build · Plans (while `familiesOn`) · Parents · Teachers, then
  Sign in and a Spark "▶ Play now" button (the home page's game rows, `/#play`, like the kid door). The search field stays and stands for the
  Search link (the phone tab bar keeps Search). To fit in English, German and Russian: the menu drops its icons up to
  1300px, the wordmark becomes the app mark up to 1400px, up to 1100px the search field becomes the round 🔎 button,
  and up to 1000px Play now is a round ▶ (its words kept for screen readers). Checked from 821px to 1920px in
  nav-doors.spec.js (billing off) and plans.spec.js (Plans on); phones hide Play now (the tab bar and the doors are there).

## Who's this for? (navigation, week 2)
- **Start free (/signup), signed out:** first asks "Who's this for?" with three door-style links, one under the other:
  👪 **Me (a grown-up)** → /grown-ups/signup while `familiesOn`, otherwise /signup?for=grownup, an honest "Grown-up
  accounts are coming soon" with the parent page and "Make my child's account"; 🧒 **My child** → the kid form,
  unchanged (/signup?for=kid; the small line under it also tells a kid on their own that this is their button, since
  the three choices name no "I'm a kid"); 🍎 **I'm a teacher** → /teachers#start (the Set up my school form). No
  prices or plan names (kids see this page too). "Play as a guest" and "Have an account? Sign in" stay under it.
- **Skipped** (the kid form at once, as before): a guest keeping their progress (a kid already playing); ?for=kid; a
  ?next= to any page that isn't a grown-up or teacher page (the Builder's sign-in wall, joining a class, a game,
  Friends, Me; Plans, /parents, /teachers, /family, /learn and the info pages still ask); and a language that doesn't
  have the question yet (`t.own`), so a translated page never shows it in English. **Sign in (/login) never asks**: kids
  sign in every day.
- **Reconciled with Week 1's "Grown-up or teacher?" line:** the chooser replaces it on plain /signup (no duplicate).
  After "My child" the form shows "Who's this for? Pick again" instead; when the question was skipped for a ?next= the
  line stays, so a grown-up who lands there still finds their way. /login keeps the line.
- **Parent page, before parents' accounts open:** "Let your child start free" (and /safety's "Set up your child") link
  /signup?for=kid, the kid form at once: the parent already said who it's for.
- **Counting (`/signup/for/<who>`):** like the home doors' old /go/ redirect: one daily total per choice (`who.grownup`, `who.kid`,
  `who.teacher`), a person's GET only (never HEAD or a prefetch; `traffic.countable`), signed out only, then 302 on.
  A ?next= comes along to the grown-up sign-up (a parent who started on /plans goes back there after signing up,
  checked with `nextFor`; a plan picked on /plans still wins) and to the kid form. /signup/for/ is disallowed in
  robots.txt (/signup itself stays crawlable so its noindex is seen); the redirect answers noindex and no-store; the
  links are `rel="nofollow"`. Report: /admin/stats ›
  Funnels › "Who's this for? (sign-up)", a tally like the doors. The guardrail's kid sign-ups show whether the extra
  step costs kids anything.

## One parent page (navigation, week 2)
- **/parents and /grown-ups are one page, /parents** (indexed, its own canonical, in the sitemap; routes/parents.js).
  In order: the promise, the hero picture and two buttons; a short safety section (`#safe`, "What makes it safe");
  "How it works"; **Plans** (`#plans`: what a plan adds, US only, "not on sale yet" for anyone who can't buy now, the
  legal pages, and "See plans and prices" → /plans); **Family accounts** (`#families`: what a grown-up account does, how
  linking works, Make a grown-up account / Sign in or, for a grown-up, their family page, and the grown-ups' five
  questions as fold-outs); then the games, ages, subjects, making games, at home, the guides, "Private by design", the
  privacy details, the FAQ and the buttons again. Plans and Family accounts only while `familiesOn`: with billing off
  (production today) neither is there, and nothing on the page leads to /plans or a grown-up page.
- **No amounts on /parents.** /grown-ups showed both monthly prices and the per-child daily limit; those are on /plans
  only now (it states the limits before buying, as before). The Plans section has no numbers at all.
- **Folds for phones:** the eight privacy sections under "Safety and privacy, in detail" (and Sign in with Google's)
  are `<details class="lp-fold">` with the heading as the summary, inside the same `<section class="panel" id="…">`, so
  every old anchor still works; app.js opens the fold a link leads to (/parents#keep, also on hashchange). Their text is
  unchanged and still the same as /privacy (which stays open, h2). Contact (`#contact`, the footer link) stays open.
- **FAQ data = the visible FAQ:** FAQPage lists exactly the questions in the FAQ panel (with the paid wording when
  plans are on). The grown-ups' questions under Family accounts are fold-outs there, not FAQ data.
- **/grown-ups → 301 /parents#families**, keeping the query (?bpreview is still handled first). Always a 301, also with
  billing off (a permanent redirect must not depend on a setting; /parents is there either way). /grown-ups/signup and
  /grown-ups/login are unchanged; their Back link goes to /parents#families. The funnel's parent views count /parents
  (and its guides) only now.
- **Strings:** the /grown-ups page's own strings (its title, description, heading, intro, price lines, "What a family
  plan adds" heading, "Compare plans and prices") and "About family accounts" were removed from every locale. One new
  string, `parents.plans.adds`; until a language has it, that page shows the older `parents.families.p2`, so a
  translated page gets no English paragraph.

## The /family checklist (navigation, week 2)

`server/routes/family.js` `familyChecklist`, at the top of /family, for the grown-up only (the page is `grownupOnly`;
kids, guests and signed-out visitors get a 404 or the sign-in, and while families are off the small /family page has no
checklist).

- **Three steps.** 1) Your grown-up account (always done). 2) Link your child: done once a child is linked; until then
  the child's side (Me › For grown-ups › Get a code, the same words as /family/link) and a link to the code form, or
  "Waiting for your child to say yes" while a request waits. Straight back from Checkout with no child, the welcome
  panel below already has those steps and its button, so step 2 doesn't repeat them. 3) Pick a plan (optional): done
  while the family has a plan ("Your plan is on"); otherwise "Free works; a plan adds Builder messages for your child"
  and a link to /plans; after "Free is fine", "Staying free for now." (no "any time" promise: plans are US-only and may
  not be on sale). While this grown-up can't buy a plan (`familyOnSale`: `onSale`, the Family payment method
  configuration and its prices, the same rule as /plans and /parents' "not on sale yet"), step 3 says "Plans aren't on
  sale yet. Free works in the meantime." with no link. **No amounts and no plan names** (prices stay on /plans only);
  while Checkout is still settling step 3 offers nothing (the plan card shows the wait).
- **Folds to "All set"** (a `<details>`, so the steps can still be opened) once a child is linked and either a plan is on
  or the grown-up tapped "Free is fine, hide this". Straight back from Checkout (`?welcome=1`, `?checkout=`) it stays open
  so "Your plan is on" shows.
- **Dismissal is stored on the server**, on the grown-up's own family row (migration `0028_family_checklist`,
  `families.checklist_hidden_at`), through `POST /api/family/checklist/hide` (inside the grown-up fence). Why keep it:
  without it a family happy on the free plan would see "Pick a plan" every visit, which is a nag. It is only offered
  once a child is linked, so hiding always folds the list. Nothing about the child is stored; there is no "unhide" (the
  plan card below always has See plans).
- **Nothing new is counted.** The steps are the parent funnel's own steps, counted where they happen (`parent.signup`,
  `parent.child`, `parent.paid` in services/funnel.js); viewing or hiding the checklist adds nothing.
- **Words:** `family.check.*` (English only; notes in notes.json). Until a language has them, they are marked
  `lang="en" dir="ltr"` (like `meFamilyPanel`); the how-to reuses the translated `family.link.step1`.
- Tests: `tests/unit/family-checklist.test.js` (each state, the fence, families off, no amounts, nothing counted, the
  English marking); `tests/e2e/family.spec.js` (the flow, and folded/open at 360/1280, light/dark, he).

## Navigation shells (weeks 3–4, part A: a tab bar for each role)
Shipped from the navigation proposal's Option 2. Not behind a new flag: Plans shows exactly while `familiesOn`.
- **One function, `shellFor(u, req)`** (views/layout.js) -> `{ role, tabs, top, meHref }`; the first match wins:
  signed out or guest (unchanged) · grown-up: Family · Games · Plans · Account (avatar -> `/family/account`) · staff who
  admin a live school: Classes · Games · School · Plans · Me · other staff: Classes · Games · Plans · Me · the platform
  admin who isn't staff: unchanged · students (`inAnySchool`): Home · Classes · Build · Friends · Plans · Me · kids:
  unchanged (byte for byte; a unit test holds it). The desktop top bar is the same list without Me/Account; everyone
  has the search field (or the round 🔎 button below 360px).
- **`currentTab`:** `home` and `search` pages make Games current where there is no Home tab; `/school/:slug` passes
  `school` for its own admins (teachers there keep `classes`); `/family/account` passes `account`.
- **Labels** with translated stand-ins until a language has them (`tabKey`): `nav.games` -> `nav.home`, `nav.account`
  -> `nav.me`, `nav.school` -> `nav.schools` (like `nav.grownups` -> `nav.parents`).
- **Staff badges:** no Friends tab, so friend requests and unread chat count on Me.
- **Fit (app.css):** signed in with 4+ menu items, the search field is the round 🔎 button at 821–1000px (5+ items: to
  1100px), 5+ items drop their emoji up to 1000px, and the avatar's name steps aside at 1181–1300px. The kid's and
  student's bars (five items with Plans) overflowed in Russian at 821px before this.
- **`/family/account`** (grownupOnly, open while families are off): Language, Password, Sign out, Sign out everywhere.
  /family keeps the checklist, children, plan and help; while families are off it is a short note with an Account
  button. `public/js/family.js` sends `/family#password|#language|#signout` on to the Account page. The footer language
  link and the short-password notice point there. A guest is sent to the grown-up sign-in, as on /family.
- **`/school`:** an admin of one school -> its People tab; of several -> a chooser; anyone else -> 404.
- **"🛠️ Make a game"** on /teach's head and in Me's header for staff (they have no Build tab).
- **/teach plan card** (per school the user admins; only while `billingTabOn` and `C.mayBill` — the Billing tab's own
  selling rule): "No school plan · students on free Builder messages · Set up School plan →", "School plan on ·
  Billing →" or "Setting up your plan…". Never an amount.
- **"Ask my admin"** (`services/plan-asks.js`, migration `0029_plan_asks`): a panel on /teach for each school where the
  user is a teacher (not admin), while families are on, the school is live and has an admin. `POST
  /api/schools/:id/ask-plan` (staff, not admin; 10 an hour) keeps one open row per teacher per school (ids and dates
  only; audit `school.plan.ask` with the ask id). Admins see "N teachers asked" with names and dates on the card and at
  the top of the Billing tab, and Dismiss (`.../ask-plan/:aid/close`). Open asks close with `close_reason='plan'` when
  the plan is on, checked when read. Closed asks are deleted 90 days later (daily job `school-plan-asks-retention`).
  A teacher whose school has a plan reads only "Your school has a School plan." Privacy text: school billing li7
  (`LEGAL_UPDATED` 2026-10-29).
- Tests: `tests/unit/nav-roles.test.js`, `family-account.test.js`, `plan-asks.test.js`; e2e: `layout.spec.js` (every
  role at 360/1280, light/dark, he/ar), `plans.spec.js` (every role's top bar 821–1920 in en/de/ru, tab bar at 360 in
  en/de/he/ar), `schools.spec.js` (School tab), `school-billing.spec.js` (Ask my admin), `family.spec.js` (the split and
  the old anchors).

## Parent-made child accounts (weeks 3–4)
Design: the navigation proposal's step 3, plus three safety reviews (all "go with conditions"). Part B is built
(`services/family.js` "parent-made child accounts", `services/account-delete.js`, `views/family-made.js`, the routes at
the end of `routes/family.js`, migration `0030_parent_made`) and ships dark.
- **A tab bar for each role** (`shellFor` in views/layout.js). Kids keep Home · Search · Build · Friends · Plans · Me
  unchanged. Students (in any school or class): Home · Classes · Build · Friends · Plans · Me, with Search from the top
  bar. Grown-ups: Family · Games · Plans · Account; the settings move to a new `/family/account`, and the old /family
  anchors still work. School admins: Classes · Games · School · Plans · Me (`/school` opens the school they run). Plain
  teachers: Classes · Games · Plans · Me, with "Make a game" on /teach and Me. The platform admin's bar is unchanged.
  Plans shows exactly while `familiesOn` and appears in every role's bar.
- **/teach plan card** for school admins (no amounts): "No school plan · Set up School plan" or "School plan on". It is
  shown only where the Billing tab may sell. **"Ask my admin"** for plain teachers: a `school_plan_asks` row (ids and
  dates only, one open per teacher; deleted 90 days after it closes) that the admins see on /teach and on Billing. It
  closes itself when the plan comes on. There is no inbox system, and the site sends no email.
- **Parent-made child accounts are dark:** they need `familiesOn(req)` and `PARENT_MADE_CHILDREN=1` (off by default).
  Turning them on in production needs the owner's sign-off on the legal-review item "Parent-made child accounts".
- **One creation path**, `F.createChildAccount`, which makes an ordinary kid account (no flag changes `accountKind`,
  `isChildAccount`, sessions, chat or `publicUser`). The form has a username, a password and the password again.
  - **Name:** kid name rules (no `realNames`), and the name may not use the grown-up's own name.
  - **Password:** kid rules, and it may not be the grown-up's own password.
  - **Step-up:** the grown-up's password within 10 minutes.
  - **Notice:** the parent ticks "I've read this" for a direct notice (what is kept, what goes to Claude, who sees
    what, how long, see and delete). They also tick "I am this child's parent or legal guardian", which is stored as a
    statement. A sentence on the page says that making, ticking or paying is **not** a parental consent check.
  - **Limits:** the kid sign-up's per-address buckets. At most `FAMILY_MAX_CHILDREN` made per rolling 365 days, with
    unlinked and deleted accounts still counting, and at most 2 per day. The live cap (Basic = 1). Refused while the
    family has an open link report.
  - **One transaction:** account, linked row, `family_notice_acks` record (notice version = `LEGAL_UPDATED`, method
    `notice-ack`) and audits (`user.signup {by_grownup, parentMade}`, `family.child.create`, `family.link {by:'create'}`).
  - **Permanent provenance:** `users.made_by`, `made_by_family`, `made_at` (migration 0030).
- **Switch to <child>** works only for accounts this family made and is still linked to, never for a code-linked
  child. It asks for the child's password and the grown-up's step-up. It ends the grown-up's session on this device,
  starts a fresh child session and clears `brb_ended`. The only way back is the normal grown-up sign-in with their
  password: there is no switch-back button, PIN or remembered-parent cookie.
- **The child keeps a voice.** A first-sign-in card in fixed words: "A grown-up made this account for you…" with what
  they can and can't see, plus "This isn't my grown-up". Me › For grown-ups keeps Unlink and Report. On a made account
  both force a new password, end the other sessions and the link, and a report is marked `parent_made` for the admin.
- **The grown-up's tools for a made child**, each behind step-up:
  - Reset password (the child is told once).
  - "What we keep": counts only, as of yesterday, no content.
  - Delete: a real delete or tombstone of games, chats, uploads, photo, friends, sessions and links. The old name is
    reserved for 90 days, and Builder usage totals are kept without text. It is refused while the child is in a class.
  - There is no Remove (unlink) for made children; Delete is offered instead.
- **Admin:** "made by grown-up @x" on the child, and "accounts this family made" on the grown-up. Link reports show
  the made flag and counts. "Pause all accounts this grown-up made" is a manual button after a ban.
- **As built, where it differs from the design notes:** the child's new password fields are `newPassword` /
  `newConfirm` (the step-up keeps `password` for the grown-up's own), and Switch's is `childPassword`. Delete is reached
  from the row's "Delete account" button on the "What we keep" page (behind the same step-up), not a second form on the
  row. `F.deleteAccount` lives in `services/account-delete.js` (it needs photos, screenshots and uploads); it also clears
  the child's plays and game reports of their user id, adjusts the likes and ratings totals of other games, and keeps a
  chat message someone else reported with its text blanked. The first-sign-in card shows only while the maker is still
  linked. "What we keep" lists `F.GROWNUP_SEES` (extras, games, chats, uploads, saves, scores, friends, messages, photo,
  sign-ins), the same list as the child's card. The /privacy#made section shows to every reader while it is on (it names
  no plans). `LEGAL_UPDATED` is unchanged for this part: nothing live changed.
- **"Made" means the link made with the account, unbroken** (`family_children.made_link`, migration 0031): 1 only on the
  row `createChildAccount` wrote. A code link writes 0, also when the family that made the account links again by code
  after the child left (`childLeaves` also sets 0). `madeChild` and `madeLinkOf` need it, so once a child has cut the
  adult out with a new password, Switch, Change password, What we keep and Delete stay 404 for good, and leaving again
  is the one-tap code-link Unlink. `madeChild` also refuses a banned, school-managed or non-standard account (a banned
  account may be under review, so its data must not be deleted).
- **Switch sign-ins are marked** (`sessions.via='switch'`). The first-sign-in card still shows in them, but its OK only
  hides it for that sign-in (`sessions.made_card_ok`); it is answered for good only in a sign-in the child made
  themselves, so the child always sees it even when the grown-up taps OK right after switching. The one-time "your
  grown-up gave your account a new password" note is never drawn or used up in a Switch sign-in either. The card is
  short (title, one line, OK, "This isn't my grown-up"); the full list folds under "What can they see?".
- **What stays when the flag goes off** (one rule): the protections against an adult who knows the child's password
  never depend on `PARENT_MADE_CHILDREN`. With the flag off (families on), a child whose made link is still on keeps Me's
  made panel, where Unlink and Report ask for a new password; the grown-up gets no Remove for that child (the row shows
  no buttons, and the Remove API is a 404), so turning the flag off can never leave an unlinked account whose password
  an adult knows; and the new-password note is still shown once. Everything that gives the grown-up powers (make,
  Switch, Change password, What we keep, Delete, the first-sign-in card's introduction, the /privacy and /parents
  sections) is off with the flag.
- **"Pause all accounts this grown-up made"** pauses only `F.pausableMade`: accounts whose made link is still on or was
  ended by someone other than the child (the grown-up's own ban ends it), with no link report by the child against that
  family and no live link to another family. A child who left or reported that grown-up is listed for the admin as
  "left", "reported" or "relinked", to review on its own.
- **"What we keep" counts** stop at the end of yesterday (UTC) for what was added, but games, friends, sign-ins and the
  photo are read as they are now (there are no deleted-at or accepted-at times to rewind), so something deleted or
  ended today can already be missing. The copy says exactly that (`family.kept.introCounts`, `info.privacy.made.li8`),
  and the child's card makes no "never today" promise.
- Tests: `tests/unit/family-made.test.js`, `family-switch.test.js`, `family-made-child.test.js`,
  `family-delete.test.js`, `family-made-admin.test.js` (shared harness `tests/unit/_made.js`); e2e
  `tests/e2e/family-made.spec.js` (its own server with the flag on: make, switch, play, build, back; What we keep and
  Delete; the kid crawl; the new pages at 360/1280, light/dark, he/ar).
- **Left out:** the "What your child made" activity panel (needs its own safety read); parent toggles for chat and
  photo; a verified consent method; retention timers; grown-up self-delete; hand-over; translations (English with
  `lang="en"` marking until done). Full design and test list: the Weeks 3–4 design notes.

## Oomba Kit: one visual foundation for every game (phase 1)
- **Build our own kit instead of adopting an engine.** The kit is `window.Oomba`, a classic script pinned with SRI at `/vendor/oomba-kit/<ver>/`, the same way three.js is served. It has two stateless backends: Paper (Canvas 2D) and Glaze (WebGL2). — Every engine needs patches to run in the frame sandbox (no eval, workers, wasm, fetch or URL images). They cost 70–350 KB gz, none has the Canvas 2D fallback that low-end Chromebooks need, and their bitmap text breaks Arabic. A small, frozen API is also what the Builder writes most reliably. Three.js stays the 3D path. Full spec: `docs/kit.md`.
- The art direction is **"Oomba Ink"**, taken from the logo:
  - a thick round Ink outline of constant on-screen width and a Cream sticker rim;
  - flat fill, one hard cel shade and one gloss highlight;
  - the logo's ring eyes on every character;
  - the 4-point spark as the only reward glyph;
  - hazards always spiky and coral.
  
  Games use colour role names, never hex. All art is procedural code baked into atlases. — It is the most recognisable as our own (it is the logo), the cheapest to draw on Chromebooks, and the easiest to read for colour-blind players. It also needs no image hosting under the frame's `img-src data: blob:` rule.
- **UI in the DOM, the game world on canvas.** — Screen readers, focus, RTL and crisp text come for free, and the Builder playtest's `inspect()` only sees DOM.
- Paper is a finished art style, not a fallback. The tier or backend changes only at a scene transition, on the pause screen or after a lost WebGL context; dynamic resolution moves first. There is no WebGL1 path. — Most school Chromebooks land on the lowest tier, and visible quality jumps look like bugs.
- Kit versions live in folders that are never changed or deleted. `KIT_VERSIONS` only grows. API 1 only gains features. `edit_game` keeps the version a game was pinned to. The inlined SDK only gains plumbing (`BRB.theme`, `BRB.motion`), never look. — Old games must never change under their players.
- The kit is never inlined into the frame. — Frame documents are `no-store` and arrive uncompressed for signed-in kids. A vendor file is cached once and brotli-compressed.
- **Please confirm:**
  - kit games follow the site's light/dark theme via `init.theme` (non-kit games keep their own colours);
  - `/vendor/oomba-kit/` is added to the frame's `script-src` and `font-src`;
  - Bricolage is the kit font, with system fallbacks for each script;
  - the "Oomba" mascot species is the default and guest character;
  - esbuild is added as a pinned devDependency used only for the build;
  - about 80 KB brotli of code plus about 108 KB of fonts, cached once per device.
- **Core engine (built).** Decisions taken while building it:
  - The build bundles without a tool: each `kit/src` module becomes a function scope that returns its exports, so
    sources stay plain ES modules for the unit tests and the dist stays a classic script. A unit test rebuilds it
    in memory and fails when `public/vendor/oomba-kit/1.0.0/oomba-kit.js` is stale.
  - Glowing and "unlit" parts (ink line, sticker rim, rewards) are painted into a mask while the art bakes. Glaze
    reads the mask in its lighting shader; Paper uses the same mask to bake night variants that keep those parts at
    full colour, so both backends agree on what stays bright at night.
  - Light halos are ordinary display-list items (additive glow sprites), so Paper and Glaze draw them the same way;
    Glaze adds the per-sprite point lighting on top.
  - Kit timers (`after`, `every`) fire inside the clock tick, not as promise callbacks, so `__brbTest.step(n)` is exact.
  - The `/kit` frame takes `?l=` and `?mode=`: the site middleware treats `?lang=` and `?theme=` as the visitor's own
    choice and redirects.
