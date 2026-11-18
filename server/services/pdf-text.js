// What a PDF holds, for Crossword's "Upload a word list" (docs/decisions.md "Crossword: word lists from a PDF or Word
// file, with limits"): how many pages, whether it has any text at all (a scanned page is only a picture, with no
// fonts), and its text when it can be read here. No outside library: the file's objects are indexed (also those packed
// in object streams), streams are inflated with node:zlib (FlateDecode, or none), and each page's text operators (Tj,
// TJ, ', ") are read with the font's own ToUnicode map, as Word, Google Docs and browsers write them. Text that can't be
// read reliably here (a font without a map, an encrypted file) comes back as null, and the caller lets the model read
// the PDF itself. Nothing is stored. (builder/uploads.js pdfText is the Builder's older best-effort reader.)
import zlib from 'node:zlib';

export const PDF_MAX = 2 * 1024 * 1024, INFLATE_MAX = 16 * 1024 * 1024, TEXT_MAX = 60000;

/** The balanced <<...>>, [...] or (...) value starting at i of s, or the next token. -> [value, end] */
function valueAt(s, i) {
  while (/\s/.test(s[i] || '')) i++;
  if (s.startsWith('<<', i)) {
    let d = 0, j = i;
    while (j < s.length) {
      if (s.startsWith('<<', j)) { d++; j += 2; } else if (s.startsWith('>>', j)) { d--; j += 2; if (!d) break; }
      else if (s[j] === '(') j = literal(s, j)[1]; else j++;
    }
    return [s.slice(i, j), j];
  }
  if (s[i] === '[') { let d = 0, j = i; for (; j < s.length; j++) { if (s[j] === '[') d++; else if (s[j] === ']' && !--d) { j++; break; } } return [s.slice(i, j), j]; }
  const ref = /^(\d+)\s+(\d+)\s+R/.exec(s.slice(i, i + 32));
  if (ref) return [ref[0], i + ref[0].length];
  const tok = /^\/?[^\s/<>[\]()%]+/.exec(s.slice(i, i + 128));
  return tok ? [tok[0], i + tok[0].length] : ['', i];
}
/** The value of /key in the dictionary text d (its top level only), or ''. */
function get(d, key) {
  if (!d.startsWith('<<')) return '';
  let i = 2;
  while (i < d.length - 2) {
    if (d.startsWith('<<', i)) { const [, e] = valueAt(d, i); i = e; continue; }
    if (d[i] === '[') { const [, e] = valueAt(d, i); i = e; continue; }
    if (d[i] === '(') { i = literal(d, i)[1]; continue; }
    if (d[i] === '/') {
      const m = /^\/([^\s/<>[\]()%]+)/.exec(d.slice(i, i + 128));
      const [v, e] = valueAt(d, i + m[0].length);
      if (m[1] === key) return v;
      i = e; continue;
    }
    i++;
  }
  return '';
}
const refNum = v => { const m = /^(\d+)\s+\d+\s+R$/.exec(String(v).trim()); return m ? +m[1] : null; };

/** A literal string's bytes from "(" at i: -> [bytes, next index]. */
function literal(s, i) {
  const bytes = []; let depth = 1; i++;
  const esc = { n: 10, r: 13, t: 9, b: 8, f: 12, '(': 40, ')': 41, '\\': 92 };
  while (i < s.length) {
    const ch = s[i];
    if (ch === '\\') {
      const n = s[i + 1];
      if (n in esc) { bytes.push(esc[n]); i += 2; continue; }
      if (/[0-7]/.test(n || '')) { const o = /^[0-7]{1,3}/.exec(s.slice(i + 1, i + 4))[0]; bytes.push(parseInt(o, 8) & 255); i += 1 + o.length; continue; }
      if (n === '\r' || n === '\n') { i += n === '\r' && s[i + 2] === '\n' ? 3 : 2; continue; }
      i += 2; continue;
    }
    if (ch === '(') depth++;
    else if (ch === ')' && --depth === 0) return [bytes, i + 1];
    bytes.push(ch.charCodeAt(0) & 255); i++;
  }
  return [bytes, i];
}
const hexBytes = h => { const x = h.replace(/[^0-9a-f]/gi, ''), p = x.length % 2 ? x + '0' : x, b = []; for (let i = 0; i < p.length; i += 2) b.push(parseInt(p.slice(i, i + 2), 16)); return b; };
const utf16 = h => { const b = hexBytes(h); let o = ''; for (let i = 0; i + 1 < b.length; i += 2) o += String.fromCharCode((b[i] << 8) | b[i + 1]); return o; };

