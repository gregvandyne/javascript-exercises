// Cyber Defenders teacher page (/teachers/cyber-defenders): the public program page for the second course,
// built like the CS Quest one in routes/cs-quest.js (landing-page helpers from routes/teachers.js, view
// helpers from views/cs-quest.js). It renders what lives in the course data (seed-lessons/cyber-defenders,
// via courses.cyberCatalogue()): the overview, the two games, the units and steps, the published standards
// mapping (CYBER.ORG v1.0 per band, the Common Sense topic, any inherited CSTA code), the per-unit teacher
// notes, and the printed pack — the map and the notes on their own page (?print=1), the printed-materials
// hook this course has. Copy under teachers.cd.* (English-first, marked lang="en" until a language has it);
// unit and step titles, codes and notes are English data, rendered lang="en". Anyone may read the page:
// Cyber Defenders is a standalone course, so there is no staff gate and nothing to add to a library.
import { Router } from 'express';
import { html, raw, esc } from '../views/html.js';
import { page, notFound } from '../views/layout.js';
import { requireUser } from '../auth.js';
import * as S from '../services/schools.js';
import * as C from '../services/courses.js';
import * as seo from '../seo.js';
import { el, lp, faqBlock, launchGame } from './teachers.js';
import * as V from '../views/cs-quest.js';
import { crewArt } from '../views/components.js';

export const router = Router();
const K = 'teachers.cd';
/** A CYBER.ORG v1.0 code as a chip (these have no statement lookup, unlike CSTA). */
const cyChip = code => raw(`<span class="csq-badge csq-ids" lang="en" dir="ltr">${esc(code)}</span>`);

/** One band's standards map: every step, grouped under unit header rows. */
function mapTable(req, cat, band) {
  const t = req.t;
  const rows = cat.units.map(u => {
    const head = `<tr class="csq-map-unit"><th colspan="5" lang="en" dir="ltr">${esc(t('cs.unit.n', { n: u.n }))} · ${esc(u.title)}${u.stamp ? ` — ${esc(u.stamp)} stamp` : ''}</th></tr>`;
    const body = (u.steps || []).map(s => {
      const st = (s.standards || {})[band] || {};
      return html`<tr><td dir="ltr">${s.n}</td><td lang="en" dir="ltr">${(s.titles || {})[band] || s.n}</td>
        <td><span class="csq-idrow">${(st.cyberorg || []).map(cyChip)}</span></td><td lang="en" dir="ltr">${st.commonSense || ''}</td>
        <td>${(st.csta || []).length ? V.idChips(st.csta) : html`<span class="muted">—</span>`}</td></tr>`;
    }).join('');
    return raw(head) + body;
  }).join('');
  return html`<div class="csq-tbl"><table class="tbl csq-cov"><thead><tr><th>${t(`${K}.map.cols.step`)}</th><th>${t(`${K}.map.cols.title`)}</th><th>${t(`${K}.map.cols.cyberorg`)}</th><th>${t(`${K}.map.cols.cs`)}</th><th>${t(`${K}.map.cols.csta`)}</th></tr></thead><tbody>${raw(rows)}</tbody></table></div>`;
}

/** The standards map and the teacher notes, shared by the page and its print view. */
function mapAndNotes(req, cat) {
  const t = req.t;
  return html`
  <section class="lp-sec" id="map" aria-labelledby="map-h">${el(t, 'h2', `${K}.map.h`, {}, ' id="map-h"')}
    ${el(t, 'p', `${K}.map.p`)}
    <div class="csq-stats"><div class="csq-stat"><b dir="ltr">${cat.registry.cyberorgCodes['1b'].length}</b>${el(t, 'span', `${K}.standards.b1`)}</div><div class="csq-stat"><b dir="ltr">${cat.registry.cyberorgCodes['2'].length}</b>${el(t, 'span', `${K}.standards.b2`)}</div><div class="csq-stat"><b dir="ltr">${cat.registry.frameworks.commonSense.topics.length}</b>${el(t, 'span', `${K}.standards.topics`)}</div></div>
    <h3 lang="en" dir="ltr">Explorer · grades 3-5</h3>${mapTable(req, cat, '1b')}
    <h3 lang="en" dir="ltr">Pro · grades 6-8</h3>${mapTable(req, cat, '2')}
    ${el(t, 'p', `${K}.map.v1`, {}, ' class="small muted"')}
    ${el(t, 'p', `${K}.map.rename`, {}, ' class="small muted"')}</section>
  <section class="lp-sec" id="notes" aria-labelledby="notes-h">${el(t, 'h2', `${K}.notes.h`, {}, ' id="notes-h"')}
    ${el(t, 'p', `${K}.notes.p`)}
    ${cat.units.map(u => html`<article class="panel"><h3 lang="en" dir="ltr">${t('cs.unit.n', { n: u.n })} · ${u.title}</h3>${V.enList(u.teacherNotes)}</article>`)}</section>`;
}

