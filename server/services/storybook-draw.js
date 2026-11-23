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
//   - What is kept: the picture as WebP (made_book_pics, kind 'page' | 'sheet'), at most 1600 px wide (the reader and the
//     print copy), with the fingerprint of what it drew (hash) so the editor can say when a page changed since.
import { spawn } from 'node:child_process';
import { q, uid, now, today, audit } from '../db.js';
import { config } from '../config.js';
import { getUser } from '../auth.js';
import * as aiBudget from './ai-budget.js';
import { scrub, studentNames } from '../builder/lesson.js';
import { screenImage as companionScreenImage } from './companion.js';
import { log } from './log.js';
import * as G from './storybook-gemini.js';
import * as SB from './storybook.js';
import { catalog } from './storybook-illustrator.js';

/** Test hook: screenImage(bytes, mime) for the picture check. */
export const hooks = { screenImage: null };
export const REASONS = ['nokey', 'resting', 'limit', 'blocked', 'refused', 'error'];
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
/** What a character sheet is drawn from. */
export const castHash = c => JSON.stringify([c.name, c.look || '', c.art]);
/** What a page's picture is drawn from: its scene and setting, and the characters in it with their current sheets. */
export function pageHash(bookId, b, p) {
  if (!p || !p.pic) return '';
  const chars = p.pic.chars.map(c => { const k = b.cast.find(x => x.name === c.name) || {}; const s = sheetRow(bookId, c.name); return [c.name, c.pos, k.look || '', k.art || '', s && s.pic_id]; });
  return JSON.stringify([p.pic.scene || '', p.alt || '', p.pic.world, p.pic.mood, chars]);
}

// ---------------------------------------------------------------- the queue
const targets = b => [...b.cast.map(c => `cast:${lower(c.name)}`), ...b.pages.filter(p => p.pic && !p.upload).map(p => `page:${p.id}`)];
function upsertQueued(row, target, note = '') {
  const t = now();
  return q.run(`INSERT INTO made_book_draws(id, book_id, owner_id, target, state, note, created_at, updated_at) VALUES (?,?,?,?, 'queued', ?, ?, ?)
    ON CONFLICT(book_id, target) DO UPDATE SET state='queued', reason='', note=excluded.note, attempts=0, updated_at=excluded.updated_at
    WHERE made_book_draws.state NOT IN ('queued', 'drawing')`, uid(12), row.id, row.owner_id, target, note, t, t).changes === 1;
}
const AGAIN = new Set(['nokey', 'resting', 'limit', 'error']);   // a fallback worth trying again on the next change
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

// ---------------------------------------------------------------- what the editor and the reader see
/** The kept picture of a page (a made_book_pics id), or null. */
export const drawnPic = (bookId, pageId) => (q.get("SELECT pic_id FROM made_book_draws WHERE book_id=? AND target=? AND pic_id IS NOT NULL", bookId, `page:${pageId}`) || {}).pic_id || null;
/** The book's pictures for the editor (reason 'own' | 'none': the teacher's Pictures choice): { on, reason, left, cap, pages: { id: { state, reason, pic, stale } },
 *  cast: { name: ... }, total, done, busy } */
export function stateOf(u, row, b = SB.bookOf(row)) {
  const choice = SB.picturesOf(SB.setupOf(row));
  const st = choice === 'ai' ? active() : { on: false, reason: choice }, cap = capOf(u), l = left(u);
  const rows = new Map(q.all('SELECT * FROM made_book_draws WHERE book_id=?', row.id).map(d => [d.target, d]));
  const one = (d, hash) => (d ? { state: d.state, reason: d.reason || '', pic: d.pic_id || null, stale: !!(d.pic_id && d.hash && d.hash !== hash && d.state !== 'queued' && d.state !== 'drawing'), note: !!d.note } : null);
  const pages = {}, cast = {};
  for (const p of b.pages) { const x = one(rows.get(`page:${p.id}`), pageHash(row.id, b, p)); if (x) pages[p.id] = x; }
  for (const c of b.cast) { const x = one(rows.get(`cast:${lower(c.name)}`), castHash(c)); if (x) cast[c.name] = x; }
  const all = [...Object.values(pages), ...Object.values(cast)];
  return { on: st.on, reason: st.on ? (l <= 0 ? 'limit' : null) : st.reason, left: l, cap, pages, cast,
    total: all.length, done: all.filter(x => x.state === 'done' || x.state === 'fallback').length, busy: all.filter(x => x.state === 'queued' || x.state === 'drawing').length };
}

// ---------------------------------------------------------------- the worker
let running = 0, recovered = false;
const waiters = [];
/** Claim the next picture: character sheets first; a page only once its book's sheets are drawn. Synchronous. */
function claim() {
  return q.get(`UPDATE made_book_draws SET state='drawing', attempts=attempts+1, updated_at=? WHERE id=(
      SELECT d.id FROM made_book_draws d WHERE d.state='queued' AND (d.target LIKE 'cast:%' OR NOT EXISTS (
        SELECT 1 FROM made_book_draws c WHERE c.book_id=d.book_id AND c.target LIKE 'cast:%' AND c.state IN ('queued','drawing')))
      ORDER BY (d.target LIKE 'cast:%') DESC, d.updated_at LIMIT 1) AND state='queued' RETURNING *`, now()) || null;
}
/** Pictures that were drawing when the server stopped go back in the queue (once, at the first kick). */
export function recover() {
  recovered = true;
  q.run("UPDATE made_book_draws SET state='queued', updated_at=? WHERE state='drawing'", now());
}
/** Start drawing what is queued, up to STORYBOOK_DRAW_AT_ONCE at a time. */
export function kick() {
  if (!recovered) recover();
  while (running < config.storybookDrawAtOnce) {
    const job = claim(); if (!job) break;
    running++;
    drawJob(job).catch(e => { log('warn', 'storybook picture failed', { book: job.book_id, kind: e && e.name }); end(job, 'fallback', 'error'); })
      .finally(() => { running--; kick(); if (!running) waiters.splice(0).forEach(r => r()); });
  }
}
/** Resolves once nothing is drawing (tests and the screenshots). */
export const settle = () => new Promise(r => { if (!running) r(); else waiters.push(r); });

