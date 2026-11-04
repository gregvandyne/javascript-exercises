// A course step (server/views/courses.js stepPage): the slides one at a time (Next / Back, dots, swipe, arrow keys,
// read-aloud with the site's AI voice, else the device's English voice), then the quick check one question at a time, graded by the server.
// Without this script the page still works: the slides are a scrolling page and the check is a plain form.
import { api, pageData, $, $$, t, toast } from '/js/app.js';

const d = pageData();
const base = `/api/courses/${d.course}/${d.step}`;
const deck = $('#deck'), nav = $('#deck-nav'), check = $('#check');
const slides = $$('.slide', deck);
let at = 0;

// ---------------------------------------------------------------------------------------------- read-aloud
// The site's AI voice first (POST /api/tts ctx 'course': the server reads the slide itself, with the voice of the step's
// game character); the device's English voice when AI voices are off, the player is signed out, or it does not come.
const synth = 'speechSynthesis' in window ? window.speechSynthesis : null;
let speaking = null, audio = null, ticket = 0;
function stopSpeaking() {
  ticket++;
  if (audio) { audio.pause(); audio = null; }
  if (synth) synth.cancel();
  if (speaking) { speaking.querySelector('.lbl').textContent = t('js.course.listen'); speaking.setAttribute('aria-pressed', 'false'); speaking = null; }
}
function deviceVoice(btn, text) {
  if (!synth) return stopSpeaking();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'en-US'; u.rate = 0.95;
  const v = synth.getVoices().find(x => /^en(-|_)US/i.test(x.lang)) || synth.getVoices().find(x => /^en/i.test(x.lang));
  if (v) u.voice = v;
  u.onend = u.onerror = () => { if (speaking === btn) stopSpeaking(); };
  synth.speak(u);
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
    f.querySelector('.qq-fb').textContent = r.right ? t('js.course.right') : t('js.course.wrong', { answer: r.text });
    const last = qi === qs.length - 1;
    const go = document.createElement('button');
    go.type = 'button'; go.className = 'btn btn-primary btn-big qq-go'; go.textContent = last ? t('js.course.finish') : t('js.course.next');
    go.addEventListener('click', () => (last ? finish() : ask(qi + 1)));
    f.append(go);
    go.focus();
  });
  ask(0);
}
