// The student notebook (docs/decisions.md "Homeroom: the notebook"; server: routes/notebook.js, services/notebook.js).
// A running notepad a student keeps across sessions:
//   - the green corner button at the bottom right of every page a student with a notebook sees (where teachers have the
//     Oomba chat; Oomba never talks to students), above the phone's tab bar. On the desk it is the dock's last button.
//     It opens the notebook the way the chat opens: a panel on the right on laptops and tablets, a sheet on phones;
//   - "Your teacher can read your notebook" at the top, plainly, whenever the student is in a class;
//   - tabs (their own, named by them, and one per class for handout notes), search across every note, simple formatting
//     (bold, a list, a checklist) and four highlighters on the words picked, saved by itself a moment after typing
//     stops and when the page is left. Pasted text comes in as plain words. The server cleans every page again.
//   - a handout's note area on the desk opens its page in the class's tab (the 'notebook:open' event with
//     { classId, handout }); the dock's Notebook opens it as it was.
// K-2 mode (docs/decisions.md "Homeroom: K-2 mode, absent and at home": the server says k2 when a class of theirs has a
// K-2 desk): draw or type on every page (the desk pad's tools, public/js/homeroom-drawpad.js), a simpler toolbar (Bold and
// one highlighter), no search and no tabs to manage (their class's tab and My notes only).
// A class's teacher reads it with viewNotebook(studentId, name): the same tabs and search, read only (Homeroom's desk
// menu). Loaded as a page's script (a student's), it mounts the corner button; imported by another script, it only
// gives viewNotebook.
import { t, api, esc, toast, ask, askText } from '/js/app.js';
import { iconHtml } from '/js/icons.js';
import { drawPadHtml, drawPad, drawingHtml } from '/js/homeroom-drawpad.js';

const tn = (k, v) => t(`js.notebook.${k}`, v);
const ic = (e, size = 20) => iconHtml(e, { size });
const VER = (() => { try { return new URL(import.meta.url).searchParams.get('v') || ''; } catch { return ''; } })();
const HL = [['hl-y', '#FFE066'], ['hl-g', '#A8E6BF'], ['hl-b', '#A9D4F5'], ['hl-p', '#F7B8D2']];
const SVG = {
  bold: '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M7 4h6a4 4 0 0 1 0 8H7zM7 12h7a4 4 0 0 1 0 8H7z" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linejoin="round"/></svg>',
  list: '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><circle cx="5" cy="6" r="1.8" fill="currentColor"/><circle cx="5" cy="12" r="1.8" fill="currentColor"/><circle cx="5" cy="18" r="1.8" fill="currentColor"/><path d="M10 6h10M10 12h10M10 18h10" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>',
  check: '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><rect x="2.5" y="3" width="8" height="8" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M4.5 7l1.7 1.7L9 5.6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><rect x="2.5" y="13" width="8" height="8" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M14 7h7M14 17h7" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>',
  pen: '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M4 20l1.2-4.5L15.5 5.2a2 2 0 0 1 2.8 0l.5.5a2 2 0 0 1 0 2.8L8.5 18.8z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M3 22h18" stroke="var(--nb-hl,#FFE066)" stroke-width="3" stroke-linecap="round"/></svg>',
};
function css() {
  if (document.querySelector('link[data-nb-css]')) return;
  const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = `/css/notebook.css${VER ? `?v=${VER}` : ''}`; l.dataset.nbCss = '';
  document.head.appendChild(l);
}
const fold = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const textOf = html => { const d = document.createElement('div'); d.innerHTML = String(html || '').replace(/<br>|<\/?(p|li|ul|ol)\b[^>]*>/g, '$& '); return d.textContent.replace(/\s+/g, ' ').trim(); };

// ---------------------------------------------------------------- the panel
const S = { el: null, data: null, tab: null, ro: false, student: null, q: '', timers: new Map(), dirty: new Map(), ed: null, btn: null, opener: null, loading: null,
  // K-2: the page being drawn on ({ id, pad }) and the pages whose drawing changed since saved
  draw: null, drawn: new Set() };
