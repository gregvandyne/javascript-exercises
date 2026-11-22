// The Builder's figure words (server/builder/figures.js) for the 1.4.0 economics kinds, in all 12 site languages: supply
// and demand, price controls and surplus, the money markets, the business cycle, the Phillips curve, production
// possibilities and comparative advantage, AD-AS and the output gaps, and the firm's cost curves call for the FIGURE
// RULES; everyday words that only look alike (school supplies, a market day, a balloon's inflation, a bike race's cycle,
// a field trip's cost, a phone's price) do not. A kit topic stays a Canvas activity (plan.js), whatever the words.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
const { FIGURE_WORDS, figureWords } = await import('../../server/builder/figures.js');
const S = {
  en: ['supply and demand', 'a demand curve shifts', 'price ceilings', 'consumer surplus', 'deadweight loss of a tax', 'the money market', 'loanable funds', 'the business cycle', 'the Phillips curve', 'production possibilities curve', 'comparative advantage', 'aggregate demand and aggregate supply', 'AD-AS model', 'recessionary gap', 'marginal cost and average total cost', 'profit-maximizing monopoly'],
  es: ['oferta y demanda', 'curva de demanda', 'precio máximo', 'excedente del consumidor', 'mercado de dinero', 'fondos prestables', 'ciclo económico', 'curva de Phillips', 'posibilidades de producción', 'ventaja comparativa', 'demanda agregada', 'costo marginal'],
  fr: ["l'offre et la demande", "courbe d'offre", 'prix plafond', 'surplus du consommateur', 'marché monétaire', 'fonds prêtables', 'cycle économique', 'courbe de Phillips', 'possibilités de production', 'avantage comparatif', 'demande globale', 'coût marginal'],
  de: ['Angebot und Nachfrage', 'Nachfragekurve', 'Höchstpreis', 'Konsumentenrente', 'Geldmarkt', 'leihbare Mittel', 'Konjunkturzyklus', 'Phillips-Kurve', 'Produktionsmöglichkeitenkurve', 'komparativer Vorteil', 'gesamtwirtschaftliche Nachfrage', 'Grenzkosten'],
  it: ['domanda e offerta', 'curva di domanda', 'prezzo massimo', 'surplus del consumatore', 'mercato monetario', 'fondi mutuabili', 'ciclo economico', 'curva di Phillips', 'possibilità di produzione', 'vantaggio comparato', 'domanda aggregata', 'costo marginale'],
  pt: ['oferta e procura', 'curva de procura', 'preço máximo', 'excedente do consumidor', 'mercado monetário', 'fundos emprestáveis', 'ciclo económico', 'curva de Phillips', 'possibilidades de produção', 'vantagem comparativa', 'demanda agregada', 'custo marginal'],
  nl: ['vraag en aanbod', 'vraagcurve', 'maximumprijs', 'consumentensurplus', 'geldmarkt', 'conjunctuurcyclus', 'Phillipscurve', 'productiemogelijkhedencurve', 'comparatief voordeel', 'geaggregeerde vraag', 'marginale kosten'],
  ru: ['спрос и предложение', 'кривая спроса', 'потолок цен', 'излишек потребителя', 'денежный рынок', 'рынок заёмных средств', 'экономический цикл', 'кривая Филлипса', 'кривая производственных возможностей', 'сравнительное преимущество', 'совокупный спрос', 'предельные издержки'],
  ja: ['需要と供給', '需要曲線', '上限価格', '消費者余剰', '貨幣市場', '貸付資金', '景気循環', 'フィリップス曲線', '生産可能性フロンティア', '比較優位', '総需要', '限界費用'],
  'zh-Hant': ['供給與需求', '需求曲線', '價格上限', '消費者剩餘', '貨幣市場', '可貸資金', '景氣循環', '菲利普曲線', '生產可能曲線', '比較利益', '總需求', '邊際成本'],
  ar: ['العرض والطلب', 'منحنى الطلب', 'سقف السعر', 'فائض المستهلك', 'سوق النقود', 'الأموال القابلة للإقراض', 'الدورة الاقتصادية', 'منحنى فيليبس', 'إمكانيات الإنتاج', 'الميزة النسبية', 'الطلب الكلي', 'التكلفة الحدية'],
  he: ['היצע וביקוש', 'עקומת ביקוש', 'מחיר מקסימום', 'עודף צרכן', 'שוק הכסף', 'מחזור עסקים', 'עקומת פיליפס', 'אפשרויות ייצור', 'יתרון יחסי', 'ביקוש מצרפי', 'עלות שולית'],
};
const NEG = {
  en: ['school supplies list', 'a market day for the class', 'balloon inflation experiment', 'a bike race cycle game', 'the cost of a field trip', 'the price of a phone', 'a supply drop in my shooter game', 'customer demand for pizza'],
  es: ['útiles escolares', 'día de mercado'], fr: ['fournitures scolaires', 'jour de marché'], de: ['Schulsachen kaufen', 'Wochenmarkt'], it: ['materiale scolastico', 'giorno di mercato'],
  pt: ['material escolar', 'dia de feira'], nl: ['schoolspullen', 'marktdag'], ru: ['школьные принадлежности', 'рыночный день'], ja: ['文房具を買う', '市場の日'], 'zh-Hant': ['文具清單', '市集日'],
  ar: ['أدوات مدرسية', 'يوم السوق'], he: ['ציוד לבית הספר', 'יום שוק'],
};
test('the economics kinds are named in every site language', () => {
  assert.equal(Object.keys(S).length, 12);
  for (const [l, xs] of Object.entries(S)) for (const x of xs) { assert.ok(FIGURE_WORDS[l].test(x), `${l}: ${x}`); assert.ok(figureWords(x), x); }
});
test('and nothing that only looks like them, in any language', () => {
  for (const xs of Object.values(NEG)) for (const x of xs) assert.ok(!figureWords(x), x);
});
