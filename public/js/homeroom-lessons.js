// Homeroom lessons, step 2b (docs/decisions.md "Homeroom, step 2b"; server: services/homeroom-lessons.js): the teacher's
// My lessons in the board's left panel, the lesson builder and the lesson's hand-out sheet. Used by public/js/homeroom.js.
//   - My lessons: each lesson is a handout like a game (tap it, then a desk, a group or Whole class; or drag it there),
//     with ⋯ for Edit, Duplicate, Print worksheet and Delete; "+ Build a lesson" under them.
//   - The builder (the owner-approved mockup): pick Arithmetic Lab, Algebra Builder or Crossword (the rest of the spec's
//     order is listed as coming later), then that game's own settings (public/js/homeroom-lesson-make.js), "A version for
//     each group?" (each group starts from the lesson with a suggested easier or harder change, every bit editable), the
//     instructions and a live worksheet preview made by the game's own printer (POST .../lessons/preview). Crossword has
//     "Ask Oomba to fill it in": clues for the teacher's words (the game's own AI clue writer, POST /api/games/:id/clues;
//     only the words go, never anything about a student). "Save to My lessons".
//   - The lesson's hand-out sheet: who gets which version, the order on the desk and the grading (Score by default).
// Group names are the teacher's words for the teacher: they are never printed on a worksheet or shown to a student.
import { t, api, toast, esc, sheet, ask } from '/js/app.js';
import { iconHtml } from '/js/icons.js';
import { dueField, wireDue } from '/js/homeroom-due.js';
import { ARITH, ALGEBRA, CROSS, defaults, fill, suggest, leanOf, groupIdent, countOf, newSeed } from '/js/homeroom-lesson-make.js';

const tl = (k, v) => t(`js.homeroom-lessons.${k}`, v);
const btn = (cls, attrs, label) => `<button type="button" class="${cls}" ${attrs}>${label}</button>`;
const seg = (name, opts, on, label = '') => `<div class="hr-seg" role="radiogroup"${label ? ` aria-labelledby="${label}"` : ''}>${opts.map(([v, text]) => btn(`hr-segb${String(v) === String(on) ? ' on' : ''}`, `role="radio" aria-checked="${String(v) === String(on)}" data-lbseg="${name}" data-v="${esc(String(v))}"`, esc(text))).join('')}</div>`;
const LATER = ['quiz', 'mine', 'atlas', 'sudoku', 'castle', 'manip', 'figures', 'reading'];
const LATER_ICONS = { quiz: '❓', mine: '🎮', atlas: '🗺️', sudoku: '🔢', castle: '🏰', manip: '🧮', figures: '📐', reading: '📚' };

// ---------------------------------------------------------------- words for settings
export function sizeText(op, name) {
  if (op === 'add' || op === 'subtract') return tl('sizeEach', { n: name });
  const [a, b] = name.split(/[x/]/);
  return tl('sizeBy', { a, b, op: op === 'divide' ? '÷' : '×' });
}
/** A version's settings in one line: "Divide · 3 ÷ 1 digits · 10 problems · Guided". */
export function summary(slug, s) {
  if (slug === 'arithmetic-lab') return [tl(`ops.${s.op}`), sizeText(s.op, s.size), ...(s.method && s.method !== 'standard' ? [tl(`methods.${s.method}`)] : []), tl('problemsN', { count: countOf(slug, s) }), tl(`levels.${s.level}`)].join(' · ');
  if (slug === 'algebra-builder') return [tl(`modes.${s.mode}`), tl(`alLevels.${s.level}`), tl('problemsN', { count: countOf(slug, s) })].join(' · ');
  return [tl('wordsN', { count: countOf(slug, s) }), s.bank ? tl('bankShown') : tl('bankHidden')].join(' · ');
}

// ---------------------------------------------------------------- printing (the page's own print area, as play.js)
export function printHtml(html) {
  let area = document.getElementById('print-area');
  if (!area) { area = document.createElement('div'); area.id = 'print-area'; area.className = 'print-area'; document.body.appendChild(area); }
  area.innerHTML = html;
  document.body.classList.add('printing');
  const after = () => { document.body.classList.remove('printing'); area.innerHTML = ''; removeEventListener('afterprint', after); };
  addEventListener('afterprint', after);
  window.print();
}

