# Story Builder

Type an idea, get a narrated story **video** in a felt-and-paper 3D world: Claude writes the story, Blender
builds and films every shot, a voice reads it, music composed in code plays underneath, and the words come up on
screen in time with the voice. The person picks the kind of story, its feeling, the narrator and the music ("Choices"),
and can change the story afterwards ("Changing a story"). Phase 1 (this document) is the whole pipeline, end to end, on one
machine. It is **off** unless `STORY_BUILDER=1`, because it needs a story worker running beside the site.

## How it fits together

```
 /stories/new ──POST /api/stories──▶ screen the idea + extras (Builder screening) ─▶ stories row: queued (+ choices)
                                                                              │
 story worker loop (inside the site's process; 1 job at a time) ◀── claimNext ┘
   writing     Claude ▶ story script JSON (kit-only, schema-checked, kid-safe checks, model classifier) ── retry once
   voicing     one clip per line (site TTS / offline voice) ▶ measured durations ▶ timeline
               words: caption cues ▶ captions.vtt (player) + captions.ass (burn-in)
   rendering   renderer.render(spec), STORY_RENDERER =
                 modal   Modal app: every scene at once, each on its own GPU ▶ scene clips back
                 remote  CPU renderer service (Docker): scenes ▶ and it also builds the video
                 local   Blender on this machine (development, or a one-box setup)
               every new scene clip is kept under a key of its pictures (stories/remake.js)
   assembling  music: the chosen mood composed for exactly that length, ducked under every line
               ffmpeg: scene clips ▶ crossfades ▶ words ▶ music + voice ▶ story.mp4 (H.264+AAC) + poster.jpg
   done        /stories/:id plays it (with a captions track and the story's words below)
```

| Piece | File |
| --- | --- |
| Script schema, the kit, validation, kid-safe text checks | `server/services/story-script.js` |
| The choices (style, tone, narrator, music, extras) | `server/services/story-options.js` (columns from migration `0054_story_options`) |
| Changing a story: kept scene clips, the remake planner | `server/stories/remake.js`, `runRemake` in `server/stories/worker.js` |
| Claude writer (model, budget, retry, moderation) | `server/services/story-writer.js` |
| Timeline, caption cues, WebVTT, ASS, ducking curve | `server/services/story-captions.js` |
| Music: six moods (composers + small synth + reverb + WAV) | `server/services/story-music.js` |
| Voice per line (site TTS, offline), MP3 length without ffmpeg | `server/services/story-voice.js` |
| Jobs: state machine, limits, sharing and approval | `server/services/story-jobs.js` (table `stories`, migration `0053_stories`) |
| Pipeline (stages, progress) / worker core / worker loop | `server/stories/pipeline.js`, `server/stories/worker.js`, `server/stories/loop.js` |
| Renderers: interface + local Blender, remote/Modal client, scene clips | `server/stories/renderer.js`, `server/stories/remote-renderer.js`, `server/stories/clip.js` |
| The kit catalog: every set, character, action, prop and look (the one list) | `server/stories/blender/catalog.json` |
| Felt-and-paper kit (shared with the other Blender tools) and scene renderer (Python) | `tools/blender/feltkit.py` (+ `styles.py`), `server/stories/blender/render_story.py` |
| Story kit 2: people, animals, actions, props, sets, staging | `tools/blender/felt_people.py`, `felt_animals.py`, `felt_actions.py`, `felt_props.py`, `felt_sets.py` (+ `felt_sets_rooms.py`, `felt_sets_outdoor.py`), `felt_stage.py` |
| ffmpeg assembly | `server/stories/assemble.js` |
| Modal GPU app | `services/story-renderer/modal_app.py` |
| CPU renderer service (fallback) | `services/story-renderer/server.js`, `spec.js`, `Dockerfile` |
| Pages and APIs | `server/routes/stories.js`, `public/js/stories.js`, `public/css/stories.css` |
| Worker as its own process / command-line render | `scripts/story-worker.js`, `scripts/story-render.js` |
| Tests | `tests/unit/story-builder.test.js`, `story-pipeline.test.js`, `story-renderer.test.js`, `story-modal.test.js` |

