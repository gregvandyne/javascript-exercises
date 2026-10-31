# How Oomba Academy keeps kids safe

Oomba Academy is a website where kids play web games and build their own by chatting with an AI Builder.
We treat **every game as untrusted code** and **every message to the Builder as untrusted input**.
This page explains, in plain words, every layer of protection that exists today, and where it lives in the code.

---

## 1. The sandbox: games are kept in a locked box

Every game, whether it came from our team or from a kid, runs the same way.

- A game runs inside an `<iframe>` with `sandbox="allow-scripts allow-pointer-lock allow-orientation-lock"`.
  It **never** gets `allow-same-origin`, so the game cannot read the website's cookies, storage or pages.
  The Studio preview uses the exact same sandbox as the play page.
- The game is served from its own route (`/frame/<token>`) with a strict Content Security Policy:
  no network at all (`connect-src 'none'`), no forms (`form-action 'none'`), no other pages may embed it,
  scripts only inline, from `cdnjs.cloudflare.com`, or from the site's own `/vendor/three/` folder (the one 3D library,
  named by the site's origin plus that path, so no other script on the site can run in a game), styles and fonts only
  from Google Fonts.
- The token in the frame link is signed and expires. Studio previews use a preview token, which also switches
  saving off.
- **Two network gaps the CSP cannot cover are closed in code, before any game code runs** (`public/sdk/brb-sdk.js`,
  the "Lockdown" block):
  - **WebRTC.** No browser has a CSP directive for WebRTC, so `connect-src 'none'` would not stop a data channel.
    The SDK deletes every WebRTC entry point (`RTCPeerConnection`, `webkitRTCPeerConnection`, `RTCDataChannel`,
    `RTCSessionDescription`, `RTCIceCandidate` and the rest) from the frame's window, non-restorable.
  - **Borrowing another window.** A game could build an `<iframe>`/`<object>`/`<embed>` at runtime and reach a
    fresh window through it (a new browsing context inherits the sandbox and CSP, but WebRTC lives outside the CSP).
    The SDK makes `contentWindow`/`contentDocument`/`getSVGDocument()` return `null`, and screens every DOM-insertion
    path (`appendChild`/`insertBefore`, `insertAdjacentElement`, `innerHTML`/`outerHTML`, `insertAdjacentHTML`,
    `setHTMLUnsafe`, `Range.insertNode`/`surroundContents`, `document.write`, …) — including a plain wrapper that
    hides a frame among its descendants — so a frame element can never join the page; a `MutationObserver` backstop
    pulls out anything that still reaches the document. With no child browsing context, `window.frames` stays empty
    and `window[0]` stays `undefined`, so there is no other window to borrow.
- Games can only talk to the website through a tiny helper called `window.BRB` (see `docs/sdk.md`).
  The page around the game checks where every message came from and what shape it has, and the server checks
  and rate-limits everything again.
- Before a game is stored or served we strip things a game never needs: `<base>`, `<meta http-equiv>`,
  `<iframe>`, `<object>`, `<embed>`, external `<link>`s (except Google Fonts) and form targets.
- **Code libraries are pinned.** The CSP allows scripts from `cdnjs.cloudflare.com`, but the scanner only passes a
  short, reviewed list of exact library files (empty today). Any other cdnjs script or import-map entry is *flagged*
  for a human, because the scanner cannot read a big minified bundle. (WebAssembly, Workers and `blob:`/`data:` script
  loading stay blocked by the CSP — we do **not** add `wasm-unsafe-eval` or `worker-src`.)
- **3D games use one self-hosted, pinned Three.js** (r185.1, in `public/vendor/three/0.185.1/` with its MIT licence).
  A game loads it with exactly one import map whose `integrity` lines carry the files' sha384 hashes, so a changed file
  would not run (in browsers that check import-map integrity: Chrome 127+, Safari 18+, Firefox 138+). The scanner passes
  that exact form and **fails** every other way of loading Three.js (another version, another host, no map, no integrity,
  add-ons). There are no add-ons and nothing can be loaded by URL, so a 3D game is still one self-contained file.
  The files are served with a year of immutable caching and `Access-Control-Allow-Origin: *` (the opaque-origin frame
  loads them as module scripts, which needs CORS); they are public library files, never anything about a player.
- Each version must be under 2 MB.
- **Cover pictures and playtests run the game in a throwaway browser.** The headless Chromium that takes screenshots
  runs the game in the very same wrapper players get (sandboxed iframe + the frame CSP), launched from a scrubbed
  environment and an empty temp working directory so it never sees the server's secrets or folder. On the recommended
  AWS/Azure setup (`deploy/docker-compose.yml`) it always runs in the **screenshot worker**, a separate container with
  no database, no data disk, no secrets but its own token, no internet and a read-only file system
  (`server/shots-worker.js`, used when `SNAPSHOT_URL` is set); on Render today it runs inside the app's container.
  The 3D library is answered from the code's own `public/vendor` files in both cases, never fetched from anywhere.
  Every other request is aborted, and WebRTC is removed in the screenshot browser (the one outbound path routing
  cannot abort), so a game it renders has no way out of that container.

