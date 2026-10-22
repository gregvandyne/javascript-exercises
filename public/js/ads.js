// Sponsored card impressions (Money node). An impression counts only when a card is at least 50%
// visible for 1 continuous second while the tab is visible. One beacon per card per page view.
// The server dedupes again (per session, placement and hour) and applies the fraud controls.
// No third-party code, no cookies beyond our own session, nothing about the player is sent.
const URL_ = '/api/ads/impression';
const DWELL = 1000;
const sent = new WeakSet();
const timers = new Map(); // card -> timeout id
const visible = new Set(); // cards currently >= 50% in view

function send(card) {
  if (sent.has(card)) return;
  sent.add(card);
  const d = card.dataset;
  const body = { ad: d.ad, placement: d.placement };
  if (d.game) body.game = d.game;
  if (d.games) body.games = d.games.split(',').filter(Boolean);
  const json = JSON.stringify(body);
  try {
    if (navigator.sendBeacon && navigator.sendBeacon(URL_, new Blob([json], { type: 'application/json' }))) return;
  } catch { /* fall through */ }
  fetch(URL_, { method: 'POST', credentials: 'same-origin', keepalive: true, headers: { 'Content-Type': 'application/json' }, body: json }).catch(() => {});
}
function arm(card) {
  if (sent.has(card) || timers.has(card) || document.hidden) return;
  timers.set(card, setTimeout(() => { timers.delete(card); if (visible.has(card) && !document.hidden) { send(card); io.unobserve(card); visible.delete(card); } }, DWELL));
}
function disarm(card) { clearTimeout(timers.get(card)); timers.delete(card); }

const io = 'IntersectionObserver' in window ? new IntersectionObserver(entries => {
  for (const e of entries) {
    const card = e.target;
    if (e.isIntersecting && e.intersectionRatio >= 0.5) { visible.add(card); arm(card); }
    else { visible.delete(card); disarm(card); }
  }
}, { threshold: [0, 0.5, 1] }) : null;

function watch(root = document) {
  if (!io) return; // very old browsers: no impressions are counted (never guess)
  for (const card of root.querySelectorAll('a.adcard[data-ad][data-placement]')) if (!sent.has(card)) io.observe(card);
}
// A hidden tab pauses the 1-second clock; it starts again from zero when the tab comes back.
document.addEventListener('visibilitychange', () => {
  if (document.hidden) for (const c of [...timers.keys()]) disarm(c);
  else for (const c of visible) arm(c);
});
watch();
// Search swaps its results in place: watch new cards as they arrive.
if (io && 'MutationObserver' in window) {
  new MutationObserver(muts => { for (const m of muts) for (const n of m.addedNodes) if (n.nodeType === 1) { if (n.matches('a.adcard')) watch(n.parentNode); else watch(n); } })
    .observe(document.body, { childList: true, subtree: true });
}
