// A small stand-in for Google's sign-in (OpenID Connect) for tests. It never talks to Google and imports nothing from
// server/. Unit tests start it in-process; Playwright runs it as `node tests/support/fake-google.js --port 5932`.
// The values here (client id and secret) are fake test values, not secrets.
import http from 'node:http';
import crypto from 'node:crypto';

const b64 = v => Buffer.from(typeof v === 'string' ? v : JSON.stringify(v)).toString('base64url');
const sha = v => crypto.createHash('sha256').update(v).digest();
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const defaultSub = email => BigInt('0x' + sha(String(email).toLowerCase()).toString('hex').slice(0, 20)).toString().padStart(21, '1').slice(0, 21);
const defaultHd = email => { const d = String(email).split('@')[1] || ''; return d === 'gmail.com' ? '' : d; };

export async function startFakeGoogle({ port = 0, clientId = 'test-client.apps.googleusercontent.com', clientSecret = 'fake-test-secret', host = '127.0.0.1', jwksMaxAge = 3600 } = {}) {
  const keys = []; let n = 0;
  const rotateKey = () => { const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 }); const kid = `fake-${++n}`; keys.push({ kid, publicKey, privateKey }); return kid; };
  rotateKey();
  const codes = new Map(); const stats = { jwks: 0, token: 0, authorize: 0 }; const issued = []; let pending = {};
  let url = '';

  function idToken(c, tamper) {
    const key = keys[keys.length - 1];
    const now = Math.floor(Date.now() / 1000);
    const claims = {
      iss: url, aud: clientId, azp: clientId, sub: c.sub, email: c.email, email_verified: c.verified, name: c.name,
      given_name: c.name.split(' ')[0], family_name: c.name.split(' ').slice(1).join(' '), picture: url + '/photo.png',
      iat: now, exp: now + 3600, nonce: c.nonce, ...(c.hd ? { hd: c.hd } : {}),
    };
    const header = { alg: 'RS256', kid: key.kid, typ: 'JWT' };
    if (tamper === 'wrongAud') claims.aud = 'someone-else.apps.googleusercontent.com';
    if (tamper === 'azpOther') claims.azp = 'someone-else.apps.googleusercontent.com';
    if (tamper === 'wrongIss') claims.iss = 'https://evil.example';
    if (tamper === 'expired') { claims.iat = now - 7200; claims.exp = now - 3600; }
    if (tamper === 'iatFuture') claims.iat = now + 3600;
    if (tamper === 'iatOld') { claims.iat = now - 3600; claims.exp = now + 600; }
    if (tamper === 'wrongNonce') claims.nonce = 'not-the-nonce';
    if (tamper === 'noEmail') delete claims.email;
    if (tamper === 'unverified') claims.email_verified = false;
    if (tamper === 'noKid') delete header.kid;
    if (tamper === 'unknownKid') header.kid = 'nobody';
    if (tamper === 'algNone') { header.alg = 'none'; return `${b64(header)}.${b64(claims)}.`; }
    if (tamper === 'algHS256') { header.alg = 'HS256'; const hp = `${b64(header)}.${b64(claims)}`; return `${hp}.${crypto.createHmac('sha256', clientSecret).update(hp).digest('base64url')}`; }
    const hp = `${b64(header)}.${b64(claims)}`;
    let sig = crypto.sign('RSA-SHA256', Buffer.from(hp), key.privateKey).toString('base64url');
    if (tamper === 'badSig') sig = (sig[0] === 'A' ? 'B' : 'A') + sig.slice(1);
    return `${hp}.${sig}`;
  }

  function issue(p, who) {
    const code = crypto.randomBytes(24).toString('base64url');
    const c = { ...who, nonce: p.get('nonce'), challenge: p.get('code_challenge'), redirect: p.get('redirect_uri'), at: Date.now(), used: false, tamper: pending.tamper };
    pending = {}; codes.set(code, c); issued.push(code); return code;
  }
  const back = (res, redirect, params) => { const u = new URL(redirect); for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v); res.writeHead(302, { location: u.href }); res.end(); };
  const bad = (res, code, msg, json) => { res.writeHead(code, { 'content-type': json ? 'application/json' : 'text/plain' }); res.end(json ? JSON.stringify(msg) : msg); };
  const readBody = req => new Promise(r => { let d = ''; req.on('data', c => { d += c; }); req.on('end', () => r(new URLSearchParams(d))); });
  function who(p, prefix = '') {
    const email = String(p.get(prefix + 'email') || 'ana@dwes.test').toLowerCase();
    const hd = p.has(prefix + 'hd') ? String(p.get(prefix + 'hd')).toLowerCase() : defaultHd(email);
    return { email, hd, sub: p.get(prefix + 'sub') || defaultSub(email), name: p.get(prefix + 'name') || 'Ana Silva', verified: !['0', 'false', ''].includes(String(p.get(prefix + 'verified') ?? '1')) };
  }
  function checkAuthorize(p) {
    if (p.get('client_id') !== clientId) return 'unknown client_id';
    if (!p.get('redirect_uri')) return 'missing redirect_uri';
    if (p.get('response_type') !== 'code') return 'response_type must be code';
    if (!String(p.get('scope') || '').split(' ').includes('openid')) return 'scope must include openid';
    if (p.get('code_challenge_method') !== 'S256') return 'code_challenge_method must be S256';
    for (const k of ['state', 'nonce', 'code_challenge']) if (!p.get(k)) return `missing ${k}`;
    return '';
  }

  const server = http.createServer(async (req, res) => {
    const u = new URL(req.url, url);
    if (u.pathname === '/.well-known/openid-configuration') {
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ issuer: url, authorization_endpoint: url + '/o/oauth2/v2/auth', token_endpoint: url + '/token', jwks_uri: url + '/oauth2/v3/certs' }));
    }
    if (u.pathname === '/oauth2/v3/certs') {
      stats.jwks++;
      res.writeHead(200, { 'content-type': 'application/json', 'cache-control': `public, max-age=${jwksMaxAge}` });
      return res.end(JSON.stringify({ keys: keys.map(k => ({ ...k.publicKey.export({ format: 'jwk' }), kid: k.kid, alg: 'RS256', use: 'sig' })) }));
    }
    if (u.pathname === '/o/oauth2/v2/auth' && req.method === 'GET') {
      stats.authorize++;
      const p = u.searchParams; const err = checkAuthorize(p); if (err) return bad(res, 400, err);
      if (p.get('fake_error')) return back(res, p.get('redirect_uri'), { error: p.get('fake_error'), state: p.get('state') });
      if (p.get('fake_auto')) return back(res, p.get('redirect_uri'), { code: issue(p, who(p, 'fake_')), state: p.get('state') });
      const hidden = [...p].map(([k, v]) => `<input type="hidden" name="${esc(k)}" value="${esc(v)}">`).join('');
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      return res.end(`<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Fake Google</title></head><body>
<h1>Fake Google: choose an account</h1><form method="post" action="/o/oauth2/v2/auth/continue">${hidden}
<label>Email <input name="email" value="ana@dwes.test"></label><label>Name <input name="name" value="Ana Silva"></label>
<label>Workspace domain (hd) <input name="hd" placeholder="(from the email)"></label><label>Account id (sub) <input name="sub"></label>
<label><input type="checkbox" name="verified" value="1" checked> Email verified</label>
<button name="go" value="continue">Continue</button><button name="go" value="cancel">Cancel</button><button name="go" value="blocked">Blocked by school</button></form></body></html>`);
    }
    if (u.pathname === '/o/oauth2/v2/auth/continue' && req.method === 'POST') {
      const p = await readBody(req); const err = checkAuthorize(p); if (err) return bad(res, 400, err);
      if (p.get('go') === 'cancel') return back(res, p.get('redirect_uri'), { error: 'access_denied', state: p.get('state') });
      if (p.get('go') === 'blocked') return back(res, p.get('redirect_uri'), { error: 'admin_policy_enforced', state: p.get('state') });
      if (!p.get('hd')) p.delete('hd');
      if (!p.get('sub')) p.delete('sub');
      if (!p.has('verified')) p.set('verified', '0');
      return back(res, p.get('redirect_uri'), { code: issue(p, who(p)), state: p.get('state') });
    }
    if (u.pathname === '/token' && req.method === 'POST') {
      stats.token++;
      const p = await readBody(req); const c = codes.get(p.get('code') || '');
      if (c?.tamper === 'status500') return bad(res, 500, { error: 'internal' }, true);
      if (c?.tamper === 'slow') await new Promise(r => setTimeout(r, 15_000));
      if (c?.tamper === 'huge') { res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ id_token: 'x'.repeat(70_000) })); }
      if (p.get('grant_type') !== 'authorization_code') return bad(res, 400, { error: 'unsupported_grant_type' }, true);
      if (p.get('client_id') !== clientId || p.get('client_secret') !== clientSecret) return bad(res, 401, { error: 'invalid_client' }, true);
      if (!c || c.used || Date.now() - c.at > 60e3 || p.get('redirect_uri') !== c.redirect) return bad(res, 400, { error: 'invalid_grant' }, true);
      if (sha(String(p.get('code_verifier') || '')).toString('base64url') !== c.challenge) return bad(res, 400, { error: 'invalid_grant' }, true);
      c.used = true;
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ access_token: 'fake-at-' + crypto.randomBytes(8).toString('hex'), token_type: 'Bearer', expires_in: 3599, scope: 'openid email profile', ...(c.tamper === 'noIdToken' ? {} : { id_token: idToken(c, c.tamper) }) }));
    }
    bad(res, 404, 'not found');
  });
  await new Promise(r => server.listen(port, host, r));
  url = `http://${host}:${server.address().port}`;
  return {
    get url() { return url; }, stats, issued, rotateKey,
    next(o = {}) { pending = o; },
    close: () => new Promise(r => { server.closeAllConnections?.(); server.close(() => r()); }),
  };
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const i = process.argv.indexOf('--port'); const port = i > 0 ? +process.argv[i + 1] : 5932;
  const hostArg = process.argv.indexOf('--host');
  startFakeGoogle({ port, host: hostArg > 0 ? process.argv[hostArg + 1] : '127.0.0.1' }).then(f => console.log(`fake Google on ${f.url}`));
}