Code: `server/services/frame.js`, `server/services/sanitize.js`, `server/services/vendor.js`, `server/routes/games.js`, `public/sdk/brb-sdk.js`.

## 2. The scanner: a robot checks every version

Every version of every game is checked by a static scanner the moment it is made (`server/services/scanner.js`).
A version gets one of three results:

| Result | What it means |
|---|---|
| ✅ **pass** | Fine. It can be shared at any level. |
| ⚠️ **flag** | OK for "Only me" and "Friends". Before everyone can play it, a person must look. |
| ⛔ **fail** | Cannot be shared at all until it is fixed. |

It **fails** a version that tries to reach the internet (`fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource`,
`sendBeacon`, `import()`, WebRTC), escape the box (`window.top`, `parent.location`, `window.open`, navigating away),
read cookies, build code from text (`eval`, `new Function`, string timers), ask for the camera, microphone,
location or notifications, link or load scripts from outside, submit forms, show rude words, or ask players
for personal details ("type your address").

It also **sees through the obvious ways to hide those names from a word search.** Before the word rules run, the
scanner rebuilds pieces that were joined together — `'RTC'+'PeerConnection'`, `String.fromCharCode(...)`,
`['f','e','t','c','h'].join('')`, `atob('...')` — and checks reaching a feature by name on the window
(`window['fetch']`, `self['RTCPeerConnection']`). A blocked name that only appears once the pieces are joined is
treated as a deliberate dodge and **fails**. (These obfuscations are also dead on arrival inside the frame — the CSP
blocks the network ones and the SDK lockdown removes WebRTC — but the scanner should never quietly pass them.)

It **fails** a 3D game that loads Three.js any way but the one pinned, self-hosted import map (see section 1), with a
message that tells the Builder exactly what to use instead.

It **flags** (so a person looks before it can go Public) building or looking inside a frame
(`createElement('iframe')`, `.contentWindow`, `window.frames`, `document.write`) — all of which the SDK lockdown
already neutralises — any **cdnjs library that is not on the pinned allow-list**, fast flashing (anything that flips
colours more than three times a second, in code or CSS), hidden text, and anything that looks like a phone number or
email.

In the Studio the result is shown under the preview in plain words. A failed version has a
**"Ask the Builder to fix it"** button that sends the problems back to the Builder.

## 3. Screening: every Builder message is checked before the AI sees it

Before any AI model reads a kid's message, it goes through two checks (`server/builder/screen.js`):

1. **Keyword pre-filter.** Catches attempts to change the Builder's rules ("ignore previous instructions",
   "you are now…", "system prompt", "developer mode", fake `<system>` tags), rude words, personal details
   (phone numbers, emails, addresses, "make a game that asks for your address"), links, and chat between players.
2. **Classifier.** With an API key this is a fast, cheap Claude model (`claude-haiku-5-5`) that answers with a
   fixed set of categories. Without a key, a rules-based classifier is used instead. The rules also run as a
   backstop when the model is available. Kids may write in any of the site's languages: the classifier is told that
   messages can be in any language, mixed, misspelled or transliterated, and judges the meaning by the same rules. The
   keyword rules are English, so without an API key other languages are checked by the per-language word lists only.
   Refusals are shown in the kid's language.

Refused topics: sexual content, gore and graphic or real-world violence, horror and jump-scares, hate and bullying,
self-harm, drugs, alcohol and smoking, gambling (casinos, betting, loot boxes, paying real money), real people
(celebrities, YouTubers, athletes, politicians, named people the child knows), brands and copyrighted characters
(Mario, Pokémon, Minecraft, Fortnite, Disney, Marvel, Spider-Man, Sonic, Roblox and many more), personal information,
chat between players, links, and attempts to change the Builder's rules.

Tricks are undone before checking: leetspeak (`1gn0r3`), spaced or dotted letters (`m i n e c r a f t`, `p.o.k.e.m.o.n`),
invisible characters, accents and look-alike letters from other alphabets.

**What is allowed (on purpose):** cartoon slapstick ("kill the zombies in a cartoon way", bopping robots with pillows,
splatting slime), friendly-spooky themes (a silly ghost), sports, cooking, animals, space shooters with silly aliens,
learning games. Words like "kill" or "shoot" alone are fine in a cartoon game; they are refused when aimed at
real people ("shoot the kids in my class").

