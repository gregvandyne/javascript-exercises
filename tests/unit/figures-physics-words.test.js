// The Builder's figure words (server/builder/figures.js) for the 1.1.0 physics kinds, in all 12 site languages: a
// projectile, waves, a motion map, a vernier caliper, a micrometer, a plane mirror call for the FIGURE RULES; everyday
// words that only look alike (a heat wave, a space game's projectiles, a micrometer as a unit, a gun's caliber) do not.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
const { FIGURE_WORDS, figureWords } = await import('../../server/builder/figures.js');
const S = {
  en: ['projectile motion of a ball', 'transverse and longitudinal waves', 'a motion map of a cart', 'read a vernier caliper', 'micrometer screw gauge reading', 'plane mirror image', 'series-parallel resistor network', 'wavelength and amplitude'],
  es: ['movimiento de proyectiles', 'ondas transversales', 'diagrama de movimiento', 'calibre vernier', 'tornillo micrométrico', 'espejo plano', 'longitud de onda'],
  fr: ['mouvement d\'un projectile', 'ondes transversales', 'chronophotographie', 'pied à coulisse', 'palmer', 'miroir plan', 'longueur d\'onde'],
  de: ['Wurfbewegung', 'Transversalwelle', 'Bewegungsdiagramm', 'Messschieber', 'Bügelmessschraube', 'ebener Spiegel', 'Wellenlänge'],
  it: ['moto del proiettile', 'onde trasversali', 'diagramma del moto', 'calibro a nonio', 'vite micrometrica', 'specchio piano', 'lunghezza d\'onda'],
  pt: ['movimento de projéteis', 'ondas transversais', 'diagrama de movimento', 'paquímetro', 'lançamento oblíquo', 'espelho plano', 'comprimento de onda'],
  nl: ['kogelbaan', 'transversale golf', 'bewegingsdiagram', 'schuifmaat', 'schroefmicrometer', 'vlakke spiegel', 'golflengte'],
  ru: ['движение тела, брошенного под углом', 'поперечная волна', 'диаграмма движения', 'штангенциркуль', 'плоское зеркало', 'длина волны'],
  ja: ['放物運動', '横波と縦波', '運動図', 'ノギス', 'マイクロメーター', '平面鏡', '波長'],
  'zh-Hant': ['拋體運動', '橫波與縱波', '運動圖', '游標卡尺', '分厘卡', '平面鏡', '波長'],
  ar: ['حركة المقذوفات', 'الموجات المستعرضة', 'مخطط الحركة', 'القدمة ذات الورنية', 'قراءة الميكرومتر', 'المرآة المستوية', 'الطول الموجي'],
  he: ['תנועה בליסטית', 'גלים רוחביים', 'מפת תנועה', 'קליבר', 'קריאת מיקרומטר', 'מראה מישורית', 'אורך גל'],
};
const NEG = { en: ['a space shooter with projectiles', 'cells are 10 micrometers wide', 'heat wave in summer', 'wave goodbye to friends', 'a map of Europe', 'make a projector slideshow'], es: ['un micrómetro es muy pequeño', 'un juego de proyectiles', 'calibre de un arma', 'ola de calor', 'mapa de Europa'], fr: ['vague de chaleur', 'carte de France'], de: ['Hitzewelle im Sommer', 'Landkarte'], it: ['un micrometro è piccolo', 'ondata di caldo', 'mappa'], pt: ['onda de calor', 'mapa'], nl: ['hittegolf', 'landkaart'], ru: ['клетка размером 10 микрометров', 'волна жары', 'карта мира'], ja: ['熱波', '世界地図'], 'zh-Hant': ['熱浪', '世界地圖'], ar: ['موجة حر', 'خريطة العالم'], he: ['גל חום', 'מפת העולם'] };

test('the new physics kinds are named in every site language', () => {
  assert.equal(Object.keys(S).length, 12);
  for (const [l, xs] of Object.entries(S)) for (const x of xs) { assert.ok(FIGURE_WORDS[l].test(x), `${l}: ${x}`); assert.ok(figureWords(x), x); }
});
test('and nothing that only looks like them', () => {
  for (const [l, xs] of Object.entries(NEG)) for (const x of xs) assert.ok(!FIGURE_WORDS[l].test(x), `${l}: ${x}`);
});
