// The book maker in the Oomba chat (docs/storybook-builder.md "In the Oomba chat"; docs/decisions.md "The book maker
// in the Oomba chat"). The owner: "Clicking the make a book button should just open up the chat and you should do the
// whole workflow there." For a teacher with the companion, the book maker's steps are cards in the one Oomba chat:
//
//   1. A book being set up is a DRAFT on one Oomba turn (note.book), the open one named in the chat's opts.book. Its card
//      asks only what is missing, in the page's order: Upload your own book or Have AI make one, the kind, grade, length,
//      endings (an adventure), reading level, a theme (AI, no topic given), pictures. A tap fills one answer (no AI);
//      what the teacher's first message already said (makeBook, filled by the AI) is never asked.
//   2. Your words: what the teacher types while the card waits for them, and the files and pictures they attach, go into
//      the draft and never to the chat's AI (the story for "Upload your own book", the notes for "Have AI make one").
//   3. Check: the same functions as the page (storybook.js cleanSetup, setupProblems, screenSetup): exactly what will be
//      sent, after the scrubber, with Edit for each part and Make my book.
//   4. Start: the same service as the page (storybook.js createBook: the checks again, a daily turn, the book row; the
//      pictures through addPic, the page's picture check and limits), then the first draft is a turn of this chat on
//      the book's page (companion.js answer: storybook.js writeBook and applyBook, the AI budget and the picture queue).
//
// Teachers only: every function here refuses anyone storybook.canMake refuses (the tool is not even offered to them).
// Nothing in this file runs at import time (storybook.js imports companion.js: the modules load in either order).
import { q, uid, now, audit } from '../db.js';
import * as SB from './storybook.js';
import * as Draw from './storybook-draw.js';
import { KINDS, numbering } from '../../public/js/storybook-core.js';
import { tFor } from '../i18n/index.js';

/** The card's questions, in the page's order (context and check come after). */
export const BOOK_STEPS = Object.freeze(['source', 'kind', 'grade', 'length', 'endings', 'level', 'theme', 'pictures']);
const DONE = new Set(['started', 'cancelled', 'moved']);
const clip = (s, n) => String(s ?? '').slice(0, n);
const words = s => String(s || '').split(/\s+/).filter(Boolean).length;
/** "[student 2]" (the chat's placeholders) is a plain "[student]" in a book: the book never needs to know which one. */
const plain = s => String(s || '').replace(/\[student \d{1,3}\]/g, '[student]');

// ---------------------------------------------------------------- answers
/** "3", "grade 4", "K" -> the book maker's grade band, or ''. */
export function gradeOf(v) {
  const s = String(v ?? '').trim().toLowerCase().replace(/^(grades?|year)\s*/, '');
  if (['k', '0', 'kindergarten', 'kg'].includes(s)) return 'k';
  if (SB.GRADES.includes(s)) return s;
  const n = parseInt(s, 10);
  return n >= 1 && n <= 3 ? String(n) : n === 4 || n === 5 ? '4-5' : n >= 6 && n <= 8 ? '6-8' : '';
}
/** One answer, checked against the page's own lists. -> the value, or undefined when it is not one. */
export function valueOf(step, v) {
  const s = String(v ?? '').trim().toLowerCase();
  switch (step) {
    case 'source': return SB.SOURCES.includes(s) ? s : undefined;
    case 'kind': return KINDS.includes(s) ? s : undefined;
    case 'grade': return gradeOf(s) || undefined;
    case 'length': return SB.LENGTHS.includes(s) ? s : undefined;
    case 'endings': return SB.ENDINGS.includes(+s) ? +s : undefined;
    case 'level': return SB.LEVELS.includes(s) ? s : undefined;
    case 'theme': return s === '' || s === 'none' ? '' : SB.THEMES.includes(s) ? s : undefined;
    case 'pictures': return SB.PICTURES.includes(s) ? s : undefined;
    default: return undefined;
  }
}
/** What the card asks now: one of BOOK_STEPS, 'context' (the teacher's own words, files, pictures) or 'check'. */
export function needOf(d) {
  const s = d.setup;
  for (const k of BOOK_STEPS) {
    if (k === 'endings' && s.kind !== 'cyoa') continue;
    if (k === 'theme' && (s.source !== 'ai' || s.about)) continue;   // a topic in their own words needs no theme
    if (!d.given.includes(k)) return k;
  }
  return d.ctxDone ? 'check' : 'context';
}
const fresh = lang => ({ id: uid(10), v: 1, state: 'source', lang, setup: { source: '', kind: '', grade: '', length: '', endings: 0, level: '', theme: '', pictures: '', about: '', story: '' }, given: [], files: [], pics: [], ctxDone: false, check: null, error: '' });
const copy = d => JSON.parse(JSON.stringify(d));
const next = (d, extra = {}) => { const n = { ...copy(d), ...extra, v: (d.v || 1) + 1, check: null, error: '' }; n.state = needOf(n); return n; };
export const isOpen = d => !!d && !DONE.has(d.state);

