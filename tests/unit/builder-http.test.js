// Studio over HTTP: access rules, the SSE chat, uploads, publishing and updating a live game.
process.env.BRB_DB = ':memory:';
process.env.BRB_SILENT = '1';
process.env.LOG_REQUESTS = '0';
process.env.BRB_MOCK_DELAY_MS = '0';
process.env.BRB_DATA_DIR = (await import('node:os')).tmpdir() + '/brb-http-test-' + process.pid;
import test from 'node:test';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';

const { config } = await import('../../server/config.js');
config.anthropicKey = '';
const { createApp } = await import('../../server/app.js');
const games = await import('../../server/services/games.js');
const { loadChat } = await import('../../server/builder/chat.js');
const { q } = await import('../../server/db.js');

const server = createApp().listen(0);
await new Promise(r => server.once('listening', r));
const BASE = `http://127.0.0.1:${server.address().port}`;
test.after(() => server.close());

function client() {
  let cookie = '';
  return async (path, { method = 'GET', body, headers = {}, raw = false } = {}) => {
    const h = { ...headers }; if (cookie) h.cookie = cookie;
    let payload = body;
    if (body !== undefined && !Buffer.isBuffer(body) && typeof body !== 'string') { h['content-type'] = 'application/json'; payload = JSON.stringify(body); }
    const res = await fetch(BASE + path, { method, headers: h, body: payload, redirect: 'manual' });
    const sc = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
    for (const c of sc) { const kv = c.split(';')[0]; if (kv.startsWith('brb_session=')) cookie = kv; }
    if (raw) return res;
    const text = await res.text(); let json = null; try { json = JSON.parse(text); } catch { /* html */ }
    return { status: res.status, headers: res.headers, text, json };
  };
}
async function signup(name) { const c = client(); const r = await c('/api/auth/signup', { method: 'POST', body: { username: name, password: 'secret12' } }); assert.equal(r.status, 200, r.text); return c; }
function sse(text) { return text.split('\n\n').filter(Boolean).map(b => { const ev = (b.match(/^event: (.*)$/m) || [])[1]; const d = (b.match(/^data: (.*)$/m) || [])[1]; return ev && d ? [ev, JSON.parse(d)] : null; }).filter(Boolean); }
function png() {
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32(td) >>> 0); return Buffer.concat([len, td, crc]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(2, 0); ihdr.writeUInt32BE(2, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('tEXt', Buffer.from('GPS\0lat=48.85837')), chunk('IDAT', zlib.deflateSync(Buffer.alloc(14, 90))), chunk('IEND', Buffer.alloc(0))]);
}

const owner = await signup('HttpOwner');
const stranger = await signup('HttpStranger');

test('/build needs a real account; guests and visitors go to sign up', async () => {
  const anon = client();
  let r = await anon('/build'); assert.equal(r.status, 302); assert.equal(r.headers.get('location'), '/signup?next=%2Fbuild');
  await anon('/api/auth/guest', { method: 'POST', body: {} });
  r = await anon('/build'); assert.equal(r.status, 302, 'guest redirected too');
  r = await anon('/api/studio/new', { method: 'POST', body: {} }); assert.equal(r.status, 403);
  r = await owner('/build'); assert.equal(r.status, 200); assert.match(r.text, /Start from/); assert.match(r.text, /data-template="quiz"/);
  assert.match(r.text, /aria-current="page"[^>]*>|navlink" href="\/build" aria-current/);
});

let gameId;
test('Start from a template: version 1 is the template; the Studio uses the player sandbox', async () => {
  const r = await owner('/api/studio/new', { method: 'POST', body: { template: 'catch' } });
  assert.equal(r.status, 200); gameId = r.json.id;
  const vs = games.listVersions(gameId); assert.equal(vs.length, 1); assert.equal(vs[0].safety_status, 'pass');
  const page = await owner(`/studio/${gameId}`);
  assert.equal(page.status, 200);
  assert.match(page.text, /sandbox="allow-scripts allow-pointer-lock allow-orientation-lock"/);
  assert.doesNotMatch(page.text, /allow-same-origin/);
  const src = page.text.match(/src="(\/frame\/[^"]+)"/)[1];
  const frame = await owner(src);
  assert.equal(frame.status, 200); assert.match(frame.headers.get('content-security-policy'), /connect-src 'none'/);
  assert.match(frame.text, /"preview":true/); assert.match(frame.text, /"canSave":false/);
  const list = await owner('/build'); assert.match(list.text, /📝 Draft/);
});

