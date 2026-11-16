// Classroom dashboards: nothing is ever cut off (docs/decisions.md "Classroom dashboards, stage 2"). Starts the app on
// an in-memory database, makes a class with every widget type at its default size (long names, long labels, a help
// queue, an open quick check, a running timer), and loads the teacher's screen (normal and projector, 1600 × 900), a
// student's screen (1366 × 768) and a phone (390 × 844) in English, German (long words) and Arabic (right to left).
// Stage 3 (docs/decisions.md "Classroom dashboards, stage 3") adds the teaching tools, the whiteboard and the Picture
// widget: the widgets are split over as many layouts as the grid needs (24 widgets, 24 rows each), and on the tools'
// layouts both students have every tool on their own screen (as a pinned copy of a sent tool would be).
// Stage 4 (docs/decisions.md "Classroom dashboards, stage 4") adds teaching tools part 2 on more layouts of their own,
// "Practice it" links (official games are made for the check) and a phone in dark mode. The shape board (docs/decisions.md
// "Shape board") adds three busy geoboards: twelve bands with every label on, triangle dots and the circle.
// Stage 5 (docs/decisions.md "Classroom dashboards, stage 5") adds video, the site window, the document camera, the hall
// pass, class jobs, points for each student, the mood check-in, breathing, a sticky note, a checklist and the schedule's
// "now and next", on layouts of their own. Outside pages are stubs (the browser answers the video and site hosts itself;
// the server's "may it be framed?" check is stubbed) and the camera is Chromium's fake camera: the chrome around them is
// what is checked. Text in a stage 5 widget is at least 12px (13px on the projector), as in the tools.
// The timer's stopwatch mode (docs/decisions.md "Timer and stopwatch combined") is checked as a widget of its own, running
// past an hour, and on the first layouts both students also have a timer and a stopwatch of their own (with the mode
// switch, which pinned copies don't show).
// Ready-made layouts (docs/decisions.md "Ready-made layouts") are checked as they are made: one layout per template
// (key tpl-<id>, SIZES=tpl for only these), built in each language checked (its sample periods, goal, jobs, team
// names and light words in that language) with its own background.
// Maths tools combined (docs/decisions.md "Classroom dashboards: maths tools combined"): a tool with modes is checked in
// each mode (its own state, then a widget of its own per other mode, carrying the old tool's busy state there), with its
// mode switch; the number chart also runs 1-120.
// Every button with a tooltip is focused in turn (TIPS=0 skips it): its tooltip shows whole inside the screen, clipped
// by nothing, and the button has no native title as well.
// Each maths tool's ⓘ help panel is opened in turn (not on the projector, where it is hidden; HELP=0 skips it): it fits
// its widget without scrolling and nothing in it is cut.
// For every widget it checks:
//   - the widget's body holds its content (no overflow; only lists scroll, inside their own .dw-scroll area),
//   - no part of the widget sits outside its body unless it is in a scroll area that really scrolls,
//   - no text is cut (scrollWidth <= clientWidth on text boxes; no ellipsis without a title),
//   - every control's painted box (border, box-shadow, transform) is at least 12px inside the widget's inner edge and
//     not clipped by any ancestor that does not scroll,
//   - no control sits under the widget's own controls row,
// and that the phone never scrolls sideways.
//
//   npm run dash:fit            exit code 1 when anything is cut off; OUT=/some/dir also saves a screenshot per view;
//                               HELPSHOTS=/some/dir saves each open help panel's widget (DSF=2 for sharp pictures)
// It needs a Chromium: BRB_CHROMIUM, else the repo's pinned browser where it is installed, else Playwright's own.
import fs from 'node:fs';
import os from 'node:os';
process.env.BRB_DB = ':memory:'; process.env.BRB_SILENT = '1'; process.env.LOG_REQUESTS = '0';
process.env.BRB_DATA_DIR = fs.mkdtempSync(os.tmpdir() + '/brb-dashfit-');
const { chromium } = await import('@playwright/test');
const { config } = await import('../server/config.js');
config.anthropicKey = '';
const { q } = await import('../server/db.js');
const { createUser, startSession, getUser } = await import('../server/auth.js');
const S = await import('../server/services/schools.js');
const L = await import('../server/services/lessons.js');
const DM = await import('../server/services/dash-media.js');
const games = await import('../server/services/games.js');
const D = await import('../server/services/dash.js');
const DT = await import('../server/services/dash-tools.js');
const { createApp } = await import('../server/app.js');
const { tFor } = await import('../server/i18n/index.js');

const OUT = process.env.OUT || '';
if (OUT) fs.mkdirSync(OUT, { recursive: true });
D._setWeatherFetch(async url => ({ ok: true, json: async () => (String(url).includes('geocoding') ? { results: [] } : { current: { temperature_2m: -12.4, weather_code: 95, is_day: 1 }, daily: { temperature_2m_max: [-3.1], temperature_2m_min: [-18.6] } }) }));

