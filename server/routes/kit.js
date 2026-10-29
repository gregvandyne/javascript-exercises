// The Oomba Kit preview (/kit): the kit's scenes running through the real game frame (frameDocument + sendFrame: the
// same wrapper, sandbox and CSP as /frame/<token>). Admins only, or everyone with KIT_PREVIEW=1. See docs/kit.md.
import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../config.js';
import { frameDocument, sendFrame, frameOrigins, SANDBOX } from '../services/frame.js';
import { kitTag } from '../services/kit.js';
import { esc } from '../views/html.js';

export const router = Router();
const DEMO_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../kit/demo');
const SCENES = ['meadow', 'gallery', 'core'];
const TABS = ['chars', 'props', 'icons', 'biomes', 'screens'];
const LANGS = ['en', 'ar', 'he', 'ja', 'ru', 'fr', 'es', 'de', 'it', 'pt', 'nl', 'zh-Hant', 'en-GB'];
const allowed = req => config.kitPreview || (req.user && req.user.role === 'admin');
const pick = (v, list, d) => (list.includes(v) ? v : d);
/** A kit scene file with the pinned kit tag put in. */
export function sceneHtml(name) { return fs.readFileSync(path.join(DEMO_DIR, `${name}.html`), 'utf8').replace('<!--KIT-->', kitTag()); }

router.get('/kit', (req, res) => {
  if (!allowed(req)) return res.status(404).send('Not found');
  const q = { scene: pick(req.query.scene, SCENES, 'meadow'), backend: pick(req.query.backend, ['auto', 'paper', 'glaze'], 'auto'), tier: pick(req.query.tier, ['', 'low', 'mid', 'high'], ''), theme: pick(req.query.mode, ['light', 'dark'], 'light'), lang: pick(req.query.l, LANGS, 'en'), tab: pick(req.query.tab, TABS, '') };
  const qs = o => '?' + new URLSearchParams(Object.entries({ ...q, ...o }).filter(([, v]) => v).map(([k, v]) => [{ theme: 'mode', lang: 'l' }[k] || k, v])).toString();
  // ?l= and ?mode= (not ?lang= / ?theme=: the site middleware treats those as the visitor's own choice and redirects).
  const src = `/kit/frame/${q.scene}?okDebug=1&okBackend=${q.backend}${q.tier ? '&okTier=' + q.tier : ''}&mode=${q.theme}&l=${encodeURIComponent(q.lang)}${q.tab ? '&tab=' + q.tab : ''}`;
  const opt = (k, vals) => vals.map(v => `<a href="${esc(qs({ [k]: v }))}"${q[k] === v ? ' aria-current="true"' : ''}>${esc(v || 'auto')}</a>`).join(' ');
  res.set('Cache-Control', 'no-store').type('html').send(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Oomba Kit preview</title>
<style>body{margin:0;font-family:system-ui,sans-serif;background:#F4F1E6;color:#141414}header{padding:12px 16px;display:flex;flex-wrap:wrap;gap:8px 20px;align-items:center}
h1{font-size:18px;margin:0}nav{display:flex;gap:6px;align-items:center;font-size:14px}nav b{font-weight:600}a{color:#14744A}a[aria-current]{font-weight:800;color:#141414;text-decoration:none;border-bottom:3px solid #66C792}
iframe{display:block;width:100%;height:calc(100vh - 110px);min-height:420px;border:0;background:#141414}</style></head><body>
<header><h1>Oomba Kit ${esc(kitTag().match(/\d+\.\d+\.\d+/)[0])}</h1>
<nav><b>Scene</b> ${opt('scene', SCENES)}</nav><nav><b>Graphics</b> ${opt('backend', ['auto', 'paper', 'glaze'])}</nav><nav><b>Tier</b> ${opt('tier', ['', 'low', 'mid', 'high'])}</nav>
<nav><b>Theme</b> ${opt('theme', ['light', 'dark'])}</nav><nav><b>Language</b> ${opt('lang', LANGS)}</nav></header>
<iframe id="kitframe" title="Oomba Kit scene" sandbox="${SANDBOX}" allow="autoplay" referrerpolicy="no-referrer" src="${esc(src)}"></iframe></body></html>`);
});

router.get('/kit/frame/:scene', (req, res) => {
  if (!allowed(req) || !SCENES.includes(req.params.scene)) return res.status(404).type('text').send('Not found');
  const lang = pick(req.query.l, LANGS, 'en');
  const theme = pick(req.query.mode, ['light', 'dark'], req.theme === 'dark' ? 'dark' : 'light');
  const init = {
    user: { displayName: req.user ? req.user.display_name : 'Player', avatar: req.user ? req.user.avatar : '🙂', isGuest: !req.user, lang, dir: lang === 'ar' || lang === 'he' ? 'rtl' : 'ltr' },
    game: { id: 'kit-' + req.params.scene, title: 'Oomba Kit' }, save: {}, canSave: false, preview: true, theme,
  };
  sendFrame(res, frameDocument(sceneHtml(req.params.scene), init), frameOrigins(req));
});
