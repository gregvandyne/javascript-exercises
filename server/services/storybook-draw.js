// The book maker's picture drawer (docs/storybook-builder.md "Pictures"): the queue of pictures to draw for each book,
// worked through in this process, a few at a time, apart from any request (like the chat engine's jobs).
//
//   - A book's pictures are one made_book_draws row each: 'cast:<name>' (a character sheet) and 'page:<page id>'. Oomba's
//     turns queue what is new or changed (queueBook); the teacher's Redraw queues one, with an optional note (redraw).
//   - A page waits until the character sheets of its book are drawn, then goes to the picture model with the sheets of
//     the characters in it as reference pictures (storybook-gemini.js), so characters look the same on every page.
//   - Every picture costs one of the teacher's pictures for the UTC day (made_book_ai_days '<day>:draw': one conditional
//     upsert, synchronous, at the moment the picture is drawn, so parallel requests can never get more), and goes
//     through the AI budget (ai-budget.js recordImage). No key, the budget resting, or the day's pictures used: the page
//     keeps its art-pack drawing and the row says why (fallback + reason). A picture Google blocks, or that our picture
//     check (the one teachers' uploads pass: companion.js screenImage) refuses, is never kept: the same fallback.
//   - Only the book's own words go to the picture model: each character's name, what they are and how they look, and
//     each page's scene and setting. Never an art-pack sprite or world name (docs/decisions.md "Book pictures: the story
//     and the pictures are free of the art kit"). The prompt sent is kept on the row (prompt: "What Oomba asked for",
//     for the book's owner only; students' names were taken out before it was made; no pictures).
//   - What is kept: the picture as WebP (made_book_pics, kind 'page' | 'sheet'), at most 1600 px wide (the reader and the
//     print copy), with the fingerprint of what it drew (hash) so the editor can say when a page changed since.
//   - Google's rate limits (docs/storybook-builder.md "Pictures: rate limits and quota"): a 429 pauses the whole queue
//     (this process) until Google's retry time (RetryInfo / Retry-After) or an exponential backoff with jitter, then
//     draws one at a time for a while. The picture goes back to the queue with a not-before time, its attempts not
//     used, and the editor says "Waiting for Google"; it falls back to the art pack only after PACE.waitMaxMs of
//     waiting. A quota of zero (billing not enabled on the key's Google project) falls back at once ('notset'), is
//     logged at most once an hour, and raises one admin alert a day. A call that made no picture is never counted.
import { spawn } from 'node:child_process';
import { q, uid, now, today, audit, setting } from '../db.js';
import { config } from '../config.js';
import { getUser } from '../auth.js';
import * as aiBudget from './ai-budget.js';
import { scrub, studentNames } from '../builder/lesson.js';
import { screenImage as companionScreenImage } from './companion.js';
import { log } from './log.js';
import * as Alerts from './admin-alerts.js';
import * as G from './storybook-gemini.js';
import * as SB from './storybook.js';
import { register } from './jobs.js';

/** Test hook: screenImage(bytes, mime) for the picture check. */
export const hooks = { screenImage: null, log: null };
export const REASONS = ['nokey', 'resting', 'limit', 'blocked', 'refused', 'error', 'busy', 'notset'];
const warn = (msg, fields) => (hooks.log ? hooks.log(msg, fields) : log('warn', msg, fields));
const NOTE_MAX = 200;
const fail = (code, x = {}) => ({ ok: false, code, ...x });

// ---------------------------------------------------------------- is it on, and how many are left
/** The picture model for book pictures: { on, reason: null | 'nokey' | 'resting' }. Forced off with
 *  STORYBOOK_ILLUSTRATOR=packs. */
export function active() {
  if (process.env.STORYBOOK_ILLUSTRATOR === 'packs' || !G.configured()) return { on: false, reason: 'nokey' };
  if (!aiBudget.ok()) return { on: false, reason: 'resting' };
  return { on: true, reason: null };
}
const dayKey = () => `${today()}:draw`;
export const capOf = u => (SB.planHolder(u) ? config.storybookPicturesPlanPerDay : config.storybookPicturesFreePerDay);
export const usedToday = u => (q.get('SELECT n FROM made_book_ai_days WHERE user_id=? AND day=?', u.id, dayKey()) || {}).n || 0;
export const left = u => (SB.canMake(u) ? Math.max(0, capOf(u) - usedToday(u)) : 0);

