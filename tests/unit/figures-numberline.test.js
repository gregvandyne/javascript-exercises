// Oomba Figures 1.1.0: the number line (docs/figures-api.md "The number line") and the notice an exported figure
// carries ("The notice on exported figures"). Drawn to scale from its numbers (ticks evenly spaced, every circle and point
// at its value, a set that runs on past an end with its own arrow), refused when part of it would fall off the line,
// black on white in print, its answer left out when hidden, its name and numbers in the reader's language; a figure
// question generator for it passes the activity self-test; the frozen 1.1.0 file draws what the source draws.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import '../../figures/src/index.js';
import { FIG_WORDS } from '../../figures/src/words.js';
import { CODES } from '../../server/i18n/index.js';
import { figuresKit, figTag, FIG_LATEST } from '../../server/services/figlibs.js';
import { canvasTag, canvasKit, selfTestHtml } from '../../server/services/canvaskit.js';

const OF = globalThis.OombaFigures;
const all = (s, re) => [...s.matchAll(re)];
const ticksX = s => all(/class="of-ticks">(.*?)<\/g>/g.exec(s)[1], /<line x1="([-\d.]+)"/g).map(m => +m[1]);
const ends = s => all(s, /<circle cx="([-\d.]+)" cy="[-\d.]+" r="6.5" fill="([^"]+)" stroke="([^"]+)"[^>]*class="of-end (of-open|of-closed)"/g).map(m => ({ x: +m[1], fill: m[2], stroke: m[3], open: m[4] === 'of-open' }));
const count = (s, cls) => (s.match(new RegExp(`class="${cls}"`, 'g')) || []).length;
const size = s => /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(s).slice(1).map(Number);

const GE = { from: -5, to: 5, intervals: [{ from: -2 }] };                                          // x ≥ −2
const COMPOUND = { from: -6, to: 6, intervals: [{ from: -3, to: 4, fromClosed: false }] };          // −3 < x ≤ 4
const OR = { from: -5, to: 5, intervals: [{ to: -1, toClosed: false }, { from: 3 }] };              // x < −1 or x ≥ 3
const QUARTERS = { from: 0, to: 2, step: [1, 4], every: 4, points: [{ at: [3, 4], label: 'P' }, { at: [3, 2], label: 'Q' }, { at: [7, 4], label: 'R' }] };
const SEQUENCE = { from: 0, to: 1, step: 0.1, sequence: { expr: '1/n', numbering: 'fraction' } };   // 1, 1/2, ..., 1/5

test('good data: no problems, one accessible <svg>, and the kind is listed', () => {
  assert.ok(OF.kinds.includes('numberLine')); assert.equal(OF.version, FIG_LATEST['oomba-figures'], 'the latest version (1.1.0 brought the number line; 1.5.0 is the latest)');
  for (const d of [GE, COMPOUND, OR, QUARTERS, SEQUENCE, { from: 0, to: { pi: 2 }, step: { pi: [1, 4] } }, { from: 0, to: 360, step: 30, every: 3, numbering: 'degree' }, { from: -10, to: 10, intervals: [{}] }]) {
    assert.deepEqual(OF.check('numberLine', d), [], JSON.stringify(d));
    const s = OF.svg('numberLine', d, { title: 'A number line' });
    assert.match(s, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 [\d.]+ [\d.]+"[^>]*role="img" aria-label="A number line"/);
    assert.match(s, /direction="ltr"/); assert.doesNotMatch(s, /cannot be drawn|NaN|undefined|Infinity/);
  }
});

test('OF.check: data that cannot be drawn truthfully is named in plain English and draws the card, never a wrong line', () => {
  const cases = [
    [{ from: 5, to: 1 }, /end after it starts/],
    [{ from: 0, to: 1, step: 0.3 }, /whole number, so the line ends on a tick/],
    [{ from: 0, to: 1, step: 0.001 }, /1000 gaps between ticks/],
    [{ from: 0, to: 1, step: -1 }, /above 0/],
    [{ from: 'zero', to: 1 }, /"from" and "to" must be numbers/],
    [{ from: 0, to: 5, every: 1.5 }, /"every" must be a whole number/],
    [{ from: 0, to: 5, numbering: 'roman' }, /"numbering" must be one of/],
    [{ from: 0, to: 5, points: [{ at: 7, label: 'P' }] }, /point 1: 7 is past the end of the line/],
    [{ from: 0, to: 5, points: [{ label: 'P' }] }, /point 1 needs "at"/],
    [{ from: 0, to: 5, points: [{ at: 1, mark: 'star' }] }, /"mark" must be dot or cross/],
    [{ from: -5, to: 5, intervals: [{ from: -7 }] }, /interval 1: −7 is past the end of the line/],
    [{ from: -5, to: 5, intervals: [{ from: 3, to: 1 }] }, /"to" must be bigger than "from"/],
    [{ from: -5, to: 5, intervals: [{ from: 1, toClosed: true }] }, /runs off the line has no circle/],
    [{ from: -5, to: 5, intervals: [{ from: 1, set: 9 }] }, /"set" must be 0 to 4/],
    [{ from: 0, to: 5, sequence: { expr: 'n', to: 6 } }, /the term for n = 6 is 6, past the end of the line/],
    [{ from: 0, to: 1, sequence: { expr: '1/n', from: 0 } }, /no value at n = 0/],
    [{ from: 0, to: 1, sequence: { expr: 'window.n' } }, /character|names/],
    [{ from: 0, to: 1, sequence: { expr: '1/n', from: 1, to: 500 } }, /500 terms/],
  ];
  for (const [d, re] of cases) {
    assert.match(OF.check('numberLine', d).join('; '), re, JSON.stringify(d));
    assert.match(OF.svg('numberLine', d), /cannot be drawn/, `${JSON.stringify(d)}: the card`);
    assert.doesNotMatch(OF.svg('numberLine', d), /of-ticks/);
  }
});

test('to scale: ticks evenly spaced, the line always 600 long, every circle and point exactly at its value', () => {
  for (const d of [GE, COMPOUND, OR, QUARTERS, SEQUENCE]) {
    const xs = ticksX(OF.svg('numberLine', d)), gap = xs[1] - xs[0];
    assert.ok(Math.abs(xs[xs.length - 1] - xs[0] - 600) < 0.02, 'the line is 600 units from its first tick to its last');
    for (let i = 1; i < xs.length; i++) assert.ok(Math.abs(xs[i] - xs[i - 1] - gap) < 0.02, `even ticks ${xs}`);
  }
  const at = (d, v) => { const xs = ticksX(OF.svg('numberLine', d)); return xs[0] + ((v - d.from) / (d.to - d.from)) * 600; };
  const near = (a, b) => Math.abs(a - b) < 0.02;
  // −3 < x ≤ 4: an open circle at −3, a closed one at 4
  const c = ends(OF.svg('numberLine', COMPOUND));
  assert.equal(c.length, 2); assert.ok(near(c[0].x, at(COMPOUND, -3)) && c[0].open); assert.ok(near(c[1].x, at(COMPOUND, 4)) && !c[1].open);
  // P at 3/4, Q at 3/2, R at 7/4: on their ticks
  const q = { ...QUARTERS, to: 2 }, qs = ends(OF.svg('numberLine', q));
  assert.deepEqual(qs.map(e => e.open), [false, false, false]);
  for (const [i, v] of [0.75, 1.5, 1.75].entries()) assert.ok(near(qs[i].x, at(q, v)), `point ${i}`);
  // 1/n: dots at 1/5, 1/4, 1/3, 1/2, 1
  const t = ends(OF.svg('numberLine', SEQUENCE)).map(e => e.x).sort((a, b) => a - b);
  assert.deepEqual(t.map(x => Math.round(((x - at(SEQUENCE, 0)) / 600) * 1000) / 1000), [0.2, 0.25, 0.333, 0.5, 1]);
  assert.deepEqual(OF.solve.numberLine(SEQUENCE).terms.map(v => Math.round(v * 1000) / 1000), [1, 0.5, 0.333, 0.25, 0.2]);
});

test('sets: a set that runs on past an end gets its own arrow; one set\'s intervals join; sets keep their colors', () => {
  assert.equal(count(OF.svg('numberLine', GE), 'of-ray'), 1); assert.equal(count(OF.svg('numberLine', OR), 'of-ray'), 2); assert.equal(count(OF.svg('numberLine', COMPOUND), 'of-ray'), 0);
  assert.ok(size(OF.svg('numberLine', OR))[0] > size(OF.svg('numberLine', COMPOUND))[0] - 1, 'room for both arrows');
  // [1, 2] and [2, 3]: one segment, no circle at the join
  const joined = OF.svg('numberLine', { from: 0, to: 5, intervals: [{ from: 1, to: 2 }, { from: 2, to: 3, fromClosed: false }] });
  assert.equal(ends(joined).length, 2); assert.equal(all(joined, /class="of-graph"><line/g).length, 1);
  const s = OF.solve.numberLine(OR);
  assert.deepEqual(s.sets[0].intervals, [{ from: null, to: -1, fromClosed: false, toClosed: false }, { from: 3, to: null, fromClosed: true, toClosed: false }]);
  assert.deepEqual([-1, -1.01, 0, 2.99, 3, 100].map(x => s.contains(x)), [false, true, false, false, true, true]);
  const two = OF.svg('numberLine', { from: -1, to: 1, step: 0.25, intervals: [{ from: -0.75, to: 0.25 }, { from: 0.5, set: 1 }], points: [{ at: 0.6, mark: 'cross', set: 2 }] });
  assert.match(two, /stroke="#1F9D63"[^>]*class="of-graph"/); assert.match(two, /stroke="#2A78B0"[^>]*class="of-graph"/); assert.match(two, /stroke="#B0372B"[^>]*class="of-cross"/);
});

test('numbers: every nth tick from 0, fractions stacked, π, degrees, values above that are not under a number', () => {
  const nums = s => all(s, /class="of-num">(.*?)<\/g>/g).map(m => all(m[1], />([^<]+)<\/text>/g).map(x => x[1]).join('/'));
  assert.deepEqual(nums(OF.svg('numberLine', GE)), ['−5', '−4', '−3', '−2', '−1', '0', '1', '2', '3', '4', '5'], 'a true minus sign');
  assert.deepEqual(nums(OF.svg('numberLine', { from: -3, to: 12, every: 5 })), ['0', '5', '10'], 'counted from the tick at 0');
  assert.deepEqual(nums(OF.svg('numberLine', QUARTERS)), ['0', '1', '2']);
  assert.deepEqual(nums(OF.svg('numberLine', { from: 0, to: 1, step: [1, 4] })), ['0', '1/4', '1/2', '3/4', '1'], 'stacked fractions');
  assert.deepEqual(nums(OF.svg('numberLine', { from: 0, to: { pi: 2 }, step: { pi: [1, 2] } })), ['0', 'π/2', 'π', '3π/2', '2π']);
  assert.deepEqual(nums(OF.svg('numberLine', { from: 0, to: 90, step: 30, numbering: 'degree' })), ['0°', '30°', '60°', '90°']);
  const vals = s => all(s, /class="of-val">(.*?)<\/g>/g).map(m => all(m[1], />([^<]+)<\/text>/g).map(x => x[1]).join('/'));
  assert.deepEqual(vals(OF.svg('numberLine', SEQUENCE)), ['1/4', '1/3'], '0.2, 0.5 and 1 are under numbers; 1/4 and 1/3 are written');
  assert.deepEqual(vals(OF.svg('numberLine', { from: 0, to: 2, every: 2, intervals: [{ from: 0.5, to: 1.5 }] })), ['0.5', '1.5']);
  assert.deepEqual(vals(OF.svg('numberLine', { ...SEQUENCE, values: false })), []);
  assert.deepEqual(vals(OF.svg('numberLine', QUARTERS)), [], 'a lettered point never gives its value away');
  assert.match(OF.svg('numberLine', { from: 0, to: 2, step: [1, 4], points: [{ at: [3, 4], label: 'P', value: true }] }), />P<\/tspan><tspan font-size="16">\(3\/4\)</);
});

test('print: black on white, open circles white, nothing in color', () => {
  for (const d of [OR, QUARTERS, SEQUENCE, { ...COMPOUND, points: [{ at: 1, set: 3, mark: 'cross' }] }]) {
    const s = OF.svg('numberLine', d, { print: true });
    assert.doesNotMatch(s, /#1F9D63|#2A78B0|#B0372B|#9A6B00|#6E4BB0|#FFFDF2|#141414/, 'no Oomba colors in print');
    assert.match(s, /<rect x="0" y="0" width="[\d.]+" height="[\d.]+" rx="0" fill="#FFFFFF"\/>/);
    for (const e of ends(s)) { assert.equal(e.stroke, '#000000'); assert.equal(e.fill, e.open ? '#FFFFFF' : '#000000'); }
    assert.match(s, /class="of-fig of-numberLine of-print"/);
  }
  const screen = OF.svg('numberLine', OR);
  assert.match(screen, /fill="#FFFDF2"/); assert.match(screen, /stroke="#1F9D63"/, 'on screen: the Oomba paper and green');
});

test('hide: true leaves the numbered line to graph on (same size); "graph", "points" and "values" leave out their part', () => {
  const full = OF.svg('numberLine', COMPOUND), blank = OF.svg('numberLine', COMPOUND, { hide: true });
  assert.deepEqual(size(blank), size(full), 'the same size, so the answer key lines up');
  assert.equal(count(blank, 'of-graph') + ends(blank).length + count(blank, 'of-ray'), 0);
  assert.equal(count(blank, 'of-num'), 13, 'the numbers stay');
  const lettered = OF.svg('numberLine', QUARTERS, { hide: true });
  assert.equal(count(lettered, 'of-letter') + ends(lettered).length, 0);
  const mixed = { from: 0, to: 4, intervals: [{ from: 2.5, to: 3.5 }], points: [{ at: 1.5, label: 'A' }, { at: 0.25 }] };
  const g = OF.svg('numberLine', mixed, { hide: 'graph' });
  assert.equal(count(g, 'of-graph'), 0); assert.equal(ends(g).length, 2); assert.equal(count(g, 'of-letter'), 1);
  const p = OF.svg('numberLine', mixed, { hide: 'points' });
  assert.equal(count(p, 'of-graph'), 1); assert.equal(ends(p).length, 2); assert.equal(count(p, 'of-letter'), 0);
  const v = OF.svg('numberLine', mixed, { hide: 'values' });
  assert.equal(count(OF.svg('numberLine', mixed), 'of-val'), 3); assert.equal(count(v, 'of-val'), 0); assert.equal(ends(v).length, 4);
  assert.equal(count(OF.svg('numberLine', mixed, { hide: ['graph', 'values'] }), 'of-val'), 0);
});

test('languages: the name in every site language, the reader\'s decimal mark, Latin digits in Arabic, never mirrored', () => {
  for (const c of CODES) {
    const s = OF.svg('numberLine', GE, { lang: c });
    const name = (FIG_WORDS[c] || FIG_WORDS[c.split('-')[0]]).numberLine;
    assert.ok(name, c); assert.ok(s.includes(`aria-label="${name}"`) && s.includes(`<title>${name}</title>`), `${c}: ${name}`);
    assert.match(s, /direction="ltr"/, `${c}: the line never mirrors`);
  }
  assert.equal(FIG_WORDS.es.numberLine, 'Recta numérica'); assert.equal(FIG_WORDS.ja.numberLine, '数直線'); assert.equal(FIG_WORDS.he.numberLine, 'ציר המספרים');
  const d = { from: 0, to: 1, step: 0.5, every: 1, points: [{ at: 0.25 }] };
  assert.match(OF.svg('numberLine', d, { lang: 'de' }), />0,5</); assert.match(OF.svg('numberLine', d, { lang: 'de' }), />0,25</);
  assert.match(OF.svg('numberLine', d, { lang: 'fr' }), />0,5</);
  assert.match(OF.svg('numberLine', d, { lang: 'ar' }), />0\.5</); assert.doesNotMatch(OF.svg('numberLine', d, { lang: 'ar' }), /[٠-٩]/);
  assert.match(OF.svg('numberLine', d, { lang: 'en' }), />0\.5</);
});

test('the notice: Oomba\'s exact CC0 words, in the SVG bytes as <metadata>, from the source and from the frozen 1.1.0 file', () => {
  const words = 'Made with Oomba Academy. Everything Oomba Academy contributes to this figure is dedicated to the public domain under CC0 1.0 (https://creativecommons.org/publicdomain/zero/1.0/). Anything original added by the person who made it is theirs.';
  assert.equal(OF.notice, words);
  const plain = OF.svg('numberLine', QUARTERS), stamped = OF.withNotice(plain);
  assert.ok(!plain.includes('<metadata'), 'a figure on a page or a sheet carries no notice');
  const bytes = Buffer.from(stamped, 'utf8');
  assert.ok(bytes.includes(Buffer.from(`<dc:rights>${words}</dc:rights>`, 'utf8')), 'the exact words, in the bytes');
  assert.ok(bytes.includes(Buffer.from('<cc:license rdf:resource="https://creativecommons.org/publicdomain/zero/1.0/"/>', 'utf8')));
  assert.match(stamped, /<\/title><metadata class="of-notice"><rdf:RDF xmlns:rdf="http:\/\/www\.w3\.org\/1999\/02\/22-rdf-syntax-ns#" xmlns:dc="http:\/\/purl\.org\/dc\/elements\/1\.1\/" xmlns:cc="http:\/\/creativecommons\.org\/ns#"><cc:Work rdf:about="">/);
  assert.equal(stamped.replace(/<metadata[\s\S]*<\/metadata>/, ''), plain, 'nothing else changes');
  assert.equal(OF.withNotice(stamped), stamped, 'stamped once');
  assert.equal(stamped.match(/<metadata[\s\S]*<\/metadata>/)[0].replace(/<[^>]+>/g, ''), words, 'the notice says these words and nothing else');
  assert.throws(() => OF.withNotice('<p>no</p>'), /SVG text/);
  const F = figuresKit('1.1.0');
  assert.equal(F.withNotice(F.svg('numberLine', QUARTERS)), stamped, 'the frozen file stamps the same bytes');
  assert.equal(F.notice, words);
});

test('the frozen files: 1.1.0 draws what the source draws; 1.0.0 is untouched and does not know the number line', () => {
  assert.ok(['1.1.0', '1.2.0', '1.3.0', '1.4.0', '1.5.0'].includes(FIG_LATEST['oomba-figures']), 'the number line came in 1.1.0, and the latest has it');
  const F = figuresKit('1.1.0');
  for (const d of [GE, OR, QUARTERS, SEQUENCE]) { assert.equal(F.svg('numberLine', d), OF.svg('numberLine', d)); assert.equal(F.check('numberLine', d).length, 0); }
  const old = figuresKit('1.0.0');
  assert.equal(old.version, '1.0.0'); assert.match(old.check('numberLine', GE)[0], /unknown figure/);
  assert.equal(old.svg('bohr', { element: 'Na' }), F.svg('bohr', { element: 'Na' }), 'the older kinds draw the same');
});

// ---------------------------------------------------------------- the figure question generator
const GEN = {
  tool: 'figure.number', vars: { b: { of: [2, 4, 5, 10] }, a: [1, 19] }, where: '(a < 2*b) * (a != b)',
  q: 'The line is cut into equal parts. What number is point P at?',
  fig: { kind: 'numberLine', from: 0, to: 2, step: '{=1/b}', every: '{b}', points: [{ at: '{=a/b}', label: 'P' }] },
  answer: 'a/b', dp: 2,
  work: ['Each whole is cut into {b} equal parts, so each part is 1 ÷ {b} = {=1/b}.', 'P is {a} parts from 0.', '{a} × {=1/b} = {=a/b}'],
};
const activity = data => `<title>Number lines</title>\n${figTag('oomba-figures')}\n${canvasTag()}\n<div id="oc-app"></div>\n<script type="application/json" id="oc-activity">\n${JSON.stringify(data)}\n</script>\n<script>Oc.activity(JSON.parse(document.getElementById('oc-activity').textContent));</script>`;

test('the generator (docs/figures-api.md): passes the self-test; every set it deals is a true figure whose key is the point', () => {
  const data = { config: { count: 6, purpose: ['screen', 'worksheet', 'generator'] }, task: { title: 'Fractions on a number line' }, problems: [], gen: GEN };
  assert.deepEqual(selfTestHtml(activity(data)), { ok: true, problems: [] });
  const kit = canvasKit(), F = figuresKit(FIG_LATEST['oomba-figures']), seen = new Set();
  for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) for (const p of kit.logic.deal(data, { seed: seed * 7919, count: 12 })) {
    const { kind, ...fig } = p.fig, s = F.solve.numberLine(fig);
    assert.equal(kind, 'numberLine'); assert.equal(F.check(kind, fig).length, 0, JSON.stringify(fig));   // (another realm's array: compare its length)
    assert.ok(Math.abs(s.points[0].at - p.answer) < 1e-9, `P is at the answer ${p.answer}`);
    assert.ok(s.ticks.some(t => Math.abs(t.at - p.answer) < 1e-9 && !t.numbered), 'P sits on a tick, not on a number');
    assert.match(p.work[p.work.length - 1], new RegExp(`= ${String(p.answer).replace('.', '\\.')}$`));
    seen.add(p.answer);
  }
  assert.ok(seen.size >= 10, `randomized: ${[...seen].join(', ')}`);
  const sheet = kit.sheet(data, { seed: 4242, n: 8 });
  assert.equal(sheet.items.length, 8); assert.ok(sheet.items.every(i => i.answer.length === 1 && i.work.length === 3 && i.picture && i.picture.fig.kind === 'numberLine'));
  // a generator whose figure cannot be drawn is refused by name
  const bad = selfTestHtml(activity({ ...data, gen: { ...GEN, fig: { ...GEN.fig, to: 1 } } }));
  assert.equal(bad.ok, false); assert.match(bad.problems.map(x => x.why).join('; '), /its figure \(numberLine\): point 1: .* is past the end of the line/);
});
