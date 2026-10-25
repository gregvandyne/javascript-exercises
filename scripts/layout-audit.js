// Layout audit: crawls the site as different people and reports boxes (panels, cards, buttons) that touch.
//
//   BASE=http://localhost:3000 \
//   AUDIT_USERS="guest,student:DemoStudent:pass,teacher:DemoTeacher:pass,admin:admin:pass" \
//   node scripts/layout-audit.js [out.json]
//
// Options (env): SIZES="390x844,820x1180,1280x860"  SCHEMES="dark,light"  LANG=en  MAX_PAGES=60  OPEN_DETAILS=1
// Follows same-site links from a few starting pages, keeps two pages per URL pattern, checks each page at every size
// and colour scheme (and again with every <details> opened when OPEN_DETAILS=1). Exit code 1 when anything touches.
import fs from 'node:fs';
import { chromium } from '@playwright/test';
import { findTouching } from '../tests/e2e/touching.js';

const BASE = (process.env.BASE || 'http://localhost:3000').replace(/\/$/, '');
const USERS = (process.env.AUDIT_USERS || 'guest').split(',').map(s => { const [role, username, password] = s.split(':'); return { role, username, password }; });
const SIZES = (process.env.SIZES || '390x844,820x1180,1280x860').split(',').map(s => { const [width, height] = s.split('x').map(Number); return { width, height }; });
const SCHEMES = (process.env.SCHEMES || 'dark,light').split(',');
const LANG = process.env.LANG_CODE || 'en';
const MAX = +(process.env.MAX_PAGES || 60);
const OPEN = process.env.OPEN_DETAILS !== '0';
const SEEDS = ['/', '/search?q=a', '/me', '/classes', '/teach', '/teach/lessons', '/build', '/friends', '/chat', '/favorites', '/admin', '/admin/stats', '/admin/schools', '/safety', '/parents', '/sdk', '/login', '/signup'];
const SKIP = /^\/(api|play|frame|cards|shots|avatars|uploads|sdk\.js|js|css|img|fonts|health)(\/|$)|\/logout/;
const exe = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

const pattern = u => {
  const url = new URL(u, BASE);
  const segs = url.pathname.split('/').map((s, i, all) => (i === 2 && /^(g|u|school)$/.test(all[1]) ? ':slug' : /^(?=.*\d)[A-Za-z0-9_-]{6,}$|^[A-Za-z0-9_-]{10}$/.test(s) ? ':id' : s));
  const keys = [...url.searchParams.keys()].sort().join('&');
  return segs.join('/') + (keys ? `?${keys}` : '');
};

async function login(page, { username, password }) {
  await page.goto(`${BASE}/login?lang=${LANG}`);
  await page.fill('#username', username); await page.fill('#password', password);
  await Promise.all([page.waitForURL(u => !u.pathname.startsWith('/login')), page.click('button[type=submit]')]);
}

async function crawl(browser, user) {
  const ctx = await browser.newContext({ viewport: SIZES[0] });
  const page = await ctx.newPage();
  if (user.role !== 'guest') await login(page, user); else await page.goto(`${BASE}/?lang=${LANG}`);
  user.state = await ctx.storageState();
  const seen = new Map(), queue = SEEDS.map(s => BASE + s), pages = [];
  while (queue.length && pages.length < MAX) {
    const url = queue.shift();
    const key = pattern(url);
    if ((seen.get(key) || 0) >= 2) continue;
    let res; try { res = await page.goto(url, { waitUntil: 'domcontentloaded' }); } catch { continue; }
    const final = page.url();
    if (!res || res.status() >= 400 || !final.startsWith(BASE) || pattern(final) !== key && (seen.get(pattern(final)) || 0) >= 2) continue;
    seen.set(key, (seen.get(key) || 0) + 1);
    pages.push(final.slice(BASE.length) || '/');
    const links = await page.$$eval('a[href]', as => as.map(a => a.href));
    for (const l of links) {
      if (!l.startsWith(BASE)) continue;
      const path = l.slice(BASE.length).split('#')[0];
      if (!path || SKIP.test(path) || /[?&]lang=/.test(path)) continue; // language links would change the account's language
      if ((seen.get(pattern(l)) || 0) < 2) queue.push(BASE + path);
    }
  }
  await ctx.close();
  return [...new Set(pages)];
}

const launch = () => chromium.launch(fs.existsSync(exe) ? { executablePath: exe } : {});

async function check(user, paths) {
  const found = [];
  for (const scheme of SCHEMES) {
    for (const size of SIZES) {
      // A fresh browser for each pass keeps memory low; a crashed page restarts the pass from the next page.
      let browser = await launch(), page = null, i = 0;
      const open = async () => {
        const ctx = await browser.newContext({ viewport: size, colorScheme: scheme, hasTouch: size.width < 800, storageState: user.state });
        page = await ctx.newPage();
      };
      await open();
      for (; i < paths.length; i++) {
        const p = paths[i];
        try {
          await page.goto(BASE + p, { waitUntil: 'load', timeout: 20000 });
          await page.waitForTimeout(250);
          const states = [['closed', null]];
          if (OPEN) states.push(['open', () => page.evaluate(() => document.querySelectorAll('details:not(.inline-menu):not(.langpick):not(.themepick)').forEach(d => { d.open = true; }))]);
          for (const [state, prep] of states) {
            if (prep) { await prep(); await page.waitForTimeout(100); }
            for (const t of await findTouching(page)) found.push({ role: user.role, path: p, pattern: pattern(BASE + p), size: `${size.width}`, scheme, state, ...t });
          }
        } catch (e) {
          console.error(`skipped ${user.role} ${p} ${size.width}/${scheme}: ${String(e.message).split('\n')[0]}`);
          if (!browser.isConnected()) { browser = await launch(); }
          try { await page.context().close(); } catch { /* gone */ }
          await open();
        }
      }
      await browser.close();
    }
  }
  return found;
}

const results = [];
for (const u of USERS) {
  const browser = await launch(); const paths = await crawl(browser, u); await browser.close();
  console.error(`${u.role}: ${paths.length} pages`);
  results.push({ user: u.role, paths, found: await check(u, paths) });
}
const all = results.flatMap(r => r.found);
// Group identical problems (same page pattern and same pair of boxes) across sizes and schemes.
const groups = new Map();
for (const f of all) {
  const k = `${f.pattern} | ${f.a.replace(/ ".*$/, '')} | ${f.b.replace(/ ".*$/, '')} | ${f.dir}`;
  const g = groups.get(k) || { key: k, pattern: f.pattern, a: f.a, b: f.b, dir: f.dir, gap: f.gap, where: new Set(), roles: new Set(), example: f.path };
  g.where.add(`${f.size}/${f.scheme}/${f.state}`); g.roles.add(f.role); groups.set(k, g);
}
const summary = [...groups.values()].map(g => ({ ...g, where: [...g.where].sort(), roles: [...g.roles] }));
const out = process.argv[2];
if (out) fs.writeFileSync(out, JSON.stringify({ pages: Object.fromEntries(results.map(r => [r.user, r.paths])), problems: summary }, null, 2));
for (const g of summary) console.log(`${g.example}  [${g.dir} ${g.gap}px]  ${g.a}  ⟷  ${g.b}  (${g.where.length} views)`);
console.log(`\n${summary.length} distinct touching pairs on ${results.reduce((n, r) => n + r.paths.length, 0)} pages`);
process.exit(summary.length ? 1 : 0);
