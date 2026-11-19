// A school with a teacher, a class of students and a Story Library book assigned (tests/unit/library-*.test.js and
// the screenshots). Call after the database is set up (tests/unit/_setup.js) and the site is seeded.
import * as auth from '../../server/auth.js';
import * as S from '../../server/services/schools.js';
import * as LIB from '../../server/services/library.js';

export function librarySeed({ names = ['Ava Lopez', 'Leo Chen', 'Mia Brown', 'Noah Kim', 'Zoe Park'], book = 'sw-0001' } = {}) {
  const boss = auth.createUser({ username: `LibBoss${Math.random().toString(36).slice(2, 7)}`, password: 'secret123', role: 'admin' });
  const school = S.createSchool(boss, { name: 'Maple Elementary' }).school;
  const head = S.createSchoolAccount(boss, school.id, { rosterName: 'Head', role: 'admin' }).user;
  const teacher = S.createSchoolAccount(head, school.id, { rosterName: 'Ms Rivera', role: 'teacher' }).user;
  const cls = S.createClass(teacher, school.id, { name: '2nd grade · Room 4' }).class;
  const kids = names.map(n => { const k = S.createSchoolAccount(teacher, school.id, { rosterName: n }).user; S.addToClass(teacher, cls.id, k.id); return k; });
  const outsider = auth.createUser({ username: `Outsider${Math.random().toString(36).slice(2, 7)}`, password: 'secret123' });
  const assigned = book ? LIB.assignStory(teacher, cls.id, book, {}) : null;
  return { boss, school, head, teacher, cls, kids, outsider, assigned };
}
/** A session cookie "name=value" for a user (to open pages as them). */
export function cookieOf(id) { let c = ''; auth.startSession({ append: (k, v) => { c = v.split(';')[0]; } }, id); return c; }
