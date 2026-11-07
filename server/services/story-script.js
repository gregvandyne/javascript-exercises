// Story Builder (docs/story-builder.md): the story script. Claude writes it (services/story-writer.js) as JSON in the
// shape of SCHEMA, using only pieces from the felt-and-paper KIT (server/stories/blender/), and validateScript() is the
// gate every script passes before anything is voiced or rendered: structure, the kit's names, lengths, and the
// kid-safe text checks (textfilter + the Builder's word rules) on every word that will be spoken or shown.
import fs from 'node:fs';
import { hasProfanity, personalInfo } from './textfilter.js';
import { prefilter, mockClassify } from '../builder/screen.js';

/** What the Blender kit can build: the one catalog (server/stories/blender/catalog.json), which the Python kit must
 *  match exactly (render_story.py --kit; tests/unit/story-builder.test.js). */
export const CATALOG = JSON.parse(fs.readFileSync(new URL('../stories/blender/catalog.json', import.meta.url), 'utf8'));
export const KIT = {
  sets: Object.keys(CATALOG.sets),
  times: Object.keys(CATALOG.times),
  props: Object.keys(CATALOG.props),
  characters: Object.keys(CATALOG.characters),
  actions: Object.keys(CATALOG.actions),
  places: CATALOG.places,
  cameras: Object.keys(CATALOG.cameras),
};
export const AGE_BANDS = ['3-5', '6-8', '9-12', 'all'];
export const LENGTHS = [45, 60, 90];
export const LIMITS = { title: 60, line: 180, words: 120, scenesMin: 2, scenesMax: 8, linesMax: 3, charsMax: 3, idea: 300 };
/** Spoken words per second used to estimate a script's length before it is voiced (a slow, calm bedtime voice). */
export const WORDS_PER_SEC = 2.2;

const str = (extra = {}) => ({ type: 'string', ...extra });
const en = list => ({ type: 'string', enum: list });

// ---- the cast: people with a look, and what a character carries (all optional on a character entry)
/** People kinds (a look applies to them), the look's choices, what can be carried, and who can fly. */
export const PEOPLE = KIT.characters.filter(k => CATALOG.characters[k].type === 'person');
export const LOOK = Object.fromEntries(Object.entries(CATALOG.look).map(([k, v]) => [k, Array.isArray(v) ? v : Object.keys(v)]));
export const HOLDS = KIT.props.filter(p => CATALOG.props[p].hold);
export const FLYERS = KIT.characters.filter(k => CATALOG.characters[k].flies);
export const FLYING_OUTFITS = ['superhero', 'astronaut'];
const LOOK_FIELDS = ['hair_color', 'skin', 'hair', 'shirt', 'outfit', 'glasses', 'age'];
const CAST_PROPS = {
  who: str({ description: 'The character\'s name in the story (the same in every scene), e.g. "Banks".' }),
  look: {
    type: 'object', additionalProperties: false, required: LOOK_FIELDS,
    description: 'Only for kid, grownup and grandparent: how they look (the same in every scene; the outfit may change).',
    properties: { ...Object.fromEntries(Object.entries(LOOK).map(([k, v]) => [k, en(v)])), glasses: { type: 'boolean' } },
  },
  holds: { ...en(HOLDS), description: 'Something the character carries.' },
};

/** Check one character's optional cast fields (who, look, holds) into `out`; a look carries over from earlier scenes
 *  by `who`, so a person looks the same all the way through. */
