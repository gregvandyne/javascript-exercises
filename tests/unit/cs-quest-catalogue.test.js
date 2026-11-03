// CS Quest catalogue (seed-lessons/cs-quest/**, README.md there): every lesson file follows the schema and the platform's
// limits, its steps sum to 45 minutes and carry valid CSTA ids, options and rubrics, its quest code and game-step standards
// match the chapter table (games.json), its warm-up and exit items resolve in the unit banks, and every string keeps the
// text rules (US spelling, no digit runs / links / handles, the real game scanner). Once all 46 lesson files exist the
// coverage clauses of plan section 9.5 run too: (a) every id is primary in a lesson of its band outside unit 7, (b') >= 3
// bank items per id, (c) unit-7 primary ids have a rubric line, (g) exit item cats are primaries, (i) every practice in >= 3
// units. Until then those are skipped with the list of missing files, so lesson writers can run this file after each lesson.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DIR = path.join(ROOT, 'seed-lessons/cs-quest');
const CSTA = await import('../../server/standards/csta.js');
const L = await import('../../server/services/lessons.js');
const PP = await import('../../server/services/play-params.js');
const SETS = await import('../../server/services/classlive-sets.js');
const { TEMPLATE_KEYS } = await import('../../server/builder/catalog.js');
const { scanVersion } = await import('../../server/services/scanner.js');

const readJson = f => JSON.parse(fs.readFileSync(f, 'utf8'));
const units = readJson(path.join(DIR, 'units.json'));
const GAMES = readJson(path.join(DIR, 'games.json')).games;
const lessonDir = path.join(DIR, 'lessons');
const lessonFiles = fs.existsSync(lessonDir) ? fs.readdirSync(lessonDir).filter(f => /^\d\.\d-(1b|2)\.json$/.test(f)).sort() : [];
const lessons = lessonFiles.map(f => ({ file: f, ...readJson(path.join(lessonDir, f)) }));
const setsDir = path.join(DIR, 'sets');
const bankFiles = fs.existsSync(setsDir) ? fs.readdirSync(setsDir).filter(f => /^u\d-(1b|2)\.json$/.test(f)).sort() : [];
const banks = bankFiles.map(f => readJson(path.join(setsDir, f)));
const haveBanks = banks.length === 14;
const noBanks = !haveBanks && `the 14 unit banks are not in ${path.relative(ROOT, setsDir)} (owner B's branch); ${banks.length} found`;
const bankById = new Map(banks.map(b => [b.id, b]));
const items = new Map(banks.flatMap(b => b.items.map(it => [it.id, { ...it, bank: b.id }])));

// What units.json promises: 46 lesson entries with their file names and primary ids.
const expected = units.units.flatMap(u => u.lessons.flatMap(l => ['1B', '2'].map(band => ({
  band, bandCode: band === '1B' ? '1b' : '2', unit: u.n, n: l.n, order: l.order, short: l.short, name: l.title,
  key: l.keys[band], file: l.files[band], primary: l.primary[band], also: l.also[band], buildsToward: l.buildsToward[band], main: l.main[band], warmup: l.warmup,
}))));
const expectedByKey = new Map(expected.map(e => [e.key, e]));
const missing = expected.filter(e => !lessonFiles.includes(path.basename(e.file)));
const complete = missing.length === 0;
const incomplete = !complete && `waiting for ${missing.length} of 46 lesson files (${missing.slice(0, 6).map(m => path.basename(m.file)).join(', ')}${missing.length > 6 ? ', ...' : ''})`;