A refusal is always kind and short, says what Oomba Academy can't have, and suggests something else to build
("How about an original hero, like a jumping fox called Zip? 🦊"), with tappable ideas. For self-harm the Builder
gently tells the child to talk to a grown-up they trust. Refused messages:
- never reach the model, now or in later turns;
- do not use up a daily Builder turn;
- are written to the audit log (`builder.refused`, with the category).

The tests in `tests/safety/screening.test.js` hold 70+ adversarial prompts that must be refused and 40 ordinary
kid prompts that must not be.

## 4. The Builder follows fixed kid rules

The Builder's instructions are fixed in the server (`server/builder/prompt.js`); nobody can edit them from the website,
and messages cannot change them. They include the kid rules: no chat between players, never collect names or other
personal details, no links, no real brands or real people, no copyrighted characters, no gore, no horror or jump-scares,
no gambling mechanics, no fast flashing; cartoon slapstick is fine; learning twists are encouraged.

Every game the Builder writes goes through the sanitizer and scanner. If the scan fails, the problems go straight back
to the Builder to fix (a limited number of times). Every change is a new version; history is never rewritten.

The Studio's "Behind the scenes" steps card shows the AI's one-line plan (the notes it writes for the version, shown
while the code is still coming, so also for an edit that then fails; written in the child's language, cleaned and
capped like version notes, rendered as text). The model's internal thinking is never shown or stored; the card only
notes that a thinking block happened.

Limits: 60 Builder turns per person per day by default (`BUILDER_DAILY_TURNS`), a maximum length per turn, and a rate
limit on the chat endpoint. Accounts can have building switched off.

