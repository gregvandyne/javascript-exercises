// A Grammar Lab topic's practice (server/views/grammar-lab.js practicePage; routes/grammar-lab.js): the welcome screen
// (doorway and greeting, with a skip), the teaching card as the lesson's next step (and, during the questions, in a sheet
// over the lesson), the first-visit double-tap tip, the quiz one question at a time (tap a word to
// mark it, tap again to clear it, Submit), the green "Correct!" confirmation, the calm wrong-answer notice with its
// hint, the near-miss notice, the level-complete overlay and the mastery screen. The server grades every try and keeps
// the counter, the streak and the bar (services/grammar-lab-mastery.js); this page only shows what it sends back.
// Owner's review fixes (2026-11-27): a word question with a one-word answer moves its pick (a second tap replaces the
// first); a wrong answer clears the picks so the student starts fresh; a missed question that comes back says "Try this
// one again"; the counter says what misses added; any failed try re-syncs from the server (never a dead end); the
// lesson shows a loading state at once; the hint opens above Submit; a new question's line is never under the top bar.
// Pictures and animations: public/js/grammar-lab-art.js (they respect reduced motion and never block a control).
import { api, pageData, $, $$, t, toast } from '/js/app.js';
// A question's kind (services/grammar-lab.js questionFor): 'tap' (mark words), 'gaps' (tap the gap between two words
// where a comma goes; it shows the comma), 'choice' (pick one option, which fills the sentence's blank; whole: the
// options are whole sentences; prompt: what they are about, shown above; plain: the sentence with no blank; passage:
// the options are a short passage's sentences, tapped where they stand; cycle: press-to-cycle, one control in the blank
// that shows the next option on each press) or 'fix' (an error-fixing box: the student edits the sentence and submits
// it; after a wrong answer the box turns into press-to-cycle through whole versions of the sentence). Nothing is ever
// chosen when a question opens (a cycle opens on "Press to choose", never on an option), and Submit stays off until the
// student acts (a fix box: until the sentence is changed). 'marks' (punctuation chips): each gap between words holds a
// mark from the chip bank or none; the sentence opens with its marks as written. A topic may offer "It's right as it
// is" (asIs) on its marks, fix and capitalization questions, so a sentence with nothing to fix is asked like every other.
import { mountWelcome, mountGreeting, mountMastery, mountTapTip } from '/js/grammar-lab-art.js';

const d = pageData();
const base = `/api/courses/grammar-lab/topic/${d.topic}`;
const TIP_KEY = 'gl:tip-seen';
const screens = ['gl-loading', 'gl-welcome', 'gl-cardstep', 'gl-quiz', 'gl-done'];
const CARD_KEY = `gl:card-seen:${d.topic}`;
const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
/** Bring an element fully into view, below the site's sticky top bar and above the bottom nav (the CSS scroll margins
 *  say how far), smoothly unless reduced motion is asked for. Nothing moves when it is already in view. */
function inView(el, block = 'nearest') {
  if (!el || !el.getBoundingClientRect) return;
  const r = el.getBoundingClientRect(), cs = getComputedStyle(el);
  const top = parseFloat(cs.scrollMarginTop) || 0, bottom = parseFloat(cs.scrollMarginBottom) || 0;
  if (r.top >= top && r.bottom <= window.innerHeight - bottom) return;
  el.scrollIntoView({ block, behavior: reduced() ? 'auto' : 'smooth' });
}
let summary = null, question = null, busy = false, picked = null, asIs = false, chip = ',';
/** K-2 read-aloud: the listen button playing now, its audio and its object URL (see "read aloud" below). */
let say = { btn: null, audio: null, url: null };
const marked = new Set();
/** Punctuation chips: the mark in each gap now (gap -> mark), opened with the marks as written. */
let gapMarks = new Map();
const AS_IS = 'as-is';
const sameMarks = (a, b) => a.size === b.size && [...a].every(([g, m]) => b.get(g) === m);
const fixBox = () => $('#gl-fix');
const typing = () => !!question && question.kind === 'fix' && !question.options;
const ready = () => {
  if (!question) return false;
  if (asIs) return true;
  if (question.kind === 'marks') return !sameMarks(gapMarks, new Map(question.start));
  if (typing()) { const v = fixBox().value.replace(/\s+/g, ' ').trim(); return !!v && v !== question.text; }
  return question.kind === 'choice' || question.kind === 'fix' ? picked !== null : marked.size > 0;
};
const scenes = {};
const CORRECT = $('#gl-correct-t').textContent;

