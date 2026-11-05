// The Number Quest teacher page (/teachers/number-quest): the public program page, built like Cyber
// Defenders' (routes/cyber-defenders.js) from the course data (seed-lessons/number-quest, via
// courses.numberQuestCatalogue()): the overview, the six games, the units and steps, the published CCSS-M
// map for Explorer Units 1-7 plus the Vault of Measures finale (primary / also covers / builds toward kept
// separate and labelled — builds toward is preparation, never coverage; step 7.3 is flagged enrichment
// and cites no code), each step's Mathematical Practice spotlight, the per-unit teacher
// notes, and the printed pack (?print=1: the map and the notes on their own page). Copy under teachers.nq.*
// (English-first, marked lang="en" until a language has it); unit and step titles, codes and notes are
// English data, rendered lang="en". Anyone may read the page: Number Quest is a standalone course.
import { html, raw, esc } from './html.js';
import * as V from './cs-quest.js';
import * as P from '../services/number-quest-placement.js';

const K = 'teachers.nq';
/** A locked CCSS-M code as a chip, its full statement as the title (the registry carries the statements). */
export const codeChip = (registry, code) => {
  const stmt = registry && registry.explorerCodes && registry.explorerCodes.codes[code];
  return raw(`<span class="csq-badge csq-ids" lang="en" dir="ltr"${stmt ? ` title="${esc(stmt)}"` : ''}>${esc(code)}</span>`);
};
export const codeChips = (registry, codes) => (codes && codes.length
  ? html`<span class="csq-idrow">${codes.map(code => codeChip(registry, code))}</span>` : html`<span class="muted">—</span>`);

/** The Explorer standards map: every step, grouped under unit header rows. */
export function mapTable(req, cat) {
  const t = req.t, reg = cat.registry;
  const rows = cat.units.map(u => {
    const head = `<tr class="csq-map-unit"><th colspan="6" lang="en" dir="ltr">${u.n === 0 ? esc(u.title) : `Unit ${u.n} · ${esc(u.title)}`}${u.stamp ? ` — ${esc(u.stamp)}` : ''}</th></tr>`;
    const body = (u.steps || []).map(s => {
      const st = (s.standards || {}).explorer || {};
      const mp = s.mp && reg.frameworks.practices.codes[s.mp]
        ? raw(`<span class="csq-badge csq-ids" lang="en" dir="ltr" title="${esc(reg.frameworks.practices.codes[s.mp])}">${esc(s.mp)}</span> <span lang="en" dir="ltr">${esc(reg.frameworks.practices.codes[s.mp])}</span>`) : html`<span class="muted">—</span>`;
      // A step flagged enrichment (7.3, chance language) cites no code anywhere: its primary cell says
      // so in words instead of showing the bare dash a framing step like the intro gets, so no reader
      // mistakes the empty cell for coverage or for an omission.
      const primaryCell = st.flag === 'enrichment' && !(st.primary || []).length
        ? html`<span lang="en" dir="ltr">Enrichment — no CCSS code (probability is first codable at 7.SP.C; SP begins in grade 6)</span>`
        : codeChips(reg, st.primary);
      return html`<tr><td dir="ltr">${s.n}</td><td lang="en" dir="ltr">${(s.titles || {}).explorer || s.n}</td>
        <td>${primaryCell}</td><td>${codeChips(reg, st.also)}</td><td>${codeChips(reg, st.buildsToward)}</td>
        <td>${mp}</td></tr>`;
    }).join('');
    return raw(head) + body;
  }).join('');
  return html`<div class="csq-tbl"><table class="tbl csq-cov"><thead><tr><th>${t(`${K}.map.cols.step`)}</th><th>${t(`${K}.map.cols.title`)}</th><th>${t(`${K}.map.cols.primary`)}</th><th>${t(`${K}.map.cols.also`)}</th><th>${t(`${K}.map.cols.toward`)}</th><th>${t(`${K}.map.cols.mp`)}</th></tr></thead><tbody>${raw(rows)}</tbody></table></div>`;
}

/** The K–8 placement matrix: one row per grade a learner can name, built from the placement service's
 *  own constants (the form, the strands visited, the seed rung the first questions start from), so the
 *  table can never drift from the game it describes. */
export function placementMatrix() {
  const rows = [0, 1, 2, 3, 4, 5, 6, 7, 8].map(g => {
    const form = P.formForGrade(g);
    const strands = P.strandsForForm(form).map(k => P.STRAND_LABELS[k]).join(', ');
    return html`<tr><td dir="ltr">${g === 0 ? 'K' : `Grade ${g}`}</td>
      <td>${form === 'launchpad' ? 'Short form (audio-first)' : 'Standard form'}</td>
      <td>${strands}</td>
      <td dir="ltr">${P.rungLabel(P.seedRung(g))}</td>
      <td>${g <= 2 ? 'Starts at Welcome to the Numberworks; a start in the Launchpad gardens is flagged on the note, because that tier is still being built' : 'The first Explorer unit (1–7) whose entry profile the four rungs do not fully meet, or the Vault of Measures door (the finale) when all seven are met'}</td></tr>`;
  }).join('');
  return html`<div class="csq-tbl"><table class="tbl csq-cov"><thead><tr><th>Grade named</th><th>Form played</th><th>Strands visited</th><th>First questions start at rung</th><th>Where the start point can land</th></tr></thead><tbody>${raw(rows)}</tbody></table></div>`;
}

