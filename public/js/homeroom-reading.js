// Reading from the desk (docs/decisions.md "Homeroom: reading from the desk"; server: services/homeroom-reading.js,
// routes/homeroom.js /api/desk/<class>/reading/..., the books from GET /api/library/books).
//   - bookPicker(): the Story Library's books as covers, the class's grade first (chips for every grade and all), and a
//     search box. The student's Library (the dock) and the teacher's "Choose a book" (the board's panel) both use it.
//   - readingLayer(): on the student's desk, a layer like the in-desk game player (the desk underneath keeps Raise hand,
//     Pause screens, the lock and its poll). Two ways in:
//       Library (the dock): pick any book and read it with the library's own reader in a frame (Read to me and all);
//         no quiz is asked for. While it is open the desk's pulse says "Reading <book>" for the teacher's board.
//       A Reading handout (its card): the routine's steps, Read, Quiz, 3 notes, one after the other. A free choice first
//         picks its book. The quiz is the server's (it checks every answer; a wrong one says which page to look at, and
//         that page opens). The 3 notes go to one page of the student's notebook, in the class's tab, named after the book.
//     The student's supports: Bigger text (the layer and the reader), Read aloud (Read to me beside each question and
//     note prompt; the reader's own Read to me stands out). The address says what is open (#library, #read=<handout>),
//     so a reload opens it again and Back closes it.
import { t, api, toast, esc } from '/js/app.js';
import { iconHtml } from '/js/icons.js';
import { readBtn, wireRead, bigText } from '/js/homeroom-support.js';
import { drawPadHtml, drawPad } from '/js/homeroom-drawpad.js';

const tr = (k, v) => t(`js.homeroom-reading.${k}`, v);
export const GRADES = ['k', '1', '2', '3', '4-5'];
const gradeKey = g => `grade${String(g).replace('-', '')}`;

/**
 * A book picker in host. opts: { grade: the grade to start on (null: all), onPick(book), pickLabel(book): the button's
 * label for a screen reader }. -> { load() }
 */
export function bookPicker(host, { grade = null, onPick, pickLabel = b => b.title } = {}) {
  const P = { grade: GRADES.includes(grade) ? grade : '', q: '', list: [], seq: 0 };
  host.innerHTML = `<div class="rdp">
    <div class="rdp-tools"><div class="chips scroll rdp-grades" role="group" aria-label="${esc(tr('grades'))}"></div>
      <label class="sr-only" for="rdp-q">${esc(tr('search'))}</label><input class="input rdp-q" id="rdp-q" type="search" maxlength="60" placeholder="🔎 ${esc(tr('searchPh'))}" autocomplete="off"></div>
    <p class="sr-only" role="status" id="rdp-status"></p><ul class="rdp-grid" id="rdp-grid"><li class="rdp-loading muted">${esc(tr('loading'))}</li></ul></div>`;
  const chips = host.querySelector('.rdp-grades'), grid = host.querySelector('.rdp-grid'), qIn = host.querySelector('.rdp-q');
  const drawChips = () => {
    chips.innerHTML = [['', tr('allGrades')], ...GRADES.map(g => [g, tr(gradeKey(g))])].map(([g, label]) => `<button type="button" class="chip${P.grade === g ? ' on' : ''}" data-rdgrade="${g}" aria-pressed="${P.grade === g}">${esc(label)}</button>`).join('');
    // the grade picked in view where the chips scroll sideways (a phone)
    const on = chips.querySelector('.on');
    if (on && chips.scrollWidth > chips.clientWidth) requestAnimationFrame(() => { chips.scrollLeft = Math.max(0, on.offsetLeft - (chips.clientWidth - on.offsetWidth) / 2); });
  };
  const draw = () => {
    host.querySelector('#rdp-status').textContent = tr('found', { count: P.list.length });
    grid.innerHTML = P.list.length ? P.list.map(b => `<li><button type="button" class="rdp-book" data-rdbook="${esc(b.id)}" aria-label="${esc(pickLabel(b))}">
        <img src="${esc(b.cover)}" alt="" width="${+b.w || 440}" height="${+b.h || 330}" loading="lazy"><b dir="auto">${esc(b.title)}</b><span class="small muted">${esc(tr('pagesN', { count: b.pages }))}</span></button></li>`).join('')
      : `<li class="rdp-none muted">${esc(tr('none'))}</li>`;
  };
  async function load() {
    const my = ++P.seq;
    try {
      const r = await api(`/api/library/books?grade=${encodeURIComponent(P.grade)}&q=${encodeURIComponent(P.q)}`, { background: true });
      if (my !== P.seq) return;
      P.list = r.books || []; draw();
    } catch (e) { if (my === P.seq) grid.innerHTML = `<li class="rdp-none">${esc(e.message)}</li>`; }
  }
  chips.addEventListener('click', e => { const b = e.target.closest('[data-rdgrade]'); if (!b) return; P.grade = b.dataset.rdgrade; drawChips(); load(); });
  let timer = null;
  qIn.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(() => { P.q = qIn.value.trim(); load(); }, 250); });
  grid.addEventListener('click', e => { const b = e.target.closest('[data-rdbook]'); if (!b) return; const bk = P.list.find(x => x.id === b.dataset.rdbook); if (bk && onPick) onPick(bk); });
  drawChips(); load();
  return { load };
}

