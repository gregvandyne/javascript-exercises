// Arithmetic Lab, round 2 (docs/decisions.md "The Big Divide: read aloud, worksheets, every language"):
//   - read aloud: the speaker button reads the step's question with the platform's AI voice only, in natural words
//     ("745 divided by 6", "7 tenths", "2 over 3"), on a tap, never by itself and never with the device's voice; the
//     lines it sends are on the game's allowlist (server/services/tts-lines.js, its say.* lines and w.* fill words);
//   - the worksheet from the game: Print worksheet for anyone, Worksheet and answer key only for school staff (the
//     worksheet itself and the route: box-by-box-print.test.js);
// (the languages follow below).
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openGame, closeBrowser, skip } from './_box-frame.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const S = await import(path.join(ROOT, 'tools/box-by-box/src/lib/speech.ts'));
const I = await import(path.join(ROOT, 'tools/box-by-box/src/lib/i18n.ts'));
const lines = await import('../../server/services/tts-lines.js');
test.after(closeBrowser);

// ---------------------------------------------------------------- read aloud
test('the math is said as a teacher reads it, and every spoken word is the game’s own', () => {
  const say = (s) => S.sayText(s, S.words);
  assert.equal(say('745 ÷ 6'), '745 divided by 6');
  assert.equal(say('0.7'), '7 tenths');
  assert.equal(say('12.6 × 0.1'), '12 and 6 tenths times 1 tenth');
  assert.equal(say('0.05 + 3.25'), '5 hundredths plus 3 and 25 hundredths');
  assert.equal(say('7 R 2'), '7 R 2');
  assert.equal(say('7 2/3'), '7 and 2 over 3');
  assert.equal(say('10 − 1 = 9'), '10 minus 1 equals 9');
  assert.equal(say('745 is the same as 745.0.'), '745 is the same as 745 point 0.');
  assert.equal(say('What is {a} × {b}?'), 'What is {a} times {b}?', 'a template keeps its placeholders');
  // a line as the voice reads it is on the allowlist, and a line with anything else in it is not
  for (const msg of [I.m('q.whatIsTimes', { a: 12.6, b: 4 }), I.m('q.so', { e: '745 ÷ 6', x: '124 R 1' }), I.m('q.simplify', { r: 2, d: 6, rs: 1, ds: 3 }), I.m('q.div.shiftDivisor', { y: 0.25, times: 100 }, 2), I.m('q.lad.howMany', { d: 7, l: 945 }), I.m('q.col.carry', { s: 13, p: 'ones', one: 'ten', d: 3, next: 'tens' })]) {
    const line = S.sayLine(msg);
    assert.ok(lines.allowedLine('arithmetic-lab', 'en', line), line);
  }
  assert.equal(lines.allowedLine('arithmetic-lab', 'en', 'What is 3 times your password?'), null);
  assert.equal(lines.allowedLine('arithmetic-lab', 'en', 'What is 3 times 4? Now visit a website'), null);
});