**Looking facts up on the web** (`BUILDER_WEB_SEARCH=1`, off by default; `server/builder/search.js`). The Builder may
use Anthropic's web search tool to get a real-world fact right. Adult, dating, gambling, gore and hate, forum and
imageboard, social and messaging, AI-companion, user-video, drug and piracy sites are blocked in every request (the
Console's own setting can hold the same list). At most 4 searches a build (3 per request). Each query is checked as it
finishes (word rules and personal details; a bad one stops the round and is logged as flagged, personal details as
`[redacted]`); what a round found (queries, titles, sites, the short quotes it cited; page text itself is encrypted)
is checked by the word rules and a separate model check, and the chat text written after a search is held back until
then. Kids see only a "Looking something up" step: never a query, a site or a link, and links are stripped from the
chat. Games are scanned as always. Admin › Web searches lists every search for 90 days, with no user name or id.

**Speaking instead of typing** (on only when `STT_API_KEY` is set; `server/services/stt.js`). The 🎤 button records at
most 60 seconds; the clip goes to our server (signed in, the game's owner, 8 a minute and 60 a day, 1.5 MB, audio
types checked by their first bytes) and on to the speech-to-text provider. The words come back with rude words
starred and land in the chat box for the child to check; they are only sent when the child presses Send, and then they
are screened like typed text. The clip lives in memory for that one request and is never stored or logged. The
microphone is allowed on the Studio page only (`Permissions-Policy`), never in the game frame.

*Live mode* (`server/services/stt-live.js`; off with `STT_LIVE=0`): the words show in the box while the child speaks.
The page streams the mic as 16-bit PCM over a same-origin WebSocket to our server, which relays it to the provider's
realtime API; the key never reaches the browser. The socket has the same rules as the upload: Origin checked (no
cross-site sockets), signed in, a kid's real account, the game's owner, the Builder on, 8 clips a minute (the same
count), 60 a day, the site's minutes and the AI spending caps, one mic at a time per account, at most 60 seconds of
audio (counted from the bytes received), frames of at most 64 KB, and it stops after 10 silent seconds. Every message
to the page is the whole text so far, tidied and with rude words starred, and the newest word of every unfinished
part is held back until the next one starts, so no rude word or its first letters ever shows. While listening the box is read-only; only the
final words are announced to screen readers. Audio frames are forwarded and dropped, never stored; the log line has
numbers only. If the live link fails, the recording kept in the page's memory is uploaded once instead.

## 5. Uploads: pictures and files for inspiration

Builders can add pictures and files in the Studio chat (📎, drag and drop, or paste) as **inspiration only**.

- **What is allowed:** pictures (PNG, JPEG, WebP, GIF) up to 5 MB; PDFs up to 5 MB; text files (TXT, MD, CSV, JSON)
  up to 200 KB. At most 4 per message and 30 per game. The type is decided by the file's real signature (its first bytes),
  not by its name. SVG and HTML are never accepted (even when renamed to `.txt`).
- **Hidden data is removed first.** Photos often carry the place they were taken. We strip it before saving:
  for JPEG all APP1–APP15 segments (EXIF, GPS, XMP, IPTC) and comments; for PNG the `tEXt`, `iTXt`, `zTXt` and `eXIf`
  chunks; for WebP the `EXIF` and `XMP` chunks.
- **Pictures are checked.** With an API key, every picture is looked at by a vision classifier. Pictures of real
  people's faces, private details (school names, addresses, documents, licence plates) or anything not suitable for
  kids are refused kindly and deleted. Without a key, pictures are accepted (metadata is still stripped).
- **Text is checked.** Text files, and the text we can read from PDFs, go through the same pre-filter as chat messages.
- **Private.** Uploads are stored on the server's disk (`<data dir>/uploads/<game>/<id>`), never in the chat transcript.
  Only the game's owner and admins can open them, through a checked route that sends them `inline` with
  `X-Content-Type-Options: nosniff` and a CSP that blocks scripts. Everyone else gets "not found". File names are cleaned.
- **Never copied into games.** The Builder is told to use uploads for ideas only (colours, characters, levels, rules) and
  to draw original art. It must never put the photo itself in a game or draw real people from it. Uploads go to the
  model only on the turn they were sent, wrapped as reference material (never as instructions); later turns only see a
  short note like `[picture: dragon.png]`.

Code: `server/builder/uploads.js`. Tests: `tests/unit/builder-uploads.test.js`, `tests/unit/builder-http.test.js`.

## 6. Sharing levels and review

Builders pick who can play:

| Level | Who can play | What it needs |
|---|---|---|
| 🔒 Only me | the builder (and admins) | the scan must not fail |
| 👫 Friends | the builder's accepted friends | the scan must not fail |
| 🎒 My class(es) | students and teachers of the classes the builder picked (and that school's admins), only while the builder is still in each class and it isn't archived | a clean scan, or a person's approval **for that audience** |
| 🏫 My school | everyone in the builder's schools | a clean scan, or a person's approval for the school (or wider) |
| 🌍 Everyone | everybody | the scan must not fail **and** a review |

**Class and school sharing** reach children who didn't choose it (a class page lists every class game for the whole
class), so a flagged version waits for a person, like "Everyone". An approval is stored with the audience it was given
for (`review_report.for`, and the class list for a class approval) and never stretches to a wider one: approved for 5A
covers 5A only, not 5B, the school or everyone. A builder's new class list for a game already live for some classes
waits in `games.pending_classes` until that approval, so nobody new can play it before a person looked. What a waiting
review is for is kept in `games.pending_visibility`, so approving it never makes a game public that was asked for a
class or school (this closed an older leak where every admin approval went public). One SQL rule (`CLASS_SQL` in
`server/services/games.js`) decides who can see a class game for both the single-game check and every listing, and a
unit test compares the two across a matrix of viewers and games. Teachers (and school admins) can take a game off their
class; its builder can't share it there again unless the teacher allows it, and "Allow again" only makes the class
pickable again (it never re-shares by itself).

**Review for "Everyone"** (`server/services/review.js`): a model reads the game's title, description and tags, the scan
result, its visible text, its code (the whole game for anything under ~60 KB, head + tail for bigger ones) **and one or
two real pictures of the game running** — the title screen and a moment of play — and answers with a structured verdict:
allowed, needs changes (with kid-friendly reasons the builder sees), or blocked. The pictures let the review catch things
that are only visible on screen (a copied character, a scary scene) and not in the text. Pictures reuse the cover already
taken for that version when there is one, or a fresh snapshot is taken with a short time limit so publishing never hangs;
if screenshots are off or time out, the review goes ahead on the text and code alone. A **flagged** version is never
approved automatically. If there is no API key, or the review fails for any reason, the game waits in the **human review
queue** for an admin.

**Updating a live game.** Builders can keep improving games after publishing. While an update waits for review, players
keep playing the old version. Only `server/services/publish.js` can move a version live.

## 7. Reports and admins

- Any signed-in player can report a game with a simple reason (no typing needed). When three people have open reports
  on a game, it is hidden automatically until an admin looks.
- Admins have a review queue with a preview and the safety report, can approve or reject with a note the builder sees,
  hide, suspend, ban, and read the audit log. Every moderation action is written to the audit log.

## 8. Chat is friends-only

There is no public chat, no chat with strangers and no chat inside games.
Chat exists only between **accepted friends** (added with a 6-character friend code, never by searching names), and only
when both are real accounts with chat switched on and neither has blocked the other.
Messages are short, filtered for rude words and personal details (phone numbers, emails, links, addresses, other apps,
schools, meet-ups) and refused messages are never stored. Repeated refusals pause chat for a while, and there are rate
and daily limits. Anyone can block or report a message, and chat can be switched off on the account's own Me page
(there is no separate grown-up control for it yet: an owner decision, docs/legal-review.md).
(See `server/services/chat.js`.)

**In every language.** The site is offered in 13 languages, and the same filters check every message whatever language
it is written in. Text is normalised first: full-width letters and digits (`０１２`, `ｂｏｂ＠ｍａｉｌ．ｃｏｍ`) count as plain
ones, invisible characters cannot split a number, and digits from any script (Arabic-Indic `٠١٢`, Devanagari, Thai...)
count for the phone-number check. Emails with non-Latin letters are caught too. Rude-word lists for each language live in
`server/i18n/blocklists/<code>.txt` (ROT13-encoded, see the README there) and **every list applies to every message**, so a
child cannot get around the filter by switching language. Quick-chat phrases are shown to each friend in their own
language; typed messages are never machine-translated. Usernames stay Latin letters and digits in every language.
(See `server/services/textfilter.js` and `tests/safety/i18n-filters.test.js`.)

## 9. What the game sandbox guarantees, and its honest limits

**The wall.** The guarantee a game cannot get around is the browser's own: an opaque-origin iframe with
`sandbox="allow-scripts allow-pointer-lock allow-orientation-lock"` (never `allow-same-origin`) under a CSP with
`connect-src 'none'`, `default-src 'none'`, no `allow-popups`, no `wasm-unsafe-eval`, no `worker-src`. A game cannot
reach the website's origin, read its cookies or storage, open a window, start a Worker, run WebAssembly, or make a
`fetch`/`XHR`/`WebSocket`/`EventSource` call. It can draw, play sound, use WebGL (so real 3D works), and talk to the
page only through `postMessage`, which both the page and the server re-check.

**A frame navigating *itself*.** The frame's own CSP has no directive for where a frame may send *itself* (there is
no `navigate-to` any more), so a game can point its own `location` at an outside URL. What stops it is the **page's**
CSP: every page that shows a game frame (play, the Studio preview, the admin review queue) has `frame-src 'self'`, and
the browser checks that before the frame's navigation makes any request — so no off-site request leaves (verified in
real Chromium: the outside address is never contacted; `tests/e2e/play.spec.js` asserts it, so a CSP change can't undo
it quietly). The frame is left on the browser's error page, so the play page pins it straight back to the game on any
unexpected `load` (`public/js/play.js`) — that part is for the player, not for safety. A game that keeps reloading
itself is pinned twice in 30 seconds and then stopped with a short message, never looped. (A reload the game starts
itself is refused by the server: it carries no sign-in cookie, so the viewer-bound frame link doesn't match. The 3D
card's "Try again" therefore asks the page to do the reload.) Everything else — `fetch`, `XHR`, `WebSocket`,
`EventSource`, `sendBeacon`, images, CSS `@import`/`url()`, fonts, `data:`/`blob:` — is blocked by the frame's CSP
(verified in real Chromium, zero egress).

**Two more things the CSP does not cover, closed in the SDK** (verified in real Chromium against a hostile game — see
`tests/unit/sandbox-lockdown.test.js`): WebRTC (removed; no browser has a CSP directive for it) and borrowing a
freshly-built frame's window (no frame element can be attached, so there is no second window with un-removed
constructors). We tested the paths a game would actually use: deleting and re-adding the WebRTC constructors,
`iframe`/`object`/`embed`/`srcdoc`, `appendChild`/`insertBefore`, `insertAdjacentElement`, a wrapper `<div>` hiding a
frame descendant, `innerHTML`/`insertAdjacentHTML`/`setHTMLUnsafe`, `Range.insertNode`, `document.write`, `DOMParser`,
`window.frames`/`window[0]`.

