// The Oomba Kit: the shared visual foundation for games, self-hosted under public/vendor/oomba-kit/<version>/ and
// loaded with exactly the tag kitTag() makes (pinned version, SRI, crossorigin="anonymous": the frame is opaque-origin,
// so without crossorigin the integrity check cannot run). Version folders never change and KIT_VERSIONS only grows;
// scripts/build-kit.js writes the hashes. Pure module (no database): used by the scanner, the frame, the screenshot
// worker and (phase 2) the Builder prompt. See docs/kit.md.

export const KIT_PATH = '/vendor/oomba-kit/';
// version -> sha384 of oomba-kit.js (tests/unit/kit-platform.test.js checks these against the files on disk).
export const KIT_VERSIONS = Object.freeze({
  '1.0.0': 'sha384-NkPK4XtJjmA/7TxqlPbFPOcmbkCdwseDfHONaaeBG8ui1jtJ5KZQnF6bfWgFwtv1',
});
export const KIT_LATEST = '1.0.0';
export const kitSrc = (v = KIT_LATEST) => `${KIT_PATH}${v}/oomba-kit.js`;

/** The one script tag a game uses to load the kit. */
export function kitTag(v = KIT_LATEST) {
  if (!KIT_VERSIONS[v]) throw new Error(`unknown kit version ${v}`);
  return `<script src="${kitSrc(v)}" integrity="${KIT_VERSIONS[v]}" crossorigin="anonymous"></script>`;
}

const SCRIPT_RE = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi;
const ATTR_RE = /([a-z-]+)\s*(?:=\s*("[^"]*"|'[^']*'|[^\s"'>]+))?/gi;
function attrs(s) {
  const out = {}; let m;
  ATTR_RE.lastIndex = 0;
  while ((m = ATTR_RE.exec(s))) out[m[1].toLowerCase()] = m[2] == null ? '' : m[2].replace(/^["']|["']$/g, '');
  return out;
}
const PIN_RE = /^\/vendor\/oomba-kit\/(\d+\.\d+\.\d+)\/oomba-kit\.js$/;

/** The pinned kit version a game loads, or null. */
export function kitVersion(html) {
  for (const m of String(html || '').matchAll(SCRIPT_RE)) {
    const a = attrs(m[1]); const p = PIN_RE.exec(a.src || '');
    if (p && KIT_VERSIONS[p[1]] === a.integrity && a.crossorigin === 'anonymous') return p[1];
  }
  return null;
}

/**
 * Scanner rules -> { issues: [{level, code, message}], rest } where rest is the game with the pinned kit tags taken
 * out (so the other checks never see them). Accepted: exactly kitTag(v) for a known v (attributes in any order and
 * quoting, nothing else in the tag). Anything else that names /vendor/oomba-kit/ fails, with a message the Builder can act on.
 */
export function checkKit(src) {
  src = String(src || '');
  const issues = [];
  const add = (code, message) => { if (!issues.some(i => i.message === message)) issues.push({ level: 'fail', code, message }); };
  const rest = src.replace(SCRIPT_RE, (block, attrText, body) => {
    const a = attrs(attrText);
    if (!(a.src || '').includes(KIT_PATH)) return block;
    const p = PIN_RE.exec(a.src);
    const extra = Object.keys(a).filter(k => !['src', 'integrity', 'crossorigin'].includes(k));
    if (!p || !KIT_VERSIONS[p[1]]) { add('kit_pin', `Loads an Oomba Kit version we do not have. Use exactly: ${kitTag()}`); return block; }
    if (a.integrity !== KIT_VERSIONS[p[1]]) { add('kit_pin', `The Oomba Kit tag has the wrong integrity value. Use exactly: ${kitTag(p[1])}`); return block; }
    if (a.crossorigin !== 'anonymous') { add('kit_pin', `The Oomba Kit tag needs crossorigin="anonymous". Use exactly: ${kitTag(p[1])}`); return block; }
    if (extra.length || body.trim()) { add('kit_pin', `The Oomba Kit tag must be exactly: ${kitTag(p[1])}`); return block; }
    return ' ';
  });
  // Oomba.debug is the kit's unsupported internals: it is not there in games (only in the /kit preview), so a game that
  // names it breaks. A flag, so the Builder sees it and a person looks before Public.
  if (/\b(Oomba|OK)\s*\.\s*debug\b/.test(rest) && !issues.some(i => i.code === 'kit_debug')) issues.push({ level: 'flag', code: 'kit_debug', message: 'Uses Oomba.debug, the kit’s internal test object, which games do not have. Use the public API instead: Oomba.test({state, start}), Oomba.scene, stage.timeOfDay.' });
  if (rest.includes(KIT_PATH) || /\/vendor\/oomba-kit\b/.test(rest)) add('kit_tag', `Uses the Oomba Kit files in a way we do not allow (only the script tag may name them). Load it with exactly: ${kitTag()}`);
  return { issues, rest };
}
