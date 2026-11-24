// The book editor (/library/make/:id; server/routes/storybook.js, docs/storybook-builder.md): the book's title, the
// warnings (click one to jump to its page), the story map of a choose-your-own-adventure (pages and the arrows between
// them), the pages, and one page at a time: its picture (a drawn one from the art packs: world, mood, characters and
// spots; or the teacher's own upload), alt text, title, words, and for an adventure its choices, ending and start.
// Every edit is saved a moment later (POST .../save with the version it was made on; a newer version, Oomba's, wins and
// the page reloads it). Beside it, Oomba's chat: for a teacher with the companion, the one Oomba chat of the whole site
// (public/js/companion.js; this page tells it which book it is through public/js/oomba-bus.js, and every AI change to the
// book is a turn there, with Undo); otherwise the book's own chat panel (the shared chat client, public/js/oomba-chat.js).
// Each answer is a new version of the book, with Undo. Preview opens the reader as students see it; Print makes the numbered print copy.
// With the picture model on (services/storybook-draw.js), each page's picture is painted in the background: the line
// under the warnings says how far it is (or, calmly, why the art-pack drawings are used), each page shows its own state,
// and Redraw (with an optional note) paints a page or a character's reference picture again. While a picture is still
// being painted, the page, its thumbnails in the page list and the story map show the painting placeholder, never the
// art-pack drawing; the art-pack drawing appears only as a real fallback, with its reason and Paint pictures again.
// Under a painted picture, "What Oomba asked for" opens the words that were sent to the picture maker for it (the book's
// owner only; loaded when opened). The More menu's Paint all pictures again paints every picture of the book again.
import { api, t, esc, pageData, toast, sheet, ask } from '/js/app.js';
import { iconHtml } from '/js/icons.js';
import { mountChat } from '/js/oomba-chat.js';
import * as BUS from '/js/oomba-bus.js';
import { uploadPic } from '/js/storybook-pic.js';
import { pictureSvg, paintingHtml } from '/js/storybook-art.js';
import { warningsOf, mapLayout, numbering, LIMITS, MOODS, POSITIONS } from '/js/storybook-core.js';

const D = pageData();
const $ = id => document.getElementById(id);
const cyoa = D.kind === 'cyoa';
let B = D.book, rev = D.rev, state = D.state || 'ready', sel = null, uploads = D.uploads || [], shared = D.shared || [], DR = D.draws || { pages: {}, cast: {} };
const charName = id => (D.chars.find(c => c.id === id) || {}).name || id;

// ---------------------------------------------------------------- saving
let timer = null, saving = false, again = false;
const status = s => { $('sb-saved').textContent = s; };
function changed({ now = false } = {}) { status(t('js.storybook-edit.unsaved')); clearTimeout(timer); timer = setTimeout(save, now ? 0 : 900); drawWarnings(); drawMap(); drawList(); }
async function save() {
  if (saving) { again = true; return; }
  saving = true; status(t('js.storybook-edit.saving'));
  try {
    const r = await api(`/api/library/make/${D.id}/save`, { method: 'POST', body: { book: B, rev } });
    rev = r.rev; status(t('js.storybook-edit.saved'));
  } catch (e) {
    if (e.status === 409) { await reload(); toast(t('js.storybook-edit.reloaded')); }
    else status(e.message);
  } finally { saving = false; if (again) { again = false; save(); } }
}
async function reload() {
  const r = await api(`/api/library/make/${D.id}`, { background: true });
  B = r.book; rev = r.rev; uploads = r.uploads || []; shared = r.shared || []; if (r.draws) DR = r.draws; if (r.state) state = r.state;
  setLeft(r.left); watchDraws();
  if (!B.pages.find(p => p.id === sel)) sel = null;
  drawAll();
}

