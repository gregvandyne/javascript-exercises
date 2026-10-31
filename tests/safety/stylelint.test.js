// The kit style lint (server/services/stylelint.js): notes for Oomba Kit games that never change the safety result.
import test from 'node:test';
import assert from 'node:assert/strict';
import { lintGame, kidChoices, respectChoices, LOOK_CODES } from '../../server/services/stylelint.js';
import { scanVersion } from '../../server/services/scanner.js';
import { kitTag, kitPackTag } from '../../server/services/kit.js';
import { withLayer } from '../../server/builder/layer.js';
import { threeImportMap } from '../../server/services/vendor.js';

// every kit game loads the dress pack (the world's automatic dressing); dress: false leaves it out
const kit = (script, { css = '', body = '', dress = true } = {}) => `<title>T</title>${css ? `<style>${css}</style>` : ''}<div id="game"></div>${body}\n${kitTag()}\n${dress ? kitPackTag('dress') + '\n' : ''}<script>\n${script}\n</script>`;
const GOOD = kit(`const CONFIG = {
  title: 'Spark Hop',
  tint: '#ff6b5b',
};
Oomba.game({ api: 1, title: CONFIG.title, level: Oomba.level.grid(['P', '#']), on: { start(w) { w.after(500, () => Oomba.ui.banner('correct')); } } });`);
const codes = html => lintGame(html).map(l => l.code);

test('a clean kit game has no notes; colour codes inside CONFIG are fine', () => {
  assert.deepEqual(lintGame(GOOD), []);
});

test('a kit game with no dress pack gets a note (its world stays bare), unless it asks for dress: off', () => {
  assert.deepEqual(codes(kit("Oomba.game({ api: 1 });", { dress: false })), ['dress_missing']);
  assert.deepEqual(codes(kit("Oomba.game({ api: 1, dress: 'off' });", { dress: false })), []);
  assert.deepEqual(codes(kit("Oomba.game({ api: 1, style: 'bold' });")), ['pack_missing'], 'bold needs the style-bold pack');
});

test('only kit games are linted: an older game keeps its own style', () => {
  const old = '<title>Old</title><style>body{background:#ff0000;font-family:Comic Sans MS}</style><canvas></canvas><script>setInterval(()=>{ctx.fillText("🍎",1,1)},16)</script>';
  assert.deepEqual(lintGame(old), []);
  assert.deepEqual(scanVersion(old).lint, []);
});

test('each rule: colour codes, emoji pictures, fonts, own screens and loop, wall-clock timing, slow effects, colour-only meaning', () => {
  assert.deepEqual(codes(kit("const c = 'x'; ctx.fillStyle = '#ff6b5b';")), ['raw_hex']);
  assert.deepEqual(codes(kit('', { css: '.card{background:#fff}' })), ['raw_hex']);
  assert.deepEqual(codes(kit('', { css: '#face{display:block}' })), [], 'an id selector is not a colour');
  assert.deepEqual(codes(kit("document.querySelector('#bad').hidden = true;")), [], 'a selector string is not a colour');
  assert.deepEqual(codes(kit("ctx.fillText('🍎', 10, 10);")), ['emoji_text']);
  assert.deepEqual(codes(kit('ctx.fillText(item.emoji, x, y);')), ['emoji_text']);
  assert.deepEqual(codes(kit('', { css: 'h1{font-family:"Comic Sans MS"}' })), ['font']);
  assert.deepEqual(codes(kit('', { css: '.x{font:700 20px system-ui,sans-serif}' })), ['font']);
  assert.deepEqual(codes(kit("ctx.font = 'bold 20px Arial';")), ['font']);
  assert.deepEqual(codes(kit('', { css: '.x{font-family:inherit}.y{font:700 1em var(--ok-font)}' })), [], 'the kit font is fine');
  assert.deepEqual(codes(kit("Oomba.game({}); const p = document.createElement('div'); p.id = 'pause-screen';")), ['own_screens']);
  assert.deepEqual(codes(kit("Oomba.game({}); el.textContent = 'Game over';")), ['own_screens'], 'the kit never says game over');
  assert.deepEqual(codes(kit('Oomba.game({}); requestAnimationFrame(loop);')), ['own_loop']);
  assert.deepEqual(codes(kit("const p = document.createElement('div'); p.id = 'pause';")), [], 'a stage game may build its own screens');
  assert.deepEqual(codes(kit('const t = Date.now();')), ['timing']);
  assert.deepEqual(codes(kit('setTimeout(go, 500);')), ['timing']);
  assert.deepEqual(codes(kit('setInterval(go, 500);')), ['timing']);
  assert.deepEqual(codes(kit("S.draw(ctx => { ctx.shadowBlur = 20; });")), ['slow_effect']);
  assert.deepEqual(codes(kit("Oomba.game({ update(w) { ctx.filter = 'blur(4px)'; } });")), ['slow_effect']);
  const only = lintGame(kit("tile.style.background = right ? 'green' : 'red';"));
  assert.deepEqual(only.map(l => [l.code, l.level]), [['colour_only', 'info']]);
  assert.deepEqual(codes(kit("tile.style.background = Oomba.color(right ? 'correct' : 'wrong'); tile.innerHTML = Oomba.icon(right ? 'check' : 'cross');")), [], 'colour with a shape is fine');
});

