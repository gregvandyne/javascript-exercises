// The Activity panel's problem list: each row has a handle to drag it (or move it with the arrow keys), its picture,
// its line, a short status and ✏️; under the list, Add a problem and Copy problem N. Every change goes through
// M.commit(change, fn), so it can be undone and is named on the version.
import { P, E, clone, thumb, lineOf, checkOne, kit } from './shared.js';

/** Move problem i to j (both 0-based). */
export function move(M, i, j) {
  const list = M.data.problems; if (j < 0 || j >= list.length || i === j) return;
  M.commit({ k: 'moved', n: i + 1, up: j < i }, d => { const [x] = d.problems.splice(i, 1); d.problems.splice(j, 0, x); });
  M.sel = j;
}
/** A new problem of the same kind as the last one: a fresh one from the kit's own generator, else a copy. */
export function addProblem(M) {
  const list = M.data.problems, last = list[list.length - 1]; if (!last || list.length >= 30) return null;
  const K = kit(), T = K && K.logic.TOOLS[last.tool];
  let p = null;
  if (T && !String(last.tool).startsWith('figure.')) {
    for (let i = 0; i < 20 && !p; i++) { const c = K.logic.cleanProblem(T.gen(K.logic.seeded(Date.now() + i * 7919), {})); if (c.p && !checkOne(c.p)) p = c.p; }
  }
  p = p || clone(last);
  M.commit({ k: 'added', n: list.length + 1 }, d => d.problems.push(p));
  M.sel = list.length - 1;
  return M.sel;
}

export function renderList(M, box) {
  const list = M.data.problems;
  box.innerHTML = '';
  const ol = document.createElement('ol'); ol.className = 'ap-list'; ol.setAttribute('aria-label', P('problems'));
  list.forEach((p, i) => {
    const why = checkOne(p);
    const li = document.createElement('li'); li.className = `ap-row${i === M.sel ? ' is-sel' : ''}${why ? ' is-bad' : ''}`; li.dataset.i = i;
    const sub = why ? `⚠️ ${E('needsFix')}` : p.tool === 'figure.number' ? `✓ ${E('answerIs', { a: `\u2066${p.answer}${p.unit ? ` ${p.unit}` : ''}\u2069` })} · ${E('workedN', { n: (p.work || []).length })}`
      : p.tool === 'figure.choice' ? `✓ ${E('answerIs', { a: (p.choices || [])[p.answer] || '' })} · ${E('workedN', { n: (p.work || []).length })}` : `✓ ${E('kitSteps')}`;
    li.innerHTML = `<button type="button" class="ap-grip" draggable="true" aria-label="${E('moveRow', { n: i + 1 })}" title="${E('moveHint')}"><span aria-hidden="true">⠿</span></button><span class="ap-n" aria-hidden="true">${i + 1}</span><span class="ap-t"><b dir="auto"></b><small class="${why ? 'bad' : 'ok'}">${sub}</small></span><button type="button" class="ap-edit" aria-label="${E('editN', { n: i + 1 })}"><span aria-hidden="true">✏️</span></button>`;
    li.querySelector('b').textContent = lineOf(p);
    li.querySelector('.ap-n').after(thumb(p));
    const grip = li.querySelector('.ap-grip');
    // keyboard: the arrow keys move the row (the editor's Up and Down do the same)
    grip.addEventListener('keydown', e => { const d = e.key === 'ArrowUp' ? -1 : e.key === 'ArrowDown' ? 1 : 0; if (!d) return; e.preventDefault(); move(M, i, i + d); M.render(); const g = $grip(box, M.sel); if (g) g.focus(); });
    grip.addEventListener('dragstart', e => { M.drag = i; e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', String(i)); } catch { /* old browsers */ } li.classList.add('is-drag'); });
    grip.addEventListener('dragend', () => { M.drag = null; li.classList.remove('is-drag'); });
    li.addEventListener('dragover', e => { if (M.drag === null || M.drag === undefined) return; e.preventDefault(); li.classList.add('is-over'); });
    li.addEventListener('dragleave', () => li.classList.remove('is-over'));
    li.addEventListener('drop', e => { e.preventDefault(); li.classList.remove('is-over'); const from = M.drag; M.drag = null; if (from !== null && from !== undefined) { move(M, from, i); M.render(); } });
    li.querySelector('.ap-edit').addEventListener('click', () => { M.sel = i; M.edit(i); });
    li.addEventListener('click', e => { if (e.target.closest('button')) return; M.sel = i; M.render(); });
    ol.append(li);
  });
  box.append(ol);
  const acts = document.createElement('div'); acts.className = 'ap-acts';
  acts.innerHTML = `<button type="button" class="btn btn-sm" data-ap="add"${list.length >= 30 ? ' disabled' : ''}>＋ ${E('add')}</button><button type="button" class="btn btn-sm" data-ap="copy"${list.length >= 30 || !list.length ? ' disabled' : ''}>⧉ ${E('copyN', { n: Math.min(M.sel, list.length - 1) + 1 })}</button>`;
  acts.querySelector('[data-ap="add"]').addEventListener('click', () => { const at = addProblem(M); M.render(); if (at !== null) M.edit(at); });
  acts.querySelector('[data-ap="copy"]').addEventListener('click', () => {
    const i = Math.min(M.sel, list.length - 1);
    M.commit({ k: 'copied', n: i + 1 }, d => d.problems.splice(i + 1, 0, clone(d.problems[i])));
    M.sel = i + 1; M.render();
  });
  box.append(acts);
}
const $grip = (box, i) => box.querySelector(`.ap-row[data-i="${i}"] .ap-grip`);
