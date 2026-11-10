// Two pages for teachers, school leaders and school IT staff: /research (what three large research reviews found about
// learning games and gamification) and /compliance (where Oomba Academy stands on COPPA, FERPA and the GDPR, and how
// a school asks about a data agreement). Both are public, indexable and have language addresses (/es/research …).
//
// /research uses only the three verified reviews in RESEARCH below (docs/decisions.md "Research and compliance
// pages"): percentile gains up front in plain words, the effect sizes in small print, full citations with DOIs, and
// what the numbers do not prove. Never a number from anywhere else, and never a claim that the studies tested Oomba.
//
// /compliance says only what the Privacy Policy (/privacy, info.privacy.* and info.parents.*), docs/safety.md and the
// code support. Where the legal position still needs the owner's and the lawyer's answer (docs/legal-review.md), the
// public page invites schools to email us, and the sentence that would need sign-off is in PENDING below: shown only
// to the platform admin, marked "not shown publicly", never to anyone else and never in a translation.
import { Router } from 'express';
import { html, raw } from '../views/html.js';
import { page } from '../views/layout.js';
import { tHtml, availableLocales, fmt, DEFAULT_LOCALE } from '../i18n/index.js';
import { isPlatformAdmin } from '../services/schools.js';
import { googleEnabled } from '../oidc.js';
import * as seo from '../seo.js';
import { el, fb, lp, contactEmail } from './teachers.js';

export const router = Router();

/** Last change to the text of these two pages (sitemap lastmod, "Updated" line). Change it with the text. */
export const TRUST_UPDATED = '2026-11-10';

/** The three verified reviews (and only these). The percentiles in research.<key>.stat are where the average student
 *  in the game group lands among the comparison group, from the effect size with normally distributed scores
 *  (Φ(0.33) ≈ 0.63, Φ(0.29) ≈ 0.61, Φ(0.36) ≈ 0.64, Φ(0.49) ≈ 0.69). The citations are not translated. */
export const RESEARCH = [
  { key: 'clark', effects: { g: 0.33 },
    cite: 'Clark, D. B., Tanner-Smith, E. E., & Killingsworth, S. S. (2016). Digital games, design, and learning: A systematic review and meta-analysis. <i>Review of Educational Research, 86</i>(1), 79–122.',
    doi: '10.3102/0034654315582065' },
  { key: 'wouters', effects: { learning: 0.29, retention: 0.36 },
    cite: 'Wouters, P., van Nimwegen, C., van Oostendorp, H., & van der Spek, E. D. (2013). A meta-analysis of the cognitive and motivational effects of serious games. <i>Journal of Educational Psychology, 105</i>(2), 249–265.',
    doi: '10.1037/a0031311' },
  { key: 'sailer', effects: { g: 0.49 },
    cite: 'Sailer, M., & Homner, L. (2020). The gamification of learning: A meta-analysis. <i>Educational Psychology Review, 32</i>(1), 77–112.',
    doi: '10.1007/s10648-019-09498-w' },
];

/** Sentences that need the owner's and the lawyer's confirmation before they may say anything publicly. Shown only to
 *  the platform admin, under the section they belong to (docs/legal-review.md has the open questions). */
export const PENDING = {
  coppa: 'OWNER AND LAWYER TO CONFIRM (docs/legal-review.md items 1, 8 and 31): our COPPA position. Proposed wording, not yet approved: "For school accounts, we rely on the school\'s authorization to collect student information for educational use only, as COPPA allows." Also decide the consent model for kids\' own accounts.',
  ferpa: 'OWNER AND LAWYER TO CONFIRM (docs/legal-review.md item 7): whether we say we act as a "school official" with a legitimate educational interest under FERPA, under the school\'s direct control, using education records only for the school\'s purposes and never re-disclosing them, and which contract terms create that.',
  gdpr: 'OWNER AND LAWYER TO CONFIRM (docs/legal-review.md items 6 and 34): our GDPR and UK GDPR position: the lawful basis, whether we are the controller or a processor for school accounts, whether we need an EU or UK representative (GDPR Art. 27), and whether the UK Children\'s Code applies.',
  dpa: 'OWNER AND LAWYER TO CONFIRM (docs/legal-review.md item 9): whether a standard Data Processing Agreement is available to schools (for example the Student Data Privacy Consortium\'s National DPA), and state agreements such as New York Ed Law 2-d, California SOPIPA and AB 1584, and Illinois SOPPA. Until then the page only invites schools to ask.',
};
const pending = (req, key) => (isPlatformAdmin(req.user) ? html`<p class="notice warn small trust-pending" lang="en" dir="ltr"><b>Not shown publicly.</b> ${PENDING[key]}</p>` : '');