**3D.** WebGL gives a game the graphics chip, which is a bigger and older part of the browser than plain drawing. It
stays inside the same sandbox and CSP (no network, no origin), and the 3D library is a single pinned, self-hosted build,
so the only new code is Three.js itself, reviewed once per version bump. For 3D games the frame tells the SDK what the
game needs; a device without WebGL 2 or import maps (for example an iPad still on iPadOS 15), or one whose 3D picture is
lost and not restored, gets a friendly "This game needs a newer device or browser" card instead of a blank screen. The
Builder's 3D rules keep games comfortable (field of view 60–75, a smooth follow camera, no shake or flashing, reduced
motion respected) and light enough for school Chromebooks (pixel ratio ≤ 1.5 with an automatic quality ladder).

**Honest limits.** The SDK lockdown is defence-in-depth layered **on top of** the CSP, not the wall itself. It relies
on running first — which it does, because it is inlined ahead of the game's code — and on the list of entry points we
enumerated; a brand-new browser API in some future engine could need adding. That is why the static scanner also
*flags* frame-building and unknown cdnjs libraries for a human even though the SDK already neutralises them, and why an
unreviewed cdnjs bundle never goes Public on its own. The scanner itself is a static text check, not a interpreter: it
sees through the common ways to hide a name but is not a guarantee on its own — it decides pass vs. "a person looks",
and the CSP + lockdown are what actually contain the code. The headless Chromium that makes covers and playtests runs
with `--no-sandbox` (the container has no user namespaces), but the game is still inside the iframe sandbox + CSP, and
the browser is launched from a scrubbed environment and an empty working directory (and on the AWS/Azure setup in a
separate container with no database, data disk, secrets or internet), so a game it runs cannot read anything that
matters.

