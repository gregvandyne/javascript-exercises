// Words -> game ideas. Used by the mock Builder to understand a kid's request deterministically
// (what kind of game, which hero/theme, who plays, anything to learn) and to name the game.
const norm = s => String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '');

export const KIND_WORDS = [
  ['duel', /\b(two|2)[ -]?players?\b|\bduel\b|\bversus\b|\bvs\.?\b|\bagainst (a|my) (friend|brother|sister)|\bone screen\b|\bhead to head\b|\bpong\b/],
  ['board', /\bboard ?games?\b|\bdice\b|\bsnakes and ladders\b|\bludo\b|\bspaces?\b.*\bboard\b|\btycoon\b/],
  ['quiz', /\bquiz|\btrivia\b|\bquestions?\b|\bmaths?\b|\bmath\b|\btimes tables?\b|\bgeography\b|\bcapitals?\b|\bflags?\b|\bfacts?\b|\bsums\b/],
  ['word', /\bwords?\b|\bspell(ing)?\b|\bletters?\b|\bhangman\b|\breading\b|\bphonics\b|\balphabet\b|\bvocab/],
  ['memory', /\bmemory\b|\bmatch(ing)? (game|pairs|cards)\b|\bpairs\b|\bflip\b|\bcards?\b|\bconcentration\b/],
  ['catch', /\bcatch(ing)?\b|\bfalling\b|\bfall from\b|\bcollect(ing)?\b|\bbasket\b|\braining\b|\bdodge\b/],
  ['runner', /\brun(ner|ning)?\b|\bjump(ing)?\b|\bdash\b|\bplatform(er)?\b|\bobstacles?\b|\bendless\b|\brace\b|\bracing\b|\bparkour\b|\bhop\b/],
];
// The kinds a "surprise me" or unknown answer falls back to.
export const DEFAULT_KIND = 'catch';

