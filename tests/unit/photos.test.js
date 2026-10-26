// Profile photos: only small JPEGs, metadata removed, safety-checked, and only the player, their friends and admins
// ever get the photo; everyone else gets the emoji.
import fs from 'node:fs';
import os from 'node:os';
process.env.BRB_DB = ':memory:'; process.env.BRB_SILENT = '1'; process.env.LOG_REQUESTS = '0';
process.env.BRB_DATA_DIR = fs.mkdtempSync(os.tmpdir() + '/brb-photos-');
import test from 'node:test';
import assert from 'node:assert/strict';
const { config } = await import('../../server/config.js');
config.anthropicKey = '';
const { q } = await import('../../server/db.js');
const { createUser, createGuest, startSession } = await import('../../server/auth.js');
const friends = await import('../../server/services/friends.js');
const photos = await import('../../server/services/photos.js');
const { avatar } = await import('../../server/views/components.js');
const { createApp } = await import('../../server/app.js');

const seg = (m, d) => { const b = Buffer.from(d); const h = Buffer.from([0xff, m, 0, 0]); h.writeUInt16BE(b.length + 2, 2); return Buffer.concat([h, b]); };
const jpeg = (w = 64, h = 64, pad = 0) => Buffer.concat([Buffer.from([0xff, 0xd8]), seg(0xe0, 'JFIF\0\x01\x01\0\0\x01\0\x01\0\0'), seg(0xe1, 'Exif\0\0GPSLatitude=51.5'), seg(0xfe, 'Oak Primary'),
  seg(0xdb, Buffer.alloc(65, 1)), seg(0xc0, Buffer.from([8, h >> 8, h & 255, w >> 8, w & 255, 1, 1, 0x11, 0])), seg(0xda, Buffer.from([1, 1, 0, 0, 0x3f, 0])), Buffer.alloc(pad, 7), Buffer.from([0x12, 0x34, 0xff, 0xd9])]);
const ok = async () => null;

let server, base;
test.before(async () => { server = createApp().listen(0); await new Promise(r => server.once('listening', r)); base = `http://127.0.0.1:${server.address().port}`; });
test.after(() => server.close());
const cookieFor = id => { let c = ''; startSession({ append: (k, v) => { c = v.split(';')[0]; } }, id); return c; };
const kid = createUser({ username: 'PhotoKid', password: 'secret123', avatar: '🦊' });
const pal = createUser({ username: 'PhotoPal', password: 'secret123' });
const stranger = createUser({ username: 'PhotoStranger', password: 'secret123' });
const admin = createUser({ username: 'PhotoAdmin', password: 'secret123', role: 'admin' });
friends.addByCode(kid, pal.friend_code); friends.accept(pal, kid.id);

test('only a small JPEG is accepted; metadata is removed; guests cannot; the safety check can refuse', async () => {
  const err = async (p, code) => { await assert.rejects(p, e => e instanceof photos.PhotoError && e.code === code); };
  await err(photos.savePhoto(createGuest(), jpeg(), { screen: ok }), 'guest');
  await err(photos.savePhoto(kid, Buffer.from('<svg onload=alert(1)>'), { screen: ok }), 'badType');
  await err(photos.savePhoto(kid, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]), { screen: ok }), 'badType');
  await err(photos.savePhoto(kid, jpeg(4000, 3000), { screen: ok }), 'badType');
  await err(photos.savePhoto(kid, jpeg(64, 64, photos.MAX_BYTES), { screen: ok }), 'tooBig');
  await err(photos.savePhoto(kid, jpeg(), { screen: async () => 'unsafe' }), 'unsafe');
  await err(photos.savePhoto(kid, jpeg(), { screen: async () => 'personal_info' }), 'personal_info');
  assert.ok(q.get("SELECT 1 FROM audit_log WHERE action='user.photo_refused' AND target=?", kid.id));
  await err(photos.savePhoto(kid, jpeg()), 'resting'); // no API key: no check, no photo
  assert.equal(q.get('SELECT photo_at FROM users WHERE id=?', kid.id).photo_at, 0);
  const at = await photos.savePhoto(kid, jpeg(), { screen: ok });
  assert.ok(at > 0);
  const saved = fs.readFileSync(photos.fileFor(kid.id));
  assert.equal(saved.includes(Buffer.from('GPSLatitude')), false); assert.equal(saved.includes(Buffer.from('Oak Primary')), false);
  assert.deepEqual(photos.jpegSize(saved), { width: 64, height: 64 });
});

