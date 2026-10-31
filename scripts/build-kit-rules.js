// Build the Builder's KIT_RULES block (server/builder/kit-rules.js) from docs/kit-api.md and the kit itself:
//   - the page's sections marked <!-- builder:rules -->, <!-- builder:api --> and <!-- builder:examples -->,
//     compacted (tables become one line per pair, markup is dropped);
//   - the kit's own lists (species, props, biomes, wear, hair, moods, clips, icons, controls, level kinds, motion
//     tokens, colour roles), read from the kit source with every art pack loaded, each pack's items under its name;
//   - the themes (kit/packs/dress.js THEMES): each one's packs and props.
// The result is fixed text (no dates, no hashes): the same docs and kit give the same bytes, so the Builder's prompt
// prefix stays cacheable. The kit tag and the pack tags are left as {{KIT_TAG}} and {{PACK_TAG:name}}; prompt.js puts in
// kitTag() and kitPackTag(name). tests/unit/builder-kit.test.js fails when the file is out of date.
//   node scripts/build-kit-rules.js           write server/builder/kit-rules.js
//   node scripts/build-kit-rules.js --check   exit 1 if it is out of date
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const OUT = path.join(ROOT, 'server/builder/kit-rules.js');

/** The marked sections of the page, by name, in page order. */
export function sections(md) {
  const out = { rules: [], api: [], examples: [] };
  for (const m of md.matchAll(/<!-- builder:(\w+) -->\n([\s\S]*?)\n<!-- \/builder -->/g)) (out[m[1]] = out[m[1]] || []).push(m[2]);
  return out;
}
/** Markdown -> compact plain text the model reads: tables as "a b · c d" lines, no emphasis markers. */
export function compact(md) {
  const lines = [];
  for (const raw of md.split('\n')) {
    const line = raw.replace(/\*\*/g, '').replace(/\\</g, '<').replace(/\\>/g, '>');
    if (/^\|[-| ]+\|$/.test(line.trim())) continue;
    if (/^\|/.test(line.trim())) {
      const cells = line.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim());
      if (cells.every(c => /^(Char|Kind|Clock|Calls|Stops when)$/.test(c))) continue;
      const pairs = []; for (let i = 0; i < cells.length; i += 2) if (cells[i]) pairs.push(`${cells[i]} ${cells[i + 1] || ''}`.trim());
      lines.push(pairs.join(' · '));
      continue;
    }
    lines.push(line);
  }
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

/** The kit's lists, with the packs loaded (core first, then each pack's additions under its name). */
export async function kitLists() {
  const { fakeWin } = await import(pathToFileURL(path.join(ROOT, 'tests/support/kit-fake.js')).href);
  const { createKit } = await import(pathToFileURL(path.join(ROOT, 'kit/src/index.js')).href);
  const { KIT_LATEST, kitPacks } = await import(pathToFileURL(path.join(ROOT, 'server/services/kit.js')).href);
  const O = createKit(fakeWin({ search: '' }));
  // Packs add to the kit's lists in place, so the core lists are what no pack adds (the same in any process).
  const infos = [];
  for (const name of kitPacks()) {
    const mod = await import(pathToFileURL(path.join(ROOT, `kit/packs/${name}.js`)).href);
    infos.push([name, O.__pk({ name, version: KIT_LATEST }, mod.define)]);
  }
  const fromPacks = new Set(infos.flatMap(([, i]) => [...i.species, ...i.props, ...i.biomes, ...(i.wear || [])]));
  const core = { species: O.art.species.filter(x => !fromPacks.has(x)), biomes: O.art.biomes.filter(x => !fromPacks.has(x)), props: {} };
  for (const [g, list] of Object.entries(O.art.props)) { const l = list.filter(x => !fromPacks.has(x)); if (l.length) core.props[g] = l; }
  const packs = [];
  for (const [name, info] of infos) {
    // each prop once, in the first group that lists it
    const groups = {}, seen = new Set(Object.values(core.props).flat());
    for (const [g, list] of Object.entries(O.art.props)) for (const p of list) if (info.props.includes(p) && !seen.has(p)) { seen.add(p); (groups[g] = groups[g] || []).push(p); }
    packs.push({ name, species: info.species, biomes: info.biomes, wear: info.wear || [], groups });
  }
  const roles = {};
  for (const [role, hue] of Object.entries(O.tokens.roles)) if (!['outline', 'text', 'rim', 'card', 'belly'].includes(role)) (roles[hue] = roles[hue] || []).push(role);
  // the themes (in the dress pack): each one's packs, and where each prop of its prop set comes from
  const { THEMES } = await import(pathToFileURL(path.join(ROOT, 'kit/packs/dress.js')).href);
  const propPack = n => (infos.find(([, i]) => i.props.includes(n)) || [''])[0];
  const themes = Object.entries(THEMES).map(([name, t]) => ({ name, biome: t.biome, packs: ['dress', ...t.packs], style: t.style, props: t.props.map(n => [n, propPack(n)]) }));
  return { O, core, packs, roles, themes, coreWear: O.art.wear.filter(x => !fromPacks.has(x)) };
}

