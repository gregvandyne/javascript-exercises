// Classroom dashboards, stage 5 (services/dash.js, services/dash-media.js, routes/dash.js, public/js/dash-class5.js,
// public/js/dash-camera.js, public/js/dash-video.js): video, the site window and the document camera (the teacher's
// screen only), the hall pass, class jobs, points for each student, the mood check-in, and the rest of the classroom
// toolset. Video links become a provider and an id (never a stored or echoed address); site addresses are https only;
// the CSP widens only on the teacher's dashboard page; students see only their own pass, points and face; nothing
// external ever reaches a student; every new setting is rebuilt on the server.
import fs from 'node:fs';
import os from 'node:os';
process.env.BRB_DB = ':memory:'; process.env.BRB_SILENT = '1'; process.env.LOG_REQUESTS = '0';
process.env.BRB_DATA_DIR = fs.mkdtempSync(os.tmpdir() + '/brb-dash5-');
import test from 'node:test';
import assert from 'node:assert/strict';
const { config } = await import('../../server/config.js');
config.anthropicKey = '';
const { q, MIGRATIONS } = await import('../../server/db.js');
const { createUser, startSession, getUser } = await import('../../server/auth.js');
const S = await import('../../server/services/schools.js');
const D = await import('../../server/services/dash.js');
const DM = await import('../../server/services/dash-media.js');
const V = await import('../../public/js/dash-video.js');
const C5 = await import('../../public/js/dash-class5.js');
const CAM = await import('../../public/js/dash-camera.js');
const W = await import('../../public/js/dash-widgets.js');
const { createApp, SITE_CSP } = await import('../../server/app.js');
const { tFor } = await import('../../server/i18n/index.js');

let server, base;
test.before(async () => { server = createApp().listen(0); server.keepAliveTimeout = 0; await new Promise(r => server.once('listening', r)); base = `http://127.0.0.1:${server.address().port}`; });
test.after(() => { DM._setSiteProbe(null); server.close(); });
const cookieFor = id => { let c = ''; startSession({ append: (k, v) => { c = v.split(';')[0]; } }, id); return c; };
const as = who => async (p, { method = 'GET', body } = {}) => {
  const headers = { ...(who ? { cookie: cookieFor(who.id) } : {}) };
  if (body !== undefined) headers['content-type'] = 'application/json';
  const r = await fetch(base + p, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined, redirect: 'manual' });
  const text = await r.text(); let json = null; try { json = JSON.parse(text); } catch { /* html */ }
  return { status: r.status, text, json, headers: r.headers };
};
const POST = (body = {}) => ({ method: 'POST', body });
const pageData = html => JSON.parse(/<script[^>]*id="page-data"[^>]*>([\s\S]*?)<\/script>/.exec(html)[1].replace(/\\u003c/g, '<'));

const boss = createUser({ username: 'Dash5Boss', password: 'secret123', role: 'admin' });
let worlds = 0;
function world() {
  const k = ++worlds;
  const oak = S.createSchool(boss, { name: `Dash5 Oak ${k}` }).school;
  const T = getUser(S.createSchoolAccount(boss, oak.id, { rosterName: 'Tia Teacher', role: 'teacher' }).user.id);
  const T2 = getUser(S.createSchoolAccount(boss, oak.id, { rosterName: 'Tom Other', role: 'teacher' }).user.id);
  const A = S.createClass(T, oak.id, { name: '5A' }).class, B = S.createClass(T2, oak.id, { name: '5B' }).class;
  const kid = (name, c) => { const u = S.createSchoolAccount(T, oak.id, { rosterName: name }).user; if (c) S.addToClass(boss, c.id, u.id); return getUser(u.id); };
  const a1 = kid('Ada Apple', A), a2 = kid('Abe Acorn', A), a3 = kid('Ali Aspen', A), b1 = kid('Bea Bloom', B);
  const stranger = createUser({ username: `Dash5Str${k}`, password: 'secret123' });
  return { oak, T, T2, A, B, a1, a2, a3, b1, stranger, REAL: /Ada Apple|Abe Acorn|Ali Aspen|Bea Bloom|Tia Teacher/ };
}
async function layout(w, widgets) {
  await as(w.T)(`/class/${w.A.id}/dashboard`);
  const l = D.layoutsOf(w.A.id, w.T.id)[0];
  const r = await as(w.T)(`/api/dash/${w.A.id}/layouts/${l.id}`, POST({ widgets }));
  assert.equal(r.status, 200, r.text);
  return r.json.layout;
}
const STAGE5 = ['video', 'site', 'camera', 'hallpass', 'jobs', 'mood', 'breathe', 'note', 'checklist'];

test('migration 0081: hall passes, points and moods (0082 is Sum Spotter\'s shelf, tests/unit/sum-spotter.test.js)', () => {
  const names = MIGRATIONS.map(m => m[0]);
  assert.equal(names[names.indexOf('0081_dash_class_tools') + 1], '0082_sum_spotter_shelf');
  assert.equal(names.indexOf('0081_dash_class_tools'), names.indexOf('0080_dash_teaching_tools') + 1);
  for (const tb of ['dash_passes', 'dash_points', 'dash_moods']) assert.ok(q.get("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", tb), tb);
  // Minimal: a pass has a place, a state and two times; a point row is a count; a mood is a face's index.
  assert.deepEqual(q.all('PRAGMA table_info(dash_passes)').map(c => c.name), ['id', 'class_id', 'user_id', 'place', 'day', 'state', 'asked_at', 'out_at']);
  assert.deepEqual(q.all('PRAGMA table_info(dash_moods)').map(c => c.name), ['class_id', 'user_id', 'day', 'mood', 'at']);
});

test('the registry: every stage 5 type has a renderer and English words; who may add and pin each', () => {
  const t = tFor('en');
  const reg = D.registryFor(t, 'teacher');
  for (const id of STAGE5) {
    const x = reg.types.find(y => y.id === id);
    assert.ok(x, id); assert.equal(typeof W.RENDER[id], 'function', `renderer for ${id}`);
    assert.ok(x.name && !x.name.startsWith('dash.'), `${id} name`);
    for (const [k, v] of Object.entries(x.words)) assert.ok(v && !v.startsWith('dash.'), `${id}.${k}`);
    for (const s of x.settings) if (s.type !== 'tool') assert.ok(s.label && !s.label.startsWith('dash.'), `${id}.s.${s.key}`);
  }
  // Teacher only, never pinned: video, site window, camera (and the sticky note, which is the teacher's own).
  for (const id of ['video', 'site', 'camera']) { const x = D.widgetType(id); assert.equal(x.who, 'teacher'); assert.equal(D.canPin(x), false, id); assert.ok(D.TEACHER_ONLY.includes(id)); }
  assert.equal(D.canPin(D.widgetType('note')), false);
  // Students may add only the breathing circle of the new ones (it runs in their own browser).
  assert.deepEqual(STAGE5.filter(id => D.canAdd(D.widgetType(id), 'student')), ['breathe']);
  // The hall pass and the mood check-in are pinned when added (students need them); jobs and checklist may be pinned.
  assert.equal(D.widgetType('hallpass').pinDef, true); assert.equal(D.widgetType('mood').pinDef, true);
  assert.ok(D.canPin(D.widgetType('jobs')) && D.canPin(D.widgetType('checklist')) && D.canPin(D.widgetType('breathe')));
  // The audit: every classroom-display tool the brief lists has a widget (or a mode of one).
  const ids = D.WIDGETS.map(x => x.id);
  for (const id of ['text', 'clock', 'timer', 'picker', 'groups', 'noise', 'qr', 'light', 'symbols', 'check', 'calendar', 'countdown', 'dice', 'breathe', 'schedule', 'note', 'checklist', 'mood', 'score'])
    assert.ok(ids.includes(id), id);
  assert.deepEqual(D.widgetType('timer').settings.find(s => s.key === 'mode').options, ['timer', 'stopwatch'], 'the stopwatch is a mode of the timer');
  assert.ok(D.widgetType('schedule').settings.find(s => s.key === 'view').options.includes('nownext'));
  assert.ok(D.widgetType('score').settings.find(s => s.key === 'mode').options.includes('students'));
});

