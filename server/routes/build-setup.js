// The step-by-step game setup before the Builder: /build/new (the "New game" button on /build opens it).
//   Start: "Help me choose" (seven steps, then "Here is your game plan") or "I know what I want" (a new, empty game and
//   straight to the Studio, exactly as "New game" always did). Every step also has "Skip to the Builder".
// What the steps offer comes from the Builder's own lists (builder/plan.js: game types, the shipped 3D worlds, the
// heroes and animals of both catalogues by group: the 3D worlds' and the 2D sprites'), so a newly shipped world or
// animal appears here by itself. What can be picked follows the 2D or 3D choice (public/js/buildsetup.js).
// Nothing is stored by this page: the choices live in the page until "Open the Builder", which makes the game
// (POST /api/studio/new), adds a file with the Studio's own upload (POST /api/studio/:id/uploads) and starts the first
// build (POST /api/studio/:id/chat with { plan }). The plan's typed words are part of that message, so they pass the
// same screening as any typed Builder message (builder/agent.js). No voice, no prices, no plans on this page.
// It first asks "What are you making?" (docs/decisions.md "Classroom activity vs Arcade game"): a Classroom activity
// (Oomba Canvas: three short steps, what to practise, how much help, how it is played) or an Arcade game (the steps
// above, unchanged). Classroom activity starts selected for every teacher and when the page is opened from a class
// (?for=class&class=<id>, the class page's Build buttons); kids and families start on Arcade game. Either can switch.
// The class only gives the page its grade and its name (for the chip and the way back), and only when this user teaches
// it: nothing about its students goes into the plan, and only the grade does.
// After #431 (docs/decisions.md "Your lesson: upload and describe"): no topic chips (one text box), a "Your lesson" step
// (an optional lesson plan or worksheet, read on the server and never kept, and a box to describe what they want; every
// word of it goes through builder/lesson.js, which takes out the names of this teacher's students, emails and phone
// numbers), and "How much help?" takes one or more answers (the activity offers only those; Oomba Canvas 1.1.0 lets
// students switch between them).
import { Router } from 'express';
import { html, raw, jsonData } from '../views/html.js';
import { page } from '../views/layout.js';
import { requireBuilder } from '../auth.js';
import { rateLimit } from '../services/ratelimit.js';
import { KIT2_WORLDS, worldById } from '../builder/kit2.js';
import { GAME_TYPES, LOOKS, LEARN, LIMITS, PLAYS, LIVE_NOT, LIVE_NOT_ENGINE, characterGroups, characterName, normalisePlan, planSentence, planEngine, customParts, typeGroups, playDefault, startKind, gradeOf, SUPPORTS, CANVAS_PLAYS, LESSON, LESSON_HEADS } from '../builder/plan.js';
import { FILE_LIMITS, FILE_ACCEPT, kindOf, readLessonFile, scrub, scrubPlan, screenLesson, studentNames } from '../builder/lesson.js';
import express from 'express';
import { allow, count as countLimit } from '../services/ratelimit.js';
import * as S from '../services/schools.js';
import { gradeLabel } from '../views/components.js';
import { teacherHost } from '../services/classlive-access.js';
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
  { key: 'play' },
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
  // the classroom types
  quiet: svg('<path d="M30 8a15 15 0 1 0 10 25A12 12 0 0 1 30 8z"/><path d="M38 10v4M36 12h4"/>'),
  categories: svg('<rect x="5" y="8" width="38" height="32" rx="4"/><path d="M5 18h38M18 8v32M31 8v32M5 29h38"/>'),
  survey: svg('<path d="M8 40h32"/><rect x="11" y="24" width="6" height="12" rx="1"/><rect x="21" y="12" width="6" height="24" rx="1"/><rect x="31" y="18" width="6" height="18" rx="1"/>'),
  bingo: svg('<rect x="7" y="7" width="34" height="34" rx="4"/><path d="M18 7v34M30 7v34M7 18h34M7 30h34"/><circle cx="24" cy="24" r="3"/>'),
  flashcards: svg('<rect x="12" y="6" width="28" height="20" rx="3"/><rect x="8" y="16" width="28" height="24" rx="3"/><path d="M15 28h14M15 33h9"/>'),
  exitticket: svg('<path d="M6 14h36v7a3 3 0 0 0 0 6v7H6v-7a3 3 0 0 0 0-6z"/><path d="M17 24l4 4 9-9"/>'),
  spinner: svg('<circle cx="24" cy="26" r="16"/><path d="M24 26V10M24 26l13 8M24 26l-13 8"/><path d="M20 4h8l-4 6z"/>'),
  scoreboard: svg('<rect x="6" y="10" width="36" height="28" rx="4"/><path d="M24 10v28"/><path d="M13 20v10M14 20h-2"/><path d="M31 21a3 3 0 1 1 5 2l-5 7h6"/>'),
  '3d': svg('<path d="M24 5l16 9v20l-16 9-16-9V14z"/><path d="M8 14l16 9 16-9M24 23v20"/>'),
  '2d': svg('<rect x="6" y="10" width="36" height="28" rx="4"/><path d="M6 31l10-9 8 7 6-5 12 9"/><circle cx="33" cy="18" r="3"/>'),
  // how it is played: live (a big screen and everyone's own devices), on one screen, on my own
  live: svg('<rect x="9" y="5" width="30" height="19" rx="2"/><path d="M24 24v4"/><rect x="4" y="32" width="9" height="12" rx="2"/><rect x="19.5" y="32" width="9" height="12" rx="2"/><rect x="35" y="32" width="9" height="12" rx="2"/>'),
  screen: svg('<rect x="5" y="6" width="38" height="24" rx="3"/><circle cx="13" cy="39" r="3"/><circle cx="24" cy="39" r="3"/><circle cx="35" cy="39" r="3"/>'),
  solo: svg('<circle cx="24" cy="12" r="6"/><rect x="15" y="23" width="18" height="20" rx="3"/><path d="M21 38h6"/>'),
  auto: svg('<path d="M24 6l4 12 12 4-12 4-4 12-4-12-12-4 12-4z"/><path d="M38 6v6M35 9h6"/>'),
  math: svg('<path d="M8 15h12M14 9v12"/><path d="M28 15h12"/><path d="M9 29l10 10M19 29L9 39"/><path d="M28 31h12M28 37h12"/>'),
  reading: svg('<path d="M24 12c-4-3-10-4-16-3v27c6-1 12 0 16 3 4-3 10-4 16-3V9c-6-1-12 0-16 3z"/><path d="M24 12v27"/>'),
  science: svg('<path d="M19 6h10M21 6v12L9 38a3 3 0 0 0 3 4h24a3 3 0 0 0 3-4L27 18V6"/><path d="M14 30h20"/>'),
  geography: svg('<circle cx="24" cy="24" r="17"/><path d="M7 24h34"/><path d="M24 7c-6 5-6 29 0 34 6-5 6-29 0-34z"/>'),
  fun: svg('<circle cx="24" cy="24" r="17"/><path d="M15 28c2 4 5 6 9 6s7-2 9-6"/><path d="M17 19v.5M31 19v.5"/>'),
  // a classroom activity's help and how it is played
  watch: svg('<path d="M4 24s7-12 20-12 20 12 20 12-7 12-20 12S4 24 4 24z"/><circle cx="24" cy="24" r="6"/>'),
  count: svg('<path d="M16 20l8-8 8 8"/><path d="M16 30l8 8 8-8"/><path d="M14 25h20"/>'),
  guided: svg('<path d="M8 40V28h10V18h10V8h12"/><circle cx="12" cy="22" r="3"/>'),
  own: svg('<circle cx="24" cy="14" r="6"/><path d="M14 42c0-8 4-14 10-14s10 6 10 14"/><path d="M34 8l4 4 6-7"/>'),
  devices: svg('<rect x="6" y="14" width="14" height="22" rx="2"/><rect x="28" y="14" width="14" height="22" rx="2"/><path d="M11 31h4M33 31h4"/>'),
  both: svg('<rect x="6" y="6" width="36" height="20" rx="2"/><rect x="10" y="30" width="10" height="14" rx="2"/><rect x="28" y="30" width="10" height="14" rx="2"/>'),
};
ART.board = ART.screen;
// The start screen's small drawings (single colour, the text colour; never an emoji, like the cards' drawings).
const icon = (d, size = 18) => raw(`<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${d}</svg>`);
const ICON = {
  class: icon('<path d="M3 10l9-5 9 5-9 5-9-5z"/><path d="M7 12v4c3 2 7 2 10 0v-4"/>'),
  lock: icon('<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>', 16),
  runner: icon('<circle cx="15" cy="4" r="2"/><path d="M7 11l4-3 4 3 3 1"/><path d="M11 8l-2 6 4 3v5"/><path d="M9 14l-3 3H3"/>', 44),
};
/** The classroom activity's steps after "What should students practise?" (on the start screen). */
export const CANVAS_STEPS = ['lesson', 'help', 'played'];
/** The Classroom activity card's small picture: a fraction bar (g green, y yellow, e empty parts). */
const miniBar = (n, parts) => `<span class="su-kbar" style="--n:${n}">${parts.split('').map(c => `<i class="su-kb-${c}"></i>`).join('')}</span>`;
const art = id => raw(`<span class="su-pic su-art">${ART[id] || ART.else}</span>`);
const check = raw('<span class="su-tick" aria-hidden="true"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" focusable="false"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></span>');