/** The Spot-the-Trick printable pack (?print=tricks): the Trick Inbox game's own messages as cut-out
 *  cards (brand-styled: Leaf header band, Spark card numbers, Cream cards on white), then the teacher
 *  answer key. Card text, clues, right moves and explanations are the game's data verbatim
 *  (seed-lessons/cyber-defenders/trick-pack.json) — nothing is re-written for print. */
const TRICK_CSS = `<style>
.cdt-head{background:#1F9D63;color:#FFFDF2;border-radius:12px;padding:14px 18px;margin-bottom:14px}
.cdt-head h1{margin:0 0 4px}.cdt-head p{margin:0}
.cdt-card-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.cdt-card{border:2px solid #141414;border-radius:12px;padding:12px 14px;background:#FFFDF2;break-inside:avoid}
.cdt-card h3{margin:0 0 6px;font-size:15px}.cdt-num{background:#FFD23F;border-radius:999px;padding:1px 8px;font-weight:700}
.cdt-meta{font-size:13px;margin:0 0 6px}.cdt-body{margin:0 0 8px}.cdt-btn{display:inline-block;border:1.5px solid #141414;border-radius:8px;padding:2px 10px;font-weight:600}
.cdt-moves{font-size:13px;border-top:1px dashed #141414;padding-top:6px;margin:0}
.cdt-key{break-before:page}.cdt-key li{margin-bottom:8px}
@media print{.cdt-card-grid{grid-template-columns:1fr 1fr}}
</style>`;
function trickPackBody(req, cat) {
  const t = req.t, pack = cat.trickPack || { cards: [], moves: [] };
  const card = c => html`<article class="cdt-card"><h3><span class="cdt-num" dir="ltr">${c.n}</span> ${c.kind === 'chat' ? '💬 Chat message' : c.kind === 'post' ? '📣 Post' : '✉️ Letter'}</h3>
    <p class="cdt-meta" lang="en" dir="ltr"><b>From:</b> ${c.from}${c.subject ? html`<br><b>Subject:</b> ${c.subject}` : ''}</p>
    <p class="cdt-body" lang="en" dir="ltr">${c.body}</p>
    ${c.button ? html`<p><span class="cdt-btn" lang="en" dir="ltr">${c.button}</span></p>` : ''}
    <p class="cdt-moves">✂️ What should a Defender do? ${(pack.moves || []).join(' · ')}</p></article>`;
  const key = (pack.cards || []).map(c => html`<li lang="en" dir="ltr"><b>Card ${c.n} — ${c.from}:</b> <b>${c.answer.move}</b>${c.answer.alsoFine && c.answer.alsoFine.length ? html` (also fine: ${c.answer.alsoFine.join(', ')})` : ''}. ${c.answer.clues && c.answer.clues.length ? html`Clues: ${c.answer.clues.join('; ')}. ` : 'No hidden clues — this one is safe. '}${c.answer.why}</li>`).join('');
  return html`<div class="printdoc csq-print"><div class="cdt-head"><h1 lang="en" dir="ltr">🔍 Spot the Trick — printable cards</h1>
    <p>Cyber Defenders · the offline Trick Inbox. Cut out the cards, mix them up, and sort them as a class: which are tricks, which are safe, and what is the right move for each? The answers are on the last page — teachers only.</p></div>
    <div class="cdt-card-grid">${raw((pack.cards || []).map(card).join(''))}</div>
    <section class="cdt-key"><h2>🔑 Answer key (teachers only)</h2><ol>${raw(key)}</ol>
    <p class="small muted" lang="en" dir="ltr">The calm routine for every trick: do not reply, do not tap, tell a trusted adult. Cards are the Trick Inbox game's own messages — the same ones students meet in Unit 4 and the boss round.</p></section></div>`;
}

