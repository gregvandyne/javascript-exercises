// Oomba Live nicknames and random avatars (docs/decisions.md "Oomba Live"). Guests (and signed-in players outside their
// teacher's own class room) are shown as a generated nickname: one of 144 whole phrases, 12 kind adjectives x 12
// animals, translated whole in every language (so adjectives agree with the animal's gender). Nobody types a name.
// A seat holds only the phrase's index (0-143); every device shows it in its own language.
import crypto from 'node:crypto';
import { tFor } from '../i18n/index.js';
import { CHARACTER, cleanCharacter } from './character.js';
import { allow } from './ratelimit.js';

export const ADJECTIVES = ['Brave', 'Sunny', 'Speedy', 'Clever', 'Jolly', 'Mighty', 'Happy', 'Lucky', 'Cosmic', 'Gentle', 'Bouncy', 'Starry'];
export const ANIMALS = ['Otter', 'Panda', 'Fox', 'Koala', 'Penguin', 'Owl', 'Turtle', 'Dolphin', 'Llama', 'Bunny', 'Tiger', 'Hedgehog'];
/** 144: index = adjective * 12 + animal (the key live.nick.<index>). */
export const NICK_COUNT = ADJECTIVES.length * ANIMALS.length;
export const nickKey = i => `live.nick.${i}`;
/** Rerolls per seat: 10 a minute. */
export const REROLLS = { max: 10, windowMs: 60e3 };

/** A random index nobody in the session has (used: a Set of indexes). Every phrase taken (more than 144 seats): any. */
export function pickNick(used = new Set()) {
  if (used.size >= NICK_COUNT) return crypto.randomInt(NICK_COUNT);
  for (;;) { const i = crypto.randomInt(NICK_COUNT); if (!used.has(i)) return i; }
}
/** May this seat pick another nickname now? (key: the seat's nonce) */
export const mayReroll = key => allow(`lv-nick:${key}`, REROLLS.max, REROLLS.windowMs);

const any = list => list[crypto.randomInt(list.length)];
/** A random character spec from the shared avatar's own lists (checked like a saved one). */
export function randomAvatar() {
  const species = any(CHARACTER.species);
  const spec = { species, body: any(CHARACTER.body), mood: any(CHARACTER.eyes), colors: { base: any(CHARACTER.color), accent: any(CHARACTER.color) }, wear: crypto.randomInt(3) ? [] : [any(CHARACTER.accessory)], bold: { wear: [] } };
  if (species === 'kid') {
    spec.skin = crypto.randomInt(CHARACTER.skin);
    spec.hair = { style: any(CHARACTER.hair), color: any(CHARACTER.hairColor) };
    spec.outfit = { top: any(CHARACTER.top), color: any(CHARACTER.color) };
  }
  return cleanCharacter(spec);
}

const cache = new Map();
/** The 144 phrases in one language (for the frame's INIT.live.nicks and the page's own table). Cached per locale. */
export function nicksFor(locale) {
  let list = cache.get(locale);
  if (!list) { const t = tFor(locale); list = Array.from({ length: NICK_COUNT }, (_, i) => t(nickKey(i))); cache.set(locale, list); }
  return list;
}
export const _clearCache = () => cache.clear();
