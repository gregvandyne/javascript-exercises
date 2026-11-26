// "Your class is in Homeroom. Go to my desk": a calm prompt on every page for a student whose class goes live in
// Homeroom (routes/homeroom.js onEveryPage loads this only for students with a class that has a Homeroom room). It asks
// GET /api/homeroom-live soon after the page opens, then less and less often while nothing is live (backoff to a
// minute), every half minute while a class is live (so the prompt goes when class ends), and never while the tab is
// hidden. Closing the prompt hides it for that class's session of live class. Only while a class is live, never on the
// desk itself or in a page the desk's player frames (routes/homeroom.js leaves it out there too), and small on a phone.
// It sits at the top of the page's content, never floating over a board or its controls.
import { t, api, esc } from '/js/app.js';
import { iconHtml } from '/js/icons.js';

const FIRST = 2000, MIN = 15000, MAX = 60000, LIVE = 30000;
let wait = MIN, timer = null, box = null;
const tn = k => t(`js.homeroom-notify.${k}`);
const closedKey = c => `hr-notify-closed:${c.id}:${c.since || ''}`;
const closed = c => { try { return sessionStorage.getItem(closedKey(c)) === '1'; } catch { return false; } };

/** Never inside a frame (the desk's player shows pages in one: the student is at their desk already). */
const framed = (() => { try { return window.top !== window; } catch { return true; } })();
function render(c) {
  if (framed) return;
  if (!c) { if (box) { box.remove(); box = null; } return; }
  if (box && box.dataset.class === c.id) return;
  if (box) box.remove();
  box = document.createElement('div');
  box.className = 'hr-notify'; box.dataset.class = c.id; box.setAttribute('role', 'status');
  box.innerHTML = `<span class="hr-notify-t">${iconHtml('🏫', { size: 20 })} <b dir="auto">${esc(c.name)}</b><span class="hr-notify-more"> · ${esc(tn('text'))}</span></span>
    <a class="btn btn-primary hr-notify-go" href="/class/${encodeURIComponent(c.id)}/desk">${esc(tn('go'))}</a>
    <button type="button" class="hr-notify-x" aria-label="${esc(tn('close'))}">×</button>`;
  box.querySelector('.hr-notify-x').addEventListener('click', () => { try { sessionStorage.setItem(closedKey(c), '1'); } catch { /* private mode */ } render(null); });
  // at the top of the page, in its flow (never over a board, its controls or a frame)
  const main = document.getElementById('main');
  if (main) main.prepend(box); else document.body.prepend(box);
}
async function check() {
  clearTimeout(timer); timer = null;
  if (document.hidden) return;
  let live = [];
  try { live = (await api('/api/homeroom-live', { background: true })).live || []; } catch { /* offline: try again later */ }
  const c = live.find(x => !closed(x));
  render(c || null);
  wait = live.length ? LIVE : Math.min(MAX, Math.round(wait * 1.5));
  timer = setTimeout(check, wait);
}
document.addEventListener('visibilitychange', () => { if (framed) return; if (!document.hidden) { wait = MIN; check(); } else { clearTimeout(timer); timer = null; } });
if (!framed) timer = setTimeout(check, FIRST);