// ---------------------------------------------------------------- video
test('video links: YouTube and Vimeo ids are parsed and checked; anything else is refused', () => {
  const ok = [
    ['https://www.youtube.com/watch?v=aqz-KE-bpKQ', { p: 'youtube', id: 'aqz-KE-bpKQ' }],
    ['https://youtu.be/aqz-KE-bpKQ?t=95', { p: 'youtube', id: 'aqz-KE-bpKQ', t: 95 }],
    ['youtu.be/aqz-KE-bpKQ', { p: 'youtube', id: 'aqz-KE-bpKQ' }],
    ['https://m.youtube.com/watch?v=aqz-KE-bpKQ&t=1m30s', { p: 'youtube', id: 'aqz-KE-bpKQ', t: 90 }],
    ['https://www.youtube.com/embed/aqz-KE-bpKQ', { p: 'youtube', id: 'aqz-KE-bpKQ' }],
    ['https://www.youtube.com/shorts/aqz-KE-bpKQ', { p: 'youtube', id: 'aqz-KE-bpKQ' }],
    ['https://www.youtube-nocookie.com/embed/aqz-KE-bpKQ', { p: 'youtube', id: 'aqz-KE-bpKQ' }],
    ['https://vimeo.com/76979871', { p: 'vimeo', id: '76979871' }],
    ['https://vimeo.com/76979871/8272103f6e', { p: 'vimeo', id: '76979871', h: '8272103f6e' }],
    ['https://player.vimeo.com/video/76979871?h=8272103f6e', { p: 'vimeo', id: '76979871', h: '8272103f6e' }],
    ['https://vimeo.com/channels/staffpicks/76979871#t=30s', { p: 'vimeo', id: '76979871', t: 30 }],
  ];
  for (const [link, want] of ok) { assert.deepEqual(DM.parseVideo(link), want, link); assert.deepEqual(V.parseVideo(link), want, `browser: ${link}`); }
  const bad = ['', 'aqz-KE-bpKQ', 'javascript:alert(1)//youtube.com/watch?v=aqz-KE-bpKQ', 'data:text/html,<script>alert(1)</script>', 'http://www.youtube.com/watch?v=aqz-KE-bpKQ',
    'https://www.youtube.com.evil.example/watch?v=aqz-KE-bpKQ', 'https://evilyoutube.com/watch?v=aqz-KE-bpKQ', 'https://www.youtube.com/watch?v=aqz-KE-bpK', 'https://www.youtube.com/watch?v=aqz-KE-bpKQQ',
    'https://www.youtube.com/watch?v=aqz-KE<bpKQ', 'https://youtu.be/aqz-KE-bpKQ/extra', 'https://www.youtube.com/watch/aqz-KE-bpKQ', 'https://user:pw@www.youtube.com/watch?v=aqz-KE-bpKQ',
    'https://www.youtube.com:8443/watch?v=aqz-KE-bpKQ', 'https://vimeo.com/abc', 'https://vimeo.com/76979871/ZZZ', 'https://player.vimeo.com/video/76979871?h=not-hex!', 'https://example.com/v.mp4',
    'https://www.youtube.com/watch?v=aqz-KE-bpKQ‮', `https://youtu.be/${'a'.repeat(400)}`, 'file:///etc/passwd', 'ftp://youtube.com/watch?v=aqz-KE-bpKQ'];
  for (const link of bad) { assert.equal(DM.parseVideo(link), null, link); assert.equal(V.parseVideo(link), null, `browser: ${link}`); }
  // What is stored is the provider and the id only: never the link, its host or anything else in it.
  const stored = DM.cleanVideo('https://www.youtube.com/watch?v=aqz-KE-bpKQ&list=PLx&utm_source=evil');
  assert.deepEqual(stored, { p: 'youtube', id: 'aqz-KE-bpKQ' });
  assert.doesNotMatch(JSON.stringify(stored), /https?:|youtube\.com|utm|list/);
  assert.equal(DM.cleanVideo({ p: 'youtube', id: 'aqz-KE-bpKQ', url: 'https://evil.example' }).url, undefined);
  assert.equal(DM.cleanVideo({ p: 'youtube', id: '"><script>' }), null);
  assert.equal(DM.cleanVideo({ p: 'dailymotion', id: 'x7tgad0' }), null);
  assert.equal(DM.cleanVideo({ p: 'vimeo', id: '1', h: 'zz' }), null);
  // Through the layout: a pasted link becomes { p, id }.
  const s = D.cleanSettings(D.widgetType('video'), { video: 'https://youtu.be/aqz-KE-bpKQ', start: '1:30', end: '99999999', mute: 'true', loop: 1, extra: 'x' });
  assert.deepEqual(s, { video: { p: 'youtube', id: 'aqz-KE-bpKQ' }, start: 90, end: 0, mute: true, loop: true });
  assert.equal(D.cleanSettings(D.widgetType('video'), { video: 'https://evil.example/x' }).video, null);
});

