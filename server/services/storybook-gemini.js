// The book maker's picture model (docs/storybook-builder.md "Pictures"; docs/decisions.md "Book pictures: Google's
// Gemini image model"): Google's Gemini API (generativelanguage.googleapis.com, REST, the key in the x-goog-api-key
// header, never in a URL or a log) draws a book's character sheets and page pictures. The "kids book drawing skill" is
// ours, in this file:
//
//   - ONE HOUSE STYLE (HOUSE_STYLE): a warm picture-book look (soft gouache and watercolor, gentle colors, simple shapes,
//     friendly faces), the rules every picture keeps (no words or letters in the picture, no logos, no real people, no
//     characters from films, books or games, nothing scary or violent), and a per-book style seed (styleOf: one palette,
//     paper and light picked from the book's id) so every picture of one book matches. No artist or book series is named.
//   - CHARACTER SHEETS FIRST (sheetPrompt): each cast member once, in a neutral pose on a plain background, from the
//     words Oomba wrote for how they look. Those pictures go with every page that shows the character, as reference
//     images (inline data), so a character looks the same on every page.
//   - PAGE PICTURES (pagePrompt): the page's scene in words (where, who, what they do, the mood), the composition (a wide
//     picture, the characters clear, a calm quiet area kept free), and the teacher's Redraw note.
//
// What is sent: these prompts (the house style, the scene and character words, which passed the book's word rules and
// had the teacher's students' names taken out) and the book's own character sheets. Never a student's name or work,
// never the teacher's name, never a class. Pictures that come back are checked by the caller (storybook-draw.js).
import { config } from '../config.js';

/** Test hook: generate(body, { model }) stands in for Google (returns the parsed JSON answer, or throws). */
export const hooks = { generate: null };
export const API = 'https://generativelanguage.googleapis.com/v1beta';
const TIMEOUT_MS = 90e3;

/** Is the picture model there at all (a key, or the test stand-in)? */
export const configured = () => !!(hooks.generate || config.geminiKey);
export const model = () => config.storybookImageModel || 'gemini-3.1-flash-image';

export const HOUSE_STYLE = [
  'Style: a warm, hand-painted children\'s picture book illustration. Soft gouache and watercolor with visible paper texture, gentle rounded shapes, simple clear forms, soft edges and light pencil outlines.',
  'Gentle, friendly colors; soft light; kind, happy or calm expressions with simple dot eyes and small smiles. Cozy, safe and age-appropriate for children aged 4 to 10.',
  'Rules for every picture: no words, letters, numbers, signs, captions or speech bubbles anywhere in the picture; no logos or brand marks; no real people, celebrities or public figures; no characters from films, television, books or games; nothing scary, violent, gory or sad-looking; no weapons; no photographic realism.',
].join(' ');

const PALETTES = ['warm peach, sage green and soft sky blue', 'buttery yellow, coral and mint', 'dusty rose, teal and cream', 'honey orange, leaf green and pale lilac', 'sky blue, sunflower yellow and warm sand', 'soft plum, apricot and moss green'];
const PAPERS = ['cream watercolor paper', 'warm off-white cotton paper', 'light speckled paper'];
const LIGHTS = ['soft morning light', 'warm afternoon light', 'gentle, even daylight'];
const hashOf = s => { let h = 2166136261; for (const ch of String(s)) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619) >>> 0; } return h; };
/** The book's style seed: the same palette, paper and light on every picture of one book. */
export function styleOf(bookId) {
  const h = hashOf(bookId);
  return { code: h.toString(16).padStart(8, '0'), palette: PALETTES[h % PALETTES.length], paper: PAPERS[(h >>> 8) % PAPERS.length], light: LIGHTS[(h >>> 16) % LIGHTS.length] };
}
const styleLine = s => `This book's own look (keep it on every picture of the book; style code ${s.code}): a palette of ${s.palette}, on ${s.paper}, in ${s.light}.`;

const MOOD_WORDS = { bright: 'bright and cheerful', warm: 'warm and cozy', dusk: 'a soft sunset glow', night: 'a calm, friendly night with a soft moon glow', gloomy: 'a gray, drizzly day that still feels safe', magic: 'a gentle, sparkly, magical feeling' };
const SPOT_WORDS = { left: 'on the left', center: 'in the middle', right: 'on the right' };
const clean = s => String(s || '').replace(/\s+/g, ' ').trim();

/** One character's reference sheet. c: { name, look, kind } (kind: what the art-pack sprite is, e.g. "fox"). */
export function sheetPrompt(c, style) {
  const look = clean(c.look) || `a friendly ${clean(c.kind) || 'character'}`;
  return [
    'Draw a character reference picture for a children\'s picture book.',
    HOUSE_STYLE,
    styleLine(style),
    `The character, called ${clean(c.name)}: ${look}.`,
    'Show this one character only, full body, standing in a neutral, relaxed, friendly pose, facing slightly to the side, centered, on a plain, light, empty background with a soft shadow under the feet. No other characters, no scenery, no props unless they are part of how the character looks.',
  ].join('\n');
}

/**
 * One page's picture. p: { scene, setting, mood, chars: [{ name, look, kind, pos, ref: bool }], note }.
 * The characters with ref: true have a reference picture sent with the prompt, in the same order.
 */
