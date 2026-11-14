// The step-by-step game setup before the Builder: /build/new (the "New game" button on /build opens it).
//   Start: "Help me choose" (six steps, then "Here is your game plan") or "I know what I want" (a new, empty game and
//   straight to the Studio, exactly as "New game" always did). Every step also has "Skip to the Builder".
// What the steps offer comes from the Builder's own lists (builder/plan.js: game types, the shipped 3D worlds, the
// heroes and animals of both catalogues by group: the 3D worlds' and the 2D sprites'), so a newly shipped world or
// animal appears here by itself. What can be picked follows the 2D or 3D choice (public/js/buildsetup.js).
// Nothing is stored by this page: the choices live in the page until "Open the Builder", which makes the game
// (POST /api/studio/new), adds a file with the Studio's own upload (POST /api/studio/:id/uploads) and starts the first
// build (POST /api/studio/:id/chat with { plan }). The plan's typed words are part of that message, so they pass the
// same screening as any typed Builder message (builder/agent.js). No voice, no prices, no plans on this page.
import { Router } from 'express';
import { html, raw, jsonData } from '../views/html.js';
import { page } from '../views/layout.js';
import { requireBuilder } from '../auth.js';
import { rateLimit } from '../services/ratelimit.js';
import { KIT2_WORLDS, worldById } from '../builder/kit2.js';
import { GAME_TYPES, LOOKS, LEARN, LIMITS, characterGroups, characterName, normalisePlan, planSentence, planEngine, customParts } from '../builder/plan.js';
import { ART2D_TEMPLATES, ART2D_WORLD_IDS } from '../builder/art2d.js';
import { LIMITS as UPLOADS } from '../builder/uploads.js';

export const router = Router();

/** The steps, in order. multi: pick as many as you like; other: has "Something else"; pack: "Something else" is
 *  outside the builder packs (the Builder makes it from scratch), so its text box carries the honest note. */
export const STEPS = [
  { key: 'type', other: true, pack: true },
  { key: 'look' },
  { key: 'world', other: true, pack: true },
  { key: 'chars', other: true, pack: true, multi: true },
  { key: 'learn', other: true, multi: true },
  { key: 'extras' },
];
/** The files the setup step takes: worksheets and notes (PDF, text). Pictures are added in the Studio, as before. */
export const SETUP_FILES = { accept: 'application/pdf,.pdf,.txt,.md,.csv,text/plain,text/markdown,text/csv', types: ['application/pdf', 'text/plain', 'text/markdown', 'text/csv'], ext: ['pdf', 'txt', 'md', 'csv'], max: Math.min(2, UPLOADS.perMessage), pdf: UPLOADS.pdf, text: UPLOADS.text };

