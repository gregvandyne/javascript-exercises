# CS Quest — map of the teacher-facing program (lessons, live quiz sets, teacher pages, class assignment, progress)

Repo: `/home/user/javascript-exercises` at commit `dd603ce` (3 Nov 2026). Node 22, Express 5, better-sqlite3, server-rendered
pages (`server/views/html.js` tagged templates), no front-end framework. Line numbers below are from that tree.

Routers mount in this order (`server/app.js:184`): auth, family, plans, schoolBilling, **live**, google, discover, parents,
**teachers**, games, match, adminTool, studio, social, chat, admin, tts, **schools**, **progress**, **lessons**, info, kit.
Everything behind a session goes through `requireUser`/`requireAccount` (`server/auth.js`); `req.t`, `req.fmt`, `req.locale`
come from the i18n middleware (`server/i18n/index.js:278`).

---------------------------------------------------------------------------------------------------------------------------

## 1. Lessons

### 1.1 Data model (SQLite, `server/db.js`)

| table | migration | columns |
|---|---|---|
| `lesson_folders` | `0010_lessons` db.js:113 | id, school_id, owner_id, parent_id, name, position, created_at |
| `lessons` | db.js:116 | id, school_id, owner_id, folder_id, title, summary, subject, grade, objectives, position, shared (0/1), copied_from, created_at, updated_at, archived_at |
| `lesson_steps` | db.js:121 (+`0040_quiz_steps` db.js:435) | id, lesson_id, position, kind, title, body, game_id, minutes, created_at, **set_id**, **items** (JSON snapshot for `quiz` steps) |
| `class_units` | db.js:124 | id, class_id, name, position, created_at |
| `class_lessons` | db.js:125 (+`0012` removed_at db.js:138) | id, class_id, lesson_id, unit_id, position, opens_at, due_at, assigned_by, assigned_at, removed_at |
| `step_progress` | `0011_progress` db.js:130 (+`marks` db.js:437) | PK(class_lesson_id, step_id, user_id); status ('started'/'done'), score, label, plays, seconds, answer, game_id, feedback, reviewed_at, reviewed_by, started_at, done_at, updated_at, marks |

- A lesson belongs to ONE school and ONE owner (`lessons.school_id`, `owner_id`). There is no cross-school or ownerless
  lesson row. `copied_from` records a copy's source.
- `lesson_steps.game_id` is a soft reference to `games.id`; `L.steps()` (lessons.js:47) LEFT JOINs the game so the editor
  can show status/visibility.
- `opens_at`/`due_at` are calendar days stored as 00:00 UTC (lessons.js:285-331; `dateOrNull` lessons.js:342).

### 1.2 Limits (all in `server/services/lessons.js`)

| what | limit | where |
|---|---|---|
| lesson title | 100 chars | `createLesson` lessons.js:117 (`clip`) |
| summary | 600 | lessons.js:122 (`clipText`) |
| subject | 40 | lessons.js:122 |
| grade | 12 chars (`gradeLabel` components.js:36 renders a bare number as "Grade N", anything else as typed: "3-5" is fine) | lessons.js:122 |
| objectives | 1000 chars, one per line (editor splits on `\n`, routes/lessons.js:269) | lessons.js:122 |
| steps per lesson | **40** | `addStep` lessons.js:220 |
| step title | 100 | `cleanStep` lessons.js:203 |
| step body | 4000 chars plain text (`paras()` routes/lessons.js:29 makes `<p>` per blank line, `<br>` per newline; no markdown, no links) | lessons.js:204 |
| step minutes | 0–240 | lessons.js:205 |
| folder name | 60 | lessons.js:67 |
| unit name | 60 | lessons.js:347 |
| question answer (student) | 3000 | progress.js:62 |
| feedback | 2000 | progress.js:132 |

### 1.3 Step kinds and validation (`cleanStep` lessons.js:199-217)

`STEP_KINDS = ['game','build','text','question']` (lessons.js:15); `QUIZ_KIND = 'quiz'` (lessons.js:19) is NOT in the
editor's `kind` select (`KIND_ORDER` routes/lessons.js:211) — a quiz step can only be made from a question set through
`addQuizStep` (lessons.js:229, called only by `classlive-sets.homework`, classlive-sets.js:120) and only while
`LIVE_HOMEWORK=1` (`config.liveHomework`, config.js:228; default **off**, README line 100).

- `game`: needs `gameId`; game must exist, not deleted, and `games.canView(u,g) || owner` (lessons.js:209-211). Official
  public games always pass. `playableBy(step, schoolId, classId)` (lessons.js:256) decides whether the class can open it:
  published + live + not hidden + (public | school-shared by a member of this school | class-shared live in this class).
- `build`: `body` required = the idea typed into the Builder (`buildPrompt`), lessons.js:213.
- `text`: body or title required (lessons.js:214).
- `question`: body required (lessons.js:215).
- `quiz`: `items` JSON `[{q, choices, answer}]` snapshot (lessons.js:234) — `cat`/`secs` are **dropped** at snapshot time.
  Title/body/minutes editable; questions not (`cleanStep` keeps kind only if old kind was quiz, lessons.js:201).

Locale keys for kinds: `lessons.kinds.{game,build,text,question,quiz}` ("Play a game", "Build a game", "Read or do",
"Answer a question", "Answer quiz questions"). Icons `KIND_ICON` routes/lessons.js:27 and routes/progress.js:35.

### 1.4 Who can create / edit / assign (lessons.js:1-10 header, 52-58, schools.js:478-514)

- `isStaffOf(u, schoolId)` = active `school_members.role in ('admin','teacher')` **by membership** (lessons.js:25). The
  platform admin (`users.role='admin'`) counts as school admin everywhere (`roleIn` schools.js:480) so can edit any lesson,
  but has **no library of their own**: `/teach/lessons` redirects a non-member platform admin to `/admin/schools`
  (routes/lessons.js:79-82, `staffSchools` routes/lessons.js:34).
- `canEditLesson` (lessons.js:52): school admin of the lesson's school, or the owner while still staff there.
- `canSeeShared` (lessons.js:57): `shared=1`, not archived, viewer is staff of **that** school. Shared lessons are read-only;
  "Copy" (`copyLesson` lessons.js:180) makes an owned copy with all steps (`set_id`/`items` of quiz steps are NOT copied:
  lessons.js:191 inserts only kind/title/body/game_id/minutes — quiz steps lose their questions on copy).
- Assigning (`assign` lessons.js:372): class manager (`S.canManageClass`: school admin, or a teacher who teaches the class,
  schools.js:493) AND the lesson is in the same school AND the teacher can edit it (a colleague's shared lesson must be
  copied first) — unless it was assigned before and removed (restore path keeps student work).
- Lesson pages/APIs: `/teach/lessons` library (routes/lessons.js:79), `/teach/lessons/:id` editor + read-only shared view
  (routes/lessons.js:229), `POST /api/lessons` (158), `/api/lessons/draft` (166, AI), folders 182-196, copy 198, delete 202,
  step APIs 327-331, `share-game` 333 (publishes the teacher's own game at 'school'), `new-game` 341 (creates a Studio game,
  a game step, redirects to `/studio/:id?ask=<idea>`), `assign` 361.

### 1.5 Assignment to a class, units, dates, time zone

- `POST /api/classes/:id/lessons` (routes/lessons.js:446) or `/api/lessons/:id/assign` (361). Body `lessonId, unitId?,
  opensAt?, dueAt?` as `YYYY-MM-DD`. One assignment per class (lessons.js:380 'alreadyAssigned'). Units:
  `createUnit/renameUnit/deleteUnit/reorderUnit` lessons.js:343-370, APIs routes/lessons.js:450-454.
- Assignments are **live links**: editing the lesson changes it for every class (header lessons.js:9). Unassign only sets
  `removed_at` (lessons.js:404); re-assigning revives the row and the students' work (lessons.js:375-388, `workBack`).