// Text rules: British forms only (US forms never match), phone-like digit runs, handles, links, and what students may not read.
const UK = /\b(colours?|coloured|colouring|favourites?|grey|labelled|licence|organis(e|ed|ing|ation)|practis(e|ed|ing)|neighbours?|recognis(e|ed|ing)|maths|centre|metres?|behaviours?|honour|catalogue|analys(e|ed|ing)|defence|travelled|modelling|cancelled|jewellery|tyres?|whilst|learnt|spelt|programme|artefacts?)\b/i;
const BAD = [[/\d{7,}/, 'a 7+ digit run'], [/@/, 'an @'], [/\/\/\w[\w.-]*\.\w{2,}/, 'a //host.tld link'], [/https?:/i, 'a URL scheme'], [/\bwww\./i, 'a www. link'], [/\btype your password\b/i, '"type your password"']];
const KID_FORBIDDEN = [[/CS Quest/, 'the program name'], [/\b(1B|2)-(CS|NI|DA|AP|IC)-\d{2}\b/, 'a standard code']];
const HOSTED_LIVE = { 'quest-race': '1B', 'question-battle': '2', 'would-you-rather-live': 'both' };
const strings = (v, out = []) => { if (typeof v === 'string') out.push(v); else if (Array.isArray(v)) v.forEach(x => strings(x, out)); else if (v && typeof v === 'object') Object.values(v).forEach(x => strings(x, out)); return out; };
const sum = rows => rows.reduce((n, r) => n + r[1], 0);
const isIdOf = (id, band) => CSTA.isId(id) && CSTA.byId(id).level === band;
const chapterOf = (slug, id, band) => (GAMES[slug] ? GAMES[slug].chapters.find(c => c.id === id && c.band === band) : null);
const allowedIds = (slug, play, band) => {
  const out = new Set((chapterOf(slug, play.chapter, band) || { csta: [] }).csta);
  if (play.then) for (const id of (chapterOf(slug, play.then.chapter, band) || { csta: [] }).csta) out.add(id);
  return out;
};
const modeIndex = (slug, mode) => Object.entries(GAMES[slug].modes).find(([, v]) => v === (mode || 'play'))?.[0];
const rubricLinesOf = l => l.steps.flatMap(s => (s.rubric === 'exit' ? l.exit.rubric : Array.isArray(s.rubric) ? s.rubric : []));

test('units.json: 7 units, 23 lessons, 46 unique keys and files, bands, derived-set naming', () => {
  assert.equal(units.program.slug, 'cs-quest');
  assert.equal(units.units.length, 7);
  assert.deepEqual(units.units.map(u => u.n), [1, 2, 3, 4, 5, 6, 7]);
  assert.equal(units.units.flatMap(u => u.lessons).length, 23);
  assert.equal(expected.length, 46);
  assert.equal(new Set(expected.map(e => e.key)).size, 46);
  assert.equal(new Set(expected.map(e => e.file)).size, 46);
  assert.equal(new Set(expected.map(e => e.order)).size, 23, 'one order per lesson number');
  for (const e of expected) {
    assert.equal(e.key, `csq-${e.bandCode}-${e.n}`, `${e.key}: key grammar`);
    assert.equal(e.file, `lessons/${e.n}-${e.bandCode}.json`, `${e.key}: file naming lessons/<unit>.<n>-<1b|2>.json`);
    assert.ok(e.primary.length >= 1, `${e.key}: primary ids`);
    for (const id of [...e.primary, ...e.also, ...e.buildsToward]) assert.ok(isIdOf(id, e.band), `${e.key}: ${id} is a CSTA id of level ${e.band}`);
    assert.ok(e.short.length >= 3 && e.short.length <= SETS.LIMITS.cat, `${e.key}: short name fits a Brain Board column`);
  }
  assert.equal(units.units[6].optional, true); assert.equal(units.units[6].needsSchoolPlan, true);
  assert.deepEqual(Object.keys(units.bands).sort(), ['1B', '2']);
  assert.equal(units.bands['1B'].code, '1b'); assert.equal(units.bands['2'].code, '2');
  assert.equal(units.bands['1B'].warmupGame, 'quest-race'); assert.equal(units.bands['2'].warmupGame, 'question-battle');
  assert.equal(units.derivedSets.subject, 'cs-quest');
  for (const s of strings([units.units, units.paths, units.rules, units.faq, units.materials, units.period, units.periodVariants])) {
    assert.ok(!UK.test(s), `US spelling please: ${s.slice(0, 80)}`);
    for (const [re, why] of BAD) assert.ok(!re.test(s), `units.json has ${why}: ${s.slice(0, 80)}`);
    assert.ok(!/\$\s?\d|\d\s?(USD|dollars)|per month|per seat/i.test(s), `no prices anywhere: ${s.slice(0, 80)}`);
  }
});

