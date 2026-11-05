// A course step (server/views/courses.js stepPage): the slides one at a time (Next / Back, dots, swipe, arrow keys,
// read-aloud with the site's AI voice, else the device's English voice), then the quick check one question at a time, graded by the server.
// Without this script the page still works: the slides are a scrolling page and the check is a plain form.
import { api, pageData, $, $$, t, toast } from '/js/app.js';
import { deviceSpeak, stopReading } from '/js/tts.js';

const d = pageData();
const base = `/api/courses/${d.course}/${d.step}`;
const deck = $('#deck'), nav = $('#deck-nav'), check = $('#check');
const slides = $$('.slide', deck);
let at = 0;

// ---------------------------------------------------------------------------------------------- read-aloud
// The site's AI voice first (POST /api/tts ctx 'course': the server reads the slide itself, with the voice of the step's
// game character); the shared device voice (public/js/tts.js) when AI voices are off, the player is signed out, or it
// does not come. This page never calls the device speech API itself: one voice pick, in the shared path.
let speaking = null, audio = null, ticket = 0;
function stopSpeaking() {
  ticket++;
  if (audio) { audio.pause(); audio = null; }
  stopReading();
  if (speaking) { speaking.querySelector('.lbl').textContent = t('js.course.listen'); speaking.setAttribute('aria-pressed', 'false'); speaking = null; }
}
function deviceVoice(btn, text) {
  if (!deviceSpeak(text, 'en-US', () => { if (speaking === btn) stopSpeaking(); })) stopSpeaking();
}
async function speak(btn, i, text) {
  if (speaking === btn) return stopSpeaking();
  stopSpeaking();
  const mine = ++ticket;
  speaking = btn; btn.setAttribute('aria-pressed', 'true'); btn.querySelector('.lbl').textContent = t('js.course.stop');
  try {
    const r = await fetch('/api/tts', { method: 'POST', headers: { 'content-type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify({ ctx: 'course', course: d.course, step: d.step, i }) });
    if (mine !== ticket) return;
    if (r.ok) {
      const { u } = await r.json();
      if (mine !== ticket) return;
      audio = new Audio(u);
      audio.onended = () => { if (speaking === btn) stopSpeaking(); };
      audio.onerror = () => { if (mine === ticket) { audio = null; deviceVoice(btn, text); } };
      await audio.play();
      return;
    }
  } catch (e) { if (mine !== ticket) return; }
  if (mine === ticket) deviceVoice(btn, text);
}
slides.forEach((s, i) => {
  const b = s.querySelector('[data-say-btn]'); if (!b) return;
  b.hidden = false; b.setAttribute('aria-pressed', 'false');
  b.addEventListener('click', () => speak(b, i, s.dataset.say));
});

// ---------------------------------------------------------------------------------------------- the slides
const dots = $$('.dot', nav), back = $('#deck-back'), next = $('#deck-next');
function show(i, focus = false) {
  at = Math.max(0, Math.min(slides.length - 1, i));
  stopSpeaking();
  slides.forEach((s, k) => { s.hidden = k !== at; });
  dots.forEach((b, k) => { if (k === at) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current'); });
  back.disabled = at === 0;
  const last = at === slides.length - 1;
  next.textContent = last ? next.dataset.check : next.dataset.next;
  next.classList.toggle('btn-hot', last && !d.checked);
  if (focus) {
    // The new slide starts at its top: scroll back up if the page was scrolled down past it.
    if (deck.getBoundingClientRect().top < 0) deck.scrollIntoView({ block: 'start' });
    slides[at].querySelector('.slide-h').focus({ preventScroll: true });
  }
}
async function toCheck() {
  if (!d.read) { d.read = true; try { await api(`${base}/read`, { method: 'POST', body: {} }); } catch (e) { if (e.status === 401) toast(e.message, { bad: true }); } }
  check.hidden = false;
  check.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
  const h = $('#check-h'); h.tabIndex = -1; h.focus({ preventScroll: true });
}
if (deck && slides.length) {
  deck.classList.add('deck-js'); nav.hidden = false;
  slides.forEach(s => { s.querySelector('.slide-h').tabIndex = -1; });
  // Not read yet: the check waits until the last slide (unless the page was opened at it).
  if (!d.read && !d.checked && !/^#(check|play)$/.test(location.hash)) check.hidden = true;
  show(0);
  back.addEventListener('click', () => show(at - 1, true));
  next.addEventListener('click', () => (at === slides.length - 1 ? toCheck() : show(at + 1, true)));
  dots.forEach((b, k) => b.addEventListener('click', () => show(k, true)));
  document.addEventListener('keydown', e => {
    const el = e.target;
    if (e.altKey || e.ctrlKey || e.metaKey || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName || '') || (el.closest && el.closest('#check, #play'))) return;
    if (e.key === 'ArrowRight') { e.preventDefault(); show(at + 1, true); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); show(at - 1, true); }
  });
  // Swipe: a mostly sideways move of 50 px or more.
  let x0 = null, y0 = 0;
  deck.addEventListener('pointerdown', e => { if (e.pointerType !== 'mouse') { x0 = e.clientX; y0 = e.clientY; } }, { passive: true });
  deck.addEventListener('pointerup', e => {
    if (x0 === null) return;
    const dx = e.clientX - x0, dy = e.clientY - y0; x0 = null;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) show(at + (dx < 0 ? 1 : -1));
  }, { passive: true });
  deck.addEventListener('pointercancel', () => { x0 = null; });
}

// ---------------------------------------------------------------------------------------------- guided focus
// A slide picture with focus steps plays a short tour once per view: the clean picture first (~1s), then each
// step's box, dotted path and cue in order (~1.9s each), then the clean picture again — and only then does
// the figure's Replay button appear (scrolling away mid-tour ends the tour the same way). An
// IntersectionObserver starts it when the figure scrolls (or pages, in the deck above) into view and
// resets it when it leaves, so the same code serves the paged deck and the plain scrolling page. Reduced
// motion: no tour at all — the CSS static mode shows every step's box with its badge and the cues as a
// list under the picture.
const gfTimers = new WeakMap();
function gfStop(fig) {
  for (const id of gfTimers.get(fig) || []) clearTimeout(id);
  gfTimers.delete(fig);
  fig.removeAttribute('data-gf-step');
}
function gfFinish(fig) {
  gfStop(fig);
  const btn = fig.querySelector('.gf-replay');
  if (btn) btn.hidden = false;
}
function gfPlay(fig) {
  gfStop(fig);
  const btn = fig.querySelector('.gf-replay');
  if (btn) btn.hidden = true;
  const n = fig.querySelectorAll('.gf-step').length;
  if (!n) return;
  const ids = [];
  let at = 1000;
  for (let i = 0; i < n; i++) { ids.push(setTimeout(() => fig.setAttribute('data-gf-step', String(i)), at)); at += 1900; }
  ids.push(setTimeout(() => gfFinish(fig), at));
  gfTimers.set(fig, ids);
}
const gfFigs = $$('.smedia.gf');
// Cue placement, settled with real geometry. The server parks each cue chip at the bottom of the
// picture (the top when the box centre sits in the bottom third), but that static rule cannot know
// the chip's rendered height: on a phone figure the chip wraps to two lines and grows up over the
// ring it must never cover (measured on deck 1b/1.1 slide 0 at a 390px viewport: step 1's chip
// overlapped its ring by ~47px², step 2's by ~1,040px², while the same steps were clear at 720px).
// So each time a step activates, measure the chip against its ring (the box plus its outset) and
// its badge, and settle it on the first placement that clears both, trying in order: the server's
// side as styled; the same side at full width (a wider chip wraps less and sits lower-profile —
// the bottom chip's CSS reserves 120px for the replay button, but that button is hidden whenever
// a step is active, so the width is safe to use); the other side both ways; the same placements
// anchored to the opposite corner; the chip slid sideways past the badge, which hugs the box's
// top-left corner; the chip pulled tighter into its corner (2px from the edge); and the
// chip slightly smaller.
// If nothing clears, keep whichever placement overlaps least.
function gfCueOverlap(cue, box, badge) {
  const cr = cue.getBoundingClientRect();
  if (!cr.width) return 0;
  const out = Math.abs(parseFloat(getComputedStyle(box, '::after').inset.split(' ')[0])) || 0;
  const br = box.getBoundingClientRect();
  const gr = badge.getBoundingClientRect();
  const targets = [
    { left: br.left - out, top: br.top - out, right: br.right + out, bottom: br.bottom + out },
    { left: gr.left, top: gr.top, right: gr.right, bottom: gr.bottom },
  ];
  let area = 0;
  for (const r of targets) {
    area += Math.max(0, Math.min(cr.right, r.right) - Math.max(cr.left, r.left)) *
            Math.max(0, Math.min(cr.bottom, r.bottom) - Math.max(cr.top, r.top));
  }
  return area;
}
function gfPlaceCue(fig) {
  const i = fig.getAttribute('data-gf-step');
  if (i === null) return;
  const step = fig.querySelector(`.gf-step[data-i="${i}"]`);
  if (!step) return;
  const cue = step.querySelector('.gf-cue'), box = step.querySelector('.gf-box'), badge = step.querySelector('.gf-badge');
  if (!cue || !box || !badge) return;
  if (cue.dataset.gfTop === undefined) cue.dataset.gfTop = cue.classList.contains('gf-cue--top') ? '1' : '';
  const serverTop = cue.dataset.gfTop === '1';
  const chip = cue.querySelector('.gf-cue-n');
  const apply = (top, anchor, wide, shiftPx, tight, compact) => {
    cue.classList.toggle('gf-cue--top', top);
    cue.style.left = anchor === 'right' ? 'auto' : (shiftPx ? shiftPx + 'px' : '');
    cue.style.right = anchor === 'right' ? '10px' : '';
    cue.style.maxWidth = wide || shiftPx ? 'calc(100% - 20px)' : '';
    cue.style.top = top && tight ? '2px' : '';
    cue.style.bottom = !top && tight ? '2px' : '';
    // Compact: a slightly smaller chip (only ever set when nothing else clears — the steps
    // whose box leaves a free strip shorter than the standard chip is tall).
    cue.style.fontSize = compact ? '12px' : '';
    cue.style.lineHeight = compact ? '1.2' : '';
    cue.style.padding = compact ? '3px 9px' : '';
    if (chip) {
      chip.style.width = compact ? '14px' : '';
      chip.style.height = compact ? '14px' : '';
      chip.style.fontSize = compact ? '10px' : '';
    }
  };
  let best = null, bestArea = Infinity;
  for (const top of [serverTop, !serverTop]) {
    for (const [anchor, wide] of [['left', false], ['left', true], ['right', false], ['right', true]]) {
      apply(top, anchor, wide, 0);
      const a = gfCueOverlap(cue, box, badge);
      if (!a) return; // first fully clear placement, in preference order
      if (a < bestArea) { bestArea = a; best = [top, anchor, wide, 0]; }
    }
  }
  // Badge dodge: slide the chip sideways past the badge (measured from the badge's live rect).
  const shift = Math.ceil(badge.getBoundingClientRect().right - fig.getBoundingClientRect().left) + 6;
  for (const top of [serverTop, !serverTop]) {
    apply(top, 'left', true, shift);
    const a = gfCueOverlap(cue, box, badge);
    if (!a) return;
    if (a < bestArea) { bestArea = a; best = [top, 'left', true, shift]; }
  }
  // Last resorts: pull the chip tighter into its corner (2px, from the styled 10px), then the
  // same placements with a slightly smaller chip — the few steps whose box leaves a free strip
  // only a few px taller than the chip need exactly that.
  for (const top of [serverTop, !serverTop]) {
    for (const anchor of ['left', 'right']) {
      apply(top, anchor, true, 0, true);
      const a = gfCueOverlap(cue, box, badge);
      if (!a) return;
      if (a < bestArea) { bestArea = a; best = [top, anchor, true, 0, true]; }
    }
  }
  for (const top of [serverTop, !serverTop]) {
    for (const anchor of ['left', 'right']) {
      apply(top, anchor, true, 0, true, true);
      const a = gfCueOverlap(cue, box, badge);
      if (!a) return;
      if (a < bestArea) { bestArea = a; best = [top, anchor, true, 0, true, true]; }
    }
  }
  for (const top of [serverTop, !serverTop]) {
    for (const tight of [false, true]) {
      apply(top, 'left', true, shift, tight, true);
      const a = gfCueOverlap(cue, box, badge);
      if (!a) return;
      if (a < bestArea) { bestArea = a; best = [top, 'left', true, shift, tight, true]; }
    }
  }
  if (best) apply(...best);
}
if (gfFigs.length) {
  const gfCueMO = new MutationObserver(ms => { for (const m of ms) if (m.attributeName === 'data-gf-step') gfPlaceCue(m.target); });
  for (const fig of gfFigs) gfCueMO.observe(fig, { attributes: true, attributeFilter: ['data-gf-step'] });
  addEventListener('resize', () => { for (const fig of gfFigs) gfPlaceCue(fig); });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { for (const fig of gfFigs) gfPlaceCue(fig); });
}
if (gfFigs.length && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
  const gfIO = new IntersectionObserver(es => {
    for (const e of es) {
      if (e.isIntersecting) { if (!e.target.dataset.gfPlayed) { e.target.dataset.gfPlayed = '1'; gfPlay(e.target); } }
      else if (e.target.dataset.gfPlayed) { delete e.target.dataset.gfPlayed; gfFinish(e.target); }
      else gfStop(e.target);
    }
  }, { threshold: 0.35 });
  for (const fig of gfFigs) {
    gfIO.observe(fig);
    const btn = fig.querySelector('.gf-replay');
    if (btn) btn.addEventListener('click', () => { fig.dataset.gfPlayed = '1'; gfPlay(fig); });
  }
}

// ---------------------------------------------------------------------------------------------- story layer
// A story slide's stage (the Spark, its pieces, the characters) plays its scene once per view: the script
// first arms every stage (its start positions — characters off stage, the flown piece still with its owner),
// then an IntersectionObserver plays a stage when it scrolls (or pages) into view and resets it when it
// leaves, so it can play again next time — the same discipline as the guided-focus tour above. The CSS holds
// every animation under [data-story-on] with fill both, so a played stage rests on its finished frame.
// Reduced motion: nothing is armed or played at all — the unarmed CSS *is* the finished frame.
const storyFigs = $$('.smedia.story');
if (storyFigs.length && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
  for (const fig of storyFigs) fig.setAttribute('data-story-arm', '');
  const storyIO = new IntersectionObserver(es => {
    for (const e of es) {
      if (e.isIntersecting) { if (!e.target.dataset.storyPlayed) { e.target.dataset.storyPlayed = '1'; e.target.setAttribute('data-story-on', ''); } }
      else if (e.target.dataset.storyPlayed) { delete e.target.dataset.storyPlayed; e.target.removeAttribute('data-story-on'); }
    }
  }, { threshold: 0.35 });
  for (const fig of storyFigs) storyIO.observe(fig);
}

// ---------------------------------------------------------------------------------------------- the quick check
const form = $('#qcheck');
if (form) {
  const qs = $$('.qq', form);
  const send = $('#qcheck-send');
  const answers = {};
  let qi = 0, tries = 0;
  send.hidden = true;
  form.addEventListener('submit', e => e.preventDefault());
  function ask(i) {
    qi = i;
    qs.forEach((f, k) => { f.hidden = k !== i; });
    const legend = qs[i].querySelector('legend'); legend.tabIndex = -1; if (i || tries) legend.focus();
  }
  function reset() {
    tries++;
    for (const f of qs) {
      f.classList.remove('is-right', 'is-wrong');
      f.querySelector('.qq-fb').textContent = '';
      const go = f.querySelector('.qq-go'); if (go) go.remove();
      const box = f.querySelector('.qq-choices');
      const labels = $$('.qchoice', box);
      // A new order each try (rotate by the try number), so the right answer is not where it was.
      labels.forEach(l => { l.classList.remove('is-right', 'is-wrong'); const r = l.querySelector('input'); r.checked = false; r.disabled = false; });
      for (let k = 0; k < tries % labels.length + 1; k++) box.appendChild(box.firstElementChild);
    }
    const res = $('#qresult'); if (res) res.remove();
    ask(0);
  }
  async function finish() {
    let r;
    try { r = await api(`${base}/check`, { method: 'POST', body: { answers } }); } catch (e) { toast(e.message, { bad: true }); return; }
    const box = document.createElement('div');
    box.id = 'qresult'; box.className = `cl-result ${r.passed ? 'ok' : 'bad'}`; box.setAttribute('role', 'status');
    box.textContent = r.passed ? t('js.course.passed', { score: r.score, total: r.total }) : t('js.course.failed', { score: r.score, total: r.total, pass: 2 });
    qs.forEach(f => { f.hidden = true; });
    form.after(box);
    if (r.passed) {
      d.checked = true;
      form.remove();
      const slot = $('#play-slot');
      if (slot && r.html) { slot.outerHTML = r.html; const nx = $('#cl-next'); if (nx) nx.hidden = !!r.play; }
      const play = $('#cl-play') || $('#play-h');
      if (play) { play.scrollIntoView({ block: 'center' }); play.focus(); }
    } else {
      const again = document.createElement('button');
      again.type = 'button'; again.className = 'btn btn-primary btn-big'; again.textContent = t('js.course.again'); again.id = 'qagain';
      again.addEventListener('click', reset);
      box.append(document.createElement('br'), again);
      again.focus();
    }
  }
  form.addEventListener('change', async e => {
    const radio = e.target.closest('input[type=radio]'); if (!radio) return;
    const f = radio.closest('.qq'); if (f !== qs[qi] || f.dataset.busy) return;
    f.dataset.busy = '1';
    const choice = +radio.value;
    let r;
    try { r = await api(`${base}/answer`, { method: 'POST', body: { item: f.dataset.q, choice } }); } catch (err) { toast(err.message, { bad: true }); radio.checked = false; delete f.dataset.busy; return; }
    delete f.dataset.busy;
    answers[f.dataset.q] = choice;
    $$('input', f).forEach(x => { x.disabled = true; });
    const right = $$('input', f).find(x => +x.value === r.answer);
    if (right) right.closest('.qchoice').classList.add('is-right');
    if (!r.right) radio.closest('.qchoice').classList.add('is-wrong');
    f.classList.add(r.right ? 'is-right' : 'is-wrong');
    f.querySelector('.qq-fb').textContent = r.right ? t('js.course.right') : (r.why ? t('js.course.wrongWhy', { answer: r.text, why: r.why }) : t('js.course.wrong', { answer: r.text }));
    const last = qi === qs.length - 1;
    const go = document.createElement('button');
    go.type = 'button'; go.className = 'btn btn-primary btn-big qq-go'; go.textContent = last ? t('js.course.finish') : t('js.course.next');
    go.addEventListener('click', () => (last ? finish() : ask(qi + 1)));
    f.append(go);
    go.focus();
  });
  ask(0);
}
