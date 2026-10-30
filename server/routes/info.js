// Plain-language info pages: safety, for grown-ups, the builder SDK summary, and the legal pages (terms, refunds,
// privacy). Text lives in the locale files under info.<page>.<section>.<item>; a section's layout is the order of its
// items in en.json: h (heading), s1.. (sub-headings), p1.. (paragraphs), li1.. (list items; a run of them is one list).
// paidN items are the wording for once paid plans are public (familiesOn: billing on, and BILLING_PUBLIC or the
// preview cookie): paidN replaces pN then, or is added where it stands when there is no pN; before that it is skipped.
import { Router } from 'express';
import { googleEnabled } from '../oidc.js';
import { html, raw } from '../views/html.js';
import { page, legalReader } from '../views/layout.js';
import { tHtml, dictionary, DEFAULT_LOCALE, fmt } from '../i18n/index.js';
import { config } from '../config.js';
import { familiesOn, madeOn } from '../services/family.js';
import { langsWithKey } from '../seo.js';
import { isGrownup } from '../auth.js';
export const router = Router();
/** Search engines may index these pages, in the languages their heading is written in (server/seo.js). */
const indexed = (path, key) => ({ index: true, path, langs: langsWithKey(key) });

/** The legal pages' "Last updated" date (a calendar day, UTC). Change it with every change to their text. */
export const LEGAL_UPDATED = '2026-10-30';
/** Where the legal pages send people: CONTACT_EMAIL, else the owner's address. */
const legalEmail = () => config.contactEmail || 'greg@oomba.ai';
// The speech-to-text company named in the privacy text (STT_PROVIDER): a company name, never translated.
const STT_COMPANIES = { openai: 'OpenAI', elevenlabs: 'ElevenLabs' };
const sttCompany = () => STT_COMPANIES[config.sttProvider] || STT_COMPANIES.openai;

/** The items of one section, in en.json order, with the paid-plan swaps applied. -> [{ kind, key }] */
const keyCache = new WeakMap();   // English dictionary -> prefix -> its item names (a reload makes a new dictionary)
function sectionKeys(prefix) {
  const en = dictionary(DEFAULT_LOCALE);
  let byPrefix = keyCache.get(en); if (!byPrefix) keyCache.set(en, byPrefix = new Map());
  if (!byPrefix.has(prefix)) byPrefix.set(prefix, Object.keys(en).filter(k => k.startsWith(`${prefix}.`)).map(k => k.slice(prefix.length + 1)).filter(k => !k.includes('.')));
  return byPrefix.get(prefix);
}
// made: parent-made child accounts are on (madeOn): madeP<n> / madeLi<n> stand in for p<n> / li<n> (e.g. the "no delete
// button yet" sentences, while a grown-up can delete an account they made from their family page).
function items(prefix, paid, made = false) {
  const out = []; const keys = sectionKeys(prefix);
  const has = new Set(keys);
  for (const k of keys) {
    const mm = /^made(P|Li)(\d+)$/.exec(k);
    if (mm) { if (made) out.push({ kind: mm[1].toLowerCase(), key: `${prefix}.${k}` }); continue; }
    const m = /^(?:(paid)|(p|li|s))(\d+)$/.exec(k); if (!m) continue;
    if (m[1] && !paid) continue;                                   // paid wording before launch
    if (!m[1] && paid && has.has(`paid${m[3]}`) && m[2] === 'p') continue;  // replaced by its paidN
    if (!m[1] && made && m[2] !== 's' && has.has(`made${m[2] === 'p' ? 'P' : 'Li'}${m[3]}`)) continue;  // replaced by its madeN
    out.push({ kind: m[1] ? 'p' : m[2], key: `${prefix}.${k}` });
  }
  return out;
}
/** One section as a panel: <h2>, then its paragraphs, sub-headings and lists. A list is marked English only when every
 *  item in it is (one new item still in English is marked on its own <li>). */
/** lang/dir for an element whose text is the English fallback (a right-to-left page keeps English sentences readable:
 *  the full stop stays at the end), nothing when the key is written in the page's language. */
const fallback = (t, key) => (t.own(key) ? '' : html` lang="en" dir="ltr"`);
// level: the heading level of the section (2; 3 on /parents, where the sections sit under "Safety and privacy, in detail").
// fold: the section's text folds away under its heading (a <details>; /parents, where the page is long on phones). The
// id stays on the <section>, and app.js opens the fold when a link leads to it (/parents#keep).
export function section(req, prefix, { id, paid = familiesOn(req), made = madeOn(req), level = 2, fold = false } = {}) {
  const t = req.t; const vars = { email: legalEmail(), provider: sttCompany() }; const out = []; let list = null;
  const h = raw(`h${level}`), sub = raw(`h${level + 1}`);
  for (const it of items(prefix, paid, made)) {
    if (it.kind === 'li') { if (!list) out.push(list = { keys: [], items: [] }); list.keys.push(it.key); list.items.push(html`<li${fallback(t, it.key)}>${tHtml(t, it.key, vars)}</li>`); continue; }
    list = null;
    out.push(it.kind === 's' ? html`<${sub}${fallback(t, it.key)}>${tHtml(t, it.key, vars)}</${sub}>` : html`<p${fallback(t, it.key)}>${tHtml(t, it.key, vars)}</p>`);
  }
  const head = html`<${h}${fallback(t, `${prefix}.h`)}>${t(`${prefix}.h`)}</${h}>`;
  const rest = out.map(x => (x.items ? html`<ul${x.keys.every(k => !t.own(k)) ? fallback(t, x.keys[0]) : ''}>${x.items}</ul>` : x));
  return html`<section class="panel"${id ? html` id="${id}"` : ''}>${fold ? folded(head, rest) : html`${head}${rest}`}</section>`;
}
/** A heading and the text under it, folded away until the heading is tapped. */
export const folded = (head, body) => html`<details class="lp-fold"><summary>${head}</summary><div class="lp-fold-body">${body}</div></details>`;
/** sections: section keys under info.<pageKey>; extra: more sections after them. */
function info(req, pageKey, emoji, sections, extra = '') {
  return html`<div class="wrap narrow" style="padding:0"><h1>${emoji} ${req.t(`info.${pageKey}.heading`)}</h1>${sections.map(s => section(req, `info.${pageKey}.${s}`, { id: s }))}${extra}</div>`;
}
const codeBlock = s => html`<code dir="ltr">${s}</code>`;

