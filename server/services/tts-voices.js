// AI voices: the roles a game can ask for, the OpenAI voices each one uses, the reading instructions (with an accent hint
// per locale) and the admin's choices (docs/decisions.md "AI voices"; /admin/voices).
// - A role is what a game asks for (BRB.speak(text, { voice: 'wise' })); it never names a provider voice, so the owner
//   can change voices without touching a game.
// - The narrator voice is chosen per locale; the other roles share one voice across locales (the voices are
//   multilingual: they speak the language of the text).
// - Every locale is OFF until the admin switches it on, so the owner listens before a language speaks to kids.
// - zh-Hant is read as Taiwanese Mandarin (國語), never Cantonese, like the SDK's device-voice choice.
import { config, TTS_ALL_LOCALES } from '../config.js';
import { setting, audit } from '../db.js';
import { tFor } from '../i18n/index.js';

export const ROLES = ['narrator', 'friendly', 'bright', 'deep', 'wise', 'grumpy'];
/** The OpenAI voices the admin may pick (from memory, not checked here: see docs/tts-design.md). */
export const VOICES = ['alloy', 'ash', 'ballad', 'coral', 'echo', 'fable', 'nova', 'onyx', 'sage', 'shimmer', 'verse', 'marin', 'cedar'];
export const DEFAULT_NARRATOR = 'coral';
export const DEFAULT_ROLES = { friendly: 'nova', bright: 'shimmer', deep: 'onyx', wise: 'sage', grumpy: 'ash' };
export const RATES = ['slow', 'normal', 'fast'];
/** A speech rate (0.5..2, the SDK's rate) -> its bucket. */
export const rateBucket = r => { const v = +r; if (!Number.isFinite(v)) return 'normal'; return v < 0.9 ? 'slow' : v > 1.1 ? 'fast' : 'normal'; };
/** tts-1 / tts-1-hd take a speed instead of instructions. */
export const SPEED = { slow: 0.85, normal: 1, fast: 1.15 };

const BASE = "You are reading a children's game aloud to kids aged 8 to 14. Speak clearly and warmly at a calm, friendly pace. Never whisper, shout or sound scary. Read exactly the words given, and nothing else.";
export const ROLE_TEXT = {
  narrator: 'Voice: a warm storyteller.',
  friendly: 'Voice: a cheerful, kind helper.',
  bright: 'Voice: a lively young character, full of wonder.',
  deep: 'Voice: a calm, deep-voiced, kindly grown-up.',
  wise: 'Voice: a gentle, wise older person.',
  grumpy: 'Voice: a silly, grumpy villain in a cartoon: theatrical and funny, never frightening.',
};
export const ACCENT = {
  en: 'Accent: American English.',
  'en-GB': 'Accent: a gentle British English accent.',
  pt: 'Language and accent: Brazilian Portuguese.',
  fr: 'Language and accent: French from France.',
  es: 'Language and accent: Spanish from Spain.',
  de: 'Language and accent: standard German.',
  he: 'Language and accent: modern Israeli Hebrew.',
  ja: 'Language and accent: standard Japanese.',
  ar: 'Language and accent: clear Modern Standard Arabic.',
  ru: 'Language and accent: standard Russian.',
  it: 'Language and accent: standard Italian.',
  'zh-Hant': 'Language and accent: Taiwanese Mandarin (國語), never Cantonese. The text is in Traditional Chinese characters.',
  nl: 'Language and accent: Dutch from the Netherlands.',
};
const RATE_TEXT = { slow: 'Pace: a little slower than usual.', normal: '', fast: 'Pace: a little quicker than usual.' };
/** The reading instructions for gpt-4o-mini-tts (English, like the provider's own examples). */
export const instructionsFor = (role, locale, rate = 'normal') => [BASE, ROLE_TEXT[role] || ROLE_TEXT.narrator, ACCENT[locale] || ACCENT.en, RATE_TEXT[rate] || ''].filter(Boolean).join(' ');

/** The admin's fixed sample sentence, in the voice's own language (server/i18n/locales/<locale>.json tts.sample). */
export const sampleFor = locale => tFor(locale)('tts.sample');

/**
 * Site locale (or a BCP 47 tag from a game) -> the TTS locale, or null (then the device voice is used).
 * en/en-US -> en, en-GB/en-UK -> en-GB, zh-Hant/zh-TW/zh-HK/zh-MO -> zh-Hant (read as Taiwanese Mandarin), pt/pt-BR -> pt
 * (pt-PT -> null: the site's Portuguese is Brazilian), otherwise the base language when it is a site locale.
 */
