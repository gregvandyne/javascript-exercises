// Creator dashboard + admin money page (Money node).
import { api, toast, $, $$ } from '/js/app.js';

// Creator: ask for a payout.
const payBtn = $('#payout-btn');
if (payBtn) payBtn.addEventListener('click', async () => {
  if (payBtn.disabled) return;
  payBtn.disabled = true;
  try {
    const r = await api('/api/creator/payout', { method: 'POST', body: {} });
    toast(`Done! We got your request for $${(r.payout.amount_cents / 100).toFixed(2)}.`);
    setTimeout(() => location.reload(), 900);
  } catch (e) { toast(e.message, { bad: true }); payBtn.disabled = false; }
});

// Creator: keep the "playing now" total in step with the per-game live counts app.js refreshes.
const liveTotal = $('#live-total');
if (liveTotal) setInterval(() => {
  const n = $$('.mgames [data-live]').reduce((s, el) => s + (parseFloat(el.textContent) || 0) * (/K$/.test(el.textContent) ? 1000 : 1), 0);
  liveTotal.textContent = String(Math.round(n));
}, 31000);

// Admin: roll up now.
const form = $('#rollup-form');
if (form) form.addEventListener('submit', async e => {
  e.preventDefault();
  const btn = $('[type=submit]', form); btn.disabled = true;
  try {
    const { result } = await api('/api/admin/money/rollup', { method: 'POST', body: { day: $('#rollup-day').value } });
    toast(`Rolled up ${result.day}: ${result.games} game${result.games === 1 ? '' : 's'}, ${Math.round(result.impressions)} impressions.`);
    setTimeout(() => location.reload(), 900);
  } catch (err) { toast(err.message, { bad: true }); btn.disabled = false; }
});

// Admin: mark paid / cancel.
document.addEventListener('click', async e => {
  const b = e.target.closest('[data-payout]'); if (!b) return;
  const paid = b.dataset.status === 'paid';
  const note = prompt(paid ? 'Mark this payout as paid. Add a note (for example how it was sent):' : 'Cancel this payout? The money goes back to the builder’s balance. Add a note:', '');
  if (note === null) return;
  b.disabled = true;
  try {
    await api(`/api/admin/money/payouts/${encodeURIComponent(b.dataset.payout)}`, { method: 'POST', body: { status: b.dataset.status, note } });
    toast(paid ? 'Marked as paid.' : 'Payout cancelled.');
    setTimeout(() => location.reload(), 700);
  } catch (err) { toast(err.message, { bad: true }); b.disabled = false; }
});
