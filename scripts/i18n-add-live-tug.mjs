// One-off: the site words for Tug of Math Live (docs/decisions.md "Tug of Math goes live"): its card on /live and
// /teachers/live, its options on the landing (grade and length), the host page's team note, the refusal when teams are
// switched off, and the game page's play button. Merged into every locale file (keys are added; nothing else changes;
// en-GB reads the English words). Safe to re-run.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '../server/i18n/locales');
const W = {
  en: {
    mode: 'Tug of Math (Live)', modeText: 'The class splits into two teams. Everyone answers math questions for their grade on their own keypad, and every right answer pulls the rope.',
    ui: { legend: 'Tug of Math (Live)', grade: 'Grade', gradeN: 'Grade {n}', like: 'Questions like:', len: 'How long', secsN: '{n} seconds', toLine: 'To the line (3 minutes at most)', of: 'of',
      hint: 'Players are split into two even teams for you. Each player gets their own questions, so nobody can copy, and a smaller team pulls just as hard.', teamsAuto: 'Two teams, made for you: Blue Whales and Red Foxes. You can balance, shuffle or move players.' },
    teamsOff: 'Tug of Math needs two teams, and teams are switched off on this site.',
    play: 'Play vs the computer or 2 players',
    teachers: { h: 'Tug of Math (Live)', p: 'Two teams pull a rope with right answers. Pick a grade from 1 to 8; every player answers their own questions on a keypad, and uneven teams pull fairly.' },
  },
  es: {
    mode: 'Tug of Math (En vivo)', modeText: 'La clase se divide en dos equipos. Cada uno responde preguntas de matemáticas de su curso en su propio teclado, y cada respuesta correcta tira de la cuerda.',
    ui: { legend: 'Tug of Math (En vivo)', grade: 'Curso', gradeN: 'Curso {n}', like: 'Preguntas como:', len: 'Duración', secsN: '{n} segundos', toLine: 'Hasta la línea (3 minutos como máximo)', of: 'de',
      hint: 'Los jugadores se reparten solos en dos equipos iguales. Cada uno recibe sus propias preguntas, así nadie copia, y un equipo más pequeño tira igual de fuerte.', teamsAuto: 'Dos equipos hechos para ti: Ballenas Azules y Zorros Rojos. Puedes equilibrar, mezclar o mover jugadores.' },
    teamsOff: 'Tug of Math necesita dos equipos, y los equipos están desactivados en este sitio.',
    play: 'Jugar contra la compu o 2 jugadores',
    teachers: { h: 'Tug of Math (En vivo)', p: 'Dos equipos tiran de una cuerda con respuestas correctas. Elige un curso del 1 al 8; cada jugador responde sus propias preguntas en un teclado, y los equipos desiguales tiran en igualdad.' },
  },
  fr: {
    mode: 'Tug of Math (En direct)', modeText: 'La classe se partage en deux équipes. Chacun répond à des questions de maths de son niveau sur son propre pavé, et chaque bonne réponse tire la corde.',
    ui: { legend: 'Tug of Math (En direct)', grade: 'Niveau', gradeN: 'Niveau {n}', like: 'Des questions comme :', len: 'Durée', secsN: '{n} secondes', toLine: 'Jusqu’à la ligne (3 minutes au plus)', of: 'de',
      hint: 'Les joueurs sont répartis pour toi en deux équipes égales. Chacun a ses propres questions, donc personne ne copie, et une équipe plus petite tire aussi fort.', teamsAuto: 'Deux équipes faites pour toi : les Baleines Bleues et les Renards Rouges. Tu peux équilibrer, mélanger ou déplacer des joueurs.' },
    teamsOff: 'Tug of Math a besoin de deux équipes, et les équipes sont désactivées sur ce site.',
    play: 'Jouer contre l’ordi ou à 2',
    teachers: { h: 'Tug of Math (En direct)', p: 'Deux équipes tirent une corde avec de bonnes réponses. Choisis un niveau de 1 à 8 ; chaque joueur répond à ses propres questions sur un pavé, et des équipes inégales tirent à armes égales.' },
  },
  de: {
    mode: 'Tug of Math (Live)', modeText: 'Die Klasse teilt sich in zwei Teams. Alle lösen Matheaufgaben für ihre Klasse auf ihrem eigenen Ziffernblock, und jede richtige Antwort zieht am Seil.',
    ui: { legend: 'Tug of Math (Live)', grade: 'Klasse', gradeN: 'Klasse {n}', like: 'Aufgaben wie:', len: 'Wie lange', secsN: '{n} Sekunden', toLine: 'Bis zur Linie (höchstens 3 Minuten)', of: 'von',
      hint: 'Die Spieler werden für dich auf zwei gleich große Teams verteilt. Alle bekommen eigene Aufgaben, also kann niemand abschreiben, und ein kleineres Team zieht genauso stark.', teamsAuto: 'Zwei Teams, für dich gebildet: Blaue Wale und Rote Füchse. Du kannst ausgleichen, mischen oder Spieler verschieben.' },
    teamsOff: 'Tug of Math braucht zwei Teams, und Teams sind auf dieser Seite ausgeschaltet.',
    play: 'Gegen den Computer oder zu zweit spielen',
    teachers: { h: 'Tug of Math (Live)', p: 'Zwei Teams ziehen mit richtigen Antworten an einem Seil. Wähle eine Klasse von 1 bis 8; alle lösen eigene Aufgaben auf einem Ziffernblock, und ungleiche Teams ziehen fair.' },
  },
  it: {
    mode: 'Tug of Math (Dal vivo)', modeText: 'La classe si divide in due squadre. Ognuno risponde a domande di matematica della sua classe sul proprio tastierino, e ogni risposta giusta tira la fune.',
    ui: { legend: 'Tug of Math (Dal vivo)', grade: 'Classe', gradeN: 'Classe {n}', like: 'Domande come:', len: 'Durata', secsN: '{n} secondi', toLine: 'Fino alla linea (al massimo 3 minuti)', of: 'di',
      hint: 'I giocatori vengono divisi per te in due squadre uguali. Ognuno ha le sue domande, così nessuno copia, e una squadra più piccola tira con la stessa forza.', teamsAuto: 'Due squadre fatte per te: Balene Blu e Volpi Rosse. Puoi bilanciare, mescolare o spostare i giocatori.' },
    teamsOff: 'Tug of Math ha bisogno di due squadre, e le squadre sono disattivate su questo sito.',
    play: 'Gioca contro il computer o in 2',
    teachers: { h: 'Tug of Math (Dal vivo)', p: 'Due squadre tirano una fune con le risposte giuste. Scegli una classe da 1 a 8; ogni giocatore risponde alle sue domande su un tastierino, e squadre diverse di numero tirano alla pari.' },
  },
  pt: {
    mode: 'Tug of Math (Ao vivo)', modeText: 'A turma se divide em dois times. Cada um responde perguntas de matemática do seu ano no próprio teclado, e cada resposta certa puxa a corda.',
    ui: { legend: 'Tug of Math (Ao vivo)', grade: 'Ano', gradeN: '{n}º ano', like: 'Perguntas como:', len: 'Duração', secsN: '{n} segundos', toLine: 'Até a linha (no máximo 3 minutos)', of: 'de',
      hint: 'Os jogadores são divididos para você em dois times iguais. Cada um recebe suas próprias perguntas, então ninguém cola, e um time menor puxa com a mesma força.', teamsAuto: 'Dois times feitos para você: Baleias Azuis e Raposas Vermelhas. Você pode equilibrar, embaralhar ou mudar jogadores.' },
    teamsOff: 'Tug of Math precisa de dois times, e os times estão desligados neste site.',
    play: 'Jogar contra o computador ou em 2',
    teachers: { h: 'Tug of Math (Ao vivo)', p: 'Dois times puxam uma corda com respostas certas. Escolha um ano de 1 a 8; cada jogador responde às próprias perguntas num teclado, e times desiguais puxam de forma justa.' },
  },
  nl: {
    mode: 'Tug of Math (Live)', modeText: 'De klas wordt verdeeld in twee teams. Iedereen beantwoordt rekenvragen voor zijn groep op een eigen toetsenblok, en elk goed antwoord trekt aan het touw.',
    ui: { legend: 'Tug of Math (Live)', grade: 'Groep', gradeN: 'Groep {n}', like: 'Vragen zoals:', len: 'Hoe lang', secsN: '{n} seconden', toLine: 'Tot de lijn (hooguit 3 minuten)', of: 'van',
      hint: 'De spelers worden voor je verdeeld in twee gelijke teams. Iedereen krijgt eigen vragen, dus niemand kan spieken, en een kleiner team trekt net zo hard.', teamsAuto: 'Twee teams, voor je gemaakt: Blauwe Walvissen en Rode Vossen. Je kunt teams gelijk maken, husselen of spelers verplaatsen.' },
    teamsOff: 'Tug of Math heeft twee teams nodig, en teams staan uit op deze site.',
    play: 'Tegen de computer of met z’n tweeën',
    teachers: { h: 'Tug of Math (Live)', p: 'Twee teams trekken met goede antwoorden aan een touw. Kies een groep van 1 tot 8; iedereen beantwoordt eigen vragen op een toetsenblok, en ongelijke teams trekken eerlijk.' },
  },
  ru: {
    mode: 'Tug of Math (Вживую)', modeText: 'Класс делится на две команды. Каждый решает примеры для своего класса на своей клавиатуре, и каждый верный ответ тянет канат.',
    ui: { legend: 'Tug of Math (Вживую)', grade: 'Класс', gradeN: '{n} класс', like: 'Примеры заданий:', len: 'Сколько длится', secsN: '{n} секунд', toLine: 'До линии (не больше 3 минут)', of: 'от',
      hint: 'Игроки сами делятся на две равные команды. У каждого свои задания, так что списать нельзя, а команда поменьше тянет так же сильно.', teamsAuto: 'Две команды уже готовы: Синие киты и Красные лисы. Можно выровнять, перемешать или перевести игроков.' },
    teamsOff: 'Для Tug of Math нужны две команды, а команды на этом сайте выключены.',
    play: 'Играть с компьютером или вдвоём',
    teachers: { h: 'Tug of Math (Вживую)', p: 'Две команды тянут канат верными ответами. Выберите класс от 1 до 8; каждый решает свои задания на клавиатуре, и неравные команды тянут честно.' },
  },
  ja: {
    mode: 'Tug of Math (ライブ)', modeText: 'クラスを2チームに分けます。みんな自分の学年の算数の問題を自分のキーパッドで答え、正解するたびにつなを引きます。',
    ui: { legend: 'Tug of Math (ライブ)', grade: '学年', gradeN: '{n}年生', like: 'こんな問題：', len: '時間', secsN: '{n}秒', toLine: 'ラインまで（最大3分）', of: 'の',
      hint: 'プレイヤーは自動で同じ人数の2チームに分かれます。問題は一人ひとりちがうので写せません。人数の少ないチームも同じ力で引けます。', teamsAuto: '2チームを自動で作りました：あおいクジラとあかいキツネ。人数をそろえる、シャッフル、移動ができます。' },
    teamsOff: 'Tug of Math には2チームが必要ですが、このサイトではチームがオフになっています。',
    play: 'コンピューターと対戦、または2人で遊ぶ',
    teachers: { h: 'Tug of Math (ライブ)', p: '2チームが正解でつなを引き合います。学年を1〜8から選ぶと、一人ひとりがキーパッドで自分の問題に答え、人数がちがうチームも公平に引けます。' },
  },
  'zh-Hant': {
    mode: 'Tug of Math (即時版)', modeText: '全班分成兩隊。每個人在自己的數字鍵盤上回答適合自己年級的數學題，每答對一題就拉一下繩子。',
    ui: { legend: 'Tug of Math (即時版)', grade: '年級', gradeN: '{n} 年級', like: '題目例如：', len: '時間長度', secsN: '{n} 秒', toLine: '拉過線為止（最多 3 分鐘）', of: '的',
      hint: '系統會幫你把玩家平均分成兩隊。每個人拿到自己的題目，誰也抄不到，人數較少的隊伍也能拉得一樣用力。', teamsAuto: '已為你分好兩隊：藍色鯨魚隊和紅色狐狸隊。你可以平衡、打亂或移動玩家。' },
    teamsOff: 'Tug of Math 需要兩隊，但這個網站已關閉隊伍功能。',
    play: '對戰電腦或雙人遊戲',
    teachers: { h: 'Tug of Math (即時版)', p: '兩隊用正確答案拔河。選擇 1 到 8 年級；每位玩家在鍵盤上回答自己的題目，人數不同的隊伍也能公平較勁。' },
  },
  ar: {
    mode: 'Tug of Math (مباشرة)', modeText: 'ينقسم الصف إلى فريقين. يجيب كل لاعب عن أسئلة رياضيات تناسب صفه على لوحة أرقامه، وكل إجابة صحيحة تشدّ الحبل.',
    ui: { legend: 'Tug of Math (مباشرة)', grade: 'الصف', gradeN: 'الصف {n}', like: 'أسئلة مثل:', len: 'المدة', secsN: '{n} ثانية', toLine: 'حتى الخط (3 دقائق على الأكثر)', of: 'من',
      hint: 'يُقسَّم اللاعبون تلقائيًا إلى فريقين متساويين. لكل لاعب أسئلته الخاصة فلا أحد ينقل، والفريق الأصغر يشدّ بالقوة نفسها.', teamsAuto: 'فريقان جاهزان لك: الحيتان الزرقاء والثعالب الحمراء. يمكنك موازنتهما أو خلطهما أو نقل اللاعبين.' },
    teamsOff: 'تحتاج Tug of Math إلى فريقين، والفرق متوقفة في هذا الموقع.',
    play: 'العب ضد الحاسوب أو لاعبَين',
    teachers: { h: 'Tug of Math (مباشرة)', p: 'فريقان يشدّان الحبل بالإجابات الصحيحة. اختر صفًا من 1 إلى 8؛ يجيب كل لاعب عن أسئلته على لوحة أرقام، والفرق غير المتساوية تشدّ بإنصاف.' },
  },
  he: {
    mode: 'Tug of Math (בשידור חי)', modeText: 'הכיתה מתחלקת לשתי קבוצות. כל אחד עונה על שאלות חשבון של הכיתה שלו במקלדת המספרים שלו, וכל תשובה נכונה מושכת את החבל.',
    ui: { legend: 'Tug of Math (בשידור חי)', grade: 'כיתה', gradeN: 'כיתה {n}', like: 'שאלות כמו:', len: 'משך', secsN: '{n} שניות', toLine: 'עד הקו (3 דקות לכל היותר)', of: 'מתוך',
      hint: 'השחקנים מתחלקים בשבילך לשתי קבוצות שוות. כל אחד מקבל שאלות משלו, כך שאי אפשר להעתיק, וקבוצה קטנה יותר מושכת חזק באותה מידה.', teamsAuto: 'שתי קבוצות מוכנות בשבילך: לווייתנים כחולים ושועלים אדומים. אפשר לאזן, לערבב או להעביר שחקנים.' },
    teamsOff: 'Tug of Math צריך שתי קבוצות, והקבוצות כבויות באתר הזה.',
    play: 'לשחק נגד המחשב או בשניים',
    teachers: { h: 'Tug of Math (בשידור חי)', p: 'שתי קבוצות מושכות בחבל עם תשובות נכונות. בחרו כיתה מ־1 עד 8; כל שחקן עונה על שאלות משלו במקלדת, וקבוצות לא שוות מושכות בהוגנות.' },
  },
};

