// A course step (server/views/courses.js stepPage): the slides one at a time (Next / Back, dots, swipe, arrow keys,
// read-aloud with the site's AI voice, else the device's English voice), then the quick check one question at a time, graded by the server.
// Without this script the page still works: the slides are a scrolling page and the check is a plain form.
import { api, pageData, $, $$, t, toast } from '/js/app.js';
import { deviceSpeak, stopReading } from '/js/tts.js';

const d = pageData();
const base = `/api/courses/${d.course}/${d.step}`;
const deck = $('#deck'), nav = $('#deck-nav'), check = $('#check');
const slides = $$('.slide', deck);
let at = 0;

// ---------------------------------------------------------------------------------------------- read-aloud
// The site's AI voice first (POST /api/tts ctx 'course': the server reads the slide itself, with the voice of the step's
// game character); the shared device voice (public/js/tts.js) when AI voices are off, the player is signed out, or it
// does not come. This page never calls the device speech API itself: one voice pick, in the shared path.
let speaking = null, audio = null, ticket = 0;
function stopSpeaking() {
  ticket++;
  if (audio) { audio.pause(); audio = null; }
  stopReading();
  if (speaking) { speaking.querySelector('.lbl').textContent = t('js.course.listen'); speaking.setAttribute('aria-pressed', 'false'); speaking = null; }
}
function deviceVoice(btn, text) {
  if (!deviceSpeak(text, 'en-US', () => { if (speaking === btn) stopSpeaking(); })) stopSpeaking();
}
async function speak(btn, i, text) {
  if (speaking === btn) return stopSpeaking();
  stopSpeaking();
  const mine = ++ticket;
  speaking = btn; btn.setAttribute('aria-pressed', 'true'); btn.querySelector('.lbl').textContent = t('js.course.stop');
  try {
    const r = await fetch('/api/tts', { method: 'POST', headers: { 'content-type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify({ ctx: 'course', course: d.course, step: d.step, i }) });
    if (mine !== ticket) return;
    if (r.ok) {
      const { u } = await r.json();
      if (mine !== ticket) return;
      audio = new Audio(u);
      audio.onended = () => { if (speaking === btn) stopSpeaking(); };
      audio.onerror = () => { if (mine === ticket) { audio = null; deviceVoice(btn, text); } };
      await audio.play();
      return;
    }
  } catch (e) { if (mine !== ticket) return; }
  if (mine === ticket) deviceVoice(btn, text);
}
slides.forEach((s, i) => {
  const b = s.querySelector('[data-say-btn]'); if (!b) return;
  b.hidden = false; b.setAttribute('aria-pressed', 'false');
  b.addEventListener('click', () => speak(b, i, s.dataset.say));
});

// ---------------------------------------------------------------------------------------------- guided focus
// A slide picture with focus steps plays a short tour once per view: the clean picture first (~1s), then each
// step's box, dotted path and cue in order (~1.9s each), then the clean picture again — and only then does
// the figure's Replay button appear (scrolling away mid-tour ends the tour the same way). An
// IntersectionObserver starts it when the figure scrolls (or pages, in the deck above) into view and
// resets it when it leaves, so the same code serves the paged deck and the plain scrolling page. Reduced
// motion: no tour at all — the CSS static mode shows every step's box with its badge and the cues as a
// list under the picture.
//
// Where the words go (views/courses.js gfLayer): a drawn diagram's cue is always the caption strip under the
// picture, never on it. A screenshot's cue is a chip on the picture, parked clear of the step's ring, its
// badge and the zoom button; when some step of the figure has no clear spot, the whole figure's cues go to
// the strip instead (.gf--strip). On a diagram the script also grows each box to hold every label its ring
// would touch (so no box edge ever sits on text: "5/8" never reads "/8") and parks each badge at the first
// corner outside the ring that is clear of every label.
const gfTimers = new WeakMap();
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
function gfStop(fig) {
  for (const id of gfTimers.get(fig) || []) clearTimeout(id);
  gfTimers.delete(fig);
  fig.removeAttribute('data-gf-step');
}
function gfFinish(fig) {
  gfStop(fig);
  const btn = fig.querySelector('.gf-replay');
  if (btn) btn.hidden = false;
}
function gfPlay(fig) {
  gfStop(fig);
  gfLayout(fig);
  const btn = fig.querySelector('.gf-replay');
  if (btn) btn.hidden = true;
  const n = fig.querySelectorAll('.gf-step').length;
  if (!n) return;
  const ids = [];
  let at = 1000;
  for (let i = 0; i < n; i++) { ids.push(setTimeout(() => fig.setAttribute('data-gf-step', String(i)), at)); at += 1900; }
  ids.push(setTimeout(() => gfFinish(fig), at));
  gfTimers.set(fig, ids);
}
const gfFigs = $$('.smedia.gf');
const rectOf = el => { const r = el.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom }; };
const grow = (r, d) => ({ left: r.left - d, top: r.top - d, right: r.right + d, bottom: r.bottom + d });
const area = (a, b) => Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
/** The ring's outset in px (the box's ::after inset, negative) plus its border. */
function ringOut(box) {
  const cs = getComputedStyle(box, '::after');
  return (Math.abs(parseFloat(cs.top)) || 0) + 0.5;
}

// --- diagrams: boxes off the text, badges off the text
/** Grow each box of a diagram so that no label is cut by its edge or by its ring. Works in the drawing's own
 *  units (the SVG viewBox), so the result is the same at every size: done once per figure. A label is held
 *  whole when it comes within RING units of the box — the ring's reach on the narrowest phone frame (~1.7
 *  units: 5.5px of outset and border at ~3.3px a unit) — and the box keeps PAD units of room around it. */
function gfFitVf(fig) {
  if (fig.dataset.gfFit) return;
  const svg = fig.querySelector('.vf-svg');
  if (!svg || !svg.getBoundingClientRect().width) return;
  const vb = svg.viewBox.baseVal, RING = 1.9, PAD = 0.7;
  const texts = [];
  for (const t of svg.querySelectorAll('text')) {
    try { const b = t.getBBox(); if (b.width > 0) texts.push({ l: b.x, t: b.y, r: b.x + b.width, b: b.y + b.height }); } catch (e) { /* not rendered */ }
  }
  const hit = (a, b) => a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b;
  for (const box of fig.querySelectorAll('.gf-box')) {
    let r = { l: vb.x + parseFloat(box.style.left) / 100 * vb.width, t: vb.y + parseFloat(box.style.top) / 100 * vb.height };
    r.r = r.l + parseFloat(box.style.width) / 100 * vb.width; r.b = r.t + parseFloat(box.style.height) / 100 * vb.height;
    const w0 = r.r - r.l, h0 = r.b - r.t;
    for (let pass = 0; pass < 8; pass++) {
      let changed = false;
      for (const x of texts) {
        const reach = { l: r.l - RING, t: r.t - RING, r: r.r + RING, b: r.b + RING };
        if (!hit(reach, x)) continue;
        const grown = { l: Math.min(r.l, x.l - PAD), t: Math.min(r.t, x.t - PAD), r: Math.max(r.r, x.r + PAD), b: Math.max(r.b, x.b + PAD) };
        const cx = (x.l + x.r) / 2, cy = (x.t + x.b) / 2;
        let want = grown;
        // A label whose middle is outside the box (the bar's title just above it, a neighbour's number) is
        // left out: the box's edge on that side pulls back until its ring clears the label — as long as the
        // box keeps at least half its size that way. A label whose middle is inside is taken in whole.
        if (!(cx > r.l && cx < r.r && cy > r.t && cy < r.b)) {
          const cuts = [];
          if (cy <= r.t) cuts.push({ ...r, t: x.b + RING });
          if (cy >= r.b) cuts.push({ ...r, b: x.t - RING });
          if (cx <= r.l) cuts.push({ ...r, l: x.r + RING });
          if (cx >= r.r) cuts.push({ ...r, r: x.l - RING });
          const ok = cuts.filter(c => c.r - c.l >= w0 / 2 && c.b - c.t >= h0 / 2).sort((a, b) => (b.r - b.l) * (b.b - b.t) - (a.r - a.l) * (a.b - a.t));
          if (ok.length) want = ok[0];
        }
        if (Math.abs(want.l - r.l) + Math.abs(want.t - r.t) + Math.abs(want.r - r.r) + Math.abs(want.b - r.b) > 1e-6) { r = want; changed = true; }
      }
      if (!changed) break;
    }
    r = { l: Math.max(vb.x, r.l), t: Math.max(vb.y, r.t), r: Math.min(vb.x + vb.width, r.r), b: Math.min(vb.y + vb.height, r.b) };
    const pct = v => Math.round(v * 100) / 100;
    const x = pct((r.l - vb.x) / vb.width * 100), y = pct((r.t - vb.y) / vb.height * 100);
    box.style.left = x + '%'; box.style.top = y + '%';
    box.style.width = pct((r.r - r.l) / vb.width * 100) + '%'; box.style.height = pct((r.b - r.t) / vb.height * 100) + '%';
    box.style.setProperty('--bx', x); box.style.setProperty('--by', y);
  }
  fig.dataset.gfFit = '1';
}
/** Park each diagram badge at the first spot outside its ring that is inside the frame and clear of every
 *  label (and of the ring). No clear spot: the badge stays off (the strip carries the step's number). In the
 *  static mode (reduced motion), where every box and badge shows at once, a badge must show: it takes the spot
 *  that covers the least, where a label counts far more than a ring (a badge may sit on the box's own corner,
 *  never on the words), and the badges already placed count like labels, so two badges never stack. */
function gfBadgesVf(fig) {
  const frame = fig.querySelector('.sframe');
  // The still view keeps badges off the frame's rounded corners (they would be clipped): an inset frame.
  const fr = reduced ? grow(rectOf(frame), -8) : rectOf(frame);
  const texts = [...fig.querySelectorAll('.vf-svg text')].map(t => grow(rectOf(t), 1));
  const placed = [];
  for (const box of fig.querySelectorAll('.gf-box')) {
    const badge = box.querySelector('.gf-badge');
    if (!badge) continue;
    badge.classList.remove('gf-badge--at', 'gf-badge--off');
    const d = badge.offsetWidth || 20, o = ringOut(box) + 2;
    const b = rectOf(box), w = b.right - b.left, h = b.bottom - b.top;
    const ring = grow(b, o);
    const spots = [[-o - d, -o - d], [w + o, -o - d], [-o - d, h + o], [w + o, h + o], [0, -o - d], [w - d, -o - d], [0, h + o], [w - d, h + o],
      [-o - d, (h - d) / 2], [w + o, (h - d) / 2], [(w - d) / 2, -o - d], [(w - d) / 2, h + o]];
    // The static mode's last resorts: astride the box's edges and corners, then its own inside corners (on the
    // shape, off its words).
    if (reduced) {
      const m = d / 2;
      spots.push([-m, (h - d) / 2], [w - m, (h - d) / 2], [-m, -m], [w - m, -m], [-m, h - m], [w - m, h - m],
        [2, 2], [w - d - 2, 2], [2, h - d - 2], [w - d - 2, h - d - 2]);
    }
    const TEXT = reduced ? 50 : 1;
    let best = null, bestA = Infinity;
    for (const [x, y] of spots) {
      const r = { left: b.left + x, top: b.top + y, right: b.left + x + d, bottom: b.top + y + d };
      if (r.left < fr.left || r.top < fr.top || r.right > fr.right || r.bottom > fr.bottom) continue;
      const a = TEXT * (texts.reduce((s, t) => s + area(r, t), 0) + placed.reduce((s, t) => s + area(r, t), 0)) + area(r, ring);
      if (a < bestA) { bestA = a; best = [x, y]; }
      if (!a) break;
    }
    if (best && (!bestA || reduced)) {
      badge.style.setProperty('--gx', best[0] + 'px'); badge.style.setProperty('--gy', best[1] + 'px');
      badge.classList.add('gf-badge--at');
      placed.push(grow({ left: b.left + best[0], top: b.top + best[1], right: b.left + best[0] + d, bottom: b.top + best[1] + d }, 1));
    } else badge.classList.add('gf-badge--off');
  }
}

// --- screenshots: where the picture's own words are
// A chip parked on the picture must not hide the game's text next to the box either (a debrief's lines, a
// lock's title). The script reads the screenshot once (same-origin, so a canvas may read it) at 640 x 360 and
// marks each 8 x 8 cell (16 x 16 px of the 1280 x 720 original) that looks like lettering: strong contrast,
// a fair share of ink of either polarity, and strokes crossing it both ways (a long panel edge or a flat
// fill crosses only one way, so outlines do not count). Each word cell's eight neighbors are marked too: that
// closes the gaps between words and keeps a chip from hugging a line of text. The map is the image's own, so it
// serves every crop and size alike. Two levels: 2 where the strokes cross the cell at least six times each
// way (what a chip must avoid), 1 where they cross it twice in two rows and two columns (a single small
// letter, an icon's edge). The badge, a small dot that should sit on clean picture, steers clear of both
// levels but reads the map before the neighbors are marked (gfInkRaw): it fits in a gap between lines.
const gfInk = new WeakMap(), gfInkRaw = new WeakMap();
const INK_W = 80, INK_H = 45, INK_C = 8;
function gfTextMap(fig) {
  if (gfInk.has(fig)) return gfInk.get(fig);
  const img = fig.querySelector('.simg');
  if (!img || !img.complete || !img.naturalWidth) return null;
  let map = false;
  try {
    const W = INK_W * INK_C, H = INK_H * INK_C;
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const cx = cv.getContext('2d', { willReadFrequently: true });
    cx.drawImage(img, 0, 0, W, H);
    const px = cx.getImageData(0, 0, W, H).data;
    const L = new Uint8Array(W * H);
    for (let i = 0; i < W * H; i++) L[i] = (px[4 * i] * 299 + px[4 * i + 1] * 587 + px[4 * i + 2] * 114) / 1000;
    const raw = new Uint8Array(INK_W * INK_H), b = new Uint8Array(INK_C * INK_C);
    for (let gy = 0; gy < INK_H; gy++) for (let gx = 0; gx < INK_W; gx++) {
      let lo = 255, hi = 0;
      for (let y = 0; y < INK_C; y++) for (let x = 0; x < INK_C; x++) { const v = L[(gy * INK_C + y) * W + gx * INK_C + x]; if (v < lo) lo = v; if (v > hi) hi = v; }
      if (hi - lo < 90) continue;
      const mid = (lo + hi) / 2;
      let on = 0;
      for (let y = 0; y < INK_C; y++) for (let x = 0; x < INK_C; x++) { const v = L[(gy * INK_C + y) * W + gx * INK_C + x] > mid ? 1 : 0; b[y * INK_C + x] = v; on += v; }
      const ink = Math.min(on, INK_C * INK_C - on) / (INK_C * INK_C);
      if (ink < 0.06) continue;
      let hT = 0, vT = 0, rows = 0, cols = 0;
      for (let y = 0; y < INK_C; y++) { let n = 0; for (let x = 1; x < INK_C; x++) if (b[y * INK_C + x] !== b[y * INK_C + x - 1]) n++; hT += n; if (n >= 2) rows++; }
      for (let x = 0; x < INK_C; x++) { let n = 0; for (let y = 1; y < INK_C; y++) if (b[y * INK_C + x] !== b[(y - 1) * INK_C + x]) n++; vT += n; if (n >= 2) cols++; }
      if (rows >= 2 && cols >= 2) raw[gy * INK_W + gx] = hT >= 6 && vT >= 6 ? 2 : 1;
    }
    gfInkRaw.set(fig, raw);
    map = new Uint8Array(INK_W * INK_H);
    for (let i = 0; i < raw.length; i++) if (raw[i]) {
      for (const j of [i, i - INK_W, i + INK_W]) {
        if (j < 0 || j >= raw.length) continue;
        const v = raw[i];
        map[j] = Math.max(map[j], v); if (j % INK_W) map[j - 1] = Math.max(map[j - 1], v); if ((j + 1) % INK_W) map[j + 1] = Math.max(map[j + 1], v);
      }
    }
  } catch (e) { map = false; /* an unreadable picture: no text map, the chip rules alone */ }
  gfInk.set(fig, map);
  fig.dataset.gfInk = map ? '1' : '0';
  return map;
}
/** The share (0..1) of an element's area (a chip, a badge) that sits on the picture's lettering. */
function gfOnText(fig, el, map) { return gfTextShare(fig, rectOf(el), map, 2); }
function gfTextShare(fig, cr, map, level) {
  if (!map) return 0;
  const img = fig.querySelector('.simg'), ir = rectOf(img);
  const fr = rectOf(fig.querySelector('.sframe'));
  const c = { left: Math.max(cr.left, fr.left), top: Math.max(cr.top, fr.top), right: Math.min(cr.right, fr.right), bottom: Math.min(cr.bottom, fr.bottom) };
  const all = (cr.right - cr.left) * (cr.bottom - cr.top);
  if (all <= 0 || ir.right <= ir.left) return 0;
  const sx = (ir.right - ir.left) / INK_W, sy = (ir.bottom - ir.top) / INK_H;
  const x0 = Math.max(0, Math.floor((c.left - ir.left) / sx)), x1 = Math.min(INK_W - 1, Math.floor((c.right - ir.left) / sx));
  const y0 = Math.max(0, Math.floor((c.top - ir.top) / sy)), y1 = Math.min(INK_H - 1, Math.floor((c.bottom - ir.top) / sy));
  let a = 0;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    if (map[y * INK_W + x] < level) continue;
    const l = ir.left + x * sx, t = ir.top + y * sy;
    a += area(c, { left: l, top: t, right: l + sx, bottom: t + sy });
  }
  return a / all;
}
/** A chip may cover this much of the picture's lettering (a stray stroke of a word under its edge). */
const TEXT_MAX = 0.03;

// --- screenshots: the cue chip clear of the ring, the badge, the zoom button and the picture's text
// Each step's chip is measured against its ring (the box plus its outset), its badge and the zoom button,
// and against the picture's lettering (gfTextMap). Of the placements that clear the ring, badge and button it
// takes the one on the least text (the earliest on a tie), trying in order: the server's side as styled; the
// same side at full width (a wider chip wraps less); the other side both ways; the same placements anchored
// to the opposite corner; the chip slid sideways past the badge; the chip pulled tighter into its corner
// (2px from the edge); and the chip slightly smaller. -> true when a clear placement was found that covers
// at most TEXT_MAX of text; false sends the whole figure's cues to the strip under the picture.
function gfCueOverlap(cue, box, badge, zoom) {
  const cr = rectOf(cue);
  if (cr.right - cr.left <= 0) return 0;
  const targets = [grow(rectOf(box), ringOut(box)), rectOf(badge)];
  if (zoom) targets.push(rectOf(zoom));
  return targets.reduce((s, r) => s + area(cr, r), 0);
}
function gfPlaceCue(fig, i) {
  const step = fig.querySelector(`.gf-step[data-i="${i}"]`);
  if (!step) return true;
  const cue = step.querySelector('.gf-cue'), box = step.querySelector('.gf-box'), badge = step.querySelector('.gf-badge');
  if (!cue || !box || !badge) return true;
  const zoom = fig.querySelector('.szoom');
  if (cue.dataset.gfTop === undefined) cue.dataset.gfTop = cue.classList.contains('gf-cue--top') ? '1' : '';
  const serverTop = cue.dataset.gfTop === '1';
  const chip = cue.querySelector('.gf-cue-n');
  const apply = (top, anchor, wide, shiftPx, tight, compact) => {
    cue.classList.toggle('gf-cue--top', top);
    cue.style.left = anchor === 'right' ? 'auto' : (shiftPx ? shiftPx + 'px' : '');
    cue.style.right = anchor === 'right' ? '10px' : '';
    cue.style.maxWidth = wide || shiftPx ? 'calc(100% - 20px)' : '';
    cue.style.top = top && tight ? '2px' : '';
    cue.style.bottom = !top && tight ? '2px' : '';
    cue.style.fontSize = compact ? '12px' : '';
    cue.style.lineHeight = compact ? '1.2' : '';
    cue.style.padding = compact ? '3px 9px' : '';
    if (chip) {
      chip.style.width = compact ? '14px' : '';
      chip.style.height = compact ? '14px' : '';
      chip.style.fontSize = compact ? '10px' : '';
    }
  };
  const tries = [];
  for (const top of [serverTop, !serverTop]) for (const [anchor, wide] of [['left', false], ['left', true], ['right', false], ['right', true]]) tries.push([top, anchor, wide, 0]);
  const shift = () => Math.ceil(badge.getBoundingClientRect().right - fig.querySelector('.sframe').getBoundingClientRect().left) + 6;
  for (const top of [serverTop, !serverTop]) tries.push([top, 'left', true, 'shift']);
  for (const top of [serverTop, !serverTop]) for (const anchor of ['left', 'right']) tries.push([top, anchor, true, 0, true]);
  for (const top of [serverTop, !serverTop]) for (const anchor of ['left', 'right']) tries.push([top, anchor, true, 0, true, true]);
  for (const top of [serverTop, !serverTop]) for (const tight of [false, true]) tries.push([top, 'left', true, 'shift', tight, true]);
  const map = gfTextMap(fig);
  let best = null, bestArea = Infinity, clear = null, clearText = Infinity;
  for (const t of tries) {
    const args = t.map(v => (v === 'shift' ? shift() : v));
    apply(...args);
    const a = gfCueOverlap(cue, box, badge, zoom);
    if (!a) {
      const tx = gfOnText(fig, cue, map);
      if (tx < clearText) { clearText = tx; clear = args; }
      if (!tx) break; // clear of everything, in preference order
    } else if (a < bestArea) { bestArea = a; best = args; }
  }
  if (clear) { apply(...clear); return clearText <= TEXT_MAX; }
  if (best) apply(...best);
  return false;
}
// --- screenshots: the numbered badge off the picture's text
// A screenshot's badge starts where the CSS parks it (outside the ring's top-left corner, slid inside the
// frame). The script then weighs that spot, the twelve around the box that the diagrams use (each corner
// outside the ring, both ends of each side and each side's middle) and more slid along each side, all
// touching the ring, inside the frame and clear of the zoom button (and, only when all of those are on
// words, spots just inside the box's edge), and takes the one on the least of the picture's lettering (the
// earliest on a tie, so a clear default stays put). -> the spots that tie for least text, best first: the cue
// chip is placed after the badge (it steers clear of it), and gfLayout tries the next one when the chip finds
// no room. A badge that cannot avoid every word gets a dark rim (gf-badge--ink) so its number still reads.
function gfBadgeSpots(fig, box, badge, map) {
  badge.classList.remove('gf-badge--at', 'gf-badge--ink');
  const fr = rectOf(fig.querySelector('.sframe'));
  const zs = fig.querySelector('.szoom span');
  const zoom = zs ? grow(rectOf(zs), 3) : null;
  const b = rectOf(box), w = b.right - b.left, h = b.bottom - b.top;
  // The default spot (where the CSS parks the badge) is measured on a fresh copy: the badge itself, read
  // straight after its class changes, can still report the spot it had before.
  const probe = badge.cloneNode(true);
  probe.removeAttribute('style'); probe.style.visibility = 'hidden';
  box.append(probe);
  const d0 = rectOf(probe), d = d0.right - d0.left || 20, o = ringOut(box) + 2;
  probe.remove();
  const ring = grow(b, o - 2);
  const spots = [null, [-o - d, -o - d], [w + o, -o - d], [-o - d, h + o], [w + o, h + o], [0, -o - d], [w - d, -o - d], [0, h + o], [w - d, h + o],
    [-o - d, (h - d) / 2], [w + o, (h - d) / 2], [(w - d) / 2, -o - d], [(w - d) / 2, h + o],
    [-o - d, 0], [w + o, 0], [-o - d, h - d], [w + o, h - d]];
  // then further spots slid along each side, still touching the ring
  for (let k = 1; k < 16; k++) {
    const fx = -o - d + (w + 2 * o + d) * k / 16, fy = -o - d + (h + 2 * o + d) * k / 16;
    spots.push([fx, -o - d], [fx, h + o], [-o - d, fy], [w + o, fy]);
  }
  // last, when every spot outside the ring is on words: inside the box, just within its edge (a box drawn
  // around a whole line of text keeps some margin round the words), at the corners and slid along each side
  const inner = spots.length, m = 2;
  if (w > 2 * d + 2 * m && h > d + 2 * m) {
    for (let k = 0; k <= 16; k++) {
      const fx = m + (w - d - 2 * m) * k / 16, fy = m + (h - d - 2 * m) * k / 16;
      spots.push([fx, m], [fx, h - d - m], [m, fy], [w - d - m, fy]);
    }
  }
  // The still view (reduced motion) shows every badge at once: a spot on an earlier step's badge is left out
  // (two boxes sharing a corner would otherwise stack their numbers), unless no other spot is left.
  // Each earlier badge is taken where it was put (its box plus the spot it got), not measured back: a badge's
  // rect read straight after its spot changes can still be the old one.
  const me = box.closest('.gf-step'), taken = [];
  if (reduced && me) for (const st of fig.querySelectorAll('.gf-step')) {
    const g = +st.dataset.i < +me.dataset.i && st.querySelector('.gf-badge'), sp = g && gfSpotOf.get(g);
    if (!sp) continue;
    const bx = rectOf(st.querySelector('.gf-box'));
    taken.push(grow({ left: bx.left + sp[0], top: bx.top + sp[1], right: bx.left + sp[0] + d, bottom: bx.top + sp[1] + d }, 2));
  }
  let out = [];
  const all = [];
  spots.forEach((p, k) => {
    const r = p ? { left: b.left + p[0], top: b.top + p[1], right: b.left + p[0] + d, bottom: b.top + p[1] + d } : d0;
    if (p) {
      if (r.left < fr.left + 1 || r.top < fr.top + 1 || r.right > fr.right - 1 || r.bottom > fr.bottom - 1) return;
      if ((k < inner && area(r, ring)) || (zoom && area(r, zoom))) return;
    }
    const c = { p, k, tx: gfTextShare(fig, r, map, 1), rel: p || [d0.left - b.left, d0.top - b.top] };
    all.push(c);
    if (!taken.some(t => area(r, t))) out.push(c);
  });
  if (!out.length) out = all;
  out.sort((a, c) => a.tx - c.tx || a.k - c.k);
  return out.filter(c => c.tx <= out[0].tx + 0.005);
}
const gfSpotOf = new WeakMap();
function gfSetBadge(badge, spot) {
  badge.classList.remove('gf-badge--at', 'gf-badge--ink');
  if (spot.rel) gfSpotOf.set(badge, spot.rel); else gfSpotOf.delete(badge);
  if (spot.p) { badge.style.setProperty('--gx', spot.p[0] + 'px'); badge.style.setProperty('--gy', spot.p[1] + 'px'); badge.classList.add('gf-badge--at'); }
  if (spot.tx > 0) badge.classList.add('gf-badge--ink');
}
/** Place one screenshot step: its badge on the least text, then its chip clear of the badge (another
 *  equally clear badge spot when the chip finds no room). -> what gfPlaceCue says. */
function gfPlaceStep(fig, i) {
  const step = fig.querySelector(`.gf-step[data-i="${i}"]`);
  const box = step && step.querySelector('.gf-box'), badge = box && box.querySelector('.gf-badge');
  if (!badge) return gfPlaceCue(fig, i);
  gfTextMap(fig);
  const spots = gfBadgeSpots(fig, box, badge, gfInkRaw.get(fig) || null);
  if (!spots.length) return gfPlaceCue(fig, i);
  for (const sp of spots.slice(0, 6)) {
    gfSetBadge(badge, sp);
    if (gfPlaceCue(fig, i)) return true;
  }
  gfSetBadge(badge, spots[0]);
  return gfPlaceCue(fig, i);
}
/** Settle a figure's tour for its current size: diagram boxes and badges, or screenshot badges and chips (and
 *  the strip fallback). Only a figure on show can be measured; the deck calls this when a slide is shown. */
function gfLayout(fig) {
  if (!fig.querySelector('.sframe').getBoundingClientRect().width) return;
  if (fig.classList.contains('vf')) { gfFitVf(fig); gfBadgesVf(fig); return; }
  // The text map needs the picture itself: a lazy picture not in yet lays the figure out again when it is.
  const img = fig.querySelector('.simg');
  if (img && !gfInk.has(fig) && !(img.complete && img.naturalWidth) && !fig.dataset.gfWait) {
    fig.dataset.gfWait = '1';
    img.addEventListener('load', () => gfLayout(fig), { once: true });
    img.addEventListener('error', () => { gfInk.set(fig, false); fig.dataset.gfInk = '0'; gfLayout(fig); }, { once: true });
  }
  fig.dispatchEvent(new Event('gf:prelayout')); // a zoomed picture (course-zoom.js) goes back to rest first
  fig.classList.remove('gf--strip');
  const n = fig.querySelectorAll('.gf-step').length;
  let fits = true;
  for (let i = 0; i < n; i++) if (!gfPlaceStep(fig, i)) fits = false;
  fig.classList.toggle('gf--strip', !fits);
  // The Replay button follows the cues: on the picture with the chips, under it with the strip.
  const btn = fig.querySelector('.gf-replay');
  if (btn) { if (fits) fig.querySelector('.sframe').append(btn); else fig.querySelector('.gf-strip').after(btn); }
  fig.dispatchEvent(new Event('gf:layout')); // zoom-to-cue (course-zoom.js) lays its zoomed steps out on top
}
for (const fig of gfFigs) fig.classList.add('gf-js');
if (gfFigs.length) {
  let rt = 0;
  addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { for (const fig of gfFigs) gfLayout(fig); }, 120); });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { for (const fig of gfFigs) gfLayout(fig); });
  for (const fig of gfFigs) gfLayout(fig);
}
// Zoom-to-cue: a screenshot whose game words would read under 11 px zooms to each step (public/js/course-zoom.js,
// self-contained: it only reads the figure, sets the picture's and the step's geometry, and calls gfPlaceStep).
if (gfFigs.length) import('/js/course-zoom.js').then(m => m.init({ figs: gfFigs, placeStep: gfPlaceStep, reduced })).catch(() => { /* no zoom: the plain tour */ });
if (gfFigs.length && !reduced) {
  const gfIO = new IntersectionObserver(es => {
    for (const e of es) {
      if (e.isIntersecting) { if (!e.target.dataset.gfPlayed) { e.target.dataset.gfPlayed = '1'; gfPlay(e.target); } }
      else if (e.target.dataset.gfPlayed) { delete e.target.dataset.gfPlayed; gfFinish(e.target); }
      else gfStop(e.target);
    }
  }, { threshold: 0.35 });
  for (const fig of gfFigs) {
    gfIO.observe(fig);
    const btn = fig.querySelector('.gf-replay');
    if (btn) btn.addEventListener('click', () => { fig.dataset.gfPlayed = '1'; gfPlay(fig); });
  }
}
/** Lay out the pictures of the slide just shown (they could not be measured while hidden). */
function gfShown(slide) { for (const fig of $$('.smedia.gf', slide)) gfLayout(fig); }

