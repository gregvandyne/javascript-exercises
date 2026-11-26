// Atlas Quest Live (built-in mode 'atlas', docs/decisions.md "Would You Rather and Atlas Quest go live"): class challenge
// rounds where every player taps a country on their own world map. The countries, capitals, flags and "famous for"
// facts are Atlas Quest's (window.AtlasData in seed-games/atlas-quest.html, and its reviewed language packs in
// public/vendor/data/atlas-quest/<version>/<lang>.js), read once on first use.
// A question is a normal quiz question whose choices are every country's code in one fixed order (CODES), so the
// answer is the index of the right one, the page and the server check it like any answer, and the reveal's counts say
// how many players tapped each country. Points: the right country 500-1000 by speed (plus the streak), as in every
// quiz; a near miss scores a little (closePoints): never a right answer, never a streak.
// Starter id: 'atlas:<region>:<level>:<kinds joined by +>:<count>:<secs>'.
// The regions 'us' and 'ca' are Atlas Quest's maps of the US states (and DC) and of Canada's provinces and territories
// (window.AtlasPlaces, docs/decisions.md "Atlas Quest: US states and Canada"): there a question's choices are that map's
// places in their one order (placeCodes), a player taps a state on the map of states, and the level makes no difference
// (every state is on the map). A capital question asks for the state or province whose capital it is; flag and famous
// questions have nothing to ask about a state, so they become find questions.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { tFor } from '../i18n/index.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const REGIONS = ['world', 'af', 'as', 'eu', 'na', 'sa', 'oc', 'us', 'ca'];
/** The maps of states and provinces among the regions. */
export const SUB_MAPS = ['us', 'ca'];
export const LEVELS = ['easy', 'medium', 'hard'];
export const KINDS = ['find', 'capital', 'flag', 'famous'];
export const COUNTS = [5, 8, 10, 15, 20];
export const SECS = [10, 15, 20, 30];
/** Capitals never asked about (as in Atlas Quest's NO_CAP_Q): disputed (Israel, Palestine), held apart from the
 *  government (Yemen) or not official at all (Nauru); and the District of Columbia, which has none of its own (it is the
 *  nation's capital). The teacher's quizzes use it too (game-sets.js). */
export const NO_CAP_Q = new Set(['IL', 'PS', 'YE', 'NR', 'US-DC']);

let DATA = null;
/** Atlas Quest's data: { C: [[cc, en, capEn, capLat, capLng, pop, langs, famEn, factEn, reg, area(k km2), borders,
 *  landlocked, labLat, labLng]], EASY, FAR (borders through an overseas part, both ways: 'FR-BR'), P: the states and
 *  provinces ([code, en, capEn, postal, region, labX, labY, capX, capY, capLat, capLng, nickname, largest, inset]),
 *  MAPS: their maps ({ us: { unit (km), frame, small, insets } }), packVer }. Shapes and flags stay in the game. */
export function data() {
  if (DATA) return DATA;
  const html = fs.readFileSync(path.join(ROOT, 'seed-games/atlas-quest.html'), 'utf8');
  const line = html.split('\n').find(l => l.startsWith('window.AtlasData = '));
  const d = JSON.parse(line.slice('window.AtlasData = '.length).replace(/;\s*$/, ''));
  const ver = (/const PACK_VER = '([^']+)'/.exec(html) || [])[1] || '';
  const far = String(d.FAR || '').split(',').filter(Boolean);
  const pl = html.split('\n').find(l => l.startsWith('window.AtlasPlaces = '));
  const P = pl ? JSON.parse(pl.slice('window.AtlasPlaces = '.length).replace(/;\s*$/, '')) : { P: [], MAPS: {} };
  DATA = { C: d.C, EASY: new Set(String(d.EASY || '').split(',')), FAR: new Set([...far, ...far.map(p => p.split('-').reverse().join('-'))]), P: P.P, MAPS: P.MAPS, packVer: ver };
  return DATA;
}
/** Every country's code, in the one order the game and the server share (the choices of every question). */
export const codes = () => data().C.map(c => c[0]);
/** A state's or province's map ('us', 'ca') from its code ('US-OH'), or '' for a country. */
export const subOf = cc => { const m = /^(US|CA)-/.exec(String(cc || '')); return m ? m[1].toLowerCase() : ''; };
/** One map's states or provinces in their one order (the choices of that map's questions); every one without a map. */
export const placeCodes = map => data().P.filter(r => !map || subOf(r[0]) === map).map(r => r[0]);
/** A question's choices: the countries, or the states or provinces of a map region. */
export const choicesFor = region => (SUB_MAPS.includes(region) ? placeCodes(region) : codes());

