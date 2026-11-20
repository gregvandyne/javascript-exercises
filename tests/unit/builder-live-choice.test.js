// "How will it be played?" in the Builder's setup steps, and the Studio's live line (docs/decisions.md "Live or not,
// said once: How will it be played? and the Studio's live line"):
//   the plan's play field (normalisePlan): its defaults per kind of game and per account, Live refused where a kind of
//   game or a ready-made 3D world cannot be live; what the model reads for each answer (planNote, planBrief, the sentence);
//   state.wantsLive from the plan; the live-or-closed question never asked again once the plan answered it; the Studio's
//   line (Ready to host live / Publish it / Live but needs a fix / Not a live game) from GET /api/studio/:id and in
//   Chromium on a desktop and an iPhone; kids never get Host.
// LIVE_CHOICE_SHOTS=<dir> saves pictures of the step and of each line. The browser parts are skipped without Chromium.
process.env.BRB_DB = ':memory:';
process.env.BRB_SILENT = '1';
process.env.LOG_REQUESTS = '0';
process.env.BRB_MOCK_DELAY_MS = '0';
process.env.BRB_DATA_DIR = (await import('node:os')).tmpdir() + '/brb-live-choice-' + process.pid;
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const { config } = await import('../../server/config.js');
config.builderFullForAll = false; config.anthropicKey = ''; config.liveClassroom = true;
const { createApp } = await import('../../server/app.js');
const { q, now } = await import('../../server/db.js');
const auth = await import('../../server/auth.js');
const games = await import('../../server/services/games.js');
const S = await import('../../server/services/schools.js');
const C = await import('../../server/services/classlive-check.js');
const { KIT_VERSIONS } = await import('../../server/services/kit.js');
const plan = await import('../../server/builder/plan.js');
const { wantsLive, asksForLive, THREE_D_RULES } = await import('../../server/builder/prompt.js');
const { toolbox } = await import('../../server/builder/tools.js');
const { saveChat } = await import('../../server/builder/chat.js');
const { loadTemplate } = await import('../../server/builder/templates/index.js');
const { CODES, tFor } = await import('../../server/i18n/index.js');
const { deicon } = await import('../support/deicon.js');  // icons read back as the emoji they stand for

// The live pack is not in kit/SHIPPED.json yet: the tests pin a hash for it, as tests/unit/_live.js does.
const PACK_HASH = 'sha384-live-pack-test-hash';
C.hooks.packHash = v => (v === '1.1.0' ? PACK_HASH : undefined);
const KIT_TAG = `<script src="/vendor/oomba-kit/1.1.0/oomba-kit.js" integrity="${KIT_VERSIONS['1.1.0']}" crossorigin="anonymous"></script>`;
const PACK_TAG = `<script src="/vendor/oomba-kit/1.1.0/packs/live.js" integrity="${PACK_HASH}" crossorigin="anonymous"></script>`;
const HTML = {
  plain: `<!doctype html><title>Plain</title>${KIT_TAG}<script>if (window.Oomba && Oomba.game) Oomba.game({});</script>`,
  ready: `<!doctype html><title>Live</title>${KIT_TAG}${PACK_TAG}<script>const live = window.Oomba && Oomba.live; if (live) { live.ready({ maxPlayers: 30 }); live.on('start', () => {}); live.score(1); }</script>`,
  broken: `<!doctype html><title>Broken</title>${KIT_TAG}${PACK_TAG}<script>if (window.Oomba && Oomba.live) { Oomba.live.on('start', () => {}); Oomba.live.score(1); }</script>`,
  kit2: loadTemplate('oomba3d'),
  survey: loadTemplate('survey'),
};
const pack = id => ({ from: 'pack', id }), custom = text => ({ from: 'custom', text });

