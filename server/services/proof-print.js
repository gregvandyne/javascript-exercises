// Mistake Hunt's worksheet and answer key (BRB.print, docs/sdk.md "Printing"; the same pipeline as Crossword's,
// services/game-print.js). The game sends its passage set as data, never HTML: { T: the set's name, p: the passages as
// a saved set holds them (cleanProofItems: every text through the site's text filter, every mistake checked by the
// game's own rules), key: add the answer key, set: the saved set's id, note: the teacher's own instructions }. The
// server writes the wrong text itself from the teacher's text and the mistakes (services/proof-core.js), so the sheet
// and its key always agree. Black on white, US Letter or A4: for each passage a sheet (a kicker, Name and Date, the
// title, the directions with how many mistakes, a legend of proofreading marks drawn here, the passage double spaced,
// "I found ___ of N mistakes"); then, for school staff only (the route checks), each passage's key: the passage with
// every fix in place and numbered, and the list (wrong -> right, the type, its Common Core code, the why line). Words
// in the viewer's language from the game's own tables; the passage stays English, left to right. docs/decisions.md
// "Mistake Hunt".
import { cleanProofItems, PROOF, SET_ID } from './game-sets.js';
import { cleanPrintNote } from './print-note.js';
import { cleanText } from './textfilter.js';
import { proofCore, proofT } from './proof-core.js';

const KEYS = new Set(['T', 'p', 'key', 'set', 'note']);

/** The game's print request -> { ok: true, doc: { T, p, key, set, note? } } or { ok: false, code: 'bad' }. */
export function cleanProofPrintDoc(raw) {
  const no = { ok: false, code: 'bad' };
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return no;
  let size; try { size = JSON.stringify(raw).length; } catch { return no; }
  if (size > PROOF.bytes + 1000 || Object.keys(raw).some(k => !KEYS.has(k))) return no;
  if (raw.key !== undefined && typeof raw.key !== 'boolean') return no;
  if (raw.set !== undefined && raw.set !== '' && !(typeof raw.set === 'string' && SET_ID.test(raw.set))) return no;
  let T = '';
  if (raw.T !== undefined && raw.T !== '') {
    if (typeof raw.T !== 'string' || raw.T.length > PROOF.title) return no;
    const c = cleanText(raw.T.replace(/\s+/g, ' '), PROOF.title);
    if (!c.ok) return no;
    T = c.value;
  }
  const note = cleanPrintNote(raw.note);
  if (note === null) return no;
  const p = cleanProofItems(raw.p);
  if (!p) return no;
  return { ok: true, doc: { T, p, key: raw.key === true, set: raw.set || '', ...(note ? { note } : {}) } };
}

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// The proofreading marks, drawn small (a 40 x 24 box), black on white.
const MARK = {
  cap: '<text x="20" y="13" text-anchor="middle" font-size="13">m</text><path d="M13 16h14M13 19h14M13 22h14"/>',
  low: '<text x="20" y="17" text-anchor="middle" font-size="15">M</text><path d="M14 21L26 4"/>',
  add: '<text x="20" y="9" text-anchor="middle" font-size="9">a</text><path d="M14 22L20 12L26 22"/>',
  out: '<text x="18" y="17" text-anchor="middle" font-size="12">the</text><path d="M7 13h22c3 0 5 3 2 5s-4-3 0-6"/>',
  period: '<circle cx="20" cy="13" r="6"/><circle cx="20" cy="13" r="1.6" class="mhp-dot"/>',
  comma: '<text x="20" y="13" text-anchor="middle" font-size="13">,</text><path d="M14 22L20 14L26 22"/>',
  apos: '<text x="20" y="10" text-anchor="middle" font-size="13">\'</text><path d="M14 12L20 21L26 12"/>',
  spell: '<text x="20" y="9" text-anchor="middle" font-size="8">said</text><text x="20" y="21" text-anchor="middle" font-size="10">sed</text><path d="M11 18h18"/>',
};
const MARKS = [['cap', 'mkCap'], ['low', 'mkLow'], ['add', 'mkAdd'], ['out', 'mkOut'], ['period', 'mkPeriod'], ['comma', 'mkComma'], ['apos', 'mkApos'], ['spell', 'mkSpell']];
const legend = T => `<div class="mhp-marks">${MARKS.map(([m, k]) => `<span class="mhp-mark"><svg viewBox="0 0 40 24" aria-hidden="true">${MARK[m]}</svg>${esc(T(k))}</span>`).join('')}</div>`;
/** A passage's paragraphs as HTML, English and left to right whatever the page's direction. */
const paras = text => text.split('\n\n').map(p => `<p>${p}</p>`).join('');

