// Oomba's action cards for live games (registry: ./index.js; helpers: ./shared.js; strings: js.companion.act.live.*).
// A live room lives in memory (services/classlive-sessions.js), not in the database, so these actions have no dry run:
// `dry: false` and check() says why it cannot be done now (the framework calls it before the card and again at the tap).
// hostLive opens the same room as the "Quick game" page (services/quick-live.js openQuick, as POST /api/live/quick);
// endLive ends it as the host page's End does (LS.endSession). Nothing about the players goes to the AI.
import * as S from '../schools.js';
import * as LS from '../classlive-sessions.js';
import * as A from '../classlive-access.js';
import * as QL from '../quick-live.js';
import { SUBJECTS, LEVELS } from '../../live/bank/index.js';
import { no, clean, whichClass, className, P, CLASS_REF } from './shared.js';

const OFF = 'Live games are not available here.';
const canTeach = (u, c) => !!c && !c.archived_at && S.teaches(u, c.id);
/** The teacher's open room (one they host), or null. */
const openRoom = u => { const s = LS.hostSession(u.id); return s && s.phase !== 'ended' && LS.roleOf(s, u.id) === 'host' ? s : null; };
/** Why a quick room cannot be opened now, for the AI (or ''). */
function hostWhy(u, classId) {
  if (!LS.liveOn() || !A.canHost(u)) return OFF;
  if (classId && !canTeach(u, S.getClass(classId))) return 'That is not one of the teacher\'s classes any more.';
  const old = LS.hostSession(u.id);
  if (old && old.phase !== 'ended') return 'The teacher has a live game open already: they end it (or go back to it at /live) first.';
  return '';
}
const hostLink = (sid, t) => ({ href: `/live/host/${encodeURIComponent(sid)}`, label: t('js.companion.act.live.host.open'), primary: true });

