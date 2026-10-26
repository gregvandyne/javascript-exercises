// Plain-language info pages: safety, for grown-ups, and the builder SDK summary.
// Text lives in the locale files under info.<page>.<section>.{h,p1,p2...}.
import { Router } from 'express';
import { googleEnabled } from '../oidc.js';
import { html } from '../views/html.js';
import { page } from '../views/layout.js';
import { tHtml } from '../i18n/index.js';
import { config } from '../config.js';
import { familiesOn } from '../services/family.js';
export const router = Router();

/** sections: [[sectionKey, paragraphCount]] under info.<pageKey>; extra: more sections after them. */
function info(req, pageKey, emoji, sections, extra = '') {
  const t = req.t; const k = `info.${pageKey}`;
  return html`<div class="wrap narrow" style="padding:0"><h1>${emoji} ${t(`${k}.heading`)}</h1>${sections.map(([s, n]) => html`<section class="panel"><h2>${t(`${k}.${s}.h`)}</h2>${Array.from({ length: n }, (_, i) => html`<p>${t(`${k}.${s}.p${i + 1}`)}</p>`)}</section>`)}${extra}</div>`;
}
const codeBlock = s => html`<code dir="ltr">${s}</code>`;

router.get('/safety', (req, res) => page(req, res, { title: req.t('info.safety.title'), back: '/', description: req.t('info.safety.description'), body: info(req, 'safety', '🛡️', [['box', 1], ['checked', 2], ['chat', 2], ['personal', 1], ['ads', 1]]) }));
// "Contact us" (CONTACT_EMAIL): where the page's "a grown-up can contact us" leads. Not shown until it is set.
const contact = req => (config.contactEmail ? html`<section class="panel" id="contact"><h2>${req.t('info.parents.contact.h')}</h2>
  <p>${tHtml(req.t, 'info.parents.contact.p1', { email: html`<a href="mailto:${config.contactEmail}" dir="ltr">${config.contactEmail}</a>` })}</p></section>` : '');
// With Sign in with Google on, what the site keeps from a school Google account (nothing while it is off).
const googlePrivacy = req => (googleEnabled() ? html`<section class="panel" id="google"><h2>${req.t('google.setup.privacy.h')}</h2><p>${req.t('google.setup.privacy.p1')}</p></section>` : '');
// Family accounts (routes/family.js): /grown-ups is linked from here only, and only while families are on.
const families = req => (familiesOn(req) ? html`<section class="panel" id="families"><h2>${req.t('info.parents.families.h')}</h2>
  <p>${req.t('info.parents.families.p1')}</p><p><a class="btn" href="/grown-ups">${req.t('info.parents.families.link')}</a></p></section>` : '');
router.get('/parents', (req, res) => page(req, res, { title: req.t('info.parents.title'), back: '/', description: req.t('info.parents.description'), body: info(req, 'parents', '👪', [['what', 1], ['stored', 2], ['never', 1], ['ai', 1], ['keep', 2], ['friends', 1], ['builder', 1], ['languages', 1]], html`${families(req)}${googlePrivacy(req)}${contact(req)}`) }));
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
