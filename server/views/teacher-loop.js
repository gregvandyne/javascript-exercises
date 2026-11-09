// The teaching loop, Plan → Play → Check → Feedback (docs/decisions.md "The teaching loop"): one partial, three looks.
//
//   teacherLoop(t, { variant: 'landing' })  the section on the teacher landing at "/" (server/routes/landing.js), in the
//                                           landing's own lp-* look (public/css/landing.css), with the four screenshots
//   teacherLoop(t, { variant: 'page' })     /teach/loop ("How Oomba fits your week") and /teachers, in the app's look
//                                           (public/css/teach-loop.css)
//   teacherLoop(t, { variant: 'compact' })  the card near the top of the Classroom home (/teach) for new teachers: each
//                                           step ticks itself off (services/teach-loop.js loopState), and it can be hidden
//
// links (services/teach-loop.js loopLinks) turns each tool into a link to the real page for the teacher's first class;
// without it (signed-out visitors, kids, grown-ups) the tools are listed as plain words. Every word is under teach.loop.*.
// No prices, no names but the teacher's own class name (staff only), and nothing that promises tools not built yet.
import { html, raw } from './html.js';

/** The four steps: an emoji and the tools each one uses (link names from loopLinks). */
export const LOOP = [
  { step: 'plan', emoji: '📝', tools: ['library', 'draftAi', 'builder'] },
  { step: 'play', emoji: '🎮', tools: ['assign', 'live'] },
  { step: 'check', emoji: '📊', tools: ['gradebook', 'attention', 'standards'] },
  { step: 'feedback', emoji: '💬', tools: ['review', 'written'] },
];
/** The screenshots in public/img/teach-loop (scripts/teach-loop-shots.js): name, the step it shows. 1280x800, 16:10. */
export const SHOTS = [['gradebook', 'check'], ['attention', 'check'], ['feedback', 'feedback'], ['standards', 'check']];
export const SHOT_W = 1280, SHOT_H = 800;
const SHOT_V = '1';

const svg = cls => raw(`<svg class="${cls}" viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="M4 10.5l4 4 8-9" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`);
const check = svg('tl-check'), lpCheck = svg('lp-check');
/** Which tools a step lists: "Host a live game" only while live games are on. */
const toolsOf = (s, live) => s.tools.filter(k => k !== 'live' || live);
/** A tool's name as words (no link): the gradebook says it downloads as CSV, since there is no separate CSV button. */
const plainName = (t, k) => t(`teach.loop.tools.${k === 'gradebook' ? 'gradebookCsv' : k}`);
const img = (t, name, sizes, cls = '') => html`<img${cls ? raw(` class="${cls}"`) : ''} src="/img/teach-loop/${name}.webp?v=${SHOT_V}" width="${SHOT_W}" height="${SHOT_H}" sizes="${sizes}" alt="${t(`teach.loop.shots.${name}.alt`)}" loading="lazy" decoding="async">`;

export function teacherLoop(t, opts = {}) {
  const { variant = 'page', links = null, state = null, live = true, shots = variant !== 'compact', cta = '', id = 'teach-loop', headingTag = 'h2', cls = '' } = opts;
  if (variant === 'landing') return landing(t, { live, cta, id });
  if (variant === 'compact') return compact(t, { links, state, live, id });
  return pageLook(t, { links, state, live, shots, id, headingTag, cls });
}

/** On the landing: numbered cards like "How it works", then the four screens, then the trial button. */
function landing(t, { live, cta, id }) {
  return html`<section class="lp-sec lp-loop" id="${id}" aria-labelledby="${id}-h">
  <div class="lp-wrap">
    <header class="lp-sec-head"><p class="lp-eyebrow">${t('teach.loop.kicker')}</p><h2 id="${id}-h">${t('teach.loop.h')}</h2><p>${t('teach.loop.lead')}</p></header>
    <ol class="lp-loop-steps">
      ${LOOP.map((s, i) => html`<li class="lp-card lp-step lp-loop-step rv"><span class="lp-step-n" aria-hidden="true">0${i + 1}</span><span class="lp-step-e" aria-hidden="true">${s.emoji}</span>
        <h3>${t(`teach.loop.steps.${s.step}.name`)}</h3><p>${t(`teach.loop.steps.${s.step}.benefit`)}</p>
        <ul class="lp-loop-tools">${toolsOf(s, live).map(k => html`<li>${lpCheck}<span>${plainName(t, k)}</span></li>`)}</ul></li>`)}
    </ol>
    <div class="lp-loop-shots">
      ${SHOTS.map(([name]) => html`<figure class="lp-device lp-loop-shot rv"><div class="lp-screen">${img(t, name, '(min-width: 1100px) 540px, (min-width: 760px) 46vw, 92vw')}</div><figcaption>${t(`teach.loop.shots.${name}.caption`)}</figcaption></figure>`)}
    </div>
    ${cta ? html`<div class="lp-ctas lp-ctas-c lp-loop-cta">${cta}</div>` : ''}
  </div>
</section>`;
}