### 1. The story script

Claude (`STORY_MODEL`, else `BUILDER_MODEL`) answers in the JSON schema `SCHEMA`: a title and 2–8 scenes, each with
a **set**, a **time** (night, dusk, dawn, day), optional **props**, up to three **characters** with an **action** and a
**place**, a **camera** move (drift, slow_push, pull_back, pan_left/right, tilt_up/down), and 1–3 **lines** (`say`:
narration; `show`: the words on screen). Age band and length (45/60/90 s) go into the prompt; the estimated length is
checked too.

**The kit is one catalog**, `server/stories/blender/catalog.json` (each entry with the few words the writer is told):
35 sets (the first five, a football pitch, rooms — classroom, bedroom, kitchen, library, doctor's room, party room,
theatre stage, bakery — and places outdoors and far away — playground, garden, campsite, farm, zoo, basketball court,
baseball field, swimming pool, city street, train station, airport, beach, rainforest river, under the sea, pirate
ship, the moon, castle, jungle, snowy mountain, desert, dinosaur valley); 21 characters (18 felt animals; `kid`,
`grownup`, `grandparent`); 30 actions; ~55 props; and the **look** of a person. `story-script.js` builds `KIT`, the
schema's enums and a compact kit summary for the writer's prompt (`kitPrompt()`) from it, and
`render_story.py --kit` prints what the Python kit can build: `tests/unit/story-builder.test.js` checks the two are
exactly the same (and, without Blender, that every name appears in the Python kit). Adding an asset = a builder in
the Python kit + a line in the catalog.

A character entry may also carry (all optional): **`who`** (its name in the story, the same in every scene; also the
seed for anything about its look the story left out), **`look`** for people (`hair_color`, `skin`, `hair`, `shirt`,
`outfit`, `glasses`, `age`: e.g. two blonde brothers in the same team kit), and **`holds`** (a prop it carries: a
trophy, a ball, balloons...). `validateScript` carries a person's look over to later scenes by `who` (an outfit may
change), reports unknown look values and holdables to the writer, and turns `fly` into `jump` for anyone who can't fly
(only the owl, bird, dragon and unicorn, and people dressed as a superhero or an astronaut). The writer is told to use
people for stories about children and grown-ups and animals when the idea is about animals.

Safety, both ways: the idea goes through the Builder's own input screening (`builder/screen.js`: injection rules,
word lists for every site language, personal details, the category rules, and the Haiku classifier when a key is
set), so a kid gets the same kind refusal the Builder gives. Every word the video will say or show then passes the
same word rules (`validateScript`) and the model classifier; one retry with the problems listed, then the job fails
(`unsafe` / `invalid`). The idea is sent as data in `<idea>` tags. Every call is recorded in the AI budget
(`ai-budget.js`), and nothing is queued or written while the budget is resting.

### 2. The felt-and-paper world (Blender, headless)

`feltkit.py` is all procedural (no textures, no downloaded assets):

- **Felt**: Principled BSDF with sheen, colour mottling (noise ▶ ramp), a fibre bump (fine noise + voronoi).
- **Paper / card**: soft tooth bump; cut-outs are extruded outlines with a small bevel, stacked in layers
  (clouds in three layers, hills, waves) for the cardboard theatre look.
- **Set pieces**: gradient paper sky with a painted star field, felt moon with craters and a halo, layered clouds
  that drift, **stars hanging on threads** that sway, layered felt sea that bobs, a striped **lighthouse** with a
  glowing lamp room and a sweeping warm beam (additive cone, soft edges), houses with glowing windows, pine and
  round trees, rocks, a boat, a lantern, fireflies, flowers, tufts and pebbles.
- **Characters** from spheres, cones and discs, with bead eyes that blink and felt cheeks: the animals (mouse, fox,
  owl, bunny in `feltkit.py`; dog, cat, bear, elephant, lion, penguin, dinosaur, dragon, unicorn, horse, fish, turtle,
  bird, frog in `felt_animals.py`) and felt **people** (`felt_people.py`): kids, grown-ups and grandparents with a hair
  colour, skin tone (six, light to deep), hair style (felt hair shells, curls and buns; no hair simulation), shirt
  colour, glasses, small/big, and an outfit (casual, dress, sports kit in the shirt colour, pyjamas, swimsuit, winter
  coat, astronaut, pirate, knight, princess, superhero, coach, teacher, doctor, chef, overalls). People have three
  mouths (smile, open, sad) and brows that the actions switch.