const show = id => {
  for (const s of screens) $(`#${s}`).hidden = s !== id;
  $('#gl-meter').hidden = id === 'gl-welcome' || id === 'gl-cardstep';
  // (on the card step the card is right there: no header button for it)
  $('#gl-card-btn').hidden = id === 'gl-cardstep';
};
const stored = k => { try { return localStorage.getItem(k); } catch { return null; } };
const store = (k, v) => { try { localStorage.setItem(k, v); } catch { /* storage off */ } };
const norm = w => String(w || '').toLowerCase().replace(/[^\p{L}\p{N}'-]/gu, '');
function scene(key, el, mount, opts = {}) {
  if (scenes[key]) scenes[key].destroy();
  el.textContent = '';
  scenes[key] = mount(el, { band: d.band, ...opts });
  return scenes[key];
}

// ---------------------------------------------------------------------------------------------- the header
function renderHeader() {
  if (!summary) return;
  $('#gl-dots').hidden = false; $('#gl-levels-btn').hidden = false;
  const dots = $$('#gl-dots i');
  dots.forEach((i, k) => i.classList.toggle('on', k < summary.levelsDone));
  $('#gl-dots').setAttribute('aria-label', t('js.grammar-lab.levelsDone', { done: summary.levelsDone, total: summary.levels }));
  $('#gl-levels-btn').textContent = t('js.grammar-lab.levelOf', { n: summary.level, total: summary.levels });
  $('#gl-counter').textContent = t('js.grammar-lab.counter', { n: Math.min(summary.counter, summary.total), total: summary.total });
  // what misses added to the topic's questions, said next to the count (the bar's added segments are dashed)
  const added = $('#gl-added');
  added.hidden = !summary.added;
  added.textContent = summary.added ? t('js.grammar-lab.counterAdded', { count: summary.added }) : '';
  const bar = $('#gl-bar');
  bar.textContent = '';
  for (const b of summary.bar) { const li = document.createElement('li'); li.className = `gl-seg gl-seg-${b}`; bar.appendChild(li); }
  $$('#gl-streak .gl-pips i').forEach((i, k) => i.classList.toggle('on', k < summary.streak));
  $('#gl-streak-t').textContent = t('js.grammar-lab.streak', { n: Math.min(summary.streak, summary.need), need: summary.need });
}

// ---------------------------------------------------------------------------------------------- a question
/** The line that asks, with its grammar words double-tappable. */
function renderAsk(text) {
  const ask = $('#gl-ask');
  ask.textContent = '';
  String(text).split(/(\s+)/).forEach(part => {
    const k = norm(part);
    if (k && d.glossary[k]) {
      const m = /^([^\p{L}]*)(.*?)([^\p{L}]*)$/u.exec(part);
      ask.append(m[1]);
      const s = document.createElement('span');
      s.className = 'gl-term'; s.tabIndex = 0; s.dataset.term = k; s.textContent = m[2];
      ask.append(s, m[3]);
    } else ask.append(part);
  });
}
/** One word as one piece that never breaks: the marks stuck to it (and its comma gap) stay on its line, so a line never
 *  starts with a mark. Only the word itself is tappable; the marks are plain text beside it. */
function tok(...parts) {
  const s = document.createElement('span'); s.className = 'gl-tok';
  s.append(...parts.filter(x => x !== '' && x !== null && x !== undefined));
  return s;
}
/** A blank (or a press-to-cycle control) with what touches it on either side (no space between): one piece. */
function glued(box, before, el, after) {
  const b = /\S*$/.exec(before || '')[0], a = /^\S*/.exec(after || '')[0];
  box.append((before || '').slice(0, (before || '').length - b.length), tok(b, el, a), (after || '').slice(a.length));
}
function renderQuestion() {
  if (say.btn) sayStop();
  marked.clear(); picked = null; asIs = false;
  gapMarks = new Map(question.start || []);
  const q = question;
  // a missed question back for another try says so (and one seen before, when a run needs it)
  const again = $('#gl-again');
  again.hidden = !q.again && !q.seen;
  again.textContent = q.again ? t('js.grammar-lab.tryAgain') : q.seen ? t('js.grammar-lab.seenBefore') : '';
  renderAsk(q.ask);
  const box = $('#gl-sentence'), opts = $('#gl-options'), prompt = $('#gl-prompt');
  box.textContent = ''; opts.textContent = '';
  prompt.hidden = !q.prompt; prompt.textContent = q.prompt || '';
  $('#gl-fixbox').hidden = !typing();
  opts.hidden = q.kind !== 'choice' || !!q.passage || !!q.cycle;
  box.hidden = q.kind === 'choice' && q.whole && !q.passage;
  box.classList.toggle('gl-gaps', q.kind === 'gaps' || q.kind === 'marks');
  renderChips(q);
  const keep = $('#gl-asis');
  keep.hidden = !q.asIs; keep.setAttribute('aria-pressed', 'false');
  box.classList.toggle('gl-passage-q', !!q.passage);
  if (q.passage) { box.setAttribute('role', 'radiogroup'); box.setAttribute('aria-labelledby', 'gl-ask'); } else { box.removeAttribute('role'); box.removeAttribute('aria-labelledby'); }
  if (q.kind === 'fix') renderFix();
  else if (q.kind === 'marks') renderMarks(q);
  else if (q.passage) {
    // the passage itself: each sentence a choice, where it stands
    q.options.forEach((o, k) => {
      if (k) box.append(' ');
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'gl-sent'; b.dataset.k = String(k); b.setAttribute('role', 'radio'); b.setAttribute('aria-checked', 'false'); b.textContent = o;
      box.append(b);
    });
  } else if (q.kind === 'choice' && q.cycle) {
    glued(box, q.before, cycleButton(q.options, false), q.after);
  } else if (q.kind === 'choice') {
    // pills about a sentence: the sentence, with the word the question names in bold
    if (q.plain && q.words) q.words.forEach((w, i) => {
      if (i) box.append(' ');
      const s = document.createElement(q.focus.includes(i) ? 'b' : 'span'); s.textContent = w.t;
      if (q.focus.includes(i)) s.className = 'gl-focus';
      // a book or movie title stays in italics
      if (q.titleAt && q.titleAt.includes(i)) s.classList.add('gl-title-w');
      box.append(tok(w.pre, s, w.post));
    });
    else if (q.plain) box.append(q.before);
    else if (!q.whole) {
      const blank = document.createElement('span');
      blank.className = `gl-blank${q.italic ? ' gl-title' : ''}`; blank.id = 'gl-blank'; blank.setAttribute('aria-label', t('js.grammar-lab.blank'));
      glued(box, q.before, blank, q.after);
    }
    q.options.forEach((o, k) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = `gl-opt${q.whole ? ' gl-opt-whole' : ''}${q.italic ? ' gl-title' : ''}`; b.dataset.k = String(k);
      b.setAttribute('role', 'radio'); b.setAttribute('aria-checked', 'false'); b.textContent = o;
      opts.append(b);
    });
  } else {
    q.words.forEach((w, i) => {
      if (i) box.append(' ');
      if (q.kind === 'gaps') {
        const s = document.createElement('span'); s.className = 'gl-word'; s.textContent = w.t;
        let g = null;
        if (i < q.words.length - 1) {
          g = document.createElement('button');
          g.type = 'button'; g.className = 'gl-gap'; g.dataset.g = String(i); g.setAttribute('aria-pressed', 'false');
          g.setAttribute('aria-label', t('js.grammar-lab.gap', { word: w.t }));
        }
        // (the gap after a word stays with that word)
        box.append(tok(w.pre, s, w.post, g));
        return;
      }
      const b = document.createElement('button');
      b.type = 'button'; b.className = `gl-w${q.focus && q.focus.includes(i) ? ' gl-focus' : ''}${q.titleAt && q.titleAt.includes(i) ? ' gl-title-w' : ''}`; b.dataset.i = String(i); b.setAttribute('aria-pressed', 'false'); b.textContent = w.t;
      box.append(tok(w.pre, b, w.post));
    });
  }
  notice(null);
  // (a question missed before the page was opened again keeps its hint)
  hint(q.hint || null);
  $('#gl-submit').disabled = true;
  renderHeader();
  // a new question starts at its line: never under the sticky top bar after the page was scrolled down to Submit
  if (!$('#gl-quiz').hidden) inView($('#gl-quiz .gl-qtop'), 'start');
}
/** A one-word answer (a tap or capital question whose answer is one word): a tap moves the pick. */
const single = () => !!question && question.kind === 'tap' && question.need === 1;
/** After a wrong answer the student starts fresh: nothing picked, nothing marked, the sentence as written. */
function clearPicks() {
  marked.clear(); picked = null;
  for (const w of $$('#gl-sentence .gl-w, #gl-sentence .gl-gap:not(.gl-mgap)')) w.setAttribute('aria-pressed', 'false');
  for (const o of $$('#gl-options .gl-opt, #gl-sentence .gl-sent')) o.setAttribute('aria-checked', 'false');
  const blank = $('#gl-blank'); if (blank) { blank.textContent = ''; blank.classList.remove('gl-filled'); }
  const c = $('#gl-cycle');
  if (c) {
    c.classList.remove('gl-filled'); c.querySelector('.gl-cycle-t').textContent = t('js.grammar-lab.cyclePress');
    c.querySelectorAll('.gl-cycle-dots i').forEach(i => i.classList.remove('on')); c.setAttribute('aria-label', t('js.grammar-lab.cyclePress'));
  }
  if (question && question.kind === 'marks') { gapMarks = new Map(question.start || []); for (const g of $$('#gl-sentence .gl-mgap')) paintGap(g, question.words[+g.dataset.m].t); }
  if (typing()) fixBox().value = question.text;
  keepAsIs(false);
}
/** A press-to-cycle control: opens on "Press to choose" (never on an option); each press shows the next option. */
function cycleButton(options, whole) {
  const b = document.createElement('button');
  b.type = 'button'; b.id = 'gl-cycle'; b.className = `gl-cycle${whole ? ' gl-cycle-whole' : ''}`;
  const label = document.createElement('span'); label.className = 'gl-cycle-t'; label.textContent = t('js.grammar-lab.cyclePress');
  const dots = document.createElement('span'); dots.className = 'gl-cycle-dots'; dots.setAttribute('aria-hidden', 'true');
  for (let k = 0; k < options.length; k++) dots.append(document.createElement('i'));
  b.append(label, dots);
  b.setAttribute('aria-label', t('js.grammar-lab.cyclePress'));
  return b;
}
$('#gl-sentence').addEventListener('click', e => {
  const c = e.target.closest('.gl-cycle');
  if (c && !busy) {
    const opts = question.options;
    picked = picked === null ? 0 : (picked + 1) % opts.length;
    c.querySelector('.gl-cycle-t').textContent = opts[picked];
    c.classList.add('gl-filled');
    c.querySelectorAll('.gl-cycle-dots i').forEach((i, k) => i.classList.toggle('on', k === picked));
    c.setAttribute('aria-label', t('js.grammar-lab.cycleOf', { option: opts[picked], n: picked + 1, total: opts.length }));
    $('#gl-submit').disabled = !ready();
    return;
  }
  const s = e.target.closest('.gl-sent');
  if (s && !busy) {
    picked = +s.dataset.k;
    for (const o of $$('#gl-sentence .gl-sent')) o.setAttribute('aria-checked', String(o === s));
    $('#gl-submit').disabled = !ready();
  }
});
/** A fix: the box holding the sentence to edit; once missed, press-to-cycle through whole versions of it. */
function renderFix() {
  const q = question, box = $('#gl-sentence');
  picked = null;
  if (!q.options) {
    box.hidden = true;
    fixBox().value = q.text;
    return;
  }
  $('#gl-fixbox').hidden = true;
  box.hidden = false; box.textContent = '';
  box.append(cycleButton(q.options, true));
}
$('#gl-fix').addEventListener('input', () => { if (!busy) { keepAsIs(false); $('#gl-submit').disabled = !ready(); } });
/** Punctuation chips: the chip bank (when the topic has more than one mark) and each gap showing its mark. */
function renderChips(q) {
  const bank = $('#gl-chips');
  bank.textContent = '';
  bank.hidden = q.kind !== 'marks' || q.chips.length < 2;
  chip = q.kind === 'marks' ? q.chips[0] : ',';
  if (bank.hidden) return;
  for (const c of q.chips) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'gl-chip'; b.dataset.c = c; b.textContent = c;
    b.setAttribute('role', 'radio'); b.setAttribute('aria-checked', String(c === chip)); b.setAttribute('aria-label', t('js.grammar-lab.chip', { mark: t(`js.grammar-lab.mark.${MARK_NAMES[c]}`) }));
    bank.append(b);
  }
}
const MARK_NAMES = { ',': 'comma', ';': 'semicolon', ':': 'colon' };
function renderMarks(q) {
  const box = $('#gl-sentence');
  q.words.forEach((w, i) => {
    if (i) box.append(' ');
    const s = document.createElement('span'); s.className = 'gl-word'; s.textContent = w.t;
    let g = null;
    if (i < q.words.length - 1) {
      g = document.createElement('button');
      g.type = 'button'; g.className = 'gl-gap gl-mgap'; g.dataset.m = String(i);
      paintGap(g, w.t);
    }
    box.append(tok(w.pre, s, w.post, g));
  });
}
function paintGap(g, word) {
  const m = gapMarks.get(+g.dataset.m) || '';
  g.dataset.mark = m;
  g.setAttribute('aria-pressed', String(!!m));
  g.setAttribute('aria-label', m ? t('js.grammar-lab.gapHolds', { word, mark: t(`js.grammar-lab.mark.${MARK_NAMES[m]}`) }) : t('js.grammar-lab.mgap', { word }));
}
$('#gl-chips').addEventListener('click', e => {
  const b = e.target.closest('.gl-chip');
  if (!b || busy) return;
  chip = b.dataset.c;
  for (const o of $$('#gl-chips .gl-chip')) o.setAttribute('aria-checked', String(o === b));
});
/** "It's right as it is": pressed, it is the answer; any edit lets it go. */
function keepAsIs(on) {
  asIs = on;
  $('#gl-asis').setAttribute('aria-pressed', String(on));
}
$('#gl-asis').addEventListener('click', () => {
  if (busy || !question) return;
  keepAsIs(!asIs);
  if (asIs) {
    // the sentence goes back to how it was written
    if (question.kind === 'marks') { gapMarks = new Map(question.start || []); for (const g of $$('#gl-sentence .gl-mgap')) paintGap(g, question.words[+g.dataset.m].t); }
    if (typing()) fixBox().value = question.text;
    // capitalization: no word stays marked
    if (question.kind === 'tap') { marked.clear(); for (const w of $$('#gl-sentence .gl-w')) w.setAttribute('aria-pressed', 'false'); }
  }
  $('#gl-submit').disabled = !ready();
});
function notice(kind, text = '') {
  const n = $('#gl-notice');
  n.hidden = !kind; n.className = `gl-notice${kind ? ` gl-notice-${kind}` : ''}`; n.textContent = text;
}
/** The hint control: shown after a wrong answer only, closed until asked for. */
function hint(text) {
  const btn = $('#gl-hint-btn'), box = $('#gl-hint');
  if (text === null) { btn.hidden = true; box.hidden = true; btn.setAttribute('aria-expanded', 'false'); btn.textContent = t('js.grammar-lab.hint'); return; }
  $('#gl-hint-text').textContent = text;
  btn.hidden = false;
}
$('#gl-hint-btn').addEventListener('click', () => {
  const box = $('#gl-hint'), btn = $('#gl-hint-btn');
  box.hidden = !box.hidden;
  btn.setAttribute('aria-expanded', String(!box.hidden));
  btn.textContent = box.hidden ? t('js.grammar-lab.hint') : t('js.grammar-lab.hideHint');
  // (a hint being read stops when it is hidden)
  if (box.hidden && say.btn && box.contains(say.btn)) sayStop();
  // (the hint opens above Submit; on a phone it is brought into view, smoothly)
  if (!box.hidden) inView(box);
});
$('#gl-sentence').addEventListener('click', e => {
  const mg = e.target.closest('.gl-mgap');
  if (mg && !busy) {
    // a gap takes the chosen mark; the same mark again clears it
    const g = +mg.dataset.m;
    if (gapMarks.get(g) === chip) gapMarks.delete(g); else gapMarks.set(g, chip);
    paintGap(mg, question.words[g].t);
    keepAsIs(false);
    $('#gl-submit').disabled = !ready();
    return;
  }
  const b = e.target.closest('.gl-w, .gl-gap');
  if (!b || busy) return;
  const i = +(b.dataset.i ?? b.dataset.g);
  if (marked.has(i)) marked.delete(i);
  else if (b.classList.contains('gl-w') && single()) {
    // one word to find: the pick moves to the word tapped
    marked.clear(); marked.add(i);
    for (const w of $$('#gl-sentence .gl-w')) if (w !== b) w.setAttribute('aria-pressed', 'false');
  } else marked.add(i);
  b.setAttribute('aria-pressed', String(marked.has(i)));
  keepAsIs(false);
  $('#gl-submit').disabled = !ready();
});
$('#gl-options').addEventListener('click', e => {
  const b = e.target.closest('.gl-opt');
  if (!b || busy) return;
  picked = +b.dataset.k;
  for (const o of $$('#gl-options .gl-opt')) o.setAttribute('aria-checked', String(o === b));
  const blank = $('#gl-blank');
  if (blank) { blank.textContent = question.options[picked]; blank.classList.add('gl-filled'); }
  $('#gl-submit').disabled = !ready();
});
// The choices are a radio group: the arrow keys move between them (and pick), as in any radio group.
$('#gl-options').addEventListener('keydown', e => {
  const list = $$('#gl-options .gl-opt'), at = list.indexOf(document.activeElement);
  if (at < 0 || !['ArrowDown', 'ArrowRight', 'ArrowUp', 'ArrowLeft'].includes(e.key)) return;
  e.preventDefault();
  const to = list[(at + (e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : list.length - 1)) % list.length];
  to.focus(); to.click();
});
/** A capitalization fix made right: the tapped words take their capital before the green confirmation. */
function showFixed() {
  if (!question || !(d.capfix || question.capfix)) return;
  // the case flips: a small letter takes its capital, a capital that does not belong goes small
  for (const i of marked) {
    const b = $(`#gl-sentence .gl-w[data-i="${i}"]`), c = b && b.textContent.charAt(0);
    if (b) b.textContent = (c === c.toUpperCase() ? c.toLowerCase() : c.toUpperCase()) + b.textContent.slice(1);
  }
}