test('video players come from the privacy-enhanced hosts only, with the teacher\'s start, end, mute and loop', () => {
  const y = new URL(DM.videoSrc({ p: 'youtube', id: 'aqz-KE-bpKQ' }, { start: 90, end: 150, mute: true, loop: true }));
  assert.equal(y.origin, 'https://www.youtube-nocookie.com'); assert.equal(y.pathname, '/embed/aqz-KE-bpKQ');
  assert.equal(y.searchParams.get('start'), '90'); assert.equal(y.searchParams.get('end'), '150'); assert.equal(y.searchParams.get('mute'), '1');
  assert.equal(y.searchParams.get('loop'), '1'); assert.equal(y.searchParams.get('playlist'), 'aqz-KE-bpKQ');
  assert.equal(new URL(DM.videoSrc({ p: 'youtube', id: 'aqz-KE-bpKQ' }, { start: 90, end: 30 })).searchParams.get('end'), null, 'an end before the start is left out');
  const v = new URL(DM.videoSrc({ p: 'vimeo', id: '76979871', h: '8272103f6e' }, { start: 75, mute: true }));
  assert.equal(v.origin, 'https://player.vimeo.com'); assert.equal(v.searchParams.get('dnt'), '1'); assert.equal(v.searchParams.get('h'), '8272103f6e'); assert.equal(v.hash, '#t=75s');
  assert.equal(DM.videoSrc({ p: 'youtube', id: 'nope' }), null);
  // The browser builds exactly the same address.
  for (const [x, o] of [[{ p: 'youtube', id: 'aqz-KE-bpKQ' }, { start: 5, loop: true }], [{ p: 'vimeo', id: '76979871' }, { mute: true }]]) assert.equal(V.videoSrc(x, o), DM.videoSrc(x, o));
  assert.deepEqual(V.VIDEO_HOSTS, DM.VIDEO_HOSTS);
  // The renderer embeds with a sandbox and only the origin as referrer; never youtube.com itself.
  const src = fs.readFileSync('public/js/dash-class5.js', 'utf8');
  assert.match(src, /sandbox', 'allow-scripts allow-same-origin allow-presentation'/);
  assert.match(src, /strict-origin-when-cross-origin/);
  assert.doesNotMatch(src + fs.readFileSync('public/js/dash-video.js', 'utf8'), /https:\/\/(www\.)?youtube\.com\/embed/);
});

// ---------------------------------------------------------------- site window
test('site addresses: https only (no javascript:, data:, http:, local or IP addresses)', () => {
  assert.equal(D.cleanUrl('https://www.example.org/maths?unit=3'), 'https://www.example.org/maths?unit=3');
  for (const bad of ['javascript:alert(1)', 'JAVASCRIPT:alert(1)', ' javascript:alert(1)', 'data:text/html,<b>x</b>', 'http://example.org', 'file:///etc/passwd', 'ftp://example.org',
    'https://user:pw@example.org', 'https://localhost/', 'https://127.0.0.1/', 'https://10.0.0.1/', 'https://printer.local/', 'https://example.org:8443/', 'https://exa mple.org', 'example.org', '//example.org'])
    assert.equal(D.cleanUrl(bad), null, bad);
  const site = D.widgetType('site');
  assert.deepEqual(D.cleanSettings(site, { url: 'javascript:alert(1)' }), { url: '' });
  assert.deepEqual(D.cleanSettings(site, { url: 'data:text/html,x' }), { url: '' });
  assert.deepEqual(D.cleanSettings(site, { url: 'https://example.org/a' }), { url: 'https://example.org/a' });
});

test('site addresses: the settings form refuses what the server would drop (the browser\'s rule agrees with cleanUrl)', () => {
  // Before, the form only checked https and a dot, so an IP address, a port or a .local name was accepted, shown with an
  // "Open in a new tab" link to it, and then silently dropped by the server on save.
  for (const x of ['https://www.example.org/maths?unit=3', 'https://example.org:443/a', 'https://EXAMPLE.org/A', 'https://example.org/a b', 'javascript:alert(1)', 'http://example.org',
    'https://user:pw@example.org', 'https://localhost/', 'https://app.localhost/', 'https://127.0.0.1/', 'https://10.0.0.1/', 'https://[::1]/', 'https://printer.local/', 'https://db.internal/',
    'https://example.org:8443/', 'https://exa mple.org', 'example.org', '//example.org', 'https://.example.org/', 'https://example.org‮/', `https://example.org/${'a'.repeat(500)}`, ''])
    assert.equal(V.siteUrl(x), D.cleanUrl(x), x);
  for (const x of ['https://10.0.0.1/', 'https://example.org:8443/', 'https://printer.local/', 'https://x.internal/']) assert.equal(V.siteUrl(x), null, x);
  // The settings editor uses it.
  assert.match(fs.readFileSync('public/js/dash.js', 'utf8'), /siteUrl\(x\)/);
});

test('may a site be framed: X-Frame-Options and frame-ancestors, as browsers read them; private addresses never asked', async () => {
  const ours = 'https://oomba.example';
  assert.equal(DM.frameVerdict({}, ours), 'ok');
  assert.equal(DM.frameVerdict({ 'x-frame-options': 'DENY' }, ours), 'blocked');
  assert.equal(DM.frameVerdict({ 'x-frame-options': 'sameorigin' }, ours), 'blocked');
  assert.equal(DM.frameVerdict({ 'x-frame-options': 'ALLOW-FROM https://oomba.example' }, ours), 'blocked');
  assert.equal(DM.frameVerdict({ 'content-security-policy': "default-src 'self'; frame-ancestors 'none'" }, ours), 'blocked');
  assert.equal(DM.frameVerdict({ 'content-security-policy': "frame-ancestors 'self'" }, ours), 'blocked');
  assert.equal(DM.frameVerdict({ 'content-security-policy': 'frame-ancestors *' }, ours), 'ok');
  assert.equal(DM.frameVerdict({ 'content-security-policy': 'frame-ancestors https:' }, ours), 'ok');
  assert.equal(DM.frameVerdict({ 'content-security-policy': 'frame-ancestors https://*.example' }, ours), 'ok');
  assert.equal(DM.frameVerdict({ 'content-security-policy': 'frame-ancestors https://other.example' }, ours), 'blocked');
  // frame-ancestors wins over X-Frame-Options; every policy must allow it.
  assert.equal(DM.frameVerdict({ 'x-frame-options': 'DENY', 'content-security-policy': 'frame-ancestors *' }, ours), 'ok');
  assert.equal(DM.frameVerdict({ 'content-security-policy': ['frame-ancestors *', "frame-ancestors 'none'"] }, ours), 'blocked');
  for (const ip of ['127.0.0.1', '10.1.2.3', '192.168.0.1', '172.20.0.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '::1', 'fd00::1', 'fe80::1', '::ffff:127.0.0.1', '224.0.0.1'])
    assert.equal(DM.privateAddress(ip), true, ip);
  for (const ip of ['93.184.216.34', '2606:4700::1111']) assert.equal(DM.privateAddress(ip), false, ip);
  // No answer (here: a name that does not resolve) means "can't be shown", never an error.
  const r = await DM.siteFrame('https://no-such-host.invalid/', ours, D.cleanUrl, 1500);
  assert.equal(r.frame, 'unknown');
});

test('the CSP: the teacher\'s dashboard frames only the two video hosts; students and every other page keep the site\'s', async () => {
  const w = world();
  await layout(w, [{ id: 'v1', type: 'video', s: { video: { p: 'youtube', id: 'aqz-KE-bpKQ' } } }, { id: 'st1', type: 'site', s: { url: 'https://maps.example.org/' } }]);
  const tp = await as(w.T)(`/class/${w.A.id}/dashboard`);
  const csp = tp.headers.get('content-security-policy');
  assert.match(csp, /frame-src 'self' https:\/\/www\.youtube-nocookie\.com https:\/\/player\.vimeo\.com;/);
  assert.doesNotMatch(csp, /frame-src[^;]*\bhttps:(?!\/\/)/, 'never a bare https: frame source');
  assert.doesNotMatch(csp, /maps\.example\.org|youtube\.com(?!-nocookie)/);
  assert.equal(csp.replace(" https://www.youtube-nocookie.com https://player.vimeo.com", ''), SITE_CSP, 'otherwise the site\'s CSP exactly');
  assert.match(tp.headers.get('permissions-policy'), /camera=\(self\), microphone=\(self\)/);
  assert.doesNotMatch(tp.headers.get('permissions-policy'), /\*/);
  const sp = await as(w.a1)(`/class/${w.A.id}/dashboard`);
  assert.equal(sp.headers.get('content-security-policy'), SITE_CSP);
  assert.match(sp.headers.get('permissions-policy'), /camera=\(\), microphone=\(\)/);
  for (const p of ['/', '/teachers', `/class/${w.A.id}`]) {
    const r = await as(w.T)(p);
    assert.equal(r.headers.get('content-security-policy'), SITE_CSP, p);
    assert.match(r.headers.get('permissions-policy') || '', /camera=\(\)/, p);
  }
});

test('a site window is framed through a wrapper: the teacher only, only a site that allows it, a CSP naming that site alone', async () => {
  const w = world();
  await layout(w, [{ id: 'st1', type: 'site', s: { url: 'https://maps.example.org/world?z=2' } }, { id: 'st2', type: 'site', s: { url: 'https://nope.example.net/' } }, { id: 'v1', type: 'video' }]);
  DM._setSiteProbe(async url => ({ frame: url.includes('maps.') ? 'ok' : 'blocked', origins: [new URL(url).origin] }));
  try {
    const ok = await as(w.T)(`/api/dash/${w.A.id}/site/st1`);
    assert.equal(ok.status, 200); assert.deepEqual(ok.json, { frame: 'ok', host: 'maps.example.org', url: 'https://maps.example.org/world?z=2' });
    assert.equal((await as(w.T)(`/api/dash/${w.A.id}/site/st2`)).json.frame, 'blocked');
    assert.equal((await as(w.T)(`/api/dash/${w.A.id}/site/v1`)).status, 404, 'not a site window');
    const f = await as(w.T)(`/class/${w.A.id}/dashboard/frame/st1`);
    assert.equal(f.status, 200);
    assert.equal(f.headers.get('content-security-policy'), "default-src 'none'; frame-src https://maps.example.org; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'");
    assert.equal(f.headers.get('x-frame-options'), 'SAMEORIGIN');
    assert.equal(f.headers.get('referrer-policy'), 'no-referrer');
    assert.match(f.headers.get('permissions-policy'), /camera=\(\), microphone=\(\)/);
    assert.match(f.text, /<iframe src="https:\/\/maps\.example\.org\/world\?z=2" sandbox="allow-scripts allow-same-origin allow-forms allow-popups" referrerpolicy="no-referrer"/);
    assert.doesNotMatch(f.text, /<script|allow-top-navigation|allow-modals/);
    assert.equal((await as(w.T)(`/class/${w.A.id}/dashboard/frame/st2`)).status, 404, 'a site that refuses framing is never framed');
    // Nobody else: a student of the class, another teacher, a stranger.
    for (const who of [w.a1, w.T2, w.stranger]) {
      assert.equal((await as(who)(`/class/${w.A.id}/dashboard/frame/st1`)).status, 404);
      assert.equal((await as(who)(`/api/dash/${w.A.id}/site/st1`)).status, 404);
    }
    // The renderer's fallback: the words, and a new-tab link without opener or referrer.
    const src = fs.readFileSync('public/js/dash-class5.js', 'utf8');
    assert.match(src, /a\.target = '_blank'; a\.rel = 'noopener noreferrer'/);
    assert.equal(tFor('en')('dash.w.site.blocked'), "This site can't be shown inside the dashboard");
    assert.equal(tFor('en')('dash.w.site.open'), 'Open in a new tab');
  } finally { DM._setSiteProbe(null); }
});

test('students never receive video, site or camera widgets: not pinned, not pushed, not addable, not in their page', async () => {
  const w = world();
  await layout(w, [
    { id: 'v1', type: 'video', s: { video: { p: 'youtube', id: 'aqz-KE-bpKQ' } }, pin: true },
    { id: 'st1', type: 'site', s: { url: 'https://maps.example.org/' }, pin: true },
    { id: 'cm1', type: 'camera', pin: true },
    { id: 'ck1', type: 'clock', pin: true },
  ]);
  assert.deepEqual(D.pinsOf(w.A.id).map(x => x.type), ['clock']);
  // Even a pin flag forced into a stored layout is filtered when the pins are made.
  const l = D.layoutsOf(w.A.id, w.T.id)[0];
  q.run('UPDATE dash_layouts SET widgets=? WHERE id=?', JSON.stringify([...l.widgets.map(x => ({ ...x, pin: true }))]), l.id);
  D.useLayout(w.T, w.A, l.id);
  assert.deepEqual(D.pinsOf(w.A.id).map(x => x.type), ['clock']);
  for (const kind of ['v1', 'st1', 'cm1']) assert.equal((await as(w.T)(`/api/dash/${w.A.id}/pushes`, POST({ kind: 'tool', ref: kind }))).status, 400);
  assert.deepEqual(D.cleanWidgets([{ id: 'x1', type: 'video' }, { id: 'x2', type: 'site' }, { id: 'x3', type: 'camera' }, { id: 'x4', type: 'breathe' }], 'student').map(x => x.type), ['breathe']);
  const page = await as(w.a1)(`/class/${w.A.id}/dashboard`);
  const d = pageData(page.text);
  assert.deepEqual(d.pins.map(x => x.type), ['clock']);
  assert.doesNotMatch(JSON.stringify(d.pins) + JSON.stringify(d.live), /youtube|vimeo|maps\.example|"camera"/);
  for (const id of ['video', 'site', 'camera']) assert.equal(d.registry.types.find(x => x.id === id).add, false);
  assert.equal((await as(w.a1)(`/api/dash/${w.A.id}/pins`)).text.includes('aqz-KE-bpKQ'), false);
  const me = await as(w.a1)(`/api/dash/${w.A.id}/me`, POST({ widgets: [{ id: 'v9', type: 'video', s: { video: 'https://youtu.be/aqz-KE-bpKQ' } }, { id: 's9', type: 'site', s: { url: 'https://x.example.org' } }] }));
  assert.equal(me.status, 200); assert.deepEqual(me.json.state.widgets, []);
});

// ---------------------------------------------------------------- the document camera
test('the document camera: nothing recorded, stored or sent; the stream stops when the widget goes or the tab hides', () => {
  const src = fs.readFileSync('public/js/dash-camera.js', 'utf8');
  for (const bad of [/\bfetch\s*\(/, /XMLHttpRequest/, /sendBeacon/, /WebSocket/, /EventSource/, /MediaRecorder/, /toDataURL|toBlob|getImageData|captureStream/, /localStorage|sessionStorage|indexedDB/, /innerHTML/, /\bimport\b/, /ctx\.(act|get|set|keep|send)\b/])
    assert.doesNotMatch(src, bad, String(bad));
  assert.match(src, /getUserMedia\(\{ video: [^}]*\}, audio: false \}|audio: false/);
  assert.match(src, /for \(const t of stream\.getTracks\(\)\) t\.stop\(\)/);
  assert.match(src, /destroy\(\) \{ gone = true; document\.removeEventListener\('visibilitychange', onHide\); stop\(\); \}/);
  assert.match(src, /document\.hidden && stream\) stop\(\)/);
  assert.match(src, /NotAllowedError/); assert.match(src, /NotFoundError/);
  // Only this module (and the noise meter's) touches a camera or microphone.
  for (const f of ['public/js/dash.js', 'public/js/dash-widgets.js', 'public/js/dash-class5.js', 'public/js/dash-video.js', 'public/js/dash-tools.js', 'public/js/dash-tools4.js'])
    assert.doesNotMatch(fs.readFileSync(f, 'utf8'), /getUserMedia|MediaRecorder/, f);
  assert.equal(CAM.camTransform({ mirror: true, turn: 1, zoom: 2 }), 'rotate(90deg) scale(-2, 2)');
  assert.equal(CAM.camTransform({ turn: 5 }), 'rotate(90deg) scale(1, 1)');
});

// ---------------------------------------------------------------- hall pass
test('hall pass: fixed places, the teacher approves, one out at a time, a student sees only their own pass', async () => {
  const w = world();
  // No pinned pass, no asking.
  assert.equal((await as(w.a1)(`/api/dash/${w.A.id}/pass`, POST({ action: 'ask', place: 'bathroom' }))).status, 400);
  await layout(w, [{ id: 'hp', type: 'hallpass', s: { places: ['bathroom', 'water', 'teleporter'], oneOut: true, mins: 4 }, pin: true }]);
  assert.deepEqual(D.pinsOf(w.A.id)[0].s.places, ['bathroom', 'water'], 'only places from the fixed list');
  const ask = (who, place) => as(who)(`/api/dash/${w.A.id}/pass`, POST({ action: 'ask', place }));
  assert.equal((await ask(w.a1, 'nurse')).status, 400, 'a place the teacher does not offer');
  assert.equal((await ask(w.a1, 'my friend\'s house')).status, 400, 'no free text');
  let r = await ask(w.a1, 'bathroom'); assert.equal(r.status, 200); assert.deepEqual({ ...r.json.mine, at: 0 }, { place: 'bathroom', state: 'asked', at: 0 });
  await ask(w.a2, 'water');
  // The teacher sees both, by Oomba name, never roster names.
  let live = (await as(w.T)(`/api/dash/${w.A.id}/live`)).json;
  assert.deepEqual(live.pass.list.map(x => [x.name, x.place, x.state]), [[w.a1.display_name, 'bathroom', 'asked'], [w.a2.display_name, 'water', 'asked']]);
  assert.doesNotMatch(JSON.stringify(live.pass), w.REAL);
  // A student sees only their own pass: no list, no other name, nothing about anyone else.
  const l2 = (await as(w.a2)(`/api/dash/${w.A.id}/live`)).json;
  assert.deepEqual(Object.keys(l2.pass), ['mine']); assert.equal(l2.pass.mine.place, 'water');
  assert.ok(!JSON.stringify(l2).includes(w.a1.display_name) && !JSON.stringify(l2).includes(w.a1.id));
  const l3 = (await as(w.a3)(`/api/dash/${w.A.id}/live`)).json; assert.equal(l3.pass.mine, null);
  // Approve one; one out at a time refuses the second.
  const id1 = live.pass.list[0].id, id2 = live.pass.list[1].id;
  assert.equal((await as(w.T)(`/api/dash/${w.A.id}/pass/teacher`, POST({ action: 'approve', pass: id1 }))).status, 200);
  r = await as(w.T)(`/api/dash/${w.A.id}/pass/teacher`, POST({ action: 'approve', pass: id2 }));
  assert.equal(r.status, 400); assert.match(r.json.error, /one at a time/i);
  assert.equal((await as(w.a1)(`/api/dash/${w.A.id}/live`)).json.pass.mine.state, 'out');
  // Students can't act for the teacher, and can't approve themselves; another class's teacher can't either.
  for (const who of [w.a1, w.a2, w.T2, w.stranger]) assert.equal((await as(who)(`/api/dash/${w.A.id}/pass/teacher`, POST({ action: 'approve', pass: id2 }))).status, 404);
  assert.equal((await ask(w.a1, 'water')).status, 400, 'already out');
  // Back: the pass ends (its row goes); now the second can go.
  r = await as(w.a1)(`/api/dash/${w.A.id}/pass`, POST({ action: 'back' })); assert.equal(r.json.mine, null);
  assert.equal(q.get('SELECT COUNT(*) n FROM dash_passes WHERE user_id=?', w.a1.id).n, 0);
  assert.equal((await as(w.T)(`/api/dash/${w.A.id}/pass/teacher`, POST({ action: 'approve', pass: id2 }))).status, 200);
  // Declined: the student sees "not right now" and dismisses it.
  await ask(w.a3, 'bathroom');
  const id3 = D.passList(w.A).find(x => x.state === 'asked').id;
  await as(w.T)(`/api/dash/${w.A.id}/pass/teacher`, POST({ action: 'decline', pass: id3 }));
  assert.equal((await as(w.a3)(`/api/dash/${w.A.id}/live`)).json.pass.mine.state, 'declined');
  assert.ok(!D.passList(w.A).some(x => x.id === id3), 'a declined pass is not on the teacher\'s list');
  await as(w.a3)(`/api/dash/${w.A.id}/pass`, POST({ action: 'ok' }));
  assert.equal((await as(w.a3)(`/api/dash/${w.A.id}/live`)).json.pass.mine, null);
  // With "one out at a time" off, two may be out.
  await layout(w, [{ id: 'hp', type: 'hallpass', s: { places: ['bathroom'], oneOut: false }, pin: true }]);
  await ask(w.a3, 'bathroom');
  assert.equal((await as(w.T)(`/api/dash/${w.A.id}/pass/teacher`, POST({ action: 'approve', pass: D.passList(w.A).find(x => x.state === 'asked').id }))).status, 200);
  assert.equal(D.passList(w.A).filter(x => x.state === 'out').length, 2);
});

test('hall pass: cleared daily; minimal data; account deletion forgets it', async () => {
  const w = world();
  await layout(w, [{ id: 'hp', type: 'hallpass', pin: true }]);
  D.passStudent(w.a1, w.A, { action: 'ask', place: 'water' });
  D.passStudent(w.a2, w.A, { action: 'ask', place: 'library' });
  assert.equal(D.passList(w.A).length, 2);
  // Yesterday's passes are gone the next time anyone reads the class's passes.
  q.run("UPDATE dash_passes SET day='2000-01-01' WHERE user_id=?", w.a1.id);
  assert.deepEqual(D.passList(w.A).map(x => x.name), [w.a2.display_name]);
  assert.equal(q.get('SELECT COUNT(*) n FROM dash_passes WHERE user_id=?', w.a1.id).n, 0);
  // Any class's passes older than 36 hours go too.
  const other = world(); await layout(other, [{ id: 'hp', type: 'hallpass', pin: true }]);
  D.passStudent(other.a1, other.A, { action: 'ask', place: 'water' });
  q.run('UPDATE dash_passes SET asked_at=? WHERE user_id=?', Date.now() - 40 * 3600e3, other.a1.id);
  D.passList(w.A);
  assert.equal(q.get('SELECT COUNT(*) n FROM dash_passes WHERE user_id=?', other.a1.id).n, 0);
  // The teacher clears the day.
  D.passTeacher(w.T, w.A, { action: 'clear' });
  assert.equal(q.get('SELECT COUNT(*) n FROM dash_passes WHERE class_id=?', w.A.id).n, 0);
  D.passStudent(w.a1, w.A, { action: 'ask', place: 'water' });
  D.forgetUser(w.a1.id);
  assert.equal(q.get('SELECT COUNT(*) n FROM dash_passes WHERE user_id=?', w.a1.id).n, 0);
});

// ---------------------------------------------------------------- class jobs
test('class jobs: the chart turns a week at a time, everyone gets every job, names in the class only', async () => {
  const P = n => Array.from({ length: n }, (_, i) => ({ id: `k${i}`, name: `Kid${i}` }));
  assert.deepEqual(D.jobAssign(3, P(3), 0).map(x => x.id), ['k0', 'k1', 'k2']);
  assert.deepEqual(D.jobAssign(3, P(3), 1).map(x => x.id), ['k1', 'k2', 'k0']);
  assert.deepEqual(D.jobAssign(3, P(3), 4).map(x => x.id), ['k1', 'k2', 'k0'], 'wraps round');
  assert.deepEqual(D.jobAssign(5, P(2), 0).map(x => x && x.id), ['k0', 'k1', null, null, null], 'more jobs than people: the rest are open');
  assert.deepEqual(D.jobAssign(2, P(5), 3).map(x => x.id), ['k3', 'k4'], 'more people than jobs: the rest wait their turn');
  assert.deepEqual(D.jobAssign(0, P(3), 0), []);
  assert.deepEqual(D.jobAssign(3, [], 2), [null, null, null]);
  // Over n weeks every student does every job once (n people, n jobs).
  const n = 7, seen = new Map();
  for (let week = 0; week < n; week++) D.jobAssign(n, P(n), week).forEach((k, job) => { const s = seen.get(k.id) || new Set(); s.add(job); seen.set(k.id, s); });
  for (const s of seen.values()) assert.equal(s.size, n);
  // No one ever has two jobs at once.
  for (let week = 0; week < 12; week++) { const ids = D.jobAssign(5, P(5), week).map(x => x.id); assert.equal(new Set(ids).size, 5); }
  // The browser's rule is the server's.
  for (let sft = 0; sft < 9; sft++) assert.deepEqual(C5.jobAssign(4, P(6), sft), D.jobAssign(4, P(6), sft));
  // People: the saved order (only students still in the class), then anyone new by name.
  const kids = [{ id: 'a', name: 'Zed' }, { id: 'b', name: 'Amy' }, { id: 'c', name: 'Bo' }];
  assert.deepEqual(D.crewPeople(kids, { order: ['c', 'gone', 'a'], shift: 0 }).map(x => x.id), ['c', 'a', 'b']);
  assert.deepEqual(D.crewPeople(kids, null).map(x => x.name), ['Amy', 'Bo', 'Zed']);
  // Through the screens.
  const w = world();
  await layout(w, [{ id: 'jb', type: 'jobs', s: { jobs: 'Line leader\nDoor holder', crew: { order: [w.a3.id, w.a1.id, 'nope'], shift: 1 } }, pin: true }]);
  const pin = D.pinsOf(w.A.id)[0];
  assert.deepEqual(pin.s.crew, { order: [w.a3.id, w.a1.id, 'nope'], shift: 1 });
  const tl = (await as(w.T)(`/api/dash/${w.A.id}/live`)).json, sl = (await as(w.a2)(`/api/dash/${w.A.id}/live`)).json;
  assert.deepEqual(tl.crew.jb.map(x => x.id), [w.a3.id, w.a1.id, w.a2.id]);
  assert.deepEqual(sl.crew.jb, tl.crew.jb.map(x => ({ name: x.name })), 'students get names only (no ids)');
  assert.doesNotMatch(JSON.stringify(sl), w.REAL);
  assert.ok(!JSON.stringify(sl).includes(w.b1.display_name), 'another class\'s students never appear');
  // A crew from the browser is rebuilt: ids only, the shift a whole number in range.
  assert.deepEqual(D.cleanCrew({ order: ['ok', '<script>', 5, 'ok'], shift: 1e9, x: 1 }), { order: ['ok', '5'], shift: 9999 });
  assert.deepEqual(D.cleanCrew('junk'), { order: [], shift: 0 });
  // Names the teacher types (a class with no student accounts yet): one a line, blanks dropped, kept short.
  assert.deepEqual(C5.typedCrew({ names: ' Ana \n\nBen\n' + 'x'.repeat(80) }), ['Ana', 'Ben', 'x'.repeat(40)]);
  assert.deepEqual(C5.typedCrew({}), []);
  assert.equal(C5.typedCrew({ names: Array.from({ length: 90 }, (_, i) => `K${i}`).join('\n') }).length, 60);
  assert.equal(D.cleanSettings(D.widgetType('jobs'), { names: 'Ana\nBen' }).names, 'Ana\nBen', 'the typed names are kept');
});

// ---------------------------------------------------------------- points for each student
test('points: positive reasons only, never below zero; a student sees only their own total', async () => {
  const w = world();
  await layout(w, [{ id: 'sc', type: 'score', s: { mode: 'students' }, pin: true }]);
  const pts = b => as(w.T)(`/api/dash/${w.A.id}/points`, POST(b));
  assert.equal((await pts({ action: 'award', user: w.a1.id, reason: 'kind' })).status, 200);
  await pts({ action: 'award', user: w.a1.id, reason: 'effort' });
  await pts({ action: 'award', user: 'all', reason: 'teamwork' });
  let r = (await as(w.T)(`/api/dash/${w.A.id}/live`)).json.points;
  assert.equal(r.total, 5);
  assert.deepEqual(r.list.find(x => x.id === w.a1.id), { id: w.a1.id, name: w.a1.display_name, n: 3, r: { kind: 1, effort: 1, teamwork: 1 } });
  // No minus: no negative reason, no negative amount, nothing below zero.
  for (const b of [{ action: 'award', user: w.a2.id, reason: 'rude' }, { action: 'minus', user: w.a2.id, reason: 'kind' }, { action: 'award', user: w.b1.id, reason: 'kind' }, { action: 'award', user: w.a2.id }])
    assert.notEqual((await pts(b)).status, 200, JSON.stringify(b));
  assert.equal(D.pointsAll(w.A).list.find(x => x.id === w.a2.id).n, 1);
  // An amount sent from a browser is ignored: an award is always exactly one point.
  await pts({ action: 'award', user: w.a2.id, reason: 'kind', n: -5 });
  assert.equal(D.pointsAll(w.A).list.find(x => x.id === w.a2.id).n, 2);
  await pts({ action: 'undo', user: w.a2.id, reason: 'kind' });
  for (let i = 0; i < 4; i++) await pts({ action: 'undo', user: w.a2.id, reason: 'teamwork' });
  assert.equal(D.pointsAll(w.A).list.find(x => x.id === w.a2.id).n, 0, 'undo never goes below zero');
  assert.ok(q.all('SELECT n FROM dash_points').every(x => x.n > 0), 'no zero or negative rows are kept');
  assert.ok(!D.POINT_REASONS.some(x => /bad|rude|late|minus|lose/i.test(x)));
  // A student: their own points and the class total only. No list, no other names, no ranking.
  const s1 = (await as(w.a1)(`/api/dash/${w.A.id}/live`)).json;
  assert.deepEqual(s1.points, { mine: 3, r: { kind: 1, effort: 1, teamwork: 1 }, total: 4 });
  for (const other of [w.a2, w.a3]) { assert.ok(!JSON.stringify(s1).includes(other.display_name)); assert.ok(!JSON.stringify(s1).includes(other.id)); }
  assert.equal((await as(w.a2)(`/api/dash/${w.A.id}/live`)).json.points.mine, 0);
  // Students can't give points.
  assert.equal((await as(w.a1)(`/api/dash/${w.A.id}/points`, POST({ action: 'award', user: w.a1.id, reason: 'kind' }))).status, 404);
  // Reset, and the teams scoreboard is untouched.
  await pts({ action: 'reset' });
  assert.equal(D.pointsAll(w.A).total, 0);
  assert.deepEqual(D.cleanSettings(D.widgetType('score'), { teams: 'A\nB', scores: [3, -2] }), { mode: 'teams', teams: 'A\nB', scores: [3, -2] });
  D.pointsAction(w.T, w.A, { action: 'award', user: w.a1.id, reason: 'kind' });
  D.forgetUser(w.a1.id);
  assert.equal(q.get('SELECT COUNT(*) n FROM dash_points WHERE user_id=?', w.a1.id).n, 0);
});

// ---------------------------------------------------------------- polls and moods
test('poll and mood privacy: students see only their own answer and face; the teacher sees counts, names on request', async () => {
  const w = world();
  await layout(w, [{ id: 'md', type: 'mood', pin: true }, { id: 'ck', type: 'check' }]);
  // Quick check (poll / exit ticket): fixed choices, a student never sees the totals or anyone's answer.
  const ck = (await as(w.T)(`/api/dash/${w.A.id}/checks`, POST({ kind: 'choice', question: 'Exit ticket: 3 x 4?', options: ['12', '7'] }))).json.check;
  await as(w.a1)(`/api/dash/${w.A.id}/checks/${ck}/answer`, POST({ value: 0 }));
  await as(w.a2)(`/api/dash/${w.A.id}/checks/${ck}/answer`, POST({ value: 1 }));
  assert.equal((await as(w.a1)(`/api/dash/${w.A.id}/checks/${ck}/answer`, POST({ value: 'twelve' }))).status, 400, 'no free text');
  const sc = (await as(w.a2)(`/api/dash/${w.A.id}/live`)).json.checks[0];
  assert.deepEqual(Object.keys(sc).sort(), ['at', 'id', 'kind', 'mine', 'options', 'q']); assert.equal(sc.mine, 1);
  // Mood: a face's index only.
  const mood = (who, m) => as(who)(`/api/dash/${w.A.id}/mood`, POST({ mood: m }));
  assert.equal((await mood(w.a1, 0)).status, 200);
  await mood(w.a2, 4); await mood(w.a3, 4);
  for (const bad of [5, -1, 1.5, 'sad', 'I feel sad because...']) assert.equal((await mood(w.a1, bad)).status, 400, String(bad));
  const tl = (await as(w.T)(`/api/dash/${w.A.id}/live`)).json.mood;
  assert.deepEqual(tl, { counts: [1, 0, 0, 0, 2], n: 3, size: 3 });
  const s2 = (await as(w.a2)(`/api/dash/${w.A.id}/live`)).json;
  assert.deepEqual(s2.mood, { mine: 4 });
  assert.ok(!JSON.stringify(s2).includes(w.a1.display_name) && !JSON.stringify(s2).includes(w.a3.display_name));
  // Names: the class's teacher only (and in a sheet the projector never shows).
  const names = await as(w.T)(`/api/dash/${w.A.id}/mood/names`);
  assert.deepEqual(names.json.groups[4].sort(), [w.a2.display_name, w.a3.display_name].sort());
  assert.doesNotMatch(names.text, w.REAL);
  for (const who of [w.a1, w.T2, w.stranger]) assert.equal((await as(who)(`/api/dash/${w.A.id}/mood/names`)).status, 404);
  assert.match(fs.readFileSync('public/js/dash-class5.js', 'utf8'), /ibtn\('👀', W\.names, 'btn btn-sm dw-private'\)/);
  // On the projector even the per-face counts hide (in a small class "Sad 1" could point to one child): only how many
  // have checked in, and a note that the counts are on the teacher's own screen.
  const c5 = fs.readFileSync('public/js/dash-class5.js', 'utf8');
  assert.match(c5, /el\('ul', 'dw-bars dw5-moodbars dw-private'\)/);
  assert.match(c5, /el\('p', 'dw-public dw5-moodhidden', W\.countsHidden\)/);
  assert.match(fs.readFileSync('public/css/dash.css', 'utf8'), /\.dash-projector \.dw-private\{display:none!important\}/);
  // Today only; another class's student can't answer; account deletion forgets it.
  q.run("UPDATE dash_moods SET day='2000-01-01' WHERE user_id=?", w.a3.id);
  assert.deepEqual(D.moodCounts(w.A).counts, [1, 0, 0, 0, 1]);
  assert.equal((await as(w.b1)(`/api/dash/${w.A.id}/mood`, POST({ mood: 1 }))).status, 404);
  D.forgetUser(w.a2.id);
  assert.equal(q.get('SELECT COUNT(*) n FROM dash_moods WHERE user_id=?', w.a2.id).n, 0);
  // Without a pinned mood check-in, students can't send one.
  const v = world(); await layout(v, [{ id: 'md', type: 'mood' }]);
  assert.equal((await as(v.a1)(`/api/dash/${v.A.id}/mood`, POST({ mood: 1 }))).status, 400);
});

// ---------------------------------------------------------------- state cleaning
test('state cleaning: every new setting is rebuilt on the server', () => {
  assert.equal(D.cleanSecs('1:30'), 90); assert.equal(D.cleanSecs('1:02:03'), 3723); assert.equal(D.cleanSecs('95'), 95);
  for (const bad of ['-5', '1:75', 'abc', '1e9', null, {}, '99:99:99']) assert.equal(D.cleanSecs(bad), 0, String(bad));
  assert.equal(D.cleanSecs('999999'), 0); assert.equal(D.cleanSecs('86400'), 86400); assert.equal(D.cleanSecs('90000'), 86400);
  assert.deepEqual(D.cleanPlaces(['library', 'bathroom', 'library', 'roof']), ['bathroom', 'library']);
  assert.deepEqual(D.cleanPlaces([]), D.PASS_PLACES, 'at least one place');
  assert.deepEqual(D.cleanTicks([true, 1, 'yes', false, null, ...Array(30).fill(true)]).slice(0, 5), [true, true, false, false, false]);
  assert.equal(D.cleanTicks(Array(50).fill(true)).length, D.MAX_ITEMS);
  const hp = D.cleanSettings(D.widgetType('hallpass'), { places: 'bathroom', oneOut: 'no', mins: 999 });
  assert.deepEqual(hp, { places: D.PASS_PLACES, oneOut: false, mins: 30 });
  const note = D.cleanSettings(D.widgetType('note'), { body: `x‮y\u0000${'z'.repeat(500)}`, color: 'red' });
  assert.equal(note.color, 'yellow'); assert.ok(!/[‮\u0000]/.test(note.body)); assert.equal([...note.body].length, 300);
  const cl = D.cleanSettings(D.widgetType('checklist'), { title: 'T', items: 'a\nb', ticks: [1, 0, 'x'], evil: 1 });
  assert.deepEqual(cl, { title: 'T', items: 'a\nb', ticks: [true, false, false] });
  assert.deepEqual(D.cleanSettings(D.widgetType('breathe'), { pace: 'hyper' }), { pace: 'calm' });
  assert.equal(D.cleanSettings(D.widgetType('schedule'), { view: 'nownext' }).view, 'nownext');
  assert.equal(D.cleanSettings(D.widgetType('schedule'), { view: 'gantt' }).view, 'list');
  assert.equal(D.cleanSettings(D.widgetType('score'), { mode: 'ranking' }).mode, 'teams');
  assert.deepEqual(D.cleanSettings(D.widgetType('camera'), { device: 'abc', record: true }), {});
  // A whole layout: unknown keys dropped, sizes clamped.
  const out = D.cleanWidgets([{ id: 'v1', type: 'video', x: 99, y: -3, w: 1, h: 99, s: { video: 'https://youtu.be/aqz-KE-bpKQ', html: '<b>' } }], 'teacher')[0];
  assert.deepEqual(out, { id: 'v1', type: 'video', x: 8, y: 0, w: 4, h: 8, s: { video: { p: 'youtube', id: 'aqz-KE-bpKQ' }, start: 0, end: 0, mute: false, loop: false } });
});

test('class jobs cards: old dashboards read the same, picking swaps, rotation still turns, the waiting line, add and remove', () => {
  const P = n => Array.from({ length: n }, (_, i) => `K${i}`);
  const W2 = { defaults: 'A\nB\nC' };
  // Old dashboards (no `from`): typed names if any, else the class; a choice made on the cards wins.
  assert.equal(C5.crewFrom({ names: 'Ana\nBen' }), 'names');
  assert.equal(C5.crewFrom({ names: '' }), 'class');
  assert.equal(C5.crewFrom({ names: 'Ana', from: 'class' }), 'class');
  assert.equal(C5.crewFrom({ from: 'names' }), 'names');
  assert.equal(C5.crewFrom({ names: 'Ana', from: 'auto' }), 'names');
  assert.equal(D.cleanSettings(D.widgetType('jobs'), { from: 'nope' }).from, 'auto', 'an unknown source is the old rule');
  assert.equal(D.cleanSettings(D.widgetType('jobs'), { from: 'class' }).from, 'class');
  assert.deepEqual(D.cleanSettings(D.widgetType('jobs'), { jobs: 'A\nB', names: 'Ana', crew: { order: ['x'], shift: 3 } }),
    { jobs: 'A\nB', names: 'Ana', from: 'auto', crew: { order: ['x'], shift: 3 } }, 'an old dashboard keeps what it had');
  // The cards start from the people turned to shift 0: the same jobs as the widget shows, for every shift.
  for (const [J, n] of [[5, 2], [5, 7], [4, 4], [8, 3]]) for (let sft = 0; sft < 9; sft++) {
    assert.deepEqual(C5.jobAssign(J, C5.unturn(P(n), sft), 0), C5.jobAssign(J, P(n), sft));
    const shown = new Set(C5.jobAssign(J, P(n), sft).filter(Boolean)), waiting = C5.jobWaiting(J, P(n), sft);
    assert.equal(waiting.length, Math.max(0, n - J));
    assert.ok(waiting.every(k => !shown.has(k)), 'someone waiting has no job');
    // The first one waiting comes in with Next week (they have the last job then).
    if (waiting.length) assert.equal(C5.jobAssign(J, P(n), sft + 1)[J - 1], waiting[0]);
  }
  assert.deepEqual(C5.orderBy([{ id: 'a' }, { id: 'b' }, { id: 'c' }], ['c', 'gone', 'a']).map(x => x.id), ['c', 'a', 'b'], 'the class in the saved order at once');
  assert.deepEqual(C5.orderBy([{ name: 'x' }, { name: 'y' }], ['a']).map(x => x.name), ['x', 'y'], 'names only: left as they came');
  // Picking: job 1 to someone on job 3 swaps them; to someone waiting, the one who had it waits.
  const st = { jobs: ['L', 'P', 'B'], people: ['Sam', 'Ava', 'Leo', 'Mia', 'Eli'] };
  let r = C5.pickFor(st, 0, 2);
  assert.deepEqual(C5.jobAssign(3, r.people), ['Leo', 'Ava', 'Sam']); assert.equal(r.at, 0);
  r = C5.pickFor(st, 1, 4);
  assert.deepEqual(C5.jobAssign(3, r.people), ['Sam', 'Eli', 'Leo']); assert.deepEqual(C5.jobWaiting(3, r.people), ['Mia', 'Ava']);
  assert.deepEqual(st.people, ['Sam', 'Ava', 'Leo', 'Mia', 'Eli'], 'nothing changed in place');
  // An open job (more jobs than people): the job moves up to that person's place; every other pair stays.
  const few = { jobs: ['L', 'P', 'B', 'T', 'M'], people: ['Greg', 'James'] };
  r = C5.pickFor(few, 3, 0);
  assert.deepEqual(r.jobs, ['T', 'P', 'B', 'L', 'M']); assert.equal(r.at, 0);
  assert.deepEqual(C5.jobAssign(5, r.people).map((k, i) => k && `${r.jobs[i]}:${k}`).filter(Boolean), ['T:Greg', 'P:James']);
  // A typed name added on a job: it gets the job at once.
  r = C5.addName(few, 'Ava', 2);
  assert.deepEqual(C5.jobAssign(5, r.people), ['Greg', 'James', 'Ava', null, null]);
  r = C5.addName(few, 'Ava', 4);
  assert.deepEqual(r.jobs.map((j, i) => `${j}:${C5.jobAssign(5, r.people)[i] || '-'}`), ['L:Greg', 'P:James', 'M:Ava', 'T:-', 'B:-']);
  // Rotation still turns everyone down one job from what the cards saved (shift 0).
  r = C5.pickFor(st, 0, 3);
  assert.deepEqual(C5.jobAssign(3, r.people, 1), C5.jobAssign(3, C5.unturn(r.people, 1)));
  assert.deepEqual(C5.jobAssign(3, r.people, 1), ['Ava', 'Leo', 'Sam']);
  // Removing a job: everyone else keeps theirs; its person takes the first open job, or waits first in line.
  r = C5.dropJob(st, 0);
  assert.deepEqual(r.jobs, ['P', 'B']); assert.deepEqual(C5.jobAssign(2, r.people), ['Ava', 'Leo']); assert.deepEqual(C5.jobWaiting(2, r.people), ['Sam', 'Mia', 'Eli']);
  r = C5.dropJob(few, 0);
  assert.deepEqual(r.jobs.map((j, i) => `${j}:${C5.jobAssign(4, r.people)[i] || '-'}`), ['P:James', 'B:Greg', 'T:-', 'M:-']);
  // Removing a typed name: the next one waiting takes the job; nobody waiting, the job moves after the others'.
  r = C5.dropName(st, 1);
  assert.deepEqual(C5.jobAssign(3, r.people), ['Sam', 'Mia', 'Leo']); assert.deepEqual(C5.jobWaiting(3, r.people), ['Eli']);
  r = C5.dropName(few, 0);
  assert.deepEqual(r.jobs.map((j, i) => `${j}:${C5.jobAssign(5, r.people)[i] || '-'}`), ['P:James', 'L:-', 'B:-', 'T:-', 'M:-']);
  assert.deepEqual(C5.dropName(st, 4).people, ['Sam', 'Ava', 'Leo', 'Mia'], 'someone waiting just goes');
  // Adding a job: the next one waiting gets it; nothing else moves. What is saved drops empty jobs the same way.
  assert.deepEqual(C5.jobAssign(4, st.people), ['Sam', 'Ava', 'Leo', 'Mia']);
  assert.deepEqual(C5.jobsSaved({ jobs: ['L', ' ', 'B', ''], people: ['Sam', 'Ava', 'Leo'] }), { jobs: ['L', 'B'], people: ['Sam', 'Leo', 'Ava'] });
  // The usual jobs are the cards when the teacher typed none; 16 jobs at most.
  assert.deepEqual(C5.jobList({ jobs: '' }, W2).list, ['A', 'B', 'C']);
  assert.equal(C5.MAX_JOBS, 16);
  assert.equal(C5.jobList({ jobs: Array.from({ length: 20 }, (_, i) => `J${i}`).join('\n') }, W2).list.length, 16);
  // Sixteen long jobs still fit what the server keeps.
  const long = Array.from({ length: 16 }, () => 'x'.repeat(40)).join('\n');
  assert.equal(D.cleanSettings(D.widgetType('jobs'), { jobs: long }).jobs, long);
});

test('the browser helpers: breathing patterns, times, now and next', () => {
  assert.deepEqual(C5.breathAt('calm', 0), { phase: 'in', left: 4, i: 0, len: 4 });
  assert.deepEqual(C5.breathAt('calm', 4.5), { phase: 'out', left: 4, i: 1, len: 4 });
  assert.equal(C5.breathAt('box', 9).phase, 'out'); assert.equal(C5.breathAt('box', 13).phase, 'hold'); assert.equal(C5.breathAt('box', 16).phase, 'in');
  assert.equal(C5.breathAt('long', 9.9).phase, 'out'); assert.equal(C5.breathAt('long', 10).phase, 'in');
  assert.equal(C5.breathAt('nope', 1).phase, 'in');
  assert.equal(C5.clockOf(65e3), '1:05'); assert.equal(C5.clockOf(3723e3), '1:02:03'); assert.equal(C5.secsText(90), '1:30');
  const W2 = { defaults: 'A\nB' };
  assert.deepEqual(C5.jobList({ jobs: '' }, W2), { list: ['A', 'B'], typed: false });
  assert.deepEqual(C5.jobList({ jobs: ' Lights \n\nDoor ' }, W2), { list: ['Lights', 'Door'], typed: true });
});

test('safety: no AI, no network in the new modules, no prices or "Pro", names in the class only, no free text from students', async () => {
  for (const f of ['public/js/dash-class5.js', 'public/js/dash-camera.js', 'public/js/dash-video.js', 'server/services/dash-media.js'])
    assert.doesNotMatch(fs.readFileSync(f, 'utf8'), /anthropic|screenPhoto|ai-budget|lesson-ai|\bclaude\b|openai/i, f);
  const c5 = fs.readFileSync('public/js/dash-class5.js', 'utf8'), vid = fs.readFileSync('public/js/dash-video.js', 'utf8');
  for (const src of [c5, vid]) for (const bad of [/\bfetch\s*\(/, /XMLHttpRequest/, /sendBeacon/, /WebSocket/, /localStorage|sessionStorage|indexedDB/, /roster_name|rosterName/, /\.innerHTML\s*=/])
    assert.doesNotMatch(src, bad, String(bad));
  assert.doesNotMatch(vid, /document\.|window\./, 'pure');
  // Students never type in stage 5: their widgets have no inputs of their own.
  for (const fn of ['function hallpass(', 'function mood(', 'export function points(']) {
    const body = c5.slice(c5.indexOf(fn), c5.indexOf('\n// ----', c5.indexOf(fn)));
    assert.doesNotMatch(body, /el\('input'|el\('textarea'|contenteditable/i, fn);
  }
  const money = /\$\s?\d|€\s?\d|£\s?\d|\/plans|upgrade|free trial|Teacher plan|School plan|pricing|\bPro\b|Explorer|price|buy now/i;
  for (const code of ['en', 'en-GB', 'de', 'es', 'fr', 'it', 'nl', 'pt', 'ru', 'ja', 'zh-Hant', 'he', 'ar']) {
    const l = JSON.parse(fs.readFileSync(`server/i18n/locales/${code}.json`, 'utf8')).dash || {};
    for (const id of [...STAGE5, 'score', 'schedule']) if (l.w && l.w[id]) assert.doesNotMatch(JSON.stringify(l.w[id]), money, `${code} ${id}`);
    assert.doesNotMatch(JSON.stringify(l.errors || {}), money, code);
  }
  // A student's screen with every stage 5 widget pinned: no real names, no prices, no outside addresses.
  const w = world();
  await layout(w, [{ id: 'hp', type: 'hallpass', pin: true }, { id: 'jb', type: 'jobs', pin: true }, { id: 'md', type: 'mood', pin: true }, { id: 'sc', type: 'score', s: { mode: 'students' }, pin: true },
    { id: 'cl', type: 'checklist', s: { items: 'Tidy up' }, pin: true }, { id: 'br', type: 'breathe', pin: true }, { id: 'v1', type: 'video', s: { video: { p: 'vimeo', id: '76979871' } } }]);
  D.pointsAction(w.T, w.A, { action: 'award', user: w.a2.id, reason: 'kind' });
  const page = (await as(w.a1)(`/class/${w.A.id}/dashboard`)).text;
  assert.doesNotMatch(page, w.REAL); assert.doesNotMatch(page, money); assert.doesNotMatch(page, /vimeo\.com|76979871/);
  assert.equal(pageData(page).live.points.mine, 0);
});

test('every stage 5 string is translated into every locale', async () => {
  const { checkAll } = await import('../../server/i18n/check.js');
  const r = checkAll();
  const keys = Object.keys(r.en).filter(k => new RegExp(`^dash\\.w\\.(${STAGE5.join('|')})\\.|^dash\\.w\\.score\\.(s\\.mode|o\\.mode|r_|award|classTotal|mine|undo|given|pick|reason|reset|hidden|nobody|everyone)|^dash\\.w\\.schedule\\.(s\\.view|o\\.view|nothingNext|starts)|^dash\\.errors\\.(noPass|passPlace|passOut|oneOut|reason|noMood|site)$`).test(k));
  assert.ok(keys.length > 150, String(keys.length));
  for (const l of r.locales) {
    if (l.code === 'en-GB') continue;
    assert.deepEqual(l.missing.filter(k => keys.includes(k)), [], l.code);
    assert.deepEqual([...l.placeholderErrors, ...l.parseErrors, ...l.extra], [], l.code);
  }
});
