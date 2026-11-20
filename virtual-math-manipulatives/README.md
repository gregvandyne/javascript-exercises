# Oomba Virtual Math Manipulatives

A free, kid-safe set of 18 virtual math manipulatives for classrooms, built for
Oomba Academy. Teachers and students open a tool (rekenrek, base ten blocks,
fraction tiles, geoboard, clock and more), build on a freeform Miro-style
board with draggable pieces, sticky notes and pen annotations, work through a
library of 300 curriculum tasks, share boards with an 8-character Share Code,
run live classroom sessions where the teacher can watch and push work to every
student, and ask the built-in AI to draft a ready-to-teach lesson board.

This repository is the complete source of the app exactly as it runs today in
its Muse web artifact hosting. It is a TypeScript full-stack app: a React
client, typed server actions, and a small SQLite database managed with
Drizzle migrations.

## Repository layout

```
client/
  index.html            Page shell (loads src/main.tsx)
  build.mjs             Client bundle script (delegates to @hatch/space-sdk/build)
  tsconfig.json
  src/
    main.tsx            React entry point, QueryClient provider
    App.tsx             The whole app: all 18 tools, the board, tasks, LIVE UI
    extra-tasks.ts      The extended task library (merged with the tasks in App.tsx)
    api.ts              Typed RPC client for the server actions
    theme.css           Oomba design system (tokens, buttons, layout) + Tailwind v4
    globals.d.ts
server/
  tsconfig.json
  src/
    schema.ts           Drizzle schema: workspaces, live_sessions, live_submissions
    actions.ts          All server actions (see "Server actions" below)
drizzle/
  0001_initial.sql                  Creates the workspaces table
  0002_workspaces_replace_entries.sql
  0003_live_sessions.sql            Creates live_sessions and live_submissions
  meta/_journal.json                Migration journal (keep in sync with the SQL files)
package.json            Scripts and dependencies (Bun is the package manager)
bun.lock                Lockfile, commit this
bunfig.toml             Bun install config (per-project install cache)
tsconfig.base.json      Shared strict TypeScript settings
space.json              Muse web artifact metadata (name, slug, entry point)
icon.webp               App icon
AGENTS.md               Notes for agents working in this repo (read this first)
```

## The 18 tools

Rekenreks, Two-Color Counters, Linking Cubes, Color Tiles, Hundred Board,
Base Ten Blocks, Place Value Disks, Cuisenaire Rods, Fraction Circles,
Fraction Tiles, Number Lines, Bar Models, Money, Algebra Tiles,
XY Coordinate Board, Geoboard, Pattern Blocks, and Clock. Tool definitions,
palettes and per-tool state shapes all live in `client/src/App.tsx`.

## The task library

300 original tasks, each with a title, a student prompt, teacher notes, a
Common Core code (CCSS) and a grade. The first set is the `TASKS` record in
`client/src/App.tsx`; the rest are in `client/src/extra-tasks.ts`
(`EXTRA_TASKS`, same shape, keyed by tool slug). The app merges the two at
runtime. To add a task, append an entry to either record for the tool's slug.

## Install

Prerequisite: [Bun](https://bun.sh) 1.3 or newer (the project pins
`bun@1.3.10` as its package manager in `package.json`).

```sh
bun install
```

One dependency needs a note: `@hatch/space-sdk` is declared in
`package.json` as a local file dependency
(`file:/opt/hatch/skills/spaces/ts-runtime/dist/space-sdk.tgz`). That SDK is
the Muse web artifact runtime library: it provides the typed action client
the browser calls, the server-side `ctx` object (database, blob storage and
AI inference), and the client bundler used by `client/build.mjs`. Inside the
Muse hosting environment the path resolves as-is. Outside it, point that
dependency at a copy of the SDK tarball, or vendor the SDK into the repo and
update the path before running `bun install`. Everything else
(React 19, TanStack Query, Drizzle ORM, Zod, Tailwind CSS v4, Recharts)
installs from the public registry via `bun.lock`.

## Run locally

Inside the Muse web artifact environment the app is served by the platform:
it applies the migrations in `drizzle/` to a per-app SQLite database
(`app.db` next to `space.json`), builds the client and server, and routes
browser calls to the actions endpoint. There is no separate dev-server script
to start; the platform owns serving.

Useful local commands:

```sh
bun run typecheck   # tsc --noEmit for both client and server projects
bun run build       # builds server/dist/actions.js and the client bundle
bun run build:server
bun run build:client
```

`bun run build` output (`server/dist/`, `client/dist/`) is generated and is
not committed; see `.gitignore`.

To self-host outside Muse you would need to reimplement the thin runtime
contract the SDK provides: an HTTP endpoint that dispatches `{action, args}`
JSON calls to the handlers in `server/src/actions.ts`, a `ctx.db` backed by
SQLite with the Drizzle schema in `server/src/schema.ts`, and a `ctx.inference`
implementation for the `draftLesson` action. The action handlers themselves
are plain async functions and carry no other platform coupling.

## Deploy

