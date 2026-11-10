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
