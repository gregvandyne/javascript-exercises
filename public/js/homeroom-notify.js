// "Your class is in Homeroom. Go to my desk": a calm prompt on every page for a student whose class goes live in
// Homeroom (routes/homeroom.js onEveryPage loads this only for students with a class that has a Homeroom room). It asks
// GET /api/homeroom-live soon after the page opens, then less and less often while nothing is live (backoff to a
// minute), every half minute while a class is live (so the prompt goes when class ends), and never while the tab is
// hidden. Closing the prompt hides it for that class's session of live class.
import { t, api, esc } from '/js/app.js';
import { iconHtml } from '/js/icons.js';

const FIRST = 2000, MIN = 15000, MAX = 60000, LIVE = 30000;
let wait = MIN, timer = null, box = null;
const tn = k => t(`js.homeroom-notify.${k}`);
const closedKey = c => `hr-notify-closed:${c.id}:${c.since || ''}`;
const closed = c => { try { return sessionStorage.getItem(closedKey(c)) === '1'; } catch { return false; } };

function render(c) {
  if (!c) { if (box) { box.remove(); box = null; } return; }
  if (box && box.dataset.class === c.id) return;
  if (box) box.remove();
  box = document.createElement('div');
  box.className = 'hr-notify'; box.dataset.class = c.id; box.setAttribute('role', 'status');
  box.innerHTML = `<span class="hr-notify-t">${iconHtml('🏫', { size: 20 })} <b dir="auto">${esc(c.name)}</b> · <span>${esc(tn('text'))}</span></span>
    <a class="btn btn-primary hr-notify-go" href="/class/${encodeURIComponent(c.id)}/desk">${esc(tn('go'))}</a>
    <button type="button" class="hr-notify-x" aria-label="${esc(tn('close'))}">×</button>`;
  box.querySelector('.hr-notify-x').addEventListener('click', () => { try { sessionStorage.setItem(closedKey(c), '1'); } catch { /* private mode */ } render(null); });
  document.body.appendChild(box);
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
document.addEventListener('visibilitychange', () => { if (!document.hidden) { wait = MIN; check(); } else { clearTimeout(timer); timer = null; } });
timer = setTimeout(check, FIRST);