router.get('/teachers/cyber-defenders', (req, res) => {
  const t = req.t, cat = C.cyberCatalogue();
  if (req.query.print === 'tricks') {
    return page(req, res, { title: `${t(`${K}.title`)} — Spot the Trick pack`, body: trickPackBody(req, cat), head: V.CSS + TRICK_CSS, bare: true, bodyClass: 'printpage', scripts: ['/js/print.js'] });
  }
  if (req.query.print === '1') {
    const body = html`<div class="printdoc csq-print"><h1 lang="en" dir="ltr">🦉 ${esc(cat.program.name)} — ${t(`${K}.print.h`)}</h1>
      <p class="muted" lang="en" dir="ltr">${esc(cat.program.standards)}</p>${mapAndNotes(req, cat)}</div>`;
    return page(req, res, { title: `${t(`${K}.title`)} — ${t(`${K}.print.h`)}`, body, head: V.CSS, bare: true, bodyClass: 'printpage', scripts: ['/js/print.js'] });
  }
  const staff = !!req.user && !req.user.is_guest && S.isSchoolStaff(req.user);
  const crew = [
    { slug: 'packet-post', key: 'packetPost', emoji: '📮', title: 'Packet Post' },
    { slug: 'would-you-rather', key: 'wouldYouRather', emoji: '🤔', title: 'Would You Rather?' },
    { slug: 'trick-inbox', key: 'trickInbox', emoji: '📥', title: 'Trick Inbox' },
    { slug: 'escape-the-post-office', key: 'escape', emoji: '🔐', title: 'Escape the Post Office' },
  ].map(c => ({ ...c, live: launchGame(c.slug) }));
  const unitItem = u => html`<li class="panel"><b lang="en" dir="ltr">${t('cs.unit.n', { n: u.n })} · ${u.title}</b>${u.stamp ? html` <span class="chip-s">🏅 ${t(`${K}.units.stamp`, { stamp: u.stamp })}</span>` : ''}
    <ol class="csq-lessons" lang="en" dir="ltr">${(u.steps || []).map(s => html`<li>${s.n} ${(s.titles || {})['1b'] || s.n}${(s.titles || {})['2'] && s.titles['2'] !== s.titles['1b'] ? html` <span class="small muted">(Pro: ${s.titles['2']})</span>` : ''}</li>`)}</ol></li>`;
  const faqPairs = [1, 2, 3, 4, 5, 6].map(n => [`${K}.faq.q${n}`, `${K}.faq.a${n}`]).filter(([qk, ak]) => t.own(qk) && t.own(ak));
  const faq = faqBlock(req, faqPairs, `${K}.faq.h`, { teachers: lp(req, '/teachers') });
  const path = '/teachers/cyber-defenders';
  const crumbs = [[t('nav.home'), '/'], [t('nav.teachers'), '/teachers'], [t(`${K}.crumb`), path]];
  const codes = [...new Set([...cat.registry.cyberorgCodes['1b'], ...cat.registry.cyberorgCodes['2']])];
  const body = html`<div class="lp">
  <nav class="crumbs small" aria-label="${t('learn.crumbs')}"><ol>${crumbs.map(([name, p], i) => html`<li>${i < crumbs.length - 1 ? html`<a href="${lp(req, p)}">${name}</a>` : html`<span aria-current="page">${name}</span>`}</li>`)}</ol></nav>
  <section class="lp-hero" aria-labelledby="lp-h1">
    ${el(t, 'p', `${K}.kicker`, {}, ' class="lp-kicker"')}
    ${el(t, 'h1', `${K}.h1`, {}, ' id="lp-h1"')}
    ${el(t, 'p', `${K}.lead`, {}, ' class="lead"')}
    <ul class="lp-badges">${['steps', 'units', 'games', 'minutes', 'free'].map(x => html`<li>${el(t, 'span', `${K}.badges.${x}`)}</li>`)}</ul>
    <div class="row lp-cta"><a class="btn btn-primary btn-big" href="${lp(req, '/courses/cyber-defenders')}">🦉 ${t(`${K}.cta.open`)}</a><a class="btn btn-big" href="${path}?print=1" target="_blank" rel="noopener">🖨️ ${t(`${K}.print.button`)}</a></div>
  </section>
  <section class="lp-sec" id="promise" aria-labelledby="promise-h">${el(t, 'h2', `${K}.promise.h`, {}, ' id="promise-h"')}
    <ul class="lp-list">${[1, 2, 3, 4, 5, 6].map(n => el(t, 'li', `${K}.promise.li${n}`))}</ul></section>
  <section class="lp-sec" id="crew" aria-labelledby="crew-h">${el(t, 'h2', `${K}.crew.h`, {}, ' id="crew-h"')}${el(t, 'p', `${K}.crew.p`)}
    <ul class="csq-crew">${crew.map(c => html`<li class="panel">${crewArt(c.slug, c.emoji)}<h3 lang="en" dir="ltr">${c.title}</h3>
      ${el(t, 'p', `${K}.crew.${c.key}`, {}, ' class="small"')}
      <div class="row">${c.live ? html`<a class="btn btn-primary" href="/play/${c.slug}" rel="nofollow">▶ ${t(`${K}.crew.try`)}</a>` : html`<a class="btn" href="${lp(req, '/courses/cyber-defenders')}">🦉 ${t(`${K}.crew.inCourse`)}</a>`}</div></li>`)}</ul></section>
  <section class="lp-sec" id="units" aria-labelledby="units-h">${el(t, 'h2', `${K}.units.h`, {}, ' id="units-h"')}${el(t, 'p', `${K}.units.p`)}
    <ul class="csq-public-units">${cat.units.map(unitItem)}</ul></section>
  <section class="lp-sec" id="finale" aria-labelledby="finale-h">${el(t, 'h2', `${K}.finale.h`, {}, ' id="finale-h"')}${el(t, 'p', `${K}.finale.p`)}
    <ul class="lp-list">${[1, 2, 3, 4, 5, 6].map(n => el(t, 'li', `${K}.finale.li${n}`))}</ul>
    ${el(t, 'p', `${K}.finale.fair`)}</section>
  ${mapAndNotes(req, cat)}
  <div class="lp-cols">
    <section class="panel" id="safety" aria-labelledby="safety-h">${el(t, 'h2', `${K}.safety.h`, {}, ' id="safety-h"')}
      <ul class="lp-list">${[1, 2, 3, 4].map(n => el(t, 'li', `${K}.safety.li${n}`))}</ul></section>
    <section class="panel" id="print" aria-labelledby="print-h">${el(t, 'h2', `${K}.print.h`, {}, ' id="print-h"')}
      ${el(t, 'p', `${K}.print.p`)}
      <p class="row"><a class="btn" href="${path}?print=1" target="_blank" rel="noopener">🖨️ ${t(`${K}.print.button`)}</a><a class="btn" href="${path}?print=tricks" target="_blank" rel="noopener">🔍 ${t(`${K}.print.tricks`)}</a><a class="btn" href="/teachers/spot-the-trick-pack.pdf" download>⬇️ ${t(`${K}.print.pdf`)}</a></p></section>
  </div>
  ${faq.markup}
  <section class="panel lp-start" id="start" aria-labelledby="start-h">${el(t, 'h2', `${K}.start.h`, {}, ' id="start-h"')}${el(t, 'p', staff ? `${K}.start.staff` : `${K}.start.p`)}
    <div class="row"><a class="btn btn-primary btn-big" href="${lp(req, '/courses/cyber-defenders')}">🦉 ${t(`${K}.cta.open`)}</a></div></section>
  </div>`;
  const course = {
    '@type': ['Course', 'LearningResource'], '@id': seo.abs(req, `${path}#course`), url: seo.abs(req, path), name: 'Cyber Defenders', description: t(`${K}.description`),
    provider: { '@id': seo.orgId(req) }, educationalLevel: 'Grades 3-8', inLanguage: 'en', isAccessibleForFree: true, learningResourceType: 'Lesson plan', timeRequired: 'PT5H',
    teaches: [...new Set(cat.units.flatMap(u => (u.steps || []).map(s => (s.titles || {})['1b'])))], audience: { '@type': 'EducationalAudience', educationalRole: 'teacher' },
    educationalAlignment: [
      ...codes.map(code => ({ '@type': 'AlignmentObject', alignmentType: 'teaches', educationalFramework: 'CYBER.ORG K-12 Cybersecurity Learning Standards v1.0', targetName: code })),
      ...cat.registry.frameworks.commonSense.topics.map(topic => ({ '@type': 'AlignmentObject', alignmentType: 'teaches', educationalFramework: 'Common Sense Education Digital Citizenship Curriculum', targetName: topic })),
    ],
  };
  page(req, res, {
    title: t(`${K}.title`), description: t(`${K}.description`), body, bodyClass: 'lp-page', head: V.CSS,
    seo: {
      index: true, path, langs: seo.langsWithKey(`${K}.h1`), image: '/og/teachers.jpg', imageAlt: t(`${K}.title`),
      jsonld: [seo.graph([
        { '@type': 'WebPage', '@id': seo.abs(req, path), url: seo.abs(req, path), name: t(`${K}.title`), description: t(`${K}.description`), isPartOf: { '@id': seo.abs(req, '/#website') }, publisher: { '@id': seo.orgId(req) }, audience: { '@type': 'EducationalAudience', educationalRole: 'teacher' }, mainEntity: { '@id': course['@id'] } },
        course, faq.ld, seo.breadcrumbLd(req, crumbs), seo.organizationLd(req), seo.websiteLd(req, req.locale),
      ])],
    },
  });
});

