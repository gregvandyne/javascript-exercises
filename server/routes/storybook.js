// The book maker in the Story Library (services/storybook.js; docs/storybook-builder.md). Teachers only: every page and
// API below answers anyone else (students, kids, family grown-ups, guests) as if it were not there (the normal 404;
// signed out: the usual sign-in), checked here on the server, not only by hiding links. Students only read a book their
// teacher shared with their class (/library/made/:id/read).
//   GET  /library/make                        start: Upload your own book or Have AI make one, then the setup steps
//                                             (options, your words and files, check), and the teacher's books
//   POST /api/library/make/file?name=         a document (.txt .md .docx .pdf) -> its text, scrubbed (never kept)
//   POST /api/library/make/pic?name=          a picture for the setup (a JPEG the browser made) -> checked and kept
//   GET  /api/library/make/pic/:pic           a setup picture (its owner)    POST .../pic/:pic/remove
//   POST /api/library/make/check              { setup } -> exactly what will be sent, scrubbed and screened
//   POST /api/library/make/start              { setup } -> the book, and Oomba's first draft as a job
//   GET  /library/make/:id                    the book editor and Oomba's chat
//   GET  /api/library/make/:id                the book now   POST .../save { book, rev }   POST .../delete
//   GET|POST /api/library/make/:id/chat       Oomba's chat (services/oomba-chat.js)   POST .../chat/undo { turnId }
//   POST /api/library/make/:id/pic?name=      a picture for a page          POST .../pic/:pic/remove
//   GET  /api/library/make/:id/draws          the book's pictures (the picture model: drawing, done, why not)
//   POST /api/library/make/:id/draw           { target: 'page:<id>' | 'cast:<name>', note } Redraw one picture
//   POST /api/library/make/:id/share          { classIds }
//   GET  /library/made/:id/read               the reader (?p= a page, ?t= the trail; the owner or the class)
//   GET  /library/made/:id/print              print or save as PDF (the owner, or staff of a class it is shared with)
//   GET  /library/made/:id/pic/:pic           a teacher's picture on a page (whoever may read the book)
//   POST /api/library/made/:id/progress       { page, trail }
import { Router } from 'express';
import express from 'express';
import { html, raw, jsonData } from '../views/html.js';
import { ico } from '../views/icon.js';
import { page, notFound, VERSION } from '../views/layout.js';
import { emptyState } from '../views/components.js';
import { rateLimit, allow, count as countLimit } from '../services/ratelimit.js';
import { FILE_LIMITS, FILE_ACCEPT, kindOf, readLessonFile, scrub, screenLesson, studentNames } from '../builder/lesson.js';
import { characterName } from '../builder/plan.js';
import * as SB from '../services/storybook.js';
import * as C from '../services/oomba-chat.js';
import * as Draw from '../services/storybook-draw.js';
import { companionFor } from '../services/companion-settings.js';
import { numbering, reachable, pageOf } from '../../public/js/storybook-core.js';

export const router = Router();
const CSS = raw(`<link rel="stylesheet" href="/css/library.css?v=${VERSION}"><link rel="stylesheet" href="/css/storybook.css?v=${VERSION}">`);
const b = req => req.body || {};
const isApi = req => req.path.startsWith('/api/');
/** Teachers only. Signed out: the usual sign-in (a page) or 401 (the API); anyone else: the normal 404. */
function teacher(req, res, next) {
  if (!req.user) return isApi(req) ? res.status(401).json({ error: req.t('errors.api.signInFirst') }) : res.redirect(`/login?next=${encodeURIComponent(req.originalUrl)}`);
  if (!SB.canMake(req.user)) return isApi(req) ? res.status(404).json({ error: req.t('errors.api.notFound') }) : notFound(req, res);
  next();
}
const nope = (req, res) => res.status(404).json({ error: req.t('errors.api.notFound') });
const err = (req, res, status, code, extra = {}) => res.status(status).json({ error: req.t(`storybook.errors.${code}`, extra), code, ...extra });
const kindName = (t, k) => t(k === 'cyoa' ? 'storybook.kind.cyoa' : 'storybook.kind.linear');
const ago = (req, t0) => req.fmt.ago(t0);

/** One of the teacher's books on the start page. */
function bookItem(req, row) {
  const t = req.t, bk = SB.bookOf(row), shared = SB.sharedWith(row.id);
  return html`<li class="sb-mine-item"><a class="sb-mine-link" href="/library/make/${row.id}">
    <span class="sb-mine-t" dir="auto">${bk.title || t('storybook.untitled')}</span>
    <span class="small muted">${kindName(t, row.kind)} · ${t('storybook.pages', { count: bk.pages.length })} · ${ago(req, row.updated_at)}${shared.length ? html` · ${t('storybook.sharedN', { count: shared.length })}` : ''}</span></a></li>`;
}

