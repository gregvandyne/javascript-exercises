// A student's desk in Homeroom (docs/homeroom.md "The student desk"; docs/decisions.md "Homeroom, step 1b"; server:
// routes/homeroom.js /class/:id/desk, services/homeroom.js). Step 1b:
//   - the desk with their name and their group's color, and their handouts (step 2a) as cards in the order the teacher
//     handed them out: the first unfinished one is "Next up"; an In order card after an unfinished one shows "🔒 Later"
//     and does not open; the teacher's instructions in yellow on the card; tapping opens the game (its Back goes to
//     this desk); a finished card fades with a check. "Nothing on your desk yet" when there are none. The cards come
//     again with the desk's poll when they changed (hv);
//   - a doodle and working-out pad (finger, pencil or mouse), saved for them in this class (POST /api/desk/<class>/doodle,
//     cleaned and limited on the server);
//   - a small read-only window on the teacher's area (public/js/homeroom-area.js), kept fresh by asking
//     GET /api/desk/<class>/state every few seconds (the area comes only when it changed);
//   - the dock: My desk, Teacher's area (full screen), Library, See the room (every desk where the teacher seated it,
//     names only, no work);
//   - live class: Bring everyone to me shows every desk the teacher's area ("Your teacher is showing this"), Pause
//     screens shows "Eyes on your teacher". Students only read the live state; only the class's teachers change it.
//   - step 2c: a team desk (students who share one desk): "Team: names" on the desk, one shared pad any member draws on
//     (the poll brings a teammate's strokes; a save that crossed one adds this desk's new strokes to theirs), the team
//     desk once in See the room; and the teacher's comment and sticker on a finished card (only this student's own).
//   - step 3a, live class: the big yellow Raise hand (I have a question, I need help, Bathroom through the hall pass:
//     "You're next", "Go ahead" with the pass timer, I'm back; tap again to put it down), the desk's lock ("Your teacher
//     locked your desk for a moment"), "Your teacher is coming over", a team pad's teammates' cursors, and the pulse
//     (public/js/homeroom-pulse.js) that tells the teacher's board what this desk is doing (never keys or words).
//   - step 3c, their supports (public/js/homeroom-support.js; only their own): Read to me beside the teacher's words,
//     Bigger text, the simpler wording in place of the instructions (from the server), and with extra time their own
//     longer clock for the plan's part on now ("Your time"). Shown as tools, never a label; See the room shows nobody's.
//   - step 4a, the notebook (public/js/notebook.js; docs/decisions.md "Homeroom: the notebook"): Notebook, the dock's last
//     button, and Notes under each handout card (its page in this class's tab of the notebook, named after it).
//   - step 4b, reading (public/js/homeroom-reading.js; docs/decisions.md "Homeroom: reading from the desk"): the dock's
//     Library opens the Story Library in a layer on the desk (any book, read with the library's reader; the board sees
//     "Reading <book>" while class is live), and a Reading handout's card opens its routine there: Read, Quiz, 3 notes.
//   - step 4c (docs/decisions.md "Homeroom: K-2 mode, absent and at home"): K-2 mode (S.k2, from the class's grade or the
//     teacher's setting): bigger targets and text, a picture with every label, one thing at a time ("Next up" as one big
//     picture with a big Start, the rest as picture tiles), Read to me on every card, Raise hand as three big pictures;
//     "Missed while you were out" (handouts given on a day they were marked absent, with the teacher's words); at home
//     (marked At home, or no live class) no hand or hall pass, and Ask my teacher sends a question the teacher sees in
//     Hands (pictures in K-2, a few words otherwise).
//   - due dates (docs/decisions.md "Homeroom: week plans, due dates, copying plans"; public/js/homeroom-due.js): "Due Fri"
//     on a card, never late; without In order the server sorts the cards by when they are due (Next up is the soonest).
//   - a shared device (step 1c: signed in with the class sign-in, D.device): "Not you? Switch" signs out and goes back to
//     the names (POST /api/desk/<class>/switch), and when the teacher ends class (the sign-in ends) the desk goes to the
//     sign-in page.
import { t, api, toast, esc, pageData } from '/js/app.js';
import { iconHtml } from '/js/icons.js';
import { inkLine } from '/js/board-ann.js';
import { areaHtml, fitAreas } from '/js/homeroom-area.js';
import { AREA, DESK, TEAM_DESK, frameOf, tdeskOf } from '/js/homeroom-seats.js';
import { roomInk } from '/js/homeroom-ink.js';
import { splitObjects, shapeSvg, strokeSvg, drawings, noteHtml, textHtml } from '/js/board-shapes.js';
import { eraseStrokes } from '/js/board-erase.js';
import { roomPen } from '/js/homeroom-marks.js';
import { nowNextHtml } from '/js/homeroom-plan.js';
import { startPulse } from '/js/homeroom-pulse.js';
import { gamePlayer } from '/js/homeroom-player.js';
import { liveDesk as liveDeskGame } from '/js/homeroom-livegame.js';
import { readBtn, wireRead, bigText } from '/js/homeroom-support.js';
import { clock as planClock } from '/js/homeroom-plan-time.js';
import { readingLayer } from '/js/homeroom-reading.js';
import { dueLabel } from '/js/homeroom-due.js';
import { deskIntro } from '/js/homeroom-intro.js';

const D = pageData();
const P = D.doodle || { w: 900, h: 600, strokes: 150, points: 400, total: 15000, colors: ['#141414'] };
const td = (k, v) => t(`js.homeroom-desk.${k}`, v);
const $ = id => document.getElementById(id);
const btn = (cls, attrs, label) => `<button type="button" class="${cls}" ${attrs}>${label}</button>`;
const S = {
  cards: Array.isArray(D.cards) ? D.cards : [], hv: null,
  live: null, area: {}, v: null, view: 'desk', strokes: Array.isArray(D.strokes) ? D.strokes : [], hist: [], pen: P.colors[0],
  // the pad's pen or eraser (public/js/board-erase.js): the eraser takes only what it passes over; its size (S, M, L).
  // (Never S.tool: that is the Manipulatives tool open on the desk, which the pulse reports as where: tool.)
  padTool: 'pen', eraser: 'M', tool: '',
  cur: null, penSeen: false, saveTimer: null, dirty: false,
  // a team's shared pad (step 2c): the version last saved or seen, and strokes drawn here since then (added to a
  // teammate's newer pad when a save crosses theirs)
  team: D.team || null, pv: D.pv ?? null, fresh: [], saving: false,
  // step 3a: this desk's own live desk (hand, hall pass, lock, "coming over"), the teammates' cursors on the pad, the
  // hand menu, and the server's clock (the pass timer counts from it)
  me: null, mates: [], handMenu: false, handBusy: false, skew: 0,
  // step 3c: their supports ({ time, read, simple, big }) and the plan's Now / Next with their own clock
  sup: D.support || null, plan: null, planSkew: 0,
  // step 4c: K-2 mode, away from the room ('home' | 'absent' | 'outside' | ''), their questions from home, and the Ask menu
  k2: !!(D.state && D.state.k2), home: (D.state && D.state.home) || '', asks: (D.state && D.state.asks) || [], askMenu: false,
};
/** Read to me on a card: their Read aloud support, or K-2 mode (on by default there). */
const readOn = () => S.k2 || !!(S.sup && S.sup.read);
const root = $('hd'), body = $('hd-body'), over = $('hd-over');