In production this app deploys as a Muse web artifact: push the source, the
platform runs `bun install`, applies any new migrations from `drizzle/`,
builds client and server, and serves `client/dist/index.html` (the `entry`
named in `space.json`). Database content (saved workspaces and LIVE sessions)
lives in the platform-managed `app.db` and is not part of this repository.

Schema changes follow the usual Drizzle flow:

1. Edit `server/src/schema.ts`.
2. Add a new numbered SQL file in `drizzle/` and a matching entry in
   `drizzle/meta/_journal.json`. Never edit a migration that has already run.
3. The platform applies new migrations on the next deploy.

## Server actions

All client-to-server traffic goes through the typed actions in
`server/src/actions.ts`. The client calls them via `client/src/api.ts`
(`createActionClient`), so request and response types are checked end to end.

| Action | Purpose |
| --- | --- |
| `saveWorkspace` | Save a board state, returns its new Share Code |
| `loadWorkspace` | Load a saved board by Share Code |
| `listWorkspaces` | List recently saved boards, newest first |
| `deleteWorkspace` | Delete a saved board by id |
| `createLiveSession` | Start a LIVE session for a tool, returns its join code |
| `joinLiveSession` | Register a student name on a session |
| `submitLiveWork` | Save a student's current board into the session |
| `getLiveSession` | Session details plus every student's latest work |
| `pushLiveWorkspace` | Push the teacher's board to every student |
| `endLiveSession` | End a session so no more work can be submitted |
| `draftLesson` | AI-drafts a lesson board (see below) |

## How Share Codes and storage work

Saving a workspace (`saveWorkspace`) serializes the whole board to one JSON
string and inserts a row into the `workspaces` table:

- `code`: an 8-character code drawn from an unambiguous alphabet
  (no 0/O/1/I/L), generated server-side in `makeCode()`.
- `tool_slug`: which of the 18 tools the board belongs to.
- `title`: board title.
- `state_json`: the serialized board (up to 200 KB). Each tool defines its
  own state shape in `App.tsx` (pieces placed, counters, clock hands, and so
  on). Two cross-tool extras ride inside the same JSON under a reserved
  `__ann` key: the pen `strokes` and the sticky `notes`, so annotations and
  text boxes travel with every save, share and LIVE push.
- `created_at`: insert time.

Anyone with the code can load the board with `loadWorkspace`; codes are
capability tokens, there is no per-user account or ownership check. Opening a
code for a different tool routes the student to that tool and restores the
state there. Treat codes as shareable links: anyone who has one can view
that board.

## How LIVE sessions work

A LIVE session is a real-time-ish classroom run of one tool, stored in two
tables:

- `live_sessions`: `code` (same 8-character format as Share Codes),
  `tool_slug`, `title`, `teacher_state_json` (the teacher's board),
  `pushed_state_json` (the last board the teacher pushed, nullable), and
  `status` (`active` or `ended`).
- `live_submissions`: one row per student per session, keyed by display name
  (matched case-insensitively), holding that student's latest `state_json`
  and `updated_at`.

Flow: the teacher creates a session and shares the code. Students join with
the code and a display name (`joinLiveSession` creates their submission row).
While they work, the client auto-saves their board with a short debounce
(`submitLiveWork`). The teacher's dashboard polls `getLiveSession` every
4 seconds and renders a summary of each student's board. The teacher can push
their own board (or any saved workspace) to the whole class with
`pushLiveWorkspace`; students pick up `pushed_state_json` and load it.
`endLiveSession` flips the status to `ended`, after which submissions and
pushes are rejected. There is no authentication layer: the code plus a
display name is the whole identity model, by design for classroom use.

## AI lesson drafting

The `draftLesson` action takes a tool, an optional library task, and the
teacher's plain-language brief, and asks the platform's model
(`ctx.inference.complete`, server-side only) to lay out a board in
board-fraction coordinates (0 to 1 on each axis): which pieces to place
(restricted to that tool's real palette vocabulary, which the client sends),
2 to 4 sticky notes with instructions and questions, and up to 3 pen strokes.
The server sanitizes the result (vocabulary filter, coordinate clamping,
length caps) before returning it, and the client renders it as a normal
board the teacher can edit, save with a Share Code, or push to a LIVE
session. Inference is a platform capability; a self-hosted port needs its
own model call behind the same action signature.

## Design system

`client/src/theme.css` carries the Oomba Academy design system: Bricolage
Grotesque, the brand palette (Mint #66C792, Leaf #1F9D63, Ink #141414,
Cream #FFFDF2, Spark #FFD23F), pill buttons with a pressed edge, 20px card
corners, a 1240px content wrap and a 64px top bar, with a matching dark
theme under `prefers-color-scheme: dark`. Semantic tokens (`--bg`,
`--surface`, `--text`, `--dim`, `--border`, `--accent`, `--radius`) are
defined there and used throughout `App.tsx`.

## License and ownership

Built for Oomba Academy. The task library is original material written for
this app. No third-party site content is reproduced.
