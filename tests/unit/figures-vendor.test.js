// The figure libraries (docs/third-party.md, server/services/figlibs.js): JSXGraph and SmilesDrawer from npm and our
// Oomba Figures, each in public/vendor/<lib>/<version>/ with its LICENSE and a manifest of sha256 hashes, all locked in
// figures/SHIPPED.json. A game loads them only with the exact pinned tags: the scanner admits those and refuses any
// altered or unpinned one, the frame's CSP names exactly those files (never their folders), and the screenshot worker
// serves exactly those files.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
const { FIG_LOCK, FIG_VERSIONS, FIG_LATEST, FIG_SCRIPTS, figTag, figTags, checkFigures, figureLibs, figureFile, usesFigures } = await import('../../server/services/figlibs.js');
const { scanVersion } = await import('../../server/services/scanner.js');
const { frameCsp } = await import('../../server/services/frame.js');
const { lockText, filesIn } = await import('../../scripts/build-figures.js');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const sha256 = b => crypto.createHash('sha256').update(b).digest('hex');
const sri = b => `sha384-${crypto.createHash('sha384').update(b).digest('base64')}`;

test('every vendored file matches its manifest and figures/SHIPPED.json, and nothing else is in the folders', () => {
  assert.deepEqual(FIG_LATEST, { jsxgraph: '1.14.3', 'smiles-drawer': '2.4.2', 'oomba-figures': '1.4.0' });
  assert.deepEqual(Object.keys(FIG_VERSIONS['oomba-figures']), ['1.0.0', '1.1.0', '1.2.0', '1.3.0', '1.4.0'], 'Oomba Figures 1.0.0 to 1.3.0 stay (saved games pin them)');
  for (const [lib, v] of Object.entries(FIG_VERSIONS).flatMap(([l, vs]) => Object.keys(vs).map(x => [l, x]))) {
    const dir = path.join(ROOT, 'public/vendor', lib, v), m = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
    assert.equal(m.name, lib); assert.equal(m.version, v);
    assert.deepEqual(filesIn(dir), ['manifest.json', ...Object.keys(m.files)].sort(), `${lib}: only the files the manifest names`);
    for (const [f, h] of Object.entries(m.files)) {
      const b = fs.readFileSync(path.join(dir, f));
      assert.equal(sha256(b), h.sha256, `${lib}/${f} sha256`); assert.equal(sri(b), h.sri, `${lib}/${f} sri`);
    }
    for (const f of filesIn(dir)) assert.equal(FIG_LOCK.files[`${lib}/${v}/${f}`].sha256, sha256(fs.readFileSync(path.join(dir, f))), `${lib}/${f} is locked`);
  }
  assert.equal(fs.readFileSync(path.join(ROOT, 'figures/SHIPPED.json'), 'utf8'), lockText(), 'the lock lists exactly what is on disk');
});
test('licences: each folder carries its package\'s own LICENSE file, MIT, and nothing GPL is vendored', () => {
  const lic = lib => fs.readFileSync(path.join(ROOT, 'public/vendor', lib, FIG_LATEST[lib], 'LICENSE'), 'utf8');
  for (const lib of Object.keys(FIG_LATEST)) {
    assert.match(lic(lib), /Permission is hereby granted, free of charge, to any person obtaining a copy/, lib);
    assert.doesNotMatch(lic(lib), /GNU (Lesser )?General Public License/, `${lib}: the MIT text, not the (L)GPL`);
  }
  assert.match(lic('jsxgraph'), /Matthias Ehmann/); assert.match(lic('smiles-drawer'), /Reymond Research Group/);
  // Oomba Figures 1.1.0 carries ported code under the Apache License 2.0: its text, verbatim, after our MIT text
  const ported = fs.readFileSync(path.join(ROOT, 'figures/src/ported/LICENSE.txt'), 'utf8');
  assert.match(ported, /^\s*Apache License\s+Version 2\.0, January 2004/); assert.match(ported, /END OF TERMS AND CONDITIONS/);
  assert.ok(lic('oomba-figures').startsWith('Oomba Figures\nCopyright (c) 2026 Oomba Academy') && lic('oomba-figures').endsWith(ported), 'MIT first, then the Apache text verbatim');
  assert.doesNotMatch(fs.readFileSync(path.join(ROOT, 'public/vendor/oomba-figures/1.0.0/LICENSE'), 'utf8'), /Apache/, '1.0.0 unchanged: MIT only');
  for (const v of ['1.1.0', '1.2.0', '1.3.0', '1.4.0']) assert.equal(JSON.parse(fs.readFileSync(path.join(ROOT, `public/vendor/oomba-figures/${v}/manifest.json`), 'utf8')).license, 'MIT AND Apache-2.0', v);
  const jm = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/vendor/jsxgraph', FIG_LATEST.jsxgraph, 'manifest.json'), 'utf8'));
  assert.equal(jm.license, '(MIT OR LGPL-3.0-or-later)'); assert.equal(jm.usedUnder, 'MIT', 'JSXGraph is used under MIT');
  const notice = fs.readFileSync(path.join(ROOT, 'docs/third-party.md'), 'utf8');
  for (const [lib, v] of Object.entries(FIG_LATEST)) assert.ok(notice.includes(`${lib}/${v}`) || notice.includes(`${lib}@${v}`), `docs/third-party.md lists ${lib} ${v}`);
  assert.match(notice, /chroma-js/); assert.match(notice, /BSD/);
  const all = []; const walk = d => { for (const e of fs.readdirSync(d, { withFileTypes: true })) e.isDirectory() ? walk(path.join(d, e.name)) : all.push(e.name); }; walk(path.join(ROOT, 'public/vendor'));
  assert.ok(!all.some(f => /circuitjs|phet/i.test(f)), 'no CircuitJS, no PhET');
});