// ---------------------------------------------------------------------------------------------- answering
$('#gl-submit').addEventListener('click', async () => {
  if (busy || !ready() || !question) return;
  busy = true; $('#gl-submit').disabled = true;
  let r;
  const sent = asIs ? AS_IS : question.kind === 'marks' ? [...gapMarks] : typing() ? fixBox().value : question.kind === 'choice' || question.kind === 'fix' ? [picked] : [...marked].sort((a, b) => a - b);
  try {
    r = await api(`${base}/answer`, { method: 'POST', body: { unit: d.unit, band: d.band, id: question.id, marked: sent } });
  } catch (e) {
    busy = false;
    // Never a dead end: the page picks up from where the run is on the server (another tab or device moved it on or
    // finished it, the topic changed, the network dropped, the sign-in ended), and nothing the student did is lost.
    return resync(e);
  }
  summary = r.summary;
  if (r.kind === 'near') { busy = false; notice('near', t(question.kind === 'gaps' ? 'js.grammar-lab.nearGaps' : 'js.grammar-lab.near')); $('#gl-submit').disabled = !ready(); inView($('.gl-actions')); return; }
  if (r.kind === 'wrong' || r.kind === 'again') {
    busy = false;
    // A fix missed for the first time: the box turns into press-to-cycle through versions of the sentence.
    const toCycle = (typing() || (asIs && question.kind === 'fix')) && r.question && r.question.options;
    if (toCycle) { question = r.question; keepAsIs(false); $('#gl-asis').hidden = true; renderFix(); }
    else clearPicks();
    notice('wrong', t(toCycle ? 'js.grammar-lab.wrongFix' : r.kind === 'wrong' ? (question.kind === 'marks' ? 'js.grammar-lab.wrongMarks' : 'js.grammar-lab.wrong') : 'js.grammar-lab.again'));
    hint(r.hint);
    renderHeader();
    $('#gl-submit').disabled = !ready();
    // (on a short phone the notice and the Hint button come into view, above the bottom nav: the notice sits just
    // above them)
    inView($('.gl-actions'));
    return;
  }
  // Right (or a missed question fixed): the green confirmation, then what comes next. The header and the question
  // change together, after it (the counter never runs ahead of the sentence on screen).
  showFixed();
  await flash(r.kind === 'fixed');
  question = r.question;
  busy = false;
  if (r.mastered) return done(r.closing);
  if (r.levelDone !== null && r.levelDone !== undefined) { renderQuestion(); return levelDone(r.levelDone); }
  renderQuestion();
});

