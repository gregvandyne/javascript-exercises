// Kid-safe text rules shared by usernames, game text and friends chat.
// Normalises leetspeak and spacing tricks before matching so "s h i t" and "5h1t" are caught.

// Whole-word-ish blocklist (matched against normalised text). Kept short and obvious; extend in one place.
export const BLOCK = ['fuck', 'shit', 'bitch', 'cunt', 'dick', 'cock', 'pussy', 'porn', 'sex', 'nazi', 'hitler', 'rape', 'nigg', 'fag', 'whore', 'slut', 'penis', 'vagina', 'boob', 'retard', 'suicide', 'kys', 'bastard', 'wank', 'twat', 'nude', 'naked', 'horny', 'milf', 'cum', 'jizz', 'anal', 'dildo', 'kkk', 'heroin', 'cocaine', 'meth'];
// Only blocked in usernames (too many false positives in chat sentences).
const NAME_ONLY = ['ass', 'damn', 'hell', 'kill', 'drug', 'weed', 'die'];
// Allow-list of innocent words that contain blocked fragments.
const SAFE = ['class', 'pass', 'grass', 'glass', 'bass', 'mass', 'assist', 'assemble', 'hello', 'shell', 'skill', 'killer whale', 'sussex', 'essex', 'scunthorpe', 'cocktail', 'peacock', 'hancock', 'dickens', 'cocoa', 'shiitake', 'therapist', 'grape', 'drape', 'sextant', 'sixty', 'documentary', 'cucumber', 'circumstance', 'analysis', 'canal', 'banal', 'scumbag', 'hellfire', 'michelle', 'diesel', 'diet', 'died', 'dies', 'studied', 'buddies', 'cookies', 'goodies', 'indie', 'birdie', 'hoodie', 'skilled', 'killed', 'mill', 'kills', 'nudes'];

const LEET = { '0': 'o', '1': 'i', '!': 'i', '3': 'e', '4': 'a', '@': 'a', '5': 's', '$': 's', '7': 't', '+': 't', '8': 'b', '9': 'g', '|': 'i' };
export function normalise(s) {
  let t = String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '');
  t = t.replace(/[0-9!@$+|]/g, c => LEET[c] || c);
  return t;
}
function stripSafe(t) { for (const w of SAFE) t = t.split(w).join(' '); return t; }
/** true if the text contains blocked words, including spaced-out or leetspeak versions. */
export function hasProfanity(s, { names = false } = {}) {
  const base = stripSafe(normalise(String(s || '').slice(0, 200000)));
  const words = base.replace(/[^a-z]+/g, ' ');
  const squashed = base.replace(/[^a-z]/g, '');
  const list = names ? [...BLOCK, ...NAME_ONLY] : BLOCK;
  for (const b of list) {
    if (names && squashed.includes(b)) return true;
    // whole words or word starts in normal text, and anywhere in letters that were spaced out ("s h i t")
    if (new RegExp(`(^|\\s)${b}`).test(words)) return true;
  }
  // spaced-out letters: "f u c k" -> look for runs of single letters
  const runs = words.match(/(?:\b[a-z]\b\s?){3,}/g) || [];
  for (const r of runs) { const j = r.replace(/\s/g, ''); if (list.some(b => j.includes(b))) return true; }
  return false;
}
/** Personal info: phone numbers, emails, street addresses, social handles, links. */
export function personalInfo(s) {
  const t = String(s || '').slice(0, 20000);
  if (/(^|[^\d.])(\+?\d{1,3}[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{3,4}(?![\d.])/.test(t) || /\d{7,}/.test(t) || /\b0\d{3,4}[\s-]?\d{6}\b/.test(t)) return 'phone';
  if (/[a-z0-9._%+-]{1,64}\s{0,3}(@|\(at\)|\[at\])\s{0,3}[a-z0-9-]{1,63}\s{0,3}(\.|dot)\s{0,3}[a-z]{2,}/i.test(t)) return 'email';
  if (/(https?:\/\/|www\.|\b[a-z0-9-]+\.(com|net|org|io|gg|co|uk|me|tv|app|xyz|ly)\b)/i.test(t)) return 'link';
  if (/\b\d{1,5}\s+[a-z]+\s+(street|st|road|rd|avenue|ave|lane|ln|drive|dr|court|ct|way|close|crescent)\b/i.test(t)) return 'address';
  if (/\b(snap(chat)?|insta(gram)?|tiktok|discord|whatsapp|kik|telegram|facebook|fb|my number|phone number|gmail|hotmail|yahoo|outlook|icloud|where do you live|what school|home address|meet (me|up))\b/i.test(t)) return 'contact';
  if (/(^|\s)@[a-z0-9_]{3,}/i.test(t)) return 'handle';
  return null;
}

/** Usernames: 3-16 chars, letters/digits/underscore, no profanity, nothing that looks like a phone number or a real full name. */
export function cleanName(s) {
  const t = String(s || '').trim();
  if (!/^[A-Za-z0-9_]{3,16}$/.test(t)) return { ok: false, error: 'Use 3 to 16 letters, numbers or underscores.' };
  if (hasProfanity(t, { names: true })) return { ok: false, error: "That name isn't allowed. Try something else." };
  if (/\d{5,}/.test(t)) return { ok: false, error: 'No long numbers in names, please. Keep phone numbers private.' };
  if (/^(19|20)\d\d|(19|20)\d\d$/.test(t) && /[a-z]{3,}/i.test(t)) return { ok: false, error: 'Please leave birth years out of your name.' };
  if (/^[A-Z][a-z]{2,}_?[A-Z][a-z]{2,}\d*$/.test(t) && REALNAME.test(t)) return { ok: false, error: 'That looks like a real name. Pick a fun made-up name instead.' };
  return { ok: true, value: t };
}
// Common first names; "FirstLast" style usernames that start with one look like a real full name.
const REALNAME = /^(james|john|robert|michael|william|david|richard|joseph|thomas|charles|mary|patricia|jennifer|linda|elizabeth|barbara|susan|jessica|sarah|karen|emma|olivia|ava|sophia|isabella|mia|amelia|harper|evelyn|liam|noah|oliver|elijah|lucas|mason|logan|ethan|jacob|jack|aiden|jackson|leo|henry|grace|chloe|lily|ella|zoe|emily|hannah|sam|max|ben|tom|lucy|ruby|freya|alfie|charlie|george|harry|oscar|archie|daniel|matthew|anthony|mark|paul|steven|andrew|joshua|kevin|brian|ryan|jason|justin|nicole|ashley|amanda|megan|rachel|laura|anna|kate|katie|amy)_?[A-Z]/i;

/** Free text the platform shows to others (game titles, descriptions, report details). */
export function cleanText(s, max = 200) {
  const t = String(s || '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f‪-‮⁦-⁩]/g, '').trim().slice(0, max);
  if (hasProfanity(t)) return { ok: false, error: "That text isn't allowed on Magic Cups." };
  const pi = personalInfo(t);
  if (pi && pi !== 'handle') return { ok: false, error: 'Please keep phone numbers, emails, addresses and links out of Magic Cups.' };
  return { ok: true, value: t };
}