function end(job, state, reason = '', extra = {}) {
  const sets = ['state=?', 'reason=?', 'updated_at=?'], vals = [state, reason, now()];
  for (const [k, v] of Object.entries(extra)) { sets.push(`${k}=?`); vals.push(v); }
  q.run(`UPDATE made_book_draws SET ${sets.join(', ')} WHERE id=? AND state='drawing'`, ...vals, job.id);
}
const giveBack = u => q.run('UPDATE made_book_ai_days SET n=MAX(0, n-1) WHERE user_id=? AND day=?', u.id, dayKey());

async function drawJob(job) {
  const row = q.get('SELECT * FROM made_books WHERE id=?', job.book_id);
  if (!row) { q.run('DELETE FROM made_book_draws WHERE id=?', job.id); return; }
  const u = getUser(row.owner_id);
  if (!u || !SB.canMake(u)) return end(job, 'fallback', 'nokey');
  const b = SB.bookOf(row), cat = catalog();
  const [kind, key] = [job.target.slice(0, 4), job.target.slice(5)];
  const style = G.styleOf(row.id), names = studentNames(u), sc = s => scrub(String(s || ''), names).text;
  const charOf = c => ({ name: sc(c.name), look: sc(c.look), kind: (cat.chars[c.art] || {}).name || '' });
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
    prompt = G.pagePrompt({ scene, setting: (cat.worlds[p.pic.world] || {}).name || '', mood: p.pic.mood, chars, note: sc(job.note) }, style);
    hash = pageHash(row.id, b, p); label = 'page';
  }
  const st = active(); if (!st.on) return end(job, 'fallback', st.reason);
  if (!SB.take(u, { key: dayKey(), cap: capOf(u) })) return end(job, 'fallback', 'limit');
  const r = await G.generate({ prompt, refs, aspect });
  if (r.usage || r.ok || r.code === 'blocked') aiBudget.recordImage(G.model(), r.usage, r.ok ? 1 : 0);
  if (!r.ok) {
    if (r.code === 'blocked') { audit(u.id, 'storybook.draw.blocked', row.id, { what: label, why: String(r.why || '').slice(0, 40) }); return end(job, 'fallback', 'blocked', { hash }); }
    giveBack(u);   // nothing was made: the picture is not counted
    log('warn', 'storybook picture model failed', { book: row.id, why: r.why, attempt: job.attempts });
    if (job.attempts < 2 && r.code !== 'nokey') { q.run("UPDATE made_book_draws SET state='queued', updated_at=? WHERE id=? AND state='drawing'", now(), job.id); return; }
    return end(job, 'fallback', r.code === 'nokey' ? 'nokey' : 'error');
  }
  let img;
  try { img = await toWebp(r.bytes); } catch { img = null; }
  if (!img) return end(job, 'fallback', 'error', { hash });
  const verdict = hooks.screenImage ? await hooks.screenImage(img.bytes, img.mime) : await companionScreenImage(img.bytes, img.mime);
  if (verdict !== 'allow') {
    if (verdict !== 'resting') audit(u.id, 'storybook.draw.refused', row.id, { what: label, verdict });
    return end(job, 'fallback', verdict === 'resting' ? 'resting' : 'refused', { hash });
  }
  if (!q.get('SELECT 1 FROM made_books WHERE id=?', row.id)) return;
  const id = uid(14), old = q.get('SELECT pic_id FROM made_book_draws WHERE id=?', job.id);
  q.run('INSERT INTO made_book_pics(id, owner_id, book_id, name, width, height, bytes, created_at, kind, mime) VALUES (?,?,?,?,?,?,?,?,?,?)',
    id, u.id, row.id, `${label}.webp`, img.width, img.height, img.bytes, now(), label, img.mime);
  end(job, 'done', '', { pic_id: id, hash, note: '' });
  if (old && old.pic_id && old.pic_id !== id) q.run("DELETE FROM made_book_pics WHERE id=? AND kind!='upload'", old.pic_id);
}

// ---------------------------------------------------------------- the file: WebP, at most 1600 px wide
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
export function pngSize(b) { return b && b.length > 24 && b.readUInt32BE(0) === 0x89504e47 ? { width: b.readUInt32BE(16), height: b.readUInt32BE(20) } : null; }
export function webpSize(b) {
  if (!b || b.length < 30 || b.toString('ascii', 0, 4) !== 'RIFF' || b.toString('ascii', 8, 12) !== 'WEBP') return null;
  const f = b.toString('ascii', 12, 16);
  if (f === 'VP8X') return { width: 1 + b.readUIntLE(24, 3), height: 1 + b.readUIntLE(27, 3) };
  if (f === 'VP8 ') return { width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff };
  if (f === 'VP8L') { const n = b.readUInt32LE(21); return { width: 1 + (n & 0x3fff), height: 1 + ((n >> 14) & 0x3fff) }; }
  return null;
}

// ---------------------------------------------------------------- deleting
export const forgetBook = bookId => q.run('DELETE FROM made_book_draws WHERE book_id=?', bookId);
export const forgetUser = userId => q.run('DELETE FROM made_book_draws WHERE owner_id=?', userId);
