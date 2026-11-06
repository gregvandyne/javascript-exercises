# Story Builder

Type an idea, get a narrated bedtime-story **video** in a felt-and-paper 3D world: Claude writes the story, Blender
builds and films every shot, a calm voice reads it, a music-box lullaby composed in code plays underneath, and the
words come up on screen in time with the voice. Phase 1 (this document) is the whole pipeline, end to end, on one
machine. It is **off** unless `STORY_BUILDER=1`, because it needs a story worker running beside the site.

## How it fits together

```
 /stories/new ──POST /api/stories──▶ screen the idea (Builder screening) ─▶ stories row: queued
                                                                              │
 scripts/story-worker.js (own process, 1 job at a time) ◀── claimNext ───────┘
   writing     Claude ▶ story script JSON (kit-only, schema-checked, kid-safe checks, model classifier) ── retry once
   voicing     one clip per line (site TTS / offline voice) ▶ measured durations ▶ timeline
               music: lullaby composed for exactly that length, ducked under every line
               words: caption cues ▶ captions.vtt (player) + captions.ass (burn-in)
   rendering   renderer.render(spec)  ── LocalBlenderRenderer: python3 render_story.py (bpy, EEVEE ▶ Cycles)
   assembling  ffmpeg: scene clips ▶ crossfades ▶ words ▶ music + voice ▶ story.mp4 (H.264+AAC) + poster.jpg
   done        /stories/:id plays it (with a captions track and the story's words below)
```

| Piece | File |
| --- | --- |
| Script schema, the kit, validation, kid-safe text checks | `server/services/story-script.js` |
| Claude writer (model, budget, retry, moderation) | `server/services/story-writer.js` |
| Timeline, caption cues, WebVTT, ASS, ducking curve | `server/services/story-captions.js` |
| Music-box lullaby (composer + tine synth + reverb + WAV) | `server/services/story-music.js` |
| Voice per line (site TTS, offline, silent) | `server/services/story-voice.js` |
| Jobs: state machine, limits, sharing and approval | `server/services/story-jobs.js` (table `stories`, migration `0053_stories`) |
| Pipeline (stages, progress) / worker core | `server/stories/pipeline.js`, `server/stories/worker.js` |
| Render interface + local Blender renderer | `server/stories/renderer.js` |
| Felt-and-paper kit and scene renderer (Python) | `server/stories/blender/feltkit.py`, `server/stories/blender/render_story.py` |
| ffmpeg assembly | `server/stories/assemble.js` |
| Pages and APIs | `server/routes/stories.js`, `public/js/stories.js`, `public/css/stories.css` |
| Worker process / command-line render | `scripts/story-worker.js`, `scripts/story-render.js` |
| Tests | `tests/unit/story-builder.test.js`, `tests/unit/story-pipeline.test.js` |

### 1. The story script

Claude (`STORY_MODEL`, else `BUILDER_MODEL`) answers in the JSON schema `SCHEMA`: a title and 2–8 scenes, each with
a **set** (lighthouse, village, forest, meadow, sky), a **time** (night, dusk, dawn, day), optional **props** (boat,
lantern, fireflies), up to three **characters** (mouse, fox, owl, bunny) with an **action** (idle, walk, walk_out,
hop, wave, look_up, sleep, fly, hold_star) and a **place**, a **camera** move (drift, slow_push, pull_back,
pan_left/right, tilt_up/down), and 1–3 **lines** (`say`: narration; `show`: the words on screen). The enums are the
kit, so the writer can't ask for something the renderer can't build (a test keeps the JS kit and the Python kit in
step). Age band and length (45/60/90 s) go into the prompt; the estimated length is checked too.

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
- **Characters** from spheres, cones and discs: mouse, fox, owl, bunny (bead eyes with a glint that blink, felt
  cheeks). Actions: walk (with a hop in the step), hop, wave, look up, sleep (eyes closed, slow breathing), fly
  (owl wings), hold a glowing star; everyone breathes and sways a little.
