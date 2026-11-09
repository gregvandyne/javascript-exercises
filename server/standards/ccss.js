// Common Core State Standards, grades K-8 (docs/decisions.md "Standards beyond computer science"): Mathematics
// (ccss-math.json, domains CC OA NBT NF MD G RP NS EE F SP, with sub-standards like 3.MD.C.7a) and English Language Arts
// (ccss-ela.json, strands RL RI RF W SL L). Built by scripts/build-ccss.js; the codes and statements are the official
// ones. CCSS public license: every page that lists them shows NOTICE (views/standards.js attribution()).
// Codes are tokens, never translated; statements are shown in English (rendered with lang="en").
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const read = name => JSON.parse(fs.readFileSync(fileURLToPath(new URL(`./${name}`, import.meta.url)), 'utf8'));
export const NOTICE = '© Copyright 2010. National Governors Association Center for Best Practices and Council of Chief State School Officers. All rights reserved.';

/** A code as written in the files: "ccss.math.content.3.oa.c.7" / "3.oa.c.7" -> "3.OA.C.7"; "3.MD.C.7.A" -> "3.MD.C.7a";
 *  "rf.k.3c" -> "RF.K.3c". Anything that is not a code shape comes back trimmed and upper-cased (and is then unknown). */
export function normId(raw) {
  let s = String(raw == null ? '' : raw).trim().replace(/^CCSS\.(?:MATH\.CONTENT|MATH\.PRACTICE|ELA-LITERACY)\./i, '');
  const m = /^(.*\.\d+)\.?([a-z])$/i.exec(s);
  if (m && !/^\d+$/.test(m[2])) s = `${m[1].toUpperCase()}${m[2].toLowerCase()}`;
  else s = s.toUpperCase();
  return s;
}

function framework(file) {
  const data = read(file);
  const list = Object.freeze(data.standards.map(s => Object.freeze({ ...s })));
  const byId = new Map(list.map(s => [s.id, s]));
  const children = new Map();
  for (const s of list) if (s.parent) { if (!children.has(s.parent)) children.set(s.parent, []); children.get(s.parent).push(s.id); }
  const gradeOrder = g => data.grades.indexOf(g);
  const fw = {
    id: data.framework, name: data.name, short: data.short, notice: data.notice || NOTICE, source: data.source,
    grades: Object.freeze([...data.grades]), domains: Object.freeze({ ...data.domains }), clusters: Object.freeze({ ...(data.clusters || {}) }),
    normId,
    isId: id => byId.has(normId(id)),
    byId: id => byId.get(normId(id)) || null,
    /** The sub-standards of a code ("3.MD.C.7" -> ["3.MD.C.7a", ...]). */
    childrenOf: id => [...(children.get(normId(id)) || [])],
    /** Every standard in file order (grade, then domain, then number), optionally only one grade and / or domain. */
    all: ({ grade = '', domain = '', top = false } = {}) => list.filter(s => (!grade || s.grade === String(grade).toUpperCase()) && (!domain || s.domain === String(domain).toUpperCase()) && (!top || !s.parent)),
    /** The domains that have standards in a grade (all grades when none), in the file's domain order. */
    domainsIn: (grade = '') => Object.keys(data.domains).filter(d => list.some(s => s.domain === d && (!grade || s.grade === String(grade).toUpperCase()))),
    /** Picker search: grade / domain filters and free text over the code and the statement (every word must match). */
    search({ q = '', grade = '', domain = '', limit = 60 } = {}) {
      const words = String(q || '').toLowerCase().split(/\s+/).filter(Boolean).slice(0, 8);
      const code = words.length === 1 ? normId(words[0]) : '';
      const hits = fw.all({ grade, domain }).filter(s => {
        if (!words.length) return true;
        if (code && (s.id === code || s.id.startsWith(`${code}.`) || s.id.startsWith(code))) return true;
        const hay = `${s.id} ${s.statement}`.toLowerCase();
        return words.every(w => hay.includes(w));
      });
      return { total: hits.length, list: hits.slice(0, Math.max(1, Math.min(200, limit))) };
    },
    gradeOrder,
    /** Sort codes the way the file lists them. */
    sort: ids => [...ids].sort((a, b) => list.indexOf(byId.get(a)) - list.indexOf(byId.get(b))),
    size: list.length,
  };
  return Object.freeze(fw);
}

export const MATH = framework('ccss-math.json');
export const ELA = framework('ccss-ela.json');
