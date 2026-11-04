// The course card on the home page and the course page (/courses/<slug>). See server/services/courses.js.
import { html } from './html.js';
import { coverArt } from './components.js';
import { current } from '../i18n/index.js';

/** One numbered game inside a course: a small cover, its title and the course topic; "Started" once played. */
function step(g, started, t, courseSlug) {
  return html`<li class="course-step"><a href="/play/${g.slug}?course=${courseSlug}" class="course-game${started ? ' is-started' : ''}">
    <span class="course-n" aria-hidden="true">${g.step}</span>
    <span class="course-cover">${coverArt(g)}</span>
    <span class="course-gt"><span class="course-gname">${g.title}</span><span class="course-topic">${t(`courses.topics.${g.topic}`)}</span>
      ${started ? html`<span class="course-done">✓ ${t('courses.started')}</span>` : ''}</span>
  </a></li>`;
}

/** The home page's "Courses" row: each course as one wide card with its games nested inside, in order. */
export function courseRow(items) {
  const { t } = current();
  if (!items.some(it => it.games.length)) return '';
  return html`<section class="rail courses" aria-labelledby="courses-h">
    <div class="rail-head"><h2 id="courses-h">📚 ${t('courses.row')}</h2></div>
    ${items.filter(it => it.games.length).map(({ course: c, games, started }) => {
      const next = games.find(g => !started.has(g.id)) || games[0];
      return html`<article class="course-card" aria-labelledby="course-${c.slug}-h">
        <div class="course-head">
          <span class="course-emo" aria-hidden="true">${c.emoji}</span>
          <div class="course-ht"><h3 id="course-${c.slug}-h"><a href="/courses/${c.slug}">${t(`${c.key}.title`)}</a></h3><p>${t(`${c.key}.sub`)}</p></div>
        </div>
        <ol class="course-steps">${games.map(g => step(g, started.has(g.id), t, c.slug))}</ol>
        <div class="course-foot">
          <a class="btn btn-primary" href="/play/${next.slug}?course=${c.slug}">▶ ${started.size ? t('courses.continue') : t('courses.start')}</a>
          <a class="btn btn-ghost" href="/courses/${c.slug}">${t('courses.about')}</a>
          ${started.size ? html`<span class="muted course-prog">${t('courses.progress', { n: started.size, total: games.length })}</span>` : ''}
        </div>
      </article>`;
    })}
  </section>`;
}

/** The course page: what the course is, its games in order (bigger), and the way in for teachers. */
export function coursePage({ course: c, games, started }) {
  const { t } = current();
  return html`<section class="course-page">
    <a class="back small" href="/">← ${t('courses.home')}</a>
    <header class="course-hero">
      <span class="course-emo big" aria-hidden="true">${c.emoji}</span>
      <div><h1>${t(`${c.key}.title`)}</h1><p class="lead">${t(`${c.key}.sub`)}</p><p>${t(`${c.key}.about`)}</p></div>
    </header>
    <ol class="course-steps course-steps-big">${games.map(g => step(g, started.has(g.id), t, c.slug))}</ol>
    ${games.length ? html`<p class="muted small">${t('courses.progress', { n: started.size, total: games.length })}</p>` : ''}
    <aside class="course-teach"><h2>🍎 ${t('courses.teachers.h')}</h2><p>${t(`${c.key}.teachers`)}</p>
      <a class="btn btn-ghost" href="${c.teacherPath}">${t('courses.teachers.link')}</a></aside>
  </section>`;
}
