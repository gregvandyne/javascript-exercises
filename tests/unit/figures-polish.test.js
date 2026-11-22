// Figures Phase 4, polish (docs/decisions.md "Figures Phase 4: polish"): the undo/redo history (public/js/figures-history.js)
// and its keys, the reuse terms page in every locale (the notice word for word, no em dashes, gated like every Figures
// page), the presets routes (save, list, delete: owner only), the menu cards' pictures (wide examples stacked, nothing
// cut), the More menu markup, and the builder's delete button naming a test and a lesson's questions.
import './_setup.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const { config } = await import('../../server/config.js');
config.anthropicKey = '';
const { createUser, startSession } = await import('../../server/auth.js');
const F = await import('../../server/services/figures.js');
const { createApp } = await import('../../server/app.js');
const { createHistory, historyKey } = await import('../../public/js/figures-history.js');

let server, base;
test.before(async () => { server = createApp().listen(0); server.keepAliveTimeout = 0; await new Promise(r => server.once('listening', r)); base = `http://127.0.0.1:${server.address().port}`; });
test.after(() => server.close());
const cookieFor = id => { let c = ''; startSession({ append: (k, v) => { c = v.split(';')[0]; } }, id); return c; };
const as = (who, lang = '') => async (p, { body } = {}) => {
  const headers = { ...(who ? { cookie: `${cookieFor(who.id)}${lang ? `; lang=${lang}` : ''}` } : lang ? { cookie: `lang=${lang}` } : {}) };
  if (body !== undefined) headers['content-type'] = 'application/json';
  const r = await fetch(base + p, { method: body !== undefined ? 'POST' : 'GET', headers, body: body !== undefined ? JSON.stringify(body) : undefined, redirect: 'manual' });
  const text = await r.text(); let json = null; try { json = JSON.parse(text); } catch { /* html */ }
  return { status: r.status, text, json, headers: r.headers };
};
const boss = createUser({ username: 'FigPolish', password: 'secret123', role: 'admin' });
const other = createUser({ username: 'FigOther', password: 'secret123', role: 'admin' });
const kid = createUser({ username: 'FigKid', password: 'secret123', role: 'kid', age: 10 });
const LOCALES = fs.readdirSync(path.join(ROOT, 'server/i18n/locales')).map(f => f.replace(/\.json$/, ''));
const NOTICE = 'Made with Oomba Academy. Everything Oomba Academy contributes to this figure is dedicated to the public domain under CC0 1.0 (https://creativecommons.org/publicdomain/zero/1.0/). Anything original added by the person who made it is theirs.';

test('history: commit, undo, redo, a new change drops the redo steps, bounded, and typing is one step', async () => {
  let state = 'a';
  const h = createHistory({ snap: () => state, restore: s => { state = s; }, limit: 3, wait: 20 });
  assert.equal(h.canUndo(), false); assert.equal(h.canRedo(), false);
  for (const s of ['b', 'c']) { state = s; h.commit(true); }
  assert.deepEqual(h.sizes(), { undo: 2, redo: 0 });
  assert.equal(h.undo(), true); assert.equal(state, 'b');
  assert.equal(h.undo(), true); assert.equal(state, 'a');
  assert.equal(h.undo(), false); assert.equal(state, 'a');
  assert.equal(h.redo(), true); assert.equal(state, 'b');
  state = 'x'; h.commit(true);
  assert.equal(h.canRedo(), false, 'a new change drops what could be redone');
  for (const s of ['d', 'e', 'f', 'g']) { state = s; h.commit(true); }
  assert.equal(h.sizes().undo, 3, 'at most limit steps');
  // typing: several changes inside the wait are one step; undo while it is still pending undoes it
  state = 'g1'; h.commit(); state = 'g12'; h.commit(); state = 'g123'; h.commit();
  assert.equal(h.canUndo(), true);
  assert.equal(h.undo(), true); assert.equal(state, 'g');
  assert.equal(h.redo(), true); assert.equal(state, 'g123');
  state = 'h'; h.commit(); await new Promise(r => setTimeout(r, 40));
  assert.equal(h.sizes().redo, 0); h.undo(); assert.equal(state, 'g123');
  h.reset(); assert.equal(h.canUndo(), false); assert.equal(h.canRedo(), false);
  state = 'same'; h.reset(); h.commit(true); assert.equal(h.canUndo(), false, 'no step for no change');
});

test('history keys: Ctrl/Cmd+Z undo, Shift+Ctrl/Cmd+Z and Ctrl+Y redo, nothing else', () => {
  assert.equal(historyKey({ ctrlKey: true, key: 'z' }), 'undo');
  assert.equal(historyKey({ metaKey: true, key: 'Z', shiftKey: true }), 'redo');
  assert.equal(historyKey({ ctrlKey: true, shiftKey: true, key: 'Z' }), 'redo');
  assert.equal(historyKey({ ctrlKey: true, key: 'y' }), 'redo');
  assert.equal(historyKey({ metaKey: true, key: 'y' }), 'redo');
  assert.equal(historyKey({ key: 'z' }), null);
  assert.equal(historyKey({ ctrlKey: true, altKey: true, key: 'z' }), null);
  assert.equal(historyKey({ ctrlKey: true, key: 'x' }), null);
});

