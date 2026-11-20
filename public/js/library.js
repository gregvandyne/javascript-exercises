// Story Library reader (server/routes/library.js; docs/decisions.md "Story Library"). One page at a time: the picture,
// big words, Back / Next and page dots; Read to me reads the page and lights up each word as it is spoken (the device's
// voice, with speechSynthesis word boundaries) or each sentence (the AI voice, when it is on for English: it gives no
// word timings). After the last page, 3 questions: a wrong answer says "Try again! Look at page N" and can open that
// page. The server keeps the page reached and checks every answer; the right answers never reach this page.
//
// The Classics (books where many pages have no picture; the server marks the stage .is-classic): on a wide, landscape
// screen, text-only pages next to each other show side by side as an open book (a spread), Next and Back turn both,
// the counter says "Pages 3-4 of 12", and Read to me reads the left page and then the right. A picture page keeps the
// usual layout, and a lone text-only page gets a spread to itself (the right page blank). Phones and portrait screens
// show one page at a time. `page` is always the first page shown; the reader's progress is the last one shown.
import { api, pageData, toast } from '/js/app.js';
import { t } from '/js/i18n.js';
import { aiOn, ttsBlob, deviceVoice, unlockAudio, stopReading } from '/js/tts.js';
import { sentences, tokens, dotWindow } from '/js/library-text.js';

const D = pageData();
const root = document.getElementById('reader');
if (root && D.book) start();