export function ttsLocale(tag) {
  const t = String(tag || '').trim().replace(/_/g, '-').toLowerCase();
  if (!t || t.length > 20) return null;
  if (t === 'en-gb' || t === 'en-uk') return 'en-GB';
  if (/^zh-(hant|tw|hk|mo)\b/.test(t)) return 'zh-Hant';
  if (t === 'zh' || t.startsWith('zh-')) return null;
  if (t === 'pt-pt') return null;
  const base = t.split('-')[0];
  return TTS_ALL_LOCALES.includes(base) ? base : null;
}

// ---------------------------------------------------------------- the admin's choices (settings 'tts.voices')
const KEY = 'tts.voices';
/** Defaults: every locale off with the default narrator, the default role voices. */
export function defaults() {
  return { locales: Object.fromEntries(TTS_ALL_LOCALES.map(l => [l, { on: false, narrator: DEFAULT_NARRATOR }])), roles: { ...DEFAULT_ROLES } };
}
/** A stored or posted value -> a complete, valid settings object (unknown keys and bad values dropped). */
export function normalise(v) {
  const out = defaults();
  const src = v && typeof v === 'object' ? v : {};
  for (const l of TTS_ALL_LOCALES) {
    const x = src.locales && typeof src.locales === 'object' ? src.locales[l] : null;
    if (!x || typeof x !== 'object') continue;
    if (typeof x.on === 'boolean') out.locales[l].on = x.on;
    if (VOICES.includes(x.narrator)) out.locales[l].narrator = x.narrator;
  }
  for (const r of Object.keys(DEFAULT_ROLES)) if (src.roles && VOICES.includes(src.roles[r])) out.roles[r] = src.roles[r];
  return out;
}
let memo = null;
/** The current choices (read once, refreshed when saved). */
export function load() {
  if (memo) return memo;
  let raw = null; try { raw = JSON.parse(setting(KEY) || 'null'); } catch { raw = null; }
  memo = normalise(raw);
  return memo;
}
/**
 * Check and save the admin's choices: locales outside TTS_LOCALES can't be switched on. -> { ok, settings } or
 * { ok: false, error }. Audited (only what changed).
 */
export function save(actorId, posted) {
  if (!posted || typeof posted !== 'object') return { ok: false, error: 'Nothing to save.' };
  const before = load();
  const merged = normalise({ locales: { ...before.locales, ...(posted.locales || {}) }, roles: { ...before.roles, ...(posted.roles || {}) } });
  // A posted value that normalise dropped (an unknown voice) is an error, not a silent no-op.
  for (const [l, x] of Object.entries(posted.locales || {})) {
    if (!TTS_ALL_LOCALES.includes(l)) return { ok: false, error: `Unknown locale ${l}.` };
    if (x && x.narrator !== undefined && !VOICES.includes(x.narrator)) return { ok: false, error: `Unknown voice ${x.narrator}.` };
    if (x && x.on === true && !config.ttsLocales.includes(l)) return { ok: false, error: `${l} is not in TTS_LOCALES.` };
  }
  for (const [r, v] of Object.entries(posted.roles || {})) {
    if (!DEFAULT_ROLES[r]) return { ok: false, error: `Unknown role ${r}.` };
    if (!VOICES.includes(v)) return { ok: false, error: `Unknown voice ${v}.` };
  }
  const changed = {};
  for (const l of TTS_ALL_LOCALES) for (const k of ['on', 'narrator']) if (before.locales[l][k] !== merged.locales[l][k]) changed[`${l}.${k}`] = merged.locales[l][k];
  for (const r of Object.keys(DEFAULT_ROLES)) if (before.roles[r] !== merged.roles[r]) changed[`role.${r}`] = merged.roles[r];
  setting(KEY, JSON.stringify(merged));
  memo = merged;
  if (Object.keys(changed).length) audit(actorId, 'admin.tts.settings', '', changed);
  return { ok: true, settings: merged };
}
/** Tests: forget the in-memory copy. */
export const _forget = () => { memo = null; };

/** Is this locale allowed by TTS_LOCALES and switched on by the admin? */
export const localeSwitchedOn = locale => !!locale && config.ttsLocales.includes(locale) && !!load().locales[locale]?.on;
/** The locales a page may offer now (allowed and switched on). */
export const onLocales = () => config.ttsLocales.filter(l => load().locales[l]?.on);
/** The provider voice for a role in a locale. */
export function voiceFor(role, locale) {
  const s = load();
  if (role === 'narrator' || !DEFAULT_ROLES[role]) return (s.locales[locale] && s.locales[locale].narrator) || DEFAULT_NARRATOR;
  return s.roles[role] || DEFAULT_ROLES[role];
}