export function pagePrompt(p, style) {
  const who = p.chars.map(c => `- ${clean(c.name)}: ${clean(c.look) || `a friendly ${clean(c.kind) || 'character'}`}; ${SPOT_WORDS[c.pos] || 'in the picture'}${c.ref ? ' (draw them exactly as in their reference picture: same shape, colors and clothes)' : ''}.`);
  return [
    'Draw one illustration for a page of a children\'s picture book.',
    HOUSE_STYLE,
    styleLine(style),
    `What happens: ${clean(p.scene)}`,
    p.setting ? `Where: ${clean(p.setting)}.` : '',
    `Mood: ${MOOD_WORDS[p.mood] || MOOD_WORDS.bright}.`,
    who.length ? `Who is in the picture (only these characters):\n${who.join('\n')}` : 'No characters are in this picture: show the place.',
    'Composition: a wide picture, the characters clearly visible and not cut off, simple readable shapes, and a calm, quiet, uncluttered area of sky or ground kept free so the picture feels restful on the page.',
    p.note ? `The teacher asks for this change: ${clean(p.note)}` : '',
  ].filter(Boolean).join('\n');
}

const SAFETY = ['HARM_CATEGORY_HARASSMENT', 'HARM_CATEGORY_HATE_SPEECH', 'HARM_CATEGORY_SEXUALLY_EXPLICIT', 'HARM_CATEGORY_DANGEROUS_CONTENT']
  .map(category => ({ category, threshold: 'BLOCK_LOW_AND_ABOVE' }));
/**
 * The generateContent request body: the prompt, then each reference picture (a short label, then the picture as
 * inlineData), the answer asked for as an image only, the aspect ratio and size, and the strictest safety settings.
 * refs: [{ label, mime, bytes }]
 */
export function requestBody({ prompt, refs = [], aspect = '16:9' }) {
  const parts = [{ text: prompt }];
  refs.forEach((r, i) => parts.push({ text: `Reference picture ${i + 1}: ${clean(r.label)}.` }, { inlineData: { mimeType: r.mime, data: Buffer.from(r.bytes).toString('base64') } }));
  return {
    contents: [{ role: 'user', parts }],
    generationConfig: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: aspect, imageSize: '1K' } },
    safetySettings: SAFETY,
  };
}

const BLOCKED = new Set(['SAFETY', 'IMAGE_SAFETY', 'PROHIBITED_CONTENT', 'IMAGE_PROHIBITED_CONTENT', 'BLOCKLIST', 'SPII', 'RECITATION', 'IMAGE_RECITATION', 'IMAGE_OTHER', 'OTHER']);
/** Google's answer -> { ok: true, bytes, mime, usage } | { ok: false, code: 'blocked' | 'error', why, usage }. */
export function readAnswer(j) {
  const usage = (j && j.usageMetadata) || null;
  if (!j || typeof j !== 'object') return { ok: false, code: 'error', why: 'empty', usage };
  const pf = j.promptFeedback || {};
  if (pf.blockReason) return { ok: false, code: 'blocked', why: String(pf.blockReason), usage };
  const cand = Array.isArray(j.candidates) ? j.candidates[0] : null;
  const parts = (cand && cand.content && Array.isArray(cand.content.parts)) ? cand.content.parts : [];
  for (const p of parts) {
    const d = p && (p.inlineData || p.inline_data);
    if (d && d.data && /^image\//.test(d.mimeType || d.mime_type || '')) return { ok: true, bytes: Buffer.from(d.data, 'base64'), mime: d.mimeType || d.mime_type, usage };
  }
  const reason = cand && cand.finishReason ? String(cand.finishReason) : '';
  return { ok: false, code: !cand || BLOCKED.has(reason) || (reason && reason !== 'STOP' && reason !== 'MAX_TOKENS') ? 'blocked' : 'error', why: reason || 'no image', usage };
}

/** Ask Google for one picture. -> readAnswer's result, or { ok: false, code: 'error' | 'nokey', why } (nothing came back). */
export async function generate({ prompt, refs = [], aspect = '16:9' }) {
  const body = requestBody({ prompt, refs, aspect });
  if (hooks.generate) {
    try { return readAnswer(await hooks.generate(body, { model: model(), headers: { 'x-goog-api-key': 'stub' } })); } catch (e) { return { ok: false, code: 'error', why: String(e && e.message || e).slice(0, 80) }; }
  }
  if (!config.geminiKey) return { ok: false, code: 'nokey', why: 'no key' };
  let res;
  try {
    res = await fetch(`${API}/models/${encodeURIComponent(model())}:generateContent`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': config.geminiKey },
      body: JSON.stringify(body), signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (e) { return { ok: false, code: 'error', why: e && e.name === 'TimeoutError' ? 'timeout' : 'network' }; }
  const j = await res.json().catch(() => null);
  if (!res.ok) {
    // A prompt Google refuses for safety comes back as a 400 with a safety reason in some versions: the same as a block.
    const msg = String((j && j.error && (j.error.status || j.error.message)) || '').slice(0, 120);
    return { ok: false, code: res.status === 400 && /safety|prohibited|blocked/i.test(msg) ? 'blocked' : 'error', why: `http ${res.status}` };
  }
  return readAnswer(j);
}
