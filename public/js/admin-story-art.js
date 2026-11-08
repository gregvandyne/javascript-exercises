// /admin/story-art: the AI-drawn lab (routes/story-art.js). Shows the estimate before a test, starts one, and polls
// the running test until its pictures and video are there. Admin only; English like the rest of the admin panel.
import { api, toast, esc, $ } from '/js/app.js';

const data = JSON.parse(document.getElementById('page-data').textContent);
const runs = new Map((data.runs || []).map(r => [r.id, r]));
const ACTIVE = ['queued', 'writing', 'directing', 'sheet', 'scenes', 'voicing', 'assembling'];
const STAGE = { queued: 'Waiting', writing: 'Writing the script', directing: 'Planning the pictures', sheet: 'Drawing the characters', scenes: 'Drawing the scenes', voicing: 'Reading the lines', assembling: 'Making the video', done: 'Done', failed: 'Failed' };
const usd = n => '$' + (+n || 0).toFixed(3).replace(/0$/, '');
const secs = s => (s == null ? '–' : s >= 90 ? `${Math.floor(s / 60)} min ${Math.round(s % 60)} s` : `${Math.round(s)} s`);

function estimate() {
  const n = +$('#sa-scenes').value, q = $('#sa-quality').value, p = data.prices[q];
  const images = n + 1, total = images * p + n * data.editUsd + data.claudeUsd;
  $('#sa-est').textContent = `About ${usd(total)}: ${images} pictures (a character sheet + ${n} scenes) at ${usd(p)} each, the reference picture each scene sends (~${usd(data.editUsd)}), and Claude (~${usd(data.claudeUsd)}). Every picture is counted in the AI budget.`;
}
for (const id of ['#sa-scenes', '#sa-quality']) $(id).addEventListener('change', estimate);
estimate();

const fig = (url, alt, cap) => `<figure class="sa-fig">${url ? `<a href="${esc(url)}" target="_blank" rel="noopener"><img src="${esc(url)}" alt="${esc(alt)}" loading="lazy"></a>` : '<div class="sa-none">not drawn</div>'}<figcaption class="small">${cap}</figcaption></figure>`;
function card(r) {
  const busy = ACTIVE.includes(r.status), cost = (r.usd.images || 0) + (r.usd.claude || 0);
  const took = r.finishedAt ? (r.finishedAt - r.createdAt) / 1000 : null;
  const bible = r.characters.length ? `<ul class="small sa-bible">${r.characters.map(c => `<li><b>${esc(c.name)}</b>: ${esc(c.look)}</li>`).join('')}</ul>` : '';
  const sheet = r.sheet ? fig(r.sheet.url, 'Character sheet', r.sheet.error ? `Character sheet: <b>not drawn</b> (${esc(r.sheet.code)}: ${esc(r.sheet.error)})` : `Character sheet · ${usd(r.sheet.usd)} · ${secs(r.sheet.seconds)}`) : '';
  const scenes = r.scenes.map(s => `<div>${fig(s.url, `Scene ${s.index + 1}`, `Scene ${s.index + 1} · ${esc(s.shot.replace('_', '-'))} · ${s.mode === 'text' ? 'descriptions only' : 'with the sheet'}${s.error ? ` · <b>refused or failed</b> (${esc(s.code)}): ${esc(s.error)}` : ` · ${usd(s.usd)} · ${secs(s.seconds)}`}`)}
    <details class="small"><summary>Words and prompt</summary>${s.lines.map(l => `<p>“${esc(l)}”</p>`).join('')}<pre class="sa-prompt">${esc(s.prompt)}</pre></details></div>`).join('');
  return `<article class="panel sa-run" id="run-${esc(r.id)}" aria-label="Test ${esc(r.title || r.idea)}">
    <h3>${esc(r.title || r.idea.slice(0, 80))}</h3>
    <p class="small muted">${new Date(r.createdAt).toLocaleString()} · ${r.n} scenes · ${esc(r.quality)} · ${esc(r.model)}${r.storyId ? ' · from an existing story' : ''}</p>
    <p><b>${STAGE[r.status] || esc(r.status)}</b>${busy ? ` <progress max="1" value="${r.progress}">${Math.round(r.progress * 100)}%</progress>` : ''}</p>
    ${r.status === 'failed' ? `<p class="notice warn" role="alert">${esc(r.error)}</p>` : ''}
    <p class="small">Pictures made: <b>${r.images}</b> (estimated ${r.estimate.images}) · cost so far <b>${usd(cost)}</b> (pictures ${usd(r.usd.images)}, Claude ≈ ${usd(r.usd.claude)}; estimated ${usd(r.estimate.usd)})${took ? ` · took <b>${secs(took)}</b>` : ''}</p>
    ${r.notes.length ? `<ul class="small">${r.notes.map(n => `<li>${esc(n)}</li>`).join('')}</ul>` : ''}
    ${r.video ? `<video class="sa-video" controls playsinline preload="metadata" poster="${esc(r.video.poster)}" src="${esc(r.video.url)}"></video><p class="small muted">${secs(r.video.seconds)} · voice: ${esc(r.video.voice)} · <a href="${esc(r.video.url)}" download>Download</a></p>` : ''}
    ${bible}
    <div class="sa-grid">${sheet}${scenes}</div>
    ${r.sheet && r.sheet.prompt ? `<details class="small"><summary>Character sheet prompt</summary><pre class="sa-prompt">${esc(r.sheet.prompt)}</pre></details>` : ''}
  </article>`;
}
function render() {
  const list = [...runs.values()].sort((a, b) => b.createdAt - a.createdAt);
  $('#sa-runs').innerHTML = list.length ? list.map(card).join('') : '<p class="muted">No tests yet.</p>';
  $('#sa-go').disabled = list.some(r => ACTIVE.includes(r.status));
}
render();

let timer = null;
function poll() {
  clearTimeout(timer);
  const live = [...runs.values()].filter(r => ACTIVE.includes(r.status));
  if (!live.length) return;
  timer = setTimeout(async () => {
    for (const r of live) {
      try { const x = await api(`/api/admin/story-art/runs/${r.id}`, { background: true }); runs.set(x.run.id, x.run); } catch { /* try again next time */ }
    }
    render(); poll();
  }, 3000);
}
poll();

$('#sa-form').addEventListener('submit', async e => {
  e.preventDefault();
  $('#sa-err').textContent = '';
  const f = e.target, go = $('#sa-go');
  go.disabled = true;
  try {
    const r = await api('/api/admin/story-art/runs', { method: 'POST', body: { idea: f.idea.value, storyId: f.storyId.value, scenes: +f.scenes.value, quality: f.quality.value } });
    runs.set(r.run.id, r.run); render(); poll();
    toast('Started. This page updates as it goes (a few minutes).');
    document.getElementById(`run-${r.run.id}`).scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (ex) {
    $('#sa-err').textContent = ex.message + (ex.data && ex.data.errors ? ` ${ex.data.errors.join(' ')}` : '');
    go.disabled = false;
  }
});
