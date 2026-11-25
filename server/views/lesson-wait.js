// A class lesson that is assigned to the student but waits (services/lessons.js lessonWait; Homeroom: an In order
// handout before the ones ahead of it on their desk are done): a calm page in place of the lesson or the game, saying
// what to do and the way back. Used by the lesson page (routes/progress.js) and the play page (routes/games.js).
import { html } from './html.js';
import { ico } from './icon.js';
import { page } from './layout.js';

export function lessonWaitPage(req, res, w) {
  page(req, res, {
    title: w.title, active: 'classes',
    body: html`<section class="panel lesson-wait" aria-labelledby="lw-h"><p class="lesson-wait-ico" aria-hidden="true">${ico('🔒', { size: 44 })}</p>
      <h1 id="lw-h">${w.title}</h1><p class="lead">${w.text}</p>
      <p><a class="btn btn-primary btn-big" href="${w.backHref}">${ico('🎒', { size: 20 })} ${w.backLabel}</a></p></section>`,
  });
}