// ---------------------------------------------------------------- the plan
test('the defaults of "How will it be played?" for each kind of game, for a teacher and for a kid, and what each may be', () => {
  const T = { quiz: 'live', word: 'live', memory: 'live', categories: 'live', bingo: 'live', adventure: 'live', runner: 'live', catch: 'live', flashcards: 'screen', quiet: 'screen', spinner: 'screen', scoreboard: 'screen', survey: 'screen', duel: 'screen', board: 'screen', exitticket: 'solo' };
  const K = { quiet: 'screen', spinner: 'screen', scoreboard: 'screen', duel: 'screen' };
  const noLive = { quiet: 'board', spinner: 'board', scoreboard: 'board', survey: 'survey', exitticket: 'exitticket' };
  assert.deepEqual(plan.TYPE_IDS.slice().sort(), Object.keys(T).sort(), 'every kind of game has a teacher default');
  for (const id of plan.TYPE_IDS) {
    const p = { type: pack(id), look: null, world: null, characters: [], learn: [], notes: '' };
    assert.equal(plan.playDefault(p), T[id], `teacher ${id}`);
    assert.equal(plan.playDefault(p, { forKid: true }), K[id] || 'solo', `kid ${id}`);
    assert.deepEqual(plan.playOptions(p).map(o => `${o.id}:${o.ok ? 'ok' : o.why}`), [`live:${noLive[id] ? noLive[id] : 'ok'}`, 'screen:ok', 'solo:ok'], id);
  }
  // nothing picked: a teacher starts on Live, a kid on their own
  const none = { type: null, look: null, world: null, characters: [], learn: [], notes: '' };
  assert.equal(plan.playDefault(none), 'live'); assert.equal(plan.playDefault(none, { forKid: true }), 'solo');
  // a ready-made 3D world cannot be live yet: Live is listed, not ok, and a teacher's default falls back to on my own
  const k2 = { ...none, type: pack('adventure'), look: '3d', world: pack('castle-quest') };
  assert.equal(plan.planEngine(k2).engine, 'kit2');
  assert.equal(plan.liveNot(k2), 'kit2'); assert.equal(plan.playDefault(k2), 'solo');
  assert.deepEqual(plan.playOptions(k2)[0], { id: 'live', ok: false, why: 'kit2' });
  // their own 3D world, a 2D game, "you pick": Live is fine
  for (const p of [{ ...none, look: '3d', world: custom('a candy castle') }, { ...none, type: pack('runner'), look: '2d', world: pack('castle-quest') }, { ...none, look: 'auto' }]) assert.equal(plan.liveNot(p), '', JSON.stringify(p));
});

test('normalisePlan: play is kept when the plan allows it, Live becomes the default where it cannot be, unknown or missing is left out', () => {
  for (const play of plan.PLAYS) assert.equal(plan.normalisePlan({ type: pack('quiz'), play }).play, play);
  assert.equal('play' in plan.normalisePlan({ type: pack('quiz') }), false, 'an older page sends no play: the plan has none');
  assert.equal('play' in plan.normalisePlan({ type: pack('quiz'), play: 'together' }), false);
  assert.equal('play' in plan.normalisePlan({ type: pack('quiz'), play: { live: true } }), false);
  // Live where it cannot be: this viewer's default for it
  assert.equal(plan.normalisePlan({ type: pack('survey'), play: 'live' }).play, 'screen');
  assert.equal(plan.normalisePlan({ type: pack('exitticket'), play: 'live' }).play, 'solo', 'its teacher default');
  assert.equal(plan.normalisePlan({ type: pack('spinner'), play: 'live' }, { forKid: true }).play, 'screen');
  assert.equal(plan.normalisePlan({ type: pack('adventure'), look: '3d', world: pack('castle-quest'), play: 'live' }).play, 'solo');
  assert.equal(plan.normalisePlan({ type: pack('adventure'), look: '3d', world: pack('castle-quest'), play: 'live' }, { forKid: true }).play, 'solo');
  // a kid may still pick Live (a grown-up hosts it)
  assert.equal(plan.normalisePlan({ type: pack('bingo'), play: 'live' }, { forKid: true }).play, 'live');
  // play alone is a plan (they picked it); a typed "jeopardy" becomes the Category Board and keeps Live
  assert.deepEqual(plan.normalisePlan({ play: 'live' }), { v: 1, type: null, look: null, world: null, characters: [], learn: [], notes: '', play: 'live' });
  assert.equal(plan.normalisePlan({ type: custom('a jeopardy game'), play: 'live' }).play, 'live');
});