// ---------------------------------------------------------------- My lessons in the panel
/** ctx: { D, H, api2, groupName, onLessons(list), onHanded(r) } from public/js/homeroom.js. */
export function renderLessons(ctx) {
  const el = document.getElementById('hr-lessons'); if (!el) return;
  const list = ctx.H.lessons;
  // (cards like the rest of Find lessons: docs/decisions.md "Homeroom: live games inside Homeroom, a simpler Find
  // lessons"; nothing yet is just the Build a lesson plan card, never an empty line taking room)
  el.innerHTML = `<ul class="hr-items hr-cgrid">${list.map(l => `<li class="hr-lrow hr-cc" data-k="plan" data-q="${esc(String(l.title || '').toLowerCase())}"><button type="button" class="hr-item hr-give hr-lesson hr-ccard" data-hritem="L:${esc(l.id)}" data-icon="${esc(l.icon)}" aria-pressed="${ctx.H.pick && ctx.H.pick.id === `L:${l.id}`}">
      <span class="hr-ico hr-lico" aria-hidden="true">${iconHtml(l.icon, { size: 28 })}</span><span class="hr-ctext hr-lt"><span class="hr-itemt" dir="auto">${esc(l.title)}</span><span class="hr-ckind hr-lsub">${esc([tl('kind'), tl(l.slug === 'crossword' ? 'wordsN' : 'problemsN', { count: l.n }), l.versions.length ? tl('versionsN', { count: l.versions.length }) : ''].filter(Boolean).join(' · '))}</span></span><span class="hr-ccheck" aria-hidden="true"></span></button>
      ${btn('hr-lmore', `data-hrlmore="${esc(l.id)}" aria-label="${esc(tl('more', { title: l.title }))}"`, '⋯')}</li>`).join('')}
    <li class="hr-cc hr-cbuildplan" data-k="plan" data-q="${esc(tl('build').toLowerCase())}">${btn('hr-item hr-build hr-ccard', 'data-hr="build"', `<span class="hr-ico hr-buildico" aria-hidden="true">+</span><span class="hr-ctext"><span class="hr-itemt">${esc(tl('build'))}</span>${list.length ? '' : `<span class="hr-ckind">${esc(tl('buildText'))}</span>`}</span>`)}</li></ul>`;
  // the catalog's filters apply to the new cards too
  el.closest('[data-catalog]')?.dispatchEvent(new CustomEvent('hr:catalog'));
}
/** A lesson's ⋯ sheet: Edit, Duplicate, Print worksheet (each version), Delete. */
export function lessonMenu(ctx, id) {
  const l = ctx.H.lessons.find(x => x.id === id); if (!l) return;
  const sh = sheet({ title: `📄 ${l.title}`, content: `<div class="hr-lmenu"><p class="small muted">${esc(l.game)} · ${esc(summary(l.slug, l.base))}</p>
    ${l.versions.length ? `<p class="small muted">${esc(tl('versionsFor', { groups: l.versions.map(v => v.label).join(', ') }))}</p>` : ''}
    ${l.instructions ? `<p class="hr-dins" dir="auto">${esc(l.instructions)}</p>` : ''}
    <div class="hr-lmenuacts">${btn('btn', 'data-lm="edit"', `${iconHtml('✏️', { size: 18 })} ${esc(tl('edit'))}`)}${btn('btn', 'data-lm="dup"', `${iconHtml('📑', { size: 18 })} ${esc(tl('duplicate'))}`)}
      ${btn('btn', 'data-lm="print"', `${iconHtml('🖨️', { size: 18 })} ${esc(tl('print'))}`)}${btn('btn btn-danger', 'data-lm="del"', `${iconHtml('🗑️', { size: 18 })} ${esc(tl('delete'))}`)}</div></div>` });
  sh.el.querySelector('.hr-lmenu').addEventListener('click', async e => {
    const b = e.target.closest('[data-lm]'); if (!b) return;
    const k = b.dataset.lm;
    if (k === 'edit') { sh.close(); openBuilder(ctx, l); return; }
    if (k === 'print') { sh.close(); printSheet(ctx, l); return; }
    if (k === 'del' && !(await ask({ title: tl('delete'), text: tl('deleteConfirm', { title: l.title }), ok: tl('delete'), danger: true }))) return;
    try {
      const r = await api(ctx.api2(`lessons/${encodeURIComponent(l.id)}/${k === 'dup' ? 'duplicate' : 'delete'}`), { method: 'POST', body: {} });
      ctx.onLessons(r.lessons); sh.close(); toast(r.toast);
    } catch (err) { toast(err.message, { bad: true }); }
  });
}
/** Print worksheet: which version (Everyone, or a group's), with or without the answer key, then the page prints. */
function printSheet(ctx, l) {
  const keyable = l.slug !== 'algebra-builder';
  const opts = [...l.versions.map(v => [v.key, v.label]), ['', l.versions.length ? tl('noGroup') : tl('printLesson')]];
  const sh = sheet({ title: `🖨️ ${tl('print')}`, content: `<form class="hr-giveform hr-lprint" novalidate><p class="small muted">${esc(tl('printLead'))}</p>
    ${opts.length > 1 ? `<p class="hr-label" id="hrp-which">${esc(tl('printWhich'))}</p>${seg('v', opts, '', 'hrp-which')}` : ''}
    ${keyable ? `<label class="hr-check"><input type="checkbox" id="hrp-key"> ${esc(tl('printKey'))}</label>` : ''}
    <p class="err" id="hrp-err" aria-live="polite"></p>
    <div class="row hr-giveacts">${btn('btn', 'data-lp="cancel"', esc(tl('cancel')))}<button class="btn btn-primary" type="submit">${iconHtml('🖨️', { size: 18 })} ${esc(tl('printGo'))}</button></div></form>` });
  const f = sh.el.querySelector('form'); let which = '';
  f.addEventListener('click', e => {
    const b = e.target.closest('[data-lbseg]');
    if (b) { which = b.dataset.v; for (const x of f.querySelectorAll('[data-lbseg]')) { const on = x === b; x.classList.toggle('on', on); x.setAttribute('aria-checked', String(on)); } }
    if (e.target.closest('[data-lp="cancel"]')) sh.close();
  });
  f.addEventListener('submit', async e => {
    e.preventDefault();
    try {
      const r = await api(ctx.api2(`lessons/${encodeURIComponent(l.id)}/print`), { method: 'POST', body: { version: which, key: !!f.querySelector('#hrp-key')?.checked } });
      sh.close(); printHtml(r.html);
    } catch (err) { f.querySelector('#hrp-err').textContent = err.message; }
  });
}

