// Classroom activities in the Builder's setup steps (/build/new): the "For your class" group (first and shown first
// for teachers; after the games for kids and families), the classroom types in the plan (normalisePlan, the steps they
// skip, "jeopardy" typed as words), what the model reads for each (planNote), their starters (plain HTML for the board),
// the 2D-art guard of a plan (a classroom type is never forced into a running game), the hand-off to the Builder, and
// the class survey's safety: counts only, on the device, never BRB.poll (which stays official-games-only on the server).
// The starters in a real browser: tests/unit/classroom-templates.test.js.
process.env.BRB_DB = ':memory:';
process.env.BRB_SILENT = '1';
process.env.LOG_REQUESTS = '0';
process.env.BRB_MOCK_DELAY_MS = '0';
process.env.BRB_DATA_DIR = (await import('node:os')).tmpdir() + '/brb-classroom-test-' + process.pid;
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const { config } = await import('../../server/config.js');
config.builderFullForAll = false; config.anthropicKey = '';
const { createApp } = await import('../../server/app.js');
const { q, now } = await import('../../server/db.js');
const auth = await import('../../server/auth.js');
const games = await import('../../server/services/games.js');
const S = await import('../../server/services/schools.js');
const polls = await import('../../server/services/polls.js');
const { micGame } = await import('../../server/services/mic-games.js');
const runner = await import('../../server/builder/runner.js');
const plan = await import('../../server/builder/plan.js');
const { CLASSROOM_TEMPLATE_KEYS, BUILDER_TEMPLATE_KEYS, templateInfo } = await import('../../server/builder/catalog.js');
const { TEMPLATES, loadTemplate } = await import('../../server/builder/templates/index.js');
const { scanVersion } = await import('../../server/services/scanner.js');
const { toolbox } = await import('../../server/builder/tools.js');
const { detectKind } = await import('../../server/builder/themes.js');
const { SYSTEM_PROMPT, CLASSROOM_RULES } = await import('../../server/builder/prompt.js');
const { CODES, flatten } = await import('../../server/i18n/index.js');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const server = createApp().listen(0);
await new Promise(r => server.once('listening', r));
const BASE = `http://127.0.0.1:${server.address().port}`;
test.after(() => { server.closeAllConnections(); server.close(); });
function client() {
  let cookie = '';
  return async (p, { method = 'GET', body } = {}) => {
    const h = {}; if (cookie) h.cookie = cookie;
    if (body !== undefined) h['content-type'] = 'application/json';
    const res = await fetch(BASE + p, { method, headers: h, body: body !== undefined ? JSON.stringify(body) : undefined, redirect: 'manual' });
    for (const c of res.headers.getSetCookie ? res.headers.getSetCookie() : []) { const kv = c.split(';')[0]; if (kv.startsWith('brb_session=')) cookie = kv; }
    const text = await res.text(); let json = null; try { json = JSON.parse(text); } catch { /* html */ }
    return { status: res.status, text, json };
  };
}
async function signup(name) { const c = client(); const r = await c('/api/auth/signup', { method: 'POST', body: { username: name, password: 'secret12' } }); assert.equal(r.status, 200, r.text); return { c, user: auth.getUserByName(name) }; }
const kid = await signup('RoomKid');
const teacher = await signup('RoomTeacher');
{ const school = S.createSchool(teacher.user, { name: 'Classroom School' }).school; q.run('INSERT INTO school_members(school_id, user_id, role, joined_at) VALUES (?,?,?,?)', school.id, teacher.user.id, 'teacher', now()); }
const pack = id => ({ from: 'pack', id }), custom = text => ({ from: 'custom', text });
const STARTERS = ['quiet', 'categories', 'survey', 'bingo', 'flashcards', 'exitticket', 'spinner', 'scoreboard'];