// ---------------------------------------------------------------- drawing
const num = () => numbering(B);
const pageLabel = (p, n = num()) => `${t('js.storybook-edit.pageN', { n: n.get(p.id) })}${p.title ? `: ${p.title}` : p.text ? `: ${p.text.slice(0, 32)}${p.text.length > 32 ? '…' : ''}` : ''}`;
const drawnOf = p => (!p.upload && p.pic && DR.pages[p.id] && DR.pages[p.id].pic) || null;
/** Oomba is still painting this page's picture and has none to show meanwhile: the placeholder, not the art pack. */
const paintingOf = p => !p.upload && !!p.pic && busy(DR.pages[p.id]) && !drawnOf(p);
const artOf = (p, { decorative = true } = {}) => {
  if (p.upload) return `<img class="sb-art" src="/library/made/${esc(D.id)}/pic/${esc(p.upload)}" alt="${decorative ? '' : esc(p.alt)}">`;
  if (drawnOf(p)) return `<img class="sb-art" src="/library/made/${esc(D.id)}/pic/${esc(drawnOf(p))}" alt="${decorative ? '' : esc(p.alt)}" width="800" height="450">`;
  if (paintingOf(p)) return paintingHtml(t('js.storybook-edit.draw.painting'), { decorative });
  return p.pic ? pictureSvg(p.pic, B.cast, D.catalog, { key: `${D.id}:${p.id}`, label: p.alt, decorative }) : `<div class="sb-nopic">${esc(t('js.storybook-edit.noPic'))}</div>`;
};
function drawAll() {
  const empty = !B.pages.length;
  $('sb-wait').hidden = !empty || state === 'unfinished'; $('sb-unfinished').hidden = !empty || state !== 'unfinished'; $('sb-ebody').hidden = empty;
  if (document.activeElement !== $('sb-title')) $('sb-title').value = B.title || '';
  if (!empty && !sel) sel = cyoa ? B.start || B.pages[0].id : B.pages[0].id;
  drawWarnings(); drawDrawLine(); drawMap(); drawList(); drawPage();
}
// ---------------------------------------------------------------- the picture model's pictures
function busy(d) { return !!d && (d.state === 'queued' || d.state === 'drawing'); }
/** Pictures that show the art-pack drawing because painting fell back (nothing painted to keep). */
const fellBack = () => [...Object.values(DR.pages || {}), ...Object.values(DR.cast || {})].filter(d => d.state === 'fallback' && !d.pic).length;
const repaintBtn = () => `<button type="button" class="btn btn-sm" data-act="repaint">${iconHtml('🎨', { size: 16 })} ${esc(t('js.storybook-edit.draw.repaint'))}</button>`;
// "All pictures painted." shows for a few seconds after the last picture arrives, then the line hides.
let justDone = false, doneTimer = null, doneHidden = false;
function drawDrawLine() {
  const el = $('sb-drawline'); if (!el) return;
  let icon = 'ℹ️', text = '', act = '', cls = '';
  const missed = fellBack();
  if (!DR.on) text = DR.reason === 'own' ? t('js.storybook-edit.draw.lineOwn') : DR.reason === 'none' ? t('js.storybook-edit.draw.lineNone') : DR.reason === 'resting' ? t('js.storybook-edit.draw.lineResting') : DR.total ? t('js.storybook-edit.draw.lineOff') : '';
  else if (DR.busy) { icon = '🖌️'; cls = 'is-busy'; text = t('js.storybook-edit.draw.lineBusy', { done: DR.done, total: DR.total }); }
  else if (DR.reason === 'limit') text = t('js.storybook-edit.draw.lineLimit', { count: DR.cap });
  else if (DR.reason === 'notset') text = t('js.storybook-edit.draw.lineNotSet');
  else if (missed) { text = t('js.storybook-edit.draw.lineMissed', { count: missed }); act = repaintBtn(); }
  else if (justDone) { icon = '✅'; cls = 'is-done'; text = t('js.storybook-edit.draw.lineDone'); }
  else if (!doneHidden) { icon = '✨'; text = t('js.storybook-edit.draw.lineOn', { count: DR.left }); }
  el.hidden = !text || !B.pages.length;
  el.className = `sb-drawline small${cls ? ` ${cls}` : ''}`;
  el.innerHTML = text ? `${iconHtml(icon, { size: 16 })} <span>${esc(text)}</span>${act}` : '';
}
/** The last picture arrived: "All pictures painted." for a moment, then the line hides. */
function paintedAll() {
  justDone = true; clearTimeout(doneTimer);
  doneTimer = setTimeout(() => { justDone = false; doneHidden = true; drawDrawLine(); }, 4000);
}
/** One picture's state under it (a page or a character's reference picture), and its Redraw button. */
function drawState(d, { target, has }) {
  const out = [];
  if (busy(d)) out.push(`<p class="sb-dstate is-busy">${iconHtml(d.state === 'drawing' ? '🎨' : '⏳', { size: 16 })} ${esc(t(d.state === 'queued' && d.reason === 'google' ? 'js.storybook-edit.draw.waitGoogle' : `js.storybook-edit.draw.${d.state}`))}</p>`);
  else if (d && d.state === 'fallback') out.push(`<p class="sb-dstate">${iconHtml('ℹ️', { size: 16 })} ${esc(t(`js.storybook-edit.draw.why.${d.reason || 'error'}`))}${d.pic ? ` ${esc(t('js.storybook-edit.draw.keptOld'))}` : ''}</p>`);
  else if (d && d.stale) out.push(`<p class="sb-dstate">${iconHtml('ℹ️', { size: 16 })} ${esc(t('js.storybook-edit.draw.stale'))}</p>`);
  // a real fallback (the art-pack drawing is shown): Paint pictures again, right there
  if (DR.on && d && d.state === 'fallback' && !d.pic) out.push(repaintBtn());
  if (DR.on && !busy(d)) out.push(`<button type="button" class="btn btn-sm${d && d.state === 'fallback' && !d.pic ? ' btn-ghost' : ''}" data-act="redraw" data-target="${esc(target)}">${iconHtml('🔁', { size: 16 })} ${esc(t(has ? 'js.storybook-edit.draw.redraw' : 'js.storybook-edit.draw.draw'))}</button>`);
  if (d && d.asked) out.push(`<details class="sb-asked" data-target="${esc(target)}"><summary class="small">${esc(t('js.storybook-edit.draw.asked'))}</summary><p class="small muted">${esc(t('js.storybook-edit.draw.askedNote'))}</p><p class="sb-asked-t small" dir="auto"></p></details>`);
  return out.join('');
}
// What Oomba asked for: the words sent to the picture maker, loaded the first time the teacher opens it
document.addEventListener('toggle', async e => {
  const d = e.target; if (!d.classList || !d.classList.contains('sb-asked') || !d.open || d.dataset.loaded) return;
  d.dataset.loaded = '1';
  const out = d.querySelector('.sb-asked-t');
  try { const r = await api(`/api/library/make/${D.id}/asked?target=${encodeURIComponent(d.dataset.target)}`, { background: true }); out.textContent = r.text; } catch { delete d.dataset.loaded; out.textContent = t('js.storybook-edit.draw.askedFail'); }
}, true);
const pageState = p => (p.upload || !p.pic ? '' : drawState(DR.pages[p.id], { target: `page:${p.id}`, has: !!drawnOf(p) }));
let drawTimer = null;
/** While pictures are being drawn, ask how it is going every few seconds and show each one as it arrives. */
function watchDraws() {
  clearTimeout(drawTimer);
  if (!DR.busy) return;
  drawTimer = setTimeout(async () => {
    try {
      const was = JSON.stringify(DR.pages) + JSON.stringify(DR.cast), wasBusy = DR.busy;
      DR = await api(`/api/library/make/${D.id}/draws`, { background: true });
      if (wasBusy && !DR.busy && !fellBack()) paintedAll();
      if (was !== JSON.stringify(DR.pages) + JSON.stringify(DR.cast)) refreshPictures();
      else drawDrawLine();
    } catch { /* try again on the next tick */ }
    watchDraws();
  }, 2500);
}
/** New pictures or states: the line, the page list, the story map, the open page's picture and state (never the fields
 *  being typed in). Each painted picture replaces its placeholder as it arrives. */