// ---------------------------------------------------------------- the desk
function renderDesk() {
  const color = D.color ? ` style="--gc:${esc(D.color)}"` : '';
  body.innerHTML = `<div class="hd-grid">
    <section class="hd-desk"${color} aria-labelledby="hd-deskh">
      <div class="hd-deskrow"><h2 class="hd-deskh" id="hd-deskh"><span class="rm-dot"${D.color ? ` style="--c:${esc(D.color)}"` : ''}></span><span>${esc(td('deskOf', { name: D.me.name }))}</span></h2><span class="hd-order" id="hd-order"></span></div>
      <p class="hd-seen">${iconHtml('👀', { size: 16 })} <span>${esc(td('seen'))}</span></p>
      ${S.team ? `<p class="hd-team" id="hd-team">${iconHtml('🤝', { size: 18 })} <span><bdi>${esc(td('team', { names: S.team.names.join(', ') }))}</bdi></span></p>` : ''}
      <div id="hd-cards"></div>
      <div class="hd-pad">
        <div class="hd-padbar"><h3 class="hd-padcap">${esc(td(S.team ? 'teamPad' : 'pad'))}</h3><span class="hd-grow"></span>
          <span class="hd-pens" role="radiogroup" aria-label="${esc(td('pens'))}">${P.colors.map((c, i) => btn(`hd-pen${S.pen === c ? ' on' : ''}`, `role="radio" aria-checked="${S.pen === c}" data-hdpen="${c}" aria-label="${esc(td('penColor', { n: i + 1 }))}"`, `<i style="background:${c}"></i>`)).join('')}</span>
          <span class="hd-erasewrap">${btn(`hd-tool hd-erasebtn${S.padTool === 'erase' ? ' on' : ''}`, `data-hd="erase" id="hd-erase" aria-pressed="${S.padTool === 'erase'}"`, `${ERASE_ICON}<span>${esc(td('erase'))}</span>`)}<span class="hd-ersz" id="hd-ersz"${S.padTool === 'erase' ? '' : ' hidden'} role="group" aria-label="${esc(td('eraseSize'))}">${Object.keys(PAD_ERASER).map(k => btn(`hd-erszb${S.eraser === k ? ' on' : ''}`, `data-hdersz="${k}" aria-pressed="${S.eraser === k}" aria-label="${esc(td(`eraseSizes.${k}`))}"`, `<i style="--d:${6 + Object.keys(PAD_ERASER).indexOf(k) * 6}px"></i>`)).join('')}</span></span>
          ${btn('hd-tool', 'data-hd="undo" id="hd-undo"', `${iconHtml('↩', { size: 18 })}<span>${esc(td('undo'))}</span>`)}${btn('hd-tool', 'data-hd="clear" id="hd-clear"', `${iconHtml('🧽', { size: 18 })}<span>${esc(td('clear'))}</span>`)}</div>
        <div class="hd-padbox"><svg class="hd-svg" id="hd-svg" viewBox="0 0 ${P.w} ${P.h}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="${esc(td('padLabel'))}">
          <rect class="hd-paper" x="1" y="1" width="${P.w - 2}" height="${P.h - 2}" rx="14"/><g id="hd-ink"></g><g id="hd-cur"></g><g id="hd-mates" aria-hidden="true"></g></svg></div>
      </div>
    </section>
    <section class="hd-side" aria-labelledby="hd-areah">
      <div class="hd-wintop"><h2 class="hd-areah" id="hd-areah">✦ ${esc(td('teacherArea'))}</h2>${btn('hd-open', `data-hd="area" aria-label="${esc(td('openArea'))}"`, iconHtml('⤢', { size: 18 }))}</div>
      <div class="hd-window" id="hd-window" data-hd="area"></div>
    </section></div>`;
  drawInk(); renderWindow(); toolsState(); renderCards();
}

// ---------------------------------------------------------------- handouts (step 2a)
/** A Reading handout's card: the book's cover (once there is one), "Read: <book>" or "Read a book", and the routine's
 *  steps with the one they are on. */
function readCardHtml(x, cls, badge, label) {
  const rd = x.reading || {}, bk = rd.book;
  const at = rd.step === 'done' || x.done ? 3 : Math.max(0, ['read', 'quiz', 'notes'].indexOf(rd.step === 'choose' ? 'read' : rd.step));
  const steps = `<span class="hd-csteps" aria-hidden="true">${['read', 'quiz', 'notes'].map((k, i) => `<i class="${i < at ? 'done' : i === at ? 'on' : ''}">${i < at ? '✓ ' : ''}${esc(td(`rd.${k}`))}</i>`).join('')}</span>`;
  const title = bk ? td('rd.readTitle', { title: bk.title }) : x.title;
  const where = rd.step === 'read' && rd.page ? td('rd.page', { page: rd.page, pages: rd.pages }) : '';
  const sub = [where, x.due ? dueLabel(x.due, x.dueMin) : ''].filter(Boolean).join(' · ');
  const inner = `${badge}${bk ? `<img class="hd-ccover" src="${esc(bk.cover)}" alt="" width="52" height="40" loading="lazy">` : `<span class="hd-cico" aria-hidden="true">${iconHtml('📖', { size: 26 })}</span>`}<b class="hd-ct" dir="auto">${esc(title)}</b>${steps}${sub ? `<span class="hd-csub">${esc(sub)}</span>` : ''}
    ${x.instructions ? `<span class="hd-cins" dir="auto"><b>${esc(td('teacherSays'))}</b> ${esc(x.instructions)}</span>` : ''}${fbHtml(x)}<span class="hd-cbar" aria-hidden="true"><i style="width:${x.pct}%"></i></span>`;
  const lab = `${title}, ${td(`rd.at.${x.done ? 'done' : rd.step || 'read'}`)}${label}`;
  return x.locked ? `<div class="${cls} hd-rdcard" role="group" aria-label="${esc(lab)}" aria-disabled="true" data-hdcard="${esc(x.id)}">${inner}</div>`
    : `<a class="${cls} hd-rdcard" href="${esc(x.href)}" aria-label="${esc(lab)}" data-hdcard="${esc(x.id)}" data-hdread="1">${inner}</a>`;
}
function cardHtml(x) {
  const cls = `hd-card${x.next ? ' next' : ''}${x.locked ? ' locked' : ''}${x.done ? ' done' : ''}${x.ready ? '' : ' notready'}`;
  const badge = x.done ? `<span class="hd-badge done">✓ ${esc(td('done'))}</span>` : x.next ? `<span class="hd-badge next">${esc(td('nextUp'))}</span>` : x.locked ? `<span class="hd-badge later">${iconHtml('🔒', { size: 12 })} ${esc(td('later'))}</span>` : '';
  // A lesson (step 2b): "Lesson: <name>" and "Worksheet · N problems"; a game: free play.
  // (a Manipulatives tool: open practice in its live room, docs/decisions.md "Homeroom: watching desks and the full catalog")
  // (a lesson assigned in Classroom with several steps: its lesson page, steps done)
  const kind = x.page ? td('pageKind', { count: x.n || 0 }) : x.manip ? td('manipKind', { count: x.n || 0 }) : x.tool ? (x.ready ? td('toolKind') : td('toolNotOpen')) : !x.ready ? td('notReady') : x.lesson ? td(x.unit === 'words' ? 'worksheetWords' : 'worksheet', { count: x.n || 0 }) : td('freePlay');
  const sub = [kind, x.due ? dueLabel(x.due, x.dueMin) : ''].filter(Boolean).join(' · ');
  const title = x.lesson ? td('lessonTitle', { title: x.title }) : x.title;
  const inner = `${badge}<span class="hd-cico" aria-hidden="true">${iconHtml(x.lesson ? '📄' : x.icon, { size: 26 })}</span><b class="hd-ct" dir="auto">${esc(title)}</b><span class="hd-csub">${esc(sub)}</span>
    ${x.instructions ? `<span class="hd-cins" dir="auto"><b>${esc(td('teacherSays'))}</b> ${esc(x.instructions)}</span>` : ''}${fbHtml(x)}<span class="hd-cbar" aria-hidden="true"><i style="width:${x.pct}%"></i></span>`;
  const label = `${title}${x.done ? `, ${td('done')}` : x.locked ? `, ${td('laterHint')}` : x.next ? `, ${td('nextUp')}` : ''}`;
  const card = x.reading ? readCardHtml(x, cls, badge, x.locked ? `, ${td('laterHint')}` : x.next ? `, ${td('nextUp')}` : '') : x.locked || !x.ready || !x.href ? `<div class="${cls}" role="group" aria-label="${esc(label)}" aria-disabled="true" data-hdcard="${esc(x.id)}">${inner}</div>`
    : `<a class="${cls}" href="${esc(x.href)}" aria-label="${esc(label)}" data-hdcard="${esc(x.id)}">${inner}</a>`;
  // Read aloud (step 3c): the card's title and the teacher's words, from a button beside the card (never inside its link)
  const read = readOn() && !x.done ? readBtn([title, x.instructions].filter(Boolean).join('. ')) : '';
  // the handout's note area: its page in this class's tab of the notebook (public/js/notebook.js), named after it
  const note = D.notebook ? `<button type="button" class="hd-notebtn" data-hdnote="${esc(x.id)}" aria-label="${esc(td('notesLabel', { title }))}">${iconHtml('📝', { size: 18 })}<span>${esc(td('notes'))}</span></button>` : '';
  return read || note ? `<div class="hd-cardwrap">${card}${read}${note}</div>` : card;
}
/** The teacher's comment and sticker on a finished card (step 2c): only this student's own. */
function fbHtml(x) {
  const f = x.done && x.fb; if (!f || (!f.comment && !f.src)) return '';
  return `<span class="hd-fb">${f.src ? `<img class="hd-fbsticker" src="${esc(f.src)}" alt="${esc(td(`stickers.${f.sticker}`))}" width="56" height="56">` : ''}${f.comment ? `<span class="hd-fbtext" dir="auto"><b>${esc(td('fromTeacher'))}</b> ${esc(f.comment)}</span>` : ''}</span>`;
}
function renderCards() {
  const el = $('hd-cards'), ord = $('hd-order'); if (!el) return;
  const cards = S.cards, missed = cards.filter(x => x.missed), rest = cards.filter(x => !x.missed);
  // (In order / Any order is about handouts: a Manipulatives tool is open practice, never in an order)
  if (ord) { const left = cards.filter(x => !x.done && !x.practice); ord.textContent = !left.length ? '' : left.some(x => x.inOrder) ? td('inOrder') : td('anyOrder'); ord.hidden = !left.length || S.k2; }
  // "Missed while you were out" (step 4c): handouts given on a day they were marked absent, with the teacher's words
  const missedHtml = missed.length ? `<section class="hd-missed" aria-labelledby="hd-missedh"><h3 class="hd-missedh" id="hd-missedh">${iconHtml('📬', { size: S.k2 ? 26 : 20 })} <span>${esc(td('missed.title'))}</span></h3>
    <p class="hd-missedlead">${esc(td(S.k2 ? 'missed.leadK2' : 'missed.lead'))}</p><div class="${S.k2 ? 'hd-k2tiles' : 'hd-cards'}">${missed.map(x => (S.k2 ? k2Tile(x, true) : cardHtml(x))).join('')}</div></section>` : '';
  if (S.k2) { el.className = 'hd-k2cards'; el.innerHTML = `${missedHtml}${k2Html(rest, !!missed.length)}`; return; }
  el.className = cards.length ? 'hd-cardsbox' : '';
  el.innerHTML = cards.length ? `${missedHtml}${rest.length ? `<div class="hd-cards">${rest.map(cardHtml).join('')}</div>` : ''}`
    : `<div class="hd-emptydesk">${iconHtml('🎒', { size: 28 })}<p><b>${esc(td('empty'))}</b><span>${esc(td('emptyText'))}</span></p></div>`;
  showNext(el);
}
/** Each row of cards scrolled so Next up (else the first card not done) is in view, when the desk opens or its cards
 *  change: never a row of Done cards with the work off to the side (F1). Only the row scrolls, never the page. */
