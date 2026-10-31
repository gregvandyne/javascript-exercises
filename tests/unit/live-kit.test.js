// The kit's live pack (kit/packs/live.js, Oomba.live) without a browser, the live-ready lint notes and the mock
// Builder's "make it a live class game": solo play is unchanged, messages from the page become events, moves are
// whole centimetres at most 10 a second and only on a change, interpolation draws 120 ms behind and snaps big jumps,
// names come only from the roster, quiz answers carry the server-clock time. docs/kit-api.md "Live class games".
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fakeWin } from '../support/kit-fake.js';
import { createKit } from '../../kit/src/index.js';
import * as livePack from '../../kit/packs/live.js';

/** A kit with the live pack, in a live frame whose transport records what is sent; perf() is a fake clock. */
function liveKit({ role = 'player', active = true, view = '3d', device = null } = {}) {
  const sent = [], subs = [];
  const brb = { user: { displayName: 'Ana', lang: 'en' }, ...(device ? { device } : {}),
    live: active ? { v: 1, active: true, init: { v: 1, role, seat: 2, nameMode: 'nicknames', mode: 'game', nicks: ['Brave Otter', 'Sunny Panda', 'Speedy Fox'], view, me: { seat: 2, name: 1, avatar: { species: 'fox' }, team: 0 } },
      send: (t, m) => { sent.push({ t, ...m }); return true; }, on: fn => subs.push(fn) } : { v: 1, active: false } };
  const w = fakeWin({ brb, search: '' });
  let now = 1000, rafs = [];
  w.performance = { now: () => now };
  w.requestAnimationFrame = fn => { rafs.push(fn); return rafs.length; };
  const O = createKit(w); w.Oomba = O;
  O.__pk({ name: 'live', version: O.version }, livePack.define);
  const push = m => subs.forEach(fn => fn(m));
  const frame = () => { const r = rafs; rafs = []; r.forEach(fn => fn(now)); };
  return { O, L: O.live, sent, push, tick: ms => { now += ms; }, frame, at: () => now };
}

test('solo (not in a session): role solo, start after ready(), players() is just me, sending does nothing', () => {
  const { L, sent, frame } = liveKit({ active: false });
  assert.equal(L.active, false); assert.equal(L.role, 'solo');
  let started = 0; L.on('start', () => started++);
  L.ready({ presence: { bounds: 10, maxSpeed: 5 } });
  assert.equal(started, 0, 'not at once'); frame(); assert.equal(started, 1);
  assert.deepEqual(L.players().map(p => [p.seat, p.name]), [[0, 'Ana']]);
  L.score(10); L.item(1, true); L.send('x', 1); L.move(1, 0, 1, 0, 'run'); L.quiz.answer(0);
  assert.deepEqual(sent, []);
  let late = 0; L.on('start', () => late++); frame(); assert.equal(late, 1, 'a start handler added after the start still runs');
});