// ---------------------------------------------------------------- fingerprints
const lower = s => String(s || '').toLowerCase();
const sheetRow = (bookId, name) => q.get('SELECT * FROM made_book_draws WHERE book_id=? AND target=?', bookId, `cast:${lower(name)}`) || null;
/** What a character sheet is drawn from: its name, what it is and its look (the art-pack sprite is not drawn from). A
 *  character from before "what" (24 Nov 2026) keeps its old fingerprint, so its sheet is not painted again by itself. */
export const castHash = c => (c.what ? JSON.stringify(['v2', c.name, c.what, c.look || '']) : JSON.stringify([c.name, c.look || '', c.art]));
/** What a page's picture is drawn from: its scene and setting, and the characters in it with their current sheets. A
 *  page from before "setting" keeps its old fingerprint (with the art-pack world) for the same reason. */
export function pageHash(bookId, b, p) {
  if (!p || !p.pic) return '';
  const v2 = !!p.pic.setting;
  const chars = p.pic.chars.map(c => { const k = b.cast.find(x => x.name === c.name) || {}; const s = sheetRow(bookId, c.name); return v2 ? [c.name, c.pos, k.what || '', k.look || '', s && s.pic_id] : [c.name, c.pos, k.look || '', k.art || '', s && s.pic_id]; });
  return v2 ? JSON.stringify(['v2', p.pic.scene || '', p.alt || '', p.pic.setting, p.pic.mood, chars]) : JSON.stringify([p.pic.scene || '', p.alt || '', p.pic.world, p.pic.mood, chars]);
}

// ---------------------------------------------------------------- the queue
const targets = b => [...b.cast.map(c => `cast:${lower(c.name)}`), ...b.pages.filter(p => p.pic && !p.upload).map(p => `page:${p.id}`)];
function upsertQueued(row, target, note = '') {
  const t = now();
  return q.run(`INSERT INTO made_book_draws(id, book_id, owner_id, target, state, note, created_at, updated_at) VALUES (?,?,?,?, 'queued', ?, ?, ?)
    ON CONFLICT(book_id, target) DO UPDATE SET state='queued', reason='', note=excluded.note, attempts=0, not_before=NULL, wait_since=NULL, updated_at=excluded.updated_at
    WHERE made_book_draws.state NOT IN ('queued', 'drawing')`, uid(12), row.id, row.owner_id, target, note, t, t).changes === 1;
}
const AGAIN = new Set(['nokey', 'resting', 'limit', 'error', 'busy', 'notset']);   // a fallback worth trying again on the next change
/**
 * Queue what a book needs drawn after Oomba changed it: character sheets that are new or whose look changed, and page
 * pictures that are new or whose scene changed (or fell back for a reason that may have passed). Pictures of pages and
 * characters that are gone are removed. Nothing is queued while the picture model is off. -> number queued
 */
export function queueBook(row, b = SB.bookOf(row)) {
  const keep = new Set(targets(b));
  for (const d of q.all('SELECT id, target, pic_id FROM made_book_draws WHERE book_id=?', row.id)) {
    if (keep.has(d.target)) continue;
    // a page with the teacher's own picture keeps its drawn one (they may go back to it); a removed page or character goes
    const pid = d.target.startsWith('page:') ? d.target.slice(5) : null;
    if (pid && b.pages.some(p => p.id === pid)) continue;
    q.run('DELETE FROM made_book_draws WHERE id=?', d.id);
    if (d.pic_id) q.run("DELETE FROM made_book_pics WHERE id=? AND kind!='upload'", d.pic_id);
  }
  // The teacher's Pictures choice: only "Oomba paints them" ever paints (or spends) a picture.
  if (SB.picturesOf(SB.setupOf(row)) !== 'ai' || !active().on) return 0;
  let n = 0;
  const due = (target, hash) => { const d = q.get('SELECT state, reason, hash, pic_id FROM made_book_draws WHERE book_id=? AND target=?', row.id, target); return !d || (d.state !== 'queued' && d.state !== 'drawing' && (d.hash !== hash || (d.state === 'fallback' && !d.pic_id && AGAIN.has(d.reason)))); };
  for (const c of b.cast) if (due(`cast:${lower(c.name)}`, castHash(c)) && upsertQueued(row, `cast:${lower(c.name)}`)) n++;
  for (const p of b.pages) if (p.pic && !p.upload && due(`page:${p.id}`, pageHash(row.id, b, p)) && upsertQueued(row, `page:${p.id}`)) n++;
  if (n) setImmediate(kick);
  return n;
}
/**
 * The teacher's Redraw of one picture (target 'page:<id>' or 'cast:<name>'), with an optional note (the word rules and
 * names check, then scrubbed). -> { ok } | fail ('notFound' | 'nokey' | 'resting' | 'limit' | 'words' | 'names' | 'personal')
 */