/** The printable page (a fragment for the play page's print area). t: the site's words in the viewer's language
 *  (req.t: Name, Date, the footer); lang: the viewer's language (the game's own words); dir: its direction; code /
 *  link: the saved set's class code and link (only for a set that is on Oomba). */
export function proofPrintHtml(doc, { t, dir = 'ltr', lang = 'en', code = '', link = '' }) {
  const P = proofCore(), T = proofT(lang), tell = (doc.p[0].o || {}).n || 'total';
  const foot = extra => `<footer class="cwp-foot"><span>${esc(t('play.print.made'))}</span>${code ? `<span>${esc(t('play.print.code', { code }))}</span>` : ''}${link ? `<span dir="ltr" class="cwp-link">${esc(link)}</span>` : ''}${extra ? `<span>${esc(extra)}</span>` : ''}</footer>`;
  const titleOf = (it, i) => it.t || doc.T || T('prPassage', { n: i + 1 });
  const sheets = doc.p.map((it, i) => {
    const n = it.m.length, groups = P.byGroup(it.m);
    const dir1 = tell === 'none' ? T('prDirNone') : tell === 'type'
      ? T('prDirType', { list: P.GROUPS.filter(g => groups[g]).map(g => `${T('gp.' + g)} ${groups[g]}`).join(', ') })
      : T(n === 1 ? 'prDirOne' : 'prDirTotal', { n });
    const [before, after] = String(T(n === 1 ? 'prFoundOne' : 'prFound', { n })).split('{blank}');
    const found = tell === 'none' ? '' : `<p class="mhp-found">${esc(before)}<i class="cwp-blank mhp-blank"></i>${esc(after || '')}</p>`;
    return `<section class="cwp-page mhp-sheet">
<p class="mhp-kicker">${esc(T('prKicker'))}</p>
<p class="mhp-lines"><span class="cwp-line">${esc(t('play.print.name'))}<i class="cwp-blank cwp-blank-name"></i></span><span class="cwp-line">${esc(t('play.print.date'))}<i class="cwp-blank"></i></span></p>
<h1 dir="auto">${esc(titleOf(it, i))}</h1>
${doc.note ? `<p class="cwp-mine" dir="auto">${esc(doc.note)}</p>` : ''}<div class="mhp-dirs"><p><b>${esc(T('prDirections'))}</b> ${esc(dir1)}</p>${legend(T)}</div>
<div class="mhp-text" lang="en" dir="ltr">${paras(esc(P.wrongText(it.x, it.m)))}</div>
${found}${foot('')}</section>`;
  });
  const keys = !doc.key ? [] : doc.p.map((it, i) => {
    const K = P.key(it.x, it.m), toks = P.tokenize(it.x), at = {};
    K.forEach(k => { at[it.m[k.i].a] = k; });
    let out = '';
    for (let j = 0; j < toks.length;) {
      const k = at[j];
      if (k) { const m = it.m[k.i]; out += `<b class="mhp-fix">${esc(k.right)}</b><sup>${k.n}</sup>${esc(toks[m.b - 1].sp)}`; j = m.b; }
      else { out += esc(toks[j].s + toks[j].sp); j++; }
    }
    const list = K.map(k => `<li><span class="mhp-n">${k.n}.</span><span><span lang="en" dir="ltr"><s>${esc(k.wrong)}</s> → <b>${esc(k.right)}</b></span> · ${esc(T('ty.' + k.k))} (${esc(k.cc)})<br><small>${esc(k.y || T('why.' + k.k))}</small></span></li>`).join('');
    return `<section class="cwp-page mhp-key">
<p class="mhp-kicker">${esc(T('prKeyKicker'))}</p>
<h1 dir="auto">${esc(titleOf(it, i))}</h1>
<div class="mhp-text mhp-keytext" lang="en" dir="ltr">${paras(out)}</div>
<ol class="mhp-list">${list}</ol>
${foot(T('prStaff'))}</section>`;
  });
  return `<div class="cwp mhp" lang="${esc(lang)}" dir="${dir === 'rtl' ? 'rtl' : 'ltr'}">${sheets.join('')}${keys.join('')}</div>`;
}