function showNext(el) {
  for (const row of el.querySelectorAll('.hd-cards')) {
    const card = row.querySelector('.hd-card.next') || row.querySelector('.hd-card:not(.done)');
    if (!card) continue;
    const r = row.getBoundingClientRect(), c = card.getBoundingClientRect(), pad = parseFloat(getComputedStyle(row).paddingInlineStart) || 0;
    // in view already (its start shows, and its end too unless it is wider than the row): left as it is
    if (c.left >= r.left - 1 && c.right <= r.right + 1) continue;
    row.scrollBy({ left: c.left - r.left - pad, behavior: 'instant' });
  }
}

// ---------------------------------------------------------------- K-2 mode (step 4c)
const cardTitle = x => (x.reading && x.reading.book ? x.reading.book.title : x.title);
const cardPic = (x, size) => (x.reading && x.reading.book ? `<img class="hd-k2cover" src="${esc(x.reading.book.cover)}" alt="" loading="lazy">`
  : `<span class="hd-k2ico" aria-hidden="true">${iconHtml(x.reading ? '📖' : x.lesson ? '📄' : x.icon, { size })}</span>`);
const opens = x => !x.locked && (x.reading || (x.ready && x.href));
/** A handout as one big picture button (the game's icon or the book's cover, a short name), with Read to me. */
function k2Tile(x, words = false) {
  const title = cardTitle(x), cls = `hd-card hd-k2tile${x.done ? ' done' : ''}${x.locked ? ' locked' : ''}${x.ready || x.reading ? '' : ' notready'}${words && x.instructions ? ' words' : ''}`;
  const mark = x.done ? `<span class="hd-k2mark done" aria-hidden="true">✓</span>` : x.locked ? `<span class="hd-k2mark" aria-hidden="true">${iconHtml('🔒', { size: 18 })}</span>` : '';
  // (the missed ones keep the teacher's words on them: they weren't there to hear them)
  const inner = `${cardPic(x, 52)}<b class="hd-k2t" dir="auto">${esc(title)}</b>${words && x.instructions ? `<span class="hd-k2tw" dir="auto">${esc(x.instructions)}</span>` : ''}${mark}`;
  const label = `${title}${x.done ? `, ${td('done')}` : x.locked ? `, ${td('laterHint')}` : ''}`;
  const card = opens(x) ? `<a class="${cls}" href="${esc(x.href || '#')}" aria-label="${esc(label)}" data-hdcard="${esc(x.id)}"${x.reading ? ' data-hdread="1"' : ''}>${inner}</a>`
    : `<div class="${cls}" role="group" aria-label="${esc(label)}" aria-disabled="true" data-hdcard="${esc(x.id)}">${inner}</div>`;
  const read = !x.done ? readBtn([title, x.instructions].filter(Boolean).join('. '), { small: true }) : '';
  return `<div class="hd-k2wrap">${card}${read}</div>`;
}
/** K-2's desk: one thing at a time. Next up is one big picture with the teacher's words, Read to me and a big Start;
 *  the others wait underneath as picture tiles. */
function k2Html(cards, hasMissed) {
  if (!cards.length) return hasMissed ? '' : `<div class="hd-emptydesk hd-k2empty">${iconHtml('🎒', { size: 44 })}<p><b>${esc(td('empty'))}</b><span>${esc(td('k2.emptyText'))}</span></p></div>`;
  const next = cards.find(x => !x.done && !x.locked) || null, others = cards.filter(x => x !== next);
  const hero = next ? (() => {
    const title = cardTitle(next), words = next.instructions || '';
    const say = [title, words].filter(Boolean).join('. ');
    const go = opens(next) ? `<a class="hd-card hd-k2start btn-big" href="${esc(next.href || '#')}" data-hdcard="${esc(next.id)}"${next.reading ? ' data-hdread="1"' : ''} aria-label="${esc(td('k2.startLabel', { title }))}">${iconHtml('▶️', { size: 28 })}<span>${esc(td('k2.start'))}</span></a>`
      : `<p class="hd-k2wait">${iconHtml('⏳', { size: 22 })} ${esc(td('notReadyHint'))}</p>`;
    return `<section class="hd-k2next" aria-labelledby="hd-k2nexth"><h3 class="hd-k2cap" id="hd-k2nexth">${iconHtml('⭐', { size: 22 })} <span>${esc(td('nextUp'))}</span></h3>
      <div class="hd-k2hero">${cardPic(next, 84)}<div class="hd-k2herot"><b class="hd-k2name" dir="auto">${esc(title)}</b>
        ${words ? `<p class="hd-k2words" dir="auto">${esc(words)}</p>` : ''}
        <div class="hd-k2acts">${readBtn(say)}${go}</div></div></div></section>`;
  })() : `<div class="hd-k2alldone">${iconHtml('🎉', { size: 48 })}<b>${esc(td('k2.allDone'))}</b></div>`;
  const rest = others.filter(x => !x.done), done = others.filter(x => x.done);
  const row = (k, icon, list) => (list.length ? `<h3 class="hd-k2cap">${iconHtml(icon, { size: 20 })} <span>${esc(td(k))}</span></h3><div class="hd-k2tiles">${list.map(x => k2Tile(x)).join('')}</div>` : '');
  return `${hero}${row('k2.then', '➡️', rest)}${row('k2.finished', '✅', done)}`;
}
function newCards(list) {
  const had = new Set(S.cards.map(x => x.id)), fresh = list.filter(x => !had.has(x.id));
  S.cards = list; renderCards();
  if (fresh.length && S.hv !== null) toast(td('newHandout', { title: fresh[fresh.length - 1].title }));
}
function renderWindow() {
  const w = $('hd-window'); if (!w) return;
  w.innerHTML = areaHtml(S.area, { mode: 'width', label: false });
  fitAreas(w);
}
function toolsState() {
  const u = $('hd-undo'), c = $('hd-clear');
  if (u) u.disabled = !S.hist.length; if (c) c.disabled = !S.strokes.length;
}

