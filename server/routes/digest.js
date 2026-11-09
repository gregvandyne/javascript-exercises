// The weekly class summary (services/digest.js; docs/decisions.md "Weekly class summary email").
//   GET  /teach/summary          "See this week's summary": the same counts as the email, per class, plus what only
//                                 the site may show (who hasn't started, the lessons due, the answers to review)
//   GET  /teach/summary/email    the email as it would go to this teacher this week (?format=text: the text part)
//   POST /api/me/digest          the teacher's own choice: on/off, day, hour, time zone ('' = the school's)
// School staff only (S.isSchoolStaff): everyone else gets 404. Only classes the teacher teaches are shown.
import { Router } from 'express';
import { html, raw } from '../views/html.js';
import { page, notFound, VERSION } from '../views/layout.js';
import { emptyState } from '../views/components.js';
import { requireUser } from '../auth.js';
import { rateLimit } from '../services/ratelimit.js';
import * as S from '../services/schools.js';
import * as E from '../services/email.js';
import * as D from '../services/digest.js';
import { renderDigest } from '../services/digest-email.js';
import { googleEnabled } from '../oidc.js';
import { sameOrigin } from '../i18n/index.js';

export const router = Router();
/** The "no address" line: it says to connect Google only where Google sign-in is set up. */
const noAddressText = (req, where) => (googleEnabled() ? req.t(`digest.${where}.noAddress`) : req.t('digest.page.noAddressPlain'));
/** The email goes in the account's language, else the one the teacher reads the site in (remembered here; a cross-site
 *  link's ?lang= is not), so the preview and the real email match. */
const noteLang = req => { if (!req.user.lang && sameOrigin(req)) D.rememberLang(req.user.id, req.locale); };
const CSS = raw(`<link rel="stylesheet" href="/css/schools.css?v=${VERSION}"><link rel="stylesheet" href="/css/digest.css?v=${VERSION}">`);
const staffOnly = (req, res, next) => {
  if (S.isSchoolStaff(req.user)) return next();
  return req.path.startsWith('/api/') ? res.status(404).json({ error: req.t('school.errors.notFound') }) : notFound(req, res, req.t('school.errors.notTeacher'));
};

