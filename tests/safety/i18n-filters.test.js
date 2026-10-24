// Kid safety in every language: phone numbers and emails written with full-width or non-Latin digits and letters are
// caught, invisible characters cannot split them, and the per-language blocklists (ROT13 files) apply to everyone.
process.env.BRB_DB = ':memory:';
process.env.BRB_SILENT = '1';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const tf = await import('../../server/services/textfilter.js');
const chat = await import('../../server/services/chat.js');

test('phone numbers in full-width and other scripts\' digits are caught', () => {
  for (const s of [
    '０１２３４５６７８９',                 // full-width
    'call me ５５５-１２３-４５６７',       // full-width with dashes
    '٠١٢٣٤٥٦٧٨٩',                          // Arabic-Indic
    'رقمي ٠٥٥١٢٣٤٥٦٧',                     // Arabic sentence with an Arabic-Indic number
    '۰۹۱۲۳۴۵۶۷۸۹',                         // Extended Arabic-Indic (Persian/Urdu)
    '०९८७६५४३२१',                           // Devanagari
    '๐๘๑๒๓๔๕๖๗๘',                          // Thai
    '555​123​4567',              // zero-width spaces between digits
    '555‐123‐4567',                        // Unicode hyphens
    '+٤٤ ٧٩٠٠ ١٢٣٤٥٦',                     // international, Arabic-Indic
  ]) assert.equal(tf.personalInfo(s), 'phone', s);
});

test('emails in full-width and non-Latin letters are caught', () => {
  for (const s of ['ｂｏｂ＠ｅｘａｍｐｌｅ．ｃｏｍ', 'mail me: ｋｉｄ１２＠ｇｍａｉｌ．ｃｏｍ', 'дима@почта.рф', 'ユーザー@例え.jp', 'bob (at) example (dot) com', 'yossi@דואר.קום'])
    assert.equal(tf.personalInfo(s), 'email', s);
});

test('chat refuses those messages and says why, in the reader\'s language', () => {
  for (const [s, code] of [['０１２３４５６７８９', 'phone'], ['٠١٢٣٤٥٦٧٨٩', 'phone'], ['ｂｏｂ＠ｅｘａｍｐｌｅ．ｃｏｍ', 'email'], ['five five five ١٢٣ ٤٥٦٧', 'phone']]) {
    const r = chat.checkText(s);
    assert.equal(r.ok, false, s); assert.equal(r.code, code, s); assert.equal(r.blocked, true);
    assert.match(r.error, code === 'phone' ? /Phone numbers stay private/ : /Email addresses stay private/);
  }
});

test('ordinary messages in many languages still go through', () => {
  for (const s of ['Good game! I scored 1500 points on level 12', 'J\'ai gagné 3 fois !', '¡Vamos a jugar otra vez!', 'Lass uns nochmal spielen', 'בוא נשחק שוב', 'もう一回あそぼう！', 'هيا نلعب مرة أخرى ٣ مرات', 'Давай сыграем ещё раз', 'Giochiamo ancora!', '我們再玩一次吧', 'Zullen we nog een keer spelen?', 'Vamos jogar de novo? 😂'])
    assert.equal(chat.checkText(s).ok, true, s);
  assert.equal(tf.personalInfo('٣ نجوم و ١٢ نقطة'), null, 'small Arabic-Indic numbers are fine');
  assert.equal(tf.personalInfo('ステージ１２で１５００点'), null, 'small full-width numbers are fine');
});

test('foldDigits and normalizeText', () => {
  assert.equal(tf.foldDigits('٠١٢٣٤٥٦٧٨٩ ۰۹ ०९ ๐๙ 09'), '0123456789 09 09 09 09');
  assert.equal(tf.normalizeText('ＡＢＣ​１２３－４'), 'ABC123-4');
});

test('per-language blocklists: ROT13 entries, word starts, whole words, safe words, any script, any sender', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'brb-block-'));
  // made-up test words, never real ones: "zorblax" (start of word), "=grum" (whole word only), "!grumpy" (safe word)
  fs.writeFileSync(path.join(dir, 'xx.txt'), ['# test list', tf.rot13('zorblax'), '=' + tf.rot13('grum'), '!' + tf.rot13('grumpy'), 'плохослово', 'だめことば', 'מילהרעה', 'كلمةسيئة'].join('\n'));
  try {
    assert.equal(tf.loadBlocklists(dir), 6);
    assert.equal(tf.hasProfanity('you are a zorblax'), true);
    assert.equal(tf.hasProfanity('ZÖRBLAXES everywhere'), true, 'case, accents and endings');
    assert.equal(tf.hasProfanity('z o r b l a x'), true, 'spaced-out letters');
    assert.equal(tf.hasProfanity('ｚｏｒｂｌａｘ'), true, 'full-width letters');
    assert.equal(tf.hasProfanity('so grum today'), true);
    assert.equal(tf.hasProfanity('grumpy cat'), false, 'safe word');
    assert.equal(tf.hasProfanity('a grumble'), false, '"=" entries match whole words only');
    assert.equal(tf.hasProfanity('ты плохослово!'), true, 'Cyrillic');
    assert.equal(tf.hasProfanity('きみは だめ こと ば だね'), true, 'Japanese, even with spaces squeezed in');
    assert.equal(tf.hasProfanity('אתה מילהרעה'), true, 'Hebrew');
    assert.equal(tf.hasProfanity('أنت كلمةسيئة'), true, 'Arabic');
    assert.equal(tf.cleanText('A game about a zorblax').ok, false, 'game text uses the lists too');
    assert.equal(tf.cleanName('Zorblax99').ok, false, 'usernames use the lists too');
    assert.equal(chat.checkText('zorblax').code, 'words', 'and chat');
    assert.equal(tf.hasProfanity('a friendly game about sharks'), false);
  } finally { tf.loadBlocklists(); }
});

test('every shipped blocklist file parses and carries the header', () => {
  const files = fs.readdirSync(tf.BLOCKLIST_DIR).filter(f => f.endsWith('.txt'));
  assert.equal(files.length, 13, 'one file per site language');
  for (const f of files) {
    const text = fs.readFileSync(path.join(tf.BLOCKLIST_DIR, f), 'utf8');
    assert.match(text, /^# Magic Cups word blocklist/, f);
    assert.doesNotThrow(() => tf.parseBlocklist(text), f);
  }
});
