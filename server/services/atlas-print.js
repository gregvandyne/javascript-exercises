// Atlas Quest's Print (BRB.print, docs/sdk.md "Printing"; docs/decisions.md "Atlas Quest in Crossword's look"): the game
// sends its quiz as plain data and the play page asks POST /api/games/:id/print, which checks it here and answers with
// the printable page. Never HTML from the game: the quiz goes through game-sets.js cleanAtlasItems (countries as ISO
// codes from the game's list; the teacher's words through the site's text filter), and the map is drawn here from the
// game's own map data by the game's own map code (the atlas-map block in seed-games/atlas-quest.html, run as it is), so
// the printed map, its numbers and its arrows are the ones the teacher placed in the quiz maker. Black outlines on white.
//   - a quiz worksheet: the map with its numbered countries (small ones: an arrow to an answer line in open space) and
//     a line for each, then the other questions with a line each (a flag question shows the flag);
//   - blank: the map and its lines only (a region's blank map);
//   - key: the answer key on a page of its own after it (school staff only: the route checks who asks).
// note: the teacher's own instructions, printed at the top (never on the key). Words in the viewer's language: the
// page's own (play.print*, server/i18n) and the countries', capitals' and continents' from the game's reviewed packs.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { cleanAtlasItems, SET_ID } from './game-sets.js';
import { cleanPrintNote } from './print-note.js';
import { packFor } from '../live/atlas.js';

export const PRINT = { bytes: 20000 };
const KEYS = new Set(['t', 'r', 'q', 'a', 'h', 'key', 'set', 'note', 'blank']);
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');
let CORE = null;
/** The game's data (window.AtlasData) and its map code, read from the game file once. */
export function core() {
  if (CORE) return CORE;
  const html = fs.readFileSync(path.join(ROOT, 'seed-games/atlas-quest.html'), 'utf8');
  const line = html.split('\n').find(l => l.startsWith('window.AtlasData = '));
  const D = JSON.parse(line.slice('window.AtlasData = '.length).replace(/;\s*$/, ''));
  const m = /\/\* atlas-map:begin \*\/([\s\S]*?)\/\* atlas-map:end \*\//.exec(html);
  const box = { window: {} };
  vm.runInNewContext(m[1], box, { timeout: 5000 });
  const by = Object.fromEntries(D.C.map(c => [c[0], { cc: c[0], name: c[1], cap: c[2], fam: c[7], reg: c[9] }]));
  CORE = { D, by, map: box.window.AtlasMap.make(D) };
  return CORE;
}

/** The game's print request -> { ok: true, doc: { t, r, q, a, key, set, blank, note? } } or { ok: false, code: 'bad' }.
 *  Strict: unknown keys, a country not in the game's list, a frame the game doesn't draw or any text the filter refuses,
 *  and it is turned down. blank: the map only, so every question must be a map label (none at all: a bare outline). */
