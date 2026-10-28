// Search engines: what may be indexed, in which languages, and what a shared link shows.
//
// Default: NOT indexed. layout() writes <meta name="robots" content="noindex"> unless a route passes seo: { index: true,
// path, … }, and privateNoindex() adds an X-Robots-Tag: noindex, nofollow header to every private area (profiles,
// Studio, classes, schools, families, sign-in, search, play, pictures of players and kids' games). So a new page can
// never be indexed by accident, and children's profiles, names, unpublished games and chats never are.
// Indexed: the home page, /teachers, the /learn/* subject pages, official launch games (/g/<slug> with source='seed'),
// /safety, /parents, the legal pages, /sdk/, and the plans pages once paid plans are public.
//
// Languages: the site picks a language from ?lang=, the cookie, the account, then Accept-Language. A search engine has
// none of those, so public pages also answer at /<code>/<path> (/es/teachers, /zh-hant/g/sum-racer): pathLocale()
// serves that page in that language for that one request and writes no cookie. hreflang and the sitemap list only the
// languages a page is really written in (its text in that locale file, or a game's own translation); any other language
// address has a canonical to the English page and is not indexed.
import { config } from './config.js';
import { CODES, DEFAULT_LOCALE, availableCodes, localeInfo, tFor, dictionary } from './i18n/index.js';
import { esc } from './views/html.js';
import { BRAND } from './views/brand.js';
import { HUBS } from './learn.js';

export const OG_W = 1200, OG_H = 630;
/** Kids aged 8 to 14 (docs/decisions.md): the site's audience, in structured data. */
export const AGE = { min: 8, max: 14 };

/** The site's address: PUBLIC_URL, else this request's scheme and host (tests, a server without PUBLIC_URL). */
export const origin = req => config.publicUrl || `${req.protocol}://${req.get('host')}`;
export const abs = (req, p) => origin(req) + p;

// ---------------------------------------------------------------------------------------------------- language URLs
/** The address segment of a language: en-GB -> 'en-gb', zh-Hant -> 'zh-hant'. */
export const segOf = code => code.toLowerCase();
const BY_SEG = new Map(CODES.map(c => [segOf(c), c]));
const HUB_RE = HUBS.map(h => h.slug).join('|');
/** Pages that have an address per language. */
const LOCALIZED = new RegExp(`^/(?:|teachers|learn/(?:${HUB_RE})|g/[a-z0-9-]+|safety|parents)$`);
export const localizable = p => LOCALIZED.test(p);
/** '/teachers' in a language: English is the plain address (and x-default), others get /<code> in front. */
export const localeUrl = (path, code) => (code === DEFAULT_LOCALE ? path : `/${segOf(code)}${path === '/' ? '' : path}`);

/**
 * Before the i18n middleware: /es/teachers is /teachers in Spanish (req.pathLocale), for languages ready to offer and
 * pages in LOCALIZED only. Anything else under a language-looking first segment is left alone (the usual 404). A
 * trailing slash on one of these pages answers 301 to the address without it, so each page has one address.
 */
export function pathLocale(req, res, next) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return next();
  const p = req.path; const qs = req.url.slice(req.path.length);
  const m = /^\/([a-z]{2}(?:-[a-z]{2,4})?)(\/.*)?$/.exec(p);
  const code = m && BY_SEG.get(m[1]);
  if (code && code !== DEFAULT_LOCALE && availableCodes().includes(code)) {
    const rest = m[2] || '/';
    const bare = rest.length > 1 ? rest.replace(/\/+$/, '') : rest;
    if (localizable(bare)) {
      if (bare !== rest || m[2] === '/') return res.redirect(301, localeUrl(bare, code) + qs);   // /fr/ -> /fr
      req.pathLocale = code; req.url = rest + qs;
      return next();
    }
  }
  if (p.length > 1 && p.endsWith('/') && localizable(p.replace(/\/+$/, ''))) return res.redirect(301, p.replace(/\/+$/, '') + qs);
  next();
}