- **Actions** (`felt_actions.py`, one system for people and animals; everyone breathes and sways): idle, walk,
  walk_out, hop, wave, look_up, sleep (Zzz), fly, hold_star, run, jump, kick (the ball flies into the goal on the
  pitch), throw and catch (one ball travels from the thrower to the catcher), cheer, high_five and hug (the two meet
  in the middle), sit, sad, point, dance, swim (a ripple at the waist; floating under the sea), climb (a ladder), read
  (a book whose page turns), eat, laugh, cry (tears), think (a thought cloud), sleep_in_bed (tucked in, Zzz), ride (a
  bike, or the horse or unicorn in the scene).
- **Staging** (`felt_stage.py`): places, who moves to whom, the ball, held props, and props put in free slots behind
  and beside the characters (or in the sky, across the top, or over the whole picture for rain and snow).
- **Camera**: eased moves (push in, pull back, pans, tilts, drift) with a gentle float and depth of field focused
  on the first character; compositor bloom on the glows; AgX colour.

Daylight (day, dawn) uses Blender's Standard view transform: AgX greyed the bright day colours (felt read milky);
dusk and night keep AgX. Big, static set dressing (crowds, pitch lines, shelves of books, fences) is built as one
mesh per group (`felt_props.Batch`), so a set builds in a second or two and stays at roughly 8–30k faces.

Render engine: EEVEE first. Without a GPU it still runs headless through EGL + Mesa's llvmpipe (packages
`libegl1 libegl-mesa0 libgl1-mesa-dri`). If EEVEE can't start (no libEGL), the renderer's probe falls back to Cycles
on the CPU (16 samples + OpenImageDenoise). On Modal's NVIDIA GPUs EEVEE uses the driver's EGL; if that isn't
available there, Cycles runs on the GPU (OptiX, else CUDA; `STORY_CYCLES_DEVICE=GPU`). Frames are rendered **on twos**
(every other frame, held for two, like stop-motion), at 1280×720, 24 fps out. Each scene comes back as one small
H.264 clip (`clip.js`, crf 16, 12 fps) whatever the renderer.

Framing (fixed after the first sample): the camera sits at the animals' eye level and pitches down a touch, so they
stand above the caption band; the lighthouse stands further back and smaller so its lamp stays in a push-in; walkers
start inside the picture (at most 3 units from the middle, a short stroll), never at the frame's edge.

### 3–6. Voice, music, words, assembly

- **Voice**: one clip per line, `STORY_VOICE=auto|service|local|silent`. `service` is the site's AI voice
  (`services/tts.js synthesize`, ctx `story`, narrator role, slow rate, same cache/limits/budget); `local` is SVOX
  Pico (en/de/es/fr/it) or eSpeak NG, slowed and warmed with ffmpeg — for development and as the fallback when the
  service refuses; with neither, the story fails at the voice stage (it never goes silent by accident). Durations are
  measured (MP3s frame by frame in JS, anything else with ffprobe) and **drive the timeline**: a title card, each scene as long
  as its lines plus a little air, 0.7 s crossfades with no narration inside them, an end card.
- **Music**: the mood picked on the form ("Choices"); the original and default, `lullaby`: `story-music.js` composes a 3/4 waltz from the story id's seed: chord progressions, a stepwise melody
  that lands on chord tones, phrase form A A′ B A″, a cadence home; synthesised on music-box "tines" (inharmonic
  partials, fast-decaying highs), a Schroeder room reverb, fitted exactly to the video's length (the tempo flexes so
  the last bar lands on the end), faded in/out and ducked to ~38% under every line. Deterministic (tested).
- **Words**: phrases of at most ~34 characters, two rows at a time, the line's time shared out by length; burned in
  with libass in the site's own font (Bricolage Grotesque, from `public/fonts`) on a soft night-blue panel in a band at
  the very bottom of the picture, below the characters; the same cues as `captions.vtt` for the player's captions
  track.
