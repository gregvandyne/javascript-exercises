// Classroom dashboards: nothing is ever cut off (docs/decisions.md "Classroom dashboards, stage 2"). Starts the app on
// an in-memory database, makes a class with every widget type at its default size (long names, long labels, a help
// queue, an open quick check, a running timer), and loads the teacher's screen (normal and projector, 1600 × 900), a
// student's screen (1366 × 768) and a phone (390 × 844) in English, German (long words) and Arabic (right to left).
// Stage 3 (docs/decisions.md "Classroom dashboards, stage 3") adds the teaching tools, the whiteboard and the Picture
// widget: the widgets are split over as many layouts as the grid needs (24 widgets, 24 rows each), and on the tools'
// layouts both students have every tool on their own screen (as a pinned copy of a sent tool would be).
// For every widget it checks:
//   - the widget's body holds its content (no overflow; only lists scroll, inside their own .dw-scroll area),
//   - no part of the widget sits outside its body unless it is in a scroll area that really scrolls,
//   - no text is cut (scrollWidth <= clientWidth on text boxes; no ellipsis without a title),
//   - every control's painted box (border, box-shadow, transform) is at least 12px inside the widget's inner edge and
//     not clipped by any ancestor that does not scroll,
//   - no control sits under the widget's own controls row,
// and that the phone never scrolls sideways.
//
//   npm run dash:fit            exit code 1 when anything is cut off; OUT=/some/dir also saves a screenshot per view
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
const games = await import('../server/services/games.js');
const D = await import('../server/services/dash.js');
const { createApp } = await import('../server/app.js');

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
const lesson = L.createLesson(T, school.id, { title: 'Vergleichen von Brüchen mit ungleichen Nennern' }).lesson; L.assign(T, C.id, lesson.id);
const cl = L.classLessons(C.id)[0];
const link = D.addLink(T, C, { url: 'https://bibliothek.example.org/kinder/lesen/geschichten', title: 'Schulbibliothek und Leseecke' }).link;
const ymd = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date());
const SETTINGS = {
  clock: { face: 'analog', zone2: 'America/Argentina/Buenos_Aires' },
  text: { title: 'Heute im Unterricht', body: 'Rechtschreibübungsheft Seite zweiundzwanzig\nMathematikwettbewerbsvorbereitung\nLesen' },
  ican: { goal: 'Ich kann Brüche mit ungleichen Nennern miteinander vergleichen und ordnen.' },
  timer: { minutes: 125 },
  schedule: { periods: [['Morgenkreis und Begrüßung', '08:00', '08:20'], ['Mathematikunterricht', '08:20', '09:05'], ['Pause', '09:05', '09:25'], ['Naturwissenschaften', '09:25', '10:10'], ['Kunst', '10:10', '10:55'], ['Musik', '10:55', '11:40']].map(([name, start, end]) => ({ name, start, end })) },
  weather: { place: { name: 'Llanfairpwllgwyngyll, Isle of Anglesey, United Kingdom', lat: 53.22, lon: -4.2 } },
  qr: { target: { kind: 'link', ref: link.id } },
  picker: { mode: 'wheel' },
  countdown: { label: 'Klassenausflug ins Naturkundemuseum', date: `${ymd.slice(0, 4)}-12-24`, time: '09:00' },
  calendar: { marks: [{ date: `${ymd.slice(0, 8)}28`, label: 'Schulbuchausstellung im Foyer' }, { date: `${ymd.slice(0, 8)}27`, label: 'Science show' }] },
  light: { color: 'yellow', yellow: 'Leise Stimmen, bitte flüstern' },
  dice: { count: 6 },
  random: { min: -9999, max: 9999 },
  groups: { by: 'count', n: 3 },
  score: { teams: 'Die Sternschnuppen\nRaketen\nKometen\nPlaneten', scores: [-9999, 9999, 12, 0] },
  stickers: { stamps: [{ e: 0, x: 4, y: 6 }, { e: 5, x: 96, y: 94 }, { e: 12, x: 50, y: 50 }] },
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
};
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
const pack = (key, types) => { const out = []; let cur = [], x = 0, y = 0, rowH = 0;
  for (const t of types) { const [w, h] = t[key]; if (x + w > 12) { x = 0; y += rowH; rowH = 0; } if (y + h > 24 || cur.length >= 24) { out.push(cur); cur = []; x = 0; y = 0; rowH = 0; }
    cur.push({ id: `w${t.id}`, type: t.id, x, y, w, h, s: SETTINGS[t.id] || {}, pin: D.canPin(t) }); x += w; rowH = Math.max(rowH, h); }
  if (cur.length) out.push(cur); return out; };
