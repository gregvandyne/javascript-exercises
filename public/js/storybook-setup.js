// The book maker's setup steps (/library/make; server/routes/storybook.js, docs/storybook-builder.md), in the Builder's
// step-by-step pattern: 1 start (Upload your own book or Have AI make one), 2 a few choices (the kind of book, grade,
// length, endings, reading level, a theme, pictures), 3 the teacher's own words, files and pictures, 4 check exactly what Oomba
// will get (the server scrubs and screens it), then Make my book. Nothing is stored until then, except pictures (checked
// and kept for a day until the book claims them). The choices live in this tab (sessionStorage) so a refresh keeps them.
import { api, t, esc, pageData, toast } from '/js/app.js';
import { iconHtml } from '/js/icons.js';
import { uploadPic } from '/js/storybook-pic.js';

const D = pageData();
const root = document.getElementById('sb-setup');
const KEY = 'sb-setup';
const store = { get: () => { try { return JSON.parse(sessionStorage.getItem(KEY) || 'null'); } catch { return null; } }, set: v => { try { sessionStorage.setItem(KEY, JSON.stringify(v)); } catch { /* no storage */ } }, clear: () => { try { sessionStorage.removeItem(KEY); } catch { /* no storage */ } } };
const S = { step: 'start', source: '', kind: '', grade: '2', length: 'short', endings: '2', level: 'growing', theme: '', pictures: 'ai', story: '', about: '', files: [], pics: [], ...(store.get() || {}) };
const $ = id => document.getElementById(id);
const STEPS = ['start', 'options', 'context', 'check'];

function save() { S.story = $('sb-story').value; S.about = $('sb-about').value; store.set(S); }
function draw() {
  for (const el of root.querySelectorAll('[data-g]')) {
    const g = el.dataset.g, on = g === 'source' ? S.source === el.dataset.v : g === 'kind' ? S.kind === el.dataset.v && el.dataset.src === S.source : S[g] === el.dataset.v;
    el.setAttribute('aria-pressed', on ? 'true' : 'false');
  }
  root.querySelectorAll('.sb-kind').forEach(el => { el.hidden = el.dataset.src !== S.source; });
  root.querySelectorAll('[data-src-only]').forEach(el => { el.hidden = el.dataset.srcOnly !== S.source; });
  root.querySelector('[data-group="endings"]').hidden = S.kind !== 'cyoa';
  root.querySelector('[data-group="theme"]').hidden = S.source !== 'ai';
  $('sb-files').innerHTML = S.files.map((f, i) => `<li>${iconHtml('📄', { size: 16 })} <span dir="auto">${esc(f.name)}</span> <span class="small muted">${esc(t('js.storybook-setup.words', { count: f.words }))}</span> <button type="button" class="btn btn-sm btn-ghost" data-rmfile="${i}">${esc(t('js.storybook-setup.remove'))}</button></li>`).join('');
  $('sb-pics').innerHTML = S.pics.map(p => `<li><img src="/api/library/make/pic/${esc(p.id)}" alt="" width="96" height="64"><span class="small" dir="auto">${esc(p.name)}</span><button type="button" class="btn btn-sm btn-ghost" data-rmpic="${esc(p.id)}">${esc(t('js.storybook-setup.remove'))}</button></li>`).join('');
}
function show(step, { focus = true } = {}) {
  S.step = step; save();
  root.querySelectorAll('.sb-step').forEach(el => { el.hidden = el.dataset.step !== step; });
  root.querySelectorAll('[data-dot]').forEach(el => { const i = STEPS.indexOf(el.dataset.dot), k = STEPS.indexOf(step); el.classList.toggle('done', i < k); if (i === k) el.setAttribute('aria-current', 'step'); else el.removeAttribute('aria-current'); });
  draw();
  if (step === 'check') check();
  if (focus) { const h = root.querySelector(`[data-step="${step}"] h2`); if (h) h.focus({ preventScroll: true }); window.scrollTo({ top: 0, behavior: 'smooth' }); }
}
const errAt = (id, msg) => { const el = $(id); el.textContent = msg || ''; };

