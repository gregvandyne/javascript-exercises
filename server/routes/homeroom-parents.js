// Homeroom: the parents' view (services/homeroom-parents.js; docs/decisions.md "Homeroom: the parents' view").
//   GET /family/class/:token[?class=<id>]   a grown-up's page for one linked child (the /family page's token, never the
//                                           child's id): each class with Homeroom and the parents' view on, read only
// Behind families (F.familiesOn, as every family page) and HOMEROOM. Signed out: the sign-in. Anyone but the grown-up
// whose family has the child linked (a student, a teacher, another family, a pending request, a class that is not the
// child's, has no Homeroom or has the view off): the site's 404. The grown-up fence lets this one address through
// (routes/family.js GROWNUP_GET). The teacher's switch is POST /api/homeroom/:id/parents (routes/homeroom.js).
import { Router } from 'express';
import { html, raw } from '../views/html.js';
import { ico } from '../views/icon.js';
import { page, notFound, VERSION } from '../views/layout.js';
import { rateLimit } from '../services/ratelimit.js';
import { isGrownup } from '../auth.js';
import * as F from '../services/family.js';
import * as PV from '../services/homeroom-parents.js';
import { cleanHtml } from '../services/notebook.js';

export const router = Router();

const PAD_W = 900, PAD_H = 600;
const COLOR = /^#[0-9A-Fa-f]{6}$/;
/** A K-2 drawing (strokes as fractions of a 900 x 600 page, cleaned when saved) as a read-only picture. */
function drawingSvg(strokes, label) {
  const lines = strokes.map(s => {
    const pts = (Array.isArray(s && s.pts) ? s.pts : []).map(p => `${Math.round(Math.min(1, Math.max(0, +p.x || 0)) * PAD_W * 10) / 10},${Math.round(Math.min(1, Math.max(0, +p.y || 0)) * PAD_H * 10) / 10}`);
    return pts.length < 2 ? '' : html`<polyline fill="none" stroke="${COLOR.test(s.c) ? s.c : '#141414'}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" points="${pts.join(' ')}"/>`;
  });
  return html`<svg class="pv-pic" viewBox="0 0 ${PAD_W} ${PAD_H}" role="img" aria-label="${label}"><rect class="pv-paper" x="1" y="1" width="${PAD_W - 2}" height="${PAD_H - 2}" rx="14"/>${lines}</svg>`;
}

const STEP_ICON = { choose: '📚', read: '📖', quiz: '🧩', notes: '📝', done: '✅' };
function handoutCard(req, x) {
  const t = req.t, f = req.fmt;
  const meta = [x.given ? t('homeroom.parents.given', { date: f.date(x.given, { month: 'short', day: 'numeric' }) }) : '', x.due ? t('homeroom.parents.due', { date: f.day(x.due, { month: 'short', day: 'numeric' }) }) : ''].filter(Boolean).join(' · ');
  const grade = x.grade === 'none' ? t('homeroom.parents.grade.none')
    : x.grade === 'score' ? (!x.done ? t('homeroom.parents.grade.scoreLater') : x.pct !== undefined ? t('homeroom.parents.grade.score') : t('homeroom.parents.grade.scoreNone'))
      : t('homeroom.parents.grade.completion');
  return html`<li class="pv-card${x.done ? ' is-done' : ''}" data-pv="${x.id}">
    <div class="pv-head"><span class="pv-ico" aria-hidden="true">${ico(x.icon || '🎮', { size: 26 })}</span>
      <div class="pv-main"><b class="pv-title" dir="auto">${x.title}</b>${meta ? html`<div class="pv-meta">${meta}</div>` : ''}</div>
      <span class="pv-state ${x.done ? 'done' : 'todo'}">${x.done ? html`${ico('✓', { size: 16 })} ${t('homeroom.parents.done')}` : t('homeroom.parents.notYet')}</span></div>
    ${x.missed ? html`<p class="pv-missed">${ico('🗓️', { size: 16 })} ${t('homeroom.parents.missed')}</p>` : ''}
    ${x.instructions ? html`<div class="pv-instr"><span class="pv-lbl">${t('homeroom.parents.instructions')}</span><p dir="auto">${x.instructions}</p></div>` : ''}
    ${x.reading && x.reading.book ? html`<p class="pv-line">${ico('📖', { size: 16 })} <span dir="auto">${x.reading.book.title}</span>${x.reading.total ? html` · ${t('homeroom.parents.quiz', { right: x.reading.right, total: x.reading.total })}` : ''}</p>` : ''}
    <p class="pv-grade">${grade}${x.grade === 'score' && x.done && x.pct !== undefined ? html` <b class="pv-pct">${t('homeroom.parents.pct', { pct: x.pct })}</b>` : ''}</p>
    ${x.fb && (x.fb.comment || x.fb.src) ? html`<div class="pv-fb">${x.fb.src ? html`<img class="pv-sticker" src="${x.fb.src}" alt="${t(`homeroom.stickers.${x.fb.sticker}`)}" width="56" height="56" loading="lazy">` : ''}
      <div class="pv-fbtext"><span class="pv-lbl">${t('homeroom.parents.fromTeacher')}</span>${x.fb.comment ? html`<p dir="auto">${x.fb.comment}</p>` : html`<p>${t('homeroom.parents.stickerOnly')}</p>`}</div></div>` : ''}
  </li>`;
}

