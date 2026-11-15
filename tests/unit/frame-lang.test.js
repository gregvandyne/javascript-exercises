// The player's language reaches the game frame (BRB.user.lang, which the Oomba Kit and the games read): the play page
// signs it into the frame token (l) from req.locale, whose order is ?lang=, the /<code>/ address, the lang cookie (the
// picker), the account's language, then Accept-Language. Regional tags arrive as one of the 13 site codes, the same
// code the kit's normLang keeps, so O.lang and the kit's i18n agree. (The owner saw English how-to cards; this pins the
// whole path, so a wrong language is never the platform's.)
import { reset, call, publish, official, kid, cookieFor, q } from './_live.js';
import test from 'node:test';
import assert from 'node:assert/strict';
const { normLang } = await import('../../kit/src/i18n.js');

const g = publish(official, '<!doctype html><title>t</title><p>hi</p>', { source: 'seed', slug: 'frame-lang-test', title: 'Frame Lang' });
test.beforeEach(() => reset());

/** The play page, then its frame: -> the frame's INIT.user.lang (and the page's Content-Language). */
async function frameLang({ path = `/play/${g.slug}`, user = null, cookie = '', accept = null } = {}) {
  const headers = {};
  const c = [user ? cookieFor(user.id) : '', cookie].filter(Boolean).join('; ');
  if (c) headers.cookie = c;
  if (accept) headers['accept-language'] = accept;
  const page = await call(path, { headers });
  assert.equal(page.status, 200, page.text.slice(0, 200));
  const src = /data-src="(\/frame\/[^"?]+)/.exec(page.text)[1];
  const frame = await call(src, { headers });
  assert.equal(frame.status, 200);
  const init = JSON.parse(/window\.__BRB_INIT__=(\{.*?\});<\/script>/.exec(frame.text)[1]);
  return { lang: init.user.lang, dir: init.user.dir, page: page.headers.get('content-language'), html: /<html lang="([^"]+)"/.exec(frame.text)[1] };
}

test('the frame gets the language the play page is in, whichever way the player chose it', async () => {
  const prev = process.env.BRB_ALL_LOCALES; process.env.BRB_ALL_LOCALES = '1';
  try {
    assert.deepEqual(await frameLang(), { lang: 'en', dir: 'ltr', page: 'en', html: 'en' }, 'nothing chosen: English');
    // iPhone Safari sends the phone's languages, with regions
    for (const [accept, want] of [['es-MX,es;q=0.9', 'es'], ['pt-BR', 'pt'], ['zh-TW', 'zh-Hant'], ['zh-HK,zh;q=0.8', 'zh-Hant'], ['en-GB,en;q=0.9', 'en-GB'], ['ar-SA', 'ar'], ['he-IL', 'he'], ['ja-JP', 'ja']]) {
      const r = await frameLang({ accept });
      assert.equal(r.lang, want, accept); assert.equal(r.page, want, `${accept}: the page too`); assert.equal(r.html, want);
    }
    assert.equal((await frameLang({ accept: 'ar' })).dir, 'rtl');
    // the picker's cookie beats the phone; the /es/ address beats the cookie
    assert.equal((await frameLang({ cookie: 'lang=fr', accept: 'es-MX' })).lang, 'fr');
    // a game's page read at its /<code>/ address (a search result, a shared link): its Play button keeps that language
    const gp = await call(`/ja/g/${g.slug}`, { headers: { 'accept-language': 'en-US' } });
    assert.equal(gp.status, 200); assert.equal(gp.headers.get('content-language'), 'ja');
    assert.equal(gp.headers.get('set-cookie'), null, 'a language address writes no cookie (seo.test.js)');
    const play = /href="([^"]+)" id="playbtn"/.exec(gp.text)[1].replace(/&amp;/g, '&');
    assert.equal(play, `/play/${g.slug}?lang=ja`, 'its Play button carries the language');
    // the tap: the picker's ?lang= remembers it and comes back to the plain address; the game is in Japanese
    const tap = await call(play, { headers: { 'accept-language': 'en-US', 'sec-fetch-site': 'same-origin' } });
    assert.equal(tap.status, 303); assert.equal(tap.headers.get('location'), `/play/${g.slug}`);
    const jar = /lang=[^;]+/.exec(tap.headers.get('set-cookie'))[0];
    assert.equal((await frameLang({ path: tap.headers.get('location'), cookie: jar, accept: 'en-US' })).lang, 'ja', 'Play from the Japanese page: the game is in Japanese');
    // before the fix the link was the plain /play address, and the game came up in the phone's language
    assert.equal((await frameLang({ path: `/play/${g.slug}`, accept: 'en-US' })).lang, 'en');
    // a language already chosen (the cookie) wins, as everywhere: no ?lang= then
    const chosen = await call(`/ja/g/${g.slug}`, { headers: { cookie: 'lang=fr' } });
    assert.match(chosen.text, new RegExp(`href="/play/${g.slug}" id="playbtn"`));
    // a signed-in player's account language, over the phone's
    q.run("UPDATE users SET lang='de' WHERE id=?", kid.id);
    assert.equal((await frameLang({ user: kid, accept: 'es-MX' })).lang, 'de');
    q.run("UPDATE users SET lang='' WHERE id=?", kid.id);
  } finally { if (prev === undefined) delete process.env.BRB_ALL_LOCALES; else process.env.BRB_ALL_LOCALES = prev; }
});

test('the kit keeps the site code as it is (O.lang and i18n agree for regional tags)', () => {
  for (const c of ['en', 'en-GB', 'es', 'fr', 'de', 'it', 'pt', 'nl', 'ru', 'ja', 'zh-Hant', 'ar', 'he']) assert.equal(normLang(c), c);
  // a raw regional tag (a game outside the platform) lands on the same codes as the server's matchTag
  assert.deepEqual(['es-MX', 'pt-BR', 'zh-TW', 'en-GB', 'en-US'].map(normLang), ['es', 'pt', 'zh-Hant', 'en-GB', 'en']);
});