function refreshPictures() {
  drawDrawLine(); drawList(); drawMap();
  const p = cur(); if (!p) return;
  const f = document.querySelector('.sb-fig'); if (f) f.innerHTML = artOf(p, { decorative: false });
  const st = $('sb-dst'); if (st && !st.querySelector('form')) st.innerHTML = pageState(p);
  document.querySelectorAll('[data-sheet]').forEach(el => { const c = B.cast[+el.dataset.sheet]; if (c && !el.querySelector('form')) el.innerHTML = sheetHtml(c); });
}
function sheetHtml(c) {
  const d = DR.cast[c.name];
  const img = d && d.pic ? `<img class="sb-sheet-img" src="/library/made/${esc(D.id)}/pic/${esc(d.pic)}" alt="${esc(t('js.storybook-edit.draw.sheetAlt', { name: c.name }))}" width="72" height="72">` : '';
  return `${img}<div class="sb-sheet-st">${drawState(d, { target: `cast:${c.name}`, has: !!(d && d.pic) })}</div>`;
}
function drawWarnings() {
  const n = num(), w = B.pages.length ? warningsOf(B) : [];
  const box = $('sb-warn');
  if (!w.length) { box.innerHTML = B.pages.length ? `<p class="sb-ok">${iconHtml('✅', { size: 18 })} ${esc(t('js.storybook-edit.allGood'))}</p>` : ''; return; }
  box.innerHTML = `<details class="sb-warnbox"${w.length <= 4 ? ' open' : ''}><summary>${iconHtml('⚠️', { size: 18 })} ${esc(t('js.storybook-edit.warnings', { count: w.length }))} <span class="small muted">${esc(t('js.storybook-edit.warnNote'))}</span></summary><ul>${w.map(x => `<li><button type="button" class="sb-wlink" ${x.page ? `data-jump="${esc(x.page)}"` : ''}>${esc(t(`js.storybook-edit.warn.${x.code}`, { page: x.page ? n.get(x.page) : '', n: (x.choice ?? 0) + 1 }))}</button></li>`).join('')}</ul></details>`;
}
function drawMap() {
  if (!cyoa) return;
  const box = $('sb-map');
  if (!B.pages.length) { box.innerHTML = ''; return; }
  const L = mapLayout(B), NW = 196, NH = 66, GX = 52, GY = 16;
  const pos = new Map(L.nodes.map(x => [x.id, { x: x.col * (NW + GX) + 8, y: x.row * (NH + GY) + 8 }]));
  const W = L.cols * (NW + GX) - GX + 16, H = L.rows * (NH + GY) - GY + 16;
  const edges = L.edges.map(e => {
    const a = pos.get(e.from), b = pos.get(e.to);
    const x1 = a.x + NW, y1 = a.y + NH / 2, x2 = b.x, y2 = b.y + NH / 2;
    const d = x2 > x1 ? `M${x1} ${y1} C${x1 + GX / 2} ${y1} ${x2 - GX / 2} ${y2} ${x2 - 6} ${y2}` : `M${a.x + NW / 2} ${a.y + NH} C${a.x + NW / 2} ${H + 30} ${b.x + NW / 2} ${H + 30} ${b.x + NW / 2} ${b.y + NH + 6}`;
    return `<path d="${d}" class="sb-edge${e.from === sel || e.to === sel ? ' on' : ''}" marker-end="url(#sb-arrow)"/>`;
  }).join('');
  const page = id => B.pages.find(p => p.id === id);
  box.innerHTML = `<div class="sb-map-in" style="width:${W}px;height:${H}px">
    <svg class="sb-edges" width="${W}" height="${H + 40}" aria-hidden="true"><defs><marker id="sb-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="9" markerHeight="9" markerUnits="userSpaceOnUse" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="currentColor"/></marker></defs>${edges}</svg>
    ${L.nodes.map(x => { const p = page(x.id), at = pos.get(x.id); return `<button type="button" class="sb-node${x.end ? ' is-end' : ''}${x.start ? ' is-start' : ''}${x.lost ? ' is-lost' : ''}${x.id === sel ? ' is-sel' : ''}" data-sel="${esc(x.id)}" style="left:${at.x}px;top:${at.y}px;width:${NW}px;height:${NH}px"${x.id === sel ? ' aria-current="true"' : ''}>${p.pic || p.upload ? `<span class="sb-nthumb" aria-hidden="true">${artOf(p)}</span>` : ''}<span class="sb-ntext"><b>${x.n}</b><span dir="auto">${esc(p.title || p.text.slice(0, 40) || t('js.storybook-edit.noWords'))}</span>${x.end ? `<i>${esc(t('js.storybook-edit.end'))}</i>` : x.start ? `<i>${esc(t('js.storybook-edit.start'))}</i>` : ''}</span></button>`; }).join('')}
  </div>`;
}
function drawList() {
  const n = num(), w = warningsOf(B), bad = new Set(w.filter(x => x.page).map(x => x.page));
  const order = cyoa ? [...B.pages].sort((a, b) => n.get(a.id) - n.get(b.id)) : B.pages;
  $('sb-plist').innerHTML = order.map(p => `<li><button type="button" class="sb-pitem${p.id === sel ? ' on' : ''}" data-sel="${esc(p.id)}"${p.id === sel ? ' aria-current="true"' : ''}>
    <span class="sb-pthumb" aria-hidden="true">${artOf(p)}</span><span class="sb-pltext"><b>${n.get(p.id)}</b> <span dir="auto">${esc(p.title || p.text.slice(0, 60) || t('js.storybook-edit.noWords'))}</span></span>
    ${busy(DR.pages[p.id]) && !p.upload ? `<span class="sb-pdraw">${iconHtml('⏳', { size: 16 })}<span class="sr-only">${esc(t('js.storybook-edit.draw.queued'))}</span></span>` : ''}
    ${bad.has(p.id) ? `<span class="sb-pwarn" title="${esc(t('js.storybook-edit.hasWarning'))}">${iconHtml('⚠️', { size: 16 })}<span class="sr-only">${esc(t('js.storybook-edit.hasWarning'))}</span></span>` : ''}</button></li>`).join('');
}
const opt = (v, label, on) => `<option value="${esc(v)}"${on ? ' selected' : ''}>${esc(label)}</option>`;
function drawPage() {
  const p = B.pages.find(x => x.id === sel);
  const box = $('sb-page-body');
  if (!p) { box.innerHTML = ''; $('sb-page-h').textContent = ''; return; }
  const n = num(), L = D.limits;
  $('sb-page-h').textContent = t('js.storybook-edit.pageN', { n: n.get(p.id) });
  const pic = p.pic || { world: '', mood: 'bright', chars: [], props: [] };
  const charRows = (p.pic ? p.pic.chars : []).map((c, i) => `<div class="sb-crow"><label class="sr-only" for="sb-cw${i}">${esc(t('js.storybook-edit.who'))}</label>
      <select class="input" id="sb-cw${i}" data-f="char-name" data-i="${i}">${B.cast.map(x => opt(x.name, x.name, x.name === c.name)).join('')}</select>
      <label class="sr-only" for="sb-cp${i}">${esc(t('js.storybook-edit.spot'))}</label>
      <select class="input" id="sb-cp${i}" data-f="char-pos" data-i="${i}">${POSITIONS.map(x => opt(x, t(`js.storybook-edit.spots.${x}`), x === c.pos)).join('')}</select>
      <button type="button" class="btn btn-sm btn-ghost" data-act="char-rm" data-i="${i}">${esc(t('js.storybook-edit.remove'))}</button></div>`).join('');
  box.innerHTML = `<div class="sb-pedit">
    <div class="sb-pic-col"><figure class="sb-fig">${artOf(p, { decorative: false })}</figure>
      <div class="sb-dst" id="sb-dst">${pageState(p)}</div>
      <div class="sb-picbtns"><button type="button" class="btn btn-sm" data-act="upload">${iconHtml('🖼️', { size: 16 })} ${esc(t('js.storybook-edit.upload'))}</button>
        ${p.upload ? `<button type="button" class="btn btn-sm" data-act="drawn">${iconHtml('🎨', { size: 16 })} ${esc(t('js.storybook-edit.useDrawn'))}</button>` : ''}
        ${p.pic || p.upload ? `<button type="button" class="btn btn-sm btn-ghost" data-act="nopic">${esc(t('js.storybook-edit.removePic'))}</button>` : `<button type="button" class="btn btn-sm" data-act="drawn">${iconHtml('🎨', { size: 16 })} ${esc(t('js.storybook-edit.addDrawn'))}</button>`}</div>
      ${p.pic && !p.upload ? `<fieldset class="sb-picset"><legend>${esc(t('js.storybook-edit.drawn'))}</legend>
        <div class="sb-two"><div class="field"><label for="sb-world">${esc(t('js.storybook-edit.world'))}</label><select class="input" id="sb-world" data-f="world">${D.worlds.map(w => opt(w.id, w.name, w.id === pic.world)).join('')}</select></div>
        <div class="field"><label for="sb-mood">${esc(t('js.storybook-edit.mood'))}</label><select class="input" id="sb-mood" data-f="mood">${MOODS.map(m => opt(m, t(`js.storybook-edit.moods.${m}`), m === pic.mood)).join('')}</select></div></div>
        <p class="sb-lbl">${esc(t('js.storybook-edit.inPicture'))}</p>${charRows || `<p class="small muted">${esc(t('js.storybook-edit.nobody'))}</p>`}
        ${p.pic.chars.length < L.chars && B.cast.length ? `<button type="button" class="btn btn-sm" data-act="char-add">${iconHtml('➕', { size: 16 })} ${esc(t('js.storybook-edit.addChar'))}</button>` : ''}
      </fieldset>` : ''}
      ${p.pic || p.upload ? `<div class="field"><label for="sb-alt">${esc(t('js.storybook-edit.alt'))}</label><span class="hint" id="sb-alt-h">${esc(t('js.storybook-edit.altHint'))}</span><input class="input" id="sb-alt" data-f="alt" maxlength="${L.alt}" value="${esc(p.alt)}" aria-describedby="sb-alt-h" dir="auto"></div>` : ''}
    </div>
    <div class="sb-text-col">
      <div class="field"><label for="sb-ptitle">${esc(t('js.storybook-edit.pageTitle'))}</label><input class="input" id="sb-ptitle" data-f="title" maxlength="${L.pageTitle}" value="${esc(p.title)}" dir="auto"></div>
      <div class="field"><label for="sb-ptext">${esc(t('js.storybook-edit.words'))}</label><textarea class="input" id="sb-ptext" data-f="text" rows="6" maxlength="${L.text}" dir="auto">${esc(p.text)}</textarea></div>
      ${cyoa ? `<div class="sb-cyoa">
        <label class="sb-check"><input type="checkbox" data-f="end"${p.end ? ' checked' : ''}> ${esc(t('js.storybook-edit.isEnding'))}</label>
        ${p.id === B.start ? `<p class="small muted">${iconHtml('🏁', { size: 16 })} ${esc(t('js.storybook-edit.isStart'))}</p>` : `<button type="button" class="btn btn-sm btn-ghost" data-act="start">${iconHtml('🏁', { size: 16 })} ${esc(t('js.storybook-edit.makeStart'))}</button>`}
        ${p.end ? '' : `<fieldset class="sb-choices-e"><legend>${esc(t('js.storybook-edit.choices'))}</legend>
          ${p.choices.map((c, i) => `<div class="sb-chrow"><label class="sr-only" for="sb-ct${i}">${esc(t('js.storybook-edit.choiceN', { n: i + 1 }))}</label>
            <input class="input" id="sb-ct${i}" data-f="choice-text" data-i="${i}" maxlength="${L.choice}" value="${esc(c.text)}" placeholder="${esc(t('js.storybook-edit.choiceN', { n: i + 1 }))}" dir="auto">
            <label class="sr-only" for="sb-cto${i}">${esc(t('js.storybook-edit.leadsTo'))}</label>
            <select class="input" id="sb-cto${i}" data-f="choice-to" data-i="${i}"><option value="">${esc(t('js.storybook-edit.leadsTo'))}</option>${[...B.pages].sort((a, b) => n.get(a.id) - n.get(b.id)).filter(x => x.id !== p.id).map(x => opt(x.id, pageLabel(x, n), x.id === c.to)).join('')}<option value="__new">${esc(t('js.storybook-edit.newPage'))}</option></select>
            <button type="button" class="btn btn-sm btn-ghost" data-act="choice-rm" data-i="${i}">${esc(t('js.storybook-edit.remove'))}</button></div>`).join('')}
          ${p.choices.length < L.choices ? `<button type="button" class="btn btn-sm" data-act="choice-add">${iconHtml('➕', { size: 16 })} ${esc(t('js.storybook-edit.addChoice'))}</button>` : ''}</fieldset>`}
      </div>` : `<div class="sb-move"><button type="button" class="btn btn-sm" data-act="up"${B.pages[0].id === p.id ? ' disabled' : ''}>${esc(t('js.storybook-edit.earlier'))}</button><button type="button" class="btn btn-sm" data-act="down"${B.pages[B.pages.length - 1].id === p.id ? ' disabled' : ''}>${esc(t('js.storybook-edit.later'))}</button></div>`}
      <div class="sb-pfoot"><button type="button" class="btn btn-sm btn-ghost btn-danger" data-act="del-page">${iconHtml('🗑️', { size: 16 })} ${esc(t('js.storybook-edit.deletePage'))}</button></div>
    </div></div>
    <details class="sb-cast"><summary>${esc(t('js.storybook-edit.cast', { count: B.cast.length }))}</summary>
      <p class="small muted">${esc(t('js.storybook-edit.castNote'))}</p>
      ${B.cast.map((c, i) => `<div class="sb-castrow"><div class="sb-crow"><label class="sr-only" for="sb-cn${i}">${esc(t('js.storybook-edit.castName'))}</label><input class="input" id="sb-cn${i}" data-f="cast-name" data-i="${i}" value="${esc(c.name)}" maxlength="${L.castName}" dir="auto">
        <label class="sr-only" for="sb-ca${i}">${esc(t('js.storybook-edit.castArt'))}</label><select class="input" id="sb-ca${i}" data-f="cast-art" data-i="${i}">${D.chars.map(x => opt(x.id, x.name, x.id === c.art)).join('')}</select></div>
        <label class="sr-only" for="sb-cwh${i}">${esc(t('js.storybook-edit.castWhat'))}</label><input class="input sb-look" id="sb-cwh${i}" data-f="cast-what" data-i="${i}" value="${esc(c.what || '')}" maxlength="${L.what}" placeholder="${esc(t('js.storybook-edit.castWhatPh'))}" dir="auto">
        <label class="sr-only" for="sb-cl${i}">${esc(t('js.storybook-edit.draw.look'))}</label><input class="input sb-look" id="sb-cl${i}" data-f="cast-look" data-i="${i}" value="${esc(c.look || '')}" maxlength="${L.look}" placeholder="${esc(t('js.storybook-edit.draw.look'))}" dir="auto">
        ${DR.on || (DR.cast[c.name] && DR.cast[c.name].pic) ? `<div class="sb-charsheet" data-sheet="${i}">${sheetHtml(c)}</div>` : ''}</div>`).join('')}
      ${B.cast.length < L.cast ? `<button type="button" class="btn btn-sm" data-act="cast-add">${iconHtml('➕', { size: 16 })} ${esc(t('js.storybook-edit.addCast'))}</button>` : ''}
    </details>`;
}
const redrawPic = p => { const f = document.querySelector('.sb-fig'); if (f) f.innerHTML = artOf(p, { decorative: false }); drawList(); };