test('in a session: ready sends rdy with clamped settings; the page\'s messages become events; names only from the roster', () => {
  const { L, sent, push } = liveKit();
  assert.equal(L.active, true); assert.equal(L.role, 'player');
  L.ready({ presence: { bounds: 5000, maxSpeed: 9 }, lobby: true, quiz: false, maxScorePerSec: 50 });
  assert.deepEqual(sent[0], { t: 'rdy', view: '3d', cfg: { presence: { bounds: 1000, maxSpeed: 9 }, lobby: true, quiz: false, maxScorePerSec: 50 } });
  const ev = []; for (const e of ['welcome', 'start', 'join', 'leave', 'pause', 'resume', 'between', 'round', 'end', 'event', 'state', 'emote']) L.on(e, x => ev.push([e, x]));
  push({ t: 'wel', role: 'player', seat: 2, phase: 'lobby', seq: 1, round: 0, at: 0, state: { a: 1 }, players: [[1, 0, { species: 'bee' }, 0, 0, 1, 0, 0], [2, 1, null, 0, 0, 1, 0, 0]], mode: 'game' });
  assert.deepEqual(L.players().map(p => [p.seat, p.name, p.me]), [[1, 'Brave Otter', false], [2, 'Sunny Panda', true]]);
  push({ t: 'pj', p: [3, 2, null, 0, 0, 1, 0, 1] });
  assert.equal(L.nameOf(3), 'Speedy Fox'); assert.equal(L.player(3).late, true);
  push({ t: 'ph', phase: 'countdown', round: 0, seq: 2, at: 5000 });
  push({ t: 'ph', phase: 'playing', round: 1, seq: 3, at: 5000 });
  push({ t: 'ph', phase: 'paused', round: 1, seq: 4 }); push({ t: 'ph', phase: 'playing', round: 1, seq: 5 });
  push({ t: 'ph', phase: 'between', round: 1, seq: 6 }); push({ t: 'ph', phase: 'playing', round: 2, seq: 7 });
  push({ t: 'ev', f: 1, k: 'pick', d: { n: 2 } });
  push({ t: 'st', d: { b: 2, a: null } });
  push({ t: 'em', f: 1, e: 1 });
  push({ t: 'pl', n: 3 });
  push({ t: 'ph', phase: 'ended', seq: 8, top: [[1, 500], [2, 300]] });
  push({ t: 'whatever-new', x: 1 });   // a newer platform: ignored
  const names = ev.map(e => e[0]);
  assert.deepEqual(names, ['welcome', 'join', 'start', 'pause', 'resume', 'between', 'round', 'event', 'state', 'emote', 'leave', 'end']);
  assert.deepEqual(ev.find(e => e[0] === 'event')[1], { from: 1, kind: 'pick', data: { n: 2 } });
  assert.deepEqual(L.state, { b: 2 });
  assert.deepEqual(ev.find(e => e[0] === 'emote')[1], { from: 1, name: 'cheer', me: false });
  assert.deepEqual(ev.at(-1)[1].top, [{ seat: 1, score: 500, name: 'Brave Otter' }, { seat: 2, score: 300, name: 'Sunny Panda' }]);
  assert.equal(L.phase, 'ended');
});

test('move(): whole centimetres, a heading byte and an anim index; at most 10 a second, only on a change', () => {
  const { L, sent, tick } = liveKit();
  assert.equal(L.move(1.234, 0, -2.5, Math.PI, 'run'), true);
  assert.deepEqual(sent.at(-1), { t: 'mv', p: [123, 0, -250, 128, 2] });
  tick(50); assert.equal(L.move(2, 0, 0, 0, 'run'), false, 'too soon');
  tick(60); assert.equal(L.move(2, 0, 0, -Math.PI / 2, 'walk'), true);
  assert.deepEqual(sent.at(-1).p, [200, 0, 0, 192, 1]);
  tick(200); assert.equal(L.move(2, 0, 0, -Math.PI / 2, 'walk'), false, 'nothing changed');
  assert.equal(sent.filter(m => m.t === 'mv').length, 2);
});

test('interpolation: 120 ms behind the newest snapshot, the short way round, a jump over 5 m snaps', () => {
  const { L, push, tick, at } = liveKit();
  push({ t: 'clk', s: at() });   // the server clock = this frame's clock
  const t0 = at();
  push({ t: 's', ts: t0 - 200, p: [[5, 0, 0, 0, 250, 0]] });
  push({ t: 's', ts: t0 - 100, p: [[5, 100, 0, 0, 5, 1]] });
  push({ t: 's', ts: t0, p: [[5, 200, 0, 0, 10, 1]] });
  const s = L.position(5);   // drawn at t0 - 120: 80% of the way from the first to the second
  assert.ok(Math.abs(s.x - 0.8) < 1e-6, String(s.x));
  assert.ok(Math.min(s.h, 2 * Math.PI - s.h) < 0.2, 'heading crossed 0 the short way');
  push({ t: 's', ts: t0 + 100, p: [[5, 2000, 0, 0, 10, 1]] });
  tick(400);
  assert.equal(L.position(5).x, 20, 'a big jump (a teleport) snaps');
  // my own seat's snapshots are never drawn (the game draws me)
  push({ t: 's', ts: at(), p: [[2, 100, 0, 0, 0, 0]] });
  assert.equal(L.position(2), null);
});

