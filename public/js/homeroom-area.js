// Homeroom's teacher's area drawn read-only, as students and the projector see it (docs/decisions.md "Homeroom, step
// 1b"): its sticky notes, text, pen marks and shapes at the board's own size (homeroom-seats.js AREA), drawn by the
// same functions as the teacher's board (public/js/board-shapes.js), scaled to fit the box it sits in.
// The teacher draws it on the board (public/js/homeroom.js); this only shows it.
import { t, esc } from '/js/app.js';
import { drawingsSvg, noteHtml, textHtml, splitObjects } from '/js/board-shapes.js';
import { AREA, frameOf } from '/js/homeroom-seats.js';

// The area may be resized by the teacher (homeroom-seats.js frameOf), and objects may sit anywhere on the board; only
// the ones in the area (board-shapes.js splitObjects) are drawn here, clipped to it.
const inside = area => splitObjects(area, AREA, frameOf(area)).inside;
/** Is there anything in the area? */
export const hasContent = area => { const a = inside(area); return !!(a.notes.length || a.texts.length || a.strokes.length || a.shapes.length); };

/** The area, read-only, inside a box that scales it to fit (fitAreas() sets the scale). mode 'width': as wide as its
 *  box (its height follows); 'contain': as big as fits in its box. */
export function areaHtml(area, { mode = 'width', label = true } = {}) {
  const fr = frameOf(area), a = inside(area), shapes = a.shapes;
  // the same drawing as the teacher's board (public/js/board-shapes.js), without anything to press
  const notes = (a.notes || []).map(n => noteHtml(n, { ro: true })).join('');
  const texts = (a.texts || []).map(x => textHtml(x, { ro: true })).join('');
  const empty = hasContent(area) ? '' : `<p class="hr-roempty">${esc(t('js.homeroom-area.empty'))}</p>`;
  // (the objects in the default area's units, from its top left: placed where that is inside the frame)
  return `<div class="hr-fit ${mode === 'contain' ? 'contain' : ''}" data-fit="${mode}" data-w="${fr.w}" data-h="${fr.h}"><div class="hr-fitin" style="width:${fr.w}px;height:${fr.h}px">
    <section class="rm-area teach hr-area hr-roarea" style="left:0;top:0;width:${fr.w}px;height:${fr.h}px" aria-label="${esc(t('js.homeroom-area.label'))}">
      ${label ? `<header class="rm-label">✦ ${esc(t('js.homeroom-area.label'))}</header>` : ''}
      <div class="rm-in hr-areain"><div class="hr-roobjs" style="left:${AREA.x - fr.x}px;top:${AREA.y - fr.y}px;width:${AREA.w}px;height:${AREA.h}px"><svg class="hr-shapes hr-draw" viewBox="0 0 ${AREA.w} ${AREA.h}" aria-hidden="true">${drawingsSvg(shapes, a.strokes, AREA.w, AREA.h)}</svg>
        <div class="mp-texts">${texts}</div><div class="mp-notes">${notes}</div></div>${empty}</div></section></div></div>`;
}
/** Scale every area box inside root to its space (after a render and on resize). */
export function fitAreas(root = document) {
  for (const box of root.querySelectorAll('.hr-fit')) {
    const inner = box.firstElementChild; if (!inner) continue;
    const w = box.clientWidth; if (!w) continue;
    const fw = +box.dataset.w || AREA.w, fh = +box.dataset.h || AREA.h;
    const k = box.dataset.fit === 'contain' ? Math.min(w / fw, (box.clientHeight || 1) / fh) : w / fw;
    inner.style.transform = `scale(${k})`;
    if (box.dataset.fit === 'contain') { inner.style.left = `${(w - fw * k) / 2}px`; inner.style.top = `${(box.clientHeight - fh * k) / 2}px`; }
    else box.style.height = `${Math.ceil(fh * k)}px`;
  }
}
