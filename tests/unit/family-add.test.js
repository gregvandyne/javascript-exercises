// "Add your kids" (/family/add, routes/family.js): where a new grown-up lands after signing up and after paying, and
// what /family's Children panel opens. Make my child's account (only while PARENT_MADE_CHILDREN is on, with the direct
// notice and both boxes exactly as on /family/children/new) or Link my child's existing account (the code form), each
// through the existing APIs, back to the step; Done / "I'll do this later"; FAMILY_MAX_CHILDREN; the fence.
import { config, auth, F, q, uid, PW, KID_PW, call, as, kid, grownup, famOf, linkByCode, fresh, LEGAL_UPDATED } from './_made.js';
import test from 'node:test';
import assert from 'node:assert/strict';
const { grownupMay, ADD_AFTER } = await import('../../server/routes/family.js');

const main = s => (s.match(/<main[\s\S]*<\/main>/) || [''])[0];
const decode = s => s.replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&');
const step = async (g, qs = '') => { const r = await as(g)(`/family/add${qs}`); assert.equal(r.status, 200, r.text); return decode(main(r.text)); };
const madeBody = (over = {}) => ({ username: `Sprout${fresh()}`, newPassword: KID_PW, newConfirm: KID_PW, ack: '1', guardian: '1', password: PW, then: 'add', ...over });
const grant = (g, plan = 'family') => q.run('INSERT INTO billing_grants(id, owner_kind, owner_id, plan, until, created_at) VALUES (?,?,?,?,?,?)', uid(10), 'family', famOf(g).id, plan, Date.now() + 86400e3, Date.now());

test('sign-up lands on "Add your kids" (a plan picked on /plans still goes to paying first; a grown-up ?next= still wins)', async () => {
  const name = `Signup${fresh()}`;
  const r = await call(null, '/api/grown-ups/signup', { method: 'POST', body: { username: name, password: PW, confirm: PW, adult: '1' } });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.json.redirect, '/family/add?from=signup');
  assert.equal(ADD_AFTER.signup, '/family/add?from=signup');
  const page = decode(main((await call(r.cookie, r.json.redirect)).text));
  assert.match(page, /<p class="notice good" role="status"><span aria-hidden="true">✅<\/span> <span>Your grown-up account is ready\.<\/span><\/p>/);
  assert.match(page, /<h1>Add your kids<\/h1>/);
  const picked = await call(null, '/api/grown-ups/signup', { method: 'POST', body: { username: `Signup${fresh()}`, password: PW, confirm: PW, adult: '1', plan: 'family', interval: 'month' } });
  assert.equal(picked.json.redirect, '/family?plan=family&interval=month');
  const next = await call(null, '/api/grown-ups/signup', { method: 'POST', body: { username: `Signup${fresh()}`, password: PW, confirm: PW, adult: '1', next: '/plans' } });
  assert.equal(next.json.redirect, '/plans');
});

test('back from Checkout with the plan on: /family goes on to the step, which says thank you; while it waits, the wait goes there too', async () => {
  const g = grownup();
  const waiting = (await as(g)('/family?checkout=cs_test_wait')).text;
  assert.match(waiting, /data-checkout-wait="cs_test_wait" data-back="\/family\/add\?from=checkout"/);
  grant(g);
  for (const qs of ['?checkout=cs_test_done', '?welcome=1']) {
    const r = await as(g)(`/family${qs}`);
    assert.equal(r.status, 302, qs); assert.equal(r.location, ADD_AFTER.checkout, qs);
  }
  const page = await step(g, '?from=checkout');
  assert.match(page, /🎉<\/span> Your Family plan is on\. Thank you!/);
  assert.doesNotMatch(page, /grown-up account is ready/);
  // A made-up ?from=checkout without a plan says no thank-you.
  assert.doesNotMatch(await step(grownup(), '?from=checkout'), /Thank you/);
  // /family itself (no checkout) stays /family.
  assert.equal((await as(g)('/family')).status, 200);
});

