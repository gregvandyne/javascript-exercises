// "Played all the way through" (services/playthrough.js, services/playthrough-play.js): the Builder plays a version to
// its end in a real browser, the way players get it. An Oomba Canvas activity is answered with its own worked answers
// (every tool, one wrong answer and a hint first) through the results card, on a phone and on a desktop; a kit arcade
// game is played level by level to its last results card and BRB.gameOver; a kit game that throws on level 2 and a
// free game that never ends fail with a clear reason. Then how a result reaches the model (autotest.js). The browser
// tests are skipped when no Chromium is installed.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const LOCAL = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium', '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell'];
const exe = [process.env.BRB_CHROMIUM, ...LOCAL].find(p => p && fs.existsSync(p) && fs.statSync(p).isFile());
const skip = !exe ? 'needs Chromium' : false;

const { config } = await import('../../server/config.js');
const snapshot = await import('../../server/services/snapshot.js');
const pt = await import('../../server/services/playthrough.js');
const { templateHtml } = await import('../../server/builder/catalog.js');
const { activityData, withActivityData } = await import('../../server/services/canvaskit.js');
const { buildReport, playthroughProblem } = await import('../../server/builder/autotest.js');

/** Play this game to its end in Chromium. -> the judged result, with the raw facts. */
async function play(html, opts = {}) {
  const plan = pt.planFor(html);
  const t0 = Date.now();
  let raw; try { raw = await snapshot.playthroughGame(html, { ...plan, orientation: 'landscape', lang: 'en', dir: 'ltr', title: 'T', ...opts }); } catch (e) { raw = { failed: e.message }; }
  return { ...pt.judge(raw, plan), raw, wall: Date.now() - t0 };
}
test.before(() => { if (!skip) { config.snapshots = true; config.chromiumPath = exe; } });
test.after(async () => { config.snapshots = false; config.chromiumPath = ''; await snapshot.closeBrowser(); });

test('how each kind of game is played', async () => {
  assert.equal(pt.planFor((await templateHtml('canvas')).html).kind, 'canvas');
  assert.equal(pt.planFor((await templateHtml('runner')).html).kind, 'kit');
  assert.equal(pt.planFor('<script>BRB.gameOver({ won: true, score: 1 })</script>').kind, 'free');
  assert.equal(pt.planFor('<button>Spin</button>').kind, 'endless', 'no end by design');
  assert.equal(pt.planFor('<script>BRB.score.submit(1); BRB.gameOver({})</script>').scoring, true);
});

test('a Canvas activity is answered with its own answers through the results card, on a phone and a desktop', { skip }, async () => {
  const r = await play((await templateHtml('canvas')).html);
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.kind, 'canvas'); assert.equal(r.score, 5, 'every problem right');
  assert.deepEqual(r.sizes.map(s => [s.size, s.width, s.end, s.right, s.answered]), [['phone', 390, true, 5, 'own'], ['desktop', 1280, true, 5, 'own']]);
  assert.deepEqual(r.sizes[0].hint, { tried: true, hinted: true }, 'a wrong answer first: "Not yet" with a hint, and the Hint button');
  assert.ok(r.raw.events.some(e => e.type === 'brb:gameover' && e.won === true && e.score === 5));
  assert.ok(r.wall < 20_000, `quick (${r.wall} ms)`);
});

test('every Canvas tool is answered on screen, and a generator set is dealt the same way the kit deals it', { skip }, async () => {
  const tpl = (await templateHtml('canvas')).html, base = activityData(tpl).data;
  const problems = [
    { tool: 'fractions.equiv', from: [1, 2], to: 4 }, { tool: 'fractions.shade', n: 2, d: 5 }, { tool: 'fractions.compare', a: [1, 2], b: [2, 3] },
    { tool: 'numberline.point', at: [3, 4], lo: 0, hi: 1, sub: 4 }, { tool: 'numberline.jump', from: 1, by: [1, 2], lo: 0, hi: 3, sub: 2 },
    { tool: 'digits.add', a: 478, b: 256 }, { tool: 'digits.sub', a: 503, b: 128 }, { tool: 'digits.mul', a: 47, b: 6 },
    { tool: 'tiles.sort', rule: 'evenodd', items: [2, 7, 10, 13] }, { tool: 'tiles.order', items: [[3, 4], [1, 2], [2, 3]] },
    { tool: 'figure.number', q: 'How many legs do 3 dogs have?', answer: 12, work: ['3 × 4 = 12'] }, { tool: 'figure.choice', q: 'Which is bigger?', choices: ['1/2', '1/3'], answer: 0, work: ['Halves are bigger than thirds.'] },
  ];
  const all = await play(withActivityData(tpl, { ...base, config: { ...base.config, count: problems.length, fresh: false }, problems, gen: null }));
  assert.equal(all.ok, true, JSON.stringify(all));
  assert.equal(all.score, problems.length);
  const gen = await play(withActivityData(tpl, { ...base, config: { ...base.config, count: 4, fresh: true }, problems: [], gen: { tool: 'digits.add', digits: 3 } }));
  assert.equal(gen.ok, true, JSON.stringify(gen)); assert.equal(gen.score, 4);
  assert.equal(gen.sizes[0].answered, 'own', 'the generated set is known from the seed the kit says');
});