- **Assembly**: one ffmpeg graph: each scene's clip ▶ 24 fps ▶ exact scene length ▶ `xfade` chain ▶ fade in/out ▶ vignette
  ▶ words; music + each voice clip (`adelay` to its line) ▶ `amix` ▶ limiter; H.264 (crf 20) + AAC 160k,
  `+faststart`. The poster is a frame while the title is on screen.

### 7. Jobs, worker, pages, sharing

- Table `stories`: `queued ▶ writing ▶ voicing ▶ rendering ▶ assembling ▶ done`, or `failed` (with a reason the page
  explains). Every move goes through `transition(id, from, to)` (`UPDATE … WHERE status=from`), so a job can't be
  moved twice. `progress` (0..1, never backwards) and a heartbeat come from the worker; a job whose worker went quiet
  for 10 minutes (or every running job when the worker starts) goes back in the queue, and fails `stalled` after 3
  tries. A retry keeps the written script (no second Claude call).
- Limits: `STORY_DAILY_LIMIT` new stories a day per kid (default 2; grown-ups and staff get twice as many; a rewrite
  counts as one), `STORY_REMAKE_LIMIT` quick changes a day (default 4, grown-ups and staff 8), `STORY_QUEUE_MAX`
  waiting site-wide (default 20, new stories and changes together), request rate limits, and the AI budget.
- Pages: `/stories` (my stories; for linked grown-ups and teachers, "Waiting for your OK"), `/stories/new`,
  `/stories/:id` (a moon and a progress bar that polls `/api/stories/:id`, then the player). Files are served only to
  people who may watch (byte ranges for the video).
- **Sharing**: private by default. A grown-up's, a teacher's or the admin's story is shared when they press Share
  (anyone with the link). A **kid's** story asks first (`pending`): a grown-up linked to the kid's account (family),
  a teacher of one of the kid's classes, or their school's admin (and the platform admin) can watch it and say yes or
  no; only after a yes can anyone else see it. Nothing is listed publicly in phase 1. Every share decision is in the
  audit log; a deleted account's stories and files go with it.
- All UI text is in the locale files (`stories.*`, `js.stories.*`) for all 13 languages. The story itself is written
  and narrated in the page's language; the end card ("The End. Goodnight!") is per language.

### 8. Choices

`/stories/new` asks for the idea, then offers big tappable cards (an emoji and a short label; the radio button inside
is visually hidden, so keyboards and screen readers still work), each with a sensible default already picked. Nothing
but the idea is required.

| Choice | Values (`story-options.js`) | What it changes |
| --- | --- | --- |
| Kind of story (`style`) | bedtime (default), adventure, funny, rhyming, fable (with a lesson), mystery | one paragraph of the writer's prompt; only bedtime ends asleep at night |
| Feeling (`tone`) | cozy (default), exciting, silly, heartfelt, brave | one line of the prompt |
| Narrator (`voice`) | auto (the narrator the admin chose for the language), coral, sage, nova, shimmer, fable, onyx — with kid names ("Warm and kind", "Deep and calm"…) | the site AI voice that reads every line; the offline voice is shifted in pitch so the choice is still heard |
| Music (`music`) | lullaby (music box, default), playful, adventure, magical, piano, none | the mood `story-music.js` composes; picking a style preselects its music until the person picks music themselves |
| Who is in it (`characters`, optional, 120 chars) | free text | sent as `<characters>`; screened like the idea |
| A lesson (`lesson`, optional, 120 chars) | free text | sent as `<lesson>`; screened like the idea |
| Age band, length | as before, under "More choices" | |

The safety paragraph of the prompt is the same for every style. The world is still the kit: the prompt tells the writer
to tell people with felt kids, grown-ups and grandparents (with a look that fits them) and animals with the felt
animals, keeping their names, and to turn a place the kit lacks into the closest set; the form says so under the idea
(`stories.kitHint`). Unknown values fall
back to the defaults; old rows read as bedtime / cozy / auto / lullaby. The story page shows the choices as small pills.