/** The parent pages' first button: while paid-plan pages are on (familiesOn), "Set up your child — free", the grown-up
 *  sign-up; before that, "Let your child start free" (a child's own account: a made-up name and a password). A
 *  signed-in grown-up gets their family page instead. -> { href, key, label } */
export function setupLink(req) {
  // Until a language has "Set up your child — free", its already-translated "Make a grown-up account" stands in.
  const [href, key] = isGrownup(req.user) ? ['/family', 'family.landing.toFamily']
    : !familiesOn(req) ? ['/signup?for=kid', 'parents.cta.start'] : ['/grown-ups/signup', req.t.own('parents.cta.setup') ? 'parents.cta.setup' : 'parents.cta.grownup'];
  return { href, key, label: req.t(key) };
}
/** The end of /safety: "Set up your child". Signed out it opens the set-up (setupLink) at once; anyone signed in as a
 *  kid, a guest included (often a child who tapped Play), gets the parent page instead, so a kid's page never links a
 *  grown-up sign-up (tests/e2e/billing.spec.js, the kid-page crawl). */
function safetyEnd(req) {
  const t = req.t; const u = req.user; const s = setupLink(req);
  const key = s.key === 'family.landing.toFamily' ? s.key : 'info.safety.setup';
  const href = !u || isGrownup(u) ? s.href : '/parents';
  if (!t.own(key)) return '';   // a translated page stays in one language
  return html`<p class="row lp-cta"><a class="btn btn-primary btn-big" href="${href}">${t(key)}</a></p>`;
}
router.get('/safety', (req, res) => page(req, res, { title: req.t('info.safety.title'), back: '/', description: req.t('info.safety.description'), body: info(req, 'safety', '🛡️', ['box', 'checked', 'chat', 'personal', 'ads'], safetyEnd(req)), seo: indexed('/safety', 'info.safety.heading') }));
// "Contact us" (CONTACT_EMAIL): where the page's "a grown-up can contact us" leads. Not shown until it is set.
export const contact = (req, level = 2) => (config.contactEmail ? html`<section class="panel" id="contact">${raw(`<h${level}>`)}${req.t('info.parents.contact.h')}${raw(`</h${level}>`)}
  <p>${tHtml(req.t, 'info.parents.contact.p1', { email: html`<a href="mailto:${config.contactEmail}" dir="ltr">${config.contactEmail}</a>` })}</p></section>` : '');
// With Sign in with Google on, what the site keeps from a school Google account (nothing while it is off).
export function googlePrivacy(req, level = 2, { fold = false } = {}) {
  if (!googleEnabled()) return '';
  const head = html`${raw(`<h${level}>`)}${req.t('google.setup.privacy.h')}${raw(`</h${level}>`)}`, body = html`<p>${req.t('google.setup.privacy.p1')}</p>`;
  return html`<section class="panel" id="google">${fold ? folded(head, body) : html`${head}${body}`}</section>`;
}
// /parents itself is in routes/parents.js: a page for parents with these sections under "Safety and privacy, in detail".
// Its Plans and Family accounts sections (only once paid plans are public) are its own, higher up the page.
/** The /parents privacy and safety sections, in order. /privacy repeats stored, never, ai and keep. */
export const parentSections = () => ['what', 'stored', 'never', 'ai', 'keep', 'friends', 'builder', 'languages'];
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
  page(req, res, { title: t('info.sdk.title'), back: '/build', backLabel: t('nav.build'), description: t('info.sdk.description'), body, seo: { index: true, path: '/sdk/' } });
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
const legalPage = (pageKey, emoji, sections) => (req, res) => page(req, res, { title: req.t(`info.${pageKey}.title`), back: '/', description: req.t(`info.${pageKey}.description`), body: legal(req, pageKey, emoji, sections(req)), seo: { index: true, path: `/${pageKey}` } });
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
    // Parent-made child accounts (docs/decisions.md): only while they are on (madeOn). No plan names, so for every reader.
    madeOn(req) ? 'made' : null,
    ...(full ? ['grownups', 'linking', 'payments', 'schoolBilling', 'schoolSetup'] : []), 'children', ...(full ? ['billingKeep', 'where'] : []),
    !full && !req.user ? 'more' : null, 'contact'];
}));
