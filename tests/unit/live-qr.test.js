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
  assert.equal(QR.qr('x'.repeat(62)).version, 4);
  // Versions 5 and 6 (level M: 2 blocks of 43 and 4 blocks of 27 data codewords) for longer class links.
  assert.equal(QR.qr('x'.repeat(63)).version, 5);
  assert.equal(QR.qr('x'.repeat(84)).version, 5);
  assert.equal(QR.qr('x'.repeat(85)).version, 6);
  assert.equal(QR.qr('x'.repeat(106)).size, 41);
  assert.throws(() => QR.qr('x'.repeat(107)));
});

test('the SVG: crisp, a quiet zone, an accessible name, nothing from the input but modules', () => {
  const svg = QR.qrSvg('https://oomba.ai/join#7654321', { title: 'QR "code" <join>' });
  assert.match(svg, /^<svg xmlns="http:\/\/www.w3.org\/2000\/svg" viewBox="0 0 37 37" shape-rendering="crispEdges" role="img" aria-label="QR &quot;code&quot; &lt;join&gt;">/);
  assert.ok(!svg.includes('7654321'), 'the code itself is not in the markup');
  assert.match(svg, /<path d="(M\d+ \d+h1v1h-1z)+" fill="#000"\/><\/svg>$/);
});

// Versions 7 and up (the dashboard's QR widget takes a teacher's own website, up to MAX_DASH_VERSION). Checked against
// published values (the standard's capacity table, its version information table, its alignment table) and against
// symbols made by a reference encoder (OpenCV 5.0 QRCodeEncoder, level M, byte mode; it always chose mask 2): the
// SHA-256 of each reference symbol's modules ('1' dark, rows joined by '\n'). The same symbols decode with OpenCV's
// QRCodeDetector. Versions 1-6 are unchanged (the tests above).
test('versions 7-40: capacity, block layout, alignment, version bits and reference symbols', async () => {
  const crypto = await import('node:crypto');
  // ISO/IEC 18004 table 7, level M, byte mode.
  const capM = [14, 26, 42, 62, 84, 106, 122, 152, 180, 213, 251, 287, 331, 362, 412, 450, 504, 560, 624, 666, 711, 779, 857, 911, 997, 1059, 1125, 1190, 1264, 1370, 1452, 1538, 1628, 1722, 1809, 1911, 1989, 2099, 2213, 2331];
  assert.deepEqual(Array.from({ length: 40 }, (_, i) => QR.capacity(i + 1)), capM);
  for (let v = 1; v <= 6; v++) { const [per, blocks, ec, al] = QR.VERSIONS[v]; assert.deepEqual(QR.layout(v), { data: new Array(blocks).fill(per), ec }); assert.deepEqual(QR.alignment(v), al ? [6, al] : []); }
  assert.deepEqual(QR.layout(13), { data: [37, 37, 37, 37, 37, 37, 37, 37, 38], ec: 22 });
  // Annex E alignment centres.
  assert.deepEqual(QR.alignment(7), [6, 22, 38]); assert.deepEqual(QR.alignment(14), [6, 26, 46, 66]);
  assert.deepEqual(QR.alignment(32), [6, 34, 60, 86, 112, 138]); assert.deepEqual(QR.alignment(40), [6, 30, 58, 86, 114, 142, 170]);
  // Annex D version information.
  assert.deepEqual([7, 8, 9, 10, 11, 12, 13, 40].map(v => QR.versionBits(v)), [0x07c94, 0x085bc, 0x09a99, 0x0a4d3, 0x0bbf6, 0x0c762, 0x0d847, 0x28c69]);
  // Reference symbols.
  const url = n => `https://library.example.org/reading/${'abcdefghij'.repeat(40)}`.slice(0, n);
  const hash = m => crypto.createHash('sha256').update(m.map(r => r.map(b => (b ? '1' : '0')).join('')).join('\n')).digest('hex');
  for (const [v, n, sha] of [[7, 120, '60a1505bf33e242313b6bb839e213476e21051e097b3f695e55ccbfe35085e4d'], [10, 213, '69987b278239d82395e5bd6bb7120499c356193b16ba910ac8ebd85c3ee588f9'],
    [11, 250, '3ef9590465361657ff2ba332a8d91afadeb6e6b327d933324f8ee8c844b487ea'], [13, 331, 'a2b50ff16fab26a23a1d6b9d6818a34f1264ee8b0c76e6c9faf7db27322f9851']]) {
    const r = QR.qr(url(n), { version: v, mask: 2 });
    assert.equal(r.size, 17 + 4 * v); assert.equal(hash(r.modules), sha, `version ${v}`);
    assert.equal(QR.qr(url(n), { max: QR.MAX_DASH_VERSION }).version, v, `${n} bytes is version ${v}`);
  }
  // Both copies of the version information are drawn (version 7: top right and bottom left).
  const m = QR.qr(url(120), { max: 13 }).modules, n = m.length, vb = QR.versionBits(7);
  for (let i = 0; i < 18; i++) { const bit = ((vb >>> i) & 1) === 1; assert.equal(m[Math.floor(i / 3)][n - 11 + (i % 3)], bit); assert.equal(m[n - 11 + (i % 3)][Math.floor(i / 3)], bit); }
  // The default is still at most version 6 (the live host screen); the dashboard asks for more, up to 331 bytes.
  assert.throws(() => QR.qr('x'.repeat(107)));
  assert.equal(QR.MAX_DASH_VERSION, 13);
  assert.equal(QR.qr('x'.repeat(331), { max: QR.MAX_DASH_VERSION }).size, 69);
  assert.throws(() => QR.qr('x'.repeat(332), { max: QR.MAX_DASH_VERSION }));
  assert.equal(QR.fits('x'.repeat(331), 13), true); assert.equal(QR.fits('x'.repeat(332), 13), false); assert.equal(QR.fits('x'.repeat(107)), false);
});