export function cleanAtlasPrintDoc(raw) {
  const no = { ok: false, code: 'bad' };
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return no;
  let size; try { size = JSON.stringify(raw).length; } catch { return no; }
  if (size > PRINT.bytes || Object.keys(raw).some(k => !KEYS.has(k))) return no;
  for (const k of ['key', 'blank', 'h']) if (raw[k] !== undefined && typeof raw[k] !== 'boolean') return no;
  if (raw.t !== undefined && typeof raw.t !== 'string') return no;
  if (raw.set !== undefined && raw.set !== '' && !(typeof raw.set === 'string' && SET_ID.test(raw.set))) return no;
  const note = cleanPrintNote(raw.note);
  if (note === null) return no;
  const blank = raw.blank === true;
  const items = cleanAtlasItems([{ t: raw.t || '', r: raw.r, q: raw.q, a: raw.a, h: raw.h !== false }], { empty: blank });
  if (!items) return no;
  const it = items[0];
  if (blank && it.q.some(x => x[0] !== 'map')) return no;
  return { ok: true, doc: { t: it.t, r: it.r, q: it.q, a: it.a, key: raw.key === true, set: raw.set || '', blank, ...(note ? { note } : {}) } };
}

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const flagSrc = f => (f.startsWith('data:') ? f : 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(f));
// US English for 'en' (the game's English data is in British spelling; en-GB keeps it), as the game shows it.
const US_WORDS = [[/colour/g, 'color'], [/Colour/g, 'Color'], [/neighbour/g, 'neighbor'], [/Neighbour/g, 'Neighbor'], [/\bgrey\b/g, 'gray'], [/\bGrey\b/g, 'Gray'],
  [/favourite/g, 'favorite'], [/Favourite/g, 'Favorite'], [/flavour/g, 'flavor'], [/harbour/g, 'harbor'], [/honour/g, 'honor'], [/Honour/g, 'Honor'], [/metre/g, 'meter'],
  [/centre/g, 'center'], [/jewellery/g, 'jewelry'], [/theatre/g, 'theater'], [/traveller/g, 'traveler'], [/\bcosy\b/g, 'cozy'], [/\bmould/g, 'mold'], [/\btyre\b/g, 'tire'], [/aeroplane/g, 'airplane']];
export const usSpelling = s => US_WORDS.reduce((x, [re, to]) => x.replace(re, to), String(s));
const CONT = { af: 'Africa', as: 'Asia', eu: 'Europe', na: 'North America', sa: 'South America', oc: 'Oceania' };

/** The printable page (a fragment for the play page's print area). t: the viewer's language (req.t); dir: its
 *  direction; lang: its code; code / link: the saved set's class code and link (only for a set that is on Oomba). */
