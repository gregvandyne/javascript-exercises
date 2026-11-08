// ======================================================================================================
// SPRITES: the cast as pixel maps (16 x 16 unless noted). '.' is see-through; the letters are each map's palette.
// Cappy faces down / up / right (left is the right one mirrored), with a walk frame for each.
// ======================================================================================================
const OUT = '#24150f';
const CAPPY_PAL = { o: OUT, b: '#b0703e', s: '#7e4a28', l: '#d79c62', n: '#6b3d22', k: '#1a0f0a', w: '#ffffff', g: '#45c34e', G: '#2a8a38',
  p: '#e2683c', P: '#a8442a', y: '#ffd04a', f: '#4a2a18', h: '#e8c25a', H: '#a8782a', r: '#e04848' };
const CAPPY = {
  down: [
    '................',
    '...oo......oo...',
    '..olbo....oblo..',
    '..obboooooobbo..',
    '..obllllllllbo..',
    '.obbwkllllwkbbo.',
    '.obbkkbbbbkkbbo.',
    '.osbbbnnnnbbbso.',
    '.osbbnnnnnnbbso.',
    '..osnkknnkknso..',
    '..oGggggggggGo..',
    '.osbGgGbbbbbbso.',
    '.osbbllllllbbso.',
    '.osbbbbbbbbbbso.',
    '..ossbbbbbbsso..',
    '...offo..offo...'],
  down2: ['..offo....offo..'],
  up: [
    '................',
    '...oo......oo...',
    '..olbo....oblo..',
    '..obboooooobbo..',
    '..obllllllllbo..',
    '.obbllllllllbbo.',
    '.obbbbbbbbbbbbo.',
    '.osbbbbbbbbbbso.',
    '..osbbbbbbbbso..',
    '..oGggggggggGo..',
    '.osopppppppposo.',
    '.osopPyyyyPposo.',
    '.osopppppppposo.',
    '.osoPPPPPPPPoso.',
    '..ossoooooooso..',
    '...offo..offo...'],
  up2: ['..offo....offo..'],
  right: [
    '................',
    '................',
    '...........oo...',
    '..oooooo..olbo..',
    '.oPppppPooobboo.',
    '.oPpyyppobbbbbbo',
    '.oPppppobbbkbbbo',
    '.oPPPPPobbbbbnno',
    '.obPPPogGbbbnnno',
    'obbbbbbgGbbbnnko',
    'obllllllgGsssoo.',
    'obbbbbbbbbbbso..',
    'osbbbbbbbbbbso..',
    '.ossssssssssso..',
    '..ofo.ofo.ofo...',
    '................'],
  right2: ['...ofo.ofo.ofo..'],
};
/** Cappy's sprites with a bandana colour (and the cousins' colours). */
function buildCappy(name, bandana, fur, opts) {
  const pal = Object.assign({}, CAPPY_PAL, fur || {});
  if (bandana) { pal.g = bandana; pal.G = shade(bandana, -0.32); }
  if (opts && opts.noPack) { pal.p = pal.b; pal.P = pal.s; pal.y = pal.l; }
  for (const d of ['down', 'up', 'right']) {
    sprite(`${name}_${d}`, CAPPY[d], pal);
    const walk = CAPPY[d].slice(0, d === 'right' ? 14 : 15).concat(CAPPY[d + '2'], d === 'right' ? ['................'] : []);
    sprite(`${name}_${d}_w`, walk, pal);
  }
}
JC.buildCappy = buildCappy;
// Hats and flags drawn over Cappy (cosmetics).
const HAT_PAL = { o: OUT, h: '#f0d070', H: '#b8923a', r: '#e04848', b: '#3a7bd5', B: '#24508f', g: '#45c34e', w: '#fff8e8', y: '#ffd24a' };
sprite('hat_straw', ['....oooooo....', '...ohhhhhho...', '...ohrrrrho...', '.oohhhhhhhhoo.', 'oHHHHHHHHHHHHo', '.oooooooooooo.'], HAT_PAL);
sprite('hat_explorer', ['....oooooo....', '...owwwwwwo...', '...owbbbbwo...', '.oowwwwwwwwoo.', 'oBBBBBBBBBBBBo', '.oooooooooooo.'], HAT_PAL);
sprite('hat_flower', ['..o.o..', '.oyoro.', 'oyyoyyo', '.oyroyo', '..ooo..'], { o: OUT, y: '#ff6fb5', r: '#ffd24a' });

