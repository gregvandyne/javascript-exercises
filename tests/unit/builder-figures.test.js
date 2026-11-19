// Figures in the Builder (docs/figures-api.md) and "What is it for?" (docs/canvas-api.md "Printing"): the FIGURE RULES
// go only with builds that call for figures (in any site language, a plan's flag, or a version that loads them) and the
// arcade prompt stays byte for byte the same; the setup's purpose step, its normalising and the plan summary; the
// self-test's answer-key checks; the mock Builder's figure activity end to end; printing (the answer key for the
// activity's maker and school staff, never a student); the playtest's figure check.
process.env.BRB_DB = ':memory:';
process.env.BRB_SILENT = '1';
process.env.LOG_REQUESTS = '0';
process.env.BRB_MOCK_DELAY_MS = '0';
process.env.BRB_ALL_LOCALES = '1';
process.env.BRB_DATA_DIR = (await import('node:os')).tmpdir() + '/brb-figures-test-' + process.pid;
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const { config } = await import('../../server/config.js');
config.builderFullForAll = false; config.anthropicKey = '';
const { createApp } = await import('../../server/app.js');
const games = await import('../../server/services/games.js');
const S = await import('../../server/services/schools.js');
const auth = await import('../../server/auth.js');
const { q, now } = await import('../../server/db.js');
const runner = await import('../../server/builder/runner.js');
const plan = await import('../../server/builder/plan.js');
const prompt = await import('../../server/builder/prompt.js');
const autotest = await import('../../server/builder/autotest.js');
const { figureWords } = await import('../../server/builder/figures.js');
const { canvasVersion, activityData, withActivityData, canvasTag, canvasKit, selfTestHtml } = await import('../../server/services/canvaskit.js');
const { figTag, figTags, FIG_LATEST } = await import('../../server/services/figlibs.js');
const { scanVersion } = await import('../../server/services/scanner.js');
const { fileText: figureRulesText } = await import('../../scripts/build-figure-rules.js');
const { tFor, CODES, lookup } = await import('../../server/i18n/index.js');
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
const teacher = await signup('FigureTeacher'), kid = await signup('FigureKid');
const school = S.createSchool(teacher.user, { name: 'Figure School' }).school;
q.run('INSERT OR IGNORE INTO school_members(school_id, user_id, role, joined_at) VALUES (?,?,?,?)', school.id, teacher.user.id, 'teacher', now());
const pageData = h => JSON.parse(/<script type="application\/json" id="page-data">([\s\S]*?)<\/script>/.exec(h)[1]);

