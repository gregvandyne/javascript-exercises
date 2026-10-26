import { api, toast, $$, t } from '/js/app.js';
document.addEventListener('click', async e => {
  const b = e.target.closest('[data-avatar],[data-color]'); if (!b) return;
  const body = b.dataset.avatar ? { avatar: b.dataset.avatar } : { color: b.dataset.color };
  try { await api('/api/me', { method: 'POST', body }); $$(b.dataset.avatar ? '[data-avatar]' : '[data-color]').forEach(x => x.setAttribute('aria-pressed', String(x === b))); toast(t('js.me.lookingGood')); setTimeout(() => location.reload(), 400); }
  catch (err) { toast(err.message, { bad: true }); }
});
// The emoji and colour dropdowns: one open at a time; Escape or a click outside closes them.
const picks = [...document.querySelectorAll('[data-lookpick]')];
for (const d of picks) {
  d.addEventListener('toggle', () => {
    if (!d.open) return;
    for (const o of picks) if (o !== d) o.open = false;
    const cur = d.querySelector('[aria-pressed="true"]') || d.querySelector('.lookmenu button'); if (cur) cur.focus();
  });
  d.addEventListener('keydown', e => { if (e.key === 'Escape' && d.open) { e.preventDefault(); d.open = false; d.querySelector('summary').focus(); } });
}
document.addEventListener('click', e => { for (const d of picks) if (d.open && !d.contains(e.target)) d.open = false; });
const tg = document.getElementById('chat-toggle');
if (tg) tg.addEventListener('change', async () => { try { await api('/api/me', { method: 'POST', body: { chatEnabled: tg.checked } }); toast(tg.checked ? t('js.me.chatOn') : t('js.me.chatOff')); } catch (err) { toast(err.message, { bad: true }); tg.checked = !tg.checked; } });

// Profile photo: shrink and crop to a 512px square JPEG in the browser (this also drops the camera's location data),
// then send it for the safety check.
const pick = document.getElementById('photo-pick'), file = document.getElementById('photo-file'), remove = document.getElementById('photo-remove');
async function toJpeg(f) {
  let img;
  try { img = await createImageBitmap(f, { imageOrientation: 'from-image' }); }
  catch { img = await new Promise((ok, bad) => { const i = new Image(); i.onload = () => ok(i); i.onerror = bad; i.src = URL.createObjectURL(f); }); }
  const w = img.width, h = img.height, side = Math.min(w, h), out = Math.min(512, side);
  const c = document.createElement('canvas'); c.width = c.height = out;
  c.getContext('2d').drawImage(img, (w - side) / 2, (h - side) / 2, side, side, 0, 0, out, out);
  return new Promise((ok, bad) => c.toBlob(b => (b ? ok(b) : bad(new Error('no blob'))), 'image/jpeg', 0.86));
}
if (pick) pick.addEventListener('click', () => file.click());
if (file) file.addEventListener('change', async () => {
  const f = file.files && file.files[0]; if (!f) return;
  file.value = '';
  const old = pick.innerHTML; pick.disabled = true; pick.textContent = t('js.me.photoChecking');
  try {
    let blob; try { blob = await toJpeg(f); } catch { throw new Error(t('js.me.photoBad')); }
    const res = await fetch('/api/me/photo', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'image/jpeg' }, body: blob });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || t('js.app.wentWrong'));
    toast(t('js.me.photoSaved')); setTimeout(() => location.reload(), 500);
  } catch (err) { toast(err.message, { bad: true, ms: 5000 }); pick.disabled = false; pick.innerHTML = old; }
});
if (remove) remove.addEventListener('click', async () => {
  try { await api('/api/me/photo', { method: 'DELETE' }); toast(t('js.me.photoRemoved')); setTimeout(() => location.reload(), 400); }
  catch (err) { toast(err.message, { bad: true }); }
});
