// Plain-language info pages: safety, for grown-ups, and the builder SDK summary.
import { Router } from 'express';
import { html } from '../views/html.js';
import { page } from '../views/layout.js';
export const router = Router();

const info = (title, emoji, sections) => html`<div class="wrap narrow" style="padding:0"><h1>${emoji} ${title}</h1>${sections.map(([h, ps]) => html`<section class="panel"><h2>${h}</h2>${ps.map(p => html`<p>${p}</p>`)}</section>`)}</div>`;

router.get('/safety', (req, res) => page(req, res, { title: 'Safety', back: '/', body: info('How we keep Magic Cups safe', '🛡️', [
  ['Games are kept in a box', ['Every game runs in a locked box (a sandbox). Games cannot reach the internet, cannot see your account, and cannot open other pages.']],
  ['Every game is checked', ['A robot checker reads every version of every game. Games for everyone also get a careful review before anyone else can play them.', 'If something slips through, tap 🚩 Report on the game page. When three people report a game, it is hidden until our team looks.']],
  ['Chat is only with friends', ['You can only chat with people you added using their secret friend code. Chat blocks bad words, phone numbers, emails, addresses and links.', 'You can block or report anyone, any time. Grown-ups can turn chat off on the Me page.']],
  ['No personal details', ['We never ask for your email, real name, age or address. Pick a fun made-up name.']],
  ['Ads are quiet', ['A few small cards say “Sponsored”. They never appear inside or over a game, never make sound and never pop up.']],
]) }));
router.get('/parents', (req, res) => page(req, res, { title: 'For grown-ups', back: '/', body: info('For grown-ups', '👪', [
  ['What is Magic Cups?', ['A free website where kids play web games and build their own by describing them to an AI Builder. No downloads, no purchases, no loot boxes, no in-game money that costs money.']],
  ['Data we keep', ['A username, a password (stored scrambled), game saves, scores, ratings and likes. No email, no real name, no age, no location. No third-party trackers.']],
  ['Friends and chat', ['Friends are added only by a 6-character friend code, never by searching names. Chat is text between accepted friends only, filtered for bad language and personal details, rate-limited, and reportable. You can switch chat off on the Me page.']],
  ['The Builder', ['The Builder follows fixed kid-safety rules: no gore, no horror jump-scares, no gambling, no real brands or real people, no chat or data collection inside games, no links out. Requests that break the rules are kindly refused.']],
  ['Money', ['Ads pay for the platform and builders get a share based on plays of their games. Payouts above $10 are handled by hand by our team.']],
]) }));
router.get('/sdk', (req, res) => page(req, res, { title: 'For builders', back: '/build', backLabel: 'Build', body: info('Game SDK', '🧰', [
  ['window.BRB', ['Every game gets a small helper called BRB. BRB.storage.get(key) and BRB.storage.set(key, value) save progress for each player. localStorage also works and is saved to the cloud.', 'BRB.score.submit(score) adds to the leaderboard (best score only). BRB.gameOver({won, score}) ends a round.', 'BRB.fx.confetti(), BRB.fx.shake(el), BRB.fx.flash(), BRB.sfx.play("jump"|"hit"|"win"|"lose"|"coin"), BRB.fx.tween() and BRB.fx.fit(canvas, w, h) add juice.', 'BRB.fullscreen() and BRB.orientation("landscape") ask the page politely.']],
  ['Rules', ['Games cannot use the internet, cookies, forms, pop-ups or links. Fonts from Google Fonts and libraries from cdnjs are allowed. Keep each game under 2 MB.']],
]) }));
