// A theme from one short definition file: node kit2/pipeline/from-def.mjs kit2/themes/<theme>/theme.def.json
// writes recipe.json and theme.src.json beside it. Pieces are [id, file in a pack, kind, [tags], note?]; heroes and
// moves may come from an already built theme (from: "theme:<theme>/<version>/<file>"). After build-theme.mjs has run with
// a sizes file, run again with that file as the second argument to fill in each piece's measured size.
// A new version of a shipped theme names it as "base": "<theme>/<version>": every file the base already has is copied
// from it byte for byte (its catalogue entry too), and only what is new is built. "creatures" (Oomba3D 1.2.0) are
// animated animals with their own clips: { id, name, from, pack, kind, playable, size, ...build-theme/pack-steps fields
// (scale, anims, brighten, inkNormals, meshopt …) }; "moves" in the catalogue is the list of clips kept. pace (how fast
// the ground passes under a standing foot in walk and run, units a second) and jumpAir (the part of the jump clip, 0 to
// 1, in which the animal is off the ground) are measured from the built file and let Oomba3D keep feet from sliding.
// Packs converted from FBX (kit2/packs/, docs/kit2-packs-plan.md) may carry "steps": the pack-steps.mjs fields every
// model from that pack is built with (scale, matte, textures, inkNormals…), and a piece may add its own as a 7th
// field: [id, file, kind, tags, note, pack, { stretch: [1, 6, 1] }]. A definition that names neither builds as before.
import fs from 'node:fs';
import path from 'node:path';

const [defFile, sizesFile] = process.argv.slice(2);
const dir = path.dirname(defFile);
const def = JSON.parse(fs.readFileSync(defFile, 'utf8'));
const sizes = sizesFile ? JSON.parse(fs.readFileSync(sizesFile, 'utf8')) : {};
const slug = s => s.replace(/\.gltf\.glb$|\.gltf$|\.glb$/i, '').replace(/[^A-Za-z0-9]+/g, '-').toLowerCase();
const folder = { world: 'world', decor: 'world', prop: 'props', effect: 'props' };
const baseDir = def.base ? path.resolve(dir, '../../../public/vendor/themes', def.base) : null;
const base = baseDir ? JSON.parse(fs.readFileSync(path.join(baseDir, 'theme.json'), 'utf8')) : null;
const inBase = to => !!(base && base.files[to]);
const recipe = { _: `How ${def.name} ${def.version} is built (see SOURCES.md). Generated from theme.def.json by kit2/pipeline/from-def.mjs.`, models: [], copy: [] };
const heroes = def.heroes.map(h => {
  const to = `heroes/${h.id}.glb`;
  if (h.from.startsWith('theme:')) recipe.copy.push({ from: h.from, to }); else recipe.models.push({ from: h.from, to, keepMeshes: h.keepMeshes });
  return { id: h.id, name: h.name, file: to, pack: h.pack, ...(sizes[to] ? { size: sizes[to].size } : {}) };
});
if (def.moves.from.startsWith('theme:')) recipe.copy.push({ from: def.moves.from, to: 'heroes/moves.glb' });
else recipe.models.push({ from: def.moves.from, to: 'heroes/moves.glb', animsOnly: true, keepAnims: Object.values(def.moves.clips) });
const pieces = def.pieces.map(([id, from, kind, tags, note, packId, steps]) => {
  const to = `${folder[kind] || 'world'}/${id}.glb`;
  if (inBase(to)) { recipe.copy.push({ from: `theme:${def.base}/${to}`, to }); const was = base.pieces.find(p => p.id === id && p.file === to); if (was) return was; }
  const m = sizes[to];
  // A piece from a built theme names its pack in a 6th field: [id, 'theme:<theme>/<v>/<file>', kind, tags, note, pack].
  const pack = def.packs.find(p => (p.dir && from.startsWith(p.dir)) || (packId && p.id === packId));
  if (!pack) throw new Error(`${id}: no pack has a dir that ${from} starts with (a piece from a built theme names its pack as the 6th field)`);
  if (!inBase(to)) recipe.models.push({ from, to, ...(from.startsWith('theme:') ? {} : pack.steps || {}), ...(steps || {}) });
  return { id, file: to, kind, tags, ...(m ? { size: m.size } : {}), pack: pack.id, ...(m && Math.abs(m.minY) > 0.05 ? { note: `${note ? note + ' ' : ''}Its base is ${m.minY} below its y.` } : note ? { note } : {}) };
});
const creatures = (def.creatures || []).map(({ id, name, from, pack, kind = 'land', playable = false, size, pace, jumpAir, ...steps }) => {
  const to = `creatures/${id}.glb`;
  if (!def.packs.some(p => p.id === pack)) throw new Error(`${id}: no pack ${pack}`);
  recipe.models.push({ from, to, ...steps, keepAnims: Object.values(steps.anims || {}) });
  return { id, name, file: to, pack, kind, size, moves: Object.keys(steps.anims || {}), playable, ...(pace ? { pace } : {}), ...(jumpAir ? { jumpAir } : {}) };
});
const sounds = def.sounds.map(([id, from]) => { const to = `sounds/${id}.ogg`; recipe.copy.push({ from: inBase(to) ? `theme:${def.base}/${to}` : from, to }); return { id, file: `sounds/${id}.ogg`, pack: def.soundPack }; });
fs.writeFileSync(path.join(dir, 'recipe.json'), JSON.stringify(recipe, null, 1) + '\n');
const { pieces: _p, heroes: _h, sounds: _s, creatures: _c, base: _b, moves, soundPack, ...head } = def;
head.packs = def.packs.map(({ dir, steps, ...p }) => p);
fs.writeFileSync(path.join(dir, 'theme.src.json'), JSON.stringify({ ...head, heroes, moves: { file: 'heroes/moves.glb', pack: moves.pack, clips: moves.clips }, ...(creatures.length ? { creatures } : {}), pieces, sounds }, null, 1) + '\n');
console.log(`${def.id}: ${heroes.length} heroes, ${creatures.length} creatures, ${pieces.length} pieces, ${sounds.length} sounds${sizesFile ? ' (sized)' : ''}`);
