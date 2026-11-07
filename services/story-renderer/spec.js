// What the renderer service accepts (server.js): a render spec in the shape server/stories/pipeline.js renderSpec makes,
// checked field by field and copied, so nothing else reaches Blender (no paths: the service picks the output folder).
// Limits keep one job to a sane size: at most 1920x1080, 30 fps, 10 scenes of at most 120 s, 32 samples.
// A job with an assembly bundle carries the voice clips (base64): a 90 s story is ~1-2 MB of MP3s.
export const MAX_BODY = 24 * 1024 * 1024;
export const LIMITS = { width: 1920, height: 1080, fps: 30, step: 6, samples: 32, scenes: 10, sceneSeconds: 120, chars: 3, props: 6, onlyFrames: 12 };
const NAME = /^[a-z][a-z0-9_]{0,23}$/;
const ID = /^[A-Za-z0-9_-]{1,16}$/;
/** The music moods (server/services/story-music.js MOOD_NAMES; a test keeps them in step). */
export const MOODS = ['lullaby', 'playful', 'adventure', 'magical', 'piano', 'none'];

/** -> { ok, spec, problems } */
export function checkSpec(input) {
  const problems = [];
  const d = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const int = (v, lo, hi, name) => { const n = Number(v); if (!Number.isInteger(n) || n < lo || n > hi) { problems.push(`${name}: a whole number ${lo}..${hi}`); return lo; } return n; };
  const spec = {
    width: int(d.width, 16, LIMITS.width, 'width'),
    height: int(d.height, 16, LIMITS.height, 'height'),
    fps: int(d.fps, 1, LIMITS.fps, 'fps'),
    step: int(d.step ?? 1, 1, LIMITS.step, 'step'),
    samples: int(d.samples ?? 4, 1, LIMITS.samples, 'samples'),
  };
  if (d.engine !== undefined) { if (['eevee', 'cycles'].includes(d.engine)) spec.engine = d.engine; else problems.push('engine: eevee or cycles'); }
  if (d.only_frames !== undefined) {
    if (!Array.isArray(d.only_frames) || d.only_frames.length > LIMITS.onlyFrames) problems.push(`only_frames: at most ${LIMITS.onlyFrames}`);
    else spec.only_frames = d.only_frames.map((f, i) => int(f, 0, LIMITS.fps * LIMITS.sceneSeconds, `only_frames[${i}]`));
  }
  const scenes = Array.isArray(d.scenes) ? d.scenes : [];
  if (!scenes.length || scenes.length > LIMITS.scenes) problems.push(`scenes: 1..${LIMITS.scenes}`);
  const ids = new Set();
  spec.scenes = scenes.slice(0, LIMITS.scenes).map((s, i) => {
    const at = `scenes[${i}]`;
    const o = s && typeof s === 'object' ? s : {};
    const name = (v, f) => { if (typeof v === 'string' && NAME.test(v)) return v; problems.push(`${at}.${f}: a short lowercase name`); return 'x'; };
    const id = typeof o.id === 'string' && ID.test(o.id) ? o.id : (problems.push(`${at}.id: letters, digits, - or _`), `s${i}`);
    if (ids.has(id)) problems.push(`${at}.id: used twice`);
    ids.add(id);
    const props = Array.isArray(o.props) ? o.props : [];
    if (props.length > LIMITS.props) problems.push(`${at}.props: at most ${LIMITS.props}`);
    const chars = Array.isArray(o.characters) ? o.characters : [];
    if (chars.length > LIMITS.chars) problems.push(`${at}.characters: at most ${LIMITS.chars}`);
    return {
      id, set: name(o.set, 'set'), time: name(o.time, 'time'), camera: name(o.camera, 'camera'),
      props: props.slice(0, LIMITS.props).map(p => name(p, 'props')),
      characters: chars.slice(0, LIMITS.chars).map(c => {
        const cc = c && typeof c === 'object' ? c : {};
        return { kind: name(cc.kind, 'kind'), action: name(cc.action, 'action'), place: name(cc.place, 'place') };
      }),
      frames: int(o.frames, 1, LIMITS.fps * LIMITS.sceneSeconds, `${at}.frames`),
      seed: int(o.seed ?? 1, 0, 1e9, `${at}.seed`),
      focus: o.focus == null ? null : name(o.focus, 'focus'),
    };
  });
  return { ok: problems.length === 0, spec, problems };
}

/** The assembly bundle (optional): the timeline (one entry per scene), the crossfade, the poster time, the captions
 *  file's text (ASS), the music's parameters and the voice clips. -> { ok, assemble, problems } */
export function checkAssemble(input, spec) {
  const problems = [];
  const d = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const num = (v, lo, hi, name) => { const n = Number(v); if (!Number.isFinite(n) || n < lo || n > hi) { problems.push(`${name}: a number ${lo}..${hi}`); return lo; } return n; };
  const tl = d.timeline && typeof d.timeline === 'object' ? d.timeline : {};
  const total = num(tl.total, 1, 600, 'timeline.total');
  const scenes = Array.isArray(tl.scenes) ? tl.scenes : [];
  if (scenes.length !== spec.scenes.length) problems.push('timeline.scenes: one per scene');
  const out = {
    timeline: { total, scenes: scenes.slice(0, LIMITS.scenes).map((x, i) => ({ start: num(x && x.start, 0, 600, `timeline.scenes[${i}].start`), dur: num(x && x.dur, 0.1, 600, `timeline.scenes[${i}].dur`) })) },
    xfade: num(d.xfade, 0, 3, 'xfade'),
    posterAt: num(d.posterAt ?? 1.8, 0, 600, 'posterAt'),
  };
  if (typeof d.ass !== 'string' || !d.ass.startsWith('[Script Info]') || d.ass.length > 256 * 1024) problems.push('ass: an ASS caption file');
  out.ass = typeof d.ass === 'string' ? d.ass : '';
  const m = d.music && typeof d.music === 'object' ? d.music : {};
  const duck = Array.isArray(m.duck) ? m.duck : [];
  if (duck.length > 100) problems.push('music.duck: at most 100 spans');
  // the mood (story-music.js MOODS): an unknown one is the lullaby, as before moods existed
  out.music = { seconds: total, mood: MOODS.includes(m.mood) ? m.mood : 'lullaby', seed: Math.trunc(num(m.seed ?? 1, 0, 2 ** 32, 'music.seed')), duck: duck.slice(0, 100).map((p, i) => [num(p && p[0], 0, 600, `music.duck[${i}]`), num(p && p[1], 0, 600, `music.duck[${i}]`)]) };
  const voice = Array.isArray(d.voice) ? d.voice : [];
  if (!voice.length || voice.length > 40) problems.push('voice: 1..40 clips');
  out.voice = voice.slice(0, 40).map((v, i) => {
    const vv = v && typeof v === 'object' ? v : {};
    if (!['mp3', 'wav'].includes(vv.ext)) problems.push(`voice[${i}].ext: mp3 or wav`);
    const data = typeof vv.data === 'string' && /^[A-Za-z0-9+/=]+$/.test(vv.data) ? Buffer.from(vv.data, 'base64') : null;
    if (!data || !data.length || data.length > 4 * 1024 * 1024) problems.push(`voice[${i}].data: base64 audio up to 4 MB`);
    return { start: num(vv.start, 0, 600, `voice[${i}].start`), ext: vv.ext === 'wav' ? 'wav' : 'mp3', data };
  });
  return { ok: problems.length === 0, assemble: out, problems };
}