/** The signed-in Teach page (/teach/cyber-defenders): the course in the teacher's own area, next to
 *  /teach/cs-quest. Cyber Defenders has no school library to add lessons from, so this is the program
 *  itself — units and steps for both bands, the four games, the standards counts — with the doors a
 *  teacher needs: the student course, the public teacher page (full standards map and per-unit notes)
 *  and its two print views. Staff of a school only, like every /teach page. Copy under teach.cd.*
 *  (English-first, like teachers.cd.*). */
const staffPage = (req, res, next) => (S.isSchoolStaff(req.user) ? next() : notFound(req, res, req.t('school.errors.notTeacher')));
router.get('/teach/cyber-defenders', requireUser, staffPage, (req, res) => {
  const t = req.t, cat = C.cyberCatalogue(), TK = 'teach.cd';
  const games = [
    { slug: 'packet-post', emoji: '📮', title: 'Packet Post' },
    { slug: 'would-you-rather', emoji: '🤔', title: 'Would You Rather?' },
    { slug: 'trick-inbox', emoji: '📥', title: 'Trick Inbox' },
    { slug: 'escape-the-post-office', emoji: '🔐', title: 'Escape the Post Office' },
  ].map(g => ({ ...g, live: launchGame(g.slug) }));
  const stepsIn = band => C.steps(C.getCourse('cyber-defenders'), band).length;
  const body = html`
  <div class="pagehead"><h1>🦉 ${t(`${TK}.title`)}</h1><div class="row"><a class="btn btn-primary" href="/courses/cyber-defenders">${t(`${TK}.cta.open`)}</a><a class="btn" href="/teachers/cyber-defenders">${t(`${TK}.cta.public`)}</a><a class="btn" href="/teachers/cyber-defenders?print=1" target="_blank" rel="noopener">🖨️ ${t(`${TK}.cta.print`)}</a><a class="btn" href="/teachers/cyber-defenders?print=tricks" target="_blank" rel="noopener">🖨️ ${t(`${TK}.cta.tricks`)}</a></div></div>
  <p class="lead">${t(`${TK}.lead`)}</p>
  <div class="csq-stats"><div class="csq-stat"><b dir="ltr">${stepsIn('1b')}</b><span>${t(`${K}.badges.steps`)}</span></div><div class="csq-stat"><b dir="ltr">${cat.registry.cyberorgCodes['1b'].length}</b>${el(t, 'span', `${K}.standards.b1`)}</div><div class="csq-stat"><b dir="ltr">${cat.registry.cyberorgCodes['2'].length}</b>${el(t, 'span', `${K}.standards.b2`)}</div><div class="csq-stat"><b dir="ltr">${cat.registry.frameworks.commonSense.topics.length}</b>${el(t, 'span', `${K}.standards.topics`)}</div></div>
  <h2>${t(`${TK}.units.h`)}</h2>
  <ul class="plain">${cat.units.map(u => html`<li class="panel"><b lang="en" dir="ltr">${t('cs.unit.n', { n: u.n })} · ${u.title}</b>${u.stamp ? html` <span class="chip-s">🏅 ${t(`${K}.units.stamp`, { stamp: u.stamp })}</span>` : ''}
    <ol class="csq-lessons" lang="en" dir="ltr">${(u.steps || []).map(s => html`<li>${s.n} ${(s.titles || {})['1b'] || s.n}${(s.titles || {})['2'] && s.titles['2'] !== s.titles['1b'] ? html` <span class="small muted">(Pro: ${s.titles['2']})</span>` : ''}</li>`)}</ol></li>`)}</ul>
  <h2>${t(`${TK}.games.h`)}</h2>
  <ul class="csq-crew">${games.map(g => html`<li class="panel">${crewArt(g.slug, g.emoji)}<h3 lang="en" dir="ltr">${g.title}</h3>
    <div class="row">${g.live ? html`<a class="btn btn-primary" href="/play/${g.slug}" rel="nofollow">▶ ${t(`${K}.crew.try`)}</a>` : ''}</div></li>`)}</ul>
  <p class="small muted">${t(`${TK}.note`)}</p>`;
  page(req, res, { title: t(`${TK}.title`), active: 'classes', body, head: V.CSS, back: '/teach', backLabel: t('school.teach.title') });
});
