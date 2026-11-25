// Story Library, Bloom Library books (docs/decisions.md "Story Library: Bloom Library books" and "Story Library: more
// Bloom books"; docs/story-library-bloom.md): the license rule for the book and every picture (fixtures for each case:
// CC BY, CC BY-SA, CC0, NC, ND, custom, a ported or missing version, a picture with no license of its own, 0 to 3
// pictures with no license or copyright at all, a stricter or stock picture, restrictions in the notes), a person's
// text corrections (applied exactly once, credited), reading
// Bloom's HTML (front and back matter, template and other-language blocks, image descriptions, placeholders), the
// credits (no contact details), and privacy: no storage link or email address anywhere in what is shipped.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const B = await import('../../server/library/bloom-lib.js');
const I = await import('../../server/library/import-lib.js');
const IMP = await import('../../scripts/import-bloom.js');
const SW = await import('../../scripts/import-stories.js');
const LIB = await import('../../server/services/library.js');

// ------------------------------------------------------------------ fixtures: Bloom-shaped books
const BY4 = 'http://creativecommons.org/licenses/by/4.0/';
const img = (file, { license = 'cc-by', copyright = '© 2020 Good Books', creator = 'Ann Artist' } = {}) =>
  `<img src="${file}" alt="" ${license === null ? '' : `data-license="${license}"`} data-copyright="${copyright}" data-creator="${creator}" />`;
const group = texts => `<div class="bloom-translationGroup">${Object.entries(texts).map(([l, t]) => `<div class="bloom-editable" lang="${l}"><p>${t}</p></div>`).join('')}<div class="bloom-editable" lang="z"></div></div>`;
const page = ({ texts = { en: 'A cat sat.' }, pics = [img('p.jpg')], extra = '', cls = 'numberedPage' } = {}) =>
  `<div class="bloom-page ${cls}">${extra}<div class="marginBox"><div class="bloom-imageContainer">${pics.join('')}${'<div class="bloom-translationGroup bloom-imageDescription"><div class="bloom-editable" lang="en"><p>A cat on a mat.</p></div></div>'}</div>${group(texts)}</div></div>`;