- Open/due: `isOpen` lessons.js:312, `dueState` lessons.js:322 → 'upcoming' | 'today' | 'due' | 'late'; uses the school's
  IANA zone (`schools.DEFAULT_SETTINGS.timeZone`, schools.js:25-33; `zoneOf` schools.js:44) else UTC + 36 h grace
  (`LATE_AFTER` lessons.js:321). `zoneNote` (routes/lessons.js:58) prints the rule on assign forms and the gradebook.
- Class page Lessons tab = `teacherLessonsPanel(req, c)` (routes/lessons.js:368): units, rows (each links to
  `/class/:cid/progress/:clid`), assign form listing "my lessons not in this class" + "removed" group, "New unit", links to
  the library (`/teach/lessons?school=&class=&open=new|ai`). Student side = `studentLessonsPanel` (routes/lessons.js:432):
  `classPlan(classId, {openOnly:true})` (lessons.js:333) so unopened lessons are invisible.

### 1.6 What students see

`GET /class/:cid/lessons/:clid` (routes/progress.js:235-305): `canViewClassLesson` (lessons.js:416) = class manager, or
class student while `isOpen`. Steps render in order with per-kind actions (routes/progress.js:241-282):
- text → "Mark done"/"Undo" (`/api/progress/:clid/:sid/done`, routes/progress.js:41);
- game → "Play" link `/play/<slug>?lesson=<clid>&step=<sid>` (routes/progress.js:244) + "I played it" button; the play page
  (routes/games.js:246-248) validates `progress.context` and embeds `lesson` in `#page-data`; `public/js/play.js:53-59,108-114`
  posts `{event:'start'|'time'|'score'|'end'}` to `/api/progress/:clid/:sid/game` (routes/progress.js:44). The game must be
  `playableBy(step, school, class)`, else a "not ready" notice (routes/progress.js:243);
- build → "Start building" (`POST /api/progress/:clid/:sid/build`, routes/progress.js:307: one Studio game per student,
  reopened later; needs `user.builder_enabled`, not a guest) → `/studio/:id?ask=<step body>`; then "Keep building" and
  "Hand in" (`/api/progress/:clid/:sid/hand-in`, routes/progress.js:54: publishes at 'class' to this class if the class can't
  already open it; never widens beyond the class);
- question → textarea + "Send answer"/"Update answer" (`/api/progress/:clid/:sid/answer`, 42); shows teacher feedback once
  reviewed;
- quiz (LIVE_HOMEWORK) → `.lv-qstep` block driven by `public/js/live-quiz-step.js` against
  `GET/POST /api/lessons/:clId/steps/:stepId/quiz` (routes/live.js:662-673; never sends answers; one answer per question).
Teachers see the same page as a preview (notice `lessons.view.teacherPreview`) with plain Play links and, for live-ready
games, **📡 Host live** → `/live?cl=<clid>&step=<sid>&game=<gameId>` (routes/progress.js:286); plus "Quiz this lesson live"
(`/api/live/sets/from-lesson/:lessonId`, routes/progress.js:289) when the lesson has question steps.

### 1.7 Progress recorded (`server/services/progress.js`)

- `context()` progress.js:25: only an active **student** of the class, on an open lesson, on a step of that lesson.
- Done rules (header progress.js:3-7): text = mark done; question = answered (changed answer un-reviews it, progress.js:65);
  game = score or `end` event, or `PLAYED_ENOUGH` = 120 s (progress.js:17, `gameTime` 103 adds ≤60 s per report, cap 24 h),
  or "I played it"; build = handed in; quiz = all questions answered → `score` = % right, `label='quiz'` (progress.js:79-94,
  per-question `marks` string of 1/0/-).
- `gameScore` (progress.js:111): best score kept, `label` ≤40 chars (from the game's `BRB.score.submit(score,label)`;
  `'live'` when written by a live run, classlive-results.js:111).
- Teacher review: `review()` progress.js:129 (feedback + reviewed_at), audited.
- Aggregates: `lessonProgress(clId)` progress.js:142 (students × steps cells), `classProgress(classId)` 163 (students ×
  lessons: done/total, toRead, late, locked), `overall()` 178, `toReadByClass` 185 (badge on My classes and class tabs),
  `studentSummary` 190, `toReadByLesson` 197, `firstNewAnswers` 204, `lessonSummaries` 210.

### 1.8 Teacher views of progress

- Gradebook `GET /class/:id/progress` (routes/progress.js:97-162): table students × assigned lessons (locked columns greyed,
  ⏰ late, ✍️ to-read chips linking to the first unread answer), "to review" list, CSV button, and the **Oomba Live panel**
  (routes/progress.js:121-152): recent class runs (`R.classRuns`), the class teams editor (`/js/live-class-teams.js`),
  saved support rows (LIVE_SAVE_SUPPORT).
- CSV `GET /class/:id/progress.csv` (routes/progress.js:164): name, username, one column per lesson "done/total", Overall;
  formula-injection-safe cells (line 169).
- One lesson `GET /class/:cid/progress/:clid` (routes/progress.js:178-229): students × steps with ✅/◐, game score+label,
  handed-in game link (`/g/<slug>` when `canView`), answers list with feedback forms (`/api/progress/:clid/:sid/:uid/review`
  231).
- Class header + tabs `classHeader(req, c, active)` (routes/schools.js:403): Lessons `/class/:id`, Progress
  `/class/:id/progress`, Games `?tab=games`, Students `?tab=students`, Settings `?tab=settings`; badges for to-read and join
  requests; "📡 Host a live game" button → `/live?class=<id>` (routes/schools.js:414) when live is on and `canHost`.
- My classes `GET /teach` (routes/schools.js:349): class cards with student counts, request and to-read chips; buttons
  "📚 Lesson library" and "🛠️ Make a game" (`makeGameBtn` components.js:130).

### 1.9 ✨ Draft with AI (`server/services/lesson-ai.js`)

`draftLesson` (lesson-ai.js:21): Claude (`config.builderModel`, JSON schema lesson-ai.js:9-16, kinds text/game/build/question
only, 3–7 steps, `minutes` total), catalogue = school + site public games only (routes/lessons.js:170; class games are
never sent to the AI). Without a key or when the AI budget rests → `templateDraft` (lesson-ai.js:58: warm-up / matching
game / build / exit ticket from `lessons.template.*` keys). Rate limit 30/h (routes/lessons.js:166). Counts against the AI
budget (`aiBudget.recordUsage`, lesson-ai.js:41).

### 1.10 Official / template lessons: do NOT exist today — how to seed them