// ---------------------------------------------------------------- the type list and its order
test('the game-type step: "For your class" first for teachers, after the games (kid-suitable ones only) for kids', () => {
  const ids = groups => groups.map(g => ({ id: g.id, items: g.items.map(x => x.id) }));
  assert.deepEqual(ids(plan.typeGroups({ teacher: true })), [
    { id: 'class', items: [...STARTERS, 'quiz', 'word', 'memory'] },
    { id: 'games', items: ['adventure', 'runner', 'catch', 'duel', 'board'] },
  ]);
  assert.deepEqual(ids(plan.typeGroups({ teacher: false })), [
    { id: 'games', items: ['adventure', 'runner', 'catch', 'quiz', 'memory', 'word', 'duel', 'board'] },   // today's order
    { id: 'class', items: ['quiet', 'categories', 'bingo', 'flashcards', 'spinner', 'scoreboard'] },
  ]);
  assert.deepEqual(plan.GAME_TYPES.filter(x => x.teacher).map(x => x.id), ['survey', 'exitticket']);
  assert.deepEqual(plan.GAME_TYPES.filter(x => x.starter).map(x => x.template), CLASSROOM_TEMPLATE_KEYS);
  for (const k of CLASSROOM_TEMPLATE_KEYS) assert.ok(BUILDER_TEMPLATE_KEYS.includes(k), k);
});

test('/build/new: a teacher sees "For your class" first and shown; a kid sees the games first and no teacher-only types', async () => {
  const tabs = h => [...h.matchAll(/data-tgroup-btn="(\w+)" aria-pressed="(true|false)"/g)].map(m => `${m[1]}:${m[2]}`);
  const cards = (h, g, hidden) => [...h.matchAll(new RegExp(`data-card="(\\w+)" data-tgroup="${g}"${hidden ? ' hidden' : ''}>`, 'g'))].map(m => m[1]);
  const t = (await teacher.c('/build/new')).text, k = (await kid.c('/build/new')).text;
  assert.deepEqual(tabs(t), ['class:true', 'games:false']);
  assert.deepEqual(cards(t, 'class', false), [...STARTERS, 'quiz', 'word', 'memory'], 'shown at first, in this order');
  assert.deepEqual(cards(t, 'games', true), ['adventure', 'runner', 'catch', 'duel', 'board'], 'one tap away');
  assert.ok(t.indexOf('data-card="survey"') < t.indexOf('data-card="adventure"'));
  assert.match(t, />For your class</); assert.match(t, /Activities for the classroom board and for phones\./);
  assert.match(t, /"teacher":true/);
  assert.deepEqual(tabs(k), ['games:true', 'class:false']);
  assert.deepEqual(cards(k, 'games', false), ['adventure', 'runner', 'catch', 'quiz', 'memory', 'word', 'duel', 'board']);
  assert.deepEqual(cards(k, 'class', true), ['quiet', 'categories', 'bingo', 'flashcards', 'spinner', 'scoreboard']);
  assert.ok(!k.includes('data-card="survey"') && !k.includes('data-card="exitticket"'));
  for (const h of [t, k]) { assert.match(h, /data-step="type" data-id="else"/); assert.doesNotMatch(h.replace(/<script[\s\S]*?<\/script>/g, ''), /jeopardy/i); }
  // the steps each starter skips ride along for the page's script
  const data = JSON.parse(/<script type="application\/json" id="page-data">([\s\S]*?)<\/script>/.exec(t)[1]);
  assert.deepEqual(data.skip.survey, ['look', 'world', 'chars', 'learn']); assert.deepEqual(data.skip.categories, ['look', 'world', 'chars']);
  assert.equal(data.skip.quiz, undefined, 'quiz, word and memory keep every step');
});