test('what the model reads for each answer: planNote, planBrief and the sentence (which only asks for Oomba Live when Live)', () => {
  const note = (play, extra = {}) => plan.planNote(plan.normalisePlan({ type: pack('quiz'), play, ...extra }));
  const live = note('live');
  assert.match(live, /How it is played: LIVE with their class or group on Oomba Live/);
  assert.match(live, /make it live-ready in this same build with the LIVE RULES/);
  assert.match(live, /teacher or grown-up hosts it live once it is published/);
  assert.match(live, /Never add free text, typing or chat between players/);
  for (const play of ['screen', 'solo']) {
    const n = note(play);
    assert.match(n, new RegExp(`How it is played: ${play === 'screen' ? 'ON ONE SCREEN' : 'ON MY OWN'}`));
    assert.match(n, /it is NOT a live game\. Do NOT add the live pack or Oomba\.live/);
    assert.doesNotMatch(n, /LIVE RULES/);
  }
  assert.match(note(undefined), /How it is played: not chosen \(you decide; a game is live only when they ask for it\)/);
  assert.match(note('screen'), /readable from the back/);
  // the question is never asked again: every answered plan says so, their own 3D world names the live-or-closed question
  for (const play of plan.PLAYS) assert.match(note(play), /Do not ask the setup questions again \([^)]*how it is played or live or closed\)/);
  const own3d = play => plan.planNote(plan.normalisePlan({ look: '3d', world: custom('a candy castle'), play }));
  assert.equal(plan.planEngine(plan.normalisePlan({ look: '3d', world: custom('a candy castle') })).engine, 'world3d');
  assert.match(own3d('live'), /it is a live world: do not ask "Live or closed world\?"/);
  assert.match(own3d('solo'), /a closed world: do not ask "Live or closed world\?"/);
  assert.match(own3d('screen'), /a closed world: do not ask "Live or closed world\?"/);
  // a classroom starter that goes live: the kit tag and the live pack for the connection only
  assert.match(plan.planNote(plan.normalisePlan({ type: pack('bingo'), play: 'live' })), /plain HTML, not on the kit: add the kit tag and the live pack ONLY for the live connection/);
  // the transcript line of later turns
  assert.match(plan.planBrief(plan.normalisePlan({ type: pack('quiz'), play: 'live' })), /played LIVE \(Oomba Live, a teacher or grown-up hosts\).*do not ask whether it should be live or closed/);
  assert.match(plan.planBrief(plan.normalisePlan({ type: pack('quiz'), play: 'solo' })), /played on my own \(not live\)/);
  assert.doesNotMatch(plan.planBrief(plan.normalisePlan({ type: pack('quiz') })), /played/);
  // the sentence, in every language: Live names Oomba Live (so the Builder's own words check agrees), the others never do
  assert.equal(plan.planSentence(plan.normalisePlan({ type: pack('quiz'), play: 'screen' })), 'Here is my game plan. Kind of game: Quiz. We play it together on one screen.');
  for (const code of CODES) {
    const t = tFor(code);
    assert.equal(asksForLive(t('buildSetup.say.playlive')), true, `${code} live`);
    assert.equal(asksForLive(t('buildSetup.say.playscreen')), false, `${code} screen`);
    assert.equal(asksForLive(t('buildSetup.say.playsolo')), false, `${code} solo`);
    assert.equal(asksForLive(plan.planSentence(plan.normalisePlan({ type: pack('quiz'), notes: 'fractions', play: 'solo' }), t)), false, `${code} sentence`);
    for (const k of ['live', 'screen', 'solo']) assert.ok(t(`buildSetup.play.${k}.title`) && t(`buildSetup.play.${k}.text`), `${code} ${k}`);
    assert.match(t('buildSetup.play.live.text'), /Oomba Live/, `${code}: the Live card names Oomba Live`);
    assert.match(t('live.entry.studioFixText', { issue: 'x' }), /Oomba Live/, `${code}: Fix it asks for Oomba Live`);
  }
  // the 3D rules tell the model the setup steps' answer counts
  assert.match(THREE_D_RULES, /the setup steps' "How it is played" counts: never ask\s+again/);
});