// ---------------------------------------------------------------- start and the setup steps
const chip = (group, v, label, on = false) => html`<button type="button" class="chip" data-g="${group}" data-v="${v}" aria-pressed="${on ? 'true' : 'false'}">${label}</button>`;
router.get('/library/make', teacher, (req, res) => {
  const t = req.t, u = req.user;
  const mine = SB.myBooks(u, 30);
  // With the Oomba chat (the owner: "Clicking the make a book button should just open up the chat and you should do the
  // whole workflow there"): Make a book opens the chat on the library with the book maker's first card
  // (public/js/companion.js ?make=1); this page is the teacher's books. Without it, the steps below, as before.
  if (companionFor(u)) {
    if (req.query.new) return res.redirect('/library?make=1');
    const body = html`<div class="sb sb-setup">
      <div class="pagehead"><div><h1>${ico('📚', { size: 36 })} ${t('storybook.mine')}</h1><p class="muted">${t('storybook.lead')}</p></div>
        <a class="btn btn-primary" href="/library/make?new=1" data-oc-book>${ico('✨', { size: 18 })} ${t('storybook.makeBook')}</a></div>
      <section class="panel sb-mine" aria-label="${t('storybook.mine')}">
        ${mine.length ? html`<ul class="sb-mine-list">${mine.map(r => bookItem(req, r))}</ul>` : html`<p class="muted">${t('storybook.mineNone')}</p>`}</section></div>`;
    return page(req, res, { title: t('storybook.mine'), active: 'learn', body, head: CSS, back: '/library', backLabel: t('library.title'), mid: true });
  }
  const card = (v, emo, title, text) => html`<button type="button" class="sb-card" data-g="source" data-v="${v}" aria-pressed="false"><span class="sb-card-i" aria-hidden="true">${ico(emo, { size: 56 })}</span><span class="sb-card-t">${title}</span><span class="sb-card-s">${text}</span></button>`;
  const kcard = (src, v, emo, title, text) => html`<button type="button" class="sb-card sb-kind" data-src="${src}" data-g="kind" data-v="${v}" aria-pressed="false"><span class="sb-card-i" aria-hidden="true">${ico(emo, { size: 44 })}</span><span class="sb-card-t">${title}</span><span class="sb-card-s">${text}</span></button>`;
  const group = (key, label, items, extra = '') => html`<fieldset class="sb-group" data-group="${key}"${extra ? raw(` ${extra}`) : ''}><legend>${label}</legend><div class="chips sb-chips">${items}</div></fieldset>`;
  const left = SB.left(u);
  const body = html`<div class="sb sb-setup" id="sb-setup">
    <div class="pagehead"><div><h1>${ico('📚', { size: 36 })} ${t('storybook.title')}</h1><p class="muted">${t('storybook.lead')}</p></div></div>
    <ol class="sb-dots" id="sb-dots" aria-label="${t('storybook.steps.label')}">
      ${['start', 'options', 'context', 'check'].map((s, i) => html`<li data-dot="${s}"${i === 0 ? raw(' aria-current="step"') : ''}><span class="sb-dot-n" aria-hidden="true">${i + 1}</span><span class="sb-dot-t">${t(`storybook.steps.${s}`)}</span></li>`)}
    </ol>
    <section class="panel sb-step" data-step="start" aria-labelledby="sb-h1">
      <h2 id="sb-h1" tabindex="-1">${t('storybook.start.title')}</h2>
      <div class="sb-cards">${card('upload', '📝', t('storybook.start.upload'), t('storybook.start.uploadText'))}${card('ai', '🪄', t('storybook.start.ai'), t('storybook.start.aiText'))}</div>
      <p class="small muted sb-left">${ico('✨', { size: 16 })} ${t('storybook.left', { count: left })}</p>
    </section>
    <section class="panel sb-step" data-step="options" aria-labelledby="sb-h2" hidden>
      <h2 id="sb-h2" tabindex="-1">${t('storybook.options.title')}</h2>
      <div class="sb-cards sb-cards-sm">
        ${kcard('upload', 'linear', '📖', t('storybook.options.keep'), t('storybook.options.keepText'))}${kcard('upload', 'cyoa', '🔀', t('storybook.options.turn'), t('storybook.options.turnText'))}
        ${kcard('ai', 'linear', '🖼️', t('storybook.options.illustrated'), t('storybook.options.illustratedText'))}${kcard('ai', 'cyoa', '🔀', t('storybook.options.cyoa'), t('storybook.options.cyoaText'))}
      </div>
      ${group('grade', t('storybook.options.grade'), SB.GRADES.map(g => chip('grade', g, t(`storybook.grades.${g.replace('-', '')}`), g === '2')))}
      ${group('length', t('storybook.options.length'), SB.LENGTHS.map(l => chip('length', l, t(`storybook.lengths.${l}`), l === 'short')))}
      ${group('endings', t('storybook.options.endings'), SB.ENDINGS.map(n => chip('endings', String(n), String(n), n === 2)), 'hidden')}
      ${group('level', t('storybook.options.level'), SB.LEVELS.map(l => chip('level', l, t(`storybook.levels.${l}`), l === 'growing')))}
      ${group('theme', t('storybook.options.theme'), SB.THEMES.map(x => chip('theme', x, t(`storybook.themes.${x}`))), 'data-ai')}
      ${group('pictures', t('storybook.options.pictures'), SB.PICTURES.map(x => chip('pictures', x, t(`storybook.pictures.${x}`), x === 'ai')))}
      <p class="form-err err" id="sb-opt-err" role="alert"></p>
      <div class="sb-nav"><button type="button" class="btn" data-go="start">${t('storybook.back')}</button><button type="button" class="btn btn-primary" data-go="context">${t('storybook.next')}</button></div>
    </section>
    <section class="panel sb-step" data-step="context" aria-labelledby="sb-h3" hidden>
      <h2 id="sb-h3" tabindex="-1"><span data-src-only="upload">${t('storybook.context.titleUpload')}</span><span data-src-only="ai">${t('storybook.context.titleAi')}</span></h2>
      <div class="field" data-src-only="upload"><label for="sb-story">${t('storybook.context.story')}</label><span class="hint" id="sb-story-h">${t('storybook.context.storyHint')}</span>
        <textarea class="input sb-text" id="sb-story" rows="10" maxlength="${SB.SETUP_LIMITS.story}" aria-describedby="sb-story-h" dir="auto"></textarea></div>
      <div class="field"><label for="sb-about"><span data-src-only="upload">${t('storybook.context.aboutUpload')}</span><span data-src-only="ai">${t('storybook.context.aboutAi')}</span></label>
        <span class="hint" id="sb-about-h">${t('storybook.context.aboutHint')}</span>
        <textarea class="input sb-text" id="sb-about" rows="4" maxlength="${SB.SETUP_LIMITS.about}" aria-describedby="sb-about-h" dir="auto"></textarea></div>
      <div class="sb-adds">
        <div><button type="button" class="btn btn-sm" id="sb-file-btn">${ico('📎', { size: 18 })} ${t('storybook.context.addFile')}</button>
          <input type="file" id="sb-file" accept="${FILE_ACCEPT}" hidden><p class="small muted">${t('storybook.context.fileHint')}</p><ul class="sb-files" id="sb-files"></ul></div>
        <div><button type="button" class="btn btn-sm" id="sb-pic-btn">${ico('🖼️', { size: 18 })} ${t('storybook.context.addPic')}</button>
          <input type="file" id="sb-pic" accept="image/*" multiple hidden><p class="small muted">${t('storybook.context.picHint')}</p><ul class="sb-pics" id="sb-pics"></ul></div>
      </div>
      <p class="notice sb-privacy">${ico('🔒', { size: 18 })} ${t('storybook.privacy')}</p>
      <p class="form-err err" id="sb-ctx-err" role="alert"></p>
      <div class="sb-nav"><button type="button" class="btn" data-go="options">${t('storybook.back')}</button><button type="button" class="btn btn-primary" data-go="check">${t('storybook.toCheck')}</button></div>
    </section>
    <section class="panel sb-step" data-step="check" aria-labelledby="sb-h4" hidden>
      <h2 id="sb-h4" tabindex="-1">${t('storybook.check.title')}</h2>
      <p class="muted">${t('storybook.check.lead')}</p>
      <div id="sb-check" aria-live="polite"></div>
      <p class="notice sb-privacy">${ico('🔒', { size: 18 })} ${t('storybook.check.never')}</p>
      <p class="form-err err" id="sb-chk-err" role="alert"></p>
      <div class="sb-nav"><button type="button" class="btn" data-go="context">${t('storybook.back')}</button><button type="button" class="btn btn-hot" id="sb-go">${ico('✨', { size: 18 })} ${t('storybook.check.go')}</button></div>
      <p class="small muted sb-left">${t('storybook.left', { count: left })}</p>
    </section>
    <section class="panel sb-mine" aria-labelledby="sb-mine-h"><h2 id="sb-mine-h">${ico('📖', { size: 28 })} ${t('storybook.mine')}</h2>
      ${mine.length ? html`<ul class="sb-mine-list">${mine.map(r => bookItem(req, r))}</ul>` : html`<p class="muted">${t('storybook.mineNone')}</p>`}</section>
  </div>
  ${jsonData('page-data', { left, limits: SB.SETUP_LIMITS, file: { bytes: FILE_LIMITS.bytes }, pic: SB.PIC_LIMITS })}`;
  page(req, res, { title: t('storybook.title'), active: 'learn', body, head: CSS, scripts: ['/js/storybook-setup.js'], back: '/library', backLabel: t('library.title'), mid: true, companion: false });
});

