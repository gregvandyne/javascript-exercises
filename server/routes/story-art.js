// The AI-drawn story lab (services/story-art.js; docs/story-builder.md "AI-drawn lab (admin only)"): the platform
// admin tries a story drawn by an image model as hand-drawn comic stills, from their phone. Admin only (404 for
// everyone else, pages, APIs and files alike); English like the rest of the admin panel. Nothing here is kid-facing.
//   GET  /admin/story-art                       the page (form, estimate, the last runs)
//   POST /api/admin/story-art/runs              { idea, scenes, quality, storyId } -> 202 { run } (a background job)
//   GET  /api/admin/story-art/runs/:id          -> { run } (the page polls it while it works)
//   GET  /admin/story-art/runs/:id/:file        the run's pictures, video and poster
import fs from 'node:fs';
import { Router } from 'express';
import { html, raw, jsonData } from '../views/html.js';
import { page } from '../views/layout.js';
import { requireAdmin } from '../auth.js';
import { config } from '../config.js';
import { allow } from '../services/ratelimit.js';
import * as aiBudget from '../services/ai-budget.js';
import * as A from '../services/story-art.js';
import { COMMUNITY_CSS } from './social.js';

export const router = Router();
router.use('/admin/story-art', requireAdmin);
router.use('/api/admin/story-art', requireAdmin);

const ERRORS = {
  noKey: ['The site has no OpenAI key (TTS_API_KEY with the OpenAI voice, or STT_API_KEY with STT_PROVIDER=openai).', 503],
  noClaude: ['Claude is off here (no ANTHROPIC_API_KEY), so no script can be written.', 503],
  resting: ['The AI budget is resting (the daily or monthly cap is reached). Try again after it resets.', 503],
  overBudget: ['This test would go over today\'s AI budget. Pick fewer scenes or a lower quality, or try tomorrow.', 503],
  busy: ['A test is already running. Wait for it to finish.', 409],
  limit: [`At most ${config.storyArtPerHour} tests an hour. Try again a little later.`, 429],
  empty: ['Type a story idea, or pick a story.', 400],
  noStory: ['That story is not finished or is gone.', 404],
  idea: ['The idea did not pass the kid-safe screening.', 400],
};
const fail = (res, code, extra = {}) => { const [error, status] = ERRORS[code] || ['Something went wrong.', 500]; return res.status(status).json({ code, error, ...extra }); };

/** What the page shows of a run: its state and results, with file URLs (the admin only). */
export function view(r) {
  if (!r) return null;
  const url = f => (f ? `/admin/story-art/runs/${r.id}/${f}` : null);
  return {
    id: r.id, status: r.status, progress: r.progress, code: r.code, error: r.error, createdAt: r.createdAt, finishedAt: r.finishedAt,
    idea: r.idea, storyId: r.storyId, title: r.title, n: r.n, quality: r.quality, size: r.size, model: r.model, estimate: r.estimate,
    images: r.images, usd: r.usd, notes: r.notes, timings: r.timings,
    characters: r.direction ? r.direction.characters : [],
    sheet: r.sheet ? { ...r.sheet, url: url(r.sheet.file), prompt: r.prompts ? r.prompts.sheet : '' } : null,
    scenes: (r.scenes || []).map(s => ({ ...s, url: url(s.file), prompt: r.prompts ? (s.mode === 'text' ? r.prompts.scenesText : r.prompts.scenes)[s.index] : '',
      lines: r.script && r.script.scenes[s.index] ? r.script.scenes[s.index].lines.map(l => l.say) : [] })),
    video: r.video ? { ...r.video, url: url(r.video.file), poster: url(r.video.poster) } : null,
  };
}

