// When does a build need figures (docs/figures-api.md)? The FIGURE RULES (figure-rules.js, made from that page) go to
// the model only for builds about science, maths or graph figures, so every other build keeps the same prompt:
//   - a setup plan whose topic, lesson or note names one (plan.js sets plan.figures; the flag is kept in state),
//   - a message that names one, in any of the site's languages (the words below),
//   - a game whose current version already loads a figure library.
// The arcade SYSTEM_PROMPT and TOOLS never change (tests/unit/builder-lesson.test.js pins their hash).
import { usesFigures } from '../services/figlibs.js';

// Words that call for a figure (lower case; stems where a language bends its words). Kept specific: "force", not
// "power"; "electric current", not "current events".
export const FIGURE_WORDS = {
  en: /\b(forces?|free[- ]body|newtons?|vectors?|inclined planes?|pulleys?|lens(es)?|mirrors?|ray diagrams?|light rays?|refraction|reflection|circuits?|resistors?|voltage|electric current|ammeters?|voltmeters?|motion graphs?|distance[- ]time|displacement[- ]time|velocity[- ]time|speed[- ]time|bohr|electrons?|orbitals?|electron configuration|atoms?|atomic|molecules?|lewis|covalent|thermometers?|measuring cylinders?|spring (balance|scale)|newton ?meters?|half[- ]li(fe|ves)|radioactiv\w*|titrations?|ph curve|graphs?|coordinates?|coordinate (grid|plane)|plotting|parabolas?|quadratics?|linear (functions?|equations?|graphs?))\b/i,
  es: /(fuerzas?|cuerpo libre|vectores?|plano inclinado|poleas?|lentes?\b|espejos?|rayos?\b|circuitos?|resistencias?|voltaje|amperímetro|voltímetro|gráfic[ao]s?|coordenadas?|átomos?|electrones?|electrón|orbitales?|moléculas?|lewis|bohr|termómetro|probeta|dinamómetro|semivida|vida media|titulación|valoración ácido|parábolas?|pendiente)/i,
  fr: /(forces?\b|diagramme des forces|vecteurs?|plan incliné|poulies?|lentilles?|miroirs?|rayons? lumineux|circuits? électrique|résistances?|tension électrique|ampèremètre|voltmètre|(^|[^a-zà-ÿ])graphiques?|(^|[^a-zà-ÿ])graphes?|coordonnées|repère|atomes?|électrons?|orbitales?|molécules?|lewis|bohr|thermomètre|éprouvette|dynamomètre|demi-vie|titrage|paraboles?)/i,
  de: /(kräfte|kraft\b|kraftpfeil|freikörperbild|vektor|schiefe ebene|flaschenzug|umlenkrolle|linse|spiegel|lichtstrahl|strahlengang|stromkreis|widerstand|elektrische spannung|amperemeter|voltmeter|diagramm|(^|[^a-zäöüß])graph|koordinat|atom|elektron|orbital|molekül|lewis|bohr|thermometer|messzylinder|federwaage|kraftmesser|halbwertszeit|titration|parabel)/i,
  it: /(forz[ae]\b|corpo libero|vettor[ei]|piano inclinato|carrucol[ae]|lent[ei]\b|specchi|raggi luminosi|circuit[oi]|resistenz[ae]|tensione|amperometro|voltmetro|grafic[oi]|coordinat[ei]|atom[oi]|elettron[ei]|orbital[ei]|molecol[ae]|lewis|bohr|termometro|cilindro graduato|dinamometro|dimezzamento|titolazione|parabol[ae])/i,
  pt: /(forças?|corpo livre|vetor(es)?|plano inclinado|roldanas?|polias?|lentes?\b|espelhos?|raios? de luz|circuitos?|resistências?|tensão elétrica|amperímetro|voltímetro|gráficos?|coordenadas?|átomos?|eletrões|elétrons?|eletrão|orbitais|moléculas?|lewis|bohr|termómetro|termômetro|proveta|dinamómetro|dinamômetro|meia-vida|titulação|parábolas?)/i,
  nl: /(kracht(en)?\b|krachtendiagram|vector(en)?|hellend vlak|katrol|lens(en)?\b|spiegels?|lichtstra(al|len)|stroomkring|schakeling|weerstand|spanning|ampèremeter|voltmeter|grafiek|coördinat|atoom|atomen|elektron|orbitaal|molecu|lewis|bohr|thermometer|maatcilinder|veerunster|krachtmeter|halveringstijd|titratie|parabool)/i,
  ru: /((^|[^а-яё])(сила|силы|силу|сил|луч|лучи|лучей)(?![а-яё])|вектор|наклонн[а-яё]* плоскост|подвижн[а-яё]* блок|неподвижн[а-яё]* блок|линз|зеркал|электрическ[а-яё]* цеп|резистор|сопротивлени|амперметр|вольтметр|график|координат|атом|электрон|орбитал|молекул|льюис|модель бора|термометр|мензурк|динамометр|полураспад|титровани|парабол)/i,
  ja: /(合力|重力|摩擦力|垂直抗力|力の矢印|力の図|ベクトル|斜面|滑車|レンズ|鏡|光線|回路|抵抗|電圧|電流計|電圧計|グラフ|座標|原子|電子|軌道|分子|ルイス|ボーア|温度計|メスシリンダー|ばねばかり|半減期|滴定|放物線)/,
  'zh-Hant': /(受力|力圖|合力|重力|摩擦力|向量|斜面|滑輪|透鏡|鏡子|面鏡|光線|電路|電阻|電壓|電流表|電壓表|圖表|座標|坐標|原子|電子|軌域|分子|路易斯|波耳|溫度計|量筒|彈簧秤|半衰期|滴定|拋物線|函數圖)/,
  ar: /(قوة|القوى|قوى|متجه|مستوى مائل|بكرة|عدسة|مرآة|أشعة|شعاع|دائرة كهربائية|مقاومة|جهد كهربائي|أميتر|فولتميتر|رسم بياني|تمثيل بياني|إحداثي|ذرة|إلكترون|مدار|جزيء|لويس|نموذج بور|ميزان حرارة|مخبار|ميزان نابضي|عمر النصف|معايرة|قطع مكافئ)/,
  he: /(כוח|כוחות|וקטור|מישור משופע|גלגלת|עדשה|מראה|קרני אור|מעגל חשמלי|נגד חשמלי|מתח חשמלי|אמפרמטר|וולטמטר|גרף|מערכת צירים|אטום|אלקטרון|אורביטל|מולקולה|לואיס|בוהר|מדחום|משורה|מד כוח|מחצית חיים|טיטרציה|פרבולה)/,
};
/** Does this text call for a science, maths or graph figure, in any site language? */
export function figureWords(text) {
  const s = String(text || '').slice(0, 20000);
  if (!s.trim()) return false;
  if (/\bp\s?h\b/i.test(s) && /\b(acid|base|titrat|curve)/i.test(s)) return true;
  return Object.values(FIGURE_WORDS).some(re => re.test(s));
}
/** The words of a plan that say what it is about: the topic, the lesson (all its parts and the file's text), the note. */
export function planText(plan) {
  if (!plan) return '';
  const l = plan.lesson || {};
  return [plan.topic && plan.topic.text, plan.notes, l.goal, l.mistakes, l.vocabulary, l.details, l.doc && l.doc.text, ...(plan.learn || []).map(x => x.text)].filter(Boolean).join('\n');
}
/** Is this turn a figure build? (state.figures remembers a plan's or a message's call for figures.) */
export function wantsFigures(state, text, version, plan) {
  if (plan && plan.figures && state) state.figures = true;
  if (figureWords(text) && state) state.figures = true;
  return !!(state && state.figures) || !!(plan && plan.figures) || figureWords(text) || !!(version && usesFigures(version.html));
}