// ---------------------------------------------------------------- a class with everything on it
const boss = createUser({ username: 'FitBoss', password: 'secret123', role: 'admin' });
const school = S.createSchool(boss, { name: 'Fit Check School' }).school;
const T = getUser(S.createSchoolAccount(boss, school.id, { rosterName: 'Teacher', role: 'teacher' }).user.id);
const C = S.createClass(T, school.id, { name: 'Klasse 4B Ahornbaum' }).class;
const NAMES = ['WunderbarerOtter42', 'QuietPanda88', 'SuperSchnellerFuchs7', 'ZippyKoala31', 'MapleOwl55', 'CosmoTiger23', 'PixelHare64', 'LuckyWren19', 'BraveFox17', 'SunnyOtter12'];
const kids = NAMES.map((n, i) => { const u = S.createSchoolAccount(T, school.id, { rosterName: `Real ${i}` }).user; S.addToClass(boss, C.id, u.id); q.run('UPDATE users SET display_name=? WHERE id=?', n, u.id); return getUser(u.id); });
const game = n => { const g = games.createGame(T.id, { title: n, icon: '🎮' }); const v = games.addVersion(g.id, '<title>G</title><canvas></canvas>'); q.run("UPDATE games SET status='published', visibility='public', published_version_id=? WHERE id=?", v.id || v, g.id); return g; };
const g1 = game('Bruchrechnen-Pizzabäckerei'), g2 = game('Number Line Hop'), g3 = game('Word Garden');
// Stage 4: the official games "Practice it" links to (long titles, so the links are checked at their widest).
{
  const off = q.get("SELECT * FROM users WHERE username='OombaAcademy'") || createUser({ username: 'OombaAcademy', password: 'secret123', role: 'admin' });
  for (const slug of new Set(Object.values(D.PRACTICE).flat())) {
    const g = games.createGame(off.id, { title: `${slug.replace(/-/g, ' ')} Abenteuerspielplatz`, icon: '🎮' }); const v = games.addVersion(g.id, '<title>G</title><canvas></canvas>');
    q.run('DELETE FROM games WHERE slug=? AND id<>?', slug, g.id);
    q.run("UPDATE games SET slug=?, source='seed', status='published', visibility='public', published_version_id=? WHERE id=?", slug, v.id || v, g.id);
  }
}
const lesson = L.createLesson(T, school.id, { title: 'Vergleichen von Brüchen mit ungleichen Nennern' }).lesson; L.assign(T, C.id, lesson.id);
const cl = L.classLessons(C.id)[0];
const link = D.addLink(T, C, { url: 'https://bibliothek.example.org/kinder/lesen/geschichten', title: 'Schulbibliothek und Leseecke' }).link;
const ymd = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date());
/** A day n days from today (school time zone), as YYYY-MM-DD. */
const dayAt = n => new Date(Date.parse(`${ymd}T12:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
const SETTINGS = {
  clock: { face: 'analog', zone2: 'America/Argentina/Buenos_Aires' },
  text: { title: 'Heute im Unterricht', body: 'Rechtschreibübungsheft Seite zweiundzwanzig\nMathematikwettbewerbsvorbereitung\nLesen' },
  ican: { goal: 'Ich kann Brüche mit ungleichen Nennern miteinander vergleichen und ordnen.' },
  timer: { minutes: 125 },
  schedule: { periods: [['Morgenkreis und Begrüßung', '08:00', '08:20'], ['Mathematikunterricht', '08:20', '09:05'], ['Pause', '09:05', '09:25'], ['Naturwissenschaften', '09:25', '10:10'], ['Kunst', '10:10', '10:55'], ['Musik', '10:55', '11:40']].map(([name, start, end]) => ({ name, start, end })) },
  weather: { place: { name: 'Llanfairpwllgwyngyll, Isle of Anglesey, United Kingdom', lat: 53.22, lon: -4.2 } },
  qr: { target: { kind: 'link', ref: link.id } },
  picker: { mode: 'wheel' },
  // Several countdowns in one card, as many as a card holds (8): more than fit (whole rows, the fade), long German
  // labels, one today, one tomorrow (hours and minutes), one more than a year away (three-figure days), one gone by.
  countdown: { events: [
    { label: 'Klassenausflug ins Naturkundemuseum mit Picknick', date: dayAt(0), time: '' },
    { label: 'Elternsprechtagsvorbereitungstreffen', date: dayAt(1), time: '09:00' },
    { label: 'Weihnachtsfeier der Grundschule Ahornbaum', date: dayAt(12), time: '10:30' },
    { label: 'Abschlussfeier und Zeugnisübergabe', date: dayAt(400), time: '' },
    { label: 'Laternenumzug', date: dayAt(-1), time: '17:00' },
    { label: 'Projektwoche „Unsere Umwelt“', date: dayAt(30), time: '' },
    { label: 'Vorlesewettbewerb der vierten Klassen', date: dayAt(5), time: '11:15' },
    { label: 'Bundesjugendspiele', date: dayAt(60), time: '08:00' }] },
  calendar: { marks: [{ date: `${ymd.slice(0, 8)}28`, label: 'Schulbuchausstellung im Foyer' }, { date: `${ymd.slice(0, 8)}27`, label: 'Science show' }] },
  light: { color: 'yellow', yellow: 'Leise Stimmen, bitte flüstern' },
  dice: { count: 6 },
  random: { min: -9999, max: 9999 },
  groups: { by: 'count', n: 3 },
  score: { teams: 'Die Sternschnuppen\nRaketen\nKometen\nPlaneten', scores: [-9999, 9999, 12, 0] },
  tiles: { tiles: [{ kind: 'game', ref: g1.id }, { kind: 'game', ref: g2.id }, { kind: 'game', ref: g3.id }, { kind: 'lesson', ref: cl.id }] },
  // stage 3: busy states (three fractions, long ranges, a 12 x 12 grid, elapsed time across noon...)
  fractions: { state: { bars: [{ n: 3, d: 4 }, { n: 5, d: 8 }, { n: 7, d: 12 }], same: true } },
  numline: { state: { lo: -2, hi: 3, sub: 4, mode: 'fraction', points: [-5, 3], jumps: [{ a: 0, b: 3 }, { a: 3, b: 6 }, { a: 6, b: 9 }] } },
  coord: { state: { mi: 14, b: -1, points: [{ x: 2, y: 3 }, { x: -4, y: -2 }] } },
  graph: { state: { kind: 'bar', title: 'Lieblingsobst unserer Klasse im Herbst', rows: [{ l: 'Äpfel', v: 12 }, { l: 'Bananen', v: 7 }, { l: 'Weintrauben', v: 9 }, { l: 'Erdbeeren', v: 15 }, { l: 'Kiwi', v: 3 }] } },
  base10: { state: { h: 9, t: 14, o: 17 } },
  placeval: { state: { v: 9876543 } },
  tenframe: { state: { frames: 2, cells: [1, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 1, 1] } },
  hundreds: { state: { shade: [1, 12, 23, 34, 45, 56, 67, 78, 89, 100], skip: 7, hide: 'shaded' } },
  area: { state: { a: 23, b: 14, view: 'area', sa: 20, sb: 10 } },
  times: { state: { size: 12, r: 12, c: 12, mark: 'turn' } },
  tclock: { state: { t: 11 * 60 + 40, end: 13 * 60 + 15, el: true } },
  fdp: { state: { n: 1, d: 7 } },
  board: { bg: 'lined' },
  picture: { alt: 'Ein Ankerdiagramm: Brüche als Teile eines Ganzen', fit: 'contain' },
  // stage 4: busy states (many bands and blocks, a reflex angle, a half-folded cylinder, a full mat, long words...)
  geoboard: { state: { pegs: 11, cur: 0, bands: [{ pts: [{ x: 1, y: 1 }, { x: 8, y: 2 }, { x: 9, y: 7 }, { x: 3, y: 9 }, { x: 2, y: 5 }], closed: true }, { pts: [{ x: 5, y: 4 }, { x: 7, y: 5 }, { x: 6, y: 8 }], closed: false }] } },
  pattern: { state: { blocks: [{ k: 'hex', x: 3, y: 5, r: 0 }, { k: 'hex', x: 7, y: 5, r: 0 }, { k: 'trap', x: 11, y: 5, r: 0 }, { k: 'trap', x: 15, y: 5, r: 6 }, { k: 'rhom', x: 17, y: 5, r: 2 }, { k: 'tri', x: 21, y: 5, r: 0 }, { k: 'tri', x: 23, y: 5, r: 2 }, { k: 'sq', x: 4, y: 8, r: 0 }, { k: 'thin', x: 10, y: 8, r: 1 }, { k: 'rhom', x: 16, y: 8, r: 0 }] } },
  angle: { state: { a: 235, step: 5 } },
  solids: { state: { shape: 'cylinder', fold: 60, mark: 'faces', yaw: 40 } },
  transform: { state: { shape: 'arrow', op: 'rotate', turn: 270, ox: 2, oy: 1 } },
  balance: { state: { x: 4, lx: 5, lu: 3, rx: 2, ru: 15, hist: [{ lx: 6, lu: 3, rx: 3, ru: 15, op: 'subx', n: 0, w: 'both' }] } },
  algebra: { state: { tiles: [...Array(4)].map(() => ({ k: 'x2', neg: false })).concat([...Array(2)].map(() => ({ k: 'x2', neg: true })), [...Array(6)].map(() => ({ k: 'x', neg: false })), [...Array(4)].map(() => ({ k: 'x', neg: true })), [...Array(7)].map(() => ({ k: '1', neg: false })), [...Array(5)].map(() => ({ k: '1', neg: true }))) } },
  coins: { state: { cur: 'eur', counts: [3, 2, 1, 4, 2, 1, 2, 1, 1, 1, 1] } },
  chance: { state: { kind: 'dice', dice: 2, runs: 1000, counts: [28, 55, 83, 110, 139, 166, 139, 110, 83, 55, 28] } },
  letters: { state: { fam: '', word: [...'grasshoppers'].map(c => c.charCodeAt(0) - 97), caps: false } },
  organizer: { state: { kind: 'story', title: 'Die Geschichte vom kleinen Drachen Kokosnuss und seinen Freunden', boxes: [
    { h: '', t: 'Kokosnuss, ein kleiner Feuerdrache\nMatilda, das Stachelschwein\nOskar, der Fressdrache' }, { h: '', t: 'Die Dracheninsel, ein Sommer voller Abenteuer' },
    { h: '', t: 'Kokosnuss kann noch nicht fliegen, und alle anderen Drachen lachen über ihn.' }, { h: '', t: 'Erstens übt er jeden Morgen\nZweitens hilft ihm Matilda\nDrittens fällt er ins Wasser\nViertens versucht er es noch einmal\nFünftens fliegt er ein kleines Stück\nSechstens feiern alle' },
    { h: '', t: 'Er schafft es am Ende, weil er nie aufgibt.' }] } },
  rods: { state: { eq: true, model: true, l: [5, 4], r: [0, 3], rods: [{ n: 5, x: 1, y: 1 }, { n: 4, x: 6, y: 1 }, { n: 3, x: 7, y: 3 }, { n: 6, x: 1, y: 3 }, { n: 10, x: 2, y: 7 }, { n: 17, x: 2, y: 9 }] } },
  map: { state: { kind: 'world', names: true, pins: [{ x: 605, y: 250, l: 'Hier wohnt Oma' }, { x: 260, y: 130, l: 'Klassenfahrt' }, { x: 860, y: 340, l: 'Kängurus' }, { x: 740, y: 120, l: '' }, { x: 330, y: 310, l: 'Regenwald am Amazonas' }] } },
  // stage 5: busy states (every option on, long words, a pass over its time, more jobs than fit)
  video: { video: { p: 'youtube', id: 'aqz-KE-bpKQ' }, start: 95, end: 3725, mute: true, loop: true },
  site: { url: 'https://bibliothek.example.org/kinder/lesen' },
  hallpass: { oneOut: false, mins: 3 },
  jobs: { jobs: 'Tafeldienst und Schwammauswaschdienst\nBlumengießdienst\nTürdienst\nLichtdienst\nAustragedienst für Arbeitsblätter\nBücherkistenordnungsdienst\nPapierkorbdienst\nReihenführung\nFensterdienst\nComputerdienst', crew: { order: [], shift: 3 } },
  breathe: { pace: 'box' },
  note: { body: 'Elternabend vorbereiten: Rechtschreibhefte einsammeln und Klassenfotos austeilen!', color: 'pink' },
  checklist: { title: 'Bevor wir nach Hause gehen', items: 'Arbeitsplatz aufräumen und Stifte einsammeln\nHausaufgabenheft einpacken\nStuhl hochstellen\nJacke anziehen\nTschüss sagen', ticks: [true, true, false, true] },
};
// Stage 5: the scoreboard's points for each student and the schedule's "now and next" are checked as widgets of their own.
const TIME_EXTRA = [{ ...D.widgetType('timer'), wid: 'wstopwatch', s: { mode: 'stopwatch' } }];
const STAGE5_EXTRA = [
  { ...D.widgetType('score'), wid: 'wpoints', s: { mode: 'students' } },
  { ...D.widgetType('schedule'), wid: 'wnownext', s: { ...SETTINGS.schedule, view: 'nownext' } },
  // A countdown card with one event keeps the big boxes it always had (a long label, days, hours and minutes).
  { ...D.widgetType('countdown'), wid: 'wcount1', s: { events: [{ label: 'Klassenausflug ins Naturkundemuseum', date: dayAt(38), time: '09:00' }] } },
];
// Stage 4 review: the organizers written in where they are, as widgets of their own: a sequence with its most steps, a
// Venn diagram and main idea with its most details, all with long German words (the story map above stays too).
const LONG = ['Die Raupe frisst sich durch das Blatt', 'Sie verpuppt sich in einem Kokon', 'Schmetterlingsflügelentfaltung', 'Der Schmetterling trocknet seine Flügel in der Sonne'];
// The shape board (docs/decisions.md "Shape board"): twelve bands with labels, angles, text labels, pen strokes and a long
// German challenge; triangle dots; and the circle, as widgets of their own.
const GB = (...a) => { const o = []; for (let i = 0; i < a.length; i += 2) o.push({ x: a[i], y: a[i + 1] }); return o; };
const GEO_BANDS = [GB(0, 0, 3, 0, 0, 3), GB(4, 0, 7, 0, 7, 2, 4, 2), GB(8, 0, 10, 1, 9, 3), GB(1, 4, 3, 4, 3, 6, 1, 6), GB(4, 3, 6, 3, 7, 5, 5, 6, 4, 5), GB(8, 4, 10, 4, 10, 7, 8, 7),
  GB(0, 7, 2, 7, 1, 9), GB(3, 7, 6, 7, 5, 9, 3, 9), GB(7, 8, 10, 8, 10, 10, 7, 10), GB(0, 10, 2, 10, 1, 9), GB(3, 10, 5, 10, 4, 9), GB(6, 6, 7, 6, 7, 7)];
const GEO_EXTRA = [
  { ...D.widgetType('geoboard'), wid: 'wgeobusy', s: { state: { pegs: 11, cur: 4, labels: true, angles: true, lines: true, title: 'Baue Formen mit zwölf Quadrateinheiten Flächeninhalt – wie viele findest du?',
    bands: GEO_BANDS.map((pts, i) => ({ pts, closed: true, c: i % 7 })),
    notes: [{ x: 500, y: 40, t: 'Gleicher Flächeninhalt?' }, { x: 150, y: 960, t: 'Rechtwinkliges Dreieck' }], ink: [{ c: 1, p: [100, 100, 200, 160, 300, 120, 400, 200] }, { c: 3, p: [600, 800, 700, 900] }] } } },
  { ...D.widgetType('geoboard'), wid: 'wgeoiso', s: { state: { board: 'iso', pegs: 9, cur: 0, labels: true, angles: true, title: 'Sechsecke aus kleinen Dreiecken',
    bands: [{ pts: [{ x: 4, y: 1 }, { x: 6, y: 1 }, { x: 7, y: 3 }, { x: 6, y: 5 }, { x: 4, y: 5 }, { x: 3, y: 3 }], closed: true, c: 4 }, { pts: [{ x: 1, y: 6 }, { x: 3, y: 6 }, { x: 2, y: 8 }], closed: true, c: 5 }] } } },
  { ...D.widgetType('geoboard'), wid: 'wgeocircle', s: { state: { board: 'circle', ring: 24, cur: 1, labels: true, angles: true, lines: true,
    bands: [{ pts: [0, 4, 8, 12, 16, 20].map(x => ({ x, y: 0 })), closed: true, c: 0 }, { pts: [0, 9, 24].map(x => ({ x, y: 0 })), closed: true, c: 1 }] } } },
];
const STAGE4_EXTRA = [...GEO_EXTRA,
  { ...D.widgetType('organizer'), wid: 'worgseq', s: { state: { kind: 'seq', n: 10, title: 'Die Verwandlung der kleinen Raupe Nimmersatt', boxes: Array.from({ length: 10 }, (_, i) => ({ h: i === 3 ? 'Verpuppungszeitraum' : '', t: LONG.slice(0, 1 + (i % 4)).join('\n') })) } } },
  { ...D.widgetType('organizer'), wid: 'worgvenn', s: { state: { kind: 'venn', title: 'Frösche und Kröten im Vergleich', boxes: [{ h: 'Froschlurche', t: 'Glatte, feuchte Haut\nLange Hinterbeine\nLeben am Wasser' }, { h: '', t: 'Amphibienentwicklung\nLegen Eier\nKönnen schwimmen' }, { h: 'Kröten', t: 'Warzige, trockene Haut\nKurze Beine\nLeben an Land' }] } } },
  { ...D.widgetType('organizer'), wid: 'worgmain', s: { state: { kind: 'main', d: 6, title: 'Warum Bienen wichtig sind', boxes: [{ h: '', t: 'Bienen bestäuben Pflanzen und sichern unsere Ernährung' }, ...Array.from({ length: 6 }, (_, i) => ({ h: '', t: LONG[i % 4] }))] } } },
];
// Help on the maths tools: the fraction tool's Add (circles, more than one whole), Subtract (below zero, so Swap shows)
// and Multiply (a whole number, so the square repeats), as widgets of their own. Fractions as a number sentence
// (docs/decisions.md): Divide in circles past one whole, and one (wfrswitch) whose mode and view the teacher's screen
// switches in turn before it is checked (Subtract in circles with the answer hidden, then Divide in bars... the pictures
// were once drawn over the mode buttons after a switch).
// Maths tools combined: every mode that was a tool of its own, as a widget of the tool it is a mode of now (with the busy
// state it had), and the number chart's 1-120.
const MODE_WIDGET = m => ({ ...D.widgetType(DT.MODE_HOME[m]), wid: `wmode${m}`, s: { state: { tab: m, [m]: SETTINGS[m].state } } });
const MODE3 = ['base10', 'times', 'fdp', 'graph'].map(MODE_WIDGET).concat([{ ...D.widgetType('hundreds'), wid: 'wn120', s: { state: { upto: 120, shade: [101, 110, 120], skip: 4 } } },
  // A graph whose tallest bar is exactly the top of its scale, under a title: its number once ran into the title.
  { ...D.widgetType(DT.MODE_HOME.graph), wid: 'wgraphtop', s: { state: { tab: 'graph', graph: { kind: 'bar', title: 'Haustiere unserer Klasse', rows: [{ l: 'Hunde', v: 4 }, { l: 'Katzen', v: 6 }, { l: 'Fische', v: 2 }] } } } }]);
const MODE4 = ['angle', 'solids', 'transform', 'balance'].map(MODE_WIDGET);
// Bar models and number rods (docs/decisions.md "Bar models and number rods"): bar models (a mode of Multiply and divide)
// with the most groups and the biggest numbers, four parts, two compared bars far apart and a long German word problem;
// number rods with the board full (60 rods, a train selected by nothing), the equation shown and its trains standing.
const BARS = (wid, bars) => ({ ...D.widgetType('area'), wid, s: { state: { tab: 'bars', bars } } });
const BARS_EXTRA = [
  BARS('wbarsmul', { kind: 'mul', g: 12, e: 100, unk: 1, story: 'Zwölf Schulklassen sammeln jeweils hundert Kastanien für das Herbstfest. Wie viele Kastanien sind es zusammen?' }),
  BARS('wbarspart', { kind: 'part', p: [999, 1, 250, 7], unk: 2, hide: false }),
  BARS('wbarscmp', { kind: 'cmp', ca: 999, cb: 1, unk: 0, bp: false }),
];
const FULL_RODS = (() => { const out = []; let x = 0, y = 0; for (let k = 0; out.length < 60; k++) { const n = (k % 10) + 1; if (x + n > 30) { x = 0; y++; } if (y > 15) break; out.push({ n, x, y }); x += n; } return out; })();
const RODS_EXTRA = [
  { ...D.widgetType('rods'), wid: 'wrodsfull', s: { state: { rods: FULL_RODS, eq: true, l: [9, 8], r: [0, 3], long: 20 } } },
  { ...D.widgetType('rods'), wid: 'wrodsv', s: { state: { dir: 'v', eq: true, l: [3, 4], r: [2, 0], model: true, rods: [{ n: 3, x: 1, y: 1, v: true }, { n: 4, x: 1, y: 4, v: true }, { n: 2, x: 3, y: 1, v: true }, { n: 12, x: 6, y: 2 }] } } },
];
const FRACTION_EXTRA = [
  { ...D.widgetType('fractions'), wid: 'wfrdiv', s: { state: { mode: 'div', shape: 'circle', a: { n: 7, d: 4 }, b: { n: 5, d: 6 } } } },
  { ...D.widgetType('fractions'), wid: 'wfrswitch', s: { state: { mode: 'sub', shape: 'circle', hide: true } } },
  { ...D.widgetType('fractions'), wid: 'wfradd', s: { state: { mode: 'add', shape: 'circle', a: { n: 7, d: 4 }, b: { n: 5, d: 6 } } } },
  { ...D.widgetType('fractions'), wid: 'wfrsub', s: { state: { mode: 'sub', a: { n: 1, d: 3 }, b: { n: 11, d: 12 } } } },
  { ...D.widgetType('fractions'), wid: 'wfrmul', s: { state: { mode: 'mul', a: { n: 3, d: 1 }, b: { n: 7, d: 12 } } } },
];
// A real picture for the Picture widget (drawn in the browser, then through the stage 1 checks like any upload).
const exe0 = [process.env.BRB_CHROMIUM, '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find(p => p && fs.existsSync(p));
{
  const b = await chromium.launch(exe0 ? { executablePath: exe0 } : {}); const pg = await b.newPage();
  const data = await pg.evaluate(() => { const c = document.createElement('canvas'); c.width = 800; c.height = 520; const g = c.getContext('2d');
    g.fillStyle = '#FFFDF2'; g.fillRect(0, 0, 800, 520); g.fillStyle = '#141414'; g.font = 'bold 44px sans-serif'; g.fillText('Fractions', 40, 70);
    const cols = ['#66C792', '#FFD23F', '#5AA9D6', '#F28C6B'];
    for (let i = 0; i < 4; i++) { g.fillStyle = cols[i]; g.beginPath(); g.moveTo(560, 300); g.arc(560, 300, 170, i * Math.PI / 2, (i + 1) * Math.PI / 2); g.fill(); g.stroke(); }
    g.font = '32px sans-serif'; g.fillText('1/4 + 1/4 = 2/4', 40, 160); g.fillText('2/4 = 1/2', 40, 220); return c.toDataURL('image/jpeg', 0.85); });
  await b.close();
  SETTINGS.picture.pic = D.savePicture(T, C, Buffer.from(data.split(',')[1], 'base64'), { use: 'show' }).id;
}
/** Every widget type, packed in reading order, at its default size or its smallest, over as many layouts as needed (a
 *  layout holds 24 widgets and 24 rows). Stage 1 and 2 widgets and stage 3 widgets go on separate layouts. */
const STAGE3 = new Set(['fractions', 'numline', 'coord', 'graph', 'base10', 'placeval', 'tenframe', 'hundreds', 'area', 'times', 'tclock', 'fdp', 'board', 'picture']);
const STAGE4 = new Set(['geoboard', 'pattern', 'angle', 'solids', 'transform', 'balance', 'algebra', 'coins', 'chance', 'letters', 'organizer', 'map', 'rods']);
const STAGE5 = new Set(['video', 'site', 'camera', 'hallpass', 'jobs', 'mood', 'breathe', 'note', 'checklist']);
const TOOLSET = new Set([...STAGE3, ...STAGE4]);
const pack = (key, types) => { const out = []; let cur = [], x = 0, y = 0, rowH = 0;
  for (const t of types) { const [w, h] = t[key]; if (x + w > 12) { x = 0; y += rowH; rowH = 0; } if (y + h > 24 || cur.length >= 24) { out.push(cur); cur = []; x = 0; y = 0; rowH = 0; }
    cur.push({ id: t.wid || `w${t.id}`, type: t.id, x, y, w, h, s: t.s || SETTINGS[t.id] || {}, pin: D.canPin(t) }); x += w; rowH = Math.max(rowH, h); }
  if (cur.length) out.push(cur); return out; };
D.ensureLayouts(T, C, tFor('en'));
const first = D.layoutsOf(C.id, T.id)[0];
const LAYOUTS = [];
for (const size of ['size', 'min']) {
  const chunks = [...pack(size, D.WIDGETS.filter(t => !TOOLSET.has(t.id) && !STAGE5.has(t.id)).flatMap(t => (t.id === 'timer' ? [t, ...TIME_EXTRA] : [t]))), ...pack(size, [...D.WIDGETS.filter(t => STAGE3.has(t.id)), ...FRACTION_EXTRA, ...MODE3]), ...pack(size, [...D.WIDGETS.filter(t => STAGE4.has(t.id)), ...MODE4, ...STAGE4_EXTRA]), ...pack(size, [...BARS_EXTRA, ...RODS_EXTRA]),
    ...pack(size, [...D.WIDGETS.filter(t => STAGE5.has(t.id)), ...STAGE5_EXTRA]).map(c => Object.assign(c, { stage5: true }))];
  chunks.forEach((widgets, k) => {
    const name = `${size === 'size' ? 'default' : 'min'}${k ? `-${k + 1}` : ''}`;
    // On a layout with tools, each student has every tool their own screen can hold.
    const own = widgets.filter(w => D.canAdd(D.widgetType(w.type), 'student') && TOOLSET.has(w.type)).map(({ pin, ...w }) => w);
    // A student's own timer and stopwatch (their mode switch shows only there and on the teacher's screen).
    if (widgets.some(w => w.type === 'timer')) for (const [id, mode] of [['mytimer', 'timer'], ['mystopwatch', 'stopwatch']]) { const [tw, th] = D.widgetType('timer')[size]; own.push({ id, type: 'timer', x: 0, y: 0, w: tw, h: th, s: { mode } }); }
    // Stage 4: more layouts than a teacher may keep (12), so one layout is filled with each set in turn.
    LAYOUTS.push({ key: name, widgets, own, chip: 1, stage5: !!widgets.stage5 });
  });
}
// Ready-made layouts: built per language in the loop below.
for (const x of D.LAYOUT_TEMPLATES) LAYOUTS.push({ key: `tpl-${x.id}`, tpl: x.id, widgets: [], own: [], chip: 1, stage5: false });
// The schedule at pinned times of day (docs/decisions.md "Classroom dashboards: the schedule at every time of day"): the
// browser's clock is pinned (Playwright's page.clock) and the browser is in the school's time zone, so the period on now,
// the list's scroll and the "now and next" text are the same on every run. Every other layout is checked at AT (school
// time, default 10:20: the list rests scrolled down, on the period on now). The schedule's own layout, list and "now and
// next" at their default, smallest, 3 x 3 and a wide short size, is checked at each time in SCHED_AT: before school, the
// first period (and its last minute), the break, mid-day, the last period and after school.
const AT = process.env.AT || '10:20';
const SCHED_AT = (process.env.SCHED_AT || '07:30,08:05,08:19,09:10,10:20,11:30,12:30').split(',').filter(Boolean);
{
  const sch = D.widgetType('schedule'), list = { ...SETTINGS.schedule, view: 'list' }, nn = { ...SETTINGS.schedule, view: 'nownext' };
  const [dw, dh] = sch.size, [mw, mh] = sch.min;
  const widgets = [
    { id: 'wsched-list', type: 'schedule', x: 0, y: 0, w: dw, h: dh, s: list },
    { id: 'wsched-nn', type: 'schedule', x: dw, y: 0, w: dw, h: dh, s: nn },
    { id: 'wsched-list3', type: 'schedule', x: 2 * dw, y: 0, w: 3, h: 3, s: list },
    { id: 'wsched-listmin', type: 'schedule', x: 0, y: dh, w: mw, h: mh, s: list },
    { id: 'wsched-nnmin', type: 'schedule', x: mw, y: dh, w: mw, h: mh, s: nn },
    { id: 'wsched-nn3', type: 'schedule', x: 2 * mw, y: dh, w: 3, h: 3, s: nn },
    { id: 'wsched-listwide', type: 'schedule', x: 0, y: dh + 3, w: 6, h: mh, s: list },
    { id: 'wsched-nnwide', type: 'schedule', x: 6, y: dh + 3, w: 6, h: mh, s: nn },
  ].map(w => ({ ...w, pin: true }));
  for (const at of SCHED_AT) LAYOUTS.push({ key: `sched-${at.replace(':', '')}`, at, widgets, own: [], chip: 1, stage5: false });
}
const ZONE = S.zoneOf(S.getSchool(school.id)) || D.FALLBACK_TZ;
/** Today's hh:mm in the school's time zone, as a time for the browser's clock. */
const schoolTime = hhmm => {
  const [h, m] = hhmm.split(':').map(Number), want = h * 60 + m;
  let t = Date.parse(`${ymd}T${hhmm}:00Z`);
  for (let k = 0; k < 3; k++) {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: ZONE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(t).map(x => [x.type, x.value]));
    let d = want - (Number(p.hour) * 60 + Number(p.minute)); if (d > 720) d -= 1440; if (d < -720) d += 1440;
    t += d * 60e3;
  }
  return t;
};
const wantSizes = (process.env.SIZES || '') ? process.env.SIZES.split(',') : null;
const RUN = wantSizes ? LAYOUTS.filter(l => wantSizes.includes(l.key) || wantSizes.includes(l.key.split('-')[0])) : LAYOUTS;
D.updateLayout(T, C, first.id, { name: LAYOUTS[0].key, widgets: LAYOUTS[0].widgets });
D.useLayout(T, C, first.id);
D.timerAction(T, C, 'wtimer', { action: 'start' }, Date.now() - 65e3);
D.timerAction(T, C, 'wstopwatch', { action: 'start' }, Date.now() - 3725e3);
for (const k of kids.slice(0, 6)) D.helpAsk(k, C, 'help');
for (const k of kids.slice(6, 9)) D.helpAsk(k, C, 'done');
const check = D.createCheck(T, C, { kind: 'choice', question: 'Welche Bruchzahl ist größer, wenn die Nenner verschieden sind?', options: ['Dreiviertel', 'Zweidrittel', 'Fünfachtel', 'Beide sind genau gleich groß', 'Weiß ich nicht', 'Sechszehntel'] }).check;
kids.forEach((k, i) => D.answerCheck(k, C, check, i % 6));
D.pickerAction(T, C, { action: 'away', user: kids[9].id, on: true });
D.weatherFor(SETTINGS.weather.place);
// Stage 5: passes (two out, one long past its time; three asking), points, moods. The site check is stubbed: the
// default-size window may be framed, the smallest one is refused (its fallback card is the bigger content).
let siteOk = true;
DM._setSiteProbe(async url => ({ frame: siteOk ? 'ok' : 'blocked', origins: [new URL(url).origin] }));
function seed5() {
  q.run('DELETE FROM dash_passes WHERE class_id=?', C.id);
  const t0 = Date.now(), day = D.dayOf(C);
  const pass = (k, place, state, ago) => q.run('INSERT INTO dash_passes(id, class_id, user_id, place, day, state, asked_at, out_at) VALUES (?,?,?,?,?,?,?,?)', `p${k.id.slice(0, 8)}`, C.id, k.id, place, day, state, t0 - ago - 5e3, state === 'out' ? t0 - ago : null);
  pass(kids[0], 'nurse', 'out', 11 * 60e3); pass(kids[1], 'bathroom', 'out', 95e3); pass(kids[2], 'library', 'asked', 30e3); pass(kids[3], 'office', 'asked', 20e3); pass(kids[4], 'water', 'asked', 10e3);
  kids.forEach((k, i) => { for (let j = 0; j <= i % 4; j++) D.pointsAction(T, C, { action: 'award', user: k.id, reason: D.POINT_REASONS[(i + j) % 8] }); });
  kids.slice(0, 8).forEach((k, i) => D.setMood(k, C, i % 5));
}
await new Promise(r => setTimeout(r, 30));

// ---------------------------------------------------------------- the browser checks
const server = createApp().listen(0); await new Promise(r => server.once('listening', r));
const base = `http://127.0.0.1:${server.address().port}`;
const cookieFor = id => { let c = ''; startSession({ append: (k, v) => { c = v.split(';')[0]; } }, id); return c; };
const exe = exe0;
// Stage 5: Chromium's fake camera stands in for a document camera.
const browser = await chromium.launch({ ...(exe ? { executablePath: exe } : {}), args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
/** Stage 5: the outside pages are stubs the browser answers itself (nothing leaves the machine). */
const STUB = (title, bg) => `<!doctype html><html><body style="margin:0;height:100vh;display:grid;place-items:center;background:${bg};color:#fff;font:700 18px sans-serif">${title}</body></html>`;
async function stubOutside(page) {
  await page.route(/^https:\/\/(www\.youtube-nocookie\.com|player\.vimeo\.com)\//, r => r.fulfill({ status: 200, contentType: 'text/html', body: STUB('▶ video', '#202020') }));
  await page.route(/^https:\/\/bibliothek\.example\.org\//, r => r.fulfill({ status: 200, contentType: 'text/html', body: STUB('bibliothek.example.org', '#2F6F5E') }));
}

/** In the page: every problem with every widget. */
function problems() {
  const out = [];
  const name = w => w.querySelector('.dash-wt')?.textContent || w.dataset.id;
  const scrolls = x => { const st = getComputedStyle(x); return (/(auto|scroll)/.test(st.overflowY) && x.scrollHeight > x.clientHeight + 1) || (/(auto|scroll)/.test(st.overflowX) && x.scrollWidth > x.clientWidth + 1); };
  const clips = x => { const st = getComputedStyle(x); return st.overflowX !== 'visible' || st.overflowY !== 'visible'; };
  const label = e => (e.getAttribute('aria-label') || e.textContent || e.className || e.tagName).toString().trim().replace(/\s+/g, ' ').slice(0, 30);
  /** A control's painted box: its border box (with transforms) grown by its outer box-shadows. */
  const painted = e => {
    const r = e.getBoundingClientRect();
    let { left, right, top, bottom } = r;
    const sh = getComputedStyle(e).boxShadow;
    if (sh && sh !== 'none') {
      for (const part of sh.split(/,(?![^(]*\))/)) {
        if (/\binset\b/.test(part)) continue;
        const n = (part.replace(/rgba?\([^)]*\)|#[0-9a-f]+|[a-z-]+\([^)]*\)/gi, '').match(/-?[\d.]+px/g) || []).map(parseFloat);
        const [x = 0, y = 0, blur = 0, spread = 0] = n, ext = spread + blur / 2;
        left = Math.min(left, r.left + x - ext); right = Math.max(right, r.right + x + ext);
        top = Math.min(top, r.top + y - ext); bottom = Math.max(bottom, r.bottom + y + ext);
      }
    }
    return { left, right, top, bottom, width: right - left, height: bottom - top };
  };
  const CONTROL = 'button, a[href], input, select, textarea, [role="button"]';
  for (const w of document.querySelectorAll('.dash-w')) {
    const b = w.querySelector('.dash-wb'); if (!b || !w.offsetParent) continue;
    const dbg = window.__fitDebug ? ` [body ${b.clientHeight}: ${[...b.children].map(x => `${x.className}=${Math.round(x.getBoundingClientRect().height)}`).join(', ')}]` : '';
    if (b.scrollHeight > b.clientHeight + 1) out.push(`${name(w)}: content is ${b.scrollHeight - b.clientHeight}px taller than the widget${dbg}`);
    if (b.scrollWidth > b.clientWidth + 1) out.push(`${name(w)}: content is ${b.scrollWidth - b.clientWidth}px wider than the widget`);
    // A graph's title never touches a number above a bar or a point (they once collided on a tall bar).
    for (const t of w.querySelectorAll('.dt-gtitle')) {
      const tr = t.getBoundingClientRect();
      for (const v of t.parentElement.querySelectorAll('.dt-gv')) {
        const vr = v.getBoundingClientRect();
        if (vr.left < tr.right && tr.left < vr.right && vr.top < tr.bottom + 2 && tr.top < vr.bottom) out.push(`${name(w)}: the graph's title touches the number "${v.textContent}"`);
      }
    }
    // The widget's inner edge: its padding box (inside the border).
    const wr = w.getBoundingClientRect(), wcs = getComputedStyle(w);
    const inner = { left: wr.left + parseFloat(wcs.borderLeftWidth), right: wr.right - parseFloat(wcs.borderRightWidth), top: wr.top + parseFloat(wcs.borderTopWidth), bottom: wr.bottom - parseFloat(wcs.borderBottomWidth) };
    const br = b.getBoundingClientRect();
    const sticks = [...b.querySelectorAll('.dw-stick,.dw-stick-top')];
    for (const e of b.querySelectorAll('*')) {
      if (e.closest('svg') && e.tagName.toLowerCase() !== 'svg') continue;
      const cs = getComputedStyle(e);
      if (cs.display === 'none' || cs.visibility === 'hidden' || !e.getClientRects().length || e.closest('.sr-only')) continue;
      const r = e.getBoundingClientRect(); if (!r.width && !r.height) continue;
      let p = e.parentElement, inScroller = false;
      while (p && p !== b) { if (scrolls(p)) { inScroller = true; break; } p = p.parentElement; }
      if (!inScroller && (r.left < br.left - 1 || r.right > br.right + 1 || r.top < br.top - 1 || r.bottom > br.bottom + 1)) out.push(`${name(w)}: "${label(e)}" goes outside the widget`);
      const own = [...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
      if (own && !inScroller && cs.display !== 'inline' && e.clientWidth > 0 && e.scrollWidth > e.clientWidth + 1) out.push(`${name(w)}: text "${label(e)}" is cut (${e.scrollWidth} > ${e.clientWidth})`);
      if (own && cs.textOverflow === 'ellipsis' && !e.title) out.push(`${name(w)}: "${label(e)}" can end in … without a title`);
      if (!e.matches(CONTROL) || inScroller) continue;
      const v = painted(e);
      // 12px from the widget's inner edge, all round (shadows and transforms included).
      const gap = Math.min(v.left - inner.left, inner.right - v.right, v.top - inner.top, inner.bottom - v.bottom);
      if (gap < 12 - 0.5) out.push(`${name(w)}: "${label(e)}" is ${Math.round(gap)}px from the widget's edge (needs 12)`);
      // Fully inside every ancestor that clips (up to the widget), shadows included.
      for (let a = e.parentElement; a && a !== w.parentElement; a = a.parentElement) {
        if (!clips(a) || scrolls(a)) continue;
        const ar = a.getBoundingClientRect();
        if (v.left < ar.left - 0.5 || v.right > ar.right + 0.5 || v.top < ar.top - 0.5 || v.bottom > ar.bottom + 0.5) { out.push(`${name(w)}: "${label(e)}" is clipped by ${a.className || a.tagName} (${['left', 'right', 'top', 'bottom'].filter(k => (k === 'left' || k === 'top') ? v[k] < ar[k] - 0.5 : v[k] > ar[k] + 0.5).join(', ')})`); break; }
      }
      if (!e.closest('.dw-stick,.dw-stick-top')) for (const st of sticks) { const q = st.getBoundingClientRect(); if (q.top < r.bottom - 1 && q.bottom > r.top + 1 && q.left < r.right && q.right > r.left) out.push(`${name(w)}: "${label(e)}" is under the widget's controls`); }
    }
  }
  // Stage 3: a teaching tool's model stays inside its own area (it never spills over the readout or the buttons), and the
  // tool's rows never overlap.
  for (const st of document.querySelectorAll('.dash-w .dt-stage')) {
    const w = st.closest('.dash-w'); if (!w.offsetParent) continue;
    const r = st.getBoundingClientRect();
    for (const e of st.querySelectorAll('*')) {
      if (e.closest('svg') && e.tagName.toLowerCase() !== 'svg') continue;
      const cs = getComputedStyle(e); if (cs.display === 'none' || cs.position === 'absolute' && e.classList.contains('dt-ghost') || e.closest('.sr-only') || !e.getClientRects().length) continue;
      // Stage 4: a list that grows (a graphic organizer's box, the coins on the mat) scrolls inside its own area, which
      // stays inside the model's area: what is scrolled out of view there is not spilling.
      let sc = e.parentElement, scrolled = false; while (sc && sc !== st) { if (scrolls(sc)) { scrolled = true; break; } sc = sc.parentElement; }
      if (scrolled) continue;
      const q = e.getBoundingClientRect(); if (!q.width && !q.height) continue;
      if (q.left < r.left - 1 || q.right > r.right + 1 || q.top < r.top - 1 || q.bottom > r.bottom + 1) { out.push(`${name(w)}: "${label(e)}" spills out of the tool's model area`); break; }
    }
    const rows = [...st.parentElement.children].filter(x => getComputedStyle(x).display !== 'none' && x.getClientRects().length && !x.classList.contains('dt-ghost'));
    for (let i = 1; i < rows.length; i++) { const a = rows[i - 1].getBoundingClientRect(), b = rows[i].getBoundingClientRect(); if (b.top < a.bottom - 1) out.push(`${name(w)}: "${rows[i].className}" overlaps "${rows[i - 1].className}"`); }
  }
  // Stage 3 review: small text, cut labels, and widgets hidden behind the bars.
  // Fractions as a number sentence: each bar's fraction is level with its bar, and the sentence reads left to right
  // (the first fraction, the second, the answer) in every language.
  for (const g of document.querySelectorAll('.dash-w .dt-fbars:not(.dt-fbars-above)')) {
    const w = g.closest('.dash-w'); if (!w.offsetParent) continue;
    const kids = [...g.children];
    for (let i = 0; i + 1 < kids.length; i += 2) {
      const a = kids[i].getBoundingClientRect(), b = kids[i + 1].getBoundingClientRect();
      if (Math.abs((a.top + a.bottom) / 2 - (b.top + b.bottom) / 2) > 2) out.push(`${name(w)}: a fraction is not level with its bar`);
    }
  }
  for (const f of document.querySelectorAll('.dash-w .dt-fo-circle')) {
    const w = f.closest('.dash-w'); if (!w.offsetParent) continue;
    const g = f.querySelector('.dt-fsent'), t = [0, 1, 2].map(i => g?.querySelector(`.dt-ft${i}`)?.getBoundingClientRect());
    if (!t[2]) { out.push(`${name(w)}: the circles are not a number sentence`); continue; }
    if (g.classList.contains('dt-fsent3')) { if (innerWidth >= 720) out.push(`${name(w)}: the circles are a column on a wide screen`); continue; }
    if (!(t[0].right <= t[1].left + 1 && Math.abs(t[0].bottom - t[1].bottom) < 2 && (t[1].right <= t[2].left + 1 || t[2].top >= t[1].bottom - 1))) out.push(`${name(w)}: the fractions' sentence does not read left to right`);
  }
  const projector = document.body.classList.contains('dash-projector'), floor = projector ? 13 : 12;
  for (const t of document.querySelectorAll('.dash-w .dt, .dash-w .dw5')) {
    const w = t.closest('.dash-w'); if (!w.offsetParent) continue;
    for (const e of t.querySelectorAll('*')) {
      const tag = e.tagName.toLowerCase();
      if (e.closest('.sr-only') || tag === 'tspan') continue;
      const inSvg = !!e.closest('svg') && tag !== 'svg';
      if (inSvg && tag !== 'text') continue;
      const txt = inSvg ? e.textContent.trim() : [...e.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join('').trim();
      if (!txt) continue;
      const cs = getComputedStyle(e);
      if (cs.display === 'none' || cs.visibility === 'hidden' || !e.getClientRects().length) continue;
      let size = parseFloat(cs.fontSize);
      if (inSvg) { const m = e.getScreenCTM(); size *= m ? Math.hypot(m.a, m.b) : 1; }
      if (size < floor - 0.25) out.push(`${name(w)}: "${txt.slice(0, 24)}" is ${size.toFixed(1)}px (needs ${floor})`);
      if (inSvg && e.closest('.dt-graph') && /…$/.test(txt)) out.push(`${name(w)}: the label "${txt}" is cut short`);
    }
  }
  // Stage 4 review: a short label (one word or number) never breaks across lines ("1" over "0" for 10).
  for (const w of document.querySelectorAll('.dash-w')) {
    if (!w.offsetParent) continue;
    const walker = document.createTreeWalker(w, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const txt = n.textContent.trim();
      if (!txt || /\s/.test(txt) || [...txt].length > 14 || n.parentElement.closest('.sr-only,svg')) continue;
      const r = document.createRange(); r.selectNodeContents(n);
      const tops = new Set([...r.getClientRects()].filter(q => q.width > 0.5).map(q => Math.round(q.top)));
      if (tops.size > 1) out.push(`${name(w)}: the label "${txt}" breaks across lines`);
    }
  }
  // Stage 5 review: a list that scrolls shows whole rows at rest, and fades at its bottom edge while there is more below.
  // A row sliced through by the list's edge fails (a .dw-scroll list always; any other scrolling list unless it carries
  // the fade); so does a list with more below and no fade. The schedule (docs/decisions.md "Classroom dashboards: the
  // schedule at every time of day") rests with the period on now in view, so a list may rest scrolled down: then no row
  // may be sliced by its top edge either, and the rows above need the fade at its top edge.
  for (const x of document.querySelectorAll('.dash-w ul, .dash-w ol, .dash-w .dw-scroll')) {
    const w = x.closest('.dash-w'); if (!w.offsetParent || !x.getClientRects().length) continue;
    const cs = getComputedStyle(x);
    if (!/(auto|scroll)/.test(cs.overflowY) || x.scrollHeight <= x.clientHeight + 6) continue;
    const below = x.scrollTop + x.clientHeight < x.scrollHeight - 6, above = x.scrollTop > 6;
    const faded = below && x.classList.contains('is-scrolly') && !x.classList.contains('at-end') && cs.maskImage !== 'none';
    const fadedTop = above && x.classList.contains('is-scrolly') && !x.classList.contains('at-top') && cs.maskImage !== 'none';
    if (below && !faded) out.push(`${name(w)}: a list "${x.className}" has more below but no fade`);
    if (above && !fadedTop) out.push(`${name(w)}: a list "${x.className}" has more above but no fade at its top`);
    const xr = x.getBoundingClientRect(), edge = xr.bottom - (parseFloat(cs.borderBottomWidth) || 0), topEdge = xr.top + (parseFloat(cs.borderTopWidth) || 0);
    for (const c of x.children) {
      if (!c.getClientRects().length || getComputedStyle(c).position === 'absolute') continue;
      const r = c.getBoundingClientRect();
      // A row taller than the whole list may be cut between two of its lines (never through one), under the fade.
      const tall = r.height > x.clientHeight - 1;
      const through = (e, fd) => {
        const tw = document.createTreeWalker(c, NodeFilter.SHOW_TEXT), rg = document.createRange(); let throughLine = false;
        for (let n = tw.nextNode(); n && !throughLine; n = tw.nextNode()) { if (!n.textContent.trim()) continue; rg.selectNodeContents(n); throughLine = [...rg.getClientRects()].some(q => q.width > 0.5 && q.top < e - 1 && q.bottom > e + 1); }
        return r.top < e - 1 && r.bottom > e + 1 && (x.classList.contains('dw-scroll') || !fd) && (!tall || !fd || throughLine);
      };
      const dbg = () => (window.__fitDebug ? ` [row ${Math.round(r.top - xr.top)}-${Math.round(r.bottom - xr.top)} list ${x.clientHeight} top ${Math.round(x.scrollTop)} of ${x.scrollHeight} max ${x.style.maxHeight} tall ${tall}]` : '');
      if (through(edge, faded)) { out.push(`${name(w)}: a row of "${x.className}" is cut through by the list's edge ("${label(c)}")${dbg()}`); break; }
      if (above && through(topEdge, fadedTop)) { out.push(`${name(w)}: a row of "${x.className}" is cut through by the list's top edge ("${label(c)}")${dbg()}`); break; }
    }
  }
  for (const e of document.querySelectorAll('.dash-w *')) {
    const cs = getComputedStyle(e);
    if (cs.textOverflow === 'ellipsis' && e.scrollWidth > e.clientWidth + 1 && e.getClientRects().length && !e.closest('.sr-only')) out.push(`${name(e.closest('.dash-w'))}: "${label(e)}" ends in … (cut)`);
  }
  const bars = [...document.querySelectorAll('.dash-top, .dash-foot, .dash-edithead')].filter(b => !b.hidden && b.getClientRects().length).map(b => b.getBoundingClientRect());
  for (const w of document.querySelectorAll('.dash-w')) {
    if (!w.offsetParent) continue;
    const r = w.getBoundingClientRect();
    let clip = { top: 0, bottom: innerHeight, left: 0, right: innerWidth }, scroller = null;
    for (let a = w.parentElement; a && a !== document.body; a = a.parentElement) {
      const cs = getComputedStyle(a);
      if (cs.overflowY !== 'visible') { const q = a.getBoundingClientRect(); clip = { top: Math.max(clip.top, q.top), bottom: Math.min(clip.bottom, q.bottom), left: Math.max(clip.left, q.left), right: Math.min(clip.right, q.right) }; if (!scroller && /(auto|scroll)/.test(cs.overflowY)) scroller = a; }
    }
    const vis = { top: Math.max(r.top, clip.top), bottom: Math.min(r.bottom, clip.bottom), left: Math.max(r.left, clip.left), right: Math.min(r.right, clip.right) };
    if (vis.bottom > vis.top) for (const b of bars) if (vis.top < b.bottom - 1 && vis.bottom > b.top + 1 && vis.left < b.right && vis.right > b.left) out.push(`${name(w)}: sits under the top or bottom bar`);
    // Below the fold is fine only while it can be scrolled into view.
    const hidden = r.bottom - clip.bottom;
    if (hidden > 1) {
      const room = scroller ? scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop : document.documentElement.scrollHeight - innerHeight - scrollY;
      if (hidden > room + 1) out.push(`${name(w)}: ${Math.round(hidden)}px below the screen can't be scrolled into view`);
    }
  }
  if (document.documentElement.scrollWidth > innerWidth + 1) out.push(`the page scrolls sideways (${document.documentElement.scrollWidth} > ${innerWidth})`);
  return [...new Set(out)];
}

const ALL_VIEWS = [
  { name: 'teacher', who: T, size: [1600, 900] },
  { name: 'projector', who: T, size: [1600, 900], projector: true },
  { name: 'student', who: kids[1], size: [1366, 768] },
  { name: 'phone', who: kids[2], size: [390, 844] },
  { name: 'teacher-dark', who: T, size: [1600, 900], dark: true },
  { name: 'projector-dark', who: T, size: [1600, 900], projector: true, dark: true },
  { name: 'student-dark', who: kids[1], size: [1366, 768], dark: true },
  { name: 'phone-dark', who: kids[2], size: [390, 844], dark: true },
];
const VIEWS = process.env.VIEWS ? ALL_VIEWS.filter(v => process.env.VIEWS.split(',').includes(v.name)) : ALL_VIEWS;
const LANGS = (process.env.LANGS || 'en,de,ar').split(',');
let total = 0;
for (const L of RUN) {
 D.updateLayout(T, C, first.id, { name: L.key, widgets: L.widgets, bg: D.DEFAULT_BG });
 D.useLayout(T, C, first.id);
 if (L.stage5) { seed5(); siteOk = !L.key.startsWith('min'); }
 for (const k of [kids[1], kids[2]]) D.saveStudent(k, C, { widgets: L.own.length ? L.own : [{ id: 'clock1', type: 'clock', x: 0, y: 0, w: 4, h: 2 }], pins: {} });
 for (const lang of LANGS) {
  if (L.tpl) { D.updateLayout(T, C, first.id, { widgets: D.templateWidgets(L.tpl, tFor(lang)), bg: D.layoutTemplate(L.tpl).bg }); D.useLayout(T, C, first.id); }
  for (const v of VIEWS) {
    const ctx = await browser.newContext({ timezoneId: ZONE, viewport: { width: v.size[0], height: v.size[1] }, deviceScaleFactor: Number(process.env.DSF) || 1, reducedMotion: 'reduce', colorScheme: v.dark ? 'dark' : 'light', permissions: ['camera'] });
    const [cn, cv] = cookieFor(v.who.id).split('=');
    await ctx.addCookies([{ name: cn, value: cv, url: base }, { name: 'lang', value: lang, url: base }]);
    const page = await ctx.newPage();
    // The page opens 40 s before the time checked and the clock then moves on a minute, past a minute's turn, as in a
    // classroom where the dashboard stays open (the schedule's text changes each minute): the check is at hh:mm:20.
    await page.clock.install({ time: schoolTime(L.at || AT) - 40e3 });
    if (L.stage5) await stubOutside(page);
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    if (process.env.DEBUG) page.on('console', m => console.log('  console:', m.text()));
    await page.goto(`${base}/class/${C.id}/dashboard`);
    await page.waitForSelector('.dash-w');
    if (v.who === T) { await page.click(`#dash-layouts .chip:nth-child(${L.chip})`, { timeout: 5000 }).catch(e => errors.push(`the layout chip is missing (${e.message.split('\n')[0]})`)); await page.waitForTimeout(300); }
    if (v.projector) await page.click('#dash-projector');
    await page.waitForTimeout(1500);
    await page.clock.fastForward(60e3);
    // Exercise the widgets that change size once used: roll the dice, pick a number, make groups.
    if (v.who === T) for (const sel of ['.dw-dice .btn-primary', '.dw-rand .btn-primary', '.dw-groups .btn-primary', '.dw-camera .dw5-camtop .btn-primary', '.dw-breathe .btn-primary']) if (await page.$(sel)) await page.click(sel, { timeout: 3000 }).catch(() => {});
    await page.waitForTimeout(700);
    // The fraction tool switched between modes and views in turn (a mode is its place in the first row of buttons: 1
    // Compare, 2 Add, 3 Subtract, 4 Multiply, 5 Divide; a view in the second: 1 Bars, 2 Circles), ending in Divide with bars.
    if (v.who === T && await page.$('.dash-w[data-id="wfrswitch"]')) {
      const seg = (k, n) => page.click(`.dash-w[data-id="wfrswitch"] .dt-top .dt-seg:nth-child(${k}) button:nth-child(${n})`, { timeout: 3000 }).then(() => page.waitForTimeout(80));
      for (const [k, n] of [[1, 3], [2, 2], [1, 5], [2, 1], [1, 2], [2, 2], [1, 4], [1, 3], [2, 1], [1, 1], [2, 2], [1, 5], [2, 1]]) await seg(k, n).catch(e => errors.push(`the fraction tool's switch can't be pressed (${e.message.split('\n')[0]})`));
      await page.waitForTimeout(300);
    }
    if (process.env.DEBUG) await page.evaluate(() => { window.__fitDebug = true; });
    const found = [...await page.evaluate(problems), ...errors.map(e => `page error: ${e}`)];
    // Help on the maths tools: each tool's ⓘ panel, opened one at a time, fits its widget without scrolling and no line
    // of it is cut (docs/decisions.md "Classroom dashboards: help on the maths tools"). Not on the projector (hidden).
    if (!v.projector && process.env.HELP !== '0') {
      const infos = (await page.$$('.dash-w .dt-info')).length;
      for (let i = 0; i < infos; i++) {
        const b = (await page.$$('.dash-w .dt-info'))[i]; if (!b || !(await b.isVisible())) continue;
        await b.scrollIntoViewIfNeeded().catch(() => {});
        await b.click({ timeout: 3000 }).catch(e => found.push(`help ${i}: ⓘ can't be pressed (${e.message.split('\n')[0]})`));
        await page.waitForTimeout(60);
        found.push(...await b.evaluate(btn => {
          const out = [], p = document.getElementById(btn.getAttribute('aria-controls'));
          const w = btn.closest('.dash-w') || (p && p.parentElement), name = (w && w.querySelector('.dash-wt')?.textContent) || (p && p.getAttribute('aria-label'));
          if (!p || p.hidden) return [`${name}: the help panel does not open`];
          if (p.scrollHeight > p.clientHeight + 1) out.push(`${name}: the help panel scrolls (${p.scrollHeight - p.clientHeight}px more)`);
          const r = p.getBoundingClientRect(), wr = w.getBoundingClientRect();
          if (r.top < wr.top - 1 || r.bottom > wr.bottom + 1 || r.left < wr.left - 1 || r.right > wr.right + 1) out.push(`${name}: the help panel goes outside the widget`);
          for (const e of p.querySelectorAll('*')) if (e.clientWidth && e.scrollWidth > e.clientWidth + 1) out.push(`${name}: help text "${e.textContent.slice(0, 24)}" is cut`);
          return out;
        }));
        if (process.env.HELPSHOTS) {
          fs.mkdirSync(process.env.HELPSHOTS, { recursive: true });
          const w = await b.evaluateHandle(btn => btn.closest('.dash-w') || document.getElementById(btn.getAttribute('aria-controls')).parentElement);
          const id = await w.evaluate(x => x.dataset.id || x.className.split(' ')[0]);
          await w.screenshot({ path: `${process.env.HELPSHOTS}/help-${lang}-${v.name}-${id}.png` }).catch(() => {});
          if (process.env.HELPPAGE && id.includes(process.env.HELPPAGE)) await page.screenshot({ path: `${process.env.HELPSHOTS}/page-${lang}-${v.name}-${id}.png` });
        }
        await page.keyboard.press('Escape'); await page.waitForTimeout(30);
      }
    }
    // Tooltips are never cut off (docs/decisions.md "Classroom dashboards: tooltips never cut off"): every button with a
    // tooltip, focused by keyboard in turn, shows its tooltip whole inside the screen, not clipped by anything around it,
    // named by aria-describedby, and with no native title as well.
    if (process.env.TIPS !== '0') {
      await page.keyboard.press('Shift');
      found.push(...await page.evaluate(() => {
        const out = [], name = e => e.closest('.dash-w')?.querySelector('.dash-wt')?.textContent || '';
        for (const el of document.querySelectorAll('.dash-w [data-tip]')) {
          if (el.title) out.push(`${name(el)}: "${el.dataset.tip}" has a native title as well as its tooltip`);
          if (!el.getClientRects().length || getComputedStyle(el).visibility === 'hidden' || el.disabled) continue;
          if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
          el.scrollIntoView({ block: 'center', inline: 'nearest' });
          el.focus({ preventScroll: true });
          if (document.activeElement !== el) continue;
          const t = document.getElementById('dash-tip');
          if (!t || t.hidden || t.getAttribute('role') !== 'tooltip') { out.push(`${name(el)}: "${el.dataset.tip}" shows no tooltip on keyboard focus`); continue; }
          const r = t.getBoundingClientRect();
          if (r.left < 0 || r.top < 0 || r.right > innerWidth || r.bottom > innerHeight) out.push(`${name(el)}: the tooltip "${el.dataset.tip}" goes outside the screen`);
          for (let a = t.parentElement; a && a !== document.documentElement; a = a.parentElement) {
            const cs = getComputedStyle(a); if (cs.overflowX === 'visible' && cs.overflowY === 'visible') continue;
            const q = a.getBoundingClientRect();
            if (r.left < q.left - 0.5 || r.right > q.right + 0.5 || r.top < q.top - 0.5 || r.bottom > q.bottom + 0.5) { out.push(`${name(el)}: the tooltip "${el.dataset.tip}" is clipped by ${a.className || a.tagName}`); break; }
          }
          if (t.scrollWidth > t.clientWidth + 1) out.push(`${name(el)}: the tooltip "${el.dataset.tip}" is cut`);
          if (!(el.getAttribute('aria-describedby') || '').split(/\s+/).includes(t.id)) out.push(`${name(el)}: "${el.dataset.tip}" is not described by its tooltip`);
          el.blur();
        }
        return out;
      }));
    }
    total += found.length;
    console.log(`${found.length ? '✗' : '✓'} ${L.key} ${lang} ${v.name}${found.length ? '' : ': nothing cut off'}`);
    for (const f of found) console.log(`    ${f}`);
    if (OUT) {
      await page.evaluate(() => { document.querySelector('.dash-stage').scrollTop = 0; });
      await page.screenshot({ path: `${OUT}/fit-${L.key}-${lang}-${v.name}.png`, fullPage: v.name === 'phone' });
      // The schedule's own layouts: each schedule widget on its own too.
      if (L.at) for (const w of await page.$$('.dash-w[data-id^="wsched"]')) await w.screenshot({ path: `${OUT}/${L.key}-${lang}-${v.name}-${await w.getAttribute('data-id')}.png` }).catch(() => {});
    }
    await ctx.close();
  }
 }
}
DM._setSiteProbe(null);
await browser.close(); server.close();
console.log(`${RUN.length} layouts: ${RUN.map(l => l.key).join(', ')}`);
console.log(total ? `${total} problem(s) found.` : 'No problems found.');
process.exit(total ? 1 : 0);
