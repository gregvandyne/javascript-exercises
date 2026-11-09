// The standards frameworks the class Standards tab can show (docs/decisions.md "Standards beyond computer science"):
//   csta       CSTA K-12 Computer Science (2017), levels 1B and 2: the original tab (services/standards.js), unchanged.
//   ccss-math  Common Core State Standards for Mathematics, K-8.
//   ccss-ela   Common Core State Standards for English Language Arts, K-8 (RL, RI, RF, W, SL, L).
// The ids are disjoint ("1B-AP-10", "3.OA.C.7", "RL.3.1"), so a code alone says its framework (frameworkOf).
import * as CSTA from './csta.js';
import { MATH, ELA, NOTICE } from './ccss.js';

export { MATH, ELA, NOTICE };
export const CCSS = Object.freeze({ 'ccss-math': MATH, 'ccss-ela': ELA });
/** Frameworks in picker order. */
export const IDS = Object.freeze(['csta', 'ccss-math', 'ccss-ela']);
/** The Common Core frameworks (the ones this module's tags, coverage and mastery are for). */
export const CCSS_IDS = Object.freeze(['ccss-math', 'ccss-ela']);
export const isFramework = id => IDS.includes(id);
export const isCcss = id => CCSS_IDS.includes(id);
/** A framework's module: CCSS ones have byId/isId/search/all; CSTA keeps its own (server/standards/csta.js). */
export const get = id => (id === 'csta' ? CSTA : CCSS[id] || null);
/** Which framework a code belongs to, or null. */
export function frameworkOf(code) {
  if (CSTA.isId(code)) return 'csta';
  for (const id of CCSS_IDS) if (CCSS[id].isId(code)) return id;
  return null;
}
/** A known CCSS code in its canonical form ({ framework, code }), or null. */
export function ccssCode(raw, framework = null) {
  for (const id of framework ? [framework] : CCSS_IDS) {
    const fw = CCSS[id]; if (!fw) continue;
    const s = fw.byId(raw);
    if (s) return { framework: id, code: s.id };
  }
  return null;
}