// ---------------------------------------------------------------- the plan
test('plan normalisation: the new ids, the steps they skip, "jeopardy" as typed words, and teacher-only types', () => {
  for (const id of STARTERS) {
    const p = plan.normalisePlan({ type: pack(id), look: '3d', world: pack('castle-quest'), characters: [pack('knight')], learn: [{ id: 'math' }], notes: 'Year 4' });
    assert.deepEqual(p.type, pack(id)); assert.equal(p.look, null); assert.equal(p.world, null); assert.deepEqual(p.characters, []);
    assert.deepEqual(p.learn, plan.typeById(id).skip.includes('learn') ? [] : [{ id: 'math' }], id);
    assert.equal(p.notes, 'Year 4');
    assert.deepEqual(plan.planEngine(p), { engine: 'classroom', template: id });
  }
  assert.deepEqual(plan.normalisePlan({ type: custom('A Jeopardy game about space') }).type, pack('categories'));
  assert.deepEqual(plan.normalisePlan({ type: custom('exit ticket for fractions') }).type, pack('exitticket'));
  assert.deepEqual(plan.normalisePlan({ type: custom('a noise meter') }).type, pack('quiet'));
  assert.deepEqual(plan.normalisePlan({ type: custom('a maze') }).type, custom('a maze'), 'other words stay their own idea');
  // a kid's plan: no survey or exit ticket (an id is dropped, words stay their own idea), the rest is the same
  assert.equal(plan.normalisePlan({ type: pack('survey'), notes: 'x' }, { forKid: true }).type, null);
  assert.deepEqual(plan.normalisePlan({ type: custom('a class poll') }, { forKid: true }).type, custom('a class poll'));
  assert.deepEqual(plan.normalisePlan({ type: pack('bingo') }, { forKid: true }).type, pack('bingo'));
  // quiz, word and memory are classroom-friendly but keep today's flow (look, world, characters)
  const quiz = plan.normalisePlan({ type: pack('quiz'), look: '2d', world: pack('toy-town') });
  assert.equal(quiz.look, '2d'); assert.deepEqual(quiz.world, pack('toy-town')); assert.equal(plan.planEngine(quiz).engine, '2d');
  // the mock Builder reads the words the same way
  assert.equal(detectKind('make a jeopardy game for my class'), 'categories'); assert.equal(detectKind('flash cards for spelling'), 'flashcards');
  assert.equal(detectKind('a quiz about planets'), 'quiz'); assert.equal(detectKind('a running game'), 'runner');
});

test('main\'s 2D-art guard never forces a classroom type into a running game, characters picked or not', async () => {
  // a page that sent 2D, a 2D world and sprite characters with a classroom type: they are dropped, so no 2D-art plan
  for (const id of STARTERS) {
    const p = plan.normalisePlan({ type: pack(id), look: '2d', world: pack('toy-town'), characters: [pack('triceratops'), pack('knight')] });
    assert.equal(plan.planArt2d(p), null, id);
  }
  // so the toolbox lets the build start from the classroom starter (the guard only refuses non-runner/catch under a 2D-art plan)
  const u = auth.createUser({ username: 'GuardKid', password: 'secret1' });
  for (const id of ['categories', 'quiet']) {
    const g = games.createGame(u.id, {});
    const tb = toolbox({ user: u, gameId: g.id, emit: () => {}, state: {}, plan: plan.normalisePlan({ type: pack(id), look: '2d', characters: [pack('triceratops')] }) });
    const r = await tb.exec('start_from_template', { template: id, notes: 'Started' });
    assert.equal(r.ok, true, r.forModel); assert.match(r.forModel, /classroom starter/);
    assert.equal(games.getVersion(games.getGame(g.id).current_version_id).html, loadTemplate(id));
    assert.equal(await tb.planFallback(), null, 'no 2D fallback for a classroom plan');
  }
  // and a real 2D-art plan still keeps its guard: a classroom starter is refused there
  const g = games.createGame(u.id, {});
  const tb = toolbox({ user: u, gameId: g.id, emit: () => {}, state: {}, plan: plan.normalisePlan({ type: pack('runner'), look: '2d', characters: [pack('triceratops')] }) });
  assert.equal((await tb.exec('start_from_template', { template: 'bingo', notes: 'x' })).ok, false);
});