/** What the page's script needs (ids and facts only; every word comes from the locale files). */
export function setupData(t, { teacher = false, forClass = null } = {}) {
  return {
    // "What are you making?": the card that starts selected, and the classroom activity's steps (the grade's topic chips
    // with the kit tool each one means, and the class: only a flag and the grade, never an id the plan carries)
    canvas: { kind: startKind({ teacher, forClass: !!forClass }), supports: SUPPORTS, help: ['guided'], plays: CANVAS_PLAYS, grade: forClass ? forClass.grade : '', forClass: !!forClass },
    // "Your lesson": the headings the prompts put in the box (in this language), its limit, and the file the page may
    // send (teachers only: a kid's own work is never uploaded here)
    lesson: { heads: Object.fromEntries(LESSON_HEADS.map(k => [k, t(`buildSetup.lesson.heads.${k}`)])), max: LESSON.text,
      file: teacher ? { accept: FILE_ACCEPT, kinds: ['pdf', 'docx', 'txt', 'md'], bytes: FILE_LIMITS.bytes } : null },
    steps: STEPS, types: GAME_TYPES.map(x => x.id), looks: LOOKS,
    // the game-type step's groups for this viewer (the first one shows first), and the steps each type skips (a survey
    // or a scoreboard has no 2D or 3D, world or characters)
    typeGroups: typeGroups({ teacher }).map(g => ({ id: g.id, items: g.items.map(x => x.id) })), teacher,
    skip: Object.fromEntries(GAME_TYPES.filter(x => x.skip.length).map(x => [x.id, x.skip])), learn: LEARN, limits: LIMITS, files: SETUP_FILES,
    worlds: KIT2_WORLDS.map(w => ({ id: w.id, name: t(`studio.worlds.names.${w.id}`) })),
    characters: characterGroups().flatMap(g => g.items.map(c => ({ id: c.id, name: characterName(c.id, t), group: g.id, kind: c.kind, worlds: c.worlds, in3d: c.in3d, in2d: c.in2d }))),
    // "How will it be played?": the answers, the one each kind of game starts on for this viewer ('' : no kind picked),
    // the kinds that cannot be live (and why), why a ready-made 3D world cannot, and the kinds made only in 2D (the
    // page works out whether the plan is a ready-made 3D world the way plan.js planEngine does).
    play: {
      plays: PLAYS, kit2: LIVE_NOT_ENGINE.kit2, not: LIVE_NOT, flat: GAME_TYPES.filter(x => x.flat).map(x => x.id),
      def: Object.fromEntries(['', ...GAME_TYPES.map(x => x.id)].map(id => [id, playDefault({ type: id ? { from: 'pack', id } : null, look: null, world: null, characters: [], learn: [], notes: '' }, { forKid: !teacher })])),
      why: Object.fromEntries([...new Set([...Object.values(LIVE_NOT), ...Object.values(LIVE_NOT_ENGINE)])].map(c => [c, t(`buildSetup.play.why.${c}`)])),
    },
    // 2D: the kinds of game that draw a world and one sprite character today, and the worlds that have 2D art
    art2d: { types: ['adventure', ...ART2D_TEMPLATES], worlds: ART2D_WORLD_IDS },
  };
}

