// A student's supports on their own screens (docs/decisions.md "Homeroom: supports, aides and sub links"; server:
// services/homeroom-supports.js). Shown as helpful tools, never as a label:
//   - Read aloud: a 🔊 "Read to me" button next to the teacher's instructions; it reads them with this device's own voice
//     (public/js/tts.js, nothing is sent anywhere); tap again to stop. Only where the device can speak;
//   - Bigger text: the page's text larger (the desk, and the note over a game);
//   - Simpler wording and extra time come from the server (the simpler text in place of the instructions, the student's
//     own clock on the plan's Now line).
// The desk (public/js/homeroom-desk.js) uses readBtn() and wireRead(); on a game's page (page-data hrSupport, added by
// services/homeroom-handouts.js's play frame) this file puts the button on the teacher's note over the game itself.
import { t, esc, pageData } from '/js/app.js';
import { iconHtml } from '/js/icons.js';
import { readAloud, stopReading } from '/js/tts.js';

const ts = (k, v) => t(`js.homeroom-support.${k}`, v);
export const canRead = () => typeof window !== 'undefined' && !!window.speechSynthesis;
const lang = () => document.documentElement.lang || 'en';

/** The Read to me button for a piece of text ('' where the device has no voice). */
export function readBtn(text, { small = false } = {}) {
  if (!canRead() || !String(text || '').trim()) return '';
  return `<button type="button" class="hr-readbtn${small ? ' small' : ''}" data-hrread="${esc(text)}" aria-pressed="false" aria-label="${esc(ts('readLabel'))}">${iconHtml('🔊', { size: small ? 16 : 18 })}<span>${esc(ts('read'))}</span></button>`;
}
let watch = null;
function done() { clearInterval(watch); watch = null; for (const b of document.querySelectorAll('[data-hrread][aria-pressed="true"]')) b.setAttribute('aria-pressed', 'false'); }
/** Read buttons inside root start and stop reading (one at a time). */
export function wireRead(root) {
  root.addEventListener('click', e => {
    const b = e.target.closest('[data-hrread]'); if (!b) return;
    e.preventDefault(); e.stopPropagation();
    if (b.getAttribute('aria-pressed') === 'true') { stopReading(); done(); return; }
    done();
    if (!readAloud({ text: b.dataset.hrread, lang: lang() })) return;
    b.setAttribute('aria-pressed', 'true');
    const ss = window.speechSynthesis;
    watch = setInterval(() => { if (!ss.speaking && !ss.pending) done(); }, 400);
  }, true);
}
/** Bigger text on an element (the desk, the game page). */
export const bigText = (el, on) => { if (el) el.classList.toggle('hr-big', !!on); };

// ---------------------------------------------------------------- a game's page
function onPlayPage(sup) {
  bigText(document.body, sup.big);
  if (!sup.read) return;
  const note = document.querySelector('.playnote');
  const text = note && (note.querySelector('.playnote-full') || note.querySelector('.playnote-t'));
  const html = text ? readBtn(text.textContent.trim(), { small: true }) : '';
  if (!html) return;
  note.querySelector('summary').insertAdjacentHTML('beforeend', html);
  wireRead(note);
}
const D = pageData();
if (D && D.hrSupport && typeof D.hrSupport === 'object' && document.body.classList.contains('playmode')) onPlayPage(D.hrSupport);
