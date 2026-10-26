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
and daily limits. Anyone can block or report a message; grown-ups can switch chat off on the Me page.
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

The same facts as the grown-ups page (`/parents`, text in `info.parents.*`), kept to what is true today:

- **Never asked for:** email addresses, ages, home addresses, locations or payment details. Nothing is for sale: no
  real-money purchases, loot boxes or paid boosts. No ads, and no advertising or tracking cookies (the only cookies are
  the sign-in, language and theme, and for a day after a sign-in ends on a device, a signed note of whose it was, so the
  next person isn't sent to that page). The optional PostHog hook (`POSTHOG_KEY`) is off unless set and nothing calls it.
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