// A document for the setup: read on the server (builder/lesson.js readLessonFile: no AI), scrubbed, never kept.
router.post('/api/library/make/file', teacher, rateLimit('storybook-file', 20, 60e3),
  express.raw({ type: () => true, limit: FILE_LIMITS.bytes + 1024, inflate: false }), (req, res) => {
    const name = String(req.query.name || '').normalize('NFC').replace(/[\u0000-\u001f\u007f/\\]+/g, ' ').trim().slice(0, 80) || 'story';
    const kind = kindOf(name), buf = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    const fail = (status, code) => res.status(status).json({ error: req.t(`js.buildsetup.lesson.err.${code}`), code });
    if (!kind) return fail(400, 'docType');
    if (buf.length > FILE_LIMITS.bytes) return fail(413, 'docBig');
    const day = `storybook-doc-day:${req.user.id}`;
    if (countLimit(day) >= FILE_LIMITS.perDay) return fail(429, 'docLimit');
    const r = readLessonFile({ kind, buf });
    if (!r.ok) return fail(400, r.code);
    allow(day, FILE_LIMITS.perDay, 864e5);
    const names = studentNames(req.user), text = scrub(r.text, names);
    if (screenLesson(text.text)) return fail(400, 'blocked');
    res.json({ name: scrub(name, names).text, kind, words: r.words, cut: r.cut, removed: Object.values(text.removed).reduce((a, n) => a + n, 0), text: text.text });
  });

