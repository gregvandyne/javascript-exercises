// Oomba Live's pages inside Homeroom (docs/decisions.md "Homeroom: live games inside Homeroom, a simpler Find lessons").
// Homeroom hosts a live game in a layer over the board (public/js/homeroom-livegame.js), shows its host screen on the
// projector view, and plays it in a student's desk player: each is the real Oomba Live page in a frame of this site, as
// the play page's and the Manipulatives page's ?in=hr. Mounted before routes/live.js; nothing in the live pages changes.
//
// A page asked for with ?in=hr in a frame (Sec-Fetch-Dest: iframe) is served without the site's menu, footer, banners
// and Oomba chat (req.hrEmbed: views/layout.js), and may be framed by this site only (frame-ancestors 'self'). The live
// pages move on by themselves inside the frame (the landing to /live/host/<sid> once the game is made, the host page to
// its results, Play again), without ?in=hr, so the first one also sets a cookie (hr_lv, Path=/live, SameSite=Strict,
// 12 hours) that keeps the next pages in the same frame embedded. Only a framed request ever reads it: /live opened in a
// tab of its own is exactly as before, with or without the cookie, and another site can never frame these pages.
import { Router } from 'express';
import { parseCookies } from '../auth.js';

export const router = Router();
const PAGES = /^\/live(\/sets(\/[^/]+)?|\/host\/[^/]+(\/dash)?|\/play\/[^/]+|\/results\/[^/]+|\/cohost\/[^/]+)?\/?$/;
const COOKIE = 'hr_lv';

/** Is this request one of the live pages framed by Homeroom? */
export const liveEmbed = req => (req.method === 'GET' || req.method === 'HEAD') && PAGES.test(req.path) && req.headers['sec-fetch-dest'] === 'iframe'
  && (req.query.in === 'hr' || parseCookies(req)[COOKIE] === '1');

router.use((req, res, next) => {
  if (!liveEmbed(req)) return next();
  req.hrEmbed = true;
  res.set('Content-Security-Policy', String(res.get('Content-Security-Policy') || '').replace("frame-ancestors 'none'", "frame-ancestors 'self'"));
  res.removeHeader('X-Frame-Options');
  if (req.query.in === 'hr') res.append('Set-Cookie', `${COOKIE}=1; Path=/live; Max-Age=43200; HttpOnly; SameSite=Strict${req.secure ? '; Secure' : ''}`);
  next();
});
