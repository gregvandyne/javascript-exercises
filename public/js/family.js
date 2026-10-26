// Grown-up pages (server/routes/family.js): "00:00 UTC" also in the reader's own time.
import { $$ } from '/js/app.js';
const midnight = new Date(); midnight.setUTCHours(24, 0, 0, 0);   // the next reset, so daylight saving time is right
for (const box of $$('[data-utc-midnight]')) {
  const el = box.querySelector('[data-time]'); if (!el) continue;
  try {
    el.textContent = midnight.toLocaleTimeString(document.documentElement.lang || undefined, { hour: 'numeric', minute: '2-digit' });
    el.dateTime = '00:00Z';
    box.hidden = false;
  } catch { /* stays hidden */ }
}
