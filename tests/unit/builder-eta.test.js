// Build time estimates (server/builder/eta.js): pure rules with exact numbers, and stats from seeded rows at a fixed
// "now", so nothing here depends on how fast the machine is.
process.env.BRB_DB = ':memory:';
process.env.BRB_SILENT = '1';
process.env.LOG_REQUESTS = '0';
process.env.BRB_MOCK_DELAY_MS = '0';
import test from 'node:test';
import assert from 'node:assert/strict';

const { q, uid } = await import('../../server/db.js');
const eta = await import('../../server/builder/eta.js');

const S = 1000, MIN = 60e3, DAY = 86400e3;
const NOW = Date.UTC(2026, 9, 26, 12);
/** Seed timed builds: durations in seconds; o: { key, sample, age (days), first (s before the end) }. */
function seed(durations, { key = 'ai:std:new:2d', sample = 1, age = 1, first = null } = {}) {
  durations.forEach((d, n) => q.run(`INSERT INTO builder_turns(id, game_id, user_id, status, end_reason, est_key, sample, duration_ms, first_version_ms, created_at, ended_at)
    VALUES (?,?,?,'done','ok',?,?,?,?,?,?)`, uid(16), 'g', 'u', key, sample, d * S, first == null ? 0 : (d - first) * S, NOW - age * DAY, NOW - age * DAY - n * 1000));
}
const clean = () => { q.run('DELETE FROM builder_turns'); eta._reset(); };
const withDelay = (d, fn) => { const old = process.env.BRB_MOCK_DELAY_MS; process.env.BRB_MOCK_DELAY_MS = String(d); try { return fn(); } finally { process.env.BRB_MOCK_DELAY_MS = old; } };
const AI_NEW = { p: 'ai', pro: false, k: 'new', d3: false };

test('ETA-1 quantile: nearest rank', () => {
  const a = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  assert.deepEqual([eta.quantile(a, 0.25), eta.quantile(a, 0.5), eta.quantile(a, 0.75)], [3, 5, 8]);
  assert.equal(eta.quantile([7], 0.9), 7);
});

test('ETA-2 band: kid-sized minutes, and "longer than usual" agrees with what was shown', () => {
  const b = (p25, p75, cap) => eta.band({ p25: p25 * S, p75: p75 * S }, cap);
  assert.deepEqual([b(5, 19.9).show, b(5, 19.9).overAt], ['none', 35 * S]);
  assert.deepEqual([b(20, 50).show, b(20, 50).overAt], ['under', 75 * S]);
  assert.deepEqual(['show', 'lo', 'hi', 'overAt'].map(k => b(40, 70)[k]), ['about', 1, 1, 85 * S]);
  assert.deepEqual(['show', 'lo', 'hi', 'overAt'].map(k => b(40, 71)[k]), ['range', 1, 2, 138 * S]);
  assert.deepEqual(['lo', 'hi', 'bigAt'].map(k => b(50, 120)[k]), [1, 2, 240 * S]);
  assert.deepEqual(['lo', 'hi'].map(k => b(100, 240)[k]), [2, 4]);
  assert.deepEqual(['lo', 'hi'].map(k => b(60, 600)[k]), [1, 10]);
  const capped = b(60, 600, 10 * MIN);
  assert.ok(capped.hi <= 9 && capped.bigAt <= 600 * S && capped.overAt < capped.bigAt, JSON.stringify(capped));
  assert.equal(b(60, 600, 200).hi, 10, 'a test-sized cap clamps nothing');
  // 1,000 random spreads: lo ≤ hi, and the shown time < longer < big.
  let seedN = 7; const rnd = () => ((seedN = (seedN * 16807) % 2147483647) / 2147483647);
  for (let n = 0; n < 1000; n++) {
    const p25 = rnd() * 900 * S, p75 = p25 + rnd() * 900 * S; const x = eta.band({ p25, p75 }, n % 2 ? 0 : 20 * MIN);
    if (x.lo) assert.ok(x.lo <= x.hi, JSON.stringify({ p25, p75, x }));
    assert.ok(x.hiMs < x.overAt && x.overAt < x.bigAt, JSON.stringify({ p25, p75, x }));
  }
});

test('ETA-3 tail: what is left after the first version, and thresholds never move earlier', () => {
  assert.equal(eta.tailBand({ p75: 9 * S }).show, 'none');
  assert.equal(eta.tailBand({ p75: 50 * S }).show, 'under');
  assert.deepEqual(eta.tailBand({ p75: 100 * S }), { show: 'about', n: 2, hiMs: 2 * MIN });
  clean();
  const est = eta.estimate(AI_NEW, { now: NOW });   // defaults: 1–2 minutes, over at 138 s, tail p75 50 s
  assert.equal(est.overAt, 138 * S);
  const t = eta.tail(est, 5 * S);
  assert.deepEqual([t.phase, t.show, t.el, t.overAt, t.bigAt], ['tail', 'under', 5 * S, 138 * S, 240 * S], 'an early version keeps the start\'s thresholds');
  const late = eta.estimate(AI_NEW, { now: NOW }); const t2 = eta.tail(late, 130 * S);
  assert.ok(t2.overAt === 130 * S + 60 * S + 15 * S && t2.bigAt >= t2.overAt + MIN, 'a late version moves them later');
  assert.equal(eta.tail(eta.estimate({ p: 'blocks', pro: false, k: 'new', d3: false }, { now: NOW }), 1), null, 'no line shown: nothing to add');
});

