// Classroom dashboards, stage 5: the document camera (docs/decisions.md "Classroom dashboards, stage 5"). The teacher's
// screen or projector only, after the teacher taps Start. The picture goes from the camera to this page's <video> and
// nowhere else: it is NEVER recorded, saved or sent. This module has no network, storage or recorder code and never
// reads a frame back out of a canvas (tests/unit/dash-stage5.test.js reads this file to check). Freeze draws the
// current frame onto a canvas that is only shown. The camera stops when the widget is removed or redrawn, when the
// layout changes, and whenever the tab is hidden.

const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const icon = t => { const e = el('span', 'dw5-ic', t); e.setAttribute('aria-hidden', 'true'); return e; };
const ibtn = (ic, words, cls = 'btn btn-sm') => { const b = el('button', cls); b.type = 'button'; b.append(icon(ic), el('span', 'dw5-bt', words)); return b; };
export const ZOOMS = [1, 1.25, 1.5, 2, 2.5, 3];
/** The view's transform: mirror, a quarter turn at a time, and zoom. */
export const camTransform = ({ mirror = false, turn = 0, zoom = 1 } = {}) => `rotate(${((turn % 4) + 4) % 4 * 90}deg) scale(${mirror ? -zoom : zoom}, ${zoom})`;
// Per widget, while the page is open: which camera, mirror, turn and zoom (never saved).
const views = new Map();