const picBody = express.raw({ type: () => true, limit: SB.PIC_LIMITS.maxBytes + 1024, inflate: false });
const picName = req => String(req.query.name || '').normalize('NFC').replace(/[\u0000-\u001f\u007f/\\]+/g, ' ').trim().slice(0, 80);
async function takePic(req, res, bookId) {
  const r = await SB.addPic(req.user, bookId, Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0), picName(req));
  req.body = null;
  if (!r.ok) return r.code === 'notFound' ? nope(req, res) : err(req, res, { imgBig: 413, imgLimit: 429, imgResting: 503, imgType: 400, imgFull: 400 }[r.code] || 422, r.code);
  res.json(r);
}
router.post('/api/library/make/pic', teacher, rateLimit('storybook-pic', 20, 60e3), picBody, (req, res) => takePic(req, res, null));
function sendPic(res, p) { res.set('Cache-Control', 'private, max-age=86400').type(p.mime || 'image/jpeg').send(p.bytes); }
router.get('/api/library/make/pic/:pic', teacher, (req, res) => {
  const p = SB.picOf(req.params.pic);
  if (!p || p.owner_id !== req.user.id || p.book_id) return nope(req, res);
  sendPic(res, p);
});
router.post('/api/library/make/pic/:pic/remove', teacher, (req, res) => { const r = SB.removePic(req.user, null, req.params.pic); return r.ok ? res.json(r) : nope(req, res); });

/** What will be sent, exactly, for the check step: the setup after the scrubber, and the screening's verdict. */
router.post('/api/library/make/check', teacher, rateLimit('storybook-check', 30, 60e3), async (req, res) => {
  const t = req.t;
  const { setup, removed } = SB.cleanSetup(req.user, b(req).setup || {}, { lang: req.locale });
  const need = SB.setupProblems(setup);
  const blocked = need ? null : await SB.screenSetup(setup, { t });
  res.json({ ok: !need && !blocked, setup, removed, need: need ? t(`storybook.errors.${need}`) : null, blocked: blocked ? blocked.message : null,
    pics: setup.pics.length, left: SB.left(req.user), labels: { kind: kindName(t, setup.kind) } });
});
router.post('/api/library/make/start', teacher, rateLimit('storybook-start', 12, 3600e3), async (req, res) => {
  const r = await SB.startBook(req.user, b(req).setup || {}, { t: req.t, lang: req.locale });
  if (!r.ok) {
    if (r.code === 'blocked') return res.status(400).json({ error: r.message, code: 'blocked' });
    return err(req, res, r.code === 'cap' ? 429 : r.code === 'notFound' ? 404 : 400, r.code);
  }
  res.json({ ok: true, redirect: `/library/make/${r.id}` });
});