/** A file of this chat (companion.js oomba_files), only the teacher's own. */
const fileRow = (u, id) => q.get("SELECT f.* FROM oomba_files f JOIN oomba_chats c ON c.id=f.chat_id WHERE f.id=? AND f.owner_id=? AND c.surface='companion'", String(id || ''), u.id) || null;
/** An attached file into the draft: a document's text (read and scrubbed on upload, the Builder's lesson reader, as the
 *  page's Add a file) or a picture (checked for people on upload; it goes on the first pages, never to the AI).
 *  -> null | an error key (storybook.chat.*) */
export function attach(u, d, f) {
  if (!f) return 'fileGone';
  if (f.kind === 'image') {
    if (d.pics.some(p => p.id === f.id)) return null;
    if (d.pics.length >= SB.SETUP_LIMITS.pics) return 'tooManyPics';
    d.pics.push({ id: f.id, name: f.name });
    return null;
  }
  if (d.files.some(x => x.id === f.id)) return null;
  if (d.files.length >= SB.SETUP_LIMITS.files) return 'tooManyFiles';
  d.files.push({ id: f.id, name: f.name, words: words(f.text) });
  d.ctxDone = true;
  return null;
}
/** The words the teacher typed while the card waits for them: the story (Upload your own book) or the notes. */
export function addWords(d, text) {
  const k = d.setup.source === 'upload' ? 'story' : 'about';
  d.setup[k] = clip([d.setup[k], plain(text)].filter(Boolean).join('\n\n'), SB.SETUP_LIMITS[k]);
}

/**
 * makeBook: what the teacher's message said (filled in by the AI) on top of the open draft, or a new draft. Only valid
 * answers count; everything else is asked on the card. ctx: the companion's tool context (its text, its file).
 * -> the draft
 */
export function fromInput(u, ctx, input, prev = null) {
  const d = prev && isOpen(prev) ? copy(prev) : fresh(ctx.lang || 'en');
  const i = input && typeof input === 'object' ? input : {};
  const set = (k, v) => { d.setup[k] = v; if (!d.given.includes(k)) d.given.push(k); };
  if (typeof i.story === 'string' && i.story.trim()) { d.setup.story = clip(plain(i.story).trim(), SB.SETUP_LIMITS.story); if (!i.source) i.source = 'upload'; }
  else if (i.storyInMessage === true && ctx.text) { d.setup.story = clip(plain(ctx.text), SB.SETUP_LIMITS.story); if (!i.source) i.source = 'upload'; }
  for (const k of BOOK_STEPS) {
    if (i[k] === undefined || i[k] === null || (k !== 'theme' && i[k] === '')) continue;
    const v = valueOf(k, i[k]);
    if (v !== undefined) set(k, v);
  }
  if (d.setup.kind && d.setup.kind !== 'cyoa') d.setup.endings = 0;
  if (typeof i.about === 'string' && i.about.trim()) d.setup.about = clip(plain(i.about).trim(), SB.SETUP_LIMITS.about);
  const f = ctx.meta && ctx.meta.file ? fileRow(u, ctx.meta.file.id) : null;
  if (f) attach(u, d, f);
  // Their own words answer "Your words": the topic (Have AI make one) or the story (Upload your own book).
  if ((d.setup.source === 'upload' && d.setup.story) || (d.setup.source === 'ai' && d.setup.about)) d.ctxDone = true;
  d.v = (d.v || 1) + 1; d.check = null; d.error = '';
  d.state = needOf(d);
  return d;
}