const k2 = () => !S.ro && !!(S.data && S.data.k2);
const padWords = () => ({ pens: tn('k2.pens'), pen: v => tn('k2.pen', v), undo: tn('k2.undo'), clear: tn('k2.clear'), label: tn('k2.drawLabel') });
const $ = sel => S.el && S.el.querySelector(sel);
const tabName = x => (x.kind === 'class' ? x.name || tn('classTab') : x.name || tn('myNotes'));
const pageTitle = (tab, p) => p.title || (tab.kind === 'class' && !p.handout ? tn('classNotes') : '');

function mount() {
  if (S.el) return S.el;
  css();
  const el = document.createElement('section');
  el.className = 'nb'; el.id = 'nb'; el.hidden = true;
  el.setAttribute('role', 'dialog'); el.setAttribute('aria-labelledby', 'nb-h');
  document.body.appendChild(el);
  S.el = el;
  el.addEventListener('click', onClick);
  el.addEventListener('mousedown', e => { if (e.target.closest('[data-nbf]')) e.preventDefault(); });   // keep the words picked
  el.addEventListener('input', e => { if (e.target.id === 'nb-q') { S.q = e.target.value; drawBody(); return; } const ed = e.target.closest('.nb-ed'); if (ed) queue(ed.dataset.page); });
  el.addEventListener('focusin', e => { const ed = e.target.closest('.nb-ed'); if (ed) S.ed = ed; });
  el.addEventListener('paste', e => {
    const ed = e.target.closest('.nb-ed'); if (!ed) return;
    e.preventDefault();
    document.execCommand('insertText', false, (e.clipboardData && e.clipboardData.getData('text/plain')) || '');
  });
  el.addEventListener('keydown', e => {
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    if (e.key === 'Enter' && e.target.id === 'nb-q') { e.preventDefault(); const f = el.querySelector('[data-nbhit]'); if (f) f.click(); }
  });
  return el;
}
function shell() {
  const st = S.student;
  const title = S.ro ? tn('ofStudent', { name: st ? st.name : '' }) : tn('title');
  const lead = S.ro ? `<p class="nb-lead nb-ro">${ic('👀', 18)} <span>${esc(tn('readOnly'))}</span></p>`
    : S.data && S.data.teacherReads ? `<p class="nb-lead">${ic('🔒', 18)} <span>${esc(tn('teacherReads'))}</span></p>` : '';
  const tools = S.ro ? '' : k2() ? `<div class="nb-tools nb-k2tools" role="toolbar" aria-label="${esc(tn('format'))}">
      <button type="button" class="nb-tool" data-nbf="bold" aria-label="${esc(tn('bold'))}" title="${esc(tn('bold'))}">${SVG.bold}<span>${esc(tn('k2.bold'))}</span></button>
      <button type="button" class="nb-tool nb-hl" data-nbf="hl" data-hl="hl-y" style="--nb-hl:#FFE066" aria-label="${esc(tn('highlightN', { n: 1, color: tn('colors.hl-y') }))}" title="${esc(tn('colors.hl-y'))}">${SVG.pen}<span>${esc(tn('k2.highlight'))}</span></button>
    </div>` : `<div class="nb-tools" role="toolbar" aria-label="${esc(tn('format'))}">
      <button type="button" class="nb-tool" data-nbf="bold" aria-label="${esc(tn('bold'))}" title="${esc(tn('bold'))}">${SVG.bold}</button>
      <button type="button" class="nb-tool" data-nbf="list" aria-label="${esc(tn('list'))}" title="${esc(tn('list'))}">${SVG.list}</button>
      <button type="button" class="nb-tool" data-nbf="check" aria-label="${esc(tn('checklist'))}" title="${esc(tn('checklist'))}">${SVG.check}</button>
      <span class="nb-sep" aria-hidden="true"></span>
      <span class="nb-hls" role="group" aria-label="${esc(tn('highlight'))}">${HL.map(([k, c], i) => `<button type="button" class="nb-tool nb-hl" data-nbf="hl" data-hl="${k}" style="--nb-hl:${c}" aria-label="${esc(tn('highlightN', { n: i + 1, color: tn(`colors.${k}`) }))}" title="${esc(tn(`colors.${k}`))}">${SVG.pen}</button>`).join('')}
        <button type="button" class="nb-tool" data-nbf="unhl" aria-label="${esc(tn('noHighlight'))}" title="${esc(tn('noHighlight'))}">${ic('🧽', 20)}</button></span>
    </div>`;
  S.el.classList.toggle('nb-readonly', S.ro);
  S.el.classList.toggle('nb-k2', k2());
  S.el.innerHTML = `<header class="nb-head">
      <span class="nb-mark" aria-hidden="true">${ic('📝', 26)}</span>
      <h2 class="nb-title" id="nb-h" dir="auto">${esc(title)}</h2>
      <span class="nb-status" id="nb-status" role="status" aria-live="polite"></span>
      <button type="button" class="nb-x" data-nb="close" aria-label="${esc(tn('close'))}" title="${esc(tn('close'))}">${ic('✖️', 20)}</button>
    </header>
    ${lead}
    ${k2() ? '' : `<div class="nb-search"><span class="nb-sico" aria-hidden="true">${ic('🔎', 18)}</span><label class="sr-only" for="nb-q">${esc(tn('search'))}</label>
      <input type="search" id="nb-q" class="nb-q" placeholder="${esc(tn(S.ro ? 'searchTheirs' : 'search'))}" autocomplete="off" value="${esc(S.q)}"></div>`}
    <div class="nb-tabs" id="nb-tabs" role="tablist" aria-label="${esc(tn('tabs'))}"></div>
    ${tools}
    <div class="nb-body" id="nb-body" tabindex="-1"></div>`;
}
function drawTabs() {
  const box = $('#nb-tabs'); if (!box || !S.data) return;
  box.innerHTML = shownTabs().map(x => `<button type="button" role="tab" class="nb-tab${x.kind === 'class' ? ' cls' : ''}" id="nb-tab-${esc(x.id)}" data-nbtab="${esc(x.id)}" aria-selected="${x.id === S.tab && !S.q}" aria-controls="nb-body"><i style="--c:${esc(x.color || '#66C792')}" aria-hidden="true"></i><span dir="auto">${esc(tabName(x))}</span></button>`).join('')
    + (S.ro || k2() ? '' : `<button type="button" class="nb-tab nb-add" data-nb="addtab" aria-label="${esc(tn('newTab'))}" title="${esc(tn('newTab'))}">${ic('➕', 18)}<span class="nb-addt">${esc(tn('newTabShort'))}</span></button>`);
  const cur = box.querySelector('[aria-selected="true"]'); if (cur) cur.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}
