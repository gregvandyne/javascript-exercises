# Homeroom

Approved by the owner on 2026-11-25. Homeroom is the place a teacher runs a class from: one big board, built on the
Manipulatives live room, with a desk for every student placed where they really sit, a teacher's area across the top,
and every Oomba game, tool and lesson on the teacher's desk as a handout. Planning runs through the Oomba chat.

Clickable mockups (owner-approved look and behavior): the teacher's Homeroom, the student desk on a tablet.

## Who gets it

- Teacher plan only. Other teachers see a short preview on their class page that links to /plans (prices appear only
  on /plans). Students never see plans or prices. If a plan ends, desks stay readable; live class and new handouts
  turn off.
- Behind the `HOMEROOM` flag until launch (`HOMEROOM_USERS` lets named accounts in, like `MANIPULATIVES_USERS`).

## A class's tabs

For Teacher plan teachers a class has three tabs:

- **Homeroom**: running today (the board, desks, handouts, live class, today at a glance).
- **Classroom**: the calm, simple overview over weeks. One column per handout (lesson, game, quiz, reading, own game)
  with how it is graded; one row per student, alphabetical, never ranked; trends; summary numbers; the Google Classroom
  status line. Everything that exists today stays one tap away and unchanged: the full gradebook and CSV, student
  reports, standards, rubrics, and every Google Classroom feature (link, roster sync, posting, draft or assigned grades,
  automatic sync, the log).
- **Dashboard**: unchanged.

Teachers without the Teacher plan keep today's class page.

## The board (teacher)

- Same feel as the Manipulatives live room: dotted board you pan and zoom, floating panels, chunky buttons, zoom pill
  bottom left, minimap bottom right, the Oomba chat button bottom right.
- Teacher's area (yellow band, "Teacher's area · everyone can see this") across the top: slides (Google Slides links,
  PDFs and PowerPoint files), sticky notes, text, pen, shapes.
- A desk per student, name above it, border in the student's group color. **Arrange seats** to match the real room:
  Rows, Tables of 4, U-shape, Circle, then drag any desk; each class keeps its own seating. **Team desks**: students who
  share one desk.
- Groups the teacher names (for example Stretch, On track, Building).
- Left panel (teacher's desk): Hand out to (Whole class, groups), My lessons (+ Build a lesson), Games I built, Oomba
  games and tools, Reading, Class flow (brain break, note, timer, used right away), Board tools.
- Top bar: class switcher, tabs, Live dot, the plan pill (Today / Now with countdown / Time's up), +5 min and Next
  during a plan, Today (today at a glance), Hands, the yellow Everyone to Homeroom / Bring everyone to me, and the ⋯
  menu (Arrange seats, join code, projector view, End class).
- **Pause screens** for everyone; for one student: hide cursor, lock desk, remove a sticky they added.
- **Projector view**: teacher's area, Now/Next timer, slides, brain breaks. Never names, hands, Needs a look or progress.

## Handouts and lessons

- A **game** handout is free play with optional instructions. A **lesson** is exact: built in Homeroom for any game or
  tool (teachers' own games included) with that tool's own settings, a worksheet preview, and a version per group.
- Each handout: In order or Any order on the desk; graded by Score (% right or rubric points), Completion (100% when
  finished) or Not graded. Defaults: lessons by score, free play by completion. Google Classroom gets the chosen grade.
- Lesson builder order: Arithmetic Lab, Algebra Builder, Crossword; then classroom quiz/memory/word and own games; then
  Atlas Quest, Sudoku, Castle Clash puzzles; then Manipulatives and Figures; then Reading.

## The day's plan (through the Oomba chat only)

Oomba drafts parts in order (slides, work time with per-group versions, brain break, exit check); Use this plan puts
handouts on desks. Changes are asked for in the chat. During class the pill shows Now, countdown and Next; it turns
yellow when time is up and never moves on by itself. Finish class shows a short summary; unfinished handouts stay on
desks as homework; plans can be saved, copied to other sections, and planned for the week.

## The student desk

Their square from the live room made into a desk: handouts in order (Next up / Later, or any order), the book they're
reading, a doodle and working-out pad, a small window on the teacher's area, Raise hand (question, help, bathroom via
the hall pass queue), and a dock (My desk, Teacher's area, Library, See the room). Students can zoom out to see every
desk (classmates' notes show without their words) and change only their own or their team's. The **notebook** opens
from the green corner button on every Oomba page: running notes across sessions, tabs, search, highlight. The teacher
can read the whole notebook (students are told); parents see handout notes, not personal tabs. Layouts for tablet,
laptop (Chromebook 1366x768) and phone. K-2 mode by grade. Supports per student (extra time, read aloud, simpler
wording, bigger text) apply to every handout.

## Quick sign-in (step 1c)

Students on shared devices go to `/hr` (or scan the QR code), type the class code, tap their name, then type their
password or tap their three pictures (picture passwords: grade K to 2 by default, or any school-account student the
teacher sets), or use Google. The code works only while the teacher has sign-in open (90 minutes, opened by starting
class, closed by End class). Those sign-ins end with class; the desk has "Not you? Switch". Details: docs/decisions.md
"Homeroom, step 1c".

## Rules that do not change

No rankings of students. Oomba never talks to students. Oomba sees topics, grades, group names and results with names
removed, never names. No photos of children. Calm UI. US spelling. No em dashes.

## Build order

1. Foundations: gate and flag, the board on the live room engine, desks and seating, quick sign-in, projector view,
   laptop and tablet layouts, Pause screens.
2. Handouts and lessons: game handouts with instructions, lessons and the lesson builder, groups, teams, order, grading
   choice, results into Progress and Google Classroom, comments and stickers.
3. Live class: live desks and cursors, hands and hall pass, supports, the day plan through the chat, aides and sub links.
4. Student side: notebook, reading from the desk, K-2 mode, absent and at-home students, parents' view.
5. Beyond the day: week plans, due dates, copying plans, onboarding, Needs a look and Oomba follow-ups.
Before launch: privacy policy update and lawyer review, and a 35-student load test.
