// Kid-safe text rules shared by usernames, game text and friends chat.
// Normalises leetspeak and spacing tricks before matching so "s h i t" and "5h1t" are caught.
// Works for every site language:
//  - Text is NFKC-normalised first, so full-width letters and digits ("０１２", "ｂｏｂ＠ｍａｉｌ．ｃｏｍ") look like plain ones,
//    invisible characters are dropped and any dash becomes "-".
//  - Digits from any script (Arabic-Indic "٠١٢", Devanagari, Thai...) count as digits for the phone detector.
//  - Per-language word lists live in server/i18n/blocklists/<code>.txt (ROT13, see the README there). Every list is
//    applied to every message, whatever language the sender uses.
// Error messages come back in the caller's language: pass t (from req.t); the default is English.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { tEn } from '../i18n/index.js';

// Whole-word-ish blocklist (matched against normalised text). Kept short and obvious; extend in one place.
export const BLOCK = ['fuck', 'shit', 'bitch', 'cunt', 'dick', 'cock', 'pussy', 'porn', 'sex', 'nazi', 'hitler', 'rape', 'nigg', 'fag', 'whore', 'slut', 'penis', 'vagina', 'boob', 'retard', 'suicide', 'kys', 'bastard', 'wank', 'twat', 'nude', 'naked', 'horny', 'milf', 'cum', 'jizz', 'anal', 'dildo', 'kkk', 'heroin', 'cocaine', 'meth'];
// Only blocked in usernames (too many false positives in chat sentences).
const NAME_ONLY = ['ass', 'damn', 'hell', 'kill', 'drug', 'weed', 'die'];
// Allow-list of innocent words that contain blocked fragments.
const SAFE = ['class', 'pass', 'grass', 'glass', 'bass', 'mass', 'assist', 'assemble', 'hello', 'shell', 'skill', 'killer whale', 'sussex', 'essex', 'scunthorpe', 'cocktail', 'peacock', 'hancock', 'dickens', 'cocoa', 'shiitake', 'therapist', 'grape', 'drape', 'sextant', 'sixty', 'documentary', 'cucumber', 'circumstance', 'analysis', 'canal', 'banal', 'scumbag', 'hellfire', 'michelle', 'diesel', 'diet', 'died', 'dies', 'studied', 'buddies', 'cookies', 'goodies', 'indie', 'birdie', 'hoodie', 'skilled', 'killed', 'mill', 'kills', 'nudes',
  // English words, and everyday words in the other site languages, that start like a blocked word (found by the translators)
  'method', 'analy', 'analis', 'analiz', 'analog', 'cockpit', 'cockatoo', 'cockroach', 'cockermouth', 'penistone', 'heroine', 'heroina', 'cumul', 'cumbia',
  'nudel', 'methode', 'dicke', 'dicker', 'dickes', 'dicken',                 // de/nl: noodles, method, thick
  'cumple', 'cumpl', 'cumpri', 'cumbre', 'sexta', 'sexto', 'sextet',         // es/pt: birthday, fulfil, greet, summit, Friday/sixth
  'en retard', 'nazion', 'fagiol', 'fagian', 'fagott'];                       // fr: late; it: nation, beans, pheasant, bassoon

const LEET = { '0': 'o', '1': 'i', '!': 'i', '3': 'e', '4': 'a', '@': 'a', '5': 's', '$': 's', '7': 't', '+': 't', '8': 'b', '9': 'g', '|': 'i' };
export function normalise(s) {
  let t = String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '');
  t = t.replace(/[0-9!@$+|]/g, c => LEET[c] || c);
  return t;
}

