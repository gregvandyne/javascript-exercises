// A small static server for Grammar Lab's art (public/js/grammar-lab-art.js): the site's public folder, plus a preview
// page at /preview (?theme=dark for the dark palette) that shows every picture and plays all four animations next to
// a lesson's submit button. Used by tests/unit/grammar-lab-art-browser.test.js and by the dev preview
// (node tests/unit/_grammar-lab-art-page.js [port], then open /preview). No database, no app.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PUB = path.join(ROOT, 'public');
const TYPES = { '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };
export const PICTURES = ['k-2-cover', '3-5-cover', '6-8-cover', '9-12-cover', 'mascot', 'doorway', 'mastery-stars', 'double-tap-tip', 'card'];

export const previewHtml = (theme = 'light') => `<!doctype html><html lang="en"${theme === 'dark' ? ' data-theme="dark"' : ''}><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Grammar Lab art</title>
<link rel="stylesheet" href="/css/app.css"><link rel="stylesheet" href="/css/grammar-lab-art.css">
<style>body{background:var(--bg);color:var(--text);font-family:var(--font);margin:0}main{max-width:1100px;margin:0 auto;padding:16px}
h1{font-size:28px;margin:8px 0 4px}h2{font-size:20px;margin:28px 0 10px}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,300px),1fr));gap:16px}
figure{margin:0}figcaption{font-size:14px;color:var(--muted);margin-top:6px}.anim{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,320px),1fr));gap:20px}
.slot{background:var(--card);border-radius:var(--r);padding:14px;box-shadow:var(--shadow)}.lesson{display:flex;gap:10px;align-items:center;margin-top:12px}</style></head>
<body><main><h1>Grammar Lab art</h1><p style="color:var(--muted);margin:0">Preview only. Pictures, then the four animations.</p>
<h2>Pictures (files)</h2><div class="grid">${PICTURES.map(p => `<figure><img class="gla-pic" data-pic="${p}" src="/img/grammar-lab/${p}.svg" alt="${p}"><figcaption>${p}.svg</figcaption></figure>`).join('')}</div>
<h2>Pictures (inline, themed)</h2><div class="grid" id="inline"></div>
<h2>Animations</h2><div class="anim">
${['greeting', 'welcome', 'mastery', 'tapTip'].map(k => `<section class="slot" data-slot="${k}"><b>${k}</b><div class="gl-stage" id="stage-${k}"></div>
<div class="lesson"><input aria-label="answer" style="flex:1;min-width:0;min-height:40px"><button class="btn btn-primary" data-submit="${k}" type="button">Submit</button></div></section>`).join('')}
</div></main><script type="module" src="/preview.js"></script></body></html>`;

const PREVIEW_JS = `import * as A from '/js/grammar-lab-art.js';
const inline = document.getElementById('inline');
for (const [name, f] of Object.entries(A.FILES)) { const d = document.createElement('figure'); d.innerHTML = '<div class="gla">' + f() + '</div><figcaption>' + name + ' (inline)</figcaption>'; inline.appendChild(d); }
window.__gla = { A, ctl: {} , clicks: 0 };
document.querySelectorAll('[data-submit]').forEach(b => b.addEventListener('click', () => { window.__gla.clicks++; }));
if (!new URLSearchParams(location.search).has('manual')) for (const k of ['greeting', 'welcome', 'mastery', 'tapTip']) window.__gla.ctl[k] = A.mounts[k](document.getElementById('stage-' + k));
`;

export function serve(port = 0) {
  const srv = http.createServer((q, r) => {
    const u = new URL(q.url, 'http://x');
    if (u.pathname === '/preview' || u.pathname === '/') { r.setHeader('Content-Type', 'text/html; charset=utf-8'); return r.end(previewHtml(u.searchParams.get('theme') || 'light')); }
    if (u.pathname === '/preview.js') { r.setHeader('Content-Type', 'text/javascript'); return r.end(PREVIEW_JS); }
    const f = path.join(PUB, path.normalize(decodeURIComponent(u.pathname)).replace(/^([/\\])+/, ''));
    if (!f.startsWith(PUB) || !fs.existsSync(f) || !fs.statSync(f).isFile()) { r.statusCode = 404; return r.end(); }
    r.setHeader('Content-Type', TYPES[path.extname(f)] || 'application/octet-stream');
    r.end(fs.readFileSync(f));
  });
  return new Promise(res => srv.listen(port, '127.0.0.1', () => res({ srv, url: `http://127.0.0.1:${srv.address().port}` })));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { url } = await serve(+(process.argv[2] || 4377));
  console.log(`Grammar Lab art preview: ${url}/preview  (dark: ${url}/preview?theme=dark)`);
}