// ---------------------------------------------------------------- the FIGURE RULES
test('the arcade prompt is unchanged: SYSTEM_PROMPT and TOOLS keep their hash and never name the figures', () => {
  const h = crypto.createHash('sha256').update(`${prompt.SYSTEM_PROMPT}\n${JSON.stringify(prompt.TOOLS)}`).digest('hex');
  assert.equal(h, '7f22004cb7032aea33c1fcdffae0e9db82b625c223bb7ec81752341492b26d8a');
  assert.doesNotMatch(prompt.SYSTEM_PROMPT + JSON.stringify(prompt.TOOLS), /FIGURE RULES|Oomba Figures|oomba-figures|jsxgraph|smiles/i);
});
test('FIGURE_RULES: made from docs/figures-api.md, with the pinned tags, the API and "correct to scale"; CANVAS RULES point to it', () => {
  assert.equal(fs.readFileSync(path.join(ROOT, 'server/builder/figure-rules.js'), 'utf8'), figureRulesText(), 'figure-rules.js is up to date (node scripts/build-figure-rules.js)');
  assert.match(prompt.FIGURE_RULES, /^FIGURE RULES/);
  assert.ok(prompt.FIGURE_RULES.includes(figTags()), 'the three pinned tags');
  assert.match(prompt.FIGURE_RULES, /Correct to scale/); assert.match(prompt.FIGURE_RULES, /Never draw one by hand/); assert.match(prompt.FIGURE_RULES, /never load another library/);
  for (const k of ['freeBody', 'rays', 'circuit', 'bohr', 'orbitals', 'lewis', 'reading', 'titration', 'halfLife', 'motionGraph', 'grid', 'vectors', 'inclinedPlane', 'pulley']) assert.match(prompt.FIGURE_RULES, new RegExp(`\\b${k}\\b`), k);
  assert.match(prompt.CANVAS_RULES, /FIGURE RULES/); assert.match(prompt.CANVAS_RULES, /config\.purpose|purpose: what it is for/);
  const claude = fs.readFileSync(path.join(ROOT, 'server/builder/claude.js'), 'utf8');
  assert.match(claude, /wantsFigures\(st, ctx\.text, cur, ctx\.plan\) \? \[\{ type: 'text', text: FIGURE_RULES \}\]/, 'one block, no cache point of its own, only when wantsFigures');
});
test('FIGURE_RULES are sent only for figure builds, in every site language', () => {
  const yes = ['Make a free-body diagram quiz', 'ray diagrams for converging lenses', 'Bohr models of the first 20 elements', 'reading a measuring cylinder', 'titration curves',
    'diagramme des forces sur un plan incliné', 'Kräfte und Vektoren', 'circuito en serie con resistencias', 'grafico distanza-tempo', 'Modelo atómico de Bohr', 'stroomkring met weerstand',
    'сила тяжести и вектор', '光の屈折とレンズ', '電路與電阻', 'مخطط القوى على مستوى مائل', 'מעגל חשמלי עם נגד חשמלי'];
  const no = ['make a runner game with coins', 'a quiz about capital cities', 'spelling words for week 3', 'un juego de carreras', 'Это лучше всего', 'a paragraph about cats'];
  for (const t of yes) assert.equal(prompt.wantsFigures({}, t, null, null), true, t);
  for (const t of no) assert.equal(prompt.wantsFigures({}, t, null, null), false, t);
  const st = {}; prompt.wantsFigures(st, 'add a Bohr model', null, null); assert.equal(st.figures, true, 'remembered for later turns');
  assert.equal(prompt.wantsFigures(st, 'make it harder', null, null), true);
  assert.equal(prompt.wantsFigures({}, 'make it harder', { html: `<p>x</p>${figTag('oomba-figures')}` }, null), true, 'a version that loads them');
  assert.equal(prompt.wantsFigures({}, 'hi', null, { figures: true }), true, 'the plan\'s flag');
});

