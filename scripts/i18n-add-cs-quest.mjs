// CS Quest platform slice: the site words under cs.* (docs/cs-quest.md), merged into every locale file (the keys are
// added or replaced at the end of each file; nothing else changes). Safe to re-run. Precedent: i18n-add-live-wyr-atlas.mjs.
// The curriculum owner appends its own cs.* blocks the same way (keys never overlap: step.*, review.* are this script's).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '../server/i18n/locales');
const W = {
  en: {
    step: { hostedLive: 'Your teacher hosts this live' },
    review: { rubric: 'Rubric marks', notMarked: 'Not marked', marksTitle: 'Rubric marks: {marks}', alsoMark: 'Also mark these teammates',
      alsoMarkHint: 'They get the same rubric marks on this step. Your written feedback stays with this student.', noHandIns: 'Nothing handed in yet.' },
  },
  es: {
    step: { hostedLive: 'Tu profe dirige esto en vivo' },
    review: { rubric: 'Notas de la rúbrica', notMarked: 'Sin nota', marksTitle: 'Notas de la rúbrica: {marks}', alsoMark: 'Poner la misma nota a estos compañeros de equipo',
      alsoMarkHint: 'Reciben las mismas notas de rúbrica en este paso. Tu comentario escrito se queda solo con este alumno.', noHandIns: 'Todavía nadie ha entregado nada.' },
  },
  fr: {
    step: { hostedLive: 'Ton enseignant anime ceci en direct' },
    review: { rubric: 'Notes de la grille', notMarked: 'Non noté', marksTitle: 'Notes de la grille : {marks}', alsoMark: 'Noter aussi ces coéquipiers',
      alsoMarkHint: 'Ils reçoivent les mêmes notes de grille pour cette étape. Le commentaire écrit reste avec cet élève.', noHandIns: 'Rien n’a encore été rendu.' },
  },
  de: {
    step: { hostedLive: 'Deine Lehrkraft spielt das live mit der Klasse' },
    review: { rubric: 'Bewertung nach Raster', notMarked: 'Nicht bewertet', marksTitle: 'Raster-Bewertung: {marks}', alsoMark: 'Diese Teammitglieder genauso bewerten',
      alsoMarkHint: 'Sie bekommen bei diesem Schritt dieselbe Raster-Bewertung. Die schriftliche Rückmeldung bleibt bei diesem Kind.', noHandIns: 'Noch nichts abgegeben.' },
  },
  it: {
    step: { hostedLive: 'L’insegnante guida questa attività dal vivo' },
    review: { rubric: 'Voti della griglia', notMarked: 'Non valutato', marksTitle: 'Voti della griglia: {marks}', alsoMark: 'Dai gli stessi voti a questi compagni di squadra',
      alsoMarkHint: 'Ricevono gli stessi voti della griglia per questo passaggio. Il commento scritto resta a questo studente.', noHandIns: 'Nessuna consegna per ora.' },
  },
  pt: {
    step: { hostedLive: 'Seu professor conduz isto ao vivo' },
    review: { rubric: 'Notas da rubrica', notMarked: 'Sem nota', marksTitle: 'Notas da rubrica: {marks}', alsoMark: 'Dar a mesma nota a estes colegas de equipe',
      alsoMarkHint: 'Eles recebem as mesmas notas de rubrica nesta etapa. O comentário escrito fica só com este aluno.', noHandIns: 'Nada entregue ainda.' },
  },
  nl: {
    step: { hostedLive: 'Je leerkracht speelt dit live met de klas' },
    review: { rubric: 'Rubriekscores', notMarked: 'Niet beoordeeld', marksTitle: 'Rubriekscores: {marks}', alsoMark: 'Geef deze teamgenoten dezelfde score',
      alsoMarkHint: 'Zij krijgen dezelfde rubriekscores voor deze stap. Je geschreven feedback blijft bij deze leerling.', noHandIns: 'Nog niets ingeleverd.' },
  },
  ru: {
    step: { hostedLive: 'Учитель проводит это вживую' },
    review: { rubric: 'Оценки по критериям', notMarked: 'Не оценено', marksTitle: 'Оценки по критериям: {marks}', alsoMark: 'Поставить те же оценки этим участникам команды',
      alsoMarkHint: 'Они получат те же оценки по критериям за этот шаг. Ваш письменный отзыв останется только у этого ученика.', noHandIns: 'Пока ничего не сдано.' },
  },
  ja: {
    step: { hostedLive: '先生がライブで進めます' },
    review: { rubric: 'ルーブリック評価', notMarked: '未評価', marksTitle: 'ルーブリック評価: {marks}', alsoMark: 'このチームメイトにも同じ評価をつける',
      alsoMarkHint: 'このステップで同じルーブリック評価がつきます。書いたフィードバックはこの生徒だけに届きます。', noHandIns: 'まだ提出はありません。' },
  },
  'zh-Hant': {
    step: { hostedLive: '老師會在課堂上即時主持這一關' },
    review: { rubric: '評量表分數', notMarked: '未評分', marksTitle: '評量表分數：{marks}', alsoMark: '也為這些隊友打同樣的分數',
      alsoMarkHint: '他們在這個步驟會得到相同的評量表分數。你寫的回饋只會給這位學生。', noHandIns: '還沒有人繳交。' },
  },
  he: {
    step: { hostedLive: 'המורה מנחה את זה בשידור חי' },
    review: { rubric: 'ציוני מחוון', notMarked: 'לא נבדק', marksTitle: 'ציוני מחוון: {marks}', alsoMark: 'לתת את אותם ציונים גם לחברי הצוות האלה',
      alsoMarkHint: 'הם יקבלו את אותם ציוני מחוון בשלב הזה. המשוב הכתוב נשאר אצל התלמיד הזה בלבד.', noHandIns: 'עדיין לא הוגש דבר.' },
  },
  ar: {
    step: { hostedLive: 'معلّمك يدير هذا مباشرةً مع الصف' },
    review: { rubric: 'درجات المعايير', notMarked: 'غير مقيَّم', marksTitle: 'درجات المعايير: {marks}', alsoMark: 'امنح زملاء الفريق هؤلاء الدرجات نفسها',
      alsoMarkHint: 'يحصلون على درجات المعايير نفسها في هذه الخطوة. يبقى تعليقك المكتوب لهذا الطالب فقط.', noHandIns: 'لم يُسلَّم شيء بعد.' },
  },
};
W['en-GB'] = W.en;   // no spelling differences in these strings

const files = fs.readdirSync(DIR).filter(f => f.endsWith('.json'));
for (const f of files) {
  const code = f.replace(/\.json$/, '');
  const w = W[code];
  if (!w) throw new Error(`no words for ${code}`);
  const p = path.join(DIR, f);
  const j = JSON.parse(fs.readFileSync(p, 'utf8'));
  // cs.* goes at the end of the file; other owners' cs.* blocks (added later, by key) are kept.
  const cs = j.cs || {}; delete j.cs;
  j.cs = { ...cs, step: { ...(cs.step || {}), ...w.step }, review: { ...(cs.review || {}), ...w.review } };
  fs.writeFileSync(p, JSON.stringify(j, null, 2) + '\n');
  console.log('✓', f);
}
