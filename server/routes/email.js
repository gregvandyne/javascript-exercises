// One-click unsubscribe from Oomba's marketing emails (docs/decisions.md "Trial emails"). The link in every email
// (and its List-Unsubscribe header) carries a signed token (services/email.js unsubToken): no sign-in needed.
//   GET  /email/unsubscribe?t=…   a page with one button (a GET never changes anything: mail scanners open links)
//   POST /email/unsubscribe?t=…   unsubscribes: the button, or the mail app's one-click (RFC 8058,
//                                 "List-Unsubscribe=One-Click"); &again=1 subscribes again
// Mounted before the CSRF check and the grown-up guard (app.js): a mail provider's one-click POST comes from its own
// servers, and the token alone is the check. It only turns marketing on or off for the account it names; transactional
// email (receipts) is unaffected. The page is English for now, like the emails (server/emails/trial-en.js).
import { Router } from 'express';
import { html } from '../views/html.js';
import { page } from '../views/layout.js';
import { audit } from '../db.js';
import { getUser } from '../auth.js';
import * as E from '../services/email.js';

export const router = Router();

function view(req, res, { state, token, status = 200 }) {
  res.set({ 'X-Robots-Tag': 'noindex', 'Cache-Control': 'no-store' });
  const action = `${E.UNSUBSCRIBE_PATH}?t=${encodeURIComponent(token || '')}`;
  const body = state === 'bad'
    ? html`<section class="panel" lang="en" dir="ltr"><h1>This link doesn't work</h1>
        <p>The unsubscribe link may have been cut short when it was copied. Try the Unsubscribe link at the bottom of the email again, or just reply to the email and we'll take you off the list.</p></section>`
    : state === 'off'
      ? html`<section class="panel" lang="en" dir="ltr"><h1>You're unsubscribed</h1>
        <p>You won't get any more trial tips or reminders from Oomba Academy. Emails about your account and payments, like receipts, still arrive.</p>
        <form method="post" action="${action}&again=1"><button class="btn" type="submit">Subscribe again</button></form></section>`
      : html`<section class="panel" lang="en" dir="ltr"><h1>${state === 'again' ? "You're subscribed again" : 'Unsubscribe from Oomba Academy emails?'}</h1>
        <p>${state === 'again' ? "Thanks! You'll get trial tips and reminders again." : 'You will stop getting trial tips and reminders. Emails about your account and payments, like receipts, still arrive.'}</p>
        <form method="post" action="${action}"><button class="btn btn-primary" type="submit">Unsubscribe</button></form></section>`;
  page(req, res, { title: 'Email preferences', body, mid: true }, status);
}
const userOf = t => { const id = E.readUnsubToken(t); return id && getUser(id) ? id : null; };

router.get(E.UNSUBSCRIBE_PATH, (req, res) => {
  const id = userOf(req.query.t);
  if (!id) return view(req, res, { state: 'bad', status: 400 });
  view(req, res, { state: E.nudgesOff(id) ? 'off' : 'ask', token: req.query.t });
});
router.post(E.UNSUBSCRIBE_PATH, (req, res) => {
  const id = userOf(req.query.t);
  if (!id) return view(req, res, { state: 'bad', status: 400 });
  const again = req.query.again === '1';
  if (E.nudgesOff(id) === again) { E.setNudgesOff(id, !again); audit(id, again ? 'email.resubscribe' : 'email.unsubscribe', id); }
  view(req, res, { state: again ? 'again' : 'off', token: req.query.t });
});
