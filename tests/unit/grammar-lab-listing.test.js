// Grammar Lab in the site's lists (services/grammar-lab-listing.js; docs/decisions.md "Grammar Lab listed everywhere"):
// the Learn page and the Words subject page, site search (/search and /api/search), the teachers' Find on Oomba catalog
// and the sitemap. Listed only where Grammar Lab lets the visitor in: with GRAMMAR_LAB off nowhere, restricted only for
// the listed account (never signed out, never in the sitemap), open to all (GRAMMAR_LAB_USERS=*) everywhere. Search finds
// it by grammar, "Grammar Lab", punctuation, commas, capital letters, nouns, verbs and writing (and deep-links the
// units a topic names), and not by "math" or "space" (words that are only somewhere in a topic's title). Its tags and
// grades (English, grammar, writing; K-12) and short description are in the page's language; unit titles stay English.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';

const { config } = await import('../../server/config.js');
const { createApp } = await import('../../server/app.js');
const { seed } = await import('../../scripts/seed.js');
const { createUser, startSession, getUser } = await import('../../server/auth.js');
const S = await import('../../server/services/schools.js');
const GLL = await import('../../server/services/grammar-lab-listing.js');
const { CODES, makeT } = await import('../../server/i18n/index.js');
const { _reset: resetLimits } = await import('../../server/services/ratelimit.js');

seed({ quiet: true });
let server, base;
test.before(async () => { server = createApp().listen(0); server.keepAliveTimeout = 0; await new Promise(r => server.once('listening', r)); base = `http://127.0.0.1:${server.address().port}`; });
test.after(() => { server.close(); config.grammarLab = false; config.grammarLabUsers = []; });
test.beforeEach(() => resetLimits());
const cookieFor = id => { let c = ''; startSession({ append: (k, v) => { c = v.split(';')[0]; } }, id); return c; };
const get = async (p, cookie = '', lang = '') => { const r = await fetch(base + p, { redirect: 'manual', headers: { ...(cookie ? { cookie } : {}), ...(lang ? { 'accept-language': lang } : {}) } }); return { status: r.status, text: await r.text() }; };
const set = (on, users) => { config.grammarLab = on; config.grammarLabUsers = users; };
let n = 0;
function teacher() {
  const admin = createUser({ username: `gllA${++n}x${Date.now() % 1000}`, password: 'admin-pass-12345' });
  const s = S.createSchool({ id: admin.id }, { name: `GL List ${n}` }).school;
  S.addMember({ id: admin.id }, s.id, admin.id, 'admin', { rosterName: 'Ms Admin' });
  const u = createUser({ username: `gllT${n}x${Date.now() % 1000}`, password: 'teach-pass-12345' });
  S.addMember({ id: admin.id }, s.id, u.id, 'teacher', { rosterName: 'Mr Teach' });
  const c = S.createClass({ id: u.id }, s.id, { name: '4b', grade: '4' }).class;
  return { u: getUser(u.id), c, cookie: cookieFor(u.id) };
}
const TERMS = ['grammar', 'Grammar Lab', 'punctuation', 'commas', 'capital letters', 'nouns', 'verbs', 'writing'];
const shelf = (x, qs = '') => get(`/class/${x.c.id}?tab=lessons&view=oomba${qs}`, x.cookie);

test('with the flag off: listed nowhere (Learn, the Words page, search, Find on Oomba, the sitemap)', async () => {
  set(false, []);
  const x = teacher();
  for (const [p, c] of [['/learn', ''], ['/learn', x.cookie], ['/learn/word-games', ''], ['/search?q=commas', ''], ['/search?q=grammar', x.cookie]]) {
    const r = await get(p, c);
    assert.doesNotMatch(r.text, /gl-learn|gl-search|\/courses\/grammar-lab/, `${p} ${c ? 'signed in' : 'signed out'}`);
  }
  assert.doesNotMatch((await shelf(x)).text, /oomba-course|\/teach\/grammar-lab/);
  assert.doesNotMatch((await get('/sitemap.xml')).text, /grammar-lab/);
  assert.equal(GLL.listedFor(x.u), false); assert.equal(GLL.listedForAll(), false);
});

