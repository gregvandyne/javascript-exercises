// The teaching loop for staff (docs/decisions.md "The teaching loop"): /teach/loop ("How Oomba fits your week") and the
// Classroom home card's Hide / Show again. School staff only (S.isSchoolStaff): everyone else gets 404, like /teach.
// The card itself is drawn by routes/schools.js (classroomHome) with views/teacher-loop.js.
import { Router } from 'express';
import { html, raw } from '../views/html.js';
import { page, notFound, VERSION } from '../views/layout.js';
import { requireUser } from '../auth.js';
import * as S from '../services/schools.js';
import * as TL from '../services/teach-loop.js';
import { liveOn } from '../services/classlive-sessions.js';
import { canHost as liveCanHost } from '../services/classlive-access.js';
import { teacherLoop } from '../views/teacher-loop.js';

export const router = Router();
export const LOOP_CSS = raw(`<link rel="stylesheet" href="/css/teach-loop.css?v=${VERSION}">`);
const staff = (req, res) => {
  if (S.isSchoolStaff(req.user)) return true;
  if (req.path.startsWith('/api/')) res.status(404).json({ error: req.t('school.errors.notFound') });
  else notFound(req, res, req.t('school.errors.notTeacher'));
  return false;
};

router.get('/teach/loop', requireUser, (req, res) => {
  if (!staff(req, res)) return;
  const t = req.t, u = req.user;
  const state = TL.loopState(u), links = TL.loopLinks(u);
  const body = html`<div class="pagehead"><div><h1>🗓️ ${t('teach.loop.page.title')}</h1><p class="muted">${t('teach.loop.page.lead')}</p></div></div>
  ${teacherLoop(t, { variant: 'page', links, state, live: liveOn() && liveCanHost(u), headingTag: 'h2' })}
  <div class="row tl-foot">${state.hidden && !state.all ? html`<form data-api="/api/teach/loop/show" data-reload data-toast="${t('teach.loop.page.shown', { classroom: t('nav.classroom') })}"><button class="btn" type="submit">🔁 ${t('teach.loop.page.show', { classroom: t('nav.classroom') })}</button></form>` : ''}<a class="btn" href="/teach">🍎 ${t('nav.classroom')}</a></div>`;
  page(req, res, { title: t('teach.loop.page.title'), active: 'classes', body, head: LOOP_CSS, back: '/teach', backLabel: t('nav.classroom') });
});

router.post('/api/teach/loop/hide', requireUser, (req, res) => { if (!staff(req, res)) return; TL.setHidden(req.user, true); res.json({ ok: true }); });
router.post('/api/teach/loop/show', requireUser, (req, res) => { if (!staff(req, res)) return; TL.setHidden(req.user, false); res.json({ ok: true }); });
