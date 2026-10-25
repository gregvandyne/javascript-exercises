// BOOTSTRAP_SCHOOLS: a school made at start-up with an existing account as its admin, who can also teach a class.
process.env.BRB_DB = ':memory:'; process.env.BRB_SILENT = '1'; process.env.LOG_REQUESTS = '0';
import test from 'node:test';
import assert from 'node:assert/strict';
const { q } = await import('../../server/db.js');
const { createUser, createGuest } = await import('../../server/auth.js');
const S = await import('../../server/services/schools.js');
const { seedSchools } = await import('../../scripts/seed.js');

const boss = createUser({ username: 'BootBoss', password: 'secret123', role: 'admin' });
const jvd = createUser({ username: 'MsJVD', password: 'teacher-pass-123' });
const NAME = 'Donaldson Way Elementary School';
const schoolsNamed = n => q.all('SELECT * FROM schools WHERE name=? COLLATE NOCASE', n);

test('creates the school once and makes the existing account its admin, whatever the case of the names', () => {
  const said = [];
  const r = seedSchools(boss, JSON.stringify([{ name: NAME, admin: 'msjvd' }]), m => said.push(m));
  assert.equal(r.length, 1);
  const [s] = schoolsNamed(NAME);
  assert.equal(S.membership(s.id, jvd.id).role, 'admin');
  assert.ok(said.some(m => /Created the school/.test(m)) && said.some(m => /Made @MsJVD a school admin/.test(m)), said.join(' | '));
  // safe to re-run and to leave set: no second school, no new messages
  const again = [];
  assert.equal(seedSchools(boss, `[{"name":"${NAME.toUpperCase()}","admin":"MsJVD"}]`, m => again.push(m)).length, 1);
  assert.equal(schoolsNamed(NAME).length, 1);
  assert.deepEqual(again, []);
});

test('the school admin can create her own class and is its teacher', () => {
  const [s] = schoolsNamed(NAME);
  assert.ok(S.canCreateClass(jvd, s.id));
  const c = S.createClass(jvd, s.id, { name: 'Room 4', grade: '3' });
  assert.ok(c.ok, c.code);
  assert.ok(S.teaches(jvd, c.class.id), 'she teaches the class she made');
  assert.ok(S.canManageClass(jvd, c.class), 'and manages it');
  assert.ok(S.isSchoolStaff(jvd));
});

test('an existing teacher is promoted; bad values, missing or guest accounts never stop the start', () => {
  const other = S.createSchool(boss, { name: 'Willow Creek School' }).school;
  const t = createUser({ username: 'MrTeach', password: 'teacher-pass-123' });
  S.addMember(boss, other.id, t.id, 'teacher');
  seedSchools(boss, [{ name: 'willow creek school', admin: 'MrTeach' }]);
  assert.equal(S.membership(other.id, t.id).role, 'admin');
  assert.equal(schoolsNamed('Willow Creek School').length, 1);

  const said = [];
  const g = createGuest();
  assert.deepEqual(seedSchools(boss, 'not json', m => said.push(m)), []);
  assert.deepEqual(seedSchools(boss, '[{"name":"Nowhere School","admin":"NoSuchUser"}]', m => said.push(m)), []);
  assert.deepEqual(seedSchools(boss, [{ name: 'Guest School', admin: g.username }], m => said.push(m)), []);
  assert.deepEqual(seedSchools(boss, [{ name: 'X' }], m => said.push(m)), []);
  assert.deepEqual(seedSchools(boss, ''), []);
  assert.equal(schoolsNamed('Nowhere School').length + schoolsNamed('Guest School').length, 0, 'no school without its admin');
  assert.equal(said.length, 4, said.join(' | '));
});
