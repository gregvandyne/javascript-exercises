// Oomba Live results page (docs/live-protocol.md "Page hooks", /live/results/:id). The page works without this script
// (its buttons are data-api forms app.js posts); this adds Print, and hides "Play again" when the players' linger runs
// out (2 minutes after the end).
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const p = $('#lv-print');
  if (p) p.addEventListener('click', () => window.print());
  let data = {}; try { data = JSON.parse(($('#lv-results-data') || {}).textContent || '{}'); } catch { /* none */ }
  const again = $('#lv-play-again');
  if (again && data.again) setTimeout(() => { again.hidden = true; }, 115e3);
})();