/* ---------- people of Delta Isle ---------- */
const MANGO_PAL = { o: OUT, r: '#ff8a2a', R: '#d0601a', y: '#ffd34a', Y: '#c9921e', g: '#3fb54a', G: '#257a33', b: '#3a7bd5', B: '#24508f', w: '#ffffff', k: '#1a0f0a', f: '#5a5050' };
sprite('mango', [
  '................',
  '......oooo......',
  '.....orrrro.....',
  '....orrrwkro....',
  '....orrrrkyyo...',
  '....orrrroyYYo..',
  '...oyrrrrooYo...',
  '...oyyrrrRo.....',
  '..ogyyyrrRo.....',
  '..oggyyyrRo.....',
  '..oGggbyyRo.....',
  '..oGgGbbyo......',
  '...oGbbbo.......',
  '....obBbo.......',
  '....oBoBo.......',
  '....ofoofo......'], MANGO_PAL);
sprite('mango_up', [
  '................',
  '......oooo......',
  '.....orrrro.....',
  '....orrrwkro....',
  '....orrrrkyyo...',
  '...oorrrroyYYo..',
  '..ogyorrrooYo...',
  '.oggyyorrRo.....',
  'oGggyyyrrRo.....',
  '.ooGgyyyrRo.....',
  '...oGgbyyRo.....',
  '...oGgbbyo......',
  '...oGbbbo.......',
  '....obBbo.......',
  '....oBoBo.......',
  '....ofoofo......'], MANGO_PAL);
const TAPIR_PAL = { o: OUT, d: '#4a4658', D: '#2e2b3a', W: '#ece6d8', w: '#ffffff', k: '#120e14', a: '#6fb6e8', A: '#3d82b8', n: '#5f5a70', y: '#ffd24a' };
sprite('tapir', [
  '................',
  '..oo........oo..',
  '.oddo......oddo.',
  '.odDooooooooDdo.',
  '..oddddddddddo..',
  '.oddwkddddwkddo.',
  '.odddddddddddo..',
  '..odddnnnnddo...',
  '...oddnnnnddo...',
  '....onnnnno.....',
  '..oWWonnnoWWo...',
  '.oWWWaonoaWWWo..',
  '.oWWaaaaaaaWWo..',
  '.oDdayaaaaadDo..',
  '..oDaaaaaaaDo...',
  '...odo...odo....'], TAPIR_PAL);
const ELDER_PAL = { o: OUT, s: '#5f8a3a', S: '#3d6226', h: '#b0d070', k: '#120e14', w: '#ffffff', e: '#c8b88a', E: '#8d7c55', b: '#e8e8e0', c: '#8a5a33' };
sprite('elder', [
  '................',
  '................',
  '.....ooooo......',
  '...oohShShoo....',
  '..oShShShShSo...',
  '.oShSSSSSShSho..',
  '.oSSShSSShSSSo..',
  'oShShShShShShSo.',
  'oooooooooooooo..',
  '.oeeoeeeeoeeo...',
  '..oo.oooo.ooc...',
  '.............c..',
  '................',
  '................',
  '................',
  '................'], ELDER_PAL);
// The elder faces down, head out front under a big shell, with a walking stick.
sprite('elder', [
  '................',
  '.....oooooo.....',
  '...oohShShhoo...',
  '..oShShShShShSo.',
  '.oShSSSSSSSShSo.',
  '.oSSShSSSShSSSo.',
  'oShShShShShShShSo',
  'ooooooooooooooooo',
  '...oeebbbbeeo..c',
  '..oeewkeewkeeo.c',
  '..oeeeeeeeeeeo.c',
  '...oeeEEEEeeo..c',
  '..ooeeeeeeeeoo.c',
  '.oeeoooooooeeo.c',
  '.oEEo.....oEEo.c',
  '..oo.......oo..c'], ELDER_PAL);
