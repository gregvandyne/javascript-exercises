// Screenshots of the site in the page's own theme: the marketing pages ("/", /teachers, /teachers/live, /parents) show
// real captures of the app (scripts/how-shots.js, scripts/teach-loop-shots.js), taken once in the light theme and once in
// the dark one. The dark files sit next to the light ones with "-dark" after the name (public/img/how/<slug>-dark-d-1024.webp,
// public/img/teach-loop/<name>-dark.webp).
//
// Which one a page shows follows the theme the reader picked on the site (req.theme), else the device's scheme:
//   'light'  only the light files;
//   'dark'   only the dark files;
//   'auto'   a <source media="(prefers-color-scheme: dark)"> in front of each light one, so the browser picks.
// Every dark <source> carries data-scheme="dark" and its own condition in data-media, so public/js/app.js can retarget it
// at once when the theme is changed on the page (applyTheme), without a reload. A missing dark file only means the light
// one is shown: a page never points at a picture that is not there.
import fs from 'node:fs';
import { esc } from './html.js';

const PUBLIC = new URL('../../public/', import.meta.url);
const exists = new Map();
/** Is this public file there? (read once: pictures ship with the build) */
export const hasFile = rel => { if (!exists.has(rel)) exists.set(rel, fs.existsSync(new URL(rel.replace(/^\//, '').replace(/\?.*$/, ''), PUBLIC))); return exists.get(rel); };

/** 'light', 'dark' (picked on the site) or 'auto' (the device decides). The landing passes its own (dark unless Light). */
export const shotScheme = req => (req && (req.theme === 'light' || req.theme === 'dark') ? req.theme : 'auto');

const join = (a, b) => [a, b].filter(Boolean).join(' and ');
/** The media of a dark <source> for a scheme: base is the source's own condition ('' for none). */
export const darkMedia = (scheme, base = '') => (scheme === 'light' ? 'not all' : (join(scheme === 'auto' ? '(prefers-color-scheme: dark)' : '', base) || 'all'));

/**
 * A <picture>: sources = [{ media, srcset, sizes, type, width, height, dark: srcset of the dark files or '' }] in order,
 * then the <img> (img: { src, srcset, sizes, width, height, alt, cls, lazy, priority, dark: { src, srcset } | null }).
 * With scheme 'dark' the dark files replace the light ones; with 'auto' a dark source goes in front of each light one.
 */
export function themedPicture({ scheme = 'auto', sources = [], img, cls = '' }) {
  const a = (k, v) => (v || v === 0 ? ` ${k}="${esc(String(v))}"` : '');
  const out = [];
  const src = (s, srcset, media, dark) => out.push(`<source${dark ? ` data-scheme="dark" data-media="${esc(s.media || '')}"` : ''}${a('media', media)}${a('type', s.type)}${a('srcset', srcset)}${a('sizes', s.sizes)}${a('width', s.width)}${a('height', s.height)}>`);
  for (const s of sources) {
    // The dark one first, so it wins whenever its media matches; the light one stays after it for the other themes.
    if (s.dark) src(s, s.dark, darkMedia(scheme, s.media || ''), true);
    src(s, s.srcset, s.media, false);
  }
  // The <img> itself: its own dark files become one more dark <source> (no media of their own).
  if (img.dark) src({ sizes: img.sizes, type: img.type, width: img.width, height: img.height }, img.dark.srcset || img.dark.src, darkMedia(scheme, ''), true);
  const im = `<img${a('class', img.cls)}${a('src', img.src)}${a('width', img.width)}${a('height', img.height)}${a('srcset', img.srcset)}${a('sizes', img.sizes)} alt="${esc(img.alt || '')}"${img.lazy ? ' loading="lazy"' : ''}${img.priority ? ' fetchpriority="high"' : ''} decoding="async">`;
  return `<picture${cls ? ` class="${esc(cls)}"` : ''}>${out.join('')}${im}</picture>`;
}