test('restricted to testers: only the listed teacher sees it; signed out and the sitemap never', async () => {
  const x = teacher(), other = teacher();
  set(true, [x.u.username.toLowerCase()]);
  try {
    assert.match((await get('/search?q=commas', x.cookie)).text, /gl-search/);
    assert.match((await shelf(x)).text, /oomba-course/);
    assert.doesNotMatch((await get('/search?q=commas', other.cookie)).text, /gl-search/);
    assert.doesNotMatch((await shelf(other)).text, /oomba-course/);
    assert.doesNotMatch((await get('/search?q=commas')).text, /gl-search/);
    assert.doesNotMatch((await get('/learn')).text, /gl-learn/);
    assert.doesNotMatch((await get('/sitemap.xml')).text, /grammar-lab/);
  } finally { set(false, []); }
});

test('open to everyone: Learn (signed out too, under the Words and grade filters), the Words page, the sitemap', async () => {
  set(true, ['*']);
  try {
    const learn = await get('/learn');
    assert.match(learn.text, /id="learn-courses"[\s\S]*id="learn-course-grammar-lab"/, 'signed out, on Learn, in the Courses section');
    assert.match(learn.text, /English, grammar, writing · Grades K-12/, 'its tags and grades');
    assert.match(learn.text, /src="\/covers\/grammar-lab.jpg"/, 'its cover');
    assert.match((await get('/learn?subject=words&grade=3')).text, /gl-learn/, 'Words, grade 3');
    assert.doesNotMatch((await get('/learn?subject=math')).text, /gl-learn/, 'not under Math');
    assert.match((await get('/learn/word-games')).text, /gl-learn/, 'the Words subject page');
    assert.doesNotMatch((await get('/learn/math-games')).text, /gl-learn/);
    const map = (await get('/sitemap.xml')).text;
    assert.match(map, /<loc>[^<]*\/courses\/grammar-lab<\/loc>/, 'the course page, like the other courses');
    assert.match(map, /\/covers\/grammar-lab.jpg/);
  } finally { set(false, []); }
});

test('open to everyone: search finds it by every grammar word, deep-links the units, and not by "math" or "space"', async () => {
  set(true, ['*']);
  try {
    for (const term of TERMS) {
      const r = await get(`/search?q=${encodeURIComponent(term)}`);
      assert.match(r.text, /class="gl-search"/, term);
      assert.match(r.text, /Grammar and writing for grades K to 12/, `${term}: its short description`);
      assert.doesNotMatch(r.text, /No games match/, `${term}: never "no games" next to it`);
    }
    const commas = (await get('/search?q=commas')).text;
    for (const u of ['k-2/commas', '3-5/commas', '6-8/commas-for-clarity']) assert.match(commas, new RegExp(`href="/courses/grammar-lab/${u}"`), `commas -> ${u}`);
    assert.match(commas, /Units for “commas”/);
    assert.match((await get('/search?q=capital%20letters')).text, /href="\/courses\/grammar-lab\/k-2\/capital-letters"/);
    assert.match((await get('/search?q=nouns')).text, /#gl-topic-identifying-common-nouns"/, 'a topic deep-links to its tile');
    assert.match((await get('/search?q=who%20vs%20whom')).text, /class="gl-search"/, 'two words of a topic title');
    for (const term of ['math', 'space', 'shark', 'dragon', 'gr']) assert.doesNotMatch((await get(`/search?q=${term}`)).text, /gl-search/, term);
    assert.doesNotMatch((await get('/search?q=commas&cat=words')).text, /gl-search/, 'not with a category picked');
    const api = await (await fetch(`${base}/api/search?q=commas`)).json();
    assert.equal(api.courses, 1); assert.match(api.html, /gl-search/);
    // in another language: its own words find it, and the words around the course are translated
    const es = await get('/search?q=gram%C3%A1tica', '', 'es');
    assert.match(es.text, /class="gl-search"/, 'gramática finds it');
    assert.match(es.text, /Gramática y escritura para los grados K a 12/);
  } finally { set(false, []); }
});

test('open to everyone: first in a teacher\'s Find on Oomba, with Assign; its box and the Words filter find it', async () => {
  set(true, ['*']);
  try {
    const x = teacher();
    const r = (await shelf(x)).text;
    assert.match(r, /oomba-course/); assert.match(r, /href="\/teach\/grammar-lab"/);
    assert.ok(r.indexOf('oomba-course') < r.indexOf('class="mygame shelf-game oomba-game" data-id'), 'first in the list');
    const dq = /class="mygame shelf-game oomba-game oomba-course" data-q="([^"]*)"/.exec(r)[1];
    for (const term of TERMS) for (const w of term.toLowerCase().split(' ')) assert.ok(dq.includes(w), `the box finds ${term}`);
    assert.match((await shelf(x, '&q=commas')).text, /oomba-course/);
    assert.match((await shelf(x, '&subject=words&grade=5')).text, /oomba-course/);
    assert.doesNotMatch((await shelf(x, '&subject=math')).text, /oomba-course/);
    assert.doesNotMatch((await shelf(x, '&q=fractions')).text, /oomba-course/);
  } finally { set(false, []); }
});

