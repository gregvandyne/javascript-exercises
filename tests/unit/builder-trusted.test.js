// Trusted makers (server/builder/usage.js trustedMaker: the platform admin, school staff and class teachers) always
// build with the Pro model, a Pro message counts as one message for them, and their builds get a longer time cap and
// more model calls. Students and other builders are unchanged.
process.env.BRB_DB = ':memory:';
process.env.BRB_SILENT = '1';
process.env.LOG_REQUESTS = '0';
process.env.BRB_MOCK_DELAY_MS = '0';
process.env.BRB_DATA_DIR = (await import('node:os')).tmpdir() + '/brb-trusted-test-' + process.pid;
import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';

const { config } = await import('../../server/config.js');
config.anthropicKey = '';
config.builderFullForAll = false;   // these tests cover the staff-only mode; BUILDER_FULL_FOR_ALL is tested below
const auth = await import('../../server/auth.js');
const games = await import('../../server/services/games.js');
const schools = await import('../../server/services/schools.js');
const runner = await import('../../server/builder/runner.js');
const agent = await import('../../server/builder/agent.js');
const usage = await import('../../server/builder/usage.js');
const { maxStepsFor, MAX_STEPS, MAX_STEPS_TRUSTED } = await import('../../server/builder/claude.js');
const { tEn } = await import('../../server/i18n/index.js');

let n = 0;
const newUser = (extra = {}) => auth.createUser({ username: `Tru_${String.fromCharCode(97 + (n++ % 26))}${n}`.slice(0, 16), password: 'secret1', ...extra });
const PRO_WEIGHT = config.proTurnWeight;

// The gate provider records what each build was given, then saves nothing and ends.
let seen = [];
agent.registerProvider('gate', { run: async ctx => { seen.push({ pro: ctx.pro, trusted: ctx.trusted }); return { model: 'gate', tokensIn: 0, tokensOut: 0 }; } });
const build = (u, extra = {}) => {
  const g = games.createGame(u.id, { title: 'Untitled' });
  return runner.submit({ user: auth.getUser(u.id), game: games.getGame(g.id), text: 'Make a catch game about a fox. Just build it.', t: tEn, provider: 'gate', ...extra });
};

afterEach(() => { runner._reset(); seen = []; config.proTurnWeight = PRO_WEIGHT; });

const admin = newUser({ role: 'admin' });
const school = schools.createSchool(auth.getUser(admin.id), { name: 'Trust Primary' });
const schoolId = school.id || (school.school && school.school.id);
const teacher = newUser();
schools.addMember(auth.getUser(admin.id), schoolId, teacher.id, 'teacher');
const student = newUser();
schools.addMember(auth.getUser(admin.id), schoolId, student.id, 'student');
const kid = newUser();

test('TRU-1 who is trusted: the admin and school staff yes; students, other kids and guests no', () => {
  assert.equal(usage.trustedMaker(auth.getUser(admin.id)), true);
  assert.equal(usage.trustedMaker(teacher.id), true);
  assert.equal(usage.trustedMaker(student.id), false);
  assert.equal(usage.trustedMaker(kid.id), false);
  assert.equal(usage.trustedMaker(newUser({ isGuest: true })), false);
  assert.equal(usage.trustedMaker(null), false);
});

test('TRU-2 time cap and model calls: longer for trusted makers, unchanged for everyone else', () => {
  assert.equal(usage.turnCapMs(teacher.id), config.builderStaffTurnMaxMs);
  assert.equal(usage.turnCapMs(admin.id), config.builderStaffTurnMaxMs);
  assert.equal(usage.turnCapMs(kid.id), config.builderTurnMaxMs);
  assert.equal(usage.turnCapMs(student.id), config.builderTurnMaxMs);
  assert.ok(config.builderStaffTurnMaxMs > config.builderTurnMaxMs, 'the trusted cap is the longer one');
  assert.equal(maxStepsFor(true), MAX_STEPS_TRUSTED); assert.equal(maxStepsFor(false), MAX_STEPS);
  assert.ok(MAX_STEPS_TRUSTED > MAX_STEPS);
});

