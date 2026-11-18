// Classroom dashboards: numbers typed, not only stepped (docs/decisions.md "Classroom dashboards: type the number between
// − and +"). Every − value + on the board shows its value in one shared field: tap or click it and type. The field keeps
// the widget's own rules: the same limits and the same set() the − and + buttons use, so a typed value is kept, saved in
// the layout and sent to students exactly as a tapped one is.
//   - A value inside the limits is used while typing; Enter or leaving the field uses what is there, held to the
//     limits (150 in a 1-100 field is 100); Escape puts back the value from before typing started.
//   - Empty or not a number: the last good value (the one from before typing) comes back, nothing else changes.
//   - ArrowUp and ArrowDown step by one (the + and − buttons' own steps).
//   - A rule that ties two numbers together (a numerator never more than its denominator) is kept from the state as it
//     was when typing started (snap/restore): typing 12 into a denominator of 50 passes through 1 without leaving the
//     numerator at 1.
//   - A widget that draws itself again while a value is being typed (the fraction sentence, the scoreboard) gets the
//     typing carried over to its new field (same key): the text, the caret and the value from before.
// The parsing and the limits are pure (numText, numDecide), tested in tests/unit/dash-num.test.js.

/** A number as the field shows it: a real minus sign for negatives. */
export const numText = n => (n < 0 ? `−${-n}` : String(n));

/** Typed text -> a number, or null. Whole numbers by default (an optional minus, ASCII or −, and digits); dec: the
 *  number of decimal places allowed (a point or a comma), so 1,25 and 1.25 are both 1.25. Spaces are ignored. */
