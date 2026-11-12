// Connections: the one chip in a class header (top right) for every outside app a teacher can connect, such as Google
// Classroom today and Canvas or others later. Each app registers itself once (registerIntegration) and the chip lists
// the ones available to this person, so a new app never needs room of its own in the header.
//
// The chip stays small: one app shows its icon, short name and a status dot ("🎓 Classroom ●"); two or more show
// only icons and dots ("🎓● 🖌️●"). Tapping it opens a menu with one row per app: its name, a status pill
// (Connected, Not connected, Connect again), what it is connected to, and its buttons (Connect, or Settings and
// Disconnect).
import { html } from './html.js';

const REG = [];

/** def: { id, icon, available(req, c) -> bool, status(req, c) -> { state: 'on'|'off'|'warn', name, short, body } }.
 *  body is the row's details and buttons (html). Registering the same id twice keeps the first. */
export function registerIntegration(def) {
  if (!REG.some(d => d.id === def.id)) REG.push(def);
}
export const _registered = () => REG.map(d => d.id);

const STATE_KEY = { on: 'integrations.on', off: 'integrations.off', warn: 'integrations.warn' };

/** The Connections chip and menu for a class page ('' when no app is available to this person). */
export function connectionsChip(req, c) {
  const t = req.t;
  const items = REG.filter(d => d.available(req, c)).map(d => ({ d, ...d.status(req, c) }));
  if (!items.length) return '';
  const one = items.length === 1;
  const label = items.map(i => `${i.name}: ${t(STATE_KEY[i.state])}`).join(', ');
  return html`<details class="cx-menu"><summary class="cx-chip" aria-label="${t('integrations.title')}. ${label}">${items.map(i => html`<span class="cx-item cx-${i.state}" aria-hidden="true"><span>${i.d.icon}</span>${one ? html`<span class="cx-name">${i.short}</span>` : ''}<span class="cx-dot"></span></span>`)}</summary>
    <div class="cx-pop"><p class="cx-title">${t('integrations.title')}</p>
      <ul class="cx-list">${items.map(i => html`<li class="cx-row" id="cx-${i.d.id}">
        <div class="cx-rowhead"><span aria-hidden="true">${i.d.icon}</span><b>${i.name}</b><span class="cx-pill cx-pill-${i.state}">${t(STATE_KEY[i.state])}</span></div>
        ${i.body}</li>`)}</ul></div></details>`;
}
