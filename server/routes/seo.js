// /robots.txt and /sitemap.xml (server/seo.js has the rules). Registered before the session: no cookie, no database
// write, the same answer for everyone.
//
// The sitemap lists only what may be indexed: the home page, /teachers, the /learn/* subject and age pages, the official launch games
// that are live and public (visibleWhere(null), source='seed', owned by the official account), /safety, /parents and
// its guides, the legal pages, /sdk/ and, once paid plans are public, /plans. Never a profile, a class, or a game a child made.
import { Router } from 'express';
import { config } from '../config.js';
import { q } from '../db.js';
import { visibleWhere } from '../services/games.js';
import { OFFICIAL } from '../auth.js';
import { esc } from '../views/html.js';
import { HUBS, AGES, PARENT_GUIDES, CONTENT_UPDATED } from '../learn.js';
import { LEGAL_UPDATED } from './info.js';
import { billingOn } from '../services/stripe.js';
import { legacyHosts, hostOnly } from '../site.js';
import { state as domainState } from '../domain.js';
import { abs, origin, localeUrl, localizable, pageLangs, langsWithKey } from '../seo.js';

export const router = Router();

/** Paths no search engine needs: APIs, game frames, play pages (they make a guest), sign-in hand-offs, the Studio, chat,
 *  search results and the language and theme switches. Private pages that ARE crawlable (profiles, classes, schools)
 *  are not listed: a disallowed page can't be read, so its noindex would never be seen (server/seo.js PRIVATE_RE). */
export const DISALLOW = ['/api/', '/go/', '/signup/for/', '/frame/', '/play/', '/auth/', '/studio/', '/build', '/chat', '/search', '/*?lang=', '/*&lang=', '/*?theme=', '/*&theme='];
const onOldHost = req => !!config.publicUrl && legacyHosts().has(hostOnly(req.headers.host));

router.get('/robots.txt', (req, res) => {
  const lines = ['User-agent: *'];
  // An old address (magic-cup.onrender.com, www.): crawlable, so search engines see its pages move to PUBLIC_URL.
  if (!onOldHost(req)) lines.push(...DISALLOW.map(p => `Disallow: ${p}`));
  lines.push('Allow: /', '', `Sitemap: ${origin(req)}/sitemap.xml`, '');
  res.set({ 'Cache-Control': 'public, max-age=3600', 'X-Robots-Tag': 'noindex' }).type('text/plain; charset=utf-8').send(lines.join('\n'));
});

const day = ms => new Date(ms).toISOString().slice(0, 10);
/** Official launch games that anyone may open now, most played first. */
export const launchGames = () => q.all(`SELECT g.slug, g.l10n, g.updated_at, g.published_at FROM games g JOIN users u ON u.id=g.owner_id
  WHERE ${visibleWhere(null).sql} AND g.source='seed' AND u.username=? ORDER BY g.featured DESC, g.plays DESC, g.slug`, ...visibleWhere(null).params, OFFICIAL);

/** Every indexable page: { path, langs, lastmod, images }. */
export function sitemapEntries() {
  const list = launchGames();
  const newest = list.reduce((m, g) => Math.max(m, g.updated_at || 0, g.published_at || 0), 0);
  const out = [
    { path: '/', langs: langsWithKey('home.intro.heading'), lastmod: newest ? day(newest) : null, images: ['/og/site.jpg'] },
    { path: '/teachers', langs: langsWithKey('teachers.h1'), lastmod: CONTENT_UPDATED, images: ['/og/teachers.jpg'] },
    { path: '/learn', langs: langsWithKey('learn.index.h1'), lastmod: CONTENT_UPDATED },
    ...HUBS.map(h => ({ path: `/learn/${h.slug}`, langs: langsWithKey(`learn.hubs.${h.key}.h1`), lastmod: CONTENT_UPDATED })),
    ...list.map(g => {
      let l10n = {}; try { l10n = JSON.parse(g.l10n || '{}') || {}; } catch { /* none */ }
      return { path: `/g/${g.slug}`, langs: Object.keys(l10n), lastmod: day(Math.max(g.updated_at || 0, g.published_at || 0)), images: [`/covers/${g.slug}.jpg`] };
    }),
    { path: '/safety', langs: langsWithKey('info.safety.heading') },
    { path: '/parents', langs: langsWithKey('parents.h1'), lastmod: CONTENT_UPDATED, images: ['/og/parents.jpg'] },
    ...PARENT_GUIDES.map(g => ({ path: `/parents/${g.slug}`, langs: langsWithKey(`parents.${g.key}.h1`), lastmod: CONTENT_UPDATED, images: [`/og/parents-${g.slug}.jpg`] })),
    ...AGES.map(a => ({ path: `/learn/${a.slug}`, langs: langsWithKey(`learn.ages.${a.key}.h1`), lastmod: CONTENT_UPDATED, images: [`/og/ages-${a.min}-${a.max}.jpg`] })),
    { path: '/privacy', lastmod: LEGAL_UPDATED }, { path: '/terms', lastmod: LEGAL_UPDATED }, { path: '/refunds', lastmod: LEGAL_UPDATED },
    { path: '/sdk/' },
    ...(billingOn() && config.billingPublic ? [{ path: '/plans' }, { path: '/plans/schools' }] : []),
  ];
  return out;
}

export function sitemapXml(req) {
  const urls = [];
  for (const e of sitemapEntries()) {
    const langs = localizable(e.path) ? pageLangs(e.langs) : ['en'];
    const alts = langs.length > 1 ? [...langs.map(c => [c, localeUrl(e.path, c)]), ['x-default', e.path]] : [];
    for (const c of langs) {
      urls.push(['<url>', `<loc>${esc(abs(req, localeUrl(e.path, c)))}</loc>`, e.lastmod ? `<lastmod>${e.lastmod}</lastmod>` : '',
        ...alts.map(([h, p]) => `<xhtml:link rel="alternate" hreflang="${h}" href="${esc(abs(req, p))}"/>`),
        ...(e.images || []).map(i => `<image:image><image:loc>${esc(abs(req, i))}</image:loc></image:image>`),
        '</url>'].filter(Boolean).join(''));
    }
  }
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n${urls.join('\n')}\n</urlset>\n`;
}

router.get('/sitemap.xml', (req, res) => {
  // The old addresses send search engines to the sitemap on PUBLIC_URL once it reaches this server.
  if (onOldHost(req) && domainState.ready) return res.redirect(301, `${config.publicUrl}/sitemap.xml`);
  res.set({ 'Cache-Control': 'public, max-age=3600', 'X-Robots-Tag': 'noindex' }).type('application/xml; charset=utf-8').send(sitemapXml(req));
});
