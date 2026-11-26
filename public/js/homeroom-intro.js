// A student's intro card, the first time they open their desk (docs/decisions.md "Homeroom: onboarding, Needs a look,
// Oomba follow-ups"; server: services/homeroom-intro.js, POST /api/desk/<class>/intro, once per student, kept on the
// server so a shared Chromebook does not show it twice). Where things are (My desk, Raise hand, the notebook, the dock's
// teacher's area, Library and See the room) and "Your teacher can see your screen in Homeroom". In K-2 mode: big
// pictures, a few words each, and Read to me on every line (the device's own voice, public/js/tts.js; nothing is sent).
import { t, api, esc } from '/js/app.js';
import { iconHtml } from '/js/icons.js';
import { readBtn, wireRead } from '/js/homeroom-support.js';

const ti = (k, v) => t(`js.homeroom-intro.${k}`, v);

/** ctx: { D (page data: classId, notebook), k2 }. Shows the card; Got it (or Escape) closes it for good. */
export function deskIntro({ D, k2 = false }) {
  const rows = [['desk', '🎒'], ['hand', '✋'], ...(D.notebook ? [['notebook', '📝']] : []), ['dock', '🧭'], ['seen', '👀']];
  const k = id => (k2 ? `k2.${id}` : id);
  const bg = document.createElement('div');
  bg.className = `hd-intro-bg${k2 ? ' k2' : ''}`;
  bg.innerHTML = `<div class="hd-intro" role="dialog" aria-modal="true" aria-labelledby="hd-introh">
    <h2 class="hd-introh" id="hd-introh">${iconHtml('👋', { size: k2 ? 40 : 28 })} <span>${esc(ti(k('title')))}</span></h2>
    <ul class="plain hd-introlist">${rows.map(([id, ic]) => `<li class="hd-introrow"><span class="hd-introic" aria-hidden="true">${iconHtml(ic, { size: k2 ? 52 : 28 })}</span>
      <span class="hd-introt">${k2 ? '' : `<b>${esc(ti(`${id}Title`))}</b> `}<span>${esc(ti(k(id)))}</span></span>${k2 ? readBtn(ti(k(id)), { small: true }) : ''}</li>`).join('')}</ul>
    <div class="hd-introacts"><button type="button" class="btn btn-primary${k2 ? ' btn-big' : ''}" data-intro="ok">${iconHtml('👍', { size: k2 ? 28 : 18 })} ${esc(ti(k('ok')))}</button></div></div>`;
  document.body.appendChild(bg);
  wireRead(bg);
  const done = () => {
    bg.remove(); document.removeEventListener('keydown', key, true);
    api(`/api/desk/${encodeURIComponent(D.classId)}/intro`, { method: 'POST', body: { done: true }, background: true }).catch(() => {});
  };
  const key = e => { if (e.key === 'Escape') { e.stopPropagation(); done(); } };
  bg.addEventListener('click', e => { if (e.target.closest('[data-intro="ok"]')) done(); });
  document.addEventListener('keydown', key, true);
  setTimeout(() => bg.querySelector('[data-intro="ok"]')?.focus(), 30);
  return { close: done };
}
