// The book maker's stand-in for the AI (docs/storybook-builder.md "Without an API key"): with no ANTHROPIC_API_KEY,
// like the Builder's mock, Oomba still makes a real book from templates, so the whole flow works on a laptop and in the
// end-to-end checks. It answers exactly what the model would (the same JSON), and its answer goes through the same checks
// (shapeBook, problemsOf, the word rules). It never sees anything but the setup and the book. English only.

const THEMES = {
  animals: { world: 'wild-woods', cast: [['Pip', 'fox'], ['Juno', 'deer']], place: 'the Whispering Woods', thing: 'a lost acorn' },
  space: { world: 'space-base', cast: [['Nova', 'rogue'], ['Bolt', 'captain-clank']], place: 'Moon Base Nine', thing: 'a blinking star map' },
  sea: { world: 'under-the-sea', cast: [['Fin', 'dolphin'], ['Shelly', 'turtle']], place: 'Coral Bay', thing: 'a shiny shell' },
  dinosaurs: { world: 'dino-valley', cast: [['Tops', 'triceratops'], ['Pip', 'fox']], place: 'Fern Valley', thing: 'a big blue egg' },
  castles: { world: 'castle-quest', cast: [['Sir Tom', 'knight'], ['Wren', 'mage']], place: 'Hilltop Castle', thing: 'a golden key' },
  friendship: { world: 'toy-town', cast: [['Max', 'barbarian'], ['Lulu', 'pug']], place: 'Toy Town', thing: 'a red kite' },
  seasons: { world: 'medieval-village', cast: [['Ada', 'rogue-hooded'], ['Moss', 'sheep']], place: 'Applewick Village', thing: 'the first snowflake' },
  feelings: { world: 'cosy-home', cast: [['Pip', 'fox'], ['Gran', 'mage']], place: 'the little blue house', thing: 'a quiet song' },
};
const WORDS = { sea: /sea|ocean|fish|whale|coral|beach|shark|dolphin/i, space: /space|moon|planet|star|rocket|astronaut/i, dinosaurs: /dino/i, castles: /castle|knight|king|queen|dragon|wizard|fairy/i, seasons: /winter|summer|spring|autumn|fall|snow|season|harvest/i, feelings: /feel|kind|sad|happy|angry|worr|brave|home|family/i, friendship: /friend|share|team|toy|town/i, animals: /animal|fox|deer|forest|wood|farm/i };
const themeOf = s => (s.theme && THEMES[s.theme] ? s.theme : Object.keys(WORDS).find(k => WORDS[k].test(`${s.about || ''} ${s.story || ''}`)) || 'animals');
const PAGES = { linear: { short: 6, medium: 10, long: 14 }, cyoa: { short: 1, medium: 2, long: 3 } };
const pic = (world, chars, mood = 'bright', props = []) => ({ world, mood, chars, props });