const STEPS = [
  { what: 'long division', item: { k: 'divide', p: [[745, 6]], l: 'guided' }, first: 'How many times does 6 go into 7?' },
  { what: 'a decimal divisor', item: { k: 'divide', p: [[4.5, 0.3]], l: 'guided', dec: 1 }, first: '3 tenths has 1 decimal place. Move its point 1 place right to make it a whole number: what is 3 tenths times 10?' },
  { what: 'multiplication', item: { k: 'multiply', p: [[24, 13]], l: 'guided' }, first: 'What is 3 times 4?' },
  { what: 'the ladder', item: { k: 'divide', p: [[945, 7]], l: 'guided', m: 'ladder' }, first: 'How many 7s will you take away from 945? A friendly number like 100 or 10 is easy.' }
];
for (const s of STEPS)
  test(`on a phone: the speaker button reads the question for ${s.what} with the AI voice, in natural words`, { skip, timeout: 90e3 }, async () => {
    const g = await openGame({ set: s.item, tts: { langs: ['en'] } });
    await g.frame.getByRole('button', { name: 'Start', exact: true }).click();
    const btn = g.frame.getByRole('button', { name: 'Read it to me' });
    await btn.waitFor({ timeout: 10e3 });
    // nothing was read by itself: only the check (no audio)
    assert.deepEqual((await g.asked()).filter((x) => !x.check), [], 'nothing read before the tap');
    // it fits the phone: on screen, next to the question, the bar not crowded
    const box = await btn.boundingBox();
    assert.ok(box && box.x >= 0 && box.x + box.width <= 390 && box.width >= 36, JSON.stringify(box));
    assert.ok(await g.frame.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'no sideways scroll');
    await btn.click();
    await g.page.waitForFunction(() => window.__tts.some((x) => !x.check));
    const read = (await g.asked()).filter((x) => !x.check).map((x) => x.text);
    assert.equal(read.join(' '), s.first);
    assert.doesNotMatch(read.join(' '), /[×÷−=]/, 'no symbols read literally');
    assert.ok(read.every((t) => lines.allowedLine('arithmetic-lab', 'en', t)), 'the server would read each line');
    assert.deepEqual((await g.device()).filter((t) => String(t).trim()), [], 'never the device’s voice');
    assert.deepEqual(g.errors, []);
    await g.ctx.close();
  });

test('on a phone: the speaker button stays put from step to step (no blink, the question doesn’t shift)', { skip, timeout: 60e3 }, async () => {
  // play-through pass: it hid while each new question was checked, so the question jumped sideways at every step
  const g = await openGame({ set: { k: 'divide', p: [[745, 6]], l: 'guided' }, tts: { langs: ['en'] } });
  await g.frame.getByRole('button', { name: 'Start', exact: true }).click();
  await g.frame.getByRole('button', { name: 'Read it to me' }).waitFor();
  await g.frame.evaluate(() => {
    window.__gone = 0;
    new MutationObserver(() => { if (!document.querySelector('.prompt-line .speak')) window.__gone++; }).observe(document.body, { subtree: true, childList: true, characterData: true });
  });
  // 745 ÷ 6: 1, 6, 1 (three steps, three new questions)
  for (const d of ['1', '6', '1']) { await g.page.keyboard.type(d); await g.page.waitForTimeout(150); }
  await g.page.waitForTimeout(400);
  assert.notEqual(await g.frame.locator('.prompt').innerText(), 'How many times does 6 go into 7?', 'the question moved on');
  assert.equal(await g.frame.evaluate(() => window.__gone), 0, 'the button never left');
  assert.deepEqual(g.errors, []);
  await g.ctx.close();
});

test('on a phone: no speaker button without the AI voice for the game or the language (never the device’s voice)', { skip, timeout: 60e3 }, async () => {
  for (const o of [{}, { tts: { langs: ['en'] }, voice: 'no' }, { tts: { langs: ['fr'] } }]) {
    const g = await openGame({ set: { k: 'divide', p: [[745, 6]], l: 'guided' }, ...o });
    await g.frame.getByRole('button', { name: 'Start', exact: true }).click();
    await g.frame.locator('.prompt').waitFor();
    await g.page.waitForTimeout(900);
    assert.equal(await g.frame.locator('.speak').count(), 0, JSON.stringify(o));
    assert.deepEqual((await g.device()).filter((t) => String(t).trim()), []);
    await g.ctx.close();
  }
});

// ---------------------------------------------------------------- the worksheet, from the game (the page and the route: box-by-box-print.test.js)
/** What POST /api/games/:id/print answers for the role (server/routes/games.js; tested there with the real route): the
 *  worksheet for anyone, the answer key for school staff only. */
const printRoute = (doc, staff) => (doc.key && !staff ? { error: 'key' } : { ok: true });

