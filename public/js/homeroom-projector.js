// Homeroom's projector view (routes/homeroom.js /class/:id/homeroom/projector): the teacher's area as big as the screen,
// the class's name and the Live dot. It asks for the area again every few seconds (GET /api/homeroom/<class>/state,
// which sends the area only when it changed) and never shows a name, a desk or anyone's work.
import { api, pageData } from '/js/app.js';
import { areaHtml, fitAreas } from '/js/homeroom-area.js';

const D = pageData();
const box = document.getElementById('hr-projarea'), dot = document.getElementById('hr-live');
let v = null;
function show(st) {
  if (!st) return;
  if (dot) dot.hidden = !st.live;
  if ('area' in st) { box.innerHTML = areaHtml(st.area, { mode: 'contain' }); requestAnimationFrame(() => fitAreas(box)); }
  v = st.v;
}
async function poll() {
  if (!document.hidden) {
    try { show(await api(`/api/homeroom/${encodeURIComponent(D.classId)}/state?v=${encodeURIComponent(v ?? '')}`, { background: true })); } catch { /* try again next time */ }
  }
  setTimeout(poll, 3000);
}
if (box) {
  show(D.state);
  window.addEventListener('resize', () => fitAreas(box));
  document.addEventListener('visibilitychange', () => { if (!document.hidden) fitAreas(box); });
  setTimeout(poll, 3000);
}
