// Simulate a language that hasn't translated some words yet: the keys are taken out of the loaded locale (the live
// dictionary the server reads, server/i18n/index.js dictionary()) while fn runs, then put back. Every locale has the
// words now, so this is how the English fallback (marked lang="en") stays covered without a stub locale file.
import { dictionary } from '../../server/i18n/index.js';

/** Run fn with every key equal to, or starting with, one of the prefixes missing from the code's dictionary. */
export async function withoutKeys(code, prefixes, fn) {
  const d = dictionary(code), saved = {};
  for (const k of Object.keys(d)) if (prefixes.some(p => k === p || k.startsWith(p.endsWith('.') ? p : p + '.'))) { saved[k] = d[k]; delete d[k]; }
  if (!Object.keys(saved).length) throw new Error(`withoutKeys: nothing to take out of ${code} for ${prefixes.join(', ')}`);
  try { return await fn(); } finally { Object.assign(d, saved); }
}