test('state.wantsLive comes from the plan: Live sets it (the LIVE RULES go with every turn), one screen or on my own clears it', () => {
  for (const [play, want] of [['live', true], ['screen', false], ['solo', false]]) {
    const st = { wantsLive: !want }, p = plan.normalisePlan({ type: pack('quiz'), play });
    plan.engineFor(st, p, 'Here is my game plan.', null);
    assert.equal(!!st.wantsLive, want, play); assert.equal(wantsLive(st, '', null), want, play);
    assert.deepEqual(st.play, { how: play, type: 'quiz' });
  }
  // a plan with no answer leaves the state as it was
  const st = {}; plan.engineFor(st, plan.normalisePlan({ type: pack('quiz') }), '', null); assert.deepEqual(st, {});
  // a later typed "make it a live class game" still turns it on
  const later = { play: { how: 'solo', type: 'quiz' } }; assert.equal(wantsLive(later, 'Make this a live class game with Oomba Live', null), true);
});

test('the live-or-closed question is never asked again once the plan answered it (ask_user refuses it)', async () => {
  const u = auth.createUser({ username: 'AskOnce', password: 'secret123' });
  const g = games.createGame(u.id, { title: 'Asked' });
  const ask = { question: 'Should other players be able to join your world live, or is it your own closed world?', options: ['🌍 Live: others join with Oomba Live', '🏝️ Closed: just my world'] };
  for (const play of plan.PLAYS) {
    const state = {};
    const tb = toolbox({ user: u, gameId: g.id, emit: () => {}, state, plan: plan.normalisePlan({ look: '3d', world: custom('a candy castle'), play }) });
    assert.equal(!!state.wantsLive, play === 'live', play);
    const r = await tb.exec('ask_user', ask);
    assert.equal(r.ok, false, play); assert.match(r.forModel, /already answered how it is played in the setup steps/);
    assert.match(r.forModel, play === 'live' ? /LIVE with Oomba Live/ : /not a live game, a closed world/);
    // any other question is still asked
    assert.equal((await tb.exec('ask_user', { question: 'What colour is the castle?', options: ['Pink', 'Blue'] })).ok, true);
  }
  // no plan (typed words): the question is asked as before
  assert.equal((await toolbox({ user: u, gameId: g.id, emit: () => {}, state: {} }).exec('ask_user', ask)).ok, true);
  // a plan without the step's answer (an older page): asked as before
  assert.equal((await toolbox({ user: u, gameId: g.id, emit: () => {}, state: {}, plan: plan.normalisePlan({ look: '3d', world: custom('a candy castle') }) }).exec('ask_user', ask)).ok, true);
});

// ---------------------------------------------------------------- the page and the Studio's line (server)
const server = createApp().listen(0);
await new Promise(r => server.once('listening', r));
const BASE = `http://127.0.0.1:${server.address().port}`;
function client() {
  let cookie = '';
  const c = async (p, { method = 'GET', body } = {}) => {
    const h = {}; if (cookie) h.cookie = cookie;
    if (body !== undefined) h['content-type'] = 'application/json';
    const res = await fetch(BASE + p, { method, headers: h, body: body !== undefined ? JSON.stringify(body) : undefined, redirect: 'manual' });
    for (const k of res.headers.getSetCookie ? res.headers.getSetCookie() : []) { const kv = k.split(';')[0]; if (kv.startsWith('brb_session=')) cookie = kv; }
    const raw = await res.text(), text = deicon(raw); let json = null; try { json = JSON.parse(raw, (k, v) => typeof v === 'string' ? deicon(v) : v); } catch { /* html */ }
    return { status: res.status, text, json };
  };
  c.cookie = () => cookie;
  return c;
}
async function signup(name, { teacher = false } = {}) {
  const c = client(); const r = await c('/api/auth/signup', { method: 'POST', body: { username: name, password: 'secret12' } }); assert.equal(r.status, 200, r.text);
  const user = auth.getUserByName(name);
  if (teacher) { const school = S.createSchool(user, { name: `School ${name}` }).school; q.run('INSERT INTO school_members(school_id, user_id, role, joined_at) VALUES (?,?,?,?)', school.id, user.id, 'teacher', now()); }
  return { c, user: auth.getUserByName(name) };
}
const teach = await signup('PlayTeacher', { teacher: true });
const kid = await signup('PlayKid');

