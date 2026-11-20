// Story Library: "What would you like to read today?" (services/library-suggest.js; docs/decisions.md "Story Library:
// book suggestions"). The box at the top of /library and its one API:
//   POST /api/library/suggest  { wish, grade?, class? } -> { ok, by, ids, none, refused, html, note }
// html is the library's own cards (routes/library.js bookCard) for the chosen books; note is our own wording ("Let's try
// different words", "We could not find..."). Nothing the model writes is shown. The wish is never stored or logged.
import { Router } from 'express';
import { html } from '../views/html.js';
import { VERSION } from '../views/layout.js';
import { rateLimit } from '../services/ratelimit.js';
import * as S from '../services/schools.js';
import * as LIB from '../services/library.js';
import * as SUG from '../services/library-suggest.js';
import { bookCard } from './library.js';

export const router = Router();
export const WISH_CSS = `<link rel="stylesheet" href="/css/library-suggest.css?v=${VERSION}">`;

/** The box (shown by public/js/library-suggest.js; without JavaScript it stays hidden) and where the books go. */
export function wishBox(t, grade = null, forClass = null) {
  return html`<form class="lb-wish" id="lb-wish" hidden data-grade="${grade || ''}" data-class="${forClass ? forClass.id : ''}"
      data-busy="${t('library.wish.busy')}" data-error="${t('library.wish.error')}">
    <label class="lb-wish-label" for="lb-wish-q"><span aria-hidden="true">✨</span> ${t('library.wish.label')}</label>
    <div class="lb-wish-row">
      <input class="input" id="lb-wish-q" name="wish" type="text" maxlength="${SUG.WISH_MAX}" placeholder="${t('library.wish.placeholder')}" autocomplete="off" spellcheck="true" enterkeyhint="search">
      <button class="btn btn-primary" id="lb-wish-go" type="submit">${t('library.wish.go')}</button>
    </div>
  </form>
  <section class="lb-wish-out" id="lb-wish-out" hidden aria-labelledby="lb-wish-h" tabindex="-1">
    <div class="lb-wish-head"><h2 id="lb-wish-h"><span aria-hidden="true">🎁</span> ${t('library.wish.heading')}</h2>
      <button class="btn btn-sm" id="lb-wish-back" type="button">${t('library.wish.back')}</button></div>
    <p class="lb-wish-note" id="lb-wish-note" role="status"></p>
    <ul class="lb-grid" id="lb-wish-grid"></ul>
  </section>`;
}

const isStaff = u => !!u && !u.is_guest && S.isSchoolStaff(u);
/** The reader's grade: the grade chip they are on, else a signed-in student's grade from their school. */
function readerGrade(req, body) {
  const g = LIB.gradeParam(body.grade);
  if (g) return g;
  const u = req.user; if (!u || u.is_guest) return null;
  const m = S.schoolsOf(u.id).find(x => x.role === 'student' && x.grade);
  return m ? SUG.gradeOfText(m.grade) : null;
}

router.post('/api/library/suggest', rateLimit('library-suggest', 40, 60e3), async (req, res) => {
  const t = req.t, u = req.user, body = req.body || {};
  if (typeof body.wish !== 'string') return res.status(400).json({ error: t('errors.api.badRequest') });
  const r = await SUG.suggest(body.wish, { grade: readerGrade(req, body) });
  if (!r.ok && r.code === 'empty') return res.status(400).json({ error: t('library.wish.empty'), code: 'empty' });
  if (!r.ok) return res.json({ ok: true, refused: true, ids: [], html: '', note: t('library.wish.tryOther') });
  const staff = isStaff(u);
  const forClass = staff && body.class ? LIB.assignClasses(u).find(c => c.id === String(body.class)) || null : null;
  const books = r.ids.map(id => LIB.getBook(id)).filter(Boolean);
  const reads = new Map(books.map(bk => [bk.id, u ? LIB.readOf(u.id, bk.id) : null]));
  const cards = books.map(bk => bookCard(t, bk, { read: reads.get(bk.id), staff, forClass }));
  res.json({ ok: true, by: r.by, ids: books.map(bk => bk.id), none: r.none, refused: false,
    html: String(html`${cards}`), note: r.none ? t('library.wish.none') : t('library.wish.found', { count: books.length }) });
});
