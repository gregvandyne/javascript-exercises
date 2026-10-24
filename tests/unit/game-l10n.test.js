// Launch games' translated descriptions (seed JSON "l10n"): stored on import, shown per page language, searchable.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const games = await import('../../server/services/games.js');
const { importGame } = await import('../../scripts/import-game.js');
const auth = await import('../../server/auth.js');
const { withLocale } = await import('../../server/i18n/index.js');
const { frameDocument } = await import('../../server/services/frame.js');

const owner = auth.createUser({ username: 'L10nOwner', password: 'a-long-password-1', displayName: 'Owner' });
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'l10n-'));
fs.writeFileSync(path.join(dir, 'g.html'), '<title>Hop</title><p>Hop!</p><script>BRB.ready&&BRB.ready()</script>');
fs.writeFileSync(path.join(dir, 'g.json'), JSON.stringify({ slug: 'hop-test', title: 'Hop', icon: '🐸', cover: 'mint', category: 'arcade', tags: 'frog,jump', description: 'Jump the frog.', featured: true,
  l10n: { fr: { description: 'Fais sauter la grenouille.', tags: 'grenouille,saut' }, ja: { description: 'カエルをジャンプさせよう。' } } }));
const g = importGame(path.join(dir, 'g.html'), path.join(dir, 'g.json'), owner.id);

test('a localized description replaces the English one for that language only', () => {
  const raw = games.getGame(g.id);
  assert.equal(games.localizeGame(raw, 'fr').description, 'Fais sauter la grenouille.');
  assert.equal(games.localizeGame(raw, 'fr').tags, 'grenouille,saut');
  assert.equal(games.localizeGame(raw, 'ja').tags, 'frog,jump', 'missing tags keep the English ones');
  assert.equal(games.localizeGame(raw, 'de').description, 'Jump the frog.', 'no entry: English');
  assert.equal(games.localizeGame(raw, 'en').description, 'Jump the frog.');
  assert.equal(games.localizeGame(raw, 'fr').title, 'Hop', 'titles stay unless given');
  assert.equal(games.getGame(g.id).description, 'Jump the frog.', 'the stored text is never changed');
});

test('lists follow the page language and search finds translated words', () => {
  const list = withLocale('fr', () => games.listVisible(null, { limit: 50 }));
  const row = list.find(r => r.id === g.id);
  assert.equal(row.description, 'Fais sauter la grenouille.');
  assert.deepEqual(row.tagList, ['grenouille', 'saut']);
  const found = withLocale('fr', () => games.search(null, { text: 'grenouille' }));
  assert.ok((found.games || found).some(r => r.id === g.id), 'search matches the translated text');
});

test('the game frame tells the browser its language', () => {
  assert.match(frameDocument('<title>x</title>', { user: { lang: 'ja' } }), /<html lang="ja">/);
  assert.match(frameDocument('<title>x</title>', { user: { lang: '"><script>' } }), /<html lang="script">/);
  assert.match(frameDocument('<title>x</title>', {}), /<html lang="en">/);
});