test('quiz: answer() sends the choice and the time on the server clock, once; reveal and result arrive as events', () => {
  const { L, sent, push, tick, at } = liveKit();
  push({ t: 'clk', s: 50000 + at() - at() });   // server clock 50 s ahead of... the frame's own
  const off = 50000 - at();
  const qs = []; L.on('question', q => qs.push(q));
  push({ t: 'q', i: 0, n: 3, q: 'What is 2 + 2?', choices: ['3', '4', '5'], secs: 20, at: 50000 });
  assert.equal(qs.length, 1); assert.deepEqual(L.quiz.current.choices, ['3', '4', '5']);
  tick(1500);
  assert.equal(L.quiz.answer(9), false, 'no such choice');
  assert.equal(L.quiz.answer(1), true);
  assert.deepEqual(sent.at(-1), { t: 'an', i: 0, c: 1, e: Math.round(at() + off - 50000) });
  push({ t: 'ack', i: 0 }); assert.equal(L.quiz.answered, true); assert.equal(L.quiz.answer(2), false, 'once');
  push({ t: 'q', i: 0, n: 3, q: 'What is 2 + 2?', choices: ['3', '4', '5'], secs: 20, at: 52000 });   // resumed after a pause
  assert.equal(L.quiz.answered, true, 'a resend of the same question keeps the answer');
  const got = []; L.on('reveal', r => got.push(r)); L.on('result', r => got.push(r));
  push({ t: 'rv', i: 0, answer: 1, counts: [0, 1, 0], top: [[2, 900]] });
  push({ t: 'you', i: 0, ok: true, points: 900, rank: 1, score: 900 });
  assert.equal(got[0].top[0].name, 'Sunny Panda'); assert.equal(got[1].ok, true); assert.equal(L.me.score, 900);
  push({ t: 'q', i: 1, n: 3, q: 'Next', choices: ['a', 'b'], secs: 10, at: 60000 });
  assert.equal(L.quiz.answered, false, 'a new question opens');
});

test('the host: setState sends a patch and keeps it; a player cannot; the view is 2D on a device without 3D', () => {
  const h = liveKit({ role: 'host' });
  assert.equal(h.L.role, 'host'); assert.equal(h.L.me, null);
  assert.equal(h.L.setState({ round: { n: 1 } }), true); assert.deepEqual(h.sent.at(-1), { t: 'st', d: { round: { n: 1 } } });
  assert.deepEqual(h.L.state, { round: { n: 1 } });
  const p = liveKit();
  assert.equal(p.L.setState({ a: 1 }), false);
  assert.equal(liveKit({ device: { webgl2: false, importmap: true } }).L.view, '2d');
  assert.equal(liveKit({ view: '2d' }).L.view, '2d');
  assert.equal(liveKit().L.view, '3d');
});