// ---------------------------------------------------------------- the pad
const svg = () => $('hd-svg');
/** The pad's eraser radius by size, in the page's pixels (900 x 600). */
const PAD_ERASER = { S: 10, M: 22, L: 44 };
const ERASE_ICON = '<svg class="hr-gl" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15.5 4.5l4 4a2 2 0 0 1 0 2.8L12 18.8H7.2l-3-3a2 2 0 0 1 0-2.8L12.7 4.5a2 2 0 0 1 2.8 0z"/><path d="M9 9l6 6"/><path d="M12 18.8h8"/></svg>';
function setPadTool(tool) {
  S.padTool = tool;
  for (const b of root.querySelectorAll('[data-hdpen]')) { const on = tool === 'pen' && b.dataset.hdpen === S.pen; b.classList.toggle('on', on); b.setAttribute('aria-checked', String(on)); }
  const e = $('hd-erase'); if (e) { e.classList.toggle('on', tool === 'erase'); e.setAttribute('aria-pressed', String(tool === 'erase')); }
  const z = $('hd-ersz'); if (z) z.hidden = tool !== 'erase';
  svg()?.classList.toggle('erasing', tool === 'erase');
}
/** Erase along the eraser's last move on the pad (fractions of the page). -> whether anything changed */
function padErase(path) {
  const r = eraseStrokes(S.strokes, path.map(p => ({ x: p.x * P.w, y: p.y * P.h })), PAD_ERASER[S.eraser] || 22,
    { toPx: p => ({ x: p.x * P.w, y: p.y * P.h }), fromPx: p => ({ x: Math.round(p.x / P.w * 1e4) / 1e4, y: Math.round(p.y / P.h * 1e4) / 1e4 }), maxPts: P.points });
  if (!r.changed) return false;
  if (r.strokes.length > P.strokes || r.strokes.reduce((n, s) => n + s.pts.length, 0) > P.total) { toast(td('padFull'), { bad: true }); return false; }
  S.strokes = r.strokes; drawInk(); return true;
}
function drawInk() { const g = $('hd-ink'); if (g) g.innerHTML = S.strokes.map(s => inkLine(s, P.w, P.h)).join(''); }
/** A pointer's place on the page, as fractions of it (the page keeps its shape on every screen). */
function at(e) {
  const el = svg(), m = el && el.getScreenCTM(); if (!m) return null;
  const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
  return { x: Math.min(1, Math.max(0, p.x / P.w)), y: Math.min(1, Math.max(0, p.y / P.h)) };
}
const totalPoints = () => S.strokes.reduce((n, s) => n + s.pts.length, 0);
function remember() { S.hist.push(JSON.stringify(S.strokes)); if (S.hist.length > 50) S.hist.shift(); }
function padDown(e) {
  if (!e.target.closest('#hd-svg') || S.cur) return;
  if (e.pointerType === 'pen') S.penSeen = true;
  // A pencil in use: a palm resting on the screen draws nothing.
  if (e.pointerType === 'touch' && S.penSeen) return;
  if (e.button > 0) return;
  if (S.padTool !== 'erase' && (S.strokes.length >= P.strokes || totalPoints() >= P.total - 2)) { toast(td('padFull'), { bad: true }); return; }
  const p = at(e); if (!p) return;
  e.preventDefault();
  if (S.padTool === 'erase') {
    remember(); S.cur = { id: e.pointerId, erase: true, last: p, changed: padErase([p]) };
    try { svg().setPointerCapture(e.pointerId); } catch { /* gone */ }
    return;
  }
  S.cur = { id: e.pointerId, s: { c: S.pen, pts: [p] } };
  try { svg().setPointerCapture(e.pointerId); } catch { /* gone */ }
}
function padMove(e) {
  const c = S.cur; if (!c || c.id !== e.pointerId) return;
  const evs = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : [e];
  if (c.erase) { for (const ev of evs.length ? evs : [e]) { const p = at(ev); if (p) { if (padErase([c.last, p])) c.changed = true; c.last = p; } } return; }
  for (const ev of evs.length ? evs : [e]) {
    if (c.s.pts.length >= P.points) break;
    const p = at(ev), last = c.s.pts[c.s.pts.length - 1];
    if (p && (Math.abs(p.x - last.x) * P.w + Math.abs(p.y - last.y) * P.h) >= 1.5) c.s.pts.push(p);
  }
  const g = $('hd-cur'); if (g) g.innerHTML = inkLine(c.s, P.w, P.h);
}
function padUp(e) {
  const c = S.cur; if (!c || c.id !== e.pointerId) return;
  S.cur = null; const g = $('hd-cur'); if (g) g.innerHTML = '';
  if (c.erase) { if (c.changed) { S.fresh = []; toolsState(); queueSave(); } else S.hist.pop(); return; }
  if (c.s.pts.length < 2) return;
  if (totalPoints() + c.s.pts.length > P.total) { toast(td('padFull'), { bad: true }); return; }
  remember(); S.strokes.push(c.s); if (S.team) S.fresh.push(c.s); drawInk(); toolsState(); queueSave();
}
function queueSave() { S.dirty = true; clearTimeout(S.saveTimer); S.saveTimer = setTimeout(save, 700); }
const padBody = () => ({ strokes: S.strokes, ...(S.team ? { base: S.pv } : {}) });
async function save(tries = 0) {
  S.saveTimer = null; if (!S.dirty || S.saving) return; S.dirty = false; S.saving = true;
  try {
    const r = await api(`/api/desk/${encodeURIComponent(D.classId)}/doodle`, { method: 'POST', body: padBody() });
    if (r && r.pv !== undefined) S.pv = r.pv;
    S.fresh = [];
  } catch (e) {
    // A teammate saved the shared pad since this desk last saw it: their pad, plus what was drawn here since, saved again.
    if (e.status === 409 && e.data && Array.isArray(e.data.strokes) && tries < 3) {
      S.strokes = [...e.data.strokes, ...S.fresh].slice(-P.strokes); S.pv = e.data.pv; S.hist = []; drawInk(); toolsState();
      S.saving = false; S.dirty = true; return save(tries + 1);
    }
    toast(e.message, { bad: true });
  } finally { S.saving = false; }
}
function flush() {
  if (!S.dirty) return; clearTimeout(S.saveTimer); S.dirty = false;
  try { fetch(`/api/desk/${encodeURIComponent(D.classId)}/doodle`, { method: 'POST', keepalive: true, credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(padBody()) }); } catch { /* gone */ }
}
/** A teammate drew on the shared pad (the poll's strokes): shown here, unless this desk has strokes not saved yet (its
 *  save then adds them to the teammate's). */
function teamPad(st) {
  if (!S.team || st.pv === undefined) return;
  if (Array.isArray(st.strokes) && !S.dirty && !S.saving && !S.cur && String(st.pv) !== String(S.pv)) { S.strokes = st.strokes; S.pv = st.pv; S.hist = []; S.fresh = []; drawInk(); toolsState(); }
}

// ---------------------------------------------------------------- overlays: the teacher's area, See the room, live class
function renderOver() {
  const L = S.live || {};
  let html = '';
  if (S.me && S.me.locked && S.live) {
    html = `<div class="hd-over hd-pause hd-locked" role="status"><div class="hd-pausein">${iconHtml('🔒', { size: 64 })}<h2>${esc(td('hand.locked'))}</h2><p>${esc(td('hand.lockedHint'))}</p></div></div>`;
  } else if (L.paused) {
    html = `<div class="hd-over hd-pause" role="status"><div class="hd-pausein">${iconHtml('👀', { size: 64 })}<h2>${esc(td('eyes'))}</h2><p>${esc(td('eyesHint'))}</p></div></div>`;
  } else if (L.bring) {
    html = `<div class="hd-over hd-show" role="status"><p class="hd-overcap">${esc(td('showing'))}</p><div class="hd-overarea">${areaHtml(S.area, { mode: 'contain' })}</div><p class="hd-overhint">${esc(td('showingHint'))}</p></div>`;
  } else if (S.view === 'area') {
    html = `<div class="hd-over hd-show" role="dialog" aria-modal="false" aria-labelledby="hd-overh"><div class="hd-overtop"><h2 class="hd-overcap" id="hd-overh">✦ ${esc(td('teacherArea'))}</h2>${btn('btn hr-chunk hd-back', 'data-hd="desk"', `${iconHtml('🎒', { size: 18 })} ${esc(td('back'))}`)}</div><div class="hd-overarea">${areaHtml(S.area, { mode: 'contain', label: false })}</div></div>`;
  } else if (S.view === 'room') {
    html = roomHtml();
  }
  over.innerHTML = html;
  root.classList.toggle('hd-covered', !!html);
  for (const b of root.querySelectorAll('.hd-dockbtn[data-hd]')) b.setAttribute('aria-pressed', String(b.dataset.hd === S.view));
  if (html) { fitAreas(over); placeRoom(); }
  // See the room's pen: its lines asked for while the room is on screen, what was drawn saved when it goes
  if ($('hd-roombox')) { renderRoomTools(); RP.poll(); } else RP.flush();
}
function roomHtml() {
  const desks = D.desks || [];
  return `<div class="hd-over hd-room" role="dialog" aria-modal="false" aria-labelledby="hd-roomh"><div class="hd-overtop"><h2 class="hd-overcap" id="hd-roomh">${iconHtml('🏫', { size: 20 })} ${esc(td('roomTitle', { class: D.className }))}</h2>${btn('btn hr-chunk hd-back', 'data-hd="desk"', `${iconHtml('🎒', { size: 18 })} ${esc(td('back'))}`)}</div>
    <div class="hd-roomtools" id="hd-roomtools" hidden></div>
    <div class="hd-roombox" id="hd-roombox"><div class="hd-front"><span>✦ ${esc(td('teacherArea'))}</span></div><div class="hd-tdesk">${esc(td('teacherDesk'))}</div>
    ${desks.map(d => `<div class="hd-rdesk${d.me ? ' me' : ''}" data-x="${+d.x || 0}" data-y="${+d.y || 0}"${d.me && D.color ? ` style="--gc:${esc(D.color)}"` : ''}><span class="hd-rname"><bdi>${esc(d.name)}</bdi>${d.me ? ` <b>(${esc(td('you'))})</b>` : ''}</span></div>`).join('')}
    ${(D.teams || []).map(x => `<div class="hd-rdesk hd-rteam${x.me ? ' me' : ''}" data-x="${+x.x || 0}" data-y="${+x.y || 0}" data-team="1"${x.me && D.color ? ` style="--gc:${esc(D.color)}"` : ''}><span class="hd-rname">${iconHtml('🤝', { size: 14 })} <bdi>${esc(x.names.join(', '))}</bdi>${x.me ? ` <b>(${esc(td('you'))})</b>` : ''}</span></div>`).join('')}</div></div>`;
}
/** See the room: desks where the teacher seated them, scaled to the screen; when that would make desks too small to
 *  read (a phone), the same desks in seating order (front row first, left to right) as a simple grid. */
