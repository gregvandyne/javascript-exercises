# The book maker (Story Library)

Teachers make their own books in the Reading section: upload a story they wrote or have Oomba write one, as a normal
illustrated book or a choose-your-own-adventure (CYOA), shape it in a book editor and in a chat with Oomba, then share
it with a class. Students read it in the library reader. Owner's decision and the reasons: docs/decisions.md "Story
Library: the book maker".

| Where | What |
|---|---|
| `server/routes/storybook.js` | Pages and APIs (all listed at the top of the file) |
| `server/services/storybook.js` | Access, the daily cap, setup scrubbing and screening, books, sharing, pictures, reading places, the AI prompt and answer checks, the chat surface, apply and undo, delete hooks |
| `server/services/storybook-illustrator.js` | The illustrator interface and the art-pack illustrator (catalog from `public/vendor/art2d`) |
| `server/services/storybook-mock.js` | The AI stand-in when no `ANTHROPIC_API_KEY` is set |
| `public/js/storybook-core.js` | The book's shape and rules, shared by server and browser: `shapeBook`, `warningsOf`, `problemsOf`, `repairBook`, `numbering`, `mapLayout` |
| `public/js/storybook-art.js` | Draws a page's picture as SVG (server and editor) |
| `public/js/storybook-setup.js`, `storybook-edit.js`, `storybook-read.js`, `storybook-pic.js` | The setup steps, the book editor, the reader (and the print button), picture upload |
| `public/css/storybook.css` | All of it, tokens only, 375 px and up |
| Migration `0110_storybooks` | `made_books`, `made_book_pics`, `made_book_classes`, `made_book_reads`, `made_book_ai_days` |
| `tests/unit/storybook.test.js` | Access, rules, AI checks and retry, screening, the cap, reader, print, pictures, delete lists |

## Who

- **Make, edit, chat, print, share**: school staff and the platform admin (`canMake`). A guest, a banned account, a
  family grown-up, a kid or a student gets the normal 404 from every page and API; signed out, the usual sign-in
  (pages) or 401 (APIs). Checked on the server in one middleware (`teacher` in the routes), not by hiding links.
- **Read**: the book's owner (Preview) and the students and teachers of a class it is shared with (`canRead`). Students
  see shared books on `/library` under "From your teacher". The AI never talks to students: their pages have no chat.
- A teacher only sees their own books. Another teacher's book id answers 404.

## The flow (the Builder's step pattern)

1. **Start**: two big cards, "Upload your own book" or "Have AI make one".
2. **Choices**: the kind (upload: "Keep it as a normal book" or "Turn it into a choose-your-own-adventure"; AI:
   "Illustrated book" or "Choose-your-own-adventure"), then chips: grade (K to 6-8), length (short, medium, long),
   endings (2 to 4, CYOA only), reading level (early, growing, confident), and a theme (AI only, optional).
3. **Your words**: the story (upload: required), an "about" box, a document (.txt, .md, .docx, .pdf: read on the server
   with the Builder's lesson reader, never kept, its text put into the box so the teacher sees it) and pictures (put on
   the first pages in order; never sent to the AI). The note: no students' names or work.
4. **Check**: `POST /api/library/make/check` returns exactly what will be sent after the scrubber (students' names,
   emails, phone numbers, links taken out; the count is shown) and the screening's verdict, each part with Edit. Make my
   book is off until it passes and a turn is left.
