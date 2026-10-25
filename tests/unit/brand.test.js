// The Oomba Academy brand: the name everywhere (never the old one), the logo in the top bar, the icons and manifest, and the
// official account and demo school renamed in place from their Magic Cups names.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
process.env.DEMO_TEACHER_PASSWORD = 'demo-pass-123';
const { createApp } = await import('../../server/app.js');
const auth = await import('../../server/auth.js');
const schools = await import('../../server/services/schools.js');
const games = await import('../../server/services/games.js');
const { q } = await import('../../server/db.js');
const { seedOfficial, seedDemoTeacher } = await import('../../scripts/seed.js');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OLD = /magic.?cups/i;

async function server() {
  const app = createApp();
  const srv = await new Promise(r => { const s = app.listen(0, () => r(s)); });
  const base = `http://127.0.0.1:${srv.address().port}`;
  const get = (p, headers = {}) => fetch(base + p, { headers, redirect: 'manual' });
  const post = (p, body) => fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), redirect: 'manual' });
  return { get, post, close: () => new Promise(r => srv.close(r)) };
}

test('no locale string, translator note or page text names the old brand; the new one stays in Latin letters', () => {
  const dir = path.join(ROOT, 'server/i18n/locales');
  const walk = (o, at, out) => { for (const [k, v] of Object.entries(o)) { if (v && typeof v === 'object') walk(v, `${at}.${k}`, out); else out.push([`${at}.${k}`, String(v)]); } return out; };
  for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.json'))) {
    const strings = walk(JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')), f, []);
    assert.deepEqual(strings.filter(([, v]) => OLD.test(v)).map(([k]) => k), [], `${f} still says Magic Cups`);
    if (f !== 'en-GB.json') assert.ok(strings.some(([, v]) => v.includes('Oomba Academy')), `${f} names Oomba Academy`);
  }
  assert.doesNotMatch(fs.readFileSync(path.join(ROOT, 'server/i18n/notes.json'), 'utf8'), OLD);
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/manifest.webmanifest'), 'utf8'));
  assert.equal(manifest.name, 'Oomba Academy'); assert.equal(manifest.short_name, 'Oomba');
  assert.equal(manifest.background_color, '#F4F1E6');
  // Icons the manifest and layout point at exist at their stated sizes (PNG width/height live at bytes 16-23).
  for (const { src, sizes } of manifest.icons) {
    const png = fs.readFileSync(path.join(ROOT, 'public', src.split('?')[0]));
    assert.equal(`${png.readUInt32BE(16)}x${png.readUInt32BE(20)}`, sizes, src);
  }
  assert.ok(manifest.icons.some(i => i.purpose === 'maskable'));
  const touch = fs.readFileSync(path.join(ROOT, 'public/icons/apple-touch-icon.png'));
  assert.equal(touch.readUInt32BE(16), 180);
  // favicon.ico holds the favicon as 16, 32 and 48px PNGs (header: type 1, count; then one 16-byte entry per size).
  const ico = fs.readFileSync(path.join(ROOT, 'public/favicon.ico'));
  assert.equal(ico.readUInt16LE(2), 1); assert.deepEqual([0, 1, 2].map(i => ico.readUInt8(6 + 16 * i)), [16, 32, 48]);
});

test('pages: the logo link is named Oomba Academy, with the wordmark; icons, font and title use the new brand', async () => {
  const s = await server();
  try {
    const body = await (await s.get('/')).text();
    assert.match(body, /<a class="logo" href="\/" aria-label="Oomba Academy">/);
    assert.match(body, /<svg class="wordmark" viewBox="0 -24 616 184"/);
    assert.match(body, /<span class="logo-sub">Academy<\/span>/);
    assert.match(body, /<svg class="appmark" viewBox="0 0 240 240"/, 'the app-icon mark for narrow screens');
    assert.match(body, /<title>Oomba Academy · /);
    // Icon links carry ?v= so browsers drop the old cached icons when they change.
    assert.match(body, /<link rel="apple-touch-icon" href="\/icons\/apple-touch-icon.png\?v=\w+">/);
    assert.match(body, /<link rel="icon" href="\/favicon.ico\?v=\w+" sizes="32x32">\n<link rel="icon" href="\/icons\/icon.svg\?v=\w+" type="image\/svg\+xml">/, 'the board favicon, not the app icon, for the tab');
    assert.match(body, /<link rel="manifest" href="\/manifest.webmanifest\?v=\w+">/);
    const fav = await s.get('/favicon.ico');
    assert.equal(fav.status, 200); assert.match(fav.headers.get('content-type'), /icon/);
    assert.match(body, /<link rel="preload" href="\/fonts\/bricolage-grotesque-latin-opsz-normal.woff2" as="font"/);
    assert.doesNotMatch(body, OLD); assert.doesNotMatch(body, /🏆<\/span><span class="logo-text"|nunito/i);
    for (const p of ['/safety', '/parents', '/sdk', '/login', '/signup']) assert.doesNotMatch(await (await s.get(p)).text(), OLD, p);
    const de = await (await s.get('/', { Cookie: 'lang=de' })).text();
    assert.match(de, /aria-label="Oomba Academy"/, 'the name is not translated');
  } finally { await s.close(); }
});

