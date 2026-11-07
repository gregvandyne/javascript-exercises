// Story Builder: the timeline and the words on screen (docs/story-builder.md).
// The narration decides the timing: each line's clip is measured, scenes last as long as their lines (plus a little
// air), and the captions follow the voice phrase by phrase. Everything here is pure (tests: tests/unit/story-*.test.js).
//
// Timeline: a title card over the first scene, then each scene's lines with a gap between them; scenes overlap by a
// short crossfade (XFADE) and narration never plays during a crossfade. The video ends on an end card.

export const T = { title: 2.4, lead: 0.4, gap: 0.5, tail: 0.8, xfade: 0.7, end: 2.6 };
const r3 = x => Math.round(x * 1000) / 1000;

/**
 * script: the validated script; durations: [[seconds per line] per scene]. -> {
 *   scenes: [{ index, start, end, dur }], lines: [{ scene, index, start, end, say, show }], total, narration: [[start, end]] }
 * A scene starts XFADE before the previous one ends; its lines start after the crossfade and LEAD.
 */
export function timeline(script, durations, opts = {}) {
  const o = { ...T, ...opts };
  const scenes = [], lines = [];
  let start = 0;
  script.scenes.forEach((sc, i) => {
    let t = start + (i === 0 ? o.title : o.xfade) + o.lead;
    sc.lines.forEach((l, k) => {
      const d = Math.max(0.3, +((durations[i] || [])[k]) || 0);
      lines.push({ scene: i, index: k, start: r3(t), end: r3(t + d), say: l.say, show: l.show });
      t += d + (k < sc.lines.length - 1 ? o.gap : 0);
    });
    t += o.tail + (i === script.scenes.length - 1 ? o.end : o.xfade);
    scenes.push({ index: i, start: r3(start), end: r3(t), dur: r3(t - start) });
    start = t - o.xfade;
  });
  const total = scenes.length ? scenes[scenes.length - 1].end : 0;
  return { scenes, lines, total: r3(total), narration: lines.map(l => [l.start, l.end]) };
}

/** Split shown words into short caption phrases (at most maxChars, breaking after punctuation when possible). */
export function phrases(text, maxChars = 34) {
  const words = String(text || '').trim().split(/\s+/).filter(Boolean);
  const out = [];
  let cur = [];
  const len = a => a.join(' ').length;
  for (const w of words) {
    if (cur.length && len([...cur, w]) > maxChars) { out.push(cur.join(' ')); cur = []; }
    cur.push(w);
    // a sentence or clause end is a good place to break, if the phrase is long enough already
    if (/[.!?;:,。！？、]$/.test(w) && len(cur) >= maxChars * 0.45) { out.push(cur.join(' ')); cur = []; }
  }
  if (cur.length) {
    // a lonely last word joins the phrase before it when it fits a little over the limit
    if (out.length && cur.length === 1 && len([out[out.length - 1], ...cur]) <= maxChars + 8) out[out.length - 1] += ' ' + cur[0];
    else out.push(cur.join(' '));
  }
  return out;
}

/**
 * Caption cues: each line's shown words, split into phrases, with the line's time shared out by length.
 * Two phrases share the screen as two rows when both fit, so kids get time to read. -> [{ start, end, text }]
 * Scripts without spaces (Japanese, Chinese) are split by characters.
 */
export function cues(lines, { maxChars = 34, rows = 2 } = {}) {
  const out = [];
  for (const l of lines) {
    const spaced = /\s/.test(l.show) || l.show.length <= maxChars;
    let ph = spaced ? phrases(l.show, maxChars) : (l.show.match(new RegExp(`.{1,${Math.max(8, Math.round(maxChars / 2))}}`, 'gu')) || []);
    const groups = [];
    for (let i = 0; i < ph.length; i += rows) groups.push(ph.slice(i, i + rows));
    const weight = g => g.join('').length + 4;
    const totalW = groups.reduce((n, g) => n + weight(g), 0) || 1;
    let t = l.start;
    const span = l.end - l.start;
    groups.forEach((g, i) => {
      const d = span * weight(g) / totalW;
      const end = i === groups.length - 1 ? l.end : t + d;
      out.push({ start: r3(t), end: r3(end), text: g.join('\n') });
      t = end;
    });
  }
  return out;
}