## 10. Honest limits of what the browser can prove

Games run in a locked sandbox with no network, so a game cannot cheat the website — but a **score** a game reports, and a
student **marking a game step done**, are things the player's own browser asserts. We bound the abuse (a score only counts
after the player has actually opened the game, and the login and action rate limits apply), but leaderboard scores and
self-marked game/build/text completion are **student-reported, not independently verified**. Written answers, feedback and
who-can-see-what are enforced on the server and are not self-reported. Teachers reading a gradebook should treat a game
score the way they would treat a child saying "I got 100".

A note for whoever deploys the site: the per-IP rate limits (and the visitor count) are only as trustworthy as the real
client IP. Set `TRUST_PROXY` to match your proxy (see the README), and make sure the proxy's edge **overwrites**
`X-Forwarded-For` rather than appending to it, so a request can't spoof its address; the login brute-force limit is
additionally enforced per account so it holds even if the IP is wrong.

Sign-in limits are tuned for schools, where a whole school shares one address: successful sign-ins never count as
failures; per address we allow 1000 failed sign-ins and 3000 tries in all per 15 minutes (flood guards), plus 10 failed
guesses per username per 15 minutes from any address. Generated school passwords have about 31 bits (three words from a
273-word list plus two digits), which keeps guessing hopeless under those limits. Trade-offs we accept: anyone who knows
a username can lock that account for 15 minutes with 10 wrong guesses (a teacher's password reset unlocks it straight
away), and someone inside a school who scripts 1000 wrong sign-ins can block sign-in for that whole school address for
up to 15 minutes. At the edge (AWS WAF / Azure Front Door rate rules) such floods should be stopped before they reach
the app.

## 11. Data, and what we do not do

The same facts as the grown-ups page (`/parents`, text in `info.parents.*`) and the Privacy Policy (`/privacy`), kept to
what is true today. Once paid plans are public (billing on and `BILLING_PUBLIC=1`), "nothing is for sale" below no longer
holds: children are still never asked to pay or shown prices, a grown-up or school admin can buy extra Builder messages
through Stripe (we never see card numbers), and the site's wording switches with it (the `paidN` strings, see
docs/legal-review.md). Billing data and its timers are on `/privacy`.

- **Never asked for:** email addresses, ages, home addresses, locations or payment details. Nothing is for sale: no
  real-money purchases, loot boxes or paid boosts. No ads, and no advertising or tracking cookies (the only cookies are
  the sign-in, language and theme, and for a day after a sign-in ends on a device, a signed note of whose it was, so the
  next person isn't sent to that page; and, for two minutes while moving from an old web address to the new one, a
  random one-time code; and, while Sign in with Google runs, a 10-minute code for that one sign-in). Sign in with Google
  is for school Google accounts only: a Google account is matched by its id, never by email, and a new one gets an
  account only through its school (a teacher's invite by school email, or the class code with the school's own Google
  domain). We keep the Google account's id, email and school domain while it is connected; never its photo, and its
  name only as the staff-only class-list name. The optional PostHog hook (`POSTHOG_KEY`) is off unless set and nothing calls it.
- **Stored for own accounts:** a made-up username, a bcrypt password hash, the games they make with their Builder chats
  and uploads, saves, scores, ratings, favorites, friends, chat messages, a profile photo if uploaded, and settings
  (language, theme). Each sign-in keeps the browser's name (user agent). Guests: a made-up name, saves, scores, ratings
  and favorites.
- **Stored for school accounts** (made and owned by a school, signed in to with a login card): the same, plus the
  student's real name as the school typed it (`school_members.roster_name`, seen by the school's staff and the platform
  admin, printed on login cards), classes, lesson progress, written answers and teacher feedback. An own account that
  joins a class with a class code gets the same school records for that class, with a real name if the teacher types
  one. So "no real names" is not true for school accounts; the kid-facing /safety page says the school may add one.
- **Sent to Anthropic (Claude):** a child's Builder messages, pictures and files (to make the game, and to screen them),
  profile photos (safety check) and a game's text and code for the public review (a person checks any game the review
  is unsure about, or when it is unavailable). No names or usernames are sent with them. Teachers' "Draft with AI"
  topics go too. Friends' chat messages and lesson answers are never sent to the AI.
- **Kept for how long:** as long as the account exists. Nothing is deleted on a timer yet: a deleted game is taken off
  the site for everyone but stays in the database, and people who leave a school are marked 'left'. The daily visitor
  codes are deleted after two days.
