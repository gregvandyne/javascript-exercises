// Mock Builder provider: used whenever ANTHROPIC_API_KEY is absent so the whole platform and the tests run without a key.
// Deterministic and drives the full flow through the same tools as Claude:
//   no game yet  -> at most 3 questions (skipping what the message already says) via ask_user with idea chips
//                -> a 2-3 sentence plan -> set_game + write_game (best-matching template, personalised) -> test_notes + 3 next-step chips
//   game exists  -> "make it harder / easier / faster", "change the colour", "change the hero to X", "add a second level",
//                   "call it X" -> edit_game with real find/replace edits (a new version)
//                -> "it's ready" / "polish" -> polish pass with a checklist
//                -> "upgrade it" / "the new look" (an older game, before the Oomba Kit) -> rebuilt on the kit template of
//                   its kind, keeping its title and tune-ups; only when asked, never on its own
// Games on the Oomba Kit (every template) are changed through the kit layer (layer.js): character looks, the biome,
// the title and the game clock are spec edits on single BRB_TUNE lines ("make the fox blue with a hat").
// Text is streamed in small chunks so the SSE path is exercised.
// The runner's checkpoint (ctx.between) runs before it starts (a stopped build does nothing) and after each pass (a
// question, or a version with its notes): new messages the builder sent meanwhile are used right away, as the answer
// to the question or as a change to the new version, then the pass repeats (at most 4 passes). Messages that arrive
// after the last checkpoint are carried into the next build by the runner. BRB_MOCK_INBOX_WAIT_MS (tests and demos
// only) makes the end-of-pass checkpoint wait that long for a message.
// Carried on after a restart (ctx.resume) with a version already saved, it says so and asks what's next instead of
// building again (or applies the new messages it carries); with nothing saved yet it runs the message again.
// Live build steps: one "blocks" row (the simple building blocks, never described as an AI); its tool calls add
// the same name / check / notes / ask rows as Claude's, from tools.js. It never gets AI rows (rounds, playtests).
import { templateHtml, templateInfo } from './catalog.js';
import { detectKind, detectTheme, themeByKey, detectPlayers, detectLearn, detectColor, nextColor, titleFor, CATEGORY_FOR, DEFAULT_KIND,
  KIND_CHIPS, THEME_CHIPS, LEARN_CHIPS, PLAYER_CHIPS, NEXT_CHIPS, THEMES, kitLook, KIT_HUES, KIT_WEAR, KIT_SPECIES, KIT_BIOMES } from './themes.js';
import { withLayer, readTune, tuneEdits, hasLayer, guessHero, shownTitle, LAYER_ID, kitLayerFor, usesKit } from './layer.js';
import { TEMPLATES } from './templates/index.js';
import { cleanText } from '../services/textfilter.js';
import { isThreeGame } from '../services/vendor.js';
import { NO_STEPS } from './steps.js';

const sleep = ms => new Promise(r => setTimeout(r, ms));
/** Milliseconds between streamed chunks of three words (BRB_MOCK_DELAY_MS, 12 by default). */
export const chunkDelay = () => { const d = +process.env.BRB_MOCK_DELAY_MS; return Number.isFinite(d) ? d : 12; };
const inboxWait = () => Math.max(0, +process.env.BRB_MOCK_INBOX_WAIT_MS || 0);
async function say(ctx, text) {
  const parts = String(text).match(/\S+\s*/g) || [];
  for (let i = 0; i < parts.length; i += 3) {
    if (ctx.signal && ctx.signal.aborted) return;
    ctx.emit('text', { text: parts.slice(i, i + 3).join('') });
    if (chunkDelay()) await sleep(chunkDelay());
  }
}

