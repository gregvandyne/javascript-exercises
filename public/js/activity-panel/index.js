// The Studio's Activity panel (docs/canvas-api.md "The Activity panel"): a classroom activity's problems, how much help,
// problems in a set and what it is for, changed without a Builder message. Desktop: a Builder | Activity switch at the
// top of the Studio's left column. Phones: "🧮 Edit activity" opens it as a full-height sheet. Only for an Oomba Canvas
// activity's owner (the server sends S.activity to editors only). Changes collect until Save (Undo takes the last one
// back); routes/activity-panel.js saves them as a new version.
//   mountPanel(S, hooks) -> { dirty(), openSheet(), update(S) }
//   hooks: { state() (the Studio state now), applyState(st), showVersion(st) }
import { $, esc } from '/js/app.js';
import { P, E, clone, loadScript } from './shared.js';
import { renderList } from './list.js';
import { openEditor } from './editor.js';
import { renderGenerator, genOn } from './generator.js';
import { save, saveLabel } from './save.js';

const SUPPORTS = ['watch', 'count', 'guided', 'own'], PURPOSES = ['screen', 'worksheet', 'generator'];
const narrow = matchMedia('(max-width: 960px)');

export async function mountPanel(S0, H) {
  const A0 = S0.activity;
  await Promise.all([loadScript(A0.kitSrc), loadScript(A0.figures)]);
  const chat = $('.st-chat');
  const M = { sel: 0, genSeed: 7, genFrom: null, genRange: null, genKeep: null, genMore: false, helpMore: false, lastSave: null, drag: null };
  function load(A, S) {
    M.base = A.base; M.number = A.number; M.next = Math.max(0, ...(S.versions || []).map(v => v.number)) + 1;
    M.kit = A.kit; M.latest = A.latest;
    M.data = clone(A.data); if (!Array.isArray(M.data.problems)) M.data.problems = []; if (!M.data.config || typeof M.data.config !== 'object') M.data.config = {};
    M.changes = []; M.undo = []; M.fail = ''; M.stale = false; M.genKeep = M.data.gen ? clone(M.data.gen) : M.genKeep;
    M.sel = Math.min(M.sel, Math.max(0, M.data.problems.length - 1));
  }
  load(A0, S0);
  M.commit = (change, fn) => { M.undo.push({ data: clone(M.data), changes: clone(M.changes) }); fn(M.data); M.changes.push(change); M.fail = ''; };
  M.edit = i => openEditor(M, i);

  // ---- the place: a tab beside the Builder (desktop), a sheet (phones)
  const tabs = document.createElement('div'); tabs.className = 'st-lefttabs'; tabs.setAttribute('role', 'tablist'); tabs.setAttribute('aria-label', P('switchLabel'));
  tabs.innerHTML = `<button type="button" role="tab" id="ap-tab-b" aria-selected="true" aria-controls="st-log">🤖 ${E('builder')}</button><button type="button" role="tab" id="ap-tab-a" aria-selected="false" aria-controls="st-activity" tabindex="-1">🧮 ${E('activity')}</button>`;
  chat.prepend(tabs);
  const box = document.createElement('section'); box.id = 'st-activity'; box.className = 'ap'; box.setAttribute('aria-labelledby', 'ap-h');
  chat.append(box);
  const setTab = a => {
    chat.classList.toggle('ap-tab', a);
    $('#ap-tab-a').setAttribute('aria-selected', String(a)); $('#ap-tab-b').setAttribute('aria-selected', String(!a));
    $('#ap-tab-a').tabIndex = a ? 0 : -1; $('#ap-tab-b').tabIndex = a ? -1 : 0;
    try { localStorage.setItem('brb-ap-tab', a ? '1' : '0'); } catch { /* private mode */ }
  };
  tabs.addEventListener('click', e => { const b = e.target.closest('[role="tab"]'); if (b) setTab(b.id === 'ap-tab-a'); });
  tabs.addEventListener('keydown', e => { if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return; const a = !chat.classList.contains('ap-tab'); setTab(a); $(a ? '#ap-tab-a' : '#ap-tab-b').focus(); });
  let want = false; try { want = localStorage.getItem('brb-ap-tab') === '1'; } catch { /* private mode */ }
  setTab(want);
  function openSheet() { box.classList.add('is-sheet'); document.body.classList.add('ap-open'); render(); const h = $('#ap-h'); if (h) h.focus(); }
  function closeSheet() { box.classList.remove('is-sheet'); document.body.classList.remove('ap-open'); const b = $('[data-act="edit-activity"]'); if (b) b.focus(); }
  addEventListener('keydown', e => { if (e.key === 'Escape' && box.classList.contains('is-sheet') && !document.querySelector('.sheet-bg')) closeSheet(); });
  narrow.addEventListener('change', () => { if (!narrow.matches) closeSheet(); });

  // ---- drawing
  const tile = (name, key, on, dis, title, desc) => `<label class="ap-tile${on ? ' on' : ''}${dis ? ' dis' : ''}"><input type="checkbox" name="${name}" value="${key}"${on ? ' checked' : ''}${dis ? ' disabled' : ''}><span><b>${title}</b><small>${desc}</small></span></label>`;
  function render() {
    const d = M.data, c = d.config, S = H.state(), gen = !!d.gen;
    const supports = Array.isArray(c.supports) && c.supports.length ? c.supports : [c.support || 'guided'];
    const purpose = Array.isArray(c.purpose) && c.purpose.length ? c.purpose : ['screen'];
    const max = gen ? 12 : Math.max(1, Math.min(12, d.problems.length)), count = Math.min(max, Number.isInteger(c.count) ? c.count : 5);
    const busy = !!S.turn;
    box.innerHTML = `<div class="ap-head"><h2 id="ap-h" tabindex="-1">🧮 ${E('activity')}</h2><span class="muted small">${E('versionN', { n: M.number })}</span><button type="button" class="iconbtn ap-x" data-ap="close" aria-label="${E('close')}">✕</button></div>
      <div class="ap-body">
      <p class="ap-intro">${E('intro')}</p>
      ${M.kit !== M.latest ? `<p class="ap-note">${E('upgradeNote')}</p>` : ''}
      <section class="ap-card" aria-labelledby="ap-ph"><div class="ap-ch"><h3 id="ap-ph">📝 ${E('problems')}</h3><span class="muted small">${E('inList', { n: d.problems.length })}</span></div>
        <div class="seg ap-seg" role="group" aria-label="${E('problems')}"><button type="button" data-ap="list" aria-pressed="${!gen}">${E('sameList')}</button><button type="button" data-ap="gen" aria-pressed="${gen}">${E('newEach')}</button></div>
        <div class="ap-listbox"></div></section>
      ${gen ? `<section class="ap-card" aria-labelledby="ap-gh"><div class="ap-ch"><h3 id="ap-gh">🎲 ${E('genH')}</h3></div><div class="ap-genbox"></div></section>` : ''}
      <section class="ap-card" aria-labelledby="ap-hh"><div class="ap-ch"><h3 id="ap-hh">🪜 ${E('helpH')}</h3></div><p class="small muted">${E('helpHint')}</p>
        <div class="ap-tiles">${SUPPORTS.map(m => tile('ap-sup', m, supports.includes(m), false, E(`sup.${m}`), E(`supD.${m}`))).join('')}</div>
        <button type="button" class="btn btn-sm ap-more" data-ap="helpmore" aria-expanded="${M.helpMore}">${E(M.helpMore ? 'lessOptions' : 'moreOptions')}</button>
        <div class="field ap-more-box"${M.helpMore ? '' : ' hidden'}><label for="ap-start">${E('startsOn')}</label><select class="input" id="ap-start"${supports.length < 2 ? ' disabled' : ''}>${supports.map(m => `<option value="${m}"${(c.support || supports[0]) === m ? ' selected' : ''}>${E(`sup.${m}`)}</option>`).join('')}</select></div></section>
      <section class="ap-card" aria-labelledby="ap-ch"><div class="ap-ch"><h3 id="ap-ch">🔢 ${E('countH')}</h3></div>
        <div class="ap-step"><button type="button" class="btn" data-ap="minus" aria-label="${E('fewer')}"${count <= 1 ? ' disabled' : ''}>−</button><b aria-live="polite" id="ap-count">${count}</b><button type="button" class="btn" data-ap="plus" aria-label="${E('more')}"${count >= max ? ' disabled' : ''}>+</button>
        <span class="small muted">${gen ? E('countGen') : E('countList', { n: d.problems.length, max })}</span></div></section>
      <section class="ap-card" aria-labelledby="ap-uh"><div class="ap-ch"><h3 id="ap-uh">🎯 ${E('purposeH')}</h3></div>
        <div class="ap-tiles">${PURPOSES.map(k => tile('ap-pur', k, purpose.includes(k) && (k !== 'generator' || gen), k === 'generator' && !gen || k === 'screen', E(`pur.${k}`), E(`purD.${k === 'generator' && !gen ? 'needsGen' : k}`))).join('')}</div></section>
      </div>
      <div class="ap-foot">
        <p class="ap-sum small" role="status" aria-live="polite"></p>
        <div class="ap-footb"><button type="button" class="btn" data-ap="undo"${M.undo.length ? '' : ' disabled'}>↶ ${E('undo')}</button><button type="button" class="btn btn-primary" data-ap="save"${M.changes.length && !busy && !M.stale && (!gen || M.genOk !== false) ? '' : ' disabled'}>💾 ${esc(saveLabel(M))}</button></div>
      </div>`;
    renderList(M, box.querySelector('.ap-listbox'));
    if (gen) renderGenerator(M, box.querySelector('.ap-genbox'));
    const sum = box.querySelector('.ap-sum');
    if (M.stale) { sum.innerHTML = `<b>${E('stale')}</b> <button type="button" class="btn btn-sm" data-ap="reload">${E('reload', { n: H.state().activity ? H.state().activity.number : M.number })}</button>`; sum.querySelector('[data-ap="reload"]').addEventListener('click', () => { load(H.state().activity, H.state()); render(); }); }
    else if (busy) sum.textContent = P('busy');
    else if (M.fail) { sum.className = 'ap-sum small bad'; sum.textContent = M.fail; }
    else { sum.className = 'ap-sum small'; sum.innerHTML = M.changes.length ? `<span class="stchip warn">${E('nChanges', { n: M.changes.length })}</span> ${esc(M.changes.slice(-3).map(x => P(x.k === 'moved' ? (x.up ? 'chg.movedUp' : 'chg.movedDown') : `chg.${x.k}`, { n: x.n || 1 })).join(' · '))} · ${E('notSaved')}` : E('noChanges'); }
    wire(max);
  }
  function wire(max) {
    const on = (sel, fn, ev = 'click') => box.querySelectorAll(sel).forEach(el => el.addEventListener(ev, fn));
    on('[data-ap="close"]', closeSheet);
    on('[data-ap="list"]', () => { if (!M.data.gen) return; M.genKeep = clone(M.data.gen); M.commit({ k: 'list' }, d => { d.gen = null; if (Array.isArray(d.config.purpose)) d.config.purpose = d.config.purpose.filter(x => x !== 'generator'); }); render(); });
    on('[data-ap="gen"]', () => { if (M.data.gen) return; if (!genOn(M)) { M.fail = P('genNone'); } render(); });
    on('input[name="ap-sup"]', e => {
      const now = [...box.querySelectorAll('input[name="ap-sup"]:checked')].map(x => x.value);
      if (!now.length) { e.target.checked = true; return; }
      M.commit({ k: 'help' }, d => { d.config.supports = SUPPORTS.filter(x => now.includes(x)); if (!d.config.supports.includes(d.config.support)) d.config.support = d.config.supports[0]; }); render();
    }, 'change');
    on('#ap-start', e => { M.commit({ k: 'help' }, d => { d.config.support = e.target.value; }); render(); }, 'change');
    on('[data-ap="helpmore"]', () => { M.helpMore = !M.helpMore; render(); box.querySelector('[data-ap="helpmore"]').focus(); });
    const step = dlt => { const cur = +box.querySelector('#ap-count').textContent, n = Math.max(1, Math.min(max, cur + dlt)); if (n === cur) return; M.commit({ k: 'count', n }, d => { d.config.count = n; }); render(); box.querySelector(`[data-ap="${dlt < 0 ? 'minus' : 'plus'}"]`).focus(); };
    on('[data-ap="minus"]', () => step(-1)); on('[data-ap="plus"]', () => step(1));
    on('input[name="ap-pur"]', () => { const now = [...box.querySelectorAll('input[name="ap-pur"]:checked')].map(x => x.value); M.commit({ k: 'purpose' }, d => { d.config.purpose = PURPOSES.filter(x => now.includes(x) || x === 'screen'); }); render(); }, 'change');
    on('[data-ap="undo"]', () => { const u = M.undo.pop(); if (!u) return; M.data = u.data; M.changes = u.changes; M.fail = ''; render(); });
    on('[data-ap="save"]', async e => {
      e.currentTarget.disabled = true;
      const r = await save(M, H.state().game.id);
      if (r) { load(r.state.activity, r.state); H.applyState(r.state); H.showVersion(r.state); }
      render();
    });
  }
  M.render = render;
  render();
  return {
    dirty: () => M.changes.length > 0,
    openSheet,
    /** A new Studio state (a Builder version, a restore): the panel follows it, unless it holds changes (then it says so). */
    update(S) {
      if (!S.activity) { box.remove(); tabs.remove(); chat.classList.remove('ap-tab'); return false; }
      if (S.activity.base === M.base) { render(); return true; }
      if (M.changes.length) M.stale = true; else load(S.activity, S);
      render(); return true;
    },
  };
}
