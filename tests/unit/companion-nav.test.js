// Oomba companion: the greeting, navigate-then-do and choice cards (docs/decisions.md "Oomba companion: navigate-then-do
// and choice cards"). The greeting by the teacher's local hour, language and their own name (never a student's), the
// same all day; a request that needs another page becomes a "Go there" card (only the teacher's own pages), its
// request kept with the conversation for that exact page, run once there and only there, and gone after 10 minutes or
// on Not now; several pages that fit become a choice card whose tap makes the Go there card; askChoice's options come
// back as the teacher's answer. The AI is a stand-in (services/companion.js hooks.create); no network.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const { config } = await import('../../server/config.js');
config.anthropicKey = '';
const { q, now } = await import('../../server/db.js');
const { createUser, startSession, getUser } = await import('../../server/auth.js');
const S = await import('../../server/services/schools.js');
const D = await import('../../server/services/dash.js');
const CO = await import('../../server/services/companion.js');
const C = await import('../../server/services/oomba-chat.js');
const RL = await import('../../server/services/ratelimit.js');
const { makeT, CODES } = await import('../../server/i18n/index.js');
const { greeting, partOf } = await import('../../public/js/companion-greet.js');
const { createApp } = await import('../../server/app.js');

let server, base;
test.before(async () => { server = createApp().listen(0); server.keepAliveTimeout = 0; await new Promise(r => server.once('listening', r)); base = `http://127.0.0.1:${server.address().port}`; });
test.after(() => { CO.hooks.create = null; server.close(); });
test.beforeEach(() => RL._reset());
const cookieFor = id => { let c = ''; startSession({ append: (k, v) => { c = v.split(';')[0]; } }, id); return c; };
const as = who => async (p, { body } = {}) => {
  const headers = { cookie: cookieFor(who.id) };
  if (body !== undefined) headers['content-type'] = 'application/json';
  const r = await fetch(base + p, { method: body !== undefined ? 'POST' : 'GET', headers, body: body !== undefined ? JSON.stringify(body) : undefined, redirect: 'manual' });
  const text = await r.text(); let json = null; try { json = JSON.parse(text); } catch { /* html */ }
  return { status: r.status, text, json };
};
const boss = createUser({ username: 'NavBoss', password: 'secret123', role: 'admin' });
const oak = S.createSchool(boss, { name: 'Nav Oak' }).school;
let k = 0;
function teacher({ classes = 1 } = {}) {
  const u = getUser(S.createSchoolAccount(boss, oak.id, { rosterName: `Greg Teacher${++k}`, role: 'admin' }).user.id);
  config.manipulativesUsers = [...config.manipulativesUsers, u.username.toLowerCase()];
  const cs = Array.from({ length: classes }, (_, i) => S.createClass(boss, oak.id, { name: `${3 + i}B-${k}`, grade: String(3 + i), teacherId: u.id }).class);
  const kid = getUser(S.createSchoolAccount(boss, oak.id, { rosterName: 'Quinn Marsh' }).user.id); S.addToClass(boss, cs[0].id, kid.id);
  return { u, cs, kid };
}
/** The stand-in AI: script(params) -> [tool, input] to call first, or null; then reply. */
function standIn(script, reply = 'Okay.') {
  const calls = [];
  CO.hooks.create = async p => {
    calls.push(JSON.parse(JSON.stringify(p)));
    const afterTool = Array.isArray(p.messages.at(-1).content) && p.messages.at(-1).content.some(c => c.type === 'tool_result');
    const t = afterTool ? null : script(p);
    if (t) return { model: p.model, usage: {}, stop_reason: 'tool_use', content: [{ type: 'tool_use', id: `tu${calls.length}`, name: t[0], input: t[1] }] };
    return { model: p.model, usage: {}, stop_reason: 'end_turn', content: [{ type: 'text', text: reply }] };
  };
  return calls;
}
const chatOf = async who => (await as(who)('/api/companion/chat')).json.chat;
const reset = async who => { await C.allSettled(); CO.reset(who); };
const DASH_ASK = 'add a 5 minute timer and class jobs to my dashboard';

