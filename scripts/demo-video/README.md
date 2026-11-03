# Demo videos (teacher page, parents page)

How the videos on `/teachers/live` (`public/video/oomba-demo.mp4`) and `/parents` (`public/video/oomba-parents.mp4`)
are made: the real app, recorded frame by frame, with captions, music and (optionally) an OpenAI voice-over. Only the
small scripts live here; every recording, clip and mix goes to `/tmp/claude-0/` (see `.gitignore`).

## Why frame by frame

A real-time screen recording of headless Chrome with software 3D stutters. `vc.mjs` installs a virtual clock in every
page and game frame (performance.now, Date, requestAnimationFrame, timers, CSS and Web Animations); `Capture` steps it
exactly 1/30 s before each screenshot, so every frame is drawn. Typing, clicks and the cursor are driven on the same
timeline (`glide`, `setCursor`).

## Steps

1. Run a local server with demo data and the mock Builder (no AI key needed), e.g.
   `PORT=3349 BRB_DATA_DIR=/tmp/claude-0/demo2/data BRB_SNAPSHOTS=0 node server/index.js`
   (seed the official games with `node scripts/seed.js` against that data dir and make the made-up accounts used by the
   scripts: `MayaMakes` / `secret123`, a teacher for Oomba Live).
   Oomba Live is recorded on a second server whose game clock is slowed to the capture speed:
   `LIVE_CLOCK=0.055 PORT=3350 BRB_DATA_DIR=/tmp/claude-0/demo2/data-live node --import ./scripts/demo-video/slowclock.mjs server/index.js`
2. Record the clips (each takes `land` or `port`):
   - `node scripts/demo-video/rec-games.mjs land` - Gulp City, Atlas Quest, Would You Rather, Castle Clash
   - `node scripts/demo-video/rec-builder.mjs land` - a kid types an idea, the build and the automatic playtest, playing it
   - `node scripts/demo-video/rec-live.mjs land` - Oomba Live: picking a game, a phone joining, a question and the race
   - `node scripts/demo-video/rec-safety.mjs land` - sign-up with a made-up name, a friend code, the publish choices
3. Captions and cards: `node scripts/demo-video/cards.mjs` (teacher) and `node scripts/demo-video/cards-parents.mjs`.
4. Cut the silent masters: `node scripts/demo-video/assemble.mjs land|port` (teacher, into `/tmp/claude-0/demo/v2`)
   and `node scripts/demo-video/assemble-parents.mjs land|port` (into `/tmp/claude-0/demo/parents`). Each writes
   `timeline.json` (scene starts) and the captions (`.en.vtt`).
5. Music: `node scripts/demo-video/fit-music.mjs <teacher|parents> <track> [--start S] [--cut A,B] [--hit T]` writes the
   project's `music.wav`, exactly as long as the video with a 1.5 s fade out (`--hit T` puts the track's moment T, such as
   a downbeat, on the end card). `compose-music.py` makes the original synthesized track. Any third-party track needs
   a licence that allows commercial use and a row in `docs/media-credits.md` (and an on-page credit if it requires one).
   Both videos now use the site owner's track (AtlasAudio via Pixabay), with its bright section's first downbeat
   (101.16 s into the track) on each end card:
   `fit-music.mjs teacher <track> --hit 101.16 --fade-in 0.5` and `fit-music.mjs parents <track> --hit 101.16 --fade-in 0.5`.
6. Mix: `node scripts/demo-video/mix.mjs <teacher|parents>` (music only) writes `<prefix>-16x9.mp4`, `-9x16.mp4` and the
   720p `-web.mp4`, normalised to -16 LUFS. Copy the web cut, poster and captions to `public/video/`.
7. Check: `node scripts/demo-video/sheet.mjs 0.5 5x5 384 <video>` makes a contact sheet; look at it, and run
   `ffmpeg -i <video> -vf freezedetect=n=0.001:d=0.5 -an -f null -` over the game scenes (only still UI may freeze).

## Adding the voice-over (needs an OpenAI key)

The scripts are `teacher-vo.json` and `parents-vo.json` (each line has its start time in the video). With network access
to `api.openai.com` and the key in the environment:

```
OPENAI_API_KEY=... node scripts/demo-video/make-vo.mjs teacher
OPENAI_API_KEY=... node scripts/demo-video/make-vo.mjs parents
```

It makes one MP3 per line with the same model and narrator voice as the site's AI voices (`gpt-4o-mini-tts`, `coral`),
trims silence, speeds a line up a little (at most 1.12x) if it would run into the next one, then runs `mix.mjs --vo`:
the music is ducked by 18 dB under each line. Copy the new `-web.mp4` over the page's video.

## What is simulated

- All names are made up (MayaMakes, PixelPanda, Demo Teacher); nothing comes from real children.
- The local server has no AI key, so the Builder's build is made by the offline building blocks; `rec-builder.mjs`
  replays the page's live stream slowly with the AI Builder's step rows around the real version it made.
- Oomba Live runs on a slowed server clock so question timers don't run out while frames are shot.