const PLANS = {
  catch: 'Slide left and right (or use the arrow keys) to catch the good things and dodge the bad ones. Every catch is a point, it gets faster as you go, and a round lasts one minute.',
  runner: 'Tap (or press space) to jump over the bumps and grab coins. It speeds up the longer you run, and you can pause or mute any time.',
  quiz: 'Ten quick questions with big answer buttons and a timer bar. Answer in a row for a streak bonus, and get a cheer at the end.',
  memory: 'Flip two cards at a time to find the pairs. Fewer flips means more stars, and each level adds more cards.',
  word: 'Pick the missing letters with big friendly buttons. Every word you finish earns a star, and the words get a little longer.',
  duel: 'Two players share one screen: each one gets a big button. Wait for the signal, then tap first. Best of five wins.',
  board: 'Roll the die and race along the path with boosts and slides. Play with a friend on one phone or against the bot.',
  island: 'Walk around a 3D island with the arrow keys or by dragging, hop up the floating rocks and find every star before time runs out. Some stars float high, so jump!',
};
const CHECK = {
  catch: ['Catch three good things in a row', 'Bump into a bad one and watch a heart go', 'Press ⏸ to pause, then keep going', 'Tap 🔊 to switch the sound off and on'],
  runner: ['Jump over the first few bumps', 'Grab some coins', 'Crash on purpose and press Play again', 'Tap 🔊 to switch the sound off and on'],
  island: ['Walk with the arrow keys, or drag on the screen', 'Hop up the floating rocks to the top star', 'Jump to grab a star that floats high', 'Tap 🔊 to switch the sound off and on'],
  default: ['Play a whole round from start to finish', 'Try it with taps and with the keyboard', 'Press Play again at the end', 'Tap 🔊 to switch the sound off and on'],
};
const POLISH = ['Words are easy to read on a small phone', 'Every screen has a way forward (no dead ends)', 'Play again restarts cleanly', 'The mute button works', 'Nothing is mean or scary', 'It runs smoothly'];

function nextChips(tune) {
  const c = NEXT_CHIPS.slice();
  if (tune.speed > 1) c[0] = 'Make it even harder';
  if (tune.level2) c[1] = 'Change the colours';
  if (tune.hero && tune.hero[1] === '🐉') c[2] = 'Change the hero to a unicorn';
  return c;
}

async function acknowledgeUploads(ctx) {
  for (const u of ctx.uploads || []) await say(ctx, `I love your ${u.kind === 'image' ? 'picture' : 'file'} "${u.name}"! I'll use it for ideas. `);
}

