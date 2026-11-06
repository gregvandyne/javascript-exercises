// One-off: the site words for Tug of Math (docs/decisions.md "Tug of Math"): the learn hub's "Practises" line
// (learn.games.tugOfMath) and the age pages' "why it fits" lines (learn.ages.a8/a10/a12.fit.tugOfMath), merged into every
// locale file (keys are added; nothing else changes). en-GB only gets the lines whose spelling differs. Safe to re-run.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '../server/i18n/locales');
const W = {
  en: {
    game: 'Math questions picked for each grade from 1 to 8, from adding within 20 to equations, as a tug of war. Play the computer or a friend on one screen.',
    a8: 'Pick grade 2 or 3: adding, taking away and times tables, with the computer on Easy until they win it.',
    a10: 'Grades 4 and 5 bring bigger times and order of operations; two players can tug on one tablet or smartboard.',
    a12: 'Grades 6 to 8: percents, negative numbers, powers and equations, against the computer on Hard.',
  },
  'en-GB': {
    game: 'Maths questions picked for each grade from 1 to 8, from adding within 20 to equations, as a tug of war. Play the computer or a friend on one screen.',
    a8: 'Pick grade 2 or 3: adding, taking away and times tables, with the computer on Easy until they beat it.',
  },
  es: {
    game: 'Preguntas de matemáticas para cada curso del 1 al 8, desde sumas hasta 20 hasta ecuaciones, en un juego de tirar de la cuerda. Contra la compu o contra un amigo en la misma pantalla.',
    a8: 'Elige el curso 2 o 3: sumas, restas y tablas de multiplicar, con la compu en Fácil hasta que le ganen.',
    a10: 'Los cursos 4 y 5 traen multiplicaciones más grandes y el orden de las operaciones; dos jugadores pueden tirar en una tableta o pizarra digital.',
    a12: 'Cursos 6 a 8: porcentajes, números negativos, potencias y ecuaciones, contra la compu en Difícil.',
  },
  fr: {
    game: 'Des questions de maths choisies pour chaque niveau de 1 à 8, des additions jusqu’à 20 aux équations, en partie de tir à la corde. Contre l’ordi ou un ami sur le même écran.',
    a8: 'Choisis le niveau 2 ou 3 : additions, soustractions et tables de multiplication, avec l’ordi en Facile jusqu’à la victoire.',
    a10: 'Les niveaux 4 et 5 ajoutent de plus grandes multiplications et les priorités opératoires ; on peut jouer à deux sur une tablette ou un tableau interactif.',
    a12: 'Niveaux 6 à 8 : pourcentages, nombres négatifs, puissances et équations, contre l’ordi en Difficile.',
  },
  de: {
    game: 'Matheaufgaben für jede Klasse von 1 bis 8, vom Plus im Zahlenraum bis 20 bis zu Gleichungen, als Tauziehen. Gegen den Computer oder zu zweit an einem Bildschirm.',
    a8: 'Klasse 2 oder 3 wählen: Plus, Minus und Einmaleins, mit dem Computer auf Leicht, bis sie ihn schlagen.',
    a10: 'Klasse 4 und 5 bringen größere Malaufgaben und Punkt vor Strich; zu zweit an einem Tablet oder einer digitalen Tafel.',
    a12: 'Klasse 6 bis 8: Prozente, negative Zahlen, Potenzen und Gleichungen, gegen den Computer auf Schwer.',
  },
  it: {
    game: 'Domande di matematica scelte per ogni classe dalla 1 alla 8, dalle addizioni entro il 20 alle equazioni, in un tiro alla fune. Contro il computer o un amico sullo stesso schermo.',
    a8: 'Scegli la classe 2 o 3: addizioni, sottrazioni e tabelline, con il computer su Facile finché non lo battono.',
    a10: 'Le classi 4 e 5 portano moltiplicazioni più grandi e l’ordine delle operazioni; in due su un tablet o una lavagna interattiva.',
    a12: 'Classi da 6 a 8: percentuali, numeri negativi, potenze ed equazioni, contro il computer su Difficile.',
  },
  pt: {
    game: 'Perguntas de matemática escolhidas para cada ano, do 1º ao 8º, de somas até 20 a equações, num cabo de guerra. Contra o computador ou um amigo na mesma tela.',
    a8: 'Escolha o 2º ou 3º ano: soma, subtração e tabuada, com o computador no Fácil até conseguirem vencer.',
    a10: 'O 4º e o 5º ano trazem multiplicações maiores e a ordem das operações; dois jogadores podem puxar num tablet ou lousa digital.',
    a12: 'Do 6º ao 8º ano: porcentagens, números negativos, potências e equações, contra o computador no Difícil.',
  },
  nl: {
    game: 'Rekenvragen voor elke groep, van optellen tot 20 tot vergelijkingen, als touwtrekwedstrijd. Tegen de computer of met z’n tweeën op één scherm.',
    a8: 'Kies groep 2 of 3: plussen, minnen en tafels, met de computer op Makkelijk tot ze winnen.',
    a10: 'Groep 4 en 5 brengen grotere keersommen en de volgorde van bewerkingen; met z’n tweeën op een tablet of digibord.',
    a12: 'Groep 6 tot 8: procenten, negatieve getallen, machten en vergelijkingen, tegen de computer op Moeilijk.',
  },
  ru: {
    game: 'Задачи по математике для каждого класса с 1 по 8, от сложения в пределах 20 до уравнений, в виде перетягивания каната. Против компьютера или с другом на одном экране.',
    a8: 'Выберите 2 или 3 класс: сложение, вычитание и таблица умножения, с компьютером на уровне «Легко», пока не победят.',
    a10: '4 и 5 классы: умножение побольше и порядок действий; вдвоём на одном планшете или интерактивной доске.',
    a12: '6–8 классы: проценты, отрицательные числа, степени и уравнения, против компьютера на уровне «Сложно».',
  },
  ja: {
    game: '1年生から8年生まで、学年に合わせた計算問題で綱引き。20までのたし算から方程式まで。コンピューターとも、1つの画面で友だちとも対戦できます。',
    a8: '2年生か3年生を選んで、たし算・ひき算・九九。コンピューターは勝てるまで「やさしい」で。',
    a10: '4・5年生では大きなかけ算や計算の順序も。タブレットや電子黒板で2人対戦もできます。',
    a12: '6〜8年生：割合、負の数、累乗、方程式。コンピューターの「むずかしい」に挑戦。',
  },
  'zh-Hant': {
    game: '依 1 到 8 年級挑選的數學題，從 20 以內加法到方程式，變成拔河比賽。可以對戰電腦，或和朋友在同一個螢幕上比。',
    a8: '選 2 或 3 年級：加法、減法和九九乘法，先把電腦設成「簡單」，直到贏為止。',
    a10: '4、5 年級有更大的乘法和四則運算順序；兩個人可以在同一台平板或電子白板上拔河。',
    a12: '6 到 8 年級：百分比、負數、次方和方程式，挑戰「困難」的電腦。',
  },
  ar: {
    game: 'أسئلة رياضيات مختارة لكل صف من الأول إلى الثامن، من الجمع حتى 20 إلى المعادلات، في لعبة شدّ الحبل. ضد الحاسوب أو مع صديق على شاشة واحدة.',
    a8: 'اختر الصف الثاني أو الثالث: الجمع والطرح وجداول الضرب، مع الحاسوب على «سهل» حتى يفوزوا عليه.',
    a10: 'في الصفين الرابع والخامس ضرب أكبر وترتيب العمليات؛ ويمكن للاعبَين اللعب على جهاز لوحي أو سبورة ذكية واحدة.',
    a12: 'من الصف السادس إلى الثامن: النسب المئوية والأعداد السالبة والقوى والمعادلات، ضد الحاسوب على «صعب».',
  },
  he: {
    game: 'שאלות חשבון שנבחרו לכל כיתה מא׳ עד ח׳, מחיבור עד 20 ועד משוואות, כמשחק משיכת חבל. נגד המחשב או עם חבר על אותו מסך.',
    a8: 'בחרו כיתה ב׳ או ג׳: חיבור, חיסור ולוח הכפל, עם המחשב ברמה ״קל״ עד שינצחו אותו.',
    a10: 'כיתות ד׳ ו-ה׳ מביאות כפל גדול יותר וסדר פעולות; שני שחקנים יכולים למשוך על טאבלט או לוח חכם אחד.',
    a12: 'כיתות ו׳ עד ח׳: אחוזים, מספרים שליליים, חזקות ומשוואות, נגד המחשב ברמה ״קשה״.',
  },
};

for (const f of fs.readdirSync(DIR).filter(x => x.endsWith('.json'))) {
  const code = f.replace(/\.json$/, ''), w = W[code];
  if (!w) throw new Error(`no words for ${code}`);
  const p = path.join(DIR, f), j = JSON.parse(fs.readFileSync(p, 'utf8'));
  const learn = j.learn = j.learn || {};
  if (w.game) (learn.games = learn.games || {}).tugOfMath = w.game;
  for (const a of ['a8', 'a10', 'a12']) if (w[a]) {
    learn.ages = learn.ages || {}; learn.ages[a] = learn.ages[a] || {}; learn.ages[a].fit = learn.ages[a].fit || {};
    learn.ages[a].fit.tugOfMath = w[a];
  }
  fs.writeFileSync(p, JSON.stringify(j, null, 2) + '\n');
  console.log('✓', f);
}