export default [
  // POST /api/live/quick: QL.openQuick (the bank's questions by subject and level; the modes of QL.quickModes(), which
  // leaves out hidden games, so Brain Board while Quest Race and Question Battle are hidden). Undo ends the room while
  // nobody has started it; once the game has begun it is ended on the host page instead.
  {
    id: 'hostLive', area: 'live', risk: 'students', warn: 'host', undoable: true, dry: false,
    label: 'Open a quick live game for a class (ready questions from the question bank; the class\'s students join from their class page).',
    params: {
      classRef: CLASS_REF,
      game: P('Optional: the live game, only when the teacher named one (the app says what is on offer).'),
      topic: P(`Optional: the question bank subject, mixed (the default) or one of ${SUBJECTS.join(', ')}.`),
      level: P(`Optional: the question bank level, one of ${LEVELS.join(', ')} (a6 is ages 6 to 7, a12 is 12 and up). Leave out for the class's grade.`),
    },
    plan(u, ctx, p) {
      if (!LS.liveOn() || !A.canHost(u)) return no(OFF);
      const w = whichClass(u, ctx, p.classRef, { fit: c => canTeach(u, c) }); if (!w.c) return w;
      const modes = QL.quickModes();
      if (!modes.length) return no(OFF);
      const has = v => typeof v === 'string' && v.trim();
      if (has(p.game) && !modes.includes(p.game)) return no(`That game is not on offer for a quick game. On offer: ${modes.join(', ')}.`);
      if (has(p.topic) && p.topic !== 'mixed' && !SUBJECTS.includes(p.topic)) return no(`The question bank has no such subject. It has: mixed, ${SUBJECTS.join(', ')}.`);
      if (has(p.level) && !LEVELS.includes(p.level)) return no(`The question bank has no such level. It has: ${LEVELS.join(', ')}.`);
      const why = hostWhy(u, w.c.id); if (why) return no(why);
      const { mode, subject, level } = QL.quickPlan(u, w.c, { mode: p.game, subject: p.topic, level: p.level });
      return {
        data: { classId: w.c.id, pick: { mode, subject, level }, lang: ctx.lang || 'en' },
        ai: `Open a quick live game for ${clean(ctx, w.c.name)}: ${mode}, ${subject}, level ${level}, ${QL.QUICK_COUNT} questions. The class's students join from their class page. Say "hosting a live game" (never a lesson): its results reach the class's Progress page only once it is played and ended, so never say they are saved or there now.`,
      };
    },
    check: (u, d) => hostWhy(u, d.classId),
    view: (u, d, t) => ({ title: t('js.companion.act.live.host.ask', { class: className(d.classId) }), lines: [QL.pickLine({ locale: t.locale || 'en', t }, d.pick), t('js.companion.act.live.host.what', { count: QL.QUICK_COUNT })] }),
    run(u, d) {
      const c = S.getClass(d.classId);
      if (!canTeach(u, c)) return { ok: false, code: 'notFound' };
      const r = QL.openQuick(u, c, d.pick, d.lang || 'en');
      if (!r.ok) return { ok: false, code: r.code === 'notFound' ? 'notFound' : 'error' };
      const back = LS.get(r.session.id);
      return { ok: true, landed: !!back && back.phase !== 'ended' && back.classId === c.id, done: { classId: c.id, sid: r.session.id }, undo: { sid: r.session.id } };
    },
    // Chat audit 3: the Progress page said "No live games" after this; a room's results are saved when it is played and
    // ended (classlive-results.js save), and the page shows an open room meanwhile. The card says so.
    doneView: (u, d, t) => ({ lines: [t('js.companion.act.live.host.done', { class: className(d.classId) }), t('js.companion.act.live.host.results')], links: [hostLink(d.sid, t), { href: `/class/${encodeURIComponent(d.classId)}/progress#live-games`, label: t('js.companion.act.live.host.progress') }] }),
    // Only a room nobody has started yet: a game being played is ended on the host page.
    undo(u, d) {
      const s = LS.get(d.sid);
      if (!s || s.phase === 'ended') return { ok: true, skipped: 1 };
      if (LS.roleOf(s, u.id) !== 'host') return { ok: false, code: 'notFound' };
      if (s.startedAt) return { ok: false, code: 'started' };
      LS.endSession(s.id, 'ended');
      return { ok: true, skipped: 0 };
    },
  },

  // The host page's End (classlive-sessions.js endSession; homeroom-livegame.js end): the teacher's own open room.
  {
    id: 'endLive', area: 'live', risk: 'students', warn: 'end', undoable: false, dry: false,
    label: 'End the live game the teacher is hosting now (it ends on every screen in it; a game that was played keeps its results).',
    params: {},
    plan(u, ctx) {
      if (!LS.liveOn() || !A.canHost(u)) return no(OFF);
      const s = openRoom(u); if (!s) return no('The teacher has no live game open.');
      return { data: { sid: s.id }, ai: `End the teacher's live game "${clean(ctx, s.title, 60)}" (${s.startedAt ? 'being played' : 'not started yet'}).` };
    },
    check(u, d) { const s = openRoom(u); return s && s.id === d.sid ? '' : 'That live game is not open any more.'; },
    view(u, d, t) {
      const s = LS.get(d.sid);
      return { title: t('js.companion.act.live.end.ask', { title: s ? s.title : '' }), lines: s ? [t('js.companion.act.live.end.players', { count: s.seats.size })] : [] };
    },
    run(u, d) {
      const s = openRoom(u); if (!s || s.id !== d.sid) return { ok: false, code: 'notFound' };
      const played = !!s.startedAt, title = s.title;
      LS.endSession(s.id, 'ended');
      const back = LS.get(s.id);
      return { ok: true, landed: !back || back.phase === 'ended', done: { sid: s.id, title, played } };
    },
    doneView: (u, d, t) => ({ lines: [t('js.companion.act.live.end.done', { title: d.title || '' }), ...(d.played ? [] : [t('js.companion.act.live.end.notPlayed')])], links: d.played ? [{ href: `/live/results/${encodeURIComponent(d.sid)}`, label: t('js.companion.act.live.end.results') }] : [] }),
  },
];
