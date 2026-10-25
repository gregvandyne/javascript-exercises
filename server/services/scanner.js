// Static safety scan for every game version. Pure function; see tests/unit/scanner.test.js and tests/safety/.
// status: 'pass' (fine), 'flag' (allowed for Private/Friends, needs a human look before Public), 'fail' (cannot be shared).
import { hasProfanity, personalInfo } from './textfilter.js';
import { MAX_GAME_BYTES } from './sanitize.js';
import { checkThree } from './vendor.js';

const ALLOWED_URL = /^https:\/\/(fonts\.googleapis\.com|fonts\.gstatic\.com|cdnjs\.cloudflare\.com)(\/|$)/i;

// Pinned cdnjs library files we have vetted. Any OTHER cdnjs script (or import-map entry) is flagged
// for a human look instead of silently passing, because the scanner cannot read a 6 MB minified
// library. Exact URLs only (query string ignored). Keep this list short and reviewed. Empty today:
// Three.js is self-hosted (see vendor.js) and loading it from cdnjs fails the scan.
const CDNJS_ALLOW = new Set([]);
const CDNJS_URL = /https:\/\/cdnjs\.cloudflare\.com\/[^\s"'`)<>]+/gi;

const FAIL_RULES = [
  [/\bfetch\s*\(/, 'network', 'Uses fetch() to reach the internet.'],
  [/\bXMLHttpRequest\b/, 'network', 'Uses XMLHttpRequest to reach the internet.'],
  [/\bWebSocket\b/, 'network', 'Opens a WebSocket.'],
  [/\bEventSource\b/, 'network', 'Opens an EventSource.'],
  [/\b(?:webkit|moz)?RTCPeerConnection\b/, 'network', 'Opens a peer connection.'],
  [/\b(?:webkit)?RTCDataChannel\b/, 'network', 'Opens a WebRTC data channel.'],
  [/\bRTCSessionDescription\b|\bRTCIceCandidate\b/, 'network', 'Uses WebRTC signalling.'],
  [/\bsendBeacon\b/, 'network', 'Uses navigator.sendBeacon.'],
  [/\bimportScripts\s*\(/, 'network', 'Loads remote scripts.'],
  [/(^|[^.\w])import\s*\(/, 'network', 'Uses dynamic import().'],
  [/\bwindow\s*\.\s*top\b|\btop\s*\.\s*location\b/, 'escape', 'Touches window.top.'],
  [/\bparent\s*\.\s*(location|document)\b|\bwindow\s*\.\s*parent\s*\.\s*(location|document)\b/, 'escape', 'Touches the parent page.'],
  [/\bwindow\s*\.\s*opener\b/, 'escape', 'Touches window.opener.'],
  [/\bdocument\s*\.\s*cookie\b/, 'privacy', 'Reads cookies.'],
  [/\beval\s*\(/, 'eval', 'Uses eval().'],
  [/\bnew\s+Function\s*\(|(^|[^.\w])Function\s*\(\s*['"`]/, 'eval', 'Builds code from text (new Function).'],
  [/\bset(Timeout|Interval)\s*\(\s*['"`]/, 'eval', 'Runs code from a string in a timer.'],
  [/\bwindow\s*\.\s*open\s*\(/, 'escape', 'Opens new windows.'],
  [/\blocation\s*\.\s*(href\s*=|assign|replace)|\blocation\s*=\s*['"`]/, 'escape', 'Navigates away.'],
  [/<form\b[^>]*\baction\s*=/i, 'form', 'Has a form that submits somewhere.'],
  [/\bgetUserMedia\b|\bgeolocation\b/, 'privacy', 'Asks for camera, microphone or location.'],
  [/\bNotification\s*\.\s*requestPermission\b/, 'privacy', 'Asks to send notifications.'],
];
// Kid rules: asking players for personal details inside a game.
const PERSONAL_PROMPT = /\b(enter|type|what'?s|tell us)\s+(your|ur)\s+(real name|full name|address|phone|email|school|age|birthday|password)\b/i;

function visibleText(html) {
  return html.replace(/<script\b[\s\S]*?<\/script>/gi, ' ').replace(/<style\b[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim();
}
function stringLiterals(html) {
  const scripts = (html.match(/<script\b[^>]*>([\s\S]*?)<\/script>/gi) || []).join('\n');
  const out = []; const re = /(['"`])((?:\\.|(?!\1)[^\\\n]){2,200})\1/g; let m;
  while ((m = re.exec(scripts))) out.push(m[2]);
  return out;
}
function stripComments(src) { return src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:'"`\\])\/\/[^\n]*/g, '$1'); }

// A game can try to slip a blocked feature past the simple word rules by building the name from
// pieces ('RTC'+'PeerConnection', String.fromCharCode(...), ['f','e','t','c','h'].join(''), atob('...'))
// and reaching it through bracket access (window['fe'+'tch']). deobfuscate() rebuilds the obvious
// cases so the same word rules can see through them. It is best-effort, not a sandbox: the real wall
// is the CSP + the SDK lockdown; this only decides pass vs. a human look. Bounded for 2 MB inputs.
function deobfuscate(code) {
  let s = code.length > 600000 ? code.slice(0, 600000) : code;
  // String.fromCharCode(72,73,...) with a literal number list -> the text.
  s = s.replace(/String\s*\.\s*fromCharCode\s*\(\s*((?:0x[0-9a-f]+|\d+)(?:\s*,\s*(?:0x[0-9a-f]+|\d+)){0,400})\s*\)/gi,
    (m, nums) => { try { return "'" + nums.split(',').map(n => String.fromCharCode(+n.trim())).join('') + "'"; } catch { return m; } });
  // atob('base64') with a literal argument -> the decoded text.
  s = s.replace(/\batob\s*\(\s*(['"])([A-Za-z0-9+/=]{4,2000})\1\s*\)/g,
    (m, q, b64) => { try { return "'" + Buffer.from(b64, 'base64').toString('latin1').replace(/['\\]/g, '') + "'"; } catch { return m; } });
  // ['f','e','t','c','h'].join('')  (all single/short string literals, empty separator) -> 'fetch'.
  s = s.replace(/\[\s*((?:(['"])[^'"\n]{0,4}\2\s*,\s*){2,200}(['"])[^'"\n]{0,4}\3)\s*\]\s*\.\s*join\s*\(\s*(['"])\4\s*\)/g,
    (m, items) => { const parts = items.match(/(['"])([^'"\n]*)\1/g) || []; return "'" + parts.map(p => p.slice(1, -1)).join('') + "'"; });
  // Collapse adjacent string-literal concatenation: 'RT' + 'C' -> 'RTC' (a few passes for long chains).
  for (let i = 0; i < 6; i++) {
    const next = s.replace(/(['"])([^'"\n]{0,120})\1\s*\+\s*(['"])([^'"\n]{0,120})\3/g, (m, a, x, b, y) => `'${x}${y}'`);
    if (next === s) break; s = next;
  }
  return s;
}
// Bracket access to a blocked name on a global object: window['fetch'], self["RTCPeerConnection"], etc.
const GLOBAL_BRACKET = /\b(?:window|self|globalThis|top|parent|frames)\s*\[\s*(['"])(fetch|XMLHttpRequest|WebSocket|EventSource|RTCPeerConnection|RTCDataChannel|RTCSessionDescription|RTCIceCandidate|sendBeacon|open|eval|Function|cookie|importScripts)\1\s*\]/;
// Blocked API names. If de-obfuscation reveals one that was NOT in the raw source, the game assembled
// it on purpose (e.g. stored it in a variable, then reached it as window[v]) -> a clear evasion attempt.
const DANGER_NAMES = /\b(fetch|XMLHttpRequest|WebSocket|EventSource|RTCPeerConnection|webkitRTCPeerConnection|RTCDataChannel|sendBeacon|importScripts|getUserMedia|geolocation)\b/g;
// Reaching another browsing context's window/document, or writing the document. The SDK lockdown makes
// all of these do nothing, but a game has no honest reason to use them, so they get a human look.
const BORROW_RULES = [
  [/\.\s*createElement\s*\(\s*(['"`])(iframe|frame|object|embed|portal)\1/i, 'frame', 'Builds a frame or plugin element.'],
  [/\b(?:window|self|globalThis|top|parent)\s*\.\s*frames\b|\b(?:window|self|globalThis)\s*\[\s*(['"])frames\1\s*\]/i, 'frame', 'Looks at child frames.'],
  [/\b(?:window|globalThis)\s*\[\s*\d+\s*\]/, 'frame', 'Reaches a child frame by number (window[0]).'],
  [/\.\s*contentWindow\b|\.\s*contentDocument\b|\.\s*getSVGDocument\s*\(/i, 'frame', 'Tries to reach inside a frame.'],
  [/\.\s*insertAdjacentElement\s*\(/i, 'frame', 'Attaches an element with insertAdjacentElement.'],
  [/\.\s*(insertNode|surroundContents)\s*\(/i, 'frame', 'Attaches a node with a Range.'],
  [/\bdocument\s*\.\s*(write|writeln|open)\s*\(/i, 'frame', 'Rewrites the page with document.write.'],
];

/** Flashing: timers faster than 3 per second that flip colours/visibility, or infinite CSS animations faster than 333ms touching colour/opacity/filter. */
function flashing(html) {
  const hits = [];
  const script = (html.match(/<script\b[^>]*>([\s\S]*?)<\/script>/gi) || []).join('\n');
  const timerRe = /setInterval\s*\(([\s\S]{0,400}?),\s*(\d{1,4})\s*\)/g; let m;
  while ((m = timerRe.exec(script))) {
    const ms = +m[2]; if (ms > 0 && ms < 334 && /(background|style\.color|filter|invert|opacity|visibility|display|classList\.toggle|fillStyle\s*=\s*[^;]*\?)/i.test(m[1])) hits.push(`Timer flips colours every ${ms}ms.`);
  }
  const css = (html.match(/<style\b[^>]*>([\s\S]*?)<\/style>/gi) || []).join('\n') + (html.match(/style\s*=\s*"[^"]*"/gi) || []).join('\n');
  const animRe = /animation\s*:\s*([^;}"]+)/gi;
  const keyframes = {}; const kfRe = /@keyframes\s+([\w-]+)\s*\{([\s\S]*?\})\s*\}/g;
  while ((m = kfRe.exec(css))) keyframes[m[1]] = m[2];
  while ((m = animRe.exec(css))) {
    const decl = m[1]; if (!/infinite/.test(decl)) continue;
    const t = decl.match(/(\d*\.?\d+)(ms|s)\b/); if (!t) continue;
    const ms = t[2] === 's' ? +t[1] * 1000 : +t[1]; if (ms >= 333) continue;
    const name = Object.keys(keyframes).find(k => new RegExp(`\\b${k}\\b`).test(decl));
    const body = name ? keyframes[name] : '';
    if (/background|color|opacity|filter|visibility/i.test(body)) hits.push(`Animation "${name}" flashes every ${Math.round(ms)}ms.`);
  }
  return hits;
}

export function scanVersion(html) {
  const issues = []; // {level:'fail'|'flag', code, message}
  const src = String(html || '');
  if (Buffer.byteLength(src) > MAX_GAME_BYTES) issues.push({ level: 'fail', code: 'size', message: 'The game is bigger than 2 MB.' });
  if (!/<script|<canvas|<svg|<button|<div/i.test(src)) issues.push({ level: 'flag', code: 'empty', message: 'This does not look like a game yet.' });
  const scripts = (src.match(/<script\b[^>]*>([\s\S]*?)<\/script>/gi) || []).map(s => stripComments(s)).join('\n');
  const code = scripts + '\n' + (src.match(/\son\w+\s*=\s*("[^"]*"|'[^']*')/gi) || []).join('\n');
  const seen = new Set();
  const add = (level, c, msg) => { const k = level + c + msg; if (!seen.has(k)) { seen.add(k); issues.push({ level, code: c, message: msg }); } };
  for (const [re, c, msg] of FAIL_RULES) if (re.test(c === 'form' ? src : code)) add('fail', c, msg);
  // The same word rules against a de-obfuscated copy, so a blocked feature built from pieces
  // (string concat, fromCharCode, join, atob) or reached by bracket access still fails.
  const deob = deobfuscate(code);
  if (deob !== code) {
    for (const [re, c, msg] of FAIL_RULES) if (c !== 'form' && re.test(deob)) add('fail', c, 'Builds a blocked feature from pieces. ' + msg);
    // A blocked name that only appears once the pieces are joined was assembled to dodge the scan.
    const inRaw = new Set(code.match(DANGER_NAMES) || []);
    for (const name of new Set(deob.match(DANGER_NAMES) || [])) if (!inRaw.has(name)) add('fail', 'obfuscated', `Builds the name "${name}" from pieces to get around the safety check.`);
  }
  if (GLOBAL_BRACKET.test(code) || GLOBAL_BRACKET.test(deob)) add('fail', 'network', 'Reaches a blocked feature by name on the window.');
  // Frame / window-borrowing attempts (neutralised by the SDK; a person still takes a look). Checked against
  // the de-obfuscated copy too, so an assembled tag like createElement('i'+'frame') is still flagged.
  for (const [re, c, msg] of BORROW_RULES) if (re.test(code) || (deob !== code && re.test(deob))) add('flag', c, msg + ' A person will check it.');
  // External URLs anywhere (src/href attributes, CSS url(), strings in code).
  const urls = new Set(src.match(/(?:https?:)?\/\/[a-z0-9.-]+\.[a-z]{2,}[^\s"'`)<>]*/gi) || []);
  for (const u of urls) {
    const full = u.startsWith('//') ? 'https:' + u : u;
    if (/^http:\/\/www\.w3\.org\//i.test(full)) continue; // SVG/XHTML namespaces
    if (!ALLOWED_URL.test(full)) { add('fail', 'external_url', `Links to the outside web (${full.slice(0, 60)}).`); break; }
  }
  // cdnjs is allowed, but only for library files we have pinned; anything else needs a human look
  // (the scanner cannot read a big minified bundle, so an unknown one is not auto-approved).
  for (const u of new Set((src.match(CDNJS_URL) || []).map(x => x.split(/[?#]/)[0]))) {
    if (!CDNJS_ALLOW.has(u)) { add('flag', 'unknown_cdnjs', `Loads a code library we have not reviewed (${u.slice(0, 80)}).`); }
  }
  if (/<script\b[^>]*\bsrc\s*=\s*["']?(?!["']|https:\/\/cdnjs\.cloudflare\.com\/)/i.test(src)) add('fail', 'external_script', 'Loads a script from somewhere we do not allow.');
  // 3D games: exactly the pinned, self-hosted Three.js (import map with integrity); any other Three.js fails.
  for (const i of checkThree(src)) add(i.level, i.code, i.message);
  if (/<a\b[^>]*\bhref\s*=\s*["']?(https?:|\/\/|mailto:|tel:|javascript:)/i.test(src)) issues.push({ level: 'fail', code: 'link', message: 'Has a link that leaves the game.' });
  // Visible text and string literals: profanity and personal-info requests.
  const text = visibleText(src).slice(0, 200000); const literals = stringLiterals(src).slice(0, 5000);
  const bad = [text, ...literals].find(s => hasProfanity(s));
  if (bad) issues.push({ level: 'fail', code: 'profanity', message: 'Has words that are not allowed.' });
  const askPI = [text, ...literals].find(s => PERSONAL_PROMPT.test(s));
  if (askPI) issues.push({ level: 'fail', code: 'personal_info', message: 'Asks players for personal details.' });
  if ([text, ...literals].some(s => personalInfo(s) === 'email' || personalInfo(s) === 'phone')) issues.push({ level: 'flag', code: 'contact_info', message: 'Shows something that looks like an email or phone number.' });
  // Hidden text: zero-size or invisible text blocks with words in them.
  if (/<[^>]+style\s*=\s*["'][^"']*(font-size\s*:\s*0(px)?\b|opacity\s*:\s*0(\.0+)?\s*[;"']|color\s*:\s*transparent)[^"']*["'][^>]*>\s*[A-Za-z]{3,}/i.test(src)) issues.push({ level: 'flag', code: 'hidden_text', message: 'Has hidden text.' });
  for (const f of flashing(src)) issues.push({ level: 'flag', code: 'flashing', message: f + ' Fast flashing can hurt some players.' });
  const status = issues.some(i => i.level === 'fail') ? 'fail' : issues.some(i => i.level === 'flag') ? 'flag' : 'pass';
  return { status, issues, bytes: Buffer.byteLength(src), scannedAt: Date.now() };
}