- **Camera**: eased moves (push in, pull back, pans, tilts, drift) with a gentle float and depth of field focused
  on the first character; compositor bloom on the glows; AgX colour.

Render engine: EEVEE first. Without a GPU it still runs headless through EGL + Mesa's llvmpipe (packages
`libegl1 libegl-mesa0 libgl1-mesa-dri`). If EEVEE can't start (no libEGL), the renderer's probe falls back to Cycles
on the CPU (16 samples + OpenImageDenoise). Frames are rendered **on twos** (every other frame, held for two, like
stop-motion), at 1280×720, 24 fps out.

### 3–6. Voice, music, words, assembly

- **Voice**: one clip per line, `STORY_VOICE=auto|service|local|silent`. `service` is the site's AI voice
  (`services/tts.js synthesize`, ctx `story`, narrator role, slow rate, same cache/limits/budget); `local` is SVOX
  Pico (en/de/es/fr/it) or eSpeak NG, slowed and warmed with ffmpeg — for development and as the fallback when the
  service refuses. Durations are measured with ffprobe and **drive the timeline**: a title card, each scene as long
  as its lines plus a little air, 0.7 s crossfades with no narration inside them, an end card.
- **Music**: `story-music.js` composes a 3/4 waltz from the story id's seed: chord progressions, a stepwise melody
  that lands on chord tones, phrase form A A′ B A″, a cadence home; synthesised on music-box "tines" (inharmonic
  partials, fast-decaying highs), a Schroeder room reverb, fitted exactly to the video's length (the tempo flexes so
  the last bar lands on the end), faded in/out and ducked to ~38% under every line. Deterministic (tested).
- **Words**: phrases of at most ~34 characters, two rows at a time, the line's time shared out by length; burned in
  with libass in the site's own font (Bricolage Grotesque, from `public/fonts`) with a soft outline; the same cues
  as `captions.vtt` for the player's captions track.
- **Assembly**: one ffmpeg graph: each scene's frames ▶ exact scene length ▶ `xfade` chain ▶ fade in/out ▶ vignette
  ▶ words; music + each voice clip (`adelay` to its line) ▶ `amix` ▶ limiter; H.264 (crf 20) + AAC 160k,
  `+faststart`. The poster is a frame while the title is on screen.

### 7. Jobs, worker, pages, sharing

- Table `stories`: `queued ▶ writing ▶ voicing ▶ rendering ▶ assembling ▶ done`, or `failed` (with a reason the page
  explains). Every move goes through `transition(id, from, to)` (`UPDATE … WHERE status=from`), so a job can't be
  moved twice. `progress` (0..1, never backwards) and a heartbeat come from the worker; a job whose worker went quiet
  for 10 minutes (or every running job when the worker starts) goes back in the queue, and fails `stalled` after 3
  tries. A retry keeps the written script (no second Claude call).
- Limits: `STORY_DAILY_LIMIT` new stories a day per kid (default 2; grown-ups and staff get twice as many),
  `STORY_QUEUE_MAX` waiting site-wide (default 20), a request rate limit, and the AI budget.
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

## Running it

Worker machine needs: Node 22, `python3` (3.11+; bpy 5.x wheels are for Python 3.13) with `pip install bpy`,
`ffmpeg` with libass, and for EEVEE without a GPU `libegl1 libegl-mesa0 libgl1-mesa-dri`. Optional offline voice:
`libttspico-utils` and/or `espeak-ng`.

```bash
STORY_BUILDER=1 ANTHROPIC_API_KEY=… npm start          # the site, with /stories on
node scripts/story-worker.js                            # the worker, beside it, same BRB_DATA_DIR
node scripts/story-worker.js --once                     # just the next queued story

# Without the site: render a script (or an idea, with a key) straight to a folder
node scripts/story-render.js --script scripts/story-samples/lost-stars.json --out /tmp/story [--quality full|preview|tiny]
node scripts/story-render.js --idea "a sleepy owl who counts the stars" --seconds 45 --out /tmp/owl
```

