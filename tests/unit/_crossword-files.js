// Tiny PDF and Word files made in code, for Crossword's upload tests (crossword-upload.test.js) and screenshots.
import zlib from 'node:zlib';

/** A small PDF: one page per entry of `pages` (lines of text). compress: FlateDecode content; scanned: a picture only
 *  (no font); cid: a two-byte font with a ToUnicode map (as Word, Google Docs and browsers write them). */
export function makePdf(pages, { compress = true, scanned = false, cid = false } = {}) {
  const objs = [], add = o => { objs.push(o); return objs.length; };
  const catalog = add(''), tree = add('');
  const chars = [...new Set(pages.flat().join(''))], code = ch => chars.indexOf(ch) + 3;
  let font = 0;
  if (!scanned && cid) {
    const map = `/CIDInit /ProcSet findresource begin 12 dict begin begincmap 1 begincodespacerange <0000> <FFFF> endcodespacerange ${chars.length} beginbfchar\n${chars.map(ch => `<${code(ch).toString(16).padStart(4, '0')}> <${ch.charCodeAt(0).toString(16).padStart(4, '0')}>`).join('\n')}\nendbfchar endcmap end end`;
    const tu = add({ dict: `<< /Length ${map.length} >>`, data: Buffer.from(map, 'latin1') });
    font = add(`<< /Type /Font /Subtype /Type0 /BaseFont /ABCDEF+Calibri /Encoding /Identity-H /DescendantFonts [] /ToUnicode ${tu} 0 R >>`);
  } else if (!scanned) font = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  const kids = [];
  for (const lines of pages) {
    const show = l => (cid ? `<${[...l].map(ch => code(ch).toString(16).padStart(4, '0')).join('')}> Tj` : `(${l.replace(/[()\\]/g, '\\$&')}) Tj`);
    const body = scanned ? 'q 612 0 0 792 0 0 cm /Im0 Do Q' : `BT /F1 12 Tf 72 720 Td 14 TL\n${lines.map(l => `${show(l)} T*`).join('\n')}\nET`;
    const data = compress ? zlib.deflateSync(Buffer.from(body, 'latin1')) : Buffer.from(body, 'latin1');
    const content = add({ dict: `<< /Length ${data.length}${compress ? ' /Filter /FlateDecode' : ''} >>`, data });
    kids.push(add(`<< /Type /Page /Parent ${tree} 0 R /MediaBox [0 0 612 792] /Resources << ${scanned ? '/XObject << >>' : `/Font << /F1 ${font} 0 R >>`} >> /Contents ${content} 0 R >>`));
  }
  objs[catalog - 1] = `<< /Type /Catalog /Pages ${tree} 0 R >>`;
  objs[tree - 1] = `<< /Type /Pages /Kids [${kids.map(k => `${k} 0 R`).join(' ')}] /Count ${kids.length} >>`;
  const parts = [Buffer.from('%PDF-1.4\n', 'latin1')];
  objs.forEach((o, i) => parts.push(typeof o === 'string' ? Buffer.from(`${i + 1} 0 obj\n${o}\nendobj\n`, 'latin1')
    : Buffer.concat([Buffer.from(`${i + 1} 0 obj\n${o.dict}\nstream\n`, 'latin1'), o.data, Buffer.from('\nendstream\nendobj\n', 'latin1')])));
  parts.push(Buffer.from(`trailer\n<< /Size ${objs.length + 1} /Root ${catalog} 0 R >>\n%%EOF\n`, 'latin1'));
  return Buffer.concat(parts);
}
/** A .docx: a zip (deflated) with word/document.xml holding these paragraphs. */
export function makeDocx(paras) {
  const xml = paras.map(p => `<w:p><w:r><w:t xml:space="preserve">${p.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\t/g, '</w:t><w:tab/><w:t>')}</w:t></w:r></w:p>`).join('');
  const files = [['[Content_Types].xml', Buffer.from('<Types/>')], ['word/document.xml', Buffer.from(`<?xml version="1.0"?><w:document xmlns:w="w"><w:body>${xml}<w:sectPr/></w:body></w:document>`)]];
  const parts = [], dir = []; let off = 0;
  for (const [name, data] of files) {
    const z = zlib.deflateRawSync(data), n = Buffer.from(name), h = Buffer.alloc(30);
    h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(20, 4); h.writeUInt16LE(8, 8); h.writeUInt32LE(z.length, 18); h.writeUInt32LE(data.length, 22); h.writeUInt16LE(n.length, 26);
    const c = Buffer.alloc(46); c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(8, 10); c.writeUInt32LE(z.length, 20); c.writeUInt32LE(data.length, 24); c.writeUInt16LE(n.length, 28); c.writeUInt32LE(off, 42);
    parts.push(h, n, z); dir.push(c, n); off += 30 + n.length + z.length;
  }
  const d = Buffer.concat(dir), e = Buffer.alloc(22); e.writeUInt32LE(0x06054b50, 0); e.writeUInt16LE(files.length, 8); e.writeUInt16LE(files.length, 10); e.writeUInt32LE(d.length, 12); e.writeUInt32LE(off, 16);
  return Buffer.concat([...parts, d, e]);
}
