// Every question the site asks is in its own box (app.js ask, tell, askText: a <dialog> in the site's look), never the
// browser's grey confirm(), alert() or prompt(). The live host's Start with nobody in the room once showed the
// browser's box; this keeps any page from doing it again. It reads the site's own scripts and the views and routes
// that write inline ones (game frames, the SDK and the seed games are the games' own and are not read). A method of
// another object (sheet.confirm(), x.alert()) is fine; window.confirm( and a bare confirm( are not.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const walk = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
  const p = path.join(dir, e.name);
  if (e.isDirectory()) return e.name === 'vendor' || e.name === 'node_modules' || e.name === 'bank' ? [] : walk(p);
  return /\.(js|html)$/.test(e.name) && !e.name.includes('.min.') ? [p] : [];
});
const files = ['public/js', 'server/live', 'server/views', 'server/routes'].flatMap(d => walk(path.join(ROOT, d)));
// Comment lines are left out (they may name confirm() in passing), and so are // comments at a line's end.
const code = src => src.split('\n').map(l => (/^\s*(\/\/|\*|\/\*)/.test(l) ? '' : l.replace(/\s\/\/\s.*$/, '')));
const CALL = /(?<![\w$.])(confirm|alert|prompt)\s*\(|\b(?:window|self|globalThis|top|parent)\s*\.\s*(confirm|alert|prompt)\s*\(/;

test('no page calls the browser\'s confirm(), alert() or prompt()', () => {
  assert.ok(files.length > 50, 'the scripts were found');
  const bad = [];
  for (const f of files) {
    code(fs.readFileSync(f, 'utf8')).forEach((l, i) => { if (CALL.test(l)) bad.push(`${path.relative(ROOT, f)}:${i + 1} ${l.trim().slice(0, 100)}`); });
  }
  assert.deepEqual(bad, [], 'use ask() / tell() / askText() from /js/app.js (the site\'s own dialog) instead');
});

test('the checker catches the browser\'s boxes and lets other methods be', () => {
  for (const l of ['if (!confirm(x)) return;', 'window.confirm("Sure?")', 'alert (msg)', 'const v = prompt("Name")', 'onclick="return confirm(\'Delete?\')"', 'globalThis.alert(1)'])
    assert.ok(CALL.test(l), l);
  for (const l of ['await ask({ text })', 'sheet.confirm(x)', 'askConfirm(x)', 'promptBox(1)', 'data-confirm="Sure?"', 'confirmed(x)'])
    assert.ok(!CALL.test(l), l);
});

test('the site\'s dialog: a <dialog> opened with showModal, in app.js, which every page loads', () => {
  const app = fs.readFileSync(path.join(ROOT, 'public/js/app.js'), 'utf8');
  for (const name of ['ask', 'tell', 'askText']) assert.match(app, new RegExp(`export const ${name} = `), name);
  assert.match(app, /createElement\('dialog'\)/);
  assert.match(app, /showModal\(\)/);
  assert.match(app, /method="dialog"/);
  const layout = fs.readFileSync(path.join(ROOT, 'server/views/layout.js'), 'utf8');
  assert.match(layout, /<script type="module" src="\/js\/app\.js/, 'every page (the bare live pages too) loads app.js');
  const css = fs.readFileSync(path.join(ROOT, 'public/css/app.css'), 'utf8');
  assert.match(css, /\.ob-dialog\{[^}]*border-radius:var\(--r\)[^}]*background:var\(--card\)[^}]*box-shadow:var\(--shadow-lg\)/, 'card, 20px radius, shadow-lg');
  assert.match(css, /\.ob-dialog::backdrop\{/);
  assert.match(css, /\.btn-danger-solid\{background:var\(--danger\);color:var\(--on-danger\)/);
  // its two words are in every page's strings (js.app.*), in every language
  for (const f of fs.readdirSync(path.join(ROOT, 'server/i18n/locales')).filter(x => x.endsWith('.json'))) {
    const app2 = JSON.parse(fs.readFileSync(path.join(ROOT, 'server/i18n/locales', f), 'utf8')).js.app;
    assert.ok(app2.ok && app2.cancel, f);
  }
});

test('the live host asks before Start with nobody in the room, in the site\'s dialog, with "Start anyway"', () => {
  const host = fs.readFileSync(path.join(ROOT, 'public/js/live-host.js'), 'utf8');
  assert.match(host, /import \{[^}]*\bask\b[^}]*\} from '\/js\/app\.js'/);
  assert.match(host, /a === 'start' && players\.size === 0 && D\.text\.startEmpty && !\(await ask\(\{ text: D\.text\.startEmpty, ok: D\.text\.startAnyway \}\)\)\) return;/);
  const view = fs.readFileSync(path.join(ROOT, 'server/views/live.js'), 'utf8');
  assert.match(view, /startAnyway: rawT\(t\)\('live\.host\.startAnyway'\)/);
});
