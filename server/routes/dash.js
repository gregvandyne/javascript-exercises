// Classroom dashboards, stage 1 (services/dash.js; docs/decisions.md "Classroom dashboards, stage 1").
//   GET  /class/:id/dashboard                 the class's teacher: the projector screen; a student: their own screen
//   GET  /dashboard                           a student's way in: their one class's screen, or a list to pick from
//   GET  /class/:id/dashboard/link/:lid       a student (or teacher) opens an approved link: only while it is approved
//   GET  /dash/pictures/:pid                  a background picture: its owner and the class's teachers only
//   GET  /api/dash/:id/live                   what a screen checks every few seconds (Eyes up, pushes, pinned widgets)
//   GET  /api/dash/:id/pins                   the pinned widgets as students get them
//   POST /api/dash/:id/me                     a student saves their screen
//   POST /api/dash/:id/layouts[/:lid[/use|/delete]]   a teacher's layouts
//   GET  /api/dash/:id/push-options           POST /api/dash/:id/pushes, /pushes/:pid/end    the teacher sends
//   POST /api/dash/:id/pushes/:pid/hide       a student hides a push from their banner (or brings it back)
//   POST /api/dash/:id/links, /links/:lid/remove           approved links
//   POST /api/dash/:id/eyes                   Eyes up on or off
//   POST /api/dash/:id/pictures, GET /api/dash/:id/pictures, POST /api/dash/:id/pictures/:pid/remove
// Stage 2 (docs/decisions.md "Classroom dashboards, stage 2"): everyday widgets. Their changing state (timers, help
// queue, checks, weather) rides on /live; these only act or fetch once.
//   POST /api/dash/:id/timers/:wid            a teacher starts, pauses, resets or sets a timer (server time)
//   GET|POST /api/dash/:id/picker             the random student picker (teacher only)
//   POST /api/dash/:id/help                   a student: I need help / I'm done / cancel (fixed buttons)
//   POST /api/dash/:id/help/queue             the teacher: next, remove one, clear
//   POST /api/dash/:id/checks, /checks/:cid/end|save, GET /checks/:cid/names, GET /checks/saved   quick checks (teacher)
//   POST /api/dash/:id/checks/:cid/answer     a student taps an answer
//   GET  /api/dash/:id/places?q=              the teacher looks up a city for the weather (server side)
//   GET  /api/dash/:id/qr?kind=&ref=          a QR code for an allowed target (teacher)
//   GET  /api/dash/:id/tiles?refs=            Oomba tiles the reader can open
// Every route asks D.roleOf / D.isTeacher: only the class's own teacher changes the class screen, sends, approves links
// or starts Eyes up; only the class's students and teachers read it. Everyone else gets 404. CSRF is the site's
// same-origin check (auth.csrfCheck); every write has a rate limit.
import { Router } from 'express';
import express from 'express';
import fs from 'node:fs';
import { html, raw, jsonData } from '../views/html.js';
import { page, notFound, VERSION } from '../views/layout.js';
import { wordmark } from '../views/brand.js';
import { avatar } from '../views/components.js';
import { requireUser } from '../auth.js';
import { rateLimit } from '../services/ratelimit.js';
import * as S from '../services/schools.js';
import * as D from '../services/dash.js';
import { qrSvg } from '../services/qr.js';
import { origin } from '../seo.js';

export const router = Router();
const CSS = raw(`<link rel="stylesheet" href="/css/dash.css?v=${VERSION}">`);
const no = (req, res) => (req.path.startsWith('/api/') ? res.status(404).json({ error: req.t('dash.errors.notFound') }) : notFound(req, res, req.t('dash.errors.notFound')));
const fail = (req, res, code, status = 400) => res.status(status).json({ error: req.t(`dash.errors.${code}`) });
const send = (req, res, r, extra = {}) => (r.error ? fail(req, res, r.error, r.error === 'notFound' ? 404 : 400) : res.json({ ok: true, ...r, ...extra }));
/** The class and the reader's role in it, or a 404. teacher: only the class's own teacher may go on. */
function load(req, res, { teacher = false, student = false } = {}) {
  const c = S.getClass(req.params.id);
  const role = c ? D.roleOf(req.user, c) : null;
  if (!role || (teacher && role !== 'teacher') || (student && role !== 'student')) { no(req, res); return null; }
  return { c, role };
}
const body = req => (req.body && typeof req.body === 'object' ? req.body : {});

