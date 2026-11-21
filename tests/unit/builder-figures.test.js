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
  for (const k of ['freeBody', 'rays', 'circuit', 'bohr', 'orbitals', 'lewis', 'reading', 'titration', 'halfLife', 'motionGraph', 'grid', 'vectors', 'inclinedPlane', 'pulley', 'numberLine', 'triangle', 'rectangle', 'parallelogram', 'trapezoid', 'kite', 'regularPolygon', 'angles', 'parallelLines', 'segmentAddition', 'circle', 'compositeShape', 'prism', 'cylinder', 'pyramid', 'cone', 'sphere', 'net', 'mappingDiagram']) assert.match(prompt.FIGURE_RULES, new RegExp(`\\b${k}\\b`), k);
  assert.match(prompt.CANVAS_RULES, /FIGURE RULES/); assert.match(prompt.CANVAS_RULES, /config\.purpose|purpose: what it is for/);
  const claude = fs.readFileSync(path.join(ROOT, 'server/builder/claude.js'), 'utf8');
  assert.match(claude, /wantsFigures\(st, ctx\.text, cur, ctx\.plan\) \? \[\{ type: 'text', text: FIGURE_RULES \}\]/, 'one block, no cache point of its own, only when wantsFigures');
});
test('FIGURE_RULES are sent only for figure builds, in every site language', () => {
  const yes = ['Make a free-body diagram quiz', 'ray diagrams for converging lenses', 'Bohr models of the first 20 elements', 'reading a measuring cylinder', 'titration curves',
    'diagramme des forces sur un plan incliné', 'Kräfte und Vektoren', 'circuito en serie con resistencias', 'grafico distanza-tempo', 'Modelo atómico de Bohr', 'stroomkring met weerstand',
    'сила тяжести и вектор', '光の屈折とレンズ', '電路與電阻', 'مخطط القوى على مستوى مائل', 'מעגל חשמלי עם נגד חשמלי',
    'graph inequalities on a number line', 'Brüche am Zahlenstrahl', 'fracciones en la recta numérica', 'droite graduée', '数直線', '數線上的分數', 'числовая прямая', 'خط الأعداد', 'ציר המספרים',
    'area of a triangle', 'Pythagorean theorem practice', 'regular hexagon apothem', 'área del triángulo rectángulo', 'aire du parallélogramme', 'Fläche von Dreieck und Trapez', 'area del rettangolo',
    'perímetro do retângulo', 'omtrek van een rechthoek', 'площадь треугольника', '三角形の面積', '平行四邊形的面積', 'مساحة المثلث', 'שטח של משולש',
    'vertical angles worksheet', 'parallel lines cut by a transversal', 'segment addition postulate', 'inscribed angles in a circle', 'area of a composite shape', 'graph a system of inequalities',
    'ángulos complementarios', 'droites parallèles et sécante', 'Kreis und Tangente', 'angoli alla circonferenza', 'ângulo inscrito', 'evenwijdige lijnen en een snijlijn', 'вписанный угол', '円周角', '圓周角', 'زاوية محيطية', 'זווית היקפית',
    'volume of a rectangular prism', 'slant height of a square pyramid', 'net of a cube', 'mapping diagrams and functions', 'measure with a ruler to the nearest centimeter', 'volumen del cilindro', 'patron du cube', 'Volumen des Zylinders', 'sviluppo piano del cubo', 'planificação do cubo', 'uitslag van een kubus', 'развёртка куба', '円柱の体積', '圓柱的體積', 'حجم الأسطوانة', 'פריסת קובייה'];
  const no = ['make a runner game with coins', 'a quiz about capital cities', 'spelling words for week 3', 'un juego de carreras', 'Это лучше всего', 'a paragraph about cats', 'the pyramids of Egypt', 'the northern hemisphere', 'solids, liquids and gases', 'the ruler of England', 'net income for the year', 'pine cones in autumn', '北半球の気候', 'die Pyramiden von Gizeh', 'Kugelschreiber kaufen', 'uitslag van de verkiezingen', 'полушарие мозга', 'финансовая пирамида', 'כדורגל בהפסקה', 'הגליל העליון', 'منشور على فيسبوك', 'el Cono Sur', 'סרגל כלים'];
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
  assert.equal(plan.planSentence(p, tFor('en')), 'Here is my plan: a classroom activity. For grade 8. Practice: Forces on a ramp. Students use it on their own devices and on paper. Help: Guided. Make a fresh set of questions whenever possible.');
  assert.equal(plan.planSentence(p0, tFor('en')), 'Here is my plan: a classroom activity. Practice: Fractions. Students use it on their own devices. Help: Guided.', 'the default promises no paper and no fresh sets (older plans read as before)');
  assert.match(plan.planSentence(p, tFor('fr')), /sur leurs propres appareils et sur papier/); assert.match(plan.planSentence(p, tFor('he')), /במכשירים שלהם ועל דף/);
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
test('/build/new: "How will students use it?" right after "Your lesson", two checkboxes, On their devices to start; no generator card', async () => {
  const h = (await teacher.c('/build/new')).text, d = pageData(h);
  assert.deepEqual(d.canvas.uses, ['screen', 'worksheet']); assert.deepEqual(d.canvas.use, ['screen'], 'On their devices to start');
  const order = [...h.matchAll(/data-screen="(lesson|use|purpose|help|played)"/g)].map(m => m[1]);
  assert.deepEqual(order, ['lesson', 'use', 'help']);
  const boxes = [...h.matchAll(/<input type="checkbox" class="sr-only su-pbox" data-use="(\w+)" value="\w+"( checked)?>/g)].map(m => [m[1], !!m[2]]);
  assert.deepEqual(boxes, [['screen', true], ['worksheet', false]]);
  assert.match(h, /<h1 id="su-h-use" tabindex="-1">How will students use it\?<\/h1>/); assert.match(h, />On their devices</); assert.match(h, />On paper</);
  assert.doesNotMatch(h, /Question generator|What is it for\?|data-purpose=/);
  assert.match(h, /aria-describedby="su-hint-use su-use-note"/);
  assert.match(h, /<p class="small muted su-unote" id="su-use-note">You can always show it on the board from the Teacher button, and a fresh set of questions is made whenever possible\.<\/p>/);
  assert.match(h, /id="su-use-one"[^>]*hidden>Pick at least one\./);
  const js = fs.readFileSync(path.join(ROOT, 'public/js/buildsetup.js'), 'utf8');
  assert.match(js, /CSTEPS = \['lesson', 'use', 'help'\]/); assert.match(js, /\.\.\.usesPlan\(S\.sel\.use\.length \? S\.sel\.use : \['screen'\]\)/); assert.match(js, /\['use', t\(/, 'a row on the plan summary');
  // the page's usesPlan says what builder/plan.js usesPlan says
  assert.match(js, /const usesPlan = use => \(\{ purpose: \[\.\.\.use, 'generator'\], played: use\.includes\('screen'\) \? 'both' : 'board' \}\);/);
  const r = await teacher.c('/api/build/plan', { method: 'POST', body: { plan: { kind: 'activity', topic: { text: 'Circuits' }, ...plan.usesPlan(['worksheet']) } } });
  assert.deepEqual([r.json.plan.purpose, r.json.plan.played], [['worksheet', 'generator'], 'board']); assert.equal(r.json.plan.figures, true);
  assert.match(r.json.text, /Students use it on paper: a printable worksheet with an answer key\./); assert.doesNotMatch(r.json.text, /own devices|on the board/);
  for (const code of CODES) for (const k of ['buildSetup.canvas.use.heading', 'buildSetup.canvas.use.hint', 'buildSetup.canvas.use.note', 'buildSetup.canvas.use.screen.title', 'buildSetup.canvas.use.worksheet.text', 'buildSetup.say.use.both', 'buildSetup.say.fresh', 'js.buildsetup.canvas.rows.use', 'js.buildsetup.canvas.use.both', 'play.printCanvas.sheet', 'play.printCanvas.answer']) assert.ok(tFor(code)(k) && tFor(code)(k) !== k, `${code} ${k}`);
});
test('the four-step setup: each choice of "How will students use it?" -> the purpose and played the Builder gets, and what it is told', () => {
  const want = [
    [['screen'], ['screen', 'generator'], 'both', 'Students use it on their own devices.'],
    [['worksheet'], ['worksheet', 'generator'], 'board', 'Students use it on paper: a printable worksheet with an answer key.'],
    [['screen', 'worksheet'], ['screen', 'worksheet', 'generator'], 'both', 'Students use it on their own devices and on paper.'],
  ];
  for (const [use, purpose, played, says] of want) {
    assert.deepEqual(plan.usesPlan(use), { purpose, played }, use.join());
    const p = plan.normalisePlan({ kind: 'activity', topic: { text: 'Adding' }, ...plan.usesPlan(use) });
    assert.deepEqual([p.purpose, p.played], [purpose, played], `${use}: kept as sent`);
    assert.deepEqual(plan.usesOf(p), use, `${use}: read back as the same uses`);
    const text = plan.planSentence(p, tFor('en')), note = plan.planNote(p), data = plan.canvasActivity(p, tFor('en'));
    assert.equal(text, `Here is my plan: a classroom activity. Practice: Adding. ${says} Help: Guided. Make a fresh set of questions whenever possible.`);
    // a generator whenever possible, and what to do when none fits (the kit refuses "generator" without "gen")
    assert.match(note, new RegExp(`config\\.purpose ${JSON.stringify(purpose).replace(/[[\]]/g, '\\$&')}`));
    assert.match(note, /Fresh sets whenever possible: give a generator \("gen"\) when the problems allow one/); assert.match(note, /leave "generator" out of config\.purpose/);
    assert.deepEqual(data.config.purpose, purpose); assert.equal(data.config.board, played === 'board');
    // never what the teacher did not pick
    if (use.includes('screen')) { assert.match(note, /How it is played: ON THEIR OWN DEVICES: .*config\.board false.*Board mode \(under its Teacher button\)/); assert.doesNotMatch(note, /ON THE BOARD TOGETHER|NOT PLAYED ON STUDENTS/); }
    else { assert.match(note, /How it is played: NOT PLAYED ON STUDENTS' DEVICES: it is used on paper.*config\.board true/); assert.doesNotMatch(note, /ON THEIR OWN DEVICES|PRACTICE ON SCREEN/); assert.doesNotMatch(text, /own devices|board/); }
    if (use.includes('worksheet')) assert.match(note, /It prints a worksheet/); else { assert.doesNotMatch(note, /It prints a worksheet|PRINTABLE WORKSHEET/); assert.doesNotMatch(text, /paper|print/); }
    assert.match(plan.planBrief(p), new RegExp(`for ${purpose.join(', ')} \\(config\\.purpose\\); played ${played}`));
  }
  // nothing, or something unknown: on their devices
  assert.deepEqual(plan.usesPlan([]), { purpose: ['screen', 'generator'], played: 'both' }); assert.deepEqual(plan.usesPlan(['poster']), plan.usesPlan(['screen']));
});
test('an older setup (played "board", purpose "generator", from the five-step page or a saved chat) still loads, reads sensibly and builds', async () => {
  const old = { kind: 'activity', topic: { text: 'Adding' }, help: ['guided'], purpose: ['generator'], played: 'board', grade: '3' };
  const p = plan.normalisePlan(old);
  assert.deepEqual([p.purpose, p.played], [['generator'], 'board'], 'not migrated: kept as it was');
  assert.deepEqual(plan.usesOf(p), ['screen']);
  assert.equal(plan.planSentence(p, tFor('en')), 'Here is my plan: a classroom activity. For grade 3. Practice: Adding. We play it together on the board. Help: Guided. Make a fresh set of questions whenever possible.');
  assert.match(plan.planNote(p), /How it is played: ON THE BOARD TOGETHER/); assert.match(plan.planNote(p), /config\.purpose \["generator"\]/);
  assert.equal(plan.canvasActivity(p, tFor('en')).config.board, true);
  // every older answer reads without an error, in every language
  for (const played of plan.CANVAS_PLAYS) for (const purpose of [['screen'], ['worksheet'], ['generator'], ['screen', 'worksheet', 'generator'], undefined]) {
    const q = plan.normalisePlan({ kind: 'activity', purpose, played });
    for (const code of CODES) { const s = plan.planSentence(q, tFor(code)); assert.ok(s && !/buildSetup\./.test(s), `${code} ${played} ${purpose}: ${s}`); }
    assert.ok(plan.planNote(q).includes('How it is played: ') && !plan.planNote(q).includes('undefined'), `${played} ${purpose}`);
  }
  assert.match(plan.planSentence(plan.normalisePlan({ kind: 'activity', purpose: ['screen', 'worksheet'], played: 'board' }), tFor('en')), /We play it together on the board\. Students use it on paper/);
  // the first build with the old plan, end to end with the mock Builder
  const r = await teacher.c('/api/build/plan', { method: 'POST', body: { plan: old } });
  assert.equal(r.status, 200); assert.equal(r.json.engine, 'canvas'); assert.match(r.json.text, /We play it together on the board/);
  const g = await teacher.c('/api/studio/new', { method: 'POST', body: {} });
  const sent = await teacher.c(`/api/studio/${g.json.id}/chat`, { method: 'POST', body: { detach: true, plan: old } });
  assert.ok([200, 202].includes(sent.status), sent.text);
  await runner.idle(g.json.id);
  const v = games.getVersion(games.getGame(g.json.id).current_version_id), data = activityData(v.html).data;
  assert.deepEqual([data.config.board, data.config.purpose, !!data.gen], [true, ['generator'], true]);
  assert.deepEqual(autotest.canvasSelfTest(v.html), { ok: true, problems: [] });
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
  // the core's tag and exactly the packs its figures need (figTag picks them from the kinds), then the kit
  const kindsUsed = [...new Set(activityData(v.html).data.problems.map(p => p.fig.kind))], figTagUsed = figTag('oomba-figures', undefined, { kinds: kindsUsed });
  assert.ok(v.html.indexOf(figTagUsed) >= 0 && v.html.indexOf(figTagUsed) < v.html.indexOf(canvasTag()), 'Oomba Figures (and its packs) first, then the kit');
  assert.notEqual(figTagUsed, figTag('oomba-figures', undefined, { packs: [] }), 'with its packs');
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

test('a Canvas activity whose topic a kit tool covers stays a Canvas build; other figure topics still get the FIGURE RULES', async () => {
  const plan = await import('../../server/builder/plan.js');
  const act = t => plan.normalisePlan({ kind: 'activity', topic: { text: t }, help: ['own'], grade: '4' });
  // "fractions on a number line" is numberline.point: the new number-line words must not turn it into a figure build
  assert.ok(!act('Fractions on a number line').figures);
  assert.ok(!act('Number line jumps').figures);
  // a topic no kit tool covers still calls for figures
  assert.equal(act('Area of a trapezoid').figures, true);
  assert.equal(act('Box plots and quartiles').figures, true);
  // the lesson can still ask for figures on a kit topic
  assert.equal(plan.normalisePlan({ kind: 'activity', topic: { text: 'Fractions on a number line' }, help: ['own'], lesson: { goal: 'read a box plot' } }).figures, true);
});