export function camera(body, s, ctx) {
  const W = ctx.type.words;
  body.classList.add('dw-camera', 'dw5');
  const v = views.get(ctx.id) || { mirror: false, turn: 0, zoom: 0, device: '' };
  views.set(ctx.id, v);
  const top = el('div', 'dw-row dw5-camtop');
  const go = ibtn('▶', W.start, 'btn btn-sm btn-primary');
  const state = el('span', 'dw5-camstate', W.off); state.setAttribute('role', 'status');
  const pickWrap = el('span', 'dw5-campick'); pickWrap.hidden = true;
  const pickId = `dw-cam-${ctx.id}`;
  const pickLab = el('label', 'dw5-camlab', W.which); pickLab.htmlFor = pickId;
  const pick = el('select', 'input dw5-camsel'); pick.id = pickId;
  pickWrap.append(pickLab, pick);
  top.append(go, state, pickWrap);
  const stage = el('div', 'dw5-camstage');
  const video = el('video', 'dw5-camvideo'); video.muted = true; video.playsInline = true; video.setAttribute('playsinline', ''); video.setAttribute('aria-label', W.camera);
  const still = el('canvas', 'dw5-camstill'); still.hidden = true; still.setAttribute('role', 'img'); still.setAttribute('aria-label', W.frozen);
  const msg = el('div', 'dw5-cammsg');
  stage.append(video, still, msg);
  const row = el('div', 'dw-row dw-foot dw5-camrow');
  const mirror = ibtn('↔', W.mirror), turn = ibtn('↻', W.rotate), out = ibtn('−', W.zoomOut), inn = ibtn('+', W.zoomIn), freeze = ibtn('❄', W.freeze);
  const zoomText = el('span', 'dw5-zoom'); zoomText.setAttribute('aria-live', 'polite');
  row.append(mirror, turn, out, zoomText, inn, freeze);
  body.append(top, stage, row);

  let stream = null, frozen = false, gone = false;
  const apply = () => {
    const t = camTransform({ mirror: v.mirror, turn: v.turn, zoom: ZOOMS[v.zoom] });
    video.style.transform = t; still.style.transform = t;
    stage.classList.toggle('is-turned', v.turn % 2 === 1);
    mirror.setAttribute('aria-pressed', String(v.mirror));
    freeze.setAttribute('aria-pressed', String(frozen));
    freeze.lastChild.textContent = frozen ? W.unfreeze : W.freeze;
    zoomText.textContent = `${new Intl.NumberFormat(ctx.intl).format(ZOOMS[v.zoom])}×`;
    zoomText.setAttribute('aria-label', `${W.zoom} ${zoomText.textContent}`);
    out.disabled = !stream || v.zoom === 0; inn.disabled = !stream || v.zoom === ZOOMS.length - 1;
    for (const b of [mirror, turn, freeze]) b.disabled = !stream;
    go.lastChild.textContent = stream ? W.stop : W.start; go.firstChild.textContent = stream ? '■' : '▶';
    state.textContent = stream ? (frozen ? `❄ ${W.frozen}` : `● ${W.live}`) : W.off;
    state.classList.toggle('is-live', !!stream && !frozen);
  };
  const say = (ic, title, text, again) => {
    msg.textContent = ''; msg.hidden = false;
    msg.append(el('span', 'dw5-bigic', ic), el('b', 'dw5-fbtitle', title));
    if (text) msg.appendChild(el('p', 'dw5-fbtext', text));
    if (again) { const b = ibtn('↻', W.again, 'btn btn-sm'); b.addEventListener('click', start); msg.appendChild(b); }
  };
  const off = () => { say('📷', W.off, W.note); video.hidden = true; still.hidden = true; };
  function stop() {
    if (stream) for (const t of stream.getTracks()) t.stop();
    stream = null; frozen = false; video.srcObject = null;
    off(); apply();
  }
  async function start() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { say('📷', W.failed, W.noneText, false); return; }
    go.disabled = true;
    try {
      const s2 = await navigator.mediaDevices.getUserMedia({ video: v.device ? { deviceId: { exact: v.device } } : { facingMode: 'environment' }, audio: false });
      if (gone) { for (const t of s2.getTracks()) t.stop(); return; }
      if (stream) for (const t of stream.getTracks()) t.stop();
      stream = s2; frozen = false;
      video.srcObject = stream; video.hidden = false; still.hidden = true; msg.hidden = true;
      await video.play().catch(() => {});
      const track = stream.getVideoTracks()[0];
      v.device = (track && track.getSettings && track.getSettings().deviceId) || v.device;
      listCameras();
      ctx.say(W.live);
    } catch (err) {
      const name = err && err.name;
      if (name === 'NotAllowedError' || name === 'SecurityError') say('🔒', W.denied, W.deniedText, true);
      else if (name === 'NotFoundError' || name === 'OverconstrainedError' || name === 'DevicesNotFoundError') { v.device = ''; say('📷', W.none, W.noneText, true); }
      else say('⚠️', W.failed, W.noneText, true);
    } finally { go.disabled = false; apply(); }
  }
  async function listCameras() {
    try {
      const cams = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'videoinput');
      pick.textContent = '';
      cams.forEach((d, i) => { const o = el('option', null, d.label || `${W.camera} ${i + 1}`); o.value = d.deviceId; pick.appendChild(o); });
      pick.value = v.device;
      pickWrap.hidden = cams.length < 2;
    } catch { pickWrap.hidden = true; }
  }
  go.addEventListener('click', () => (stream ? stop() : start()));
  pick.addEventListener('change', () => { v.device = pick.value; if (stream) start(); });
  mirror.addEventListener('click', () => { v.mirror = !v.mirror; apply(); ctx.say(`${W.mirror}: ${v.mirror ? '✔' : '✖'}`); });
  turn.addEventListener('click', () => { v.turn = (v.turn + 1) % 4; apply(); ctx.say(`${W.rotate}: ${v.turn * 90}°`); });
  out.addEventListener('click', () => { v.zoom = Math.max(0, v.zoom - 1); apply(); ctx.say(zoomText.getAttribute('aria-label')); });
  inn.addEventListener('click', () => { v.zoom = Math.min(ZOOMS.length - 1, v.zoom + 1); apply(); ctx.say(zoomText.getAttribute('aria-label')); });
  freeze.addEventListener('click', () => {
    if (!stream) return;
    frozen = !frozen;
    if (frozen && video.videoWidth) {
      // The frame is drawn to be shown, never read back.
      still.width = video.videoWidth; still.height = video.videoHeight;
      still.getContext('2d').drawImage(video, 0, 0);
      still.hidden = false; video.hidden = true;
    } else { frozen = false; still.hidden = true; video.hidden = false; }
    apply(); ctx.say(frozen ? W.frozen : W.live);
  });
  const onHide = () => { if (document.hidden && stream) stop(); };
  document.addEventListener('visibilitychange', onHide);
  off(); apply();
  return { destroy() { gone = true; document.removeEventListener('visibilitychange', onHide); stop(); } };
}
