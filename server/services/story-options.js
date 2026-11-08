// Story Builder: the choices a person makes for a story besides the idea (docs/story-builder.md "Choices"): the kind
// of story (style), how it should feel (tone), who reads it (narrator voice), the background music (a mood the
// composer in story-music.js can play), and two optional short texts (who is in it, a lesson). Every list here is
// closed: a value that isn't on it falls back to the default, so nothing a page sends reaches a prompt unchecked
// except the two short texts, which are screened like the idea and sent to the writer as data in tags.
import { VOICES } from './tts-voices.js';

/** The kinds of story, with what each one tells the writer. Bedtime is the default (and the original rules). */
export const STYLES = {
  bedtime: { emoji: '🌙', prompt: 'A gentle bedtime story: warm, kind and calm; a small, cosy problem that gets solved with kindness, curiosity or teamwork; it ends sleepy and safe ("goodnight"). Mostly night or dusk; the last scene is night and someone sleeps.', music: 'lullaby' },
  adventure: { emoji: '🗺️', prompt: 'A small adventure: a little quest or journey with a goal, a few steps along the way and a happy, proud ending. Exciting but never dangerous: no one is ever hurt, lost for long or in real trouble. Any time of day; it may end at dusk or night.', music: 'adventure' },
  funny: { emoji: '🤪', prompt: 'A funny story: silly mix-ups, gentle jokes, surprises and playful repetition kids can giggle at. The humour is always kind: nobody is laughed at or made to feel bad. Any time of day.', music: 'playful' },
  rhyming: { emoji: '🎵', prompt: 'A rhyming story: every "say" line is a rhyming couplet (or two short rhyming lines) with a bouncy, regular rhythm that is fun to read aloud, in the story\'s language. Keep the words simple so the rhymes stay natural.', music: 'playful' },
  fable: { emoji: '🦉', prompt: 'A fable: animals learn a simple, kind lesson through what happens to them; the last scene says the lesson in one short, warm sentence. Never preachy, never harsh.', music: 'piano' },
  mystery: { emoji: '🔍', prompt: 'A cosy mystery: a small puzzle (something gone missing, a strange sound, a surprise) with two or three friendly clues that the friends follow, solved happily at the end. Curious, never spooky or scary; the answer is always something nice.', music: 'magical' },
};
/** How it should feel. */
export const TONES = {
  cozy: { emoji: '🧸', prompt: 'Tone: cosy and soothing, soft words, a calm pace.' },
  exciting: { emoji: '⚡', prompt: 'Tone: exciting and lively, with a sense of wonder and "what happens next?", still safe and kind.' },
  silly: { emoji: '😜', prompt: 'Tone: silly and playful, with funny sounds, surprises and giggles.' },
  heartfelt: { emoji: '💛', prompt: 'Tone: heartfelt and warm, about friendship, family and caring for each other.' },
  brave: { emoji: '🦁', prompt: 'Tone: brave and encouraging: a small fear or worry is faced with courage and help from friends.' },
};
/** Background music moods the composer plays (story-music.js MOODS), plus none. */
export const MUSIC = {
  lullaby: { emoji: '🎶' },
  playful: { emoji: '🎈' },
  adventure: { emoji: '🧭' },
  magical: { emoji: '✨' },
  piano: { emoji: '🎹' },
  none: { emoji: '🔇' },
};
/**
 * How the pictures are drawn (one 3D kit, two looks; docs/story-builder.md "Looks"). felt: felt and paper, the
 * original. comic: a graphic-novel look (ink lines, muted cel colour, moody light; tools/blender/comic_look.py), which
 * also nudges the music towards a calmer, film-like mood (`music`) unless the kind of story already brings a lively one
 * (`keeps`), and tells the writer to frame scenes like a film (`prompt`). Changing the look renders every scene again.
 */
