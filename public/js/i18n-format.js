// ICU-lite message formatting, shared by the server (server/i18n/index.js) and the browser (public/js/i18n.js).
// No DOM and no Node APIs here, so both sides run the exact same code.
//
// Syntax (a small, standard subset of ICU MessageFormat):
//   {name}                                   a placeholder; numbers are formatted for the locale (1,234 / 1.234 / ١٬٢٣٤)
//   {count, plural, one {# play} other {# plays}}
//                                            plural forms chosen with Intl.PluralRules for the locale
//                                            (zero, one, two, few, many, other; "=0", "=1"... match exact numbers);
//                                            "#" inside a form is the formatted number
//   {kind, select, game {...} other {...}}   pick a form by a text value
// There is no escaping: a translation must not contain a literal "{" or "}".

const cache = new Map();
const nf = new Map();
const pr = new Map();
const numberFormat = locale => { let f = nf.get(locale); if (!f) { try { f = new Intl.NumberFormat(locale); } catch { f = new Intl.NumberFormat('en'); } nf.set(locale, f); } return f; };
const pluralRules = locale => { let f = pr.get(locale); if (!f) { try { f = new Intl.PluralRules(locale); } catch { f = new Intl.PluralRules('en'); } pr.set(locale, f); } return f; };

/** Parse a message into parts: string | { v } | { v, kind: 'plural'|'select', forms: { key: parts } } | { hash: true }. Throws on bad syntax. */
export function parse(src) {
  src = String(src);
  let i = 0;
  const fail = msg => { throw new Error(`${msg} at ${i} in "${src}"`); };
  function message(depth, inPlural) {
    const parts = []; let buf = '';
    while (i < src.length) {
      const c = src[i];
      if (c === '}') { if (!depth) fail('Unexpected }'); break; }
      if (c === '#' && inPlural) { if (buf) { parts.push(buf); buf = ''; } parts.push({ hash: true }); i++; continue; }
      if (c === '{') { if (buf) { parts.push(buf); buf = ''; } parts.push(argument()); continue; }
      buf += c; i++;
    }
    if (buf) parts.push(buf);
    return parts;
  }
  function word() { const m = /^\s*([^\s,{}]+)\s*/.exec(src.slice(i)); if (!m) fail('Expected a name'); i += m[0].length; return m[1]; }
  function argument() {
    i++; // {
    const v = word();
    if (src[i] === '}') { i++; return { v }; }
    if (src[i] !== ',') fail('Expected , or }');
    i++;
    const kind = word();
    if (kind !== 'plural' && kind !== 'select') fail(`Unknown type "${kind}"`);
    if (src[i] !== ',') fail('Expected ,');
    i++;
    const forms = {};
    for (;;) {
      while (/\s/.test(src[i] || '')) i++;
      if (src[i] === '}') { i++; break; }
      if (i >= src.length) fail('Unclosed {');
      const key = word();
      if (src[i] !== '{') fail('Expected { after a form name');
      i++;
      forms[key] = message(1, kind === 'plural');
      if (src[i] !== '}') fail('Unclosed form');
      i++;
    }
    if (!forms.other) fail(`A ${kind} needs an "other" form`);
    return { v, kind, forms };
  }
  const out = message(0, false);
  if (i < src.length) fail('Unexpected }');
  return out;
}

function parsed(msg) {
  let p = cache.get(msg);
  if (!p) { try { p = parse(msg); } catch { p = [String(msg)]; } if (cache.size < 5000) cache.set(msg, p); }
  return p;
}

function render(parts, vars, locale, n) {
  let out = '';
  for (const p of parts) {
    if (typeof p === 'string') out += p;
    else if (p.hash) out += numberFormat(locale).format(n);
    else if (!p.kind) {
      const val = vars[p.v];
      if (val === undefined || val === null) out += `{${p.v}}`;
      else out += typeof val === 'number' && Number.isFinite(val) ? numberFormat(locale).format(val) : String(val);
    } else if (p.kind === 'plural') {
      const num = Number(vars[p.v]) || 0;
      const forms = p.forms;
      const form = forms[`=${num}`] || forms[pluralRules(locale).select(num)] || forms.other;
      out += render(form, vars, locale, num);
    } else {
      const form = p.forms[String(vars[p.v])] || p.forms.other;
      out += render(form, vars, locale, n);
    }
  }
  return out;
}

/** Format a message with values. locale is a BCP 47 tag for Intl (e.g. "fr", "ar-u-nu-latn"). */
export function format(msg, vars = {}, locale = 'en') {
  if (msg === undefined || msg === null) return '';
  msg = String(msg);
  if (!msg.includes('{') && !msg.includes('#')) return msg;
  return render(parsed(msg), vars || {}, locale, 0);
}

/** Placeholder names used by a message (plural/select names included), sorted. Throws on bad syntax. */
export function placeholders(msg) {
  const names = new Set();
  const walk = parts => { for (const p of parts) { if (typeof p === 'string' || p.hash) continue; names.add(p.v); if (p.forms) for (const f of Object.values(p.forms)) walk(f); } };
  walk(parse(msg));
  return [...names].sort();
}
/**
 * Which placeholders a translation must keep. -> { required: [...], optional: [...] }
 *  required: shown to the reader ({name}, or a plural whose forms print the number with #)
 *  optional: only picks a plural/select form; a language without plurals (Japanese, Chinese) may drop it
 */
export function placeholderInfo(msg) {
  const required = new Set(), seen = new Set();
  const walk = parts => {
    for (const p of parts) {
      if (typeof p === 'string' || p.hash) continue;
      seen.add(p.v);
      if (!p.kind) { required.add(p.v); continue; }
      const forms = Object.values(p.forms);
      if (p.kind === 'plural' && forms.some(f => f.some(x => x && x.hash))) required.add(p.v);
      forms.forEach(walk);
    }
  };
  walk(parse(msg));
  return { required: [...required].sort(), optional: [...seen].filter(v => !required.has(v)).sort() };
}