// ---------------------------------------------------------------- the editor
/** What the editor's script needs: the book, the art it can pick, the teacher's pictures, classes and turns left. */
function editorData(req, row) {
  const t = req.t, cat = SB.catalog();
  return {
    id: row.id, rev: row.rev, kind: row.kind, source: row.source, book: SB.bookOf(row), left: SB.left(req.user),
    catalog: cat,
    worlds: Object.keys(cat.worlds).map(id => ({ id, name: t(`studio.worlds.names.${id}`) })),
    chars: Object.keys(cat.chars).map(id => ({ id, name: characterName(id, t), kind: cat.chars[id].kind })),
    uploads: SB.picsOf(row.id),
    classes: SB.shareClasses(req.user).map(c => ({ id: c.id, name: c.name })), shared: SB.sharedWith(row.id).map(c => c.id),
    limits: SB.LIMITS,
    draws: Draw.stateOf(req.user, row),
  };
}
router.get('/library/make/:id', teacher, (req, res) => {
  const row = SB.ownBook(req.user, req.params.id); if (!row) return notFound(req, res);
  const t = req.t, data = editorData(req, row);
  const bk = data.book;
  const body = html`<div class="sb sb-edit" id="sb-edit">
    <div class="sb-ehead">
      <div class="sb-etitle"><label class="sr-only" for="sb-title">${t('storybook.edit.titleLabel')}</label>
        <input class="input sb-title" id="sb-title" maxlength="${SB.LIMITS.title}" value="${bk.title}" placeholder="${t('storybook.untitled')}" dir="auto">
        <span class="chip-s sb-kindchip">${kindName(t, row.kind)}</span><span class="small muted" id="sb-saved" role="status" aria-live="polite"></span></div>
      <div class="sb-eacts">
        <button type="button" class="btn btn-primary btn-sm" id="sb-oomba" aria-controls="oc">${ico('💬', { size: 18 })} ${t('storybook.edit.oomba')}</button>
        <a class="btn btn-sm" id="sb-preview" href="/library/made/${row.id}/read">${ico('👀', { size: 18 })} ${t('storybook.edit.preview')}</a>
        <a class="btn btn-sm" href="/library/made/${row.id}/print">${ico('🖨️', { size: 18 })} ${t('storybook.edit.print')}</a>
        <button type="button" class="btn btn-sm" id="sb-share">${ico('📌', { size: 18 })} ${t('storybook.edit.share')}</button>
        <button type="button" class="btn btn-sm btn-ghost btn-danger" id="sb-delete">${ico('🗑️', { size: 18 })} <span class="sr-only">${t('storybook.edit.delete')}</span></button>
      </div>
    </div>
    <div class="sb-warn" id="sb-warn" aria-live="polite"></div>
    <p class="sb-drawline small" id="sb-drawline" role="status" aria-live="polite" hidden></p>
    <div class="sb-ebody" id="sb-ebody">
      <section class="panel sb-mapp" id="sb-mapp" aria-labelledby="sb-map-h"${row.kind === 'cyoa' ? '' : raw(' hidden')}><h2 id="sb-map-h">${ico('🗺️', { size: 24 })} ${t('storybook.edit.map')}</h2><div class="sb-map" id="sb-map"></div></section>
      <section class="panel sb-list" aria-labelledby="sb-list-h"><h2 id="sb-list-h">${ico('📖', { size: 24 })} ${t('storybook.edit.pages')}</h2><ol class="sb-plist" id="sb-plist"></ol>
        <button type="button" class="btn btn-sm" id="sb-add">${ico('➕', { size: 18 })} ${t('storybook.edit.addPage')}</button></section>
      <section class="panel sb-pagep" id="sb-page" aria-labelledby="sb-page-h"><h2 id="sb-page-h" tabindex="-1"></h2><div id="sb-page-body"></div></section>
    </div>
    <p class="sb-empty muted" id="sb-wait" hidden>${t('storybook.edit.waiting')}</p>
    <input type="file" id="sb-pagepic" accept="image/*" hidden>
  </div>
  ${jsonData('page-data', data)}`;
  page(req, res, { title: bk.title || t('storybook.title'), active: 'learn', body, head: raw(`${CSS}<link rel="stylesheet" href="/css/oomba-chat.css?v=${VERSION}">`), scripts: ['/js/storybook-edit.js'], i18n: ['js.oomba-chat'], back: '/library/make', backLabel: t('storybook.title'), bodyClass: 'sb-editor' });
});
const own = (req, res) => { const row = SB.ownBook(req.user, req.params.id); if (!row) nope(req, res); return row; };
router.get('/api/library/make/:id', teacher, (req, res) => { const row = own(req, res); if (!row) return; const d = editorData(req, row); delete d.catalog; res.json(d); });
router.post('/api/library/make/:id/save', teacher, rateLimit('storybook-save', 240, 60e3), (req, res) => {
  const r = SB.saveBook(req.user, req.params.id, b(req));
  if (r.ok) return res.json(r);
  if (r.code === 'notFound') return nope(req, res);
  if (r.code === 'stale') return res.status(409).json({ error: req.t('storybook.errors.stale'), code: 'stale', rev: r.rev });
  return res.status(400).json({ error: req.t(`storybook.errors.${r.code}`), code: r.code, where: r.where });
});
router.post('/api/library/make/:id/delete', teacher, (req, res) => { const r = SB.deleteBook(req.user, req.params.id); return r.ok ? res.json({ ok: true, redirect: '/library/make' }) : nope(req, res); });
router.post('/api/library/make/:id/share', teacher, (req, res) => {
  const r = SB.setShared(req.user, req.params.id, b(req).classIds);
  if (!r.ok) return r.code === 'notFound' ? nope(req, res) : err(req, res, 400, r.code);
  res.json({ ok: true, shared: r.classes.map(c => c.id), toast: r.classes.length ? req.t('storybook.shareDone', { count: r.classes.length }) : req.t('storybook.shareNone') });
});
router.post('/api/library/make/:id/pic', teacher, rateLimit('storybook-pic', 20, 60e3), picBody, (req, res) => takePic(req, res, req.params.id));
// The picture model's pictures (services/storybook-draw.js): how drawing is going, and Redraw.
router.get('/api/library/make/:id/draws', teacher, (req, res) => { const row = own(req, res); if (!row) return; res.json(Draw.stateOf(req.user, row)); });
router.post('/api/library/make/:id/draw', teacher, rateLimit('storybook-draw', 30, 60e3), (req, res) => {
  const r = Draw.redraw(req.user, req.params.id, String(b(req).target || ''), typeof b(req).note === 'string' ? b(req).note : '');
  if (r.ok) { const row = SB.ownBook(req.user, req.params.id); return res.json({ ok: true, draws: Draw.stateOf(req.user, row) }); }
  if (r.code === 'notFound') return nope(req, res);
  if (r.code === 'words' || r.code === 'names' || r.code === 'personal') return err(req, res, 400, r.code === 'names' ? 'names' : 'words');
  return res.status(r.code === 'limit' ? 429 : r.code === 'off' ? 409 : 503).json({ error: req.t(`storybook.draw.${r.code}`), code: r.code });
});
router.post('/api/library/make/:id/pic/:pic/remove', teacher, (req, res) => { const r = SB.removePic(req.user, req.params.id, req.params.pic); return r.ok ? res.json(r) : nope(req, res); });