// ---------------------------------------------------------------- the card's taps
/** A tap on one of the card's options. -> the new draft | { error } */
export function pick(d, value) {
  const step = d.state;
  if (!BOOK_STEPS.includes(step)) return { error: 'notFound' };
  const v = valueOf(step, value);
  if (v === undefined) return { error: 'notFound' };
  const n = copy(d);
  n.setup[step] = v;
  if (!n.given.includes(step)) n.given.push(step);
  if (step === 'kind' && v !== 'cyoa') n.setup.endings = 0;
  return next(n);
}
/** Edit on the check card: that part is asked again (the words: the card waits for them again). */
export function edit(d, part) {
  const n = copy(d);
  const drop = { source: ['source', 'kind', 'theme'], kind: ['kind', 'endings'], options: ['grade', 'length', 'endings', 'level', 'theme', 'pictures'], pictures: ['pictures'] }[part];
  if (drop) n.given = n.given.filter(k => !drop.includes(k));
  else if (part === 'words') n.ctxDone = false;
  else return { error: 'notFound' };
  return next(n);
}
/** Clear my words: the typed words and the files go (pictures stay; each has its own Remove on the page). */
export function clearWords(d) { const n = copy(d); n.setup.about = ''; n.setup.story = ''; n.files = []; n.pics = []; n.ctxDone = false; return next(n); }

/** The setup as the page sends it: the typed words with each document's text after them (the page puts a document's
 *  text into its box), the file names, the Pictures choice. Pictures are added on Start. */
export function bodyOf(u, d) {
  const s = d.setup;
  const docs = d.files.map(f => (fileRow(u, f.id) || {}).text || '').filter(Boolean);
  return {
    source: s.source, kind: s.kind, grade: s.grade, length: s.length, endings: s.endings, level: s.level, theme: s.theme, pictures: s.pictures,
    story: s.source === 'upload' ? [s.story, ...docs].filter(Boolean).join('\n\n') : '',
    about: s.source === 'upload' ? s.about : [s.about, ...docs].filter(Boolean).join('\n\n'),
    files: d.files.map(f => ({ name: f.name })), pics: [],
  };
}
/** Check: exactly what will be sent, the page's own way (/api/library/make/check). -> the draft at 'check' */
export async function runCheck(u, d) {
  const t = tFor(d.lang || 'en');
  const { setup, removed } = SB.cleanSetup(u, bodyOf(u, d), { lang: d.lang || 'en' });
  const need = SB.setupProblems(setup);
  const blocked = need ? null : await SB.screenSetup(setup, { t });
  const n = copy(d);
  n.ctxDone = true; n.v = (d.v || 1) + 1; n.error = '';
  n.state = needOf(n);
  if (n.state !== 'check') return n;
  n.check = { ok: !need && !blocked, setup, removed, need: need ? t(`storybook.errors.${need}`) : null, blocked: blocked ? blocked.message : null, left: SB.left(u) };
  audit(u.id, 'companion.book.check', d.id, { ok: n.check.ok, removed });
  return n;
}
/**
 * Make my book: the pictures through the page's own check and limits (storybook.addPic), then createBook (the same
 * scrubber, problems, screening and daily turn as the page's Start). -> { ok, id } | { error: message }
 */
export async function start(u, d) {
  const t = tFor(d.lang || 'en');
  const ids = [];
  for (const p of d.pics) {
    const f = fileRow(u, p.id);
    if (!f || !f.bytes) return { error: t('storybook.chat.picGone') };
    const r = await SB.addPic(u, null, Buffer.from(f.bytes), p.name);
    if (!r.ok) return { error: t(`storybook.errors.${r.code}`) };
    ids.push(r.pic.id);
  }
  const r = await SB.createBook(u, { ...bodyOf(u, d), pics: ids }, { t, lang: d.lang || 'en' });
  if (!r.ok) return { error: r.code === 'blocked' ? r.message : t(`storybook.errors.${['cap', 'storyNeeded', 'notFound'].includes(r.code) ? r.code : 'error'}`) };
  for (const p of d.pics) q.run('UPDATE oomba_files SET bytes=NULL, used_at=COALESCE(used_at, ?) WHERE id=?', now(), p.id);
  audit(u.id, 'companion.book.start', r.id, { kind: d.setup.kind, source: d.setup.source, pictures: d.setup.pictures });
  return { ok: true, id: r.id };
}