test('ETA-4 predict: new or change, 3D in many languages, pro only for the AI, state untouched', () => {
  assert.equal(eta.predict({ provider: 'claude' }).k, 'new');
  assert.equal(eta.predict({ provider: 'claude', cur: { html: '<p>hi</p>' } }).k, 'change');
  for (const text of ['make a 3D game', 'un jeu 3D', '立體的遊戲', 'لعبة ثلاثية الأبعاد', 'трёхмерная игра']) assert.equal(eta.predict({ provider: 'claude', text }).d3, true, text);
  assert.equal(eta.predict({ provider: 'claude', text: 'a fox game' }).d3, false);
  const island = { html: '<script type="importmap">{"imports":{"three":"/vendor/three/three.module.js"}}</script>' };
  assert.equal(eta.predict({ provider: 'mock', cur: island }).d3, true, 'an island version is 3D');
  assert.equal(eta.predict({ provider: 'mock', pro: true }).pro, false, 'the building blocks have no Pro');
  assert.equal(eta.predict({ provider: 'claude', pro: true }).pro, true);
  const state = { asked: ['kind'] }; const before = JSON.stringify(state);
  assert.equal(eta.predict({ provider: 'claude', state: { wants3d: true } }).d3, true);
  eta.predict({ provider: 'claude', state, text: '3D please' });
  assert.equal(JSON.stringify(state), before, 'predict never writes state');
  assert.equal(eta.keyOf({ p: 'ai', pro: true, k: 'change', d3: true }), 'ai:pro:change:3d');
});

test('ETA-5 stats from timed builds: defaults below 10, the newest 40 of the bucket in 30 days, showAt from questions', () => {
  clean();
  seed([60, 61, 62, 63, 64, 65, 66, 67, 68]);
  assert.equal(eta.stats('ai:std:new:2d', NOW).src, 'default', '9 samples: still the defaults');
  clean();
  seed([10, 20, 30, 40, 50, 60, 70, 80, 90, 100], { first: 5 });
  let s = eta.stats('ai:std:new:2d', NOW);
  assert.deepEqual([s.src, s.n, s.p25, s.p50, s.p75], ['data', 10, 30 * S, 50 * S, 80 * S]);
  assert.deepEqual(s.tail, { p50: 5 * S, p75: 5 * S }, 'the tail is duration minus the first version');
  clean();
  seed([100, 100, 100, 100, 100, 100, 100, 100, 100, 100], { age: 31 });   // too old
  seed([200, 200, 200, 200, 200, 200, 200, 200, 200, 200], { sample: 0 });   // not samples (follow-ups, errors, resumes…)
  seed([300, 300, 300, 300, 300, 300, 300, 300, 300, 300], { key: 'ai:std:change:2d' });   // another bucket
  assert.equal(eta.stats('ai:std:new:2d', NOW).src, 'default');
  clean();
  seed(Array.from({ length: 40 }, () => 100), { age: 1 });   // the newest 40
  seed(Array.from({ length: 10 }, () => 900), { age: 2 });   // older: not read
  s = eta.stats('ai:std:new:2d', NOW);
  assert.deepEqual([s.n, s.p75], [40, 100 * S]);
  clean();
  seed([1, 1, 1, 2, 2, 2, 3, 3, 4, 4], { sample: 2 });
  assert.equal(eta.stats('ai:std:new:2d', NOW).showAt, 6 * S, 'question p90 4 s -> clamped to 6 s');
  clean();
  seed([30, 30, 30, 30, 30, 30, 30, 30, 30, 30], { sample: 2 });
  assert.equal(eta.stats('ai:std:new:2d', NOW).showAt, 20 * S, 'p90 30 s -> clamped to 20 s');
  clean();
  assert.equal(eta.stats('ai:std:new:2d', NOW).showAt, 8 * S, 'AI default');
});

test('ETA-6 the building blocks follow their chunk delay', () => {
  clean();
  withDelay(1500, () => {
    const n = eta.estimate({ p: 'blocks', pro: false, k: 'new', d3: false }, { now: NOW });
    assert.deepEqual([n.start.show, n.start.overAt, n.start.src], ['under', 75 * S, 'data']);
    assert.equal(eta.estimate({ p: 'blocks', pro: false, k: 'change', d3: false }, { now: NOW }).start.show, 'none');
    assert.equal(eta.stats('blocks:std:new:2d', NOW).showAt, 10 * S);
  });
  withDelay(12, () => {
    for (const k of ['new', 'change']) for (const d3 of [false, true]) assert.equal(eta.estimate({ p: 'blocks', pro: false, k, d3 }, { now: NOW }).start.show, 'none');
  });
});