test('units.json: four paths with Core 10 (no Builder) first and default, every path lesson exists, the 45-minute period and the 40-minute cut', () => {
  const all = new Set(units.units.flatMap(u => u.lessons.map(l => l.n)));
  assert.equal(units.paths.length, 4);
  assert.equal(units.paths[0].title, 'Core 10 (no Builder)'); assert.equal(units.paths[0].default, true);
  assert.deepEqual(units.paths[0].lessons, ['1.2', '1.3', '2.1', '2.2', '3.1', '3.2', '4.1', '4.2', '5.2', '6.1']);
  assert.ok(!units.paths[0].lessons.some(n => n.startsWith('7.')), 'the default path needs no school plan');
  assert.deepEqual(units.paths.map(p => p.id), ['core10-no-builder', 'full', 'cs-ed-week', 'device-first']);
  assert.equal(units.paths[1].lessons.length, 23);
  for (const p of units.paths) { assert.equal(new Set(p.lessons).size, p.lessons.length, `${p.id}: no repeats`); for (const n of p.lessons) assert.ok(all.has(n), `${p.id}: lesson ${n} exists`); }
  assert.equal(sum(units.period), 45);
  assert.equal(units.period.length, 6);
  assert.equal(sum(units.periodVariants.short40.table), 40);
  assert.match(units.periodVariants.short40.rule, /never cut the exit ticket/);
  assert.ok(units.rules.some(r => /40-minute cut/.test(r)), 'the 40-minute cut is a stated rule');
  assert.ok(units.materials.some(m => /headphones/i.test(m)), 'materials name headphones');
  assert.deepEqual(units.lessonModeDefaults, { music: 'off', captions: 'on' });
  for (const f of ['Classes and lessons live inside a school', 'Chromebooks without touch work', 'Headphones recommended']) assert.ok(units.faq.some(x => x.startsWith(f)), `FAQ line: ${f}`);
});

test('games.json: the four games, chapter indices per band, CSTA ids of the right level, modes with play and projector', () => {
  assert.deepEqual(Object.keys(GAMES).sort(), ['data-detective', 'inside-the-machine', 'packet-post', 'robo-route']);
  for (const [slug, g] of Object.entries(GAMES)) {
    assert.equal(g.modes['0'], 'play'); assert.equal(g.modes['3'], 'projector');
    assert.ok(g.chapters.length >= 8, `${slug}: chapter rows`);
    const seen = new Set();
    for (const ch of g.chapters) {
      assert.ok(Number.isInteger(ch.index) && ch.index >= 1 && ch.index <= 9, `${slug} ${ch.id}: index is one quest-code digit`);
      assert.ok(['1B', '2'].includes(ch.band));
      assert.ok(!seen.has(`${ch.id}/${ch.band}`), `${slug} ${ch.id}/${ch.band}: one row per chapter and band`); seen.add(`${ch.id}/${ch.band}`);
      assert.ok(g.chapters.filter(c => c.id === ch.id).every(c => c.index === ch.index), `${slug} ${ch.id}: the same index in both bands`);
      assert.ok(Number.isInteger(ch.levels) && ch.levels >= 1 && ch.levels <= 30);
      if (ch.mode) assert.ok(Object.values(g.modes).includes(ch.mode), `${slug} ${ch.id}: mode ${ch.mode} exists`);
      if (ch.enrichment) assert.equal(ch.csta.length, 0, `${slug} ${ch.id}: enrichment chapters claim no id`);
      else assert.ok(ch.csta.length >= 1, `${slug} ${ch.id}/${ch.band}: claims an id`);
      for (const id of ch.csta) assert.ok(CSTA.isId(id), `${slug} ${ch.id}: ${id} is a CSTA id`);
    }
  }
});