// ---------------------------------------------------------------- the desk's reading layer
const STEP_ORDER = ['read', 'quiz', 'notes'], STEP_ICON = { read: '📖', quiz: '🧩', notes: '📝' };
/**
 * opts: { host, classId, path (the desk's address), grade (the class's library grade), sup: () => supports | null,
 * card: id -> the desk card | null, onOpen(), onClose(), onChange() (the routine moved on: the desk asks for its cards) }.
 * -> { openLibrary(), openRoutine(id), close(), sync(), pulse(): what the desk's pulse says while open | null, current() }
 */
export function readingLayer(opts) {
  const R = { el: null, kind: null, id: null, v: null, sub: null, book: null, page: 0, quiz: null, peek: 0, busy: false };
  const base = `/api/desk/${encodeURIComponent(opts.classId)}/reading`;
  const sup = () => (opts.sup && opts.sup()) || {};
  const plain = () => location.pathname + location.search;
  const hashOf = () => { const m = /^#(library|read=([^&]{1,120}))$/.exec(location.hash); if (!m) return null; try { return m[1] === 'library' ? { kind: 'library' } : { kind: 'routine', id: decodeURIComponent(m[2]) }; } catch { return null; } };
  const onPage = () => location.pathname.replace(/\/+$/, '') === opts.path;

  // ---- the layer itself
  function mount(title) {
    if (!R.el) {
      R.el = document.createElement('div');
      R.el.className = 'hr-player hd-rd'; R.el.setAttribute('role', 'region');
      R.el.innerHTML = `<div class="hr-playtop hd-rdtop"><button type="button" class="btn hr-chunk hr-playback" data-rd="close"><span class="flip" aria-hidden="true">←</span> <span class="hd-rdhide">${esc(tr('backToDesk'))}</span><span class="hd-rdshort">${esc(tr('myDesk'))}</span></button>
        <span class="hr-playt" dir="auto" id="hd-rdtitle"></span><span id="hd-rdextra"></span></div><div class="hd-rdbody" id="hd-rdbody"></div>`;
      R.el.addEventListener('click', click);
      R.el.addEventListener('submit', submit);
      wireRead(R.el);
      opts.host.appendChild(R.el);
      if (opts.onOpen) opts.onOpen();
      R.el.querySelector('[data-rd="close"]').focus({ preventScroll: true });
    }
    bigText(R.el, sup().big);
    R.el.setAttribute('aria-label', title);
    R.el.querySelector('#hd-rdtitle').innerHTML = title;
  }
  const bodyEl = () => R.el && R.el.querySelector('#hd-rdbody');
  const extraEl = () => R.el && R.el.querySelector('#hd-rdextra');
  function hide(notify = true) {
    if (!R.el) return;
    R.el.remove(); R.el = null;
    Object.assign(R, { kind: null, id: null, v: null, sub: null, book: null, page: 0, quiz: null, peek: 0 });
    if (notify && opts.onClose) opts.onClose();
  }
  function push(hash) { if (location.hash !== hash) history.pushState({ ...(history.state || {}), hrread: hash }, '', `${plain()}${hash}`); }
  function close() {
    if (!R.el) return;
    if (history.state && history.state.hrread && location.hash === history.state.hrread) { history.back(); return; }
    hide();
    if (hashOf()) history.replaceState(history.state, '', plain());
  }

  // ---- the reader (the library's own, in a frame)
  const readerSrc = (bookId, page, routine) => `/library/${encodeURIComponent(bookId)}/read?in=hr${routine ? '&hr=1' : ''}&p=${Math.max(1, page || 1)}${sup().big ? '&big=1' : ''}${sup().read ? '&aloud=1' : ''}`;
  function readerHtml(book, page, routine) {
    return `<iframe class="hr-playframe hd-rdframe" src="${esc(readerSrc(book.id, page, routine))}" title="${esc(book.title)}" allow="autoplay"></iframe>`;
  }
  const frame = () => R.el && R.el.querySelector('.hd-rdframe');

  // ---- Library: any book, no quiz asked for
  function showLibrary() {
    R.kind = 'library'; R.sub = 'pick'; R.book = null; R.page = 0;
    mount(`${iconHtml('📚', { size: 20 })} <b>${esc(tr('library'))}</b>`);
    extraEl().innerHTML = '';
    const b = bodyEl();
    b.innerHTML = `<div class="hd-rdpad"><p class="hd-rdlead">${esc(tr('libraryLead'))}</p><div id="hd-rdpick"></div></div>`;
    bookPicker(b.querySelector('#hd-rdpick'), { grade: opts.grade, onPick: readFree, pickLabel: bk => tr('readBook', { title: bk.title }) });
  }
  function readFree(bk) {
    R.sub = 'read'; R.book = { id: bk.id, title: bk.title, cover: bk.cover, pages: bk.pages }; R.page = 1;
    mount(`${iconHtml('📖', { size: 20 })} <b>${esc(bk.title)}</b>`);
    extraEl().innerHTML = `<button type="button" class="btn hr-chunk" data-rd="books" aria-label="${esc(tr('moreBooks'))}">${iconHtml('📚', { size: 18 })} <span class="hd-rdhide">${esc(tr('moreBooks'))}</span></button>`;
    bodyEl().innerHTML = readerHtml(R.book, 1, false);
  }

  // ---- a Reading handout: the routine
  const stepsHtml = v => {
    const at = v.step === 'done' ? 3 : Math.max(0, STEP_ORDER.indexOf(v.step === 'choose' ? 'read' : v.step));
    return `<ol class="hd-rdsteps" aria-label="${esc(tr('steps'))}">${STEP_ORDER.map((k, i) => `<li class="${i < at ? 'done' : i === at ? 'on' : ''}"${i === at ? ' aria-current="step"' : ''}>${i < at ? '<span aria-hidden="true">✓</span>' : iconHtml(STEP_ICON[k], { size: 16 })} ${esc(tr(`step.${k}`))}</li>`).join('')}</ol>`;
  };
  async function openRoutineView(id) {
    let v;
    try { v = await api(`${base}/${encodeURIComponent(id)}`); } catch (e) { toast(e.message, { bad: true }); hide(); if (hashOf()) history.replaceState(history.state, '', plain()); return; }
    R.kind = 'routine'; R.id = id; R.v = v;
    drawRoutine();
  }
  function drawRoutine() {
    const v = R.v;
    R.book = v.book; R.page = v.page;
    mount(`${iconHtml('📖', { size: 20 })} <b>${esc(v.book ? v.book.title : v.title)}</b>`);
    extraEl().innerHTML = stepsHtml(v);
    const b = bodyEl();
    const ins = v.instructions ? `<p class="hd-rdins" dir="auto"><b>${esc(tr('teacherSays'))}</b> ${esc(v.instructions)} ${sup().read ? readBtn(v.instructions, { small: true }) : ''}</p>` : '';
    if (v.step === 'choose') {
      R.sub = 'choose';
      b.innerHTML = `<div class="hd-rdpad">${ins}<h2 class="hd-rdh">${iconHtml('📚', { size: 24 })} ${esc(tr('chooseTitle'))}</h2><p class="hd-rdlead">${esc(tr('chooseLead'))}</p><div id="hd-rdpick"></div></div>`;
      bookPicker(b.querySelector('#hd-rdpick'), { grade: opts.grade, onPick: chooseBook, pickLabel: bk => tr('pickBook', { title: bk.title }) });
      return;
    }
    if (v.step === 'read') {
      R.sub = 'read';
      b.innerHTML = `${ins ? `<div class="hd-rdinsbar">${ins}${v.any ? `<button type="button" class="btn btn-sm" data-rd="rechoose">${esc(tr('otherBook'))}</button>` : ''}</div>` : v.any ? `<div class="hd-rdinsbar"><span></span><button type="button" class="btn btn-sm" data-rd="rechoose">${esc(tr('otherBook'))}</button></div>` : ''}${readerHtml(v.book, Math.min(v.page || 1, v.pages), true)}`;
      return;
    }
    if (v.step === 'quiz') { R.sub = 'quiz'; drawQuiz(); return; }
    if (v.step === 'notes') { R.sub = 'notes'; drawNotes(); return; }
    R.sub = 'done'; drawDone();
  }
  async function chooseBook(bk) {
    if (R.busy) return; R.busy = true;
    try { R.v = await api(`${base}/${encodeURIComponent(R.id)}`, { method: 'POST', body: { action: 'choose', bookId: bk.id } }); drawRoutine(); if (opts.onChange) opts.onChange(); }
    catch (e) { toast(e.message, { bad: true }); } finally { R.busy = false; }
  }
  // the reader's page turns (from its frame): the routine keeps the furthest page; the last page finishes Read
  let saving = null;
  async function readerPage(m) {
    if (!R.book || m.book !== R.book.id) return;
    R.page = m.page;
    if (R.kind !== 'routine' || R.sub !== 'read') return;
    const body = { action: 'progress', page: m.page, aloud: !!m.aloud };
    const go = async () => {
      try {
        const v = await api(`${base}/${encodeURIComponent(R.id)}`, { method: 'POST', body, background: true });
        const was = R.v && R.v.step; R.v = v;
        if (was !== v.step && opts.onChange) opts.onChange();
        if (R.el) extraEl().innerHTML = stepsHtml(v);
      } catch { /* the next page turn tries again */ }
    };
    saving = (saving || Promise.resolve()).then(go);
    return saving;
  }

  // ---- the quiz
  async function drawQuiz() {
    const b = bodyEl();
    b.innerHTML = `<div class="hd-rdpad"><p class="muted">${esc(tr('quizLoading'))}</p></div>`;
    let qz;
    try { qz = await api(`${base}/${encodeURIComponent(R.id)}/quiz`); } catch (e) { b.innerHTML = `<div class="hd-rdpad"><p class="notice warn">${esc(e.message)}</p></div>`; return; }
    if (!R.el || R.sub !== 'quiz') return;
    R.quiz = qz;
    const solved = String(qz.solved || '');
    const read = sup().read;
    b.innerHTML = `<div class="hd-rdpad hd-rdquiz"><h2 class="hd-rdh">${iconHtml('🧩', { size: 24 })} ${esc(tr('quizTitle'))}</h2><p class="hd-rdlead">${esc(tr('quizLead', { count: qz.items.length }))}</p>
      <ol class="hd-rdqs">${qz.items.map((x, i) => `<li class="hd-rdq${solved[i] === '1' ? ' is-solved' : ''}" data-q="${i}"><h3 dir="auto"><span>${i + 1}.</span> ${esc(x.q)}</h3>${read ? readBtn([x.q, ...x.choices].join('. '), { small: true }) : ''}
        <div class="hd-rdopts">${x.choices.map((c, k) => `<button type="button" class="hd-rdopt" data-qa="${i}:${k}"${solved[i] === '1' ? ' disabled' : ''} dir="auto">${esc(c)}</button>`).join('')}</div>
        <p class="hd-rdhint" role="status">${solved[i] === '1' ? `✓ ${esc(tr('right'))}` : ''}</p></li>`).join('')}</ol></div>`;
    b.querySelector('.hd-rdq:not(.is-solved) .hd-rdopt')?.focus({ preventScroll: true });
  }
  async function answer(i, k, btnEl) {
    if (R.busy) return; R.busy = true;
    const li = btnEl.closest('.hd-rdq'), opts2 = [...li.querySelectorAll('.hd-rdopt')], hint = li.querySelector('.hd-rdhint');
    opts2.forEach(o => { o.disabled = true; });
    try {
      const r = await api(`${base}/${encodeURIComponent(R.id)}`, { method: 'POST', body: { action: 'answer', i, c: k } });
      if (r.right) { btnEl.classList.add('ok'); li.classList.add('is-solved'); hint.innerHTML = `✓ ${esc(tr('right'))}`; }
      else {
        btnEl.classList.add('no'); opts2.forEach(o => { if (!o.classList.contains('no')) o.disabled = false; });
        hint.innerHTML = r.page ? `${esc(tr('tryAgainPage', { page: r.page }))} <button type="button" class="btn btn-sm" data-rdlook="${r.page}">${iconHtml('📖', { size: 16 })} ${esc(tr('lookAt', { page: r.page }))}</button>` : esc(tr('tryAgain'));
      }
      if (r.done) {
        R.v = await api(`${base}/${encodeURIComponent(R.id)}`);
        if (opts.onChange) opts.onChange();
        const s = r.score || { right: 0, total: 0 };
        toast(tr('quizDone', { right: s.right, total: s.total }));
        setTimeout(() => { if (R.el && R.kind === 'routine') drawRoutine(); }, 900);
      }
    } catch (e) { toast(e.message, { bad: true }); opts2.forEach(o => { if (!o.classList.contains('ok')) o.disabled = li.classList.contains('is-solved'); }); }
    finally { R.busy = false; }
  }
  /** A wrong answer's page, opened in the reader; Back to the quiz brings the questions again (the answers are kept). */
  function look(page) {
    R.sub = 'peek';
    extraEl().innerHTML = `<button type="button" class="btn btn-primary hr-chunk" data-rd="backquiz">${iconHtml('🧩', { size: 18 })} ${esc(tr('backToQuiz'))}</button>`;
    bodyEl().innerHTML = readerHtml(R.book, page, true);
  }

  // ---- K-2's notes (step 4c): draw what happened, tap how you liked it, and a word from the book if you want
  const FEELS = [['love', '❤️'], ['like', '🙂'], ['ok', '😌']];
  const k2t = (k, v) => tr(`k2.${k}`, v), drt = (k, v) => tr(`draw.${k}`, v);
  const padWords = { pens: drt('pens'), pen: v => drt('pen', v), undo: drt('undo'), clear: drt('clear'), label: k2t('drawLabel') };
  function drawK2Notes() {
    const b = bodyEl(), read = sup().read;
    const ask = (k, icon, extra = '') => `<h3 class="hd-k2q">${iconHtml(icon, { size: 26 })} <span>${esc(k2t(`${k}`))}</span>${read ? readBtn(k2t(`${k}`), { small: true }) : ''}${extra}</h3>`;
    b.innerHTML = `<form class="hd-rdpad hd-rdnotes hd-k2notes" novalidate><h2 class="hd-rdh">${iconHtml('📝', { size: 28 })} ${esc(k2t('title'))}</h2>
      <div class="hd-k2part">${ask('draw', '🖍️')}${drawPadHtml({ id: 'rdk2', words: padWords })}</div>
      <fieldset class="hd-k2part hd-k2feel"><legend class="sr-only">${esc(k2t('feel'))}</legend>${ask('feel', '🤔')}
        <div class="hd-k2feels">${FEELS.map(([k, ic]) => `<label class="hd-k2feelb"><input type="radio" name="feel" value="${k}"><span aria-hidden="true">${iconHtml(ic, { size: 56 })}</span><b>${esc(k2t(`feels.${k}`))}</b></label>`).join('')}</div></fieldset>
      <div class="hd-k2part">${ask('word', '🔤')}<label class="sr-only" for="hd-rdk2word">${esc(k2t('word'))}</label><input class="input hd-k2word" id="hd-rdk2word" name="word" maxlength="40" autocomplete="off" placeholder="${esc(k2t('wordPh'))}"></div>
      <p class="err" id="hd-rdnerr" aria-live="polite"></p>
      <div class="row hd-rdacts"><button class="btn btn-primary btn-big" type="submit">${iconHtml('📒', { size: 22 })} ${esc(k2t('save'))}</button></div>
      <p class="small muted">${esc(tr('notesPrivacy'))}</p></form>`;
    R.pad = drawPad(b, { max: { strokes: 80, points: 400, total: 8000 }, full: () => toast(k2t('padFull'), { bad: true }) });
  }
  async function submitK2(f) {
    const err = f.querySelector('#hd-rdnerr'), strokes = R.pad ? R.pad.strokes() : [], feel = f.querySelector('input[name="feel"]:checked');
    if (!strokes.length) { err.textContent = k2t('drawFirst'); return; }
    if (!feel) { err.textContent = k2t('pickFeel'); f.querySelector('input[name="feel"]').focus(); return; }
    R.busy = true; const okBtn = f.querySelector('[type="submit"]'); okBtn.disabled = true;
    try {
      R.v = await api(`${base}/${encodeURIComponent(R.id)}`, { method: 'POST', body: { action: 'notes', notes: { k2: { drawing: strokes, feel: feel.value, word: f.querySelector('[name="word"]').value } } } });
      R.pad = null;
      if (opts.onChange) opts.onChange();
      drawRoutine();
    } catch (e2) { err.textContent = e2.message; okBtn.disabled = false; } finally { R.busy = false; }
  }

  // ---- the 3 notes
  function drawNotes() {
    if (opts.k2 && opts.k2()) { drawK2Notes(); return; }
    const b = bodyEl(), read = sup().read, max = 300;
    const field = k => `<div class="hd-rdnote"><label class="hr-label" for="hd-rdn-${k}">${iconHtml({ happened: '🎬', word: '🔤', think: '💭' }[k], { size: 20 })} ${esc(tr(`notes.${k}`))}</label>${read ? readBtn(`${tr(`notes.${k}`)}. ${tr(`notes.${k}Hint`)}`, { small: true }) : ''}
      <p class="small muted" id="hd-rdh-${k}">${esc(tr(`notes.${k}Hint`))}</p><textarea class="input" id="hd-rdn-${k}" name="${k}" rows="2" maxlength="${max}" aria-describedby="hd-rdh-${k}" required></textarea></div>`;
    b.innerHTML = `<form class="hd-rdpad hd-rdnotes" novalidate><h2 class="hd-rdh">${iconHtml('📝', { size: 24 })} ${esc(tr('notesTitle'))}</h2><p class="hd-rdlead">${esc(tr('notesLead', { title: R.book ? R.book.title : '' }))}</p>
      ${['happened', 'word', 'think'].map(field).join('')}<p class="err" id="hd-rdnerr" aria-live="polite"></p>
      <div class="row hd-rdacts"><button class="btn btn-primary btn-big" type="submit">${iconHtml('📒', { size: 18 })} ${esc(tr('saveNotes'))}</button></div>
      <p class="small muted">${esc(tr('notesPrivacy'))}</p></form>`;
    b.querySelector('textarea')?.focus({ preventScroll: true });
  }
  async function submit(e) {
    const f = e.target.closest('.hd-rdnotes'); if (!f) return;
    e.preventDefault();
    if (R.busy) return;
    if (f.classList.contains('hd-k2notes')) { submitK2(f); return; }
    const notes = Object.fromEntries(['happened', 'word', 'think'].map(k => [k, f.querySelector(`[name="${k}"]`).value]));
    const empty = Object.keys(notes).find(k => !notes[k].trim());
    const err = f.querySelector('#hd-rdnerr');
    if (empty) { err.textContent = tr('noteEmpty'); f.querySelector(`[name="${empty}"]`).focus(); return; }
    R.busy = true; const okBtn = f.querySelector('[type="submit"]'); okBtn.disabled = true;
    try {
      R.v = await api(`${base}/${encodeURIComponent(R.id)}`, { method: 'POST', body: { action: 'notes', notes } });
      if (opts.onChange) opts.onChange();
      drawRoutine();
    } catch (e2) { err.textContent = e2.message; okBtn.disabled = false; } finally { R.busy = false; }
  }
  function drawDone() {
    const v = R.v;
    bodyEl().innerHTML = `<div class="hd-rdpad hd-rddone"><p class="hd-rdbig" aria-hidden="true">${iconHtml('🎉', { size: 56 })}</p><h2 class="hd-rdh">${esc(tr('doneTitle'))}</h2>
      <p class="hd-rdlead">${esc(tr('doneLead', { title: v.book ? v.book.title : '' }))}</p>
      <div class="row hd-rdacts">${v.notes ? `<button type="button" class="btn" data-rd="notebook">${iconHtml('📒', { size: 18 })} ${esc(tr('openNotes'))}</button>` : ''}<button type="button" class="btn btn-primary" data-rd="close">${iconHtml('🎒', { size: 18 })} ${esc(tr('backToDesk'))}</button></div></div>`;
  }

  // ---- input
  function click(e) {
    const qa = e.target.closest('[data-qa]');
    if (qa && !qa.disabled) { const [i, k] = qa.dataset.qa.split(':').map(Number); answer(i, k, qa); return; }
    const lk = e.target.closest('[data-rdlook]'); if (lk) { look(+lk.dataset.rdlook); return; }
    const a = e.target.closest('[data-rd]'); if (!a) return;
    const k = a.dataset.rd;
    if (k === 'close') close();
    else if (k === 'books') showLibrary();
    else if (k === 'backquiz') { R.sub = 'quiz'; extraEl().innerHTML = stepsHtml(R.v); drawQuiz(); }
    else if (k === 'rechoose') { R.v = { ...R.v, step: 'choose' }; drawRoutine(); }
    else if (k === 'notebook') window.dispatchEvent(new CustomEvent('notebook:open', { detail: { classId: opts.classId, handout: R.id } }));
  }
  addEventListener('message', e => {
    const f = frame();
    if (!f || e.source !== f.contentWindow || e.origin !== location.origin || !e.data || typeof e.data !== 'object') return;
    const m = e.data;
    if (m.type === 'hr:close') close();
    else if (m.type === 'hr:page' || m.type === 'hr:end') readerPage(m);
    else if (m.type === 'hr:go') {
      if (m.to === 'library') showLibrary();
      else if (m.to === 'quiz' && R.kind === 'routine') (saving || Promise.resolve()).then(async () => { if (R.v.step === 'read') { try { R.v = await api(`${base}/${encodeURIComponent(R.id)}`); } catch { /* shown below */ } } drawRoutine(); });
    }
  });
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape' || !R.el || document.querySelector('.sheet-bg, dialog[open], .nb:not([hidden])')) return;
    e.preventDefault(); e.stopImmediatePropagation(); close();
  }, true);

  // ---- the address
  function openLibrary() { showLibrary(); push('#library'); }
  function openRoutine(id) { openRoutineView(id); push(`#read=${encodeURIComponent(id)}`); }
  function sync() {
    if (!onPage()) return;
    const h = hashOf();
    if (!h) { if (R.el) hide(); return; }
    if (h.kind === 'library' && R.kind !== 'library') showLibrary();
    else if (h.kind === 'routine' && (R.kind !== 'routine' || R.id !== h.id)) openRoutineView(h.id);
  }
  addEventListener('popstate', sync);
  return {
    openLibrary, openRoutine, close, sync,
    current: () => (R.el ? { kind: R.kind, id: R.id } : null),
    /** What the desk's pulse says while the layer is open: reading a book (which, which page), on a handout or freely. */
    pulse: () => (R.el && R.book ? { where: 'reading', on: R.kind === 'routine' ? R.id : '', book: R.book.id, page: R.page || 0 } : null),
    /** The supports changed (the desk's poll): the layer's text size follows. */
    restyle: () => { if (R.el) bigText(R.el, sup().big); },
  };
}
