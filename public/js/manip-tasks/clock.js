// Clock: the tool's 16 tasks as practice (docs/manip-practice-tasks.md). As in rekenreks.js: each task keeps its title,
// code, grade and notes; make(R) gives one variation from a seeded random source; conds are this tool's board checks,
// read from the board's clocks (h 1 to 12 and m; the time tracker's start; a clock by its label, Start or End). A
// practice clock to read is read only (q: its face only). Most variations hide the digital time (Totals off), so the
// face is read; times are on five-minute marks, which Hour + and Min +5 reach, except a read-only clock to read.
import { boardWith, rowPlaces, objSizeOf, countTo, endLine } from '../manip-task-kit.js';

export const SLUG = 'clock';
const num = (v, d = 0) => (Number.isFinite(+v) ? +v : d);
/** Minutes on a 12-hour face (12:00 is 0). */
const toMin = ({ h, m }) => (((Math.round(num(h)) % 12) + 12) % 12) * 60 + Math.round(num(m));
const ofMin = t => { const x = ((t % 720) + 720) % 720, h = Math.floor(x / 60); return { h: h || 12, m: x % 60 }; };
const hm = c => `${c.h}:${String(c.m).padStart(2, '0')}`;
const at = (h, m) => ({ h, m });
const plus = (c, d) => ofMin(toMin(c) + d);
/** A clock to start from that is not already at t (a five-minute mark some way off). */
const away = (R, t) => plus(t, 5 * R.int(3, 140));
/** A duration in words: "1 hour 15 minutes", "45 minutes", "2 hours". */
const dur = n => { const h = Math.floor(n / 60), m = n % 60; return [h ? `${h} ${h === 1 ? 'hour' : 'hours'}` : '', m ? `${m} ${m === 1 ? 'minute' : 'minutes'}` : ''].filter(Boolean).join(' ') || '0 minutes'; };
const hmin = n => `${Math.floor(n / 60)} h ${n % 60} min`;
/** A random time on a five-minute mark, hours lo to hi (1 to 12). */
const any5 = (R, lo = 1, hi = 12) => at(R.int(lo, hi), 5 * R.int(0, 11));
/** Up to n answer options, the right one and unique wrong ones, shuffled. -> { options, correct } */
function options(R, right, wrong, n = 3) {
  const out = [right];
  for (const w of wrong) if (out.length < n && w && !out.includes(w)) out.push(w);
  const sh = R.shuffle(out);
  return { options: sh, correct: sh.indexOf(right) };
}

// ---------------------------------------------------------------- the board
/** A board with these clocks side by side (ids k1, k2, ...): [{ h, m, label, q, start }]. */
export function clockBoard(list) {
  const sts = list.map(({ h = 12, m = 0, label = '', q = false, start = null }) => ({ h, m, start, label, ...(q ? { q: true } : {}) }));
  const places = rowPlaces(sts.map(st => objSizeOf(SLUG, SLUG, st)));
  return boardWith(SLUG, sts.map((st, i) => ({ id: `k${i + 1}`, k: SLUG, x: places[i].x, y: places[i].y, s: 1, st })));
}
/** The same board with the clocks set: [{ h, m, start }] in order (undefined: as it was). */
function solved(setup, list) {
  const b = JSON.parse(JSON.stringify(setup)), cs = b.objects.filter(o => o.k === SLUG);
  list.forEach((c, i) => { if (c) Object.assign(cs[i].st, { h: c.h, m: c.m }, c.start !== undefined ? { start: c.start } : {}); });
  return b;
}

// ---------------------------------------------------------------- the checks
/** The clocks a student sets (not the read-only ones): [{ label, t (minutes), start (minutes or null) }]. */
const clocksOf = b => ((b && Array.isArray(b.objects)) ? b.objects : []).filter(o => o && o.k === SLUG && o.st && typeof o.st === 'object' && !o.st.q)
  .map(o => ({ label: String(o.st.label || ''), t: toMin(o.st), start: o.st.start && typeof o.st.start === 'object' ? toMin(o.st.start) : null }));
