// The Oomba Kit: the shared visual foundation for games, self-hosted under public/vendor/oomba-kit/<version>/ and
// loaded with exactly the tag kitTag() makes (pinned version, SRI, crossorigin="anonymous": the frame is opaque-origin,
// so without crossorigin the integrity check cannot run). Version folders never change and KIT_VERSIONS only grows;
// scripts/build-kit.js writes the hashes. Pure module (no database): used by the scanner, the frame, the screenshot
// worker and (phase 2) the Builder prompt. See docs/kit.md.

export const KIT_PATH = '/vendor/oomba-kit/';
// version -> sha384 of oomba-kit.js (tests/unit/kit-platform.test.js checks these against the files on disk).
export const KIT_VERSIONS = Object.freeze({
  '1.1.0': 'sha384-GCejMN1YYamlsZNEJw6SRznGmZC2i6tppYwkLt8cv2gI3YTTsZq6l8eyUQuAM8qX',
  '1.0.0': 'sha384-z+NesXSa8n9F3R0/dcZ7o60eHwzQbYE94cEyPfLu6WlUZ2zOaEO2OAS6WsmM7oUU',
});
// version -> {pack name -> sha384 of packs/<name>.js}: the optional art packs (extra species, props, biomes). A game
// loads a pack with exactly kitPackTag(name), after the kit's own tag; only games that use a pack download it.
export const KIT_PACKS = Object.freeze({
  '1.1.0': Object.freeze({ 'art-animals': 'sha384-0kgnnCmovTaNwWnsPFryp1c8kgX7ji/jku0tdAsfRwfiaWP9usy3eBLuIdBsh8jE', 'art-biomes': 'sha384-UVVUeKEbyMD1WPlwhrdiH/sB6bVZpbw7GKz2KoN4VJg/JMMI+hUkvx2Ts03akI3t', 'art-biomes-2': 'sha384-0ad0awdyk2fC5pFpqYc/7EABVSKTEe1ZKo2YB6cvjKZDIDA2mI1+YRUEQhOgXrHs', 'art-props': 'sha384-/RtKQ/ov2WG1EoCt4pJ98rHY07jOZjZ+lia901K+1BfS49MydEROuw7UaInBPHle', 'art-school': 'sha384-tjWzckG1fXZNGAIROedz8rciqX12aec8Bw77p9Pn81hGGnR/2i9HS7cM6023xw0P', 'bridge-3d': 'sha384-XrVZh1TfGin1ajGCc72TzhAxeqUJQM3JI3kI1weHoMgUIV4urBdPtJbZxO7wPOli', 'dress': 'sha384-ZCFgY98YAWY7Tcy+GfJLalmnJukKdzbVpg6j4ZljXuJSYgYzkWSWMPihVW/u8CqH', 'live': 'sha384-DEY9CBRRDIGm0Og+0Maqjxn5hJBsi2oQ5upbfYetCK7gywcURgFn61bsxc+aQ1NX', 'style-bold': 'sha384-k+n1lKA8kY7eQBU96sQUOp6Hb9i7/wDs/mQ3rkJFKRpyeIpcGqF0XDCcCm28Mjp0' }),
  '1.0.0': Object.freeze({ 'art-animals': 'sha384-fIOJsCe/mBmelLUnXEhcOGl0x7/dQvXe5xKjHrOD4KegZbvOrJ9DzTizBzU9RzOD', 'art-biomes': 'sha384-0X8OvdyaknEYsK5nXvhDnMNWl1lS8XuHH/SKuJrOF7CjDIwxYbp3yQeChbVl2zhH', 'art-school': 'sha384-yCC/QOZAd0OcPMGet+ySH+2pkji2SRciYBilMG/braih3toohKVqxJGR4YoQJrqM', 'dress': 'sha384-cLr8VKytVQYDunYCBWc3ZZuc3v1GsLxrYMkqdof5zRFlOs4VKIp5cxtTLrMpBDLe', 'style-bold': 'sha384-smhSYk+V6EuNb/TjWseiOlH187FTJModZe951GNvlqgfYC5e1txwq8ST3ql1sch+' }),
});
// The version new games get (kitTag() and kitPackTag() default to it: templates, the Builder's rules, the /kit preview).
// Older versions stay servable for the saved games that pin them; their files never change (kit/SHIPPED.json).
export const KIT_LATEST = '1.1.0';
export const kitSrc = (v = KIT_LATEST) => `${KIT_PATH}${v}/oomba-kit.js`;
export const kitPackSrc = (name, v = KIT_LATEST) => `${KIT_PATH}${v}/packs/${name}.js`;

/** The one script tag a game uses to load the kit. */
export function kitTag(v = KIT_LATEST) {
  if (!KIT_VERSIONS[v]) throw new Error(`unknown kit version ${v}`);
  return `<script src="${kitSrc(v)}" integrity="${KIT_VERSIONS[v]}" crossorigin="anonymous"></script>`;
}

/** The tag for one art pack (it goes right after kitTag(v), same version). */
export function kitPackTag(name, v = KIT_LATEST) {
  const h = KIT_PACKS[v] && KIT_PACKS[v][name];
  if (!h) throw new Error(`unknown kit pack ${name} for ${v}`);
  return `<script src="${kitPackSrc(name, v)}" integrity="${h}" crossorigin="anonymous"></script>`;
}
/** The packs a version has. */
export const kitPacks = (v = KIT_LATEST) => Object.keys(KIT_PACKS[v] || {});