// ---------------------------------------------------------------- editing
const cur = () => B.pages.find(x => x.id === sel);
const newId = () => { let n = B.pages.length + 1; while (B.pages.some(p => p.id === `p${n}`)) n++; return `p${n}`; };
function addPage(after = sel) {
  if (B.pages.length >= D.limits.pages) { toast(t('js.storybook-edit.full', { count: D.limits.pages }), { bad: true }); return null; }
  const near = B.pages.find(p => p.id === after);
  const p = { id: newId(), title: '', text: '', end: false, choices: [], pic: { world: (near && near.pic && near.pic.world) || D.worlds[0].id, mood: 'bright', chars: [], props: [] }, upload: null, alt: '' };
  const i = B.pages.findIndex(x => x.id === after);
  B.pages.splice(i >= 0 ? i + 1 : B.pages.length, 0, p);
  return p;
}
$('sb-title').addEventListener('input', () => { B.title = $('sb-title').value; changed(); });
document.addEventListener('click', async e => {
  const s = e.target.closest('[data-sel],[data-jump]');
  if (s && s.closest('#sb-edit')) { sel = s.dataset.sel || s.dataset.jump; drawMap(); drawList(); drawPage(); if (s.dataset.jump || matchMedia('(max-width: 899px)').matches) $('sb-page').scrollIntoView({ behavior: 'smooth', block: 'start' }); $('sb-page-h').focus({ preventScroll: true }); return; }
  const a = e.target.closest('[data-act]'); if (!a || !a.closest('#sb-page')) return;
  const p = cur(); if (!p) return;
  const i = +a.dataset.i, act = a.dataset.act;
  if (act === 'redraw') { openRedraw(a); return; }
  if (act === 'repaint') return;   // Paint pictures again: its own listener below (it is in the line too)
  if (act === 'redraw-cancel') { refreshPictures(); return; }
  if (act === 'upload') { $('sb-pagepic').click(); return; }
  if (act === 'drawn') { p.upload = null; if (!p.pic) p.pic = { world: D.worlds[0].id, mood: 'bright', chars: [], props: [] }; }
  if (act === 'nopic') { p.upload = null; p.pic = null; }
  if (act === 'char-add') { const free = B.cast.find(c => !p.pic.chars.some(x => x.name === c.name)) || B.cast[0]; p.pic.chars.push({ name: free.name, pos: POSITIONS.find(x => !p.pic.chars.some(c => c.pos === x)) || 'center', flip: false }); }
  if (act === 'char-rm') p.pic.chars.splice(i, 1);
  if (act === 'choice-add') p.choices.push({ text: '', to: '' });
  if (act === 'choice-rm') p.choices.splice(i, 1);
  if (act === 'start') B.start = p.id;
  if (act === 'up' || act === 'down') { const k = B.pages.indexOf(p), j = act === 'up' ? k - 1 : k + 1; if (j < 0 || j >= B.pages.length) return; B.pages.splice(k, 1); B.pages.splice(j, 0, p); }
  if (act === 'cast-add') { let n = B.cast.length + 1; while (B.cast.some(c => c.name === t('js.storybook-edit.castDefault', { n }))) n++; B.cast.push({ name: t('js.storybook-edit.castDefault', { n }), art: D.chars[0].id }); }
  if (act === 'del-page') {
    if (!(await ask({ text: t('js.storybook-edit.deletePageQ'), ok: t('js.storybook-edit.deletePage'), danger: true }))) return;
    B.pages = B.pages.filter(x => x.id !== p.id);
    for (const x of B.pages) x.choices = x.choices.map(c => (c.to === p.id ? { ...c, to: '' } : c));
    if (B.start === p.id) B.start = B.pages[0] ? B.pages[0].id : '';
    sel = null;
    if (!B.pages.length) { addPage(); }
    sel = B.pages[0].id; drawAll(); changed({ now: true }); return;
  }
  drawPage(); changed();
});
// fields: words save as they are typed; picture choices redraw at once
document.addEventListener('input', e => {
  const f = e.target.closest('[data-f]'); if (!f || !f.closest('#sb-page')) return;
  const p = cur(); if (!p) return;
  const i = +f.dataset.i, v = f.type === 'checkbox' ? f.checked : f.value;
  switch (f.dataset.f) {
    case 'title': p.title = v; break;
    case 'text': p.text = v; break;
    case 'alt': p.alt = v; break;
    case 'cast-look': B.cast[i].look = v; break;
    case 'cast-what': B.cast[i].what = v; break;
    case 'choice-text': p.choices[i].text = v; break;
    case 'cast-name': { const old = B.cast[i].name, nv = v.trim(); if (!nv || B.cast.some((c, k) => k !== i && c.name.toLowerCase() === nv.toLowerCase())) return; B.cast[i].name = nv; for (const pg of B.pages) if (pg.pic) for (const c of pg.pic.chars) if (c.name === old) c.name = nv; break; }
    default: return;
  }
  changed();
});
document.addEventListener('change', e => {
  const f = e.target.closest('[data-f]'); if (!f || !f.closest('#sb-page')) return;
  const p = cur(); if (!p) return;
  const i = +f.dataset.i, v = f.type === 'checkbox' ? f.checked : f.value;
  switch (f.dataset.f) {
    case 'world': p.pic.world = v; p.pic.props = []; redrawPic(p); break;
    case 'mood': p.pic.mood = v; redrawPic(p); break;
    case 'char-name': p.pic.chars[i].name = v; redrawPic(p); break;
    case 'char-pos': { const other = p.pic.chars.find((c, k) => k !== i && c.pos === v); if (other) other.pos = p.pic.chars[i].pos; p.pic.chars[i].pos = v; drawPage(); break; }
    case 'end': p.end = v; if (v) p.choices = []; drawPage(); break;
    case 'choice-to': if (v === '__new') { const np = addPage(); if (!np) { f.value = p.choices[i].to; return; } p.choices[i].to = np.id; drawPage(); } else p.choices[i].to = v; break;
    case 'cast-art': B.cast[i].art = v; drawPage(); break;
    default: return;
  }
  changed();
});
$('sb-pagepic').addEventListener('change', async () => {
  const f = $('sb-pagepic').files[0]; $('sb-pagepic').value = ''; if (!f) return;
  const p = cur(); if (!p) return;
  status(t('js.storybook-edit.checkingPic'));
  try {
    const pic = await uploadPic(f, `/api/library/make/${D.id}/pic`, { failText: t('js.storybook-edit.picFailed') });
    uploads.push(pic); p.upload = pic.id; drawPage(); changed({ now: true });
  } catch (e) { status(''); toast(e.message, { bad: true }); }
});
// Redraw: an optional note ("make it sunnier"), then the picture goes back in the queue.
function openRedraw(btn) {
  const box = btn.parentElement, target = btn.dataset.target;
  box.innerHTML = `<form class="sb-redraw" data-target="${esc(target)}"><label for="sb-rnote">${esc(t('js.storybook-edit.draw.note'))}</label>
    <input class="input" id="sb-rnote" name="note" maxlength="200" placeholder="${esc(t('js.storybook-edit.draw.notePh'))}" dir="auto">
    <div class="row"><button class="btn btn-sm btn-primary" type="submit">${iconHtml('🔁', { size: 16 })} ${esc(t('js.storybook-edit.draw.redraw'))}</button><button class="btn btn-sm btn-ghost" type="button" data-act="redraw-cancel">${esc(t('js.storybook-edit.draw.cancel'))}</button></div></form>`;
  box.querySelector('input').focus();
}
document.addEventListener('submit', async e => {
  const f = e.target.closest('.sb-redraw'); if (!f) return;
  e.preventDefault();
  const btn = f.querySelector('[type=submit]'); btn.disabled = true;
  try {
    clearTimeout(timer); await save();   // a character's new look is saved before it is drawn
    const r = await api(`/api/library/make/${D.id}/draw`, { method: 'POST', body: { target: f.dataset.target, note: f.note.value } });
    DR = r.draws; refreshPictures(); watchDraws();
  } catch (er) { btn.disabled = false; toast(er.message, { bad: true }); }
});
$('sb-add').addEventListener('click', () => { const p = addPage(); if (!p) return; sel = p.id; drawAll(); changed(); $('sb-page-h').focus(); });

