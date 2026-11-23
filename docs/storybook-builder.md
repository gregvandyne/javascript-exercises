# The book maker (Story Library)

Teachers make their own books in the Reading section: upload a story they wrote or have Oomba write one, as a picture
book or a choose-your-own-adventure (CYOA), illustrated on every page and every path either way, shape it in a book
editor and in a chat with Oomba, then share it with a class. With the Oomba chat (Teacher plan), the whole workflow is
in that one chat ("In the Oomba chat" below). Students read it in the library reader. Owner's decision and the reasons: docs/decisions.md "Story
Library: the book maker".

| Where | What |
|---|---|
| `server/routes/storybook.js` | Pages and APIs (all listed at the top of the file) |
| `server/services/storybook.js` | Access, the daily cap, setup scrubbing and screening, books, sharing, pictures, reading places, the AI prompt and answer checks, the chat surface, apply and undo, delete hooks |
| `server/services/storybook-illustrator.js` | The illustrator interface, the art-pack illustrator (catalog from `public/vendor/art2d`) and the `gemini` one (the same, plus scenes and looks for the picture model) |
| `server/services/storybook-gemini.js` | The picture model: the house style, the per-book style seed, the character sheet and page prompts, the Gemini API request and answer |
| `server/services/storybook-draw.js` | The picture queue and drawer: what to draw, the daily picture count, the picture check, WebP, Redraw, the editor's state |
| `tests/support/fake-gemini.js` | Google's stand-in for tests and screenshots (paints a placeholder PNG scene) |
| `server/services/storybook-mock.js` | The AI stand-in when no `ANTHROPIC_API_KEY` is set |
| `server/services/companion-book.js` | The book maker in the Oomba chat: the draft and its card, the tools (`makeBook`, `findMyBooks`, `changeBook`, `redrawPicture`), the check and Start through this file's functions |
| `public/js/storybook-core.js` | The book's shape and rules, shared by server and browser: `shapeBook`, `warningsOf`, `problemsOf`, `repairBook`, `numbering`, `mapLayout` |
| `public/js/storybook-art.js` | Draws a page's picture as SVG (server and editor) |
| `public/js/storybook-setup.js`, `storybook-edit.js`, `storybook-read.js`, `storybook-pic.js` | The setup steps, the book editor, the reader (and the print button), picture upload |
| `public/css/storybook.css` | All of it, tokens only, 375 px and up |
| Migration `0110_storybooks` | `made_books`, `made_book_pics`, `made_book_classes`, `made_book_reads`, `made_book_ai_days` |
| Migration `0111_storybook_draws` | `made_book_draws` (the picture queue); `made_book_pics.kind` and `.mime` |
| `tests/unit/storybook.test.js` | Access, rules, AI checks and retry, screening, the cap, reader, print, pictures, delete lists |
| `tests/unit/storybook-pictures.test.js` | The picture model: request shape, blocks and refusals, the picture count, no key, Redraw, access; an adventure painted on every page and ending (reader and print); the Pictures choice |
| `tests/unit/companion-book.test.js`, `companion-book-browser.test.js` | The chat: cards skip what the request answered, words and files into the book, the check and screening, Start and the cap, teachers only, changes from any page with Undo, books made in the past |

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
   "Picture book" or "Choose-your-own-adventure"; each says every page, and every path, is illustrated), then chips:
   grade (K to 6-8), length (short, medium, long), endings (2 to 4, CYOA only), reading level (early, growing,
   confident), a theme (AI only, optional) and **Pictures** (both kinds, both ways in): "Oomba paints them" (the
   default), "I'll add my own" or "No pictures".
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

## In the Oomba chat

The owner: "Make sure you can do this same process from the oomba chat." Then: "Clicking the make a book button should
just open up the chat and you should do the whole workflow there. The back and forth between the chat and the page is
confusing." And: "Users should also be able to ask the oomba chat to make edits to a book they've made currently but
also in the past". For a teacher with the companion (`companionFor`: the Teacher plan rule), the book maker IS the
companion chat (`services/companion-book.js`, wired in `services/companion.js`); a teacher without it keeps the page
steps above and the editor's own chat.