export async function buildRules() {
  const md = fs.readFileSync(path.join(ROOT, 'docs/kit-api.md'), 'utf8');
  const S = sections(md);
  const { O, core, packs, roles, themes, coreWear } = await kitLists();
  const list = a => a.join(' ');
  const groups = g => Object.entries(g).map(([k, v]) => `${k}: ${list(v)}`).join('; ');
  const M = O.tokens.motion;
  const art = [
    '# Art lists (exact names; anything else is snapped to the nearest or warned about)',
    `Species (core): ${list(core.species)}. Character spec: {species, colors: {base, belly, accent} (hues), wear: [${list(coreWear)}], mood (${list(O.art.moods)}), kid only: skin 0-7, hair {style: ${list(O.art.hair)}; color: cocoa black blonde copper}, outfit {top: ${list(O.art.tops)}; color}}. 'me' is the player's own avatar. entity.state(clip): ${list(O.art.clips)}.`,
    `Props (core): ${groups(core.props)}.`,
    `Biomes (core): ${list(core.biomes)}.`,
    ...packs.filter(p => p.species.length || p.biomes.length || p.wear.length || Object.keys(p.groups).length).map(p => `Pack ${p.name} (load it with exactly {{PACK_TAG:${p.name}}} right after the kit tag): ${[p.species.length ? `species ${list(p.species)}` : '', Object.keys(p.groups).length ? `props ${groups(p.groups)}` : '', p.biomes.length ? `biomes ${list(p.biomes)}` : '', p.wear.length ? `wear ${list(p.wear)}` : ''].filter(Boolean).join('; ')}.`),
    `Themes (Oomba.game({ theme: 'name' }): [the packs to load] then its props; a prop from another pack (most are art-props) needs that pack's tag too): ${themes.map(t => `${t.name} [${t.packs.join(' ')}] ${t.props.map(([n]) => n).join(' ')}`).join(' · ')}.`,
    `Prop variants (variant: '...'): ${Object.entries(O.art.variants).map(([k, v]) => (k === 'pie' ? "pie any 'n/d' (d up to 16)" : k === 'clock' ? "clock any 'h:mm'" : `${k} ${v.filter(Boolean).map(x => `'${x}'`).join(' ')}`)).join(', ')}; tile, letterblock and sign take any short text ('A:coral' is text:hue), block a hue (':mint').`,
    `Icons (Oomba.icon, howTo cards): ${list(O.icons)}.`,
    `Level kinds: ${list(O.level.kinds)}. Controls: ${list(O.level.controls)}. HUD widgets: score lives:N timer:SECONDS progress combo count:ICON.`,
    `Bursts (stage.burst): ${list(O.juice.presets)}. Colour roles by hue: ${Object.entries(roles).map(([h, r]) => `${h} = ${list(r)}`).join('; ')}.`,
    `Motion: your own tweens match the kit's (pop ${M.pop.ms} ms ${M.pop.ease}, ui ${M.ui.ms} ms); at most ${M.flashPerSecond} flashes a second.`,
  ].join('\n');
  const text = [
    'KIT RULES: how every new Oomba Academy game is built (the Oomba Kit, docs/kit-api.md). Every rule above still applies.',
    '',
    compact(S.rules.join('\n\n')),
    '',
    '# The kit API you use (exact signatures)',
    compact(S.api.join('\n\n')),
    '',
    art,
    '',
    '# Three short example games (the <script> part; the document around it is as above)',
    compact(S.examples.join('\n\n')),
  ].join('\n');
  return text.replace(/[ \t]+\n/g, '\n');
}

/** The 3D bridge's rules (the page's <!-- builder:3d --> part): sent with the 3D RULES only, so 2D builds never pay for them. */
export function buildRules3d() {
  const S = sections(fs.readFileSync(path.join(ROOT, 'docs/kit-api.md'), 'utf8'));
  return ['# The kit\'s 3D bridge (Oomba.three, exact signatures)', compact((S['3d'] || []).join('\n\n'))].join('\n').replace(/[ \t]+\n/g, '\n');
}

/** The live class game rules (the page's <!-- builder:live --> part): sent only when the builder asks for a live class
 *  game or the game already loads the live pack (like the 3D rules). It names {{PACK_TAG:live}} itself: the art lists
 *  list only packs with art. */
export function buildRulesLive() {
  const S = sections(fs.readFileSync(path.join(ROOT, 'docs/kit-api.md'), 'utf8'));
  return ['# Live class games (Oomba.live, the live pack: exact signatures)', compact((S.live || []).join('\n\n'))].join('\n').replace(/[ \t]+\n/g, '\n');
}

export const fileText = (rules, rules3d = buildRules3d(), rulesLive = buildRulesLive()) => `// Generated by scripts/build-kit-rules.js from docs/kit-api.md (the parts marked for the Builder) and the kit's own
// lists. Do not edit: change the page (or the kit) and run \`node scripts/build-kit-rules.js\`. {{KIT_TAG}} and
// {{PACK_TAG:name}} are filled in by prompt.js (kitTag(), kitPackTag(name)). tests/unit/builder-kit.test.js checks it.
// KIT_3D_RULES_SOURCE goes with the 3D RULES (3D requests and 3D games only); KIT_LIVE_RULES_SOURCE with the LIVE RULES
// (live class game requests and games that load the live pack only).
export const KIT_RULES_SOURCE = ${JSON.stringify(rules)};
export const KIT_3D_RULES_SOURCE = ${JSON.stringify(rules3d)};
export const KIT_LIVE_RULES_SOURCE = ${JSON.stringify(rulesLive)};
`;

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const text = fileText(await buildRules());
  if (process.argv.includes('--check')) {
    const now = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';
    if (now !== text) { console.error('server/builder/kit-rules.js is out of date: run node scripts/build-kit-rules.js'); process.exit(1); }
    console.log('kit-rules.js is up to date');
  } else {
    fs.writeFileSync(OUT, text);
    const rules = await buildRules(), r3 = buildRules3d(), rl = buildRulesLive();
    console.log(`wrote ${path.relative(ROOT, OUT)}: ${rules.length} characters (about ${Math.round(rules.length / 4)} tokens), 3D: ${r3.length}, live: ${rl.length}`);
  }
}
