// The admin game tool (server/routes/admin-tool.js): off without ADMIN_API_TOKEN, a wrong token is refused, and with
// the right one an admin can find a game, read its live code and put a fixed version live (scanned and audited).
process.env.BRB_DB = ':memory:'; process.env.BRB_SILENT = '1'; process.env.LOG_REQUESTS = '0';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
const { q } = await import('../../server/db.js');
const auth = await import('../../server/auth.js');
const games = await import('../../server/services/games.js');
const { config } = await import('../../server/config.js');
const { createApp } = await import('../../server/app.js');

let server, base, g;
const TOKEN = 'x'.repeat(40);
before(async () => {
  if (!auth.getUserByName(config.adminUsername)) q.run("UPDATE users SET role='admin' WHERE id=?", auth.createUser({ username: config.adminUsername, password: 'a-long-password-1' }).id);
  const kid = auth.createUser({ username: 'Dinosaur', password: 'secret123' });
  g = games.createGame(kid.id, { title: 'Would You Rather' });
  const v = games.addVersion(g.id, '<!doctype html><html><head><title>WYR</title></head><body><h1>Would you rather</h1><p>Old version of the game.</p></body></html>');
  q.run("UPDATE games SET status='published', visibility='private', published_version_id=? WHERE id=?", v.id, g.id);
  server = createApp().listen(0); await new Promise(r => server.once('listening', r)); base = `http://127.0.0.1:${server.address().port}`;
});
after(() => { delete process.env.ADMIN_API_TOKEN; server.close(); });
const call = (path, { token, body } = {}) => fetch(base + path, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });

test('off without a token; a wrong token is refused', async () => {
  delete process.env.ADMIN_API_TOKEN;
  assert.equal((await call('/api/admin-tool/games?q=Dino', { token: TOKEN })).status, 404);
  process.env.ADMIN_API_TOKEN = TOKEN;
  assert.equal((await call('/api/admin-tool/games?q=Dino')).status, 401);
  assert.equal((await call('/api/admin-tool/games?q=Dino', { token: 'y'.repeat(40) })).status, 401);
});

test('find, read and replace a live game', async () => {
  process.env.ADMIN_API_TOKEN = TOKEN;
  const found = await (await call('/api/admin-tool/games?q=Dinosaur', { token: TOKEN })).json();
  assert.equal(found.games[0].id, g.id); assert.equal(found.games[0].owner, 'Dinosaur');
  const src = await (await call(`/api/admin-tool/games/${g.id}/source`, { token: TOKEN })).json();
  assert.match(src.html, /Old version/);
  const fixed = src.html.replace('Old version', 'Fixed version');
  const r = await call(`/api/admin-tool/games/${g.id}/source`, { token: TOKEN, body: { html: fixed, notes: 'tablet fix' } });
  const j = await r.json();
  assert.equal(r.status, 200, JSON.stringify(j)); assert.equal(j.state, 'live');
  const live = games.getVersion(games.getGame(g.id).published_version_id);
  assert.match(live.html, /Fixed version/); assert.equal(live.number, 2);
  assert.ok(q.get("SELECT 1 FROM audit_log WHERE target=? AND action LIKE 'game.%'", g.id) || q.get("SELECT 1 FROM audit WHERE target=?", g.id), 'audited');
});