/** The placement explainer (the parity gap the teacher page was missing): how Tally's Sorting Game
 *  routes a learner, the caveat in the service's own words (P.CAVEAT, so no page can soften it), the
 *  absolute override, and the K–8 matrix. English course data, rendered lang="en" like the map. */
export function placementSection() {
  return html`
  <section class="lp-sec" id="placement" aria-labelledby="placement-h" lang="en" dir="ltr">
    <h2 id="placement-h">How placement works: Tally's Sorting Game</h2>
    <p>Before the street, a learner can play Tally's Sorting Game: a short routing game that finds their first workshop. It is deliberately simple, and this section says exactly what it does, so you can decide how much weight to give it.</p>
    <ul class="lp-list">
      <li>The learner names a grade, kindergarten to grade 8 (there is a grown-up / not-sure door, which seeds at grade 3). No birthday, age or score is asked or stored.</li>
      <li>Four strands, visited in turn rather than as four exams: Number, Algebra &amp; Patterns, Shape &amp; Measure, and Data &amp; Chance. Each strand is its own small staircase over half-grade rungs, seeded half a rung below the named grade so the first questions feel winnable. A right answer steps up half a rung, a wrong one steps down; a rung counts as settled on two right answers at it. Grades K–2 play a shorter, audio-first form (3–4 questions a strand, Algebra folded into Number); grades 3–8 play up to 5 a strand, at most 20 questions in all, and a strand stops sooner once both its ends are found.</li>
      <li>Every third question is a hands-on one where the bank has one at that rung: count-out items the learner taps as they count, and build items shown as counters and ten-frames, not bare text.</li>
      <li>The child never sees a score, a percentage, a timer or a rung. Tally reacts to the trying, shows how far along the game they are, and at the end simply names a starting workshop. A "Stop and start playing" button is always there: a stopped game still places, strand by strand, and the street can be started from the very beginning instead, always.</li>
      <li>The four placed rungs combine into one start point through the course's locked crosswalk: the first Explorer unit whose entry profile is not fully met, with near-misses resolving to the lower unit. If every strand points past Unit 7, the start is the Vault of Measures, the finale door at the end of the street: the child hears that every workshop is open and the Vault is waiting. Workshops before the start point stay open for games, laps and test-out. If the first two checks at the placed start go badly, Tally quietly suggests warming up in the previous unit first; the placement itself does not move, and nothing is recorded as a failure.</li>
    </ul>
    <p class="nq-caveat">${P.CAVEAT}</p>
    <p>Rungs are curriculum-order judgements by the course writers, refined by item data after launch. They are not certified grades, and the Starting Point note a parent or teacher sees says the same, strand by strand, in plain words.</p>
    <h3>Your override is absolute</h3>
    <p>Placement is advice the platform gives, never a gate it keeps. From a learner's Starting Point note (open it for a linked child or a school student from your family or school page), a teacher or parent can move the learner to any start point, or turn the Sorting Game off for them entirely, and that word stands over anything the game found. A learner can also retake the game; a retake only replaces the standing start point when the learner chooses to use the new one.</p>
    <h3>The K–8 matrix</h3>
    <p>What each named grade plays, and where it can land. The first-questions rung is the seed every strand starts from; the staircase moves from there.</p>
    ${placementMatrix()}
  </section>`;
}

/** The standards map and the teacher notes, shared by the page and its print view. el/lp/faqBlock come from
 *  routes/teachers.js (the landing-page helpers, as on the Cyber page); they are passed in to keep this
 *  view free of a route import. */
export function mapAndNotes(req, cat, el) {
  const t = req.t;
  const locked = Object.keys(cat.registry.explorerCodes.codes).length;
  return html`
  <section class="lp-sec" id="map" aria-labelledby="map-h">${el(t, 'h2', `${K}.map.h`, {}, ' id="map-h"')}
    ${el(t, 'p', `${K}.map.p`)}
    <div class="csq-stats"><div class="csq-stat"><b dir="ltr">${locked}</b>${el(t, 'span', `${K}.map.codes`)}</div><div class="csq-stat"><b dir="ltr">${cat.units.reduce((n, u) => n + (u.steps || []).length, 0)}</b>${el(t, 'span', `${K}.map.statSteps`)}</div><div class="csq-stat"><b dir="ltr">${cat.units.filter(u => u.stamp).length}</b>${el(t, 'span', `${K}.map.statUnits`)}</div></div>
    ${mapTable(req, cat)}
    ${el(t, 'p', `${K}.map.lock`, {}, ' class="small muted"')}</section>
  <section class="lp-sec" id="notes" aria-labelledby="notes-h">${el(t, 'h2', `${K}.notes.h`, {}, ' id="notes-h"')}
    ${el(t, 'p', `${K}.notes.p`)}
    ${cat.units.map(u => html`<article class="panel"><h3 lang="en" dir="ltr">${u.n === 0 ? u.title : `${t('cs.unit.n', { n: u.n })} · ${u.title}`}</h3>${V.enList(u.teacherNotes)}</article>`)}</section>`;
}