// ---------------------------------------------------------------- picking
root.addEventListener('click', e => {
  const c = e.target.closest('[data-g]');
  if (c) {
    const g = c.dataset.g, v = c.dataset.v;
    if (g === 'source') { if (S.source !== v) S.kind = ''; S.source = v; save(); show('options'); return; }
    if (g === 'theme') S.theme = S.theme === v ? '' : v; else S[g] = v;
    errAt('sb-opt-err', ''); save(); draw(); return;
  }
  const go = e.target.closest('[data-go]');
  if (go) {
    const to = go.dataset.go;
    if (to === 'context' && STEPS.indexOf(S.step) < 2 && !S.kind) { errAt('sb-opt-err', t('js.storybook-setup.needKind')); return; }
    if (to === 'check' && S.source === 'upload' && $('sb-story').value.replace(/\s+/g, ' ').trim().length < D.limits.storyMin) { errAt('sb-ctx-err', t('js.storybook-setup.needStory')); $('sb-story').focus(); return; }
    errAt('sb-ctx-err', '');
    show(to); return;
  }
  const rf = e.target.closest('[data-rmfile]');
  if (rf) { S.files.splice(+rf.dataset.rmfile, 1); save(); draw(); return; }
  const rp = e.target.closest('[data-rmpic]');
  if (rp) { const id = rp.dataset.rmpic; S.pics = S.pics.filter(p => p.id !== id); save(); draw(); api(`/api/library/make/pic/${encodeURIComponent(id)}/remove`, { method: 'POST' }).catch(() => {}); }
});
$('sb-story').addEventListener('input', save);
$('sb-about').addEventListener('input', save);

// ---------------------------------------------------------------- a document: its text goes into the box (to read and edit)
$('sb-file-btn').addEventListener('click', () => $('sb-file').click());
$('sb-file').addEventListener('change', async () => {
  const f = $('sb-file').files[0]; $('sb-file').value = '';
  if (!f) return;
  if (S.files.length >= D.limits.files) { errAt('sb-ctx-err', t('js.storybook-setup.tooManyFiles', { count: D.limits.files })); return; }
  const btn = $('sb-file-btn'); btn.disabled = true; errAt('sb-ctx-err', t('js.storybook-setup.reading'));
  try {
    const r = await fetch(`/api/library/make/file?name=${encodeURIComponent(f.name)}`, { method: 'POST', credentials: 'same-origin', body: f, headers: { 'Content-Type': 'application/octet-stream', Accept: 'application/json' } });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || t('js.storybook-setup.fileFailed'));
    const box = S.source === 'upload' ? $('sb-story') : $('sb-about');
    box.value = `${box.value.trim()}${box.value.trim() ? '\n\n' : ''}${j.text}`.slice(0, +box.maxLength);
    S.files.push({ name: j.name, words: j.words }); save(); draw();
    errAt('sb-ctx-err', '');
    toast(j.cut ? t('js.storybook-setup.fileCut') : t('js.storybook-setup.fileIn'));
  } catch (e) { errAt('sb-ctx-err', e.message); } finally { btn.disabled = false; }
});

// ---------------------------------------------------------------- pictures: a JPEG made here, checked on the server
$('sb-pic-btn').addEventListener('click', () => $('sb-pic').click());
$('sb-pic').addEventListener('change', async () => {
  const files = [...$('sb-pic').files]; $('sb-pic').value = '';
  const btn = $('sb-pic-btn'); btn.disabled = true;
  for (const f of files) {
    if (S.pics.length >= D.limits.pics) { errAt('sb-ctx-err', t('js.storybook-setup.tooManyPics', { count: D.limits.pics })); break; }
    errAt('sb-ctx-err', t('js.storybook-setup.checkingPic'));
    try { S.pics.push(await uploadPic(f, '/api/library/make/pic', { maxSide: D.pic.maxSide, failText: t('js.storybook-setup.picFailed') })); save(); draw(); errAt('sb-ctx-err', ''); } catch (e) { errAt('sb-ctx-err', e.message); }
  }
  btn.disabled = false;
});