// Oomba's chat about a book (the shared engine; the daily cap is spent before a message is stored).
const chatErr = (req, res, r) => {
  if (r.code === 'notFound') return nope(req, res);
  if (r.code === 'cap') return err(req, res, 429, 'cap');
  return res.status(r.code === 'chatBusy' || r.code === 'otherBusy' ? 409 : 400).json({ error: req.t(`js.oomba-chat.err.${['names', 'words', 'personal', 'brief', 'chatBusy', 'otherBusy'].includes(r.code) ? r.code : 'other'}`), code: r.code });
};
router.get('/api/library/make/:id/chat', teacher, (req, res) => {
  const r = C.current(req.user, SB.SURFACE, req.params.id);
  if (!r.ok) return chatErr(req, res, r);
  res.json({ chat: r.chat, left: SB.left(req.user) });
});
router.post('/api/library/make/:id/chat', teacher, rateLimit('storybook-chat', 30, 60e3), (req, res) => {
  const r = SB.sendMessage(req.user, req.params.id, { text: b(req).text, retry: typeof b(req).retry === 'string' ? b(req).retry : undefined });
  if (!r.ok) return chatErr(req, res, r);
  res.json({ chat: r.chat, left: SB.left(req.user) });
});
router.post('/api/library/make/:id/chat/undo', teacher, (req, res) => {
  const r = C.undo(req.user, SB.SURFACE, req.params.id, b(req).turnId);
  if (!r.ok) return chatErr(req, res, r);
  res.json(r);
});

