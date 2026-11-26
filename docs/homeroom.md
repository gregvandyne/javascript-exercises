# Homeroom

Approved by the owner on 2026-11-25. Homeroom is the place a teacher runs a class from: one big board, built on the
Manipulatives live room, with a desk for every student placed where they really sit, a teacher's area across the top,
and every Oomba lesson, tool and lesson plan on the teacher's desk as a handout. Planning runs through the Oomba chat.

Words (docs/decisions.md "Teachers say lessons"): what teachers see calls a playable thing (a game) a **lesson** and a
multi-step lesson, or one made in the lesson builder, a **lesson plan**. Students keep "game" on their desk. This spec
uses the teachers' words for the teacher's side.

Clickable mockups (owner-approved look and behavior): the teacher's Homeroom, the student desk on a tablet.

## Who gets it

- Teacher plan only. Other teachers see a short preview on their class page that links to /plans (prices appear only
  on /plans). Students never see plans or prices. If a plan ends, desks stay readable; live class and new handouts
  turn off.
- Behind the `HOMEROOM` flag until launch (`HOMEROOM_USERS` lets named accounts in, like `MANIPULATIVES_USERS`).

## A class's tabs

For Teacher plan teachers a class has three tabs:

- **Homeroom**: running today (the board, desks, handouts, live class, today at a glance).
- **Classroom**: the calm, simple overview over weeks. One column per handout (lesson plan, lesson, quiz, reading, own
  lesson) with how it is graded; one row per student, alphabetical, never ranked; trends; summary numbers; the Google Classroom
  status line. Everything that exists today stays one tap away and unchanged: the full gradebook and CSV, student
  reports, standards, rubrics, and every Google Classroom feature (link, roster sync, posting, draft or assigned grades,
  automatic sync, the log).
- **Dashboard**: unchanged.