/** The setup page's viewer is a teacher (school staff, the platform admin, or a teacher of a class): the classroom
 *  types come first for them, and the teacher-only ones (a survey, an exit ticket) are offered. */
export const setupTeacher = u => !!u && !u.is_guest && teacherHost(u);

/** The class a ?for=class&class=<id> link names, when this user teaches it (or runs its school) and it is not archived:
 *  { id, name, grade ('K'...'8' or ''), gradeText }, else null (the link then opens the page as usual). */
export function setupClass(user, q = {}) {
  if (!user || user.is_guest || q.for !== 'class' || typeof q.class !== 'string' || q.class.length > 64) return null;
  const c = S.getClass(q.class);
  if (!c || c.archived_at || !S.canManageClass(user, c)) return null;
  return { id: c.id, name: c.name, grade: gradeOf(c.grade), raw: c.grade || '' };
}

router.get('/build/new', requireBuilder, (req, res) => {
  const t = req.t, total = STEPS.length, teacher = setupTeacher(req.user), groups = typeGroups({ teacher });
  const forClass = setupClass(req.user, req.query), kind = startKind({ teacher, forClass: !!forClass });
  // One card: a real button (aria-pressed), a picture or drawing, a name of at most two lines and a line under it.
  const card = ({ step, id, pic, title, text = '', extra = '', attrs = '', wrap = '' }) => html`<div class="su-card${extra ? ' has-more' : ''}" data-card="${id}"${raw(wrap)}>
    <button type="button" class="su-pick" data-step="${step}" data-id="${id}" aria-pressed="false"${raw(attrs)}>${pic}<span class="su-name">${title}</span><span class="su-desc">${text}</span>${check}</button>${extra}</div>`;
  const elseCard = step => card({ step, id: 'else', pic: art('else'), title: t('buildSetup.else.title'), text: t('buildSetup.else.text'), attrs: ` aria-controls="su-else-${step}" aria-expanded="false"` });
  const elseBox = s => html`<div class="su-else" id="su-else-${s.key}" hidden>
    <label for="su-idea-${s.key}">${t('buildSetup.else.label')}</label>
    <input class="input" id="su-idea-${s.key}" data-idea="${s.key}" maxlength="${LIMITS.idea}" dir="auto" autocomplete="off" placeholder="${t(`buildSetup.steps.${s.key}.placeholder`)}"${s.pack ? raw(` aria-describedby="su-note-${s.key}"`) : ''}>
    ${s.pack ? html`<p class="su-note" id="su-note-${s.key}">${t('buildSetup.else.packNote')}</p>` : ''}</div>`;
  // "Select all" for one multi-select section (a group of characters, or what it teaches): every card of it that can be
  // picked right now; "Clear all" once they all are. Hidden by the page's script while fewer than two can be picked.
  const allBtn = (scope, name) => html`<button type="button" class="btn btn-sm su-all" data-all="${scope}" data-name="${name}" aria-pressed="false" hidden>${t('js.buildsetup.all.select')}</button>`;
  const nav = html`<div class="su-nav"><button type="button" class="btn" data-go="back">${t('buildSetup.back')}</button><span class="su-nav-end"><button type="button" class="btn btn-ghost su-skipstep" data-go="skip">${t('buildSetup.skip')}</button><button type="button" class="btn btn-primary" data-go="next">${t('buildSetup.next')}</button></span></div>`;
  const head = (s, i) => html`<div class="su-progress"><span class="su-dots" aria-hidden="true">${STEPS.map((x, k) => raw(`<i${k <= i ? ' class="on"' : ''}></i>`))}</span><span class="su-count">${t('buildSetup.progress', { n: i + 1, total })}</span></div>
    <h1 id="su-h-${s.key}" tabindex="-1">${t(`buildSetup.steps.${s.key}.title`)}</h1><p class="su-hint">${t(`buildSetup.steps.${s.key}.hint`)}</p>`;

  const grids = {
    // Two groups ("For your class" and "Games"), one shown at a time; the first is shown at first: for a teacher "For
    // your class", for everyone else the games (in the order they always had) and then the classroom types for kids.
    type: () => html`<div class="su-tabs" role="group" aria-label="${t('buildSetup.typeGroups.label')}">${groups.map((g, i) => html`<button type="button" class="su-tab" data-tgroup-btn="${g.id}" aria-pressed="${i === 0 ? 'true' : 'false'}" aria-controls="su-grid-type">${t(`buildSetup.typeGroups.${g.id}`)}</button>`)}</div>
      ${groups.map((g, i) => html`<p class="su-thint" data-tgroup-hint="${g.id}"${i ? raw(' hidden') : ''}>${t(`buildSetup.typeGroups.${g.id}Text`)}</p>`)}
      <div class="su-grid su-grid-text" id="su-grid-type" role="group" aria-labelledby="su-h-type">${groups.map((g, i) => g.items.map(x => card({ step: 'type', id: x.id, pic: art(x.id), title: t(`buildSetup.types.${x.id}.title`), text: t(`buildSetup.types.${x.id}.text`), wrap: ` data-tgroup="${g.id}"${i ? ' hidden' : ''}` })))}${elseCard('type')}</div>`,
    look: () => html`<div class="su-grid su-grid-text su-grid-3" role="group" aria-labelledby="su-h-look">${LOOKS.map(id => card({ step: 'look', id, pic: art(id), title: t(`buildSetup.looks.${id}.title`), text: t(`buildSetup.looks.${id}.text`) }))}</div>`,
    world: () => html`<p class="su-flag" id="su-world-2d" hidden>${t('buildSetup.flatNote')}</p>
      <div class="su-grid su-grid-world" role="group" aria-labelledby="su-h-world">${KIT2_WORLDS.map(w => { const name = t(`studio.worlds.names.${w.id}`); return card({ step: 'world', id: w.id, title: name, text: t(`buildSetup.worlds.${w.id}`),
        pic: html`<span class="su-pic"><img src="/vendor/themes/${w.id}/${w.version}/cover.webp" alt="" width="640" height="360" loading="lazy" decoding="async"></span>`,
        extra: html`<button type="button" class="btn btn-sm su-preview" data-preview="${w.id}" aria-label="${t('buildSetup.world.previewLabel', { name })}">${t('buildSetup.world.preview')}</button>` }); })}${card({ step: 'world', id: 'else', pic: art('else'), title: t('buildSetup.else.title'), text: t('buildSetup.else.text'), attrs: ' aria-controls="su-else-world" aria-expanded="false"', extra: raw('<span class="su-preview-gap" aria-hidden="true"></span>') })}</div>`,
    chars: () => html`<p class="su-flag" id="su-chars-2d" hidden>${t('buildSetup.flatNote')}</p>
      ${characterGroups().map(g => html`<section class="su-group${g.soon ? ' is-soon' : ''}" data-group="${g.id}" aria-labelledby="su-g-${g.id}">
        <div class="su-ghead"><h2 id="su-g-${g.id}">${t(`buildSetup.groups.${g.id}`)}${g.soon ? html` <span class="stchip su-soon">${t('buildSetup.chars.soon')}</span>` : g.only2d ? html` <span class="stchip su-soon" data-soon3d>${t('buildSetup.chars.soon3d')}</span>` : ''}</h2>${g.soon ? '' : allBtn(`chars:${g.id}`, t(`buildSetup.groups.${g.id}`))}</div>
        ${g.soon ? html`<p class="su-soon-text muted">${t('buildSetup.chars.soonText')}</p>`
          : html`<div class="su-grid su-grid-char" role="group" aria-labelledby="su-g-${g.id}">${g.items.map(c => card({ step: 'chars', id: c.id, title: characterName(c.id, t), text: '',
            // the 3D picker's picture, or the 2D picker's for an animal that is only a sprite so far
            pic: c.in3d ? html`<span class="su-pic"><img src="/img/kit2/heroes/${c.id}.webp" alt="" width="96" height="96" loading="lazy" decoding="async"></span>`
              : html`<span class="su-pic su-pic-2d"><img src="/img/art2d/animals/${c.id}.webp" alt="" width="96" height="64" loading="lazy" decoding="async"></span>` }))}</div>`}
      </section>`)}
      <section class="su-group" aria-labelledby="su-g-else"><h2 id="su-g-else" class="sr-only">${t('buildSetup.else.title')}</h2><div class="su-grid su-grid-char">${elseCard('chars')}</div></section>`,
    // Live with my class or group / On one screen / On my own. A Live that this kind of game (or a ready-made 3D world)
    // cannot be yet stays on the page, greyed out, with the reason in its line (public/js/buildsetup.js).
    play: () => html`<div class="su-grid su-grid-text su-grid-3 su-grid-play" role="group" aria-labelledby="su-h-play">${PLAYS.map(id => card({ step: 'play', id, pic: art(id), title: t(`buildSetup.play.${id}.title`), text: t(`buildSetup.play.${id}.text`) }))}</div>`,
    learn: () => html`<div class="su-ghead su-ghead-end">${allBtn('learn', t('js.buildsetup.stepNames.learn'))}</div><div class="su-grid su-grid-text" role="group" aria-labelledby="su-h-learn">${LEARN.map(id => card({ step: 'learn', id, pic: art(id), title: t(`buildSetup.learn.${id}.title`), text: t(`buildSetup.learn.${id}.text`) }))}${elseCard('learn')}</div>`,
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

  // "Your lesson": an optional file (teachers: a lesson plan or worksheet, read on the server and never kept) and a box to
  // describe what they want, with prompts that put a heading in it. Everything here is optional ("Skip").
  const lessonBody = html`<p class="su-safe su-lsafe">${ICON.lock} <span>${t('buildSetup.lesson.safe')}</span></p>
      ${teacher ? html`<div class="su-file su-lfile panel" id="su-lfile-box">
        <h2 id="su-lfile-h">${t('buildSetup.lesson.fileTitle')}</h2>
        <p class="su-file-text" id="su-lfile-kinds">${t('buildSetup.lesson.fileText')}</p>
        <input type="file" id="su-lfile" class="sr-only" accept="${FILE_ACCEPT}" aria-labelledby="su-lfile-h" aria-describedby="su-lfile-kinds" tabindex="-1">
        <button type="button" class="btn" id="su-lfile-btn">${t('buildSetup.lesson.choose')}</button>
        <div class="su-lstatus" id="su-lstatus" aria-live="polite" hidden></div>
        <p class="su-lerr" id="su-lerr" role="alert" hidden></p>
      </div>` : ''}
      <div class="su-describe panel">
        <label class="su-dlabel" for="su-ltext">${t('buildSetup.lesson.describe')}</label>
        <p class="small muted su-dhelp" id="su-ltext-help">${t('buildSetup.lesson.describeHelp')}</p>
        <div class="su-heads" role="group" aria-label="${t('buildSetup.lesson.prompts')}">${LESSON_HEADS.map(k => html`<button type="button" class="chip su-head" data-head="${k}" aria-controls="su-ltext"><span aria-hidden="true">+</span> ${t(`buildSetup.lesson.prompt.${k}`)}</button>`)}</div>
        <textarea class="input su-ltext" id="su-ltext" rows="9" maxlength="${LESSON.text}" dir="auto" aria-describedby="su-ltext-help su-lcount" placeholder="${t('buildSetup.lesson.placeholder')}"></textarea>
        <p class="su-lcount small muted" id="su-lcount" aria-live="polite"><span dir="ltr">0 / ${LESSON.text}</span></p>
      </div>`;
  // "How much help?": real checkboxes, styled as the cards; one or more (at least one), Guided to start.
  const helpBody = html`<div class="su-grid su-grid-text su-grid-4 su-grid-check" role="group" aria-labelledby="su-h-help" aria-describedby="su-hint-help">${SUPPORTS.map(id => html`<div class="su-card su-check" data-card="${id}">
      <label class="su-pick su-cpick"><input type="checkbox" class="sr-only su-cbox" data-help="${id}" value="${id}"${id === 'guided' ? raw(' checked') : ''}>${art(id)}<span class="su-name">${t(`buildSetup.canvas.help.${id}.title`)}</span><span class="su-desc">${t(`buildSetup.canvas.help.${id}.text`)}</span><span class="su-box" aria-hidden="true">${check}</span></label></div>`)}</div>
      <p class="su-flag su-one" id="su-help-one" role="status" hidden>${t('buildSetup.lesson.atLeastOne')}</p>`;

  const body = html`
  <div class="su" id="su">
    <div class="su-top"><p class="su-brand">${forClass ? t('buildSetup.kind.forClassTitle') : t('buildSetup.title')}</p><button type="button" class="btn" id="su-skipall" hidden>${t('buildSetup.skipAll')}</button></div>
    <section class="su-screen su-start" data-screen="start" aria-labelledby="su-h-start" data-kind="${kind}">
      ${forClass ? html`<span class="su-for">${ICON.class} ${forClass.raw ? t('buildSetup.kind.forChip', { name: forClass.name, grade: gradeLabel(t, forClass.raw) }) : t('buildSetup.kind.forChipNoGrade', { name: forClass.name })}</span>` : ''}
      <h1 id="su-h-start" tabindex="-1">${t('buildSetup.kind.heading')}</h1><p class="su-hint">${t('buildSetup.kind.text')}</p>
      <div class="su-kinds" role="group" aria-labelledby="su-h-start">
        <button type="button" class="su-kind" data-kind="activity" aria-pressed="${kind === 'activity' ? 'true' : 'false'}">
          ${forClass || teacher ? html`<span class="su-rec" data-rec><span class="su-rtick" aria-hidden="true">✓</span> ${t('buildSetup.kind.forClass')}</span>` : ''}
          <span class="su-kpic su-kcanvas" aria-hidden="true">${raw(miniBar(4, 'ggge'))}${raw(miniBar(8, 'yyyyeeee'))}<span class="su-kmrow"><span class="su-kmtile"></span><span class="su-kmtile"></span><span class="su-kgrow"></span><span class="su-kmbtn su-kmgo">✓ ${t('buildSetup.kind.check')}</span><span class="su-kmbtn">${t('buildSetup.kind.hint')}</span></span></span>
          <span class="su-kt">${t('buildSetup.kind.activity.title')}</span>
          <span class="su-kd">${t('buildSetup.kind.activity.text')}</span>
          <span class="su-ktags">${['fractions', 'numberline', 'digits', 'tiles'].map(k => html`<span>${t(`buildSetup.kind.tools.${k}`)}</span>`)}</span>
        </button>
        <button type="button" class="su-kind" data-kind="arcade" aria-pressed="${kind === 'arcade' ? 'true' : 'false'}">
          <span class="su-kpic su-karcade" aria-hidden="true"><span class="su-ksun"></span><span class="su-khill"></span><span class="su-kground"></span><span class="su-kcoin" style="inset-inline-start:58%"></span><span class="su-kcoin" style="inset-inline-start:70%;bottom:110px"></span><span class="su-kp">${ICON.runner}</span></span>
          <span class="su-kt">${t('buildSetup.kind.arcade.title')}</span>
          <span class="su-kd">${t('buildSetup.kind.arcade.text')}</span>
          <span class="su-ktags">${['runner', 'catch', 'quiz', 'worlds'].map(k => html`<span>${t(`buildSetup.kind.games.${k}`)}</span>`)}</span>
        </button>
      </div>
      ${'' /* No topic box here: "Your lesson" (the next step) asks for everything about the lesson (docs/decisions.md "Builder: no topic box on the first step"). */}
      <div class="su-kways">
        <button type="button" class="btn" id="su-direct" data-for="both">${t('buildSetup.start.direct')}</button>
        <button type="button" class="btn btn-primary" id="su-cnext" data-for="activity"${kind === 'activity' ? '' : raw(' hidden')}>${t('buildSetup.canvas.nextLesson')} <span aria-hidden="true">›</span></button>
        <button type="button" class="btn btn-primary" id="su-guide" data-for="arcade"${kind === 'arcade' ? '' : raw(' hidden')}>${t('buildSetup.start.guide')} <span aria-hidden="true">›</span></button>
      </div>
      <p class="su-tools muted">${t('buildSetup.kind.toolsText')} <a href="#type" id="su-tools">${t('buildSetup.kind.toolsLink')}</a></p>
    </section>
    ${CANVAS_STEPS.map((k, i) => html`<section class="su-screen su-step su-cstep" data-screen="${k}" aria-labelledby="su-h-${k}" hidden>
      <div class="su-progress"><span class="su-dots" aria-hidden="true">${[0, 1, 2, 3].map(n => raw(`<i${n <= i + 1 ? ' class="on"' : ''}></i>`))}</span><span class="su-count">${t('buildSetup.progress', { n: i + 2, total: CANVAS_STEPS.length + 1 })}</span></div>
      <h1 id="su-h-${k}" tabindex="-1">${t(k === 'lesson' ? 'buildSetup.lesson.heading' : `buildSetup.canvas.${k}.heading`)}</h1><p class="su-hint" id="su-hint-${k}">${t(k === 'lesson' ? 'buildSetup.lesson.hint' : `buildSetup.canvas.${k}.hint`)}</p>
      ${k === 'lesson' ? lessonBody : k === 'help' ? helpBody
        : html`<div class="su-grid su-grid-text su-grid-3" role="group" aria-labelledby="su-h-${k}">${CANVAS_PLAYS.map(id => card({ step: k, id, pic: art(id), title: t(`buildSetup.canvas.${k}.${id}.title`), text: t(`buildSetup.canvas.${k}.${id}.text`) }))}</div>`}
      <div class="su-nav"><button type="button" class="btn" data-go="back">${t('buildSetup.back')}</button><span class="su-nav-end">${k === 'lesson' ? html`<button type="button" class="btn btn-ghost su-skipstep" data-go="skip">${t('buildSetup.skip')}</button>` : ''}<button type="button" class="btn btn-primary" data-go="next">${k === 'lesson' ? t('buildSetup.next') : k === 'help' ? t('buildSetup.canvas.nextPlayed') : t('buildSetup.next')}</button></span></div>
    </section>`)}
    ${STEPS.map((s, i) => html`<section class="su-screen su-step" data-screen="${s.key}" aria-labelledby="su-h-${s.key}" hidden>
      ${head(s, i)}${grids[s.key]()}${s.other ? elseBox(s) : ''}${nav}
    </section>`)}
    <section class="su-screen su-plan" data-screen="plan" aria-labelledby="su-h-plan" hidden>
      <h1 id="su-h-plan" tabindex="-1">${t('buildSetup.plan.heading')}</h1><p class="su-hint">${t('buildSetup.plan.text')}</p>
      <dl class="su-rows panel" id="su-rows"></dl>
      <section class="su-lsum panel" id="su-lsum" aria-live="polite" hidden></section>
      <p class="su-flag" id="su-plan-2d" hidden>${t('buildSetup.flatNote')}</p>
      <div class="su-told"><p class="su-told-h" id="su-told-h">${t('buildSetup.plan.told')}</p><p class="su-told-t" id="su-told" aria-labelledby="su-told-h" aria-live="polite"></p></div>
      <div class="su-nav"><button type="button" class="btn" data-go="back">${t('buildSetup.back')}</button><button type="button" class="btn btn-hot su-open" id="su-open">${t('buildSetup.plan.open')}</button></div>
    </section>
    <p class="sr-only" id="su-live" aria-live="polite"></p>
  </div>
  ${jsonData('page-data', setupData(t, { teacher, forClass }))}`;
  page(req, res, { title: t('buildSetup.title'), active: 'build', back: forClass ? `/class/${forClass.id}` : '/build', backLabel: forClass ? forClass.name : t('nav.build'), body, mid: true, bodyClass: 'setup-page',
    head: raw('<link rel="stylesheet" href="/css/studio.css"><link rel="stylesheet" href="/css/build-setup.css">'), scripts: ['/js/buildsetup.js'], });
});

// The summary's sentence, made on the server from the choices (the same sentence the Builder gets when the builder
// opens it: runner.submit). Nothing is stored; the typed words are only trimmed here, and screened when they are sent.
// A classroom activity's plan comes back as the model would see it: builder/lesson.js scrubPlan takes out the names of
// this teacher's students, emails, phone numbers and links, and a lesson that fails the Builder's pre-filter is left
// out (lessonBlocked says why, so the page can say so before anything is sent).
// Body: { plan, files } -> { plan (as the Builder will use it), text, custom: ['type' | 'world' | 'character'], engine,
// lessonBlocked?, removed? }.
router.post('/api/build/plan', requireBuilder, rateLimit('build-plan', 60, 60e3), (req, res) => {
  const b = req.body || {};
  let plan = normalisePlan(b.plan, { forKid: !setupTeacher(req.user) });
  if (!plan) return res.json({ plan: null, text: '', custom: [], engine: 'open' });
  const sc = scrubPlan(plan, req.user); plan = sc.plan;
  const e = planEngine(plan), files = Math.max(0, Math.min(SETUP_FILES.max, Math.round(+b.files || 0)));
  res.json({ plan, text: planSentence(plan, req.t, { files }), custom: customParts(plan), engine: e.engine, ...(e.engine === 'kit2' ? { world: e.world, worldName: req.t(`studio.worlds.names.${worldById(e.world).id}`) } : {}),
    ...(e.engine === 'canvas' ? { removed: Object.values(sc.removed).reduce((a, n) => a + n, 0), ...(sc.blocked ? { lessonBlocked: true } : {}) } : {}) });
});

// "Your lesson": a teacher's lesson plan or worksheet -> its text, for the page to keep with the other setup choices
// (builder/lesson.js readLessonFile: Crossword's readers, no AI). The raw body is the file; ?name= its name (its kind
// comes from it: .pdf, .docx, .txt, .md). Teachers only (a kid's own work is never uploaded here); 5 MB, a PDF of at most
// 10 pages, 20 files read a day. The file is never stored or logged: it is read in memory and let go; what comes back is
// its text, cut to 10,000 characters, after the scrubber took out the names of this teacher's students, emails, phone
// numbers and links, and only when it passes the Builder's pre-filter.
// -> { name, kind, pages, words, cut, removed, text } | { error, code }.
router.post('/api/build/lesson-file', requireBuilder, rateLimit('build-lesson', 20, 60e3),
  express.raw({ type: () => true, limit: FILE_LIMITS.bytes + 1024, inflate: false }), (req, res) => {
    const fail = (status, code) => res.status(status).json({ error: req.t(`js.buildsetup.lesson.err.${code}`), code });
    if (!setupTeacher(req.user)) return fail(403, 'notAllowed');
    const name = String(req.query.name || '').normalize('NFC').replace(/[\u0000-\u001f\u007f/\\]+/g, ' ').trim().slice(0, LESSON.name) || 'lesson';
    const kind = kindOf(name), buf = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    if (!kind) return fail(400, 'docType');
    if (buf.length > FILE_LIMITS.bytes) return fail(413, 'docBig');
    const day = `build-lesson-day:${req.user.id}`;
    if (countLimit(day) >= FILE_LIMITS.perDay) return fail(429, 'docLimit');
    const r = readLessonFile({ kind, buf });
    if (!r.ok) return fail(400, r.code);
    allow(day, FILE_LIMITS.perDay, 864e5);   // a file read counts towards the day's 20 (one turned away for its size or kind does not)
    const names = studentNames(req.user), text = scrub(r.text, names), shown = scrub(name, names).text;
    if (screenLesson(text.text)) return fail(400, 'blocked');
    const removed = Object.values(text.removed).reduce((a, n) => a + n, 0);
    res.json({ name: shown, kind, pages: r.pages, words: r.words, cut: r.cut, removed, text: text.text });
  });