**Narrator samples.** Each voice card has a ▶ while the AI voice is on for the page's language: `POST
/api/stories/voice-sample { voice }` reads one fixed sentence per language (`stories.voiceSample`) in that voice,
pinned in the TTS cache, so each sample is made once for the whole site (at most 13 languages × 7 voices) and a person
can never choose the text. 30 a person per 10 minutes.

**Music moods** (all composed from the story's seed, fitted to the exact length, ducked under the voice):
`lullaby` 3/4 waltz on music-box tines; `playful` bouncy 4/4 ~116 bpm, marimba tune on the major pentatonic, plucked
bass, chord stabs and a woodblock on 2 and 4; `adventure` 4/4 ~100 bpm in a minor key, horn melody in long notes over an
eighth-note ostinato and timpani; `magical` slow 3/4 in the Lydian mode, bell arpeggios over a soft pad with high
sparkles and a bigger room; `piano` gentle 4/4 ~68 bpm, broken chords and a stepwise tune on a piano voice; `none`
silence. A test checks every pair differs in metre, tempo, note density or brightness, and in instruments.

### 9. Changing a story

The owner of a finished story gets **Edit story** (`/stories/:id/edit`):

- **Change the words**: the title and every line, scene by scene (the scene's place and time shown with it). New words
  go through `checkEdited` (`validateScript`'s word rules and lengths, and the model classifier when a key is set); a
  story much longer than its length is refused, a shorter one is fine. Only the words change: the scenes and pictures
  stay.
- **Who reads it / Background music**: the same cards as the form.
- **Make the new video** sends all of that as one quick change (`POST /api/stories/:id/remake`).
- **Ask for a rewrite**: a short note ("make it funnier", "add a picnic at the end"), screened like the idea, and maybe
  a new kind of story or feeling (`POST /api/stories/:id/rewrite`). The writer gets the current script as
  `<current_story>` and the note as `<change_request>` and sends a whole new script, checked like any other.

**The old video keeps playing.** A change is a small job of its own on the finished row (`remake_status`: queued ▶
working ▶ done, or failed), so the story stays `done` (and shared) while the new version is built in `<story>/next`.
Only when it is complete are its files moved over the old ones (the video last) and the row updated (`version` + 1;
file URLs carry `?v=<version>`). A failure leaves the old video exactly as it was; the owner can try again or keep the
old one. The worker takes new stories and changes oldest first; a worker that stops puts a change back in line (three
tries, then `stalled`).

**Only what changed is made again** (`stories/remake.js`). Every rendered scene clip is kept in `<story>/clips/` under a
key of its pictures (set, time, props, characters with action and place, camera, seed, render size) — not its length,
which follows the narration. Before rendering, the pipeline looks each scene's key up and renders only the missing ones:

| Change | Claude | Voice | Scenes rendered |
| --- | --- | --- | --- |
| New narrator | no | every line (the site voice's cache makes repeats free) | none |
| New music | no | none new (cache) | none |
| New words | no (the classifier checks them) | the changed lines | none |
| Rewrite | yes | the new lines | only scenes whose pictures changed |

A kept clip shorter than its scene's new length is slowed (up to 1.5×), then its last frame is held (`fitClip`; the
assembly's `setpts` and `tpad`). Clips no version uses any more are removed. The CPU renderer service
(`STORY_RENDERER=remote`) builds the whole video itself and returns no clips, so there every change renders every scene;
Modal and local keep clips. Stories made before clips were kept render once on their first change.

**Limits.** Quick changes: `STORY_REMAKE_LIMIT` a day (default 4; grown-ups and staff 8). A rewrite pays Claude, so it
counts like a new story against `STORY_DAILY_LIMIT`, needs the AI budget, and is refused while the writer is resting.
One change at a time per story; changes count against `STORY_QUEUE_MAX` with new stories. Every change asked for is a
row in `story_edits` (kept when the story is deleted, so deleting doesn't refund it; removed with the account).

**Sharing.** When a new version replaces a kid's shared or waiting story, it goes back to "waiting for OK": the
grown-up said yes to the old words. A grown-up's shared story stays shared. Only the owner can change a story.

## Running it

The site runs the story worker loop **in its own process** when `STORY_BUILDER=1` (`server/index.js`; nothing else
to start; `STORY_WORKER=external` hands it to `node scripts/story-worker.js` instead). The loop is light: one Claude
call, the voice clips, the music, and one ffmpeg assembly (run with `nice` and two threads). Rendering goes to the
renderer named by `STORY_RENDERER`.

```bash
# development, everything on one machine (needs python3.13 + bpy, ffmpeg; an offline voice: pico2wave or espeak-ng)
STORY_BUILDER=1 ANTHROPIC_API_KEY=… npm start