test('what the model reads for each classroom type: its starter, its own note, the classroom rules, never a 3D world', () => {
  for (const id of STARTERS) {
    const note = plan.planNote(plan.normalisePlan({ type: pack(id), notes: 'for my Year 4 class' }));
    assert.match(note, new RegExp(`Game type: PACK "${id}" \\(the ready-made starter: start_from_template "${id}"\\)`));
    assert.match(note, new RegExp(`Build it from the classroom starter: start_from_template "${id}"`));
    assert.ok(note.includes(plan.CLASSROOM_NOTES[id]), `${id}: its own note`);
    assert.match(note, /never students' names \(teams and numbers only\), no free text or typing by students, no chat, nothing about a student stored or sent/);
    assert.match(note, /Look, world and characters: none/); assert.doesNotMatch(note, /start_from_template "(oomba3d|world3d|runner)"/);
    assert.match(note, /Their note: "for my Year 4 class"/);
  }
  assert.match(plan.CLASSROOM_NOTES.categories, /never call it "Jeopardy"/); assert.match(plan.CLASSROOM_NOTES.categories, /answer in the form of a question/);
  assert.match(plan.CLASSROOM_NOTES.quiet, /BRB\.loudness/); assert.match(plan.CLASSROOM_NOTES.quiet, /calm quiet timer/); assert.match(plan.CLASSROOM_NOTES.quiet, /never call getUserMedia/);
  assert.match(plan.CLASSROOM_NOTES.survey, /never add free text answers, names, saving|Never add free text answers, names, saving/);
  assert.match(plan.CLASSROOM_NOTES.survey, /BRB\.poll/); assert.match(plan.CLASSROOM_NOTES.spinner, /never uses students' names/);
  assert.match(plan.CLASSROOM_NOTES.exitticket, /score null/); assert.match(plan.CLASSROOM_NOTES.exitticket, /question step or question set in a class lesson/);
  assert.match(plan.planNote(plan.normalisePlan({ type: pack('survey') })), /Teaches: not asked/);
  assert.ok(SYSTEM_PROMPT.includes(CLASSROOM_RULES)); assert.match(CLASSROOM_RULES, /never "Jeopardy"/);
});

// ---------------------------------------------------------------- the hand-off
test('POST /api/build/plan and the first build: a teacher\'s survey starts from the survey starter; a kid cannot ask for one', async () => {
  const t = await teacher.c('/api/build/plan', { method: 'POST', body: { plan: { type: pack('survey'), look: '3d', world: pack('castle-quest') } } });
  assert.equal(t.status, 200); assert.equal(t.json.engine, 'classroom'); assert.deepEqual(t.json.plan.type, pack('survey')); assert.equal(t.json.plan.world, null);
  assert.equal(t.json.text, 'Here is my game plan. Kind of game: Class survey.');
  const k = await kid.c('/api/build/plan', { method: 'POST', body: { plan: { type: pack('survey'), notes: 'about lunch' } } });
  assert.equal(k.json.plan.type, null, 'a kid\'s plan drops the teacher-only type');
  const build = async (c, p) => {
    const g = await c('/api/studio/new', { method: 'POST', body: {} });
    const r = await c(`/api/studio/${g.json.id}/chat`, { method: 'POST', body: { detach: true, plan: p } });
    assert.equal(r.status, 202, r.text); await runner.idle(g.json.id);
    const game = games.getGame(g.json.id); return game.current_version_id ? games.getVersion(game.current_version_id).html : '';
  };
  const survey = await build(teacher.c, { type: pack('survey') });
  assert.match(survey, /const QUESTIONS = \[/); assert.match(survey, /minShown: 5,/);
  const bingo = await build(kid.c, { type: pack('bingo'), look: '2d', characters: [pack('triceratops')] });
  assert.match(bingo, /const ITEMS = \[/); assert.doesNotMatch(bingo, /friends2d|hero2d/, 'no sprites forced into a classroom starter');
});

// ---------------------------------------------------------------- the survey's safety
test('class survey: only counts, on the device; BRB.poll stays refused on the server for a teacher\'s Builder game', async () => {
  const html = loadTemplate('survey'), code = html.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');   // comments say what it never does
  assert.doesNotMatch(code, /BRB\s*\.\s*poll|BRB\s*\.\s*storage|localStorage|sessionStorage|<input|<textarea|contenteditable/, 'no poll, no saving, no typing');
  assert.match(html, /^  minShown: (\d+),$/m); assert.equal(+/^  minShown: (\d+),$/m.exec(html)[1], polls.MIN_SHOWN, 'the same threshold as game polls');
  assert.match(html, /const S = \{ screen: 'start', mode: '', i: 0, counts: \[\] \};/, 'the state is counts only');
  // a published Builder survey owned by a teacher: the poll endpoint still answers 404 (POLL_GAMES: official games only)
  const g = games.createGame(teacher.user.id, { title: 'Class Survey' }), v = games.addVersion(g.id, html, { safetyStatus: 'pass' });
  q.run("UPDATE games SET status='published', published_version_id=?, current_version_id=? WHERE id=?", v.id || v, v.id || v, g.id);
  for (const c of [teacher.c, kid.c]) {
    const r = await c(`/api/games/${g.id}/poll`, { method: 'POST', body: { item: 'q1', choice: 0 } });
    assert.equal(r.status, 404);
  }
  assert.equal(q.get('SELECT COUNT(*) n FROM game_poll_votes WHERE game_id=?', g.id).n, 0);
  assert.equal(polls.POLL_GAMES.has('class-survey'), false);
});

// ---------------------------------------------------------------- the starters
test('the classroom starters: scanned clean, small, CONFIG one key per line, WORDS in every site language, no names asked', async () => {
  const scriptOf = h => h.match(/<script>\n([\s\S]*?)<\/script>/)[1];
  const tableKeys = (src, code) => { const m = src.match(new RegExp(`^ {2}(?:'${code}'|${code}): \\{ (.*) \\},$`, 'm')); return m ? [...m[1].matchAll(/(?:^|, )(\w+): '/g)].map(x => x[1]).sort() : null; };
  for (const key of CLASSROOM_TEMPLATE_KEYS) {
    const t = TEMPLATES.find(x => x.key === key); assert.ok(t && t.builderOnly && t.classroom, key);
    assert.ok(await templateInfo(key), `${key}: catalogue info`);
    const html = loadTemplate(key), src = scriptOf(html), scan = scanVersion(html);
    assert.equal(scan.status, 'pass', `${key} ${JSON.stringify(scan.issues)}`); assert.deepEqual(scan.lint, []);
    assert.ok(Buffer.byteLength(html) < 60 * 1024, `${key} is small`);
    assert.match(html, /^<title>[^<]+<\/title>\n<style>/); assert.doesNotMatch(html, /<!doctype|<html\b|<head[\s>]|<body\b|oomba-kit/i);
    for (const line of src.match(/const CONFIG = \{\n([\s\S]*?)\n\};/)[1].split('\n')) assert.match(line, /^ {2}\w+: .+,$/, `${key}: "${line}"`);
    assert.match(src, /^ {2}lang: 'en',$/m, `${key}: CONFIG.lang`);
    const en = tableKeys(src, 'en'); assert.ok(en && en.length >= 8, `${key}: WORDS.en`);
    for (const c of CODES.filter(c => c !== 'en' && c !== 'en-GB')) assert.deepEqual(tableKeys(src, c), en, `${key}: WORDS.${c}`);
    assert.match(src, /window\.__brbTest = \{ state: /); assert.match(html, /id="sound"/); assert.match(html, /id="full"/);
    const code = html.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');   // comments may say what it never does
    assert.doesNotMatch(code, /jeopardy|getUserMedia|BRB\s*\.\s*poll|fetch\(|your name|student name/i, key);
    // read-aloud: only CONFIG strings as written (never a line put together)
    for (const m of src.matchAll(/say\(([^)]*)\)/g)) assert.doesNotMatch(m[1], /\+|`/, `${key}: say(${m[1]})`);
  }
  // the quiet game listens like the official noise meters do, after the tap, with their words, and so the page may listen
  const quiet = loadTemplate('quiet');
  assert.match(quiet, /LD\.start\(\)/); assert.match(quiet, /'The game only listens for how loud it is\. Nothing is recorded or saved\.'/);
  assert.match(quiet, /timer: 'Use it as a quiet timer'/);
  assert.equal(micGame({ slug: 'my-quiet', status: 'draft' }, quiet), true);
  // the exit ticket submits no score
  assert.match(loadTemplate('exitticket'), /B\.gameOver\(\{ won: true, score: null \}\)/);
});

test('every language has the new setup words, and no UI word says "Jeopardy"', () => {
  const locale = code => flatten(JSON.parse(fs.readFileSync(path.join(ROOT, 'server/i18n/locales', `${code}.json`), 'utf8')));
  const en = locale('en');
  const keys = [...STARTERS.flatMap(id => [`buildSetup.types.${id}.title`, `buildSetup.types.${id}.text`]), ...['label', 'class', 'games', 'classText', 'gamesText'].map(k => `buildSetup.typeGroups.${k}`), 'js.buildsetup.progress'];
  for (const code of CODES.filter(c => c !== 'en-GB')) {
    const loc = locale(code);
    for (const k of keys) { assert.ok(typeof loc[k] === 'string' && loc[k].trim(), `${code} ${k}`); assert.doesNotMatch(loc[k], /jeopardy/i); }
    if (code !== 'en') assert.ok(keys.filter(k => loc[k] === en[k]).length <= 2, `${code}: translated`);
    assert.match(loc['js.buildsetup.progress'], /\{n\}/); assert.match(loc['js.buildsetup.progress'], /\{total\}/);
  }
  assert.equal(en['buildSetup.types.categories.title'], 'Category Board');
});