test('the notes never change the safety status, and the Builder layer is not the game\'s code', () => {
  const messy = kit("ctx.font = 'bold 20px Arial'; ctx.fillText('🍎', 1, 1); setTimeout(go, 9); ctx.fillStyle = '#ff0000';");
  const r = scanVersion(messy);
  assert.equal(r.status, 'pass', JSON.stringify(r.issues));
  assert.deepEqual(r.lint.map(l => l.code).sort(), ['emoji_text', 'font', 'raw_hex', 'timing']);
  assert.ok(r.lint.every(l => l.message.length > 40));
  // look notes are suggestions only (the creative-freedom guarantee); the rest stay warnings
  for (const l of r.lint) assert.equal(l.level, l.code === 'timing' ? 'warn' : 'info', l.code);
  assert.deepEqual(r.lint.filter(l => l.look).map(l => l.code).sort(), ['emoji_text', 'font', 'raw_hex']);
  // the kit layer itself uses setTimeout-free code, but even the classic layer's timers are never counted against the game
  assert.deepEqual(lintGame(withLayer(GOOD, { speed: 1.25, look: { fox: { colors: { base: 'sky' } } } })), []);
});

test('3D kit games: materials need colour codes in code, so only their CSS counts', () => {
  const three = `<title>T</title><canvas id="view"></canvas>\n${kitTag()}\n${threeImportMap()}\n<script type="module">\nimport * as THREE from 'three';\nconst m = new THREE.MeshLambertMaterial({ color: '#56bb48' });\n</script>`;
  assert.deepEqual(codes(three), ['three_bridge'], 'a 3D kit game is pointed at the 3D bridge');
  assert.deepEqual(codes(three.replace('<canvas', '<style>.tip{background:#fff}</style><canvas')), ['raw_hex', 'three_bridge']);
  const bridged = three.replace(kitTag(), kitTag() + kitPackTag('bridge-3d')).replace("const m =", "const B = Oomba.three(THREE, { scene });\nconst m =");
  assert.deepEqual(lintGame(bridged), []);
  assert.deepEqual(codes(bridged.replace(kitPackTag('bridge-3d'), '')), ['pack_missing']);
});

test('false positives from the review stay quiet: words in the game\'s text, "result-row", "Room #101", id selectors after a pseudo-class', () => {
  assert.deepEqual(codes(kit("const WORDS = { en: { again: 'Play again', p: 'Paused' } }; Oomba.game({ strings: WORDS });")), [], 'a WORDS value is not a screen');
  assert.deepEqual(codes(kit("Oomba.game({}); row.className = 'result-row';", { body: '<div class="results-list"></div>' })), [], 'result-row is not the results screen');
  assert.deepEqual(codes(kit("Oomba.game({}); const p = document.createElement('div'); p.className = 'results';")), ['own_screens'], 'a class that is the screen\'s name');
  assert.deepEqual(codes(kit("label.textContent = 'Room #101';")), [], 'text with a number sign is not a colour');
  assert.deepEqual(codes(kit('', { css: '.card:hover #bead{display:block}' })), [], 'an id selector after a pseudo-class is not a colour');
  assert.deepEqual(codes(kit('', { css: '.card:hover #bead{color:#123456}' })), ['raw_hex'], 'its value still is');
  assert.deepEqual(codes(kit("el.style.background = '#ff0000';")), ['raw_hex']);
});