test('the terms page renders in every locale with the notice word for word, the CC0 deed and no em dashes', async () => {
  assert.ok(LOCALES.length >= 13);
  assert.equal(F.kitFor().notice, NOTICE, 'the notice the files carry (figures-export.js stamps the same words)');
  const en = JSON.parse(fs.readFileSync(path.join(ROOT, 'server/i18n/locales/en.json'), 'utf8'));
  for (const l of LOCALES) {
    const r = await as(boss, l)('/figures/terms');
    assert.equal(r.status, 200, l);
    assert.ok(r.text.includes(NOTICE), `${l}: the notice, in English, word for word`);
    assert.match(r.text, /<blockquote class="fg-terms-notice" lang="en" dir="ltr"/);
    assert.ok(r.text.includes('https://creativecommons.org/publicdomain/zero/1.0/'), l);
    assert.match(r.text, /href="\/terms"/);
    const main = r.text.slice(r.text.indexOf('<article class="fg-terms">'), r.text.indexOf('</article>'));
    assert.doesNotMatch(main, /\u2014/, `${l}: no em dashes`);
    const j = JSON.parse(fs.readFileSync(path.join(ROOT, `server/i18n/locales/${l}.json`), 'utf8'));
    if (l !== 'en-GB') {
      assert.equal(Object.keys(j.figures.terms).length, Object.keys(en.figures.terms).length, `${l}: every terms string`);
      assert.ok(main.includes(j.figures.terms.can1.replace(/'/g, '&#39;').replace(/"/g, '&quot;')), `${l}: in its language`);
    }
  }
  for (const [k, v] of Object.entries(en.figures.terms)) assert.doesNotMatch(v, /\u2014|\u2013/, k);
  // the words a teacher needs: free to use, copy, print, share and change; what stays theirs
  const r = await as(boss)('/figures/terms');
  for (const w of [/Copy, print and share/, /Change them/, /without asking us and without giving credit/, /Anything original you add is yours/, /What CC0 means/]) assert.match(r.text, w);
});

test('the terms page is behind the Figures gate, and the editor links to it from the export notice', async () => {
  assert.equal((await as(kid)('/figures/terms')).status, 404);
  const out = await as(null)('/figures/terms');
  assert.equal(out.status, 302, 'signed out: the sign-in page, like the other Figures pages'); assert.match(out.headers.get('location'), /^\/login\?next=/);
  const old = config.figures; config.figures = false;
  try { assert.equal((await as(boss)('/figures/terms')).status, 404); assert.equal((await as(null)('/figures/terms')).status, 404); } finally { config.figures = old; }
  const src = fs.readFileSync(path.join(ROOT, 'public/js/figures-editor.js'), 'utf8');
  assert.match(src, /js\.figures-editor\.notice'\)\)\} <a href="\/figures\/terms">/);
});

test('presets: save, list (newest first), delete; another teacher cannot delete them', async () => {
  const api = as(boss), them = as(other);
  const a = await api('/api/figures/presets', { body: { kind: 'rectangle', name: 'Big box', data: { AB: 9, BC: 4, unit: 'cm' } } });
  assert.equal(a.status, 200);
  await api('/api/figures/presets', { body: { kind: 'rectangle', name: 'Small box', data: { AB: 3, BC: 2 } } });
  const list = (await api('/api/figures/presets/rectangle')).json.presets;
  assert.deepEqual(list.map(p => p.name), ['Small box', 'Big box']);
  assert.equal((await them(`/api/figures/presets/${a.json.preset.id}/delete`, { body: {} })).status, 404);
  assert.equal((await api(`/api/figures/presets/${a.json.preset.id}/delete`, { body: {} })).status, 200);
  assert.deepEqual((await api('/api/figures/presets/rectangle')).json.presets.map(p => p.name), ['Small box']);
  // the editor lists the kind's examples first, then the teacher's own, in its ⋯ menu
  const page = await api('/figures/rectangle');
  assert.match(page.text, /"mine":\[\{"id":"[^"]+","name":"Small box"/);
});

test('POST /api/figures/gen with a saved figure finds the earlier definition that dealt it (PAST_GENS), as saving does', async () => {
  const CAT = await import('../../public/js/figures-catalog.js');
  const past = CAT.PAST_GENS.angles[0];
  let seed = 1, was = null;
  for (; seed < 200000; seed += 7) { const w = F.generate('angles', seed, undefined, past), now = F.generate('angles', seed); if (w && now && JSON.stringify(w.data) !== JSON.stringify(now.data)) { was = w; break; } }
  assert.ok(was);
  const api = as(boss);
  const r = await api('/api/figures/gen', { body: { gen: 'angles', seed, data: was.data } });
  assert.equal(r.status, 200); const J = x => JSON.stringify(x);
  assert.equal(J(r.json.data), J(was.data)); assert.equal(r.json.answer, was.answer); assert.equal(J(r.json.work), J(was.work));
  const now = await api('/api/figures/gen', { body: { gen: 'angles', seed } });
  assert.equal(J(now.json.data), J(F.generate('angles', seed).data), 'without a figure: the current definition');
  const other = await api('/api/figures/gen', { body: { gen: 'angles', seed, data: { rays: [0, 33, 90] } } });
  assert.equal(J(other.json.data), J(F.generate('angles', seed).data), 'a figure no definition dealt: the current one (the editor then shows no generator answer)');
  assert.match(fs.readFileSync(path.join(ROOT, 'public/js/figures-editor.js'), 'utf8'), /body: \{ gen: S\.gen, seed: S\.seed, data: S\.data \}/);
});

test('card pictures: wide examples are stacked (two or three of them), every picture is whole and drawable', () => {
  for (const K of F.KINDS) {
    const svg = F.thumbnail(K.id);
    const v = /viewBox="([^"]+)"/.exec(svg)[1].split(/\s+/).map(Number);
    assert.ok(v[2] / v[3] <= 3.05, `${K.id}: ${v[2]}x${v[3]} is not a thin strip on its card`);
    assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/, K.id);
    assert.match(svg, /<title>/, K.id);
  }
  const nl = F.thumbnail('numberLine');
  assert.equal((nl.match(/<svg x=/g) || []).length, 3, 'the number line card shows its three examples');
  assert.match(nl, /class="of-fig of-thumb"/);
  assert.equal(F.thumbnail('triangle'), F.kitFor().svg('triangle', F.kindOf('triangle').presets[0], { lang: 'en', title: 'Triangle' }), 'a normal kind is its first example as it is');
  const css = fs.readFileSync(path.join(ROOT, 'public/css/figures.css'), 'utf8');
  assert.match(css, /\.fg-thumb img\{display:block;width:100%;height:100%;object-fit:contain\}/, 'small figures grow to the card');
});

test('the builder rows: the row opens the editor, ⟳ only with a generator, ⋯ More with Move up, Move down, Swap figure, Delete last', () => {
  const src = fs.readFileSync(path.join(ROOT, 'public/js/figures-sheet.js'), 'utf8');
  const row = src.slice(src.indexOf('<div class="fg-iacts">'), src.indexOf("</div></li>`).join('')"));
  assert.match(row, /it\.hasGen \? `<button[^`]*data-act="regen"/);
  const order = ['up', 'down', 'swap', 'del'].map(a => row.indexOf(`menuItem('${a}'`));
  assert.ok(order.every((x, i) => x > 0 && (i === 0 || x > order[i - 1])), 'Move up, Move down, Swap figure, then Delete');
  assert.match(row, /menuItem\('del', t\('js\.figures-sheet\.delete'\), \{ danger: true/);
  assert.equal((row.match(/<button/g) || []).length, 1, 'one visible button besides ⋯');
  assert.doesNotMatch(row, /data-act="(up|down|del|edit)"/);
  assert.match(src, /e\.altKey/);
  const menu = fs.readFileSync(path.join(ROOT, 'public/js/figures-menu.js'), 'utf8');
  for (const k of ['ArrowDown', 'ArrowUp', 'Home', 'End', 'Escape', 'Tab']) assert.ok(menu.includes(`'${k}'`), k);
  assert.match(menu, /aria-haspopup="menu"/);
});

test('the delete button names what it deletes: worksheet, test, or a lesson\'s questions, in every locale', () => {
  const en = JSON.parse(fs.readFileSync(path.join(ROOT, 'server/i18n/locales/en.json'), 'utf8')).js['figures-sheet'];
  assert.equal(en.remove, 'Delete worksheet'); assert.equal(en.removeTest, 'Delete test'); assert.equal(en.removeLesson, 'Delete these questions');
  for (const l of LOCALES.filter(x => x !== 'en-GB')) {
    const j = JSON.parse(fs.readFileSync(path.join(ROOT, `server/i18n/locales/${l}.json`), 'utf8')).js['figures-sheet'];
    for (const k of ['removeTest', 'removeTestQ', 'removeLesson', 'removeLessonQ', 'removeLessonText', 'moreN', 'regenN', 'editN', 'swapMenu', 'movedTo']) assert.ok(j[k], `${l} ${k}`);
    assert.notEqual(j.removeTest, j.remove, l);
  }
  const src = fs.readFileSync(path.join(ROOT, 'public/js/figures-sheet.js'), 'utf8');
  assert.match(src, /const NOUN = LESSON \? 'Lesson' : TEST \? 'Test' : ''/);
});
