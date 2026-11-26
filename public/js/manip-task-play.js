// Manipulatives: a task to practice (docs/decisions.md "Manipulatives: tasks you can practice and assign";
// docs/manip-practice-tasks.md). The problem card above a tool's board (public/js/manip.js openTool with a practice):
// Oomba's prompt with Read to me, the answer box or the choices when the task has them, Check, a hint when stuck, and
// what Oomba says (calm, static words from the task file: Oomba never chats with students). Two ways in:
//   - solo ('solo'): a task from a tool's task list; Check is the server's (POST /api/manipulatives/practice/check, the
//     page's own check only when the server can't be reached); Try another (a new variation, not one just seen) and Back
//     to tasks; "3 right in a row" from the person's saved counts;
//   - an assigned set ('set'): question i of n, each one checked by the server (POST /api/manipulatives/set/...): the
//     first check is what counts; after a right answer, or every hint, Next question; at the end how many were right the
//     first time and the way back (to the desk in Homeroom's player, else the lesson page). Inside Homeroom (?in=hr) the
//     board and the problem go to the teacher's watching desks every couple of seconds while they change (memory only).
import { t, api, esc } from '/js/app.js';
import { iconHtml } from '/js/icons.js';
import { oombaMark } from '/js/oomba-chat.js';
import { readAloud, stopReading } from '/js/tts.js';
import { taskOf, variation, check } from '/js/manip-tasks.js';
import { nextSeed, sigOf } from '/js/manip-task-kit.js';
import { boxesOf, bbox, WORLD } from '/js/manip-board.js';

const tp = (k, v) => t(`js.manip-task-play.${k}`, v);
const btn = (cls, attrs, label) => `<button type="button" class="${cls}" ${attrs}>${label}</button>`;
const LIVE_MS = 1500;

/**
 * ctx: { slug, board() (the board's state now), load(setup, { totals }) (start the board from a variation's setup),
 * progress (the person's counts by task id), embed (inside Homeroom's player), onLeave(href) }.
 * opts: { mode: 'solo', id } | { mode: 'set', cl, step, data (GET /api/manipulatives/set/...) }. -> { destroy() }
 */