/** The tabs shown: every tab, or in K-2 their classes' tabs and My notes (their first own tab) only. */
function shownTabs() {
  const all = (S.data && S.data.tabs) || [];
  if (!k2()) return all;
  const own = all.find(x => x.kind === 'own');
  return all.filter(x => x.kind === 'class' || x === own);
}
/** A page's drawing: the picture (read only), or in K-2 the picture with Draw, or the pad while drawing on it. */
function drawHtml(p) {
  if (!k2()) return p.drawing && p.drawing.length ? `<div class="nb-drawing">${drawingHtml(p.drawing, tn('k2.picture'))}</div>` : '';
  if (S.draw && S.draw.id === p.id) return `<div class="nb-k2draw on" data-nbdrawbox="${esc(p.id)}">${drawPadHtml({ id: p.id, words: padWords() })}<button type="button" class="btn btn-primary nb-k2done" data-nb="drawdone">${ic('✅', 20)} ${esc(tn('k2.doneDrawing'))}</button></div>`;
  const pic = p.drawing && p.drawing.length ? drawingHtml(p.drawing, tn('k2.picture')) : '';
  return `<div class="nb-k2draw" data-nbdrawbox="${esc(p.id)}">${pic}<button type="button" class="btn nb-k2drawbtn" data-nb="draw" data-page="${esc(p.id)}">${ic('🖍️', 24)} <span>${esc(tn(pic ? 'k2.drawMore' : 'k2.draw'))}</span></button></div>`;
}
function pageHtml(tab, p) {
  const title = pageTitle(tab, p);
  const head = title ? `<h3 class="nb-ptitle" dir="auto">${p.handout ? ic('📄', 18) : ''}<span>${esc(title)}</span></h3>` : '';
  const ed = S.ro ? `<div class="nb-ed nb-roed" dir="auto" data-page="${esc(p.id)}">${p.body || `<p class="nb-empty">${esc(tn('emptyPage'))}</p>`}</div>`
    : `<div class="nb-ed" contenteditable="true" role="textbox" aria-multiline="true" spellcheck="true" dir="auto" data-page="${esc(p.id)}" aria-label="${esc(title || tabName(tab))}" data-ph="${esc(tn(k2() ? 'k2.placeholder' : p.handout ? 'placeholderHandout' : 'placeholder'))}">${p.body || ''}</div>`;
  return `<article class="nb-page${k2() ? ' nb-k2page' : ''}" id="nb-p-${esc(p.id)}">${head}${drawHtml(p)}${ed}</article>`;
}
function drawBody() {
  const body = $('#nb-body'); if (!body || !S.data) return;
  drawTabs();
  S.el.classList.toggle('nb-searching', !!S.q.trim());
  if (S.q.trim()) { body.innerHTML = resultsHtml(S.q.trim()); return; }
  const tab = shownTabs().find(x => x.id === S.tab) || shownTabs()[0];
  if (!tab) { body.innerHTML = `<p class="nb-none">${esc(tn('emptyBook'))}</p>`; return; }
  S.tab = tab.id;
  const own = !S.ro && !k2() && tab.kind === 'own';
  const lead = tab.kind === 'class' ? `<p class="nb-tablead">${ic('🏫', 16)} <span>${esc(tn(S.ro ? 'classLeadRo' : 'classLead'))}</span></p>` : '';
  body.setAttribute('aria-labelledby', `nb-tab-${tab.id}`);
  body.innerHTML = `${lead}${tab.pages.map(p => pageHtml(tab, p)).join('')}
    ${own ? `<div class="nb-tabacts"><button type="button" class="btn btn-sm nb-small" data-nb="rename">${ic('✏️', 16)} ${esc(tn('renameTab'))}</button><button type="button" class="btn btn-sm nb-small" data-nb="deltab">${ic('🗑️', 16)} ${esc(tn('deleteTab'))}</button></div>` : ''}`;
  wirePad();
}
/** K-2: the pad on the page being drawn on; each stroke saves the page (with its drawing) like typing does. */
function wirePad() {
  if (!S.draw) return;
  const box = $(`[data-nbdrawbox="${CSS.escape(S.draw.id)}"]`), p = pageOf(S.draw.id);
  if (!box || !p) { S.draw = null; return; }
  const id = S.draw.id;
  S.draw.pad = drawPad(box, { strokes: p.drawing || [], max: (S.data.limits || {}).drawing, onChange: list => { p.drawing = list.slice(); S.drawn.add(id); queue(id); }, full: () => toast(tn('k2.padFull'), { bad: true }) });
}
/** Search: every page whose words hold the query (letters only, no accents or case), with a line around the first hit. */
function resultsHtml(qs) {
  const needle = fold(qs), hits = [];
  for (const tab of S.data.tabs) for (const p of tab.pages) {
    const tx = textOf(p.body), title = pageTitle(tab, p), f = fold(tx), at = f.indexOf(needle), inTitle = fold(`${tabName(tab)} ${title}`).includes(needle);
    if (at < 0 && !inTitle) continue;
    let snip = '';
    if (at >= 0) {
      const a = Math.max(0, at - 40), b = Math.min(tx.length, at + needle.length + 60);
      snip = `${a > 0 ? '…' : ''}${esc(tx.slice(a, at))}<mark class="nb-hit">${esc(tx.slice(at, at + needle.length))}</mark>${esc(tx.slice(at + needle.length, b))}${b < tx.length ? '…' : ''}`;
    } else snip = esc(tx.slice(0, 100)) || `<span class="nb-muted">${esc(tn('emptyPage'))}</span>`;
    hits.push(`<li><button type="button" class="nb-res" data-nbhit="${esc(p.id)}" data-tab="${esc(tab.id)}"><span class="nb-rwhere"><i style="--c:${esc(tab.color || '#66C792')}" aria-hidden="true"></i><b dir="auto">${esc(tabName(tab))}</b>${title ? `<span dir="auto"> · ${esc(title)}</span>` : ''}</span><span class="nb-rsnip" dir="auto">${snip}</span></button></li>`);
  }
  return hits.length ? `<p class="nb-rcount" role="status">${esc(tn('results', { count: hits.length }))}</p><ul class="nb-results">${hits.join('')}</ul>`
    : `<p class="nb-none" role="status">${esc(tn('noResults', { q: qs }))}</p>`;
}

