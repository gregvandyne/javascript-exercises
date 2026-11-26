// Teachers say lessons (docs/decisions.md "Teachers say lessons"): a teacher's pages call a playable thing a "lesson"
// and a multi-step lesson a "lesson plan"; students and kids keep "game". Shared strings have a teacher variant
// (<key>ForTeachers) that school staff see, on the server and in the page's browser strings.
//   - the teacher's key pages: the teacher home, the class page, Homeroom's left panel (and its browser strings), /build
//     and the Live host page say "lesson", and their visible text has no "game" (games students built and shared keep
//     theirs);
//   - a student's desk and their To do (the Class tab) still say "game", and a kid's /build still builds games;
//   - the mechanism: teacherT, the browser strings, and every teacher variant has its key in every locale.
import { reset, call, open, config, teacher, cls, mia, kid, mum, S, auth, q, games, official } from './_live.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const TOOLS = await import('./_tools-plan.js');
const HO = await import('../../server/services/homeroom-handouts.js');
const I = await import('../../server/i18n/index.js');
const { flatten } = I;

TOOLS.plansOn();
TOOLS.givePlan(teacher.id);
const tia = auth.getUser(teacher.id);
Object.assign(config, { homeroom: true, homeroomUsers: [tia.username.toLowerCase()] });
const made = (title, slug) => {
  const g = games.createGame(official.id, { title, icon: '🍕' });
  const v = games.addVersion(g.id, '<!doctype html><title>x</title><p>Game</p><script>1</script>', { createdBy: official.id, safetyStatus: 'pass' });
  q.run("UPDATE games SET status='published', visibility='public', published_version_id=?, source='seed', shelf='learn', slug=?, plays=1 WHERE id=?", v.id, slug, g.id);
  return games.getGame(g.id);
};
const pizza = made('Fraction Pizza', 'fraction-pizza-sl');
assert.ok(HO.handOut(tia, S.getClass(cls.id), { gameId: pizza.id, to: { kind: 'all' } }).ok);

// What a person reads: the page without scripts and styles, tags and the site's footer, plus aria-labels, titles,
// placeholders and alt text.
const visible = html => {
  const body = html.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<style[\s\S]*?<\/style>/g, ' ').replace(/<footer[\s\S]*?<\/footer>/g, ' ');
  const attrs = [...body.matchAll(/\b(?:aria-label|title|placeholder|alt)="([^"]*)"/g)].map(m => m[1]);
  return [body.replace(/<[^>]+>/g, ' '), ...attrs].join(' ').replace(/&#39;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ');
};
const strings = html => JSON.parse(/<script type="application\/json" id="i18n">([\s\S]*?)<\/script>/.exec(html)[1]).strings;
// Games a student built and shared with the class keep their word, for the teacher too.
const STUDENT_GAMES = /Games students shared(\s+\d+\s*,\s*\d+ games?)?|From our class\s+\d+\s*,\s*\d+ games?/g;
const noGame = (text, where) => assert.doesNotMatch(text.replace(STUDENT_GAMES, ''), /\bgames?\b/i, `${where}: no "game"`);

test('a teacher\'s key pages say "lesson", never "game"', async () => {
  reset();
  // the teacher home
  const home = await call('/teach?all=1', { user: tia });   // one class: ?all=1 keeps the home (not straight to the class)
  assert.equal(home.status, 200);
  assert.match(visible(home.text), /Lesson Folder/); noGame(visible(home.text), '/teach');
  // the class page (Classroom view): its Lessons and Lesson plans tabs, Build new lesson, Find Oomba lessons
  const page = await call(`/class/${cls.id}`, { user: tia });
  const v = visible(page.text);
  for (const w of ['Build new lesson', 'Find Oomba lessons', 'Lessons for this class', '1 item, in the order students see it']) assert.ok(v.includes(w), `class page: ${w}`);
  noGame(v, 'class page');
  // Homeroom: the left panel, and the strings its scripts show
  const hr = await call(`/class/${cls.id}/homeroom`, { user: tia });
  assert.equal(hr.status, 200);
  const panel = visible(hr.text.slice(hr.text.indexOf('class="hr-panel'), hr.text.indexOf('</aside>', hr.text.indexOf('class="hr-panel'))));
  for (const w of ['Tap a lesson, then a desk', 'My lesson plans', 'Lessons I built', 'Lessons you build show here.', 'Oomba lessons and tools']) assert.ok(panel.includes(w), `Homeroom panel: ${w}`);
  noGame(panel, 'Homeroom panel');
  const js = strings(hr.text);
  assert.equal(js['js.homeroom-lessons.build'], 'Build a lesson plan');
  assert.equal(js['js.homeroom.ho.eyebrow'], 'Lesson · free play');
  assert.equal(js['js.homeroom.ho.lesson'], 'Lesson plan');
  noGame(Object.entries(js).filter(([k]) => /^js\.homeroom/.test(k)).map(([, s]) => s.replace(/\{\w+\}/g, '')).join(' '), 'Homeroom browser strings (placeholders aside)');
  // /build, the Lesson Folder
  const build = await call('/build', { user: tia });
  const b = visible(build.text);
  for (const w of ['Build lessons', 'New lesson', 'All my lessons', 'Make a lesson by chatting!']) assert.ok(b.includes(w), `/build: ${w}`);
  noGame(b, '/build');
  // the Live tab and the host page (the projector: a join code, not a "lesson code")
  const live = await call('/live', { user: tia });
  assert.match(visible(live.text), /Host a live lesson/);
  const s = open(tia, { mode: 'battle', audience: 'class', classId: cls.id, starter: 'bank:mixed:a8:5' });
  const host = await call(`/live/host/${s.id}`, { user: tia });
  assert.equal(host.status, 200);
  const h = visible(host.text);
  for (const w of ['Live lesson', 'Join code', 'End lesson', 'Lesson settings', 'Lesson controls']) assert.ok(h.includes(w), `host page: ${w}`);
  noGame(h.replace(/Question Battle/g, ''), 'Live host page');
});