/** After a try that did not go through: ask the server where the run is and carry on from there. */
async function resync(e) {
  if (e && (e.signedOut || (e.data && e.data.signedOut) || (e.status === 401 && d.signedIn))) return signedOut();
  let st = e && e.status === 409 && e.data && (e.data.question || e.data.mastered || e.data.none) ? e.data : null;
  if (!st) { try { st = await api(`${base}/state`, { method: 'POST', body: { unit: d.unit, band: d.band } }); } catch (e2) { st = null; if (e2 && (e2.signedOut || e2.status === 401)) return signedOut(); } }
  if (st && st.mastered) { summary = st.summary; question = null; return done(st.closing, { elsewhere: true }); }
  if (st && st.question) {
    // the same question: the student's picks stay, and Submit is theirs to press again; another: it is shown
    if (question && st.question.id === question.id) { summary = st.summary; renderHeader(); notice('near', t('js.grammar-lab.notSent')); $('#gl-submit').disabled = !ready(); return; }
    summary = st.summary; question = st.question; renderQuestion(); notice('near', t('js.grammar-lab.resynced')); return;
  }
  if (st && st.none) { d.again = false; return start(); }
  // the server could not be reached: the picks stay, Submit tries again
  notice('near', t('js.grammar-lab.notSent'));
  $('#gl-submit').disabled = !ready();
}
/** The sign-in ended: the run is kept on the account; sign in again to carry on from the same question. */
function signedOut() {
  const n = $('#gl-notice');
  notice('near', `${t('js.grammar-lab.signedOut')} `);
  const a = document.createElement('a'); a.href = d.login; a.textContent = t('js.grammar-lab.signIn');
  n.append(a);
  $('#gl-submit').disabled = !ready();
}

