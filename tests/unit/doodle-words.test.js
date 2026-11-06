// Doodle Hoot's reviewed word list (window.DoodleWords in seed-games/doodle-hoot.html) and Pip's doodles: enough words
// per language and level, each in its own script only, short enough for a tray, no duplicates, and every word clean in
// all 13 rude-word lists, with no contact details. Every doodle is valid board strokes for a word that exists.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { doodle, GAME_FILE } from '../../server/live/doodle-core.js';
import * as DD from '../../server/live/doodle.js';
import { profanityMatch, cleanText, personalInfo } from '../../server/services/textfilter.js';

const { DoodleCore: C, DoodleWords: D } = doodle();
const LANGS = DD.LANGS;
/** The letters each language may use (Latin with that language's accents, Cyrillic, Arabic, Hebrew, kana, Han). */
const SCRIPT = {
  en: /^[a-z ]+$/, 'en-GB': /^[a-z ]+$/, es: /^[a-záéíóúüñ ]+$/, fr: /^[a-zàâæçéèêëîïôœùûüÿ ]+$/, de: /^[a-zäöüß ]+$/, it: /^[a-zàèéìíòóù ]+$/,
  pt: /^[a-záâãàçéêíóôõú ]+$/, nl: /^[a-zëïéèö ]+$/, ru: /^[а-яё ]+$/, ar: /^[ء-ي ]+$/, he: /^[א-ת ]+$/,
  ja: /^[ぁ-ゖァ-ヺー]+$/, 'zh-Hant': /^\p{Script=Han}{2,4}$/u,
};

test('every language has enough words at every level', () => {
  assert.equal(D.langs.length, 12);
  for (const lang of LANGS) {
    const [a, b, c] = [1, 2, 3].map(l => C.words(D, lang, l).length);
    assert.ok(a >= 55, `${lang} easy ${a}`); assert.ok(b >= 50, `${lang} medium ${b}`); assert.ok(c >= 30, `${lang} tricky ${c}`);
  }
  const rows = D.rows.map(r => r[0]);
  assert.equal(new Set(rows).size, rows.length, 'ids are unique');
  for (const r of D.rows) {
    assert.equal(r[4].split('|').length, D.langs.length, r[0]);
    assert.ok([1, 2, 3].includes(r[1])); assert.ok(r[3] && /\p{Extended_Pictographic}/u.test(r[3]), `${r[0]} has an emoji`);
  }
});

test('each word: its own script, at most 2 words, 12 letters a word, 14 in all, no digits, hyphens or marks', () => {
  for (const lang of LANGS) {
    const seen = new Set();
    for (const x of C.words(D, lang, 0)) {
      assert.ok(SCRIPT[lang].test(x.w), `${lang}: ${x.w}`);
      const P = C.parts(x.w, lang);
      assert.ok(P.groups.length <= 2 && P.groups.every(n => n <= 12) && P.g.length <= C.MAX_LETTERS && P.g.length >= 2, `${lang}: ${x.w}`);
      assert.ok(!/[\d\-'’ً-ْـְ-ׇ]/.test(x.w), `${lang}: ${x.w}`);
      assert.equal(x.w, x.w.normalize('NFC'));
      const k = `${x.lvl}:${x.w}`; assert.ok(!seen.has(k), `${lang}: ${x.w} twice`); seen.add(k);
    }
  }
});

test('every word is clean in all 13 rude-word lists and has no contact details', () => {
  for (const lang of LANGS) for (const x of C.words(D, lang, 0)) {
    assert.equal(profanityMatch(x.w), null, `${lang}: ${x.w}`);
    assert.ok(cleanText(x.w, 100).ok, `${lang}: ${x.w}`);
    assert.equal(personalInfo(x.w), null);
  }
});

test('Japanese: hiragana words get hiragana decoys, katakana words katakana', () => {
  const pool = C.wordPool(D, 'ja');
  for (let s = 1; s < 20; s++) {
    const a = C.buildTray('ねこ', 'ja', 2, C.rng(s), { pool }), b = C.buildTray('ライオン', 'ja', 2, C.rng(s), { pool });
    assert.ok(a.decoys.every(i => /[ぁ-ゖ]/.test(a.tray[i])));
    assert.ok(b.decoys.every(i => /[ァ-ー]/.test(b.tray[i])));
  }
});

test('Pip\'s doodles: valid strokes on the board, each for a word in the list, enough for a practice game', () => {
  const html = fs.readFileSync(GAME_FILE, 'utf8');
  const a = html.indexOf('/* doodle-art:begin */'), b = html.indexOf('/* doodle-art:end */');
  const box = { window: {} };
  vm.runInNewContext(html.slice(a, b), box, { timeout: 2000 });
  const ART = box.window.DoodleArt, ids = new Set(D.rows.map(r => r[0]));
  assert.ok(Object.keys(ART).length >= 36);
  for (const [id, strokes] of Object.entries(ART)) {
    assert.ok(ids.has(id), id);
    assert.ok(strokes.length >= 1 && strokes.length <= 16, id);
    for (const s of strokes) {
      assert.ok(Number.isInteger(s.c) && s.c >= 0 && s.c < 12 && s.c !== 1, `${id}: a colour that shows on paper`);
      assert.ok(Number.isInteger(s.w) && s.w >= 0 && s.w < 4);
      assert.ok(s.pts.length >= 2 && s.pts.length % 2 === 0);
      for (let i = 0; i < s.pts.length; i += 2) assert.ok(s.pts[i] >= 0 && s.pts[i] <= 1000 && s.pts[i + 1] >= 0 && s.pts[i + 1] <= 750, `${id} in bounds`);
    }
  }
  for (const lang of LANGS) assert.ok(C.words(D, lang, 1).filter(x => ART[x.id]).length >= 8, `${lang}: 8 easy doodles`);
});

test('the starter id and the landing samples', () => {
  assert.deepEqual(DD.parseId('doodle:fr:2:3:100'), { lang: 'fr', lvl: 2, rounds: 3, secs: 100 });
  assert.deepEqual(DD.parseId('doodle:zh-Hant:1:1:60'), { lang: 'zh-Hant', lvl: 1, rounds: 1, secs: 60 });
  for (const bad of ['doodle:xx:1:2:80', 'doodle:en:4:2:80', 'doodle:en:1:4:80', 'doodle:en:1:2:90', 'doodle:en:1:2', 'tug:3:90', '', null]) assert.equal(DD.parseId(bad), null, String(bad));
  assert.equal(DD.makeId({ lang: 'he', lvl: 3, rounds: 1, secs: 60 }), 'doodle:he:3:1:60');
  assert.equal(DD.makeId({ lang: 'klingon', lvl: 9, rounds: 0, secs: 5 }), 'doodle:en:1:2:80');
  assert.equal(DD.makeId(), DD.DEFAULT_ID);
  for (const l of LANGS) for (const v of DD.LEVELS) assert.equal(DD.samples(l, v).length, 3);
  assert.equal(DD.langFor('pt'), 'pt'); assert.equal(DD.langFor('xx'), 'en');
});
