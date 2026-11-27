// The class sign-in on a shared device (/hr; routes/homeroom-signin.js, services/homeroom-signin.js; docs/decisions.md
// "Homeroom, step 1c"): the class code (typed, or from the QR code: /hr#<code>), then the class's students as big name
// buttons, then the student proves it's them: their password, or their three pictures in order, or Sign in with Google.
// Then their desk. The code is kept in the address (#code), so "Not you? Switch" on the desk comes back to the names.
import { t, api, esc, pageData } from '/js/app.js';
import { iconHtml } from '/js/icons.js';

const D = pageData();
const ts = (k, v) => t(`js.homeroom-signin.${k}`, v);
const $ = id => document.getElementById(id);
const main = $('hs-main');
const PICS = D.pics || [], LEN = D.picLen || 3;
const S = { code: '', className: '', students: [], who: null, pics: [], busy: false };
const big = (cls, attrs, label) => `<button type="button" class="${cls}" ${attrs}>${label}</button>`;
const clean = v => String(v || '').toUpperCase().replace(/[\s-]/g, '');
const focus = sel => requestAnimationFrame(() => main.querySelector(sel)?.focus());

// ---------------------------------------------------------------- step 1: the code
const codeForm = main.innerHTML;
function showCode(msg = '') {
  S.who = null; S.students = []; S.code = '';
  main.innerHTML = codeForm;
  const f = $('hs-codeform');
  f.addEventListener('submit', e => { e.preventDefault(); openCode($('hs-codein').value); });
  if (msg) $('hs-codeerr').textContent = msg;
  focus('#hs-codein');
  try { history.replaceState(null, '', location.pathname); } catch { /* fine */ }
}
async function openCode(raw) {
  const code = clean(raw);
  if (code.length !== D.codeLen) { showCode(ts('codeLength', { n: D.codeLen })); if ($('hs-codein')) $('hs-codein').value = raw; return; }
  if (S.busy) return; S.busy = true;
  try {
    const r = await api('/api/hr/open', { method: 'POST', body: { code } });
    S.code = code; S.className = r.className; S.students = r.students || [];
    document.querySelector('.hs-ended')?.remove();
    try { history.replaceState(null, '', `${location.pathname}#${code}`); } catch { /* fine */ }
    showNames();
  } catch (e) { showCode(e.message); if ($('hs-codein')) $('hs-codein').value = raw; }
  finally { S.busy = false; }
}

// ---------------------------------------------------------------- step 2: the names
function googleHtml() {
  const tpl = $('hs-google'); if (!D.google || !tpl) return '';
  const box = document.createElement('div'); box.appendChild(tpl.content.cloneNode(true));
  const a = box.querySelector('a'); if (!a) return '';
  a.href = `/auth/google/start?hr=${encodeURIComponent(S.code)}`; a.classList.add('hs-google');
  return box.innerHTML;
}
function showNames() {
  S.who = null; S.pics = [];
  main.innerHTML = `<section class="hs-step hs-namestep" aria-labelledby="hs-nh">
    <p class="hs-class" dir="auto">${iconHtml('🏫', { size: 22 })} ${esc(S.className)}</p>
    <h1 class="hs-h" id="hs-nh">${esc(ts('tapName'))}</h1>
    ${S.students.length ? `<ul class="hs-names">${S.students.map(s => `<li>${big('hs-name', `data-k="${esc(s.k)}"`, `<bdi>${esc(s.name)}</bdi>`)}</li>`).join('')}</ul>` : `<p class="hs-lead">${esc(ts('noNames'))}</p>`}
    <p class="hs-lead small">${esc(ts('notThere'))}</p>
    ${googleHtml() ? `<div class="hs-gbox"><p class="small muted">${esc(ts('googleHint'))}</p>${googleHtml()}</div>` : ''}
    ${big('btn hs-back', 'data-hs="code"', `${iconHtml('🔢', { size: 18 })} ${esc(ts('otherCode'))}`)}
  </section>`;
  focus('.hs-name');
}

