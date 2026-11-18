// The text of a Word document (.docx), for Crossword's "upload a document" (docs/decisions.md "Crossword"). A .docx is a
// zip; its body is word/document.xml. This reads the zip's central directory, inflates that one entry (node:zlib) and
// turns the XML into plain text: a paragraph or table row a line, table cells apart by a tab (so a two-column
// vocabulary table reads "word<TAB>definition"), tabs and breaks kept. No outside library; nothing is stored.
import zlib from 'node:zlib';

export const DOCX_MAX = 5 * 1024 * 1024, XML_MAX = 20 * 1024 * 1024;

/** The bytes of one entry of a zip (stored or deflated), or null. */
function zipEntry(buf, want) {
  // End of central directory: the last 22-65557 bytes.
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) return null;
  const count = buf.readUInt16LE(eocd + 10), dirAt = buf.readUInt32LE(eocd + 16);
  let p = dirAt;
  for (let n = 0; n < count && p + 46 <= buf.length; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) return null;
    const method = buf.readUInt16LE(p + 10), size = buf.readUInt32LE(p + 20), full = buf.readUInt32LE(p + 24);
    const nameLen = buf.readUInt16LE(p + 28), extraLen = buf.readUInt16LE(p + 30), commentLen = buf.readUInt16LE(p + 32), local = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);
    if (name === want) {
      if (local + 30 > buf.length || buf.readUInt32LE(local) !== 0x04034b50 || full > XML_MAX) return null;
      const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28), data = buf.subarray(start, start + size);
      if (method === 0) return data;
      if (method === 8) { try { return zlib.inflateRawSync(data, { maxOutputLength: XML_MAX }); } catch { return null; } }
      return null;
    }
    p += 46 + nameLen + extraLen + commentLen;
  }
  return null;
}
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const decode = s => s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (m, e) => (e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : +e.slice(1)) : ENT[e.toLowerCase()]));
/** A .docx file (Buffer) -> its text, or null when it isn't one (an old .doc, a damaged file). */
export function docxText(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 30 || buf.length > DOCX_MAX || buf.readUInt32LE(0) !== 0x04034b50) return null;
  const xml = zipEntry(buf, 'word/document.xml');
  if (!xml) return null;
  const s = xml.toString('utf8');
  const body = (/<w:body[^>]*>([\s\S]*)<\/w:body>/.exec(s) || [])[1];
  if (body === undefined) return null;
  return decode(body
    .replace(/<w:tab\/>|<w:tab [^>]*\/>/g, '\t')
    .replace(/<w:br\/>|<w:br [^>]*\/>|<w:cr\/>/g, '\n')
    .replace(/<\/w:p>\s*<\/w:tc>/g, '\t').replace(/<\/w:tc>/g, '\t')
    .replace(/<\/w:p>|<\/w:tr>/g, '\n')
    .replace(/<w:instrText[^>]*>[\s\S]*?<\/w:instrText>/g, '')
    .replace(/<[^>]+>/g, ''))
    .split('\n').map(l => l.replace(/\t+$/, '').replace(/[  ]+/g, ' ').trim()).filter(Boolean)
    .join('\n').trim();
}
