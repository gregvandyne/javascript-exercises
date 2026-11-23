// The Builder's figure words (server/builder/figures.js) for the 1.6.0 chemistry kinds, in all 12 site languages:
// chromatography, galvanic cells and salt bridges, phase diagrams, bond energy curves, chemical equilibrium and Le
// Chatelier, rate laws and reaction order, VSEPR shapes and bond angles call for the FIGURE RULES; everyday words that
// only look alike (a market's or a balance's equilibrium, a curve's critical point, a body's cells, the order of
// operations, the moon's phases) do not. The template drafter knows the topics too (services/figures.js KEYWORDS).
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
const { FIGURE_WORDS, figureWords } = await import('../../server/builder/figures.js');
const F = await import('../../server/services/figures.js');
const S = {
  en: ['paper chromatography and Rf values', 'a galvanic cell with a salt bridge', 'the phase diagram of water', 'triple point', 'a bond energy curve', 'Le Chatelier and chemical equilibrium', 'rate laws and reaction order', 'VSEPR shapes', 'bond angles and lone pairs'],
  es: ['cromatografía en papel', 'pila galvánica', 'puente salino', 'diagrama de fases', 'punto triple', 'equilibrio químico', 'ley de velocidad', 'geometría molecular', 'ángulos de enlace'],
  fr: ['chromatographie sur papier', 'pile galvanique', 'pont salin', 'diagramme de phases', 'point triple', 'équilibre chimique', 'loi de vitesse', 'géométrie moléculaire', 'angles de liaison'],
  de: ['Papierchromatografie', 'galvanische Zelle', 'Salzbrücke', 'Phasendiagramm', 'Tripelpunkt', 'chemisches Gleichgewicht', 'Geschwindigkeitsgesetz', 'Molekülgeometrie', 'Bindungswinkel'],
  it: ['cromatografia su carta', 'pila galvanica', 'ponte salino', 'diagramma di stato', 'punto triplo', 'equilibrio chimico', 'legge cinetica', 'geometria molecolare', 'angoli di legame'],
  pt: ['cromatografia em papel', 'pilha galvânica', 'ponte salina', 'diagrama de fases', 'ponto triplo', 'equilíbrio químico', 'lei de velocidade', 'geometria molecular', 'ângulos de ligação'],
  nl: ['papierchromatografie', 'galvanische cel', 'zoutbrug', 'fasediagram', 'tripelpunt', 'chemisch evenwicht', 'snelheidsvergelijking', 'VSEPR', 'bindingshoek'],
  ru: ['бумажная хроматография', 'гальванический элемент', 'солевой мостик', 'фазовая диаграмма', 'тройная точка', 'химическое равновесие', 'кинетическое уравнение', 'геометрия молекул', 'валентный угол'],
  ja: ['ペーパークロマトグラフィー', 'ダニエル電池', '塩橋', '状態図', '三重点', '化学平衡', '反応速度式', '分子の形', '結合角'],
  'zh-Hant': ['紙層析', '鹽橋', '相圖', '三相點', '化學平衡', '速率定律', '分子形狀', '鍵角', '孤對電子'],
  ar: ['الكروماتوغرافيا الورقية', 'الخلية الجلفانية', 'القنطرة الملحية', 'مخطط الطور', 'النقطة الثلاثية', 'الاتزان الكيميائي', 'قانون السرعة', 'زاوية الرابطة', 'الأزواج الحرة'],
  he: ['כרומטוגרפיה על נייר', 'תא גלווני', 'גשר מלח', 'דיאגרמת פאזות', 'נקודה משולשת', 'שיווי משקל כימי', 'חוק הקצב', 'זווית קשר', 'זוגות אלקטרונים לא קושרים'],
};
const NEG = {
  en: ['the market reaches equilibrium', 'the critical point of f(x)', 'a cell in the human body', 'the order of operations', 'the phases of the moon', 'salt and pepper', 'a bond between friends'],
  es: ['el orden de las operaciones', 'las fases de la luna'], fr: ['l\'ordre des opérations', 'les phases de la lune'], de: ['die Phasen des Mondes', 'Reihenfolge der Rechenarten'],
  it: ['le fasi della luna', 'l\'ordine delle operazioni'], pt: ['as fases da lua', 'a ordem das operações'], nl: ['de fasen van de maan', 'volgorde van bewerkingen'],
  ru: ['фазы луны', 'порядок действий'], ja: ['月の満ち欠け', '計算の順序'], 'zh-Hant': ['月相', '運算順序'], ar: ['أطوار القمر', 'ترتيب العمليات'], he: ['מופעי הירח', 'סדר פעולות חשבון'],
};
test('the 1.6.0 chemistry kinds are named in every site language', () => {
  assert.equal(Object.keys(S).length, 12);
  for (const [l, xs] of Object.entries(S)) for (const x of xs) { assert.ok(FIGURE_WORDS[l].test(x), `${l}: ${x}`); assert.ok(figureWords(x), x); }
});
test('and nothing that only looks like them, in any language', () => {
  for (const xs of Object.values(NEG)) for (const x of xs) assert.ok(!figureWords(x), x);
});
test('the template drafter deals the new kinds for their topics', () => {
  const want = { 'paper chromatography': 'chromatography', 'galvanic cells': 'galvanicCell', 'phase diagrams': 'phaseDiagram', 'bond energy': 'bondEnergy', 'Le Chatelier\'s principle': 'equilibrium', 'rate laws': 'rateLaw', 'VSEPR shapes': 'vsepr' };
  for (const [topic, kind] of Object.entries(want)) {
    const items = F.templateTest({ topic, subject: 'chem', count: 4 });
    assert.ok(items.length && items.every(i => i.kind === kind), `${topic}: ${items.map(i => i.kind).join(', ')}`);
  }
});