const clockOf = (c, b) => { const l = clocksOf(b); return c.label ? l.find(x => x.label === c.label) || null : l[0] || null; };
export const conds = {
  /** The clock (by label, else the first) shows h:m. */
  time: (c, b) => { const x = clockOf(c, b); return !!x && x.t === toMin(c); },
  /** The clock's tracker started at `from` and n minutes have passed since (the clock's time is from + n). */
  tracked: (c, b) => { const x = clockOf(c, b); return !!x && x.start === toMin(c.from) && (((x.t - x.start) % 720) + 720) % 720 === c.n % 720; },
};

// ---------------------------------------------------------------- the tasks
const T = (key, title, ccss, grade, prompt, notes, make, totals = false) => ({ key, title, ccss, grade, prompt, notes, make: R => ({ ...(totals ? {} : { totals: false }), ...make(R) }) });
const SET = 'Tap Hour + and Min +5 under the clock, or drag the hands: near the middle for the red hour hand, near the edge for the blue minute hand.';

export const TASKS = [
  T('elapsed-time', 'Elapsed time', '3.MD.A.1', '3',
    'Set the Start clock and the End clock to two times. How many minutes are between them?',
    'Bridge through 10:00: 45 minutes to 10, then 1 hour 45 more. The two-clock workspace keeps start and end visible together.',
    R => {
      const s = any5(R, 7, 10), n = 5 * R.int(4, 40), e = plus(s, n), setup = clockBoard([{ label: 'Start' }, { label: 'End' }]);
      const nx = plus(at(s.h, 0), 60);
      return {
        prompt: `Set the Start clock to ${hm(s)} and the End clock to ${hm(e)}. How many minutes are between them?`,
        setup, answer: { board: [{ t: 'time', label: 'Start', ...s, say: `Set the Start clock to ${hm(s)}.` }, { t: 'time', label: 'End', ...e, say: `Set the End clock to ${hm(e)}.` }], box: { key: String(n), label: 'minutes' } },
        hints: [SET, s.m ? `From ${hm(s)} to ${hm(nx)} is ${60 - s.m} minutes. Then count on to ${hm(e)}.` : `Count the hours from ${hm(s)}, then the minutes up to ${hm(e)}.`, n >= 60 ? `It is ${dur(n)}: ${n} minutes.` : `It is ${n} minutes.`],
        explain: `From ${hm(s)} to ${hm(e)} is ${dur(n)}${n >= 60 ? `, which is ${n} minutes` : ''}.`,
        solution: { board: solved(setup, [s, e]), box: String(n) },
      };
    }, true),
  T('half-past-and-quarter-to', 'Half and quarter hours', '2.MD.C.7', '2',
    'Set the clock to a time said in words, like half past 7 or quarter to 8. Pick the digital time.',
    'The hour hand creeps: at quarter to 8 it nearly touches 8. That creep is exactly what children miss when reading clocks.',
    R => {
      const h = R.int(1, 12), k = R.pick(['half past', 'quarter past', 'quarter to', "o'clock"]);
      const t = k === 'half past' ? at(h, 30) : k === 'quarter past' ? at(h, 15) : k === 'quarter to' ? plus(at(h, 0), -15) : at(h, 0);
      const setup = clockBoard([away(R, t)]);
      const words = k === "o'clock" ? `${h} o'clock` : `${k} ${h}`, right = hm(t);
      const ch = options(R, right, [hm(at(h, 45)), hm(at(h, 15)), hm(at(h, 30)), hm(plus(at(h, 0), 15)), hm(at(h === 12 ? 1 : h + 1, 0))]);
      return {
        prompt: `Set the clock to ${words}. Which digital time is ${words}?`,
        setup, answer: { board: [{ t: 'time', ...t, say: `Set the clock to ${words}.` }], choice: { ...ch, say: 'Where does the blue minute hand point for this time?' } },
        hints: [SET, k === 'half past' ? 'Half past: the minute hand points to the 6, 30 minutes.' : k === 'quarter past' ? 'Quarter past: the minute hand points to the 3, 15 minutes.' : k === 'quarter to' ? `Quarter to ${h}: 15 minutes before ${h} o'clock. The minute hand points to the 9.` : "O'clock: the minute hand points straight up to the 12.", `${words} is ${right}.`],
        explain: `${words[0].toUpperCase()}${words.slice(1)} is ${right}.${k === 'quarter to' ? ` The hour hand is nearly at ${h}, so the hour is still ${t.h}.` : ''}`,
        solution: { board: solved(setup, [t]), choice: ch.correct },
      };
    }),
  T('time-tracker-challenge', 'Time tracker challenge', '3.MD.A.1', '3',
    'Use the Time Tracker: add 15 minutes some number of times from a start time. Where does the clock land?',
    'Four 15s make an hour: 11:30. Jumping in chunks builds the quarter-hour landmarks on the number line of the day.',
    R => {
      const s = any5(R, 1, 11), k = R.int(2, 6), e = plus(s, 15 * k), setup = clockBoard([s]);
      return {
        prompt: `The clock shows ${hm(s)}. Tap Time tracker +15 min ${k} times. What time does the clock land on?`,
        setup, answer: { board: [{ t: 'tracked', from: s, n: 15 * k, say: `Start at ${hm(s)} and add 15 minutes ${k} times with the tracker.` }], box: { key: hm(e), label: 'the time' } },
        hints: ['Time tracker +15 min is in the palette. Each tap adds 15 minutes.', `${k} jumps of 15 minutes is ${15 * k} minutes${k >= 4 ? `: 4 jumps make 1 hour` : ''}.`, `${hm(s)} + ${dur(15 * k)} = ${hm(e)}.`],
        explain: `${k} × 15 = ${15 * k} minutes. ${hm(s)} and ${dur(15 * k)} later is ${hm(e)}.`,
        solution: { board: solved(setup, [{ ...e, start: s }]), box: hm(e) },
      };
    }),
  T('five-minute-reads', 'Five-minute reads', '2.MD.C.7', '2',
    'Read a clock to the nearest five minutes and type the time.',
    'Count the red minute marks by fives around the face, not the number the hand points at: pointing at 3 means 15 minutes.',
    R => {
      const exact = R.chance(0.6), h = R.int(1, 12), m5 = 5 * R.int(1, 11), off = exact ? 0 : R.pick([-2, -1, 1, 2]), t = plus(at(h, m5), off), near = at(h, m5);
      const setup = clockBoard([{ ...t, q: true }]);
      return {
        prompt: exact ? 'Read the clock. What time does it show? Type it like 3:25.' : 'Read the clock to the nearest five minutes. Type it like 3:25.',
        sig: `${exact ? 'e' : 'n'}${hm(t)}`,
        setup, answer: { box: { key: hm(near), label: 'the time', say: 'Look at the short red hand for the hour, then count the long blue hand by fives.' } },
        hints: ['The short red hand shows the hour. The long blue hand shows the minutes.', `Count by fives from the 12 to the blue hand: ${endLine(countTo(m5 / 5, 5, null))}${exact ? '' : ' It is near a big red mark: pick the closest one.'}`, `The hand is ${exact ? 'on' : 'nearest'} the ${m5 / 5}: ${m5} minutes. The time is ${hm(near)}.`],
        explain: `The minute hand ${exact ? 'points' : 'is closest'} to the ${m5 / 5}, and ${m5 / 5} ${m5 === 5 ? 'five makes' : 'fives make'} ${m5} minutes. The hour hand is past the ${h}, so it is ${hm(near)}.`,
        solution: { board: setup, box: hm(near) },
      };
    }),
  T('quarter-past-journey', 'Quarter past journey', '2.MD.C.7', '2',
    'Start at quarter past an hour and move on a quarter of an hour at a time to a later o\'clock. How many quarter hours did you move?',
    'Times run 3:15, 3:30, 3:45, 4:00 and on to 5:00. Quarter steps tile the hour exactly four times.',
    R => {
      const h = R.int(1, 10), H = R.int(h + 1, Math.min(12, h + 3)), s = at(h, 15), n = (H * 60 - (h * 60 + 15)) / 15, setup = clockBoard([s]);
      return {
        prompt: `The clock shows quarter past ${h}. Move it on a quarter of an hour at a time with Time tracker +15 min until ${H} o'clock. How many quarter hours did you move?`,
        setup, answer: { board: [{ t: 'tracked', from: s, n: 15 * n, say: `Use Time tracker +15 min from quarter past ${h} until ${H} o'clock.` }], box: { key: String(n), label: 'quarter hours' } },
        hints: ['Each tap of Time tracker +15 min is one quarter hour.', `${h}:15, ${h}:30, ${h}:45, ${h === 12 ? 1 : h + 1}:00, ... Count each jump until ${H}:00.`, `From ${h}:15 to ${H}:00 is ${n} quarter hours.`],
        explain: `${n} quarter hours: ${Array.from({ length: n }, (_, i) => hm(plus(s, 15 * (i + 1)))).join(', ')}.`,
        solution: { board: solved(setup, [{ ...at(H, 0), start: s }]), box: String(n) },
      };
    }),
  T('minutes-to-noon', 'Minutes to noon', '3.MD.A.1', '3',
    'Set the clock to a time, start the tracker, and move on to the next o\'clock. How many minutes is the jump?',
    '25 minutes, found by counting by fives to 12. The minute hand positions 7 means 35 minutes, not 7.',
    R => {
      const h = R.int(1, 12), m = 5 * R.int(1, 11), s = at(h, m), H = plus(at(h, 0), 60), setup = clockBoard([away(R, s)]);
      const to = H.h === 12 ? 'noon' : `${H.h} o'clock`;
      return {
        prompt: `Set the clock to ${hm(s)}. Tap Start the tracker here, then move the clock on to ${to}. How many minutes until ${to}?`,
        setup, answer: { board: [{ t: 'tracked', from: s, n: 60 - m, say: `Set ${hm(s)}, start the tracker there, then move on to ${hm(H)}.` }], box: { key: String(60 - m), label: 'minutes' } },
        hints: [`${SET} Then tap Start the tracker here.`, `Count by fives from ${m} up to 60 as the minute hand goes to the 12.`, `60 - ${m} = ${60 - m} minutes.`],
        explain: `The minute hand at the ${m / 5} means ${m} minutes. ${60 - m} more minutes bring it to the 12: ${to}.`,
        solution: { board: solved(setup, [{ ...H, start: s }]), box: String(60 - m) },
      };
    }),
  T('hour-hand-creep', 'Hour hand creep', '2.MD.C.7', '2',
    'Set a time and watch the hour hand. Which number is the hour hand closest to?',
    'The hour hand moves halfway by 6:30 and nearly reaches 7 by 6:55. Creep is proportional, which children can state in their own words.',
    R => {
      const h = R.int(1, 12), m = R.pick([5, 10, 15, 20, 25, 35, 40, 45, 50, 55]), nx = h === 12 ? 1 : h + 1, right = String(m < 30 ? h : nx), setup = clockBoard([away(R, at(h, m))]);
      const ch = options(R, right, [String(m < 30 ? nx : h), String(m / 5), String(h === 1 ? 12 : h - 1)]);
      return {
        prompt: `Set the clock to ${h}:${String(m).padStart(2, '0')}. Look at the red hour hand. Which number is it closest to?`,
        setup, answer: { board: [{ t: 'time', h, m, say: `Set the clock to ${h}:${String(m).padStart(2, '0')}.` }], choice: { ...ch, say: 'Look at the short red hand, not the long blue one.' } },
        hints: [SET, `The hour hand moves from ${h} toward ${nx} during the hour. At ${h}:30 it is halfway.`, `${m} minutes is ${m < 30 ? 'less' : 'more'} than halfway, so the hour hand is closest to ${right}.`],
        explain: `At ${h}:${String(m).padStart(2, '0')} the hour hand has moved ${m}/60 of the way from ${h} to ${nx}, so it is closest to ${right}.`,
        solution: { board: solved(setup, [at(h, m)]), choice: ch.correct },
      };
    }),
  T('backwards-time', 'Backwards time', '3.MD.A.1', '3',
    'Start at a time and move back some minutes, across the hour. Where do you land?',
    'Landing is 3:45. Crossing the hour backwards is the hard step; bridge through 4:00 explicitly.',
    R => {
      const s = at(R.int(1, 12), 5 * R.int(1, 8)), k = 5 * R.int(s.m / 5 + 1, 11), e = plus(s, -k), setup = clockBoard([s]);
      return {
        prompt: `The clock shows ${hm(s)}. Drag the blue minute hand back ${k} minutes. Where do you land?`,
        setup, answer: { board: [{ t: 'time', ...e, say: `Move the clock back ${k} minutes from ${hm(s)}.` }], box: { key: hm(e), label: 'the time' } },
        hints: ['Drag the blue minute hand the other way round, counterclockwise. Past the 12 the hour goes back too.', `Back ${s.m} minutes takes you to ${s.h}:00. Then back ${k - s.m} more.`, `${hm(s)} - ${k} minutes = ${hm(e)}.`],
        explain: `${hm(s)} back ${s.m} minutes is ${s.h}:00, and back ${k - s.m} more is ${hm(e)}.`,
        solution: { board: solved(setup, [e]), box: hm(e) },
      };
    }),
  T('digital-mismatch', 'Digital mismatch', '2.MD.C.7', '2',
    'A digital clock and a clock face are compared. Are they showing the same time? Type the time the face shows.',
    'Yes: the 1 means 5 minutes. The number on the face is hours for one hand and five-minute steps for the other.',
    R => {
      const h = R.int(1, 12), n = R.int(1, 11), t = at(h, 5 * n), same = R.chance(), dig = same ? hm(t) : `${h}:${String(n).padStart(2, '0')}`, setup = clockBoard([{ ...t, q: true }]);
      return {
        prompt: `A digital clock says ${dig}. The clock face shows the minute hand on the ${n}. Are they showing the same time? Then type the time on the face.`,
        sig: `${dig}|${hm(t)}`,
        setup, answer: { box: { key: hm(t), label: 'the time on the face' }, choice: { options: ['Yes, the same time', 'No, different times'], correct: same ? 0 : 1, say: `What does the minute hand on the ${n} mean?` } },
        hints: [`The minute hand on the ${n} does not mean ${n} ${n === 1 ? 'minute' : 'minutes'}.`, `Count by fives to the ${n}: ${Array.from({ length: n }, (_, i) => 5 * (i + 1)).join(', ')}.`, `The face shows ${hm(t)}${same ? ', the same as the digital clock' : `, not ${dig}`}.`],
        explain: `The minute hand on the ${n} means ${5 * n} minutes, so the face shows ${hm(t)}.${same ? ' They match.' : ` ${dig} would have the minute hand just past the 12.`}`,
        solution: { board: setup, box: hm(t), choice: same ? 0 : 1 },
      };
    }),
  T('half-hour-intervals', 'Half hour intervals', '3.MD.A.1', '3',
    'Use the tracker to add 30 minutes some number of times from a start time. Where do you land, and how many hours passed?',
    'Six halves make 3 hours, landing at 12:00. Grouping halves into hours is the strategy.',
    R => {
      const s = any5(R, 1, 11), k = R.int(2, 8), e = plus(s, 30 * k), setup = clockBoard([s]);
      const hrs = x => (x % 2 ? `${(x - 1) / 2 ? `${(x - 1) / 2} and a half` : 'Half an'} ${x === 1 ? 'hour' : 'hours'}` : `${x / 2} ${x === 2 ? 'hour' : 'hours'}`);
      const ch = options(R, hrs(k), [`${k} hours`, hrs(k + 1), hrs(k - 1), hrs(k * 2)]);
      return {
        prompt: `The clock shows ${hm(s)}. Add 30 minutes ${k} times (two taps of Time tracker +15 min each time). Where does the clock land, and how many hours passed?`,
        setup, answer: { board: [{ t: 'tracked', from: s, n: 30 * k, say: `Start at ${hm(s)} and add 30 minutes ${k} times.` }], box: { key: hm(e), label: 'the time' }, choice: { ...ch, say: 'Two half hours make one hour.' } },
        hints: ['Two taps of Time tracker +15 min make 30 minutes.', `${k} half hours: every two make 1 hour.`, `${k} × 30 = ${30 * k} minutes = ${hrs(k).toLowerCase()}. The clock lands on ${hm(e)}.`],
        explain: `${k} half hours is ${30 * k} minutes, ${hrs(k).toLowerCase()}. ${hm(s)} then becomes ${hm(e)}.`,
        solution: { board: solved(setup, [{ ...e, start: s }]), box: hm(e), choice: ch.correct },
      };
    }),
  T('school-day-timeline', 'School day timeline', '3.MD.A.1', '3',
    'Set clocks for the start and the end of a school day. How long is the school day?',
    '6 hours 30 minutes, bridged through 12:00. Two clocks keep both ends of the problem visible.',
    R => {
      const s = at(R.int(7, 9), 5 * R.int(0, 11)), e = at(R.int(2, 3), 5 * R.int(0, 11)), n = (toMin(e) + 720 - toMin(s)) % 720 || 720;
      const setup = clockBoard([{ label: 'Start' }, { label: 'End' }]), what = R.pick(['school day', 'field trip', 'summer camp day', 'library day']);
      const ch = options(R, hmin(n), [hmin(n - 60), hmin(n + 60), hmin(Math.abs(toMin(e) - toMin(s)) % 720), hmin(n - 30)]);
      return {
        prompt: `The ${what} starts at ${hm(s)} in the morning and ends at ${hm(e)} in the afternoon. Set the Start and End clocks. How long is the ${what}?`,
        setup, answer: { board: [{ t: 'time', label: 'Start', ...s, say: `Set the Start clock to ${hm(s)}.` }, { t: 'time', label: 'End', ...e, say: `Set the End clock to ${hm(e)}.` }], choice: { ...ch, say: 'Count up from the start to 12:00, then on to the end.' } },
        hints: [SET, `From ${hm(s)} to 12:00 is ${dur(720 - toMin(s))}. From 12:00 to ${hm(e)} is ${dur(toMin(e))}.`, `${dur(720 - toMin(s))} + ${dur(toMin(e))} = ${dur(n)}.`],
        explain: `${hm(s)} to 12:00 is ${dur(720 - toMin(s))}, and 12:00 to ${hm(e)} is ${dur(toMin(e))}: ${dur(n)} in all.`,
        solution: { board: solved(setup, [s, e]), choice: ch.correct },
      };
    }, true),
  T('five-minutes-to', 'Minutes to the hour', '2.MD.C.7', '2',
    'Set a "to" time, like ten to 5 or five to 5. Pick the digital time.',
    '4:50 and 4:55. To times name the coming hour, which is why the hour hand nearly touches 5.',
    R => {
      const h = R.int(1, 12), k = R.pick([5, 10, 20, 25]), t = plus(at(h, 0), -k), words = `${['', 'five', 'ten', '', 'twenty', 'twenty-five'][k / 5]} to ${h}`, setup = clockBoard([away(R, t)]);
      const ch = options(R, hm(t), [hm(at(h, k)), hm(at(h, 60 - k)), hm(at(t.h, k))]);
      return {
        prompt: `Set the clock to ${words}. Which digital time is ${words}?`,
        setup, answer: { board: [{ t: 'time', ...t, say: `Set the clock to ${k} minutes before ${h} o'clock.` }], choice: { ...ch, say: `"To ${h}" means before ${h} o'clock.` } },
        hints: [SET, `${words[0].toUpperCase()}${words.slice(1)} means ${k} minutes before ${h} o'clock.`, `${k} minutes before ${h}:00 is ${hm(t)}.`],
        explain: `${words[0].toUpperCase()}${words.slice(1)} is ${hm(t)}: the hour hand is nearly at ${h}, but the hour is still ${t.h}.`,
        solution: { board: solved(setup, [t]), choice: ch.correct },
      };
    }),
  T('interval-wedge', 'Interval wedge', '3.MD.A.1', '3',
    'Start the tracker at a time and move the time on by an interval. The wedge shows it. Where is the end, and what time is it?',
    'End is 2:50. The wedge between hands is the interval, making duration a visible slice.',
    R => {
      const s = at(R.int(1, 12), 5 * R.int(0, 6)), k = 5 * R.int(2, 11), e = plus(s, k), setup = clockBoard([s]);
      return {
        prompt: `The clock shows ${hm(s)}. Tap Start the tracker here, then move the time on ${k} minutes. The yellow wedge shows the interval. What time is it at the end?`,
        setup, answer: { board: [{ t: 'tracked', from: s, n: k, say: `Start the tracker at ${hm(s)}, then move on ${k} minutes.` }], box: { key: hm(e), label: 'the end time' } },
        hints: ['Start the tracker here is in the palette. Then tap Min +5, or drag the blue hand.', `${k} minutes is ${k / 5} jumps of 5 minutes.`, `${hm(s)} + ${k} minutes = ${hm(e)}.`],
        explain: `The wedge from ${hm(s)} to ${hm(e)} is ${k} minutes.`,
        solution: { board: solved(setup, [{ ...e, start: s }]), box: hm(e) },
      };
    }),
  T('am-pm-talk', 'AM PM talk', '2.MD.C.7', '2',
    'Set the clock to the time of an event in a story. Is it AM or PM?',
    'AM and PM disambiguate the twice-daily times. Stories make the need for the labels obvious.',
    R => {
      const STORIES = [['eats breakfast', 6, 8, 0], ['walks to school', 7, 8, 0], ['has morning recess', 9, 10, 0], ['wakes up', 5, 7, 0], ['starts math class', 8, 10, 0], ['feeds the dog before school', 6, 7, 0],
        ['eats dinner', 5, 7, 1], ['goes to bed', 7, 9, 1], ['has soccer practice after school', 3, 5, 1], ['reads a bedtime story', 7, 8, 1], ['watches the sunset', 6, 8, 1], ['takes a bath before bed', 6, 8, 1]];
      const [what, lo, hi, pm] = R.pick(STORIES), t = any5(R, lo, hi), who = R.pick(['Ana', 'Ben', 'Kai', 'Lily', 'Max', 'Rosa']), setup = clockBoard([away(R, t)]);
      return {
        prompt: `${who} ${what} at ${hm(t)}. Set the clock to ${hm(t)}. Is it ${hm(t)} AM or ${hm(t)} PM?`,
        setup, answer: { board: [{ t: 'time', ...t, say: `Set the clock to ${hm(t)}.` }], choice: { options: ['AM', 'PM'], correct: pm, say: 'AM is from midnight to noon; PM is from noon to midnight.' } },
        hints: [SET, 'AM times are from midnight until noon: night and morning. PM times are from noon until midnight: afternoon and evening.', `${who} ${what} in the ${pm ? 'afternoon or evening' : 'morning'}, so it is ${hm(t)} ${pm ? 'PM' : 'AM'}.`],
        explain: `A clock face shows ${hm(t)} twice a day. ${who} ${what} in the ${pm ? 'afternoon or evening' : 'morning'}: ${hm(t)} ${pm ? 'PM' : 'AM'}.`,
        solution: { board: solved(setup, [t]), choice: pm },
      };
    }),
  T('race-the-minute-hand', 'Race the minute hand', '3.MD.A.1', '3',
    'Move the clock from one o\'clock time to a later one. How many times does the minute hand pass the hour hand on the way?',
    'The minute hand passes the hour hand once in that hour, just after 1:05 in the next hour cycle discussion. Reasoning matters more than the count.',
    R => {
      const a = R.int(1, 11), b = R.int(a + 1, Math.min(12, a + 3)), n = Math.max(0, Math.min(b - 1, 10) - a + 1), setup = clockBoard([at(a, 0)]);
      return {
        prompt: `The clock shows ${a}:00. Move it on to ${b}:00 a little at a time with Min +5, and watch the two hands. How many times does the minute hand pass the hour hand between ${a}:00 and ${b}:00?`,
        setup, answer: { board: [{ t: 'time', h: b, m: 0, say: `Move the clock on to ${b}:00.` }], box: { key: String(n), label: 'times' } },
        hints: ['The minute hand goes all the way round once an hour. The hour hand moves only to the next number.', `In each hour from ${a}:00 the minute hand catches the hour hand once, a little after the hour hand's number${b > 11 ? '. Between 11:00 and 12:00 they meet only at 12:00 itself' : ''}.`, `They pass ${n} ${n === 1 ? 'time' : 'times'} between ${a}:00 and ${b}:00.`],
        explain: n ? `The hands meet a little after ${Array.from({ length: n }, (_, i) => `${a + i}:${String(Math.floor((60 * (a + i)) / 11)).padStart(2, '0')}`).join(', ')}: ${n} ${n === 1 ? 'time' : 'times'}.`
          : 'Between 11:00 and 12:00 the minute hand never catches the hour hand: they meet only at 12:00 itself. 0 times.',
        solution: { board: solved(setup, [at(b, 0)]), box: String(n) },
      };
    }),
  T('plan-a-morning', 'Plan a morning', '3.MD.A.1', '3',
    'You wake at a time, then spend some minutes eating and some traveling. Set a clock for each stage and find your arrival time.',
    'Stages land at 7:05 and 7:20. Sequencing intervals is real elapsed-time planning.',
    R => {
      const w = at(R.int(6, 7), 5 * R.int(0, 11)), e = 5 * R.int(2, 6), tr = 5 * R.int(2, 8), a = plus(w, e), b = plus(a, tr);
      const [eat, go] = R.pick([['eat', 'travel to school'], ['eat breakfast', 'walk to school'], ['get dressed and eat', 'ride the bus'], ['eat', 'bike to the park']]);
      const setup = clockBoard([{ ...w, label: 'Done eating' }, { ...w, label: 'Arrive' }]);
      return {
        prompt: `You wake at ${hm(w)}. You need ${e} minutes to ${eat} and ${tr} minutes to ${go}. Set the Done eating clock and the Arrive clock. What time do you arrive?`,
        setup, answer: { board: [{ t: 'time', label: 'Done eating', ...a, say: `Done eating is ${e} minutes after ${hm(w)}.` }, { t: 'time', label: 'Arrive', ...b, say: `Arrive is ${tr} minutes after you are done eating.` }], box: { key: hm(b), label: 'arrival time' } },
        hints: ['Both clocks start at the time you wake. Tap Min +5 to move each one on.', `${hm(w)} + ${e} minutes = ${hm(a)}.`, `${hm(a)} + ${tr} minutes = ${hm(b)}.`],
        explain: `${hm(w)}, then ${e} minutes later ${hm(a)}, then ${tr} minutes later ${hm(b)}.`,
        solution: { board: solved(setup, [a, b]), box: hm(b) },
      };
    }),
];