// ---------------------------------------------------------------- open and close
export function isOpen() { return !!S.el && !S.el.hidden; }
function show() {
  S.el.hidden = false; document.body.classList.add('nb-on');
  if (S.btn) { S.btn.hidden = true; S.btn.setAttribute('aria-expanded', 'true'); }
  for (const b of document.querySelectorAll('[data-nb-open]')) b.setAttribute('aria-expanded', 'true');
}
export function close() {
  if (!S.el || S.el.hidden) return;
  flush(); S.draw = null;
  S.el.hidden = true; document.body.classList.remove('nb-on');
  if (S.btn) { S.btn.hidden = !!document.querySelector('[data-nb-open]'); S.btn.setAttribute('aria-expanded', 'false'); }
  for (const b of document.querySelectorAll('[data-nb-open]')) b.setAttribute('aria-expanded', 'false');
  const back = S.opener && S.opener.isConnected ? S.opener : (S.btn && !S.btn.hidden ? S.btn : null);
  if (back) back.focus();
}
/** Open the student's own notebook; at = { tab, page } to land on (a handout's page). */
async function openMine(at = null) {
  mount(); S.ro = false; S.student = null;
  S.opener = document.activeElement && document.activeElement !== document.body ? document.activeElement : S.btn;
  if (!S.data || S.dataRo) {
    shell(); show(); $('#nb-body').innerHTML = `<p class="nb-none">${esc(tn('loading'))}</p>`;
    try { S.data = await api('/api/notebook'); S.dataRo = false; } catch (e) { $('#nb-body').innerHTML = `<p class="nb-none">${esc(e.message)}</p>`; return; }
  }
  if (at && at.tabs) S.data.tabs = at.tabs;
  if (at && at.tab) { S.tab = at.tab; S.q = ''; }
  if (!S.tab || !S.data.tabs.some(x => x.id === S.tab)) S.tab = (S.data.tabs[0] || {}).id;
  shell(); show(); drawBody();
  const target = at && at.page ? $(`.nb-ed[data-page="${CSS.escape(at.page)}"]`) : null;
  if (target) { target.scrollIntoView({ block: 'start' }); caretEnd(target); }
  else ($('#nb-q') || S.el).focus({ preventScroll: true });
}
/** A class's teacher reads one student's notebook: the same tabs and search, nothing editable. */
export async function viewNotebook(studentId, name = '', { page = null } = {}) {
  mount(); flush();
  S.ro = true; S.student = { id: studentId, name }; S.q = ''; S.tab = null; S.data = { tabs: [] }; S.dataRo = true;
  S.opener = document.activeElement;
  shell(); show(); $('#nb-body').innerHTML = `<p class="nb-none">${esc(tn('loading'))}</p>`;
  try {
    const r = await api(`/api/notebook/of/${encodeURIComponent(studentId)}`);
    S.data = { tabs: r.tabs || [] }; S.student = { id: studentId, name: (r.student && r.student.name) || name };
    // (a Reading handout's 3 notes: the page given, in its tab)
    const at = page ? S.data.tabs.find(x => x.pages.some(p => p.id === page)) : null;
    S.tab = (at || S.data.tabs.find(x => x.pages.some(p => p.body)) || S.data.tabs[0] || {}).id;
    shell(); drawBody();
    const pg = at ? $(`.nb-ed[data-page="${CSS.escape(page)}"]`) : null;
    if (pg) { (pg.closest('.nb-page') || pg).scrollIntoView({ block: 'start' }); }
    $('#nb-q').focus({ preventScroll: true });
  } catch (e) { $('#nb-body').innerHTML = `<p class="nb-none">${esc(e.message)}</p>`; }
}
function caretEnd(el) {
  el.focus({ preventScroll: true });
  try { const r = document.createRange(); r.selectNodeContents(el); r.collapse(false); const s = getSelection(); s.removeAllRanges(); s.addRange(r); } catch { /* no selection */ }
}