const crumbsNav = (req, crumbs) => html`<nav class="crumbs small" aria-label="${req.t('learn.crumbs')}"><ol>${crumbs.map(([name, p], i) => html`<li>${i < crumbs.length - 1 ? html`<a href="${lp(req, p)}">${name}</a>` : html`<span aria-current="page">${name}</span>`}</li>`)}</ol></nav>`;
const updated = req => html`<p class="muted small lp-updated"${fb(req.t, 'parents.updated')}>${tHtml(req.t, 'parents.updated', { date: html`<time datetime="${TRUST_UPDATED}">${fmt(req.locale || DEFAULT_LOCALE).day(Date.parse(`${TRUST_UPDATED}T00:00:00Z`), { year: 'numeric', month: 'long', day: 'numeric' })}</time>` })}</p>`;
const mailLink = () => { const email = contactEmail(); return html`<a href="mailto:${email}" dir="ltr">${email}</a>`; };
const list = (t, prefix, keys, vars) => html`<ul class="lp-list">${keys.map(k => el(t, 'li', `${prefix}.${k}`, vars))}</ul>`;
/** The pages' own CSS: the research cards' big numbers. Colors are the site's tokens. */
const CSS = raw(`<style>
.trust-find{display:grid;gap:var(--gap,16px);grid-template-columns:repeat(auto-fit,minmax(min(100%,260px),1fr));list-style:none;padding:0;margin:0}
.trust-find>li{display:flex;flex-direction:column;gap:8px;margin:0}
.trust-find h3{margin:0;font-size:1rem}
.trust-big{font-size:clamp(1.25rem,1rem + 1.2vw,1.6rem);font-weight:800;line-height:1.2;margin:0}
.trust-fine{font-size:.85rem;color:var(--muted);margin:0;overflow-wrap:anywhere}
.trust-cites{padding-inline-start:1.2em}
.trust-cites li{margin-block:.5em;overflow-wrap:anywhere}
.trust-pending{margin-block:8px}
</style>`);

// ---------------------------------------------------------------------------------------------------- /research
router.get('/research', (req, res) => {
  const t = req.t; const path = '/research';
  const card = r => html`<li class="panel" id="${r.key}" aria-labelledby="${r.key}-h">
    ${el(t, 'h3', `research.${r.key}.h`, {}, ` id="${r.key}-h"`)}
    ${el(t, 'p', `research.${r.key}.stat`, {}, ' class="trust-big"')}
    ${el(t, 'p', `research.${r.key}.p`)}
    ${el(t, 'p', `research.${r.key}.small`, {}, ' class="trust-fine"')}
  </li>`;
  const crumbs = [[t('nav.home'), '/'], [t('nav.teachers'), '/teachers'], [t('research.name'), path]];
  const body = html`${CSS}<div class="lp">
    ${crumbsNav(req, crumbs)}
    <section class="lp-hero lp-hero-sm" aria-labelledby="lp-h1">
      ${el(t, 'p', 'research.kicker', {}, ' class="lp-kicker"')}
      ${el(t, 'h1', 'research.h1', {}, ' id="lp-h1"')}
      ${el(t, 'p', 'research.lead', {}, ' class="lead"')}
      ${updated(req)}
    </section>
    <section class="lp-sec" id="findings" aria-labelledby="findings-h">
      ${el(t, 'h2', 'research.findings.h', {}, ' id="findings-h"')}
      <ul class="trust-find">${RESEARCH.map(card)}</ul>
    </section>
    <div class="lp-cols">
      <section class="panel" id="read" aria-labelledby="read-h">${el(t, 'h2', 'research.read.h', {}, ' id="read-h"')}${el(t, 'p', 'research.read.p1')}${el(t, 'p', 'research.read.p2', {}, ' class="trust-fine"')}</section>
      <section class="panel" id="limits" aria-labelledby="limits-h">${el(t, 'h2', 'research.limits.h', {}, ' id="limits-h"')}${list(t, 'research.limits', ['li1', 'li2', 'li3', 'li4'])}</section>
      <section class="panel" id="use" aria-labelledby="use-h">${el(t, 'h2', 'research.use.h', {}, ' id="use-h"')}${el(t, 'p', 'research.use.p')}${list(t, 'research.use', ['li1', 'li2', 'li3'])}</section>
    </div>
    <section class="panel" id="sources" aria-labelledby="sources-h">
      ${el(t, 'h2', 'research.sources.h', {}, ' id="sources-h"')}
      <ol class="trust-cites" lang="en" dir="ltr">${RESEARCH.map(r => html`<li>${raw(r.cite)} <a href="https://doi.org/${r.doi}" rel="noopener">https://doi.org/${r.doi}</a></li>`)}</ol>
    </section>
    <ul class="chips lp-more">
      <li><a class="chip" href="${lp(req, '/teachers')}"><span aria-hidden="true">🍎</span>${t('research.links.teachers')}</a></li>
      <li><a class="chip" href="${lp(req, '/compliance')}"><span aria-hidden="true">🔒</span>${t('compliance.name')}</a></li>
    </ul>
  </div>`;
  page(req, res, {
    title: t('research.title'), description: t('research.description'), body, bodyClass: 'lp-page',
    seo: {
      index: true, path, langs: seo.langsWithKey('research.h1'), image: '/og/research.jpg', imageAlt: t('research.h1'), type: 'article',
      jsonld: [seo.graph([
        { '@type': 'Article', '@id': seo.abs(req, path), url: seo.abs(req, path), mainEntityOfPage: seo.abs(req, path), headline: seo.plainText(t('research.h1')), description: t('research.description'),
          datePublished: TRUST_UPDATED, dateModified: TRUST_UPDATED, inLanguage: req.pathLocale || DEFAULT_LOCALE, author: { '@id': seo.orgId(req) }, publisher: { '@id': seo.orgId(req) },
          image: seo.abs(req, '/og/research.jpg'), audience: { '@type': 'EducationalAudience', educationalRole: 'teacher' }, isPartOf: { '@id': seo.abs(req, '/#website') },
          citation: RESEARCH.map(r => ({ '@type': 'ScholarlyArticle', name: seo.plainText(r.cite), sameAs: `https://doi.org/${r.doi}` })) },
        seo.breadcrumbLd(req, crumbs), seo.organizationLd(req),
      ])],
    },
  });
});