// ---------------------------------------------------------------------------------------------- whole picture
// A cropped screenshot (slide `view`) shows only the part the slide is about; a tap on it, or its corner
// button, opens the whole picture in a modal dialog (Esc, the Close button or a tap outside closes it, and
// focus returns where it was). Without the script the corner button is a plain link to the picture.
const zoomDlg = $('#szoom');
if (zoomDlg && typeof zoomDlg.showModal === 'function') {
  const zimg = $('#szoom-img');
  const open = fig => {
    const img = fig.querySelector('.simg');
    zimg.src = img.currentSrc || img.src; zimg.alt = img.alt;
    zoomDlg.showModal();
  };
  for (const fig of $$('.smedia.crop')) {
    const frame = fig.querySelector('.sframe'), link = fig.querySelector('.szoom');
    if (link) link.addEventListener('click', e => { e.preventDefault(); open(fig); });
    frame.addEventListener('click', e => { if (!e.target.closest('button, a')) open(fig); });
  }
  $('#szoom-x').addEventListener('click', () => zoomDlg.close());
  zoomDlg.addEventListener('click', e => { if (e.target === zoomDlg) zoomDlg.close(); });
  zoomDlg.addEventListener('close', () => { zimg.removeAttribute('src'); });
}

// ---------------------------------------------------------------------------------------------- the slides
const dots = $$('.dot', nav), back = $('#deck-back'), next = $('#deck-next');
function show(i, focus = false) {
  at = Math.max(0, Math.min(slides.length - 1, i));
  stopSpeaking();
  slides.forEach((s, k) => { s.hidden = k !== at; });
  dots.forEach((b, k) => { if (k === at) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current'); });
  back.disabled = at === 0;
  const last = at === slides.length - 1;
  next.textContent = last ? next.dataset.check : next.dataset.next;
  next.classList.toggle('btn-hot', last && !d.checked);
  gfShown(slides[at]);
  if (focus) {
    // The new slide starts at its top: when the deck's top has gone off screen — above the window or under
    // the sticky top bar — bring it back to just below the bar (the deck's scroll-margin-top is the bar's
    // height plus a gap). A deck top already on screen stays where it is: no jump.
    const bar = (parseFloat(getComputedStyle(deck).scrollMarginTop) || 0) - 12;
    // The step line above the deck comes along when the header, the slide and the slide buttons all fit on
    // the screen together; a step line half under the bar is never left behind.
    const head = document.querySelector('.cl-head'), top = deck.getBoundingClientRect().top;
    const fits = head && nav.getBoundingClientRect().bottom - head.getBoundingClientRect().top <= innerHeight - bar - 24;
    const hr = head && head.getBoundingClientRect();
    const cut = hr && hr.top < bar && hr.bottom > bar; // the step line half under the bar
    const target = (cut || top < bar) ? (fits ? head : deck) : null;
    if (target) target.scrollIntoView({ block: 'start', behavior: reduced ? 'auto' : 'smooth' });
    slides[at].querySelector('.slide-h').focus({ preventScroll: true });
  }
}
async function toCheck() {
  if (!d.read) { d.read = true; try { await api(`${base}/read`, { method: 'POST', body: {} }); } catch (e) { if (e.status === 401) toast(e.message, { bad: true }); } }
  check.hidden = false;
  check.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
  const h = $('#check-h'); h.tabIndex = -1; h.focus({ preventScroll: true });
}
if (deck && slides.length) {
  deck.classList.add('deck-js'); nav.hidden = false;
  slides.forEach(s => { s.querySelector('.slide-h').tabIndex = -1; });
  // Not read yet: the check waits until the last slide (unless the page was opened at it).
  if (!d.read && !d.checked && !/^#(check|play)$/.test(location.hash)) check.hidden = true;
  show(0);
  back.addEventListener('click', () => show(at - 1, true));
  next.addEventListener('click', () => (at === slides.length - 1 ? toCheck() : show(at + 1, true)));
  dots.forEach((b, k) => b.addEventListener('click', () => show(k, true)));
  document.addEventListener('keydown', e => {
    const el = e.target;
    if (e.altKey || e.ctrlKey || e.metaKey || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName || '') || (el.closest && el.closest('#check, #play'))) return;
    if (e.key === 'ArrowRight') { e.preventDefault(); show(at + 1, true); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); show(at - 1, true); }
  });
  // Swipe: a mostly sideways move of 50 px or more.
  let x0 = null, y0 = 0;
  deck.addEventListener('pointerdown', e => { if (e.pointerType !== 'mouse') { x0 = e.clientX; y0 = e.clientY; } }, { passive: true });
  deck.addEventListener('pointerup', e => {
    if (x0 === null) return;
    const dx = e.clientX - x0, dy = e.clientY - y0; x0 = null;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) show(at + (dx < 0 ? 1 : -1));
  }, { passive: true });
  deck.addEventListener('pointercancel', () => { x0 = null; });
}