// ---------------------------------------------------------------- the plan: purpose and the figures flag
test('purpose: normalised (missing is Practice on screen, unknown dropped, setup order), in the sentence, the note and the brief', () => {
  const p0 = plan.normalisePlan({ kind: 'activity', topic: { text: 'Fractions' } });
  assert.deepEqual(p0.purpose, ['screen'], 'missing: practice on screen');
  assert.deepEqual(plan.normalisePlan({ kind: 'activity', purpose: ['generator', 'print', 'worksheet', 'worksheet'] }).purpose, ['worksheet', 'generator']);
  assert.deepEqual(plan.normalisePlan({ kind: 'activity', purpose: [] }).purpose, ['screen'], 'never empty');
  assert.deepEqual(plan.normalisePlan({ kind: 'activity', purpose: 'worksheet' }).purpose, ['worksheet']);
  const p = plan.normalisePlan({ kind: 'activity', topic: { text: 'Forces on a ramp' }, purpose: ['screen', 'worksheet', 'generator'], grade: '8' });
  assert.equal(plan.planSentence(p, tFor('en')), 'Here is my plan: a classroom activity. For grade 8. Practice: Forces on a ramp. For: Practice on screen, Printable worksheet, and Question generator. Help: Guided. Students play it on their own devices.');
  assert.doesNotMatch(plan.planSentence(p0, tFor('en')), /For:/, 'the default adds nothing (older plans read as before)');
  assert.match(plan.planSentence(p, tFor('fr')), /Pour : /); assert.match(plan.planSentence(p, tFor('he')), /מטרה: /);
  const note = plan.planNote(p);
  assert.match(note, /config\.purpose \["screen","worksheet","generator"\]/); assert.match(note, /give a generator \("gen"\)/); assert.match(note, /Never build printing of your own/);
  assert.match(note, /Figures: .*FIGURE RULES/, 'the topic named forces');
  assert.match(plan.planBrief(p), /for screen, worksheet, generator \(config\.purpose\)/);
  assert.deepEqual(plan.canvasActivity(p, tFor('en')).config.purpose, ['screen', 'worksheet', 'generator']);
  assert.equal(plan.canvasActivity(p0, tFor('en')).config.purpose, undefined);
});
test('the figures flag comes from the topic, the lesson (and its file) or the note, in any language', () => {
  assert.equal(plan.normalisePlan({ kind: 'activity', topic: { text: 'Equivalent fractions' } }).figures, undefined);
  assert.equal(plan.normalisePlan({ kind: 'activity', topic: { text: 'Lentilles et rayons lumineux' } }).figures, true);
  assert.equal(plan.normalisePlan({ kind: 'activity', topic: { text: 'Chemistry' }, lesson: { text: 'Goal: draw Lewis structures for water and ammonia' } }).figures, true);
  assert.equal(plan.normalisePlan({ kind: 'activity', lesson: { doc: { name: 'plan.pdf', kind: 'pdf', pages: 1, text: 'Halbwertszeit und Zerfall' } } }).figures, true);
  assert.ok(figureWords('מדחום ומשורה'));
});
test('/build/new: the "What is it for?" step right after "Your lesson", three checkboxes, Practice on screen to start', async () => {
  const h = (await teacher.c('/build/new')).text, d = pageData(h);
  assert.deepEqual(d.canvas.purposes, ['screen', 'worksheet', 'generator']); assert.deepEqual(d.canvas.purpose, ['screen']);
  const order = [...h.matchAll(/data-screen="(lesson|purpose|help|played)"/g)].map(m => m[1]);
  assert.deepEqual(order, ['lesson', 'purpose', 'help', 'played']);
  const boxes = [...h.matchAll(/<input type="checkbox" class="sr-only su-pbox" data-purpose="(\w+)" value="\w+"( checked)?>/g)].map(m => [m[1], !!m[2]]);
  assert.deepEqual(boxes, [['screen', true], ['worksheet', false], ['generator', false]]);
  assert.match(h, /What is it for\?/); assert.match(h, /Printable worksheet/); assert.match(h, /Question generator/);
  assert.match(h, /id="su-purpose-one"[^>]*hidden>Pick at least one\./);
  const js = fs.readFileSync(path.join(ROOT, 'public/js/buildsetup.js'), 'utf8');
  assert.match(js, /CSTEPS = \['lesson', 'purpose', 'help', 'played'\]/); assert.match(js, /purpose: \[\.\.\.S\.sel\.purpose\]/); assert.match(js, /\['purpose', list\(/, 'a row on the plan summary');
  const r = await teacher.c('/api/build/plan', { method: 'POST', body: { plan: { kind: 'activity', topic: { text: 'Circuits' }, purpose: ['worksheet'] } } });
  assert.deepEqual(r.json.plan.purpose, ['worksheet']); assert.equal(r.json.plan.figures, true); assert.match(r.json.text, /For: Printable worksheet\./);
  for (const code of CODES) for (const k of ['buildSetup.canvas.purpose.heading', 'buildSetup.canvas.purpose.screen.title', 'buildSetup.canvas.purpose.worksheet.text', 'buildSetup.canvas.purpose.generator.title', 'buildSetup.say.purpose', 'js.buildsetup.canvas.rows.purpose', 'play.printCanvas.sheet', 'play.printCanvas.answer']) assert.ok(tFor(code)(k) && tFor(code)(k) !== k, `${code} ${k}`);
});

// ---------------------------------------------------------------- the self-test's answer key
const figQ = (o = {}) => ({ tool: 'figure.number', q: 'What is the net force?', fig: { kind: 'freeBody', forces: [{ name: 'F', dir: 'right', size: 10 }, { name: 'Ff', dir: 'left', size: 4 }] }, answer: 6, unit: 'N', work: ['10 N − 4 N', '= 6 N'], ...o });
const activityPage = (data, figs = true) => `<title>F</title>\n${figs ? `${figTag('oomba-figures')}\n` : ''}${canvasTag()}\n<div id="oc-app"></div>\n<script type="application/json" id="oc-activity">\n${JSON.stringify(data)}\n</script>\n<script>Oc.activity(JSON.parse(document.getElementById('oc-activity').textContent));</script>`;
test('the self-test: the answer key matches the worked answers, a sheet of N questions has N answers, figures are checked', () => {
  const base = { config: { count: 2, purpose: ['worksheet'] }, task: { title: 'Forces', say: 'Find each net force.' }, problems: [figQ(), figQ({ q: 'And this one?', answer: 3, work: ['5 N − 2 N = 3 N'] })] };
  assert.deepEqual(selfTestHtml(activityPage(base)), { ok: true, problems: [] });
  const wrongKey = selfTestHtml(activityPage({ ...base, problems: [figQ({ work: ['10 N − 4 N', '= 16 N'] })] }));
  assert.equal(wrongKey.ok, false); assert.match(wrongKey.problems[0].why, /worked answer must end on the answer: its last line does not say 6/);
  const noGen = selfTestHtml(activityPage({ ...base, config: { ...base.config, purpose: ['generator'] } }));
  assert.match(noGen.problems.map(p => p.why).join(';'), /purpose "generator" needs a generator/);
  const badPurpose = selfTestHtml(activityPage({ ...base, config: { ...base.config, purpose: ['poster'] } }));
  assert.match(badPurpose.problems[0].why, /purpose must be a list/);
  const noTag = selfTestHtml(activityPage(base, false));
  assert.match(noTag.problems[0].why, /does not load Oomba Figures/);
  const badFig = selfTestHtml(activityPage({ ...base, problems: [figQ({ fig: { kind: 'rays', type: 'convex-lens', f: 10, u: 10 } })] }));
  assert.match(badFig.problems[0].why, /its figure \(rays\): the object is at the focal point/);
  // a printed sheet of N has N answers, from the same deal as the kit's (the frozen file)
  const kit = canvasKit(), gen = { tool: 'figure.number', vars: { m: [2, 10], a: [1, 5] }, q: 'A {m} kg cart speeds up at {a} m/s². Net force?', fig: { kind: 'freeBody', label: '{m} kg', forces: [{ name: 'F', dir: 'right', size: '{=m*a}' }] }, answer: 'm*a', dp: 0, unit: 'N', work: ['F = {m} × {a} = {=m*a} N'] };
  const g = { config: { count: 5, purpose: ['worksheet', 'generator'] }, task: { title: 'F = ma' }, problems: [], gen };
  assert.deepEqual(selfTestHtml(activityPage(g)), { ok: true, problems: [] });
  for (const n of [1, 7, 30]) { const s = kit.sheet(g, { seed: 77, n }); assert.equal(s.items.length, n); assert.equal(s.items.filter(i => i.answer.length && i.work.length).length, n, `${n} answers`); }
  assert.deepEqual(kit.sheet(g, { seed: 77, n: 5 }), kit.sheet(g, { seed: 77, n: 5 }), 'the same number makes the same sheet');
  assert.notDeepEqual(kit.sheet(g, { seed: 78, n: 5 }).items, kit.sheet(g, { seed: 77, n: 5 }).items, 'a new sheet is a fresh set');
  const it = kit.sheet(g, { seed: 77, n: 1 }).items[0], [m, a] = it.task[0].match(/\d+/g).map(Number);
  assert.deepEqual([it.answer[0], it.work[0][0]], [`${m * a} N`, `F = ${m} × ${a} = ${m * a} N`], 'the key is worked from the same numbers');
});

// ---------------------------------------------------------------- the mock Builder, printing, the playtest
test('the mock Builder: a figure topic with a worksheet purpose builds a figure activity that scans clean and passes its self-test', async () => {
  const body = { kind: 'activity', topic: { text: 'Forces, atoms and readings' }, purpose: ['screen', 'worksheet'], help: ['guided'], played: 'devices', grade: '8' };
  const g = await teacher.c('/api/studio/new', { method: 'POST', body: {} });
  const sent = await teacher.c(`/api/studio/${g.json.id}/chat`, { method: 'POST', body: { detach: true, plan: body } });
  assert.ok([200, 202].includes(sent.status), sent.text);
  await runner.idle(g.json.id);
  const game = games.getGame(g.json.id), v = games.getVersion(game.current_version_id);
  assert.equal(canvasVersion(v.html), '1.3.0', 'new activities pin the newest kit'); assert.equal(scanVersion(v.html).status, 'pass', JSON.stringify(scanVersion(v.html).issues));
  assert.ok(v.html.indexOf(figTag('oomba-figures')) >= 0 && v.html.indexOf(figTag('oomba-figures')) < v.html.indexOf(canvasTag()), 'Oomba Figures first, then the kit');
  const d = activityData(v.html).data;
  assert.deepEqual(d.config.purpose, ['screen', 'worksheet']); assert.ok(d.problems.every(p => p.tool.startsWith('figure.') && p.fig));
  assert.deepEqual(autotest.canvasSelfTest(v.html), { ok: true, problems: [] });
  // print: the maker gets the key; a student never can
  const doc = { k: 'canvas', seed: 4821, n: 4, paper: 'a4', key: true };
  const mine = await teacher.c(`/api/games/${game.id}/print`, { method: 'POST', body: { doc, v: v.id } });
  assert.equal(mine.status, 200, mine.text);
  assert.match(mine.json.html, /data-questions="4" data-answers="4"/); assert.match(mine.json.html, /class="cwp-page cwp-key ocp-key"/); assert.match(mine.json.html, /Sheet 4821/);
  assert.equal((mine.json.html.match(/<li class="ocp-q"/g) || []).length, 4); assert.ok((mine.json.html.match(/<svg/g) || []).length >= 4, 'each figure, drawn in print');
  assert.doesNotMatch(mine.json.html, /FigureTeacher|<script/i, 'no names, no scripts');
  assert.equal((await teacher.c(`/api/games/${game.id}/print`, { method: 'POST', body: { doc: { ...doc, extra: '<b>' }, v: v.id } })).status, 400, 'numbers only');
  q.run("UPDATE games SET published_version_id=?, visibility='public', status='published' WHERE id=?", v.id, game.id);
  const theirs = await kid.c(`/api/games/${game.id}/print`, { method: 'POST', body: { doc } });
  assert.equal(theirs.status, 403); assert.equal(theirs.json.code, 'key');
  const sheet = await kid.c(`/api/games/${game.id}/print`, { method: 'POST', body: { doc: { ...doc, key: false } } });
  assert.equal(sheet.status, 200); assert.match(sheet.json.html, /data-answers="0"/); assert.doesNotMatch(sheet.json.html, /ocp-key/);
  assert.equal((await kid.c(`/api/games/${game.id}/print`, { method: 'POST', body: { doc, v: 'nope' } })).status, 404, 'a student cannot ask for another version');
  const playPage = pageData((await kid.c(`/play/${games.getGame(game.id).slug}`)).text);
  assert.equal(playPage.print, true, 'the play page prints for the frame');
  const games_ = fs.readFileSync(path.join(ROOT, 'server/routes/games.js'), 'utf8');
  assert.match(games_, /canvasPrintable\(v\.html\) \? \{ print: true, \.\.\.\(!tok\.st && canvasKeyFor\(u, g\) \? \{ printKey: true \} : \{\}\) \}/, 'INIT.printKey only for the maker and staff (and never under \"As a student\")');
  const sdk = fs.readFileSync(path.join(ROOT, 'public/sdk/brb-sdk.js'), 'utf8');
  assert.match(sdk, /canPrintKey: INIT\.print === true && INIT\.printKey === true/);
});
test('the playtest: a build with figures loads them only from the pinned tags and shows at least one <svg>', () => {
  const html = `<title>Q</title>${figTag('oomba-figures')}<div id="q"></div><script>document.getElementById('q').append(OF.draw('bohr',{element:'Na'}))</script>`;
  const raw = svgs => ({ shots: [{ at: 'start', moved: 0.2, same: 0.5 }, { at: 'play', moved: 0.2, same: 0.5 }], events: [{ type: 'brb:ready' }], readings: [{ state: null, nums: '', svgs }], s1: { state: null, svgs }, s2: { state: null, svgs }, errors: [] });
  assert.ok(!autotest.buildReport(raw(1), { html }).issues.some(i => i.key === 'figures'));
  assert.ok(autotest.buildReport(raw(0), { html }).issues.some(i => i.key === 'figures' && /no figure/.test(i.text)));
  const altered = html.replace(FIG_LATEST['oomba-figures'], '0.9.0');
  assert.ok(autotest.buildReport(raw(1), { html: altered }).issues.some(i => i.key === 'figures' && /pinned tags/.test(i.text)));
  assert.ok(!autotest.buildReport(raw(0), { html: '<p>plain</p><script>1</script>' }).issues.some(i => i.key === 'figures'));
});
