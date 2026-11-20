// Story Library: "What would you like to read today?" (server/routes/library-suggest.js). Shows the box (it stays
// hidden without JavaScript), sends the wish, and puts the books that come back (the library's own cards, drawn by the
// server) under "Books for you" in place of the grid; "All books" brings the grid back. Every word on screen comes from
// the server in the reader's language; nothing the AI writes is shown.
import { api } from '/js/app.js';

const form = document.getElementById('lb-wish');
if (form) start();

function start() {
  const $ = id => document.getElementById(id);
  const root = form.closest('.slib') || document.body;
  const input = $('lb-wish-q'), go = $('lb-wish-go'), out = $('lb-wish-out'), note = $('lb-wish-note'), grid = $('lb-wish-grid');
  const label = go.textContent;
  let busy = false;
  form.hidden = false;

  const show = on => { root.classList.toggle('lb-suggesting', on); out.hidden = !on; };
  $('lb-wish-back').addEventListener('click', () => { show(false); grid.textContent = ''; note.textContent = ''; input.focus(); });

  form.addEventListener('submit', async e => {
    e.preventDefault();
    const wish = input.value.trim();
    if (!wish || busy) { if (!wish) input.focus(); return; }
    busy = true; go.disabled = true; go.textContent = form.dataset.busy; form.setAttribute('aria-busy', 'true');
    try {
      const r = await api('/api/library/suggest', { method: 'POST', body: { wish, grade: form.dataset.grade || '', class: form.dataset.class || '' } });
      note.textContent = r.note || '';
      out.classList.toggle('is-refused', !!r.refused);
      out.classList.toggle('is-none', !!r.none);
      grid.innerHTML = r.html || '';
      show(true);
      out.focus({ preventScroll: true });
      out.scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    } catch (err) {
      note.textContent = (err && err.data && err.data.error) || form.dataset.error;
      out.classList.add('is-refused'); grid.textContent = ''; show(true);
    } finally {
      busy = false; go.disabled = false; go.textContent = label; form.removeAttribute('aria-busy');
    }
  });
}
