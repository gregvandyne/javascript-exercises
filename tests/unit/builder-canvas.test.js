// Classroom activity vs Arcade game (docs/decisions.md): the start card each viewer gets, the class link (only for a
// class this user teaches, and only its grade reaches the plan), the canvas plan and engine, the CANVAS RULES (sent only
// for canvas builds: the arcade prompt is untouched), the activity starter, the self-test refusing a broken version,
// the mock Builder's activity build end to end, and the Studio's activity line.
process.env.BRB_DB = ':memory:';
process.env.BRB_SILENT = '1';
process.env.LOG_REQUESTS = '0';
process.env.BRB_MOCK_DELAY_MS = '0';
process.env.BRB_DATA_DIR = (await import('node:os')).tmpdir() + '/brb-canvas-test-' + process.pid;
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const { config } = await import('../../server/config.js');
config.builderFullForAll = false; config.anthropicKey = '';
const { createApp } = await import('../../server/app.js');
const games = await import('../../server/services/games.js');
const S = await import('../../server/services/schools.js');
const auth = await import('../../server/auth.js');
const { q, now } = await import('../../server/db.js');
const { loadChat } = await import('../../server/builder/chat.js');
const runner = await import('../../server/builder/runner.js');
const plan = await import('../../server/builder/plan.js');
const prompt = await import('../../server/builder/prompt.js');
const { toolbox } = await import('../../server/builder/tools.js');
const autotest = await import('../../server/builder/autotest.js');
const { loadTemplate } = await import('../../server/builder/templates/index.js');
const { BUILDER_TEMPLATE_KEYS, CANVAS_TEMPLATE_KEYS } = await import('../../server/builder/catalog.js');
const { canvasVersion, activityData, withActivityData, canvasTag, CANVAS_LATEST } = await import('../../server/services/canvaskit.js');
const { fileText: canvasRulesText } = await import('../../scripts/build-canvas-rules.js');
const { tFor, CODES } = await import('../../server/i18n/index.js');
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
const kid = await signup('CanvasKid');
const teacher = await signup('CanvasTeacher'), other = await signup('OtherTeacher');
const school = S.createSchool(teacher.user, { name: 'Canvas School' }).school;
for (const u of [teacher.user, other.user]) q.run('INSERT OR IGNORE INTO school_members(school_id, user_id, role, joined_at) VALUES (?,?,?,?)', school.id, u.id, 'teacher', now());
const cls = S.createClass(teacher.user, school.id, { name: '4B', grade: '4', teacherId: teacher.user.id }).class;
const otherSchool = S.createSchool(other.user, { name: 'Other School' }).school;
const theirs = S.createClass(other.user, otherSchool.id, { name: '2C', grade: '2' }).class;
const pageData = h => JSON.parse(/<script type="application\/json" id="page-data">([\s\S]*?)<\/script>/.exec(h)[1]);

