// /join (server/views/live.js joinBody; docs/live-protocol.md "Page hooks"). One box for a live game code (7 digits) or,
// when Google sign-in is on, a class code (6 characters: the form goes on to the class-code flow, unchanged).
// A live code: the code from the QR's #fragment fills the box (and leaves the address bar at once: the fragment is
// never sent to the server, and the code never sits in history). Signed-in players choose "Join as me" or "Not you? Play
// as a guest" (shared Chromebooks); guests get a generated nickname and a random character, with "Pick another". There
// is no text field for a name anywhere. The seat token goes to sessionStorage only (no cookie).
import { api, t } from '/js/app.js';
import { readJson, portraits, avatarCanvas } from '/js/live-common.js';

const D = readJson('lv-join-data');
const $ = id => document.getElementById(id);
const form = $('lv-join'), input = $('jc'), err = $('lv-err');
const steps = { code: $('lv-code-step'), who: $('lv-who-step'), card: $('lv-card-step') };
let code = '', seat = null, joined = null, pics = null;
const LIVE_RE = /^\d{7}$/, CLASS_RE = /^[A-Za-z0-9]{6}$/;

function show(step) {
  for (const [k, el] of Object.entries(steps)) if (el) el.hidden = k !== step;
  const first = steps[step] && steps[step].querySelector('h1, h2, button');
  if (first && step !== 'code') { if (!first.hasAttribute('tabindex') && /^H/.test(first.tagName)) first.setAttribute('tabindex', '-1'); first.focus(); }
}
function say(el, code2, extra) {
  if (!el) return;
  el.textContent = (D.msgs && D.msgs[code2]) || t('js.app.wentWrong');
  if (code2 === 'signIn' && D.signInHref) { const a = document.createElement('a'); a.href = D.signInHref; a.className = 'btn btn-sm lv-signin'; a.textContent = t('js.live-join.signIn'); el.append(' ', a); }
  if (extra) el.append(' ', extra);
}

// The code from a QR (/join#1234567): into the box, then out of the address bar.
const fromHash = (location.hash || '').replace(/^#/, '').replace(/[\s-]/g, '');
if (/^\d{7}$/.test(fromHash) && input) { input.value = fromHash; history.replaceState(null, '', location.pathname + location.search); }

form && form.addEventListener('submit', e => {
  const v = String(input.value || '').replace(/[\s-]/g, '');
  if (CLASS_RE.test(v) && !LIVE_RE.test(v) && D.googleOn) return;   // a class code: the class flow takes it from here
  e.preventDefault();
  err.textContent = '';
  if (!LIVE_RE.test(v)) { say(err, 'badCode'); input.setAttribute('aria-invalid', 'true'); input.focus(); return; }
  input.removeAttribute('aria-invalid');
  code = v;
  if (D.signedIn) { show('who'); const row = $('lv-use-mine-row'); if (row) row.hidden = false; const g = $('lv-as-guest'); if (g) g.hidden = false; return; }
  join({});
});
$('lv-as-me') && $('lv-as-me').addEventListener('click', () => join({ useMine: !!($('lv-use-mine') && $('lv-use-mine').checked) }, $('lv-who-err')));
$('lv-as-guest') && $('lv-as-guest').addEventListener('click', () => join({ asGuest: true }, $('lv-who-err')));

let busy = false;
async function join(opts, errEl = err) {
  if (busy) return; busy = true;
  errEl.textContent = '';
  try {
    const r = await api('/api/live/join', { method: 'POST', body: { code, ...opts } });
    if (sessionStorage.getItem(`lv:removed:${r.sid}`)) { show('code'); say(err, 'removed'); return; }
    joined = r; seat = r;
    try { sessionStorage.setItem(`lv:${r.sid}`, r.tok); } catch { /* private mode: the play page asks again */ }
    if (r.canReroll) { card(r); show('card'); } else location.href = r.play;
  } catch (e) {
    const c = e.data && e.data.code;
    show('code');
    if (c) say(err, c); else err.textContent = e.message;
    input && input.focus();
  } finally { busy = false; }
}

function card(r) {
  const box = $('lv-avatar');
  if (box) {
    if (!pics) pics = portraits(D.kit);
    let cv = box.querySelector('canvas'); if (!cv) { cv = avatarCanvas('lv-av-big', 160); box.append(cv); }
    pics.draw(cv, r.avatar, 160);
  }
  const nick = $('lv-nick'); if (nick) nick.textContent = r.name || (D.nicks || [])[r.nick] || '';
}
$('lv-reroll') && $('lv-reroll').addEventListener('click', async () => {
  if (!joined) return;
  const b = $('lv-reroll'); b.disabled = true; $('lv-card-err').textContent = '';
  try { const r = await api('/api/live/reroll', { method: 'POST', body: { tok: joined.tok } }); Object.assign(joined, r); card(joined); }
  catch (e) { const c = e.data && e.data.code; if (c) say($('lv-card-err'), c); else $('lv-card-err').textContent = e.message; }
  finally { b.disabled = false; }
});
$('lv-go') && $('lv-go').addEventListener('click', () => { if (joined) location.href = joined.play; });
