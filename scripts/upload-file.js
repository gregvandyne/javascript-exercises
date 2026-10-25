// Uploads one file to a pre-signed upload link: an Amazon S3 pre-signed PUT URL or an Azure Blob SAS URL.
// For moving the data off a host that has no scp (the Render shell): the link itself carries the permission, so no
// cloud keys are needed on the old host. The link is never printed (it is a password while it lasts).
// Usage: node scripts/upload-file.js <file>               then paste the link and press Enter (kept out of shell history)
//        node scripts/upload-file.js <file> '<upload link>'
import fs from 'node:fs';
import https from 'node:https';
import readline from 'node:readline';

const [file, argLink] = process.argv.slice(2);
if (!file) { console.error("Usage: node scripts/upload-file.js <file> ['<upload link>']   (without the link, it asks for it)"); process.exit(2); }
fs.statSync(file);
let link = argLink;
if (!link) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stderr, terminal: false });
  if (process.stdin.isTTY) process.stderr.write('Paste the upload link, then press Enter: ');
  link = (await new Promise(resolve => { rl.once('line', resolve); rl.once('close', () => resolve('')); })).trim();
  rl.close();
}
let url;
try { url = new URL(link); if (url.protocol !== 'https:') throw new Error('not https'); } catch { console.error('The upload link must be an https:// URL.'); process.exit(2); }
const size = fs.statSync(file).size;
const headers = { 'Content-Length': size, 'Content-Type': 'application/octet-stream' };
if (url.hostname.endsWith('.blob.core.windows.net')) headers['x-ms-blob-type'] = 'BlockBlob';

const req = https.request(url, { method: 'PUT', headers }, res => {
  let body = ''; res.on('data', d => { body += d; });
  res.on('end', () => {
    if (res.statusCode >= 200 && res.statusCode < 300) { console.log(`Uploaded ${file} (${size} bytes) to ${url.host}${url.pathname}`); return; }
    console.error(`Upload failed: HTTP ${res.statusCode} ${body.slice(0, 300)}`); process.exitCode = 1;
  });
});
req.on('error', e => { console.error(`Upload failed: ${e.message}`); process.exitCode = 1; });
let sent = 0, shown = 0;
fs.createReadStream(file).on('data', c => { sent += c.length; const pct = Math.floor(sent * 100 / (size || 1)); if (pct >= shown + 10) { shown = pct; process.stdout.write(`${pct}% `); } }).pipe(req);
