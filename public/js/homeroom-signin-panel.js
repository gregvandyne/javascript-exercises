// Homeroom's class sign-in box, for the class's teachers (docs/decisions.md "Homeroom, step 1c"): the big QR code of
// /hr#<code>, the short address and the code, when it closes, Keep open longer and Close sign-in, or Open sign-in when it
// is closed (POST /api/homeroom/<class>/signin). On the Sign-in panel (/class/<id>/homeroom/signin, #hs-code) and in the
// Homeroom board's "Students sign in" sheet (public/js/homeroom.js signinSheet).
import { t, api, toast, esc, pageData } from '/js/app.js';
import { iconHtml } from '/js/icons.js';

const tp = (k, v) => t(`js.homeroom-signin-panel.${k}`, v);
const btn = (cls, attrs, label) => `<button type="button" class="${cls}" ${attrs}>${label}</button>`;
/** "ABC DEF": the code in two halves, easy to read from the back of the room. */
export const spaced = code => `${code.slice(0, 3)} ${code.slice(3)}`;
const timeOf = ms => { try { return new Date(ms).toLocaleTimeString(document.documentElement.lang || undefined, { hour: 'numeric', minute: '2-digit' }); } catch { return ''; } };

function boxHtml(v, { panelLink = '' } = {}) {
  if (!v || !v.open) {
    return `<div class="hs-closed"><p class="hs-closedt">${iconHtml('🔒', { size: 22 })} <b>${esc(tp('closed'))}</b></p>
      <p class="small muted">${esc(tp('closedHint'))}</p>
      <div class="row hs-codeacts">${btn('btn hr-chunk hr-spark', 'data-hssign="open"', `${iconHtml('🔑', { size: 18 })} ${esc(tp('open'))}`)}${panelLink}</div></div>`;
  }
  return `<div class="hs-open">
    <div class="hs-qr">${v.qr || ''}</div>
    <div class="hs-codecol">
      <p class="hs-go">${esc(tp('goTo'))} <b dir="ltr">${esc(v.shown)}</b></p>
      <p class="hs-codecap">${esc(tp('enterCode'))}</p>
      <p class="hs-code" dir="ltr" aria-label="${esc(tp('codeIs', { code: v.code.split('').join(' ') }))}">${esc(spaced(v.code))}</p>
      <p class="small muted hs-until">${esc(tp('until', { time: timeOf(v.until) }))}</p>
      <div class="row hs-codeacts">${btn('btn hr-chunk', 'data-hssign="open"', `${iconHtml('⏱️', { size: 18 })} ${esc(tp('longer'))}`)}${btn('btn hr-chunk', 'data-hssign="close"', `${iconHtml('🔒', { size: 18 })} ${esc(tp('close'))}`)}${panelLink}</div>
    </div></div>`;
}

/** Draw the box into el and keep it working. -> { refresh } */
export function signinBox(el, classId, v, { panelLink = false } = {}) {
  const link = panelLink ? `<a class="btn hr-chunk" href="/class/${esc(encodeURIComponent(classId))}/hub/signin">${iconHtml('⚙️', { size: 18 })} ${esc(tp('settings'))}</a>` : '';
  let cur = v, busy = false;
  const draw = () => { el.innerHTML = boxHtml(cur, { panelLink: link }); };
  el.addEventListener('click', async e => {
    const b = e.target.closest('[data-hssign]'); if (!b || busy) return;
    busy = true;
    try { const r = await api(`/api/homeroom/${encodeURIComponent(classId)}/signin`, { method: 'POST', body: { action: b.dataset.hssign } }); cur = r.signin; draw(); if (r.toast) toast(r.toast); }
    catch (err) { toast(err.message, { bad: true }); } finally { busy = false; }
  });
  draw();
  return { refresh: async () => { try { cur = (await api(`/api/homeroom/${encodeURIComponent(classId)}/signin`)).signin; draw(); } catch { /* keep what is shown */ } } };
}

const own = document.getElementById('hs-code');
if (own) { const D = pageData(); signinBox(own, D.classId, D.signin); }