test('the new rules: pack art without its tag, unknown icon names, emoji pictures in the page, motion without a reduced path, gate handlers, controls none, missing keys', () => {
  assert.deepEqual(codes(kit("Oomba.game({ hero: 'owl', biome: 'reef' });")), ['pack_missing']);
  assert.deepEqual(codes(kit("Oomba.game({ hero: 'owl' });").replace('</script>\n<script>', '</script>\n' + kitPackTag('art-animals') + '\n<script>')), [], 'loaded: fine');
  assert.deepEqual(codes(kit("Oomba.game({ hero: 'fox', biome: 'meadow' });")), [], 'core art: fine');
  assert.deepEqual(codes(kit("Oomba.ui.button('Fire', { icon: 'rocketship' });")), ['icon_name']);
  assert.deepEqual(codes(kit("Oomba.ui.button('Up', { icon: 'up' });")), [], 'a real icon name is fine');
  assert.deepEqual(codes(kit('', { body: '<span>🍎</span>' })), ['emoji_dom']);
  assert.deepEqual(codes(kit("card.textContent = '🐟';")), ['emoji_dom']);
  assert.deepEqual(codes(kit('', { css: '.card{animation:flip .3s}' })), ['motion']);
  assert.deepEqual(codes(kit('', { css: '.card{transition:transform .3s}.ok-rm .card{transition:none}' })), [], 'with a reduced path: fine');
  assert.deepEqual(codes(kit("Oomba.game({ on: { gate(w, g) { w.say(g, 'hi'); } } });")), ['gate_handler']);
  assert.deepEqual(codes(kit("Oomba.game({ on: { gate: async (w, g) => (await w.ask({ q: '1+1', a: 2 })) } } });")), []);
  assert.deepEqual(codes(kit("Oomba.game({ controls: 'none', level: Oomba.level.grid(['          ', '  P  $  G ', '##########']) });")), ['none_world']);
  assert.deepEqual(codes(kit("Oomba.game({ controls: 'none', level: Oomba.level.grid(['          ', '  P  $  G ', '##########']), update(w) { w.hero.x += 2; } });")), [], 'a hero moved from code: fine');
  assert.deepEqual(codes(kit("const WORDS = { en: { sub: 'Hop!' } }; Oomba.game({ strings: WORDS, subtitle: 'sub', howTo: [{ icon: 'jump', text: 'jumpTip' }] });")), ['missing_key']);
});

test('linear time: pathological 2 MB uploads (and 300 KB ones that are linted) scan fast', () => {
  const tag = kitTag();
  const inputs = [
    `${tag}<style>a{x${':a'.repeat(140000)}}</style>`,
    `${tag}<style>${'/*'.repeat(140000)}</style>`,
    `${tag}<script>${"'#".repeat(140000)}</script>`,
    `${tag}${'<script>'.repeat(35000)}`,
    `${tag}<div ${' style="'.repeat(35000)}>`,
    `${tag}<script>Oomba.game({});${'fillText('.repeat(30000)}</script>`,
    `${tag}<script>${'.font = "1'.repeat(28000)}</script>`,
    `${tag}<style>a{x${':a'.repeat(1000000)}}</style>`,
  ];
  for (const s of inputs) {
    const t0 = performance.now(); lintGame(s); const ms = performance.now() - t0;
    assert.ok(ms < 400, `${s.slice(tag.length, tag.length + 30)}… took ${Math.round(ms)} ms`);
  }
  const t0 = performance.now(); scanVersion(inputs[inputs.length - 1]); assert.ok(performance.now() - t0 < 4000, 'the whole scan of a 2 MB upload');
});

test('a profanity hit tells the Builder which word matched and where (a model-only detail); French "pas de retard" passes', async () => {
  const { scanVersion: scan } = await import('../../server/services/scanner.js');
  assert.equal(scan(kit("const W = { fr: { late: 'La grenouille a {n} pas de retard' } };")).status, 'pass');
  const r = scan(kit("const W = { en: { bad: 'what a retard' } };"));
  const i = r.issues.find(x => x.code === 'profanity');
  assert.equal(i.message, 'Has words that are not allowed.', 'the message players and the Studio see stays the same');
  assert.match(i.detail, /"retard" matched in: "what a retard"/);
});

