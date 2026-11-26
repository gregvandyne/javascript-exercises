// The left panel's catalog, Find lessons (docs/decisions.md "Homeroom: live games inside Homeroom, a simpler Find
// lessons"; server: routes/homeroom.js catalogHtml). Search first, a grade, one row of filter chips that scrolls sideways
// (All, Recent, Games, each subject, Live games, Teaching tools, My lessons, Lesson plans) and Select. With All on and
// nothing searched the cards sit in groups under plain headers, each showing its first few (See all shows the rest);
// a chip or a search shows one grid of what fits, without the group headers (a tool's practice keeps its header, so a
// tool's tasks are found by tool, then task). What was handed out lately comes first in its group and under Recent
// (this browser's own list). On a phone the panel is a strip along the bottom, so its "Find lessons" opens the same
// catalog in a sheet; tapping a card there picks it (the yellow bar then says where to tap) and closes the sheet.
// Select (public/js/homeroom-multi.js) picks several cards at once: a bar under them says how many, and Hand out.
import { t, esc, sheet } from '/js/app.js';

const tc = (k, v) => t(`js.homeroom-catalog.${k}`, v);
const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
const FIRST = 4;
const RECENT_KEY = 'hr:recent', RECENT_MAX = 8;

/** This browser's recently handed out cards (ids, newest first). */
export function recentIds() { try { const v = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); return Array.isArray(v) ? v.filter(x => typeof x === 'string').slice(0, RECENT_MAX) : []; } catch { return []; } }
/** A card was handed out (or put on My desk): it comes first next time. */
export function noteRecent(ids) {
  const list = [...new Set([...[].concat(ids).filter(Boolean), ...recentIds()])].slice(0, RECENT_MAX);
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(list)); } catch { /* private mode: no Recent */ }
}

/** Wire one catalog (the panel's, or the sheet's copy). -> { apply(), subj() } */
export function wireCatalog(root, { onPick = null, onSelect = null } = {}) {
  const box = root.querySelector('[data-catalog]') || root; if (!box || !box.matches('[data-catalog]')) return null;
  const q = box.querySelector('[data-cq]'), grade = box.querySelector('[data-cg]');
  let subj = '';
  const open = new Set();
  // recently handed out first, in each group (and the Recent chip shows only those)
  const rec = recentIds();
  for (const ul of box.querySelectorAll('.hr-cgroup .hr-items')) {
    const lis = [...ul.children].filter(li => li.matches('.hr-cc'));
    const seen = lis.filter(li => rec.includes(li.querySelector('[data-hritem]')?.dataset.hritem)).sort((a, b) => rec.indexOf(a.querySelector('[data-hritem]').dataset.hritem) - rec.indexOf(b.querySelector('[data-hritem]').dataset.hritem));
    for (const li of seen.reverse()) { li.dataset.recent = '1'; ul.prepend(li); }
  }
  const recentChip = box.querySelector('[data-csubj="recent"]'); if (recentChip) recentChip.hidden = !box.querySelector('[data-recent]');
  const fitsChip = li => {
    if (!subj) return true;
    const k = li.dataset.k;
    if (subj === 'recent') return li.dataset.recent === '1';
    if (subj === 'games') return k === 'game';
    if (subj === 'live') return k === 'live';
    if (subj === 'tools') return k === 'tool' || k === 'task' || k === 'figures';
    if (subj === 'mine') return k === 'mine';
    if (subj === 'plans') return k === 'plan';
    return (k === 'game' || k === 'live') && li.dataset.subject === subj;
  };
  function apply() {
    const words = norm(q && q.value).split(/\s+/).filter(Boolean), g = grade && grade.value !== '' ? Number(grade.value) : null;
    const busy = !!(words.length || g !== null || subj);
    box.classList.toggle('hr-cbusy', busy);
    let n = 0;
    const ids = new Set();
    for (const grp of box.querySelectorAll('.hr-cgroup')) {
      let shown = 0;
      for (const li of grp.querySelectorAll('.hr-items > li.hr-cc')) {
        if (li.matches('.hr-cbuildplan')) { li.hidden = busy && subj !== 'plans'; continue; }
        const text = norm(li.dataset.q || li.textContent);
        const fits = words.every(w => text.includes(w))
          && (g === null || li.dataset.gf === undefined || (Number(li.dataset.gf) <= g && g <= Number(li.dataset.gt)))
          && fitsChip(li);
        // (each card once: a game in a folder and in Favorites shows the first time only)
        const id = li.querySelector('[data-hritem]')?.dataset.hritem;
        const on = fits && !(id && ids.has(id));
        if (on && id) ids.add(id);
        li.hidden = !on;
        if (on) { shown++; n++; }
      }
      grp.hidden = !shown && !(grp.matches('[data-plans]') && (!busy || subj === 'plans'));
      const c = grp.querySelector('[data-ccount]'); if (c) c.textContent = shown ? String(shown) : '';
    }
    // With All on and nothing searched, each part (Games, Live games, Teaching tools, Lessons) is one grid showing its
    // first few, the recently handed out first; See all shows the rest. A part with nothing in it goes.
    for (const sec of box.querySelectorAll('.hr-csec')) {
      const lis = [...sec.querySelectorAll('.hr-items > li.hr-cc:not([hidden])')].filter(li => !li.matches('.hr-cbuildplan, .hr-cbuild'));
      const more = sec.querySelector(':scope > [data-cseeall]'), isOpen = open.has(sec.dataset.csec);
      if (!busy) {
        const first = [...lis.filter(li => li.dataset.recent), ...lis.filter(li => !li.dataset.recent)];
        first.forEach((li, i) => { li.hidden = !isOpen && i >= FIRST; });
      }
      sec.hidden = !lis.length && !(sec.dataset.csec === 'lessons' && (!busy || subj === 'plans' || subj === 'mine'));
      if (more) { more.hidden = busy || lis.length <= FIRST; more.textContent = isOpen ? more.dataset.fewer : (more.dataset.all || '').replace('{n}', lis.length); more.setAttribute('aria-expanded', String(isOpen)); }
    }
    // (in the panel the search covers Reading and Class flow too, the lists under the catalog; a chip or a grade hides them)
    if (!onPick) {
      for (const ul of root.querySelectorAll(':scope > .hr-items, :scope > .hr-readmore')) {
        let any = false;
        for (const li of ul.children) { const on = !busy || (!subj && g === null && words.length && words.every(w => norm(li.textContent).includes(w))); li.hidden = !on; if (on) { any = true; n++; } }
        ul.hidden = !any;
      }
      for (const h of root.querySelectorAll(':scope > .hr-cap')) {
        let el = h.nextElementSibling, lists = false, any = false;
        while (el && !el.matches('.hr-cap')) { if (el.matches('.hr-items, .hr-readmore')) { lists = true; if (!el.hidden) any = true; } else if (!el.matches('[data-catalog]')) any = true; el = el.nextElementSibling; }
        if (lists) h.hidden = busy && !any;
      }
    }
    const build = box.querySelector('.hr-cbuild'); if (build) build.hidden = busy && subj !== 'mine' && subj !== 'plans';
    const none = box.querySelector('[data-cnone]'); if (none) none.hidden = !busy || n > 0;
    const st = box.querySelector('[data-cstatus]'); if (st && busy) st.textContent = (n === 1 ? st.dataset.one : st.dataset.many || '').replace('{n}', n);
    if (onSelect) onSelect.refresh(box);
  }
  // (in the panel: the search box goes to the top as one types, so what it finds shows under it)
  const lift = () => { if (!onPick) { const f = box.querySelector('.hr-cfind'), p = f && f.closest('.hr-panel'); if (p) p.scrollTop += f.getBoundingClientRect().top - p.getBoundingClientRect().top - 8; } };
  if (q) q.addEventListener('input', () => { apply(); lift(); });
  if (grade) grade.addEventListener('change', apply);
  box.addEventListener('hr:catalog', apply);
  box.addEventListener('click', e => {
    const b = e.target.closest('[data-csubj]');
    if (b) {
      subj = b.dataset.csubj;
      for (const x of box.querySelectorAll('[data-csubj]')) { const on = x === b; x.classList.toggle('on', on); x.setAttribute('aria-pressed', String(on)); }
      apply(); lift(); return;
    }
    const all = e.target.closest('[data-cseeall]');
    if (all) { const k = all.closest('.hr-csec').dataset.csec; if (open.has(k)) open.delete(k); else open.add(k); apply(); return; }
    if (e.target.closest('[data-cselect]') && onSelect) { onSelect.toggle(box); return; }
    if (onSelect && onSelect.on() && e.target.closest('[data-hritem]')) { e.preventDefault(); e.stopPropagation(); onSelect.tap(e.target.closest('[data-hritem]'), box); return; }
    if (onPick && e.target.closest('[data-hritem]')) onPick(e.target.closest('[data-hritem]'));
  }, true);
  apply();
  return { apply, subj: () => subj };
}

