// Homeroom, the teacher's board (docs/homeroom.md; server: routes/homeroom.js, services/homeroom.js). Step 1a: one big
// board with the Manipulatives live room's feel and its pieces (public/js/board-view.js: pan, zoom, Fit, the zoom pill
// and the minimap; public/js/board-ann.js: pen marks and text; the room's sticky notes and its CSS), holding:
//   - the teacher's area across the top (yellow band, everyone will see it): sticky notes, text, pen and shapes, saved
//     half a second after a change (POST /api/homeroom/<class>/area), cleaned on the server like the room's area;
//   - the teacher's desk, and a desk per student with their name above it and their group's color as its border;
//   - Arrange seats: Rows, Tables of 4, U-shape, Circle, then drag any desk (or move it with the arrow keys); saved per
//     class (POST .../seats);
//   - groups the teacher names, with a color each (POST .../groups).
//   - live class (step 1b): Everyone to Homeroom starts it (students get a prompt to go to their desks), then Bring
//     everyone to me (every desk shows the teacher's area) and Pause screens ("Eyes on your teacher" on every desk);
//     End class and the projector view are in the ⋯ menu (POST .../live; docs/decisions.md "Homeroom, step 1b").
//   - Students sign in (step 1c), in the ⋯ menu: the class sign-in's QR code and code (public/js/homeroom-signin-panel.js).
//   - handing out (step 2a): tap a game in the left panel, then a desk, a group or Whole class (phones and tablets), or
//     drag it there with a mouse or pen; a sheet asks for instructions, the order on the desk, how it is graded and a
//     due day (POST .../handouts). Each desk shows its handouts with progress; tap one to see it or take it off that
//     desk or every desk (POST .../handouts/<id>/remove). The desks refresh every so often while the page is open.
//   - lessons (step 2b; public/js/homeroom-lessons.js): My lessons in the panel, "+ Build a lesson", each lesson handed
//     out like a game (tap-then-tap or drag) with its own sheet (versions by group, Score by default).
//   - step 2c: team desks (Arrange seats: Make a team from the desks picked, Split team; a team desk shows its members'
//     names, is dragged like a desk, and a handout dropped on it goes to every member; POST .../teams); a comment and a
//     sticker on a finished card (the desk's sheet; POST .../handouts/<id>/feedback); "Also post to Google Classroom" in
//     the hand-out sheet when the class is linked (Whole class only, as Classroom's Assign).
//   - step 3a, live class (public/js/homeroom-live.js): each desk's status, current handout, cursor and hand; ✋ Hands
//     with the hall pass; 📊 Today; tapping a desk looks at that student's desk (Lock desk, Hide cursor, I'm coming over).
//   - the teacher's own desk (docs/decisions.md "Homeroom: the teacher's desk"): "My desk" under the teacher's area holds
//     games, lessons and tools the teacher drops or tap-places there, even with no students in the class, to try them
//     (Play / Preview) and hand them out later (Hand out picks the item, then a desk, a group or Whole class; or the card
//     is dragged there). Staged, never assigned: students never see it (POST .../staged).
//   - the day plan (public/js/homeroom-plan.js; docs/decisions.md "Homeroom: the day plan"): planned in the Oomba chat
//     only; the top bar's plan pill shows Now with a countdown and Next, +5 min and Next while it runs, Time's up in
//     yellow (it never moves on by itself), and Finish class with a short summary. End class offers Finish class while a
//     plan runs.
//   - step 3c (public/js/homeroom-helpers.js): a desk's menu (tap the student's name) with their supports, the desk's
//     small 🧩 when they have any, a handout's simpler wording (the desk's sheet), Aides and Sub link for today in the ⋯
//     menu, "While you were out" after a sub. An aide (D.role) gets the board read-only with Hands, Today, a look at a
//     desk, comments and stickers.
import { t, api, toast, esc, pageData, sheet, ask } from '/js/app.js';
import { iconHtml } from '/js/icons.js';
import { clamp, zoomAround, fitView, applyTransform, miniHtml, miniPoint, zoomPillHtml } from '/js/board-view.js';
import { areaEditor, MAX } from '/js/homeroom-board.js';
import { GL, shapeIcon, toolStyleHtml, tb } from '/js/homeroom-board-ui.js';
import { PICKS, isLine } from '/js/board-shapes.js';
import { placePopover } from '/js/popover-place.js';
import { signinBox } from '/js/homeroom-signin-panel.js';
import { renderLessons, lessonMenu, openBuilder, lessonGiveSheet } from '/js/homeroom-lessons.js';
import { liveBoard } from '/js/homeroom-live.js';
import { gamePlayer } from '/js/homeroom-player.js';
import { planPill } from '/js/homeroom-plan.js';
import { helpers as helpersOf } from '/js/homeroom-helpers.js';
import { bookPicker } from '/js/homeroom-reading.js';
import { AREA, TEACHER_DESK, DESK, TEAM_DESK, TEAM_MAX, PRESETS, GROUP_COLORS, GROUPS_MAX, GROUP_NAME_MAX, layout, clampSeat, boardSize } from '/js/homeroom-seats.js';

const D = pageData();
// An aide (step 3c; docs/decisions.md "Homeroom: supports, aides and sub links"): the same board to watch and help, with
// nothing that changes the class (no hand-out panel, Arrange seats, board tools, My desk, removing handouts, live class's
// buttons, End class); the server refuses those to an aide anyway.
const AIDE = D.role === 'aide';
const Z_MIN = 0.12, Z_MAX = 2.5, Z_FIT = 0.05;
const MODES = ['note', 'text', 'pen', 'shape'];
const btn = (cls, attrs, label) => `<button type="button" class="${cls}" ${attrs}>${label}</button>`;
const phone = () => window.matchMedia('(max-width: 819px)').matches;
const tm = (k, v) => t(`js.manip-room.${k}`, v);
const th = (k, v) => t(`js.homeroom.${k}`, v);
const newId = () => Math.random().toString(36).slice(2, 10);

const room = D.room || {};
const H = {
  students: room.students || [], seats: room.seats || {}, preset: room.preset || 'rows', groups: room.groups || [], members: room.members || {},
  ann: { notes: [], texts: [], strokes: [], ...((room.area || {}).__ann || {}) }, shapes: Array.isArray((room.area || {}).shapes) ? room.area.shapes : [],
  view: { x: 0, y: 0, z: 0.5 }, mode: 'move', hist: [], redo: [], sels: [], edit: false, gesture: null, pointers: new Map(),
  justPanned: false, menuOpen: false, seatsOpen: false, deskSel: null, live: D.live || null, liveBusy: false,
  ho: D.handouts || { handouts: [], desks: {} }, pick: null, drag: null, giving: false, lessons: Array.isArray(D.lessons) ? D.lessons : [],
  teams: Array.isArray(room.teams) ? room.teams : [], teamPick: null, staged: Array.isArray(D.staged) ? D.staged : [], away: false,
};
const $ = id => document.getElementById(id);
const board = $('hr-board'), worldEl = $('hr-world');
// One page with Classroom and Dashboard (public/js/class-views.js): the top bar is shared, and Homeroom's buttons are in
// its Homeroom group; while another view is on screen this one is hidden (H.away): it asks for nothing, and keys go to
// the view on screen.
const barActs = () => document.querySelector('[data-cv-acts="homeroom"]');
const viewEl = board ? board.closest('.cv-view') : null;

// ---------------------------------------------------------------- groups and names
const groupOf = sid => H.groups.find(g => g.id === H.members[sid]) || null;
const groupName = g => (g.name || (g.key ? th(`groups.${g.key}`) : '')) || th('groups.unnamed');
const count = g => H.students.filter(s => H.members[s.id] === g.id).length;
function renderChips() {
  $('hr-groupchips').innerHTML = `${btn('hr-gchip whole', 'data-hrto="all"', esc(th('wholeClass', { count: H.students.length })))}${H.groups.map(g => btn('hr-gchip', `data-hrto="group:${esc(g.id)}" style="--gc:${esc(g.color)}"`, `<span class="rm-dot" style="--c:${esc(g.color)}"></span>${esc(groupName(g))} · ${count(g)}`)).join('')}
    ${btn('hr-gedit', 'data-hr="groups"', `${iconHtml('🏷️', { size: 16 })} ${esc(th('editGroups'))}`)}`;
}

// ---------------------------------------------------------------- team desks (step 2c)
const teamOf = sid => H.teams.find(x => x.members.includes(sid)) || null;
const teamById = id => H.teams.find(x => x.id === id) || null;
const soloStudents = () => H.students.filter(s => !teamOf(s.id));
const nameOfId = sid => (H.students.find(s => s.id === sid) || {}).name || '';
const teamNames = tm => tm.members.map(nameOfId).filter(Boolean).join(', ');

