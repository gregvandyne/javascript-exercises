// Oomba Breathe & Bend: Brain Break episode data (the "Move" area, /move). Pure data, no imports, so the
// player (routes/move.js), the AI voice registry (services/tts-lines.js, which re-exports these lines as the
// allowlist for ctx 'move') and the tests all read the same words. A new episode is a new entry here plus
// any new pose states in the Remy rig (public/js/move.js POSES and public/css/move.css): the player,
// narration, captions, music and completion all run off this shape.
//
// Rules for the words (Greg, 2026-11-05): every line is original copy written for Oomba; no em dashes;
// nothing a voice must never say (no emoji or pictographs); poses never assume a left or a right side;
// Tree rests the foot on the calf, never the knee; eyes close only "if you like". Captions ARE these
// lines, shown word for word while the narrator says them, so there is one copy, not two.
//
// seconds: the segment's share of the episode's 300 seconds. A segment with yourTurn holds Remy still
// for a 10 second "Your turn" ring inside its seconds (the pose hold), it does not add time.

export const SERIES = {
  id: 'breathe-and-bend',
  title: 'Oomba Breathe & Bend',
  host: 'Remy the Red Panda',
  // Season 1 as approved; only Episode 1 has data in this build, the rest are listed so the index can
  // show what is coming without promising a date.
  season: [
    { n: 1, slug: 'mountain-morning', title: 'Mountain Morning', note: 'Grounding and focus for the start of the day' },
    { n: 2, slug: 'ocean-breath', title: 'Ocean Breath', note: 'Calm after lunch' },
    { n: 3, slug: 'jungle-balance', title: 'Jungle Balance', note: 'Balance and concentration' },
    { n: 4, slug: 'space-stretch', title: 'Space Stretch', note: 'Energy release' },
    { n: 5, slug: 'garden-grow', title: 'Garden Grow', note: 'Growing strong, one step at a time' },
    { n: 6, slug: 'river-flow', title: 'River Flow', note: 'Back and posture' },
    { n: 7, slug: 'volcano-shake-out', title: 'Volcano Shake-Out', note: 'Big feelings, then settling' },
    { n: 8, slug: 'sunset-wind-down', title: 'Sunset Wind-Down', note: 'The slowest one, for the end of the day' },
  ],
};

const seg = (id, name, pose, seconds, lines, extra = {}) => ({ id, name, pose, seconds, lines, ...extra });

/**
 * The video clip file name for each segment id (Greg's video pack, 2026-11-05: he generates the
 * real clips externally and hands them back with exactly these names). A clip lives at
 * public/video/move/<episode id>/<name>.mp4 and, when present, replaces the segment's still
 * frame in the player (looped to fill the segment, still frame as its poster). Clips are silent
 * by design: the player supplies narration, music and captions. No clip file = the still shows.
 */
export const CLIP_SLUGS = {
  intro: '01-intro', spark: '02-breathing', mountain: '03-mountain', tree: '04-tree', star: '05-star',
  waterfall: '06-waterfall', butterfly: '07-butterfly', boat: '08-boat', cobra: '09-cobra', rest: '10-rest',
};

/**
 * The transition clips between neighbouring segments, in boundary order (TRANSITION_SLUGS[i]
 * joins segments i and i + 1): t01-02.mp4 to t09-10.mp4, the names in Greg's video pack. A
 * transition is a shot of Remy moving from one pose into the next; the player straddles it
 * across the boundary (starting it just before the chapter change) so the assembled episode
 * reads as one continuous video rather than ten clips. No transition file = the player
 * crossfades the two pose clips (or stills) directly.
 */
export const TRANSITION_SLUGS = [
  't01-02', 't02-03', 't03-04', 't04-05', 't05-06', 't06-07', 't07-08', 't08-09', 't09-10',
];

/**
 * The episode as ONE narration timeline (Greg's seamless rule, 2026-11-05): every line of the
 * episode, segment lines first and the end card lines last, each with the episode second it is
 * due to start. Starts are planned, not measured: within a segment, lines are spaced by an
 * estimated reading time (about 13 characters per second, scaled down if they would overrun
 * the segment), so the lines cluster where the teaching happens and the rest of the segment is
 * practice time. The player schedules from this single list: a line never starts before its
 * due second, but if the real voice is still speaking when the next line (or the next pose)
 * arrives, the line in progress simply continues across the join and the queue follows it.
 * Nothing about narration is per segment any more; segments are only chapter markers here.
 */
export function narrationTimeline(e) {
  const CHARS_PER_SEC = 13;
  const entries = [];
  let segStart = 0;
  e.segments.forEach((seg, si) => {
    const estimates = seg.lines.map(text => Math.max(1.6, text.length / CHARS_PER_SEC));
    const total = estimates.reduce((a, b) => a + b, 0);
    const scale = total > seg.seconds ? seg.seconds / total : 1;
    let at = segStart;
    seg.lines.forEach((text, li) => { entries.push({ seg: si, line: li, text, start: at }); at += estimates[li] * scale; });
    segStart += seg.seconds;
  });
  e.endLines.forEach((text, li) => entries.push({ seg: e.segments.length, line: li, text, start: segStart }));
  return entries;
}

