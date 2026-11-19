// The class page's Games tab on a phone (docs/decisions.md "The Games tab on phones: two clear tabs"): a two-part
// switch (Assigned | My library), the Assigned list with due pills, done bars, a ⋯ menu and a Reorder mode with ↑/↓,
// the library list (All my games, collections, New collection, From others), a collection opened in place with an
// Assign toggle per game, and colleagues' collections read-only. Phone vs wider screens is CSS only (below 640px the
// sidebar hides and this shows), so the tests check the markup, the endpoints it posts to, and the stylesheet.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const { q } = await import('../../server/db.js');
const { createUser, startSession } = await import('../../server/auth.js');
const S = await import('../../server/services/schools.js');
const F = await import('../../server/services/game-folders.js');
const games = await import('../../server/services/games.js');
const { createApp } = await import('../../server/app.js');

let server, base;
test.before(async () => { server = createApp().listen(0); server.keepAliveTimeout = 0; await new Promise(r => server.once('listening', r)); base = `http://127.0.0.1:${server.address().port}`; });
test.after(() => server.close());
const cookieFor = id => { let c = ''; startSession({ append: (k, v) => { c = v.split(';')[0]; } }, id); return c; };
const as = who => async (path, { method = 'GET', body } = {}) => {
  const h = { cookie: cookieFor(who.id) }; if (body !== undefined) h['content-type'] = 'application/json';
  const r = await fetch(base + path, { method, headers: h, body: body !== undefined ? JSON.stringify(body) : undefined, redirect: 'manual' });
  const text = await r.text(); let json = null; try { json = JSON.parse(text); } catch { /* html */ }
  return { status: r.status, text, json };
};
/** The phone block alone (it comes before the sidebar's shelf). */
const lib = text => { const m = text.match(/<div class="lib" data-lib="([^"]+)">([\s\S]*?)<div class="shelf shelf-class" data-shelf/); return m ? { view: m[1], html: m[2] } : null; };

const boss = createUser({ username: 'PhoneLibBoss', password: 'secret123', role: 'admin' });
const oak = S.createSchool(boss, { name: 'Oak Phone' }).school;
const head = S.createSchoolAccount(boss, oak.id, { rosterName: 'Head', role: 'admin' }).user;
const ana = S.createSchoolAccount(head, oak.id, { rosterName: 'Ana Teacher', role: 'teacher' }).user;
const ben = S.createSchoolAccount(head, oak.id, { rosterName: 'Ben Patel', role: 'teacher' }).user;
const cls = S.createClass(ana, oak.id, { name: 'Ana 5C' }).class;
const kid = S.createSchoolAccount(ana, oak.id, { rosterName: 'Kid' }).user; S.addToClass(ana, cls.id, kid.id);
function made(owner, { title = 'G', seed = false } = {}) {
  const g = games.createGame(owner.id, { title });
  const v = games.addVersion(g.id, '<title>x</title><p>x</p><script>1</script>', { createdBy: owner.id, safetyStatus: 'pass' });
  q.run("UPDATE games SET status='published', visibility='public', published_version_id=? WHERE id=?", v.id, g.id);
  if (seed) q.run("UPDATE games SET source='seed' WHERE id=?", g.id);
  return games.getGame(g.id);
}
const o1 = made(boss, { title: 'Sum Sprint', seed: true }), o2 = made(boss, { title: 'Map Hop', seed: true }), o3 = made(boss, { title: 'Word Owl', seed: true });
made(ana, { title: 'Ana Maze' });
const fun = F.createFolder(ana, 'Fun Games').folder; F.addGame(ana, fun.id, o1.id); F.addGame(ana, fun.id, o2.id);
F.shareFolder(ana, fun.id, oak.id);
const spare = F.createFolder(ana, 'Spare').folder;
const benF = F.createFolder(ben, 'Spelling warm-ups').folder; F.addGame(ben, benF.id, o3.id); F.addGame(ben, benF.id, o1.id);
F.shareFolder(ben, benF.id, oak.id);
const a1 = F.assignGame(ana, cls.id, o1.id, { dueAt: '2026-11-20' }).classLesson;
const a2 = F.assignGame(ana, cls.id, o3.id).classLesson;

