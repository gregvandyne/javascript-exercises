// Live games inside Homeroom (docs/decisions.md "Homeroom: live games inside Homeroom, a simpler Find lessons"; server:
// services/homeroom-livegame.js, routes/homeroom-liveembed.js). The owner: "You should be able to start live games
// directly from the board room. Experience should be seamless."
//
// The teacher's board (liveHost): a live game picked in Find lessons, the ⋯ menu's Host a live lesson, or a link with
// data-hrlive opens the real Oomba Live host pages in a layer over the board (?in=hr: no site menu or footer), the class
// already chosen, and the address never changes. "Back to Homeroom" folds the layer into a pill in the top bar
// ("Live: Brain Board · 14 joined"): the frame keeps running underneath (its socket, its timers), a tap on the pill opens
// it again, and End ends the game from there. The desks of students in it say "In Brain Board". When the projector view
// shows the game's host screen (it takes the projector's place: one per game), the layer shows the Teacher view
// (/live/host/<sid>/dash) instead, told over a BroadcastChannel in this browser.
//
// A student's desk (liveDesk): while the class has a live game the desk shows a banner with Join for as long as it runs
// (never moving them into it by itself); Join opens it in the desk's player (a seat for them as themselves: no code),
// and the game ending closes it.
//
// The projector view (liveProjector): the game's host screen over the whole page while it runs (its host only).
import { api, esc, toast, ask, t } from '/js/app.js';
import { iconHtml } from '/js/icons.js';

const tl = (k, v) => t(`js.homeroom-livegame.${k}`, v);
// (what a student's desk says: its own strings, which say game, as students do)
const tdk = (k, v) => t(`js.homeroom-livedesk.${k}`, v);
const withIn = href => { const [p, h] = [href.split('#')[0], href.includes('#') ? href.slice(href.indexOf('#')) : '']; return `${p}${p.includes('?') ? '&' : '?'}in=hr${h}`; };
const chanOf = classId => { try { return new BroadcastChannel(`hr-lg:${classId}`); } catch { return null; } };
/** Where a frame of ours is now ('' when it left this site or could not load). */
const pathOf = f => { try { return f.contentWindow.location.pathname || ''; } catch { return ''; } };

/**
 * The teacher's board. opts: { classId, stage: the element the layer covers, slot: () => the top bar's element the pill
 * goes after, desks: () => the board's desk elements, away: () => true while another view is on screen, closeMenu() }.
 * -> { open(href), paint(), escape() }
 */