test('strangers get 404 for every Studio page and API', async () => {
  for (const [m, p] of [['GET', `/studio/${gameId}`], ['GET', `/api/studio/${gameId}`], ['POST', `/api/studio/${gameId}/chat`], ['POST', `/api/studio/${gameId}/meta`], ['POST', `/api/studio/${gameId}/publish`], ['POST', `/api/studio/${gameId}/restore`]]) {
    const r = await stranger(p, { method: m, body: m === 'POST' ? { text: 'hi', visibility: 'public' } : undefined });
    assert.equal(r.status, 404, `${m} ${p}`);
  }
});

test('the Builder chat streams Server-Sent Events and makes a new version', async () => {
  const res = await owner(`/api/studio/${gameId}/chat`, { method: 'POST', body: { text: 'Make it harder' }, raw: true });
  assert.match(res.headers.get('content-type'), /text\/event-stream/);
  const events = sse(await res.text());
  const names = events.map(e => e[0]);
  assert.ok(names.includes('text') && names.includes('version') && names.includes('notes') && names.includes('ask'));
  assert.equal(names[names.length - 1], 'done');
  const v = events.find(e => e[0] === 'version')[1]; assert.equal(v.number, 2); assert.match(v.preview, /^\/frame\//);
  const refused = sse(await (await owner(`/api/studio/${gameId}/chat`, { method: 'POST', body: { text: 'add a slot machine and loot boxes' }, raw: true })).text());
  assert.equal(refused[0][0], 'refused'); assert.match(refused[0][1].message, /loot boxes/);
});

test('meta: text is cleaned; icon must come from the picker', async () => {
  let r = await owner(`/api/studio/${gameId}/meta`, { method: 'POST', body: { title: 'fuck this' } }); assert.equal(r.status, 400); assert.equal(r.json.field, 'title');
  r = await owner(`/api/studio/${gameId}/meta`, { method: 'POST', body: { description: 'email me at kid@example.com' } }); assert.equal(r.status, 400);
  r = await owner(`/api/studio/${gameId}/meta`, { method: 'POST', body: { icon: '<b>' } }); assert.equal(r.status, 400);
  r = await owner(`/api/studio/${gameId}/meta`, { method: 'POST', body: { title: 'Fruit Frenzy', icon: '🍕', category: 'silly', tags: '#fruit, Fast', orientation: 'portrait', players_max: 2, cover: 'mint' } });
  assert.equal(r.status, 200); const g = games.getGame(gameId);
  assert.deepEqual([g.title, g.icon, g.category, g.tags, g.orientation, g.players_max, g.cover], ['Fruit Frenzy', '🍕', 'silly', 'fruit,fast', 'portrait', 2, 'mint']);
});

test('uploads: owner-only, signature-checked, metadata stripped, never in versions or the transcript', async () => {
  const bytes = png();
  let r = await owner(`/api/studio/${gameId}/uploads?name=dragon.png`, { method: 'POST', body: bytes, headers: { 'content-type': 'application/octet-stream' } });
  assert.equal(r.status, 200, r.text); const up = r.json.upload; assert.equal(up.kind, 'image');
  r = await owner(`/api/studio/${gameId}/uploads?name=fake.png`, { method: 'POST', body: Buffer.from('<svg onload=alert(1)>'), headers: { 'content-type': 'application/octet-stream' } });
  assert.equal(r.status, 415);
  r = await stranger(`/api/studio/${gameId}/uploads?name=x.png`, { method: 'POST', body: bytes, headers: { 'content-type': 'application/octet-stream' } });
  assert.equal(r.status, 404);
  const got = await owner(up.url, { raw: true }); assert.equal(got.status, 200);
  assert.equal(got.headers.get('x-content-type-options'), 'nosniff'); assert.match(got.headers.get('content-disposition'), /^inline/);
  assert.equal(got.headers.get('content-security-policy'), "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'");
  assert.equal(got.headers.get('content-type'), 'image/png');
  const served = Buffer.from(await got.arrayBuffer()); assert.ok(!served.toString('latin1').includes('48.85837'), 'GPS text removed');
  assert.equal((await stranger(up.url)).status, 404, 'stranger cannot see it');
  assert.equal((await client()(up.url)).status, 401);

  const res = await owner(`/api/studio/${gameId}/chat`, { method: 'POST', body: { text: 'here is my idea', uploads: [up.id] }, raw: true });
  const events = sse(await res.text());
  assert.match(events.filter(e => e[0] === 'text').map(e => e[1].text).join(''), /I love your picture "dragon.png"/);
  const chat = loadChat(gameId); const json = JSON.stringify(chat.messages);
  assert.match(json, /"name":"dragon.png"/);
  const b64 = served.toString('base64');
  assert.ok(!json.includes(b64) && !json.includes(b64.slice(0, 40)), 'no bytes in the transcript');
  for (const v of games.listVersions(gameId)) assert.ok(!games.getVersion(v.id).html.includes(b64.slice(0, 40)), 'never copied into a game');
  r = await owner(`/api/studio/${gameId}/uploads/${up.id}`, { method: 'DELETE' }); assert.equal(r.status, 400, 'already sent');
  const r2 = await owner(`/api/studio/${gameId}/uploads?name=tmp.png`, { method: 'POST', body: bytes, headers: { 'content-type': 'application/octet-stream' } });
  r = await owner(`/api/studio/${gameId}/uploads/${r2.json.upload.id}`, { method: 'DELETE' }); assert.equal(r.status, 200);
  assert.equal((await owner(r2.json.upload.url)).status, 404);
});

test('publish, share and update a live game; public updates wait for review while the old version stays live', async () => {
  const st = (await owner(`/api/studio/${gameId}`)).json;
  const v2 = st.versions.find(v => v.number === 2);
  let r = await owner(`/api/studio/${gameId}/restore`, { method: 'POST', body: { versionId: st.versions.find(v => v.number === 1).id } });
  assert.equal(r.status, 200); assert.match(r.json.message, /Brought back as version 3/); assert.equal(r.json.state.current.number, 3);
  r = await owner(`/api/studio/${gameId}/publish`, { method: 'POST', body: { visibility: 'friends' } });
  assert.equal(r.status, 200); assert.equal(r.json.state.live.number, 3);
  let g = games.getGame(gameId); assert.equal(g.visibility, 'friends'); const liveV = g.published_version_id;
  r = await owner(`/api/studio/${gameId}/update`, { method: 'POST', body: {} }); assert.equal(r.status, 200, 'update with nothing new is harmless');
  r = await owner(`/api/studio/${gameId}/restore`, { method: 'POST', body: { versionId: v2.id } });
  assert.notEqual(r.json.state.current.id, r.json.state.live.id, 'editing a newer version than the live one');
  r = await owner(`/api/studio/${gameId}/update`, { method: 'POST', body: {} });
  g = games.getGame(gameId); assert.equal(r.json.state.live.number, r.json.state.current.number, 'friends update goes live at once'); assert.notEqual(g.published_version_id, liveV);
  // go public: waits for review (no API key) while friends keep playing
  r = await owner(`/api/studio/${gameId}/visibility`, { method: 'POST', body: { visibility: 'public' } });
  assert.equal(r.json.state.pending.number, r.json.state.live.number); assert.equal(games.getGame(gameId).visibility, 'friends');
  // edit again, then Update live game: friends get it now AND the public request moves to the new version
  await (await owner(`/api/studio/${gameId}/chat`, { method: 'POST', body: { text: 'make it easier' }, raw: true })).text();
  const before = games.getGame(gameId);
  r = await owner(`/api/studio/${gameId}/update`, { method: 'POST', body: {} });
  assert.equal(r.status, 200); const after = games.getGame(gameId);
  assert.equal(after.published_version_id, before.current_version_id); assert.equal(after.pending_version_id, before.current_version_id);
  assert.match(r.json.message, /waiting for its check/);
  const list = await owner('/build'); assert.match(list.text, /Update waiting for review/); assert.match(list.text, /Live: 👫 Friends/);
  // admin approves -> public; then another update goes to review while the old version stays live
  const { approve } = await import('../../server/services/publish.js');
  approve({ id: 'admin' }, gameId, 'Nice!');
  assert.equal(games.getGame(gameId).visibility, 'public');
  await (await owner(`/api/studio/${gameId}/chat`, { method: 'POST', body: { text: 'make it harder' }, raw: true })).text();
  const live = games.getGame(gameId).published_version_id;
  r = await owner(`/api/studio/${gameId}/update`, { method: 'POST', body: {} });
  assert.equal(r.json.state.live.id, live, 'players keep the old version'); assert.ok(r.json.state.pending, 'update waits for review');
  assert.ok(q.get("SELECT 1 FROM audit_log WHERE action='game.submit_review' AND target=?", gameId));
});

test('My games: rename and delete from /build; a deleted live game is gone for everyone', async () => {
  // a draft
  let r = await owner('/api/studio/new', { method: 'POST', body: {} }); const draft = r.json.id;
  r = await owner('/build'); assert.match(r.text, new RegExp(`data-id="${draft}"`)); assert.match(r.text, /data-delete/); assert.match(r.text, /data-rename/);
  r = await owner(`/api/studio/${draft}/meta`, { method: 'POST', body: { title: 'Space Cats' } }); assert.equal(r.json.state.game.title, 'Space Cats');
  r = await stranger(`/api/studio/${draft}/delete`, { method: 'POST', body: {} }); assert.equal(r.status, 404, 'not yours');
  r = await owner(`/api/studio/${draft}/delete`, { method: 'POST', body: {} }); assert.equal(r.status, 200, r.text);
  r = await owner('/build'); assert.doesNotMatch(r.text, new RegExp(`data-id="${draft}"`));
  assert.equal((await owner(`/studio/${draft}`)).status, 404); assert.equal((await owner(`/api/studio/${draft}`)).status, 404);
  assert.equal((await owner(`/api/studio/${draft}/delete`, { method: 'POST', body: {} })).status, 404, 'only once');
  assert.ok(q.get("SELECT 1 FROM audit_log WHERE action='game.delete' AND target=?", draft));

  // the public game from the test above, with an update waiting for review
  const g = games.getGame(gameId); assert.equal(g.visibility, 'public'); assert.ok(g.pending_version_id);
  assert.equal((await stranger(`/g/${g.slug}`)).status, 200);
  r = await owner(`/api/studio/${gameId}/delete`, { method: 'POST', body: {} }); assert.equal(r.status, 200);
  const d = games.getGame(gameId); assert.equal(d.status, 'deleted'); assert.equal(d.pending_version_id, null, 'out of the review queue');
  assert.equal((await stranger(`/g/${g.slug}`)).status, 404); assert.equal((await owner(`/g/${g.slug}`)).status, 404);
  assert.ok(!games.listVisible(null, { limit: 500 }).some(x => x.id === gameId), 'off every list');
});

test('starter (seed) games cannot be deleted, even by an admin', async () => {
  const seed = games.createGame('admin', { title: 'Seedy', source: 'seed' });
  q.run("UPDATE users SET role='admin' WHERE username=?", 'HttpStranger');
  try {
    const r = await stranger(`/api/studio/${seed.id}/delete`, { method: 'POST', body: {} });
    assert.equal(r.status, 400); assert.match(r.json.error, /Starter games/);
    assert.notEqual(games.getGame(seed.id).status, 'deleted');
  } finally { q.run("UPDATE users SET role='player' WHERE username=?", 'HttpStranger'); }
});