const stamp = (s, sep = '.') => {
  const ms = Math.max(0, Math.round(s * 1000));
  const h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, sec = Math.floor(ms / 1000) % 60, f = ms % 1000;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}${sep}${String(f).padStart(3, '0')}`;
};
export const vttStamp = s => stamp(s);

/** WebVTT for the player's captions track (the title and the end card included, so the file reads as the story). */
export function toVtt(cueList, { title = '', titleAt = [0.4, 2.8], end = null } = {}) {
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/-->/g, '→');
  const all = [...(title ? [{ start: titleAt[0], end: titleAt[1], text: title }] : []), ...cueList, ...(end ? [end] : [])];
  return 'WEBVTT\n\n' + all.map((c, i) => `${i + 1}\n${vttStamp(c.start)} --> ${vttStamp(c.end)}\n${esc(c.text)}\n`).join('\n');
}

// ASS (Advanced SubStation) for burning the words into the video with ffmpeg/libass: rounded, cream letters with a
// soft dark-blue outline and shadow, bottom centre, fading in and out; a big title card; a "The End" card.
const assTime = s => { const cs = Math.max(0, Math.round(s * 100)); const h = Math.floor(cs / 360000), m = Math.floor(cs / 6000) % 60, sec = Math.floor(cs / 100) % 60; return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}.${String(cs % 100).padStart(2, '0')}`; };
const assText = s => String(s).replace(/\\/g, '＼').replace(/[{}]/g, '').replace(/\n/g, '\\N');
/** opts: { width, height, font, title, titleAt: [start, end], endText, endAt: [start, end], rtl } */
export function toAss(cueList, { width = 1280, height = 720, font = 'Bricolage Grotesque 96pt ExtraBold', title = '', titleAt = [0.4, 2.8], endText = '', endAt = null } = {}) {
  const k = height / 720;
  // The words sit in a band at the very bottom, on a soft night-blue panel (BorderStyle 3: a box behind each row,
  // the outline width is its padding), below where the characters stand (render_story.py frames them above it).
  const size = Math.round(44 * k), tsize = Math.round(84 * k), margin = Math.round(52 * k), band = Math.round(20 * k);
  const head = `[Script Info]
ScriptType: v4.00+
PlayResX: ${width}
PlayResY: ${height}
WrapStyle: 2
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Words,${font},${size},&H00E6F6FF,&H00FFFFFF,&H3C4A2214,&HFF000000,-1,0,0,0,100,100,0.5,0,3,${(9 * k).toFixed(1)},0,2,${margin},${margin},${band},1
Style: Title,${font},${tsize},&H00C8F0FF,&H00FFFFFF,&H00502A1E,&H96200F0A,-1,0,0,0,100,100,1,0,1,${(4.5 * k).toFixed(1)},${(3 * k).toFixed(1)},5,${margin},${margin},${margin},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;
  const ev = [];
  if (title) ev.push(`Dialogue: 1,${assTime(titleAt[0])},${assTime(titleAt[1])},Title,,0,0,0,,{\\fad(500,600)\\blur0.6}${assText(title)}`);
  for (const c of cueList) ev.push(`Dialogue: 0,${assTime(c.start)},${assTime(c.end)},Words,,0,0,0,,{\\fad(180,180)\\blur0.4}${assText(c.text)}`);
  if (endText && endAt) ev.push(`Dialogue: 1,${assTime(endAt[0])},${assTime(endAt[1])},Title,,0,0,0,,{\\fad(600,900)\\blur0.6}${assText(endText)}`);
  return head + ev.join('\n') + '\n';
}

/** Music ducking: gain per sample time t (seconds) — 1 between lines, `low` while the narrator speaks, with ramps. */
export function duckGain(spans, t, { low = 0.38, ramp = 0.35 } = {}) {
  let g = 1;
  for (const [a, b] of spans) {
    if (t >= a - ramp && t <= b + ramp) {
      const into = t < a ? (t - (a - ramp)) / ramp : t > b ? 1 - (t - b) / ramp : 1;
      g = Math.min(g, 1 - (1 - low) * Math.max(0, Math.min(1, into)));
    }
  }
  return g;
}
