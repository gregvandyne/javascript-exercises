// Shared checks for the 1.3.0 biology tests (figures-bio-*.test.js): print is grays only (nothing told by color), the
// figure is one accessible <svg>, and its words come in the reader's language.
export const grays = svg => [...new Set((svg.match(/#[0-9A-Fa-f]{6}\b/g) || []).filter(h => !(h.slice(1, 3) === h.slice(3, 5) && h.slice(3, 5) === h.slice(5, 7))))];
export function basics(assert, OF, kind, d) {
  assert.deepEqual(OF.check(kind, d), [], `${kind} ${JSON.stringify(d)}`);
  const s = OF.svg(kind, d), p = OF.svg(kind, d, { print: true });
  assert.match(s, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 [\d.]+ [\d.]+"[^>]*role="img"/, kind);
  assert.doesNotMatch(s, /NaN|undefined|Infinity/, `${kind}: every number is a number`);
  assert.deepEqual(grays(p), [], `${kind}: print is black, white and grays`);
  assert.match(p, /class="of-fig of-[a-zA-Z]+ of-print"/);
  return { s, p };
}
/** The y of every rect with this class, in order. */
export const ysOf = (svg, cls) => [...svg.matchAll(new RegExp(`<rect [^>]*?y="([\\d.-]+)"[^>]*class="${cls}"`, 'g'))].map(m => Number(m[1]));
export const count = (svg, re) => (svg.match(re) || []).length;