router.get('/family/class/:token', rateLimit('homeroom-parents', 600, 3600e3), (req, res) => {
  if (!F.familiesOn(req)) return notFound(req, res);
  if (!req.user || req.user.is_guest) return res.redirect(`/login?next=${encodeURIComponent(req.originalUrl)}`);
  if (!isGrownup(req.user)) return notFound(req, res);
  const r = PV.viewFor(req.user, req.params.token, typeof req.query.class === 'string' ? req.query.class : '');
  if (!r.ok) return notFound(req, res);
  res.set({ 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' });
  const t = req.t, f = req.fmt, name = r.child.name, c = r.cls, self = `/family/class/${encodeURIComponent(req.params.token)}`;
  const chips = r.classes.length > 1 ? html`<nav class="pv-classes" aria-label="${t('homeroom.parents.classes')}">${r.classes.map(x => html`<a class="pv-chip${c && x.id === c.id ? ' on' : ''}" href="${self}?class=${encodeURIComponent(x.id)}"${c && x.id === c.id ? raw(' aria-current="page"') : ''} dir="auto">${x.name}</a>`)}</nav>` : '';
  let main;
  if (!c) {
    main = html`<section class="panel pv-empty"><p>${ico('🏫', { size: 28 })} ${t('homeroom.parents.none', { name })}</p></section>`;
  } else {
    const missed = c.handouts.filter(x => x.missed && !x.done), rest = c.handouts.filter(x => !(x.missed && !x.done));
    const sec = (id, icon, title, n, inner, empty) => html`<section class="pv-sec" id="${id}" aria-labelledby="${id}-h"><h2 id="${id}-h">${ico(icon, { size: 24 })} ${title} <span class="pv-n">${n}</span></h2>${n ? inner : html`<p class="muted pv-none">${empty}</p>`}</section>`;
    main = html`<h2 class="pv-class" dir="auto">${ico('🏫', { size: 26 })} ${c.name}</h2>
    <nav class="pv-jump" aria-label="${t('homeroom.parents.jump')}"><a href="#pv-handouts">${t('homeroom.parents.handouts')}</a><a href="#pv-reading">${t('homeroom.parents.reading')}</a><a href="#pv-notes">${t('homeroom.parents.notes')}</a></nav>
    ${missed.length ? html`<section class="pv-sec pv-catch" id="pv-catch" aria-labelledby="pv-catch-h"><h2 id="pv-catch-h">${ico('🗓️', { size: 24 })} ${t('homeroom.parents.catchUp')} <span class="pv-n">${missed.length}</span></h2>
      <p class="muted pv-sub">${t('homeroom.parents.catchUpLead', { name })}</p><ul class="pv-cards">${missed.map(x => handoutCard(req, x))}</ul></section>` : ''}
    ${sec('pv-handouts', '🎒', t('homeroom.parents.handouts'), rest.length, html`<ul class="pv-cards">${rest.map(x => handoutCard(req, x))}</ul>`, t('homeroom.parents.noHandouts'))}
    ${sec('pv-reading', '📚', t('homeroom.parents.reading'), c.reading.length, html`<ul class="pv-books">${c.reading.map(b => html`<li class="pv-book">
        ${b.book.cover ? html`<img class="pv-cover" src="${b.book.cover}" alt="" width="64" height="64" loading="lazy">` : html`<span class="pv-cover pv-nocover" aria-hidden="true">${ico('📖', { size: 28 })}</span>`}
        <div class="pv-main"><b dir="auto">${b.book.title}</b>
          <div class="pv-meta">${ico(STEP_ICON[b.step] || '📖', { size: 16 })} ${t(`homeroom.parents.step.${b.step}`)}${b.total ? html` · ${t('homeroom.parents.quiz', { right: b.right, total: b.total })}` : ''}</div></div></li>`)}</ul>`, t('homeroom.parents.noReading'))}
    ${sec('pv-notes', '📝', t('homeroom.parents.notes'), c.notes.length, html`<p class="muted pv-sub">${t('homeroom.parents.notesLead', { name })}</p><div class="pv-pages">${c.notes.map(p => html`<article class="pv-page">
        <h3 dir="auto">${p.title || t('homeroom.parents.classNotes')}</h3><div class="pv-meta">${t('homeroom.parents.updated', { date: f.date(p.at, { month: 'short', day: 'numeric' }) })}</div>
        ${p.drawing.length ? drawingSvg(p.drawing, t('homeroom.parents.drawing', { name })) : ''}
        ${p.body ? html`<div class="pv-paperText" dir="auto">${raw(cleanHtml(p.body))}</div>` : ''}</article>`)}</div>`, t('homeroom.parents.noNotes', { name }))}`;
  }
  const body = html`<div class="pv">
    <div class="pagehead"><h1>${ico('🏫', { size: 34 })} <span>${t('homeroom.parents.heading', { name })}</span></h1></div>
    <p class="muted pv-lead">${t('homeroom.parents.lead', { name })}</p>
    ${chips}${main}
    <p class="small muted pv-foot">${t('homeroom.parents.foot')}</p></div>`;
  page(req, res, { title: t('homeroom.parents.title', { name }), active: 'family', body, back: '/family', backLabel: t('homeroom.parents.back'),
    head: raw(`<link rel="stylesheet" href="/css/homeroom-parents.css?v=${VERSION}">`) });
});