test('the official account: renamed in place from MagicCups (games keep their owner), old names redirect and are retired', async () => {
  const legacy = auth.createUser({ username: 'MagicCups', password: 'x'.repeat(24), displayName: 'Magic Cups' });
  const g = games.createGame(legacy.id, { title: 'Owned Launch Game', source: 'seed' });
  const official = seedOfficial();
  assert.equal(official.id, legacy.id);
  assert.equal(auth.getUserByName('OombaAcademy').id, legacy.id);
  assert.equal(auth.getUserByName('MagicCups'), null);
  assert.equal(official.display_name, 'Oomba Academy');
  assert.equal(games.getGame(g.id).owner_id, legacy.id);
  assert.equal(seedOfficial().id, legacy.id, 'safe to re-run');
  const s = await server();
  try {
    for (const old of ['MagicCups', 'magiccups', 'BRBGaming']) {
      const r = await s.get(`/u/${old}`);
      assert.equal(r.status, 301, old); assert.equal(r.headers.get('location'), '/u/OombaAcademy');
    }
    const page = await s.get('/u/OombaAcademy');
    assert.equal(page.status, 200); assert.match(await page.text(), /<h1>Oomba Academy<\/h1>/);
    const r = await s.post('/api/auth/signup', { username: 'MagicCups', password: 'secret123' });
    assert.equal(r.status, 400); assert.equal((await r.json()).field, 'username', 'nobody can take the old official name');
  } finally { await s.close(); }
});

test('a player holding the new name, or an old one, is never taken for the official account', () => {
  const official = auth.getUserByName('OombaAcademy');   // renamed in the test above; owns a launch game
  q.run("UPDATE users SET username='BRBGaming' WHERE id=?", official.id);
  const squatter = auth.createUser({ username: 'oombaacademy', password: 'secret123', displayName: 'Squatter' });
  const player = auth.createUser({ username: 'MagicCup', password: 'secret123', displayName: 'Cup Fan' });
  const r = seedOfficial();
  assert.equal(r.id, official.id, 'the account with the launch games'); assert.equal(r.username, 'OombaAcademy');
  const moved = auth.getUser(squatter.id);
  assert.equal(moved.username, 'OombaAcademy_1', 'the player who took the name first moves aside'); assert.equal(moved.display_name, 'Squatter');
  assert.equal(q.get("SELECT COUNT(*) n FROM audit_log WHERE action='user.rename' AND target=?", squatter.id).n, 1);
  assert.deepEqual([auth.getUser(player.id).username, auth.getUser(player.id).display_name], ['MagicCup', 'Cup Fan'], 'an old name held by a player is not adopted');
  assert.equal(seedOfficial().id, official.id, 'safe to re-run');
});

test('the demo school: found by its address and renamed in place, never a second school; a new database gets the same address', () => {
  const admin = auth.createUser({ username: 'brandadmin', password: 'x'.repeat(24), role: 'admin' });
  const old = schools.createSchool(admin, { name: 'Magic Cups Demo School' }).school;
  assert.equal(old.slug, 'magic-cups-demo-school');
  const first = seedDemoTeacher(admin);
  assert.equal(first.school.id, old.id);
  assert.equal(schools.getSchool(old.id).name, 'Oomba Academy Demo School');
  seedDemoTeacher(admin);
  assert.equal(q.get("SELECT COUNT(*) n FROM schools WHERE name LIKE '%Demo School'").n, 1, 're-running makes no second school');
  // A fresh database: the school is made under the new name, at the kept address.
  q.run('DELETE FROM schools WHERE id=?', old.id);
  const fresh = seedDemoTeacher(admin).school;
  assert.equal(fresh.name, 'Oomba Academy Demo School'); assert.equal(fresh.slug, 'magic-cups-demo-school');
  // An archived demo school is left alone: a new one is made, at another address while the archived one holds it.
  q.run("UPDATE schools SET archived_at=?, name='Magic Cups Demo School' WHERE id=?", Date.now(), fresh.id);
  const next = seedDemoTeacher(admin).school;
  assert.notEqual(next.id, fresh.id); assert.equal(next.archived_at, null);
  assert.equal(next.name, 'Oomba Academy Demo School'); assert.notEqual(next.slug, 'magic-cups-demo-school');
  assert.equal(schools.getSchool(fresh.id).name, 'Magic Cups Demo School', 'the archived school is not renamed');
  assert.equal(seedDemoTeacher(admin).school.id, next.id, 'safe to re-run');
});
