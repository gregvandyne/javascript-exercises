// ==== VOICES START ====
// AI voices (only when Oomba Academy has them on for this game and language; BRB.aiVoice): the voice each speaker's
// lines are read with. server/services/tts-lines.js reads this block too. A line's role: the longest VOICE_KEY_ROLES
// prefix, else VOICE_ROLES[speaker] for d.<speaker>.*, else VOICE_ROLES.story. Only the game's own words are read.
const VOICE_ROLES = { story: 'narrator', mango: 'bright', coco: 'friendly', pip: 'friendly', tapir: 'deep', ants: 'friendly',
  elder: 'wise', zuzu: 'bright', jada: 'deep', sloane: 'wise', tico: 'bright', otters: 'friendly', rana: 'bright', mico: 'grumpy',
  kiki: 'friendly', pecca: 'grumpy', lift: 'narrator', sign: 'narrator' };
const VOICE_KEY_ROLES = { 'end.': 'narrator', 'story.': 'narrator' };
// ==== VOICES END ====