D.ensureLayouts(T, C, 'Default sizes');
const first = D.layoutsOf(C.id, T.id)[0];
const LAYOUTS = [];
for (const size of ['size', 'min']) {
  const chunks = [...pack(size, D.WIDGETS.filter(t => !STAGE3.has(t.id))), ...pack(size, D.WIDGETS.filter(t => STAGE3.has(t.id)))];
  chunks.forEach((widgets, k) => {
    const name = `${size === 'size' ? 'default' : 'min'}${k ? `-${k + 1}` : ''}`;
    const layout = LAYOUTS.length ? D.createLayout(T, C, { name, widgets }).layout : (D.updateLayout(T, C, first.id, { name, widgets }), D.getLayout(first.id));
    // On a layout with tools, each student has every tool their own screen can hold.
    const own = widgets.filter(w => D.canAdd(D.widgetType(w.type), 'student') && STAGE3.has(w.type)).map(({ pin, ...w }) => w);
    LAYOUTS.push({ key: name, layout, own, chip: LAYOUTS.length + 1 });
  });
}
const wantSizes = (process.env.SIZES || '') ? process.env.SIZES.split(',') : null;
const RUN = wantSizes ? LAYOUTS.filter(l => wantSizes.includes(l.key) || wantSizes.includes(l.key.split('-')[0])) : LAYOUTS;
D.useLayout(T, C, first.id);
D.timerAction(T, C, 'wtimer', { action: 'start' }, Date.now() - 65e3);
for (const k of kids.slice(0, 6)) D.helpAsk(k, C, 'help');
for (const k of kids.slice(6, 9)) D.helpAsk(k, C, 'done');
const check = D.createCheck(T, C, { kind: 'choice', question: 'Welche Bruchzahl ist größer, wenn die Nenner verschieden sind?', options: ['Dreiviertel', 'Zweidrittel', 'Fünfachtel', 'Beide sind genau gleich groß', 'Weiß ich nicht', 'Sechszehntel'] }).check;
kids.forEach((k, i) => D.answerCheck(k, C, check, i % 6));
D.pickerAction(T, C, { action: 'away', user: kids[9].id, on: true });
D.weatherFor(SETTINGS.weather.place);
await new Promise(r => setTimeout(r, 30));

// ---------------------------------------------------------------- the browser checks
const server = createApp().listen(0); await new Promise(r => server.once('listening', r));
const base = `http://127.0.0.1:${server.address().port}`;
const cookieFor = id => { let c = ''; startSession({ append: (k, v) => { c = v.split(';')[0]; } }, id); return c; };
const exe = exe0;
const browser = await chromium.launch(exe ? { executablePath: exe } : {});

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
      const q = e.getBoundingClientRect(); if (!q.width && !q.height) continue;
      if (q.left < r.left - 1 || q.right > r.right + 1 || q.top < r.top - 1 || q.bottom > r.bottom + 1) { out.push(`${name(w)}: "${label(e)}" spills out of the tool's model area`); break; }
    }
    const rows = [...st.parentElement.children].filter(x => getComputedStyle(x).display !== 'none' && x.getClientRects().length && !x.classList.contains('dt-ghost'));
    for (let i = 1; i < rows.length; i++) { const a = rows[i - 1].getBoundingClientRect(), b = rows[i].getBoundingClientRect(); if (b.top < a.bottom - 1) out.push(`${name(w)}: "${rows[i].className}" overlaps "${rows[i - 1].className}"`); }
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
];
const VIEWS = process.env.VIEWS ? ALL_VIEWS.filter(v => process.env.VIEWS.split(',').includes(v.name)) : ALL_VIEWS;
const LANGS = (process.env.LANGS || 'en,de,ar').split(',');
let total = 0;
for (const L of RUN) {
 D.useLayout(T, C, L.layout.id);
 for (const k of [kids[1], kids[2]]) D.saveStudent(k, C, { widgets: L.own.length ? L.own : [{ id: 'clock1', type: 'clock', x: 0, y: 0, w: 4, h: 2 }], pins: {} });
 for (const lang of LANGS) {
  for (const v of VIEWS) {
    const ctx = await browser.newContext({ viewport: { width: v.size[0], height: v.size[1] }, deviceScaleFactor: 1, reducedMotion: 'reduce', colorScheme: v.dark ? 'dark' : 'light' });
    const [cn, cv] = cookieFor(v.who.id).split('=');
    await ctx.addCookies([{ name: cn, value: cv, url: base }, { name: 'lang', value: lang, url: base }]);
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(`${base}/class/${C.id}/dashboard`);
    await page.waitForSelector('.dash-w');
    if (v.who === T) { await page.click(`#dash-layouts .chip:nth-child(${L.chip})`, { timeout: 5000 }).catch(e => errors.push(`the layout chip is missing (${e.message.split('\n')[0]})`)); await page.waitForTimeout(300); }
    if (v.projector) await page.click('#dash-projector');
    await page.waitForTimeout(1500);
    // Exercise the widgets that change size once used: roll the dice, pick a number, make groups.
    if (v.who === T) for (const sel of ['.dw-dice .btn-primary', '.dw-rand .btn-primary', '.dw-groups .btn-primary']) if (await page.$(sel)) await page.click(sel, { timeout: 3000 }).catch(() => {});
    await page.waitForTimeout(700);
    if (process.env.DEBUG) await page.evaluate(() => { window.__fitDebug = true; });
    const found = [...await page.evaluate(problems), ...errors.map(e => `page error: ${e}`)];
    total += found.length;
    console.log(`${found.length ? '✗' : '✓'} ${L.key} ${lang} ${v.name}${found.length ? '' : ': nothing cut off'}`);
    for (const f of found) console.log(`    ${f}`);
    if (OUT) {
      await page.evaluate(() => { document.querySelector('.dash-stage').scrollTop = 0; });
      await page.screenshot({ path: `${OUT}/fit-${L.key}-${lang}-${v.name}.png`, fullPage: v.name === 'phone' });
    }
    await ctx.close();
  }
 }
}
await browser.close(); server.close();
console.log(`${RUN.length} layouts: ${RUN.map(l => l.key).join(', ')}`);
console.log(total ? `${total} problem(s) found.` : 'No problems found.');
process.exit(total ? 1 : 0);