/** Story text -> pages of about n words each, at paragraph or sentence breaks. */
function splitStory(text, n) {
  const paras = String(text || '').split(/\n\s*\n/).map(x => x.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const out = [];
  for (const p of paras) {
    const sents = p.match(/[^.!?]+[.!?]+["')\]]*|\S[^.!?]*$/g) || [p];
    let cur = '';
    for (const s of sents.map(x => x.trim())) {
      if (cur && (cur + ' ' + s).split(' ').length > n) { out.push(cur); cur = s; } else cur = cur ? `${cur} ${s}` : s;
    }
    if (cur) out.push(cur);
  }
  return out.slice(0, 24);
}

function linearBook(s, T) {
  const [a, b] = T.cast, n = PAGES.linear[s.length] || 6;
  const lines = [
    `${a[0]} lived near ${T.place}. Every morning, ${a[0]} looked out and smiled.`,
    `One day, ${a[0]} found ${T.thing}. "Where did this come from?" ${a[0]} asked.`,
    `${b[0]} came to see. "Let's find out together," said ${b[0]}.`,
    `They walked and looked. They asked everyone they met.`,
    `The sun went down. ${a[0]} felt tired, but ${b[0]} held up a lantern.`,
    `At last they found the place where ${T.thing} belonged.`,
    `Everyone cheered. ${a[0]} and ${b[0]} had made a new friend that day.`,
    `They shared a picnic and told the story again and again.`,
    `When the stars came out, ${a[0]} said thank you to ${b[0]}.`,
    `"Friends make every day better," said ${b[0]}.`,
    `The next morning, ${a[0]} woke up early again.`,
    `There was something new to find. But that is another story.`,
    `${a[0]} wrote it all down in a little book.`,
    `The end of one story is the start of the next.`,
  ];
  const moods = ['bright', 'bright', 'warm', 'bright', 'dusk', 'warm', 'bright', 'warm', 'night', 'night', 'bright', 'magic', 'warm', 'bright'];
  const pages = Array.from({ length: n }, (_, i) => ({
    id: `p${i + 1}`, text: lines[i % lines.length], pic: pic(T.world, i === 0 ? [{ name: a[0], pos: 'center' }] : [{ name: a[0], pos: 'left' }, { name: b[0], pos: 'right' }], moods[i % moods.length]),
    alt: i === 0 ? `${a[0]} stands in ${T.place}.` : `${a[0]} and ${b[0]} together in ${T.place}.`,
  }));
  return { title: `${a[0]} and ${T.thing.replace(/^(a|an|the) /, 'the ')}`.replace(/\b\w/, c => c.toUpperCase()), kind: 'linear', cast: T.cast.map(([name, art]) => ({ name, art })), pages };
}

function cyoaBook(s, T, opener = null) {
  const [a, b] = T.cast, endings = Math.max(2, Math.min(4, +s.endings || 2));
  const pages = [];
  const two = [{ name: a[0], pos: 'left' }, { name: b[0], pos: 'right' }];
  const lead = opener && opener.length ? opener : [`${a[0]} and ${b[0]} found ${T.thing} at the edge of ${T.place}.`];
  lead.slice(0, 3).forEach((text, i) => pages.push({ id: `p${i + 1}`, text, choices: [], pic: pic(T.world, two, 'bright'), alt: `${a[0]} and ${b[0]} in ${T.place}.` }));
  const fork = pages[pages.length - 1];
  for (let i = 0; i < pages.length - 1; i++) pages[i].choices = [{ text: 'Turn the page', to: pages[i + 1].id }];
  fork.text = `${fork.text} Which way should they go?`;
  const id = n => `p${pages.length + n}`;
  const L = id(1), R = id(2);
  fork.choices = [{ text: `Follow the path into the trees`, to: L }, { text: `Climb the hill to look around`, to: R }];
  pages.push({ id: L, title: 'The path', text: `The path was narrow and green. ${a[0]} heard a soft tapping sound nearby.`, choices: [], pic: pic(T.world, [{ name: a[0], pos: 'center' }], 'warm'), alt: `${a[0]} on a narrow path.` });
  pages.push({ id: R, title: 'The hill', text: `From the top of the hill, ${b[0]} could see the whole of ${T.place}.`, choices: [], pic: pic(T.world, [{ name: b[0], pos: 'center' }], 'bright'), alt: `${b[0]} on top of a hill.` });
  const ends = [
    { title: 'A new friend', text: `The tapping was a little bird fixing its nest. ${a[0]} helped, and the bird sang all the way home.` },
    { title: 'Home at sunset', text: `${b[0]} spotted home in the distance. They raced back just in time for supper.` },
    { title: 'The hidden garden', text: `Behind a bush was a garden full of flowers. ${a[0]} picked one for everyone.` },
    { title: 'Stars at night', text: `They waited on the hill until the stars came out and counted every one.` },
  ];
  const leftCh = endings >= 3 ? 2 : 1, rightCh = endings >= 4 ? 2 : 1;
  const addEnd = (k, mood) => { const e = ends[k]; const pid = id(1); pages.push({ id: pid, title: e.title, text: e.text, end: true, choices: [], pic: pic(T.world, two, mood), alt: `${a[0]} and ${b[0]} at the end of the story.` }); return pid; };
  const pl = pages.find(p => p.id === L), pr = pages.find(p => p.id === R);
  if (leftCh === 1) { pl.end = true; pl.text += ` It was a woodpecker, and it waved goodbye.`; } else { pl.choices = [{ text: 'Look for the sound', to: addEnd(0, 'warm') }, { text: 'Peek behind the bush', to: addEnd(2, 'magic') }]; }
  if (rightCh === 1) { pr.choices = [{ text: 'Run home for supper', to: addEnd(1, 'dusk') }]; } else { pr.choices = [{ text: 'Run home for supper', to: addEnd(1, 'dusk') }, { text: 'Stay and watch the sky', to: addEnd(3, 'night') }]; }
  return { title: `The ${T.place.replace(/^the /i, '')} Adventure`, kind: 'cyoa', start: 'p1', cast: T.cast.map(([name, art]) => ({ name, art })), pages };
}

// How each character looks, in words (for the picture model's character sheets), by the art-pack sprite the cast uses.
const LOOKS = { fox: 'a small red fox with a white-tipped tail and a green scarf', deer: 'a gentle young deer with big brown eyes and white spots', rogue: 'a curious girl with short dark curls, a yellow raincoat and red boots', 'captain-clank': 'a round, friendly robot painted teal with one antenna and a smiling screen face', dolphin: 'a playful blue-gray dolphin with a bright smile', turtle: 'a calm sea turtle with a green patterned shell', triceratops: 'a friendly little orange triceratops with three short horns', knight: 'a kind boy knight in shiny silver armor with a blue cape', mage: 'a cheerful grandmother with gray hair in a bun, round glasses and a purple shawl', barbarian: 'a sturdy boy with messy red hair, a striped shirt and green shorts', pug: 'a chubby fawn pug with a curly tail and a red collar', 'rogue-hooded': 'a girl in a cozy green hooded cloak with a basket', sheep: 'a fluffy white sheep with a black face' };
/** The words the picture model would get: a scene on every page, a look for every character. */
function withWords(b, place) {
  for (const c of b.cast) c.look = LOOKS[c.art] || `a friendly ${c.art.replace(/-/g, ' ')}`;
  for (const p of b.pages) if (p.pic) p.pic.scene = `${(p.alt || '').replace(/\.$/, '')}, in ${place}. ${(p.text.match(/[^.!?]+[.!?]+/) || [p.text])[0].trim()}`.slice(0, 380);
  return b;
}

/** The first draft, as the model would answer it. */
export function mockDraft(setup) {
  const r = mockDraftRaw(setup);
  withWords(r.book, THEMES[themeOf(setup)].place);
  return r;
}
function mockDraftRaw(setup) {
  const T = THEMES[themeOf(setup)];
  if (setup.source === 'upload') {
    const parts = splitStory(setup.story, setup.grade === 'k' || setup.grade === '1' ? 25 : 45);
    const first = String(setup.story || '').split('\n')[0].trim();
    const title = first && first.length <= 60 && !/[.!?]$/.test(first) ? first : 'My Story';
    const body = first === title ? splitStory(String(setup.story).split('\n').slice(1).join('\n'), 45) : parts;
    if (setup.kind === 'cyoa') {
      const b = cyoaBook(setup, T, body.slice(0, 3));
      b.title = title;
      return { reply: `I turned your story into an adventure: your words come first, then the reader chooses. It has ${b.pages.length} pages and ${b.pages.filter(p => p.end).length} endings.`, book: b };
    }
    const moods = ['bright', 'warm', 'bright', 'dusk', 'bright', 'night'];
    const pages = body.map((text, i) => ({ id: `p${i + 1}`, text, pic: pic(T.world, [], moods[i % moods.length], i % 2 ? [] : []), alt: `A picture of ${T.place}.` }));
    return { reply: `I put your story on ${pages.length} pages and gave each one a picture. Your words are unchanged.`, book: { title, kind: 'linear', cast: [], pages } };
  }
  const b = setup.kind === 'cyoa' ? cyoaBook(setup, T) : linearBook(setup, T);
  return { reply: setup.kind === 'cyoa' ? `Here is your adventure: ${b.pages.length} pages and ${b.pages.filter(p => p.end).length} endings. Ask me for any changes.` : `Here is your book: ${b.pages.length} pages, each with a picture. Ask me for any changes.`, book: b };
}

/** A change, as the model would answer it: a few requests it understands, otherwise a friendly note. */
export function mockChange(book, text) {
  const t = String(text || '').toLowerCase();
  if (/ending/.test(t) && book.kind === 'cyoa') {
    const host = book.pages.find(p => !p.end && p.choices.length && p.choices.length < 4);
    if (host) {
      let n = book.pages.length + 1; while (book.pages.some(p => p.id === `p${n}`)) n++;
      const who = book.cast[0] ? book.cast[0].name : 'Our friend';
      const page = { id: `p${n}`, title: 'A surprise', text: `${who} found a tiny door in a tree. Inside was a party, just for friends.`, end: true, choices: [], pic: { world: (host.pic && host.pic.world) || 'wild-woods', mood: 'magic', chars: book.cast[0] ? [{ name: book.cast[0].name, pos: 'center' }] : [], props: [], scene: `${who} kneels by a tiny round door in the trunk of a big tree; warm light and a little party glow inside.` }, alt: `${who} by a tiny door in a tree.` };
      const changed = { ...host, choices: [...host.choices, { text: 'Open the tiny door', to: page.id }] };
      return { reply: 'I added a new ending: a surprise party behind a tiny door.', edits: { pages: [changed, page] } };
    }
  }
  const m = /page (\d{1,2})/.exec(t);
  if (m) {
    const p = book.pages[+m[1] - 1];
    if (p) return { reply: `I changed page ${m[1]}.`, edits: { pages: [{ ...p, text: `${p.text} Everyone held their breath.`.slice(0, 700) }] } };
  }
  if (/simpl|easier|shorter|grade (k|1|2)/.test(t)) {
    return { reply: 'I made the sentences shorter and simpler.', edits: { pages: book.pages.map(p => ({ ...p, text: (p.text.match(/[^.!?]+[.!?]+/) || [p.text])[0].trim() })) } };
  }
  return { reply: 'This is the practice Oomba (no AI is connected here), so I can only add an ending, change a page by its number, or make the words simpler.' };
}
