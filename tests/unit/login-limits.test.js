// Sign-in and sign-up limits behave for a real school (one shared address) without handing out free guesses.
process.env.BRB_DB = ':memory:'; process.env.BRB_SILENT = '1'; process.env.LOG_REQUESTS = '0';
import test from 'node:test';
import assert from 'node:assert/strict';
const { createUser } = await import('../../server/auth.js');
const S = await import('../../server/services/schools.js');
const RL = await import('../../server/services/ratelimit.js');
const { LOGIN, SIGNUP } = await import('../../server/routes/auth.js');
const { createApp } = await import('../../server/app.js');

let server, base;
test.before(async () => { server = createApp().listen(0, '127.0.0.1'); await new Promise(r => server.once('listening', r)); base = `http://127.0.0.1:${server.address().port}`; });
test.after(() => server.close());
test.beforeEach(() => RL._reset());
const post = (path, body, cookie) => fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body) });
const cookieOf = r => (r.headers.getSetCookie().find(c => c.startsWith('brb_session=') && !c.startsWith('brb_session=;')) || '').split(';')[0];
const login = (username, password, cookie) => post('/api/auth/login', { username, password }, cookie);

const boss = createUser({ username: 'LimitsBoss', password: 'secret123', role: 'admin' });
const school = S.createSchool(boss, { name: 'Limits Primary' }).school;
const teacher = S.createSchoolAccount(boss, school.id, { rosterName: 'Tess Teach', role: 'teacher' }).user;
const kids = Array.from({ length: 30 }, (_, i) => S.createSchoolAccount(teacher, school.id, { rosterName: `Kid ${i}` }));

test('a whole class signs in from one address, typos and all', async () => {
  for (const [i, k] of kids.entries()) {
    if (i % 2) assert.equal((await login(k.username, 'wrong-word-words-11')).status, 400); // every other child mistypes once
    assert.equal((await login(k.username, k.password)).status, 200, `child ${i}`);
  }
});

test('the address cap counts failures only, and a fresh guest cookie gets no new allowance', async () => {
  const keep = LOGIN.ipFails; LOGIN.ipFails = 5;
  try {
    for (let i = 0; i < 5; i++) assert.equal((await login(`nobody${i}`, 'nope')).status, 400);
    assert.equal((await login('nobody9', 'nope')).status, 429);
    const g = await post('/api/auth/guest', {}); assert.equal(g.status, 200);
    assert.equal((await login('nobody9', 'nope', cookieOf(g))).status, 429);
  } finally { LOGIN.ipFails = keep; }
  // successes never count: far more good sign-ins than the cap all work
  RL._reset(); LOGIN.ipFails = 3;
  try { for (let i = 0; i < 6; i++) assert.equal((await login(kids[0].username, kids[0].password)).status, 200); }
  finally { LOGIN.ipFails = keep; }
});

test('spaces around the name are ignored, share one lock, and a teacher reset lifts it', async () => {
  const k = kids[1];
  assert.equal((await login(` ${k.username} `, k.password)).status, 200);
  for (let i = 0; i < LOGIN.userFails; i++) assert.equal((await login(i % 2 ? `${k.username} ` : k.username.toLowerCase(), 'wrong')).status, 400);
  assert.equal((await login(k.username, k.password)).status, 429, 'locked, whatever the spacing or case');
  const r = S.resetSchoolPassword(teacher, school.id, k.user.id); assert.ok(r.ok);
  assert.equal((await login(`${k.username} `, r.password)).status, 200);
});

test('many tries at once cannot slip past the per-name limit while passwords are being checked', async () => {
  const k = kids[2];
  const codes = (await Promise.all(Array.from({ length: 15 }, () => login(k.username, 'wrong')))).map(r => r.status);
  assert.equal(codes.filter(c => c === 400).length, LOGIN.userFails, codes.join(','));
  assert.equal(codes.filter(c => c === 429).length, 15 - LOGIN.userFails);
  // and correct sign-ins at once give their reservations back
  RL._reset();
  const ok = await Promise.all(Array.from({ length: 8 }, () => login(kids[3].username, kids[3].password)));
  assert.ok(ok.every(r => r.status === 200));
  assert.equal(RL.count(RL.loginLockKey(kids[3].username)), 0);
});

test('sign-up: only accounts made count toward the hourly cap, with an hour-long message', async () => {
  const keep = SIGNUP.perHour; SIGNUP.perHour = 2;
  try {
    assert.equal((await post('/api/auth/signup', { username: 'zo', password: 'blue-otter-42' })).status, 400); // too short
    assert.equal((await post('/api/auth/signup', { username: 'LimitsBoss', password: 'blue-otter-42' })).status, 400); // taken
    assert.equal((await post('/api/auth/signup', { username: 'NewKidOne', password: '123456' })).status, 400); // too easy
    assert.equal((await post('/api/auth/signup', { username: 'NewKidOne', password: 'blue-otter-42' })).status, 200);
    assert.equal((await post('/api/auth/signup', { username: 'NewKidTwo', password: 'blue-otter-42' })).status, 200);
    const r = await post('/api/auth/signup', { username: 'NewKidThree', password: 'blue-otter-42' });
    assert.equal(r.status, 429); assert.match((await r.json()).error, /hour/);
  } finally { SIGNUP.perHour = keep; }
});

test('generated school passwords come from a large word list', () => {
  assert.ok(new Set(S.WORDS).size === S.WORDS.length && S.WORDS.length >= 256, `${S.WORDS.length} unique words`);
  assert.ok(S.WORDS.every(w => /^[a-z]{3,7}$/.test(w)));
  const seen = new Set(Array.from({ length: 200 }, () => S.newPassword()));
  assert.ok(seen.size > 195);
});