// ---------------------------------------------------------------- any-script normalisation
const INVISIBLE = /[­͏؜ᅟᅠ឴឵᠎​-‏‪-‮⁠-⁯ㅤ︀-️﻿ﾠ]/g;
/** Any Unicode decimal digit -> its ASCII digit (٣ -> 3, ३ -> 3). Decimal digits come in runs of ten starting at 0. */
export function foldDigits(s) {
  return String(s).replace(/\p{Nd}/gu, ch => {
    const cp = ch.codePointAt(0); if (cp >= 48 && cp <= 57) return ch;
    let zero = cp; while (zero > cp - 9 && /\p{Nd}/u.test(String.fromCodePoint(zero - 1))) zero--;
    return String((cp - zero) % 10);
  });
}
/** NFKC (full-width -> plain), drop invisible characters, any dash -> "-", any digit -> ASCII. */
export function normalizeText(s) {
  return foldDigits(String(s || '').normalize('NFKC').replace(INVISIBLE, '').replace(/\p{Pd}/gu, '-'));
}

// ---------------------------------------------------------------- per-language blocklists
export const BLOCKLIST_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../i18n/blocklists');
export const rot13 = s => String(s).replace(/[a-z]/gi, c => { const b = c <= 'Z' ? 65 : 97; return String.fromCharCode((c.charCodeAt(0) - b + 13) % 26 + b); });
// Scripts written without spaces between words: their entries match anywhere, even with spaces squeezed in.
const NO_SPACES = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Script=Thai}]/u;
/** Lowercase, NFKC, no Latin accents, no Hebrew points, no Arabic vowel marks or tatweel. Applied to entries and text alike. */
export const foldForList = s => normalizeText(s).toLowerCase().normalize('NFKD').replace(/[̀-֑ͯ-ׇً-ٰٟـ]/g, '').normalize('NFC');
const escRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
let LISTS = { words: [], safe: [] };
/** Parse one blocklist file's text: one ROT13 entry per line; "#" comments; "=word" whole word only; "!word" an innocent word. */
export function parseBlocklist(text) {
  const words = [], safe = [];
  for (let line of String(text).split(/\r?\n/)) {
    line = line.trim(); if (!line || line.startsWith('#')) continue;
    let kind = 'start';
    if (line.startsWith('!')) { safe.push(foldForList(rot13(line.slice(1).trim()))); continue; }
    if (line.startsWith('=')) { kind = 'exact'; line = line.slice(1).trim(); }
    const w = foldForList(rot13(line)); if (!w) continue;
    const anywhere = NO_SPACES.test(w);
    const re = anywhere ? null : new RegExp(`(^|[^\\p{L}\\p{N}])${escRe(w)}${kind === 'exact' ? '(?![\\p{L}\\p{N}])' : ''}`, 'u');
    words.push({ w, anywhere, re });
  }
  return { words, safe };
}
/** (Re)load every server/i18n/blocklists/*.txt. Returns how many entries were loaded. */
export function loadBlocklists(dir = BLOCKLIST_DIR) {
  const out = { words: [], safe: [] };
  let files = []; try { files = fs.readdirSync(dir).filter(f => f.endsWith('.txt')).sort(); } catch { files = []; }
  for (const f of files) { const p = parseBlocklist(fs.readFileSync(path.join(dir, f), 'utf8')); out.words.push(...p.words); out.safe.push(...p.safe); }
  LISTS = out;
  return out.words.length;
}
loadBlocklists();
function listHit(s, { names = false } = {}) {
  if (!LISTS.words.length) return false;
  let text = foldForList(s);
  for (const w of LISTS.safe) if (w) text = text.split(w).join(' ');
  const leet = text.replace(/[0-9!@$+|]/g, c => LEET[c] || c);
  const squashed = text.replace(/[^\p{L}\p{N}]/gu, '');
  // spaced-out letters ("м а т") joined back together
  const runs = (text.match(/(?:(?:^|\s)\p{L}(?=\s|$)){3,}/gu) || []).map(r => r.replace(/\s/g, ''));
  for (const e of LISTS.words) {
    if (e.anywhere) { if (squashed.includes(e.w)) return true; continue; }
    if (e.re.test(text) || e.re.test(leet)) return true;
    if (names && e.w.length >= 3 && squashed.includes(e.w)) return true;
    if (runs.some(r => r.includes(e.w))) return true;
  }
  return false;
}