test('the greeting: the part of the day by the teacher\'s local hour, the same all day, their own name, every language, no em dashes', async () => {
  assert.deepEqual([4, 5, 11, 12, 16, 17, 21, 22].map(partOf), ['night', 'morning', 'morning', 'afternoon', 'afternoon', 'evening', 'evening', 'night']);
  const t = makeT('en');
  const mon8 = new Date(2026, 10, 23, 8, 5), mon10 = new Date(2026, 10, 23, 10, 40);
  const a = greeting(t, mon8, 'Greg'), b = greeting(t, mon10, 'Greg');
  assert.equal(a.key, b.key, 'the same pick all morning: no flicker');
  assert.ok(['morning', 'back', 'hi', 'monday'].includes(a.key), a.key);
  assert.match(a.title, /Greg/); assert.ok(a.line.length > 5);
  const eve = greeting(t, new Date(2026, 10, 24, 19), 'Greg');
  assert.ok(['evening', 'back', 'hi'].includes(eve.key), eve.key);
  const fri = Array.from({ length: 8 }, (_, w) => greeting(t, new Date(2026, 10, 27 + 7 * w, 14), 'Greg').key);
  assert.ok(fri.includes('friday'), 'a Friday greeting on some Fridays');
  assert.doesNotMatch(greeting(t, mon8, '').title, /\{|undefined|,\s*$/, 'no name: a plain greeting');
  assert.equal(greeting(t, mon8, 'Greg', 'Tell me what this worksheet needs.').line, 'Tell me what this worksheet needs.', 'a page\'s own second line');
  for (const code of CODES) {
    const tl = makeT(code), g = greeting(tl, mon8, 'Ana');
    assert.match(g.title, /Ana/, code); assert.doesNotMatch(g.title + g.line, /—|\{/, code);
    for (const key of ['morning', 'afternoon', 'evening', 'night', 'back', 'hi', 'friday', 'monday', 'weekend']) assert.doesNotMatch(tl(`js.companion-greet.${key}`, { name: 'Ana' }) + tl(`js.companion-greet.${key}Plain`), /—/, `${code} ${key}`);
  }
  // The name is the teacher's own, as the site shows it in their header: never a student's.
  const { u, cs } = teacher();
  const page = await as(u)(`/class/${cs[0].id}`);
  const oc = JSON.parse(/data-oc="([^"]*)"/.exec(page.text)[1].replace(/&quot;/g, '"'));
  assert.equal(oc.name, 'Greg');
  assert.doesNotMatch(page.text.match(/data-oc="[^"]*"/)[0], /Quinn|Marsh/);
  // No example prompts in the empty panel: the client asks for none, on any page.
  const js = fs.readFileSync('public/js/companion.js', 'utf8');
  assert.match(js, /ideas: \(\) => \[\],/); assert.match(js, /ideasAfter: \(\) => \[\],/);
  for (const f of ['public/js/figures-sheet.js', 'public/js/manip-chat.js']) assert.doesNotMatch(fs.readFileSync(f, 'utf8'), /^\s+ideas(After)?:/m, f);
});

test('navigate-then-do: one dashboard fits: a Go there card; the request runs once on that exact page, never elsewhere, gone after 10 minutes', async () => {
  const { u, cs } = teacher();
  const calls = standIn(p => (/"school" page/.test(p.system) ? ['proposeNavigation', { pageType: 'dashboard' }] : null), 'I\'ll do that on your dashboard.');
  try {
    const r = await as(u)('/api/companion/chat', { body: { text: DASH_ASK, page: { type: 'school' } } });
    assert.equal(r.status, 200); await C.allSettled();
    assert.ok(calls[0].tools.some(x => x.name === 'proposeNavigation') && calls[0].tools.some(x => x.name === 'askChoice'));
    assert.match(calls[0].system, /Never tell the teacher to open it and ask again/);
    const turn = (await chatOf(u)).turns.at(-1);
    const n = turn.note.nav;
    assert.equal(n.pageType, 'dashboard'); assert.equal(n.targetId, cs[0].id); assert.equal(n.href, `/class/${cs[0].id}/dashboard`);
    assert.equal(n.request, DASH_ASK); assert.equal(n.state, 'open');
    assert.equal((await as(u)('/api/companion/chat?peek=1')).json.pending, false, 'nothing pending before the tap');
    const go = await as(u)('/api/companion/chat/act', { body: { turnId: turn.id, act: 'go' } });
    assert.equal(go.status, 200); assert.equal(go.json.href, `/class/${cs[0].id}/dashboard`);
    assert.equal(go.json.chat.turns.find(x => x.id === turn.id).note.nav.state, 'going');
    assert.ok(q.get("SELECT 1 FROM audit_log WHERE action='companion.nav' AND target=?", cs[0].id));
    assert.equal((await as(u)('/api/companion/chat?peek=1')).json.pending, true);
    // Another page: nothing runs, and it stays pending.
    const n0 = calls.length;
    const wrong = await as(u)('/api/companion/resume', { body: { page: { type: 'class', classId: cs[0].id } } });
    assert.equal(wrong.json.resumed, false); assert.equal(calls.length, n0);
    // The exact page: the same request runs there, once.
    const ok = await as(u)('/api/companion/resume', { body: { page: { type: 'dashboard', classId: cs[0].id } } });
    assert.equal(ok.json.resumed, true);
    const me = ok.json.chat.turns.at(-1);
    assert.equal(me.text, DASH_ASK); assert.deepEqual(me.meta.page, { type: 'dashboard', classId: cs[0].id });
    await C.allSettled();
    assert.equal((await as(u)('/api/companion/resume', { body: { page: { type: 'dashboard', classId: cs[0].id } } })).json.resumed, false, 'once');
    // Expired: older than 10 minutes, it never runs and is cleared.
    standIn(p => (/"school" page/.test(p.system) ? ['proposeNavigation', { pageType: 'dashboard' }] : null));
    await as(u)('/api/companion/chat', { body: { text: DASH_ASK, page: { type: 'school' } } }); await C.allSettled();
    const t2 = (await chatOf(u)).turns.at(-1);
    await as(u)('/api/companion/chat/act', { body: { turnId: t2.id, act: 'go' } });
    const row = q.get("SELECT * FROM oomba_chats WHERE owner_id=? AND surface='companion'", u.id), opts = JSON.parse(row.opts);
    opts.pending.at = now() - CO.NAV_KEEP_MS - 1000; q.run('UPDATE oomba_chats SET opts=? WHERE id=?', JSON.stringify(opts), row.id);
    const late = await as(u)('/api/companion/resume', { body: { page: { type: 'dashboard', classId: cs[0].id } } });
    assert.equal(late.json.resumed, false); assert.equal((await as(u)('/api/companion/chat?peek=1')).json.pending, false);
  } finally { await reset(u); }
});

test('Not now leaves nothing pending; a card older than 10 minutes opens nothing', async () => {
  const { u } = teacher();
  standIn(p => (/"school" page/.test(p.system) ? ['proposeNavigation', { pageType: 'dashboard' }] : null));
  try {
    await as(u)('/api/companion/chat', { body: { text: DASH_ASK, page: { type: 'school' } } }); await C.allSettled();
    const turn = (await chatOf(u)).turns.at(-1);
    const no = await as(u)('/api/companion/chat/act', { body: { turnId: turn.id, act: 'notNow' } });
    assert.equal(no.json.chat.turns.find(x => x.id === turn.id).note.nav.state, 'declined');
    assert.equal((await as(u)('/api/companion/chat?peek=1')).json.pending, false);
    assert.equal((await as(u)('/api/companion/chat/act', { body: { turnId: turn.id, act: 'go' } })).status, 404, 'a declined card stays declined');
    await as(u)('/api/companion/chat', { body: { text: DASH_ASK, page: { type: 'school' } } }); await C.allSettled();
    const t2 = (await chatOf(u)).turns.at(-1);
    const row = q.get("SELECT * FROM oomba_chats WHERE owner_id=? AND surface='companion'", u.id), turns = JSON.parse(row.turns);
    turns.find(x => x.id === t2.id).note.nav.at = now() - CO.NAV_KEEP_MS - 1000; q.run('UPDATE oomba_chats SET turns=? WHERE id=?', JSON.stringify(turns), row.id);
    const old = await as(u)('/api/companion/chat/act', { body: { turnId: t2.id, act: 'go' } });
    assert.equal(old.json.href, undefined); assert.equal(old.json.chat.turns.find(x => x.id === t2.id).note.nav.state, 'expired');
  } finally { await reset(u); }
});

test('several dashboards fit: a choice card first, each option carrying its target; the tap makes the Go there card', async () => {
  const { u, cs } = teacher({ classes: 2 });
  standIn(p => (/"school" page/.test(p.system) ? ['proposeNavigation', { pageType: 'dashboard' }] : null), 'Which class?');
  try {
    await as(u)('/api/companion/chat', { body: { text: DASH_ASK, page: { type: 'school' } } }); await C.allSettled();
    const turn = (await chatOf(u)).turns.at(-1);
    const a = turn.note.ask;
    assert.equal(a.kind, 'dashboard'); assert.equal(turn.note.nav, undefined);
    assert.deepEqual(a.options.map(o => o.label).sort(), cs.map(c => c.name).sort());
    assert.ok(a.options.every(o => o.nav && o.nav.pageType === 'dashboard'));
    const i = a.options.findIndex(o => o.nav.id === cs[1].id);
    const pick = await as(u)('/api/companion/chat/act', { body: { turnId: turn.id, act: 'askPick', value: String(i) } });
    assert.equal(pick.status, 200);
    const chat = pick.json.chat;
    assert.equal(chat.turns.find(x => x.id === turn.id).note.ask.state, 'answered');
    const nav = chat.turns.at(-1).note.nav;
    assert.equal(nav.targetId, cs[1].id); assert.equal(nav.request, DASH_ASK); assert.equal(nav.state, 'open');
  } finally { await reset(u); }
});

test('scope: only the teacher\'s own classes, worksheets and boards; another teacher\'s class id makes nothing', async () => {
  const { u, cs } = teacher();
  const other = teacher();
  assert.deepEqual(CO.navTargets(u, 'dashboard').map(x => x.id), [cs[0].id]);
  assert.equal(CO.navTarget(u, 'dashboard', other.cs[0].id), null);
  assert.equal(CO.navTarget(u, 'class', other.cs[0].id), null);
  assert.equal(CO.navTargets(other.kid, 'class').length, 0, 'a student has none');
  standIn(p => (/"school" page/.test(p.system) ? ['proposeNavigation', { pageType: 'dashboard', id: other.cs[0].id }] : null));
  try {
    await as(u)('/api/companion/chat', { body: { text: DASH_ASK, page: { type: 'school' } } }); await C.allSettled();
    const turn = (await chatOf(u)).turns.at(-1);
    // Not theirs: the id is ignored; their own single dashboard is offered instead (never the other teacher's).
    assert.notEqual(turn.note.nav && turn.note.nav.targetId, other.cs[0].id);
    // Already on that page: no card, the request is done here.
    standIn(p => ['proposeNavigation', { pageType: 'dashboard', id: cs[0].id }]);
    await as(u)('/api/companion/chat', { body: { text: DASH_ASK, page: { type: 'dashboard', classId: cs[0].id } } }); await C.allSettled();
    assert.equal((await chatOf(u)).turns.at(-1).note.nav, undefined);
  } finally { await reset(u); }
});

test('askChoice: a compact card with 2 to 5 options (names taken out); a tap comes back as the teacher\'s answer', async () => {
  const { u } = teacher();
  standIn(() => ['askChoice', { question: 'Which grade is this for?', options: ['Grade 2', 'Grade 3', 'Grade 3', 'Quinn Marsh grade 4'] }], 'Which grade?');
  try {
    await as(u)('/api/companion/chat', { body: { text: 'find a fractions game', page: { type: 'teach' } } }); await C.allSettled();
    const turn = (await chatOf(u)).turns.at(-1);
    const a = turn.note.ask;
    assert.equal(a.question, 'Which grade is this for?');
    assert.deepEqual(a.options.map(o => o.label), ['Grade 2', 'Grade 3', '[student] grade 4'], 'deduplicated, names taken out');
    const pick = await as(u)('/api/companion/chat/act', { body: { turnId: turn.id, act: 'askPick', value: '1' } });
    assert.equal(pick.json.text, 'Grade 3');
    assert.equal(pick.json.chat.turns.find(x => x.id === turn.id).note.ask.chosen, 1);
    assert.equal((await as(u)('/api/companion/chat/act', { body: { turnId: turn.id, act: 'askPick', value: '0' } })).status, 404, 'once');
    // Too few options: no card.
    standIn(() => ['askChoice', { question: 'Sure?', options: ['Yes'] }], 'Sure?');
    await as(u)('/api/companion/chat', { body: { text: 'another one', page: { type: 'teach' } } }); await C.allSettled();
    assert.equal((await chatOf(u)).turns.at(-1).note.ask, undefined);
  } finally { await reset(u); }
});
