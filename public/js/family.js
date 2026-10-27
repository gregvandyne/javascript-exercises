// Grown-up and school billing pages (server/routes/family.js, school-billing.js): "00:00 UTC" also in the reader's own
// time, and the wait after Checkout.
import { $$, api } from '/js/app.js';
const midnight = new Date(); midnight.setUTCHours(24, 0, 0, 0);   // the next reset, so daylight saving time is right
for (const box of $$('[data-utc-midnight]')) {
  const el = box.querySelector('[data-time]'); if (!el) continue;
  try {
    el.textContent = midnight.toLocaleTimeString(document.documentElement.lang || undefined, { hour: 'numeric', minute: '2-digit' });
    el.dateTime = '00:00Z';
    box.hidden = false;
  } catch { /* stays hidden */ }
}

// Back from Stripe's Checkout (/family?checkout=…, or a school's Billing tab): the webhook grants the plan. Ask every
// 2 seconds for up to a minute (the server also asks Stripe itself), then reload the page without the session id.
const wait = document.querySelector('[data-checkout-wait]');
const statusUrl = (wait && wait.dataset.statusUrl) || '/api/billing/status', backTo = (wait && wait.dataset.back) || '/family';
if (wait) {
  const t0 = Date.now();
  const slow = () => { const s = wait.querySelector('[data-slow]'); if (s) s.hidden = false; };
  const tick = async () => {
    let st = null;
    try { st = await api(`${statusUrl}?checkout=${encodeURIComponent(wait.dataset.checkoutWait)}`, { background: true }); } catch { /* try again */ }
    if (st && st.state === 'active') {
      try { sessionStorage.setItem('brb-toast', wait.dataset.done); } catch { /* no toast */ }
      location.replace(backTo);
      return;
    }
    if ((st && st.state === 'not_yours') || Date.now() - t0 > 60e3) return slow();
    setTimeout(tick, 2000);
  };
  setTimeout(tick, 800);
}
