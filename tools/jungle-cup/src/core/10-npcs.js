// ======================================================================================================
// THE PEOPLE OF DELTA ISLE: where they stand, what they say, and the five small side quests (never blocking).
// Every line is an I18N key (d.<who>.<line>); see i18n/core.en.js.
// ======================================================================================================
const QUESTS = {
  // id: who gives it, the item to find (or the person to bring it to), the reward (a cosmetic)
  leaf: { giver: 'ants', item: 'leaf', at: [58, 29], reward: { bandana: 'sky' } },
  specs: { giver: 'elder', item: 'specs', at: [7, 45], reward: { hat: 'straw' } },
  letter: { giver: 'zuzu', item: 'letter', to: 'tapir', reward: { flag: 'leaf' } },
  shells: { giver: 'pip', item: 'shell', at: [[63, 50], [8, 31], [44, 62]], reward: { bandana: 'sunset' } },
  mango: { giver: 'mango', item: 'mangofruit', at: [24, 21], reward: { hat: 'explorer' } },
};
JC.quests = QUESTS;
const BANDANAS = { green: '#45c34e', sky: '#3fb7ff', sunset: '#ff8b3d', gold: '#ffd23f', berry: '#c04aa8' };
JC.bandanas = BANDANAS;
const NPC_DEFS = [
  { id: 'mango', x: 38, y: 56, spr: 'mango', bob: true },
  { id: 'coco', x: 35, y: 61, spr: 'coco_down' },
  { id: 'pip', x: 37, y: 61, spr: 'pip_down' },
  { id: 'tapir', x: 41, y: 44, spr: 'tapir' },
  { id: 'ants', x: 30, y: 47, spr: 'ant', many: 3 },
  { id: 'elder', x: 34, y: 37, spr: 'elder' },
  { id: 'zuzu', x: 38, y: 21, spr: 'zuzu', fly: true },
  { id: 'marm', x: 22, y: 32, spr: 'marmoset', many: 2 },
];
// a champion stands beside each arch
const CHAMP_SPOT = { paddle: [28, 32], leaf: [18, 23], seed: [10, 47], kick: [22, 49], frog: [48, 52], rapids: [63, 39], vine: [48, 22] };
const CHAMP_SPR = { jada: 'jada', sloane: 'sloane', tico: 'tico', otters: 'otter', rana: 'rana', mico: 'mico', kiki: 'kiki' };
function nearestFree(x, y) {
  if (!WORLD.isSolid(x, y)) return [x, y];
  for (let r = 1; r < 6; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (!WORLD.isSolid(x + dx, y + dy)) return [x + dx, y + dy];
  return [x, y];
}
function buildNpcs() {
  const list = [];
  for (const d of NPC_DEFS) { const [x, y] = nearestFree(d.x, d.y); list.push(Object.assign({}, d, { x, y, face: 'down', t: Math.random() * 3 })); }
  for (const id in CHAMP_SPOT) {
    const a = ARCHES[id]; const [x, y] = nearestFree(CHAMP_SPOT[id][0], CHAMP_SPOT[id][1]);
    list.push({ id: a.champ, x, y, spr: CHAMP_SPR[a.champ], sport: id, many: a.champ === 'otters' ? 2 : 0, t: Math.random() * 3 });
  }
  for (const n of list) WORLD.solid[idx(n.x, n.y)] = 1;
  // quest items: where each sits (fixed to the nearest walkable tile)
  WORLD.items.length = 0;
  for (const q in QUESTS) {
    const Q = QUESTS[q]; if (!Q.at) continue;
    const spots = Array.isArray(Q.at[0]) ? Q.at : [Q.at];
    spots.forEach((s, i) => { const [x, y] = nearestFree(s[0], s[1]); WORLD.items.push({ quest: q, i, x, y, spr: Q.item }); });
  }
  WORLD.npcs = list;
}
JC.buildNpcs = buildNpcs;
const qState = id => SAVE.data.quests[id] || '';
function questItemsGot(q) { let n = 0; for (const it of WORLD.items) if (it.quest === q && SAVE.data.flags['got_' + q + it.i]) n++; return n; }
function questItemsTotal(q) { let n = 0; for (const it of WORLD.items) if (it.quest === q) n++; return n; }
function giveReward(q) {
  const r = QUESTS[q].reward, c = SAVE.data.cos;
  if (r.bandana && !c.own.includes(r.bandana)) { c.own.push(r.bandana); c.bandana = r.bandana; JC.refreshCappy(); }
  if (r.hat && !c.own.includes('hat_' + r.hat)) { c.own.push('hat_' + r.hat); c.hat = r.hat; }
  if (r.flag && !c.own.includes('flag_' + r.flag)) { c.own.push('flag_' + r.flag); c.flag = r.flag; }
  SAVE.data.quests[q] = 'done'; SAVE.write();
  AUDIO.sfx('fanfare'); UI.confetti(VIEW.W / 2, VIEW.H / 2, 40);
  UI.banner(t('quest.reward.' + Object.keys(r)[0]), PAL.r4, 2.2);
}
/** What an NPC says now (an array of {who, key}). */
function talkLines(n) {
  const L = (who, ...keys) => keys.map(k => ({ who, key: `d.${who}.${k}` }));
  const f = SAVE.featherCount();
  switch (n.id) {
    case 'mango': {
      if (!SAVE.data.flags.metMango) { SAVE.data.flags.metMango = 1; return L('mango', 'intro1', 'intro2', 'intro3', 'intro4', 'intro5'); }
      const q = qState('mango');
      if (q === 'got') { giveReward('mango'); return L('mango', 'qthanks'); }
      if (!q && f >= 1) { SAVE.data.quests.mango = 'active'; return L('mango', 'qask1', 'qask2'); }
      if (q === 'active') return L('mango', 'qwait');
      if (f >= 7) return L('mango', SAVE.data.cup ? 'after' : 'allf');
      return L('mango', 'hint' + Math.min(3, f));
    }
    case 'coco': return L('coco', SAVE.data.flags.metCoco ? 'again' : 'hi');
    case 'pip': {
      const q = qState('shells');
      if (!q) { SAVE.data.quests.shells = 'active'; return L('pip', 'hi', 'qask'); }
      if (q === 'active') { const got = questItemsGot('shells'), tot = questItemsTotal('shells'); if (got >= tot) { giveReward('shells'); return L('pip', 'qthanks'); } return [{ who: 'pip', key: 'd.pip.qwait', vars: { n: tot - got } }]; }
      return L('pip', 'after');
    }
    case 'tapir': {
      if (qState('letter') === 'active') { giveReward('letter'); return L('tapir', 'letter').concat(L('zuzu', 'thanks')); }
      const tip = (SAVE.data.flags.tip = ((SAVE.data.flags.tip || 0) % 8) + 1);
      return L('tapir', 'hello', 'tip' + tip);
    }
    case 'ants': {
      const q = qState('leaf');
      if (!q) { SAVE.data.quests.leaf = 'active'; return L('ants', 'qask1', 'qask2'); }
      if (q === 'active') return L('ants', 'qwait');
      if (q === 'got') { giveReward('leaf'); return L('ants', 'qthanks'); }
      return L('ants', 'after');
    }
    case 'elder': {
      const q = qState('specs');
      if (q === 'got') { giveReward('specs'); return L('elder', 'qthanks'); }
      // the first talk: the totem's story, then straight on to her lost spectacles (so nobody misses the quest)
      // (with all seven Feathers already won, she says so instead of telling of the empty sockets)
      if (!SAVE.data.flags.metElder) { SAVE.data.flags.metElder = 1; if (!q) SAVE.data.quests.specs = 'active'; return L('elder', 'totem1').concat(f >= 7 ? L('elder', 'totemfull') : L('elder', 'totem2', 'totem3'), q ? [] : L('elder', 'qask1', 'qask2')); }
      if (!q) { SAVE.data.quests.specs = 'active'; return L('elder', 'qask1', 'qask2'); }
      if (q === 'active') return L('elder', 'qwait');
      return [{ who: 'elder', key: f >= 7 ? 'd.elder.allf' : 'd.elder.count', vars: { n: f } }];
    }
    case 'zuzu': {
      const q = qState('letter');
      if (!q) { SAVE.data.quests.letter = 'active'; return L('zuzu', 'qask1', 'qask2'); }
      if (q === 'active') return L('zuzu', 'qwait');
      if (f >= 7) return L('zuzu', SAVE.data.cup ? 'done' : 'liftopen');
      // news about the next champion still to beat (Jada first)
      const next = JC.sportOrder.find(id => !SAVE.data.feathers[id]);
      return next === 'paddle' ? L('zuzu', 'after') : [{ who: 'zuzu', key: 'd.zuzu.next', vars: { sport: t('sport.' + next) } }];
    }
    case 'marm': return L('marm', 'hi');
    default: {
      if (n.sport) {
        const won = SAVE.data.feathers[n.sport];
        if (!JC.sports[n.sport]) return L(n.id, 'soon');
        return L(n.id, won ? 'won' : 'pre');
      }
      return [];
    }
  }
}
JC.talkLines = talkLines;
/** Does this NPC have something new (a quest to offer, a reward to give)? A "!" bubble shows over them. */
function hasNews(n) {
  const f = SAVE.featherCount(), fl = SAVE.data.flags;
  switch (n.id) {
    case 'mango': { const q = qState('mango'); return !fl.metMango || q === 'got' || (!q && f >= 1); }
    case 'elder': { const q = qState('specs'); return !fl.metElder || !q || q === 'got'; }
    case 'pip': { const q = qState('shells'); return !q || (q === 'active' && questItemsGot('shells') >= questItemsTotal('shells')); }
    case 'ants': { const q = qState('leaf'); return !q || q === 'got'; }
    case 'zuzu': return !qState('letter');
    case 'tapir': return qState('letter') === 'active';
    default: return false;
  }
}
JC.hasNews = hasNews;
/** Picking up a quest item where Cappy stands (or in front of him). */
function pickItem(it) {
  SAVE.data.flags['got_' + it.quest + it.i] = 1;
  AUDIO.sfx('pickup'); UI.burst(0, 0, 0, PAL.r5);
  const q = it.quest;
  if (q === 'shells') { const got = questItemsGot('shells'), tot = questItemsTotal('shells'); UI.banner(t('quest.found', { n: got, total: tot }), PAL.r4, 1.6); }
  else { SAVE.data.quests[q] = 'got'; UI.banner(t('quest.got.' + q), PAL.r4, 1.8); }
  SAVE.write();
}
JC.pickItem = pickItem;
JC.questVisible = it => qState(it.quest) === 'active' && !SAVE.data.flags['got_' + it.quest + it.i];