test('a kit arcade game is played level by level to its last results card and BRB.gameOver', { skip }, async () => {
  const r = await play((await templateHtml('runner')).html);
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.kind, 'kit'); assert.equal(r.levels, 3, 'all three levels loaded and played');
  assert.ok(r.raw.levels.every(l => l.how === 'played' || l.how === 'hook'));
  assert.ok(r.raw.events.some(e => e.type === 'brb:gameover' && e.won === true), 'the last level was won');
  assert.equal(typeof r.score, 'number');
  assert.ok(r.wall < 60_000, `inside the budget (${r.wall} ms)`);
});

test('a kit game that throws on level 2 fails, and says so', { skip }, async () => {
  const html = (await templateHtml('runner')).html.replace('setup(w) { rest = 0;', 'setup(w) { if (w.levelNo === 2) throw new Error(\'the bridge on level 2 is missing\'); rest = 0;');
  assert.ok(html.includes('bridge on level 2'), 'the template still has its setup line');
  const r = await play(html);
  assert.equal(r.ok, false);
  assert.equal(r.code, 'error'); assert.equal(r.level, 2);
  assert.match(r.text, /error on level 2: "?.*the bridge on level 2 is missing/);
  assert.match(pt.reasonText(r), /^it hit an error on level 2 \(.*bridge on level 2 is missing.*\)$/);
});

const FREE = (body, script) => `<title>T</title><style>body{margin:0;background:#123;color:#fff;font:20px sans-serif}button{min-width:120px;min-height:60px}</style>${body}<script>${script}</script>`;

test('a free game that never ends fails with a clear reason; one that ends with a score passes', { skip }, async () => {
  const never = FREE('<button id="go">Play</button><div id="n">0</div>', 'let n = 0; go.onclick = () => { go.hidden = true; setInterval(() => { n++; document.getElementById("n").textContent = n; }, 200); }; function end() { BRB.gameOver({ won: true, score: n }); }');
  const r = await play(never, { budgetMs: 9000 });
  assert.equal(r.ok, false); assert.equal(r.code, 'noend', JSON.stringify(r));
  assert.match(r.text, /never reached the end in \d+ s of play/);
  assert.match(pt.blockedWords(r).message, /^The Builder couldn’t finish your game: it didn’t reach the end in \d+ seconds of play\. Ask the Builder to fix it, then publish again\.$/);

  const ends = FREE('<button id="go">Play</button><button id="fin" hidden>Finish</button>', 'go.onclick = () => { go.hidden = true; fin.hidden = false; }; fin.onclick = () => { BRB.score.submit(3); BRB.gameOver({ won: true, score: 3 }); fin.hidden = true; };');
  const ok = await play(ends, { budgetMs: 15_000 });
  assert.equal(ok.ok, true, JSON.stringify(ok)); assert.equal(ok.score, 3);

  const noScore = FREE('<button id="go">Play</button><button id="fin" hidden>Finish</button>', 'go.onclick = () => { go.hidden = true; fin.hidden = false; }; fin.onclick = () => { if (false) BRB.score.submit(1); BRB.gameOver({ won: true }); };');
  const ns = await play(noScore, { budgetMs: 15_000 });
  assert.equal(ns.code, 'noscore', JSON.stringify(ns));

  const throws = FREE('<button id="go">Play</button>', 'go.onclick = () => { throw new Error("boom at the start"); }; function end() { BRB.gameOver({ won: true, score: 1 }); }');
  const th = await play(throws, { budgetMs: 9000 });
  assert.equal(th.code, 'error'); assert.match(th.text, /boom at the start/);
});

test('the playthrough in the model\'s report: a failure is a hard problem with what to do, a pass is one line', () => {
  const good = { mode: 'autoplay', started: 'hook', startedAt: 1500, inputs: 40, playMs: 18000, errors: [], kitWarnings: [], s0: { hook: true, state: { scene: 'title' }, nums: '0' }, s1: { hook: true, state: { scene: 'play', score: 0 }, nums: '0' }, readings: [{ hook: true, state: { scene: 'play', score: 10 }, nums: '10' }], s2: { hook: true, state: { scene: 'play', score: 30 }, nums: '30' }, events: [], fps: 55, layout: [], shots: [{ at: 'start', moved: 0.4, same: 0.2 }, { at: 'play', moved: 0.2, same: 0.2 }] };
  const fail = pt.judge({ kind: 'kit', end: false, errors: [], why: { code: 'stuck', text: 'it got stuck on level 2: the results card never came', level: 2 }, ms: 30000 }, { kind: 'kit' });
  const rep = buildReport(good, { html: '<script>BRB.score.submit(1)</script>', version: 3, playthrough: fail });
  const issue = rep.issues.find(i => i.key === 'playthrough');
  assert.ok(issue && !issue.soft, 'a hard problem: it starts a fix round');
  assert.match(issue.text, /Played all the way through: it did not reach the end\. .*level by level.*it got stuck on level 2/);
  assert.match(issue.text, /__brbTest a win\(\)/);
  assert.equal(rep.facts.playthrough, 'stuck');
  const pass = buildReport(good, { html: '', version: 3, playthrough: pt.judge({ kind: 'canvas', end: true, errors: [], score: 5, ms: 2000 }, { kind: 'canvas' }) });
  assert.equal(rep.clean, false); assert.equal(pass.clean, true);
  assert.match(pass.forModel, /Played all the way through: yes, it reached the end with a score of 5\./);
  assert.equal(playthroughProblem({ ok: false, code: 'busy' }), '', 'no browser free: not the game\'s fault');
});