// ---------------------------------------------------------------- the builder
/** Open the builder: a new lesson (pick a game first) or one to edit. */
export function openBuilder(ctx, lesson = null) {
  const games = ctx.D.lessonGames || [];
  if (!lesson && ctx.H.lessons.length >= (ctx.D.lessonsMax || 100)) { toast(tl('full', { count: ctx.H.lessons.length }), { bad: true }); return; }
  const sh = sheet({ title: `📄 ${lesson ? tl('editTitle') : tl('build')}`, content: '<div class="hr-lb" id="hr-lb"></div>' });
  sh.el.querySelector('.sheet').classList.add('hr-lbsheet');
  const box = sh.el.querySelector('#hr-lb');
  if (lesson) return builderForm(ctx, sh, box, games.find(g => g.slug === lesson.slug) || { slug: lesson.slug, title: lesson.game, icon: lesson.icon }, lesson);
  box.innerHTML = `<h3 class="hr-lbh">${esc(tl('pickTitle'))}</h3><p class="small muted">${esc(tl('pickLead'))}</p>
    <div class="hr-lbpick">${games.map(g => btn('hr-lbgame', `data-lbgame="${esc(g.slug)}"`, `<span class="hr-ico" aria-hidden="true">${iconHtml(g.icon, { size: 22 })}</span><span dir="auto">${esc(g.title)}</span>`)).join('')}
      ${LATER.map(k => `<span class="hr-lbgame later" aria-disabled="true"><span class="hr-ico" aria-hidden="true">${iconHtml(LATER_ICONS[k], { size: 22 })}</span><span>${esc(tl(`later.${k}`))}</span><span class="hr-soontag">${esc(tl('comingLater'))}</span></span>`).join('')}</div>
    <div class="row hr-giveacts">${btn('btn', 'data-lb="cancel"', esc(tl('cancel')))}</div>`;
  box.addEventListener('click', function pick(e) {
    const g = e.target.closest('[data-lbgame]');
    if (g) { box.removeEventListener('click', pick); builderForm(ctx, sh, box, games.find(x => x.slug === g.dataset.lbgame), null); return; }
    if (e.target.closest('[data-lb="cancel"]')) sh.close();
  });
}