/** The languages a page is written in, as offered now, in picker order. English always. */
export function pageLangs(langs = []) {
  const want = new Set([DEFAULT_LOCALE, ...langs]);
  const ok = new Set(availableCodes());
  return CODES.filter(c => want.has(c) && ok.has(c));
}
/** Languages whose locale file has its own text for key (the page's main heading stands for the page). en-GB only lists
 *  its differences from English, so it counts only where it has the key itself (else its page is the English one). */
export const langsWithKey = key => CODES.filter(c => c === DEFAULT_LOCALE || (c === 'en-GB' ? !!dictionary(c)[key] : tFor(c).own(key)));

// ---------------------------------------------------------------------------------------------------- private areas
/** Never indexed, whatever the page says: profiles, the Studio, accounts, classes, schools, families, sign-in, search,
 *  play pages, game frames, APIs and pictures of players and of games. Search engines still crawl them to read this. */
export const PRIVATE_RE = /^\/(u|studio|build|me|favorites|friends|chat|family|grown-ups|class|classes|teach|school|cards|admin|join|login|signup|auth|google-setup|search|play|frame|api|shots|avatars)(\/|$)/i;
export function privateNoindex(req, res, next) {
  if (PRIVATE_RE.test(req.path)) res.set('X-Robots-Tag', 'noindex, nofollow');
  next();
}
/** Search-engine and link-preview robots (no guest account is made for them on /play). */
export const isBot = ua => /bot\b|bot\/|crawler|spider|slurp|facebookexternalhit|embedly|preview|whatsapp|bingpreview|lighthouse/i.test(String(ua || ''));

// ---------------------------------------------------------------------------------------------------- <head>
const OG_LOCALE = { en: 'en_US', 'en-GB': 'en_GB', pt: 'pt_BR', fr: 'fr_FR', es: 'es_ES', de: 'de_DE', he: 'he_IL', ja: 'ja_JP', ar: 'ar_AR', ru: 'ru_RU', it: 'it_IT', 'zh-Hant': 'zh_TW', nl: 'nl_NL' };
/** A JSON-LD block. A data block, never run, so the CSP's script-src 'self' is untouched; "<" is escaped so no text can
 *  close the element. */
export const ldScript = data => `<script type="application/ld+json">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>`;
/** Trim to at most n characters at a word boundary (meta descriptions). */
export function clip(s, n = 155) {
  s = String(s || '').replace(/\s+/g, ' ').trim();
  if (s.length <= n) return s;
  const cut = s.slice(0, n - 1); const at = cut.lastIndexOf(' ');
  return (at > n * 0.6 ? cut.slice(0, at) : cut).replace(/[\s,;:.–—-]+$/, '') + '…';
}

/**
 * The search and sharing tags for layout(). seo: { index, path, langs, image, imageAlt, type, jsonld: [objects] }.
 * Not indexable (no seo, or index false): only the robots meta. Indexable: robots, canonical, hreflang (only with more
 * than one written language), Open Graph, Twitter card and JSON-LD.
 */