export function liveHost(opts) {
  const url = p => `/api/homeroom/${encodeURIComponent(opts.classId)}/${p}`;
  let game = null, el = null, frame = null, onDash = false, proj = null, timer = null, busy = false;
  const ch = chanOf(opts.classId);
  function layer() {
    if (el) return el;
    el = document.createElement('div');
    el.className = 'hr-player hr-liveplayer'; el.setAttribute('role', 'region'); el.setAttribute('aria-label', tl('layer'));
    el.innerHTML = `<div class="hr-playtop"><button type="button" class="btn hr-chunk hr-playback" data-lg="min" aria-label="${esc(tl('back'))}"><span class="flip" aria-hidden="true">←</span> <span class="hr-playbackt">${esc(tl('back'))}</span></button>
      <span class="hr-playt" dir="auto">${iconHtml('📡', { size: 20 })} <b data-lgtitle>${esc(tl('setup'))}</b></span><span class="hr-lgcount" data-lgcount></span>
      <button type="button" class="btn btn-sm hr-chunk hr-lgend" data-lg="end" hidden>${iconHtml('⏹️', { size: 16 })} ${esc(tl('end'))}</button></div>
      <iframe class="hr-playframe hr-liveframe" title="${esc(tl('layer'))}" allow="fullscreen; autoplay; microphone" allowfullscreen></iframe>`;
    frame = el.querySelector('iframe');
    frame.addEventListener('load', loaded);
    el.addEventListener('click', e => { const b = e.target.closest('[data-lg]'); if (b) act(b.dataset.lg); });
    opts.stage.appendChild(el);
    return el;
  }
  function loaded() {
    if (!frame || !frame.getAttribute('src')) return;   // (the empty frame's own about:blank)
    const p = pathOf(frame);
    // (the live pages moved on inside the frame: the game made, its results; anything else left Homeroom's frame)
    if (/^\/live\/host\/[^/]+/.test(p)) { onDash = /\/dash\/?$/.test(p); poll(); return; }
    if (/^\/live(\/|$)/.test(p)) { if (/^\/live\/results\//.test(p)) { game = null; pill(); } return; }
    close();
  }
  function show() { layer().hidden = false; document.body.classList.add('hr-liveopen'); el.querySelector('.hr-playback').focus({ preventScroll: true }); pill(); }
  /** Back to Homeroom: the game keeps running in the frame; the pill says so. */
  function minimize() { if (!el) return; if (!game) { close(); return; } el.hidden = true; document.body.classList.remove('hr-liveopen'); pill(); }
  function close() { if (el) el.remove(); el = null; frame = null; onDash = false; document.body.classList.remove('hr-liveopen'); pill(); }
  const hostHref = () => (proj && game && proj === game.sid ? `/live/host/${game.sid}/dash` : `/live/host/${game.sid}`);
  /** Open a live game's setup (or the game running now). */
  function open(href) {
    if (opts.closeMenu) opts.closeMenu();
    if (game && game.ctl) { restore(); return; }
    layer(); frame.src = withIn(href); el.querySelector('[data-lgtitle]').textContent = tl('setup'); show();
  }
  function restore() {
    if (!game) return;
    layer();
    const p = pathOf(frame);
    if (!p.startsWith(`/live/host/${game.sid}`)) frame.src = withIn(hostHref());
    show();
  }
  async function endGame() {
    if (!game || busy) return;
    if (!(await ask({ title: tl('endTitle', { title: game.title }), text: tl('endText'), ok: tl('end'), danger: true }))) return;
    busy = true;
    try { const r = await api(url('livegame/end'), { method: 'POST', body: {} }); toast(r.toast); game = null; pill(); paint(); if (el && el.hidden) close(); }
    catch (e) { toast(e.message, { bad: true }); } finally { busy = false; }
  }
  function act(k) { if (k === 'min') minimize(); else if (k === 'end') endGame(); else if (k === 'restore') restore(); }
  // "3 joined of 5 in Homeroom" (of the class's students on their desks or in it), or "3 joined" while players from
  // outside Homeroom (a code) are in it too
  const joined = g => (g.here && g.players === (g.in || []).length ? tl('joinedOf', { count: g.players, total: g.here }) : tl('joined', { count: g.players }));
  /** The pill in the top bar while a game runs and its layer is folded away; the layer's own bar says the same. */
  function pill() {
    let p = document.getElementById('hr-lgpill');
    const on = !!(game && game.ctl) && (!el || el.hidden);
    if (!on) { if (p) p.remove(); }
    else {
      if (!p) { p = document.createElement('span'); p.id = 'hr-lgpill'; p.className = 'hr-lgpill'; p.addEventListener('click', e => { const b = e.target.closest('[data-lg]'); if (b) act(b.dataset.lg); }); place(p); }
      else if (p.dataset.phone !== String(phone())) place(p);
      const h = `<button type="button" class="hr-lgopen" data-lg="restore" aria-label="${esc(tl('restore', { title: game.title }))}">${iconHtml(game.icon || '📡', { size: 18 })}<span class="hr-lgname"><b>${esc(tl('pill', { title: game.title }))}</b> <span class="hr-lgn">${esc(joined(game))}</span></span></button>${game.host ? `<button type="button" class="hr-lgx" data-lg="end" aria-label="${esc(tl('endTitle', { title: game.title }))}">${iconHtml('⏹️', { size: 14 })}<span class="hr-hidephone"> ${esc(tl('end'))}</span></button>` : ''}`;
      if (p.innerHTML !== h) p.innerHTML = h;
    }
    if (el) {
      el.querySelector('[data-lgtitle]').textContent = game ? game.title : tl('setup');
      el.querySelector('[data-lgcount]').textContent = game ? joined(game) : '';
      el.querySelector('[data-lg="end"]').hidden = !(game && game.host);
    }
  }
  // (on a phone the bar is full: the pill floats at the top of the board, as the plan pill does)
  const phone = () => matchMedia('(max-width: 819px)').matches;
  function place(p) { p.dataset.phone = String(phone()); if (phone()) opts.stage.appendChild(p); else { const at = opts.slot(); if (at) at.after(p); } }
  /** "In Brain Board" on the desks of students in the game; a quiet "Not joined yet" on those at their desks who have
   *  not tapped Join (yet: they may be finishing something). */
  function paint() {
    const ids = new Set(game ? game.in : []), wait = new Set(game ? game.waiting || [] : []);
    for (const d of opts.desks()) {
      const on = ids.has(d.dataset.sid), later = !on && wait.has(d.dataset.sid);
      let c = d.querySelector(':scope > .hr-lgin');
      if ((on || later) && !c) { c = document.createElement('span'); c.className = 'hr-lgin'; d.appendChild(c); }
      if (on || later) {
        c.classList.toggle('hr-lgwait', later);
        const h = on ? `${iconHtml(game.icon || '📡', { size: 14 })} ${esc(tl('inGame', { title: game.title }))}` : esc(tl('notYet'));
        if (c.innerHTML !== h) c.innerHTML = h;
      } else if (c) c.remove();
      d.classList.toggle('hr-inlive', on);
    }
  }
  async function poll() {
    clearTimeout(timer); timer = null;
    if (!document.hidden && !(opts.away && opts.away())) {
      try {
        const r = await api(url('livegame'), { background: true });
        const was = game && game.sid;
        game = r.game || null;
        if (game && game.sid !== was && ch) ch.postMessage({ t: 'ask' });
        // (a game ended elsewhere, or by itself: the folded layer goes; an open one shows its results)
        if (!game && el && el.hidden) close();
        pill(); paint(); swap();
      } catch { /* next time */ }
    }
    timer = setTimeout(poll, game || el ? 3000 : 15000);
  }
  /** The projector has the game's host screen: the layer shows the Teacher view; gone again: the host screen. */
  function swap() {
    if (!game || !frame || !game.ctl) return;
    const p = pathOf(frame); if (!p.startsWith(`/live/host/${game.sid}`)) return;
    const want = proj === game.sid;
    if (want !== onDash) { onDash = want; frame.src = withIn(hostHref()); }
  }
  if (ch) ch.onmessage = e => { const m = e.data || {}; if (m.t === 'proj') { proj = m.sid || null; swap(); } };
  document.addEventListener('click', e => {
    const a = e.target.closest('[data-hr="hostlive"], [data-hrlive]');
    if (!a || e.button > 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;
    if (a.closest('.hr-cselecting')) { e.preventDefault(); e.stopPropagation(); toast(tl('notSelect')); return; }
    e.preventDefault(); e.stopPropagation();
    const sh = a.closest('.sheet-bg'); if (sh) sh.querySelector('.close')?.click();
    open(a.dataset.hrlive || a.getAttribute('href'));
  }, true);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) poll(); });
  poll();
  return { open, paint, escape: () => { if (el && !el.hidden) { minimize(); return true; } return false; }, current: () => game, frame: () => frame };
}