for (const l of lessons) {
  const where = l.file;
  const e = expectedByKey.get(l.key);

  test(`${where}: identity, standards, I can, warm-up, exit, plan tables, text fields`, () => {
    assert.ok(e, `${where}: ${l.key} is listed in units.json`);
    assert.equal(l.id, l.key);
    assert.equal(path.basename(e.file), where, 'the file name matches units.json');
    assert.ok(Number.isInteger(l.version) && l.version >= 1);
    assert.equal(l.unit, e.unit); assert.equal(l.order, e.order); assert.equal(l.n, e.n); assert.equal(l.band, e.band); assert.equal(l.bandCode, e.bandCode);
    assert.equal(l.grade, e.band === '1B' ? 'Grades 3-5' : 'Grades 6-8');
    assert.equal(l.name, e.name); assert.equal(l.short, e.short);
    assert.equal(l.title, `CS Quest ${l.n} · ${l.name}`); assert.ok(l.title.length <= 100, 'title <= 100 (lessons.title)');
    assert.ok(typeof l.summary === 'string' && l.summary.length >= 40 && l.summary.length <= 600, 'summary 40..600 (lessons.summary)');
    assert.equal(l.duration, 45);
    assert.deepEqual(l.csta.primary, e.primary, 'primary ids as units.json lists them');
    assert.deepEqual(l.csta.also, e.also); assert.deepEqual(l.csta.buildsToward, e.buildsToward);
    for (const id of [...l.csta.primary, ...l.csta.also, ...l.csta.buildsToward]) assert.ok(isIdOf(id, l.band), `${id} is a CSTA id of level ${l.band}`);
    assert.ok(!l.csta.primary.some(id => l.csta.buildsToward.includes(id)), 'builds-toward ids are never primary');
    assert.ok(Array.isArray(l.iCan) && l.iCan.length >= 2 && l.iCan.every(s => typeof s === 'string' && s.length >= 10), 'at least two I-can lines');
    assert.ok(l.iCan.join('\n').length <= 1000, 'I-can lines fit lessons.objectives');
    assert.ok(Array.isArray(l.materials) && l.materials.length >= 1);
    assert.ok(typeof l.doNow === 'string' && l.doNow.length >= 10);
    assert.equal(l.plan.length, 6); assert.equal(sum(l.plan), 45, 'the period table sums to 45');
    for (const row of l.plan) assert.ok(/^\d:\d\d$/.test(row[0]) && Number.isInteger(row[1]) && row[1] > 0 && typeof row[2] === 'string');
    // explore script: teacher voice, imperative, two Say / a Do / an Ask, a big idea, <= 5 vocabulary words
    assert.ok(l.explore.say.length >= 1 && l.explore.do.length >= 1 && l.explore.ask.length >= 1, 'Say / Do / Ask lines');
    assert.ok(typeof l.explore.bigIdea === 'string' && l.explore.bigIdea.length >= 15);
    assert.ok(Array.isArray(l.explore.vocab) && l.explore.vocab.length >= 1 && l.explore.vocab.length <= 6, 'at most 5 vocabulary words on the learn card (6 where the plan lists 6)');
    assert.ok(Array.isArray(l.discuss) && l.discuss.length >= 1);
    assert.ok(typeof l.play.misconception === 'string' || l.play.type !== 'game', 'a game lesson names the misconception of the day');
    assert.ok(Array.isArray(l.differentiation.support) && l.differentiation.support.length >= 1 && Array.isArray(l.differentiation.stretch) && l.differentiation.stretch.length >= 1);
    assert.ok(l.unpluggedTwin.title && Number.isInteger(l.unpluggedTwin.minutes) && l.unpluggedTwin.steps.length >= 2, 'the unplugged twin has a title, minutes and steps');
    assert.ok(Array.isArray(l.subPlan) && l.subPlan.length === 3, 'the sub plan is three sentences');
    assert.equal(sum(l.shortPeriod40.table), 40, 'the 40-minute cut sums to 40');
    assert.ok(l.shortPeriod40.table.some(r => /exit ticket/i.test(r[2])), 'the 40-minute cut keeps the exit ticket');
    assert.ok(typeof l.shortPeriod40.discuss === 'string' && l.discuss.includes(l.shortPeriod40.discuss), 'the 40-minute Discuss prompt is one of the lesson prompts');
    // warm-up
    if (l.warmup === null) {
      assert.ok(['6.1', '7.2'].includes(l.n), 'only 6.1 and 7.2 have no warm-up');
      assert.deepEqual(l.shortPeriod40.warmupItems || [], []);
    } else {
      assert.equal(l.warmup.setId, `csq-u${l.unit}-${l.bandCode}`, 'the warm-up comes from the unit bank');
      assert.equal(l.warmup.items.length, 5); assert.equal(new Set(l.warmup.items).size, 5, 'five different items');
      assert.equal(l.warmup.mode, l.band === '1B' ? 'quest-race' : 'battle');
      assert.equal(l.warmup.secs, 15); assert.equal(l.warmup.projectorOk, true);
      assert.ok(['projector', 'live'].includes(l.warmup.default));
      for (const id of l.warmup.items) assert.ok(new RegExp(`^${l.bandCode}-(${l.unit}\\.\\d-[er]\\d|u${l.unit}-o\\d)$`).test(id), `warm-up item ${id} belongs to unit ${l.unit}, band ${l.bandCode}`);
      assert.equal(l.shortPeriod40.warmupItems.length, 2, 'the 40-minute cut keeps 2 warm-up items');
      for (const id of l.shortPeriod40.warmupItems) assert.ok(l.warmup.items.includes(id), `${id} is one of the five`);
    }
    // exit ticket: the lesson's own e1..e3 and one rubric line per primary id in the platform's shape
    assert.equal(l.exit.setId, `csq-u${l.unit}-${l.bandCode}`);
    assert.deepEqual(l.exit.items, [1, 2, 3].map(i => `${l.bandCode}-${l.n}-e${i}`), 'exit items are the lesson own e1..e3');
    assert.ok(typeof l.exit.sentencePrompt === 'string' && l.exit.sentencePrompt.length >= 10);
    assert.ok(typeof l.exit.frame === 'string' && /___/.test(l.exit.frame), 'the sentence frame has blanks');
    assert.ok(Array.isArray(l.exit.rubric) && l.exit.rubric.length >= 1 && l.exit.rubric.length <= L.RUBRIC_LIMITS.lines);
    assert.ok(L.cleanRubric(l.exit.rubric) !== null, 'exit.rubric passes lessons.cleanRubric');
    for (const r of l.exit.rubric) {
      assert.ok(typeof r.line === 'string' && r.line.length >= 3 && r.line.length <= L.RUBRIC_LIMITS.line, 'rubric line label 3..80');
      assert.equal(r.levels.length, 4, `${r.line}: four descriptors for marks 0-3`);
      for (const lv of r.levels) assert.ok(typeof lv === 'string' && lv.length >= 3 && lv.length <= L.RUBRIC_LIMITS.level);
      for (const id of r.ids) assert.ok(l.csta.primary.includes(id), `${r.line}: ${id} is a primary id of the lesson`);
    }
    for (const id of l.csta.primary) assert.ok(l.exit.rubric.some(r => r.ids.includes(id)), `${id} has a rubric line (Applied evidence)`);
  });

  test(`${where}: quest code, params and the chapter table (clauses f', h)`, () => {
    assert.ok(['game', 'live', 'unplugged', 'builder', 'discussion'].includes(l.play.type), 'play.type');
    if (l.play.type !== 'game') { assert.equal(l.questCode, null); assert.equal(l.params, null); return; }
    const slug = l.play.game;
    assert.ok(GAMES[slug], `${slug} is one of the four games`);
    const ch = chapterOf(slug, l.play.chapter, l.band);
    assert.ok(ch, `${slug} has chapter ${l.play.chapter} for band ${l.band}`);
    assert.equal(l.play.chapterTitle, ch.title);
    assert.equal(l.play.levels, ch.levels, 'the plan knows how many levels the chapter has');
    if (l.play.mode) assert.equal(ch.mode, l.play.mode, 'the chapter is played in its own mode');
    if (l.play.then) {
      const t = chapterOf(slug, l.play.then.chapter, l.band);
      assert.ok(t, `then chapter ${l.play.then.chapter} exists for band ${l.band}`);
      const m = /^(\d+)-(\d+)$/.exec(l.play.then.levels); assert.ok(m && +m[1] >= 1 && +m[2] <= t.levels && +m[1] <= +m[2], `then levels ${l.play.then.levels} are inside ${t.levels}`);
    }
    // quest code C B M L: chapter index, band digit, mode index, level 0 (first unfinished)
    const m = /^(\d) (\d) (\d) (\d)$/.exec(l.questCode); assert.ok(m, 'quest code is four digits with spaces');
    assert.equal(+m[1], ch.index, 'C = chapter index'); assert.equal(m[2], l.band === '1B' ? '1' : '2', 'B = band');
    assert.equal(m[3], modeIndex(slug, l.play.mode), 'M = mode index'); assert.equal(m[4], '0', 'L = 0');
    // params: canonical and naming the same chapter / band / mode, locked
    assert.equal(PP.cleanOptions(l.params), l.params, 'params are canonical (play-params.js cleanOptions)');
    const p = PP.parseParams(l.params);
    assert.deepEqual(p, { chapter: l.play.chapter, band: l.bandCode, ...(l.play.mode ? { mode: l.play.mode } : {}), lock: 1 });
  });

  test(`${where}: steps fit the platform (kinds, minutes, limits, standards, rubrics, hosted-live, options)`, () => {
    const steps = l.steps;
    assert.ok(Array.isArray(steps) && steps.length >= 4 && steps.length <= 40);
    assert.equal(steps.reduce((n, s) => n + s.minutes, 0), 45, `minutes sum to 45: ${steps.map(s => `${s.title} ${s.minutes}`).join(', ')}`);
    assert.equal(steps[0].kind, 'text'); assert.equal(steps[0].title, 'Today');
    assert.equal(steps.at(-2).kind, 'quiz'); assert.equal(steps.at(-2).title, 'Exit ticket'); assert.equal(steps.at(-2).set, 'exit');
    assert.equal(steps.at(-1).kind, 'question'); assert.equal(steps.at(-1).title, 'In your own words'); assert.equal(steps.at(-1).rubric, 'exit');
    const warm = steps.find(s => s.title === 'Warm-up (live)');
    if (l.warmup) { assert.ok(warm, 'a warm-up step'); assert.equal(warm.gameSlug, l.band === '1B' ? 'quest-race' : 'question-battle'); assert.equal(warm.live, 'warmup'); assert.equal(warm.minutes, 5); }
    else assert.ok(!warm, 'no warm-up step when the lesson has no warm-up');
    const practiced = new Set(), applied = new Set();
    for (const s of steps) {
      const at = `step "${s.title}"`;
      assert.ok([...L.STEP_KINDS, L.QUIZ_KIND].includes(s.kind), `${at}: kind`);
      assert.ok(typeof s.title === 'string' && s.title.length >= 1 && s.title.length <= 100, `${at}: title 1..100`);
      assert.ok(Number.isInteger(s.minutes) && s.minutes >= 0 && s.minutes <= 240, `${at}: minutes 0..240`);
      if (s.body !== undefined) assert.ok(typeof s.body === 'string' && s.body.length <= 4000 && !/<[a-z]/i.test(s.body), `${at}: plain-text body <= 4000`);
      if (['text', 'question', 'build'].includes(s.kind)) assert.ok(s.body && s.body.trim().length >= 10, `${at}: ${s.kind} steps need a body`);
      for (const str of [s.title, s.body || '']) for (const [re, why] of KID_FORBIDDEN) assert.ok(!re.test(str), `${at}: students must not read ${why}: ${str.slice(0, 60)}`);
      if (s.standards !== undefined) {
        assert.ok(L.STANDARDS_KINDS.includes(s.kind), `${at}: standards only on game, question and build steps`);
        assert.ok(Array.isArray(s.standards) && s.standards.length >= 1, `${at}: standards is a non-empty list`);
        assert.ok(L.cleanStandards(s.standards), `${at}: standards pass lessons.cleanStandards`);
        for (const id of s.standards) { assert.ok(isIdOf(id, l.band), `${at}: ${id} is a level-${l.band} id`); practiced.add(id); }
      }
      if (s.rubric !== undefined) {
        assert.ok(L.RUBRIC_KINDS.includes(s.kind), `${at}: rubric only on question and build steps`);
        const lines = s.rubric === 'exit' ? l.exit.rubric : s.rubric;
        assert.ok(Array.isArray(lines) && L.cleanRubric(lines) !== null, `${at}: rubric passes lessons.cleanRubric`);
        for (const r of lines) for (const id of r.ids || []) { assert.ok(isIdOf(id, l.band), `${at}: rubric id ${id}`); applied.add(id); }
      }
      if (s.kind === 'build') { assert.ok(TEMPLATE_KEYS.includes(s.template), `${at}: template is a Studio template key`); assert.equal(s.template, 'quiz'); }
      else assert.equal(s.template, undefined, `${at}: template only on build steps`);
      if (s.kind === 'game') {
        assert.ok(typeof s.gameSlug === 'string', `${at}: gameSlug`);
        if (HOSTED_LIVE[s.gameSlug]) {
          assert.ok(['warmup', 'wyr'].includes(s.live), `${at}: a hosted-live step says live: warmup | wyr`);
          assert.equal(s.playHidden, true); assert.equal(s.options, undefined, `${at}: no options on a hosted-live step`); assert.equal(s.standards, undefined, `${at}: a live run writes the score; Practiced comes from the bank items`);
          if (HOSTED_LIVE[s.gameSlug] !== 'both') assert.equal(HOSTED_LIVE[s.gameSlug], l.band, `${at}: ${s.gameSlug} is the band's warm-up game`);
          if (s.live === 'wyr') assert.match(s.starter, /^wyr:(tech|online|tech\+online):(5|8|10|15|20):(10|15|20|30)$/, `${at}: WYR starter`);
        } else {
          assert.ok(GAMES[s.gameSlug], `${at}: ${s.gameSlug} is a CS Quest game`);
          assert.equal(PP.cleanOptions(s.options), s.options, `${at}: options are canonical`);
          const p = PP.parseParams(s.options);
          assert.equal(p.band, l.bandCode); assert.equal(p.lock, 1, `${at}: lock=1`);
          const ch = chapterOf(s.gameSlug, p.chapter, l.band); assert.ok(ch, `${at}: chapter ${p.chapter} exists for band ${l.band}`);
          if (p.mode) assert.equal(ch.mode, p.mode);
          const qc = /^(\d) (\d) (\d) (\d)$/.exec(s.questCode || ''); assert.ok(qc, `${at}: questCode`);
          assert.equal(+qc[1], ch.index); assert.equal(qc[2], l.band === '1B' ? '1' : '2'); assert.equal(qc[3], modeIndex(s.gameSlug, p.mode)); assert.equal(qc[4], '0');
          assert.ok(Array.isArray(s.standards) && s.standards.length >= 1, `${at}: a game step claims standards`);
          const play = s.gameSlug === l.play.game && p.chapter === l.play.chapter ? l.play : { chapter: p.chapter };
          const ok = allowedIds(s.gameSlug, play, l.band);
          for (const id of s.standards) assert.ok(ok.has(id), `${at}: ${id} is carried by chapter ${p.chapter}${play.then ? ` or its then chapter ${play.then.chapter}` : ''} for band ${l.band} (clause f'): ${[...ok].join(', ')}`);
          if (s.title.startsWith('Play:') || s.title.startsWith('Play A')) { assert.equal(s.options, l.params, `${at}: the main Play step carries the lesson params`); assert.equal(s.questCode, l.questCode); }
          assert.ok(s.body && s.body.includes(s.questCode), `${at}: the body prints the quest code`);
        }
      } else {
        assert.equal(s.gameSlug, undefined, `${at}: gameSlug only on game steps`); assert.equal(s.options, undefined, `${at}: options only on game steps`);
      }
      if (s.kind === 'quiz') { assert.equal(s.set, 'exit'); assert.equal(s.minutes, 3); }
    }
    for (const id of l.csta.primary) {
      assert.ok(practiced.has(id), `${id}: some step carries it in standards (Practiced evidence)`);
      assert.ok(applied.has(id), `${id}: some rubric line carries it (Applied evidence)`);
    }
    for (const id of practiced) assert.ok([...l.csta.primary, ...l.csta.also].includes(id) || (l.unit === 7 && isIdOf(id, l.band)), `${id} on a step is a primary or also id of the lesson (unit 7: a capstone rubric id)`);
    assert.ok(steps.at(-1).body.includes(l.exit.frame), 'In your own words prints the sentence frame');
  });

  test(`${where}: text rules in every string (US spelling, no digit runs / links / handles, the real scanner)`, () => {
    const all = strings(l);
    for (const s of all) {
      assert.ok(!UK.test(s), `US spelling please: ${s.slice(0, 90)}`);
      for (const [re, why] of BAD) assert.ok(!re.test(s), `${why}: ${s.slice(0, 90)}`);
      assert.equal(s, s.trim(), `no stray spaces: ${JSON.stringify(s.slice(0, 60))}`);
      assert.ok(!/grown-?ups?.{0,40}\bcodes?\b|\bcodes?\b.{0,40}grown-?ups?/i.test(s) && !/\b(parents?|guardians?|family|mom|dad)\b.{0,40}\bcodes?\b/i.test(s), `the word code never sits near family words (scanner LINK_CODE_PROMPT): ${s.slice(0, 90)}`);
    }
    const probe = `<title>T</title><canvas></canvas><script>const S=${JSON.stringify(all)};</script>`;
    const r = scanVersion(probe);
    assert.equal(r.status, 'pass', JSON.stringify(r.issues || r, null, 1));
  });

  test(`${where}: warm-up and exit items resolve in the unit bank; exit cats are primary ids; the items pass the live-set filter (clauses g, j)`, { skip: noBanks }, () => {
    const bank = bankById.get(l.exit.setId); assert.ok(bank, `${l.exit.setId} exists`);
    assert.equal(bank.band, l.band);
    const topic = bank.items.find(it => it.lesson === l.n)?.topic; assert.equal(l.short, topic, 'short name = the bank topic (Brain Board column)');
    for (const id of l.warmup ? l.warmup.items : []) { const it = items.get(id); assert.ok(it && it.bank === l.warmup.setId, `warm-up item ${id} is in ${l.warmup.setId}`); }
    const exit = l.exit.items.map(id => items.get(id));
    for (const [i, it] of exit.entries()) {
      assert.ok(it && it.bank === l.exit.setId, `exit item ${l.exit.items[i]} is in ${l.exit.setId}`);
      assert.equal(it.use, 'exit'); assert.equal(it.lesson, l.n);
      assert.ok(l.csta.primary.includes(it.cat), `${it.id}: cat ${it.cat} is a primary id of ${l.key}`);
      assert.equal(it.choices.length, 4);
    }
    const clean = SETS.cleanItems(exit.map(it => ({ q: it.q, choices: it.choices, answer: it.answer, secs: it.secs, cat: it.cat })));
    assert.ok(clean.ok, `the exit ticket materialises (cleanItems): ${JSON.stringify(clean)}`);
    assert.ok(clean.items.every(it => it.cat), 'cat survives the live-set filter');
    if (l.warmup) {
      const w = SETS.cleanItems(l.warmup.items.map(id => items.get(id)).map(it => ({ q: it.q, choices: it.choices, answer: it.answer, secs: it.secs, cat: it.cat })));
      assert.ok(w.ok, `the warm-up materialises: ${JSON.stringify(w)}`);
    }
  });
}

