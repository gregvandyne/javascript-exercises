# How Magic Cup keeps kids safe

Magic Cup is a website where kids play web games and build their own by chatting with an AI Builder.
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
  scripts only inline or from `cdnjs.cloudflare.com`, styles and fonts only from Google Fonts.
- The token in the frame link is signed and expires. Studio previews use a preview token, which also switches
  saving off.
- Games can only talk to the website through a tiny helper called `window.BRB` (see `docs/sdk.md`).
  The page around the game checks where every message came from and what shape it has, and the server checks
  and rate-limits everything again.
- Before a game is stored or served we strip things a game never needs: `<base>`, `<meta http-equiv>`,
  `<iframe>`, `<object>`, `<embed>`, external `<link>`s (except Google Fonts) and form targets.
- Each version must be under 2 MB.

Code: `server/services/frame.js`, `server/services/sanitize.js`, `server/routes/games.js`, `public/sdk/brb-sdk.js`.

## 2. The scanner: a robot checks every version

Every version of every game is checked by a static scanner the moment it is made (`server/services/scanner.js`).
A version gets one of three results:

| Result | What it means |
|---|---|
| ✅ **pass** | Fine. It can be shared at any level. |
| ⚠️ **flag** | OK for "Only me" and "Friends". Before everyone can play it, a person must look. |
| ⛔ **fail** | Cannot be shared at all until it is fixed. |

It **fails** a version that tries to reach the internet (`fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource`,
`sendBeacon`, `import()`), escape the box (`window.top`, `parent.location`, `window.open`, navigating away),
read cookies, build code from text (`eval`, `new Function`, string timers), ask for the camera, microphone,
location or notifications, link or load scripts from outside, submit forms, show rude words, or ask players
for personal details ("type your address").

It **flags** fast flashing (anything that flips colours more than three times a second, in code or CSS),
hidden text, and anything that looks like a phone number or email.

In the Studio the result is shown under the preview in plain words. A failed version has a
**"Ask the Builder to fix it"** button that sends the problems back to the Builder.

## 3. Screening: every Builder message is checked before the AI sees it

Before any AI model reads a kid's message, it goes through two checks (`server/builder/screen.js`):

1. **Keyword pre-filter.** Catches attempts to change the Builder's rules ("ignore previous instructions",
   "you are now…", "system prompt", "developer mode", fake `<system>` tags), rude words, personal details
   (phone numbers, emails, addresses, "make a game that asks for your address"), links, and chat between players.
2. **Classifier.** With an API key this is a fast, cheap Claude model (`claude-haiku-5-5`) that answers with a
   fixed set of categories. Without a key, a rules-based classifier is used instead. The rules also run as a
   backstop when the model is available.

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

A refusal is always kind and short, says what Magic Cup can't have, and suggests something else to build
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
| 🌍 Everyone | everybody | the scan must not fail **and** a review |

**Review for "Everyone"** (`server/services/review.js`): Claude reads the game's visible text, its title, description and
tags, the scan result and a short part of its code, and answers with a structured verdict: allowed, needs changes (with
kid-friendly reasons the builder sees), or blocked. A **flagged** version is never approved automatically. If there is no
API key, or the review fails for any reason, the game waits in the **human review queue** for an admin.

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

## 9. What we do not do

No real-money purchases, loot boxes or paid boosts. No third-party trackers or behavioural ads. No ads inside or over games.
No collecting emails, real names, ages or locations.