// ---------------------------------------------------------------- pages
/** The background picker (edit mode): colours, Oomba art, a picture. */
function bgBar(t) {
  const sw = (kind, id) => html`<button class="dash-sw dash-bg-${kind}-${id}" type="button" data-bg-kind="${kind}" data-bg-id="${id}" aria-pressed="false"><span class="sr-only">${t(`dash.bg.${id}`)}</span></button>`;
  return html`<section class="dash-bgbar" aria-labelledby="dash-bg-h"><h2 class="dash-h3" id="dash-bg-h">${t('dash.bg.heading')}</h2>
    <div class="dash-sws" role="group" aria-label="${t('dash.bg.colors')}">${D.BG_COLORS.map(id => sw('color', id))}</div>
    <div class="dash-sws" role="group" aria-label="${t('dash.bg.art')}">${D.BG_ART.map(id => sw('art', id))}</div>
    <button class="btn btn-sm" type="button" data-bg-upload>🖼️ ${t('dash.bg.upload')}</button>
    <input type="file" accept="image/*" id="dash-bg-file" hidden>
    <p class="small muted dash-bgnote">${t('dash.bg.note')}</p></section>`;
}
/** The widget library (edit mode). Filled from the registry by public/js/dash.js. */
const library = t => html`<aside class="dash-lib" id="dash-lib" aria-labelledby="dash-lib-h" hidden>
  <h2 id="dash-lib-h">${t('dash.lib.heading')}</h2>
  <label class="dash-lab" for="dash-lib-q">${t('dash.lib.search')}</label>
  <input class="input" id="dash-lib-q" type="search" autocomplete="off" placeholder="${t('dash.lib.searchHint')}">
  <div class="chips dash-groups" id="dash-lib-groups" role="group" aria-label="${t('dash.lib.groups')}"></div>
  <ul class="plain dash-lib-list" id="dash-lib-list"></ul>
</aside>`;
/** The selected widget's settings (edit mode). */
const side = t => html`<aside class="dash-side" id="dash-side" aria-labelledby="dash-side-h" hidden><h2 id="dash-side-h">${t('dash.side.none')}</h2><div id="dash-side-body"></div></aside>`;