// ---- No game yet: questions, then build ----------------------------------------------------------
async function plan(ctx, m) {
  const { text, tools } = ctx; const a = m.answers;
  const kind = detectKind(text), theme = detectTheme(text), players = detectPlayers(text), learn = detectLearn(text);
  if (kind) a.kind = kind; if (theme) a.theme = theme.key; if (players) a.players = players; if (learn) a.learn = learn;
  if (m.pending === 'theme' && !a.theme && /\b(you pick|surprise|anything|dunno|don'?t know)\b/i.test(text)) a.theme = 'fox';
  if (m.pending && !a[m.pending]) a[m.pending] = { kind: DEFAULT_KIND, theme: '', learn: 'none', players: 'solo' }[m.pending];
  if (/\bjust build\b|\bbuild it\b|\bjust make\b|\bstart building\b|\bno more questions\b/i.test(text)) m.skip = true;
  m.pending = null;
  const want = ['kind', 'theme'];
  if (['quiz', 'word', 'memory'].includes(a.kind)) want.push('learn');
  if (a.kind === 'board') want.push('players');
  const next = !m.skip && m.asked.length < 3 ? want.find(k => a[k] === undefined && !m.asked.includes(k)) : null;
  if (next) {
    m.pending = next; m.asked.push(next);
    const Q = {
      kind: [m.asked.length === 1 ? 'Let’s build a game together! 🎮 ' : 'Great! ', 'What kind of game should we make?', KIND_CHIPS],
      theme: [a.kind ? 'Ooh, good choice! ' : 'Fun! ', 'Who is the hero, or what is it about?', [...THEME_CHIPS, '🙂 You pick!']],
      learn: ['Nice! ', 'Should it help with something to learn?', LEARN_CHIPS],
      players: ['Almost ready! ', 'Who is playing?', PLAYER_CHIPS],
    }[next];
    await say(ctx, Q[0]);
    tools.exec('ask_user', { question: Q[1], options: Q[2] });
    return;
  }
  await build(ctx, m);
}

async function build(ctx, m) {
  const { tools } = ctx; const a = m.answers;
  const kind = a.kind || DEFAULT_KIND;
  const theme = a.theme ? themeByKey(a.theme) : null;
  const info = await templateInfo(kind);
  const { html: base, fallback } = await templateHtml(kind);
  const realKind = fallback ? 'catch' : kind;   // 'island' is the 3D template (Star Island)
  const title = titleFor(kind, theme);
  const html = personalise(base, title, theme, info.icon);
  const learnBit = a.learn && a.learn !== 'none' ? ` It sneaks in some ${a.learn} too.` : '';
  await say(ctx, `Here's my plan for ${title} ${theme ? theme.emoji : info.icon}: ${PLANS[realKind] || PLANS.catch}${learnBit} Building it now…\n\n`);
  tools.exec('set_game', {
    title, icon: theme ? theme.emoji : info.icon,
    description: `${theme ? `A ${theme.name.toLowerCase()} game! ` : ''}${info.description}`.slice(0, 300),
    category: a.learn && a.learn !== 'none' ? 'learning' : (CATEGORY_FOR[kind] || info.category),
    tags: [kind, theme && theme.key, a.learn !== 'none' && a.learn].filter(Boolean),
    players: a.players === 'two' || a.players === 'pass' || kind === 'duel' ? 2 : (info.players || 1),
    cover: theme ? theme.cover : info.cover,
  });
  const r = tools.exec('write_game', { html, notes: `First version of ${title}` });
  m.built = true;
  if (!r.ok) { await say(ctx, 'Hmm, the safety check found a problem. Ask me to fix it and I will!'); return; }
  await say(ctx, `Your game is ready! 🎉 Press Play in the preview and give it a go.`);
  tools.exec('test_notes', { checklist: CHECK[realKind] || CHECK.default });
  tools.exec('ask_user', { question: 'What should we change next?', options: nextChips(readTune(html)) });
}

// ---- Game exists: edits ---------------------------------------------------------------------------
async function followUp(ctx, m, cur) {
  const { text, tools } = ctx; const g = tools.game();
  const t = text.toLowerCase();
  const tune = readTune(cur.html); const changes = {}; const said = [];
  if (/\b(fix|repair)\b/.test(t) && cur.safety_status === 'fail') return fixSafety(ctx, m, cur);
  if (UPGRADE.test(t)) return upgrade(ctx, m, cur);
  const kit = kitLayerFor(cur.html);
  if (/\b(ready|polish|finished|all done|it'?s done|publish|perfect|looks good)\b/.test(t)) {
    await say(ctx, 'Polish time! ✨ Here is a checklist of things to try in your game. Press Publish when you are happy with it!');
    tools.exec('test_notes', { checklist: POLISH });
    tools.exec('ask_user', { question: 'Anything else before you publish?', options: ['🚀 It is ready!', ...nextChips(tune).slice(0, 2)] });
    return;
  }
  if (/\b(harder|faster|difficult|tricky|trickier|speed (it )?up|more challenging|too easy)\b/.test(t)) {
    changes.speed = Math.min(3, Math.round(((tune.speed || 1) * 1.25) * 100) / 100); said.push('made it faster and trickier 🔥');
  } else if (/\b(easier|slower|too hard|too fast|slow (it )?down)\b/.test(t)) {
    changes.speed = Math.max(0.5, Math.round(((tune.speed || 1) * 0.8) * 100) / 100); said.push('made it a bit slower and easier 🐢');
  }
  if (/\b(second|2nd|another|new|next|more) levels?\b|\blevel (2|two)\b/.test(t)) { changes.level2 = true; said.push('added Level 2: after 40 seconds it speeds up with a big banner 🚀'); }
  let theme = detectTheme(text);
  // In a 3D game "stars" are the things to collect, not a new hero (unless they say so).
  if (theme && theme.key === 'star' && isThreeGame(cur.html) && !/\b(hero|player|character)\b/.test(t)) theme = null;
  // "play as me" in Star Island: the hero becomes the character the player designed on their Me page.
  const asMe = /\b(play as (me|myself)|my (own )?(character|avatar|oomba)|me as the hero|the hero (be|is) me|make (the hero|it) me)\b/.test(t);
  if (kit) Object.assign(changes, kitChanges(t, cur.html, tune, theme, said));
  else if (asMe && isThreeGame(cur.html)) {
    const from = (tune.hero && tune.hero[0]) || guessHero(cur.html, g.icon);
    if (from) { changes.hero = [from, 'me']; said.push('made the hero you: the character from your Me page 🎨'); }
  } else if (theme && (/\b(hero|player|character|guy|main)\b|\bchange\b|\bturn\b|\bmake (it|him|her|them)\b|\binstead\b|\binto\b|\babout\b/.test(t))) {
    const from = (tune.hero && tune.hero[0]) || guessHero(cur.html, g.icon);
    if (from) { changes.hero = [from, theme.emoji]; said.push(`swapped in a ${theme.name.toLowerCase()} ${theme.emoji}`); }
  }
  // 3D games (Star Island): the stars, floating rocks and sky are lines in CONFIG, changed in place.
  const conf = isThreeGame(cur.html) ? threeDChanges(t, cur.html, said) : {};
  const col = detectColor(text);
  const skyWord = conf.sky && col && ['night', 'dark'].includes(col.name);
  if (!kit && !skyWord && (col || (/\bcolou?rs?\b/.test(t) && !conf.sky))) { changes.tint = col ? col.hex : nextColor(tune.tint); said.push(col ? `gave it a ${col.name} colour splash 🎨` : 'gave it new colours 🎨'); }
  const rename = text.match(/\b(?:call it|name it|rename it(?: to)?|title it)\s+["“']?([^"”'\n]{2,40})/i);
  if (rename) {
    const c = cleanText(rename[1].trim(), 40);
    if (c.ok && c.value) {
      tools.exec('set_game', { title: c.value }); said.push(`renamed it “${c.value}”`);
      if (kit) changes.name = [tune.name[0] || shownTitle(cur.html), c.value];   // the title the kit game shows
      // In a 3D game the title also shows inside the game (the title card), so keep CONFIG.title in step.
      if (isThreeGame(cur.html) && readConfig(cur.html, 'title') !== undefined) conf.title = c.value;
    }
  }
  if (!Object.keys(changes).length && !Object.keys(conf).length) {
    if (said.length) { await say(ctx, `Done! I ${said.join(' and ')}.`); return; }
    await say(ctx, 'I can change lots of things! Try one of these, or tell me in your own words.');
    tools.exec('ask_user', { question: 'What should we change?', options: [...nextChips(tune), 'Make it easier', 'Change the colours', '✨ Polish it'] });
    return;
  }
  if (theme && (changes.hero || (changes.look && said.some(x => x.startsWith('swapped in'))))) tools.exec('set_game', { icon: theme.emoji });
  const confEdits = configEdits(cur.html, conf);
  const edits = Object.keys(changes).length ? tuneEdits(cur.html, changes) : [];
  // Tidy the version note: drop only the trailing emoji from each phrase, keeping brackets, numbers and quotes
  // (so "added more stars (16) ⭐" becomes "added more stars (16)", not "added more stars16)").
  const notes = said.join(', ').replace(/\s*\p{Extended_Pictographic}️?/gu, '').replace(/^./, c => c.toUpperCase()).slice(0, 120);
  let r;
  if (edits && confEdits && edits.length + confEdits.length) r = tools.exec('edit_game', { edits: [...confEdits, ...edits], notes });
  else r = tools.exec('write_game', { html: applyConfig(withLayer(stripLayer(cur.html), { ...tune, ...changes }), conf), notes });
  if (!r.ok) { await say(ctx, 'Hmm, that change did not work. Try asking in a different way!'); return; }
  await say(ctx, `Done! I ${said.join(' and ')}. Press Play to try version ${r.version.number}.`);
  tools.exec('test_notes', { checklist: ['Play a round and see the change', 'Check it is still fair and fun', 'Press Play again at the end'] });
  tools.exec('ask_user', { question: 'What next?', options: nextChips({ ...tune, ...changes }) });
}
const stripLayer = html => String(html).replace(new RegExp(`\\n?<script id="${LAYER_ID}"(?: data-kit="1")?>[\\s\\S]*?<\\/script>`), '');

/** A template made theirs: its title, and the theme's hero (a kit look and biome on a kit game, an emoji swap on 3D). */
function personalise(base, title, theme, icon, extra = {}) {
  const oldTitle = shownTitle(base), named = base.replace(/<title>[^<]*<\/title>/i, `<title>${title}</title>`);
  if (kitLayerFor(base)) {
    const look = theme ? kitLook(theme, base) : null;
    return withLayer(named, { name: oldTitle ? [oldTitle, title] : ['', ''], look: look && look.spec ? { hero: look.spec } : {}, biome: (look && look.biome) || '', ...extra });
  }
  const heroFrom = guessHero(base, icon);
  return withLayer(named, { hero: theme && heroFrom ? [heroFrom, theme.emoji] : ['', ''], name: oldTitle ? [oldTitle, title] : ['', ''], ...extra });
}

// ---- Kit games: character looks, the world, as spec edits (the kit layer's BRB_TUNE.look / .biome lines) ---------
const merge = (a, b) => { const r = { ...(a || {}) }; for (const [k, v] of Object.entries(b || {})) r[k] = v && typeof v === 'object' && !Array.isArray(v) ? merge(r[k], v) : v; return r; };
const KIT_CYCLE = ['grape', 'mint', 'coral', 'peach', 'sky'];
const HUE_WORDS = { coral: 'red', peach: 'orange', mint: 'green', sky: 'blue', grape: 'purple', cocoa: 'brown', stone: 'grey', snow: 'white' };
/** The look changes a message asks for in a kit game -> { look, biome } (only what changes) plus phrases for the reply. */
function kitChanges(t, html, tune, theme, said) {
  const out = {}; let look = { ...(tune.look || {}) };
  const col = detectColor(t), hue = col ? KIT_HUES[col.name] : null;
  const wear = KIT_WEAR.filter(([re]) => re.test(t)).map(([, w]) => w);
  const named = KIT_SPECIES.filter(([, re]) => re.test(t)).map(([s]) => s);
  const heroish = /\b(hero|player|character|guy|main|me|my)\b|\bchange\b|\bturn\b|\bmake (it|him|her|them)\b|\binstead\b|\binto\b|\babout\b/.test(t);
  if (theme && heroish && !(named.length && (hue || wear.length))) {
    const L = kitLook(theme, html);
    if (L && L.spec) { look.hero = L.spec; said.push(`swapped in a ${theme.name.toLowerCase()} ${theme.emoji}`); }
  }
  const dress = (key, who) => {
    const p = {};
    if (hue) Object.assign(p, merge(p, { colors: { base: hue }, outfit: { color: hue } }));
    if (wear.length) p.wear = [...new Set([...((look[key] && look[key].wear) || []), ...wear])];
    if (!Object.keys(p).length) return;
    look[key] = merge(look[key], p);
    said.push(`made ${who}${hue ? ` ${HUE_WORDS[hue] || hue}` : ''}${wear.length ? ` with ${wear.map(w => (w === 'wizard-hat' ? 'a hat' : w === 'glasses' ? 'glasses' : `a ${w}`)).join(' and ')}` : ''} 🎨`);
  };
  if (named.length && (hue || wear.length)) for (const sp of named) dress(sp, `the ${sp}`);
  else if (hue || wear.length) dress('hero', 'the hero');
  else if (/\bcolou?rs?\b/.test(t) && !look.hero) { look.hero = { colors: { base: KIT_CYCLE[0] }, outfit: { color: KIT_CYCLE[0] } }; said.push('gave the hero new colours 🎨'); }
  else if (/\bcolou?rs?\b/.test(t)) { const now = (look.hero.colors || {}).base, next = KIT_CYCLE[(KIT_CYCLE.indexOf(now) + 1) % KIT_CYCLE.length]; look.hero = merge(look.hero, { colors: { base: next }, outfit: { color: next } }); said.push('gave the hero new colours 🎨'); }
  if (JSON.stringify(look) !== JSON.stringify(tune.look || {})) out.look = look;
  const world = KIT_BIOMES.find(([, re, pack]) => re.test(t) && (!pack || String(html).includes(`/packs/${pack}.js`)));
  if (world && /\b(world|place|level|background|make it|set it|go to|in the|island)\b/.test(t) && world[0] !== tune.biome) { out.biome = world[0]; said.push(`moved it to the ${world[0]} 🌍`); }
  return out;
}

// ---- "Upgrade it": an older game rebuilt on the Oomba Kit (only when the builder asks) -------------------------
// Only an unambiguous ask: "upgrade it", "upgrade my game", "the new look", "Oomba Kit". Never "add an upgrade shop",
// "upgrade the hero's sword" or "give the player upgrades" (those are game ideas, not a rebuild).
const UPGRADE = /\bupgrade (?:it|this|my game|the game|this game|my old game)\b(?!\s*(?:'s|s)\b)|\bnew(est)? (?:oomba )?look\b|\boomba kit\b|\blook like the new games\b|\bmoderni[sz]e (?:it|my game|the game|this game)\b|\bmake it look new\b/i;
const kindOf = (html, g, m) => {
  if (m.answers && m.answers.kind) return m.answers.kind;
  const first = readTune(html).name[0] || shownTitle(html);
  const t = TEMPLATES.find(x => x.title === first || x.title === g.title);
  return t ? t.key : isThreeGame(html) ? 'island' : detectKind(`${g.title} ${g.tags || ''} ${g.description || ''}`) || DEFAULT_KIND;
};
async function upgrade(ctx, m, cur) {
  const { tools } = ctx, g = tools.game();
  if (usesKit(cur.html)) { await say(ctx, 'Your game already has the newest Oomba look! ✨ What should we change next?'); tools.exec('ask_user', { question: 'What next?', options: nextChips(readTune(cur.html)) }); return; }
  const kind = kindOf(cur.html, g, m), info = await templateInfo(kind), { html: base, fallback } = await templateHtml(kind);
  if (fallback) { await say(ctx, 'Hmm, I can’t do that one right now. Try again later!'); return; }
  const tune = readTune(cur.html), emoji = tune.hero && tune.hero[1], theme = emoji ? themeByKey((THEMES.find(x => x[2] === emoji) || [])[0]) : null;
  let html = personalise(base, g.title, theme, info && info.icon, { speed: tune.speed || 1, level2: !!tune.level2 });
  if (kind === 'island') for (const k of ['stars', 'platforms', 'sky']) { const v = readConfig(cur.html, k); if (v !== undefined) html = applyConfig(html, { [k]: v }); }
  if (kind === 'island' && readConfig(html, 'title') !== undefined) html = applyConfig(html, { title: g.title });
  await say(ctx, 'Upgrade time! ✨ I rebuilt your game with the new Oomba look: new characters, screens, sounds and every language. ');
  const r = tools.exec('write_game', { html, notes: 'Upgraded to the new Oomba look' });
  if (!r.ok) { await say(ctx, 'Hmm, that did not work. Try asking in a different way!'); return; }
  await say(ctx, `Press Play to try version ${r.version.number}. Your old game is still in Versions if you want it back.`);
  tools.exec('test_notes', { checklist: CHECK[kind] || CHECK.default });
  tools.exec('ask_user', { question: 'What next?', options: nextChips(readTune(html)) });
}

// ---- 3D games: CONFIG lines (stars, platforms, sky) --------------------------------------------
const configBlock = html => (String(html).match(/const CONFIG\s*=\s*\{[\s\S]*?\n\};/) || [])[0] || '';
const configLine = (html, key) => configBlock(html).match(new RegExp(`\\n(\\s*${key}:\\s*)([^,\\n]+),`));
const literal = v => (typeof v === 'number' ? String(v) : `'${String(v).replace(/[^a-z]/gi, '')}'`);
// The title can be any cleaned text (spaces, digits, other scripts), so it is escaped as a whole, not reduced to letters.
const titleLiteral = v => `'${String(v).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
export function readConfig(html, key) {
  const m = configLine(html, key); if (!m) return undefined;
  const v = m[2].trim(); return /^-?\d+(\.\d+)?$/.test(v) ? +v : v.replace(/^['"]|['"]$/g, '');
}
/** find/replace edits for CONFIG values, each on its own unique line; null if one cannot be found exactly once. */
export function configEdits(html, changes) {
  const edits = [];
  for (const [k, v] of Object.entries(changes || {})) {
    const m = configLine(html, k); if (!m) return null;
    const find = `\n${m[1]}${m[2]},`, replace = `\n${m[1]}${k === 'title' ? titleLiteral(v) : literal(v)},`;
    if (String(html).split(find).length !== 2) return null;
    if (find !== replace) edits.push({ find, replace });
  }
  return edits;
}
const applyConfig = (html, changes) => { const e = configEdits(html, changes) || []; return e.reduce((h, x) => h.replace(x.find, x.replace), html); };
function threeDChanges(t, html, said) {
  const out = {};
  const stars = readConfig(html, 'stars'), plats = readConfig(html, 'platforms');
  const n = t.match(/\b(\d{1,2}) stars\b/);
  if (typeof stars === 'number') {
    if (n) { out.stars = Math.max(1, Math.min(20, +n[1])); said.push(`set it to ${out.stars} stars ⭐`); }
    else if (/\b(more|extra|lots of|loads of) stars\b/.test(t)) { out.stars = Math.min(20, stars + 4); said.push(`added more stars (${out.stars}) ⭐`); }
    else if (/\b(fewer|less|not so many) stars\b/.test(t)) { out.stars = Math.max(3, stars - 4); said.push(`made it ${out.stars} stars ⭐`); }
  }
  if (typeof plats === 'number' && /\b(more|extra|higher|taller|bigger)\b.*\b(platforms?|floating rocks?|rocks to (jump|hop)|steps)\b|\badd (some )?(platforms|floating rocks)\b/.test(t)) {
    out.platforms = Math.min(10, plats + 2); said.push(`added more floating rocks to hop up (${out.platforms}) 🪨`);
  }
  // Match the sky on the text WITHOUT the new name, so "call it Moon Hop" doesn't turn the sky to night.
  const skyText = t.replace(/\b(?:call it|name it|rename it(?: to)?|title it)\b[\s\S]*$/, '');
  const sky = /\bnight|\bdark sky\b|\bmoon\b/.test(skyText) ? 'night' : /\bsunset\b|\bevening\b|\bdusk\b/.test(skyText) ? 'sunset' : /\b(day ?time|morning|sunny|daylight)\b/.test(skyText) ? 'day' : null;
  if (sky && readConfig(html, 'sky') !== undefined) { out.sky = sky; said.push({ night: 'made it night time with twinkly stars 🌙', sunset: 'made it a sunset sky 🌅', day: 'made it a sunny day ☀️' }[sky]); }
  return out;
}

async function fixSafety(ctx, m, cur) {
  const g = ctx.tools.game(), kind = m.answers.kind || kindOf(cur.html, g, m);
  const { html: base } = await templateHtml(kind);
  const tune = readTune(cur.html);
  await say(ctx, 'On it! 🛠️ I rebuilt the game without the part the safety check did not like.');
  let html;
  if (!usesKit(cur.html) && kitLayerFor(base)) {
    // an older game rebuilt on its kit template: its hero and colour come across as the matching theme (the kit layer
    // has no hero/tint keys, so they are mapped, never silently dropped), with its title, speed and level 2
    const emoji = tune.hero && tune.hero[1], theme = emoji ? themeByKey((THEMES.find(x => x[2] === emoji) || [])[0]) : null, info = await templateInfo(kind);
    html = personalise(base, g.title, theme, info && info.icon, { speed: tune.speed || 1, level2: !!tune.level2 });
  } else {
    const named = base.replace(/<title>[^<]*<\/title>/i, `<title>${g.title}</title>`);
    html = withLayer(named, kitLayerFor(named) && !hasLayer(cur.html) ? {} : tune);
  }
  const r = ctx.tools.exec('write_game', { html, notes: 'Fixed the safety check' });
  if (r.ok) ctx.tools.exec('ask_user', { question: 'All fixed! What next?', options: nextChips(readTune(html)) });
}

/** The runner's checkpoint: null when the build was stopped, else the new messages (read and used at once). */
async function readNew(ctx, round, wait = false) {
  const b = ctx.between ? await ctx.between(round, { waitMs: wait ? inboxWait() : 0 }) : { add: [] };
  if (b.stop) return null;
  if (b.add.length) { (ctx.steps || NO_STEPS).start('read', { m: b.add.length }); if (ctx.settle) ctx.settle(); }
  return b.add;
}

export async function run(ctx) {
  (ctx.steps || NO_STEPS).start('blocks');
  const st = ctx.state; st.mock = st.mock || { asked: [], answers: {} };
  const m = st.mock;
  const early = await readNew(ctx, 1);   // also the messages a follow-on build starts with
  if (early === null) return { model: 'mock' };
  await acknowledgeUploads(ctx);
  // Carried on after a restart, or a Continue: the message is the earlier one.
  const base = (ctx.resume && ctx.resume.original) || ctx.text;
  const saved = !!(ctx.resume && ctx.resume.versions && ctx.resume.versions.length && ctx.tools.current());
  if (saved && !early.length) {
    const v = ctx.resume.versions.at(-1).number;
    await say(ctx, `I'm back! Your game is saved as version ${v}, so I carried on from there.`);
    ctx.tools.exec('test_notes', { checklist: CHECK.default });
    ctx.tools.exec('ask_user', { question: 'What should we change next?', options: nextChips(readTune(ctx.tools.current().html)) });
    return { model: 'mock', tokensIn: 0, tokensOut: 0 };
  }
  // With a version saved before the restart, only the new messages are still to do.
  let text = [saved ? '' : base, ...early.map(e => e.text)].filter(Boolean).join('\n');
  if (early.length && base) await say(ctx, ctx.resume ? "I'm back, and I got your new message! " : 'Got your new message too! ');
  for (let pass = 0; pass < 4; pass++) {
    const cur = ctx.tools.current();
    if (!text) { if (!cur) ctx.tools.exec('ask_user', { question: 'What kind of game should we make?', options: KIND_CHIPS }); }
    else if (cur) await followUp({ ...ctx, text }, m, cur);
    else await plan({ ...ctx, text }, m);
    const fu = await readNew(ctx, pass + 2, true);   // after a question (the answer) or a version (a change)
    if (!fu || !fu.length) break;
    await say(ctx, 'Got your new message! ');
    text = fu.map(e => e.text).join('\n');
  }
  return { model: 'mock', tokensIn: 0, tokensOut: 0 };
}
export { hasLayer };