test('the switch: Assigned (n) and My library, Assigned by default, each a plain link', async () => {
  for (const path of [`/class/${cls.id}`, `/class/${cls.id}?view=assigned`]) {
    const p = lib((await as(ana)(path)).text);
    assert.ok(p, 'the phone block is on the Games tab'); assert.equal(p.view, 'assigned');
    const nav = p.html.match(/<nav class="lib-segs"[^>]*>([\s\S]*?)<\/nav>/)[1];
    assert.match(nav, new RegExp(`<a class="lib-seg is-on" href="/class/${cls.id}\\?view=assigned" aria-current="page"><span aria-hidden="true">📌</span> <span class="lib-segl">Assigned</span> <span class="lib-segn">2</span></a>`));
    assert.match(nav, new RegExp(`<a class="lib-seg" href="/class/${cls.id}\\?view=library"><span aria-hidden="true">📁</span> <span class="lib-segl">My library</span></a>`));
  }
  const l = lib((await as(ana)(`/class/${cls.id}?view=library`)).text);
  assert.equal(l.view, 'library'); assert.match(l.html, /class="lib-seg is-on" href="[^"]+\?view=library" aria-current="page"/);
  // The wider screens' shelf is still there, unchanged, and the Students tab has no phone block.
  assert.match((await as(ana)(`/class/${cls.id}?view=assigned`)).text, /<div class="shelf shelf-class" data-shelf id="lessons">/);
  assert.doesNotMatch((await as(ana)(`/class/${cls.id}?tab=students`)).text, /class="lib"/);
  assert.doesNotMatch((await as(ana)('/build')).text, /class="lib"/, 'Build has no phone block');
});

test('Assigned: title, subtitle, Add from library, Reorder, compact rows with due pill, done bar and ⋯; Google Classroom at the foot', async () => {
  const p = lib((await as(ana)(`/class/${cls.id}?view=assigned`)).text).html;
  assert.match(p, /<h2 id="lib-h" dir="auto">Assigned to Ana 5C<\/h2><p>2 games, in the order students see them<\/p>/);
  assert.match(p, new RegExp(`href="/class/${cls.id}\\?view=library">\\+ Add from library</a>`));
  assert.match(p, new RegExp(`href="/class/${cls.id}\\?view=assigned&amp;reorder=1">↕ Reorder</a>`));
  const rows = [...p.matchAll(/<li class="lib-row" data-id="([^"]+)">([\s\S]*?)<\/li>/g)];
  assert.deepEqual(rows.map(r => r[1]), [a1.id, a2.id], 'in the order students see them');
  assert.match(rows[0][2], /class="coverart[^"]*lib-thumb/, 'a thumbnail');
  assert.match(rows[0][2], /<span class="lib-due is-soon">📅 Due \w{3}, Nov 20<\/span>/, 'the due pill');
  assert.match(rows[1][2], /<span class="lib-due is-none">📅 No due date<\/span>/);
  assert.match(rows[0][2], /<progress max="1" value="0" aria-hidden="true"><\/progress><span>0 of 1 done<\/span>/, 'the done bar (one student)');
  // The ⋯ menu holds today's row actions: due date, scores, student view, play, move down, unassign.
  assert.match(rows[0][2], /<summary class="btn btn-ghost shelf-more lib-more" aria-label="More for Sum Sprint"/);
  for (const re of [new RegExp(`data-api="/api/class-lessons/${a1.id}" `), /id="lib-d-[^"]+" name="dueAt" type="date" value="2026-11-20"/, /📊 Scores/, /👀 Student view/, /▶ Play/,
    new RegExp(`data-api="/api/class-lessons/${a1.id}/down"`), new RegExp(`data-api="/api/class-lessons/${a1.id}/delete"`)]) assert.match(rows[0][2], re);
  assert.doesNotMatch(rows[0][2], /\/up"/, 'the first row cannot move up');
  assert.doesNotMatch(p, /Drag to change the order/, 'no prose drag hint on phones');
});