function builderForm(ctx, sh, box, game, lesson) {
  const slug = game.slug, groups = ctx.H.groups.filter(g => groupIdent(g));
  const label = g => ctx.groupName(g);
  // the state: the base settings, a version per group (kept by its group's identity), which one the form edits
  const S = {
    title: lesson ? lesson.title : '', instructions: lesson ? lesson.instructions : '',
    base: lesson ? fill(slug, lesson.base) : defaults(slug), versions: new Map(), on: false, cur: '', busy: false, seq: 0, html: '',
  };
  if (lesson) for (const v of lesson.versions) S.versions.set(v.key, { key: v.key, label: v.label, s: fill(slug, v.s) });
  S.on = S.versions.size > 0;
  if (slug === 'crossword' && !S.base.words.length) S.base.words = [['', ''], ['', ''], ['', '']];
  const curSettings = () => (S.cur && S.versions.get(S.cur) ? S.versions.get(S.cur).s : S.base);
  const setCur = s => { if (S.cur && S.versions.get(S.cur)) S.versions.get(S.cur).s = s; else S.base = s; };
  const max = ctx.D.instructionsMax || 300;
  box.innerHTML = `<p class="hr-eyebrow" dir="auto">${esc(game.title)}</p>
    <label class="sr-only" for="hrl-title">${esc(tl('name'))}</label>
    <input class="input hr-lbtitle" id="hrl-title" maxlength="${ctx.D.titleMax || 60}" placeholder="${esc(tl('namePh'))}" value="${esc(S.title)}" autocomplete="off">
    <div class="hr-lbcols">
      <div class="hr-lbset">
        <div id="hrl-chips"></div>
        <div id="hrl-fields"></div>
        <p class="hr-label" id="hrl-vq">${esc(tl('versions'))}</p><div id="hrl-vseg"></div><p class="small muted hr-seghint" id="hrl-vhint"></p>
        <label class="hr-label" for="hrl-ins">${esc(tl('instructions'))}</label>
        <textarea class="input hr-ins" id="hrl-ins" rows="2" maxlength="${max}" placeholder="${esc(tl('instructionsPh'))}">${esc(S.instructions)}</textarea>
      </div>
      <section class="hr-lbprev" aria-labelledby="hrl-prevh">
        <div class="hr-lbprevhead"><h4 id="hrl-prevh">${esc(tl('preview'))}</h4>${btn('btn btn-sm', 'data-lb="print"', `${iconHtml('🖨️', { size: 16 })} ${esc(tl('printDraft'))}`)}</div>
        <div class="hr-lbpaperbox" id="hrl-paperbox"><div class="hr-lbsizer" id="hrl-sizer"><div class="hr-lbpaper" id="hrl-paper" aria-live="polite"></div></div></div>
        <p class="small muted">${esc(tl('previewNote'))}</p>
      </section>
    </div>
    <p class="err" id="hrl-err" aria-live="polite"></p>
    <div class="row hr-lbacts">${btn('btn', 'data-lb="cancel"', esc(tl('cancel')))}
      ${slug === 'crossword' && ctx.D.ai ? btn('btn', 'data-lb="ai"', `${iconHtml('✨', { size: 18 })} ${esc(tl('ai'))}`) : ''}
      ${btn('btn btn-primary hr-lbsave', 'data-lb="save"', esc(tl('save')))}</div>`;
  const $ = id => box.querySelector(`#${id}`);

  // ---- the version chips (when there is a version for each group) and the yes / no question
  function drawVersions() {
    $('hrl-vseg').innerHTML = seg('on', [['1', tl('versionsYes')], ['0', tl('versionsNo')]], S.on ? '1' : '0', 'hrl-vq');
    $('hrl-vhint').textContent = !groups.length ? tl('noGroups') : S.on ? tl('versionsHint') : tl('versionsOff');
    if (!S.on || !groups.length) { $('hrl-chips').innerHTML = ''; return; }
    const ident = g => groupIdent(g);
    const chip = (key, text, color, lean) => btn(`hr-vchip${S.cur === key ? ' on' : ''}`, `data-lbv="${esc(key)}" aria-pressed="${S.cur === key}"${color ? ` style="--gc:${esc(color)}"` : ''}`,
      `${color ? `<span class="rm-dot" style="--c:${esc(color)}"></span>` : ''}<span dir="auto">${esc(text)}</span>${lean ? `<span class="hr-vlean">${esc(lean)}</span>` : ''}`);
    $('hrl-chips').innerHTML = `<p class="hr-label" id="hrl-ch">${esc(tl('editing'))}</p><div class="hr-vchips" role="group" aria-labelledby="hrl-ch">
      ${groups.map((g, i) => chip(ident(g), label(g), g.color, tl(`lean.${['easier', 'same', 'harder'][leanOf(i, groups.length) + 1]}`))).join('')}
      ${chip('', tl('noGroup'), '', '')}</div>`;
  }
  function setOn(on) {
    S.on = on && groups.length > 0;
    if (S.on) groups.forEach((g, i) => { const k = groupIdent(g); if (!S.versions.has(k)) S.versions.set(k, { key: k, label: label(g), s: suggest(slug, S.base, leanOf(i, groups.length)) }); });
    if (!S.on) S.cur = '';
    else if (!S.cur) S.cur = groupIdent(groups[0]);
    drawVersions(); drawFields(); queuePreview();
  }

  // ---- the game's own settings for the version being edited
  function drawFields() {
    const s = curSettings();
    let h = '';
    if (slug === 'arithmetic-lab') {
      h = `<p class="hr-label" id="hrl-op">${esc(tl('op'))}</p>${seg('op', ARITH.ops.map(v => [v, tl(`ops.${v}`)]), s.op, 'hrl-op')}
        ${ARITH.methods[s.op].length > 1 ? `<p class="hr-label" id="hrl-me">${esc(tl('method'))}</p>${seg('method', ARITH.methods[s.op].map(v => [v, tl(`methods.${v}`)]), s.method, 'hrl-me')}` : ''}
        <p class="hr-label" id="hrl-sz">${esc(tl('size'))}</p>${seg('size', ARITH.sizes[s.op].map(([v]) => [v, sizeText(s.op, v)]), s.size, 'hrl-sz')}
        <p class="hr-label" id="hrl-n">${esc(tl('count'))}</p>${seg('count', ARITH.counts.map(v => [v, String(v)]), s.count, 'hrl-n')}
        <p class="hr-label" id="hrl-lv">${esc(tl('level'))}</p>${seg('level', ARITH.levels.map(v => [v, tl(`levels.${v}`)]), s.level, 'hrl-lv')}
        <div class="row hr-lbnew">${btn('btn btn-sm', 'data-lb="new"', `${iconHtml('🔀', { size: 16 })} ${esc(tl('newProblems'))}`)}</div>`;
    } else if (slug === 'algebra-builder') {
      h = `<p class="hr-label" id="hrl-mo">${esc(tl('activity'))}</p>${seg('mode', ALGEBRA.modes.map(v => [v, tl(`modes.${v}`)]), s.mode, 'hrl-mo')}
        <p class="hr-label" id="hrl-al">${esc(tl('alLevel'))}</p>${seg('level', ALGEBRA.levels.map(v => [v, tl(`alLevels.${v}`)]), s.level, 'hrl-al')}
        <p class="hr-label" id="hrl-n">${esc(tl('count'))}</p>${seg('count', ALGEBRA.counts.map(v => [v, String(v)]), s.count, 'hrl-n')}
        <p class="hr-label" id="hrl-ti">${esc(tl('tiles'))}</p>${seg('tiles', [['all', tl('tilesAll')], ['none', tl('tilesNone')]], s.tiles, 'hrl-ti')}
        <div class="row hr-lbnew">${btn('btn btn-sm', 'data-lb="new"', `${iconHtml('🔀', { size: 16 })} ${esc(tl('newProblems'))}`)}</div>`;
    } else {
      h = `<p class="hr-label">${esc(tl('words'))}</p><p class="small muted hr-seghint">${esc(tl('wordsHint', { min: CROSS.min, max: CROSS.max }))}</p>
        <ol class="hr-words plain">${s.words.map(([w, c], i) => `<li class="hr-wrow"><span class="hr-wn" aria-hidden="true">${i + 1}</span>
          <input class="input hr-ww" data-lbw="${i}" maxlength="${CROSS.word}" value="${esc(w)}" placeholder="${esc(tl('wordPh'))}" aria-label="${esc(tl('word', { n: i + 1 }))}" autocomplete="off" dir="auto">
          <input class="input hr-wc" data-lbc="${i}" maxlength="${CROSS.clue}" value="${esc(c)}" placeholder="${esc(tl('cluePh'))}" aria-label="${esc(tl('clue', { n: i + 1 }))}" autocomplete="off" dir="auto">
          ${btn('hr-wdel', `data-lbdel="${i}" aria-label="${esc(tl('removeWord', { n: i + 1 }))}"`, '×')}</li>`).join('')}</ol>
        ${s.words.length < CROSS.max ? btn('btn btn-sm', 'data-lb="addword"', `+ ${esc(tl('addWord'))}`) : ''}
        <p class="hr-label" id="hrl-bk">${esc(tl('bank'))}</p>${seg('bank', [['1', tl('bankShow')], ['0', tl('bankHide')]], s.bank ? '1' : '0', 'hrl-bk')}
        <p class="hr-label" id="hrl-hi">${esc(tl('hints'))}</p>${seg('hints', [['1', tl('hintsOn')], ['0', tl('hintsOff')]], s.hints ? '1' : '0', 'hrl-hi')}`;
    }
    $('hrl-fields').innerHTML = h;
    const head = box.querySelector('#hrl-prevh'), v = S.cur && S.versions.get(S.cur);
    head.textContent = S.on && groups.length ? tl('previewOf', { who: v ? v.label : tl('noGroup') }) : tl('preview');
  }
  function change(name, value) {
    const s = { ...curSettings() };
    if (name === 'op') { s.op = value; s.method = 'standard'; s.size = ARITH.sizes[value][Math.min(1, ARITH.sizes[value].length - 1)][0]; s.problems = null; }
    else if (['size', 'mode', 'count'].includes(name)) { s[name] = name === 'count' ? +value : value; s.problems = null; }
    else if (name === 'level' && slug === 'algebra-builder') { s.level = value; s.problems = null; }
    else if (name === 'bank' || name === 'hints') s[name] = value === '1';
    else s[name] = value;
    setCur(slug === 'crossword' ? s : fill(slug, s));
    drawFields(); queuePreview();
  }

  // ---- the live preview: the game's own printer, a moment after each change
  let pt = null;
  const queuePreview = () => { clearTimeout(pt); pt = setTimeout(preview, 250); };
  function scalePaper() {
    const pb = $('hrl-paperbox'), sz = $('hrl-sizer'), paper = $('hrl-paper'); if (!pb || !paper) return;
    const k = Math.min(1, pb.clientWidth / 720);
    paper.style.transform = `scale(${k})`;
    sz.style.height = `${Math.ceil(paper.offsetHeight * k)}px`;
  }
  async function preview() {
    const seq = ++S.seq, s = curSettings();
    const words = slug === 'crossword' ? s.words.filter(([w, c]) => w.trim() || c.trim()) : null;
    if (slug === 'crossword' && words.filter(([w]) => w.trim()).length < CROSS.min) { $('hrl-paper').innerHTML = `<p class="hr-lbwait">${esc(tl('previewWords', { min: CROSS.min }))}</p>`; scalePaper(); return; }
    try {
      const r = await api(ctx.api2('lessons/preview'), { method: 'POST', background: true, body: { slug, title: $('hrl-title').value, instructions: $('hrl-ins').value, settings: words ? { ...s, words: words.map(([w, c]) => [w, c || '…']) } : s } });
      if (seq !== S.seq) return;
      S.html = r.html; $('hrl-paper').innerHTML = r.html;
    } catch (err) { if (seq === S.seq) $('hrl-paper').innerHTML = `<p class="hr-lbwait">${esc(err.message)}</p>`; }
    scalePaper();
  }

  // ---- Ask Oomba to fill it in (Crossword: a clue for each word that has none)
  async function aiFill() {
    const s = curSettings(), need = s.words.filter(([w, c]) => w.trim() && !c.trim()).map(([w]) => w.trim());
    if (!s.words.some(([w]) => w.trim())) { $('hrl-err').textContent = tl('aiNeedWords'); return; }
    if (!need.length) { toast(tl('aiNothing')); return; }
    const b = box.querySelector('[data-lb="ai"]'); b.disabled = true; b.lastChild.textContent = ` ${tl('aiBusy')}`;
    try {
      const r = await api(`/api/games/${encodeURIComponent(game.id)}/clues`, { method: 'POST', body: { words: need, level: '' } });
      const got = new Map(need.map((w, i) => [w.toLocaleLowerCase(), r.clues[i] || '']));
      let n = 0;
      // the same words in every version get the clue too (their words are the base's unless the teacher changed them)
      for (const x of [S.base, ...[...S.versions.values()].map(v => v.s)]) x.words = x.words.map(([w, c]) => { const k = got.get(w.trim().toLocaleLowerCase()); if (!c.trim() && k) { n += x === curSettings() ? 1 : 0; return [w, k]; } return [w, c]; });
      drawFields(); queuePreview(); toast(tl('aiDone', { count: n }));
    } catch (err) { $('hrl-err').textContent = tl('aiFailed'); }
    b.disabled = false; b.lastChild.textContent = ` ${tl('ai')}`;
  }

  // ---- saving
  const cleanWords = s => (slug === 'crossword' ? { ...s, words: s.words.filter(([w, c]) => w.trim() || c.trim()).map(([w, c]) => [w.trim(), c.trim()]) } : s);
  async function save() {
    const err = $('hrl-err'); err.textContent = '';
    const title = $('hrl-title').value.trim();
    if (!title) { err.textContent = tl('needTitle'); $('hrl-title').focus(); return; }
    const vers = S.on ? [...S.versions.values()].filter(v => groups.some(g => groupIdent(g) === v.key) || (lesson && lesson.versions.some(x => x.key === v.key))) : [];
    const b = box.querySelector('[data-lb="save"]'); b.disabled = true;
    try {
      const r = await api(ctx.api2('lessons'), { method: 'POST', body: { ...(lesson ? { id: lesson.id } : {}), slug, title, instructions: $('hrl-ins').value,
        base: cleanWords(S.base), versions: vers.map(v => ({ key: v.key, label: v.label, s: cleanWords(v.s) })) } });
      ctx.onLessons(r.lessons); sh.close(); toast(r.toast);
    } catch (e) { err.textContent = e.message; b.disabled = false; }
  }

  box.addEventListener('click', e => {
    const sg = e.target.closest('[data-lbseg]');
    if (sg) { if (sg.dataset.lbseg === 'on') setOn(sg.dataset.v === '1'); else change(sg.dataset.lbseg, sg.dataset.v); return; }
    const v = e.target.closest('[data-lbv]');
    if (v) { S.cur = v.dataset.lbv; drawVersions(); drawFields(); queuePreview(); return; }
    const del = e.target.closest('[data-lbdel]');
    if (del) { const s = curSettings(); s.words.splice(+del.dataset.lbdel, 1); if (!s.words.length) s.words.push(['', '']); drawFields(); queuePreview(); return; }
    const a = e.target.closest('[data-lb]'); if (!a) return;
    const k = a.dataset.lb;
    if (k === 'cancel') sh.close();
    else if (k === 'save') save();
    else if (k === 'ai') aiFill();
    else if (k === 'print') { if (S.html) printHtml(S.html); }
    else if (k === 'new') { setCur(fill(slug, { ...curSettings(), seed: newSeed(), problems: null })); drawFields(); queuePreview(); }
    else if (k === 'addword') { curSettings().words.push(['', '']); drawFields(); box.querySelector(`[data-lbw="${curSettings().words.length - 1}"]`)?.focus(); }
  });
  box.addEventListener('input', e => {
    const w = e.target.closest('[data-lbw],[data-lbc]');
    if (w) { const s = curSettings(), i = +(w.dataset.lbw ?? w.dataset.lbc); s.words[i][w.dataset.lbw !== undefined ? 0 : 1] = w.value; queuePreview(); return; }
    if (e.target.id === 'hrl-title' || e.target.id === 'hrl-ins') queuePreview();
  });
  let rz = null; const onResize = () => { clearTimeout(rz); rz = setTimeout(scalePaper, 100); };
  window.addEventListener('resize', onResize);
  new MutationObserver((m, o) => { if (!document.body.contains(sh.el)) { window.removeEventListener('resize', onResize); o.disconnect(); } }).observe(document.body, { childList: true });
  if (S.on && groups.length) S.cur = groups.some(g => groupIdent(g) === [...S.versions.keys()][0]) ? [...S.versions.keys()][0] : '';
  drawVersions(); drawFields(); preview();
  requestAnimationFrame(() => { if (!lesson) $('hrl-title').focus(); });
}

