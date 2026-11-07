// One-off: Doodle Hoot guesses while the drawing goes on, typed on each player's own keyboard (or out loud, or with
// letter tiles as the host's easier choice): the site's words for it (the mode card, the landing's hint and its new
// "How players guess" choice, the teachers' page and the learn pages). Keys are added or their text replaced; nothing
// else changes; en-GB reads the English words. Safe to re-run.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '../server/i18n/locales');
const W = {
  en: { mode: 'One player draws while everyone else guesses: type it, say it out loud, or use letter tiles. For family or friends anywhere, each on their own device.',
    hint: 'Everyone takes a turn to draw while the others guess. Players join with the code on their own device, wherever they are. Typed guesses go only to the game: the drawer sees a guess only when it is one of the game’s own words, and there is no chat.',
    guess: 'How players guess', guessType: 'Type on their keyboard', guessTiles: 'Letter tiles (easier)',
    teachers: 'One player draws while the others guess, typed or out loud (or with letter tiles for younger players): spelling and vocabulary in 13 languages. Best for small groups (up to 16); you can clear a drawing or skip a turn at any time.',
    game: 'Draw a word for the others, or guess theirs as they draw: type it, say it, or use letter tiles. Easy, Medium or Tricky words in 13 languages, live with family and friends or on one device.',
    a8: 'Picture words to guess and spell: spelling practice that feels like a party game.' },
  es: { mode: 'Un jugador dibuja mientras los demás adivinan: escribiendo, en voz alta o con fichas de letras. Para la familia o los amigos, estén donde estén, cada uno en su dispositivo.',
    hint: 'Todos dibujan por turnos mientras los demás adivinan. Los jugadores entran con el código en su propio dispositivo, estén donde estén. Lo que se escribe solo llega al juego: quien dibuja ve una respuesta solo si es una de las palabras del juego, y no hay chat.',
    guess: 'Cómo adivinan', guessType: 'Escribiendo con su teclado', guessTiles: 'Fichas de letras (más fácil)',
    teachers: 'Un jugador dibuja mientras los demás adivinan, escribiendo o en voz alta (o con fichas de letras para los más pequeños): ortografía y vocabulario en 13 idiomas. Ideal para grupos pequeños (hasta 16); puedes borrar un dibujo o saltar un turno cuando quieras.',
    game: 'Dibuja una palabra para los demás o adivina la suya mientras dibujan: escríbela, dila en voz alta o usa fichas de letras. Palabras fáciles, medias o difíciles en 13 idiomas, en vivo con familia y amigos o en un dispositivo.',
    a8: 'Palabras con dibujo para adivinar y escribir: practicar ortografía como en un juego de fiesta.' },
  fr: { mode: 'Un joueur dessine pendant que les autres devinent : en écrivant, à voix haute ou avec des tuiles de lettres. Pour la famille ou les amis, où qu’ils soient, chacun sur son appareil.',
    hint: 'Chacun dessine à son tour pendant que les autres devinent. Les joueurs rejoignent avec le code sur leur propre appareil, où qu’ils soient. Ce qu’on écrit ne va qu’au jeu : le dessinateur ne voit une réponse que si c’est un des mots du jeu, et il n’y a pas de chat.',
    guess: 'Comment on devine', guessType: 'En écrivant au clavier', guessTiles: 'Tuiles de lettres (plus facile)',
    teachers: 'Un joueur dessine pendant que les autres devinent, à l’écrit ou à voix haute (ou avec des tuiles de lettres pour les plus jeunes) : orthographe et vocabulaire en 13 langues. Idéal pour les petits groupes (jusqu’à 16) ; tu peux effacer un dessin ou passer un tour à tout moment.',
    game: 'Dessine un mot pour les autres ou devine le leur pendant qu’ils dessinent : écris-le, dis-le ou utilise des tuiles de lettres. Mots faciles, moyens ou difficiles en 13 langues, en direct avec la famille et les amis ou sur un seul appareil.',
    a8: 'Des mots en images à deviner et à écrire : l’orthographe comme un jeu de fête.' },
  de: { mode: 'Einer malt, während alle anderen raten: tippen, laut rufen oder mit Buchstabenkärtchen. Für Familie oder Freunde, wo auch immer sie sind, jeder auf seinem eigenen Gerät.',
    hint: 'Alle malen reihum, während die anderen raten. Die Spieler kommen mit dem Code auf ihrem eigenen Gerät dazu, egal wo sie sind. Getippte Antworten gehen nur ans Spiel: Wer malt, sieht eine Antwort nur, wenn sie eines der Wörter des Spiels ist, und es gibt keinen Chat.',
    guess: 'So wird geraten', guessType: 'Tippen auf der eigenen Tastatur', guessTiles: 'Buchstabenkärtchen (leichter)',
    teachers: 'Einer malt, während die anderen raten, getippt oder laut (oder mit Buchstabenkärtchen für Jüngere): Rechtschreibung und Wortschatz in 13 Sprachen. Am besten für kleine Gruppen (bis 16); du kannst jederzeit ein Bild löschen oder einen Zug überspringen.',
    game: 'Male ein Wort für die anderen oder rate ihres, während sie malen: tippen, laut sagen oder mit Buchstabenkärtchen. Leichte, mittlere oder knifflige Wörter in 13 Sprachen, live mit Familie und Freunden oder auf einem Gerät.',
    a8: 'Bilderwörter zum Raten und Schreiben: Rechtschreibung üben wie bei einem Partyspiel.' },
  it: { mode: 'Un giocatore disegna mentre gli altri indovinano: scrivendo, a voce o con le tessere delle lettere. Per la famiglia o gli amici, ovunque siano, ognuno sul proprio dispositivo.',
    hint: 'Ognuno disegna a turno mentre gli altri indovinano. I giocatori entrano con il codice dal proprio dispositivo, ovunque siano. Quello che si scrive arriva solo al gioco: chi disegna vede una risposta solo se è una delle parole del gioco, e non c’è chat.',
    guess: 'Come si indovina', guessType: 'Scrivendo con la tastiera', guessTiles: 'Tessere delle lettere (più facile)',
    teachers: 'Un giocatore disegna mentre gli altri indovinano, scrivendo o a voce (o con le tessere delle lettere per i più piccoli): ortografia e vocabolario in 13 lingue. Ideale per piccoli gruppi (fino a 16); puoi cancellare un disegno o saltare un turno in qualsiasi momento.',
    game: 'Disegna una parola per gli altri o indovina la loro mentre disegnano: scrivila, dilla a voce o usa le tessere delle lettere. Parole facili, medie o difficili in 13 lingue, dal vivo con famiglia e amici o su un dispositivo.',
    a8: 'Parole illustrate da indovinare e scrivere: ortografia come in un gioco di società.' },
  pt: { mode: 'Um jogador desenha enquanto os outros adivinham: digitando, em voz alta ou com peças de letras. Para a família ou os amigos, onde estiverem, cada um no seu aparelho.',
    hint: 'Todos desenham na sua vez enquanto os outros adivinham. Os jogadores entram com o código no próprio aparelho, onde estiverem. O que se digita vai só para o jogo: quem desenha só vê um palpite se for uma das palavras do jogo, e não há chat.',
    guess: 'Como adivinham', guessType: 'Digitando no teclado', guessTiles: 'Peças de letras (mais fácil)',
    teachers: 'Um jogador desenha enquanto os outros adivinham, digitando ou em voz alta (ou com peças de letras para os menores): ortografia e vocabulário em 13 idiomas. Ideal para grupos pequenos (até 16); você pode apagar um desenho ou pular uma vez a qualquer momento.',
    game: 'Desenhe uma palavra para os outros ou adivinhe a deles enquanto desenham: digite, fale em voz alta ou use peças de letras. Palavras fáceis, médias ou difíceis em 13 idiomas, ao vivo com família e amigos ou em um aparelho.',
    a8: 'Palavras com desenhos para adivinhar e escrever: treino de ortografia que parece jogo de festa.' },
  nl: { mode: 'Eén speler tekent terwijl de rest raadt: typen, hardop roepen of met lettertegels. Voor familie of vrienden, waar ze ook zijn, ieder op een eigen apparaat.',
    hint: 'Iedereen tekent om de beurt terwijl de anderen raden. Spelers doen mee met de code op een eigen apparaat, waar ze ook zijn. Wat je typt gaat alleen naar het spel: de tekenaar ziet een gok alleen als het een van de woorden van het spel is, en er is geen chat.',
    guess: 'Hoe spelers raden', guessType: 'Typen op hun toetsenbord', guessTiles: 'Lettertegels (makkelijker)',
    teachers: 'Eén speler tekent terwijl de anderen raden, getypt of hardop (of met lettertegels voor jongere spelers): spelling en woordenschat in 13 talen. Het best voor kleine groepen (tot 16); je kunt op elk moment een tekening wissen of een beurt overslaan.',
    game: 'Teken een woord voor de anderen of raad dat van hen terwijl ze tekenen: typ het, zeg het hardop of gebruik lettertegels. Makkelijke, gemiddelde of lastige woorden in 13 talen, live met familie en vrienden of op één apparaat.',
    a8: 'Plaatjeswoorden om te raden en te spellen: spellen oefenen als een feestspel.' },
  ru: { mode: 'Один рисует, остальные угадывают: печатают, говорят вслух или собирают слово из плиток. Для семьи или друзей, где бы они ни были, каждый на своём устройстве.',
    hint: 'Все рисуют по очереди, пока остальные угадывают. Игроки входят по коду со своего устройства, где бы они ни были. Напечатанное уходит только в игру: художник видит ответ, только если это одно из слов игры, и чата нет.',
    guess: 'Как угадывают', guessType: 'Печатают на своей клавиатуре', guessTiles: 'Плитки с буквами (проще)',
    teachers: 'Один рисует, остальные угадывают — печатая или вслух (или с плитками букв для младших): правописание и словарный запас на 13 языках. Лучше всего для небольших групп (до 16); рисунок можно стереть или ход пропустить в любой момент.',
    game: 'Нарисуй слово для других или угадай их слово, пока они рисуют: напечатай, скажи вслух или собери из плиток. Лёгкие, средние и трудные слова на 13 языках — вживую с семьёй и друзьями или на одном устройстве.',
    a8: 'Слова-картинки, чтобы угадывать и писать: правописание как весёлая игра.' },
  ja: { mode: '1人が絵をかき、ほかの人はそのあいだに当てます。文字を打っても、声で言っても、文字タイルでもOK。家族や友だちと、どこにいても、それぞれ自分の端末で。',
    hint: '全員が順番に絵をかき、ほかの人が当てます。プレイヤーはどこにいても、自分の端末でコードを入れて参加します。打った答えはゲームにだけ届きます。かく人に見えるのは、ゲームの言葉リストにある答えだけで、チャットはありません。',
    guess: '当て方', guessType: '自分のキーボードで打つ', guessTiles: '文字タイル（やさしい）',
    teachers: '1人が絵をかき、ほかの人は打ったり声に出したりして当てます（小さい子には文字タイルも）。13言語でつづりと語彙の練習に。少人数（16人まで）向きで、絵を消したり番をとばしたりいつでもできます。',
    game: 'みんなのために言葉を絵にかくか、かいているあいだに当てよう。打っても、声で言っても、文字タイルでもOK。やさしい・ふつう・むずかしい言葉が13言語。家族や友だちとライブで、または1台で。',
    a8: '絵の言葉を当ててつづって、パーティーゲームのようにつづりを練習。' },
  'zh-Hant': { mode: '一位玩家畫圖，其他人一邊看一邊猜：打字、大聲說，或用字母方塊。適合家人或朋友，不論在哪裡，每人用自己的裝置。',
    hint: '每個人輪流畫圖，其他人一邊猜。玩家在任何地方都能用自己的裝置輸入代碼加入。打的字只會送到遊戲：畫圖的人只看得到遊戲詞表裡的詞，也沒有聊天。',
    guess: '怎麼猜', guessType: '用自己的鍵盤打字', guessTiles: '字母方塊（比較簡單）',
    teachers: '一位玩家畫圖，其他人打字或大聲說出答案（年紀小的可以用字母方塊）：13 種語言的拼字和詞彙練習。最適合小組（最多 16 人）；你隨時可以清除圖畫或跳過一輪。',
    game: '為大家畫一個詞，或在別人畫的時候猜：打字、說出來或用字母方塊。13 種語言的簡單、中等或困難詞語，可以和家人朋友即時玩，或在一台裝置上玩。',
    a8: '看圖猜詞再拼出來：像派對遊戲一樣練習拼字。' },
  ar: { mode: 'يرسم لاعب بينما يخمّن الآخرون: بالكتابة أو بصوت عالٍ أو ببطاقات الحروف. للعائلة أو الأصدقاء أينما كانوا، كل واحد على جهازه.',
    hint: 'يرسم الجميع بالدور بينما يخمّن الآخرون. ينضم اللاعبون بالرمز من أجهزتهم أينما كانوا. ما يُكتب يصل إلى اللعبة فقط: لا يرى الرسّام التخمين إلا إذا كان من كلمات اللعبة نفسها، ولا توجد دردشة.',
    guess: 'طريقة التخمين', guessType: 'الكتابة بلوحة المفاتيح', guessTiles: 'بطاقات الحروف (أسهل)',
    teachers: 'يرسم لاعب بينما يخمّن الآخرون كتابةً أو بصوت عالٍ (أو ببطاقات الحروف للصغار): إملاء ومفردات بـ13 لغة. الأفضل للمجموعات الصغيرة (حتى 16)؛ يمكنك مسح رسم أو تخطي دور في أي وقت.',
    game: 'ارسم كلمة للآخرين أو خمّن كلمتهم وهم يرسمون: اكتبها أو قلها بصوت عالٍ أو استخدم بطاقات الحروف. كلمات سهلة أو متوسطة أو صعبة بـ13 لغة، مباشرة مع العائلة والأصدقاء أو على جهاز واحد.',
    a8: 'كلمات بالصور لتخمينها وكتابتها: تدريب على الإملاء كأنه لعبة حفلة.' },
  he: { mode: 'שחקן אחד מצייר ובינתיים כל השאר מנחשים: מקלידים, אומרים בקול או משתמשים באריחי אותיות. למשפחה או לחברים, איפה שהם, כל אחד במכשיר שלו.',
    hint: 'כולם מציירים בתורות והשאר מנחשים בינתיים. השחקנים מצטרפים עם הקוד מהמכשיר שלהם, איפה שהם. מה שמקלידים מגיע רק למשחק: המצייר רואה ניחוש רק אם הוא אחת המילים של המשחק, ואין צ׳אט.',
    guess: 'איך מנחשים', guessType: 'מקלידים במקלדת שלהם', guessTiles: 'אריחי אותיות (קל יותר)',
    teachers: 'שחקן אחד מצייר והשאר מנחשים בהקלדה או בקול (או באריחי אותיות לצעירים): איות ואוצר מילים ב־13 שפות. הכי טוב לקבוצות קטנות (עד 16); אפשר למחוק ציור או לדלג על תור בכל רגע.',
    game: 'ציירו מילה לאחרים או נחשו את שלהם בזמן שהם מציירים: הקלידו, אמרו בקול או השתמשו באריחי אותיות. מילים קלות, בינוניות או מאתגרות ב־13 שפות, בשידור חי עם משפחה וחברים או במכשיר אחד.',
    a8: 'מילים מצוירות לנחש ולאיית: תרגול איות שמרגיש כמו משחק מסיבה.' },
};
const J = v => JSON.stringify(v);
const get = (o, p) => p.split('.').reduce((a, k) => (a == null ? a : a[k]), o);
for (const [code, w] of Object.entries(W)) {
  const p = path.join(DIR, `${code}.json`);
  let text = fs.readFileSync(p, 'utf8');
  const j = JSON.parse(text);
  // text that changes: the old value, written as it is in the file, replaced where it stands (each is unique)
  for (const [key, v] of [['live.mode.doodleText', w.mode], ['live.doodleUi.hint', w.hint], ['teachersLive.modes.doodle.p', w.teachers], ['learn.games.doodleHoot', w.game], ['learn.ages.a8.fit.doodleHoot', w.a8]]) {
    const old = get(j, key);
    if (old == null || old === v) continue;
    const at = text.indexOf(J(old));
    if (at < 0 || text.indexOf(J(old), at + 1) >= 0) throw new Error(`${code}: ${key} is not once in the file`);
    text = text.slice(0, at) + J(v) + text.slice(at + J(old).length);
  }
  // new keys, after the landing's hint
  if (get(j, 'live.doodleUi.guess') == null) {
    const ui = text.indexOf('"doodleUi": {'), h = text.indexOf('"hint": ', ui), end = text.indexOf('\n', h);
    const ind = /^\s*/.exec(text.slice(text.lastIndexOf('\n', h) + 1))[0];
    const line = text.slice(h, end), comma = line.endsWith(',') ? '' : ',';
    text = text.slice(0, end) + comma + [['guess', w.guess], ['guessType', w.guessType], ['guessTiles', w.guessTiles]].map(([k, v], i, a) => `\n${ind}${J(k)}: ${J(v)}${i < a.length - 1 || !comma ? ',' : ''}`).join('') + text.slice(end);
  }
  JSON.parse(text);
  fs.writeFileSync(p, text);
}
console.log('ok');
