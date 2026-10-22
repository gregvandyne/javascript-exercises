// Ad provider interface (Money node). Contextual only: the one input that shapes the choice is the
// category of the page/game being shown. No user history, no behavioural targeting, no third-party
// scripts or pixels. Everything an ad links to is rendered by our own server as a plain <a>.
//
// Contract used by server/views/components.js (do not change):
//   pickAd({ placement: 'grid'|'game', category, user }) -> { id, title, text, icon, href } | null
//
// Provider interface (sync, so server-rendered pages never wait on a network):
//   { name, list({ placement, category }) -> Ad[], get(id) -> Ad|null }
//   Ad = { id, title, text, icon, href, categories: string[], placements: string[], needsAccount?: bool }
// The active provider comes from BRB_AD_PROVIDER ('house' default). If it returns nothing, we fall
// back to the house provider, so a Sponsored slot is never empty while house ads exist.
// Adapter point for a future kid-safe ad network: server/services/ads/kidsafe-network.js.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { kidsafeNetwork } from './ads/kidsafe-network.js';

const HOUSE_FILE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../ads/house.json');
export const PLACEMENTS = ['grid', 'game'];

function loadHouse(file = HOUSE_FILE) {
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  return (raw.ads || []).filter(a => a && a.id && a.title && a.href && String(a.href).startsWith('/') && !String(a.href).startsWith('//'))
    .map(a => ({ id: String(a.id), title: String(a.title), text: String(a.text || ''), icon: String(a.icon || '📣'), href: String(a.href),
      categories: Array.isArray(a.categories) ? a.categories : [], placements: Array.isArray(a.placements) && a.placements.length ? a.placements : PLACEMENTS, needsAccount: !!a.needsAccount }));
}

/** BRB Gaming's own promos. Works with zero ad partners. */
export function houseProvider(ads = loadHouse()) {
  const byId = new Map(ads.map(a => [a.id, a]));
  return {
    name: 'house',
    list: ({ placement } = {}) => ads.filter(a => !placement || a.placements.includes(placement)),
    get: id => byId.get(String(id)) || null,
  };
}

const PROVIDERS = { house: houseProvider(), 'kidsafe-network': kidsafeNetwork };
const house = PROVIDERS.house;
let active = PROVIDERS[process.env.BRB_AD_PROVIDER || 'house'] || house;
/** For tests / future admin switch. */
export function setProvider(p) { active = typeof p === 'string' ? (PROVIDERS[p] || house) : (p || house); }
export const provider = () => active;

/** Look an ad up by id in the active provider, then house. Used to validate impression beacons. */
export function getAd(id) { return (active.get && active.get(id)) || house.get(id) || null; }

const pub = a => ({ id: a.id, title: a.title, text: a.text, icon: a.icon, href: a.href });

/**
 * Choose one ad for a slot. Contextual: ads tagged with the page's category are preferred
 * (2 out of 3 picks when any exist), the rest of the time a general ad, so a page full of
 * grid slots shows some variety. Ads that need an account are skipped for guests.
 */
export function pickAd({ placement = 'grid', category = null, user = null, rand = Math.random } = {}) {
  const canAccount = !!(user && !user.is_guest);
  const choose = list => list.length ? list[Math.min(list.length - 1, Math.floor(rand() * list.length))] : null;
  for (const p of active === house ? [house] : [active, house]) {
    let pool = []; try { pool = p.list({ placement, category }) || []; } catch { pool = []; }
    pool = pool.filter(a => (!a.needsAccount || canAccount) && (!a.placements || a.placements.includes(placement)));
    if (!pool.length) continue;
    const contextual = category ? pool.filter(a => (a.categories || []).includes(category)) : [];
    const general = pool.filter(a => !(a.categories || []).length);
    let pick = null;
    if (contextual.length && (!general.length || rand() < 2 / 3)) pick = choose(contextual);
    else pick = choose(general.length ? general : pool);
    if (pick) return pub(pick);
  }
  return null;
}