export function redraw(u, bookId, target, note = '') {
  const row = SB.ownBook(u, bookId); if (!row) return fail('notFound');
  const b = SB.bookOf(row), m = /^(page|cast):(.{1,40})$/.exec(String(target || ''));
  if (!m) return fail('notFound');
  if (m[1] === 'page') { const p = b.pages.find(x => x.id === m[2]); if (!p || !p.pic || p.upload) return fail('notFound'); }
  else if (!b.cast.some(c => lower(c.name) === lower(m[2]))) return fail('notFound');
  const key = m[1] === 'cast' ? `cast:${lower(m[2])}` : target;
  if (SB.picturesOf(SB.setupOf(row)) !== 'ai') return fail('off');
  const st = active(); if (!st.on) return fail(st.reason);
  if (left(u) <= 0) return fail('limit');
  const text = String(note || '').normalize('NFC').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, NOTE_MAX);
  if (text) { const bad = SB.wordsProblem(u, text); if (bad) return fail(bad); }
  upsertQueued(row, key, scrub(text, studentNames(u)).text);
  audit(u.id, 'storybook.redraw', row.id, { what: m[1], note: !!text });
  setImmediate(kick);
  return { ok: true };
}

/** The pictures of a book that show the art-pack drawing because painting fell back (or never ran: a book made while
 *  the picture model was off): character sheets first, then pages. -> [target] */
export function fallbacks(row, b = SB.bookOf(row)) {
  const rows = new Map(q.all('SELECT target, state, pic_id FROM made_book_draws WHERE book_id=?', row.id).map(d => [d.target, d]));
  return targets(b).filter(tg => { const d = rows.get(tg); return !d || (d.state === 'fallback' && !d.pic_id); });
}
/**
 * "Paint pictures again" (the book page and the chat): every character sheet and page whose picture is an art-pack
 * fallback goes back in the queue, through the same queue, daily picture count (taken when each is drawn) and AI budget.
 * all: "Paint all pictures again" (the book page's More menu, the chat): every character sheet and page picture, painted
 * ones too (a book painted before the pictures were free of the art kit is painted again from its own words). At most
 * the pictures left today are queued (sheets first); the rest wait for the next Paint pictures again.
 * -> { ok, queued, more } | fail ('notFound' | 'off' | 'nokey' | 'resting' | 'limit' | 'none')
 */
export function repaint(u, bookId, { all = false } = {}) {
  const row = SB.ownBook(u, bookId); if (!row) return fail('notFound');
  if (SB.picturesOf(SB.setupOf(row)) !== 'ai') return fail('off');
  const st = active(); if (!st.on) return fail(st.reason);
  const want = all ? targets(SB.bookOf(row)) : fallbacks(row);
  if (!want.length) return fail('none');
  const l = left(u); if (l <= 0) return fail('limit');
  let queued = 0;
  for (const tg of want.slice(0, l)) if (upsertQueued(row, tg)) queued++;
  audit(u.id, 'storybook.repaint', row.id, { queued, more: Math.max(0, want.length - l), all });
  if (queued) setImmediate(kick);
  return { ok: true, queued, more: Math.max(0, want.length - l) };
}

// ---------------------------------------------------------------- what the editor and the reader see
/** The kept picture of a page (a made_book_pics id), or null. */
export const drawnPic = (bookId, pageId) => (q.get("SELECT pic_id FROM made_book_draws WHERE book_id=? AND target=? AND pic_id IS NOT NULL", bookId, `page:${pageId}`) || {}).pic_id || null;
/** Oomba is still painting this page's picture: it is queued or drawing and has no earlier painted picture to show
 *  meanwhile. The editor, the reader, the print copy and the book's card then show the painting placeholder, never the
 *  art-pack drawing (docs/decisions.md "Book pictures: a painting placeholder, never the art pack while painting"). */
export const painting = (bookId, pageId) => !!q.get("SELECT 1 FROM made_book_draws WHERE book_id=? AND target=? AND state IN ('queued','drawing') AND pic_id IS NULL", bookId, `page:${pageId}`);
/** How a book's painting is going (its card's "Painting pictures"): { busy, total, done } over sheets and pages. */
export function progressOf(bookId) {
  const r = q.get("SELECT COUNT(*) total, SUM(state IN ('queued','drawing')) busy, SUM(state IN ('done','fallback')) done FROM made_book_draws WHERE book_id=?", bookId) || {};
  return { total: r.total || 0, busy: r.busy || 0, done: r.done || 0 };
}
/** The book's pictures for the editor (reason 'own' | 'none': the teacher's Pictures choice): { on, reason, left, cap, pages: { id: { state, reason, pic, stale } },
 *  cast: { name: ... }, total, done, busy } */