// ---------------------------------------------------------------- the board
const world = () => boardSize(H.seats, H.teams);
function areaInner() { return `<div class="rm-in hr-areain">${ed.html()}</div>`; }
const handout = id => H.ho.handouts.find(h => h.id === id) || null;
const cardsOf = sid => (H.ho.desks[sid] || []).filter(x => handout(x.id));
/** A handout on a desk: its icon and name, a bar (or ✓ when done, 🔒 while it waits for the ones before it). */
/** A Reading handout's step for a student (step 4b): "Reading p. 12", "Quiz", "Notes", "Done" (or "Picking a book"). */
const rdStep = rd => (!rd ? '' : rd.step === 'read' ? (rd.page ? th('rd.readingPage', { page: rd.page }) : th('rd.notStarted')) : th(`rd.${rd.step}`));
function cardRow(x, sid) {
  const h = handout(x.id), state = x.done ? th('ho.done') : x.locked ? th('ho.later') : x.pct ? th('ho.pct', { pct: x.pct }) : th('ho.notStarted');
  // A Reading handout (step 4b): the book's cover and title, and the routine's step instead of a bar.
  if (x.rd) {
    const bk = x.rd.book, step = x.done ? th('ho.done') : x.locked ? th('ho.later') : rdStep(x.rd);
    const inner = `${bk ? `<img class="hr-ccover" src="${esc(bk.cover)}" alt="" width="22" height="18" loading="lazy">` : `<span class="hr-cico" aria-hidden="true">${iconHtml('📖', { size: 14 })}</span>`}<span class="hr-ct" dir="auto">${esc(bk ? bk.title : h.title)}</span>
      ${x.done ? `<span class="hr-cdone" aria-hidden="true">✓</span>` : `<span class="hr-cstep${x.rd.step === 'quiz' || x.rd.step === 'notes' ? ' on' : ''}">${esc(step)}</span>`}<span class="sr-only">, ${esc(step)}</span>`;
    return H.seatsOpen ? `<span class="hr-card hr-rdc${x.done ? ' done' : ''}">${inner}</span>` : btn(`hr-card hr-rdc${x.done ? ' done' : ''}`, `data-hrho="${esc(x.id)}" data-sid="${esc(sid)}"`, inner);
  }
  const inner = `<span class="hr-cico" aria-hidden="true">${iconHtml(h.icon, { size: 14 })}</span><span class="hr-ct" dir="auto">${esc(h.title)}</span>
    ${x.done ? `<span class="hr-cdone" aria-hidden="true">✓</span>${x.fb && x.fb.src ? `<img class="hr-cfb" src="${esc(x.fb.src)}" alt="" width="18" height="18">` : x.fb && x.fb.comment ? `<span class="hr-cfbc" aria-hidden="true">${iconHtml('💬', { size: 12 })}</span>` : ''}` : x.locked ? `<span class="hr-clock" aria-hidden="true">${iconHtml('🔒', { size: 12 })}</span>` : `<span class="hr-cbar" aria-hidden="true"><i style="width:${x.pct}%"></i></span>`}<span class="sr-only">, ${esc(state)}</span>`;
  return H.seatsOpen ? `<span class="hr-card${x.done ? ' done' : ''}">${inner}</span>` : btn(`hr-card${x.done ? ' done' : ''}`, `data-hrho="${esc(x.id)}" data-sid="${esc(sid)}"`, inner);
}
function deskInner(s) {
  const g = groupOf(s.id), c = g ? g.color : '', cards = cardsOf(s.id), many = cards.length > 3, shown = many ? cards.slice(0, 2) : cards;
  // (the name opens the desk's menu, step 3c: supports, handouts, a look; a plain name while seats are arranged)
  const nm = `<span class="rm-dot"${c ? ` style="--c:${esc(c)}"` : ''}></span><bdi>${esc(s.name)}</bdi>${HLP ? HLP.supIcon(s.id) : ''}`;
  return `${H.seatsOpen ? `<span class="hr-name">${nm}</span>` : btn('hr-name hr-namebtn', `data-hrdmenu="${esc(s.id)}" aria-label="${esc(th('helpers.deskMenu', { name: s.name }))}" aria-haspopup="dialog"`, nm)}
    ${cards.length ? `<div class="hr-cards">${shown.map(x => cardRow(x, s.id)).join('')}${many ? (H.seatsOpen ? `<span class="hr-more">${esc(th('ho.more', { count: cards.length - 2 }))}</span>` : btn('hr-more', `data-hrdesk="${esc(s.id)}"`, esc(th('ho.more', { count: cards.length - 2 })))) : ''}</div>`
      : `<span class="hr-empty">${esc(th('emptyDesk'))}</span>${g ? `<span class="hr-gtag">${esc(groupName(g))}</span>` : ''}`}`;
}
function deskHtml(s) {
  const p = H.seats[s.id] || { x: 0, y: 0 }, g = groupOf(s.id), c = g ? g.color : '', picked = H.teamPick && H.teamPick.includes(s.id);
  return `<div class="hr-desk${H.deskSel === s.id ? ' sel' : ''}${picked ? ' picked' : ''}" data-sid="${esc(s.id)}" role="group" aria-label="${esc(th('deskOf', { name: s.name }))}"${H.seatsOpen ? ' tabindex="0"' : ''}${H.teamPick ? ` aria-pressed="${!!picked}"` : ''}
    style="left:${p.x}px;top:${p.y}px;width:${DESK.w}px;height:${DESK.h}px${c ? `;--gc:${esc(c)}` : ''}">${deskInner(s)}</div>`;
}
/** A team desk's handouts: each handout any member has, with how many of them are done (✓ when all are). */
function teamCards(tm) {
  const by = new Map();
  for (const sid of tm.members) for (const x of cardsOf(sid)) { const e = by.get(x.id) || { id: x.id, n: 0, done: 0 }; e.n++; if (x.done) e.done++; by.set(x.id, e); }
  return [...by.values()];
}
function teamInner(tm) {
  const cards = teamCards(tm), many = cards.length > 3, shown = many ? cards.slice(0, 2) : cards;
  const names = tm.members.map(sid => { const g = groupOf(sid), sup = HLP ? HLP.supIcon(sid) : ''; return H.seatsOpen || H.teamPick ? `<span class="hr-tname"><span class="rm-dot"${g ? ` style="--c:${esc(g.color)}"` : ''}></span><bdi>${esc(nameOfId(sid))}</bdi>${sup}</span>`
    : btn('hr-tname', `data-hrdesk="${esc(sid)}" aria-label="${esc(th('deskOf', { name: nameOfId(sid) }))}"`, `<span class="rm-dot"${g ? ` style="--c:${esc(g.color)}"` : ''}></span><bdi>${esc(nameOfId(sid))}</bdi>${sup}`); }).join('');
  const row = e => { const h = handout(e.id); if (!h) return ''; const all = e.done >= e.n;
    const inner = `<span class="hr-cico" aria-hidden="true">${iconHtml(h.icon, { size: 14 })}</span><span class="hr-ct" dir="auto">${esc(h.title)}</span><span class="hr-tcount${all ? ' all' : ''}">${all ? '✓' : esc(th('team.doneOf', { done: e.done, n: e.n }))}</span>`;
    return H.seatsOpen ? `<span class="hr-card${all ? ' done' : ''}">${inner}</span>` : btn(`hr-card${all ? ' done' : ''}`, `data-hrteam="${esc(tm.id)}"`, inner); };
  return `<span class="hr-name hr-teamcap">${iconHtml('🤝', { size: 16 })} <span>${esc(th('team.label'))}</span></span><div class="hr-tnames">${names}</div>
    ${cards.length ? `<div class="hr-cards">${shown.map(row).join('')}${many ? `<span class="hr-more">${esc(th('ho.more', { count: cards.length - 2 }))}</span>` : ''}</div>` : ''}
    ${H.seatsOpen && !H.teamPick ? btn('btn btn-sm hr-split', `data-hrsplit="${esc(tm.id)}"`, `${iconHtml('✂️', { size: 14 })} ${esc(th('team.split'))}`) : ''}`;
}
function teamHtml(tm) {
  return `<div class="hr-desk hr-team${H.deskSel === `team:${tm.id}` ? ' sel' : ''}" data-team="${esc(tm.id)}" role="group" aria-label="${esc(th('team.deskOf', { names: teamNames(tm) }))}"${H.seatsOpen ? ' tabindex="0"' : ''}
    style="left:${tm.x}px;top:${tm.y}px;width:${TEAM_DESK.w}px;min-height:${TEAM_DESK.h}px">${teamInner(tm)}</div>`;
}
// ---------------------------------------------------------------- the teacher's own desk (staged items)
const STAGED_SHOWN = 3;
const stagedById = id => H.staged.find(x => x.id === id) || null;
/** My desk: a card per staged game, lesson or tool (tap: Play / Preview, Hand out, Take off my desk; drag: hand out). */
function tdeskInner() {
  const list = H.staged, many = list.length > STAGED_SHOWN + 1, shown = many ? list.slice(0, STAGED_SHOWN) : list;
  const card = x => btn(`hr-scard${x.tool ? ' tool' : ''}`, `data-hrstaged="${esc(x.id)}" aria-label="${esc(th('my.cardLabel', { title: x.title }))}"`,
    `<span class="hr-cico" aria-hidden="true">${iconHtml(x.icon, { size: 20 })}</span><span class="hr-ct" dir="auto">${esc(x.title)}</span>`);
  return `<span class="hr-tdeskcap">${iconHtml('🧑‍🏫', { size: 22 })} <b>${esc(th('my.title'))}</b><span class="hr-tdesknote">${esc(th('my.note'))}</span></span>
    ${list.length ? `<div class="hr-scards">${shown.map(card).join('')}${many ? btn('hr-scard hr-smore', 'data-hrstagedall', esc(th('ho.more', { count: list.length - STAGED_SHOWN }))) : ''}</div>`
      : `<span class="hr-tdeskempty">${esc(th('my.empty'))}</span>`}`;
}
function renderTdesk() { const el = $('hr-tdesk'); if (el) el.innerHTML = tdeskInner(); renderGivebar(); }
async function stagedApi(bodyIn) {
  try {
    const r = await api(api2('staged'), { method: 'POST', body: bodyIn });
    H.staged = r.staged || []; renderTdesk(); toast(r.toast);
    return r;
  } catch (e) { toast(e.message, { bad: true }); return null; }
}
/** Put the picked game, lesson or tool on My desk (tap-then-tap or a drop on it). */
async function stagePick(p) {
  if (!p) return;
  setPick(null);
  const r = await stagedApi({ action: 'add', pick: p.id });
  if (r && r.id) worldEl.querySelector(`[data-hrstaged="${CSS.escape(r.id)}"]`)?.focus({ preventScroll: true });
}
const pickOfStaged = x => ({ id: x.pick, icon: x.icon, title: x.title, staged: x.id });
/** A card on My desk: Play / Preview (the game, the lesson's own question set, the tool), Hand out, Take off my desk. */
function stagedMenu(id) {
  const x = stagedById(id); if (!x) return;
  const play = x.href ? `<a class="btn btn-primary hr-chunk" data-sm="play" href="${esc(x.href)}">${iconHtml(x.tool ? '🧰' : x.lesson ? '👀' : '▶️', { size: 18 })} ${esc(th(x.tool ? 'my.open' : x.lesson ? 'my.preview' : 'my.play'))}</a>` : '';
  const sh = sheet({ title: `${x.icon} ${x.title}`, content: `<div class="hr-smenu"><p class="small muted">${esc(th(x.tool ? 'my.toolLead' : x.lesson ? 'my.lessonLead' : 'my.lead'))}</p>
    <div class="hr-smenuacts">${play}
      ${x.tool ? '' : btn('btn hr-chunk', 'data-sm="give"', `${iconHtml('🎒', { size: 18 })} ${esc(th('my.handOut'))}`)}
      ${btn('btn hr-chunk', 'data-sm="off"', `${iconHtml('↩️', { size: 18 })} ${esc(th('my.takeOff'))}`)}</div></div>` });
  sh.el.querySelector('.hr-smenu').addEventListener('click', async e => {
    const b = e.target.closest('[data-sm]'); if (!b) return;
    // Play / Preview opens the game over the board (public/js/homeroom-player.js); a tool, or a click for a new tab,
    // opens its page as the link it is.
    if (b.dataset.sm === 'play') { if (x.tool || e.button > 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return; e.preventDefault(); sh.close(); PL.open(x.id); return; }
    if (b.dataset.sm === 'give') { sh.close(); if (H.seatsOpen) openSeats(false); setPick(pickOfStaged(x)); return; }
    if (b.dataset.sm === 'off') { sh.close(); stagedApi({ action: 'remove', id: x.id }); }
  });
}
/** Everything on My desk, when there is more than the desk shows. */
function stagedList() {
  const sh = sheet({ title: `🧑‍🏫 ${th('my.title')}`, content: `<ul class="plain hr-slist">${H.staged.map(x => `<li>${btn('btn hr-chunk hr-sitem', `data-sl="${esc(x.id)}"`, `${iconHtml(x.icon, { size: 18 })} <span dir="auto">${esc(x.title)}</span>`)}</li>`).join('')}</ul>` });
  sh.el.addEventListener('click', e => { const b = e.target.closest('[data-sl]'); if (b) { sh.close(); stagedMenu(b.dataset.sl); } });
}

/** Only the desks again (fresh progress, a new handout), leaving the teacher's area and its edits alone. */
function renderDesks() {
  for (const s of soloStudents()) { const el = worldEl.querySelector(`.hr-desk[data-sid="${CSS.escape(s.id)}"]`); if (el) el.innerHTML = deskInner(s); }
  for (const tm of H.teams) { const el = worldEl.querySelector(`.hr-team[data-team="${CSS.escape(tm.id)}"]`); if (el) el.innerHTML = teamInner(tm); }
  LV.paint();
}
function renderWorld() {
  ed.clear();   // a fresh board: nothing selected or being typed in
  const w = world();
  worldEl.style.width = `${w.w}px`; worldEl.style.height = `${w.h}px`;
  worldEl.innerHTML = `<section class="rm-area teach${AIDE ? '' : ' editable'} hr-area${H.mode !== 'move' && MODES.includes(H.mode) ? ' drawing' : ''}" data-key="t" style="left:${AREA.x}px;top:${AREA.y}px;width:${AREA.w}px;height:${AREA.h}px" aria-label="${esc(tm('teacherArea'))}">
      <header class="rm-label">✦ ${esc(tm('teacherArea'))} · ${esc(tm('teacherAreaNote'))}</header><div class="hr-areabody">${areaInner()}</div></section>
    <div class="hr-tdesk" id="hr-tdesk"${AIDE ? ' hidden' : ''} role="group" aria-label="${esc(th('my.label'))}" style="left:${TEACHER_DESK.x}px;top:${TEACHER_DESK.y}px;width:${TEACHER_DESK.w}px;height:${TEACHER_DESK.h}px">${tdeskInner()}</div>
    ${soloStudents().map(deskHtml).join('')}${H.teams.map(teamHtml).join('')}
    ${H.students.length ? '' : AIDE ? `<p class="hr-nostudents" style="left:${AREA.x}px;top:${TEACHER_DESK.y + TEACHER_DESK.h + 46}px;width:${AREA.w}px">${esc(th('noStudents'))}</p>` : `<p class="hr-nostudents" style="left:${AREA.x}px;top:${TEACHER_DESK.y + TEACHER_DESK.h + 46}px;width:${AREA.w}px">${esc(th('noStudents'))} <a href="/class/${esc(D.classId)}?tab=students">${esc(th('addStudents'))}</a></p>`}`;
  board.classList.toggle('hr-seating', H.seatsOpen);
  applyView();
  LV.paint();
}
function renderArea() {
  const el = worldEl.querySelector('.hr-areabody'); if (!el) return;
  el.innerHTML = areaInner(); ed.renderSel();
}

// ---------------------------------------------------------------- the view
function size() { return { w: board.clientWidth || 800, h: board.clientHeight || 600 }; }
const toWorld = (cx, cy) => { const r = board.getBoundingClientRect(); return { x: (cx - r.left - H.view.x) / H.view.z, y: (cy - r.top - H.view.y) / H.view.z }; };
function applyView() {
  applyTransform(worldEl, H.view); ed.place();
  for (const p of document.querySelectorAll('#hr-zoom .rm-pct')) p.textContent = `${Math.round(H.view.z * 100)}%`;
  renderMini();
}
function zoomAt(f, sx, sy) { H.view = zoomAround(H.view, f, sx, sy, Math.min(Z_MIN, H.view.z), Z_MAX); applyView(); }
function zoomMid(f) { const s = size(); zoomAt(f, s.w / 2, s.h / 2); }
/** The free part of the board's box: right of the teacher's desk panel (under it on a phone), under the seat bar. */
function freeBox() {
  const s = size(), panel = $('hr-panel'), bar = $('hr-seatbar');
  const left = !phone() && panel ? panel.offsetWidth + 28 : 8, top = (H.seatsOpen && bar && !bar.hidden ? bar.offsetHeight + 24 : 12);
  const bottom = phone() && panel ? panel.offsetHeight + 72 : 72;
  return { left, top, w: Math.max(100, s.w - left - 16), h: Math.max(100, s.h - top - bottom) };
}
function fit() {
  const seats = [...soloStudents().map(s => ({ ...(H.seats[s.id] || { x: 0, y: 0 }), ...DESK })), ...H.teams.map(tm => ({ x: tm.x, y: tm.y, ...TEAM_DESK }))];
  const w = world(), xs = [AREA.x, ...seats.map(p => p.x)], ys = seats.map(p => p.y + p.h);
  const x0 = Math.min(...xs) - 20, x1 = Math.max(AREA.x + AREA.w, ...seats.map(p => p.x + p.w)) + 20;
  const rect = { x: x0, y: 0, w: Math.min(w.w, x1) - x0, h: Math.max(TEACHER_DESK.y + TEACHER_DESK.h + (H.students.length ? 12 : 90), ...ys) + 40 };
  H.view = fitView(rect, freeBox(), { pad: 12, zMin: Z_FIT, zMax: 1 });
  applyView();
}
function renderMini() {
  const el = $('hr-mini'); if (!el) return;
  if (phone()) { el.innerHTML = ''; return; }
  const items = [{ rect: AREA, cls: 't', c: '#FFD23F' }, { rect: TEACHER_DESK, cls: '', c: '#141414' },
    ...soloStudents().map(s => ({ rect: { ...(H.seats[s.id] || { x: 0, y: 0 }), ...DESK }, cls: '', c: (groupOf(s.id) || { color: '#B9B3A0' }).color })),
    ...H.teams.map(tm => ({ rect: { x: tm.x, y: tm.y, ...TEAM_DESK }, cls: '', c: '#B9B3A0' }))];
  el.innerHTML = miniHtml({ world: world(), items, view: H.view, size: size(), width: 150, label: tm('map') });
}
function renderZoom() {
  $('hr-zoom').innerHTML = zoomPillHtml({ z: H.view.z, attr: 'data-hr', labels: { zoom: tm('zoom'), zoomOut: tm('zoomOut'), zoomIn: tm('zoomIn'), fit: tm('fit') } });
}

// ---------------------------------------------------------------- the board tools (the teacher's area)
function renderTools() {
  const tool = (mode, icon, label, extra = '') => btn(`mp-tbtn hr-tool${H.mode === mode ? ' on' : ''}`, `data-hrmode="${mode}" aria-pressed="${H.mode === mode}"${extra}`, `${icon}<span> ${esc(label)}</span>`);
  const pick = PICKS.find(p => p.id === H.shapePick) || PICKS[0], shapeOpen = !!(H.pop && H.pop.kind === 'shapes');
  const act = (k, glyph, label, dis) => btn('mp-tbtn hr-tool', `data-hr="${k}" aria-label="${esc(label)}" title="${esc(label)}"${dis ? ' disabled' : ''}`, `${glyph}<span> ${esc(label)}</span>`);
  const style = H.mode === 'pen' ? toolStyleHtml('pen', H.style.pen, H.pop && H.pop.for === 'pen' ? H.pop.kind : null)
    : H.mode === 'shape' ? toolStyleHtml('shape', { ...(isLine(pick.k) ? H.style.line : H.style.shape), closed: !isLine(pick.k) }, H.pop && H.pop.for === 'shape' ? H.pop.kind : null) : '';
  $('hr-tools').innerHTML = `<div class="hr-toolgrid">${tool('move', iconHtml('👆', { size: 18 }), th('select'))}${tool('note', iconHtml('🗒️', { size: 18 }), tm('note'))}${tool('text', '<b class="mp-tglyph">T</b>', tm('text'))}${tool('pen', iconHtml('✎', { size: 18 }), tm('pen'))}
      ${tool('shape', shapeIcon(pick.id, 20), tb('shapes'), ` aria-haspopup="true" aria-expanded="${shapeOpen}" title="${esc(tb('shapes'))}"`)}
      ${act('undo', GL.undo, tm('undo'), !H.hist.length)}${act('redo', GL.redo, tb('redo'), !H.redo.length)}${act('paste', GL.paste, tb('paste'), false)}</div>
    ${style || H.mode === 'pen' ? `<div class="row rm-pens hr-toolrow">${style}${H.mode === 'pen' ? btn('chip', 'data-hr="clearpen"', esc(tm('clearPen'))) : ''}</div>` : ''}
    <p class="hr-toolhint small">${esc(H.mode === 'move' ? tb('hintSelect') : H.mode === 'pen' ? th('hintDraw') : H.mode === 'shape' ? tb('hintShape') : th('hintPlace'))}</p>`;
}
function setMode(m, { on = false } = {}) {
  H.mode = on ? m : H.mode === m ? 'move' : m;
  ed.clear(); if (H.pop && H.pop.for !== 'sel' && !(on && m === 'shape')) ed.closePop();
  board.classList.toggle('inking', H.mode !== 'move');
  renderTools(); renderArea();
  worldEl.querySelector('.hr-area')?.classList.toggle('drawing', H.mode !== 'move');
}
const snapshot = () => JSON.stringify({ ann: H.ann, shapes: H.shapes });
// Undo and redo (Cmd/Ctrl+Z, Shift+Cmd/Ctrl+Z or Ctrl+Y, and the Board tools' buttons): a snapshot of the area before
// each change. remember() before a change; forget() when it turned out to change nothing (the redo list comes back).
let redoKept = null;
function remember() { H.hist.push(snapshot()); if (H.hist.length > 80) H.hist.shift(); redoKept = H.redo; H.redo = []; }
function forget() { H.hist.pop(); if (redoKept) H.redo = redoKept; redoKept = null; renderTools(); }
let saveTimer = null;
function queueSave() { clearTimeout(saveTimer); saveTimer = setTimeout(saveArea, 450); renderTools(); }
async function saveArea() {
  saveTimer = null;
  const state = { __ann: { notes: H.ann.notes, strokes: H.ann.strokes, texts: H.ann.texts.filter(x => String(x.text || '').trim()) }, shapes: H.shapes };
  try { await api(`/api/homeroom/${encodeURIComponent(D.classId)}/area`, { method: 'POST', body: { state } }); } catch (e) { toast(e.message, { bad: true }); }
}
function restore(snap) { const o = JSON.parse(snap); H.ann = o.ann; H.shapes = o.shapes; H.sels = []; H.edit = false; renderArea(); queueSave(); }
function undo() { ed.finishEdit(); const last = H.hist.pop(); if (!last) return; H.redo.push(snapshot()); restore(last); }
function redo() { ed.finishEdit(); const next = H.redo.pop(); if (!next) return; H.hist.push(snapshot()); restore(next); }
/** A point inside the teacher's area, as fractions of it (null outside). */
function inArea(cx, cy, pad = 0) {
  const p = toWorld(cx, cy), x = (p.x - AREA.x) / AREA.w, y = (p.y - AREA.y) / AREA.h;
  return x < -pad || y < -pad || x > 1 + pad || y > 1 + pad ? null : { x: clamp(x, 0, 1), y: clamp(y, 0, 1) };
}
/** Back to Select after a note, a text or a shape is placed (the pen stays on until Select or Escape). */
function backToSelect() { H.mode = 'move'; board.classList.remove('inking'); worldEl.querySelector('.hr-area')?.classList.remove('drawing'); renderTools(); }
const ed = areaEditor({ H, AREA, board, stage: $('hr-stage') || board?.parentElement, worldEl, zoom: () => H.view.z, remember, forget, snapshot, queueSave, renderArea, undo, redo,
  renderPanel: () => renderTools(), setMode: m => setMode(m, { on: true }),
  areaPt: (cx, cy) => { const p = toWorld(cx, cy); return { x: p.x - AREA.x, y: p.y - AREA.y }; } });

// ---------------------------------------------------------------- Arrange seats
function renderSeatbar() {
  const el = $('hr-seatbar');
  el.hidden = !H.seatsOpen;
  document.querySelector('[data-hr="seats"]')?.setAttribute('aria-pressed', String(H.seatsOpen));
  if (!H.seatsOpen) { el.innerHTML = ''; return; }
  if (H.teamPick) {
    const n = H.teamPick.length;
    el.innerHTML = `<span class="hr-seatlead">${iconHtml('🤝', { size: 18 })} ${esc(th('team.pickLead', { max: TEAM_MAX }))}</span><span class="hr-seathint small" aria-live="polite">${esc(th('team.picked', { count: n }))}</span>
      ${btn('btn btn-sm hr-chunk', 'data-hr="teamcancel"', esc(th('ho.cancel')))}${btn('btn btn-sm btn-primary hr-chunk hr-done', `data-hr="teammake"${n >= 2 ? '' : ' disabled'}`, esc(th('team.make')))}`;
    return;
  }
  el.innerHTML = `<span class="hr-seatlead">${esc(th('seats.lead'))}</span>${PRESETS.map(p => btn(`btn btn-sm hr-chunk${H.preset === p ? ' on' : ''}`, `data-hrpreset="${p}" aria-pressed="${H.preset === p}"`, esc(th(`seats.${p}`)))).join('')}
    <span class="hr-seathint small">${esc(th('seats.hint'))}</span>${soloStudents().length >= 2 ? btn('btn btn-sm hr-chunk', 'data-hr="teampick"', `${iconHtml('🤝', { size: 16 })} ${esc(th('team.makeA'))}`) : ''}${btn('btn btn-sm hr-chunk hr-done', 'data-hr="seatsdone"', esc(th('seats.done')))}`;
}
async function teamsApi(bodyIn) {
  try {
    const r = await api(api2('teams'), { method: 'POST', body: bodyIn });
    H.teams = r.teams || []; if (r.handouts) H.ho = { handouts: r.handouts, desks: r.desks };
    return r;
  } catch (e) { toast(e.message, { bad: true }); return null; }
}
async function makeTeam() {
  const list = H.teamPick || []; if (list.length < 2) return;
  const r = await teamsApi({ action: 'make', members: list });
  if (!r) return;
  H.teamPick = null; renderSeatbar(); renderWorld(); toast(th('team.made', { names: teamNames(r.team) }));
}
async function splitTeam(id) {
  const tm = teamById(id); if (!tm) return;
  if (!(await ask({ title: th('team.split'), text: th('team.splitConfirm', { names: teamNames(tm) }), ok: th('team.split') }))) return;
  const r = await teamsApi({ action: 'split', id });
  if (!r) return;
  H.deskSel = null; renderSeatbar(); renderWorld(); toast(th('team.splitDone'));
}
let teamTimer = null;
function teamMoved(id) { clearTimeout(teamTimer); const tm = teamById(id); if (!tm) return; teamTimer = setTimeout(() => teamsApi({ action: 'move', id, x: tm.x, y: tm.y }), 300); renderMini(); }
function moveTeamEl(id) { const el = worldEl.querySelector(`.hr-team[data-team="${CSS.escape(id)}"]`), tm = teamById(id); if (el && tm) { el.style.left = `${tm.x}px`; el.style.top = `${tm.y}px`; } }
function openSeats(on = !H.seatsOpen) {
  H.seatsOpen = on; H.deskSel = null; H.menuOpen = false; H.teamPick = null; renderMenu();
  if (on && H.pick) setPick(null);
  if (on && H.mode !== 'move') setMode(H.mode);
  renderSeatbar(); renderWorld();
  if (!on) toast(th('seats.saved', { class: D.className }));
}
async function saveSeats(body) {
  try { const r = await api(`/api/homeroom/${encodeURIComponent(D.classId)}/seats`, { method: 'POST', body }); H.seats = r.seats; H.preset = r.preset; }
  catch (e) { toast(e.message, { bad: true }); }
}
async function usePreset(p) {
  const spots = layout(p, H.students.length), seats = {};
  H.students.forEach((s, i) => { seats[s.id] = spots[i]; });
  H.seats = seats; H.preset = p; renderSeatbar(); renderWorld(); fit();
  await saveSeats({ preset: p, seats });
}
let seatTimer = null;
function seatMoved(sid) { clearTimeout(seatTimer); const at = H.seats[sid]; seatTimer = setTimeout(() => saveSeats({ seats: { [sid]: at } }), 300); renderMini(); }
function moveDeskEl(sid) {
  const el = worldEl.querySelector(`.hr-desk[data-sid="${CSS.escape(sid)}"]`), p = H.seats[sid];
  if (el && p) { el.style.left = `${p.x}px`; el.style.top = `${p.y}px`; }
}

// ---------------------------------------------------------------- live class
function renderLive() {
  const el = $('hr-livebtns'), dot = $('hr-live'); if (!el) return;
  if (dot) dot.hidden = !H.live;
  $('homeroom')?.classList.toggle('hr-islive', !!H.live);
  barActs()?.classList.toggle('hr-islive', !!H.live);
  const L = H.live;
  // (the yellow button's words in a span: a phone's shared bar shows its icon only, the button keeps its name)
  const html = LV.topButtons() + (AIDE ? '' : !L ? btn('btn hr-chunk hr-spark', `data-hr="golive" aria-label="${esc(th('everyone'))}"`, `${iconHtml('🏫', { size: 18 })}<span class="hr-sparkt"> ${esc(th('everyone'))}</span>`)
    : `${btn(`btn hr-chunk hr-pausebtn${L.paused ? ' on' : ''}`, `data-hr="${L.paused ? 'resume' : 'pause'}" aria-pressed="${L.paused}" aria-label="${esc(th(L.paused ? 'resume' : 'pause'))}"`, `${iconHtml('👀', { size: 18 })}<span class="hr-hidephone"> ${esc(th(L.paused ? 'resume' : 'pause'))}</span>`)}
      ${btn('btn hr-chunk hr-spark', `data-hr="${L.bring ? 'back' : 'bring'}" aria-pressed="${L.bring}" aria-label="${esc(th(L.bring ? 'back' : 'bring'))}"`, `${iconHtml(L.bring ? '🎒' : '🙋', { size: 18 })}<span class="hr-sparkt"> ${esc(th(L.bring ? 'back' : 'bring'))}</span>`)}`);
  // the poll redraws this every 2 s while live: only when something changed, so the focus stays put
  if (html !== liveHtml) { liveHtml = html; el.innerHTML = html; }
}
let liveHtml = '';
const LIVE_TOAST = { start: 'started', bring: 'bringing', back: 'backToDesks', pause: 'paused', resume: 'resumed', end: 'ended' };
async function liveAction(action) {
  if (H.liveBusy) return;
  // A plan still running: End class offers Finish class (its short summary; unfinished handouts stay as homework).
  if (action === 'end' && PLAN && PLAN.running()) {
    if (!(await PLAN.finishForEnd(th('endClass')))) return;
  } else if (action === 'end' && !(await ask({ title: th('endClass'), text: th('endConfirm'), ok: th('endClass') }))) return;
  H.liveBusy = true;
  try {
    const r = await api(`/api/homeroom/${encodeURIComponent(D.classId)}/live`, { method: 'POST', body: { action } });
    const was = !!H.live;
    H.live = r.live || null; renderLive(); toast(th(LIVE_TOAST[action]));
    if (was !== !!H.live) LV.onLive();
  } catch (e) { toast(e.message, { bad: true }); } finally { H.liveBusy = false; }
}

// ---------------------------------------------------------------- the ⋯ menu and groups
function renderMenu() {
  const el = $('hr-menu');
  document.querySelector('[data-hr="menu"]')?.setAttribute('aria-expanded', String(H.menuOpen));
  if (!H.menuOpen) { el.innerHTML = ''; return; }
  el.innerHTML = `<div class="rm-menu panel hr-menu" role="menu"><div class="rm-menu-body">
    ${AIDE ? '' : `${btn('rm-mi', 'role="menuitem" data-hr="seats"', `${iconHtml('🔀', { size: 18 })} ${esc(th('arrange'))}`)}
    ${btn('rm-mi', 'role="menuitem" data-hr="groups"', `${iconHtml('🏷️', { size: 18 })} ${esc(th('editGroups'))}`)}
    ${btn('rm-mi', 'role="menuitem" data-hr="signin"', `${iconHtml('🔑', { size: 18 })} ${esc(th('signin'))}`)}
    ${btn('rm-mi', 'role="menuitem" data-hr="aides"', `${iconHtml('🤝', { size: 18 })} ${esc(th('helpers.aides'))}`)}
    ${btn('rm-mi', 'role="menuitem" data-hr="sublink"', `${iconHtml('🔗', { size: 18 })} ${esc(th('helpers.subMenu'))}`)}`}
    ${D.hostLive && !AIDE ? `<a class="rm-mi" role="menuitem" href="${esc(D.hostLive)}" data-hr="hostlive">${iconHtml('📡', { size: 18 })} ${esc(th('hostLive'))}</a>` : ''}
    <a class="rm-mi" role="menuitem" href="/class/${esc(encodeURIComponent(D.classId))}/homeroom/projector" target="_blank" rel="noopener" data-hr="projector">${iconHtml('📽️', { size: 18 })} ${esc(th('projector'))}</a>
    ${H.live && !AIDE ? btn('rm-mi hr-end', 'role="menuitem" data-hr="end"', `${iconHtml('⏹️', { size: 18 })} ${esc(th('endClass'))}`) : ''}</div></div>`;
  placePopover(el.firstElementChild, document.querySelector('[data-hr="menu"]'));
  el.querySelector('button')?.focus();
}
// Students sign in (step 1c): the class sign-in's QR code and code, open or closed, in a sheet.
async function signinSheet() {
  H.menuOpen = false; renderMenu();
  const sh = sheet({ title: `🔑 ${th('signin')}`, content: `<div class="hs-sheet" id="hr-signbox"><p class="muted">${esc(th('loadingSignin'))}</p></div>` });
  const el = sh.el.querySelector('#hr-signbox');
  try { const r = await api(`/api/homeroom/${encodeURIComponent(D.classId)}/signin`); signinBox(el, D.classId, r.signin, { panelLink: true }); }
  catch (e) { el.innerHTML = `<p class="err">${esc(e.message)}</p>`; }
}
function groupsSheet() {
  H.menuOpen = false; renderMenu();
  let groups = H.groups.map(g => ({ ...g, name: groupName(g) })), members = { ...H.members };
  const draw = () => `<p class="small muted">${esc(th('groupsLead'))}</p>
    <ol class="hr-glist">${groups.map((g, i) => `<li><span class="rm-dot" style="--c:${esc(g.color)}"></span>
      <label class="sr-only" for="hrg-${i}">${esc(th('groupName', { n: i + 1 }))}</label><input class="input input-sm" id="hrg-${i}" data-gname="${i}" maxlength="${GROUP_NAME_MAX}" value="${esc(g.name)}">
      <span class="hr-swatches" role="radiogroup" aria-label="${esc(th('groupColor', { n: i + 1 }))}">${GROUP_COLORS.map((c, k) => `<button type="button" class="hr-sw${g.color === c ? ' on' : ''}" role="radio" aria-checked="${g.color === c}" data-gcolor="${i}:${c}" style="background:${c}" aria-label="${esc(th('colorN', { n: k + 1 }))}"></button>`).join('')}</span>
      ${groups.length > 1 ? btn('btn btn-sm', `data-gdel="${i}" aria-label="${esc(th('removeGroup', { name: g.name || th('groups.unnamed') }))}"`, '×') : ''}</li>`).join('')}</ol>
    ${groups.length < GROUPS_MAX ? btn('btn btn-sm', 'data-gadd', `+ ${esc(th('addGroup'))}`) : ''}
    <h3 class="hr-gsub">${esc(th('whoIsIn'))}</h3>
    ${H.students.length ? `<ul class="plain hr-gstudents">${H.students.map(s => `<li><label for="hrm-${esc(s.id)}"><bdi>${esc(s.name)}</bdi></label><select class="input input-sm" id="hrm-${esc(s.id)}" data-gmember="${esc(s.id)}">
      <option value="">${esc(th('noGroup'))}</option>${groups.map(g => `<option value="${esc(g.id)}"${members[s.id] === g.id ? ' selected' : ''}>${esc(g.name || th('groups.unnamed'))}</option>`).join('')}</select></li>`).join('')}</ul>` : `<p class="small muted">${esc(th('noStudents'))}</p>`}
    <div class="row hr-gacts">${btn('btn btn-primary', 'data-gsave', esc(th('save')))}</div>`;
  const sh = sheet({ title: `🏷️ ${th('groupsTitle')}`, content: draw() });
  const body = sh.el.querySelector('.sheet-body');
  const read = () => { for (const inp of body.querySelectorAll('[data-gname]')) groups[+inp.dataset.gname].name = inp.value; for (const sel of body.querySelectorAll('[data-gmember]')) { if (sel.value) members[sel.dataset.gmember] = sel.value; else delete members[sel.dataset.gmember]; } };
  const redraw = () => { body.innerHTML = draw(); };
  body.addEventListener('click', async e => {
    const c = e.target.closest('[data-gcolor]');
    if (c) { read(); const [i, col] = c.dataset.gcolor.split(':'); groups[+i].color = col; redraw(); body.querySelector(`[data-gcolor="${i}:${col}"]`)?.focus(); return; }
    const del = e.target.closest('[data-gdel]');
    if (del) { read(); const g = groups.splice(+del.dataset.gdel, 1)[0]; for (const k of Object.keys(members)) if (members[k] === g.id) delete members[k]; redraw(); return; }
    if (e.target.closest('[data-gadd]')) {
      read(); const used = new Set(groups.map(g => g.color));
      groups.push({ id: `g${newId()}`, name: '', color: GROUP_COLORS.find(x => !used.has(x)) || GROUP_COLORS[0] }); redraw();
      body.querySelector(`[data-gname="${groups.length - 1}"]`)?.focus(); return;
    }
    if (e.target.closest('[data-gsave]')) {
      read();
      // A default group whose name was left as it was keeps following the teacher's language.
      const out = groups.map(g => { const d = g.key && g.name.trim() === th(`groups.${g.key}`); return { id: g.id, ...(g.key && (d || !g.name.trim()) ? { key: g.key } : {}), name: d ? '' : g.name.trim(), color: g.color }; });
      if (out.some(g => !g.name && !g.key)) { toast(th('needName'), { bad: true }); return; }
      try {
        const r = await api(`/api/homeroom/${encodeURIComponent(D.classId)}/groups`, { method: 'POST', body: { groups: out, members } });
        H.groups = r.groups; H.members = r.members; sh.close(); renderChips(); renderWorld(); toast(th('groupsSaved'));
      } catch (err) { toast(err.message, { bad: true }); }
    }
  });
}

// ---------------------------------------------------------------- handing out (step 2a)
// Tap a game in the panel (it stays picked: the yellow bar says what to do), then a desk, a group chip or Whole class.
// With a mouse or a pen the game can also be dragged there. Then the sheet: instructions, order, grading, due day.
const api2 = path => `/api/homeroom/${encodeURIComponent(D.classId)}/${path}`;
function setPick(p) {
  H.pick = p;
  for (const b of document.querySelectorAll('[data-hritem]')) b.setAttribute('aria-pressed', String(!!p && b.dataset.hritem === p.id));
  $('homeroom').classList.toggle('hr-picking', !!p);
  $('homeroom').classList.toggle('hr-picking-mine', !!(p && p.staged));
  renderGivebar();
}
function renderGivebar() {
  let el = $('hr-givebar');
  if (!el) { el = document.createElement('div'); el.id = 'hr-givebar'; el.className = 'hr-givebar'; el.setAttribute('role', 'status'); $('hr-seatbar').after(el); }
  el.hidden = !H.pick || H.seatsOpen || H.giving;
  // The groups and Whole class again in the bar, so they are one tap away wherever the panel is scrolled (a phone).
  const onMine = H.pick && H.staged.some(x => x.pick === H.pick.id);
  const chips = [...(H.pick && H.pick.id.startsWith('T:') ? [] : [btn('hr-gchip whole', 'data-hrto="all"', esc(th('ho.wholeClass'))), ...H.groups.filter(g => count(g)).map(g => btn('hr-gchip', `data-hrto="group:${esc(g.id)}" style="--gc:${esc(g.color)}"`, `<span class="rm-dot" style="--c:${esc(g.color)}"></span>${esc(groupName(g))}`))]),
    ...(onMine || (H.pick && H.pick.id.startsWith('R:')) ? [] : [btn('hr-gchip mine', 'data-hrto="me"', `${iconHtml('🧑‍🏫', { size: 14 })} ${esc(th('my.title'))}`)])].join('');
  el.innerHTML = H.pick ? `<span class="hr-giveico" aria-hidden="true">${iconHtml(H.pick.icon, { size: 20 })}</span><span class="hr-givet"><b dir="auto">${esc(H.pick.title)}</b> <span>${esc(th(H.pick.id.startsWith('T:') ? 'my.tapMine' : onMine ? 'ho.tapWhere' : 'my.tapWhere'))}</span></span>
    <span class="hr-giveto">${chips}</span>${btn('btn btn-sm hr-chunk', 'data-hr="unpick"', esc(th('ho.cancel')))}` : '';
}
const pickFrom = b => ({ id: b.dataset.hritem, icon: b.dataset.icon || '🎮', title: b.querySelector('.hr-itemt')?.textContent || '' });
// ---------------------------------------------------------------- lessons (step 2b)
const lessonOfPick = p => (p && p.id.startsWith('L:') ? H.lessons.find(l => l.id === p.id.slice(2)) || null : null);
const lessonCtx = {
  D, H, th, api2: path => api2(path), groupName, gcField, gcPicked, emptyNote, putLabel,
  onLessons: list => { H.lessons = list; if (H.pick && H.pick.id.startsWith('L:') && !lessonOfPick(H.pick)) setPick(null); renderLessons(lessonCtx); },
  onHanded: r => { H.ho = { handouts: r.handouts, desks: r.desks }; setPick(null); renderDesks(); toast(r.toast); },
};
/** The groups with students in a target, and how many of them have no group (the lesson sheet's versions by group). */
function groupsIn(to) {
  const ids = to.kind === 'all' ? H.students.map(s => s.id) : to.kind === 'group' ? H.students.filter(s => H.members[s.id] === to.id).map(s => s.id) : to.kind === 'team' ? (teamById(to.id) || { members: [] }).members : [to.id];
  return { groupsIn: H.groups.map(g => ({ g, n: ids.filter(id => H.members[id] === g.id).length })).filter(x => x.n), none: ids.filter(id => !H.groups.some(g => g.id === H.members[id])).length };
}
/** Where a drop or a tap lands: a desk, a group chip or Whole class. */
function targetAt(el) {
  if (!el) return null;
  const chip = el.closest('[data-hrto]');
  if (chip) { const v = chip.dataset.hrto; return v === 'all' ? { kind: 'all' } : v === 'me' ? { kind: 'me' } : { kind: 'group', id: v.slice(6) }; }
  if (el.closest('.hr-tdesk') && !H.seatsOpen) return { kind: 'me' };
  const desk = el.closest('.hr-desk');
  if (!desk || H.seatsOpen) return null;
  return desk.dataset.team ? { kind: 'team', id: desk.dataset.team } : { kind: 'desk', id: desk.dataset.sid };
}
function whoLabel(to) {
  if (to.kind === 'all') return { label: th('ho.wholeClass'), n: H.students.length };
  if (to.kind === 'group') { const g = H.groups.find(x => x.id === to.id); return { label: g ? groupName(g) : '', n: g ? count(g) : 0 }; }
  if (to.kind === 'team') { const tm = teamById(to.id); return { label: tm ? th('team.forNames', { names: teamNames(tm) }) : '', n: tm ? tm.members.length : 0 }; }
  const s = H.students.find(x => x.id === to.id); return { label: s ? s.name : '', n: 1 };
}
/** "Also post to Google Classroom" (step 2c), when this teacher can post to the class's linked Classroom class. Only a
 *  Whole class handout goes there (in Classroom it would reach the whole course), as with Classroom's Assign. */
function gcField(to) {
  if (!D.gc) return '';
  const whole = to.kind === 'all';
  return `<label class="hr-gcalso${whole ? '' : ' off'}"><input type="checkbox" class="hr-gcpost"${whole ? '' : ' disabled'}> <span>${iconHtml('🎓', { size: 18 })} ${esc(th('ho.gcAlso'))}</span></label>
    <p class="small muted hr-seghint">${esc(th(whole ? 'ho.gcHint' : 'ho.gcWholeOnly'))}</p>`;
}
/** Whole class with nobody in the class yet: a calm note (it waits for whoever joins) and the sheet's button. */
function emptyNote(to, who) { return to.kind === 'all' && !who.n ? `<p class="hr-emptynote" role="note">${iconHtml('🌱', { size: 18 })} ${esc(th('ho.noStudentsYet'))}</p>` : ''; }
function putLabel(to, who) { return to.kind === 'all' && !who.n ? th('ho.putClass') : who.n === 1 && to.kind === 'desk' ? th('ho.putOne') : th('ho.putMany', { count: who.n }); }
function gcPicked(f) { const c = f.querySelector('.hr-gcpost'); return !!(c && c.checked); }
/** The handout sheet (the mockup's "Game · free play"): instructions, Order on the desk, Grade it by, a due day. */
function giveSheet(to) {
  const p = H.pick; if (!p) return;
  if (to.kind === 'me' && p.id.startsWith('R:')) { toast(th('rd.notMine')); return; }
  if (to.kind === 'me') { stagePick(p); return; }
  if (p.id.startsWith('T:')) { toast(th('my.toolSoon')); return; }
  const reading = p.id.startsWith('R:');
  const who = whoLabel(to);
  // Whole class works with nobody in the class yet: it waits for whoever joins (the sheet says so).
  if (!who.n && to.kind !== 'all') { toast(th('ho.emptyGroup'), { bad: true }); return; }
  const lesson = lessonOfPick(p);
  if (p.id.startsWith('L:') && !lesson) { setPick(null); return; }
  H.giving = true; renderGivebar();
  if (lesson) { lessonGiveSheet(lessonCtx, lesson, to, who, { ...groupsIn(to), onClose: () => { H.giving = false; renderGivebar(); } }); return; }
  const seg = (name, opts, on) => `<div class="hr-seg" role="radiogroup" aria-labelledby="hrg-${name}">${opts.map(([v, label]) => btn(`hr-segb${v === on ? ' on' : ''}`, `role="radio" aria-checked="${v === on}" data-seg="${name}" data-v="${v}"`, esc(label))).join('')}</div>`;
  const max = D.instructionsMax || 300;
  const sh = sheet({
    title: `${p.icon} ${th('ho.title', { game: p.title, who: who.label })}`,
    onClose: () => { H.giving = false; renderGivebar(); },
    content: `<form class="hr-giveform" novalidate><p class="hr-eyebrow">${esc(th(reading ? 'rd.eyebrow' : 'ho.eyebrow'))}</p><p class="small muted">${esc(th(reading ? (p.id === 'R:' ? 'rd.leadAny' : 'rd.leadBook') : 'ho.lead'))}</p>${emptyNote(to, who)}
      <label class="hr-label" for="hr-ins">${esc(th('ho.instructions'))}</label>
      <textarea class="input hr-ins" id="hr-ins" rows="3" maxlength="${max}" placeholder="${esc(th('ho.instructionsPh'))}"></textarea>
      <p class="small muted hr-count" id="hr-inscount" aria-live="polite">${esc(th('ho.left', { count: max }))}</p>
      <p class="hr-label" id="hrg-order">${esc(th('ho.order'))}</p>${seg('order', [['in', th('ho.inOrder')], ['any', th('ho.anyOrder')]], 'in')}
      <p class="small muted hr-seghint" id="hr-orderhint">${esc(th('ho.inOrderHint'))}</p>
      <p class="hr-label" id="hrg-grade">${esc(th('ho.grade'))}</p>${seg('grade', [['score', th('ho.score')], ['completion', th('ho.completion')], ['none', th('ho.notGraded')]], 'completion')}
      <p class="small muted hr-seghint" id="hr-gradehint">${esc(th('ho.completionHint'))}</p>
      <label class="hr-label" for="hr-due">${esc(th('ho.due'))}</label><input class="input hr-due" type="date" id="hr-due">
      ${gcField(to)}
      <p class="err" id="hr-giveerr" aria-live="polite"></p>
      <div class="row hr-giveacts">${btn('btn', 'data-give="cancel"', esc(th('ho.cancel')))}<button class="btn btn-primary hr-giveok" type="submit">${esc(putLabel(to, who))}</button></div></form>`,
  });
  const f = sh.el.querySelector('form'), val = { order: 'in', grade: 'completion' };
  const hints = { in: 'inOrderHint', any: 'anyOrderHint', score: 'scoreHint', completion: 'completionHint', none: 'notGradedHint' };
  // Reading (step 4b): Completion is the whole routine; Score is the quiz's % right
  if (reading) { hints.score = 'rdScoreHint'; hints.completion = 'rdCompletionHint'; f.querySelector('#hr-gradehint').textContent = th('ho.rdCompletionHint'); }
  const ins = f.querySelector('#hr-ins');
  ins.addEventListener('input', () => { f.querySelector('#hr-inscount').textContent = th('ho.left', { count: Math.max(0, max - ins.value.length) }); });
  f.addEventListener('click', e => {
    const b = e.target.closest('[data-seg]');
    if (b) {
      val[b.dataset.seg] = b.dataset.v;
      for (const x of f.querySelectorAll(`[data-seg="${b.dataset.seg}"]`)) { const on = x === b; x.classList.toggle('on', on); x.setAttribute('aria-checked', String(on)); }
      f.querySelector(b.dataset.seg === 'order' ? '#hr-orderhint' : '#hr-gradehint').textContent = th(`ho.${hints[b.dataset.v]}`);
      return;
    }
    if (e.target.closest('[data-give="cancel"]')) sh.close();
  });
  f.addEventListener('submit', async e => {
    e.preventDefault();
    const ok = f.querySelector('.hr-giveok'); ok.disabled = true;
    try {
      const common = { to, instructions: ins.value, order: val.order, grade: val.grade, dueAt: f.querySelector('#hr-due').value || null, gcPost: gcPicked(f) };
      const r = await api(api2('handouts'), { method: 'POST', body: reading ? { reading: true, bookId: p.id.slice(2), ...common } : { gameId: p.id, ...common } });
      H.ho = { handouts: r.handouts, desks: r.desks }; sh.close(); setPick(null); renderDesks(); toast(r.toast);
    } catch (err) { f.querySelector('#hr-giveerr').textContent = err.message; ok.disabled = false; }
  });
  requestAnimationFrame(() => ins.focus());
}
/** Reading (step 4b): "Choose a book" opens the Story Library's books (the class's grade first); a book picked is
 *  handed out like a game (tap a desk, a group or Whole class). */
function bookSheet() {
  const sh = sheet({ title: `📚 ${th('rd.chooseTitle')}`, content: `<div class="hr-booksheet"><p class="small muted">${esc(th('rd.chooseLead'))}</p><div id="hr-bookpick"></div></div>` });
  sh.el.classList.add('hr-booksheetwrap');
  bookPicker(sh.el.querySelector('#hr-bookpick'), { grade: D.libraryGrade || null, pickLabel: b => th('rd.pickLabel', { title: b.title }),
    onPick: b => { sh.close(); if (H.seatsOpen) openSeats(false); setPick({ id: `R:${b.id}`, icon: '📖', title: b.title }); } });
}
/** Clicks for handing out; true when it took the click. */
function giveClick(e) {
  const item = e.target.closest('[data-hritem]');
  if (item) { if (H.drag && H.drag.dropped) { H.drag = null; return true; } const p = pickFrom(item); setPick(H.pick && H.pick.id === p.id ? null : p); return true; }
  if (e.target.closest('[data-hr="unpick"]')) { setPick(null); return true; }
  const sc = e.target.closest('[data-hrstaged]');
  if (sc && H.drag && H.drag.dropped) { H.drag = null; return true; }
  if (sc && !H.pick) { stagedMenu(sc.dataset.hrstaged); return true; }
  if (e.target.closest('[data-hrstagedall]') && !H.pick) { stagedList(); return true; }
  const lm = e.target.closest('[data-hrlmore]'); if (lm) { lessonMenu(lessonCtx, lm.dataset.hrlmore); return true; }
  if (e.target.closest('[data-hr="build"]')) { openBuilder(lessonCtx); return true; }
  const ho = e.target.closest('[data-hrho]'), more = e.target.closest('[data-hrdesk]'), tcard = e.target.closest('[data-hrteam]');
  if (H.pick && !H.seatsOpen) {
    const to = targetAt(e.target);
    if (to) { giveSheet(to); return true; }
  } else if (e.target.closest('[data-hrto]')) { toast(th('ho.pickFirst')); return true; }
  else if (e.target.closest('.hr-tdesk') && !H.seatsOpen && !e.target.closest('button, a')) { toast(th('my.pickFirst')); return true; }
  const dmenu = e.target.closest('[data-hrdmenu]');
  if (dmenu) { HLP.deskMenu(dmenu.dataset.hrdmenu); return true; }
  if (ho) { deskSheet(ho.dataset.sid, ho.dataset.hrho); return true; }
  if (tcard) { teamSheet(tcard.dataset.hrteam); return true; }
  if (more && more.classList.contains('hr-tname')) { HLP.deskMenu(more.dataset.hrdesk); return true; }
  if (more) { deskSheet(more.dataset.hrdesk); return true; }
  return false;
}
// Drag with a mouse or a pen (a finger scrolls the panel, so touch uses tap-then-tap).
function dragStart(e) {
  const item = e.target.closest('[data-hritem]');
  if (!item || e.pointerType === 'touch' || e.button > 0 || H.seatsOpen) return;
  H.drag = { p: pickFrom(item), sx: e.clientX, sy: e.clientY, ghost: null, dropped: false };
}
function stagedDragStart(e) {
  const card = e.target.closest('[data-hrstaged]');
  if (!card || e.button > 0 || H.seatsOpen || H.pick) return;
  const x = stagedById(card.dataset.hrstaged); if (!x || x.tool) return;
  H.drag = { p: pickOfStaged(x), sx: e.clientX, sy: e.clientY, ghost: null, dropped: false, staged: true };
}
function dragMove(e) {
  const d = H.drag; if (!d || d.dropped) return;
  if (!d.ghost) {
    if (Math.abs(e.clientX - d.sx) + Math.abs(e.clientY - d.sy) < 8) return;
    d.ghost = document.createElement('div'); d.ghost.className = 'hr-ghost'; d.ghost.setAttribute('aria-hidden', 'true');
    d.ghost.innerHTML = `${iconHtml(d.p.icon, { size: 18 })}<span dir="auto">${esc(d.p.title)}</span>`; document.body.appendChild(d.ghost);
    setPick(d.p);
  }
  d.ghost.style.transform = `translate(${e.clientX + 12}px, ${e.clientY + 12}px)`;
  for (const el of document.querySelectorAll('.hr-droptarget')) el.classList.remove('hr-droptarget');
  const under = document.elementFromPoint(e.clientX, e.clientY), at = under && (under.closest('[data-hrto]') || under.closest('.hr-desk') || (d.staged ? null : under.closest('.hr-tdesk')));
  if (at) at.classList.add('hr-droptarget');
}
function dragEnd(e) {
  const d = H.drag; if (!d || d.dropped) return;
  if (!d.ghost) { H.drag = null; return; }
  d.ghost.remove(); d.dropped = true;
  for (const el of document.querySelectorAll('.hr-droptarget')) el.classList.remove('hr-droptarget');
  const to = e.type === 'pointerup' ? targetAt(document.elementFromPoint(e.clientX, e.clientY)) : null;
  H.justPanned = false;
  // a card dragged off My desk and dropped back on it: nothing to do
  if (to && !(d.staged && to.kind === 'me')) giveSheet(to); else setPick(null);
  setTimeout(() => { if (H.drag === d) H.drag = null; }, 400);
}
/** A desk's handouts: each with its state and instructions, and Remove from this desk / from every desk. */
function deskSheet(sid, first = null) {
  const s = H.students.find(x => x.id === sid); if (!s) return;
  const draw = () => {
    const cards = cardsOf(sid);
    return cards.length ? `<ol class="plain hr-dlist">${cards.map(x => { const h = handout(x.id); return `<li class="hr-ditem${x.id === first ? ' first' : ''}${x.done ? ' done' : ''}">
      <div class="hr-dhead"><span class="hr-cico" aria-hidden="true">${iconHtml(h.icon, { size: 20 })}</span><b dir="auto">${esc(h.title)}</b>
        <span class="hr-dstate">${esc(x.done ? th('ho.done') : x.locked ? th('ho.later') : x.pct ? th('ho.pct', { pct: x.pct }) : th('ho.notStarted'))}</span></div>
      ${h.instructions ? `<p class="hr-dins" dir="auto">${esc(h.instructions)}</p>` : ''}${x.rd ? rdBlock(x, sid, s.name) : ''}
      <p class="small muted">${esc([...(h.lesson ? [th('ho.lesson'), ...(h.version ? [th('ho.version', { name: h.version })] : [])] : []), th(h.inOrder ? 'ho.inOrder' : 'ho.anyOrder'), th(`ho.${{ score: 'score', completion: 'completion', none: 'notGraded' }[h.grade]}`), h.target === 'all' ? th('ho.wholeClass') : th('ho.onDesks', { count: h.students }), x.score !== null && x.score !== undefined ? th('ho.best', { score: x.score }) : ''].filter(Boolean).join(' · '))}</p>
      ${x.done ? fbBlock(x, edit === x.id) : ''}
      ${!AIDE && H.simples && H.simples[x.id] ? `<p class="hr-dsimple" dir="auto"><b>${iconHtml('✏️', { size: 14 })} ${esc(th('helpers.simpler'))}:</b> ${esc(H.simples[x.id])}</p>` : ''}
      <div class="row">${x.done && edit !== x.id ? btn('btn btn-sm', `data-fbedit="${esc(x.id)}"`, `${iconHtml('💬', { size: 16 })} ${esc(th(x.fb ? 'feedback.edit' : 'feedback.add'))}`) : ''}${AIDE ? '' : `${btn('btn btn-sm', `data-simpler="${esc(x.id)}"`, `${iconHtml('✏️', { size: 16 })} ${esc(th('helpers.simpler'))}`)}${btn('btn btn-sm', `data-rm="${esc(x.id)}"`, `${iconHtml('↩️', { size: 16 })} ${esc(th('ho.removeOne', { name: s.name }))}`)}${btn('btn btn-sm btn-danger', `data-rmall="${esc(x.id)}"`, `${iconHtml('🗑️', { size: 16 })} ${esc(th('ho.removeAll'))}`)}`}</div></li>`; }).join('')}</ol>`
      : `<p class="muted">${esc(th('emptyDesk'))}</p>`;
  };
  // A Reading handout (step 4b): the book, the step, the quiz's result, and its 3 notes (a page of the student's notebook,
  // read only; never for an aide).
  const rdBlock = (x) => {
    const rd = x.rd, bk = rd.book;
    return `<div class="hr-drd">${bk ? `<img src="${esc(bk.cover)}" alt="" width="64" height="48" loading="lazy">` : ''}<p><b dir="auto">${esc(bk ? bk.title : th('rd.noBook'))}</b><span class="small">${esc(x.done ? th('ho.done') : rdStep(rd))}${rd.total ? ` · ${esc(th('rd.quizScore', { right: rd.right, total: rd.total }))}` : ''}</span></p>
      ${rd.notes && !AIDE ? btn('btn btn-sm', `data-rdnotes="${esc(rd.notes)}"`, `${iconHtml('📒', { size: 16 })} ${esc(th('rd.readNotes'))}`) : ''}</div>`;
  };
  // A comment and a sticker on a finished card (step 2c): shown, or the little editor (one at a time).
  let edit = null, pickSt = '';
  const fbBlock = (x, editing) => {
    const f = x.fb || null;
    if (!editing) return f ? `<div class="hr-fbshow">${f.src ? `<img src="${esc(f.src)}" alt="${esc(((D.stickers || []).find(z => z.k === f.sticker) || {}).label || '')}" width="48" height="48">` : ''}${f.comment ? `<p dir="auto">${esc(f.comment)}</p>` : ''}</div>` : '';
    const max = D.commentMax || 140;
    return `<div class="hr-fbedit" data-fbbox="${esc(x.id)}"><label class="hr-label" for="hr-fbc">${esc(th('feedback.comment'))}</label>
      <textarea class="input hr-fbc" id="hr-fbc" rows="2" maxlength="${max}" placeholder="${esc(th('feedback.commentPh'))}">${esc(f ? f.comment : '')}</textarea>
      <p class="hr-label" id="hr-fbsl">${esc(th('feedback.sticker'))}</p>
      <div class="hr-stickers" role="radiogroup" aria-labelledby="hr-fbsl">${btn(`hr-st none${!pickSt ? ' on' : ''}`, `role="radio" aria-checked="${!pickSt}" data-fbst=""`, esc(th('feedback.noSticker')))}${(D.stickers || []).map(st => btn(`hr-st${pickSt === st.k ? ' on' : ''}`, `role="radio" aria-checked="${pickSt === st.k}" data-fbst="${esc(st.k)}" aria-label="${esc(st.label)}"`, `<img src="${esc(st.src)}" alt="" width="44" height="44" loading="lazy">`)).join('')}</div>
      <p class="small muted">${esc(th('feedback.private'))}</p><p class="err" id="hr-fberr" aria-live="polite"></p>
      <div class="row">${btn('btn btn-sm', 'data-fbcancel', esc(th('ho.cancel')))}${f ? btn('btn btn-sm', `data-fbclear="${esc(x.id)}"`, esc(th('feedback.remove'))) : ''}${btn('btn btn-sm btn-primary', `data-fbsave="${esc(x.id)}"`, esc(th('save')))}</div></div>`;
  };
  const sh = sheet({ title: `🎒 ${th('deskOf', { name: s.name })}`, content: `<div class="row hr-dsupbtn">${btn('btn btn-sm', 'data-dsup', `${iconHtml('🧩', { size: 16 })} ${esc(th('helpers.supports'))}`)}</div><div class="hr-dsheet">${draw()}</div>` });
  sh.el.querySelector('[data-dsup]').addEventListener('click', () => { sh.close(); HLP.deskMenu(sid); });
  const box = sh.el.querySelector('.hr-dsheet');
  box.querySelector('.hr-ditem.first')?.scrollIntoView({ block: 'nearest' });
  const saveFb = async (id, comment, sticker) => {
    try {
      const r = await api(api2(`handouts/${encodeURIComponent(id)}/feedback`), { method: 'POST', body: { studentId: sid, comment, sticker } });
      H.ho = { handouts: r.handouts, desks: r.desks }; edit = null; renderDesks(); box.innerHTML = draw(); toast(r.toast);
    } catch (err) { const el = box.querySelector('#hr-fberr'); if (el) el.textContent = err.message; else toast(err.message, { bad: true }); }
  };
  box.addEventListener('click', async e => {
    const rn = e.target.closest('[data-rdnotes]');
    if (rn) { sh.close(); import(`/js/notebook.js${new URL(import.meta.url).search}`).then(m => m.viewNotebook(sid, s.name, { page: rn.dataset.rdnotes })).catch(() => toast(t('js.app.wentWrong'))); return; }
    const fe = e.target.closest('[data-fbedit]');
    if (fe) { edit = fe.dataset.fbedit; const x = cardsOf(sid).find(c => c.id === edit); pickSt = (x && x.fb && x.fb.sticker) || ''; box.innerHTML = draw(); box.querySelector('#hr-fbc')?.focus(); return; }
    const st = e.target.closest('[data-fbst]');
    if (st) { pickSt = st.dataset.fbst; for (const b of box.querySelectorAll('[data-fbst]')) { const on = b === st; b.classList.toggle('on', on); b.setAttribute('aria-checked', String(on)); } return; }
    if (e.target.closest('[data-fbcancel]')) { edit = null; box.innerHTML = draw(); return; }
    const fs = e.target.closest('[data-fbsave]'); if (fs) { saveFb(fs.dataset.fbsave, box.querySelector('#hr-fbc')?.value || '', pickSt); return; }
    const fc = e.target.closest('[data-fbclear]'); if (fc) { saveFb(fc.dataset.fbclear, '', ''); return; }
    const sp = e.target.closest('[data-simpler]'); if (sp) { sh.close(); HLP.simplerSheet(handout(sp.dataset.simpler)); return; }
    const one = e.target.closest('[data-rm]'), all = e.target.closest('[data-rmall]'); if (!one && !all) return;
    const id = (one || all).dataset[one ? 'rm' : 'rmall'];
    if (all && !(await ask({ title: th('ho.removeAll'), text: th('ho.removeAllConfirm', { title: handout(id)?.title || '' }), ok: th('ho.removeAll') }))) return;
    try {
      const r = await api(api2(`handouts/${encodeURIComponent(id)}/remove`), { method: 'POST', body: one ? { studentId: sid } : {} });
      H.ho = { handouts: r.handouts, desks: r.desks }; renderDesks(); box.innerHTML = draw(); toast(r.toast);
    } catch (err) { toast(err.message, { bad: true }); }
  });
}
/** A team desk's sheet: its members, each opening their own desk's sheet (their handouts, comments and stickers). */
function teamSheet(id) {
  const tm = teamById(id); if (!tm) return;
  const sh = sheet({ title: `🤝 ${th('team.deskOf', { names: teamNames(tm) })}`, content: `<div class="hr-dsheet"><p class="small muted">${esc(th('team.sheetLead'))}</p><ul class="plain hr-tlist">${tm.members.map(sid => {
    const cards = cardsOf(sid), done = cards.filter(x => x.done).length;
    return `<li>${btn('btn hr-chunk hr-tmember', `data-tm="${esc(sid)}"`, `<bdi>${esc(nameOfId(sid))}</bdi> <span class="small muted">${esc(th('team.doneOf', { done, n: cards.length }))}</span>`)}</li>`; }).join('')}</ul></div>` });
  sh.el.addEventListener('click', e => { const b = e.target.closest('[data-tm]'); if (b) { sh.close(); deskSheet(b.dataset.tm); } });
}
// The desks' progress, asked for every so often while the page is open (faster while class is live), never while hidden.
let pollTimer = null;
const pollEvery = () => (H.live ? 8000 : 20000);
async function pollHandouts() {
  clearTimeout(pollTimer); pollTimer = null;
  if (document.hidden || H.away) return;
  // while live the board's 2 s pulse brings the handouts whenever they change (public/js/homeroom-live.js)
  if (LV.polling()) { pollTimer = setTimeout(pollHandouts, pollEvery()); return; }
  try {
    const r = await api(api2('handouts'), { background: true });
    if (JSON.stringify(r) !== JSON.stringify(H.ho)) { H.ho = r; renderDesks(); }
  } catch { /* try again later */ }
  pollTimer = setTimeout(pollHandouts, pollEvery());
}

// ---------------------------------------------------------------- input
const UI = 'button, a, input, select, textarea, label, .hr-panel, .hr-seatbar, .rm-float, .rm-menu, .hr-seltools, .hr-pop';
function down(e) {
  H.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (H.pointers.size === 2) { const [a, b] = [...H.pointers.values()]; H.gesture = { kind: 'pinch', d: Math.hypot(a.x - b.x, a.y - b.y), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 }; return; }
  if (e.target.closest(UI)) return;
  const desk = e.target.closest('.hr-desk');
  if (H.seatsOpen && desk && desk.dataset.team) {
    const tm = teamById(desk.dataset.team); if (!tm || H.teamPick) return;
    H.deskSel = `team:${tm.id}`; for (const d of worldEl.querySelectorAll('.hr-desk.sel')) d.classList.remove('sel'); desk.classList.add('sel');
    H.gesture = { kind: 'team', id: tm.id, sx: e.clientX, sy: e.clientY, x0: tm.x, y0: tm.y, moved: false };
    board.setPointerCapture(e.pointerId); e.preventDefault(); return;
  }
  if (H.seatsOpen && desk) {
    const sid = desk.dataset.sid, p = H.seats[sid] || { x: 0, y: 0 };
    H.deskSel = sid; for (const d of worldEl.querySelectorAll('.hr-desk.sel')) d.classList.remove('sel'); desk.classList.add('sel');
    H.gesture = { kind: 'desk', sid, sx: e.clientX, sy: e.clientY, x0: p.x, y0: p.y, moved: false };
    board.setPointerCapture(e.pointerId); e.preventDefault(); return;
  }
  const at = AIDE ? null : inArea(e.clientX, e.clientY);
  if (at && !H.seatsOpen && H.mode !== 'move') {
    ed.clear();
    if (H.mode === 'pen') { if (ed.penStart(at)) { H.gesture = { kind: 'ink' }; board.setPointerCapture(e.pointerId); } return; }
    if (H.mode === 'note' || H.mode === 'text') {
      if (H.ann[H.mode === 'note' ? 'notes' : 'texts'].length >= MAX[H.mode]) { toast(th('tooMany'), { bad: true }); return; }
      const k = H.mode; backToSelect(); ed.add(k, at); H.justPanned = true; e.preventDefault(); return;
    }
    if (H.mode === 'shape') {
      const s = ed.shapeStart(at); if (!s) return;
      H.gesture = { kind: 'shape', s }; board.setPointerCapture(e.pointerId); return;
    }
  }
  if (!H.seatsOpen && !AIDE && ed.down(e)) return;
  // (a desk tapped without moving: live class looks at it, public/js/homeroom-live.js; the capture below sends the click
  // to the board, so the tap is told here)
  H.gesture = { kind: 'pan', sx: e.clientX, sy: e.clientY, x0: H.view.x, y0: H.view.y, moved: false, desk: desk && !H.seatsOpen ? desk : null };
  board.setPointerCapture(e.pointerId);
}
function move(e) {
  if (H.pointers.has(e.pointerId)) H.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  ed.hoverAt(e);
  if (ed.move(e)) return;
  const g = H.gesture; if (!g) return;
  if (g.kind === 'pinch') {
    if (H.pointers.size !== 2) return;
    const [a, b] = [...H.pointers.values()], d = Math.hypot(a.x - b.x, a.y - b.y), cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2, r = board.getBoundingClientRect();
    H.view.x += cx - g.cx; H.view.y += cy - g.cy; zoomAt(d / (g.d || d), cx - r.left, cy - r.top); Object.assign(g, { d, cx, cy }); return;
  }
  const dx = e.clientX - g.sx, dy = e.clientY - g.sy;
  if (g.kind === 'pan') { if (Math.abs(dx) + Math.abs(dy) > 4) g.moved = true; H.view.x = g.x0 + dx; H.view.y = g.y0 + dy; applyView(); return; }
  if (g.kind === 'ink') { ed.penMove(inArea(e.clientX, e.clientY, 1)); return; }
  if (g.kind === 'shape') { const p = inArea(e.clientX, e.clientY, 1); if (p) ed.shapeMove(p, e.shiftKey); return; }
  if (!g.moved && Math.abs(dx) + Math.abs(dy) < 5) return;
  if (!g.moved && g.kind !== 'desk') remember();
  g.moved = true;
  const z = H.view.z;
  if (g.kind === 'desk') { if (H.teamPick) return; const p = clampSeat({ x: Math.round((g.x0 + dx / z) / 10) * 10, y: Math.round((g.y0 + dy / z) / 10) * 10 }); if (p) { H.seats[g.sid] = p; moveDeskEl(g.sid); } return; }
  if (g.kind === 'team') { const tm = teamById(g.id), p = clampSeat({ x: Math.round((g.x0 + dx / z) / 10) * 10, y: Math.round((g.y0 + dy / z) / 10) * 10 }); if (tm && p) { tm.x = p.x; tm.y = p.y; moveTeamEl(g.id); } return; }
}
function up(e) {
  H.pointers.delete(e.pointerId);
  if (ed.up(e)) { H.justPanned = true; return; }
  const g = H.gesture; if (!g) return;
  if (g.kind === 'pinch') { if (H.pointers.size < 2) H.gesture = null; return; }
  H.gesture = null;
  if (g.kind === 'pan') {
    H.justPanned = g.moved;
    // a game, lesson or book picked, then a desk clicked with a mouse (the capture sends that click to the board; a
    // finger's tap still reaches the desk as a click, giveClick)
    if (!g.moved && g.desk && H.pick && !H.giving && e.pointerType === 'mouse') { const to = targetAt(g.desk); if (to) { H.justPanned = true; giveSheet(to); return; } }
    if (!g.moved && g.desk && LV.tapDesk(g.desk)) { H.justPanned = true; return; }
    if (!g.moved) {
      ed.clear();
      if (H.deskSel) { H.deskSel = null; for (const d of worldEl.querySelectorAll('.hr-desk.sel')) d.classList.remove('sel'); }
    }
    return;
  }
  if (g.kind === 'desk') {
    // Make a team: a tap picks the desk (or unpicks it).
    if (H.teamPick) { if (!g.moved) togglePick(g.sid); H.justPanned = true; return; }
    if (g.moved) seatMoved(g.sid); H.justPanned = true; return;
  }
  if (g.kind === 'team') { if (g.moved) teamMoved(g.id); H.justPanned = true; return; }
  if (g.kind === 'ink') { ed.penEnd(); return; }
  if (g.kind === 'shape') {
    // A shape is drawn by dragging; a tap with a shape tool puts a middle-sized one there. Then back to Select, the new
    // shape selected (its handles show how to resize it).
    const r = ed.shapeEnd(); backToSelect(); renderArea(); if (r) ed.selectNew(r); H.justPanned = true; return;
  }
}
function togglePick(sid) {
  const list = H.teamPick; if (!list) return;
  const i = list.indexOf(sid);
  if (i >= 0) list.splice(i, 1); else if (list.length < TEAM_MAX) list.push(sid); else { toast(th('team.full', { max: TEAM_MAX }), { bad: true }); return; }
  const el = worldEl.querySelector(`.hr-desk[data-sid="${CSS.escape(sid)}"]`);
  if (el) { el.classList.toggle('picked', list.includes(sid)); el.setAttribute('aria-pressed', String(list.includes(sid))); }
  renderSeatbar();
}
function click(e) {
  if (H.justPanned) { H.justPanned = false; if (!e.target.closest(UI)) return; }
  const sp = e.target.closest('[data-hrsplit]'); if (sp) { splitTeam(sp.dataset.hrsplit); return; }
  if (LV.click(e)) return;
  if (giveClick(e)) return;
  const mode = e.target.closest('[data-hrmode]');
  // the Shapes button opens the picker (a shape picked there turns the tool on)
  if (mode) { if (mode.dataset.hrmode === 'shape') { ed.openPop('shapes', 'shape'); return; } return setMode(mode.dataset.hrmode); }
  const preset = e.target.closest('[data-hrpreset]'); if (preset) return usePreset(preset.dataset.hrpreset);
  if (ed.click(e)) return;
  const a = e.target.closest('[data-hr]'); if (!a) { if (H.menuOpen && !e.target.closest('.hr-morewrap')) { H.menuOpen = false; renderMenu(); } return; }
  const k = a.dataset.hr;
  if (k !== 'menu' && H.menuOpen) { H.menuOpen = false; renderMenu(); }
  if (k === 'zin') zoomMid(1.25);
  else if (k === 'zout') zoomMid(1 / 1.25);
  else if (k === 'fit') fit();
  else if (k === 'undo') undo();
  else if (k === 'redo') redo();
  else if (k === 'paste') ed.pasteButton();
  else if (k === 'clearpen') { if (H.ann.strokes.length) { remember(); H.ann.strokes = []; renderArea(); queueSave(); } }
  else if (k === 'seats') openSeats(true);
  else if (k === 'seatsdone') openSeats(false);
  else if (k === 'teampick') { H.teamPick = []; H.deskSel = null; renderSeatbar(); renderWorld(); }
  else if (k === 'teamcancel') { H.teamPick = null; renderSeatbar(); renderWorld(); }
  else if (k === 'teammake') makeTeam();
  else if (k === 'menu') { H.menuOpen = !H.menuOpen; renderMenu(); }
  else if (k === 'groups') groupsSheet();
  else if (k === 'pickbook') bookSheet();
  else if (k === 'signin') signinSheet();
  else if (k === 'aides') { H.menuOpen = false; renderMenu(); HLP.aidesSheet(); }
  else if (k === 'sublink') { H.menuOpen = false; renderMenu(); HLP.subSheet(); }
  else if (k === 'golive') liveAction('start');
  else if (['bring', 'back', 'pause', 'resume', 'end'].includes(k)) liveAction(k);
}
function keys(e) {
  if (e.key === 'Escape') {
    if (H.pick && !H.giving) { setPick(null); return; }
    if (LV.escape()) return;
    if (H.menuOpen) { H.menuOpen = false; renderMenu(); document.querySelector('[data-hr="menu"]')?.focus(); return; }
    if (H.teamPick) { H.teamPick = null; renderSeatbar(); renderWorld(); return; }
    if (H.seatsOpen) { openSeats(false); return; }
    if (H.mode !== 'move') { setMode(H.mode); return; }
  }
  if (e.target.matches && e.target.matches('input, textarea, select')) return;
  // Arrange seats from the keyboard: a desk with the focus moves 10 pixels per arrow key (50 with Shift).
  const desk = e.target.closest && e.target.closest('.hr-desk');
  const dir = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
  if (H.teamPick && desk && desk.dataset.sid && (e.key === 'Enter' || e.key === ' ')) { togglePick(desk.dataset.sid); e.preventDefault(); return; }
  if (H.seatsOpen && desk && desk.dataset.team && dir) {
    const tm = teamById(desk.dataset.team), step = e.shiftKey ? 50 : 10;
    const at = tm && clampSeat({ x: tm.x + dir[0] * step, y: tm.y + dir[1] * step }); if (at) { tm.x = at.x; tm.y = at.y; moveTeamEl(tm.id); teamMoved(tm.id); }
    e.preventDefault(); return;
  }
  if (H.seatsOpen && desk && dir && !H.teamPick) {
    const sid = desk.dataset.sid, p = H.seats[sid], step = e.shiftKey ? 50 : 10;
    const at = clampSeat({ x: p.x + dir[0] * step, y: p.y + dir[1] * step }); if (at) { H.seats[sid] = at; moveDeskEl(sid); seatMoved(sid); }
    e.preventDefault();
  }
}

// ---------------------------------------------------------------- start
// ---------------------------------------------------------------- live class: watching desks (step 3a)
const LV = liveBoard({
  D, H, th, api2: path => api2(path), worldEl, renderLive: () => renderLive(), deskSheet: sid => deskSheet(sid), groupOf, nameOfId, teamOf, handout, aide: AIDE, supports: sid => HLP.deskMenu(sid), supportsLabel: th('helpers.supports'),
  setHo: ho => { if (JSON.stringify(ho) !== JSON.stringify(H.ho)) { H.ho = ho; renderDesks(); } },
});

// Step 3c: supports, simpler wording, aides, sub links, While you were out (public/js/homeroom-helpers.js).
const HLP = helpersOf({ D, H, api2: path => api2(path), aide: AIDE, nameOfId, renderDesks: () => renderDesks(), deskSheet: sid => deskSheet(sid), look: sid => LV.look(sid), live: () => !!H.live });

/** Another view is on screen: the board keeps its zoom, place and selection; typing ends, menus close, nothing polls. */
function away() {
  H.away = true; ed.finishEdit();
  if (H.menuOpen) { H.menuOpen = false; renderMenu(); }
  if (H.drag) { H.drag.ghost?.remove(); H.drag = null; for (const el of document.querySelectorAll('.hr-droptarget')) el.classList.remove('hr-droptarget'); }
  H.gesture = null; H.pointers.clear();
  clearTimeout(pollTimer); pollTimer = null; LV.pause();
}
/** Back on screen: the same view of the board, and the desks asked for now. */
function back() {
  H.away = false;
  applyView(); renderMini();
  pollHandouts(); LV.resume();
}

// A game from My desk, played over the board (public/js/homeroom-player.js): the board stays as it is underneath.
const PL = gamePlayer({
  host: $('hr-stage') || board?.parentElement, path: `/class/${encodeURIComponent(D.classId)}/homeroom`, back: th('playBack'),
  find: id => { const x = stagedById(id); return x && x.href && !x.tool ? { href: x.href, title: x.title, icon: x.icon } : null; },
  away: () => H.away,
});

let PLAN = null;
function start() {
  document.querySelector('main#main')?.classList.add('rm-main');
  PLAN = planPill({ D, H, viewEl, readOnly: AIDE });
  renderChips(); renderTools(); renderZoom(); renderSeatbar(); renderLive(); renderWorld(); renderGivebar(); renderLessons(lessonCtx);
  $('hr-panel').addEventListener('pointerdown', dragStart);
  board.addEventListener('pointerdown', stagedDragStart);
  // a game's icon is a picture: the browser's own image drag would cancel ours (pointercancel)
  document.addEventListener('dragstart', e => { if (e.target.closest && e.target.closest('[data-hritem], [data-hrstaged]')) e.preventDefault(); });
  document.addEventListener('pointermove', dragMove); document.addEventListener('pointerup', dragEnd); document.addEventListener('pointercancel', dragEnd);
  document.addEventListener('visibilitychange', () => { if (!document.hidden && !H.away) pollHandouts(); });
  pollTimer = setTimeout(pollHandouts, pollEvery());
  if (H.live) LV.onLive();
  requestAnimationFrame(fit);
  board.addEventListener('pointerdown', down);
  board.addEventListener('pointermove', move);
  board.addEventListener('pointerup', up); board.addEventListener('pointercancel', up);
  board.addEventListener('wheel', e => { e.preventDefault(); const r = board.getBoundingClientRect(); zoomAt(Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)), e.clientX - r.left, e.clientY - r.top); }, { passive: false });
  const root = $('homeroom');
  for (const el of [root, barActs()].filter(Boolean)) { el.addEventListener('click', click); el.addEventListener('keydown', keys); }
  document.addEventListener('keydown', e => { if (!H.away && !PL.current() && !AIDE) ed.key(e); });
  // copy, cut and paste for the board's objects (public/js/homeroom-board.js): only while the board is on screen
  const clip = f => e => { if (!H.away && !PL.current() && !H.seatsOpen && !AIDE) f(e); };
  document.addEventListener('copy', clip(e => ed.onCopy(e, false))); document.addEventListener('cut', clip(e => ed.onCopy(e, true))); document.addEventListener('paste', clip(e => ed.onPaste(e)));
  // The minimap sits outside the board: a press on it moves the view there.
  $('hr-mini').addEventListener('pointerdown', e => { if (!e.target.closest('.rm-mini')) return; const p = miniPoint(e, world()), s = size(); H.view.x = s.w / 2 - p.x * H.view.z; H.view.y = s.h / 2 - p.y * H.view.z; applyView(); });
  PL.sync();   // a game the address names (#play=<card>): open over the board
  if (!AIDE) HLP.notes();   // what a sub did, until Got it
  // (another class: the shared bar's switcher, public/js/class-views.js)
  viewEl?.addEventListener('cv:hide', away);
  viewEl?.addEventListener('cv:show', back);
  let rz = null; window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => { renderMini(); ed.place(); }, 150); });
  window.addEventListener('pagehide', () => { ed.finishEdit(); if (saveTimer) { clearTimeout(saveTimer); saveArea(); } });
}
if (board && worldEl) start();
