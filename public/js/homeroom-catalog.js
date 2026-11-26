// The left panel's catalog (docs/decisions.md "Homeroom: watching desks and the full catalog"; server: routes/homeroom.js
// catalogHtml): one search box over every lesson, lesson plan and tool, a grade, and the subject chips of Find Oomba
// lessons (plus Teaching tools). Lists that match open; the rest close; "No lessons match" when nothing does. On a phone
// the panel is a strip along the bottom, so its "Find lessons" opens the same catalog in a sheet; tapping an item there
// picks it (the yellow bar then says where to tap) and closes the sheet.
import { t, esc, sheet } from '/js/app.js';

const tc = (k, v) => t(`js.homeroom-catalog.${k}`, v);
const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

/** Wire one catalog (the panel's, or the sheet's copy). -> { apply() } */
export function wireCatalog(root, { onPick = null } = {}) {
  const box = root.querySelector('[data-catalog]') || root; if (!box) return null;
  // (in the panel the search covers Reading and Class flow too: every list under it but the lesson plans')
  const scope = onPick ? box : root;
  const q = box.querySelector('[data-cq]'), grade = box.querySelector('[data-cg]');
  let subj = '';
  // the lesson plans' list (rendered by public/js/homeroom-lessons.js) is searched too, by its names
  const lessons = () => [...document.querySelectorAll('#hr-lessons .hr-lrow')].filter(li => root.contains(li) || !onPick);
  function apply() {
    const words = norm(q && q.value).split(/\s+/).filter(Boolean), g = grade && grade.value !== '' ? Number(grade.value) : null;
    const busy = !!(words.length || g !== null || subj);
    let n = 0;
    for (const li of scope.querySelectorAll('.hr-items > li')) {
      if (li.closest('#hr-lessons')) continue;
      const text = norm(li.dataset.q || li.textContent);
      const isTool = !!li.querySelector('[data-hritem^="T:"]');
      const fits = words.every(w => text.includes(w))
        && (g === null || li.dataset.gf === undefined || (Number(li.dataset.gf) <= g && g <= Number(li.dataset.gt)))
        && (!subj || (subj === 'tools' ? isTool : li.dataset.subject === subj));
      li.hidden = !fits; if (fits) n++;
    }
    for (const d of box.querySelectorAll('details.hr-cgroup')) {
      const shown = [...d.querySelectorAll('.hr-items > li')].filter(li => !li.hidden).length;
      d.hidden = !shown;
      const c = d.querySelector('[data-ccount]'); if (c) c.textContent = String(shown);
      if (busy) d.open = shown > 0; else if (d.dataset.wasOpen !== undefined) { d.open = d.dataset.wasOpen === '1'; }
    }
    if (!busy) for (const d of box.querySelectorAll('details.hr-cgroup')) delete d.dataset.wasOpen;
    for (const li of lessons()) { const fits = words.every(w => norm(li.textContent).includes(w)) && !subj; li.hidden = !fits; }
    // a heading whose lists are all hidden goes too
    for (const h of scope.querySelectorAll('.hr-cap')) {
      let el = h.nextElementSibling, any = false, lists = false;
      while (el && !el.matches('.hr-cap')) {
        if (el.matches('details, .hr-items')) { lists = true; if (!el.hidden && (el.matches('details') || [...el.children].some(li => !li.hidden))) any = true; }
        if (el.matches('.hr-empty, .hr-lessons, .hr-groupchips, .hr-tools, .hr-catalog, [data-cfind]')) { any = true; lists = true; }
        el = el.nextElementSibling;
      }
      if (lists) h.hidden = busy && !any;
    }
    for (const ul of scope.querySelectorAll(':scope > .hr-items, .hr-readmore')) ul.hidden = busy && ![...ul.children].some(li => !li.hidden);
    const none = box.querySelector('[data-cnone]'); if (none) none.hidden = !busy || n > 0;
    const st = box.querySelector('[data-cstatus]'); if (st && busy) st.textContent = (n === 1 ? st.dataset.one : st.dataset.many || '').replace('{n}', n);
  }
  const remember = () => { for (const d of box.querySelectorAll('details.hr-cgroup')) if (d.dataset.wasOpen === undefined) d.dataset.wasOpen = d.open ? '1' : '0'; };
  // (in the panel: the search box goes to the top as one types, so what it finds shows under it)
  const lift = () => { if (!onPick) { const f = box.querySelector('.hr-cfind'), p = f && f.closest('.hr-panel'); if (p) p.scrollTop += f.getBoundingClientRect().top - p.getBoundingClientRect().top - 8; } };
  if (q) q.addEventListener('input', () => { remember(); apply(); lift(); });
  if (grade) grade.addEventListener('change', () => { remember(); apply(); });
  box.addEventListener('click', e => {
    const b = e.target.closest('[data-csubj]');
    if (b) {
      remember();
      subj = b.dataset.csubj;
      for (const x of box.querySelectorAll('[data-csubj]')) { const on = x === b; x.classList.toggle('on', on); x.setAttribute('aria-pressed', String(on)); }
      apply(); return;
    }
    if (onPick && e.target.closest('[data-hritem]')) onPick(e.target.closest('[data-hritem]'));
  });
  return { apply };
}

/** The phone's catalog: the panel's catalog in a sheet. pick(button): the panel's own pick. */
export function catalogSheet(pick) {
  const src = document.querySelector('#hr-panel [data-catalog]'); if (!src) return;
  const copy = src.cloneNode(true);
  for (const el of copy.querySelectorAll('[id]')) { el.id = `${el.id}-s`; }
  for (const l of copy.querySelectorAll('label[for]')) l.htmlFor = `${l.htmlFor}-s`;
  // (in the sheet every group starts closed but the first, and every item is shown)
  for (const li of copy.querySelectorAll('li[hidden], .hr-cap[hidden], details[hidden]')) li.hidden = false;
  const sh = sheet({ title: `🔎 ${tc('title')}`, content: `<div class="hr-csheet"><p class="small muted">${esc(tc('lead'))}</p></div>` });
  sh.el.classList.add('hr-csheetwrap');
  const host = sh.el.querySelector('.hr-csheet'); host.appendChild(copy);
  wireCatalog(host, { onPick: b => { sh.close(); pick(b); } });
  requestAnimationFrame(() => copy.querySelector('[data-cq]')?.focus());
}
