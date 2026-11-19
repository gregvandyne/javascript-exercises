// Oomba Canvas 1.3.0: the teacher's controls inside an activity. Only when the page says this viewer is the activity's
// maker or school staff (BRB.canTeach, from the server's INIT.teach: never a student, never under "As a student").
// Nothing here talks to the server: the controls change this screen only.
//   Show answer   the worked answer of the problem on screen (its steps or its "work" lines); it is not counted
//   Board mode    big type for the board, Back / n of N / Next, no ✓ ✗, no keypad, and no score is sent
//   Help          the help mode for this screen (any of the four); it is not saved
//   New set       a fresh set from the generator (off, with a note, when the activity has none)
// Two layouts of the same controls, switched by CSS (style.js): a bar under the top strip at 561 px and wider, and one
// "Teacher" button that opens a menu (a bottom sheet) on narrower screens.
// ui.js passes its element helper (h) and its words (T): the modules share one scope in the bundle, but stay separate
// ES modules for the tests, so nothing is imported from ui.js.

/**
 * o: { h, T, supports (the four help modes), gen (the activity has a generator), on: { show, board, help, newSet } }
 * -> { bar, button, menu, scrim, paint({ support, board, shown, done }), close() }
 */
export function teachControls(o) {
  const { h, T, on } = o;
  const els = { help: [], menuHelp: [] };
  const helpGroup = (list, cls, labelled) => h('span', { class: cls, role: 'group', ...(labelled ? { 'aria-label': T('helpHere') } : {}) },
    cls === 'oc-tb-help' ? h('span', { class: 'oc-tb-hl', 'aria-hidden': 'true' }, '🪜 ', T('helpMode')) : null,
    ...o.supports.map(m => { const b = h('button', { type: 'button', 'data-mode': m, 'aria-pressed': 'false', onclick: () => on.help(m) }, T(m)); list.push(b); return b; }));

  // ---- A: the bar (561 px and wider)
  els.show = h('button', { type: 'button', class: 'oc-btn oc-sm', 'aria-pressed': 'false', onclick: () => on.show() }, h('span', { 'aria-hidden': 'true' }, '👀'), ' ', T('showAnswer'));
  els.board = h('button', { type: 'button', class: 'oc-btn oc-sm oc-tb-board', 'aria-pressed': 'false', onclick: () => on.board(!o.state().board) });
  els.newSet = h('button', { type: 'button', class: 'oc-btn oc-sm', disabled: !o.gen, title: o.gen ? null : T('newSetNone'), onclick: () => on.newSet() }, h('span', { 'aria-hidden': 'true' }, '🎲'), ' ', T('newSetT'));
  const bar = h('div', { class: 'oc-tb', role: 'toolbar', 'aria-label': T('teacher') },
    h('span', { class: 'oc-tb-lab' }, h('span', { 'aria-hidden': 'true' }, '🧑‍🏫'), ' ', T('teacher'), h('small', {}, ' · ', T('teacherOnly'))),
    els.show, els.board, helpGroup(els.help, 'oc-tb-help', true), els.newSet);

  // ---- B: one Teacher button and its menu (narrower than 561 px)
  const button = h('button', { type: 'button', class: 'oc-btn oc-sm oc-tbtn', 'aria-expanded': 'false', 'aria-controls': 'oc-tmenu', 'aria-label': T('teacher'), onclick: () => open(!isOpen()) },
    h('span', { 'aria-hidden': 'true' }, '🧑‍🏫'), h('span', { class: 'oc-tbt' }, ' ', T('teacher')));
  const item = (emoji, title, desc, fn, extra = {}) => h('button', { type: 'button', class: 'oc-tmi', onclick: () => { fn(); open(false); }, ...extra },
    h('span', { class: 'oc-tme', 'aria-hidden': 'true' }, emoji), h('b', {}, title), h('span', {}, desc));
  els.mShow = item('👀', T('showAnswer'), T('showAnswerD'), () => on.show());
  els.mBoard = item('📽', T('boardMode'), T('boardModeD'), () => on.board(!o.state().board));
  els.mNew = item('🎲', T('newProblems'), o.gen ? T('newProblemsD') : T('newSetNone'), () => on.newSet(), { disabled: !o.gen });
  const menu = h('div', { class: 'oc-tmenu', id: 'oc-tmenu', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'oc-tmenu-h', hidden: true },
    h('div', { class: 'oc-tgrab', 'aria-hidden': 'true' }),
    h('h2', { id: 'oc-tmenu-h', tabindex: '-1' }, h('span', { 'aria-hidden': 'true' }, '🧑‍🏫 '), T('teacher')),
    h('p', { class: 'oc-tnote' }, T('teacherNote')),
    els.mShow, els.mBoard,
    h('div', { class: 'oc-tmh' }, h('b', {}, h('span', { 'aria-hidden': 'true' }, '🪜 '), T('helpHere')), helpGroup(els.menuHelp, 'oc-tm4', true)),
    els.mNew);
  const scrim = h('div', { class: 'oc-tscrim', hidden: true, onclick: () => open(false) });
  const isOpen = () => !menu.hidden;
  function open(want) {
    menu.hidden = !want; scrim.hidden = !want; button.setAttribute('aria-expanded', String(!!want));
    try { (want ? menu.querySelector('h2') : button).focus({ preventScroll: true }); } catch (e) { /* not in the page yet */ }
  }
  addEventListener('keydown', e => { if (e.key === 'Escape' && isOpen()) open(false); });

  function paint(s) {
    const pressed = (b, v) => b.setAttribute('aria-pressed', String(!!v));
    pressed(els.show, s.shown); els.show.disabled = !!s.done && !s.shown;
    els.mShow.disabled = els.show.disabled;
    pressed(els.board, s.board);
    els.board.textContent = ''; els.board.append(h('span', { 'aria-hidden': 'true' }, '📽'), ' ', T(s.board ? 'leaveBoard' : 'boardMode'));
    els.mBoard.querySelector('b').textContent = T(s.board ? 'leaveBoard' : 'boardMode');
    for (const b of [...els.help, ...els.menuHelp]) pressed(b, b.dataset.mode === s.support);
    bar.classList.toggle('oc-tb-on', !!s.board);
  }
  return { bar, button, menu, scrim, paint, close: () => open(false) };
}
