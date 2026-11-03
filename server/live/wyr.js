// Would You Rather Live (built-in mode 'wyr', docs/decisions.md "Would You Rather and Atlas Quest go live"): the class
// votes on dilemmas from the official game's 414-question bank (scripts/data/would-you-rather/<lang>.json, the same
// reviewed source the game's language packs are built from). No right answer, no points: the reveal is the class's
// split, plus the all-time split of everyone on Oomba (server/services/polls.js, counted once per signed-in player).
// Starter id: 'wyr:<topics joined by +, or mix>:<count>:<secs>'.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../scripts/data/would-you-rather');
export const TOPICS = ['animals', 'food', 'powers', 'school', 'travel', 'silly', 'sports', 'space', 'future', 'family', 'deep'];
export const COUNTS = [5, 8, 10, 15, 20];
export const SECS = [10, 15, 20, 30];
/** The official game whose polls the votes feed (its slug). */
export const POLL_SLUG = 'would-you-rather';

const cache = new Map();
const own = lang => (lang === 'en-GB' ? 'en' : lang);
function load(file) {
  if (cache.has(file)) return cache.get(file);
  let v = null;
  try { v = JSON.parse(fs.readFileSync(path.join(DIR, `${file}.json`), 'utf8')); } catch { v = null; }
  cache.set(file, v);
  return v;
}
/** The dilemmas in a language (English for anything missing): [{ id, cat, a, b }]. */
export function itemsFor(lang = 'en') {
  const en = load('en'), mine = load(own(lang));
  const byId = new Map(((mine && mine.items) || []).map(it => [it.id, it]));
  return en.items.map(it => { const x = byId.get(it.id) || it; return { id: it.id, cat: it.cat, a: (x.a && x.a.text) || it.a.text, b: (x.b && x.b.text) || it.b.text }; });
}
/** The game's own words (title, topic names) in a language. */
export function uiFor(lang = 'en') {
  const ui = load('ui') || {};
  return { ...(ui.en || {}), ...(ui[own(lang)] || {}), ...(ui[lang] || {}) };
}
/** The topic picker for the landing page: [{ id, name, n }]. */
export function topicsFor(lang = 'en') {
  const ui = uiFor(lang), all = itemsFor(lang);
  return TOPICS.map(id => ({ id, name: ui[`cat.${id}`] || id, n: all.filter(it => it.cat === id).length }));
}

/** 'wyr:<topics|mix>:<count>:<secs>' -> { topics: [...], count, secs } | null */
export function parseId(id) {
  const m = /^wyr:([a-z+]+):(\d{1,2}):(\d{1,2})$/.exec(String(id || ''));
  if (!m) return null;
  const topics = m[1] === 'mix' ? [] : [...new Set(m[1].split('+'))];
  if (topics.some(x => !TOPICS.includes(x))) return null;
  const count = +m[2], secs = +m[3];
  if (!COUNTS.includes(count) || !SECS.includes(secs)) return null;
  return { topics, count, secs };
}
export const makeId = ({ topics = [], count = 10, secs = 15 } = {}) => {
  const ts = [...new Set(topics)].filter(x => TOPICS.includes(x));
  return `wyr:${ts.length && ts.length < TOPICS.length ? ts.join('+') : 'mix'}:${COUNTS.includes(+count) ? +count : 10}:${SECS.includes(+secs) ? +secs : 15}`;
};

/**
 * The session's questions: count dilemmas from the chosen topics (all of them for a mix), in a random order, mixed
 * across topics. Each item: { q: the game's title ("Would You Rather?"), choices: [a, b], answer: -1 (no right one),
 * secs, wyr: id }. -> items or null
 */
export function wyrItems(id, lang = 'en') {
  const p = parseId(id);
  if (!p) return null;
  const pool = itemsFor(lang).filter(it => !p.topics.length || p.topics.includes(it.cat));
  if (!pool.length) return null;
  for (let i = pool.length - 1; i > 0; i--) { const j = crypto.randomInt(i + 1); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  const title = uiFor(lang).title || 'Would You Rather?';
  return pool.slice(0, p.count).map(it => ({ q: title, choices: [it.a, it.b], answer: -1, secs: p.secs, wyr: it.id }));
}
