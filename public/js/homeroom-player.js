// Playing a game inside Homeroom (docs/decisions.md "Homeroom: one page, three views", "Playing inside Homeroom"): the
// teacher's board (Play / Preview on a My desk card) and a student's desk (a handout card) open the game in a layer over
// themselves, so nothing underneath goes away: the board keeps its zoom, place and live polling; the desk keeps Raise
// hand, Pause screens, Bring everyone to me, the lock and its state poll. The layer is the game's own play page in a
// frame (?in=hr: routes/games.js lets this site, and only this site, frame it, and hides its Back links), under a bar
// with "Back to Homeroom" / "Back to my desk". The address carries the open game (#play=<id>), so a reload opens it
// again and Back closes it; Escape closes it too, and a game's own "back" (play.js brb:back) asks the layer to close.
import { esc } from '/js/app.js';
import { iconHtml } from '/js/icons.js';

/**
 * opts: { host: element the layer covers, path: the page's own address (no hash), back: the close button's words,
 * find: id -> { href, title, icon } | null (null: not playable here), onOpen(id), onClose(id), away: () => true while
 * the page is not on screen (another view), hostLive(mode): a game in the layer asked to host its live version }.
 * -> { open(id), close(), current(), sync() }
 */
export function gamePlayer(opts) {
  let cur = null, el = null;
  const hashId = () => { const m = /^#play=([^&]{1,120})$/.exec(location.hash); try { return m ? decodeURIComponent(m[1]) : null; } catch { return null; } };
  const onPage = () => location.pathname.replace(/\/+$/, '') === opts.path;
  // (?in=hr goes before a #hash: a Manipulatives tool's address is /manipulatives#<tool> or #join/<room>)
  const src = href => { const [path, hash] = [href.split('#')[0], href.includes('#') ? href.slice(href.indexOf('#')) : '']; return `${path}${path.includes('?') ? '&' : '?'}in=hr${hash}`; };
  const plain = () => location.pathname + location.search;
  function show(id) {
    if (cur === id && el) return true;
    const x = opts.find(id); if (!x || !x.href) return false;
    hide(false);
    el = document.createElement('div');
    el.className = 'hr-player'; el.setAttribute('role', 'region'); el.setAttribute('aria-label', x.title || '');
    // (one compact bar: the way back, the title (two lines at most, never cut short on a phone), a preview's label, and a
    // slot the desk fills with its Raise hand, so nothing above the game says it twice)
    el.innerHTML = `<div class="hr-playtop"><button type="button" class="btn hr-chunk hr-playback" data-hrplayer="close" aria-label="${esc(opts.back)}"><span class="flip" aria-hidden="true">←</span> <span class="hr-playbackt">${esc(opts.back)}</span></button>
      <span class="hr-playt" dir="auto">${iconHtml(x.icon || '🎮', { size: 20 })} <b>${esc(x.title || '')}</b></span>${x.badge ? `<span class="hr-playbadge">${iconHtml('👀', { size: 16 })} <span>${esc(x.badge)}</span></span>` : ''}${opts.note ? `<span class="hr-playnote">${iconHtml('👀', { size: 16 })} <span>${esc(opts.note)}</span></span>` : ''}<span class="hr-playslot"></span></div>
      <iframe class="hr-playframe" src="${esc(src(x.href))}" title="${esc(x.title || '')}" allow="fullscreen; autoplay; microphone" allowfullscreen></iframe>`;
    el.querySelector('[data-hrplayer]').addEventListener('click', () => askThen(close));
    opts.host.appendChild(el);
    cur = id;
    if (opts.onOpen) opts.onOpen(id);
    el.querySelector('.hr-playback').focus({ preventScroll: true });
    return true;
  }
  function hide(notify = true) {
    if (!el) return;
    el.remove(); el = null;
    const was = cur; cur = null;
    if (notify && opts.onClose) opts.onClose(was);
  }
  /** Open a game from a tap: a new history entry, so Back closes it. */
  function open(id) {
    if (!show(id)) return false;
    if (hashId() !== id) history.pushState({ ...(history.state || {}), hrplay: id }, '', `${plain()}#play=${encodeURIComponent(id)}`);
    return true;
  }
  /** now: hide it here and now, without going Back (the frame moved on by itself, as a live game's Leave does: that put
   *  the frame's own page in the history, so Back would only take the frame back) */
  function close(o) {
    if (!cur) return;
    if (!(o && o.now === true) && history.state && history.state.hrplay === cur && hashId() === cur) { history.back(); return; }   // popstate hides it
    hide();
    if (hashId()) history.replaceState(history.state, '', plain());
  }
  // A game with something under way (play.js window.oombaGuarded: Arithmetic Lab's set started) asks first whenever the
  // player closes the layer (its bar, Escape, the game page's own Escape, Back); the page's own closes (the teacher brings
  // everyone back, the lock) do not ask.
  const playWin = () => { const f = el && el.querySelector('iframe'); try { return f && f.contentWindow; } catch { return null; } };
  const guarded = () => { try { const w = playWin(); return !!(w && typeof w.oombaGuarded === 'function' && w.oombaGuarded()); } catch { return false; } };
  function askThen(fn) {
    if (!guarded()) return fn();
    let ask = null; try { ask = playWin().oombaAskLeave; } catch { ask = null; }
    if (typeof ask !== 'function') return fn();
    Promise.resolve(ask()).then(ok => { if (ok) fn(); }, () => fn());
  }
  let letGo = false;
  /** The address says which game is open (a reload, Back, Forward). */
  function sync() {
    if (!onPage()) return;
    const id = hashId();
    if (id && id !== cur) { if (!show(id)) history.replaceState(history.state, '', plain()); }
    else if (!id && cur) {
      if (letGo || !guarded()) { letGo = false; hide(); return; }
      // Back with a set under way: the layer stays, and the game asks
      const was = cur;
      history.pushState({ ...(history.state || {}), hrplay: was }, '', `${plain()}#play=${encodeURIComponent(was)}`);
      askThen(() => { if (cur !== was) return; letGo = true; close(); if (!cur) letGo = false; });
    }
  }
  addEventListener('popstate', sync);
  addEventListener('message', e => {
    const f = el && el.querySelector('iframe');
    if (!f || e.source !== f.contentWindow || e.origin !== location.origin || !e.data) return;
    if (e.data.type === 'hr:close') askThen(close);
    // a game's door asked to host its live version (Atlas Quest's Host live, play.js brb:hostlive): this layer closes and
    // the page opens its live layer (opts.hostLive)
    else if (e.data.type === 'hr:hostlive' && opts.hostLive && /^[a-z-]{1,20}$/.test(String(e.data.mode || ''))) { const mode = e.data.mode; close(); opts.hostLive(mode); }
  });
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape' || !cur || (opts.away && opts.away()) || document.querySelector('.sheet-bg, dialog[open]')) return;
    e.preventDefault(); e.stopImmediatePropagation(); askThen(close);
  }, true);
  return { open, close, sync, current: () => cur, slot: () => (el ? el.querySelector('.hr-playslot') : null) };
}
