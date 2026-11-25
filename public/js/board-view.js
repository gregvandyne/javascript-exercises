// The view of a big board panned and zoomed like a whiteboard, shared by the Manipulatives live room
// (public/js/manip-room.js) and Homeroom (public/js/homeroom.js): the zoom math, Fit, the world's transform, the zoom pill
// (− 50% + ⤢ Fit) and the minimap (every area as a small rectangle and the part on screen; a tap there moves the view).
// A view is { x, y, z }: the board's top-left corner on the screen and its scale. Moved here from manip-room.js unchanged.
import { esc } from '/js/app.js';

export const clamp = (v, lo, hi) => Math.min(Math.max(lo, v), Math.max(lo, hi));
const btn = (cls, attrs, label) => `<button type="button" class="${cls}" ${attrs}>${label}</button>`;

/** The view zoomed by f around a screen point (sx, sy) of the board's box, the scale kept within zMin..zMax. */
export function zoomAround(view, f, sx, sy, zMin, zMax) {
  const z = clamp(view.z * f, zMin, zMax), k = z / view.z;
  return { x: sx - (sx - view.x) * k, y: sy - (sy - view.y) * k, z };
}
/** The view that shows a board rectangle as big as fits in box ({ left, top, w, h }: the free part of the screen),
 *  pad pixels around it, the scale within zMin..zMax. */
export function fitView(rect, box, { pad = 24, zMin, zMax }) {
  const z = clamp(Math.min(box.w / (rect.w + pad * 2), box.h / (rect.h + pad * 2)), zMin, zMax);
  return { z, x: box.left + (box.w - rect.w * z) / 2 - rect.x * z, y: box.top + (box.h - rect.h * z) / 2 - rect.y * z };
}
/** Put the view on the world element (--iz: how much to grow things that stay readable when zoomed out). */
export function applyTransform(el, view) {
  el.style.transform = `translate(${view.x}px,${view.y}px) scale(${view.z})`; el.style.setProperty('--iz', String(Math.min(2.5, 1 / view.z)));
}
/** The board rectangle on screen for a view and the box's size. */
export const visible = (view, size) => ({ x: -view.x / view.z, y: -view.y / view.z, w: size.w / view.z, h: size.h / view.z });
/**
 * The minimap: world { w, h }, items [{ rect, cls, c }] (c: its color), the view and the box's size, width in pixels,
 * label (what it is for a screen reader).
 */
export function miniHtml({ world, items, view, size, width, label }) {
  const k = width / world.w;
  const r = (a, cls, style = '') => `<i class="${cls}" style="left:${a.x * k}px;top:${a.y * k}px;width:${Math.max(2, a.w * k)}px;height:${Math.max(2, a.h * k)}px;${style}"></i>`;
  const v = visible(view, size), vx = clamp(v.x, 0, world.w), vy = clamp(v.y, 0, world.h);
  return `<div class="rm-mini" role="button" tabindex="0" aria-label="${esc(label)}" style="width:${width + 16}px;height:${world.h * k + 16}px"><div class="rm-mini-in">
    ${items.map(a => r(a.rect, a.cls, `--c:${a.c}`)).join('')}
    ${r({ x: vx, y: vy, w: Math.min(v.w, world.w - vx), h: Math.min(v.h, world.h - vy) }, 'view')}</div></div>`;
}
/** The board point under a pointer event on the minimap (inside its .rm-mini). */
export function miniPoint(e, world) {
  const box = e.target.closest('.rm-mini').querySelector('.rm-mini-in').getBoundingClientRect(), k = box.width / world.w;
  return { x: (e.clientX - box.left) / k, y: (e.clientY - box.top) / k };
}
/** The zoom pill: − 50% + ⤢ Fit, each a button with data-<attr> (zout, zin, fit). labels: { zoom, zoomOut, zoomIn, fit } */
export function zoomPillHtml({ z, attr, labels, cls = '' }) {
  return `<div class="rm-zoom ${cls}" role="group" aria-label="${esc(labels.zoom)}">${btn('chip', `${attr}="zout" aria-label="${esc(labels.zoomOut)}"`, '−')}<span class="rm-pct">${Math.round(z * 100)}%</span>${btn('chip', `${attr}="zin" aria-label="${esc(labels.zoomIn)}"`, '+')}${btn('chip', `${attr}="fit"`, `⤢ ${esc(labels.fit)}`)}</div>`;
}
