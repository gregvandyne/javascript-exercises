// Oomba Live results page (docs/live-protocol.md "Page hooks", /live/results/:id). The page works without this script
// (its buttons are data-api forms app.js posts); this adds Print, and hides "Play again" when the players' linger runs
// out (2 minutes after the end).
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const p = $('#lv-print');
  if (p) p.addEventListener('click', () => window.print());
  let data = {}; try { data = JSON.parse(($('#lv-results-data') || {}).textContent || '{}'); } catch { /* none */ }
  // "Who ran this game" without a school time zone: times of day in this device's own time
  for (const el of document.querySelectorAll('time[data-lv-local]')) {
    const d = new Date(el.getAttribute('datetime'));
    if (!isNaN(d)) try { el.textContent = new Intl.DateTimeFormat(document.documentElement.lang || undefined, { hour: '2-digit', minute: '2-digit' }).format(d); } catch { /* keep the server's */ }
  }
  const again = $('#lv-play-again');
  if (again && data.again) setTimeout(() => { again.hidden = true; }, 115e3);
})();