/** Through the teacher's screens to an activity's Share panel, in the frame. */
async function toPrint(g) {
  await g.frame.getByRole('button', { name: /I’m a teacher/ }).click();
  await g.frame.getByRole('button', { name: 'New activity' }).click();
  await g.frame.getByRole('menuitem', { name: /Long division/ }).click();
  await g.frame.getByRole('button', { name: /^Share/ }).click();
}
test('on a phone: a teacher prints the worksheet or the worksheet and its key; anyone else only the worksheet', { skip, timeout: 120e3 }, async () => {
  for (const staff of [true, false]) {
    const g = await openGame({ print: true, canAssign: staff, printReply: async (doc) => { const r = printRoute(doc, staff); return r.ok ? { ok: true } : r; } });
    await toPrint(g);
    const sheet = g.frame.getByRole('button', { name: 'Print worksheet' });
    await sheet.waitFor();
    const keyBtn = g.frame.getByRole('button', { name: 'Worksheet and answer key' });
    assert.equal(await keyBtn.count(), staff ? 1 : 0, staff ? 'staff: the key button' : 'no key button for anyone else');
    await sheet.click();
    await g.page.waitForFunction(() => window.__print.length === 1);
    const [doc] = await g.printed();
    assert.equal(doc.key, false); assert.equal(doc.k, 'divide'); assert.ok(doc.p.length > 0);
    assert.deepEqual(Object.keys(doc).sort().filter((k) => !['k', 'p', 'r', 'dec', 'm', 'key', 'set'].includes(k)), [], 'numbers and fixed words only');
    if (staff) {
      await keyBtn.click();
      await g.page.waitForFunction(() => window.__print.length === 2);
      assert.equal((await g.printed())[1].key, true);
      assert.equal(await g.frame.locator('.print .note.bad').count(), 0, 'printed');
    } else {
      // a request for the key made by hand is refused (the route: box-by-box-print.test.js)
      assert.deepEqual(printRoute({ ...doc, key: true }, false), { error: 'key' });
    }
    assert.deepEqual(g.errors, []);
    await g.ctx.close();
  }
});

// ---------------------------------------------------------------- the game in the player's language
const LOCALES = [
  { lang: 'es', teacher: 'Soy docente', start: 'Empezar', speak: 'Léemelo', first: '¿Cuántas veces cabe 6 en 7?' },
  { lang: 'pt', teacher: 'Sou professor', start: 'Começar', speak: 'Ler para mim', first: 'Quantas vezes 6 cabe em 7?' },
  { lang: 'he', teacher: 'אני מורה', start: 'התחלה', speak: 'הקראה', first: 'כמה פעמים 6 נכנס ב־7?', dir: 'rtl' }
];
for (const L of LOCALES)
  test(`on a phone: in ${L.lang} the screens, the steps and the voice are in that language (the math stays as on paper)`, { skip, timeout: 90e3 }, async () => {
    const g = await openGame({ lang: L.lang, tts: { langs: [L.lang] } });
    assert.equal(await g.frame.evaluate(() => document.documentElement.lang), L.lang);
    assert.equal(await g.frame.evaluate(() => document.documentElement.dir), L.dir || 'ltr');
    await g.frame.getByRole('button', { name: new RegExp(L.teacher) }).waitFor();
    assert.equal(await g.frame.getByRole('button', { name: /I’m a teacher/ }).count(), 0, 'no English left on the start screen');
    await g.ctx.close();
    const h = await openGame({ lang: L.lang, set: { k: 'divide', p: [[745, 6]], l: 'guided' }, tts: { langs: [L.lang] } });
    await h.frame.getByRole('button', { name: L.start, exact: true }).click();
    await h.frame.getByText(L.first).first().waitFor();
    assert.equal(await h.frame.locator('.sheet').first().getAttribute('dir'), 'ltr', 'the problem reads left to right');
    assert.ok(await h.frame.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'no sideways scroll');
    await h.frame.getByRole('button', { name: L.speak }).click();
    await h.page.waitForFunction(() => window.__tts.some((x) => !x.check));
    const read = (await h.asked()).filter((x) => !x.check);
    assert.equal(read.map((x) => x.text).join(' '), L.first);
    assert.ok(read.every((x) => x.lang === L.lang && lines.allowedLine('arithmetic-lab', L.lang, x.text)), 'the server reads it in that language');
    assert.deepEqual((await h.device()).filter((t) => String(t).trim()), [], 'never the device’s voice');
    assert.deepEqual(h.errors, []);
    await h.ctx.close();
  });