// ---------------------------------------------------------------- step 3: it's me
const hello = s => `<p class="hs-class" dir="auto">${iconHtml('🏫', { size: 22 })} ${esc(S.className)}</p><h1 class="hs-h hs-hello"><bdi>${esc(ts('hi', { name: s.name }))}</bdi></h1>`;
const notMe = () => big('btn hs-back', 'data-hs="names"', `<span class="flip" aria-hidden="true">←</span> ${esc(ts('notMe'))}`);
function pickName(k) {
  const s = S.students.find(x => x.k === k); if (!s) return;
  S.who = s; S.pics = [];
  if (s.how === 'picture') return showPictures();
  if (s.how === 'password') return showPassword();
  main.innerHTML = `<section class="hs-step">${hello(s)}
    ${s.how === 'google' && googleHtml() ? `<p class="hs-lead">${esc(ts('useGoogle'))}</p>${googleHtml()}` : `<p class="hs-lead">${iconHtml('🧑‍🏫', { size: 28 })} ${esc(ts('askTeacher'))}</p>`}
    ${notMe()}</section>`;
  focus('.hs-google, .hs-back');
}
function showPassword(msg = '') {
  const s = S.who;
  main.innerHTML = `<form class="hs-step" id="hs-pwform" novalidate>${hello(s)}
    <label class="hs-lead" for="hs-pw">${esc(ts('typePassword'))}</label>
    <span class="pw-row hs-pwrow"><input class="input hs-pwin" id="hs-pw" type="password" autocomplete="current-password" dir="ltr" autocapitalize="off" spellcheck="false" required>
      ${big('btn pw-toggle hs-show', 'data-hs="show" aria-controls="hs-pw" aria-pressed="false"', `${iconHtml('👁️', { size: 18 })} <span>${esc(ts('show'))}</span>`)}</span>
    <p class="err hs-err" id="hs-pwerr" aria-live="polite">${esc(msg)}</p>
    <button class="btn btn-primary hs-big" type="submit">${esc(ts('signIn'))}</button>
    ${notMe()}</form>`;
  $('hs-pwform').addEventListener('submit', e => { e.preventDefault(); signIn({ password: $('hs-pw').value }); });
  focus('#hs-pw');
}
function slotsHtml() {
  return Array.from({ length: LEN }, (_, i) => { const p = PICS.find(x => x.key === S.pics[i]); return `<span class="hs-slot${p ? ' on' : ''}" aria-hidden="true">${p ? p.html : `<span class="hs-slotn">${i + 1}</span>`}</span>`; }).join('');
}
function showPictures(msg = '') {
  const s = S.who;
  main.innerHTML = `<section class="hs-step hs-picstep" aria-labelledby="hs-ph">${hello(s)}
    <p class="hs-lead" id="hs-ph">${esc(ts('tapPictures', { n: LEN }))}</p>
    <div class="hs-slots" id="hs-slots" role="status" aria-live="polite" aria-label="${esc(ts('picked', { n: S.pics.length, total: LEN }))}">${slotsHtml()}</div>
    <p class="err hs-err" id="hs-picerr" aria-live="assertive">${esc(msg)}</p>
    <div class="hs-pics" role="group" aria-label="${esc(ts('pictures'))}">${PICS.map(p => big('hs-pic', `data-pic="${esc(p.key)}" aria-label="${esc(p.name)}"`, p.html)).join('')}</div>
    <div class="hs-picacts">${big('btn hs-undo', `data-hs="undo"${S.pics.length ? '' : ' disabled'}`, `${iconHtml('↩', { size: 18 })} ${esc(ts('undo'))}`)}${notMe()}</div>
  </section>`;
}
function pickPicture(key) {
  if (S.busy || S.pics.length >= LEN) return;
  S.pics.push(key);
  $('hs-slots').innerHTML = slotsHtml();
  $('hs-slots').setAttribute('aria-label', ts('picked', { n: S.pics.length, total: LEN }));
  $('hs-picerr').textContent = '';
  const u = main.querySelector('[data-hs="undo"]'); if (u) u.disabled = false;
  if (S.pics.length === LEN) signIn({ pics: S.pics });
}

// ---------------------------------------------------------------- signing in
const secs = n => ts('waitSecs', { n: Math.max(1, Math.ceil(n || 0)) });
async function signIn(proof) {
  if (S.busy || !S.who) return; S.busy = true;
  main.querySelector('.hs-step')?.classList.add('hs-busy');
  try {
    const r = await api('/api/hr/signin', { method: 'POST', body: { code: S.code, k: S.who.k, ...proof } });
    main.innerHTML = `<section class="hs-step"><h1 class="hs-h">${iconHtml('🎒', { size: 40 })} ${esc(ts('welcome'))}</h1></section>`;
    location.href = r.redirect;
  } catch (e) {
    S.busy = false;
    const code = e.data && e.data.code;
    if (code === 'badCode') return showCode(e.message);
    const msg = code === 'wait' ? `${e.message} ${secs(e.data.wait)}` : e.message;
    if (S.who.how === 'picture') { S.pics = []; showPictures(msg); main.querySelector('.hs-slots')?.classList.add('hs-shake'); }
    else { showPassword(msg); }
  }
}

// ---------------------------------------------------------------- input
main.addEventListener('click', e => {
  const n = e.target.closest('[data-k]'); if (n) return pickName(n.dataset.k);
  const p = e.target.closest('[data-pic]'); if (p) return pickPicture(p.dataset.pic);
  const a = e.target.closest('[data-hs]'); if (!a) return;
  const k = a.dataset.hs;
  if (k === 'code') showCode();
  else if (k === 'names') showNames();
  else if (k === 'undo') { S.pics.pop(); showPictures(); }
  else if (k === 'show') {
    const inp = $('hs-pw'), on = inp.type === 'password';
    inp.type = on ? 'text' : 'password'; a.setAttribute('aria-pressed', String(on)); a.querySelector('span').textContent = ts(on ? 'hide' : 'show');
  }
});
const hashCode = () => { try { return clean(decodeURIComponent(location.hash.slice(1))); } catch { return ''; } };
// A code in the address (the QR code, or "Not you? Switch"), also when it arrives on this page already open.
window.addEventListener('hashchange', () => { const c = hashCode(); if (c && c !== S.code) openCode(c); });
if (hashCode()) openCode(hashCode()); else showCode();