export function stateOf(u, row, b = SB.bookOf(row)) {
  const choice = SB.picturesOf(SB.setupOf(row));
  const st = choice === 'ai' ? active() : { on: false, reason: choice }, cap = capOf(u), l = left(u);
  const rows = new Map(q.all('SELECT * FROM made_book_draws WHERE book_id=?', row.id).map(d => [d.target, d]));
  // a picture waiting in the queue while Google asked us to wait says so ('google': "Waiting for Google")
  const waiting = now() < pace.until;
  const one = (d, hash) => (d ? { state: d.state, reason: d.state === 'queued' && waiting ? 'google' : d.reason || '', pic: d.pic_id || null, stale: !!(d.pic_id && d.hash && d.hash !== hash && d.state !== 'queued' && d.state !== 'drawing'), note: !!d.note, asked: !!d.prompt } : null);
  const pages = {}, cast = {};
  for (const p of b.pages) { const x = one(rows.get(`page:${p.id}`), pageHash(row.id, b, p)); if (x) pages[p.id] = x; }
  for (const c of b.cast) { const x = one(rows.get(`cast:${lower(c.name)}`), castHash(c)); if (x) cast[c.name] = x; }
  const all = [...Object.values(pages), ...Object.values(cast)];
  return { on: st.on, reason: st.on ? (l <= 0 ? 'limit' : quotaHeld() ? 'notset' : null) : st.reason, left: l, cap, pages, cast,
    total: all.length, done: all.filter(x => x.state === 'done' || x.state === 'fallback').length, busy: all.filter(x => x.state === 'queued' || x.state === 'drawing').length };
}

/** "What Oomba asked for": the prompt last sent to the picture maker for one picture of a book (target 'page:<id>' or
 *  'cast:<name>'), for the book's owner only (anyone else: null, as if there were none). Students' names were taken out
 *  before it was made; it holds no pictures. -> string | null */
export function promptOf(u, bookId, target) {
  const row = SB.ownBook(u, bookId); if (!row) return null;
  const m = /^(page|cast):(.{1,40})$/.exec(String(target || '')); if (!m) return null;
  const d = q.get('SELECT prompt FROM made_book_draws WHERE book_id=? AND target=?', row.id, m[1] === 'cast' ? `cast:${lower(m[2])}` : target);
  return d && d.prompt ? d.prompt : null;
}

// ---------------------------------------------------------------- the worker
let running = 0, recovered = false;
const waiters = [];
/** Claim the next picture: character sheets first; a page only once its book's sheets are drawn. Synchronous. */
function claim() {
  const t = now();
  return q.get(`UPDATE made_book_draws SET state='drawing', attempts=attempts+1, updated_at=? WHERE id=(
      SELECT d.id FROM made_book_draws d WHERE d.state='queued' AND (d.not_before IS NULL OR d.not_before<=?) AND (d.target LIKE 'cast:%' OR NOT EXISTS (
        SELECT 1 FROM made_book_draws c WHERE c.book_id=d.book_id AND c.target LIKE 'cast:%' AND c.state IN ('queued','drawing')))
      ORDER BY (d.target LIKE 'cast:%') DESC, d.updated_at LIMIT 1) AND state='queued' RETURNING *`, t, t) || null;
}
/** Pictures that were drawing when the server stopped go back in the queue (once, at the first kick). */
export function recover() {
  recovered = true;
  q.run("UPDATE made_book_draws SET state='queued', updated_at=? WHERE state='drawing'", now());
}

// ---------------------------------------------------------------- pacing: Google's rate limits, process-wide
/** waitMaxMs: how long one picture may wait for Google before the art pack; slowMs: one at a time for this long after a
 *  429; quotaHoldMs: after a quota of zero, pictures fall back without asking Google for this long; baseMs/maxMs: the
 *  backoff when Google gives no retry time; errorMs: the pause before the second try after another failure. */
export const PACE = { waitMaxMs: 30 * 60e3, slowMs: 10 * 60e3, quotaHoldMs: 10 * 60e3, baseMs: 2e3, maxMs: 5 * 60e3, errorMs: 3e3 };
const HOUR = 3600e3;
const pace = { until: 0, slowUntil: 0, streak: 0, quotaAt: 0, quotaLogAt: 0 };
/** Google said the quota is zero less than PACE.quotaHoldMs ago. */
const quotaHeld = () => !!pace.quotaAt && now() - pace.quotaAt < PACE.quotaHoldMs;
export const QUOTA_ALERT_KEY = 'storybook.pictures.quota_alert_day';
/** The pacing state (tests and the admin). */
export const paceState = () => ({ ...pace });
export function _resetPace() { Object.assign(pace, { until: 0, slowUntil: 0, streak: 0, quotaAt: 0, quotaLogAt: 0 }); clearTimeout(wake); wake = null; wakeT = 0; }
/** Google said 429: the whole queue pauses until its retry time (or an exponential backoff, whichever is later), with
 *  up to 25% jitter, then draws one at a time for PACE.slowMs. -> the time the queue starts again (ms) */
