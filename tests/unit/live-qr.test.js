// The QR maker for the host screen (services/qr.js): Reed-Solomon against the standard's worked example, format bits,
// the fixed patterns, the version for our join address, and the SVG.
import test from 'node:test';
import assert from 'node:assert/strict';
const QR = await import('../../server/services/qr.js');

test('Reed-Solomon: the ISO 18004 / standard worked example (1-M "HELLO WORLD" codewords)', () => {
  assert.deepEqual(QR.rsEncode([32, 91, 11, 120, 209, 114, 220, 77, 67, 64, 236, 17, 236, 17, 236, 17], 10), [196, 35, 39, 119, 235, 215, 231, 226, 93, 23]);
});

test('format bits for level M', () => {
  assert.equal(QR.formatBits(0).toString(2).padStart(15, '0'), '101010000010010');
  assert.equal(QR.formatBits(5).toString(2).padStart(15, '0'), '100000011001110');
});

test('byte mode data codewords: mode, length, bytes, terminator and the pad pattern', () => {
  const d = QR.dataCodewords([...Buffer.from('hi')], 1);
  assert.equal(d.length, 16);
  assert.deepEqual(d.slice(0, 4), [0x40, 0x26, 0x86, 0x90]);
  assert.deepEqual(d.slice(4, 8), [0xec, 0x11, 0xec, 0x11]);
});

test('the join address fits version 3; finders, timing, the dark module and both copies of the format bits are right', () => {
  const r = QR.qr('https://oomba.ai/join#1234567');
  assert.equal(r.version, 3); assert.equal(r.size, 29);
  const m = r.modules, n = r.size;
  for (const [x0, y0] of [[0, 0], [n - 7, 0], [0, n - 7]]) {
    for (let i = 0; i < 7; i++) { assert.equal(m[y0][x0 + i], true); assert.equal(m[y0 + 6][x0 + i], true); assert.equal(m[y0 + i][x0], true); }
    assert.equal(m[y0 + 1][x0 + 1], false); assert.equal(m[y0 + 3][x0 + 3], true);
  }
  for (let i = 8; i < n - 8; i++) { assert.equal(m[6][i], i % 2 === 0); assert.equal(m[i][6], i % 2 === 0); }
  assert.equal(m[n - 8][8], true, 'the dark module');
  const bits = QR.formatBits(r.mask);
  const b = i => ((bits >>> i) & 1) === 1;
  for (let i = 0; i <= 5; i++) assert.equal(m[i][8], b(i));
  for (let i = 0; i < 8; i++) assert.equal(m[8][n - 1 - i], b(i));
  for (let i = 8; i < 15; i++) assert.equal(m[n - 15 + i][8], b(i));
  assert.throws(() => QR.qr('x'.repeat(63)));
  assert.equal(QR.qr('x'.repeat(62)).version, 4);
});

test('the SVG: crisp, a quiet zone, an accessible name, nothing from the input but modules', () => {
  const svg = QR.qrSvg('https://oomba.ai/join#7654321', { title: 'QR "code" <join>' });
  assert.match(svg, /^<svg xmlns="http:\/\/www.w3.org\/2000\/svg" viewBox="0 0 37 37" shape-rendering="crispEdges" role="img" aria-label="QR &quot;code&quot; &lt;join&gt;">/);
  assert.ok(!svg.includes('7654321'), 'the code itself is not in the markup');
  assert.match(svg, /<path d="(M\d+ \d+h1v1h-1z)+" fill="#000"\/><\/svg>$/);
});