function placeRoom() {
  const box = $('hd-roombox'); if (!box) return;
  const desks = [...box.querySelectorAll('.hd-rdesk')], pts = desks.map(el => ({ el, x: +el.dataset.x, y: +el.dataset.y, ...(el.dataset.team ? TEAM_DESK : DESK) }));
  if (!pts.length) return;
  const fr = frameOf(S.area);
  const x0 = Math.min(fr.x, ...pts.map(p => p.x)) - 20, x1 = Math.max(fr.x + fr.w, ...pts.map(p => p.x + p.w)) + 20;
  const y1 = Math.max(...pts.map(p => p.y + p.h)) + 20, k = box.clientWidth / (x1 - x0);
  const grid = k * DESK.w < 84;
  box.classList.toggle('grid', grid);
  const front = box.querySelector('.hd-front'), tdesk = box.querySelector('.hd-tdesk');
  if (grid) {
    for (const el of [front, tdesk, ...desks]) el.removeAttribute('style');
    pts.sort((a, b) => (Math.abs(a.y - b.y) < DESK.h / 2 ? a.x - b.x : a.y - b.y)).forEach((p, i) => { p.el.style.order = String(i + 2); if (p.el.classList.contains('me') && D.color) p.el.style.setProperty('--gc', D.color); });
    box.style.height = ''; roomInk(box, null); S.roomMap = null; roomObjects(box, null); RP.render(); renderRoomTools();
    return;
  }
  // The front of the room as a low band (the area's words aren't shown here), everything under it moved up to match.
  // The teacher's area at the size the teacher gave it (homeroom-seats.js frameOf), My desk under its middle.
  const top = fr.y - 10, band = Math.round(fr.h * 0.3), up = fr.h - band;
  const put = (el, r) => Object.assign(el.style, { left: `${(r.x - x0) * k}px`, top: `${(r.y - top) * k}px`, width: `${r.w * k}px`, height: `${r.h * k}px` });
  const td0 = tdeskOf(fr);
  put(front, { ...fr, h: band }); put(tdesk, { ...td0, y: td0.y - up });
  for (const p of pts) { put(p.el, { x: p.x, y: p.y - up, w: p.w, h: p.h }); p.el.style.order = ''; }
  box.style.height = `${(y1 - up - top) * k + 10}px`;
  S.roomMap = { x0, top, band, up, k, fr };
  roomInk(box, S.area && S.area.ink, { x0, top, band, up, k, fr });   // the teacher's pen lines around the desks
  roomObjects(box, S.roomMap);   // the teacher's notes, text and shapes outside the area
  RP.render();   // students' lines on the room
}
/** The teacher's notes, text boxes, shapes and pen lines placed outside the teacher's area (board-shapes.js
 *  splitObjects), where they are on the room: beside the area pressed into its band, under it moved up with the desks. */
function roomObjects(box, m) {
  box.querySelector(':scope > .hd-robjs')?.remove();
  if (!m) return;
  const out = splitObjects(S.area, AREA, m.fr).outside;
  if (!out.notes.length && !out.texts.length && !out.shapes.length && !out.strokes.length) return;
  const end = m.fr.y + m.fr.h, squeeze = (m.fr.y + m.band - m.top) / Math.max(1, end - m.top);
  const mapY = y => (y <= end ? m.top + (y - m.top) * squeeze : y - m.up) - m.top;
  const bx = f => AREA.x + f * AREA.w - m.x0, by = f => mapY(AREA.y + f * AREA.h);
  // (shapes and lines in the room's own pixels, so the SVG scales them, their widths too)
  const moved = drawings(out.shapes, out.strokes).map(d => (d.kind === 'shape' ? shapeSvg({ ...d.o, x: bx(d.o.x), y: by(d.o.y), x2: bx(d.o.x2), y2: by(d.o.y2) }, 1, 1)
    : strokeSvg({ ...d.o, pts: d.o.pts.map(p => ({ x: bx(p.x), y: by(p.y) })) }, 1, 1))).join('');
  const W = box.clientWidth / m.k, Hh = (box.clientHeight || 1) / m.k;
  const html = (list, f) => list.map(o => `<div class="hd-robj" style="left:${bx(o.x) * m.k}px;top:${by(o.y) * m.k}px;transform:scale(${m.k})">${f({ ...o, x: 0, y: 0 }, { ro: true })}</div>`).join('');
  const el = document.createElement('div'); el.className = 'hd-robjs'; el.setAttribute('aria-hidden', 'true');
  el.innerHTML = `<svg class="hd-robjsvg" viewBox="0 0 ${W} ${Hh}" preserveAspectRatio="none">${moved}</svg>${html(out.texts, textHtml)}${html(out.notes, noteHtml)}`;
  box.append(el);
}
/** See the room's pen (public/js/homeroom-marks.js): shown when the class's teachers let students draw on the room. */
function renderRoomTools() {
  const el = $('hd-roomtools'); if (!el) return;
  const st = RP.st, can = st.on && !st.locked && !!S.roomMap;
  el.hidden = !st.on;
  if (!st.on) { el.innerHTML = ''; return; }
  // (the phone's grid of names has no board to draw on: only how to get one)
  if (!S.roomMap) { el.innerHTML = `<p class="hd-rphint small">${iconHtml('✎', { size: 16 })} ${esc(td('room.bigger'))}</p>`; return; }
  const tb = (v, cls, label, inner, on) => btn(`hd-tool ${cls}${on ? ' on' : ''}`, `data-hdrp="${v}" aria-pressed="${!!on}" aria-label="${esc(label)}" title="${esc(label)}"${can ? '' : ' disabled'}`, inner);
  el.innerHTML = `${tb('pen', 'hd-rppen', td('room.pen'), `${iconHtml('✎', { size: 18 })}<span>${esc(td('room.pen'))}</span>`, st.tool === 'pen')}
    <span class="hd-pens" role="radiogroup" aria-label="${esc(td('pens'))}">${P.colors.map((c, i) => btn(`hd-pen${st.tool === 'pen' && st.color === c ? ' on' : ''}`, `role="radio" aria-checked="${st.tool === 'pen' && st.color === c}" data-hdrp="${c}" aria-label="${esc(td('penColor', { n: i + 1 }))}"${can ? '' : ' disabled'}`, `<i style="background:${c}"></i>`)).join('')}</span>
    ${tb('erase', 'hd-rperase', td('room.erase'), `${ERASE_ICON}<span>${esc(td('room.erase'))}</span>`, st.tool === 'erase')}
    ${btn('hd-tool', `data-hdrp="undo" aria-label="${esc(td('undo'))}"${can && st.hist.length ? '' : ' disabled'}`, `${iconHtml('↩', { size: 18 })}<span>${esc(td('undo'))}</span>`)}
    <p class="hd-rphint small">${esc(td(st.locked ? 'room.locked' : 'room.hint'))}</p>`;
}