function bloomHtml({ pages = null, licenseUrl = BY4, copyright = '© 2020 Good Books', cover = img('cover.jpg'), smallCredits = 'Author: Sam Writer', ack = '' } = {}) {
  const ps = pages || [
    page({ texts: { en: 'A cat sat on a mat.', es: 'Un gato.' }, pics: [img('one.jpg')] }),
    page({ texts: { en: 'The cat saw a big red ball.' }, pics: [img('two.jpg')] }),
    page({ texts: { en: 'The cat ran and ran. What fun!' }, pics: [img('three.jpg')] }),
  ];
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>.x{content:"<div>"}</style><script>var a = "<div class='bloom-page'>";</script></head><body>
  <div id="bloomDataDiv"><div data-book="bookTitle" lang="en"><p>The Cat &amp; the Ball</p></div><div data-book="bookTitle" lang="z"></div>
    <div data-book="coverImage" lang="*" src="cover.jpg" data-license="cc-by" data-copyright="${copyright}" data-creator="Ann Artist">cover.jpg</div>
    <div data-book="licenseUrl" lang="*">${licenseUrl}</div><div data-book="copyright" lang="*">${copyright}</div>
    <div data-book="smallCoverCredits" lang="en"><p>${smallCredits}</p></div><div data-book="originalAcknowledgments" lang="en">${ack}</div></div>
  <div class="bloom-page cover bloom-frontMatter outsideFrontCover"><div class="bloom-imageContainer">${cover}</div>${group({ en: 'The Cat &amp; the Ball' })}<img class="branding" src="badge.svg" data-license="" /></div>
  <div class="bloom-page bloom-frontMatter credits">${group({ en: 'Thanks to everyone.' })}<img class="licenseImage" src="license.png" /></div>
  ${ps.join('\n')}
  <div class="bloom-page bloom-backMatter outsideBackCover">${group({ en: 'The end matter.' })}</div></body></html>`;
}
const entry = (over = {}) => ({ id: 'AbCdEf1234', title: 'The Cat and the Ball', langs: ['en', 'es'], tags: ['topic:Story Book'], harvestState: 'Done', inCirculation: true, draft: false, features: [], ...over });
const meta = (over = {}) => ({ license: 'cc-by', licenseNotes: null, copyright: '© 2020 Good Books', credits: 'Writer: Sam Writer\nIllustration: Ann Artist\nTranslated by: Tia Translator', internetLimits: null, ...over });
const qs = [{ q: 'Where did the cat sit?', right: 'On a mat', wrong: ['On a bed', 'On a box'], page: 1 },
  { q: 'What did the cat see?', right: 'A ball', wrong: ['A bird', 'A dog'], page: 2 },
  { q: 'How did the cat feel?', right: 'Happy', wrong: ['Sad', 'Sleepy'], page: 3, kind: 'inference' }];
const cur = (over = {}) => ({ picks: { AbCdEf1234: { questions: qs, glossary: { mat: 'A small rug.' } } }, skipped: {}, scanReviewed: {}, ...over });
const ev = ({ e = {}, m = {}, h = {}, c = {}, names = null } = {}) => IMP.evaluateBloom({ entry: entry(e), meta: meta(m), html: bloomHtml(h), names, curation: cur(c) });

// ------------------------------------------------------------------ licenses
test('bloomLicense: CC BY, CC BY-SA and CC0 with a clear version pass; NC, ND, custom, ported, missing or mismatched do not', () => {
  assert.equal(B.bloomLicense('cc-by', BY4), 'cc-by-4.0');
  assert.equal(B.bloomLicense('cc-by', 'https://creativecommons.org/licenses/by/3.0'), 'cc-by-3.0');
  assert.equal(B.bloomLicense('cc-by-sa', 'http://creativecommons.org/licenses/by-sa/4.0/'), 'cc-by-sa-4.0');
  assert.equal(B.bloomLicense('cc0', 'http://creativecommons.org/publicdomain/zero/1.0/'), 'cc0');
  assert.equal(B.bloomLicense('cc0', ''), 'cc0');
  assert.equal(B.bloomLicense('cc-by-nc', 'http://creativecommons.org/licenses/by-nc/4.0/'), 'nc');
  assert.equal(B.bloomLicense('cc-by-nc-sa', ''), 'nc');
  assert.equal(B.bloomLicense('cc-by-nd', ''), 'nd');
  assert.equal(B.bloomLicense('custom', ''), 'custom');
  assert.equal(B.bloomLicense('ask', ''), 'custom');
  assert.equal(B.bloomLicense('', BY4), 'missing');
  assert.equal(B.bloomLicense('cc-by', ''), 'version', 'no license link: the version is not known');
  assert.equal(B.bloomLicense('cc-by', 'http://creativecommons.org/licenses/by/3.0/za/'), 'version', 'a ported version');
  assert.equal(B.bloomLicense('cc-by', 'http://creativecommons.org/licenses/by-nc/4.0/'), 'nc', 'the link says NC');
  assert.equal(B.bloomLicense('cc-by', 'http://creativecommons.org/licenses/by-sa/4.0/'), 'mismatch');
  assert.equal(B.bloomLicense('cc-by', 'http://creativecommons.org/licenses/by/1.0/'), 'version');
  assert.equal(B.bloomLicense('cc0', BY4), 'mismatch');
  assert.equal(B.bloomLicense('something', BY4), 'unknown');
  for (const k of Object.keys(B.BLOOM_ALLOWED)) assert.ok(B.isBloomAllowed(k));
  assert.equal(B.BLOOM_ALLOWED['cc-by-sa-4.0'].url, 'https://creativecommons.org/licenses/by-sa/4.0/');
});

test('imageLicenseFamily and restrictionIn: what a picture or a book\'s notes say', () => {
  assert.deepEqual(['cc-by', 'CC-BY-SA', 'cc0', 'public domain', '', 'cc-by-nc-sa', 'cc-by-nd', 'custom', 'ask', 'gpl'].map(B.imageLicenseFamily), ['by', 'by-sa', 'cc0', 'cc0', null, 'nc', 'nd', 'custom', 'custom', 'unknown']);
  for (const s of ['Not for distribution', 'All rights reserved.', 'Used with permission of the author', 'Do not copy this book', 'For internal use only', 'Licensed CC BY-NC']) assert.ok(B.restrictionIn(s), s);
  for (const s of ['Copyright © 2015, African Storybook Initiative', 'Writer: A\nIllustration: B', 'You are free to make commercial use of this work.', null]) assert.equal(B.restrictionIn(s), null, String(s));
});

test('notABook: drafts, shells, templates, tests, incoming or problem books and activity or video books are left out', () => {
  assert.equal(B.notABook(entry()), null);
  assert.match(B.notABook(entry({ draft: true })), /draft/);
  assert.match(B.notABook(entry({ inCirculation: false })), /circulation/);
  assert.match(B.notABook(entry({ harvestState: 'Failed' })), /harvested/);
  for (const t of ['list:IMS-ShellBooks', 'topic:Template', 'system:Incoming', 'system:problem-see notes', 'list:test books']) assert.match(B.notABook(entry({ tags: [t] })), /tagged/, t);
  for (const f of ['quiz', 'activity', 'video', 'signLanguage:pgz', 'widget']) assert.match(B.notABook(entry({ features: [f] })), /pages/, f);
  assert.equal(B.notABook(entry({ features: ['talkingBook:en', 'motion'] })), null);
});

// ------------------------------------------------------------------ reading the HTML
test('parseBloomHtml: story pages only, English text only, other languages recorded, descriptions as alt text', () => {
  const bk = B.parseBloomHtml(bloomHtml());
  assert.equal(bk.title, 'The Cat & the Ball');
  assert.equal(bk.pages.length, 3, 'front and back matter are not story pages; scripts and styles are skipped');
  assert.equal(bk.pages[0].text, 'A cat sat on a mat.');
  assert.deepEqual(bk.pages[0].otherLangs, ['es']);
  assert.equal(bk.pages[0].alt, 'A cat on a mat.');
  assert.equal(bk.pages[0].picture.file, 'one.jpg');
  assert.equal(bk.cover.file, 'cover.jpg');
  assert.equal(bk.data.licenseUrl, BY4);
  assert.deepEqual(B.otherLangsOf(bk), ['es']);
  // Placeholders and Bloom's background-image containers.
  const p = B.parseBloomHtml(bloomHtml({ pages: [page({ pics: ['<img src="placeHolder.png" alt="" />', '<div class="bloom-imageContainer" style="background-image:url(\'bg%20one.png\')" data-license="cc0"></div>'] })] }));
  assert.deepEqual(p.pages[0].pictures.map(x => [x.file, x.license]), [['bg one.png', 'cc0']]);
  // A quiz page keeps the book out.
  assert.match(B.parseBloomHtml(bloomHtml({ pages: [page({ cls: 'numberedPage bloom-interactive-page' })] })).problems[0], /activity/);
  // Line breaks: <p> and <br> are lines; entities decoded.
  assert.equal(B.textOf(B.parseHtml('<div><p>One&nbsp;two</p><p>Three<br/>four &amp; five</p></div>')), 'One two\nThree\nfour & five');
});

test('creditPeople, scrub and copyrightHolder: names by role, never an email address or phone number', () => {
  const c = B.creditPeople('Writer: Stella Kihweo\r\nIllustration: Onesmus Kakungi and Mia Lee\r\nTranslated By: Ursula Nafula\r\nReformatted for Bloom by: Kent', 'Author: Matona Fatman (matona@example.org)');
  assert.deepEqual(c, { text: ['Stella Kihweo', 'Matona Fatman'], illustration: ['Onesmus Kakungi', 'Mia Lee'], translation: ['Ursula Nafula'] });
  assert.deepEqual(B.creditPeople('Illustrated by Ndumiso Nyoni / Written by Melissa Fagan / Designed by Fathima Kathrada / Edited by Bongani Kona with the help of the Book Dash participants'), { text: ['Melissa Fagan'], illustration: ['Ndumiso Nyoni'], translation: [] });
  assert.deepEqual(B.creditPeople('Goodnight, Tinku! Author: Preethi Nambiar Illustrators: Sonal Goyal, Sumit Sakhuja'), { text: ['Preethi Nambiar'], illustration: ['Sonal Goyal', 'Sumit Sakhuja'], translation: [] });
  assert.deepEqual(B.creatorNames(['World Education, Inc.', 'Silva Alfonso adapted by E. Carlson 2015', 'A and B']), ['World Education, Inc.', 'Silva Alfonso', 'A', 'B']);
  assert.equal(B.originalFrom('Adapted from original: © Asia Foundation CC-BY 4.0; © Bilum Books CC-BY 4.0 www.bilumbooks.com'), 'Asia Foundation, Bilum Books');
  assert.equal(B.originalFrom('This book is an adaptation of the original, Dudu\'s Hat, Copyright © 2019, Book Dash. Licensed under CC BY 4.0.'), 'Book Dash');
  assert.equal(B.originalFrom('Writer: A'), '');
  assert.equal(B.scrub('Call +27 21 555 1234 or write to a.b@example.co.za now'), 'Call or write to now');
  assert.equal(B.copyrightHolder('Copyright © 2015, African Storybook Initiative'), 'African Storybook Initiative');
  assert.equal(B.copyrightHolder('© 2018 Book Dash'), 'Book Dash');
});

// ------------------------------------------------------------------ the rule, book by book
test('evaluateBloom: a CC BY book with its own picture licenses comes in, credited, with the English only', () => {
  const r = ev();
  assert.equal(r.status, 'included', r.reason);
  const b = r.book;
  assert.equal(b.id, 'bl-AbCdEf1234'); assert.equal(b.source, 'bloom'); assert.equal(b.sourceId, 'AbCdEf1234');
  assert.deepEqual(b.pages.map(p => p.text), ['A cat sat on a mat.', 'The cat saw a big red ball.', 'The cat ran and ran. What fun!']);
  assert.deepEqual(b.pages.map(p => p.image.file), ['one.jpg', 'two.jpg', 'three.jpg']);
  assert.equal(b.pages[0].image.src, '/img/library/bl-AbCdEf1234/p01.webp');
  assert.equal(b.cover.file, 'cover.jpg');
  assert.deepEqual(b.otherLangs, ['es']);
  assert.equal(b.credits.licenseName, 'CC BY 4.0'); assert.equal(b.credits.licenseUrl, 'https://creativecommons.org/licenses/by/4.0/');
  assert.equal(b.credits.shareAlike, false);
  assert.equal(b.credits.platform, 'Bloom Library'); assert.equal(b.credits.publisher, 'Good Books');
  assert.equal(b.credits.sourceUrl, 'https://bloomlibrary.org/book/AbCdEf1234');
  assert.deepEqual(b.credits.text, ['Sam Writer']); assert.deepEqual(b.credits.illustration, ['Ann Artist']); assert.deepEqual(b.credits.translation, ['Tia Translator']);
  assert.deepEqual(b.credits.pictureRules, { own: 4, inherited: 0, unlabeled: 0 });
  assert.equal(b.questions.filter(x => x.kind === 'inference').length, 1);
  for (const [i, x] of b.questions.entries()) assert.equal(x.choices[x.answer], qs[i].right);
  assert.ok(['k', '1'].includes(b.grade));
});

test('evaluateBloom: CC BY-SA and CC0 books come in with their own license; NC, ND, custom and unclear ones do not', () => {
  const sa = ev({ m: { license: 'cc-by-sa' }, h: { licenseUrl: 'http://creativecommons.org/licenses/by-sa/4.0/' } });
  assert.equal(sa.status, 'included', sa.reason);
  assert.equal(sa.book.credits.licenseName, 'CC BY-SA 4.0'); assert.equal(sa.book.credits.shareAlike, true);
  const sa3 = ev({ m: { license: 'cc-by-sa' }, h: { licenseUrl: 'http://creativecommons.org/licenses/by-sa/3.0/' } });
  assert.equal(sa3.book.credits.licenseName, 'CC BY-SA 3.0');
  const zeroPics = { pages: [1, 2, 3].map(n => page({ texts: { en: `Page ${n} of a short story here.` }, pics: [img(`${n}.jpg`, { license: 'cc0' })] })), licenseUrl: 'http://creativecommons.org/publicdomain/zero/1.0/' };
  const z = ev({ m: { license: 'cc0' }, h: { ...zeroPics, cover: img('cover.jpg', { license: 'cc0' }) } });
  assert.equal(z.status, 'excluded', 'the data div cover says CC BY: stricter than a CC0 book');
  assert.match(z.reason, /cover picture is BY, stricter than the book's CC0 1\.0/);
  assert.match(ev({ m: { license: 'cc-by-nc' } }).reason, /book license: NC/);
  assert.match(ev({ m: { license: 'cc-by-nd' } }).reason, /book license: ND/);
  assert.match(ev({ m: { license: 'custom' } }).reason, /book license: CUSTOM/);
  assert.match(ev({ h: { licenseUrl: '' } }).reason, /no clear version/);
  assert.match(ev({ h: { licenseUrl: 'http://creativecommons.org/licenses/by/3.0/za/' } }).reason, /no clear version/);
  assert.match(ev({ h: { licenseUrl: 'http://creativecommons.org/licenses/by-sa/4.0/' } }).reason, /disagree/);
});

test('evaluateBloom: one picture that is not free enough, or not clearly the book\'s, leaves the whole book out', () => {
  const withPic = pic => ({ pages: [page({ pics: [img('one.jpg')] }), page({ texts: { en: 'The cat saw a ball.' }, pics: [pic] }), page({ texts: { en: 'The end.' }, pics: [img('three.jpg')] })] });
  assert.match(ev({ h: withPic(img('x.jpg', { license: 'cc-by-nc' })) }).reason, /page 2 picture license: NC/);
  assert.match(ev({ h: withPic(img('x.jpg', { license: 'cc-by-nd' })) }).reason, /page 2 picture license: ND/);
  assert.match(ev({ h: withPic(img('x.jpg', { license: 'custom' })) }).reason, /page 2 picture license: CUSTOM/);
  assert.match(ev({ h: withPic(img('x.jpg', { license: 'gpl-3' })) }).reason, /page 2 picture license: unreadable/);
  assert.match(ev({ h: withPic(img('x.jpg', { license: 'cc-by-sa' })) }).reason, /page 2 picture is BY-SA, stricter than the book's CC BY 4\.0/);
  assert.match(ev({ h: withPic(img('x.jpg', { license: '', copyright: '© 2019 Someone Else' })) }).reason, /page 2 picture has no license and another copyright holder/);
  assert.match(ev({ h: withPic(img('x.jpg', { copyright: 'Used with permission of the artist' })) }).reason, /page 2 picture says/);
  assert.match(ev({ h: withPic(img('x.jpg', { copyright: 'Copyright © 2008, Microsoft Clip Art' })) }).reason, /credited to Microsoft, whose terms are not an open license/);
  assert.match(ev({ h: withPic(img('x.jpg', { creator: 'Pixabay' })) }).reason, /credited to Pixabay/);
  // No license of its own, but the book's own copyright holder: it inherits the book's license, and that is recorded.
  const inh = ev({ h: withPic(img('x.jpg', { license: '', copyright: 'Copyright © 2020, Good Books' })) });
  assert.equal(inh.status, 'included', inh.reason);
  assert.deepEqual(inh.book.credits.pictureRules, { own: 3, inherited: 1, unlabeled: 0 });
  // A CC0 picture in a CC BY book is fine (freer than the book).
  assert.equal(ev({ h: withPic(img('x.jpg', { license: 'cc0' })) }).status, 'included');
  // A BY-SA picture in a BY-SA book is fine.
  const saBook = ev({ m: { license: 'cc-by-sa' }, h: { ...withPic(img('x.jpg', { license: 'cc-by-sa' })), licenseUrl: 'http://creativecommons.org/licenses/by-sa/4.0/' } });
  assert.equal(saBook.status, 'included', saBook.reason);
  // A picture the folder does not have.
  assert.match(ev({ names: ['one.jpg', 'two.jpg', 'cover.jpg'] }).reason, /three\.jpg is not in the book's folder/);
  // An SVG is not converted.
  assert.match(ev({ h: withPic(img('x.svg')) }).reason, /not a bitmap/);
});

test('evaluateBloom: at most 2 pictures with no license and no copyright at all take the book\'s license (owner\'s rule)', () => {
  // Six story pages and a cover (7 pictures); `bare` of them carry no license and no copyright.
  const bareImg = f => img(f, { license: null, copyright: '', creator: '' });
  const book = (bare, { pic = bareImg, cover = img('cover.jpg') } = {}) => ({ cover, pages: [1, 2, 3, 4, 5, 6].map(n => page({ texts: { en: `Page ${n}: the cat ran and sat.` }, pics: [n <= bare ? pic(`${n}.jpg`) : img(`${n}.jpg`)] })) });
  const q6 = { picks: { AbCdEf1234: { questions: qs } } };
  for (const n of [0, 1, 2]) {
    const r = ev({ h: book(n), c: q6 });
    assert.equal(r.status, 'included', `${n} unlabeled: ${r.reason}`);
    assert.deepEqual(r.book.credits.pictureRules, { own: 7 - n, inherited: 0, unlabeled: n }, `${n} unlabeled are counted`);
  }
  const three = ev({ h: book(3), c: q6 });
  assert.equal(three.status, 'excluded');
  assert.match(three.reason, /^3 pictures have no license or copyright \(at most 2 may take the book's license\)/);
  assert.equal(B.MAX_UNLABELED, 2);
  // A higher limit is only for the report's survey; the majority rule still holds unless asked.
  assert.equal(IMP.evaluateBloom({ entry: entry(), meta: meta(), html: bloomHtml(book(3)), curation: cur(q6), maxUnlabeled: 3 }).status, 'included');
  const most = IMP.evaluateBloom({ entry: entry(), meta: meta(), html: bloomHtml(book(6)), curation: cur(q6), maxUnlabeled: Infinity });
  assert.match(most.reason, /most pictures have no license or copyright \(6 of 7\)/);
  assert.equal(IMP.evaluateBloom({ entry: entry(), meta: meta(), html: bloomHtml(book(6)), curation: cur(q6), maxUnlabeled: Infinity, allowMostUnlabeled: true }).status, 'included');
  // A small book: 2 unlabeled of 3 pictures is most of them.
  const small = ev({ h: { pages: [page({ pics: [bareImg('one.jpg')] }), page({ texts: { en: 'The cat saw a ball.' }, pics: [bareImg('two.jpg')] })] }, c: { picks: { AbCdEf1234: { questions: qs.map(x => ({ ...x, page: Math.min(x.page, 2) })) } } } });
  assert.match(small.reason, /most pictures have no license or copyright \(2 of 3\)/);
  // Unlabeled but credited to a stock or clip-art source, or named after one: still out.
  assert.match(ev({ h: book(1, { pic: f => img(f, { license: null, copyright: '', creator: 'Pixabay' }) }), c: q6 }).reason, /page 1 picture is credited to Pixabay/);
  assert.match(ev({ h: book(1, { pic: f => img(f, { license: '', copyright: '', creator: 'Microsoft Clip Art' }) }), c: q6 }).reason, /credited to Microsoft/);
  assert.match(ev({ h: book(1, { pic: f => img(`freepik-${f}`, { license: null, copyright: '', creator: '' }) }), c: q6 }).reason, /credited to freepik/);
  // An explicit stricter license, or another holder, is not "unlabeled": still out.
  assert.match(ev({ h: book(1, { pic: f => img(f, { license: 'cc-by-nc', copyright: '', creator: '' }) }), c: q6 }).reason, /page 1 picture license: NC/);
  assert.match(ev({ h: book(1, { pic: f => img(f, { license: '', copyright: 'All rights reserved', creator: '' }) }), c: q6 }).reason, /page 1 picture says "All rights reserved"/);
  assert.match(ev({ h: book(1, { pic: f => img(f, { license: '', copyright: '© 2019 Someone Else', creator: '' }) }), c: q6 }).reason, /page 1 picture has no license and another copyright holder/);
  // The cover counts too, and a picture labeled in one of its two places is labeled.
  const cov = B.parseBloomHtml(bloomHtml(book(2)));
  cov.cover = { file: 'cover.jpg', license: '', copyright: '', creator: '' };
  assert.match(B.checkBloomPictures(cov, 'cc-by-4.0', '© 2020 Good Books').reason, /^3 pictures have no license or copyright/);
  const parsed = B.parseBloomHtml(bloomHtml(book(0)));
  parsed.cover.also = { file: 'cover.jpg', license: '', copyright: '', creator: '' };
  assert.deepEqual(B.checkBloomPictures(parsed, 'cc-by-4.0', '© 2020 Good Books').rules, { own: 7, inherited: 0, unlabeled: 0 });
});

test('evaluateBloom: a person\'s text corrections are applied exactly, change the grade\'s text, and are credited', () => {
  const fixes = [{ page: 2, from: 'big red ball', to: 'big, red ball' }, { page: 0, from: 'The Cat & the Ball', to: 'The Cat and the Ball' }];
  const r = ev({ c: { picks: { AbCdEf1234: { questions: qs, fixes } } } });
  assert.equal(r.status, 'included', r.reason);
  assert.equal(r.book.pages[1].text, 'The cat saw a big, red ball.');
  assert.equal(r.book.title, 'The Cat and the Ball');
  assert.equal(r.book.credits.corrections, 2);
  assert.ok(!('corrections' in ev().book.credits), 'no corrections, no note');
  // A correction that does not match exactly once keeps the book out (so a changed book is noticed).
  assert.match(ev({ c: { picks: { AbCdEf1234: { questions: qs, fixes: [{ page: 2, from: 'blue ball', to: 'red ball' }] } } } }).reason, /text corrections: bl-AbCdEf1234 fix 1: "blue ball" is not on page 2/);
  assert.match(ev({ c: { picks: { AbCdEf1234: { questions: qs, fixes: [{ page: 3, from: 'ran', to: 'run' }] } } } }).reason, /"ran" is on page 3 more than once/);
  assert.match(ev({ c: { picks: { AbCdEf1234: { questions: qs, fixes: [{ page: 9, from: 'a', to: 'b' }] } } } }).reason, /fix 1: page must be 0/);
  // The report lists every correction.
  const md = IMP.reportMarkdown([r], { generated: '2026-01-01' });
  assert.match(md, /Text corrected by Oomba: 1 books, 2 corrections/);
  assert.match(md, /bl-AbCdEf1234 The Cat and the Ball: p2 "big red ball" → "big, red ball"; p0 "The Cat & the Ball" → "The Cat and the Ball"/);
});

test('evaluateBloom: English on every page, one picture a page, nothing restricting it, finished books only', () => {
  const pages3 = (p2) => ({ pages: [page({ pics: [img('one.jpg')] }), p2, page({ texts: { en: 'The end.' }, pics: [img('three.jpg')] })] });
  assert.match(ev({ h: pages3(page({ texts: { es: 'Solo español.' }, pics: [img('two.jpg')] })) }).reason, /English missing on page 2/);
  assert.match(ev({ h: pages3(page({ pics: [img('a.jpg'), img('b.jpg')] })) }).reason, /page 2 has 2 pictures/);
  assert.match(ev({ h: pages3(page({ pics: [] })) }).reason, /page 2 has no picture/);
  // A picture with no words in any language: kept in the middle, left out at the end.
  const mid = ev({ h: pages3(page({ texts: {}, pics: [img('two.jpg')] })) });
  assert.equal(mid.status, 'included', mid.reason); assert.equal(mid.book.pages[1].text, '');
  const end = ev({ h: { pages: [page({ pics: [img('one.jpg')] }), page({ texts: { en: 'The cat saw a ball.' }, pics: [img('two.jpg')] }), page({ texts: { en: 'The end.' }, pics: [img('three.jpg')] }), page({ texts: {}, pics: [img('logo.jpg')] })] } });
  assert.equal(end.status, 'included', end.reason); assert.equal(end.book.pageCount, 3); assert.equal(end.book.endPagesLeftOut, 1);
  assert.match(ev({ m: { licenseNotes: 'Not for distribution outside Kenya' } }).reason, /notes say "Not for distribution/);
  assert.match(ev({ m: { credits: 'All rights reserved' } }).reason, /notes say/);
  assert.match(ev({ h: { ack: 'Printed with permission of the author' } }).reason, /notes say/);
  assert.match(ev({ e: { tags: ['list:IMS-ShellBooks'] } }).reason, /tagged/);
  assert.match(ev({ e: { draft: true } }).reason, /draft/);
  assert.match(ev({ m: { internetLimits: { downloadShell: { countryCode: 'PG' } } } }).reason, /internet limits/);
  assert.match(IMP.evaluateBloom({ entry: entry(), meta: meta(), html: '', curation: cur() }).reason, /HTML missing/);
  assert.match(IMP.evaluateBloom({ entry: null, meta: meta(), html: bloomHtml(), curation: cur() }).reason, /not in the Bloom list/);
  // Not picked: licensed, with the person's reason when there is one.
  assert.match(ev({ c: { picks: {}, skipped: { AbCdEf1234: 'A duplicate of sw-0001.' } } }).reason, /read and left out: A duplicate of sw-0001\./);
  assert.match(ev({ c: { picks: {} } }).reason, /not read yet/);
});

test('evaluateBloom: credits carry no contact details, and nothing about where the book is stored', () => {
  const r = ev({ m: { credits: 'Writer: Sam Writer (sam.writer@example.org, +1 555 123 4567)\nIllustration: Ann Artist' }, h: { smallCredits: 'Author: Sam Writer' } });
  assert.equal(r.status, 'included', r.reason);
  const s = JSON.stringify(r.book);
  assert.ok(!s.includes('@') && !s.includes('555') && !/s3\.amazonaws|baseUrl/i.test(s), s);
  assert.deepEqual(r.book.credits.text, ['Sam Writer']);
});

test('the manifest is shared: each importer replaces only its own books', () => {
  const sw = { id: 'sw-0001', source: 'storyweaver', grade: '1', title: 'B' };
  const old = { version: 2, books: [sw, { id: 'bl-Old0000000', source: 'bloom', grade: 'k', title: 'Old' }] };
  const r = ev();
  const m = IMP.mergeManifest(old, [r.book]);
  assert.deepEqual(m.books.map(b => b.id).sort(), ['bl-AbCdEf1234', 'sw-0001']);
  const back = SW.manifestOf([], { old: m });
  assert.deepEqual(back.books.map(b => b.id), ['bl-AbCdEf1234'], 'the StoryWeaver importer keeps the Bloom books');
  const md = IMP.reportMarkdown([r, { sourceId: 'Zz00000000', title: 'NC', status: 'excluded', reason: 'book license: NC' }], { totalBytes: 1048576, generated: '2026-01-01' });
  assert.match(md, /Included: \*\*1\*\*/); assert.match(md, /\| bl-Zz00000000 \| NC \| book license: NC \|/);
});

// ------------------------------------------------------------------ what is shipped
test('shipped: Bloom books in the manifest pass the rule, were picked by a person, and nothing names storage or an email', () => {
  const curationText = fs.readFileSync(path.join(ROOT, 'seed-library/bloom.json'), 'utf8');
  const manifestText = fs.readFileSync(path.join(ROOT, 'server/library/manifest.json'), 'utf8');
  const report = fs.readFileSync(path.join(ROOT, 'docs/story-library-bloom.md'), 'utf8');
  for (const [name, text] of [['seed-library/bloom.json', curationText], ['server/library/manifest.json', manifestText], ['docs/story-library-bloom.md', report]]) {
    assert.ok(!text.includes('@'), `${name} has an @`);
    assert.ok(!/s3\.amazonaws\.com|amazonaws|baseUrl/i.test(text), `${name} names Bloom's storage`);
  }
  const curation = JSON.parse(curationText);
  const books = LIB.books().filter(b => b.source === 'bloom');
  assert.ok(books.length >= 1, 'Bloom books are in the library');
  for (const b of books) {
    assert.match(b.id, /^bl-[A-Za-z0-9]{10}$/); assert.equal(b.id, `bl-${b.sourceId}`);
    assert.ok(curation.picks[b.sourceId], `${b.id} was picked by a person`);
    assert.ok(B.isBloomAllowed(b.credits.license), `${b.id} license`);
    assert.equal(b.credits.licenseName, B.BLOOM_ALLOWED[b.credits.license].name);
    assert.equal(b.credits.shareAlike, B.BLOOM_ALLOWED[b.credits.license].family === 'by-sa');
    assert.equal(b.credits.platform, 'Bloom Library'); assert.ok(b.credits.publisher);
    assert.equal(b.credits.sourceUrl, `https://bloomlibrary.org/book/${b.sourceId}`);
    const pr = b.credits.pictureRules;
    assert.ok(pr.own + pr.inherited + pr.unlabeled === b.pages.length + 1, `${b.id}: every picture checked`);
    assert.ok(pr.unlabeled <= B.MAX_UNLABELED && pr.unlabeled * 2 <= b.pages.length + 1, `${b.id}: at most ${B.MAX_UNLABELED} unlabeled pictures, never most`);
    const fixes = curation.picks[b.sourceId].fixes || [];
    assert.equal(b.credits.corrections || 0, fixes.length, `${b.id}: the corrections are counted`);
    for (const f of fixes) assert.ok(f.page >= 0 && f.page <= b.pages.length && f.from !== f.to && (f.page === 0 ? b.title : b.pages[f.page - 1].text).includes(f.to), `${b.id}: correction on page ${f.page} is in the text`);
    assert.ok(Array.isArray(b.otherLangs));
    assert.deepEqual(I.checkQuestions(b.questions, b.pages.length), [], b.id);
    assert.equal(b.questions.filter(x => x.kind === 'inference').length, 1, `${b.id}: one inference question`);
    const m = I.measure(b.pages.map(p => p.text));
    assert.equal(I.gradeOf(m).grade, b.grade, `${b.id}: the grade is the rule's`);
    for (const src of [b.cover.src, ...b.pages.map(p => p.image.src)]) assert.ok(fs.existsSync(path.join(ROOT, 'public', src)), src);
    assert.ok(b.pages.every(p => p.image.w > 0 && p.image.h > 0), `${b.id}: picture sizes for layout`);
  }
  // Every candidate has a reason: picked, skipped by a person, or left out by the rule in the report.
  assert.ok(!report.includes('not read yet'), 'every licensed candidate has been read');
  for (const id of Object.keys(curation.skipped)) assert.ok(!curation.picks[id], `${id} is both picked and skipped`);
});