// Small drawings for the cards that have no picture (single colour, drawn with the text colour; never an emoji).
const svg = (d, extra = '') => `<svg viewBox="0 0 48 48" width="48" height="48" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${d}${extra}</svg>`;
const ART = {
  else: svg('<path d="M10 38l4-12L32 8l8 8-18 18-12 4z"/><path d="M27 13l8 8"/>'),
  adventure: svg('<path d="M8 40V10"/><path d="M8 12h22l-5 7 5 7H8"/><path d="M4 40h36"/>'),
  runner: svg('<circle cx="29" cy="9" r="4"/><path d="M14 22l9-6 7 5 6 2"/><path d="M23 16l-3 12 8 5 1 9"/><path d="M20 28l-5 6-8 1"/>'),
  catch: svg('<path d="M8 26h32l-4 14H12z"/><circle cx="16" cy="12" r="3"/><circle cx="31" cy="8" r="3"/><circle cx="26" cy="19" r="3"/>'),
  quiz: svg('<circle cx="24" cy="24" r="17"/><path d="M18 19a6 6 0 1 1 8 6c-2 1-2 2-2 4"/><path d="M24 34v.5"/>'),
  memory: svg('<rect x="6" y="10" width="15" height="22" rx="3"/><rect x="27" y="16" width="15" height="22" rx="3"/><path d="M13.5 18v6M34.5 24v6"/>'),
  word: svg('<rect x="5" y="14" width="17" height="20" rx="3"/><rect x="26" y="14" width="17" height="20" rx="3"/><path d="M10 29l3.5-10 3.5 10M11.5 26h4"/><path d="M31 19v10h3a2.5 2.5 0 0 0 0-5h-3 2.5a2.5 2.5 0 0 0 0-5z"/>'),
  duel: svg('<circle cx="14" cy="14" r="5"/><circle cx="34" cy="14" r="5"/><path d="M5 38c0-8 4-12 9-12s9 4 9 12"/><path d="M25 38c0-8 4-12 9-12s9 4 9 12"/>'),
  board: svg('<rect x="8" y="8" width="32" height="32" rx="6"/><path d="M17 17v.5M31 17v.5M24 24v.5M17 31v.5M31 31v.5"/>'),
  '3d': svg('<path d="M24 5l16 9v20l-16 9-16-9V14z"/><path d="M8 14l16 9 16-9M24 23v20"/>'),
  '2d': svg('<rect x="6" y="10" width="36" height="28" rx="4"/><path d="M6 31l10-9 8 7 6-5 12 9"/><circle cx="33" cy="18" r="3"/>'),
  auto: svg('<path d="M24 6l4 12 12 4-12 4-4 12-4-12-12-4 12-4z"/><path d="M38 6v6M35 9h6"/>'),
  math: svg('<path d="M8 15h12M14 9v12"/><path d="M28 15h12"/><path d="M9 29l10 10M19 29L9 39"/><path d="M28 31h12M28 37h12"/>'),
  reading: svg('<path d="M24 12c-4-3-10-4-16-3v27c6-1 12 0 16 3 4-3 10-4 16-3V9c-6-1-12 0-16 3z"/><path d="M24 12v27"/>'),
  science: svg('<path d="M19 6h10M21 6v12L9 38a3 3 0 0 0 3 4h24a3 3 0 0 0 3-4L27 18V6"/><path d="M14 30h20"/>'),
  geography: svg('<circle cx="24" cy="24" r="17"/><path d="M7 24h34"/><path d="M24 7c-6 5-6 29 0 34 6-5 6-29 0-34z"/>'),
  fun: svg('<circle cx="24" cy="24" r="17"/><path d="M15 28c2 4 5 6 9 6s7-2 9-6"/><path d="M17 19v.5M31 19v.5"/>'),
};
const art = id => raw(`<span class="su-pic su-art">${ART[id] || ART.else}</span>`);
const check = raw('<span class="su-tick" aria-hidden="true"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" focusable="false"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></span>');

/** What the page's script needs (ids and facts only; every word comes from the locale files). */
export function setupData(t) {
  return {
    steps: STEPS, types: GAME_TYPES.map(x => x.id), looks: LOOKS, learn: LEARN, limits: LIMITS, files: SETUP_FILES,
    worlds: KIT2_WORLDS.map(w => ({ id: w.id, name: t(`studio.worlds.names.${w.id}`) })),
    characters: characterGroups().flatMap(g => g.items.map(c => ({ id: c.id, name: characterName(c.id, t), group: g.id, kind: c.kind, worlds: c.worlds, in3d: c.in3d, in2d: c.in2d }))),
    // 2D: the kinds of game that draw a world and one sprite character today, and the worlds that have 2D art
    art2d: { types: ['adventure', ...ART2D_TEMPLATES], worlds: ART2D_WORLD_IDS },
  };
}