/** The full-screen green "Correct!" for a moment (a tap, or Enter, moves on sooner). fixed: a missed question answered
 *  right says "Fixed it!" and that first tries count toward the streak. */
function flash(fixed = false) {
  const f = $('#gl-correct');
  $('#gl-correct-t').textContent = fixed ? t('js.grammar-lab.fixed') : CORRECT;
  const note = $('#gl-correct-note');
  note.hidden = !fixed; note.textContent = fixed ? t('js.grammar-lab.fixedNote') : '';
  f.hidden = false;
  return new Promise(res => {
    let over = false;
    const end = () => { if (over) return; over = true; f.hidden = true; f.removeEventListener('click', end); document.removeEventListener('keydown', end); res(); };
    f.addEventListener('click', end); document.addEventListener('keydown', end);
    setTimeout(end, 1000);
  });
}

function levelDone(level) {
  const o = $('#gl-level');
  $$('#gl-level-stars i').forEach((i, k) => i.classList.toggle('on', k <= level));
  $('#gl-level-h').textContent = t('js.grammar-lab.levelDone', { n: level + 1 });
  $('#gl-level-text').textContent = t('js.grammar-lab.levelText');
  // a level that took more than its questions says why, in one line
  const more = $('#gl-level-more'), took = summary && summary.levelSize ? summary.levelSize[level] : 0, base = summary && summary.levelBase ? summary.levelBase[level] : 0;
  more.hidden = !(took > base);
  more.textContent = took > base ? t('js.grammar-lab.levelLonger', { n: took, base }) : '';
  o.hidden = false;
  scene('levelGreet', $('#gl-level-greet'), mountGreeting);
  focusIn($('#gl-level-next'), o.querySelector('.gl-overlay-card'));
}
$('#gl-level-next').addEventListener('click', () => {
  $('#gl-level').hidden = true; inView($('#gl-quiz .gl-qtop'), 'start');
  const first = $('#gl-sentence .gl-w, #gl-sentence .gl-gap, #gl-sentence .gl-sent, #gl-sentence .gl-cycle, #gl-options .gl-opt') || (typing() && fixBox()); if (first) first.focus();
});

