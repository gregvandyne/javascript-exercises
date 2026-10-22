// Static safety scan for every game version. Pure function; see tests/unit/scanner.test.js and tests/safety/.
// status: 'pass' (fine), 'flag' (allowed for Private/Friends, needs a human look before Public), 'fail' (cannot be shared).
import { hasProfanity, personalInfo } from './textfilter.js';
import { MAX_GAME_BYTES } from './sanitize.js';

const ALLOWED_URL = /^https:\/\/(fonts\.googleapis\.com|fonts\.gstatic\.com|cdnjs\.cloudflare\.com)(\/|$)/i;
const FAIL_RULES = [
  [/\bfetch\s*\(/, 'network', 'Uses fetch() to reach the internet.'],
  [/\bXMLHttpRequest\b/, 'network', 'Uses XMLHttpRequest to reach the internet.'],
  [/\bWebSocket\b/, 'network', 'Opens a WebSocket.'],
  [/\bEventSource\b/, 'network', 'Opens an EventSource.'],
  [/\bRTCPeerConnection\b/, 'network', 'Opens a peer connection.'],
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
  for (const [re, c, msg] of FAIL_RULES) if (re.test(c === 'form' ? src : code)) issues.push({ level: 'fail', code: c, message: msg });
  // External URLs anywhere (src/href attributes, CSS url(), strings in code).
  const urls = new Set(src.match(/(?:https?:)?\/\/[a-z0-9.-]+\.[a-z]{2,}[^\s"'`)<>]*/gi) || []);
  for (const u of urls) {
    const full = u.startsWith('//') ? 'https:' + u : u;
    if (/^http:\/\/www\.w3\.org\//i.test(full)) continue; // SVG/XHTML namespaces
    if (!ALLOWED_URL.test(full)) { issues.push({ level: 'fail', code: 'external_url', message: `Links to the outside web (${full.slice(0, 60)}).` }); break; }
  }
  if (/<script\b[^>]*\bsrc\s*=\s*["']?(?!["']|https:\/\/cdnjs\.cloudflare\.com\/)/i.test(src)) issues.push({ level: 'fail', code: 'external_script', message: 'Loads a script from somewhere we do not allow.' });
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