const packs = new Map();
/** A language pack's strings (name.XX, cap.XX, fam.XX ...) or {} (English, or no pack). */
export function packFor(lang = 'en') {
  const code = /^en/.test(lang) ? 'en' : lang;
  if (packs.has(code)) return packs.get(code);
  let strings = {};
  if (code !== 'en') {
    try {
      const f = path.join(ROOT, 'public/vendor/data/atlas-quest', data().packVer, `${code}.js`);
      const box = { window: {} };
      vm.runInNewContext(fs.readFileSync(f, 'utf8'), box, { timeout: 2000 });
      strings = (box.window.AtlasPacks && box.window.AtlasPacks[code] && box.window.AtlasPacks[code].strings) || {};
    } catch { strings = {}; }
  }
  packs.set(code, strings);
  return strings;
}
const word = (p, key, en) => (typeof p[key] === 'string' && p[key] ? p[key] : en);
/** A country's name in a language (the game's own translation, else English). */
export function countryName(cc, lang = 'en') {
  const c = data().C.find(x => x[0] === cc) || data().P.find(x => x[0] === cc);
  return c ? word(packFor(lang), `name.${cc}`, c[1]) : cc;
}

/** Kilometres between two [lat, lng] points. */
export function km(a, b) {
  const R = 6371, r = Math.PI / 180, dLat = (b[0] - a[0]) * r, dLng = (b[1] - a[1]) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}
/** Points for a wrong country close to the right one: a neighbour 150 or more (not one that touches only through an
 *  overseas part: France for Brazil), then less with distance, none from 2,000 km. guess, answer: indexes into codes().
 *  On a map of states (region 'us' or 'ca': indexes into placeCodes(region)) the same, over the map's own distances: a
 *  state close by (under 600 km apart, Canada's provinces 1,500 km) scores a little; Alaska and Hawaii, drawn in boxes
 *  away from where they are, never. */
export function closePoints(guess, answer, region) {
  if (SUB_MAPS.includes(region)) {
    const { P, MAPS } = data(), list = P.filter(r => subOf(r[0]) === region), g = list[guess], a = list[answer];
    if (!g || !a || guess === answer || g[13] || a[13]) return 0;
    const d = Math.hypot(g[5] - a[5], g[6] - a[6]) * ((MAPS[region] && MAPS[region].unit) || 20), far = region === 'ca' ? 1500 : 600;
    return d < far ? Math.round(200 * (1 - d / far)) : 0;
  }
  const { C, FAR } = data(), g = C[guess], a = C[answer];
  if (!g || !a || guess === answer) return 0;
  const d = km([g[13], g[14]], [a[13], a[14]]);
  let p = d < 2000 ? Math.round(300 * (1 - d / 2000)) : 0;
  if (String(a[11] || '').split(',').includes(g[0]) && !FAR.has(`${a[0]}-${g[0]}`)) p = Math.max(p, 150);
  return p;
}

/** 'atlas:<region>:<level>:<kinds>:<count>:<secs>' -> { region, level, kinds, count, secs } | null */
export function parseId(id) {
  const m = /^atlas:([a-z]+):([a-z]+):([a-z+]+):(\d{1,2}):(\d{1,2})$/.exec(String(id || ''));
  if (!m) return null;
  const kinds = [...new Set(m[3].split('+'))];
  const o = { region: m[1], level: m[2], kinds, count: +m[4], secs: +m[5] };
  if (!REGIONS.includes(o.region) || !LEVELS.includes(o.level) || !kinds.length || kinds.some(k => !KINDS.includes(k)) || !COUNTS.includes(o.count) || !SECS.includes(o.secs)) return null;
  return o;
}
export const makeId = ({ region = 'world', level = 'easy', kinds = ['find'], count = 10, secs = 20 } = {}) => {
  const ks = [...new Set(kinds)].filter(k => KINDS.includes(k));
  return `atlas:${REGIONS.includes(region) ? region : 'world'}:${LEVELS.includes(level) ? level : 'easy'}:${(ks.length ? ks : ['find']).join('+')}:${COUNTS.includes(+count) ? +count : 10}:${SECS.includes(+secs) ? +secs : 20}`;
};