function rateLimited(retryMs) {
  const t = now();
  const back = Math.min(PACE.maxMs, PACE.baseMs * 2 ** Math.min(pace.streak, 16));
  const wait = Math.min(PACE.waitMaxMs, Math.max(retryMs || 0, back) * (1 + Math.random() * 0.25));
  pace.until = Math.max(pace.until, Math.round(t + wait));
  pace.slowUntil = pace.until + PACE.slowMs;
  pace.streak++;
  return pace.until;
}
/** Google said the quota is zero (billing not enabled on the key's project): no use asking again for a while. One warn
 *  line an hour at most, and one admin alert a day. */
function quotaZero(fields) {
  const t = now();
  pace.quotaAt = t;
  if (!pace.quotaLogAt || t - pace.quotaLogAt >= HOUR) {
    pace.quotaLogAt = t;
    warn('storybook pictures: google quota is zero (billing not enabled on the key\'s project?)', { model: G.model(), metric: fields.metric, quota: fields.quotaId, limit: fields.limit });
  }
  try {
    const day = today();
    if (setting(QUOTA_ALERT_KEY) !== day) {
      setting(QUOTA_ALERT_KEY, day);
      Alerts.alert('service', { ref: 'storybook-pictures', summary: 'Book pictures: Google image quota is zero. Turn on billing for the Gemini key\'s Google Cloud project.', url: '/admin' });
    }
  } catch { /* an alert never stops the queue */ }
}
let wake = null, wakeT = 0;
/** Kick the queue again at time t (ms), once (the earliest asked for wins). */
function wakeAt(t) {
  if (wake && wakeT <= t) return;
  clearTimeout(wake);
  wakeT = t;
  wake = setTimeout(() => { wake = null; wakeT = 0; kick(); }, Math.max(10, t - now()));
  if (wake.unref) wake.unref();
}
/** Start drawing what is queued, up to STORYBOOK_DRAW_AT_ONCE at a time (one at a time for a while after a 429; none
 *  while Google asked us to wait). Pictures waiting for a not-before time get a timer. */
export function kick() {
  if (!recovered) recover();
  const t = now();
  if (t < pace.until) { wakeAt(pace.until); return; }
  const most = t < pace.slowUntil ? 1 : config.storybookDrawAtOnce;
  while (running < most) {
    const job = claim(); if (!job) break;
    running++;
    drawJob(job).catch(e => { log('warn', 'storybook picture failed', { book: job.book_id, kind: e && e.name }); end(job, 'fallback', 'error'); })
      .finally(() => { running--; kick(); if (!running) waiters.splice(0).forEach(r => r()); });
  }
  const next = (q.get("SELECT MIN(not_before) t FROM made_book_draws WHERE state='queued' AND not_before>?", t) || {}).t;
  if (next) wakeAt(Math.max(next, pace.until));
}
/** Resolves once nothing is drawing (tests and the screenshots). */
export const settle = () => new Promise(r => { if (!running) r(); else waiters.push(r); });

function end(job, state, reason = '', extra = {}) {
  const sets = ['state=?', 'reason=?', 'updated_at=?', 'not_before=NULL', 'wait_since=NULL'], vals = [state, reason, now()];
  for (const [k, v] of Object.entries(extra)) { sets.push(`${k}=?`); vals.push(v); }
  q.run(`UPDATE made_book_draws SET ${sets.join(', ')} WHERE id=? AND state='drawing'`, ...vals, job.id);
}
const giveBack = u => q.run('UPDATE made_book_ai_days SET n=MAX(0, n-1) WHERE user_id=? AND day=?', u.id, dayKey());

