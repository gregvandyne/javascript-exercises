// The parent-side message validator in public/js/play.js, run against fake MessageEvents.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const src = fs.readFileSync('public/js/play.js', 'utf8');
const start = src.indexOf('const TYPES = {'), end = src.indexOf('let saveTimer');
const validMessage = new Function(src.slice(start, end).replace('export function', 'function') + '\nreturn validMessage;')();
const frame = {}; const ev = (data, o = {}) => ({ source: frame, origin: 'null', data, ...o });

test('accepts well-formed messages from the game frame', () => {
  assert.ok(validMessage(ev({ brb: 1, type: 'brb:ready' }), frame));
  assert.ok(validMessage(ev({ brb: 1, type: 'brb:save', data: { a: '1' } }), frame));
  assert.ok(validMessage(ev({ brb: 1, type: 'brb:score', score: 10, label: 'pts' }), frame));
  assert.ok(validMessage(ev({ brb: 1, type: 'brb:gameover', won: true, score: null }), frame));
  assert.ok(validMessage(ev({ brb: 1, type: 'brb:fullscreen', on: true }), frame));
  assert.ok(validMessage(ev({ brb: 1, type: 'brb:retry' }), frame));
});
test('rejects wrong source, origin, type or shape', () => {
  assert.equal(validMessage(ev({ brb: 1, type: 'brb:ready' }, { source: {} }), frame), null);
  assert.equal(validMessage(ev({ brb: 1, type: 'brb:ready' }, { origin: 'https://evil.example' }), frame), null);
  assert.equal(validMessage(ev({ brb: 1, type: 'brb:navigate', url: 'x' }), frame), null);
  assert.equal(validMessage(ev({ type: 'brb:ready' }), frame), null);
  assert.equal(validMessage(ev({ brb: 1, type: 'brb:save', data: { a: 1 } }), frame), null);
  assert.equal(validMessage(ev({ brb: 1, type: 'brb:save', data: ['x'] }), frame), null);
  assert.equal(validMessage(ev({ brb: 1, type: 'brb:score', score: -5 }), frame), null);
  assert.equal(validMessage(ev({ brb: 1, type: 'brb:score', score: Infinity }), frame), null);
  assert.equal(validMessage(ev('brb:ready'), frame), null);
});