// ---------------------------------------------------------------------------------------------------- /compliance
router.get('/compliance', (req, res) => {
  const t = req.t; const path = '/compliance';
  const google = googleEnabled();
  const vars = { email: mailLink(), privacy: '/privacy', safety: lp(req, '/safety'), count: availableLocales().length };
  const sec = (id, items, { extra = '', after = '' } = {}) => html`<section class="panel" id="${id}" aria-labelledby="${id}-h">
    ${el(t, 'h2', `compliance.${id}.h`, {}, ` id="${id}-h"`)}${extra}
    ${items.length ? list(t, `compliance.${id}`, items, vars) : ''}${after}
  </section>`;
  const crumbs = [[t('nav.home'), '/'], [t('nav.teachers'), '/teachers'], [t('compliance.name'), path]];
  const body = html`${CSS}<div class="lp">
    ${crumbsNav(req, crumbs)}
    <section class="lp-hero lp-hero-sm" aria-labelledby="lp-h1">
      ${el(t, 'p', 'compliance.kicker', {}, ' class="lp-kicker"')}
      ${el(t, 'h1', 'compliance.h1', {}, ' id="lp-h1"')}
      ${el(t, 'p', 'compliance.lead', vars, ' class="lead"')}
      ${updated(req)}
    </section>
    ${sec('glance', [google ? 'li1google' : 'li1', 'li2', 'li3', 'li4', 'li5'])}
    <div class="lp-cols">
      ${sec('coppa', ['li1', 'li2', 'li3', 'li4'], { extra: el(t, 'p', 'compliance.coppa.p1'), after: html`${el(t, 'p', 'compliance.coppa.p2', vars)}${pending(req, 'coppa')}` })}
      ${sec('ferpa', ['li1', 'li2', 'li3', 'li4'], { after: html`${el(t, 'p', 'compliance.ferpa.p', vars)}${pending(req, 'ferpa')}` })}
      ${sec('gdpr', [], { extra: html`${el(t, 'p', 'compliance.gdpr.p1', vars)}${el(t, 'p', 'compliance.gdpr.p2', vars)}${pending(req, 'gdpr')}` })}
      ${sec('dpa', [], { extra: html`${el(t, 'p', 'compliance.dpa.p1', vars)}${el(t, 'p', 'compliance.dpa.p2', vars)}${pending(req, 'dpa')}` })}
      ${sec('keep', ['li1', 'li2', 'li3'])}
      ${sec('others', ['li1', ...(google ? ['li2'] : []), 'li3'])}
      ${sec('security', ['li1', 'li2', ...(google ? ['li3'] : [])])}
    </div>
    <section class="panel" id="contact" aria-labelledby="contact-h">${el(t, 'h2', 'compliance.contact.h', {}, ' id="contact-h"')}${el(t, 'p', 'compliance.contact.p', vars)}</section>
    <ul class="chips lp-more">
      <li><a class="chip" href="/privacy"><span aria-hidden="true">🔒</span>${t('layout.footer.privacy')}</a></li>
      <li><a class="chip" href="${lp(req, '/safety')}"><span aria-hidden="true">🛡️</span>${t('layout.footer.safety')}</a></li>
      <li><a class="chip" href="${lp(req, '/teachers')}"><span aria-hidden="true">🍎</span>${t('research.links.teachers')}</a></li>
      <li><a class="chip" href="${lp(req, '/research')}"><span aria-hidden="true">📚</span>${t('research.name')}</a></li>
    </ul>
  </div>`;
  page(req, res, {
    title: t('compliance.title'), description: t('compliance.description'), body, bodyClass: 'lp-page',
    seo: {
      index: true, path, langs: seo.langsWithKey('compliance.h1'), image: '/og/compliance.jpg', imageAlt: t('compliance.h1'),
      jsonld: [seo.graph([
        { '@type': 'WebPage', '@id': seo.abs(req, path), url: seo.abs(req, path), name: t('compliance.title'), description: t('compliance.description'), dateModified: TRUST_UPDATED,
          isPartOf: { '@id': seo.abs(req, '/#website') }, publisher: { '@id': seo.orgId(req) },
          audience: [{ '@type': 'EducationalAudience', educationalRole: 'administrator' }, { '@type': 'EducationalAudience', educationalRole: 'teacher' }] },
        seo.breadcrumbLd(req, crumbs), seo.organizationLd(req),
      ])],
    },
  });
});