// ------------------------------------------------------------------ over HTTP: the source and license per book
test('pages: a Bloom book shows Bloom Library, its own license and deed, and the share-alike note when it is CC BY-SA', async () => {
  const { createApp } = await import('../../server/app.js');
  const server = createApp().listen(0); await new Promise(r => server.once('listening', r));
  const BASE = `http://127.0.0.1:${server.address().port}`;
  const get = async p => { const r = await fetch(BASE + p); return { status: r.status, text: await r.text() }; };
  try {
    const bloom = LIB.books().filter(b => b.source === 'bloom');
    const by = bloom.find(b => !b.credits.shareAlike), sa = bloom.find(b => b.credits.shareAlike);
    const sw = LIB.books().find(b => b.source === 'storyweaver');
    const lib = await get('/read');
    assert.match(lib.text, /Bloom Library/); assert.match(lib.text, /StoryWeaver/);
    assert.match(lib.text, /Pratham Books \(StoryWeaver\) and the authors and publishers on Bloom Library/);
    const card = new RegExp(`href="/library/${by.id}"[\\s\\S]*?lb-src" dir="ltr">Bloom Library<`);
    assert.match(lib.text, card, 'the card names its source');
    const page = await get(`/library/${by.id}`);
    assert.equal(page.status, 200);
    const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    assert.match(page.text, new RegExp(`<a href="${esc(by.credits.licenseUrl)}"[^>]*>${esc(by.credits.licenseName)}</a>`));
    assert.match(page.text, new RegExp(`${esc(by.credits.publisher.replace(/&/g, '&amp;'))}, Bloom Library`));
    assert.match(page.text, /Bloom Library, SIL Global and the book&#39;s publisher do not endorse Oomba|Bloom Library, SIL Global and the book's publisher do not endorse Oomba/);
    assert.match(page.text, new RegExp(`href="https://bloomlibrary\\.org/book/${by.sourceId}"[^>]*>See the original book on Bloom Library\\.`));
    assert.ok(!/Pratham Books does not endorse/.test(page.text), 'not the StoryWeaver note');
    assert.ok(!/shared under the same license/.test(page.text), 'no share-alike note on a CC BY book');
    if (sa) {
      const p = await get(`/library/${sa.id}`), r = await get(`/library/${sa.id}/read`);
      for (const t of [p.text, r.text]) {
        assert.match(t, new RegExp(`these adapted pages are shared under the same license, ${esc(sa.credits.licenseName)}`));
        assert.match(t, new RegExp(esc(sa.credits.licenseUrl)));
      }
    }
    // A book whose mistakes Oomba corrected says so, before the share-alike note that covers the corrected pages.
    const fixed = bloom.find(b => b.credits.corrections && !b.credits.shareAlike), fixedSA = bloom.find(b => b.credits.corrections && b.credits.shareAlike);
    for (const b of [fixed, fixedSA].filter(Boolean)) {
      for (const t of [(await get(`/library/${b.id}`)).text, (await get(`/library/${b.id}/read`)).text]) {
        assert.match(t, b.credits.shareAlike ? /Oomba corrected spelling and punctuation\. Oomba resized the pictures and shows the book one page at a time; these adapted pages are shared under the same license/ : /Oomba corrected spelling and punctuation\. Oomba resized the pictures/, b.id);
      }
    }
    const plain = bloom.find(b => !b.credits.corrections);
    assert.ok(!/Oomba corrected spelling/.test((await get(`/library/${plain.id}`)).text), 'no correction note on an uncorrected book');
    const swPage = await get(`/library/${sw.id}`);
    assert.match(swPage.text, /Pratham Books, StoryWeaver/); assert.match(swPage.text, /Pratham Books does not endorse Oomba/);
    // Search finds Bloom books by their words and by "bloom".
    const words = by.pages[0].text.split(/[^\p{L}]+/u).filter(w => w.length > 4).slice(0, 2).join(' ');
    assert.ok(LIB.search({ q: words }).some(b => b.id === by.id), words);
    assert.equal(LIB.search({ q: 'bloom library' }).length, bloom.length);
  } finally { server.closeAllConnections(); server.close(); }
});