# the Modal web API run locally on the CPU (same scene code as on Modal), and the site pointed at it
pip install bpy==5.2.3 "fastapi[standard]" uvicorn
STORY_RENDER_TOKEN=$(openssl rand -hex 24) python3 services/story-renderer/modal_app.py --serve 3482
STORY_BUILDER=1 STORY_RENDERER=modal STORY_RENDER_URL=http://127.0.0.1:3482 STORY_RENDER_TOKEN=<same> npm start

# without the site: render a script (or an idea, with a key) straight to a folder
node scripts/story-render.js --script scripts/story-samples/lost-stars.json --out /tmp/story [--quality full|preview|tiny]
node scripts/story-render.js --idea "a sleepy owl who counts the stars" --seconds 45 --out /tmp/owl
```

Settings: `STORY_BUILDER` (off by default), `STORY_DAILY_LIMIT` (2 a day per kid; grown-ups and staff twice that),
`STORY_REMAKE_LIMIT` (4 quick changes a day; grown-ups and staff twice that),
`STORY_QUEUE_MAX` (20), `STORY_WORKER` (`inline` | `external`), `STORY_RENDERER` (`local` | `modal` | `remote`),
`STORY_RENDER_URL`, `STORY_RENDER_TOKEN`, `STORY_MODEL`, `STORY_VOICE` (`auto` | `service` | `local`), `STORY_QUALITY`
(`full` 1280×720 · `preview` · `tiny` · `test`), `STORY_ENGINE` (`auto|eevee|cycles`), `STORY_RENDER_PROCS`,
`STORY_PYTHON`, `STORY_POLL_MS`, `STORY_RENDER_POLL_MS`, `STORY_RENDER_TIMEOUT_MS`, `STORY_RENDER_RATIO` (the
wait estimate on the progress page: render seconds per video second; set 4 for Modal).

## Measured on this machine

The sandbox: 4 vCPU (x86-64), 15 GB RAM, **no GPU** (EEVEE through Mesa llvmpipe).

| What | Result |
| --- | --- |
| EEVEE, 1280×720, 4 samples, one frame (uncontended) | **~6.4 s** (first frame of a scene ~5.7 s); 8 samples ~16 s with every light shadowed, ~8 s with key-light shadows only (what ships) |
| Same, 4 Blender processes at once | ~5 s per frame overall (llvmpipe already uses the cores: only ~1.3× more) |
| Cycles CPU, 16 samples + OpenImageDenoise | ~30 s per frame (and the denoiser smears the felt texture): fallback only |
| Fixed cost per frame (192×108, 1 sample) | ~1.9 s (scene sync + shadows on a software GPU) |
| **The sample story** (5 scenes, 46.7 s, 602 frames on twos, 2 processes) | **4,771 s of rendering = 102 s per second of video**, 14.2 s per frame per process; the full test suite ran beside it for ~22 of those minutes |
| One whole scene alone (scene 2 re-rendered after a camera fix: 102 frames, 1 process, nothing else running) | 700.6 s = **6.9 s per frame** |
| Uncontended estimate | 12 rendered frames per video second × ~6.9 s ≈ **80–85 s of render per second of video**: a 60 s story ≈ 80–100 min on 4 vCPU |
| Rendering every frame (no "twos") | twice that |
| Voice (offline, 5 lines) + music + captions | < 10 s |
| ffmpeg assembly (720p, H.264 crf 20) | ~27 s for 47 s of video; the MP4 is ~12.7 MB |
| Integration test (2 scenes, 128×72) | ~1–2 min |
| Assembly in a container capped like a web instance | 0.5 CPU / 512 MB: **killed (out of memory)**; 0.5 CPU / 768 MB: 155 s; 1 CPU / 1 GB: 82 s |
| End to end through the CPU renderer service in Docker (site on one port, container on another; 2 scenes, test size) | story done in 86 s; the service's work folder empty afterwards |
| Modal web API served locally on the CPU (`modal_app.py --serve`, 2 scenes in parallel, test size) | clips back through the site's `STORY_RENDERER=modal` client (tests/unit/story-modal.test.js) |
| **The sample again, with the framing fixes** (Nov 7: 5 scenes, 46.7 s, 602 frames, 1 process, nothing else running) | **4,365 s = 93 s of render per second of video, 7.2 s per frame**; the whole run (voice, render, clips, assembly) 4,416 s |

The sample: `scripts/story-samples/lost-stars.json` ("Pip and the Lost Stars"), rendered with
`node scripts/story-render.js --quality full`, offline voice (no TTS key in the sandbox); the script was written by
Claude in the session rather than through the API (no API key in the sandbox), in exactly the shape the writer asks
for.

## Production hosting

**Chosen: Modal, serverless GPUs, one per scene.** The site (Render web service, unchanged apart from env vars) keeps
the job table, the worker loop, the voice and the assembly; Modal renders. Nothing is deployed until the workflow below runs (the
sandbox cannot reach Modal); no Render service was created or changed.

### Deploy the GPU renderer: run the workflow

Deploying is a GitHub Actions workflow, `.github/workflows/deploy-story-renderer.yml` ("Deploy story renderer
(Modal)"). It checks the three secrets are there, stores the API password in Modal (secret `story-renderer`), runs
`modal deploy services/story-renderer/modal_app.py` with the GPU you pick (L40S, L4 or A10G), checks `/health`, then
renders one short scene at preview size through the token-protected API (`services/story-renderer/smoke_test.py`) and
writes the endpoint URL, the wall time and the GPU render time into the run's summary. It never prints a secret.

**Step by step, from a phone** (about 10 minutes; nothing here costs money until a story is made):

1. **Make a Modal account and an API token.** Open **modal.com** → *Sign up* (GitHub sign-in is fine) → once in,
   tap your profile picture or the menu → **Settings** → **API Tokens** → **New Token**. Modal shows two values: a
   **Token ID** (starts `ak-`) and a **Token Secret** (starts `as-`). Keep that page open, or copy both somewhere
   private: the secret is shown only once. (Modal asks for a payment card before GPUs can run; its free monthly credit
   covers the first tests.)
2. **Make up the renderer password.** Any long random password, at least 24 characters, letters and digits (a password
   manager's "generate" button is ideal). Copy it: it goes in two places, GitHub (step 3) and Render (step 6).
3. **Add three secrets on GitHub.** Open the repository on github.com → **Settings** (on a phone: the ⋯ menu or
   "Desktop site" if the tab is hidden) → **Secrets and variables** → **Actions** → **New repository secret**, three
   times:
   - Name `MODAL_TOKEN_ID`, value: the Token ID from step 1
   - Name `MODAL_TOKEN_SECRET`, value: the Token Secret from step 1
   - Name `STORY_RENDER_TOKEN`, value: the password from step 2
4. **Run the workflow.** In the repository → **Actions** → **Deploy story renderer (Modal)** → **Run workflow** →
   branch `feature/story-builder` (or `main` once merged), GPU **L40S** → **Run workflow**. The first run takes
   about 10–20 minutes (Modal builds the Blender image once; later runs are a few minutes).
5. **Read the result.** Open the finished run: a green tick means deployed, healthy and one real render done. The
   summary at the top shows the **endpoint URL** and the measured times. Copy the URL exactly as shown: Modal may put
   a region in it, e.g. `https://<workspace>--oomba-story-renderer.us-east.modal.run` (the live one is
   `https://gregvandyne--oomba-story-renderer.us-east.modal.run`, L40S). A red cross says which step failed and why (a missing secret is named).