// ---------------------------------------------------------------- saving
function queue(id) {
  if (S.ro || !id) return;
  S.dirty.set(id, true); status('saving');
  clearTimeout(S.timers.get(id));
  S.timers.set(id, setTimeout(() => save(id), 800));
}
function pageOf(id) { for (const tab of (S.data || {}).tabs || []) for (const p of tab.pages) if (p.id === id) return p; return null; }
async function save(id) {
  S.timers.delete(id);
  const ed = $(`.nb-ed[data-page="${CSS.escape(id)}"]`), p = pageOf(id);
  if (!ed || !p || !S.dirty.get(id)) return;
  S.dirty.delete(id);
  const body = ed.innerHTML, drew = S.drawn.has(id);
  S.drawn.delete(id);
  try {
    const r = await api(`/api/notebook/pages/${encodeURIComponent(id)}`, { method: 'POST', body: { body, ...(drew ? { drawing: p.drawing || [] } : {}) } });
    p.body = r.body; p.updatedAt = r.updatedAt; if (S.data) S.data.used = r.used;
    if (!S.dirty.size) status('saved');
  } catch (e) { p.body = body; status('error'); toast(e.message, { bad: true }); }
}
function flush() {
  if (S.ro) return;
  for (const [id] of S.dirty) {
    clearTimeout(S.timers.get(id)); S.timers.delete(id);
    const ed = S.el && S.el.querySelector(`.nb-ed[data-page="${CSS.escape(id)}"]`), p = pageOf(id); if (!ed) continue;
    if (p) p.body = ed.innerHTML;
    const drew = S.drawn.has(id); S.drawn.delete(id);
    try { fetch(`/api/notebook/pages/${encodeURIComponent(id)}`, { method: 'POST', keepalive: true, credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ body: ed.innerHTML, ...(drew && p ? { drawing: p.drawing || [] } : {}) }) }); } catch { /* gone */ }
  }
  S.dirty.clear();
}
function status(k) { const el = $('#nb-status'); if (el) { el.textContent = tn(`status.${k}`); el.dataset.k = k; } }