const ANT_PAL = { o: OUT, a: '#b8432a', A: '#7a2618', l: '#6ad34a', L: '#3d9a2e', k: '#120e14' };
sprite('ant', [
  '....oLo..',
  '...oLlLo.',
  '..oLllLo.',
  '...oLLo..',
  '.oo.oo...',
  'oaAoaAoao',
  '.oo.oo.oo',
  'o.o.o.o..'], ANT_PAL);
sprite('ant2', [
  '....oLo..',
  '...oLlLo.',
  '..oLllLo.',
  '...oLLo..',
  '.oo.oo...',
  'oaAoaAoao',
  '.oo.oo.oo',
  '.o.o.o.o.'], ANT_PAL);
const ZUZU_PAL = { o: OUT, g: '#3fd0a0', G: '#1f8a6a', p: '#ff5fa8', w: '#dff8ff', k: '#120e14', y: '#ffd24a' };
sprite('zuzu', [
  '..ww.......',
  '.wwww..ooo.',
  '.wwwwwogkgo',
  '..wwwogggoooo',
  '...oGgpppo...',
  '..oGGgppo....',
  '.oGGGoo......',
  'oGGo.........',
  '.oo..........'], ZUZU_PAL);
sprite('zuzu2', [
  '...........',
  '.......ooo.',
  '......ogkgo',
  '..ooooogggoooo',
  '.owwwwGgpppo...',
  '.owwwGGgppo....',
  '.oGGGGoo......',
  'oGGo.........',
  '.oo..........'], ZUZU_PAL);

/* ---------- the champions (16 x 16, facing down) ---------- */
const JADA_PAL = { o: OUT, y: '#f2a93b', Y: '#c77a1e', c: '#fff0c8', k: '#2a1a12', e: '#b8e04a', n: '#d86a6a', r: '#ff9b2e', R: '#c8641a', w: '#ffffff' };
sprite('jada', [
  '................',
  '.oo..........oo.',
  'oyYo........oYyo',
  'oyyyoooooooooyyo',
  'oykyyyykyyyyykyo',
  '.oyyykyyyykyyyo.',
  'oyyekwyyyywekyyo',
  'oyyeekyyyykeeyyo',
  'okyyyycccccyykyo',
  '.oyyyccnnccyyyo.',
  '..oyycccccyyyo..',
  '..oRrrrrrrrrRo..',
  '.oyyykcccyykyyo.',
  '.oykyycccyyyyko.',
  '.oyyyyycccyykyo.',
  '..ooYYoooooYYoo.'], JADA_PAL);
const SLOANE_PAL = { o: OUT, f: '#9a8670', F: '#6e5d4a', l: '#d8c8a8', m: '#4a3a2c', k: '#120e14', w: '#ffffff', n: '#3a2a20', g: '#6ad34a', G: '#3d9a2e' };
sprite('sloane', [
  '................',
  '.....oooooo.....',
  '...oofffffffoo..',
  '..offllllllffo..',
  '.ofllllllllllfo.',
  '.oflmmmllmmmlfo.',
  '.ofmmkwllwkmmfo.',
  '.oflmmllllmmlfo.',
  '.ofllllnnllllfo.',
  '..oflllllllllo..',
  '..ofFlgggglFfo..',
  '.oFffffffffffFo.',
  'oFFoffffffffoFFo',
  'oFo.offFFffo.oFo',
  '.o..oFFooFFo..o.',
  '.....oo..oo.....'], SLOANE_PAL);
const TICO_PAL = { o: OUT, k: '#22202c', K: '#3a3848', y: '#ffe08a', b: '#ff8a2a', B: '#e0501a', r: '#ff4d4d', g: '#6ad34a', w: '#ffffff', e: '#5fc8ff' };
sprite('tico', [
  '................',
  '.....ooooo......',
  '....okkkkko.....',
  '...okkkkkkko....',
  '...okyyyewkooo..',
  '..okyyyyyekbbboo',
  '..okyyyyyobbbbbo',
  '..okkyyyyoBrrbBo',
  '..okkkyyoooooooo',
  '..okkkkrrko.....',
  '.okKkkkkkko.....',
  '.okKKkkkkko.....',
  '.okKKkkkkko.....',
  '..okkkkkko......',
  '...okk.kko......',
  '...ooo.ooo......'], TICO_PAL);