export const EPISODES = [
  {
    id: 'mountain-morning',
    n: 1,
    title: 'Mountain Morning',
    withHost: 'Mountain Morning with Remy',
    note: 'Grounding and focus for the start of the day',
    coverPose: 'mountain',
    segments: [
      seg('intro', 'Welcome', 'intro', 20, [
        "Hello. I'm Remy. Let's wake up our bodies and quiet our minds, in just five minutes.",
        'Clear a little space, and stand where you can stretch your arms wide.',
        'Move only as far as feels good. Stop if anything hurts. You can always do the seated version.',
      ]),
      seg('spark', 'Spark Breathing', 'spark', 45, [
        'Trace the star with me. Breathe in as we go up one side, and out as we come down.',
        'In. Out. In. Out. One more.',
        "Notice how your shoulders dropped? That's your body saying thank you.",
      ], { seated: 'Sit tall, feet flat on the floor. Trace the star in the air, or on your knee.' }),
      seg('mountain', 'Mountain Pose', 'mountain', 40, [
        'Feet together, or a little apart. Both are fine. Stand tall like a mountain.',
        "Mountains don't hurry. Breathe in, arms float up. Breathe out, arms float down. Again.",
      ], { seated: 'Sit tall on your chair, feet flat. Reach your arms up high, then float them down.' }),
      seg('tree', 'Tree Pose', 'tree', 40, [
        'Shift onto one foot. Rest the other foot on your calf, like a tree root climbing.',
        'Wobbling is not failing. Wobbling is your tree growing its balance. Swap sides.',
      ], { seated: 'Sit tall. Rest one foot against your calf, or keep both feet down and lift just your heel.', yourTurn: true }),
      seg('star', 'Star Pose', 'star', 25, [
        'Step wide and shine. Five points, just like our breathing star: two feet, two hands, one bright head. Take up your space.',
      ], { seated: 'Sit tall and open your arms wide. Stretch your legs out wide too, if you can.' }),
      seg('waterfall', 'Waterfall Forward Fold', 'waterfall', 30, [
        "Turn your toes forward. Let your top half pour down like a waterfall. Knees can bend. Waterfalls don't have straight legs.",
        'Sway a little. Then roll up, one slow piece at a time.',
      ], { seated: 'Sit tall, then fold forward over your legs, as far as feels good. Roll up slowly.' }),
      seg('butterfly', 'Butterfly Pose', 'butterfly', 30, [
        'Sit down and put the soles of your feet together. Let your knees be butterfly wings.',
        'Three slow flaps. Then let your butterfly rest on a flower. Sit tall and breathe.',
      ]),
      seg('boat', 'Boat Pose', 'boat', 30, [
        "Stay sitting. Lean back a tiny bit and lift one foot, or both if you like. You're a little boat.",
        "Boats tip. That's okay. Just put a foot down and float again. Strong tummies, soft faces.",
      ], { yourTurn: true }),
      seg('cobra', 'Cobra Pose', 'cobra', 20, [
        'Lie on your tummy. Paws under your shoulders. Press just a little and lift your chest, like a curious cobra having a look around.',
        'Low is perfect. Smile, then melt back down.',
      ]),
      seg('rest', 'Starfish Rest', 'rest', 20, [
        'Lie back like a starfish on warm sand. Arms wide, legs wide, eyes closed if you like.',
        'Breathe in, and let it all go. You moved, you breathed, you rested. That is a great morning, mountain.',
        "When you're ready, wiggle your fingers, and open your eyes.",
      ]),
    ],
    endLines: [
      'Notice one sound, one colour, one breath. Now you are ready to learn.',
    ],
  },
];

export const episodeById = id => EPISODES.find(e => e.id === id) || null;
/** Total planned seconds of an episode (300 for Episode 1). */
export const episodeSeconds = e => e.segments.reduce((a, s) => a + s.seconds, 0);
/** Every spoken line of an episode, in order: [segment lines..., end card lines...]. */
export const allLines = e => [...e.segments.flatMap(s => s.lines), ...e.endLines];
/**
 * The line the server will read for ctx 'move': segment i, line j of an episode; i == segments.length
 * reads the end card lines. Returns null for anything out of range, so the page can never pick the words.
 */
export function lineAt(episodeId, i, j) {
  const e = episodeById(episodeId);
  if (!e || !Number.isInteger(i) || !Number.isInteger(j)) return null;
  const lines = i < e.segments.length ? e.segments[i].lines : i === e.segments.length ? e.endLines : null;
  return lines && j >= 0 && j < lines.length ? lines[j] : null;
}