function done(closing, { elsewhere = false } = {}) {
  closing = closing || {};
  show('gl-done');
  renderHeader();
  scene('mastery', $('#gl-mastery'), mountMastery);
  // the same counts as the intro and the header: N questions, plus what misses added
  $('#gl-done-n').textContent = [elsewhere ? t('js.grammar-lab.doneElsewhere') : '', t('js.grammar-lab.answered', { count: closing.answered }),
    closing.added ? t('js.grammar-lab.doneAdded', { base: closing.base, count: closing.added }) : ''].filter(Boolean).join(' ');
  // personal, never a ranking: how many were right on the first try
  const acc = $('#gl-done-acc');
  acc.hidden = !closing.of;
  acc.textContent = closing.of ? t('js.grammar-lab.firstTry', { n: closing.firstTry, total: closing.of }) : '';
  const guest = $('#gl-done-guest');
  if (guest) guest.hidden = closing.win !== 'pending';
  const next = $('#gl-done-next');
  // Next is two lines: a small "Next topic", then the topic's name (a long name wraps inside the button)
  if (closing.next) { next.hidden = false; next.href = closing.next.href; next.querySelector('.gl-next-t').textContent = closing.next.title; next.setAttribute('aria-label', t('js.grammar-lab.next', { topic: closing.next.title })); }
  const room = $('#gl-done-room');
  if (room && closing.room) { room.hidden = false; room.href = closing.room; }
  $('#gl-done-h').focus && $('#gl-done-h').setAttribute('tabindex', '-1');
  $('#gl-done-h').focus();
}