test('the Courses section on Learn: Typing Zoo always, Grammar Lab by its own gate, whatever COURSES says', async () => {
  const was = config.courses;
  try {
    for (const courses of [true, false]) {
      config.courses = courses;
      set(false, []);
      let h = (await get('/learn')).text;
      assert.match(h, /id="learn-courses"[\s\S]*?<h2 id="learn-courses-h">[\s\S]*?Courses<\/h2>/, `COURSES ${courses}: the section`);
      assert.match(h, /id="learn-course-typing"[\s\S]*?src="\/covers\/typing-zoo.jpg"[\s\S]*?Learn to touch type, one key at a time/, 'Typing Zoo, its cover and line');
      assert.doesNotMatch(h, /id="learn-course-grammar-lab"/, 'Grammar Lab off: not there');
      set(true, ['*']);
      h = (await get('/learn')).text;
      assert.match(h, /id="learn-course-grammar-lab"[\s\S]*?src="\/covers\/grammar-lab.jpg"/);
      assert.ok(h.indexOf('id="learn-courses"') < h.indexOf('id="learn-games"') || !h.includes('id="learn-games"'), 'near the top');
      // the old courses row (CS Quest, Number Quest, Cyber Defenders) stays behind COURSES
      assert.equal(/id="course-cs-quest-h"/.test(h), courses, `the COURSES row ${courses ? 'shown' : 'hidden'}`);
      // filters: Words keeps Grammar Lab, Typing keeps Typing Zoo
      h = (await get('/learn?subject=words')).text;
      assert.match(h, /id="learn-course-grammar-lab"/); assert.doesNotMatch(h, /id="learn-course-typing"/);
      h = (await get('/learn?subject=typing')).text;
      assert.match(h, /id="learn-course-typing"/); assert.doesNotMatch(h, /id="learn-course-grammar-lab"/);
      // in Spanish: the heading and the line translated
      h = (await get('/learn', '', 'es')).text;
      assert.match(h, /Cursos<\/h2>/); assert.match(h, /Aprende a escribir con el teclado, tecla a tecla/);
    }
  } finally { config.courses = was; set(false, []); }
});

test('its listing words are in every language, with no dashes', () => {
  for (const c of CODES) {
    const t = makeT(c);
    for (const k of ['grammarLab.listing.desc', 'grammarLab.listing.tags', 'grammarLab.listing.terms', 'grammarLab.listing.units', 'search.courses', 'learn.courses.h', 'learn.courses.typing', 'learn.courses.grades', 'game.favAdd', 'game.favRemove']) {
      const v = t(k, { text: 'x' });
      assert.ok(v && v !== k, `${c} ${k}`);
      assert.doesNotMatch(v, /[–—]/, `${c} ${k}: no en or em dash`);
    }
  }
});