test('/build/new: the step for a teacher and a kid, and /api/build/plan carries the answer and its sentence', async () => {
  const data = h => JSON.parse(/<script type="application\/json" id="page-data">([\s\S]*?)<\/script>/.exec(h)[1]);
  const t = (await teach.c('/build/new')).text, k = (await kid.c('/build/new')).text;
  for (const h of [t, k]) {
    assert.ok(h.includes('How will it be played?'));
    for (const id of plan.PLAYS) assert.ok(h.includes(`data-step="play" data-id="${id}"`), id);
    assert.ok(h.includes('Live with my class or group') && h.includes('On one screen') && h.includes('On my own'));
    assert.ok(h.includes('A teacher or grown-up runs it from the big screen with Oomba Live.'), 'the wording says a teacher or grown-up hosts');
  }
  const dt = data(t).play, dk = data(k).play;
  assert.equal(dt.def.quiz, 'live'); assert.equal(dt.def.survey, 'screen'); assert.equal(dt.def[''], 'live');
  assert.equal(dk.def.quiz, 'solo'); assert.equal(dk.def.spinner, 'screen'); assert.equal(dk.def[''], 'solo');
  assert.deepEqual(dt.not, plan.LIVE_NOT); assert.equal(dt.kit2, 'kit2');
  assert.equal(dt.why.kit2, "The ready-made 3D worlds can't be played live yet."); assert.ok(dt.why.board && dt.why.survey && dt.why.exitticket);
  const r = await teach.c('/api/build/plan', { method: 'POST', body: { plan: { type: pack('quiz'), play: 'live' } } });
  assert.equal(r.json.plan.play, 'live'); assert.equal(r.json.text, 'Here is my game plan. Kind of game: Quiz. Play it live with my class or group on Oomba Live.');
  const s = await teach.c('/api/build/plan', { method: 'POST', body: { plan: { type: pack('survey'), play: 'live' } } });
  assert.equal(s.json.plan.play, 'screen', 'a survey is never live');
  const kk = await kid.c('/api/build/plan', { method: 'POST', body: { plan: { type: pack('bingo') } } });
  assert.equal('play' in kk.json.plan, false);
});

/** A game of this owner with one version (and published, if asked), and the Builder's saved state. */
function gameWith(owner, html, { published = false, state = null, title = 'Live line' } = {}) {
  const g = games.createGame(owner.id, { title });
  const v = games.addVersion(g.id, html, { createdBy: owner.id, safetyStatus: 'pass' });
  q.run('UPDATE games SET current_version_id=? WHERE id=?', v.id, g.id);
  if (published) q.run("UPDATE games SET status='published', visibility='public', published_version_id=? WHERE id=?", v.id, g.id);
  if (state) saveChat(g.id, owner.id, { messages: [], state });
  return games.getGame(g.id);
}
const LINES = owner => ({
  host: gameWith(owner, HTML.ready, { published: true, title: 'Ready live' }),
  publish: gameWith(owner, HTML.ready, { title: 'Live, not published' }),
  fix: gameWith(owner, HTML.broken, { title: 'Live, broken' }),
  off: gameWith(owner, HTML.plain, { title: 'Not live' }),
  kit2: gameWith(owner, HTML.kit2, { title: 'A ready-made world' }),
  survey: gameWith(owner, HTML.survey, { state: { play: { how: 'screen', type: 'survey' } }, title: 'Our survey' }),
});
const tGames = LINES(teach.user), kGames = LINES(kid.user);

