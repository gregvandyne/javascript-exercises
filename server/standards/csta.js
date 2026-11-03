// CSTA K-12 Computer Science Standards (2017), levels 1B (grades 3-5) and 2 (grades 6-8): the 44 ids CS Quest tags
// lessons, steps, quiz items and game levels with (server/standards/csta-2017.json; docs/cs-quest.md). Only these ids
// exist: lesson_steps.standards and quiz items' cat are checked against isId() before they are stored.
// Ids are tokens, never translated; statements are shown in English (rendered with lang="en").
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const FILE = fileURLToPath(new URL('./csta-2017.json', import.meta.url));
const DATA = JSON.parse(fs.readFileSync(FILE, 'utf8'));
const LIST = Object.freeze((DATA.standards || []).map(s => Object.freeze({ ...s, practices: Object.freeze([...(s.practices || [])]), practiceCodes: Object.freeze([...(s.practiceCodes || [])]) })));
const BY_ID = new Map(LIST.map(s => [s.id, s]));

/** The levels in the file: { '1B': '3-5', '2': '6-8' }. */
export const LEVELS = Object.freeze({ ...(DATA.levels || {}) });
/** An id as it appears in the file ("1B-AP-10"): upper case, trimmed; anything else comes back as given (trimmed). */
export const normId = id => String(id == null ? '' : id).trim().toUpperCase();
/** Is this one of the 44 ids? Case-insensitive. */
export const isId = id => BY_ID.has(normId(id));
/** The standard for an id ({ id, level, grades, concept, subconcept, practices, practiceCodes, statement, clarification }), or null. */
export const byId = id => BY_ID.get(normId(id)) || null;
/** Every standard, in file order (1B first, then 2). level: only that level ('1B' | '2'). */
export const all = level => (level ? LIST.filter(s => s.level === String(level).toUpperCase()) : [...LIST]);
/** Every id, in file order. */
export const ids = level => all(level).map(s => s.id);
/** A comma list of ids ("1B-AP-10, 1b-ap-11") -> the valid, de-duplicated ids in the order given, and the unknown ones. */
export function parseList(text) {
  const out = [], bad = [], seen = new Set();
  for (const raw of String(text == null ? '' : text).split(/[,\s]+/)) {
    if (!raw) continue;
    const id = normId(raw);
    if (!BY_ID.has(id)) { bad.push(raw); continue; }
    if (!seen.has(id)) { seen.add(id); out.push(id); }
  }
  return { ids: out, bad };
}