// ---------------------------------------------------------------- which card starts selected, and the engine
test('planEngine: canvas for the teacher default, the class link and a kid who picks it; arcade for the kid default', () => {
  const kindPlan = kind => plan.normalisePlan(kind === 'activity' ? { kind, topic: { id: 'equivFractions' } } : { kind, type: { from: 'pack', id: 'quiz' } }, { forKid: true });
  assert.equal(plan.startKind({ teacher: true }), 'activity', 'every teacher');
  assert.equal(plan.startKind({ teacher: false, forClass: true }), 'activity', 'opened from a class');
  assert.equal(plan.startKind({ teacher: false }), 'arcade', 'kids and families');
  assert.equal(plan.planEngine(kindPlan(plan.startKind({ teacher: true }))).engine, 'canvas');
  assert.equal(plan.planEngine(kindPlan(plan.startKind({ forClass: true }))).engine, 'canvas');
  assert.equal(plan.planEngine(kindPlan('activity')).engine, 'canvas', 'a kid who picks Classroom activity');
  assert.equal(plan.planEngine(kindPlan(plan.startKind({ teacher: false }))).engine, '2d', 'a kid\'s default: an arcade game, as before');
  const p = plan.normalisePlan({ kind: 'activity', topic: { id: 'fractionsLine' }, support: 'count', played: 'board', grade: 'Grade 4', classId: 'abc', students: ['Ana'], type: { from: 'pack', id: 'runner' } });
  assert.deepEqual({ kind: p.kind, topic: p.topic, tool: p.tool, support: p.support, played: p.played, grade: p.grade, type: p.type }, { kind: 'activity', topic: { id: 'fractionsLine' }, tool: 'numberline.point', support: 'count', played: 'board', grade: '4', type: null });
  assert.ok(!('classId' in p) && !('students' in p), 'nothing about the class but its grade');
  const typed = plan.normalisePlan({ kind: 'activity', topic: { id: 'nope', text: '  Halves   and quarters ' }, support: 'loud', played: 'live' });
  assert.deepEqual([typed.topic, typed.tool, typed.support, typed.played], [{ text: 'Halves and quarters' }, '', 'guided', 'devices'], 'typed words are trimmed; unknown ids dropped');
  assert.equal(plan.liveNot(p), 'canvas', 'activities are not live yet');
});
test('the plan for the model: SETUP CHOICES name the canvas tool and its generator; the sentence has only topic and grade', () => {
  const p = plan.normalisePlan({ kind: 'activity', topic: { id: 'equivFractions' }, support: 'guided', played: 'devices', grade: '4', forClass: true });
  const note = plan.planNote(p);
  assert.match(note, /CLASSROOM ACTIVITY on Oomba Canvas/); assert.match(note, /start_from_template "canvas"/); assert.match(note, /"tool":"fractions\.equiv"/);
  assert.match(note, /never write a checker of your own|never add the kit/i);
  assert.equal(plan.planSentence(p, tFor('en')), 'Here is my plan: a classroom activity. For grade 4. Practice: Equivalent fractions. Students use it on their own devices. Help: Guided.');
  assert.doesNotMatch(plan.planSentence(p, tFor('en')) + note, /4B|CanvasTeacher/, 'never the class name or the teacher');
  const st = {}; assert.equal(plan.engineFor(st, p, '', null), null);
  assert.equal(st.canvas, true); assert.equal(st.fromClass, true); assert.equal(st.wantsLive, undefined);
  assert.match(plan.planBrief(p), /CLASSROOM ACTIVITY/);
  const data = plan.canvasActivity(p, tFor('en'));
  assert.deepEqual([data.config.support, data.config.board, data.gen.tool, data.task.title], ['guided', false, 'fractions.equiv', 'Equivalent fractions']);
});

// ---------------------------------------------------------------- the prompt
test('the arcade prompt is unchanged: SYSTEM_PROMPT and TOOLS never name the canvas; the CANVAS RULES go only with canvas builds', () => {
  assert.doesNotMatch(prompt.SYSTEM_PROMPT, /CANVAS RULES|Oomba Canvas|oomba-canvas|"canvas"|classroom activit/i);
  assert.doesNotMatch(JSON.stringify(prompt.TOOLS), /canvas/i, 'the cached tool list keeps the arcade starters only');
  assert.deepEqual(BUILDER_TEMPLATE_KEYS.filter(k => CANVAS_TEMPLATE_KEYS.includes(k)), []);
  assert.match(prompt.CANVAS_RULES, /^CANVAS RULES/); assert.ok(prompt.CANVAS_RULES.includes(canvasTag()));
  assert.equal(fs.readFileSync(path.join(ROOT, 'server/builder/canvas-rules.js'), 'utf8'), canvasRulesText(), 'canvas-rules.js is up to date (node scripts/build-canvas-rules.js)');
  // when it is sent: a canvas plan's state, an activity version, or the Studio's fixed message (any language)
  const arcade = { html: '<script src="/vendor/oomba-kit/1.1.6/oomba-kit.js"></script>' }, activity = { html: loadTemplate('canvas') };
  assert.equal(prompt.wantsCanvas({}, 'make a runner game', null), false);
  assert.equal(prompt.wantsCanvas({}, 'make it harder', arcade), false);
  assert.equal(prompt.wantsCanvas({ canvas: true }, 'hi', null), true);
  assert.equal(prompt.wantsCanvas({}, 'make it harder', activity), true);
  for (const code of CODES) { const st = {}; assert.equal(prompt.wantsCanvas(st, tFor(code)('studio.canvasLine.toCanvasAsk'), arcade), true, code); assert.equal(st.canvas, true); }
  const st = { canvas: true }; prompt.wantsCanvas(st, tFor('fr')('studio.canvasLine.toArcadeAsk'), activity); assert.equal(st.canvas, undefined, 'the switch back clears it');
  const claude = fs.readFileSync(path.join(ROOT, 'server/builder/claude.js'), 'utf8');
  assert.match(claude, /wantsCanvas\(st, ctx\.text, cur\) \? \[\{ type: 'text', text: CANVAS_RULES \}\]/, 'one block, no cache point of its own, only when wantsCanvas');
});