const usd = n => '$' + (+n || 0).toFixed(2);
router.get('/admin/story-art', (req, res) => {
  const b = aiBudget.status(undefined, 'free'), key = !!A.openaiKey(), stories = A.storyChoices(req.user);
  const body = html`
  <div class="pagehead"><h1>🎨 AI-drawn lab</h1></div>
  <section class="panel small">
    <p>Try a story drawn as hand-drawn comic pictures by an image model, put together with the story voice, music and words. <b>Admin only</b>: no kid sees this page, its pictures or its videos.</p>
    <p><b>Image model</b> ${config.storyArtModel} · ${A.SIZE} · <b>OpenAI key</b> ${key ? 'set' : html`<b>missing</b>`} · <b>AI budget today</b> ${usd(b.today)} of ${usd(b.daily)}${b.ok ? '' : html` <b>(resting)</b>`} · at most ${config.storyArtPerHour} tests an hour</p>
  </section>
  <form class="panel stack" id="sa-form" novalidate>
    <div class="field"><label for="sa-idea">Story idea</label>
      <textarea class="input" id="sa-idea" name="idea" rows="3" maxlength="300">${A.SAMPLE_IDEA}</textarea></div>
    <div class="field"><label for="sa-story">Or use an existing story's script</label>
      <select class="input" id="sa-story" name="storyId"><option value="">No: write a new script from the idea</option>
        ${stories.map(s => html`<option value="${s.id}">${s.mine ? '★ ' : ''}${s.title || s.idea.slice(0, 50)}${s.mine ? '' : html` (@${s.username || 'someone'})`}</option>`)}</select></div>
    <div class="row sa-pick">
      <label class="field"><span>Scenes</span><select class="input" id="sa-scenes" name="scenes">${[3, 4, 5, 6].map(n => html`<option ${n === A.SCENES.def ? raw('selected') : ''}>${n}</option>`)}</select></label>
      <label class="field"><span>Quality</span><select class="input" id="sa-quality" name="quality">${A.QUALITIES.map(q => html`<option value="${q}" ${q === 'medium' ? raw('selected') : ''}>${q} (${usd(A.IMAGE_USD[q])} a picture)</option>`)}</select></label>
    </div>
    <p class="small" id="sa-est" aria-live="polite"></p>
    <p class="err" id="sa-err" role="alert"></p>
    <button class="btn btn-primary btn-big" type="submit" id="sa-go">🎬 Make test</button>
  </form>
  <h2 class="stats-h">Tests</h2>
  <div id="sa-runs" class="stack"></div>
  ${jsonData('page-data', { runs: A.listRuns(10).map(view), prices: A.IMAGE_USD, editUsd: A.EDIT_INPUT_USD, claudeUsd: A.CLAUDE_USD })}`;
  page(req, res, { title: 'AI-drawn lab', active: 'me', body, head: raw(`${COMMUNITY_CSS}<link rel="stylesheet" href="/css/stats.css"><link rel="stylesheet" href="/css/story-art.css">`), scripts: ['/js/admin-story-art.js'], back: '/admin', backLabel: 'Admin' });
});

router.post('/api/admin/story-art/runs', async (req, res) => {
  res.set('Cache-Control', 'no-store');
  if (!allow(`story-art:${req.user.id}`, 10, 60e3)) return res.status(429).json({ code: 'fast', error: 'Slow down a little.' });
  const b = req.body || {};
  const r = await A.start(req.user, { idea: String(b.idea || ''), scenes: b.scenes, quality: String(b.quality || 'medium'), storyId: String(b.storyId || '') });
  if (!r.ok) return fail(res, r.code, r.errors ? { errors: r.errors } : {});
  res.status(202).json({ run: view(r.run) });
});
router.get('/api/admin/story-art/runs/:id', (req, res) => {
  res.set('Cache-Control', 'no-store');
  const r = A.getRun(req.params.id);
  return r ? res.json({ run: view(r) }) : res.status(404).json({ error: 'No such test.' });
});
const TYPES = { jpg: 'image/jpeg', png: 'image/png', mp4: 'video/mp4' };
router.get('/admin/story-art/runs/:id/:file', (req, res) => {
  const file = A.fileOf(req.params.id, req.params.file);
  if (!file || !fs.existsSync(file)) return res.status(404).end();
  const type = TYPES[req.params.file.split('.').pop()];
  res.set({ 'Content-Type': type, 'Cache-Control': 'private, max-age=3600', 'X-Content-Type-Options': 'nosniff' });
  res.sendFile(file, { acceptRanges: true, dotfiles: 'allow', headers: { 'Content-Type': type } }, err => { if (err && !res.headersSent) res.status(404).end(); });
});
