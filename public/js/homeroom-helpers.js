// Homeroom, step 3c, on the teacher's board (docs/decisions.md "Homeroom: supports, aides and sub links"; server:
// services/homeroom-supports.js, homeroom-aides.js, homeroom-sub.js, routes/homeroom.js):
//   - a desk's menu (tap the student's name on their desk): their supports (Extra time 1.5x or 2x, Read aloud, Simpler
//     wording, Bigger text), which apply to every handout on that desk; then their handouts, and a look at the desk
//     while live. An aide sees the supports but cannot change them. The desk shows a small, calm 🧩 when a student has
//     any (the teacher's and the aide's board only: never a desk, See the room or the projector);
//   - a handout's simpler wording (from the desk's sheet): typed here, or written by Oomba in the chat (the chat opens
//     with the request ready; Oomba never sees a name);
//   - Aides (⋯ menu): invite by link (sent by the teacher's own email) or add a teacher of the school; remove any time;
//   - Sub link for today (⋯ menu): a link for one day with an optional PIN and a note for the sub; revoke any time;
//   - "While you were out": what a sub did, in short, the next time the teacher opens Homeroom, until Got it.
//   - step 4c: a desk's menu marks the student Absent or At home today (an aide sees it, never changes it), and their own
//     K-2 desk (as the class, on, off); a sub's attendance marks in "While you were out".
//   - step 4a: Notebook in a desk's menu, the student's notebook read only (public/js/notebook.js; not for an aide)
import { t, api, toast, esc, sheet, ask } from '/js/app.js';
import { iconHtml } from '/js/icons.js';
import * as BUS from '/js/oomba-bus.js';

/** A student's notebook, read only (public/js/notebook.js; the class's teachers only, never an aide or a sub). */
const openNotebook = (sid, name) => import(`/js/notebook.js${new URL(import.meta.url).search}`).then(m => m.viewNotebook(sid, name)).catch(() => toast(t('js.app.wentWrong')));
const tx = (k, v) => t(`js.homeroom-helpers.${k}`, v);
const btn = (cls, attrs, label) => `<button type="button" class="${cls}" ${attrs}>${label}</button>`;
const ic = (e, size = 18) => iconHtml(e, { size });
export const anySup = s => !!s && (s.time > 100 || s.read || s.simple || s.big);
const supList = s => [s.time > 100 ? tx(`sup.time${s.time}`) : '', s.read ? tx('sup.read') : '', s.simple ? tx('sup.simple') : '', s.big ? tx('sup.big') : ''].filter(Boolean);
/** The desk's small support icon (the teacher's and an aide's board only). */
export function supIcon(s, name) {
  if (!anySup(s)) return '';
  const what = supList(s).join(', ');
  return `<span class="hr-supico" role="img" aria-label="${esc(tx('hasSupports', { name, what }))}" title="${esc(what)}">${ic('🧩', 14)}</span>`;
}
const fmt = (at, o) => { try { return new Intl.DateTimeFormat(document.documentElement.lang || undefined, o).format(new Date(at)); } catch { return ''; } };
const dayOf = at => fmt(at, { weekday: 'long', month: 'short', day: 'numeric' });
const timeOf = at => fmt(at, { hour: 'numeric', minute: '2-digit' });
/** A link that ends at midnight here ends with the day ("the end of the day", never "12:00 AM"). */
const endsAt = at => { const d = new Date(at); return d.getHours() === 0 && d.getMinutes() === 0 ? tx('endOfDay') : timeOf(at); };

/**
 * ctx: { D, H, api2(path), aide, nameOfId(sid), renderDesks(), deskSheet(sid), look(sid) | null, live() }.
 * -> { deskMenu(sid), simplerSheet(handout), aidesSheet(), subSheet(), notes() }
 */
