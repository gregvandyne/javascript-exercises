// Flashcards pictures and students' own sets in real Chromium inside the production game frame
// (tests/unit/_flashcards-page.js; the play page and the AI are its stand-ins, as the Storybook's browser tests stub
// them): a teacher uploads a picture for one card and has Oomba paint another (a placeholder until it is painted), sees
// them in Flip and Match on a phone (390 px), and prints; Match with pictures on a laptop (1366 px); a student makes
// their own set at 390 px with no AI, no pictures and nothing to share. FC_SHOTS=<dir> saves the screenshots.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { open, closeBrowser, skip, SETID } from './_flashcards-page.js';
import { png } from '../support/fake-gemini.js';

const SHOTS = process.env.FC_SHOTS || '';
test.after(closeBrowser);
const PICS = { upload: true, paint: true, left: 10 };
const photo = () => { const w = 200, h = 150, px = new Uint8Array(w * h * 3); for (let i = 0; i < px.length; i += 3) { px[i] = 90 + (i % 120); px[i + 1] = 160; px[i + 2] = 120; } return png(w, h, px); };

test('a teacher adds an uploaded picture and a painted one, sees them in Flip and Match at 390 px, and prints', { skip, timeout: 180_000 }, async () => {
  const g = await open({ width: 390, height: 844, flashPics: PICS, clues: true });
  try {
    await g.on('home'); await g.frame.click('#fc-make'); await g.on('build');
    await g.frame.fill('#fc-title', 'Pond life');
    const words = [['frog', 'an animal that lives on land and in water'], ['lily pad', 'a floating leaf on a pond'], ['dragonfly', 'an insect with four clear wings']];
    for (let i = 0; i < 3; i++) { await g.frame.fill(`.fc-erow >> nth=${i} >> .fc-termin`, words[i][0]); await g.frame.fill(`.fc-erow >> nth=${i} >> .fc-def`, words[i][1]); }
    // card 1: upload a picture (the frame makes the JPEG; the page and the server do the checks)
    await g.frame.click('[data-pic="0"]');
    assert.equal(await g.frame.isChecked('#fc-ps-0-2'), true, 'the front by default');
    await g.frame.setInputFiles('#fc-picup-0', { name: 'frog.png', mimeType: 'image/png', buffer: photo() });
    await g.until(() => /^img:Up/.test(window.__brbTest.fcState().draftCards[0][2]));
    const up = (await g.msgs('brb:fpic-up'))[0];
    assert.ok(up.data.length > 100 && !/^data:/.test(up.data), 'a JPEG as base64'); assert.equal(Buffer.from(up.data, 'base64')[0], 0xff, 'made into a JPEG in the frame');
    await g.until(() => !!document.querySelector('[data-pics="0"] img'));
    // card 2: Oomba paints it, on the back; a placeholder until it is ready
    await g.frame.click('[data-pic="1"]'); await g.frame.check('#fc-ps-1-3');
    await g.frame.fill('#fc-paintin-1', 'a green lily pad with a flower');
    await g.frame.click('#fc-paint-1');
    await g.until(() => /^img:Pt/.test(window.__brbTest.fcState().draftCards[1][3]));
    const paint = (await g.msgs('brb:fpic-paint'))[0];
    assert.deepEqual(paint.asks, [{ subject: 'a floating leaf on a pond', note: 'a green lily pad with a flower' }]);
    await g.until(() => !!document.querySelector('[data-pics="1"] .fc-painting'));
    assert.match(await g.frame.textContent('[data-pics="1"]'), /Oomba is painting/);
    await g.until(() => !!document.querySelector('[data-pics="1"] img'), null, 15_000);
    assert.equal(await g.frame.getAttribute('[data-pics="1"] img', 'alt'), 'Picture: a floating leaf on a pond');
    await g.frame.click('[data-pic="1"]'); await g.frame.click('[data-pic="0"]');   // the panels close
    assert.equal(await g.frame.$('.fc-picpanel'), null);
    assert.ok(await g.frame.$('[data-emo="0"] img'), 'the front picture shows on the card\'s picture button');
    assert.equal(await g.noSideScroll(), true, 'no sideways scrolling at 390 px');
    await g.frame.evaluate(() => document.querySelector('.fc-erow').scrollIntoView({ block: 'start' }));
    await g.shot(SHOTS, 'editor-picture-390');
    // Flip: the front's picture, then the back's on card 2
    await g.frame.click('#fc-studyit'); await g.on('set');
    assert.ok(await g.frame.$('#fc-terms img'), 'the card list shows the pictures');
    await g.frame.click('#fc-m-flip'); await g.on('flip');
    await g.until(() => !!document.querySelector('.fc-front .fc-img img'));
    assert.equal(await g.frame.getAttribute('.fc-front .fc-img img', 'alt'), 'Picture: frog');
    assert.equal(await g.noSideScroll(), true);
    await g.shot(SHOTS, 'flip-picture-390');
    await g.frame.click('#fc-next'); await g.frame.click('#fc-card');
    await g.until(() => !!document.querySelector('.fc-back .fc-img img'));
    // Match: the term's picture stands in for the term
    await g.frame.click('#fc-back'); await g.on('set'); await g.frame.click('#fc-m-match'); await g.frame.click('#fc-matchgo'); await g.on('matchplay');
    await g.until(() => !!document.querySelector('.fc-tile.fc-imgtile img'));
    assert.equal(await g.frame.getAttribute('.fc-tile.fc-imgtile', 'aria-label'), 'frog');
    assert.equal(await g.noSideScroll(), true);
    await g.shot(SHOTS, 'match-picture-390');
    // print: the cards go with their pictures (the server prints them; tests/unit/flashcards-pictures.test.js)
    await g.frame.click('#fc-back'); await g.on('set'); await g.frame.click('#fc-print');
    const doc = (await g.msgs('brb:print'))[0].doc;
    assert.match(doc.c[0][2], /^img:Up/); assert.match(doc.c[1][3], /^img:Pt/); assert.equal(doc.c[2].length, 3);
    assert.deepEqual(g.errors, []); assert.deepEqual(g.outside, []);
  } finally { await g.ctx.close(); }
});