function start() {
  const bk = D.book, n = bk.pages.length;
  const $ = id => document.getElementById(id);
  const stage = $('rd-stage'), end = $('rd-end'), img = $('rd-img'), text = $('rd-text');
  const classic = stage.classList.contains('is-classic');
  const pic = img.closest('.rd-pic'), text2 = $('rd-text2'), leafR = $('rd-leaf-r'), folio = $('rd-folio'), folio2 = $('rd-folio2');
  const wideMq = window.matchMedia('(min-width: 900px) and (min-aspect-ratio: 1/1)');
  const prev = $('rd-prev'), next = $('rd-next'), dots = $('rd-dots'), count = $('rd-count'), aloudBtn = $('rd-aloud');
  const ctx = D.ctx || {};
  let page = Math.min(Math.max(1, D.start || 1), n + 1);
  let peek = false;          // looking back at a page from the questions
  let reading = false;       // Read to me is on
  let usedAloud = !!(D.read && D.read.aloud);
  let furthest = D.read ? D.read.page : 0;

  // ---- what is on screen: one page, or (Classics, wide screens) two text-only pages side by side
  const hasPic = i => !!(bk.pages[i - 1] && bk.pages[i - 1].image);
  const spreadsOn = () => classic && wideMq.matches;
  /** The pages shown together with page p: [p] or [left, right] (right is 0 for a blank right-hand page). */
  function viewOf(p) {
    if (p > n || !spreadsOn() || hasPic(p)) return [p];
    // Walk the run of text-only pages this one is in, pairing from its start: 1-2, 3-4, then a lone one on its own.
    let start = p; while (start > 1 && !hasPic(start - 1)) start--;
    const left = start + 2 * Math.floor((p - start) / 2);
    return [left, left + 1 <= n && !hasPic(left + 1) ? left + 1 : 0];
  }
  const lastOf = v => Math.max(...v);
  let view = [page];

  // ---- saving where the reader got to (signed in only; the server ignores visitors)
  const save = (extra = {}) => {
    if (!D.signedIn) return Promise.resolve();
    return api(`/api/library/${bk.id}/progress`, { method: 'POST', body: { page: Math.min(lastOf(view), n), aloud: usedAloud, ...(ctx.cl ? { cl: ctx.cl, step: ctx.step } : {}), ...extra } }).catch(() => {});
  };

  // ---- drawing a page
  // How much text the page has sets its type size (CSS .rd-text[data-len]), so the words and the picture fit on one screen.
  const lenOf = words => (words <= 20 ? 's' : words <= 50 ? 'm' : words <= 100 ? 'l' : 'xl');
  function drawText(p, el = text) {
    el.dataset.len = lenOf(p.words || String(p.text).split(/\s+/).filter(Boolean).length);
    el.textContent = '';
    for (const tk of tokens(p.text)) {
      if (!tk.word) {
        // A Classics page keeps its paragraphs (a blank line between them).
        if (classic && /\n\s*\n/.test(tk.text)) { const g = document.createElement('span'); g.className = 'rd-para'; el.append(g); continue; }
        el.append(tk.text.includes('\n') ? document.createElement('br') : document.createTextNode(' ')); continue;
      }
      const s = document.createElement('span'); s.className = 'w'; s.dataset.at = tk.start; s.dataset.to = tk.start + tk.text.length; s.textContent = tk.text;
      el.append(s);
    }
  }
  function show(p, { push = true } = {}) {
    stopVoice();
    view = viewOf(p);
    page = view[0];
    const atEnd = page > n;
    stage.hidden = atEnd && !peek; end.hidden = !atEnd || peek;
    root.classList.toggle('is-end', atEnd && !peek);
    if (!atEnd || peek) {
      const pg = bk.pages[Math.min(page, n) - 1], last = Math.min(lastOf(view), n);
      if (pg.image) { img.src = pg.image.src; img.alt = pg.image.alt || ''; if (pg.image.w) { img.width = pg.image.w; img.height = pg.image.h; } }
      if (classic) {
        // A picture page as usual; a text-only page alone (phones) or as an open book (wide screens).
        pic.hidden = !pg.image;
        stage.classList.toggle('is-text', !pg.image);
        stage.classList.toggle('is-spread', view.length === 2);
        leafR.hidden = view.length !== 2;
        folio.textContent = String(page);
        if (view.length === 2) {
          const right = view[1] ? bk.pages[view[1] - 1] : null;
          if (right) drawText(right, text2); else { text2.textContent = ''; text2.dataset.len = 's'; }
          folio2.textContent = right ? String(view[1]) : '';
          leafR.classList.toggle('is-blank', !right);
        }
      }
      drawText(pg);
      const win = dotWindow(n, last);
      dots.classList.toggle('sliding', win.sliding); dots.classList.toggle('more-l', win.from > 0); dots.classList.toggle('more-r', win.to < n);
      [...dots.children].forEach((d, i) => { d.classList.toggle('on', i < last); d.classList.toggle('cur', win.sliding && i === Math.min(last, n) - 1); d.hidden = i < win.from || i >= win.to; });
      count.textContent = view[1] ? t('js.library.pagesOf', { from: page, to: view[1], pages: n }) : t('js.library.pageOf', { page, pages: n });
      prev.setAttribute('aria-disabled', page <= 1 ? 'true' : 'false'); prev.tabIndex = page <= 1 ? -1 : 0;
      prev.href = `?p=${Math.max(1, page - 1)}`; next.href = `?p=${last + 1}`;
      next.innerHTML = '';
      next.append(peek ? `✓ ${t('js.library.backToQuestions')} ` : `${last >= n ? t('js.library.toQuestions') : t('js.library.next')} `);
      if (!peek) { const a = document.createElement('span'); a.className = 'flip'; a.setAttribute('aria-hidden', 'true'); a.textContent = '▶'; next.append(a); }
      for (let k = last + 1; k <= Math.min(n, last + 1); k++) if (bk.pages[k - 1].image) { const pre = new Image(); pre.src = bk.pages[k - 1].image.src; }
      if (last > furthest) furthest = last;
      if (!peek) save();
      if (reading) readPage();
    } else {
      // The last page was read: the questions (and the server hears the book was finished).
      if (furthest >= n) save({ page: n });
      const h = document.getElementById('rd-end-h'); if (h) h.focus({ preventScroll: true });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
    if (push) history.replaceState(null, '', `?p=${page}${location.hash}`);
  }

  prev.addEventListener('click', e => { e.preventDefault(); if (page > 1) show(page - 1); });
  next.addEventListener('click', e => {
    e.preventDefault();
    if (peek) { peek = false; show(n + 1); return; }
    show(lastOf(view) + 1);
  });
  // Turning a tablet or resizing a window can switch between spreads and single pages: draw the same place again.
  if (classic) wideMq.addEventListener('change', () => { if (page <= n || peek) show(page, { push: false }); });
  document.addEventListener('keydown', e => {
    if (e.target.closest('input, textarea, select, [contenteditable]') || e.altKey || e.ctrlKey || e.metaKey) return;
    const rtl = document.documentElement.dir === 'rtl';
    if (stage.hidden) return;
    if (e.key === (rtl ? 'ArrowLeft' : 'ArrowRight')) { e.preventDefault(); next.click(); }
    if (e.key === (rtl ? 'ArrowRight' : 'ArrowLeft')) { e.preventDefault(); prev.click(); }
  });
  // ---- Swiping turns the page (owner, 20 Nov 2026). A finger or pen drags the page along with it and lets go to turn
  // (past 60px, or a quick flick), else the page springs back; a laptop's two-finger trackpad swipe turns it too. The
  // words are English, so a swipe to the left goes forward, as in a paper book. Buttons and links still just tap.
  const still = matchMedia('(prefers-reduced-motion: reduce)');
  const leaves = () => [...stage.children].filter(el => !el.classList.contains('rd-nav') && !el.hidden);
  const slide = (dx, ease = false) => leaves().forEach(el => {
    el.style.transition = ease ? 'transform .18s ease-out, opacity .18s ease-out' : 'none';
    el.style.transform = dx ? `translateX(${dx}px)` : ''; el.style.opacity = dx ? String(Math.max(0.35, 1 - Math.abs(dx) / 600)) : '';
  });
  /** Turn forward or back by the buttons (they know about spreads, the questions and the last page), with a slide. */
  function turn(fwd) {
    const before = page;
    (fwd ? next : prev).click();
    if (still.matches || page === before || stage.hidden) { slide(0); return; }
    slide(fwd ? 48 : -48); requestAnimationFrame(() => requestAnimationFrame(() => slide(0, true)));
  }
  let drag = null;
  stage.addEventListener('pointerdown', e => {
    if (e.pointerType === 'mouse' || !e.isPrimary || e.target.closest('a, button, input')) return;
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY, t: e.timeStamp, dx: 0, on: false };
  });
  stage.addEventListener('pointermove', e => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (!drag.on) {
      if (Math.abs(dy) > 12 && Math.abs(dy) > Math.abs(dx)) { drag = null; return; }   // scrolling the page
      if (Math.abs(dx) < 12) return;
      drag.on = true; try { stage.setPointerCapture(e.pointerId); } catch {}
    }
    drag.dx = dx;
    const atEdge = (dx > 0 && page <= 1);                                                 // nothing before page 1
    if (!still.matches) slide(atEdge ? dx / 4 : dx * 0.6);
  });
  const endDrag = e => {
    if (!drag || e.pointerId !== drag.id) return;
    const { dx, on, t } = drag; drag = null;
    if (!on) return;
    const quick = Math.abs(dx) > 30 && e.timeStamp - t < 250;
    if (e.type === 'pointerup' && (Math.abs(dx) >= 60 || quick) && !(dx > 0 && page <= 1)) turn(dx < 0);
    else slide(0, true);
  };
  stage.addEventListener('pointerup', endDrag);
  stage.addEventListener('pointercancel', endDrag);
  // A trackpad's sideways two-finger swipe: one turn per swipe (its momentum is ignored until it stops).
  let wx = 0, wLock = 0, wIdle = 0;
  stage.addEventListener('wheel', e => {
    if (Math.abs(e.deltaX) <= Math.abs(e.deltaY) || e.ctrlKey) return;
    e.preventDefault();
    clearTimeout(wIdle); wIdle = setTimeout(() => { wx = 0; wLock = 0; }, 180);
    if (wLock) return;
    wx += e.deltaX;
    if (Math.abs(wx) >= 80) { wLock = 1; const fwd = wx > 0; wx = 0; if (fwd || page > 1) turn(fwd); }
  }, { passive: false });

  // ---- Read to me
  let seq = 0, audio = null;
  const ss = window.speechSynthesis;
  const canDevice = !!ss && typeof SpeechSynthesisUtterance === 'function';
  const canAi = aiOn(D.tts, 'en');
  if (canDevice || canAi) aloudBtn.hidden = false;
  const label = aloudBtn.querySelector('span');
  const setBtn = on => { aloudBtn.setAttribute('aria-pressed', on ? 'true' : 'false'); label.textContent = on ? t('js.library.stop') : t('js.library.readToMe'); };
  // The page being read lights up (a spread: the left page, then the right).
  let hlEl = text;
  const clearHl = () => { for (const el of [text, text2].filter(Boolean)) for (const s of el.querySelectorAll('.hl, .hl-s')) s.classList.remove('hl', 'hl-s'); };
  const words = () => [...hlEl.querySelectorAll('.w')];
  const hlWord = at => { clearHl(); const w = words().find(x => +x.dataset.at <= at && at < +x.dataset.to) || words().find(x => +x.dataset.at >= at); if (w) w.classList.add('hl'); };
  const hlSentence = sen => { clearHl(); for (const w of words()) if (+w.dataset.at >= sen.start && +w.dataset.to <= sen.end) w.classList.add('hl-s'); };
  function stopVoice() {
    seq++;
    if (audio) { try { audio.pause(); audio.removeAttribute('src'); } catch { /* ignore */ } }
    try { if (ss) ss.cancel(); } catch { /* ignore */ }
    stopReading();
    clearHl();
  }
  function readPage() {
    const my = ++seq;
    // Every sentence on screen, in reading order: { pnum (its page), s (its number on that page), sen, el }.
    const shown = view.filter(x => x >= 1 && x <= n).map((pnum, k) => ({ pnum, el: k ? text2 : text }));
    const list = shown.flatMap(({ pnum, el }) => sentences(bk.pages[pnum - 1].text).map((sen, s) => ({ pnum, s, sen, el })));
    if (!usedAloud) { usedAloud = true; save(); }
    let ai = canAi;
    const done = () => { if (my !== seq) return; clearHl(); };
    const say = i => {
      if (my !== seq) return;
      if (i >= list.length) return done();
      const { sen, pnum, s, el } = list[i];
      hlEl = el;
      if (ai) {
        // The AI voice: this sentence's audio by its numbers (the server reads the book's words), the next one fetched
        // while this one plays. Any failure: the device voice from here on.
        const body = x => ({ ctx: 'story', book: bk.id, page: x.pnum, s: x.s });
        if (i + 1 < list.length) ttsBlob(body(list[i + 1]), { pre: true }).catch(() => {});
        ttsBlob(body({ pnum, s })).then(blob => {
          if (my !== seq) return;
          const url = URL.createObjectURL(blob);
          if (!audio) audio = new Audio();
          audio.onended = () => { URL.revokeObjectURL(url); say(i + 1); };
          audio.onerror = () => { URL.revokeObjectURL(url); ai = false; say(i); };
          audio.src = url; hlSentence(sen);
          return audio.play();
        }).catch(() => { if (my !== seq) return; ai = false; say(i); });
        return;
      }
      if (!canDevice) return done();
      const u = new SpeechSynthesisUtterance(sen.text);
      u.lang = 'en-US'; const v = deviceVoice('en-US') || deviceVoice('en'); if (v) u.voice = v;
      u.rate = bk.grade === 'k' ? 0.85 : 0.92;
      let bounded = false;
      u.onstart = () => { if (my === seq && !bounded) hlSentence(sen); };
      u.onboundary = e => { if (my !== seq || (e.name && e.name !== 'word')) return; bounded = true; hlWord(sen.start + (e.charIndex || 0)); };
      u.onend = u.onerror = () => say(i + 1);
      ss.speak(u);
    };
    say(0);
  }
  aloudBtn.addEventListener('click', () => {
    if (reading) { reading = false; setBtn(false); stopVoice(); return; }
    unlockAudio();
    try { if (ss) ss.cancel(); } catch { /* ignore */ }
    reading = true; setBtn(true);
    if (page <= n || peek) readPage();
  });
  window.addEventListener('pagehide', stopVoice);

  // ---- the questions
  const solvedFrom = String((D.read && D.read.solved) || '');
  const qs = [...document.querySelectorAll('.rd-q')];
  let firstTry = String((D.read && D.read.marks) || '');
  qs.forEach((li, i) => {
    const opts = [...li.querySelectorAll('.rd-opt')], hint = li.querySelector('.rd-hint');
    if (solvedFrom[i] === '1') { li.classList.add('is-solved'); hint.textContent = `✓ ${t('js.library.answered')}`; return; }
    opts.forEach(b => { b.disabled = false; });
    // Read the question and its answers to me: the AI voice when it is on (the server reads question i by its number),
    // else, or if that fails, the device's voice.
    if (canDevice || canAi) {
      const say = document.createElement('button'); say.type = 'button'; say.className = 'btn btn-sm rd-qread'; say.textContent = `🔊 ${t('js.library.readQuestion')}`;
      const device = my => {
        if (my !== seq || !canDevice) return;
        const u = new SpeechSynthesisUtterance([li.querySelector('h3').textContent, ...opts.map(o => o.textContent)].join('. '));
        u.lang = 'en-US'; const v = deviceVoice('en-US'); if (v) u.voice = v; u.rate = 0.9; ss.speak(u);
      };
      say.addEventListener('click', () => {
        stopVoice(); unlockAudio();
        const my = seq;
        if (!canAi) return device(my);
        ttsBlob({ ctx: 'story', book: bk.id, q: i }).then(blob => {
          if (my !== seq) return;
          const url = URL.createObjectURL(blob);
          if (!audio) audio = new Audio();
          audio.onended = () => URL.revokeObjectURL(url);
          audio.onerror = () => { URL.revokeObjectURL(url); device(my); };
          audio.src = url;
          return audio.play();
        }).catch(() => device(my));
      });
      li.querySelector('h3').after(say);
    }
    opts.forEach(btn => btn.addEventListener('click', async () => {
      if (btn.disabled) return;
      opts.forEach(o => { o.disabled = true; });
      let r;
      try { r = await api(`/api/library/${bk.id}/answer`, { method: 'POST', body: { i, c: +btn.dataset.c, ...(ctx.cl ? { cl: ctx.cl, step: ctx.step } : {}) } }); } catch (e) {
        toast(e.data && e.data.code === 'readFirst' ? t('js.library.readFirst') : e.message, { bad: true });
        opts.forEach(o => { if (!o.classList.contains('no')) o.disabled = false; });
        return;
      }
      hint.textContent = '';
      if (r.right) {
        btn.classList.add('ok'); btn.setAttribute('aria-label', `${btn.textContent} ✓`);
        li.classList.add('is-solved'); hint.textContent = `✓ ${t('js.library.right')}`;
      } else {
        btn.classList.add('no'); btn.setAttribute('aria-label', `${btn.textContent} ✗`);
        opts.forEach(o => { if (!o.classList.contains('no')) o.disabled = false; });
        hint.append(`${t('js.library.tryAgain', { page: r.page })} `);
        const look = document.createElement('button'); look.type = 'button'; look.className = 'btn btn-sm rd-look'; look.textContent = `📖 ${t('js.library.lookAt', { page: r.page })}`;
        look.addEventListener('click', () => { peek = true; show(r.page); window.scrollTo({ top: 0, behavior: 'smooth' }); });
        hint.append(look);
      }
      if (r.done || (!D.signedIn && qs.every(x => x.classList.contains('is-solved')))) finish(r.marks);
    }));
  });
  function finish(marks) {
    if (marks) firstTry = marks;
    const right = [...firstTry].filter(c => c === '1').length;
    const box = document.getElementById('rd-done'); box.hidden = false;
    box.querySelector('.rd-done-msg').textContent = firstTry ? `🎉 ${t('js.library.doneMsg', { right, total: qs.length })}` : `🎉 ${t('js.library.doneShort')}`;
  }
  if (solvedFrom && !solvedFrom.includes('-') && solvedFrom.length === qs.length) finish();

  show(page, { push: false });
}
