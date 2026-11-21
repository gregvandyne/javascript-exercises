// The Builder's figure words (server/builder/figures.js) for the 1.2.0 chemistry kinds and lab readings, in all 12 site
// languages: a mass spectrum, a heating curve, a potential energy diagram, a particle diagram, nuclides, line and
// photoelectron spectra, a buret, a gas syringe, a pH meter call for the FIGURE RULES; everyday words that only look
// alike (a game's particle effects, a balanced budget, the autism spectrum, a cup of coffee, repression) do not.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
const { FIGURE_WORDS, figureWords } = await import('../../server/builder/figures.js');
const S = {
  en: ['dot and cross diagram of methane', 'mass spectrum of chlorine', 'heating curve of water', 'potential energy diagram with a catalyst', 'activation energy', 'particle diagram of a gas', 'nuclide notation for carbon-14', 'line spectra of hydrogen', 'photoelectron spectroscopy', 'read the buret', 'gas syringe', 'triple beam balance', 'pH meter reading', 'volume by displacement'],
  es: ['diagrama de puntos y cruces', 'espectro de masas del cloro', 'curva de calentamiento del agua', 'diagrama de energía potencial', 'energía de activación', 'diagrama de partículas', 'isótopos del carbono', 'espectros de emisión', 'lectura de la bureta', 'jeringa de gas', 'balanza digital', 'papel indicador'],
  fr: ['schéma points-croix', 'spectre de masse du chlore', 'courbe de chauffage de l\'eau', 'diagramme d\'énergie potentielle', 'énergie d\'activation', 'modèle particulaire', 'isotopes du carbone', 'spectre de raies', 'lecture de la burette', 'seringue à gaz', 'balance électronique', 'papier pH'],
  de: ['Punkt-Kreuz-Schema', 'Massenspektrum von Chlor', 'Erwärmungskurve von Wasser', 'Energiediagramm einer Reaktion', 'Aktivierungsenergie', 'Teilchenmodell', 'Isotope des Kohlenstoffs', 'Linienspektrum', 'Bürette ablesen', 'Kolbenprober', 'Digitalwaage', 'pH-Papier'],
  it: ['diagramma a punti e croci', 'spettro di massa del cloro', 'curva di riscaldamento dell\'acqua', 'diagramma dell\'energia potenziale', 'energia di attivazione', 'modello particellare', 'isotopi del carbonio', 'spettri a righe', 'lettura della buretta', 'siringa per gas', 'bilancia digitale', 'cartina al tornasole'],
  pt: ['diagrama de pontos e cruzes', 'espectro de massa do cloro', 'curva de aquecimento da água', 'diagrama de energia potencial', 'energia de ativação', 'modelo de partículas', 'isótopos do carbono', 'espectros de emissão', 'leitura da bureta', 'seringa de gás', 'balança digital', 'papel indicador'],
  nl: ['stip-kruisdiagram', 'massaspectrum van chloor', 'opwarmingskromme van water', 'energiediagram', 'activeringsenergie', 'deeltjesmodel', 'isotopen van koolstof', 'lijnenspectrum', 'buret aflezen', 'gasspuit', 'digitale weegschaal', 'pH-papier'],
  ru: ['схема точек и крестиков', 'масс-спектр хлора', 'кривая нагревания воды', 'энергетическая диаграмма реакции', 'энергия активации', 'модель частиц', 'изотопы углерода', 'линейчатый спектр', 'отсчёт по бюретке', 'газовый шприц', 'электронные весы', 'индикаторная бумага'],
  ja: ['点と×の電子配置図', '塩素の質量スペクトル', '水の加熱曲線', '反応のエネルギー図', '活性化エネルギー', '粒子のモデル図', '炭素の同位体', '線スペクトル', 'ビュレットの読み', 'ガスシリンジ', '電子てんびん', 'pH試験紙'],
  'zh-Hant': ['甲烷的點叉圖', '氯的質譜', '水的加熱曲線', '反應位能圖', '活化能', '粒子示意圖', '碳的同位素', '線光譜', '滴定管讀數', '氣體注射器', '電子天平', '酸鹼試紙'],
  ar: ['مخطط النقاط والتقاطعات', 'طيف الكتلة للكلور', 'منحنى التسخين للماء', 'مخطط الطاقة الكامنة', 'طاقة التنشيط', 'نموذج الجسيمات', 'النظائر المشعة', 'الطيف الخطي', 'قراءة السحاحة', 'محقن الغاز', 'ميزان رقمي', 'ورق pH'],
  he: ['תרשים נקודות וצלבים', 'ספקטרום מסות של כלור', 'עקומת חימום של מים', 'דיאגרמת אנרגיה פוטנציאלית', 'אנרגיית שפעול', 'מודל חלקיקים', 'איזוטופים של פחמן', 'ספקטרום קווים', 'קריאת ביורטה', 'מזרק גז', 'מאזניים דיגיטליים', 'נייר pH'],
};
const NEG = { en: ['a space game with particle effects', 'balance your budget', 'the autism spectrum', 'a mug of cocoa', 'keep your balance on the beam'], es: ['equilibrio en la vida', 'un vaso de agua'], fr: ['équilibre du budget', 'un verre d\'eau'], de: ['ein Becher Kaffee', 'Verdrängung ist ein Abwehrmechanismus', 'Gleichgewicht halten'], it: ['un bicchiere d\'acqua', 'equilibrio'], pt: ['um copo de água', 'equilíbrio'], nl: ['een kopje koffie', 'evenwicht'], ru: ['стакан воды', 'равновесие'], ja: ['コップ一杯の水', 'バランス'], 'zh-Hant': ['一杯水', '平衡'], ar: ['كوب ماء', 'نظير ذلك'], he: ['כוס מים', 'איזון'] };

test('the chemistry kinds are named in every site language', () => {
  assert.equal(Object.keys(S).length, 12);
  for (const [l, xs] of Object.entries(S)) for (const x of xs) { assert.ok(FIGURE_WORDS[l].test(x), `${l}: ${x}`); assert.ok(figureWords(x), x); }
});
test('and nothing that only looks like them, in any language', () => {
  for (const xs of Object.values(NEG)) for (const x of xs) assert.ok(!figureWords(x), x);
});
