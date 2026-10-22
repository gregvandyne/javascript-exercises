import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TEMPLATES, loadTemplate } from '../../server/builder/templates/index.js';
import { scanVersion } from '../../server/services/scanner.js';

const KEYS = ['quiz', 'runner', 'catch', 'memory', 'word', 'duel', 'board'];
const COVERS = ['sunset', 'ocean', 'forest', 'candy', 'night', 'lava', 'mint', 'gold'];
const CATEGORIES = ['arcade', 'sports', 'puzzle', 'words', 'board', 'adventure', 'learning', 'music', 'silly'];

test('TEMPLATES lists every template with valid metadata', () => {
  assert.deepEqual(TEMPLATES.map(t => t.key), KEYS);
  for (const t of TEMPLATES) {
    assert.ok(t.title && t.icon && t.description, `${t.key} has title/icon/description`);
    assert.ok(COVERS.includes(t.cover), `${t.key} cover`);
    assert.ok(CATEGORIES.includes(t.category), `${t.key} category`);
    assert.ok(t.players === 1 || t.players === 2, `${t.key} players`);
  }
});

test('loadTemplate throws on an unknown key', () => {
  assert.throws(() => loadTemplate('nope'));
  assert.throws(() => loadTemplate('../index'));
});

for (const key of KEYS) {
  test(`template ${key} loads and passes the safety scan`, () => {
    const html = loadTemplate(key);
    assert.equal(typeof html, 'string');
    assert.equal(loadTemplate(key), html, 'cached');
    const scan = scanVersion(html);
    assert.equal(scan.status, 'pass', JSON.stringify(scan.issues));
    assert.ok(Buffer.byteLength(html) < 150 * 1024, 'under 150 KB');
    assert.match(html, /<title>[^<]+<\/title>/);
    assert.match(html, /\bBRB\./);
    assert.match(html, /const CONFIG\s*=/);
    assert.doesNotMatch(html, /<!doctype/i);
    assert.doesNotMatch(html, /<html|<head|<body/i);
  });
}