test('a student\'s desk and To do, and a kid\'s /build, still say "game"', async () => {
  reset();
  const desk = await call(`/class/${cls.id}/desk`, { user: mia });
  assert.equal(desk.status, 200);
  assert.match(visible(desk.text), /Skip to the games/); assert.match(visible(desk.text), /Search games or builders/);
  assert.doesNotMatch(visible(desk.text), /Search lessons|Lesson Folder/);
  const todo = await call('/classes', { user: mia });
  assert.equal(todo.status, 200);
  const t = visible(todo.text);
  assert.match(t, /Games from our class/); assert.match(t, /Build a game and share it with your class/);
  assert.doesNotMatch(t, /Oomba lessons|lesson plan|Live lesson/i);
  const page = await call(`/class/${cls.id}`, { user: mia });
  assert.match(visible(page.text), /Assigned games/); assert.doesNotMatch(visible(page.text), /Assigned lessons|Find Oomba lessons/);
  const build = await call('/build', { user: kid });
  const kb = visible(build.text);
  assert.match(kb, /Build a game/); assert.match(kb, /New game/); assert.match(kb, /Make your own game by chatting!/);
  assert.doesNotMatch(kb, /lesson/i);
  // a family grown-up keeps "game" too: Live's strings are a teacher's variant, not a new word for everyone
  assert.equal(I.tEn('live.host.title'), 'Live game');
  assert.equal(I.teacherT(I.tEn)('live.host.title'), 'Live lesson');
  assert.ok(!auth.getUser(mum.id).is_guest && !S.isSchoolStaff(auth.getUser(mum.id)), 'a grown-up is not school staff');
});

test('the mechanism: teacherT picks <key>ForTeachers where there is one; browser strings follow; every variant has its key everywhere', () => {
  const t = I.teacherT(I.tFor('de'));
  assert.equal(t('build.title'), 'Lektionen bauen'); assert.equal(I.tFor('de')('build.title'), 'Spiel bauen');
  assert.equal(t('build.rename'), I.tFor('de')('build.rename'), 'a key with no variant is the same');
  assert.equal(I.teacherT(t), t, 'once is enough');
  assert.equal(t.locale, 'de'); assert.ok(t.has('build.title'));
  const plain = I.clientStrings('en', ['js.build']), staff = I.clientStrings('en', ['js.build'], { teacher: true });
  assert.equal(plain['js.build.deleted'], 'Game deleted'); assert.equal(staff['js.build.deleted'], 'Lesson deleted');
  // every ForTeachers key belongs to a key, in English and in every locale that has it
  const dir = new URL('../../server/i18n/locales/', import.meta.url);
  const en = flatten(JSON.parse(fs.readFileSync(new URL('en.json', dir), 'utf8')));
  const variants = Object.keys(en).filter(k => k.endsWith(I.TEACHER_SUFFIX));
  assert.ok(variants.length > 50, 'the teacher variants are there');
  for (const f of fs.readdirSync(dir).filter(n => n.endsWith('.json'))) {
    const loc = flatten(JSON.parse(fs.readFileSync(new URL(f, dir), 'utf8')));
    for (const k of Object.keys(loc).filter(x => x.endsWith(I.TEACHER_SUFFIX))) assert.ok(k.slice(0, -I.TEACHER_SUFFIX.length) in en, `${f}: ${k} has its key`);
    // a locale that translates a shared string also translates its teacher variant, so a teacher never sees English
    if (f !== 'en.json' && f !== 'en-GB.json') for (const k of variants) { const base = k.slice(0, -I.TEACHER_SUFFIX.length); if (loc[base]) assert.ok(loc[k], `${f}: ${k}`); }
  }
  // no em dashes in the teachers' words
  for (const k of variants) assert.doesNotMatch(en[k], /—/, k);
});