The three are one page with three views (docs/decisions.md "Homeroom: one page, three views"): one shared bar (class
switcher, the three tabs, the view's own buttons) and switching that never loads the page again. A lesson opened from
Homeroom (My desk, a student's handout card) plays in a layer over the board or the desk.

Teachers without the Teacher plan keep today's class page.

## The board (teacher)

- Same feel as the Manipulatives live room: dotted board you pan and zoom, floating panels, chunky buttons, zoom pill
  bottom left, minimap bottom right, the Oomba chat button bottom right.
- Teacher's area (yellow band, "Teacher's area · everyone can see this") across the top: slides (Google Slides links,
  PDFs and PowerPoint files), sticky notes, text, pen, and a Shapes picker (25 shapes and lines) with fill, outline
  weight and dashes, arrowheads, text and note colors, copy and paste, many selected at once, undo and redo
  (docs/decisions.md "Homeroom: board tools"). An Eraser beside the pen takes only what it passes over (a line it
  crosses is cut in two). The teacher resizes the area by its edges and bottom corners (saved per class; desks it grows
  over move down, My desk stays under its middle; the projector and desks' windows follow). Notes, text, shapes and
  lines also go anywhere else on the board, around the desks: the teacher's and aide's board and students' See the room
  show them, never the projector (docs/decisions.md "Homeroom: touch drag, eraser, resizable area, the whole board").
- A desk per student, name above it, border in the student's group color. **Arrange seats** to match the real room:
  Rows, Tables of 4, U-shape, Circle, then drag any desk; each class keeps its own seating. **Team desks**: students who
  share one desk.
- Groups the teacher names (for example Stretch, On track, Building).
- Left panel (teacher's desk): Hand out to (Whole class, groups), My lesson plans (+ Build a lesson plan), the catalog
  (search, grade, subjects: Lessons I built, My folders, Shared with me, Favorites, Oomba lessons by subject, Teaching
  tools), Reading, Class flow (brain break, note, timer, used right away), Board tools.
- **My desk** (the teacher's own desk on the board, under the teacher's area): the teacher drops or tap-places any lesson,
  lesson plan or tool there, even before the class has students, to try it (Play / Preview) and hand it out later (Hand
  out, then a desk, a group or Whole class; or drag the card there). Dragging works by touch too: a short hold or a move
  out of the panel (a phone's strip still scrolls sideways), a ghost under the finger, the target outlined. Staged, not assigned: students never see it. Kept
  per class. Whole class works with no students yet ("No students yet. Students who join will get it."). Details:
  docs/decisions.md "Homeroom: the teacher's desk".
- Top bar: class switcher, tabs, Live dot, the plan pill (Today / Now with countdown / Time's up), +5 min and Next
  during a plan, the Needs a look count, Today (today at a glance), Hands, the yellow Everyone to Homeroom / Bring
  everyone to me, and the ⋯ menu (Arrange seats, join code, projector view, K-2 desks, Parents' view, Students draw on
  the room, Show me around, End class).
- **Students draw on the room** (⋯ menu, off by default): when on, students in See the room draw with a pen and erase
  their own lines anywhere outside other students' desks, the teacher's area and My desk; everyone in See the room sees
  them without names, the teacher's board shows whose (Remove, Clear students' drawings); never on the projector;
  locked while screens are paused or a desk is locked.
- **Pause screens** for everyone; for one student: hide cursor, lock desk, remove a sticky they added.
- **Projector view**: teacher's area, Now/Next timer, slides, brain breaks. Never names, hands, Needs a look or progress.

Built (docs/decisions.md "Homeroom: watching desks and the full catalog"): while class is live each desk on the board
shows what that student has open, scaled into the desk, as the Manipulatives live room shows each board in its square:
the game in their player (a small picture the game's own frame draws, every 5 s while the desk is on screen, with their
pointer), their square of a Manipulatives tool's live room (drawn by the tool's own code, live, with their cursor), the
page they are reading, or their cards and doodle pad. Tapping the desk opens it large in look (a picture every 1.5 s),
with Open the room for a tool. Never the notebook; nothing recorded or stored; the class's teachers and aides only (never
a sub's link, the projector, parents or classmates). Students see "Your teacher can see your screen in Homeroom." on their
desk and over every game. **Manipulatives tools hand out**: each one is that tool's live room for the class, opened in the
desk's player exactly as on its own page (one tool at a time per class; open practice, not graded). The left panel's
catalog lists every lesson a teacher can assign elsewhere (all their own, their folders, shared folders, favorites, every
Find Oomba lesson by subject, every Manipulatives tool by category, Figures for My desk) with search, grade and subjects;
on a phone the strip's Find lessons opens it in a sheet.

## Handouts, lessons and lesson plans

- A **lesson** handout (a game, to students) is free play with optional instructions. A **lesson plan** is exact: built
  in Homeroom for any lesson or tool (teachers' own lessons included) with that tool's own settings, a worksheet preview,
  and a version per group.
- Each handout: In order or Any order on the desk; graded by Score (% right or rubric points), Completion (100% when
  finished) or Not graded. Defaults: lesson plans by score, free play by completion. Google Classroom gets the chosen grade.
- **Due** (every handout but a Manipulatives tool, which is ungraded practice): No due date, Today (the end of the day),
  Tomorrow, Friday, or Pick a date with an optional time. The desk card says "Due Fri"; without In order the desk's Next up
  is the one due soonest; the parents' view and the Classroom overview's column show it; Google Classroom gets it as the
  coursework's due date and time. Late is the teacher's only, calm ("after due", never red), and never for work given
  while a student was absent. Unfinished handouts stay as homework with their due dates.
- Lesson plan builder order: Arithmetic Lab, Algebra Builder, Crossword; then classroom quiz/memory/word and own lessons; then
  Atlas Quest, Sudoku, Castle Clash puzzles; then Manipulatives and Figures; then Reading.

## The day's plan (through the Oomba chat only)

Oomba drafts parts in order (slides, work time with per-group versions, brain break, exit check); Use this plan puts
handouts on desks. Changes are asked for in the chat. During class the pill shows Now, countdown and Next; it turns
yellow when time is up and never moves on by itself. Finish class shows a short summary; unfinished handouts stay on
desks as homework; plans can be saved, copied to other sections, and planned for the week.

Built (docs/decisions.md "Homeroom: the day plan"): on a class's Homeroom the Oomba chat drafts the plan as a card
(Use this plan, Use and start, Save plan, Saved plans, Copy to another class); without the AI a request still gets a
simple starting plan. The plan pill sits in the top bar after the Live dot; the timer is held by the server, so the
projector (Now and Next with the countdown) and the desks (a small Now line) show the same part. End class offers
Finish class while a plan runs.

Built (docs/decisions.md "Homeroom: week plans, due dates, copying plans"): **week plans** through the same chat: "this
week's plan" is a card with Monday to Friday (the class's school days), each day a short day plan; changes are asked for
in the chat ("move the quiz to Thursday", "Wednesday is a half day"); without the AI a request still gets a week (a saved
plan repeated, or the teacher's lessons spread over the days). **Use this week** saves five dated day plans; each morning
the pill has that day's plan ("Today", Start: nothing is on desks and nothing starts until the teacher taps Start or Put
on desks; parts never move on by themselves). The pill's menu has the **week strip** (Mon..Fri chips): open a day, swap
two days, clear one; still no plan row on the board. **Copying**: a day or week plan to another class shows a preview
first (what goes to whom there; "no Stretch group in 5C: goes to everyone"); lessons and handouts are made there only
when the plan is used. **Copy to next week** for a week plan.

## The student desk

Their square from the live room made into a desk: handouts in order (Next up / Later, or any order), the book they're
reading, a doodle and working-out pad (pens, an eraser that takes only what it passes over, Undo, Clear), a small window on the teacher's area, Raise hand (question, help, bathroom via
the hall pass queue), and a dock (My desk, Teacher's area, Library, See the room). Students can zoom out to see every
desk (classmates' notes show without their words) and change only their own or their team's. The **notebook** opens
from the green corner button on every Oomba page: running notes across sessions, tabs, search, highlight. The teacher
can read the whole notebook (students are told); parents see handout notes, not personal tabs. Layouts for tablet,
laptop (Chromebook 1366x768) and phone. K-2 mode by grade. Supports per student (extra time, read aloud, simpler
wording, bigger text) apply to every handout.

Built (docs/decisions.md "Homeroom: supports, aides and sub links"): the teacher taps a student's name on their desk for
the desk's menu: Extra time (1.5x, 2x), Read aloud, Simpler wording, Bigger text, saved per student per class (the same
saved support Oomba Live uses). The student sees them as tools on their own desk and over the game: larger text, Read to
me beside the teacher's words, the simpler wording the teacher typed (or Oomba wrote in the chat, never seeing a name),
and their own longer clock for the plan's part on now. A small 🧩 on the desk shows the teacher and an aide who has
supports; classmates never see them. Games get them as `BRB.support` / `BRB.timeFor` (docs/sdk.md).

Built (docs/decisions.md "Homeroom: the notebook"): the green corner button bottom right on every page a student with
a notebook sees (where teachers have the Oomba chat), opening a panel (laptops) or a sheet (phones, tablets in
portrait); on the desk it is the dock's Notebook. Own tabs and a tab per class, search across every note, bold, a list,
a checklist, four highlighters, saved by itself. Notes under a handout card on the desk open its page in the class's
tab, named after it. "Your teacher can read your notebook" at the top. The class's teachers read it from a desk's menu
(Notebook), read only; aides and subs never. No AI reads it. Each tab keeps its kind so parents can later see the class
tabs only.

Built (docs/decisions.md "Homeroom: reading from the desk"): the dock's **Library** opens the Story Library in a layer on
the desk (the class's grade first, every grade and a search a tap away); a book reads in the library's own reader, Read to
me and all, and while class is live the teacher's board says "Reading <book>" with the page. The left panel's
**Reading** hands out Reading like any handout: **Read any book** (their own choice) or **Choose a book** (a book
picker, the class's grade first), with instructions, order, a due day, to a desk, a group, a team or Whole class, graded
by Completion (the whole routine) by default, or Score (the quiz's first try). On the desk its card shows the cover and
the steps, **Read, Quiz, 3 notes**: the book in the reader; the book's own questions (or, for a book without them, a
short quiz the AI wrote once from the book's words, checked and cached; simple questions about the book when the AI is
off), a wrong answer opening its page; then three short notes (Something that happened, A new word, What I think) saved
as one page of their notebook in the class's tab, titled with the book. Bigger text and Read aloud reach the reader, the
quiz and the notes. The teacher sees the cover and the step on each desk (Reading p. 12, Quiz, Notes, Done), each
student's step and quiz in Today (alphabetical), a Reading column in the Classroom view (completion and the quiz), the
results page, and the 3 notes from the desk's sheet (the notebook, read only). Results go to Progress and Google
Classroom by the grade chosen.

Built (docs/decisions.md "Homeroom: K-2 mode, absent and at home"): **K-2 mode** turns on by itself for a K, 1 or 2
class (the ⋯ menu's K-2 desks: by grade, on or off; one student's own from the desk's menu): bigger targets and text, a
picture with every label, Next up as one big card with Read to me and a big Start and the rest as picture tiles, Read to
me on by default, Raise hand as three big pictures, a notebook that draws or types (Bold and a highlighter, no search or
tabs to manage) and reading notes a six year old can do (a drawing, how they liked it, a word). **Absent and at home**:
the teacher (desk's menu, Today) or a sub marks a student Absent or At home for today; an Absent desk is dimmed, left out
of Needs a look, Today's counts and Finish class's counts ("2 absent" on its own); handouts given while they were absent
wait under "Missed while you were out" with the teacher's words and are never late by themselves in Progress; at home the
desk is the same with an "At home" chip on the board instead of a cursor, no hand or hall pass, and Ask my teacher sends a
question the teacher sees in Hands, marked At home. Marks are per class per day; there is no attendance report.

Built (docs/decisions.md "Homeroom: the parents' view"): a grown-up whose family account is linked to the student's own
account (the existing family linking: the child's code, typed on /family/link, the child's Yes) opens **Class work** from
the child's row on /family (`/family/class/<token>`, phones first): for each class with Homeroom, read only, the child's
handouts (title, the teacher's instructions, given and due dates, done or not yet, the grade as the teacher chose to show
it: Score's % right, Completion or Practice), the teacher's comments and stickers, "To catch up on" for handouts marked
Missed while away, the books read with the reading routine and the quiz, and the child's notebook pages in that class's
tab (K-2 drawings included). Never own tabs, other students, ranks, live class, hands, the hall pass, supports or
attendance. The ⋯ menu's **Parents' view** turns it off or on per class (on by default). The notebook's top line, and the
reading notes, add "Your grown-up can see the notes in your class tabs" when a grown-up is linked. Accounts a school made
can't be linked to a family yet, so their grown-ups have no view.

## Onboarding, Needs a look and Oomba follow-ups (step 5b)

Built (docs/decisions.md "Homeroom: onboarding, Needs a look, Oomba follow-ups"):
- **A first-run guide** the first time a teacher opens Homeroom (once per teacher, kept on the server): six calm coach
  marks beside the real things (Arrange seats, the teacher's area and its pen, handing out a lesson by tap or drag, My
  desk, Oomba for today's plan, Everyone to Homeroom and the quick sign-in code), Next and Skip, never a layer over the
  board, on phones, tablets and laptops; the ⋯ menu's **Show me around** opens it again. A class with no students starts
  with "No students yet": the join code and Add students (Google Classroom from the Students tab).
- **The student's intro card** the first time a student opens a desk: where things are, Raise hand, the notebook, "Your
  teacher can see your screen in Homeroom"; in K-2 big pictures and Read to me on every line.
- **Needs a look**: a calm list in Today at a glance and a small count chip in the top bar (never on the projector, never
  to students or parents, never ranked) of students who may need help now or this week, with the reason in plain words
  and a suggested action: stuck on the same handout (3 minutes, longer with extra time), a hand up 4 minutes, a question
  from home waiting an hour, several tries on a lesson plan still under half right, a reading quiz under 60 % on the
  first try, 3 or more handouts after due (never Missed while away). Absent students are never on it. Seen and Snooze
  today are the teacher's; aides read it; subs see only stuck and hands, with first names. Oomba may sum it up, seeing
  "Student A" and never a name; the page puts the names back.
- **Oomba follow-ups**: after Finish class a short card in the chat (what went well as counts, who might need a look
  tomorrow, names shown by the page), with ideas the teacher confirms one at a time: a review lesson for a group, re-teach
  a part, move unfinished work (each a part in the next school day's plan) and a note to the class (on the teacher's area
  once sent). Nothing happens by itself; Oomba never talks to students.

## Quick sign-in (step 1c)

Students on shared devices go to `/hr` (or scan the QR code), type the class code, tap their name, then type their
password or tap their three pictures (picture passwords: grade K to 2 by default, or any school-account student the
teacher sets), or use Google. The code works only while the teacher has sign-in open (90 minutes, opened by starting
class, closed by End class). Those sign-ins end with class; the desk has "Not you? Switch". Details: docs/decisions.md
"Homeroom, step 1c".

## Aides and sub links (step 3c)

- **Aides**: the ⋯ menu's Aides: an invite link (sent by the teacher's own email) or a teacher of the same school. An
  aide opens that class's Homeroom (an Aide chip in the top bar): desks and live status, hands and the hall pass, a look
  at a student's desk, comments and stickers, students' supports (to read). Never grades or grading, removing handouts,
  groups or seating, planning with Oomba, billing, End class or notebooks. No Teacher plan needed. Removed anytime.
- Aides see Absent and At home on the desks; subs take attendance (Absent, At home), logged for the teacher.
- **Sub link for today**: from the ⋯ menu, a link for today or tomorrow, until the end of the school day or a set time
  (24 hours at most), with an optional PIN and a note for the sub. No account. The sub sees the board, desks with first
  names, the plan pill (Start, Next, +5 min), hands and the hall pass, the projector view, the note, and "has supports"
  with what to act on. Never grades, progress, notebooks, Google Classroom, handing out, changing the class, the AI or
  other classes. Revoke anytime; every sub action is logged and the teacher sees "While you were out" next time.

## Rules that do not change

No rankings of students. Oomba never talks to students. Oomba sees topics, grades, group names and results with names
removed, never names. No photos of children. Calm UI. US spelling. No em dashes.

## Build order

1. Foundations: gate and flag, the board on the live room engine, desks and seating, quick sign-in, projector view,
   laptop and tablet layouts, Pause screens.
2. Handouts and lesson plans: lesson handouts with instructions, lesson plans and the lesson plan builder, groups, teams,
   order, grading choice, results into Progress and Google Classroom, comments and stickers.
3. Live class: live desks and cursors, hands and hall pass, supports, the day plan through the chat, aides and sub links.
4. Student side: notebook, reading from the desk, K-2 mode, absent and at-home students, parents' view (all built).
5. Beyond the day: week plans, due dates, copying plans (5a, built), onboarding, Needs a look and Oomba follow-ups (5b,
   built).

Every step of the build order is built. Before launch: the privacy policy update (Needs a look, the follow-ups, watching
desks and the parents' view) and its lawyer review, and a 35-student load test (the board's pulse now also carries
Needs a look).
