// "My Oomba character" on the Me page (server/views/character.js): the radio groups make a parts spec, the preview is
// drawn by the Oomba Kit (1.1.0, pinned with its hash) running in a hidden same-origin frame, so the kit's own styles
// and listeners stay out of the site's page. Save sends the spec (never a picture) to /api/me/character.
import { api, toast, t } from '/js/app.js';

const form = document.getElementById('charform');
const dataEl = document.getElementById('char-data');
if (form && dataEl) init(JSON.parse(dataEl.textContent));

function init(data) {
  const canvas = document.getElementById('ch-canvas'), status = document.getElementById('ch-status');
  let style = 'playful', O = null;
  const val = n => { const el = form.querySelector(`input[name="${n}"]:checked`); return el ? el.value : ''; };
  /** The spec the form shows (the same shape the server keeps). */
  function spec() {
    if (data.guest) return { species: 'oomba' };
    const sp = val('species');
    const o = { species: sp, body: val('body'), mood: val('mood'), colors: { base: val('base') || 'mint', accent: val('accent') }, wear: val('wear') ? [val('wear')] : [],
      bold: { wear: [val('boldHat'), val('boldTop')].filter(Boolean), mood: val('boldMood') } };
    if (sp === 'kid') { o.skin = +val('skin'); o.hair = { style: val('hair'), color: val('hairColor') }; o.outfit = { top: val('top'), color: val('topColor') }; }
    return o;
  }
  /** What Oomba.avatar() hands a game in this style (kit/src/index.js does the same). */
  const look = (c, bold) => { const b = bold ? c.bold || {} : {}; return Object.assign({}, c, { wear: [...(c.wear || []), ...(b.wear || [])], mood: bold ? b.mood : c.mood, bold: 0, seed: 7 }); };
  function draw() {
    if (!O || !canvas) return;
    try {
      O.style(style);
      const dpr = Math.min(3, window.devicePixelRatio || 1), src = O.art.toCanvas(look(spec(), style === 'bold'), Math.round(260 * dpr));
      canvas.width = src.width; canvas.height = src.height;
      const ctx = canvas.getContext('2d'); ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.drawImage(src, 0, 0);
    } catch { /* the preview is a nicety: the editor still saves */ }
  }
  function sync() {
    form.classList.toggle('notkid', spec().species !== 'kid');
    form.classList.toggle('isbold', style === 'bold');
    const note = document.getElementById('ch-boldnote'); if (note) note.hidden = style !== 'bold';
  }
  // The kit in a hidden frame of our own origin (the site's CSP allows /vendor/ scripts there too).
  const fr = document.createElement('iframe');
  fr.hidden = true; fr.tabIndex = -1; fr.setAttribute('aria-hidden', 'true'); fr.title = '';
  document.body.appendChild(fr);
  const doc = fr.contentDocument; doc.open(); doc.write('<!doctype html><html><head><meta charset="utf-8"></head><body></body></html>'); doc.close();
  const load = (src, sri) => new Promise((ok, bad) => { const s = doc.createElement('script'); s.src = src; s.integrity = sri; s.crossOrigin = 'anonymous'; s.onload = ok; s.onerror = bad; doc.head.appendChild(s); });
  load(data.kit.src, data.kit.sri).then(() => load(data.kit.bold, data.kit.boldSri)).then(() => {
    O = fr.contentWindow.Oomba;
    draw(); form.dataset.ready = '1';
    O.fonts.ready.then(draw);
  }).catch(() => { form.dataset.ready = 'no'; });

  form.addEventListener('change', () => { sync(); draw(); if (status) status.textContent = t('js.character.unsaved'); });
  form.addEventListener('click', e => {
    const b = e.target.closest('[data-chstyle]'); if (!b) return;
    style = b.dataset.chstyle;
    form.querySelectorAll('[data-chstyle]').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    sync(); draw();
  });
  const reset = document.getElementById('ch-reset');
  if (reset) reset.addEventListener('click', () => {
    const d = data.defaults, b = d.bold || {};
    const set = (n, v) => { const el = form.querySelector(`input[name="${n}"][value="${v}"]`); if (el) el.checked = true; };
    set('species', d.species); set('body', d.body); set('skin', String(d.skin)); set('hair', d.hair.style); set('hairColor', d.hair.color);
    set('mood', d.mood); set('top', d.outfit.top); set('topColor', d.outfit.color); set('base', d.colors.base); set('accent', d.colors.accent);
    set('wear', (d.wear || [])[0] || ''); set('boldHat', (b.wear || []).find(w => data.lists.boldHat.includes(w)) || ''); set('boldTop', (b.wear || []).find(w => data.lists.boldTop.includes(w)) || ''); set('boldMood', b.mood || 'determined');
    sync(); draw(); if (status) status.textContent = t('js.character.unsaved');
  });
  form.addEventListener('submit', async e => {
    e.preventDefault(); if (data.guest) return;
    const btn = document.getElementById('ch-save'); if (btn) btn.disabled = true;
    try { const r = await api('/api/me/character', { method: 'POST', body: { character: spec() } }); toast(r.toast || t('js.character.saved')); if (status) status.textContent = ''; form.dataset.saved = '1'; }
    catch (err) { toast(err.message, { bad: true }); }
    finally { if (btn) btn.disabled = false; }
  });
  sync();
}