const OTTER_PAL = { o: OUT, b: '#8a5a33', B: '#5e3a20', c: '#e6c79a', k: '#120e14', w: '#ffffff', n: '#2a1a12', h: '#3fb7ff', H: '#2481c4' };
sprite('otter', [
  '................',
  '...oo......oo...',
  '..obboooooobbo..',
  '..obbbbbbbbbbo..',
  '.obbkwbbbbkwbbo.',
  '.obbkkbbbbkkbbo.',
  '.obccccnnccccbo.',
  '..occccccccco...',
  '..oHhhhhhhhHo...',
  '..obbcccccbbo...',
  '.obbbcccccbbbo..',
  '.oBbbcccccbbBo..',
  '.oBbbbcccbbbBo..',
  '..obbbbbbbbbo...',
  '..oBo.....oBo...',
  '...oo.....ooBBo.'], OTTER_PAL);
const RANA_PAL = { o: OUT, v: '#9d5cf0', V: '#6a34b8', y: '#ffd23f', Y: '#d09a10', k: '#120e14', w: '#ffffff', l: '#c9a0ff' };
sprite('rana', [
  '................',
  '................',
  '...ooo....ooo...',
  '..owkvo..ovkwo..',
  '..okkvoooovkko..',
  '.ovvvvvvvvvvvvo.',
  '.ovyyvvvvvvyyvo.',
  'ovvvvvvvvvvvvvvo',
  'ovvkkkkkkkkkkvvo',
  '.ovvvvvvvvvvvvo.',
  '..ovyyvllvyyvo..',
  '.oVvvvllllvvvVo.',
  'oVVovvvvvvvvoVVo',
  'oyVo.oVvvVo.oVyo',
  '.oo...oooo...oo.',
  '................'], RANA_PAL);
const MICO_PAL = { o: OUT, m: '#8a3a22', M: '#5e2414', f: '#d8a070', k: '#120e14', w: '#ffffff', y: '#ffd23f', Y: '#c09a20', n: '#4a2414' };
sprite('mico', [
  '................',
  '.....oooooo.....',
  '...oommmmmmoo...',
  '..ommmmmmmmmmo..',
  '.oomffffffffmoo.',
  'ofomfwkffwkfmofo',
  'offmffffffffmffo',
  '.oomffnnnnffmoo.',
  '...omffnnffmo...',
  '...oomffffmoo...',
  '..ommMyyyyMmmo..',
  '.ommmyYyyYymmmo.',
  'omMomMyyyyMmoMmo',
  'oMo.omMMMMmo.oMo',
  '.o..oMMooMMo..o.',
  '.....oo..oo..oo.'], MICO_PAL);
const KIKI_PAL = { o: OUT, k: '#c98a3a', K: '#9a6224', c: '#f0c878', e: '#120e14', w: '#ffffff', n: '#3a2414', p: '#ff6fb5', P: '#c8427e' };
sprite('kiki', [
  '................',
  '..oo........oo..',
  '.okko......okko.',
  '.okKooooooooKko.',
  '..okkkkkkkkkko..',
  '.okkeewkkkeewko.',
  '.okkeeekkkeeeko.',
  '.okkkkccccckkko.',
  '..okkcccnccckko.',
  '...okkcccckko...',
  '..oPpppppppPo...',
  '.okkkkccckkkko..',
  'okKkkcccccckKko.',
  'oKo.okkkkkko.oKo',
  '.o..oKKooKKo..o.',
  '.....oo..oo.....'], KIKI_PAL);