async function drawJob(job) {
  const row = q.get('SELECT * FROM made_books WHERE id=?', job.book_id);
  if (!row) { q.run('DELETE FROM made_book_draws WHERE id=?', job.id); return; }
  const u = getUser(row.owner_id);
  if (!u || !SB.canMake(u)) return end(job, 'fallback', 'nokey');
  const b = SB.bookOf(row);
  const [kind, key] = [job.target.slice(0, 4), job.target.slice(5)];
  const style = G.styleOf(row.id), names = studentNames(u), sc = s => scrub(String(s || ''), names).text;
  // the book's own words only: never the art-pack sprite's name (c.art) or world (p.pic.world)
  const charOf = c => ({ name: sc(c.name), what: sc(c.what), look: sc(c.look) });
  let prompt, refs = [], aspect = '16:9', hash, label;
  if (kind === 'cast') {
    const c = b.cast.find(x => lower(x.name) === key);
    if (!c) { q.run('DELETE FROM made_book_draws WHERE id=?', job.id); return; }
    prompt = G.sheetPrompt(charOf(c), style); aspect = '1:1'; hash = castHash(c); label = 'sheet';
  } else {
    const p = b.pages.find(x => x.id === key);
    if (!p || !p.pic || p.upload) return end(job, 'done', '');
    const chars = p.pic.chars.map(pc => {
      const c = b.cast.find(x => x.name === pc.name); if (!c) return null;
      const s = sheetRow(row.id, c.name), pic = s && s.pic_id ? q.get('SELECT bytes, mime FROM made_book_pics WHERE id=?', s.pic_id) : null;
      if (pic) refs.push({ label: sc(c.name), mime: pic.mime, bytes: pic.bytes });
      return { ...charOf(c), pos: pc.pos, ref: !!pic };
    }).filter(Boolean);
    // a character with no sheet is described in words only; the references keep the same order as the list
    chars.sort((a, c) => Number(c.ref) - Number(a.ref));
    const scene = sc(p.pic.scene || p.alt || p.text.slice(0, 300));
    prompt = G.pagePrompt({ scene, setting: sc(p.pic.setting), mood: p.pic.mood, chars, note: sc(job.note) }, style);
    hash = pageHash(row.id, b, p); label = 'page';
  }
  const st = active(); if (!st.on) return end(job, 'fallback', st.reason);
  // Google said lately that the key's project has no picture quota: the art pack, without asking (or counting) again
  if (quotaHeld()) return end(job, 'fallback', 'notset');
  if (!SB.take(u, { key: dayKey(), cap: capOf(u) })) return end(job, 'fallback', 'limit');
  // Reference pictures go to Google as PNG: in production every page call with our WebP sheets came back 400 "Unable to
  // process input image" (23 Nov 2026). Each is converted once here; one Google cannot take is dropped and that
  // character is described in words only (the prompt already carries its look).
  const sent = [];
  for (const x of refs) { const png = await toPng(x.bytes).catch(() => null); if (png) sent.push({ ...x, mime: 'image/png', bytes: png }); }
  // What Oomba asked for: the prompt as sent (and the labels of the reference pictures sent with it), kept on the row
  q.run('UPDATE made_book_draws SET prompt=? WHERE id=?', `${prompt}${sent.length ? `\n${sent.map((x, i) => `Reference picture ${i + 1}: ${x.label}.`).join('\n')}` : ''}`, job.id);
  let r = await G.generate({ prompt, refs: sent, aspect });
  if (!r.ok && r.http === 400 && sent.length && /input image/i.test(`${r.gmsg || ''} ${r.gmsgFull || ''}`)) {
    warn('storybook picture refs refused, drawing from words', { book: row.id, refs: sent.length, sig: sent.map(x => x.bytes.subarray(0, 4).toString('hex')), sizes: sent.map(x => x.bytes.length) });
    q.run('UPDATE made_book_draws SET prompt=? WHERE id=?', prompt, job.id);
    r = await G.generate({ prompt, refs: [], aspect });
  }
  if (r.ok) log('info', 'storybook picture drawn', { book: row.id, what: label, refs: sent.length });
  if (r.usage || r.ok || r.code === 'blocked') aiBudget.recordImage(G.model(), r.usage, r.ok ? 1 : 0);
  if (!r.ok) {
    if (r.code === 'blocked') { audit(u.id, 'storybook.draw.blocked', row.id, { what: label, why: String(r.why || '').slice(0, 40) }); return end(job, 'fallback', 'blocked', { hash }); }
    giveBack(u);   // nothing was made: the picture is not counted
    // what Google said, in fixed fields only (never the key, never the prompt)
    warn('storybook picture model failed', { book: row.id, why: r.why, code: r.code, attempt: job.attempts,
      ...(r.http ? { http: r.http, status: r.gstatus || null, message: r.gmsg || null, ...(r.gmsgFull ? { messageFull: r.gmsgFull } : {}), metric: r.metric || null, quota: r.quotaId || null, limit: r.limit, retryMs: r.retryMs } : {}) });
    if (r.code === 'quota_zero') { quotaZero(r); return end(job, 'fallback', 'notset'); }
    if (r.code === 'rate_limited') {
      // back to the queue, its attempt not used, not before the queue starts again; the art pack only after a long wait
      const until = rateLimited(r.retryMs), since = job.wait_since || now();
      if (until - since > PACE.waitMaxMs) return end(job, 'fallback', 'busy');
      q.run("UPDATE made_book_draws SET state='queued', reason='google', attempts=MAX(0, attempts-1), not_before=?, wait_since=?, updated_at=? WHERE id=? AND state='drawing'", until, since, now(), job.id);
      return;
    }
    if (job.attempts < 2 && r.code !== 'nokey') {
      q.run("UPDATE made_book_draws SET state='queued', not_before=?, updated_at=? WHERE id=? AND state='drawing'", now() + Math.round(PACE.errorMs * (1 + Math.random())), now(), job.id);
      return;
    }
    return end(job, 'fallback', r.code === 'nokey' ? 'nokey' : 'error');
  }
  pace.streak = 0; pace.quotaAt = 0;   // Google answered: the backoff starts small again (and the quota is there)
  let img;
  try { img = await toJpeg(r.bytes); } catch { img = null; }
  if (!img) return end(job, 'fallback', 'error', { hash });
  const verdict = hooks.screenImage ? await hooks.screenImage(img.bytes, img.mime) : await companionScreenImage(img.bytes, img.mime);
  if (verdict !== 'allow') {
    if (verdict !== 'resting') audit(u.id, 'storybook.draw.refused', row.id, { what: label, verdict });
    return end(job, 'fallback', verdict === 'resting' ? 'resting' : 'refused', { hash });
  }
  if (!q.get('SELECT 1 FROM made_books WHERE id=?', row.id)) return;
  const id = uid(14), old = q.get('SELECT pic_id FROM made_book_draws WHERE id=?', job.id);
  q.run('INSERT INTO made_book_pics(id, owner_id, book_id, name, width, height, bytes, created_at, kind, mime) VALUES (?,?,?,?,?,?,?,?,?,?)',
    id, u.id, row.id, `${label}.${img.mime === 'image/png' ? 'png' : 'jpg'}`, img.width, img.height, img.bytes, now(), label, img.mime);
  end(job, 'done', '', { pic_id: id, hash, note: '' });
  if (old && old.pic_id && old.pic_id !== id) q.run("DELETE FROM made_book_pics WHERE id=? AND kind!='upload'", old.pic_id);
}