// ---------------------------------------------------------------- reading, print, pictures (whoever may read it)
const readableOr404 = (req, res) => { const row = req.user ? SB.readable(req.user, req.params.id) : null; if (!row) { notFound(req, res); return null; } return row; };
router.get('/library/made/:id/pic/:pic', (req, res) => {
  const row = req.user ? SB.readable(req.user, req.params.id) : null;
  const p = row ? SB.picOf(req.params.pic) : null;
  if (!p || p.book_id !== row.id) return res.status(404).send('Not found');
  sendPic(res, p);
});

/** The reader's page: the picture on top, the title, the words, then the choices (CYOA) or Back and Next. Works without
 *  JavaScript (a GET form: ?p= the page, ?t= the pages that led here); public/js/storybook-read.js turns pages in place
 *  and remembers the place. */
router.get('/library/made/:id/read', (req, res) => {
  if (!req.user) return res.redirect(`/login?next=${encodeURIComponent(req.originalUrl)}`);
  const row = readableOr404(req, res); if (!row) return;
  const t = req.t, u = req.user, bk = SB.bookOf(row);
  if (!bk.pages.length) return notFound(req, res);
  const rd = SB.readOf(u.id, row.id);
  const ids = new Set(bk.pages.map(p => p.id));
  const fromQ = typeof req.query.p === 'string' && ids.has(req.query.p) ? req.query.p : null;
  const trail = (fromQ ? String(req.query.t || '') : rd ? rd.trail : '').split('.').join(',').split(',').filter(x => ids.has(x)).slice(-60);
  const at = fromQ || (rd && ids.has(rd.page_id) ? rd.page_id : bk.kind === 'cyoa' ? bk.start : bk.pages[0].id);
  const owner = row.owner_id === u.id;
  const back = owner ? { href: `/library/make/${row.id}`, label: t('storybook.read.backToEditor') } : { href: '/library', label: t('library.title') };
  const body = html`<div class="rd sb-rd" id="reader" data-book="${row.id}">
    <div class="rd-top"><a class="rd-back" href="${back.href}"><span class="flip" aria-hidden="true">←</span> <span dir="auto">${back.label}</span></a>
      <h1 class="rd-title" dir="auto">${bk.title}</h1>${owner ? html`<span class="chip-s">${t('storybook.read.preview')}</span>` : ''}</div>
    <div id="sb-read">${raw(readerPage(req, row, bk, at, trail))}</div>
  </div>
  ${jsonData('page-data', { id: row.id, book: { ...bk, pages: bk.pages.map(p => ({ ...p, art: SB.pictureHtml(row, bk, p) })) }, at, trail, endings: rd ? rd.endings.split(',').filter(Boolean) : [] })}`;
  page(req, res, { title: bk.title, active: 'learn', body, head: CSS, scripts: ['/js/storybook-read.js'], mid: true, companion: false });
});
/** One page of the reader as HTML (the server's first page; the script draws the same markup). */
function readerPage(req, row, bk, at, trail) {
  const t = req.t, pg = pageOf(bk, at), cyoa = bk.kind === 'cyoa';
  const i = bk.pages.indexOf(pg), last = cyoa ? pg.end : i === bk.pages.length - 1;
  const prev = cyoa ? trail[trail.length - 1] : i > 0 ? bk.pages[i - 1].id : null;
  const tr = trail.join('.');
  const go = (to, label, cls, tt) => html`<form method="get" class="sb-go"><input type="hidden" name="p" value="${to}"><input type="hidden" name="t" value="${tt}"><button class="btn ${cls}" type="submit">${label}</button></form>`;
  const startId = cyoa ? bk.start : bk.pages[0].id;
  return String(html`<article class="sb-page-r" aria-labelledby="sb-rt">
    <figure class="rd-pic sb-rpic">${raw(SB.pictureHtml(row, bk, pg))}</figure>
    ${pg.title ? html`<h2 class="sb-rt" id="sb-rt" dir="auto">${pg.title}</h2>` : html`<h2 class="sr-only" id="sb-rt">${t('storybook.read.pageN', { n: cyoa ? numbering(bk).get(pg.id) : i + 1 })}</h2>`}
    <p class="rd-text sb-rtext" dir="auto">${pg.text}</p>
    ${last ? html`<p class="sb-theend">${ico('⭐', { size: 28 })} ${t('storybook.read.theEnd')}</p>` : ''}
    ${cyoa && !last ? html`<div class="sb-choices" role="group" aria-label="${t('storybook.read.choices')}">${pg.choices.filter(c => c.to && pageOf(bk, c.to)).map(c => go(c.to, c.text, 'btn-primary sb-choice', [...trail, pg.id].join('.')))}</div>` : ''}
    <nav class="sb-rnav" aria-label="${t('library.pagesLabel')}">
      ${prev ? go(prev, html`<span class="flip" aria-hidden="true">◀</span> ${t('storybook.read.back')}`, '', trail.slice(0, -1).join('.')) : ''}
      ${!cyoa && !last ? go(bk.pages[i + 1].id, html`${t('library.next')} <span class="flip" aria-hidden="true">▶</span>`, 'btn-primary', tr) : ''}
      ${last ? go(startId, html`${ico('🔁', { size: 18 })} ${t('storybook.read.startOver')}`, 'btn-primary', '') : ''}
    </nav></article>`);
}
router.post('/api/library/made/:id/progress', rateLimit('library', 600, 60e3), (req, res) => {
  const row = req.user ? SB.readable(req.user, req.params.id) : null;
  if (!row) return nope(req, res);
  const r = SB.progress(req.user, row, { page: String(b(req).page || ''), trail: b(req).trail });
  res.status(r.ok ? 200 : 400).json({ ok: r.ok });
});

