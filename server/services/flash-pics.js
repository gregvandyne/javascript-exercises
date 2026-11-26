// Flashcards pictures (docs/decisions.md "Flashcards: pictures"): a real picture on a card's front, its back, or both
// (one a side), next to the emoji cards always had. Built from the Storybook's picture pieces, never a new pipeline:
//
//   - WHO: the same people as Storybook's pictures (storybook.js canMake: school staff and the platform admin; a family
//     grown-up only while STORY_PICTURE_BOOKS names 'parent'), less family grown-ups here: they keep flashcards in their
//     own save only (the grown-up fence keeps them from saving sets), so a picture would have no set to belong to.
//     Never a student, a child or a guest: they make sets with emoji only (canPicture).
//   - UPLOAD: storybook.js checkUpload, the book maker's own checks: a JPEG the browser made, PIC_LIMITS' size, every
//     metadata segment removed, one daily count of picture checks with books, and the companion's picture check, which
//     turns away any photo with a person in it (so never a photo of a child), anything unsafe or private.
//   - OOMBA PAINTS IT: storybook-draw.js paintOne, the book pictures' own path: the picture model, Google's pacing, the
//     owner's daily pictures (the same count as their books), the AI budget, and the same picture check on what comes
//     back; the prompt is storybook-gemini.js cardPrompt (the house style) from the card's own words only (its term and an
//     optional short line), after the book maker's word rules and the names check (storybook.js wordsProblem), with the
//     owner's students' names taken out. Painting is slow, so it is queued here and worked through in this process; the
//     card shows a "painting" placeholder until it is done.
//   - KEPT: flash_pics rows (bytes in the database, as book pictures), the owner's own. A card names one as 'img:<id>'
//     (game-sets.js cleanFlashItems: an id of ours, never a URL). Who sees one (canSee): its owner, and anyone who can open
//     a set of that owner's whose cards name it (a set assigned to a class: its students). Deleted with the set that used
//     it (game-sets.js dropFlashPics), with the account (game-sets.js forgetUser), and after LIMITS.keepDays when no saved
//     set ever used it (a draft never saved).
import { q, uid, now } from '../db.js';
import { config } from '../config.js';
import { getUser, isGrownup } from '../auth.js';
import { cleanText } from './textfilter.js';
import { scrub, studentNames } from '../builder/lesson.js';
import { flashRefs } from './game-sets.js';
import * as SB from './storybook.js';
import * as Draw from './storybook-draw.js';
import * as G from './storybook-gemini.js';
import { log } from './log.js';
import { register } from './jobs.js';

/** perOwner: pictures one grown-up keeps; subject/note: the words a painting is made from; many: paintings asked for at
 *  once (an AI-drafted set's cards); keepDays: a picture no saved set uses is kept this long (an unsaved draft's). */
export const LIMITS = Object.freeze({ perOwner: 600, subject: 80, note: 120, many: 30, keepDays: 30 });
const DAY = 864e5;
const ID = /^[A-Za-z0-9]{10,40}$/;
const fail = (code, x = {}) => ({ ok: false, code, ...x });

/** May add pictures to flashcards: Storybook's rule, less family grown-ups (see above). */
export const canPicture = u => !!u && !u.is_guest && !u.banned && SB.canMake(u) && !isGrownup(u);
/** What the editor offers (INIT.flashPics): null for anyone who may not add pictures. */
export function info(u) {
  if (!canPicture(u)) return null;
  const st = Draw.active();
  return { upload: true, paint: st.on, left: st.on ? Draw.left(u) : 0 };
}
const refOf = id => `img:${id}`;
const rowOf = id => (typeof id === 'string' && ID.test(id) ? q.get('SELECT * FROM flash_pics WHERE id=?', id) || null : null);

/** A grown-up's uploaded picture (JPEG bytes). -> { ok, ref, width, height } | fail ('notAllowed' | storybook.js
 *  checkUpload's codes: 'imgType' | 'imgBig' | 'imgLimit' | 'imgFull' | 'imgPerson' | 'imgPersonal' | 'imgUnsafe' | 'imgResting') */