// ---------------------------------------------------------------- formatting
const inEditor = () => { const s = getSelection(); if (!s || !s.rangeCount) return null; const n = s.anchorNode; const ed = n && (n.nodeType === 1 ? n : n.parentElement)?.closest('.nb-ed'); return ed && S.el.contains(ed) && !S.ro ? ed : null; };
const listAt = () => { const s = getSelection(); const n = s && s.anchorNode; const el = n && (n.nodeType === 1 ? n : n.parentElement); return el ? el.closest('.nb-ed ul, .nb-ed ol') : null; };
function format(kind, hl) {
  let ed = inEditor();
  if (!ed) { ed = S.ed && S.ed.isConnected ? S.ed : $('.nb-ed[contenteditable]'); if (!ed) return; caretEnd(ed); }
  if (kind === 'bold') document.execCommand('bold');
  else if (kind === 'list') { const l = listAt(); if (l && l.classList.contains('nb-check')) l.classList.remove('nb-check'); else document.execCommand('insertUnorderedList'); }
  else if (kind === 'check') {
    const l = listAt();
    if (l && l.classList.contains('nb-check')) document.execCommand('insertUnorderedList');
    else { if (!l || l.tagName !== 'UL') document.execCommand('insertUnorderedList'); const n = listAt(); if (n) n.classList.add('nb-check'); }
  } else if (kind === 'hl') highlight(ed, hl);
  else if (kind === 'unhl') unhighlight(ed);
  queue(ed.dataset.page);
}
/** The words picked get a highlighter (mark.hl-*): the browser paints them, then its paint becomes our mark. */
function highlight(ed, k) {
  const s = getSelection(); if (!s.rangeCount || s.isCollapsed) { toast(tn('pickWords')); return; }
  const color = (HL.find(x => x[0] === k) || HL[0])[1];
  document.execCommand('styleWithCSS', false, true);
  document.execCommand('hiliteColor', false, color);
  document.execCommand('styleWithCSS', false, false);
  const rgb = c => { const d = document.createElement('i'); d.style.color = c; return d.style.color; };
  const map = new Map(HL.map(([key, c]) => [rgb(c), key]));
  for (const el of [...ed.querySelectorAll('[style]')]) {
    const bg = el.style.backgroundColor; if (!bg) continue;
    const key = map.get(bg);
    el.style.backgroundColor = '';
    if (!key) { if (!el.getAttribute('style')) el.removeAttribute('style'); continue; }
    const m = document.createElement('mark'); m.className = key;
    if (el.tagName === 'SPAN') { while (el.firstChild) m.appendChild(el.firstChild); el.replaceWith(m); }
    else { while (el.firstChild) m.appendChild(el.firstChild); el.appendChild(m); if (!el.getAttribute('style')) el.removeAttribute('style'); }
  }
  // a mark inside a mark of another color: the inner one wins (it was picked last)
  for (const m of [...ed.querySelectorAll('mark mark')]) { const o = m.parentElement; if (o.childNodes.length === 1) { o.className = m.className; m.replaceWith(...m.childNodes); } }
  s.collapseToEnd();
}
function unhighlight(ed) {
  const s = getSelection(); if (!s.rangeCount) return;
  const r = s.getRangeAt(0);
  for (const m of [...ed.querySelectorAll('mark')]) if (r.intersectsNode(m)) m.replaceWith(...m.childNodes);
  ed.normalize();
}

