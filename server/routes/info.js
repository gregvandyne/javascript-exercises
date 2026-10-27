// Plain-language info pages: safety, for grown-ups, the builder SDK summary, and the legal pages (terms, refunds,
// privacy). Text lives in the locale files under info.<page>.<section>.<item>; a section's layout is the order of its
// items in en.json: h (heading), s1.. (sub-headings), p1.. (paragraphs), li1.. (list items; a run of them is one list).
// paidN items are the wording for once paid plans are public (familiesOn: billing on, and BILLING_PUBLIC or the
// preview cookie): paidN replaces pN then, or is added where it stands when there is no pN; before that it is skipped.
import { Router } from 'express';
import { googleEnabled } from '../oidc.js';
import { html } from '../views/html.js';
import { page, legalReader } from '../views/layout.js';
import { tHtml, dictionary, DEFAULT_LOCALE, fmt } from '../i18n/index.js';
import { config } from '../config.js';
import { familiesOn } from '../services/family.js';
export const router = Router();

/** The legal pages' "Last updated" date (a calendar day, UTC). Change it with every change to their text. */
export const LEGAL_UPDATED = '2026-10-27';
/** Where the legal pages send people: CONTACT_EMAIL, else the owner's address. */
const legalEmail = () => config.contactEmail || 'greg@oomba.ai';

/** The items of one section, in en.json order, with the paid-plan swaps applied. -> [{ kind, key }] */
const keyCache = new WeakMap();   // English dictionary -> prefix -> its item names (a reload makes a new dictionary)
function sectionKeys(prefix) {
  const en = dictionary(DEFAULT_LOCALE);
  let byPrefix = keyCache.get(en); if (!byPrefix) keyCache.set(en, byPrefix = new Map());
  if (!byPrefix.has(prefix)) byPrefix.set(prefix, Object.keys(en).filter(k => k.startsWith(`${prefix}.`)).map(k => k.slice(prefix.length + 1)).filter(k => !k.includes('.')));
  return byPrefix.get(prefix);
}
function items(prefix, paid) {
  const out = []; const keys = sectionKeys(prefix);
  const has = new Set(keys);
  for (const k of keys) {
    const m = /^(?:(paid)|(p|li|s))(\d+)$/.exec(k); if (!m) continue;
    if (m[1] && !paid) continue;                                   // paid wording before launch
    if (!m[1] && paid && has.has(`paid${m[3]}`) && m[2] === 'p') continue;  // replaced by its paidN
    out.push({ kind: m[1] ? 'p' : m[2], key: `${prefix}.${k}` });
  }
  return out;
}
/** One section as a panel: <h2>, then its paragraphs, sub-headings and lists. */
/** lang/dir for an element whose text is the English fallback (a right-to-left page keeps English sentences readable:
 *  the full stop stays at the end), nothing when the key is written in the page's language. */
const fallback = (t, key) => (t.own(key) ? '' : html` lang="en" dir="ltr"`);
function section(req, prefix, { id, paid = familiesOn(req) } = {}) {
  const t = req.t; const vars = { email: legalEmail() }; const out = []; let list = null;
  for (const it of items(prefix, paid)) {
    if (it.kind === 'li') { if (!list) out.push(list = { key: it.key, items: [] }); list.items.push(html`<li${fallback(t, it.key)}>${tHtml(t, it.key, vars)}</li>`); continue; }
    list = null;
    out.push(it.kind === 's' ? html`<h3${fallback(t, it.key)}>${tHtml(t, it.key, vars)}</h3>` : html`<p${fallback(t, it.key)}>${tHtml(t, it.key, vars)}</p>`);
  }
  return html`<section class="panel"${id ? html` id="${id}"` : ''}><h2${fallback(t, `${prefix}.h`)}>${t(`${prefix}.h`)}</h2>${out.map(x => (x.items ? html`<ul${fallback(t, x.key)}>${x.items}</ul>` : x))}</section>`;
}
/** sections: section keys under info.<pageKey>; extra: more sections after them. */
function info(req, pageKey, emoji, sections, extra = '') {
  return html`<div class="wrap narrow" style="padding:0"><h1>${emoji} ${req.t(`info.${pageKey}.heading`)}</h1>${sections.map(s => section(req, `info.${pageKey}.${s}`, { id: s }))}${extra}</div>`;
}
const codeBlock = s => html`<code dir="ltr">${s}</code>`;

router.get('/safety', (req, res) => page(req, res, { title: req.t('info.safety.title'), back: '/', description: req.t('info.safety.description'), body: info(req, 'safety', '🛡️', ['box', 'checked', 'chat', 'personal', 'ads']) }));
// "Contact us" (CONTACT_EMAIL): where the page's "a grown-up can contact us" leads. Not shown until it is set.
const contact = req => (config.contactEmail ? html`<section class="panel" id="contact"><h2>${req.t('info.parents.contact.h')}</h2>
  <p>${tHtml(req.t, 'info.parents.contact.p1', { email: html`<a href="mailto:${config.contactEmail}" dir="ltr">${config.contactEmail}</a>` })}</p></section>` : '');
// With Sign in with Google on, what the site keeps from a school Google account (nothing while it is off).
const googlePrivacy = req => (googleEnabled() ? html`<section class="panel" id="google"><h2>${req.t('google.setup.privacy.h')}</h2><p>${req.t('google.setup.privacy.p1')}</p></section>` : '');
// Family accounts (routes/family.js): /grown-ups is linked from here only, and only while families are on, next to /plans.
const families = req => (familiesOn(req) ? html`<section class="panel" id="families"><h2>${req.t('info.parents.families.h')}</h2>
  <p>${req.t('info.parents.families.p1')}</p><div class="row"><a class="btn btn-primary" href="/plans">${req.t('info.parents.families.plans')}</a><a class="btn" href="/grown-ups">${req.t('info.parents.families.link')}</a></div></section>` : '');