/** Print or save as PDF: a title page, then every page numbered (a CYOA book in the order a reader meets them), each
 *  choice as "Turn to page N", and "The End" on endings. Teachers only (the owner, or staff of a class it is shared with). */
router.get('/library/made/:id/print', teacher, (req, res) => {
  const row = readableOr404(req, res); if (!row) return;
  const t = req.t, bk = SB.bookOf(row), num = numbering(bk), cyoa = bk.kind === 'cyoa';
  const order = [...bk.pages].sort((a, c) => num.get(a.id) - num.get(c.id));
  const reach = reachable(bk);
  const body = html`<div class="sb-print">
    <div class="sb-print-bar noprint"><button type="button" class="btn btn-primary" id="sb-print-go">${ico('🖨️', { size: 18 })} ${t('storybook.print.go')}</button>
      <a class="btn" href="${row.owner_id === req.user.id ? `/library/make/${row.id}` : `/library/made/${row.id}/read`}">${t('storybook.back')}</a>
      <p class="small muted">${t('storybook.print.hint')}</p></div>
    <section class="sb-sheet sb-cover">
      ${order[0] ? html`<div class="sb-cover-art">${raw(SB.pictureHtml(row, bk, order[0], { decorative: true }))}</div>` : ''}
      <h1 dir="auto">${bk.title || t('storybook.untitled')}</h1>
      <p class="sb-cover-kind">${kindName(t, bk.kind)}</p>
      ${cyoa ? html`<p class="sb-cover-how">${t('storybook.print.how')}</p>` : ''}
      <p class="sb-cover-made small">${t('storybook.print.made')}</p>
    </section>
    ${order.map(p => html`<section class="sb-sheet" aria-label="${t('storybook.read.pageN', { n: num.get(p.id) })}">
      <p class="sb-folio">${t('storybook.read.pageN', { n: num.get(p.id) })}</p>
      ${p.pic || p.upload ? html`<figure class="sb-ppic">${raw(SB.pictureHtml(row, bk, p))}</figure>` : ''}
      ${p.title ? html`<h2 dir="auto">${p.title}</h2>` : ''}
      <p class="sb-ptext" dir="auto">${p.text}</p>
      ${cyoa && !p.end ? html`<ul class="sb-turns">${p.choices.filter(c => c.to && num.has(c.to)).map(c => html`<li dir="auto">${t('storybook.print.turn', { choice: c.text, page: num.get(c.to) })}</li>`)}</ul>` : ''}
      ${(cyoa && p.end) || (!cyoa && p === order[order.length - 1]) ? html`<p class="sb-theend">${t('storybook.read.theEnd')}</p>` : ''}
      ${cyoa && !reach.has(p.id) ? html`<p class="small muted noprint">${t('storybook.warn.unreachable')}</p>` : ''}
    </section>`)}
  </div>`;
  page(req, res, { title: bk.title || t('storybook.title'), active: 'learn', body, head: CSS, scripts: ['/js/storybook-read.js'], companion: false, bodyClass: 'sb-printpage' });
});