test('the CANVAS RULES tell the Builder that lesson activities keep worksheets by themselves (Oomba Canvas 1.4.0)', () => {
  const r = prompt.CANVAS_RULES;
  assert.match(r, /- Saved worksheets \(1\.4\.0\): every lesson activity a teacher builds with questions lets them save worksheets, and the kit does all of it/);
  assert.match(r, /"Save as worksheet"/); assert.match(r, /"My worksheets"/); assert.match(r, /class code/);
  assert.match(r, /keep every question as data in the oc-activity block/);
  assert.match(r, /never build saving, class codes, links, a worksheet list or a print button of your own/);
  assert.match(r, /New activities use Oomba Canvas 1\.4\.1/, 'the newest kit (1.4.0\'s worksheets with 1.4.1\'s phone layout)');
  assert.ok(r.includes(canvasTag('1.4.1')), 'the pinned tag is the 1.4.1 one');
  assert.match(fs.readFileSync(path.join(ROOT, 'docs/canvas-api.md'), 'utf8'), /<!-- builder:rules -->[\s\S]*Saved worksheets \(1\.4\.0\)[\s\S]*<!-- \/builder -->/, 'generated from the page');
  assert.doesNotMatch(prompt.SYSTEM_PROMPT, /Save as worksheet|My worksheets/, 'the arcade prompt is untouched');
});