// ---------------------------------------------------------------- the card as the page shows it
const ICON = { upload: '📝', ai: '🪄', linear: '📖', cyoa: '🔀', 'p:ai': '🎨', 'p:own': '🖼️', 'p:none': '📄' };
/** The labels of one answer, in the teacher's language (the page's own words). */
function labelOf(t, s, k, v) {
  if (k === 'source') return t(v === 'upload' ? 'storybook.start.upload' : 'storybook.start.ai');
  if (k === 'kind') return t(s.source === 'upload' ? (v === 'cyoa' ? 'storybook.options.turn' : 'storybook.options.keep') : s.source === 'ai' ? (v === 'cyoa' ? 'storybook.options.cyoa' : 'storybook.options.illustrated') : `storybook.kind.${v}`);
  if (k === 'grade') return t(`storybook.grades.${String(v).replace('-', '')}`);
  if (k === 'length') return t(`storybook.lengths.${v}`);
  if (k === 'endings') return t('js.storybook-setup.endingsN', { count: +v });
  if (k === 'level') return t(`storybook.levels.${v}`);
  if (k === 'theme') return v ? t(`storybook.themes.${v}`) : t('storybook.chat.noTheme');
  if (k === 'pictures') return t(`storybook.pictures.${v}`);
  return String(v);
}
const subOf = (t, s, k, v) => (k === 'source' ? t(v === 'upload' ? 'storybook.start.uploadText' : 'storybook.start.aiText')
  : k === 'kind' ? t(s.source === 'upload' ? (v === 'cyoa' ? 'storybook.options.turnText' : 'storybook.options.keepText') : (v === 'cyoa' ? 'storybook.options.cyoaText' : 'storybook.options.illustratedText')) : '');