export async function upload(u, bytes) {
  if (!canPicture(u)) return fail('notAllowed');
  const n = q.get('SELECT COUNT(*) n FROM flash_pics WHERE owner_id=?', u.id).n;
  const r = await SB.checkUpload(u, bytes, { full: n >= LIMITS.perOwner, what: 'flash.pic.refused' });
  if (!r.ok) return r;
  const id = uid(16), t = now();
  q.run("INSERT INTO flash_pics(id, owner_id, kind, state, bytes, mime, width, height, created_at, updated_at) VALUES (?,?, 'upload', 'done', ?, 'image/jpeg', ?, ?, ?, ?)", id, u.id, r.bytes, r.size.width, r.size.height, t, t);
  return { ok: true, ref: refOf(id), width: r.size.width, height: r.size.height };
}

/** The words a painting is made from, checked: -> { ok, value } | { ok: false, code: 'words' | 'names' | 'personal' }. */
function wordsOf(u, raw, max) {
  const s = String(raw ?? '').normalize('NFC').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
  if (!s) return { ok: true, value: '' };
  const c = cleanText(s, max); if (!c.ok) return { ok: false, code: 'words' };
  const bad = SB.wordsProblem(u, c.value); if (bad) return { ok: false, code: bad };
  return { ok: true, value: scrub(c.value, studentNames(u)).text };
}
/**
 * "Oomba paints it": one painting a card [{ subject: the card's term, note?: a short line }], queued. At most the
 * pictures left today are queued (in order); the rest come back null and are counted in more.
 * -> { ok, refs: [ref | null], more } | fail ('notAllowed' | 'nokey' | 'resting' | 'limit' | 'words' | 'names' | 'personal' | 'bad' | 'full')
 */
export function paint(u, asks) {
  if (!canPicture(u)) return fail('notAllowed');
  if (!Array.isArray(asks) || !asks.length || asks.length > LIMITS.many) return fail('bad');
  const st = Draw.active(); if (!st.on) return fail(st.reason);
  const left = Draw.left(u); if (left <= 0) return fail('limit');
  const have = q.get('SELECT COUNT(*) n FROM flash_pics WHERE owner_id=?', u.id).n;
  if (have >= LIMITS.perOwner) return fail('full');
  const refs = [];
  let queued = 0, more = 0, firstBad = null;
  for (const a of asks) {
    const s = wordsOf(u, a && a.subject, LIMITS.subject), n = wordsOf(u, a && a.note, LIMITS.note);
    if (!s.ok || !n.ok || !s.value) { firstBad ||= (!s.ok ? s.code : !n.ok ? n.code : 'words'); refs.push(null); continue; }
    if (queued >= left || have + queued >= LIMITS.perOwner) { more++; refs.push(null); continue; }
    const id = uid(16), t = now();
    q.run("INSERT INTO flash_pics(id, owner_id, kind, state, subject, note, created_at, updated_at) VALUES (?,?, 'paint', 'queued', ?, ?, ?, ?)", id, u.id, s.value, n.value, t, t);
    refs.push(refOf(id)); queued++;
  }
  if (!queued && firstBad && asks.length === 1) return fail(firstBad);
  if (queued) setImmediate(kick);
  return { ok: true, refs, more };
}

/** The state of the owner's own pictures (the editor's placeholders): { id: { state, reason } } (anyone else's: left out). */
export function stateOf(u, ids) {
  const out = {};
  if (!u) return out;
  for (const id of (Array.isArray(ids) ? ids : []).slice(0, 100)) {
    const r = rowOf(String(id).replace(/^img:/, ''));
    if (r && r.owner_id === u.id) out[refOf(r.id)] = { state: r.state, reason: r.reason || '' };
  }
  return out;
}

/** May this viewer see the picture? Its owner, or anyone with the set (set: game-sets.js get(): { ownerId, items })
 *  when that set is the picture owner's and its cards name it. */
export function canSee(viewer, pic, set = null) {
  if (!pic) return false;
  if (viewer && !viewer.is_guest && viewer.id === pic.owner_id) return true;
  return !!set && set.ownerId === pic.owner_id && flashRefs(set.items).has(pic.id);
}
/** The picture for this viewer: { pic } (state done, with bytes), { painting: true } (still being painted), or null. */
export function pictureFor(viewer, ref, set = null) {
  const p = rowOf(String(ref || '').replace(/^img:/, ''));
  if (!p || !canSee(viewer, p, set)) return null;
  if (p.state === 'queued' || p.state === 'drawing') return { painting: true };
  return p.state === 'done' && p.bytes ? { pic: p } : null;
}

