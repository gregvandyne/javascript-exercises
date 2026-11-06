// One-off: the site words for Remi's Quiet Meadow (docs/decisions.md "Remi's Quiet Meadow"): the learn hub's line for the
// game (learn.games.remisQuietMeadow) and the play page's listening pill (js.loudness.*, public/js/loudness.js: shown only on that game's page,
// while the page measures how loud the room is). The keys are written into each locale file as text, at the end of their
// object, so nothing else in the file changes. en-GB gets nothing (the English is the same). Safe to re-run.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '../server/i18n/locales');
const W = {
  en: { game: 'A classroom noise meter: keep the room calm so Remi the red panda can nap, and count up the quiet time together.', listening: 'Listening', stop: 'Stop', tap: 'Tap to start listening' },
  'en-GB': {},
  es: { game: 'Un medidor de ruido para la clase: mantengan la calma para que Remi, el panda rojo, pueda dormir, y cuenten juntos el tiempo de silencio.', listening: 'Escuchando', stop: 'Parar', tap: 'Toca para empezar a escuchar' },
  fr: { game: 'Un sonomètre pour la classe : restez calmes pour que Remi, le panda roux, puisse dormir, et comptez ensemble le temps calme.', listening: 'À l’écoute', stop: 'Arrêter', tap: 'Touche pour commencer l’écoute' },
  de: { game: 'Eine Lärmampel für die Klasse: Bleibt leise, damit Remi, der Rote Panda, schlafen kann, und zählt gemeinsam die leise Zeit.', listening: 'Hört zu', stop: 'Stopp', tap: 'Tippen, um zuzuhören' },
  it: { game: 'Un misuratore di rumore per la classe: restate calmi così Remi, il panda rosso, può dormire, e contate insieme il tempo di silenzio.', listening: 'In ascolto', stop: 'Ferma', tap: 'Tocca per iniziare ad ascoltare' },
  pt: { game: 'Um medidor de barulho para a sala: mantenham a calma para o Remi, o panda-vermelho, dormir, e contem juntos o tempo de silêncio.', listening: 'Escutando', stop: 'Parar', tap: 'Toque para começar a escutar' },
  nl: { game: 'Een geluidsmeter voor de klas: houd het rustig zodat Remi de rode panda kan slapen, en tel samen de stille tijd.', listening: 'Luistert', stop: 'Stop', tap: 'Tik om te beginnen met luisteren' },
  ru: { game: 'Шумомер для класса: сохраняйте тишину, чтобы малая панда Remi могла поспать, и считайте тихое время вместе.', listening: 'Слушаю', stop: 'Стоп', tap: 'Нажмите, чтобы начать слушать' },
  ja: { game: '教室の音量メーター：レッサーパンダのRemiがお昼寝できるように教室をしずかに保ち、しずかな時間をみんなで数えよう。', listening: 'きいています', stop: '止める', tap: 'タップしてきき始める' },
  'zh-Hant': { game: '教室噪音計：保持安靜，讓小熊貓Remi能好好睡午覺，一起累積安靜時間。', listening: '正在聆聽', stop: '停止', tap: '點一下開始聆聽' },
  ar: { game: 'مقياس ضجيج للصف: حافظوا على الهدوء لينام Remi الباندا الحمراء، وعدّوا الوقت الهادئ معًا.', listening: 'يستمع', stop: 'إيقاف', tap: 'اضغط لبدء الاستماع' },
  he: { game: 'מד רעש לכיתה: שמרו על שקט כדי ש-Remi הפנדה האדומה יוכל לישון, וספרו יחד את הזמן השקט.', listening: 'מקשיב', stop: 'עצירה', tap: 'הקישו כדי להתחיל להקשיב' },
};

/** [start, end] of the object value of key `name` at the top level of the object that starts at `from` (its "{"). */
function child(src, from, name) {
  let depth = 0, inStr = false;
  for (let i = from; i < src.length; i++) {
    const c = src[i];
    if (inStr) { if (c === '\\') i++; else if (c === '"') inStr = false; continue; }
    if (c === '"') {
      if (depth === 1 && src.startsWith(`"${name}"`, i) && /^"[^"]*"\s*:\s*\{/.test(src.slice(i, i + name.length + 10))) return [src.indexOf('{', i), close(src, src.indexOf('{', i))];
      inStr = true; continue;
    }
    if (c === '{') depth++; else if (c === '}') { depth--; if (depth === 0) return null; }
  }
  return null;
}
function close(src, open) {
  let depth = 0, inStr = false;
  for (let i = open; i < src.length; i++) {
    const c = src[i];
    if (inStr) { if (c === '\\') i++; else if (c === '"') inStr = false; continue; }
    if (c === '"') inStr = true; else if (c === '{') depth++; else if (c === '}') { depth--; if (depth === 0) return i; }
  }
  throw new Error('unbalanced');
}
/** Add `"key": value` at the end of the object [open, end], indented like its last line. */
function addAt(src, [open, end], key, value) {
  const body = src.slice(open + 1, end), m = /\n([ ]*)"[^\n]*$/.exec(body.replace(/\s*$/, ''));
  const ind = m ? m[1] : '  ', closeInd = (/\n([ ]*)$/.exec(src.slice(0, end)) || [, ''])[1];
  const v = typeof value === 'string' ? JSON.stringify(value) : '{\n' + Object.entries(value).map(([k, x]) => `${ind}  ${JSON.stringify(k)}: ${JSON.stringify(x)}`).join(',\n') + `\n${ind}}`;
  const head = src.slice(0, open + 1) + body.replace(/\s*$/, '');
  return head + (body.trim() ? ',' : '') + `\n${ind}${JSON.stringify(key)}: ${v}\n${closeInd}` + src.slice(end);
}
function ensure(src, pathKeys) {
  let at = [src.indexOf('{'), close(src, src.indexOf('{'))];
  for (const k of pathKeys) { const c = child(src, at[0], k); if (!c) throw new Error(`no ${pathKeys.join('.')}`); at = c; }
  return at;
}

for (const f of fs.readdirSync(DIR).filter(x => x.endsWith('.json'))) {
  const code = f.replace(/\.json$/, ''), w = W[code];
  if (!w) throw new Error(`no words for ${code}`);
  const p = path.join(DIR, f); let src = fs.readFileSync(p, 'utf8');
  const j = JSON.parse(src);
  if (w.game && !(j.learn && j.learn.games && j.learn.games.remisQuietMeadow)) src = addAt(src, ensure(src, ['learn', 'games']), 'remisQuietMeadow', w.game);
  if (w.listening && !(j.js && j.js.loudness)) src = addAt(src, ensure(src, ['js']), 'loudness', { listening: w.listening, stop: w.stop, tap: w.tap });
  JSON.parse(src);   // still valid
  fs.writeFileSync(p, src);
  console.log('✓', f);
}