// ---------------------------------------------------------------- taps
async function onClick(e) {
  const f = e.target.closest('[data-nbf]');
  if (f) { format(f.dataset.nbf, f.dataset.hl); return; }
  const tb = e.target.closest('[data-nbtab]');
  if (tb) { flush(); S.draw = null; S.tab = tb.dataset.nbtab; S.q = ''; const q = $('#nb-q'); if (q) q.value = ''; drawBody(); $('#nb-body').scrollTop = 0; tb.focus(); return; }
  const hit = e.target.closest('[data-nbhit]');
  if (hit) {
    const qs = S.q; S.tab = hit.dataset.tab; S.q = ''; const q = $('#nb-q'); if (q) q.value = ''; drawBody();
    const pg = $(`#nb-p-${CSS.escape(hit.dataset.nbhit)}`);
    if (pg) { pg.scrollIntoView({ block: 'start' }); pg.classList.add('nb-flash'); setTimeout(() => pg.classList.remove('nb-flash'), 1600); findIn(pg.querySelector('.nb-ed'), qs); }
    return;
  }
  // a checklist's box: a tap on it ticks the line (or unticks it)
  const li = e.target.closest('.nb-ed ul.nb-check > li');
  if (li && !S.ro) {
    const r = li.getBoundingClientRect(), rtl = getComputedStyle(li).direction === 'rtl', x = rtl ? r.right - e.clientX : e.clientX - r.left;
    if (x < 34) { e.preventDefault(); li.classList.toggle('done'); queue(li.closest('.nb-ed').dataset.page); }
    return;
  }
  const b = e.target.closest('[data-nb]'); if (!b) return;
  const k = b.dataset.nb;
  if (k === 'close') return close();
  // K-2: draw on a page, then Done (the text stays as it was typed)
  if (k === 'draw' || k === 'drawdone') {
    const keep = new Map([...S.el.querySelectorAll('.nb-ed[contenteditable]')].map(ed => [ed.dataset.page, ed.innerHTML]));
    for (const [id, html] of keep) { const p = pageOf(id); if (p) p.body = html; }
    S.draw = k === 'draw' ? { id: b.dataset.page, pad: null } : null;
    const at = k === 'draw' ? b.dataset.page : (b.closest('[data-nbdrawbox]') || {}).dataset?.nbdrawbox;
    drawBody();
    const box = at ? $(`[data-nbdrawbox="${CSS.escape(at)}"]`) : null;
    if (box) { box.scrollIntoView({ block: 'nearest' }); box.querySelector(k === 'draw' ? '.dp-svg' : '[data-nb="draw"]')?.focus?.({ preventScroll: true }); }
    return;
  }
  if (k === 'addtab') {
    const name = await askText({ title: tn('newTab'), label: tn('tabNameLabel'), ok: tn('make'), max: (S.data.limits || {}).name || 30 });
    if (!name || !name.trim()) return;
    try { const r = await api('/api/notebook/tabs', { method: 'POST', body: { action: 'add', name } }); S.data.tabs = r.tabs; S.tab = r.tab; S.q = ''; drawBody(); const ed = $('.nb-ed[contenteditable]'); if (ed) caretEnd(ed); }
    catch (err) { toast(err.message, { bad: true }); }
    return;
  }
  const tab = S.data && S.data.tabs.find(x => x.id === S.tab); if (!tab) return;
  if (k === 'rename') {
    const name = await askText({ title: tn('renameTab'), label: tn('tabNameLabel'), value: tab.name || tn('myNotes'), ok: tn('save'), max: (S.data.limits || {}).name || 30 });
    if (!name || !name.trim()) return;
    try { const r = await api('/api/notebook/tabs', { method: 'POST', body: { action: 'rename', id: tab.id, name } }); S.data.tabs = r.tabs; drawBody(); }
    catch (err) { toast(err.message, { bad: true }); }
  }
  if (k === 'deltab') {
    if (!(await ask({ title: tn('deleteAskTitle', { name: tabName(tab) }), text: tn('deleteAsk'), ok: tn('deleteOk'), danger: true }))) return;
    flush();
    try { const r = await api('/api/notebook/tabs', { method: 'POST', body: { action: 'delete', id: tab.id } }); S.data.tabs = r.tabs; S.tab = (r.tabs[0] || {}).id; drawBody(); }
    catch (err) { toast(err.message, { bad: true }); }
  }
}
/** After a search: the words found, picked on the page (so they show where they are). */
function findIn(ed, qs) {
  if (!ed || !qs) return;
  const needle = fold(qs), walk = document.createTreeWalker(ed, NodeFilter.SHOW_TEXT);
  for (let n = walk.nextNode(); n; n = walk.nextNode()) {
    const at = fold(n.nodeValue).indexOf(needle); if (at < 0) continue;
    try { const r = document.createRange(); r.setStart(n, at); r.setEnd(n, Math.min(n.nodeValue.length, at + qs.length)); const s = getSelection(); s.removeAllRanges(); s.addRange(r); } catch { /* fine */ }
    return;
  }
}