- **Make a book** (`/library`, `/library/make?new=1`, which redirects to `/library?make=1`) opens the chat with the first
  card, without the AI (`POST /api/companion/book/new`). A request in words ("make a choose your own adventure about the
  water cycle for grade 3", "turn this story into a choose-your-own-adventure" with the story pasted or a file attached,
  "make a book") makes the AI call `makeBook` with only what the teacher said. `/library/make` lists their books.
- **One card, the page's steps.** A draft lives on one Oomba turn (`note.book`), the open one named in the chat's
  `opts.book`. It asks only what is missing, in the page's order: Upload your own book or Have AI make one, the kind,
  grade, length, endings (CYOA), reading level, theme (AI, and only when no topic was given), Pictures. A tap answers
  (`act: bookPick`, no AI); the labels are the page's own strings, filled in by the server in the teacher's language.
- **Your words.** While the card waits for them, what the teacher types goes into the book (`POST /api/companion/chat`
  with `book`: the story for Upload your own book, the notes otherwise), never to the chat's AI ("Adding to your book"
  above the box, with ✕ to talk to Oomba instead). Attached documents (the companion's upload: the Builder's lesson
  reader, scrubbed, screened) add their text after the typed words, as the page puts a file's text in its box; attached
  pictures (the companion's no-people check) go on the first pages. Limits are the page's (`SETUP_LIMITS`).
- **Check** (no button: the owner, 23 Nov 2026, "Let's ditch the check what Oomba sees button and just automatically go
  to the check"). The first words or file the teacher sends move the card straight on to the check, which checks itself
  once (`act: bookCheck` from the page); a book made by AI with nothing to add has "Nothing to add" instead. While the
  check card is the last message, more words or files still go into the book and it checks again; Edit brings back Your
  words. The check: `storybook.cleanSetup`, `setupProblems`,
  `screenSetup`, exactly as `POST /api/library/make/check`. The card lists what will be sent (the start, the kind, the
  choices, the words after the scrubber, the file names, the pictures), each with Edit, the names-taken-out count, any
  problem, the reminder never to include students' names or work, and Make my book (off until it passes and a turn is
  left). Stop closes the draft; nothing is kept.
- **Make my book** (`act: bookStart`): the pictures through `storybook.addPic` (the page's check and limits), then
  `storybook.createBook` (the same checks again, one of today's turns, the row). The chat says the book is on its way with
  **Open the book**, and the first draft is a turn of the same chat on the book's page (`storybook.writeBook` and
  `applyBook`: the AI budget, the checks, the picture queue), with Undo.
- **One chat.** The book editor no longer has its own panel for these teachers: it is the companion's page `book`
  (`views/layout.js companionPage`, `public/js/oomba-bus.js`), the panel open beside the book (a sheet on a phone).
  Changes there and from any other page use `changeBook` (`writeBook`, `applyBook`, Undo through `undoChange`, one of
  today's turns as on the page) and `redrawPicture` (`storybook-draw.js redraw`, the picture count). A book made in the
  past is found among the teacher's own books only (`findMyBooks`, `storybook.myBooks`); several that fit become a
  choice card of their titles, kinds and dates (a tap makes the change in that book); none says so with Make a book.
  The editor still works by hand without the chat.
- **Teachers only**: the tools are offered only to `storybook.canMake` accounts and every tool, tap and route checks it
  again on the server. The AI never talks to students; students' names and work never go into a book.

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
checks have their own count (`<day>:pic`, 30 a day) in the same table, and so do pictures the picture model draws
(`<day>:draw`, below).

## Illustrations

Two ways a page gets its picture: painted by the picture model (Google's Gemini image model, "Pictures" below) when it
is set up, otherwise drawn from the art packs. The art-pack drawing is always there underneath, so a page never goes
without a picture.

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
- **The picture model** is a second illustrator, `gemini` (below): it is chosen while `GEMINI_API_KEY` is set (unless
  `STORYBOOK_ILLUSTRATOR=packs`), and keeps the art-pack spec in the book as the fallback.

## Pictures (the picture model)

The owner's decision (docs/decisions.md "Book pictures: Google's Gemini image model"): the book maker is deployed with
a real image generator with a kids' book drawing skill, Google's. The skill is ours (`storybook-gemini.js`):

- **One house style** (`HOUSE_STYLE`): a warm, hand-painted picture-book illustration (soft gouache and watercolor,
  paper texture, gentle rounded shapes, gentle colors, friendly faces, age-appropriate), and the rules every picture
  keeps: no words, letters or signs in the picture, no logos, no real people or celebrities, no characters from films,
  books or games, nothing scary or violent, no weapons. No artist or book series is ever named. **A per-book style
  seed** (`styleOf(book id)`: a palette, a paper and a light, and a style code) is in every prompt of one book, so its
  pictures match.
- **What Oomba writes for it**: with the `gemini` illustrator, the book AI also gives every `pic` a `scene` (one or two
  sentences: where, who, what they do, the feeling; never words to write in the picture) and every cast member a `look`
  (one sentence: kind, colors, clothes, one detail). Both are book words: they pass the same word rules, the names check
  and the classifier as every other word (`textsOf`), and the teacher can change a character's look in the editor.
- **Character sheets first**: each cast member gets one reference picture (1:1, neutral pose, plain background) from
  their look. A page is only drawn once its book's sheets are done, and it sends the sheets of the characters in it as
  reference pictures (inline data after a "Reference picture N: Name" label), so a character looks the same on every
  page. A teacher can redraw a sheet; the pages showing that character then say they changed since, and can be redrawn.
- **Page pictures** (16:9, like the art-pack drawings): the scene, the setting (the world's name), the mood, who is in it
  and where (left, middle, right), a composition line (characters clear, a calm uncluttered area kept free), and the
  teacher's Redraw note when there is one.
- **The request** (`requestBody`, `generate`): `POST https://generativelanguage.googleapis.com/v1beta/models/<model>:generateContent`,
  the key in the `x-goog-api-key` header (never in the address or a log), body `{ contents: [{ role: 'user', parts: [{ text },
  { text: label }, { inlineData: { mimeType, data } }...] }], generationConfig: { responseModalities: ['IMAGE'],
  imageConfig: { aspectRatio, imageSize: '1K' } }, safetySettings: [4 categories at BLOCK_LOW_AND_ABOVE] }`. The
  picture comes back as `candidates[0].content.parts[].inlineData` (base64). A `promptFeedback.blockReason`, a safety
  finish reason (`SAFETY`, `IMAGE_SAFETY`, `PROHIBITED_CONTENT`...) or a 400 for safety counts as **blocked**. The model
  id is `STORYBOOK_IMAGE_MODEL` (default `gemini-3.1-flash-image`, Gemini 3.1 Flash Image, "Nano Banana 2").
- **The queue** (`storybook-draw.js`, table `made_book_draws`): one row per sheet (`cast:<name>`) and page
  (`page:<id>`). Oomba's turns queue what is new or changed (a page whose scene, setting, mood, characters, their looks
  or their sheets changed; a fallback for no key, resting, the limit or an error is tried again); the teacher's words
  alone never redraw a picture. Drawn in this process, `STORYBOOK_DRAW_AT_ONCE` (2) at a time, sheets first; a picture
  that was drawing when the server stopped goes back in the queue. A network failure is tried once more.
- **Kept like the teacher's uploads**: in `made_book_pics` (`kind` `page` or `sheet`, `mime` `image/webp`), converted
  with ffmpeg to WebP at most 1600 px wide (a 1K picture is 1024 px wide: the reader and the print copy), served to
  whoever may read the book. The reader and the print copy show a kept picture before the art-pack drawing; the
  teacher's own picture wins over both. Deleted with the book and the account.
- **Safety**: only the prompt (the house style, the seed, the scene and look words, which passed the word rules and are
  scrubbed of the teacher's students' names once more on the way out) and the book's own sheets go to Google. Never a
  student's name or work, the teacher's name or a class. Every picture that comes back passes **the same picture check
  as the teacher's uploads** (`companion.js screenImage`, as WebP) before it is kept or shown. A refused or blocked
  picture is dropped; the page keeps its earlier picture or the art-pack drawing, and says why.
- **The daily picture count**: every picture (character sheets and Redraws included) costs one for the UTC day,
  `STORYBOOK_PICTURES_PLAN_PER_DAY` (40) for Teacher plan holders, testers and the admin, `STORYBOOK_PICTURES_FREE_PER_DAY`
  (10) for other teachers. It is a `made_book_ai_days` row (`<day>:draw`), taken with one conditional upsert at the
  moment of drawing, so parallel requests, tabs or restarts can't get more; it is given back when nothing came back
  (a network failure). Redraw at the limit is refused at once.
- **The AI budget**: every call is recorded (`ai-budget.js recordImage`, `image:<model>` on the admin stats page):
  about **$0.067 a picture** for Gemini 3.1 Flash Image at 1K (1,120 output tokens at $60 per million, Google's Gemini
  API price list; third-party price lists round it to $0.07) plus the input tokens (about $0.50 per million). A
  10-page book with 2 characters is 12 pictures, about $0.80. While the free budget rests, nothing is drawn.
- **The Pictures choice**: only "Oomba paints them" queues or spends a picture (`queueBook`, `redraw`). "I'll add my own"
  keeps the art-pack drawing in each place until the teacher adds their own (Redraw is off); "No pictures" takes every
  page's picture off (a page without one is not a problem sent back to the model). The editor says which in its line.
- **Every kind is illustrated**: an adventure's branch pages and endings are queued and painted like any other page, and
  the reader, the print copy and the story map (a picture in each page's box) show them.
- **When it is not drawn**: no `GEMINI_API_KEY`, the budget resting, or the day's pictures used: the art-pack drawing,
  and the editor says why in one calm line under the warnings.
- **The editor**: the line under the warnings ("Drawing the pictures: 3 of 12 ready", the pictures left today, or why
  the art packs are used), an hourglass on each page still waiting in the page list, under the picture its state (waiting,
  drawing, why it fell back, changed since) and **Redraw** with an optional note ("make it a sunny morning": the word
  rules and names check, then scrubbed). The editor asks how drawing is going every few seconds while anything is
  queued. Characters: each one's look and reference picture, with Redraw. The teacher's own upload works as before.

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

The book's words go to the existing AI processor (Anthropic), scrubbed. The pictures go to a second processor, Google
(the Gemini API), with only the picture prompts and the book's own character sheets (above). The privacy page has a
section for the book maker ("The book maker", `info.privacy.storybook`) naming both, and docs/legal-review.md has the
entry for the lawyer. Nothing a student does is sent to either.

## Environment

| Variable | Default | What |
|---|---|---|
| `GEMINI_API_KEY` | unset | **Secret.** Turns the picture model on. Set only in the host's dashboard. Unset: the art packs. |
| `STORYBOOK_IMAGE_MODEL` | `gemini-3.1-flash-image` | The Gemini image model id. |
| `STORYBOOK_PICTURES_PLAN_PER_DAY` / `STORYBOOK_PICTURES_FREE_PER_DAY` | `40` / `10` | Pictures a teacher may have drawn a UTC day, with / without the Teacher plan. |
| `STORYBOOK_DRAW_AT_ONCE` | `2` | Pictures drawn at the same time, site-wide (1 to 8). |
| `STORYBOOK_ILLUSTRATOR` | unset | `packs` forces the art-pack drawings even with a key. |