router.get('/build/new', requireBuilder, (req, res) => {
  const t = req.t, total = STEPS.length;
  // One card: a real button (aria-pressed), a picture or drawing, a name of at most two lines and a line under it.
  const card = ({ step, id, pic, title, text = '', extra = '', attrs = '' }) => html`<div class="su-card${extra ? ' has-more' : ''}" data-card="${id}">
    <button type="button" class="su-pick" data-step="${step}" data-id="${id}" aria-pressed="false"${raw(attrs)}>${pic}<span class="su-name">${title}</span><span class="su-desc">${text}</span>${check}</button>${extra}</div>`;
  const elseCard = step => card({ step, id: 'else', pic: art('else'), title: t('buildSetup.else.title'), text: t('buildSetup.else.text'), attrs: ` aria-controls="su-else-${step}" aria-expanded="false"` });
  const elseBox = s => html`<div class="su-else" id="su-else-${s.key}" hidden>
    <label for="su-idea-${s.key}">${t('buildSetup.else.label')}</label>
    <input class="input" id="su-idea-${s.key}" data-idea="${s.key}" maxlength="${LIMITS.idea}" dir="auto" autocomplete="off" placeholder="${t(`buildSetup.steps.${s.key}.placeholder`)}"${s.pack ? raw(` aria-describedby="su-note-${s.key}"`) : ''}>
    ${s.pack ? html`<p class="su-note" id="su-note-${s.key}">${t('buildSetup.else.packNote')}</p>` : ''}</div>`;
  const nav = html`<div class="su-nav"><button type="button" class="btn" data-go="back">${t('buildSetup.back')}</button><span class="su-nav-end"><button type="button" class="btn btn-ghost su-skipstep" data-go="skip">${t('buildSetup.skip')}</button><button type="button" class="btn btn-primary" data-go="next">${t('buildSetup.next')}</button></span></div>`;
  const head = (s, i) => html`<div class="su-progress"><span class="su-dots" aria-hidden="true">${STEPS.map((x, k) => raw(`<i${k <= i ? ' class="on"' : ''}></i>`))}</span><span class="su-count">${t('buildSetup.progress', { n: i + 1, total })}</span></div>
    <h1 id="su-h-${s.key}" tabindex="-1">${t(`buildSetup.steps.${s.key}.title`)}</h1><p class="su-hint">${t(`buildSetup.steps.${s.key}.hint`)}</p>`;

  const grids = {
    type: () => html`<div class="su-grid su-grid-text" role="group" aria-labelledby="su-h-type">${GAME_TYPES.map(x => card({ step: 'type', id: x.id, pic: art(x.id), title: t(`buildSetup.types.${x.id}.title`), text: t(`buildSetup.types.${x.id}.text`) }))}${elseCard('type')}</div>`,
    look: () => html`<div class="su-grid su-grid-text su-grid-3" role="group" aria-labelledby="su-h-look">${LOOKS.map(id => card({ step: 'look', id, pic: art(id), title: t(`buildSetup.looks.${id}.title`), text: t(`buildSetup.looks.${id}.text`) }))}</div>`,
    world: () => html`<p class="su-flag" id="su-world-2d" hidden>${t('buildSetup.flatNote')}</p>
      <div class="su-grid su-grid-world" role="group" aria-labelledby="su-h-world">${KIT2_WORLDS.map(w => { const name = t(`studio.worlds.names.${w.id}`); return card({ step: 'world', id: w.id, title: name, text: t(`buildSetup.worlds.${w.id}`),
        pic: html`<span class="su-pic"><img src="/vendor/themes/${w.id}/${w.version}/cover.webp" alt="" width="640" height="360" loading="lazy" decoding="async"></span>`,
        extra: html`<button type="button" class="btn btn-sm su-preview" data-preview="${w.id}" aria-label="${t('buildSetup.world.previewLabel', { name })}">${t('buildSetup.world.preview')}</button>` }); })}${card({ step: 'world', id: 'else', pic: art('else'), title: t('buildSetup.else.title'), text: t('buildSetup.else.text'), attrs: ' aria-controls="su-else-world" aria-expanded="false"', extra: raw('<span class="su-preview-gap" aria-hidden="true"></span>') })}</div>`,
    chars: () => html`<p class="su-flag" id="su-chars-2d" hidden>${t('buildSetup.flatNote')}</p>
      ${characterGroups().map(g => html`<section class="su-group${g.soon ? ' is-soon' : ''}" data-group="${g.id}" aria-labelledby="su-g-${g.id}">
        <h2 id="su-g-${g.id}">${t(`buildSetup.groups.${g.id}`)}${g.soon ? html` <span class="stchip su-soon">${t('buildSetup.chars.soon')}</span>` : g.only2d ? html` <span class="stchip su-soon" data-soon3d>${t('buildSetup.chars.soon3d')}</span>` : ''}</h2>
        ${g.soon ? html`<p class="su-soon-text muted">${t('buildSetup.chars.soonText')}</p>`
          : html`<div class="su-grid su-grid-char" role="group" aria-labelledby="su-g-${g.id}">${g.items.map(c => card({ step: 'chars', id: c.id, title: characterName(c.id, t), text: '',
            // the 3D picker's picture, or the 2D picker's for an animal that is only a sprite so far
            pic: c.in3d ? html`<span class="su-pic"><img src="/img/kit2/heroes/${c.id}.webp" alt="" width="96" height="96" loading="lazy" decoding="async"></span>`
              : html`<span class="su-pic su-pic-2d"><img src="/img/art2d/animals/${c.id}.webp" alt="" width="96" height="64" loading="lazy" decoding="async"></span>` }))}</div>`}
      </section>`)}
      <section class="su-group" aria-labelledby="su-g-else"><h2 id="su-g-else" class="sr-only">${t('buildSetup.else.title')}</h2><div class="su-grid su-grid-char">${elseCard('chars')}</div></section>`,
    learn: () => html`<div class="su-grid su-grid-text" role="group" aria-labelledby="su-h-learn">${LEARN.map(id => card({ step: 'learn', id, pic: art(id), title: t(`buildSetup.learn.${id}.title`), text: t(`buildSetup.learn.${id}.text`) }))}${elseCard('learn')}</div>`,
    extras: () => html`<div class="su-extras">
      <div class="field"><label for="su-notes">${t('buildSetup.extras.notesLabel')}</label>
        <input class="input" id="su-notes" maxlength="${LIMITS.notes}" dir="auto" autocomplete="off" placeholder="${t('buildSetup.extras.notesPlaceholder')}"></div>
      <div class="su-file panel"><h2 id="su-file-h">${t('buildSetup.extras.fileTitle')}</h2><p class="su-file-text">${t('buildSetup.extras.fileText')}</p>
        <input type="file" id="su-file" class="sr-only" accept="${SETUP_FILES.accept}" multiple aria-labelledby="su-file-h" aria-describedby="su-file-kinds" tabindex="-1">
        <button type="button" class="btn" id="su-file-btn">${t('buildSetup.extras.choose')}</button>
        <p class="small muted" id="su-file-kinds">${t('buildSetup.extras.fileKinds')}</p>
        <ul class="su-files" id="su-files" aria-live="polite"></ul></div>
    </div>`,
  };

  const body = html`
  <div class="su" id="su">
    <div class="su-top"><p class="su-brand">${t('buildSetup.title')}</p><button type="button" class="btn" id="su-skipall" hidden>${t('buildSetup.skipAll')}</button></div>
    <section class="su-screen su-start" data-screen="start" aria-labelledby="su-h-start">
      <h1 id="su-h-start" tabindex="-1">${t('buildSetup.start.heading')}</h1><p class="su-hint">${t('buildSetup.start.text')}</p>
      <div class="su-ways">
        <button type="button" class="su-way su-way-go" id="su-guide"><span class="su-way-t">${t('buildSetup.start.guide')}</span><span class="su-way-d">${t('buildSetup.start.guideText')}</span></button>
        <button type="button" class="su-way" id="su-direct"><span class="su-way-t">${t('buildSetup.start.direct')}</span><span class="su-way-d">${t('buildSetup.start.directText')}</span></button>
      </div>
    </section>
    ${STEPS.map((s, i) => html`<section class="su-screen su-step" data-screen="${s.key}" aria-labelledby="su-h-${s.key}" hidden>
      ${head(s, i)}${grids[s.key]()}${s.other ? elseBox(s) : ''}${nav}
    </section>`)}
    <section class="su-screen su-plan" data-screen="plan" aria-labelledby="su-h-plan" hidden>
      <h1 id="su-h-plan" tabindex="-1">${t('buildSetup.plan.heading')}</h1><p class="su-hint">${t('buildSetup.plan.text')}</p>
      <dl class="su-rows panel" id="su-rows"></dl>
      <p class="su-flag" id="su-plan-2d" hidden>${t('buildSetup.flatNote')}</p>
      <div class="su-told"><p class="su-told-h" id="su-told-h">${t('buildSetup.plan.told')}</p><p class="su-told-t" id="su-told" aria-labelledby="su-told-h" aria-live="polite"></p></div>
      <div class="su-nav"><button type="button" class="btn" data-go="back">${t('buildSetup.back')}</button><button type="button" class="btn btn-hot su-open" id="su-open">${t('buildSetup.plan.open')}</button></div>
    </section>
    <p class="sr-only" id="su-live" aria-live="polite"></p>
  </div>
  ${jsonData('page-data', setupData(t))}`;
  page(req, res, { title: t('buildSetup.title'), active: 'build', back: '/build', backLabel: t('nav.build'), body, mid: true, bodyClass: 'setup-page',
    head: raw('<link rel="stylesheet" href="/css/studio.css"><link rel="stylesheet" href="/css/build-setup.css">'), scripts: ['/js/buildsetup.js'], });
});

// The summary's sentence, made on the server from the choices (the same sentence the Builder gets when the builder
// opens it: runner.submit). Nothing is stored; the typed words are only trimmed here, and screened when they are sent.
// Body: { plan, files } -> { plan (as the Builder will use it), text, custom: ['type' | 'world' | 'character'], engine }.
router.post('/api/build/plan', requireBuilder, rateLimit('build-plan', 60, 60e3), (req, res) => {
  const b = req.body || {}, plan = normalisePlan(b.plan);
  if (!plan) return res.json({ plan: null, text: '', custom: [], engine: 'open' });
  const e = planEngine(plan), files = Math.max(0, Math.min(SETUP_FILES.max, Math.round(+b.files || 0)));
  res.json({ plan, text: planSentence(plan, req.t, { files }), custom: customParts(plan), engine: e.engine, ...(e.engine === 'kit2' ? { world: e.world, worldName: req.t(`studio.worlds.names.${worldById(e.world).id}`) } : {}) });
});