// ---------------------------------------------------------------------------------------------- welcome, card, start
// The lesson: the welcome (the rule and the counts) -> the teaching card, a step of its own ("Start the questions") ->
// the questions. "Skip intro" skips the welcome to the card; a student who has read this card before (or mastered the
// topic, or is playing it again) also gets a small "Skip to questions" at the top of it. A run in progress opens on its
// question, never on the card again. During the questions the card opens in a sheet over the lesson (see below).
function welcome() {
  show('gl-welcome');
  scene('door', $('#gl-door'), mountWelcome);
  scene('greet', $('#gl-greet'), mountGreeting);
}
/** The card goes where it is shown: the card step, or the sheet over the questions (one card, moved, not copied). */
const putCard = slot => { const c = $('#gl-card'); if (c && c.parentElement !== slot) slot.appendChild(c); };
function cardStep() {
  for (const k of ['door', 'greet']) if (scenes[k]) { scenes[k].destroy(); delete scenes[k]; }
  if ($('#gl-cardsheet').open) $('#gl-cardsheet').close();
  putCard($('#gl-cardstep-slot'));
  $('#gl-card-skip').hidden = !(stored(CARD_KEY) || d.mastered || d.again);
  show('gl-cardstep');
  const sec = $('#gl-cardstep');
  window.scrollTo({ top: 0, behavior: 'auto' });
  inView(sec, 'start');
  // (the step's heading takes the focus, so a screen reader starts reading the card; no ring after a tap)
  const h = $('#gl-cardstep-h');
  h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true });
}
$('#gl-go').addEventListener('click', cardStep);
$('#gl-skip').addEventListener('click', cardStep);
let starting = false;
const startBtns = () => [$('#gl-go'), $('#gl-skip'), $('#gl-card-go'), $('#gl-card-skip')];
async function start() {
  if (starting) return;
  starting = true;
  if (say.btn) sayStop();
  for (const b of startBtns()) b.disabled = true;
  for (const k of ['door', 'greet']) if (scenes[k]) { scenes[k].destroy(); delete scenes[k]; }
  let r;
  try { r = await api(`${base}/start`, { method: 'POST', body: { unit: d.unit, band: d.band, again: !!d.again } }); }
  catch (e) {
    starting = false; for (const b of startBtns()) b.disabled = false;
    // (a sign-in that ended: sign in again, and the run is waiting on the account)
    if (e && (e.signedOut || (e.status === 401 && d.signedIn))) { location.href = d.login; return; }
    return toast(t('js.grammar-lab.wentWrong'), { bad: true });
  }
  starting = false;
  for (const b of startBtns()) b.disabled = false;
  d.again = false;
  store(CARD_KEY, '1');
  enter(r);
}
function enter(r) {
  summary = r.summary; question = r.question;
  putCard($('#gl-sheet-body'));
  show('gl-quiz');
  renderQuestion();
  if (!stored(TIP_KEY)) openTip();
}
$('#gl-card-go').addEventListener('click', start);
$('#gl-card-skip').addEventListener('click', start);

// ---------------------------------------------------------------------------------------------- the card sheet
// "Teaching card" in the header opens the card over the lesson (a bottom sheet on a phone, a side panel on a wide
// screen: public/css/grammar-lab.css .gl-sheet), so the question, the picks and the progress stay as they are. A modal
// dialog: Escape, the close button or a tap outside closes it, and the focus goes back to the header button. Without
// the script the button is a plain link to the card page.
const sheet = $('#gl-cardsheet');
$('#gl-card-btn').addEventListener('click', e => {
  if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button) return;
  e.preventDefault();
  putCard($('#gl-sheet-body'));
  hideMeaning();
  sheet.showModal();
  $('#gl-sheet-body').scrollTop = 0;
  focusIn($('#gl-sheet-x'), sheet);
});
$('#gl-sheet-x').addEventListener('click', () => sheet.close());
sheet.addEventListener('click', e => { if (e.target === sheet) sheet.close(); });
sheet.addEventListener('close', () => {
  if (say.btn && say.btn.id === 'gl-listen') sayStop();
  const b = $('#gl-card-btn'); if (!b.hidden) b.focus({ preventScroll: true });
});

// ---------------------------------------------------------------------------------------------- the tip, levels, flag
// Keyboard focus shows its ring (round the button's own shape: public/css/grammar-lab.css); after a tap or a click, a
// dialog or overlay that opens takes the focus itself, so no ring shows on a touch screen, and Tab reaches its button.
let keyed = false;
document.addEventListener('keydown', e => { if (!e.metaKey && !e.ctrlKey && !e.altKey) keyed = true; }, true);
document.addEventListener('pointerdown', () => { keyed = false; }, true);
/** Focus a dialog's (or overlay's) button for a keyboard user, else the box itself (no ring after a tap). */
function focusIn(btn, box) {
  if (keyed || !box) { btn.focus(); return; }
  if (!box.hasAttribute('tabindex')) box.setAttribute('tabindex', '-1');
  box.focus({ preventScroll: true });
}
const openDialog = dlg => { if (!dlg.open) dlg.showModal(); focusIn(dlg.querySelector('.gl-dialog-go .btn-primary') || dlg.querySelector('button'), dlg); };
function openTip() {
  const dlg = $('#gl-tip');
  if (!dlg.open) dlg.showModal();
  scene('tip', $('#gl-tip-stage'), mountTapTip, { before: d.tip.before, word: d.tip.word, after: d.tip.after, def: d.tip.def, replayLabel: d.tip.replay });
  focusIn($('#gl-tip-ok'), dlg);
}
$('#gl-tip-ok').addEventListener('click', () => $('#gl-tip').close());
$('#gl-tip').addEventListener('close', () => { store(TIP_KEY, '1'); if (scenes.tip) { scenes.tip.destroy(); delete scenes.tip; } });
$('#gl-tip-btn').addEventListener('click', openTip);
$('#gl-levels-btn').addEventListener('click', () => {
  if (summary) $('#gl-levels-now').textContent = t('js.grammar-lab.levelsNow', { n: summary.level, total: summary.levels });
  openDialog($('#gl-levels'));
});
$('#gl-levels-ok').addEventListener('click', () => $('#gl-levels').close());
$('#gl-flag').addEventListener('click', () => openDialog($('#gl-flagbox')));
$('#gl-flag-no').addEventListener('click', () => $('#gl-flagbox').close());
$('#gl-flag-yes').addEventListener('click', async () => {
  $('#gl-flagbox').close();
  try { await api(`${base}/flag`, { method: 'POST', body: { unit: d.unit, band: d.band, id: question && question.id } }); toast(t('js.grammar-lab.flagSent')); }
  catch { toast(t('js.grammar-lab.wentWrong'), { bad: true }); }
});

