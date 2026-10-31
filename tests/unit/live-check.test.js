// The live-ready check (services/classlive-check.js): what makes a game hostable live, one fixture per issue code,
// warnings that never block, results cached per version.
import { liveHtml, PACK_HASH, C, publish, teacher } from './_live.js';
import test from 'node:test';
import assert from 'node:assert/strict';
const { KIT_VERSIONS, kitTag } = await import('../../server/services/kit.js');
const codes = html => C.checkHtml(html).issues.map(i => i.code);

test('a live-ready game passes; its settings are read', () => {
  const r = C.checkHtml(liveHtml('', { quiz: true, lobby: true }));
  assert.equal(r.ready, true, JSON.stringify(r.issues));
  assert.equal(r.quiz, true); assert.equal(r.lobby, true); assert.equal(r.threeD, false);
});

test('one fixture per failure', () => {
  const ok = liveHtml();
  assert.ok(codes(ok.replace(/<script src="\/vendor\/oomba-kit\/1.1.0\/packs\/live.js"[^>]*><\/script>/, '')).includes('live_pack'));
  assert.ok(codes(ok.replace(PACK_HASH, 'sha384-wrong')).includes('live_pack'), 'a wrong pin');
  assert.ok(codes(ok.replace(KIT_VERSIONS['1.1.0'], KIT_VERSIONS['1.0.0']).replace('1.1.0/oomba-kit.js', '1.0.0/oomba-kit.js')).includes('live_pack'), 'kit 1.0.0 has no live pack');
  assert.ok(codes(ok.replace('live.ready(', 'live.readyy(')).includes('live_ready_call'));
  assert.ok(codes(ok.replace("live.on('start'", "live.on('tick'")).includes('live_no_start'));
  assert.ok(codes(ok.replace('live.score(1)', 'live.points(1)')).includes('live_no_report'));
  assert.ok(codes(liveHtml('BRB.live.send(1)')).includes('live_raw'));
  assert.ok(codes(liveHtml('const ch = new MessageChannel()')).includes('live_raw'));
  assert.ok(codes(liveHtml('parent.postMessage(1, "*")')).includes('live_raw'));
});

test('warnings never block: text inputs, data written as HTML, 3D without a 2D path or a crowd', () => {
  const three = `<script type="importmap">{"imports":{"three":"/vendor/three/0.185.1/three.module.min.js"}}</script>`;
  const r = C.checkHtml(liveHtml("live.ready({presence:{bounds:20}}); el.innerHTML = d.name; prompt('x')") + three + '<input type="text">');
  assert.equal(r.ready, true);
  assert.deepEqual(r.issues.map(i => i.code).sort(), ['live_no_2d', 'live_presence_unused', 'live_text', 'live_text_out']);
  const with2d = C.checkHtml(liveHtml("live.ready({presence:{bounds:20}}); live.crowd(B)") + three + '<meta name="oomba-live" content="2d">');
  assert.deepEqual(with2d.issues, []); assert.equal(with2d.twoD, true);
  void kitTag;
});

test('a stored version is checked once and cached; an unknown one is not ready', () => {
  const g = publish(teacher, liveHtml(), { title: 'Cached' });
  assert.equal(C.liveCheck(g.published_version_id).ready, true);
  assert.equal(C.gameReady(g), true);
  assert.equal(C.liveCheck('nope').ready, false);
});
