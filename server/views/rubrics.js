// Rubric pieces shared by the rubric library (routes/rubrics.js), the teacher's review page and the student's lesson page
// (routes/progress.js): the read-only grid (criteria × levels), the scoring fields (tap a level per criterion, a comment
// each), and a student's result ("From your teacher").
import { html, raw } from './html.js';
import * as R from '../services/rubrics.js';

const pts = (t, p) => t('rubrics.pointsN', { count: +(+p).toFixed(1) });

/** The rubric as a table: criteria down the side, levels across the top with their points. picks (optional) marks the
 *  level given per criterion. Wide rubrics scroll inside their box on phones. */
export function rubricGrid(t, r, { picks = null, caption = '' } = {}) {
  return html`<div class="rb-wrap" tabindex="0" role="region" aria-label="${caption || r.title}"><table class="tbl rb-grid">
    ${caption ? html`<caption class="sr-only">${caption}</caption>` : ''}
    <thead><tr><th scope="col">${t('rubrics.criterion')}</th>${r.levels.map(l => html`<th scope="col"><span dir="auto">${l.label}</span><span class="rb-pts">${pts(t, l.points)}</span></th>`)}</tr></thead>
    <tbody>${r.criteria.map((c, i) => html`<tr><th scope="row" dir="auto">${c.name}</th>${r.levels.map((l, j) => {
      const on = picks && picks[i] === j;
      return html`<td class="${on ? 'rb-on' : ''}" dir="auto">${on ? html`<span class="rb-mark">✔ <span class="sr-only">${t('rubrics.score.given')}</span></span>` : ''}${c.descs[j] || ''}</td>`;
    })}</tr>`)}</tbody></table></div>`;
}

/**
 * The scoring fields inside a review form: for each criterion a group of levels to tap (label, points, descriptor) and
 * "Not scored", and a comment box. Field names: lvl-<i> (level index or '-'), cmt-<i>. score: the saved row (picks are
 * shown only when it was given with this version of the rubric). idp keeps ids unique on the page.
 */
export function scoreFields(t, r, score, idp) {
  const same = score && score.version === r.version;
  const pick = i => (same && score.picks[i] !== null && score.picks[i] !== undefined ? score.picks[i] : '-');
  const comment = i => (same ? score.comments[i] || '' : '');
  return html`<div class="rb-score" role="group" aria-label="${t('rubrics.score.label', { title: r.title })}">
    <p class="rb-score-h"><b>📏 <span dir="auto">${r.title}</span></b>${score ? html` <span class="chip-s">${t('rubrics.score.total', { points: R.pointsText(score.points, score.max_points) })}</span>` : ''}</p>
    ${score && !same ? html`<p class="small notice warn">${t('rubrics.score.changed')}</p>` : ''}
    ${r.criteria.map((c, i) => html`<fieldset class="rb-crit"><legend dir="auto">${c.name}</legend>
      <div class="rb-levels">
        ${r.levels.map((l, j) => html`<label class="rb-level"><input type="radio" name="lvl-${i}" value="${j}" ${pick(i) === j ? raw('checked') : ''}>
          <span class="rb-lh"><b dir="auto">${l.label}</b><span class="rb-pts">${pts(t, l.points)}</span></span>${c.descs[j] ? html`<span class="rb-ld small" dir="auto">${c.descs[j]}</span>` : ''}</label>`)}
        <label class="rb-level rb-none"><input type="radio" name="lvl-${i}" value="-" ${pick(i) === '-' ? raw('checked') : ''}><span class="rb-lh"><b>–</b></span><span class="rb-ld small">${t('rubrics.score.notScored')}</span></label>
      </div>
      <details class="rb-cmt" ${comment(i) ? raw('open') : ''}><summary class="small">💬 ${t('rubrics.score.comment')}</summary>
        <label class="sr-only" for="${idp}-c${i}">${t('rubrics.score.commentFor', { name: c.name })}</label>
        <textarea class="input" id="${idp}-c${i}" name="cmt-${i}" rows="2" maxlength="${R.LIMITS.comment}" dir="auto">${comment(i)}</textarea></details>
    </fieldset>`)}
  </div>`;
}
/** The picks and comments a review form sent (lvl-<i>, cmt-<i>), or undefined when it sent none. */
export function scoreInput(body) {
  const idx = k => Object.keys(body).map(x => new RegExp(`^${k}-(\\d{1,2})$`).exec(x)).filter(Boolean).map(m => +m[1]);
  const li = idx('lvl'), ci = idx('cmt');
  if (!li.length && !ci.length && body.picks === undefined && body.comments === undefined) return undefined;
  const list = (k, ix) => { if (!ix.length) return undefined; const out = []; for (let i = 0; i <= Math.max(...ix); i++) out.push(body[`${k}-${i}`] === undefined ? undefined : String(body[`${k}-${i}`])); return out; };
  return { picks: body.picks !== undefined ? body.picks : list('lvl', li), comments: body.comments !== undefined ? body.comments : list('cmt', ci) };
}

/** A student's result: each criterion with the level given, its descriptor and the teacher's comment, then the total.
 *  From the score's snapshot (the rubric as it was when the teacher scored). */
export function resultView(t, score) {
  const r = score && score.snapshot; if (!r || !Array.isArray(r.criteria)) return '';
  return html`<div class="rb-result">
    <p class="rb-result-h"><b>📏 <span dir="auto">${r.title}</span></b> <span class="chip-s rb-total">${t('rubrics.score.total', { points: R.pointsText(score.points, score.max_points) })}</span></p>
    <ul class="plain rb-result-list">${r.criteria.map((c, i) => { const j = score.picks[i]; const l = j !== null && j !== undefined ? r.levels[j] : null; return html`<li>
      <span class="rb-rn" dir="auto">${c.name}</span>
      ${l ? html`<span class="rb-rl"><b dir="auto">${l.label}</b> · ${pts(t, l.points)}</span>${c.descs[j] ? html`<span class="small muted" dir="auto">${c.descs[j]}</span>` : ''}` : html`<span class="muted">${t('rubrics.score.notScored')}</span>`}
      ${score.comments[i] ? html`<span class="rb-rc" dir="auto">💬 ${score.comments[i]}</span>` : ''}</li>`; })}</ul></div>`;
}