// ---------------------------------------------------------------- the file: JPEG, at most 1600 px wide
// Painted pictures were kept as WebP until 24 Nov 2026; on the owner's iPhone they showed as broken images ("?"), so
// they are now kept as JPEG, which every browser shows. A WebP kept before is turned into a JPEG the first time it is
// asked for (storeAsJpeg, from the picture route).
export const MAX_W = 1600;
/** Image bytes (PNG, JPEG or WebP) -> { bytes, mime: 'image/webp', width, height } through ffmpeg (in the app's image).
 *  Without ffmpeg (a development machine) a PNG is kept as it came. */
export function toWebp(bytes) {
  return new Promise((resolve, reject) => {
    let ff;
    try { ff = spawn('ffmpeg', ['-v', 'error', '-i', 'pipe:0', '-vf', `scale='min(${MAX_W},iw)':-2`, '-c:v', 'libwebp', '-quality', '82', '-f', 'webp', 'pipe:1'], { stdio: ['pipe', 'pipe', 'ignore'] }); } catch (e) { reject(e); return; }
    const out = [];
    ff.on('error', () => { const s = pngSize(bytes); if (s) resolve({ bytes, mime: 'image/png', ...s }); else reject(new Error('no ffmpeg')); });
    ff.stdout.on('data', d => out.push(d));
    ff.on('close', code => {
      if (code !== 0) return reject(new Error(`ffmpeg ${code}`));
      const buf = Buffer.concat(out), s = webpSize(buf);
      if (!s) return reject(new Error('not webp'));
      resolve({ bytes: buf, mime: 'image/webp', ...s });
    });
    ff.stdin.on('error', () => {});
    ff.stdin.end(bytes);
  });
}
/** Image bytes (PNG, JPEG or WebP) -> { bytes, mime: 'image/jpeg', width, height } through ffmpeg, at most MAX_W wide.
 *  Without ffmpeg (a development machine) a PNG is kept as it came. */