test('the photo goes to the player, friends and admins; strangers and visitors get the emoji', async () => {
  const get = who => fetch(base + `/avatars/${kid.id}`, { headers: who ? { cookie: cookieFor(who.id) } : {} });
  for (const who of [kid, pal, admin]) { const r = await get(who); assert.equal(r.headers.get('content-type'), 'image/jpeg', who.username); assert.match(r.headers.get('cache-control'), /private/); }
  for (const who of [stranger, null]) { const r = await get(who); assert.match(r.headers.get('content-type'), /svg/); assert.match(await r.text(), /🦊/); }
  assert.equal((await fetch(base + '/avatars/nobody')).status, 404);
  // banned players never show a photo
  q.run('UPDATE users SET banned=1 WHERE id=?', kid.id);
  assert.match((await get(pal)).headers.get('content-type'), /svg/);
  q.run('UPDATE users SET banned=0 WHERE id=?', kid.id);
});

test('avatars render the photo URL wherever a row carries it; the Me page offers upload and remove', async () => {
  const row = q.get('SELECT id, avatar, color, photo_at FROM users WHERE id=?', kid.id);
  assert.match(String(avatar(row, 40)), new RegExp(`<img src="/avatars/${kid.id}\\?v=`));
  assert.doesNotMatch(String(avatar(q.get('SELECT id, avatar, color, photo_at FROM users WHERE id=?', pal.id), 40)), /<img/);
  assert.match(String(avatar({ owner_id: kid.id, owner_avatar: '🦊', owner_photo_at: row.photo_at }, 32)), /\/avatars\//);
  const me = await (await fetch(base + '/me', { headers: { cookie: cookieFor(kid.id) } })).text();
  assert.match(me, /data-photo-pick/); assert.match(me, /data-photo-remove/); assert.match(me, /id="look-edit"/); assert.match(me, /Only you, your friends/);
  const guestCookie = cookieFor(createGuest().id);
  const gm = await (await fetch(base + '/me', { headers: { cookie: guestCookie } })).text();
  assert.doesNotMatch(gm, /data-photo-pick/); assert.match(gm, /Make a free account to add a profile photo/);
});

test('upload API: no safety check means no photo; guests refused; remove works; admins can remove a photo', async () => {
  let r = await fetch(base + '/api/me/photo', { method: 'POST', headers: { cookie: cookieFor(pal.id), 'content-type': 'image/jpeg' }, body: jpeg() });
  assert.equal(r.status, 503); assert.match((await r.json()).error, /safety check/);
  r = await fetch(base + '/api/me/photo', { method: 'POST', headers: { cookie: cookieFor(createGuest().id), 'content-type': 'image/jpeg' }, body: jpeg() });
  assert.equal(r.status, 403);
  r = await fetch(base + `/api/admin/users/${kid.id}/photo/remove`, { method: 'POST', headers: { cookie: cookieFor(stranger.id) } });
  assert.equal(r.status, 404, 'not for non-admins');
  r = await fetch(base + `/api/admin/users/${kid.id}/photo/remove`, { method: 'POST', headers: { cookie: cookieFor(admin.id) } });
  assert.equal(r.status, 200);
  assert.equal(q.get('SELECT photo_at FROM users WHERE id=?', kid.id).photo_at, 0); assert.equal(fs.existsSync(photos.fileFor(kid.id)), false);
  assert.ok(q.get("SELECT 1 FROM audit_log WHERE action='admin.photo_removed' AND target=?", kid.id));
  await photos.savePhoto(pal, jpeg(), { screen: ok });
  r = await fetch(base + '/api/me/photo', { method: 'DELETE', headers: { cookie: cookieFor(pal.id) } });
  assert.equal(r.status, 200); assert.equal(q.get('SELECT photo_at FROM users WHERE id=?', pal.id).photo_at, 0);
});