/** A tool: a button to the real page, or (no links) the tool's name. */
function tool(t, k, links) {
  const href = links && links[k];
  // No link: "Host a live game" for a teacher who can't host is left out; any other tool (no class yet, or a visitor) is
  // its name in plain words.
  if (!href) return links && k === 'live' ? '' : html`<li class="tl-tool">${check}<span>${plainName(t, k)}</span></li>`;
  const label = t(`teach.loop.tools.${k}`);
  const extra = k === 'gradebook' && links.csv ? html`<a class="btn btn-sm tl-csv" href="${links.csv}" download>⬇️ ${t('teach.loop.tools.csv')}</a>` : '';
  return html`<li class="tl-tool"><a class="btn btn-sm" href="${href}">${label}</a>${extra}</li>`;
}
/** No class yet: one button to make it, instead of class tools that would all go to the same place. */
const makeClass = (t, links) => links && links.makeClass ? html`<p class="tl-make"><a class="btn btn-primary" href="${links.makeClass}">🍎 ${t('teach.loop.home.makeClass')}</a></p>` : '';
const tick = (t, on) => html`<span class="tl-tick${on ? ' on' : ''}" aria-hidden="true">${on ? check : ''}</span><span class="sr-only">${on ? t('teach.loop.home.done') : t('teach.loop.home.todo')}</span>`;

/** /teach/loop and /teachers: four panels in the app's look, then the screenshots. */
function pageLook(t, { links, state, live, shots, id, headingTag, cls }) {
  const H = raw(headingTag);
  return html`<section class="tl tl-page${cls ? ` ${cls}` : ''}" id="${id}" aria-labelledby="${id}-h">
  <${H} id="${id}-h" class="tl-h">🔁 ${t('teach.loop.h')}</${H}>
  <p class="tl-lead">${t('teach.loop.lead')}</p>
  ${makeClass(t, links)}
  <ol class="plain tl-steps">${LOOP.map((s, i) => { const on = !!(state && state.done[s.step]);
    return html`<li class="panel tl-step${on ? ' is-done' : ''}" id="${id}-${s.step}">
      <div class="tl-step-head"><span class="tl-e" aria-hidden="true">${s.emoji}</span><h3 class="tl-step-t"><span class="tl-n" aria-hidden="true">${i + 1}</span> ${t(`teach.loop.steps.${s.step}.name`)}</h3>${state ? tick(t, on) : ''}</div>
      <p>${t(`teach.loop.steps.${s.step}.benefit`)}</p>
      <ul class="plain tl-tools">${toolsOf(s, live).map(k => tool(t, k, links))}</ul></li>`; })}</ol>
  ${shots ? html`<div class="tl-shots">${SHOTS.map(([name]) => html`<figure class="panel tl-shot">${img(t, name, '(min-width: 1000px) 480px, (min-width: 700px) 46vw, 92vw')}<figcaption class="small muted">${t(`teach.loop.shots.${name}.caption`)}</figcaption></figure>`)}</div>` : ''}
</section>`;
}

/** The Classroom home's card for new teachers: four small steps that tick themselves off, links for their first class,
 *  and, at the foot next to the /teach/loop link, Hide (it comes back from /teach/loop). */
function compact(t, { links, state, live, id }) {
  const st = state || { done: {}, count: 0 };
  // On a phone only the next step to do shows its words and tools (public/css/teach-loop.css), so My classes stays near the top.
  const nextStep = (LOOP.find(s => !st.done[s.step]) || {}).step;
  const lead = links && links.class ? t('teach.loop.home.lead', { class: links.class.name }) : t('teach.loop.home.leadNoClass');
  return html`<section class="panel tl tl-compact" id="${id}" aria-labelledby="${id}-h">
  <div class="tl-top"><h2 id="${id}-h">🔁 ${t('teach.loop.home.h')}</h2><span class="chip-s tl-count">${t('teach.loop.home.count', { done: st.count, total: LOOP.length })}</span></div>
  <p class="small muted tl-sub">${lead}</p>
  ${makeClass(t, links)}
  <ol class="plain tl-mini">${LOOP.map(s => { const on = !!st.done[s.step], next = s.step === nextStep;
    return html`<li class="tl-mstep${on ? ' is-done' : ''}${next ? ' is-next' : ''}">${tick(t, on)}<span class="tl-mtext"><b>${s.emoji} ${t(`teach.loop.steps.${s.step}.name`)}</b><span class="small muted">${t(`teach.loop.steps.${s.step}.benefit`)}</span>
      <span class="tl-mtools">${toolsOf(s, live).filter(k => links && links[k]).map(k => html`<a class="chip" href="${links[k]}">${t(`teach.loop.tools.${k}`)}</a>`)}</span></span></li>`; })}</ol>
  <div class="small tl-more"><a href="/teach/loop">${t('teach.loop.page.link')}</a>
    <form class="tl-hide" data-api="/api/teach/loop/hide" data-reload data-toast="${t('teach.loop.home.hidden')}"><button class="btn btn-sm" type="submit">${t('teach.loop.home.hide')}</button></form></div>
</section>`;
}
