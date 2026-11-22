// Oomba, the teaching companion's API (services/companion.js; docs/decisions.md "Oomba teaching companion"). Teacher plan
// staff only (companionFor); everyone else gets the normal 404, never an upsell.
//   GET  /api/companion/chat               the conversation ({ chat, web, webAllowed })
//   POST /api/companion/chat               a message ({ text, page, file?, retry? }) -> a job (services/oomba-chat.js)
//   POST /api/companion/chat/undo          Undo a change Oomba made ({ turnId })
//   POST /api/companion/chat/act           a tap on a card ({ turnId, act: 'apply' | 'decline' | 'handoff' })
//   POST /api/companion/chat/new           New chat (the conversation and its files go)
//   POST /api/companion/web                web search on or off for this conversation ({ on })
//   POST /api/companion/file?name=         a lesson plan or document (raw body): its text, scrubbed (builder/lesson.js)
//   POST /api/companion/image?name=        a picture (raw JPEG, made in the browser): checked (no people) and kept a day
//   POST /api/companion/transcribe         speech to text (raw audio, X-Clip-Ms): the words for the box; audio never kept
//   POST /api/schools/:id/companion        a school admin's settings for Oomba (services/companion-settings.js)
import express, { Router } from 'express';
import { config } from '../config.js';
import { rateLimit, allow, count as countLimit } from '../services/ratelimit.js';
import { log } from '../services/log.js';
import * as CO from '../services/companion.js';
import * as CS from '../services/companion-settings.js';
import { FILE_LIMITS, kindOf, readLessonFile, scrub, screenLesson, studentNames } from '../builder/lesson.js';
import { cleanJpeg, jpegSize, PhotoError } from '../services/photos.js';
import { sttEnabled, transcribe, sniff, baseMime, MIMES, KINDS, SttError, clipSeconds, countedSeconds } from '../services/stt.js';
import * as sttUsage from '../services/stt-usage.js';
import { audit } from '../db.js';

export const router = Router();
const body = req => (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body) ? req.body : {});
const STATUS = { notFound: 404, chatBusy: 409, otherBusy: 409, slow: 429, fileGone: 410 };
const CODES = ['words', 'personal', 'brief', 'chatBusy', 'otherBusy', 'notFound', 'slow', 'fileGone'];
const fail = (req, res, r) => res.status(STATUS[r.code] || 400).json({ error: req.t(`js.companion.err.${CODES.includes(r.code) ? r.code : 'other'}`), code: r.code });
/** Only for Teacher plan staff: anyone else gets a 404 before anything is read. */
const may = (req, res, next) => (req.user && CO.companionFor(req.user) ? next() : res.status(404).json({ error: req.t('errors.api.notFound'), code: 'notFound' }));

router.get('/api/companion/chat', may, (req, res) => { const r = CO.current(req.user); return r.ok ? res.json({ ...r, mic: sttEnabled() }) : fail(req, res, r); });
router.post('/api/companion/chat', may, rateLimit('companion-ai', 120, 3600e3), (req, res) => {
  const b = body(req);
  const r = CO.send(req.user, { text: b.text, page: b.page, file: typeof b.file === 'string' ? b.file : null, lang: req.locale || 'en', retry: typeof b.retry === 'string' ? b.retry : null });
  return r.ok ? res.json({ ok: true, chat: r.chat }) : fail(req, res, r);
});
router.post('/api/companion/chat/undo', may, rateLimit('companion-act', 300, 3600e3), (req, res) => {
  const r = CO.undo(req.user, body(req).turnId);
  return r.ok ? res.json({ ok: true, chat: r.chat, kept: r.kept }) : fail(req, res, r);
});
router.post('/api/companion/chat/act', may, rateLimit('companion-act', 300, 3600e3), (req, res) => {
  const b = body(req);
  const r = CO.act(req.user, b.turnId, String(b.act || ''));
  return r.ok ? res.json({ ok: true, ...(r.chat ? { chat: r.chat } : {}), ...(r.handoff ? { handoff: r.handoff } : {}) }) : fail(req, res, r);
});
router.post('/api/companion/chat/new', may, (req, res) => { const r = CO.reset(req.user); return r.ok ? res.json({ ok: true, ...CO.current(req.user) }) : fail(req, res, r); });
router.post('/api/companion/web', may, (req, res) => res.json(CO.setWeb(req.user, !!body(req).on)));