The worker shares the site's SQLite file (WAL mode is fine with a second process on the same disk; never over a
network file system). Settings: `STORY_MODEL`, `STORY_VOICE`, `STORY_QUALITY` (`full` 1280×720 · `preview` · `tiny`
· `test`), `STORY_RENDERER` (`local`), `STORY_ENGINE` (`auto|eevee|cycles`), `STORY_RENDER_PROCS` (scenes rendered at
once; 1–2), `STORY_PYTHON`, `STORY_POLL_MS`, `STORY_RENDER_RATIO` (for the wait estimate on the page).

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

The sample: `scripts/story-samples/lost-stars.json` ("Pip and the Lost Stars"), rendered with
`node scripts/story-render.js --quality full`, offline voice (no TTS key in the sandbox); the script was written by
Claude in the session rather than through the API (no API key in the sandbox), in exactly the shape the writer asks
for.

## Production hosting

What a story costs besides compute: Claude writes ~1.5k output tokens from ~3k input (about **$0.02–0.03** on
Sonnet at the prices in `ai-budget.js`, plus the screening classifier, a fraction of a cent); the AI voice reads
~600 characters (about **$0.01** at `TTS_USD_PER_1K_CHARS`). Rendering dominates.

Rough options (prices are public list prices as remembered, late 2026 — **check them before buying**; the
render times are from the measurements above, the GPU ones are estimates, not measured here):

| Option | Render time for a 60 s story | Compute per story | Notes |
| --- | --- | --- | --- |
| CPU worker, 4 vCPU (like this sandbox; e.g. a Render 4 CPU instance ≈ $175/month) | ~75–100 min | ≈ $0.30 at full use; ~550 stories/month max | Simplest, same code. One-hour waits; one story at a time per box. |
| CPU worker, dedicated 8–16 cores (e.g. Hetzner CCX/AX, €50–100/month) | ~30–50 min (llvmpipe scales with cores) | ≈ €0.05–0.10 | Cheapest per story at steady load; still slow. |
| GPU on demand (serverless: Modal / RunPod, L4 or A10G ≈ $0.60–1.20/hour, per-second billing) | ~2–5 min (EEVEE on a real GPU is ~0.1–0.3 s a 720p frame, plus the ~0.2 s per-frame Python step) | ≈ $0.03–0.10 + cold start (bpy image ~1 GB: 30–60 s) | Best wait time; pay only when stories are made; needs the `RemoteRenderer` (below). |
| GPU box rented by the hour (e.g. RTX 4090 ≈ $0.35–0.70/hour) | ~2–4 min | ≈ $0.02–0.05 while busy | Good for a known busy evening; idle hours cost the same. |

Per story all-in on the GPU path: roughly **$0.06–0.15** (Claude + voice + GPU). On a 4 vCPU CPU worker: about
**$0.35** at full use, more when idle.

**Recommendation.** Launch phase 1 behind `STORY_BUILDER=1` for a small group (families and teachers who opt in),
with the daily limit at 1–2 per kid and a CPU worker: it works today and the hour's wait fits "make it after school,
watch it at bedtime" (the page says how long it will take; people can leave and come back). Before opening it widely,
add a `RemoteRenderer` that sends the render spec to a serverless GPU function and gets the frames (or the five scene
clips) back: stories come back in minutes for a few cents, and nothing heavy runs next to the site.

Where it runs on Render: the site's SQLite file lives on the web service's own disk, and a Render disk attaches to one
service only, so a separate Render background worker can't share the job table. Either run the (light) worker loop in
the web service's machine as a second process and send the heavy render to a remote renderer (the recommended path),
or move the job table behind a small HTTP API first. Do not render inside the web service on Render as it is today: a
render pins every core for most of an hour and would starve the site. No Render configuration was changed for this.

Phase 2 work, in order: a `RemoteRenderer` (POST the spec, get frames or scene clips
back) so the worker can stay next to the database while rendering moves; a public gallery with moderation; more kit
(interiors, weather, more animals); per-shot camera framing from the script; a re-render with the same script
(different look) without paying Claude again.