test('themes (kit 1.1.0): a known name, on a kit that has them, with the packs its world needs (CONFIG counts)', () => {
  const withPack = (html, ...packs) => html.replace(kitPackTag('dress') + '\n', kitPackTag('dress') + '\n' + packs.map(p => kitPackTag(p) + '\n').join(''));
  assert.deepEqual(codes(kit("const CONFIG = {\n  theme: 'beach',\n};\nOomba.game({ theme: CONFIG.theme });")), [], 'a core-world theme needs only dress');
  assert.deepEqual(codes(kit("Oomba.game({ theme: 'castle' });")), ['pack_missing']);
  assert.match(lintGame(kit("Oomba.game({ theme: 'castle' });")).find(n => n.code === 'pack_missing').message, /castle theme needs the art-biomes-2 pack/);
  assert.deepEqual(codes(withPack(kit("Oomba.game({ theme: 'castle' });"), 'art-biomes-2')), [], 'with its pack: fine');
  assert.deepEqual(codes(kit("Oomba.game({ theme: { name: 'Ocean Reef', accent: 'grape' } });")), ['pack_missing'], 'aliases and the object form');
  assert.deepEqual(codes(kit("Oomba.game({ theme: 'dark' });")), [], "'dark' is still the mode");
  assert.deepEqual(codes(kit("Oomba.game({ theme: 'lava world' });")), ['theme_name']);
  assert.deepEqual(codes(kit("Oomba.game({ theme: 'beach' });", { dress: false })).sort(), ['dress_missing', 'pack_missing'].sort());
  // a game saved on kit 1.0.0 has no themes
  const old = `<title>T</title><div id="game"></div>\n${kitTag('1.0.0')}\n${kitPackTag('dress', '1.0.0')}\n<script>\nOomba.game({ theme: 'beach' });\n</script>`;
  assert.deepEqual(codes(old), ['theme_kit']);
  assert.deepEqual(codes(`<title>T</title><div id="game"></div>\n${kitTag('1.0.0')}\n${kitPackTag('dress', '1.0.0')}\n<script>\nOomba.game({ biome: 'beach' });\n</script>`), [], 'a 1.0.0 game without themes lints as before');
});

// ---- The creative-freedom guarantee: the lint never flags or "corrects" a builder's explicit creative choices.
const LOOKY = kit(`ctx.font = 'bold 20px Comic Sans MS'; ctx.fillText('🦄', 1, 1); ctx.fillStyle = '#ff00ff'; document.body.style.background = '#000000';
Oomba.game({ api: 1, theme: 'jelly volcano', hero: { species: 'dragoncat', colors: { base: 'grape' } }, level: Oomba.level.grid(['P', '#']) });`, { dress: false });

test('look notes are suggestions only (info, look: true); other notes keep their level', () => {
  const all = lintGame(LOOKY);
  assert.deepEqual(all.filter(l => l.look).map(l => l.code).sort(), ['dress_missing', 'emoji_text', 'font', 'raw_hex', 'theme_name']);
  for (const l of all) if (LOOK_CODES.includes(l.code)) { assert.equal(l.level, 'info', l.code); assert.equal(l.look, true); }
  assert.ok(!all.some(l => /dragoncat/.test(l.message)), 'a made-up creature is never flagged');
});

test('what the builder asked for is never flagged: their colours, emoji, font, plain look and made-up world', () => {
  const asked = 'Make a game with a dragoncat hero in a jelly volcano world. Make it pink and black, plain and simple with no decorations, use emoji and a Comic Sans font!';
  assert.deepEqual(lintGame(LOOKY, { request: asked }).filter(l => l.look), [], JSON.stringify(lintGame(LOOKY, { request: asked })));
  // one choice at a time: only that note goes
  const left = req => lintGame(LOOKY, { request: req }).filter(l => l.look).map(l => l.code).sort();
  assert.deepEqual(left('make everything purple'), ['dress_missing', 'emoji_text', 'font', 'theme_name']);
  assert.deepEqual(left('keep it minimal'), ['emoji_text', 'font', 'raw_hex', 'theme_name']);
  assert.deepEqual(left('I want a jelly volcano!'), ['dress_missing', 'emoji_text', 'font', 'raw_hex']);
  assert.deepEqual(left('use 🦄 as the hero'), ['dress_missing', 'font', 'raw_hex', 'theme_name']);
  assert.deepEqual(left('add a cool font'), ['dress_missing', 'emoji_text', 'raw_hex', 'theme_name']);
  // in other languages too, and across earlier messages
  assert.ok(!left(['Fais un jeu', 'en rose et noir']).includes('raw_hex'));
  assert.ok(!left('un juego sencillo').includes('dress_missing'));
  assert.ok(!left('ピンクにして').includes('raw_hex'));
  // a request that asks for none of it leaves every suggestion in place
  assert.deepEqual(left('add a second level'), ['dress_missing', 'emoji_text', 'font', 'raw_hex', 'theme_name']);
  // safety and correctness notes are never dropped by a request
  const timing = kit("setTimeout(go, 9); Oomba.game({ api: 1 });");
  assert.ok(lintGame(timing, { request: 'pink plain emoji font' }).some(l => l.code === 'timing'));
  assert.deepEqual([...kidChoices('')], []);
  assert.deepEqual(respectChoices([{ code: 'pack_missing', level: 'warn', message: 'x' }], 'plain pink emoji font'), [{ code: 'pack_missing', level: 'warn', message: 'x' }]);
});
