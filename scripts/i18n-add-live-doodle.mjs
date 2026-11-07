// One-off: the site words for Doodle Hoot (docs/decisions.md "Doodle Hoot"): its card on /live and /teachers/live, its
// options on the landing (word language, level, rounds, drawing time), the host page's new buttons (Skip turn, Clear
// drawing, Copy join link, Play too) and its hide count, the "two players" refusal, the activity line, the game page's
// play button and the learn pages' lines. Merged into every locale file (keys are added; nothing else changes; en-GB
// reads the English words except where it spells them its own way). Safe to re-run.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '../server/i18n/locales');
const W = {
  en: {
    mode: 'Doodle Hoot (Live)', modeText: 'One player draws, everyone else spells the word with letter tiles. For family or friends anywhere, each on their own device.',
    ui: { legend: 'Doodle Hoot (Live)', lang: 'Word language', level: 'Words', levels: 'Easy|Medium|Tricky', like: 'Words like:', rounds: 'Rounds', roundsList: '1 round (everyone draws once)|2 rounds|3 rounds', secs: 'Drawing time', secsN: '{n} seconds',
      hint: 'Everyone takes a turn to draw. Players join with the code on their own device, wherever they are. Nobody types: guesses are letter tiles, and there is no chat.', bigRoom: 'A big group? One round is plenty: everyone still draws once.', play: 'Practice or play on one device' },
    host: { skipTurn: 'Skip turn', clear: 'Clear drawing', clearConfirm: 'Clear the drawing on every screen?', copyLink: 'Copy join link', copied: 'Link copied. Send it to your players.', playToo: 'Play too', hidCount: 'Players hiding this drawing: {count}' },
    needTwo: 'Two players are needed to start.', act: '{name} cleared the drawing',
    teachers: { h: 'Doodle Hoot (Live)', p: 'One player draws, the others spell the word with letter tiles: spelling and vocabulary in 13 languages. Best for small groups (up to 16); you can clear a drawing or skip a turn at any time.' },
    learn: { game: 'Draw a word for the others, or spell theirs with letter tiles. Easy, Medium or Tricky words in 13 languages, live with family and friends or on one device.',
      a8: 'Picture words and letter tiles: spelling practice that feels like a party game.', a10: 'Tricky words and two-word answers, and a race to spell them first.' },
  },
  es: {
    mode: 'Doodle Hoot (En vivo)', modeText: 'Un jugador dibuja y los demás deletrean la palabra con fichas de letras. Para la familia o los amigos, estén donde estén, cada uno en su dispositivo.',
    ui: { legend: 'Doodle Hoot (En vivo)', lang: 'Idioma de las palabras', level: 'Palabras', levels: 'Fáciles|Medias|Difíciles', like: 'Palabras como:', rounds: 'Rondas', roundsList: '1 ronda (cada uno dibuja una vez)|2 rondas|3 rondas', secs: 'Tiempo para dibujar', secsN: '{n} segundos',
      hint: 'Todos dibujan por turnos. Los jugadores entran con el código en su propio dispositivo, estén donde estén. Nadie escribe: se adivina con fichas de letras y no hay chat.', bigRoom: '¿Un grupo grande? Con una ronda basta: cada uno dibuja una vez.', play: 'Practicar o jugar en un dispositivo' },
    host: { skipTurn: 'Saltar turno', clear: 'Borrar dibujo', clearConfirm: '¿Borrar el dibujo en todas las pantallas?', copyLink: 'Copiar enlace para unirse', copied: 'Enlace copiado. Envíalo a tus jugadores.', playToo: 'Jugar yo también', hidCount: 'Jugadores que ocultan este dibujo: {count}' },
    needTwo: 'Hacen falta dos jugadores para empezar.', act: '{name} borró el dibujo',
    teachers: { h: 'Doodle Hoot (En vivo)', p: 'Un jugador dibuja y los demás deletrean la palabra con fichas de letras: ortografía y vocabulario en 13 idiomas. Ideal para grupos pequeños (hasta 16); puedes borrar un dibujo o saltar un turno cuando quieras.' },
    learn: { game: 'Dibuja una palabra para los demás o deletrea la suya con fichas de letras. Palabras fáciles, medias o difíciles en 13 idiomas, en vivo con familia y amigos o en un dispositivo.',
      a8: 'Palabras con dibujo y fichas de letras: practicar ortografía como en un juego de fiesta.', a10: 'Palabras difíciles, respuestas de dos palabras y una carrera por deletrearlas primero.' },
  },
  fr: {
    mode: 'Doodle Hoot (En direct)', modeText: 'Un joueur dessine, les autres épellent le mot avec des tuiles de lettres. Pour la famille ou les amis, où qu’ils soient, chacun sur son appareil.',
    ui: { legend: 'Doodle Hoot (En direct)', lang: 'Langue des mots', level: 'Mots', levels: 'Faciles|Moyens|Difficiles', like: 'Des mots comme :', rounds: 'Manches', roundsList: '1 manche (chacun dessine une fois)|2 manches|3 manches', secs: 'Temps pour dessiner', secsN: '{n} secondes',
      hint: 'Chacun dessine à son tour. Les joueurs rejoignent avec le code sur leur propre appareil, où qu’ils soient. Personne n’écrit : on devine avec des tuiles de lettres, et il n’y a pas de chat.', bigRoom: 'Un grand groupe ? Une manche suffit : chacun dessine une fois.', play: 'S’entraîner ou jouer sur un appareil' },
    host: { skipTurn: 'Passer le tour', clear: 'Effacer le dessin', clearConfirm: 'Effacer le dessin sur tous les écrans ?', copyLink: 'Copier le lien', copied: 'Lien copié. Envoie-le à tes joueurs.', playToo: 'Jouer aussi', hidCount: 'Joueurs qui masquent ce dessin : {count}' },
    needTwo: 'Il faut deux joueurs pour commencer.', act: '{name} a effacé le dessin',
    teachers: { h: 'Doodle Hoot (En direct)', p: 'Un joueur dessine, les autres épellent le mot avec des tuiles de lettres : orthographe et vocabulaire en 13 langues. Idéal pour les petits groupes (jusqu’à 16) ; tu peux effacer un dessin ou passer un tour à tout moment.' },
    learn: { game: 'Dessine un mot pour les autres ou épelle le leur avec des tuiles de lettres. Mots faciles, moyens ou difficiles en 13 langues, en direct avec la famille et les amis ou sur un seul appareil.',
      a8: 'Des mots en images et des tuiles de lettres : l’orthographe comme un jeu de fête.', a10: 'Des mots difficiles, des réponses en deux mots et une course pour les épeler en premier.' },
  },
  de: {
    mode: 'Doodle Hoot (Live)', modeText: 'Eine Person malt, alle anderen setzen das Wort aus Buchstabenkärtchen zusammen. Für Familie oder Freunde, egal wo, jeder auf dem eigenen Gerät.',
    ui: { legend: 'Doodle Hoot (Live)', lang: 'Sprache der Wörter', level: 'Wörter', levels: 'Leicht|Mittel|Knifflig', like: 'Wörter wie:', rounds: 'Runden', roundsList: '1 Runde (jeder malt einmal)|2 Runden|3 Runden', secs: 'Zeit zum Malen', secsN: '{n} Sekunden',
      hint: 'Alle malen der Reihe nach. Die Spieler kommen mit dem Code auf ihrem eigenen Gerät dazu, egal wo sie sind. Niemand tippt: geraten wird mit Buchstabenkärtchen, und es gibt keinen Chat.', bigRoom: 'Eine große Gruppe? Eine Runde reicht: Jeder malt einmal.', play: 'Üben oder auf einem Gerät spielen' },
    host: { skipTurn: 'Zug überspringen', clear: 'Bild löschen', clearConfirm: 'Das Bild auf allen Bildschirmen löschen?', copyLink: 'Link zum Mitspielen kopieren', copied: 'Link kopiert. Schick ihn deinen Spielern.', playToo: 'Selbst mitspielen', hidCount: 'Spieler, die dieses Bild ausblenden: {count}' },
    needTwo: 'Zum Start braucht es zwei Spieler.', act: '{name} hat das Bild gelöscht',
    teachers: { h: 'Doodle Hoot (Live)', p: 'Eine Person malt, die anderen setzen das Wort aus Buchstabenkärtchen zusammen: Rechtschreibung und Wortschatz in 13 Sprachen. Am besten für kleine Gruppen (bis 16); du kannst jederzeit ein Bild löschen oder einen Zug überspringen.' },
    learn: { game: 'Male ein Wort für die anderen oder setze ihres aus Buchstabenkärtchen zusammen. Leichte, mittlere oder knifflige Wörter in 13 Sprachen, live mit Familie und Freunden oder auf einem Gerät.',
      a8: 'Bilderwörter und Buchstabenkärtchen: Rechtschreibung wie bei einem Partyspiel.', a10: 'Knifflige Wörter, Antworten aus zwei Wörtern und ein Wettlauf, wer sie zuerst legt.' },
  },
  it: {
    mode: 'Doodle Hoot (Dal vivo)', modeText: 'Un giocatore disegna, gli altri compongono la parola con le tessere delle lettere. Per famiglia o amici, ovunque siano, ognuno sul proprio dispositivo.',
    ui: { legend: 'Doodle Hoot (Dal vivo)', lang: 'Lingua delle parole', level: 'Parole', levels: 'Facili|Medie|Difficili', like: 'Parole come:', rounds: 'Turni', roundsList: '1 giro (ognuno disegna una volta)|2 giri|3 giri', secs: 'Tempo per disegnare', secsN: '{n} secondi',
      hint: 'Tutti disegnano a turno. I giocatori entrano con il codice dal proprio dispositivo, ovunque siano. Nessuno scrive: si indovina con le tessere delle lettere e non c’è chat.', bigRoom: 'Un gruppo grande? Basta un giro: ognuno disegna una volta.', play: 'Esercitati o gioca su un dispositivo' },
    host: { skipTurn: 'Salta il turno', clear: 'Cancella il disegno', clearConfirm: 'Cancellare il disegno su tutti gli schermi?', copyLink: 'Copia il link per entrare', copied: 'Link copiato. Mandalo ai tuoi giocatori.', playToo: 'Gioca anche tu', hidCount: 'Giocatori che nascondono questo disegno: {count}' },
    needTwo: 'Servono due giocatori per iniziare.', act: '{name} ha cancellato il disegno',
    teachers: { h: 'Doodle Hoot (Dal vivo)', p: 'Un giocatore disegna, gli altri compongono la parola con le tessere delle lettere: ortografia e lessico in 13 lingue. Ideale per piccoli gruppi (fino a 16); puoi cancellare un disegno o saltare un turno quando vuoi.' },
    learn: { game: 'Disegna una parola per gli altri o componi la loro con le tessere delle lettere. Parole facili, medie o difficili in 13 lingue, dal vivo con famiglia e amici o su un dispositivo.',
      a8: 'Parole da disegnare e tessere delle lettere: l’ortografia come un gioco di società.', a10: 'Parole difficili, risposte di due parole e una gara a chi le compone per primo.' },
  },
  pt: {
    mode: 'Doodle Hoot (Ao vivo)', modeText: 'Um jogador desenha e os outros soletram a palavra com peças de letras. Para a família ou amigos, onde estiverem, cada um no seu aparelho.',
    ui: { legend: 'Doodle Hoot (Ao vivo)', lang: 'Idioma das palavras', level: 'Palavras', levels: 'Fáceis|Médias|Difíceis', like: 'Palavras como:', rounds: 'Rodadas', roundsList: '1 rodada (cada um desenha uma vez)|2 rodadas|3 rodadas', secs: 'Tempo para desenhar', secsN: '{n} segundos',
      hint: 'Todos desenham na sua vez. Os jogadores entram com o código no próprio aparelho, onde estiverem. Ninguém digita: os palpites são peças de letras e não há chat.', bigRoom: 'Um grupo grande? Uma rodada basta: cada um desenha uma vez.', play: 'Praticar ou jogar em um aparelho' },
    host: { skipTurn: 'Pular a vez', clear: 'Apagar desenho', clearConfirm: 'Apagar o desenho em todas as telas?', copyLink: 'Copiar link para entrar', copied: 'Link copiado. Envie para seus jogadores.', playToo: 'Jogar também', hidCount: 'Jogadores escondendo este desenho: {count}' },
    needTwo: 'São necessários dois jogadores para começar.', act: '{name} apagou o desenho',
    teachers: { h: 'Doodle Hoot (Ao vivo)', p: 'Um jogador desenha e os outros soletram a palavra com peças de letras: ortografia e vocabulário em 13 idiomas. Melhor para grupos pequenos (até 16); você pode apagar um desenho ou pular uma vez a qualquer momento.' },
    learn: { game: 'Desenhe uma palavra para os outros ou soletre a deles com peças de letras. Palavras fáceis, médias ou difíceis em 13 idiomas, ao vivo com família e amigos ou em um aparelho.',
      a8: 'Palavras com desenhos e peças de letras: ortografia com cara de jogo de festa.', a10: 'Palavras difíceis, respostas de duas palavras e uma corrida para soletrar primeiro.' },
  },
  nl: {
    mode: 'Doodle Hoot (Live)', modeText: 'Eén speler tekent, de anderen leggen het woord met lettertegels. Voor familie of vrienden, waar ze ook zijn, ieder op een eigen apparaat.',
    ui: { legend: 'Doodle Hoot (Live)', lang: 'Taal van de woorden', level: 'Woorden', levels: 'Makkelijk|Gemiddeld|Lastig', like: 'Woorden zoals:', rounds: 'Rondes', roundsList: '1 ronde (iedereen tekent één keer)|2 rondes|3 rondes', secs: 'Tijd om te tekenen', secsN: '{n} seconden',
      hint: 'Iedereen tekent om de beurt. Spelers doen mee met de code op hun eigen apparaat, waar ze ook zijn. Niemand typt: raden gaat met lettertegels en er is geen chat.', bigRoom: 'Een grote groep? Eén ronde is genoeg: iedereen tekent één keer.', play: 'Oefenen of spelen op één apparaat' },
    host: { skipTurn: 'Beurt overslaan', clear: 'Tekening wissen', clearConfirm: 'De tekening op alle schermen wissen?', copyLink: 'Link om mee te doen kopiëren', copied: 'Link gekopieerd. Stuur hem naar je spelers.', playToo: 'Zelf meespelen', hidCount: 'Spelers die deze tekening verbergen: {count}' },
    needTwo: 'Er zijn twee spelers nodig om te beginnen.', act: '{name} heeft de tekening gewist',
    teachers: { h: 'Doodle Hoot (Live)', p: 'Eén speler tekent, de anderen leggen het woord met lettertegels: spelling en woordenschat in 13 talen. Het best voor kleine groepen (tot 16); je kunt altijd een tekening wissen of een beurt overslaan.' },
    learn: { game: 'Teken een woord voor de anderen of leg het hunne met lettertegels. Makkelijke, gemiddelde of lastige woorden in 13 talen, live met familie en vrienden of op één apparaat.',
      a8: 'Plaatjeswoorden en lettertegels: spelling oefenen als een feestspel.', a10: 'Lastige woorden, antwoorden van twee woorden en een race om ze als eerste te leggen.' },
  },
  ru: {
    mode: 'Doodle Hoot (Вживую)', modeText: 'Один игрок рисует, остальные собирают слово из плиток с буквами. Для семьи или друзей, где бы они ни были, каждый на своём устройстве.',
    ui: { legend: 'Doodle Hoot (Вживую)', lang: 'Язык слов', level: 'Слова', levels: 'Лёгкие|Средние|Трудные', like: 'Слова вроде:', rounds: 'Раунды', roundsList: '1 раунд (каждый рисует один раз)|2 раунда|3 раунда', secs: 'Время на рисунок', secsN: '{n} секунд',
      hint: 'Все рисуют по очереди. Игроки входят по коду со своего устройства, где бы они ни были. Никто ничего не печатает: слово собирают из плиток с буквами, чата нет.', bigRoom: 'Большая компания? Хватит одного раунда: каждый нарисует один раз.', play: 'Тренироваться или играть на одном устройстве' },
    host: { skipTurn: 'Пропустить ход', clear: 'Стереть рисунок', clearConfirm: 'Стереть рисунок на всех экранах?', copyLink: 'Копировать ссылку для входа', copied: 'Ссылка скопирована. Отправьте её игрокам.', playToo: 'Играть тоже', hidCount: 'Скрыли этот рисунок: {count}' },
    needTwo: 'Чтобы начать, нужны два игрока.', act: '{name} стирает рисунок',
    teachers: { h: 'Doodle Hoot (Вживую)', p: 'Один игрок рисует, остальные собирают слово из плиток с буквами: орфография и словарный запас на 13 языках. Лучше всего для небольших групп (до 16); рисунок можно стереть, а ход пропустить в любой момент.' },
    learn: { game: 'Нарисуй слово для других или собери их слово из плиток с буквами. Лёгкие, средние или трудные слова на 13 языках, вживую с семьёй и друзьями или на одном устройстве.',
      a8: 'Слова-картинки и плитки с буквами: орфография как весёлая игра для компании.', a10: 'Трудные слова, ответы из двух слов и гонка — кто соберёт первым.' },
  },
  ja: {
    mode: 'Doodle Hoot（ライブ）', modeText: '1人が絵をかき、ほかのみんなは文字タイルで言葉をつづります。家族や友だちと、どこにいても、それぞれ自分の端末で。',
    ui: { legend: 'Doodle Hoot（ライブ）', lang: '言葉の言語', level: '言葉', levels: 'やさしい|ふつう|むずかしい', like: 'たとえば：', rounds: 'ラウンド', roundsList: '1ラウンド（全員が1回かく）|2ラウンド|3ラウンド', secs: 'かく時間', secsN: '{n}秒',
      hint: '全員が順番に絵をかきます。プレイヤーはどこにいても、自分の端末でコードを入れて参加します。文字を打つことはありません。答えは文字タイルで、チャットもありません。', bigRoom: '大人数なら1ラウンドで十分。全員が1回ずつかきます。', play: '練習する・1台で遊ぶ' },
    host: { skipTurn: '番をとばす', clear: '絵を消す', clearConfirm: 'すべての画面の絵を消しますか？', copyLink: '参加リンクをコピー', copied: 'リンクをコピーしました。プレイヤーに送ってください。', playToo: '自分も遊ぶ', hidCount: 'この絵をかくしている人：{count}' },
    needTwo: '始めるには2人必要です。', act: '{name}が絵を消しました',
    teachers: { h: 'Doodle Hoot（ライブ）', p: '1人が絵をかき、ほかの人は文字タイルで言葉をつづります。13言語でつづりと語彙の練習に。少人数（16人まで）向きで、絵を消したり番をとばしたりいつでもできます。' },
    learn: { game: 'みんなのために言葉を絵にかくか、文字タイルでつづろう。やさしい・ふつう・むずかしい言葉が13言語。家族や友だちとライブで、または1台で。',
      a8: '絵の言葉と文字タイルで、パーティーゲームのようにつづりを練習。', a10: 'むずかしい言葉や2語の答えを、だれが先につづれるか競争。' },
  },
  'zh-Hant': {
    mode: 'Doodle Hoot（即時）', modeText: '一位玩家畫圖，其他人用字母方塊拼出這個詞。適合家人或朋友，不論在哪裡，每人用自己的裝置。',
    ui: { legend: 'Doodle Hoot（即時）', lang: '詞語的語言', level: '詞語', levels: '簡單|中等|困難', like: '例如：', rounds: '回合', roundsList: '1 回合（每人畫一次）|2 回合|3 回合', secs: '畫圖時間', secsN: '{n} 秒',
      hint: '每個人輪流畫圖。玩家在任何地方都能用自己的裝置輸入代碼加入。沒有人打字：用字母方塊來猜，也沒有聊天。', bigRoom: '人很多嗎？1 回合就夠了：每人都會畫一次。', play: '練習或在一台裝置上玩' },
    host: { skipTurn: '跳過這一輪', clear: '清除圖畫', clearConfirm: '要清除所有螢幕上的圖畫嗎？', copyLink: '複製加入連結', copied: '已複製連結。傳給你的玩家吧。', playToo: '我也要玩', hidCount: '隱藏這張圖的玩家：{count}' },
    needTwo: '需要兩位玩家才能開始。', act: '{name} 清除了圖畫',
    teachers: { h: 'Doodle Hoot（即時）', p: '一位玩家畫圖，其他人用字母方塊拼出詞語：13 種語言的拼字和詞彙練習。最適合小組（最多 16 人）；你隨時可以清除圖畫或跳過一輪。' },
    learn: { game: '為大家畫一個詞，或用字母方塊拼出別人畫的詞。13 種語言的簡單、中等或困難詞語，可以和家人朋友即時玩，或在一台裝置上玩。',
      a8: '圖畫詞語加字母方塊：像派對遊戲一樣練習拼字。', a10: '困難的詞語、兩個詞的答案，比比看誰先拼出來。' },
  },
  ar: {
    mode: 'Doodle Hoot (مباشر)', modeText: 'يرسم لاعب واحد ويهجّئ الآخرون الكلمة ببطاقات الحروف. للعائلة أو الأصدقاء أينما كانوا، كل واحد على جهازه.',
    ui: { legend: 'Doodle Hoot (مباشر)', lang: 'لغة الكلمات', level: 'الكلمات', levels: 'سهلة|متوسطة|صعبة', like: 'كلمات مثل:', rounds: 'الجولات', roundsList: 'جولة واحدة (يرسم كل لاعب مرة)|جولتان|3 جولات', secs: 'وقت الرسم', secsN: '{n} ثانية',
      hint: 'يرسم الجميع بالدور. ينضم اللاعبون بالرمز من أجهزتهم أينما كانوا. لا أحد يكتب: التخمين ببطاقات الحروف، ولا توجد دردشة.', bigRoom: 'مجموعة كبيرة؟ تكفي جولة واحدة: يرسم كل لاعب مرة.', play: 'تدرّب أو العب على جهاز واحد' },
    host: { skipTurn: 'تخطَّ الدور', clear: 'امسح الرسم', clearConfirm: 'هل تمسح الرسم على كل الشاشات؟', copyLink: 'انسخ رابط الانضمام', copied: 'تم نسخ الرابط. أرسله إلى لاعبيك.', playToo: 'العب أنت أيضًا', hidCount: 'لاعبون أخفوا هذا الرسم: {count}' },
    needTwo: 'يلزم لاعبان للبدء.', act: 'مسح {name} الرسم',
    teachers: { h: 'Doodle Hoot (مباشر)', p: 'يرسم لاعب ويهجّئ الآخرون الكلمة ببطاقات الحروف: إملاء ومفردات بـ13 لغة. الأفضل للمجموعات الصغيرة (حتى 16)؛ يمكنك مسح رسم أو تخطي دور في أي وقت.' },
    learn: { game: 'ارسم كلمة للآخرين أو هجِّئ كلمتهم ببطاقات الحروف. كلمات سهلة أو متوسطة أو صعبة بـ13 لغة، مباشرة مع العائلة والأصدقاء أو على جهاز واحد.',
      a8: 'كلمات بالصور وبطاقات حروف: تدريب على الإملاء كأنه لعبة حفلة.', a10: 'كلمات صعبة وإجابات من كلمتين وسباق لمن يهجّئها أولًا.' },
  },
  he: {
    mode: 'Doodle Hoot (בשידור חי)', modeText: 'שחקן אחד מצייר, וכל השאר מאייתים את המילה באריחי אותיות. למשפחה או לחברים, איפה שהם, כל אחד במכשיר שלו.',
    ui: { legend: 'Doodle Hoot (בשידור חי)', lang: 'שפת המילים', level: 'מילים', levels: 'קלות|בינוניות|מאתגרות', like: 'מילים כמו:', rounds: 'סבבים', roundsList: 'סבב אחד (כל אחד מצייר פעם אחת)|2 סבבים|3 סבבים', secs: 'זמן ציור', secsN: '{n} שניות',
      hint: 'כולם מציירים בתורות. השחקנים מצטרפים עם הקוד מהמכשיר שלהם, איפה שהם. אף אחד לא מקליד: מנחשים באריחי אותיות, ואין צ׳אט.', bigRoom: 'קבוצה גדולה? סבב אחד מספיק: כל אחד מצייר פעם אחת.', play: 'לתרגל או לשחק במכשיר אחד' },
    host: { skipTurn: 'דילוג על תור', clear: 'מחיקת הציור', clearConfirm: 'למחוק את הציור בכל המסכים?', copyLink: 'העתקת קישור הצטרפות', copied: 'הקישור הועתק. שלחו אותו לשחקנים.', playToo: 'לשחק גם', hidCount: 'שחקנים שהסתירו את הציור: {count}' },
    needTwo: 'צריך שני שחקנים כדי להתחיל.', act: '{name} מחק/ה את הציור',
    teachers: { h: 'Doodle Hoot (בשידור חי)', p: 'שחקן אחד מצייר והשאר מאייתים את המילה באריחי אותיות: איות ואוצר מילים ב־13 שפות. הכי טוב לקבוצות קטנות (עד 16); אפשר למחוק ציור או לדלג על תור בכל רגע.' },
    learn: { game: 'ציירו מילה לאחרים או אייתו את שלהם באריחי אותיות. מילים קלות, בינוניות או מאתגרות ב־13 שפות, בשידור חי עם משפחה וחברים או במכשיר אחד.',
      a8: 'מילים מצוירות ואריחי אותיות: תרגול איות שמרגיש כמו משחק מסיבה.', a10: 'מילים מאתגרות, תשובות של שתי מילים ומרוץ מי יאיית ראשון.' },
  },
};
/** en-GB's own spellings (the rest falls back to English). */
const GB = { ui: { play: 'Practise or play on one device' } };

