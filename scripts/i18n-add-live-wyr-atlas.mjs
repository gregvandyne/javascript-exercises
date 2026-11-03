// One-off: the site words for Would You Rather Live and Atlas Quest Live (docs/decisions.md "Would You Rather and
// Atlas Quest go live"), merged into every locale file (keys are added; nothing else changes). Safe to re-run.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '../server/i18n/locales');
const W = {
  en: {
    mode: { wyr: 'Would You Rather Live', wyrText: 'The class votes on fun dilemmas and sees how it splits, and how everyone on Oomba chose. No right answers, no points: just talking.', atlas: 'Atlas Quest Live', atlasText: 'Everyone taps the country on their own world map: find it, its flag, its capital or what it is famous for. Close guesses still score a little.' },
    wyrUi: { legend: 'Would You Rather Live', topics: 'Topics', topicsHint: 'Leave them all ticked for a mix.', count: 'How many dilemmas', secs: 'Time to choose', secsN: '{n} seconds', hint: 'After each vote the class sees its split: a good moment to ask a few children why they chose it.' },
    atlasUi: { legend: 'Atlas Quest Live', region: 'Where in the world', level: 'Level', kinds: 'Question types', count: 'How many questions', secs: 'Time per question', hint: 'Players tap the country on a world map they can zoom. The class screen shows where everyone tapped.' },
    atlas: {
      region: { world: 'The whole world', af: 'Africa', as: 'Asia', eu: 'Europe', na: 'North America', sa: 'South America', oc: 'Oceania' },
      level: { easy: 'Easy: famous countries', medium: 'Medium: famous and big countries', hard: 'Hard: every country' },
      kind: { find: 'Find the country', capital: 'Capital cities', flag: 'Flags', famous: 'Famous for…' },
      q: { find: 'Find {name}', capital: 'Find the country whose capital is {city}', flag: 'Find the country with this flag', famous: 'Find the country famous for {thing}' },
    },
    votes: '{count, plural, one {# vote} other {# votes}}',
  },
  es: {
    mode: { wyr: '¿Qué prefieres? en vivo', wyrText: 'La clase vota dilemas divertidos y ve cómo se reparte, y qué eligió todo el mundo en Oomba. Sin respuestas correctas ni puntos: solo para conversar.', atlas: 'Atlas Quest en vivo', atlasText: 'Todos tocan el país en su propio mapa del mundo: encuéntralo, su bandera, su capital o por qué es famoso. Acercarse también suma un poco.' },
    wyrUi: { legend: '¿Qué prefieres? en vivo', topics: 'Temas', topicsHint: 'Déjalos todos marcados para una mezcla.', count: 'Cuántos dilemas', secs: 'Tiempo para elegir', secsN: '{n} segundos', hint: 'Después de cada votación la clase ve el resultado: buen momento para preguntar a algunos niños por qué lo eligieron.' },
    atlasUi: { legend: 'Atlas Quest en vivo', region: 'En qué parte del mundo', level: 'Nivel', kinds: 'Tipos de pregunta', count: 'Cuántas preguntas', secs: 'Tiempo por pregunta', hint: 'Cada jugador toca el país en un mapa del mundo que puede ampliar. La pantalla de la clase muestra dónde tocó cada uno.' },
    atlas: {
      region: { world: 'Todo el mundo', af: 'África', as: 'Asia', eu: 'Europa', na: 'América del Norte', sa: 'América del Sur', oc: 'Oceanía' },
      level: { easy: 'Fácil: países famosos', medium: 'Medio: países famosos y grandes', hard: 'Difícil: todos los países' },
      kind: { find: 'Encuentra el país', capital: 'Capitales', flag: 'Banderas', famous: 'Famoso por…' },
      q: { find: 'Encuentra {name}', capital: 'Encuentra el país cuya capital es {city}', flag: 'Encuentra el país de esta bandera', famous: 'Encuentra el país famoso por {thing}' },
    },
    votes: '{count, plural, one {# voto} other {# votos}}',
  },
  fr: {
    mode: { wyr: 'Tu préfères ? en direct', wyrText: 'La classe vote sur des dilemmes amusants et voit comment elle se partage, et ce qu’ont choisi tous les joueurs d’Oomba. Pas de bonne réponse, pas de points : on discute.', atlas: 'Atlas Quest en direct', atlasText: 'Chacun touche le pays sur sa propre carte du monde : trouve-le, son drapeau, sa capitale ou ce qui le rend célèbre. Viser juste à côté rapporte un peu aussi.' },
    wyrUi: { legend: 'Tu préfères ? en direct', topics: 'Thèmes', topicsHint: 'Laisse-les tous cochés pour un mélange.', count: 'Combien de dilemmes', secs: 'Temps pour choisir', secsN: '{n} secondes', hint: 'Après chaque vote, la classe voit le partage : un bon moment pour demander à quelques enfants pourquoi ils ont choisi.' },
    atlasUi: { legend: 'Atlas Quest en direct', region: 'Où dans le monde', level: 'Niveau', kinds: 'Types de questions', count: 'Combien de questions', secs: 'Temps par question', hint: 'Chaque joueur touche le pays sur une carte du monde qu’il peut agrandir. L’écran de la classe montre où chacun a touché.' },
    atlas: {
      region: { world: 'Le monde entier', af: 'Afrique', as: 'Asie', eu: 'Europe', na: 'Amérique du Nord', sa: 'Amérique du Sud', oc: 'Océanie' },
      level: { easy: 'Facile : pays célèbres', medium: 'Moyen : pays célèbres et grands pays', hard: 'Difficile : tous les pays' },
      kind: { find: 'Trouver le pays', capital: 'Capitales', flag: 'Drapeaux', famous: 'Célèbre pour…' },
      q: { find: 'Trouve ce pays : {name}', capital: 'Trouve le pays dont la capitale est {city}', flag: 'Trouve le pays de ce drapeau', famous: 'Trouve le pays célèbre pour {thing}' },
    },
    votes: '{count, plural, one {# vote} other {# votes}}',
  },
  de: {
    mode: { wyr: 'Was wäre dir lieber? live', wyrText: 'Die Klasse stimmt über lustige Fragen ab und sieht, wie sie sich aufteilt und was alle auf Oomba gewählt haben. Keine richtigen Antworten, keine Punkte: einfach darüber reden.', atlas: 'Atlas Quest live', atlasText: 'Alle tippen das Land auf ihrer eigenen Weltkarte an: das Land selbst, seine Flagge, seine Hauptstadt oder wofür es berühmt ist. Knapp daneben gibt auch ein paar Punkte.' },
    wyrUi: { legend: 'Was wäre dir lieber? live', topics: 'Themen', topicsHint: 'Lass alle angehakt für eine Mischung.', count: 'Wie viele Fragen', secs: 'Zeit zum Wählen', secsN: '{n} Sekunden', hint: 'Nach jeder Abstimmung sieht die Klasse die Aufteilung: ein guter Moment, ein paar Kinder zu fragen, warum sie so gewählt haben.' },
    atlasUi: { legend: 'Atlas Quest live', region: 'Wo auf der Welt', level: 'Stufe', kinds: 'Fragearten', count: 'Wie viele Fragen', secs: 'Zeit pro Frage', hint: 'Alle tippen das Land auf einer Weltkarte an, die sie vergrößern können. Der Klassenbildschirm zeigt, wo alle getippt haben.' },
    atlas: {
      region: { world: 'Die ganze Welt', af: 'Afrika', as: 'Asien', eu: 'Europa', na: 'Nordamerika', sa: 'Südamerika', oc: 'Ozeanien' },
      level: { easy: 'Leicht: bekannte Länder', medium: 'Mittel: bekannte und große Länder', hard: 'Schwer: alle Länder' },
      kind: { find: 'Finde das Land', capital: 'Hauptstädte', flag: 'Flaggen', famous: 'Berühmt für …' },
      q: { find: 'Finde {name}', capital: 'Finde das Land mit der Hauptstadt {city}', flag: 'Finde das Land mit dieser Flagge', famous: 'Finde das Land, das berühmt ist für {thing}' },
    },
    votes: '{count, plural, one {# Stimme} other {# Stimmen}}',
  },
  it: {
    mode: { wyr: 'Preferiresti? dal vivo', wyrText: 'La classe vota su dilemmi divertenti e vede come si divide, e cosa hanno scelto tutti su Oomba. Niente risposte giuste, niente punti: solo per parlarne.', atlas: 'Atlas Quest dal vivo', atlasText: 'Tutti toccano il paese sulla propria mappa del mondo: trovalo, la sua bandiera, la sua capitale o ciò per cui è famoso. Andarci vicino vale comunque qualcosa.' },
    wyrUi: { legend: 'Preferiresti? dal vivo', topics: 'Argomenti', topicsHint: 'Lasciali tutti selezionati per un mix.', count: 'Quanti dilemmi', secs: 'Tempo per scegliere', secsN: '{n} secondi', hint: 'Dopo ogni voto la classe vede come si è divisa: un buon momento per chiedere ad alcuni bambini perché hanno scelto così.' },
    atlasUi: { legend: 'Atlas Quest dal vivo', region: 'Dove nel mondo', level: 'Livello', kinds: 'Tipi di domanda', count: 'Quante domande', secs: 'Tempo per domanda', hint: 'Ogni giocatore tocca il paese su una mappa del mondo che può ingrandire. Lo schermo della classe mostra dove ha toccato ognuno.' },
    atlas: {
      region: { world: 'Tutto il mondo', af: 'Africa', as: 'Asia', eu: 'Europa', na: 'America del Nord', sa: 'America del Sud', oc: 'Oceania' },
      level: { easy: 'Facile: paesi famosi', medium: 'Medio: paesi famosi e grandi', hard: 'Difficile: tutti i paesi' },
      kind: { find: 'Trova il paese', capital: 'Capitali', flag: 'Bandiere', famous: 'Famoso per…' },
      q: { find: 'Trova {name}', capital: 'Trova il paese che ha come capitale {city}', flag: 'Trova il paese di questa bandiera', famous: 'Trova il paese famoso per {thing}' },
    },
    votes: '{count, plural, one {# voto} other {# voti}}',
  },
  pt: {
    mode: { wyr: 'O que você prefere? ao vivo', wyrText: 'A turma vota em dilemas divertidos e vê como se divide, e o que todo mundo no Oomba escolheu. Sem respostas certas, sem pontos: só para conversar.', atlas: 'Atlas Quest ao vivo', atlasText: 'Todos tocam o país no seu próprio mapa-múndi: encontre o país, a bandeira, a capital ou aquilo pelo que é famoso. Chegar perto também vale um pouco.' },
    wyrUi: { legend: 'O que você prefere? ao vivo', topics: 'Temas', topicsHint: 'Deixe todos marcados para uma mistura.', count: 'Quantos dilemas', secs: 'Tempo para escolher', secsN: '{n} segundos', hint: 'Depois de cada votação a turma vê como se dividiu: um bom momento para perguntar a algumas crianças por que escolheram.' },
    atlasUi: { legend: 'Atlas Quest ao vivo', region: 'Onde no mundo', level: 'Nível', kinds: 'Tipos de pergunta', count: 'Quantas perguntas', secs: 'Tempo por pergunta', hint: 'Cada jogador toca o país num mapa-múndi que pode ampliar. A tela da turma mostra onde cada um tocou.' },
    atlas: {
      region: { world: 'O mundo inteiro', af: 'África', as: 'Ásia', eu: 'Europa', na: 'América do Norte', sa: 'América do Sul', oc: 'Oceania' },
      level: { easy: 'Fácil: países famosos', medium: 'Médio: países famosos e grandes', hard: 'Difícil: todos os países' },
      kind: { find: 'Encontre o país', capital: 'Capitais', flag: 'Bandeiras', famous: 'Famoso por…' },
      q: { find: 'Encontre {name}', capital: 'Encontre o país cuja capital é {city}', flag: 'Encontre o país desta bandeira', famous: 'Encontre o país famoso por {thing}' },
    },
    votes: '{count, plural, one {# voto} other {# votos}}',
  },
  nl: {
    mode: { wyr: 'Wat heb je liever? live', wyrText: 'De klas stemt over grappige dilemma’s en ziet hoe de stemmen verdeeld zijn, en wat iedereen op Oomba koos. Geen goede antwoorden, geen punten: gewoon praten.', atlas: 'Atlas Quest live', atlasText: 'Iedereen tikt het land aan op zijn eigen wereldkaart: het land zelf, de vlag, de hoofdstad of waar het beroemd om is. Er net naast levert ook een beetje op.' },
    wyrUi: { legend: 'Wat heb je liever? live', topics: 'Onderwerpen', topicsHint: 'Laat ze allemaal aangevinkt voor een mix.', count: 'Hoeveel dilemma’s', secs: 'Tijd om te kiezen', secsN: '{n} seconden', hint: 'Na elke stemming ziet de klas de verdeling: een goed moment om een paar kinderen te vragen waarom ze dat kozen.' },
    atlasUi: { legend: 'Atlas Quest live', region: 'Waar op de wereld', level: 'Niveau', kinds: 'Soorten vragen', count: 'Hoeveel vragen', secs: 'Tijd per vraag', hint: 'Iedereen tikt het land aan op een wereldkaart waarop je kunt inzoomen. Het klasscherm laat zien waar iedereen tikte.' },
    atlas: {
      region: { world: 'De hele wereld', af: 'Afrika', as: 'Azië', eu: 'Europa', na: 'Noord-Amerika', sa: 'Zuid-Amerika', oc: 'Oceanië' },
      level: { easy: 'Makkelijk: bekende landen', medium: 'Gemiddeld: bekende en grote landen', hard: 'Moeilijk: alle landen' },
      kind: { find: 'Vind het land', capital: 'Hoofdsteden', flag: 'Vlaggen', famous: 'Beroemd om…' },
      q: { find: 'Vind {name}', capital: 'Vind het land met hoofdstad {city}', flag: 'Vind het land met deze vlag', famous: 'Vind het land dat beroemd is om {thing}' },
    },
    votes: '{count, plural, one {# stem} other {# stemmen}}',
  },
  ru: {
    mode: { wyr: 'Что бы ты выбрал? вживую', wyrText: 'Класс голосует за весёлые дилеммы и видит, как разделились голоса и что выбрали все на Oomba. Нет правильных ответов и очков: просто поговорить.', atlas: 'Atlas Quest вживую', atlasText: 'Каждый нажимает на страну на своей карте мира: саму страну, её флаг, столицу или то, чем она знаменита. Даже близкий ответ приносит немного очков.' },
    wyrUi: { legend: 'Что бы ты выбрал? вживую', topics: 'Темы', topicsHint: 'Оставь все отмеченными для смеси.', count: 'Сколько дилемм', secs: 'Время на выбор', secsN: '{n} секунд', hint: 'После каждого голосования класс видит, как разделились голоса: хороший момент спросить нескольких детей, почему они так выбрали.' },
    atlasUi: { legend: 'Atlas Quest вживую', region: 'Где в мире', level: 'Уровень', kinds: 'Виды вопросов', count: 'Сколько вопросов', secs: 'Время на вопрос', hint: 'Каждый игрок нажимает на страну на карте мира, которую можно увеличить. На экране класса видно, куда нажал каждый.' },
    atlas: {
      region: { world: 'Весь мир', af: 'Африка', as: 'Азия', eu: 'Европа', na: 'Северная Америка', sa: 'Южная Америка', oc: 'Океания' },
      level: { easy: 'Легко: известные страны', medium: 'Средне: известные и большие страны', hard: 'Трудно: все страны' },
      kind: { find: 'Найди страну', capital: 'Столицы', flag: 'Флаги', famous: 'Знаменита своим…' },
      q: { find: 'Найди страну: {name}', capital: 'Найди страну, столица которой — {city}', flag: 'Найди страну с этим флагом', famous: 'Найди страну, которая знаменита: {thing}' },
    },
    votes: '{count, plural, one {# голос} few {# голоса} many {# голосов} other {# голоса}}',
  },
  ja: {
    mode: { wyr: 'どっちがいい？ ライブ', wyrText: 'クラスで楽しい「どっちがいい？」に投票して、クラスの分かれ方と Oomba のみんなの選び方を見よう。正解も点数もなし。話し合うためのゲームです。', atlas: 'アトラスクエスト ライブ', atlasText: 'みんなが自分の世界地図で国をタップ。国そのもの、国旗、首都、有名なものから探そう。近くをタップしても少しだけ点がもらえます。' },
    wyrUi: { legend: 'どっちがいい？ ライブ', topics: 'テーマ', topicsHint: 'ぜんぶチェックしたままにすると、いろいろ混ざります。', count: '問題の数', secs: '選ぶ時間', secsN: '{n}秒', hint: '投票のたびにクラスの分かれ方が出ます。何人かの子どもに「どうしてそっちを選んだの？」と聞いてみるチャンスです。' },
    atlasUi: { legend: 'アトラスクエスト ライブ', region: '世界のどこ', level: 'レベル', kinds: '問題の種類', count: '問題の数', secs: '1問の時間', hint: 'プレイヤーは拡大できる世界地図で国をタップします。クラスの画面には、みんながタップした場所が出ます。' },
    atlas: {
      region: { world: '世界ぜんぶ', af: 'アフリカ', as: 'アジア', eu: 'ヨーロッパ', na: '北アメリカ', sa: '南アメリカ', oc: 'オセアニア' },
      level: { easy: 'かんたん：有名な国', medium: 'ふつう：有名な国と大きな国', hard: 'むずかしい：すべての国' },
      kind: { find: '国をさがす', capital: '首都', flag: '国旗', famous: '有名なもの' },
      q: { find: '{name}をさがそう', capital: '首都が{city}の国をさがそう', flag: 'この国旗の国をさがそう', famous: '{thing}で有名な国をさがそう' },
    },
    votes: '{count}票',
  },
  'zh-Hant': {
    mode: { wyr: '你比較想要哪個？ 即時版', wyrText: '全班為有趣的兩難問題投票，看看全班怎麼分，還有 Oomba 上大家怎麼選。沒有標準答案，也沒有分數：就是聊一聊。', atlas: '地圖探險 即時版', atlasText: '每個人在自己的世界地圖上點出國家：找國家、國旗、首都，或它以什麼聞名。點得很接近也能拿到一點分數。' },
    wyrUi: { legend: '你比較想要哪個？ 即時版', topics: '主題', topicsHint: '全部勾選就是混合題目。', count: '題目數量', secs: '選擇時間', secsN: '{n} 秒', hint: '每次投票後全班都會看到結果：正好可以問問幾個孩子為什麼這樣選。' },
    atlasUi: { legend: '地圖探險 即時版', region: '世界上的哪裡', level: '難度', kinds: '題目種類', count: '題目數量', secs: '每題時間', hint: '玩家在可以放大的世界地圖上點出國家。全班的螢幕會顯示每個人點在哪裡。' },
    atlas: {
      region: { world: '全世界', af: '非洲', as: '亞洲', eu: '歐洲', na: '北美洲', sa: '南美洲', oc: '大洋洲' },
      level: { easy: '簡單：有名的國家', medium: '中等：有名和大的國家', hard: '困難：所有國家' },
      kind: { find: '找國家', capital: '首都', flag: '國旗', famous: '以什麼聞名' },
      q: { find: '找出{name}', capital: '找出首都是{city}的國家', flag: '找出這面國旗的國家', famous: '找出以{thing}聞名的國家' },
    },
    votes: '{count} 票',
  },
  ar: {
    mode: { wyr: 'ماذا تفضّل؟ مباشرة', wyrText: 'يصوّت الصف على معضلات طريفة ويرى كيف انقسمت الأصوات، وماذا اختار الجميع على Oomba. لا إجابات صحيحة ولا نقاط: فقط للحديث.', atlas: 'أطلس كويست مباشرة', atlasText: 'يلمس الجميع البلد على خريطة العالم الخاصة بهم: البلد نفسه أو علمه أو عاصمته أو ما يشتهر به. والاقتراب منه يمنح بعض النقاط أيضًا.' },
    wyrUi: { legend: 'ماذا تفضّل؟ مباشرة', topics: 'المواضيع', topicsHint: 'اتركها كلها محددة للحصول على مزيج.', count: 'عدد المعضلات', secs: 'وقت الاختيار', secsN: '{n} ثانية', hint: 'بعد كل تصويت يرى الصف كيف انقسم: لحظة جيدة لتسأل بعض الأطفال لماذا اختاروا ذلك.' },
    atlasUi: { legend: 'أطلس كويست مباشرة', region: 'أين في العالم', level: 'المستوى', kinds: 'أنواع الأسئلة', count: 'عدد الأسئلة', secs: 'الوقت لكل سؤال', hint: 'يلمس كل لاعب البلد على خريطة للعالم يمكنه تكبيرها. وتُظهر شاشة الصف أين لمس كل واحد.' },
    atlas: {
      region: { world: 'العالم كله', af: 'أفريقيا', as: 'آسيا', eu: 'أوروبا', na: 'أمريكا الشمالية', sa: 'أمريكا الجنوبية', oc: 'أوقيانوسيا' },
      level: { easy: 'سهل: بلدان مشهورة', medium: 'متوسط: بلدان مشهورة وكبيرة', hard: 'صعب: كل البلدان' },
      kind: { find: 'جد البلد', capital: 'العواصم', flag: 'الأعلام', famous: 'يشتهر بـ…' },
      q: { find: 'جد {name}', capital: 'جد البلد الذي عاصمته {city}', flag: 'جد البلد صاحب هذا العلم', famous: 'جد البلد المشهور بـ {thing}' },
    },
    votes: '{count, plural, zero {لا أصوات} one {صوت واحد} two {صوتان} few {# أصوات} many {# صوتًا} other {# صوت}}',
  },
  he: {
    mode: { wyr: 'מה הייתם מעדיפים? בשידור חי', wyrText: 'הכיתה מצביעה על דילמות משעשעות ורואה איך היא מתחלקת, ומה בחרו כולם ב-Oomba. אין תשובות נכונות ואין נקודות: רק לשוחח.', atlas: 'אטלס קווסט בשידור חי', atlasText: 'כל אחד נוגע במדינה על מפת העולם שלו: המדינה עצמה, הדגל שלה, הבירה שלה או במה היא מפורסמת. גם קרוב מזכה בקצת נקודות.' },
    wyrUi: { legend: 'מה הייתם מעדיפים? בשידור חי', topics: 'נושאים', topicsHint: 'השאירו את כולם מסומנים לשילוב.', count: 'כמה דילמות', secs: 'זמן לבחירה', secsN: '{n} שניות', hint: 'אחרי כל הצבעה הכיתה רואה איך היא התחלקה: רגע טוב לשאול כמה ילדים למה בחרו כך.' },
    atlasUi: { legend: 'אטלס קווסט בשידור חי', region: 'איפה בעולם', level: 'רמה', kinds: 'סוגי שאלות', count: 'כמה שאלות', secs: 'זמן לכל שאלה', hint: 'כל שחקן נוגע במדינה על מפת עולם שאפשר להגדיל. מסך הכיתה מראה איפה כל אחד נגע.' },
    atlas: {
      region: { world: 'כל העולם', af: 'אפריקה', as: 'אסיה', eu: 'אירופה', na: 'צפון אמריקה', sa: 'דרום אמריקה', oc: 'אוקיאניה' },
      level: { easy: 'קל: מדינות מפורסמות', medium: 'בינוני: מדינות מפורסמות וגדולות', hard: 'קשה: כל המדינות' },
      kind: { find: 'מצאו את המדינה', capital: 'ערי בירה', flag: 'דגלים', famous: 'מפורסמת ב…' },
      q: { find: 'מצאו את {name}', capital: 'מצאו את המדינה שעיר הבירה שלה היא {city}', flag: 'מצאו את המדינה של הדגל הזה', famous: 'מצאו את המדינה המפורסמת ב{thing}' },
    },
    votes: '{count, plural, one {הצבעה אחת} other {# הצבעות}}',
  },
};

const files = fs.readdirSync(DIR).filter(f => f.endsWith('.json') && f !== 'en-GB.json');
for (const f of files) {
  const code = f.replace(/\.json$/, '');
  const w = W[code];
  if (!w) throw new Error(`no words for ${code}`);
  const p = path.join(DIR, f);
  const j = JSON.parse(fs.readFileSync(p, 'utf8'));
  const live = j.live;
  Object.assign(live.mode, w.mode);
  live.wyrUi = w.wyrUi; live.atlasUi = w.atlasUi; live.atlas = w.atlas;
  live.results.votes = w.votes;
  fs.writeFileSync(p, JSON.stringify(j, null, 2) + '\n');
  console.log('✓', f);
}