// ---------------------------------------------------------------- share, delete
$('sb-share')?.addEventListener('click', () => {
  if (!D.classes.length) { toast(t('js.storybook-edit.noClasses'), { bad: true }); return; }
  const s = sheet({ title: `📌 ${t('js.storybook-edit.shareTitle')}`, content: `<p class="muted">${esc(t('js.storybook-edit.shareLead'))}</p>
    <form id="sb-shareform" class="sb-shareform"><fieldset><legend class="sr-only">${esc(t('js.storybook-edit.shareTitle'))}</legend>${D.classes.map(c => `<label class="sb-check"><input type="checkbox" name="c" value="${esc(c.id)}"${shared.includes(c.id) ? ' checked' : ''}> <span dir="auto">${esc(c.name)}</span></label>`).join('')}</fieldset>
    <p class="small muted">${esc(t('js.storybook-edit.shareNote'))}</p><div class="row"><button class="btn btn-primary" type="submit">${esc(t('js.storybook-edit.shareSave'))}</button></div></form>` });
  s.el.querySelector('#sb-shareform').addEventListener('submit', async e => {
    e.preventDefault();
    try {
      clearTimeout(timer); await save();
      const r = await api(`/api/library/make/${D.id}/share`, { method: 'POST', body: { classIds: [...s.el.querySelectorAll('input[name=c]:checked')].map(x => x.value) } });
      shared = r.shared; s.close(); toast(r.toast);
    } catch (er) { toast(er.message, { bad: true }); }
  });
});
$('sb-delete').addEventListener('click', async () => {
  closeMenu();
  if (!(await ask({ title: t('js.storybook-edit.deleteQ'), text: t('js.storybook-edit.deleteText'), ok: t('js.storybook-edit.deleteOk'), danger: true }))) return;
  try { const r = await api(`/api/library/make/${D.id}/delete`, { method: 'POST' }); location.href = r.redirect; } catch (e) { toast(e.message, { bad: true }); }
});
// The less-used actions (the More menu, as on the cards): Paint pictures again, Duplicate, and Try again for a book
// whose first draft never came.
const closeMenu = () => { const m = document.querySelector('.sb-emore'); if (m) m.open = false; };
async function repaintAll(btn) {
  closeMenu();
  if (btn) btn.disabled = true;
  try { const r = await api(`/api/library/make/${D.id}/repaint`, { method: 'POST' }); DR = r.draws; justDone = false; doneHidden = false; refreshPictures(); watchDraws(); toast(r.toast); } catch (e) { if (btn && btn.isConnected) btn.disabled = false; toast(e.message, { bad: true }); }
}
if ($('sb-repaint')) $('sb-repaint').addEventListener('click', () => repaintAll());
// Paint all pictures again: every picture of the book, painted ones too (each one is one of today's pictures)
if ($('sb-repaint-all')) $('sb-repaint-all').addEventListener('click', async () => {
  closeMenu();
  if (!(await ask({ text: t('js.storybook-edit.draw.repaintAllQ'), ok: t('js.storybook-edit.draw.repaintAll') }))) return;
  try { clearTimeout(timer); await save(); const r = await api(`/api/library/make/${D.id}/repaint`, { method: 'POST', body: { all: true } }); DR = r.draws; justDone = false; doneHidden = false; refreshPictures(); watchDraws(); toast(r.toast); } catch (e) { toast(e.message, { bad: true }); }
});
document.addEventListener('click', e => { const b = e.target.closest('#sb-edit [data-act="repaint"]'); if (b) repaintAll(b); });
$('sb-duplicate').addEventListener('click', async () => {
  closeMenu();
  try { clearTimeout(timer); await save(); const r = await api(`/api/library/make/${D.id}/duplicate`, { method: 'POST' }); toast(r.toast); setTimeout(() => { location.href = r.href; }, 700); } catch (e) { toast(e.message, { bad: true }); }
});
$('sb-retry').addEventListener('click', async () => {
  $('sb-retry').disabled = true;
  try { await api(`/api/library/make/${D.id}/retry`, { method: 'POST' }); state = 'writing'; drawAll(); } catch (e) { $('sb-retry').disabled = false; toast(e.message, { bad: true }); }
});
$('sb-preview').addEventListener('click', async e => { if (timer) { e.preventDefault(); clearTimeout(timer); await save(); location.href = $('sb-preview').href; } });

