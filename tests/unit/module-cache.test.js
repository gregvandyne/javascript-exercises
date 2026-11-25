// A module imported by another ('/js/board-view.js', no ?v=) must be rechecked on every load; only ?v= files are cached
// for a year (server/services/compress.js versionedCache).
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
const { config } = await import('../../server/config.js');
const { createApp } = await import('../../server/app.js');

test('scripts and stylesheets without ?v= are revalidated; ?v= ones are cached for a year', async () => {
  const was = config.env; config.env = 'production';
  const server = createApp().listen(0); await new Promise(r => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const plain = await fetch(`${base}/js/board-view.js`);
    assert.equal(plain.status, 200);
    assert.equal(plain.headers.get('cache-control'), 'no-cache');
    const css = await fetch(`${base}/css/homeroom.css`);
    assert.equal(css.headers.get('cache-control'), 'no-cache');
    const v = await fetch(`${base}/js/board-view.js?v=abc`);
    assert.match(v.headers.get('cache-control') || '', /max-age=31536000/);
    const img = await fetch(`${base}/favicon.ico`);
    assert.notEqual(img.headers.get('cache-control'), 'no-cache');
  } finally { config.env = was; server.closeAllConnections(); server.close(); }
});