// A lesson plan or worksheet: the Builder's "Your lesson" reader and rules (builder/lesson.js), the same limits (5 MB, a
// PDF of at most 10 pages, no scans, 20 files a day shared with the Builder). The file is read in memory and let go;
// only its text, with the names of this teacher's students, emails, phone numbers and links taken out, stays with the
// conversation (and goes with it).
const fileFail = (req, res, status, code) => res.status(status).json({ error: req.t(`js.companion.file.${code}`), code });
router.post('/api/companion/file', may, rateLimit('companion-file', 20, 60e3),
  express.raw({ type: () => true, limit: FILE_LIMITS.bytes + 1024, inflate: false }), (req, res) => {
    const name = String(req.query.name || '').normalize('NFC').replace(/[\u0000-\u001f\u007f/\\]+/g, ' ').trim().slice(0, 120) || 'lesson';
    const kind = kindOf(name), buf = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    req.body = null;
    if (!kind) return fileFail(req, res, 400, 'docType');
    if (buf.length > FILE_LIMITS.bytes) return fileFail(req, res, 413, 'docBig');
    const day = `build-lesson-day:${req.user.id}`;
    if (countLimit(day) >= FILE_LIMITS.perDay) return fileFail(req, res, 429, 'docLimit');
    const r = readLessonFile({ kind, buf });
    if (!r.ok) return fileFail(req, res, 400, r.code);
    allow(day, FILE_LIMITS.perDay, 864e5);
    const names = studentNames(req.user), text = scrub(r.text, names), shown = scrub(name, names).text;
    if (screenLesson(text.text)) return fileFail(req, res, 400, 'blocked');
    const removed = Object.values(text.removed).reduce((a, n) => a + n, 0);
    const f = CO.addDoc(req.user, { name: shown, kind, pages: r.pages, words: r.words, cut: r.cut, text: text.text });
    res.json({ ok: true, file: f, removed });
  });

// A picture: a JPEG the browser made (at most 1,600 px, 1.5 MB), every metadata segment (EXIF location, camera) removed
// (services/photos.js cleanJpeg, the profile photo's file checks), then the AI check: the profile photo's rules plus no
// people at all. A refused picture is never kept. One that passes is kept until the answer that reads it is done.
export const IMAGE_LIMITS = Object.freeze({ maxBytes: 1536 * 1024, maxSide: 1600, perDay: 30 });
router.post('/api/companion/image', may, rateLimit('companion-file', 20, 60e3),
  express.raw({ type: () => true, limit: IMAGE_LIMITS.maxBytes + 1024, inflate: false }), async (req, res) => {
    const name = String(req.query.name || '').normalize('NFC').replace(/[\u0000-\u001f\u007f/\\]+/g, ' ').trim().slice(0, 120) || 'picture.jpg';
    let bytes = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    req.body = null;
    let clean;
    try { clean = cleanJpeg(bytes, { maxBytes: IMAGE_LIMITS.maxBytes, maxSide: IMAGE_LIMITS.maxSide }); } catch (e) {
      const code = e instanceof PhotoError && e.code === 'tooBig' ? 'imgBig' : 'imgType';
      return fileFail(req, res, code === 'imgBig' ? 413 : 400, code);
    }
    bytes = null;
    const day = `companion-image-day:${req.user.id}`;
    if (countLimit(day) >= IMAGE_LIMITS.perDay) return fileFail(req, res, 429, 'imgLimit');
    allow(day, IMAGE_LIMITS.perDay, 864e5);
    const verdict = await CO.screenImage(clean);
    if (verdict !== 'allow') {
      if (verdict !== 'resting') audit(req.user.id, 'companion.image.refused', '', { verdict });
      return fileFail(req, res, verdict === 'resting' ? 503 : 422, verdict === 'person' ? 'imgPerson' : verdict === 'personal_info' ? 'imgPersonal' : verdict === 'resting' ? 'imgResting' : 'imgUnsafe');
    }
    const size = jpegSize(clean) || {};
    const scrubbed = scrub(name, studentNames(req.user)).text;
    res.json({ ok: true, file: CO.addImage(req.user, { name: scrubbed, bytes: clean, width: size.width || 0, height: size.height || 0 }) });
  });

