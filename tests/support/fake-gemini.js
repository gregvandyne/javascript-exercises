// A stand-in for Google's Gemini image model (server/services/storybook-gemini.js hooks.generate), for the book maker's
// tests and screenshots. It answers in Google's generateContent shape with a clearly fake but friendly placeholder
// picture: a PNG painted here (a soft sky, a sun, rolling hills, and a round little creature for each character the
// prompt lists, in its spot), so the editor's states can be seen. It records every request it was sent.
import zlib from 'node:zlib';

const CRC = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
const crc32 = b => { let c = -1; for (const x of b) c = CRC[(c ^ x) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type, 'ascii'), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc32(td)); return Buffer.concat([len, td, c]); };
/** RGB pixels (Uint8Array w*h*3) -> PNG bytes. */
export function png(w, h, px) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 3 + 1)] = 0; Buffer.from(px.buffer, px.byteOffset + y * w * 3, w * 3).copy(raw, y * (w * 3 + 1) + 1); }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
const hash = s => { let h = 2166136261; for (const ch of String(s)) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619) >>> 0; } return h; };
const SKIES = [[[255, 214, 170], [178, 222, 236]], [[250, 232, 190], [196, 226, 214]], [[204, 222, 250], [255, 236, 210]], [[235, 205, 226], [255, 230, 196]], [[40, 52, 104], [120, 104, 160]]];
const HILLS = [[[150, 196, 132], [110, 168, 110]], [[196, 210, 140], [140, 182, 120]], [[170, 200, 170], [120, 170, 150]]];
const BODIES = [[236, 128, 84], [120, 170, 220], [244, 196, 92], [170, 140, 210], [120, 190, 150], [236, 150, 170]];

/** A placeholder picture: { w, h } and what the prompt says (the characters and their spots, the mood). -> PNG */
export function paint(prompt, { w = 1024, h = 576 } = {}) {
  const px = new Uint8Array(w * h * 3), seed = hash(prompt);
  const night = /Mood: a calm, friendly night/.test(prompt);
  const sky = night ? SKIES[4] : SKIES[seed % 4], hills = HILLS[(seed >>> 4) % HILLS.length];
  const sheet = /character reference picture/.test(prompt);
  const set = (x, y, c, a = 1) => { if (x < 0 || y < 0 || x >= w || y >= h) return; const i = (y * w + x) * 3; for (let k = 0; k < 3; k++) px[i + k] = Math.round(px[i + k] * (1 - a) + c[k] * a); };
  for (let y = 0; y < h; y++) {
    const t = y / h; const c = sky[0].map((v, k) => v + (sky[1][k] - v) * t);
    for (let x = 0; x < w; x++) { const n = ((hash(`${x >> 2},${y >> 2}`) & 15) - 8) * 0.6; set(x, y, c.map(v => Math.max(0, Math.min(255, v + n)))); }
  }
  const disc = (cx, cy, r, c, a = 1, ry = r) => { for (let y = Math.floor(cy - ry); y <= cy + ry; y++) for (let x = Math.floor(cx - r); x <= cx + r; x++) { const d = ((x - cx) / r) ** 2 + ((y - cy) / ry) ** 2; if (d <= 1) set(x, y, c, a * Math.min(1, (1 - d) * 6)); } };
  if (!sheet) {
    disc(w * (0.15 + ((seed >>> 8) % 60) / 100), h * 0.2, h * 0.09, night ? [250, 246, 220] : [255, 236, 150], 0.95);
    for (const [k, base, amp, col] of [[0, 0.62, 0.05, hills[0]], [1, 0.74, 0.04, hills[1]]]) {
      for (let x = 0; x < w; x++) { const top = Math.round(h * (base + amp * Math.sin(x / w * Math.PI * (2 + k) + (seed % 7)))); for (let y = top; y < h; y++) set(x, y, col.map(v => v - (y - top) * 0.04)); }
    }
  } else disc(w / 2, h * 0.86, w * 0.22, [0, 0, 0], 0.12, h * 0.04);
  // the characters: "- Name: look; on the left" lines (a sheet: the one character, in the middle)
  const who = sheet ? [[(/called ([^:]+):/.exec(prompt) || [])[1] || 'x', 'center']] : [...prompt.matchAll(/^- ([^:]+):.*?; (?:on the )?(left|middle|right|in the middle)/gm)].map(m => [m[1], m[2] === 'in the middle' || m[2] === 'middle' ? 'center' : m[2]]);
  who.forEach(([name, pos]) => {
    const cx = (sheet ? 0.5 : pos === 'left' ? 0.24 : pos === 'right' ? 0.76 : 0.5) * w, base = sheet ? h * 0.86 : h * 0.86, s = sheet ? h * 0.3 : h * 0.17;
    const body = BODIES[hash(name) % BODIES.length], dark = body.map(v => v * 0.55);
    disc(cx, base + s * 0.05, s * 0.75, [0, 0, 0], 0.12, s * 0.12);
    disc(cx, base - s * 0.55, s * 0.62, body, 1, s * 0.6);
    disc(cx, base - s * 1.35, s * 0.48, body.map(v => Math.min(255, v + 18)));
    disc(cx - s * 0.32, base - s * 1.78, s * 0.14, body); disc(cx + s * 0.32, base - s * 1.78, s * 0.14, body);
    disc(cx - s * 0.17, base - s * 1.4, s * 0.06, dark); disc(cx + s * 0.17, base - s * 1.4, s * 0.06, dark);
    disc(cx - s * 0.3, base - s * 1.22, s * 0.08, [255, 170, 170], 0.6); disc(cx + s * 0.3, base - s * 1.22, s * 0.08, [255, 170, 170], 0.6);
    disc(cx, base - s * 1.2, s * 0.09, dark, 1, s * 0.045);
    disc(cx, base - s * 0.5, s * 0.35, [255, 250, 240], 0.55, s * 0.32);
  });
  return png(w, h, px);
}