// ---------------------------------------------------------------- the painting queue (in this process)
let running = 0, recovered = false;
const waiters = [];
function claim() {
  const t = now();
  return q.get(`UPDATE flash_pics SET state='drawing', attempts=attempts+1, updated_at=? WHERE id=(
      SELECT id FROM flash_pics WHERE state='queued' AND (not_before IS NULL OR not_before<=?) ORDER BY updated_at LIMIT 1) AND state='queued' RETURNING *`, t, t) || null;
}
const end = (row, state, reason = '', extra = {}) => {
  const sets = ['state=?', 'reason=?', 'updated_at=?', 'not_before=NULL'], vals = [state, reason, now()];
  for (const [k, v] of Object.entries(extra)) { sets.push(`${k}=?`); vals.push(v); }
  q.run(`UPDATE flash_pics SET ${sets.join(', ')} WHERE id=? AND state='drawing'`, ...vals, row.id);
};
async function drawOne(row) {
  const u = getUser(row.owner_id);
  if (!canPicture(u)) return end(row, 'fallback', 'nokey');
  const prompt = G.cardPrompt({ subject: row.subject, note: row.note }, G.styleOf(row.owner_id));
  const r = await Draw.paintOne(u, prompt, { aspect: '4:3', what: 'flash' });
  if (r.ok) return end(row, 'done', '', { bytes: r.img.bytes, mime: r.img.mime, width: r.img.width, height: r.img.height });
  if (r.reason === 'wait') {
    // Google asked the whole queue to wait: back in line, its attempt not used, until it has waited too long
    if (now() - row.created_at > Draw.PACE.waitMaxMs) return end(row, 'fallback', 'busy');
    q.run("UPDATE flash_pics SET state='queued', attempts=MAX(0, attempts-1), not_before=?, updated_at=? WHERE id=? AND state='drawing'", r.retryAt, now(), row.id);
    return;
  }
  if (r.reason === 'error' && row.attempts < 2) {
    q.run("UPDATE flash_pics SET state='queued', not_before=?, updated_at=? WHERE id=? AND state='drawing'", now() + Math.round(Draw.PACE.errorMs * (1 + Math.random())), now(), row.id);
    return;
  }
  return end(row, 'fallback', r.reason || 'error');
}
let wake = null;
/** Paint what is queued, a few at a time (STORYBOOK_DRAW_AT_ONCE, as book pictures). */
export function kick() {
  if (!recovered) { recovered = true; q.run("UPDATE flash_pics SET state='queued', updated_at=? WHERE state='drawing'", now()); }
  while (running < config.storybookDrawAtOnce) {
    const job = claim(); if (!job) break;
    running++;
    drawOne(job).catch(e => { log('warn', 'flash picture failed', { kind: e && e.name }); end(job, 'fallback', 'error'); })
      .finally(() => { running--; kick(); if (!running) waiters.splice(0).forEach(r => r()); });
  }
  const next = (q.get("SELECT MIN(not_before) t FROM flash_pics WHERE state='queued' AND not_before>?", now()) || {}).t;
  if (next && !wake) { wake = setTimeout(() => { wake = null; kick(); }, Math.max(10, next - now())); if (wake.unref) wake.unref(); }
}
/** Resolves once nothing is painting (tests and the screenshots). */
export const settle = () => new Promise(r => { if (!running) r(); else waiters.push(r); });

/** Pictures no saved set uses, older than keepDays (an unsaved draft's), go. -> number deleted */
export function pruneUnused(t = now()) {
  let n = 0;
  for (const { owner_id: o } of q.all('SELECT DISTINCT owner_id FROM flash_pics WHERE created_at<?', t - LIMITS.keepDays * DAY)) {
    const used = new Set();
    for (const r of q.all(`SELECT items FROM game_sets WHERE owner_id=? AND items LIKE '%"img:%'`, o)) { try { for (const x of flashRefs(JSON.parse(r.items))) used.add(x); } catch { /* a broken row */ } }
    for (const { id } of q.all('SELECT id FROM flash_pics WHERE owner_id=? AND created_at<?', o, t - LIMITS.keepDays * DAY)) if (!used.has(id)) n += q.run('DELETE FROM flash_pics WHERE id=?', id).changes;
  }
  return n;
}

// After a restart pictures wait in the queue with nobody painting them: kick it soon after start-up and every few minutes
// when anything waits; once an hour, pictures no saved set ever used go after keepDays.
register('flash-picture-queue', 5 * 60e3, () => { if (q.get("SELECT 1 FROM flash_pics WHERE state IN ('queued','drawing') LIMIT 1")) kick(); }, { firstAfterMs: 7e3 });
register('flash-picture-prune', 3600e3, () => { pruneUnused(); }, { firstAfterMs: 60e3 });
