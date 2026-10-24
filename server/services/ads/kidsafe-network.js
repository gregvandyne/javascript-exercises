// Adapter point for a future kid-safe ad network (Money node). NOT CONNECTED: it returns no ads,
// so pickAd() falls back to the house provider. Enable with BRB_AD_PROVIDER=kidsafe-network
// once a partner is signed and this file is implemented.
//
// Rules any network adapter must follow (see docs/brief §8):
//  1. Server-side only. The browser never loads a partner script, iframe, pixel or image URL.
//     Creatives are fetched here on a timer, reviewed, and cached; images are inlined or proxied
//     through our own origin (the site CSP blocks third-party hosts anyway).
//  2. Contextual only. The only targeting input is { placement, category }. Never pass user ids,
//     sessions, IPs, ages, history or device data to the partner.
//  3. Clicks go to an internal URL first (e.g. /go/ad/<id>) which shows a "You are leaving Magic Cup
//     Gaming — ask a grown-up" page before any external link. Not built yet; house ads are internal.
//  4. Only partners certified for children (COPPA / GDPR-K, e.g. a kidSAFE-listed network) and
//     only creatives that are static: no animation, sound, countdowns, or "you won" bait.
//  5. Impressions are still counted by OUR beacon (public/js/ads.js) and ledger; reconcile with the
//     partner's reporting monthly and set AD_ECPM_CENTS to the real rate.
//
// Interface (same as the house provider; must be synchronous, so serve from a warm cache):
//   list({ placement, category }) -> Ad[]   get(id) -> Ad | null
//   Ad = { id, title, text, icon, href, categories: string[], placements: string[] }

const cache = []; // TODO: fill from the partner API on a timer (services/jobs.js register()), after review.

export const kidsafeNetwork = {
  name: 'kidsafe-network',
  list() { return cache.slice(); },
  get(id) { return cache.find(a => a.id === id) || null; },
  // TODO: async refresh() { const res = await fetch(PARTNER_URL, { headers: { Authorization: `Bearer ${process.env.KIDSAFE_AD_KEY}` } }); ... }
};