- **Deleting or exporting:** there is no feature yet. The grown-ups page says a grown-up can contact us (school accounts:
  ask the school, which can ask us); the address is `CONTACT_EMAIL`, shown on /parents once it is set. See
  docs/decisions.md for what is still missing.
- **Parent-made accounts** (only while `PARENT_MADE_CHILDREN=1` and families are on; off by default, and off in
  production until the owner signs off on docs/legal-review.md item 30; docs/decisions.md "Parent-made child accounts").
  A grown-up makes their child's own account on /family: a made-up username (kid name rules, never the grown-up's own
  name) and a password (kid rules, never the grown-up's), after reading a short notice of what the account keeps and
  ticking "I've read this" and "I am this child's parent or legal guardian". We store the account like any kid
  account, plus who made it (`users.made_by`, `made_by_family`, `made_at`, kept for good) and a record of the notice
  and the statement (`family_notice_acks`: version and time). **It is not a parental consent check, and no page says
  it is**; paying isn't one either. The account is an ordinary kid account: no badge, nothing a friend or the public
  can see about the grown-up. Limits: the kid sign-up's per-address limits, at most `FAMILY_MAX_CHILDREN` made a year
  (deleted ones count) and 2 a day, refused while a child's report against the family is open.
  - **What the grown-up sees:** counts only (games, Builder chats, uploads, saves, scores, friends, chat messages sent,
    a photo or not, which browsers are signed in), up to yesterday, behind their password; never content or today.
    The child is told the same list on a first-sign-in card and on Me.
  - **Switch to <child>** signs the grown-up out on that device and the child in, with the child's password (wrong
    tries count toward the child's own sign-in lock) and the grown-up's. The only way back is the grown-up's normal
    sign-in; nothing in the child's session remembers the grown-up. A grown-up who knows the password could still sign
    in as the child and chat under their name: /parents asks them not to (owner decision in docs/legal-review.md).
  - **The child's voice:** "This isn't my grown-up" goes to Report. Report or Unlink on a made account makes the child
    pick a new password, ends every other sign-in and the link, and a report is marked as a made account for the admin.
  - **Reset and delete:** the grown-up can set a new password (the child is told once) and delete the account: games,
    chats, uploads, friends, chat messages, the photo and sign-ins are removed and the account becomes a tombstone that
    can't sign in; Builder usage totals stay without their text; the old name is reserved for 90 days. Refused while
    the child is in a class (school records are the school's). Only made accounts get these tools; a code-linked
    child's grown-up still only sees the extra-message counts and can unlink.

## 12. Live classroom (Oomba Live)

Live class games (`server/services/classlive-*.js`, `server/routes/live.js`; protocol: docs/live-protocol.md;
decisions: docs/decisions.md "Oomba Live"). Off with `LIVE_CLASSROOM=0`.

**Who.** Only teachers and school admins, grown-up accounts and the platform admin can host; kids and guests never.
A room has an audience, set when it opens: `class` (a teacher's own class: signed-in active students of that class
only, no guests), `family` (the grown-up's linked children) or `open` (anyone with the code; no account needed).
Open rooms run only official games, the built-in modes and public games that passed human review; every player must
pass the same visibility rule as anywhere else (`games.canView`, a guest counts as signed out), checked again when a
frame loads and every 30 seconds. Grown-ups' open rooms are capped at 30 players.

**No free text from players, anywhere.** Players press buttons. The one typed input is the 7-digit code. Names are
one of 144 fixed, kind nickname phrases (account names only in a teacher's own class room). Emotes are 6 fixed
animations. Game events between players (`ev`) may carry only numbers, booleans, `null` and identifier tokens
(`[a-z0-9_-]`, 24 at most), nested at most twice, 512 bytes at most; and a player's event kind and every token in it
must be one of the game's own words, written in its code (`Oomba.live.ready({ words })`, read by the server when the
session opens, each through the text filter). Underscore-joined messages (`add_me_on_snap`) are never relayed, so a
game cannot become a chat (the kit checks it, the server checks it again). Question sets, and every string the host
sends to players (shared state, host events), are written by adults and pass the rude-word and personal-information
checks (contact words, handles and links included). In live frames the SDK also turns text entry off at run time: `prompt()` returns null, text boxes are
read-only and contenteditable is off, also for elements added later (docs/sdk.md "Live messages").

**Codes.** 7 digits, unique among open sessions, never reused within 24 hours, dead when the session ends (at most
3 hours; `LIVE_HOURS` can only shorten it). Wrong guesses are limited per IPv4 address or IPv6 /64 (100 per 10
minutes), and for IPv6 also per /48 (200) and /32 (600), so holding a whole prefix buys no more guesses; all tries too
(600 per bucket, scaled the same way), and a
site-wide meter puts everyone on strict limits (5 per 10 minutes) for 10 minutes when more than 2,000 wrong codes
arrive in a minute. Locked or full rooms don't count as wrong guesses. Every answer takes at least 150 ms. The code
is never in a query string or a log: the QR and links use `/join#1234567` (a fragment the browser never sends), and
the request log writes `/join/:code` and `/live/frame/:token` for paths that carry one. A frame token only loads the
game frame: the socket refuses it as a seat credential.

**The socket.** One upgrade listener routes `/api/live/ws` (and the Studio's live mic) by path. Before the upgrade:
draining 503, flag off 404, a foreign Origin 403, more than 1,200 sockets a minute from one address 429. After it: a
signed seat or host token within 5 seconds (a signed-in seat's token works only with that account's own sign-in; a
host token only with the host's), at most 20 reconnects a minute per seat, every message parsed by type, range and
size (2 KB for players, 16 KB for the host), token buckets per type, and 5 seconds at 3x the limit closes it.

**The frame.** Live games run in the same sandboxed frame as every game (opaque origin, no network, the same CSP).
The frame never opens a socket: its SDK hands the page a private `MessagePort` with its first ready message, and all
live traffic goes over it. A frame that navigates itself is torn down and loaded again with a fresh token, so a page
it navigated to never gets the port, the roster or anything else. The page re-checks every message (type, role, size)
before the server checks it again.

**Host powers.** Start, pause, next, skip, lock (automatic at start in open rooms), remove (bans the seat and the
account for that session) and end. The roster has avatars, names as shown in the session and Remove, never links,
profiles or messages. Every player page has Report with fixed reasons (scary, mean, asks for personal information,
other); a report keeps the host, game and question texts, never who reported, and the host is told.

**Data.** Sessions live in memory. Guests: no cookie, no account, no database row; the seat token sits in the tab's
`sessionStorage`. When a session ends one row of counts and question accuracy is saved (no code, nickname, token or
name); only a teacher's own class students get score rows and gradebook entries. Visits to `/join` and `/live` are not
counted. Player pages use the bare layout: no menus, no prices, plans or sign-up prompts.

**Teams and teacher tools (part 3; docs/decisions.md "Oomba Live, part 3").**
- *No new free text.* Team names are 8 fixed presets (colour, shape, animal, a translated name); nobody types a team
  name, not even a teacher (the text filter can't catch an in-joke about a classmate on a projector). Teacher messages
  are 10 fixed, translated phrases and bonus reasons 5 fixed, positive ones, all sent as indexes. Players still type
  nothing: picking a team is a button (lobby only), and a player's game event to its team (`ev to: 'team'`) passes
  the same vocabulary check as any other.
- *Eyes up* covers every player's screen (and pauses play); it is a classroom-management tool, not a message.
- *The teacher's dashboard* (`/live/host/:sid/dash`) is phone-first because many classrooms mirror the teacher's
  laptop. Its address holds only the session id (the projector shows it as a QR): the page needs the host's own
  sign-in (anyone else gets the sign-in page or a 404) and sends `Cache-Control: no-store`; the host token is in the
  page only for that account. It opens with a one-time "use a screen the class can't see" notice, and keeps the right
  answer and "needs help" hidden until tapped. Its data (`dq`, `dp`, `sup`) goes to that connection only: never to a
  player, the projector or a game frame.
- *Projector privacy.* "Needs help", support, answer status and per-student marks never reach the projector. "Names:
  hidden" keeps names off the projector (players still see nicknames; the dashboard keeps real names in a class room).
  The results page opens with a class-safe part (team podium and table, hardest questions, question review, no student
  names); "Student details" (marks, bonus, needs help, CSV) is closed until the teacher opens it, with a reminder.
- *Bonus points* to one player are private (that device and the teacher); to a team, public. All reasons are positive;
  bonus points never count in the gradebook.
- *Support* (extra time, read aloud, simple view) is private: it reaches only that student's own page (a `me` message
  the page never relays into the game frame, so game code, which another child may have written, never learns it) and the
  dashboard. The broadcast question carries no per-seat time; a student with extra time gets their own. Saving it for
  a class is behind `LIVE_SAVE_SUPPORT` (off; legal-review item 42).
- *Play again* re-runs every join check (the room's rule, class membership, the old session's removals) for each player
  still connected; the move token goes only to that player's page (never into a frame); the snapshot it uses is wiped
  when the 2-minute linger ends.
- *Stored:* a class's saved teams, saved support (flag), marks and bonus in class runs, the host's remembered settings:
  all inside the school (or the host's own account) and deleted with the class membership, the class or the account.
  Family and open rooms save nothing new.

**Honest limits.** Grown-up accounts are self-declared, so "a host account" does not prove an adult; the limits above
(open rooms: nicknames only, reviewed games only, 30 players, Report) are the protection. A determined game author
could still draw shapes that spell words; open rooms therefore run reviewed games only.