export function toJpeg(bytes) {
  return new Promise((resolve, reject) => {
    let ff;
    try { ff = spawn('ffmpeg', ['-v', 'error', '-i', 'pipe:0', '-frames:v', '1', '-vf', `scale='min(${MAX_W},iw)':-2,format=yuvj420p`, '-c:v', 'mjpeg', '-q:v', '3', '-f', 'image2pipe', 'pipe:1'], { stdio: ['pipe', 'pipe', 'ignore'] }); } catch (e) { reject(e); return; }
    const out = [];
    ff.on('error', () => { const s = pngSize(bytes); if (s) resolve({ bytes, mime: 'image/png', ...s }); else reject(new Error('no ffmpeg')); });
    ff.stdout.on('data', d => out.push(d));
    ff.on('close', code => {
      if (code !== 0) return reject(new Error(`ffmpeg ${code}`));
      const buf = Buffer.concat(out), s = jpegSize(buf);
      if (!s) return reject(new Error('not jpeg'));
      resolve({ bytes: buf, mime: 'image/jpeg', ...s });
    });
    ff.stdin.on('error', () => {});
    ff.stdin.end(bytes);
  });
}
/** JPEG bytes -> { width, height } from the first frame header, or null. */
export function jpegSize(b) {
  if (!b || b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) { i++; continue; }
    const m = b[i + 1];
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { height: b.readUInt16BE(i + 5), width: b.readUInt16BE(i + 7) };
    if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) { i += 2; continue; }
    i += 2 + b.readUInt16BE(i + 2);
  }
  return null;
}
/** A picture row kept as WebP (before 24 Nov 2026): its JPEG, saved in its place so this happens once. -> the row. */
const converting = new Map();
export async function storeAsJpeg(p) {
  if (!p || !webpSize(Buffer.from(p.bytes))) return p;
  if (!converting.has(p.id)) converting.set(p.id, toJpeg(p.bytes).then(img => {
    q.run('UPDATE made_book_pics SET bytes=?, mime=?, width=?, height=? WHERE id=?', img.bytes, img.mime, img.width, img.height, p.id);
    return { ...p, bytes: img.bytes, mime: img.mime, width: img.width, height: img.height };
  }).catch(() => p).finally(() => setTimeout(() => converting.delete(p.id), 1000)));
  return converting.get(p.id);
}
/** Image bytes (WebP, PNG, JPEG) -> PNG bytes through ffmpeg; a PNG comes back as it is. */
export function toPng(bytes) {
  const b = Buffer.from(bytes);
  if (pngSize(b)) return Promise.resolve(b);
  return new Promise((resolve, reject) => {
    let ff;
    try { ff = spawn('ffmpeg', ['-v', 'error', '-i', 'pipe:0', '-frames:v', '1', '-f', 'image2pipe', '-c:v', 'png', 'pipe:1'], { stdio: ['pipe', 'pipe', 'ignore'] }); } catch (e) { reject(e); return; }
    const out = [];
    ff.on('error', reject);
    ff.stdout.on('data', d => out.push(d));
    ff.on('close', code => { const buf = Buffer.concat(out); if (code === 0 && pngSize(buf)) resolve(buf); else reject(new Error(`ffmpeg ${code}`)); });
    ff.stdin.on('error', () => {});
    ff.stdin.end(b);
  });
}
export function pngSize(b) { return b && b.length > 24 && b.readUInt32BE(0) === 0x89504e47 ? { width: b.readUInt32BE(16), height: b.readUInt32BE(20) } : null; }
export function webpSize(b) {
  if (!b || b.length < 30 || b.toString('ascii', 0, 4) !== 'RIFF' || b.toString('ascii', 8, 12) !== 'WEBP') return null;
  const f = b.toString('ascii', 12, 16);
  if (f === 'VP8X') return { width: 1 + b.readUIntLE(24, 3), height: 1 + b.readUIntLE(27, 3) };
  if (f === 'VP8 ') return { width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff };
  if (f === 'VP8L') { const n = b.readUInt32LE(21); return { width: 1 + (n & 0x3fff), height: 1 + ((n >> 14) & 0x3fff) }; }
  return null;
}

// A deploy or restart leaves pictures queued (or drawing) with nobody to draw them until the next change kicks the
// queue; with the painting placeholder they would wait for ever. Soon after start-up, and every few minutes, the queue is
// kicked when anything waits (a picture that can't be painted now falls back to the art pack, with its reason).
register('storybook-picture-queue', 5 * 60e3, () => { if (q.get("SELECT 1 FROM made_book_draws WHERE state IN ('queued','drawing') LIMIT 1")) kick(); }, { firstAfterMs: 5e3 });

// ---------------------------------------------------------------- deleting
export const forgetBook = bookId => q.run('DELETE FROM made_book_draws WHERE book_id=?', bookId);
export const forgetUser = userId => q.run('DELETE FROM made_book_draws WHERE owner_id=?', userId);