function castFields(cc, out, at, errors, looks) {
  const who = tidy(cc.who).replace(/[^\p{L}\p{N} '-]/gu, '').slice(0, 24);
  if (who) out.who = who;
  if (PEOPLE.includes(out.kind)) {
    let look = null;
    if (cc.look && typeof cc.look === 'object') {
      look = {};
      for (const f of LOOK_FIELDS) {
        const v = cc.look[f];
        if (f === 'glasses') { if (v !== undefined) look.glasses = v === true; continue; }
        if (v === undefined) continue;
        if (LOOK[f].includes(v)) look[f] = v;
        else errors.push(`${at}.look.${f}: "${String(v).slice(0, 30)}" is not one of ${LOOK[f].join(', ')}`);
      }
    }
    const key = who ? `${out.kind}:${who.toLowerCase()}` : null;
    if (key && looks.has(key)) look = { ...looks.get(key), ...(look || {}) };
    if (look) { out.look = look; if (key) looks.set(key, look); }
  }
  if (cc.holds !== undefined && cc.holds !== null && cc.holds !== '') {
    if (HOLDS.includes(cc.holds)) out.holds = cc.holds;
    else errors.push(`${at}.holds: "${String(cc.holds).slice(0, 30)}" is not one of ${HOLDS.join(', ')}`);
  }
  // only some can fly: everyone else jumps for joy instead
  if (out.action === 'fly' && !FLYERS.includes(out.kind) && !(out.look && FLYING_OUTFITS.includes(out.look.outfit))) out.action = 'jump';
  return out;
}

/** The kit, in a few lines, for the writer's prompt (server/services/story-writer.js). */
export function kitPrompt() {
  const list = obj => Object.entries(obj).map(([k, v]) => `${k} (${typeof v === 'string' ? v : v.about})`).join('; ');
  const animals = KIT.characters.filter(k => !PEOPLE.includes(k));
  return [
    `- set: ${list(CATALOG.sets)}`,
    `- time: ${list(CATALOG.times)}`,
    `- props (optional extras, a few a scene): ${KIT.props.join(', ')}`,
    `- characters (0 to 3 per scene, each in a different place): animals: ${animals.join(', ')}; people: ${PEOPLE.map(k => `${k} (${CATALOG.characters[k].about})`).join(', ')}; place: ${KIT.places.join(', ')}`,
    `- action: ${list(CATALOG.actions)}`,
    `- camera: ${list(CATALOG.cameras)}`,
    `People and animals: when the idea is about children or grown-ups (a team, a family, a class), tell it with kid, grownup and grandparent characters; when it is about animals, use the animals. Give every character a "who" (their name in the story, the same in every scene). Give every person a "look" that fits the idea and stays the same all the way through (only the outfit may change, e.g. pyjamas at bedtime): hair_color ${LOOK.hair_color.join('/')}; skin ${LOOK.skin.join('/')}; hair ${LOOK.hair.join('/')}; shirt ${LOOK.shirt.join('/')} (teammates share one colour); outfit: ${list(CATALOG.look.outfit)}; glasses true/false; age small/big. "holds" (optional): something the character carries: ${HOLDS.join(', ')}. A daytime adventure (a match, a school day, a trip) can use day or dusk for its busy scenes.`,
  ].join('\n');
}
export const SCHEMA = {
  type: 'object', additionalProperties: false, required: ['title', 'scenes'],
  properties: {
    title: str(),
    scenes: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false, required: ['set', 'time', 'props', 'characters', 'camera', 'lines'],
        properties: {
          set: en(KIT.sets), time: en(KIT.times), camera: en(KIT.cameras),
          props: { type: 'array', items: en(KIT.props) },
          characters: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['kind', 'action', 'place'], properties: {
            kind: en(KIT.characters), action: en(KIT.actions), place: en(KIT.places), ...CAST_PROPS } } },
          lines: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['say', 'show'], properties: {
            say: str({ description: 'One narration sentence or two, read aloud.' }),
            show: str({ description: 'The words shown on screen while it is read: the same words, or a shorter version of them.' }),
          } } },
        },
      },
    },
  },
};

const tidy = s => String(s ?? '').normalize('NFC').replace(/[\u0000-\u001f\u007f‪-‮⁦-⁩]/g, ' ').replace(/\s+/g, ' ').trim();
const wordCount = s => tidy(s).split(' ').filter(Boolean).length;

/** Kid-safe text check for one string: null when fine, else the reason ('profanity', 'personal', or a word-rule category). */
export function textProblem(s) {
  const t = tidy(s);
  if (!t) return null;
  if (hasProfanity(t)) return 'profanity';
  if (personalInfo(t)) return 'personal';
  const rule = prefilter(t) || mockClassify(t);
  return rule || null;
}

/** Estimated narration seconds of a (normalised) script, before voicing. */
export function estimateSeconds(script) {
  let words = 0, lines = 0;
  for (const sc of script.scenes || []) for (const l of sc.lines || []) { words += wordCount(l.say); lines++; }
  return words / WORDS_PER_SEC + lines * 0.6 + (script.scenes || []).length * 1.4 + 5;
}

/**
 * Check and normalise a script. -> { ok, script, errors: [string] }. Unknown kit names, empty or too long text, too many
 * scenes or lines, and unsafe words are errors (the writer retries once with them); small things are fixed quietly
 * (trimmed text, duplicate props, "show" defaulting to "say", at most 3 characters).
 * opts.seconds: the length asked for; a script far from it is an error.
 */