/**
 * A student's desk. Nothing opens by itself (the owner: "it shouldn't just move their students' screens into the live
 * game... they should be able to finish up whatever they're doing before they move into the game"). While the class has
 * a live game the desk shows a banner: "<Game> is starting. Join when you're ready." while it is in its lobby, "Live game
 * going on: <Game>" after that, with Join. It stays for as long as the game runs: at the top of the desk (sticky, in the
 * flow, so it covers nothing), under the player's bar over an open game or the Library, under the top of See the room
 * and the teacher's area. Later folds it into a small pill that stays; it never goes away for good. Join opens the game
 * in the desk's player as themselves (no code), in place of whatever was open, as switching does (the open game's page
 * saves as it goes). Leave, or Back to my desk, brings the banner back; the game ending takes it away (and the player
 * back to the desk).
 * opts: { classId, PL: the desk's game player, root, body: the desk's scrolling body, over: the overlays' holder,
 * beforeJoin(): close what the player cannot replace (the Library) } -> { apply(state.livegame), find(id), card(),
 * opened() }
 */
export function liveDesk(opts) {
  let game = null, joining = false, el = null;
  const store = (sid, tok) => { try { sessionStorage.setItem(`lv:${sid}`, tok); } catch { /* the play page asks again */ } };
  const smallKey = sid => `hd-lgsmall:${sid}`;
  const isSmall = () => { try { return !!game && sessionStorage.getItem(smallKey(game.sid)) === '1'; } catch { return false; } };
  const setSmall = on => { try { if (on) sessionStorage.setItem(smallKey(game.sid), '1'); else sessionStorage.removeItem(smallKey(game.sid)); } catch { /* the banner stays large */ } };
  const id = () => (game ? `live:${game.sid}` : '');
  const inGame = () => !!game && String(opts.PL.current() || '') === id();
  async function join() {
    if (!game || joining) return;
    joining = true; card();
    try {
      const r = await api(`/api/desk/${encodeURIComponent(opts.classId)}/livegame`, { method: 'POST', body: {} });
      store(r.sid, r.tok);
      if (game && game.sid === r.sid && opts.beforeJoin) await opts.beforeJoin();
      if (game && game.sid === r.sid) { setSmall(false); opts.PL.open(`live:${r.sid}`); watchFrame(); }
    } catch (e) { toast(e.message, { bad: true }); }
    finally { joining = false; card(); }
  }
  /** The play page left (Leave, the game gone): back to the desk, and the banner (large: Join made it so). */
  function watchFrame() {
    const f = document.querySelector('.hr-player .hr-playframe'); if (!f || f.dataset.lgw) return;
    f.dataset.lgw = '1';
    f.addEventListener('load', () => { const p = pathOf(f); if (p === 'blank') return; if (!/^\/live\/play\//.test(p) && String(opts.PL.current() || '').startsWith('live:')) opts.PL.close({ now: true }); });
  }
  function make() {
    el = document.createElement('div'); el.id = 'hd-lgbar'; el.className = 'hd-lgbar'; el.setAttribute('role', 'region');
    el.innerHTML = '<span class="hd-lgico" aria-hidden="true"></span><span class="hd-lgt" dir="auto" aria-live="polite"></span><span class="hd-lgbtns"></span>';
    el.addEventListener('click', e => {
      if (e.target.closest('[data-lgjoin]')) join();
      else if (e.target.closest('[data-lglater]')) { setSmall(true); card(); el.querySelector('[data-lgjoin]')?.focus({ preventScroll: true }); }
    });
  }
  /** Where the banner goes now: [parent, the element it goes after (null: first)] or null (nowhere to show it). */
  function spot() {
    const ov = opts.over && opts.over.querySelector(':scope > .hd-over');
    if (ov) { const top = ov.querySelector(':scope > .hd-overtop'); return top ? [ov, top] : null; }   // (a Pause screen, the lock: none)
    const pl = opts.root.querySelector(':scope > .hr-player:not(.hr-liveplayer)');
    if (pl) { const top = pl.querySelector(':scope > .hr-playtop'); return top ? [pl, top] : null; }
    return opts.body ? [opts.body, null] : null;
  }
  function place() {
    if (!el) return;
    const at = spot();
    if (!at) { if (el.parentNode) el.remove(); return; }
    const [parent, after] = at;
    if (el.parentNode === parent && el.previousElementSibling === after) return;
    if (after) after.after(el); else parent.prepend(el);
  }
  function card() {
    const on = !!game && !inGame();
    if (!on) { if (el) { el.remove(); el = null; } return; }
    if (!el) make();
    const small = isSmall();
    el.classList.toggle('hd-lgsmall', small);
    el.setAttribute('aria-label', tdk('label'));
    const ico = iconHtml(game.icon || '📡', { size: small ? 20 : 24 });
    const icoEl = el.querySelector('.hd-lgico'); if (icoEl.innerHTML !== ico) icoEl.innerHTML = ico;
    const words = small ? tdk('pill', { title: game.title }) : tdk(game.lobby ? 'starting' : 'going', { title: game.title });
    const tEl = el.querySelector('.hd-lgt'); if (tEl.textContent !== words) tEl.textContent = words;
    const b = `${small ? '' : `<button type="button" class="btn btn-sm hd-lglater" data-lglater>${esc(tdk('later'))}</button>`}<button type="button" class="btn btn-primary btn-sm hr-chunk hd-lgjoin" data-lgjoin aria-label="${esc(tdk('join', { title: game.title }))}"${joining ? ' disabled' : ''}>${esc(tdk('joinShort'))}</button>`;
    const bEl = el.querySelector('.hd-lgbtns'); if (bEl.innerHTML !== b) bEl.innerHTML = b;
    place();
  }
  function apply(lg) {
    game = lg && lg.sid ? lg : null;
    const cur = String(opts.PL.current() || '');
    // the game ended (or another began): the player goes back to the desk
    if (cur.startsWith('live:') && (!game || cur !== id())) { opts.PL.close(); if (!game) toast(tdk('over')); }
    card();
  }
  // (the player, the Library, See the room come and go, and the desk redraws its body: the banner follows)
  const mo = new MutationObserver(() => { if (el) place(); });
  for (const n of [opts.root, opts.over, opts.body]) if (n) mo.observe(n, { childList: true });
  return { apply, card, find: x => (game && x === id() ? { href: `/live/play/${game.sid}`, title: game.title, icon: game.icon || '📡' } : null), opened: watchFrame };
}

/** The projector view: the game's host screen over the page while it runs (for its host). */
export function liveProjector({ classId }) {
  const ch = chanOf(classId);
  let sid = null, el = null;
  const say = () => { if (ch) ch.postMessage({ t: 'proj', sid }); };
  function apply(lg) {
    const next = lg && lg.host ? lg.sid : null;
    if (next === sid) return;
    sid = next;
    if (el) { el.remove(); el = null; }
    if (sid) {
      el = document.createElement('div'); el.className = 'hr-projlive';
      el.innerHTML = `<iframe class="hr-projliveframe" title="${esc(lg.title)}" allow="fullscreen; autoplay" allowfullscreen src="${esc(withIn(lg.host))}"></iframe>`;
      document.body.appendChild(el);
    }
    document.body.classList.toggle('hr-projlivebody', !!sid);
    say();
  }
  if (ch) ch.onmessage = e => { if ((e.data || {}).t === 'ask') say(); };
  addEventListener('pagehide', () => { if (sid && ch) ch.postMessage({ t: 'proj', sid: null }); });
  return { apply };
}
