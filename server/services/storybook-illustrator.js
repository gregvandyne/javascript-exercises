// The book maker's illustrator (docs/storybook-builder.md "Illustrations"). A page's picture is made by an ILLUSTRATOR,
// behind one small interface so a picture model could be added later without touching the book maker:
//
//   { id, prompt() -> text           what the AI is told it can ask for (the catalog, in words)
//     art() -> { worlds, chars, props(world) }   the ids shapeBook (public/js/storybook-core.js) keeps
//     render(spec, cast, o) -> { kind: 'svg', svg } | { kind: 'image', src }   one page's picture }
//
// 'packs' draws every picture from the 2D art packs the games already use (no picture model,
// no new service, nothing paid): the AI picks a world, a mood, up to 3 characters of the book's cast with their spots,
// and up to 3 props; public/js/storybook-art.js draws it the same way on the server and in the editor. Characters stay
// the same across pages because the cast fixes each name to one sprite. 'gemini' (below) adds the picture model.
import fs from 'node:fs';
import path from 'node:path';
import { ART2D_WORLDS, ART2D_CHARACTERS, ART2D_VERSIONS } from '../builder/art2d-catalog.js';
import { ART2D_DIR, ART2D_PATH } from './art2d.js';
import { pictureSvg } from '../../public/js/storybook-art.js';
import { MOODS, POSITIONS } from '../../public/js/storybook-core.js';
import { configured } from './storybook-gemini.js';

const PX = 96;   // a pack's cell in pixels (oomba2d: the ground strip is cells * PX wide, over + PX tall)
const readPack = (id, v) => { try { return JSON.parse(fs.readFileSync(path.join(ART2D_DIR, id, v, 'pack.json'), 'utf8')); } catch { return null; } };

let CAT = null;
/** What the drawer needs from each world and sprite (the browser gets the same, on the editor's page). */
export function catalog() {
  if (CAT) return CAT;
  const worlds = {}, chars = {};
  for (const w of ART2D_WORLDS) {
    const m = readPack(w.id, w.version); if (!m || m.kind !== 'world') continue;
    const items = {};
    for (const [name, s] of Object.entries(m.sprites || {})) if (s.kind === 'prop' && Array.isArray(s.rect)) items[name] = { r: s.rect, ax: s.ax, ay: s.ay, size: s.size };
    const lay = k => (m.layers && m.layers[k] ? { image: m.layers[k].image, w: m.layers[k].w, h: m.layers[k].h, base: m.layers[k].base || 0 } : null);
    worlds[w.id] = {
      name: w.name, base: `${ART2D_PATH}${w.id}/${w.version}/`, sky: m.sky, far: lay('far'), mid: lay('mid'),
      ground: { image: m.ground.image, w: (m.ground.cells || 3) * PX, h: (m.ground.over || 15) + PX, over: m.ground.over || 15, fill: m.ground.fill, open: !!m.ground.open },
      props: { image: m.props.image, w: m.props.w, h: m.props.h, items },
    };
  }
  const packs = {};
  for (const c of ART2D_CHARACTERS) {
    const v = ART2D_VERSIONS[c.pack]; if (!v) continue;
    const m = packs[c.pack] || (packs[c.pack] = readPack(c.pack, v)); const s = m && m.sprites && m.sprites[c.id];
    if (!s) continue;
    const frames = Object.values(s.anims || {}).reduce((n, a) => Math.max(n, ...a.map(x => x + 1)), 1);
    chars[c.id] = { name: c.name, kind: c.kind, group: c.group || '', src: `${ART2D_PATH}${c.pack}/${v}/${s.image}`, fw: s.fw, fh: s.fh, ax: s.ax, ay: s.ay, cols: s.cols, rows: Math.ceil(frames / s.cols) };
  }
  CAT = { worlds, chars };
  return CAT;
}

