// A quiz step in a class lesson (homework from a live question set; LIVE_HOMEWORK; docs/live-protocol.md
// "/api/lessons/:clId/steps/:stepId/quiz"). One question at a time with big shape-marked buttons, Read aloud, no timer.
// The server checks each answer once and never sends the answers before; when the last one is in the step is done and
// the page reloads to show the score.
import { api, toast } from '/js/app.js';
import { fill, speak, voiceFor } from '/js/live-common.js';

const SHAPES = ['▲', '◆', '●', '■'];
if (document.querySelector('.lv-qstep') && !document.querySelector('link[href^="/css/live.css"]')) { const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = '/css/live.css'; document.head.append(l); }
for (const box of document.querySelectorAll('.lv-qstep')) {
  const go = box.querySelector('.lv-qstep-go'); if (!go) continue;
  let T = {}; try { T = JSON.parse(box.querySelector('script[type="application/json"]').textContent); } catch { /* none */ }
  const lang = box.dataset.lang || document.documentElement.lang;
  let items = [], marks = '', i = -1;
  go.addEventListener('click', async () => {
    go.disabled = true;
    try { const r = await api(box.dataset.api); items = r.items || []; marks = r.marks || ''; next(); }
    catch (e) { toast(e.message, { bad: true }); go.disabled = false; }
  });
  function next() {
    i = marks.indexOf('-');
    if (i < 0) { location.reload(); return; }
    const it = items[i];
    box.textContent = '';
    const head = document.createElement('p'); head.className = 'small muted'; head.textContent = fill(T.of, { n: i + 1, total: items.length });
    const q = document.createElement('p'); q.className = 'lv-qstep-q'; q.textContent = it.q; q.dir = 'auto';
    box.append(head, q);
    if (window.speechSynthesis && voiceFor(lang)) {
      const rd = document.createElement('button'); rd.type = 'button'; rd.className = 'btn btn-sm'; rd.textContent = `🔊 ${T.read}`;
      rd.addEventListener('click', () => speak(`${it.q}. ${it.choices.map((c, k) => `${String.fromCharCode(65 + k)}: ${c}`).join('. ')}`, lang));
      box.append(rd);
    }
    const pad = document.createElement('div'); pad.className = 'lv-qstep-pad'; pad.setAttribute('role', 'group'); pad.setAttribute('aria-label', it.q);
    it.choices.forEach((c, k) => {
      const b = document.createElement('button'); b.type = 'button'; b.className = `btn lv-qstep-a lv-qc${k}`;
      const sh = document.createElement('span'); sh.setAttribute('aria-hidden', 'true'); sh.textContent = SHAPES[k];
      const tx = document.createElement('span'); tx.textContent = c; tx.dir = 'auto';
      b.append(sh, tx); b.setAttribute('aria-label', `${String.fromCharCode(65 + k)}: ${c}`);
      b.addEventListener('click', () => answer(k, pad));
      pad.append(b);
    });
    box.append(pad);
    pad.firstChild.focus();
  }
  async function answer(k, pad) {
    for (const b of pad.children) b.disabled = true;
    try {
      const r = await api(box.dataset.api, { method: 'POST', body: { i, c: k } });
      pad.children[r.answer].classList.add('is-right');
      marks = marks.slice(0, i) + (r.ok ? '1' : '0') + marks.slice(i + 1);
      const note = document.createElement('p'); note.className = 'lv-qstep-note'; note.setAttribute('role', 'status'); note.textContent = r.ok ? T.right : T.wrong;
      const nx = document.createElement('button'); nx.type = 'button'; nx.className = 'btn btn-primary'; nx.textContent = T.next;
      nx.addEventListener('click', next);
      box.append(note, nx); nx.focus();
    } catch (e) { toast(e.message, { bad: true }); for (const b of pad.children) b.disabled = false; }
  }
}