test('flag on: two choices side by side, nothing open until one is picked; Make shows the notice and both boxes unchanged', async () => {
  const g = grownup();
  const page = await step(g, '?from=signup');
  assert.match(page, /Make an account for your child, or link the account they already have\./);
  assert.match(page, /<h2 id="addkids-pick-h">How would you like to add your child\?<\/h2>/);
  assert.match(page, /<div class="addkids-choices" role="group" aria-labelledby="addkids-pick-h"><a class="door addkids-choice" href="\/family\/add\?from=signup&how=make#addkids-how">[\s\S]*Make my child's account[\s\S]*<a class="door addkids-choice" href="\/family\/add\?from=signup&how=link#addkids-how">[\s\S]*Link my child's existing account/);
  assert.doesNotMatch(page, /<form|aria-current/);
  // Make: the very form of /family/children/new, posting to the same API, plus then=add.
  const make = await step(g, '?how=make');
  assert.match(make, /href="\/family\/add\?how=make#addkids-how" aria-current="true"/);
  const alone = decode(main((await as(g)('/family/children/new')).text));
  const formOf = s => s.match(/<form data-api="\/api\/family\/children\/new"[\s\S]*?<\/form>/)[0];
  assert.equal(formOf(make).replace('<input type="hidden" name="then" value="add">', ''), formOf(alone), 'the same form, notice and boxes');
  assert.match(formOf(make), /name="then" value="add"/);
  for (const k of ['made-notice-h', 'made-ack', 'made-guardian', 'made-noconsent', 'href="/privacy#made"', 'pw-made']) assert.ok(make.includes(k), k);
  assert.match(make, /is not a parental consent check/);
  // Link: the code form of /family/link, same API.
  const link = await step(g, '?how=link');
  assert.match(link, /<h2 id="addkids-how-h">Link my child's existing account<\/h2>/);
  assert.match(link, /<form data-api="\/api\/family\/link" novalidate><input type="hidden" name="then" value="add">/);
  assert.match(link, /Your child signs in, opens <b>Me<\/b>/);
  assert.doesNotMatch(link, /made-notice/);
});

test('flag off: nothing about making an account, the code form open straight away; ?how=make is ignored', async () => {
  config.parentMadeChildren = false;
  const g = grownup();
  for (const qs of ['', '?how=make', '?how=link', '?from=signup']) {
    const page = await step(g, qs);
    assert.doesNotMatch(page, /Make my child|children\/new|made-notice|addkids-choices|how=make|Make an account/, qs);
    assert.match(page, /Link your child's Oomba Academy account to yours\./, qs);
    assert.match(page, /<form data-api="\/api\/family\/link" novalidate><input type="hidden" name="then" value="add">/, qs);
  }
  // The make API stays a 404 even with then=add.
  assert.equal((await as(g)('/api/family/children/new', { method: 'POST', body: madeBody() })).status, 404);
  assert.match(decode(main((await as(g)('/family')).text)), /<a class="btn btn-primary" href="\/family\/add">➕ Link a child<\/a>/);
});

test('skip: "I\'ll do this later" goes to /family, which never sends the grown-up back; Done once a child is added', async () => {
  const g = grownup();
  const page = await step(g, '?from=signup');
  assert.match(page, /<a class="btn" href="\/family">I'll do this later<\/a><span class="small muted">You can add your children any time from Your family\.<\/span>/);
  assert.doesNotMatch(page, />Done</);
  const fam = await as(g)('/family');
  assert.equal(fam.status, 200);
  assert.match(decode(main(fam.text)), /<a class="btn btn-primary" href="\/family\/add">➕ Add a child<\/a>/, 'reachable any time');
  await linkByCode(g, kid());
  const after = await step(g);
  assert.match(after, /<a class="btn btn-primary" href="\/family">Done<\/a>/);
  assert.doesNotMatch(after, /I'll do this later/);
  assert.match(after, /<h2 id="addkids-pick-h">Add another child<\/h2>/);
});

test('link path: the code from the step comes back to the step; waiting, then the child\'s display name (never to anyone else)', async () => {
  const g = grownup(), child = kid(`Linky${fresh()}`);
  q.run('UPDATE users SET display_name=? WHERE id=?', 'Linky Star', child.id);
  const c = await as(child)('/api/me/family/code', { method: 'POST', body: {} });
  const r = await as(g)('/api/family/link', { method: 'POST', body: { code: c.json.code, then: 'add' } });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.json.redirect, '/family/add');
  assert.match(r.json.toast, /Request sent/);
  // Without then=add it is /family as before.
  assert.equal((await as(g)('/api/family/link', { method: 'POST', body: { code: 'ZZZ-ZZZZ' } })).status, 400);
  const other = kid();
  const c2 = await as(other)('/api/me/family/code', { method: 'POST', body: {} });
  const plainLink = await as(g)('/api/family/link', { method: 'POST', body: { code: c2.json.code } });
  assert.equal(plainLink.status, 200, plainLink.text);
  assert.equal(plainLink.json.redirect, '/family');
  let page = await step(g);
  assert.match(page, /<h2 id="addkids-added-h">Added so far<\/h2>[\s\S]*Waiting for your child to say yes/);
  assert.doesNotMatch(page, /Linky Star/, 'no name before the child says yes');
  assert.equal((await as(child)('/api/me/family/answer', { method: 'POST', body: { answer: 'yes' } })).status, 200);
  page = await step(g);
  assert.match(page, /<b><bdi>Linky Star<\/bdi><\/b>/);
  assert.doesNotMatch(page, new RegExp(`@${child.username}`), 'display names only');
  assert.doesNotMatch(await step(grownup()), /Linky Star|Added so far/, 'another grown-up sees nothing');
});

test('make path: the account made from the step comes back to the step, with the same notice record as /family/children/new', async () => {
  const g = grownup();
  const body = madeBody();
  const r = await as(g)('/api/family/children/new', { method: 'POST', body });
  assert.equal(r.status, 200, r.text);
  assert.match(r.json.redirect, /^\/family\/add\?made=[^&#]+$/);
  const child = auth.getUserByName(body.username);
  assert.equal(child.made_by, g.id);
  // The ?made= handoff carries through the step: ready, then Switch / Done to /family?made=… where Switch is open.
  const tok = r.json.redirect.split('made=')[1];
  const back = await step(g, `?made=${tok}`);
  assert.match(back, new RegExp(`<p class="notice good famkid-ready" role="status">✅ Account ready\. ${child.display_name} can sign in`));
  assert.match(back, new RegExp(`<a class="btn btn-primary" href="/family\\?made=${tok}#made-switch">Switch to ${child.display_name}</a><a class="btn" href="/family\\?made=${tok}">Done</a>`));
  const fam = decode(main((await as(g)(`/family?made=${tok}`)).text));
  assert.match(fam, new RegExp(`famkid-ready[^>]*>✅ Account ready\. ${child.display_name} can sign in`));
  assert.match(fam, /<details class="famkid-act" id="made-switch" open><summary class="btn btn-primary">Switch to /);
  // Somebody else's or a made-up token: no ready line, plain Done.
  for (const bad of ['nope', tok]) {
    const other = await step(bad === tok ? grownup() : g, `?made=${bad}`);
    assert.doesNotMatch(other, /famkid-ready|made-switch/, bad);
  }
  const ack = q.get('SELECT * FROM family_notice_acks WHERE child_id=?', child.id);
  assert.equal(ack.notice_version, LEGAL_UPDATED); assert.equal(ack.method, F.NOTICE_METHOD); assert.equal(ack.guardian_statement, 1);
  assert.match(await step(g), new RegExp(`<b><bdi>${child.display_name}</bdi></b>`));
  // The step's form refuses what the page refuses: both boxes, the step-up.
  const noAck = await as(g)('/api/family/children/new', { method: 'POST', body: madeBody({ ack: undefined }) });
  assert.equal(noAck.status, 400); assert.equal(noAck.json.field, 'ack');
  const noPw = await as(g)('/api/family/children/new', { method: 'POST', body: madeBody({ password: undefined }) });
  assert.equal(noPw.status, 403); assert.equal(noPw.json.needPassword, true);
  // Without then=add, /family?made=… as before.
  const plain = await as(g)('/api/family/children/new', { method: 'POST', body: madeBody({ then: undefined }) });
  assert.match(plain.json.redirect, /^\/family\?made=/);
});

test('FAMILY_MAX_CHILDREN: at the most, the step says so and offers no choice or form; Basic covers one', async () => {
  const was = config.familyMaxChildren;
  try {
    config.familyMaxChildren = 2;
    const g = grownup();
    await linkByCode(g, kid());
    let page = await step(g, '?how=link');
    assert.match(page, /addkids-choices/, 'room for one more');
    await linkByCode(g, kid());
    for (const qs of ['', '?how=make', '?how=link']) {
      page = await step(g, qs);
      assert.match(page, /<p class="notice" role="status">You have linked 2 children, the most for one family\.<\/p>/, qs);
      assert.doesNotMatch(page, /<form|addkids-choices|Add another child/, qs);
      assert.match(page, /href="\/family">Done</, qs);
    }
    // The APIs still refuse a third (the step adds no way around them).
    const c = await as(kid())('/api/me/family/code', { method: 'POST', body: {} });
    assert.equal(c.status, 200);
    assert.equal((await as(g)('/api/family/children/new', { method: 'POST', body: madeBody() })).status, 409);
    // Basic: one child.
    const b = grownup(); grant(b, 'basic');
    await linkByCode(b, kid());
    assert.match(await step(b), /Your Basic plan covers 1 child\./);
  } finally { config.familyMaxChildren = was; }
});

test('the fence: grown-ups only; signed out -> grown-up sign-in; families off -> 404', async () => {
  assert.equal(grownupMay('GET', '/family/add'), true);
  assert.equal(grownupMay('POST', '/family/add'), false);
  for (const u of [kid(), auth.createGuest()]) assert.equal((await as(u)('/family/add')).status, u.is_guest ? 302 : 404);
  const out = await call(null, '/family/add?from=signup');
  assert.equal(out.status, 302); assert.equal(out.location, '/grown-ups/login?next=%2Ffamily%2Fadd%3Ffrom%3Dsignup');
  const g = grownup();
  config.stripeApiKey = '';
  assert.equal((await as(g)('/family/add')).status, 404);
});

test('translated: the step in German, with no English left; and the English marked as English only while a language lacks it', async () => {
  const g = grownup();
  q.run("UPDATE users SET lang='de' WHERE id=?", g.id);
  const de = (await import('../../server/i18n/index.js')).dictionary('de');
  const page = main((await as(auth.getUser(g.id))('/family/add?from=signup&how=make')).text);
  for (const k of ['heading', 'intro', 'accountReady', 'pick', 'later']) assert.ok(page.includes(de[`family.add.${k}`].replace(/'/g, '&#39;')) || page.includes(de[`family.add.${k}`]), k);
  assert.doesNotMatch(page, /lang="en"|Add your kids|Make my child/);
  const { withoutKeys } = await import('../support/i18n-gaps.js');
  await withoutKeys('de', ['family.add'], async () => {
    const gap = main((await as(auth.getUser(g.id))('/family/add')).text);
    assert.match(gap, /<h1 lang="en" dir="ltr">Add your kids<\/h1>/);
  });
});