6. **Point the site at it.** Render dashboard → the web service → **Environment** → add:
   - `STORY_RENDERER` = `modal`
   - `STORY_RENDER_URL` = the endpoint URL from step 5
   - `STORY_RENDER_TOKEN` = the same password as step 2 (Render keeps it secret)
   - `STORY_RENDER_RATIO` = `4` (the wait the progress page promises)
   - `STORY_DAILY_LIMIT` = `1` and `STORY_QUEUE_MAX` = `10` for the small group first
   - the AI voice for the story's language (`TTS_ENABLED=1`, its key, the locale switched on at /admin/voices)
   - and last, when ready to open it, `STORY_BUILDER` = `1`. Save; Render redeploys the site.

To change the GPU later, run the workflow again with another choice. To change the password, update it in both
GitHub (secret) and Render (env var), then run the workflow again.

Also:
- The site's image now has ffmpeg and a CJK font (root `Dockerfile`): the next deploy carries them.
- Web instance size: assembling a 47 s story peaks between 512 MB and 768 MB (measured: killed at 512 MB, fine at
  768 MB) on top of the site itself, so the web service needs **at least 1 GB, better 2 GB** (Render's current
  `starter`, 512 MB, is too small; e.g. Render Standard, 2 GB). Measured assembly time: 82 s on 1 CPU, 155 s on 0.5 CPU.

