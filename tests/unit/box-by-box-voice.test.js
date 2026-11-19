// The Big Divide: every line the speaker button can read is one the AI voice will read, in every language. For each
// kind, method and option (and the edge cases: 0 in the quotient, a repeating decimal, a fraction that simplifies, a 0
// part, a carry into the millions), each step's question, what it tells, the nudges and the last line are said in natural
// words and checked against the server's allowlist (server/services/tts-lines.js). One process per language
// (_box-voice-walk.mjs), as the game's language is fixed when it loads.
// Found by the play-through pass: a list of decimal chunks ("3 tenths, 4 tenths or 5 tenths") was refused (a fill word
// before a comma), Russian's own plural forms (key.few) were not on the list, and 9999 × 999 had no name for the place
// its last carry goes to (the millions).
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const LANGS = ['en', 'en-GB', 'es', 'pt', 'fr', 'de', 'it', 'nl', 'ru', 'ja', 'zh-Hant', 'ar', 'he'];

for (const lang of LANGS)
  test(`every line the speaker reads in ${lang} is on the AI voice's list`, { timeout: 120e3 }, () => {
    const out = JSON.parse(execFileSync(process.execPath, [path.join(HERE, '_box-voice-walk.mjs'), lang], { encoding: 'utf8', maxBuffer: 1 << 24 }));
    assert.ok(out.lines > 2000, `lines read: ${out.lines}`);
    assert.deepEqual(out.bad, [], `${out.badCount} lines refused`);
  });

test('a carry past the hundred thousands has a place name (9999 × 999)', async () => {
  const L = await import(path.join(HERE, '../../tools/box-by-box/src/lib/logic.ts'));
  const sheet = L.sheetFor(L.parseItem({ k: 'multiply', p: [[9999, 999]], l: 'guided' }), [9999, 999]);
  const said = sheet.steps.flatMap((s) => (s.ask ? [s.prompt?.({}) ?? ''] : [])).join(' ');
  assert.doesNotMatch(said, /w\.place|undefined/);
  assert.match(said, /millions/);
});
