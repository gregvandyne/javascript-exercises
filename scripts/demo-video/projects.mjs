// The demo videos this tooling makes. Each has a work folder (silent masters video-16x9.mp4 / video-9x16.mp4,
// timeline.json from its assemble script, the fitted music.wav, voice-over lines) and a voice-over script here.
export const PROJECTS = {
  teacher: {
    dir: '/tmp/claude-0/demo/v2', prefix: 'oomba-demo', script: 'teacher-vo.json',
    // the page copy lives at public/video/oomba-demo.mp4 (/teachers/live)
    audience: 'a one-minute product video for school teachers about a kids\' learning-games website. Voice: warm, friendly, upbeat and genuine, like an enthusiastic teacher talking to colleagues',
  },
  parents: {
    dir: '/tmp/claude-0/demo/parents', prefix: 'oomba-parents', script: 'parents-vo.json',
    // the page copy lives at public/video/oomba-parents.mp4 (/parents)
    audience: 'a short product video for parents about a safe kids\' learning-games website. Voice: warm, calm, reassuring and friendly, like a parent recommending something to another parent',
  },
};
export function project(name) {
  const p = PROJECTS[name];
  if (!p) { console.error(`Unknown project "${name}". Use one of: ${Object.keys(PROJECTS).join(', ')}`); process.exit(1); }
  return p;
}