// Plans (D16), with the legal pages that cover them: only once paid plans are public.
router.get('/parents', (req, res) => page(req, res, { title: req.t('info.parents.title'), back: '/', description: req.t('info.parents.description'), body: info(req, 'parents', '👪', ['what', ...(familiesOn(req) ? ['plans'] : []), 'stored', 'never', 'ai', 'keep', 'friends', 'builder', 'languages'], html`${families(req)}${googlePrivacy(req)}${contact(req)}`) }));
router.get('/sdk', (req, res) => {
  const t = req.t;
  // The SDK names (BRB.storage.get...) are code and stay as they are in every language.
  const body = html`<div class="wrap narrow" style="padding:0"><h1>🧰 ${t('info.sdk.heading')}</h1>
    <section class="panel"><h2 dir="ltr">window.BRB</h2>
      <p>${tHtml(t, 'info.sdk.brb.p1', { get: codeBlock('BRB.storage.get(key)'), set: codeBlock('BRB.storage.set(key, value)') })}</p>
      <p>${tHtml(t, 'info.sdk.brb.p2', { submit: codeBlock('BRB.score.submit(score)'), over: codeBlock('BRB.gameOver({won, score})') })}</p>
      <p>${tHtml(t, 'info.sdk.brb.p3', { fx: codeBlock('BRB.fx.confetti(), BRB.fx.shake(el), BRB.fx.flash(), BRB.sfx.play("jump"|"hit"|"win"|"lose"|"coin"), BRB.fx.tween(), BRB.fx.fit(canvas, w, h)') })}</p>
      <p>${tHtml(t, 'info.sdk.brb.p4', { full: codeBlock('BRB.fullscreen()'), orient: codeBlock('BRB.orientation("landscape")') })}</p>
      <p>${tHtml(t, 'info.sdk.brb.p5', { lang: codeBlock('BRB.user.lang'), dir: codeBlock('BRB.user.dir') })}</p>
    </section>
    <section class="panel"><h2>${t('info.sdk.rules.h')}</h2><p>${t('info.sdk.rules.p1')}</p></section></div>`;
  page(req, res, { title: t('info.sdk.title'), back: '/build', backLabel: t('nav.build'), description: t('info.sdk.description'), body });
});

// ---------------------------------------------------------------- legal pages
// Always public (also before BILLING_PUBLIC): /terms, /refunds and /privacy. Until paid plans are public they say so at
// the top. Turning on TERMS_PUBLISHED (Checkout asks the buyer to agree to /terms) stays the owner's choice, after the
// legal review (docs/legal-review.md).
function legal(req, pageKey, emoji, sections) {
  const t = req.t;
  const date = fmt(req.locale || DEFAULT_LOCALE).day(Date.parse(`${LEGAL_UPDATED}T00:00:00Z`), { year: 'numeric', month: 'long', day: 'numeric' });
  // The "not on sale yet" notice is about the billing sections, so not on the /privacy that leaves them out.
  const notYet = familiesOn(req) || (pageKey === 'privacy' && !fullPrivacy(req)) ? '' : html`<p class="notice legal-notyet"${fallback(t, 'info.legal.notYet')}>${t('info.legal.notYet')}</p>`;
  return html`<div class="wrap narrow legal" style="padding:0"><h1${fallback(t, `info.${pageKey}.heading`)}>${emoji} ${t(`info.${pageKey}.heading`)}</h1>
    <p class="muted legal-updated"${fallback(t, 'info.legal.updated')}>${tHtml(t, 'info.legal.updated', { date: html`<time datetime="${LEGAL_UPDATED}">${date}</time>` })}</p>${notYet}
    ${sections.filter(Boolean).map(s => (typeof s === 'string' ? section(req, `info.${pageKey}.${s}`, { id: s }) : s))}</div>`;
}
const legalPage = (pageKey, emoji, sections) => (req, res) => page(req, res, { title: req.t(`info.${pageKey}.title`), back: '/', description: req.t(`info.${pageKey}.description`), body: legal(req, pageKey, emoji, sections(req)) });
router.get('/terms', legalPage('terms', '📜', () => ['who', 'accounts', 'schools', 'rules', 'ai', 'games', 'plans', 'ending', 'disclaimers', 'liability', 'disputes', 'changes', 'other', 'contact']));
router.get('/refunds', legalPage('refunds', '💳', () => ['intro', 'cancel', 'refunds', 'special', 'rights', 'contact']));
// The site's privacy text (the /parents sections, with the same paid-plan swaps) plus grown-up accounts, payments and
// school billing. The billing sections name plans, so they show only to grown-up accounts, school staff and the
// platform admin, or with ?for=grownups. Kids, students and guests (whose footer links here) get the rest; the
// signed-out also get a "For grown-ups and schools" link to the full text.
export const fullPrivacy = req => legalReader(req.user) || req.query.for === 'grownups';
router.get('/privacy', legalPage('privacy', '🔒', req => {
  const full = fullPrivacy(req);
  return ['intro',
    ...['stored', 'never', 'ai', 'keep'].map(s => section(req, `info.parents.${s}`, { id: s })), googlePrivacy(req),
    ...(full ? ['grownups', 'linking', 'payments', 'schoolBilling'] : []), 'children', ...(full ? ['billingKeep', 'where'] : []),
    !full && !req.user ? 'more' : null, 'contact'];
}));
