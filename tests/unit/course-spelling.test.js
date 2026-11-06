// US English in all three courses (the cross-team course contract: "math", "ads", "candy", "favorite", "labeled",
// "color"). Every kid- and teacher-facing string of CS Quest, Cyber Defenders and Number Quest is linted for UK
// spellings and UK words: the slide decks (slides, first-time decks, talk prompts), the check banks (questions,
// choices, whys, misconception phrases), the unit and chapter names (units.json, CS Quest's games.json and course
// extras), Cyber Defenders' trick pack, the courses' English UI strings (courses.*, js.course.*, the three
// teacher pages teachers.cs/cd/nq) and the engine's own lines (Tally's lines in server/routes/courses.js, the
// Number Quest street in server/views/number-quest-path.js). en-GB.json is the one place UK spelling belongs.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/** UK spellings and UK-only words, each with the US form the message suggests. Whole words, any case. */
const UK = [
  [/\bmaths\b/i, 'math'], [/\bfavourit(e|es|ism)\b/i, 'favorite'],
  [/\b(colour|colours|coloured|colouring|colourful)\b/i, 'color'], [/\blabell(ed|ing)\b/i, 'labeled'],
  [/\b(advert|adverts)\b/i, 'ad / ads'], [/\bsweets\b/i, 'candy'], [/\bcrisps\b/i, 'chips'], [/\b(lolly|lollies)\b/i, 'lollipop'],
  [/\bgrey(s|er|ish)?\b/i, 'gray'], [/\b(centre|centres|centred)\b/i, 'center'],
  [/\b(metre|metres|centimetre|centimetres|millimetre|millimetres|kilometre|kilometres|litre|litres|millilitre|millilitres)\b/i, 'meter / liter'],
  [/\b(theatre|fibre|calibre|sombre|manoeuvre)\b/i, 'theater / fiber'],
  [/\b(behaviour|behaviours|neighbour|neighbours|neighbourhood|honour|honours|flavour|flavours|humour|favour|favours|harbour|armour|rumour|rumours|labour|endeavour|savour|odour|vapour|parlour)\b/i, '-or'],
  [/\b(organis|recognis|realis|apologis|memoris|summaris|categoris|prioritis|emphasis|minimis|maximis|criticis|customis|personalis|visualis|specialis|finalis|utilis|authoris|sympathis|standardis|familiaris|digitis|randomis|optimis)(e|ed|es|ing|ation|ations)\b/i, '-ize'],
  [/\b(practis)(e|ed|es|ing)\b/i, 'practice / practiced'], [/\b(licence|defence|offence|pretence)\b/i, 'license / defense'],
  [/\b(travell|cancell|modell|labell|levell|signall|totall|fuell|diall|channell|tunnell|quarrell)(ed|ing|er|ers)\b/i, 'single l'],
  [/\b(catalogue|catalogues|programme|programmes|cheque|cheques|jewellery|tyre|tyres|kerb|storey|plough|aeroplane|aluminium|grey)\b/i, 'US spelling'],
  [/\b(whilst|amongst|learnt|spelt|dreamt|burnt|spoilt)\b/i, 'while / among / learned / spelled'],
  [/\b(enrol|enrolment|fulfil|fulfilment|skilful|instalment|wilful)\b/i, 'enroll / fulfill / skillful'],
  [/\b(mum|mums|mummy)\b/i, 'mom'], [/\b(anticlockwise)\b/i, 'counterclockwise'], [/\bpostcode\b/i, 'zip code'],
  [/\b(lorry|petrol|pavement|nappy|trolley|rubbish bin|dustbin|fortnight|queue up)\b/i, 'US word'],
  [/\bYear [1-9]\b/, 'grade N'], [/£/, '$ / cents'],
];
/** Every UK word in a string -> ['word (use x)', ...]. */
function ukIn(s) {
  const out = [];
  for (const [re, us] of UK) { const m = re.exec(s); if (m) out.push(`"${m[0]}" (US: ${us})`); }
  return [...new Set(out)];
}
/** Every string value inside a parsed JSON value, with its path. */
function* strings(v, at = '') {
  if (typeof v === 'string') yield [at, v];
  else if (Array.isArray(v)) for (const [i, x] of v.entries()) yield* strings(x, `${at}[${i}]`);
  else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) yield* strings(x, at ? `${at}.${k}` : k);
}
/** Developer notes and file keys, not words anyone reads in the course: "about" headers, picture keys, ids. */
const SKIP = /(^|\.)(about|_[a-z]+|img|id|key|slug|params)$/;
const rel = f => path.relative(ROOT, f);
const jsonFiles = dir => {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => (e.isDirectory() ? jsonFiles(path.join(dir, e.name)) : e.name.endsWith('.json') ? [path.join(dir, e.name)] : []));
};
function lintJson(files) {
  const bad = [];
  for (const f of files) for (const [at, s] of strings(JSON.parse(fs.readFileSync(f, 'utf8')))) if (!SKIP.test(at)) for (const w of ukIn(s)) bad.push(`${rel(f)} ${at}: ${w} in "${s.slice(0, 90)}"`);
  return bad;
}

