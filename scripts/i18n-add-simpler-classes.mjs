#!/usr/bin/env node
// One-off: the words for "My classes, simpler" (docs/decisions.md): All classes, My school on the Me page, the Teacher
// plan card's seat and plan lines, and the unit / folder lines. Removes the keys of the sections My classes no longer
// has. Run once: node scripts/i18n-add-simpler-classes.mjs (it is safe to run again).
import fs from 'node:fs';

const W = {
  'teach.home.allClasses': {
    en: 'All classes', es: 'Todas las clases', fr: 'Toutes les classes', de: 'Alle Klassen', it: 'Tutte le classi', pt: 'Todas as turmas',
    nl: 'Alle klassen', ru: 'Все классы', ja: 'すべてのクラス', 'zh-Hant': '所有班級', ar: 'كل الفصول', he: 'כל הכיתות',
  },
  'me.tiles.school': {
    en: 'My school', es: 'Mi escuela', fr: 'Mon école', de: 'Meine Schule', it: 'La mia scuola', pt: 'Minha escola',
    nl: 'Mijn school', ru: 'Моя школа', ja: 'マイスクール', 'zh-Hant': '我的學校', ar: 'مدرستي', he: 'בית הספר שלי',
  },
  'me.tiles.asks': {
    en: '{count, plural, one {# teacher asked for a plan} other {# teachers asked for a plan}}',
    es: '{count, plural, one {# docente pidió un plan} other {# docentes pidieron un plan}}',
    fr: '{count, plural, one {# enseignant a demandé un abonnement} many {# enseignants ont demandé un abonnement} other {# enseignants ont demandé un abonnement}}',
    de: '{count, plural, one {# Lehrkraft hat nach einem Abo gefragt} other {# Lehrkräfte haben nach einem Abo gefragt}}',
    it: '{count, plural, one {# insegnante ha chiesto un piano} other {# insegnanti hanno chiesto un piano}}',
    pt: '{count, plural, one {# professor pediu um plano} other {# professores pediram um plano}}',
    nl: '{count, plural, one {# leerkracht vroeg om een abonnement} other {# leerkrachten vroegen om een abonnement}}',
    ru: '{count, plural, one {# учитель попросил подписку} few {# учителя попросили подписку} many {# учителей попросили подписку} other {# учителя попросили подписку}}',
    ja: '{count, plural, other {#人の教員がプランを依頼しました}}',
    'zh-Hant': '{count, plural, other {# 位老師申請了方案}}',
    ar: '{count, plural, zero {لم يطلب أي معلّم باقة} one {طلب معلّم واحد باقة} two {طلب معلّمان باقة} few {طلب # معلّمين باقة} many {طلب # معلّمًا باقة} other {طلب # معلّم باقة}}',
    he: '{count, plural, one {מורה אחד ביקש תוכנית} two {שני מורים ביקשו תוכנית} other {# מורים ביקשו תוכנית}}',
  },
  'plans.trial.card.schoolBilling': {
    en: 'Manage school billing', es: 'Administrar los pagos de la escuela', fr: "Gérer la facturation de l'école", de: 'Abrechnung der Schule verwalten',
    it: 'Gestisci la fatturazione della scuola', pt: 'Gerenciar a cobrança da escola', nl: 'Facturering van de school beheren', ru: 'Управление оплатой школы',
    ja: '学校のお支払いを管理', 'zh-Hant': '管理學校帳務', ar: 'إدارة فوترة المدرسة', he: 'ניהול החיובים של בית הספר',
  },
  'plans.trial.card.seatNote': {
    en: 'The admins of {school} look after this plan.', es: 'Los administradores de {school} gestionan este plan.',
    fr: 'Les administrateurs de {school} gèrent cet abonnement.', de: 'Die Admins von {school} verwalten dieses Abo.',
    it: 'Gli amministratori di {school} gestiscono questo piano.', pt: 'Os administradores de {school} cuidam deste plano.',
    nl: 'De beheerders van {school} regelen dit abonnement.', ru: 'Этой подпиской управляют администраторы школы «{school}».',
    ja: 'このプランは{school}の管理者が管理しています。', 'zh-Hant': '這個方案由 {school} 的管理員管理。', ar: 'يدير مسؤولو {school} هذه الباقة.',
    he: 'המנהלים של {school} מטפלים בתוכנית הזאת.',
  },
  'plans.trial.card.seePlans': {
    en: 'See the plans', es: 'Ver los planes', fr: 'Voir les offres', de: 'Abos ansehen', it: 'Vedi i piani', pt: 'Ver os planos',
    nl: 'Bekijk de prijzen', ru: 'Посмотреть подписки', ja: 'プランを見る', 'zh-Hant': '查看方案', ar: 'عرض الباقات', he: 'לצפייה בתוכניות',
  },
  'lessons.class.unitWhy': {
    en: 'Units group the lessons in this class, in the order students see them. Folders only sort your own lesson library.',
    es: 'Las unidades agrupan las lecciones de esta clase, en el orden en que las ven los estudiantes. Las carpetas solo ordenan su propia biblioteca de lecciones.',
    fr: "Les unités regroupent les leçons de cette classe, dans l'ordre où les élèves les voient. Les dossiers servent seulement à ranger votre bibliothèque de leçons.",
    de: 'Einheiten gruppieren die Lektionen dieser Klasse, in der Reihenfolge, in der die Schüler sie sehen. Ordner sortieren nur Ihre eigene Lektionsbibliothek.',
    it: "Le unità raggruppano le lezioni di questa classe, nell'ordine in cui le vedono gli studenti. Le cartelle servono solo a ordinare la sua biblioteca delle lezioni.",
    pt: 'As unidades agrupam as aulas desta turma, na ordem em que os alunos as veem. As pastas só organizam a sua própria biblioteca de aulas.',
    nl: "Thema's groeperen de lessen van deze klas, in de volgorde waarin leerlingen ze zien. Mappen ordenen alleen je eigen lessenbibliotheek.",
    ru: 'Разделы группируют уроки этого класса в том порядке, в каком их видят ученики. Папки только упорядочивают вашу библиотеку уроков.',
    ja: '単元は、このクラスのレッスンを生徒に表示される順にまとめます。フォルダーは自分のレッスンライブラリを整理するためだけのものです。',
    'zh-Hant': '單元將這個班級的課程依學生看到的順序分組。資料夾只用來整理你自己的課程庫。',
    ar: 'تجمع الوحدات دروس هذا الفصل بالترتيب الذي يراه الطلاب. أما المجلدات فهي لترتيب مكتبة دروسك فقط.',
    he: 'יחידות מקבצות את השיעורים של הכיתה הזאת, בסדר שבו התלמידים רואים אותם. תיקיות רק מסדרות את ספריית השיעורים שלכם.',
  },
  'lessons.folder.why': {
    en: 'Folders sort your own lesson library, and their lessons can go to any class. Units, on a class page, set the order students see.',
    es: 'Las carpetas ordenan su propia biblioteca de lecciones, y sus lecciones pueden ir a cualquier clase. Las unidades, en la página de una clase, fijan el orden que ven los estudiantes.',
    fr: "Les dossiers rangent votre bibliothèque de leçons, et leurs leçons peuvent aller dans n'importe quelle classe. Les unités, sur la page d'une classe, fixent l'ordre que voient les élèves.",
    de: 'Ordner sortieren Ihre eigene Lektionsbibliothek, und ihre Lektionen können in jede Klasse. Einheiten auf der Seite einer Klasse legen die Reihenfolge fest, die die Schüler sehen.',
    it: "Le cartelle ordinano la sua biblioteca delle lezioni, e le loro lezioni possono andare in qualsiasi classe. Le unità, nella pagina di una classe, decidono l'ordine che vedono gli studenti.",
    pt: 'As pastas organizam a sua própria biblioteca de aulas, e as aulas delas podem ir para qualquer turma. As unidades, na página de uma turma, definem a ordem que os alunos veem.',
    nl: "Mappen ordenen je eigen lessenbibliotheek, en hun lessen kunnen naar elke klas. Thema's, op de pagina van een klas, bepalen de volgorde die leerlingen zien.",
    ru: 'Папки упорядочивают вашу библиотеку уроков, а их уроки можно дать любому классу. Разделы на странице класса задают порядок, который видят ученики.',
    ja: 'フォルダーは自分のレッスンライブラリを整理します。中のレッスンはどのクラスにも使えます。単元はクラスのページで作り、生徒に表示される順番を決めます。',
    'zh-Hant': '資料夾整理你自己的課程庫，裡面的課程可以用在任何班級。單元在班級頁面建立，決定學生看到的順序。',
    ar: 'ترتّب المجلدات مكتبة دروسك، ويمكن أن تذهب دروسها إلى أي فصل. أما الوحدات، في صفحة الفصل، فتحدد الترتيب الذي يراه الطلاب.',
    he: 'תיקיות מסדרות את ספריית השיעורים שלכם, והשיעורים שבהן יכולים ללכת לכל כיתה. יחידות, בדף של כיתה, קובעות את הסדר שהתלמידים רואים.',
  },
  // Was "...are under Manage {school} above": that box is gone; the empty state now has a My school button.
  'school.teach.noneAdminText': {
    en: "Classes you teach show up here. All of {school}'s classes are under My school.",
    es: 'Aquí aparecen las clases que usted da. Todas las clases de {school} están en Mi escuela.',
    fr: 'Les classes où vous enseignez apparaissent ici. Toutes les classes de {school} se trouvent dans Mon école.',
    de: 'Klassen, die Sie unterrichten, erscheinen hier. Alle Klassen von {school} finden Sie unter „Meine Schule“.',
    it: 'Qui compaiono le classi in cui insegna. Tutte le classi di {school} sono in La mia scuola.',
    pt: 'As turmas em que você dá aula aparecem aqui. Todas as turmas de {school} estão em Minha escola.',
    nl: 'Klassen waar je les aan geeft, verschijnen hier. Alle klassen van {school} vind je onder Mijn school.',
    ru: 'Здесь появятся классы, которые вы ведёте. Все классы школы «{school}» есть в разделе «Моя школа».',
    ja: '担当しているクラスはここに表示されます。{school}のすべてのクラスは「マイスクール」で確認できます。',
    'zh-Hant': '你任教的班級會顯示在這裡。{school} 的所有班級都在「我的學校」中。',
    ar: 'تظهر هنا الفصول التي تدرّسها. تجد كل فصول {school} في «مدرستي».',
    he: 'כאן יופיעו הכיתות שאתם מלמדים. כל הכיתות של {school} נמצאות תחת "בית הספר שלי".',
  },
  // The Teacher plan card moved from My classes to the Me page: these said where it was.
  'plans.trial.errors.fixPayment': {
    en: 'Your plan is waiting for a payment. Fix it in Manage billing on your Me page.',
    es: 'Su plan está esperando un pago. Resuélvalo en Administrar facturación, en su página Yo.',
    fr: 'Votre formule attend un paiement. Réglez-le dans Gérer la facturation, sur votre page Moi.',
    de: 'Dein Plan wartet auf eine Zahlung. Kläre das unter „Abrechnung verwalten“ auf deiner Seite „Ich“.',
    it: 'Il tuo piano aspetta un pagamento. Sistemalo in Gestisci fatturazione, nella tua pagina Io.',
    pt: 'Seu plano está esperando um pagamento. Resolva em Gerenciar cobrança, na sua página Eu.',
    nl: 'Je abonnement wacht op een betaling. Los het op via Facturering beheren op je pagina Ik.',
    ru: 'Подписка ждёт оплаты. Решите это в разделе «Управление оплатой» на вашей странице «Я».',
    ja: 'プランのお支払いが保留中です。「マイページ」の「お支払いの管理」で解決してください。',
    'zh-Hant': '你的方案正在等待付款。請到「我的」頁面的「管理帳務」處理。',
    ar: 'باقتك تنتظر دفعة. عالج ذلك من «إدارة الفوترة» في صفحة «أنا».',
    he: 'התוכנית שלך מחכה לתשלום. אפשר לטפל בזה ב„ניהול חיובים” בעמוד „אני”.',
  },
  'plans.trial.thanks.slow': {
    en: 'This is taking longer than usual. Your plan will show on your Me page in a minute.',
    es: 'Esto tarda más de lo normal. Su plan aparecerá en su página Yo en un minuto.',
    fr: 'Cela prend plus de temps que d’habitude. Votre formule apparaîtra sur votre page Moi d’ici une minute.',
    de: 'Das dauert länger als sonst. Dein Plan erscheint in einer Minute auf deiner Seite „Ich“.',
    it: 'Ci vuole più del solito. Il tuo piano comparirà nella tua pagina Io tra un minuto.',
    pt: 'Está demorando mais que o normal. Seu plano vai aparecer na sua página Eu em um minuto.',
    nl: 'Dit duurt langer dan normaal. Je abonnement verschijnt over een minuut op je pagina Ik.',
    ru: 'Это занимает больше времени, чем обычно. Подписка появится на вашей странице «Я» через минуту.',
    ja: 'いつもより時間がかかっています。1分ほどで「マイページ」にプランが表示されます。',
    'zh-Hant': '這比平常久一點。你的方案一分鐘內會出現在「我的」頁面。',
    ar: 'يستغرق هذا وقتًا أطول من المعتاد. ستظهر باقتك في صفحة «أنا» خلال دقيقة.',
    he: 'זה לוקח יותר זמן מהרגיל. התוכנית תופיע בעמוד „אני” בעוד דקה.',
  },
  'plans.trial.thanks.back': {
    en: 'Go to my Teacher plan', es: 'Ir a mi plan Docente', fr: 'Aller à ma formule Enseignant', de: 'Zu meinem Lehrkraft-Abo',
    it: 'Vai al mio piano Insegnante', pt: 'Ir para meu plano Professor', nl: 'Naar mijn Leerkracht-abonnement', ru: 'К моей подписке «Учительская»',
    ja: '自分の教員プランへ', 'zh-Hant': '前往我的教師方案', ar: 'انتقل إلى باقة المعلّم الخاصة بي', he: 'לתוכנית המורה שלי',
  },
};
const NOTES = {
  'teach.home.allClasses': 'Back link on a class page for a teacher with only one class (My classes opens that class directly): goes to the list of their classes, where "New class" is. Short.',
  'me.tiles.school': 'Tile on the Me page for a school admin: opens the school pages where they manage their school. Short, like "My classes" beside it.',
  'me.tiles.asks': 'Small line under the "My school" tile: how many teachers asked the admin for a Teacher plan. {count} = number of teachers.',
  'plans.trial.card.schoolBilling': "Button on the Me page's Teacher plan card for a school admin whose plan is a seat from their school: opens the school's Billing tab.",
  'plans.trial.card.seatNote': "Teacher plan card on the Me page, for a teacher whose plan is a seat their school pays for: they can't change it, their school's admins do. {school} = the school's name.",
  'plans.trial.card.seePlans': 'Button on the Me page\'s Teacher plan card for a teacher without a plan: opens the plans page (prices are only there).',
  'lessons.class.unitWhy': "One line under the class page's buttons (New unit): what a unit is, and how it differs from a folder of the lesson library. Units are part of one class and students see them; folders are only the teacher's.",
  'lessons.folder.why': "One line under the lesson library's buttons (New folder): what a folder is, and how it differs from a class's unit. Folders are only the teacher's and reusable across classes; units belong to one class and set what students see.",
};
const REMOVE = ['teach.home.courses', 'teach.home.live', 'teach.home.breaks', 'teach.home.breaksText', 'teach.home.allGames', 'school.teach.manage', 'quickLive.card', 'home.rails.openLearn', 'school.teach.plan.none', 'school.teach.plan.setUp', 'school.teach.plan.on', 'school.teach.plan.billing', 'school.teach.plan.settling', 'plans.trial.card.try'];

