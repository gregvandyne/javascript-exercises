#!/usr/bin/env node
// Packet Post strings: every English string the game shows, listed into scripts/data/cs-quest/packet-post/en.json for
// the CS Quest language packs (scripts/cs-quest-i18n.mjs). Chrome strings are the tr('...') keys in the game script;
// level prose (learn cards, intros, hints, checks, place names, tiles, rules, events) comes from window.PacketPostLevels.
//
//   node scripts/packet-post-strings.mjs          writes en.json (and says how many chrome / level strings there are)
//   node scripts/packet-post-strings.mjs --check  exits 1 when en.json is out of date
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const GAME = path.join(ROOT, 'seed-games/packet-post.html');
export const EN = path.join(ROOT, 'scripts/data/cs-quest/packet-post/en.json');

/** Loads the engine and the levels from the game file (the classic scripts, no DOM needed). */
export function loadData(html = fs.readFileSync(GAME, 'utf8')) {
  const ctx = vm.createContext({});
  for (const m of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) vm.runInContext(m[1], ctx);
  return { E: ctx.PacketPost, D: ctx.PacketPostLevels, I18N: ctx.PacketPostI18n };
}

/** { chrome: [...], prose: [...] }: the tr('...') keys of the game script, then the level text, each list in order of first use. */
export function collect(html = fs.readFileSync(GAME, 'utf8')) {
  const { D } = loadData(html);
  const chrome = new Set(), prose = new Set();
  const mod = html.slice(html.indexOf('<script type="module">'));
  for (const m of mod.matchAll(/\btr\(\s*'((?:\\.|[^'\\])*)'/g)) chrome.add(m[1].replace(/\\'/g, "'"));
  for (const m of mod.matchAll(/\btr\(\s*"((?:\\.|[^"\\])*)"/g)) chrome.add(m[1].replace(/\\"/g, '"'));
  for (const s of ['Explorer', 'Pro']) chrome.add(s);   // tr(BAND_NAME[band])
  for (const ch of D.CHAPTERS) prose.add(ch.title);
  for (const l of D.LEVELS) {
    if (l.learn) { prose.add(l.learn.title); prose.add(l.learn.text); }
    if (l.intro) prose.add(l.intro);
    for (const h of l.hints || []) prose.add(h);
    if (l.check) { prose.add(l.check.q); for (const t of l.check.tiles) prose.add(t); }
    for (const nd of l.nodes || []) if (nd.label) prose.add(nd.label);
    for (const t of l.tiles || []) prose.add(t.text);
    for (const r of l.rules || []) prose.add(r.text);
    for (const e of l.events || []) prose.add(e.text);
  }
  for (const s of prose) chrome.delete(s);
  return { chrome: [...chrome].filter(Boolean), prose: [...prose].filter(Boolean) };
}

export function strings(html) { const c = collect(html); return c.chrome.concat(c.prose); }

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const c = collect(), all = c.chrome.concat(c.prose);
  const body = JSON.stringify({ strings: all }, null, 1) + '\n';
  if (process.argv.includes('--check')) {
    const cur = fs.existsSync(EN) ? fs.readFileSync(EN, 'utf8') : '';
    if (cur !== body) { console.error('en.json is out of date: run node scripts/packet-post-strings.mjs'); process.exit(1); }
    console.log(`en.json is current: ${c.chrome.length} chrome + ${c.prose.length} level strings`);
  } else {
    fs.mkdirSync(path.dirname(EN), { recursive: true });
    fs.writeFileSync(EN, body);
    console.log(`wrote ${path.relative(ROOT, EN)}: ${c.chrome.length} chrome + ${c.prose.length} level strings = ${all.length}`);
  }
}