test('the Studio\'s live line from GET /api/studio/:id: each state, the reason where it cannot be live, kids never host', async () => {
  for (const [who, c, G, hosts] of [['teacher', teach.c, tGames, true], ['kid', kid.c, kGames, false]]) {
    const L = async id => (await c(`/api/studio/${id}`)).json.liveClass;
    const host = await L(G.host.id);
    assert.equal(host.line, 'host', who); assert.equal(host.canHost, hosts, who); assert.equal(host.host, `/live?game=${G.host.id}`);
    assert.equal((await L(G.publish.id)).line, 'publish', who);
    const fix = await L(G.fix.id);
    assert.equal(fix.line, 'fix'); assert.equal(fix.issue, "it doesn't say when it is ready");
    assert.equal(fix.fixAsk, "Fix the live part of this game for Oomba Live so a teacher or grown-up can host it: it doesn't say when it is ready.");
    assert.equal(asksForLive(fix.fixAsk), true, 'Fix it sends the live rules');
    const off = await L(G.off.id);
    assert.equal(off.line, 'off'); assert.equal(off.why, ''); assert.equal(asksForLive(off.ask), true);
    const k2 = await L(G.kit2.id);
    assert.equal(k2.line, 'off'); assert.equal(k2.why, "The ready-made 3D worlds can't be played live yet.");
    const sv = await L(G.survey.id);
    assert.equal(sv.line, 'off'); assert.match(sv.why, /Survey answers stay on this device/); assert.equal(sv.chose, 'screen');
  }
  // the line goes away with Oomba Live switched off
  config.liveClassroom = false;
  try { assert.equal((await teach.c(`/api/studio/${tGames.host.id}`)).json.liveClass, null); } finally { config.liveClassroom = true; }
});

// ---------------------------------------------------------------- in Chromium (desktop and iPhone)
const LOCAL = ['/opt/pw-browsers/chromium', '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell'];
const exe = [process.env.BRB_CHROMIUM, ...LOCAL].find(p => p && fs.existsSync(p));
let chromium = null, devices = {}; try { ({ chromium, devices } = await import('playwright-core')); } catch { /* not installed */ }
const skip = !chromium || (!exe && !process.env.PLAYWRIGHT_BROWSERS_PATH) ? 'needs Chromium' : false;
const SHOTS = process.env.LIVE_CHOICE_SHOTS || '';
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
let browser = null;
test.before(async () => { if (!skip) browser = await chromium.launch({ ...(exe ? { executablePath: exe } : {}), args: ['--no-sandbox'] }); });
test.after(async () => { if (browser) await browser.close(); server.closeAllConnections(); server.close(); });
const VIEWS = [['desktop', { viewport: { width: 1280, height: 800 } }], ['iPhone', devices['iPhone 13'] ? { ...devices['iPhone 13'], defaultBrowserType: undefined } : { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }]];
async function pageFor(c, opts) {
  const ctx = await browser.newContext(opts);
  await ctx.addCookies([{ name: 'brb_session', value: c.cookie().split('=').slice(1).join('='), url: BASE }]);
  const page = await ctx.newPage(), errors = []; page.on('pageerror', e => errors.push(String(e)));
  return { ctx, page, errors };
}
const shown = page => page.$eval('.su-screen:not([hidden])', el => el.dataset.screen);
const next = page => page.click('.su-screen:not([hidden]) [data-go="next"]');
const playCards = page => page.$$eval('.su-pick[data-step="play"]', bs => bs.map(b => ({ id: b.dataset.id, on: b.getAttribute('aria-pressed') === 'true', off: b.disabled, line: b.querySelector('.su-desc').textContent })));
const noScroll = page => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
const clipped = page => page.$$eval('.su-screen:not([hidden]) .su-desc, .su-screen:not([hidden]) .su-name', els => els.filter(e => e.offsetParent && e.scrollHeight > e.clientHeight + 1).map(e => e.textContent));

