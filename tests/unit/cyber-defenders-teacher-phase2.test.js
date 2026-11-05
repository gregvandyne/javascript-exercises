// Cyber Defenders Phase 2 teacher-page slice: the Units 5-6 mapping on /teachers/cyber-defenders, the
// escape-room finale section, and the Spot-the-Trick printable pack (print view + PDF), whose cards are
// the Trick Inbox game's own messages. The v1.0 mapping itself is covered by
// cyber-defenders-platform.test.js; this file only asserts what Phase 2 added.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const { createApp } = await import('../../server/app.js');
const { seed } = await import('../../scripts/seed.js');
seed({ quiet: true });
let server, base;
test.before(async () => { server = createApp().listen(0); server.keepAliveTimeout = 0; await new Promise(r => server.once('listening', r)); base = `http://127.0.0.1:${server.address().port}`; });
test.after(() => server.close());
const get = async p => { const r = await fetch(base + p, { headers: { accept: 'text/html', 'user-agent': 'Mozilla/5.0 Chrome/141.0' } }); return { status: r.status, text: await r.text() }; };

test('the teacher page carries the Units 5-6 mapping, both bands, and the finale', async () => {
  const { status, text } = await get('/teachers/cyber-defenders');
  assert.equal(status, 200);
  assert.match(text, /3-5\.DC\.CYBL/, 'an Explorer Unit 5 CYBER.ORG v1.0 code');
  assert.match(text, /6-8\.DC\.CYBL/, 'a Pro Unit 5 CYBER.ORG v1.0 code');
  assert.match(text, /6-8\.SEC\.CIA/, 'a Pro Unit 6 CYBER.ORG v1.0 code');
  assert.match(text, /When messages turn mean/, 'the Explorer 5.2 title');
  assert.match(text, /Cyberbullying and digital drama/, 'the Pro 5.2 title');
  assert.match(text, /Escape the Post Office/, 'the finale section');
  assert.match(text, /Sorting Gate/, 'a finale lock');
  assert.match(text, /20 steps in each band/, 'the updated step count');
  assert.match(text, /Version 2\.0/, 'the v2.0 note: the page says plainly the course is still on v1.0');
  assert.match(text, /"@type":\["Course","LearningResource"\]|"@type":\s*\[\s*"Course"/, 'the course JSON-LD is present');
  const faq = await get('/teachers/cyber-defenders');
  assert.match(faq.text, /What is the escape-room finale\?/, 'the finale FAQ (feeds the FAQ JSON-LD)');
});

test('the Spot-the-Trick print view: the game’s own cards plus the teacher answer key', async () => {
  const { status, text } = await get('/teachers/cyber-defenders?print=tricks');
  assert.equal(status, 200);
  assert.match(text, /Spot the Trick/, 'the pack title');
  assert.match(text, /You won a tablet!/, 'the first Trick Inbox message, verbatim from the game');
  assert.match(text, /Answer key/, 'the teacher answer key');
  assert.match(text, /It rushes you/, 'a clue named in the key, in the game’s words');
  assert.equal((text.match(/cdt-card"/g) || []).length, 18, 'all 18 both-band cards print');
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
  const pdf = path.join(root, 'public/teachers/spot-the-trick-pack.pdf');
  assert.ok(fs.existsSync(pdf) && fs.readFileSync(pdf).subarray(0, 5).toString() === '%PDF-', 'the generated PDF pack is served from public/teachers');
  const page1 = await get('/teachers/cyber-defenders');
  assert.match(page1.text, /spot-the-trick-pack\.pdf/, 'the teacher page links the PDF');
});
