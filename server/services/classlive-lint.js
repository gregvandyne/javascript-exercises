// The live-ready rules themselves (pure: no database), shared by classlive-check.js (hosting) and stylelint.js (the
// Builder's notes). docs/kit-api.md "Live class games".
import { KIT_PACKS, kitVersion } from './kit.js';
import { isThreeGame } from './vendor.js';

/** Tests replace packHash: the pinned hash of the live pack for a kit version (undefined until the pack ships). */
export const hooks = { packHash: v => KIT_PACKS[v] && KIT_PACKS[v].live };
export const PACK = 'live';
const MIN_KIT = [1, 1, 0];

const SCRIPT_RE = /<script\b([^>]*)>/gi;
const SRC_RE = /\bsrc\s*=\s*["']?([^"'\s>]+)/i;
const INTEGRITY_RE = /\bintegrity\s*=\s*["']?([^"'\s>]+)/i;
const PACK_RE = /^\/vendor\/oomba-kit\/(\d+\.\d+\.\d+)\/packs\/live\.js$/;
const newer = (v, min) => { const a = v.split('.').map(Number); for (let i = 0; i < 3; i++) { if (a[i] !== min[i]) return a[i] > min[i]; } return true; };

/** Does the game load the live pack with its pinned tag (kit 1.1.0 or newer)? */
export function hasLivePack(html) {
  const s = String(html || '');
  const v = kitVersion(s);
  if (!v || !newer(v, MIN_KIT)) return false;
  for (const m of s.matchAll(SCRIPT_RE)) {
    const src = SRC_RE.exec(m[1]); const p = src && PACK_RE.exec(src[1]);
    if (!p || p[1] !== v) continue;
    const integ = INTEGRITY_RE.exec(m[1]);
    const h = hooks.packHash(v);
    if (h && integ && integ[1] === h && /crossorigin\s*=\s*["']?anonymous/i.test(m[1])) return true;
  }
  return false;
}

const has = (s, re) => re.test(s);
// const L = Oomba.live, var live = window.Oomba.live, L = O.live ... (the name a game gives the API)
const ALIAS_RE = /\b([A-Za-z_$][\w$]{0,30})\s*=\s*(?:[A-Za-z_$][\w$]{0,30}\s*\.\s*){1,2}live\b(?!\s*[.(])/g;
/**
 * html -> { ready, issues: [{ level: 'fail'|'warn', code }], lobby, quiz, hostView, presence, threeD, twoD }.
 * fail codes: live_pack, live_ready_call, live_no_start, live_no_report, live_raw.
 * warn codes: live_presence_unused, live_no_2d, live_text, live_text_out.
 */
export function checkHtml(html) {
  const s = String(html || '');
  const issues = [];
  const fail = code => issues.push({ level: 'fail', code });
  const warn = code => issues.push({ level: 'warn', code });
  if (!hasLivePack(s)) fail('live_pack');
  // Oomba.live by its own name, or by a name the game gave it (const L = Oomba.live; L.ready(...)).
  const names = ['live'];
  for (const m of s.matchAll(ALIAS_RE)) if (!names.includes(m[1]) && names.length < 8) names.push(m[1]);
  const call = (prop, paren) => names.some(n => new RegExp(`(?:^|[^\\w$.])${n.replace(/\$/g, '\\$')}\\s*\\.\\s*${prop}${paren ? '\\s*\\(' : '\\b'}`).test(s) || (n === 'live' && new RegExp(`\\.live\\s*\\.\\s*${prop}${paren ? '\\s*\\(' : '\\b'}`).test(s)));
  if (!call('ready', true)) fail('live_ready_call');
  if (!has(s, /\.on\s*\(\s*["'](start|end)["']/) && !call('phase', false)) fail('live_no_start');
  if (!has(s, /\.\s*(score|item)\s*\(/) && !has(s, /\.\s*quiz\s*\.\s*answer\s*\(/)) fail('live_no_report');
  if (has(s, /\bBRB\s*\.\s*live\b/) || has(s, /\bMessageChannel\b/) || has(s, /\b(parent|top|opener)\s*\.\s*postMessage\b/)) fail('live_raw');
  const threeD = isThreeGame(s);
  const presence = has(s, /\bpresence\s*:/);
  const twoD = has(s, /<meta\s+name\s*=\s*["']oomba-live["']\s+content\s*=\s*["']2d["']/i);
  if (threeD && presence && !has(s, /\.\s*(crowd|flat)\s*\(/)) warn('live_presence_unused');
  if (threeD && !twoD) warn('live_no_2d');
  if (has(s, /<textarea\b/i) || has(s, /<input\b[^>]*\btype\s*=\s*["']?(text|search|email|tel|url)\b/i) || has(s, /\bcontenteditable\b/i) || has(s, /\bprompt\s*\(/)) warn('live_text');
  if (has(s, /\.\s*(innerHTML|outerHTML)\s*[+]?=\s*[^;\n]{0,200}\b(d|data|ev|e\.d)\s*\./)) warn('live_text_out');
  return {
    ready: !issues.some(i => i.level === 'fail'), issues,
    lobby: has(s, /\blobby\s*:\s*true\b/), quiz: has(s, /\bquiz\s*:\s*true\b/), hostView: has(s, /\bhostView\s*:\s*true\b/),
    presence, threeD, twoD,
  };
}


/** The Builder's notes for each live-ready issue (English, like the other lint notes; the Studio shows them translated). */
export const LIVE_NOTES = {
  live_pack: 'Not live-ready: load the live pack with exactly the pinned tag the live rules give, right after the kit tag and its other packs.',
  live_ready_call: 'Not live-ready: call Oomba.live.ready({...}) once when the game can play (presence, lobby, quiz, hostView as the game needs).',
  live_no_start: "Not live-ready: react to the session: Oomba.live.on('start', ...) to begin a round, and on('end', ...) to show the result.",
  live_no_report: 'Not live-ready: report results: Oomba.live.score(n), Oomba.live.item(i, ok), or Oomba.live.quiz.answer(choice) for quiz games.',
  live_raw: 'Not live-ready: never use BRB.live, MessageChannel or postMessage to the parent. Everything goes through Oomba.live.',
  live_presence_unused: 'Declares presence but never shows the other players: use Oomba.live.crowd(B) in 3D or Oomba.live.flat() in 2D.',
  live_no_2d: 'A 3D live game with no 2D path: devices without 3D only get a map. Add <meta name="oomba-live" content="2d"> and draw a top-down view in a classic script when Oomba.live.view is \'2d\'.',
  live_text: 'Has a text box or prompt(). In a live class game nothing can be typed (the platform turns text entry off): use buttons.',
  live_text_out: 'Writes data received from other players into the page with innerHTML. Show only your own words: build elements and set textContent from your own strings.',
};
