// Oomba Canvas 1.4.0: "My worksheets", a teacher's saved worksheets inside a classroom activity. Only where the page
// offers the list (BRB.canListSets: school staff and the platform admin, in the published activity, never a preview,
// never "As a student"); students never see it. Save as worksheet keeps the questions on screen (the problems only:
// nothing a student did) under a short class code, through the page (BRB.saveQuestionSet); the server cleans them for
// this activity. Each worksheet is one quiet row: its name, one line (how many questions, the date) with the class code
// as a small chip, and the whole row opens it on screen. At the end of the row only Print and a More menu (Answer key,
// Copy link, Duplicate, Rename, Delete). A worksheet's link opens exactly its questions for every student.
// ui.js passes its element helper (h) and its words (T), as teach.js does: nothing is imported from ui.js.

/**
 * o: { h, T, lang, B (the page's BRB, read when used), current () -> { items, title } (the questions on screen),
 *      onScreen () -> the worksheet on screen ({ id, code, title }) or null, open (set), paper () -> 'a4'|'letter',
 *      opener () -> the element focus goes back to }
 * -> { panel, show (on), isOpen () }
 */
export function worksheets(o) {
  const { h, T } = o;
  const B = () => o.B() || {};
  const ST = { open: false, list: null, busy: false, msg: '', bad: false, fresh: '', renaming: '', asking: '', loading: false, failed: false };
  // the heading, its close button and the status line stay; only the body is drawn again (focus stays where it is)
  const head = h('h2', { id: 'oc-ws-h', tabindex: '-1' }, h('span', { 'aria-hidden': 'true' }, '📄 '), T('wsTitle'));
  const status = h('p', { class: 'oc-pmsg oc-wsmsg', role: 'status', 'aria-live': 'polite' });
  const body = h('div', { class: 'oc-wsbody' });
  const panel = h('section', { class: 'oc-card oc-ws', id: 'oc-ws', hidden: true, 'aria-labelledby': 'oc-ws-h' },
    h('div', { class: 'oc-ptop' }, head, h('button', { type: 'button', class: 'oc-btn oc-sm', 'aria-label': T('close'), onclick: () => show(false) }, '✕')), body);
  const MENU = { close: null, owner: null };
  const nameOf = s => s.title || s.label || T('wsUntitled');
  const countOf = n => (n === 1 ? T('wsOne') : T('wsMany', { n }));
  const dateOf = ms => {
    try {
      const d = new Date(ms), same = d.getFullYear() === new Date().getFullYear();
      return new Intl.DateTimeFormat(o.lang, same ? { month: 'short', day: 'numeric' } : { year: 'numeric', month: 'short', day: 'numeric' }).format(d);
    } catch (e) { return ''; }
  };
  const say = (msg, bad = false) => { ST.msg = msg; ST.bad = bad; };
  const errText = e => T(e === 'full' ? 'wsFull' : e === 'title' ? 'wsBadName' : e === 'bad' ? 'wsCannot' : e === 'none' ? 'wsGone' : e === 'tap' ? 'printTap' : e === 'key' ? 'keyTeacher' : 'wsErr');

  function load() {
    ST.loading = true; ST.failed = false; paint();
    let p = null; try { p = B().mySets(); } catch (e) { p = null; }
    return Promise.resolve(p).then(r => {
      ST.loading = false;
      if (r && Array.isArray(r.sets)) ST.list = r.sets; else { ST.failed = true; if (!ST.list) ST.list = null; }
      paint();
    });
  }
  function show(on) {
    closeMenu(false);
    ST.open = !!on; panel.hidden = !ST.open;
    if (ST.open) { ST.renaming = ''; ST.asking = ''; say(''); paint(); load(); try { head.focus({ preventScroll: false }); } catch (e) { /* not in the page yet */ } } else { try { const b = o.opener(); if (b) b.focus({ preventScroll: true }); } catch (e) { /* gone */ } }
  }

  // ---- actions (each through the page; the server checks whose set it is)
  function save() {
    const cur = o.current();
    if (ST.busy || !cur.items.length) return;
    ST.busy = true; say(T('wsSaving')); paint();
    let p = null; try { p = B().saveQuestionSet(cur.items, null, { title: String(cur.title || '').slice(0, 60) }); } catch (e) { p = null; }
    Promise.resolve(p).then(r => {
      ST.busy = false;
      if (r && r.id) { ST.fresh = r.id; say(T('wsSaved', { code: codeOf(r.id) })); load(); } else { say(errText(r && r.error), true); paint(); }
    });
  }
  function print(s, key) {
    say(T('printBusy')); paint();
    let p = null; try { p = B().print({ k: 'canvas', set: s.id, n: Math.max(1, Math.min(30, s.items.length)), paper: o.paper(), key: !!key && B().canPrintKey === true }); } catch (e) { p = null; }
    Promise.resolve(p).then(r => { if (r && r.ok) say(T('printOk')); else say(errText(r && r.error), true); paint(); });
  }
  function linkOf(s) { const u = B().gameUrl; return u ? `${u}?chapter=${s.id}&lock=1` : ''; }
  function copyLink(s) {
    const url = linkOf(s);
    let p = null; try { p = url && B().copy ? B().copy(url) : null; } catch (e) { p = null; }
    Promise.resolve(p).then(ok => { say(ok ? T('wsCopied') : T('wsCopyNo', { link: url }), !ok); paint(); });
  }
  function duplicate(s) {
    let p = null; try { p = B().duplicateQuestionSet(s.id); } catch (e) { p = null; }
    Promise.resolve(p).then(r => { if (r && r.id) { ST.fresh = r.id; say(T('wsDupDone')); load(); } else { say(errText(r && r.error), true); paint(); } });
  }
  function rename(s, title) {
    let p = null; try { p = B().renameQuestionSet(s.id, title); } catch (e) { p = null; }
    Promise.resolve(p).then(r => {
      if (r && r.ok) { ST.renaming = ''; say(T('wsRenamed')); load().then(() => focusRow(s.id)); } else { say(errText(r && r.error), true); paint(); focusRename(); }
    });
  }
  function remove(s) {
    let p = null; try { p = B().deleteQuestionSet(s.id); } catch (e) { p = null; }
    Promise.resolve(p).then(r => {
      ST.asking = '';
      if (r && r.ok) { say(T('wsDeleted')); load().then(() => { try { head.focus(); } catch (e) { /* gone */ } }); } else { say(errText(r && r.error), true); paint(); }
    });
  }
  const codeOf = id => { const c = String(id).replace(/^s-/, '').toUpperCase(); return `${c.slice(0, 5)} ${c.slice(5)}`; };
  const rowOf = id => panel.querySelector(`[data-ws="${id}"]`);
  const focusRow = id => { const r = rowOf(id); const b = r && r.querySelector('.oc-wso'); if (b) b.focus({ preventScroll: false }); };
  const focusRename = () => { const i = panel.querySelector('.oc-wsren input'); if (i) { i.focus(); i.select(); } };

  // ---- the More menu: under its button; arrow keys, Home and End move, Escape, Tab, a click outside or a choice close
  // it, and focus goes back to the button (or on to the rename box or the delete question)
  function closeMenu(back) {
    if (!MENU.close) return;
    const f = MENU.close; MENU.close = null; f(back);
  }
  function openMenu(more, wrap, s) {
    if (MENU.close && MENU.owner === more) { closeMenu(true); return; }
    closeMenu(false);
    const canKey = B().canPrintKey === true && B().canPrint === true;
    const acts = [
      canKey ? ['key', '🔑', T('wsKey'), () => print(s, true)] : null,
      ['copy', '🔗', T('wsCopy'), () => copyLink(s)],
      ['dup', '⧉', T('wsDup'), () => duplicate(s)],
      ['rename', '✏️', T('wsRename'), () => { ST.renaming = s.id; ST.asking = ''; say(''); paint(); focusRename(); }, true],
      ['del', '🗑', T('wsDelete'), () => { ST.asking = s.id; ST.renaming = ''; say(''); paint(); const b = panel.querySelector('.oc-wsask .oc-wsdel'); if (b) b.focus(); }, true],
    ].filter(Boolean);
    const menu = h('div', { class: 'oc-wsmenu', role: 'menu', id: `oc-wsmenu-${s.id}`, 'aria-label': T('wsMoreFor', { title: nameOf(s) }) });
    const btns = acts.map(([k, emo, label, fn, moves]) => {
      const b = h('button', { type: 'button', role: 'menuitem', tabindex: '-1', class: `oc-wsmi${k === 'del' ? ' oc-wsmi-del' : ''}`, 'data-act': k, onclick: () => { closeMenu(!moves); fn(); } },
        h('span', { 'aria-hidden': 'true' }, emo), h('span', {}, label));
      if (k === 'del') menu.append(h('div', { class: 'oc-wssep', role: 'separator' }));
      menu.append(b); return b;
    });
    wrap.append(menu);
    const li = wrap.closest('.oc-wsr'); if (li) li.classList.add('oc-wsup');   // its menu above the rows under it
    more.setAttribute('aria-expanded', 'true');
    const outside = e => { if (!wrap.contains(e.target)) closeMenu(false); };
    menu.addEventListener('keydown', e => {
      const i = btns.indexOf(document.activeElement), n = btns.length;
      if (e.key === 'ArrowDown') btns[(i + 1) % n].focus();
      else if (e.key === 'ArrowUp') btns[(i - 1 + n) % n].focus();
      else if (e.key === 'Home') btns[0].focus();
      else if (e.key === 'End') btns[n - 1].focus();
      else if (e.key === 'Escape') { e.stopPropagation(); closeMenu(true); }
      else if (e.key === 'Tab') { closeMenu(false); return; } else return;
      e.preventDefault();
    });
    MENU.owner = more;
    MENU.close = back => {
      document.removeEventListener('pointerdown', outside, true);
      menu.remove(); more.setAttribute('aria-expanded', 'false'); MENU.owner = null; if (li) li.classList.remove('oc-wsup');
      if (back) more.focus();
    };
    document.addEventListener('pointerdown', outside, true);
    btns[0].focus();
    return btns;
  }

  // ---- drawing
  function paint() {
    closeMenu(false);
    body.textContent = '';
    status.textContent = ST.msg; status.classList.toggle('oc-wsbad', ST.bad);
    const ws = o.onScreen(), cur = o.current();
    const panel = body;
    // what Save does: the questions on screen; a worksheet already on screen says so instead
    panel.append(ws ? h('p', { class: 'oc-wsnow' }, h('span', { 'aria-hidden': 'true' }, '📄 '), T('wsOnScreen', { title: ws.title || T('wsUntitled') }), ' ', h('span', { class: 'oc-wsc', dir: 'ltr' }, ws.code))
      : h('div', { class: 'oc-wssave' }, h('button', { type: 'button', class: 'oc-btn oc-primary', disabled: ST.busy || !cur.items.length, onclick: save }, h('span', { 'aria-hidden': 'true' }, '💾 '), T('wsSave')),
        h('span', { class: 'oc-psmall' }, T('wsSaveD', { n: cur.items.length }))));
    panel.append(status);
    if (ST.loading && !ST.list) { panel.append(h('p', { class: 'oc-psmall' }, T('wsLoading'))); return; }
    if (ST.failed && !ST.list) { panel.append(h('p', { class: 'oc-psmall' }, T('wsLoadFail'), ' '), h('button', { type: 'button', class: 'oc-btn oc-sm', onclick: load }, T('wsRetry'))); return; }
    const list = ST.list || [];
    if (!list.length) { panel.append(h('p', { class: 'oc-psmall oc-wsempty' }, T('wsEmpty'))); return; }
    const ul = h('ul', { class: 'oc-wsl', 'aria-labelledby': 'oc-ws-h' });
    for (const s of list) ul.append(row(s));
    panel.append(ul);
  }
  function row(s) {
    const name = nameOf(s), li = h('li', { class: `oc-wsr${ST.fresh === s.id ? ' oc-wsnew' : ''}`, 'data-ws': s.id });
    if (ST.renaming === s.id) {
      const input = h('input', { type: 'text', maxlength: '60', value: s.title || '', 'aria-label': T('wsName'), dir: 'auto', autocomplete: 'off' });
      const done = () => { const v = input.value.replace(/\s+/g, ' ').trim(); if (!v || v === s.title) { ST.renaming = ''; paint(); focusRow(s.id); return; } rename(s, v); };
      input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); done(); } else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); ST.renaming = ''; say(''); paint(); focusRow(s.id); } });
      li.append(h('div', { class: 'oc-wsren' }, input,
        h('button', { type: 'button', class: 'oc-btn oc-sm oc-primary', onclick: done }, T('wsRenameSave')),
        h('button', { type: 'button', class: 'oc-btn oc-sm', onclick: () => { ST.renaming = ''; say(''); paint(); focusRow(s.id); } }, T('wsCancel'))));
      return li;
    }
    const open = h('button', { type: 'button', class: 'oc-wso', onclick: () => { o.open(s); show(false); } },
      h('b', { class: 'oc-wst', dir: 'auto' }, name),
      h('span', { class: 'oc-wsm' }, h('span', {}, `${countOf(s.n || s.items.length)}${s.updated ? ` · ${dateOf(s.updated)}` : ''}`), h('span', { class: 'oc-wsc', dir: 'ltr', 'aria-label': T('wsCodeSay', { code: s.code }) }, s.code)));
    const tools = h('span', { class: 'oc-wstools' });
    if (B().canPrint === true) tools.append(h('button', { type: 'button', class: 'oc-wsi', 'aria-label': T('wsPrintFor', { title: name }), title: T('print'), onclick: () => print(s, false) }, h('span', { 'aria-hidden': 'true' }, '🖨')));
    const wrap = h('span', { class: 'oc-wsmw' });
    const more = h('button', { type: 'button', class: 'oc-wsi', 'aria-haspopup': 'menu', 'aria-expanded': 'false', 'aria-controls': `oc-wsmenu-${s.id}`, 'aria-label': T('wsMoreFor', { title: name }), title: T('wsMore'), onclick: () => openMenu(more, wrap, s) }, h('span', { 'aria-hidden': 'true' }, '⋯'));
    more.addEventListener('keydown', e => { if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && !MENU.close) { e.preventDefault(); const b = openMenu(more, wrap, s); if (e.key === 'ArrowUp' && b) b[b.length - 1].focus(); } });
    wrap.append(more); tools.append(wrap);
    li.append(h('div', { class: 'oc-wsrow' }, open, tools));
    if (ST.asking === s.id) {
      li.append(h('div', { class: 'oc-wsask', role: 'group', 'aria-label': T('wsDelete') }, h('p', {}, T('wsDelAsk', { title: name })),
        h('span', { class: 'oc-btns' }, h('button', { type: 'button', class: 'oc-btn oc-sm oc-wsdel', onclick: () => remove(s) }, T('wsDelete')),
          h('button', { type: 'button', class: 'oc-btn oc-sm', onclick: () => { ST.asking = ''; paint(); try { rowOf(s.id).querySelector('[aria-haspopup]').focus(); } catch (e) { /* gone */ } } }, T('wsKeep')))));
    }
    return li;
  }
  panel.addEventListener('keydown', e => { if (e.key === 'Escape' && !MENU.close && !ST.renaming && !ST.asking) { e.preventDefault(); show(false); } else if (e.key === 'Escape' && ST.asking) { e.preventDefault(); ST.asking = ''; paint(); } });
  return { panel, show, isOpen: () => ST.open, paint: () => { if (ST.open) paint(); } };
}