function stripSafe(t) { for (const w of SAFE) t = t.split(w).join(' '); return t; }
// ---------------------------------------------------------------- family link codes
/** The alphabet of family link codes (services/family.js): no look-alikes (0 O 1 I L). */
export const LINK_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const LC = 'A-HJKMNP-Z2-9';
const SEP = '[^\\p{L}\\p{N}]';   // anything that isn't a letter or a digit: spaces, any dash, slashes, dots, symbols
const LINK_CODE_RES = [
  // 3 + 4 with up to 3 separators of any kind between the halves: "K7Q-4MZ9", "k7q 4mz9", "K7Q / 4MZ9", "K7Q — 4MZ9"
  `[${LC}]{3}${SEP}{0,3}[${LC}]{4}`,
  // 7 single characters, each followed by 1-3 separators: "K 7 Q 4 M Z 9", "K-7-Q-4-M-Z-9", "K.7.Q.4.M.Z.9"
  `(?:[${LC}]${SEP}{1,3}){6}[${LC}]`,
].map(body => new RegExp(`(?<![\\p{L}\\p{N}])(?=(${body})(?![\\p{L}\\p{N}]))`, 'gu'));   // a lookahead, so matches may overlap
// The code at the end of a longer word ("codeK7Q4MZ9"): 7 code characters with at least 2 digits, a digit before a
// letter (codes are random; "Panda482" or "THANKS2U" are not codes).
const LINK_CODE_TAIL = new RegExp(`[\\p{L}\\p{N}]([${LC}]{7})(?![\\p{L}\\p{N}])`, 'gu');
/** Does the text carry something shaped like a family link code (K7Q-4MZ9), however it is spaced or punctuated? Only 7
 *  characters from the code alphabet with a digit and a letter in them count, so ordinary words (which almost always
 *  have an O, I or L, or no digit) and plain numbers pass. Used by friends chat, names, game text and score labels. */
export function looksLikeLinkCode(text) {
  const s = normalizeText(String(text ?? '').slice(0, 20000)).toUpperCase();
  for (const re of LINK_CODE_RES) for (const m of s.matchAll(re)) if (/[2-9]/.test(m[1]) && /[A-Z]/.test(m[1])) return true;
  for (const m of s.matchAll(LINK_CODE_TAIL)) { const c = m[1]; if ((c.match(/[2-9]/g) || []).length >= 2 && /[2-9][A-Z]/.test(c)) return true; }
  return false;
}

