# Decisions

One line each: the choice, then why. **Bold = please confirm** (product calls that are expensive to reverse).

## Owner requests that change the original brief
- **Name: "Magic Cup"** (was "BRB Gaming", before that "Playloom"). Every visible name, the logo (a gold cup), the browser icon, page titles, Builder and safety copy, docs and the official account (`MagicCup`, renamed in place from `BRBGaming` by the seed so its games keep their owner) say Magic Cup. Internal technical names stay as they were: the game SDK global `window.BRB` and `brb:*` messages (every existing game calls them), `BRB_*` env vars, the `brb_session` cookie and `brb.db`. — Owner asked to rename the site; renaming the SDK would break every published game and renaming env vars/cookies would break the deploy and sign everyone out.
- New Render service `magic-cup` (https://magic-cup.onrender.com) replaces `brb-gaming`: Render can't change an existing service's onrender.com subdomain. — Owner asked for the onrender domain to change too.
- **Name: "BRB Gaming"** (was "Playloom"). SDK global is `window.BRB`, messages are `brb:*`, env vars are `BRB_*`, official account is `BRBGaming`. — Owner asked to rename.
- **Friends-only chat added** (brief said no chat). Text chat only between accepted friends (added by friend code), both with real accounts, filtered for profanity and personal info (phones, emails, links, addresses, "add me on snap"), quick-chat phrase chips for young kids, rate limits + daily cap, block, report → admin queue, grown-ups can switch chat off on the Me page. No public, group or stranger chat. — Owner asked for a way for users to chat; this is the safest version that meets it.
- **Every public game is approved by a person on the Oomba team; admins see new sign-ups and can message users** (Nov 2026). See "Admin approval before a game goes public", "Admin messages: the Oomba team inbox" and "Admin: New users" at the end. — Owner: "before a game is published to the live site it needs to go through admin approval", "see all new users", "chat all users".
- **The admin sees user analytics** (Nov 2026): Admin › All users (every account with last login, days active, plays, builds, AI Builder messages, course steps, live games), a person's Activity on the Users tab, and DAU / WAU / MAU on Stats. See "Admin: user analytics" at the end. — Owner: "I also want to see user analytics like games played, last login, built games, etc."
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
  invite. Anyone else is turned away kindly at sign-in. (Since 11 Nov 2026 a parent or a teacher may also make their own
  account with Google on the sign-up, after "18 or older"; kids never: see "One sign-up".)
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

## Live speech to text (words while the kid speaks)
- **The words show in the chat box while the kid speaks**, then settle into the final words on stop. — Owner request:
  before, nothing showed until the recording was stopped. The page streams the mic over a WebSocket to our server
  (`/api/studio/:id/listen`, `server/services/stt-live.js`), which relays it to the provider's realtime transcription
  API (`stt.js` `openRealtime`: OpenAI realtime transcription sessions by default, ElevenLabs realtime if that adapter
  is chosen). The key stays on the server and the CSP is unchanged (`connect-src 'self'` covers our own socket).
  New dependency: `ws` (Node has no WebSocket server). Kill switch for the live mode only: `STT_LIVE=0` (the page then
  records and uploads as before). OpenAI's live sessions use the configured transcription model (`STT_MODEL` or
  its default, the same as uploads); ElevenLabs needs its realtime model (`scribe_v2_realtime`); `STT_REALTIME_MODEL`
  overrides either.
- **Not re-sending the whole clip every 1.5 s.** That costs the square of the clip length in provider seconds (a 60 s
  clip sends about 20 minutes of audio), makes the quotas either dishonest or punishing, Safari's MediaRecorder slices
  can't be read on their own, and it would still lag by 1.5 s plus a round trip.
- **Every message to the page is the whole text so far, tidied and masked** (never a raw piece from the provider), and
  the newest, still-growing word is held back until the next one starts (the last 2 characters in scripts without
  spaces), so neither a rude word nor its first letters ever flash on screen. The words lag one word behind speech.
  This is done for **each unfinished segment on its own**, in commit order (with turn detection one segment can still
  be streaming while the next one is committed), and empty segments are skipped.
- **Turn detection on for every OpenAI model.** The realtime API only transcribes audio once it is committed, so with
  no turn detection nothing would show until stop. Server VAD commits at each short pause (500 ms), and in a long turn
  without a pause the relay commits by itself (only while the VAD hears speech, never a stretch of silence: at a
  quiet frame after 3 s, at the latest after 5 s), so words come
  phrase by phrase while the kid talks. On stop: one commit, then a `session.update` turning detection off; its answer
  comes after every commit's (the service answers in order), so a VAD commit that was already on its way can't be
  taken for the stop's own and the last words are never cut off.
- **First words are kept.** The page builds its audio graph as soon as the mic is on (at `S.mic.rate`) and holds the
  frames until the socket is open; the relay holds them in memory until the provider is ready, then sends them in
  order (counted as seconds only then). Before, the kid's first second of speech was dropped.
- **Counting:** a live session is one clip (counted when it opens, in the same per-minute bucket as uploads); its
  seconds are the audio bytes the relay received (the page can't fake them), counted once when it ends. If the live
  link fails, the page uploads its in-memory clip to `/transcribe` once with `X-Live-Id`: not a second clip, but its
  seconds count (the audio really went to the provider twice). The ids are in SQLite (`stt_live`: id, user, game,
  state, expiry; never audio or words), so the upload after a restart (what `drainLive` asks for) is still recognised.
  A fallback upload skips only the builder's own daily cap; the site's minutes and the AI spending caps still apply.
  One app instance only, as for the rest of the site (an id made on another instance would not be known there).
- **Fallback:** the page keeps recording with MediaRecorder too; a socket that can't open, a provider error, a lost
  connection, a restart (`drainLive` on shutdown), a link too slow to keep up (never dropped frames, which would lose
  words), an audio graph that sends no frames (an iPhone's suspended audio: the page checks after 2.5 s) or a stop
  with no audio received by the relay uploads the clip instead (never an empty "final" that would throw it away). Refusals (too many, the day's cap, the
  site busy, the Builder off, the mic on in another tab) don't fall back. Browsers without AudioWorklet use the old
  path unchanged.
- **Unverified provider details** (docs could not be fetched from this environment): the exact OpenAI `session.update`
  nesting (and that a partial update turning turn detection off is answered with `session.updated`; if not, the stop
  waits `finalWaitMs` and uses the words so far), whether the live model takes a prompt, and the ElevenLabs field names `audio_base_64` / `commit`. Covered
  by a local fake in tests; **one smoke test with a real key is needed before relying on it** (a field rename falls
  back to the upload path, it does not break the mic). Live models may cost a different amount per minute than
  `STT_USD_PER_MINUTE`: **owner to decide** whether a separate live price is needed.

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
classes, schools and admin included, is a 404, and `requireAccount` itself refuses them too (since "Grown-ups can build"
below, the Builder, the Studio and grown-up-only connections are open to them; chat, profiles and friends with kids are not). They are on no
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

## One age range, and the 5 to 7 guide (2026-11-10)
- **The site's audience is kindergarten to grade 8, about ages 5 to 14** everywhere a page speaks for the whole site
  (seo.AGE). Unchanged on purpose: each course's own grade band (Number Quest 3 to 5, CS Quest and Cyber Defenders 3
  to 8), the per-age pages, live question levels and the Brain Board starter set, and the signed-off Terms (legal text,
  still "8 to 14" in `info.terms.who.p1` and `info.terms.accounts.p1`: a change needs the lawyer). AI prompts and
  translator notes that say "8 to 14" were not changed here. tests/unit/research-compliance.test.js keeps en.json clean.
- **/learn/games-for-5-to-7-year-olds** (AGES `a5`, first): only games whose own grade band starts by grade 2 and that a
  pre-reader can play (words read aloud, or numbers, music and pictures). It says the full courses start in grade 3 and
  that a grown-up types for the Builder at this age. `ageBand` (the "Ages 6–11" line on game pages) now starts at 5.

## Research and compliance pages (2026-11-10)
- **/research** (routes/trust.js): only the three verified reviews (Clark, Tanner-Smith and Killingsworth 2016;
  Wouters et al. 2013; Sailer and Homner 2020). Percentiles in plain words up front (from the effect size, normal
  scores), effect sizes in small print, citations with DOIs, and what the numbers don't prove (averages; none tested
  Oomba). The landing's "Further reading" (Roediger and Karpicke 2006, Hattie and Timperley 2007) stays: no numbers.
- **/compliance**, a page of its own next to /research (school IT staff look for one address; /safety is written for
  kids and parents, and the legal pages are signed off): facts only from /privacy, docs/safety.md and the code. Where
  the legal position is still open (docs/legal-review.md items 1, 6 to 9, 31, 34: COPPA consent model, FERPA "school
  official", GDPR roles and representative, whether a DPA is offered) the page asks schools to email us, and the
  sentence that would need sign-off is in `PENDING`, shown only to the platform admin as "Not shown publicly".
- Both are linked from the site footer (signed out and school staff) and the landing footer, and from each other.

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

## Play and Learn (one library, two shelves; a first tab per role)
The owner's "B + A" choice: one game library everyone shares, split into two shelves, and a first tab built for each
role. Part 1 (this entry): the shelves, the Play and Learn pages, the bars, and where `/` goes. Part 2 rebuilds the
teacher Classroom (`/teach`) and the student Class tab (`/classes`) themselves.
- **Shelves.** Every official game is `play` (fun first: arcade, sports, adventure, music, silly, board fun) or `learn`
  (teaches something: math, words, maps, coding, thinking, music, courses, live class modes): seed JSON `"shelf"` is the
  source of truth, stored in `games.shelf` (migration `0062_game_shelf` backfills older databases;
  `scripts/import-game.js` writes it). 13 Play, 23 Learn (`tests/unit/shelves.test.js` holds the list). Players' games
  keep `''`: `SHELF_SQL` / `shelfOf` (services/games.js) put a player's `learning`- or `words`-category game on Learn
  (`LEARN_CATEGORIES`: Play has no chips or rows for those) and every other one on Play, so they stay on Play and in
  search as before. Search lists both shelves; Learn's "learning games by players" row links to it (See all).
- **Learn data** (server/learn.js): `SHELF_INFO` (each Learn game's subject and grades), `SUBJECTS` (chips, with the
  subject page each links to: maps has none), `LEARN_FUN` (Play's "From Learn: fun ones"), `BRAIN_BREAKS` (for the
  Classroom home, part 2), `CLASS_TOOLS` (Remi's Quiet Meadow: never Play's hero or featured row, still in search).
- **Heroes.** Jungle Cup (`"hero": true`) is Play's hero; Code Isle keeps its flag for Learn. Each page picks its hero
  within its own shelf. The hero is left out of the rails right under it (Featured, Popular, Top rated, New); its line
  is the first sentence of the description in the page's language (Jungle Cup's seed JSON has `l10n` for every
  language). Signed in, Play has no big Join door (Join is the 🎟️ in the top bar), so the hero's Play button is on the
  first screen at 360×640.
- **`/`**: Play for the signed out, guests, kids and the platform admin; everyone else gets a 302 to their first tab
  (`landingFor`, views/layout.js: student `/classes`, teacher `/teach`, school admin `/school`, grown-up `/family`),
  sent `Cache-Control: private, no-store`, with the query string kept (`?utm_source=`; a path language such as /es is
  not, as those pages have no language addresses). `/school` with one school opens its overview (setup checklist and
  Classes), People one tap away. Signed out it keeps its heading, doors, join door, subject chips and
  structured data. `auth.js homeFor` uses `landingFor` too (staff with a school to set up still go there first; the
  platform admin to `/admin`). **`/play`** is the Play page for everyone, never indexed (`/` is the page search
  engines see); grown-ups may open it (`GROWNUP_GET`), traffic counts it as `home`.
- **Play page** (routes/discover.js `playPage`): hero, Play genre chips (no Learning or Words) and a "👥 2 players" chip
  to the row, Favorites, Keep playing (`games.recentlyPlayed`), Featured, Two players, From Learn, the Build banner,
  Playing now, Friends, Popular, Top rated, New, My games and the genre rows: all on the Play shelf. No course row.
- **Learn tab** (`/learn`, routes/teachers.js): signed out it keeps the indexed hub (heading, lead, CollectionPage,
  every subject and age page, sitemap and hreflang unchanged); signed in a short "📚 Learn" heading. Filters are plain
  links (`?subject=`, `rel="nofollow"`) and a GET form (`?grade=`, `?how=solo|two|live`; `public/js/learn.js` submits
  the grade on change, the Show button works without it); a filtered view is noindex and names the subject page
  ("More about Math games →"). Then Courses (compact cards: the whole head opens the course, progress, the units behind
  a tap, one main button; "My courses" once a player has picked a band, "Courses" before), Live class games (the Oomba
  Live modes, while Live is on) and Learning games (each card "Math · Grades 1–5", course cards too; card buttons sit
  at the card's foot so a row lines up; on screens 1100px and wider the three courses sit side by side, no carousel):
  live first for staff and students in a class, learning games first for everyone else. Then learning games by
  players (signed in only: an indexed page never carries a child's name), the subject pages in chip order (a page
  whose name doesn't say its chip's says both: "Thinking: Chess and strategy games"), "Also on Oomba" (brain breaks,
  make a game: not Learn subjects), and the age pages and "for teachers and parents" for the signed out, staff and
  grown-ups only. The kids' join door ("Got a game code from your teacher?": not for staff or grown-ups, who have Join
  in the top bar) comes under the games signed out and ends the page for a signed-in kid or student. A school student
  starts on their roster grade (`rosterGrade`); "Any grade" is `?grade=any`, kept as they filter. The how-you-play chips
  wrap (never scroll the chosen one out of sight); learn.js scrolls the chosen subject chip into view. `/learn/<hub>`
  and `/learn/<age>` are unchanged and make Learn current. **Breadcrumbs** follow the tabs: Home › Learn › Math games
  (› a game) signed out, also in BreadcrumbList; signed in the trail starts at Learn (Home is another tab), and the
  Learn tab itself has none.
- **Staff on Learn** (`isSchoolStaff`, server-rendered only for them): Assign (`/teach/assign?game=`), Host live
  (`/live?mode=`, the existing host flow) and Try it on each card: one main button (Host live for a live mode, else
  Assign) and Try it as a smaller link. On courses "Assign to a class" (the course's own teacher page: `/teach/cs-quest`,
  `/teach/cyber-defenders`; Number Quest has no assign page yet, so only its guide) and "Teacher guide". Kids,
  students, grown-ups and guests see none of them. **`/teach/assign`** + **`POST /api/teach/assign-game`** (staff only,
  `lesson-new` rate limit): pick one of your classes (classes you teach, and those of schools you run) and a due date;
  the class gets a one-step lesson that plays the game (`L.createLesson` + `L.addStep` + `L.assign`, so `cleanStep`'s
  canView check and the class gate apply). Live-only modes are refused (they are hosted); assigning the same game to
  the same class twice is refused.
- **Bars** (`shellFor`): signed out Play · Learn · Build · Grown-ups · (Plans) · Sign in (top: Play · Learn · Build ·
  (Plans) · Parents · Teachers); kid Play · Learn · Build · Friends · (Plans) · Me; student Class · Play · Learn · Build
  · (Plans) · Me (Friends in the top bar and on Me; their friend badges count on Me); teacher Classroom · Learn · Play ·
  (Live) · (Plans) · Me; school admin School · Classroom · Learn · Play · (Plans) · Me (Live in the top bar); grown-up
  Family · Play · Learn · Build · (Plans) · Account; platform admin Play · Learn · Build · Friends · Schools · (Plans) ·
  Me. Search is the top bar's field (or round button) for everyone, never a tab. Live (`/live`) shows only while Oomba
  Live is on; the /live pages pass `active: 'live'` (Classroom where there is no Live link). Stories (flag) and Plans
  behave as before; the Join button as before.
- **Current tab:** home, play and search -> Play; learn (the Learn tab, subject and age pages, courses, a Learn game's
  page) -> Learn; classes -> Classroom for staff, Class for students, Schools for the platform admin. **Labels** with
  stand-ins (`tabKey`): `nav.play` -> `nav.games` -> `nav.home`, `nav.classroom` and `nav.class` -> `nav.classes`; all 13
  languages have the new words.
- **Child safety:** no prices on Play or Learn (only /plans has them); Assign and Host only for staff, checked again by
  the APIs; no chat or free text added; real names nowhere new.
- Tests: `tests/unit/shelves.test.js`, `nav-roles.test.js` (bars, `/` per role), `nav-doors.test.js`,
  `home-doors.test.js`; e2e `tests/e2e/play-learn.spec.js` (Play and Learn at 360/390/1280, light/dark, he; filters;
  staff buttons; no sideways scroll, nothing touching, 44px targets).

### Part 2: the Classroom tab and the Class tab
- **Classroom (`/teach`, teachers and school admins):** "Hello, {name}" (the staff member's own roster name: staff
  only, it is their own page) with "N classes · N answers waiting" and Host a live game; the tools row (Lesson library,
  Make a game; CS Quest and Cyber Defenders are under Teach with a course), school cards with the plan card, staff
  invites and plan asks stay. My
  classes: each class card shows what needs attention as chips (✋ requests, ✍️ answers to review, 📡 Live game now,
  linking the host to their room, 📅 the soonest open lesson due in the next 7 days) or "All caught up", with Open
  class, Assign a lesson (`/teach/lessons?school=&class=`) and Host a live game (`/live?class=`) in a row on a laptop;
  while the class's room is open the last one is "Open live game" (`/live/host/<sid>`) for its host and gone for a
  co-teacher, so nobody opens a second room. The class name is the card's title (tight under the school's name); the
  due lesson's title is cut short on one line with the date under it. + New class is a compact dashed tile at the top
  of its row (open, its form takes the whole row); the School tab (`/school/<slug>`) of a school's own admin has no
  back link (it is a first tab); the archived list follows. On phones the live modes and brain breaks are
  one sideways row each. Then Teach with a course (the three courses' staff pages), Live games for the whole class
  (`LIVE_GAMES` -> `/live?mode=`, only while the teacher may host), Brain breaks (`BRAIN_BREAKS` -> `/play/<slug>`),
  and links to everything students can play (`/play`) and Learn.
- **Class (`/classes`, school students):** one section per class (several: a picker of the classes first). Each has
  its live-game banner (`classLiveBanner`; the first keeps the ids `class-live*`, more get `-n`; `class-live.js` polls
  every `.class-live[data-class]`), the class card (opens the class page; the class name is the h1 with one class),
  To do (`P.toDoFor`: due chip, progress bar, "x of y done", "Next: <first step not done>", Start / Continue to the
  lesson) and Games from our class (up to 8; See all on the class page). "Done for today?" links Play and Learn;
  joining another class and the waiting list stay below. No classmates are listed.
- Tests: e2e `tests/e2e/play-learn-homes.spec.js` (teacher -> Classroom, student -> Class with the live banner, guest
  -> Play, grown-up -> Family on a billing-on server; both homes at 360/390/1280, light/dark, he).

## "Add your kids" (the step after sign-up and after paying)
The owner asked that parents can add their children during sign-up: make the child's account there, or link one the
child already has. `/family/add` (routes/family.js) is that step.
- **Where it shows:** a new grown-up lands on it after signing up, unless they picked a plan on /plans (then they pay
  first) or came from a grown-up page (`?next=`). It also shows after a successful family Checkout: the wait panel
  goes there, and `/family?checkout=…` or `?welcome=1` with the plan on redirects there. The old welcome panel on
  /family is gone, and the step says "Your … plan is on. Thank you!". It is also the Children panel's ➕ button on
  /family.
- **Two choices side by side** (links, `?how=make|link`, no script needed): "Make my child's account" is offered only
  while `F.madeOn` (PARENT_MADE_CHILDREN=1). It uses the same form, direct notice, "I've read this", guardian statement and
  no-consent sentence as /family/children/new, and posts to the same API behind the same step-up and limits. With the
  flag off, nothing about making an account shows and the code form is open straight away. "Link my child's existing
  account" uses the same code form and API as /family/link. Each form sends `then=add`, which only changes where the
  answer redirects (back to the step).
- **After a child is added:** the step lists the children added so far, showing display names only, to this grown-up.
  It offers "Add another child" while `maxChildrenFor` allows, and Done (→ /family). Before any child is added it offers
  "I'll do this later" (→ /family), and nothing asks again. Paying and adding a child stay separate: the step shows no
  prices or payment forms.

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

## Grown-ups can build

The owner asked for grown-ups (parents) to be builders too, sharing each game with just their family, just their
grown-up connections, or everyone. Every other fence around grown-up accounts stays.

- **Sharing levels for a grown-up** (`services/schools.js` `sharingOptions`): `private` ("Only me"), `family` (new: the
  grown-up and the children linked to the family they own), `friends` (shown to them as "My grown-up connections") and
  `public`. Never `class` or `school`. A kid's options don't change and a kid can never pick `family` (`publish()`
  refuses any level not offered). With family pages off (`familiesOn()` false) there is no new `family` choice, but a game already live or waiting at
  `family` keeps that level (`sharingOptions(owner, game)`), so its updates still reach the children who can play it and
  an admin approval of a waiting `family` review stays `family`.
- **Default for a new grown-up game: `family`** (`shareDefault`), or `private` while family pages are off.
- **Who sees a `family` game** (`services/games.js`, one rule for `canView` and `visibleWhere`): the owner, the admin and
  the children with a confirmed, live link to the owner's family. Not a pending request, not after an unlink, not
  another family's children, not the grown-up's connections. Play, embed, saves, scores, listings, search, similar,
  favourites and the chat share list all follow it. No migration column: `games.visibility` is text.
- **Moderation:** `family` is a group level like `class` and `school` (it reaches children who didn't opt in): a clean
  scan or an existing approval goes live at once, a flagged version waits for a person. Approvals are stored by name, so
  `WIDTH` became `{ family: 1, class: 2, school: 3, public: 4 }`. Connections (`friends`) go live at once, as kids'
  friends games do (both sides are adults who chose it). `public` is exactly the kids' pipeline (scan, model review, the
  admin queue). The admin queue shows a grown-up owner as plain text with a "Grown-up builder" tag (no `/u/` link).
- **Connections are adults only.** They reuse the `friends` table and friend codes: grown-ups now get a code
  (migration `0035_grownup_builder` backfills one for every grown-up and deletes any mixed adult-kid row).
  `services/friends.js` refuses a mixed pair in both directions with the same "not found" as a wrong code (so neither
  side learns the other exists) and `accept()` refuses a mixed pending row. Grown-ups manage them on
  `/family/connections` (code, add by code, requests, list, Remove), with no chat, profile links or pictures. Chat still
  refuses grown-ups on either side; `/friends`, `/chat` and `/u/` stay 404 for them.
- **No profile, no contact:** `/u/<grown-up>` stays a 404. A grown-up's game page shows their display name and a
  "Grown-up builder" tag with no link, for every viewer, and nothing about their children. Grown-ups stay out of builder
  search and leaderboards. Like, Rate and stored scores stay off for grown-up viewers.
- **A family game that widens never names the children.** Scores and likes the owner's linked children left while a game
  was `family` stay stored, but `leaderboard(gameId, limit, viewer)` and `favorites()` leave the owner's own linked
  children out for every viewer outside that family (not the owner, not one of those children, not an admin), at every
  level. Leaving them out (instead of deleting) also covers later narrow-then-widen changes.
- **Toasts and links:** sharing at `friends` tells a grown-up "Shared with your grown-up connections!"
  (`publish.liveConnections`). The limit card's /plans link shows only while /plans is open (family pages on) and their
  own family plan doesn't already cover them (`grownup.seePlans`). The share sheet opens a draft on `shareDefault` and a
  game shared before (suspended, rejected) on its stored level.
- **Access:** a new `requireBuilder` (any real account) guards the Studio routes and the friend-code APIs;
  `requireAccount` (kids only) still guards chat and the /friends page. The fence (`routes/family.js`) has separate
  lists for building (GET, POST and DELETE), so the grown-up page list is unchanged. The "Builder is for kids" page is
  gone; `?next=/build` now lands on `/build`. Grown-ups' tabs: Family · Build · Games · (Plans) · Account (a Family
  badge counts connection requests).
- **Quota:** `builder/usage.js` `familyOf` covers the family's owner while its plan is entitled (Basic too), outside
  `maxChildren`, from the same `family:<id>` extras. Without a plan a grown-up has the free daily messages like anyone.
  No price outside /plans: a grown-up's limit card links to /plans with no amount.
- **/family "Your games":** up to 5 of their games with status, Build, connections (with requests waiting) and their own
  Builder use (yesterday and this month up to yesterday, never today). This private page is the only place a
  grown-up's games and children appear together.
- **Credit name (owner call):** a public grown-up game shows the display name, which for grown-ups starts as their
  username (they may pick a real name at sign-up). Switching the credit to `@username` is a one-line change if wanted.
- **Legal:** Terms (`info.terms.accounts.li9`) and Privacy (`info.privacy.grownups.p2`) now say grown-ups may build,
  their games get the same review, connections are adults only and children's names and family links are never shown.
- Tests: `tests/unit/grownup-builder.test.js` (and the updated family, nav, class-sharing tests); e2e
  `tests/e2e/grownup-builder.spec.js`, `tests/e2e/grownup-connections.spec.js`.

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

## Oomba Live: a live classroom platform (server, part 1)

The owner asked for "live classroom mode" like Kahoot or Blooket, with players seeing each other in 3D worlds, and
stressed that it is **a platform teachers reuse with their own games**, not one game. Full design: the Oomba Live
design notes (`.claude/work/live-out/design-final.md`); protocol and page hooks: docs/live-protocol.md; safety:
docs/safety.md §12; legal: docs/legal-review.md item 41.

- **Platform, not a game.** A host opens a session for any live-ready game: official games, the built-in modes
  (Quest Race, Question Battle, themselves kit games), the host's own Builder games and games shared with their
  classes. The platform owns codes, lobby, roster, seats and reconnects, host controls, the clock, server-timed
  questions, leaderboards, results and the gradebook. Games plug in through one kit API (`Oomba.live`, part 2).
- **Single process, in memory.** Sessions live in `classlive-sessions.js`; only a summary is saved when one ends
  (`live_runs`, and `live_run_scores` for a teacher's own class). The app is single-instance already; scaling sideways
  would need routing by session id (sticky by `sid`). A restart ends every session cleanly after saving it.
- **One upgrade listener** (`services/upgrade.js`) routes by path: `/api/studio/:id/listen` (live mic) and
  `/api/live/ws`. Unknown paths 404 with a status-and-reason log line.
- **`/join` is shared.** Live codes are 7 digits; class codes stay 6 characters, so the length tells them apart. The
  live router is mounted before the Google routes and hands class codes on unchanged. With `LIVE_CLASSROOM=0` only the
  live part goes away.
- **Audiences** (`class`, `family`, `open`) decide who may join and which games may run; names are account names only
  in a teacher's own class room. Grown-up open rooms: 30 players at most.
- **Performance.** One snapshot per session per tick (10 Hz, 5 Hz above 40 movers), serialised once; slow sockets skip
  a tick (backpressure at 64 KB); no positions in quiz phases; caps `LIVE_MAX_SESSIONS` and `LIVE_MAX_SEATS`.
- **No column for live-readiness.** Versions never change, so `classlive-check.liveCheck(versionId)` is cached in
  memory; nothing to backfill.
- **The kit pack** (`live`, part 2) stays thin and forward-compatible; the wire protocol lives in the SDK and the
  server, so it can be fixed without changing pinned pack bytes. `kit/SHIPPED.json` gains the pack only after the e2e
  suite passes and the owner signs off.

## Oomba Live, part 2: the kit API, pages, reference games

- **`Oomba.live` is a new pack inside kit 1.1.0, not a 1.2.0.** The owner asked for a new minor version only if 1.1.0's
  files were locked: they are, but `scripts/build-kit.js --packs` is the sanctioned way to add a pack beside a locked
  version (the core and the eight locked packs are checked byte for byte; 1.0.0 untouched). A 1.2.0 would have needed a
  core size-cap raise (72 bytes free) and a version bump across every template, test and saved-game path, for no
  change in the core. Recorded as owner question 1; the pack goes into `kit/SHIPPED.json` with their sign-off.
- **Frame and page talk over a `MessagePort`** made by the SDK before game code runs (docs/sdk.md "Live messages"); the
  page re-checks every message, and a second frame load tears the frame down (a navigated page never has the port).
- **Live-ready check, lint and Builder.** The rules live in `classlive-lint.js` (pure), shared by hosting
  (`classlive-check.js`, cached per version), the scanner (`report.live` for games that load the pack) and the
  Builder's lint notes. The Builder gets `LIVE RULES` (the `<!-- builder:live -->` part of docs/kit-api.md) only when
  asked for a live class game or when the game already loads the pack, like the 3D rules, so the cached prefix stays
  the same for everyone else. The Studio's "Make it a live class game" sends one fixed, translated message (it names
  "Oomba Live" in every language); the mock Builder adds the pack tag and a small live block to kit games.
- **Reference games are kit games.** Quest Race (3D island, logic and 2D in a classic script, 3D in the module) and
  Question Battle (2D only, so it runs on anything; its podium uses portraits rather than 3D rigs) are seed games with
  the slugs the built-in modes use. Quest Race: a right answer in the first third of the time is a full step, so a
  perfect, quick player reaches the flag on the last question.
- **Hero of Sunvale is the proof that an existing game adapts:** about 60 lines behind `Oomba.live.active` (presence,
  a light blocky hero per player through `crowd({make})`, missions as `item` + a `quest` event, the host's projector a
  camera tour with the class's village progress). Devices without 3D get the platform's Watch map (Hero has no 2D path).
- **The platform lobby** (`server/live/lobby.html`) is a small 3D meadow with a 2D fallback, for games that don't
  declare `lobby: true`.

## Oomba Live, part 3: teams and teacher tools

The owner asked: "Make sure the teacher can assign teams and think of any other things that the teacher may want to
do." The design (reviewed by an engineer, a classroom teacher with 30 children and one projector, and a child-safety
reviewer) is `.claude/work/teams-out/design-final.md`; what shipped and why:

- **Teams are platform-owned, from 8 fixed presets.** Colour (Okabe-Ito colour-blind-safe set plus a dark indigo),
  ink (text on the colour, ≥ 4.5:1, unit-tested; the dark ink became `#121528` because `#1D2340` was 4.49:1 on Green
  Frogs and 3.97:1 on Red Foxes), a drawn shape and an animal icon, and a name translated whole (adjectives agree).
  Colour is never the only cue. No typed team names, not even for teachers: the text filter can't catch an in-joke
  about a classmate on a projector ("safest wins"). The single source is `classlive-teams.js` `PRESETS`; pages get it
  in their JSON, frames in `INIT.live.teamPresets`. Teams work with every live game; the projector's team board does
  not depend on the game.
- **Assignment.** On balances everyone at once; Balance moves the fewest players (unassigned first, then the most
  recently joined from the largest teams); Shuffle deals random equal teams; the host moves anyone any time (to no
  team only in the lobby); players may choose **in the lobby only** (a cap of ceil(players / n) + 1, and not when
  locked), so nobody hops to the winning team mid-game. Placement: a signed-in student's own team on a rejoin (it
  beats "smallest", so a restarted tablet lands back with its table), then the plan (saved class teams or a rematch),
  then the smallest team by present members (empty teams first, ties to the lower score). `tms` carries the whole
  membership, so a shuffle of 30 is one message, not 30 `pu`.
- **Banked scoring.** Each team keeps sum, average and bonus. Quiz modes take each seat's team when a question opens
  (`teamAt`), so a move counts from the next question and a teacher can't move answers between teams. Average =
  the team's points this question / participants (members at the open that answered or are connected at the reveal),
  defined for a phone that drops mid-question; game modes divide a rise by connected members. **Average is the
  default** (fair for uneven teams); results show both. Empty teams are unranked; teams that never had a member are
  left out of the results. Team scores travel only in `ts`, sent before `rv`, with the leaderboard and before the end,
  so a game's reveal event already has them.
- **A class's teams are prepared ahead and reused.** The class page has "Teams for live games"; a class run with teams
  saves its final teams; "Use last teams" in a class lobby loads them and tells the host if absences made them uneven.
  The end of a run *merges*: students who played keep the team they ended on, students who did not keep their saved
  team, so a small-group or "missed questions" run never wipes the class's teams. A run with a different team count
  replaces the saved teams only if it had at least as many students; otherwise they are left alone. Saved runs keep
  the whole setup (`n`, `presets`), so "Play again with these teams" rebuilds even teams nobody played on.
- **Team totals follow the members' scores.** Game-reported scores may go down (a new game resets a game's points): a
  drop takes back what that seat banked to its current team, and only points above what is still counted are banked
  again, so nothing is counted twice. Before anyone has scored, in the lobby, teams have no rank (shown as –).
- **An unlocked pack rebuilt in place keeps old games working.** The live pack is not in `kit/SHIPPED.json`, but Builder
  games store `{{PACK_TAG:live}}` as a literal hash. Its older hashes go in `KIT_PACKS_RETIRED` (server/services/kit.js):
  the scanner and the live-ready check accept them and `upgradePackPins()` rewrites them to the current hash whenever a
  game is served (frame.js), so no stored game version needs a migration.
- **Settings extend the existing `s.settings`** (`maxPlayers`, `locked`, `autoLock`): late join *is* `!autoLock`, so
  lock, unlock and the cap keep one source of truth. Time per question, number of questions, shuffled questions and
  answers, accuracy-only points (1,000 per right answer, no streak), the players' leaderboard (all / top 5 / off: off
  also hides ranks and team ranks on devices), late join, names per view, projector sound, emotes. Saved at start as
  the host's defaults (`live_prefs`); the landing is filled in from them. The practice question was cut (it breaks
  question numbering in every game).
- **Two host connections, not a Map.** `s.host.conn` stays the projector everywhere it was used; `s.dash` is one
  dashboard connection (a newer one replaces it, 4409). The host is gone only when both are; the dashboard is never
  waited for at loading. Dashboard-only messages go through `toDash`.
- **The dashboard is phone-first** because many teachers mirror their laptop on the projector. Its QR (on the
  projector) holds only the session id; the page needs the host's sign-in. It hides the answer and "needs help" until
  tapped. Needs help: quiz: ≥ 3 answered and under half right, 2 wrong in a row, or 2 missed in a row while connected;
  game modes: accuracy only (idle time is normal in games).
- **Names per view.** Only name-carrying messages (`wel`, `pj`, `pu`, `ros`) are built per view, once per broadcast:
  players, projector, dashboard. "Hidden" sends `''` to the projector (and its frame), nicknames to players, real names
  to the dashboard in a class room.
- **During play:** eyes up (pauses play; off resumes only a pause it made), 10 fixed messages, +10/+20/+30 s (points
  still use the question's own time, so adding time never lowers points), Reveal now, bonus points (+100, positive
  reasons; a player's bonus is private, a team's is public, never in the gradebook), a new nickname, mute emotes.
- **Support is private and never reaches game code.** Builder games are user code: a game could broadcast "has extra
  time" through its own events and reveal an IEP/504 plan. So the page applies read aloud and Simple view, the server
  applies extra time, and nothing about support is relayed into frames. Extra time is quiz modes only (a seat gets its
  own `q` with its own `secs`; the broadcast `q` carries nothing per seat; the reveal waits for the longest limit
  among connected unanswered seats). Saving support per class is behind `LIVE_SAVE_SUPPORT` (legal-review item 42).
- **The end.** The projector holds the podium 6 s, then goes to the results as before (the e2e waits still hold). The
  results page is split: a class-safe part (team podium and table, hardest questions, question review with answer
  bars; no student names) and "Student details", closed (marks, bonus, needs help, CSV). `live_runs.items` now keeps
  the questions as asked (host-written text, choices, answer, time, counts), which also makes "play the missed
  questions again" possible for saved runs.
- **Play again with the same players.** `endSession` still forgets bans, accounts and nickname picks at once; a small
  snapshot (`s.again`: seat, account, nickname, avatar, team; the bans) is kept while the players' sockets linger
  (`hooks.lingerMs`, 2 minutes; 0 in unit tests), then wiped with the `bye`. The rematch re-runs every join check and
  sends each player its own `again` token (never into a frame). After the linger, a saved class run can still start
  "Play again with these teams" (the plan comes from `live_run_scores.team`).
- **Homework from a set** is a new lesson step kind `quiz` (the existing `question` kind is free text): a snapshot of
  the set's items, answers checked by the server once each, marks kept, score = % right in the gradebook. Behind
  `LIVE_HOMEWORK` (off); the rest ships without it.
- **Cut or deferred:** co-host (built in part 4, below), typed team names, team talk, reduced answer choices, machine translation, power-ups, random student picker,
  auto-advance, Sheets export, showing free-text responses, support in frames.

### Part 3, the pages and games (client)
- **One teams board for three places.** The projector's Teams sheet, the dashboard's Teams tab and the class teams
  editor share `live-teams-ui.js`: drag (pointer events, so whiteboards and touch work) and select-then-move (keyboard,
  switch, tap) are both always there, and keyboard focus survives the server's `tms` redraw.
- **Message templates go to pages as written.** Page scripts get the raw translated messages (ICU plurals intact) and
  format them in the page's language (`fill()` in `live-common.js`), so "1 player / 2 players" is right in every locale.
- **A player's bonus never reaches the class's screen.** The projector page shows team bonuses only and does not pass a
  player's `bn` into its frame (a game there could show it). The dashboard shows both.
- **The right answer on the dashboard** comes with `dq` (dashboard only) and stays behind "Show the answer".
- **Team presets reach games through the SDK** (`BRB.live.init.teamPresets`, strings only), in the frame's language; the
  pack keeps no copy. A game without presets shows no teams rather than unnamed ones.
- **Games:** Question Battle (team bands in the lobby, a team board between questions on the projector, "Blue Whales:
  place 2" on devices, a team podium), Quest Race (team rings and nameplate bands, team progress bars on the projector,
  podium steps in the top teams' colours with each team's best runner), Hero of Sunvale (team meters on the projector,
  "Your team finished a mission!"), and the platform lobby (a team banner row). Every team cue has a shape and a name.
- **Homework (flag off):** "Assign as homework" is a small form on the results page (class, optional due date); the
  student's quiz step is a platform page (one question at a time, Read aloud, no timer).

## Oomba Live, part 4: co-hosts

Owner request: "Provide co-host capabilities." Design: `.claude/work/cohost-out/design.md` (not shipped). Server:
`classlive-access.js` (who may co-host), `classlive-sessions.js` (the model, actors, conflicts, the handoff),
`classlive-cohost.js` (invites, answers, removal, Make host), `routes/live.js`, `views/live.js`; client
`live-cohost.js`, `live-dash.js`, `live-host.js`. Protocol: docs/live-protocol.md "Part 4". Legal: item 43.

- **D1 Rooms.** Class and family rooms only. Open rooms have no co-hosts (no button; the API answers 400
  `cohostRoom`): their other adults would be unknown, self-declared accounts.
- **D2 Who, in a class room.** Active staff (`school_members.role` teacher or admin) of the class's school; never a
  student of the class, a guest, a banned account, or a platform admin who isn't a member of the school; never someone
  from another school. Decided by school membership, not `account_type`. The host picks from the school's staff list a
  class teacher already sees under "Add a teacher": no search, no free text, no new names.
- **D3 Who, in a family room.** Another grown-up of the owner's family. Today a family has exactly one grown-up
  (`families.owner_id` is unique), so the list is empty and the panel says so. One seam (`A.hooks.familyGrownups`)
  lets a future "second grown-up in a family" feature turn it on. Grown-up connections (friend codes) are not family
  ("nothing about anyone's children").
- **D4 Tiers.** `full` (teaches the class: the same rule that gives the host account names, saved runs and support) or
  `limited` (everyone else: same-school staff not on the class, admins who don't teach it, family co-hosts). The tier
  belongs to the person: a limited co-host who becomes host stays limited. It is the person's access now, never frozen
  at accept: `retier` recomputes it in the 30-second sweep, on every controller hello, before a support change, at a
  handoff or "Make host", and for the results page at the end (and again when it is viewed); a changed tier gets a
  fresh `wel`. Support changes (`act a: 'acc'`) reach full-tier dashboards only, never the projector page's `wel`.
- **D5 What limited misses.** `dp` (progress, needs help), `sup` and support changes (`h acc` → `nak notAllowed`, even
  for a limited host), `dq.answered` and `dq.extra` (who answered; the extra-time count reveals support), the account
  names of the dashboard (they get the players' view), the `names: 'names'` setting, Student details and the CSV on
  the results page, and saved runs (which stay with the class's teachers).
- **D6 Adult names stay with adults.** `ch` (who runs the game) and `act` (the activity line) go to controller
  connections only, are PRIVATE in `live-common.js` (never into a frame), and never to players. The projector page
  shows no activity line; its Co-hosts dialog opens behind a gate ("Grown-ups' names show here. Check the class can't
  see your screen.") and hides the names again when closed. A co-host's End confirm on the projector names nobody.
- **D7 One projector slot.** Two host frames would fight over `st`/`ev`. The host always takes the projector (the old
  holder gets `bye replaced`); a co-host takes it only when it is empty (else `bye projectorBusy`). Frame tokens carry
  the holder (`r: 'h'|'c'`).
- **D8 Remembered settings.** Only the host's own Start saves `live_prefs`, to their own profile. A co-host's Start and
  any `cf` save nothing.
- **D9 End.** A co-host may end the game after a confirm; the message must carry `sure: 1` (the server ignores a
  co-host `end` without it).
- **D10 Handoff.** When the host has no connection (no dashboard, not holding the projector) for `LIVE_HANDOFF_SECS`
  (default 120 s), the longest-standing co-host who is connected, still eligible and not the host of another open game
  becomes host. Co-hosts keep every game control meanwhile. With no co-hosts nothing changes: the session ends 10 minutes
  after the last controller leaves (with no co-hosts, the host: the rule before part 4).
- **D11 The former host comes back** as a co-host (their old token still works: their entry keeps the old nonce). The
  host's "Make host" hands it back (confirm).
- **D12 Rematch / play again** carries no co-hosts: every grant is fresh and visible.
- **D13 Flag.** `LIVE_COHOST` (on by default, like `LIVE_TEAMS`). `0` hides every button, the APIs and the invite
  page answer 404, a co-host token is refused; deleting logged data works whatever the flag.
- **D14 Invites.** Pending invites count towards the cap of 3, expire after 15 minutes or with the session, and reach the
  invitee only inside Oomba: the `/live` page, `GET /api/live/mine`, the `/live/cohost/:sid` link (a QR in the host's
  panel; the page is the same 404 as an unknown session for anyone not invited). No email, no push, nothing typed.
- **D15 Kit.** No change: co-host is platform-side. Frames see a co-host's projector as `role: 'host'` as today; no pin
  re-stamp.
- **Owner vs host.** `s.owner` (the creator) never changes: `live_runs.host_id`, the class-run check in `R.save` (a
  class run is saved with scores if the owner teaches the class), the family check on joins, saved teams' `saved_by`,
  reports. `s.host` is the current host; `hostOpen` follows it.
- **Authority per message.** Each controller socket carries only its user id; `actorOf` looks up role and tier per
  message, so a removal stops a message already in flight and a promotion needs no reconnect. Rate buckets are per
  connection. Every controller message and co-host HTTP call runs to the end with no `await`: the order applied is the
  order of `act.i`.
- **Conflicts.** A toggle already in that state is refused with `nak already` (who did it, only when their change is
  what the state is now: an automatic lock or an eyes-up pause names nobody stale). Another controller's change to a
  family this action would touch (pause/resume, lock/unlock, eyes) within `conflictMs` (1 s) is refused with `nak
  conflict`, so two adults can't make it flap; anyone may undo their own at once. Eyes up and resume move each other
  (eyes up pauses, resume lowers eyes), so each records and checks both families. A second adult's +time on the same
  question within 1 s is refused (`nak already`): two presses don't add twice. Messages (3 s) and bonus points (1 s)
  keep one gap for the whole session (the class hears one at a time); the refused adult is told (`nak tooSoon` with
  who, or `wait` for their own repeat), never silently dropped. `next`/`skip` keep the `seq` guard. `lock`/`unlock`
  became idempotent (no `lk` when nothing changed).
- **Audit.** Joins, leaves, removals, handoffs and key actions (not `next` or `say`) are kept with the run in
  `live_run_log` (migration `0041_live_cohost`), only for runs that had a co-host; students are named only in class
  runs. Lifecycle events also go to `audit_log` at once, so a game that never started is on record. "Who ran this
  game" on the saved results page (closed). Retention follows `live_runs`; a deleted account shows as "A former
  co-host".
- **Owner questions (defaults apply):** Q1 family co-hosting needs a "second grown-up in a family" feature (own change,
  own legal review); Q2 school admins who don't teach the class get controls only (changed on the owner's request: school admins get the full tier, like a teacher of the class); Q3 open rooms get no co-hosts; Q4
  the 2-minute grace.

## Game data packs (/vendor/data/)

A game file stays under 2 MB, but some official games carry a lot of words in many languages (Atlas Quest has about 1,200 culture questions, in 13 languages). Packing every language into the game file would mean every player downloads all of them. Instead, a game can keep reviewed data in `public/vendor/data/<game>/<version>/` (for example, one file per language) and load only the one it needs at run time: a script element with `integrity` and `crossorigin="anonymous"`, so the browser checks the exact bytes.

- **The frame CSP** allows `<origin>/vendor/data/` in `script-src`, next to Three.js and the Oomba Kit. The files are in the repository and reviewed like code. A user-made game can't add files there.
- **Version folders never change** once published, because `/vendor` is served immutable with a one-year cache. New content goes in a new version folder. The game names its version and holds the `sha384` of each file.
- **The game still works without a pack**, e.g. in English, if the file can't load.
- The screenshot worker and `scripts/covers.js` serve these files from disk, like the other `/vendor` folders.

## Online matches (play a friend on another device)

Castle Clash's "Play online": invite a friend or family member, or share a match code. Built as its own small
feature rather than on Oomba Live, because Live rooms are hosted by grown-ups only (teachers, parents) and are
built for classes; a match is two equal players, either of whom may be a kid.
- Transport: HTTP long-poll (`GET /api/match/:id/wait?after=&k=`, 20 s) and `POST /api/match/:id/send`. Turn-based
  games need nothing faster, it works behind every proxy, and needs no second socket protocol. The page relays; the
  frame has no network (docs/sdk.md "Online matches").
- The server does not know chess: it relays numbered events, and each side's game checks moves with its own rules.
  A reloaded page gets the whole history and the game replays it.
- In memory only (like live sessions): matches are short; a deploy ends the ones in progress and the page says so.
- Allowlisted official games only (`match.GAMES`), so a game made in the Builder can never turn the relay into
  a message channel, even though the data is numbers only. Safety rules: docs/safety.md §13.


## Live quizzes back, and question sets teachers fully control (November 2026)

Quest Race and Question Battle are offered again on /live (the owner's call; #107 had hidden them). The seed clears
the `retired` flag it had set. Question sets are the teacher's own content: any subject, any level, up to 100
questions, 2-4 answers or true/false, 5 seconds to 2 minutes a question, pasted from a spreadsheet or a document,
drafted by AI from a topic and a grade (services/set-ai.js; questions go into the editor and are only saved, through the
usual text checks, when the teacher saves), and copied from a colleague's shared set. A teacher's own sets come first in
the live picker; the starters come last. Teachers can also build their own quiz games with the Builder (`quiz: true`),
which play live with any of their sets. Landing page: /teachers/live.

## AI voices (text to speech), server part (November 2026)

Official games, lesson quiz steps and Oomba Live can read **site-, game- and teacher-written text** aloud with a hosted
voice (OpenAI's speech API) instead of the device's voice. Design and the client part: docs/tts-design.md. Legal:
docs/legal-review.md item 44.
- **Off by default, two switches.** `TTS_ENABLED=1` and a key (`TTS_API_KEY`; `STT_API_KEY` only when both providers
  are openai) turn it on for the site; then each locale stays off until the admin switches it on at `/admin/voices`
  (setting `tts.voices`, audited), so the owner listens first and the existing e2e tests are unaffected. `TTS_LOCALES`
  is the ceiling. Off, or any refusal, means the device voice is used as before; pages never show an error.
- **Shaped like speech to text** (`services/stt.js`): `services/tts.js` has provider adapters (`openai`, and `mock`
  that answers a real silent MP3 so headless Chromium can play it; refused in production), config in `TTS_*`, cost in
  the AI budget (`tts:<provider>`), usage in its own table.
- **What may be spoken is chosen by the server, not the page.** `POST /api/tts` takes a context: `game` (a 2-hour token
  the play page mints only for official seed games, bound to the player; Builder games always use the device voice),
  `live` (the question open now, by number; never one still to come; seat or host token), `lesson` (a quiz step's
  question by number, behind the quiz API's access check). Backstops: rude words, personal info, link codes, the
  player's own name or username, more than `TTS_MAX_CHARS` (600).
- **One line, made once.** Audio is cached on disk under the data folder, keyed by sha256 of provider, model, voice,
  instructions/speed, locale, rate bucket and text; requests in flight share one provider call (a class of 30 on one
  question makes one). Least recently used lines go when the cache passes `TTS_CACHE_MB`; warm-up and admin samples are
  pinned. `GET /tts/<hash>.mp3` is same-origin only and immutable.
- **Limits:** 120 requests a minute per person; new audio `TTS_PER_MINUTE` (20) a minute per person and 200 per address
  in 10 minutes; `TTS_DAILY_CHARS` (300,000) a day site-wide; the AI budget.
- **Voices:** six roles a game asks for (narrator, friendly, bright, deep, wise, grumpy), never a provider voice; the
  narrator is chosen per locale, the others shared. gpt-4o-mini-tts gets kid-friendly reading instructions with an
  accent hint per locale; zh-Hant is read as Taiwanese Mandarin, never Cantonese (like the SDK's device-voice choice).
  tts-1 / tts-1-hd get a speed instead.
- **Warm-up** (`services/tts-lines.js`): Hero of Sunvale's spoken lines are read from the repository file's I18N block
  (node:vm, empty context, 2 s limit; never the database copy), generated two at a time in the background, with a cost
  estimate first; it stops at the daily characters or the AI budget.
- **Privacy:** no text, user id or address is stored or logged (a short hash, sizes, timings). Requests to OpenAI come
  from our server. The provider facts (URL, fields, models, voices, price) are from memory and were not checked in the
  sandbox: check them before turning it on.

## AI voices, client part (November 2026)

The pages and games now use the server voices (docs/tts-design.md, docs/sdk.md "AI voices"). Still off until the owner
switches it on, then per language at `/admin/voices`.
- **Games:** behind `BRB.speak` in the SDK (not the frozen kit: its `say()` calls `BRB.speak`, so kit games such as
  Atlas Quest get it unchanged). The play page fetches for the frame; 4 s without audio, a refusal or audio that won't
  play means the device's voice for that line. `onend` now always comes once after `speak()` returned `true`.
  An official game's own `speechSynthesis.speak` is routed the same way (none of today's seed games does that on the
  site; Builder games never get AI voices, so a kid's own words are never sent).
- **Hero of Sunvale** reads its conversation cards and cut-scene captions with a voice role per speaker (its
  `VOICES` block: Granny and the Queen wise, Bo and the Chief deep, Snarlwick grumpy…), prefetches each card, stops the
  voice when the card moves on, and keeps its beeps when AI voices are off. Its Sound button silences the voices too.
- **Oomba Live:** the player's Read button and a new **Read question** button on the projector (shown while a question
  is open and the projector's Sound is on) ask for the open question by number. The teacher's new live setting
  **Voices for reading aloud** (AI voices / each device's own voice) applies to both. Lesson quiz steps do the same with
  the device choice.
- **Kids choose:** a 🔊 Voices button on the play page (only when the game has AI voices): AI voices or this device's
  voice, kept on the device; Data Saver means the device's voice until the kid picks AI voices.
- **Disclosure** (OpenAI's usage policy: say the voice is AI-made): the Voices sheet, the live setting's hint, a note
  under Read on the player's page and in lesson quizzes, the parents page (`info.parents.ai.p4`) and the privacy page
  (`info.privacy.children.p6`), in all 13 languages (en-GB uses the English). `LEGAL_UPDATED` is 2026-11-01.
- **Quiz text backstop:** a teacher's maths question read with its answer letters ("2 + 3? A: 5. B: 4…") looked like a
  phone number and a family link code, so for `live`/`lesson` (text looked up by number) those two checks are skipped;
  rude words, emails and links still refuse it.

### AI voices: review fixes (November 2026)
- **Only a game's own words, checked on the server.** `ctx:'game'` text must be one of the game's spoken lines in that
  language (`tts-lines.allowedLine`: Hero's I18N block read from the repository file, memoised per file time; a line
  with `{placeholders}` matches only with numbers in their place). Anything else is `422 filtered` and the device's
  voice reads it. The role comes from the line, not the page, and the game picks it by the same rule
  (`voiceRole(key)` in Hero's `VOICES` block = `roleOf`): mg.* and d.gate.open bright, say.guard* deep, say.* friendly,
  sw.* grumpy, cinder.* deep, hint.* the narrator. So warm-up audio is the audio played, and `/tts/<hash>.mp3` can
  only ever hold our own lines.
- **Only games written for it.** AI voices are for official games listed in `tts-lines.GAMES` (Hero of Sunvale today).
  shark-plank (a kid types the secret word in two-player mode), word-hunt and word-peek keep the device's voice and get
  no Voices button. A game added later must list its spoken keys, and speak anything a kid typed with `device:true`.
- **TTS's own share of the AI budget.** Unset `TTS_DAILY_CHARS` now means about 20% of `AI_DAILY_BUDGET_USD` at
  `TTS_USD_PER_1K_CHARS` (66,666 characters at $5 and $0.015), and new audio stops once the free pool has spent 80% of
  its daily or monthly budget, so voices never rest the Builder, picture checks or reviews. Per person (an account, or
  a seat in Oomba Live) `TTS_USER_DAILY_CHARS` (5,000) and per address `TTS_IP_DAILY_CHARS` (30,000) new characters a
  day, counted in memory under a salted hash (never stored). Live and lesson questions are read in the session's /
  page's language only (the posted `lang` is ignored), and live requests are limited per seat, not per school address.
- **iPhone / iPad:** `readAloud` plays a silent clip (and a silent device utterance) inside the tap before fetching,
  and `public/js/tts.js` does the same once on the page's first tap, so the automatic read of each new question can
  play. The SDK's unlock keeps listening until a play() in a gesture actually worked, and plays a refused AI line on
  the next tap. The device fallback has a watchdog (4 s + 120 ms a character) so a device that never says "ended"
  can't stall the queue.
- **The line on screen first:** Hero speaks a card's line before prefetching the rest; the page fetcher runs lines to
  speak now before prefetches (one prefetch at a time), and prefetches pause for a minute after a `fast` answer.
- **Disclosure everywhere a voice is heard:** the play bar button now says **AI voices**; the first AI line on a
  device shows a toast (`js.play.voicesNote`, once, `localStorage['oomba:voices-told']`); Hero's settings screen says
  the voices are AI-made when they are on (`set.aiVoices`, 12 game languages + en-GB fallback); the projector shows the
  AI note under **Read question**.
- **With TTS off nothing changes:** the projector's Read question button shows only when AI voices are on for the
  site (`D.tts`); the SDK's queued lines with no voice fire `onend` only for its own AI fallback items. Sound off or
  Voices → device on the projector (and Voices → device for players) stops a question being read. The teacher's
  Voices field shows only for quiz sessions. zh-Hant device voices prefer zh-TW, then zh-CN, never Cantonese first.
- **Admin page on phones:** small ▶ buttons, the sample sentence readable (not a header style), the language column
  sticky, the narrator's ▶ marked, and under 600 px one ▶ per row that plays the narrator chosen there.

### AI voices: the Number Quest placement, and spoken-text hygiene (November 2026)

Greg live-testing the deployed Sorting Game (2026-11-05) found its Listen narration on the device voice
while the AI voice worked elsewhere on the same build. Root cause: the placement page called `readAloud`
with text and no AI context at all, and no placement context existed on the server — the page could
never reach the AI voices. (He also found the narration reading a counting question's star row aloud as
repeated "star".)
- **New context `placement` (`POST /api/tts { ctx:'placement', runId }`).** Placement items are generated
  (252 templates, tens of thousands of items), so per-line registration cannot cover them; instead the
  server voices **the item it itself is serving**: `number-quest-placement.currentSpoken(user, runId)`
  regenerates the run's current item from its stored template and seed — the same regeneration that
  grades the answer — and returns its `spokenPrompt`. The page sends no text (any it sends is ignored,
  as in ctx `course`); only the run's own student, only while the run is active; test-out runs share the
  shape. Read in English with **Tally's voice** — Fraction Factory's registered role (`friendly`) — since
  Tally hosts the game. The usual guards still apply: per-locale switch at /admin/voices, rate limits,
  generation quotas, the AI budget; identical items share one cached MP3 site-wide. This does **not**
  open voicing of arbitrary client text: the reference (a run id) names server state, not words.
- **Spoken text never includes emoji or pictographs.** `tts.spokenText()` strips them (plus the
  variation selector, keycap marks, flag pairs and orphaned joiners), and `plan()` — the one path
  every context's audio is made through — is built from it, cache keys included. `tidy()` deliberately
  does not strip: the line matchers compare with it, and a registered line with emoji added stays a
  different, refused line. The same rule sits in the shared client paths — `deviceSpeak` in
  `public/js/tts.js` and the SDK's `speak()`/`routeUtterance()` in `public/sdk/brb-sdk.js` — so a
  device-voice fallback reads the same words the AI voice would. A keycap digit keeps its digit
  ("1️⃣" speaks "1"); maths symbols (×, ÷, →) are not pictographs and survive.

## Brain Board, and fun games kept out of class rooms (November 2026)

A third built-in live quiz mode, in the category-board genre, with its own name and look (a night-sky board, Lucky
Stars): the projector shows categories × 5 tiles worth 100-500; the host (or the fastest right answer, when "players
pick" is on) picks a tile and everyone answers it on their device. No wagers and nothing typed: a Lucky Star simply
doubles the points, and wrong answers never cost points (kids). The server owns the board as shared state, so a
reconnecting phone or projector always sees the same board (docs/live-protocol.md "Brain Board"). Question sets gained
an optional category per question (editor field, a "Category" spreadsheet column or "# Category" lines when pasting, and
an AI "Brain Board" draft of 5 categories × 5 rising in difficulty); sets without categories still make a board. The
starters gained a mixed board (Science, Geography, Math, Mix) for ages 8-14, now listed first.

Hero of Sunvale is a fun adventure, not a class activity (the owner's call): `NOT_FOR_CLASS` in classlive-access.js
keeps it out of a teacher's /live picker and refuses it for a class room (`notForClass`); a parent may still host it
for their family or an open room. Empty game groups on /live are hidden.


## Live games are checked on phones, tablets and desktops (November 2026)

Every change to an Oomba Live game or the live pages must keep `tests/e2e/live-layout.spec.js` green. It runs
`scripts/live-layout-audit.js` (`npm run layout:live` against any running server): each quiz mode is hosted with three
players, and the projector page and a player's page are checked at 390×844, 360×640, 820×1180, 1180×820, 1280×800 and
1920×1080, in the lobby, during a long question (2 minutes, so every size sees it open), at the reveal, on the board and
at the end. Inside the game frame (tests/e2e/frame-fit.js) nothing may be off screen, cut off, on top of something else
or squashed (tap targets 40 px or more, never half again taller than wide), answer buttons must be in view without
scrolling, and the page never scrolls sideways. A screenshot of every check is kept for a look by eye. Found with it:
the player page's `<body>` had the class `lv-player` (the roster row's flex style), which squeezed every live game into a
narrow column on tablets.

## Admin game tool (November 2026)

`server/routes/admin-tool.js`: find a game, read its live code and put a fixed version live from outside a browser
(used to fix a member's published game for them). Off unless `ADMIN_API_TOKEN` (32+ characters) is set; bearer token,
rate-limited, audited as the admin account; new versions pass the usual safety scan, and a version waiting for review
is approved as the admin. Remove the token when the fix is done.

## The live question bank (November 2026)

Quest Race, Question Battle and Brain Board no longer lean on one static list. `server/live/bank/` holds a bank by
subject (Math, Science, Geography, Reading & words, History, General knowledge) and level (ages 6–7, 8–9, 10–11, 12–14):
25 hand-written questions per subject and level in English (`server/live/bank/en/<subject>.json`, rows of
question, right answer, 1-3 wrong answers; en-GB gets British spellings at load), and maths generated fresh at every
level (adding to 10 at 6–7; percentages, negatives, squares and simple algebra at 12–14). One engine
(`server/live/bank/engine.js`) serves both sides:
- **Teachers** pick "Question bank" on /live, then a subject (or "A bit of everything"), a level and how many; Brain
  Board takes 2–6 ticked subjects and builds columns easy to hard (the row below the level first, the level above
  last). The choice is remembered with the host's live preferences. Own sets, school sets and lessons stay as before.
- **Players alone** (solo practice in each game) get a setup card from the same engine: subject, level, how many (a
  board's subjects for Brain Board), remembered with BRB.storage; questions already played come last until the pool is
  used up. The frame has no network, so the bank travels as reviewed language packs,
  `public/vendor/data/live-bank/<version>/<lang>.js` (the "Game data packs" pattern), built by `scripts/live-bank.js`,
  which also writes each pack's sha384 into the three games. Run it after any bank or engine change, then seed.
- **Other languages** have every interface word and the generated maths, and the 20 translated science and geography
  starter questions until their own `server/live/bank/<lang>/` files are written: the pickers offer only the subjects
  a language has. Translating the English bank is a mechanical follow-up (same files, same shape).
## The Builder checks every device, tablets first (November 2026)

Kids play on tablets (iPads, Chromebooks) more than on anything else, and games that looked fine in the Builder's phone
playtest were hard to play on a tablet. So the playtest now also shows the model the title screen and the game after
starting at five sizes (phone and tablet, each in portrait and landscape, and desktop), as two labelled contact sheets
with the layout problems found at each size, and the system prompt has a firm "EVERY DEVICE, TABLET FIRST" rule. The
sizes are reached by resizing the window, so a game must lay itself out again on a resize, as it must when a tablet
turns. Cost: two more pictures per playtest (about 1,500 x 1,000 pixels each) and about 8 seconds more per playtest; a
screenshot job's limit went from 40 to 55 seconds.

## Tablets are a required check for every game (November 2026)

Many children play on a classroom or family tablet, held upright or on its side, so a game is not done until it plays
well on a tablet in both orientations, as well as on a phone (both ways) and a desktop. `npm run layout:games`
(scripts/games-fit-audit.js; tests/e2e/games-fit.spec.js runs it) opens every launch game at 390×844, 844×390,
820×1180, 1180×820 and 1280×800, with touch on phones and tablets, on the title screen and after pressing Play, and
fails on anything off screen, cut off, on top of something else or squashed, on a button that needs scrolling to reach,
or on sideways scrolling (tests/e2e/frame-fit.js), keeping a screenshot of every check to look at by eye. The live quiz
modes are checked in a real session by `npm run layout:live`. Passing the check is the minimum: also play the game with
touch on a tablet both ways (for a 3D game, check the camera frames the scene on a tall screen too).

## Game polls (November 2026)

Would You Rather shows "62% chose this" after a pick and at the reveals. The game calls `BRB.poll(item, choice, seat)`;
the play page posts it to `POST /api/games/:id/poll` (official games on `services/polls.js` POLL_GAMES only) and hands
the totals back. Only counts are kept (`game_polls`), plus who already voted (`game_poll_votes`, one vote per player,
item and pass-and-play seat 0-5) so a player can't tip the numbers; nobody is ever shown who chose what, and nothing
typed is stored. Under 5 votes the game says "You're one of the first to answer" instead of a percentage.

## AI voices for a chosen game (November 2026)

The owner wanted AI voices for one teacher's new game (and any later game they pick), not only official games listed
in `tts-lines.GAMES`. Design: docs/tts-design.md "A game the admin switched on".
- **A per-game switch, admin only.** Stored in `settings` (`tts.games`, no migration), audited, toggled on the game's
  page (admin-only box "AI voices for this game") or at `/admin/voices` ("Games with AI voices": list, Switch off, Add
  a game by link or name). Non-admins get 404 from the API.
- **Only grown-up staff's games.** The maker must be a teacher, school staff or the admin. A student's game is refused
  with a clear message: its words are a kid's, and the child-safety rule is that only site, game or teacher text is
  spoken. Official games can't be switched on here either: listed ones already read their known lines, and the others
  (word games where a kid types the word) keep the device's voice by design. The maker's role is checked as it is now,
  on every request, not as it was when each version was published (see docs/safety.md).
- **Only the game's own words.** There is no list of spoken keys for such a game, so the allowlist is every string in
  its published version's source (script literals, markup text, text attributes), cached per published version;
  a line must match one of its strings whole. Placeholders (`${…}`, `{name}`, `'a' + x + 'b'` chains) take a number or
  one of the game's own short names (`'{name} wins!'` with `'Fox'`), at most one name a line; a number elsewhere only
  where the game's text has one. Joining is limited to 3 of the game's phrases or sentences (a kit "how to play" read
  as one) with only spaces and plain punctuation between, never inside a word. A safety review showed that freer
  joining let a kid build sentences ("come to my house", another kid's name) from word lists and letter arrays, so
  list items, short words and code strings are never join pieces or names, and emoji or symbols never get added. Drafts and previews never
  speak. The existing backstops (rude words, personal info, the player's name, length) still apply. Role: the one the
  game asks for if known, else narrator.
- Kid-facing text did not change (the Voices button and sheet are the same), so no new translations.

## AI voices for a student's game, pinned to the version the admin saw (November 2026)

The owner asked to be able to turn on AI voices for student games. This changes "Only grown-up staff's games" above:
- **The admin may switch on a student's game too**, at `/admin/voices` or on the game's page. Teachers' and staff games
  work as before.
- **Pinned to one published version.** A student's words are a kid's, so the switch records the published version on
  screen when the admin switches it on (`tts.games` entry `version`; audited with `student: true`). If the student
  publishes a new version, the voices pause (the game page and `/admin/voices` say "Paused") until the admin plays it
  and switches the voices on again. A student's game that was never published can't be switched on.
- Everything else is unchanged: only the game's own words from that version are read, never what a player types, and
  the backstops (rude words, personal info, the player's name, length) still run.

## 3D worlds are the Builder's own; the Oomba Kit is for 2D (November 2026)

The owner found kit-made 3D worlds generic: every 3D game came out as Star Island or a `B.world` meadow, whatever the kid
asked for. Now:
- **2D games:** unchanged, on the Oomba Kit.
- **3D games:** never on the kit (no kit tag, no `Oomba.three`, no kit screens). The Builder calls
  `start_from_template('world3d')`, a kit-free starter (`server/builder/templates/world3d.html`), and in the same turn
  replaces its EXAMPLE world (`buildWorld`, `makeHero`, `SPAWN`, `onPickup`, CONFIG, the I18N words) with the world the
  builder described: land shape, buildings, landmarks, colours, sky and goal.
- **What the starter keeps, so every world plays right:**
  - A player controller: gravity; ground from the land's `height(x, z)` and solids' tops; walks up slopes up to
    `CONFIG.slope` and ledges up to `CONFIG.step`; walls stop it and it slides along them, never lifted; jumps (Space, Z,
    the button; never up or W) that land; bounds and a respawn after a fall.
  - A follow camera pulled in so it is never under the land or inside a solid.
  - Touch joystick, jump button and keyboard.
  - Its own title, HUD, pause and results screens in the 13 languages, light and dark.
  - The pixel-ratio cap and a quality ladder, context-loss handlers, and `__brbTest` (state, start, drive, teleport, look).
- **Routing:**
  - The 3D RULES are sent when a message asks for 3D (`asksFor3d`, 13 languages) or the game is 3D (`isThreeGame`).
  - The tool's template list is `BUILDER_TEMPLATE_KEYS`: the seven 2D templates plus `world3d`, never `island`.
  - The bridge's API reference (`KIT_3D_BRIDGE_RULES`) goes only with a game that already calls `Oomba.three`. Small
    fixes may stay on the bridge; a changed world is rebuilt from `world3d`.
- **Live 3D worlds** load the kit tag and the live pack only for the Oomba Live connection. They draw other players
  themselves from `Oomba.live.flat().positions()`.
  - The style lint gives no kit look notes to a 3D game that does not call `Oomba.three`, and the `three_bridge` note
    is gone.
- **Star Island** stays a "Start from" card a kid can pick, and the no-AI mock Builder still uses it for 3D: it cannot
  design a world.
- **Tests:**
  - `tests/unit/world3d-frame.test.js` walks the starter's player in Chromium: flat ground, a wall and sliding along it,
    a roof too high to jump onto, steps, a hill, a jump, the edge.
  - Also `templates.test.js`, `builder-claude.test.js` and `builder-kit.test.js`.

## Gulp City: an official black-hole city game (2 Nov 2026)

The admin lost a Builder project (a black hole that swallows a city, other black holes that can swallow you, a super
expansive map) and asked for it rebuilt as an official game. `seed-games/gulp-city.html` (slug `gulp-city`):
- **3D of its own**, like every new 3D world ("3D worlds are the Builder's own"): the pinned Three.js import map, no
  Oomba Kit, its own screens (title, how to play, settings, pause, "Gulp!", results) in the 13 languages, light and dark,
  RTL for Arabic and Hebrew. Settings: sound, music, read aloud (`BRB.speak`), motion (auto / less), high contrast,
  text size 100/125/150 %.
- **The city** comes from a fixed seed: an island of 24 x 24 blocks (1.4 km) with districts (downtown, midtown,
  suburbs, parks, harbour), the Gulp Tower plaza, a big park with a ferris wheel and a stadium; about 31,000 things of
  39 kinds plus about 260 vehicles driving the streets. No people are ever swallowed.
- **Performance:** things are instanced per kind per 100 m region and hidden when too small to see at the camera's
  distance, low-poly shapes, one shader for the whole ground, a pixel-ratio cap and a quality ladder. Under 600k
  triangles and 400 draw calls at the start of a round (tested).
- **Rules:** a thing fits when its footprint is under 92 % of the hole's radius; swallowing adds area, slowing as the
  hole grows, so a good round ends around 40-50 m across with the landmarks unlocked; the stadium is a free-roam goal.
  Rivals (6/8/10) seek food, chase smaller holes for a few seconds (then rest), flee bigger ones; a hole 15 % bigger
  swallows a smaller one. The player is safe for the first 22 s and 3 s after each "Gulp!", and starts again smaller.
- **Tests:** `tests/unit/gulp-city.test.js` (scan, words in every language, swallowing, big things waiting, rivals,
  the clock, free roam, draw budget, Arabic); `scripts/games-fit-audit.js` covers it at the 5 sizes; a screenshot cover
  (`scripts/covers.js`).
- **Loading (3 Nov):** on an iPhone the title card showed with no words, because every word was filled in only after
  Three.js had downloaded and the whole city was built. The words now come from the plain script before the 3D part;
  Play and Free roam wait (disabled) with a "Building the city…" bar the build moves on, and the build runs in slices
  with a breath between them (top-level `await`), so the bar moves and the phone never sees one long frozen task. If
  the 3D part can't start (no import maps, a failed download, no WebGL, the picture lost while building, an error, or
  no progress for a long time), a card in the player's language says so with Try again (`BRB.retry()`, new in the SDK:
  the play page reloads the game). No automatic lower-quality retry: the city is a fixed size and, measured on a CPU slowed 6x at
  phone size, is ready in about 1.6 s; the pixel-ratio cap and the quality ladder already cover slow phones.
- **Things come back (3 Nov):** a swallowed thing returns to its spot 10 s later (`CONFIG.respawnSeconds`), growing
  in with a small pop (at once with less motion), and waits while any hole is over the spot; vehicles come back where
  they were swallowed and drive on. Same delay for everything, so one time-ordered queue is enough. The results show
  "Things swallowed: n" instead of a percentage of the city (which no longer means much). Autopilot balance after the
  change: easy won, normal close (the player just ahead), hard the rivals ahead.

## The Builder playtests every build by itself (November 2026)

The Builder's own `playtest_game` is something the AI may or may not call, and it is a look (pictures and layout), not
a play. Now the platform plays every build itself before the build ends (`server/builder/autotest.js`,
`snapshot.js` `autoplay()`), and sends what it found back to the AI to fix:
- **When:** the AI ends its turn (a reply, or a question with `ask_user`) after saving a new version in this build.
  A chat-only answer is never played. A build that ends some other way (out of rounds, the AI budget, a failed scan)
  with an unplayed version is played once, report only.
- **What it does:** in the same sandboxed frame and CSP as players get (no network), it starts the game (the test
  hook's `start()`, a Play-ish button in any of the 13 languages, the biggest button, the middle), then about 18 s of
  input: arrow keys, WASD, space, Enter, 1, taps across the screen, swipes and drags (a touch joystick), the game's own
  buttons (never pause, settings, sound, menu or leave) and mouse movement. It samples the screen (how much changes
  with and without input, how much is one colour), reads `__brbTest.state()` (score, scene/screen, hero/pos), the
  numbers on screen and what the SDK posts (`brb:score`, `brb:gameover`, `brb:save`), counts frames, and checks the
  layout at phone landscape, tablet portrait and desktop (the same check as `playtest_game`). About 25 s a run, inside
  the usual one-at-a-time screenshot queue (55 s cap; a run that times out is reported as a game that may freeze).
- **The report:** started? input made a difference (yes / no / unclear)? score changed? game over reached (and how
  soon)? Problems the AI must look at: errors (deduplicated, top 5, quoted), start does nothing, a blank screen, a
  frozen screen, controls that do nothing (when the game reports a hero), a game over within 3 s, very slow (under 8
  frames a second), layout problems per device, kit warnings. "The score never changed in a game that has a score" is
  a soft finding (a calm game, a quiz waiting for an answer or a story may be fine): the AI gets it once per build and
  judges it. What the game printed is data, cleaned and cut short; the report is at most 3,800 characters.
- **The fix loop:** the report goes to the AI as a platform note in the next user turn (after any tool results); it
  fixes with `edit_game`, and the platform plays the fixed version again. Fix rounds per build: 1, or 3 for trusted
  makers (the site admin, teachers and school staff: `trustedMaker`). It stops as soon as a run is clean, when the AI
  saved nothing new (it judged the findings false alarms), when the AI budget is resting, or when under 4 minutes of
  the build's time cap are left (under 75 s: no run at all). Problems still there when the rounds are used up are said
  honestly at the end of the reply, in the builder's language ("my automatic playtest still found N problems...").
- **The Studio** shows each run as a step ("Playing your game like a player would" → "found N problems" /
  "everything worked ✓") and the fix round as "Round N: fixing the problems the playtest found", in all 13 languages.
- **Cost:** the run itself costs no AI. A fix round is one or two model calls (most builds that pass cost nothing
  extra). Wait time: about 25 s per run.
- Tests: `tests/unit/builder-autotest.test.js` (the report on canned facts, the loop against a fake Messages API:
  rounds per role, early stop, soft findings, budget and time skips, the `ask_user` ending; and the real browser run on
  a game that crashes on start, one whose score never changes and the Catch template).

## Trusted makers build with the Pro model (2 Nov 2026)

- **Who:** `trustedMaker(user)` in `server/builder/usage.js`: the platform admin, school staff (admins and teachers of
  a school) and anyone who teaches a class. Never students, other kids' or family accounts, guests or banned accounts.
- **Pro by default:** every Builder message a trusted maker sends uses the Pro model (`runner.submit` sets it), whatever
  the Studio switch says. The Studio shows a "Pro quality ✓" badge instead of the switch, with "Included for teachers"
  as its tooltip (`studio.chat.proIncluded`, 13 languages).
- **One message each:** a trusted maker's Pro message counts as one message (`allowanceFor().proWeight` is 1 for them),
  never `PRO_TURN_WEIGHT`.
- **Longer builds:** the time cap is `BUILDER_STAFF_TURN_MAX_SECONDS` (default 2400 = 40 minutes, against 20 for
  everyone else), and a build may make `MAX_STEPS_TRUSTED` = 20 model calls (14 for everyone else), so there is room
  to playtest and fix more. The time estimate and a resumed build use the same numbers. Output tokens per call
  (`BUILDER_MAX_TOKENS`) and the effort level (already "high" for Pro) are unchanged.
- **Cost:** these builds still count against the AI spending cap (`AI_DAILY_BUDGET_USD`, default $5 a day). A Pro build
  with more calls costs several times a normal one, so a few teacher builds can reach the daily cap sooner; the cap
  itself is unchanged. Raise it, or watch `/admin/stats`, if teachers build a lot.
- **Tests:** `tests/unit/builder-trusted.test.js`.

## How many players each live game holds (3 Nov 2026)

Every live game was run with 10, 20 and 30 players (`scripts/live-load.js`, `docs/live-capacity.md`) so a full classroom
fits without crowding a game that can't hold one.
- **One place:** `classlive-access.js` `CAPACITY` (per built-in mode and official game: `max`, the `best` range,
  `teamsAbove`); Builder games get 30, or what they say in `Oomba.live.ready({ maxPlayers })` (2-60). Every room is capped
  at its game's number, under `LIVE_MAX_PLAYERS`.
- **Numbers:** Quest Race 40, Question Battle 60, Brain Board 40 (teams suggested above 16), Hero of Sunvale 30.
- **Fixes:** the lobby crowd of Question Battle and Brain Board fits a full room (the boss shrinks, up to 10 columns,
  characters without name tags when tags can't fit).
- **Shown:** the game cards on `/live` and `/teachers/live` say who each game is best for; "Most players" is clamped to
  the picked game; a full room says "This game is full (30 players)." in 13 languages.
- **Tests:** `tests/unit/live-capacity.test.js`; `tests/e2e/live-load.spec.js` (10 players in each quiz mode).
## Would You Rather and Atlas Quest go live (3 Nov 2026)

The owner asked to make Would You Rather and Atlas Quest live class games, playable by 10, 20 or 30 players. They are
two new built-in modes on the quiz machinery (the platform times, checks, scores and reveals; the games only draw):

- **Would You Rather Live** (`mode: 'wyr'`, seed game `would-you-rather-live`). The server makes the questions from the
  official game's reviewed bank (`server/live/wyr.js`, starter `wyr:<topics|mix>:<count>:<secs>`, every language): two
  choices, `answer: -1`. A vote is never right or wrong: no points, no streaks, no "needs help", no team banking, and
  the answers are never shuffled (so A and B stay the poll's A and B). After each reveal the server counts each
  signed-in player's vote once in the game's all-time poll (`polls.vote`, the same table and rule as the game: one vote
  per account and dilemma; guests have no account and don't count) and shares everyone's split as state `wyr`
  `{ i, a, b, n }` (percentages only from `MIN_SHOWN` votes). The projector names nobody: only the split, how many, a
  fixed talk prompt, and at the end the most agreed and the closest dilemma. Results show votes, not accuracy, and no
  "play the missed ones".
- **Atlas Quest Live** (`mode: 'atlas'`, seed game `atlas-quest-live`). The server makes the questions from Atlas
  Quest's own data (`server/live/atlas.js`, starter `atlas:<region>:<level>:<kinds>:<count>:<secs>`; kinds find,
  capital, flag, famous). A question's choices are every country's code in Atlas Quest's order, so a tap on the map is
  an ordinary answer: the index of the country (the protocol's `an.c` now goes to 255; the quiz still checks it against
  the open question's choices, and a 2-4 choice question refuses anything else). The right country scores 500-1000 by
  speed plus the streak, like every quiz; a near miss scores 0-300 (under 2,000 km, a neighbour at least 150), never a
  streak. The region the maps open on is shared state `atl` `{ i, k, reg }`; a flag question's flag code goes to the
  projector only (`atlf` `{ i, fl }`, kept out of `s.state` and of every phone's welcome), so the answer is never in a
  phone's data: a phone says to look at the big screen. Phones get a 2D world map (pan with a glide, pinch, a second
  tap on the same spot zooms, + / − / whole map). A tap is a touch that moved under 12 px (counted from where it went
  down, so a wobbling finger still taps); it picks a tiny country's dot under the finger, else the drawn shape under
  it, else the nearest shape edge or dot within 24 px. (Before, any tiny country's dot within 22 px won the tap, which on
  a phone's world map took about a third of all land taps away from the country under the finger, and a wobble of 10 px
  in total turned a tap into a pan.) Before Lock in the bar only says a country is picked (its name or flag would give
  the answer away); once locked it shows the flag and name. At the reveal the right country fills with its flag, as in
  Atlas Quest, and its label carries the flag. Titles say "(Live)" in parentheses.
  The projector shows one bubble per tapped country (size = how many) rather than a pin per player, so 30 or 60
  players stay readable, plus the top five and "and N more answered". Results keep a short version of each question
  (the right country and the most tapped wrong ones, by name).
- **Full classes.** Both were run with 30 players (unit test over the real socket, and `scripts/live-crowd.js`: 30
  bots plus a real phone on a running server, layout checked at five sizes). A player receives a handful of messages
  per question (the question, its own ack and result, the reveal, the state patch), the biggest well under 2 KB even
  for Atlas (the reveal's 195 counts). Both allow the room's usual maximum (60).
- Play again keeps the same questions (`trusted` items: the platform's own, carried over unchanged); the page's and
  the dashboard's read-aloud and answer bars treat a question with more than 4 choices as a map (question only; the
  dashboard lists the most tapped countries by name with `Intl.DisplayNames`).

## Live games say how to join (3 Nov 2026)

A live mode opened from the home page went straight into solo play, and a student had no obvious place to type the
class's code. Now:
- `server/live/live-games.js` lists the official live modes (slug -> mode for /live, and the game to practise alone).
  Their cards carry a "📡 Live" badge, and the home hero's Play opens the game page for a live mode.
- A live mode's game page leads with a "Live class game" panel: "Your teacher shows a code on the board. Type it here
  to join." with a code box and Join, then "Host a live game" (/live?mode=…, for hosts; signed out: the teachers' page)
  and "Practice solo" (Would You Rather (Live) -> Would You Rather, Atlas Quest (Live) -> Atlas Quest).
- The box sends `/join?code=…&go=1`; the join page gets `#go=<code>` and joins at once (a QR's `#<code>` still waits
  for Next).
- "Join a game" is in the top bar for every player (not school staff or the platform admin, who host): a round 🎟️
  button, with words from 1400px; on phones the search field becomes the round 🔎 button beside it. Signed in, the
  home page also has the big "Join a game" door above the featured game.
- Tests: tests/unit/live-entry.test.js.

## Courses on the home page (Nov 2026)
CS Quest is listed as a course: a "Courses" row right after the featured row holds one wide card per course with its
games nested in course order (Robo Route, Data Detective, Packet Post, Inside the Machine), a Start / Keep going
button (the first game not yet played) and a link to the course page /courses/<slug>, which repeats the games larger
and points teachers to /teachers/cs-quest. Shown to everyone. Nothing new is stored: a game counts as started when the
player has a play of it. Courses are declared in server/services/courses.js.
Course games are played only as part of their course: they are left out of the open lists (home rails, search,
"similar", playing now, the sitemap's game entries), /g/<slug> redirects to the course page, and /play/<slug> opened on
its own goes to the course page. They open from the course (?course=), a class lesson (?lesson=&step=) or a teacher's
lesson link (?chapter=...); in the course, the play bar's back button returns to the course and shows "game n of 4".

## Course flow (Nov 2026)
The games only make sense as practice for something learned, so a course is now read, then played: course content ->
game module -> course content -> game module. CS Quest has 19 steps per grade band, from the teacher lessons 1.1-6.3
(unit 7, the Builder capstone, is the optional "Make your own game" card that ends the map). A step is a short slide deck
(5-7 slides, English for now with lang="en", read aloud with the device's English voice), a quick check of three items
from the lesson's exit ticket in the quiz banks (two right passes; unlimited tries; a wrong answer shows the right one),
then its game module: one locked chapter of a game (6.1 and 6.3 have none and end with a "talk about it" prompt).
- The band is picked once (Explorer grades 3-5 = 1b, Pro grades 6-8 = 2) and can be switched on the course map; the two
  bands keep separate progress. Picking a band without a session makes a guest, like one tap on Play.
- Step i opens when step i-1 is complete: slides read, check passed, and (if it has one) its game module finished.
  Opening the module only starts it (played_at); the step completes when the game itself reports its assigned
  chapter won — every course game sends brb:gameover (won) exactly at the end of the chapter a step assigns, the
  play page posts that to /api/courses/<slug>/<step>/complete, and the endpoint records completed_at only for a
  player whose check is passed and who did enter the game from the step (migration 0046; before this, merely
  opening the module completed the step). Stored per player in course_progress / course_bands (migration 0045),
  removed on account deletion, moved on a school-account merge. Grading is on the server; the page never holds an
  answer before the player has answered.
- Where a step comes from: its lesson file (order, game module, params: the source of truth for the gate), its slide deck
  (seed-lessons/cs-quest/course/<band>/<u.n>.json; a missing deck falls back to one made from the lesson file) and the
  banks (questions). services/courses.js deckProblems() lists a deck that disagrees with its lesson.
- /play/<course game> opens only from an open step whose check is passed (?course=&cstep=, which sets played_at = the module was started; the win comes back through the play page and sets completed_at), from
  a class lesson step of that game (?lesson=&step=), for school staff with lesson parameters (?chapter=...), for the
  platform admin, or in an online match the player is seated in. Everything else goes to the course map. "?course=" or
  "?chapter=" alone no longer opens a course game.
- Finishing a course game must land the student back in the course, and the completion must actually register
  (Greg's live findings, 2026-11-05). Three rules came out of that day's testing. (1) The step context is honoured
  for every signed-in player who arrives with a valid one — the game owner and the admin included: courses.playable
  is the gate (step open, check passed, module matches), and dropping the context for owners (the old !isOwner
  condition in the play route) made their wins impossible to record while looking exactly like a normal session:
  no played_at, no completion call, no error. The owner bypass still governs merely opening a course game with no
  step context. (2) When a course step's game reports its end, the play page states the outcome itself, inside the
  stage so fullscreen shows it too: a finish bar with the way back to the course as the primary action, in four
  honest states (completion recorded; a guest's win banked for sign-in; the finish did not complete the step —
  Sum Racer reports every race's end and only 1st place wins, while its results screen celebrates any finish; the
  win could not be saved). A failed completion call is shown, never swallowed. Free play (no step context) never
  sees the bar. (3) A "Back to class/course" button inside a game works through the page: the frame is sandboxed
  with an opaque origin and cannot navigate, so the game asks with BRB.back (brb:back) and the page goes back only
  on a real tap and only when the launch carried a back context. Robo Route's results-card button previously only
  rewrote its own caption and disabled itself; Inside the Machine's went to the game's title screen.
- The home card shows steps done of 19 and Start / Keep going to the next open step (or the band picker); its game list
  is the unit overview and links to the map's units.
- Guests cannot complete a course (Greg, 2026-11-04). A guest browses and plays freely, but a check pass or a game
  win of theirs is never progress: services/courses.js keeps those earned facts in course_pending_wins (migration
  0050: 'check' with its score, 'played', 'win') instead of course_progress, the /complete endpoint answers a
  guest with the sign-in prompt (403, needAccount), and no Tally Marks, laps, placement or stored grade are
  recorded for a guest in any course. The win is honoured when the student signs in — applyPendingWins, called
  wherever course state is drawn, turns each stashed win into the step's real progress (the Number Quest awards
  and lap land with it); signing in to another account first transfers the facts at login. A check passed on a
  step with a game, without its win, is cleared unrecorded (the game is still owed); a check on a step with no
  game is itself the finished step and is honoured like a win. In the guest's own views the facts stand in for
  progress — they open the next step and fill the street the guest is looking at — but they never enter
  course_progress, so no grown-up surface ever sees them.
- The platform admin can open every step of every course (Greg, 2026-11-05, so he can test everything):
  states() reports every step open for the admin account, so the course maps (and Number Quest's path),
  the step pages and the step APIs treat the whole course as enterable in any order, regardless of the
  admin's own progress or placement, and /play honours the admin's step context like a student's
  (played_at is set, the win posts back and completes the step). Access only, deliberately: completion is
  unchanged — opening a step completes nothing, a step's game still waits for its check to be passed, and
  a win still completes through the same endpoint — the bypass writes no progress by itself and changes
  no one else's view (the teacher gradebook reads each student's own states). It is keyed on the
  account's role, read server-side from its user row; there is no client switch. School staff keep their
  narrower preview: a locked step's page, but not its APIs or its game.

## A second course: Cyber Defenders (Nov 2026)
Cyber Defenders (seed-lessons/cyber-defenders) is a standalone cybersecurity / online-safety course on the same
machinery: same deck shape, check rule, band picker, map and progress tables. It is deck-native — no teacher lesson
files — so its units.json is the source of truth for each step's order, game module and standards (CYBER.ORG v1.0
codes and a Common Sense topic per step, registered in its standards.json; CSTA codes only where inherited from a
re-framed CS Quest deck), and services/courses.js loads it beside CS Quest (deckProblems(band, slug)).
A course's game list may mark a game "shared" (course-catalog.js): the course's steps play it, but the course does
not own it — it keeps its own page and its place in the open lists, and /play's gate is unchanged for it. Cyber
Defenders shares both of its games: Packet Post (owned by CS Quest) and Would You Rather (an open game; the solo
game takes no lesson params, so a Defender mission names its "Online: share or keep" topic and the student picks
it). Because a step's game can now belong to another course, /play resolves the step against the course named in
?course= (the step's own course), not only against the game's owner: the gate, the played_at mark, the back link
and the "game n of m" badge all follow the step's course. A blocked attempt returns to the step's course map when
one was named, else the owner's.
Phase 2 adds the course's own finale game, Escape the Post Office (seed-games/escape-the-post-office.html, step
6.4's mission in both bands), and lists it the same way — "shared", not owned — so it keeps its own page and its
place in the open lists like the course's other two games, and no course-game slug joins COURSE_GAME_SLUGS. Its
Lock 4 is a compact, self-contained round in the Trick Inbox idiom (the four responses and the missed-clue
debrief); the round's data shape (from/subject/body/badge/action/accept/missed) is the documented interface for
swapping in the standalone Trick Inbox engine when that game ships.
Phase 2 also adds Trick Inbox (seed-games/trick-inbox.html), the course's response-choosing game, listed
"shared" in the Cyber catalogue exactly like Packet Post, Would You Rather and Escape the Post Office, so no
course-game slug joins COURSE_GAME_SLUGS. Its sets are its chapters, and these chapter ids are the contract
the decks wire to: letters (step 4.3, both bands), senders (Pro 4.1), media (Pro 4.3), boss (6.3 both bands —
and the round Escape the Post Office's Lock 4 mirrors: Explorer 6 messages, Pro 8 with faked senders among
them). A round is hunt (tap every hidden clue) → choose (Deliver / Bin it / Show Pim / Report & block) →
debrief (the missed clues named); BRB.gameOver fires only when a set is finished, never on open or mid-round.

## AI voices for every official game (5 Nov 2026)

Owner's rule: **every official game uses the AI voice**, and **every game built for a course ships registered
for AI voices from day one**. This supersedes the word-game carve-out in the AI-voices entries above.
- All 30 official seed games are listed in `services/tts-lines.js` GAMES. A game's lines come from the marked
  I18N block in its own file (the CS Quest games from their language packs), read with its host's or
  character's role, narrator where it has none.
- Games speak only through the shared path (BRB.speak, `public/js/tts.js`): no game calls the device speech
  API itself any more. The device voice remains, as the shared fallback inside the SDK and tts.js only.
- A coverage test (`tests/unit/tts-coverage.test.js`) enumerates the seed games and every game named in
  `services/course-catalog.js`, and fails until each one is registered — a future course game cannot ship on
  the device voice by accident.
- A word game's dictionary still never becomes a sentence kit: only the game's own scripted lines are read.
  A word or letter a player types is never spoken by the AI voice.

## Number Quest deck pictures: diagrams teach, real pictures carry missions and story (5 Nov 2026)

Owner's rule (2026-11-05), replacing the blanket no-images rule the Number Quest deck tests used to pin:
**drawn diagrams remain the pictorial step on TEACHING slides; real imagery is allowed, and expected, on
MISSION slides and STORY slides.** A mission slide carries a real screenshot of the game the mission
assigns, photographed in the mode the mission assigns (the track, board, pattern set or chapter the lesson
parameters open). A story slide may carry the story stage: Tally in a Numberworks scene. No other slide
carries a photograph, and a slide with a drawn diagram (visual) carries neither img nor story.

What the platform needed, and now has:
- Deck image keys extend beyond CS Quest: `nq/<game>/<state>` joins `csq/<game>/<state>` in the deck
  validator. Number Quest pictures keep their own manifest (`public/img/nq/manifest.json`, checked by
  `npm run nq:check`, the twin of the CSQ check) and their own capture pipeline (`scripts/nq-shots.js`),
  which boots each game with the deck's own lesson parameters so the photograph shows the assigned mode.
- The story stage's cast extends by one: Tally (`/img/csq/chars/tally.webp`, the sprite that already
  existed) and one Numberworks scene, `street` — the workshop street, its windows lit per the beat
  (data-lit 0-4, the drain scene's quiet-dark discipline at 0). The extension is additive: CS Quest and
  Cyber casts, scenes, decks and rendering are unchanged.
- Animation is the story mechanism's own CSS (entrance + idle on the sprite); Tally pads in and purrs.
  A beat whose teaching visual is a diagram keeps the diagram: a story layer never displaces a visual
  or its guided focus.

Scope: the 13 built Explorer decks (0.1-4.3). Every mission slide of a deck with a game carries that
game's screenshot; 0.1's two opening beats carry Tally on the street (lit 1, then 0 as the workshops go
quiet). Phase 2 decks (Units 5-7, the finale) were authored in parallel, just before this platform
landed, and their mission slides carry no captures yet: a capture sweep is owed for 5.1, 5.2, 5.3, 6.2,
6.3, 7.1, 7.2, 7.3 and 7.4 (6.1 has no game, so the rule does not reach it), and
scripts/nq-manifest-check.js names each owed capture on every run until it lands. The sweep also
flips the no-img pin in tests/unit/number-quest-decks-c.test.js to this rule for those decks.
## Brain Board lessons complete at a points goal, and the board saves (5 Nov 2026)

Owner's amendment, for **Brain Board's Number Quest lessons only** (steps 1.1 and 2.3): clearing all
25 tiles in one sitting was too much work for one lesson, so these lessons no longer complete on a
full clear. Every other game keeps the platform rule: a step completes only when the assigned game
content is completed in full, and win-gating is untouched (no credit for opening a game, and no
credit here without earned points either).

- **The goal is 3,000 points.** A lesson board holds 7,500 face points (five columns, rows worth
  100/200/300/400/500). 3,000 is 40% of the board: the three easiest rows across all five columns
  sum to exactly 3,000, so an easy-tiles-only route reaches it in 15 tiles with no speed bonus;
  the six richest tiles together max out at 2,900, so a hard-tiles route needs at least seven
  tiles (five 500s and two 400s make 3,300). Both of the owner's routes genuinely work, and the
  goal shows on screen during the lesson as points so far against the target.
- **Reaching the goal fires the normal completion report exactly once**, the moment the score
  crosses it. The student can keep playing the remaining tiles afterwards; those points still
  count as game score, and the board shows a clear "step complete" state. A board used up below
  the goal earns no completion and starts fresh on the next visit.
- **Progress saves.** Every answer saves the board (questions, tiles, star, score, and whether the
  goal was met) through the game's normal cloud save (`BRB.storage`), per student per step, and
  re-entering the step restores it as it was left. A guest's board lives on their guest account
  like every other game save: kept for their own view, merged into their real account on sign-in.
- The 1.1 and 2.3 mission slides state the new requirement ("score 3,000 points to finish"), per
  the mission-truth rule.

## Tug of Math (6 Nov 2026)

Owner's request, from a classroom video of a two-team maths tug of war on a smartboard: an **original** official
game, `tug-of-math`, in our own Oomba look (kit characters, our own rope scene and keypads; nothing copied from the
video). Part A (this entry) is the game played alone or by two players on one screen; part B is Oomba Live (a class
split into two teams, each player on their own device) and builds on the same question generator.

- **The grade decides the questions.** A setup card before every game: grade 1-8, players (vs Computer or 2 players),
  the computer's level and the time (60 s, 90 s, 2 min or "to the line", capped at 3 min). It shows sample questions
  for the grade and remembers the last choice (`BRB.storage` key `tug-of-math-v1`, ids only). Grades: 1 add/subtract
  within 20; 2 within 100; 3 times/division facts to 10 × 10 and add/subtract within 1000; 4 multi-digit × 1-digit,
  exact division, two steps; 5 2-digit × 2-digit, bigger division, simple order of operations; 6 order of operations,
  easy percents, squares; 7 integers with negatives and one-step equations; 8 two-step equations, powers, square
  roots. Every answer is a whole number (a keypad works); the minus key appears only for grades 7-8.
- **Fair sides.** Both teams' n-th questions are the same kind from one shared seed, with different numbers; a side
  never gets the same question twice in a row.
- **One source of truth.** The generator (`TugGen`) and the computer (`TugBot`) are pure ES5 blocks inside the game
  html; `server/live/tug-gen.js` runs the same block with node:vm for Oomba Live and the unit tests, which check every
  answer with their own evaluator.
- **The computer.** Easy about 9 s an answer and 65% right, Normal 5 s and 82%, Hard 2.6 s and 94%, scaled by how hard
  the question is: a slow 2nd grader (9 s, 80%) beats Easy at least 4 times in 5, and Hard beats a steady player
  (5 s, 85%) at least 7 times in 10 (unit-tested by simulation).
- **Layout.** Landscape (smartboard, tablet on its side, desktop, phone on its side) is Blue | tug | Red as in a
  classroom; portrait stacks them, with Red's half turned round for the player across the table, or a small computer
  card. The field never mirrors in Arabic or Hebrew (Blue stays left, like the two ends of a real rope); words do, and
  maths and keypads stay left to right. Keypads take every finger at once (pointer events), so two players can tap at
  the same moment on a smartboard; keyboard: digits, Backspace, Enter, '-' (two players: Blue on the number row, Red
  on the number pad). Each team has a colour, a shape and a name.
- **Scores.** vs Computer reports `BRB.gameOver({won, score: right answers})`; a two-player match on one screen submits
  nothing. AI voices: registered like every official game; no question is read aloud (they are numbers).

## Tug of Math goes live (6 Nov 2026)

Part B of Tug of Math: **Tug of Math (Live)**, the built-in Oomba Live mode `tug` (`MODES.tug = 'tug-of-math'`). The
same game file draws the live view when `Oomba.live.active` (its kit `live` pack is loaded; the solo game is unchanged).

- **The teacher picks the grade and the length** when opening the room on `/live` (grade 1-8, shown with three sample
  questions; 60 s, 90 s, 2 min or "to the line", capped at 3 min). The browser remembers the last pick (a per-viewer
  convenience); a lesson can preselect it with `?starter=tug:<grade>:<len>`. Play again keeps them (in memory, and in
  the saved run's settings as `tug`).
- **Two teams, made by the platform.** Teams are always on, Blue Whales (preset 0, a circle) against Red Foxes (preset 6,
  a diamond), ranked by the average per player; players are split evenly as they join and late joiners go to the
  smaller team. The host may balance, shuffle, move a player and lock teams; never change the count, presets, scoring or
  let players choose (refused on the server). The class's saved teams are never overwritten by this game's two. With
  `LIVE_TEAMS=0` the mode is not offered and a room is refused (`tugTeams`).
- **The server decides everything.** Each player gets their own questions from the game's own generator
  (`server/live/tug-gen.js`): the n-th question of every player is the same kind (one seed for the room), with that
  player's own numbers, so the teams are equally challenged and nobody can copy a neighbour. A question goes to its
  player only, as number and word tokens (never text); the answer is a number (`ans { i, v }`), checked on the server
  and answered to that player only, then the next question. A device's score or item reports are ignored in this mode.
  At most one answer every 300 ms after a right one and 1 s after a wrong one (the game shows the right answer for a
  moment), so a held key or a script gains nothing.
- **Fair for uneven teams.** A right answer pulls the rope `1 / (players on the team now)` toward that team: the rope
  is the difference of the two teams' average right answers. A lead of 5 (per player) wins at once; otherwise the team
  ahead when time is up wins, or it is a draw. The winner shows on every screen for 3 s, then the usual podium and
  results (team podium by average; each player's right answers in "Student details"; no question review or "play the
  missed ones", since every player had their own questions).
- **No free text, no chat.** Players only tap digits (or type them on a keyboard); nothing a player sends reaches any
  other player. Names follow the room's rules (generated nicknames, or the class roster; hidden on the projector when
  the teacher hides them).
- **Screens.** The projector: both team panels (pulls per player, right answers, players), the clock and the big tug
  with up to two of each team's own characters; in the lobby, both teams with everyone's character. A phone: its team,
  a small rope, its own question, the keypad (a 6 × 2 keypad on short screens; side by side on a phone or tablet held
  sideways). Pause, eyes up, Next and Skip: pause and eyes up stop the clock; Next and Skip are not shown (the match runs
  on its clock). Capacity 60 (`CAPACITY.tug`, docs/live-capacity.md).

## Remi's Quiet Meadow (6 Nov 2026)

The owner asked for a classroom noise meter "with Remi": the class is measured, and the animation wakes up when it gets
too noisy. Plan and evidence: `docs/remi-quiet-meadow-plan.md`.

- **The microphone runs on the play page, never in the frame.** Every game frame is opaque-origin (no
  `allow-same-origin`, ever). Tested in Chromium 1194 with the fake-device flags: `getUserMedia` in such a frame fails
  with `SecurityError: Invalid security origin` even with `microphone=*` on the page and `allow="microphone *"` on the
  iframe. A tap in the frame does activate the parent page, so the page can open the mic itself. Only
  `/play/remis-quiet-meadow` sends `microphone=(self)` and `page-data.mic` (`server/services/mic-games.js`: slug + official
  seed game + published + not hidden; never in an online match; `MIC_GAMES=0` turns it off). The frame, its CSP, its
  `microphone=()` and the iframe's `allow` are unchanged. `public/js/loudness.js` measures RMS with an AnalyserNode wired
  to nothing else and posts one dBFS number 20 times a second (`BRB.loudness` in the SDK, kept out of the Builder's
  API). No MediaRecorder, nothing stored or sent. The page shows its own Listening/Stop pill and stops on pause, hide,
  leave, reload and a missed keep-alive. Other pages answer `off`. The scanner keeps failing `getUserMedia` for every game
  (no slug exemption); Remi never calls it.
- **Original art.** The owner's reference pictures resemble a film character; we copied nothing. Remi is our own red
  panda in the Oomba ink style (thick outlines, flat fills), with generic red-panda traits (orange fur, cream face and
  belly, white-rimmed ears, a ringed tail) and his own green leaf scarf: an inline SVG rig whose parts are placed from
  pose numbers (asleep on his side, sit, stretch and yawn, grumpy with arms crossed, paws to his head when it is loud,
  standing with arms wide), blended with easing plus springy ears, tail and scarf and breathing. No image files.
- **Levels and moods** (`window.RemiCore`, unit-tested): -70…-10 dBFS maps to 0…100; smoothing up 0.12 s, down 0.5 s;
  the line is the calibrated room quiet (median of 3 s, else 30) + Whisper 10 / Quiet work 18 / Group work 30 ± 25.
  Asleep → stirring near the line → waking after 1.5 s over it (leaky, so a clap only stirs him) → yawn, grumble,
  grumpy → 4 s of calm → lies down. The quiet clock runs only while he sleeps; a goal (2–30 min or none) ends happily;
  stars 3/2/1 for 0–1/2–3/more wake-ups. His WebAudio sounds hold the measuring while they play (+800 ms) and the
  gauge's level is frozen meanwhile (`RemiCore.feed`), so the speakers never wake him. Moods and the clock move only
  while the room is really measured (fresh numbers in the last 0.3 s; not while the page waits for its own tap), and a
  calibration the microphone drops out of is thrown away.
- **Readable from the back of the room** (review): a big "!" and a warm tint for as long as he stirs (head up, one eye
  open for a second); paws over his ears when it is loud, held 0.9 s so a room hovering at the line doesn't flicker;
  the Zzz twice as big with a thick outline; the gauge ~120 px wide at 1080p with "Shh / Getting loud" zone names,
  Remi faces at both ends (no emoji) and a pulsing line near it; "Remi is talking" sits where the "Too loud" tag is;
  a "🎤 Listening" chip next to Pause. The results card stands beside happy Remi (wide) or under him (tall), with the
  quiet time and wake-ups as two big numbers, "Same settings" and "Another quiet time".
- **Name:** "Remi" in Latin-letter languages, ريمي / רמי / レミ / Реми / 雷米 in the others (`server/i18n/notes.json`).
- **No mic?** A card explains blocked / none / busy / old browser / "this page can't listen", with Try again and a demo
  (noise slider, clap, class chatter). Kit 1.1.3 shell, no packs, own rAF loop (the kit's loop pauses on blur).
- **Child safety:** no recording, no accounts or data needed, no score submitted (`gameOver({won:true, score:null})`),
  settings saved as ids and the fine slider only (the room's measured quiet level stays in memory for the visit), no
  text input. AI voices may read only the title, setup, privacy note and end lines.
- **Open:** iPad Safari may not pass the tap to the page; the page then shows its own "Tap to start listening" button
  (the lease waits up to a minute for it, the game hears no numbers meanwhile), which needs a check on a real iPad, as
  does the wake-up sound on real speakers (softened: triangle voice, low filter Q, an out-breath).

## Doodle Hoot (6 Nov 2026)

The owner asked for "a family Pictionary game that users can play with one another … even in different places". Built
as **Doodle Hoot** (slug `doodle-hoot`, live mode `doodle`), hosted by Pip, the kit's owl. Plan: docs/doodle-hoot-plan.md.

- **The name is original.** Never "Pictionary" (a Mattel trademark) or another product's name; we know of no game, app or
  toy called Doodle Hoot (the draw-and-guess names we avoid are listed in the plan). A trademark search is still to do
  before launch; the fallback is "Squiggle Owl".
- **Who joins: anyone with the code** (the owner's choice): an open room, like the other live games. Each player joins
  at /join on their own device, from anywhere, with a generated nickname. The host page gets **Copy join link** (the
  code stays after `#`, so never in a server log; a phone shares it instead) and **Play too** (a grown-up who wants to
  draw and guess takes a seat like everyone else). These two buttons are on every live mode's host page.
- **Who hosts: unchanged.** `canHost` already lets grown-up accounts host, with no billing check; kids, students,
  guests and banned accounts never host, and open rooms have no co-hosts. What billing controls is *making* a grown-up
  account (families on: billing on and public, or the preview cookie). So while billing is off, only existing
  grown-ups, teachers, school staff and the admin can host; teachers always can. Pinned by
  tests/unit/live-doodle.test.js ("a grown-up with billing off").
- **Guessing: letter tiles** (the owner's choice), never typed text. The server builds one tray per turn (the word's
  letters plus decoys, never a letter of the word; an Easy tray never puts a letter next to its accent twin) and checks
  every guess as tray positions. Hints remove two decoys, then lock letters in, never more than half the word.
- **13 languages of words**, about 160 picture-able things over Easy, Medium and Tricky, in one reviewed list inside the
  game file (one source of truth: the game, the server and the tests read the same block). Each word is checked against
  all 13 rude-word lists, its own script and length limits (tests/unit/doodle-words.test.js). Japanese uses kana (as
  children write them), Traditional Chinese characters, Arabic and Hebrew run right to left (Arabic shows the letters
  joined under the slots). Native review of ja and zh-Hant is recommended before marketing in those languages.
- **Drawings are memory only.** The server relays checked strokes and keeps the page only for a late joiner or a reload;
  it is wiped at the end of every turn and of the session, and never stored, logged, analysed or sent to any AI (a
  static test checks the room's code imports none of that).
- **Turns, so 16 players at most.** "Every mode holds a full class" stays the rule, with one written exception,
  `A.TURN_MODES` (`doodle`): 30 turns of 80 s would be 40 minutes a round. A team mode for classes (one drawer a team) is
  a follow-up.
- **Safety tools:** the host's Clear drawing (every screen), Skip turn (by turn number, so a double tap skips one),
  Remove (a removed drawer's turn ends and the page goes) and Pause; each player's **Hide drawing** (just for them; when
  at least half the guessers, and at least 2, hide it, the drawing goes and the turn is skipped); the usual Report.
  Drawers are told "Draw pictures, not letters".
- **On its own:** "Guess Pip's doodles" (Pip draws 8 of his own 40 doodles stroke by stroke; Easy or Medium) and pass
  and play for 2-6 on one device (nothing leaves the device; nothing is submitted for a shared screen).
- **After the reviews (6 Nov 2026):**
  - *Japanese and Traditional Chinese words are held back* (`DOODLE.LANGS`, the game's `WORD_LANGS`): they have no
    native review yet, and the rude-word lists for those scripts are short, so a tray there can't be checked as well.
    Those pages play with English words until a native speaker has reviewed both lists; the words stay in the game.
  - *A grown-up must be watching.* Drawings go out only while the host's page (which shows every drawing live) is open:
    12 s without it, the game pauses itself, and it goes on when the page is back. A dashboard alone doesn't count (it
    shows no drawing). This replaces "the room ends 10 minutes after the host leaves" as the protection for drawings.
  - *Remove locks the room*, so a removed guest can't come straight back under a new nickname. Not a ban by address:
    a family on one home network shares it, and a sibling would be locked out.
  - *Every tray is checked anywhere in its run of tiles*: the server adds the game's hashed copy of the site's lists to
    `profanityMatch` (which looks at word starts); on its own the game uses the hashed copy (no rude word is written in
    the game file; `scripts/doodle-bad.mjs` writes it and a unit test keeps it in step with the lists).
  - *Short words are no anagram puzzle*: an answer of 4 tiles or fewer gets 4 decoys at least, and wrong guesses a turn
    are 3 for 3 tiles or fewer, 5 for 4-5 (else 12).
  - *A blip never ends a game*: a reloading seat (8 s) is still in the game for the turn order, "everyone got it" and the
    hide vote; a seat that joined but never connected stops counting after 8 s.

- **Guess while drawing, typed or out loud (7 Nov 2026, after the owner played it on an iPhone).** Tiles gave the
  letters away and guessers waited for nothing: now guessing is open for the whole drawing, and **typing on the
  device's own keyboard is the default**; letter tiles stay as the host's "Letter tiles (easier)" for little ones (and a
  choice on the solo setup card). This changes "Nobody types" above, with the no-chat rule kept: a typed guess goes to
  the server only (as code points: the wire protocol still carries no strings), is compared and forgotten (never kept,
  logged or sent to an AI); the drawer and the host's page see a wrong guess only when it is a word of the game's own
  reviewed list or its plural (sent as its id, at most 3 a guesser a turn so words can't spell a message), otherwise
  "Sam guessed something else"; a close guess is "So close!" to that guesser alone (to everyone else it is "something
  else"); other guessers never see anyone's guess on their own device (the host's page, perhaps on a shared screen,
  shows the drawer's list). In a live frame the SDK still makes every text box
  read-only except Doodle Hoot's one guess box, and only when the server says so (`INIT.live.guess`). A guess **said out
  loud** is awarded by the drawer's (or the host's) **Someone said it!** → **Who guessed it?** (once something is drawn,
  once a player a turn, normal speed points, the drawer's usual share, marked "said it out loud" in the list); pass and play has the same button, with the word covered while the
  others watch. The mobile pass: a word never breaks inside (type shrinks to fit), one column of word cards on a narrow
  phone, and the guess box stays above the on-screen keyboard. Details: docs/doodle-hoot-plan.md §15.

## Word Trail (7 Nov 2026)

The owner asked for an official sight-word game for ages about 4-8 with Duolingo's mechanics (not its branding), to
replace a member's game (`/play/my-new-game-9`). Built as **Word Trail** (slug `word-trail`), guided by Bramble, our own
hedgehog, in the felt-and-paper look of the Story Builder's felt kit (the owner's style call, over the storybook
"breeze" look).

- **Content.** The 220 Dolch words in five units (Pre-primer 40, Primer 52, Grade 1 41, Grade 2 46, Grade 3 41) on a
  winding trail: 43 lessons of 4-6 new words, then a review stone and a treasure chest per unit. Each word has a short
  example sentence of our own, with the word exactly once, and the same sentence with the word left out (`c.*`).
- **Lessons.** New words first (the word, its sound, the sentence), then 12 exercises: hear it/tap it (4 cards),
  see it/say-pick (3 play buttons), fill the sentence (3 cards), build it (letter tiles plus look-alike letters: b/d,
  m/n…), match pairs (sound to word) and a speed tap (a 14 s bar, no heart lost on time-up). Wrong choices are look-alikes
  from the words met so far; never two that sound alike (to/too/two, for/four, right/write…); in fill the sentence they
  are a kind of word that cannot fit the sentence (a word class per word). A wrong answer shows and reads the right one
  and comes back once at the end of the lesson. All of it is the game's pure `WTCore` block, unit-tested with node:vm.
- **Mechanics.** XP (10 a lesson + 1 a first-try right answer + combo and no-mistake bonuses), a daily streak (local
  days), 5 hearts that only stop a *new* lesson (never one in progress), one back every 10 minutes or by practising,
  combos at 3/5/8, a mastery box 0-5 per word (Leitner, spaced by lessons played: 0, 1, 2, 4, 7, 12), missed words first
  in later lessons and in practice, and "My words" with each word's stars. Saved in `BRB.storage` (`word-trail-v1`);
  after each lesson and treasure, `BRB.gameOver({won: true, score: total XP})`.
- **AI voices.** Registered in `tts-lines.GAMES` like every official game: every line of its I18N block except the
  screen labels (`ui.*`) is read, in Bramble's friendly role (its VOICES block): 692 lines, about 9,000 characters in
  English. Each word is a line of its own and matched whole (no joins), so the word list can never be strung into a
  sentence. The game only ever speaks its own keys (unit-tested). New audio is limited per person per minute, so the
  game fetches ahead only the new words of a lesson; **warm Word Trail's lines at /admin/voices** once English is on, so
  every line plays from the cache.
- **Language.** The words, sentences and Bramble's lines are English: the game teaches English reading. The screens'
  few labels are English too (a translated label next to English words would mix two languages for a 5-year-old, and
  the kit's translations don't cover our labels); the catalogue text is in all 13 languages.
- **Art.** `tools/blender/word_trail.py` builds Bramble (four poses: idle, cheer, think, sad-but-kind) and the props
  (chest, signpost, trees, bush, flowers, trail stones) with the felt kit's materials in soft warm daylight and renders
  them as 2D sprites, plus grey felt and paper swatches; `tools/blender/word_trail_pack.py` makes the WebP data pack
  (`public/vendor/data/word-trail/<version>/art.js`, about 140 KB of WebP). The backgrounds, cards, buttons, bar and
  hearts are CSS and SVG cut-outs with those textures multiplied in and stitched edges; the words themselves are plain
  dark Andika on light paper, never textured. Original designs only: no owl, nothing of Duolingo's look, copy or sounds.
- **The member game it replaces** is not hidden automatically: `scripts/seed.js` REPLACED matches a game by its
  owner's name and title, and this one needs the owner's say-so (and the maker's username) first.

## Story Builder: choices, and changing a story afterwards (7 Nov 2026)

The owner asked for richer input (the kind of story, the voice, the music, the feeling) and a way to tweak a story
once it is made (docs/story-builder.md "Choices" and "Changing a story").

- **Choices are closed lists** (`services/story-options.js`): style (bedtime, adventure, funny, rhyming, fable with a
  lesson, mystery), tone (cozy, exciting, silly, heartfelt, brave), narrator (the language's own narrator, or one of six
  site voices with kid names: coral, sage, nova, shimmer, fable, onyx) and music (six moods, one of them "no music").
  Anything not on a list falls back to the default, so only the two optional short texts (who is in it, a lesson) and a
  rewrite note are free text; they go through the same screening as the idea and reach Claude as data in their own tags.
  The safety rules in the writer's prompt are the same for every style; "mystery" and "adventure" are explicitly never
  scary or dangerous. The world is still the felt kit: the prompt maps people, pets and places onto the kit's animals
  and sets, and the form says so ("everyone becomes a felt animal friend").
- **Music stays code-composed.** Five moods besides silence, each with its own metre, tempo, harmony and instruments
  (music-box tines; marimba + pluck + woodblock; horns + ostinato + timpani in a minor key; bells over a pad in Lydian;
  a piano). A unit test checks they differ on several measures, not just that the bytes differ. The CPU renderer
  service accepts the mood too.
- **Voice samples** are one fixed line per language (`stories.voiceSample`), synthesised once per voice and pinned in
  the TTS cache (at most 13 × 7 lines, ever), rate-limited per person, and offered only while the AI voice is on for the
  page's language. Kids never choose the sample text.
- **Changing a story never breaks the one that plays.** A change is a sub-job on the finished row (`remake_status`),
  so the story stays `done` and shared while the new version is built in `<story>/next`; its files are moved over the
  old ones only when it is complete, and a failure leaves the old video untouched (the owner can try again or keep the
  old one). File URLs carry `?v=<version>` so no one sees a cached old file.
- **Don't pay for the GPU twice.** Every rendered scene clip is kept under a key of its pictures (set, time, props,
  characters, camera, seed, render size) — not its length, which follows the narration. A new voice, new music or new
  words render nothing; a clip a little short for its new length is slowed (up to 1.5×) and then holds its last frame.
  A rewrite renders only the scenes whose pictures changed. Clips no version uses are removed. Costs about one more
  copy of the scenes on disk per story (smaller than the video at the scenes' 12 fps). The CPU renderer service
  (`STORY_RENDERER=remote`) builds whole videos and returns no clips, so there a change re-renders everything; Modal and
  local keep clips. Stories made before this have no clips: their first change renders once.
- **Limits.** Quick changes (words, voice, music): `STORY_REMAKE_LIMIT` a day (4; grown-ups and staff 8). A rewrite
  calls Claude, so it counts like a new story against `STORY_DAILY_LIMIT`, needs the AI budget, and waits in the same
  queue (`STORY_QUEUE_MAX` counts changes too). One change at a time per story. Changes are logged in `story_edits`,
  which survives deleting the story (deleting doesn't refund a rewrite) and goes with the account.
- **Sharing.** A kid's shared or waiting story goes back to "waiting for OK" when a new version replaces it: the
  grown-up approved the old words. A grown-up's shared story stays shared. Only the owner can change a story.

## Admin approval before a game goes public (Nov 2026)
Owner: "before a game is published to the live site it needs to go through admin approval. Users can still share with
themselves and friends, but not publish on live site without Oomba admin."
- **Only a person makes a game public.** `publish()` (server/services/publish.js) never moves a version to `public`
  without a platform admin's approval. The model review still runs first when a key is set: "needs changes" / "blocked"
  sends the game back at once (no person is needed to say no), and "allowed" is kept on the version as a hint for the
  admin ("Model pre-check" in the queue). An older model approval (from before this) still covers family, class and school
  sharing, never public (`approvalScope`). Group sharing (family / class / school) is unchanged.
- **Waiting for review.** A game that isn't live yet and is published for Everyone goes live **for the builder's friends
  at once** (a grown-up's: their grown-up connections) and waits for the team (`pending_visibility='public'`). Friends
  sharing was already instant at any time; doing it here saves a second step and keeps the public request (choosing
  Friends afterwards withdraws it, as before). The Studio shows "⏳ Waiting for review" and that someone on the team checks
  every game; the builder keeps playing, sharing with friends and editing. **Please confirm** this friends-at-once step.
- **Editing after approval: the approved version stays live** until the new version is approved (the existing
  `pending_version_id` path). It is the safer of the two options (strangers only ever see a version a person approved)
  and the kinder one (an update never takes a public game down). Re-approving the exact same version is not needed when
  the visibility goes back to public (same bytes, same verdict).
- **Every public surface follows from this.** Home, search, explore, featured, the sitemap, `/g` and `/play` for
  strangers, share images and live rooms all read `visibility='public' AND status='published'` (`visibleWhere(null)`,
  `canView`), and only an approval writes that, so nothing else needed changing. There is no remix or fork feature today;
  a game started from a template or another game is a new game and goes through the same queue.
- **Sending back.** Preset, kid-friendly reasons (`review.reasons.*`, translated; `games.review_reason`) plus an optional
  note the admin types (shown as typed, like before). The builder gets a notice from the Oomba team in their inbox when
  a game is approved or sent back, and the Studio shows the reason.
- **Grandfathering** (migration `0055_admin_review`): the version every game public at upgrade time plays is marked as
  approved by the team for everyone (`review_report.by='admin'`, `for='public'`, `grandfathered=1`, the earlier reviewer in
  `was`). Nothing public is taken down. Official seed games (`scripts/import-game.js`, `by: 'seed-import'`) count as approved.
- **The queue.** Admin › Review queue (and a "⏳ Review" button with the count in the admin header; the count is also on the
  admin's Me tab), with the preview, scan, model hint, who made it and what it is waiting for.

## Admin messages: the Oomba team inbox (Nov 2026)
Owner: "They should also be able to chat all users." Read as: an admin can write to anyone, and send an announcement to
everyone (or a group).
- **One inbox, not a second system.** Team messages are rows in `chat_messages` between a person and the official account
  (`OombaAcademy`), shown as "Oomba team ✓" at `/chat/OombaAcademy` and on top of the chat inbox; the unread count joins
  the Friends badge (grown-ups: the Family badge and a link on /family; this thread is their only chat, and `/chat`
  itself stays closed to them). `chat_messages.sent_by` records which admin wrote; nobody signs in as the official account. Admin › Team inbox
  lists the conversations; the admin writes from `/admin/messages/<username>` ("Message" on a user).
- **Children (the rule in "Owner requests": no stranger chat, adults and kids are never friends).** The team is adults,
  so a direct message to a child is allowed only when a grown-up sees it: each team message to a child, and each reply,
  is copied at once into the team thread of their linked family grown-up and, for school students, their school's
  admins; the message to the child is in the audit log with its text. **Owner's decision (November 2026): the team may
  message any kid account**, because it is Oomba's own trusted staff: a child with nobody to copy can be messaged and
  can reply; both directions are in the audit log with their text, and the admin's page says no copy goes to anyone. A
  child's reply uses the friends-chat filters, pause and burst limit, plus a daily cap.
- **Announcements**: everyone, kids, grown-ups, teachers and school staff, or one school (never guests, banned accounts or
  the team account). Step 1 shows how many people it reaches and returns a confirm code bound to the audience and the
  words; step 2 sends it. At most one every 10 minutes and 5 a day for the whole site; each is audited and kept in
  `announcements` (one 'announce' message per person, so it has the usual unread and report). Not copied to parents
  (the same words go to everyone).
- Rate limits: an admin's direct messages 30 per 10 minutes. Team messages can be reported like any message; nobody can
  block the team (it is how we tell builders about their games).

## Admin: New users (Nov 2026)
Owner: "see all new users added to the platform so I can better monitor usage."
- **This replaces "no browsing of players" for admins.** Admin › New users lists every real account newest first:
  display name and username, account type (kid, grown-up, teacher, school staff, platform admin), joined (UTC), how
  (signed up, made by a grown-up, school account, Google), the linked grown-up or school, last active, games made /
  public / waiting, plays of their games and games they played, and active or suspended. Filters: type, today / 7 / 30
  days / all, search by name; 50 a page; a sign-ups-per-day sparkline (30 days) with tiles; CSV export (same filters, at
  most 5,000 rows, cells starting with = + - @ are prefixed so a spreadsheet never runs them; every export is audited).
  Each row opens the Users tab, which now also lists the person's games, report counts, their audit entries and a
  Message button.
- **Privacy**: only what the Users tab already showed: never a password, token, session, friend code or IP; for a child
  only names, who looks after them and counts. Guests are left out. Admin pages stay English (like the rest of /admin).

## Admin: user analytics (Nov 2026)
Owner: "I also want to see user analytics like games played, last login, built games, etc."
- **New users became All users** (`/admin?tab=people`, `server/services/admin-analytics.js`). Every real account (no
  guests, not the Oomba team account, not deleted or merged tombstones), 50 a page, every column sortable both ways (also
  a Sort by / Order pair in the filter form): name, type (with how they signed up and the linked grown-up or school),
  joined, **last login**, **last active**, **days active in the last 30**, **played** (plays and different games),
  **built** (games made, public, waiting), **AI messages**, **course steps**, **live games joined**, **plays of their
  games**, status. Filters: type, active (last day / 7 / 30 days, not for 30 days, never), joined (today / 7 / 30 days, or
  a from-until date range in UTC), search. Quick views: New (30 days), Active today, Active this week, Never active, Top
  players, Top builders, Most AI messages. `?tab=newusers` (the old tab) opens the New view, and `/admin/new-users.csv`
  still works. CSV (`/admin/users.csv`): the same filters and order, every column, at most 5,000 rows, the same
  spreadsheet-safe cells, audited (`admin.export_users`). Aggregates are pre-grouped once per table and joined to the
  accounts; 5,000 accounts with 60,000 plays list in about 20 ms (test in `tests/unit/admin-analytics.test.js`).
- **A person's Activity** on the Users tab: last login (and how), last active, days active, plays (different games,
  minutes), games built / live / public, plays of their games, AI Builder messages (all and 30 days), course steps done
  per course (band, done of the band's steps), live games joined and hosted; 30-day charts of plays and Builder
  messages and a strip of active days; the 5 games they play most; and a timeline of the latest sign-ins, games started
  and published, plays, Builder messages per day, course checks and wins, and live games.
- **Stats** gains Active people: DAU / WAU / MAU (distinct accounts used per UTC day), WAU against the week before,
  DAU / MAU, new vs returning this week, an active-people-per-day chart and the most active people of the week (days
  active, then plays and Builder messages). Plays, games built and Builder messages per day and the top 10 games of the
  week were already there.
- **Where each number comes from.** Last login: `users.last_login_at`, set by every sign-in (`auth.startSession`;
  sessions themselves are deleted at sign-out and swept a day after they end, so they can't answer "last login").
  Sign-ins: `sign_ins` (user, time, how: password, Google, a grown-up's Switch, sign-up), no IP and no browser.
  Last active: `users.last_seen`. Days active and DAU / WAU / MAU: `user_days`, one row per account per UTC day it
  signed in or opened any page signed in (written on a day's first request). Games played: `plays`. Built / public /
  plays of their games: `games` (deleted games left out). AI Builder messages: `builder_usage` (charged messages per
  day; a refunded build is given back). Course steps: `course_progress`, done by the courses' own rule (slides read,
  check passed, and for a step with a game the game reported won). Live games: `live_run_scores` (joined; games without a
  class are kept 90 days) and `live_runs` (hosted).
- **Not tracked before this update**: last login and days active. Migration `0056_user_analytics` fills them from
  what is stored: last login from the newest session still stored, else the sign-up for self sign-ups; sign-ins from
  stored sessions (how unknown); active days from plays, Builder messages, stored sessions, course and Number Quest
  activity, the last-seen day of anyone who signed in and the sign-up day. Older history is only as good as those rows,
  so "days active" and DAU read low for days before the update. Class lesson progress (`step_progress`) is not counted
  as course steps. Time spent on the site (other than play minutes) is not tracked.
- **Privacy**: admin-only like every /admin page (404 for everyone else, signed out included); counts, dates and game
  titles only: never a password, token, session, IP, browser, email, chat text or Builder request text. Kids' rows show
  their names and counts, to the platform admin only (teachers and grown-ups have their own, narrower views).
  `sign_ins` and `user_days` are kept 400 days (daily `analytics-retention` job), deleted with the account, and moved on
  a school-account merge. Guests write neither. Admin pages stay English.

## Everyone builds like a teacher, and prompting tips while the AI builds (November 2026)

The owner asked that individual users get the same game-building experience as teachers. `BUILDER_FULL_FOR_ALL` (on by
default) makes every signed-in account in good standing a full maker (`builder/usage.js trustedMaker`): the Pro model on
every message (one message, never the Pro weight), the longer time cap, 20 model calls and 3 playtest fix rounds.
Guests are not included. Set it to 0 to go back to teachers and staff only if AI spend runs high; the AI daily budget
still applies to everyone. The Studio's build card now alternates "Prompting tip" lines (12, in every language) with
the "Did you know?" facts, a tip first; the facts about rounds and Pro were updated to match.

## Automatic welcome from the Oomba team for new kids, parents and teachers (November 2026)

The owner asked that every new kid get the team's welcome message automatically, then "one for parents and teachers as
well. For teachers offer to set up a demo or training session and give them my Greg@oomba.ai email for anything time
sensitive." (`services/team.js`, "automatic welcomes".)
- **Three audiences, three texts.** Kids, parents (grown-up accounts) and teachers & school staff each have their own
  on/off and text on the admin Team inbox tab (settings `team.welcome` for kids, unchanged from the first version, plus
  `team.welcome.grownup` and `team.welcome.teacher`; on by default; saving is audited `admin.team.welcome`). `{name}`
  becomes the first word of their display name; line breaks are kept.
- **When.** Kids: at the account's first sign-in ever (`auth.onFirstSignIn`: signing up, or a kid made by a grown-up
  or a school signing in for the first time), copied to their linked grown-ups like any team message. Parents: at a
  grown-up account's first sign-in. Teachers & staff: when an account becomes a teacher or school admin
  (`schools.onStaffJoin`, called from `addMember` with a staff role and from `updateMember` changing a student to
  staff: the People tab, a staff login card, a Google staff invite; a class teacher is always staff of the school
  already), at a first sign-in that is already staff, and when a "Set up my school" request sent from an adult account
  is marked done (`school-requests.onRequestDone`). Grown-up accounts can't join a school, so "a parent who becomes a
  teacher" is the request path: they get both welcomes.
- **Once, new accounts only.** One row per account and audience in `team_welcomes` (migration 0057; the kid welcomes
  already sent were backfilled from the audit log), so each goes at most once per person and audience; only accounts
  made in the last 30 days; never guests, banned accounts or platform admins. Each is a plain team message with no
  admin sender ("automatic welcome" on the admin thread), audited `team.welcome` with its audience, unsendable, and the
  person may reply. Grown-ups read theirs in the team thread at /chat/OombaAcademy (the 📬 link and badge on /family);
  teachers in their chat inbox.
- **Teachers never get the kids' text.** The teacher door has no account form: "I'm a teacher" leads to the "Set up my
  school" request, and a teacher may then make a kid-type account to be added by username (grown-up accounts can't join
  a school). So "I'm a teacher" (/signup/for/teacher) and a "Set up my school" request sent signed out set a functional
  cookie (`brb_teacher`, '1', 30 days, nothing about who), which the sign-up routes read and clear: a kid-type account
  made that way waits 3 days for the kids' welcome (made staff meanwhile: the teachers' welcome instead; still a kid
  after the wait: the kids' one at a later sign-in), and a grown-up account made that way (or from /teachers/live's
  "Host a game", ?next=/live) gets the teachers' welcome instead of the parents'. A kid welcome that did go out to an
  account that then becomes staff is taken back (unsent, audited `team.welcome.withdraw`), unless they already wrote to
  the team or a grown-up got a copy.
- **Accuracy edits to the owner's drafts:** "dozens of free learning games" became "lots of free learning games" (about
  30 official games, some only inside courses); the parents' Family page line says what it does today ("add your kids
  or link the accounts they already have", plus the copy of any team message to their child) instead of "see what they
  play and make", which it doesn't show; the teachers' course line says what each course has: all three are mapped to
  standards (Common Core math, CSTA, CYBER.ORG) with teacher notes, and CS Quest's lessons are 45 minutes, instead of
  "full lesson plans ... aligned to standards" for all three.

## Jungle Cup: a snappier joystick in Mango Dash (November 2026)

The owner said the joystick in the mango race "isn't quite as responsive as I'd like". Measured with real touches on a
390 x 844 phone, one frame at a time (`tests/e2e/jungle-cup-dash-stick.spec.js`), four causes, all in the game's own
stick (`tools/jungle-cup/src/core/04-input.js`; Jungle Cup doesn't use the Oomba Kit):
- **A thumb by the edge started with a push.** The base was moved on screen and its centre went with it, so a thumb
  within about 64 CSS px of the left or bottom edge read as a push (a corner landing: a full push down-left, the
  carrier running backwards). The centre is now always where the thumb landed; only the drawing is pulled on screen.
- **Turning back after an overshoot needed the thumb back past where it landed.** Past the rim the centre now follows
  the thumb (a full push that way), so a turn back reads as soon as the thumb turns.
- **A 15 % dead zone and full speed only at the rim (50 CSS px).** Dead zone 10 % for every stick sport; Mango Dash
  reaches full speed from a 70 % push (a lighter push is still slower). Before, a 70 % push ran at 65 %.
- **The carrier eased in slowly** (90 % of full speed after 150 ms; a juke after 167 ms). Now 100 ms and 117 ms, eased
  the same at any frame rate; slick mud still slides. Keys and a gamepad get the same quicker easing.
The edge fix, the following centre and the dead zone are shared by the island walk and Paddle Smash; the 70 % curve and
the easing are Mango Dash only. No other balance change: the pigs' tells and lunges are as they were.

## Spark Packs: the Builder's limit card offers a way on (8 Nov 2026)

The owner asked that when a builder runs out of Builder messages, the Builder keep saying it is resting for today (as
now) and also offer a way on: a paid plan for a free account, and more messages for a paid one, with Stripe, tested end
to end for both kinds of account. This replaces D16's "kid pages never show a nudge to ask a grown-up" for the limit
card only; every other D16 / §17 rule stays (no prices, plan names or links to grown-up pages on a child's page).

- **The name: Spark Packs** (⚡). A spark is the small thing that gets a build going again; it is short, kind to read
  aloud, works as "a Spark Pack" and "Spark Pack messages", and doesn't sound like money or a game currency (no coins
  or gems: the unit stays "Builder messages", one message = one credit, so nothing new to explain). Translated as a
  name in every language (Funkenpaket, Paquete Chispa, Pack Étincelle, Pacchetto Scintilla, Vonkpakket, Pacote Faísca,
  набор искр, スパークパック, 火花包, حزمة الشرارة, חבילת ניצוצות); en-GB inherits the English.
- **Sizes and prices** (Stripe one-time Prices, found by lookup key like the plans; amounts live in Stripe, never in
  code): `oomba_spark_25` 25 messages **$4.99** (20¢ a message, the Basic plan's rate), `oomba_spark_60` 60 messages
  **$9.99** (16.7¢, the one marked first), `oomba_spark_150` 150 messages **$19.99** (13.3¢). At about 9–10¢ of AI cost a
  message (D4's arithmetic) every size keeps a margin after Stripe's fee. The size names its messages in code
  (`services/sparks.js` SIZES); the page sends only a size key, so changing an amount on the page or in the request
  changes nothing.
- **Who buys:** a grown-up whose family plan (Basic or Family) is on, on /family#sparks: password again (the same
  step-up as plans), one button per size with its price, the terms (one payment, no renewal, who shares it, the expiry,
  the daily limit, refunds, tax), then Stripe-hosted Checkout, `mode=payment`, the family's Customer, its "Family"
  payment method configuration, address required, `integration_identifier` `oomba_spark_tmzqbwhe`, no promotion codes,
  metadata (family, `kind=spark_pack`, size, pack id) on the session and its PaymentIntent. Stripe emails the receipt.
- **Who uses them:** the family's grown-up and its first `FAMILY_MAX_CHILDREN` linked children, whatever the plan (Basic
  too), and still after the plan ends, until each pack's time runs out (`SPARK_PACK_EXPIRY_DAYS`, 365). Order: the free
  daily messages, then the plan's extra messages, then packs (while the free pool rests: extras, then packs), up to
  `SPARK_PACK_DAILY_MAX` (60) a builder a day; the oldest-expiring pack first. A Pro message uses the plan's Pro weight
  but never more credits than are left: a balance never goes below 0 (also a CHECK on the table). Never in class: a
  member of a school with a plan builds from the school's pool. Paid by the paid AI pool, whose ceiling grows by
  `SPARK_PACK_AI_USD_PER_MESSAGE` (10¢) for each message used from packs this month and each one left in a usable pack.
- **Crediting:** the webhook (`checkout.session.completed`, `…async_payment_succeeded`) or the return page's own sync
  (`/family?sparks_checkout=…`, which only trusts the family's own row or session), re-reading the session from Stripe,
  once (idempotent on the event id and on the pack row). A delayed payment credits only when it arrives; a failed or
  expired Checkout credits nothing. Refunds take back the refunded share of the messages from what is left (a full
  refund, a dispute or an early fraud warning ends the pack); messages already used stay used. A build given back
  (`turns.refund`) returns the very credits it took (`spark_ledger.turn_id`). Every change is a ledger row.
- **The limit card** (`builder/upsell.js`, `public/js/studio.js`): the lead ("You have used all your Builder messages
  for today", 🌙) and the things to do now stay. Then: a child with a linked grown-up taps **Ask my grown-up** (no plan:
  "unlock more Builder messages"; plan on: "a Spark Pack"); the grown-up gets a Family badge and the request on /family
  with one tap to /plans or the pack picker (closed when bought, dismissed or after a week; ids and dates only). A child
  with no grown-up is shown `oomba.ai/parents` as text and a QR code (never a link) next to the existing "link your
  grown-up" line. A grown-up building gets a link (/plans, or the pack picker); school staff get /plans; a school student
  "ask your teacher"; nothing is offered while the AI rests for everyone (the free pool or the site-wide ceiling, or the
  paid pool at the owner's own cap), nor while Spark Pack messages are left and only today's cap is reached. While the
  card shows, the Studio reads its state again every 45 seconds and when the tab comes back into view, so a purchase
  lifts the card without a reload.
- **Admin:** /admin/billing's Spark Packs panel: this month's packs and amount, messages left, the latest packs (Stripe
  link, Revoke), and Grant (a grown-up's or a linked child's username, 1–1000 messages, a note; audited
  `admin.spark.grant` / `billing.spark.revoke`). Refunds are made in Stripe; the webhook takes the messages back.
- **Data:** migration `0058_spark_packs` (`spark_packs`, `spark_ledger`, `builder_asks`). A daily job ends packs whose
  time ran out and deletes closed asks and never-paid checkouts after 90 days.
- **For the owner to confirm:** the three prices; packs only for families with a plan (a free family is offered the
  plan first); packs last 365 days and stay usable after the plan ends; refunds of unused packs on request within 14 days
  (the /refunds page doesn't mention packs yet: the legal text needs a line before packs go live); the kid-facing ask.
- **Owner setup (Stripe and Render):** in Stripe (sandbox, then live) create a Product "Spark Pack" with three one-time
  Prices in USD, $4.99 / $9.99 / $19.99, lookup keys `oomba_spark_25` / `oomba_spark_60` / `oomba_spark_150` (tax
  behavior as the plan Prices). No new webhook events: the endpoint already sends `checkout.session.completed`,
  `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`,
  `charge.refunded`, `charge.dispute.created` and `radar.early_fraud_warning.created`. The restricted key already has
  Checkout Sessions (write) and Prices / Charges (read). Turn on Settings → Customer emails → "Successful payments" for
  receipts. On Render nothing is required (the defaults above); optional `SPARK_PACK_EXPIRY_DAYS`,
  `SPARK_PACK_DAILY_MAX`, `SPARK_PACK_AI_USD_PER_MESSAGE`. Until the Prices exist the picker says "Spark Packs aren't on
  sale yet" and the reconcile job logs the missing lookup keys.

## Classroom fixes from simulated class sessions (8 Nov 2026)

Four simulated sessions (a new teacher, a school admin, a student, a live class) found where real classes would stall.
- **Live games, touch:** on touch screens the browser's follow-up click after a tap could land on another button inside
  the game frame (reproduced in Chromium touch emulation at a high pixel ratio: Tug of Math typed "96083" for 903). Tug's
  keypads ignore a click within 800 ms of a pointer press; Would You Rather votes on lifting the finger from the card it
  pressed and ignores the click after it. `tests/e2e/live-touch.spec.js`. Still to check on a real Android phone, iPhone
  and touchscreen Chromebook.
- **An old open room:** "Open the room" with a room still open no longer uses `confirm()` (which a dismissed dialog
  turned into "go back to the old room"): the landing names the old game, when it opened, whether it started and how many
  players are connected, with "Go back to it" / "End it and open the new game". Lock / Unlock room stay in the host's
  controls during the game. "N of 60 players" counts connected players, with "· N disconnected".
- **Live details:** Tug's grade starts at the class's grade when opened from a class; Game settings hide (and don't send)
  the quiz fields a game with its own options doesn't use; ties say "You tied for place 1 with 5 other players", all-zero
  says "Everyone tied!", team games show only the team place; the student end screen hides "Play again" (which leaves the
  room) while the teacher can still start a rematch; Atlas medals only for points, ties share a place; "Play as a guest"
  in a class room says why not (`onlyYou`); the Teacher view dialog offers a new window on the same computer.
- **Codes in the wrong box:** a 6-character class code in /join (Google sign-in off) says so and links /classes?code=…;
  7 digits in the class-code box go on to /join with the code in the #fragment.
- **Class live banner:** a student's class page (polling `/api/classes/:id/live` every 8 s), My classes and Home show
  "Your teacher started a live game · Join now" for the class's open room (class members only).
- **Staff invites (`staff_invites`, migration 0059):** a school admin adding someone's own account sends an invite; they
  become staff only when they accept on My classes / Teach. The platform admin's adds stay immediate (appointing a new
  school's first admin). People shows "Invited, waiting" with Cancel. Audited `school.staff_invite*`.
- **Teacher identity:** staff see their school's real name for them in their own header and Me page (never public
  pages); no character maker on a staff Me page; the Chat page's safety line is written for adults; automatic welcome
  copies to school admins and a school account's own welcome are stored read, so they don't badge Me / Friends.
- **Self-marked game steps** show ☑️ "Marked done by the student, not played here" in a lesson's progress grid (no time
  and no score recorded); real play shows minutes. No schema change.
- **School setup:** a school admin of a school with no classes (who teaches none) lands on the school page, which shows a
  self-ticking checklist (teachers → classes → students in classes → rules/time zone, and Billing). Settings warn about
  unsaved changes, the chat hint follows the choice, and an unset time zone offers this computer's zone.
- **People:** "Put in a class" and "Change real name" in a student's ⋯ menu; an empty class opens "Students already at the
  school" first (with Select all shown and a Not-in-a-class filter).
- **Login cards** stay viewable to the teacher who made them for 24 hours (in memory, never stored), linked from the
  class's Students tab. Sign in has Show password; a school account's card password typed with spaces counts as dashes
  (the second check runs against the dummy hash for any name, so timing says nothing).
- **/teachers:** the request form asks "Your name" (optional; fills in the school admin's name for the platform admin);
  after sending, the thank-you is first on the page with what a teacher can do today. A provisional self-serve teacher
  account was **not** built: it changes who may create children's accounts before a school is verified, an owner decision.
- **Lessons:** assign shows "Assigned to … · See who's started" next to the form; the zone note links Settings for
  school admins; Number Quest is a ready-made chip; the Game picker is grouped by subject; Draft with AI takes the class's
  grade and subject; New lesson stays on the class's Lessons tab; a student's lesson has "Read to me" (device voice only,
  teacher text) and "About this lesson"; the Studio opened for a lesson's build step links back to the lesson.
- **Billing tab:** a live total under the number of students, "Free for every school" vs "A School plan adds", and the
  invoice form's country from the school's request (Postcode / County for non-US).

## Billing ready to switch on (8 Nov 2026)

- **What is left is the owner's:** docs/billing-go-live.md lists every Stripe Dashboard and Render step, the decisions
  still open (Step 0's cost data, D0/D3/D4/D6, the Basic and Family prices, the Spark Pack confirmations, D9's Radar
  rule, D15's legal sign-off) with the answer the design already assumes, one real purchase and refund, and how to
  turn billing off again (`BILLING_PUBLIC` off hides plans and keeps existing ones; no Stripe key stops billing). No
  price or open decision was changed.
- **"Ready to go live?" on /admin/billing** (`services/billing-ready.js`): one row per check, green or red, each with
  what to do, read by setting name only (never a key, secret, `pmc_` id or a prefix of one; the test greps the page
  for them): a live restricted key and `STRIPE_LIVE_OK`, the webhook secret, a signed **live-mode** event received
  (only verified events are stored; a live event while the key is a test key is named), every Price by lookup key for
  the current key (a test key with every Price says to make them in live mode), `STRIPE_PMC_FAMILY` (and
  `STRIPE_PMC_SCHOOL`, optional), Stripe Tax collecting (D9), `TERMS_PUBLISHED`, `CONTACT_EMAIL`, an https
  `PUBLIC_URL`, the AI key, `PRO_TURN_WEIGHT=2` (D5), every paid-plan word translated, and `BILLING_PUBLIC` last.
  Prices are read from the cache; **Check again** (`?recheck=1`) reads prices and Stripe Tax again. All green folds
  the list. Phone layout: each check a card, its chip above the words (admin.css, "Ready to go live?").
- **Translations:** the paid-plan keys were already in all 12 locales (status.md's "English only" line was stale);
  `server/i18n/billing-keys.js` names them (prefixes plus the `paidN` items of /parents and /safety) and
  `tests/unit/billing-i18n.test.js` fails on a gap, naming the keys.
- **/refunds and Spark Packs:** a "Spark Packs" section between Refunds and Special cases, in 13 languages, worded from
  what sparks.js does: no renewal; a full refund of an unused pack within 14 days; a refund takes back what is left (a
  full refund ends the pack, a partial one its share; used messages stay used); a dispute ends it; messages end a
  year after purchase and still work after the plan ends. Marked for the owner's and the lawyer's sign-off
  (docs/legal-review.md item 45). `LEGAL_UPDATED` was left alone: it is also the parent-made accounts' notice version,
  so it moves on sign-off.
- **Review fixes:** `BUILDER_FULL_FOR_ALL` (on by default, "Everyone builds like a teacher") makes every signed-in maker
  build with Pro at one message each, so `PRO_TURN_WEIGHT` changes nothing while it is on: the panel's Pro row says so
  (green) instead of asking for a setting that does nothing, and docs/billing-go-live.md's D5 row says to measure Step 0
  and price on Pro messages, or turn `BUILDER_FULL_FOR_ALL` off. The restricted key's permissions gain Products (read)
  (a subscription is read with its Price's Product). The panel's admin-only test now also tries a grown-up, a guest, a
  school admin, a teacher and a student. `billing-checkout.test.js`'s Pro-weight check runs with `BUILDER_FULL_FOR_ALL`
  off, as the other regular-maker tests do (it failed since #257 made the flag default on).

## Teacher plan: $119 a year per teacher, 14-day free trial (9 Nov 2026)

The owner decided a new **Teacher plan**: **$119 per teacher per year, no per-student charge**, covering all of that
teacher's classes and students, with a **14-day free trial that needs no card**. It **replaces the per-student School
plan** (D6) for new purchases: schools buy N Teacher plans ("teacher seats") on one subscription. Stripe is set up in
live mode: Product "Oomba Teacher plan" (`prod_Vb0YSjk70xhUar`), Price `price_1UZoXC3TnSduDqoY3sZfm1IK`, $119/year,
tax behavior exclusive, lookup key **`oomba_teacher_yearly`** (`PRICE_LOOKUP_KEYS.teacherYearly`; the price list is
read with `limit: 100` so every key fits in one page).

- **Owners.** A teacher's own plan is owner `teacher` (the teacher's account id), quantity 1. A school's teacher seats
  are owner `school`, plan `teacher`, quantity = teachers, bought by card Checkout or the existing invoice / purchase
  order path (`createInvoiceSubscription`, send_invoice, now at the Teacher price × teachers). The school's admins give
  the seats to teachers on the Billing tab (`teacher_seats`); seats given beyond the paid ones (fewer seats at a
  renewal) count in the order they were given. A teacher is a non-grown-up account that is a teacher or school admin
  of a live school (`TP.isTeacher`); only they can hold the plan.
- **Free trial.** Checkout `mode=subscription` with `subscription_data.trial_period_days` (`TEACHER_TRIAL_DAYS`, 14),
  `payment_method_collection: 'if_required'` and `subscription_data.trial_settings.end_behavior.missing_payment_method:
  'cancel'`. **We chose `cancel`, not `pause`:** a paused subscription stays around as something to "fix" (it would block
  a new Checkout as unsettled and look like an unpaid plan), while a canceled one is a clean end: the plan's extras stop,
  nothing is deleted or locked, and the teacher can buy the plan later at /trial (with a card, since the trial is used).
  Teachers in a trial get the full plan (`trialing` entitles, as before). Stripe sends its own trial reminder email
  only if the owner turns it on (docs/billing-go-live.md 3.5a).
- **One trial ever** per teacher, per email (an HMAC of the work email with the server secret, `teacher_trials.
  email_hash`: the address itself is never stored by us; it is on the teacher's Stripe Customer, where the reminder and
  receipts go) and per school (a school's seat trial), per Stripe mode. A colleague at the same school can still have
  their own teacher trial: "per school" limits the school's seat trial, not each teacher. The trial is recorded when its
  subscription is first synced as trialing (the sync hook in services/teacher-plan.js), and checked before Checkout.
  Two Checkouts started at the same moment with the same email from two accounts could both trial (one open Checkout
  per owner prevents it for one account); accepted.
- **Automatic trial (11 Nov 2026).** The sign-up's first class (and /trial's "Start my free trial") now start the same
  trial through Stripe's API, with no Checkout page; a seat given to a teacher in their own trial closes it at no
  charge, and a teacher who already pays is warned, never cancelled. See "Automatic trial at sign-up" below.
- **Webhooks.** `customer.subscription.trial_will_end` is the 15th handled event (add it to the live endpoint). It sets
  `trial_notice_at` and sends one Team inbox message (services/team.js `notify`, kind `trialEnding`) with the link to
  add a card; My classes shows the notice (also from 7 days before the end). trialing → active (a card added, the first
  year paid) sends a thank-you and counts as a paid plan in the funnel (`teacher.plan`); trialing → canceled sends
  "your trial ended, your classes are still here" with the link to /trial. School seat trials tell the school's admins.
  New funnel step `teacher.trial` (trials started).
- **AI for the class.** The teacher and every active student of their classes share `TEACHER_DAILY_MESSAGES` (300)
  Builder messages a UTC day, charged to `teacher:<id>` and paid by the paid AI pool, so the site's caps still apply;
  each teacher with the plan adds `TEACHER_MONTHLY_AI_USD` (10) to the paid pool's ceiling. builder/usage.js: a legacy
  school pool first, then the Teacher plan, then the free messages. **A student in several paid teachers' classes**
  builds from the first class they joined whose teacher has the plan and messages left, then the next: the Builder has
  no notion of which class a build is for, so "the class in use" can't be known today. A student of a paid teacher
  never uses the family's extras or Spark Packs (no family money in class); Spark Packs stay family-only. At the cap the
  limit card says "ask your teacher" to a student and "you and your classes used today's messages" to the teacher
  (builder/upsell.js `teacher`), never a family upsell; a teacher without a plan is pointed to /trial.
  **Open:** 300 messages a day used every school day costs far more than $119 a year at today's cost per message; the
  paid pool ceiling ($10 a teacher a month) stops it first. The owner may want a per-student daily cap (as schools have)
  or a lower default; the setting is there.
- **Legacy per-student plans (grandfathered).** A school already on `oomba_school_seat_yearly` keeps it, renewals
  included, with its shared pool and per-student seats; nothing migrates it automatically, and no new school can buy
  it (the price only stays active in Stripe for those renewals). Its Billing tab says "Legacy plan" and /admin/billing
  lists it. Moving one to teacher seats is done by hand (cancel at period end, then teacher seats). Invoice requests
  made before carry `unit = 'student'`: the owner types the number of teachers when creating the invoice subscription.
- **`/trial`** (the marketing site's link; `/trial?seats=N` for a school): signed out → the teacher sign-up on the same
  page (name as students see it, school name, work email, username, a staff-length password, "I'm a teacher, 18+"),
  which makes an ordinary account, **their own school with them as its school admin** (so they can make a class at
  once: a self-serve school, new — before, only the platform admin made schools) and starts Checkout with the trial; a
  teacher with no plan → the work email and "Start my free trial" (or, trial used, "Get the Teacher plan" with the card
  and the password again); a teacher in a trial or paid → My classes with a notice; a school admin with ?seats=N → the
  school's seat trial; kids, school students and grown-ups → a page saying it's for teachers, with the families' plans.
  `/trial/thanks` (Checkout's success URL) confirms the session itself (`syncCheckoutReturn`), so the trial starts even
  when the webhook is slow. While the key is a test key, only billing testers may start a trial (D14): it is real AI
  money. Off with paid-plan pages (`BILLING_PUBLIC` / preview cookie): /trial goes to /teachers.
- **Copy.** /plans has a Teacher card ($119 per teacher a year, 14-day free trial, no card, unlimited students, 300 AI
  builds a day for the class) and the School card is per teacher with invoice / PO; /plans/schools' calculator counts
  teachers; the terms (7.3), the privacy policy (seats are teachers), /refunds (trials) and /teachers changed. New
  strings are in all 13 languages. Some keys keep their old names with new meanings (`plans.schools.print.perStudent`
  is now "Price per teacher"); the legal text changes need the lawyer's look with the rest of docs/legal-review.md.

## Trial emails: Resend, one-click unsubscribe and the Teacher plan trial sequence (9 Nov 2026)

The site sent no email before this. The owner chose **Resend** and approved a five-email sequence for the Teacher plan's
14-day free trial (no card), plus a thank-you on conversion.

- **Sending** (`server/services/email.js`): Resend's HTTP API (`POST https://api.resend.com/emails`, bearer key), no
  SDK. Settings: `RESEND_API_KEY`, `EMAIL_ENABLED` (default on; `0` stops everything), `EMAIL_FROM` (default
  `Greg at Oomba Academy <greg@oomba.ai>`), `EMAIL_REPLY_TO` (default `Greg@oomba.ai`), `EMAIL_POSTAL_ADDRESS` (CAN-SPAM,
  **no default**). Each send has an `Idempotency-Key` (Resend keeps it 24 hours) and is retried twice with backoff
  (1 s, 4 s) on network errors, 429, 5xx and Resend's "concurrent idempotent request" 409; other 4xx are not retried.
  Every send leaves one `email_log` row (to, template, category, status, Resend's id, a short error, tries): never the
  body. Kept a year (job `email-log-retention`), deleted with the account.
- **Two kinds of email.** `nudge` (marketing: the trial sequence) needs `EMAIL_POSTAL_ADDRESS`: while it is empty **no
  nudge is sent at all** (logged once at start-up and at the first due email; red notice on `/admin/emails` and
  `/admin/billing`), and never to someone who unsubscribed. `transactional` (the thank-you for a purchase, later
  receipts) ignores the unsubscribe.
- **Who and where.** Only to a grown-up account, a teacher / school staff, or the platform admin; never a guest, a banned
  account or a kid's (asserted in `send()` and in `onTrialStarted`; kid accounts have no address anyway). The address:
  the account's **Google sign-in address** (verified by Google) if it has one, else the **work email the teacher gave
  the Teacher plan's Checkout** (the Stripe Customer's email, where Stripe also sends receipts), kept in `email_prefs`
  (source `checkout`) for these emails. School-request emails (`school_requests`) are **not** used: they were given for
  the request only. No address: the email is skipped and logged (`no_address`).
- **Unsubscribe** (`server/routes/email.js`): every email has a signed link (HMAC of the account id under the session
  secret, labelled `email-unsubscribe:v1`, no expiry) and `List-Unsubscribe` + `List-Unsubscribe-Post:
  List-Unsubscribe=One-Click` headers (RFC 8058). `GET /email/unsubscribe?t=…` only shows a page with one button (mail
  scanners open links); `POST` unsubscribes (the button, or the mail app's one-click from its own servers: the route is
  mounted before the CSRF check and the grown-up guard; the token is the check). The page offers "Subscribe again".
  It sets `email_prefs.nudges_off_at`; transactional email is unaffected. English page for now.
- **The sequence** (`server/services/nudges.js`). Interface for billing: `onTrialStarted({ userId, trialEnd,
  trialStart, email })`, `onTrialConverted(userId)`, `onTrialEnded(userId)`; each idempotent, never throws. One
  sequence per account (the first trial). Rows in `trial_nudges` (`due_at`, `latest_at`, `status`, `sent_at`):
  welcome at the start (may go up to 48 h late); class on day 2 (24 h; **skipped if the teacher already has a class**);
  ideas on day 5 (48 h); ending 3 days before the end **plus 2 hours** (24 h; the 2 hours let Stripe's
  `trial_will_end` sync land first, so a teacher who already added a card never gets "add a card"); ended when the
  trial ends without converting (24 h); thanks on conversion (72 h, transactional). Conversion cancels what is left.
  The job `trial-nudges` runs every 15 minutes (the jobs.js loop, like billing-reconcile) and right after each event.
  **No double sends:** a row is claimed (`sending`) before the call and marked after; a row left `sending` by a restart
  is retried after 10 minutes with the **same** Idempotency-Key (Resend drops the copy), and after 23 hours it is marked
  `failed` instead of risking a second copy. **Late rule:** past `latest_at` a row is `skipped` (`too_late`). Failures
  retry on later runs, up to 5 tries. The admin switch (`settings` `emails.trial_nudges`, on by default) and missing
  settings make due rows wait; the late rule still applies.
- **Copy** (`server/emails/trial-en.js`, rendered by `server/services/email-templates.js`): the owner's approved words,
  HTML (tables, inline CSS, 560 px, dark-mode overrides, `lang`, hidden preheader with the preview text, a real button)
  and a plain-text part. Links carry `utm_source=oomba&utm_medium=email&utm_campaign=teacher_trial&utm_content=<email>`.
  Footer: "You're getting this because you started a free trial on Oomba Academy · Unsubscribe · {EMAIL_POSTAL_ADDRESS}".
  Signed "Greg / Founder, Oomba Academy" on #1, "Greg" after. Greeting: the first name (a teacher's school roster name
  first; "Ms Rivera" stays whole), else "Hi there,". The trial end date is in US Eastern time. Changes from the approved
  copy:
  - **Owner's request:** the walkthrough-call offer ("Want a quick tour? I'm happy to hop on a 15-minute call…") in
    #1, #2 and #5, and a short line in #3 ("Prefer a guided tour? Reply and we'll find 15 minutes.").
  - **Accuracy, #2:** "It's the moment most teachers tell us the room lights up" → "It's often the moment the room
    lights up" (no data behind "most teachers tell us").
  - **Accuracy, #3:** "each with lesson plans" → "CS Quest comes with full 45-minute lesson plans, and the other two
    with teacher notes" (Number Quest and Cyber Defenders have teacher notes, not lesson plans).
  - **#1:** "14-day" is filled from the trial's own length (`TEACHER_TRIAL_DAYS` can change it).
  - **#5** ("Your classes and games are saved") checked against the Teacher plan: a trial that ends without a card is
    cancelled by Stripe and only the plan's extras stop; nothing is deleted or locked (teacher-plan.js, and its test
    "nothing is lost"). Kept as approved.
  - **#4** "one yearly price for unlimited students, with no per-student fees" and "pay by invoice or purchase order"
    match the Teacher plan ($119 per teacher per year, no per-student charge; schools' invoice / PO path).
  - New: the thank-you ("You're all set!"), short, transactional.
  CTAs: #1 `/build`, #2 `/teach`, #3 `/teach/lessons` (the ready-made courses), #4 `/teach#teacher-plan` (Add a card),
  #5 `/trial`, thanks `/teach`. **i18n:** a language is a `trial-<locale>.js` file registered in `COPY`; English only
  for now (translating approved marketing copy would be guesswork), so every teacher gets English.
- **Wiring to the Teacher plan** (`services/teacher-plan.js`'s subscription sync hook; one line each): a teacher-owned
  subscription that is `trialing` → `onTrialStarted` (start from Stripe's `trial_start`, end from the row, email from
  the expanded Customer); `trialing` with a default card on the subscription or its Customer → `onTrialConverted`;
  `trialing → active` → `onTrialConverted`; `trialing → canceled` → `onTrialEnded`. A school's seat trial has no one
  teacher and gets no sequence. Stripe's own trial reminder email and the Team inbox notices stay as they are.
- **Admin** (`/admin/emails`, linked from /admin): the switch, sent / failed / skipped counts (30 days) and per email,
  preview of each email (HTML and text, a sample teacher) and "Send me a test" (to the admin's Google address, else
  `CONTACT_EMAIL`, else `EMAIL_REPLY_TO`; "[Test]" subject), the last 50 sends (addresses shortened), the settings by
  name (never the key) and the CAN-SPAM warning. Go-live steps: `docs/emails-go-live.md`.
- **Tables** (migration `0061_trial_emails`, after the Teacher plan's `0060_teacher_plan`): `email_prefs`,
  `email_log`, `trial_emails`, `trial_nudges`; all deleted with the account.
- **Tests:** `tests/unit/trial-emails.test.js` (templates, gates, kid accounts, retries, unsubscribe, the scheduler's due
  times, skip rules, conversion, the end without a card, restarts, late catch-up, admin only) and
  `tests/unit/trial-emails-wiring.test.js` (the Teacher plan's trial through the fake Stripe). Resend is never called:
  `email.js` takes a fetch stand-in.

## Teacher landing page at "/" (9 Nov 2026)
Owner: "build me an absolutely killer marketing website … top right a button that says Just Play … target teachers …
geared towards conversion … 14 day free trial … very futuristic … parallax … optimized for SEO."
- **Who sees it:** `GET /` with **no session at all** (first visits, search engines, link previews) gets the teacher
  landing page (server/routes/landing.js). Everyone with a session (kids, students, teachers, grown-ups, and a guest
  who already played) gets the home page they had, unchanged. The hook is one router mounted just before the home
  route in app.js (search "LANDING HOOK"); `renderLanding(req, res)` is exported for whoever reworks the home route
  (the Play/Learn homes). `LANDING_AT_ROOT=0` turns it off; the unit tests (tests/unit/_setup.js) and Playwright
  (playwright.config.js) set it off by default because their older specs describe the signed-out home, now at /play.
- **Just Play:** `JUST_PLAY_URL = '/play'`. `GET /play` hands the request on to today's home route, so the arcade (doors,
  featured game, rows) is reachable without touching its renderer. /play is private to search engines (`PRIVATE_RE`:
  `X-Robots-Tag: noindex`); its canonical still names "/", whose indexed content is now the landing. Old links to
  `/#play` (the app's "▶ Play now", `/go/kid`) reach the landing's `#play` band, and landing.js sends them on to /play.
- **Self-contained:** its own header, footer, public/css/landing.css and public/js/landing.js (vanilla; no app.css or
  app.js). In Oomba's own brand (app.css): the app's dark mode by default (warm charcoal, starry sky, soft mint and
  yellow light, the app's tactile mint buttons, real game covers in the hero and on each course); an explicit Light choice (`theme` cookie, footer links) gets the app's cream light mode with the same layout; "same as my device" stays dark.
- **Motion:** parallax on fixed star/aurora layers and in-page elements (`data-sky`, `data-depth`), transforms only,
  one requestAnimationFrame per scroll burst, passive listeners; the hero's lesson → Builder → game loop runs only
  while on screen. With `prefers-reduced-motion` nothing moves and the hero shows its finished picture. Without
  JavaScript every word is there (reveal-on-scroll only hides what starts below the first screen).
- **Words:** under `landing.*`, written in all 13 languages (`landing.` is outside the readiness share, like `teachers.`),
  inserted as text by scripts/i18n-add-landing.mjs from scripts/landing-strings/. Only true features: the Builder takes
  lesson text, PDFs, pictures and text files (server/builder/uploads.js), playtests on phone/tablet/desktop sizes, keeps
  versions, and a person reviews anything public; the three courses with their real standards claims; live games;
  safety as /teachers states it. "Why games work" is qualitative, with two real citations (Roediger & Karpicke 2006;
  Hattie & Timperley 2007). **No testimonials, logos, ratings or user counts** (a test guards it).
- **Prices:** none on "/" (kids are never sold to; amounts live on /plans). The pricing section says "one simple yearly
  price per teacher", unlimited students, 14 days free, no card, 300 AI game builds a day, and links to /plans;
  `LANDING_SHOW_PRICE` (off) would show the Teacher price and add an `Offer` to the structured data. Every trial button
  is `/trial` (the Teacher plan's trial, feature/teacher-plan); schools: mailto Greg@oomba.ai and /teachers#start.
- **SEO:** title/description aimed at teacher searches, canonical, hreflang for every language, Open Graph/Twitter with
  /og/landing.jpg (scripts/og-images.js), one JSON-LD graph (Organization, WebSite, WebPage, SoftwareApplication without
  price/rating, FAQPage matching the visible FAQ); the sitemap's "/" entry lists the landing's languages and picture.
- **Counting:** funnel tally "Teacher landing (signed out)": views (people only) and the beacon `POST /landing/count/<cta>`
  for trial, Just Play, pricing and "see how it works" (daily totals, same rules as the home doors). No PostHog.
- **Checks:** tests/unit/teacher-landing.test.js; `BASE=… node scripts/landing-audit.js` (LCP, CLS, sideways scroll,
  parallax, reduced motion, at six sizes, dark and light); scripts/layout-audit.js with `MAX_PAGES=1`.

## Rubrics: reusable rubrics, scoring by tapping a level, points in the gradebook (9 Nov 2026)

Teachers asked for proper grading tools: a rubric they write once and use on many lessons, scored quickly on a phone,
with the points in the gradebook and the CSV, and the result shown to the student.

**What a rubric is.** Levels (columns: a name and points, 2 to 6) × criteria (rows: a name and one descriptor per
level, 1 to 12). Points are 0 to 100 in halves; the most a student can get is the top level's points for every
criterion. Rubrics live in the school's lesson library (`/teach/rubrics`, the third tab of the library), in the
teacher's own list, like lessons: `rubrics` table (migration `0063_rubrics`), `services/rubrics.js`,
`routes/rubrics.js`, `views/rubrics.js`.

**Library.** New rubric (three criteria × Beginning 1 · Developing 2 · Secure 3 · Excellent 4 to start from), an
editor whose row buttons (add / remove a level or criterion, move a criterion) save what was typed and come back to the
same row, a preview grid, a print view (`/teach/rubrics/:id/print`, black on white, name and points lines), copy,
share with the school (colleagues see it in "Shared by colleagues" and copy it; they never edit it), delete.
**Delete while in use** is refused (409 `inUse`) unless the request says `detach=1`; the page's Delete button says how
many lessons it is on and sends `detach=1` after that confirm. Scores already given keep a snapshot of the rubric, so
neither editing nor deleting a rubric ever changes a result (an edited rubric bumps `version`; a score from an older
version is shown with "the rubric has changed since this was scored").

**Starters.** CS Quest's exit-ticket rubric lines (`seed-lessons/cs-quest/lessons/*.json`, `exit.rubric` and step
rubrics; 46 lessons) are offered as starter rubrics: "Add to my rubrics" makes a library rubric with levels Not yet 0 ·
Beginning 1 · Developing 2 · Secure 3 and the lines' English descriptors. The CS Quest inline step rubric
(`lesson_steps.rubric`, 0-3 marks that feed the Standards tab) is unchanged and works alongside: a step can carry both.

**Draft with AI** (`services/rubric-ai.js`) uses the same path as the lesson "Draft with AI": the builder model through
`builder/anthropic.js`, counted in the AI budget, JSON schema output. Only the task and grade the teacher typed are
sent: never a student's name, answer, drawing or game. Without a key (or when the AI is resting) a template rubric in
the teacher's language is made. Staff of the school only, 30 an hour.

**Attaching.** `lesson_steps.rubric_id` on steps that collect work (a written question / exit ticket, a Studio build
hand-in) and `lessons.rubric_id` for the whole lesson. A teacher attaches their own rubrics (school admins: any of the
school's); a colleague's shared rubric is copied first. Copying a lesson keeps the copier's own rubrics attached and
copies a colleague's rubric into the copier's library once (`copyLesson`).

**Scoring.** On the lesson's progress page the review form of an answer or handed-in build shows the rubric: tap a
level for each criterion (cards that wrap on phones; "Not scored" too), an optional comment per criterion, the written
feedback, "Save and mark reviewed" (the existing review, then `rubric_scores`). The whole-lesson rubric gets its own
section, one folded card per student, with feedback. The score is checked before anything is saved; the teachers of
the class and school admins only, for students of the class only. `rubric_scores` keeps the picks, comments, points,
most possible, the scorer and the snapshot.

**Gradebook and CSV.** Each lesson cell shows "📏 points/most  %" for scored work, Overall shows the rubric percentage
across scored lessons; the CSV adds "<lesson> (rubric points)" and "(rubric %)" columns for lessons with a rubric, then
"Rubric points" and "Rubric %" totals (only when the class has rubrics, so CSVs without rubrics are as before). The
percentage is of the criteria scored so far: a criterion with no level adds nothing to the points or the most possible,
and feedback or comments alone are not a score at all (see "Review fixes" below).

**Students** see their own result on the lesson page under "From your teacher": the feedback, the level given per
criterion with its descriptor, the teacher's comments and the points; the whole lesson's result in its own panel. A
student only ever gets their own rows (`scoresFor(classLesson, own id)`); nobody else (other teachers, other schools,
students, kids, grown-ups, guests) can open a rubric page or API (404). Deleting a step, a lesson or a class deletes its
scores; account merges move them.

**Review fixes (9 Nov 2026).** A review of the first build found two scoring bugs and three polish items:
- *A score is "the same rubric" only when `rubric_id` and `version` both match* (`R.sameRubric`). Before, a step switched
  to another rubric that was also version 1 kept the old picks, a form with no level tapped carried an out-of-range pick
  into the points and the save failed with a 500 after the feedback was already saved. Now the review form shows "the
  rubric has changed" and checks nothing, carried picks are bound-checked (an impossible one becomes "not scored"), and
  saveScore refuses an out-of-range pick before writing. A score left behind by a rubric swap does not count
  (`R.scoreCounts`): the gradebook, the CSV and the student's page leave it out until the teacher scores again. A
  rubric taken off (detached or deleted) keeps its scores, as before.
- *Only scored criteria count.* `max_points` is the top level's points × the criteria with a level, so whole-lesson
  feedback or a comment with no level stores 0/0 and is left out of every total and percentage (the student still sees
  the feedback and comments). A partial score says so: "3/4 points · 1 of 3 scored" on the review page and the
  student's page, and "1 of 3 scored" under the gradebook cell (`R.scoredOf`; the cell adds up the scores in it).
- The library's "Used in N lessons" counts distinct lessons (a rubric on three steps of one lesson is one lesson), the
  same number as the editor's `usage()` and the delete confirm.
- On the review page each answer card's rubric fields fold away ("📏 Score with …", with the total once scored); the
  first card of each step that still needs review, and a card whose score came from another rubric, start open. A
  class of 30 on a phone is no longer several metres of radio buttons.
- Every sideways-scrolling tab row (`nav.tabs`, app.js) scrolls its current tab into view on load, so the active
  "Rubrics" tab is not cut off in Hebrew / Arabic on a phone.
## Standards beyond computer science: Common Core Math and ELA (9 Nov 2026)
Owner: "Build all of those suggestions" (teacher portal: grading and curriculum tools). This stream: standards.
- **Data:** server/standards/ccss-math.json (Mathematics K-8: 229 standards + sub-standards, codes in the form Number
  Quest already cites, `3.OA.C.7`, `3.MD.C.7a`) and ccss-ela.json (ELA K-8: RL, RI, RF (K-5), W, SL, L; `RL.3.1`,
  `RF.K.3c`). Official statements, built once by scripts/build-ccss.js from the npm package @weo-edu/standards 0.1.6
  (MIT; the corestandards.org text). Cluster letters come from Number Quest's cluster registry. Dropped on purpose: W.2.4
  and W.2.10 ("begins in grade 3"; the source filled them with grade 3's text), anchor (CCR) and 6-12 literacy
  (RH/RST/WHST) standards. server/standards/ccss.js reads them (normId accepts `CCSS.MATH.CONTENT.…` and `3.MD.C.7.A`);
  frameworks.js lists CSTA, CCSS Math, CCSS ELA (the ids never overlap).
- **License notice:** "© Copyright 2010. National Governors Association Center for Best Practices and Council of Chief
  State School Officers. All rights reserved." is shown (in English) wherever Common Core standards are listed: the
  class tab, the lesson's standards page, staff Learn cards, the CSV's last line and the JSON (`notice`).
- **Official tags** (server/standards/official-tags.js, accurate and conservative): Sum Racer by track (1.OA.C.6,
  2.NBT.B.5, 3.OA.C.7, 3.NBT.A.1, 4.NBT.B.4); Tug of Math by grade (the game's own TugGen kinds; grade 4's mixed
  expressions and grade 8's powers of 2 left untagged); Fraction Factory (2.G.A.3, 3.NF.A.1-3, 4.NF.A.1-2, 4.NF.B.3);
  Word Trail (RF.K.3c, RF.1.3g, RF.2.3f, RF.3.3d); Shark Plank (RF.K.1d, RF.K.3a); Word Peek (L.3.2f, L.4.2d). No codes
  for Word Hunt, Doodle Hoot or the any-subject quiz games (their questions' own `cat` decides). Number Quest: each
  step's **primary** codes from units.json. Tug of Math Live: the grade in the run's starter id. A lesson's Tug of Math
  step counts only its lesson's grade (never all eight). Maths starter sets in Oomba Live are not saved with the run,
  so they are not counted.
- **Teacher tags:** table `lesson_standards` (migration 0064: lesson_id, step_id '' = whole lesson, framework, code,
  added_by, created_at), only Common Core (CSTA tags stay on lesson_steps.standards as before); up to 60 per lesson;
  only whoever can edit the lesson (owner, school admins); copied with the lesson (onto the copy's steps), deleted with
  the step or lesson. Page `/teach/lessons/:id/standards` (picker by framework, grade, domain and words; "Add to" the
  whole lesson or a step) linked from the lesson editor's new 🎯 Standards panel; step cards show their codes and the
  codes their official game practises. Colleagues who can see a shared lesson see its tags read-only.
- **Class tab:** framework chips on `/class/:id/standards` (no `fw` = the CSTA tab, unchanged below the chips;
  `?fw=ccss-math|ccss-ela` = services/standards-ccss.js `classView`). Coverage per code: assigned lessons (their tags,
  their official games), live runs in the class, courses the class's students are in; a summary of top-level codes
  covered per grade; "every grade N standard" view; one student's levels; CSV (counts only, no names);
  `GET /api/classes/:id/standards?fw=`. Mastery from work already recorded, nothing new stored: practised (a finished
  tagged step / official game / Number Quest step), questions (quiz items by their `cat` code, else the step's or
  lesson's tags; live items the same; a whole Tug run's correct/answered; Number Quest's 3-question check), rubric.
  A student meets with ≥ 80% right over ≥ 3 answers or a rubric score ≥ 2/3 of its maximum; the class with 80% of its
  students (the CSTA rule). Levels: none / practised / developing / meets.
- **Rubrics interface:** `registerRubricSource(fn)` in services/standards-ccss.js. fn({ classId, framework, studentIds })
  returns [{ userId, code, score, max, at }]; bad rows, unknown codes and other students are ignored, a throwing source
  is skipped. The rubrics stream registers one; this module reads none of its tables.
- **Learn (staff only):** the codes under each official game card and `?std=` (a code or its start, e.g. `3.OA`,
  `RF.K`) to filter; kids and visitors never see codes and the parameter is ignored for them.
- **Who may see what:** class pages / CSV / JSON: the class's teachers and school admins (S.canManageClass); tag APIs:
  L.canEditLesson; search and game-codes APIs: school staff. Everyone else 404 (signed out: sign-in page / 401).
  Students see nothing new. Words under `standards.*` in all 13 languages (scripts/i18n-add-standards.mjs from
  scripts/standards-strings/); codes and statements stay in English (`lang="en"`).
- **No new env vars, no owner action needed.**
- **Checks:** tests/unit/standards-ccss.test.js (data, tags, coverage, mastery, rubric sources, authorization),
  tests/e2e/teach-standards.spec.js (flow, a student's 404s, 360/390/1280, light/dark, Hebrew).
- **Review fixes (9 Nov 2026):**
  - The picker's "Add to" (#sf-t) is a `data-autosubmit` select: choosing a step reloads with `?to=`, and
    public/js/standards.js also copies its value into every "+ Add" form, so an Add never goes to the last searched
    target. e2e: pick a step, press "+ Add" without Search, the tag is on that step.
  - **Levelled games** (official-tags.js `LEVELLED`: Tug of Math, Sum Racer, Fraction Factory, Word Trail) are no
    longer credited with every grade they span. `stepGameCodes(slug, fw, grade, options)` (practice) gives the track
    or chapter the step is locked to (`lock=1&level=N` for Sum Racer, `lock=1&chapter=…` for Fraction Factory,
    `FRACTION_CHAPTERS`), else the codes of the lesson's grade, else nothing. `stepGameCover` (coverage only, never
    practice): the same, or for an ungraded, unlocked step of Sum Racer / Fraction Factory / Word Trail all the game's
    codes; Tug of Math still covers nothing without a grade (eight grades would swamp the summary). The lesson editor's
    step chips use the same function and show a hint to give the lesson a grade when only coverage is known.
  - **Tug of Math Live** (a run with no per-item codes): a student's correct/answered is shared out across the grade's
    codes (20 answers over 2 codes: 10 each), not counted in full for each; the legend says these are estimates.
  - **Number Quest** progress is not tied to a class. It counts for a school account (the school owns it), or for a
    student who joined with their own account only from their class `joined_at` (their home work before joining is
    left out). One course check (3 questions) alone no longer makes a student "meets": it takes a second check or other
    questions on the code. Both are in the legend.
  - Learn (staff): the Standard box has its own visible Filter button (learn.js hides the form's no-JS one), and the
    course cards are left out while `?std=` is on (courses are tagged by step, not by course).
  - RTL: the group headings put the English domain name on its own line under the grade (standards.css).
## Google Classroom sync (9 Nov 2026)
Owner: "Build all of those suggestions" (leaning into the teacher portal's grading and curriculum tools; this stream is
the Google Classroom sync). Setup for the owner: docs/google-classroom.md.
- **Behind config:** on only with Sign in with Google (`GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`) and
  `GOOGLE_CLASSROOM=1`; every route answers like an unknown page while off, and the pieces other pages show render ''.
  `GOOGLE_TOKEN_KEY` (32 bytes, hex or base64; a malformed one stops startup, never echoed) is needed to store anything:
  without it the page says Classroom isn't set up and Connect is refused.
- **One client module:** `services/gclassroom-client.js` is the only code that talks to Google (token exchange,
  refresh, revoke, the Classroom API at `CLASSROOM_API_BASE`, default https://classroom.googleapis.com, refused in
  production when changed). Tests use tests/support/fake-classroom.js and the OAuth parts added to fake-google.js.
  Replies are capped (2 MB), 15 s timeouts, lists paged with a page cap; Google errors become a short code
  (`reconnect`, `denied`, `notFound` → "courseGone", `rateLimited`, `badRequest`, `googleDown`) shown in plain words.
- **Connect = incremental authorization:** a POST hands back a 5-minute signed start link bound to the session (as
  the Me page's Google connect does), the start writes the same PKCE/state/nonce flow cookie, and Google is asked for
  `openid email` + `classroom.courses.readonly`, `classroom.rosters.readonly`, `classroom.coursework.students` with
  `access_type=offline`, `include_granted_scopes=true`, `prompt=consent` (so a refresh token always comes back) and a
  `login_hint` of their sign-in email. Callback: `/auth/google/classroom/callback` (a second redirect URI). A box left
  unticked on Google's screen ("granular consent") is refused (`scopesMissing`); nothing is stored. Not
  `classroom.coursework.me` (only students' own work needs it), not `profile.emails`: no email is read.
- **Tokens:** the refresh token is sealed with AES-256-GCM (random 12-byte nonce, the teacher's user id as associated
  data, `key_tag` = a hash prefix of the key) in `gc_connections`. Access tokens live in memory under an hour; a 401
  refreshes once and retries; `invalid_grant` (revoked at Google) or a changed key marks the connection
  "connect again". Disconnect revokes at Google (best effort) and deletes the row; account deletion does the same.
- **Who:** school staff (`S.isSchoolStaff`) who manage the class (`S.canManageClass`: its teachers and school admins).
  Other teachers, students, guests: 404 on the page and APIs; students and guests can't start a connection (403); a
  platform admin who isn't staff sees the page but has nothing to connect. The connection is per teacher.
- **Link:** a class links to one course from the teacher's own active courses (`teacherId=me`), checked again on save.
- **Roster import, matched like Sign in with Google:** Classroom's `userId` is the Google account id that sign-in calls
  `sub`, so a student whose Oomba account already has that Google account joins the class (if they belong to this
  school); own accounts outside the school, other schools' accounts and staff are left out and counted (own accounts
  can use the class code). Someone new gets a school account bound to that Google account (generated username, the
  Classroom full name only as the staff-only roster name, no password; `google_identities` row with an empty email
  until their first sign-in, which then checks the school's domains as usual), so the school needs its Google domains
  first (`needDomains` otherwise). Nothing is shown to other students. At most 300 per import.
- **Post:** one CourseWork per class lesson (`gc_posts`): the lesson title, one fixed line, a link material to
  `/class/:cid/lessons/:clid`, `maxPoints` 100, and the due date as the end of the due day in the school's time zone
  (UTC to Google; left off when past, since Classroom refuses a past due date). From the class page or "Also post to
  Google Classroom" in the assign form (the assignment stands whatever Google says; the toast carries both lines).
- **Grades:** a lesson's score is the gradebook's done/total steps × 100. Sent to each submission of the teacher's
  coursework whose `userId` maps to a student in this class who has started; not started / not in this class / failed
  are counted. Draft (`updateMask=draftGrade`; the teacher returns it in Classroom) or assigned
  (`draftGrade,assignedGrade`). We never return work or touch coursework we didn't create (Google forbids it anyway).
- **Limits and audit:** 60 syncs an hour per teacher, 20 imports an hour per class, 20 connects an hour; every sync
  writes `gc_syncs` (kind, status, counts, error code: never names or grades; swept after 180 days, shown as "Recent
  syncs") and the audit log (`gclassroom.*`). Migration 0065.
- **Privacy:** listed in docs/legal-review.md ("Google Classroom sync") for the owner's legal review.

## Google Classroom sync: review fixes (9 Nov 2026)
A review of the sync found these; what changed:
- **Relinking (major):** a post now counts only for the Classroom class it was posted to (`gc_posts.course_id` equal to
  the class's current `gc_links.course_id`; `postOf` / `postsOfClass` join on it). Linking a *different* Classroom class
  deletes the old posts (and waiting students) in the same transaction, so the lesson shows **Post** again, "Open in
  Classroom" never points at the old class, and grades can't go to the old assignment (`sendGrades` also needs a live
  link). Unlink keeps posts, so unlinking and relinking the *same* class finds them again. Reposting replaces the row.
- **Roster import makes no accounts any more:** the import can't see emails (we don't ask for `profile.emails`), so it
  can't check a new student's domain. A student Oomba doesn't know yet now waits in `gc_pending` (class, Google id,
  staff-only roster name; added to migration 0065, which hasn't shipped) for 30 days. The first time they sign in with
  Google on one of the school's domains, `services/google.js` makes their school account and puts them in the class
  (also for a known account linking Google later, if it's this school's student). A personal or out-of-domain Google
  account gets nothing and its Google id stays free. Results say "N will join when they first sign in with Google on
  your school's domain"; the page shows how many still wait. Re-importing renews them and drops students no longer on
  the Classroom roster; unlinking clears them.
- **Deletes:** deleting a class removes its `gc_links`, `gc_posts`, `gc_pending` and `gc_syncs`; deleting a lesson removes
  the posts of its class lessons. The 12-hourly gclassroom sweep also removes rows whose class or class lesson is gone.
- **Lessons that open later** go to Classroom as `DRAFT` with `scheduledTime` = local midnight of the opening day where
  the school is, so they appear in Classroom when the lesson unlocks here. The toast says when.
- **"Also post to Google Classroom" starts unticked:** a post reaches real students and can't be undone from Oomba.
- **Completion grade, said plainly:** the button is "Send completion grades", results say "completion grades sent", and
  the page explains it's the share of steps done, not right answers. (Sending quiz scores instead is a later choice.)
- **RTL:** he/ar strings carry an RLM after Latin words such as "Classroom" so brackets sit on the right side.
- **Course list:** the page uses the five-minute cache; "Refresh the list" asks Google again; any fetch from the page
  is limited to 30 an hour per teacher. Linking still checks a fresh list.
## Google Classroom sync: optional scopes and automatic sync (10 Nov 2026)
The owner's consent screen has only the two read scopes so far, and the first version refused a connection without all
three (`scopesMissing`), so nothing worked. Decisions (the owner's) and what was built (docs/google-classroom.md):
- **Required vs optional scopes** (`gclassroom-client.js` `REQUIRED_SCOPES`, `OPTIONAL_SCOPES`): required are
  `classroom.courses.readonly` and `classroom.rosters.readonly`; `classroom.coursework.students`,
  `classroom.courseworkmaterials`, `classroom.topics` and `classroom.announcements` are optional. **Connect** asks for
  the read scopes only; **Allow Oomba Academy to post to Classroom** (`write=1` on the connect start link) asks for the
  optional ones, again with `include_granted_scopes=true`, `access_type=offline`, `prompt=consent`. Only a missing
  required scope is refused (`scopesMissing`); optional ones left unticked hide their features (`noneAllowed` when none
  was ticked). The stored `gc_connections.scopes` (filtered to the Classroom scopes) is the source of truth
  (`GC.can(userId, feature)`): it is rewritten from Google's answer at every token refresh, a required scope gone makes
  the connection "connect again", and a call Google refuses with `ACCESS_TOKEN_SCOPE_INSUFFICIENT` forgets that scope
  (`needsScope`). Every write control is hidden without its scope (page, assign form, APIs answer `needsScope`), and is
  replaced by a one-line note with the Allow button.
- **Automatic grades** (needs coursework): per linked class, off by default; the teacher turns it on with the existing
  draft/assigned modes (`gc_links.auto_grades`, `auto_by` = whose connection sends; a co-teacher saving the roster switch
  keeps it). Job `gclassroom-auto-grades` every 30 minutes: for each posted assignment whose `step_progress` moved since
  `gc_posts.auto_at`, `sendGrades(onlyChanged)` compares with `gc_grades` (per class lesson and student: grade and mode
  last sent, by hand or automatically) and sends only what changed (a switch to assigned sends again); nothing changed,
  no call to Google. Same roster rule as by hand (only submissions of the teacher's own coursework, i.e. their Classroom
  roster). Within the teacher's 60 syncs an hour (the same bucket); out of syncs waits for the next run. Errors back off
  (1 h, 2 h, … at most a day: `auto_fails`, `auto_next_at`); a connection that needs connecting again pauses it and the
  page says so with **Reconnect Classroom**; connecting again resumes, disconnecting turns it off. A lesson stops 30 days
  after its due day (90 days after posting when it has no due date). Logged as `autoGrades` only when something went.
- **Automatic roster** (read scope only, no push notifications): `gc_links.auto_roster`, on by default; job
  `gclassroom-roster-refresh` hourly re-imports classes whose last import is 6 hours old (only after a first import by
  hand), with the linking teacher's connection, within the class's 20 imports and the teacher's 60 syncs an hour; an
  error waits 6 more hours. Same import rules (school domain, 300 cap, `gc_pending`). Matched students are remembered in
  `gc_roster`; one missing from the Classroom roster gets `gone_at` and is listed as **No longer in Google Classroom**
  with **Remove from class** / **Keep** (`settleLeaver`). Nobody is removed automatically. The page shows "Roster
  updated <time>".
- **Topics** (needs topics): one Classroom topic per linked course, made at the first post and remembered
  (`topic_id`, `topic_course_id`); checked with a GET before each post and made again when Google says it is gone; a
  topic of the same name already there is used. Name: the class's own (`topic_name`, renamed in Classroom too) or
  "Oomba Academy" from the teacher's locale (`gclassroom.topic.default`; direction marks stripped). Without the scope,
  or when Google won't make one, posts go without a topic.
- **Materials** (needs courseworkmaterials): "Share as material" posts a `courseWorkMaterial` with the lesson's title,
  the fixed line and the link, no grade or due date (scheduled like a post for a lesson that opens later).
  `gc_posts.kind` ('assignment' | 'material'); the primary key became (class_lesson_id, kind): one of each per lesson.
- **Announcements** (needs announcements): three templates on the class page, each a form: a live game starting now
  (the code of the live game open for this class, `LS.openForClass`; never a typed code), a lesson that is ready (an open
  lesson of this class: title and link), and free text. The server builds the fixed part from the template
  (`announceFixed`) and adds only the teacher's note (`cleanNote`: plain text, line breaks kept); at most 500
  characters; a note containing a student's roster name, its first word, display name or username (whole words, 3+
  letters) is refused with the name shown under the field; 10 an hour per class. The log keeps the template and length,
  never the text. The live host screen of a class game links to it (**📣 Announce in Classroom**, host only, when allowed).
- **Not done** (owner): student emails, guardians, push notifications / Pub/Sub, a Classroom add-on.
- Migration **0067_gclassroom_auto** (gc_links columns, gc_posts rebuilt with `kind`, gc_grades, gc_roster). Class and
  lesson deletion and the sweep remove the new rows too. Unlinking forgets the class's settings.
- **Privacy:** the legal pages are not changed here (signed off 9 Nov); the sentences that would need the lawyer are
  listed for the owner (/privacy `google.setup.privacy.classroom`, docs/legal-review.md "Google Classroom sync").
## Google Classroom sync: hardening (10 Nov 2026)
An improvement pass (owner-approved plan, Part B) found three edges in the sync. Scopes, the data sent to Google and
the privacy pages are unchanged.
- **Grades that didn't go through are retried.** Before: `autoGrades` looked at a posted lesson only when
  `step_progress` moved after `gc_posts.auto_at`, and set `auto_at` after every run, even when some students' grades
  failed (a non-fatal error on their PATCH counted in `failed`). A student whose grade failed and who did nothing more
  was never sent again. Now `sendGrades` keeps per assignment `gc_posts.retry_at` / `retry_fails` (migration
  **0072_gclassroom_retry**): a send with a failure sets `retry_at` 1 h, 2 h, 4 h... (at most a day, the same back-off
  curve as the class's) after the run; `autoGrades` also looks at a lesson whose `retry_at` is due. Failed students are
  not in `gc_grades`, so they still count as changed and are the only ones sent again (`onlyChanged`); students whose
  grade went are not. A clean send or a quiet one clears the retry. Retries stop with the lesson's existing window
  (`autoEnded`: 30 days after the due day, 90 days after posting without one), go through the teacher's 60 syncs an
  hour, and don't back the whole class off (that stays for errors that stop a run). A manual send with a failure also
  leaves a retry for the automatic sync, if it is on. Reposting clears it.
- **Big classes get the plain answer.** Before: the roster and submissions were read with `listAll` at 5 pages of 100,
  so a course over 500 failed with a generic `badRequest` ("too many pages"), and one of 301 to 500 was read in full
  before the 300 check. Now `listAll` takes a `cap` and stops paging once more than that many entries were seen
  (`GcError('tooMany')`); the roster import passes 300, so it stops at the fourth page and answers `tooMany` ("more
  than 300 students"). Classroom gives no student count up front, so paging is the earliest point. Sending grades uses
  the new `eachPage`: submissions are read 100 at a time and paging stops once every student with a grade to send was
  found (often the first page), up to `SUBMISSION_PAGES` (10, so 1,000). Past that, the send doesn't fail: the grades
  found go, students not reached count as failed (so they are retried), and the log line is `partial` with `tooMany`.
- **Fewer false alarms in the announcement name check, and it says which word.** Before: any roster first name of 3+
  letters was refused as a whole word in any case, so a class with a May, a Will or an Art couldn't post "we will start
  in May". Now full roster names, display names of more than one word and usernames still count in any case. A one-word
  name (a roster name's first word, a one-word display name) that is on a short fixed list of everyday English words
  (`WORD_NAMES`: may, will, art, grace, mark, rose, max, jack...) counts only when written like a name: starting with a
  capital, not at the start of a sentence, and, for April, May, June and August, not after a date word such as "in",
  "by", "on" or before a number. Names off the list are checked as before. Why this rule: capitalization mid-sentence
  is how English marks a name, and the list only relaxes words a teacher writes in ordinary class news; everything
  else keeps the old, stricter check, and the list is English only, so other languages keep it too. Known gap,
  accepted: such a name at the start of a sentence ("Will did great") gets through. Last names alone are not checked
  (plain-word surnames such as Brown or Young would block much more than they protect; the full name is checked). The
  error now quotes the words from the teacher's message that matched (`gclassroom.errors.hasName`, 13 languages).
- **Checks:** tests/unit/gclassroom.test.js (retry, back-off, no resend, the window; the 300 cap after 4 pages; a
  1,050-entry submission list; the name check), with the existing fake Classroom.

## Weekly class summary email (9 Nov 2026)

Teachers get one email a week with counts for each class they teach, so they know where to look without opening the
site. The full picture, with names, stays on the site.

- **Who gets it:** active school staff who teach a class that isn't archived, at the address services/email.js
  already uses (their Google sign-in's verified address, else the one their trial checkout gave). Never students, kids,
  grown-up accounts or guests (`adultRecipient` + `isStaff`). With no address: a `skipped / no_address` row, no email.
- **What's in it (services/digest-email.js):** for each class, counts only: lessons due in the next 7 days, % of the
  work in open lessons done (the gradebook's `overall` rule), answers waiting for review, students who haven't
  started any open lesson, and live games played in the last 7 days. Links go to the class, its progress (or the
  review list) and "See this week's summary". **Never a student's name or answer.** Class names are in it, since
  teachers write them. Classes with nothing going on (no progress or live game in 7 days, nothing to review, nothing
  due) are left out, with one line saying how many. A week where every class is quiet sends nothing (`skipped / empty`).
  The HTML and plain-text parts use the same layout as the trial emails, are written in all 13 languages
  (`digest.email.*`, the teacher's site language) and read right to left in Hebrew and Arabic.
- **When:** at the day and hour the teacher picks on the Me page (panel `#digest`, `POST /api/me/digest`). The default
  is Monday at 7:00 in their school's time zone, else their own choice of zone, else America/New_York. A job runs every
  15 minutes (services/jobs.js). For each teacher it works out this week's slot, using the local date as the week key and
  handling daylight saving. It **claims** a `digest_sends` row (teacher, week) before sending and marks it after.
  Every try uses the Idempotency-Key `digest-<user>-<week>`, so a restart, a second process or a retry never sends a
  week twice. A row left mid-send is tried again after 10 minutes and marked failed after 23 hours (while Resend still
  remembers the key). A summary more than 12 hours late (downtime) is not sent, because it would read as last week's.
  A failed send is retried on later runs and given up after 5 tries.
- **Switches:** the teacher's own (`email_prefs.digest_off_at`): the Me page checkbox, and "Stop these summaries" in
  the email, which is the same signed one-click link as the trial emails plus `&c=digest` (with
  `List-Unsubscribe` and one-click POST support). It turns off only this email. Unsubscribing from the trial emails
  doesn't stop it, and this switch doesn't stop those. The admin's switch is the "Weekly class summary" row on
  /admin/emails (setting `emails.class_digest`), with counts, the skip reasons, a preview with made-up classes and
  "Send me a test".
- **Category `digest`, no postal address needed:** this email is about the teacher's own classes (a relationship
  message, not marketing), so unlike the trial nudges it doesn't wait for `EMAIL_POSTAL_ADDRESS`. The footer still
  carries the address when it's set. If counsel disagrees, adding `category === 'digest'` to the postal check in
  `send()` is a one-line change.
- **On the site: /teach/summary** ("This week's summary", linked from the Classroom header and the Me panel). This is
  the same counts plus what only the site may show: who hasn't started (real roster names, staff only), the lessons due
  with how many finished, and links to the answers to review. Answers themselves are not shown there either.
  `/teach/summary/email` shows the email as it would go this week (`?format=text` for the text part). School staff only:
  everyone else gets 404, a signed-out visitor goes to sign in, and only classes the teacher teaches are listed.
- **Data (migration 0066_class_digest):** `email_prefs` gains `digest_off_at`, `digest_day` (0 = Sunday, default
  1), `digest_hour` (default 7) and `digest_tz` ('' = the school's). The new `digest_sends` table holds one row per
  teacher per week: status, reason, the number of classes in it, attempts and times. It stores counts only, never a
  student's name or answer; the rendered email is held only while a send waits for a retry (see the review fixes
  below), and rows are kept six months. Sends are logged in `email_log` as template `class_digest`.
- **No new env vars:** it uses RESEND_API_KEY / EMAIL_ENABLED / EMAIL_FROM / EMAIL_REPLY_TO / PUBLIC_URL like the
  trial emails.
- **Checks:** tests/unit/class-digest.test.js (schedule and DST, counts, every language, no names, one send per week
  across restarts and concurrent runs, retries, every switch, the one-click link, and who may open each page and API,
  with the email provider faked); tests/e2e/teach-digest.spec.js (360/390/1280, light/dark, Hebrew, nothing touches,
  44 px targets, students 404).

## Weekly class summary: review fixes (9 Nov 2026)

A review of the weekly summary found no major problems and six small ones, all fixed:

- **Empty values:** `POST /api/me/digest` with `{"hour":""}` or `{"day":null}` was saved as midnight / Sunday
  (`Number('') === 0`). Day and hour must now be digits only (`/^\d{1,2}$/` on a string or number) and anything else is
  a 400 (`badDay` / `badHour`), with the saved value unchanged.
- **One a week, even after moving the day:** the week key is still the slot's local date, but a teacher is skipped when
  a summary for a slot less than 6 days earlier was already sent (`sentRecently`). Moving Monday to Wednesday after
  Monday's went out means the next one is the following Wednesday, not a second one that week.
- **Retries send the same bytes:** the first try stores the rendered email (subject, HTML, text) on its
  `digest_sends.message`, and every retry sends exactly that, so the shared Idempotency-Key never meets a different
  body (Resend would answer 409 `invalid_idempotent_request`, and a first try that did go out would be counted as
  failed). The message holds counts, class names and the teacher's first name, never a student's name or answer, and
  it's cleared as soon as the row is sent, skipped or failed.
- **Rows that can never go are closed:** each run (even with sending switched off) marks a `pending` or stuck `sending`
  row more than 12 hours after its slot as `failed / late`, so nothing waits forever under "Waiting" on /admin/emails.
- **Same language in the preview and the email:** the email goes in `users.lang`, else `email_prefs.digest_lang`, else
  English (`mailLocale`). `digest_lang` is the site language the teacher is reading in, remembered when they save the
  settings or open /teach/summary (or its preview), but not from a cross-site link's `?lang=`. The preview uses the
  same rule, so a teacher reading in German through their browser's language sees, and gets, German.
- **Active classes count only current students:** the "recent activity" count joins `class_members` (active students),
  like the review counts, so a teacher's own preview or a student who left doesn't make a class active.
- **The no-address notice:** it says "Connect Google" only where Google sign-in is set up (`googleEnabled()`);
  otherwise it says only that we don't have an address yet (`digest.page.noAddressPlain`, 13 languages).
- **Migration:** 0066_class_digest itself gains `email_prefs.digest_lang` and `digest_sends.message` (it hasn't shipped
  yet, so no new migration number).

## The teaching loop: Plan → Play → Check → Feedback (9 Nov 2026)
Owner: "Build all of those suggestions" (lean into the teacher portal's grading and curriculum tools). This part makes the
story visible: every tool a teacher needs already exists, so the loop names them in order and links to them.
- **One partial, three looks:** `server/views/teacher-loop.js` exports `teacherLoop(t, opts)` with the four steps (an
  emoji, a one-line benefit, the tools): Plan (Lesson library, Draft with AI, Turn a lesson into a game), Play (Assign to
  a class, Host a live game: only while live games are on), Check (Gradebook with its CSV, Needs attention first,
  Standards tab), Feedback (Answers to review, Written feedback students see). `variant: 'landing'` uses the landing's own
  lp-* classes (public/css/landing.css, one marked block at the end); `'page'` and `'compact'` use the app's tokens
  (public/css/teach-loop.css). With `links` (services/teach-loop.js `loopLinks`, built for the teacher's first class)
  each tool is a button to the real page; without them (visitors, kids, grown-ups) the tools are plain words.
- **Classroom home (/teach):** the compact card sits under the tools row, above My classes, until every step is done
  once or the teacher hides it; then a small "🗓️ How Oomba fits your week" button in the tools row opens `/teach/loop`
  (the full loop with ticks, the screenshots, and "Show the checklist on Classroom" while hidden). On a phone a step
  already done shows its name only.
- **Ticks from real data, no migration:** Plan = a lesson (`lessons.owner_id`) or a game (`games.owner_id`); Play = an
  assignment (`class_lessons.assigned_by`, not removed) or a hosted live game (`live_runs.host_id`); Check = the teacher
  opened their class's gradebook, its CSV, one lesson's progress or the Standards tab (`markCheck`, called after those
  routes' own class check); Feedback = an answer reviewed (`step_progress.reviewed_by`). The only thing stored is one
  `settings` row per teacher, key `teach.loop:<user id>`, JSON `{ check, hidden }` (times).
- **Who:** `/teach/loop`, `POST /api/teach/loop/hide` and `/show` are for school staff only (`S.isSchoolStaff`); anyone
  else gets 404 (signed out: sign in / 401). Each teacher only reads and changes their own state; a 404 on another
  teacher's class never ticks anything. The card names only the teacher's own class.
- **"Turn a lesson into a game" link:** the teacher's latest lesson at `#new-game` (the editor's "New game for this
  lesson", which opens on arrival), or the library's New lesson form when they have none yet.
- **"Needs attention first" link:** `/class/<id>/progress/<latest assignment>#needs-attention`; public/js/schools.js
  presses the sort button when the page opens with that hash.
- **Landing ("/") and /teachers:** one section each. On the landing it comes right after "How it works" (`id="loop"`),
  numbered cards like the steps above it, the four screenshots in the device frame, then the trial button. On /teachers
  it sits after Subjects (the "How it works" headings test stops at #play). No prices, and nothing about tools that are
  not built yet (rubrics, Common Core, Google Classroom sync, a weekly summary email: another stream; a test guards it).
- **Screenshots:** `node scripts/teach-loop-shots.js` makes public/img/teach-loop/{gradebook,attention,feedback,
  standards}.webp from a throwaway database with the seeded demo school (made-up names only, checked; prices checked),
  plus one CS Quest lesson with some work so the Standards tab shows Practiced rows. Captured at 2x from a 960x600
  window and scaled to 1280x800, 25-35 KB each (limit 80 KB, tested). Alt text and captions are in i18n
  (`teach.loop.shots.*`); the screens themselves are the English UI.
- **Words:** `teach.loop.*` in all 13 languages (scripts/i18n-add-teach-loop.mjs from scripts/teach-loop-strings/
  words.json); tool names the app already has (Lesson library, Draft with AI, Needs attention first, Download (CSV),
  Host a live game) are copied from each language's own keys. en-GB needs nothing (no spelling differs). In Hebrew and
  Arabic the arrows point left.
- **Checks:** tests/unit/teach-loop.test.js (ticks, hide/show, staff-only and per-teacher authorization, landing and
  /teachers sections, images, words); tests/e2e/teach-loop.spec.js (360/390/1280, light/dark, he; the landing too when
  run with `LANDING_AT_ROOT=1`).
- **After review (9 Nov 2026):** a teacher with no class yet gets one "🍎 Make your first class" button
  (`teach.loop.home.makeClass`, to `/teach#my-classes`) and the class tools (Assign, Gradebook, Needs attention first,
  Standards, Answers to review, Written feedback) as plain words, not six links that all went back to /teach. On a phone
  only the next step to do (`.is-next`) shows its benefit and tools on the Classroom home's card; the others show their
  name, so My classes stays near the top. One lesson's progress now always draws the "Needs attention first" chip and its
  `#needs-attention` anchor (it was only drawn for more than 3 students, so the loop's link landed on an unsorted page).
  Deleting an account removes the `teach.loop:<user id>` settings row (services/account-delete.js). German says
  "Lektion", as the app's lesson strings do, not "Stunde".

## Quiet Bounce and Popcorn Hush (10 Nov 2026)

The owner asked for "two new quiet time games like the one for Remi": one with balls that jump and rattle, one where
popcorn pops. Both are official noise meters on exactly Remi's plumbing: the play page measures loudness after a tap
and passes the game one number (`BRB.loudness`), the frame never asks for the microphone, nothing is recorded.

- **Same level maths, calibration, modes, goals and timings as Remi** (each game's core is unit-tested equal to
  `RemiCore`), so a teacher gets the same "too loud" line whichever meter they pick.
- **Quiet Bounce** (`quiet-bounce`): a glass jar of 30 bouncy balls with faces. Calm: a sleepy resting pile. Near the
  line: they jiggle and rattle. Over the line (leaky 1.5 s, so a single clap only rattles): they jump and hit the lid,
  the clock pauses and a "big bounce" is counted. Stars by big bounces, like Remi's wake-ups.
- **Popcorn Hush** (`popcorn-hush`): a popcorn machine whose kernels sizzle near the line and pop when the room is too
  loud. Popping reads as "too loud" (the machine looks flustered, the clock stops), not as a reward to chase.
- **Class tools, not fun games:** both are in `CLASS_TOOLS` (never Play's hero or featured, still in search) and on the
  teacher page's cards (`TEACHER_GAMES`); not in Brain breaks, which stay fun games plus Remi.
- `MIC_GAMES` lists the three slugs; `tests/unit/mic-scope.test.js` pins that list.


## Teacher quick wins (10 Nov 2026)

A teacher audit of the whole product (six reviewers, then a re-run live) found small things that were broken or wrong
for a teacher on day one. The owner said "go" on the bugs and the quick wins. This is that list, one line per fix, with
the choices that are not obvious. (The child-safety fix and "classmate chat off by default" are a separate change.)

- **"Turn a lesson into a game" (a).** The Classroom home's first step links to `/teach/lessons/<id>#new-game`, and the
  form there was `display:none` until the Add form's type was "Play a game". The hide rule now spares the form when it
  is the link's target, holds the target, or is open; `public/js/schools.js` opens it, scrolls to it and puts the
  cursor in its first field, on arrival and for links on the page.
- **Quiz scores (b).** A quiz step is checked by the site (score = % right). The teacher now sees it: "4/5 · 80%" in
  the lesson's table (`P.quizResult`, from the marks), "🧩 80%" in the gradebook cell (the mean of the lesson's
  finished quizzes) and under Overall, and in the CSV a "<lesson> (quiz %)" column after each lesson that has a quiz
  plus "Quiz %". A quiz that is not finished has no score.
- **Rubric scores on the Standards tab (c).** `registerRubricSource` had no caller. `services/rubric-standards.js`
  registers one (imported by the Standards routes): a library-rubric score is evidence for the Common Core codes on
  the scored step, else the codes on the whole lesson (the same fallback quiz items use); a whole-lesson score, for the
  lesson's codes. Value: points out of the most possible for the criteria scored. Only scores the gradebook counts
  (current assignment, step still there, the rubric the step or lesson still carries). Nothing new is stored. The CSTA
  tab keeps its own 0-3 marks, as before.
- **/trial on a phone (d).** The big buttons wrap inside the screen (they were one 456 px line), with room between
  the button and the small print under it. The username field says its rules up front ("3 to 16 letters or numbers,
  no spaces"), like the password's (an underscore is accepted too; the hint keeps to the simple rule). The small
  print no longer says "We don't keep your work email on your account": once the trial starts the address is kept
  for the trial emails and the password reset, so it says what the email is used for (the plan, through Stripe;
  emails about the trial; resetting a lost password).
- **Live game code through sign-in (e).** A class room seats signed-in students only. The code a student typed now
  waits in that tab (`sessionStorage`, 30 minutes) while they sign in, and is back in the box, one press from "Join as
  me". It is not put in the sign-in address: a code never rides in an address or the history, like the QR's fragment.
- **No repeated maths questions (f).** `engine.js pickSubject` draws a made-up sum again when the pick already has it
  (or it was played: `seen`), up to 40 tries, so a pick larger than a level's pool still fills. The server's redraw of
  a refused sum never puts back a question the set has, and a Brain Board column (tiles from three levels) never
  repeats a sum that two levels can both make. The games' solo packs (`public/vendor/data/live-bank/<version>`) carry
  a copy of the engine, so they were rebuilt with `node scripts/live-bank.js` (a new version folder, and the version
  and hashes in Quest Race, Question Battle and Brain Board). The site seeds its games at every start
  (`scripts/entrypoint.sh`), so a deploy brings solo practice and the Brain Board fix (s) live with no extra step.
- **"Last active" (g).** `step_progress.updated_at` now means the student's own last action. A teacher's review or
  marks leave it alone (the teacher's time is `reviewed_at`), and a row a teacher makes for a student who has done
  nothing (marks for a teammate) starts at 0 = never. So "Last active", "Sent 5 minutes ago", a class's last activity
  and the weekly summary's active count no longer move when the teacher reads an answer. No migration: rows already
  bumped by an old review keep that time until the student's next action.
- **Assigned for later (h).** Assigning a lesson that opens later says "Students will see it from {date}" (the toast
  and the note on the lesson page), never "Students see it now".
- **A lost password (i).** A trial teacher is the school admin, so "ask your school admin" locked them out. `/forgot`
  and `/reset` (`routes/password-reset.js`): for staff and grown-up accounts only (`mayReset`: `accountKind` staff or
  grownup and `email.adultRecipient`), at the address we already may use (`email.addressOf`: Google's, else the
  trial checkout's). Never a kid's or a student's account (no email; they keep "ask your teacher" / "ask a
  grown-up"), never a guest, a banned account or the platform admin. The link is a token signed with the site secret,
  good for 30 minutes, carrying a fingerprint of the password hash it was made for: a new password retires it and
  every earlier link (single use, nothing stored, so no migration). The answer to a request is the same, after the
  same wait, whatever the username; 30 requests an hour per address (a school's staff often shares one; it was 5,
  and the sixth teacher that hour was told to slow down), 3 emails an hour per account. The reset ends
  every session of the account, clears the sign-in lock and goes to the sign-in page (no automatic sign-in), and the
  account's address gets a short "Your password was changed" email (no link; "if that was not you, write to" the
  contact address). Both
  emails go out on the transactional path (`email.send`, logged in `email_log` without the link), and transactional
  email no longer carries the `List-Unsubscribe` headers (a mail client's Unsubscribe button on a password email or a
  receipt would have switched off the trial emails); requests and
  resets are in the audit log; pages are no-store, no-referrer, noindex; the link uses the site's own address, never
  the request's Host. While email sending is off there is no form: the page gives the contact address, and the
  sign-in pages do not offer the link.
- **A solo teacher's first page (j).** A teacher who made their own school (at /trial) and is its only staff member
  (`schools.soloSchoolAdmin`: admin of schools they created, one staff member) lands on the Classroom home at every
  sign-in and at "/", with Classroom as their first tab; the School tab, with the setup checklist, comes second. With
  a second teacher or admin the school admin lands on School again. A head the platform admin appoints to a school
  is not a solo teacher, also while they are its only staff member: they still land on "Set up your school" (the
  audit asked for this for trial teachers only; the first version of the rule caught appointed heads too).
- **School time zone (k).** The trial sign-up sends the browser's IANA zone (`input[data-browser-tz]`, filled by
  `app.js`); the server keeps it only when it is a zone it knows (`schools.isZone`). Due dates then end at midnight
  there, not midnight UTC. Anything else is ignored and Settings still offers it.
- **Roster names in live results (l).** In "Student details" (closed, teacher-only) and the CSV (`roster_name` after
  `student`), the school's roster name follows the name shown in the game, only for someone who manages the class
  (`S.canManageClass`: its teachers, the school's admins). A host who does not teach the class, a co-host with the
  class-safe view, students, the big screen and the session itself never get them.
- **The Standards tab's framework (m).** The bare address opens the framework the class has work in (work students
  did counts before lessons only assigned; a tie or nothing: CSTA, Math, ELA); every chip names its framework
  (`?fw=csta` too).
- **The game picker (n).** A Learn-shelf game is under its subject whether or not its subject page lists it (Fraction
  Factory under "Math games"; Maps has its own group); "More games" is only Play's fun games.
- **Contrast and labels (o).** The yellow "Just Play" in the landing's footer band keeps dark ink; the header's
  "Start free trial" link has an `aria-label` (on phones only its short, aria-hidden words showed); the Standards
  table's "nothing yet" rows are no longer faded to 70% (their small grey text fell under 4.5:1). The contact address
  stays as the owner chose it.
- **Small live slips (p).** Brain Board says "Board cleared!" only when every tile was played (ended early: "Winners");
  the host's "Next" is not shown on a board while tiles wait (the server ignored it); the place a player is told
  ("2 of 7") counts only players still in the game; Start with nobody in the room asks first (the host page; the
  server still starts an empty room for a teacher who wants to look at a game alone).
- **Course cards (q).** The fold over a course's games says "See the N games" (it said "units"); Cyber Defenders'
  card shows grades 3–8, as its subtitle does.
- **First class (r).** "Make your first class" goes to `/teach?new=class`: the form open, the cursor in the
  name box. The login cards of a class with nothing assigned show "Next: assign a first game" (to Learn).
- **"Hi Ms!" (s).** The welcome greets "Ms Rivera" (a title keeps the next word); a name that is only a title: "there".
- **Prices (t): not changed.** `/trial` already shows the price Stripe has ("After the trial, $119 a year per
  teacher"). `/teachers` is a public page children can open and its test says "no amounts on the teacher page", so
  no price was added there or on "/"; amounts stay on /plans and /trial.
- **Words:** `scripts/i18n-add-quick-wins.mjs` from `scripts/quick-wins-strings/words.json`, all 13 languages (en-GB
  needs nothing).
- **Checks:** tests/unit/teacher-quick-wins.test.js, tests/unit/live-bank.test.js, tests/e2e/teacher-quick-wins.spec.js.

**Left for the owner (the review's open points, 10 Nov 2026).**

- The reset link goes to the address typed at /trial, which was never verified (only a Google sign-in's is). It is
  the address Stripe's receipts go to; a teacher who mistyped it gets no receipts either. Accepted as is for now;
  verifying the address at sign-up would close it.
- A teacher who made the account at /trial but never finished the checkout, a school's seat-trial admin, and a
  school-made teacher without Google sign-in have no address on file: the reset sends nothing and the page gives the
  contact address. Keeping the typed email at sign-up would cover the first; it is a privacy choice (an address kept
  for someone who never started a trial), so it was not made here.
- The Privacy Policy's payments section still says the site has no email system of its own and does not describe the
  teacher's kept address; it needs the owner's wording.
## Staff have no friends; school chat is off by default (10 Nov 2026)

Owner decision after the teacher audit ("Turn off by default and go"). Two child-safety changes, shipped together.

**The bug (audit bug 0).** A teacher made at `/trial` is an ordinary kid-type account that is its school's admin.
`friends.samePair` only kept grown-up (parent) accounts apart from children, so that teacher could type a child's friend
code, the child saw "Friend requests 1", and accepting opened private chat. Reproduced on `origin/main` at the service
layer (request `sent`, the child's incoming list shows the teacher, accept `true`, `canChat` ok) before the fix.

**What "staff" means** (`services/schools.js noFriendsAccount`):

- the platform admin (`users.role='admin'`), and
- anyone who **is or was** a teacher or school admin of any school: a `school_members` row whose role is not
  `student`, in any status. This covers the trial teacher, staff school accounts, a person's own account that accepted
  a staff invite, and someone the platform admin appointed.
- A teacher who **left** a school still counts (the row keeps its staff role, marked `left`): they are a known adult,
  and "remove me, then add a child" must not work. Nobody becomes a student over a staff row: a role change to
  student, a teacher approving a join request and a Google roster are all refused (`wasStaff` / `badRole`). The one
  way back is **"Added by mistake"** (below). That account then gets a **new** friend code the next time it opens
  Friends; its old code and old friends never come back.
- A staff invite that has not been accepted changes nothing.
- Not staff: students, children's own accounts, guests, the Oomba team account, and grown-up (parent) accounts. Grown-up
  accounts can never join a school, so a teacher who is also a parent keeps their separate grown-up account exactly as
  it was (grown-up connections with other grown-ups only).

**The rule.** A staff account has no friend code, no friends, no friend requests in either direction, and no friends'
chat, with anyone, staff or not. (There was no staff-to-staff feature to keep; allowing one would have needed a second
kind of friendship.) Enforced in the services, so every route and API is covered:

- `friends.addByCode`: staff typing any code are refused and told why (`friends.staff.text`). A code that belongs to a
  staff account is "not found", word for word like a code nobody has. `friends.accept` refuses and drops a request with
  staff on either side. `friends.codeOf` gives staff no code.
- `chat.canChat` refuses before it looks at friendship (`staff` for the staff account; `missing` for the other
  person), so `send`, the thread and the inbox are closed even if a friend row existed. `chat.thread` and `chat.inbox`
  show nothing with a staff account on either side. `/chat/<staff>` is the same 404 page as a name nobody has. (A
  staff account's public profile `/u/<name>` still opens, as every account's does: it shows the display name and
  public games, with no way to make contact.)
- `friends.incoming`, `outgoing`, `list`, `count` and the Friends badge leave staff accounts out in SQL, so a row that
  should not exist is never shown to a child, even before anything has deleted it.
- `/api/friends*` answers 403 for staff before any work; `/friends` shows a short notice with a link to the Oomba team
  inbox; `/chat/:username` sends staff back to `/chat`, which for them is only the team inbox.
- UI: no Friends tab for the platform admin (school staff already had none), no Friends or Chat tiles and no chat
  switch on a staff Me page (one "Oomba team" tile instead), no "be friends" line on profiles.
- Staff keep the Oomba team thread (`services/team.js`), which is not friends' chat.
- Side effect, accepted: `match.js` uses the same pair rule, so a staff account cannot join an online match by code.
  Class live games are separate and unchanged.

**Existing data.** Ended in the database, not hidden at read time, because other code reads the `friends` table directly
(friends-only games, badges, family counts):

- Migration `0068_staff_no_friends_chat_off` deletes every friendship and pending request with a staff account on either
  side, clears those accounts' friend codes, and marks friends' messages to or from them read so no badge stays lit.
  The messages are kept (a report may need them) but nothing shows them.
- The same happens the moment an account becomes staff (`schools.addMember` / `updateMember` call
  `schools.endFriendships`, written to the audit log as `friend.staff_closed`), and again whenever a staff account is
  seen still holding a code or a friend row (`friends.closedToFriends`). The seed, which can turn an ordinary account
  into the platform admin, ends that account's rows itself (`scripts/seed.js seedAdmin`).

**"Added by mistake": the way back for a child who accepted a staff invite.** Any school admin (a trial teacher
included) can invite any username as staff, and a child may tap Accept.

- Before: the invite on My classes now says "Only accept if you work at this school. Staff accounts have no friends and
  no chat: if you accept, your friends and your friend code are removed and do not come back", and Accept asks the same
  question again (`school.invite.warn`).
- After: on the school's People tab, a staff member's own account has **Added by mistake** in its menu, and people
  already removed from staff are listed under **Removed staff** with the same button
  (`POST /api/schools/:id/members/:uid/not-staff`, `schools.notStaff`). The person leaves the school and the school's
  staff record of them is deleted, real name included, so the account stops being a staff account (unless another
  school has them as staff). Written to the audit log as `school.member_not_staff`.
- Who: that school's admins and the platform admin. Never on yourself, never for an account the school made as staff.
- Friendships that ended on Accept are **not** restored (they were deleted, and bringing a friend back without the
  friend's say is wrong); the child gets a new code and adds friends again.
- Why this is not a hole in the staff rule: the account ends up with exactly what a brand-new account has, and anyone
  can make a new account. The rule keeps *known staff accounts* away from children; it never proved who is an adult.

**School chat is off by default.** `DEFAULT_SETTINGS.chat` is `'off'`: accounts a school created cannot chat until a
school admin chooses "Chat with friends from their classes" on the Settings tab. Classmates can still be friends.

- **Existing schools: the stored data cannot tell a choice from a default.** Every save of a school's settings (the
  time zone, say) wrote the whole settings object, old default `chat:'classmates'` included. So the safer reading is
  used: a stored `'classmates'` is removed and the school follows the new default (off). One exception, where the audit
  log does show a choice: a school that saved "No chat" and **later** saved "classmates" keeps it. A stored `'off'` is
  untouched.
- A school whose own accounts have ever sent a chat message gets `chatNotice`: its Settings tab says chat was turned
  off and how to turn it back on, and a short line with a Settings button shows on its other tabs. It stays until an
  admin switches chat on or presses **Keep chat off**; saving something else (the form always sends the Chat box) does
  not clear it. Schools where nobody chatted get no notice. Only accounts the school made are counted, because the
  school chat rule only ever applied to them (`accountRules`); students who joined with their own account were never
  switched off.
- **Owner should know:** a school that deliberately saved "classmates" without ever having saved "No chat" looks the
  same as one that never chose, so it is switched off too. If its students had chatted, it sees the notice.
- From now on a stored chat value is written only by a save that carries one.
- No public page said school chat was on for classmates (/safety, /privacy and /parents describe friends-only chat and
  do not mention the school setting), so only the Settings hints changed.

**Tests.** `tests/unit/staff-no-friends.test.js` (every friends and chat route as each kind of staff and each kind of
child, both directions, with and without leftover rows; becoming staff; leaving; the invite warning and "Added by
mistake" through the real routes; a former teacher's join request; rows left by a raw promotion and the seed; the
parent account; the migration; the chat default, the notice and its dismissal), `tests/unit/teacher-plan.test.js` (the real `/api/trial/signup`),
`tests/e2e/staff-no-friends.spec.js`.

**Deploy note.** `0067` belongs to the Google Classroom work on another branch; whichever merges second keeps both
entries in `MIGRATIONS` (they do not depend on each other).

## Teacher marketing: Classroom, free and paid (10 Nov 2026)

Part of the owner-approved website pass (Google Classroom on the marketing pages, one free and paid story, the tagline,
a place for real teacher quotes).

- **Google Classroom section** on "/" (`#classroom`, after the courses) and on /teachers (a panel after the teaching
  loop), with the same words (`teachers.classroom.*`). It shows only while Classroom is on for the server
  (`services/gclassroom.js` `enabled()`: Sign in with Google and `GOOGLE_CLASSROOM=1`), following /teachers' rule that a
  feature off on this server is left out of the text. Every line matches the code: read-only connect first, posting
  needs the teacher's separate "allow posting" step, roster import by hand then every 6 hours (`ROSTER_EVERY`),
  students matched by Google account, assignment with link and due date or a material, completion grades out of 100
  (`scoreOf`: steps done of the lesson's steps, said in the copy), automatic grades optional, announcements in the
  teacher's words, no student emails asked for and no names, answers or games sent. Nothing says or implies that Google
  verified the app. Turn `GOOGLE_CLASSROOM` on in production only once Google has verified the scopes, or the section
  invites teachers who would meet the "unverified app" screen.
- **One free and paid line** (`teachers.free.line`), on the landing hero and the /teachers hero: always free (every game,
  classes, lessons, progress and the gradebook, free daily Builder messages for teachers and students), the Teacher plan
  adds the class's daily AI builds (`TEACHER_DAILY_MESSAGES`), "See prices on Plans" links to /plans. No amount on "/"
  or /teachers (the "kids are never sold to" rule above stands; amounts stay on /plans). The landing's pricing section
  gets a Free card; the Teacher card lists only what the plan adds ("Everything in Free, plus:"), so free features are
  no longer listed as plan features; the trial FAQ and the closing line say what stays free when a trial ends (nothing
  is deleted or locked: "Teacher plan" above). /teachers with paid-plan pages off shows the free half only
  (`teachers.free.lineOff`). The old keys (`landing.pricing.lead`, `landing.faq.a2`, `landing.final.p`) are no longer
  used.
- **Tagline** "Screen time you can feel good about" (`brand.tagline`, new; it was only ever in the parents video) in the
  landing footer and under the /parents heading.
- **Teacher quotes** on /teachers: `TEACHER_QUOTES` in routes/teachers.js is empty, so the section is not rendered.
  Only real quotes, given with the teacher's permission, go there; a platform admin sees the layout with owner
  placeholders at `/teachers?quotes=preview`. "/" keeps its no-testimonials rule.
- **Research link:** "/" (under "Why games work") and /teachers link to `/research` (the page comes with the research
  pass).
- Tests: `tests/unit/teacher-marketing.test.js`.

## A first live game in under 3 minutes (10 Nov 2026)

The teacher audit's slam-dunk item 1 (owner: "Build 1, 2, and 5"; this is 1). Before: the landing's only way in was the
14-day trial (six fields, an email, Stripe), and "Host a free live game" on /teachers/live sent a teacher to the
**parents'** sign-up. Guest join already worked in a few taps but nothing led a new teacher to it.

**What a new teacher does now** (counted by `tests/support/fast-live-flow.js`, bounded in `tests/e2e/fast-live.spec.js`):
8 steps to a started game: tap "Host a live game now" → type name, username, password → tick "teacher, 18 or older" →
"Make my account and pick a game" → "Open the room" (a game, a level and a subject are already picked) → "Start". Each
student: type the 7-digit code (or scan the QR, which fills it in), Join, "Let's go", answer: 4 steps, no account. By
machine the whole path takes about 7 s with instant typing and about 13 s at 150 ms a key
(`node scripts/fast-live-timing.js <url>`); nobody has timed a real teacher with a real class yet.

**Decisions.**

- **A short teacher sign-up, not a way to host without an account.** Kids never host, and a host must be someone we
  can limit, audit and ban, so hosting keeps needing an account. `/teachers/host` asks for three boxes (name, username,
  password) and the same "I am a teacher or school staff member, and 18 or older" box as /trial (a statement, not a
  check, like the parents' one). No email, no school name, no card, no plan. The password stays at the staff minimum (12).
- **The account is what /trial makes, minus checkout:** an ordinary account that is the admin and only member of a
  school of its own ("<name>: my classroom"), so it is staff: it hosts, makes classes and login cards, lands on the
  Classroom home, and has no friends and no chat (`noFriendsAccount`). It is never a grown-up (parent) account.
- **Abuse limits kept:** the sign-up shares every other sign-up's per-address limits (30 an hour, 2,000 tries) and has its
  own route limit; opening rooms shares `/api/live/sessions`' limit (30 an hour per account); the name is refused if it
  has a phone number, an email or a blocked word (a class sees it as its teacher). Written to the audit log
  (`user.signup`, `via: quick-live`).
- **No email means no password reset by email** for these accounts until the teacher starts a trial (which asks for
  one). The page says "no email address"; the owner may prefer an optional email box (see the report).
- **"Quick game"** (`/live/quick`): two quiz modes (Question Battle first: questions on the big screen suit a first
  try; Quest Race), the question bank's four levels and its subjects, 10 questions, one button. The last pick is
  remembered per teacher (`live_prefs.prefs.quick`; no migration). "More games and settings" is the full `/live`.
- **Guests are the front door for a first try; a class is for anything that counts.** A quick game with no class is an
  ordinary open room: every player is a guest with a generated name (never typed), no chat, no cookies. The landing's
  live section now also has "Have a game code? Join" and its fourth bullet no longer says "signed-in students only".
- **One tap on a class card:** "⚡ Quick game" on every class card of the Classroom home opens a class room with the
  last pick (the class's grade picks the level); the line beside it says what will open, with "Change". A class room
  seats only that class's signed-in students, who see the existing "Your teacher started a live game · Join now" on
  their class page and Class tab, so they type no code. While a room is open the card shows "Open live game" instead.
- **A second tap never ends a room:** if the teacher already has a room open, Quick game goes back to it with a note.
- **After a guest game** the results page says plainly: nothing went into a gradebook; the question review (questions,
  counts per answer, no player) is kept (as before: `live_runs`, 90 days for runs without a class); game names and
  scores are in memory for 10 minutes only. Staff who may make a class get "Make a class to keep scores"
  (`/teach/keep-scores`): class name, pasted names → the class, its school accounts and the login cards in one go.
- **Prices:** none on "/", /teachers/host, /live/quick or any page here. Nothing is sent to an AI.

**Routes.** `GET /teachers/host`, `POST /api/teachers/host-signup`, `GET /live/quick`, `POST /api/live/quick`
(`server/routes/quick-live.js`); `GET /teach/keep-scores`, `POST /api/teach/keep-scores` (`server/routes/schools.js`).
All 404 while `LIVE_CLASSROOM=0`. No new table, no migration (0069 was reserved and is not used), no new env var.
`/admin/stats` gets "First live game" totals (`quick.view`, `quick.signup`, `quick.room`) and `landing.host` clicks.

**Who gets in** (unit `tests/unit/quick-live.test.js`): the sign-up refuses anyone signed in; the chooser and its API
are for accounts that may host (kids, students, guests and signed-out visitors get the sign-up, /join or a 404); a
class id works only for a teacher of that class; keep-scores is for staff who may make a class in their school (404
for kids, students, guests, grown-ups, and teachers of a school that keeps class-making for admins); login cards open
for their maker only.

**Words** in 12 languages under `quickLive.*` (`scripts/i18n-add-quick-live.mjs`; en-GB has no differing spelling).

**Not done here:** a real classroom timing; "Sign in with Google" on the short sign-up; Brain Board and the other modes
in the quick chooser (they need more choices than one screen should ask).

### After the review of the first live game (10 Nov 2026)

A second reviewer walked the path in German and found one real fault and some smaller ones. What changed, and what did not.

- **Buttons wrap on phones in every language.** "Make a class to keep scores" on the guest results page did not wrap,
  so the page scrolled sideways at 360 px in seven languages (German, French, Spanish, Dutch, Russian, Portuguese,
  Italian). It and the older "Play the missed questions again" button now wrap (`.btn-wrap`, `public/css/live.css`).
  The landing's top bar had the same fault before this work (its two buttons, in six languages); they now take two
  lines on phones where the words are long (`public/css/landing.css`). Russian "Бесплатно" breaks inside the word
  there; a shorter word would be nicer.
- **The layout test covers long words.** `tests/e2e/fast-live.spec.js` now runs the touching, overflow and tap-target
  checks in German and Spanish on every page of the path, checks the guest results at 360 px in all 13 languages, and
  checks "/" at 360 px in all of them. It fails without the fix.
- **A staff password must be more than long.** The two teacher sign-ups (`/teachers/host`, `/trial`) refuse a
  12-character password that is only digits, one short piece repeated, or easy passwords put end to end
  ("123456789012", "passwordpassword", "qwerty123456"): `auth.checkStaffPassword`. Password changes and resets keep
  their old rules for now.
- **German uses "du" on the sign-up.** The new words said "Sie" while the labels reused from /trial said "du". All
  `quickLive.*` German is now "du", and so is the one "Sie" hint in the /trial sign-up. The rest of the German site
  still mixes the two (about half and half across all pages); that is a separate clean-up.
- **One room at a time, said on every card.** While a teacher has a room open, no class card offers "Quick game" or
  "Host live". The card of the room's class has "Open live game" as before; the other cards have the same button
  (back to that room) and the line "You already have a game open: <title>". Before, a tap on another class's Quick
  game silently went to the first class's room.
- **Keep scores says which school.** `/teach/keep-scores` shows the school's name; staff of more than one school
  choose it (only schools where they may make a class; any other id is a 404). If no account could be made, the empty
  class is removed and the names box shows an error, never an empty page of cards.
- **Left for the owner: what a short sign-up account may do.** It is the first staff account made with no email and
  no review, only the "teacher, 18 or older" box. It can open rooms at the full player limit, make student accounts
  (60 names a request) and ask for AI question drafts (30 an hour). Nothing here changes that: a lower room size (the
  grown-ups' 30) would turn away a class of 31 on its first try, and holding back AI drafts or account-making needs a
  way to add an email first. Options are in the report; `docs/status.md` lists it as open.
## Real scores in the gradebook (10 Nov 2026)

The teacher audit's item 2: "Overall" was steps done ÷ steps open, so a child who answered every question wrong showed
100 %, and a teacher had to match "CozyLynx25" to a child by hand. A teacher has to stand behind a grade in front of a
parent.

**Two columns, two meanings.**
- **Work done** (was "Overall"; same figure, same rule: steps done of steps in the lessons that are open). Renamed on the
  gradebook and in its CSV. The weekly summary already said "Work done" and the Google Classroom push already calls
  itself a "completion grade": both are this figure, so neither changed (`server/services/gclassroom*.js` untouched).
- **Score** (new): points earned ÷ points possible, over everything that has a right answer or a teacher's rubric
  (`server/services/scores.js`):
  - a finished **quiz step**: 1 point a question;
  - a **game step hosted live** for the class: 1 point a question asked, the student's best run (a skipped question is
    not right);
  - a **library rubric** scored by the teacher: its points of its maximum (only criteria with a level; a score from a
    swapped-out rubric is left out, as everywhere);
  - a step's own **0–3 rubric lines** (CS Quest): 3 points a marked line (not counted twice when the step also has a
    library rubric score).
  Weighted by points possible, so a 16-point rubric counts for more than a 5-question quiz. Work not done or not scored
  is **left out** (Work done shows that), so nothing scored reads "–", never 0 %. Lessons that have not opened are left
  out, as they are from Work done.
- **Not in the Score, on purpose:** a game played outside a live run reports a bare number with no maximum (4,200
  points of what?), so it cannot be a percentage; a quiz still open; feedback without a level; and **live games that are
  not a lesson step** (a Friday warm-up is practice). Those live games are shown, per student, in the gradebook's
  "Live game results" table and the CSV. *Owner can decide otherwise:* counting every class live game in the Score is a
  one-line change in `scores.js`, but it would let a warm-up move a grade.
- **Every score is explainable.** A score cell links to the student's page at "What makes up the score": each item with
  its type and points, a subtotal per lesson and the total. "How to read it" states the formula.

**Late.** "Late" stays what it was (work still missing after the due day). New: **"Done late"**: the lesson is finished
but a step was first done after the due day ended (`lessons.lateFrom`: the local midnight after the due day in the
school's time zone; without a zone, the old +36 h rule). In the cell, on the lesson's page (the row and the step), on
the student's page and in the CSV. `done_at` is the first time a step was done, so reopening work later does not make
it late. No new table and no migration (0070 was reserved and is **not used**).

**Live game results.** A column per saved class game (the last 8) with right ÷ asked per student, "✓" when the game had
nothing to mark (Would You Rather, drawing), "–" when the student was not there. Only `live_run_scores` is read, which
only ever holds signed-in students of the run's class: a guest has no row and can never appear.

**Names.** Staff-only screens show the roster name with, in grey beside it, the name the student has in games
(`views/components.js staffStudentName`): the gradebook, its live table, the course panels, the lesson's progress table,
the answers and build cards, the whole-lesson rubric cards, the Standards tab's student picker and heading (both
frameworks) and the student's page. The gradebook CSV already had both (Name, Oomba Academy name); the live results and
their CSV got roster names in "Teacher quick wins". **The live Teacher view** gets a button, "Show class-list names"
(off every time the page opens, never remembered): it asks `GET /api/live/host/:sid/roster-names` and shows the roster
name in brackets beside each game name. The names are not in the session, so they cannot reach the projector
(`/live/host/:sid`), a player or a game frame; the API answers only a full-tier controller who manages the class.
Anything a student sees keeps generated names.

**One student's page**, `/class/:id/student/:uid`: Work done, Score, late lessons, each lesson, what makes up the
score, a standards summary per framework (met / developing / practised, with a link to the Standards tab), the last 10
written answers with feedback, rubric feedback, and live results. For whoever manages the class (its teachers, the
school's admins: `S.canManageClass`, the gradebook's rule), only for an active student of that class; everyone else
gets the 404 page. `Cache-Control: no-store`. **Print:** the first name only unless the teacher ticks "Print the full
name" (CSS only: `.sp-page:not(:has(#sp-full:checked)) .sp-rest`); the name used in games, the class tabs and the top
bar are never printed; no other student and no price is on the page. Student names in the gradebook link to it.

**CSV.** Old columns keep their place ("Overall" is now headed "Work done"); new ones are added at the end: Score,
Score (points), Late lessons, then per lesson "(score %)" and "(late)" (late / done late), then one column per live game.

**Speed.** Three more queries per class (rubric scores, marks, live runs) and one for late steps. Seeded test: 3 classes
of 28 with 12 lessons of 5 steps, quiz, rubric and live scores: `classProgress` for all three about 20 ms, the three
gradebook pages over HTTP about 100 ms, one student's page about 30 ms (limit in the test: 300 ms).

**The landing page** says "Scores go straight into your gradebook" beside live games. That is now true for class games
(signed-in students of the class): each run is a column, and a run hosted for a lesson step counts in the Score. It is
not true for guest games (nothing is saved for a guest, by design). `landing.js` was left alone (another track edits
it). Today the line sits beside "Signed-in students only", so it reads true as it is; if the landing page starts
to offer guest games ("no student accounts"), the line should say "class games".

**Tests.** `tests/unit/gradebook-scores.test.js` (formula, "–", late by time zone, live results, names, the student's
page and who may open it, the CSV, 13 languages, the 300 ms limit), `tests/unit/live-roster-names.test.js` (the API as
every kind of account; nothing on the projector page or any socket), `tests/e2e/gradebook-scores.spec.js` (its own
server on `tests/support/gradebook-seed.js`; 360 / 390 / 1366, light and dark, Hebrew; print). The CSV assertions in
`progress`, `rubrics` and `teacher-quick-wins` tests now find columns by their heading, as strictly as before.

## Turn your lesson into a game (10 Nov 2026)

The teacher audit's item 3: the headline promise is "paste a lesson, get a game", and a teacher will not put a game in
front of a class without checking the answers first. The parts existed (AI question drafts from a topic, the question-set
editor, live hosting, "Set as homework"); nothing joined them, and nothing drafted from the teacher's own material.

**The page: `/teach/make`** (Classroom → "Turn a lesson into a game"; My question sets → "From my lesson").
1. **Paste your lesson** (80 to 20,000 characters) or choose a PDF (up to 2 MB) or a text file; grade or level; 5 to 20
   questions.
2. **Check the questions.** The draft opens in the same question-set editor as everywhere else, on the same page. Under
   each question is "From your lesson: …", the words of the lesson that make the right answer right, so the answer key
   can be checked quickly. The teacher edits, removes, adds, then saves. Nothing reaches a student before Save, and the
   usual text checks run on Save.
3. **Play it.** "Host a live game now" opens `/live` with the set chosen; "Assign to this class" makes a lesson with one
   quiz step (the same as "Set as homework"), so the score lands in the gradebook.

**Rules.**
- **Grown-ups who may host only** (`hostOnly`): a student or a child's account gets no page and a 404 from the APIs.
- **The lesson is never kept.** It goes to the AI for that one call; it is not stored, not logged (the audit log holds
  only how many questions came back) and not kept in the browser. The page says so, and asks the teacher to leave out
  students' names. The "why" notes are for checking and are not saved with the set.
- **A prompt for a teacher, never for a child** (`lessonPrompt`, unit-tested): use only what the lesson says, write
  fewer questions when the lesson is thin, say so when there is nothing to ask about, and treat the lesson as material,
  never as instructions (a `</lesson>` inside the paste cannot end the block).
- Counts towards the AI spending cap; 20 drafts an hour per account. Without a key, or with the budget resting, the page
  says drafting isn't available and points to typing or pasting questions.
- No migration, no new flag (it follows `LIVE` and, for Assign, `QUIZ_STEPS`).

**Not done yet: proof with the real AI.** `scripts/eval-lesson-questions.js` runs 20 sample lessons (K-8, six subjects,
Spanish and French, one with nothing to ask about, one with orders hidden in it) through the real model, checks each
draft by rule and prints the questions for a person to read. It needs `ANTHROPIC_API_KEY` and has not been run from the
build machine, which has no key. Until someone has read that report, the landing page should not lean on this promise.

## Setting up a school from a request (11 Nov 2026)

Approving a "Set up my school" request took three separate steps (Create school, then appoint its admin on the People
tab, then email the person by hand with a login card), and nothing told the admin that the site sends no email. The
owner found it confusing after approving the first real request.

**Now: one page, one button** (`/admin/schools/setup`, from "🏫 Set up this school" on the School requests tab).
- The page is filled in from the request: school name, the person's real name, their email and the language of the page
  they used. The platform admin picks the admin account: a new school account (the default), their own Oomba account
  (by username; never a family account), or one of the school's admins already.
- One button makes the school (if new) and the admin account, marks the request done and sends the welcome email.
- The welcome (`services/school-welcome.js`, 13 languages, transactional): how to sign in, the school page's checklist
  (teachers, classes, students, rules; chat between students is off unless turned on), how teachers start (a live game,
  "Turn a lesson into a game", Google Classroom), and "reply to this email". Signed "The Oomba Academy team"; replies go
  to `EMAIL_REPLY_TO`.
- **No password in any email.** A new school account gets a "Choose my password" link: the password-reset link with a
  7-day life (`welcomeToken`), single use (it stops working once a password is set), landing on the sign-in page with
  the username filled in. Their own account gets a sign-in link and keeps its password. The address is kept for the
  account, so "Forgot your password?" works for them later.
- The People tab then says whether the email went. If it didn't (sending off, a bounce), it offers the login card and
  "try the email again".
- "✉️ Welcome email" on the Schools list and on closed requests sends it again (also for a request closed with the old
  "Mark done" before its school existed: the school is made then and linked to the request). "Close without setting up"
  replaces "Mark done" for a request handled some other way.
- The audit log keeps ids and the outcome only; the address stays in `email_prefs` and `email_log`.
- **Optional username** on the setup page for a new school account (3 to 16 letters, digits or _; checked against the
  word lists and taken names before anything is made). It goes in the welcome email, with a line saying the username
  and name can be changed later on the Me page.

**"Your name" for grown-ups (11 Nov 2026).** Teachers, school staff, the platform admin and grown-up (parent) accounts
can set their own name on the Me page (parents: their family account page): 2 to 40 letters in any script with spaces,
hyphens, apostrophes and dots, no digits, nothing on the word lists (`cleanRealName`). It is their display name, and for
staff also their name at every school where they are staff. The username never changes. Kids' and students' accounts
never set a name: a kid's username is what others see, and a student's name at school is the teacher's to set.
The same grown-ups can also change their **username** there (`auth.changeUsername`): the usual username rules, once
every 7 days, and the old username is held from everyone else for 30 days (`reserved_names`), so nobody can take it to
pose as them. Kids' and students' usernames never change this way (their login cards and their teachers rely on them).

## Account first: set up your school (11 Nov 2026)

The owner found it confusing that the school (and its admin's account) was made by us before the teacher had an
account. Now the account comes first, like the Teacher plan and Quick game sign-ups already did.

- **Signed out, /teachers "Set up your school"** is one sign-up: their name, the school's name, role, work email, about
  how many students, country, then a username, a password and "18 or older". One button makes their account and their
  school (they are its school admin; the school's time zone from the browser), keeps the email for the account (the
  welcome guide, password resets), stores the request linked to both, signs them in and opens their Classroom with
  "{school} is ready". Every mistake is shown at once; nothing is made until all is right. (`createTeacherWithSchool`,
  shared with the /trial sign-up.)
- **A teacher or school admin, signed in:** the form becomes "Tell us about your school", for a school they run.
- **A grown-up (parent) account or the platform admin:** the plain request as before (family accounts never join a
  school); "Set up this school" makes it.
- **The platform admin:** a request that came with its school shows "Signed up and already using it" and
  **"✅ Looks good: send the welcome"**: the welcome email (sign in with their own account, no password link, the
  checklist, how teachers start), then the request is done. Nothing waits on us: the school works from the start.
- The Privacy Policy's school-request section now says the email is also kept with the teacher's account and used for
  the welcome guide and password resets (owner's decision, 2026-11-11; the lawyer's sign-off is pending in
  docs/legal-review.md).

## Admin alerts by email (11 Nov 2026)

The owner asked: "When I receive any app notification as an admin I want it sent to my email. For example, game
approvals, new users, messages, etc."

- **What counts** (everything the admin pages show as waiting for the admin, plus new accounts): a game sent for review
  (`services/publish.js`, the review queue), a new account (its first sign-in, `auth.js` onFirstSignIn: a sign-up, a
  guest who saves their account, a student's first sign-in; never a guest), a message to the Oomba team inbox
  (`services/team.js` reply), a school set-up request (`services/school-requests.js` createRequest), a safety report
  (a game: `routes/games.js`, and its auto-hide; a chat message: `services/chat.js`; a live game:
  `services/classlive-results.js`; a family link: `services/family.js`) and a billing problem (a failed, overdue,
  disputed or fraud-warned payment, a bank payment that failed at checkout, a second plan cancelled and refunded, a
  subscription with an unknown customer: `services/billing.js`; a disputed Spark Pack: `services/sparks.js`; a school
  asking to pay by invoice: `services/school-billing.js`). Six kinds: review, signup, message, school_request, report,
  billing.
- **Not alerted:** flagged Builder web searches (the filter already blocked them; the Web searches tab is a log),
  trial started / converted / ended (no action needed; the trial emails cover the teacher), refunds (the admin makes
  them in Stripe), a school's "ask for a plan" and a child's "ask my grown-up" (for school admins and grown-ups, not the
  platform admin), welcome messages and announcements (the team's own sends).
- **One email per run.** `alert(kind, { ref, summary, url })` adds a row (migration 0073) and never throws. A job every
  10 minutes claims every waiting row into one batch and sends one email: per kind a count line ("5 new accounts:
  3 students, 1 teacher, 1 grown-up"), up to 10 lines ("and 35 more"), each linking to its admin page (absolute, from
  PUBLIC_URL). A burst of 500 sign-ups is one email with counts.
- **Privacy (strict):** never a message's text, game content, real names, email addresses, IPs or any student
  identifier beyond the public username. Accounts appear as "@username (student)"; game titles only for games sent for
  review, clipped to 60 characters and escaped. Rows keep ids and fixed notes only (a report's reason word, 'update');
  usernames and titles are read when the email is built, so a deleted account leaves nothing behind
  ("an account that was since removed"). The rendered email is kept only while it may be retried. Rows and batches
  are kept 90 days.
- **Sending:** internal ops mail, category 'admin' in `services/email.js`: no postal address, no List-Unsubscribe, no
  unsubscribe rules. Only to accounts with role 'admin' (email.js refuses anyone else, even with an explicit address):
  each platform admin's known address, plus `ADMIN_ALERTS_TO` sent as an admin account. No address known: rows wait up
  to 2 days, then are dropped (not sent late); /admin/emails says so in red.
- **Restart-safe:** the batch is claimed before sending and its email stored; a batch left 'sending' by a stopped
  server is sent again after 5 minutes with the same email and the same Idempotency-Key per recipient (within Resend's
  24 hours), and no new batch starts while one is in flight. A failed batch is retried on the next runs, 3 tries in
  all, then marked failed.
- **Controls** (/admin/emails, "Admin alerts"): on/off for all (default on once sending is configured) and per kind
  (settings `emails.admin_alerts` and `emails.admin_alerts.<kind>`; off means nothing is queued, and rows of a kind
  switched off later are not sent), the recipients (masked), the next check, Preview / Text, "Send a test alert"
  (made-up examples to every recipient; works while switched off) and the last 8 emails. `ADMIN_ALERTS=0` stops
  everything, the test included.
- **Language:** the email and its section are English only, like every admin page.

## My classes, simpler; My school and the Teacher plan on the Me page; one Classroom consent (11 Nov 2026)
The owner found My classes (/teach) busy, and Google Classroom's two connects confusing. What changed (supersedes the
parts of "Play and Learn" part 2, "Teacher plan" and "Google Classroom sync: optional scopes" it touches):
- **/teach** is the hello line (summary, This week's summary, Host a live game), the tools row (Lesson library, Turn a
  lesson into a game, Make a game), the teaching loop's card while it shows (or the "How Oomba fits your week" link),
  the "{school} is ready" notice, staff invites, the class cards and New class, and the archived list. **Gone:** the
  "Manage <school>" box (with the school plan card), the Teacher plan card, "Ask my admin", the class cards' ⚡ Quick
  game, and everything below the classes (Teach with a course, Live games for the whole class, Brain breaks, "See
  everything students can play", "Open Learn"). Each still has a home: courses on Learn (course cards with "Assign to
  a class" for staff) and the lesson library's Ready-made chips; live games on Learn's "Live class games" (Host live)
  and the Live tab (/live; /live/quick from the teacher sign-up and /teachers stays); brain breaks on Learn's "Also on
  Oomba" (the brain break games page) and on Play; everything students can play is the Play tab; Learn is a tab. The
  class card keeps Open class, Assign a lesson and Host a live game / Open live game (one room at a time, as before).
- **One class opens directly.** A teacher of exactly one class (not archived) who opens /teach (the Classroom tab, "/"
  after sign-in, the Me tile) gets a 302 to that class. Not with `?all=1` (the list), `?new=class` (the loop's "Make
  your first class"), a `?welcome=` notice or a staff invite to answer: those show the list. The class page's back
  link is then "All classes" (`/teach?all=1`), where New class is. No class yet: the list with the create-class prompt,
  as before. While the teaching loop's card still shows, it comes along on that class's Lessons tab (same partial).
- **Me page:** "My school" (🏫, `/school`: the school's overview, or a pick of schools) for school admins, beside My
  classes; its line says how many teachers asked for a plan (or the school's name). Teachers who don't run a school
  have no school pages, so no tile. In **Settings** (`/me/settings`, see "Settings page" below): the **Teacher plan
  card**, moved from /teach, and "Ask my admin" for a school a teacher works at without running it. The card: plan status (trial until,
  renews on, ends on, a grant), "{left} of {size} Builder messages left today", the trial-ending notice; a teacher who
  owns the plan gets **Add a card** (trialing) or **Manage billing**, both the existing `/api/trial/card` Stripe customer
  portal (password first), now returning to `/me/settings#teacher-plan`; a seat says "A seat from <school>", with **Manage
  school billing** (the school's Billing tab) for its admins and "The admins of <school> look after this plan" for
  teachers; no plan: one line and **See the plans** (`/plans`; prices only there). Who asked for a plan is on the
  Billing tab (with Dismiss), as before. `PLAN_PATH`, /trial, /trial/thanks, the portal's return and the trial emails
  now point to `/me/settings#teacher-plan`; `/teach?plan=…` redirects there, and app.js sends an old `/teach#teacher-plan`
  link (emails already sent) on to the card. The Terms (info.terms.plans.li14) still say the messages show "on the
  teacher's My classes page": a legal-text change left for the lawyer's pass.
- **Units and folders:** one line under the class page's buttons ("Units group the lessons in this class, in the
  order students see them. Folders only sort your own lesson library.") and one under the lesson library's ("Folders
  sort your own lesson library, and their lessons can go to any class. Units, on a class page, set the order students
  see."). The concepts stay separate.
- **Google Classroom, one consent:** `GOOGLE_CLASSROOM_SCOPES` = `full` (default) or `read` (anything else stops
  startup). With `full`, Connect asks for the 2 read and 4 write scopes at once (`include_granted_scopes`, offline,
  consent, as before) and the connect panel lists posting and grades too; all granted, there is no second step. A box
  unticked on Google's screen leaves that feature off and brings back "Some of these are off" with "Allow Oomba Academy
  to post to Classroom" (write=1), the fallback. With `read`, today's two-step flow. Same six scopes, still no emails.
  The owner must add the four write scopes to the consent screen and verification before using `full`
  (docs/google-classroom.md section 2 says what teachers see if they aren't there yet).
- Words in 13 languages (`scripts/i18n-add-simpler-classes.mjs`, which also removes the keys of the gone sections);
  no migration.

## Settings page (11 Nov 2026)
The owner asked for the account's settings to have a page of their own, off the Me page.
- **`/me/settings`** (signed in; a ⚙️ "Settings" tile, the last on the Me page): in this order, the Teacher plan
  and billing (school staff, while paid-plan pages are on: the card and "Ask my admin"), Language, Appearance,
  Password (not for guests) and Sign out. A small section nav lists the sections that are there: sticky chips under
  the top bar on a phone (scrolling sideways in their own row), a sticky side list from 760 px. Back link to Me.
- **Moved, not changed:** the same panels, forms and APIs (`languagePanel`, `appearancePanel`, `passwordPanel`,
  `signOutPanel`, the plan card); their ids stay (`#language`, `#appearance`, `#password`, `#signout`,
  `#teacher-plan`). The language and theme GET forms now come back to /me/settings.
- **Stays on the Me page:** the header (with Sign out in "Not you?" where it was), Make a game, the tiles, Pick your
  look, the kids' character, the chat switch, the weekly class summary, Your name and username, Sign in with Google,
  and the kids' "For grown-ups" card (`/me#grownups`).
- **Old links:** the footer's language link, the short-password notice, /forgot for someone signed in, `PLAN_PATH`
  (trial emails), /trial and /trial/thanks, the Stripe portal's return and /plans now point to
  `/me/settings#…`; `/teach?plan=…` redirects to `/me/settings?plan=…#teacher-plan`. A link whose hash never reaches
  the server (`/me#language`, `#appearance`, `#password`, `#signout`, `#teacher-plan`, and `/teach#teacher-plan` in a
  trial email already sent) is forwarded by public/js/app.js from any page without that section.
- **Grown-ups** keep their own settings page, /family/account (Your name, Language, Password, Sign out); their
  `/me/settings` redirects there, as their `/me` goes to /family.
- Words: `me.tiles.settings`, `me.settings.*` in 13 languages; two trial strings now say "Settings" where they said
  "My classes". Tests: `tests/unit/me-settings.test.js`, the plan-card states in `teacher-plan.test.js` on
  /me/settings.

## One sign-up (11 Nov 2026)

The owner signed up as a teacher on a phone and called it "horrendous": the kid form, the grown-up form, the /trial form
and the /teachers "Set up your school" form were four different sign-ups. His spec: sign-up first asks whether you are
a kid, a parent or a teacher; a kid gets a username and a password, then an optional class or family code; a parent or
teacher signs up with Google or a username and password; parents then add their kids; teachers then optionally create
or join their school, must add at least one class, and are asked whether to connect Google Classroom. A teacher who
creates the school is its admin. Sign-in stays one page: a username and password, or Sign in with Google.

**The flow** (server/routes/onboarding.js, views/onboarding.js, public/css/signup.css, public/js/signup.js). One
question per screen, a back link, progress dots ("Step 2 of 4"), big tap targets, no prices (prices stay on /plans and
/trial). Each choice on /signup goes through /signup/for/<who> as before, so the "who" funnel tally keeps counting
(`parent` is the same choice as `grownup`).
- **Kid** (`/signup/kid`, 2 steps): a fun name and a password, `POST /api/auth/signup` unchanged (the same rules and
  limits; no email, no age, no Google button), then `/signup/kid/code`: "Got a class code?" (the existing class-code
  join, `POST /api/classes/join`) and, while families are on and the kid has no grown-up yet, "Want your grown-up on
  Oomba too?" with **Get my family code** (the existing Me › For grown-ups code, `POST /api/me/family/code`), then Skip.
  **Kept stricter on purpose:** the family link still goes one way only. The kid gets a code and hands it to the
  grown-up, who types it on their family page, and the kid then says yes on their own page. There is no grown-up-made
  code for a kid to type: that would be a new way for an adult to start a link to a child and needs its own safety
  review. A kid on their way to a page (`?next=`, e.g. the Builder) or a guest keeping their progress goes straight to
  the kid step; a kid joining a class from `/join?code=` skips the code step.
- **Parent** (`/signup/parent`, 2 steps): "I am a parent or guardian, 18 or older" first (one box for both ways in),
  **Sign up with Google**, or a username, a password of 12 or more and the password again (`POST /api/grown-ups/signup`,
  unchanged). Then "Add your kids" (`/family/add?from=signup`, the existing step: make an account if
  PARENT_MADE_CHILDREN is on, or link an existing one by its code), which shows "Step 2 of 2". A plan picked on /plans
  and a grown-up page in `?next=` come along as before. While parents' accounts are off the step is the honest
  "coming soon" page.
- **Teacher** (`/signup/teacher`, 3 steps, 4 with Google Classroom): "I am a teacher or school staff member, and 18 or
  older", **Sign up with Google**, or a username and a staff-length password (`POST /api/onboarding/teacher`; the same
  rules as the old teacher sign-ups, `auth.checkStaffPassword`). The account is an ordinary own account marked
  `users.signup_as = 'teacher'` (migration **0074_signup_as**) until it is staff: signing in again (`homeFor`) and
  /signup take it back to the school step, and only such an account (or staff already) may use the school step, so a
  kid's own account never makes itself a school admin there. Then:
  - **Your school** (`/signup/teacher/school`): *Create my school* (school name, "Your name, as your students see it",
    an optional work email): `schools.setUpOwnSchool` makes the school with them as its **school admin at once** (the
    same code as `createTeacherWithSchool`), in the browser's time zone. There is no approval step for a new school:
    it is usable straight away, as with /trial and the /teachers form before. With a work email, a school request
    linked to the school is stored (`school-requests.createForSchool`: name, school, email; no student count or
    country), so the platform admin sees "Signed up and already using it" and "Looks good" sends the welcome guide,
    and "{school} is ready ... we'll email you a short guide" on My classes only shows when that request exists.
    *Join my school*: there is no school code, so it is the existing staff invite: the step shows their username
    (with Copy) to give their school's admin, who adds it on the People tab; "Check again" lists the invite and
    Accept (`POST /api/onboarding/invite/:sid`, `schools.answerInvite`) makes them staff. A school that signs in with
    Google can also invite their school email (the existing Google staff invite). *Skip for now*: their own classroom,
    a school of their own named "{name}'s classroom" (translated), with them as its admin.
  - **Add your classes** (`/signup/teacher/classes`, required): one card per class, a name and a grade
    (Kindergarten, Grade 1 to 8), "Add another class" (up to 10 here), `POST /api/onboarding/classes`
    (`schools.createClass`, the teacher teaches each). A school whose admin makes the classes says so and lets them on.
  - **Connect Google Classroom?** (`/signup/teacher/classroom`, only while Classroom is on): the existing
    `POST /api/google-classroom/connect` for their first class, or Skip.
  - **Done**: My classes, or `/trial` when the teacher came from it.
- **/trial**: signed out (or a guest) it redirects to `/signup/teacher?trial=1` (and `&seats=N`); the steps carry it and
  the last one goes back to /trial, where a teacher starts the trial exactly as before ("Start my free trial" with the
  work email, filled in when we already have one). Its own sign-up form is gone; `POST /api/trial/signup` still answers
  (a page left open from before), with its old rules.
- **/teachers "Set up your school"**, signed out: "Create my teacher account" (via /signup/for/teacher) instead of its
  form. Signed-in grown-ups, staff and the platform admin keep the request form. `POST /api/teachers/school-request`
  still accepts the old signed-out sign-up (a page left open), with its old rules.
- **Old addresses**: `/signup?for=kid|grownup|teacher` → the step; `/grown-ups/signup` → `/signup/parent` (keeping
  `?plan`, `?next`); `/grown-ups/login` → `/login?next=/family…`; a grown-up page that needs sign-in goes to `/login`.
  The site's own links point at the new addresses.
- **Sign-in** (`/login`) is one page for everyone: Sign in with Google (when on), or the username and password; the
  "Grown-up or teacher?" line and the guest button are gone, "Forgot your password?" folds away (a `<details>` with the
  same help). A Google account we don't know yet is still refused at sign-in (nothing is made there, no "18 or older"
  was said); the page then says "Parent or teacher? Make your account and choose Sign up with Google."

**Sign in with Google for grown-ups and teachers (owner's policy change).** Before, a new Google account got an Oomba
account only through its school. Now the parent and teacher steps may also make one:
- The step's API checks the "18 or older" box, then hands over a signed 10-minute token (`p: 'gsu'`) naming the path;
  `/auth/google/start?intent=signup` refuses to start without it. Kids never get here: the kid step has no Google
  button and no token is ever made for a kid.
- `services/google.js` `newOwnAccount`: a grown-up account (and its family), or an ordinary own account marked as a
  teacher-to-be. A generated username (e.g. SunnyOtter42, changeable later), no password, the Google id (`sub`) and its
  **verified email** kept in `google_identities` (sign-in, password resets, the trial and account emails;
  `email.addressOf` reads it). The Google name and photo are never kept. The same sign-up limits per address as every
  sign-up; a grown-up's only while families are on.
- **School flows are unchanged and come first:** a Google account already known signs in; a waiting invite (a
  student's, a staff member's or "connect this account") or a Google Classroom roster still makes or connects the
  school account; only otherwise does a sign-up make an own account.
- **Matching stays by `sub`; an email never links two accounts on its own.** A username-and-password grown-up who later
  signs in with Google is turned away like any unknown Google account and connects it from their family account page
  (the existing Me-page "Connect Google" flow, now also shown on /family/account and open to grown-ups: their password
  first, then Google). `canConnect` lets a grown-up connect any Google account; school accounts and students keep their
  domain rules.
- Privacy: see docs/legal-review.md "One sign-up" (owner decision, lawyer review pending). `LEGAL_UPDATED` is already
  2026-11-11 (today), so it did not move.

## Automatic trial at sign-up (11 Nov 2026)

The owner approved starting a teacher's own 14-day Teacher plan trial by itself during the one sign-up, with
safeguards so a teacher never pays twice (their own plan and a school seat). Before, a teacher only got a trial by
tapping "Start free trial" (Stripe Checkout); /signup teachers landed on the free plan.

- **When.** The first class saved on the sign-up's "Add your classes" step (`POST /api/onboarding/classes`,
  `TP.autoStartTrial`). Not for a school's seat trial (`?trial=1&seats=N`, which still goes to /trial and Checkout),
  and only while paid-plan pages are on for the request. /trial's "Start my free trial" (`trial=1`, also the old
  /api/trial/signup) uses the same server-side start; a paid start (`trial=0`) still uses Checkout with the card.
- **How.** `TP.startTeacherTrial`: no Checkout page. The teacher's Stripe Customer is made or reused (their email if we
  have one: typed, Google's, or the school step's; metadata owner_kind/owner_id/teacher_id, as Checkout's), then
  `subscriptions.create` on the Teacher price with `trial_period_days` = `TEACHER_TRIAL_DAYS`,
  `trial_settings.end_behavior.missing_payment_method: 'cancel'`, `payment_settings.save_default_payment_method:
  'on_subscription'`, `billing_mode: flexible` and the Checkout path's subscription metadata (owner_kind, owner_id,
  school_id, trial_key = the email's HMAC when there is one; plus `trial_start: 'direct'`). It is synced at once
  (`B.syncSubscription`), so the plan, `teacher_trials`, the funnel's `teacher.trial` and the trial emails
  (`nudges.onTrialStarted`) happen before the done screen; Stripe's own `customer.subscription.created` arrives later
  and changes nothing. trial_will_end, a card added in the Portal, the end with or without a card: exactly as a
  Checkout trial.
- **The rules stay.** Billing on and open to the account (`C.mayBill`: with a test key, billing testers only), a teacher
  (`TP.isTeacher`: never a kid, a guest, a grown-up or a school student), one trial ever per teacher, email HMAC and
  school (a school whose seat trial was used blocks its teachers' automatic trial too), no unsettled plan, an open
  Checkout closed first. **Idempotency:** one key per teacher (and email): `trial-teacher-<id>-<mode>-<email hash or
  none>`, inside the per-teacher chain the Checkout start uses, so a double submit or a retry makes one subscription.
  At most 10 automatic trials an hour from one address (`trial-auto:<ip>`).
- **Stripe trouble never blocks the sign-up.** Errors are logged (`billing.trial.auto_skip` audited with the code); the
  sign-up waits at most 8 s for Stripe; the done step then goes straight to My classes with nothing scary, and the card
  and /trial offer the trial as before.
- **What the teacher sees** (`views/trial-lines.js`, one call per page so the card can move): the done screen and the
  Teacher plan card say "Your 14-day Teacher plan trial has started. No card needed." A password sign-up (no email)
  gets an optional "Email for trial reminders" on the done screen (`POST /api/trial/email`, `TP.saveTrialEmail`): kept
  like the trial Checkout's work email (on the Stripe Customer, and `email.rememberAddress` source 'checkout'), and its
  HMAC added to the trial row. Without an email the in-app notices (the Teacher plan card in Settings, the Team inbox) still come.
  **Accepted:** a password sign-up with no email can't be matched by email, so the one-trial-per-email rule only holds
  once an email is known; the IP limit and "one per account" remain.
- **Safeguard 1 (covered: no trial).** No automatic or /trial trial when the teacher already has the plan (their own,
  a grant, a school seat: "Your school covers your Teacher plan"), or when a school they are staff of has a teacher seat
  nobody holds (`TP.freeSeatSchool`): "Your school has Teacher plan seats: ask your school admin for one" on the done
  screen, the card and /trial (which then offers only the paid start).
- **Safeguard 2 (a seat ends a trial).** When a school admin gives a seat (`TP.giveSeat` → `seatTakesOver`) to a
  teacher whose own plan is still trialing with no paid invoice, that subscription is cancelled at once through Stripe
  (`subscriptions.cancel` with `prorate: false, invoice_now: false`, key `cancel-seat-<sub>`: nothing is charged).
  The trial row is marked `replaced_by_school` / `replaced_at` (migration 0077) before the cancel (cleared again if
  Stripe refuses). The sync hook then tells the teacher in the Team inbox ("Your school now covers your Teacher plan,
  so your free trial was closed."), calls `nudges.onTrialReplaced` (the sequence stops: no "trial ended" email, no
  thank-you) instead of onTrialEnded, and the trial is neither "converted" nor "ended" (/admin/billing counts it as
  "Closed for a school seat"). It still counts as their one trial.
- **Safeguard 3 (a paid plan and a seat: warn, never cancel).** A teacher who pays for their own plan (past its trial)
  is shown on the Billing tab's seat list as "(already pays for their own Teacher plan)"; giving them a seat asks the
  admin to confirm (and the API refuses without `confirm`). Once given, the teacher gets a Team inbox message and, on
  their Teacher plan card, "Your school now covers you. You can cancel your own plan." above Manage billing (the
  existing Customer Portal flow). Cancelling stays their choice; refunds are the owner's (D10).
- **Honest about prices.** None of the new lines name an amount; prices stay on /plans and the pages that sell.

## Standards tab taken off the class page (12 Nov 2026)

The owner found the class Standards tab confusing, so it is no longer linked: it is gone from the class tabs (Lessons,
Progress, Games, Students, Settings), from the teaching loop's Check step and from the loop screenshots on the landing
and /teachers. Nothing else changed: the page still answers at /class/:id/standards (and its CSV), the lesson standards
picker, the code chips on Learn and the student report keep working, so it can be brought back by putting 'standards'
back in CLASS_TABS (routes/schools.js) and the loop (views/teacher-loop.js).

## Kit 2 themes, stage 1: the art pipeline and Sky Islands 1.0.0 (12 Nov 2026)

The owner wants games that "blow people away" and found Kit 1's home-made characters too limiting. Kit 2 (plan:
`docs/kit2-themes-plan.md`) uses real engines and CC0 art packaged as themes. Stage 1 ships the art only; no game loads it yet.
- **Sky Islands 1.0.0** in `public/vendor/themes/sky-islands/1.0.0/`: five KayKit heroes, 14 Kenney world pieces and props,
  six Kenney sounds, 1.11 MB in all (limit 5 MB). Built by `kit2/pipeline/build-theme.mjs` (glTF Transform, meshopt).
- **Kid-safe heroes:** every held item (swords, axes, knives, crossbows, shields, wands, staffs, spellbooks, the mug) is
  stripped, and only 15 of the 76 animations are kept (no fighting, falling down or dying). The heroes are renamed for
  kids: Knight, Explorer (Barbarian), Wizard (Mage), Ranger (Rogue), Hooded Ranger.
- **One moves file:** all five heroes share one skeleton, so their animations live once in `heroes/moves.glb` and play on
  any hero by bone name (checked on a contact sheet). This cut each hero from 3.6 MB to about 100 KB.
- **Art in git** (an open decision in the plan): the plan's `/vendor/themes` path and 1.2 MB per theme make git the simple
  choice for now; object storage can come later if waves 2 and 3 grow the repo too much.
- **Licences:** both packs are CC0 (KayKit's LICENSE.txt; the Kenney kit's README says its models and sounds are CC0, its
  code MIT, and no code is used). Each theme keeps `LICENSES/`, `SOURCES.md` (repository, commit, date, what changed) and
  every file's size and sha384 in `theme.json`; `tests/unit/kit2-themes.test.js` checks all of it and the 5 MB limit.
- **Not yet in the theme:** cheer, wrong-answer and ambient sounds (not in these packs; Oomba3D will make cheer and
  wrong-answer sounds in code), and Kenney's/Quaternius's full sites (not reachable from the build machine; GitHub copies used).

## Kit 2 themes, stage 2: engines and hosting (12 Nov 2026)

- **One folder for Kit 2 engines, `/vendor/kit2/`** (the plan named `/vendor/rapier`, `/vendor/phaser`): the Three.js
  0.185.1 add-ons a theme game needs (GLTFLoader, SkeletonUtils, BufferGeometryUtils, the bloom/composer passes and their
  shaders, Sky, Water, SimplexNoise; MIT, with three's LICENSE) and Phaser 3.90.0 (MIT, its last v3 release). One folder
  means one new `script-src` source. Every file and theme version is pinned in `kit2/SHIPPED.json`
  (`node kit2/pipeline/lock.mjs` only adds entries; `tests/unit/kit2-hosting.test.js` fails if a shipped file changes).
- **The frame may fetch only `/vendor/themes/`.** `connect-src`, `img-src` and `media-src` name the site's origin plus
  that path, so the pinned loaders can read models, pictures and sounds; the site API, other `/vendor` folders and every
  other host stay out of reach (checked in real Chromium: `tests/unit/kit2-frame.test.js`). Game code calling
  `fetch`/`XMLHttpRequest` itself still fails the scanner. The screenshot worker answers the two new folders from disk.
- **Still no WebAssembly.** `docs/safety.md` promises no `wasm-unsafe-eval`, so Kit 2 keeps that promise for now:
  - **Rapier physics is not shipped** (it is WebAssembly). Oomba3D does simple platform physics itself. Allowing
    WebAssembly for Rapier is a new open decision in the plan, for the owner.
  - **Sky Islands 1.0.1**: the meshopt decoder is WebAssembly too, so 1.0.0's meshopt-compressed models could never load in
    a game. 1.0.1 has the same pieces quantized only (Three.js reads them in plain JavaScript), and the server now
    brotli-compresses `.glb` from `/vendor` (632 KB on the wire for the whole theme, smaller than 1.0.0's 1.11 MB). 1.0.0
    stays unchanged and unused. `tests/unit/kit2-themes.test.js` fails any later theme version whose models need meshopt,
    Draco or Basis.
- **Scanner:** a Kit 2 3D game uses exactly `kit2ImportMap()` (Three.js plus `three/addons/` with an integrity line for
  every add-on file); Phaser only with exactly `phaserTag()`; any `/vendor/themes/<theme>/<version>/` must be a shipped
  theme version. The Kit 2 rules live in `vendor.js` beside the Three.js ones (no new module, so no import cycle).

## Kit 2 themes, stage 3: the Oomba3D library (12 Nov 2026)

- **Oomba3D 1.0.0** (`public/vendor/kit2/oomba3d/1.0.0/oomba3d.js`, our own code; reference `docs/kit2-api.md`): one
  ES module imported as `'oomba3d'` through the Kit 2 import map (now Three.js, its add-ons and Oomba3D, each pinned).
  `start({ theme, version })` loads a theme's `theme.json` and makes the sky, light, glow and clouds; the game object has
  `hero`, `world.island`, `world.piece`, `followCamera`, `controls` (keyboard, and an on-screen pad on touch screens),
  `coins`, `askQuestion`, `sound` (theme sounds through Web Audio, plus a cheer and a "wrong" made in code: the theme has
  neither), `celebrate`, `toast`, `score` and `onUpdate`. Physics is the prototype's own simple, kind platform physics.
- **Chromebook first:** low-power mode (no glow, no shadows, a third of the clouds, pixel ratio 1, no confetti) is on for
  devices with 4 or fewer cores or 4 GB or less, and switches on for good after two 3-second spells under 30 frames a
  second. `prefers-reduced-motion` stops cloud drift, coin spin, token bobbing, sinking and confetti.
- **The demo** (`kit2/demo/sky-islands.html`) is 62 lines on Oomba3D (the prototype was 311), and
  `tests/unit/kit2-oomba3d.test.js` plays it in the real game frame in Chromium: pick a hero, walk, collect a coin, a
  wrong island sinks, the right one gives +5, a cheer at the flag, no console errors and nothing asked for outside
  `/vendor`. The same test checks `docs/kit2-api.md` and the library list the same API.
- **Fix to stage 2's frame CSP: `connect-src` also allows `blob:`.** The model loader reads a model's own embedded
  textures through a `blob:` URL; without it every model drew grey (no game used Kit 2 yet, so no player saw it). A
  `blob:` URL is data the frame already holds, so this reaches no network. The play test now fails on any console error.

## WebAssembly in games, and Oomba3D 1.1.0 graphics options (12 Nov 2026)

- **The owner allowed WebAssembly in games** (the open decision from stage 2). The frame CSP's `script-src` now has
  `'wasm-unsafe-eval'`; still no `'unsafe-eval'` (no `eval`/`new Function`, and the scanner still fails both) and no
  workers. `docs/safety.md` says what this does and does not open. With it:
  - **Rapier 0.21.0** (Apache-2.0) is vendored at `/vendor/kit2/rapier/0.21.0/rapier.mjs` and in the Kit 2 import map as
    `@dimforge/rapier3d-compat`. Oomba3D loads it only when a game calls `g.physics()`, so other games don't download it.
  - The **meshopt decoder** add-on is back, so meshopt-compressed models load (Sky Islands 1.0.0 now works too). Themes
    stay quantized and brotli-served by default: smaller over the wire than meshopt here.
- **Oomba3D 1.1.0** (`'oomba3d'` in the import map now points at it; 1.0.0 stays unchanged), with the owner's "more
  graphic options":
  - Graphics levels `auto`/`low`/`medium`/`high` (players see Auto, Fast, Balanced, Beautiful): pixel ratio, shadows and
    their size, glow, SMAA smoothing (new add-on), cloud count, weather density and confetti. Auto steps down a level
    after two slow 3-second spells.
  - A **gear button** in every Oomba3D game: players pick the graphics level and turn weather effects off, for that game.
  - Time of day (`morning`, `day`, `sunset`, `night` with stars), weather (`snow`, `rain`, `sparkles`, `leaves`, as soft
    round particles), a shader sea (`g.world.water`), ink outlines (`outline: true`, the Oomba look) and `g.physics()`.
  - The demo now has water, outlines and sparkles. `tests/unit/kit2-oomba3d.test.js` also clicks the gear button's
    levels, changes the time and weather, drops a Rapier box onto a fixed platform and loads a meshopt model, in the real
    game frame.

## More worlds and characters: Castle Quest, Spooky Hollow, Space Base, Toy Town (12 Nov 2026)

The owner asked for more characters and worlds. From CC0 KayKit packs reachable on GitHub (kenney.nl and quaternius.com
are still blocked from the build machine):
- **Four new themes, 1.0.0 each:** Castle Quest (Dungeon Remastered: floors, walls, stairs, chests, keys, torches,
  banners), Spooky Hollow (Halloween Bits: pumpkins, lanterns, fences, arches, autumn trees, a purple dusk), Space Base
  (Space Base Bits: red-planet ground, landing pads, base modules, rovers, landers; first called Moon Base, renamed for its
  red ground) and Toy Town (City Builder Bits: roads, eight buildings, five cars, traffic lights). 27-33 pieces each,
  2.9-3.4 MB raw (about 1.3 MB brotli on the wire; a game loads only the pieces it uses).
- **Four new heroes, the skeleton pals** (KayKit Skeletons): Skelly, Rattles, Bonzo and Captain Clank. They share the
  adventurers' skeleton, so every move plays on them; their weapons are separate files and were not used. Every new theme
  has all nine heroes; with Oomba3D 1.1.0's `outfit` colours there are many more looks.
- **Kid-safe choices** (every model looked at on a contact sheet): no graves, gravestones, coffins, bones, skulls, crypt or
  shrines in Spooky Hollow, and not its skull-decorated bench or the gallows-shaped lamp post; no swords, shields or the
  sword-decorated pillar and banner in Castle Quest; no rubbish bins in Toy Town.
- **Pipeline:** a theme is now one short `theme.def.json`; `kit2/pipeline/from-def.mjs` makes the recipe and catalogue,
  `build-theme.mjs` measures every model so sizes are never typed by hand, and heroes are reused from an already built
  theme. `kit2/demo/theme-tour.html` lays out any theme from its catalogue (the covers), and
  `tests/unit/kit2-worlds.test.js` plays it in the real game frame for the newest version of every theme.
- **Still to come:** Under the Sea, Dino Valley and animal or kid characters need Quaternius's packs: allow quaternius.com
  and kenney.nl on the repository's cloud environment (Settings), then a session can fetch them.

## Even more worlds, buildings and trees: Medieval Village, Cosy Home, Busy Kitchen (12 Nov 2026)

The owner asked for more worlds, architecture (buildings, trees) and characters.
- **Three new themes, 1.0.0:** Medieval Village (KayKit Medieval Hexagon: hexagon ground with roads, rivers, water and
  coast; castle, houses in four colours, windmill, watermill, market, blacksmith, lumbermill, mine, church, well, tower,
  bridge, walls and fences; trees, forests, hills, a mountain, rocks, waterlilies; barrels, carts, flags, logs), Cosy
  Home (KayKit Furniture Bits: beds, sofas, armchairs, tables, bookshelves, lamps, rugs, pictures, cacti, on kitchen floor
  and walls from Restaurant Bits) and Busy Kitchen (KayKit Restaurant Bits: counters, oven, stove, fridge, pots and pans,
  burgers, vegetables, cheese, stew). 29-55 pieces each, all nine heroes.
- **Trees and buildings for existing worlds, as new versions** (shipped versions never change): Castle Quest 1.1.0 adds
  forests, hills, a mountain, rocks, a castle, a tower, a well, a fence and a bridge; Toy Town 1.1.0 adds trees, bushes and
  rocks. Their 1.0.0 pieces are copied from the shipped 1.0.0 files (the pipeline now takes pieces, not only heroes,
  from a built theme), so the original packs are not needed to rebuild.
- **Kid-safe choices:** no archery range, barracks, catapult towers, weapon rack, arrows, target, wrecked building or
  tavern in Medieval Village; no knife, dirty plates or food scraps in Busy Kitchen.
- **Characters:** no new character pack is reachable on GitHub (KayKit has only Adventurers and Skeletons there), and
  Quaternius's animals and dinosaurs sit on Google Drive, which refused anonymous downloads today ("quota exceeded").
  They come next, with Oomba3D 1.2.0 (heroes that carry their own animations).

## Number Quest tiers: three streets on one path (12 Nov 2026)

Number Quest was built with the Explorer tier (grades 3-5) alone, and the code named it everywhere. The
course now reads its tiers from its catalogue, so Launchpad (K-2) and Pro (6-8) are added as data.

- **A tier is a band.** The tier name (`launchpad`, `explorer`, `pro`) is the band stored in
  `course_progress.band` and `course_bands`, and the prefix of every step key: `<tier>-<unit>.<step>`.
  Every existing `explorer-*` key, row and URL is unchanged. Unlike CS Quest's two bands, which teach the
  same steps twice, each tier has its own units and steps; unit numbers repeat across tiers, so a unit is
  always tier + number (laps, test-outs and the soft-landing rule all compare both).
- **One module answers "which tiers".** `server/services/number-quest-tiers.js` reads `units.json` and
  nothing else: the tiers that have units, their status, their units and doors. The course loader, the
  placement service and the views ask it; none of them names a tier's units.
- **Building means admin only.** A tier's `status` is `open` or `building`. A building tier is loaded
  (so its decks are validated) but shown to the platform admin alone, who already walks every step. For
  everyone else its steps answer exactly as steps that do not exist (404), its band cannot be picked,
  and the path page, the band picker, the teacher page and placement behave as if the tier were not
  there. A tier with no units does not exist for anyone. Visibility is decided where a viewer is known
  (`bandsFor(course, user)`, `stepFor`, `stateOf`), never in the loader.
- **The street a learner sees** is their band; with no band yet, the street their placement start sits
  on; else Explorer. The switcher appears only when the viewer may see more than one street, and each
  street renders only its own units. A learner placed on a later street has the whole earlier street
  open behind them.
- **Placement stays as it was until Launchpad opens.** While Launchpad is building, a rung under 2.5
  still starts at the Explorer welcome with the gap flagged on the note. Once it is open and has entry
  profiles (`placement.json`, keyed `launchpad-<unit>.1`), those rungs walk the Launchpad units. Start
  nodes, overrides, the Just Play door, the soft landing and test-out all derive from the catalogue.
- **Game lesson modes** keep Explorer's encoding (`mode=nq-<unit>-<step>`) and add `nql-` for Launchpad
  and `nqp-` for Pro. A game opens a lesson board only for a step it has content for; any other mode
  opens the normal game.
- **Launchpad reading load** is its own rule set (two sentences a slide, twelve words a sentence, three
  words on the words slide), enforced for every Launchpad deck by
  `tests/unit/number-quest-launchpad-decks.test.js`. The contract for adding a unit is in
  `seed-lessons/number-quest/README.md`.

## Number Quest: Launchpad opens (13 Nov 2026)

All seven Launchpad units and the Garden Gate finale are built, so `tiers.launchpad.status` in
`seed-lessons/number-quest/units.json` is now `open`: the K-2 street is there for everyone. Pro still has no
units and exists for nobody.

- **Placement walks the gardens.** `placement.json` gains an entry profile for each Launchpad unit door
  (`launchpad-1.1` to `launchpad-7.1`), each asking the rung whose locked clusters sample what the unit
  teaches (the table and the evidence are in `seed-lessons/number-quest/README.md` and in
  `crosswalk.launchpadProfiles`). A run with any rung under 2.5 starts at the first garden whose profile is
  not fully met (the Launchpad welcome when nothing is settled), instead of at the Explorer welcome with a
  gap flagged. The engine was already written for this (#311); only data changed.
- **Meeting every Launchpad profile starts at the Explorer welcome, not the Launchpad finale.** The Garden
  Gate is a review a learner walks to. This is the opposite of Explorer's finale, where a run that meets
  every profile lands, because there the street has nothing after it; Launchpad has Explorer after it.
- **Just Play with a grade of K, 1 or 2 starts at the Launchpad welcome** (`launchpad-0.1`), the first step
  of the tier that matches the grade, as `beginningNode` always said it would once the tier opened.
- **Nobody is moved.** Opening writes nothing: no migration, no backfill. Existing Explorer learners keep
  their band, progress, stones, laps, marks and stored start. A learner placed at the Explorer welcome under
  the old gap rule stays there; the grown-up note says where the same answers would start today and that
  nothing has moved. A start changes only by a retake the learner confirms or a grown-up's override.
- **No new assessment was invented.** K-2 learners are told apart by the grade they name (which picks the
  short audio-first form) and the bank's existing K.0-2.5 rungs. What a purpose-built K-2 check would need is
  listed in the README; until then the profiles are curriculum-order judgements, like every rung.
- **Counts on the teacher page come from the catalogue** (steps, units, streets, games, grades), so the copy
  cannot drift from the data again. The Learn tab lists the course as K-5, and Kitchen Rush as K-2 (its
  sorting chapter carries K.MD.B.3; the shelf's grades are the lowest to the highest grade a game covers).
- **A finished street leads on.** The path page offers the next open street when every step of the one on
  screen is done.
- **Known and left alone:** a run that misses every question places half a rung under the lowest rung it
  reached, so a grade 4 learner with nothing right starts at Launchpad Unit 3, not at the welcome (the
  soft-landing rule and the override are the remedies today). Legal pages were not edited.

## Builder games may react to how loud the room is (13 Nov 2026)

The owner asked for Builder games that use the microphone (a kid's "noise spooks the animals" idea was refused). Builder
games now get the same page-side loudness as the official noise meters: a game whose code uses `BRB.loudness` makes its
play page (and the Studio page, for the preview) listen after a tap with the browser's prompt and the page's own
Listening · Stop pill, and the game receives one dBFS number about 20 times a second. Nothing about the frame changed
(opaque origin, `microphone=()`), the scanner still refuses `getUserMedia`, and no audio, words or numbers are recorded,
stored or sent. The Builder's prompt explains the API and asks for a tap fallback. `MIC_BUILDER=0` switches Builder games
back off without touching the official ones; `MIC_GAMES=0` switches everything off.

## AI voices for Builder games: fixed, scanned lines only (13 Nov 2026)

**The owner's decision (13 Nov 2026):** "All games should have the AI voiceover by default for now." Asked how far
that goes for games kids make, the owner chose: "Builder games get the AI voice, but only for lines fixed in the game
when it was built and passed by the safety scanner. Anything typed while playing is never read by it. This changes the
earlier rule, so the Privacy Policy gets an update for lawyer review."

**What it replaces.** "Builder games never get AI voices, so a kid's own words are never sent" (AI voices, client
part; review fixes). What stays: names and typed text are never read by the AI voice, no audio is stored beyond the
cache of generated speech, Oomba Live and lessons are unchanged, code-isle's `pip.say` is never spoken, and with voices
off or on any failure the device's voice reads the line.

**What is new in what leaves our server.** A fixed line of a child-made game can now be sent to the voice service
(OpenAI) when a player hears it. Such a line may contain words the child asked the Builder to put in the game. Nothing
else about the child or the player goes with it (no account, no game id, no address: our server makes the call).

**Safeguards** (`server/services/tts-built.js`, `routes/tts.js`; docs/tts-design.md "Builder games by default"):
- **Scanned versions only.** The game must be published and not hidden, its maker in good standing, and its published
  version's stored scan result `pass`. Flagged, failed and unscanned versions, drafts and every preview (Studio,
  Builder, review) keep the device's voice.
- **An allowlist from our own copy.** The server derives the lines from the stored HTML of that version (string
  literals, markup text, text attributes, and their sentences), on demand, cached per version id. No migration and
  nothing new stored. The page never supplies the list.
- **Exact matches only.** A request is read only when it equals one of those lines (whitespace tidied, case ignored).
  No numbers filled in, no names, no joins; strings with a slot are left out whole. This is stricter than official
  games (numbers may stand in their `{placeholders}`), because in a kid-made game a number in a slot can be something
  the player typed. Cost: score lines and the kit's joined "how to play" are read by the device's voice.
- **The existing checks still run:** rude words, emails, phone numbers, link codes, the player's own name or
  username, the length limit, per-person and per-address daily quotas, per-minute limits and the TTS budget.
- **One fixed friendly voice**, whatever the page asks for. **No warm-up** (made on first play, cached).
- **A switch:** `TTS_BUILT_GAMES=0` puts every Builder game back on the device's voice without a deploy of code.
- **Told to players and parents:** the 🔊 AI voices button, sheet and one-time note appear on Builder games too (the
  existing strings, 13 languages); /parents (`info.parents.ai.p4`) and /privacy (`info.privacy.children.p6`) were
  reworded in 13 languages, `LEGAL_UPDATED` 2026-11-13, lawyer sign-off pending (docs/legal-review.md 44a).

**Choices made while building it, for the owner to confirm:**
- "Passed by the safety scanner" is read strictly: the automatic scan said `pass`. A flagged version that a person
  approved for sharing still keeps the device's voice.
- Previews stay on the device's voice even when the previewed version is the published one.
- The admin's per-game switch (AI voices for a chosen game) is kept as it was, as a wider rule for the games the
  owner picked (numbers in the game's own patterns, the game's own names, a few sentences read as one).
- The Builder's prompt now asks every new game to read its instructions and feedback aloud by default, as whole fixed
  lines, with a button to hear them again. The starter templates were not changed (the kit already reads its "how to
  play"; several templates already speak).
- Known limit: a game with a long word list can have its single listed words read one at a time. Each is a fixed
  string from scanned source, never a sentence; the cache means the voice service sees a word once however often it
  is played.

Tested with the mock provider only (`tests/unit/tts-built.test.js`, `tests/e2e/tts.spec.js`); the real provider has
never been called from here.

## Kit 2 in the Builder: the 3D worlds and characters (13 Nov 2026)

The owner reported that picking the new worlds in the Builder still gave an old-kit game. Nothing under
`server/builder/` knew Kit 2: the picker, the prompt, the templates, the tools and the mock were all Kit 1. This is
stage 5 of `docs/kit2-themes-plan.md`.

- **The engine choice** (`server/builder/kit2.js` `wantsKit2`). A build uses Kit 2 when: the game already is a Kit 2
  game; or the builder picked or named a world or character (a 3D world or hero chip in the Studio, a world's name in any
  site language, or a 3D request that names a character: "a 3D game with a knight"); or there is no game yet and the
  message describes a place that is one of the worlds ("on the moon", "in a castle", "a spooky forest", "in the
  kitchen"), unless it asks for cards, a board, a word game, two players on one screen or catching falling things, says
  2D, or picks a Classic theme chip. Everything else is the old kit exactly as before: a described place never moves an
  existing old-kit game, and "a wizard quiz" alone is still a 2D quiz. A picked world on an old-kit game makes a new
  version (the AI asks first; the old game stays in Versions). The place words are English; in other languages the
  chips and the worlds' translated names do the job, and the AI itself can choose a world from the short list that is
  now in its main instructions.
- **Two sets of 3D rules, never both.** A Kit 2 build gets the KIT 2 RULES block (cached, the same bytes for everyone)
  in place of the 3D RULES, plus a short uncached note naming this turn's world and hero. 3D requests that fit no world
  still build their own Three.js world from `world3d`. The Builder's model settings were not touched.
- **No invented names.** The catalogue (`server/builder/kit2-catalog.js`) is generated by
  `scripts/build-kit2-rules.js` from `kit2/SHIPPED.json` and each shipped `theme.json`: the newest version of every
  world, with every hero, creature, piece (size, tags, note), sound and move, plus the Oomba3D reference from
  `docs/kit2-api.md`. `start_from_template` takes `world` and `hero` from fixed lists and refuses anything else with the
  real names. After each version a Kit 2 note (`server/services/kit2-lint.js`, like the kit's style notes: never a
  safety result) names a hero, piece or sound the world does not have, and `g.askQuestion()` outside Sky Islands (it
  needs the piece `island-round`).
- **Pinned.** A built game carries the literal Kit 2 import map (engines with their integrity) and names its world and
  exact version in words. The scanner now fails a Kit 2 game whose written-out world and version are not in
  `kit2/SHIPPED.json` (`kit2_theme`); an older shipped version stays allowed, so a saved game never moves. New games get
  the newest version of a world. No shipped file changed.
- **The starter** (`server/builder/templates/oomba3d.html`, filled in by `kit2Starter({ world, hero })`): a hero hops
  along a path of the world's own pieces, collects coins, jumps to the right answer of each question and reaches the
  goal; title and results screens, the words in the 13 languages, checkpoints instead of a fall to the start, and
  `window.__brbTest`. Each world has a small layout of its own pieces (`STARTERS`), checked against the catalogue.
  Oomba3D has no pause and no sound switch, so the starter has neither (the gear button is Oomba3D's own).
- **The picker.** The Studio's row of theme chips became three tabs: 3D worlds, 3D heroes and Classic. A new game opens
  on 3D worlds, an old-kit game on Classic. Chips have pictures: the worlds' own covers, and each character drawn by
  Oomba3D in the game frame (`scripts/kit2-thumbs.js`). The Build page has a card per world above the classic starters.
  Every new word is in all the site's languages; the world names are made-up place names, kept distinctive because the
  engine choice recognises them.
- **Nothing safety-related loosened.** The frame, CSP and sandbox are the ones official Kit 2 games already had; the
  scanner refuses everything it refused (the tests add the same refusals inside a Kit 2 game). Nothing new is stored;
  the model is sent nothing more about the child than before (their message, as always). The automatic playtest calls a
  Kit 2 game slow only under 3 frames a second (others: 8): the test machine draws a whole world of models without a
  graphics card, and Oomba3D lowers its own graphics on a slow device.
- **Animals and dinosaurs: none has shipped.** The owner asked for them, but no theme has a creature (the Quaternius
  packs are still unreachable from the build machine, see above). The Builder says so kindly and picks the closest hero
  rather than pretend; the catalogue, rules, picker and tests read `creatures` from the manifests, so they appear when a
  theme ships them.
- **Not verified:** a build with the real model (no API key on the build machine). Verified with the mock builder, the
  fake Messages API (the blocks the model is sent, the tool refusals), the starter in every world, and real Chromium in
  the production frame (`tests/unit/builder-kit2.test.js`).

## The Builder picks the world and hero from the idea, and never swaps silently (13 Nov 2026)

The owner found Builder games defaulting to the same classic look (a fox in a meadow), and creatures the kit lacks
(a shark, a dragon) quietly became the closest species. The kit rules the Builder reads (docs/kit-api.md, builder
parts, generated into server/builder/kit-rules.js) now say: the world and hero come from the idea (sea `reef`, ice
`snow`, dinos `jungle`, robots `city`, aliens `space`, dragons `castle`, spooky `haunted`, sport `stadium`, ...),
`meadow` is for fields and farms only, the examples' fox, castle and meadow are only examples, and when the kit lacks
what the builder named the reply says so (what was made instead and how to change it). The rules stayed inside their
32,000-character budget (a few existing lines were tightened). Tried and ruled out for now: drawing a missing
creature with `Oomba.art.define` (a defined name is not a species, so a hero falls back to the mascot and a spawned
kind to a placeholder); custom creatures need the kit's creature maker first.

## Pirate Cove 1.0.0: the first world from an uploaded pack (14 Nov 2026)

The owner uploaded 14 asset packs (branch `asset-packs`, plan: `docs/kit2-packs-plan.md`). Pirate Cove is the one world
those packs make complete without a new Oomba3D, so it ships first, on Oomba3D 1.1.0 with no engine change.

- **The theme** (`public/vendor/themes/pirate-cove/1.0.0/`, 2.86 MB first load, limit 5 MB): 59 models of the Kenney
  Pirate Kit 2.1 (CC0), two sea islands made from the kit's sand and grass patches, the coin and sounds every theme
  reuses. A sunny cove: sand and grass islands, palms, rocks, docks and plank platforms, towers and wall pieces for a
  harbour fort, huts, rowing boats, three sailing ships and a shipwreck, barrels, crates, a treasure chest, flags.
- **Left out, kid-safe** (listed in `kit2/packs/pirate-kit.json`, checked by `tests/unit/kit2-pirate-cove.test.js` by
  name, by source and inside every built model): `cannon`, `cannon-mobile`, `cannon-ball` (weapons, even as scenery);
  `bottle`, `bottle-large`, `crate-bottles` (they read as rum); `ship-pirate-small`, `-medium`, `-large` (skull and
  crossbones on the sails); `ship-ghost` (a ghost ship). The kit's four black flags are plain black with no skull; one is
  kept (`flag-black`) beside four cream ones, three are left out. The world's icon is a sailing boat, not the skull flag.
- **What the world is about:** treasure maps, sailing and island hopping. Treasure is found, counted and shared: no
  weapons, no fighting, no "enemy" words, nothing bought or sold and no prices, in the catalogue, the starter and the
  Builder's words (the test reads them).
- **Five heroes, not nine** (the plan's recommendation for new worlds: the nine cost 2.26 MB of every theme's 5 MB):
  the adventurers, with the Explorer first (the default for "a pirate treasure game"), then Knight, Wizard, Ranger and
  Hooded Ranger. Their files are the same bytes as in every other world. The skeleton pals are not here, so the word
  "pirate" is a place first: it suggests Captain Clank only in a world that has him, and nobody is told he is missing
  unless they asked for him by name.
- **Size and scale:** the kit is drawn for small figures, so the pieces are baked 1.3 times bigger for the 2.4 m heroes
  (barrel, crate and chest keep the kit's size). The islands are the kit's flat patches made 12 times thicker, because
  Oomba3D's sea rises and falls about a metre: the world stands IN the sea (`look.water`: y -1.5), tops at 0.
- **Flat faces, Oomba3D 1.1.0:** the pack config's `inkNormals` step (smooth normals for a crack-free ink outline, with
  the faces marked flat for a later Oomba3D) is NOT used: on 1.1.0 it draws the models smooth, and in a test scene the
  whole picture went white. The kit's own flat normals look right on 1.1.0 and the outline holds. Revisit in a new
  theme version once Oomba3D 1.2.0 honours the flat mark.
- **The chest stays shut:** its `open` and `close` clips are kept in `props/chest.glb`, but Oomba3D 1.1.0 does not play
  a piece's clips. For 1.2.0 (piece clips): open it at the goal.
- **Pipeline** (all opt-in, a definition that names none builds as before): a pack in `theme.def.json` may carry
  `steps` (the `pack-steps.mjs` fields for every model from it) and a piece its own as a 7th field; a `stretch` step;
  `build-theme.mjs` takes the folder of the packs' pictures as a 5th argument. The raw FBX and converted GLB stay out of
  the repository; rebuilt from the FBX, every model came out byte for byte the same (the test does this where the
  converted pack is: `KIT2_RAW_PACKS`, `KIT2_PACKS`, `KIT2_TOOLS`).
- **Builder:** place words ("pirate", "treasure island", "treasure map", "on a ship", "at the docks", "a cove"...)
  choose Pirate Cove for a new game, before the castle's "treasure chest"; "a space ship" stays Space Base; a card,
  cover, 2D or word game about pirates stays on the old kit's Pirate theme as before. The starter is a sand island, docks
  to hop along, grass islets for the answers, the chest in front of a fort tower, ships and rowing boats on the water.
  For that the starter template learned two optional LAYOUT fields, `seaY` and `afloat`, a fall that ends just under the
  water, and answer tokens that no longer cut a square out of the sea behind them (a fix for every world with water);
  the theme tour puts a sea theme's ships on its sea. Names in the 12 locale files, picker chip and Build card from the
  cover (`scripts/kit2-thumbs.js`).
- **Not verified:** a real GPU or Chromebook (software WebGL only), sound by ear, and a build with the real model.
  Heroes stand on a piece's bounding box, so near the rounded corners of an island a hero can stand a little past the
  sand (as on Sky Islands' round island). The hero cannot walk on a ship's deck: a ship's box reaches its mast top, so
  ships are scenery in this version (a `deck` square at deck height is the way to make one walkable).

## Number Quest Pro: foundations (14 Nov 2026)

The owner approved the plan for the Pro tier (grades 6 to 8) today. This is the first build: the tier is declared
as `building` (the platform admin alone sees it), and everything its seven units need is reserved up front so they
can be built side by side. No Pro game and no Pro unit deck exists yet. The owner's seven decisions:

1. **Names.** The district is The Towers; the stones are Gears (Ratio, Zero, Variable, Scale, Slope, Angle, Chance);
   the finale is The Great Clock.
2. **Coverage.** Pro ships as "the major work of grades 6-8", not all of it. The known gaps (circles 7.G.B.4,
   cylinders, cones and spheres 8.G.C.9, exponent rules and scientific notation 8.EE.A, irrational numbers 8.NS) are
   listed honestly on the teacher page when the tier opens. All 19 uncited statements are recorded now in
   `standards.json` `proCoverage`, so that copy is generated from data.
3. **Percent contexts.** Games use neutral contexts (recipes, maps, sports statistics, science data). At most one or
   two tax or discount items, in step 4.3's lesson check only. No interest or commission anywhere. Kids are never
   sold to.
4. **Entering Pro.** A learner must be at rung 5.5 or above in every strand; otherwise the Explorer finale door, as
   today.
5. **Functions.** Step 5.2 claims 8.F.B.4, with 8.F.A.1 and 8.F.A.3 as also-covers, and nothing else in 8.F. This
   replaces the spec's rule that Number Quest "bridges it, never claims it" (section 2.5 note 10); the registry's note
   and `correctionsToSpec` say so.
6. **Read-aloud is on by default in Pro games** (the standing rule: every game has the AI voiceover by default),
   with the usual replay button.
7. **The finale is a fourth chapter of the Unit 7 game**, as in Launchpad.

What the build decided, and why:

- **Planned units.** The seven units and their 22 steps are in `units.json` now, with their final numbers, titles,
  gears, step `order` numbers and CCSS-M codes, each marked `planned: true`. Launchpad never had this: its units were
  added one after another, each with its decks, which is why they could not be built in parallel. A planned unit is
  not in the tier for the engine (`unitsOf` and `stepsOf` leave it out), so it has no step, door, start node, test-out
  or standards tag for anyone, and nothing downstream had to learn a new state. Only the admin's preview lists the
  planned units. A tier with a planned unit is never open. Building a unit is deleting the flag in the change that
  brings its decks, bank and game; the README lists exactly what that change touches.
- **The lock.** The grade 6-8 cluster headings moved from `deferredClusters` to `clusters` (one heading, 8.EE.A, was
  corrected to the published text). `proCodes` holds the 69 statements, each with the published wording, checked
  against `server/standards/ccss-math.json`.
- **The Sorting Game's rungs 6.0-8.0 were rebuilt, because they were already being served.** The 72 templates there
  had no cluster code, 15 named grade and domain pairs that do not exist, and most were earlier grades' work with
  bigger numbers. 63 were retired (kept findable by id so an item already on a screen still grades), 9 sound ones
  kept with their real cluster, and 77 written from 73 new generators (slope, the Pythagorean theorem, moves on the
  plane, surface area, dividing by a fraction, negative numbers, proportionality, box plots, scatter plots,
  probability). A test solves every generated item independently from its prompt and demands exactly one correct
  choice. Nothing below rung 6 changed: the 180 templates there and every item they deal are pinned by hash, and so
  is where every possible set of placed rungs starts.
- **Placement is recorded and inert.** The Pro starting line (`PRO_LINE`, 5.5) and the seven entry profiles are in
  `placement.json`. While Pro is building they change no start: placement only lands on an open street, and a planned
  unit's profile cannot be asked for. Existing learners are never moved, now or when the tier opens.
- **Maths in text.** Pro decks print the real signs (a true minus sign, ², √, ×) whatever the author typed, and
  read-aloud says them in words ("negative 3", "x squared"). Only Pro text and rung 6.0-8.0 prompts pass through
  this; every line a learner hears on the two open streets is what it was.
- **Pro deck limits** are their own (up to four sentences of 28 words a slide, grade 9 reading or under), held by a
  test for every file in `course/pro/`.
- **Copy.** Nothing learner-facing mentions Pro. The teacher page's placement matrix and explainer now take the third
  street from the data, so opening Pro is a data change; today's pages are byte for byte what they were for anyone who
  is not the admin.

Known and left alone: the teacher page's lock note still says the Pro tier "is specced but not built yet, and its
codes are not cited here until its own lock lands". The lock has landed; the codes are still not cited there, and the
sentence changes with the rest of the course copy when the tier opens. The locale copy ("two streets", "kindergarten
to grade 5") is likewise the opening's work.

## Oomba3D 1.2.0: animals, and a saved game keeps its own Oomba3D (14 Nov 2026)

The owner uploaded animal packs (`docs/kit2-packs-plan.md`). This is the plan's "long pole": the library that can show
them, and a first set of ten animals to prove it, with no new world.

- **Oomba3D 1.2.0 is a new file beside 1.0.0 and 1.1.0**, which are unchanged (their hashes are written out in
  `tests/unit/kit2-creatures.test.js`). It adds `g.creature(id)` (`play`, `walkTo`, `follow`, `wander`, `followHero`,
  `onMeet`, `stop`, `remove`), `g.school(id, n)`, an animal as the hero (`g.hero('horse')`), `g.world.ground()`, a
  piece's own clips, `'bubbles'` weather and `g.controls(hero, { swim: true })`. Everything is opt-in: a game that
  calls none of it draws and plays as on 1.1.0 (the seven seed games and every world tour run on 1.2.0 unchanged).
- **A game picks its Oomba3D with its import map and keeps it.** Until now the scanner accepted one import map, so a
  library bump would have failed every saved Kit 2 game the next time it was scanned. Now `kit2ImportMap(version)`
  exists for every shipped Oomba3D, the scanner accepts each of those maps and nothing else (a version that has not
  shipped, or one version's file with another's integrity, fails), and `kit2ImportMap()` is the newest, for new games.
  The Builder's starter and the seed games carry the 1.2.0 map (their own tests require the newest map after a bump);
  games already built keep theirs.
- **Kind by construction, not by convention.** Creatures are never added to what the hero stands on or bumps into;
  the creature code never touches the score or the hero's position; the library filters out any clip whose name
  matches attack, death, hit, punch, kick, shoot, gun or bite before it can be played; big animals (the horse, stag and
  cow) stroll and never exceed 2.5 a second by themselves (the hero runs at 7); and no animal takes a step that would
  bring it inside its calm distance of the hero: it waits. `followHero` is a companion that stops behind the hero, not
  a chase. A test reads every built `.glb` for clip names: the only match anywhere is `Hit_A`, the heroes' "bump" move
  in the shared `moves.glb` that shipped with Sky Islands 1.0.0 and cannot change; no creature file has one.
- **Animals live per theme** (`theme.json` `creatures`), as the plan recommended: the catalogue, lint, scanner, 5 MB
  test and picker already work theme by theme. They joined existing worlds as new versions, built with
  `"base": "<theme>/<version>"` in the definition so every older file is copied byte for byte:
  **Medieval Village 1.1.0** (donkey, cow, husky, pig, sheep; 4.88 MB) and **Castle Quest 1.2.0** (horse, deer, stag,
  fox, shiba; 4.53 MB). The brief proposed all eight woodland animals in Medieval Village: that world had 0.49 MB left
  under the 5 MB limit and the eight are 0.8 MB even compressed, so they are split by where they fit, and the pig and
  sheep (Farm Animals pack: `idle` and `jump` only) were added so the "no walk" case ships and is tested. Sky Islands
  was left alone: its 1.1.0 is planned for the sky pack.
- **Size.** A creature was 210 to 290 KB (eight clips, mostly JSON and keyframes). Three clips nobody needs yet were
  dropped (`look`, `graze`, `land`; kept: `idle`, `eat`, `walk`, `run`, `jump`) and creature files are
  meshopt-compressed (allowed since WebAssembly was; the heroes and pieces stay as they were): 93 to 114 KB, about 40 KB
  on the wire. Farm animals: 36 KB.
- **One draw call an animal.** A cow has seven flat colours, so it was seven meshes (fourteen with the ink outline,
  twenty-one with shadows). The pipeline's `oneDraw` puts the colours into a 32 by 4 palette picture and joins the
  parts: one mesh, so two draw calls with the outline and three with shadows. Measured in the animals demo (six
  animals, a school of four): Fast 150 draw calls and 73,000 triangles against 130 and 49,000 with no animals;
  Balanced 372 and 153,000 against 342 and 117,000. With 30 animals and a school of 30 asked for, Fast still draws
  150 calls (10 animals shown), Balanced 401 (20), Beautiful 525 (all).
- **Colour.** The FBX colours draw darker than the store pictures. `brighten` (a pack step: gamma, gain, saturation in
  sRGB, near-black materials left alone) was tuned on contact sheets to gamma 0.8, gain 1.12, saturation 1.15.
- **Feet.** Each walker carries `pace` (how fast the ground passes under a standing foot in its walk and run clips,
  measured from the built file) so the library plays the clip at the speed the animal really moves, and `jumpAir` (the
  part of its jump clip spent off the ground). **The pig and sheep hop:** they travel only while their jump clip has
  them in the air and stand between hops; with reduced motion they glide in their idle pose. A playable animal's jump
  skips the clip's crouch and is fitted to the time the hero is in the air.
- **Chromebooks.** Per graphics level only so many animals animate and are drawn (Fast: 6 and 10, and 12 in a school);
  animation is paused off screen; copies share geometry, materials and clips; a school shares one skeleton and one
  animation. Draw calls and triangles were measured (below); frame rates were not: the build machine renders in
  software.
- **The Builder.** New builds are on 1.2.0. The catalogue lists each creature with `kind`, `size`, `moves` and
  `playable`; the rules give the creature API, say never to invent a creature name and that animals are never enemies
  or obstacles; `kit2-lint` notes an unknown animal (`kit2_creature`), a hopper as the hero, and creature calls in a
  game pinned to an older Oomba3D (`kit2_engine`). The starter has `companion` in CONFIG, and
  `start_from_template "oomba3d"` takes a `companion` and a playable animal as `hero`. An animal a world has is used
  (a playable one named alone is the hero; "with my dog", a named hero, or a hopper make it a companion; "a dog" is the
  husky in the village and the shiba at the castle); one no world has (a dinosaur, a cat) still gets the honest "not
  yet". As for hero words, an animal word alone does not turn a 2D or other 3D request into a 3D-world game. A saved
  game on an older Oomba3D or world version is never edited into creature calls it cannot run: it is moved to a fresh
  starter with its title, questions and words carried over.
- **Left for later:** an "Animals" tab in the picker (the ten animals are in the 3D heroes tab, named in every site
  language; a fourth tab needs new strings and a "comes along" chip sentence in 13 languages and a narrower tab bar on
  phones); dinosaurs, sea creatures and the T-Rex question (their worlds); the three dropped clips.
- **Not verified:** motion was judged from still frames and from positions and clip states read in tests, in software
  rendering; no real Chromebook; a build with the real model. A piece's own clips run against Pirate Cove's chest
  (`open`, `close`) in the test, but no game or starter opens it yet.
- **`inkNormals` and the white picture.** Pirate Cove found that models built with `inkNormals` drew a blank white
  picture on Oomba3D 1.1.0 (cause not looked into). The animals are built with it, and only Oomba3D 1.2.0 can load
  them (`g.creature`, `g.school`, an animal hero): 1.1.0 has no call that reaches a `creatures/` file, and the two new
  theme versions copy every hero and piece from the version before, byte for byte. On 1.2.0 a test reads the pixels of
  a rendered frame of the cow: not washed out, brown, with ink.

## Wild Woods 1.0.0: a nature world from two uploaded packs (14 Nov 2026)

Two more CC0 packs were uploaded to branch `asset-packs`: the Kenney Nature Kit 2.1 (329 models) and the Quaternius
Ultimate Nature Pack (150). Wild Woods is built from them the way Pirate Cove was, with no engine change: it needs
nothing newer than Oomba3D 1.1.0 (it was built and looked at on 1.1.0), and new games in it are on 1.2.0 like every
new build. Two other uploads are NOT used: `amir-forest-nature-pack` (its licence is unclear) and the `reodesuxz-*` packs.

- **The theme** (`public/vendor/themes/wild-woods/1.0.0/`, 2.29 MB first load, limit 5 MB): 107 pieces. 89 from the
  Kenney kit (meadow, hill and cliff blocks, rock faces, a waterfall, path and river tiles, three bridges, 15 trees,
  rocks and stones, flowers, mushrooms, logs, stumps, tents, a campfire, a camp bed, a canoe, a signpost, fences), 17
  from the Quaternius pack (five trees, bushes with and without berries, mossy rocks, a mossy log and stump, a fern,
  blue flowers, a water lily), and the coin and sounds every theme reuses. The same five heroes as Pirate Cove.
- **Left out** (listed in `kit2/packs/kenney-nature-kit.json` and `quaternius-ultimate-nature.json`, checked by
  `tests/unit/kit2-wild-woods.test.js` by name, by source and inside every built model): neither pack has a weapon, a
  trap, a skull or a bone. Left out because they do not suit a sunny wood for young children: the 30 bare "dead" trees
  (they read as spooky), the carved stone head and the other statues and columns. Left out because they belong to
  another world: every snow piece, cacti, palms, crops and field rows. Left out to keep the world small: the kit's
  second (grey stone) cliff set, pots, hanging moss and near-duplicates of what is in. The campfire is logs in a ring of
  stones with no flames: a cosy prop, nothing burns.
- **Colours:** both packs carry plain material colours, no pictures. FBX2glTF reads the Kenney colours too pale (mint
  grass, pink wood) and the Quaternius ones too dark (near-black leaves), and the two packs' greens do not match. A new
  opt-in pipeline step, `colours`, gives every material one sRGB colour by name, from one woodland palette in
  `theme.def.json`; the test checks every material of every model has its palette colour. A second new step, `shift`,
  lifts the Kenney models by the 0.05 they all sit below their own floor. A recipe that names neither builds as before
  (Pirate Cove still rebuilds to its bytes).
- **Size and scale:** the Kenney kit is drawn on a 1-unit grid, baked 4 times bigger for the 2.4 m heroes: ground tiles
  are 4 m, trees 4 to 7 m, fences 1.4 m, tents (5 times) 2.8 m high. Flowers and mushrooms are 3 times (0.4 to 0.9 m,
  storybook size). The Quaternius models are 2 times (trees 5 to 8 m), bushes 1.4, small plants 1.5.
- **Ground:** `meadow` and `stone-block` are the kit's 1-unit cliff blocks made 4 wide and 3 deep, so the same block is
  the ground of a dry wood (tiled, y -3) and an island or stepping stone in a lake. Path and river tiles are the kit's
  own thin tiles (0.2), laid at y 0 in place of a meadow block. Bridges, steps and slopes are scenery in this version:
  a hero stands on a piece's bounding box (as with Pirate Cove's ships), so a bridge's box is as high as its posts.
- **`inkNormals` is not used** (it blanked the picture on Oomba3D 1.1.0, see Pirate Cove; nor `meshopt` or `oneDraw`). Both packs' own flat normals draw
  right and the ink outline holds.
- **Builder:** place words (English: "forest", "woods", "woodland", "meadow", "camping", "campfire", "nature trail",
  "hiking", "waterfall", "across the river") choose Wild Woods for a new game, after Spooky Hollow so "a spooky forest"
  stays there; a card, word, 2D or catching game stays on the old kit. The starter is meadow islands in a forest lake
  (`seaY` -1.5, `lake: true`), grey stone blocks to hop along, the tent as the goal with a waterfall behind it. Names in
  the 12 locale files, picker chip and Build card from the cover. The theme tour learned one thing: a theme with stream
  tiles (tags `river` and `tile`) gets a stream across the front row and its first bridge over it.
- **No animals in this version.** Oomba3D 1.2.0 can show them; woodland animals join as a new theme version.
- **Not verified:** a real GPU or Chromebook (software WebGL only), sound by ear, a build with the real model, and the
  walk of a whole level by hand on a phone. The cover's bridge stands at the right edge of the picture.

## 2D art packs: the Kit 2 worlds, heroes and animals for 2D games (14 Nov 2026)

The owner asked: "Can we also make these worlds available in 2d?" Branch `kit2-art2d` (no pull request yet).

- **What ships:** twelve versioned packs under `public/vendor/art2d/<pack>/1.0.0/`: one per world (all ten, Wild Woods
  added after it shipped), `heroes`
  (the nine heroes) and `animals` (24: woodland, farm, dinosaurs). Worlds and heroes are drawn only from shipped theme
  files; the animals from the staged conversions of the uploaded Quaternius packs (CC0; the licence texts ship in the
  pack). `kit2/pipeline/art2d.mjs` draws them in headless Chromium with the 3D look and writes WebP; the same input gives
  the same bytes (the test draws Pirate Cove and the heroes again and compares with the lock). The animals need the
  staged models (`--stage`), which are not in the repository, so their rebuild is not in the test; their files are
  locked like the rest.
- **The old kit stays the engine, frozen.** Oomba2D (`public/vendor/art2d/oomba2d/1.0.0/oomba2d.js`) only registers
  pictures as kit sprites (`Oomba.art.define`) and moves a few ordinary stage entities: the world's sky, strips and
  under-colour sit on the kit's layer between its own hills and the ground, the ground tiles and the hero are given
  the world's sprites, and the hero's frame follows what the kit's physics is doing. The kit does everything else
  (physics, HUD, pause, results, sound, read-aloud, languages, reduced motion, the low-power governor). No shipped kit
  file changes. Oomba2D reads a few stage fields the kit's docs do not list (an entity's `sprite`, `variant`, `par`,
  `sx`/`sy`, the `ground:` sprite name, `stage.view`): the frame tests play real games on the current kit, so a kit
  version that changes them fails a test before it ships; a game whose art cannot load plays with the kit's own look.
- **Loading and the frame:** a game loads Oomba2D and its packs with pinned tags (integrity, crossorigin) after the
  kit's tag; the scanner accepts exactly those tags and refuses any other mention of `/vendor/art2d/` (a game never
  names a picture). The pictures are `<img>` loads made by Oomba2D (with `crossOrigin`, or the kit's WebGL canvases
  would be tainted in the opaque-origin frame). **The frame CSP gained one path, `/vendor/art2d/` on our own origin, in
  `script-src` and `img-src`**, and nowhere else (not `connect-src`: nothing is fetched). It could not be avoided:
  `/vendor/themes/` and `/vendor/kit2/` are locked folder by folder to theme and engine versions. The exact-policy
  assertions in `vendor.test.js`, `kit-platform.test.js` and `kit2-hosting.test.js` name the new source.
- **Engine choice: 3D stays 3D.** Everything `kit2.js` sent to a 3D world before still goes there ("a running game in a
  spooky forest", "a pirate quiz"). The 2D art is used when the build is a 2D one and names a world or an animal: a
  kind of game only 2D makes ("a pirate catching game"), "2D", the Classic tab's new world and animal chips, or a
  running or catching game with a sprite animal that the described 3D world does not have ("a running game with a fox on
  the moon"). Since Castle Quest 1.2.0 and Medieval Village 1.1.0 have animals of their own, "a running game with a fox
  in the castle" is a 3D game with the fox as a friend; "a 2D running game with a fox in the castle" is the 2D one. A request for an animal with no sprite (a shark, a T-Rex) gets
  one honest sentence, as in 3D.
- **Safety:** obstacles are the world's things (barrels, crates, rocks, pumpkins); the bee and the rolling spike ball
  are taken out of a level that draws a world, and animals are only the hero or scenery. Nothing new is stored, no
  network, no text box, no prices.
- **Left for later:** the quiz, word, memory, duel and board templates do not draw the worlds; the sea creatures and
  cute fish; the T-Rex (not decided); the results card shows the sprite but the kit's small pictures elsewhere (an
  NPC bubble) do not; clouds are few. **Not verified:** a real phone or Chromebook GPU (software WebGL and the 2D
  canvas backend only) and a build with the real model.

## Step-by-step game setup before the Builder (14 Nov 2026)

"New game" on `/build` now opens `/build/new` (`server/routes/build-setup.js`, `public/js/buildsetup.js`,
`public/css/build-setup.css`): "Help me choose" (six steps, then "Here is your game plan") or "I know what I want"
(an empty game and the Studio, as before). Every step has "Skip to the Builder". The starter and world cards on
`/build`, and opening a game in progress, are unchanged.

- **The plan is data** (`server/builder/plan.js`): `{ type, look, world, characters, learn, notes }`. Game type, world
  and each character are `{ from: 'pack', id }` or `{ from: 'custom', text }`. "Open the Builder" posts it as
  `plan` with the game's first chat message; the server writes the message itself from the plan, in the builder's
  language, so the typed words pass the same screening as any typed message. The plan is kept on the build's row and
  on the builder's message. Nothing is stored by the setup page, and nothing on it uses the voice service.
- **Pack choices are used as given; custom ones are built from scratch.** The model reads a `SETUP CHOICES` block
  (`planNote`), and the engine comes from the plan, not from the words (`engineFor`, `art2dFor`): a pack world with 3D
  is always a Kit 2 game in that world; a world of their own is never a ready-made world. A 3D plan with a pack
  character and a world of their own runs on Oomba3D (the characters only exist there) with the place built from
  scratch. The one new exception in the Kit 2 rules: a character marked CUSTOM may be built from simple shapes.
- **2D uses the 2D art packs** (`art2d.js`): a running or catching game (an adventure, or no kind picked, is a running
  game) starts from that template with the plan's world and ONE sprite character (`start_from_template` world and
  sprite, the 2D ART RULES). Quiz, word, memory, two-player and board games do not draw worlds or sprites yet: the
  page says so on the world step, the characters step and the plan, and the Builder is told to keep the kit's look,
  use the choices as the game's idea and say so.
- **Who is in it** is grouped from BOTH catalogues (`setupCharacters`): the 3D worlds' heroes and animals and the 2D
  sprites, once each. `kit2/creature-groups.json` gives each animal a group (the generator writes the list into
  `kit2-catalog.js`; a 2D sprite falls back to its pack's group). What can be picked follows the 2D or 3D choice:
  for 3D (or no choice, or "You pick for me") the 3D characters, limited by the world and by sharing a world; an
  animal that is only a sprite (the dinosaurs, zebra, llama...) says "Only in 2D games so far", and its group
  "Coming soon in 3D". For 2D every sprite, one of them. "Coming soon" stays only for a group neither catalogue
  has (fish and sea animals).
- **Cards** on one screen are one size by construction (equal columns, fixed picture shape, clamped lines).
  World cards use the real cover; "Preview" opens a dialog with a 1280x720 picture of the Builder's own starter in
  that world (`public/img/kit2/worlds/<world>-preview.webp`, made by `node scripts/kit2-thumbs.js --previews`).
- **Files:** the extras step takes worksheets and notes (PDF, text) through the Studio's own upload, after the game
  exists. Pictures are not taken on this page; they are added in the Studio as before.
- **Not verified:** a build with the real model (no key here), so the `SETUP CHOICES` wording is untested against it.

## Number Quest Pro Unit 1: The Mixing Tower and Lantern Mix (14 Nov 2026)

The first Pro unit, built to the unit contract in `seed-lessons/number-quest/README.md` ("What a unit PR touches"):
three decks, nine exit items, the game Lantern Mix in Spooky Hollow at night, and the one-line registrations. Pro stays
`building`; nobody but the platform admin can open a Pro step. Where the build left the plan, and why:

- **Read-aloud is on by default**, with the speaker button to repeat a line. The plan said a button, off by default;
  the owner's decision 6 replaced that.
- **Oomba3D 1.2.0**, the newest, not the 1.1.0 the plan named (it was written before 1.2.0 shipped). No kit file
  changed and no helper was added to the library: the dials, the board and the camera fit are the game's own code.
- **Plan, then run.** The plan had a double number line that "fills as the player works". A board that shows the
  outcome while a dial is turning invites sliding until it looks right, so the board shows only the plan (the parts
  poured, the amount set) until Light it is pressed. Then the plan is run, right or wrong, and its real result is
  drawn: the two mixes as shares of amber, where the amount lands on the number line, the stretch of path lit.
- **A match is decided by the ratio.** `LanternMix.judge` cross-multiplies whole numbers and never reads a colour;
  the glow's hue is a function of the ratio in lowest terms, so equal ratios glow identically. Colour is never the
  only signal: amber parts are striped, blue parts dotted, and every gauge has its numbers beside it.
- **Dials** are a slider with a minus and a plus button (a native range input, so the arrow keys and touch work with
  no extra code). At most 50 stops a dial. Nothing is typed.
- **Rounds the plan did not list**, added so each chapter has six and each code is played more than one way: working
  back from the other oil, "use all 10 parts and glow more amber than the gate" (comparing ratios, several right
  plans), two lanterns' unit rates compared, a steady walking pace (constant speed, 6.RP.A.3b), what percent a tank
  is full, and the whole tank from a part and its percent (6.RP.A.3c names all three).
- **"Lanterns every 250 m along 3 km"** became "one lantern lights 250 m of the path". Posts at each end make the
  plan's wording 12 or 13 depending on how it is read; a stretch of path lit by each lantern is 12 with no argument.
- **The ratio table** is a round of its own (the missing lantern of five), not a second task inside the 15-part round.
- **Contexts are neutral** (decision 3): oil, burning time, distance. No prices, tax, discount, interest or commission
  in the decks, the bank or the game, and the game uses neither the theme's coin nor its chest: there is no reward
  currency, only a rack of six lit lanterns.
- **A built unit's entry profile is live in the engine.** `P.testOutItems(1, _, 'pro')` now deals items, because
  Unit 1 is no longer planned. The route still refuses a Pro test-out and placement still lands nobody on Pro while the
  tier is building (the foundations tests hold both).
- **Left for the opening PR:** the teacher page's game list (`NQ_CREW` in `server/routes/number-quest.js`) and its
  locale strings do not name Lantern Mix. Adding it means new copy in 13 locale files, which the contract keeps out of
  a unit PR. Until then the admin's preview of the teacher page shows Unit 1's steps without the game's card.
- **Public surface.** As the contract says, the game itself is a library game from the day it is registered: it is on
  the Learn shelf (math, grade 6) and in the Number Quest course's game list. Its title, description and tags never
  name the Pro tier. Every Number Quest page is byte for byte what it was for anyone who is not the admin.
- **Not verified:** a real GPU, a real phone or Chromebook (software WebGL in headless Chromium only), the AI voice by
  ear (the test checks every line is sent and is on the allowlist, not how "1.5 milliliters" sounds), and play by a
  student of the age.

## Number Quest Pro Unit 2: The Cold Store and Sub Zero (14 Nov 2026)

The second Pro unit, built to the unit contract in `seed-lessons/number-quest/README.md` ("What a unit PR touches"):
three decks, nine exit items, the game Sub Zero in the Busy Kitchen world, and the one-line registrations. Pro stays
`building`; nobody but the platform admin can open a Pro step. Where the build left the plan, and why:

- **Read-aloud is on by default** (owner decision 6), not a button that is off by default as the plan said. So that
  the voice allowlist only ever sees digits in a number's place, a spoken line is written the way it is said
  ("negative 6 degrees", "3 fourths", "divided by") and the screen prints the same line with the real signs
  (`SubZero.shown`). The wording is the one `math-text.js` gives a deck's read-aloud.
- **Oomba3D 1.2.0**, the newest, not the 1.1.0 the plan named. No kit or theme file changed: the steel look is a
  small shader patch on a copy of each piece's material, made by the game.
- **Not Kitchen Rush.** The two games share a world, so Sub Zero is the kitchen at night, washed in steel, with no
  food piece loaded, a dark lab screen, no helper picker, a game-made deep freezer with a rack of sample vials, and
  steppers and tiles instead of three picture buttons.
- **Plan, then run.** A stepper (or a drag of the marker on the thermometer) and a run button, or three tiles. A wrong
  plan is run and drawn as it turns out: jars left empty, the pot not empty, the reading landing short. In the "reach a
  target" rounds the screen does not show where a change would land until it is run, so the change has to be worked out.
- **The pours are nine set problems a round kind**, three a round, turned through on replays, not random numbers:
  each has its own lines so the voice can say the fractions in words, and fixed lines can be warmed ahead.
- **Subtracting a negative is the cold pack**, as the plan asked: a chamber at −2° holds a cold pack worth −5°; the
  player takes it out and sets the new reading. A lower reading gets "Taking cold away makes it warmer".
- **Rounds the plan did not list**, so each chapter has six: which division a pour is, one liter into jars of 2/3
  (the reciprocal), less than one jar, decimals on the same model (6.NS.B.3), the opposite of a reading, colder than a
  limit (order against absolute value, 6.NS.C.7d, with no debt in it), a drop in equal steps, and on a replay the film
  run backward (negative times negative).
- **No new diagram type.** The plan marked a thermometer and a fraction-division model as missing. The upright
  `numberline` (with `tube`) shipped in the diagram pack, and the measurement model of fraction division is drawn with
  the existing `bars` (the pot as a tape of liters over a tape of jars).
- **Contexts are neutral** (decision 3): liters, jars, temperatures, a diver and a bird. Nothing is priced or sold,
  and there is no reward currency.
- **A built unit's entry profile is live in the engine**, as Unit 1's is: `P.entryProfile('pro', 2)` now answers. The
  route still refuses a Pro test-out and placement lands nobody on Pro while the tier is building.
- **Left for the opening PR**, as for Unit 1: the teacher page's game list (`NQ_CREW`) and its locale strings do not
  name Sub Zero. The game itself is a library game on the Learn shelf (math, grades 6-7) from the day it is registered.
## Number Quest Pro Unit 3: The Machine Hall and Machine Line (14 Nov 2026)

The third Pro unit, built to the unit contract in `seed-lessons/number-quest/README.md` ("What a unit PR touches"):
three decks, nine exit items, the game Machine Line in the Toy Town world, and the one-line registrations. Pro stays
`building`; nobody but the platform admin can open a Pro step. Where the build left the plan, and why:

- **Read-aloud is on by default** (owner decision 6), not a button that is off by default as the plan said. Spoken
  lines are written as they are said, with digits only in the number places, so the voice allowlist sees no sign.
  The letter is part of each line's own words (n in Build the Line, x in the other two chapters), because a
  placeholder takes numbers only.
- **Oomba3D 1.2.0 and Toy Town 1.1.0**, the newest of each, not the 1.1.0 library the plan named. No kit or theme file
  changed. The town is shown at sunset, with no cars and no coin, so it does not look like Crate Stacker, which plays
  the same world by day.
- **The line is drawn on a board, not built in 3D.** The plan had a box riding a conveyor through machines on the
  street. A row of machines seen in perspective is hard to read on a phone and its numbers would be small, so the
  line, its value boxes and the number line are drawn face on, on one board, as Sub Zero's thermometer is. The 3D
  conveyor is the loading dock: a crate rides it for each finished round.
- **Plan, then run; the game picks the test number.** The plan had the player "test with numbers" freely. A free test
  box invites trying inputs until the outputs agree, which is the very mistake chapter `same` is about. So a plan is
  built and run, and a wrong one is run for the first whole input that tells it from the wanted line, with both
  outputs shown. A number set on the stepper is not shown on the board before Run, so the board never states an
  output the plan has not earned.
- **Equal means equal as polynomials.** The plan named this as the hardest thing. `MachineLine.same` turns each line
  into whole-number coefficients over one denominator and cross-multiplies, so 3(x + 2) and 3x + 6 are the same,
  (x + 1)² and x² + 1 are not, and no rounding or text compare is involved. The test checks every plan a player can
  build, on every lap it runs, against the meaning of the words worked out separately.
- **"Do they always give the same output?" has three answers**: always, sometimes, never. "Times 2" against "square
  it" match for 0 and 2 only, which is how the game shows that a few matching inputs are not proof.
- **A line holds two machines at most.** Three do not fit a phone at a readable size. So "rebuild one line shorter" is
  played as: an expression such as 2x + 3x + 4 or 8x − (3x + 2) is given as written, and the player builds the short
  line for it. x + x + x is not a line of one-input machines, so it is in the deck and the check, not the game.
- **Inequalities: the ray's end is a whole number from 0 to 12, and the multiplier is positive.** Whether the end is
  open or filled follows from the words ("less than", "at least") and is drawn for the player; the player sets the end
  and the side. Dividing an inequality by a negative number (the sign turns round) is not played or taught here.
- **Answers in the game are zero or more.** Replays have answers that are halves, but no negative answer: a spoken
  hint would need a second wording for every line. Deck 3.3 and one check item solve 2x + 9 = 3 (x = −3).
- **7.EE.A.2 is in deck 3.2 only** (x + 0.2x = 1.2x: adding 20% is multiplying by 1.2). The game's rebuild rounds
  practice the rewriting, not what a new form tells you about a situation.
- **Rounds the plan did not list**, so each chapter has six: a story with a letter for a number, reading a line as an
  expression, the squaring machine both ways round, never and sometimes equal, subtracting a sum, a bracketed equation
  5(x + 2) = 35, and which line undoes another.
- **No new diagram type.** The plan marked a flow diagram and an inequality ray as missing; both shipped in the
  diagram pack. An area model for 3(x + 2) was not drawn: `squares` draws counted unit squares, which would give x a
  size. Two tables of inputs and outputs carry the idea, and the plan's optional algebra tiles were left out.
- **No balance**, as the plan asked, in the game, its words or its listing.
- **Contexts are neutral** (decision 3): crates and toys on a truck, a rider's age. Nothing is priced or sold, and
  there is no reward currency.
- **A built unit's entry profile is live in the engine**, as for Units 1 and 2: `P.entryProfile('pro', 3)` now
  answers. The route still refuses a Pro test-out and placement lands nobody on Pro while the tier is building.
- **Left for the opening PR**, as before: the teacher page's game list (`NQ_CREW`) and its locale strings do not name
  Machine Line. The game itself is a library game on the Learn shelf (math, grades 6-7) from the day it is
  registered; its title, description and tags never name the Pro tier.
- **Not verified:** a real GPU, a real phone or Chromebook (software WebGL in headless Chromium only), the AI voice by
  ear, and play by a student of the age.

## Number Quest Pro Unit 4: The Map Room and Scale Scout (15 Nov 2026)

The fourth Pro unit, built to the unit contract in `seed-lessons/number-quest/README.md` ("What a unit PR touches"):
three decks, nine exit items, the game Scale Scout in the Medieval Village world, and the one-line registrations. Pro
stays `building`; nobody but the platform admin can open a Pro step. Where the build left the plan, and why:

- **Read-aloud is on by default** (owner decision 6), not a button that is off by default as the plan said. Spoken
  lines are written as they are said, with digits only in the number places, so the voice allowlist sees no sign. A
  fraction is in a line's own words ("half a kilometer in a quarter of an hour"), so the unit-rate round has three
  fixed versions rather than drawn numbers.
- **Oomba3D 1.2.0 and Medieval Village 1.1.0**, the newest of each, not the 1.1.0 library the plan named. No kit or
  theme file changed. The village is shown in the morning from a survey camp, with no apple trees, no basket and no
  helper to pick, so it does not look like Garden Count, which plays the same world by day.
- **The map is a board, not laid over the 3D land.** The plan had a paper map over the village, a route planned on it
  and the walk watched on the real ground, and named as its hardest thing that map and land must agree exactly at
  every scale on a phone. A map seen in perspective cannot carry a ruler a learner can read at 390 px, and a walk of
  1500 m across a toy village would have to be faked. So the map, its ruler and the walk are drawn face on, on one
  board, as Machine Line's line is; the walk is a line that grows along the road at a steady pace and stops where the
  plan's meters really end. The 3D village is the setting, and a flag on the survey line marks each finished round.
- **No free ruler tool.** The plan asked for a ruler that works by touch. A stepper moves a pin along the map's ruler
  one centimeter at a time (a held button repeats); the test holds every control to 56 px. Dragging on a 3D canvas was
  left out: it adds a second way to do one thing and nothing the stepper cannot do.
- **"Whose distance is proportional to the time?", not "Who walks at a steady pace?"** as the plan worded round 1. A
  walker with a head start who adds 2 km each hour is walking steadily and is not proportional; that walker is the
  round's main wrong answer, so the question must not have two defensible answers.
- **Which plans are on the board before Run.** The standing rule is that the board shows only the plan until the Run
  button. A pin on the map and a wall on the new plan are the plan, so they are drawn as they are set, with no meters.
  A pace, a distance or a percent stays on the stepper: drawing it would be drawing its outcome.
- **Percent contexts are neutral** (owner decision 3): a water tank, sacks of grain, a path, a route and measurement
  error. Nothing is priced or sold in the game or the decks. One check item (`nq-pro-4.3-e3`) is a discount about a
  third person, which the rule allows in step 4.3's check only (at most two in the tier). No tax, tip, interest or
  commission item. The plan's "sports percentages" were left out: six rounds were filled without them.
- **7.RP.A.2d in the game is the point (1, r) read from a graph** (the scale as the meters for 1 centimeter), and
  (0, 0) is what tells the proportional graph from the others. Explaining a point in words is in deck 4.2.
- **7.EE.B.3 is one two-step round** (a route, the percent walked, the kilometers left) and the before-and-after
  rounds; estimation and converting between forms are not played.
- **Redrawing at a new scale is one length**, a wall, not a whole field plan: the idea (find the real length, then use
  the new scale) is the same, and a bar over a ruler reads at phone size where a redrawn rectangle would not.
- **Rounds the plan did not list**, so each chapter has six: a unit rate from two fractions (7.RP.A.1), a steady pace
  used for more hours, the pin (ground to map), a real area, the scale from a graph, the amount after a percent change
  and the amount before one.
- **No new diagram type.** The plan marked a double number line and a coordinate plane as missing; both shipped in the
  diagram pack and the decks use them.
- **Tests that named "the planned unit" now name Unit 6**, which stays planned until its own build, so the unit built
  beside this one (Unit 5) does not break them.
- **A built unit's entry profile is live in the engine**, as for Units 1 to 3: `P.entryProfile('pro', 4)` now
  answers. The route still refuses a Pro test-out and placement lands nobody on Pro while the tier is building.
- **Left for the opening PR**, as before: the teacher page's game list (`NQ_CREW`) and its locale strings do not name
  Scale Scout. The game itself is a library game on the Learn shelf (math, grade 7) from the day it is registered; its
  title, description and tags never name the Pro tier.
- **Not verified:** a real GPU, a real phone or Chromebook (software WebGL in headless Chromium only, at about five
  frames a second), the AI voice by ear, and play by a student of the age.

## Number Quest Pro Unit 5: The Sky Wires and Sky Lines (15 Nov 2026)

The fifth Pro unit, built to the unit contract in `seed-lessons/number-quest/README.md` ("What a unit PR touches"), side
by side with Unit 4: three decks, nine exit items, the game Sky Lines in the Sky Islands world, and the one-line
registrations. Pro stays `building`; nobody but the platform admin can open a Pro step. Where the build left the plan,
and why:

- **Read-aloud is on by default** (owner decision 6), not a button that is off by default as the plan said. Spoken
  lines are written as they are said, with digits only in the number places. A line that can meet a number below zero
  has one wording for each case ("at height negative 6"), and island coordinates are never spoken: they are read off
  the grid.
- **Oomba3D 1.2.0 and Sky Islands 1.0.1**, the newest of each, not the 1.1.0 library the plan named. No kit or theme
  file changed. The sky is shown at sunset with no coin, so it does not look like Lily Hop, which plays the same world
  by day.
- **The graph is drawn on a board, not built in 3D.** The plan had islands floating on a grid in the world, seen by a
  fixed side-on camera, and named "a 3D scene that reads as an exact 2D graph" as the hardest thing. The standing rule
  from Units 1 to 3 answers it: the working surface is one face-on board, readable on a phone, and the 3D world is the
  setting. The grid is 12 by 8 squares, so every number on it is 12 px or more on a 390 px phone.
- **The hero does not ride the wire.** The plan sent the hero down each finished wire. A ride in the 3D world would
  not be the wire on the board, and a rider who comes off a wrong wire is a fall. A finished round plants a flag on a
  far island instead, and a wrong wire is only drawn.
- **No wire is drawn before Run.** The plan had the player string the wire by setting b and m. A wire that moves with
  the stepper invites sliding it until it touches the island, so the board shows the islands and the plan's numbers,
  and draws the wire only when the plan is run, right or wrong. A wrong wire is drawn where it really goes, with the
  gap to where it should be.
- **Steepness is set in halves** (−3 to 3), with one stepper. The plan asked for fraction slopes without typing; halves
  keep every height on the board exact and every spoken number a short decimal. Slopes in thirds and quarters appear
  where nothing has to be set: on tiles (2/3, −3/4) and in the deck.
- **A wire with two numbers has one stepper and a dial button**, not two steppers: two do not fit a phone at 56 px a
  control. The board writes the plan as a rule (y = 2x + 1), so both numbers are always in view.
- **The game says "steepness" and "start height"**; the decks teach slope, rise, run and y-intercept. The game's words
  are the ones a wire has, and the lines stay easy to hear.
- **The stair rounds do not draw the wire all the way.** With the whole wire drawn, "how far up does the big stair
  go" is read off the grid. The wire is drawn as far as the small stair, so the ratio has to be used.
- **Rounds the plan did not list**, so each chapter has six: a steady rate as a wire through the start and two rates
  compared (8.EE.B.5), reading a drawn wire's steepness, the height after so many steps, a rule from a table, from a
  story and from a drawn wire, the table that is not a straight wire (8.F.A.3), reading the crossing off two drawn
  wires (8.EE.C.8a), and an equation with brackets and x on both sides (8.EE.C.7b).
- **8.F.A.1 is in deck 5.2** (a function gives one output for each input); in the game it is only what every wire does.
- **Replays use three set problems a round**, turned through by lap, with the tiles shuffled, as Sub Zero's pours do:
  each set was checked by hand to keep every point on the grid and every hint true.
- **No new diagram type.** The plan marked a four-quadrant coordinate plane as missing; it shipped in the diagram pack,
  and all six of the unit's drawings use it.
- **Contexts are neutral** (decision 3): wires, islands, a cable car, a glider, a balloon, a candle. Nothing is priced
  or sold, and there is no reward currency.
- **Built beside Unit 4.** Units 4 and 5 were built at the same time and merged one after the other. The foundations
  test names the built units as a list (`BUILT_UNITS`) instead of "the first so many steps", so units need not be built
  in order, and the tests that need "a planned unit" use Unit 6, which stays planned after both.
- **A built unit's entry profile is live in the engine**, as for Units 1 to 3: `P.entryProfile('pro', 5)` now answers.
  The route still refuses a Pro test-out and placement lands nobody on Pro while the tier is building.
- **Left for the opening PR**, as before: the teacher page's game list (`NQ_CREW`) and its locale strings do not name
  Sky Lines. The game itself is a library game on the Learn shelf (math, grade 8) from the day it is registered; its
  title, description and tags never name the Pro tier.
- **Not verified:** a real GPU, a real phone or Chromebook (software WebGL in headless Chromium only), the AI voice by
  ear, and play by a student of the age.

## Number Quest Pro Unit 6: The Drafting Keep and Keep Builder (15 Nov 2026)

The sixth Pro unit, built to the unit contract in `seed-lessons/number-quest/README.md` ("What a unit PR touches"), side
by side with Unit 7: three decks, nine exit items, the game Keep Builder in the Castle Quest world, and the one-line
registrations, merged on top of Units 4 and 5. Pro stays `building`; nobody but the platform admin can open a Pro step.
Where the build left the plan, and why:

- **Read-aloud is on by default** (owner decision 6), not off as the plan said. Spoken lines are written as they are
  said ("65 degrees", "3 squared plus 4 squared"), with digits only in number places. Coordinates, rules such as
  (−x, y) and equations live on the board and the tiles, never in a spoken line, so no line needs a sign.
- **Oomba3D 1.2.0 and Castle Quest 1.2.0**, the newest of each, not the 1.1.0 library the plan named. No kit or theme
  file changed. The castle is at sunset in a building yard (Balance Bridge plays it by day), with no coin, chest, key,
  spikes or animal, and the theme's stone block set on a game-made plinth for each finished round.
- **The working surface is a face-on board, not building in 3D.** The plan had the player build with blocks, unfold
  walls into nets, move and turn stone pieces by touch and lean physics ladders, and named nets and touch flips and
  turns in 3D as the costly part. A net, an angle or a plan grid seen in perspective cannot be read at 390 px, and a
  physics ladder would make the answer depend on a simulation. So every picture is drawn flat on one board (as in Units
  3 to 5); the 3D courtyard is the setting. No Rapier, no dragging.
- **Plans are run, not drawn as they are set.** No stepper value is a drawing in this unit, so the board shows only the
  question until Run. A wrong plan is drawn as it really turns out: stone laid face by face until it runs out, a beam
  bent to the angle the plan makes, the stone where its rule really puts it, a ladder leaning with its top where its
  length takes it (or flat when it cannot reach), a square with the side its area really gives, a triangle drawn from
  three beams with its real corner.
- **Rounds the plan named, and the ones added** so each chapter has six. Named and kept: crates of 1/2 in a room
  2 1/2 by 3 by 2, a tower's net, the trapezoid banner, crossing beams at 65° (the angle next to it; the plan's "the
  other three angles" is in the deck, where the angle across is a focus step), a slide and its corner's coordinates, a
  bigger window (as a scale factor), the 3-4-5 ladder, distance between two towers, squares on the three sides. Added:
  a ramp (a prism with a right-triangle end), a cistern's height from its volume (fractional edges), a roof prism's net
  (triangles in a net), the equation for a square corner (7.G.B.5 "write and solve"), a flip and a turn by their rules,
  a plank's foot (a short side), the longest pole in a room (three dimensions), and the converse with three beams.
- **"The gate piece must fill the gap" is a choice of rule**, not a free drag: three tiles, each a rule in coordinates
  or a turn, and the test checks that exactly one moves the stone onto the gap, computed from the board's own points.
- **Circles, cylinders, cones and spheres** (7.G.B.4, 8.G.C.9) and angle sums (8.G.A.5) stay out, as the plan's
  coverage table says.
- **Focus boxes** are the diagram pack's own `diagramParts` boxes; the pinned target of each is the layout's own bounds
  for that part (where a part takes in its name, the box less the usual margin), and the browser renderer test checks
  every ring on the drawn slide.
- **Tests that named "the planned unit" now name Unit 7**, which stays planned until its own build. `BUILT_UNITS` gains
  6. On main the teacher page's planned section says "These 1 units" when one unit is left; the test accepts "unit" or
  "units" and the wording is left for whoever touches that page (it is the admin's preview only).
- **A built unit's entry profile is live in the engine**, as for Units 1 to 5. The route still refuses a Pro test-out
  and placement lands nobody on Pro while the tier is building.
- **Left for the opening PR**, as before: the teacher page's game list (`NQ_CREW`) and its locale strings do not name
  Keep Builder. The game itself is a library game on the Learn shelf (math, grades 6 to 8); its title, description and
  tags never name the Pro tier.
- **Not verified:** a real GPU, a real phone or Chromebook (software WebGL in headless Chromium only), the AI voice by
  ear, and play by a student of the age.

## Number Quest Pro Unit 7: The Test Range and Launch Lab, without the finale (15 Nov 2026)

The seventh and last Pro unit, built to the unit contract in `seed-lessons/number-quest/README.md` ("What a unit PR
touches"), side by side with Unit 6: three decks, nine exit items, the game Launch Lab in the Space Base world, and the
one-line registrations. Pro stays `building`; nobody but the platform admin can open a Pro step; the route still
refuses a Pro test-out and placement lands nobody on Pro. Where the build left the plan, and why:

- **The finale is not built.** The plan puts step 7.4, The Great Clock, in Unit 7 as the game's fourth chapter, with
  twelve exit items for the unit and a fourth teacher note. This change was asked to build the unit without the
  finale, so Launch Lab has three chapters, the bank nine items and the unit three notes.
- **A step can be planned inside a built unit.** The engine knew only whole planned units: lifting Unit 7's flag would
  have made 7.4 a step with the placeholder deck and no game, and the deck checker would have reported it. Step 7.4 now
  carries `"planned": true` (with its `reserved` params kept), and `number-quest-tiers.js` treats it as it treats a
  planned unit's steps: left out of the built unit, listed among the planned units as the unit with that one step
  (`partial`), and a tier holding one is never open. The standards tags skip it, and the admin's street says the unit
  is built and that step is not. Once Unit 6 is in, no Pro unit is planned, and the finale alone keeps the tier from
  opening by mistake.
- **The planned-unit tests keep a planned unit.** With Units 6 and 7 built, the real catalogue has none, so
  `number-quest-pro-foundations.test.js` exercises the planned-unit behaviour (no steps, no tags, no test-out, the
  admin's planned list and teacher section, a tier never open) through a copy of the catalogue with Unit 7 put back to
  planned, loaded through the existing test hook (`setCatalogueForTests`). A placeholder deck is shown by lifting the
  finale's flag in a copy. A new test pins that all seven Pro units are built and that the finale is the one reserved
  and planned step (merged after Unit 6, which landed first).
- **Read-aloud is on by default** (owner decision 6), not a button off by default. Spoken lines are written as said;
  a rate that does not come out even is said "about".
- **Oomba3D 1.2.0 and Space Base 1.0.0**, the newest of each. The base is shown at sunset, so it does not look like
  Rocket Supply, which plays the same world by day. No kit or theme file changed.
- **No physics.** The plan had probes thrown with Rapier and a little honest scatter on each shot, and named "random
  enough to be real data, controlled enough for one right answer" as the hardest thing. Every data set comes from the
  game's seeded generator and is checked in its test (a median really is the middle landing, a mean absolute deviation
  the one the words give, a scatter plot's pattern clear by its correlation). The launcher's probe flies on every run
  as a picture only.
- **The plot is a face-on board**, the standing rule: dot plots, box plots, bars, the tower, the outcome table, a
  sample and scatter plots are drawn on one board readable on a phone; the 3D base is the setting.
- **Nothing is dragged.** The plan said "drag the marker to the median" and "place the trend line". A stepper with Run
  (or three tiles) answers every round, as in the other Pro games, and the board shows only the question until Run.
  Placing a trend line has no single right answer, so the trend line is given (through two named points) and used to
  predict; fitting is in deck 7.3 and the trend line a found association draws.
- **The drop tower's prediction is from a model** ("the model gives bin C 0.3: how many of 60?"), and a real run is
  shown beside it after the answer, close but not exactly. The plan's "about how many" was reworded so exactly one
  number is right.
- **No gambling.** Chance is bins, probes, gates and fins; nothing is bet, staked, won or priced, and the test checks
  every line for wager words.
- **Contexts are neutral** (decision 3); no reward currency (the theme's coin is not loaded; a cargo pod marks a
  finished round).
- **Left for the finale and opening PRs**: the `clock` chapter, deck 7.4 and its three items, the fourth teacher note;
  the teacher page's game list (`NQ_CREW`) and locale strings. The game is a library game on the Learn shelf (math,
  grades 6 to 8) from the day it is registered; its title, description and tags never name the Pro tier.
- **Not verified:** a real GPU, a real phone or Chromebook (software WebGL in headless Chromium only), the AI voice by
  ear, and play by a student of the age.

## Number Quest Pro finale: The Great Clock (15 Nov 2026)

Step 7.4, The Great Clock, the last Pro step, built as Launchpad's finale was: an ordinary fourth step of Unit 7 with its
own deck (`course/pro/7.4.json`), three more exit items (the unit bank now holds the twelve the plan named), a fourth
teacher note, and a mission that is the fourth chapter of the unit's game, Launch Lab's `clock`. Its `planned` and
`reserved` are deleted, as no other built step carries them. **Pro stays `building`**: no locale copy, no `NQ_CREW`
line, nothing opened; the opening waits for the owner. Where the build left the plan, and why:

- **Seven rounds, where the other chapters have six.** The plan says one round per gear, so the chapter has seven
  (`LaunchLab.roundsOf`); the dots, the end of the chapter and the completion signal follow the chapter's own count.
- **The seven gears, each in its unit's world, each more than one step**: a unit rate for a longer time (the lantern,
  6.RP.A.3b), a warming in equal steps then a cooling from below zero (the cold store, 7.NS.A.3), a two-machine line
  run backward (7.EE.B.4a), a survey's percent error (7.RP.A.3: the plan's "scale" gear is read as the unit's percent
  code, the one the step cites; no map scale round), a zip wire's rise for each 1 across through the origin (8.EE.B.5),
  a ladder by the Pythagorean theorem (8.G.B.7) and a missing landing from a mean (6.SP.B.5). The spine, 7.EE.B.3, is
  what every round shares and what the three exit items check.
- **Every gear is planned on the stepper**, none with tiles: each has one number for an answer, and a wrong number can
  be run and drawn as it really turns out (where an amount really falls, the start an end would need, a ladder's real
  reach, the mean five landings would really have). Named slips get their own hint.
- **Four new board drawings, no new deck diagram**: a double number line, an upright thermometer, the machine line and
  the ladder's triangle are game-drawn on the face-on board; the scatter plane gained a finer grid for the zip wire.
  Signed numbers are printed with a true minus sign; spoken lines say "below zero" and never carry a sign.
- **The clock gains a gear per solved round**: in this chapter the results deck carries a game-made clock (a plate,
  seven sockets, a dial) instead of the cargo rack; the gears turn, and with all seven in the hand goes round. Nothing
  moves with reduced motion. One hex color was changed after the site's word scanner matched it as a blocked word.
- **The deck has two drawn diagrams** (the cold store's upright line, the ladder's triangle), not three: the worked
  example estimates first and checks, which 7.EE.B.3 asks for, and needs no picture.
- **The planned-step engine stays.** `number-quest-tiers.js` still honours a step marked `planned` inside a built unit;
  its tests now run on a copy of the catalogue with 7.4 planned again (`withFinalePlanned` in
  `number-quest-pro-foundations.test.js`), including the admin's "Planned: the unit is built, and this step of it is not
  yet." The file itself has no planned or reserved Pro step, which the tests now pin. Removing the last planned step
  does not open the tier: `statusOf` reads `tiers.pro.status`, still `"building"`, and a test pins that too.
- **Not verified:** a real GPU, phone or Chromebook (software WebGL in headless Chromium only), the AI voice by ear, and
  play by a student of the age.

## Number Quest Pro opens (15 Nov 2026)

All seven Pro units and the Great Clock finale are built, and the owner said to open the pack when they were done, so
`tiers.pro.status` in `seed-lessons/number-quest/units.json` is now `open`: the grades 6-8 street is there for everyone,
beside Launchpad and Explorer. That status line is the only switch; everything else either follows the data or is copy.

- **Placement was already locked, so it opens as recorded.** The rung 6.0-8.0 bank was rebuilt and locked with the
  foundations (2026-11-14; every item solved independently in its test), and the seven Pro entry profiles and the Pro
  starting line were recorded then and inert. Opening makes them live, unchanged. A run that meets every Explorer
  profile enters Pro only with every strand at rung 5.5 or above (owner decision 4); otherwise it starts at the Explorer
  finale door as before. On the line but under Pro Unit 1's profile, the start is the Pro welcome. "Just Play" with
  grade 6, 7 or 8 starts at the Pro welcome. Of the 88,434 possible sets of placed rungs, exactly the 1,512 with every
  strand at 5.5 or more start somewhere new (on the Pro street instead of the Vault door); every other set, and every
  whole game that does not reach the line, ends where it did, which a test checks set by set and game by game.
- **Test-out for Pro Units 1-7** is offered from the opening: the route already allowed any unit with a locked profile on
  a street the learner can see, and the bank deals five items at each profile's rungs.
- **Pro's finale is a landing, Launchpad's is not.** A run that meets all seven Pro profiles starts at the Great Clock
  door, as Explorer's Vault was the landing while Explorer was the last street. Launchpad's Garden Gate stays a review
  door, because a street comes after it.
- **Nobody is moved.** No migration, no backfill. A learner placed at the Vault before today whose stored rungs now point
  into Pro stays at the Vault; the Starting Point note keeps the finale wording for the stored start and adds one line
  saying where the same answers would start today and that nothing has moved. A fresh Vault landing's note says why it
  is not the Pro street. An override gets no extra line.
- **What Pro does not cover is on the teacher page,** generated from `standards.json` `proCoverage` (owner decision 2):
  circles, cylinders, cones and spheres, exponents and scientific notation, and irrational numbers named first, then all
  19 uncited grade 6-8 statements with their published text. The map's lock note now publishes the Pro lock.
- **The seven Pro games are on the teacher page's game list** (`NQ_CREW`), each with its own description, as the
  Launchpad games were added when that street opened. Game titles, descriptions and tags are unchanged and do not name
  the tier.
- **Copy.** The same keys the Launchpad opening changed, in all 13 locales (the course's grade line, the library chip,
  the landing card and the FAQ answer now run to grade 8); the English teacher-page copy names three streets. The
  Learn tab lists the course as K-8. `program.standards` names the three streets.
- **Billing is untouched.** Pro is not tied to any plan; nothing on a learner page or on "/" is priced.
- **Worth knowing, left as the rule says:** placement uses the rung a strand reached when the questions run out,
  confirmed or not, on every street. So a grade 4 learner who answers all 20 questions right reaches 5.5 everywhere
  without settling a rung and starts at the Pro welcome, and a grade 5 learner who does the same starts at Pro Unit 2.
  The soft landing and the grown-up override are the remedies, as for every other start. Requiring confirmed rungs to
  cross would be a change to the owner's rule, so it was not made here.
- **Tests.** Tests that pinned Pro as building now pin it open; the building behaviour (who sees a building street,
  that a recorded profile is inert, that placement and every page are unchanged while building) is still pinned through
  the test-only status hook and the planned-unit and planned-step copies of the catalogue. New:
  `tests/unit/number-quest-pro-open.test.js`.
- **Not done here:** a real-device check, play by students of the age, and translated teacher-page copy (it is
  English-first, as before). Legal pages were not edited.

## Many characters in a 2D game, and "Select all" in the setup steps (14 Nov 2026)

- **Oomba2D 1.1.0** (`public/vendor/art2d/oomba2d/1.1.0/`, a new line in `kit2/ART2D.json`; 1.0.0 and every pack are
  byte for byte as they were, and saved games keep their 1.0.0 tag). It adds friends: `Oomba2D.use({ world, hero,
  friends })` and `CONFIG.friends2d` in the runner and catching templates (not locked files). The first character
  picked is the player (`hero2d`); the others are friends who are in the game: in the runner they stand along the way
  (one every four columns, never where there is something to jump over, a spring, a checkpoint or the goal), look at
  the player and hop on the spot as the player runs by; in the catching game they stand at the two edges of the view
  and take turns. They are pictures only: no body, no parts, never a hazard, and a friend never leaves its place.
- **Cap:** at most 4 friends are drawn at once (`FRIENDS_SHOWN`); a phone-wide catching game shows 2. More than that
  take turns (along the way the next one stands at the next place; at the sides a place changes hands every 7 to 9
  seconds; the turn carries over from round to round), so every pick shows up. A game may name up to 40 friends; the
  first four pictures are waited for, the others load one at a time while the game plays. With reduced motion they
  stand still (no hop, one frame).
- **Plan, tool, mock, model:** the plan's 2D art is `{ world, sprite, friends }`; `start_from_template` takes
  `friends`; the SETUP CHOICES block and the 2D ART RULES say who the player is and that the others are friends.
  The "one character in a 2D game" limit and its words are gone; the first picked card says "You play as this one".
- **"Select all"** sits in the heading of every multi-select section (each character group that has members, and
  "What should it teach?"). It picks every card of the section that can be picked now, never "Something else"; when
  they all are picked it reads "Clear all" and clears that section only; it is hidden while fewer than two cards can
  be picked. In 3D, where characters picked together must share a world, it picks the largest set of the section that
  shares one world with what is already picked (the first such world on a tie); the others grey out as after single
  picks, and the live message names the world ("5 picked. They all live in Medieval Village.").
- **Not verified:** a real phone or GPU (software rendering only), a build with the real model.

## Dino Valley 1.0.0: a prehistoric valley with five friendly dinosaurs (14 Nov 2026)

The first world born with its animals: Round B of `docs/kit2-packs-plan.md`, built the way Wild Woods and the first
ten animals were, on Oomba3D 1.2.0 (unchanged, like 1.0.0 and 1.1.0 and every shipped theme: only a lock entry is added).

- **The T-Rex is held back (the owner's decision) and ships in no form.** Its mouth is modelled open with a row of
  teeth and its skeleton has no jaw to close it. `kit2/packs/dinosaurs.json` leaves it out by name; no file, id, name,
  node, material or clip of it is in the theme, the catalogue, the picker or the locale files
  (`tests/unit/kit2-dino-valley.test.js`). In the Builder "t-rex" and "tyrannosaurus" lead to Dino Valley (it is where
  dinosaurs are) with the existing honest "that animal is not in any world yet" line; a person is the hero, no other
  dinosaur is made the hero or the companion because of it ("a dinosaur game with a T-Rex" picks no stand-in), and the
  note to the model says never to use another animal as if it were the one asked for.
- **Five dinosaurs ship:** triceratops, stegosaurus, parasaurolophus, apatosaurus, velociraptor. Each was looked at
  beside the Knight, face on and side on, standing, walking and running: closed mouths, no teeth showing. The
  velociraptor passes that (closed mouth; it is the size of a big dog, 1.4 m high, lower than the hero); the old
  creature test's "no raptor" line was written before anyone had looked at it closely, and now names the T-Rex, the
  shark and the wolf. Kept clips: `idle`, `walk`, `run`, `jump` (the pack has no eating clip). Dropped from every
  file: `Attack` and `Death`.
- **Colour.** The pack's own colours are dark olive and brown and read as gloomy even brightened. Each material gets
  one bright colour with the `colours` step (Wild Woods' palette approach) instead of `brighten`: a blue triceratops,
  an orange stegosaurus with coral plates, a purple parasaurolophus with a coral crest, a green apatosaurus, a yellow
  velociraptor (its black toes and eyes made soft brown), all with pale bellies. One draw call each (`oneDraw`),
  meshopt, 67 to 85 KB a file, 0.38 MB for the five.
- **Size.** Triceratops 6.7 m long and 2.8 high, stegosaurus 7 and 3.2, parasaurolophus 6.5 and 3, apatosaurus 15
  and 3.4, velociraptor 3.6 and 1.4, beside the 2.4 m hero. Every one but the velociraptor is what Oomba3D 1.2.0 calls
  a big animal: it strolls, never above 2.5 a second, and stops at its calm distance (0.6 of its length: 9 m for the
  apatosaurus). Nothing in the engine was changed or loosened for them. `pace` and `jumpAir` were measured in the
  browser from the built files (foot bones on the ground; the same method gives the shipped horse and deer numbers).
- **Playable:** triceratops, stegosaurus, parasaurolophus and velociraptor (each has a real walk and reads well from
  behind as the hero). **The apatosaurus is not:** it walks, but a 15 m hero fills the screen with its back. So "not
  playable" now has two reasons, no walk (the pig, the sheep) or too big, and the creature test, the rules text and the
  `kit2_hero` note say which. Oomba3D 1.2.0's own error still says "(it has no walk)" for it: the library is frozen,
  and the text is only seen by someone who writes `g.hero('apatosaurus')` by hand.
- **The world:** 87 pieces, 2.45 MB first load with the dinosaurs and the same five heroes as Pirate Cove and Wild
  Woods (limit 5 MB; nothing had to be cut). 69 from the Kenney Nature Kit and 17 from the Quaternius Ultimate Nature
  Pack, the flat-colour CC0 packs Wild Woods uses, with a warmer palette (sandstone cliffs, jungle greens): ground,
  hill and cliff blocks, rock faces, a waterfall, a cave block and a cave mouth (empty hollows: scenery), river and
  pond tiles, path tiles, stepping stones and patches, a bridge, seven palms and five other trees, ferns, bamboo, big
  leaves, reeds, flowers, a giant mushroom, 17 rocks (six of them boulders 2.6 to 4.4 m high), logs, a signpost
  (checkpoint) and the shared coin. The nature megakit was not needed; `amir-forest-nature-pack` and the `reodesuxz-*`
  packs are not used. No bones, skulls, skeletons, fossils, lava, volcano or weapons (the packs used have none).
- **The goal is a great egg.** No pack has an egg or a nest, so the kit's round stone is made taller and narrower
  towards the top (a new opt-in pack step, `taper`; a recipe without it builds as before) and given an egg colour:
  `egg` (2.3 m, the goal: looked at, never taken or broken), two small coloured eggs, and a straw `nest` from the
  kit's large pot. They are faceted, low-poly eggs: they read as eggs at game distance, less so close up.
- **Builder.** Place words (English: "dinosaur", "dino", "prehistoric", "jurassic", each dinosaur's name, "raptor",
  "brontosaurus") choose Dino Valley for a new game, before Wild Woods ("dinosaurs in the forest" is the valley) and
  after the moon, the castle and the village ("a dinosaur game on the moon" stays on the moon and is told kindly that
  Space Base has no Triceratops). A dinosaur named alone is the hero when it can be; "a dinosaur" is the triceratops;
  the apatosaurus, or any dinosaur beside a named hero or "with my", comes along (of "a dinosaur" the smallest: it
  keeps up). Animal words are no longer read inside a world's own name ("the Dino Valley world" asks for no dinosaur).
  A card, word, 2D or catching game stays on the old kit. Tests that used `dino-valley` as "a world that has not
  shipped" now say `candy-land`, and those that used "a dinosaur" as "an animal no world has" now say the T-Rex or a cat.
- **Starter:** the lake starter of Wild Woods with the valley's pieces, the great egg as the goal and the cave behind
  it, and three big dinosaurs standing in the lake beside the way (`LAYOUT.wading`, a new optional starter field:
  creature ids, scenery only, off the path, nothing they do changes the game). No animal comes along unless asked for.
- **Names and pictures:** the world and the five dinosaurs in the 12 locale files; picker chips and the Build card from
  the cover. The dinosaurs are in the "3D heroes" tab with the other animals; the 3D catalogue has no group field (the
  2D art catalogue has, and already calls its sprites of the same five `dinosaur`), so none is added here.
  `scripts/kit2-thumbs.js` turns a very long animal more towards the camera so it fills its picture.
- **Its 2D pack** (`public/vendor/art2d/dino-valley/1.0.0/`, 119 KB, locked in `kit2/ART2D.json`): every 3D world has
  one (`tests/unit/art2d.test.js`), so the valley is drawn for 2D runner and catching games too: palms, the waterfall
  and the cave far off, palms, bamboo, boulders and a giant mushroom nearer, the great egg as the goal, a log and two
  rocks as the things to jump. The five dinosaurs were already in the 2D `animals` pack.
- **The setup steps (/build/new):** the five dinosaurs are in the Dinosaurs group of `kit2/creature-groups.json`, so with
  the theme shipped the group no longer says "Coming soon in 3D" (no group does today; the state is still tested with a
  made-up list). Dino Valley is on the world step with its line in 12 languages and its 1280 by 720 preview
  (`scripts/kit2-thumbs.js --previews`). A dinosaur picked alone is the hero in Dino Valley; the apatosaurus comes along.
- **The theme tour** stands big animals (longer than 5) further back, side on; worlds with small animals are laid out
  as before.
- **Not verified:** motion (walks, runs and jumps were judged from still frames and from positions and speeds read in
  tests; a sliding foot or a popping clip would not show); a real GPU, phone or Chromebook (software WebGL only);
  frame rates; sound by ear; a build with the real model; the translated dinosaur names by a native speaker. The jump
  clips were measured and looked at as one still frame each, not frame by frame.

## Under the Sea 1.0.0: a coral reef world with 23 sea animals, and their 2D sprites (14 Nov 2026)

The owner uploaded five sea packs to branch `asset-packs` and asked for them to be added. Under the Sea is built from
them, from the reodesuxz Low Poly Underwater Pack (the scenery) and from five of the Quaternius Cute Fish, on Oomba3D
1.2.0 with no engine change (`g.creature`, `g.school`, an animal as the hero, `g.world.ground`, swim controls and
bubbles were all in 1.2.0, waiting for this world).

- **Licences: the first world that is not all CC0.** Six of its ten packs allow use in games and modification but
  forbid passing the files on as assets; three of them forbid machine-learning training; **ALSTRA INFINITE's requires
  credit** (given in `docs/media-credits.md`, the world's `SOURCES.md` and `theme.json`, the 2D pack's `pack.json`, and
  `kit2/packs/alstra-fish-polypack.json`). What that means here: the models are served only to running games from
  `/vendor/themes/` and as drawn pictures from `/vendor/art2d/`, exactly like every other theme file; nothing links to a
  model as a download and there is no export. Every restricted pack is marked `redistribute: false` in its pack config,
  in `theme.json` and in the 2D manifest, and each config says the raw files must be removed if the repository ever
  becomes public. `tests/unit/kit2-themes.test.js` and `tests/unit/art2d.test.js` used to accept only CC0: they now
  also accept six licences BY NAME, each matched against words only its own licence text has, each needing the
  `redistribute: false` mark, a credit and a source. Any other non-CC0 licence still fails. No lawyer has read these
  licences; the reading is the owner's (`docs/kit2-packs-plan.md` section 1).
- **Three packs came with no source address and two with no author's name in the licence** (`sageglint`, `muteassets`:
  the names are the upload's folder names; `pipothai`'s licence names aletheiamask). The owner should confirm them.
- **No walking heroes.** `docs/kit2-packs-plan.md` question 7 recommended it: the player is a sea animal. The theme has
  an empty `heroes` list and no shared moves; every one of its 22 swimmers is `playable` (the dolphin is the default),
  the crab is not. A hero asked for by name ("a wizard under the sea") gets the honest "Under the Sea has no Wizard"
  and the dolphin. `from-def.mjs` learned that a definition may have no heroes and no moves.
- **Kid-safe, looked at face by face** (side on and face on, on contact sheets). Left out for teeth showing: the
  sageglint reef shark, the ALSTRA shark, and from Ocean Animals the barracuda, the shark, the hammerhead (in doubt) and
  all seven deep-sea fish. Left out for other reasons: lobster (18,304 triangles), sea urchin and rock fish (their
  pictures were not uploaded). The Cute Fish parrot fish was caught by the new test, not by eye: its beak is a material
  named `ParrotFish_Teeth`, so the mandarin fish took its place and the parrot fish is now left out in that pack's
  config. The one shark that ships is the underwater pack's toy-like model, as **Little Shark**: no mouth is modelled
  at all. The word "shark" alone still gets the honest "not yet" in the Builder (only its name or chip picks it): the
  owner can open that up. No fishing rod, hook, lure, bait or net is in the theme. Clips dropped: Death, Hit, Ram and
  Nudge (dolphin), Death, Hit, Pinch, Threat and Grab (crab), Hooked, Flop and Display (the three stylized fish),
  Attack, Death and Out_Of_Water (cute fish). The dolphin's Jump is kept as `leap` (a trick; a swimmer does not jump).
- **Fish that arrived still now swim.** Twelve models have no clips (the sageglint, ALSTRA and Ocean Animals packs, and
  the underwater pack's animals). A new opt-in pack step, `swimRig`, bakes any old skeleton into the rest pose, turns
  the model to face +z, makes it a given length, stands it on y 0 and gives it a spine of five joints with two clips
  made in the pipeline: `idle` (a slow sway) and `swim` (a wave that runs to the tail); `flap` adds two flipper joints
  (the turtle). Two smaller steps: `floor` (an animated model stood on its lowest point, so every animal's y is its
  underside like the land animals') and `dropMaterials`. A recipe that names none of them builds as before: the 2D
  `animals` 1.0.0 pack was rebuilt from the staged land packs with the changed pipeline and came out byte for byte.
- **Pictures that were not uploaded.** The Ocean Animals FBX files name textures that are not in the upload, so the
  turtle, swordfish and squid have one plain colour each (green, blue, pink). The sageglint models carry their own
  black outline shell, which is dropped (Oomba3D draws the ink).
- **The world:** 24 pieces (22 from the underwater pack at 2.5 times, the arch 4, the shipwreck 4.5; a sand patch from
  Pirate Cove for the 2D ground; the shared coin), blue fog from 10 to 90, a sandy `look.ground`, `look.weather:
  'bubbles'` (a theme's suggested weather: the tour and the 2D pictures read it). 1.73 MB first load.
- **The starter is swum.** `templates/oomba3d.html` has a second layout, used when `LAYOUT.swim` is set: one sandy floor
  (`g.world.ground`), the way marked by rocks with coins floating at different depths, answers over coral tables, the
  chest in front of the shipwreck; `g.controls(me, { swim: true, floor: 0.4, ceiling: 9 })`; swimming up to an answer
  or the goal is what landing on it is in a walking world. Three shoals (`g.school`) and five friends (`wander`) are
  beside the way and are never solid. The words say "Swim" in all 13 languages. Every other world's starter is the
  same bytes as before.
- **Builder:** place words (under the sea, underwater, coral reef, in the ocean, sea floor, sea animals), sea animal
  words (a "sea horse" is the seahorse, not the horse; "a fish" is the clownfish), names in the 12 locale files, picker
  pictures, the rules for an underwater world. The tour learned an underwater theme: no ground tiles, swimmers side on
  at different depths, a shoal.
- **2D:** `under-the-sea` 1.0.0 (far and mid strips, sand ground, 15 props, chest, coin, three obstacles) and `animals`
  1.1.0: the 24 land sheets unchanged byte for byte plus 23 sea sheets in group `sea` (idle 4, swim as run 8 and as
  jump 2 frames), drawn 1.4 m tall or more so a sardine is still a hero-sized sprite. `animals` 1.0.0 stays for games
  saved on it. Oomba2D 1.0.0 finds animals only in a pack called `animals`, which is why the sea animals are a new
  version of that pack and not a pack of their own.
- **Not done:** the Quaternius "Animated Fish" pack (whale, manta ray, a bigger dolphin) is still out: no licence file
  was uploaded with it. Some swimmers are several meshes (the goldfish is seven): a shoal of those costs more draw
  calls, so the starter's shoals are single-mesh fish. The 2D runner makes a fish "run" along the sand: it swims
  along the bottom and its jump is a swim stroke.
- **Not verified:** a real GPU or Chromebook (software WebGL only), motion by eye (the clips were checked as still
  frames at several times, not watched), sound, a build with the real model, and the translations of the animal names
  by a native speaker.
- **The setup steps (/build/new, merged from main the same day):** the sea animals are in the "Fish and sea animals"
  group of "Who is in it?" (`kit2/creature-groups.json`: all 23, the crab too, which the kind rule alone would have put
  with the wild animals), so the group is no longer "Coming soon"; Under the Sea is on the world step with its line in
  12 languages and a 1280 x 720 preview picture. The setup tests pinned the sea as the empty group: they now check it
  is live with 23 animals, and that a group with nothing shipped still shows "Coming soon".
- **2D friends (Oomba2D 1.1.0, merged from main the same day):** the sea animals are in `animals` 1.1.0, so they can be
  picked as the friends of a 2D game like any other sprite animal; `tests/unit/kit2-under-the-sea.test.js` drives the
  helper with the dolphin as the player and three sea friends.
- **Open: "Select all" and the cap of 40 friends.** With the sea animals there are 56 sprite characters, and a 2D game
  takes at most 40 friends (`friendsMax` in the locked Oomba2D 1.1.0, `ART2D_FRIENDS_MAX`). Everyone picked beyond the
  first 40 in catalogue order is left out. `tests/unit/art2d-friends.test.js` now says so instead of "everyone". A
  bigger cap needs a new helper version: the owner's call.

## Classroom activities in the Builder, first for teachers (15 Nov 2026)

The owner asked: "Can we also list Quiet Games as part of the builder options, as well as, Jeopardy, Surveys, and any
other classroom type activities. Let's make sure these are frontloaded in the builder options for teachers."

- **The game-type step of `/build/new` has two groups**, "For your class" and "Games", one shown at a time
  (`plan.js typeGroups`, `routes/build-setup.js`, `public/js/buildsetup.js`). A teacher (`classlive-access.js
  teacherHost`: school staff, the platform admin or a teacher of a class) gets "For your class" first and shown: quiet
  game, Category Board, class survey, bingo, flashcards, exit ticket, spinner, team scoreboard, then quiz, word game and
  memory match; the other games are one tap away. Kids and families keep the games in today's order, shown first, and
  "For your class" after it with the types that suit kids (no survey, no exit ticket; `normalisePlan(…, { forKid })`
  drops those two for them on the server too, in `/api/build/plan` and the runner).
- **Steps that do not apply are skipped.** A classroom starter has no 2D or 3D, world or characters; the survey, quiet
  game, spinner and scoreboard also skip "What should it teach?" (`GAME_TYPES[].skip`). The page jumps over them,
  counts only the steps left ("Step 2 of 2"), leaves them out of the plan, and `normalisePlan` drops whatever a page sent
  for them, so the engine is always `classroom` and never a 3D world. Quiz, word and memory keep every step.
- **New starters, plain HTML for the board** (`server/builder/templates/{quiet,categories,survey,bingo,flashcards,
  exitticket,spinner,scoreboard}.html`, builder-only, `catalog.js CLASSROOM_TEMPLATE_KEYS`). Not on the Oomba Kit: the
  kit's title / play / results game loop does not fit tools a teacher runs on a projector. Each has big type readable
  from the back of the room, keyboard and clicker keys (arrows, Page Up / Page Down, Space, Enter, number keys), Sound
  and Full screen buttons, a one-key-per-line CONFIG with `lang` (the language of the teacher's content) and a WORDS
  table in the 13 site languages. Read-aloud speaks only CONFIG strings exactly as written, so the existing rules hold
  (only fixed lines of a published, scanned version get the AI voice). `planNote` tells the model how to build each
  (`CLASSROOM_NOTES`), the system prompt has short CLASSROOM RULES, and `start_from_template` says it is not a kit game.
- **"Jeopardy" is a trademark.** The product says Category Board (translated). The word may be typed: under "Something
  else" it becomes the Category Board type (`CLASSROOM_WORDS`, as do "exit ticket", "noise meter", "bingo"...), and the
  Builder is told to build the categories starter and never use the name, the show's blue-and-gold look, its music,
  money signs or "answer in the form of a question". The board is sticky notes on a chalkboard, points without "$".
- **The class survey counts on the device; it does not use `BRB.poll`.** Considered: letting a published Builder game
  owned by staff keep poll counts on the server. Not done, because (1) `game_poll_votes` stores a row per player with
  their choice: "who chose what" would exist on our server for questions a teacher writes freely (feelings, home life),
  which is far more sensitive than "would you rather"; (2) polls are cumulative across every player of the game forever,
  while a class wants this lesson's answers; (3) only two choices, so a migration would be needed; (4) it would add a
  role check on every vote. Instead the survey has "Count hands" (the teacher taps how many hands are up) and "Pass the
  device" (each student taps a choice in private; the screen says thanks and never shows the choice back). Answers are an
  array of counts in the page's memory: no names, no typing, no saving, nothing sent, nothing to an AI. In "Pass the
  device" results show only from `CONFIG.minShown` answers, 5 like `polls.js MIN_SHOWN`, so nobody in a tiny group can be
  picked out; "Count hands" shows at once (the hands were up in the room). `POLL_GAMES` is unchanged, and a test checks
  that a teacher's published Builder survey still gets 404 from `/api/games/:id/poll`.
- **The quiet game** (Quiet Stars: a night sky that fills with stars while the room is quiet) uses `BRB.loudness` the way
  the official noise meters do, with their consent words, after the "Start listening" tap; it calibrates to the room's
  quiet (median of 3 s) and waits (a cloud over the moon, no flashing) while the room is over the line. Refused, no
  device, busy, a page that cannot listen, or the teacher's Stop: it carries on as a calm quiet timer with a "Too loud"
  button (L). No sounds play while it listens.
- **The exit ticket** stores nothing per student and submits no score (`gameOver` with `score: null`). A teacher who wants
  each student's answers uses what class lessons already do safely (a question step, or a question set as homework); the
  model is told to say so. **The spinner** offers teams, numbers or the teacher's own topics, never students' names.
- **Main's 2D-art guard (PR #343) and the classroom types:** `planArt2d` is null for every classroom type (the plan has no
  look, world or characters), so a classroom type with characters picked on the page is never forced into a running game;
  it starts from its own starter, and `planFallback` does nothing for it. Tested in `tests/unit/builder-classroom.test.js`.
- Tests: `tests/unit/builder-classroom.test.js` (order for teacher and kid, plan normalisation, planNote per type, the
  2D guard, the hand-off, the survey's gating, counts and threshold, the starters' scan, CONFIG and WORDS),
  `tests/unit/classroom-templates.test.js` (every starter in Chromium at 1280 and 390 and right to left, no console errors,
  no network; the quiet game with the microphone refused; the survey threshold; the keys), and
  `tests/unit/builder-classroom-layout.test.js` (the step on a desktop and an iPhone).
- **Open:** a real projector and clicker, a real classroom microphone (the thresholds are the official meters' kind of
  numbers, not tuned in a room), a build with the real model from each starter, and a native speaker's read of the
  new translations.

## Live or not, said once: "How will it be played?" and the Studio's live line (15 Nov 2026)

The owner asked: "How does the builder know if a game should be offered live or not? This is also not super clear."
Until now the Builder knew in three unrelated ways: typed words that name Oomba Live (`prompt.js LIVE_WORDS`, kept in
`state.wantsLive`), a game that already loads the live pack, and, for a 3D world of their own only, an ask_user
"Live or closed world?". The setup steps never asked, Kit 2 worlds silently could not be live, and the Studio showed
"Make it a live class game" with no word on why a game was or was not live.

- **A step in `/build/new`: "How will it be played?"** (after "Who is in it?", before "What should it teach?"; a
  classroom starter skips the scene steps, so for it this is step 2). Three answers (`plan.js PLAYS`): **Live with my
  class or group** (everyone on their own device; a teacher or grown-up runs it from the big screen with Oomba Live),
  **On one screen** (the board, or one device passed around) and **On my own**. The plan carries it as `play`
  (`normalisePlan`; left out when a page did not answer, so older plans read exactly as before), the sentence says it
  (`planSentence`; only the Live sentence names "Oomba Live", so the words check agrees with the plan, tested in all 13
  languages), the transcript line of later turns says it (`planBrief`), and `planNote` tells the model: Live = build it
  live-ready in the same build with the LIVE RULES; one screen or on my own = NOT a live game, no live pack.
- **Defaults, decided per type** (`playDefault`). Teachers (`teacherHost`): Live for quiz, word, memory, Category Board,
  bingo (each player marks their own card) and the adventure, running and catching games; On one screen for flashcards
  (one big card for the room), the quiet game, spinner, scoreboard, class survey, two-player duel and board game; On my
  own for the exit ticket. Kids and families: On my own, except the one-screen-by-nature types (quiet game, spinner,
  scoreboard, duel: On one screen). A kid may still pick Live: the card says a teacher or grown-up runs it, and kids
  still never host (`classlive-access.js canHost`, unchanged). No kind of game picked: Live for a teacher, On my own
  for a kid.
- **Where Live cannot be, it is shown greyed out with a one-line reason, never hidden** (`LIVE_NOT`, `liveNot`): the quiet
  game, spinner and scoreboard (a tool the whole room shares on one screen), the class survey (its answers are counted
  on the device and never sent: the survey's own safety decision above stands), the exit ticket (stores nothing per
  student; each student's answers belong in a class lesson's question step), and a ready-made 3D world (Kit 2 has no
  live play yet; the page works this out from the look, world and characters exactly as `planEngine` does). A plan that
  says Live anyway (an old or edited page) gets this viewer's default instead, on the server.
- **The Builder.** `playFor` (from `engineFor` every plan turn, and from the toolbox) sets `state.wantsLive` for Live, so
  the LIVE RULES go with every turn of that game, and clears it for one screen or on my own (a later typed "make it a
  live class game" still turns it on). `state.play` remembers the answer, and while it is set the toolbox refuses an
  ask_user whose options name "Oomba Live" (the live-or-closed question), telling the model the answer; the 3D RULES say
  the setup steps' answer counts. A classroom starter that goes live loads the kit tag and the live pack only for the
  connection, as an own 3D world does. The mock Builder makes a Live plan's kit game live-ready from its first version.
- **The Studio's live line** (`routes/studio.js liveClassState`, `public/js/studio.js renderLiveClass`): one line under
  the safety line, with one action, from the existing live-ready check (`classlive-check.js`) and its issue codes:
  "Ready to host live" + Host (hosts only; a kid reads "A teacher or grown-up can host this live" and gets no Host),
  "Publish it to host it live" (a kid: "so a teacher or grown-up can host it live") + Publish, "Live, but needs a fix:
  <the check's first reason>" + Fix it (a fixed, translated Builder message that names Oomba Live, `live.entry.
  studioFixText`), and "Not a live game" + Make it live (the existing fixed message; where the game cannot be live, the
  button shows why instead and sends nothing). The line is read again after every new version, not only after the build.
- **Unchanged safety:** no free text or chat between players (the LIVE RULES and the run-time text-entry lock); names
  only from `Oomba.live.players()`; nothing about students goes to an AI (the step sends only one of three fixed words).
- Tests: `tests/unit/builder-live-choice.test.js` (defaults for every type and both accounts, normalisation, planNote /
  planBrief / the sentence in every language, `wantsLive` from the plan, the refused second question, the page data and
  `/api/build/plan`, every live line from `GET /api/studio/:id` for a teacher and a kid, and in Chromium on a desktop
  and an iPhone: the step for both, the greyed-out Live with its reason, the plan rows, each Studio line, no Host for
  kids, "Make it live" on a 3D world sending nothing); the setup and classroom layout tests count the new step.
- **Open:** a real model build from a Live plan of each classroom type (bingo and the Category Board live are new
  ground for the model), and a native speaker's read of the new words.

## Sudoku: an official logic puzzle from a 4x4 with pictures to the classic 9x9 (15 Nov 2026)

The owner asked: "Build a sudoku game in oomba for varying levels of difficulty."

- **One game, eight levels** (`seed-games/sudoku.html`, `SudokuCore.LEVELS`): Tiny 4x4 Easy and Medium (ages 5 to 7,
  with an optional picture mode: the kit's apple, banana, grapes and carrot instead of 1 to 4, for children not reading
  numbers yet), Small 6x6 (2x3 boxes) Easy and Medium, Classic 9x9 Easy, Medium, Hard and Expert. A picker after the
  kit's title lists them, with Continue for an unfinished puzzle and each level's best stars.
- **Puzzles are made in the game, never stored**: a seeded full board, then digits taken away while a counting solver
  still finds exactly one solution; each try is graded by a human-style solver and kept only when its givens and its
  hardest step fit the level (9x9 Medium needs more than naked singles, Hard pairs or pointing, Expert triples, an
  X-wing or an XY-wing). It is bounded by tries, not by the clock, so a seed makes the same puzzle everywhere; Expert
  takes well under half a second on a laptop. No bank of puzzles was needed. Digits are saved as text so the file has
  no long digit strings (the scanner reads those as phone numbers).
- **On the Learn shelf** as thinking, kindergarten to grade 8 (`learn.js SHELF_INFO`, `LEARNING`), category puzzle; not
  in the strategy subject page, whose words are about chess and four in a row. The AI voice reads only the title, the
  how-to cards and a few fixed lines, never the board.
- **Open:** a native speaker's read of the new translations, and a real low-end phone for the Expert timing.

## How-to cards: read aloud only on a tap, with the AI voice (kit 1.1.6, 15 Nov 2026)

The owner asked: "These instructions never seem to be translated into the correct language. Also, make sure they are
not automatically read aloud. Only read them aloud if the user selects a button you put on that window pop up with a
speaker. Also make sure this is always done with the AI voices." (the Oomba Kit's "How to play" card after the title).

- **Translation.** The kit translates a card only when its text is a key in the game's strings. Sudoku (its I18N block)
  and Packet Post (its language packs) were right. Fraction Factory, Escape the Post Office and Trick Inbox passed
  English sentences with no table behind them, so every player saw English. Their cards are now keys (`how.*`) in a
  marked I18N block in all 13 languages (en-GB uses en), passed as `strings`; the rest of those three games is still
  English only. The Builder rules say `howTo` texts go in all 13 site languages, and the templates already have them.
- **Never by itself.** Kit 1.1.6 drops the `say()` of the joined cards as the card opens. Kit 1.1.3, 1.1.4 and 1.1.5
  are served on 1.1.6 (`KIT_PATCHES`), and every official game and the live lobby now pin 1.1.6. Games pinned to older
  kits (1.0.x, 1.1.0 to 1.1.2) keep their files, so the SDK drops their read instead: a line that is exactly the open
  kit how-to card's cards joined by spaces is not spoken (`kitHowtoRead`), by the AI voice or the device's.
- **The player's language in the frame.** The play page signs `req.locale` into the frame token (`l`): ?lang=, then
  the /<code>/ address, the lang cookie (the picker), the account's language, then Accept-Language (an iPhone's
  `es-MX` is `es`, `zh-TW` is `zh-Hant`, `en-GB` stays). The site codes are the kit's own, so `O.lang` and the kit's
  i18n agree. One gap: /play has no /<code>/ address, so Play from a page read at one (/es/g/sudoku, a search result)
  opened the game in the visitor's other language. Play links on those pages now carry `?lang=<code>` when the visitor
  has not chosen a language (`keepLang`, i18n/index.js); the /<code>/ page itself still writes no cookie.
  `tests/unit/frame-lang.test.js` pins the whole path.
- **The speaker button** (round, top corner of the card, label "Read it to me" / "Stop reading" in 13 languages) reads
  the title and the cards one after another; a tap while reading stops, and closing the card stops it too. It is
  hidden until `BRB.aiVoiceCheck(lines)` says yes: the play page asks `POST /api/tts` with `check: true`, which runs
  every check of a real read (the game's token and player, the language switched on, the allowlist, the backstops) and
  answers `{ ok: true }` without making audio or counting characters. No INIT.tts (TTS off, a preview, a game not
  allowed), a language that is off, the player's "this device's voice" choice, a refused line or no answer in 4 s:
  no button. Reading uses `BRB.speak(text, { ai: 'only' })`: the AI voice or nothing; a line that does not come ends
  with `onfail` and hides the button. The device's voice is never used for it. The frame still has no network: the
  check goes through the play page like every AI line.
- **The kit's own title.** "How to play" is the kit's word, not the game's, so the server allows the kit's
  `howTo` string (`tts-lines KIT_SPOKEN`, from `kit/src/strings.js`) in its own language for any game that may use AI
  voices, in that game's role.
- **Versions.** 1.1.5 was live (Sudoku and the other official games pin it) but missing from `kit/SHIPPED.json`, which
  is meant to gain a version in the change that ships it; it is locked now with the packs 1.1.4 locks (`live`,
  `art-pixel` and `style-pixel` stay unlocked, as in 1.1.4). 1.1.6 is the new `KIT_LATEST`; it is not locked until it
  ships. The core is 95.9 KB brotli (cap 96).
- Tests: `tests/unit/kit-howto-voice.test.js` (Chromium, the production frame: nothing spoken on open, the button's
  five cases, a tap through the AI path, stop, a refused line, kits 1.0.0 and 1.1.2 kept quiet, the five games' cards
  in es, ja and ar), `voice.test.js` (`ai: 'only'`, `aiVoiceCheck`, the old-kit filter), `tts-route.test.js` (`check`
  and the kit title).
- **Open:** a native speaker's read of the new card translations; the other words of Fraction Factory, Escape the Post
  Office and Trick Inbox are still English.

## Classroom dashboards, stage 1 (15 Nov 2026)
A screen per class that stays open all day: the teacher's on the projector (`/class/<id>/dashboard`, the "Class
dashboard" button in the class header) and each student's own (the same address, "My dashboard" on the student's class
page and on their Class tab; `/dashboard` takes a student with one class straight to it). Built to the approved mockups
(Main, TeacherEdit, Student) with the site's own tokens and components. Code: `server/services/dash.js`,
`server/routes/dash.js`, `public/js/dash.js`, `public/js/dash-widgets.js`, `public/css/dash.css`; migration 0078.
- **Widgets.** One registry (`WIDGETS` in services/dash.js): id, library group, who may add it (teacher, student,
  both), default and smallest size, the settings schema, and the extra words its renderer shows. The browser's
  renderers are keyed by the same id (dash-widgets.js). The library (search and groups), the 12-column grid, the
  settings form, saving and server validation all work from the schema, so stage 2's timers, QR, picker... are a
  registry entry and a renderer. Stage 1 types: clock (digital or analog), text and agenda (teacher), "I can…"
  objective. Every layout a browser sends is rebuilt from the schema on the server (`cleanWidgets`): unknown types,
  settings and ids are dropped, sizes clamped, text clipped and stripped of control and direction-override characters.
- **Editing.** Drag to move and drag the corner to resize (mouse and pen); on every device the selected widget also
  has buttons (up, down, left, right, narrower, wider, shorter, taller, remove), which are also the way on a phone,
  where the grid is one column in reading order. Keyboard: arrows move, Shift+arrows resize, Delete removes, Enter
  opens its settings, Ctrl+Z undoes; every change is announced in a polite live region ("Clock: column 3, row 1").
  Nothing ever overlaps: what a moved widget covers moves down. Undo keeps the last 40 changes. Changes save by
  themselves (debounced).
- **Teacher layouts** are per teacher per class, named, up to 12 (one tap to switch; new from the current one or the
  starter; rename; delete, never the last). The layout a teacher last switched to is the one the class follows: its
  widgets marked "Pin on student screens" are copied to `dash_class.pins` for students. A school admin who does not
  teach the class has no dashboard (only the class's own teacher changes it, as the brief asks).
- **Projector mode:** full screen, larger type, a screen wake lock where the browser has one (asked again when the tab
  comes back), the pointer hidden after 3 s without movement.
- **Student screens:** the teacher's pinned widgets (they can be moved, not removed or changed) plus the student's own
  (clock and their own goal in stage 1), per student per class. What a student types stays in their own row: never in
  another student's page, the projector or any API another person reads (tested).
- **Backgrounds:** six colours and four Oomba art presets (SVG in public/img/dash, drawn with brand colours) for
  both, or an uploaded picture. Colours use the theme tokens, so they follow light and dark; pictures get a light
  wash of the page colour. Pictures go through the profile photo's file checks, now one function
  (`photos.cleanJpeg`: JPEG only, size and side limits, every metadata segment removed; the browser re-draws the
  picture to at most 1600 × 1000 first). **Decided differently from the profile photo:** no AI check. The brief rules
  out any AI in this feature and any student picture going to an AI, so the profile photo's AI screen is not run;
  instead a picture is seen only by its owner and the teachers of that class while the owner is in it (not another
  student, another class's teacher, a school admin or a visitor: 404, tested), and the teacher's edit panel lists the
  class's student pictures with "Take down". The newest four per person per class are kept.
- **Push to students and the tray.** The teacher sends a game (public, shared with the school, or shared with this
  class, so every student can open it), the join of the class's open live game (the teacher hosts; students only ever
  get `/join#code`), an open class lesson, or an approved link. Students see the newest as a banner (Ink) with Hide;
  hidden, a dashed line with "Bring it back" takes its place, and everything sent that day stays in "From your
  teacher" in the top bar. Kept server side per class per school day (the school's time zone, else New York), with
  each student's hidden marks, so it survives a reload; the teacher ends an item, a removed link or a closed live game
  leaves at once, and the day's end clears the tray. At most 40 a day; two weeks of history kept.
- **Realtime** is the site's existing way class pages learn about a live game (`public/js/class-live.js`): the screen
  asks `/api/dash/<class>/live` every 4 s while in view (and at once when it comes back into view). No new transport.
  The answer is small (Eyes up, today's pushes, when the pins last changed); pins are fetched only when they changed.
- **Approved links:** per class, managed in Push to students. `cleanUrl` accepts only https with a real host name: no
  `javascript:`, `data:`, `http:`, user name or password, IP address, port, `localhost`/`.local`/`.internal`, spaces,
  control or direction characters, over 500 characters. Students open them only through
  `/class/<id>/dashboard/link/<id>`, which redirects while the link is still on the list (no referrer). There is no
  school-level link allow list in the code base yet; when one comes, `cleanUrl`/`addLink` is where it plugs in.
- **Eyes up:** a full-screen "Eyes up front" card on every student screen of the class (the rest of the page is inert
  under it), until the teacher ends it or 3 minutes pass.
- **Safety:** no chat or typed text between students anywhere; no prices, plans or upgrade words on student screens;
  names are the ones the class already sees (the student's own Oomba name; no roster names); kids never host; no
  friend codes, friendships or messages come from any of this; nothing in these files talks to an AI and nothing
  leaves the server on upload (tested by watching outgoing requests). Every route checks the class role
  (`roleOf`: the class's teacher, or an active student); everyone else gets 404. Writes go through the site's
  same-origin CSRF check and per-route rate limits. Account deletion forgets a person's screens and pictures.
- Strings: `dash.*` and `js.dash.*`, translated into every locale.
- Tests: `tests/unit/dash.test.js`. Screenshots of every state were checked by hand (teacher 1600 × 900 and edit
  mode, student 1366 × 768 and 390 × 844, banner, hidden, tray, Eyes up, a picture background, dark and Hebrew).
- **Open / later stages:** stage 2 widgets (timers, weather, QR, picker...); layouts that follow the bell schedule;
  "who sees this widget" beyond pinning; a real-time socket if 4 s polling proves too slow; a native speaker's read of
  the new translations.

## Classroom dashboards, stage 2 (15 Nov 2026)
Everyday widgets on the stage 1 grid: each is a registry entry (`WIDGETS` in `server/services/dash.js`) and a
renderer (`public/js/dash-widgets.js`; the noise meter in `public/js/dash-noise.js`). Migration 0079.
- **Registry additions.** New setting types, each rebuilt on the server (`cleanSettings`): `number` (clamped),
  `zone` (a real IANA zone or nothing), `periods` (HH:MM, end after start, sorted, at most 16), `place` (a name and
  coordinates rounded to 2 decimals), `target` (QR: link, live, lesson or game, by id only) and `tiles` (games and
  lessons, at most 12). Two flags: `pin: false` (never on student screens: picker, noise meter, QR, quick check) and
  `pinDef` (the help queue is pinned when added). Students may add only the clock, their goal, a timer and a
  stopwatch, all of which stay on their own screen.
- **Live state.** No new poller: `/api/dash/<class>/live` (every 4 s while in view) now also carries the server's
  clock (`now`), the teacher's timers, the help queue (the teacher: the queue; a student: only `{ kind, place }`),
  quick checks (the teacher: totals; a student: open checks and their own answer) and the weather of the places on
  the screen. Renderers get it through a `live()` hook.
- **Timers and stopwatch.** A teacher's timer is stored as `{ mode, dur, base, start, on }` in `dash_class.timers`
  (a start time and a duration, never a ticking value). Each screen estimates the server's clock from the quickest of
  its last 8 round trips, so a pinned countdown shows the same time everywhere (tested with clocks 90 s fast and
  45 s slow). Presets 1/2/5/10 minutes and a custom time; the chime is off by default; the bar and the "Time's up"
  pulse follow reduced motion. A student's own timer stays in their browser.
- **Schedule** works in the school's time zone (as the stage 1 tray does); **clock** gained a second time zone.
- **Weather** (Open-Meteo, no key). The teacher types a city; the server geocodes it; the widget keeps the name and
  coordinates. Never the browser's or a student's location. Fetched on the server, cached per place for 20 minutes;
  a failure or a 6 s timeout shows "Weather is resting" (a forecast under 2 hours old is kept through a short
  outage). The live answer never waits for the network (a stale place is refreshed in the background). **Not
  verified against the real service:** both Open-Meteo hosts were blocked from the build sandbox, so tests use a
  stubbed fetch (`_setWeatherFetch`).
- **QR.** Made on the server by our own `services/qr.js`, now up to version 6 (106 bytes; versions 1-4 unchanged
  byte for byte). Only the class's approved links (the code holds the class's own `/class/<id>/dashboard/link/<id>`
  address, so a removed link stops working), the class's live join, an open class lesson or a game every student can
  open. The short text under the code is the destination without `https://`.
- **Random picker** (teacher only, never pinned): the pick is made on the server from the class's students by their
  Oomba (display) names, never roster names; "don't repeat until everyone's had a turn" and "away today" are kept
  per class per school day. The shuffle is skipped with reduced motion.
- **Noise meter** (teacher only): Web Audio levels in the teacher's browser after a tap; a "Mic on" chip and an off
  button; the mic stops when the tab is hidden. Its module has no network, storage or recorder code (tested by
  reading the file).
- **Help queue:** fixed buttons ("I need help", "I'm done", "Never mind"), no text. Today only. On the teacher's
  screen names hide in projector mode (`.dw-private`), leaving the counts. **Decided:** the teacher's screen shows
  Oomba names otherwise, as live games' "needs help" does for the host.
- **Quick checks:** thumbs, fist to five, multiple choice (2-6 teacher-written choices) or 1-5. Sent as a push
  (kind `check`, so it is in the banner and the tray) and answered in a card under the banner; one open at a time.
  The teacher's widget (and so the projector) shows totals only; names are in a sheet the teacher opens, hidden in
  projector mode. Unsaved checks go when the school day changes; saved ones stay (with their answers) until the
  class's data goes. No AI anywhere.
- **Oomba tiles:** games every student can open and the class's open lessons, resolved for the reader each time.
- Safety, access and limits follow stage 1 exactly: every new route uses `load()` (class role, 404 to others), the
  site's CSRF check, and a rate limit. Account deletion also forgets a person's help queue place, check answers and
  picker marks.
- **More everyday widgets** (added to stage 2 on request; same rules): the timer's **shrinking ring** view; the
  picker's **spinner wheel** mode (filled from the class's Oomba names through the server's pick, or from items the
  teacher types, picked in the browser); **countdown to a day** (date and time in the school's time zone; days,
  hours, minutes); **calendar** (the month in the school's time zone, today, and up to 40 teacher-marked days with a
  short label); **work symbols** (five fixed icons and labels) and a **traffic light** (red, yellow, green, with the
  teacher's own short words) the teacher switches with one tap and may pin; **dice** (1-6, total) and a **random
  number** (teacher's smallest and biggest), both also addable by students on their own screen and never pinned;
  a **group maker** (by group size or number of groups, from the class's Oomba names, leaving out students the
  picker marks away; teacher only, never pinned, made in the teacher's browser); a **scoreboard** (teacher-typed
  team names, + and −); **stickers** from a fixed set of 20 Oomba emoji (no uploads; stored as an index and a
  place). Widgets the teacher taps save through the layout (`ctx.set`), so pinned ones reach students with the next
  live check. Two hidden setting types hold the scores and the stickers.
- **Nothing is cut off, checked by a script.** `npm run dash:fit` (`scripts/dash-fit-check.js`, also run by
  `tests/unit/dash-fit.test.js`, about two minutes; skipped where no Chromium is installed) loads every widget type at
  its default size and at its smallest. It covers the teacher's screen and projector mode (1600 × 900), a student's
  screen (1366 × 768) and a phone (390 × 844), light and dark, in English, German and Arabic. It fails when:
  - a widget's content is bigger than its box;
  - an element sits outside the widget or text is cut;
  - a control's painted box (border, shadow, transform) is less than 12px from the widget's inner edge, is clipped by
    an ancestor that does not scroll, or sits under another control row;
  - the phone scrolls sideways.

  How widgets fit:
  - Content fits by container-query sizing.
  - Only lists that grow scroll, inside their own area with a shadow and a "More" button in the header: the help
    queue, groups, the schedule's periods, a long agenda or goal, tiles, and a long scoreboard.
  - Fixed content never scrolls: a quick check's totals (two columns past three answers) and every widget's buttons.
  - On a phone, a widget is as tall as its content.
  - **Decided:** to make this true, several smallest sizes went up (clock, text and goal 3 × 2; timer, stopwatch,
    countdown, symbols, light, dice, random, stickers 3 × 3; help, noise, scoreboard 4 × 3; check and picker 4 × 4).
    Several default sizes went up too: weather, countdown, dice, random, noise and stopwatch to 3 rows, the check to
    5 × 4 and the picker to 6 × 5. A stored layout keeps its old sizes until it is next saved.
- **Look.** Every widget has one header: an icon chip in its group's colour, the title, and the pin as a quiet chip
  (icon only on a narrow widget). The group colour also shows on the card's top edge, never on text. The card has a
  hairline and a soft shadow, a 20px radius and 16px padding.

  The big numbers (clock, timer, countdown, random number, scores, temperature) share one display style, and the words
  under them share one secondary style. Each widget has one primary (green) button; the rest are quiet. Motion is
  150–200ms, and none with reduced motion. The traffic light's dim lamps look off. Stickers are added from a sheet.
- **Spinner wheel.** The wheel fills the widget, beside the readout when the widget is wide. Each name's size is
  worked out in pixels. Names go on the slices only when every one is at least 12px (13px on the projector); otherwise
  the slices carry numbers at the rim.

  A big readout under the wheel shows the name under the pointer as it turns, then the winner, always in full. With
  reduced motion the result shows straight away. "No repeats" and "Away today" take names off the wheel, and "Left this
  round" counts them.

  Six slice colours (brand colours mixed 34% into the card) keep AA contrast with the text in light and dark (tested).
  Neighbouring slices never share a colour, the last and the first included.
- Tests: `tests/unit/dash-stage2.test.js`, `tests/unit/dash-fit.test.js`. Screenshots checked by hand: teacher
  1600 × 900, edit mode, projector, student 1366 × 768 and 390 × 844, dark, Hebrew, Arabic, and wheels of 8, 24 and
  32 students.
- **Later stages (not in stage 2):** a drawing whiteboard, an image or video widget, web page windows, a webcam
  document camera.

### Several countdowns in one card (16 Nov 2026)

Teachers asked to put several countdowns in one card instead of adding a card for each.

- **Settings.** The countdown's settings are now a list of events (`events`). Each has a label (60 characters, clean
  text), a day (a real date) and an optional time (HH:MM, or empty for the whole day). A card holds up to 8
  (`MAX_EVENTS`). The settings form has "Add a countdown" and a remove button on each row. At 8 the add button gives
  way to a note. The server rebuilds the list (`cleanEvents`): bad days and times are emptied, empty rows dropped. A row
  with a label but no day yet is kept, so a half-filled row is not lost. The list is stored soonest first (a day with
  no time counts from the start of the day); rows with no day go last.
- **Old cards.** A countdown saved as one `{ label, date, time }` is read as a list of one. `cleanSettings` converts
  it, and so does every read of a stored layout or of the pins students get. Nothing is lost, and its time is kept
  (08:00 was the old default). The card's renderer also reads the old shape. The next save stores the list.
- **The card.** Only events with a day are shown, sorted by when they happen in the school's time zone. With one
  event the card looks as it always did: the label, big boxes for days, hours and minutes, "It's today!" on the day,
  "That day has come and gone" after it. An event with no time shows whole calendar days only. With several events,
  the card is a list. Each row shows its label and its day and time. At the row's end are days and hours, or hours
  and minutes once it is less than a day away (days only with no time). On its day a row is highlighted and says
  "It's today!". A day gone by moves to the end, greyed, for 7 days (`PAST_DAYS`), then drops off the card (it stays
  in the settings to remove). If every event is older than that, the most recent one stays, so a card of one never
  goes blank. The list scrolls by whole rows with the fade, like every other list. Default 4 × 3 and smallest 3 × 3
  are unchanged.
- **Who.** As before: teachers only, and it may be pinned. A pinned card reaches student screens with its whole list.
  Students can't add one to their own screen.
- Tests: `tests/unit/dash-stage2.test.js` (cleaning, the old shape, sorting, past days, pins). The fit check's
  countdown is a full card of 8 with long German labels, one today, one tomorrow, one gone by and one more than a year
  away. A card of one is checked on its own.

## Classroom dashboards, stage 3 (15 Nov 2026)
Teaching tools (part 1), a whiteboard and a Picture widget, on the stage 1 grid and the stage 2 look. Built to the
approved TeachingTools mockup (fraction bars with "Same-size pieces", a coordinate plane with slope and start buttons)
and the "Teaching tools" list in Widgets. Code: `public/js/dash-tools.js` (renderers), `public/js/dash-math.js` (the
maths, pure and tested), `server/services/dash-tools.js` (each tool's state, rebuilt on the server); registry entries in
`server/services/dash.js`. Migration 0080.
- **A new group, Teach** (its own colour on the icon chip and the card's top edge). Twelve tools: fraction bars and
  circles, number line, coordinate plane, graph maker, base-ten blocks, place value chart, ten frames, hundreds chart,
  area model and arrays, times table grid, teaching clock, and fraction/decimal/percent. Every tool has the same parts:
  a row of mode buttons, the model (SVG, or HTML buttons for the grids), a readout in the shared big-number style, and a
  row of buttons ending with Options (a sheet) and **Send to students**, the one primary button.
- **State.** What a tool shows (the fractions, a line's range, the slope...) is its state, kept in a hidden `state`
  setting of the widget: the teacher's layout saves it (debounced), so the projector comes back as it was. The server
  rebuilds every state from the tool's spec (`cleanToolState`: unknown keys dropped, numbers clamped, lists cut, text
  clipped and cleaned; rules such as "never more shaded than parts" kept). Saving a layout no longer moves `pins_at`
  unless the pins really changed, so a teacher working a tool doesn't make every student screen redraw.
- **Send to students** is a stage 1 push of a new kind, `tool`: the teacher's widget id and its state as it is on the
  screen, rebuilt on the server and stored in `dash_pushes.data`. It shows in the banner and the tray like any push
  ("Open"). A student's copy opens in a sheet and lives in their browser only (closing and opening it again keeps it
  until the page reloads); nothing they do with it goes anywhere. **Pin to my screen** makes it one of the student's
  own widgets, saved with their screen like their clock or goal (students may also add any tool themselves). Tools are
  never pinned (a pinned copy would follow every move the teacher makes), so `canPin` is false for them.
- **The maths** is exact: fractions are whole numerators and denominators, never floats; a number line's ticks are whole
  multiples of 1/steps; the slope steps through whole numbers and friendly fractions (rise over run), and the table of
  values shows exact fractions (5/3, not 1.67). Repeating decimals show the repeat (1/3 → 0.333…, 33.3…%; 1/6 →
  0.1666…, 16.6…%; 1/7 → 0.142857…), and screen readers hear "repeating". The clock's hour hand moves with the minutes,
  dragging the minute hand past 12 moves the hour on (or back), and elapsed time goes forward across noon and midnight,
  with the jumps to the hour shown (11:40 → 12:00 → 1:00 → 1:15). Base-ten trades never change the number; place value
  carries and borrows; area model partial products always add up to the product. All in `tests/unit/dash-stage3.test.js`.
- **Decided:** "3 of 8 parts shaded, three eighths": the fraction is said in words in English only (a small built-in
  word list); other languages hear "3 of 8 parts shaded" from their own translation, since fraction words need grammar
  per language that a word list can't give.
- **Decided:** base-ten blocks are drawn with one unit for all three kinds (a cube is as wide as a rod, a flat is ten
  rods), so the sizes compare truthfully; flats pile with an offset so each one's edge shows.
- **Graph maker** from typed data or from a quick check: the Options sheet lists today's and saved checks and copies
  their **totals** with the answer labels; who answered what is never read.
- **Whiteboard** (teacher only, never pinned or sent): pen, highlighter, eraser, six colours that follow light and dark,
  undo, clear, and a plain, grid or lined background. Pointer, pen and touch; by keyboard the arrow keys move a pen and
  Space puts it down. The drawing is in this page's memory only (a note under it says so): never stored, never sent,
  gone on reload. Its code has no network, storage or `ctx.keep/send` (tested by reading the file).
- **Picture** (teacher only): uploaded through stage 1's picture pipeline (`photos.cleanJpeg`: JPEG only, size and side
  limits, metadata removed; the browser re-draws it first; no AI check, as for backgrounds). `POST
  /api/dash/<class>/pictures?use=show` is the class's teacher only (404 to students and everyone else); such pictures
  are kept apart from backgrounds (`dash_pictures.use`, the newest 12 per teacher per class). A Picture widget can only
  show the teacher's own picture for that class. **Access, extended:** the class's active students may fetch it while a
  Picture widget showing it is pinned on their screens; nobody else (another class, another teacher, a school admin, a
  visitor: 404), and never a background. A description (alt text) is required: without one the teacher sees a prompt
  and the widget is left out of the students' pins. Fit: show it all or fill the box.
- **Access and safety** follow stage 1 exactly: no new route; the push and picture routes keep their class-role check
  (404), same-origin CSRF check and rate limits. No AI anywhere, no free text between students (a student's graph labels
  stay on their own screen), no prices or plan words (the mockup's plan labels were left out), Oomba names only.
- **Accessible:** every tool works by keyboard (sliders with arrow keys for bars, the number line, the clock and the
  hundredths grid; a roving grid for ten frames, the hundreds chart and the times table; a plotting cursor on the
  coordinate plane), and changes are announced in the polite live region. Buttons are 44px; the cells of the hundreds
  chart and the times table can be smaller at small sizes (on a 390px phone a 12 × 12 times table cell is about 24px,
  its number at 12px) and have the keyboard grid. Light and dark; on right-to-left pages the controls mirror while number lines, graphs and the
  coordinate plane keep left-to-right maths (fraction bars fill from the side of their fraction); numbers put into
  sentences are isolated so "6/8, 5/8" reads right in Arabic and Hebrew. Reduced motion respected.
- **Readable from the back:** SVG text grows so it is never under 13px on screen (more in projector mode); lines are
  thick. Sizes: most tools default to 6 × 5 or 6 × 6.
- **Fit check:** `scripts/dash-fit-check.js` now spreads the widgets over as many layouts as needed (24 widgets and 24
  rows each), puts every tool on both students' own screens on the tools' layouts, and also fails when a tool's model
  spills out of its area or a tool's rows overlap.
- **Nothing unreadable, nothing hidden (review).** Text in a tool is never under 12px (13px on the projector); area
  model partial products are at least 14px (16 on the projector) and move outside their part, with a leader line, when
  the part is too small. Graph labels are never cut: they wrap onto two lines and shrink, and turn 45° when a word is
  wider than its column. Coordinate tick numbers have a halo of the card's colour; the axis names sit clear of them; the
  origin's 0 is left out where it would run into −1. Place value column names turn on their side on a narrow chart
  rather than break mid-word; disc numbers show only where a disc fits them at 12px. Disabled tool buttons keep their
  text at full contrast (a dashed outline says they are off). **Projector mode fits the screen** when the layout's rows
  can be at least 56px tall (they shrink from 72px); a taller layout scrolls inside the stage, with a shadow at the
  bottom edge while there is more below, and the bars never cover a widget. The fit check now also fails on any of
  these: text under 12px (13 on the projector) in a tool, measured on screen (SVG text through its transform), a
  graph label cut short, any text-overflow ellipsis that is cutting text, a widget under the top or bottom bar, and
  content below the screen that can't be scrolled into view. Smallest sizes went up where needed (graph 5 × 5,
  coordinate plane 5 × 6, base-ten 6 × 5, place value 6 × 5, ten frames 4 × 5, times table 5 × 7).
- Also fixed: a pressed quiet button inside a widget (`aria-pressed="true"`) now shows as pressed (the stage 2 quiet
  rule was more specific and left it with cream text on a light button).
- **Not in this stage** (stages 4 and 5): geoboard, pattern blocks, angle maker, 3D shapes and nets, transformations,
  balance scale, algebra tiles, coins and bills, chance lab, letter and word tiles, graphic organizers, maps, "Make a
  question from it", "Practice it", video, site windows, document camera, hall pass, class jobs.
- Tests: `tests/unit/dash-stage3.test.js`, `tests/unit/dash-fit.test.js`. Screenshots checked by hand: each tool on the
  teacher's 1600 × 900 screen, projector mode with three tools, a student at 1366 × 768 opening and pinning a sent tool,
  390 × 844 phones, dark and Arabic.

## Classroom dashboards, stage 4 (16 Nov 2026)
Teaching tools, part 2, on the stage 3 pattern exactly: the teacher drives a tool on the projector, **Send to students**
gives each student their own copy in the browser (a push of kind `tool`), and a student may pin it to their own screen.
Code: `public/js/dash-tools4.js` (renderers), `public/js/dash-math4.js` (the maths, pure and tested),
`public/js/dash-ask.js` ("Make a question from it", pure and tested), the specs in `server/services/dash-tools.js` and the
registry entries in `server/services/dash.js`. No migration and no new address: a tool's state stays in the widget's
hidden `state` setting and in the push, as in stage 3.
- **Twelve tools.** In Teach: geoboard, pattern blocks, angle maker, 3D shapes and nets, transformations, balance scale,
  algebra tiles, coins and money, chance lab. In a new group, **Words and maps** (its own colour): letter tiles, graphic
  organizers and maps. Every tool has stage 3's parts (mode buttons, the model, a readout in the big-number style, a row
  of buttons ending with Options and Send to students) and works by keyboard, with changes announced.
- **Geoboard:** bands round pegs (5 × 5 to 11 × 11, up to six bands, each its own colour, dash and number). A closed band
  that doesn't cross itself shows its area exactly by **Pick's theorem** (A = I + B/2 − 1; areas in halves, "4 1/2") and
  its perimeter exactly, as whole units plus simplified roots ("6 + 2√5 ≈ 10.47"). Drag a corner to move it; by
  keyboard, arrows move a peg cursor, Enter stretches the band, picks up a corner or puts it down.
- **Pattern blocks:** hexagon, trapezoid, blue rhombus, triangle, square and thin rhombus. Drag, turn (60° steps, 30° for
  the square and thin rhombus) and they snap to a triangle grid. The readout is the fraction of a hexagon (sixths, exact);
  squares and thin rhombi are counted but said not to be fractions of the hexagon. By keyboard each block is a button:
  arrows move it on the grid, R turns it, Delete removes it.
- **Angle maker:** two rays and our own protractor (half a circle, a whole one past 180°). Degrees and the name: zero,
  acute, right, obtuse, straight, reflex, full turn. Snaps to 1°, 5° or 15°; presets; a slider by keyboard.
- **3D shapes and nets** in plain SVG with our own projection (no WebGL): cube, cuboid, triangular and hexagonal prisms,
  square and triangular pyramids, cylinder, cone. Each face hangs on its parent by a fold line; folding turns every face
  about its hinge, so the net is flat at 0 and is exactly the solid at 1, and no face ever stretches (tested). The
  cylinder and cone unroll into a rectangle and a sector (thin strips drawn without their seams). Faces, edges and
  vertices, with F + V − E = 2 for the flat-faced solids. **Decided:** a cylinder is counted as 3 faces (2 flat, 1
  curved), 2 edges, 0 vertices and a cone as 2 faces, 1 edge, 1 vertex (the apex), said as "2 flat and 1 curved".
- **Transformations:** a shape on a −8 to 8 grid, translated, reflected (x-axis, y-axis, y = x, y = −x) or rotated
  (90°, 180°, 270° about the origin), with the original's dashed ghost, the image's primed labels, the rule
  ("(x, y) → (−y, x)") and a table of coordinates (a column per point on a narrow tool). Drag or arrows to translate.
- **Balance scale:** x-boxes and unit weights; x has a hidden value. Add or take an x-box or a weight, or share both
  sides into equal groups, on both sides (it stays level) or one side (it tips). Undo, a list of steps, "Solved: x = 3".
  New equations are made so they balance.
- **Algebra tiles:** x², x and 1, positive and negative (a negative tile is hatched, dashed and has a minus: colour is
  never the only sign). Zero pairs are ringed; "Zero pairs" takes them away; the readout is the expression as the tiles
  lie and simplified ("2x² + 3x − x + 2 − 1 = 2x² + 2x + 1"). The value never changes (tested at many x).
- **Coins and money:** US coins and notes, euro, pound and a plain set (numbers only), drawn by us as simple discs and
  notes with a star (never pictures of real money). The currency follows the language (US English dollars, British
  English pounds, euro languages euros, others the plain set) and can be changed; a sent copy keeps the teacher's.
  Count (tap to add, tap a pile to take one), the total, the fewest coins for it; Make change shows the change, the
  fewest coins (checked against every way for every amount to 600) and the count-up ("37¢ → 40¢ → 50¢ → $1.00").
  **Decided:** the words are "It costs" and "Paid with"; amounts are maths, not prices of anything Oomba sells.
- **Chance lab:** coin, one or two dice (the total) and a spinner of 2-8 equal parts; 1, 10, 100, 1000 or any number up to
  1000 trials at a time. A live bar chart (filled a batch at a time; at once with reduced motion) with a dashed mark for
  the expected count of each outcome; the chances are exact fractions (two dice: 7 is 1/6).
- **Letter tiles:** a-z tiles, vowels coloured and dotted; build by tapping or dragging, reorder with Shift+arrows or a
  drag, Delete removes. English word families (-at, -ig, -ake...) fix the ending and say whether the word is real (a
  short, kind word list). **Nobody types:** a word is letter indexes, rebuilt on the server, never free text.
- **Graphic organizers:** Venn diagram, T-chart, KWL, story map, main idea and details, sequence (3-6). The teacher writes
  in a sheet (title, headings, one idea a line); the text is cleaned on the server (lines kept; control and direction
  characters removed; 400 characters a box). **Decided:** a student's copy is theirs: they may write in it, it stays in
  their browser, and if they pin it, it is saved with their own screen only (as their goal is in stage 1): never shown
  to another student or the teacher, never sent anywhere (tested).
- **Maps:** our own simplified outlines of the continents (and some islands) and the oceans' names on a 1000 × 500 world
  map, or a 10 × 5 grid map (A-J, 1-5) with a compass rose; up to 12 numbered pins with short labels (the teacher's,
  or a student's on their own copy). No map tiles or services. Names never sit under a pin or another name: they move,
  and on a map too small for every name the oceans' give way first. Arrows and Enter place pins; drag moves them.
- **"Make a question from it"** (the teacher's own screen; every tool): what the tool shows now becomes a stage 2
  multiple-choice quick check ("What fraction is shaded?", "What kind of angle is this?", "Where does point A land?"),
  2-4 answers built from the state with the tested maths, in an order that depends on the state. The teacher can change
  every word in a sheet that marks the right answer for them only, then sends it with `POST /checks` (kind `choice`):
  students answer as for any quick check and the projector shows totals. A state with nothing that has one right answer
  (an organizer, an empty board, a band that crosses itself, an untrue equation, a pin in the sea) makes no question, and
  the button is hidden.
- **"Practice it":** each tool lists, by hand, the official games that practise the same thing (`PRACTICE` in
  services/dash.js, from the games' own topics in `seed-games/*.json`). A game is offered only while it is the official
  account's (`isOfficial`) and every student of the class can open it (stage 1's `pushableGame`); a tool with no clean
  match (organizers, fraction/decimal/percent, area model, the whiteboard) shows nothing. One game: a link; two: a short
  list. Worked out with the page (`practice` in the page data); no new address. **Not matched:** lessons (their topics
  aren't tagged in a way that can be matched cleanly).
- **Safety and privacy** as in stages 1-3: no AI anywhere; no chat or free text between players (students never type to
  each other; what a student writes in their own copy never leaves their screen); nothing a student does with a copy
  comes back; Oomba names only; no prices, plans or "Pro". The new modules have no network, storage, recorder or
  `innerHTML` code (tested by reading them). Drawings are still never stored.
- **Accessible:** a keyboard way for every drag (listed above); changes announced in the polite live region; buttons 44px
  (the letter bank's tiles too); colour never the only sign (bands have dashes and numbers, negative tiles a hatch and a
  minus, vowels a dot, the marked count a ring). Maths stays left to right on right-to-left pages; spoken text follows
  stage 3 (numbers in the reader's language; counted words use the reader's plural rules).
- **Words that count** ("{n, plural, one {# vowel} other {# vowels}}") go to the browser as the message itself and are
  filled in there with `public/js/i18n-format.js` (other words are sent as before).
- **Nothing cut off.** The fit check (`npm run dash:fit`) now covers every stage 4 tool at its default and smallest
  size, in English, German and Arabic, on the teacher's screen, the projector, a student's screen and a phone, in light
  and dark (a dark phone was added). The widgets now go on as many layouts as they need, one layout filled with each set
  in turn (more sets than a teacher may keep). Its stage 3 "model spills out" check now leaves out what is scrolled out
  of view inside a list that scrolls (an organizer's box, the coins on the mat), as the widget-level check always has.
  Text in a tool is at least 12px (13px on the projector). **Decided:** smallest sizes: geoboard, nets and algebra
  tiles 5 × 6; angle 5 × 5; pattern blocks, transformations, balance, coins, chance and letters 6 × 6; organizer and
  map 6 × 5; stage 3's fraction bars went from 5 × 5 to 5 × 6 to make room for the new buttons.
- Earlier tests changed only where stage 4 needs it: the list of tools a student may add, the stage 2 filters that leave
  out the teaching tools (now Teach and Words and maps), the renderer files the registry test reads, and the fit test's
  views (a dark phone) and layout count.
- Tests: `tests/unit/dash-stage4.test.js`, `tests/unit/dash-fit.test.js`. Screenshots checked by hand: each tool on the
  teacher's 1600 × 900 screen, the projector with three tools, a student's sent copy at 1366 × 768 and on a 390 × 844
  phone, the question sheet and a student answering, dark, Arabic, and every tool at its smallest size.
- **Review fixes (16 Nov 2026).**
  - Buttons with an icon now always show their words, and a row wraps rather than drop them. This applies to the stage 3
    mode buttons as well. Any button also names itself in a tooltip on hover and on keyboard focus.
  - The number line leaves out the room for arcs while it has no jumps, so it fills a wide, short tool. Its readout no
    longer shows a lone number under the line, which read as a tick label.
  - The fit check now also fails when a short label (one word or number) breaks across lines. That caught the fraction,
    decimal and percent cards: a phone shows them one under another, and their values never wrap.
  - Coins in a pile show their value on the top coin only. The mat is as tall as its coins, and the tray and mat sit
    together.
  - Folded solids are drawn as closed solids: only faces turned towards the viewer are painted (faces' corners run
    outwards, tested), hidden edges are dashed, and the seam of a cylinder or cone shows only while it is open. The view
    never looks straight along a side face or at a single face of a prism; it turns a little further instead.
  - The map's Europe, Great Britain and Ireland are redrawn so they're recognisable (still our own simple outlines), and
    the demo pin for Kenya sits in East Africa.
  - The pattern block board has a margin, so its edge dots show whole.
  - The protractor's numbers thin to every 90° when it is too small for them to sit apart.
- **Review changes (16 Nov 2026): graphic organizers and letter tiles.**
  - **Organizers are written in where they are** (no sheet). Each box has a heading field and a text area lying over its
    list in the same type: a click, a tap or Tab puts the caret there, Enter in a heading goes on to its box, Enter in a
    box is a new idea (one a line), Escape leaves the box for its heading. What is typed is kept half a second after the
    last key and when the box is left, through the tool's own `ctx.keep` with the same limits (title 60, heading 40, box
    400) and the same server cleaning. So the teacher's text goes to their layout, a student's copy stays in their
    browser (or on their own screen if pinned) and nothing a student types reaches anyone else (tested by reading the
    code; the copy's keep is still `copies.set`). Every field is named ("Step 2: Ideas (one on each line)"). A copy that
    opens in a sheet puts the focus on the tool's first control, not a box (a phone would bring up its keyboard).
    "Make a question from it" still makes no question from an organizer, as before.
  - **Steps can be added and taken away.** A sequence has 2-10 steps ("Add a step", and ✕ on each step); main idea and
    details has 2-6 details ("Add a detail"). **Decided:** the other kinds keep their fixed boxes (a Venn diagram, a
    T-chart and KWL have a fixed meaning; a story map's five parts are its parts). Steps renumber (a heading the
    teacher wrote stays with its step). They run in rows of as many as fit with arrows between; when there are more
    rows than fit, whole rows fill the organizer and the rest scroll. The state gains `d` (details, 2-6, default 3), `n`
    goes to 2-10 and boxes to 10; layouts saved in the old shape come back unchanged (tested).
  - **The Venn diagram is two true circles** at every size: an SVG of its own 3:2 shape, as big as fits and centred
    (never stretched), with the three parts placed inside the circles; the middle part's ideas are centred, without
    bullets.
  - **Letter tiles: a drag shows.** A lifted copy of the tile (shadow, tilted) follows the mouse, finger or pen; the tile
    it came from shows as a dashed outline; the board lights up with a bar where the tile will go. A word tile held off
    the board is marked with ✕ and is taken away when let go (as before); a letter dropped elsewhere does nothing, and a
    cancelled drag changes nothing. Tapping, Enter, Shift+arrows and Delete still do everything a drag does, and the
    focused tile keeps the focus when the tool redraws.
  - **Choosing a word family starts from scratch**: the board is cleared and only the family's ending is on it ("none"
    clears it too). No confirm and no undo: the board holds a few letters.
  - **An instruction above the board**: "Drag or tap letters into the box to make a word." in every language (the old
    hint inside an empty board is no longer shown).
  - The fit check gained three organizers of their own: a sequence with ten steps, a Venn diagram and main idea with six
    details, all in long German words.
- **Not in this stage** (stage 5): video, site windows, document camera, hall pass, class jobs.

## Classroom dashboards, stage 5 (16 Nov 2026)
The last stage: what the teacher shows from outside Oomba (video, a site window, a document camera), the class's own
routines (hall pass, class jobs, points for each student, a mood check-in), and the gaps in the everyday toolset. Code:
`server/services/dash-media.js` (video ids, the "may this site be framed?" check, the CSP strings), the stage 5 section
of `server/services/dash.js`, `public/js/dash-class5.js` (renderers), `public/js/dash-camera.js` (the only stage 5 file
that touches a camera), `public/js/dash-video.js` (the browser's copy of the video rules, tested to agree); migration
0081 (`dash_passes`, `dash_points`, `dash_moods`).
- **Video** (teacher only, never pinned or pushed). The teacher pastes a YouTube or Vimeo link; only `{ p, id }` (and an
  unlisted Vimeo video's hash) is kept, after checking the host is the provider's own and the id is well formed
  (11 characters for YouTube, digits for Vimeo). Anything else is refused and nothing of the link is stored or echoed.
  Players come from `www.youtube.com` and `player.vimeo.com?dnt=1`, sandboxed (scripts, same origin, presentation,
  popups that escape the sandbox, storage access after a tap; never navigation of the page). **Changed (Nov 2026):** they
  were `www.youtube-nocookie.com` with no popups, but YouTube now often answers an embed with "Sign in to confirm you're
  not a bot": its Sign in button needs a popup, and a sign-in on youtube.com never reaches the nocookie host, so a
  teacher could not get past it. The widget is teacher only (never on a student's screen), so the teacher's own YouTube
  sign-in is what lets it play. Under the player, "↗ Open on YouTube/Vimeo" opens the video's own page (at the start
  time) for when the player still won't play here. Options: start, end (YouTube only: Vimeo's player has no end
  parameter, the settings say so), muted, loop. A time in a pasted link (`t=1m30s`) becomes the start. **Decided:** the
  frame sends `strict-origin-when-cross-origin` (the school site's origin only): both players refuse to play without
  knowing the embedding site, and the site's own `same-origin` policy would send nothing.
- **Site window** (teacher only). https addresses only (stage 1's `cleanUrl`: no `javascript:`, `data:`, `http:`,
  passwords, ports, IPs or local names). Before framing, the server asks the site once (headers only, three redirects at
  most, each address checked again, cached half an hour) and reads `X-Frame-Options` and CSP `frame-ancestors` as a
  browser does. The connection uses a DNS lookup that refuses private, loopback, link-local and similar addresses, so
  the check can't be pointed inside the school's or our network. Only an "ok" is framed; "refused" or no answer shows
  "This site can't be shown inside the dashboard" with **Open in a new tab** (`rel="noopener noreferrer"`). A frame that
  says yes but never loads falls back after 12 seconds. The new-tab link stays on the window either way.
- **The CSP, decided.** The brief suggested allowing every `https:` frame on the dashboard page. Narrower instead: the
  teacher's dashboard page adds exactly the two video hosts to `frame-src` (students' pages and every other page keep
  the site's CSP byte for byte, tested). A site window is framed through a same-origin wrapper,
  `/class/<id>/dashboard/frame/<widget>` (the class's teacher only, 404 to everyone else), whose own CSP is
  `default-src 'none'; frame-src <that site's origin(s)>; frame-ancestors 'self'` with no scripts, `X-Frame-Options:
  SAMEORIGIN`, `no-referrer`, and a sandboxed frame (scripts, same origin, forms, popups; never top navigation, camera
  or microphone). So the dashboard itself never trusts any outside origin but the two video hosts, and each wrapper
  trusts one site, the one the teacher chose, only after that site said it may be framed.
- **Permissions-Policy, changed.** The teacher's dashboard page now sends `camera=(self), microphone=(self)` (students'
  pages keep `camera=()` and `microphone=()`). The camera is the document camera's; the microphone fixes stage 2's noise
  meter, which the site-wide `microphone=()` had blocked in real browsers. `tests/unit/mic-scope.test.js` now lists
  `dash-media.js` as the third file allowed to grant the microphone (only on this page, tested in dash-stage5).
- **Document camera** (teacher only). Start, pick the camera (when there is more than one), mirror, turn a quarter at a
  time, zoom 1-3×, freeze (the frame is drawn on a canvas that is only shown, never read back). The stream stops when
  the widget is redrawn or removed, the layout changes, or the tab is hidden. "The camera is blocked" (with how to allow
  it) and "No camera found" are friendly cards with Try again. Nothing is recorded, stored or sent: the module has no
  network, storage, recorder or canvas-reading code (tested by reading it).
- **Hall pass** (pinned when added). The teacher picks the places students may ask for from a fixed list (bathroom,
  water, nurse, office, library), "one out at a time" (on by default) and the minutes before a pass shows as long. A
  student taps a place (no text), sees only their own pass (waiting, out with a timer, or "not right now") and taps I'm
  back. The teacher sees requests (Yes / Not now) and who is out with a timer ("long" in words and a red outline past the
  limit). **Decided:** on the projector, requests' names hide (the count stays) and an out pass shows "Out of class"
  instead of the place (a nurse visit is nobody else's business); the teacher's own screen shows both. Rows are minimal
  (place, state, two times) and for today only: other days' rows go whenever the class's passes are read, any row older
  than 36 hours goes too, and a pass's row goes when the student is back.
- **Class jobs.** The teacher's jobs (one a line, or eight usual ones in the reader's language), assigned to the class's
  students by Oomba name. **Next week** turns the chart by one (everyone moves to the next job; over n weeks n students
  do every job once, tested); **Shuffle** makes a new order. The order is student ids kept with the widget and checked
  against the class each time (leavers drop out, newcomers join at the end by name). Pinnable: students see the chart
  (names only, never ids) inside their class.
- **Points for each student: extending the scoreboard.** Stage 2's scoreboard already had team points (plus and minus).
  Rather than a second points widget, it gained a mode, **Each student**. The teacher gives a point with a reason from a
  fixed, positive list (kindness, helping, teamwork, hard work, listening, being responsible, trying something new, good
  ideas), to one student or everyone; there is no minus and no reason to take one away. Undo takes back the last point
  given (never below zero); Start again resets. The teacher's list is in name order, never ranked. On the projector the
  names and each student's points hide and the class total shows big. A student sees only their own total, its reasons
  and the class's total. Teams mode is unchanged (a stored scoreboard without a mode stays teams).
- **Mood check-in** (pinned when added). Five faces with their words; a student taps one (an index is stored, today
  only), changes it if they like, and is told only their teacher sees it. The teacher's widget (and so the projector)
  shows counts; "Who picked which" (a sheet, hidden on the projector) lists names for their own class only.
- **The rest of the toolset (audit).** Already there from stages 1-4: text and agenda, clock, timer (and visual ring),
  stopwatch, random name (and wheel), group maker, noise meter, QR code, traffic light, work symbols, quick checks
  (thumbs, fist to five, multiple choice, 1-5: these are the poll and exit ticket, fixed choices only), calendar,
  countdown to a day, dice, backgrounds and art. Added: **breathing** (a circle that grows and shrinks with "Breathe in",
  "Hold", "Breathe out" and a count; three patterns; still with reduced motion; students may add it too), **now and
  next** (a view of the schedule: two big cards), a **sticky note** (the teacher's own words, never pinned) and a
  **checklist** (the teacher's steps, ticked with a tap; ticked steps are struck through and marked, not only coloured;
  pinnable, read-only for students).
- **Safety.** Students never get video, site or camera widgets: the registry never lets them be pinned (even a forced pin
  flag in a stored layout is filtered when pins are made), they can't be pushed or added by students, and a student's
  page carries none of their settings (tested). Students never type here; names are Oomba names inside the class; no
  AI; no prices, plans or "Pro" (the German "pro Zeile" in three dashboard labels became "in jeder Zeile").
- **Accessible.** Every action is a button with its words (icons are decoration); timers are `role="timer"`; changes are
  announced in the polite live region; buttons are 44px or more; colour is never the only sign (an overdue pass says
  "long", ticked steps are struck through with a mark, the live camera chip says "Live"); right-to-left pages place
  classmates' Latin names where the line starts.
- **Fit check.** `npm run dash:fit` now also has layouts of stage 5 widgets (each at its default and smallest size, with
  the scoreboard's student mode and the schedule's now and next as extra widgets) in English, German and Arabic, on the
  teacher's screen, the projector, a student's screen and a phone, light and dark. Outside pages are stubs answered by
  the browser, the frame check is stubbed (allowed at the default size, refused at the smallest), the camera is
  Chromium's fake camera, and the text-size floor (12px, 13px on the projector) now covers stage 5 widgets too.
  **Decided sizes:** hall pass 5 × 5 (smallest 4 × 4), breathing 3 × 4 (3 × 4), video, site and camera 6 × 5 (4 × 4),
  jobs 5 × 5 (4 × 4), mood 4 × 4 (4 × 4), note 3 × 3 (3 × 2), checklist 4 × 4 (3 × 3).
- Earlier tests changed only where stage 5 needs it: the newest migration, the route count (42), the lists of what
  students may add and what is never pinned, the scoreboard's cleaned settings (now with its mode), the renderer files
  the registry test reads, and mic-scope's list of files allowed to grant the microphone.
- Tests: `tests/unit/dash-stage5.test.js`, `tests/unit/dash-fit.test.js`.
- **Review fixes (16 Nov 2026).**
  - **Whole rows in every list that scrolls (stages 1-5).** A `.dw-scroll` list is cut at the bottom of the last row
    that fits (`snapRows` in `public/js/dash.js`: a grid row ends with its tallest item; the gap below stays empty), so
    no row is ever sliced through. When not even one row fits (a long idea in an organizer box, a group card in a
    short group maker, a long tile title), it is cut between two lines of text, never through one. While there is more
    below, the list fades softly at its bottom edge (a mask) and "↓ More" stays. A widget's row of buttons sits at the
    bottom. Oomba tiles in a short widget go one line each, so whole tiles fit.
  - The fit check now fails when a list item is partly visible at the list's resting position (a `.dw-scroll` list
    always; another scrolling list unless it fades; a row taller than the whole list only if a line of its text is
    cut), and when a list with more below has no fade. It found the hall pass, class jobs, points, schedule, group
    maker, tiles and graphic organizer lists; all are fixed.
  - **Mood check-in on the projector** shows only "9 of 12 checked in" and "Each face's count is on your own screen,
    not the projector": in a small class "Sad 1" on the big screen could point to one child. The counts stay on the
    teacher's own screen.
  - The schedule's "now and next" goes to one line a card only below 170px of height.
  - Lists are cut again when projector mode changes the type size. On the projector, a graphic organizer's text starts
    at 14px (was 16px; the projector floor is 13px), so a short box still shows at least one whole line.
- **Not verified:** real YouTube and Vimeo players and a real site's frame check (the build sandbox can't reach them;
  tests and the fit check use stubs), and a physical document camera (Chromium's fake camera was used).

## Classroom dashboards: ready-made layouts (16 Nov 2026)
A teacher's first layout is still the near-empty "Everyday" starter, and every other layout was built by hand. Now the
New layout sheet starts with **Start from a ready-made layout**: five layouts (six since Math, below), each an icon, a name and one line, picked
with one tap (the name is filled in and can be changed), then Save. Below them **Or make your own** keeps the old choice
(copy the layout on screen, or the starter). Code: `LAYOUT_TEMPLATES`, `templateWidgets`, `createFromTemplate` in
`server/services/dash.js`; `POST /api/dash/:id/templates/:tid` in `server/routes/dash.js`; `newSheet` in
`public/js/dash.js`; strings `dash.tpl.*`, `dash.errors.template`, `js.dash.tpl.*`.
- **The five.** *Morning start* (sunrise hills art): clock, schedule as "now and next" with a sample school day, today's
  "I can" goal, mood check-in, class jobs; goal, mood and jobs pinned. *Lesson* (cream): number line, timer (15 min),
  quick check, help queue (pinned), traffic light. *Group work* (mint): group maker (4 groups), timer (20 min),
  scoreboard with four team names, noise meter. *Quiet work* (sky): a big ring timer (20 min), traffic light on red,
  work symbols on "silent", breathing. *Fun break* (sparks art, the most playful): name wheel, two dice, an empty video
  slot for the teacher's own movement or dance video, a 3-minute ring timer with a chime, breathing to calm down after,
  and a sticker board with five stickers already on it.
- **Decided: the quick check is not pinned.** The brief asked for the Lesson's quick check and help queue pinned, but the
  registry never lets a quick check be pinned (`pin: false`): a check reaches students when the teacher sends one, as
  an answer card. Only the help queue is pinned.
- **Sample content is in the teacher's language** (the language of the page they make it from): period names, goal,
  five jobs (from the class jobs' usual list), four team names (rockets, comets, planets, stars) and the light's words
  for red, yellow and green, in all 13 locales (en-GB only where it differs: "Maths", "Break"). Neutral and kid-friendly;
  no names of real people, no prices. The clock follows the language's usual 12- or 24-hour time.
- **Each is an ordinary layout once made.** Widgets are built for the language, then go through `createLayout`, so
  `cleanWidgets` rebuilds them from the registry like anything a browser sends; ids are fresh each time (two layouts
  from one template never share a running timer). The route is the create-layout route's twin: signed in, the class's
  own teacher only (404 for everyone else), the site's same-origin check, the same `dash-layout` rate limit, and
  `MAX_LAYOUTS` with the same "delete one first" error. An unknown template is refused.
- **Boxes.** Every template fits the 12-column grid in at most 8 rows (a 1600 × 900 screen without scrolling), with no
  overlaps and every widget at least its smallest size. Morning start's clock sits where a student's own starter clock
  is (4 × 2 at the top left), so its pinned widgets don't get pushed down on student screens.
- **The layout chips.** Five more layouts made the footer wrap to a second line on the projector. On screens 720px and
  wider the chips now stay on one line and scroll sideways when there are more than fit (the one on screen is kept in
  view, the edge fades while there are more), and the projector hides the "Layout" label. Phones are unchanged.
- **The mood check-in's faces** are rounded squares instead of pills, so a long word ("Benissimo") stays inside the
  chosen face's dark background.
- ~~Not done: offering the templates on a brand-new class's first visit.~~ Done since (below).
- Tests: `tests/unit/dash-templates.test.js`; the route count in `dash-stage4.test.js` is now 43. `npm run dash:fit`
  checks each template (`tpl-<id>`, built in English, German and Arabic) on every view.

**The default set on a first visit, a Math layout, rename in edit mode (16 Nov 2026).** "You should also be able to edit
the name of the page in the edit screen. Also make the default screens automatically populate for new users and add a
Math default dashboard as well."
- **First visit.** A teacher's first visit to a class's dashboard (no layouts of theirs for that class) now makes all six
  ready-made layouts, in the teacher's language, in this order: Morning start, Lesson, Math, Group work, Quiet work, Fun
  break (`DEFAULT_SET`, 6 of `MAX_LAYOUTS` 12). Morning start is first, on screen, and the one students follow (its goal,
  mood check-in and class jobs pinned) unless the class already follows another teacher's layout. **Decided: no
  "Everyday" seventh**: Morning start replaces it. `starterWidgets` stays for the New sheet's "Your own layout" without
  copying. A teacher with any layout for the class gets nothing new (existing teachers' layouts are never touched or
  duplicated). `dash.layouts.defaultName` and `js.dash.editing` went with it.
- **Race guard.** `ensureLayouts` counts and inserts inside one IMMEDIATE transaction (better-sqlite3's
  `.immediate()`): the database's write lock is taken before counting, so two first requests at once (two tabs, or two
  server processes on the one file) can't both find none. Tested with two tabs and with two processes starting the same
  millisecond on a shared database file (the test fails without the guard).
- **Class jobs on student screens from day one.** Morning start pins class jobs, so a new class's student screens show
  the week's crew by Oomba name, as stage 5 designed it (the class already sees those names). Two tests that looked for
  "no other names anywhere in a student's live answer" around a quick check now first switch the class to Quiet work.
- **Math** (🔢, leaf green; en-GB "Maths", it "Matematica", de "Mathe", fr "Maths", ja "算数", nl "Rekenen", he "חשבון"...):
  fraction bars (5 × 8, the full height: the tool needs at least 5 × 7), a number line counting in quarters from 0 to 2
  (7 × 4), the help queue (4 × 4, pinned) and a 10-minute timer (3 × 4); the 12 × 8 grid exactly, no gaps. **Decided:
  no quick check or "I can" goal.** At the tools' current smallest sizes, fractions + number line + quick check + timer +
  help needs 99 cells of 96; the quick check is one tap away in each tool's "Make a question", and the Lesson layout
  has one. Only maths tool ids that stay when the maths tools are merged into fewer types (`fractions`, `numline`), so
  the layout survives that; the number line's state is built with `cleanToolState`, so it is always what the tool
  stores. In the New layout sheet after Lesson.
- **Rename in edit mode.** The edit bar's "Editing: <name>" now has the name as a field (labelled "Layout name", at most
  40, a dashed underline and a pencil until focused, sized to the name). Enter or leaving it saves through the same
  route as Rename in the ⋯ sheet (cleaned on the server: required, at most 40, control and direction characters
  removed); Escape puts the saved name back; an error ("Give the layout a name.", or the server's) shows beside it in
  red and the field is marked invalid; the footer chip updates at once and a screen reader hears "Layout renamed".
  The words around the name come from the one translated string, so each language keeps its order. Rename in the ⋯
  sheet stays.
- Tests (`dash-templates.test.js`): first visit makes the six in order (English and Italian), Morning start followed with
  its pins; second and third visits change nothing; a teacher with a layout is untouched; two tabs at once and two
  processes at once make the set once; Math valid in every locale (grid, sizes, pins, no gaps); the edit bar's field and
  the rename route's checks. Changed: `dash.test.js` (first layout "Morning start" not "Everyday", its pins, delete down
  to one before "the last layout stays", the pinned goal is Morning start's sample), `dash-templates.test.js` (six
  templates, "nothing was made" counts the first visit's six), `dash-stage2.test.js` and `dash-stage4.test.js` (switch to
  Quiet work first, above). `npm run dash:fit` checks `tpl-math`.

## Classroom dashboards: any website in the QR code (16 Nov 2026)
"Allow teachers to add websites freely to the QR code." The QR widget's settings ("What the code opens") gain
**A website…**: an address box, an optional name and "Show this website". Before, a website had to be approved first in
Push to students' link tab.
- **Same rules as every approved link.** The address is checked as the teacher types (`webAddress` in
  `public/js/dash-video.js`, the browser's copy of `services/dash.js` `webAddress`; a test checks they agree) and again
  on the server: https only, a real host name, no IP address, port, `localhost`/`.local`/`.internal`, user name or
  password, spaces or control characters, at most 500 characters. The error is the existing wording ("Use a full web
  address that starts with https://"). **No scheme typed** ("example.org/page"): read as `https://example.org/page`
  on both sides, and the settings show the full address the code will open. An address with any other scheme
  (`http:`, `javascript:`, `data:`, `file:`, `user:pw@…`) is still refused, never rewritten.
- **It becomes an approved link.** `POST /api/dash/:id/links` with `qr: true` (no new address; the class's teacher only,
  404 to everyone else, the same rate limit) calls `addLink`: audited (`dash.link_add`), on the class's list in Push to
  students, removable there, counted toward `MAX_LINKS` (50). The same address again is the same link (`addLink` now
  looks for it before checking the limit, so a full list still reuses it). The widget keeps `{ kind: 'link', ref }`
  as before; the live game, lesson and game choices are unchanged.
- **What the code holds: the website's own https address.** The class's `/class/<id>/dashboard/link/<id>` redirect
  needs a sign-in (it checks the reader is in the class), and the tablets and phones that scan a projector are often
  not signed in, so a student would meet a sign-in page instead of the site. The code is therefore the approved
  address itself. It stays safe because the code is only made from an approved, `cleanUrl`-valid link of the class,
  by the teacher's own request, and the widget is teacher only (`pin: false`, never on a student screen; students
  can't add links). Removing the link takes the code away: the server refuses to make it (404, "That link isn't
  available any more"), the screen that removed it redraws at once, and every QR widget checks again each minute, so
  another screen loses it within a minute. A device that already scanned it keeps the address, as with any website
  shown on a board. Changed test: `dash-stage2` "QR codes…" expected the class redirect in the code; it now expects
  the website address (and that the SVG is that address's code).
- **Long addresses.** `services/qr.js` now makes versions 1-40 (level M, byte mode: the standard's block table,
  alignment patterns and version information), with versions 1-6 byte for byte as before and the default still
  version 6 (the live host screen is unchanged). The dashboard asks for up to **version 13 (69 × 69 modules, 331
  bytes)**: typical addresses of 150-250 characters fit (250 is version 11); longer ones would be too dense to scan
  from a seat. A longer address is refused as it is typed and on save ("This address is too long for a QR code — try
  a shorter link"), and an older approved link that is too long shows that message in the widget (the QR route
  answers 422). Checked against the standard's capacity, alignment and version information tables, against symbols
  made by OpenCV 5.0's QR encoder (module-for-module identical at versions 7-20 with the same mask; the SHA-256 of
  four reference symbols are in `tests/unit/live-qr.test.js`), and by decoding our codes with OpenCV's QR detector,
  including screenshots of the widget in a real browser (34 and 250 characters).
- **Under the code:** the short address (without `https://`) as before, and the teacher's name for the link when one
  was given (a name that is only the host name is not repeated).
- Tests: `tests/unit/dash-stage2.test.js` (typed website creates or reuses the link and the target, refused
  addresses, browser and server agree, removed link → no code, the encoded address, long addresses, who may call it,
  a full list, translations), `tests/unit/live-qr.test.js` (versions 7-40).

## Classroom dashboards: timer and stopwatch combined (16 Nov 2026)
The product owner: "combine the timer and stopwatch into one widget where you can choose between the two." The library
now has one entry, **Timer and stopwatch** (type id `timer`; "Timer e cronometro", "Timer und Stoppuhr"...), and no
Stopwatch of its own. Code: `WIDGETS` (timer), `RETIRED`, `migrateWidget(s)`, `timerMode`, `timerAction`,
`updateLayout` in `server/services/dash.js`; `timer` in `public/js/dash-widgets.js`; `.dw-modes` / `.dw-tmain` in
`public/css/dash.css`; strings `dash.w.timer.*` (`s.mode`, `o.mode.*`, `mode`, `toTimer`, `toStopwatch`).
- **Mode is a setting** (`mode`: `timer` counts down, `stopwatch` counts up; default timer) and a switch at the top of
  the widget: two buttons, Timer | Stopwatch, for whoever controls it (the teacher, or a student on their own timer);
  pinned copies on student screens show only the time. Each mode keeps what it had: the timer its quick
  times, custom time, bar or ring and chime; the stopwatch start, pause, resume and reset (it never had laps).
- **Decided: switching mode starts again from nothing**, even while it runs. A countdown is never turned into a count
  up or back: the run is dropped (the browser at once; the server when the layout is saved, `updateLayout` compares
  each timer's mode; `timerAction` also never reuses a run of the other mode), the new mode shows 0:00 or its full
  minutes, paused, on every screen, and the switch is announced ("Stopwatch: counts up from zero").
- **Old stopwatches keep working, on read** (no migration: nothing to rewrite in bulk, and old browsers may still send
  the old type). Everywhere a widget list is read (layouts, the class's pins, a student's own screen) or sent
  (`cleanWidgets`), a `stopwatch` becomes a `timer` in stopwatch mode **with the same id**, so its running state in
  `dash_class.timers` (mode `up`) carries on, pins and a student's place for it still match, and
  `/api/dash/:id/timers/<old id>` still answers. It is stored as a timer the next time the layout is saved, and the
  pins are republished then (students redraw). `TIMER_TYPES` still lists `stopwatch` for that reason.
- **Size: default 4 × 4, smallest 3 × 4** (was 4 × 3 and 3 × 3; the stopwatch 3 × 3): the switch is a 44px row above
  the digits (the digits give up a little height for it; at the smallest size on a narrow screen the quick times
  are hidden, as they always were on a short timer, and the minutes stay in the settings). An old stopwatch's box grows to 3 × 4 when read and widgets it would now cover move down (as in the
  browser); a student's place for a pinned one grows too. The ready-made layouts' timers (4 × 4, 6 × 7, 3 × 4) already
  fit. `npm run dash:fit` checks a running stopwatch-mode widget (past an hour) next to the timer, and a student's own
  timer and stopwatch with their switch, at both sizes, on every view in English, German and Arabic.
- The old `dash.w.stopwatch.*` strings are left in place (i18n:check does not require removing them).
- Tests: `tests/unit/dash-timer.test.js` (one library entry, the mode setting, switching while running, both modes'
  server actions, old stopwatches in layouts, pins, student screens and running state, ready-made layouts). Updated
  to the combined widget: the student-addable lists in `dash.test.js` and `dash-stage2.test.js`, the timer's cleaned
  settings in `dash-stage2.test.js`, and the brief audit in `dash-stage5.test.js` (the stopwatch is a mode of the
  timer).

## Classroom dashboards: stickers widget removed (16 Nov 2026)
Product decision ("Remove the sticker widget"): the **stickers** widget (stage 2) is gone. It is out of the registry
(`WIDGETS` in `server/services/dash.js`, with its hidden `stamps` setting type, `cleanStamps`, `MAX_STAMPS` and
`STAMP_COUNT`), so it is no longer in the widget library and neither teachers nor students can add it; its renderer and
emoji set (`public/js/dash-widgets.js`), its CSS and its `dash.w.stickers.*` strings in every locale went with it.
- **Existing ones are dropped, not migrated.** Layouts, the class's pins and student screens are stored as JSON; a
  widget whose type the registry no longer has is now filtered out when read (`known` in `readLayout`, `pinsOf`,
  `studentState`), and `cleanWidgets` already refused unknown types on save. So an old layout, pin or student screen with
  a stickers widget loads with only that widget missing, and the next save stores it without it. A student's saved place
  for an old pinned stickers widget is ignored (it used to be a crash waiting to happen: `cleanBox` of an unknown type).
  Pushes never carried stickers (only teaching tools are sent). No migration.
- **Fun break** gets a team **scoreboard** (four sample team names in the teacher's language) in the stickers' 5 × 3
  place, its default size: still playful for a break, and the layout still fills the 12 × 8 grid with no gaps.

## Classroom dashboards: help on the maths tools (16 Nov 2026)
Product request: "Add better instructions on the math widgets. Have a one line instruction and then an info box in the top
right that explains more. Also, for fractions, you should be able to compare, add, subtract, multiply fractions" (Divide
was added to the same change on request). Code: the tools' shell in `public/js/dash-tools.js` (`helpButton`, `T.howto`),
the fraction tool in the same file, the maths in `public/js/dash-math.js` (`OPS`, `operate`, `mixedText`...), the
questions in `public/js/dash-ask.js`, the cleaning in `server/services/dash-tools.js`, `MATH_TOOLS` in
`server/services/dash.js`, strings `dash.w.<tool>.howto|helpUse|helpIdeas`, `dash.tools.helpFor|helpClose|helpTry`, `dash.ask.fractions*`.
- **Which tools.** Every maths tool (`MATH_TOOLS`, tested to be exactly the Teach tools that are sent to students): fraction
  bars, number line, coordinate plane, graph maker, base-ten blocks, place value, ten frames, hundreds chart, area model,
  times table, teaching clock, fraction/decimal/percent, geoboard, pattern blocks, angle maker, 3D shapes and nets,
  transformations, balance scale, algebra tiles, coins and money, chance lab. Not the whiteboard, letter tiles (they
  already have their instruction), organizers or maps.
- **A one-line instruction** under the title row, saying what to do first ("Tap a bar to shade parts. Use − and + to change
  the pieces."); the fraction tool's changes with its mode. It wraps rather than being cut (the fit check); German lines
  are at most 72 characters (tested). The readout hints it replaces are gone (number line, area model, clock, geoboard,
  transformations), so there are never two.
- **ⓘ in the header, top right** (after the pin chip and "More"; 44px; named "How to use Fraction bars"). It opens a small
  panel inside the widget, not a page modal. Closed by ✕, Escape or a tap outside; the focus goes into the panel and back
  to ⓘ; `aria-expanded`/`aria-controls`. A student's copy (in a sheet, with no header) has ⓘ at the end of the
  instruction row. **On the projector ⓘ and the panel are hidden**; the instruction stays, larger. The help is built
  with `textContent` only.
  - **Decided: the panel is short** (product, after the first version: "Make the information panel much more concise.
    The one I saw was extremely long"; the fractions panel had six long points, two ideas and a "More" section that ran
    off the panel). Now: the panel's one heading is its title ("How to use Fraction bars"), then **at most three
    points** (`helpUse`, one a line, each about 12 words or fewer in English) with only what the one-line instruction
    doesn't already say (modes, hidden features, keys, Options), then **one "Try:" line** (`helpIdeas`, one idea for
    class; teacher only, never on a student's copy). About 40-50 words in English a tool (fractions went from about 180
    words with the "More" section to 39). **No "More" section**: Make a question, Send to students and Practice it say
    what they do, and a student's copy already says it is theirs under the tool. The code shows at most three points and
    the first idea whatever the strings hold. Tested in every language: at most 3 points and one idea, at most 12 words a
    point and 50 in all in English, at most 90 characters a line and 300 a tool in every locale, every locale translated,
    the old `dash.tools.help*` words gone (only `helpFor`, `helpClose`, `helpTry` stay). The fit check opens each tool's
    panel in turn (teacher, student and phone, light and dark): it fits the widget without scrolling and nothing in it is
    cut. The geoboard's help is being rewritten with the geoboard itself in this same format, so its strings are not yet
    held to the budget.
- **Fractions: Compare | Add | Subtract | Multiply | Divide.** Compare is unchanged. The operations take two fractions,
  each with − and + on its numerator and denominator: denominators 1-12, numerators 0-12 and at most three wholes (so
  whole numbers 1/1-3/1 work). Add and Subtract cut both into same-size pieces (the least common denominator) on one
  scale, then draw the answer (adding: the second's pieces after the first's; subtracting: the second's pieces crossed off
  the first's end), with the steps "3/4 + 2/3 = 9/12 + 8/12 = 17/12", the simplest form and the mixed number. Past 48
  pieces a whole (or 96 in a strip) the answer is drawn as one bar and "too small to draw" is said. Multiply is an area
  model: a unit square cut one way by the first denominator (its numerator shaded) and the other way by the second; the
  overlap is the product, "6 of the 12 small parts overlap"; past one whole the square repeats. Divide measures the first
  in lots of the second (same-size pieces; whole lots take turns in two colours, the part left over is hatched) and works
  "3/4 ÷ 1/2 = 3/4 × 2/1 = 6/4 = 3/2", "1 1/2 of 1/2 fit in 3/4".
  - **Decided: subtracting below zero** is allowed and shown: the answer has its minus ("−1/6"), its pieces are hatched
    and dashed in the answer strip, a note says "1/2 is bigger than 1/3, so the answer is less than zero", and a **Swap**
    button appears. Nothing is blocked.
  - **Decided: dividing by zero** can't happen: in Divide the second numerator stops at 1 (pressing − there says
    "Nothing can be divided by zero..."), the maths raises a 0 to 1 (`guarded`) and the server cleans it to 1.
  - Hide the answer works in every mode ("1/2 + 1/3 = ?", no same-size pieces, an empty answer strip, no overlap).
  - **Make a question** per mode: "What is 1/2 + 1/3?" with the answer in lowest terms (a mixed number past one) and wrong
    answers from the usual slips: adding tops and bottoms, keeping one denominator, one piece too many or few, the sign
    turned round, crossing over, forgetting to turn the divisor over, turning the first over. A wrong answer is never
    worth the same as the right one (tested). Dividing straight across is not offered: it always gives the right value.
  - The bars and circles views both work in Add, Subtract and Divide; Multiply has its own picture.
  - **State and old layouts.** The state gains `mode`, `a` and `b`, rebuilt on the server (a new `obj` spec kind). They
    are stored only when one differs from its start (Compare, 1/2 and 1/3), so a Compare state is stored exactly as before
    and layouts and pushes saved before this load unchanged (tested; no earlier assertion changed). The operations are
    entries of `OPS`, so another can be added without touching the rest.
- **Sizes.** The instruction costs a line, so a few smallest sizes went up where the fit check found text under 12px or a
  model spilling: fraction bars 6 × 7 (smallest 5 × 7; the mode switch is a row too), ten frames smallest 4 × 6, area
  model smallest 5 × 6, 3D shapes 6 × 7 (smallest 5 × 7), graph maker 5 × 6 (German instruction and long labels), times table smallest 5 × 8, coins 7 × 7 (smallest 6 × 7). The fit check has three more fraction widgets (Add in circles
  past one whole, Subtract below zero, Multiply with a whole number).
- Also fixed: a graphic organizer's rows were sized from the grid's rounded height (`clientHeight`), so on some screens
  the last row ended a pixel past the organizer; they now use its exact height, rounded down. (Found when the fit check's
  new packing put the main-idea organizer alone on the Arabic projector.)
- No AI, no network, nothing a student does reaches anyone; no prices. Tests: `tests/unit/dash-stage3.test.js` (the
  maths, the cleaning, a question per mode), `tests/unit/dash-stage4.test.js` (every maths tool's instruction and short
  help in every language, the panel's code), `scripts/dash-fit-check.js` (each panel opened). Strings in all 13 locales (en-GB where spelling differs).

## Fractions as a number sentence (16 Nov 2026)
Product feedback on the fraction tool's operations: "The fractions look funny here. I don't like how they are shown
vertically. Also, when you switch to the bars it looks terrible." Code: `opView` and the functions after it in
`public/js/dash-tools.js`, the `.dt-fop` rules in `public/css/dash.css`. Compare is unchanged; the state is unchanged.
- **What was wrong.** Add/Subtract/Divide drew the two fractions' − and + as one row above a grid of three pictures with
  their labels, the grid's rows sized between fixed limits (22-90px) and its pictures `height:100%` of those rows, all
  centred with `align-content:center` (not `safe`). On a widget whose model area is under 340px tall (a default-size
  fraction widget on a busy layout is about 280px) a container query also turned each fraction's − and + into one
  cramped row (`− 1 + / − 2 +`), its slash drawn with a transform. Circles therefore came out as a column down the
  left. When the pictures needed more height than the area had (a shorter area, longer words, bars after circles), the
  grid's overflow was centred, so it grew upward over the − and + row and the mode buttons; the transformed slashes
  paint above later content, which is why "/" showed inside the top bar while the buttons under it were hidden. The
  readout was also rebuilt after the pictures were measured, so the area changed size after every draw.
- **Now.** The sizes are worked out in the browser from the model area (measured after the readout is built; drawn again
  when it changes size): each way of laying it out is tried, best first, and the first that really fits (measured) is
  kept, so it never spills; every container also centres `safe`, so nothing can grow over the buttons.
  - **Circles:** a number sentence in one row, each fraction's circles above its − and + (stacked as on paper: − n +
    over − d +, with "= 3/6" beside it when the same-size pieces are drawn), then the sign, the second, = and the
    answer's circles over the answer (? while hidden, under one dashed circle). Two rows (A − B, then = answer) when one
    row would make the circles small; on a phone one fraction a row, its circles beside it.
  - **Bars:** stacked on one scale (good for comparing lengths), each with its sign and fraction (its − and +) beside it
    and level with it; at most 72px tall and 1100px wide. Add and Subtract show the same-size pieces as thin dashed
    lines inside the original pieces, Divide its lots in two shades with the part lot hatched.
  - **Multiply:** the sentence (A × B = answer) above the area model, which stays square.
  - The − and + come in four sizes, chosen by the room: 44px buttons stacked, 36px stacked, and (only on a very short
    widget, such as the smallest one in German or on the projector) each fraction on one row, with 44px or 36px
    buttons. "= 3/6" beside a fraction is left out before anything gets smaller (the readout still says it).
- **Tested:** the fit check has Divide in circles past one whole and a widget whose mode and view the teacher's screen
  switches through in turn (ending in Divide with bars, hidden), and checks that each bar's fraction is level with its
  bar and that the sentence reads left to right (in Arabic too: maths stays left to right).

## Classroom dashboards: Shape board, the geoboard rebuilt (16 Nov 2026)
Product request: "add a tool like this that allows you to make different shapes... include all of the tools you see on the
screenshot. Should be super responsive and perfect ux on desktop mobile and tablet." The screenshot (another company's
board) was used as a list of features only: the look, layout, colours, icons and words are our own, built from the
dashboard tools' parts, and nothing names or imitates another product. The widget keeps its type id `geoboard` and its
name "Geoboard" (Geobrett, Géoplan...), so layouts, pushes, Practice it and ready-made layouts keep working. Code: the
renderer `public/js/dash-shapeboard.js` (imported by `dash-tools4.js`), the geometry in `public/js/dash-math4.js`
("shape board" section), the question in `dash-ask.js`, the state in `server/services/dash-tools.js`, CSS `gb-*` in
`public/css/dash.css`, strings `dash.w.geoboard.*` and `dash.ask.geoboardTri` in all 13 locales.
- **Bands.** Seven colours, each with its own dash too (colour is never the only sign). Tap pegs to stretch a band, tap its
  first peg (ringed) to close it. Pick a colour, or New band, to start another; up to 12 bands of up to 16 pegs. A
  selected band shows its corners: drag one to move it, or drag inside the band to move the whole band (peg by peg; on the
  circle it turns round the centre). Delete band, Reset (everything, with undo). Fills: translucent in the band's colour.
- **Boards.** A square grid (5 × 5, 7 × 7, 9 × 9, 11 × 11), triangle dots (the same sizes; every other row half a step
  over, so each peg's six neighbours are one step away) and a circle (6, 8, 10, 12, 16 or 24 pegs round it and one in the
  centre). Grid lines: the rows and columns, the three directions of the triangle dots, or the circle and its spokes.
  Changing the kind of board starts the bands afresh; changing its size keeps the pegs that still fit.
- **Shapes.** Triangle, right triangle, square, rectangle, parallelogram, trapezoid, pentagon, hexagon and octagon, each only
  where the board can make it (no square on triangle dots; regular shapes on the circle when its pegs divide evenly),
  dropped in the middle as an ordinary band (a second one moves over a step so both show).
- **Measures, exactly.** Square grid: area in square units by Pick's theorem (halves as "4 1/2") and the perimeter as whole
  units plus simplified roots with a decimal ("2 + 2√2 ≈ 4.83"). Triangle dots: area in small triangles (t = 2I + B − 2,
  checked against a count) and exact perimeters (a side's square is u² + uv + v², so "4 + 4√3"). The circle: decimals with
  the radius as 1 unit (its chords are not whole-number roots), said so under the readout. **Angles** shows each inside
  angle (whole degrees, else one decimal; a dent is reflex; right angles get a square mark); **Labels** shows corner
  letters A, B, C... across every band and each side's length. Both for the selected band, or every band when none is.
- **Tools:** Make bands (the usual mode), a **ruler** whose ends snap to pegs (drag an end to turn it, drag its body to move
  it; its exact length on it) and the Pick's theorem line. **Annotate:** text labels (tap where; up to 12, 40 characters;
  drag to move, tap to change or delete) and a pen in five colours with an eraser that rubs out whole strokes. A chip over
  the board says which mode is on and has Done.
- **Challenge title** at the top: the teacher types it (a text area that wraps; 80 characters) or picks one of five ideas
  ("Make a shape with an area of 12 square units."...); everyone else reads it; on the projector it is large.
- **Bar:** settings (board and grid size), full screen (the Fullscreen API on the widget; where there is none, the widget
  fills the window, and Escape leaves), zoom in and out (up to 4×; Fit comes back), undo and redo (60 steps, in this page),
  Grid, Fills, Grid lines, Angles, Labels.
- **Devices.** One code path for mouse, touch and pen (pointer events, captured for the whole gesture); the board has
  `touch-action: none`, so dragging never scrolls the page, and two fingers pinch and pan the board (never the page);
  Ctrl/⌘ + wheel zooms; a drag on the empty board pans when zoomed. Pegs snap from half a step away and at least 26px.
  Every control is at least 44px. A wide widget (at least 620 × 400 px of room, not a phone, not the projector) has a rail
  (Shapes, Tools, Annotate, Reset, board), the colours beside it and a bar below; anything narrower, a phone and the
  projector have one compact bar (colour, Shapes, Tools, Annotate, View, Undo, More) whose groups open as small menus inside
  the widget (Escape, a tap outside, arrow keys), so the board keeps the room. Where a square board leaves room at its
  side, the measures are read out beside it. A phone shows the board full width and square.
- **Keyboard.** Tab reaches every control (visible focus); on the board the arrow keys move a peg cursor, Enter stretches the
  band, closes it or picks a corner; with a band selected the arrows move the band, with a corner picked they move the
  corner; [ and ] go from band to band; Delete removes, Backspace takes back the last peg while stretching, Escape lets go,
  + and − zoom, Ctrl/⌘+Z undoes and Ctrl/⌘+Shift+Z or Ctrl+Y redoes. Labels are buttons (Enter edits, arrows move them).
  Changes are said once in the polite live region with the selected band's area and perimeter when they change.
- **Projector:** the compact bar, bigger pegs and thicker bands, the title large in blue; ⓘ hidden as for every tool.
- **State and old layouts.** New keys: `board`, `ring`, `fills`, `lines`, `angles`, `labels`, `title`, `notes` (x, y in the
  board's 1000 × 1000 units, text), `ink` (strokes: a colour and whole-number points, simplified in the browser, at most
  30 strokes of 120 points), and `c` (a colour) on each band; `cur` may be −1 (none selected) and bands go to 12. They are
  stored only when they differ from their start, so a geoboard saved before this loads, and is stored again, exactly as it
  was (tested); a band with no colour takes its place's colour. **Decided:** sizes 8 × 8 (smallest 5 × 7); smaller saved
  boards grow on read (`migrateWidget`).
- **Privacy.** The state goes only through the tool's `ctx.keep` (the teacher's layout; a student's copy in their own
  browser) and the teacher's Send to students, as before. Labels and pen strokes on a teacher's tool are the teacher's
  (cleaned on the server like other teacher text: control and direction characters out, lengths and counts capped). On a
  student's copy they stay in that browser; if the student pins it, the server drops labels and drawings from their own
  screen (`cleanToolState(..., { student: true })`, tested) and the browser leaves them out of what it keeps. Nothing a
  student types or draws reaches another student or the teacher; drawings never go to any AI (there is none here); no
  network, storage or `innerHTML` in the renderer (tested). Students read the title, never type it. No prices.
- **The ⓘ help is short** (product feedback: "much more concise"): three lines on the controls (each about a dozen words)
  and one "Try:" idea, about 50 words in English; the shared list of Make a question, Send to students and Practice it
  is left out of this panel (those buttons say what they do). The panel is tidied by the renderer after the shell builds
  it, so the shared help code is unchanged.
- **Make a question** asks the selected band's area (or the first closed shape's): wrong answers are the perimeter, the pegs
  counted, and one or two squares off; on triangle dots, "How many small triangles make the shape?". The circle makes no
  question (its areas are not exact).
- **Changed tests:** `dash-stage4.test.js` expected a geoboard to keep at most 6 bands (`bands.length` 6, `cur` 5 for 11
  bands sent); it now keeps up to 12, so the same input keeps 11 bands and `cur` 9, and a new line checks the cap of 12.
  Its safety scan now also reads `dash-shapeboard.js`. New: `tests/unit/dash-shapeboard.test.js`. The fit check has three
  busy geoboards of their own (twelve bands with labels, angles, grid lines, labels and strokes and a long German title;
  triangle dots; the 24-peg circle).
- **Fixed (17 Nov 2026): the board drawn again every frame on the projector.** Whether the measures go beside the board
  was decided from the stage's height, but the stage is taller with the readout beside it than with it underneath: at
  the smallest size on the projector (605 × 383 with the readout under, 605 × 448 beside) each draw moved the readout and
  the next moved it back, so the board was redrawn every frame with its words sized for the other arrangement (the fit
  check's "Geoboard: "A" is 10.1px (needs 13)" in some runs, and a page too busy to click the layout chip). The room is
  now the stage plus the readout when it is underneath, the same either way, and once beside it stays there until the
  room is 16px short of the threshold. The fit check is unchanged.

## Classroom dashboards: the schedule at every time of day (16 Nov 2026)
The schedule failed the fit check at some times of day and not others (a period row cut in half on the projector, a list
with rows hidden above and no fade, "now and next" too tall at its smallest in the first period). Real bugs a class
could see at those times, not flakes: the check ran with the real clock, so it saw a different schedule each run.
- **Causes.** (1) The list scrolled the period on now into view itself (`scrollTop = row.offsetTop - 4`), and only
  when its status line changed (a minute later, since the first draw happens before the widget is on the page), while
  the whole-rows cut (`snapRows`) was worked out for the list at its top: once scrolled, rows were sliced at both
  edges. (2) Scrolled to its end, the list cleared its fade (`at-end`) although rows were hidden above, with nothing
  saying so. (3) On the projector the rows' type settles to the widget's new size a frame after the widget is resized
  (container units), after the list was cut, and nothing cut it again: the widget's own size had not changed. (4) "Now
  and next": its two cards were fixed at 3 : 2 of the widget (`minmax(0, …)` rows; the short layout's rows never
  applied, since the widget's body is its own size container and a container query never matches the container
  itself), so a card whose text wrapped (a long first period, "Morgenkreis und Begrüßung", or "Danach kommt nichts
  mehr") ran over the other card or out of the widget.
- **Fixes.** A list may name the row it rests on (`snapTo`; the schedule names the period on now, else the next one,
  else after school the last one). `snapRows` then scrolls it to that row's top and cuts it at the last whole row
  below; near the end it rests at its end, starting at a row's top, so whole rows still fill it. Rows hidden above get
  a lighter, shorter fade at the top edge (`at-top`, set with `at-end`), so the lit row it rests on still reads
  clearly. Each scrolling list watches its rows' sizes and is cut again when one changes. "Now and next" cards share
  the height 3 : 2 but are never shorter than their text; the next card leaves out its start time when it is the time
  the period on now ends ("15 min left" already says it); and when the text is still more than the widget holds, the
  names get smaller in steps (never under 13px), and as a last step the next card steps aside so "now" keeps the
  widget. One step a frame, only ever down until the text or the widget's size changes (the type follows container
  units a frame late, so a size read straight after a change can be stale; stepping one way never swings). Nothing is
  cut.
- **"Now and next" out of school hours.** Only a period on now is lit and labelled "Now". Before the first period (or
  in a gap) the card says "First up" / "Next", the period and when it starts; after the last one it is a calm end of
  the day ("That's the end of today's schedule.", no label, not lit). No new words.
- **One time zone on the dashboard.** A teacher saw "end of the day" at 11:19 in the morning: their school has no time
  zone set, so the schedule ran on the fallback (America/New_York) while the top bar's clock showed the browser's own
  time. The page now says whether the school's zone is set (`tzSet`); when it is not, the whole dashboard (top bar
  clock, schedule, calendar, countdowns) uses the browser's zone, and when it is, the top bar's clock uses the
  school's zone too. The server's school day for unset schools is unchanged (New York). The ready-made "Morning start"
  sample day already runs 08:30-14:45 (`TPL_PERIODS`), so it was the zone, not the sample periods.
- **The fit check pins the clock** (Playwright's `page.clock`, at today's date in the school's time zone, with the
  browser in that zone). The page opens 40 s before the time checked and the clock then moves on a minute, as in a
  classroom where the dashboard stays open (the old list only scrolled at a minute's turn). Every layout is checked at
  `AT` (default 10:20, the list resting scrolled down). The schedule's own layouts (`sched-HHMM`: list and "now and
  next" at the default, smallest, 3 × 3 and a wide short size) are checked at each time in `SCHED_AT`: 07:30 (before
  school), 08:05 and 08:19 (the first period), 09:10 (the break), 10:20 (mid-day), 11:30 (the last period), 12:30
  (after school). A list now also fails when a row is sliced by its top edge while it rests scrolled down, or when it
  has rows above and no fade there; "more below" is what is below where it rests.

## Classroom dashboards: maths tools combined (16 Nov 2026)
Product: "Where possible let's consolidate these math widgets." The library's maths tools go from 21 to 13: eight tools
are now **modes** of another, chosen with a switch at the top of the tool (a segmented control like the timer's Timer |
Stopwatch). Each mode is the old tool, whole: its state, its one-line instruction, its own ⓘ help ("How to use Base-ten
blocks"), Make a question, Send to students, Practice it and the projector. Code: `TOOL_MODES`, `MODE_HOME`,
`cleanToolState`, `moveToolState` in `server/services/dash-tools.js`; `WIDGETS` (`toolType`, `modes`), `MODE_ICONS`,
`RETIRED`, `migrateWidget`, `registryFor` (`modes`), `toolOfPush` in `server/services/dash.js`; the wrapper
`public/js/dash-modes.js` (`moded`, `withModes`, `modeState`, `withMode`), used by `RENDER` in `public/js/dash-widgets.js`;
`ctx.practiceOf` and `toolName` in `public/js/dash.js`; `.dt-modes` in `public/css/dash.css`; strings
`dash.w.<tool>.m.<mode>` and `dash.tools.modeFor`.

| Tool in the library (type id) | Modes (the first is the tool's own) |
|---|---|
| Fractions (`fractions`) | Fraction bars (`fractions`: Compare, Add, Subtract, Multiply, Divide as before) · Fraction, decimal, percent (`fdp`) |
| Number line (`numline`) | unchanged (negatives were already there: −100 to 1000) |
| Coordinate plane (`coord`) | unchanged: its own tool (see below) |
| Place value (`placeval`) | Place value chart (`placeval`) · Base-ten blocks (`base10`) |
| Ten frames (`tenframe`) | unchanged (see below) |
| Number chart (`hundreds`) | one tool; Options: 1–100, 0–99 or **1–120** (new) |
| Multiply and divide (`area`) | Area model and arrays (`area`) · Times table grid (`times`) |
| Teaching clock (`tclock`), Coins and money (`coins`) | unchanged |
| Shape board (`geoboard`) | Geoboard (`geoboard`, the shape board as before) · Angle maker (`angle`) |
| Geometry (`pattern`) | Pattern blocks (`pattern`) · 3D shapes and nets (`solids`) · Transformations (`transform`) |
| Algebra (`algebra`) | Algebra tiles (`algebra`) · Balance scale (`balance`) |
| Data and chance (`chance`) | Chance lab (`chance`) · Graph maker (`graph`) |

- **Decided: the coordinate plane stays a tool of its own.** It is where slope and y = mx + b are taught (a table of
  values, rise over run): algebra and functions, not shapes. Transformations do happen on a grid, but on their own −8 to 8
  grid with a shape, its image and the rule; folding the plane into Geometry would hide y = mx + b behind a geometry
  switch, and folding transformations into the plane would give the plane two unrelated jobs. So Geometry has three modes
  and the plane stays where teachers look for it. 13 maths tools, not 12.
- **Decided: the angle maker is a mode of the shape board**, not a tool inside the board. The board's own Angles toggle
  already measures the inside angles of a band; the angle maker is a different lesson (two rays, a protractor, naming
  angles from zero to a full turn) and keeps its slider, presets and snapping only as a mode of its own.
- **Decided: Ten frames keeps its name and has no switch yet.** A switch with one button would be noise, and calling it
  "Counting frames" before the bead rack and two-colour counters exist would promise tools that aren't there. When they
  come they are entries of `TOOL_MODES.tenframe`: the wrapper, the state and the migration need nothing else.
- **Decided: the number chart's 1–120** is a third choice in its Options ("1–120": twelve rows of ten). The state gains
  `upto` (100 or 120, from 1 only), stored only when it is 120, so every chart saved before is stored exactly as it was.
  Skip counting and the question it makes go to 120.
- **The state.** A tool with modes keeps its own mode's keys at the top of its state, exactly as before; each other mode's
  state is under the old tool's id (`{ v, discs, dec, base10: { h, t, o } }`), and `tab` says which mode shows.
  **Decided: `tab`, not `mode`**: `mode` is already the fraction tool's Compare | Add..., the number line's whole |
  fraction | decimal and the coins' count | change. `cleanToolState` cleans the tool's own keys with its own spec and each
  mode's part with the old tool's spec (`TOOL_SPECS` keeps every old spec); `tab` is kept only when it is not the tool's
  own mode, and a part only when it differs from its start. So layouts and pushes saved before load and store unchanged,
  switching modes never loses another mode's work (each part is kept), and the shape board's student rule (no labels or
  drawings on a student's own screen) still applies in every mode.
- **The wrapper** (`moded` in `public/js/dash-modes.js`, about 100 lines): it draws the switch, then calls the old renderer
  of the chosen mode on the same widget body, with that mode's words, name and starting state, `keep` and `send` that put
  the mode's part back into the whole state, and that mode's Practice it games. Switching destroys the mode on screen
  (its help button and panel too) and draws the other; the switch is announced and keeps the focus. The renderers
  themselves are unchanged (the fraction tool's drawing in particular: a parallel fix is working on it).
- **Old widgets keep working, on read** (no migration, as for the stopwatch): everywhere a widget list is read (layouts,
  the class's pins, a student's own screen) or sent (`cleanWidgets`), a widget of a retired type becomes the tool it is a
  mode of **with the same id**, its state moved under its old id and `tab` set to it (`RETIRED`, built from `MODE_HOME`;
  `migrateWidget` takes a function of the old settings). Its box grows to the tool's smallest size and what it would now
  cover moves down (`migrateWidgets`). A browser that still sends an old type gets the same. `known()` would drop an
  unknown type, but no retired maths type is unknown: each is migrated first. **Sent copies:** `dash_pushes.data` is never
  rewritten; a push with an old type is read as `{ type: <tool>, state: { tab: <old>, <old>: state } }` (`toolOfPush`), so
  a student's tray opens it in that mode, and "Pin to my screen" keeps the whole tool. A new push carries the whole tool
  (every mode's part), so a student can switch modes on their copy too; it still stays in their browser.
- **Practice it** is keyed by mode (`PRACTICE` keeps the old tools' ids, which are the modes' ids); the page sends every
  key and `ctx.practiceOf(mode)` gives each mode its own games (base-ten blocks: Rocket Supply; times table: Sum Racer...).
- **The library**: one entry per tool, new names and descriptions in all 13 locales (en-GB only where its spelling
  differs: the "times tables grid"; its old descriptions of the shape board, pattern blocks, algebra tiles and chance lab
  were removed so the new English ones show). A mode's name on the switch is the old tool's name in that language
  (`dash.w.<tool>.m.<mode>`), so nothing a teacher knew is renamed inside a tool. Searching the library also finds a tool
  by its modes' names ("times table" finds Multiply and divide). A sent tool is named by its mode in the banner and tray.
- **Sizes**: each tool is at least as big as its biggest mode was, plus the switch's row: fractions 6 × 8 (smallest 5 ×
  8), place value 7 × 7 (6 × 6), multiply and divide 6 × 8 (5 × 8), shape board 8 × 8 (5 × 8), geometry 7 × 8 (6 × 8),
  algebra 7 × 7 (6 × 7), data and chance 7 × 7 (6 × 7). Smaller saved boxes grow when read.
- **Ready-made layouts**: none uses a retired type (the Lesson layout's number line is unchanged); tested.
- **Fit check**: `npm run dash:fit` has, on the tools' layouts, a widget per mode that was a tool of its own (with the busy
  state it had) and a 1–120 chart, at both sizes, on every view, in English, German and Arabic; each mode's ⓘ panel is
  opened.
- **Safety** unchanged: no AI, no network or storage in the wrapper (tested by reading it), students' copies stay in their
  browser, no prices.
- **Tests:** new `tests/unit/dash-math-merge.test.js`. Changed to the combined tools: `dash.test.js` (the tools a student
  may add), `dash-stage3.test.js` (the registry test: graph, base10, times and fdp are modes with renderers, students'
  old types are read as the tool), `dash-stage4.test.js` (the registry test for angle, solids, transform and balance; a
  mode's words come from its tool's `modes` in "Make a question" and the help tests; `MATH_TOOLS` is every mode of the
  Teach tools), `dash-shapeboard.test.js` (smallest size 5 × 8 and its modes).

## Classroom dashboards: tooltips never cut off; pattern blocks dragged from the palette (16 Nov 2026)
From the product owner's screenshots of the live site.
- **Tooltips were cut off.** The dark label a button shows on hover and keyboard focus (stage 4 review) was a `::after`
  drawn inside the button, so any box around it that clips cut it: the shape board's colour rail showed "ew band" for
  *New band* and the same for *Delete band*; the ✕ on an organizer step ("Take away Step 5") showed only the label's
  bottom edge under the top of its scrolling box. Every such button also had a native `title`, so the browser's own
  tooltip showed as well.
- **Fix at the root:** one tooltip for the page, `public/js/dash-tip.js`. It lives in a layer of its own (position: fixed,
  in `<body>`, or in the element shown full screen or an open dialog), is placed from the button's box (above it and
  centred; below when there is no room above; shifted to stay 8px inside the screen; `placeTip`, pure and tested), and
  follows its button while shown. It is hidden on scroll (a hover tooltip; one shown by keyboard focus follows its
  button), resize, Escape, a press, window blur, and when the button goes or is redrawn. `role="tooltip"`, and the
  button's `aria-describedby` points to it while it shows. A hover shows nothing while a button is held (a drag).
  Hover rules kept from the CSS: a button whose words show in full (`.dt-lbl`) names itself only on keyboard focus; a
  menu button that is open shows none. It never transitions (the reduced-motion rule gives every property a tiny
  transition, which left it where the last button was for a frame; the fit check caught it). **Touch:** never on a tap; a long press (half a second, finger still) shows it
  and it goes when the finger lifts.
- **No native title where the tooltip exists:** buttons get their tooltip through `tip(el, text)`, which takes away the
  `title` and keeps `aria-label` (the shape board's toolbar, rail, shapes and pens; stage 3 mode buttons; Practice it;
  Make a question; every icon button in the stage 4 tools; the organizer's ✕ and Add a step/detail; the pattern blocks
  palette). Buttons without a dark tooltip keep their native title.
- **Pattern blocks: drag from the palette, or tap.** A block in the palette above the board can be dragged onto the board
  with a mouse, finger or pen. Until the pointer has moved more than 8px it is a tap and adds the block at the first free
  spot as before (Enter too; `paletteDrag`, pure and tested). Then a lifted copy of the block, the size it will be on the
  board, follows the pointer with its middle under it; the board lights up and a dashed outline shows where it will
  land. Let go on the board: the block is added there, on the grid point nearest to where it was let go among those
  where the whole block is on the board, so its edges meet the grid and other blocks like a block dragged on the board
  (`dropBlock`, pure and tested); it becomes the chosen block and is announced. Let go off the board, Escape or a
  cancelled pointer: nothing changes. The palette and the board have `touch-action: none`, so the page does not scroll
  while a block is dragged. **Open:** the one-line instruction still says "Tap a block above to add it" (not changed in
  13 languages for this; it stays true).
- **Checks:** `tests/unit/dash-tip.test.js`. The fit check (`npm run dash:fit`, TIPS=0 skips it) focuses every button
  with a tooltip in turn on every view: its tooltip shows, whole inside the screen, clipped by nothing around it,
  describes its button, and the button has no native title. Driven by hand at 1600 × 900, the projector, a 1024 × 768
  touch tablet and a 390 × 844 touch phone (a student's own copy), English and Italian.

## Classroom dashboards: bar models and number rods (16 Nov 2026)
Product: two new maths teaching tools, "make sure these are both available for Math". Another company's screenshots were
used as a list of features only: the look, layout, colours, icons and words are our own, built from the dashboard tools'
parts, and nothing names or imitates another product (the rods are "Number rods" in every language). Code: the maths in
`public/js/dash-math5.js` (pure, tested); the renderers `public/js/dash-bars.js` and `public/js/dash-rods.js` (in `RENDER`
through `withModes` in `public/js/dash-widgets.js`); the questions in `public/js/dash-ask.js`; the state in
`server/services/dash-tools.js` (`TOOL_SPECS.bars`, `TOOL_SPECS.rods`, `rodEquation`, `NEW_MODES`); the registry in
`server/services/dash.js`; CSS `.dt-b*` and `.dt-r*` in `public/css/dash.css`; strings `dash.w.bars.*`, `dash.w.rods.*`,
`dash.w.area.m.bars`, `dash.ask.bars|rods` in all 13 locales. Tests: `tests/unit/dash-bars-rods.test.js`.
- **Where they are.** **Bar models** is a third mode of **Multiply and divide** (`TOOL_MODES.area`: Area model and arrays |
  Times table grid | Bar models); its state lives under `bars` like any other mode's, `tab: 'bars'` shows it. Bar models
  never were a tool of their own, so `bars` is not a retired type (`NEW_MODES`: no `MODE_HOME`/`RETIRED` entry).
  **Number rods** is a new tool (`rods`, Teaching tools: the library's maths group, students may add it, sent to
  students, never pinned). The library also finds a tool by its other names (`dash.w.<id>.find`, for a mode too):
  "bar model", "tape diagram", "rods", "number rods" and each language's own words.
- **Decided: the Math ready-made layout is unchanged.** It is full (fractions 5 × 8, the number line, help and timer
  fill 12 × 8 with no gap); neither tool fits without dropping or shrinking one below its smallest size. Both are one
  search or one chip away in the library.
- **Bar models.** Multiply/divide (groups × in each = total; 1-12 groups of 1-100), Part–whole (2-4 parts of 1-999 make the
  whole) and Compare (two bars of 1-999 and their difference, a dashed piece after the shorter one). Parts are drawn to
  scale (no part thinner than 7%, so a 1 beside 999 can still be read and tapped); when "how many groups?" is the
  question one group is drawn and the rest of the total is left whole. Any one quantity is the **?** (the "? = …" menu);
  "Hide answer"/"Show answer"; a stepper never shows the hidden number (it reads "?"), nor does Options. Braces (in
  Options): over the whole and under one part (Compare: under the difference). − and + change groups and in each, the number of parts and the
  chosen part (tap a part; arrows and +/− on it too), or the two bars; Options types them exactly and sets the biggest
  number for **New problem** (10-1000, default 50), which makes a random problem of the same kind and a random ?.
  **Number sentences** under the model: □ × □ = □ and □ ÷ □ = □; □ + □ (a box a part) = □ and □ − □ = □; for Compare
  □ − □ = □ and □ + □ = □. Each is checked once its boxes are filled: any order the maths allows is right (4 × 3 and
  3 × 4), ✓ and "Yes! That matches the model." or ✗ and "Not yet. Look at the model again." (never red). The numbers typed
  stay in this page only (never kept or sent; a sent copy never carries the teacher's answers). The sentences are not
  rebuilt while someone types (a redraw keeps the focus). **Word problem**: a text box ("Write a word problem that
  matches your model.", 240 characters).
- **Number rods.** A 30 × 16 unit board; rods 1-10 in a palette, each its own colour (our own ten; light rods take dark
  numbers, dark ones light) with its number and unit marks, so colour is never the only cue; a longer rod (11-20, a
  stepper beside it; one colour with a strong mark at ten). Tap adds a rod at the first free place; drag puts it where
  it is let go (the pattern blocks' palette drag: `paletteDrag`, a lifted copy, the board lit, a dashed outline where it
  lands). On the board: drag to move, Turn, Copy, Delete; rods snap to the unit grid and to another rod's end within ¾
  unit on the same line (`snapRod`), so trains join. **Trains** are rods end to end on one row (or column); the chosen
  rod's train shows a ruler and its total, and the readout says "6 + 3 = 9". New rods lie or stand (orientation), Grid,
  Unit lines, zoom (100-300%, a drag on the empty board pans; Ctrl/⌘ + wheel), Undo/Redo (60 steps, this page), Reset.
  A rod longer than 16 can only lie down. At most 60 rods.
  **Equation**: "5 + 4 = □ + 3" above the board (each side 1-3 terms, at most 20 long, one box); New equation (random,
  terms 1-10), Type an equation ("5 + 4 = ? + 3", parsed: + and whole numbers only, so nothing typed is free text), the box
  answered and checked (✓ "Both sides are 9 long."). **Show trains** puts each side's known rods as a train (A over B)
  and a dashed "?" gap where the missing rod goes; the readout compares the two lengths, and a rod laid in the gap fills it.
  Standing trains too tall for the board lie down.
- **Both:** the one-line instruction and the short ⓘ help (three points, one "Try:" idea; the help tests), tooltips by
  the shared `tip()` (no native titles in these renderers, tested), the projector (bigger numbers, ⓘ hidden), phone,
  tablet and desktop with pointer events (captured), `touch-action: none` on the board and the palette, 44px targets,
  keyboard (palette: Enter adds; board: arrows move the chosen rod, Shift+arrows by 5, R turns, D copies, Delete removes,
  [ and ] go from rod to rod, Escape lets go, Ctrl/⌘+Z and Ctrl/⌘+Shift+Z or Ctrl+Y; bar parts: arrows choose, +/− change),
  aria labels and changes said in the polite live region. Make a question: the bar model's ? as a sentence ("12 ÷ 3 = ?",
  wrong answers from adding instead of multiplying, one off...) and the rods' box ("5 + 4 = □ + 3", the slip: the other
  side's total). Practice it: Sum Racer for bar models, Lily Hop for number rods.
- **State.** `bars`: `kind`, `g`, `e`, `p` (2-4 parts), `ca`, `cb`, `unk`, `hide`, `bw`, `bp`, `max`, `story`; an untouched bar
  model stores nothing (the mode's part is kept only when it differs from its start), so every Multiply and divide saved
  before loads and stores exactly as it was (tested). `rods`: `rods` ({ n, x, y, v }), `dir`, `grid`, `units`, `long`, `eq`,
  `l`, `r` (0 is the box), `model`; an equation the board can't model goes back to 5 + 4 = □ + 3 (`rodEquation`, the
  browser's `eqValid`, tested to agree). Zoom, undo and typed answers are this page's only.
- **Privacy.** The word problem on the teacher's tool is teacher text (their layout; the copy they send). On a student's
  sent copy it stays in that browser; on a student's own screen the renderer leaves it out of what it keeps and the
  server drops it too (`cleanToolState(..., { student: true })`, tested), so nothing a student writes reaches anyone. No
  free text in number rods. No AI, network or storage in the renderers (tested); no prices.
- **Sizes:** number rods 8 × 8 (smallest 6 × 8). **Multiply and divide grew to 7 × 8 (smallest 6 × 8)**: with a third mode
  its switch wrapped to two rows at 5 columns in German, which squeezed the times table grid on the projector and left
  no room for a bar model's sentences (the fit check). Smaller saved boxes grow when read (`migrateWidget`), as before.
  Bar models keep their controls few: the braces are in Options, the word problem's box is named by its placeholder,
  the steppers drop their words on a narrow tool and New problem is an icon (named by its tooltip). On a short widget
  (a tablet's 8-row layout) the model keeps at least 120px and the widget's own "More" scrolls the rest.
- **Also:** the fractions Add/Subtract instruction said "The answer is drawn below." but in circles the answer is to the
  right: now "The answer is drawn too." in all 13 languages.
- **Changed tests:** `dash-math-merge.test.js` (the maths tools are 14 with number rods; Multiply and divide's modes end
  with Bar models; `RENDER` wraps `{ ...TOOLS, ...TOOLS4, bars, rods }`), `dash.test.js` (a student may add number rods).
  No assertion was weakened. The fit check has three busy bar models (12 groups of 100 with a long German word problem,
  four parts 999/1/250/7, 999 against 1) and two busy number rods (the board full with 60 rods and the equation, standing
  trains) plus the tool's own busy state, on every view.

## Sum Spotter: spot the number two others make (16 Nov 2026)

The owner asked for a new official seed game on the "find the sum in a group" idea, made our own: never the name or
layout of the published puzzle that inspired it, never its puzzle sets or wording.

- **One game, six levels and two modes** (`seed-games/sum-spotter.html`, `SumSpotterCore.LEVELS`): number stones in
  Pip the frog's pond, two staggered rows of stepping stones (no center number, no ring of petals). Sums to 10 and to
  20 (4 stones), Sums to 50 (5), Sums to 100 (5 or 6), Times (the product of two others, factors 2 to 10) and Mixed
  (plus or times, the operation named in the question), 8 puzzles each with stars. Rush: 60 seconds on the game clock,
  the puzzles ramping through the levels. Practice: any level, endless, no clock and no stars.
- **Exactly one answer, by construction and by test**: puzzles are made in the game from a seed, never stored. A group
  is kept only when its numbers are different, exactly one member is made from two OTHER members (in Mixed by plus or
  times, so neither operation gives a second answer) and no member is another doubled or squared (8 next to 4 reads as
  4 + 4). `tests/unit/sum-spotter.test.js` checks 3,000 puzzles a level and the Rush ramp with its own brute-force
  checker. Sums to 10 with 4 stones has only a few dozen fair groups; order and placement keep it fresh.
- **Gentle help**: a wrong tap shakes the stone and Pip says no two other numbers make it (always true); a second
  wrong tap on the same puzzle shows the pair. Hints show one number of the pair, then the other, in the sum under the
  pond (? + ? = ?). No prices or upsells.
- **On the Learn shelf** as math, grades 1 to 5 (`learn.js SHELF_INFO`, `LEARNING`), next to Sudoku in the lists. Its
  shelf for existing databases comes from a new migration (`0082_sum_spotter_shelf`); 0062 is left as it was. The AI
  voice reads the title, the how-to cards and Pip's fixed lines, never a line with the stones' numbers.
- **Open:** a native speaker's read of the new translations and game titles (each language has its own title, as
  Sudoku's do), and whether Rush deserves a leaderboard of its own.
## Preferred sources link on the landing page footer
The landing footer links to Google's preferred sources deeplink (`https://www.google.com/preferences/source?q=oomba.ai`) so visitors can mark oomba.ai as a source they prefer in Google Search. A plain link with our own styling, not Google's button script: no third-party script on the page and no Publisher ID needed. It sits only on the adult-facing marketing page, never in play or kid screens. Label in all 13 languages (`landing.footer.preferredSource`).

## Class dashboards on the landing page (16 Nov 2026)
Owner: "update the marketing site to showcase the new dashboards."
- **Where:** a section on "/" (server/routes/landing.js, `#dashboards`) right after the Builder, laid out like the live
  games section: the words on one side, the teacher's screen with a student's phone screen on top of it on the other.
  Words under `landing.dash.*` in all 13 languages (en-GB only where the spelling differs: Maths, timetable). Only what
  the code does: more than 50 widgets (55 in `WIDGETS`), the five ready-made layouts, the tools named in the registry,
  pinning to student screens and sending a game, lesson or link, no AI, Oomba names, and what a student types staying in
  their own row ("Classroom dashboards, stage 1"). Dashboards are free, so the button is the usual trial button.
- **Top bar:** the "Dashboards" link (`.lp-nav-wide`) shows only from 1500px wide, where it fits beside the others in
  every language; narrower, the section is reached by scrolling. Measured while adding it: in German, French, Russian,
  Dutch, Spanish and Italian the bar was already wider than the window at 1180 to 1280px (Russian to 1440px) without
  it. Not changed here.
- **Pictures:** real captures by scripts/how-shots.js (`--only dash`): Ms. Rivera's demo class on the "Morning start"
  layout, three demo students' moods checked in, the teacher's screen (desktop) and Pixel Panda's own screen
  (phone), with the usual price and demo-name checks. So the clock and "now and next" show a school morning on any day
  the script is run, the server for these shots runs with its clock moved ahead to 9:20 in New York on the next
  weekday (scripts/how-clock.mjs, loaded with `--import` by the script only, never by the app), and the browser's clock
  and time zone are set to match. The structured data lists the teacher's screen as a screenshot and the section's
  heading as a feature.
- **Checks:** tests/unit/teacher-landing.test.js (the section, its pictures, translated in de, ar and ja);
  `scripts/landing-audit.js` passes at all six sizes, dark and light.

## Class dashboards walkthrough video (16 Nov 2026)
Owner: "Build a beautiful walkthrough video … make it look like an actual class and make sure the new default layouts
are shown. Make the name Ms. Haberle's."
- **How it is made:** `npm run dash:video -- --out dash-walkthrough.mp4` (scripts/dash-video.js). The real app on a
  throwaway in-memory database, driven by Playwright, recorded with Chromium's screencast (Page.startScreencast, JPEG
  frames with their times) and put together with ffmpeg: each part at a constant 30 fps, then the parts joined with
  short cross-fades; 1920 × 1080 H.264 with faststart. `--peek dir` saves a still of every step; `--keep` keeps the frames.
- **The class:** Ms. Haberle's Class (grade 4) at Maple Grove Demo School with 22 students, shown only by their Oomba
  names as dashboards always do (the roster names are placeholders and never appear). The day runs as a class would:
  16 moods checked in, a thumbs quick check answered by 18, hands up in the help queue, groups made, team points, the
  voice meter on Chromium's fake microphone, the timers, the wheel and the dice.
- **What it shows:** her everyday screen; New layout with all five ready-made layouts (each one pointed at); then each
  of them made in turn (Morning start, Lesson, Group work, Quiet work, Fun break) with every widget on screen and in
  use; switching back in one tap; a student's own screen on a phone (pinned widgets, a mood tap, a game sent to every
  screen); an end card. No prices.
- **The frame:** a stage page (a Playwright route, never served by the app) holds the dashboard in an iframe with a
  caption band and title cards, and draws the pointer and its click rings. In the recording browser only, the
  dashboard page's `X-Frame-Options: DENY` and `frame-ancestors 'none'` are relaxed to same-origin so the stage can frame
  it, and the video widget's host answers with a plain, unbranded stand-in (as scripts/dash-fit-check.js does).
- **A school morning on any day:** the script starts itself again with its clock at 8:50 in New York on the next
  weekday (scripts/how-clock.mjs) and sets the browser's clock and time zone to match, so the schedule shows "Morning
  meeting, then Math".
- The video file is not in the repo (it is large and is remade by the script).

## Dashboard layout tour on the landing (16 Nov 2026)
Owner: "make some sort of cool parallax that shows all of the different dashboards and everything it offers."
- **Where:** a section on "/" right after Class dashboards (`#dash-tour`, server/routes/landing.js): every ready-made
  layout (services/dash.js `LAYOUT_TEMPLATES`, so a new one shows up by itself) with its real screenshot, its name and
  description (the app's own `dash.tpl.*` words), and chips for its widgets; then "55 widgets to build your own" with
  every widget in `WIDGETS` (the app's `dash.w.*.name`). New words: `landing.dtour.*` in all 13 languages.
- **Motion** (public/js/landing.js `startTour`, on screens at least 1000 × 620 with motion allowed): the section stays on
  screen (sticky) while the page scrolls through about 78vh per layout; the layouts come forward like a deck (the next
  ones stacked behind, lifted and dimmed; the one leaving tips back and lifts away), each resting a moment in front, with
  its words beside it and an icon row for where you are. The widget rows slide sideways in opposite directions as the
  page scrolls, placed so it works right to left too. Transforms, opacity and a brightness filter only, one frame per
  scroll burst, passive listeners.
- **Without it** (no script, reduced motion, or narrower than 1000px): a plain list, each layout's words beside or above
  its picture, and the widgets as a wrapped cloud. Everything is in the page as sent.
- **Pictures:** `dash-layout-<id>` from scripts/how-shots.js (`--only dash`), 1600 × 1000 CSS px saved 2048 wide, each
  layout in use by the demo class (moods, a quick check answered, the help queue, groups and points, the timers, the
  wheel and dice, the video widget with a plain stand-in as the walkthrough video has).
- **Checks:** tests/unit/teacher-landing.test.js (every layout and its picture, every widget once, the count, translated
  in Arabic, no `.is-tour` in the page as sent); landing-audit passes at all six sizes, dark and light; looked at in
  English, Arabic (right to left) and on a phone, with reduced motion and without JavaScript.
## Classroom dashboards: layouts on a phone (16 Nov 2026)
Product report: "On mobile I can't shift between the different dashboards." Tapping a layout chip did switch, but on a
phone (one column, under 720px) the footer with the chips, New, ⋯, Eyes up and Push to students sat below every widget, at
the end of a very long page. Code: `placeSwitcher` in `public/js/dash.js`, the `.has-topswitch` rules in
`public/css/dash.css`, the `#dash-switch` wrapper in `server/routes/dash.js`.
- **The switcher moves to the top.** On screens under 720px (the width where the page turns into one column) the layout
  switcher (the chips, ➕ New and ⋯) is a row of its own right under the top bar, stuck to the top of the screen while the
  page scrolls. The chips scroll sideways in one line; the layout on screen is the dark chip and is kept in view (only
  the row scrolls, never the page); each edge fades while there is more that way. 44px targets. The "Layout" label and
  the word "New" are kept for screen readers only, so the chips get the room.
- **Decided: a chip row, not a "Layout: Morning start ▾" button with a sheet.** Switching stays one tap, the six or more
  names are visible and the row is the same control as on wider screens; a sheet would add a tap each switch and hide
  which layouts there are. The row is about 60px.
- **Eyes up and Push to students** stay in the footer, which on a phone is a bar stuck to the bottom of the screen
  (with `env(safe-area-inset-bottom)` for the iPhone's home bar); the two buttons share its width and wrap their words
  in long languages. Each control is in one place only: the same elements move, nothing is copied.
- **Sticky, not fixed:** both bars take their own room in the page, so at the top of the page the switcher sits on no
  widget and at the end the bottom bar sits on none. `scroll-padding` keeps a focused control clear of both.
- **Edit mode on a phone:** the footer is hidden as on every screen; the switcher stays (switching chooses which layout
  is edited, and the edit bar's name field follows) but is not sticky there, so it never covers the edit bar or a
  settings field. Rename in the edit bar works as before.
- **Accessibility:** the chips are buttons in a `nav` labelled "Layout" (the existing string), the one on screen marked
  `aria-current` (was a group with `aria-pressed`, on every screen); a switch is still announced ("Layout: Fun break").
- **Unchanged:** 720px and wider (tablet in landscape and portrait from 720px, desktop, projector): the footer is laid out
  exactly as before (the wrapper adds no box; checked element by element against the previous version). Students have
  no layout chips and nothing of theirs changed. No new strings.
- Tests: `dash.test.js` (the markup, one of each control, nothing for students). `npm run dash:fit` has a teacher phone
  (`teacher-phone`, `teacher-phone-dark`, 390 × 844): the switcher and the Eyes up / Push bar are on the first screen, the
  chip on screen is in view, every control is 44px, the switcher stays at the top when scrolled, and at rest neither bar
  covers a widget.

## Classroom dashboards: timer, one digit size, inside the ring (16 Nov 2026)
The product owner, from a phone (Fun break layout, ring view at 3:00): "I don't like how this changes sizes depending on
the number of minutes. Let's make the outer circle larger so it can house bigger numbers and make the size consistent
for all single and double digit numbers." Cause: the ring had no size of its own. It was a square grid around the
digits, so where the widget's height is not fixed (a phone, where each widget is as tall as its content) the ring was
only as wide as the time ("3:00" a small ring, "10:00" a bigger one) and the time ran over the ring on both sides; on
wide screens the ring took the height left but the digits were sized from the widget, not from the ring, and their box
reached past the inner circle.
- **The ring is as big as the room left** under the Timer | Stopwatch switch and above the quick times and Start: its
  area (`.dw-ring`) takes all the height left and is a size container; the circle is `min(100cqw, 100cqh)` of it. On a
  phone the area is given a height (76% of the widget's width, at most 340px). The ring is now r 45, stroke 8 (was 44
  and 9), so its inner circle is r 41 of 100.
- **One digit size for every time to 99:59**, sized from the ring alone: `0.25 × the ring`, which fits the widest
  case, "88:88" (2.62em × 1.18em with its line box in Bricolage Grotesque 800, tabular figures), inside the inner circle
  with room to spare. Times with hours step down once, to `0.195 ×` (fits "8:88:88"), decided by the run, not the text:
  a countdown of an hour or more keeps the smaller size all the way down; a stopwatch steps down once at 1:00:00.
- The digits view already sized the time from the widget only (tabular figures, never from the text); it is now
  checked too.
- Tests: `dash-timer.test.js` (the rules and the sums). `npm run dash:fit` has three timer layouts (`timer-default`,
  `timer-min`, `timer-big` for Quiet work's 6 × 7; `SIZES=timer` for only these) with timers paused at 0:05, 9:59, 10:00
  and 59:59 in the ring, the digits and the stopwatch, plus 1:05:00 and the Fun break's 3:00 ring: in each group the
  time has one font size, and on every view any ring's time box lies inside its inner circle (2px to spare).

## Landing: the whole class day (17 Nov 2026)
Owner: "I'm unable to navigate to the dashboard page on mobile. I also think this needs to be part of the main landing
page. Set up your classroom dashboard, use it to run your day to day, build games to augment learning, play live
games, have your kids build games too. Make it better than that."
- **Phones could not reach any section:** below 1120px the top bar hid its links and had no menu. Now a menu
  (`#lp-menu`, a `<details>` so it opens without script; public/js/landing.js closes it on a choice, Escape or a tap
  outside) lists every section in story order, with Sign in and Just Play. The links sit in the bar only from 1366px
  (Dashboards first; "How it works" and "Students build" are menu-only), which also ends the bar running wider than
  the window in German, French, Russian, Dutch, Spanish and Italian at 1180 to 1440px (measured: no overflow in any of
  the 13 languages from 320 to 1600px). Below 900px Just Play leaves the bar (it is in the menu), so nothing wraps.
  The app's own dashboard links were checked on a phone and were fine ("Class dashboard" on the class page, "My
  dashboard" for students).
- **The story:** the hero is now "One screen to run your class. Games to make it stick.", its picture the real class
  dashboard with a student's phone and two cards (a game the Builder just made, a live game starting) at their own
  depth. "How it works" is the class day in five linked steps: set up your class dashboard → run your day from it →
  turn lessons into games → play live together → let your students build too, joined by a line that fills as the page
  scrolls. The sections follow in that order: Class dashboards, the layout tour, the Builder (now with the lesson → game
  loop that was in the hero), live games, and a new "Your students build games too" (`#kids`: the "Build a game" lesson
  step, with the Studio screenshot), then the teaching loop, courses and the rest as before.
- **Words:** every new line in all 13 languages (hero, meta title and description, under 160 characters, the five
  steps, the students section, the menu); the dashboards lead now gives the real widget count (48 since the maths tools
  were combined) instead of "more than 50"; the maths line names tools that still exist. The share card
  (public/og/landing.jpg, scripts/og-images.js) has the new heading and "Class dashboards" first.
- **Pictures:** scripts/how-shots.js now takes the six layouts a first visit makes (Math included) instead of making its
  own, so the tour shows all six.
- **Checks:** tests/unit/teacher-landing.test.js (the sections in order, five steps that each go to a section, the menu
  with every section and no script needed, the dashboard in the hero and the loop in the Builder section);
  landing-audit passes at all six sizes, dark and light (layout shift 0).
- The walkthrough video (scripts/dash-video.js) still opens on the old "Everyday" starter and makes its layouts from the
  New sheet; with the six made on a first visit it should switch between them instead before it is made again.

## A quieter top bar (17 Nov 2026)
Owner, with a screenshot of a school admin's header: "This is also too busy. Let's move light and dark mode under
settings. Remove School because you can just click that when you click into the icon on the right to open up your
account. Also move Plans to Settings as well"
- **The avatar opens an account menu** (`accountMenu` in server/views/layout.js), signed in: Me (a grown-up has no Me
  page, so no Me item), My school (school admins only: `adminSchools`, /school), then **Settings**: Theme (Same as my
  device, Light, Dark), Plans (adults only, see below), All settings (`/me/settings`, or `/family/account` for a
  grown-up). A `<details>` of plain links like the 🌐 picker, so it opens and picks with no JavaScript; public/js/app.js
  adds Escape, outside-click and arrow keys, and the theme links switch at once (`data-theme-choice`). The avatar was a
  plain link to /me before; that page is the menu's first item now. Signed out (and guests) the avatar is still the
  Sign in link.
- **Gone from the top bar and the phone tab bar, for every role:** the ☀️/🌙/🌓 theme menu (`themePicker` is replaced by
  `themeLinks`), 🏛 School and ⭐ Plans. The school pages make Me current (`currentTab`). The 🌐 language picker stays.
  A school admin's bar is Classroom · Learn · Play · (Live); their phone tab bar Classroom · Learn · Play · Me.
- **Plans: adults only** (`plansInMenu` = `legalReader` and `familiesOn`: grown-ups, school staff and the platform admin,
  while paid-plan pages are on). Kids and students no longer have a Plans link anywhere (until now everyone had one,
  per "Plans page and the Basic plan" of 2026-10-27); /plans itself still opens for anyone and still tells a kid that a
  grown-up buys plans. Prices stay on /plans only: the menu and the settings pages show the word Plans and a link.
- **Signed out** (no account menu): the bar is Play · Learn · Build · Parents · Teachers (tab bar: Play · Learn · Build ·
  Grown-ups · Sign in). Plans moved to the footer (while `familiesOn`), next to the landing page's pricing section and
  footer link and the Plans buttons on /parents and /teachers, so a signed-out grown-up still reaches pricing from every
  page. The theme moved to the footer as plain links, like the landing footer's theme switch.
- **Settings pages:** `/me/settings` gains a Plans section for staff and the platform admin (`plansPanel`); a
  grown-up's `/family/account` gains Appearance (the same theme form) and Plans.
- **Words:** one new string, `layout.acct.allSettings` ("All settings"), in all 13 languages; the rest reuse
  `me.settings.title`, `layout.theme.*`, `me.tiles.school`, `nav.plans` and `family.page.seePlans`.
- Tests: tests/unit/nav-roles.test.js (every role's bars, the menu's items per role, the footer signed out, the settings
  pages), plans.test.js, home-doors.test.js, nav-doors.test.js; tests/e2e/theme.spec.js drives the footer links and the
  account menu with and without JavaScript.
## Number Quest: each level is its own street, on screen and in every count (17 Nov 2026)
- Owner: "I am not seeing the difference between Pro and Explorer. It also says I have completed both Pro and Explorer even though I have only completed the Explorer."
- Root cause 1 (look): the band switch worked (the choice is saved for a signed-in learner, grown-ups switch by `?street=`), but everything above the fold was the same on every level: the same "Number Quest · grades K–8" title, the same course-wide Tally Marks and daily goal, a "New here?" line even after a finished street, and the count. The level name and the units only showed far down the page, in a small chip row. Fix: a level banner right under the title (`#nqp-band`: "Your level" or "Now showing", the level's name and grades, its district, "Units 1–7, then the finale: <its finale>") with the level switcher inside it, one accent per level (Launchpad green, Explorer blue, Pro purple, mixed into the theme's card color so both themes work). "New here?" shows only to a learner with no step done on any street.
- Root cause 2 (completion): display only, nothing stored wrongly. Progress was always per step key (`explorer-1.1`, `pro-1.1`) and every count was per band, but each count was printed bare ("23 of 23 steps done") under a K–8 course title, on the course page and on the Learn tab's course card, so finishing Explorer read as finishing the whole course; the teacher's class view showed one status for the course (the current band's) without saying which band, so a student who finished Explorer and moved to Pro dropped to "Not started". Fix: every count names its level (`courses.band.stepsDone`: "Explorer: 23 of 23 steps done"), and `classCourseProgress` returns `bands` (each band the student worked in, with its own status, count and score) so the class view lists "Completed · Explorer" and "Pro: 0 of 23 steps done" side by side. No migration: no stored row was wrong (`course_progress.band` and the step keys always match), and a migration could only have risked real progress.
- Pinned by `tests/unit/number-quest-band-scope.test.js` (fails on the old pages, passes now).
## Fraction Factory: add the second cake first, and an order fits the frame (17 Nov 2026)
Owner, on Recipe Math order 6 (5/4 of a cake): "it was confusing how you got to two different cakes. You had to click
the cut into 4 button and then the second cake appeared ... Also, on my normal screen without full screen mode, I had to
scroll down a bit to select the right cut."
- **Add a cake:** every order starts with one whole on the table. An order of more than one whole (`goal.wholes > 1`,
  any level, not only rc-6) shows a dashed "+ Add a cake" card beside the last cake, up to the wholes the order needs;
  the extra cake has a Remove button (its parts leave the tray with it). A slicer never adds a cake any more. Engine:
  `Run.s.wholes`, actions `add-whole` / `remove-whole`, the advice script adds the cake before it cuts.
- **One slicer cuts every cake.** Simplest for kids (one tap, not one per cake) and the part size stays one number, so
  fourths stay fourths and 5/4 is still read as five of one size; a cake added after the cut comes in with the same cut.
- **Feedback:** a full table that is still short of the order says `why.more-wholes` ("One cake cannot hold that many
  parts. Tap Add a cake ..."); too few, too many and the wrong cut keep their lines. The rc-6 intro and hints name the
  button. The spoken block carries the new lines, so tts-lines warms them with no registry change. Like every other
  intro, hint and button in this game they are English only; only the how-to cards are in the 13 languages (#350).
- **Fit:** the order screen sizes cakes and bars from the frame's height and width (`--ff-cake`, `--ff-bar`,
  `--ff-mini` with clamp/min and vh/vw), starts right under the kit's HUD row on short or narrow frames (66 px, not the
  140 px band), and on a wide frame (aspect 13:10 or wider) puts the slicer, the tray reading and Serve/Hint beside the
  wholes. Every level, at its start and with the order built, was measured with no scroll at 1000x504, 1280x560/650/720,
  1366x620/768, 1440x780/900, 820x1180, 1180x820, 390x844 and 844x390. Below 440 px tall the slicer tip line hides
  (the intro says the same). Checks: tests/unit/fraction-factory-add-cake.test.js.
## Classroom dashboards: fraction, decimal, percent cards on a phone (17 Nov 2026)
On a phone (390 × 844) the Fractions widget's "Fraction, decimal, percent" tab drew its three cards 16px wide: "8/12 =
2/3" stacked one character a line and the decimal and percent were tiny. Cause: under 720px `.dt-fdpwrap` is a column
(`align-items:center`), so `.dt-cards` was only as wide as its content, and each `.dt-card` is an inline-size container
(for its `cqi` font sizes), which gives it no content width at all: the grid shrank to the cards' padding. On wider
screens the model area has a fixed height and the `@container (max-aspect-ratio:7/5)` rule already gave `.dt-cards`
`width:100%`; on a phone the stage is an inline-size container only, so that aspect-ratio query never applied.
- **Fix:** in the phone block (`@media (max-width:719px)`) `.dt-cards` is `flex:none; width:100%`, one card a row, so
  each card is the tool's full width and its text is sized from that (up to 2.6rem). Laptop, student and projector are
  unchanged (the rule is phone-only).
- **Check:** `npm run dash:fit` now fails when a fraction, decimal, percent card is under 96px wide, or when the cards
  sit over the hundred grid (the column layout) and are narrower than the tool.

## Build page: no starter cards (17 Nov 2026)
Owner: "lets get rid of the start in a world and start from sections here because this is a bit redundant with the
walkthrough now available." The Build page (`/build`) showed two grids of cards above My games: "Start in a 3D world"
(the twelve Kit 2 worlds) and "Start from" (the classic templates). The setup steps behind "New game" (`/build/new`,
"Help me choose" or "I know what I want") already offer the same starts, so the page now has the "New game" banner and
My games only.
- Removed: both sections (server/routes/studio.js), their click and "Needs a newer device" code (public/js/build.js),
  their styles (`.tplgrid`, `.tplcard`, `.tpl-*` in public/css/studio.css), and the keys only they used (`build.worlds`,
  `build.startFrom`, `build.startFromLabel`, `build.startInLabel`, `build.twoPlayers`, `js.build.needsNewer`) in every
  language and in notes.json. `POST /api/studio/new` with a template or world is unchanged (the setup steps use it).
- The empty My games text no longer says "or pick a starter above": "Tap “New game” to start one." in all 12 languages.
- Tests: builder-http checks the cards are gone; the e2e helper `templateGame` (and accounts.spec) now make the game
  with `POST /api/studio/new` instead of clicking a card.

## Landing: the teacher screens under Google Classroom (17 Nov 2026)
Owner: the three teaching-loop screenshots on the landing looked out of place, with one alone on its row, and fit
better under Google Classroom. Done in #389 (the gradebook and feedback screens under Classroom when it is on, none in
the loop; with Classroom off they stay in the loop). This branch had made the same move with all three screens three
across; on merging, #389's version was kept. What stays from this branch: teach-loop.test.js's check of where the loop
sits now follows the class-day order (after "Your students build", before courses), which had gone stale on main.

## Host a live game in steps (17 Nov 2026)
Owner: "The host a live game page is not super well put together. Make it more like the builder process." `/live` was
one long form: seven game cards, then question sets, who can join, most players, teams and settings, with several
dropdowns and inputs left unstyled (thin native controls).
- **Steps, as in the Builder's setup (`/build/new`):** 1 What do you want to play? → 2 Which questions? (or "Set up the
  game" for Would You Rather, Atlas Quest, Tug of Math and Doodle Hoot, which make their own) → 3 Who is playing? →
  4 Ready to open the room: one row per choice (game, questions, who can join, teams) with Change, Game settings
  (closed), and "Open the room". A game that asks no questions has no step 2 (three steps). The progress dots, "Step n
  of N", the card look, the tabs, the review rows and the sticky Back / Next bar are build-setup.css's (the page loads
  it); live.css only adds what live needs (`.lv-wiz`).
- **Cards:** each game is a card like the Builder's: its emoji in a picture box, name, line, who it is best for and
  "Made for teams", a tick when picked; three across, two on a tablet, one per row with the emoji beside the words on
  a phone. When there is more than one group (Live games, Oomba Academy games, My games, Shared with my classes), tabs
  show one group at a time. "Who can join" is two or three big cards. Every select and number box uses `.input`.
- **Same form, same API:** every field keeps its name and id and stays in the one `#lv-new` form; a step only shows
  and hides its part (public/js/live-sets.js `steps()`), so `/api/live/sessions`, the remembered settings, lesson and
  class links (`?class=`, `?game=`, `?mode=`, `?starter=`) all work as before. Opened with a game already chosen, the
  page starts on the next step (its questions, or who is playing). Enter in a field goes to the next step; it opens
  the room only on the last one. Without the script a noscript style shows every step and the form posts as before.
- Tests: live-pages.test.js (the four steps in order, one form, the first step for each kind of link, the noscript
  fallback). The e2e specs that open a room from the landing walk the steps with `liveStep` / `openLiveRoom`
  (tests/e2e/helpers.js).

## Classroom dashboards: type the number between − and +; settings from the board (17 Nov 2026)
Two requests from the owner: "set the numbers manually here instead of only being able to + or −", everywhere that is
the case, and "edit settings of individual widgets on a board without having to go into the broader edit menu".
- **One shared field** (`public/js/dash-num.js`, `numField`): every number shown between − and + on the board is a text
  field (`inputmode="numeric"`, the ordinary keyboard where a value can go below zero or is a slope like "1/2"; role
  spinbutton with its own aria-label; no browser spinners). It looks like the number it replaces (same class, same size,
  as wide as what it holds) with a faint dashed underline; a box shows on hover and while typing; 40px tall at least.
  The tools get it through the shell (`T.stepper(..., num)` and `T.num`), so `snap`/`restore` keep the tool's state as
  it was when typing began.
- **Rules:** a value inside the limits is used while typing; Enter or leaving holds it to the limits (150 in 1-100 is
  100); Escape and an entry that is empty or not a number put back the value from before typing; ArrowUp and ArrowDown
  are the + and − buttons' own steps. **Decided:** a rule that ties two numbers together is applied to the state as it
  was when typing began, so typing 12 into a denominator of 50 passes through 1 without leaving the numerator at 1;
  typing 7 does bring a numerator of 8 down to 7 (as − does). A widget that draws itself again while typing (the
  fraction sentence, the scoreboard) hands the typing (text, caret, the value from before) to its new field.
- **Same path as the buttons:** each field calls the same change the buttons do (`T.commit` and `ctx.keep`, or
  `ctx.set` for the scoreboard), so typed values are saved in the layout, sent to students with Send and cleaned by
  `server/services/dash-tools.js` as tapped ones are.
- **Where:** Fractions: fraction, decimal, percent (numerator 0 to the denominator, denominator 1-100), fraction bars'
  parts (1-12; "4 parts" keeps its translated words around the field), Add/Subtract/Multiply/Divide numerators and
  denominators (the operand limits; dividing never by zero); the coordinate plane's slope (typed as one of the slopes
  the buttons step through, by value: "2/4" is 1/2) and start (−10 to 10); arrays and area rows and columns (1-99);
  base-ten blocks' count per mat (the number in the mat's header, 0 to the most a mat holds); bar models' two steppers
  (whatever they change in each kind; a hidden "?" can't be typed in); number rods' longer rod (11-20; the rod button
  moves after +); the angle maker (0-360°, any whole degree; − and + keep the Options step); transformations x and y
  (−8 to 8); money's cost (0 to what was paid) and paid with (the cost to 100.00, any amount; − and + still step through
  the notes), typed in the money's own units; the scoreboard's points (−9999 to 9999).
- **Left as they are, on purpose:** the place value chart (− and + change the selected place, each place is already a
  spinbutton with arrow keys); the teaching clock (±5 and ±1 hour are jumps, the hands drag and the face takes arrow
  keys); each student's points (+1 is an award with a reason, never typed or taken away); algebra tiles and the balance
  (+x, −1... add tiles or are a step in solving); zoom −/+ on the camera, the rods board and the shape board (no number);
  the timer (presets and a typed custom time already), dice count, random number range, group size and every other
  number in the settings panel (already number fields).
- **Settings from the board:** on the teacher's screen, out of edit mode, a widget with settings (a field, or "Pin on
  student screens") has a gear (an outline cog, not the ⚙️ of a tool's own Options) at the end of its header: shown on
  hover and focus with a mouse, always there and faint on a touch screen, only on hover or focus on the projector, never
  while the pointer is hidden. aria-label "Clock settings" (`js.dash.side.title`). It opens the edit mode panel's own
  form (`renderSide`, now drawn into the side panel or into the sheet: `board`) for that widget only, without
  Duplicate and Remove (moving, copying and removing stay in edit mode). Changes save through the layout as in edit
  mode; the sheet's Undo (and Ctrl+Z) takes back only what was changed in it. Closing it leaves the board as it was,
  out of edit mode, the focus back on the gear. Teaching tools have no gear (their settings are their own Options).
- **Teacher only:** the gear is drawn only when the page's role is the class's teacher (`TEACHER`, from the server's
  `roleOf`) and not in edit mode; a student's screen (pinned or own widgets), a student's copy of a sent tool (drawn
  outside the grid) and edit mode have none (tested in Chromium).
- Strings: `js.dash.side.undo` and `dash.w.fractions.partsOf`, in all 13 languages (en-GB inherits en).
- **The two-block theme rule, restored:** dash.css had its own dark values (`prefers-color-scheme` and `[data-theme]`
  rules for the pens, the shape board's band colours and angle marks, a letter's vowel, the map's oceans, a 3D shape's
  hidden edges), which `tests/unit/theme.test.js` forbids. They are tokens now (`--dt-pen-*`, `--gb0` to `--gb6`,
  `--gb-angle`, `--dt-vowel`, `--dt-ocean`, `--dt-ocean-halo`, `--dt-hidden-edge`) in app.css's `:root` and its two dark
  blocks, with the same values. A marked hidden edge is now the marked colour in dark too.
- Tests: `tests/unit/dash-inputs.test.js` (parsing and limits; in Chromium: the fraction, decimal, percent typing rules,
  Escape, a bad entry, Enter, arrows, saving; the scoreboard drawn again while typing; a typed slope; the gear for the
  teacher, its sheet, saving, Undo, closing to the board; no gear for a student on a laptop or a phone).

## Classroom dashboards: fractions, dividing as measuring (17 Nov 2026)
Owner feedback from the live site on the Fractions tool's Add/Subtract/Multiply/Divide (`public/js/dash-tools.js`,
`public/js/dash-math.js`, `server/services/dash-tools.js`):
- **Show the answer, the right way round.** The answer starts hidden (`hide` defaults to true, so students work it out
  first; a state saved with it shown stays shown). The button says what it does: "👀 Show the answer" while hidden,
  "🙈 Hide the answer" while shown. **Decided:** because its words change with the state it has no `aria-pressed`
  (it was a pressed toggle reading "Hide the answer, pressed" while the answer was hidden).
- **Answers past one whole are drawn as wholes.** 5/10 ÷ 2/9 = 9/4 was one half-filled bar or circle (the first
  fraction's length). Every answer is now that many wholes, each its own bar or circle cut into the answer's pieces
  (9/4: two full and a quarter of a third, in quarters; `M.splitWholes`); 0 is one empty whole. Divide's answer counts
  copies of the second fraction, so it is drawn on a scale of its own, one whole a copy, in the copies' colours.
- **One layout, hidden or shown, in both views.** The sentence is always the stacked fractions with − and + on each
  number, then = and the answer, or while it is hidden a box to type an answer and Check. The picture under it is the
  same size hidden or shown (the answer's wholes are counted either way); the hidden answer is a dashed bar or circle
  with "?". The old circles layout fell to tiny icons, a column and one-line steppers when hidden.
- **Dividing as measuring** (`M.measure`): the first fraction as a bar, and under it copies of the second laid end to
  end on the same scale, one at a time with Fit one more (state `fit`), numbered, the last one only the part that fits
  ("2 fit, and 1/4 of one more"), the rest of it dashed. Pieces are drawn in a common bottom number when that is at most
  48 a whole (`M.DRAW_PIECES`); past it the copies are drawn by length with no piece lines. In Circles the copies are
  laid on the first fraction's circles the same way, next to one copy (the second fraction) and the answer.
- **The working, one step at a time** (Next step, state `step`): Add/Subtract (same bottom number, rename both, add or
  take away the tops; renaming also redraws both fractions in the same-size pieces), Multiply (the grid, the shading,
  the overlap, which the area model then picks out), Divide (keep, change, flip, multiply). The last step's result
  shows only with the answer.
- **Check my answer** (`M.parseFraction`, `M.checkAnswer`): 9/4, 2 1/4 and 2¼ are right; 18/8 or 2 2/8 is "Close: that
  is the same amount. Is it simplified?"; anything else "Not yet". The real answer stays hidden. What is typed is never
  saved or sent.
- **Wording:** "Same-size pieces would be 90 tiny pieces: too small to draw" is now "These pieces would be too tiny to
  see, so they are not drawn." (Compare only; the operations no longer need it).
- **State:** `fit` (0-144, Divide only, no more than the copies that fit) and `step` (0-4, not in Compare) are cleaned
  by `cleanToolState` and kept only when not 0, so states saved before them load as they were.
- **Check:** `npm run dash:fit` has 5/10 ÷ 2/9 in both views, hidden (every copy and step showing) and shown, and 12 ÷
  1/12 (144 copies; the answer's circles become one full circle "× 144"); it fails when a fraction's − and + are not
  stacked, a circle is under 40px or a bar under 28px, Divide has no Fit one more, Show the answer has aria-pressed or
  the answer shows while hidden. Tests: `tests/unit/dash-fractions-divide.test.js`.

## Teachers' top bar: Classroom, Build, Live (17 Nov 2026)
Owner: "For the top bar for a teacher it should just be Classroom Build Live at the top. You can remove Learn and Play."
- School staff (teachers and school admins): top bar Classroom · Build · Live; phone tab bar the same with Me. A
  school admin now has Live in the tab bar too (there is room since Learn and Play left). Everyone else is unchanged.
- Play and Learn are not lost: they are tiles in the teachers' account menu (below), and still open at /play and
  /learn (no tab is marked there).
- Tests: nav-roles, teacher-quick-wins and classroom-homes check the new bars and the menu's links.

## Teachers' account menu (17 Nov 2026)
Owner, after four mockups: Option 4 (a profile card) "but I would like to use the theme settings from number 3 at the
bottom", then "Leave out the Help and add the My School". School staff's menu (layout.js `staffMenu`), top to bottom:
- A card that opens Me: avatar, name, school, and "💬 n new messages ›" when there are any (the Me badge's count).
- Play and Learn as two tiles (a teacher's bars have neither since "Teachers' top bar").
- My school (school admins only), Plans (while paid-plan pages are on), Settings (/me/settings), Sign out (the same
  `/api/auth/logout` form as on /me).
- The theme as one Auto / Light / Dark switch at the bottom: the same plain `?theme=` links as `themeLinks` (no
  JavaScript needed; app.js switches at once and moves `aria-current`). "Auto" is `layout.acct.themeAuto`.
- Grown-ups, students, kids and the platform admin keep the menu from "A quieter top bar".
- Tests: nav-roles (the card first, tiles, My school for a school admin only, Plans, Settings, Sign out, the switch at
  the bottom, Dark on), classroom-homes, teacher-quick-wins; e2e schools.spec lists the head's menu links.

## Host a live game: "How to score", bigger radios, Game settings box, the app's dropdowns (17 Nov 2026)
Owner feedback on the steps from #387:
- **Teams → How to score.** The two scoring choices (Average per player, Total points) now sit under their own heading,
  "How to score" (`live.team.scoringHow`, in every locale but en-GB, which falls back to English), as a fieldset in
  the teams row. Radios and checkboxes in the live pages are 24px (were the browser's 13px), with a 12px gap.
- **Game settings** (the last step): closed, the box is just its heading, centred in it (the box was a flex column,
  so its gap sat under the summary), with the ▸ / ◂ / ▾ of the other live disclosures in place of the browser's marker.
- **Dropdowns.** The Game settings selects, the co-host picker, the dashboard's move picker, the homework class picker,
  the class-teams count and team pickers (live-class-teams.js, live-host.js) and the Number Quest placement start
  point were bare browser selects; they now have `class="input"`. **Decided: a test keeps it so**
  (`tests/unit/selects-styled.test.js`): every `<select>` in a view or script has class `input`, and every select made
  with `createElement('select')` is given it in the same or the next statement.

## Fraction Factory: Pro is its own game; the controls in one card (17 Nov 2026)
Owner: "I still don't see the difference between pro and explorer in fraction factory", and the controls looked
scattered (the slicer wrapping 2 + 3, "not cut yet" alone, Hint on its own line). Picked from three mock-ups: **A, one
panel beside the cake**; for Pro: **unlike denominators** and **multiply and divide**.
- **Root cause:** every order was made with `bands: ['1b', '2']`, so Explorer and Pro played the same 21 orders (and
  stars, kept per order id, counted for both). Now `L()` makes an Explorer order and `P()` a Pro one; no order is in
  both bands. Explorer is unchanged (First Folds, First Cuts, Re-Slice, Recipe Math: the Number Quest Unit 4 links all
  pass `band=1b`). Pro has four chapters of six orders: **Common Cuts** (1/3 + 1/4, 3/4 + 2/3 past one whole),
  **Take Away** (3/4 − 1/6, 5/4 − 1/3), **Scale Up** (3 × 1/4, 4 × 2/3 over three cakes, 1/2 × 3/4, 2/3 × 3/4) and
  **Share Out** (2 ÷ 1/4, 3/2 ÷ 1/4, 3/4 ÷ 1/12: build the amount in servings and count them). Each has an intro,
  three hints and a check, the Jumble's wrong answers (5/7 for 3/4 + 2/3, 4/1 for 5/4 − 1/3, 5/7 for 3/4 × 2/3),
  and every spoken line in the I18N block.
- **Engine:** types `sub`, `mul`, `div` beside `add`; an order needs as many wholes as its amount (`wholesFor`, up to
  3); a level may carry its own `cuts` (Pro: 2, 3, 4, 6, 8, 10, 12; Explorer keeps 2, 3, 4, 6, 8). **Decided:** a
  product is served by any cut that builds it exactly (2/3 × 3/4 = 6/12 or one half), a sum or difference by its cut
  or a finer one (as before), and a share-out only in the serving's own cut, since it counts servings (new feedback
  `why.div-cut`). A link to an Explorer chapter with `band=2` plays it in Explorer.
- **The map** says what each band plays under the switch ("Explorer · grades 3–5: fair shares, re-slicing, comparing
  and adding", "Pro · grades 5–6 and up: unlike parts, taking away, multiplying and dividing").
- **Controls (layout A):** an order built on the tray gets one card beside the wholes (under them on a phone):
  "1 · Slicer: cut into" with one row of number buttons (named "Cut into n"), "2 · On the tray" with the reading and a
  short line, then a wide Serve it! with Hint beside it. Two or three cakes stand in one row, smaller; a source amount
  of more than one whole draws one row per whole. Checked with no scroll at 1280×720, 1000×504 and 390×844.
- **Standards and shelf:** the game's CCSS list and `FRACTION_CHAPTERS` gain 5.NF.A.1-2, 5.NF.B.4, 5.NF.B.6,
  5.NF.B.7 and 6.NS.A.1; the Learn shelf says grades 3-6.
- Tests: tests/unit/fraction-factory-pro.test.js (bands disjoint, the goals, the cut rules, every Pro order solved by
  its advice script); fraction-factory.test.js's chapter contract is per band; the e2e spec presses the slicer by its
  name ("Cut into 4").

## Games, not lessons: folders of games, assigned to classes (17 Nov 2026)
Owner: "Let's get rid of lessons and instead just have the builder here with games that teachers can put in folders and
assign", and "there should still be a folder system so they can organize games (including the ability to save oomba
games to a folder)". Decided with the owner: **the ready-made courses stay as they are** (Number Quest, CS Quest, Cyber
Defenders); **teacher-made lessons are hidden, nothing is deleted**, and the games in them go into folders; an assigned
game **shows on the student's class page, the teacher sees scores, it may have a due date and can be posted to Google
Classroom**; folders live on **Build**, and the **class page** lists the class's assigned games with New game.
- **Folders** (`game_folders`, `game_folder_items`, services/game-folders.js, routes/game-folders.js): per person, one
  level, any game they can see (their own Builder games, drafts included, and Oomba's). A folder only sorts: putting a
  game in one never changes who can play it, and deleting a folder never deletes its games. "📁 My folders" sits on
  Build above My games; a folder page (`/build/folders/:id`) lists its games with Play, Assign and Remove, New game and
  Find Oomba games, and rename, move and delete in its ⋯ menu. **Save to folder** (`/build/save?id=`) is on every
  My games card, on Oomba game pages and Learn cards (school staff), and on an assigned game's ⋯ menu: each folder with
  Add here or (already there) Remove, and "New folder with this game". Caps: 100 folders, 200 games a folder.
- **Assign** (`/teach/assign?id=` or `?game=<slug>`, `F.assignGame`): a class, an optional due day, and "Also post to
  Google Classroom" (when a class is linked; the same post and grades as before). Underneath it is still a one-game
  assignment (a lesson of kind 'game' with one game step), so progress, scores, due dates, the gradebook, the dashboard
  and Google Classroom all work unchanged. An Oomba game: published, public, not course-only. A teacher's own game: once
  published for the school, publicly, or for classes (a class game reaches the class it is assigned to: it is added to
  the game's class list); a draft or a private game says "Publish this game first". The same game is never in a class
  twice (`alreadyAssigned`).
- **The class page** (first tab, now "📌 Assigned games"; its key stays `lessons`): New game, Assign from my games, Find
  Oomba games, the ready-made courses, then the assigned games (and course lessons and live homework) with due chips,
  done counts, and ⋯: dates, Scores, Student view, Save to folder, Unassign. Gone from it: the lesson picker, New lesson,
  Draft with AI, Lesson library and New unit. Students' heading is "📌 Assigned games"; a game row says "🎮 Game".
- **lessons.kind** (`0085_game_folders`): 'game' (assigned by Assign: the audit log's lesson.assignGame, or the same shape),
  'course' (a CS Quest copy: template_key), 'homework' (a live question set sent as homework), 'lesson' (teacher-made).
  `retireLessons()` (db.js, run once by the migration, safe to run again) makes a folder named after each teacher-made
  lesson that has games (its games in step order), and soft-removes that lesson's open assignments
  (`class_lessons.removed_at`, the same remove every query already honours), recording each in `lessons_retired` so it
  can be undone. Lessons, steps, students' work and rubric marks all stay. A retired lesson's editor link opens its folder.
- **Sharing** (owner: "Teachers should also still be able to share games"; picked: share **folders** with colleagues,
  `0086_game_folder_sharing`): on a folder's page its owner shares it with one school they are staff of (a select when
  they have several), or stops sharing. That school's staff (teachers and admins, never students or other schools) see
  it under "🤝 Shared by colleagues" on Build with the owner's name, open it read-only (Play, Assign, Save to folder),
  and "Copy to my folders" (the same name, the games they can open). Colleagues only ever see games they can open, so a
  teacher's own draft or class-only game stays theirs; the share note says to publish for the school.
- **Class page tabs:** 🎮 Games (first: build, assign, organise; the assigned games; the games shared with the class),
  Progress, Students, Settings. The old Lessons and Games tabs are this one (`?tab=games` lands on it).
- **Elsewhere:** `/teach/lessons` redirects to `/build`; Classroom home's tools button is "📁 My games and folders" and each
  class card's is "🎮 Assign a game"; the teaching loop's Plan tools are My games and folders and New game; the CS Quest
  page no longer links the library; the trial email's courses link goes to Learn.
- **Still there underneath, on purpose:** the lesson editor and the lesson APIs (CS Quest copies are edited there, and
  their rubrics and standards), and units (CS Quest's assign-a-unit makes them; the class page shows their headings).
  No screen makes a new teacher lesson any more. **Open:** remove the lesson-library code and the teacher-lesson APIs
  once the owner is sure nothing should come back; the teaching loop's words still say "lesson" in places.
- Privacy: folders are private to their owner (another teacher's folder is not found); account delete removes the
  person's folders; school delete clears `lessons_retired` with the class's assignments (admin-delete.test.js).
- Tests: tests/unit/games-not-lessons.test.js (the backfill, folders, assign, the pages); updated: lessons, progress,
  gclassroom (an assigned game posts to Classroom), teach-loop, classroom-homes, course-teacher-view.

## Voices finish before the next question (17 Nov 2026)
Owner: "All of the games seem to have the voices cut off as they transition from one question to the next. Make sure
all of the transitions are perfect." Cause: a game said a line ("Yes! 10 and 4 make 14.") and moved on after a fixed
wait (2 s in Garden Count, a 2-3 s game-time pause in the Number Quest games); the next question's line, spoken without
queue, cancelled it. With AI voices a line that is not cached yet can take a few seconds to arrive, so it was cut off,
or never heard at all.
- **SDK:** `BRB.afterSpeech(fn, { min, max, gap })` calls fn once nothing is being said (a line playing, queued, or
  still on its way from the AI voice) for `gap` ms (250), never before `min` and never after `max` (10 s, so a line
  that never says it ended can't hold a game); it returns a cancel function. `BRB.speaking()` says whether anything is.
  docs/sdk.md lists both; tests/unit/voice.test.js checks a slow AI line holds the wait.
- **Games:** every automatic move to the next question goes through it, keeping each game's own minimum wait and its
  cancelling (a screen change still stops it), instant as before in the tests' fast mode, and the old timer where the
  SDK has no afterSpeech. A tap the player makes may still cut a line (that is their choice).
- **Garden Count** also asks for each round's closing line and the next question ahead (`BRB.prefetchSpeech`), so the
  AI voice is ready the moment they are said; tests/unit/garden-count.test.js answers every line 3 s late and checks
  the next question waits for it.

## Garden Count: Tens and Ones, and a clean start (17 Nov 2026)
Owner: "This should be more clear that the left is for 10's and the right is for 1's. The beginning of garden count is
also quite glitchy."
- **Tens and Ones:** in the teens chapter a sign stands behind each bed, like the columns of a place-value chart: a
  green "Tens" over the ten-frame and a brown "Ones" over the loose apples, each with how many it holds now (10 | 4,
  matching "10 and 4 make 14" at the top). In "How many apples?" Tens shows 10 and Ones shows "?" until the answer is
  right. On a tall phone the ones bed moves down a little to make room for its sign. (I18N `teens.tens`, `teens.ones`.)
- **The start:** the loading screen was removed before the helpers had loaded and the camera had framed them, and it
  was see-through, so the 3D view flashed half-built (a black sky, a giant ground tile up close). It now has the sky's
  colour, stays until the helpers stand in place and one frame is drawn from where they are seen, then fades (no fade
  with reduced motion).
- **Every Number Quest game** (Balance Bridge, Keep Builder, Kitchen Rush, Lantern Mix, Launch Lab,
  Lily Hop, Machine Line, Rocket Supply, Scale Scout, Shape Hunt, Sky Lines, Sub Zero; Crate Stacker had its own fix
  in #391, a curtain and a voice coach, kept as it is) had the same see-through
  loading screen removed too early, and gets the same fix (owner: "Make sure the start of all those games are not
  glitchy as well"): the page's own colour, removed after the first screen is drawn, a fade. Recorded from the first
  frame in the production frame: each shows its loading screen, then its finished first screen, nothing between.
- **Other games with automatic moves after speech:** Shark Plank's results card waits for the win or lose line, and
  Hero of Sunvale's cutscenes hold their clock before the next caption while a voiced line is still playing (at most
  10 s a line; a tap, Skip and the test hooks move on at once). Word Trail's speed-round clock starts once the word has
  been said. Fraction Factory, Gulp City, Jungle Cup, Word Hunt and Word Peek move on only on a tap (unchanged).

## Landing: no floating game covers round the hero (17 Nov 2026)
Owner: "Remove the floating games on the outside... its a bit too distracting." The five game covers that drifted at
the hero's edges on very wide screens (`.lp-floats`, from 1360px) are gone, with their styles. The covers fanned in
the hero's "30+ games" link stay. tests/unit/teacher-landing.test.js checks there are none.

## Classroom dashboards: Build it, the answer hidden, the place value number typed in (17 Nov 2026)
Owner: "A lot of the times when you have the make a question feature you are showing the answer to the question on the
screen and there is no way to hide it... These math widgets should be good for explaining a concept, but also for
teachers to then push this to their students and have them practice using the widget to build understanding." And on
place value: "User should be able to edit the 3,405.27 number directly." Code: `public/js/dash-build.js` (targets,
generators, checks; pure, run in the browser and on the server), the shell in `public/js/dash-tools.js` (`T.hid`,
`T.hideAnswer`, the 🙈/👀 button, Build it, `bigEdit`), the student's and the teacher's sheets in `public/js/dash.js`
(`openBuildIt`, `openProgress`, `showOnBoard`, `openBuild`), `pvParse`/`blocksOf` in `public/js/dash-math.js`, the
push and progress in `server/services/dash.js` (`push` kind `build`, `buildCheck`, `buildProgress`, `buildMine`), two
routes in `server/routes/dash.js`, `qh` and `ANSWER_TOOLS` in `server/services/dash-tools.js`; migration 0084
(`dash_builds`); strings `dash.tools.showAns|hideAns|ansHidden|ansShown|build|edit*`, `dash.errors.build*`,
`js.dash.build.*`, `js.dash.kind.build` in all 12 full locales (en-GB: "colours"). Tests: `tests/unit/dash-build.test.js`.
- **The answer hidden after Make a question.** The question is made from the tool as it is, then the tool hides what
  gives the answer away on the teacher's screen (and so the projector) until the teacher presses **👀 Show the answer**.
  The fraction tool and bar models already had their own Show/Hide (the fractions' PR #392 pattern: "👀 Show the
  answer" / "🙈 Hide the answer", a dashed "?"); Make a question now sets that. Every other tool that makes a question
  gets the same button (teacher's screen only; never on a student's copy) and a new state key, `qh` (kept only when
  true, so every saved layout and push loads as before; tested). While hidden, the readout under the model is one
  dashed "?" for every tool (CSS `.dt-ans-off`, read as "The answer is hidden."), and each tool hides its own
  giveaways:

  | Tool (mode) | Its question | Hidden while `qh` | Build it |
  |---|---|---|---|
  | Base-ten blocks | the number | the number, the expanded sum, each mat's count ("?"), the number in what is said | ✔ 1-999 |
  | Place value chart | the number | the number and expanded form; with discs on, the digits too | ✔ to 9,999.999 |
  | Ten frames | how many | the sum and the number bond | ✔ a count or two colours ("3 + 4") |
  | Number chart | skip counting next / how many shaded | the counted numbers after the third; the count | ✔ find and shade one number |
  | Area model and arrays | a × b | the product and each part's product | ✔ "3 × 4" (either way) or any array of 12 |
  | Times table grid | a × b | the fact's own cell and the readout | — (its own Hide stays) |
  | Teaching clock | the time | the digital time and elapsed time | ✔ a time (12 h: either half of the day) |
  | Fraction, decimal, percent | the decimal | the decimal and percent cards | ✔ "3/4", "0.25", "25%" |
  | Fraction bars | per mode | its own hide (as before) | ✔ shade a fraction (an equal one is right) |
  | Number line | where a jump lands / a point | the jumps' sum | ✔ one point on a tick of the line |
  | Coordinate plane | the slope | the slope's stepper, rise and run, the table's y | ✔ plot one point |
  | Graph maker | which is most | the readout | — |
  | Shape board | the area | area and perimeter | ✔ a closed shape with this area (halves too) |
  | Angle maker | the kind | degrees (the typed field shows "?"), its name, the arc's label | ✔ an angle (no presets on a student's copy) |
  | Pattern blocks | part of a hexagon | the readout | ✔ "1 1/2" hexagons (shown as text only) |
  | 3D shapes, balance, algebra tiles, chance, letter tiles | counts, x, the expression, the chance, vowels | the readout | — |
  | Transformations | where A lands | the image, its points, the image column | — |
  | Coins and money | the total / change | the readout | ✔ make an amount |
  | Maps | the continent | the continents' and oceans' names | — |
  | Number rods | the box | the readout | ✔ a train this long |
  | Bar models | the ? | its own hide (as before) | — |

  **Decided:** the question's answer order never changes with `qh` (it is left out of the seed).
- **Build it.** On the tools marked above, the teacher's tool has **🧱 Build it**: a sheet with an instruction (a default
  per tool: "Use the base-ten blocks to build each number."), targets typed with commas ("347, 1205, 58", "3:45, 7:10",
  in the reader's own number marks; "1,205" stays one number) or made by a ready-made generator (41 kinds: 2-digit
  numbers, quarter hours, tenths, facts to 5 × 5...), and **Send to students**. What a tool can't build is listed as
  left out ("1205": base-ten blocks have no thousands); at most 12, no repeats. The push (kind `build`) stores the
  tool, the mode, the teacher's tool as a base (its line's range, the chart's decimals, the coins' currency: "auto" is
  the teacher's), the targets (rebuilt on the server: only ones the tool can build) and the instruction (cleaned).
- **On a student's device** the banner or tray opens a sheet: "3 of 5", the instruction, "Build: 347", their own copy
  of that one mode (no mode switch, no Options, Make a question, Send, Practice it or answer button), the answer
  hidden, then **Check** and **Next**. "🎉 Yes!" or "Not yet." with one gentle hint from the tool's own state ("Tens:
  you have 3; you need 4.", "The minutes are right. Now check the hour hand.", "Your train is 6 long; you need 10.").
  A finish screen: "All done! 4 of 5 right." and a button for each one to have another go. What they build stays in
  their browser; Check sends only the target's index and the tool's state, which the server cleans and checks again
  with the same code (`server/services/dash.js` imports `public/js/dash-build.js`, pure). **Decided:** a student may
  go on after "Not yet" (practice, not a test), and once right a target stays right.
- **The teacher's live view** (from the sheet after sending, and "📋 Progress" in Sent today): each target with how many
  got it right of those who tried and **👀 Show on the board** (that target built on the teacher's own tool, its mode on
  and the answer shown); each student by Oomba name with "2 of 5 done · 1 right" and "Not yet: 347, 58". Refreshed every
  4 s while open. **On the projector the names are hidden** ("Names are on your own screen, not the projector").
- **Privacy and safety.** `dash_builds` keeps only (push, class, student, target, ok, tries, at). Rows go with the
  push after 14 days (as pushes and hidden pushes do), with the student's account (`forgetUser`) and with the school
  (`BY_CLASS`). The progress route is the class's teacher's; a student gets only their own; everyone else 404. No AI,
  no free text between students (a student's view has no field at all), Oomba names only.
- **The place value number typed in.** The big number under the chart (and under the base-ten blocks) is a field that
  looks like the number (a faint dashed underline): click or tap, type, Enter or leave it. Commas and points in the
  reader's own marks ("3,405.27", "3.405,27" in German, "3 405,27", Arabic digits); a mark followed by three digits is
  a grouping mark when it is the reader's, otherwise the point. Out of range ("12,345"), more places than the chart has
  (or any with the decimal columns off) or not a number: the old value stays, with a short message under it
  (`aria-invalid`, read with the field). Escape puts the old value back. The columns, discs and expanded form follow.
  Base-ten blocks take 0-999 (the blocks become its hundreds, tens and ones). Named "Place value chart: type a
  number"; while the answer is hidden the field is hidden with the readout.
- **Fit check.** `npm run dash:fit` has `default-buildit` and `min-buildit` layouts: every Build it tool and two
  number fields; on the teacher's screens the numbers are typed (refused, with the message showing), and on a student's
  screens each set is opened in its sheet, Checked once and checked (nothing cut, no sideways scroll, 44px buttons).

## Classroom dashboards: one calm row of buttons (17 Nov 2026)
The maths tools' bottoms had grown to three to six rows of pills (Options, Practice it, Make a question, Hide the answer,
Build it, Send to students under the tool's own buttons). The owner approved a calmer layout (mockups of ten frames,
base-ten blocks, the teaching clock, number rods, fractions and coins, and the mode-dropdown audit).
- **One row, never more** (`shell().finish()` in `public/js/dash-tools.js`): up to three of the tool's most-used
  buttons as icons (named by their tooltip and `aria-label`), then **⋯** for the tool's other actions (`T.more(b)`, e.g.
  ten frames' Take one, place value's ÷ 10), then **📤 Share ▾** at the end: Send to students, 🧱 Build it (where the tool
  has it), ❓ Make a question, 🎮 Practice it, and nothing else. The teaching clock keeps its four steps (`row: 4`, the
  one exception). A tool's selects and steppers that were in the row stay at its start when everything fits on one row (a
  wide widget), else they go to the tool's own row above it (`T.ctl`; the balance's five steps are always there). When a widget is too narrow, Share shows only its icon, then the row's last buttons move behind ⋯
  (and back when there is room). A student's own screen or copy has no Share: Practice it is its own 🎮 button.
- **Header icons** next to ⓘ: 👀/🙈 Show/Hide the answer (the shared one on the teacher's own screen; fractions' and bar
  models' own hide wherever they showed it before; its words say what it does, no `aria-pressed`) and ⚙️ Options.
- **The menus** (Share, ⋯, Number rods' 👁️ View) are popovers (`popover="auto"`, the top layer, so nothing clips them),
  placed by their button inside the widget when they fit there, else inside the screen. Outside tap and Escape close
  them (Escape gives the focus back to the button); ↑ ↓ Home End move inside; Tab out closes. A used item closes Share and
  ⋯ (before its action, so a sheet it opens returns the focus to Share); View stays open for its switches and zoom.
  Share is hidden on the projector; a student's Build it copy still has no Share or Options.
- **Number rods:** Turn, Copy and Delete are a small bar by the chosen rod, only while one is chosen; the way new rods
  lie, Grid, Unit lines, Zoom out/in and the Equation are in 👁️ View (a tick shows a switch that is on); the longer rod
  is "Longer rod [20 ▾]" at the end of the tray (the words are the rod: tap or drag it in). Undo, Redo and Reset stay.
- **Mode dropdowns** (`public/js/dash-modes.js`): a tool with modes shows a native select instead of pills (place value
  keeps its two pills), with the mode's main choice beside it on one row (`data-pair`): Translate/Reflect/Rotate,
  Coin/Dice/Spinner, the kind of graph, Both sides/Left/Right, the bar model's kind. Fractions has one dropdown (Compare,
  Add, Subtract, Multiply, Divide, then Fraction, decimal, percent: `fractions.merge`) beside Bars | Circles, and its
  empty "= ?" bar is drawn only once the answer shows. The angle maker's five presets are one "Jump to…" dropdown.
- **Steps:** fractions' working is one "💡 Steps 2 of 4" panel (closed at first, this page remembers it open): a
  numbered list, Next step inside it, and the readout's line in bold at its end (`stepsPanel` in `parts`).
- Nothing was removed, and the state format is unchanged (saved layouts and pushed tools load as before). New words:
  `dash.tools.share/moreActs/view/steps/stepsOf/jumpTo` and `dash.w.rods.longRod`, in all 12 languages.
- **Check:** `npm run dash:fit` fails when a tool's bottom is more than one row or too wide, has more than three of the
  tool's own buttons (four on the clock), has Options, the answer or a Share item in it, or Share/⋯ not at its end; and
  it opens every Share, ⋯ and View menu: whole inside the screen, never scrolling or cut, 44px items, the focus inside,
  Escape closing it with the focus back on its button, Share hidden on the projector. Fractions' Steps panels are opened
  before the check.

## Classroom dashboards: fractions, equations (18 Nov 2026)
Owner approved from mockups: Fractions' Build it can ask students to **solve equations** and shade the answer, the Build
it sheet is tidier for every tool ("use drop downs to keep things clean"), and the fraction operations say why + stops.
Code: `public/js/dash-build.js` (`eqParse`, `eqAnswer`, `answerBars`, `EQ_OPS`, the `eq*` generators, the fractions
entry's check/solve), `eqView` and `limitWords` in `public/js/dash-tools.js`, `out(n)` in `public/js/dash-num.js`,
`openBuildIt`/`openBuild` in `public/js/dash.js`; strings `js.dash.build.*` (new and reworded) and
`dash.w.fractions.howtoEq|eq*|limit*` in all 12 full locales. Tests: `tests/unit/dash-build.test.js`.
- **The sheet, for every tool:** the intro; (fractions only) **What do students do?** [Shade a fraction | Solve
  equations] and **Which equations?** [Add, Subtract, Add and subtract, Multiply, Divide, All four], both dropdowns;
  the instruction; **Questions students will get**: "🎲 Pick some for me" [kind ▾] [how many ▾] [Pick] fills the box
  below it, "Or type your own, with commas between, like …"; then one line ("5 questions") and what was left out. The
  list of chips under the box is gone; "Targets" reads "Questions" (the progress sheet too). Changing what students do
  or which equations swaps the picker's kinds, the example and the default instruction ("Work out each one. Shade the
  answer bar."; an instruction the teacher wrote stays).
- **An equation** is a target `{ op, a, b }` (the fractions' own `n/d` targets are unchanged, so every set sent before
  loads and checks as it did; no migration). Typed with + - − x × * · ÷ : or a spaced / ("1/2 / 1/4"), "= ?" allowed.
  Kept only when each fraction is inside the tool's `OP_LIMITS` (bottom 1-12, top 0-12, at most 3 wholes), it never
  divides by zero, and the answer is more than 0, at most 3 wholes and has a bottom number of at most 12 in its simplest
  form, so a bar of 1-12 parts can show it. **Decided:** an answer of 0 is left out (nothing to shade), and any
  operation typed is kept whatever "Which equations?" says (it chooses the picker's kinds). Kinds: same bottom number,
  bottoms like 3 and 6, unit fractions, a whole number × a fraction, with a whole number (1 ÷ 1/3, 1/2 ÷ 3), easier
  ones, any (operands in simplest form; subtracting always bigger first).
- **The student** sees "Work out: 1/2 + 1/4 = ?", the two fractions as fixed bars in the operations' colours on one
  scale, and a dashed answer bar: − and + for the parts in each whole (1-12, typed too), − and + for the wholes (1-3),
  tap or arrow keys to shade. It is stored as the tool's own `bars` (one bar a whole, all cut the same), so the server
  cleans and checks it with no new state. Right is any equal amount (6/8 for 3/4) with one line of why ("With 4 parts
  in each whole: 2/4 + 1/4 = 3/4."); not yet gives one hint: nothing shaded, tops and bottoms both added, pieces that
  can't make the answer (with the same-size parts to try), too much or too little. The server keeps only right / not
  yet, as before.
- **Show on the board** turns the teacher's tool to that operation with the two fractions, the answer shown and the
  working reset (`mode`, `a`, `b`, `hide: false`, `step`/`fit` 0); their Compare bars are kept.
- **The limit note:** in Add, Subtract, Multiply and Divide, + is no longer silently disabled at a limit. Past it, the
  readout shows "✋ That's as big as it goes. Each fraction can be at most 3 wholes, and 3/1 is already 3 wholes." (or
  the top / bottom number "can be at most 12"), said aloud too; a number typed past it gives the same note (held at
  the limit). The next change takes it away.
- **Fit check:** the Build it layouts also send a set of fraction equations of all four operations for students.

## Algebra Builder (adapted from Algebra Tiles), with question sets (18 Nov 2026)
Owner: "Add this game to oomba: [teacher.dev's algebra-tiles] Make sure all functionality stays the same but use oomba
branding. This should be listed under games, but should use our animation packs. I want to use a similar board like
structure." Answers: keep its whiteboard; the Oomba Kit's effects only (no character); activity links and QR codes
open the problem on Oomba; keep its math input field, which we have permission to use, but nothing in the game or the
repository names it. Then: "Change the name of the game, as well. And allow teachers to create multiple questions."
Answers: **Algebra Builder**; question sets **saved on Oomba** under a short code; a set **may mix activities**.
- **Where it lives.** `tools/algebra-builder` (the original's Svelte app, Apache-2.0: LICENSE, NOTICE with what changed,
  README) builds into `seed-games/algebra-builder.html` (`npm run build:algebra-builder`; `node build.mjs --check`).
  Play shelf, category puzzle, cover from its gallery (`scripts/covers/algebra-builder.recipe.js`), a share picture.
  The original is credited by name in the page's banner, About, NOTICE and the seed notes, as its license asks.
- **The same game.** Gallery, a setup page per activity, and the whiteboard: Solve (Isolate, Divide, Answer, live
  balance on or off), Multiply and Factor (rectangle, sides, equation; all tiles or none), their checks, toolbar, tray,
  pan and zoom are the original's code. Its pages became screens in one page, with an in-game Back (no history in the
  frame). Oomba look: paper, ink and green, Bricolage Grotesque, rounded cards, pill buttons; the tile colours stay.
  It reads nothing aloud, as the original didn't (registered for AI voices with no lines; a "no-table" game).
- **Effects.** A passed step: the kit's `correct` and a pop of the problem bar; a wrong Check: `wrong` and a small
  shake; a question of a set done: `levelup` and a pop; the finish (a problem, or a set's last question): `win`,
  confetti and `BRB.gameOver({ won: true })` once (completes a lesson step). Reduced motion skips the movement.
- **One problem, one link** (as the original): `?mode=solve&chapter=2xp3q7&level=1&lock=1` (`+ = ^ ( )` written
  `p q e o c`, at most 16 characters; `level` 1/2 is the live balance on/off for Solve, all tiles/none otherwise). A
  problem too long for that says so on its setup page; a preview has no link.
- **Question sets.** "Make a question set" on the gallery, or "Start a question set with it" on any setup page: up to
  10 questions (20 since the teacher generator) from any activity, each made on that activity's setup page (Add to the set / Save this question),
  reordered, changed or removed in the set's list. **Save and get link** keeps it on Oomba (`game_sets`, migration
  0085; `server/services/game-sets.js`) and shows its link `?chapter=s-xxxxxxxxxx&lock=1`, the QR code and Copy; saving
  again keeps the link. Signed-in players only (a guest is told to sign in; a preview has no links). The teacher's
  sets are listed on the gallery from their game save (`algebra-builder-sets-v1`). Students get "1 of 5" in the bar,
  **Next question** after each, then "All 5 questions done!" with Do them again; the teacher opening their own link
  gets "Change this set". A deleted set's link says it isn't there any more. A set is only activities, problems in a
  fixed math alphabet and two settings (no free text), and goes with its owner's account.
- **Assigning, and Google Classroom.** Owner: "Make sure this flows into Google classroom if assigned to the class." A
  teacher (school staff) gets **Assign to a class** beside the link of a problem and of a saved set. It opens Oomba's
  Assign page for the game with that problem or set (`/teach/assign?game=algebra-builder&opts=…`, routes/game-folders.js): "Students open: your
  question set (5 questions)", the class and due date, and **Also post to Google Classroom (for …)** when the teacher
  can post to a linked class. The lesson is named after what it opens ("Algebra Builder: Solve 2x + 3 = 7"), its game
  step carries the options, so the lesson's Play opens the problem or set straight away, and the same problem or set
  can't be assigned twice to a class. Without options (the Learn tab's Assign) the page asks the teacher to choose in
  the game first: students would otherwise land on the teacher's gallery. A student finishing it (`BRB.gameOver`, once,
  at the end of the problem or the whole set) is the step done: the completion grade Classroom gets (send grades, or
  automatic grades, on the class's Google Classroom page). tests/unit/gclassroom.test.js walks it end to end.
- **SDK.** `BRB.gameUrl` (the frame gets the game's own `/play/<slug>` address), `BRB.copy(textOrPng)` (the play page
  writes the clipboard only for that game's own link, with a query, or a PNG up to 300 KB, right after a tap) and
  `BRB.questionSet` / `BRB.saveQuestionSet` (docs/sdk.md "Question sets").
- **Left out.** The original's email links, its "suggest an activity" form and its analytics.
- **The math input field** is vendored under `tools/algebra-builder/vendor/mathfield-*` with its package names changed;
  `build.mjs` and tests/unit/algebra-builder.test.js check the name appears nowhere (the CSS text-cursor property aside).
- **Safety scan.** `build.mjs` removes what the scanner refuses in the bundle: Svelte's and Tailwind's web addresses,
  a validator's `Function('')` probe (answered "no"), its address pattern and its 64-bit limits written as digits.

## Classroom dashboards: steps never vanish; Back a step and Clear the steps (18 Nov 2026)
The owner saw the Fractions tool's step 1 lose its words when step 2 showed: in a small widget the Steps panel turned earlier steps into their numbers only, to keep the picture's size. Every shown step now keeps its words; the tight mode only makes the earlier ones a little smaller. Once a step shows, "Back a step" and "Clear the steps" sit beside Next step, so a Next step pressed by mistake can be taken back one at a time or all at once. Both save through the same path as Next step. New strings `dash.w.fractions.stepBack`, `stepClear`, `stepCleared` in every language; `tests/unit/dash-steps.test.js` checks it in Chromium.
## Class page: three game actions and your folders; Live games history; teams on Students (18 Nov 2026)
Owner, on the live class pages: "It's a bit confusing that we have no lessons yet listed here", "where it says Live Games,
perhaps we can do something like a Live Games History instead of the edit teams there. I think the edit teams
functionality should be listed under students", the Save to folder page on a phone should be clean, and the Games tab's
buttons cleaned up: no ready-made chips, three options, and the existing folders to click into.
- **Games tab:** 📁 New folder (a fold with the name box; it opens the new folder), ✨ Build new game, 🦉 Find Oomba games
  (the owner's list named "Create New Folder" twice; the third is Find Oomba games). Under them, "📁 My folders": the
  teacher's folders, each opening its page. The ready-made course chips are gone from the class page; the courses stay
  on Learn (their cards' "Assign to a class"). Google Classroom stays. Full-width buttons on a phone.
- **Empty states:** Progress says "No games assigned yet · Assign a game on the Games tab…"; a student's class page says
  "No games assigned yet · Your teacher will add games here." The gradebook's jump chip is 🎮 Games.
- **Progress → 📡 Live games history:** the class's past live games (date, players, teams) and the live results table;
  with none yet, one line and Host a live game. Saved support data stays here.
- **Students → 👥 Teams for live games** (`classTeamsSection` in routes/progress.js): the teams editor (or, with live
  teams off, Forget saved teams), next to the roster the teams are made from.
- **Save to folder on a phone:** each folder is a row with its name (wraps), "✅ In this folder · n games" or the count,
  and one action (Remove from folder / Add here), full width under the name on a narrow screen; the folder holding the
  game is outlined. The new-folder box has a visible "New folder" label. Folder styles moved to app.css (the class page
  uses them too).
- Strings: folders.buildNew, progressEmptyText, studentEmptyText, liveHistory, liveHistoryNone; classEmptyText reworded,
  all 13 locales. Tests updated: games-not-lessons, classroom-homes, course-teacher-view, live-teacher, schools,
  school-teacher-mobile.spec.

## Class page Games tab: one layout for desktop and phone (18 Nov 2026)
Owner, on the desktop Games tab: "This looks terrible on desktop. Make sure the organization is perfect on both desktop
and mobile." The buttons, the folder chips and Google Classroom shared one wrapping row. Now, top to bottom:
- **Toolbar:** 📁 New folder, ✨ Build new game, 🦉 Find Oomba games on the left; 🎓 Google Classroom at the right end.
  New folder opens a small panel under its button (folder name, Create), so the toolbar never reflows.
- **📁 My folders:** a labelled row of its own under a divider, each folder a chip that opens it.
- **📌 Assigned games:** a labelled section under a divider: the assigned games, or one compact row "No games assigned
  yet · Build a game, or assign one from your folders or Oomba's games."
- **Phone (≤ 600 px):** the toolbar's buttons stack full width, New folder's panel opens in place under its button,
  Google Classroom full width. Checked at 1280 × 900 and 390 × 844 with no sideways scroll (`.cl-*` in app.css).

## Class jobs: names the teacher types (18 Nov 2026)

The owner asked how to put students on the Class jobs chart, and that names can be added by hand. The chart filled
itself from the class's students, so a class with no student accounts showed every job as "Open" with no way in.

- **Settings → Students:** one name a line. Filled in, the chart uses those names instead of the class's students;
  empty, it uses the class's students as before.
- **Next week** turns the typed list by one, as it does the class list. **Shuffle** mixes the typed list itself
  (saved back into Students) and starts again from week one.
- Typed names are kept to 60 names of 40 characters. They are the teacher's own words on the teacher's screen, so they
  are shown as typed text and never matched to accounts.
- With no students and no names, the card says where to type them rather than only "No students in this class yet".

## Schedule: a standard week, uploaded agendas, a connected calendar (18 Nov 2026)

The owner asked that teachers can upload an agenda, set up standard agendas for the week ahead, or connect a calendar
they want shown on the "Schedule for the day" widget. Before, the widget had one list of periods for every day.

- **A standard week.** The settings' periods have day chips: Every day, then Monday to Sunday. A weekday uses Every
  day's list until the teacher gives it its own ("Give Monday its own schedule" copies Every day's list to start
  from); "Use the Every day schedule" goes back. Stored as `s.week` ({ 1..7: periods }, cleanWeek), next to `s.periods`.
  The widget shows the weekday's own list in the school's time zone, else Every day's, and switches at midnight.
- **Upload or paste an agenda** (public/js/agenda.js, the same code in the browser and on the server). A calendar file
  (.ics) fills the week ahead (each day with events gets its own list). A .csv or .txt file, or pasted text, takes one
  line a period ("8:30–9:15 Reading", "8:30 Reading", "Reading, 8:30, 9:15", am/pm or 24-hour; a missing end is the next
  start); a line that is only a weekday's name, in English or the teacher's language, starts that day. A bare 1–6
  o'clock is read as the afternoon. Word and PDF files are not read: a picture of an agenda goes on the Picture widget.
- **Connect a calendar** (services/dash-calendar.js). The teacher pastes a calendar's iCal address (Google's secret
  address, Outlook's published ICS link, Apple's webcal:// link). Such an address works as a password, so it is kept
  only in `dash_feeds` (0088) and never in the widget's settings, which pinned widgets send to students: the widget keeps
  `{ id, name }`. The server checks the address by fetching it once (https only, the same private-address refusal as
  site windows, 3 MB, three redirects), then keeps the file for 15 minutes; a screen's live answer carries today's timed
  events for each schedule shown (`live.agenda[widgetId]`), read only for the class the calendar was connected to.
  All-day events are left out; repeats, skipped days and moved single times are followed. On a day with no events, or
  when the calendar can't be reached and no copy from the last day is kept, the typed schedule shows.
- Everyone who sees the widget sees the calendar's event names, so the settings say to connect a calendar meant for the
  class. Disconnecting deletes the row; a teacher's account going deletes their calendars; a school's delete takes them.

## Algebra Builder: who's playing, class codes, practice, hints, a question generator (18 Nov 2026)
Owner: "Can we also add hints if students get stuck? ... At the beginning when you click into the game can you create a
student and teacher path. For a teacher it should be the flow as is. For the student, they should either be able to add
a code to take a teacher's assignment, or they should be able to practice independently ... choose difficulty level and
then randomly creates a bunch of different problems ... make sure they don't receive the same problems each time." And:
"for the teachers, they should be able to select the number of questions they'd like, the mix of questions ... and then
it should be able to randomly generate the questions for the teacher if they so choose."
- **Who's playing?** Opened without a link or a lesson, the game starts with two big choices. **I'm a teacher**: the
  gallery, as before (with "Not a teacher?" to go back). **I'm a student**: a class code, or practising alone. Links,
  QR codes and lessons still open their problem or set straight away.
- **Class codes.** A saved question set shows its code (the set id without `s-`, as `ABCDE 23456`) beside its link;
  a single problem gets one with **Get a class code** (saved as a one-question set). New codes leave out i, l, o, 0, 1.
  A student types it (any case, spaces, dashes); the page looks it up (`BRB.findQuestionSet`, `GET
  /api/games/:id/sets/:code`) and the set plays. No `<form>`: the sandboxed frame blocks form submits.
- **Practising alone.** Solve, Multiply or Factor; Easy, Medium or Hard (each described for the activity chosen); 5
  problems made at random, each one a teacher could type. The ones a student has had are kept in their save (per
  activity and level, the last 200), and a new set avoids them until a level runs out of new ones (then the oldest come
  back). Checked over 40 sets each: no repeat before 200 for Solve, 192 / 157 for hard Multiply / Factor, and the
  smaller easy pools (48 Multiply, 33 Factor) go round only when used up. "5 new problems" at the end.
- **Hints.** A Hint button beside Check: up to three per step, from the idea of the step to this problem's own tiles
  (for x − 9 = 4x + 3: put 1 red −x tile in both pans, then 3 red −1 tiles; it ends with 3 x tiles against 12 red −1
  tiles). They never do the step. After two Checks that didn't pass, or a minute on a step, it lights up as "Stuck?
  Hint". The hints box takes the place of the Check message and can be closed (on a phone it would cover the board).
- **Make questions for me** (a teacher's question set): how many of each activity (− and +), a level, replace or add;
  the generator above makes them, all different, then the teacher can change, move or remove any. A set now holds up to
  20 questions (was 10).

## Box by Box: long division and multiplication, box by box (18 Nov 2026)
Owner: a second game for Oomba from a web app they own, played end to end as teacher and student first, rebuilt with the
same features and the same connectivity as Algebra Builder (tracking, submission, Google Classroom), under a new name;
for privacy, nothing in the game or the repository points back to the original.
- **Where it lives.** `tools/box-by-box` (Svelte) builds into `seed-games/box-by-box.html` (`npm run build:box-by-box`;
  `build.mjs --check`). Play shelf, category puzzle. `build.mjs` and tests/unit/box-by-box.test.js refuse any word that
  points back to the original (written as character codes, so the checks don't carry them either).
- **The game.** Long division (10 to 999,999 by 2 to 9,999) and multiplication (10 to 9,999 times 2 to 999), worked on
  graph paper one digit box at a time: divide, multiply, subtract, bring down; multiply each digit with carries,
  placeholder zeros, add. Support modes Watch, Count up, Guided and On my own (and Prompted or a custom mix from older
  activities): spotlight, questions, zoom, building as you go, drawn signs, automatic bring-down, marking mistakes at
  once. Check compares the answer boxes: a second try, then the answer is shown. A keypad for touch screens.
- **Teachers** make activities in the game (problem ranges, remainders on or off, a fresh set for each student, how
  many, problems typed, pasted or reordered); they are kept in the teacher's game save, so they follow the teacher to
  any device (no backup files). **Sharing** saves the activity as a question set (one activity per set, only numbers and
  settings: the title stays in the teacher's save) and gives its link and QR code; saving again keeps the link.
- **Assign to a class** (school staff) opens the Assign page: "Students open: Long division, 16 problems, Guided", the
  lesson is named after it, and "Also post to Google Classroom" for a linked class. The end screen calls
  `BRB.gameOver({ won: true, score })` once per run: the step done, and the Classroom completion grade.
- **Fixed on the way:** Enter in a digit box no longer skips the result; the "to go" chip ends at the end; "1 problem".
- **Who's playing, class codes, practice, hints** (owner: the same as Algebra Builder's). Opened without a link, it asks
  first: a teacher gets their activities (with "Not a teacher?"), a student a class code or practising alone. A saved
  activity shows its class code in the share panel. Practising alone: long division or multiplication; Easy (2 digits
  by 1, no remainders / 2 digits times 1), Medium (3 by 1 with remainders / 3 digits times 1), Hard (4 by 2 / 3 digits
  times 2); and the help (Guided, Count up, On my own); 5 problems, none the student has had lately (the last 300 per
  kind and level in their save), "5 new problems" at the end. Checked over 30 sets each: no repeat in 150, except easy
  division's smaller pool (115). Hints: a Hint button in the bottom band, up to three per step from the step's own
  numbers (divide: how many fit, count up by the divisor, the digit; multiply: count by the digit, the carry;
  subtract, bring down, add, carries); it lights up as "Stuck?" after a failed Check or count, two wrong digits on the
  step, or 45 seconds on it. (Teachers already generate problems in the editor: ranges, How many, New problems.)
- **Left out:** help email, analytics, outbound links, backup and restore files.


## Classroom dashboards: the balance scale and algebra tiles by drag and drop (18 Nov 2026)
The owner asked for the Algebra widget's Balance scale to work "more like the algebra game": drag and drop, no switching
between Left side / Right side / Both sides, easier to try things and check. Later, the same for Algebra tiles ("can we
make this more intuitive?"). Only the interaction model comes from Algebra Builder (tools/algebra-builder); the widget's
code is its own (`public/js/dash-tools4.js`: `tileTray`, `tileDrag`, `balance`, `algebra`; the maths in
`public/js/dash-math4.js`).
- **A tray** above the model: a + / − switch (the sign new tiles have) and a tile of each kind (x and 1; x², x and 1).
  Tiles are dragged with Pointer Events (mouse, touch, pen); a lifted copy follows the finger and the place it would land
  lights up. Tap a tile, then tap where it goes, is the same without dragging; the keyboard is Enter, Tab to the place,
  Enter; Delete takes a tile away; Escape lets go. Every move is said (`ctx.say`), with whether the scale is level.
- **Balance scale:** no side dropdown. A tile dropped on a pan goes on that side only, and the scale tips: as far as the
  two sides' weights (with the secret x) differ (`tiltDeg`: 3° plus the difference, at most 12°, drawn as at most a fifth
  of the arm), and the readout says which side is heavier. **Both sides**, a drop zone at the scale's foot, does the same
  to both: a tile from the tray goes on both; a tile from a pan comes off both, and a side without that tile gets its
  opposite (taking away x is adding −x, as in the game). A pan's tile dragged off the scale (or onto the tray, or Delete)
  is taken away; onto the other pan, it moves there. ÷ n shows when every count shares by n; ± Remove zero pairs. "Try
  x = [−|4|+] ✓ Check" weighs the equation as it is now with that x: "Yes, x = 5: both sides make 20." / "Not yet: left
  3·4 + 5 = 17, right 2·4 + 10 = 18." It shows outside the readout, so it still works while the answer is hidden.
- **State:** negative tiles are `lnx lnu rnx rnu`, the x last checked `tx`; each kept only when set, so every saved
  balance cleans exactly as before (`where` is no longer set and is kept only for that). History steps add `addnx`,
  `subnx`, `mv…` and `zero`. Make a question counts negative tiles.
- **Algebra tiles:** tiles sort themselves into rows by kind; each zero pair sits together in a dashed box, explained
  under the mat. Drag a tile onto its opposite (or tap one, then the other) and the pair puffs away: "+x and −x make 0."
  Footer: ⇅ Flip sign, ± Remove zero pairs, 🧹 Clear (named by their tooltips, as the calm row has it). 🎯 Challenge:
  "Build 2x² − x + 3", 🎲 a new one, ✓ Check ("Yes! That is …" / "Not yet: you have … The x tiles don't match."), ✕
  Free play. State: `goal` [a, b, c] and `gk`, kept only when set.
- Words in all 12 languages; the fit check adds a full balance (negatives, tipped, checked) and a checked challenge.
  Tests: tests/unit/dash-algebra-drag.test.js (state, moves and tilt, Both sides, Check, rows and challenge, and a
  Chromium drag with a mouse and with touch, taps and the keyboard).

## Crossword: a teacher's vocabulary list as a crossword (18 Nov 2026)

Owner: "Create a crossword puzzle game where a teacher can upload their vocab words and you create a crossword puzzle
out of this. Allow them to also build manually, or just provide a list of words, and have AI create the definitions."
Then: "Let's make this outside of the Oomba Kit", "make it resemble more of the widget feel", and "make sure games are
played end to end twice assessing for UX/UI in all the nooks and crannies before shipping".
- **Where it lives.** `seed-games/crossword.html`, hand-written, on the Learn shelf (words, grades 2-8; migration
  0089_crossword_shelf, as each new Learn game). Its own page, not an Oomba Kit game: no scene, title screen or
  character. It looks like the classroom dashboard's widgets: cream cards with the group colour on the top edge and the
  icon chip, the schedule's dark "Now" block for the clue on now, a dotted mint board, light and dark (BRB.theme),
  Bricolage Grotesque from Google Fonts, a few BRB.sfx sounds and its own confetti (none with reduced motion).
- **Making one.** Paste a list or upload a .txt or .csv file (one word a line; a clue after a tab, dash, colon, = or the
  first comma; bullets, numbers and a header row are dropped), or type words and clues; 3 to 30 words, letters only
  (any script; spaces, hyphens and apostrophes are left out of the grid). **Write clues with AI** fills the missing clues
  (or rewrites them all) for a grown-up who may host: `services/set-ai.js draftClues`, the words as data, never the word
  or its family in its clue (a clue that gives its word away is dropped), the words' own language; the teacher reads and
  edits them and a note says some were written by AI. Options: a word bank, hints.
- **The grid** (`crossword-core` in the page, tested on its own): the most words crossing in the smallest square-ish
  grid, at most 25 a side, words never touching side by side, numbered in reading order; the same words and seed always
  make the same grid, so only the seed is saved. **Try another layout** changes the seed until the grid changes. Words
  that can't cross are listed ("These words didn't fit"), never forced in.
- **Sharing.** Save and get a link keeps it as a question set (`game_sets`, `cleanCrossItems`): the title, words and
  clues are the teacher's own text, so each passes the site's text filter (no rude words, personal details or links),
  as live quiz sets do. The class code, the link, a QR code (the site's own encoder, copied into the page), Copy, and
  Assign to a class (Also post to Google Classroom). The teacher's crosswords are listed on the game's home.
- **Playing.** Tap a square (again to turn) or a clue, type (one hidden field, so a phone's keyboard opens; arrows, Tab,
  Backspace and Space work); the clue on now in the dark bar; Check marks wrong letters, Hint fills one (if allowed);
  accents don't count against a student. Squares stay at least 30 px while playing: a big grid scrolls sideways in its
  box, following the square picked. Progress is kept between visits. Solved: the letters as written, a wave, stars
  (hints and checks), Play again, and one BRB.gameOver (the step done, the Classroom completion grade). A sample puzzle
  in every language (Traditional Chinese: 6 words, as its short words cross less) and a class code box for students.
- **Checked end to end twice** before shipping: desktop in light mode and English (upload, AI clues, a long title,
  layouts, play from the preview, keyboard, save, reopen, resume, check, hint, solve, play again) and a phone in dark mode
  (a wrong code, 30 long clues, a sign-in error on save, a missing link, Hebrew and Arabic right to left, Japanese kana).
  Fixed on the way: inputs that took the widget style, a ✓ on clues that were only full, a stale message after solving,
  tiny squares on a phone, and a layout button that could give back the same grid.
- **Documents, saving and sharing** (later the same day). Owner: "They should also be able to upload a pdf or word
  document and you should be able to take out the information from this and create the crossword puzzle", "There should
  also be a way to save these crossword puzzles so they can reference again", and "assign these or create a QR code and
  link for students to sign in and take the test".
  - **Upload a list or document** takes .pdf and .docx too (2 MB, inside the site's 3 MB request limit as base64). A
    .docx's text is read on the server (`services/docx-text.js`: the zip's word/document.xml, a table row a line with its
    cells apart by a tab, no outside library); a PDF goes to the model as a document (`set-ai.js draftWordsFromDoc`:
    the document's own word list and definitions when it has one, else its key terms; the document is data, never
    instructions; never stored or logged, only how many words). The words and clues land in the list for the teacher to
    check, and the document's title fills an empty name. An old .doc asks for .docx or PDF.
  - **Your crosswords** on the game's home: every draft saves itself a moment after a change (and with Save), kept in
    the teacher's game save, so it follows their account to any device (a guest is told to sign in to keep them). Each
    shows its words, when it last changed and its class code, with Edit, Play, Share and Delete (pressed twice).
  - **Share** from the list saves it on Oomba when it isn't yet and opens "Share with your students": the class code,
    the link, the QR code and Assign to a class (with Google Classroom), as from the preview.

## Crossword: word lists from a PDF or Word file, with limits (18 Nov 2026)

Owner: "For Crossword, can you also add the ability to upload a pdf or .docx that pulls out the words. To keep it from
getting too expensive, maybe we can set some sort of limit on size? It should only be a few pages at most for vocab
words." The upload from earlier the same day (above) is now called **Upload a word list (PDF or Word)**, with a line
under it giving the limits, and is kept cheap:
- **Limits** (`services/crossword-doc.js LIMITS`): a file of at most **2 MB**; a PDF of at most **5 pages** (counted
  from its page tree); about 5 pages of text read, **15,000 characters** (`set-ai.js DOC.textMax`, down from 40,000):
  a longer .docx or PDF is cut there at a line's end and the teacher is told ("only about the first 5 pages were
  read"); at most **30 words**. **10 files a day** for each account (`game-doc-day:<user>`, the site's in-memory rate
  limiter; a file turned away for its size, pages, type or for having no text doesn't count), and 20 a minute.
- **Text read on the server, no AI where none is needed.** A .docx through `services/docx-text.js` as before; a PDF
  through the new `services/pdf-text.js` (no library: the objects indexed, FlateDecode streams inflated with
  node:zlib, each page's text with its font's ToUnicode map, as Word, Google Docs and browsers write them). A PDF with
  no fonts is a scanned picture and is turned away before any AI ("We couldn't find any text in that PDF"). When the
  text is already a plain list (a word and its definition a line after a tab, " - ", ":", "=" or "|"; bullets,
  numbers, a header and wrapped definitions allowed; nearly every line one) it is used as it is (`listFromText`): no
  AI call, and no "written by AI" note. Otherwise one small call: `set-ai.js draftWordsFromDoc`, the question-set
  editors' own model (`config.builderModel`) at low effort, now with at most 4,000 tokens out, on the capped text; only
  a PDF whose text can't be read here (a font without a map) still goes to it as the file, and that is at most 5 pages.
  The call counts towards the site's AI spending cap as every set-ai call does (there is no per-teacher AI allowance
  for set-ai to count against).
- **Safe words and clues** (`cleanWords`): only words the crossword takes (`cleanCrossItems`' rules: letters in any
  script with spaces, hyphens and apostrophes, 2-24 characters, no word twice), each word and clue through the site's
  text filter: a word that fails is left out, a clue with rude words, personal details or a link is left empty, as is a
  clue that gives its word away. The AI prompt already treats the document as data and never repeats personal details.
- **Who:** signed-in staff (teachers, school admins) and the platform admin; never a kid or a guest. Family grown-up
  accounts are fenced off from the crossword's teacher calls (AI clues, saving a set) by `routes/family.js` today, so
  from this too.
- **Review before saving:** the words land in the editor's list to edit or remove; nothing is saved until the teacher
  saves. The file is never stored or logged (the audit line has only its kind, how many words, and whether AI or
  cutting was used). Errors each have their own words in 13 languages: too big, more than 5 pages, no text (scanned),
  the wrong kind of file, 10 a day, and the older ones.
- Tests: tests/unit/crossword-upload.test.js (PDFs and .docx files made in the test, `_crossword-files.js`; the AI
  stood in for through `crossword-doc.js hooks.client`).

## Crossword: print a puzzle (18 Nov 2026)

Owner: "Also, create a print option for the teacher or student to print off the crossword".
- **Through the platform, as data.** The game runs in a sandboxed frame with no `allow-modals` and no popups, so
  `window.print()` can't work there. A new SDK call, `BRB.print(doc)` (`brb:print`, docs/sdk.md "Printing"), hands the
  puzzle to the play page as plain data: the words and clues, the word bank option and the layout as numbers
  (`[word, 'a'|'d', row, col]`), whether to add the answer key, and the saved set's id. Never HTML.
- **Checked and drawn on the server** (`services/crossword-print.js`, `POST /api/games/:id/print`): the words, clues and
  title go through `cleanCrossItems` (the site's text filter, as a saved set's do); the server puts the letters down from
  the words itself (a layout that doesn't spell its words, runs off the grid or uses a word twice is refused), counts the
  clue numbers in reading order as the game does, and answers with the printable page in the viewer's language and
  direction. The play page puts it in a print area of its own and prints the PARENT page; the print CSS shows only that
  area. Why not a server print page for saved puzzles (`/play/crossword/print?chapter=…`)? The layout is made in the game,
  an unsaved draft has no set to read, and one path for drafts, saved puzzles and the sample is simpler; the layout comes
  from the game, but the server owns every letter and number printed.
- **What prints** (one page for most puzzles, US Letter or A4, black on white, no fills): the title, Name and Date lines,
  the empty grid (an SVG as wide as the page allows, with clue numbers; a Hebrew or Arabic puzzle runs right to left, as
  in the game), Across and Down with numbers and lengths, the word bank when the puzzle has it, and a small footer: "Made
  with Oomba Academy", and the class code and link when the puzzle is saved. A big puzzle's clues go on to a second
  page. The page's words are in the viewer's language (`play.print.*`, 13 languages); in Hebrew and Arabic the lists run
  right to left and the grid keeps its own direction.
- **The answer key is for teachers.** It is the filled grid on a page of its own after the puzzle. The game offers
  "Puzzle" or "Puzzle + answer key" from Print on the preview and share screen only when `BRB.canAssign` (school staff);
  everyone else gets the puzzle at once. The server checks again (`isSchoolStaff`, the same check as `canAssign`): a
  student, a kid, a family grown-up, a guest or a visitor asking for the key gets a 403 and no page.
- **Students** get Print on the play screen: the blank puzzle (never their typed letters, never the answers), to fill
  in by hand. Anyone who can open the game may print a puzzle (a teacher's unsaved draft, a shared set, the sample);
  family grown-ups may too (the fence lets `print` through with the other play-page calls). 20 a minute per address;
  nothing is kept; only after a tap.
- Tests: tests/unit/crossword-print.test.js (the request's checks and the text filter, the numbers against the game's
  own layouts, the page, the key's page, Hebrew, the route: who gets the key, the footer); tests/e2e/crossword-print.spec.js
  (the real play page in Chromium: a teacher's draft with its key and the saved puzzle with its class code, a student's
  blank puzzle, Hebrew; in print media and as PDFs in Letter and A4).

## Crossword: the teacher's own instructions on the printed puzzle (19 Nov 2026)
Greg asked for what The Big Divide shipped in #435: an optional line or two of the teacher's own on the printout.
- **The box.** "Your instructions (optional)" (300 characters, line breaks kept) under Print on the preview and share
  screen, wherever Print shows (`BRB.canPrint`). The play screen keeps just its Print button; a teacher's own crossword
  printed from there still carries its note. Nothing new for family grown-ups: the fence and frame flags are unchanged.
- **Where it is kept: the game's own save, not the question set.** The note is on the crossword in `SAVE.mine` (the
  teacher's crosswords, `BRB.storage`, saved with the draft's other fields by `remember`). A set's items go through
  `cleanCrossItems`, which keeps only `t`, `w`, `r`, `b`, `h`; widening that schema (and its text filter) for a print-only
  field wasn't worth it. So a student opening the shared set never sees or prints the teacher's note.
- **Printed** (`services/crossword-print.js`): sent as `note` with `BRB.print`; checked and cleaned by the shared
  `services/print-note.js` (a string of at most 300 characters, else `bad`; control characters other than a line break
  dropped, three or more line breaks made two, trimmed; blank is none), also used by The Big Divide. It prints in bold
  above the grid (`.cwp-mine`; the grid gives up a little height for it) and never on the answer key.
- Tests: tests/unit/crossword-print.test.js (escaped, line breaks kept, above the grid, not on the key, blank prints
  nothing, too long or not text refused); tests/e2e/crossword-print.spec.js (the box, kept on reopening, the printout,
  none on a student's print of the set, 390px phone).

## Shape board: labels you can read (18 Nov 2026)
The owner found the board's labels (corner letters, side lengths, angles, text labels) too small on the smallest Shape
board. They had one floor for all of them (13px on the screen, 16px on the projector) and were otherwise a fixed share
of the board, so on a 5 × 8 widget (a board about 280-330px across) every label sat at 13px.
- **Sizes** (`LABEL_SIZES`, `labelPx` in `public/js/dash-math4.js`): each kind is its share of the board, never under
  its own floor: letters 17px, side lengths 16px, angles 15px, text labels 18px, the ruler 16px (21/20/19/22/20px on the
  projector); on a big board they grow with it. Zoomed, they keep their size on the screen as before.
- **Placed, not just pushed out** (`placeLabels`): the angles first (they have least room, inside their shape), then the
  letters, then the sides. Each tries its own spot, then spots turned round its corner or side and a little further out,
  and takes the one that covers least: other labels, the text labels and the selected band's handles (most), the pegs,
  and its own band's sides. Labels still on another are tried again with the rest in place. An angle only turns a little
  and stays near its corner (so it is never read as another corner's); where a small shape on a dense board has no room
  it is drawn smaller, down to 12px (14px on the projector), never below, and only if that is not enough turns further
  round its corner. Labels stay inside the board.
- **Checked:** the fit check now fails when two of a shape board's labels sit on each other (the busy boards: twelve
  bands on 11 × 11 pegs, triangle dots, the circle, at the default and smallest sizes); unit tests cover the sizes, the
  placing and the 12px minimum.


## Schedule settings: the calendar and agenda as cards at the top, instructions folded (18 Nov 2026)
Owner: "Make this more modular and put it at the top of the widget. Instead of just having the text there put
Instructions with a drop down caret." Then: "Remove this from the individual days and just make it visible when you
click Give (that day) its own schedule."
- The schedule's settings open with two cards: **Connected calendar** (the `cal` setting now comes before `periods`)
  and **Import an agenda** (upload or paste; moved from the bottom of the periods editor to its top). Each card's long
  help (`calNote`, `uploadHint`) sits under "▸ Instructions", a `<details>` with a caret that turns when open (mirrored
  right to left); the calendar field still points at its text with aria-describedby. New words `instructions` and
  `agendaLabel` in 13 languages.
- On a weekday the cards are gone while the day uses Every day (only "Give Monday its own schedule" shows). Once the
  day has its own schedule, Import an agenda shows and imports into that day. The connected calendar fills every day,
  so it shows only on Every day.
## Machine Line: a clear board, the voice from the start, order of operations, drag and drop (18 Nov 2026)
Owner: "The machine line game seems to have that same sort of foggy distortion as another game yesterday ... the initial
instructions are the computer voice and not AI. Also, I am a bit worried that the game may confuse the student about
orders of operation. Can you create a solution for this?" And: "you should be able to drag and drop the numbers."
- **The fog.** The board (the line of machines, the values, the number line) was a sprite in the 3D scene, drawn
  brighter than white (1.12): the haze and, on Beautiful graphics, the glow (bloom) haloed every edge, as Crate
  Stacker's truck numbers were. The same picture is now a page canvas over the 3D view (drawn at twice its size, so it is
  crisp on any screen), placed every frame where the 3D board stands; the 3D board stays as the unseen stand-in that
  pops in, shakes and sizes, so nothing else moved.
- **The voice.** Round lines change every play (the numbers), so the warm-up can't have them, and the SDK reads a line
  that hasn't arrived in 4 s with the device voice: the first instruction was always the computer voice. The play's lap
  is now chosen while the start card or the menu shows (inside `playLap`, so tests that pin a lap still do), and the
  first round's lines (and the rule) are asked for then with `BRB.prefetchSpeech`; each round asks for its closing line
  and the next round's question.
- **Order of operations.** A line runs its machines in the order they stand; written down, brackets come first, then
  × and ÷, then + and −. Three things tie the two together: (1) while a line is built the board writes what it makes
  so far ("your line: 3(n + 5)" or "3n + 5"), the brackets showing where the order needs them; (2) Build the Line's
  first round opens with the rule, spoken: "Machines run in the order you put them. Written down, brackets come first,
  then times and divide, then plus and minus."; (3) the right-machines-wrong-order hints say why: "Without brackets,
  multiplying comes before adding or subtracting, so the times machine goes first." and "Brackets come first, so the
  plus machine goes first, then the times machine." (A wrong plan's board already writes the line it made beside what
  it should give.)
- **Drag and drop.** A machine block can be dragged onto a slot of the line (it goes in there and the rest move along;
  on a full line it takes that slot's place and the block there goes back), dragged from slot to slot, or dragged off
  the board to take it out. Taps and keys work as before; a ghost of the block follows the finger and the board is
  outlined while it would take it.
- tests/unit/machine-line.test.js (all ten, the browser play-throughs included) expects the rule and the new hints.


## Number Quest: a journey that is explained, steadier highlights, the AI voice in Lantern Mix (18 Nov 2026)

Owner, on the start of Number Quest: "The beginning to the story ... is super choppy and it seems a bit like I am just
being thrown into something without much instruction. Make sure the beginning of the journey is explained well and
really tells the student about the journey they are about to embark on." On a Pro lesson's bar picture: "the yellow
highlights are off ... these generally move way too quickly throughout the lesson". And on Lantern Mix: "the AI voice
was super hit or miss ... Sometimes it was the AI voice, other times it was the computer voice."
- **The welcome decks (0.1) tell the journey in order**, within each tier's own limits (slide count, length, reading
  level): where you are (Netville, the town that runs on numbers, and this tier's place in it), who guides you (Tally),
  what went wrong (the Jumble), what your quest is (Pro: climb the seven towers and win back the Great Clock's seven
  gears; Explorer: wake the seven workshops and win back the Measure Stones for the Vault of Measures; Launchpad: walk
  the garden path with Tally and win a seed in each garden), how each step works (a short lesson, three questions and a
  mission game; nothing timed; a hint after a wrong try), and only then a first look at the maths. Pro's welcome no
  longer opens with "Past the last workshop", which assumed a student had walked the street below (most Pro students
  are placed straight into the Towers). Pro 1.1 opens with "Your climb begins at the Mixing Tower, the first of the
  seven", tying the first lesson to the quest.
- **Highlights on bar and fraction diagrams snap onto their parts** (`server/views/courses.js snapBox`): the parts a
  box covers for at least half their area are the ones it names, and each edge within 2.5 units of them moves onto
  them, so the ring hugs exactly those parts (a box that also takes in the row's label keeps that edge). Pro 1.1's
  "2 parts of amber oil" ring had spilled past the bar's start and into the first blue part.
- **The guided-focus tour is unhurried** (`public/js/course.js gfStepMs`): the clean picture for 1.4 s, then each step
  as long as its cue takes to read (about 45 ms a character), 3.5 to 7 s, where it was 1.9 s; the steps and cues fade
  over 0.6 s and 0.5 s.
- **Lantern Mix asks for its lines before it needs them** (as Machine Line does since #407): a round's lines carry its
  numbers, so the warm-up can't hold them, and the SDK reads a line that hasn't arrived in 4 s with the device voice.
  Each chapter's lap is chosen while the lamplighter picker or the menu shows and its first question prefetched
  (`BRB.prefetchSpeech`); each round prefetches its closing lines and the next round's question as it starts. A wrong
  plan's hint depends on the plan, so it can't be asked for ahead and may still be the device voice when slow.

## Folders: drag to reorder, save in a pop-up (18 Nov 2026)
Owner: "Remove the up and down and just let users edit the order by clicking and dragging, or holding down and dragging
on mobile and tablet. You should be able to move the games around this way too. Make Save to folder a pop-up that asks
which folder, confirms it saved, and offers to return to the Oomba game list or go to the folder."
- **Reorder** (public/js/reorder.js): the folder chips under "My folders" (on Build and on every folder page) and the
  games in one's own folder are lists marked `data-reorder`. A mouse drags after a few pixels; a finger or pen holds
  still for 350 ms first, so a swipe still scrolls the page (a short buzz where the device allows). The item lifts and
  follows the pointer while the others make room (one column: above an item's middle goes before it; wrapped chips:
  reading order, mirrored right to left). A drop over a chip never opens it. Keyboard: a focused chip or a game's ⠿
  grip moves one place with Alt and an arrow key; the new place is announced ("Word Trail: 1 of 3"). Each change posts
  the whole order: `POST /api/game-folders/order` and `POST /api/game-folders/:id/order` with `{ ids }`
  (services/game-folders.js `orderFolders`, `orderGames`: only the owner's, unknown ids ignored, the rest kept after in
  their old order, one transaction). If saving fails the page reloads with the saved order. The ↑ ↓ buttons are gone
  (their routes stay for anything that still calls them). A short hint under each list says how.
- **Save to folder** (public/js/folder-save.js): every link to `/build/save?…` (the Oomba game list on /learn, a game's
  page, the Studio, folders shared with you, a lesson) opens a pop-up instead: "Which folder?" with each folder (one
  that already has the game is marked and can't be picked) or a new folder by name, then Save. The pop-up says "✅ Saved
  to Fun Games" and offers "Keep browsing" (closes it, so the teacher is still on the game list) or "Open Fun Games".
  Its data and words come from `GET /api/game-folders/save`; saving uses the existing routes, which now answer with the
  folder. A modifier-key click (new tab) and a browser without script still get the /build/save page.
- app.js loads both only where they are used (a list to drag, a click on Save to folder), with its own version.
- Words in 13 languages: `folders.pick`, `keepBrowsing`, `openFolder`, `reorderHint`, `move`, `moved`.
- Checks: tests/unit/games-not-lessons.test.js (both orders, owner only, the pop-up's data, the folder in the save
  answer, no ↑ ↓); in a browser: chips and games by mouse, games by touch hold-and-drag, a swipe not reordering, Alt +
  arrows, the order after a reload, and the pop-up into an existing and a new folder with both ways out.

## Class jobs: one card per job (18 Nov 2026)

The owner approved a mockup: the Class jobs settings had two big textareas (Jobs, Students) that didn't say who does
which job. Now each job is a card.

- **Cards** (public/js/dash-class5.js `jobsEditor`, EDITORS.jobcards in dash.js): a number, the job's name, ✕ (44 px,
  not on the last job), and a Student dropdown showing who has the job this week: the people, "— Nobody yet —" on an
  open job, and, for typed names, "✏️ Type a name…" (a field to add a name, which takes that job). ➕ Add a job under
  the cards (16 at most); an empty job is dropped when saved. With no jobs typed, the usual jobs are the cards and are
  saved once one is changed.
- **Students come from:** "Names I type" or "<class>'s students", saved as `from` ('names' | 'class'). Dashboards saved
  before have no `from` ('auto'): typed names if any, else the class, as before, so they show the same chart with no
  migration. Typed names are listed under it, each with ✕ to take it off.
- **Still positional.** Nothing new is stored for who does what: the sheet turns the people to shift 0 (job i is
  person i) and a change puts them in a new order (`names` text or `crew.order`), so Next week and Shuffle work as
  before. Picking someone already on a job, or waiting, swaps the two. An open job (more jobs than people) can't hold a
  person at its place, so picking someone for it moves the job up to that person's place (the two jobs change places,
  and the sheet says so); every other pair stays. Removing a job: its person takes the first open job or waits first
  in line; removing a typed name: the next one waiting takes the job, or that job moves after the others' jobs.
- **Waiting:** more students than jobs, the ones without a job this turn are one line under the jobs, "Waiting: Sam,
  Ava" (in the order they come in with Next week), on the widget and under the cards.
- The class's list is the teacher's live list (ids and names, teacher only); the widget now puts it in the saved order
  at once, so a change shows before the next check. Next week with typed names keeps the class's saved order.
- Words in 12 languages (`dash.w.jobs.*`). Checks: tests/unit/dash-stage5.test.js "class jobs cards".

## The site's own dialog; the live host's message box (18 Nov 2026)

The owner pressed Start on a live game with nobody in it and got the browser's grey `confirm()`. "Make sure this modal
is native to the application." The same day: "clean up the side console and get rid of all of the quick message
options. Just let teachers write in text and broadcast to everyone."

- **One shared dialog** in public/js/app.js, which every page loads (the bare live pages too): `ask({ text, title?, ok?,
  cancel?, danger? })` → true/false, `tell(text)`, `askText({ label, value? })` → text or null. A `<dialog>` opened with
  `showModal()` (focus trapped, Escape and a tap on the backdrop are Cancel, focus goes back after), `.ob-dialog` in
  app.css with the site's tokens: card, 20px corners, shadow-lg, Bricolage, pill buttons, the main one Mint, or Danger
  filled (`.btn-danger-solid`) for a destructive one, which also gives Cancel the first focus. On a phone the buttons
  stack, main one on top. Keys stay in the box, so a sheet under it or the live host's shortcuts never hear them.
- **Every caller moved** (12 scripts; `data-confirm` forms in app.js cover the server-made ones). The main button says
  what the action says: the form's or control's own button words (`verbOf`, without its emoji), a key that already
  existed (Delete, Start again, Archive, End it and open the new game), or new `live.host.startAnyway`; otherwise
  `js.app.ok` / `js.app.cancel`. Code that relied on `confirm()` blocking now waits: the school settings' "leave without
  saving" link stops first and follows the link on OK; forms submit after OK.
- tests/unit/no-browser-dialogs.test.js fails on any `confirm(`, `alert(` or `prompt(` in public/js, server/live,
  server/views and server/routes. The e2e helpers `answerDialog` and `autoAnswer` replace `page.on('dialog')`.
- **The message box** replaces the 10 fixed messages (`SAY`, `live.say.*` presets, the `💬 Message ▶` menu, the Teacher
  view's preset buttons): one labelled field (120 characters, `SAY_MAX`) and Send to everyone; Enter sends, empty can't.
  It goes the old way (`h say`, one per 3 s, broadcast `say` to every screen), now as `{ x: text }`. The server squeezes it
  to one line and puts it through `shownOk` (rude words, contact details, handles, links) before any screen shows it; a
  refused one is told to that adult only (`nak blocked`) and uses up no gap. The note under the field says Sent when the
  message comes back from the server. Trade-off: a fixed message showed in each player's language; a typed one shows as
  typed. Safety (docs/safety.md): still one way, adults only, filtered; players still can't type to anyone.
- **The side panel** is grouped: join info; the main row (Start in Mint, Pause/Next/Skip when they apply, End game in
  Danger); +time; an even grid (Lock room, Eyes up, Settings, Sound, Teacher view, Co-hosts, Read aloud); the message
  box. Every button 48px, one line, the same height at 1280, 1440 and a tablet (checked in tests/e2e/app-dialogs.spec.js).
## Folders in a sidebar, on Build and the class page (18 Nov 2026)
Owner: clicking a folder opened a separate folder page, which they didn't want. They picked mockup "option B": a folder
sidebar on Build and on the class page's Games tab, so a teacher never leaves the page.
- **One shelf for both pages** (routes/game-shelf.js `shelf`, `shelfReply`; public/js/shelf.js; `.shelf-*` in app.css):
  a left column of plain links and, on the right, what is picked. What is picked is in the address (`?folder=<id>`, or
  `?view=all` on Build, `?view=assigned | students` on the class page), so a reload, Back and a shared link keep it.
  shelf.js fetches the same address with the `X-Shelf` header, which answers the right side alone as JSON (`no-store`,
  `Vary: X-Shelf`), swaps it in, marks the item (`aria-current="true"`), pushes the address and says the new heading to
  screen readers; Back and Forward swap in place too. Without script, or with a modifier key, the link simply loads.
- **Build** (every builder): New game, "All my games" (n), My folders (each with its count, drag to
  reorder as before), + New folder, Shared by colleagues. The right side: the games (cover, title, Oomba game or My
  game with its status chips, Edit for one's own, Play, Assign for school staff, and ⋯: Remove from folder, Save to
  another folder, Rename and Delete for one's own). A folder's head: its name, "n games · Shared with <school>", Find
  Oomba games and a ⋯ menu (Rename, Share or Stop sharing, Move up, Move down, Delete). A colleague's folder is read
  only: "by <name> · Shared with <school>" and Copy to my folders. "Make your own game by chatting" stays as one compact
  line over the right side. Kids and students get the same sidebar for their own games and folders, with exactly the
  folder rights they had before (their folders, New folder, drag, Save to folder, Remove from folder, Rename, Delete,
  and Find Oomba games in a folder as on the old folder page); never Assign or Assign all, sharing, Shared by
  colleagues (staff only, as before), Find Oomba games on All my games, or a teacher's folders.
- **The class page's Games tab:** Build new game, "Assigned to <class>" (n: the assigned games with due dates and their
  ⋯ menus, as before: this replaces the Assigned games section), Find Oomba games, My folders and + New folder, Shared by
  colleagues, "Games students shared" (n: the old "Games from our class" box with Take off and Allow again), and Google
  Classroom at the bottom. In a folder each game has Play and "Assign to <class>" (a fold with the due day and Also post
  to Google Classroom; a draft, a live-only game or a problem-set game opens the Assign page, which says why; a game the
  class already has says ✅ Assigned), and the head has "Assign all N" (`POST /api/teach/assign-folder`: every game the
  class can play and doesn't have, one due day, Classroom posts when asked; the rest are skipped and counted). Assigned
  is picked by default when the class has assignments, else the first folder, else the empty Assigned with its hint. An
  archived class shows no Build or Assign. The header, the tabs and Progress, Students and Settings are unchanged.
- **Old links:** `/build/folders/:id` redirects to `/build?folder=<id>` (a folder you can't open is still not found); a
  retired lesson's editor link, the Save to folder pop-up's "Open <folder>" (the class page's own sidebar when saved
  from there), a new folder and a copied one all open in the sidebar. A folder made, copied or deleted from the class
  page (its `classId`, only for a class you manage) comes back to the class page.
- **Phone (≤ 820 px):** the column becomes New game full width over one row of chips (the current one dark, New folder
  dashed) that scrolls sideways on its own; group names stay as the lists' names for screen readers. Game rows put
  Play, Assign and ⋯ under the title; the Assign folds open in place. No sideways page scroll at 360 to 390 px, right to
  left too.
- Nothing widens who sees what: folders are the owner's or shared with their school, games only those they can open,
  every folder API keeps its owner check (a shared folder answers 404 to every change), Assign stays school staff only.
- Strings (13 languages): folders.allGames, assignedTo, studentShared, fromClass, sideClass, assignTo, assignAll,
  assignAllNote, assignAllDone, assignAllSkipped, assignAllNone, assignedChip, assignedWhere, saveAnother, moveUp,
  moveDown, sharedEmpty; folders.why (the old strip's line) removed.
- Tests: tests/unit/folders-sidebar.test.js (both pages, the address and X-Shelf, the redirect, read-only shared
  folders, Assign all, a kid's and a student's own folders without assign, share or colleagues),
  tests/unit/folders-sidebar-browser.test.js (Chromium: in place with no page
  load, Back, reload and keyboard; Assigned first; Assign from a folder; chips at 390 and 360 px and right to left;
  dark). Updated: games-not-lessons, lessons, class-sharing, builder-setup (New game's classes), e2e lessons and
  school-teacher-mobile.

## Timer: settings that stick, tap the time (18 Nov 2026)

The owner (teacher's screen, an iPad): "There is no way to save a new timer time or change in settings", and the
time should change with a tap on the digits.

- **Why the time did not change.** Starting minutes was saved, but a timer that had run once (Start, a quick time,
  Reset) has a run on the server (`dash_class.timers`: `{ mode, dur, base, start, on }`), and every screen showed that
  run's `dur`, never the new minutes. Now saving the layout with other Starting minutes for a countdown gives its run
  the new time (services/dash.js `retimeTimers`/`retime`): stopped or finished, it waits at the new time; running, it
  keeps running from it. Each run now records the minutes it follows (`m`); the page shows a run whose `m` differs
  from the widget's minutes with the new time at once, before the server has it (public/js/dash-widgets.js `retime`).
  Runs saved before `m` have none and are shown as they are; nothing to migrate.
- **Fields that never let go.** Safari fires no `change` on a number field until it loses the focus, a tap on ✕, the
  backdrop or a button doesn't take the focus, and a field taken out of the page fires nothing: a typed number could be
  lost when the sheet closed. Now the sheet (public/js/app.js `sheet`, every sheet) blurs a focused field inside it
  before closing, so its `change` runs; leaving edit mode does the same for the side panel; number fields are kept as
  they are typed (in range; out of range waits for the field to let go, then is clamped), saved with the usual 700 ms
  debounce, and closing the board's settings sheet saves at once.
- **Done and Saved.** The board's settings sheet has Done (at the end of the row with Undo): it closes, and a change
  made in the sheet shows a "✓ Saved" toast once the server has it; while open, "✓ Saved" (role=status) shows by
  Undo after each save. Nothing changed: no toast.
- **Tap the time.** On the teacher's board (not the projector, edit mode, a student's screen, a copy, or the
  stopwatch) the countdown's digits are a button ("Tap to change the time": the dark tooltip, a dotted underline and a
  pencil on hover or focus, a faint underline on touch screens; the hint is also its description for screen readers).
  It becomes a field the same size (`inputmode=decimal`, "m:ss"): "8" or "8:30" (also "8.30"), 1 second to 180 minutes
  (the settings' and the server's limit). Enter or leaving it sets it, Escape keeps the old time; a bad time on Enter
  shows what to type (role=alert) and stays, a bad time on leaving is dropped. Whole minutes other than Starting
  minutes change that setting (saved with the layout; the run takes it as above); anything else (8:30, or the same
  minutes to start over) sets this run's time (`set`, with `run: true` so a running timer keeps running from it);
  Starting minutes stay. Announced: "Timer set to 8:30".
- Words in 12 languages (`js.dash.side.done`, `.saved`, `dash.w.timer.edit*`). Checks:
  tests/unit/dash-timer-edit.test.js (each way of closing, mouse and touch, reloaded; Done; tap, Escape, bad input,
  running, the projector, edit mode).

## Box by Box is now The Big Divide (18 Nov 2026)
Owner: give Box by Box a better name; they chose a fun one, **The Big Divide** (en and en-GB).
- **Only the name changes.** The slug `box-by-box`, every `/g/box-by-box` link and QR code, the `BRB.storage` keys
  (`box-by-box-activities-v1`, `box-by-box-seen-v1`), the question-set game key in `server/services/game-sets.js` and
  saved set codes all stay, so saved activities, shared links and Classroom posts keep working.
- **Where the name lives.** `seed-games/box-by-box.json` (`title`, and `l10n.<lang>.title` for each of the 12 other
  languages), `server/services/tts-lines.js`, and in the game one line, `tools/box-by-box/src/lib/name.ts`: the pages, the
  footer, the browser tab, `index.html`'s `<title>` (vite.config.js) and the built file's banner (build.mjs) all read it.
  A later rename is those three lines, a rebuild (`npm run build:box-by-box`) and `node scripts/covers.js box-by-box` plus
  `node scripts/og-images.js box-by-box.jpg` (the cover shows the game's header, the share picture prints the title).
- **Translations.** Playful names in the same spirit, not word for word: La Gran División, La Grande Division, Die große
  Teilung, A Grande Divisão, La Grande Divisione, De Grote Deling, Великое деление, החילוק הגדול, القسمة الكبرى, わり算大作戦,
  除法大挑戰. A top-level `l10n_note` in the seed JSON tells translators so (the importer ignores it, so it never reaches
  the database or search). The descriptions are unchanged and still say long division and multiplication; the English tags
  gain "box by box", so a teacher searching the old name still finds it.
- **The live database.** No migration: the seed runs on every boot and `scripts/import-game.js` updates an existing official
  game's title, description, tags and `l10n` from its JSON (`games.updateMeta`), so the deploy renames the row in place.
  Lessons, assignments and Classroom posts made before keep the name they were saved with.
- This log's entry above keeps its heading, "Box by Box", as written at the time.

## The Big Divide: the ladder, area models and partial products (18 Nov 2026)
Teachers asked (Instagram, passed on by the owner) for "the ladder method for division problems ... keep those numbers
whole" and "multiplication area model and partial products, as well as other ways of doing division". Each activity now
has a **method**; the standard algorithms stay the default.
- **The methods.** Division: Standard, Ladder (partial quotients), Area model (box method). Multiplication: Standard,
  Area model, Partial products. The math is in `tools/box-by-box/src/lib/methods.ts` (pure, so the tests load it in
  Node); `lib/Work.svelte` lays each one out on graph-paper squares and `pages/MethodPlayer.svelte` plays it. The
  standard methods keep their own player (`Player.svelte`, untouched); `App.svelte` picks the player by the method.
- **Ladder and area model for division: any valid path.** The work is worked out again from what has been typed: a
  rung (or section) is a choice (how many divisors to take away), its product and its difference, and a new rung opens
  while what's left still holds the divisor. A choice is right when it is a whole number, at least 1, whose product is
  no more than what's left (`chooseCheck`); the product and difference must follow from it; the quotient (the choices
  added up) and the remainder (what's left at the end) must be right (`checkLadder`). At most 10 rungs: the tenth must
  finish. Hints suggest a friendly multiple (the biggest of 1000, 100, 10, 5, 2 that fits, then the biggest place-value
  multiple). Watch, and the worked answer after two tries, take the biggest place-value multiples (945 ÷ 7: 100, 30, 5).
  Count up picks the choice with ▲ ▼ through 1, 2, 5, 10, 20, 50, 100 … (up to the first that is too many) and the page
  writes the product.
- **Area model and partial products for multiplication.** Both factors break into place-value parts (406 is 400 + 6:
  a zero digit makes no part); a box (or a line) for each pair, then the sum. Count up skip-counts the leading digits
  (40 × 20: by 4s, 2 times) and the page writes the product with its zeros. The area model's boxes are listed again,
  as typed, above the sum.
- **The same support and feedback.** Watch, Count up, Guided and On my own (and older Prompted or custom mixes) work for
  every method; Guided marks a wrong number at once (only its wrong digits, lined up on the right), a choice that doesn't
  fit says why; Check, a second try, then a worked answer; Hint, Stuck?, sounds, confetti and `BRB.gameOver` as before.
  Each field is a number typed into a row of squares (one hidden input over them, so the phone's number pad and the
  keypad work); the squares size themselves to fit the screen (26 to 50px), and wide work scrolls inside the page. The
  work is always left to right (`dir="ltr"`). The game has one look in light and dark, as before.
- **Saved and shared.** The activity keeps `settings.method`; the shared item has `m` only when it isn't standard, so an
  item saved before (and a standard one now) is exactly what it was and old links, codes and lessons are unchanged.
  `cleanBoxItems` takes `m` only from the kind's own list (`BB_METHODS`), drops `standard`, and refuses anything else;
  `describe` names it: "Long division, 3 problems, Ladder, Guided" (no name for the standard one).
- **Teachers and students.** The editor has a Method choice (each with one line, and "How students work it"; a picture
  of a finished example in place of the mode demo). Students practising alone pick "Which way" too (kept per kind in
  their save). About explains each method for kids. The game is in English (US spelling); the seed JSON's description
  and tags mention the methods in every language (en-GB: chunking, grid method; nl: hapmethode).
- Tests: tests/unit/box-by-box-methods.test.js (paths, invalid steps, remainders, parts, items, and each method in the
  built game in Chromium, Guided and On my own, plus Watch, Count up, wrong digits and the worked answer);
  tests/unit/box-by-box.test.js (the method in sets and labels).

## Action tiles on the class page, on phones (18 Nov 2026)

- **What.** Below 640px (the class header's own phone breakpoint) the teacher's class page shows a 2×2 grid of tiles
  under the header, over the tabs: Host a live game (green, the main one), Class dashboard, Build new game and Find
  Oomba games, each an emoji over its label and a plain link to where today's button or chip goes (`/live?class=`,
  `/class/:id/dashboard`, `/build/new`, `/learn`). Approved mockup "B — Action tiles". Wider screens (tablets and
  desktop) are unchanged: the grid is `display:none` there.
- **Rendered once, CSS picks.** `classTiles()` in routes/schools.js renders the tiles in `classHeader()`, so every page
  with the class header (all tabs, Progress, Standards, the Classroom page) has them, under the same conditions as the
  buttons (Host: live on, may host, class not archived; dashboard: `DASH.isTeacher`; Build and Find: the school's
  staff, class not archived, as the Games tab's sidebar). On phones the header's two full-width buttons, the shelf's
  Build button, its Assigned and Find chips (`.shelf-cltop`) and its Google Classroom foot are hidden by CSS. No script.
- **Games tab leads to Assigned.** The tab links to `/class/:id?view=assigned` (a bare `/class/:id` opens the first
  folder while nothing is assigned), so on a phone, without the Assigned chip, the tab is the way back to it. Desktop
  keeps the sidebar item; a bare `/class/:id` (from My classes) still picks as before.
- **Chips wrap.** On the class page on phones the folder chips (yours, New folder, shared, Games students shared) flow
  onto several lines instead of scrolling sideways. Build's own chip row is unchanged.
- **Google Classroom.** `gcLessonsButton()` is unchanged; schools.js passes its output to `assignedPane(req, c, { tools })`
  (routes/lessons.js), which puts it in the Assigned card's head in `.shelf-phone-tools`, shown only on phones, small
  and auto width. Wider screens keep it in the sidebar's foot. On a phone it shows on the Assigned view only.
- **Header.** The Classroom status chip is 44px tall on phones (it was 36px); long class names wrap
  (`overflow-wrap:anywhere`), the school name ellipsises. No new strings: the tiles reuse `live.entry.host`,
  `dash.entry.teacher`, `folders.buildNew`, `folders.findOomba`.
- Tests: tests/unit/class-tiles.test.js; folders-sidebar(-browser) and the mobile e2e updated.
- **Fix: the second problem on (owner: "works perfectly for the first question and then starts to not work after the
  second").** From problem 2, the work stopped following what was typed (68 ÷ 2: 34 on top, then "What is ? × 2?", no
  difference box, so no Check), in the ladder and the area model for division (multiplication's work doesn't change with
  what's typed, so it only looked right). Cause: each field's input had `bind:this={inputs[f.id]}` inside the
  `{#key index}` work; when the last problem's work was taken down, Svelte read that field again to clear the binding,
  which ran the player's `work` once more against the last problem's `values`, and that left `work` listening to the
  old problem's fields. Now the player finds a field's input by `data-field` when it needs it (no `bind:this` in the
  work), and `values` is `$state.raw`, a new object on each change (`put`), so the work depends on that one value.
  Tests: three problems in a row for each method, Guided and On my own, on a phone, every Guided question checked; the
  area model by a class code and in Practice.
- **The area model for division, checked against the classroom model** (Common Core 4.NBT.6 and 5.NBT.6, as Eureka
  Math and Illustrative Math draw it: the divisor on the side, a section side by side for each place-value chunk, its
  width on top, its area inside, what's left carried on, the widths added). The layout and the checking already were.
  Now its words are: "How wide is this section? ... A place-value chunk like 10, 20 or 30 works well", "The section's
  area: what is 30 × 2?", Watch says "Make a section 30 wide", and the hints lead with the biggest place-value chunk
  (3 × 2 = 6, so 30 × 2 = 60). A first section that takes the whole quotient at once (34 for 68 ÷ 2) is right, but
  Guided says once "Try a friendly chunk like 10, 20 or 30 first, or press Next to keep 34" (`wholeChunkAdvice`). On a
  phone the squares size to the place-value path's sections (945 ÷ 7: three), so the whole rectangle fits. The ladder
  keeps its words. The multiplication area model ((40 + 6) × (20 + 3): a box for each pair, then the sum) was right.

## Crossword: a parent sees only what works for them (18 Nov 2026)
Owner: "Hide those for parents." A family grown-up's Crossword showed the teacher tools that the fence
(routes/family.js `grownupMay`) refuses them, and they failed when tapped.
- **One rule:** the frame asks the fence (`fenceLets(u, method, path)`, exported from routes/family.js) for the calls a
  button would make, so the page and the server cannot drift. AI clues and reading a PDF or Word file (`clues`, now
  also needing the fence to allow `/clues` and `/words-from-doc`), saving a set (`setSave: false`) and looking up a
  class code (`setFind: false`). The SDK has `BRB.canSaveSet` and `BRB.canFindSet` (false only when the frame says so).
- **Hidden for a parent:** Write clues with AI / Rewrite all clues with AI, Upload a word list (PDF or Word) and its
  limits line (the file picker takes .txt and .csv only), the "Grade or level (for AI clues)" field, Save and share on
  the preview, Share in Your crosswords, and the class code box on the home screen.
- **Kept for a parent:** typing or pasting words, a .txt or .csv list, drafts in Your crosswords (their game save),
  Try another layout, Play it, and Print (the puzzle, never the answer key). Step 1's note says "or type it in step 2"
  instead of offering AI, and Step 2 says "Type a clue for each word." (`addPNoAi`, `typeClues`, in all 13 languages).
- Teachers are unchanged. A kid or a teacher without AI also gets the no-AI wording (they never had the AI buttons).
- Tests: tests/unit/crossword-family.test.js (the fence, each account's frame flags, and the game in Chromium with the
  frame the server sends: a parent sees none of the tools above, a teacher sees them all, both make, play and print).

## The Big Divide: remainders, decimals, addition and subtraction (18 Nov 2026)
From 215 teacher comments the owner approved four changes, each put into a choice the game already had (or one it
replaces), so nothing new to learn for anyone who doesn't want it.
- **A bring-down arrow that stays.** After each bring-down in long division, a small arrow is drawn from the digit
  straight down to where it was brought, and it stays, as on paper. It is drawn when its box is filled (`after` on the
  `arrow` cell in `logic.ts`; Watch, Guided and Count up slide the digit down first, On my own draws it when the student
  types it), lit with its step under the spotlight, and nothing else ever sits in its column on the way down. Visual
  only, no setting.
- **Remainders: none, R, fraction or decimal.** The Remainders switch is now one choice of four (`REMAINDER_OPTIONS`,
  `logic.ts`); R is the default. Old saves and links read on as R and off as none (`remainderForm`); a fresh set per
  student keeps `g.remainders` as true or false, as before, and the form rides in the item's `r` only when it is
  `fraction` or `decimal`, so every set saved before is the same JSON. Only None changes which problems fit, so only
  going to or from it makes new problems.
  - *Fraction:* the last difference is what's left (no R); then the student writes it over the divisor in half squares
    beside the quotient (7 2/3), box by box. Any equal fraction is right (2/4 or 1/2), and a simplified part may leave a
    box in front empty (`fractionRight`); a top no equal fraction can have is marked at once in Guided. The ladder and
    the area model write it as "135 2/7" after the quotient, the same rule (`accept` on the field).
  - *Decimal (one rule):* when digits run out and something is left, the student writes a decimal point and a 0 after
    the dividend (745 is 745.0), lifts the point straight up into the quotient (an arrow up beside it), brings the 0
    down, and keeps going, another 0 at a time. **Stop when it comes out exactly, or at 2 decimal places.** Stopped
    with something left, the answer ends in "…" (745 ÷ 6 = 124.16…), and the answer line says what it rounds to ("Rounded
    to the nearest hundredth, it's 124.17"), so no digit already written ever changes. Repeating digits aren't marked:
    two places is enough to see them, and rounding is what grade 5 and 6 work asks for. The bracket grows over each
    zero as it is written. Standard method only: the ladder and the area model take away whole groups, so there a
    decimal remainder is written as R and the editor doesn't offer it.
- **Numbers: whole or decimals.** A second choice next to the ranges, in the editor and in Practice (`NUMBERS_CHOICE`,
  `NUMBER_KINDS`); it keeps the ranges (age-appropriate as they are) and places a decimal point in the numbers made from
  them, to hundredths (CCSS 5.NBT.7, 6.NS.3). Typed problems take decimals (a point or a comma) only in a decimals
  activity. The item carries `dec: 1`; without it a decimal problem is still refused, as before. Decimals use the
  standard method (the ladder and the models break up and take away whole numbers), and division answers are decimals
  (the Remainders choice steps aside).
  - *A decimal dividend (12.6 ÷ 4):* the first step lifts the point straight up into the quotient (typed: the box takes
    a "." and the keypad gets a point key), with its arrow; then divide as usual, a 0 written on the end when it is
    needed, as above. Problems made from a plan always come out by hundredths (half of them a multiple of the divisor,
    half needing a 0 or two written on).
  - *A decimal divisor (4.5 ÷ 0.3):* the problem as given sits above the work, each point on its grid line with a hop
    drawn over it; the first two steps move the divisor's point to make it whole (0.3 × 10 = 3) and the dividend's the
    same number of places (4.5 × 10 = 45, a faint 0 where a place is empty: 4.5 ÷ 0.25 is 450 ÷ 25); the student types
    the new numbers into the bracket, and divides them.
  - *Decimal multiplication (2.4 × 1.3):* the points sit on the grid lines, so every digit keeps its column; the student
    multiplies as whole numbers (the first question says so), then the last step asks how many decimal places the
    answer has (1 + 1 = 2), and the point is drawn where the typed count puts it (a wrong count shows where it would go).
    A zero goes in front where the answer is short (0.2 × 0.3 = 0.06), and an answer ending in zeros says they can go
    (5.00 is 5).
  - Decimals are checked as text and whole numbers of hundredths (`numbers.ts`), never as floating point; the server's
    `bbDecCheck` follows the game's rules (tested against them on 8,000 random problems).
  - Fixed on the way: the editor scrolled sideways on a phone by 12px (its one-column grid was `1fr`, so a tile's
    min-content could widen it); it is `minmax(0, 1fr)` now.
- **Addition and subtraction.** Two more kinds beside Long division and Multiplication (`columns.ts`; `KINDS` in
  `logic.ts`): two to four digits each (10 to 9,999; subtraction takes the smaller from the bigger), or decimals to
  hundredths with Numbers set to decimals. Laid out in columns with a row of small boxes above for carries and
  regrouping; with decimals the points share a column, shorter numbers are padded with faint zeros (3.5 over 2.75 is
  3.50), and a step brings the point straight down into the answer.
  - *Carrying:* each column from the right is a step; a column of 10 or more writes its ones, then a carry step writes
    the 1, small, over the next column. A last carry past the digits goes straight into the answer ("Write the 1 you
    carried").
  - *Regrouping:* when the top digit is smaller, the digit it borrows from is crossed out and one less is written over
    it (a small box), and the column that borrows gets a small 1 in its corner (2 becomes 12). Across zeros (400 −
    167): cross out the 4 and write 3; the tens' 0 gets its 1 (10) and is crossed out for 9; the ones get their 1;
    then 10 − 7, 9 − 6, 3 − 1. Each is a box, so Watch, Guided and the hints say why; a crossed-out digit is drawn as
    soon as what replaces it is written (`crossBy` on a given cell, `crossedBy` for a box). No box for a zero in front
    of the answer (400 − 367 = 33), but the ones (0.75) always.
  - *Support levels:* Watch, Guided and On my own as for the other kinds. Count up counts each column with ▲: on from
    the top digit (8, 9, 10 …) for addition, and up from the bottom digit to the top one for subtraction (the count is
    the answer); the page writes the digit and the carries, and the student types the regrouping and the point. Hints,
    Check, the second try, scoring and `BRB.gameOver` are the player's own, unchanged.
  - Teachers make them like the others (ranges for the top and bottom numbers, Numbers, a fresh set per student); the
    Method section is hidden for a kind with one method. Practice has them too (Easy 2 digits, Medium 3, Hard 4). The
    server takes `k: 'add' | 'subtract'` with the same rules as the game (`bbCheck`, `bbDecCheck`; tested against the
    game's own on random problems) and names them in the label ("Subtraction, 12 problems, decimals, Watch"). The game
    keeps its name; the seed JSON's description and tags (every language) mention addition, subtraction, remainders and
    decimals.
- **UI strings** stay in the game's source (English, US spelling) as before, gathered where they are used: the choices
  in `REMAINDER_OPTIONS`, `NUMBERS_CHOICE` (`logic.ts`) and `NUMBER_KINDS`, `HARDS` (`practice.ts`); each step's
  prompt, told line and hints next to the step that asks it (`logic.ts`, `columns.ts`), as the game already did, so
  a translation pass can take them from those places.
- Tests: tests/unit/box-by-box-math.test.js (the math: fractions, decimal digits and the stop rule, the point lifted,
  divisors shifted, decimal products, carries and borrows across zeros, the server against the game on random
  problems); tests/unit/box-by-box-kinds.test.js (Chromium, on a phone: three problems in a row for each new kind and
  option, Guided with every question read and On my own, 400 − 167's questions in order, the arrows, Watch and Count up
  for each); tests/unit/box-by-box.test.js (sets: `r`, `dec`, the new kinds, old sets byte for byte, labels).
- **Layout fixes after review.** A decimal point no longer takes a grid column: it is drawn on the line after the last
  whole digit, the same in the quotient, the dividend and the answers of addition and subtraction (the point the
  student types is a small box on that line). Digits stay in adjacent columns, so 1 and 0 brought down read "10"; the
  lifted point's arrow runs up in the gap before the first decimal digit. Each minus sign sits right before its
  product's first digit (a leading 0 isn't written). In regrouping, a digit that gets a small 1 is nudged right to make
  room in the corner, and a strike covers only the digit, so the 1 stays clear of it.

## Classroom activity vs Arcade game, and Oomba Canvas (18 Nov 2026)

The owner asked that classroom builds stop using the Oomba Kit and feel like the Big Divide or the dashboard tools: a
calm canvas where students work, with the arcade games kept for fun. Phase 1 of the approved plan ("Classroom activity
vs Arcade game / Oomba Canvas"), with the owner's decisions:

- **"What are you making?"** is the first question of `/build/new` (`server/routes/build-setup.js`,
  `public/js/buildsetup.js`): **Classroom activity** or **Arcade game**. Classroom activity starts selected for every
  teacher (`teacherHost`) and whenever the page is opened from a class (`?for=class&class=<id>`: the class page's phone
  tile and its shelf's Build button); kids and families start on Arcade game. One tap switches, and kids may build
  activities too. Arcade game leads to today's steps, unchanged. The eight board starters stay as their own choice, the
  "Classroom tools" link under the cards (it opens the game-type step on its "For your class" group).
- **The class only gives a grade.** The class id is used only when this user may manage that class (`canManageClass`,
  not archived); the page gets its name (for the chip "For 4B · Grade 4" and the way back) and its grade (for the topic
  chips). The plan carries the grade and `forClass: true`, never the id, a name or anything about students; only the
  topic and the grade reach the model. A link to someone else's class opens the page as usual.
- **The canvas path** is three short steps: what to practise (a typed topic, screened like any message, or a chip of
  `plan.js CANVAS_TOPICS` for the grade: each chip is a kit tool and a generator), how much help (Watch, Count up,
  Guided, On my own: the Big Divide's words) and how it is played (their own devices, the board, or both; Live is said
  to come later and is greyed out in the Studio's live line with the reason). "I know what I want" with Classroom
  activity picked starts from the activity starter, so the Builder works on an activity from its first message.
- **Plan engine `canvas`.** `normalisePlan` keeps `{ kind: 'activity', topic, tool, support, played, grade }` (known ids
  only); `planEngine` returns `{ engine: 'canvas', … }`; `planNote` writes its SETUP CHOICES (start from "canvas", the
  topic's generator, data only); `engineFor` sets `state.canvas`.
- **Oomba Canvas 1.0.0** is a new kit, beside Kit 1 and Kit 2 (none of whose files changed): source in `canvas/src/`,
  frozen at `public/vendor/oomba-canvas/1.0.0/` (locked in `canvas/SHIPPED.json`, hash in
  `server/services/canvaskit.js`), docs in `docs/canvas-api.md`. Four manipulatives (fraction bars: make, shade,
  compare; the number line: point, jump; digit boxes: column add, subtract, multiply; tiles: sort, order), each with
  the dashboard's pure contract (`clean`, `start`, `check → { ok, hint }`, `solve`, `steps`, `hints`, `gen`), written
  for the kit and frozen with it, never imported from the site. The look copies the site's tokens (a test compares them
  with app.css) because a game frame cannot load the site's CSS; the band with Check, Hint and Clear stays at the
  bottom on phones; Hebrew and Arabic read right to left while the maths reads left to right. In-game words live in
  the kit in the 13 site languages, as the classroom starters do.
- **Behaviour.** Students tap, drag and type digits through the kit (no text field anywhere); each student's place
  resumes from their own game save (`oc-progress-v1`), with a fresh seeded set and a "seen" list; up to three hints a
  problem and "Stuck?" after a failed Check or 45 s; a second try, then the worked answer. Results go the way games
  report today: `BRB.gameOver({ won: right === total, score: right })` once per set (none when played on the board).
- **The answer key is checked before it exists.** An activity is JSON data in an `oc-activity` block, so the server
  reads it and runs the kit's own frozen file on it (`canvaskit.js selfTestHtml`, `autotest.js canvasSelfTest`): every
  problem (or 30 a generator makes) must be solvable by its worked answer, an empty start must never count as right,
  and steps and hints must be there. `tools.js saveVersion` refuses a version that fails, naming the problem for the
  model ("problem 3: cannot be solved: 5/6 cannot be made with pieces of 1/4"), so a broken activity never becomes a
  version and can never be shared or published; the playtest report lists it too. Publishing rules are unchanged.
- **Prompting.** `CANVAS_RULES` (generated from `docs/canvas-api.md` by `scripts/build-canvas-rules.js`) is a separate
  block sent only for canvas builds (a canvas plan, an activity version, or the Studio's fixed switch message), with no
  cache point of its own. `SYSTEM_PROMPT` and `TOOLS` are byte for byte what they were (the starter "canvas" is kept
  out of the cached tool list's enum on purpose; the rules name it). The model fills in data; the kit checks.
- **Safety unchanged.** The scanner and sanitiser are as they were apart from `checkCanvas` (exactly the pinned tag,
  like `checkKit`); the frame's CSP and the screenshot worker allow `/vendor/oomba-canvas/` for the kit's script and
  font only. Read-aloud speaks the fixed `task.say` line only.
- **Studio.** Under the safety line: "Classroom activity · results go to Progress" with "Make it an arcade game
  instead"; an arcade game made from a class gets "Make it a classroom activity". Each is a fixed, translated Builder
  message (`prompt.js wantsCanvas` knows them in every language), like "Make it live".
- **Later phases, not built:** the Gradebook Score for activities, live canvas runs, class codes and Assign for Builder
  activities, the Studio's Activity panel and the in-activity teacher controls. The lesson's "new game" button still
  opens the Studio directly (it skips the setup steps), so it does not pass `?for=class` yet.
## The Games tab on phones: two clear tabs (18 Nov 2026)

- **Why.** On a phone the Games tab mixed "my library" with "this class": folder chips looked like tabs, the green
  full-width Assign button was louder than the game, the order was explained in prose ("Drag to change the order…"),
  and colleagues' shared folders looked like one's own. Approved mockup "Option B: two clear tabs".
- **What.** Below 640px (the class tiles' breakpoint) the shelf (`.shelf-class`) is hidden and a phone block
  (`phoneLib()` in routes/game-shelf.js, `.lib` in app.css) shows instead: a two-part switch, "📌 Assigned (n)" |
  "📁 My library", Assigned by default. Tablet and desktop are unchanged: `.lib` is `display:none` there, and the
  shelf's markup is byte-for-byte what it was (before/after screenshots at 768, 1024 and 1280 are pixel-identical).
- **Rendered twice, CSS picks.** The server renders both the shelf and the phone block; the phone block's ids start
  `lib-` so nothing clashes. Its state is in the address, the same as the shelf's: `?view=assigned | library | all |
  students`, `?folder=<id>`, and `&reorder=1`. Every part is a plain link (no script, Back and reload keep it), and an
  address made on a phone still opens sensibly on a wide screen (`library` and `all` fall back to the shelf's default).
  public/js/shelf.js only touches the shelf, so it ignores the phone block.
- **Assigned.** `assignedPane()` (routes/lessons.js) now also returns `phone({ base, reorder })`: "Assigned to {class}",
  "n games, in the order students see them", "+ Add from library" (to My library) and "↕ Reorder"; then compact rows
  (cover, title, a due pill "Due Sat, Nov 21" or "No due date", Late and Due today as before, a done bar from
  `P.lessonSummaries`, which the wide list already reads, and ⋯ with today's row actions: dates, Scores, Student view,
  Play, Edit lesson, Save to folder, Move up/down, Remove from class). The Google Classroom button (its `tools`) sits at
  the card's foot.
- **Reorder mode** (`&reorder=1`) swaps each row's ⋯ for 48px ↑/↓ buttons with "Move {name} up/down" labels, posting
  the existing `/api/class-lessons/:id/up|down` (and, in a collection, the existing `/api/game-folders/:id/order` with
  the whole new order), and a Done button. No drag hint on phones; drag still works on wider screens.
- **My library.** A Files-style list: All my games ("Games you built", `?view=all`), one's collections (shared ones say
  "🤝 Shared with your school"), "+ New collection", then "From others": colleagues' shared collections ("by {name} ·
  read only"), Games students shared ("Made by {class} students") and Oomba games (`/learn`, as Find Oomba games).
  Above it: "Collections only sort your games. Assign from inside one."
- **Inside a collection** (opened in place, "← My library"): name, count and shared state, ⋯ with today's folder menu
  (`folderMenu()`, now taking an id prefix) or, for a colleague's, Copy to my folders; "📌 Assign all n" (`assignAll()`,
  same) and "↕ Reorder" (own, two or more games); rows with cover, title, kind, a small "+ Assign" / "✓ Assigned"
  toggle and ⋯ (Play, Remove from folder, Save to folder). The toggle posts the existing `/api/teach/assign-game` or
  `/api/class-lessons/:id/delete` (with today's confirm); games that need setting up first link to the Assign page as
  before. Like today's Assign, these are app.js `data-api` forms. From All my games the assign answer comes back to
  `?view=all` (a `view` field in `/api/teach/assign-game`).
- **Access unchanged.** Colleagues' collections stay read-only (no rename, share, delete, remove or reorder; the server
  refuses as before), Assign and the toggle are school staff only (`ctx.staff`, not on archived classes), students get
  no phone block.
- **Words.** New phone strings say "collection" ("New collection", "Collection name"); existing desktop strings
  ("folder") are reused as they are where the phone shows the same action. New strings are under `folders.phone` in all
  12 locales. On phones narrower than 380px the kind keeps its emoji only (its words stay for screen readers).

## Your lesson: upload and describe; help as one or more modes; Oomba Canvas 1.1.0 (18 Nov 2026)

The product owner tried `/build/new` on an iPhone after #431 and asked for four changes.

- **Even cards.** "Classroom activity" and "Arcade game" are always the same height: side by side the row stretches
  them; stacked on a phone `.su-kinds` has `grid-auto-rows:1fr`, so both take the taller card's height and no more.
  Both picture boxes have one fixed height and the tags sit at the bottom of each card. The arcade picture's top coin
  no longer pokes out of the shorter phone picture. Measured at 390 and 1280 (`builder-setup-layout.test.js`). Their
  message was cut off after "allow teachers"; we read it as even heights.
- **No topic chips.** "What should students practise?" is one text box. `CANVAS_TOPICS` stays on the server only: a
  typed topic that names one of the kit's ready generators (in any site language, or a few English words) gets that
  tool and generator as a suggestion in the note for the model, tuned to the class's grade (adding: bigger numbers from
  grade 4), and the mock Builder builds it. An older page's `topic: { id }` still works.
- **"How much help?" is one or more.** Real checkboxes styled as the cards (a square tick, not the round one of a
  single answer); Guided is ticked to start; the last one ticked cannot be unticked ("Pick at least one."). The plan
  keeps `help: [...]` in Watch, Count up, Guided, On my own order, and `support` (the first: where it starts);
  `normalisePlan` reads an older page's single `support` as `[support]`. The activity offers only those modes
  (`config.supports`), and the model is told to offer only those.
- **Oomba Canvas 1.1.0** for the switcher: 1.0.0 reads only `config.support`, so nothing in 1.0.0's own data could
  drive a switcher. 1.1.0 adds `config.supports`: with more than one, the support chip becomes a small switcher (one
  button per mode, `aria-pressed`) and a student, or the teacher on the board, moves between them; the problem on
  screen starts again in that mode, the set, score and place stay. The self-test checks `supports`. 1.0.0's folder is
  byte-for-byte unchanged (a test checks its manifest and every file), both versions are in `canvas/SHIPPED.json` and
  `CANVAS_VERSIONS`, the scanner admits both pinned tags, and the server's self-test runs each activity with the kit
  file it pins, so activities saved on 1.0.0 keep working. New activities pin 1.1.0.
- **"Your lesson"**, a new optional step after "What should students practise?" (practise, your lesson, help, how it is
  played, plan; "Skip this step" is there):
  - *A file* (teachers only: a kid's own work is never uploaded here): PDF, Word (.docx, which is also how Google Docs
    exports), .txt or .md, up to 5 MB, a PDF of at most 10 pages, 20 files read a day. It is read on the server with
    Crossword's own readers (`services/pdf-text.js`, which gained a `max` option, and `services/docx-text.js`); no new
    library and no AI. A PDF whose text cannot be read here (a scan) is turned away: the file never goes to the model.
    The file is never stored or logged; only its text comes back (cut to 10,000 characters at a line's end) and the
    page keeps it with the other choices until "Open the Builder", like everything else on this page.
  - *A box to describe what they want* (2,000 characters, with a counter), with four prompt chips that put a heading
    in it: "By the end, students can:", "Common mistakes:", "Words and examples:", "Avoid:". The server splits the box
    at these headings (in any site language) into goal, mistakes, vocabulary, avoid and other details.
  - *Child safety, hard rules* (`server/builder/lesson.js`): before any of it can reach the model, the scrubber takes
    out the names of the students in this teacher's classes (roster names, display names and usernames from the class
    rosters, and Google Classroom students still waiting to join; for a school's admin, the school's classes), matched
    case-insensitively on word boundaries and replaced with "[student]"; a name part that is also an everyday word
    ("Will", "May") or has one or two letters is matched only with its capital. Emails, phone numbers and links go too
    ("[email]", "[phone]", "[link]"); the numbers of a maths lesson stay. Then the Builder's keyword pre-filter runs on
    it (rude words, attempts to change the rules, chat, collecting personal details; the personal-details check is off
    here because the scrubber already did that and a maths lesson is full of numbers); a lesson that fails is never
    used. It runs on the upload, on the plan summary and again when the build starts (the page sends the text back).
    "Don't include student names or work. We remove any we find." is shown on the step, in every language.
  - *For the model*: `planNote` adds a LESSON CONTEXT block (goal, mistakes, words or examples, avoid, other details,
    and the file's text inside `<teacher_reference>`, marked as reference material, not instructions; a file cannot
    close that block). `planBrief` carries a shorter one for later turns. The CANVAS RULES (from docs/canvas-api.md)
    say the lesson context is untrusted data that never overrides the rules. The arcade SYSTEM_PROMPT and TOOLS are
    byte-for-byte unchanged (a test checks their hash).
  - The plan summary shows "What the Builder reads about your lesson", exactly as the server will send it (with
    "[student]" where a name was), and says when a lesson cannot be used.
- **Arcade** is unchanged (the describe box was not added there).
## The Big Divide: read aloud, worksheets, decimal models, every language (18 Nov 2026)
Round two of The Big Divide, in the order the owner asked for, plus three changes the coordinator added on the way.
- **Count up counts a step of 0 like any other** (live site: 5.89 + 16.00, tenths 8 + 0). The first ▲ on any counted step
  puts its starting number in the box (counted 0 times so far), never a blank box; a 0 to add is then "That's it".
- **Read aloud.** A speaker button sits at the start of the question band (`Speaker.svelte`): a tap reads the step's
  question with the platform's AI voice only (`BRB.speak` with `ai: 'only'`; never the device's voice), tap again to
  stop. It shows only once `BRB.aiVoiceCheck` says every line is read, and stays put from step to step while the next
  question is checked (it used to blink out, and the question jumped). The math is read as a teacher says it
  (`speech.ts`): "745 divided by 6", "7 tenths", "12 and 6 tenths", "7 R 2", "2 over 3", "7 and 2 over 3"; each
  language has its own words for these (`w.*`), and Japanese, Chinese, Arabic and Hebrew read decimals as digits.
  The server reads only the game's own lines: `say.*` (each `q.*` question as spoken, written by `build.mjs`) with
  numbers or the game's `w.*` words in the placeholders (`tts-lines.js`; a word may end in a comma, and a language's own
  plural forms such as Russian `key.few` are on the list too).
- **Worksheets.** Print worksheet (anyone who can print) and Worksheet and answer key (school staff only; the route
  refuses the key to anyone else with 403 `key`) in the Share panel. The game sends only numbers and fixed choices; the
  server lays the problems out as on paper with room to work (`box-by-box-print.js`) and works out the key itself, with
  the game's rules (BigInt, rounding and simplest fractions as the game shows them). The crossword's print pipeline is
  now shared (`game-print.js`, a printer per game); the crossword prints exactly as before.
- **Decimal area model and ladder.** Decimal multiplication by the area model ((2 + 0.3) × (1 + 0.4)), and a decimal
  divided by a whole number by the ladder or the area model (7.5 ÷ 3: 2 groups, then 0.5), only for problems that come
  out by hundredths; a decimal divisor stays with the standard method. The server's set check follows (`BB_DEC_METHODS`,
  `bbAreaDecCheck`); every set saved before reads the same.
- **Every language.** Every word on every screen, every step's question, hint and the voice's words are in
  `src/i18n/<locale>.json` (13 site languages; en-GB uses en), with plural forms per language; the math stays as on
  paper in every language (left to right, a decimal point). Arabic and Hebrew turn the page right to left, with the
  problem, keypad and pictures kept left to right. The worksheet's fixed words are translated on the server.
- **Play-through pass.** Every kind, method and option, at every level, four problems each, as a student on the local
  server, on a phone and a laptop; the teacher's path (editor, save, assign, print, reload) and the student's (class
  code, play, practice); the edge cases. Fixed: the speaker blink above; a carry into the millions (9999 × 999) had no
  place name; decimal chunks in a list and Russian plurals were refused by the voice. Left as is: a subtraction's bottom
  number is 10 or more (so 1000 − 1 is 1000 − 10 here), and partial products stay whole numbers only.

## Figures for science, maths and graphs; "What is it for?"; Oomba Canvas 1.2.0 (19 Nov 2026)

The owner looked at worksheet figure generators (free-body diagrams, ray diagrams, circuits, motion graphs, Bohr models,
Lewis structures, scale readings, half-life and titration curves) and asked for two things: the Builder should draw
such figures with open-source libraries under suitable licences, and a classroom activity should be able to print.

**Feature 1: figure libraries** (`docs/figures-api.md`, `docs/third-party.md`).
- **Vendored, pinned, locked.** JSXGraph 1.14.3 (MIT OR LGPL-3.0-or-later; we use it under **MIT** and record that in
  its manifest and the notice) and SmilesDrawer 2.4.2 (MIT; its bundled chroma-js is BSD-3-Clause) are copied from npm
  by `scripts/vendor-figures.js` into `public/vendor/<lib>/<version>/`, each with the package's own LICENSE file and a
  `manifest.json` of sha256 and sha384 hashes. The script refuses a package whose licence is not the one checked from
  its LICENSE file. `figures/SHIPPED.json` locks every file. No GPL code: no CircuitJS, no PhET; Ketcher is too big;
  matter-js is not needed because Phaser 3.90 (already vendored) carries Matter physics. None of the owner's example
  sites' code (their figures are CC0, their code is not open) was copied or looked at.
- **Allowed exactly like the kits.** `server/services/figlibs.js` makes the one tag per library (pinned URL, SRI hash,
  `crossorigin="anonymous"`); the scanner admits exactly those (`checkFigures`) and fails anything else naming their
  folders; the frame CSP lists the three pinned files **file by file** (never a folder, scripts only); the screenshot
  worker serves only those files. JSXGraph and SmilesDrawer both run under the frame's CSP (no `unsafe-eval`): a
  browser test draws a board and a structure inside the real sandboxed frame.
- **Oomba Figures 1.0.0** (`figures/src`, built by `scripts/build-figures.js` into a pinned, versioned file, MIT): 14
  kinds as plain SVG, pure functions (`OF.svg` gives the text anywhere; `OF.draw` the element; `OF.check` names what
  is wrong in plain English). Plain SVG rather than JSXGraph for the ready figures, because the same code then prints
  on the server (a printed worksheet cannot run scripts) and is unit-tested without a browser; JSXGraph is there for
  interactive boards (`OF.board`, in the Oomba colours) and SmilesDrawer for skeletal structures (`OF.structure`).
  Every figure is drawn **to scale** from its numbers and refuses data it cannot draw truthfully (see the page); the
  tests check arrow lengths, the lens and mirror equations against the drawn rays, electron counts, the reading's
  position and the titration chemistry. `hide` leaves the answer out; `print` is black on white; figures never mirror
  in Hebrew and Arabic, their labels read right to left by themselves; default words in every site language.
- **Builder rules.** `FIGURE_RULES` (generated from the page, like the CANVAS RULES, with the pinned tags) go to the
  model only when a build calls for figures: the plan's `figures` flag (set from the topic, the lesson and its file,
  or the note), figure words in the message in any site language (`server/builder/figures.js`), or a version that
  already loads a figure library. The arcade `SYSTEM_PROMPT` and `TOOLS` hash is unchanged. The CANVAS RULES point to
  the FIGURE RULES. The playtest checks that a build with figures loads them only from the pinned tags and shows at
  least one `<svg>`; the activity self-test runs `OF.check` on every figure (and three sets from a generator) with the
  pinned Oomba Figures file and requires its tag.

**Feature 2: "What is it for?"** — a **separate step** right after "Your lesson" (lesson, what is it for, help, how
it is played, plan). Not merged into "How it is played": that step is one answer about devices and the board, this
one is one or more answers about what the activity produces, and merging would make one card grid mean two things.
Practice on screen, Printable worksheet, Question generator; checkboxes like "How much help?", at least one, Practice on
screen to start. The plan keeps `purpose: [...]`; `normalisePlan` reads a missing or empty one as `['screen']`, and the
plan sentence says nothing extra for the default, so older plans read as before. The plan summary has a "For" row.

**Oomba Canvas 1.2.0** (new files; 1.0.0 and 1.1.0 byte-for-byte unchanged, tests check both folders' manifests and
every file; the scanner admits all three tags). `config.purpose`; figure questions (`figure.number` with a typed answer
and a decimal point on the keypad, `figure.choice`) with their own worked answers, and template generators (`vars`,
`{m}`, `{=formula}`) in a small safe formula language (`canvas/src/expr.js`: parsed by hand, no eval); "🎲 New sheet"
for a generator; and **🖨 Print worksheet**. The frame cannot print (no `allow-modals`), so it reuses The Big Divide's
pipeline: the kit sends numbers only (`{ k: 'canvas', seed, n, paper, key }`), the play page (and now the Studio's
preview) asks `POST /api/games/:id/print`, and `server/services/canvas-print.js` builds the page from the version's own
data with the kit's own frozen file (`sheet.js`) and the pinned Oomba Figures file, in the viewer's language, escaped.
A4 or US Letter (named CSS pages), name and date lines, numbered questions with figures and answer lines, the sheet
number in the footer (the same number makes the same sheet again; it can be typed back with the kit's keypad), and the
answer key with worked answers on a page of its own. No student data on the sheet.

**Who may print the key.** Roles reach the frame only as flags the server sets in `INIT`; there is a reliable one, so
the key is not limited to the preview: `INIT.printKey` (the SDK's `BRB.canPrintKey`) is set for the activity's maker
(the Studio's preview and their own play page) and for school staff, never for a student; the kit shows the key option
only then, and the print route refuses `key: true` from anyone else.

**Self-test.** A version is refused when a figure question's worked answer does not end on its answer (the key would
disagree with the work), when a printed sheet of N questions would not have N answers, when "generator" has no `gen`,
or when a figure's data fails `OF.check`.

**Deferred.** Skeletal (SmilesDrawer) structures on printed sheets (they need a browser; use a Lewis structure in a
worksheet), energy-level diagrams, compound circuits beyond one level of branches, thick lenses, and moving physics
figures. The mock Builder builds a small figure activity (a free-body question, a Bohr model, a thermometer reading and
a ray diagram) for figure topics.
## Find Oomba games in the shelf (19 Nov 2026)
Owner: "When I select Find Oomba games I'd like the list of Oomba games to show to the right where the Fun Games folder
is, so it doesn't navigate away from this page. And clean up the top of this page. Make it simpler."
- **In the shelf** (server/routes/game-shelf.js `oombaPane`): "Find Oomba games" is now a shelf item (`?view=oomba`,
  marked when picked) on the class page's Games tab for the school's staff, and on Build for teachers, and the "Find
  Oomba games" buttons in folders open it too (`data-shelf-go`). The right side lists Oomba's Learn games (the same
  official games and Learn subjects and grades as /learn) as shelf rows: cover, title, "Subject · Grades" (one grade
  reads "Grade 2"), 📡 Live for a live game; Try it, then Host live (a live game) or Assign to <class> (the shelf's
  Assign, with its due day and Google Classroom), and ⋯ with Save to folder (the pop-up). On a phone the class header's
  Find Oomba games tile and the library's Oomba games row open the same list inside the library card.
- **Simpler filters** than /learn's four rows: one search box, a grade picker and one row of subject chips (no standards
  box, no "How you play": live games are marked instead). Subjects and the grade are links and a GET form
  (`?view=oomba&subject=&grade=&q=`), so the address keeps them and they work without script; public/js/shelf.js swaps
  them in place, and the search box filters the rows as it is typed (title, subject and grades), with the count and a
  "No games match" line following.
- Words: `folders.oomba.title`, `search`, `none`, `live` in 13 languages.
- Checks: tests/unit/folders-sidebar.test.js (the side item, the strip, the filters in the shelf's reply, the Assign and
  Save to folder actions, not for students or another teacher); class-tiles and folders-phone follow the new links; in a
  browser: open, subject, grade and search in place, Save to folder from the list, Back, and the phone's list.

## Builder: no topic box on the first step (19 Nov 2026)
Owner: "On the builder, I think you can get rid of the bottom question since we are asking for all of the details on the
next page." "What are you making?" no longer has "What should students practice?" under the cards: "Your lesson" (the
next step: a lesson file and a box to describe it, with its headings) asks for everything, and the topic was already
optional (no topic: the Builder decides from the lesson). The plan's summary shows a Practice row only when a topic
exists; the words stay in the locales for that. Tests: builder-canvas and builder-setup-layout follow.

## Builder setup: the Arcade picture shows in every browser

The "What are you making?" Arcade card's picture is built from spans that are all absolutely placed, so its box gets its
size only from the card. Inside a `<button>`, some browsers (Safari) don't turn those spans into blocks, and the picture
had no size and showed nothing. Each part of the card (`.su-kpic`, `.su-kt`, `.su-kd`, the picture's pieces) now says
`display:block`, and the page's two stylesheets carry `?v=` like the rest, so a cached old copy can't hide new rules.

## Drag a game onto a folder

On Build and the class page's Games tab, a game on the right can be dragged onto one of my folders in the left column to save it there (public/js/folder-drop.js; POST /api/game-folders/:id/games, the same as ⋯ › Save to folder, which stays the keyboard way). Only one's own folders take a drop (data-drop-folder); a game already there is not added twice. In a folder whose games can be put in order, the same drag also puts it in a new place (see "Folders: one drag for games"); dropped on a folder, the game keeps its place. A mouse drags at once; a finger holds still first.

## Make a game: three tracks

The first screen of /build/new offers Classroom lesson (the canvas activity), Classroom game (the board starters: Category Board, bingo, flashcards...) and Arcade game. Classroom game and Arcade game share the guided steps, but the game-type step shows only that track's kinds (no tabs to cross over); switching tracks lets go of a kind picked in the other. "I know what I want" became "I’ll just describe it".

A game dragged out of one of my folders onto another asks first, in a small pop-up beside the folder (folder-drop.js askMove): Move here (saves it there, then takes it out of the folder it came from, and the right side shows that folder again) or Keep in both; Cancel, Escape or a tap outside does nothing. Dropped on the folder it is already in: nothing. From All my games, Find Oomba games or a shared folder there is nothing to move out of, so it is just saved. The words come from the server (a <template id="drop-ask"> in the left column).

## Builder part 2: the Activity panel and teacher controls (Oomba Canvas 1.3.0)

A classroom activity's owner changes its problems, help, set size and purpose in the Studio's Activity panel without a
Builder message (desktop: Builder | Activity at the top of the left column; phones: 🧮 Edit activity opens a sheet).
The save route rewrites only the `oc-activity` JSON, screens any typed text exactly like a Builder message (text only,
no students' names, then the Builder's screening), runs the kit's self-test and the scanner, and saves a version
labelled with what changed. Saves by the same person within a minute join one version (kept in memory: a restart only
means one more version). It refuses while a Builder turn runs and when the version changed since the panel loaded.
Older activities move to the new kit only when saved from the panel. Advanced fields sit behind "More options".
Oomba Canvas 1.3.0 adds the teacher's controls (Show answer, Board mode, Help on this screen, New set) behind
`INIT.teach` / `BRB.canTeach` (the answer key's rule; never a student, never "As a student"): a bar at 561 px and wider,
one Teacher button and a sheet below. Board mode sends no score; after Show answer the result is sent with `helped: true`
and the shown problems out of the score; a lesson stores it with the best score (migration 0090) and the staff's lesson
progress page marks it. "New ones for each student" works from any problem the kit can vary; rows drag with pointer
events (touch too); board mode's Back/Next follow the reading direction.
## Folders: one drag for games (19 Nov 2026)

Greg reported two things in the folder sidebar. Games in a folder "sometimes all disappeared while dragging", and dragging felt different in a folder with one game than in one with several.

The disappearing games were not the drag and nothing was lost on the server. Each game row carried data-live as a flag (is the game published), and app.js refreshes live player counts every 30 seconds on every [data-live] element: it wrote "0 playing" over each row and hid it, so the list emptied while the folder's header still said 3 games. The rows now say data-published, and the refresh only touches real counts ([data-live] with a data-live-format).

There is now one drag for games (public/js/folder-drop.js), the one a folder with a single game always had: the row fades in place, a small round picture of the game follows the pointer, and a folder under it lights up. In a folder that can be put in order, the faded row also moves to where it will land while the pointer is over the list; over a folder or outside the list it goes back to its place, and Escape cancels. reorder.js keeps the folder chips' drag and Alt and the arrow keys, and saves one order at a time; a save that fails puts the list back in the order the server last saved, with no reload.

## Classroom setup in four steps (19 Nov 2026)

A Classroom lesson in /build/new now has 4 steps: what you are making → your lesson → "How will students use it?" →
how much help, then the plan ("Step N of 4"). Three of the old choices overlapped or no longer needed asking:
"Practice on screen" and "On their own devices" meant the same thing; every activity has Board mode under the kit's
Teacher button (Oomba Canvas 1.3.0); and a question generator is a switch in the Studio's Activity panel ("New ones for
each student"), which the teacher's "New set" uses.

- **"How will students use it?"**: On their devices and/or On paper (at least one), with one quiet line under the
  cards: the board is always there from the Teacher button, and a fresh set is made whenever possible. "What is it
  for?" (with its Question generator card) and "How will it be played?" are gone; the arcade path is unchanged.
- **The plan the Builder gets** keeps its old fields (builder/plan.js usesPlan; the page does the same): purpose is the
  uses plus `generator` always, so the Builder writes a generator whenever the problems allow one (and is told to leave
  `generator` out of config.purpose when none fits, since the kit refuses it without `gen`). played is `both` when
  students use it on their devices (their own copy, results to Progress, Board mode from the Teacher button) and
  `board` on paper only (nobody plays it on their own device: config.board true, no score sent). The note tells the
  Builder only what was picked: no worksheet without paper, no devices without devices.
- **The plan screen** has one Use row ("On their devices and on paper"); its Change goes back to step 3.
- **Older plans** (the five-step page still open somewhere, saved chats) are read as they are, never migrated:
  usesOf maps purpose to uses (a worksheet is paper; practice on screen, or a generator alone, is devices), and an old
  "On the board" with practice on screen still says "We play it together on the board".

Follow-up (same day): the plan screen says what the Builder gets from "Your lesson" — one line under the message
("Plus your lesson file: NAME, N pages. The Builder reads all of it.", or the first part when the file was cut at its
limit) and a closed "Show what the Builder reads" with each part and the start of the file, from the same scrubbed
plan the server sends (the LESSON CONTEXT carries the file's text, up to its limit, in the first build). The first
message is a box the teacher may edit, with Reset; their words go as plan.told and are sent instead of the sentence
(builder/runner.js submit; classroom activities only), the plan still with them, their students' names taken out and
screened like any typed message. Step 3 starts on "On their devices" again.

## Story Library: open-licensed picture books to read, hear and answer (19 Nov 2026)

Owner: kids read illustrated open-licensed picture books one page at a time (big text, optional read-aloud), answer 3
short questions at the end, and teachers assign a story to a class and see who read it and their scores; "be careful
to only select the right ones". Built to the approved mockups (library grid, reader, end screen, teacher results).

- **Source and licences.** StoryWeaver books by Pratham Books, from the `global-asp/pb-source` text and
  `global-asp/pb-imagebank` pictures. `scripts/import-stories.js` (pure parts in `server/library/import-lib.js`) keeps a
  book only when its text and **every picture it uses** are CC BY 4.0 or Public Domain, read row by row from the
  picture metadata; NC, ND, SA, other versions, missing or unreadable licences are left out, as is any book whose
  pictures do not line up one-to-one with its pages (picture 01 the cover, N+1 page N) or whose metadata lists a
  picture the image bank lacks. Nothing is guessed. Of 395 English books: 58 in the launch set; the report with every
  book and its reason is `docs/story-library-sources.md` (written by the importer; never edited by hand).
- **The words are never changed** (whitespace and conversion leftovers only), so books with mistakes in their own text
  were left out rather than corrected. Picture-book English titles keep their own spelling ("Colours").
- **Choosing the launch set.** Every candidate was read in full for ages 4 to 10: no violence beyond mild peril,
  nothing scary, no romance, no religious instruction or religion-centred plots (festivals mentioned in passing are
  kept), no stereotypes or labels on children, nothing likely to upset parents (e.g. a child crossing a busy road, a
  pet snake eating a mouse, hunters with guns). The site's text scanners (profanity, personal info, the Builder's
  prefilter and mock classifier) run on every page; three false alarms ("blood" in a science question, "don't talk to
  strangers", "my sister") were reviewed by a person and are listed in the report. Reasons for each book read and left
  out are in `seed-library/storyweaver.json` (`skipped`). **Left out by the owner** (20 Nov 2026): "Fat King Thin Dog" (the jokes poke fun at body size) and "Didi and
  the Colourful Treasure" (children who live by a garbage dump and do not go to school).
- **Levels**, from words per text page and words in all: Level 1 Just starting (≤ 12 a page on average, no page over
  20, ≤ 150 in all), Level 2 Learning to read (≤ 30 a page, ≤ 450 in all), Level 3 Reading on my own (up to 1,200;
  longer books are left out). The launch set: 19 / 25 / 16. Replaced on 20 Nov 2026 by US grades (next section).
- **Questions and glossary are Oomba's** (`seed-library/storyweaver.json`): 3 multiple-choice questions a book (3
  choices, two about what the text says and one small inference, each pointing at the page that answers it) and short
  notes for words from India (kheer, pakodas, sooji...). Both are labelled as written by Oomba, not part of the book.
  The importer places the right answer at a stable spot (not always first); the answers never reach the browser: the
  server checks each one.
- **Data model.** `server/library/manifest.json` (id `sw-NNNN`, `source: 'storyweaver'`, pages with picture sizes,
  credits with each part's licence, level, word counts, glossary, questions). A second source (Bloom Library, which needs
  an API key we do not have) adds its own parser returning the same shape and an id prefix; no schema change. Nothing is
  fetched from Bloom or anywhere at run time. Pictures are WebP in `public/img/library/<id>/` (from the image bank's
  `large` copies: pages at most 720 px, covers 440 px), 14.1 MB for the 58 books.
- **Integrated like an assigned game, not a parallel system** (migration `0091_story_library`). A book assigned to a
  class is a lesson of kind `story` with one step of kind `story` (`lesson_steps.story_id`), assigned with the same
  `L.assign` (due date, unassign, reorder, Student view, Google Classroom post when linked). The class page lists it
  ("📖 Story", its cover on phones); the gradebook counts it as one step; its questions count in the **Score** like a
  quiz: 1 point each, right on the first try (a wrong first try is still shown, and the child can try again until
  right to finish). `/class/:cid/progress/:clid` for a story shows the results: who read it, with Read to me or on
  their own, the score with ✓/✗ per question, where they stopped, last active, and the hardest question.
- **Progress.** `story_reads` keeps each reader's own furthest page, Read to me used, and first-try marks; the
  assignment's `step_progress` row is started when the book is opened from the class and done when its questions are
  finished. An assigned book is read again from the start (the owner's decision, 20 Nov 2026): the first time the child opens it
  from the class, their earlier reading of that book is cleared (`freshForAssignment`), so a book finished before it was
  assigned does not count; after that, reading carries on where they stopped.
  Visitors can read and answer with nothing saved. The questions need the last page reached (signed in). Account delete
  removes `story_reads`.
- **Read to me** uses the site's voice stack: the device voice per sentence with `speechSynthesis` word boundaries
  lighting each word (sentence highlight where boundaries never fire), or, when AI voices are on for English, the AI
  voice by sentence (`/api/tts` ctx `story`: book, page and sentence by number only; the server reads the manifest; the
  sentence cut is `public/js/library-text.js`, shared by both), falling back to the device voice on any failure. The
  questions' "Read it to me" uses the AI voice the same way when it is on (ctx `story` with `q`, the question number:
  the question and its choices as shown, no letters), else the device voice (fixed 20 Nov 2026: it was always the
  device voice). Stories are English only for now (no language picker in the reader, unlike the mockup).
- **Where it lives.** `/library` (Learn: a "Story Library" door at the top of the Learn tab; the tab stays highlighted),
  `/library/:id`, `/library/:id/read`, `/library/:id/assign`. Teachers: Assign on every card and book page, "Story
  Library" in the class page's sidebar (`/library?class=` keeps the class), "Assign another story" and "Read it
  together" on the results. Credits and the license link are under every reader page and on every book page; the
  library's footer names Pratham Books, StoryWeaver and CC BY 4.0. External links (license deed, the original book)
  open in a new tab.
- **Not done / open:** the library is not in the sitemap; other languages of the same books (pb-source has many) are a
  later import (text licences would be checked the same way); a projector mode beyond the reader itself; Bloom Library.
- Tests: `tests/unit/library.test.js` (licence filter on fixtures with CC BY, NC, SA, ND, PD, mixed pictures, missing
  and unreadable metadata; parsing; leveling; the manifest; the sentence cut; the pages and APIs over HTTP: assign,
  progress, answers, results, Score; the TTS ctx; account delete), `tests/unit/library-browser.test.js` (Chromium:
  filter and search, reading to the end with Read to me highlighting, wrong then right answer with "Look at page N",
  a teacher's assign and results, phones and a tablet).

## Story Library: US grade levels, and every remaining StoryWeaver story read (20 Nov 2026)

Owner: replace Level 1/2/3 with US grade levels (Pre-K/K, Grade 1, Grade 2, Grade 3, Grades 4-5), computed from public,
documented measures; and "keep adding more books from the original source".

- **The grade is Oomba's estimate, not a branded level.** Nothing is labeled Lexile, Guided Reading or Fountas & Pinnell
  (proprietary). The book page has a small "About the grade level" fold for teachers: "The grade is Oomba's estimate of
  the US school grade this book suits, worked out from its text. It is not a Lexile, Guided Reading or Fountas & Pinnell
  level." and the measures (words, words a page, words a sentence, syllables a word, Flesch-Kincaid grade, share not on
  the Dolch or Fry lists). Grade chips replace level chips on the library, cards, book page, assign page and results.
- **The measures** (`server/library/import-lib.js` `measure`): words in all; words a text page; words a sentence
  (sentences cut exactly as the reader cuts them, at . ! ? and every line break, so a poem's lines count as sentences);
  syllables a word (the usual vowel-group estimate); the Flesch-Kincaid grade (0.39 × words a sentence + 11.8 ×
  syllables a word − 15.59); and the share of words not on the Dolch (220 service words and 95 nouns) or Fry 1,000
  lists, allowing common endings (-s, -es, -ed, -ing, -ly, -er, -est, -'s), with names inside a sentence and numbers
  not counted. The lists are in `server/library/sight-words.json` with a source note (Dolch 1948; Fry 1980, transcribed
  from the qdapDictionaries R package, one duplicate removed; lists of common words are facts).
- **The rule** (`gradeOf`, `GRADE_RULE`, printed in `docs/story-library-sources.md`): each measure becomes a grade
  number (Pre-K/K 0, Grade 1 = 1 ... Grades 4-5 = 4.5) on straight lines between anchor points, clamped to −0.5..5.5:

  | Measure | K (0) | Gr 1 | Gr 2 | Gr 3 | Gr 4-5 (4.5) | Weight |
  | --- | --- | --- | --- | --- | --- | --- |
  | Words in all (log scale) | 60 | 150 | 400 | 900 | 2,000 | 0.25 |
  | Words a page (log scale) | 6 | 12 | 25 | 50 | 100 | 0.25 |
  | Words a sentence | 4.5 | 6 | 7.5 | 9.5 | 12 | 0.20 |
  | % not Dolch/Fry | 8 | 12 | 16 | 20 | 25 | 0.05 → 0.15 |
  | Flesch-Kincaid | its own value | | | | | 0 → 0.15 |

  The score is the weighted mean. Flesch-Kincaid and the sight-word share are unreliable on very short texts (a 50-word
  patterned book with "knit" and "blink" is 40% "hard words"), so their weights rise from 0.05 and 0 at 100 words to
  0.15 at 300 words. Bands: score < 0.5 Pre-K/K, < 1.5 Grade 1, < 2.5 Grade 2, < 3.5 Grade 3, < 5 Grades 4-5. Over 2,500
  words (the old cap was 1,200) or a score of 5 or more is left out.
- **Calibration.** Tuned by reading the 58 launch books and checking each estimate by hand, then the long ones. The
  patterned, sight-word books land in Pre-K/K, the short stories with words like "boulder" and "stumbled" in Grade 1,
  the 200-450-word stories in Grade 1-2, and the long, idiom-rich ones (The Timid Train: "bellowed", "maiden journey",
  14 words a sentence) in Grades 4-5. The data did not argue for other bands: picture books cluster in K-2, so Grade 3
  and Grades 4-5 hold the longer books. Worked examples:
  - Can and Can't (50 words, 7.1 a page, 5 a sentence, FK −1.4, 40% not sight words): votes −0.2, 0.2, 0.3, 5.5, −0.5;
    at 50 words only the sight-word share counts a little (weight 0.05) and FK not at all → 0.45, **Pre-K/K**.
  - Smile Please! (102 words, 9.3 a page, 6 a sentence, FK 0.9, 20.6%): votes 0.6, 0.6, 1.0, 3.2, 0.9 → 0.88,
    **Grade 1**.
  - Grandma's Glasses (296 words, 29.6 a page, 6.9 a sentence, FK 2.2, 15.1%): 1.7, 2.2, 1.6, 1.8, 2.2 → 1.89,
    **Grade 2**.
  - The Timid Train (619 words, 56.3 a page, 14.4 a sentence, FK 5.2, 19.4%): 2.5, 3.3, 5.5, 2.8, 5.2 → 3.75,
    **Grades 4-5**.
  - Jadav and the Tree-Place (1,485 words, 78.2 a page, 11.3 a sentence, FK 3.8, 16%): 3.9, 4.0, 4.1, 2.0, 3.8 → 3.66,
    **Grades 4-5**.
  The 58 launch books: Pre-K/K 9, Grade 1 26, Grade 2 18, Grade 3 4, Grades 4-5 1. **Old links:** `/library?level=N`
  redirects (301) to the grade most of that level's books now have: Level 1 → Pre-K/K (9 of 18 K, the rest Grade 1),
  Level 2 → Grade 1 (16 of 25), Level 3 → Grade 2 (9 of 15). The reader reads a little slower for Pre-K/K (was Level 1).
- **Every remaining English story read.** All 235 licensed books not in the launch set (the 222 not yet read and the
  12 that were only too long) were read in full with the same rules as before; 25 added. The other 210 each have a
  reason in `seed-library/storyweaver.json` `skipped`: most of the later StoryWeaver uploads are written by children or
  first-time authors and have mistakes we may not correct (about 170: "did'nt", "May be sing", spaces before
  punctuation, "Mughlai cusine"); the rest for content (a teacher slapping a child, demons and curses, prayers or a
  religious plot, labels on bodies such as "My fat aunt", hunting or killing animals, children alone at night, Marvel
  characters) or for being one page with too little for 3 questions. The scanner flagged one new book, The Magic Powder
  ("repeat the above step" in a craft page): reviewed, fine (`scanReviewed`).
- **Pictures that do not line up.** All 52 were checked against their image descriptions. Two are placed by hand
  (`pictureMap`, with the page-by-page match written down and shown in the report): My Balwadi (11 pictures for 9 pages;
  the last is a second picture of the play-dough tub) and The Tree (13 for 11; the last is a coloring page; page 11 is
  wordless in the source, as in the book). The other 50 stay out with a reason (`pictureReview`): no text, the whole
  book on one page with no cover, as many pictures as pages (which page goes without is not clear), fewer pictures than
  pages, duplicate descriptions, coloring or craft pages, or (I lost my bat!) a last picture that is the ending with no
  text. The license rule is unchanged: the text and every picture in the metadata (not only the used ones) must be CC BY
  4.0 or Public Domain; the owner's two exclusions (sw-0002, sw-0167) stay out.
- **Totals: 85 books** (58 + 27): Pre-K/K 9, Grade 1 35, Grade 2 29, Grade 3 7, Grades 4-5 5 (new: Grade 1 9, Grade 2
  11, Grade 3 3, Grades 4-5 4). Pictures: 20.8 MB at the same settings (pages 720 px, WebP q50), far under the 80 MB
  budget, so no quality change. The longest new page (409 words, Jadav) scrolls under the sticky Back / Next on a phone.
- **Owner's review (20 Nov 2026):** kept Do and Don't (a toilet joke, "the big job"), Annual Haircut Day ("Oh God, help
  me!" said by a worried man), The Carpenter's last job (a grown-up parable for Grades 4-5) and Dive! (a line refers to
  bold lettering the reader does not show; the divers swim near sleeping reef sharks, "pretty harmless"). Left out What
  If? (the boy calls himself "a little skinny"). 84 books.
- Tests: `tests/unit/library.test.js` (the measures and bands, sight words with endings, hand-placed pictures accepted
  only when valid, every licensed story read, grades and measures in the manifest, old level links), and
  `library-browser.test.js` (grade chips).

## Story Library: book suggestions, "What would you like to read today?" (20 Nov 2026)

Owner: a friendly box at the top of the Story Library where a reader types what they want to read and gets up to 5
books from our library, chosen by a cheap Claude model.

- **The model only chooses.** It gets the catalog (one line a book: id | title | grade | the first 18 words of its first
  two text pages and what its first pictures show) and answers with book ids in a JSON schema (`{ ids: string[] }`,
  structured outputs). Ids are checked against the library (`getBook`): unknown ones dropped, no repeats, at most 5. The
  page shows the library's own cards for them (`bookCard` in `routes/library.js`, shared with the grid) under "Books
  for you", with "All books" to go back. Every word on screen is ours, in all languages; nothing the model writes is
  shown. Books are read only through `books()` / `getBook()`, so a second source (Bloom) joins the catalog by itself.
- **The model and the call** (`server/services/library-suggest.js`): `claude-haiku-5-5` (`LIBRARY_SUGGEST_MODEL` to
  change it) through the shared client `anthropic('free')` (no key or the AI budget spent: no call), `output_config`
  `effort: 'low'` and the schema, no `thinking` setting (a disabled one returns a 400 on some models; low effort keeps
  it short), `max_tokens` 300, 8 s timeout and no retries. The catalog is in the system prompt with
  `cache_control: ephemeral` and is byte-identical for every reader (the grade preference goes in the user turn), so
  repeated calls read it from the cache. The wish is in `<request>` tags with the rule that it is a reader's wish, never
  instructions. Usage is recorded with `aiBudget.recordUsage`.
- **Cost per query** (84 books; the catalog and rules are about 4,800 tokens): a cache read is 4,800 × $0.01/M =
  $0.00005, plus about 60 uncached input tokens ($0.000006) and 30 to 150 output tokens ($0.00002 to $0.00008): **about
  $0.0001 a query** while the cache is warm (5 minutes), **about $0.0007** for the first one after it cools (a cache
  write at 1.25 × $0.10/M = $0.0006). The kid-safety model check before it (below) adds about $0.00005 to $0.0001. With
  the 1-hour answer cache, a class asking for "dinosaurs" pays once. Bloom books make the catalog longer at about 58
  tokens a book (500 books: about 29,000 tokens, $0.0003 a warm query).
- **Safety and privacy.** The wish is at most 120 characters; emails, phone numbers and links are taken out first. Then
  the Builder's own screening runs (`screenInput`: the word rules, and the model classifier when a key is set); a wish
  it stops gets "Let's try different words..." and no suggestion call. The wish is never stored or logged: no table
  holds it (a test reads every table), the request log writes only the method and path, and the answer cache keys are
  SHA-256 hashes of the normalized wish and grade (at most 300, one hour, least recently used out first). The endpoint
  is rate limited (40 a minute per reader or address).
- **Always works.** No client, an error, a refusal, a cut-off answer or a timeout: a local keyword match on titles (3
  points), page text and picture descriptions (1), with a few related words ("funny" finds "laugh", "space" finds
  "moon") and grade words ("easy" Grade 1, "grade 3", "chapter book" Grades 4-5). Local answers are not cached, so the
  model is asked again next time. When nothing fits (the model's empty list, or no local match): "We could not find a
  book about that yet" and 4 books: the most read, then the easiest at or near the reader's grade.
- **The reader's grade** is a preference, not a filter: the grade chip they are on, else a signed-in student's grade
  from their school (`school_members.grade`, "3rd" or "K" read as a band). The model is told to prefer books at or near
  it; the local match sorts by it after the topic.
- **Where it lives.** `routes/library-suggest.js` (`POST /api/library/suggest`, the box markup), 
  `public/js/library-suggest.js` (the box is hidden until the script runs, so it never shows without JavaScript),
  `public/css/library-suggest.css`. The only edits to the library page: the box above the grade chips, its script and
  stylesheet, and the card moved into `bookCard`. Strings: `library.wish.*` in every language (en-GB uses the English).
- Tests: `tests/unit/library-suggest.test.js` (a stand-in model: ids checked, the request shape and cache marker, a
  screened wish never reaches the model, the local match on no client / error / refusal / bad JSON / timeout, the
  cache, the length cap and cleaning, no table holds the wish, the grade preference, the rate limit, the API's cards)
  and `tests/unit/library-suggest-browser.test.js` (Chromium: a wish shows the cards, All books brings the grid back, a
  screened wish, phones with no sideways scroll). No real API call was made while building it (no key in the sandbox).

## Virtual math manipulatives, hidden while it is tested (20 Nov 2026)

The Muse-hosted "Virtual Math Manipulatives" app (branch virtual-manipulatives) is rebuilt inside the site, on the site's
accounts, classes, database, AI client, theme and i18n. Nothing of Muse, Bun or React is kept: the site has no React
and no bundle step for pages, so the UI is a plain ES module like the classroom dashboard (public/js/manip.js, with its
data in public/js/manip-data.js and the 300 tasks in public/js/manip-tasks.js, shared with the server).

- **Hidden.** /manipulatives and /api/manipulatives/* answer only the platform admin, school staff whose usernames are in
  MANIPULATIVES_USERS, and the students of a class one of them is running a session for (routes/manipulatives.js gate;
  everyone else falls through to the normal 404). MANIPULATIVES=0 turns it off for everyone. No menu, sitemap or search
  links it; the page is noindex and sends X-Robots-Tag. The only other place it shows is a "Join" notice on a student's
  own class page while their teacher runs a session.
- **Turning it on for teachers later:** add their usernames to MANIPULATIVES_USERS (one teacher at a time), or, for
  everyone, change canHost in services/manipulatives.js to S.isSchoolStaff(u) and add a link from the class page or the
  Teach menu; then add it to the privacy page (below) and translate the js.manip.* strings.
- **Identity.** No typed names and no anonymous joins. A session belongs to its teacher and one class they teach (or
  that their school admin membership covers); its join code only finds it: a student outside the class gets the same
  404 as a wrong code. One running session per class; a session ends by itself after 12 hours and is deleted (with the
  students' work) 30 days after it ends.
- **Who sees what.** Saved boards (manip_boards) are their owner's: only the owner lists, opens by id or deletes them.
  Only hosts save boards and so make share codes; opening a code copies the board into the opener's own board. A
  student's work (manip_work) is seen by that student and the session's teacher (and the platform admin): students get
  their own board and the pushed board, never the class list or another student's board. The teacher sees students by
  the name the class roster shows (roster name, else display name) on the dashboard and its PDF. Only the teacher (or
  the platform admin) reads the dashboard, pushes, exports or ends.
- **Text.** Every board that is saved, sent or pushed is rebuilt on the server (cleanState): sticky notes and bar labels
  go through the site's word lists and personal-information rules (textfilter.js); any other string on the board must be
  clean too. The family link-code shape is not checked here ("Build 246 with blocks" looks like one, and a note only
  reaches its writer and their teacher).
- **AI.** "Draft with AI" is for hosts only, through builder/anthropic.js (the AI budget, config.builderModel), 30 an
  hour. It gets the teacher's description, the tool and its piece list, and a task from the tool's own library: never
  students' work or names (a description with the name of one of the teacher's students is refused). The answer is
  sanitized as the original was (piece kinds from the tool's palette only, at most 30, coordinates clamped, 2 to 6 notes
  that pass the word rules, at most 4 pen marks in the pen colors). No key or a resting budget: a plain starting board.
- **Live updates** poll every few seconds, like the classroom dashboard (Oomba Live's socket is for its games).
- **PDF export** is made on the server (a text summary per student), for the session's teacher only.
- **Content.** "Cuisenaire Rods" became "Number rods" (slug number-rods); "Miro" is gone; US spelling; grades K-8 (the six
  grade-9 algebra tasks are labeled grade 8 and keep their high-school codes); every task and its code is kept.
- **Database:** migration 0092_manipulatives (0091 is taken on an unmerged branch; migrations run by name). Account
  deletion removes a person's boards, work and sessions; leaving a class removes their work in its sessions; deleting a
  class or school removes its sessions (school-delete.js BY_CLASS, and ON DELETE CASCADE).
- **Not translated yet:** tool names, descriptions, help lines and palette labels (manip-data.js and the tool code) and
  the whole task library are English only; the page's own words are js.manip.* / manip.* keys in en.json.
- **Privacy page before launch:** it should say that students' boards in a session (pieces, sticky notes, pen marks) are
  kept for the teacher for up to 30 days after the session, and that teachers' lesson descriptions go to the AI. Not
  changed while hidden (no LEGAL_UPDATED bump).
