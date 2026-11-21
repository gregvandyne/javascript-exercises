// Figures: the notice an exported PNG carries (docs/figures-api.md "The notice on exported figures"). The SVG export uses
// OF.withNotice (SVG <metadata>); a PNG gets the same words as a tEXt "Copyright" chunk and as XMP (an iTXt chunk,
// "XML:com.adobe.xmp": dc:rights, xmpRights:WebStatement and cc:license), both right after the image header, as image
// tools and search engines read them. Pure bytes in, bytes out, so the tests check the file itself.
export const CC0_URL = 'https://creativecommons.org/publicdomain/zero/1.0/';
const SIG = [137, 80, 78, 71, 13, 10, 26, 10];
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
export function crc32(bytes) { let c = 0xFFFFFFFF; for (let i = 0; i < bytes.length; i++) c = CRC[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
const latin1 = s => Uint8Array.from(String(s), ch => { const c = ch.charCodeAt(0); return c < 256 ? c : 63; });
const utf8 = s => new TextEncoder().encode(String(s));
const cat = (...parts) => { const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0)); let o = 0; for (const p of parts) { out.set(p, o); o += p.length; } return out; };
const u32 = n => Uint8Array.of((n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255);
/** One PNG chunk: length, type, data, CRC (of type and data). */
export function pngChunk(type, data) { const td = cat(latin1(type), data); return cat(u32(data.length), td, u32(crc32(td))); }
const xml = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
/** The XMP packet: the notice as dc:rights, the deed as the web statement and the license. */
export function xmpPacket(notice) {
  return `<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?><x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">`
    + `<rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:xmpRights="http://ns.adobe.com/xap/1.0/rights/" xmlns:cc="http://creativecommons.org/ns#">`
    + `<dc:rights><rdf:Alt><rdf:li xml:lang="x-default">${xml(notice)}</rdf:li></rdf:Alt></dc:rights><xmpRights:Marked>False</xmpRights:Marked>`
    + `<xmpRights:WebStatement>${CC0_URL}</xmpRights:WebStatement><cc:license rdf:resource="${CC0_URL}"/></rdf:Description></rdf:RDF></x:xmpmeta><?xpacket end="r"?>`;
}
/** A PNG (bytes) with the notice in it, after its IHDR chunk. Anything that is not a PNG is refused. */
export function pngWithNotice(png, notice) {
  const b = png instanceof Uint8Array ? png : new Uint8Array(png);
  if (b.length < 33 || SIG.some((x, i) => b[i] !== x) || String.fromCharCode(...b.slice(12, 16)) !== 'IHDR') throw new Error('not a PNG');
  const end = 8 + 12 + ((b[8] << 24) | (b[9] << 16) | (b[10] << 8) | b[11]);
  const text = pngChunk('tEXt', cat(latin1('Copyright'), Uint8Array.of(0), latin1(notice)));
  const itxt = pngChunk('iTXt', cat(latin1('XML:com.adobe.xmp'), Uint8Array.of(0, 0, 0, 0, 0), utf8(xmpPacket(notice))));
  return cat(b.slice(0, end), text, itxt, b.slice(end));
}
/** The text chunks of a PNG: { keyword: text } (tEXt, and iTXt without compression), for the tests and the checks. */
export function pngText(png) {
  const b = png instanceof Uint8Array ? png : new Uint8Array(png), out = {};
  for (let o = 8; o + 12 <= b.length;) {
    const n = ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0, type = String.fromCharCode(...b.slice(o + 4, o + 8)), d = b.slice(o + 8, o + 8 + n);
    const crcOk = crc32(b.slice(o + 4, o + 8 + n)) === (((b[o + 8 + n] << 24) | (b[o + 9 + n] << 16) | (b[o + 10 + n] << 8) | b[o + 11 + n]) >>> 0);
    if (type === 'tEXt' || type === 'iTXt') {
      const z = d.indexOf(0), key = String.fromCharCode(...d.slice(0, z));
      const rest = type === 'tEXt' ? String.fromCharCode(...d.slice(z + 1)) : (() => { let p = z + 3; p = d.indexOf(0, p) + 1; p = d.indexOf(0, p) + 1; return new TextDecoder().decode(d.slice(p)); })();
      out[key] = rest; if (!crcOk) out[`${key}:crc`] = 'bad';
    }
    if (type === 'IEND') break;
    o += 12 + n;
  }
  return out;
}