export const LOOKS = {
  felt: { emoji: '🧶' },
  comic: { emoji: '✏️', music: 'piano', keeps: ['playful', 'adventure'], prompt: 'The pictures are drawn like a comic book (ink lines, muted colours, film-like light): when two characters talk or share a moment, prefer the cameras two_shot and over_shoulder; slow_push for a close, quiet moment; pull_back or drift to show a new place.' },
};
/**
 * Narrator voices offered to kids: a few of the site's AI voices (tts-voices.js VOICES) with friendly names
 * (stories.voice.<id> in the locale files). 'auto' is the narrator the admin chose for the page's language.
 * pitch: the offline voice (development, or when the AI voice is off) is shifted a little so the choice is still heard.
 */
export const NARRATORS = {
  auto: { emoji: '⭐', voice: null, pitch: 1 },
  coral: { emoji: '🌸', voice: 'coral', pitch: 1.03 },
  sage: { emoji: '🌿', voice: 'sage', pitch: 0.97 },
  nova: { emoji: '😊', voice: 'nova', pitch: 1.06 },
  shimmer: { emoji: '🌟', voice: 'shimmer', pitch: 1.1 },
  fable: { emoji: '📖', voice: 'fable', pitch: 0.94 },
  onyx: { emoji: '🐻', voice: 'onyx', pitch: 0.86 },
};
for (const n of Object.values(NARRATORS)) if (n.voice && !VOICES.includes(n.voice)) throw new Error(`story narrator ${n.voice} is not a site voice`);

export const DEFAULTS = { style: 'bedtime', tone: 'cozy', voice: 'auto', music: 'lullaby', look: 'felt' };
/** Lengths of the free-text extras (characters, lesson, a rewrite note). */
export const TEXT_LIMITS = { characters: 120, lesson: 120, note: 200 };

const tidy = s => String(s ?? '').normalize('NFC').replace(/[\u0000-\u001f\u007f‪-‮⁦-⁩]/g, ' ').replace(/\s+/g, ' ').trim();
const one = (v, list, d) => (Object.hasOwn(list, v) ? v : d);

/**
 * The choices from a form or an API body, every one checked against its list: { style, tone, voice, music, look }.
 * Music the body leaves out follows the style and look (musicFor) on a new story; on a change it stays as it was.
 */
export function choiceFields(b = {}, base = DEFAULTS) {
  const style = one(b.style, STYLES, base.style || DEFAULTS.style);
  const look = one(b.look, LOOKS, base.look || DEFAULTS.look);
  return {
    style,
    tone: one(b.tone, TONES, base.tone || DEFAULTS.tone),
    voice: one(b.voice, NARRATORS, base.voice || DEFAULTS.voice),
    music: one(b.music, MUSIC, base === DEFAULTS ? musicFor(style, look) : base.music || DEFAULTS.music),
    look,
  };
}
/** The optional short texts, tidied and cut to length: { characters, lesson }. */
export function extraFields(b = {}) {
  return { characters: tidy(b.characters).slice(0, TEXT_LIMITS.characters), lesson: tidy(b.lesson).slice(0, TEXT_LIMITS.lesson) };
}
export const noteField = b => tidy(b && b.note).slice(0, TEXT_LIMITS.note);
/** A story row's choices (old rows: the defaults). */
export const optionsOf = s => choiceFields(s || {}, DEFAULTS);
/**
 * The music that goes with a style and a look (the form preselects it until the person picks music themselves): the
 * style's own mood, or the look's (comic: piano) unless the style's mood is one the look keeps.
 */
export function musicFor(style, look = 'felt') {
  const m = (STYLES[style] || STYLES.bedtime).music;
  const l = LOOKS[look] || LOOKS.felt;
  return l.music && !(l.keeps || []).includes(m) ? l.music : m;
}
/** What the writer is told about the look ('' for felt). */
export const lookPrompt = look => (LOOKS[look] || LOOKS.felt).prompt || '';
/** The site voice for a narrator choice (null: the language's own narrator). */
export const providerVoice = id => (NARRATORS[id] || NARRATORS.auto).voice;
export const pitchOf = id => (NARRATORS[id] || NARRATORS.auto).pitch;