test('ETA-7 cache: one read for two estimates; finish() clears only its own bucket', () => {
  clean();
  const all = q.all; let reads = 0;
  q.all = (...a) => { if (/FROM builder_turns/.test(a[0])) reads++; return all(...a); };
  try {
    eta.estimate(AI_NEW, { now: NOW }); eta.estimate(AI_NEW, { now: NOW });
    assert.equal(reads, 2, 'builds and questions, read once');
    const other = eta.estimate({ ...AI_NEW, k: 'change' }, { now: NOW }); reads = 0;
    q.run("INSERT INTO builder_turns(id, game_id, user_id, status, created_at) VALUES ('T-c', 'g', 'u', 'done', ?)", NOW);
    eta.finish({ id: 'T-c', est: other, versions: 1, base: 1, end: 'ok', durationMs: 40 * S });
    eta.estimate(AI_NEW, { now: NOW });
    assert.equal(reads, 0, 'another bucket stays cached');
    eta.estimate({ ...AI_NEW, k: 'change' }, { now: NOW });
    assert.equal(reads, 2, 'its own bucket is read again');
  } finally { q.all = all; }
});

test('ETA-8 finish: which builds are samples', () => {
  clean();
  const est = eta.estimate(AI_NEW, { now: NOW });
  const fin = o => { const id = uid(16); q.run("INSERT INTO builder_turns(id, game_id, user_id, status, created_at) VALUES (?,?,?,'done',?)", id, 'g', 'u', NOW); return eta.finish({ id, est, end: 'ok', durationMs: 60 * S, ...o }); };
  assert.deepEqual(fin({ versions: 0, durationMs: 5 * S }), { kind: 'question', sample: 2 });
  assert.deepEqual(fin({ versions: 1 }), { kind: 'new', sample: 1 });
  assert.deepEqual(fin({ versions: 2, base: 3 }), { kind: 'change', sample: 1 });
  for (const end of ['error', 'stopped', 'timeout', 'restart']) assert.equal(fin({ versions: 1, end }).sample, 0, end);
  assert.equal(fin({ versions: 1, followups: 1 }).sample, 0, 'follow-ups read');
  assert.equal(fin({ versions: 1, attempt: 2 }).sample, 0, 'resumed');
  assert.equal(fin({ versions: 1, chain: 1 }).sample, 0, 'a follow-on build');
  assert.equal(fin({ versions: 1, durationMs: 500 }).sample, 0, 'too quick to be real');
  assert.equal(fin({ versions: 1, durationMs: 21 * MIN, capMs: 20 * MIN }).sample, 0, 'over the cap');
  assert.equal(fin({ versions: 0, durationMs: 61 * S }).sample, 0, 'a question longer than a minute');
  const row = q.get('SELECT est_key, eta_hi_ms, eta_over_ms FROM builder_turns WHERE sample=1 LIMIT 1');
  assert.deepEqual(row, { est_key: 'ai:std:new:2d', eta_hi_ms: 2 * MIN, eta_over_ms: 138 * S }, 'what was shown, for the calibration query');
});

test('ETA-9 payloads name no model', () => {
  clean();
  const bad = /claude|sonnet|opus|haiku|fable|gpt/i;
  for (const p of ['ai', 'blocks']) for (const pro of [false, true]) for (const k of ['new', 'change']) for (const d3 of [false, true]) {
    const est = eta.estimate({ p, pro: p === 'ai' && pro, k, d3 }, { now: NOW });
    assert.ok(!bad.test(est.key) && !bad.test(JSON.stringify(est.start)), est.key);
    for (const x of [eta.tail(est, 30 * S), eta.onFollowUp(est, 40 * S)]) assert.ok(!bad.test(JSON.stringify(x)));
  }
  assert.ok(!bad.test(eta.keyOf(eta.predict({ provider: 'claude' }))));
});

test('ETA-10 "Usually" only from data: the AI says it is a guess until 10 timed builds; the building blocks are exact', () => {
  clean();
  seed([60, 61, 62, 63, 64, 65, 66, 67, 68]);
  assert.equal(eta.estimate(AI_NEW, { now: NOW }).start.src, 'default');
  seed([70], { age: 0.5 }); eta._reset();
  const e = eta.estimate(AI_NEW, { now: NOW });
  assert.deepEqual([e.start.src, e.start.n], ['data', 10]);
  assert.equal(eta.estimate({ p: 'blocks', pro: false, k: 'new', d3: false }, { now: NOW }).start.src, 'data');
  // A follow-up read moves the thresholds later by about a change build, never earlier.
  const m = eta.onFollowUp(e, 100 * S);
  assert.ok(m.phase === 'msg' && m.overAt >= e.start.overAt && m.bigAt > m.overAt);
});