const page = tags => `<title>Forces</title>${tags}<div id="q"></div><script>document.getElementById('q').append(OF.draw('bohr', { element: 'Na' }));</script>`;
test('the scanner admits exactly the pinned tags', () => {
  const r = scanVersion(page(figTags()));
  assert.equal(r.status, 'pass', JSON.stringify(r.issues));
  assert.deepEqual(checkFigures(page(figTags())).issues, []);
  assert.deepEqual(figureLibs(page(figTags())), FIG_LATEST);
  assert.ok(usesFigures(page(figTag('oomba-figures')))); assert.ok(!usesFigures('<p>a game</p>'));
  // any order and quoting of the three attributes
  const t = figTag('oomba-figures'), m = /src="([^"]+)" integrity="([^"]+)"/.exec(t);
  assert.equal(scanVersion(page(`<script crossorigin='anonymous' integrity='${m[2]}' src='${m[1]}'></script>`)).status, 'pass');
});
test('the scanner refuses altered or unpinned tags, and any other mention of their folders', () => {
  const t = figTag('oomba-figures'), h = FIG_VERSIONS['oomba-figures'][FIG_LATEST['oomba-figures']];
  const bad = [
    t.replace(h, `sha384-${'A'.repeat(64)}`),                                             // another hash
    t.replace(h, FIG_VERSIONS.jsxgraph[FIG_LATEST.jsxgraph]),                            // another file's hash
    t.replace(`/${FIG_LATEST['oomba-figures']}/`, '/9.9.9/'),                             // a version we do not have
    t.replace(' crossorigin="anonymous"', ''),                                            // no crossorigin
    t.replace('></script>', ' defer></script>'),                                          // anything extra
    t.replace('></script>', '>alert(1)</script>'),                                        // code inside the tag
    figTag('jsxgraph').replace('jsxgraphcore.js', 'jsxgraphsrc.js'),                      // another file of the library
    `<script src="/vendor/jsxgraph/1.14.3/manifest.json" integrity="${h}" crossorigin="anonymous"></script>`,
    `<script src="https://cdn.jsdelivr.net/npm/jsxgraph@1.14.3/distrib/jsxgraphcore.js"></script>`, // a CDN
    `<img src="/vendor/oomba-figures/1.0.0/oomba-figures.js">`,                            // its files named elsewhere
  ];
  for (const b of bad) {
    const r = scanVersion(page(b));
    assert.equal(r.status, 'fail', b);
    assert.ok(r.issues.some(i => /^figures_/.test(i.code) || ['external_script', 'external_url'].includes(i.code)), `${b}: ${JSON.stringify(r.issues)}`);
  }
});
test('the frame CSP names exactly the pinned files, never their folders; the screenshot worker serves only those', () => {
  const csp = frameCsp('https://oomba.example'), script = /script-src ([^;]+)/.exec(csp)[1].split(' ');
  for (const f of FIG_SCRIPTS) assert.ok(script.includes(`https://oomba.example${f}`), f);
  for (const lib of Object.keys(FIG_LATEST)) {
    assert.ok(!script.some(s => s === `https://oomba.example/vendor/${lib}/` || s === `https://oomba.example/vendor/${lib}/${FIG_LATEST[lib]}/`), `${lib}: no folder`);
    assert.ok(!/(img|font|connect|media|style)-src[^;]*\/vendor\/(jsxgraph|smiles-drawer|oomba-figures)/.test(csp), `${lib}: scripts only`);
  }
  assert.equal(FIG_SCRIPTS.length, 30, 'JSXGraph, SmilesDrawer, Oomba Figures 1.0.0, 1.1.0 and 1.2.0 with their five packs each, 1.3.0 with its six and 1.4.0 with its seven');
  for (const f of FIG_SCRIPTS) assert.ok(figureFile(f), f);
  for (const f of ['/vendor/oomba-figures/1.0.0/manifest.json', '/vendor/oomba-figures/1.0.0/LICENSE', '/vendor/oomba-figures/1.1.0/LICENSE', '/vendor/oomba-figures/1.2.0/LICENSE', '/vendor/oomba-figures/1.2.0/manifest.json', '/vendor/jsxgraph/1.14.3/../1.14.3/jsxgraphcore.js', '/vendor/jsxgraph/9.9.9/jsxgraphcore.js']) assert.equal(figureFile(f), null, f);
  const snap = fs.readFileSync(path.join(ROOT, 'server/services/snapshot.js'), 'utf8');
  assert.match(snap, /figureFile\(new URL\(u\)\.pathname\)/, 'the worker asks figureFile');
});
