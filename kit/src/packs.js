// Art packs: extra species, props and biomes in separate pinned files (public/vendor/oomba-kit/<version>/packs/), so
// the core stays small and only the games that use a pack download it. A game loads a pack with its exact pinned tag
// (kitPackTag() on the server: SRI + crossorigin, after the kit's own tag); the pack file calls Oomba's internal
// registration hook with its build version, and Oomba.pack(name) then reports what it added. Packs never fetch: all
// art is code, drawn with the same "Oomba Ink" grammar as the core.
import { PALETTE, INK, CREAM } from './tokens.js';
import { sticker, detail, ringEye, sparkPath, ellipsePath, rrectPath, glowMask, lines } from './grammar.js';
import { adjustHex, mixHex } from './color.js';
import { mulberry32 } from './rand.js';
import { addSpecies, capsule, STYLE, WEAR_X } from './chars.js';
import { WEAR } from './validate.js';
import { PROP_GROUPS, PROP_VARIANTS, text } from './props.js';
import { addBiome, defineGroundFor, BIOMES, RECIPES, DECOS } from './biomes.js';

export const PACK_NAMES = ['art-animals', 'art-school', 'art-biomes', 'art-biomes-2', 'art-props', 'dress', 'style-bold', 'bridge-3d'];

/** kit.definePack({name, version}, define(K)): run a pack once; -> its info. */
export function installPacks(kit) {
  kit.packs = {};
  const onAtlases = fn => { kit.artPacks.push(fn); for (const s of kit.stages) fn(s.atlas); if (kit.helper) fn(kit.helper); };
  kit.definePack = (meta, define) => {
    const name = String(meta && meta.name || '');
    if (kit.packs[name]) return kit.packs[name];
    if (meta.version && meta.version !== kit.version) { kit.warn(`pack ${name} ${meta.version} is for kit ${meta.version}, not ${kit.version}: load the pack from /vendor/oomba-kit/${kit.version}/packs/`); return null; }
    const info = { name, version: kit.version, species: [], props: [], biomes: [], wear: [] };
    const K = {
      P: PALETTE, INK, CREAM, rand: mulberry32, adjust: adjustHex, mix: mixHex, text,
      ink: { sticker, detail, ringEye, spark: sparkPath, ellipse: ellipsePath, rrect: rrectPath, glow: glowMask, lines, capsule },
      species(n, def) { addSpecies(n, def); info.species.push(n); },
      prop(n, group, def, variants) {
        onAtlases(a => a.define(n, def));
        const g = PROP_GROUPS[group] || (PROP_GROUPS[group] = []); if (!g.includes(n)) g.push(n);
        if (variants) PROP_VARIANTS[n] = variants;
        info.props.push(n);
      },
      biome(n, def, o) { addBiome(n, def, o); onAtlases(a => defineGroundFor(a, n)); info.biomes.push(n); },
      /** art(name, def): a sprite with no prop group (scenery the stage draws: framing, critters). */
      art(n, def) { onAtlases(a => a.define(n, def)); },
      /** dress({recipes: {biome: {bands, fg, life}}, decos}): scene dressing (stage bands re-bake). */
      dress(o) { Object.assign(RECIPES, o.recipes); Object.assign(DECOS, o.decos); for (const s of kit.stages) s.bandKey = ''; },
      biomes: BIOMES, recipes: RECIPES, kit, style: STYLE,
      /** wear(name, {hat, body}): a wearable (hat(hx, top, rx) -> {p, draw}; body(ctx, k, {cx, top, mid, bot, w, A})). */
      wear(n, def) { WEAR_X[n] = def; if (!WEAR.includes(n)) WEAR.push(n); info.wear.push(n); },
    };
    try { define(K); } catch (err) { kit.warn(`pack ${name} failed: ${err && err.message}`); }
    kit.packs[name] = info;
    return info;
  };
}
