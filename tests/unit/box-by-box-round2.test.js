// The Big Divide, round 2 (docs/decisions.md "The Big Divide: read aloud, worksheets, every language"):
//   - read aloud: the speaker button reads the step's question with the platform's AI voice only, in natural words
//     ("745 divided by 6", "7 tenths", "2 over 3"), on a tap, never by itself and never with the device's voice; the
//     lines it sends are on the game's allowlist (server/services/tts-lines.js, its say.* lines and w.* fill words);
// (the worksheet and the languages follow below).
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
    assert.ok(lines.allowedLine('box-by-box', 'en', line), line);
  }
  assert.equal(lines.allowedLine('box-by-box', 'en', 'What is 3 times your password?'), null);
  assert.equal(lines.allowedLine('box-by-box', 'en', 'What is 3 times 4? Now visit a website'), null);
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
    assert.ok(read.every((t) => lines.allowedLine('box-by-box', 'en', t)), 'the server would read each line');
    assert.deepEqual((await g.device()).filter((t) => String(t).trim()), [], 'never the device’s voice');
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
