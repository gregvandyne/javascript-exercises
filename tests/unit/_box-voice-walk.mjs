// The Big Divide: every line the speaker button can read, for one language (argv[2]), checked against the server's
// allowlist for the AI voice (server/services/tts-lines.js). Run by box-by-box-voice.test.js, one process per language:
// the game's language is fixed when its modules load (BRB.user.lang), as in the frame. Prints JSON:
// { lines: <how many read>, bad: [{ line, where }] }.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const lang = process.argv[2] || 'en';
const html = fs.readFileSync(path.join(ROOT, 'seed-games/box-by-box.html'), 'utf8');
const block = html.slice(html.indexOf('// ==== I18N START ===='), html.indexOf('// ==== I18N END ===='));
globalThis.I18N = JSON.parse(block.slice(block.indexOf('{'), block.lastIndexOf('}') + 1));
globalThis.BRB = { user: { lang } };
const L = await import(path.join(ROOT, 'tools/box-by-box/src/lib/logic.ts'));
const M = await import(path.join(ROOT, 'tools/box-by-box/src/lib/methods.ts'));
const S = await import(path.join(ROOT, 'tools/box-by-box/src/lib/speech.ts'));
const I = await import(path.join(ROOT, 'tools/box-by-box/src/lib/i18n.ts'));
const lines = await import(path.join(ROOT, 'server/services/tts-lines.js'));

/** Every kind, method and option, with the edge cases (a 0 in the quotient, divisors with zeros, a repeating decimal,
 *  a fraction that simplifies or is 0, 4-digit divisors, a 0 part, trailing zeros, 1000 − 10). */
export const ITEMS = [
  { k: 'divide', p: [[745, 6], [612, 6], [98765, 1234], [10, 2], [999999, 9], [8080, 202]] },
  { k: 'divide', p: [[30, 4], [84, 4], [745, 6], [1234, 12]], r: 'fraction' },
  { k: 'divide', p: [[10, 3], [27, 6], [745, 6], [100, 8]], r: 'decimal' },
  { k: 'divide', p: [[945, 7], [2445, 7], [99999, 2], [612, 6], [9876, 1234]], m: 'ladder' },
  { k: 'divide', p: [[30, 4], [745, 6], [84, 4]], m: 'ladder', r: 'fraction' },
  { k: 'divide', p: [[945, 7], [2445, 7], [612, 6], [9876, 1234]], m: 'area' },
  { k: 'divide', p: [[30, 4], [745, 6], [84, 4]], m: 'area', r: 'fraction' },
  { k: 'divide', p: [[12.6, 4], [7.5, 3], [0.84, 4], [2.5, 2]], dec: 1 },
  { k: 'divide', p: [[7.5, 3], [12.6, 4], [0.84, 4], [9.6, 8]], m: 'ladder', dec: 1 },
  { k: 'divide', p: [[7.5, 3], [12.6, 4], [0.84, 4], [9.6, 8]], m: 'area', dec: 1 },
  { k: 'divide', p: [[4.5, 0.3], [4.5, 0.25], [12.6, 0.4], [7.2, 1.2]], dec: 1 },
  { k: 'multiply', p: [[24, 13], [4096, 908], [10, 2], [9999, 999]] },
  { k: 'multiply', p: [[2.4, 1.3], [2.5, 0.4], [0.6, 4], [35.6, 0.6]], dec: 1 },
  { k: 'multiply', p: [[46, 23], [406, 23], [12, 10], [352, 47]], m: 'area' },
  { k: 'multiply', p: [[2.3, 1.4], [0.6, 4], [3.25, 2.6], [2.5, 0.4]], m: 'area', dec: 1 },
  { k: 'multiply', p: [[46, 23], [406, 23], [352, 47], [10, 10]], m: 'partial' },
  { k: 'add', p: [[475, 368], [9999, 9999], [10, 10], [4096, 2785]] },
  { k: 'add', p: [[3.5, 2.75], [5.89, 16], [0.25, 0.75], [99.99, 0.01]], dec: 1 },
  { k: 'subtract', p: [[400, 167], [1000, 10], [5003, 2468], [52, 18]] },
  { k: 'subtract', p: [[5.2, 1.75], [16, 5.89], [10.01, 0.02], [3.5, 2.75]], dec: 1 }
];

let count = 0;
const bad = [];
const hear = (msgs, where) => {
  for (const line of S.sayAll(msgs)) {
    count++;
    if (!lines.allowedLine('box-by-box', lang, line)) bad.push({ line, where });
  }
};
for (const item of ITEMS) {
  const a = L.parseItem({ ...item, l: 'guided' });
  const form = L.formOf(a);
  for (const p of item.p) {
    const where = `${item.k}${item.m ? ` ${item.m}` : ''}${item.r ? ` ${item.r}` : ''} ${p.join(' ? ')}`;
    if (!item.m || item.m === 'standard') {
      const sheet = L.sheetFor(a, p);
      const v = {};
      for (const [i, st] of sheet.steps.entries()) {
        hear(st.ask?.(v) ?? [], `${where}, step ${i} (${st.kind})`);
        hear(st.tell?.(v) ?? [], `${where}, step ${i} told`);
        for (const id of st.boxes ?? []) v[id] = String(L.boxOf(sheet, id)?.digit ?? '');
        const sc = st.skipCount;
        if (sc) {
          // what Count up says while counting (Player.svelte skipPrompt and its nudges)
          hear([I.m('q.skip.keepGoing'), I.m('q.skip.tooFar'), I.m('q.skip.first'), I.m('q.skip.notIt', { x: 99 }), I.m('q.skip.startFirst', { a: sc.start ?? 0 })], `${where}, count up`);
          hear([I.m('q.skip.addCarried', { a: sc.by, b: sc.times, p: sc.by * sc.times, c: sc.carry ?? 1 })], `${where}, count up carry`);
        }
      }
      hear([I.m('q.so', { e: sheet.title, x: L.showAnswer(sheet.answer) }), ...(sheet.noteSay ?? []), I.m('q.pressCheck'), I.m('q.notQuite')], `${where}, the end`);
    } else {
      const v = {};
      for (let guard = 0; guard < 80; guard++) {
        const w = M.buildWork(item.m, item.k, p, v, form);
        const f = w.fields.find((x) => !v[x.id]);
        if (!f) { hear([I.m('q.so', { e: w.title, x: L.showAnswer(w.answer) })], `${where}, the end`); break; }
        hear(f.ask ?? [], `${where}, ${f.id}`);
        hear(f.tell ?? [], `${where}, ${f.id} told`);
        for (const s of ['1', '0', '99999', f.expect ?? '']) {
          const n = f.nudgeSay?.(s); if (n) hear([n], `${where}, ${f.id} nudge ${s}`);
          const ad = f.adviceSay?.(s); if (ad) hear([ad], `${where}, ${f.id} advice ${s}`);
        }
        v[f.id] = f.role === 'choice' && f.countUp?.choose
          ? String(f.countUp.choose.f.show(f.countUp.choose.last ? Math.floor(f.countUp.choose.left / f.countUp.choose.divisor) : M.placeValueMultiple(f.countUp.choose.left, f.countUp.choose.divisor)))
          : f.expect;
      }
    }
  }
}
process.stdout.write(JSON.stringify({ lines: count, bad: bad.slice(0, 40), badCount: bad.length }));