const dir = new URL('../server/i18n/', import.meta.url);
const set = (o, key, v) => { const p = key.split('.'); let x = o; for (const k of p.slice(0, -1)) x = x[k] ??= {}; x[p.at(-1)] = v; };
const del = (o, key) => { const p = key.split('.'); let x = o; for (const k of p.slice(0, -1)) { x = x?.[k]; if (!x) return; } delete x[p.at(-1)]; };
for (const f of fs.readdirSync(new URL('locales/', dir))) {
  const code = f.replace(/\.json$/, ''); const p = new URL(`locales/${f}`, dir);
  const j = JSON.parse(fs.readFileSync(p, 'utf8'));
  for (const k of REMOVE) del(j, k);
  for (const [k, by] of Object.entries(W)) if (by[code]) set(j, k, by[code]);
  fs.writeFileSync(p, JSON.stringify(j, null, 2) + '\n');
  console.log('✓', f);
}
const np = new URL('notes.json', dir);
const notes = JSON.parse(fs.readFileSync(np, 'utf8'));
for (const k of Object.keys(notes)) if (REMOVE.some(r => k === r || k.startsWith(`${r}.`))) delete notes[k];
Object.assign(notes, NOTES);
fs.writeFileSync(np, JSON.stringify(notes, null, 2) + '\n');
console.log('✓ notes.json');