function dashPage(req, res, c, role) {
  const t = req.t, u = req.user;
  const s = S.getSchool(c.school_id);
  const reg = D.registryFor(t, role);
  let data, top, foot = '';
  if (role === 'teacher') {
    const layouts = D.ensureLayouts(u, c, t('dash.layouts.defaultName'));
    const cur = D.currentLayout(u, c, layouts);
    data = { role, classId: c.id, tz: S.zoneOf(s) || D.FALLBACK_TZ, registry: reg, layouts: layouts.map(l => ({ id: l.id, name: l.name, widgets: l.widgets, bg: l.bg })), current: cur.id, active: D.classState(c.id).layout_id, live: D.liveState(c, u, role), eyesMs: D.EYES_MS };
    top = html`<header class="dash-top" id="dash-top">
      <a class="dash-logo" href="/class/${c.id}" aria-label="${t('dash.top.backClass')}">${wordmark()}</a>
      <span class="dash-sep" aria-hidden="true"></span>
      <h1 class="dash-class">${c.name}</h1>
      <span class="dash-date" id="dash-date"></span>
      <span class="dash-grow"></span>
      <span class="dash-now" id="dash-now" aria-hidden="true"></span>
      <button class="btn btn-sm" type="button" id="dash-projector" aria-pressed="false">📽️ ${t('dash.top.projector')}</button>
      <button class="btn btn-sm" type="button" id="dash-edit">✏️ ${t('dash.top.edit')}</button>
    </header>
    <header class="dash-top dash-edithead" id="dash-edithead" hidden>
      <h1 class="dash-class" id="dash-editing">${t('dash.top.editing', { name: cur.name })}</h1>
      <span class="small muted dash-hint">${t('dash.top.editHint')}</span>
      <span class="dash-grow"></span>
      <button class="btn btn-sm" type="button" id="dash-undo" disabled>↶ ${t('dash.top.undo')}</button>
      <button class="btn btn-primary btn-sm" type="button" id="dash-done">✔ ${t('dash.top.done')}</button>
    </header>`;
    foot = html`<footer class="dash-foot" id="dash-foot">
      <span class="dash-lab" id="dash-layouts-l">${t('dash.layouts.label')}</span>
      <div class="dash-layouts" id="dash-layouts" role="group" aria-labelledby="dash-layouts-l"></div>
      <button class="btn btn-sm" type="button" id="dash-layout-new">➕ ${t('dash.layouts.new')}</button>
      <button class="btn btn-sm" type="button" id="dash-layout-more" aria-label="${t('dash.layouts.manage')}">⋯</button>
      <span class="dash-grow"></span>
      <button class="btn btn-sm" type="button" id="dash-eyes-btn" aria-pressed="false">👀 ${t('dash.foot.eyes')}</button>
      <button class="btn btn-primary btn-sm" type="button" id="dash-push">📤 ${t('dash.foot.push')} <span class="dash-count" id="dash-push-n" hidden></span></button>
    </footer>`;
  } else {
    const st = D.studentState(c.id, u.id);
    data = { role, classId: c.id, tz: S.zoneOf(s) || D.FALLBACK_TZ, registry: reg, me: st, pins: D.pinsOf(c.id), live: D.liveState(c, u, role) };
    top = html`<header class="dash-top" id="dash-top">
      <a class="dash-logo" href="/class/${c.id}" aria-label="${t('dash.top.backMyClass')}">${wordmark()}</a>
      <span class="dash-sep" aria-hidden="true"></span>
      <h1 class="dash-class">${c.name}</h1>
      <span class="dash-grow"></span>
      <button class="btn btn-sm dash-traybtn" type="button" id="dash-tray-btn" aria-expanded="false" aria-controls="dash-tray">📥 ${t('dash.tray.button')} <span class="dash-count" id="dash-tray-n">0</span></button>
      <span class="dash-now" id="dash-now" aria-hidden="true"></span>
      <span class="dash-me">${avatar(u, 36)}<span class="dash-myname">${u.display_name}</span></span>
      <button class="btn btn-sm" type="button" id="dash-edit">✏️ ${t('dash.top.editMine')}</button>
    </header>
    <header class="dash-top dash-edithead" id="dash-edithead" hidden>
      <h1 class="dash-class">${t('dash.top.editingMine')}</h1>
      <span class="small muted dash-hint">${t('dash.top.editHintMine')}</span>
      <span class="dash-grow"></span>
      <button class="btn btn-sm" type="button" id="dash-undo" disabled>↶ ${t('dash.top.undo')}</button>
      <button class="btn btn-primary btn-sm" type="button" id="dash-done">✔ ${t('dash.top.done')}</button>
    </header>
    <section class="dash-tray" id="dash-tray" aria-labelledby="dash-tray-h" hidden>
      <div class="dash-trayhead"><h2 id="dash-tray-h">${t('dash.tray.heading')}</h2><button class="btn btn-sm" type="button" id="dash-tray-close">${t('dash.tray.close')}</button></div>
      <ul class="plain dash-traylist" id="dash-traylist"></ul>
      <p class="small muted" id="dash-tray-empty">${t('dash.tray.empty')}</p>
      <p class="small muted">${t('dash.tray.note')}</p>
    </section>
    <div class="dash-bannerslot" id="dash-banner" aria-live="polite"></div>
    <section class="dash-check" id="dash-check" aria-labelledby="dash-check-h" tabindex="-1" hidden></section>`;
  }
  const bodyHtml = html`<div class="dash dash-${role}" id="dash" data-role="${role}" data-class="${c.id}">
    ${top}
    <div class="dash-body">
      ${library(t)}
      <div class="dash-stage">
        <div class="dash-grid" id="dash-grid" role="list" aria-label="${role === 'teacher' ? t('dash.gridTeacher') : t('dash.gridStudent')}"></div>
        <div class="dash-editfoot" id="dash-editfoot" hidden>${bgBar(t)}</div>
      </div>
      ${side(t)}
    </div>
    ${foot}
    ${role === 'student' ? html`<div class="dash-eyes" id="dash-eyes" role="alertdialog" aria-modal="true" aria-labelledby="dash-eyes-h" hidden><div class="dash-eyescard"><div class="dash-eyesmark" aria-hidden="true">👀</div><h2 id="dash-eyes-h">${t('dash.eyes.title')}</h2><p>${t('dash.eyes.text')}</p></div></div>` : ''}
    <p class="sr-only" id="dash-say" aria-live="polite"></p>
    <noscript><p class="notice warn">${t('dash.noscript')}</p></noscript>
    ${jsonData('page-data', { ...data, school: s ? s.name : '' })}
  </div>`;
  page(req, res, { title: role === 'teacher' ? t('dash.title', { name: c.name }) : t('dash.myTitle', { name: c.name }), active: 'classes', body: bodyHtml, head: CSS, bare: true, bodyClass: `dash-page dash-page-${role}`, scripts: ['/js/dash.js'] });
}