// ---------------------------------------------------------------- handing a lesson out
/** The lesson's hand-out sheet: who gets which version, Order on the desk, Grade it by (Score first), a due day.
 *  who: { label, n }; to: the target; groupsIn: the class's groups with students in the target ([{ g, n }]) and none:
 *  how many students in it have no group. */
export function lessonGiveSheet(ctx, l, to, who, { groupsIn, none, onClose }) {
  const vers = l.versions.length ? `<div class="hr-lvers"><p class="hr-label">${esc(tl('versionsBy'))}</p><ul>${groupsIn.map(({ g }) => {
    const v = l.versions.find(x => x.key === groupIdent(g));
    return `<li style="--gc:${esc(g.color)}"><span class="rm-dot" style="--c:${esc(g.color)}"></span><b dir="auto">${esc(ctx.groupName(g))}</b> <span>${esc(v ? summary(l.slug, v.s) : tl('asBuilt'))}</span></li>`;
  }).join('')}${none ? `<li><span class="rm-dot"></span><b>${esc(tl('noGroup'))}</b> <span>${esc(tl('asBuilt'))}</span></li>` : ''}</ul></div>` : '';
  const sh = sheet({
    title: `📄 ${tl('giveTitle', { lesson: l.title, who: who.label })}`, onClose,
    content: `<form class="hr-giveform" novalidate><p class="hr-eyebrow">${esc(tl('giveEyebrow'))}</p>
      <p class="small muted">${esc(`${l.game} · ${summary(l.slug, l.base)}`)}</p>${ctx.emptyNote ? ctx.emptyNote(to, who) : ''}${l.instructions ? `<p class="hr-dins" dir="auto">${esc(l.instructions)}</p>` : ''}${vers}
      <p class="hr-label" id="hrlg-order">${esc(ctx.th('ho.order'))}</p>${seg('order', [['in', ctx.th('ho.inOrder')], ['any', ctx.th('ho.anyOrder')]], 'in', 'hrlg-order')}
      <p class="small muted hr-seghint" id="hrlg-orderhint">${esc(ctx.th('ho.inOrderHint'))}</p>
      <p class="hr-label" id="hrlg-grade">${esc(ctx.th('ho.grade'))}</p>${seg('grade', [['score', ctx.th('ho.score')], ['completion', ctx.th('ho.completion')], ['none', ctx.th('ho.notGraded')]], 'score', 'hrlg-grade')}
      <p class="small muted hr-seghint" id="hrlg-gradehint">${esc(tl('scoreHint'))}</p>
      ${dueField('hrlg')}
      ${ctx.gcField ? ctx.gcField(to) : ''}
      <p class="err" id="hrlg-err" aria-live="polite"></p>
      <div class="row hr-giveacts">${btn('btn', 'data-give="cancel"', esc(ctx.th('ho.cancel')))}<button class="btn btn-primary hr-giveok" type="submit">${esc(ctx.putLabel ? ctx.putLabel(to, who) : who.n === 1 && to.kind === 'desk' ? ctx.th('ho.putOne') : ctx.th('ho.putMany', { count: who.n }))}</button></div></form>`,
  });
  const f = sh.el.querySelector('form'), val = { order: 'in', grade: 'score' }, dueOf = wireDue(f);
  const hints = { in: ctx.th('ho.inOrderHint'), any: ctx.th('ho.anyOrderHint'), score: tl('scoreHint'), completion: ctx.th('ho.completionHint'), none: ctx.th('ho.notGradedHint') };
  f.addEventListener('click', e => {
    const b = e.target.closest('[data-lbseg]');
    if (b) {
      val[b.dataset.lbseg] = b.dataset.v;
      for (const x of f.querySelectorAll(`[data-lbseg="${b.dataset.lbseg}"]`)) { const on = x === b; x.classList.toggle('on', on); x.setAttribute('aria-checked', String(on)); }
      f.querySelector(b.dataset.lbseg === 'order' ? '#hrlg-orderhint' : '#hrlg-gradehint').textContent = hints[b.dataset.v];
      return;
    }
    if (e.target.closest('[data-give="cancel"]')) sh.close();
  });
  f.addEventListener('submit', async e => {
    e.preventDefault();
    const ok = f.querySelector('.hr-giveok'); ok.disabled = true;
    try {
      const r = await api(ctx.api2('handouts'), { method: 'POST', body: { lessonId: l.id, to, order: val.order, grade: val.grade, ...dueOf(), gcPost: ctx.gcPicked ? ctx.gcPicked(f) : false } });
      sh.close(); ctx.onHanded(r);
    } catch (err) { f.querySelector('#hrlg-err').textContent = err.message; ok.disabled = false; }
  });
  return sh;
}