export function atlasPrintHtml(doc, { t, dir = 'ltr', lang = 'en', code = '', link = '' }) {
  const { by, map, D } = core(), P = packFor(lang);
  const usEn = /^en(-US)?$/i.test(lang);
  const word = (key, en) => (typeof P[key] === 'string' && P[key] ? P[key] : usEn ? usSpelling(en) : en);
  const fill = (s, v) => s.replace(/\{(\w+)\}/g, (m, k) => (k in v ? v[k] : m));
  const name = cc => word(`name.${cc}`, by[cc].name), capital = cc => word(`cap.${cc}`, by[cc].cap), famous = cc => word(`fam.${cc}`, by[cc].fam);
  // the key gives a capital with its note where the seat of government differs or the status is disputed (D.CAPNOTE)
  const capKey = cc => (D.CAPNOTE && D.CAPNOTE[cc] ? `${capital(cc)} (${word(`capnote.${cc}`, D.CAPNOTE[cc])})` : capital(cc));
  const cont = cc => word(CONT[by[cc].reg], CONT[by[cc].reg]);
  const region = doc.r === 'world' ? word('Whole world', 'Whole world') : CONT[doc.r] ? word(CONT[doc.r], CONT[doc.r]) : t(`play.printAtlas.region.${doc.r}`);
  // "Map of the Caribbean": the world and the two regions that aren't continents have their own words in each language
  const mapOfKey = `play.printAtlas.mapOf.${doc.r}`, mapOf = ['world', 'car', 'me'].includes(doc.r) && t(mapOfKey) !== mapOfKey ? t(mapOfKey) : t('play.printAtlas.mapTitle', { region });
  const title = doc.t || (doc.blank ? mapOf : t('play.printAtlas.untitled'));
  // the map: its countries numbered in the order they were added; small ones on an answer line with an arrow
  const nums = {}; let n = 0;
  for (const x of doc.q) if (x[0] === 'map' && nums[x[1]] === undefined) nums[x[1]] = ++n;
  const co = {}; for (const [cc, lng, lat] of doc.a) if (nums[cc] !== undefined) co[cc] = [lng / 10, lat / 10];
  const showMap = doc.blank || n > 0;
  const svg = names => map.svg(doc.r, { nums, co, names, label: ['world', 'car', 'me'].includes(doc.r) ? mapOf : t('play.printAtlas.mapAlt', { region }) });
  const others = doc.q.filter(x => x[0] !== 'map');
  const ask = x => {
    const cc = x[0] === 'own' ? x[3] : x[1];
    if (x[0] === 'own') return esc(x[1]);
    if (x[0] === 'cap') return esc(fill(word('What is the capital of {name}?', 'What is the capital of {name}?'), { name: name(cc) }));
    if (x[0] === 'capc') return esc(fill(t('play.printAtlas.capc'), { city: capital(cc) }));
    if (x[0] === 'flag') return `${esc(word('Which country has this flag?', 'Which country has this flag?'))}<img class="atp-flag" src="${esc(flagSrc(D.FLAG[cc]))}" alt="">`;
    if (x[0] === 'cont') return esc(fill(word('Which continent is {name} in?', 'Which continent is {name} in?'), { name: name(cc) }));
    return esc(t('play.printAtlas.fam', { thing: famous(cc) }));
  };
  const answer = x => (x[0] === 'own' ? x[2] : x[0] === 'cap' ? capKey(x[1]) : x[0] === 'cont' ? cont(x[1]) : name(x[1]));
  const lines = Object.keys(nums).filter(cc => !co[cc]);
  const foot = `<footer class="cwp-foot"><span>${esc(t('play.print.made'))}</span>${code ? `<span>${esc(t('play.print.code', { code }))}</span>` : ''}${link ? `<span dir="ltr" class="cwp-link">${esc(link)}</span>` : ''}</footer>`;
  const mapPart = showMap ? `<section class="atp-mapsec">
${n ? `<h2>${esc(t('play.printAtlas.mapH'))}</h2><p class="atp-how">${esc(t('play.printAtlas.mapHow'))}${Object.keys(co).length ? ' ' + esc(t('play.printAtlas.mapHowCo')) : ''}</p>` : ''}
<div class="atp-map">${svg({})}</div>
${lines.length ? `<ol class="atp-lines">${lines.map(cc => `<li><b class="cwp-num">${nums[cc]}</b><i class="atp-blank"></i></li>`).join('')}</ol>` : ''}
</section>` : '';
  const qPart = !doc.blank && others.length ? `<section class="atp-qsec"><h2>${esc(t('play.printAtlas.questions'))}</h2>
<ol class="atp-qs" start="${n + 1}">${others.map(x => `<li><span class="atp-q" dir="auto">${ask(x)}</span><i class="atp-ans"></i></li>`).join('')}</ol></section>` : '';
  const sheet = `<section class="cwp-page atp-page">
<header class="cwp-head"><h1 dir="auto">${esc(title)}</h1><p class="cwp-lines"><span class="cwp-line">${esc(t('play.print.name'))}<i class="cwp-blank cwp-blank-name"></i></span><span class="cwp-line">${esc(t('play.print.date'))}<i class="cwp-blank"></i></span></p></header>
${doc.note ? `<p class="cwp-mine" dir="auto">${esc(doc.note)}</p>` : ''}${mapPart}${qPart}
${foot}</section>`;
  let key = '';
  if (doc.key) {
    const names = {}; for (const cc of Object.keys(co)) names[cc] = name(cc);
    const all = [...Object.keys(nums).map(cc => [nums[cc], name(cc)]), ...(doc.blank ? [] : others.map((x, i) => [n + 1 + i, answer(x)]))];
    key = `<section class="cwp-page atp-page atp-key">
<header class="cwp-head"><h1 dir="auto">${esc(t('play.print.keyTitle', { title }))}</h1></header>
${n ? `<div class="atp-map atp-keymap">${svg(names)}</div>` : ''}
<ol class="atp-keylist">${all.map(([k, v]) => `<li><b class="cwp-num">${k}</b><span dir="auto">${esc(v)}</span></li>`).join('')}</ol>
${foot}</section>`;
  }
  return `<div class="cwp atp" lang="${esc(lang)}" dir="${dir === 'rtl' ? 'rtl' : 'ltr'}">${sheet}${key}</div>`;
}
