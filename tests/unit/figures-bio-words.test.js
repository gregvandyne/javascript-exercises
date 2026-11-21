// The Builder's figure words (server/builder/figures.js) for the 1.3.0 biology kinds and the micropipette, in all 12
// site languages: population growth, predator and prey, enzyme activity, the rate of photosynthesis, a Punnett square,
// a pedigree chart, protein synthesis, gel electrophoresis, osmosis call for the FIGURE RULES; everyday words that only
// look alike (a city's population, a dog's pedigree, a family tree in history, translating a language, hair gel, an
// idea that spreads) do not. A kit topic stays a Canvas activity (plan.js), whatever the words.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
const { FIGURE_WORDS, figureWords } = await import('../../server/builder/figures.js');
const S = {
  en: ['population growth of yeast', 'carrying capacity', 'predator-prey cycles', 'enzyme activity and pH', 'rate of photosynthesis', 'limiting factors', 'Punnett squares', 'dihybrid cross', 'genotypes and phenotypes', 'pedigree charts', 'protein synthesis', 'mRNA codons', 'gel electrophoresis', 'osmosis in red blood cells', 'hypertonic solutions', 'reading a micropipette'],
  es: ['crecimiento de la población', 'capacidad de carga', 'depredadores y presas', 'actividad enzimática', 'tasa de fotosíntesis', 'cuadro de Punnett', 'genotipos', 'patrón de herencia', 'síntesis de proteínas', 'electroforesis en gel', 'ósmosis', 'solución hipertónica', 'micropipeta'],
  fr: ['croissance de la population', 'capacité de charge', 'prédateurs-proies', 'activité enzymatique', 'vitesse de photosynthèse', 'échiquier de croisement', 'génotypes', 'mode de transmission', 'synthèse des protéines', 'électrophorèse', 'osmose', 'solution hypertonique', 'micropipette'],
  de: ['Populationswachstum', 'Umweltkapazität', 'Räuber-Beute-Beziehung', 'Enzymaktivität', 'Fotosyntheserate', 'Kreuzungsschema', 'Genotyp', 'Erbgang', 'Proteinbiosynthese', 'Gelelektrophorese', 'Osmose', 'hypertonische Lösung', 'Mikropipette'],
  it: ['crescita della popolazione', 'capacità portante', 'predatore-preda', 'attività enzimatica', 'velocità della fotosintesi', 'quadrato di Punnett', 'genotipi', 'sintesi proteica', 'elettroforesi', 'osmosi', 'soluzione ipertonica', 'micropipetta'],
  pt: ['crescimento populacional', 'capacidade de suporte', 'predador-presa', 'atividade enzimática', 'taxa de fotossíntese', 'quadro de Punnett', 'genótipos', 'heredograma', 'síntese de proteínas', 'eletroforese', 'osmose', 'solução hipertônica', 'micropipeta'],
  nl: ['populatiegroei', 'roofdier-prooi', 'enzymactiviteit', 'fotosynthesesnelheid', 'kruisingsschema', 'genotype', 'overervingspatroon', 'eiwitsynthese', 'gelelektroforese', 'osmose', 'hypertone oplossing', 'micropipet'],
  ru: ['рост популяции', 'ёмкость среды', 'хищники и жертвы', 'активность фермента', 'скорость фотосинтеза', 'решётка Пеннета', 'генотип', 'тип наследования', 'синтез белка', 'электрофорез', 'осмос', 'гипертонический раствор', 'микропипетка'],
  ja: ['個体群の成長', '環境収容力', '捕食者と被食者', '酵素のはたらき', '光合成速度', 'パネットの方形', '遺伝子型', '伴性遺伝', 'タンパク質合成', '電気泳動', '浸透圧', '高張液', 'マイクロピペット'],
  'zh-Hant': ['族群成長', '環境承載量', '掠食者與獵物', '酵素活性', '光合作用速率', '龐尼特方格', '基因型', '譜系圖', '蛋白質合成', '凝膠電泳', '滲透作用', '高張溶液', '微量吸管'],
  ar: ['نمو الجماعة', 'السعة الحاملة', 'المفترس والفريسة', 'نشاط الإنزيم', 'معدل البناء الضوئي', 'مربع بانيت', 'الطرز الجينية', 'نمط الوراثة', 'بناء البروتين', 'الفصل الكهربائي للحمض النووي', 'الخاصية الأسموزية', 'محلول مفرط التوتر', 'ماصة دقيقة'],
  he: ['גידול אוכלוסייה', 'כושר נשיאה', 'טורף ונטרף', 'פעילות אנזים', 'קצב הפוטוסינתזה', 'ריבוע פאנט', 'גנוטיפ', 'דפוס תורשה', 'סינתזת חלבון', 'אלקטרופורזה', 'אוסמוזה', 'תמיסה היפרטונית', 'מיקרופיפטה'],
};
const NEG = {
  en: ['the population of Paris', 'a pedigree dog show', 'the family tree of the Tudors', 'a translation game for Spanish words', 'hair gel and shampoo', 'a growth mindset quiz', 'the music genre quiz'],
  es: ['la población de México', 'traducción al inglés', 'árbol de la familia real'], fr: ['la population de Paris', 'traduction en anglais'], de: ['Stammbaum der Familie', 'Übersetzung ins Englische', 'Bevölkerung von Berlin'],
  it: ['la popolazione di Roma', 'traduzione in inglese'], pt: ['a população do Brasil', 'tradução para inglês'], nl: ['de bevolking van Amsterdam', 'vertaling naar het Engels'],
  ru: ['население Москвы', 'перевод на английский'], ja: ['考えが社会に広まる', '人口の多い町'], 'zh-Hant': ['城市人口', '翻譯練習'], ar: ['سكان القاهرة', 'ترجمة إلى الإنجليزية'], he: ['אוכלוסיית תל אביב', 'תרגום לאנגלית'],
};
test('the biology kinds are named in every site language', () => {
  assert.equal(Object.keys(S).length, 12);
  for (const [l, xs] of Object.entries(S)) for (const x of xs) { assert.ok(FIGURE_WORDS[l].test(x), `${l}: ${x}`); assert.ok(figureWords(x), x); }
});
test('and nothing that only looks like them, in any language', () => {
  for (const xs of Object.values(NEG)) for (const x of xs) assert.ok(!figureWords(x), x);
});
