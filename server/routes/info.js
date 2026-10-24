// Plain-language info pages: safety, for grown-ups, and the builder SDK summary.
// Text lives in the locale files under info.<page>.<section>.{h,p1,p2...}.
import { Router } from 'express';
import { html } from '../views/html.js';
import { page } from '../views/layout.js';
import { tHtml } from '../i18n/index.js';
export const router = Router();

/** sections: [[sectionKey, paragraphCount]] under info.<pageKey>. */
function info(req, pageKey, emoji, sections) {
  const t = req.t; const k = `info.${pageKey}`;
  return html`<div class="wrap narrow" style="padding:0"><h1>${emoji} ${t(`${k}.heading`)}</h1>${sections.map(([s, n]) => html`<section class="panel"><h2>${t(`${k}.${s}.h`)}</h2>${Array.from({ length: n }, (_, i) => html`<p>${t(`${k}.${s}.p${i + 1}`)}</p>`)}</section>`)}</div>`;
}
const codeBlock = s => html`<code dir="ltr">${s}</code>`;

router.get('/safety', (req, res) => page(req, res, { title: req.t('info.safety.title'), back: '/', description: req.t('info.safety.description'), body: info(req, 'safety', '🛡️', [['box', 1], ['checked', 2], ['chat', 2], ['personal', 1], ['ads', 1]]) }));
router.get('/parents', (req, res) => page(req, res, { title: req.t('info.parents.title'), back: '/', description: req.t('info.parents.description'), body: info(req, 'parents', '👪', [['what', 1], ['data', 1], ['friends', 1], ['builder', 1], ['languages', 1]]) }));
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