const QUESTION = { source: 'storybook.start.title', kind: 'storybook.options.title', grade: 'storybook.options.grade', length: 'storybook.options.length', endings: 'storybook.options.endings', level: 'storybook.options.level', theme: 'storybook.options.theme', pictures: 'storybook.options.pictures' };
function optionsOf(t, s, step) {
  const one = (v, icon) => ({ v: String(v), label: labelOf(t, s, step, v), ...(subOf(t, s, step, v) ? { sub: subOf(t, s, step, v) } : {}), ...(icon ? { icon } : {}) });
  switch (step) {
    case 'source': return SB.SOURCES.map(v => one(v, ICON[v]));
    case 'kind': return KINDS.map(v => one(v, ICON[v]));
    case 'grade': return SB.GRADES.map(v => one(v));
    case 'length': return SB.LENGTHS.map(v => one(v));
    case 'endings': return SB.ENDINGS.map(v => one(v));
    case 'level': return SB.LEVELS.map(v => one(v));
    case 'theme': return [...SB.THEMES.map(v => one(v)), { ...one(''), v: 'none' }];
    case 'pictures': return SB.PICTURES.map(v => one(v, ICON[`p:${v}`]));
    default: return [];
  }
}
/** The draft as the page shows it (companion.js dress; never kept, never sent to the AI). */
export function viewOf(d, t) {
  const s = d.setup, st = d.state;
  const known = BOOK_STEPS.filter(k => d.given.includes(k) && !(k === 'endings' && s.kind !== 'cyoa') && !(k === 'theme' && s.source !== 'ai')).map(k => labelOf(t, s, k, s[k]));
  const out = { id: d.id, v: d.v, state: st, known, error: d.error || '', L: {
    stop: t('storybook.chat.stop'), check: t('storybook.toCheck'), clear: t('storybook.chat.clear'), edit: t('js.storybook-setup.edit'), go: t('storybook.check.go'),
    never: t('storybook.check.never'), privacy: t('storybook.privacy'), checking: t('js.storybook-setup.checking'), stopped: t('storybook.chat.stopped'), started: t('storybook.chat.startedCard'),
  } };
  if (BOOK_STEPS.includes(st)) { out.question = t(QUESTION[st]); out.options = optionsOf(t, s, st); }
  if (st === 'context') {
    out.question = t(s.source === 'upload' ? 'storybook.context.titleUpload' : 'storybook.context.titleAi');
    out.hint = t(s.source === 'upload' ? 'storybook.chat.contextUpload' : 'storybook.chat.contextAi');
    const w = words(s.source === 'upload' ? s.story : s.about);
    out.have = [w ? t('js.storybook-setup.words', { count: w }) : '', ...d.files.map(f => f.name), d.pics.length ? t('storybook.chat.picsN', { count: d.pics.length }) : ''].filter(Boolean);
  }
  if (st === 'check') {
    out.title = t('storybook.check.title'); out.lead = t('storybook.check.lead');
    const c = d.check;
    if (c) {
      const x = c.setup;
      const opts = ['grade', 'length', ...(x.kind === 'cyoa' ? ['endings'] : []), 'level', ...(x.theme ? ['theme'] : []), 'pictures'].map(k => labelOf(t, x, k, x[k])).join(' · ');
      const none = t('js.storybook-setup.none');
      out.rows = [
        { part: 'source', label: t('js.storybook-setup.sum.start'), value: labelOf(t, x, 'source', x.source) },
        { part: 'kind', label: t('js.storybook-setup.sum.kind'), value: t(`storybook.kind.${x.kind}`) },
        { part: 'options', label: t('js.storybook-setup.sum.options'), value: opts },
        ...(x.source === 'upload' ? [{ part: 'words', label: t('js.storybook-setup.sum.story'), text: x.story || '', none }] : []),
        { part: 'words', label: t(x.source === 'upload' ? 'js.storybook-setup.sum.notes' : 'js.storybook-setup.sum.about'), text: x.about || '', none },
        ...(x.files.length ? [{ part: 'words', label: t('js.storybook-setup.sum.files'), value: x.files.join(', ') }] : []),
        { part: 'words', label: t('js.storybook-setup.sum.pics'), value: d.pics.length ? t('js.storybook-setup.sum.picsN', { count: d.pics.length }) : none },
      ];
      out.ok = !!(c.ok && c.left);
      out.notes = [c.removed ? { kind: 'good', text: t('js.storybook-setup.removed', { count: c.removed }) } : null, c.need ? { kind: 'warn', text: c.need } : null,
        c.blocked ? { kind: 'warn', text: c.blocked } : null, !c.left ? { kind: 'warn', text: t('storybook.errors.cap') } : null].filter(Boolean);
    }
  }
  if (st === 'started' && d.bookId) out.href = `/library/make/${d.bookId}`;
  return out;
}

// ---------------------------------------------------------------- the AI's tools
const str = (description, extra = {}) => ({ type: 'string', description, ...extra });
/** makeBook (only for teachers: companion.js toolsFor). Built when asked for: the lists are the book maker's own. */
export const bookTool = () => ({
  name: 'makeBook',
  description: 'Start making a book with the book maker (a picture book or a choose-your-own-adventure, every page illustrated) when the teacher asks for a book, a story or an adventure, or to turn their own story into one. Fill in ONLY what the teacher said; leave everything else out. The app asks the rest on a card, shows a check card with exactly what will be sent, and makes nothing until the teacher taps Make my book. Never write the book yourself in the chat. A file attached to this message is taken into the book by itself (do not read it).',
  input_schema: { type: 'object', properties: {
    source: str('"upload" when the teacher brings their own story (pasted or attached), "ai" when Oomba writes it.', { enum: SB.SOURCES }),
    kind: str('"linear" a picture book that reads in order; "cyoa" a choose-your-own-adventure.', { enum: KINDS }),
    grade: str('K or 1 to 8.'), length: str('How long.', { enum: SB.LENGTHS }), endings: { type: 'integer', description: 'Endings of an adventure, 2 to 4.' },
    level: str('Reading level.', { enum: SB.LEVELS }), theme: str('Only one of these themes when the teacher named it.', { enum: SB.THEMES }),
    pictures: str('"ai" Oomba paints the pictures, "own" the teacher adds their own, "none" no pictures. Only when they said.', { enum: SB.PICTURES }),
    about: str('What the book is about, in the teacher\'s own few words ("the water cycle"). No names.'),
    story: str('The teacher\'s own story when they pasted it, copied exactly.'),
    storyInMessage: { type: 'boolean', description: 'True when the teacher\'s message itself is their story (instead of copying it into story).' },
  } },
});
/** Change a book (made now or in the past) from any page, or redraw one picture: the page's own functions (companion.js
 *  answer runs the change: storybook.js writeBook and applyBook, with Undo). */