test('the lint itself catches what the audit found and lets US English through', () => {
  for (const s of ['Maths through the Numberworks', 'that is its favourite mix-up', 'Recipe Maths', 'the adverts on the page', 'two sweets', 'boxes labelled A and B', 'the colour of the sky', 'a grey cat', '2 metres of ribbon'])
    assert.ok(ukIn(s).length, `catches: ${s}`);
  for (const s of ['Math through the Numberworks', 'your favorite color', 'ads and candy', 'labeled boxes', 'a gray cat', '2 meters', 'Practice makes progress', 'a year has passed', 'advertisers pay for ads', 'program the robot', 'the center square'])
    assert.deepEqual(ukIn(s), [], `lets through: ${s}`);
});

for (const course of ['cs-quest', 'cyber-defenders', 'number-quest']) {
  const base = path.join(ROOT, 'seed-lessons', course);
  test(`${course}: slide decks are US English`, () => {
    const bad = lintJson(jsonFiles(path.join(base, 'course')));
    assert.deepEqual(bad, [], `${bad.length} UK spelling(s):\n${bad.join('\n')}`);
  });
  test(`${course}: check banks are US English`, () => {
    const bad = lintJson(jsonFiles(path.join(base, 'sets')));
    assert.deepEqual(bad, [], `${bad.length} UK spelling(s):\n${bad.join('\n')}`);
  });
  test(`${course}: unit and chapter names are US English`, () => {
    const files = ['units.json', 'games.json', 'trick-pack.json'].map(f => path.join(base, f)).filter(f => fs.existsSync(f));
    const bad = lintJson(files);
    assert.deepEqual(bad, [], `${bad.length} UK spelling(s):\n${bad.join('\n')}`);
  });
}

test('the courses\' English UI strings are US English', () => {
  const en = JSON.parse(fs.readFileSync(path.join(ROOT, 'server/i18n/locales/en.json'), 'utf8'));
  const bad = [];
  for (const [label, v] of [['courses', en.courses], ['js.course', en.js.course], ['teachers.cs', en.teachers.cs], ['teachers.cd', en.teachers.cd], ['teachers.nq', en.teachers.nq]]) {
    assert.ok(v, `en.json has ${label}`);
    for (const [at, s] of strings(v, label)) for (const w of ukIn(s)) bad.push(`en.json ${at}: ${w}`);
  }
  assert.deepEqual(bad, [], bad.join('\n'));
});

test('the course engine\'s own kid-facing lines are US English', () => {
  // String literals only (comments are for developers and keep the house style).
  const literals = src => {
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:\\])\/\/[^\n]*/g, '$1');
    const out = []; const re = /(['"`])((?:\\.|(?!\1)[^\\\n]){3,600})\1/g; let m;
    while ((m = re.exec(code))) out.push(m[2]);
    return out;
  };
  const bad = [];
  for (const f of ['server/routes/courses.js', 'server/views/courses.js', 'server/views/number-quest-path.js', 'public/js/course.js']) {
    for (const s of literals(fs.readFileSync(path.join(ROOT, f), 'utf8'))) for (const w of ukIn(s)) bad.push(`${f}: ${w} in "${s.slice(0, 90)}"`);
  }
  assert.deepEqual(bad, [], bad.join('\n'));
});