// ---------------------------------------------------------------- live state
function applyState(st) {
  if (!st) return;
  const was = JSON.stringify([S.live, S.me && S.me.locked]);
  S.live = st.live || null; S.v = st.v;
  liveDesk(st);
  if (Array.isArray(st.cards)) newCards(st.cards);
  // watching desks (docs/decisions.md "Homeroom: watching desks and the full catalog"): the game open in the player sends
  // its small picture while the teacher's board shows this desk; the desk's poll says so sooner than the game's pulse
  if (st.watch) { const f = root.querySelector('.hr-playframe'); try { if (f && f.contentWindow) f.contentWindow.postMessage({ type: 'hr:watch', ...st.watch }, location.origin); } catch { /* the frame is going */ } }
  teamPad(st);
  if (st.hv !== undefined) S.hv = st.hv;
  const dot = $('hr-live'); if (dot) dot.hidden = !S.live;
  if ('livegame' in st) { S.livegame = st.livegame || null; LGD.apply(S.livegame); }
  // The day plan's Now / Next (part names only, no clock: docs/decisions.md "Homeroom: the day plan"); with extra time
  // (step 3c) their own longer clock for the part on now.
  if ('plan' in st) { S.plan = st.plan || null; S.planSkew = S.plan ? Date.now() - S.plan.now : 0; renderNow(); }
  if ('support' in st && JSON.stringify(st.support || null) !== JSON.stringify(S.sup)) { S.sup = st.support || null; applySup(); renderCards(); RL.restyle(); }
  // step 4c: K-2 mode (the teacher can turn it on or off), at home, the questions sent from home
  if ('k2' in st && !!st.k2 !== S.k2) { S.k2 = !!st.k2; root.classList.toggle('hd-k2', S.k2); renderCards(); }
  if ('home' in st || 'asks' in st) {
    const was = JSON.stringify([S.home, S.asks]);
    if ('home' in st) S.home = st.home || '';
    if ('asks' in st) S.asks = st.asks || [];
    if (was !== JSON.stringify([S.home, S.asks])) { if (!S.home) S.askMenu = false; renderHand(); }
  }
  const areaChanged = 'area' in st;
  if (areaChanged) { S.area = st.area || {}; renderWindow(); }
  if (areaChanged || was !== JSON.stringify([S.live, S.me && S.me.locked])) renderOver();
}
/** The Now line; with extra time, "Your time" counts down to their own end of the part (never "Time's up"). */
function renderNow() {
  const el = $('hd-now'); if (!el) return;
  const p = S.plan, mine = p && p.mine;
  el.hidden = !p;
  const left = mine ? mine.endsAt - (Date.now() - S.planSkew) : 0;
  const html = p ? `${nowNextHtml(p, 0, { clockOn: false })}${mine && left > 0 ? `<span class="hd-mytime">${iconHtml('⏳', { size: 16 })} ${esc(td('myTime'))} <b data-hdmyclock>${esc(planClock(left))}</b></span>` : ''}` : '';
  if (el.innerHTML !== html) el.innerHTML = html;
}
/** Bigger text on the whole desk. */
function applySup() { bigText(root, S.sup && S.sup.big); }
let pollTimer = null;
async function poll() {
  clearTimeout(pollTimer); pollTimer = null;
  if (document.hidden) return;
  try { applyState(await api(`/api/desk/${encodeURIComponent(D.classId)}/state?v=${encodeURIComponent(S.v ?? '')}&hv=${encodeURIComponent(S.hv ?? '')}${S.team ? `&pv=${encodeURIComponent(S.pv ?? '')}` : ''}`, { background: true })); }
  catch (e) {
    // A shared device's sign-in ended (End class, or its time ran out): back to the class sign-in for the next student.
    if (D.device && (e.status === 401 || e.status === 404)) { location.href = '/hr?ended=1'; return; }
  }
  pollTimer = setTimeout(poll, S.live || S.livegame ? 3000 : 6000);
}

// ---------------------------------------------------------------- live class: the hand, the hall pass, the lock (step 3a)
let PULSE = null;
const KINDS = [['question', '💬'], ['help', '🆘'], ['bathroom', '🚻']];
/** The live desk as the state poll or a pulse brought it: { live, me, mates }. */
function liveDesk(st) {
  const live = st.live || null;
  if ('me' in st || !live) {
    const lockWas = !!(S.me && S.me.locked);
    S.me = live ? st.me || null : null;
    if (S.me && S.me.now) S.skew = Date.now() - S.me.now;
    if (!live) S.handMenu = false;
    if (lockWas !== !!(S.me && S.me.locked)) renderOver();
  }
  S.mates = live && Array.isArray(st.mates) ? st.mates : [];
  if (PULSE) PULSE.setLive(live, S.me);
  renderHand(); drawMates();
}
const passLeft = () => { const me = S.me; if (!me || me.pass !== 'out' || !me.outAt) return 0; return Math.round((me.outAt + me.minutes * 60e3 - (Date.now() - S.skew)) / 1000); };
const clock = s => `${Math.floor(Math.abs(s) / 60)}:${String(Math.abs(s) % 60).padStart(2, '0')}`;
function handNote() {
  const me = S.me; if (!me) return '';
  const k = me.hand;
  if (me.pass === 'out') {
    const left = passLeft();
    return `<div class="hd-note go" role="status">${iconHtml('🚻', { size: 22 })}<span class="hd-notet"><b>${esc(td('hand.goAhead'))}</b> <span class="hd-passclock${left <= 0 ? ' over' : ''}" id="hd-passclock">${esc(left > 0 ? td('hand.passLeft', { time: clock(left) }) : td('hand.timeUp'))}</span></span>${btn('btn hr-chunk hd-noteb', 'data-hdhand="back"', esc(td('hand.back')))}</div>`;
  }
  if (me.pass === 'line') return `<div class="hd-note" role="status">${iconHtml('🚻', { size: 22 })}<span class="hd-notet"><b>${esc(me.place <= 1 ? td('hand.next') : td('hand.inLine', { count: me.place - 1 }))}</b> <span>${esc(td('hand.lineHint'))}</span></span>${btn('btn hr-chunk hd-noteb', 'data-hdhand="lower"', esc(td('hand.leaveLine')))}</div>`;
  if (k) return `<div class="hd-note up" role="status">${iconHtml(k === 'bathroom' ? '🚻' : '✋', { size: 22 })}<span class="hd-notet"><b>${esc(td(`hand.up.${k}`))}</b> <span>${esc(td(k === 'bathroom' ? 'hand.askedPass' : 'hand.upHint'))}</span></span>${btn('btn hr-chunk hd-noteb', 'data-hdhand="lower"', esc(td('hand.down')))}</div>`;
  if (me.coming) return `<div class="hd-note calm" role="status">${iconHtml('🚶', { size: 22 })}<span class="hd-notet"><b>${esc(td('hand.coming'))}</b></span></div>`;
  return '';
}
function renderHand() {
  const wrap = $('hd-handwrap'); if (!wrap) return;
  const me = S.me, live = S.live;
  renderHomeChip();
  // at home (step 4c): no hand or hall pass; Ask my teacher sends a question the teacher sees in Hands
  if (S.home) { const h = askHtml(); if (h !== askShown) { wrap.innerHTML = h; askShown = h; } renderNote(''); return; }
  askShown = '';
  if (!live || !me) { wrap.innerHTML = ''; renderNote(''); return; }
  const up = !!me.hand || !!me.pass;
  const menu = S.handMenu ? `<div class="hd-handmenu" id="hd-handmenu" role="menu" aria-label="${esc(td('hand.menu'))}">
    ${up && me.pass !== 'out' ? btn('hd-hmi down', 'role="menuitem" data-hdhand="lower"', `${iconHtml('👇', { size: 22 })} <span>${esc(me.pass === 'line' ? td('hand.leaveLine') : td('hand.down'))}</span>`) : ''}
    ${me.pass === 'out' ? btn('hd-hmi', 'role="menuitem" data-hdhand="back"', `${iconHtml('🏫', { size: 22 })} <span>${esc(td('hand.back'))}</span>`) : ''}
    ${S.k2 ? `<div class="hd-k2hands">${KINDS.map(([k, ic]) => [k, k === 'help' ? '🙋' : ic]).map(([k, ic]) => btn(`hd-k2hand${me.hand === k ? ' on' : ''}`, `role="menuitemradio" aria-checked="${me.hand === k}" data-hdhand="raise:${k}"${k === 'bathroom' && me.pass ? ' disabled' : ''} aria-label="${esc(td(`hand.${k}`))}"`,
      `${iconHtml(ic, { size: 56 })}<span>${esc(td(`k2.hand.${k}`))}</span>`)).join('')}</div>`
    : KINDS.map(([k, ic]) => btn(`hd-hmi${me.hand === k ? ' on' : ''}`, `role="menuitemradio" aria-checked="${me.hand === k}" data-hdhand="raise:${k}"${k === 'bathroom' && me.pass ? ' disabled' : ''}`,
      `${iconHtml(ic, { size: 22 })} <span>${esc(td(`hand.${k}`))}</span>${k === 'bathroom' ? `<span class="hd-hmtag">${esc(td('hand.hallPass'))}</span>` : ''}`)).join('')}</div>` : '';
  wrap.innerHTML = `${btn(`btn hr-chunk hr-spark hd-handbtn${up ? ' on' : ''}`, `data-hd="hand" aria-haspopup="menu" aria-expanded="${S.handMenu}"`, `${iconHtml(me.pass ? '🚻' : '✋', { size: 20 })} <span>${esc(me.pass ? td('hand.passBtn') : up ? td('hand.isUp') : td('hand.raise'))}</span>`)}${menu}`;
  // (the note under the bar steps aside while the hand menu is open: it would cover the menu)
  renderNote(S.handMenu ? '' : handNote());
}
// ---------------------------------------------------------------- at home: Ask my teacher (step 4c)
const ASKS = [['question', '💬'], ['help', '🙋']];
let askShown = '';
/** "At home today" beside the class's name when the teacher marked it (never for a desk that's simply outside class). */
function renderHomeChip() {
  const el = $('hd-homechip'); if (!el) return;
  el.hidden = S.home !== 'home';
}
function askHtml() {
  const open = S.asks.filter(x => !x.answeredAt).length, max = D.askMax || 200;
  const sent = S.asks.length ? `<ul class="plain hd-asklist">${S.asks.slice(-3).map(x => `<li>${iconHtml(x.answeredAt ? '✅' : '📨', { size: 18 })} <span>${esc(td(x.answeredAt ? 'ask.seen' : 'ask.waiting'))}${x.text ? `: <i dir="auto">${esc(x.text)}</i>` : ''}</span></li>`).join('')}</ul>` : '';
  const menu = !S.askMenu ? '' : `<div class="hd-handmenu hd-askmenu" id="hd-askmenu" role="dialog" aria-labelledby="hd-askh"><h3 class="hd-askh" id="hd-askh">${esc(td('ask.title'))}</h3><p class="hd-asklead">${esc(td('ask.lead'))}</p>
    ${S.k2 ? `<div class="hd-k2hands two">${ASKS.map(([k, ic]) => btn('hd-k2hand', `data-hdask="${k}" aria-label="${esc(td(`hand.${k}`))}"`, `${iconHtml(ic, { size: 56 })}<span>${esc(td(`k2.hand.${k}`))}</span>`)).join('')}</div>`
      : `<form class="hd-askform" novalidate><div class="hd-askkinds" role="radiogroup" aria-label="${esc(td('ask.kind'))}">${ASKS.map(([k, ic], i) => `<label class="hd-hmi"><input type="radio" name="kind" value="${k}"${i ? '' : ' checked'}> ${iconHtml(ic, { size: 22 })} <span>${esc(td(`hand.${k}`))}</span></label>`).join('')}</div>
        <label class="hr-label" for="hd-askin">${esc(td('ask.words'))}</label><textarea class="input" id="hd-askin" rows="2" maxlength="${max}" placeholder="${esc(td('ask.ph'))}"></textarea>
        <button class="btn btn-primary hd-asksend" type="submit">${iconHtml('📨', { size: 18 })} ${esc(td('ask.send'))}</button></form>`}
    ${sent}<p class="small muted hd-asknote">${esc(td('ask.private'))}</p></div>`;
  return `${btn(`btn hr-chunk hd-handbtn hd-askbtn${open ? ' on' : ''}`, `data-hd="ask" aria-haspopup="dialog" aria-expanded="${S.askMenu}"`, `${iconHtml('💬', { size: 20 })} <span>${esc(td(open ? 'ask.sentBtn' : 'ask.button'))}</span>`)}${menu}`;
}
async function sendAsk(kind, text = '') {
  if (S.handBusy) return;
  S.handBusy = true;
  try {
    const r = await api(`/api/desk/${encodeURIComponent(D.classId)}/ask`, { method: 'POST', body: { kind, text } });
    S.asks = r.asks || S.asks; S.askMenu = false; toast(r.toast);
  } catch (e) { toast(e.message, { bad: true }); } finally { S.handBusy = false; renderHand(); root.querySelector('[data-hd="ask"]')?.focus(); }
}
let noteShown = '';
function renderNote(html) {
  let el = $('hd-note');
  if (!el) { el = document.createElement('div'); el.id = 'hd-note'; el.className = 'hd-notewrap'; root.querySelector('.hd-top')?.after(el); }
  if (html !== noteShown) { el.innerHTML = html; noteShown = html; }
  el.hidden = !html;
  root.classList.toggle('hd-hasnote', !!html);
}
function tick() {
  if (!S.me || S.me.pass !== 'out') return;
  const el = $('hd-passclock'); if (!el) return;
  const left = passLeft();
  el.textContent = left > 0 ? td('hand.passLeft', { time: clock(left) }) : td('hand.timeUp');
  el.classList.toggle('over', left <= 0);
}
async function handAction(a) {
  if (S.handBusy) return;
  S.handBusy = true; S.handMenu = false;
  const [action, kind] = a.split(':');
  try {
    const r = await api(`/api/desk/${encodeURIComponent(D.classId)}/hand`, { method: 'POST', body: { action, ...(kind ? { kind } : {}) } });
    S.me = r.me || S.me; if (S.me && S.me.now) S.skew = Date.now() - S.me.now;
    if (PULSE) PULSE.input();
    toast(td(action === 'raise' ? (kind === 'bathroom' ? 'hand.toastPass' : 'hand.toastUp') : action === 'back' ? 'hand.toastBack' : 'hand.toastDown'));
  } catch (e) { toast(e.message, { bad: true }); } finally { S.handBusy = false; renderHand(); root.querySelector('[data-hd="hand"]')?.focus(); }
}
/** A team pad's teammates' cursors (their names, the names classmates see), played back over the last couple of
 *  seconds. Nobody else's cursor shows on a student's desk. */