/** The countries a level asks about: easy the famous ones, medium those and every big one, hard every country (tiny
 *  islands too: they are dots on the map). */
function pool(region, level) {
  const { C, EASY, P } = data();
  if (SUB_MAPS.includes(region)) return P.filter(r => subOf(r[0]) === region).map((r, i) => ({ c: r, i }));
  return C.map((c, i) => ({ c, i })).filter(({ c }) => (region === 'world' || c[9] === region)
    && (level === 'hard' || EASY.has(c[0]) || (level === 'medium' && (c[10] >= 100 || c[5] >= 10e6))));
}

/**
 * The session's questions: count countries from the region at the level, each asked as one of the chosen kinds (in
 * turn, so a mix is even). Item: { q, choices: codes(), answer: index, secs, atlas: { k: kind, fl?: cc (a flag
 * question's flag), reg } }. -> items or null
 */
export function atlasItems(id, lang = 'en') {
  const p = parseId(id);
  if (!p) return null;
  let list = pool(p.region, p.level);
  // a small region at an easy level: widen it rather than ask the same few countries
  if (list.length < p.count) list = pool(p.region, 'hard');
  if (!list.length) return null;
  for (let i = list.length - 1; i > 0; i--) { const j = crypto.randomInt(i + 1); [list[i], list[j]] = [list[j], list[i]]; }
  const t = tFor(lang), pk = packFor(lang), all = choicesFor(p.region), out = [];
  const kinds = p.kinds.slice();
  if (SUB_MAPS.includes(p.region)) {
    // a map of states: find it, or find the one whose capital this is (flags and "famous for" are about countries)
    for (let i = 0, k = crypto.randomInt(kinds.length); out.length < p.count && i < list.length; i++) {
      const { c, i: idx } = list[i];
      let kind = kinds[k++ % kinds.length] === 'capital' ? 'capital' : 'find';
      if (kind === 'capital' && (NO_CAP_Q.has(c[0]) || !c[2])) kind = 'find';
      const q = kind === 'capital' ? t(`live.atlas.q.capital_${p.region}`, { city: word(pk, `cap.${c[0]}`, c[2]) }) : t('live.atlas.q.findSub', { name: word(pk, `name.${c[0]}`, c[1]) });
      out.push({ q, choices: all, answer: idx, secs: p.secs, atlas: { k: kind, reg: p.region } });
    }
    return out.length ? out : null;
  }
  for (let i = 0, k = crypto.randomInt(kinds.length); out.length < p.count && i < list.length * 2; i++) {
    const { c, i: idx } = list[i % list.length];
    if (out.some(x => x.answer === idx)) continue;
    let kind = kinds[k % kinds.length];
    if (kind === 'capital' && NO_CAP_Q.has(c[0])) kind = 'find';
    if (kind === 'famous' && !c[7]) kind = 'find';
    k++;
    const name = word(pk, `name.${c[0]}`, c[1]);
    const q = kind === 'capital' ? t('live.atlas.q.capital', { city: word(pk, `cap.${c[0]}`, c[2]) })
      : kind === 'flag' ? t('live.atlas.q.flag')
        : kind === 'famous' ? t('live.atlas.q.famous', { thing: word(pk, `fam.${c[0]}`, c[7]) })
          : t('live.atlas.q.find', { name });
    out.push({ q, choices: all, answer: idx, secs: p.secs, atlas: { k: kind, reg: p.region, ...(kind === 'flag' ? { fl: c[0] } : {}) } });
  }
  return out.length ? out : null;
}