5. **The builder conversation**: `POST /api/library/make/start` checks everything again, spends a turn, makes the book
   and sends Oomba's first message as a job on the shared chat engine (`services/oomba-chat.js`, surface `storybook`,
   one live turn per book). The editor opens with the progress card; each later message ("make page 3 scarier", "add a
   third ending", "simpler words for grade 2") is another job that returns an updated book, with Undo.

The choices live in the browser tab (sessionStorage) until Start; only pictures are stored earlier (checked, kept a day
until a book claims them).

## The AI

- One call per attempt through `services/ai-call.js` (`callAi`: one time budget, no SDK retries), `config.builderModel`
  (no model id here), effort low, plain JSON read with `jsonIn`. The AI budget: `anthropic('free')` is null while it
  rests (the turn fails calmly as `resting`), and every call's usage is recorded.
- The model answers `{ reply, book }` (a first draft or a rewrite) or `{ reply, edits: { title?, cast?, start?, pages,
  remove, after } }` (only the pages that change). A question back with no book changes nothing.
- **Checks** (`writeBook`): `shapeBook` (limits, ids, only known art), `problemsOf` (CYOA: a start, every page
  reachable, every non-ending page with choices, every choice with words and a page to lead to, at least one ending;
  every page with words, a picture and alt text), the Story Builder's word rules (`story-script.js textProblem`) on
  every word, no name of the teacher's students, and the model classifier (`builder/screen.js modelClassify`, as
  story-writer does). Problems go back to the model once, listed. Then `repairBook` fixes what is structural (drops
  choices to nowhere and unreachable pages, makes a dead end an ending, gives a book with no ending one). Words that
  still fail end the turn as `unsafe`: nothing is saved, a teacher never sees unchecked words.
- **Apply** (`applyBook`, in the engine's transaction): a three-way merge per page against the book Oomba saw, so a
  page the teacher edited while Oomba was thinking stays theirs (counted as "kept"). The chat card lists new, changed and
  removed pages. **Undo** (`undoChange`) puts back only the pages still as Oomba left them.
- What the AI gets: the setup (kind, grade, length, endings, level, theme), the teacher's words (scrubbed), the book
  JSON (page ids, words, choices, picture specs; a page with the teacher's own picture is marked `ownPicture`, the
  picture itself never), and the newest 8 chat turns. Never classes, rosters, students' names, work or reading data.

## The daily cap

Every Oomba turn (a first draft, each chat message, a Try again) costs one turn for the UTC day:
`STORYBOOK_FREE_PER_DAY` (10) for teachers without the Teacher plan, `STORYBOOK_PLAN_PER_DAY` (60) for Teacher plan
holders, testers and the platform admin. The count is a database row (`made_book_ai_days`), spent with one conditional
upsert before the message is stored and before any `await` (`take`), so a restart, a second tab or many requests at
once can't get more; it is given back only when the message could not be stored at all. A message refused by the word
or name checks, or a setup refused by the screening, costs nothing. At the cap the editor still works by hand. Picture
checks have their own count (`<day>:pic`, 30 a day) in the same table.

## Illustrations

There is no image-generation service and adding a paid one is the owner's decision, so no image API is called.

- **The illustrator interface** (`server/services/storybook-illustrator.js`): `{ id, prompt(), art(), render(spec,
  cast, o) -> { kind: 'svg', svg } | { kind: 'image', src } }`. `prompt()` tells the AI what it can ask for, `art()`
  gives the ids `shapeBook` keeps, `render()` makes one page's picture. `illustrator()` returns the one in use.
- **Today: `packs`**, drawn from the 2D art packs the games use (`public/vendor/art2d`, catalogued from each locked
  `pack.json`): per page the AI picks a world (12, from Wild Woods to Space Base), a mood (bright, warm, sunset, night,
  gloomy, magic), up to 3 characters of the book's cast with a spot (left, middle, right) and up to 3 props of that
  world. The cast ties each name to one hero or animal sprite, so a character looks the same on every page.
  `public/js/storybook-art.js` composes the SVG: the world's sky gradient, a slice of its far and near scenery (the same
  slice for the same page), the ground strip, props from the world's atlas, each character's first idle frame standing
  on the ground with a soft shadow (sea animals swim above it), facing the middle, and a light mood wash. The same code
  runs on the server (reader, print) and in the editor (instant redraw as the teacher changes a picture).
