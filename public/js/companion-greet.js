// Oomba's greeting in the empty panel (docs/decisions.md "Oomba companion: navigate-then-do and choice cards"): short,
// warm and a little varied, with the name the site already shows the teacher (their own, never a student's), by the
// teacher's own local time (the browser's clock, so it is right in their time zone). The pick is the same all day (it
// depends on the date, not on each render), so it never flickers. Pure: t is the page's translate function.
/** A small stable number for a day ("2026-11-23"). */
const seedOf = s => { let h = 7; for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; };
/** The part of the day: 'morning' 5-11, 'afternoon' 12-16, 'evening' 17-21, 'night' otherwise. */
export const partOf = hour => (hour >= 5 && hour < 12 ? 'morning' : hour >= 12 && hour < 17 ? 'afternoon' : hour >= 17 && hour < 22 ? 'evening' : 'night');
/**
 * -> { title, line, key }: "Good morning, Greg" and "What can I help with?". date: the teacher's local time now; name:
 * the teacher's own first name or display name ('' leaves the name out). line: a page's own second line, if it has one.
 */
export function greeting(t, date = new Date(), name = '', line = '') {
  const day = `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`, seed = seedOf(day), part = partOf(date.getHours());
  const keys = [part, part, 'back', 'hi'];
  const dow = date.getDay();
  if (dow === 5 && part !== 'night') keys.push('friday', 'friday');
  if (dow === 1 && part === 'morning') keys.push('monday');
  if (dow === 0 || dow === 6) keys.push('weekend');
  const key = keys[seed % keys.length];
  const n = String(name || '').trim();
  const title = t(`js.companion-greet.${key}${n ? '' : 'Plain'}`, n ? { name: n } : {});
  return { key, title, line: line || t(`js.companion-greet.line${(seed >> 4) % 3}`) };
}