const packs = {
  id: 'packs',
  art() { const c = catalog(); return { worlds: new Set(Object.keys(c.worlds)), chars: new Set(Object.keys(c.chars)), props: w => (c.worlds[w] ? Object.keys(c.worlds[w].props.items) : []) }; },
  prompt() {
    const c = catalog();
    const groups = {};
    for (const [id, x] of Object.entries(c.chars)) (groups[x.kind === 'hero' ? 'people and heroes' : `${x.group} animals`] ||= []).push(`${id} (${x.name})`);
    return [
      'PICTURES. Every page gets one picture, drawn by the app from ready-made art (you never draw or describe images). For each page give "pic": {"world": WORLD, "mood": MOOD, "chars": [{"name": CAST NAME, "pos": "left" | "center" | "right"}], "props": [PROP]} and "alt": one plain sentence saying what the picture shows, for a reader who cannot see it.',
      '- The book has a "cast": [{"name": "Pip", "art": CHARACTER}]: each character of the story once, with the one CHARACTER id that draws them. The same name is always drawn the same way on every page. Give a person-like character a hero id; an animal character the closest animal id. At most 8 in the cast, at most 3 in one picture.',
      '- Keep one world for scenes in the same place; change the world when the story moves. Pick the mood that fits the page. Props are optional (0 to 3 from that world\'s list).',
      `MOODS: ${MOODS.join(', ')}. SPOTS: ${POSITIONS.join(', ')}.`,
      `WORLDS (id: name; its props):\n${Object.entries(c.worlds).map(([id, w]) => `- ${id}: ${w.name}; props ${Object.keys(w.props.items).join(', ')}`).join('\n')}`,
      `CHARACTERS:\n${Object.entries(groups).map(([g, list]) => `- ${g}: ${list.join(', ')}`).join('\n')}`,
    ].join('\n');
  },
  render(spec, cast, o = {}) { return { kind: 'svg', svg: pictureSvg(spec, cast, catalog(), o) }; },
};

// 'gemini': the picture model paints every page (services/storybook-draw.js, storybook-gemini.js) from words only: what
// each character is ("what"), how they look ("look"), what each picture shows ("scene") and where ("setting"). Those
// words are all the picture model is told; the art packs never shape the story or the cast (docs/decisions.md "Book
// pictures: the story and the pictures are free of the art kit"). The AI may still pick art-pack parts ("art", "world",
// "props"), used only for the stand-in drawing when a picture can't be painted (no key, the day's pictures used, a
// picture refused); render() is that fallback, and the reader shows a kept painted picture first.
const gemini = {
  ...packs,
  id: 'gemini',
  images: true,
  prompt() {
    const c = catalog();
    return [
      'PICTURES. Every page gets one picture, painted by a picture maker in one picture-book style from your words only. For each page give "pic": {"scene": SCENE, "setting": SETTING, "mood": MOOD, "chars": [{"name": CAST NAME, "pos": "left" | "center" | "right"}], "world"?: WORLD, "props"?: [PROP]} and "alt": one plain sentence saying what the picture shows, for a reader who cannot see it.',
      '- "scene": one or two plain sentences saying what the picture shows (who is there, what they are doing, the feeling). "setting": a few words saying where it happens, as the story has it ("a sunny backyard with a tall tree", "a busy kitchen"). Never any words or letters to write in the picture, and never a real person.',
      '- The book has a "cast": [{"name": "Zuri", "what": "girl", "look": "a girl of about seven with curly black hair, a yellow raincoat and red boots"}, {"name": "Bolt", "what": "robot", "look": "a small round robot painted sky blue, with one antenna and kind lamp eyes"}]: each character of the story once. "what" says what the character IS, in a word or two, exactly as the story has it (a boy, a chameleon, a grandmother, a robot). "look" is one short sentence on how they look that STARTS with what they are, then colors, clothes and one special detail. Keep "what" and "look" the same for the whole book; the same name is always painted the same way on every page. At most 8 in the cast, at most 3 in one picture.',
      '- What a character is comes from the story and the teacher, never from anything else: never change it, or how they look, to fit any list.',
      '- Keep the setting the same for scenes in the same place; change it when the story moves. Pick the mood that fits the page.',
      `MOODS: ${MOODS.join(', ')}. SPOTS: ${POSITIONS.join(', ')}.`,
      'STAND-IN ART (optional, for the app only): when a picture cannot be painted, the app draws a simple stand-in from ready-made parts. You may add "art": CHARACTER to a cast member and "world": WORLD and "props" (0 to 3 from that world\'s list) to a "pic" when one fits; leave them out when nothing fits. They never change the story, the cast, a "what" or a "look", and they are never mentioned to the teacher: your "reply" never talks about ready-made art, stand-ins, sprites, ids or how pictures are matched.',
      `WORLDS (id: name; its props):\n${Object.entries(c.worlds).map(([id, w]) => `- ${id}: ${w.name}; props ${Object.keys(w.props.items).join(', ')}`).join('\n')}`,
      `CHARACTERS: ${Object.keys(c.chars).join(', ')}`,
      'Never name a real person, a brand or a character from films, books or games.',
    ].join('\n');
  },
};

export const ILLUSTRATORS = { packs, gemini };
/** The illustrator in use: 'gemini' while the picture model is there (GEMINI_API_KEY, or the tests' stand-in), unless
 *  STORYBOOK_ILLUSTRATOR=packs; otherwise 'packs'. */
export const illustrator = () => (process.env.STORYBOOK_ILLUSTRATOR !== 'packs' && configured() ? gemini : packs);