const J = v => JSON.stringify(v);
const block = (v, ind) => JSON.stringify(v, null, 2).split('\n').map((l, i) => (i ? ind + l : l)).join('\n');
function once(text, needle) {
  const a = text.indexOf(needle);
  if (a < 0 || text.indexOf(needle, a + 1) >= 0) throw new Error(`not once: ${needle.slice(0, 60)}`);
  return a;
}
const lineStart = (text, at) => text.lastIndexOf('\n', at) + 1;
const indentAt = (text, at) => /^\s*/.exec(text.slice(lineStart(text, at)))[0];
function before(text, needle, key, value) { return beforeAt(text, lineStart(text, once(text, needle)), key, value); }
function beforeAt(text, at, key, value) {
  const ind = indentAt(text, at);
  return text.slice(0, at) + `${ind}${J(key)}: ${block(value, ind)},\n` + text.slice(at);
}
function after(text, needle, pairs) {
  const a = once(text, needle) + needle.length, ind = indentAt(text, a - 1);
  return text.slice(0, a) + pairs.map(([k, v]) => `,\n${ind}${J(k)}: ${block(v, ind)}`).join('') + text.slice(a);
}
const sorted = o => (o && typeof o === 'object' && !Array.isArray(o) ? Object.fromEntries(Object.keys(o).sort().map(k => [k, sorted(o[k])])) : o);

