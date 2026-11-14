// The mock Builder's Kit 2 side (mock.js runs it): builds a 3D game in one of the ready-made worlds from the Kit 2
// starter (kit2.js kit2Starter: the same file the AI starts from), and changes one with real edit_game edits on the
// starter's CONFIG lines ("change the hero to the wizard", "make it night", "make it snow", "a blue cape", "make it
// harder", "call it ..."), or a new version from the starter when the world changes ("move it to Toy Town"), carrying
// the title, the hero's look, the questions and the words over. Deterministic, no model, the same tools as the AI.
import { worldById, characterById, heroesOf, heroFor, creatureFor, hasAnimals, kit2Starter, kit2Of, isKit2Game, worldLook, KIT2_WORLDS, KIT2_CHARACTERS } from './kit2.js';
import { detectTheme, detectColor } from './themes.js';
import { cleanText } from '../services/textfilter.js';
import { asksForLive } from './prompt.js';

const lookOf = worldLook;
const CHECK = ['Walk with the arrow keys, or the buttons on a phone', 'Jump from stone to stone and grab the coins', 'Jump onto the right answer', 'Reach the goal and press Play again'];
const POLISH = ['Words are easy to read on a small phone', 'Every screen has a way forward (no dead ends)', 'Play again restarts cleanly', 'The questions have one right answer', 'Nothing is mean or scary', 'It runs smoothly'];