/** What kind of game does this text ask for? -> key or null. */
export function detectKind(text) {
  const t = norm(text);
  if (/\bsurprise\b|\byou (pick|choose)\b|\banything\b|\bdon'?t know\b|\bidk\b/.test(t)) return 'runner';
  for (const [k, re] of KIND_WORDS) if (re.test(t)) return k;
  if (/\bsoccer\b|\bfootball\b|\bbasketball\b|\bsports?\b|\bgoal/.test(t)) return 'catch';
  return null;
}

// Theme words -> hero emoji, display name, cover and a tint colour.
export const THEMES = [
  ['shark', /\bsharks?\b/, '🦈', 'Shark', 'ocean'], ['dragon', /\bdragons?\b/, '🐉', 'Dragon', 'lava'],
  ['dino', /\bdino(saur)?s?\b|\bt-?rex\b/, '🦖', 'Dino', 'forest'], ['robot', /\brobots?\b/, '🤖', 'Robot', 'night'],
  ['unicorn', /\bunicorns?\b/, '🦄', 'Unicorn', 'candy'], ['space', /\bspace\b|\brockets?\b|\bplanets?\b|\bastronauts?\b/, '🚀', 'Space', 'night'],
  ['alien', /\baliens?\b|\bufos?\b/, '👽', 'Alien', 'night'], ['cat', /\bcats?\b|\bkittens?\b|\bkitty\b/, '🐱', 'Kitty', 'candy'],
  ['dog', /\bdogs?\b|\bpupp(y|ies)\b/, '🐶', 'Puppy', 'sunset'], ['fox', /\bfox(es)?\b/, '🦊', 'Fox', 'sunset'],
  ['penguin', /\bpenguins?\b/, '🐧', 'Penguin', 'ocean'], ['bunny', /\bbunn(y|ies)\b|\brabbits?\b/, '🐰', 'Bunny', 'mint'],
  ['frog', /\bfrogs?\b/, '🐸', 'Frog', 'forest'], ['octopus', /\boctopus\b/, '🐙', 'Octopus', 'ocean'],
  ['bee', /\bbees?\b/, '🐝', 'Bee', 'gold'], ['fish', /\bfish\b|\bocean\b|\bsea\b|\bunderwater\b/, '🐠', 'Fishy', 'ocean'],
  ['monkey', /\bmonkeys?\b|\bbananas?\b/, '🐵', 'Monkey', 'forest'], ['lion', /\blions?\b/, '🦁', 'Lion', 'gold'],
  ['panda', /\bpandas?\b/, '🐼', 'Panda', 'mint'], ['zombie', /\bzombies?\b/, '🧟', 'Zombie', 'night'],
  ['ghost', /\bghosts?\b|\bspooky\b/, '👻', 'Ghost', 'night'], ['pirate', /\bpirates?\b|\btreasure\b/, '🏴‍☠️', 'Pirate', 'ocean'],
  ['princess', /\bprincess(es)?\b|\bcastle\b/, '👸', 'Princess', 'candy'], ['knight', /\bknights?\b/, '🛡️', 'Knight', 'gold'],
  ['wizard', /\bwizards?\b|\bmagic\b|\bwitch(es)?\b/, '🧙', 'Wizard', 'night'], ['ninja', /\bninjas?\b/, '🥷', 'Ninja', 'night'],
  ['bird', /\bbirds?\b/, '🐦', 'Birdie', 'sunset'], ['butterfly', /\bbutterfl(y|ies)\b/, '🦋', 'Butterfly', 'candy'],
  ['turtle', /\bturtles?\b|\btortoise\b/, '🐢', 'Turtle', 'mint'], ['horse', /\bhorses?\b|\bpon(y|ies)\b/, '🐴', 'Pony', 'sunset'],
  ['owl', /\bowls?\b/, '🦉', 'Owl', 'night'], ['bear', /\bbears?\b|\bteddy\b/, '🐻', 'Bear', 'forest'],
  ['pizza', /\bpizzas?\b/, '🍕', 'Pizza', 'lava'], ['cake', /\bcakes?\b|\bcupcakes?\b|\bbak(e|ing)\b|\bcook(ing)?\b|\bchef\b/, '🧁', 'Cupcake', 'candy'],
  ['candy', /\bcand(y|ies)\b|\bsweets\b/, '🍬', 'Candy', 'candy'], ['soccer', /\bsoccer\b|\bfootball\b/, '⚽', 'Soccer', 'forest'],
  ['basketball', /\bbasketball\b/, '🏀', 'Hoops', 'lava'], ['car', /\bcars?\b|\btrucks?\b/, '🚗', 'Car', 'sunset'],
  ['train', /\btrains?\b/, '🚂', 'Train', 'gold'], ['snowman', /\bsnow(man)?\b|\bwinter\b|\bchristmas\b/, '⛄', 'Snowy', 'ocean'],
  ['star', /\bstars?\b/, '⭐', 'Star', 'night'], ['flower', /\bflowers?\b|\bgarden\b/, '🌸', 'Flower', 'mint'],
];
const COVER_TINT = { ocean: '#1e90ff', lava: '#ff6a00', forest: '#2fb34a', night: '#5b4bff', candy: '#ff5fb0', sunset: '#ff8a3d', mint: '#22c7a9', gold: '#ffc400' };

/** -> { key, emoji, name, cover } or null. The theme mentioned LAST wins (e.g. "change the hero to a dragon"). */
export function detectTheme(text) {
  const t = norm(text); let best = null, at = -1;
  for (const [key, re, emoji, name, cover] of THEMES) {
    const g = new RegExp(re.source, 'g'); let m;
    while ((m = g.exec(t))) if (m.index >= at) { at = m.index; best = { key, emoji, name, cover }; }
  }
  return best;
}
export const themeByKey = k => { const r = THEMES.find(x => x[0] === k); return r ? { key: r[0], emoji: r[2], name: r[3], cover: r[4] } : null; };

export function detectPlayers(text) {
  const t = norm(text);
  if (/\bpass (the )?(phone|tablet|ipad)\b|\btake turns?\b/.test(t)) return 'pass';
  if (/\b(two|2)[ -]?players?\b|\bwith (a|my) (friend|brother|sister|mum|mom|dad)\b|\bone screen\b|\btogether\b/.test(t)) return 'two';
  if (/\bjust me\b|\bsolo\b|\bon my own\b|\bby myself\b|\bone player\b|\b1 player\b|\bthe bot\b|\bcomputer\b/.test(t)) return 'solo';
  return null;
}
export function detectLearn(text) {
  const t = norm(text);
  if (/\bspell(ing)?\b|\breading\b|\bphonics\b|\bletters?\b/.test(t)) return 'spelling';
  if (/\bmaths?\b|\bmath\b|\bsums\b|\bnumbers?\b|\btimes tables?\b|\badding\b/.test(t)) return 'maths';
  if (/\bgeography\b|\bcountr(y|ies)\b|\bcapitals?\b|\bflags?\b|\bmaps?\b/.test(t)) return 'geography';
  if (/\bmusic(al)?\b|\bnotes?\b|\bsongs?\b|\brhythm\b/.test(t)) return 'music';
  if (/\bjust (for )?fun\b|\bno learning\b|\bnothing\b|\bnope\b|\bno thanks\b|^no\b/.test(t)) return 'none';
  return null;
}

export const COLOR_WORDS = {
  red: '#ff2d2d', pink: '#ff5fb0', orange: '#ff8a1f', yellow: '#ffd400', gold: '#ffc400', green: '#22c55e', blue: '#2f6bff',
  purple: '#9b5cff', rainbow: '#ff5fb0', teal: '#14b8a6', black: '#1f2937', dark: '#1f2937', night: '#312e81', white: '#f8fafc', brown: '#a16207',
};
const CYCLE = ['#9b5cff', '#22c55e', '#ff5fb0', '#ff8a1f', '#2f6bff'];
/** Named colour in the text -> { name, hex } or null. */
export function detectColor(text) {
  const t = norm(text);
  for (const [name, hex] of Object.entries(COLOR_WORDS)) if (new RegExp(`\\b${name}\\b`).test(t)) return { name, hex };
  return null;
}
export const nextColor = current => CYCLE[(CYCLE.indexOf(current) + 1) % CYCLE.length];
export const tintFor = cover => COVER_TINT[cover] || '';

const SUFFIX = { quiz: 'Quiz', runner: 'Dash', catch: 'Catch', memory: 'Memory', word: 'Words', duel: 'Duel', board: 'Race' };
export function titleFor(kind, theme) {
  const s = SUFFIX[kind] || 'Game';
  return theme ? `${theme.name} ${s}` : ({ quiz: 'Super Quiz', runner: 'Super Dash', catch: 'Catch It!', memory: 'Memory Match', word: 'Word Wizard', duel: 'Duel Time', board: 'Race Board' }[kind] || 'My Game');
}
export const CATEGORY_FOR = { quiz: 'learning', runner: 'arcade', catch: 'arcade', memory: 'puzzle', word: 'words', duel: 'silly', board: 'board' };

// Chips the Builder offers.
export const KIND_CHIPS = ['🏃 A running and jumping game', '🧺 Catch the falling things', '❓ A quiz game', '🃏 A memory match', '🔤 A word game', '⚔️ Two players on one phone', '🎲 A board game', '✨ Surprise me!'];
export const THEME_CHIPS = ['🦈 Sharks', '🐉 Dragons', '🤖 Robots', '🦄 Unicorns', '🦖 Dinosaurs', '🚀 Space', '🐱 Cats', '🍕 Pizza'];
export const LEARN_CHIPS = ['🔤 Spelling', '➕ Maths', '🌍 Geography', '🎵 Music', '🎉 Just for fun'];
export const PLAYER_CHIPS = ['👤 Just me', '📱 Pass the phone', '👫 Two on one screen'];
export const NEXT_CHIPS = ['Make it harder', 'Add a second level', 'Change the hero to a dragon'];
