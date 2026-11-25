// Homeroom's teacher's area drawn read-only, as students and the projector see it (docs/decisions.md "Homeroom, step
// 1b"): its sticky notes, text, pen marks and shapes at the board's own size (homeroom-seats.js AREA), scaled to fit
// the box it sits in. The teacher draws it on the board (public/js/homeroom.js); this only shows it.
import { t, esc } from '/js/app.js';
import { inkLine, textBoxHtml } from '/js/board-ann.js';
import { AREA } from '/js/homeroom-seats.js';

/** A shape (rectangle, circle, line) in the area's pixels. */
export function shapeSvg(s, extra = '') {
  const x1 = s.x * AREA.w, y1 = s.y * AREA.h, x2 = s.x2 * AREA.w, y2 = s.y2 * AREA.h;
  const attrs = `stroke="${esc(s.c)}" stroke-width="5" fill="none" stroke-linecap="round"${extra}`;
  if (s.k === 'line') return `<line ${attrs} x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`;
  const x = Math.min(x1, x2), y = Math.min(y1, y2), w = Math.abs(x2 - x1), h = Math.abs(y2 - y1);
  if (s.k === 'circle') return `<ellipse ${attrs} cx="${x + w / 2}" cy="${y + h / 2}" rx="${w / 2}" ry="${h / 2}"/>`;
  return `<rect ${attrs} x="${x}" y="${y}" width="${w}" height="${h}" rx="6"/>`;
}
/** Is there anything in the area? */
export const hasContent = area => { const a = (area && area.__ann) || {}; return !!((a.notes || []).length || (a.texts || []).length || (a.strokes || []).length || ((area && area.shapes) || []).length); };

/** The area, read-only, inside a box that scales it to fit (fitAreas() sets the scale). mode 'width': as wide as its
 *  box (its height follows); 'contain': as big as fits in its box. */
export function areaHtml(area, { mode = 'width', label = true } = {}) {
  const a = (area && area.__ann) || {}, shapes = (area && area.shapes) || [];
  const notes = (a.notes || []).map(n => `<div class="mp-sticky hr-rosticky" style="left:${(+n.x || 0) * 100}%;top:${(+n.y || 0) * 100}%${Number.isFinite(+n.w) && Number.isFinite(+n.h) ? `;width:${+n.w}px;min-height:${+n.h}px;max-width:none` : ''}"><p dir="auto">${esc(n.text)}</p></div>`).join('');
  const texts = (a.texts || []).map(x => textBoxHtml(x, { editing: false, ro: true })).join('');
  const empty = hasContent(area) ? '' : `<p class="hr-roempty">${esc(t('js.homeroom-area.empty'))}</p>`;
  return `<div class="hr-fit ${mode === 'contain' ? 'contain' : ''}" data-fit="${mode}"><div class="hr-fitin" style="width:${AREA.w}px;height:${AREA.h}px">
    <section class="rm-area teach hr-area hr-roarea" style="left:0;top:0;width:${AREA.w}px;height:${AREA.h}px" aria-label="${esc(t('js.homeroom-area.label'))}">
      ${label ? `<header class="rm-label">✦ ${esc(t('js.homeroom-area.label'))}</header>` : ''}
      <div class="rm-in hr-areain"><svg class="mp-ink" viewBox="0 0 ${AREA.w} ${AREA.h}" aria-hidden="true">${(a.strokes || []).map(s => inkLine(s, AREA.w, AREA.h)).join('')}</svg>
        <svg class="hr-shapes" viewBox="0 0 ${AREA.w} ${AREA.h}" aria-hidden="true">${shapes.map(s => shapeSvg(s)).join('')}</svg>
        <div class="mp-texts">${texts}</div><div class="mp-notes">${notes}</div>${empty}</div></section></div></div>`;
}
/** Scale every area box inside root to its space (after a render and on resize). */
export function fitAreas(root = document) {
  for (const box of root.querySelectorAll('.hr-fit')) {
    const inner = box.firstElementChild; if (!inner) continue;
    const w = box.clientWidth; if (!w) continue;
    const k = box.dataset.fit === 'contain' ? Math.min(w / AREA.w, (box.clientHeight || 1) / AREA.h) : w / AREA.w;
    inner.style.transform = `scale(${k})`;
    if (box.dataset.fit === 'contain') { inner.style.left = `${(w - AREA.w * k) / 2}px`; inner.style.top = `${(box.clientHeight - AREA.h * k) / 2}px`; }
    else box.style.height = `${Math.ceil(AREA.h * k)}px`;
  }
}
