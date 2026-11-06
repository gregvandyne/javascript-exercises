// Story Builder (docs/story-builder.md): the story script. Claude writes it (services/story-writer.js) as JSON in the
// shape of SCHEMA, using only pieces from the felt-and-paper KIT (server/stories/blender/), and validateScript() is the
// gate every script passes before anything is voiced or rendered: structure, the kit's names, lengths, and the
// kid-safe text checks (textfilter + the Builder's word rules) on every word that will be spoken or shown.
import { hasProfanity, personalInfo } from './textfilter.js';
import { prefilter, mockClassify } from '../builder/screen.js';

/** What the Blender kit can build. Keep in step with server/stories/blender/render_story.py and feltkit.py. */
export const KIT = {
  sets: ['lighthouse', 'village', 'forest', 'meadow', 'sky'],
  times: ['night', 'dusk', 'dawn', 'day'],
  props: ['boat', 'lantern', 'fireflies'],
  characters: ['mouse', 'fox', 'owl', 'bunny'],
  actions: ['idle', 'walk', 'walk_out', 'hop', 'wave', 'look_up', 'sleep', 'fly', 'hold_star'],
  places: ['far_left', 'left', 'center', 'right', 'far_right'],
  cameras: ['drift', 'slow_push', 'pull_back', 'pan_left', 'pan_right', 'tilt_up', 'tilt_down'],
};
export const AGE_BANDS = ['3-5', '6-8', '9-12', 'all'];
export const LENGTHS = [45, 60, 90];
export const LIMITS = { title: 60, line: 180, words: 120, scenesMin: 2, scenesMax: 8, linesMax: 3, charsMax: 3, idea: 300 };
/** Spoken words per second used to estimate a script's length before it is voiced (a slow, calm bedtime voice). */
export const WORDS_PER_SEC = 2.2;

const str = (extra = {}) => ({ type: 'string', ...extra });
const en = list => ({ type: 'string', enum: list });
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
            kind: en(KIT.characters), action: en(KIT.actions), place: en(KIT.places) } } },
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
      return { kind: one('kind', KIT.characters, 'mouse'), action: one('action', KIT.actions, 'idle'), place: one('place', KIT.places, 'center') };
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