export function seoHead(req, seo, { title, description }) {
  if (!seo || !seo.index) return `<meta name="robots" content="${seo && seo.robots ? esc(seo.robots) : 'noindex'}">`;
  const loc = req.locale || DEFAULT_LOCALE;
  // A page without language addresses (the legal pages, /sdk/) is English only: no hreflang.
  const langs = localizable(seo.path) ? pageLangs(seo.langs) : [DEFAULT_LOCALE];
  const own = langs.includes(loc);
  const canonical = abs(req, localeUrl(seo.path, own ? loc : DEFAULT_LOCALE));
  const image = abs(req, seo.image || '/og/site.jpg');
  const out = [
    `<meta name="robots" content="${own ? 'index, follow, max-image-preview:large' : 'noindex, follow'}">`,
    `<link rel="canonical" href="${esc(canonical)}">`,
  ];
  if (langs.length > 1) {
    for (const c of langs) out.push(`<link rel="alternate" hreflang="${c}" href="${esc(abs(req, localeUrl(seo.path, c)))}">`);
    out.push(`<link rel="alternate" hreflang="x-default" href="${esc(abs(req, seo.path))}">`);
  }
  const shown = own ? loc : DEFAULT_LOCALE;
  out.push(
    `<meta property="og:site_name" content="${BRAND}">`,
    `<meta property="og:type" content="${esc(seo.type || 'website')}">`,
    `<meta property="og:title" content="${esc(title)}">`,
    `<meta property="og:description" content="${esc(description)}">`,
    `<meta property="og:url" content="${esc(canonical)}">`,
    `<meta property="og:image" content="${esc(image)}">`,
    // The size only for the share pictures made at that size (scripts/og-images.js).
    ...(String(seo.image || '/og/').startsWith('/og/') ? [`<meta property="og:image:width" content="${OG_W}">`, `<meta property="og:image:height" content="${OG_H}">`] : []),
    `<meta property="og:image:alt" content="${esc(seo.imageAlt || title)}">`,
    `<meta property="og:locale" content="${OG_LOCALE[shown] || 'en_US'}">`,
    ...langs.filter(c => c !== shown && OG_LOCALE[c] !== OG_LOCALE[shown]).map(c => `<meta property="og:locale:alternate" content="${OG_LOCALE[c]}">`),
    '<meta name="twitter:card" content="summary_large_image">',
    `<meta name="twitter:title" content="${esc(title)}">`,
    `<meta name="twitter:description" content="${esc(description)}">`,
    `<meta name="twitter:image" content="${esc(image)}">`,
    `<meta name="twitter:image:alt" content="${esc(seo.imageAlt || title)}">`,
  );
  for (const d of seo.jsonld || []) out.push(ldScript(d));
  return out.join('\n');
}

// ---------------------------------------------------------------------------------------------------- structured data
export const orgId = req => abs(req, '/#organization');
export function organizationLd(req) {
  return {
    '@type': 'Organization', '@id': orgId(req), name: BRAND, url: abs(req, '/'),
    logo: { '@type': 'ImageObject', url: abs(req, '/icons/icon-512.png'), width: 512, height: 512 },
    ...(config.contactEmail ? { email: config.contactEmail } : {}),
  };
}
export function websiteLd(req, lang) {
  return {
    '@type': 'WebSite', '@id': abs(req, '/#website'), name: BRAND, url: abs(req, '/'), inLanguage: localeInfo(lang).code,
    publisher: { '@id': orgId(req) },
    potentialAction: { '@type': 'SearchAction', target: { '@type': 'EntryPoint', urlTemplate: abs(req, '/search?q={search_term_string}') }, 'query-input': 'required name=search_term_string' },
  };
}
/** items: [[name, path], …] from the home page down to this page. */
export function breadcrumbLd(req, items) {
  return { '@type': 'BreadcrumbList', itemListElement: items.map(([name, p], i) => ({ '@type': 'ListItem', position: i + 1, name, item: abs(req, p) })) };
}
/** pairs: [[question, answer as plain text], …] */
export function faqLd(pairs) {
  return { '@type': 'FAQPage', mainEntity: pairs.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) };
}
export const audienceLd = () => [
  { '@type': 'PeopleAudience', suggestedMinAge: AGE.min, suggestedMaxAge: AGE.max },
  { '@type': 'EducationalAudience', educationalRole: 'student' },
];
/** Several objects as one JSON-LD graph. */
export const graph = items => ({ '@context': 'https://schema.org', '@graph': items.filter(Boolean) });
/** Text without markup, for structured data and meta tags built from translations that hold a link. */
export const plainText = s => String(s || '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