// ---------------------------------------------------------------- the corner button (a student's page)
function corner() {
  mount();
  const b = document.createElement('button');
  b.type = 'button'; b.className = 'nb-btn'; b.id = 'nb-btn';
  b.setAttribute('aria-label', tn('open')); b.title = tn('open'); b.setAttribute('aria-controls', 'nb'); b.setAttribute('aria-expanded', 'false');
  b.innerHTML = ic('📝', 30);
  b.addEventListener('click', () => openMine());
  document.body.appendChild(b);
  S.btn = b;
  document.body.classList.add('nb-has');
  // A page with its own Notebook button (the desk's dock) keeps the corner free.
  if (document.querySelector('[data-nb-open]')) b.hidden = true;
  document.addEventListener('click', e => { const o = e.target.closest('[data-nb-open]'); if (o) { if (isOpen() && !S.ro) close(); else openMine(); } });
  window.addEventListener('notebook:open', async e => {
    const d = (e && e.detail) || {};
    if (d.classId && d.handout) {
      try { const r = await api('/api/notebook/handout', { method: 'POST', body: { classId: d.classId, handout: d.handout } }); if (!S.data || S.dataRo) S.data = null; else S.data.tabs = r.tabs; await openMine({ tab: r.tab, page: r.page, tabs: S.data ? r.tabs : null }); }
      catch (err) { toast(err.message, { bad: true }); }
      return;
    }
    openMine();
  });
  window.addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', () => { if (document.hidden) flush(); });
}
const mine = [...document.querySelectorAll('script[src]')].some(s => /^\/js\/notebook\.js(\?|$)/.test(s.getAttribute('src')));
if (mine && document.body.dataset.user) corner();