What only the first real run can show (built to Modal's documented API, modal 1.6; the module imports and the web
API runs locally): the image build, EEVEE through the NVIDIA EGL driver (if it doesn't start, the probe falls back to
Cycles on the GPU, slower but fine), cold-start time, and the real per-frame GPU time.

### Expected time and cost per story (estimates, not measured)

Each scene renders in its own container in parallel. A 60 s story is ~5 scenes of ~140 frames (on twos). EEVEE on an
L40S at 720p with 4 samples is expected around 0.2–0.4 s a frame plus Blender start-up and shader compile (~15 s) and
a cold container start (~20–40 s with the image cached).

| GPU (`STORY_GPU`) | Modal list price (check before buying) | Time to rendered clips | GPU-seconds per story | GPU cost per story |
| --- | --- | --- | --- | --- |
| **L40S** (default) | ≈ $1.95 / hour | ~1.5–2.5 min | ~5 × 90 s | **≈ $0.25** |
| A10G | ≈ $1.10 / hour | ~2–3 min | ~5 × 110 s | ≈ $0.17 |
| L4 | ≈ $0.80 / hour | ~2.5–4 min | ~5 × 140 s | ≈ $0.16 |

Add ~1.5 min on the site for voice + assembly, Claude ≈ $0.02–0.03 and the AI voice ≈ $0.01: **about 3–4 minutes and
$0.20–0.30 a story on L40S.** The containers scale to zero 10 s after their scene (`scaledown_window`), so nothing is
paid while no one makes stories. Measure the real numbers with the first few stories (the worker logs `render`
seconds per story; Modal's dashboard shows GPU time) and switch to L4 if L40S buys little time.

### Fallbacks

- **CPU renderer service** (`STORY_RENDERER=remote`, `services/story-renderer/Dockerfile`, tested here in Docker):
  one job at a time, the same token rules, and it builds the video too (so the web instance can stay small).
  As a Render **Private Service** (Docker): root directory = repository root, Dockerfile path
  `services/story-renderer/Dockerfile`, env `STORY_RENDER_TOKEN` (secret), health path `/health`, instance with
  4 CPU / 8 GB (measured speed ≈ 80–100 s of render per second of video: a 60 s story in ~80–100 min); site env
  `STORY_RENDERER=remote`, `STORY_RENDER_URL=http://<private-service-host>:<port>`, `STORY_RENDER_TOKEN`.
- **Local** (`STORY_RENDERER=local`, the default): Blender on the site's own machine. Development only: in production
  the site logs a warning, because a render takes every core for over an hour.

Contact sheets of the kit (every set at day, dusk and night; characters, outfits, actions): `python3
tools/blender/story_kit_sheet.py cells.json sheet.jpg` builds each cell exactly as a story scene and tiles the stills.

## Next

A public gallery with moderation; per-shot framing from the script; editing a scene's pictures by hand (set,
characters) on the edit page; once Modal numbers are known, set
`STORY_RENDER_RATIO` from them.