test('TRU-3 a teacher\'s message is always Pro, counts as one message even with a Pro weight, and gets the trusted rounds', async () => {
  config.proTurnWeight = 2;
  const before = usage.turnsUsed(teacher.id);
  assert.equal(usage.allowanceFor(teacher.id).proWeight, 1);
  const r = await build(teacher, { pro: false });
  assert.equal(r.status, 202);
  assert.equal(r.job.pro, true, 'Pro without asking');
  await runner.idle(r.job);
  assert.deepEqual(seen, [{ pro: true, trusted: true }]);
  assert.equal(usage.turnsUsed(teacher.id) - before, 1, 'one message, not the Pro weight');
});

test('TRU-4 a student is unchanged: not Pro unless asked, and a Pro message uses the Pro weight', async () => {
  config.proTurnWeight = 2;
  const before = usage.turnsUsed(kid.id);
  const r = await build(kid, { pro: false });
  assert.equal(r.job.pro, false);
  await runner.idle(r.job);
  assert.deepEqual(seen, [{ pro: false, trusted: false }]);
  assert.equal(usage.turnsUsed(kid.id) - before, 1);
  seen = [];
  const r2 = await build(kid, { pro: true });
  await runner.idle(r2.job);
  assert.deepEqual(seen, [{ pro: true, trusted: false }]);
  assert.equal(usage.turnsUsed(kid.id) - before, 3, 'the Pro message used 2 turns');
});

test('TRU-5 the Studio shows trusted makers an "included" badge instead of the Pro switch; others keep the switch', async () => {
  const { createApp } = await import('../../server/app.js');
  const { q } = await import('../../server/db.js');
  const server = createApp().listen(0);
  await new Promise(r => server.once('listening', r));
  const BASE = `http://127.0.0.1:${server.address().port}`;
  const studioPage = async (name, makeAdmin) => {
    const res = await fetch(BASE + '/api/auth/signup', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: name, password: 'secret12' }) });
    assert.equal(res.status, 200);
    const cookie = res.headers.getSetCookie().find(c => c.startsWith('brb_session=')).split(';')[0];
    const me = q.get('SELECT id FROM users WHERE username=?', name);
    if (makeAdmin) q.run("UPDATE users SET role='admin' WHERE id=?", me.id);
    const g = games.createGame(me.id, { title: 'Untitled' });
    const r = await fetch(`${BASE}/studio/${g.id}`, { headers: { cookie } });
    assert.equal(r.status, 200);
    return r.text();
  };
  try {
    const adminPage = await studioPage('TruAdminPage', true);
    assert.match(adminPage, /id="st-pro-incl"/); assert.doesNotMatch(adminPage, /id="st-pro"[ >]/);
    assert.match(adminPage, /Included for teachers/);
    const kidPage = await studioPage('TruKidPage', false);
    assert.match(kidPage, /id="st-pro"/); assert.doesNotMatch(kidPage, /st-pro-incl/);
  } finally { server.closeAllConnections(); server.close(); }
});

test('TRU-full everyone builds like a teacher with BUILDER_FULL_FOR_ALL on (the default): students and kids yes, guests and banned no', () => {
  config.builderFullForAll = true;
  try {
    assert.equal(usage.trustedMaker(student.id), true);
    assert.equal(usage.trustedMaker(kid.id), true);
    assert.equal(usage.trustedMaker(newUser({ isGuest: true })), false);
    assert.equal(usage.trustedMaker(null), false);
    assert.equal(usage.turnCapMs(kid.id), config.builderStaffTurnMaxMs);
    assert.equal(maxStepsFor(usage.trustedMaker(kid.id)), MAX_STEPS_TRUSTED);
  } finally { config.builderFullForAll = false; }
});
