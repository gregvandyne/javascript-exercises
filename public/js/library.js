// Story Library reader (server/routes/library.js; docs/decisions.md "Story Library"). One page at a time: the picture,
// big words, Back / Next and page dots; Read to me reads the page and lights up each word as it is spoken (the device's
// voice, with speechSynthesis word boundaries) or each sentence (the AI voice, when it is on for English: it gives no
// word timings). After the last page, 3 questions: a wrong answer says "Try again! Look at page N" and can open that
// page. The server keeps the page reached and checks every answer; the right answers never reach this page.
import { api, pageData, toast } from '/js/app.js';
import { t } from '/js/i18n.js';
import { aiOn, ttsBlob, deviceVoice, unlockAudio, stopReading } from '/js/tts.js';
import { sentences, tokens } from '/js/library-text.js';

const D = pageData();
const root = document.getElementById('reader');
if (root && D.book) start();

function start() {
  const bk = D.book, n = bk.pages.length;
  const $ = id => document.getElementById(id);
  const stage = $('rd-stage'), end = $('rd-end'), img = $('rd-img'), text = $('rd-text');
  const prev = $('rd-prev'), next = $('rd-next'), dots = $('rd-dots'), count = $('rd-count'), aloudBtn = $('rd-aloud');
  const ctx = D.ctx || {};
  let page = Math.min(Math.max(1, D.start || 1), n + 1);
  let peek = false;          // looking back at a page from the questions
  let reading = false;       // Read to me is on
  let usedAloud = !!(D.read && D.read.aloud);
  let furthest = D.read ? D.read.page : 0;

  // ---- saving where the reader got to (signed in only; the server ignores visitors)
  const save = (extra = {}) => {
    if (!D.signedIn) return Promise.resolve();
    return api(`/api/library/${bk.id}/progress`, { method: 'POST', body: { page: Math.min(page, n), aloud: usedAloud, ...(ctx.cl ? { cl: ctx.cl, step: ctx.step } : {}), ...extra } }).catch(() => {});
  };

  // ---- drawing a page
  // How much text the page has sets its type size (CSS .rd-text[data-len]), so the words and the picture fit on one screen.
  const lenOf = words => (words <= 20 ? 's' : words <= 50 ? 'm' : words <= 100 ? 'l' : 'xl');
  function drawText(p) {
    text.dataset.len = lenOf(p.words || String(p.text).split(/\s+/).filter(Boolean).length);
    text.textContent = '';
    for (const tk of tokens(p.text)) {
      if (!tk.word) { text.append(tk.text.includes('\n') ? document.createElement('br') : document.createTextNode(' ')); continue; }
      const s = document.createElement('span'); s.className = 'w'; s.dataset.at = tk.start; s.dataset.to = tk.start + tk.text.length; s.textContent = tk.text;
      text.append(s);
    }
  }
  function show(p, { push = true } = {}) {
    stopVoice();
    page = p;
    const atEnd = page > n;
    stage.hidden = atEnd && !peek; end.hidden = !atEnd || peek;
    root.classList.toggle('is-end', atEnd && !peek);
    if (!atEnd || peek) {
      const pg = bk.pages[Math.min(page, n) - 1];
      img.src = pg.image.src; img.alt = pg.image.alt || ''; if (pg.image.w) { img.width = pg.image.w; img.height = pg.image.h; }
      drawText(pg);
      [...dots.children].forEach((d, i) => d.classList.toggle('on', i < page));
      count.textContent = t('js.library.pageOf', { page, pages: n });
      prev.setAttribute('aria-disabled', page <= 1 ? 'true' : 'false'); prev.tabIndex = page <= 1 ? -1 : 0;
      prev.href = `?p=${Math.max(1, page - 1)}`; next.href = `?p=${page + 1}`;
      next.innerHTML = '';
      next.append(peek ? `✓ ${t('js.library.backToQuestions')} ` : `${page >= n ? t('js.library.toQuestions') : t('js.library.next')} `);
      if (!peek) { const a = document.createElement('span'); a.className = 'flip'; a.setAttribute('aria-hidden', 'true'); a.textContent = '▶'; next.append(a); }
      if (page < n) { const pre = new Image(); pre.src = bk.pages[page].image.src; }
      if (page > furthest) furthest = page;
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
    show(page + 1);
  });
  document.addEventListener('keydown', e => {
    if (e.target.closest('input, textarea, select, [contenteditable]') || e.altKey || e.ctrlKey || e.metaKey) return;
    const rtl = document.documentElement.dir === 'rtl';
    if (stage.hidden) return;
    if (e.key === (rtl ? 'ArrowLeft' : 'ArrowRight')) { e.preventDefault(); next.click(); }
    if (e.key === (rtl ? 'ArrowRight' : 'ArrowLeft')) { e.preventDefault(); prev.click(); }
  });
  // A swipe across the picture turns the page.
  let sx = null, sy = null;
  stage.addEventListener('touchstart', e => { const p = e.changedTouches[0]; sx = p.clientX; sy = p.clientY; }, { passive: true });
  stage.addEventListener('touchend', e => {
    if (sx === null) return; const p = e.changedTouches[0], dx = p.clientX - sx, dy = p.clientY - sy; sx = null;
    if (Math.abs(dx) < 60 || Math.abs(dy) > Math.abs(dx) * 0.7 || e.target.closest('a, button')) return;
    const fwd = (dx < 0) !== (document.documentElement.dir === 'rtl');
    (fwd ? next : prev).click();
  }, { passive: true });

  // ---- Read to me
  let seq = 0, audio = null;
  const ss = window.speechSynthesis;
  const canDevice = !!ss && typeof SpeechSynthesisUtterance === 'function';
  const canAi = aiOn(D.tts, 'en');
  if (canDevice || canAi) aloudBtn.hidden = false;
  const label = aloudBtn.querySelector('span');
  const setBtn = on => { aloudBtn.setAttribute('aria-pressed', on ? 'true' : 'false'); label.textContent = on ? t('js.library.stop') : t('js.library.readToMe'); };
  const clearHl = () => { for (const s of text.querySelectorAll('.hl, .hl-s')) s.classList.remove('hl', 'hl-s'); };
  const words = () => [...text.querySelectorAll('.w')];
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
    const pg = bk.pages[Math.min(page, n) - 1], list = sentences(pg.text), pnum = Math.min(page, n);
    if (!usedAloud) { usedAloud = true; save(); }
    let ai = canAi;
    const done = () => { if (my !== seq) return; clearHl(); };
    const say = i => {
      if (my !== seq) return;
      if (i >= list.length) return done();
      const sen = list[i];
      if (ai) {
        // The AI voice: this sentence's audio by its numbers (the server reads the book's words), the next one fetched
        // while this one plays. Any failure: the device voice from here on.
        const body = s => ({ ctx: 'story', book: bk.id, page: pnum, s });
        if (i + 1 < list.length) ttsBlob(body(i + 1), { pre: true }).catch(() => {});
        ttsBlob(body(i)).then(blob => {
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