const files = fs.readdirSync(DIR).filter(f => f.endsWith('.json') && f !== 'en-GB.json');
for (const f of files) {
  const code = f.replace(/\.json$/, '');
  const w = W[code];
  if (!w) throw new Error(`no words for ${code}`);
  const p = path.join(DIR, f);
  let text = fs.readFileSync(p, 'utf8');
  const j = JSON.parse(text);
  if (j.live.mode.doodle) { console.log('=', f); continue; }
  text = after(text, `"tugText": ${J(j.live.mode.tugText)}`, [['doodle', w.mode], ['doodleText', w.modeText]]);
  text = before(text, '"atlasUi": {', 'doodleUi', w.ui);
  for (const [k, v] of Object.entries(w.host)) text = before(text, `"endConfirm": ${J(j.live.host.endConfirm)}`, k, v);
  text = before(text, `"tugTeams": ${J(j.live.api.tugTeams)}`, 'needTwo', w.needTwo);
  text = after(text, `"skip": ${J(j.live.cohost.act.skip)}`, [['clear', w.act]]);
  const h = once(text, `"h": ${J(j.teachersLive.modes.tug.h)}`);
  text = beforeAt(text, lineStart(text, text.lastIndexOf('"tug":', h)), 'doodle', w.teachers);
  text = after(text, `"tugOfMath": ${J(j.learn.games.tugOfMath)}`, [['doodleHoot', w.learn.game]]);
  text = after(text, `"tugOfMath": ${J(j.learn.ages.a8.fit.tugOfMath)}`, [['doodleHoot', w.learn.a8]]);
  text = after(text, `"tugOfMath": ${J(j.learn.ages.a10.fit.tugOfMath)}`, [['doodleHoot', w.learn.a10]]);
  // the same as setting the keys on the parsed file
  const want = JSON.parse(JSON.stringify(j));
  Object.assign(want.live.mode, { doodle: w.mode, doodleText: w.modeText }); want.live.doodleUi = w.ui; Object.assign(want.live.host, w.host);
  want.live.api.needTwo = w.needTwo; want.live.cohost.act.clear = w.act; want.teachersLive.modes.doodle = w.teachers;
  want.learn.games.doodleHoot = w.learn.game; want.learn.ages.a8.fit.doodleHoot = w.learn.a8; want.learn.ages.a10.fit.doodleHoot = w.learn.a10;
  const got = JSON.parse(text);
  if (J(sorted(got)) !== J(sorted(want))) throw new Error(`${f}: not the same as the parsed edit`);
  fs.writeFileSync(p, text);
  console.log('✓', f);
}
// en-GB: a plain JSON file of its own spellings
{
  const p = path.join(DIR, 'en-GB.json'), j = JSON.parse(fs.readFileSync(p, 'utf8'));
  j.live = j.live || {}; j.live.doodleUi = { ...(j.live.doodleUi || {}), ...GB.ui };
  fs.writeFileSync(p, `${JSON.stringify(j, null, 2)}\n`);
  console.log('✓ en-GB.json');
}
