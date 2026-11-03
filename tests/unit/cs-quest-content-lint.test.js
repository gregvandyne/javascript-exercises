// CS Quest content lint: the four CS Quest games (Robo Route, Data Detective, Packet Post, Inside the Machine) and their
// language packs must pass the real game scanner (a scan "fail" aborts every seed on boot), carry no phone-like digit
// runs, addresses or links in any string, keep US spelling, stay inside the string budget, and pin the pack version
// and checksums that are actually on disk. Games that do not exist yet are skipped, so this test is green before they land.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const { scanVersion } = await import('../../server/services/scanner.js');
const { SLUGS, PACK_LANGS, loadEnglish, checkAll, dataDir } = await import('../../scripts/cs-quest-i18n.mjs');

const UK = /\b(colours?|coloured|colouring|favourites?|grey|labelled|licence|organis(e|ed|ing)|practis(ed|ing)|neighbours?|recognis(e|ed|ing)|maths|centre|metres?|behaviours?|honour|catalogue|analys(e|ed|ing)|defence|travelled|modelling|cancelled|jewellery|tyres?|whilst|learnt|spelt|programme)\b/i;
const BAD = [[/\d{7,}/, 'a 7+ digit run (reads as a phone number)'], [/@/, 'an @ (reads as an email or handle)'], [/\/\/\w[\w.-]*\.\w{2,}/, 'a //host.tld link'], [/https?:/i, 'a URL scheme']];
const literalsOf = html => { const out = []; const re = /(['"`])((?:\\.|(?!\1)[^\\\n]){2,400})\1/g; let m; while ((m = re.exec(html))) out.push(m[2]); return out; };
const sentence = s => /\s/.test(s) && s.length >= 12;

for (const slug of SLUGS) {
  const htmlFile = path.join(ROOT, 'seed-games', `${slug}.html`);
  const hasHtml = fs.existsSync(htmlFile);
  const hasData = fs.existsSync(path.join(dataDir(slug), 'en.json'));

  test(`${slug}: the game passes the real scanner`, { skip: !hasHtml && 'game not built yet' }, () => {
    const html = fs.readFileSync(htmlFile, 'utf8');
    const r = scanVersion(html);
    assert.equal(r.status, 'pass', JSON.stringify(r.issues || r, null, 1));
    assert.ok(Buffer.byteLength(html) <= 2 * 1024 * 1024, 'under the 2 MB game cap');
    for (const lit of literalsOf(html)) {
      for (const [re, why] of BAD) assert.ok(!re.test(lit), `string literal has ${why}: ${lit.slice(0, 80)}`);
      if (sentence(lit)) assert.ok(!UK.test(lit), `US spelling please: ${lit.slice(0, 80)}`);
    }
  });

  test(`${slug}: language packs are complete, scanner-clean and US English`, { skip: !hasData && 'no pack data yet' }, () => {
    const english = loadEnglish(slug);
    assert.ok(english.length <= 1450, `string budget: ${english.length} > 1450 (chrome 450 + level text 1000)`);
    const problems = checkAll(slug);
    assert.deepEqual(problems.slice(0, 20), [], `${problems.length} pack problem(s)`);
    const all = [...english];
    for (const lang of PACK_LANGS) {
      const T = JSON.parse(fs.readFileSync(path.join(dataDir(slug), `${lang}.json`), 'utf8')).strings;
      for (const v of Object.values(T)) all.push(...(v && typeof v === 'object' ? Object.values(v) : [v]));
    }
    for (const s of all) for (const [re, why] of BAD) assert.ok(!re.test(s), `pack string has ${why}: ${s.slice(0, 80)}`);
    for (const s of english) if (sentence(s)) assert.ok(!UK.test(s), `US spelling please: ${s.slice(0, 80)}`);
    // the real scanner's text rules (profanity in every language, personal-info and family-code prompts) over every pack string
    const probe = `<title>T</title><canvas></canvas><script>const S=${JSON.stringify(all)};</script>`;
    const r = scanVersion(probe);
    assert.equal(r.status, 'pass', JSON.stringify(r.issues || r, null, 1));
  });

  test(`${slug}: the HTML pins the packs that are on disk`, { skip: !(hasHtml && hasData) && 'game or packs not built yet' }, () => {
    const html = fs.readFileSync(htmlFile, 'utf8');
    const ver = /PACK_VER\s*=\s*'([\w.-]+)'/.exec(html)?.[1];
    assert.ok(ver, 'the game declares PACK_VER');
    const sri = JSON.parse(/PACK_SRI\s*=\s*(\{[^;]*\})\s*;/.exec(html)?.[1] || 'null');
    assert.ok(sri, 'the game declares PACK_SRI');
    const dir = path.join(ROOT, 'public/vendor/data', slug, ver);
    assert.ok(fs.existsSync(dir), `public/vendor/data/${slug}/${ver} exists (run: node scripts/cs-quest-i18n.mjs ${slug} build)`);
    for (const lang of PACK_LANGS) {
      const body = fs.readFileSync(path.join(dir, `${lang}.js`));
      assert.equal(sri[lang], 'sha384-' + crypto.createHash('sha384').update(body).digest('base64'), `${lang} checksum matches the pack on disk`);
    }
    assert.ok(/CsqPacks/.test(html), 'the game reads window.CsqPacks');
  });
}