const SCRIPT_RE = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi;
const ATTR_RE = /([a-z-]+)\s*(?:=\s*("[^"]*"|'[^']*'|[^\s"'>]+))?/gi;
function attrs(s) {
  const out = {}; let m;
  ATTR_RE.lastIndex = 0;
  while ((m = ATTR_RE.exec(s))) out[m[1].toLowerCase()] = m[2] == null ? '' : m[2].replace(/^["']|["']$/g, '');
  return out;
}
const PIN_RE = /^\/vendor\/oomba-kit\/(\d+\.\d+\.\d+)\/oomba-kit\.js$/;
const PACK_RE = /^\/vendor\/oomba-kit\/(\d+\.\d+\.\d+)\/packs\/([a-z0-9-]+)\.js$/;

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
 * quoting, nothing else in the tag). Pack tags are accepted the same way (exactly kitPackTag(name, v), after the kit tag of that version).
 * Anything else that names /vendor/oomba-kit/ fails, with a message the Builder can act on.
 */
export function checkKit(src) {
  src = String(src || '');
  const issues = [];
  const add = (code, message) => { if (!issues.some(i => i.message === message)) issues.push({ level: 'fail', code, message }); };
  let core = null;   // the version of the kit tag seen so far (packs must follow it)
  const rest = src.replace(SCRIPT_RE, (block, attrText, body) => {
    const a = attrs(attrText);
    if (!(a.src || '').includes(KIT_PATH)) return block;
    const extra = Object.keys(a).filter(k => !['src', 'integrity', 'crossorigin'].includes(k));
    const k = PACK_RE.exec(a.src);
    if (k) {
      const h = KIT_PACKS[k[1]] && KIT_PACKS[k[1]][k[2]];
      if (!h) {
        // a pack that came with a newer kit (an old game asking for art-props): say which kit has it
        const newer = KIT_VERSIONS[k[1]] && KIT_PACKS[KIT_LATEST][k[2]];
        add('kit_pin', newer ? `The ${k[2]} pack came with Oomba Kit ${KIT_LATEST}; this game loads kit ${k[1]}. Move the game to ${kitTag()} (and its packs from ${KIT_LATEST}) to use it, or drop the pack.`
          : `Loads an Oomba Kit pack we do not have (${k[2]} for ${k[1]}). Packs: ${kitPacks(KIT_VERSIONS[k[1]] ? k[1] : KIT_LATEST).join(', ')}. Use exactly: ${kitPacks().length ? kitPackTag(kitPacks()[0]) : kitTag()}`);
        return block;
      }
      const exact = kitPackTag(k[2], k[1]);
      if (a.integrity !== h) { add('kit_pin', `The Oomba Kit pack tag has the wrong integrity value. Use exactly: ${exact}`); return block; }
      if (a.crossorigin !== 'anonymous') { add('kit_pin', `The Oomba Kit pack tag needs crossorigin="anonymous". Use exactly: ${exact}`); return block; }
      if (extra.length || body.trim()) { add('kit_pin', `The Oomba Kit pack tag must be exactly: ${exact}`); return block; }
      if (core !== k[1]) { add('kit_pin', `The ${k[2]} pack must come after the Oomba Kit tag of the same version: ${kitTag(k[1])} then ${exact}`); return block; }
      return ' ';
    }
    const p = PIN_RE.exec(a.src);
    if (!p || !KIT_VERSIONS[p[1]]) { add('kit_pin', `Loads an Oomba Kit version we do not have. Use exactly: ${kitTag()}`); return block; }
    if (a.integrity !== KIT_VERSIONS[p[1]]) { add('kit_pin', `The Oomba Kit tag has the wrong integrity value. Use exactly: ${kitTag(p[1])}`); return block; }
    if (a.crossorigin !== 'anonymous') { add('kit_pin', `The Oomba Kit tag needs crossorigin="anonymous". Use exactly: ${kitTag(p[1])}`); return block; }
    if (extra.length || body.trim()) { add('kit_pin', `The Oomba Kit tag must be exactly: ${kitTag(p[1])}`); return block; }
    core = p[1];
    return ' ';
  });
  // Oomba.debug is the kit's unsupported internals: it is not there in games (only in the /kit preview), so a game that
  // names it breaks. A flag, so the Builder sees it and a person looks before Public.
  if (/\b(Oomba|OK)\s*\.\s*__pk\b/.test(rest) && !issues.some(i => i.code === 'kit_debug')) issues.push({ level: 'flag', code: 'kit_debug', message: 'Uses Oomba.__pk, the hook only the kit’s own pack files call. Load a pack with its pinned tag instead.' });
  if (/\b(Oomba|OK)\s*\.\s*debug\b/.test(rest) && !issues.some(i => i.code === 'kit_debug')) issues.push({ level: 'flag', code: 'kit_debug', message: 'Uses Oomba.debug, the kit’s internal test object, which games do not have. Use the public API instead: Oomba.test({state, start}), Oomba.scene, stage.timeOfDay.' });
  if (rest.includes(KIT_PATH) || /\/vendor\/oomba-kit\b/.test(rest)) add('kit_tag', `Uses the Oomba Kit files in a way we do not allow (only the script tag may name them). Load it with exactly: ${kitTag()}`);
  return { issues, rest };
}
