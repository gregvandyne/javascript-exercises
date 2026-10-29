// Parent-made child accounts, the child's side (docs/decisions.md "Parent-made child accounts" B5): what the grown-up who
// made the account can see, and the first-sign-in card. Fixed words only, never a name the adult typed; text a language
// doesn't have yet is marked as English (lang, and left to right so its full stops land right on a right-to-left page).
import { html, raw } from './html.js';
import * as F from '../services/family.js';

/** What the grown-up who made this account can see (F.GROWNUP_SEES: the same categories /family's "What we keep"
 *  counts), and what they can't, in fixed words: never a name the adult typed. Untranslated, marked as English. */
export function madeSees(req, t = req.t) {
  const say = (key, s) => (t.own(key) ? s : html`<span lang="en" dir="ltr">${s}</span>`);
  return html`<p class="small" style="margin-bottom:var(--s1)">${say('me.family.made.card.sees', t('me.family.made.card.sees'))}</p>
    <ul class="small madesees">${F.GROWNUP_SEES.map(c => html`<li${t.own(`me.family.made.sees.${c}`) ? '' : raw(' lang="en" dir="ltr"')}>${t(`me.family.made.sees.${c}`)}</li>`)}</ul>
    <p class="small">${say('me.family.made.card.cantRead', t('me.family.made.card.cantRead'))}</p>`;
}
/** The first-sign-in card on every page of a parent-made account (views/layout.js) until the child answers it: who made
 *  the account, one line on what that grown-up can see (the full list folded under "What can they see?", the same list
 *  as Me and /family), OK, and "This isn't my grown-up" (to Report on Me). Only while madeOn and the link made with the
 *  account is still on; fixed words only. In a sign-in a grown-up's Switch started, OK hides it for that sign-in only
 *  (req.madeCardOk; routes/family.js made-seen): the child still gets it when they sign in themselves. */
export function madeCard(req, t = req.t) {
  const u = req.user;
  if (!F.madeOn(req) || !F.isChildAccount(u) || !u.made_by || u.made_note_seen_at || !F.madeLinkOf(u)) return '';
  if (req.sessionVia === 'switch' && req.madeCardOk) return '';
  const say = (key, s) => (t.own(key) ? s : html`<span lang="en" dir="ltr">${s}</span>`);
  return html`<section class="notice pagenote madecard" role="status" aria-labelledby="madecard-h">
    <p style="margin-top:0" id="madecard-h"><strong><span aria-hidden="true">🧑‍🧒</span> ${say('me.family.made.card.title', t('me.family.made.card.title'))}</strong></p>
    <p class="small">${say('me.family.made.card.summary', t('me.family.made.card.summary'))}</p>
    <details class="madecard-more"><summary class="small">${say('me.family.made.card.more', t('me.family.made.card.more'))}</summary>${madeSees(req, t)}</details>
    <div class="row"><form data-api="/api/me/family/made-seen" data-reload><button class="btn btn-primary btn-sm" type="submit">${say('me.family.made.card.ok', t('me.family.made.card.ok'))}</button></form>
      <a class="btn btn-sm" href="/me#grownups-report">🚩 ${say('me.family.made.card.notMine', t('me.family.made.card.notMine'))}</a></div>
  </section>`;
}
/** The one-time note after the grown-up who made the account set a new password (F.resetChildPassword), on the first
 *  page the child opens in a sign-in of their own; cleared once drawn. Never drawn or used up in a sign-in a grown-up's
 *  Switch started (the grown-up who just set the password must not be the one who reads it). Not behind madeOn: once a
 *  grown-up has set a password, the child is told even if parent-made accounts were switched off since
 *  (docs/decisions.md "Parent-made child accounts", the protections that stay). */
export function pwResetNote(req, t = req.t) {
  const u = req.user;
  if (!F.isChildAccount(u) || !u.made_by || !u.pw_reset_note_at || req.sessionVia === 'switch' || !F.takePwResetNote(u.id)) return '';
  const key = 'me.family.madePwReset';
  return html`<p class="notice pagenote" role="status"${t.own(key) ? '' : raw(' lang="en" dir="ltr"')}><span aria-hidden="true">🔑</span> ${t(key)}</p>`;
}
