// One-off: the Story Library's words for its second source, Bloom Library (docs/decisions.md "Story Library: Bloom
// Library books"): the credits note for Bloom books (and the CC BY-SA one), the link to the original on Bloom Library, the
// "based on a book by" credit, the glossary note for books not from India, and the library's footer naming both sources (it replaces library.footCredit, which named
// Pratham Books and CC BY 4.0 only). Keys are added to every locale file; en-GB only gets the lines whose spelling
// differs. Safe to re-run.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '../server/i18n/locales');
const W = {
  en: {
    glossaryNoteAll: 'Notes by Oomba to help with words children may not know.',
    from: 'Based on a book by {name}',
    changesBloom: "Oomba resized the pictures and shows the book one page at a time. Bloom Library, SIL Global and the book's publisher do not endorse Oomba.",
    changesBloomSA: "Oomba resized the pictures and shows the book one page at a time; these adapted pages are shared under the same license, {license}. Bloom Library, SIL Global and the book's publisher do not endorse Oomba.",
    originalBloom: 'See the original book on Bloom Library.',
    footSources: 'Stories and pictures: Pratham Books (StoryWeaver) and the authors and publishers on Bloom Library, each book under its own open license, shown with the book.',
  },
  'en-GB': {
    changesBloomSA: "Oomba resized the pictures and shows the book one page at a time; these adapted pages are shared under the same licence, {license}. Bloom Library, SIL Global and the book's publisher do not endorse Oomba.",
    footSources: 'Stories and pictures: Pratham Books (StoryWeaver) and the authors and publishers on Bloom Library, each book under its own open licence, shown with the book.',
  },
  es: {
    glossaryNoteAll: 'Notas de Oomba para entender palabras que quizá no conozcan los niños.',
    from: 'Basado en un libro de {name}',
    changesBloom: 'Oomba cambió el tamaño de las imágenes y muestra el libro página por página. Bloom Library, SIL Global y la editorial del libro no respaldan a Oomba.',
    changesBloomSA: 'Oomba cambió el tamaño de las imágenes y muestra el libro página por página; estas páginas adaptadas se comparten con la misma licencia, {license}. Bloom Library, SIL Global y la editorial del libro no respaldan a Oomba.',
    originalBloom: 'Ver el libro original en Bloom Library.',
    footSources: 'Cuentos e ilustraciones: Pratham Books (StoryWeaver) y los autores y editoriales de Bloom Library, cada libro con su propia licencia abierta, indicada junto al libro.',
  },
  fr: {
    glossaryNoteAll: 'Notes d’Oomba pour comprendre des mots que les enfants ne connaissent peut-être pas.',
    from: 'D’après un livre de {name}',
    changesBloom: 'Oomba a redimensionné les images et montre le livre une page à la fois. Bloom Library, SIL Global et l’éditeur du livre ne cautionnent pas Oomba.',
    changesBloomSA: 'Oomba a redimensionné les images et montre le livre une page à la fois ; ces pages adaptées sont partagées sous la même licence, {license}. Bloom Library, SIL Global et l’éditeur du livre ne cautionnent pas Oomba.',
    originalBloom: 'Voir le livre original sur Bloom Library.',
    footSources: 'Histoires et illustrations : Pratham Books (StoryWeaver) et les auteurs et éditeurs de Bloom Library, chaque livre sous sa propre licence libre, indiquée avec le livre.',
  },
  de: {
    glossaryNoteAll: 'Hinweise von Oomba zu Wörtern, die Kinder vielleicht nicht kennen.',
    from: 'Nach einem Buch von {name}',
    changesBloom: 'Oomba hat die Bilder verkleinert und zeigt das Buch Seite für Seite. Bloom Library, SIL Global und der Verlag des Buches unterstützen Oomba nicht offiziell.',
    changesBloomSA: 'Oomba hat die Bilder verkleinert und zeigt das Buch Seite für Seite; diese bearbeiteten Seiten stehen unter derselben Lizenz, {license}. Bloom Library, SIL Global und der Verlag des Buches unterstützen Oomba nicht offiziell.',
    originalBloom: 'Zum Originalbuch auf Bloom Library.',
    footSources: 'Geschichten und Bilder: Pratham Books (StoryWeaver) und die Autorinnen, Autoren und Verlage auf Bloom Library, jedes Buch unter seiner eigenen freien Lizenz, die beim Buch steht.',
  },
  it: {
    glossaryNoteAll: 'Note di Oomba per capire parole che i bambini forse non conoscono.',
    from: 'Tratto da un libro di {name}',
    changesBloom: 'Oomba ha ridimensionato le immagini e mostra il libro una pagina alla volta. Bloom Library, SIL Global e l’editore del libro non sostengono Oomba.',
    changesBloomSA: 'Oomba ha ridimensionato le immagini e mostra il libro una pagina alla volta; queste pagine adattate sono condivise con la stessa licenza, {license}. Bloom Library, SIL Global e l’editore del libro non sostengono Oomba.',
    originalBloom: 'Vedi il libro originale su Bloom Library.',
    footSources: 'Storie e illustrazioni: Pratham Books (StoryWeaver) e gli autori e gli editori di Bloom Library, ogni libro con la sua licenza aperta, indicata insieme al libro.',
  },
  pt: {
    glossaryNoteAll: 'Notas da Oomba para ajudar com palavras que as crianças talvez não conheçam.',
    from: 'Baseado em um livro de {name}',
    changesBloom: 'A Oomba mudou o tamanho das imagens e mostra o livro uma página de cada vez. Bloom Library, SIL Global e a editora do livro não endossam a Oomba.',
    changesBloomSA: 'A Oomba mudou o tamanho das imagens e mostra o livro uma página de cada vez; estas páginas adaptadas são compartilhadas com a mesma licença, {license}. Bloom Library, SIL Global e a editora do livro não endossam a Oomba.',
    originalBloom: 'Ver o livro original na Bloom Library.',
    footSources: 'Histórias e ilustrações: Pratham Books (StoryWeaver) e os autores e editoras da Bloom Library, cada livro com a sua própria licença aberta, indicada junto ao livro.',
  },
  nl: {
    glossaryNoteAll: 'Uitleg van Oomba bij woorden die kinderen misschien niet kennen.',
    from: 'Gebaseerd op een boek van {name}',
    changesBloom: 'Oomba heeft de plaatjes kleiner gemaakt en laat het boek pagina voor pagina zien. Bloom Library, SIL Global en de uitgever van het boek steunen Oomba niet officieel.',
    changesBloomSA: 'Oomba heeft de plaatjes kleiner gemaakt en laat het boek pagina voor pagina zien; deze bewerkte pagina’s worden gedeeld onder dezelfde licentie, {license}. Bloom Library, SIL Global en de uitgever van het boek steunen Oomba niet officieel.',
    originalBloom: 'Bekijk het originele boek op Bloom Library.',
    footSources: 'Verhalen en plaatjes: Pratham Books (StoryWeaver) en de schrijvers en uitgevers op Bloom Library, elk boek onder een eigen open licentie, die bij het boek staat.',
  },
  ru: {
    glossaryNoteAll: 'Пояснения Oomba к словам, которые дети могут не знать.',
    from: 'По книге: {name}',
    changesBloom: 'Oomba изменила размер картинок и показывает книгу по одной странице. Bloom Library, SIL Global и издатель книги не являются партнёрами Oomba.',
    changesBloomSA: 'Oomba изменила размер картинок и показывает книгу по одной странице; эти изменённые страницы распространяются по той же лицензии, {license}. Bloom Library, SIL Global и издатель книги не являются партнёрами Oomba.',
    originalBloom: 'Оригинал книги на Bloom Library.',
    footSources: 'Истории и картинки: Pratham Books (StoryWeaver), а также авторы и издатели на Bloom Library; у каждой книги своя открытая лицензия, она указана у книги.',
  },
  ja: {
    glossaryNoteAll: '子どもが知らないかもしれないことばについてのOombaのメモです。',
    from: 'もとの本：{name}',
    changesBloom: 'Oombaは絵の大きさを変え、本を1ページずつ見せています。Bloom Library、SIL Global、本の出版社がOombaを推薦しているわけではありません。',
    changesBloomSA: 'Oombaは絵の大きさを変え、本を1ページずつ見せています。このように変えたページは、同じライセンス（{license}）で公開しています。Bloom Library、SIL Global、本の出版社がOombaを推薦しているわけではありません。',
    originalBloom: 'Bloom Libraryでもとの本を見る。',
    footSources: 'おはなしと絵：Pratham Books（StoryWeaver）と、Bloom Libraryの作者や出版社。どの本も、本ごとのオープンライセンスで、本といっしょにのせています。',
  },
  'zh-Hant': {
    glossaryNoteAll: 'Oomba為孩子可能不認識的字詞寫的說明。',
    from: '改編自 {name} 的書',
    changesBloom: 'Oomba 調整了圖片大小，並一次顯示一頁。Bloom Library、SIL Global 和這本書的出版者並未為 Oomba 背書。',
    changesBloomSA: 'Oomba 調整了圖片大小，並一次顯示一頁；這些改編過的頁面以相同的授權 {license} 分享。Bloom Library、SIL Global 和這本書的出版者並未為 Oomba 背書。',
    originalBloom: '在 Bloom Library 上看原書。',
    footSources: '故事與插圖：Pratham Books（StoryWeaver），以及 Bloom Library 上的作者和出版者；每本書都有自己的開放授權，標示在書旁。',
  },
  ar: {
    glossaryNoteAll: 'ملاحظات من Oomba لشرح كلمات قد لا يعرفها الأطفال.',
    from: 'مأخوذ عن كتاب لـ {name}',
    changesBloom: 'غيّرت Oomba حجم الصور وتعرض الكتاب صفحةً صفحة. لا تؤيد Bloom Library ولا SIL Global ولا ناشر الكتاب منصة Oomba.',
    changesBloomSA: 'غيّرت Oomba حجم الصور وتعرض الكتاب صفحةً صفحة؛ وهذه الصفحات المعدّلة متاحة بالترخيص نفسه، {license}. لا تؤيد Bloom Library ولا SIL Global ولا ناشر الكتاب منصة Oomba.',
    originalBloom: 'الكتاب الأصلي على Bloom Library.',
    footSources: 'القصص والرسوم: Pratham Books (StoryWeaver) والمؤلفون والناشرون على Bloom Library، ولكل كتاب ترخيصه المفتوح الخاص المذكور معه.',
  },
  he: {
    glossaryNoteAll: 'הסברים של Oomba למילים שילדים אולי לא מכירים.',
    from: 'על פי ספר של {name}',
    changesBloom: 'Oomba שינתה את גודל התמונות ומציגה את הספר עמוד אחר עמוד. Bloom Library,‏ SIL Global וההוצאה של הספר לא ממליצים על Oomba.',
    changesBloomSA: 'Oomba שינתה את גודל התמונות ומציגה את הספר עמוד אחר עמוד; העמודים המעובדים משותפים באותו רישיון, {license}. Bloom Library,‏ SIL Global וההוצאה של הספר לא ממליצים על Oomba.',
    originalBloom: 'לספר המקורי ב-Bloom Library.',
    footSources: 'סיפורים ואיורים: Pratham Books (StoryWeaver) והכותבים וההוצאות ב-Bloom Library, כל ספר ברישיון פתוח משלו, שמופיע ליד הספר.',
  },
};

for (const f of fs.readdirSync(DIR).filter(x => x.endsWith('.json'))) {
  const code = f.replace(/\.json$/, '');
  const w = W[code];
  if (!w) throw new Error(`no words for ${code}`);
  const file = path.join(DIR, f);
  const j = JSON.parse(fs.readFileSync(file, 'utf8'));
  j.library = j.library || {};
  j.library.credits = j.library.credits || {};
  for (const k of ['from', 'changesBloom', 'changesBloomSA', 'originalBloom']) if (w[k]) j.library.credits[k] = w[k];
  if (w.footSources) j.library.footSources = w.footSources;
  if (w.glossaryNoteAll) j.library.glossaryNoteAll = w.glossaryNoteAll;
  delete j.library.footCredit;
  fs.writeFileSync(file, JSON.stringify(j, null, 2) + '\n');
}
console.log('done');