// ---------------------------------------------------------------------------------------------- double-tap meanings
const bubble = $('#gl-bubble');
function showMeaning(el) {
  const g = d.glossary[el.dataset.term];
  if (!g) return;
  bubble.textContent = '';
  const b = document.createElement('b'); b.textContent = g.word;
  bubble.append(b, ' ', g.def);
  bubble.hidden = false;
  const r = el.getBoundingClientRect(), w = bubble.offsetWidth;
  const left = Math.max(8, Math.min(document.documentElement.clientWidth - w - 8, r.left + r.width / 2 - w / 2));
  bubble.style.left = `${left + window.scrollX}px`;
  bubble.style.top = `${r.top + window.scrollY - bubble.offsetHeight - 10}px`;
}
const hideMeaning = () => { bubble.hidden = true; };
let lastTap = { el: null, at: 0 };
document.addEventListener('pointerup', e => {
  const el = e.target.closest('[data-term]');
  if (!el) { if (!e.target.closest('#gl-bubble')) hideMeaning(); return; }
  const now = Date.now();
  if (lastTap.el === el && now - lastTap.at < 400) { showMeaning(el); lastTap = { el: null, at: 0 }; }
  else lastTap = { el, at: now };
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') hideMeaning();
  const el = e.target.closest && e.target.closest('[data-term]');
  if (el && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); showMeaning(el); }
});
window.addEventListener('scroll', hideMeaning, { passive: true });

// ---------------------------------------------------------------------------------------------- read aloud (K-2)
// A K-2 question has a listen button, and so does its hint once it shows (students who may not read well yet). Only the
// shared speak path (POST /api/tts ctx 'grammar', public/js/tts.js): the server reads the question on this player's
// screen by its id, never text from the page, and never the device's own voice. The page has the buttons only when the
// English voice is on at /admin/voices (d.listen); this device's choice of device voices (or Data Saver) hides them too.
// Nothing is fetched otherwise: tts.js itself is loaded only here.
const SILENT = 'data:audio/wav;base64,UklGRjQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YRAAAACAgICAgICAgICAgICAgICA';
function sayStop() {
  const { btn, audio, url } = say;
  say = { btn: null, audio: null, url: null };
  if (audio) { try { audio.pause(); } catch { /* none */ } }
  if (url) URL.revokeObjectURL(url);
  if (btn) { btn.setAttribute('aria-pressed', 'false'); btn.querySelector('.lbl').textContent = btn.dataset.label; }
}
if (d.listen) import('/js/tts.js').then(T => {
  if (T.voiceMode() !== 'ai') return;
  for (const [sel, part] of [['#gl-say', 'question'], ['#gl-hint-say', 'hint'], ['#gl-listen', 'card']]) {
    const b = $(sel);
    if (!b) continue;
    b.dataset.label = b.querySelector('.lbl').textContent;
    b.hidden = false;
    b.addEventListener('click', async () => {
      if (say.btn === b) return sayStop();
      sayStop();
      if (part !== 'card' && !question) return;
      // (inside the tap: an iPhone plays the audio only from an element first played in a tap)
      const audio = new Audio(SILENT);
      try { const p = audio.play(); if (p && p.catch) p.catch(() => {}); } catch { /* no audio */ }
      say = { btn: b, audio, url: null };
      b.setAttribute('aria-pressed', 'true'); b.querySelector('.lbl').textContent = d.listen.stop;
      try {
        // (the card: the server reads the topic's card itself, as on the card page)
        const blob = await T.ttsBlob(part === 'card' ? { ctx: 'grammar', topic: d.topic } : { ctx: 'grammar', topic: d.topic, unit: d.unit, band: d.band, part, id: question.id });
        if (say.audio !== audio) return;
        say.url = URL.createObjectURL(blob);
        audio.onended = () => { if (say.audio === audio) sayStop(); };
        audio.src = say.url;
        await audio.play();
      } catch { if (say.audio === audio) sayStop(); }
    });
  }
}, () => { /* stays silent */ });

// ---------------------------------------------------------------------------------------------- go
if (d.run && d.run.question) enter(d.run); else welcome();