There is no `official` flag, no school-less lesson, and no "Oomba lessons" tab. The only precedent is the demo seed:
- `scripts/seed.js:186-229 seedDemoLessons(teacher, school, cls)`: builds folders (`createFolder`), lessons
  (`createLesson` + `addStep` per step, skipping a game step whose game isn't published: `game(slug)` helper line 187-191),
  units and assignments with due dates; `seedDemoQuestions` (231) adds a question step once; `seedDemoProgress` (245) fakes
  progress. Called from `seedDemoTeacher` (143) only when `DEMO_TEACHER_PASSWORD` is set and the teacher's library is empty
  (line 180). `scripts/how-shots.js:73-76` reuses the same three functions for the screenshot database.
- `copyLesson` (lessons.js:180) is the "put a lesson in my library" primitive, but it requires the source to be editable or
  shared **in the same school** (`canEditLesson || canSeeShared`).

Three ways to ship CS Quest lessons, in order of fit with the code:
1. **Repo catalogue + "Add to my library" (recommended).** Keep lessons as JSON (e.g. `seed-lessons/cs-quest/*.json` with
   `{ key, title, subject:'Computer science', grade:'3-5'|'6-8', summary, objectives, minutes, standards:[...],
   steps:[{kind,title,body,minutes,gameSlug?}], quiz?:{title, items:[...]}, wyr?:{topics}, ... }`). Add a service
   (`server/services/lesson-templates.js`) that validates against `L.cleanStep` limits and materialises one into the caller's
   library exactly like `seedDemoLessons` (createLesson → addStep, resolving `gameSlug` → `games.getGameBySlug` and only
   when `status==='published'`; also `SETS.createSet` for the lesson's quiz so it appears under "My sets" on /live).
   Expose `POST /api/lessons/from-template/:key` (rate-limited like `lesson-new`, 120/h) and a teacher page that lists
   the catalogue (section 4). Everything downstream (assign, progress, live) then works unchanged, and school-less content
   never has to satisfy `isStaffOf`.
2. Per-school seeding on first teacher visit (the `seedDemoTeacher` pattern): invisible to the "library empty" test only
   once; clutters libraries; no update path. Not recommended beyond demos.
3. New `lessons.school_id = NULL, official = 1` rows owned by the `OombaAcademy` account + a third library tab + a copy path
   that bypasses the school check: touches every permission helper (`isStaffOf`, `canSeeShared`, `sharedLessons`,
   `gamesForPicker`) — the costliest option.

Whatever the path: lesson text is **user data in the DB, English is fine**; only the page chrome around it must be in 13
languages (section 4.6). A `?drafted=` style notice (routes/lessons.js:253-256) is the existing pattern for "we just made this
for you" banners.

### 1.11 Live hooks that already exist on lessons

- Editor header "📡 Make a live quiz from these questions" (routes/lessons.js:263: `live.entry.fromLesson`) → `SETS.fromLesson`
  (classlive-sets.js:106): a **draft** set (questions only, no choices; can't be hosted until complete).
- Student-view page for teachers: "Host live" per live-ready game step (routes/progress.js:286) and "Quiz this lesson live"
  (289).
- A class live run started from a lesson step writes each student's score into that step (`classlive-results.save`
  classlive-results.js:111 → `progress.gameScore(..., 'live')`), only when `createSession` could bind `clId/stepId`
  (classlive-sessions.js:231-234: class room, step kind 'game', `step.game_id === game.id`).
- LIVE_HOMEWORK (off): results page "📚 Set as homework" (views/live.js:592) → `POST /api/live/sets/:id/homework`
  (routes/live.js:651) → `SETS.homework` (classlive-sets.js:120): makes a one-step quiz lesson in the host's library and
  assigns it.

Tests: `tests/unit/lessons.test.js` (7 tests, incl. pages/APIs line 141), `tests/unit/lessons-quiz.test.js`,
`tests/unit/progress.test.js` (10 tests incl. time zones line 349), `tests/e2e/lessons.spec.js`, `tests/e2e/progress.spec.js`
(uses the demo school: `DEMO_TEACHER_PASSWORD` in `playwright.config.js`). Unit harness: `tests/unit/_setup.js`
(`BRB_DB=:memory:`), app started with `createApp().listen(0)` (lessons.test.js:17).

---------------------------------------------------------------------------------------------------------------------------

## 2. Classes and schools (`server/services/schools.js`, `server/routes/schools.js`)

- Tables: `schools` (settings JSON), `school_members` (role admin/teacher/student, roster_name, grade, status active/left),
  `classrooms` (join_code 6 chars, subject, grade, archived_at), `class_members` (role teacher/student), `join_requests`
  (db.js:96-110); `game_classes` (db.js:163: game_id, class_id, added_by/at, removed_by/at).
- Settings (`DEFAULT_SETTINGS` schools.js:25-33): teachersCreateClasses, allowOwnAccounts, chat, publishing ('school' keeps
  games inside the school), googleDomains, **timeZone**, builderDailyCap (school plans; `MAX_DAILY_CAP` 500, min =
  `BUILDER_DAILY_TURNS`).
- Roles: `roleIn` schools.js:480 (platform admin = admin everywhere), `canManageSchool` 486, `canCreateClass` 487,
  `teaches` 491, `canManageClass` 493 (admin or teacher of the class), `canViewClass` 498, `canManageStudent` 503,
  `isStaff` 514 (platform admin or any active staff membership), `isSchoolStaff` 76 (membership only).
- Creating: `createSchool` 83 (platform admin via `/admin/schools`, routes/schools.js:89/114, or `BOOTSTRAP_SCHOOLS`),
  `createClass` 284, `createSchoolAccount` 237 (kid-safe username + word password, printable cards `/cards/:k`
  routes/schools.js:686), `addToClass` 347, `requestJoin` 386 (own accounts with a code; teacher approves 415).
- Class-shared games ("Share with my classes", decisions.md:619): `sharingOptions` schools.js:540 ('class' when the owner is
  an active member of a live class), `shareableClasses` 557, `validateClassPick` 569, `setGameClasses` 582 (inside publish),
  teacher moderation `removeClassGame` 602 / `restoreClassGame` 611 (audited; a removed class can't be re-added by the owner),
  pruning on leave 592. The visibility rule is `games.CLASS_SQL` (games.js:71) used by `canView` (96) and listings;
  `gameLiveInClass(gameId, classId)` games.js:239 is what lessons use; `classGames(classId)` 228 lists them;
  `classGamesForTeacher` 243 feeds the lesson editor's "Shared with my classes" group. Class Games tab:
  `classGamesTab` routes/schools.js:457 (+ APIs 575/581). Student class page `studentClass` routes/schools.js:547 =
  lessons panel + "Games from our class" (563) + teachers/classmates; `/classes` 706 lists a student's classes.
- Publishing a kid's game to a class: `publish()` services/publish.js:66; a clean static scan goes live at once for
  'class'/'school'/'family' (publish.js:103-116), a flagged version waits for a human (admin queue `moderation.reviewQueue`
  moderation.js:20, approve/reject publish.js:177/195 scoped to the audience asked for).
- Tests: `tests/unit/schools.test.js`, `tests/unit/class-sharing.test.js` (incl. "lessons: class games play only in their
  classes…" line 477), `tests/e2e/schools.spec.js`, `class-sharing.spec.js`.

---------------------------------------------------------------------------------------------------------------------------

## 3. Oomba Live

### 3.1 Access, modes, capacity (`server/services/classlive-access.js`)

- `MODES` (line 18): `'quest-race' → seed game quest-race`, `battle → question-battle`, `board → brain-board`,
  `wyr → would-you-rather-live`, `atlas → atlas-quest-live`. `OWN_QUESTIONS = {wyr, atlas}` (21): the platform makes their
  questions; never a set. `NOT_FOR_CLASS = {hero-of-sunvale}` (24). `LIVE_GAMES` in `server/live/live-games.js:5` maps the
  same slugs to `{mode, solo}` for cards/game pages.
- `canHost` (31): staff by membership, grown-ups, platform admin; never kids/guests. `teacherHost` (26) = gets the class
  picker. **A class room needs `S.teaches(host, classId)`** (`audienceRefusal` 47-55): a school admin who doesn't teach the
  class gets `notTeacher`.
- `hostable` (63): official games any audience; others need published + viewable + reaching the room's audience.
- `CAPACITY` (94): quest-race max 40, battle 60, board 40 (teamsAbove 16), wyr 60, atlas 60; Builder games 30 or
  `ready({maxPlayers})`; site caps `LIVE_MAX_PLAYERS` 60, `LIVE_MAX_SESSIONS` 60, `LIVE_MAX_SEATS` 2000 (config.js:218-220),
  `LIVE_HOURS` ≤3. `docs/live-capacity.md`: measured at 10/20/30 players; 30-player class ≈ 3% CPU, <2 msg/s per player.
- Co-hosts (`controlTier` 176: other school staff of the class's school, 'full' for class teachers/school admins).

### 3.2 Teacher question sets (`server/services/classlive-sets.js`)

- `LIMITS = { items: 100, q: 300, choice: 120, title: 80, cat: 40, bytes: 120 KB }` (line 10); `SECS = [5,10,15,20,30,45,60,
  90,120]` (11). Item: `{ q, choices (2-4), answer (index), secs, cat? }`; `complete()` (17). Text goes through
  `textfilter.cleanText` (rude words, personal info, links refused).
- Table `live_sets` (db.js:391): owner_id, school_id (the owner's first staff school), title, subject (40), grade (20),
  **lang** (stored from `req.locale`, never used for matching), items JSON, lesson_id, shared, archived_at.
- `createSet` 63, `updateSet` 72, `copySet` 84 (own copy, not shared), `archiveSet` 91, `listFor(u)` 97 → `{mine, school}`
  (school = colleagues' shared sets, staff only), `canUse` 55 (own, or shared in a school where I'm staff),
  `fromLesson` 106 (draft from question steps, ≤100), `homework` 120 (LIVE_HOMEWORK).
- No official/global sets: `canUse` needs same-school membership, and the `OombaAcademy` account is in no school.
- Pages/APIs: `/live/sets` editor page (routes/live.js:600, `views/live.js:616 setsBody`, client `public/js/live-sets.js:87-243`:
  typed, pasted from a spreadsheet/document via `public/js/live-paste.js`, or ✨ AI draft `POST /api/live/sets/draft`
  routes/live.js:617 → `services/set-ai.js draftQuestions` (kinds mixed/choice4/truefalse/board, 1–30 questions, the
  teacher's language, nothing saved until Save)), `GET/POST /api/live/sets[/:id]` 604-643, copy 627, from-lesson 632.
- Tests: `tests/unit/live-sets-editor.test.js`, `tests/unit/live-pages.test.js:103`.

### 3.3 The question bank (`server/live/bank/`)

- `engine.js`: `SUBJECTS = ['math','science','geography','words','history','general']` (9), `LEVELS = ['a6','a8','a10','a12']`
  (10; UI names `live.bank.level.*` = Ages 6–7 / 8–9 / 10–11 / 12–14), `COUNTS = [5,10,15,20]` (11), secs per level (12),
  `makeBank(data, strings, rand)` (14) → `pick({subject|'mixed', level, count ≤50, seen})` and `board({subjects 2-6, level})`
  (one column per subject, 5 tiles easy→hard). Same code is shipped to the games for solo practice
  (`setupCard` 116) via packs.
- Per-language data: `server/live/bank/<lang>/<subject>.json` = `{ "a6": [[question, right, wrong, wrong?, wrong?], ...],
  "a8": [...], "a10": [...], "a12": [...] }` (see `en/general.json`; 25 rows per subject per level in English). Loaded by
  `dataFor(lang)` (index.js:25): en-GB = en with British spellings (`toGB` index.js:20); a language with **no** files gets
  the translated science/geo starters (index.js:34-39); a language with files but **without** a subject's file simply
  doesn't offer that subject (`subjects()` engine.js:22 filters by data). Strings `stringsFor(lang)` (index.js:44) come from
  `live.bank.subject.*`, `live.bank.level.*`, `live.bank.math.*`, `live.starter.math.*`.
- A bank set is referenced by a **starter id**: `bank:<subject|mixed>:<a6|a8|a10|a12>:<count>` or
  `bank:board:<level>:<subj>+<subj>…` (`parseBankId` index.js:58, `bankItems` 68). The /live form builds it from
  `bankSubject/bankLevel/bankCount/bankBoard[]` (`bankChoice` routes/live.js:183, `bankStarter` 203). `pickerFor(lang)` (75)
  feeds the landing (`views/live.js:503-513`). The last choice is remembered in `live_prefs` (`ST.saveBankPref`,
  routes/live.js:307).
- Packs: `scripts/live-bank.js` writes `public/vendor/data/live-bank/<version>/<lang>.js` for every available locale and
  the sha384 into the three quiz games (`seed-games/quest-race.html`, `question-battle.html`, `brain-board.html`, between
  `/* live-bank:begin */ … end */`), then `npm run seed`. **Adding a subject (e.g. `computing`) means**: editing
  `SUBJECTS` in engine.js, adding `en/computing.json` (and optionally other languages), `live.bank.subject.computing` in all
  13 locale files, rerunning `scripts/live-bank.js` + seed, and updating `tests/unit/live-bank.test.js` ("every hand-written
  subject has at least 25 questions at every level", line 19; "every language has the whole bank", line 121 — the latter
  will FAIL for an English-only subject unless its expectation is relaxed per subject).
- Other starters (`server/live/starters.js`): `STARTERS = ['board','math-8','math-10','math-12','science','geo']` (8),
  items from `live.starter.*` keys (translated). Referenced as `starter:<id>` on the form; only shown in the select when
  preselected (`views/live.js:501`).

### 3.4 Would You Rather (Live) and Atlas (Live)

- WYR (`server/live/wyr.js`): `TOPICS` (12) = animals, food, powers, school, travel, silly, sports, space, future, family,
  deep (36–38 dilemmas each; 414 total). Data `scripts/data/would-you-rather/en.json` items
  `{ id:'animals-1', cat, a:{text,tags}, b:{text,tags} }` with `<lang>.json` translations and `ui.json` (`cat.<topic>` names in
  13 languages); `scripts/wyr-bank.js` validates (`CATS`/`TAGS` lines 21-22) and builds the official game's packs
  (`public/vendor/data/would-you-rather/<ver>/`). Starter id `wyr:<topics joined by +|mix>:<count 5|8|10|15|20>:<secs
  10|15|20|30>` (`makeId` 54, `parseId` 45); form fields `wyrTopic[]`, `wyrCount`, `wyrSecs` (`ownStarter`
  routes/live.js:200; picker `wyrPicker` 192 → `views/live.js:477-484`). Votes also feed the official game's poll
  (`polls.vote`). **A "tech choices" topic needs**: new items with `cat:'tech'` in `en.json` + every `<lang>.json` (or they
  fall back to English per item, wyr.js:28-32), `cat.tech` in `ui.json` for 13 languages, `TOPICS` in wyr.js and `CATS` in
  wyr-bank.js, rebuild + seed; tests `tests/unit/live-wyr-atlas.test.js:27`.
- Atlas (`server/live/atlas.js`): `REGIONS` world/af/as/eu/na/sa/oc, `LEVELS` easy/medium/hard, `KINDS` find/capital/flag/
  famous, starter `atlas:<region>:<level>:<kinds+>:<count>:<secs>`; data read from `seed-games/atlas-quest.html`
  (`window.AtlasData`) and its packs. Not CS-relevant except as the pattern for "platform-made questions".

### 3.5 Preselecting /live from a URL (routes/live.js:146-180, views/live.js:442-527)

`GET /live` (hosts only; `hostOnly` 58 redirects others to `/join`) reads query params into `pre` (166-172):
- `?game=<gameId>` → `pick = 'game:<id>'`; `?mode=<quest-race|battle|board|wyr|atlas>` → `pick = 'mode:<id>'`;
- `?class=<classId>` → `audience='class'`, class selected; `?cl=<classLessonId>&step=<stepId>` → hidden inputs `clId/stepId`
  (views/live.js:527) and the class is derived from the class lesson (172);
- `?set=<liveSetId>` → `set:<id>` selected in `#lv-set` (views/live.js:458).
- NOT preselectable by URL: a bank subject/level, a `starter:` id, WYR topics or Atlas options (the form shows the host's
  remembered bank choice or "Question bank" by default; `pre.set` is only ever `set:<id>` from the URL).
- Form field names (what `POST /api/live/sessions` 285 → `sessionOpts` 207 reads): `pick`, `set` ('bank' | 'set:<id>' |
  'starter:<id>'), `bankSubject/bankLevel/bankCount/bankBoard`, `wyrTopic/wyrCount/wyrSecs`, `atlasRegion/atlasLevel/
  atlasKind/atlasCount/atlasSecs`, `audience` (open|class|family), `classId`, `clId`, `stepId`, `maxPlayers`, game settings
  (`ST.KEYS`), `teams`, `scoring`. JSON callers may send `{ mode, gameId, setId, starter, items[], audience, classId, clId,
  stepId }` directly (routes/live.js:207-215) — `items` is an inline, unsaved set (what `scripts/how-shots.js:455` does).
- Client `public/js/live-sets.js:13-85` only shows the set picker for quiz picks, the class picker for class rooms, and
  asks before replacing an open room (`hasOpen` 409).

### 3.6 Which mode takes which content (`classlive-sessions.createSession` 194-262 → `classlive-quiz.loadItems` 32-65)

| pick | needs questions? | source order |
|---|---|---|
| `mode:quest-race`, `mode:battle`, `mode:board` | yes (`quiz = mode !== 'game' \|\| check.quiz`, sessions.js:217) | `setId` (must be complete) → `starter` `wyr:`/`atlas:`/`bank:`/STARTERS → inline `items` (cleaned like a set) |
| `mode:wyr`, `mode:atlas` | platform-made only (`OWN_QUESTIONS`, 221-225); default `wyr:mix:10:15` / `atlas:world:easy:find:10:20` | ignores any set |
| `game:<id>` (official or Builder, live-ready via `classlive-check.liveCheck`) | only if the game declares `quiz: true` (`classlive-lint.js:82`) | same as the quiz modes |
Settings at start (`applySettings` classlive-quiz.js:71): shuffle questions (not for board), first N (`count`), one time for
all; Brain Board keeps set order and uses `cat` as column headings (sets without `cat` still make a board).

### 3.7 Language handling for content

- The session has one `lang` = the host's locale at creation (sessions.js:238, 255) used for platform-made questions (bank,
  WYR, Atlas, starters: `loadItems(..., lang)`), country names, and the projector. Each **player's** page/frame uses the
  player's own locale for chrome (`seat.lang`, frame token `l`, routes/live.js:495-505), and read-aloud picks a voice for
  that locale (`public/js/live-common.js`), so an English set read to a French-UI student uses the page's language voice.
- A teacher set is shown verbatim whatever anyone's UI language: `live_sets.lang` is informational only. So **English-only
  CS sets work in every UI language**; only platform-made content (bank subjects) is filtered per language (3.3).
- The results page and CSV show the host-written question text as asked (`itemStats`, classlive-quiz.js:232-233).

### 3.8 Results and the gradebook link (`server/services/classlive-results.js`)

- In memory for 10 min after the end; saved rows: `live_runs` (db.js:397: host_id, class_id, class_lesson_id, step_id,
  audience, mode, game_id, version_id, set_id, title, players, guests, `items` JSON = per question `{q, choices, answer,
  secs, counts, right, answered, topWrong}`, scored_by, teams, settings) and `live_run_scores` (db.js:403: run_id, user_id,
  score, rank, correct, answered, team, bonus, **marks** '1/0/-' per question) — class runs hosted by a class teacher only
  (`save` 84-114). A bound lesson step gets `progress.gameScore(u, clId, stepId, score, 'live')` (111).
- Views: `/live/results/:id[.csv]` (routes/live.js:523-597; persisted via `R.persisted` 149 for the host, the class's
  teachers, the platform admin; CSV columns `rank,student,team,score,bonus,correct,answered,q1..qN` + per-question block,
  `csv()` 186), `classRuns(classId)` 199 (the class Progress page panel), `hostRuns` 200 (the /live landing's "Recent").
  "Play the missed questions again" (`missedOf` 168) and "play again with these teams" reuse saved items.
- Retention: class-less runs 90 days, reports 1 year (`retention` 217). Deletion hooks on leave/merge (249/265).
- Teacher dashboard during a game: `/live/host/:sid/dash` (routes/live.js:333) with "needs help" (`classlive-dash.needsHelp`:
  <50% after 3 answers, or 2 wrong/missed in a row).

### 3.9 Landing-page copy for teachers

`/teachers/live` (routes/teachers.js:248-340): modes with capacities, demo video (`public/video/oomba-demo.mp4`), FAQ,
how-it-works steps `teachersLive` (views/how.js:41). `/teachers` (149) links to it when `liveOn()`.

---------------------------------------------------------------------------------------------------------------------------

## 4. Teacher pages: how they are built

### 4.1 Patterns in `server/routes/teachers.js`

- Helpers: `fb(t,key)` 53 adds `lang="en" dir="ltr"` when the string is still English in this locale (`t.own`), `el(t, tag,
  key, vars, attrs)` 55 renders one localized element, `lp(req, path)` 57 keeps links on the `/<lang>/…` address,
  `launchGame(slug)` 60 (official + viewable signed-out only), `faqBlock` 66 (markup + FAQPage JSON-LD),
  `maySetUpSchool`/`setupBlock`/`POST /api/teachers/school-request` 78-147 ("Set up my school" form with honeypot and rate
  limits `SETUP_LIMITS` 82).
- Page call: `page(req, res, { title, description, body, bodyClass: 'lp-page', head: howHead(), scripts: [HOW_SCRIPT],
  seo: { index: true, path, langs: seo.langsWithKey('<page>.h1'), image: '/og/<name>.jpg', imageAlt, jsonld: [seo.graph([...])] } })`
  (routes/teachers.js:231-245). Without `seo` a page is **noindex** (layout.js:8-9).
- Content lives under `teachers.*`, `teachersLive.*`, `learn.*` in `server/i18n/locales/en.json` (124 / 83 / 236 keys);
  subject hubs are data in `server/learn.js` (`HUBS` 37, `LEARNING` 10 with schema.org `teaches`, `TEACHER_GAMES` 47,
  `HUB_FAQ` 49, `CONTENT_UPDATED` 54 = sitemap lastmod; `gradeBand` 24).
- For a new public page `/teachers/cs-quest` (or `/learn/computer-science`): add the route; add it to `LOCALIZED`
  (`server/seo.js:36`) so `/es/teachers/cs-quest` works; add a `sitemapEntries()` row (`server/routes/seo.js:44-61`);
  `langsWithKey('teachersCs.h1')` lists only translated languages for hreflang; OG image via `scripts/og-images.js`
  (`fsOg` routes/teachers.js:34); JSON-LD `EducationalAudience`/`LearningResource` as in 231-244; breadcrumb crumbs. For a
  signed-in teacher page (`/teach/cs-quest`), follow `/teach` (routes/schools.js:349): `requireUser`, `isSchoolStaff`
  guard, `active: 'classes'`, `head: CSS` (community.css + schools.css), `back`.

### 4.2 Layout contract (`server/views/layout.js:1-9, 150`)

`layout(req, { title, active, body, scripts, head, back, backLabel, bodyClass, description, bare, mid, i18n, seo })`;
`page(req, res, opts)` 269; `notFound` 270. `active: 'classes'` highlights the Classes tab for staff (`shellFor` 71: staff
tabs are Classes · Games · (School) · (Plans) · Me; `currentTab` 102). `scripts: ['/js/x.js']` auto-embeds `js.app.*` and
`js.x.*` strings for the browser (`clientStrings`, layout.js:234-243; `tests/unit/i18n.test.js:158` fails a browser module
that uses other prefixes). `mid: true` = reading width (lesson pages). `VERSION` 31 cache-busts assets.

### 4.3 Components (`server/views/components.js`)

`gradeLabel` 36, `avatar` 46, `coverArt` 72 (real covers from `public/covers/<slug>.jpg`, made by `npm run covers`),
`gameCard` 80 / `cardGrid` 118 / `rail` 105, `emptyState` 122, `statusLabel` 97, `makeGameBtn` 130, `notYou` 59 (shared
devices). Live badge via `liveGameOf`. Forms are plain `<form data-api="/api/…" data-reload data-toast data-confirm>`
handled by `public/js/app.js` (no JS needed for links; `details.inline-menu` menus).

### 4.4 Screenshots pipeline for teacher pages (`server/views/how.js`, `scripts/how-shots.js`)

- `STEPS` (how.js:23): `teachers` = teachers-classes, teachers-join, teachers-lesson, teachers-student, teachers-gradebook;
  `teachersLive` = live-pick, live-lobby, live-join, live-play, live-results. Each needs 4 files
  `public/img/how/<slug>-p-390.webp, -p-780, -d-1024, -d-2048` (`howFiles` 19); a step with missing files is skipped (53).
  `ART` 50 picks the hero laptop/phone images. `howSteps(req, page)` 83 renders `<page>.how.h/lead` and
  `<page>.how.<n>.h/p/alt` keys; `howHead()` + `HOW_SCRIPT` go into `page()`.
- `npm run how-shots -- --only teachers|live|parents [--keep]`: seeds a throwaway DB (`seedMode` how-shots.js:30: Sunny Hill
  Demo School, Ms. Rivera, five school accounts, the demo lessons), starts the app on `HOW_PORT` (5990) with
  `BRB_ALL_LOCALES=1`, captures with Playwright at phone 390×844@2x and desktop 1024×640@2x (`makeShooter` 157: light theme,
  reduced motion, `HIDE_CSS` 154, a `focus` selector scrolls under the sticky bar), **throws** on any price (`PRICE` 151),
  a Plans link, or a name outside `NAMES`/`STUDENTS` (26-27), then encodes WebP via ImageMagick or Chromium (`encodeAll`
  525) and fails if a page's phone images exceed 600 KB (`report` 549). `teacherShots` 357, `liveShots` 397 are the models
  for a `csShots` block (add `--only cs`, add `STEPS.teachersCs`, add keys `teachersCs.how.*`).
- Guards: `tests/unit/how-it-works.test.js` (files exist, alt text, no prices), `tests/e2e/how-it-works.spec.js`
  (`PAGES = ['/parents','/teachers']`, touching checks at 360/768/1280, light/dark, Hebrew).
- Other screenshot tools: `npm run screenshots` (`scripts/screenshots.js`, generic pages, no teacher pages listed),
  `scripts/layout-audit.js` (crawls `/teach`, `/teach/lessons` etc. as `AUDIT_USERS="teacher:DemoTeacher:pass"`).

### 4.5 Print CSS

- `public/css/app.css:911-919`: `.printdoc` container + `@media print` hides `.topbar,.tabbar,.foot,.backlink,.skip,
  .printbar,.noprint`; `public/js/print.js` binds `[data-print]` → `window.print()`. Used only by `/plans/schools/print`
  (routes/plans.js:224-252: `bodyClass:'printpage'`, `scripts:['/js/print.js']`).
- `public/css/schools.css:166-172`: print rules for login cards only. `public/css/live.css:296-307`: print rules for the
  results page. `public/css/how.css:111`: hides hero art when printing.
- **Lesson pages have no print view.** A printable 45-minute plan = a route rendering the lesson in a `.printdoc` with a
  `data-print` button and `scripts:['/js/print.js']` (the existing recipe), or a `@media print` block in schools.css for
  `/teach/lessons/:id` hiding `.edacts`, `.acts`, `details`, forms.

### 4.6 i18n system and the "13-language rule" (`server/i18n/index.js`, `server/i18n/README.md`)

- `LOCALES` (index.js:27): en, en-GB, pt, fr, es, de, he (rtl), ja, ar (rtl, Western digits), ru, it, zh-Hant, nl.
  Lookup chain locale → base (`en-GB` → `en`) → `en` (`chain` 103, `lookup` 112). `en-GB.json` holds only differences
  (16 KB). Files are nested JSON flattened to dotted keys; `_`-prefixed keys are comments.
- `t.own(key)` (makeT 128-136): is the string really in this language (English counts as own for en/en-GB). `tHtml` 138
  for strings with `<b>`/`<a href="{href}">`. `clientStrings` 148 for browser modules. Formatting `fmt` 200 (`f.day` for
  stored calendar days, `f.ago`, `f.int`).
- "Only finished languages are offered": `availableCodes` 91 requires ≥ `READY_SHARE` 0.9 of **counted** keys;
  `UNCOUNTED_PREFIXES` 89 = `info.terms. info.refunds. info.privacy. teachers. parents. learn. seo. info.parents.made.
  family.made.notice.` — long page copy may ship English-first under these prefixes (marked with `fb()`/`el()` so the
  element is `lang="en" dir="ltr"`, and `seo.langsWithKey` keeps untranslated languages out of hreflang/sitemap).
- Checks: `npm run i18n:check` (`scripts/i18n-check.js`; `--keys`, `--strict`) and `tests/unit/i18n.test.js:158`
  ("locale files: every key exists in en.json, placeholders match, notes and code keys are valid") — FAIL on: extra keys
  in a locale, placeholder mismatch, unparsable ICU, a literal `t('x.y')` in code without an en.json key, browser modules
  using out-of-scope prefixes, `notes.json` notes for unknown keys. **Missing translations are not an error** (they fall
  back to English) — but the site's convention (decisions.md "Thirteen site languages", README) is that every UI string
  ships in all 13; `tests/unit/nav-roles.test.js:125` and `tests/unit/live-bank.test.js:87` are examples of tests that assert
  translated labels exist.
- Rule of thumb for CS Quest: (a) anything a teacher or student clicks/reads as chrome (buttons, headings, tabs, empty
  states, toasts, error messages, CSV headers, kind labels) → new keys under `lessons.*`, `progress.*`, `school.*`,
  `live.*`, `js.<module>.*` in **all 13** files (mechanical merge script precedent: `scripts/i18n-add-live-wyr-atlas.mjs`);
  (b) the marketing/landing copy of a new `/teachers/cs-quest` page → `teachers.*` (uncounted; English-first allowed with
  `el()`); (c) lesson text, quiz items, WYR dilemmas, standards codes → data (DB rows or JSON), English only is fine;
  CSTA codes are untranslated tokens. Translator notes go in `server/i18n/notes.json`. The AI-draft prompts take a
  language name from `LANGS` (lesson-ai.js:18, set-ai.js:19).

### 4.7 Tests that cover teacher pages

- `tests/unit/seo.test.js`: `PUBLIC` list (line 49) includes `/teachers`, `/teachers/live`, `/learn/<hub>`; checks robots,
  sitemap hreflang (83-86), canonical on `/es/teachers` (191-195), structured data (156-165), no child names on signed-out
  pages (207), the h1 text of `/teachers` (224), gzip (247). A new indexable teacher page must be added here and in
  `tests/e2e/seo.spec.js`.
- `tests/unit/how-it-works.test.js`, `tests/e2e/how-it-works.spec.js` (4.4); `tests/unit/nav-roles.test.js` (shell tabs per
  role, "Make a game" for staff); `tests/unit/schools.test.js:139` ("pages: … teacher pages for teachers"); `tests/unit/
  live-pages.test.js`, `live-entry.test.js:64` ("a teacher gets Host a live game with the mode picked"); `tests/unit/
  school-requests.test.js`, `who-for.test.js`, `home-doors.test.js`; e2e `layout.spec.js` (touching), `school-setup.spec.js`.

---------------------------------------------------------------------------------------------------------------------------

## 5. Builder capstone hooks

### 5.1 Assigning a build (today)

A lesson step `kind:'build'` with `body` = the idea (≤4000 chars; the Studio prefill takes the first 300:
routes/progress.js:318 `ask=<body.slice(0,300)>`; `public/js/studio.js:1829` reads `?ask=` into the input, max 600).
Flow: student presses "Start building" → `POST /api/progress/:clid/:sid/build` (routes/progress.js:307) creates one Studio
game per student per step (`games.createGame(..., { title: step.title || lesson.title, icon:'🎓', category:'learning' })`,
`P.buildGame` stores `step_progress.game_id`) → Studio → "Hand in" (routes/progress.js:54: publish at `'class'` for this
class, see 2) → teacher sees `/g/<slug>` on the lesson progress page (routes/progress.js:213) and on the class Games tab.
The teacher's own template for the capstone can be made with "Make a new game for this lesson" (routes/lessons.js:341,
`/studio/:id?ask=`), then shared with the school ("Share with my school", 333).
There is **no "start from this template" option on a build step**: `POST /api/studio/new` (routes/studio.js:262) takes
`template` ∈ `TEMPLATE_KEYS` but the build step always calls `games.createGame` with an empty game; the AI picks a starter
itself (`BUILDER_TEMPLATE_KEYS`, builder/catalog.js:15). Adding a `template` column to `lesson_steps` and passing it to
`templateHtml(key)` in the build route is a small change if the capstone should start from Quiz Show.

### 5.2 Studio templates ("Start from", `/build` page routes/studio.js:151-193)

`server/builder/catalog.js:12 TEMPLATE_KEYS = ['quiz','runner','catch','memory','word','duel','board','island']`;
`server/builder/templates/index.js:15 TEMPLATES` (titles/descriptions; `quiz` = "Quiz Show": ten multiple-choice questions,
timer, streaks; `island` 3D; `world3d` Builder-only). Templates pin the kit (`kitTag`), keep editable `CONFIG` and a WORDS
table in 13 languages; `tests/unit/templates.test.js`.

### 5.3 Publish / class sharing / safety review for a kid's capstone game

`publish(user, gameId, 'class', { classIds })` (publish.js:66): static scan (`scanner.scanVersion`, fail = blocked) →
'class' is a group audience → **instant** when the scan is clean (`pass`) or an earlier approval covers it (publish.js:103-
116) → else `reviewVersion` (review.js:66; a flagged version is never auto-approved) → admin queue (`/admin?tab=queue`,
routes/admin.js:38-70 shows audience + classes, `moderation.reviewQueue`). Teachers moderate after the fact on the class
Games tab (remove/put back, 2). School accounts whose school sets `publishing:'school'` can never go public
(`sharingOptions` schools.js:540). Hand-in never widens visibility beyond the class (routes/progress.js:54-66).

### 5.4 Playtest

The Builder's automatic playtest (`server/builder/autotest.js`; decisions.md "The Builder playtests every build by itself"):
after every saved version the platform plays the game (~18 s of input on phone/tablet/desktop via `snapshot.js`), builds a
report, and the AI gets `fixRounds` = 1 for kids, 3 for trusted makers (autotest.js:18; staff/class teachers are
`trustedMaker`, usage.js:36 — they also always build on the Pro model). UI strings: `js.studio.steps.playtest.now` =
"Playing your game like a player would" (en.json ≈ line 2116), `builder.autotestLeft`. The model can also call
`playtest_game` (`server/builder/tools.js:146`). Needs headless Chromium (`BRB_SNAPSHOTS`, config.js:274; ~1 GB RAM in-app,
or the worker `SNAPSHOT_URL`, config.js:281; `snapshot.js` runs **one game at a time**).

### 5.5 Limits a 30-student capstone will hit (quantified)

| limit | value | where |
|---|---|---|
| Builder messages per student per UTC day (free) | `BUILDER_DAILY_TURNS` = **60** | config.js:199, usage.js:44 |
| Builds running at once per student | **2** (`LIMITS.maxPerUser`) | builder/runner.js:48 |
| Chat endpoint rate | 20 messages/min per user | routes/studio.js:297 |
| New games | 30/h per user (`studio-new`) — also the build-step route | routes/progress.js:307, routes/lessons.js:341 |
| One build attempt | 20 min (kids), 40 min (staff) | config.js:266/269 |
| Site AI budget (free pool) | **$5 / UTC day, $150 / month** → the Builder goes to the offline mock ("resting") for **everyone** at the cap | config.js:271-272, ai-budget.js:107 |
| Model prices | sonnet-5-5 $2 in / $10 out per M tokens; a build turn may emit up to 64 k tokens (`builderMaxTokens`) | ai-budget.js:16-24, config.js:264 |
| School plan pool | seats × `SCHOOL_TURNS_PER_SEAT` 100 messages / year; min 25 seats; daily cap per person `SCHOOL_DAILY_CAP_DEFAULT` 30 (settable to 500); paid AI pool = seats × `SCHOOL_SEAT_AI_USD` $10 / 12 per month | config.js:341-344, school-billing.js:49/62/104 |
| `LESSON_MESSAGES` | the billing page assumes **10 Builder messages per student per lesson** | school-billing.js:29 |
| Screenshots/playtests | one at a time per server/worker | snapshot.js:5 |
Back-of-envelope: 30 students × ~8 messages in one period = 240 turns; at ~$0.15–0.40 per turn (output-heavy builds plus the
autotest fix round) that is $35–100 of API spend in an hour versus a $5 **site-wide** daily cap → the free pool cannot run a
class capstone; it needs a school plan (30 seats = 3,000 messages/year = 10 lessons × 10 messages per student, $25/month of
paid AI) or raised `AI_DAILY_BUDGET_USD`. With a plan the per-person daily cap (30) and `maxPerUser` 2 are the binding limits
per session; without one, "limitClass" (`builder.errors.limitClass`) is what students see. Queueing: builds are serialised
through one runner per instance (runner.js header) — 30 simultaneous first builds will take minutes each; plan 2–3 sessions.

### 5.6 Student games that are live-hostable

A Builder game becomes live-ready when it loads the kit `live` pack and calls `Oomba.live.ready(...)` + reports results
(`classlive-lint.js:60-83`, notes `LIVE_NOTES` 97; docs/kit-api.md:217-260). `quiz: true` games play with any teacher set
(decisions.md "Live quizzes back…"). The Studio shows a "make it live" ask (`live.entry.studioAskText`, routes/studio.js:143).

---------------------------------------------------------------------------------------------------------------------------

## 6. Progress and standards (what is stored per student, and where a CSTA tag could live)

### 6.1 Result stores today

| store | key | per | fields usable as a tag |
|---|---|---|---|
| `step_progress` | class_lesson × step × user | lesson step | `label` (≤40, from the game's score label; 'quiz'/'live' reserved), `marks` (quiz) — no free field |
| `scores` (leaderboard, db.js:59) | game × user (best) | game | `label` ≤40 (public! `cleanScoreLabel` games.js:316 filters it) |
| `plays` (db.js:56) | per play | game | none |
| `live_runs.items[]` | run | question | **`cat`** (≤40, teacher-typed category; in `itemStats` only as the Brain Board column name — not persisted per item today; the saved item row has q/choices/answer/secs/counts/right/answered/topWrong, classlive-results.js:80) |
| `live_run_scores` | run × student | run | `marks` per question (aligns with `items[]` order) |
| `lesson_steps.items` (quiz snapshot) | step | question | only q/choices/answer kept (lessons.js:234) |
| `lessons` | lesson | lesson | `subject` (40), `grade` (12), `objectives` (free text) |
| `games` | game | game | `tags` comma string (seed JSON `tags`), `category` |
No table has a standards/skills column; `BRB.score`/`gameOver` carry `{score, label, won}` only (docs/sdk.md:56-57,
play.js:67-68). Live-run `cat` is the closest thing to a per-question tag but is dropped on save and on quiz snapshots.

### 6.2 Minimal "standards practiced per class" view — what it needs

1. **Where the code lives**: a `standards` field on the content, not on results. Cheapest: (a) `lesson_steps.standards TEXT`
   (comma list like `1B-AP-10,1B-AP-11`) set by the CS Quest template materialiser; (b) keep `cat` on set items through
   `addQuizStep` (lessons.js:234) and `itemRow` (classlive-results.js:80) so a per-question standard survives into
   `step_progress.marks`/`live_run_scores.marks`; (c) optionally `games.standards` for official CS games (seed JSON →
   `scripts/import-game.js` fields line 19). A tiny catalogue module (`server/standards/csta.js`: code → `{ band:'1B'|'2',
   concept, practice, text }`) gives names.
2. **Query**: for a class, join `class_lessons (removed_at IS NULL) → lesson_steps → step_progress (status='done')` grouped
   by standard code × student → "practised by N of M students", plus accuracy from `marks` where items carry a code;
   `live_run_scores ⋈ live_runs(class_id)` for live sessions. Reuse `P.classProgress`-style one-query-per-page SQL
   (progress.js:166-168) and `S.roster` for the student list.
3. **Page**: a new class tab or a section on `/class/:id/progress` (`classHeader` tabs are a fixed list `CLASS_TABS`
   routes/schools.js:401 — adding `'standards'` means a new href and `school.classTabs.standards` in 13 languages), a CSV
   like `progress.csv` (routes/progress.js:164), gradebook CSS classes (`.gbwrap .tbl.gradebook`, schools.css).
4. **Privacy**: per-student standards mastery is an education record like the gradebook (legal-review item 42 treats
   per-student live data as school-only, deletable on leave/merge: `S.onClassLeave`/`onAccountMerge` hooks schools.js:172-177,
   classlive-results.js:249/265). Keep it inside the class, out of projectors/results pages/exports beyond the teacher's CSV,
   and honour the same deletion hooks if any new per-student table is added.
5. **Tests**: extend `tests/unit/progress.test.js` (gradebook/CSV patterns at 103 and 151) and `lessons-quiz.test.js`.

---------------------------------------------------------------------------------------------------------------------------

## 7. Build checklist for the teacher-facing program (files an engineer will touch)

1. Content catalogue: `seed-lessons/cs-quest/*.json` (lessons per band 1B / 2, each ≤40 steps, 45 min of `minutes`,
   `gameSlug` for Robo Route / Data Detective / Packet Post / Inside the Machine, build-step ideas ≤300 chars for the prefill,
   quiz items `{q, choices(2-4), answer, secs ∈ SECS, cat:'<CSTA code>'}`, WYR topic list).
2. `server/services/lesson-templates.js` (validate + materialise via `L.createLesson/addStep`, `SETS.createSet`), route
   `POST /api/lessons/from-template/:key` + teacher page (`/teach/cs-quest` signed-in and/or `/teachers/cs-quest` public)
   in a new `server/routes/cs-quest.js` mounted in `server/app.js:184`; link from `/teach` (routes/schools.js:360) and the
   library (routes/lessons.js:98-126 `libtools`).
3. Live content: a `computing` bank subject (engine.js:9 + `en/computing.json` + `live.bank.subject.computing` ×13 +
   `scripts/live-bank.js` + seed + live-bank tests) and/or per-lesson sets created at copy time; WYR `tech` topic
   (wyr.js:12, wyr-bank.js:22, 13 data files, `ui.json`, rebuild). Deep links: `/live?mode=wyr&class=<id>`,
   `/live?mode=battle&set=<setId>&class=<id>`, `/live?cl=&step=&mode=…` (see gotcha 1).
4. i18n: new keys in `server/i18n/locales/*.json` (13 files) for chrome; `teachers.cs*` for landing copy; `notes.json`;
   run `npm run i18n:check` and `npm test` (`tests/unit/i18n.test.js`).
5. SEO + tests: `server/seo.js:36 LOCALIZED`, `server/routes/seo.js:44 sitemapEntries`, `learn.js` (a `computer-science`
   hub under `HUBS` with the four games once they are seed games, `LEARNING` entries, `CONTENT_UPDATED`),
   `tests/unit/seo.test.js:49 PUBLIC`, `tests/e2e/seo.spec.js`, `how.js STEPS.teachersCs` + `scripts/how-shots.js` block +
   `tests/unit/how-it-works.test.js`.
6. Print: `.printdoc` lesson view + `data-print` (4.5).
7. Standards: `lesson_steps.standards` (+ migration in `server/db.js MIGRATIONS`), keep `cat` through snapshots/saves,
   class standards view + CSV (6.2).
8. Docs: `docs/decisions.md` entry, `README.md` env/flags (`LIVE_HOMEWORK` if the program relies on homework quiz steps),
   `docs/status.md` test matrix row.

---------------------------------------------------------------------------------------------------------------------------

## 8. Gotchas

1. **"Host live" from a lesson step uses `?game=<id>`, but the built-in mode games (Quest Race, Question Battle, Brain
   Board, WYR Live, Atlas Live) have no `game:` card on /live** (`officialReady` routes/live.js:145 filters `MODES` slugs
   out; modes are `mode:` cards, views/live.js:475). So a lesson game step pointing at one of those games gets a Host-live
   link that lands on /live with nothing selected. The game page already does it right (`/live?mode=…`, routes/games.js:152).
   Fix in routes/progress.js:286 with `liveGameOf(game)` (server/live/live-games.js:14): emit `mode=` for them. The
   gradebook binding still works for modes because `createSession` resolves the mode's official game and compares
   `step.game_id === game.id` (classlive-sessions.js:210, 233).
2. `LIVE_HOMEWORK` is **off by default** (config.js:228, README:100): quiz steps, `/api/lessons/:clId/steps/:stepId/quiz` and
   "Set as homework" all 404 until it is on. The student page still renders a quiz step's block when one exists.
3. Quiz snapshots drop `cat` and `secs` (lessons.js:234) and `copyLesson` drops quiz items entirely (lessons.js:191): a
   copied lesson with a quiz step has an empty quiz. Copying official lessons must regenerate quiz steps from the set.
4. No official lessons/sets exist; every lesson and set needs an owner who is staff of a school (`isStaffOf` lessons.js:25;
   `staffSchool` classlive-sets.js:20). The `OombaAcademy` account is in no school; the platform admin has no library.
5. `/live` class rooms require the host to **teach** the class (`audienceRefusal` classlive-access.js:49-52); a school admin
   can assign lessons to any class but cannot host live for one they don't teach.
6. URL preselection on /live covers mode/game/class/cl+step/set id only; bank subject, starter, WYR topics are not
   preselectable (routes/live.js:166-171, views/live.js:458). Hosting a built-in mode from a link therefore needs a saved
   teacher set (`?set=`) to be fully deterministic.
7. The bank's `SUBJECTS` list is shared with shipped game packs: changing it requires `scripts/live-bank.js` + `npm run seed`
   and changes the three quiz games' HTML; `tests/unit/live-bank.test.js:121` expects every language to have every
   subject at every level — an English-only CS subject breaks it as written.
8. `lessons.grade` is 12 chars and `gradeLabel` prefixes "Grade" only for a bare number: "3-5" / "6-8" render as typed
   (never as "Grade 3-5"), so write the band the way it should read, e.g. "Grades 3-5" (10 chars).
9. Step bodies are plain text only (no links, no markdown; `paras()`); 4000 chars max. Lesson plans with teacher notes,
   materials lists and answer keys must be split across `summary` (600), `objectives` (1000) and text steps — or get a
   dedicated printable page.
10. Build-step prefill is the first 300 chars of the step body (routes/progress.js:318); the teacher-side "new game" idea is
    300 too (routes/lessons.js:343); Studio accepts 600 from `?ask=`.
11. Game steps need `playableBy()`: a Builder game shared only with one class is "not ready" for another class; official
    games must be `published` + `visibility='public'` (seed import sets this, scripts/import-game.js:24-26). New seed games
    must be in `SEED_GAMES` (scripts/seed.js:23) or `game(slug)`-style resolution returns null and the step is skipped.
12. `step_progress.score` for a game step is the **best** score and only from `/play?lesson&step` or a bound live run;
    free play of the same game outside the lesson never counts (routes/games.js:246-248 requires the query params).
13. AI features (Draft with AI, set drafts) silently fall back (template / `aiOff`) when `ANTHROPIC_API_KEY` is unset or the
    budget rests; tests run with `config.anthropicKey=''` (lessons.test.js:7).
14. The free AI pool is **site-wide** ($5/day): a class capstone can switch the Builder to the mock for every user of the
    site (ai-budget.js:1-7). Plan for a school plan / raised budget (5.5).
15. New browser scripts must use only `js.app.*` + `js.<name>.*` keys (layout.js:234, i18n.test.js:158); a new `/js/cs.js`
    needs `js.cs.*` keys.
16. Adding a locale key to en.json without the other 12 files passes tests but shows English in those UIs; convention is
    to add all 13 (see `scripts/i18n-add-live-wyr-atlas.mjs`). Teacher landing copy may stay English-first only under the
    `UNCOUNTED_PREFIXES` namespaces and must be rendered with `el()`/`fb()` so it is marked `lang="en"`.
17. Public teacher pages must never show a child's name (seo.test.js:207) or a price (how-shots `PRICE` guard); signed-out
    renders use `anon` in `current()` (i18n/index.js:294).
18. Session lifetimes: school students 1 h idle / 10 h, staff 12 h idle / 7 days (db.js:142-150, docs/status.md:32); a
    45-minute lesson is fine, a multi-day capstone means re-login (login cards `/cards/:k`).
19. One app instance, in-memory live sessions and rate limits (README "Deploy", decisions.md "Oomba Live part 1"); a
    restart ends live sessions (after saving) — avoid deploys during class time.
20. `LIVE_SAVE_SUPPORT` and co-host flags are legal-review gated (docs/legal-review.md items 42-43); any new per-student
    data (standards mastery) should follow the same deletion hooks and stay teacher-only.
