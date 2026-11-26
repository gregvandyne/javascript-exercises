// One-off: the site words for Atlas Quest's maps of the US states and Canada (docs/decisions.md "Atlas Quest: US states
// and Canada"): the printed maps' titles, instructions and questions (play.printAtlas) and Atlas Quest Live's two new
// regions and questions (live.atlas), merged into en.json and the 11 translated locale files. Keys are added as text at
// the end of their object, so nothing else in a file changes. Safe to re-run (a key already there is left as it is).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '../server/i18n/locales');
const L = ['en', 'ar', 'de', 'es', 'fr', 'he', 'it', 'ja', 'nl', 'pt', 'ru', 'zh-Hant'];
// [path, key, ...one value per language in L's order]
const W = [
  [['play', 'printAtlas', 'mapOf'], 'us', 'Map of the United States', 'خريطة الولايات المتحدة', 'Karte der USA', 'Mapa de Estados Unidos', 'Carte des États-Unis', 'מפת ארצות הברית', 'Mappa degli Stati Uniti', 'アメリカ合衆国の地図', 'Kaart van de Verenigde Staten', 'Mapa dos Estados Unidos', 'Карта США', '美國地圖'],
  [['play', 'printAtlas', 'mapOf'], 'ca', 'Map of Canada', 'خريطة كندا', 'Karte von Kanada', 'Mapa de Canadá', 'Carte du Canada', 'מפת קנדה', 'Mappa del Canada', 'カナダの地図', 'Kaart van Canada', 'Mapa do Canadá', 'Карта Канады', '加拿大地圖'],
  [['play', 'printAtlas', 'region'], 'us', 'United States', 'الولايات المتحدة', 'USA', 'Estados Unidos', 'États-Unis', 'ארצות הברית', 'Stati Uniti', 'アメリカ合衆国', 'Verenigde Staten', 'Estados Unidos', 'США', '美國'],
  [['play', 'printAtlas', 'region'], 'ca', 'Canada', 'كندا', 'Kanada', 'Canadá', 'Canada', 'קנדה', 'Canada', 'カナダ', 'Canada', 'Canadá', 'Канада', '加拿大'],
  [['play', 'printAtlas'], 'mapHow_us', 'Write the name of each numbered state.', 'اكتب اسم كل ولاية مرقمة.', 'Schreib den Namen jedes nummerierten Bundesstaats auf.', 'Escribe el nombre de cada estado numerado.', 'Écris le nom de chaque État numéroté.', 'כתבו את השם של כל מדינה ממוספרת.', 'Scrivi il nome di ogni stato numerato.', '番号のついた州の名前を書こう。', 'Schrijf de naam van elke genummerde staat op.', 'Escreva o nome de cada estado numerado.', 'Напиши название каждого пронумерованного штата.', '寫出每個有編號的州的名稱。'],
  [['play', 'printAtlas'], 'mapHow_ca', 'Write the name of each numbered province or territory.', 'اكتب اسم كل مقاطعة أو إقليم مرقّم.', 'Schreib den Namen jeder nummerierten Provinz und jedes nummerierten Territoriums auf.', 'Escribe el nombre de cada provincia o territorio numerado.', 'Écris le nom de chaque province ou territoire numéroté.', 'כתבו את השם של כל פרובינציה או טריטוריה ממוספרת.', 'Scrivi il nome di ogni provincia o territorio numerato.', '番号のついた州・準州の名前を書こう。', 'Schrijf de naam van elke genummerde provincie of elk genummerd territorium op.', 'Escreva o nome de cada província ou território numerado.', 'Напиши название каждой пронумерованной провинции или территории.', '寫出每個有編號的省或地區的名稱。'],
  [['play', 'printAtlas'], 'mapHowCoSub', 'Small ones have an arrow to their own line.', 'للصغيرة منها سهم يشير إلى سطرها.', 'Kleine haben einen Pfeil zu ihrer eigenen Linie.', 'Los pequeños tienen una flecha hacia su propia línea.', 'Les petits ont une flèche vers leur propre ligne.', 'לקטנות יש חץ לשורה משלהן.', 'Quelli piccoli hanno una freccia verso la loro riga.', '小さいところには、自分の線への矢印があるよ。', 'Kleine hebben een pijl naar hun eigen lijn.', 'Os pequenos têm uma seta para a própria linha.', 'У маленьких есть стрелка к своей строке.', '比較小的地方有箭頭指向自己的橫線。'],
  [['play', 'printAtlas'], 'capSub', 'What is the capital of {name}?', 'ما عاصمة {name}؟', 'Was ist die Hauptstadt von {name}?', '¿Cuál es la capital de {name}?', '{name} : quelle est sa capitale ?', 'מהי הבירה של {name}?', '{name}: qual è la capitale?', '{name}の州都はどこ？', 'Wat is de hoofdstad van {name}?', '{name}: qual é a capital?', '{name}: какой город столица?', '{name}的首府是哪裡？'],
  [['play', 'printAtlas'], 'capc_us', '{city} is the capital of which state?', '{city} هي عاصمة أي ولاية؟', '{city} ist die Hauptstadt welches Bundesstaats?', '¿De qué estado es capital {city}?', '{city} est la capitale de quel État ?', '{city} היא הבירה של איזו מדינה?', '{city} è la capitale di quale stato?', '{city}はどの州の州都？', '{city} is de hoofdstad van welke staat?', '{city} é a capital de qual estado?', '{city}: столица какого штата?', '{city}是哪一州的首府？'],
  [['play', 'printAtlas'], 'capc_ca', '{city} is the capital of which province or territory?', '{city} هي عاصمة أي مقاطعة أو إقليم؟', '{city} ist die Hauptstadt welcher Provinz oder welches Territoriums?', '¿De qué provincia o territorio es capital {city}?', '{city} est la capitale de quelle province ou de quel territoire ?', '{city} היא הבירה של איזו פרובינציה או טריטוריה?', '{city} è la capitale di quale provincia o territorio?', '{city}はどの州・準州の州都？', '{city} is de hoofdstad van welke provincie of welk territorium?', '{city} é a capital de qual província ou território?', '{city}: столица какой провинции или территории?', '{city}是哪一個省或地區的首府？'],
  [['play', 'printAtlas'], 'abbr', 'What is the postal abbreviation for {name}?', 'ما الاختصار البريدي لـ{name}؟', 'Wie lautet die Postabkürzung von {name}?', '¿Cuál es la abreviatura postal de {name}?', '{name} : quelle est son abréviation postale ?', 'מה הקיצור בדואר של {name}?', '{name}: qual è la sigla postale?', '{name}の郵便の略号は？', 'Wat is de postafkorting van {name}?', '{name}: qual é a sigla postal?', '{name}: какое почтовое сокращение?', '{name}的郵遞縮寫是什麼？'],
  [['live', 'atlas', 'region'], 'us', 'The United States (states)', 'الولايات المتحدة (الولايات)', 'USA (Bundesstaaten)', 'Estados Unidos (estados)', 'États-Unis (États)', 'ארצות הברית (מדינות)', 'Stati Uniti (stati)', 'アメリカ合衆国（州）', 'Verenigde Staten (staten)', 'Estados Unidos (estados)', 'США (штаты)', '美國（各州）'],
  [['live', 'atlas', 'region'], 'ca', 'Canada (provinces and territories)', 'كندا (المقاطعات والأقاليم)', 'Kanada (Provinzen und Territorien)', 'Canadá (provincias y territorios)', 'Canada (provinces et territoires)', 'קנדה (פרובינציות וטריטוריות)', 'Canada (province e territori)', 'カナダ（州・準州）', 'Canada (provincies en territoria)', 'Canadá (províncias e territórios)', 'Канада (провинции и территории)', '加拿大（省和地區）'],
  [['live', 'atlas', 'q'], 'findSub', 'Find {name}', 'ابحث عن {name}', 'Finde {name}', 'Encuentra {name}', 'Trouve : {name}', 'מצאו את {name}', 'Trova: {name}', '{name}をさがそう', 'Zoek {name}', 'Encontre: {name}', 'Найди: {name}', '找出{name}'],
  [['live', 'atlas', 'q'], 'capital_us', 'Find the state whose capital is {city}', 'ابحث عن الولاية التي عاصمتها {city}', 'Finde den Bundesstaat mit der Hauptstadt {city}', 'Encuentra el estado cuya capital es {city}', 'Trouve l’État dont la capitale est {city}', 'מצאו את המדינה שהבירה שלה היא {city}', 'Trova lo stato che ha come capitale {city}', '州都が{city}の州をさがそう', 'Zoek de staat met als hoofdstad {city}', 'Encontre o estado cuja capital é {city}', 'Найди штат, столица которого {city}', '找出首府是{city}的州'],
  [['live', 'atlas', 'q'], 'capital_ca', 'Find the province or territory whose capital is {city}', 'ابحث عن المقاطعة أو الإقليم الذي عاصمته {city}', 'Finde die Provinz oder das Territorium mit der Hauptstadt {city}', 'Encuentra la provincia o el territorio cuya capital es {city}', 'Trouve la province ou le territoire dont la capitale est {city}', 'מצאו את הפרובינציה או הטריטוריה שהבירה שלה היא {city}', 'Trova la provincia o il territorio che ha come capitale {city}', '州都が{city}の州・準州をさがそう', 'Zoek de provincie of het territorium met als hoofdstad {city}', 'Encontre a província ou o território cuja capital é {city}', 'Найди провинцию или территорию, столица которой {city}', '找出首府是{city}的省或地區'],
];
function insert(text, pathArr, key, value) {
  let start = text.indexOf('{'), end = closeOf(text, start);
  let indent = '  ';
  for (const k of pathArr) {
    const m = member(text, start, end, k);
    if (!m) {   // create the object at the end of this one
      const ind = indentOf(text, start) + '  ';
      text = addAt(text, start, end, ind, JSON.stringify(k) + ': {\n' + ind + '}');
      end = closeOf(text, start);
      const m2 = member(text, start, end, k); start = m2; end = closeOf(text, start);
    } else { start = m; end = closeOf(text, start); }
  }
  if (member(text, start, end, key) !== null || memberAny(text, start, end, key)) return text;   // already there
  const ind = indentOf(text, start) + '  ';
  return addAt(text, start, end, ind, JSON.stringify(key) + ': ' + JSON.stringify(value));
}
function indentOf(text, pos) { const ls = text.lastIndexOf('\n', pos) + 1; let i = ls; while (text[i] === ' ') i++; return text.slice(ls, i); }
function addAt(text, start, end, ind, piece) {
  let j = end - 1; while (/\s/.test(text[j])) j--;
  const empty = j === start;
  const close = indentOf(text, end) === '' && text[end - 1] !== '\n' ? '' : '';
  void close;
  const before = text.slice(0, j + 1), after = text.slice(end);
  const closeInd = ind.slice(2);
  return before + (empty ? '' : ',') + '\n' + ind + piece + '\n' + closeInd + after;
}
function closeOf(text, open) {
  let d = 0, inS = false;
  for (let i = open; i < text.length; i++) {
    const c = text[i];
    if (inS) { if (c === '\\') i++; else if (c === '"') inS = false; continue; }
    if (c === '"') inS = true; else if (c === '{' || c === '[') d++; else if (c === '}' || c === ']') { d--; if (d === 0) return i; }
  }
  throw new Error('unbalanced');
}
// the opening brace of member `key` (an object) directly inside the object at [start, end], or null
function member(text, start, end, key) {
  let d = 0, inS = false, sStart = -1;
  for (let i = start; i <= end; i++) {
    const c = text[i];
    if (inS) { if (c === '\\') { i++; continue; } if (c === '"') { inS = false; if (d === 1) { const k = JSON.parse(text.slice(sStart, i + 1)); let j = i + 1; while (/\s/.test(text[j])) j++; if (text[j] === ':' && k === key) { j++; while (/\s/.test(text[j])) j++; return text[j] === '{' ? j : null; } } } continue; }
    if (c === '"') { inS = true; sStart = i; } else if (c === '{' || c === '[') d++; else if (c === '}' || c === ']') d--;
  }
  return null;
}
function memberAny(text, start, end, key) {
  let d = 0, inS = false, sStart = -1;
  for (let i = start; i <= end; i++) {
    const c = text[i];
    if (inS) { if (c === '\\') { i++; continue; } if (c === '"') { inS = false; if (d === 1) { const k = JSON.parse(text.slice(sStart, i + 1)); let j = i + 1; while (/\s/.test(text[j])) j++; if (text[j] === ':' && k === key) return true; } } continue; }
    if (c === '"') { inS = true; sStart = i; } else if (c === '{' || c === '[') d++; else if (c === '}' || c === ']') d--;
  }
  return false;
}
for (const [i, lang] of L.entries()) {
  const f = path.join(DIR, `${lang}.json`);
  let text = fs.readFileSync(f, 'utf8');
  for (const row of W) text = insert(text, row[0], row[1], row[2 + i]);
  JSON.parse(text);
  fs.writeFileSync(f, text);
}
console.log(`atlas states: ${W.length} keys in ${L.length} locale files`);