// Pecca the peccary, captain of the Grunt Gang (Mango Dash): bristly mane, a pale collar, a teal captain's headband.
const PECCA_PAL = { o: OUT, p: '#6e5c54', P: '#4a3c36', m: '#2e2420', c: '#efe4d0', s: '#d49a8c', S: '#a86a5c', k: '#120e14', w: '#ffffff', t: '#1fc8a8', T: '#138a74' };
sprite('pecca', [
  '.....o.o.o......',
  '....omomomo.....',
  '..oo.ommmo.oo...',
  '.opPottttttoPpo.',
  '.oPptTTTTTTtpPo.',
  '..oppppppppppo..',
  '.oppwkppppwkppo.',
  '.oppkkppppkkppo.',
  '.opppossssoppo..',
  '..oposSssSsopo..',
  '...oossssssoo...',
  '..occccccccccoo.',
  '.oPpcppppppcpPo.',
  'oPPoppppppppoPPo',
  '.oo.oPPooPPo.oo.',
  '.....oo..oo.....'], PECCA_PAL);
// Marmosets (the warm-up pair): tiny, 12 x 12.
const MARM_PAL = { o: OUT, g: '#9a948a', G: '#6a645a', w: '#f4f0e8', k: '#120e14', f: '#e0c8a8', y: '#ffd24a' };
sprite('marmoset', [
  '.ww......ww.',
  'owwo....owwo',
  '.oggoooogo..',
  '.oggffffggo.',
  'oggfkffkfggo',
  '.ogffffffgo.',
  '..oggffggo..',
  '.oGggggggGo.',
  'oGoggggggoGo',
  '.o.oGggGo.oo',
  '...oo..oo.o.',
  '..........o.'], MARM_PAL);

/* ---------- items and icons ---------- */
// A Feather in any colour: JC.featherSprite(colour) (cached).
const FEATHER_ROWS = ['.....oo', '....oFo', '...oFlo', '..oFlFo', '..oFlFo', '.oFlFo.', '.oFlFo.', 'oFlFo..', 'oFFo...', 'ooo....', 'o......'];
const FEATHERS = {};
function featherSprite(col) {
  if (!FEATHERS[col]) FEATHERS[col] = makeSprite(FEATHER_ROWS, { o: OUT, F: col, l: shade(col, 0.55) });
  return FEATHERS[col];
}
JC.featherSprite = featherSprite;
sprite('star_on', ['...o...', '..oyo..', 'ooyyyoo', 'oyyYyyo', '.oyyyo.', '.oyoyo.', '.oo.oo.'], { o: OUT, y: '#ffd24a', Y: '#fff3a8' });
sprite('star_off', ['...o...', '..ogo..', 'oogggoo', 'oggggo.', '.oggg o', '.ogogo.', '.oo.oo.'].map(r => r.replace(' ', 'g')), { o: OUT, g: '#5c5670' });
sprite('cup', [
  '.oooooooooo.',
  'oyYyYyYyYyyo',
  'oyyyyyyyyyyo',
  '.oygygygyyo.',
  'ooyyyyyyyyoo',
  'o.oyyyyyyo.o',
  '.o.oyyyyo.o.',
  '...oyyyyo...',
  '....oyyo....',
  '....oYYo....',
  '..ogggggo...',
  '.oYYYYYYYYo.',
  '.oooooooooo.'], { o: OUT, y: '#ffd24a', Y: '#d39a22', g: '#6ad34a' });
sprite('sparkle', ['..o..', '..w..', 'ow.wo', '..w..', '..o..'], { o: '#fff3a8', w: '#ffffff' });
sprite('leaf', ['...oo', '..oLo', '.oLlo', 'oLlLo', 'oLLo.', 'oo...'], { o: OUT, L: '#3d9a2e', l: '#6ad34a' });
sprite('shell', ['..oo..', '.opPo.', 'opPpPo', 'oPpPpo', '.oooo.'], { o: OUT, p: '#ffd0c0', P: '#f09080' });
sprite('specs', ['.oo..oo.', 'owwoowwo', 'owwo.owwo', '.oo..oo.'].map(r => r.slice(0, 8)), { o: OUT, w: '#cfe8ff' });
sprite('letter', ['oooooooo', 'owwwwwwo', 'oowwwwoo', 'owowwowo', 'owwoowwo', 'oooooooo'], { o: OUT, w: '#fff8e8' });
sprite('mangofruit', ['....oo.', '...oGo.', '.ooooo.', 'oyyrryo', 'oyrrrro', 'oyyrrro', '.oyyyo.', '..ooo..'], { o: OUT, y: '#ffd24a', r: '#ff8a2a', G: '#3d9a2e' });