- **The teacher's own picture** for any page (Your picture): a JPEG made in the browser, cleaned (no metadata) and
  checked by the companion's picture check (no person at all, nothing private or unsafe); a refused picture is never
  kept. "No picture" removes it; "Use a drawn picture" goes back to the drawn one. Alt text on every picture.
- **Adding an image model later**: write a second illustrator whose `render()` returns `{ kind: 'image', src }` from a
  stored file (made once per page spec and kept with the book), pick it with `STORYBOOK_ILLUSTRATOR`, and keep the
  spec in the book so the art-pack drawing still works as a fallback. Its cost, data flow (a prompt to another
  provider) and the privacy text are the owner's decisions first.

## The editor

Title, warnings (never blocking; each one a button that jumps to its page: page nobody reaches, page with no choices
that is not an ending, choice with no words, choice that leads nowhere, no reachable ending, no start, no words,
picture without alt text), the story map (CYOA: pages by depth from the start with arrows; endings in Spark, the start
outlined, pages nobody reaches dashed; it scrolls inside itself on a phone), the page list with thumbnails, and one
page: picture (place, mood, who is in it and where; Your picture; No picture), alt text, title, words, and for a CYOA
page Ending, Make this the start page, and up to 4 choices each with "Leads to" (or "A new page"). Linear books move
pages earlier or later. Characters: names and looks. Every edit saves a moment later with the version it was made on;
an older version is refused (409) and the page reloads Oomba's newer one. The teacher's words pass the same word rules
and names check. Preview opens the reader "as students will see it"; Print opens the print copy; Share picks classes.

## Reading

`/library/made/:id/read`, inside the library reader's frame: the picture on top, the page title, the words, then the
choices as big buttons (CYOA) or Back and Next. Back always goes to the page the reader came from (the trail), an
ending shows "The End" with Start over. Every button is a small GET form (`?p=` page, `?t=` trail), so it works without
JavaScript; `storybook-read.js` turns pages in place. Signed in, the place is remembered (`made_book_reads`: page,
trail, endings found, finished) and the book opens there next time, like other library books. It does not use
`story_reads` (that table is keyed by the manifest's books and holds question marks); a teacher's books have no
questions and are not assigned as gradebook lessons in this version.

## Print or save as PDF

`/library/made/:id/print` (teachers who may read it): a title page (the first page's picture, title, kind, for a CYOA a
"You choose what happens" line), then one sheet per page, numbered in the order a reader meets them, each choice as
"Go left: turn to page 2", "The End" on endings. The browser's print (`@media print`: one page per sheet, no site chrome)
makes the paper copy or the PDF.

## Data and deleting

- `made_books` (owner, kind, source, setup as scrubbed, book JSON, rev), `made_book_pics` (cleaned JPEG bytes),
  `made_book_classes` (shares), `made_book_reads` (reading places), `made_book_ai_days` (the cap). Chats are the
  engine's `oomba_chats` / `oomba_turns` (surface `storybook`, key: the book id).
- Deleting a book removes its pictures, shares, readers' places and chat. A deleted class takes its shares
  (`onClassLeave`); `made_book_classes` is in the school delete's `BY_CLASS` list. Deleting an account removes the
  teacher's books (and everything under them) and the account's own reading places (`storybook.forgetUser` from
  `account-delete.js`). A school account merged into a student's own account moves its reading places.

## Without an API key

`storybook-mock.js` answers like the model would (the same JSON through the same checks): a themed illustrated book or
a branching adventure with the endings asked for, the teacher's own story split into pages, and for changes "add an
ending", "page N" and "simpler words". The end-to-end flow and the screenshots run on it.

## Privacy

The book maker reuses the existing AI processor (Anthropic) and the existing kinds of data sent by teacher tools: a
teacher's own words and documents (scrubbed), and a teacher's own pictures for the companion's picture check. Nothing a
student does is sent. The privacy page was not changed; the owner may want a line naming the book maker next to the
other teacher AI tools (docs/decisions.md lists it as an open point).