/** Google's 429 answer body: 'rate-limited' (a per-minute quota, RetryInfo retryDelay `retry`) or 'quota-zero' (the
 *  free-tier quota with limit 0: billing not enabled on the key's project). */
export function googleError(kind, { retry = '2s' } = {}) {
  const zero = kind === 'quota-zero';
  const metric = zero ? 'generativelanguage.googleapis.com/generate_content_free_tier_requests' : 'generativelanguage.googleapis.com/generate_content_paid_tier_requests';
  const quotaId = zero ? 'GenerateRequestsPerDayPerProjectPerModel-FreeTier' : 'GenerateRequestsPerMinutePerProjectPerModel';
  return { error: { code: 429, status: 'RESOURCE_EXHAUSTED',
    message: `You exceeded your current quota, please check your plan and billing details.\n* Quota exceeded for metric: ${metric}, limit: ${zero ? 0 : 10}, model: gemini-3.1-flash-image\nPlease retry in ${parseFloat(retry)}s.`,
    details: [
      { '@type': 'type.googleapis.com/google.rpc.QuotaFailure', violations: [{ quotaMetric: metric, quotaId, quotaDimensions: { location: 'global', model: 'gemini-3.1-flash-image' }, quotaValue: zero ? '0' : '10' }] },
      { '@type': 'type.googleapis.com/google.rpc.Help', links: [{ description: 'Learn more about Gemini API quotas', url: 'https://ai.google.dev/gemini-api/docs/rate-limits' }] },
      { '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: retry },
    ] } };
}

/**
 * Install the stand-in: G.hooks.generate answers like Google. mode: 'ok' | 'blocked' (a finished candidate with
 * finishReason IMAGE_SAFETY) | 'prompt-blocked' (promptFeedback.blockReason) | 'error' (throws) | 'rate-limited' |
 * 'quota-zero' (an HTTP 429 with Google's error body, googleError; retry: the RetryInfo delay) | fn(body) -> mode.
 * -> { calls: [{ body, model, headers }], set(mode), delay(ms) }
 */
export function fakeGemini(G, { mode = 'ok', delayMs = 0, retry = '2s' } = {}) {
  const st = { calls: [], mode, delayMs, retry };
  G.hooks.generate = async (body, o) => {
    st.calls.push({ body, model: o.model, headers: o.headers });
    if (st.delayMs) await new Promise(r => setTimeout(r, st.delayMs));
    const m = typeof st.mode === 'function' ? st.mode(body) : st.mode;
    const usageMetadata = { promptTokenCount: 600, candidatesTokenCount: m === 'ok' ? 1120 : 0 };
    if (m === 'error') throw new Error('stub network error');
    if (m === 'rate-limited' || m === 'quota-zero') throw Object.assign(new Error('http 429'), { httpStatus: 429, body: googleError(m, { retry: st.retry }) });
    if (m === 'prompt-blocked') return { promptFeedback: { blockReason: 'SAFETY' }, usageMetadata };
    if (m === 'blocked') return { candidates: [{ finishReason: 'IMAGE_SAFETY', content: { parts: [] } }], usageMetadata };
    const text = body.contents[0].parts[0].text, sq = body.generationConfig.imageConfig.aspectRatio === '1:1';
    const data = paint(text, sq ? { w: 512, h: 512 } : { w: 1024, h: 576 }).toString('base64');
    return { candidates: [{ finishReason: 'STOP', content: { role: 'model', parts: [{ inlineData: { mimeType: 'image/png', data } }] } }], usageMetadata };
  };
  return { calls: st.calls, set: m => { st.mode = m; }, retry: r => { st.retry = r; }, delay: ms => { st.delayMs = ms; }, off: () => { G.hooks.generate = null; } };
}
