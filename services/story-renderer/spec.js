// What the renderer service accepts (server.js): a render spec in the shape server/stories/pipeline.js renderSpec makes,
// checked field by field and copied, so nothing else reaches Blender (no paths: the service picks the output folder).
// Limits keep one job to a sane size: at most 1920x1080, 30 fps, 10 scenes of at most 120 s, 32 samples.
export const MAX_BODY = 256 * 1024;
export const LIMITS = { width: 1920, height: 1080, fps: 30, step: 6, samples: 32, scenes: 10, sceneSeconds: 120, chars: 3, props: 6, onlyFrames: 12 };
const NAME = /^[a-z][a-z0-9_]{0,23}$/;
const ID = /^[A-Za-z0-9_-]{1,16}$/;

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