for (const [label, opts] of VIEWS) {
  test(`the step in Chromium, teacher, ${label}: a quiz starts on Live; a survey's Live is greyed out with its reason; the plan says so`, { skip }, async () => {
    const { ctx, page, errors } = await pageFor(teach.c, opts);
    // a teacher starts on Classroom activity: Arcade game, then "Help me choose" (today's steps)
    await page.goto(`${BASE}/build/new`); await page.click('.su-kind[data-kind="arcade"]'); await page.click('#su-guide');
    await page.click('.su-pick[data-step="type"][data-id="quiz"]');
    for (let i = 0; i < 4; i++) await next(page);   // past 2D or 3D, world, characters
    assert.equal(await shown(page), 'play');
    assert.match(await page.textContent('.su-screen[data-screen="play"] .su-count'), /Step 5 of 7/);
    assert.deepEqual((await playCards(page)).map(c => `${c.id}:${c.on}:${c.off}`), ['live:true:false', 'screen:false:false', 'solo:false:false']);
    assert.ok(await noScroll(page)); assert.deepEqual(await clipped(page), [], 'no words cut off');
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/step-teacher-quiz-${label}.png`, fullPage: true });
    // a survey: Live stays, greyed out, with its reason; the step starts on one screen
    await page.click('.su-screen[data-screen="play"] [data-go="back"]'); await page.click('.su-screen[data-screen="chars"] [data-go="back"]');
    await page.click('.su-screen[data-screen="world"] [data-go="back"]'); await page.click('.su-screen[data-screen="look"] [data-go="back"]');
    assert.equal(await shown(page), 'type');
    await page.click('.su-pick[data-step="type"][data-id="survey"]'); await next(page);
    assert.equal(await shown(page), 'play'); assert.match(await page.textContent('.su-screen[data-screen="play"] .su-count'), /Step 2 of 3/);
    const cards = await playCards(page);
    assert.deepEqual(cards.map(c => `${c.id}:${c.on}:${c.off}`), ['live:false:true', 'screen:true:false', 'solo:false:false']);
    assert.match(cards[0].line, /Survey answers stay on this device/);
    assert.deepEqual(await clipped(page), [], 'the reason is not cut off');
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/step-teacher-survey-${label}.png`, fullPage: true });
    await page.click('.su-pick[data-step="play"][data-id="solo"]'); await next(page);
    assert.equal(await shown(page), 'extras'); assert.match(await page.textContent('.su-screen[data-screen="extras"] .su-count'), /Step 3 of 3/);
    await next(page); assert.equal(await shown(page), 'plan');
    assert.deepEqual(await page.$$eval('#su-rows dt', d => d.map(x => x.textContent)), ['Game type', 'How it is played', 'Extras']);
    await page.waitForFunction(() => { const t = document.getElementById('su-told').textContent; return t.length > 5 && t !== '…'; });
    assert.equal(await page.textContent('#su-told'), 'Here is my game plan. Kind of game: Class survey. It is played on my own.');
    assert.deepEqual(errors, []); await ctx.close();
  });

  test(`the step in Chromium, kid, ${label}: starts on their own and may pick Live; a ready-made 3D world greys Live out`, { skip }, async () => {
    const { ctx, page, errors } = await pageFor(kid.c, opts);
    await page.goto(`${BASE}/build/new`); await page.click('#su-guide');
    await page.click('.su-pick[data-step="type"][data-id="runner"]');
    for (let i = 0; i < 4; i++) await next(page);
    assert.equal(await shown(page), 'play');
    assert.deepEqual((await playCards(page)).map(c => `${c.id}:${c.on}:${c.off}`), ['live:false:false', 'screen:false:false', 'solo:true:false']);
    assert.match((await playCards(page))[0].line, /A teacher or grown-up runs it/);
    assert.ok(await noScroll(page)); assert.deepEqual(await clipped(page), []);
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/step-kid-${label}.png`, fullPage: true });
    await page.click('.su-pick[data-step="play"][data-id="live"]');
    assert.equal((await playCards(page))[0].on, true, 'a kid may pick Live (a grown-up hosts it)');
    // now 3D in a ready-made world: Live can't be, and the pick goes back to their own
    await page.click('.su-screen[data-screen="play"] [data-go="back"]'); await page.click('.su-screen[data-screen="chars"] [data-go="back"]');
    await page.click('.su-pick[data-step="world"][data-id="castle-quest"]'); await page.click('.su-screen[data-screen="world"] [data-go="back"]');
    await page.click('.su-pick[data-step="look"][data-id="3d"]');
    for (let i = 0; i < 3; i++) await next(page);
    assert.equal(await shown(page), 'play');
    const cards = await playCards(page);
    assert.deepEqual(cards.map(c => `${c.id}:${c.on}:${c.off}`), ['live:false:true', 'screen:false:false', 'solo:true:false']);
    assert.equal(cards[0].line, "The ready-made 3D worlds can't be played live yet.");
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/step-kid-kit2-${label}.png`, fullPage: true });
    assert.deepEqual(errors, []); await ctx.close();
  });

  test(`the Studio's live line in Chromium, ${label}: one line per state with its action; kids never get Host`, { skip }, async () => {
    for (const [who, c, G] of [['teacher', teach.c, tGames], ['kid', kid.c, kGames]]) {
      const { ctx, page, errors } = await pageFor(c, opts);
      const line = async id => {
        await page.goto(`${BASE}/studio/${id}`); await page.waitForSelector('#st-liveclass');
        return page.$eval('#st-liveclass', el => ({ line: el.dataset.line, text: el.textContent.replace(/\s+/g, ' ').trim(), host: !!el.querySelector('[data-act="host-live"]'), btns: [...el.querySelectorAll('button')].map(b => b.dataset.act) }));
      };
      const host = await line(G.host.id);
      if (who === 'teacher') { assert.deepEqual([host.line, host.text, host.host], ['host', '📡 Ready to host live Host live', true]); }
      else { assert.deepEqual([host.line, host.text, host.host], ['host', '📡 A teacher or grown-up can host this live', false], 'a kid never gets Host'); }
      assert.equal(await page.$$eval('a[href^="/live?game="]', a => a.length), who === 'teacher' ? 1 : 0);
      const box = await page.$eval('#st-liveclass', el => { const r = el.getBoundingClientRect(); return [r.left, r.right]; });
      assert.ok(box[0] >= 0 && box[1] <= (await page.evaluate(() => innerWidth)), 'the line fits'); assert.ok(await noScroll(page));
      if (SHOTS) await page.locator('.st-preview, #st-liveclass').last().screenshot({ path: `${SHOTS}/studio-host-${who}-${label}.png` });
      const pub = await line(G.publish.id);
      assert.equal(pub.text, who === 'teacher' ? '📡 Publish it to host it live Publish' : '📡 Publish it so a teacher or grown-up can host it live Publish'); assert.deepEqual(pub.btns, ['live-publish']);
      if (SHOTS) await page.locator('#st-liveclass').screenshot({ path: `${SHOTS}/studio-publish-${who}-${label}.png` });
      const fix = await line(G.fix.id);
      assert.equal(fix.text, "📡 Live, but needs a fix: it doesn't say when it is ready Fix it"); assert.deepEqual(fix.btns, ['fix-live']);
      if (SHOTS) await page.locator('#st-liveclass').screenshot({ path: `${SHOTS}/studio-fix-${who}-${label}.png` });
      const off = await line(G.off.id);
      assert.equal(off.text, '📡 Not a live game Make it live'); assert.deepEqual(off.btns, ['make-live']);
      if (SHOTS) await page.locator('#st-liveclass').screenshot({ path: `${SHOTS}/studio-off-${who}-${label}.png` });
      // "Make it live" where it cannot be: says why, sends nothing
      await line(G.kit2.id);
      let sent = 0; page.on('request', r => { if (/\/chat$/.test(r.url()) && r.method() === 'POST') sent++; });
      await page.click('#st-liveclass [data-act="make-live"]');
      assert.equal(await page.isVisible('#st-live-why'), true);
      assert.equal(await page.textContent('#st-live-why'), "The ready-made 3D worlds can't be played live yet.");
      assert.equal(await page.getAttribute('#st-liveclass [data-act="make-live"]', 'aria-expanded'), 'true');
      await page.waitForTimeout(200); assert.equal(sent, 0, 'nothing is sent to the Builder');
      if (SHOTS) await page.locator('#st-liveclass').screenshot({ path: `${SHOTS}/studio-off-kit2-${who}-${label}.png` });
      assert.deepEqual(errors, [], who); await ctx.close();
    }
  });
}