export function validateScript(input, { seconds = null } = {}) {
  const errors = [];
  const d = input && typeof input === 'object' ? input : {};
  const title = tidy(d.title).slice(0, LIMITS.title);
  if (!title) errors.push('title: missing');
  const scenesIn = Array.isArray(d.scenes) ? d.scenes : [];
  if (scenesIn.length < LIMITS.scenesMin) errors.push(`scenes: need at least ${LIMITS.scenesMin}`);
  if (scenesIn.length > LIMITS.scenesMax) errors.push(`scenes: at most ${LIMITS.scenesMax}`);
  const looks = new Map(); // who -> look: a person looks the same in every scene
  const scenes = scenesIn.slice(0, LIMITS.scenesMax).map((s, i) => {
    const at = `scenes[${i}]`;
    const sc = s && typeof s === 'object' ? s : {};
    const pick = (field, list, fallback) => {
      if (list.includes(sc[field])) return sc[field];
      if (sc[field] !== undefined) errors.push(`${at}.${field}: "${String(sc[field]).slice(0, 30)}" is not one of ${list.join(', ')}`);
      return fallback;
    };
    const out = { set: pick('set', KIT.sets, 'meadow'), time: pick('time', KIT.times, 'night'), camera: pick('camera', KIT.cameras, 'drift') };
    out.props = [...new Set((Array.isArray(sc.props) ? sc.props : []).filter(p => {
      if (KIT.props.includes(p)) return true;
      errors.push(`${at}.props: "${String(p).slice(0, 30)}" is not a prop`); return false;
    }))];
    const chars = Array.isArray(sc.characters) ? sc.characters : [];
    out.characters = chars.slice(0, LIMITS.charsMax).map((c, k) => {
      const cc = c && typeof c === 'object' ? c : {};
      const one = (f, list, fb) => { if (list.includes(cc[f])) return cc[f]; errors.push(`${at}.characters[${k}].${f}: not one of ${list.join(', ')}`); return fb; };
      return castFields(cc, { kind: one('kind', KIT.characters, 'mouse'), action: one('action', KIT.actions, 'idle'), place: one('place', KIT.places, 'center') }, `${at}.characters[${k}]`, errors, looks);
    });
    // Two characters in one place would stand inside each other: move the later one to a free place.
    const used = new Set();
    for (const c of out.characters) {
      if (used.has(c.place)) c.place = ['left', 'right', 'center', 'far_left', 'far_right'].find(p => !used.has(p));
      used.add(c.place);
    }
    const lines = Array.isArray(sc.lines) ? sc.lines : [];
    if (!lines.length) errors.push(`${at}.lines: at least one line`);
    if (lines.length > LIMITS.linesMax) errors.push(`${at}.lines: at most ${LIMITS.linesMax}`);
    out.lines = lines.slice(0, LIMITS.linesMax).map((l, k) => {
      const say = tidy(l && l.say);
      let show = tidy(l && l.show) || say;
      if (!say) errors.push(`${at}.lines[${k}].say: empty`);
      if (say.length > LIMITS.line) errors.push(`${at}.lines[${k}].say: longer than ${LIMITS.line} characters`);
      if (show.length > LIMITS.words) show = say.length <= LIMITS.words ? say : show.slice(0, LIMITS.words).replace(/\s+\S*$/, '') + '…';
      return { say: say.slice(0, LIMITS.line), show };
    });
    return out;
  });
  const script = { title, scenes };
  // Every word that will be heard or seen.
  for (const [where, text] of [['title', title], ...scenes.flatMap((s, i) => s.lines.flatMap((l, k) => [[`scenes[${i}].lines[${k}].say`, l.say], [`scenes[${i}].lines[${k}].show`, l.show]]))]) {
    const why = textProblem(text);
    if (why) errors.push(`${where}: not suitable (${why})`);
  }
  if (seconds && scenes.length) {
    const est = estimateSeconds(script);
    if (est < seconds * 0.6) errors.push(`length: about ${Math.round(est)} s of story, ${seconds} s was asked for: add a little more`);
    if (est > seconds * 1.45) errors.push(`length: about ${Math.round(est)} s of story, ${seconds} s was asked for: make it shorter`);
  }
  return { ok: errors.length === 0, script, errors };
}

/** Normalise the request fields: { idea, ageBand, seconds } with defaults; idea trimmed to LIMITS.idea. */
export function requestFields(b = {}) {
  const idea = tidy(b.idea).slice(0, LIMITS.idea);
  const ageBand = AGE_BANDS.includes(b.ageBand) ? b.ageBand : 'all';
  const n = Math.round(+b.seconds || 60);
  const seconds = LENGTHS.reduce((best, x) => (Math.abs(x - n) < Math.abs(best - n) ? x : best), 60);
  return { idea, ageBand, seconds };
}
