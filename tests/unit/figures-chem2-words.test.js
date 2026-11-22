// The Builder's figure words (server/builder/figures.js) for the 1.5.0 chemistry kinds, in all 12 site languages:
// skeletal and structural formulas, organic chemistry and its families and functional groups, and atomic energy levels
// with electron transitions call for the FIGURE RULES; everyday words that only look alike (the skeletal system, organic
// food, a game's energy levels, a skeleton costume, a slide transition) do not.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
const { FIGURE_WORDS, figureWords } = await import('../../server/builder/figures.js');
const S = {
  en: ['skeletal formula of butane', 'draw the structural formula', 'condensed formulas', 'organic chemistry quiz', 'naming alkanes and alkenes', 'functional groups', 'hydrocarbons', 'atomic energy levels', 'energy level diagram for hydrogen', 'electron transitions', 'the Balmer series'],
  es: ['fórmula esquelética', 'fórmulas estructurales', 'química orgánica', 'hidrocarburos', 'alcanos y alquenos', 'grupos funcionales', 'niveles de energía del átomo', 'diagrama de niveles de energía', 'transiciones electrónicas', 'serie de Balmer'],
  fr: ['formule topologique', 'formule développée', 'chimie organique', 'hydrocarbures', 'alcanes', 'groupes fonctionnels', "niveaux d'énergie de l'atome", "diagramme des niveaux d'énergie", 'transitions électroniques', 'série de Balmer'],
  de: ['Skelettformel', 'Strukturformel', 'organische Chemie', 'Kohlenwasserstoffe', 'Alkane und Alkene', 'funktionelle Gruppen', 'Energieniveaus des Wasserstoffatoms', 'Energieniveauschema', 'Elektronenübergänge', 'Balmer-Serie'],
  it: ['formula scheletrica', 'formule di struttura', 'chimica organica', 'idrocarburi', 'alcani e alcheni', 'gruppi funzionali', "livelli di energia dell'atomo", 'diagramma dei livelli energetici', 'transizioni elettroniche', 'serie di Balmer'],
  pt: ['fórmula esquelética', 'fórmulas estruturais', 'química orgânica', 'hidrocarbonetos', 'alcanos e alcenos', 'grupos funcionais', 'níveis de energia do átomo', 'diagrama de níveis de energia', 'transições eletrônicas', 'série de Balmer'],
  nl: ['skeletformule', 'structuurformule', 'organische chemie', 'koolwaterstoffen', 'alkanen en alkenen', 'functionele groepen', 'energieniveaus van het waterstofatoom', 'energieniveauschema', 'elektronenovergangen', 'Balmerreeks'],
  ru: ['скелетная формула', 'структурные формулы', 'органическая химия', 'углеводороды', 'алканы и алкены', 'функциональные группы', 'энергетические уровни атома', 'диаграмма энергетических уровней', 'переходы электрона', 'серия Бальмера'],
  ja: ['骨格構造式', '構造式', '有機化学', '炭化水素', 'アルカンとアルケン', '官能基', '水素原子のエネルギー準位', '電子の遷移', 'バルマー系列'],
  'zh-Hant': ['鍵線式', '結構式', '有機化學', '碳氫化合物', '烷類與烯類', '官能基', '氫原子的能階', '電子躍遷', '巴耳末系'],
  ar: ['الصيغة الهيكلية', 'الصيغة البنائية', 'الكيمياء العضوية', 'الهيدروكربونات', 'الألكانات والألكينات', 'المجموعات الوظيفية', 'مستويات الطاقة في الذرة', 'انتقالات الإلكترون', 'متسلسلة بالمر'],
  he: ['נוסחת שלד', 'נוסחת מבנה', 'כימיה אורגנית', 'פחמימנים', 'אלקנים', 'קבוצות פונקציונליות', 'רמות אנרגיה באטום', 'מעברי אלקטרונים', 'סדרת באלמר'],
};
const NEG = {
  en: ['the skeletal system of the human body', 'organic food at the farm market', 'energy levels in my platformer', 'a skeleton costume', 'a slide transition between levels', 'an alcohol awareness talk'],
  es: ['sistema esquelético', 'comida orgánica'], fr: ['système squelettique', 'nourriture bio'], de: ['Skelett des Menschen', 'Bio-Lebensmittel', 'auf dem Balken turnen'], it: ['sistema scheletrico', 'cibo biologico'],
  pt: ['sistema esquelético', 'comida orgânica'], nl: ['het skelet van de mens', 'biologisch eten'], ru: ['скелет человека', 'органическая еда'], ja: ['人間の骨格', '有機野菜'], 'zh-Hant': ['人體骨骼', '有機蔬菜'],
  ar: ['الهيكل العظمي', 'طعام عضوي'], he: ['שלד האדם', 'מזון אורגני'],
};
test('the 1.5.0 chemistry kinds are named in every site language', () => {
  assert.equal(Object.keys(S).length, 12);
  for (const [l, xs] of Object.entries(S)) for (const x of xs) { assert.ok(FIGURE_WORDS[l].test(x), `${l}: ${x}`); assert.ok(figureWords(x), x); }
});
test('and nothing that only looks like them, in any language', () => {
  for (const xs of Object.values(NEG)) for (const x of xs) assert.ok(!figureWords(x), x);
});