/** true if the text contains blocked words (any language list), including spaced-out or leetspeak versions. */
export function hasProfanity(s, { names = false } = {}) {
  s = String(s || '').slice(0, 200000);
  const base = stripSafe(normalise(normalizeText(s)));
  const words = base.replace(/[^a-z]+/g, ' ');
  const squashed = base.replace(/[^a-z]/g, '');
  const list = names ? [...BLOCK, ...NAME_ONLY] : BLOCK;
  for (const b of list) {
    if (names && squashed.includes(b)) return true;
    // whole words or word starts in normal text, and anywhere in letters that were spaced out ("s h i t")
    if (new RegExp(`(^|\\s)${b}`).test(words)) return true;
  }
  // spaced-out letters: "f u c k" -> look for runs of single letters
  const runs = words.match(/(?:\b[a-z]\b\s?){3,}/g) || [];
  for (const r of runs) { const j = r.replace(/\s/g, ''); if (list.some(b => j.includes(b))) return true; }
  return listHit(s, { names });
}
/** Personal info: phone numbers, emails, street addresses, social handles, links. Any script, any digits. */
export function personalInfo(s) {
  const t = normalizeText(String(s || '').slice(0, 20000));
  if (/(^|[^\d.])(\+?\d{1,3}[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{3,4}(?![\d.])/.test(t) || /\d{7,}/.test(t) || /\b0\d{3,4}[\s-]?\d{6}\b/.test(t)) return 'phone';
  if (/[\p{L}\p{N}._%+-]{1,64}\s{0,3}(@|\(at\)|\[at\])\s{0,3}[\p{L}\p{N}-]{1,63}\s{0,3}(\.|dot|\(dot\)|\[dot\]|。)\s{0,3}\p{L}{2,}/iu.test(t)) return 'email';
  // A scheme or www., or a domain-like token word.tld — but not a bare filename (dragon.png) or abbreviation.
  if (/https?:\/\/|www\.[a-z0-9-]/i.test(t) || /\b[a-z0-9-]{2,}\.(?!(?:png|jpe?g|gif|webp|svg|bmp|ico|txt|pdf|mp[34]|mov|wav|ogg|zip|rar|docx?|xlsx?|pptx?|csv|js|mjs|json|html?|css|md|exe|dmg|apk)\b)[a-z]{2,24}\b/i.test(t)) return 'link';
  if (/\b\d{1,5}\s+[a-z]+\s+(street|st|road|rd|avenue|ave|lane|ln|drive|dr|court|ct|way|close|crescent)\b/i.test(t)) return 'address';
  if (/\b(snap(chat)?|insta(gram)?|tiktok|discord|whatsapp|kik|telegram|facebook|fb|my number|phone number|gmail|hotmail|yahoo|outlook|icloud|where do you live|what school|home address|meet (me|up))\b/i.test(t)) return 'contact';
  if (/(^|\s)@[a-z0-9_]{3,}/i.test(t)) return 'handle';
  return null;
}

/** Usernames: 3-16 chars, letters/digits/underscore, no profanity, nothing that looks like a phone number or a real full name. */
/** A sign-in name. Kids' names may not look like a real name or carry a birth year (they are seen by other players);
 *  a grown-up account's name (realNames: true) may be their real name: children never see it, and it is on no
 *  leaderboard, profile or search (routes/family.js). */
export function cleanName(s, t = tEn, { realNames = false } = {}) {
  const v = String(s || '').trim();
  if (!/^[A-Za-z0-9_]{3,16}$/.test(v)) return { ok: false, error: t('textfilter.name.chars') };
  if (hasProfanity(v, { names: true })) return { ok: false, error: t('textfilter.name.notAllowed') };
  if (/\d{5,}/.test(v)) return { ok: false, error: t('textfilter.name.numbers') };
  // A family link code as a name would show on leaderboards, search and profiles (services/family.js).
  if (looksLikeLinkCode(v)) return { ok: false, error: t('textfilter.name.notAllowed') };
  if (realNames) return { ok: true, value: v };
  if (/^(19|20)\d\d|(19|20)\d\d$/.test(v) && /[a-z]{3,}/i.test(v)) return { ok: false, error: t('textfilter.name.birthYear') };
  if (/^[A-Z][a-z]{2,}_?[A-Z][a-z]{2,}\d*$/.test(v) && REALNAME.test(v)) return { ok: false, error: t('textfilter.name.realName') };
  return { ok: true, value: v };
}
// Common first names; "FirstLast" style usernames that start with one look like a real full name.
const REALNAME = /^(james|john|robert|michael|william|david|richard|joseph|thomas|charles|mary|patricia|jennifer|linda|elizabeth|barbara|susan|jessica|sarah|karen|emma|olivia|ava|sophia|isabella|mia|amelia|harper|evelyn|liam|noah|oliver|elijah|lucas|mason|logan|ethan|jacob|jack|aiden|jackson|leo|henry|grace|chloe|lily|ella|zoe|emily|hannah|sam|max|ben|tom|lucy|ruby|freya|alfie|charlie|george|harry|oscar|archie|daniel|matthew|anthony|mark|paul|steven|andrew|joshua|kevin|brian|ryan|jason|justin|nicole|ashley|amanda|megan|rachel|laura|anna|kate|katie|amy)_?[A-Z]/i;

/** Free text the platform shows to others (game titles, descriptions, report details). */
export function cleanText(s, max = 200, t = tEn) {
  const v = String(s || '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f‪-‮⁦-⁩]/g, '').trim().slice(0, max);
  if (hasProfanity(v)) return { ok: false, error: t('textfilter.text.notAllowed') };
  const pi = personalInfo(v);
  if (pi && pi !== 'handle') return { ok: false, error: t('textfilter.text.personal') };
  if (looksLikeLinkCode(v)) return { ok: false, error: t('textfilter.text.personal') };
  return { ok: true, value: v };
}
