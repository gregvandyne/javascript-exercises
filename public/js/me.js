import { api, toast, sheet, $$, t } from '/js/app.js';
document.addEventListener('click', async e => {
  const b = e.target.closest('[data-avatar],[data-color]'); if (!b) return;
  const body = b.dataset.avatar ? { avatar: b.dataset.avatar } : { color: b.dataset.color };
  try { await api('/api/me', { method: 'POST', body }); $$(b.dataset.avatar ? '[data-avatar]' : '[data-color]').forEach(x => x.setAttribute('aria-pressed', String(x === b))); toast(t('js.me.lookingGood')); setTimeout(() => location.reload(), 400); }
  catch (err) { toast(err.message, { bad: true }); }
});
// "Edit photo": one sheet with the photo, the emoji and the colour (the choices above save as soon as they are tapped).
const edit = document.getElementById('look-edit'), tpl = document.getElementById('look-sheet');
if (edit && tpl) edit.addEventListener('click', () => {
  const sh = sheet({ title: t('js.me.lookTitle'), content: tpl.innerHTML });
  const cur = sh.el.querySelector('[data-avatar][aria-pressed="true"]'); if (cur) setTimeout(() => cur.focus(), 40);
});
const tg = document.getElementById('chat-toggle');
if (tg) tg.addEventListener('change', async () => { try { await api('/api/me', { method: 'POST', body: { chatEnabled: tg.checked } }); toast(tg.checked ? t('js.me.chatOn') : t('js.me.chatOff')); } catch (err) { toast(err.message, { bad: true }); tg.checked = !tg.checked; } });

// Profile photo: shrink and crop to a 512px square JPEG in the browser (this also drops the camera's location data),
// then send it for the safety check.
const file = document.getElementById('photo-file');
let pick = null;   // the sheet's upload button that was pressed
async function toJpeg(f) {
  let img;
  try { img = await createImageBitmap(f, { imageOrientation: 'from-image' }); }
  catch { img = await new Promise((ok, bad) => { const i = new Image(); i.onload = () => ok(i); i.onerror = bad; i.src = URL.createObjectURL(f); }); }
  const w = img.width, h = img.height, side = Math.min(w, h), out = Math.min(512, side);
  const c = document.createElement('canvas'); c.width = c.height = out;
  c.getContext('2d').drawImage(img, (w - side) / 2, (h - side) / 2, side, side, 0, 0, out, out);
  return new Promise((ok, bad) => c.toBlob(b => (b ? ok(b) : bad(new Error('no blob'))), 'image/jpeg', 0.86));
}
document.addEventListener('click', e => { const b = e.target.closest('[data-photo-pick]'); if (b && file) { pick = b; file.click(); } });
if (file) file.addEventListener('change', async () => {
  const f = file.files && file.files[0]; if (!f) return;
  file.value = '';
  const old = pick ? pick.innerHTML : ''; if (pick) { pick.disabled = true; pick.textContent = t('js.me.photoChecking'); }
  try {
    let blob; try { blob = await toJpeg(f); } catch { throw new Error(t('js.me.photoBad')); }
    const res = await fetch('/api/me/photo', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'image/jpeg' }, body: blob });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || t('js.app.wentWrong'));
    toast(t('js.me.photoSaved')); setTimeout(() => location.reload(), 500);
  } catch (err) { toast(err.message, { bad: true, ms: 5000 }); if (pick) { pick.disabled = false; pick.innerHTML = old; } }
});
document.addEventListener('click', async e => {
  if (!e.target.closest('[data-photo-remove]')) return;
  try { await api('/api/me/photo', { method: 'DELETE' }); toast(t('js.me.photoRemoved')); setTimeout(() => location.reload(), 400); }
  catch (err) { toast(err.message, { bad: true }); }
});

// "For grown-ups" (server/routes/family.js): Get a code shows the new code here. Only an HMAC of it is kept, so it is
// shown once; Get a new code replaces it.
document.addEventListener('click', async e => {
  const b = e.target.closest('[data-family-code]'); if (!b) return;
  b.disabled = true;
  try {
    const r = await api('/api/me/family/code', { method: 'POST', body: {} });
    const box = document.getElementById('famcode'), val = document.getElementById('famcode-value');
    if (box && val) { val.textContent = r.code; box.hidden = false; }
    b.remove();
  } catch (err) { toast(err.message, { bad: true }); b.disabled = false; }
});