// ---------------------------------------------------------------------------------------------- story layer
// A story slide's stage (the Spark, its pieces, the characters) plays its scene once per view: the script
// first arms every stage (its start positions — characters off stage, the flown piece still with its owner),
// then an IntersectionObserver plays a stage when it scrolls (or pages) into view and resets it when it
// leaves, so it can play again next time — the same discipline as the guided-focus tour above. The CSS holds
// every animation under [data-story-on] with fill both, so a played stage rests on its finished frame.
// Reduced motion: nothing is armed or played at all — the unarmed CSS *is* the finished frame.
const storyFigs = $$('.smedia.story');
if (storyFigs.length && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
  for (const fig of storyFigs) fig.setAttribute('data-story-arm', '');
  const storyIO = new IntersectionObserver(es => {
    for (const e of es) {
      if (e.isIntersecting) { if (!e.target.dataset.storyPlayed) { e.target.dataset.storyPlayed = '1'; e.target.setAttribute('data-story-on', ''); } }
      else if (e.target.dataset.storyPlayed) { delete e.target.dataset.storyPlayed; e.target.removeAttribute('data-story-on'); }
    }
  }, { threshold: 0.35 });
  for (const fig of storyFigs) storyIO.observe(fig);
}

// ---------------------------------------------------------------------------------------------- Number Quest moments
// When the server sends an `nq` payload (Number Quest only), show its moments as small cards that cheer and
// leave on their own: Tally Marks for a passed check, the daily goal completing, a unit's lap landing. They
// never block the lesson (no focus steal, they remove themselves), and a wrong answer gets Tally's line
// under the question — the mix-up named kindly, the mistake celebrated by the Jumble, never punished.
function nqMoments(nq, anchor) {
  if (!nq || !anchor) return;
  const parts = [];
  if (nq.marks && nq.marks.awarded) parts.push(['marks', t('js.course.nqMarks', { marks: nq.marks.marks, total: nq.marks.total })]);
  if (nq.dailyGoal && nq.dailyGoal.justMet) parts.push(['goal', t('js.course.nqGoal')]);
  if (nq.lap) parts.push(['lap', t('js.course.nqLap', { lap: nq.lap.lap })]);
  for (const [kind, text] of parts) {
    const el = document.createElement('div');
    el.className = `nq-moment nq-moment-${kind}`; el.setAttribute('role', 'status');
    el.textContent = text;
    anchor.after(el);
    setTimeout(() => el.remove(), kind === 'lap' ? 6000 : 4200);
  }
}

