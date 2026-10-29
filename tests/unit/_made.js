// Shared harness for the parent-made child account tests (family-made*.test.js, family-switch, family-delete): billing
// on against the fake Stripe, families public, PARENT_MADE_CHILDREN=1 (tests turn config.parentMadeChildren off where
// they check the gate), one app server per test file, and helpers for grown-ups, kids and made children.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const { startFakeStripe } = await import('../support/fake-stripe.js');
export const fake = await startFakeStripe({ webhookSecret: 'whsec_fake_made', apiKey: 'rk_test_fake' });
process.env.STRIPE_API_KEY = 'rk_test_fake';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_fake_made';
process.env.STRIPE_API_BASE = fake.url;
process.env.BILLING_PUBLIC = '1';
process.env.PARENT_MADE_CHILDREN = '1';
// Files (photos, uploads, screenshots) go to a folder of this run, never the repo's data folder.
export const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'brb-made-'));
process.env.BRB_DATA_DIR = DATA;
export const { config } = await import('../../server/config.js');
const { createApp } = await import('../../server/app.js');
export const db = await import('../../server/db.js');
export const auth = await import('../../server/auth.js');
export const F = await import('../../server/services/family.js');
export const RL = await import('../../server/services/ratelimit.js');
export const { LEGAL_UPDATED } = await import('../../server/routes/info.js');
export const { q, uid } = db;

export const PW = 'a-long-password-1';   // every test grown-up's password
export const KID_PW = 'rainbow-77';
let server;
export const ctx = { base: '' };
test.before(async () => { server = createApp().listen(0); server.keepAliveTimeout = 0; await new Promise(r => server.once('listening', r)); ctx.base = `http://127.0.0.1:${server.address().port}`; });
test.after(async () => { server.close(); await fake.close(); fs.rmSync(DATA, { recursive: true, force: true }); });
test.beforeEach(() => { config.stripeApiKey = 'rk_test_fake'; config.parentMadeChildren = true; config.billingPublic = true; RL._reset(); });

/** A new signed-in session for a user: its cookie ("brb_session=…"). */
export const cookieFor = id => { let c = ''; auth.startSession({ append: (k, v) => { c = v.split(';')[0]; } }, id); return c; };
/** The session id inside a cookie. */
export const sessionIdOf = cookie => decodeURIComponent(cookie.split('=')[1]).split('.').slice(0, -1).join('.');
export async function call(cookie, path, { method = 'GET', body, headers = {} } = {}) {
  const h = { ...headers, ...(cookie ? { cookie } : {}) }; if (body !== undefined) h['content-type'] = 'application/json';
  const r = await fetch(ctx.base + path, { method, headers: h, body: body !== undefined ? JSON.stringify(body) : undefined, redirect: 'manual' });
  const text = await r.text(); let json = null; try { json = JSON.parse(text); } catch { /* html */ }
  const setCookies = r.headers.getSetCookie();
  const set = setCookies.map(c => c.split(';')[0]).find(c => c.startsWith('brb_session=') && c !== 'brb_session=');
  return { status: r.status, text, json, location: r.headers.get('location'), cookie: set || null, setCookies };
}
/** Calls as u, each on a fresh session (so the step-up is never fresh: send `password`). */
export const as = u => (path, opts) => call(cookieFor(u.id), path, opts);
let n = 0;
export const next = () => ++n;
/** A fresh run of letters (names with digits can look like a family link code, which names refuse). */
export const fresh = () => (++n).toString(26).split('').map(c => String.fromCharCode(97 + parseInt(c, 26))).join('');
export const kid = (name = `Kiddo${fresh()}`) => auth.createUser({ username: name, password: KID_PW });
export function grownup(name = `Mum${fresh()}`) { const u = auth.createUser({ username: name, password: PW, accountType: 'grownup' }); F.ensureFamily(u); return auth.getUser(u.id); }
export const famOf = g => F.familyOfOwner(g.id);
/** A made child through the real API (step-up included). -> { child, token, res } */
export async function make(g, over = {}) {
  const username = over.username || `Beanie${fresh()}`;
  const body = { username, newPassword: KID_PW, newConfirm: KID_PW, ack: '1', guardian: '1', password: PW, ...over };
  const res = await as(g)('/api/family/children/new', { method: 'POST', body });
  assert.equal(res.status, 200, res.text);
  const child = auth.getUserByName(username);
  return { child, token: F.requestToken(famOf(g).id, child.id), res };
}
/** A code-linked child (the child's code, the grown-up types it, the child says yes). */
export async function linkByCode(g, child) {
  const c = await as(child)('/api/me/family/code', { method: 'POST', body: {} }); assert.equal(c.status, 200, c.text);
  assert.equal((await as(g)('/api/family/link', { method: 'POST', body: { code: c.json.code } })).status, 200);
  assert.equal((await as(child)('/api/me/family/answer', { method: 'POST', body: { answer: 'yes' } })).status, 200);
  return F.requestToken(famOf(g).id, child.id);
}
export const audits = (action, target) => q.all('SELECT * FROM audit_log WHERE action=? AND (? IS NULL OR target=?) ORDER BY created_at', action, target ?? null, target ?? null);