/** Weekday names and hours in the reader's language. */
const dayName = (intl, d) => new Date(Date.UTC(2024, 0, 7 + d)).toLocaleDateString(intl, { weekday: 'long', timeZone: 'UTC' });
const hourName = (intl, h) => new Date(Date.UTC(2024, 0, 1, h)).toLocaleTimeString(intl, { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' });
const zoneLabel = tz => tz.replace(/_/g, ' ');
/** "Monday at 7:00 AM (America/New York)" */
export function whenText(req, p) {
  const intl = req.fmt.intl;
  return req.t('digest.when', { day: dayName(intl, p.day), time: hourName(intl, p.hour), zone: zoneLabel(p.zone) });
}

/** The Me page's panel (school staff only): the switch and the schedule. */
export function digestPanel(req) {
  const t = req.t, u = req.user;
  if (!u || u.is_guest || !S.isSchoolStaff(u)) return '';
  const p = D.prefsOf(u.id), intl = req.fmt.intl;
  const school = D.schoolZone(u.id);
  const sel = on => (on ? raw('selected') : '');
  const address = E.addressOf(u.id);
  return html`<section class="panel" id="digest" aria-labelledby="digest-h"><h2 id="digest-h"><span aria-hidden="true">📬</span> ${t('digest.me.heading')}</h2>
    <p class="muted">${t('digest.me.text')}</p>
    ${address ? '' : html`<p class="notice warn small" id="digest-noaddr">${noAddressText(req, 'me')}</p>`}
    <form class="dg-form" data-api="/api/me/digest" data-reload data-toast="${t('digest.me.saved')}" novalidate>
      <input type="hidden" name="on" value="0">
      <label class="dg-on"><input type="checkbox" name="on" value="1" id="digest-on" ${p.on ? raw('checked') : ''}> ${t('digest.me.on')}</label>
      <div class="dg-when">
        <div class="field"><label for="digest-day">${t('digest.me.day')}</label>
          <select class="input" id="digest-day" name="day">${[1, 2, 3, 4, 5, 6, 0].map(d => html`<option value="${d}" ${sel(d === p.day)}>${dayName(intl, d)}</option>`)}</select></div>
        <div class="field"><label for="digest-hour">${t('digest.me.hour')}</label>
          <select class="input" id="digest-hour" name="hour">${Array.from({ length: 24 }, (_, h) => html`<option value="${h}" ${sel(h === p.hour)}>${hourName(intl, h)}</option>`)}</select></div>
        <div class="field dg-zone"><label for="digest-tz">${t('digest.me.zone')}</label>
          <select class="input" id="digest-tz" name="tz"><option value="" ${sel(!p.tz)}>${school ? t('digest.me.zoneSchool', { zone: zoneLabel(school) }) : t('digest.me.zoneDefault', { zone: zoneLabel(D.FALLBACK_TZ) })}</option>
            ${S.ZONES.filter(z => z.includes('/')).map(z => html`<option value="${z}" ${sel(z === p.tz)}>${zoneLabel(z)}</option>`)}</select></div>
      </div>
      <p class="err form-err" aria-live="polite"></p>
      <div class="row dg-acts"><button class="btn btn-primary" type="submit">${t('digest.me.save')}</button><a class="btn" href="/teach/summary">📬 ${t('digest.page.link')}</a></div>
    </form>
  </section>`;
}

router.post('/api/me/digest', requireUser, staffOnly, rateLimit('me-digest', 30, 60e3), (req, res) => {
  const b = req.body || {};
  const on = b.on === undefined ? undefined : [].concat(b.on).map(String).includes('1') || b.on === true;
  const r = D.savePrefs(req.user.id, { on, day: b.day, hour: b.hour, tz: b.tz, lang: req.user.lang ? undefined : req.locale });
  if (!r.ok) return res.status(400).json({ error: req.t(`digest.errors.${r.code}`) });
  res.json({ ok: true, prefs: D.prefsOf(req.user.id) });
});

function stat(req, key, value, href = '') {
  const inner = html`<span class="dg-v">${value}</span><span class="dg-l">${req.t(`digest.page.${key}`)}</span>`;
  return html`<li class="dg-stat${href ? ' dg-go' : ''}">${href ? html`<a href="${href}">${inner}</a>` : inner}</li>`;
}
function classPanel(req, c) {
  const t = req.t, f = req.fmt;
  return html`<section class="panel dg-class" aria-labelledby="dg-${c.id}">
    <div class="dg-head"><h2 id="dg-${c.id}"><a href="/class/${c.id}">${c.name}</a></h2><span class="small muted">${[c.school, t('school.class.studentsN', { count: c.students })].filter(Boolean).join(' · ')}</span></div>
    <ul class="plain dg-stats">
      ${stat(req, 'statDue', f.int(c.due))}
      ${stat(req, 'statDone', c.pct == null ? '–' : `${f.int(c.pct)}%`, `/class/${c.id}/progress`)}
      ${stat(req, 'statToRead', f.int(c.toRead), c.toRead ? `/class/${c.id}/progress#to-review` : '')}
      ${stat(req, 'statNotStarted', f.int(c.notStarted))}
      ${stat(req, 'statLive', f.int(c.live))}
    </ul>
    ${c.dueLessons.length ? html`<h3 class="dg-sub">📚 ${t('digest.page.dueHeading')}</h3><ul class="plain dg-list">${c.dueLessons.map(l => html`<li><b dir="auto">${l.title}</b>
      <span class="small muted">${t('lessons.class.dueOn', { date: f.day(l.due_at) })} · ${t('digest.page.finished', { done: l.finished, count: c.students })}</span></li>`)}</ul>` : ''}
    ${c.toReadLessons.length ? html`<h3 class="dg-sub">✍️ ${t('digest.page.toReadHeading')}</h3><ul class="plain dg-list">${c.toReadLessons.map(l => html`<li><a href="/class/${c.id}/progress/${l.cl}#answers"><b dir="auto">${l.title}</b></a>
      <span class="small muted">${t('progress.teach.toRead', { count: l.n })}</span></li>`)}</ul>` : ''}
    ${c.notStartedNames.length ? html`<details class="dg-names"><summary>⏳ ${t('digest.page.notStartedHeading', { count: c.notStartedNames.length })}</summary>
      <ul class="plain dg-namelist">${c.notStartedNames.map(n => html`<li><bdi>${n}</bdi></li>`)}</ul></details>` : ''}
    <div class="row dg-acts"><a class="btn btn-sm" href="/class/${c.id}">${t('teach.home.openClass')}</a><a class="btn btn-sm" href="/class/${c.id}/progress">📊 ${t('school.classTabs.progress')}</a></div>
  </section>`;
}

router.get('/teach/summary', requireUser, staffOnly, (req, res) => {
  const t = req.t, u = req.user;
  noteLang(req);
  const sum = D.summaryFor(u, Date.now(), { names: true });
  const p = sum.prefs;
  const address = E.addressOf(u.id);
  const sending = p.on && address;
  const body = html`
  <div class="pagehead"><div><h1>📬 ${t('digest.page.title')}</h1><p class="muted">${t('digest.page.sub')}</p></div></div>
  <section class="panel dg-sched" id="dg-sched">
    <p>${sending ? t('digest.page.next', { when: whenText(req, p) }) : !p.on ? t('digest.page.off') : noAddressText(req, 'page')}</p>
    <p class="small muted">${t('digest.page.privacy')}</p>
    <div class="row dg-acts">${sum.active.length ? html`<a class="btn" href="/teach/summary/email" id="dg-email">📧 ${t('digest.page.seeEmail')}</a>` : ''}<a class="btn" href="/me#digest">⚙️ ${t('digest.page.change')}</a></div>
  </section>
  ${!sum.classes.length ? emptyState({ emoji: '🍎', title: t('digest.page.noClasses'), text: t('digest.page.noClassesText'), action: { href: '/teach', label: t('nav.classroom') } })
    : !sum.active.length ? emptyState({ emoji: '🌤️', title: t('digest.page.quietAll'), text: t('digest.page.quietAllText') }) : ''}
  ${sum.active.map(c => classPanel(req, c))}
  ${sum.active.length && sum.quiet.length ? html`<section class="panel dg-quiet" aria-labelledby="dg-quiet-h"><h2 id="dg-quiet-h">🌤️ ${t('digest.page.quietHeading')}</h2>
    <p class="small muted">${t('digest.page.quietText')}</p>
    <ul class="plain dg-list">${sum.quiet.map(c => html`<li><a href="/class/${c.id}"><b>${c.name}</b></a> <span class="small muted">${c.school}</span></li>`)}</ul></section>` : ''}`;
  page(req, res, { title: t('digest.page.title'), active: 'classes', body, head: CSS, back: '/teach', backLabel: t('nav.classroom') });
});

router.get('/teach/summary/email', requireUser, staffOnly, (req, res) => {
  const u = req.user;
  noteLang(req);
  const sum = D.summaryFor(u, Date.now());
  const m = renderDigest(u, sum, D.slotFor(sum.prefs), { locale: D.mailLocale(u) });
  res.set({ 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' });
  if (req.query.format === 'text') return res.type('text/plain; charset=utf-8').send(`Subject: ${m.subject}\n\n${m.text}`);
  res.type('html').send(m.html);
});
