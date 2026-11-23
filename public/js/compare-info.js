// /compare (server/routes/compare.js): the small "i" buttons in the table. A button opens its short note (the next
// element, hidden until then) next to it: by tap, click, Enter or Space. Escape closes it and puts focus back on the
// button; a tap or click outside, Tab past the note, a resize or scrolling the table closes it. One note at a time.
// The note is placed with position: fixed, so the table's own sideways scroll box never cuts it off.

let open = null;

function place(btn, pop) {
  const r = btn.getBoundingClientRect();
  const w = Math.min(320, window.innerWidth - 24);
  pop.style.width = `${w}px`;
  const left = Math.min(Math.max(12, r.left + r.width / 2 - w / 2), window.innerWidth - w - 12);
  pop.style.left = `${left}px`;
  const h = pop.offsetHeight;
  const below = r.bottom + 6;
  pop.style.top = `${below + h > window.innerHeight - 8 && r.top - h - 6 > 8 ? r.top - h - 6 : below}px`;
}

function close(focusBack) {
  if (!open) return;
  const { btn, pop } = open;
  open = null;
  pop.hidden = true;
  btn.setAttribute('aria-expanded', 'false');
  if (focusBack) btn.focus();
}

function show(btn) {
  const pop = document.getElementById(btn.getAttribute('aria-controls'));
  if (!pop) return;
  close(false);
  pop.hidden = false;
  btn.setAttribute('aria-expanded', 'true');
  open = { btn, pop };
  place(btn, pop);
}

document.addEventListener('click', e => {
  const btn = e.target.closest('.cmp-i');
  if (btn) { if (open && open.btn === btn) close(false); else show(btn); return; }
  if (open && !open.pop.contains(e.target)) close(false);
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && open) { e.preventDefault(); close(true); }
});
document.addEventListener('focusin', e => {
  if (open && !open.pop.contains(e.target) && e.target !== open.btn) close(false);
});
window.addEventListener('resize', () => close(false));
window.addEventListener('scroll', () => { if (open) place(open.btn, open.pop); }, { passive: true });
const box = document.querySelector('.cmp-scroll');
if (box) box.addEventListener('scroll', () => close(false), { passive: true });
