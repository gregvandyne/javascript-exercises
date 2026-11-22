// The School page's "Oomba, the teaching companion" section (Settings tab; routes/schools.js schoolSettings), a form of
// its own posting to /api/schools/:id/companion (routes/companion.js, services/companion-settings.js): on or off for
// the school's staff, web search on or off, and the numbers within their bounds.
import { html } from './html.js';
import { ico } from './icon.js';
import { config } from '../config.js';
import * as CS from '../services/companion-settings.js';

const selected = v => (v ? 'selected' : '');
export function companionSettings(req, s) {
  if (!config.companion) return '';
  const t = req.t, st = CS.read(s);
  const yn = (name, val) => html`<select class="input" id="oc-set-${name}" name="${name}"><option value="1" ${selected(val)}>${t('school.settings.yes')}</option><option value="0" ${selected(!val)}>${t('school.settings.no')}</option></select>`;
  const num = k => { const [min, max] = CS.BOUNDS[k]; return html`<div class="field"><label for="oc-set-${k}">${t(`companion.settings.${k}`)}</label><input class="input input-num" id="oc-set-${k}" name="${k}" type="number" inputmode="numeric" min="${min}" max="${max}" step="1" value="${st[k]}" required aria-describedby="oc-set-${k}-hint"><span class="hint" id="oc-set-${k}-hint">${t(`companion.settings.${k}Hint`, { min, max, def: CS.BOUNDS[k][2] })}</span></div>`; };
  return html`<section class="panel" id="companion-settings" aria-labelledby="oc-set-h"><form class="stack settingsform" data-api="/api/schools/${s.id}/companion" data-reload data-toast="${t('school.settings.saved')}" novalidate>
    <h3 class="setgroup-h" id="oc-set-h">${ico('💬', { size: 22 })} ${t('companion.settings.title')}</h3>
    <p class="small muted">${t('companion.settings.text')}</p>
    <div class="field"><label for="oc-set-on">${t('companion.settings.on')}</label>${yn('on', st.on)}<span class="hint">${t('companion.settings.onHint')}</span></div>
    <div class="field"><label for="oc-set-web">${t('companion.settings.web')}</label>${yn('web', st.web)}<span class="hint">${t('companion.settings.webHint')}</span></div>
    ${CS.NUMBERS.map(num)}
    <div class="savebar"><button class="btn btn-primary" type="submit">${t('school.save')}</button></div>
  </form></section>`;
}