router.get('/class/:id/dashboard', requireUser, (req, res) => {
  const x = load(req, res); if (!x) return;
  res.set('Cache-Control', 'no-store');
  dashPage(req, res, x.c, x.role);
});

/** A student's way in: their class's screen (one class), or the list of their classes. Staff go to their classes. */
router.get('/dashboard', requireUser, (req, res) => {
  const t = req.t;
  const mine = S.classesOf(req.user.id, 'student').filter(c => D.isStudent(req.user, S.getClass(c.id)));
  if (mine.length === 1) return res.redirect(`/class/${mine[0].id}/dashboard`);
  if (!mine.length) return res.redirect(S.isSchoolStaff(req.user) ? '/teach' : '/classes');
  page(req, res, { title: t('dash.pick.title'), active: 'classes', head: CSS, body: html`<div class="pagehead"><h1>🖥️ ${t('dash.pick.title')}</h1></div>
    <ul class="plain dash-pick">${mine.map(c => html`<li><a class="panel dash-pickcard" href="/class/${c.id}/dashboard"><b>${c.name}</b><span class="small muted">${c.school_name}</span></a></li>`)}</ul>` });
});

/** An approved link, for the class's students and teachers, only while it is on the class's list. */
router.get('/class/:id/dashboard/link/:lid', requireUser, (req, res) => {
  const x = load(req, res); if (!x) return;
  const l = D.getLink(x.c.id, req.params.lid);
  if (!l || !D.cleanUrl(l.url)) return no(req, res);
  res.set({ 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' });
  res.redirect(302, l.url);
});

/** A background picture: its owner, and the teachers of the class it was added for. Everyone else: 404. */
router.get('/dash/pictures/:pid', (req, res) => {
  res.set({ 'Cache-Control': 'private, max-age=600', Vary: 'Cookie', 'X-Content-Type-Options': 'nosniff' });
  const p = D.getPicture(req.params.pid);
  if (!p || !D.canSeePicture(req.user, p) || !fs.existsSync(D.picFile(p.id))) return res.status(404).end();
  res.type('jpg').sendFile(D.picFile(p.id));
});

// ---------------------------------------------------------------- what screens check
router.get('/api/dash/:id/live', requireUser, rateLimit('dash-live', 120, 60e3), (req, res) => {
  const x = load(req, res); if (!x) return;
  res.set('Cache-Control', 'no-store');
  res.json(D.liveState(x.c, req.user, x.role));
});
router.get('/api/dash/:id/pins', requireUser, rateLimit('dash-live', 120, 60e3), (req, res) => {
  const x = load(req, res); if (!x) return;
  res.set('Cache-Control', 'no-store');
  res.json({ pins: D.pinsOf(x.c.id), pinsAt: D.classState(x.c.id).pins_at });
});

// ---------------------------------------------------------------- a student's own screen
router.post('/api/dash/:id/me', requireUser, rateLimit('dash-save', 300, 3600e3), (req, res) => {
  const x = load(req, res, { student: true }); if (!x) return;
  const b = body(req);
  send(req, res, D.saveStudent(req.user, x.c, { widgets: b.widgets, pins: b.pins, bg: b.bg }));
});
router.post('/api/dash/:id/pushes/:pid/hide', requireUser, rateLimit('dash-hide', 240, 3600e3), (req, res) => {
  const x = load(req, res, { student: true }); if (!x) return;
  send(req, res, D.hidePush(req.user, x.c, req.params.pid, body(req).hidden !== false));
});

// ---------------------------------------------------------------- a teacher's layouts
router.post('/api/dash/:id/layouts', requireUser, rateLimit('dash-layout', 120, 3600e3), (req, res) => {
  const x = load(req, res, { teacher: true }); if (!x) return;
  const b = body(req);
  const from = b.copyFrom ? D.getLayout(b.copyFrom) : null;
  const src = from && from.class_id === x.c.id && from.owner_id === req.user.id ? from : null;
  send(req, res, D.createLayout(req.user, x.c, { name: b.name, widgets: src ? src.widgets : D.starterWidgets(), bg: src ? src.bg : D.DEFAULT_BG }));
});
router.post('/api/dash/:id/layouts/:lid', requireUser, rateLimit('dash-save', 300, 3600e3), (req, res) => {
  const x = load(req, res, { teacher: true }); if (!x) return;
  const b = body(req);
  send(req, res, D.updateLayout(req.user, x.c, req.params.lid, { name: b.name, widgets: b.widgets, bg: b.bg }));
});
router.post('/api/dash/:id/layouts/:lid/use', requireUser, rateLimit('dash-layout', 120, 3600e3), (req, res) => {
  const x = load(req, res, { teacher: true }); if (!x) return;
  send(req, res, D.useLayout(req.user, x.c, req.params.lid));
});
router.post('/api/dash/:id/layouts/:lid/delete', requireUser, rateLimit('dash-layout', 120, 3600e3), (req, res) => {
  const x = load(req, res, { teacher: true }); if (!x) return;
  send(req, res, D.deleteLayout(req.user, x.c, req.params.lid));
});

// ---------------------------------------------------------------- push, links, Eyes up
router.get('/api/dash/:id/push-options', requireUser, rateLimit('dash-options', 120, 60e3), (req, res) => {
  const x = load(req, res, { teacher: true }); if (!x) return;
  res.set('Cache-Control', 'no-store');
  res.json(D.pushOptions(req.user, x.c, String(req.query.q || '').slice(0, 60)));
});
router.post('/api/dash/:id/pushes', requireUser, rateLimit('dash-push', 60, 3600e3), (req, res) => {
  const x = load(req, res, { teacher: true }); if (!x) return;
  const b = body(req);
  send(req, res, D.push(req.user, x.c, { kind: b.kind, ref: b.ref }), { toast: req.t('dash.push.sent') });
});
router.post('/api/dash/:id/pushes/:pid/end', requireUser, rateLimit('dash-push', 60, 3600e3), (req, res) => {
  const x = load(req, res, { teacher: true }); if (!x) return;
  send(req, res, D.endPush(req.user, x.c, req.params.pid));
});
router.post('/api/dash/:id/links', requireUser, rateLimit('dash-links', 60, 3600e3), (req, res) => {
  const x = load(req, res, { teacher: true }); if (!x) return;
  const b = body(req);
  send(req, res, D.addLink(req.user, x.c, { url: b.url, title: b.title }));
});
router.post('/api/dash/:id/links/:lid/remove', requireUser, rateLimit('dash-links', 60, 3600e3), (req, res) => {
  const x = load(req, res, { teacher: true }); if (!x) return;
  send(req, res, D.removeLink(req.user, x.c, req.params.lid));
});
router.post('/api/dash/:id/eyes', requireUser, rateLimit('dash-eyes', 60, 3600e3), (req, res) => {
  const x = load(req, res, { teacher: true }); if (!x) return;
  send(req, res, D.setEyes(req.user, x.c, body(req).on !== false));
});

// ---------------------------------------------------------------- background pictures
router.post('/api/dash/:id/pictures', requireUser, rateLimit('dash-picture', 20, 3600e3), express.raw({ type: () => true, limit: '1mb', inflate: false }), (req, res) => {
  const x = load(req, res); if (!x) return;
  try {
    const r = D.savePicture(req.user, x.c, Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0));
    res.json({ ok: true, id: r.id, url: `/dash/pictures/${r.id}` });
  } catch (e) {
    if (e instanceof D.PhotoError) return res.status(e.status).json({ error: req.t(`dash.errors.pic_${e.code === 'tooBig' ? 'tooBig' : 'badType'}`) });
    throw e;
  }
});
router.get('/api/dash/:id/pictures', requireUser, (req, res) => {
  const x = load(req, res, { teacher: true }); if (!x) return;
  res.set('Cache-Control', 'no-store');
  res.json({ pictures: D.studentPictures(x.c).map(p => ({ id: p.id, url: `/dash/pictures/${p.id}`, name: p.roster_name || p.display_name, at: p.created_at })) });
});
router.post('/api/dash/:id/pictures/:pid/remove', requireUser, rateLimit('dash-picture', 60, 3600e3), (req, res) => {
  const x = load(req, res); if (!x) return;
  send(req, res, D.removePicture(req.user, x.c, req.params.pid));
});

// ================================================================ stage 2: everyday widgets
router.post('/api/dash/:id/timers/:wid', requireUser, rateLimit('dash-timer', 600, 3600e3), (req, res) => {
  const x = load(req, res, { teacher: true }); if (!x) return;
  const b = body(req);
  send(req, res, D.timerAction(req.user, x.c, req.params.wid, { action: b.action, ms: b.ms }));
});

router.get('/api/dash/:id/picker', requireUser, rateLimit('dash-picker', 600, 3600e3), (req, res) => {
  const x = load(req, res, { teacher: true }); if (!x) return;
  res.set('Cache-Control', 'no-store');
  res.json(D.pickerView(x.c));
});
router.post('/api/dash/:id/picker', requireUser, rateLimit('dash-picker', 600, 3600e3), (req, res) => {
  const x = load(req, res, { teacher: true }); if (!x) return;
  const b = body(req);
  send(req, res, D.pickerAction(req.user, x.c, { action: b.action, user: b.user, on: b.on !== false, norepeat: b.norepeat !== false }));
});

router.post('/api/dash/:id/help', requireUser, rateLimit('dash-help', 120, 3600e3), (req, res) => {
  const x = load(req, res, { student: true }); if (!x) return;
  send(req, res, D.helpAsk(req.user, x.c, String(body(req).kind || '')));
});
router.post('/api/dash/:id/help/queue', requireUser, rateLimit('dash-help-queue', 600, 3600e3), (req, res) => {
  const x = load(req, res, { teacher: true }); if (!x) return;
  const b = body(req);
  send(req, res, D.helpTeacher(req.user, x.c, { action: b.action, user: b.user, kind: b.kind }));
});

router.post('/api/dash/:id/checks', requireUser, rateLimit('dash-check', 60, 3600e3), (req, res) => {
  const x = load(req, res, { teacher: true }); if (!x) return;
  const b = body(req);
  send(req, res, D.createCheck(req.user, x.c, { kind: b.kind, question: b.question, options: b.options }), { toast: req.t('dash.push.sent') });
});
router.get('/api/dash/:id/checks/saved', requireUser, rateLimit('dash-options', 120, 60e3), (req, res) => {
  const x = load(req, res, { teacher: true }); if (!x) return;
  res.set('Cache-Control', 'no-store');
  res.json({ checks: D.savedChecks(x.c) });
});
router.get('/api/dash/:id/checks/:cid/names', requireUser, rateLimit('dash-options', 120, 60e3), (req, res) => {
  const x = load(req, res, { teacher: true }); if (!x) return;
  res.set('Cache-Control', 'no-store');
  send(req, res, D.checkNames(x.c, req.params.cid));
});
router.post('/api/dash/:id/checks/:cid/end', requireUser, rateLimit('dash-check', 60, 3600e3), (req, res) => {
  const x = load(req, res, { teacher: true }); if (!x) return;
  send(req, res, D.endCheck(req.user, x.c, req.params.cid));
});
router.post('/api/dash/:id/checks/:cid/save', requireUser, rateLimit('dash-check', 60, 3600e3), (req, res) => {
  const x = load(req, res, { teacher: true }); if (!x) return;
  send(req, res, D.saveCheck(req.user, x.c, req.params.cid, body(req).saved !== false));
});
router.post('/api/dash/:id/checks/:cid/answer', requireUser, rateLimit('dash-answer', 240, 3600e3), (req, res) => {
  const x = load(req, res, { student: true }); if (!x) return;
  send(req, res, D.answerCheck(req.user, x.c, req.params.cid, body(req).value));
});

router.get('/api/dash/:id/places', requireUser, rateLimit('dash-places', 40, 3600e3), async (req, res) => {
  const x = load(req, res, { teacher: true }); if (!x) return;
  res.set('Cache-Control', 'no-store');
  const r = await D.findPlaces(String(req.query.q || ''), req.locale || 'en');
  if (r.error) return fail(req, res, 'resting', 503);
  res.json(r);
});

router.get('/api/dash/:id/qr', requireUser, rateLimit('dash-qr', 240, 3600e3), (req, res) => {
  const x = load(req, res, { teacher: true }); if (!x) return;
  res.set('Cache-Control', 'no-store');
  const tg = D.qrTarget(x.c, { kind: String(req.query.kind || ''), ref: String(req.query.ref || '') }, origin(req));
  if (!tg) return fail(req, res, 'qrGone', 404);
  let svg; try { svg = qrSvg(tg.url, { title: req.t('dash.w.qr.scan') }); } catch { return fail(req, res, 'qrGone', 404); }
  res.json({ svg, text: tg.text, title: tg.title });
});

router.get('/api/dash/:id/tiles', requireUser, rateLimit('dash-tiles', 240, 60e3), (req, res) => {
  const x = load(req, res); if (!x) return;
  res.set('Cache-Control', 'no-store');
  const refs = String(req.query.refs || '').split(',').slice(0, D.MAX_TILES).map(r => { const [kind, ref] = r.split(':'); return { kind, ref }; });
  res.json({ tiles: D.resolveTiles(x.c, refs) });
});