export function numParse(text, { dec = 0 } = {}) {
  const x = String(text ?? '').replace(/[\s  ]/g, '').replace(/^[−–]/, '-');
  if (!x) return null;
  const re = dec > 0 ? new RegExp(`^-?(\\d+([.,]\\d{0,${dec}})?|[.,]\\d{1,${dec}})$`) : /^-?\d+$/;
  if (!re.test(x)) return null;
  const n = Number(x.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

/** What to do with typed text: { kind: 'ok', n } (inside the limits), { kind: 'out', n, clamped } (a number outside
 *  them: clamped is the nearest limit) or { kind: 'bad' } (empty, or not a number). */
export function numDecide(text, min, max, parse = numParse) {
  const n = parse(text);
  if (n === null || !Number.isFinite(n)) return { kind: 'bad' };
  if (n < min || n > max) return { kind: 'out', n, clamped: Math.min(max, Math.max(min, n)) };
  return { kind: 'ok', n };
}

const val = v => (typeof v === 'function' ? v() : v);
let busy = 0;   // set() is running: the old field may be taken out of the page (its blur is not a commit)

/** The field. o:
 *   label         its name (aria-label)
 *   get()         the value now (a number)
 *   set(n, typing) use n (already inside the limits) and commit it: redraw, keep, say (typing: true while the value
 *                  is still being typed). Called with the state put back first when snap/restore are given.
 *   min, max      numbers or functions (read when a value is used)
 *   up(), down()  the + and − buttons' own steps (ArrowUp, ArrowDown); without them, set(get() ± 1) inside the limits
 *   snap(), restore(x)  copy and put back the state (rules that tie values together, see above)
 *   format(n)     the text shown (numText); parse(text) -> number or null (numParse)
 *   mask()        true: the value is hidden ("?"): the field shows ? and can't be typed in
 *   off           true: shown only (edit mode)
 *   key           a name that stays the same when the widget draws the field again
 *   cls           more classes; width: at least this many characters wide (it grows with what it holds)
 *   decimal       true: inputmode decimal; inputMode: another keyboard (a slope's "1/2" needs the ordinary one)
 *   out(n)        optional: a number outside the limits was typed (n, as typed; the nearest limit is used first), so
 *                  the widget can say why (the fractions' "That's as big as it goes") */
export function numField(o) {
  const fmt = o.format || numText, parse = o.parse || numParse;
  const inp = document.createElement('input');
  inp.type = 'text'; inp.className = `dash-num${o.cls ? ` ${o.cls}` : ''}`;
  inp.autocomplete = 'off'; inp.spellcheck = false; inp.dir = 'ltr';
  inp.setAttribute('autocapitalize', 'off'); inp.setAttribute('enterkeyhint', 'done');
  // A phone's number pad has no minus sign: a field that can go below zero gets the ordinary keyboard.
  inp.inputMode = o.inputMode || (o.decimal ? 'decimal' : val(o.min) < 0 ? 'text' : 'numeric');
  inp.setAttribute('role', 'spinbutton');
  inp.setAttribute('aria-label', o.label);
  if (o.key) inp.dataset.numkey = o.key;
  // As wide as what it holds (as the number it replaces was), never narrower than `width` characters (default 1).
  const fit = () => inp.style.setProperty('--num-ch', Math.max(o.width || 1, [...inp.value].length));
  let S = null;   // the typing under way: { base, orig, applied }
  const begin = () => { S = { base: o.snap ? o.snap() : undefined, orig: o.get(), applied: o.get() }; };
  const show = () => {
    const masked = o.mask && o.mask();
    inp.readOnly = !!(o.off || masked);
    inp.tabIndex = o.off ? -1 : 0;
    if (document.activeElement !== inp || masked) inp.value = masked ? '?' : fmt(o.get());
    fit();
    const v = o.get();
    if (masked) { inp.removeAttribute('aria-valuenow'); inp.setAttribute('aria-valuetext', '?'); }
    else { inp.setAttribute('aria-valuenow', String(v)); inp.setAttribute('aria-valuetext', fmt(v)); }
    inp.setAttribute('aria-valuemin', String(val(o.min))); inp.setAttribute('aria-valuemax', String(val(o.max)));
  };
  /** Use n: put the state back as it was when typing began (when it can be), then the widget's own set(). If the widget
   *  drew a new field for the same key, the typing moves to it. */
  const apply = (n, typing) => {
    const text = inp.value, a = inp.selectionStart, b = inp.selectionEnd;
    busy++;
    try { if (o.restore && S && S.base !== undefined) o.restore(o.snap ? JSON.parse(JSON.stringify(S.base)) : S.base); o.set(n, typing); }
    finally { busy--; }
    if (S) S.applied = n;
    if (!inp.isConnected && o.key) {
      const next = [...document.querySelectorAll('input.dash-num')].find(x => x.dataset.numkey === o.key && x !== inp && x.numAdopt);
      if (next) next.numAdopt(S, typing ? text : null, a, b);
    }
  };
  /** Enter or leaving: use what is typed (held to the limits), or put the last good value back (the one from before
   *  typing began: "2/5" in a slope field leaves the slope as it was, not at the 2 it passed through). */
  const finish = () => {
    if (inp.readOnly || !S) return;
    const d = numDecide(inp.value, val(o.min), val(o.max), parse), focused = document.activeElement === inp;
    // Not a number (or empty): the value from before typing comes back, as with Escape.
    const n = d.kind === 'ok' ? d.n : d.kind === 'out' ? d.clamped : S.orig;
    if (n !== S.applied) apply(n, false);
    if (d.kind === 'out' && o.out) {
      busy++; try { o.out(d.n); } finally { busy--; }
      // The widget drew the field again to say why: the focus goes on in the new one (Enter, not leaving the field).
      const next = focused && !inp.isConnected && o.key && [...document.querySelectorAll('input.dash-num')].find(x => x.dataset.numkey === o.key && x.isConnected && x.numAdopt);
      if (next && document.activeElement !== next) next.numAdopt(null, null);
    }
    inp.removeAttribute('aria-invalid');
    if (inp.isConnected) { inp.value = fmt(o.get()); fit(); begin(); }
  };
  // A tap or a click puts the whole number in the selection, so typing replaces it (the mouseup that would put the caret
  // back is skipped once).
  let tapped = false;
  inp.addEventListener('pointerdown', () => { tapped = document.activeElement !== inp; });
  inp.addEventListener('mouseup', e => { if (tapped) { tapped = false; if (!inp.readOnly) e.preventDefault(); } });
  inp.addEventListener('focus', () => {
    if (inp.numAdopting) return;
    begin();
    if (!inp.readOnly) inp.select();
  });
  inp.addEventListener('input', () => {
    fit();
    if (inp.readOnly) return;
    if (!S) begin();
    const d = numDecide(inp.value, val(o.min), val(o.max), parse);
    if (d.kind === 'bad' && inp.value.trim() !== '' && !/^[-−–]$/.test(inp.value.trim())) inp.setAttribute('aria-invalid', 'true');
    else inp.removeAttribute('aria-invalid');
    if (d.kind === 'ok' && d.n !== S.applied) apply(d.n, true);
  });
  inp.addEventListener('keydown', e => {
    if (inp.readOnly) return;
    if (e.key === 'Enter') { e.preventDefault(); finish(); if (inp.isConnected) inp.select(); }
    else if (e.key === 'Escape') {
      const typed = S && (S.applied !== S.orig || inp.value !== fmt(S.orig));
      if (!typed) return;   // nothing to put back: Escape goes on (a sheet closes)
      e.preventDefault(); e.stopPropagation();
      if (S.applied !== S.orig) apply(S.orig, false);
      inp.removeAttribute('aria-invalid');
      if (inp.isConnected) { inp.value = fmt(o.get()); fit(); begin(); inp.select(); }
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      if (S && S.applied !== S.orig) finish();   // what was typed first, then the step from it
      const up = e.key === 'ArrowUp', before = o.get();
      busy++;
      try {
        if (up && o.up) o.up(); else if (!up && o.down) o.down();
        else { const n = Math.min(val(o.max), Math.max(val(o.min), before + (up ? 1 : -1))); if (n !== before) o.set(n, false); }
      } finally { busy--; }
      const here = inp.isConnected ? inp : o.key && [...document.querySelectorAll('input.dash-num')].find(x => x.dataset.numkey === o.key);
      if (here) { if (here !== inp && here.numAdopt) here.numAdopt(null, null); else { inp.value = fmt(o.get()); fit(); begin(); inp.select(); } }
    }
  });
  inp.addEventListener('blur', () => { if (busy || !inp.isConnected) return; finish(); });
  /** The widget drew this field again while its value was being typed: carry the typing over. */
  inp.numAdopt = (session, text, a, b) => {
    inp.numAdopting = true;
    inp.focus({ preventScroll: true });
    inp.numAdopting = false;
    if (session) S = session; else begin();
    if (text != null) { inp.value = text; try { inp.setSelectionRange(a, b); } catch { /* not a text field */ } }
    else { inp.value = fmt(o.get()); inp.select(); }
    fit();
  };
  inp.sync = show;
  show();
  return inp;
}