test('every lesson file is one units.json names, keys and derived set names are unique', () => {
  for (const l of lessons) assert.ok(expectedByKey.has(l.key), `${l.file}: ${l.key} is in units.json`);
  assert.equal(new Set(lessons.map(l => l.key)).size, lessons.length);
  const warmNames = lessons.filter(l => l.warmup).map(l => `CSQ ${l.n} warm-up · ${l.short} (${l.band === '1B' ? '3-5' : '6-8'})`);
  assert.equal(new Set(warmNames).size, warmNames.length, 'derived warm-up set names differ');
  for (const n of warmNames) assert.ok(n.length <= SETS.LIMITS.title, `${n}: set title <= ${SETS.LIMITS.title}`);
});

test('the catalogue is complete: all 46 lesson files exist', { todo: incomplete || undefined }, () => {
  assert.deepEqual(missing.map(m => m.file), [], 'missing lesson files');
});

test('(a) every CSTA id is a primary of a lesson of its band outside unit 7', { skip: incomplete }, () => {
  for (const s of CSTA.all()) assert.ok(lessons.some(l => l.band === s.level && l.unit !== 7 && l.csta.primary.includes(s.id)), `${s.id}: no primary lesson outside unit 7`);
});

test('(c) an id in a unit-7 lesson primary list has a rubric line in that lesson', { skip: incomplete }, () => {
  for (const l of lessons.filter(x => x.unit === 7)) {
    const ids = new Set(rubricLinesOf(l).flatMap(r => r.ids || []));
    for (const id of l.csta.primary) assert.ok(ids.has(id), `${l.key}: ${id} has a rubric line`);
  }
});

test('(i) every CSTA practice appears in at least three units (from the primary ids)', { skip: incomplete }, () => {
  const units = new Map();
  for (const l of lessons) for (const id of l.csta.primary) for (const p of CSTA.byId(id).practices) { if (!units.has(p)) units.set(p, new Set()); units.get(p).add(l.unit); }
  for (let p = 1; p <= 7; p++) assert.ok((units.get(p) || new Set()).size >= 3, `practice ${p} in units ${[...(units.get(p) || [])].join(', ')}`);
});

test("(b') at least three bank items per CSTA id of its band, and every bank item's lesson exists", { skip: noBanks || incomplete }, () => {
  const count = new Map(CSTA.all().map(s => [s.id, 0]));
  for (const it of items.values()) count.set(it.cat, (count.get(it.cat) || 0) + 1);
  for (const s of CSTA.all()) assert.ok(count.get(s.id) >= 3, `${s.id}: ${count.get(s.id)} bank items`);
  for (const it of items.values()) assert.ok(lessons.some(l => l.n === it.lesson && l.exit.setId === it.bank), `${it.id}: lesson ${it.lesson} exists for ${it.bank}`);
});