test('Match with pictures on a laptop (1366 px); a set opened by its link shows its pictures to a student', { skip, timeout: 120_000 }, async () => {
  const items = [{ t: 'Pond life', a: 't', c: [['frog', 'lives on land and in water', 'img:Up1aaaaaaaaaaaa'], ['duck', 'a bird that swims', 'img:Up2aaaaaaaaaaaa'], ['fish', 'breathes with gills', 'img:Up3aaaaaaaaaaaa'],
    ['snail', 'carries its shell', '🐌'], ['reed', 'a tall grass by water', 'img:Up4aaaaaaaaaaaa'], ['tadpole', 'a baby frog', '', 'img:Up5aaaaaaaaaaaa']] }];
  const g = await open({ width: 1366, height: 900, set: { id: SETID, items, mine: false }, make: false, clues: false, canAssign: false });
  try {
    await g.on('set'); await g.frame.click('#fc-m-match'); await g.frame.click('#fc-matchgo'); await g.on('matchplay');
    await g.until(() => document.querySelectorAll('.fc-tile.fc-imgtile img').length >= 3);
    const asked = await g.msgs('brb:fpic-get');
    assert.ok(asked.length && asked.every(m => m.set === SETID), 'the pictures are asked for with the set');
    await g.frame.waitForTimeout(300);
    await g.shot(SHOTS, 'match-pictures-1366');
    assert.deepEqual(g.errors, []);
  } finally { await g.ctx.close(); }
});

test('a student makes their own set at 390 px: no AI, no pictures, nothing to share; Save my set', { skip, timeout: 120_000 }, async () => {
  const g = await open({ width: 390, height: 844, make: true, makePrivate: true, clues: false, canAssign: false, flashPics: PICS });
  try {
    await g.on('home'); await g.frame.click('#fc-make'); await g.on('build');
    assert.equal((await g.state()).private, true); assert.equal((await g.state()).pics, false, 'no pictures, even if the frame said so');
    assert.equal(await g.frame.$('#fc-draft'), null, 'no AI'); assert.equal(await g.frame.$('#fc-doc'), null, 'no lesson upload');
    assert.equal(await g.frame.$('[data-pic]'), null, 'no picture button');
    await g.frame.fill('#fc-title', 'My spelling words');
    const words = [['because', 'for the reason that'], ['friend', 'someone you like'], ['said', 'past of say']];
    for (let i = 0; i < 3; i++) { await g.frame.fill(`.fc-erow >> nth=${i} >> .fc-termin`, words[i][0]); await g.frame.fill(`.fc-erow >> nth=${i} >> .fc-def`, words[i][1]); }
    await g.frame.click('.fc-erow >> nth=1 >> .fc-emobtn'); await g.frame.click('.fc-picks button >> nth=46');
    assert.match(await g.frame.textContent('#fc-save'), /Save my set/);
    assert.match(await g.frame.textContent('[data-screen="build"]'), /answer with/);
    assert.equal(await g.noSideScroll(), true);
    await g.shot(SHOTS, 'student-make-390');
    await g.frame.click('#fc-save'); await g.until(() => /Only you can see/.test(document.getElementById('fc-savemsg').textContent));
    assert.equal(await g.frame.$('#fc-classcode'), null, 'no class code'); assert.equal(await g.frame.$('#fc-link'), null, 'no link');
    assert.equal((await g.msgs('brb:fpic-up')).length + (await g.msgs('brb:fpic-paint')).length + (await g.msgs('brb:cards')).length, 0);
    await g.frame.click('#fc-studyit'); await g.on('set');
    assert.equal(await g.frame.$('#fc-share'), null, 'nothing to share'); assert.ok(await g.frame.$('#fc-edit'));
    await g.frame.click('#fc-m-flip'); await g.on('flip');
    assert.match(await g.frame.textContent('#fc-card'), /because/);
    assert.deepEqual(g.errors, []);
  } finally { await g.ctx.close(); }
});