// Keys go in as text next to their neighbours, so the rest of each file keeps its own layout.
const J = v => JSON.stringify(v);
const block = (v, ind) => JSON.stringify(v, null, 2).split('\n').map((l, i) => (i ? ind + l : l)).join('\n');
function once(text, needle) {
  const a = text.indexOf(needle);
  if (a < 0 || text.indexOf(needle, a + 1) >= 0) throw new Error(`not once: ${needle.slice(0, 60)}`);
  return a;
}
const lineStart = (text, at) => text.lastIndexOf('\n', at) + 1;
const indentAt = (text, at) => /^\s*/.exec(text.slice(lineStart(text, at)))[0];
/** Insert a "key": value line before the line that holds needle (same indent). */
function before(text, needle, key, value) { return beforeAt(text, lineStart(text, once(text, needle)), key, value); }
function beforeAt(text, at, key, value) {
  const ind = indentAt(text, at);
  return text.slice(0, at) + `${ind}${J(key)}: ${block(value, ind)},\n` + text.slice(at);
}
/** Insert ', "key": value' right after needle (needle ends a key's value). */
function after(text, needle, pairs) {
  const a = once(text, needle) + needle.length, ind = indentAt(text, a - 1);
  return text.slice(0, a) + pairs.map(([k, v]) => `,\n${ind}${J(k)}: ${block(v, ind)}`).join('') + text.slice(a);
}