export function helpers(ctx) {
  const { D, H } = ctx;
  H.sup = D.supports || {};
  H.simples = D.simples || {};

  // ---------------------------------------------------------------- a desk's menu: supports
  function deskMenu(sid) {
    const name = ctx.nameOfId(sid); if (!name) return;
    let s = { time: 100, read: false, simple: false, big: false, ...(H.sup[sid] || {}) };
    const ro = ctx.aide;
    const toggle = (k, icon) => `<label class="hr-suprow${ro ? ' ro' : ''}"><input type="checkbox" data-sup="${k}"${s[k] ? ' checked' : ''}${ro ? ' disabled' : ''}><span class="hr-supico2" aria-hidden="true">${ic(icon, 22)}</span><span class="hr-supt"><b>${esc(tx(`sup.${k}`))}</b><span class="small muted">${esc(tx(`sup.${k}Hint`))}</span></span></label>`;
    // today's attendance and their own K-2 desk (step 4c)
    const attSeg = () => { const a = ctx.att ? ctx.att(sid) : ''; return ro ? `<p class="hr-dmatt"><span class="hr-attchip ${a || 'here'}">${esc(tx(a ? `att.${a}` : 'att.here'))}</span></p>`
      : `<span class="hr-seg hr-attseg" role="radiogroup" aria-labelledby="hr-dmattl">${[['', '✅'], ['absent', '📅'], ['home', '🏠']].map(([k, icon]) => btn(`hr-segb${a === k ? ' on' : ''}`, `role="radio" aria-checked="${a === k}" data-dmatt="${k}"`, `${ic(icon, 16)} ${esc(tx(k ? `att.${k}` : 'att.here'))}`)).join('')}</span>`; };
    const k2Of = () => (H.k2Students || {})[sid] || '';
    const k2Seg = () => `<span class="hr-seg" role="radiogroup" aria-labelledby="hr-dmk2l">${['', 'on', 'off'].map(m => btn(`hr-segb${k2Of() === m ? ' on' : ''}`, `role="radio" aria-checked="${k2Of() === m}" data-dmk2="${m}"`, esc(m ? tx(`k2.${m}`) : tx((H.k2 || {}).on ? 'k2.classOn' : 'k2.classOff')))).join('')}</span>`;
    const top = () => `<div class="hr-dmtop"><div class="hr-suprow hr-dmrow"><span class="hr-supico2" aria-hidden="true">${ic('📋', 22)}</span><span class="hr-supt"><b id="hr-dmattl">${esc(tx('att.today'))}</b><span class="small muted">${esc(tx('att.hint'))}</span></span>${attSeg()}</div>
      ${ro ? '' : `<div class="hr-suprow hr-dmrow"><span class="hr-supico2" aria-hidden="true">${ic('🧒', 22)}</span><span class="hr-supt"><b id="hr-dmk2l">${esc(tx('k2.desk'))}</b><span class="small muted">${esc(tx('k2.hint'))}</span></span>${k2Seg()}</div>`}</div>`;
    const draw = () => `${top()}<div class="hr-supbox">
      <h3 class="hr-flsub">${ic('🧩', 20)} ${esc(tx('supports'))}</h3>
      <p class="small muted">${esc(tx(ro ? 'supLeadAide' : 'supLead', { name }))}</p>
      <div class="hr-suprow hr-suptime${ro ? ' ro' : ''}"><span class="hr-supico2" aria-hidden="true">${ic('⏳', 22)}</span><span class="hr-supt"><b id="hr-suptimel">${esc(tx('sup.time'))}</b><span class="small muted">${esc(tx('sup.timeHint'))}</span></span>
        <span class="hr-seg" role="radiogroup" aria-labelledby="hr-suptimel">${[100, 150, 200].map(v => btn(`hr-segb${s.time === v ? ' on' : ''}`, `role="radio" aria-checked="${s.time === v}" data-suptime="${v}"${ro ? ' disabled' : ''}`, esc(v === 100 ? tx('sup.off') : tx(`sup.x${v}`)))).join('')}</span></div>
      ${toggle('read', '🔊')}${toggle('simple', '✏️')}${toggle('big', '🔍')}
      <p class="small muted hr-supnote">${ic('🔒', 14)} ${esc(tx('supPrivate'))}</p>
      ${ro ? '' : `<p class="err" id="hr-superr" aria-live="polite"></p><div class="row hr-supacts">${btn('btn btn-primary', 'data-supsave', esc(tx('saveSupports')))}</div>`}
    </div>
    <div class="row hr-dmacts">${btn('btn hr-chunk', 'data-dm="desk"', `${ic('🎒')} ${esc(tx('handouts'))}`)}${ro ? '' : btn('btn hr-chunk', 'data-dm="notebook"', `${ic('📝')} ${esc(tx('notebook'))}`)}${ctx.live() && ctx.look ? btn('btn hr-chunk', 'data-dm="look"', `${ic('👀')} ${esc(tx('lookAt'))}`) : ''}</div>`;
    const sh = sheet({ title: `🎒 ${name}`, content: `<div class="hr-dmenu">${draw()}</div>` });
    const box = sh.el.querySelector('.hr-dmenu');
    box.addEventListener('click', async e => {
      const ab = e.target.closest('[data-dmatt]');
      if (ab && !ro && ctx.markAtt) { if (await ctx.markAtt(sid, ab.dataset.dmatt)) box.querySelector('.hr-dmtop').outerHTML = top(); return; }
      const kb = e.target.closest('[data-dmk2]');
      if (kb && !ro) {
        try { const r = await api(ctx.api2('k2'), { method: 'POST', body: { studentId: sid, mode: kb.dataset.dmk2 } }); H.k2Students = r.k2Students || {}; H.k2 = r.k2 || H.k2; box.querySelector('.hr-dmtop').outerHTML = top(); toast(r.toast); }
        catch (err) { toast(err.message, { bad: true }); }
        return;
      }
      const tb = e.target.closest('[data-suptime]');
      if (tb && !ro) { s.time = +tb.dataset.suptime; for (const b of box.querySelectorAll('[data-suptime]')) { const on = b === tb; b.classList.toggle('on', on); b.setAttribute('aria-checked', String(on)); } return; }
      const dm = e.target.closest('[data-dm]');
      if (dm) { sh.close(); if (dm.dataset.dm === 'desk') ctx.deskSheet(sid); else if (dm.dataset.dm === 'notebook') openNotebook(sid, name); else ctx.look(sid); return; }
      if (e.target.closest('[data-supsave]')) {
        for (const c of box.querySelectorAll('[data-sup]')) s[c.dataset.sup] = c.checked;
        try {
          const r = await api(ctx.api2('supports'), { method: 'POST', body: { studentId: sid, ...s } });
          H.sup = r.supports || {}; ctx.renderDesks(); sh.close(); toast(r.toast);
        } catch (err) { box.querySelector('#hr-superr').textContent = err.message; }
      }
    });
  }

  // ---------------------------------------------------------------- a handout's simpler wording
  function askOomba(h) {
    if (!BUS.chat()) { toast(tx('noChat')); return; }
    BUS.whenChat(c => {
      c.setMode('open');
      setTimeout(() => { const el = document.getElementById('oc-in'); if (el) { el.value = tx('askText', { title: h.title }); el.dispatchEvent(new Event('input', { bubbles: true })); el.focus(); } }, 60);
    });
  }
  function simplerSheet(h) {
    if (!h) return;
    const max = D.simpleMax || 300, cur = H.simples[h.id] || '';
    const sh = sheet({ title: `✏️ ${tx('simplerTitle', { title: h.title })}`, content: `<form class="hr-simpler" novalidate>
      <p class="small muted">${esc(tx('simplerLead'))}</p>
      ${h.instructions ? `<p class="hr-label">${esc(tx('original'))}</p><p class="hr-dins" dir="auto">${esc(h.instructions)}</p>` : `<p class="small muted">${esc(tx('noOriginal'))}</p>`}
      <label class="hr-label" for="hr-simpin">${esc(tx('simpler'))}</label>
      <textarea class="input hr-ins" id="hr-simpin" rows="3" maxlength="${max}" placeholder="${esc(tx('simplerPh'))}">${esc(cur)}</textarea>
      <p class="small muted hr-count" id="hr-simpcount" aria-live="polite">${esc(tx('left', { count: max - cur.length }))}</p>
      <p class="small muted">${ic('🔒', 14)} ${esc(tx('simplerPrivate'))}</p>
      <p class="err" id="hr-simperr" aria-live="polite"></p>
      <div class="row hr-giveacts">${D.chat ? btn('btn', 'data-simp="oomba"', `${ic('💬', 16)} ${esc(tx('askOomba'))}`) : ''}${cur ? btn('btn', 'data-simp="clear"', esc(tx('remove'))) : ''}<button class="btn btn-primary" type="submit">${esc(tx('save'))}</button></div></form>` });
    const f = sh.el.querySelector('form'), inp = f.querySelector('#hr-simpin');
    inp.addEventListener('input', () => { f.querySelector('#hr-simpcount').textContent = tx('left', { count: Math.max(0, max - inp.value.length) }); });
    const save = async text => {
      try { const r = await api(ctx.api2(`handouts/${encodeURIComponent(h.id)}/simpler`), { method: 'POST', body: { text } }); H.simples = r.simples || {}; sh.close(); toast(r.toast); ctx.onSimples && ctx.onSimples(); }
      catch (err) { f.querySelector('#hr-simperr').textContent = err.message; }
    };
    f.addEventListener('click', e => { const b = e.target.closest('[data-simp]'); if (!b) return; if (b.dataset.simp === 'oomba') { sh.close(); askOomba(h); } else save(''); });
    f.addEventListener('submit', e => { e.preventDefault(); save(inp.value); });
    requestAnimationFrame(() => inp.focus());
  }

  // ---------------------------------------------------------------- aides
  async function aidesSheet() {
    let data = { aides: (D.helpers || {}).aides || [], staff: [] }, made = null;
    const sh = sheet({ title: `🤝 ${tx('aides')}`, content: '<div class="hr-aides"></div>' });
    const box = sh.el.querySelector('.hr-aides');
    const row = a => `<li class="hr-aiderow"><span class="hr-aidewho">${ic(a.status === 'active' ? '🧑‍🏫' : '✉️', 20)} <span><b dir="auto">${esc(a.status === 'active' ? a.name : a.email || tx('inviteLink'))}</b><span class="small muted">${esc(a.status === 'active' ? tx('aideSince', { day: dayOf(a.at) }) : tx('inviteUntil', { day: dayOf(a.until) }))}</span></span></span>${btn('btn btn-sm', `data-aiderm="${esc(a.id)}" aria-label="${esc(tx('removeAide', { name: a.name || a.email || tx('inviteLink') }))}"`, esc(tx('remove')))}</li>`;
    const draw = () => {
      const full = data.aides.length >= ((D.helpers || {}).aidesMax || 10);
      box.innerHTML = `<p class="small muted">${esc(tx('aidesLead'))}</p>
        <ul class="hr-aidecan small"><li>${ic('✅', 14)} ${esc(tx('aideCan'))}</li><li>${ic('🚫', 14)} ${esc(tx('aideCannot'))}</li></ul>
        ${data.aides.length ? `<ul class="plain hr-aidelist">${data.aides.map(row).join('')}</ul>` : `<p class="muted">${esc(tx('noAides'))}</p>`}
        ${made ? `<div class="hr-linkbox" role="status"><p class="hr-label">${esc(tx('inviteMade'))}</p><div class="row hr-linkrow"><input class="input" readonly value="${esc(made.url)}" id="hr-aidelink" aria-label="${esc(tx('inviteLink'))}">${btn('btn', 'data-copy="hr-aidelink"', `${ic('📋', 16)} ${esc(tx('copy'))}`)}<a class="btn" href="mailto:${esc(encodeURIComponent(made.email || ''))}?subject=${esc(encodeURIComponent(tx('mailSubject', { class: D.className })))}&body=${esc(encodeURIComponent(tx('mailBody', { class: D.className, url: made.url })))}">${ic('✉️', 16)} ${esc(tx('emailIt'))}</a></div><p class="small muted">${esc(tx('inviteOnce'))}</p></div>` : ''}
        ${full ? `<p class="small muted">${esc(tx('aidesFull'))}</p>` : `<h3 class="hr-flsub">${esc(tx('byLink'))}</h3>
        <form class="row hr-aideform" data-aform="invite" novalidate><label class="sr-only" for="hr-aidemail">${esc(tx('email'))}</label><input class="input" type="email" id="hr-aidemail" placeholder="${esc(tx('emailPh'))}" autocomplete="off"><button class="btn btn-primary" type="submit">${esc(tx('makeInvite'))}</button></form>
        <h3 class="hr-flsub">${esc(tx('fromSchool'))}</h3>
        ${data.staff.length ? `<form class="row hr-aideform" data-aform="add" novalidate><label class="sr-only" for="hr-aidestaff">${esc(tx('fromSchool'))}</label><select class="input" id="hr-aidestaff">${data.staff.map(p => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('')}</select><button class="btn" type="submit">${esc(tx('add'))}</button></form>` : `<p class="small muted">${esc(tx('noStaff'))}</p>`}`}
        <p class="err" id="hr-aideerr" aria-live="polite"></p>`;
    };
    const call = async b => {
      try { const r = await api(ctx.api2('aides'), { method: 'POST', body: b }); data = { aides: r.aides, staff: r.staff }; if (r.url) made = { url: r.url, email: b.email || '' }; draw(); toast(r.toast); }
      catch (err) { const el = box.querySelector('#hr-aideerr'); if (el) el.textContent = err.message; }
    };
    box.addEventListener('click', async e => {
      const rm = e.target.closest('[data-aiderm]');
      if (rm) { if (await ask({ title: tx('removeTitle'), text: tx('removeText'), ok: tx('remove') })) call({ action: 'remove', id: rm.dataset.aiderm }); return; }
      const cp = e.target.closest('[data-copy]'); if (cp) copy(cp.dataset.copy);
    });
    box.addEventListener('submit', e => {
      e.preventDefault(); const f = e.target.closest('[data-aform]'); if (!f) return;
      if (f.dataset.aform === 'invite') call({ action: 'invite', email: f.querySelector('input').value.trim() });
      else call({ action: 'add', userId: f.querySelector('select').value });
    });
    draw();
    try { const r = await api(ctx.api2('aides'), { background: true }); data = r; draw(); } catch { /* the list as the page had it */ }
  }
  async function copy(id) {
    const el = document.getElementById(id); if (!el) return;
    try { await navigator.clipboard.writeText(el.value); toast(tx('copied')); } catch { el.select(); toast(tx('copyHand')); }
  }

  // ---------------------------------------------------------------- sub links
  function subSheet() {
    let links = (D.helpers || {}).subLinks || [], made = null, day = 'today';
    const max = (D.helpers || {}).noteMax || 600;
    const sh = sheet({ title: `🔗 ${tx('subTitle')}`, content: '<div class="hr-subsheet"></div>' });
    const box = sh.el.querySelector('.hr-subsheet');
    const stateText = l => tx(`subState.${l.state}`);
    const linkRow = l => `<li class="hr-aiderow"><span class="hr-aidewho">${ic(l.state === 'active' ? '🟢' : '🔗', 18)} <span><b>${esc(dayOf(l.startsAt))}</b><span class="small muted">${esc([stateText(l), tx('until', { time: endsAt(l.endsAt) }), l.pin ? tx('withPin') : '', l.used ? tx('used') : ''].filter(Boolean).join(' · '))}</span></span></span>${['active', 'later'].includes(l.state) ? btn('btn btn-sm', `data-subrv="${esc(l.id)}"`, esc(tx('revoke'))) : ''}</li>`;
    const draw = () => {
      box.innerHTML = `<p class="small muted">${esc(tx('subLead'))}</p>
        <ul class="hr-aidecan small"><li>${ic('✅', 14)} ${esc(tx('subCan'))}</li><li>${ic('🚫', 14)} ${esc(tx('subCannot'))}</li></ul>
        ${made ? `<div class="hr-linkbox" role="status"><p class="hr-label">${esc(tx('subMade', { day: dayOf(made.link.startsAt), time: endsAt(made.link.endsAt) }))}</p><div class="row hr-linkrow"><input class="input" readonly value="${esc(made.url)}" id="hr-sublink" aria-label="${esc(tx('subTitle'))}">${btn('btn', 'data-copy="hr-sublink"', `${ic('📋', 16)} ${esc(tx('copy'))}`)}</div><p class="small muted">${esc(made.link.pin ? tx('pinApart') : tx('subOnce'))}</p></div>` : ''}
        <form class="hr-subform" novalidate>
          <p class="hr-label" id="hr-subdayl">${esc(tx('dayLabel'))}</p>
          <div class="hr-seg" role="radiogroup" aria-labelledby="hr-subdayl">${['today', 'tomorrow'].map(d => btn(`hr-segb${day === d ? ' on' : ''}`, `role="radio" aria-checked="${day === d}" data-subday="${d}"`, esc(tx(`day.${d}`)))).join('')}</div>
          <div class="hr-subfields"><label><span class="hr-label">${esc(tx('ends'))}</span><input class="input" type="time" id="hr-subuntil"><span class="small muted">${esc(tx('endsHint'))}</span></label>
            <label><span class="hr-label">${esc(tx('pin'))}</span><input class="input" id="hr-subpin" inputmode="numeric" maxlength="8" pattern="[0-9]*" autocomplete="off" dir="ltr"><span class="small muted">${esc(tx('pinHint'))}</span></label></div>
          <label class="hr-label" for="hr-subnote">${esc(tx('note'))}</label>
          <textarea class="input hr-ins" id="hr-subnote" rows="4" maxlength="${max}" placeholder="${esc(tx('notePh'))}"></textarea>
          <p class="err" id="hr-suberr" aria-live="polite"></p>
          <div class="row hr-giveacts"><button class="btn btn-primary" type="submit">${ic('🔗', 16)} ${esc(tx('makeLink'))}</button></div></form>
        ${links.length ? `<h3 class="hr-flsub">${esc(tx('links'))}</h3><ul class="plain hr-aidelist">${links.map(linkRow).join('')}</ul>` : ''}`;
    };
    box.addEventListener('click', async e => {
      const d = e.target.closest('[data-subday]');
      if (d) { day = d.dataset.subday; for (const b of box.querySelectorAll('[data-subday]')) { const on = b === d; b.classList.toggle('on', on); b.setAttribute('aria-checked', String(on)); } return; }
      const cp = e.target.closest('[data-copy]'); if (cp) { copy(cp.dataset.copy); return; }
      const rv = e.target.closest('[data-subrv]');
      if (rv && await ask({ title: tx('revokeTitle'), text: tx('revokeText'), ok: tx('revoke') })) {
        try { const r = await api(ctx.api2('sub-links'), { method: 'POST', body: { action: 'revoke', id: rv.dataset.subrv } }); links = r.subLinks; D.helpers.subLinks = links; made = null; draw(); toast(r.toast); } catch (err) { toast(err.message, { bad: true }); }
      }
    });
    box.addEventListener('submit', async e => {
      e.preventDefault();
      const f = e.target.closest('.hr-subform'); if (!f) return;
      let tz = ''; try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch { /* the school's or UTC */ }
      try {
        const r = await api(ctx.api2('sub-links'), { method: 'POST', body: { action: 'create', day, until: f.querySelector('#hr-subuntil').value, pin: f.querySelector('#hr-subpin').value.trim(), note: f.querySelector('#hr-subnote').value, tz } });
        links = r.subLinks; D.helpers.subLinks = links; made = { url: r.url, link: r.link }; draw(); toast(r.toast);
        box.querySelector('#hr-sublink')?.select();
      } catch (err) { f.querySelector('#hr-suberr').textContent = err.message; }
    });
    draw();
  }

  // ---------------------------------------------------------------- While you were out
  const LINES = [['live:start', 'out.started'], ['hand:answer', 'out.answered'], ['hand:pass', 'out.passes'], ['hand:notNow', 'out.notNow'], ['plan:start', 'out.planStart'], ['plan:next', 'out.planNext'], ['plan:more', 'out.planMore'], ['live:pause', 'out.paused'], ['live:bring', 'out.brought'], ['live:end', 'out.ended'], ['attend:absent', 'out.absent'], ['attend:home', 'out.home'], ['hand:ask', 'out.asks']];
  function noteHtml(n) {
    const lines = LINES.filter(([k]) => n.counts[k]).map(([k, key]) => `<li>${esc(tx(key, { count: n.counts[k], time: timeOf(n.times[k] || n.last) }))}</li>`);
    return `<section class="hr-outnote" data-outnote="${esc(n.id)}" aria-labelledby="hr-out-${esc(n.id)}">
      <h2 id="hr-out-${esc(n.id)}">${ic('🧑‍🏫', 20)} ${esc(tx('out.title'))}</h2>
      <p class="small">${esc(tx('out.lead', { day: dayOf(n.first), from: timeOf(n.first), to: timeOf(n.last) }))}</p>
      ${lines.length ? `<ul class="hr-outlist">${lines.join('')}</ul>` : `<p class="small muted">${esc(tx('out.onlyLooked'))}</p>`}
      <div class="row">${btn('btn btn-sm btn-primary', `data-outseen="${esc(n.id)}"`, esc(tx('out.gotIt')))}</div></section>`;
  }
  function notes() {
    const list = (D.helpers || {}).notes || [];
    let el = document.getElementById('hr-outnotes');
    if (!list.length) { el?.remove(); return; }
    if (!el) { el = document.createElement('div'); el.id = 'hr-outnotes'; el.className = 'hr-outnotes'; document.querySelector('.hr-stage')?.appendChild(el); }
    el.innerHTML = list.slice(0, 2).map(noteHtml).join('');
    el.onclick = async e => {
      const b = e.target.closest('[data-outseen]'); if (!b) return;
      b.disabled = true;
      try { await api(ctx.api2('sub-links'), { method: 'POST', body: { action: 'seen', id: b.dataset.outseen } }); D.helpers.notes = list.filter(x => x.id !== b.dataset.outseen); notes(); }
      catch (err) { b.disabled = false; toast(err.message, { bad: true }); }
    };
  }
  return { deskMenu, simplerSheet, aidesSheet, subSheet, notes, supIcon: sid => supIcon(H.sup[sid], ctx.nameOfId(sid)) };
}