// ---- The starter's CONFIG lines (one key per line), read and changed in place -----------------------------------
const line = (html, key) => new RegExp(`\\n(  ${key}: )([^\\n]*?),\\n`).exec(String(html));
const lit = v => (typeof v === 'number' ? String(v) : `'${String(v).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/[<>\n\r]/g, '')}'`);
export function k2Read(html, key) {
  const m = line(html, key); if (!m) return undefined;
  const v = m[2].trim(); return /^-?\d+(\.\d+)?$/.test(v) ? +v : v.replace(/^'|'$/g, '').replace(/\\'/g, "'").replace(/\\\\/g, '\\');
}
/** find/replace edits for CONFIG values; null when a line is missing or not unique (the caller then writes the game). */
export function k2Edits(html, changes) {
  const edits = [];
  for (const [k, v] of Object.entries(changes || {})) {
    const m = line(html, k); if (!m) return null;
    const find = `\n${m[1]}${m[2]},\n`, replace = `\n${m[1]}${lit(v)},\n`;
    if (String(html).split(find).length !== 2) return null;
    if (find !== replace) edits.push({ find, replace });
  }
  return edits;
}
const apply = (html, changes) => (k2Edits(html, changes) || []).reduce((h, e) => h.replace(e.find, () => e.replace), html);
const block = (html, name) => (new RegExp(`\\nconst ${name} = [\\[{][\\s\\S]*?\\n[\\]}];\\n`).exec(String(html)) || [])[0] || '';
/** The same game in another world: a fresh starter there, with this game's title, look, numbers, questions and words. */
export function k2Move(html, world, hero, companion) {
  const title = k2Read(html, 'title');
  const friend = companion === undefined ? k2Read(html, 'companion') : companion;
  let out = kit2Starter({ world, hero, title: typeof title === 'string' ? title : '', companion: typeof friend === 'string' ? friend : '' }); if (!out) return null;
  const keep = {}; for (const k of ['outfit', 'weather', 'steps', 'coinValue', 'bonus']) { const v = k2Read(html, k); if (v !== undefined) keep[k] = v; }
  out = apply(out, keep);
  for (const name of ['QUESTIONS', 'WORDS']) { const from = block(html, name), to = block(out, name); if (from && to) out = out.replace(to, () => from); }
  return out;
}

const TIMES = [['night', /\bnight\b|\bdark\b|\bstars\b|\bmoonlight\b/], ['sunset', /\bsunset\b|\bevening\b|\bdusk\b/], ['morning', /\bmorning\b|\bsunrise\b|\bdawn\b/], ['day', /\bday ?time\b|\bsunny\b|\bdaylight\b|\bmidday\b/]];
const WEATHER = [['snow', /\bsnow(y|ing)?\b|\bwinter\b/], ['rain', /\brain(y|ing)?\b/], ['sparkles', /\bsparkl(e|es|y)\b|\bmagic(al)? dust\b|\bglitter\b/], ['leaves', /\bleaves\b|\bautumn\b/], ['clear', /\bno (snow|rain|weather)\b|\bclear (sky|weather)\b|\bstop the (snow|rain)\b/]];
const SAID_TIME = { night: 'made it night time with stars 🌙', sunset: 'made it a sunset sky 🌅', morning: 'made it early morning 🌄', day: 'made it a sunny day ☀️' };
const SAID_WEATHER = { snow: 'made it snow ❄️', rain: 'made it rain 🌧️', sparkles: 'added magic sparkles ✨', leaves: 'added falling leaves 🍂', clear: 'cleared the sky ☀️' };
const ANIMAL_NAMES = KIT2_CHARACTERS.filter(c => c.kind === 'creature').map(c => c.name);
const NO_CREATURE = ANIMAL_NAMES.length ? `The 3D worlds do not have that animal yet. The animals so far: ${ANIMAL_NAMES.join(', ')}. ` : 'The 3D worlds have no animal or dinosaur characters yet. ';

function nextChips(html) {
  const k = kit2Of(html) || {}, w = worldById(k.world), others = w ? heroesOf(w.id).filter(h => h.id !== k.hero) : [];
  const other = KIT2_WORLDS.find(x => x.id !== k.world && x.id !== 'sky-islands') || KIT2_WORLDS[0];
  return [others.length ? `Change the hero to ${others[0].name}` : 'Make it harder', k2Read(html, 'time') === 'night' ? 'Make it a sunny day' : 'Make it night time', `Move it to ${other.name}`];
}

/** Build a new Kit 2 game. pick: wantsKit2()'s { world, hero, wantsCreature }. o.replaces: an old-kit game it takes the place of. */
export async function buildKit2(ctx, m, pick, say, o = {}) {
  const { tools, text } = ctx, a = m.answers || {};
  const w = worldById(pick.world), hero = heroFor(pick.world, pick.hero), who = characterById(hero);
  const theme = detectTheme(text), col = detectColor(text), [icon, cover] = lookOf(w.id);
  const rename = String(text).match(/\b(?:call it|name it|title it)\s+["“']?([^"”'\n]{2,40})/i), named = rename && cleanText(rename[1].trim(), 40);
  const kept = o.replaces && o.replaces.title && !/^(new game|my game)$/i.test(o.replaces.title) ? o.replaces.title : '';
  const title = (named && named.ok && named.value) || kept || (pick.wantsCreature && theme ? `${theme.name} ${w.name}` : w.name);
  const outfit = col ? col.hex : pick.wantsCreature ? '#66C792' : '';
  const friend = characterById(creatureFor(w.id, pick.companion));
  let html = kit2Starter({ world: w.id, hero, title, companion: friend ? friend.id : '' });
  if (outfit) html = apply(html, { outfit });
  const learnBit = a.learn && a.learn !== 'none' ? ` It sneaks in some ${a.learn} too.` : '';
  if (o.replaces) await say(ctx, 'This will be a brand new 3D game. Your old game stays in Versions if you want it back. ');
  if (pick.wantsCreature) await say(ctx, `${NO_CREATURE}So ${who.name} is your hero${outfit && !col ? ', in a green cape' : ''}. `);
  else if (pick.missing && characterById(pick.missing)) await say(ctx, `${w.name} has no ${characterById(pick.missing).name}, so ${who.name} is your hero. `);
  await say(ctx, `Here's my plan for ${title} ${icon}: a 3D game in the ${w.name} world with ${who.name} as the hero${friend ? ` and a ${friend.name} who follows you` : ''}. Hop along the path, grab the coins, jump to the right answer and reach the goal.${learnBit} Building it now…\n\n`);
  tools.exec('set_game', { title, icon: pick.wantsCreature && theme ? theme.emoji : icon, description: w.description.slice(0, 300), category: a.learn && a.learn !== 'none' ? 'learning' : 'adventure', tags: ['3d', w.id, hero, ...(friend ? [friend.id] : [])], players: 1, cover, orientation: 'any' });
  const r = tools.exec('write_game', { html, notes: `${o.replaces ? 'A new 3D game' : 'First version'}: ${title === w.name ? `the ${w.name} world` : `${title} in the ${w.name} world`}` });
  m.built = true; m.answers = { ...a, kind: 'oomba3d' };
  if (!r.ok) { await say(ctx, 'Hmm, the safety check found a problem. Ask me to fix it and I will!'); return; }
  if (ctx.state) ctx.state.kit2 = { world: w.id, hero, ...(friend ? { companion: friend.id } : {}) };
  await say(ctx, 'Your 3D game is ready! 🎉 Press Play in the preview and give it a go.');
  tools.exec('test_notes', { checklist: CHECK });
  tools.exec('ask_user', { question: 'What should we change next?', options: nextChips(html) });
}

/** A change to a Kit 2 game. pick: wantsKit2() for this message. */
export async function followUpKit2(ctx, m, cur, pick, say) {
  const { tools, text } = ctx, t = String(text).toLowerCase(), g = tools.game();
  const k = kit2Of(cur.html) || {}, w = worldById(k.world);
  if (/\b(fix|repair)\b/.test(t) && cur.safety_status === 'fail') {
    await say(ctx, 'On it! 🛠️ I rebuilt the game without the part the safety check did not like.');
    const html = kit2Starter({ world: w ? w.id : pick.world, hero: k.hero, title: g.title });
    const r = tools.exec('write_game', { html, notes: 'Fixed the safety check' });
    if (r.ok) tools.exec('ask_user', { question: 'All fixed! What next?', options: nextChips(html) });
    return;
  }
  if (asksForLive(text)) {
    await say(ctx, 'The 3D worlds can’t be played live with a class yet. Your game works great for one player! What should we change next?');
    tools.exec('ask_user', { question: 'What next?', options: nextChips(cur.html) });
    return;
  }
  if (/\b(ready|polish|finished|all done|it'?s done|publish|perfect|looks good)\b/.test(t)) {
    await say(ctx, 'Polish time! ✨ Here is a checklist of things to try in your game. Press Publish when you are happy with it!');
    tools.exec('test_notes', { checklist: POLISH });
    tools.exec('ask_user', { question: 'Anything else before you publish?', options: ['🚀 It is ready!', ...nextChips(cur.html).slice(0, 2)] });
    return;
  }
  const changes = {}, said = [];
  let html = cur.html, moved = false;
  // Another world: a fresh starter there, with everything they made carried over.
  if (pick.world && w && pick.world !== w.id) {
    const to = worldById(pick.world), hero = heroFor(to.id, pick.hero || k.hero);
    const next = k2Move(cur.html, to.id, hero);
    if (next) { html = next; moved = true; said.push(`moved it to the ${to.name} world ${lookOf(to.id)[0]}`); tools.exec('set_game', { icon: lookOf(to.id)[0], tags: ['3d', to.id, hero] }); }
  }
  const world = moved ? pick.world : (w ? w.id : pick.world);
  const hero = heroFor(world, pick.hero || k.hero);
  // An animal: the hero (a playable one) or a friend that follows. A game saved before the animals arrived (an older
  // Oomba3D or world version) is moved to a fresh starter first, with everything they made carried over.
  const friend = creatureFor(world, pick.companion || ''), wantsAnimal = (friend && friend !== (k.companion || '')) || (!!characterById(hero) && characterById(hero).kind === 'creature' && hero !== k.hero);
  if (wantsAnimal && !moved && !hasAnimals(html)) {
    const next = k2Move(cur.html, world, hero, friend);
    if (next) { html = next; moved = true; said.push('moved your game to the newest version of its world, so animals can join 🐾'); }
  }
  if (pick.missing && characterById(pick.missing)) said.push(`kept your hero (${worldById(world).name} has no ${characterById(pick.missing).name})`);
  else if (hero && hero !== k2Read(html, 'hero')) { changes.hero = hero; said.push(`made ${characterById(hero).name} the hero 🦸`); }
  else if (pick.wantsCreature && /\b(hero|player|character|play as|turn (it|him|her|them) into)\b/.test(t.replace(/\b(?:call it|name it|rename it(?: to)?|title it)\b[\s\S]*$/, ''))) said.push(ANIMAL_NAMES.length ? 'kept your hero (the 3D worlds do not have that animal yet)' : 'kept your hero (there are no animal or dinosaur characters in the 3D worlds yet)');
  if (friend && friend !== k2Read(html, 'companion')) { changes.companion = friend; said.push(`added a ${characterById(friend).name} who follows you 🐾`); }
  else if (friend && moved) said.push(`added a ${characterById(friend).name} who follows you 🐾`);
  const time = (TIMES.find(([, re]) => re.test(t)) || [])[0];
  if (time && time !== k2Read(html, 'time')) { changes.time = time; said.push(SAID_TIME[time]); }
  const weather = (WEATHER.find(([, re]) => re.test(t)) || [])[0];
  if (weather && weather !== k2Read(html, 'weather')) { changes.weather = weather; said.push(SAID_WEATHER[weather]); }
  const col = detectColor(text);
  if (col && !['night', 'dark'].includes(col.name)) { changes.outfit = col.hex; said.push(`gave the hero a ${col.name} cape 🎨`); }
  const steps = k2Read(html, 'steps');
  if (typeof steps === 'number') {
    if (/\b(harder|longer|difficult|tricky|trickier|more challenging|too easy|more (stones|steps|jumps))\b/.test(t)) { changes.steps = Math.min(8, steps + 2); said.push('made the way longer, with more jumps 🔥'); }
    else if (/\b(easier|shorter|too hard|fewer (stones|steps|jumps))\b/.test(t)) { changes.steps = Math.max(2, steps - 1); said.push('made the way shorter and easier 🐢'); }
  }
  const rename = String(text).match(/\b(?:call it|name it|rename it(?: to)?|title it)\s+["“']?([^"”'\n]{2,40})/i);
  if (rename) {
    const c = cleanText(rename[1].trim(), 40);
    if (c.ok && c.value) { tools.exec('set_game', { title: c.value }); changes.title = c.value; said.push(`renamed it “${c.value}”`); }
  }
  if (!Object.keys(changes).length && !moved) {
    if (said.length) { await say(ctx, `I ${said.join(' and ')}. What else should we change?`); tools.exec('ask_user', { question: 'What should we change?', options: nextChips(cur.html) }); return; }
    await say(ctx, 'I can change the hero, the world, the sky, the weather and how long the way is. Try one of these, or tell me in your own words.');
    tools.exec('ask_user', { question: 'What should we change?', options: [...nextChips(cur.html), 'Make it snow', 'Make it harder', '✨ Polish it'] });
    return;
  }
  const notes = said.join(', ').replace(/\s*\p{Extended_Pictographic}️?/gu, '').replace(/^./, c => c.toUpperCase()).slice(0, 120);
  const edits = moved ? null : k2Edits(cur.html, changes);
  let r;
  if (edits && edits.length) {
    // The page title follows a new game title (one more exact edit).
    if (changes.title) { const tt = /<title>[^<]*<\/title>/.exec(cur.html); if (tt && cur.html.split(tt[0]).length === 2) edits.push({ find: tt[0], replace: `<title>${String(changes.title).replace(/[<>&]/g, '')}</title>` }); }
    r = tools.exec('edit_game', { edits, notes });
  } else {
    let out = apply(html, changes);
    if (changes.title) out = out.replace(/<title>[^<]*<\/title>/, () => `<title>${String(changes.title).replace(/[<>&]/g, '')}</title>`);
    r = tools.exec('write_game', { html: out, notes });
  }
  if (!r.ok) { await say(ctx, 'Hmm, that change did not work. Try asking in a different way!'); return; }
  if (ctx.state) ctx.state.kit2 = { world, hero, ...(friend ? { companion: friend } : {}) };
  await say(ctx, `Done! I ${said.join(' and ')}. Press Play to try version ${r.version.number}.`);
  tools.exec('test_notes', { checklist: ['Play a round and see the change', 'Check it is still fair and fun', 'Press Play again at the end'] });
  tools.exec('ask_user', { question: 'What next?', options: nextChips(r.version.html || cur.html) });
}
export { isKit2Game };
