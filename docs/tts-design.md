# AI voices (text to speech): design

Status: the server part is built (config, `services/tts*.js`, `routes/tts.js`, migration `0042_tts`, `/admin/voices`,
warm-up, unit tests); the client part (SDK, play page, live pages, Hero, disclosures) is next. Branch `tts-voices` (worktree `.claude/work/wt-tts`, from `origin/main` 9c2121a; the
latest migration there is `0041_live_cohost`, so this work adds `0042_tts`).

Goal: official games, lessons and Oomba Live can read **site-, game- and teacher-written text** aloud with a hosted
voice (OpenAI's speech API) instead of the device's own voice. It is off by default. When it is off, or anything goes
wrong, everything works as it does today with the device voice.

Facts about the OpenAI API below come from memory and were **not checked here** (there is no key and no network in
the sandbox). Check them against OpenAI's docs before the owner turns this on:
`POST https://api.openai.com/v1/audio/speech`, JSON `{ model, input (max 4096 chars), voice, instructions
(gpt-4o-mini-tts only), response_format: mp3|opus|aac|flac|wav|pcm, speed }`. The models are `gpt-4o-mini-tts` (the
default, steerable with `instructions`), `tts-1` and `tts-1-hd`. The voices are alloy, ash, ballad, coral, echo,
fable, nova, onyx, sage, shimmer and verse, plus the newer marin and cedar. The voice speaks the language of the input
text. Price: about $0.015 a minute or per 1,000 characters (also unverified, so it is configurable).

---

## 1. Where speech comes from today

| Place | How it speaks | Text author | Frozen? |
|---|---|---|---|
| `public/sdk/brb-sdk.js` `speak()` / `stopSpeaking()` / `voice()` (lines ~523-731) | `speechSynthesis`, best voice from `pickVoice` (the `voice-pick:start/end` block), split into chunks of 180 characters or less, `onend` after the last chunk, a silent line on the first tap to unlock iOS | the game | **No.** `kit/SHIPPED.json` lists only kit versions 1.0.0/1.1.0 and their packs. The SDK is inlined into every frame by `server/services/frame.js` (`SDK_PATH`, read at boot) and is not SRI-pinned, so it may change. Keep the `voice-pick` block byte-identical, because `tests/unit/voice.test.js` checks the copies in word-peek and shark-plank against it. |
| SDK `installSpeakUpgrade()`: wrapper on `speechSynthesis.speak` | upgrades the voice/pitch of games' own utterances | the game | no |
| Oomba Kit `say()` (`kit/src/audio.js:92`; built into `public/vendor/oomba-kit/1.0.0` and `1.1.0`) | calls `BRB.speak(text, {lang, onend})`, waits for `onend` or a timer (`minMs*3+4000` once started), skipped when muted | the game | **Yes**: 1.0.0 and 1.1.0 are in SHIPPED.json, so not one byte changes. They keep working unchanged because the new behaviour sits behind `BRB.speak`. |
| `seed-games/word-hunt.html` (`speakLine`, l.1282) | `BRB.speak` | site (word lists, game strings) | no |
| `seed-games/word-peek.html`, `shark-plank.html` (`speakWith`) | `BRB.speak` on the site. Their own `speechSynthesis` code runs only when the file is opened on its own | site | no |
| `seed-games/atlas-quest.html` (l.1057) | `Oomba.say(country. Capital: … fact)`, then kit `say()`, then `BRB.speak` | site (data packs) | the kit is frozen, the game is not |
| `seed-games/hero-of-sunvale.html` | **Silent today.** `UI.say()` (l.8720) shows a typewriter card. `SND3.voice(pitch)` plays a beep "voice". Dialogue comes from `I18N` (`// ==== I18N START/END ====` markers, 13 locales, 472 keys in `en`) | site | no (it pins kit 1.1.0 by SRI, which does not change) |
| castle-clash, code-isle (`pip.say`) | speech **bubbles** only, never spoken. code-isle's `pip.say` text is the kid's own code output, so it must never be spoken | – | – |
| `public/js/live-common.js` `speak()`/`voiceFor()` (l.249) | parent page, `speechSynthesis` | teacher (question sets) | no |
| `public/js/live-play.js` `readQuestion()` (l.352) | Read-aloud button, plus automatic reading when the teacher's "Read questions aloud" (`acc.read`) is on | teacher | no |
| `public/js/live-quiz-step.js` (lesson homework quiz) | Read button, `speak(q + choices)` | teacher | no |
| Live projector (`public/js/live-host.js`) | does not speak. It has a game-sounds on/off switch only | – | – |
| Builder games (kid-made) | `BRB.speak` or `speechSynthesis` directly | **kid** | – |
| `server/builder/prompt.js`, `templates/word.html` | tell the Builder to use `BRB.speak` | kid's game | – |

Not spoken anywhere: chat, typed answers, names. They stay that way.

## 2. Getting server audio into a sandboxed game frame

The frame CSP has `connect-src 'none'` and **`media-src data: blob:`** (frame.js `frameCsp`). The frame cannot fetch,
but it can play a `blob:` URL. The site CSP (`app.js SITE_CSP`) has `media-src 'self' data: blob:` and
`connect-src 'self'`, so the parent page can fetch our server.

**Choice: the parent fetches the audio and the frame plays it** (not "the parent plays it"). This keeps `speak()`'s
whole contract inside the SDK: queue, cancel, `stopSpeaking`, volume, `onend`, `pagehide`, and the kit's ducking. A
game's mute and the frame's own autoplay unlock also stay where they are today.

### Wire

Frame to parent (`send('brb:tts', …)`, through the same `postMessage` as `brb:score`):
```
{ brb:1, type:'brb:tts', id:<int 1..1e9>, text:<string ≤ TTS_MAX_CHARS>, lang:<bcp47 ≤16>, role:<'narrator'|'friendly'|'bright'|'deep'|'wise'|'grumpy'>, rate:<0.5..2>, pre?:true }
```
Parent to frame: `frame.contentWindow.postMessage({ brb:1, type:'brb:tts', id, ok:true, buf:ArrayBuffer }, '*', [buf])`
or `{ …, ok:false, why:'off'|'filtered'|'busy'|'error' }`. The SDK accepts a reply only when
`e.source === window.parent` and the `id` is one it is waiting for.

`public/js/play.js`: add `'brb:tts'` to `TYPES` (shape check as above; role from a fixed list). Handle it only when
`pageData.tts` is set (see §3, the token) and the player's device choice is not "device voice" (§7). Then:
1. Look in a page-memory cache: `Map(key → Blob)`, LRU of 40 entries / 8 MB, keyed by `lang|role|rateBucket|text`.
2. Otherwise `POST /api/tts {tok, text, lang, role, rate}` → `{ u:'/tts/<hash>.mp3' }`, then
   `fetch(u)` → Blob (the browser HTTP cache also helps). At most 3 fetches at a time, aborted after 8 s.
3. Reply with `await blob.arrayBuffer()`, transferred (a new copy each time, because transfer detaches the buffer).
`pre:true` (prefetch) only fills the cache and sends no reply.

### SDK (`brb-sdk.js`, a new marked block `// tts-client:start … // tts-client:end` so unit tests can load it)
- `INIT.tts`: `{ langs:['en','fr',…] }` or absent. It is set by `/frame/:token` only when the server would accept TTS
  for this game (§3). With it absent, `speak()` is exactly today's code.
- `speak(text, opts)`: if `INIT.tts` is set and `ttsLocale(opts.lang || USER_LANG)` is in `INIT.tts.langs` and
  `opts.device !== true`, then:
  - push `{s, opts, lang, id}` onto a TTS queue (`queue:false` clears the queue and stops the current audio and
    `synth`, the same as today), send `brb:tts`, and **return true** (the same meaning as "started or waiting for the
    voice list").
  - Audio comes back: `new Blob([buf], {type:'audio/mpeg'})`, then `URL.createObjectURL`, then play it on **one shared
    `Audio` element** (unlocked on the first tap together with the silent utterance, using a tiny silent `data:` WAV).
    Set `volume`, then `onended` → revoke the URL, call `opts.onend`, start the next item.
  - **Fallback**: no reply within **4 s**, `ok:false`, a decode error or `play()` rejected → speak *this* line with the
    device voice (`startSpeech`) and pass `onend` on. If there is no device voice either, call `opts.onend` from a
    `setTimeout(…, 0)`. This is a small, documented extension of the contract: "after `speak()` returned true,
    `onend` always comes once" (the kit already copes, because it has its own timer). A reply that arrives after the
    fallback is dropped. The line is cached on the server anyway, so the next time is fast.
  - `stopSpeaking()` / `pagehide`: pause the audio, clear the TTS queue, `synth.cancel()`.
- Options: `opts.voice` (role, default `'narrator'`) and `opts.device` (force the device voice). `pitch` is ignored
  on the TTS path. Rate goes into 3 buckets: `slow` < 0.9 ≤ `normal` ≤ 1.1 < `fast`.
- New `BRB.prefetchSpeech(lines[], opts)`, a no-op without `INIT.tts`. Hero calls it with the whole dialogue card, so
  line 2 is ready before the kid taps.
- `ttsLocale(tag)`: `en-US|en`→`en`, `en-GB`→`en-GB`, `zh-Hant|zh-TW`→`zh-Hant`, otherwise the base language if it is
  a site locale (`pt-PT` → none, so the device voice is used: the site's pt is Brazilian), and none for anything else
  (`zh-CN` included).
- The `speechSynthesis.speak` wrapper for old games is **not** sent to TTS. Every seed game goes through `BRB.speak`
  on the site, and old Builder games are kid-made (always the device voice). Faking `SpeechSynthesisEvent`s would be
  fragile.

Other frame hosts (`live-common.js gameFrame`, the Studio preview, `/kit/frame`) get no `INIT.tts` in v1, so they
use the device voice. Live game frames could be added later with the same handler.

## 3. Server

### `server/services/tts.js` (shaped like `stt.js`)
- `PROVIDERS.openai({ text, voice, model, instructions, speed, signal, key })` → `Buffer` (mp3).
  `hooks.fetch('https://api.openai.com/v1/audio/speech', {method:'POST', headers:{Authorization:`Bearer ${key}`,
  'Content-Type':'application/json'}, body: JSON.stringify({model, input:text, voice, response_format:'mp3',
  ...(model==='gpt-4o-mini-tts' ? {instructions} : {speed})})})`. Map 429 → `TtsError('busy')` and other errors →
  `'provider'`. Timeout `TTS_TIMEOUT_MS` (15 s). Check the reply with `sniff()` (ID3/MPEG frame) and refuse anything
  that is not MP3.
- `PROVIDERS.mock({ text })`: a **real, valid, silent MP3** (a constant silent MPEG-1 Layer III frame repeated
  `clamp(text.length/12, 4, 200)` times, so headless Chromium can decode it, play it and fire `ended`). It is refused
  in production (config error, like `STT_PROVIDER=mock`).
- `ttsEnabled(cfg)` = `cfg.ttsEnabled && PROVIDERS[cfg.ttsProvider] && (provider==='mock' || !!ttsKey(cfg))`, where
  `ttsKey` = `TTS_API_KEY`, else `STT_API_KEY` **only if** `STT_PROVIDER==='openai'` and `TTS_PROVIDER==='openai'`.
- `localeOn(locale)`: enabled, the locale is in `TTS_LOCALES`, **and** it is switched on on `/admin/voices`
  (setting `tts.voices`, §5; **off by default**, so the owner listens before a language speaks).
- `speakable(text, { user })` → `null | 'long' | 'filtered'`. Steps: NFC, collapse whitespace, trim. Empty or
  > `TTS_MAX_CHARS` (default 600) → `'long'`. `hasProfanity(text)`, `personalInfo(text)` (emails/phones/addresses),
  `looksLikeLinkCode` → `'filtered'`. Contains the signed-in user's `display_name` or `username` (folded with
  `normalise`, only when 3 characters or longer) → `'filtered'`. These are backstops: the main guard is the context
  rule below.
- `cacheKey = sha256([provider, model, voice, instructions, locale, rateBucket, 'mp3', text].join('|'))` (hex). The
  instructions are part of the key, so changing a role's wording makes new audio.
- `synthesize({ text, locale, role, rate, ctx, pin })` → `{ hash, file }`:
  1. If the cache has it: update `last_used` (at most once an hour per hash), count a hit, return it.
  2. **Single flight**: `inflight: Map(hash → Promise)`, so 30 phones asking for the same live question make one
     provider call.
  3. Caps: `ttsUsage.blocked()` (daily characters `TTS_DAILY_CHARS`, then `aiBudget.ok('free')`) → `TtsError('site')`.
  4. Call the provider. Write `<dataDir>/tts/<hash[0..1]>/<hash>.mp3` (write to a temporary file, then rename). Add a
     `tts_cache` row. `ttsUsage.record(chars)` → `aiBudget.recordSpend('tts:<provider>', chars/1000 *
     TTS_USD_PER_1K_CHARS)`.
  5. Log `log('info','tts', {h: hash.slice(0,8), chars, locale, role, ctx, provider, ms, cached})`: **never the
     text, the user id or the IP**.
- `cleanup()` (a job every hour, and also after a write once the cache is more than 110% of the cap): when
  `SUM(bytes) > TTS_CACHE_MB`, delete the oldest `last_used` rows and files, **skipping `pinned=1`** (warm-up
  lines), until the cache is at or under 90%. If pinned rows alone are over the cap, the oldest pinned ones go too.
  Also delete orphan files and rows whose file is missing.

### `server/services/tts-voices.js` (roles, locales, samples)
- `ROLES = ['narrator','friendly','bright','deep','wise','grumpy']`. Default role→voice: narrator = the per-locale
  choice (default `coral`), friendly `nova`, bright `shimmer`, deep `onyx`, wise `sage`, grumpy `ash`. The admin can
  change both.
- `VOICES` (the allowed OpenAI voices): alloy, ash, ballad, coral, echo, fable, nova, onyx, sage, shimmer, verse,
  marin, cedar.
- Instructions (English, used only with gpt-4o-mini-tts) = BASE + ROLE + ACCENT[locale] + RATE:
  - BASE: "You are reading a children's game aloud to kids aged 8 to 14. Speak clearly and warmly at a calm,
    friendly pace. Never whisper, shout or sound scary. Read exactly the words given."
  - ROLE: narrator "a warm storyteller"; friendly "a cheerful, kind helper"; bright "a lively young character, full of
    wonder"; deep "a calm, deep-voiced, kindly grown-up"; wise "a gentle, wise older person"; grumpy "a silly, grumpy
    villain in a cartoon: theatrical and funny, never frightening".
  - ACCENT: en "American English"; en-GB "a gentle British English accent"; es "Spanish from Spain"; pt "Brazilian
    Portuguese"; fr "French from France"; de "standard German"; it "standard Italian"; nl "Dutch from the
    Netherlands"; ru "standard Russian"; ja "standard Japanese"; ar "clear Modern Standard Arabic"; he "modern Israeli
    Hebrew"; zh-Hant "**Taiwanese Mandarin (國語), not Cantonese**".
  - RATE: slow → "a little slower than usual"; fast → "a little quicker than usual".
- **zh-Hant = Mandarin (Taiwan)**, because the SDK speaks zh-Hant as Mandarin (`VOICE_REGIONS['zh-hant'] =
  ['tw','cn','hk']`, Hong Kong last because those voices speak Cantonese). The input is Traditional characters; the
  instruction asks for Taiwanese Mandarin. Check this by ear on the admin page.
- he/ar: right-to-left text needs no special handling (it is plain Unicode input).
- Samples: one fixed sentence per locale with the same meaning in each: "Hi! I'm your guide at Oomba Academy. Let's
  explore, solve puzzles and have fun together!", kept as `tts.sample` in each `server/i18n/locales/<locale>.json` (so
  translators own it) and always read with `tFor(<voice locale>)`, never the admin's UI language.

### Contexts (the main safety rule: what text may be spoken)
`POST /api/tts` body `{ ctx, … }`:
- `ctx:'game'` (`tok, text, lang, role, rate`): `tok` = `signToken({k:'tts', g, v, u, l}, 2h)` minted by the play page
  route (`routes/games.js`, in `page-data` as `tts:{tok}`) **only for official games** (`g.source==='seed' && owner
  === OFFICIAL`, published) and only when `ttsEnabled()`. The server checks: the token is valid; `tok.u` equals
  `req.user?.id` (the same binding as `/frame/:token`); the game is still official and viewable; the locale is on; the
  text passes `speakable`. **Kid- or teacher-made Builder games never get a token**, so they keep the device voice.
- `ctx:'live'` (`sid, i, tok` = the player's seat token or the host/co-host token): **text by reference**. The server
  builds `q + ". A: c1. B: c2 …"` from the run's question `i` in the set's language. It refuses `i` beyond the
  question being shown now, so upcoming questions never leak. The text is the teacher's (or an AI-drafted set the
  teacher approved).
- `ctx:'lesson'` (`clId, stepId, i`): text by reference from the quiz step's set, behind the same access check as
  `GET /api/lessons/:clId/steps/:stepId/quiz`.
- `ctx:'admin'` (`/api/admin/tts/*` only): samples and warm-up. It ignores the per-locale switch, so the admin can
  listen before turning a locale on.

Answer: `200 {u:'/tts/<hash>.mp3'}`, or `404 {code:'off'}`, `422 {code:'filtered'|'long'}`,
`429 {code:'fast'|'site'}`, `503 {code:'busy'}`. The client treats every non-200 as "use the device voice".

`GET /tts/:hash.mp3` (`routes/tts.js`): `^[0-9a-f]{64}$`, a row must exist (404 otherwise), and it is served only to
`Sec-Fetch-Site: same-origin|none` (no hotlinking). Headers: `Content-Type: audio/mpeg`, `Cache-Control: private,
max-age=2592000, immutable` (the content is addressed by its hash), `X-Content-Type-Options: nosniff`,
`Cross-Origin-Resource-Policy: same-origin`. It supports Range requests (via `res.sendFile`) for Safari.

Request origin: the global `csrfCheck` already guards POSTs (same-origin `Origin`). The signed token (game), the seat
token (live) or the session plus access (lesson) is the "must come from a game page" check. There is no
referrer-based check (we send `Referrer-Policy: same-origin`, but referrers can be stripped).

Rate limits (`ratelimit.js allow`):
- `tts:<user|ip>` 120 requests a minute (hits are cheap).
- **Misses**: `tts-gen:<user|ip>` `TTS_PER_MINUTE` (20) a minute, and `tts-gen-ip:<ip>` 200 every 10 minutes (a
  school behind one address).
- Site-wide: `TTS_DAILY_CHARS` (300,000) plus the AI budget. A 429 means the device voice is used, never an error
  toast.

### Data (migration `0042_tts`)
```sql
CREATE TABLE IF NOT EXISTS tts_cache (hash TEXT PRIMARY KEY, bytes INTEGER NOT NULL, chars INTEGER NOT NULL,
  provider TEXT NOT NULL, model TEXT NOT NULL, voice TEXT NOT NULL, locale TEXT NOT NULL, role TEXT NOT NULL,
  pinned INTEGER NOT NULL DEFAULT 0, hits INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, last_used INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS tts_cache_lru ON tts_cache(pinned, last_used);
CREATE TABLE IF NOT EXISTS tts_usage (day TEXT PRIMARY KEY, calls INTEGER NOT NULL DEFAULT 0, chars INTEGER NOT NULL DEFAULT 0,
  hits INTEGER NOT NULL DEFAULT 0, fails INTEGER NOT NULL DEFAULT 0);
```
No text and no user ids are stored. The admin choices live in the existing `settings` table (`setting('tts.voices',
JSON)`): `{ locales:{ en:{on:false, narrator:'coral'}, … }, roles:{ friendly:'nova', … } }`, and every change is
written with `audit()`. `tts_usage` rows older than 90 days are deleted (the `stt-usage` retention pattern).

### Config (`server/config.js`)
| Env | Default | Meaning |
|---|---|---|
| `TTS_ENABLED` | off (`parseFlag`) | the owner's switch |
| `TTS_PROVIDER` | `openai` | `openai` or `mock` (mock is refused in production) |
| `TTS_API_KEY` | – | falls back to `STT_API_KEY` only when `STT_PROVIDER=openai` |
| `TTS_MODEL` | `gpt-4o-mini-tts` | or `tts-1` / `tts-1-hd` (then `speed` is sent instead of `instructions`) |
| `TTS_LOCALES` | all 13 | the ceiling; `/admin/voices` switches locales inside it |
| `TTS_MAX_CHARS` | 600 | per request (OpenAI's limit is 4096) |
| `TTS_CACHE_MB` | 512 | the disk cap for `<dataDir>/tts` |
| `TTS_DAILY_CHARS` | 300000 | generated characters a day, site-wide |
| `TTS_PER_MINUTE` | 20 | generations a minute per user (or IP) |
| `TTS_USD_PER_1K_CHARS` | 0.015 | cost estimate for `ai-budget` |
| `TTS_TIMEOUT_MS` | 15000 | provider timeout |

## 4. Voices: summary
- Narrator: one per locale, chosen on `/admin/voices` (default `coral`). The other roles share one voice across all
  locales (OpenAI voices are multilingual).
- Hero of Sunvale (`seed-games/hero-of-sunvale.html`): a new marked block `// ==== VOICES START ==== const
  VOICE_ROLES = { story:'narrator', granny:'wise', queen:'wise', bo:'deep', oakley:'deep', finn:'deep',
  plum:'deep', chief:'deep', tilly:'friendly', ivy:'friendly', hazel:'friendly', maple:'friendly',
  marigold:'bright', hero:'bright', snarlwick:'grumpy', vil:'friendly' } // ==== VOICES END ====`. `UI.say` speaks
  each line as it is shown (`BRB.speak(line, {voice: VOICE_ROLES[npc] || 'narrator', lang: LANG})`) and calls
  `BRB.prefetchSpeech(lines)` when the card opens. `dialogNext` → `BRB.stopSpeaking()` before the next line. The
  intro and end cards use narrator. The NPC beep (`SND3.voice`) stays when TTS is off for this game (no `INIT.tts`),
  and is skipped when a line is spoken. Hero's existing Sound switch (`BRB.sfx.muted`) also silences voices. **No
  dialogue line uses the player's name** (checked: the `d.*` placeholders are only `{n}` and `{total}`).
- Word games and Atlas Quest speak through `BRB.speak` as they do now (narrator); nothing changes in them.

## 5. Admin voice page `/admin/voices`
- In `routes/admin.js`, behind `requireAdmin`, with a link from `/admin`. A server-rendered table: **rows = the 13
  locales, columns = the 13 voices**, ▶ in each cell, and per row an **On** switch, a **Narrator** select and the
  sample text (with `dir` set for he/ar). Below the table: the role → voice selects, the provider/model, the cache size
  and today's characters/budget, and the TTS on/off state from env (with a clear "TTS_ENABLED is off" notice).
- `POST /api/admin/tts/sample {locale, voice, role?}`: `ctx:'admin'`, the narrator instructions plus the locale accent,
  generated on demand and cached (pinned) → `{u}`. Client: `public/js/admin-voices.js` plays it with `new Audio(u)`.
- `POST /api/admin/tts/settings {locales:{…}, roles:{…}}`: checked against `ROLES`/`VOICES`/`TTS_LOCALES`, saved
  to `setting('tts.voices')`, written with `audit()`. It takes effect without a redeploy (each request reads it; an
  in-memory copy is refreshed when it is saved).
- It works with `TTS_PROVIDER=mock` (silent mp3), so the e2e test can drive it.

## 6. Warm-up
- `server/services/tts-lines.js`: `gameLines(slug)` → `[{locale, role, text}]`.
  - For seed games with `// ==== I18N START/END ====` (Hero; brick-drop and castle-clash have them too, but do not
    speak), it reads `seed-games/<slug>.html` **from the repo on disk** (trusted, never the DB copy) and evaluates
    only that block with `node:vm` (`runInNewContext` with an empty context and `timeout: 2000`). It takes the spoken
    keys (Hero: `/^(d|say|hint|intro|end|mg)\./` plus `npc`-specific `idle`). Plural objects are skipped, and so are
    strings with `{…}` placeholders. Each locale falls back to `en-GB`→`en` the way the game's `t()` does, and the
    role comes from the `VOICES` block.
  - Atlas Quest (optional, off by default, large): the facts from `public/vendor/data/atlas-quest/<ver>/<locale>.js`.
  - The word games are cached naturally on first use (thousands of single words; not worth warming).
- `POST /api/admin/tts/warm {games:['hero-of-sunvale'], locales:[…on…]}` starts one background run (only one at a
  time). `GET /api/admin/tts/warm` → `{running, total, done, cached, skipped, failed, chars, usd, stopped:'budget'|null}`.
  The page polls it every 2 s. Before starting it shows an estimate (`chars not yet cached × price`). Two at a time;
  it stops when `ttsUsage.blocked()` or the budget says no, and pins its rows. On Hero, per locale, that is about 6-8k
  characters (the `d.*` keys alone are 53 keys / ~3.1k characters in `en`), so about 90k characters for 13 locales,
  or about $1.40 at the default price.

## 7. Settings, consent, disclosure
- **Kids (per device)**: on the play page bar, a **🔊 Voices** button, shown only when `pageData.tts` is set, opens a
  sheet with "AI voices" / "This device's voice" (stored in `localStorage['oomba:voices']`, default AI) and the
  disclosure: *"Characters in this game are voiced by a computer (AI voices from OpenAI). They read only the game's
  own words, never anything you type or your name."* With "device", play.js answers `brb:tts` with `ok:false,
  why:'off'` at once. The game's own mute still silences everything.
- **Teachers**: Live settings (`classlive-settings.js`) get `voices:'ai'|'device'` (default `ai`, kept in
  `live_prefs`) next to the existing "Read questions aloud". It applies to the players' Read button and to the
  **projector**, which can now read the question aloud when the host's Sound is on and "Read questions aloud" is on
  (`live-host.js`, `ctx:'live'` with the host token). A disclosure line goes under the setting. The lesson quiz step uses
  the per-device choice (`localStorage['oomba:voices']`).
- **Disclosure in every one of the 13 locales** (`npm run i18n:check`): the parents page `info.parents.ai.p4` (*"AI
  voices: some official games, lessons and Oomba Live can read their own words aloud with a computer-made voice from
  OpenAI. Only text written by us, a game's makers or your child's teacher is sent, never what your child types or
  says, and never their name. Your child can switch to the device's own voice."*), the privacy page
  `info.privacy.children.p6`, the sound sheet, the live settings hint and the admin page. Bump `LEGAL_UPDATED` in
  `routes/info.js`. Company name `OpenAI` stays untranslated (the `{provider}` variable, like `sttCompany()`).
- Nothing is sold and there are no ads. No consent screen is needed because no personal data goes to OpenAI (only
  site text, from our server's address). This is still listed in `docs/legal-review.md` for the owner to confirm.

## 8. Tests
Unit (`node --test`, all with `hooks.fetch` stubbed; no network, no key):
- `tests/unit/tts.test.js`: enabled-gating matrix (`TTS_ENABLED` off; no key; `STT_API_KEY` fallback only with
  `STT_PROVIDER=openai`; mock refused in production); the openai request shape (URL, method, JSON fields,
  instructions only for gpt-4o-mini-tts, `speed` for tts-1, mp3); 429→busy, 500→provider, timeout→busy, a non-mp3
  reply refused; `cacheKey` is stable and changes with each part; `speakable` (empty, too long, profanity, email/phone,
  the user's own name and username, RTL text accepted); single flight (5 parallel → 1 provider call); a cache hit
  makes no provider call; LRU cleanup (oldest first, pinned kept, orphans removed); daily-character cap and AI budget
  block → `'site'`; `recordSpend('tts:openai', …)` amount; the **log never contains the text** (log hook captured);
  settings load/save/validate and audit; `SAMPLES`/`ACCENT` cover all 13 locales with no placeholders; every role maps
  to an allowed voice.
- `tests/unit/tts-route.test.js`: POST contexts (a game token for an official game is accepted; a Builder game is
  refused; the token's user ≠ the session user is refused; an off locale → 404; live `i` > current → refused; lesson
  without access → 404; admin-only endpoints → 403 for non-admins); GET `/tts/<hash>.mp3` headers, 404 for an
  unknown hash, cross-site refused; rate limits (the 21st miss in a minute → 429).
- `tests/unit/tts-lines.test.js`: Hero extraction has lines for all 13 locales, no `{`, roles valid; the
  `VOICE_ROLES` block parses; every NPC id used by `npcSay` has a role.
- `tests/unit/voice.test.js` (extend): the SDK `tts-client` block with stubbed `send`/`Audio`: returns true and sends
  `brb:tts`; a reply → plays, `onend` once; no reply in 4 s (fake timers) → device fallback; `ok:false` → fallback;
  no device voice → `onend` still once; `queue:false` cancels; a late reply is ignored; `ttsLocale` mapping. Keep the
  `voice-pick` agreement test unchanged.
- `tests/unit/frame.test.js` or similar: `INIT.tts` only for official games with TTS on.

E2E (Playwright, a new `tests/e2e/tts.spec.js`; `playwright.config.js` env adds `TTS_ENABLED:'1',
TTS_PROVIDER:'mock', TTS_API_KEY:''`. Every locale is **off** in the DB by default, so the existing specs, e.g.
`seeds.spec.js` expecting `BRB.speak(...) === false` with no voices, are unaffected):
1. The admin opens `/admin/voices`: 13×13 grid; ▶ on (fr, nova) → a request for `/tts/<hash>.mp3` returns 200
   `audio/mpeg`; switch **en** on, narrator `sage`, save → reload shows the choice.
2. A kid plays **Word Hunt** (en), taps "Read to me" → `POST /api/tts` (body has no display name) → the frame plays
   the audio (wait for the `ended` it reports back); the Voices sheet shows the disclosure; choose "This device's
   voice" → no more `/api/tts` requests.
3. **Hero of Sunvale** smoke (existing hero spec helpers): talk to Granny → `/api/tts` with `role:'wise'`, and the
   dialogue still advances when the request is blocked (`page.route` abort → fallback, `onend` path).
4. **Live**: a teacher runs a quiz with Read aloud; a player taps Read → `ctx:'live'`; a request for the next question
   index → 4xx.
5. **Warm-up**: the admin warms Hero for `en` → status reaches `done > 0`, `failed 0`; a second run is all `cached`.
6. `/parents` and `/privacy` show the AI-voice text (en + one RTL locale).
Run as: `TMPDIR=/tmp/bx E2E_PORT=<free> BRB_SNAPSHOTS=1 BRB_CHROMIUM=… npx playwright test tts.spec.js`.

## 9. Files to change
New:
- `server/services/tts.js`: providers, gating, `speakable`, cache, single flight, cleanup.
- `server/services/tts-voices.js`: roles, voices, instructions, accents, samples, settings load/save.
- `server/services/tts-usage.js`: daily characters/hits, caps, `recordSpend`, retention job.
- `server/services/tts-lines.js`: seed-game line extraction and the warm-up runner.
- `server/routes/tts.js`: `POST /api/tts`, `GET /tts/:hash.mp3`.
- `public/js/tts.js`: shared client helper (`ttsFetch(ctx…)` → Blob/URL; the device-choice getter/setter; the
  Voices sheet).
- `public/js/admin-voices.js`: the admin grid, settings form, warm-up progress.
- `tests/unit/tts.test.js`, `tests/unit/tts-route.test.js`, `tests/unit/tts-lines.test.js`, `tests/e2e/tts.spec.js`.

Changed:
- `server/db.js`: migration `0042_tts` (renumber if main moved on).
- `server/config.js`: `TTS_*` (and the validation errors: provider, mock in production).
- `server/app.js`: mount `routes/tts.js`; register the cleanup job.
- `server/routes/games.js`: the `tts` token in play `page-data`; `INIT.tts` in `/frame/:token` (official + on).
- `server/routes/admin.js`: `/admin/voices` page plus `/api/admin/tts/{sample,settings,warm}`; a link from `/admin`
  and the stats page line for `tts:*` spend.
- `server/routes/live.js` (and `classlive-sessions.js` helpers): `ctx:'live'`/`'lesson'` text lookup; the
  `voices` live setting.
- `server/services/classlive-settings.js`: the `voices` field.
- `server/routes/info.js`: `LEGAL_UPDATED`, the provider variable for the voice paragraphs.
- `public/sdk/brb-sdk.js`: the `tts-client` block, `opts.voice`/`opts.device`, `BRB.prefetchSpeech`, the shared
  Audio unlock (the `voice-pick` block untouched).
- `public/js/play.js`: `brb:tts` in `TYPES` plus its handler; the Voices bar button.
- `public/js/live-common.js`: `speak()` tries TTS (ctx live) and falls back to the device voice; `canRead()`.
- `public/js/live-play.js`, `public/js/live-quiz-step.js`, `public/js/live-host.js`: use it, and show Read when TTS is
  available even without a device voice.
- `seed-games/hero-of-sunvale.html`: the `VOICES` block, speaking in `UI.say`/intro/end, prefetch (re-seed; kit pins
  unchanged).
- `server/i18n/locales/*.json` (all 13, en-GB only where the wording differs) plus `server/i18n/notes.json`:
  `play.voices.*`, `live.settings.voices*`, `admin.voices.*`, `info.parents.ai.p4`, `info.privacy.children.p6`.
- `playwright.config.js`: the TTS mock env.
- Docs: `docs/decisions.md` ("AI voices"), `docs/legal-review.md` (OpenAI usage-policy AI-voice disclosure; not a
  personal-data processor here; check the API facts above), `docs/sdk.md` (Speech: the TTS path, the `onend`
  guarantee, `voice` roles, `prefetchSpeech`, the `brb:tts` message), `docs/safety.md` (what may be spoken),
  `docs/live-protocol.md` (the `voices` setting), `docs/status.md`.

Not changed (frozen): `kit/SHIPPED.json`, `public/vendor/oomba-kit/1.0.0/**`, `public/vendor/oomba-kit/1.1.0/**`
(including their packs). `kit/src/*` is not needed for v1.
