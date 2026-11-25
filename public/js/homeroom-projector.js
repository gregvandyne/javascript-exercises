// Homeroom's projector view (routes/homeroom.js /class/:id/homeroom/projector): the teacher's area as big as the screen,
// the class's name and the Live dot. It asks for the area again every few seconds (GET /api/homeroom/<class>/state,
// which sends the area only when it changed) and never shows a name, a desk or anyone's work. While the class sign-in is
// open (step 1c) a "Students sign in" card shows its QR code, the short address and the code beside the area.
import { api, pageData } from '/js/app.js';
import { areaHtml, fitAreas } from '/js/homeroom-area.js';

const D = pageData();
const box = document.getElementById('hr-projarea'), dot = document.getElementById('hr-live'), sign = document.getElementById('hr-projsign');
let v = null, sc = '';
function showSignin(s) {
  if (!sign || !s) return;
  const was = !sign.hidden;
  sign.hidden = !s.open;
  if (s.open) {
    if (s.qr) document.getElementById('hr-projqr').innerHTML = s.qr;
    document.getElementById('hr-projurl').textContent = s.shown;
    document.getElementById('hr-projcode').textContent = `${s.code.slice(0, 3)} ${s.code.slice(3)}`;
  }
  sc = s.open ? s.code : '';
  if (was !== s.open) requestAnimationFrame(() => fitAreas(box));
}
function show(st) {
  if (!st) return;
  if (dot) dot.hidden = !st.live;
  showSignin(st.signin);
  if ('area' in st) { box.innerHTML = areaHtml(st.area, { mode: 'contain' }); requestAnimationFrame(() => fitAreas(box)); }
  v = st.v;
}
async function poll() {
  if (!document.hidden) {
    try { show(await api(`/api/homeroom/${encodeURIComponent(D.classId)}/state?v=${encodeURIComponent(v ?? '')}&sc=${encodeURIComponent(sc)}`, { background: true })); } catch { /* try again next time */ }
  }
  setTimeout(poll, 3000);
}
if (box) {
  show(D.state);
  window.addEventListener('resize', () => fitAreas(box));
  document.addEventListener('visibilitychange', () => { if (!document.hidden) fitAreas(box); });
  setTimeout(poll, 3000);
}