/** Every object of the file: Map(number -> { dict: string, data: Buffer|null (a stream, inflated) }). */
function objects(buf) {
  const s = buf.toString('latin1'), out = new Map();
  let total = 0;
  const inflate = (dict, raw) => {
    const filter = get(dict, 'Filter');
    if (!filter) return raw;
    if (!/^(\/FlateDecode|\[\s*\/FlateDecode\s*\])$/.test(filter.trim()) || total >= INFLATE_MAX) return null;
    try { const d = zlib.inflateSync(raw, { maxOutputLength: INFLATE_MAX - total, finishFlush: zlib.constants.Z_SYNC_FLUSH }); total += d.length; return d; } catch { return null; }
  };
  const re = /(\d+)\s+(\d+)\s+obj\b/g;
  for (let m; (m = re.exec(s));) {
    const start = m.index + m[0].length;
    const [dict, e] = valueAt(s, start);
    let data = null;
    const sm = /^\s*stream\r?\n/.exec(s.slice(e, e + 20));
    if (sm && dict.startsWith('<<')) {
      const from = e + sm[0].length, len = +get(dict, 'Length');
      const exact = Number.isInteger(len) && len > 0 && /^\s*endstream/.test(s.slice(from + len, from + len + 16));
      let to = exact ? from + len : s.indexOf('endstream', from);
      if (to < 0) to = s.length;
      let raw = buf.subarray(from, to);
      if (!exact) { if (raw[raw.length - 1] === 0x0a) raw = raw.subarray(0, raw.length - (raw[raw.length - 2] === 0x0d ? 2 : 1)); else if (raw[raw.length - 1] === 0x0d) raw = raw.subarray(0, raw.length - 1); }
      data = inflate(dict, raw);
      re.lastIndex = to;
    }
    out.set(+m[1], { dict, data });
  }
  // Objects packed in object streams (PDF 1.5).
  for (const o of [...out.values()]) {
    if (!o.data || get(o.dict, 'Type') !== '/ObjStm') continue;
    const n = +get(o.dict, 'N'), first = +get(o.dict, 'First'), body = o.data.toString('latin1');
    const head = body.slice(0, first).trim().split(/\s+/).map(Number);
    for (let k = 0; k < n && 2 * k + 1 < head.length; k++) if (!out.has(head[2 * k])) out.set(head[2 * k], { dict: valueAt(body, first + head[2 * k + 1])[0], data: null });
  }
  return out;
}

/** A ToUnicode CMap's text -> { width (bytes a code), map: Map(code -> text) }. */
function cmap(s) {
  const map = new Map(); let width = 0;
  const cs = /begincodespacerange\s*<([0-9a-fA-F]+)>/.exec(s); if (cs) width = cs[1].length / 2;
  for (const blk of s.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) for (const m of blk[1].matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]*)>/g)) { width ||= m[1].length / 2; map.set(parseInt(m[1], 16), utf16(m[2])); }
  for (const blk of s.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
    for (const m of blk[1].matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*(<[0-9a-fA-F]*>|\[[^\]]*\])/g)) {
      width ||= m[1].length / 2;
      const lo = parseInt(m[1], 16), hi = Math.min(parseInt(m[2], 16), lo + 4096);
      if (m[3][0] === '[') { const each = [...m[3].matchAll(/<([0-9a-fA-F]*)>/g)].map(x => utf16(x[1])); for (let c = lo; c <= hi && c - lo < each.length; c++) map.set(c, each[c - lo]); }
      else { const base = utf16(m[3].slice(1, -1)); if (base) for (let c = lo; c <= hi; c++) map.set(c, base.slice(0, -1) + String.fromCharCode(base.charCodeAt(base.length - 1) + (c - lo))); }
    }
  }
  return { width: width || 1, map };
}
/** A font's decoder: bytes -> text. A simple font without a map reads as Latin-1 (WinAnsi's letters); a composite
 *  font (Type0) without a map can't be read here. */