// ---------------------------------------------------------------- Oomba's chat
let left = D.left;
function setLeft(n) { if (typeof n === 'number') left = n; if (document.body.dataset.oc) return; const sub = document.querySelector('#oc .oc-sub'); if (sub) sub.textContent = t('js.storybook-edit.chatSub', { count: left }); }
const FAILS = ['timeout', 'busy', 'resting', 'restart', 'error', 'names', 'words', 'personal', 'notFound'];
// One chat only (docs/decisions.md "The book maker in the Oomba chat"): with the companion on this page, the book is its
// page (type 'book'): its changes come back as the companion's turns, and this page reloads the book after each one.
const COMPANION = !!document.body.dataset.oc;
if (COMPANION) {
  const mine = x => x && x.change && x.change.kind === 'book' && x.change.bookId === D.id;
  BUS.setPage({
    page: () => ({ type: 'book', bookId: D.id }),
    label: () => B.title || document.title.split('·')[0].trim(),
    ready: () => true,
    // The book shows first: the chat waits as the bubble (the owner, 24 Nov 2026: "When you press open the book it
    // should go to the book and close the chat"). A tap on the bubble brings it back.
    start: () => 'min',
    hello: () => t('js.storybook-edit.hello'),
    placeholder: () => t('js.storybook-edit.placeholder'),
    onAnswer: x => { if (mine(x) || (x.note && x.note.bookRef && x.note.bookRef.id === D.id)) reload().catch(() => {}); },
    onUndo: () => { reload().catch(() => {}); },
  });
}
const chat = COMPANION ? null : mountChat({
  id: `storybook:${D.id}`, url: () => `/api/library/make/${D.id}/chat`, alwaysBubble: true,
  sub: t('js.storybook-edit.chatSub', { count: left }), privacy: t('js.storybook-edit.chatPrivate'), leave: t('js.storybook-edit.leave'),
  hello: () => t('js.storybook-edit.hello'),
  ideas: () => (B.pages.length ? IDEAS() : []), ideasAfter: () => IDEAS().slice(0, 2),
  placeholder: () => t('js.storybook-edit.placeholder'),
  stepText: (k, state) => t(`js.storybook-edit.step.${k}.${state === 'done' ? 'done' : 'now'}`),
  failText: x => (x.failed === 'unsafe' ? t('js.storybook-edit.fail.unsafe') : t(`js.oomba-chat.fail.${FAILS.includes(x.failed) ? x.failed : 'error'}`)),
  errText: code => (code === 'cap' ? t('js.storybook-edit.cap') : null),
  change: x => {
    const c = x.change, parts = [];
    if (c.first) parts.push(cyoa ? t('js.storybook-edit.ch.firstCyoa', { pages: c.pages, endings: c.endings }) : t('js.storybook-edit.ch.first', { pages: c.pages }));
    if (c.added && c.added.length) parts.push(t('js.storybook-edit.ch.added', { pages: c.added.join(', ') }));
    if (c.changed && c.changed.length) parts.push(t('js.storybook-edit.ch.changed', { pages: c.changed.join(', ') }));
    if (c.removed) parts.push(t('js.storybook-edit.ch.removed', { count: c.removed }));
    if (c.kept) parts.push(t('js.storybook-edit.ch.kept', { count: c.kept }));
    if (c.repaired) parts.push(t('js.storybook-edit.ch.repaired'));
    if (!parts.length) parts.push(t('js.storybook-edit.ch.none'));
    // Pictures that could not be redrawn today: said first and plainly, so the change never reads as if they were.
    const warn = c.noPics ? `<p class="oc-bnote warn oc-ch-warn" role="status">${iconHtml('⚠️', { size: 16 })} ${esc(t('js.storybook-edit.ch.noPics', { count: c.noPics }))}</p>` : '';
    return `${warn}<p class="oc-ch-h"><b>${esc(t('js.storybook-edit.ch.title'))}</b></p><ul class="oc-ch-list">${parts.map(s => `<li>${esc(s)}</li>`).join('')}</ul>`;
  },
  onAnswer: () => { reload().catch(() => {}); },
  onUndo: () => { reload().catch(() => {}); },
  onSync: () => setLeft(),
  start: 'open',
});
const IDEAS = () => {
  const list = cyoa ? ['scarier', 'ending', 'simpler'] : ['simpler', 'longer', 'title'];
  return list.map(k => ({ label: t(`js.storybook-edit.ideas.${k}`), text: t(`js.storybook-edit.ideas.${k}Text`) }));
};
// Oomba is writing the first draft: look again until it is there (the chat polls its own job too).
if (!B.pages.length) { const iv = setInterval(async () => { await reload().catch(() => {}); if (B.pages.length) clearInterval(iv); }, 3000); }
drawAll();
watchDraws();
void chat;