test('Reorder mode: 48px ↑/↓ buttons labelled for screen readers on each row, a Done button, the existing endpoints', async () => {
  const p = lib((await as(ana)(`/class/${cls.id}?view=assigned&reorder=1`)).text).html;
  assert.match(p, new RegExp(`<a class="btn btn-primary lib-tool" href="/class/${cls.id}\\?view=assigned">✓ Done</a>`));
  assert.doesNotMatch(p, /Add from library/);
  assert.match(p, new RegExp(`<form data-api="/api/class-lessons/${a1.id}/down" data-reload><button class="btn lib-mv" type="submit" aria-label="Move Sum Sprint down"`));
  assert.match(p, new RegExp(`<form data-api="/api/class-lessons/${a2.id}/up" data-reload><button class="btn lib-mv" type="submit" aria-label="Move Word Owl up"`));
  assert.doesNotMatch(p, /lib-more/, 'no ⋯ while reordering');
  // The endpoint does what the button says.
  assert.equal((await as(ana)(`/api/class-lessons/${a2.id}/up`, { method: 'POST', body: {} })).status, 200);
  const after = lib((await as(ana)(`/class/${cls.id}?view=assigned`)).text).html;
  assert.deepEqual([...after.matchAll(/<li class="lib-row" data-id="([^"]+)">/g)].map(m => m[1]), [a2.id, a1.id]);
  await as(ana)(`/api/class-lessons/${a2.id}/down`, { method: 'POST', body: {} });
});

test('My library: All my games, own collections (shared marked), New collection, From others with read-only colleagues, students, Oomba games', async () => {
  const p = lib((await as(ana)(`/class/${cls.id}?view=library`)).text).html;
  assert.match(p, /<p>Collections only sort your games\. Assign from inside one\.<\/p>/);
  const items = [...p.matchAll(/<a class="lib-item" href="([^"]+)">[\s\S]*?<span class="lib-name" dir="auto">([^<]*)<\/span>(?:<span class="lib-sub">([^<]*)<\/span>)?/g)].map(m => [m[1].replace(/&amp;/g, '&'), m[2], m[3] || '']);
  assert.deepEqual(items, [
    [`/class/${cls.id}?view=all`, 'All my games', 'Games you built'],
    [`/class/${cls.id}?folder=${fun.id}`, 'Fun Games', '🤝 Shared with your school'],
    [`/class/${cls.id}?folder=${spare.id}`, 'Spare', ''],
    [`/class/${cls.id}?folder=${benF.id}`, 'Spelling warm-ups', 'by Ben Patel · read only'],
    [`/class/${cls.id}?view=students`, 'Games students shared', 'Made by Ana 5C students'],
    [`/class/${cls.id}?view=oomba`, 'Oomba games', 'Browse every Oomba game'],
  ]);
  assert.match(p, /<span class="lib-name">New collection<\/span>/);
  assert.match(p, new RegExp(`<form class="lib-newf-panel" data-api="/api/game-folders" novalidate><input type="hidden" name="classId" value="${cls.id}">`));
  assert.match(p, /<h3 class="lib-group" id="lib-others">From others<\/h3>/);
  assert.match(p, /class="lib-chev"/, 'chevrons');
  // All my games opens in place, with the back link.
  const all = lib((await as(ana)(`/class/${cls.id}?view=all`)).text);
  assert.equal(all.view, 'all'); assert.match(all.html, /class="lib-back" href="[^"]+\?view=library">/); assert.match(all.html, /Ana Maze/);
});

test('inside a collection: back link, name and meta, ⋯ folder menu, Assign all, Reorder, and a toggle that reflects the assigned state', async () => {
  const p = lib((await as(ana)(`/class/${cls.id}?folder=${fun.id}`)).text);
  assert.equal(p.view, 'folder');
  const h = p.html;
  assert.match(h, new RegExp(`<a class="lib-back" href="/class/${cls.id}\\?view=library">[\\s\\S]*?My library</a>`));
  assert.match(h, /<h2 id="lib-h" dir="auto"><span aria-hidden="true">📁<\/span> Fun Games<\/h2><p dir="auto">2 games · 🤝 Shared with Oak Phone<\/p>/);
  assert.match(h, /id="lib-rn"/, 'the rename field of today\'s folder menu, with its own id');
  assert.match(h, new RegExp(`data-api="/api/game-folders/${fun.id}/delete"`));
  assert.match(h, /<summary class="btn">📌 Assign all 2<\/summary>/, 'Assign all');
  assert.match(h, new RegExp(`href="/class/${cls.id}\\?folder=${fun.id}&amp;reorder=1">↕ Reorder</a>`));
  // Sum Sprint is assigned: ✓ Assigned unassigns it; Map Hop is not: + Assign assigns it.
  const row = id => h.match(new RegExp(`<li class="lib-row" data-id="${id}">([\\s\\S]*?)</li>`))[1];
  assert.match(row(o1.id), new RegExp(`<form class="lib-tform" data-api="/api/class-lessons/${a1.id}/delete" data-reload data-confirm="[^"]+">\\s*<button class="btn lib-toggle is-on" type="submit"`));
  assert.match(row(o1.id), /✓<\/span> Assigned/);
  assert.match(row(o1.id), /data-confirm="Remove Sum Sprint from this class\?/, 'the confirm names the game');
  assert.match(row(o2.id), /<form class="lib-tform" data-api="\/api\/teach\/assign-game" novalidate><input type="hidden" name="gameId" value="[^"]+"><input type="hidden" name="classId" value="[^"]+"><input type="hidden" name="folder" value="[^"]+">\s*<button class="btn lib-toggle" type="submit"><span aria-hidden="true">\+<\/span> Assign<span class="sr-only">: Map Hop<\/span><\/button><\/form>/);
  assert.doesNotMatch(h, /Assign to Ana 5C/, 'no big per-row Assign button');
  // Pressing + Assign assigns it (and comes back to the collection); the toggle then shows ✓ Assigned.
  const r = await as(ana)('/api/teach/assign-game', { method: 'POST', body: { gameId: o2.id, classId: cls.id, folder: fun.id } });
  assert.equal(r.status, 200); assert.equal(r.json.redirect, `/class/${cls.id}?folder=${fun.id}`);
  const now = lib((await as(ana)(`/class/${cls.id}?folder=${fun.id}`)).text).html;
  assert.match(now.match(new RegExp(`<li class="lib-row" data-id="${o2.id}">([\\s\\S]*?)</li>`))[1], /lib-toggle is-on/);
  const cl = F.assignmentOf(cls.id, o2.id); await as(ana)(`/api/class-lessons/${cl.id}/delete`, { method: 'POST', body: {} });
  // Reorder mode: ↑/↓ post the whole new order to the existing order endpoint.
  const ro = lib((await as(ana)(`/class/${cls.id}?folder=${fun.id}&reorder=1`)).text).html;
  assert.match(ro, new RegExp(`<form data-api="/api/game-folders/${fun.id}/order" data-reload><input type="hidden" name="ids" value="${o2.id}"><input type="hidden" name="ids" value="${o1.id}"><button class="btn lib-mv" type="submit" aria-label="Move Sum Sprint down"`));
  assert.doesNotMatch(ro, /lib-toggle/);
});

test('a colleague\'s shared collection is read-only: no rename, delete, remove or reorder; copy and assign stay', async () => {
  const h = lib((await as(ana)(`/class/${cls.id}?folder=${benF.id}`)).text).html;
  assert.match(h, /<span aria-hidden="true">🤝<\/span> Spelling warm-ups<\/h2><p dir="auto">2 games · by Ben Patel · read only<\/p>/);
  assert.doesNotMatch(h, /lib-rn|game-folders\/[^"]+\/delete"|\/share"|reorder=1|\/order"|Remove from folder/);
  assert.match(h, new RegExp(`data-api="/api/game-folders/${benF.id}/copy"`));
  assert.match(h, /lib-toggle/, 'school staff can still assign from it');
  // reorder=1 in the address changes nothing for someone else's collection.
  assert.doesNotMatch(lib((await as(ana)(`/class/${cls.id}?folder=${benF.id}&reorder=1`)).text).html, /lib-mv/);
  // and the server still refuses to change it
  assert.notEqual((await as(ana)(`/api/game-folders/${benF.id}/order`, { method: 'POST', body: { ids: [o1.id, o3.id] } })).status, 200);
});

test('students never get the phone library or Assign', async () => {
  const r = await as(kid)(`/class/${cls.id}`);
  assert.doesNotMatch(r.text, /class="lib"|lib-toggle|lib-segs/);
});

test('CSS: the phone block only below 640px, where the sidebar hides; RTL flips chevrons; long names ellipsis', () => {
  const app = fs.readFileSync(new URL('../../public/css/app.css', import.meta.url), 'utf8');
  assert.match(app, /\n\.lib\{display:none\}\n@media \(max-width:639px\)\{/);
  const phone = [...app.matchAll(/@media \(max-width:639px\)\{([\s\S]*?)\n\}/g)].map(m => m[1]).join('\n');
  assert.match(phone, /\.shelf-class\{display:none\}/); assert.match(phone, /\.lib\{display:block\}/);
  assert.match(phone, /\[dir="rtl"\] \.lib-chev,\[dir="rtl"\] \.lib-backarrow\{transform:scaleX\(-1\)\}/);
  assert.match(phone, /\.lib-name\{[^}]*text-overflow:ellipsis/);
  assert.match(phone, /\.lib-mv,\.lib-mv-gap\{width:48px;min-width:48px;height:48px/);
  // Nothing of it outside the phone query except the hiding rule.
  const outside = app.replace(/@media \(max-width:639px\)\{[\s\S]*?\n\}/g, '');
  assert.deepEqual(outside.match(/^\.lib[\w-]*\{.*$/gm), ['.lib{display:none}']);
});