export function mountPractice(el, ctx, opts) {
  const P = { mode: opts.mode, id: opts.id || null, seen: [], v: null, wrong: 0, hints: 0, firstDone: false, result: null, busy: false, picked: null, typed: '',
    set: opts.mode === 'set' ? { cl: opts.cl, step: opts.step, ...opts.data } : null, i: 0, live: null, liveJson: '' };
  let timer = null;

  // ---------------------------------------------------------------- a question
  function start(v) {
    stopReading();
    Object.assign(P, { v, wrong: 0, hints: 0, firstDone: false, result: null, picked: null, typed: '', open: false });
    ctx.load(v.setup, { totals: v.totals });
    draw();
    requestAnimationFrame(() => el.querySelector('#mp-probt')?.focus({ preventScroll: true }));
  }
  function soloNew() {
    const x = taskOf(P.id), seed = nextSeed(x.slug, x.task, P.seen);
    const v = variation(P.id, seed); P.seen = [...P.seen.slice(-30), sigOf(v)];
    start(v);
  }
  function setGo(i) {
    const s = P.set; P.i = i;
    if (i < 0) { drawFinished(); return; }
    const q = s.items[i], st = s.state[i] || { w: 0, h: 0 };
    start(variation(q.id, q.seed));
    P.wrong = st.w; P.hints = Math.max(st.h, st.w);
    draw();
  }
  const openIndex = (from = 0) => { const m = P.set.marks; for (let k = 0; k < m.length; k++) { const j = (from + k) % m.length; if (m[j] === '-') return j; } return -1; };

  // ---------------------------------------------------------------- drawing
  const task = () => taskOf(P.mode === 'set' ? P.set.items[P.i].id : P.id).task;
  const prog = () => (ctx.progress && ctx.progress[P.id]) || null;
  /** The line above the prompt: which question (a set) or the task's grade and the person's run (solo); the way back. */
  function metaHtml() {
    const x = task();
    if (P.mode === 'set') {
      const s = P.set, dots = [...s.marks].map((m, k) => `<i class="${m === '1' ? 'ok' : m === '0' ? 'done' : k === P.i ? 'on' : ''}" aria-hidden="true"></i>`).join('');
      return `<span class="mp-probof">${esc(tp('qOf', { i: P.i + 1, n: s.items.length }))}</span><span class="mp-probdots">${dots}</span><span class="mp-probtname">${esc(x.title)}</span>`;
    }
    const p = prog(), streak = p && p.streak >= 2 ? `<span class="mp-streak" role="status">${iconHtml('⭐', { size: 16 })} ${esc(tp('streak', { n: p.streak }))}</span>` : p && p.solved ? `<span class="mp-streak small">${esc(tp('solved', { n: p.solved }))}</span>` : '';
    return `<span class="mp-probtname">${esc(x.title)}</span><span class="mp-tag">${esc(tp('grade', { grade: x.grade }))}</span>${streak}`;
  }
  /** Solo: Try another and Back to tasks, always at hand. */
  const soloNav = () => `${btn(`btn btn-sm${P.result && P.result.correct ? ' btn-primary' : ''}`, 'data-pp="another"', `${iconHtml('🔄', { size: 16 })} ${esc(tp('tryAnother'))}`)}<a class="btn btn-sm" href="#practice/${esc(taskOf(P.id).slug)}" data-pp="back">${esc(tp('backTasks'))}</a>`;
  const backBtn = () => (ctx.embed ? btn('btn', 'data-pp="desk"', esc(tp('backDesk'))) : `<a class="btn" href="${esc(P.set.back)}">${esc(tp('backLesson'))}</a>`);
  function answerHtml() {
    const a = P.v.answer, locked = !!P.result && P.result.correct;
    const box = a.box ? `<label class="mp-problabel" for="mp-probbox">${esc(tp('yourAnswer', { what: a.box.label || '' }))}</label>
      <input class="input mp-probbox" id="mp-probbox" autocomplete="off" spellcheck="false" maxlength="100" enterkeyhint="done" inputmode="${a.box.kind === 'expanded' || /[^\d.,]/.test(String(a.box.key)) ? 'text' : 'decimal'}" value="${esc(P.typed)}"${locked ? ' readonly' : ''}>` : '';
    const choice = a.choice ? `<span class="mp-problabel" id="mp-probch">${esc(tp('pick'))}</span><span class="mp-probchoices" role="radiogroup" aria-label="${esc(tp('pick'))}">${a.choice.options.map((o, k) => btn(`chip mp-probchoice${P.picked === k ? ' on' : ''}`, `role="radio" aria-checked="${P.picked === k}" data-pc="${k}"${locked ? ' disabled' : ''}`, esc(o))).join('')}</span>` : '';
    const build = a.board && !a.box && !a.choice ? `<span class="small muted mp-probbuild">${iconHtml('👇', { size: 16 })} ${esc(tp('buildIt'))}</span>` : '';
    const acts = locked ? '' : `${btn('btn btn-primary mp-probcheck', `data-pp="check"${P.busy ? ' disabled' : ''}`, `${iconHtml('✓', { size: 18 })} ${esc(P.busy ? tp('checking') : tp('check'))}`)}${P.hints < P.v.hints.length ? btn('btn mp-probhint', `data-pp="hint" aria-label="${esc(tp('hint'))}"`, `${iconHtml('💡', { size: 18 })}<span class="mp-probbtnt"> ${esc(tp('hint'))}</span>`) : ''}`;
    return `${build}${box}${choice}<span class="mp-probacts">${acts}</span>`;
  }
  function sayHtml() {
    const r = P.result, v = P.v, shown = v.hints.slice(0, P.hints), out = P.hints >= v.hints.length;
    const hints = shown.length ? `<ol class="mp-probhints">${shown.map((h, k) => `<li><b>${esc(tp('hintN', { n: k + 1 }))}</b> ${esc(h)}</li>`).join('')}</ol>` : '';
    const explain = (r && r.correct) || out ? `<p class="mp-probexplain">${iconHtml('💡', { size: 18 })} ${esc(v.explain)}</p>` : '';
    // a set: Next question once it is right, or every hint was shown
    const left = P.mode === 'set' ? [...P.set.marks].filter((m, k) => m === '-' && k !== P.i).length : 0;
    const next = P.mode === 'set' && ((r && r.correct) || out) ? `<p class="row mp-probnav">${btn('btn btn-primary', 'data-pp="next"', esc(left ? tp('next') : tp('finish')))}</p>` : '';
    if (r && r.correct) return `<p class="mp-probok">${iconHtml('✓', { size: 20 })} <b>${esc(tp('correct'))}</b></p>${explain}${next}`;
    if (r) return `<p class="mp-probno"><b>${esc(tp('notYet'))}</b> ${esc(r.feedback || '')}</p>${hints}${explain}${next}`;
    return `${hints}${explain}${next}`;
  }
  function draw() {
    const v = P.v;
    // (which question this is, for the run-through tests: tests/unit/manip-task-flow-browser.test.js)
    el.dataset.task = v.id; el.dataset.seed = String(v.seed); el.dataset.i = P.mode === 'set' ? String(P.i) : '';
    // Inside Homeroom's player on a phone (public/css/manipulatives.css .mp-probc): the card is one compact line of the
    // prompt with the answer row under it, so the board shows on first open; ▾ opens all of it (hints, the explanation)
    // over the board, never pushing the board down. Elsewhere the fold button is not shown and nothing changes.
    if (ctx.embed && !P.open) P.foldH = 0;
    el.innerHTML = `<section class="mp-prob panel${ctx.embed ? ` mp-probc${P.open ? ' open' : ''}` : ''}">
      <div class="mp-probmain"><span class="mp-oomba" aria-hidden="true">${oombaMark(40)}</span>
        <div class="mp-probtext"><p class="mp-probmeta">${metaHtml()}</p><h2 class="mp-prompt" id="mp-probt" tabindex="-1" dir="auto">${esc(v.prompt)}</h2></div>
        ${ctx.embed ? btn('btn btn-sm mp-probfold', `data-pp="fold" aria-expanded="${!!P.open}" aria-controls="mp-prob" aria-label="${esc(P.open ? tp('less') : tp('more'))}"`, P.open ? '▴' : '▾') : ''}
        <div class="mp-probside">${btn('btn btn-sm mp-probread', `data-pp="read" aria-label="${esc(tp('read'))}"`, `${iconHtml('🔊', { size: 16 })}<span class="mp-probreadt"> ${esc(tp('read'))}</span>`)}${P.mode === 'solo' ? soloNav() : ''}</div></div>
      <div class="mp-probans">${answerHtml()}</div>
      <div class="mp-probsay" role="status" aria-live="polite">${sayHtml()}</div></section>`;
    // Open over the board: the card's place keeps its folded height, so the board does not move.
    if (ctx.embed) { if (!P.open) requestAnimationFrame(() => { const sec = el.querySelector('.mp-probc'); if (sec && !P.open) { P.foldH = sec.getBoundingClientRect().height; el.style.minHeight = ''; } }); else el.style.minHeight = P.foldH ? `${P.foldH}px` : ''; }
  }
  function drawFinished() {
    const s = P.set, right = [...s.marks].filter(m => m === '1').length;
    el.style.minHeight = '';
    stopReading(); clearInterval(timer);
    el.innerHTML = `<section class="mp-prob panel mp-probdone"><div class="mp-probmain"><span class="mp-oomba" aria-hidden="true">${oombaMark(48)}</span>
      <div class="mp-probtext"><h2 class="mp-prompt" id="mp-probt" tabindex="-1">${esc(tp('allDone'))}</h2><p class="mp-probdonetext">${esc(tp('doneScore', { right, total: s.items.length }))}</p></div></div>
      <div class="row mp-probnav">${backBtn()}</div></section>`;
    requestAnimationFrame(() => el.querySelector('#mp-probt')?.focus({ preventScroll: true }));
  }

  // ---------------------------------------------------------------- what the buttons do
  const work = () => ({ board: ctx.board(), box: P.typed, choice: P.picked });
  async function doCheck() {
    if (P.busy || (P.result && P.result.correct)) return;
    const a = P.v.answer;
    if (a.box && !P.typed.trim() && !a.board) { P.result = { correct: false, feedback: tp('typeFirst') }; draw(); el.querySelector('#mp-probbox')?.focus(); return; }
    P.busy = true; draw();
    let r = null;
    try {
      if (P.mode === 'set') {
        r = await api(`/api/manipulatives/set/${encodeURIComponent(P.set.cl)}/${encodeURIComponent(P.set.step)}`, { method: 'POST', body: { i: P.i, action: 'check', work: work() } });
        Object.assign(P.set, { marks: r.marks, state: r.state, done: r.done, score: r.score });
        P.hints = r.hint; P.wrong = (r.state[P.i] || {}).w || 0;
      } else {
        r = await api('/api/manipulatives/practice/check', { method: 'POST', body: { task: P.id, seed: P.v.seed, work: work(), first: !P.firstDone } });
        if (ctx.progress && r.progress) ctx.progress[P.id] = r.progress;
      }
    } catch (e) {
      // (solo practice without the server: the page's own check, the same rules; an assigned set always asks the server)
      if (P.mode === 'set') { P.busy = false; P.result = { correct: false, feedback: e.status === 409 ? tp('alreadyDone') : tp('offline') }; draw(); return; }
      r = check(P.v, work());
    }
    P.busy = false; P.firstDone = true;
    P.result = { correct: !!r.correct, feedback: r.feedback || '' };
    if (!r.correct && P.mode === 'solo') { P.wrong += 1; P.hints = Math.min(P.v.hints.length, Math.max(P.hints, P.wrong)); }
    draw();
    el.querySelector(r.correct ? '.mp-probok' : '.mp-probno')?.scrollIntoView({ block: 'nearest' });
  }
  async function doHint() {
    if (P.hints >= P.v.hints.length) return;
    if (P.mode === 'set') {
      try { const r = await api(`/api/manipulatives/set/${encodeURIComponent(P.set.cl)}/${encodeURIComponent(P.set.step)}`, { method: 'POST', body: { i: P.i, action: 'hint' } }); P.hints = r.hint; Object.assign(P.set, { state: r.state }); }
      catch { P.hints += 1; }
    } else P.hints += 1;
    if (ctx.embed) P.open = true;   // the hint shows (over the board on a phone)
    draw();
  }
  async function doNext() {
    if (!(P.result && P.result.correct)) {
      try { const r = await api(`/api/manipulatives/set/${encodeURIComponent(P.set.cl)}/${encodeURIComponent(P.set.step)}`, { method: 'POST', body: { i: P.i, action: 'next' } }); Object.assign(P.set, { marks: r.marks, state: r.state, done: r.done, score: r.score }); }
      catch (e) { P.result = { correct: false, feedback: tp('offline') }; draw(); return; }
    }
    setGo(openIndex(P.i + 1));
  }
  function readIt() {
    const v = P.v, extra = P.result && P.result.correct ? `${tp('correct')} ${v.explain}` : P.hints ? v.hints[P.hints - 1] : '';
    readAloud({ text: [task().title, v.prompt, extra].filter(Boolean).join('. '), lang: 'en' });
  }
  el.addEventListener('click', e => {
    const b = e.target.closest('[data-pp], [data-pc]'); if (!b || !el.contains(b)) return;
    if (b.dataset.pc !== undefined) { P.picked = +b.dataset.pc; draw(); el.querySelector(`[data-pc="${P.picked}"]`)?.focus(); return; }
    const k = b.dataset.pp;
    if (k === 'fold') { P.open = !P.open; draw(); el.querySelector('[data-pp="fold"]')?.focus(); return; }
    if (k === 'check') doCheck();
    else if (k === 'hint') doHint();
    else if (k === 'another') soloNew();
    else if (k === 'next') doNext();
    else if (k === 'read') readIt();
    else if (k === 'desk') { stopReading(); try { window.parent.postMessage({ type: 'hr:close' }, location.origin); } catch { /* not in a frame */ } }
    else if (k === 'back') stopReading();
  });
  el.addEventListener('input', e => { if (e.target.id === 'mp-probbox') P.typed = e.target.value; });
  el.addEventListener('keydown', e => { if (e.target.id === 'mp-probbox' && e.key === 'Enter') { e.preventDefault(); doCheck(); } });

  // ---------------------------------------------------------------- Homeroom's watching desks (an assigned set in the player)
  /** The board cut to what is on it (the teacher's tile shows that, not the whole plane). */
  function cropped() {
    const st = ctx.board(), b = bbox(boxesOf(ctx.slug, st, WORLD)) || { x: 0, y: 0, w: 600, h: 400 }, pad = 24, dx = b.x - pad, dy = b.y - pad;
    const out = { ...st, objects: (st.objects || []).map(o => ({ ...o, x: o.x - dx, y: o.y - dy })), ...(st.pieces ? { pieces: st.pieces.map(p => ({ ...p, x: p.x - dx, y: p.y - dy })) } : {}) };
    delete out.__ann;
    return { state: out, space: { w: Math.round(b.w + pad * 2), h: Math.round(b.h + pad * 2) } };
  }
  function liveTick() {
    if (!P.v || P.i < 0) return;
    const c = cropped(), j = JSON.stringify([c.state, P.typed, P.i]);
    if (j === P.liveJson) return;
    P.liveJson = j;
    api(`/api/manipulatives/set/${encodeURIComponent(P.set.cl)}/${encodeURIComponent(P.set.step)}/live`, { method: 'POST', body: { ...c, i: P.i, box: P.typed }, background: true }).catch(() => { /* the next change tries again */ });
  }

  // ---------------------------------------------------------------- start
  if (P.mode === 'set') {
    const i = openIndex(0);
    if (i < 0) drawFinished(); else setGo(i);
    if (ctx.embed) timer = setInterval(liveTick, LIVE_MS);
  } else soloNew();
  return { destroy() { clearInterval(timer); stopReading(); } };
}