function decoderFor(font, objs) {
  const d = font ? font.dict : '';
  const tu = refNum(get(d, 'ToUnicode')), cm = tu !== null && objs.get(tu) && objs.get(tu).data ? cmap(objs.get(tu).data.toString('latin1')) : null;
  if (!cm) return get(d, 'Subtype') === '/Type0' ? bytes => '�'.repeat(Math.ceil(bytes.length / 2)) : bytes => String.fromCharCode(...bytes);
  return bytes => {
    let o = '';
    for (let i = 0; i < bytes.length; i += cm.width) {
      let code = 0; for (let k = 0; k < cm.width; k++) code = (code << 8) | (bytes[i + k] || 0);
      o += cm.map.has(code) ? cm.map.get(code) : cm.width === 1 ? String.fromCharCode(code) : '�';
    }
    return o;
  };
}

/** The text of one page's content (latin1 string): fonts (name -> decoder). */
function contentText(s, fonts) {
  let out = '', i = 0, ops = [], lastY = null, lastX = null, mark = 0, size = 12, decode = bytes => String.fromCharCode(...bytes);
  const nl = () => { if (out && !out.endsWith('\n')) out += '\n'; };
  const space = () => { if (out && !/\s$/.test(out)) out += ' '; };
  while (i < s.length && out.length < TEXT_MAX) {
    const ch = s[i];
    if (ch === '(') { const [b, n] = literal(s, i); ops.push({ str: b }); i = n; continue; }
    if (ch === '<' && s[i + 1] !== '<') { const e = s.indexOf('>', i); if (e < 0) break; ops.push({ str: hexBytes(s.slice(i + 1, e)) }); i = e + 1; continue; }
    if (ch === '<' || ch === '>') { i += 2; continue; }
    if (ch === '[') { ops.push('['); i++; continue; }
    if (ch === ']') { const k = ops.lastIndexOf('['); const arr = k < 0 ? [] : ops.splice(k); arr.shift(); ops.push({ arr }); i++; continue; }
    if (ch === '%') { const e = s.indexOf('\n', i); i = e < 0 ? s.length : e + 1; continue; }
    if (/\s/.test(ch)) { i++; continue; }
    if (ch === '/') { const m = /^\/[^\s/<>[\]()%{}]*/.exec(s.slice(i, i + 128)); ops.push({ name: m[0].slice(1) }); i += m[0].length; continue; }
    const num = /^[+-]?(\d+\.?\d*|\.\d+)/.exec(s.slice(i, i + 32));
    if (num) { ops.push(+num[0]); i += num[0].length; continue; }
    const op = /^[A-Za-z'"*]+/.exec(s.slice(i, i + 16));
    if (!op) { i++; continue; }
    i += op[0].length;
    const o = op[0], nums = ops.filter(x => typeof x === 'number'), last = ops[ops.length - 1];
    if (o === 'BI') { const e = s.indexOf('EI', i); i = e < 0 ? s.length : e + 2; }   // an inline picture
    else if (o === 'Tf') { const nm = ops.find(x => x && x.name); if (nums.length) size = Math.abs(nums[nums.length - 1]) || 12; if (nm) decode = fonts.get(nm.name) || (bytes => String.fromCharCode(...bytes)); }
    else if (o === 'Tj' && last && last.str) out += decode(last.str);
    else if (o === 'TJ' && last && last.arr) { for (const x of last.arr) { if (x && x.str) out += decode(x.str); else if (typeof x === 'number' && x < -180) space(); } }
    else if ((o === "'" || o === '"') && last && last.str) { nl(); out += decode(last.str); }
    else if (o === 'T*') nl();
    // A move down starts a line. A move along the line is only positioning (word processors and browsers write the
    // spaces as characters), unless a new text matrix jumps clearly past the text written since the last one.
    else if ((o === 'Td' || o === 'TD') && nums.length >= 2) { const ty = nums[nums.length - 1]; if (Math.abs(ty) > 0.5) { nl(); if (lastY !== null) lastY += ty; } }
    else if (o === 'Tm' && nums.length >= 6) {
      const x = nums[nums.length - 2], y = nums[nums.length - 1], scale = Math.abs(nums[nums.length - 6]) || 1;
      if (lastY !== null && Math.abs(y - lastY) > 0.5) nl();
      else if (lastX !== null && (x - lastX) / scale > (out.length - mark) * size * 0.6 + size * 0.3) space();
      lastY = y; lastX = x; mark = out.length;
    }
    ops = [];
  }
  return out;
}

/** Is this text people could read (not glyph numbers or noise)? */
export function readable(text) {
  const t = String(text || '').replace(/\s+/g, '');
  if (t.length < 3) return false;
  const good = (t.match(/[\p{L}\p{M}\p{N}\p{P}\p{S}]/gu) || []).length, bad = (t.match(/[�\u0000-\u001f\u007f-\u009f-]/g) || []).length;
  return bad / t.length < 0.03 && good / t.length > 0.9 && (t.match(/\p{L}/gu) || []).length / t.length > 0.5;
}

/**
 * A PDF (Buffer) -> { pages, text: string|null, fonts: bool, encrypted: bool } or null when it isn't a PDF.
 * pages: how many pages it has; fonts: whether any page can hold text (none: a scanned picture); text: its text, a line
 * a line ('' when there is none), or null when it can't be read here (the caller then lets the model read the PDF).
 * max: the largest file read (2 MB, Crossword's limit; the Builder's "Your lesson" step reads up to 5 MB).
 */
export function pdfInfo(buf, { max = PDF_MAX } = {}) {
  if (!Buffer.isBuffer(buf) || buf.length < 8 || buf.length > max || buf.subarray(0, 5).toString('latin1') !== '%PDF-') return null;
  const objs = objects(buf);
  const pageList = [...objs.values()].filter(o => get(o.dict, 'Type') === '/Page');
  const roots = [...objs.values()].filter(o => get(o.dict, 'Type') === '/Pages' && !get(o.dict, 'Parent')).map(o => +get(o.dict, 'Count')).filter(Number.isInteger);
  const pages = Math.max(pageList.length, roots.length ? Math.max(...roots) : 0);
  const encrypted = /\/Encrypt\b/.test(buf.subarray(Math.max(0, buf.length - 4096)).toString('latin1')) || [...objs.values()].some(o => get(o.dict, 'Encrypt') || get(o.dict, 'Filter') === '/Standard');
  const resOf = o => {
    for (let n = 0, p = o; p && n < 20; n++) {
      const r = get(p.dict, 'Resources');
      if (r) return refNum(r) !== null ? (objs.get(refNum(r)) || {}).dict || '' : r;
      p = objs.get(refNum(get(p.dict, 'Parent')));
    }
    return '';
  };
  const fontDictOf = res => { const f = get(res, 'Font'); return refNum(f) !== null ? (objs.get(refNum(f)) || {}).dict || '' : f; };
  const fonts = pageList.some(p => fontDictOf(resOf(p)).length > 4);
  if (encrypted || !fonts) return { pages, text: null, fonts, encrypted };
  let text = '';
  for (const p of pageList) {
    const fd = fontDictOf(resOf(p)), dec = new Map();
    for (const m of fd.matchAll(/\/([^\s/<>[\]()%]+)\s+(\d+)\s+\d+\s+R/g)) dec.set(m[1], decoderFor(objs.get(+m[2]), objs));
    const c = get(p.dict, 'Contents'), parts = c.startsWith('[') ? [...c.matchAll(/(\d+)\s+\d+\s+R/g)].map(m => +m[1]) : [refNum(c)];
    const body = parts.map(n => objs.get(n)).filter(o => o && o.data).map(o => o.data.toString('latin1')).join('\n');
    text += contentText(body, dec) + '\n';
    if (text.length >= TEXT_MAX) break;
  }
  text = text.replace(/\u0000/g, '').split('\n').map(l => l.replace(/[  ]+/g, ' ').trim()).filter(Boolean).join('\n').slice(0, TEXT_MAX);
  return { pages, text: !text ? '' : readable(text) ? text : null, fonts, encrypted };
}