// ---------------------------------------------------------------------------------------------- the quick check
const form = $('#qcheck');
if (form) {
  const qs = $$('.qq', form);
  const send = $('#qcheck-send');
  const answers = {};
  let qi = 0, tries = 0;
  send.hidden = true;
  form.addEventListener('submit', e => e.preventDefault());
  /** The sticky top bar's height (the check's scroll-margin-top is the bar plus a 12px gap). */
  const barH = () => (parseFloat(getComputedStyle(check).scrollMarginTop) || 12) - 12;
  /** The bottom tab bar's height on a phone (0 where there is none). */
  const tabH = () => { const tb = document.querySelector('.tabbar'); return tb && getComputedStyle(tb).position === 'fixed' ? tb.getBoundingClientRect().height : 0; };
  function ask(i) {
    qi = i;
    qs.forEach((f, k) => { f.hidden = k !== i; });
    const legend = qs[i].querySelector('legend'); legend.tabIndex = -1;
    if (i || tries) {
      legend.focus({ preventScroll: true });
      // The new question from its top, just below the top bar — only when its top is off screen.
      const top = qs[i].getBoundingClientRect().top;
      if (top < barH() + 8 || top > innerHeight - tabH() - 80) scrollBy({ top: top - barH() - 16, behavior: reduced ? 'auto' : 'smooth' });
    }
  }
  /** After an answer: show the feedback and the Next button, scrolling only as far as needed, and never so
   *  far that the question's own text leaves the top of the screen. */
  function reveal(f, go) {
    const need = go.getBoundingClientRect().bottom + 12 - (innerHeight - tabH());
    if (need <= 0) return;
    const room = f.querySelector('legend').getBoundingClientRect().top - barH() - 8;
    const by = Math.min(need, Math.max(0, room));
    if (by > 0) scrollBy({ top: by, behavior: reduced ? 'auto' : 'smooth' });
  }
  function reset() {
    tries++;
    for (const f of qs) {
      f.classList.remove('is-right', 'is-wrong');
      f.querySelector('.qq-fb').replaceChildren();
      const go = f.querySelector('.qq-go'); if (go) go.remove();
      const box = f.querySelector('.qq-choices');
      const labels = $$('.qchoice', box);
      // A new order each try (rotate by the try number), so the right answer is not where it was.
      labels.forEach(l => { l.classList.remove('is-right', 'is-wrong'); const r = l.querySelector('input'); r.checked = false; r.disabled = false; });
      for (let k = 0; k < tries % labels.length + 1; k++) box.appendChild(box.firstElementChild);
    }
    const res = $('#qresult'); if (res) res.remove();
    ask(0);
  }
  async function finish() {
    let r;
    try { r = await api(`${base}/check`, { method: 'POST', body: { answers } }); } catch (e) { toast(e.message, { bad: true }); return; }
    const box = document.createElement('div');
    box.id = 'qresult'; box.className = `cl-result ${r.passed ? 'ok' : 'bad'}`; box.setAttribute('role', 'status');
    box.textContent = r.passed ? t('js.course.passed', { score: r.score, total: r.total }) : t('js.course.failed', { score: r.score, total: r.total, pass: 2 });
    // Number Quest: Tally herself shows up on a pass — she was only a line of text before, and the
    // passed screen read as plain green boxes. Her sprite is her own game's, never a redraw.
    if (r.passed && d.course === 'number-quest') {
      const img = document.createElement('img');
      img.className = 'nq-tally-img'; img.src = '/img/csq/chars/tally.webp'; img.alt = ''; img.width = 219; img.height = 353;
      const line = document.createElement('span'); line.textContent = ' Tally is purring: check passed!';
      box.prepend(img); box.append(line);
    }
    qs.forEach(f => { f.hidden = true; });
    form.after(box);
    nqMoments(r.nq, box);
    // A guest who passes the check of a step with no game has reached that step's completion moment —
    // and guests cannot complete courses. The server kept the finish; this note says signing up is
    // what counts it (the win moment of a game step gets the same prompt on the play page).
    if (r.needAccount) {
      const p = document.createElement('p'); p.className = 'cl-guest-save';
      const link = document.createElement('a'); link.className = 'btn btn-primary'; link.href = r.needAccount.signup || '/signup'; link.textContent = t('js.course.guestSaveAction');
      p.append(document.createTextNode(t('js.course.guestSave') + ' '), link);
      box.append(document.createElement('br'), p);
    }
    if (r.passed) {
      d.checked = true;
      form.remove();
      const slot = $('#play-slot');
      if (slot && r.html) { slot.outerHTML = r.html; const nx = $('#cl-next'); if (nx) nx.hidden = !!r.play; }
      const play = $('#cl-play') || $('#play-h');
      if (play) { play.scrollIntoView({ block: 'center' }); play.focus(); }
    } else {
      const again = document.createElement('button');
      again.type = 'button'; again.className = 'btn btn-primary btn-big'; again.textContent = t('js.course.again'); again.id = 'qagain';
      again.addEventListener('click', reset);
      box.append(document.createElement('br'), again);
      again.focus();
    }
  }
  form.addEventListener('change', async e => {
    const radio = e.target.closest('input[type=radio]'); if (!radio) return;
    const f = radio.closest('.qq'); if (f !== qs[qi] || f.dataset.busy) return;
    f.dataset.busy = '1';
    const choice = +radio.value;
    let r;
    try { r = await api(`${base}/answer`, { method: 'POST', body: { item: f.dataset.q, choice } }); } catch (err) { toast(err.message, { bad: true }); radio.checked = false; delete f.dataset.busy; return; }
    delete f.dataset.busy;
    answers[f.dataset.q] = choice;
    $$('input', f).forEach(x => { x.disabled = true; });
    const right = $$('input', f).find(x => +x.value === r.answer);
    if (right) right.closest('.qchoice').classList.add('is-right');
    if (!r.right) radio.closest('.qchoice').classList.add('is-wrong');
    f.classList.add(r.right ? 'is-right' : 'is-wrong');
    const fb = f.querySelector('.qq-fb');
    if (r.right) fb.textContent = t('js.course.right');
    else {
      // "Not quite." in the error colour, then the right answer in bold and the why in plain text.
      const no = document.createElement('span'); no.className = 'qq-fb-no'; no.textContent = t('js.course.notQuite');
      const mark = '\u0001', [pre, post = ''] = t('js.course.rightIs', { answer: mark }).split(mark);
      const ans = document.createElement('b'); ans.textContent = r.text;
      const end = /[.!?…。！？:]$/.test(r.text + post) ? '' : '.';
      fb.replaceChildren(no, ' ', pre, ans, post + end + (r.why ? ' ' : ''), r.why || '');
    }
    const last = qi === qs.length - 1;
    const go = document.createElement('button');
    go.type = 'button'; go.className = 'btn btn-primary btn-big qq-go'; go.textContent = last ? t('js.course.finish') : t('js.course.next');
    go.addEventListener('click', () => (last ? finish() : ask(qi + 1)));
    f.append(go);
    // Number Quest: Tally's reaction line rides under the feedback text (kept apart from the
    // feedback assignment above so this file merges cleanly with the shared course renderer).
    if (r.nq && r.nq.reaction) fb.append(` ${r.nq.reaction.text}`);
    go.focus({ preventScroll: true });
    reveal(f, go);
  });
  ask(0);
}