// ---------------------------------------------------------------- the starter, the self-test, the save
test('the activity starter: pinned tag, data as JSON, scanned clean, and it passes the self-test', async () => {
  const html = loadTemplate('canvas');
  assert.equal(canvasVersion(html), CANVAS_LATEST); assert.equal(CANVAS_LATEST, '1.4.1', 'new activities pin Oomba Canvas 1.4.1 (worksheets and the phone layout)');
  assert.ok(activityData(html).data.problems.length >= 3);
  assert.deepEqual(autotest.canvasSelfTest(html), { ok: true, problems: [] });
  assert.equal(autotest.canvasSelfTest('<p>arcade</p>'), null);
  const { scanVersion } = await import('../../server/services/scanner.js');
  assert.equal(scanVersion(html).status, 'pass', JSON.stringify(scanVersion(html).issues));
  assert.doesNotMatch(html, /BRB\.gameOver|<input|localStorage/, 'the kit reports results; no text field');
});
test('a version whose self-test fails is not saved (so it can never be published), and the model is told which problem', async () => {
  const g = games.createGame(teacher.user.id, { title: 'Act', icon: '🧮', cover: 'mint' });
  const events = [], tb = toolbox({ user: teacher.user, gameId: g.id, emit: (n, d) => events.push([n, d]), state: {}, locale: 'en' });
  const good = await tb.exec('start_from_template', { template: 'canvas' });
  assert.equal(good.ok, true, good.forModel); assert.match(good.forModel, /Oomba Canvas/);
  const cur = tb.current(), data = activityData(cur.html).data;
  const broken = withActivityData(cur.html, { ...data, problems: [...data.problems, { tool: 'fractions.equiv', from: [5, 6], to: 4 }] });
  const r = tb.exec('write_game', { html: broken, notes: 'oops' });
  assert.equal(r.ok, false); assert.match(r.forModel, /Not saved: the classroom activity's self-test failed\. problem 6: cannot be solved: 5\/6 cannot be made with pieces of 1\/4/);
  assert.equal(games.getGame(g.id).current_version_id, cur.id, 'the broken version never became a version');
  const rep = autotest.buildReport({ shots: [], events: [], readings: [], errors: [] }, { html: broken, version: 3 });
  assert.ok(rep.issues.some(i => i.key === 'canvas' && !i.soft && /problem 6/.test(i.text)), 'the playtest report names it too');
  const fixed = tb.exec('write_game', { html: withActivityData(cur.html, { ...data, gen: { tool: 'digits.add', digits: 2 } }), notes: 'gen' });
  assert.equal(fixed.ok, true, fixed.forModel);
});

// ---------------------------------------------------------------- the page
test('/build/new: both cards; Classroom activity for a teacher and from their class (its grade only), Arcade game for a kid; no topic chips', async () => {
  const k = (await kid.c('/build/new')).text, t = (await teacher.c('/build/new')).text;
  for (const h of [k, t]) {
    assert.match(h, /What are you making\?/); assert.match(h, /data-kind="activity"/); assert.match(h, /data-kind="arcade"/);
    assert.match(h, /data-kind="classgame"/);
    assert.match(h, />Classroom lesson</); assert.match(h, />Classroom game</); assert.match(h, />Arcade game</);
    assert.doesNotMatch(h, /id="su-tools"/, 'Classroom game is its own card now, not a link');
    assert.ok(h.includes('data-screen="lesson"') && h.includes('data-screen="help"') && h.includes('data-screen="use"'));
    assert.ok(!h.includes('data-screen="played"') && !h.includes('data-screen="purpose"'), 'no "How will it be played?" or "What is it for?" step for an activity');
    // the owner's change: one text box, no starter chips ("Even and odd", "Order numbers", "Add in columns"...)
    assert.doesNotMatch(h, /data-topic=|class="su-chips"|>Even and odd<|>Order numbers<|>Add in columns</, 'no topic chips');
    assert.doesNotMatch(h, /id="su-topic-in"|What should students practice\?/, 'no topic box on the first step: "Your lesson" asks for it all');
    assert.equal(pageData(h).canvas.topics, undefined, 'CANVAS_TOPICS are not in the page');
    // "How much help?": four checkboxes, Guided ticked to start
    const boxes = [...h.matchAll(/<input type="checkbox" class="sr-only su-cbox" data-help="(\w+)" value="\w+"( checked)?>/g)].map(m => [m[1], !!m[2]]);
    assert.deepEqual(boxes, [['watch', false], ['count', false], ['guided', true], ['own', false]]);
  }
  assert.match(t, /id="su-lfile"/, 'a teacher may add a lesson file'); assert.doesNotMatch(k, /id="su-lfile"/, 'a kid never uploads here (their own work)');
  assert.match(k, /id="su-ltext"/, 'everyone may describe what they want');
  assert.match(t, /Don&#39;t include student names or work\. We remove any we find\./);
  assert.ok(pageData(t).lesson.file && pageData(k).lesson.file === null);
  assert.match(k, /data-kind="arcade" aria-pressed="true"/); assert.equal(pageData(k).canvas.kind, 'arcade');
  assert.match(t, /data-kind="activity" aria-pressed="true"/); assert.equal(pageData(t).canvas.kind, 'activity');
  assert.doesNotMatch(t, /class="su-for"/, 'no class chip without a class');
  const c = (await teacher.c(`/build/new?for=class&class=${cls.id}`)).text;
  assert.match(c, /data-kind="activity" aria-pressed="true"/);
  assert.match(c, /<span class="su-for">[\s\S]*?For 4B · Grade 4<\/span>/); assert.match(c, /Make something for your class/);
  const d = pageData(c);
  assert.deepEqual(d.canvas, { kind: 'activity', supports: ['watch', 'count', 'guided', 'own'], help: ['guided'], uses: ['screen', 'worksheet'], use: ['screen'], grade: '4', forClass: true });
  assert.doesNotMatch(JSON.stringify(d), new RegExp(cls.id), 'the class id is not in the page data the plan is made from');
  assert.match(c, new RegExp(`href="/class/${cls.id}"`), 'the way back is the class');
  // a class this user does not teach: the page opens as usual (no grade, no chip)
  const x = (await teacher.c(`/build/new?for=class&class=${theirs.id}`)).text;
  assert.doesNotMatch(x, /class="su-for"/); assert.equal(pageData(x).canvas.grade, ''); assert.doesNotMatch(x, /2C/);
  // the class page's Build buttons carry the class
  const page = (await teacher.c(`/class/${cls.id}`)).text;
  assert.ok(page.includes(`/build/new?for=class&amp;class=${cls.id}`), 'class page: Build carries ?for=class');
});
test('POST /api/build/plan and the first build: an activity plan builds an Oomba Canvas activity with the mock Builder', async () => {
  const body = { kind: 'activity', topic: { id: 'multiplyOne' }, support: 'count', played: 'devices', grade: '4', forClass: true };
  const r = await teacher.c('/api/build/plan', { method: 'POST', body: { plan: body } });
  assert.equal(r.json.engine, 'canvas'); assert.match(r.json.text, /Practice: Multiply by one digit\./);
  const g = await teacher.c('/api/studio/new', { method: 'POST', body: {} });
  const sent = await teacher.c(`/api/studio/${g.json.id}/chat`, { method: 'POST', body: { detach: true, plan: body } });
  assert.ok([200, 202].includes(sent.status), sent.text);
  await runner.idle(g.json.id);
  const game = games.getGame(g.json.id), v = games.getVersion(game.current_version_id);
  assert.equal(canvasVersion(v.html), CANVAS_LATEST); assert.equal(v.safety_status, 'pass');
  const data = activityData(v.html).data;
  assert.deepEqual([data.gen.tool, data.config.support, data.config.supports], ['digits.mul', 'count', ['count']], 'an older page\'s single support: that one mode only');
  assert.deepEqual(autotest.canvasSelfTest(v.html), { ok: true, problems: [] });
  const chat = loadChat(g.json.id);
  assert.equal(chat.state.canvas, true);
  // the Studio's line: an activity, results to Progress, and the switch to an arcade game (a fixed message)
  const st = (await teacher.c(`/api/studio/${g.json.id}`)).json;
  assert.deepEqual(st.canvasLine, { kind: 'activity', label: 'Classroom activity · results go to Progress', button: 'Make it an arcade game', ask: tFor('en')('studio.canvasLine.toArcadeAsk') });
  assert.match(st.liveClass ? st.liveClass.why : 'Classroom activities can\'t be played live yet.', /can't be played live yet/);
  // "I know what I want" with Classroom activity: the activity starter
  const d = await teacher.c('/api/studio/new', { method: 'POST', body: { template: 'canvas' } });
  assert.equal(d.status, 200); assert.equal(canvasVersion(games.getVersion(games.getGame(d.json.id).current_version_id).html), CANVAS_LATEST);
});
test('every language has the new words of the start, the activity steps and the Studio line', () => {
  const keys = ['buildSetup.kind.heading', 'buildSetup.kind.activity.title', 'buildSetup.kind.arcade.title', 'buildSetup.kind.classgame.title', 'buildSetup.kind.classgame.text', 'buildSetup.start.direct', 'buildSetup.canvas.practise.heading', 'buildSetup.canvas.practise.privacy',
    ...plan.SUPPORTS.map(s => `buildSetup.canvas.help.${s}.title`), 'buildSetup.lesson.heading', 'buildSetup.lesson.safe', 'buildSetup.lesson.fileText', ...plan.LESSON_HEADS.flatMap(k => [`buildSetup.lesson.heads.${k}`, `buildSetup.lesson.prompt.${k}`]),
    'js.buildsetup.lesson.readPages', 'js.buildsetup.lesson.err.docBig', 'js.buildsetup.lesson.err.docType', 'js.buildsetup.lesson.linePages', 'js.buildsetup.lesson.lineCut', 'buildSetup.plan.toldHelp', 'buildSetup.plan.toldReset', 'js.buildsetup.canvas.rows.lesson', ...plan.CANVAS_USES.flatMap(s => [`buildSetup.canvas.use.${s}.title`, `buildSetup.canvas.use.${s}.text`, `buildSetup.say.use.${s}`, `js.buildsetup.canvas.use.${s}`]), 'buildSetup.canvas.use.heading', 'buildSetup.canvas.use.note', 'buildSetup.say.use.both', 'buildSetup.say.fresh', 'js.buildsetup.canvas.use.both', 'js.buildsetup.canvas.rows.use', ...plan.CANVAS_TOPICS.map(x => `buildSetup.canvas.topics.${x.id}`),
    'buildSetup.say.activity', 'buildSetup.play.why.canvas', 'studio.canvasLine.activity', 'studio.canvasLine.toArcadeAsk', 'studio.canvasLine.toCanvasAsk', 'js.buildsetup.canvas.rows.practise'];
  for (const code of CODES) for (const k of keys) assert.ok(tFor(code).has(k) || code === 'en-GB', `${code} ${k}`);
  for (const code of CODES.filter(c => !c.startsWith('en'))) assert.notEqual(tFor(code)('buildSetup.kind.activity.title'), 'Classroom activity', code);
  for (const code of CODES) for (const w of ['Pro', 'Jeopardy', 'Cuisenaire']) assert.ok(!keys.some(k => new RegExp(`\\b${w}\\b`).test(tFor(code)(k))), `${code}: no "${w}"`);
});