const mateSeen = new Map();
function drawMates() {
  const g = $('hd-mates'); if (!g) return;
  const keep = new Set();
  for (const m of S.mates) {
    keep.add(m.id);
    let el = g.querySelector(`[data-mate="${CSS.escape(m.id)}"]`);
    if (!el) {
      el = document.createElementNS('http://www.w3.org/2000/svg', 'g'); el.setAttribute('class', 'hd-mate'); el.dataset.mate = m.id;
      el.innerHTML = `<path d="M0 0l22 12-10 3-4 10z" fill="#E8833A" stroke="#fff" stroke-width="2"/><text x="20" y="34">${esc(m.name)}</text>`;
      g.appendChild(el);
    }
    // new samples only (the same ones can come with a pulse and a poll), played with their own timing
    const now = S.me && S.me.now ? S.me.now : Date.now() - S.skew, seen = mateSeen.get(m.id) || 0;
    const pts = (m.pts || []).map(([age, x, y]) => [now - age, x, y]).filter(p => p[0] > seen);
    if (!pts.length) continue;
    mateSeen.set(m.id, Math.max(...pts.map(p => p[0])));
    const first = Math.min(...pts.map(p => p[0]));
    for (const [at, x, y] of pts) setTimeout(() => el.setAttribute('transform', `translate(${x * P.w} ${y * P.h})`), at - first);
  }
  for (const el of [...g.children]) if (!keep.has(el.dataset.mate)) el.remove();
}

// ---------------------------------------------------------------- Not you? Switch (a shared device)
async function switchUser(b) {
  b.disabled = true; flush();
  try { const r = await api(`/api/desk/${encodeURIComponent(D.classId)}/switch`, { method: 'POST', body: {} }); location.href = r.redirect || '/hr'; }
  catch { location.href = '/hr'; }
}