// Speech to text for the companion (services/stt.js; docs/decisions.md "Oomba teaching companion": the teacher
// allowance). The Studio's rules are for a kid's own game (routes/studio.js) and stay as they are; this one is for
// Teacher plan staff only, with the same caps (clips a minute, clips a day, the site's minutes and the AI spending caps
// in services/stt-usage.js). The clip lives in memory for this request only, is never written anywhere and is dropped
// as soon as the words come back; the words go to the message box for the teacher to check, never sent by themselves.
const sttBody = (req, res, next) => express.raw({ type: () => true, limit: config.sttMaxBytes, inflate: false })(req, res, err => {
  if (!err) return next();
  res.status(err.status === 413 ? 413 : 400).json({ error: req.t('js.companion.mic.failed'), code: err.status === 413 ? 'too_big' : 'bad' });
});
router.post('/api/companion/transcribe', may, (req, res, next) => {
  if (!sttEnabled()) return res.status(404).json({ error: req.t('errors.api.notFound'), code: 'off' });
  if (!MIMES.includes(baseMime(req.get('content-type')))) return res.status(415).json({ error: req.t('js.companion.mic.failed'), code: 'type' });
  const ms = Number(req.get('x-clip-ms'));
  if (!req.get('x-clip-ms') || !Number.isFinite(ms) || ms < 0) return res.status(400).json({ error: req.t('js.companion.mic.failed'), code: 'bad' });
  if (ms > config.sttMaxSeconds * 1000 + 2000) return res.status(413).json({ error: req.t('js.companion.mic.tooLong'), code: 'too_long' });
  if (!allow(`stt:${req.user.id}`, config.sttPerMinute, 60e3)) return res.status(429).json({ error: req.t('js.companion.mic.tooFast'), code: 'fast' });
  const why = sttUsage.blocked(req.user.id, 'free');
  if (why === 'daily') return res.status(429).json({ error: req.t('js.companion.mic.daily'), code: 'daily' });
  if (why) return res.status(503).json({ error: req.t('js.companion.mic.busy'), code: 'site' });
  next();
}, sttBody, async (req, res) => {
  let bytes = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  req.body = null;
  if (bytes.length < 200 || !KINDS.includes(sniff(bytes))) return res.status(415).json({ error: req.t('js.companion.mic.failed'), code: 'type' });
  const size = bytes.length, real = clipSeconds(bytes);
  if (real != null && real > config.sttMaxSeconds + 2) { bytes = null; return res.status(413).json({ error: req.t('js.companion.mic.tooLong'), code: 'too_long' }); }
  const seconds = countedSeconds(bytes, +req.get('x-clip-ms'));
  sttUsage.record(req.user.id, seconds, config.sttProvider, 'free');
  try {
    const r = await transcribe({ bytes, locale: req.locale || 'en' });
    bytes = null;
    log('info', 'companion speech to text', { bytes: size, seconds: Math.round(seconds), ms: r.ms, provider: r.provider });
    res.json({ text: r.text ? CO.cleanText(req.user, r.text) : '' });
  } catch (e) {
    bytes = null;
    const code = e instanceof SttError ? e.code : 'provider';
    res.status(code === 'busy' ? 503 : 502).json({ error: req.t(code === 'busy' ? 'js.companion.mic.busy' : 'js.companion.mic.failed'), code });
  }
});

// A school admin's settings (the School page's Settings tab: views/companion-settings.js).
router.post('/api/schools/:id/companion', rateLimit('school-settings', 120, 3600e3), (req, res) => {
  if (!req.user) return res.status(404).json({ error: req.t('errors.api.notFound') });
  const r = CS.save(req.user, req.params.id, body(req));
  if (r.ok) return res.json({ ok: true, settings: r.settings });
  if (r.code === 'notFound') return res.status(404).json({ error: req.t('errors.api.notFound') });
  return res.status(400).json({ error: req.t(`companion.settings.err.${r.code}`, { min: r.min, max: r.max }), field: r.field, code: r.code });
});