export const BOOK_PAGE_TOOLS = Object.freeze([
  { name: 'changeBook', description: 'Change one of the teacher\'s own books (a page, words, choices, endings, characters, the title, the scenes of pictures), made now or in the past, from any page. On a book\'s page with no other book named, it is that book. Otherwise give bookId (from findMyBooks) or which (the words they used for it): when several books fit, the teacher picks on a card; when none does, say so. The book\'s own writer makes the change with the teacher\'s request; the teacher can Undo it and open the book. Costs one of their book turns for today.', input_schema: { type: 'object', required: ['request'], properties: {
    request: str('What to change, in the teacher\'s own words ("make page 3 scarier").'), bookId: str('The book id from findMyBooks, when you know it.'), which: str('The words the teacher used for the book ("my water cycle book"), when you do not know the id.') } } },
  { name: 'redrawPicture', description: 'Paint one page\'s picture of a book again, with an optional note like "a sunny morning". Only when Oomba paints that book\'s pictures. Uses one of the teacher\'s pictures for today. On a book\'s page with no other book named, it is that book; otherwise give bookId.', input_schema: { type: 'object', required: ['page'], properties: { page: { type: 'integer', description: 'The page number as the editor shows it.' }, note: str('What to change in the picture, optional.'), bookId: str('The book id, when not on its page.') } } },
]);
const fold = s => String(s || '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^\p{L}\p{N}\s]+/gu, ' ').replace(/\s+/g, ' ').trim();
const STOP = new Set(['a', 'an', 'the', 'my', 'book', 'books', 'story', 'about', 'of', 'in', 'on', 'i', 'made', 'make', 'last', 'week', 'that', 'one', 'adventure', 'picture', 'with', 'to', 'and', 'for', 'edit', 'change', 'page']);
/** The teacher's own books (never another teacher's: storybook.myBooks reads their own rows only), best match for the
 *  words first. -> [{ id, title, kind, updated, pages, score }] */
export function findBooks(u, text = '') {
  if (!SB.canMake(u)) return [];
  const terms = fold(text).split(' ').filter(w => w.length > 1 && !STOP.has(w));
  const all = SB.myBooks(u, 50).map(r => {
    const b = SB.bookOf(r), setup = SB.setupOf(r);
    const hay = fold(`${r.title} ${setup.about || ''} ${setup.theme || ''} ${b.cast.map(c => c.name).join(' ')}`);
    const score = terms.filter(w => hay.includes(w) || hay.includes(w.replace(/s$/, ''))).length;
    return { id: r.id, title: r.title || '', kind: r.kind, updated: r.updated_at, pages: b.pages.length, score };
  });
  if (!terms.length) return all;
  const best = Math.max(0, ...all.map(x => x.score));
  return best ? all.filter(x => x.score === best) : [];
}
/** The book's page numbers as the editor shows them (an adventure: in the order a reader meets them). */
export function pageNumbered(b, n) {
  if (b.kind === 'cyoa') { const num = numbering(b); return b.pages.find(p => num.get(p.id) === n) || null; }
  return b.pages[n - 1] || null;
}
/** redrawPicture: the editor's own Redraw (storybook-draw.js redraw). -> { done } | { error } */
export function redrawPage(u, bookId, n, note) {
  const row = SB.ownBook(u, bookId); if (!row) return { error: 'There is no book open on this page.' };
  const p = pageNumbered(SB.bookOf(row), Number(n));
  if (!p) return { error: 'No such page in this book.' };
  const r = Draw.redraw(u, row.id, `page:${p.id}`, note || '');
  if (r.ok) return { done: true };
  const why = { off: 'This book\'s pictures are the teacher\'s own (or none): Oomba does not paint them.', nokey: 'The picture maker is not set up on this site.', resting: 'The picture maker is resting; try later.', limit: 'The teacher has used today\'s pictures.', notFound: 'That page shows the teacher\'s own picture or none.' }[r.code];
  return { error: why || 'Those words cannot be used for a picture.' };
}
