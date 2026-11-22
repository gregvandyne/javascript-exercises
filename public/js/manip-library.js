// My boards: what the manipulatives home shows, and the "All boards" page (/manipulatives/boards) grouped by tool
// (docs/decisions.md "Virtual math manipulatives: saving and AI drafts"). Pure functions, no DOM: public/js/manip.js
// draws the rows, and tests/unit/manip-boards-page.test.js checks these in Node.

/** The home shows the newest HOME_MAX of each section; the rest are on the All boards page. */
export const HOME_MAX = 5;
/** The All boards page shows the newest PAGE_TEMPLATES templates first, then "Show all" for the rest. */
export const PAGE_TEMPLATES = 50;

/**
 * The home's two lists, newest first as given, each cut to HOME_MAX. templateTotal: every template the teacher has
 * (the home's list may be shorter than that). -> { templates, recent, total, more } where more is true when anything
 * is left out (the "See all boards" link shows only then) and total counts every board on the All boards page.
 */
export function homeLists(templates, recent, templateTotal = templates.length) {
  const nt = Math.max(templateTotal, templates.length);
  return { templates: templates.slice(0, HOME_MAX), recent: recent.slice(0, HOME_MAX), total: nt + recent.length, more: nt > HOME_MAX || recent.length > HOME_MAX };
}

/**
 * Rows grouped by their tool: [{ tool, rows, at }], the most recently used tool first (its newest row's `at`), the
 * rows inside in the order given (newest first). A live room groups under its own tool too.
 */
export function byTool(rows) {
  const groups = new Map();
  for (const r of rows) {
    let g = groups.get(r.tool);
    if (!g) { g = { tool: r.tool, rows: [], at: 0, first: groups.size }; groups.set(r.tool, g); }
    g.rows.push(r); g.at = Math.max(g.at, r.at || 0);
  }
  return [...groups.values()].sort((a, b) => b.at - a.at || a.first - b.first).map(({ tool, rows: list, at }) => ({ tool, rows: list, at }));
}