const files = fs.readdirSync(DIR).filter(f => f.endsWith('.json') && f !== 'en-GB.json');
for (const f of files) {
  const code = f.replace(/\.json$/, '');
  const w = W[code];
  if (!w) throw new Error(`no words for ${code}`);
  const p = path.join(DIR, f);
  let text = fs.readFileSync(p, 'utf8');
  const j = JSON.parse(text);
  if (j.live.mode.tug) { console.log('=', f); continue; }
  text = after(text, `"atlasText": ${J(j.live.mode.atlasText)}`, [['tug', w.mode], ['tugText', w.modeText]]);
  text = before(text, '"atlasUi": {', 'tugUi', w.ui);
  text = before(text, `"teamsOff": ${J(j.live.api.teamsOff)}`, 'tugTeams', w.teamsOff);
  text = before(text, `"joinGo": ${J(j.live.entry.joinGo)}`, 'play', w.play);
  const h = once(text, `"h": ${J(j.teachersLive.modes.atlas.h)}`);
  text = beforeAt(text, lineStart(text, text.lastIndexOf('"atlas":', h)), 'tug', w.teachers);
  // the same as setting the keys on the parsed file
  const want = JSON.parse(JSON.stringify(j));
  Object.assign(want.live.mode, { tug: w.mode, tugText: w.modeText }); want.live.tugUi = w.ui; want.live.api.tugTeams = w.teamsOff;
  want.live.entry.play = w.play; want.teachersLive.modes.tug = w.teachers;
  const got = JSON.parse(text);
  const sorted = o => (o && typeof o === 'object' && !Array.isArray(o) ? Object.fromEntries(Object.keys(o).sort().map(k => [k, sorted(o[k])])) : o);
  if (J(sorted(got)) !== J(sorted(want))) throw new Error(`${f}: not the same as the parsed edit`);
  fs.writeFileSync(p, text);
  console.log('✓', f);
}