// ---------------------------------------------------------------- check: exactly what will be sent
const setupBody = () => ({ source: S.source, kind: S.kind, grade: S.grade, length: S.length, endings: S.endings, level: S.level, theme: S.theme, pictures: S.pictures, about: $('sb-about').value, story: $('sb-story').value, files: S.files.map(f => ({ name: f.name })), pics: S.pics.map(p => p.id) });
const chipName = (g, v) => { const el = root.querySelector(`[data-g="${g}"][data-v="${CSS.escape(String(v))}"]${g === 'kind' ? `[data-src="${S.source}"]` : ''}`); return el ? (el.querySelector('.sb-card-t') || el).textContent.trim() : ''; };
let checked = null;
async function check() {
  const box = $('sb-check'); box.innerHTML = `<p class="muted">${esc(t('js.storybook-setup.checking'))}</p>`; $('sb-go').disabled = true; errAt('sb-chk-err', '');
  try {
    const r = await api('/api/library/make/check', { method: 'POST', body: { setup: setupBody() } });
    checked = r;
    const s = r.setup;
    const edit = step => `<button type="button" class="btn btn-sm btn-ghost sb-editlink" data-go="${step}">${iconHtml('✏️', { size: 16 })} ${esc(t('js.storybook-setup.edit'))}</button>`;
    const row = (label, value, step) => `<div class="sb-sum-row"><dt>${esc(label)}</dt><dd>${value}</dd><dd class="sb-sum-edit">${edit(step)}</dd></div>`;
    const text = v => (v ? `<div class="sb-sent" dir="auto" tabindex="0">${esc(v)}</div>` : `<span class="muted">${esc(t('js.storybook-setup.none'))}</span>`);
    const opts = [chipName('grade', s.grade), chipName('length', s.length), s.kind === 'cyoa' ? t('js.storybook-setup.endingsN', { count: s.endings }) : '', chipName('level', s.level), s.theme ? chipName('theme', s.theme) : '', chipName('pictures', s.pictures)].filter(Boolean).map(esc).join(' · ');
    box.innerHTML = `<dl class="sb-sum">
      ${row(t('js.storybook-setup.sum.start'), esc(chipName('source', s.source)), 'start')}
      ${row(t('js.storybook-setup.sum.kind'), esc(r.labels.kind), 'options')}
      ${row(t('js.storybook-setup.sum.options'), opts, 'options')}
      ${s.source === 'upload' ? row(t('js.storybook-setup.sum.story'), text(s.story), 'context') : ''}
      ${row(t(s.source === 'upload' ? 'js.storybook-setup.sum.notes' : 'js.storybook-setup.sum.about'), text(s.about), 'context')}
      ${s.files.length ? row(t('js.storybook-setup.sum.files'), s.files.map(n => `<span dir="auto">${esc(n)}</span>`).join(', '), 'context') : ''}
      ${row(t('js.storybook-setup.sum.pics'), esc(r.pics ? t('js.storybook-setup.sum.picsN', { count: r.pics }) : t('js.storybook-setup.none')), 'context')}
    </dl>
    ${r.removed ? `<p class="notice">${iconHtml('🔒', { size: 18 })} ${esc(t('js.storybook-setup.removed', { count: r.removed }))}</p>` : ''}
    ${r.need ? `<p class="notice warn" role="alert">${esc(r.need)}</p>` : ''}
    ${r.blocked ? `<p class="notice warn" role="alert">${iconHtml('⚠️', { size: 18 })} ${esc(r.blocked)}</p>` : ''}
    ${!r.left ? `<p class="notice warn" role="alert">${esc(t('js.storybook-setup.noneLeft'))}</p>` : ''}`;
    $('sb-go').disabled = !r.ok || !r.left;
  } catch (e) { box.innerHTML = ''; errAt('sb-chk-err', e.message); }
}
$('sb-go').addEventListener('click', async () => {
  if (!checked || !checked.ok) return;
  const btn = $('sb-go'); btn.disabled = true; errAt('sb-chk-err', '');
  try {
    const r = await api('/api/library/make/start', { method: 'POST', body: { setup: setupBody() } });
    store.clear();
    location.href = r.redirect;
  } catch (e) { errAt('sb-chk-err', e.message); btn.disabled = false; }
});

// Back where the teacher was (a refresh, or Back from the check); their words come back into the boxes.
$('sb-story').value = S.story || ''; $('sb-about').value = S.about || '';
show(STEPS.includes(S.step) && (S.step === 'start' || S.source) ? S.step : 'start', { focus: false });
