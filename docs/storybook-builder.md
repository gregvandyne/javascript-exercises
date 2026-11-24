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
| `server/services/storybook-illustrator.js` | The illustrator interface, the art-pack illustrator (catalog from `public/vendor/art2d`) and the `gemini` one (the story's own words for the picture model: what each character is, looks, scenes and settings; the kit only as an optional stand-in) |
| `server/services/storybook-gemini.js` | The picture model: the house style, the per-book style seed, the character sheet and page prompts, the Gemini API request and answer |
| `server/services/storybook-draw.js` | The picture queue and drawer: what to draw, the daily picture count, the picture check, WebP, Redraw, the editor's state |
| `tests/support/fake-gemini.js` | Google's stand-in for tests and screenshots (paints a placeholder PNG scene) |
| `server/services/storybook-mock.js` | The AI stand-in when no `ANTHROPIC_API_KEY` is set |
| `server/services/companion-book.js` | The book maker in the Oomba chat: the draft and its card, the tools (`makeBook`, `findMyBooks`, `changeBook`, `redrawPicture`, `renameBook`, `duplicateBook`, `deleteBook`, `repaintBook`), the check and Start through this file's functions |
| `server/routes/library.js` `madeCard`, `public/js/storybook-books.js` | The teacher's books as the library's cards, and the cards' actions (More menu, rename in place, share, duplicate, delete with Undo, Try again) |
| `public/js/storybook-core.js` | The book's shape and rules, shared by server and browser: `shapeBook`, `warningsOf`, `problemsOf`, `repairBook`, `numbering`, `mapLayout` |
| `public/js/storybook-art.js` | Draws a page's picture as SVG (server and editor) |
| `public/js/storybook-setup.js`, `storybook-edit.js`, `storybook-read.js`, `storybook-pic.js` | The setup steps, the book editor, the reader (and the print button), picture upload |
| `public/css/storybook.css` | All of it, tokens only, 375 px and up |
| Migration `0110_storybooks` | `made_books`, `made_book_pics`, `made_book_classes`, `made_book_reads`, `made_book_ai_days` |
| Migration `0111_storybook_draws` | `made_book_draws` (the picture queue); `made_book_pics.kind` and `.mime` |
| `tests/unit/storybook.test.js` | Access, rules, AI checks and retry, screening, the cap, reader, print, pictures, delete lists |
| `tests/unit/storybook-pictures.test.js` | The picture model: request shape, blocks and refusals, the picture count, no key, Redraw, access; an adventure painted on every page and ending (reader and print); the Pictures choice |
| `tests/unit/storybook-free-cast.test.js` | Pictures free of the art kit: the writer's `what`, `look` and `setting` with one retry, no kit word in the reply, no kit sprite or world name in any request to Google, "What Oomba asked for" (the owner only), Paint all pictures again |
| `tests/unit/storybook-painting.test.js` | While painting: the placeholder, never the art pack (editor, page list, story map, cards, reader, print), the progress line, the swap-in on the poll, a real fallback with Paint pictures again, the restart kick |
| `tests/unit/storybook-books.test.js`, `companion-book-crud.test.js`, `storybook-books-browser.test.js` | Your books: the cards, rename, duplicate, delete, access on every new route and tool, unfinished books, Paint pictures again; the same from the chat |
| `tests/unit/companion-book.test.js`, `companion-book-browser.test.js` | The chat: cards skip what the request answered, words and files into the book, the check and screening, Start and the cap, teachers only, changes from any page with Undo, books made in the past |

## From the Story Builder

`/stories/new` offers "Illustrated picture book" and "Choose-your-own-adventure picture book" next to the video
(docs/story-builder.md "Picture books"; `STORY_PICTURE_BOOKS`, default `teacher`). Both hand the idea to this book
maker: `POST /api/stories/book` fills the first answers (`companion-book.js fromStory` into `fromInput`, like the chat's
`makeBook`): Have AI make one, the kind, the grade (from the age band, when known), the length, Oomba paints the
pictures, and the idea with the kind of story, feeling, who is in it and a lesson as the teacher's words. With the Oomba
chat the card opens on `/read?make=1` asking only the rest (`companion.js storyBook`); without it the setup page
opens on its choices with those picked. The book is an ordinary book in the teacher's cards.

## Who

- **Make, edit, chat, print, share**: school staff and the platform admin (`canMake`). A family grown-up only while
  `STORY_PICTURE_BOOKS` names `parent` (the owner: "Put it behind a feature flag for teacher and parent accounts for
  now"): they make, edit, chat (the editor's own chat), read and print their own books; with no classes, Share with
  classes is hidden and refused (`canShare`), and the fence opens only the book maker's paths, never `/read` (the library). A guest,
  a banned account, a grown-up the flag leaves out, a kid or a student gets the normal 404 from every page and API; signed out, the usual sign-in
  (pages) or 401 (APIs). Checked on the server in one middleware (`teacher` in the routes), not by hiding links.
- **Read**: the book's owner (Preview) and the students and teachers of a class it is shared with (`canRead`). Students
  see shared books on `/read` (the Read tab) under "From your teacher". The AI never talks to students: their pages have no chat.
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

- **Make a book** (`/library`, `/library/make?new=1`, which redirects to `/read?make=1`) opens the chat with the first
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

## Your books (the cards, and create, read, update, delete)

The owner: "you should be able to perform crud on these books, and where My Books is shown in the library make sure they
show up as cards like the rest of the books" (docs/decisions.md "Book maker: my books as cards, with create, read,
update and delete").

- **Cards.** The teacher's books on `/library` ("Your books", the newest 8, with All your books) and on `/library/make`
  are the library's own card (`routes/library.js madeCard`: `lb-card` in an `lb-grid`, library.css): the cover is the
  first page's picture as the reader shows it (painted, the teacher's own, the painting placeholder while Oomba paints
  it, or the art-pack drawing, cut to the card's 4:3), a calm placeholder when there is none; chips for the grade and the kind; the title (to the editor); pages, when
  it changed ("Painting pictures" instead while any of its pictures is being painted: the card asks for itself again,
  `GET /api/library/make/:id/card`, every few seconds and swaps in the painted cover), the classes it is shared with.
  Only `storybook.listBooks` rows (the teacher's own) are ever rendered.
- **Actions.** Create: Make a book (as before). Read (the reader, as students see it) and Open (the editor) on the card.
  The More menu (⋯ over the cover): Rename (in place: Enter or leaving the box saves, Escape puts it back), Share with
  classes (the editor's sheet), Duplicate, Delete. The book page's More menu: Paint pictures again (books whose pictures
  Oomba paints), Duplicate, Delete.
- **Rename** (`renameBook`, `POST /api/library/make/:id/rename`): the word rules and the names check, the title cut to
  the limit; the book's own title too.
- **Duplicate** (`duplicateBook`, `.../duplicate`, 20 an hour): a new book with the same setup, pages and cast,
  "<title> (copy)" (cut so it fits), copies of every picture (the teacher's own, painted pages, character sheets) and of
  the finished picture-queue rows, so nothing is painted or counted again. Never shared, no readers' places, no chat, no
  turn spent. A book with no pages can't be copied.
- **Delete** (`deleteBook`, `.../delete`): the site's own dialog (app.js `ask`), then the card goes with an Undo message
  for six seconds; the delete is sent when the message ends or the page is left (`keepalive`). It removes the book, its
  pictures, picture queue, shares, readers' places and chat (as before).
- **A book whose first draft never came.** `createBook` makes the row before the first draft, which is a separate chat
  job; when that job fails (AI resting or timing out, an unreadable answer, a restart, the turn not stored) the row stays
  empty. `stateOfBook`: `ready` (it has pages), `writing` (its first-draft turn, on the book's chat or the Oomba chat, is
  live) or `unfinished`. An unfinished book's card and editor say "Didn't finish" with Try again
  (`POST .../retry`: one turn, the first draft again; the Oomba chat's `retryBook` for companion teachers) and Delete.
  Empty books older than an hour that are not being written go (`pruneEmpty`): a minute after start-up, every hour, and
  whenever the teacher's books are listed.
- **Paint pictures again** (`storybook-draw.js repaint`, `.../repaint`): every character sheet and page whose picture is
  an art-pack fallback (or was never queued) goes back in the picture queue, at most as many as the pictures left today
  (sheets first; the rest the next time), each counted when drawn, through the AI budget. Painted pictures stay.
- **Paint all pictures again** (the book page's More menu, after a short "Paint every picture in this book again?";
  `repaint(u, id, { all: true })`, `POST .../repaint { all: true }`; the chat's `repaintBook` with `all: true`): every
  character sheet and page picture, painted ones too, from the book's own words, with the same limit and counting. This is
  how a book painted before the pictures were free of the art kit (24 Nov 2026) is painted again: nothing is repainted
  by itself.
- **In the Oomba chat**: `renameBook`, `duplicateBook`, `repaintBook` and `deleteBook` find the book as `changeBook`
  does (the page's book, an id from findMyBooks, or the teacher's words; several that fit: a choice card whose tap does
  it) and call the same functions. `deleteBook` only shows a Delete / Keep card; Delete runs `deleteBook`.
- **Who**: every route checks `teacher` (staff and the platform admin) and `ownBook`; every tool and card tap checks
  `canMake` and the teacher's own book again. Another teacher, a student, a kid, a grown-up get the normal 404.

## The AI

- One call per attempt through `services/ai-call.js` (`callAi`: one time budget, no SDK retries), `config.builderModel`
  (no model id here), effort low (as every drafter in the repo), `max_tokens` 16000. The current Sonnet runs adaptive
  thinking when `thinking` is left out, and its thinking counts against `max_tokens`, so a long adventure could be cut
  off before its JSON was complete. The answer is read with `answerJson`: every text block joined (thinking blocks
  skipped), the JSON object found inside code fences or words, a raw line break or tab inside a string escaped and a
  trailing comma dropped. An answer that still can't be read is logged (`storybook ai failed`, `kind: bad_json`, with
  `stop` (the stop reason), `chars`, `outTokens` and `maxTokens`, never its words) and retried once with a message that
  says what went wrong: cut off at the limit (`stop: max_tokens`) asks for a shorter answer and gives it 24000 tokens;
  anything else asks for one JSON object only. No made-up `{}` answer is put in the conversation. The AI budget: `anthropic('free')` is null while it
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
- **What Oomba writes for it** (`storybook.js paints`: "Oomba paints them" and the picture model there): the story and
  the pictures are free of the art kit (docs/decisions.md "Book pictures: the story and the pictures are free of the art
  kit"). Every cast member has a `what` (what it is, as the story has it: "boy", "chameleon", "grandmother", "robot")
  and a `look` that starts with it ("a small green chameleon with a curly tail and big round eyes"); every `pic` has a
  `scene` (one or two sentences: who, what they do, the feeling; never words to write in the picture) and a `setting`
  (where it happens, in the book's words). The writer is told never to change what a character is, or how they look, to
  fit any list. The kit's `art`, `world` and `props` are optional, only for the stand-in drawing when painting falls
  back (`shapeBook(..., { free: true })` keeps a cast member or picture with no or unknown art, as `''`), and the reply
  never talks about them (the prompt says so, and `kitFree` leaves out a sentence of the reply that mentions ready-made
  art, a stand-in, a sprite or the closest match). Checked (`paintProblems`): every cast member has a `what` and a look
  that names it (`lookNames`), every picture a setting; the answer is sent back once with the problems listed, as with
  every other problem. All are book words: they pass the same word rules, the names check and the classifier as every
  other word (`textsOf`), and the teacher can change what a character is and how they look in the editor. Without
  painting (the art packs, "I'll add my own"), the cast still picks its sprites as before.
- **Character sheets first**: each cast member gets one reference picture (1:1, neutral pose, plain background) from
  their name, what they are and their look, with "What Coco is: chameleon. Draw Coco as exactly that ..., never as any
  other animal, person or creature." With no look the prompt says "a friendly <what>" (or "a friendly character" for a
  character from before `what`); never the kit sprite's name. A page is only drawn once its book's sheets are done, and it sends the sheets of the characters in it as
  reference pictures (inline data after a "Reference picture N: Name" label), so a character looks the same on every
  page. A teacher can redraw a sheet; the pages showing that character then say they changed since, and can be redrawn.
- **Page pictures** (16:9, like the art-pack drawings): the scene, the setting (the page's own `setting`; never the kit
  world's name, and no "Where" at all for a page from before `setting`), the mood, who is in it (name, what they are,
  look) and where (left, middle, right), a composition line (characters clear, a calm uncluttered area kept free), and the
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
  that was drawing when the server stopped goes back in the queue. A network failure is tried once more, a few seconds
  later. Google's rate limits and quota: next section.
- **Kept like the teacher's uploads**: in `made_book_pics` (`kind` `page` or `sheet`, `mime` `image/webp`), converted
  with ffmpeg to WebP at most 1600 px wide (a 1K picture is 1024 px wide: the reader and the print copy), served to
  whoever may read the book. The reader and the print copy show a kept picture before the art-pack drawing; the
  teacher's own picture wins over both. Deleted with the book and the account.
- **What Oomba asked for** (`made_book_draws.prompt`, migration 0113): each picture's final prompt text, as sent (with
  the labels of the reference pictures sent with it; no pictures), kept on its row when it goes to Google. Students'
  names were taken out before the prompt was made. The book's owner sees it in the editor, under the picture or the
  character's reference picture, in a small "What Oomba asked for" disclosure loaded when opened
  (`GET /api/library/make/:id/asked?target=page:<id>|cast:<name>`, `storybook-draw.js promptOf`); anyone else gets the
  normal 404. Copied with Duplicate; deleted with the book.
- **Safety**: only the prompt (the house style, the seed, the scene, setting, what and look words, which passed the word rules and are
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
- **While painting, never the art pack** (docs/decisions.md "Book pictures: a painting placeholder, never the art pack
  while painting"): a picture that is queued or drawing and has no earlier painted picture shows the painting
  placeholder (`storybook-art.js paintingHtml`: "Oomba is painting this picture", a soft paper panel with a gentle
  shimmer, none with reduced motion, and a small brush) in the editor's page picture, the page list, the story map, the
  book's card, the reader and the print copy (`storybook-draw.js painting`, `storybook.js pictureHtml`). The art-pack
  drawing is shown only as a real fallback, with its reason and Paint pictures again. Pictures left queued by a restart
  are drawn again: the queue is kicked 5 seconds after start-up and every 5 minutes when anything waits.
- **The editor**: the line under the warnings ("Painting your pictures: 3 of 8 ready. You can keep editing.", then "All
  pictures painted." for a few seconds before it hides; the pictures left today, how many pictures fell back with Paint
  pictures again, or why the art packs are used), an hourglass on each page still waiting in the page list, under the
  picture its state (waiting, painting, why it fell back with Paint pictures again, changed since) and **Redraw** with an
  optional note ("make it a sunny morning": the word rules and names check, then scrubbed). The editor asks how drawing
  is going every few seconds while anything is queued and swaps in each painted picture as it arrives (the page, the
  page list and the story map). Characters: what each one is, their look and reference picture, with Redraw and What
  Oomba asked for. The teacher's own upload works as before.

## Pictures: requests Google refuses (400, 404)

On 23 Nov 2026 every live picture call came back `400 INVALID_ARGUMENT` (after billing was set up; before it, 429s).
`storybook-gemini.js generate` now keeps Google's own message (cleaned: no key, cut short) in the log line's `message`
field, and adapts once per process: a 400 refusal of the full request (image only, `imageSize`, our safety settings) is
tried once as the plain request (`TEXT` and `IMAGE`, the aspect ratio only, Google's default safety settings) and the
plain one is kept if it works; a 404 for the model id tries its twin with or without `-preview` and keeps whichever
works. The picture check after every picture is unchanged.

## Pictures: rate limits and quota

Google answers a call it won't take now with HTTP 429 (`RESOURCE_EXHAUSTED`). Before, every picture of a book went out
at once, each 429 was tried again 100 ms later and then fell back to the art pack, so a book got art-pack pictures only.

- **What Google said** (`storybook-gemini.js readError`): the error body's `error.status`, the quota that was hit
  (`google.rpc.QuotaFailure`: `quotaMetric`, `quotaId`, `quotaValue`, or `limit: N` in the message) and when to try
  again (`google.rpc.RetryInfo.retryDelay`, the `Retry-After` header, or "Please retry in Ns" in the message). The warn
  line `storybook picture model failed` carries `code`, `http`, `status`, `metric`, `quota`, `limit` and `retryMs`; never
  the key, never the prompt.
- **`rate_limited`** (any other 429): the whole picture queue in this process pauses until Google's retry time or an
  exponential backoff (2 s doubling, at most 5 minutes), whichever is later, plus up to 25% jitter; then it draws one
  picture at a time for 10 minutes. The picture goes back to the queue with `not_before` (migration 0112), its attempt
  not used, and the editor shows **"Waiting for Google. The picture will appear soon."** under it. It keeps waiting for
  up to 30 minutes from its first 429 (`wait_since`), then falls back to the art pack (`busy`: "Google was too busy to
  paint this one... Try Redraw later."). The next change of the book tries it again.
- **`quota_zero`** (a quota whose limit is 0, or a free-tier quota: image models have no free tier): the key's Google
  Cloud project has no picture quota, which means billing is not enabled there. No use waiting: the picture falls back
  at once (`notset`: "Painted pictures aren't set up yet, so this shows the art-pack drawing."), the editor's line says
  so too, and for 10 minutes pictures fall back without calling Google. One warn line `storybook pictures: google quota
  is zero (billing not enabled on the key's project?)` at most once an hour, and one admin email alert a day (kind
  `service`, "Service set-up problems" on /admin/emails).
- **Never counted**: a call that made no picture (a 429, a network failure) gives the day's picture back.

What the owner checks on Google's side when the log says `quota_zero` (or `rate_limited` all day): in Google AI Studio
(aistudio.google.com), **API keys** shows the Google Cloud project the key belongs to and its plan ("Free tier" or a paid
tier); **Set up billing** there (or Google Cloud console, Billing, linked to that project) turns on the paid tier. The
project's limits per model are on AI Studio's **Rate limit** page, and in Google Cloud console under APIs and Services,
**Generative Language API**, **Quotas and system limits** (filter by the image model). These names are as of this
writing and may move.

## The editor

Title, warnings (never blocking; each one a button that jumps to its page: page nobody reaches, page with no choices
that is not an ending, choice with no words, choice that leads nowhere, no reachable ending, no start, no words,
picture without alt text), the story map (CYOA: pages by depth from the start with arrows; endings in Spark, the start
outlined, pages nobody reaches dashed; it scrolls inside itself on a phone), the page list with thumbnails, and one
page: picture (place, mood, who is in it and where; Your picture; No picture), alt text, title, words, and for a CYOA
page Ending, Make this the start page, and up to 4 choices each with "Leads to" (or "A new page"). Linear books move
pages earlier or later. Characters: names, what each one is, and looks. Every edit saves a moment later with the version it was made on;
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
| `STORYBOOK_DRAW_AT_ONCE` | `2` | Pictures drawn at the same time, in this process (1 to 8); 1 for 10 minutes after a 429. |
| `STORYBOOK_ILLUSTRATOR` | unset | `packs` forces the art-pack drawings even with a key. |
| `STORY_PICTURE_BOOKS` | `teacher` | Who the Story Builder hands picture books to this book maker for (`teacher`, `parent`, `teacher,parent`, `0`); with `parent`, family grown-ups may use the book maker. Kids and students never. |
