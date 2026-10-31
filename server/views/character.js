// The "My Oomba character" panel on the Me page: the editor for the player's own character (services/character.js).
// Real radio buttons in fieldsets (keyboard, screen readers and phones get the platform's own behaviour); the preview is
// drawn by kit 1.1.0 inside a hidden same-origin frame (public/js/character.js), so the kit's styles and listeners never
// touch the site's page. Guests see the mascot they play as and a sign-up link: only accounts can save a character.
import { html, raw, jsonData } from './html.js';
import { CHARACTER, DEFAULT_CHARACTER, characterOf } from '../services/character.js';
import { PALETTE, SKIN, HAIR } from '../../kit/src/tokens.js';
import { kitSrc, kitPackSrc, KIT_VERSIONS, KIT_PACKS, KIT_LATEST } from '../services/kit.js';

const radio = (name, value, checked, label, extra = '') => html`<label class="chchip${extra ? ' ' + extra : ''}"><input type="radio" name="${name}" value="${value}" ${checked ? raw('checked') : ''}><span>${label}</span></label>`;
const swatch = (name, value, checked, label, hex) => html`<label class="chsw" title="${label}"><input type="radio" name="${name}" value="${value}" ${checked ? raw('checked') : ''}><span class="chsw-dot" style="--sw:${hex}" aria-hidden="true"></span><span class="sr-only">${label}</span></label>`;
const group = (id, legend, body, cls = '') => html`<fieldset class="chgroup${cls ? ' ' + cls : ''}" data-group="${id}"><legend>${legend}</legend><div class="chopts">${body}</div></fieldset>`;

export function characterPanel(req) {
  const t = req.t, u = req.user, guest = !!u.is_guest;
  const saved = characterOf(u), c = saved || DEFAULT_CHARACTER;
  const n = (k, v) => t(`me.character.names.${k}.${v}`);
  const hue = h => PALETTE[h][2];
  const b = c.bold || {}, bw = b.wear || [];
  const boldHat = bw.find(w => CHARACTER.boldHat.includes(w)) || '', boldTop = bw.find(w => CHARACTER.boldTop.includes(w)) || '';
  const kid = c.species === 'kid';
  const groups = [
    group('species', t('me.character.kind'), CHARACTER.species.map(s => radio('species', s, c.species === s, n('species', s)))),
    group('body', t('me.character.body'), CHARACTER.body.map(s => radio('body', s, c.body === s, n('body', s)))),
    group('skin', t('me.character.skin'), SKIN.map((hex, i) => swatch('skin', String(i), (c.skin ?? 2) === i, t('me.character.skinLabel', { n: i + 1 }), hex)), 'kidonly'),
    group('hair', t('me.character.hair'), CHARACTER.hair.map(s => radio('hair', s, (c.hair || {}).style === s, n('hair', s))), 'kidonly'),
    group('hairColor', t('me.character.hairColor'), CHARACTER.hairColor.map(s => swatch('hairColor', s, ((c.hair || {}).color || 'cocoa') === s, n('hairColor', s), HAIR[s])), 'kidonly'),
    group('mood', t('me.character.eyes'), CHARACTER.eyes.map(s => radio('mood', s, (c.mood || 'happy') === s, n('eyes', s))), 'playonly'),
    group('top', t('me.character.top'), CHARACTER.top.map(s => radio('top', s, (c.outfit || {}).top === s, n('top', s))), 'kidonly'),
    group('topColor', t('me.character.topColor'), CHARACTER.color.map(s => swatch('topColor', s, ((c.outfit || {}).color || 'sky') === s, n('color', s), hue(s))), 'kidonly'),
    group('base', t('me.character.color'), CHARACTER.color.map(s => swatch('base', s, (c.colors || {}).base === s, n('color', s), hue(s))), 'animalonly'),
    group('accent', t('me.character.accent'), CHARACTER.color.map(s => swatch('accent', s, ((c.colors || {}).accent || 'coral') === s, n('color', s), hue(s)))),
    group('wear', t('me.character.accessory'), [radio('wear', '', !(c.wear || []).length, t('me.character.none')), ...CHARACTER.accessory.map(s => radio('wear', s, (c.wear || [])[0] === s, n('wear', s)))]),
    group('boldHat', t('me.character.boldHat'), [radio('boldHat', '', !boldHat, t('me.character.none')), ...CHARACTER.boldHat.map(s => radio('boldHat', s, boldHat === s, n('boldHat', s)))], 'boldonly'),
    group('boldTop', t('me.character.boldTop'), [radio('boldTop', '', !boldTop, t('me.character.none')), ...CHARACTER.boldTop.map(s => radio('boldTop', s, boldTop === s, n('boldTop', s)))], 'boldonly'),
    group('boldMood', t('me.character.boldEyes'), CHARACTER.eyes.map(s => radio('boldMood', s, (b.mood || 'determined') === s, n('eyes', s))), 'boldonly'),
  ];
  // The kit (and the Bold pack, for the Bold preview) with their pinned hashes: the editor loads them into its frame.
  const kit = { src: kitSrc(KIT_LATEST), sri: KIT_VERSIONS[KIT_LATEST], bold: kitPackSrc('style-bold', KIT_LATEST), boldSri: KIT_PACKS[KIT_LATEST]['style-bold'] };
  return html`<section class="panel charpanel" id="character" aria-labelledby="ch-h">
    <h2 id="ch-h"><span aria-hidden="true">🎨</span> ${t('me.character.heading')}</h2>
    <p class="muted">${guest ? t('me.character.guestText') : t('me.character.text')}</p>
    <form class="chform${kid ? '' : ' notkid'}" id="charform" data-guest="${guest ? '1' : ''}" data-saved="${saved ? '1' : ''}" novalidate>
      <div class="chstage">
        <div class="chprev" id="ch-prev" role="img" aria-label="${t('me.character.previewLabel')}"><canvas id="ch-canvas" width="220" height="275" aria-hidden="true"></canvas></div>
        <div class="seg chstyle" role="group" aria-label="${t('me.character.styleGroup')}">
          <button type="button" data-chstyle="playful" aria-pressed="true">${t('me.character.playful')}</button><button type="button" data-chstyle="bold" aria-pressed="false">${t('me.character.bold')}</button>
        </div>
        <p class="muted small chboldnote" id="ch-boldnote" hidden>${t('me.character.boldNote')}</p>
      </div>
      ${guest ? html`<p class="row"><a class="btn btn-primary" href="/signup?next=/me%23character">${t('me.character.signup')}</a></p>` : html`<div class="chgroups">${groups}</div>
      <div class="row chactions">
        <button class="btn btn-primary" type="submit" id="ch-save">${t('me.character.save')}</button>
        <button class="btn" type="button" id="ch-reset">${t('me.character.reset')}</button>
        <span class="muted small" id="ch-status" role="status" aria-live="polite">${saved ? '' : t('me.character.notSaved')}</span>
      </div>`}
    </form>
    ${jsonData('char-data', { kit, character: guest ? null : c, guest, defaults: DEFAULT_CHARACTER, lists: { boldHat: CHARACTER.boldHat, boldTop: CHARACTER.boldTop } })}
  </section>`;
}