test('the pack is thin: no DOM work when it loads, no timers, no network, no Date.now (kit source rules)', () => {
  const src = fs.readFileSync('kit/packs/live.js', 'utf8').replace(/\/\/[^\n]*/g, '');
  for (const re of [/\bsetTimeout\b|\bsetInterval\b/, /\bfetch\s*\(|XMLHttpRequest|WebSocket/, /Date\.now/, /Math\.random/, /postMessage/]) assert.doesNotMatch(src, re, String(re));
  const { L } = liveKit({ active: false });
  assert.equal(typeof L.crowd, 'function'); assert.equal(typeof L.flat, 'function');
  assert.equal(L.crowd({}), null, 'crowd() needs the 3D bridge');
});

test('flat(): players at their positions with roster names only; place() overrides, free() goes back', () => {
  const { L, push, at } = liveKit();
  push({ t: 'clk', s: at() });
  push({ t: 'wel', role: 'player', seat: 2, phase: 'lobby', seq: 1, round: 0, at: 0, state: {}, players: [[1, 0, null, 0, 0, 1, 0, 0], [2, 1, null, 0, 0, 1, 0, 0]] });
  const f = L.flat();
  push({ t: 's', ts: at() - 300, p: [[1, 300, 0, 400, 0, 0]] });
  assert.deepEqual(f.positions().map(p => [p.seat, p.x, p.z, p.name]), [[1, 3, 4, 'Brave Otter']]);
  f.place(1, 9, 9); assert.equal(f.positions()[0].x, 9);
  f.free(1); assert.equal(f.positions()[0].x, 3);
  const calls = []; const ctx = new Proxy({}, { get: (t, k) => (k in t ? t[k] : (...a) => calls.push([k, ...a])), set: (t, k, v) => { t[k] = v; return true; } });
  f.draw(ctx, { scale: 10, ox: 100, oy: 100 });
  assert.ok(calls.some(c => c[0] === 'fillText' && c[1] === 'Brave Otter'));
});

test('lint and scanner: live notes for a game that loads the live pack; the mock Builder makes a kit game live-ready', async () => {
  const { lintGame } = await import('../../server/services/stylelint.js');
  const { scanVersion } = await import('../../server/services/scanner.js');
  const { checkHtml } = await import('../../server/services/classlive-lint.js');
  const { withLive } = await import('../../server/builder/mock.js');
  const { templateHtml } = await import('../../server/builder/catalog.js');
  const { kitPackTag } = await import('../../server/services/kit.js');
  const { html } = await templateHtml('catch');
  assert.equal(checkHtml(html).ready, false);
  assert.equal(scanVersion(html).live, undefined, 'only games that load the live pack get a live verdict');
  const live = withLive(html);
  assert.ok(live.includes(kitPackTag('live')));
  assert.equal(checkHtml(live).ready, true, JSON.stringify(checkHtml(live).issues));
  assert.equal(scanVersion(live).status, 'pass'); assert.equal(scanVersion(live).live, true);
  assert.equal(withLive(live), live, 'once');
  // half-way: the pack but no ready() / start / report -> lint notes the Builder can act on
  const half = html.replace(/(<script src="\/vendor\/oomba-kit\/1\.1\.0\/oomba-kit\.js"[^>]*><\/script>)/, `$1\n${kitPackTag('live')}`);
  const codes = lintGame(half).map(l => l.code);
  for (const c of ['live_ready_call', 'live_no_start', 'live_no_report']) assert.ok(codes.includes(c), c);
  // aliases count: const L = Oomba.live; L.ready(...)
  assert.equal(checkHtml(`${half}<script>var L = Oomba.live; L.ready({}); L.on('end', f); L.score(1);</script>`).ready, true);
  // prose: a text box is a warning, never a block (text entry is off at run time)
  const typed = checkHtml(`${live}<input type="text">`);
  assert.equal(typed.ready, true); assert.ok(typed.issues.some(i => i.code === 'live_text'));
  // the raw transport is a fail
  assert.equal(checkHtml(`${live}<script>BRB.live.send('ev', {})</script>`).ready, false);
});

test('the Builder: live rules only for live asks and live games, in the 13 languages\' fixed Studio message', async () => {
  const { asksForLive, wantsLive, LIVE_RULES, SYSTEM_PROMPT } = await import('../../server/builder/prompt.js');
  const { kitPackTag } = await import('../../server/services/kit.js');
  assert.ok(LIVE_RULES.includes(kitPackTag('live'))); assert.ok(!SYSTEM_PROMPT.includes(kitPackTag('live')));
  assert.ok(LIVE_RULES.includes('Oomba.live.ready('));
  assert.equal(asksForLive('make it harder'), false);
  assert.equal(asksForLive('can we play it live in class?'), false, 'a loose "live" alone is not enough');
  for (const f of fs.readdirSync('server/i18n/locales').filter(x => x.endsWith('.json'))) {
    const msg = JSON.parse(fs.readFileSync(`server/i18n/locales/${f}`, 'utf8')).live?.entry?.studioAskText;
    if (msg) assert.equal(asksForLive(msg), true, f);
  }
  const st = {};
  assert.equal(wantsLive(st, 'Make this a live class game with Oomba Live', null), true);
  assert.equal(wantsLive(st, 'now make it blue', null), true, 'remembered');
  assert.equal(wantsLive({}, 'make it blue', { html: '<script src="/vendor/oomba-kit/1.1.0/packs/live.js"></script>' }), true);
  assert.equal(wantsLive({}, 'make it blue', { html: '<p>2d</p>' }), false);
});