// ---------------------------------------------------------------- input
function click(e) {
  // A handout plays inside the desk (public/js/homeroom-player.js); a click for a new tab opens the game page.
  const play = e.target.closest('a.hd-card[data-hdcard]');
  // a Reading handout opens its routine in the reading layer (public/js/homeroom-reading.js)
  if (play && play.dataset.hdread) { e.preventDefault(); RL.openRoutine(play.dataset.hdcard); return; }
  if (play && !(e.button > 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) && PL.open(play.dataset.hdcard)) { e.preventDefault(); return; }
  const card = e.target.closest('.hd-card[aria-disabled="true"]');
  if (card) { const x = S.cards.find(c => c.id === card.dataset.hdcard); toast(x && x.locked ? td('laterHint') : td('notReadyHint')); return; }
  const note = e.target.closest('[data-hdnote]');
  if (note) { window.dispatchEvent(new CustomEvent('notebook:open', { detail: { classId: D.classId, handout: note.dataset.hdnote } })); return; }
  const pen = e.target.closest('[data-hdpen]');
  if (pen) { S.pen = pen.dataset.hdpen; setPadTool('pen'); return; }
  const esz = e.target.closest('[data-hdersz]');
  if (esz) { S.eraser = esz.dataset.hdersz; for (const b of root.querySelectorAll('[data-hdersz]')) { const on = b === esz; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); } return; }
  // See the room's pen (public/js/homeroom-marks.js), when the teacher lets students draw on the room
  const rp = e.target.closest('[data-hdrp]');
  if (rp) { const v = rp.dataset.hdrp; if (v === 'undo') RP.undo(); else if (v.startsWith('#')) RP.setColor(v); else RP.setTool(v); return; }
  const hk = e.target.closest('[data-hdhand]'); if (hk) { handAction(hk.dataset.hdhand); return; }
  const ak = e.target.closest('[data-hdask]'); if (ak) { sendAsk(ak.dataset.hdask); return; }
  if (S.askMenu && !e.target.closest('.hd-handwrap')) { S.askMenu = false; renderHand(); }
  const a = e.target.closest('[data-hd]'); if (!a) { if (S.handMenu && !e.target.closest('.hd-handwrap')) { S.handMenu = false; renderHand(); } return; }
  const k = a.dataset.hd;
  if (k === 'hand') { S.handMenu = !S.handMenu; renderHand(); if (S.handMenu) $('hd-handmenu')?.querySelector('button')?.focus(); return; }
  if (k === 'ask') { S.askMenu = !S.askMenu; renderHand(); if (S.askMenu) $('hd-askmenu')?.querySelector('button, input')?.focus(); return; }
  if (k === 'erase') { setPadTool(S.padTool === 'erase' ? 'pen' : 'erase'); return; }
  if (k === 'undo') { const last = S.hist.pop(); if (last) { S.strokes = JSON.parse(last); S.fresh.pop(); drawInk(); toolsState(); queueSave(); } }
  else if (k === 'clear') { if (S.strokes.length) { remember(); S.strokes = []; S.fresh = []; drawInk(); toolsState(); queueSave(); } }
  else if (k === 'switch') switchUser(a);
  else if (k === 'library') { if (PL.current()) PL.close(); if (S.view !== 'desk') { S.view = 'desk'; renderOver(); } RL.openLibrary(); }
  else if (k === 'desk' || k === 'area' || k === 'room') {
    if (k === 'desk' && PL.current()) PL.close();
    if (RL.current()) RL.close();
    S.view = k === S.view && k !== 'desk' ? 'desk' : k; renderOver();
    if (S.view === 'desk') root.querySelector('.hd-dockbtn[data-hd="desk"]')?.focus();
    else over.querySelector('.hd-back')?.focus();
  }
}
// A handout played inside the desk: the desk's own pulse rests while the game page in the layer pulses for it (one
// pulse, where: game); closing asks for the cards again, so the card shows its progress.
// Reading in the desk (step 4b): the Library and a Reading handout's routine. The desk's own pulse goes on and says what
// is being read (where: reading, the book and page); closing asks for the cards again.
const RL = readingLayer({
  host: root, classId: D.classId, path: `/class/${encodeURIComponent(D.classId)}/desk`, grade: D.libraryGrade || null, sup: () => ({ ...(S.sup || {}), read: readOn() }), k2: () => S.k2,
  onOpen: () => { root.classList.add('hd-playing'); setDock('library'); },
  onClose: () => { root.classList.remove('hd-playing'); setDock(S.view); S.hv = ''; poll(); },
  onChange: () => { S.hv = ''; poll(); },
});
// Students' lines on the room (public/js/homeroom-marks.js; services/homeroom-marks.js): when the class's teachers allow
// it, a pen and an eraser for their own lines in See the room, outside other students' desks.
const RP = roomPen({
  url: `/api/desk/${encodeURIComponent(D.classId)}/marks`, box: () => $('hd-roombox'), map: () => S.roomMap || null,
  desks: [...(D.desks || []).map(d => ({ x: +d.x || 0, y: +d.y || 0, me: !!d.me })), ...(D.teams || []).map(x => ({ x: +x.x || 0, y: +x.y || 0, team: true, me: !!x.me }))],
  colors: P.colors, limits: (D.marks || { strokes: 40, points: 300 }),
  words: { full: td('room.full'), notHere: td('room.notHere'), locked: td('room.locked') },
  onChange: () => renderRoomTools(),
});
RP.st.on = !!D.draw;
function setDock(k) { for (const b of root.querySelectorAll('.hd-dockbtn[data-hd]')) b.setAttribute('aria-pressed', String(b.dataset.hd === k)); }
const PL = gamePlayer({
  host: root, path: `/class/${encodeURIComponent(D.classId)}/desk`, back: td('playBack'),
  // (a Classroom lesson of several steps opens its own lesson page, which is never framed: x.page)
  // (a live game of the class: its player page, a seat as themselves: public/js/homeroom-livegame.js)
  find: id => { if (String(id).startsWith('live:')) return LGD ? LGD.find(id) : null; const x = S.cards.find(c => c.id === id); return x && x.href && x.ready && !x.locked && !x.page ? { href: x.href, title: x.lesson ? td('lessonTitle', { title: x.title }) : x.title, icon: x.lesson ? '📄' : x.icon } : null; },
  note: td('seen'),
  // A Manipulatives tool is the tool's own page (it has no pulse of its own): the desk keeps pulsing and says so
  // (where: tool), so the teacher's board shows that student's square in the tool's room.
  // While it is open the desk's own top bar steps aside: its Raise hand moves into the player's bar (one bar: Back, the
  // title, Raise hand), and on a phone the site's bars and the dock go too, so the game has the whole screen (hd-full).
  onOpen: id => { root.classList.add('hd-playing', 'hd-gameplay'); document.body.classList.add('hd-full'); handTo(PL.slot()); const x = S.cards.find(c => c.id === id); if (x && x.tool) S.tool = id; else if (PULSE) PULSE.pause(); },
  onClose: () => { root.classList.remove('hd-playing', 'hd-gameplay'); document.body.classList.remove('hd-full'); handTo(null); S.tool = ''; if (PULSE) PULSE.resume(); S.hv = ''; if (LGD) LGD.card(); poll(); },
});
// Live games inside Homeroom: the class's live game comes to the desk by itself (a Join card, and the player once).
const LGD = liveDeskGame({ classId: D.classId, PL });
/** Raise hand in the player's bar (slot) or back in the desk's top bar (null). */
let handEl = null;
function handTo(slot) {
  const w = handEl || (handEl = $('hd-handwrap')); if (!w) return;
  if (slot) { slot.appendChild(w); return; }
  const top = root.querySelector('.hd-top'), grow = top && top.querySelector('.hd-grow');
  if (grow) grow.after(w); else if (top) top.appendChild(w);
}

function start() {
  document.querySelector('main#main')?.classList.add('rm-main');
  S.area = (D.state && D.state.area) || {};
  renderDesk();
  applyState(D.state);
  root.addEventListener('click', click);
  root.addEventListener('submit', e => { const f = e.target.closest('.hd-askform'); if (!f) return; e.preventDefault(); sendAsk(f.querySelector('input[name="kind"]:checked')?.value || 'question', f.querySelector('#hd-askin').value); });
  root.addEventListener('keydown', e => {
    if (e.key === 'Escape' && S.handMenu) { S.handMenu = false; renderHand(); root.querySelector('[data-hd="hand"]')?.focus(); return; }
    if (e.key === 'Escape' && S.askMenu) { S.askMenu = false; renderHand(); root.querySelector('[data-hd="ask"]')?.focus(); return; }
    if (e.key === 'Escape' && S.view !== 'desk') { S.view = 'desk'; renderOver(); }
  });
  PULSE = startPulse({ classId: D.classId, where: 'desk', on: () => '', extra: () => (S.tool ? { where: 'tool', on: S.tool } : RL.pulse()), deskEl: () => root.querySelector('.hd-desk'), padEl: () => $('hd-svg'),
    onAnswer: r => liveDesk({ live: r.live, me: r.me, mates: r.mates }) });
  PULSE.setLive(S.live, S.me);
  setInterval(() => { tick(); if (S.plan && S.plan.mine) renderNow(); }, 1000);
  applySup(); wireRead(root);
  body.addEventListener('pointerdown', padDown);
  body.addEventListener('pointermove', padMove);
  body.addEventListener('pointerup', padUp); body.addEventListener('pointercancel', padUp);
  // See the room's pen (RP): presses on the room's board while the pen or the eraser is on
  over.addEventListener('pointerdown', e => { if (e.target.closest('#hd-roombox')) RP.down(e); });
  over.addEventListener('pointermove', e => RP.move(e));
  over.addEventListener('pointerup', e => RP.up(e)); over.addEventListener('pointercancel', e => RP.up(e));
  let rz = null; window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => { fitAreas(root); placeRoom(); }, 120); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) flush(); else poll(); });
  window.addEventListener('pagehide', () => { flush(); RP.flush(); });
  pollTimer = setTimeout(poll, S.live ? 3000 : 6000);
  PL.sync();   // a handout the address names (#play=<card>): open it again
  if (String(PL.current() || '').startsWith('live:')) LGD.opened();
  LGD.apply(S.livegame);
  RL.sync();   // the Library or a Reading handout the address names (#library, #read=<card>)
  // the first time on this desk: where things are (once per student; services/homeroom-intro.js)
  if (D.intro && !location.hash) deskIntro({ D, k2: S.k2 });
}
if (root && body) start();