/**
 * The phone's catalog: the panel's catalog in a sheet. pick(button): the panel's own pick; other(event): a tap on
 * anything else that acts (Build a lesson plan, a lesson plan's ⋯, a live game), handled as on the panel.
 */
export function catalogSheet(pick, { other = null, select = null } = {}) {
  const src = document.querySelector('#hr-panel [data-catalog]'); if (!src) return null;
  const copy = src.cloneNode(true);
  for (const el of copy.querySelectorAll('[id]')) { el.id = `${el.id}-s`; }
  for (const l of copy.querySelectorAll('label[for]')) l.htmlFor = `${l.htmlFor}-s`;
  // (in the sheet every card is there to be found: the panel's own filters do not carry over)
  for (const el of copy.querySelectorAll('[hidden]')) if (!el.matches('[data-cnone], [data-cseeall], [data-cselbar], [data-csubj="recent"], [data-ctotal]')) el.hidden = false;
  for (const el of copy.querySelectorAll('[data-csubj]')) { const on = el.dataset.csubj === ''; el.classList.toggle('on', on); el.setAttribute('aria-pressed', String(on)); }
  for (const el of copy.querySelectorAll('[data-recent]')) delete el.dataset.recent;
  const qq = copy.querySelector('[data-cq]'); if (qq) qq.value = '';
  const gg = copy.querySelector('[data-cg]'); if (gg) gg.value = '';
  const sh = sheet({ title: `🔎 ${tc('title')}`, content: `<div class="hr-csheet"><p class="small muted">${esc(tc('lead'))}</p></div>` });
  sh.el.classList.add('hr-csheetwrap');
  const host = sh.el.querySelector('.hr-csheet'); host.appendChild(copy);
  if (select) select.reset(copy);
  wireCatalog(host, { onPick: b => { sh.close(); pick(b); }, onSelect: select });
  if (other) host.addEventListener('click', e => { if (e.target.closest('[data-hritem], [data-csubj], [data-cseeall], [data-cselect], [data-cselbar]')) return; if (other(e, () => sh.close())) e.preventDefault(); });
  requestAnimationFrame(() => copy.querySelector('[data-cq]')?.focus());
  return sh;
}
