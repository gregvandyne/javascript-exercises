// One-off: the Story Library's words for its third source, the Classics shelf (docs/decisions.md "Story Library: a
// Classics shelf"): the shelf's name on cards and book pages, the library footer's line about it, the credits of a
// public-domain book (public domain, the first edition, what Oomba changed) and the reader's counter for an open book
// ("Pages 3-4 of 12"). Keys are added to every locale file; en-GB only gets lines whose spelling differs (none here).
// Safe to re-run.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '../server/i18n/locales');
const W = {
  en: {
    classics: 'Classics',
    footClassics: 'Classics: old books in the public domain, with their original pictures.',
    publicDomain: 'Public domain',
    firstPublished: 'First published in {year} ({edition}).',
    changesClassic: 'Oomba split the story into pages and resized the pictures. The words are the author\'s own.',
    pagesOf: 'Pages {from}-{to} of {pages}',
  },
  'en-GB': {},
  es: {
    classics: 'Clásicos',
    footClassics: 'Clásicos: libros antiguos de dominio público, con sus ilustraciones originales.',
    publicDomain: 'Dominio público',
    firstPublished: 'Publicado por primera vez en {year} ({edition}).',
    changesClassic: 'Oomba dividió el cuento en páginas y cambió el tamaño de las imágenes. Las palabras son del autor.',
    pagesOf: 'Páginas {from}-{to} de {pages}',
  },
  fr: {
    classics: 'Classiques',
    footClassics: 'Classiques : des livres anciens du domaine public, avec leurs illustrations d’origine.',
    publicDomain: 'Domaine public',
    firstPublished: 'Première publication en {year} ({edition}).',
    changesClassic: 'Oomba a découpé l’histoire en pages et redimensionné les images. Les mots sont ceux de l’auteur.',
    pagesOf: 'Pages {from}-{to} sur {pages}',
  },
  de: {
    classics: 'Klassiker',
    footClassics: 'Klassiker: alte, gemeinfreie Bücher mit ihren Originalbildern.',
    publicDomain: 'Gemeinfrei',
    firstPublished: 'Erstmals erschienen {year} ({edition}).',
    changesClassic: 'Oomba hat die Geschichte in Seiten geteilt und die Bilder verkleinert. Der Text ist der des Autors.',
    pagesOf: 'Seiten {from}-{to} von {pages}',
  },
  it: {
    classics: 'Classici',
    footClassics: 'Classici: libri antichi di pubblico dominio, con le loro illustrazioni originali.',
    publicDomain: 'Pubblico dominio',
    firstPublished: 'Pubblicato per la prima volta nel {year} ({edition}).',
    changesClassic: 'Oomba ha diviso la storia in pagine e ridimensionato le immagini. Le parole sono dell’autore.',
    pagesOf: 'Pagine {from}-{to} di {pages}',
  },
  pt: {
    classics: 'Clássicos',
    footClassics: 'Clássicos: livros antigos em domínio público, com as ilustrações originais.',
    publicDomain: 'Domínio público',
    firstPublished: 'Publicado pela primeira vez em {year} ({edition}).',
    changesClassic: 'A Oomba dividiu a história em páginas e mudou o tamanho das imagens. As palavras são do autor.',
    pagesOf: 'Páginas {from}-{to} de {pages}',
  },
  nl: {
    classics: 'Klassiekers',
    footClassics: 'Klassiekers: oude boeken uit het publieke domein, met hun oorspronkelijke tekeningen.',
    publicDomain: 'Publiek domein',
    firstPublished: 'Voor het eerst verschenen in {year} ({edition}).',
    changesClassic: 'Oomba heeft het verhaal in pagina’s verdeeld en de plaatjes verkleind. De woorden zijn van de schrijver.',
    pagesOf: 'Pagina’s {from}-{to} van {pages}',
  },
  ru: {
    classics: 'Классика',
    footClassics: 'Классика: старые книги, перешедшие в общественное достояние, с оригинальными иллюстрациями.',
    publicDomain: 'Общественное достояние',
    firstPublished: 'Впервые опубликовано в {year} году ({edition}).',
    changesClassic: 'Oomba разделила рассказ на страницы и уменьшила картинки. Текст авторский, без изменений.',
    pagesOf: 'Страницы {from}-{to} из {pages}',
  },
  ja: {
    classics: '名作',
    footClassics: '名作：パブリックドメインになった昔の本を、もとの絵といっしょにのせています。',
    publicDomain: 'パブリックドメイン',
    firstPublished: '{year}年に初めて出版（{edition}）。',
    changesClassic: 'Oombaはおはなしをページに分け、絵の大きさを変えました。文章は作者のものです。',
    pagesOf: '{pages}ページ中{from}～{to}ページ',
  },
  'zh-Hant': {
    classics: '經典',
    footClassics: '經典：已進入公有領域的舊書，附上原本的插圖。',
    publicDomain: '公有領域',
    firstPublished: '{year} 年首次出版（{edition}）。',
    changesClassic: 'Oomba 把故事分成頁面，並調整了圖片大小。文字都是作者的原文。',
    pagesOf: '第 {from}-{to} 頁，共 {pages} 頁',
  },
  ar: {
    classics: 'الكلاسيكيات',
    footClassics: 'الكلاسيكيات: كتب قديمة في الملك العام، مع رسومها الأصلية.',
    publicDomain: 'ملك عام',
    firstPublished: 'نُشر أول مرة عام {year} ({edition}).',
    changesClassic: 'قسّمت Oomba القصة إلى صفحات وغيّرت حجم الصور. الكلمات هي كلمات المؤلف.',
    pagesOf: 'الصفحات {from}-{to} من {pages}',
  },
  he: {
    classics: 'קלאסיקות',
    footClassics: 'קלאסיקות: ספרים ישנים שנמצאים בנחלת הכלל, עם האיורים המקוריים שלהם.',
    publicDomain: 'נחלת הכלל',
    firstPublished: 'יצא לאור לראשונה ב-{year} ({edition}).',
    changesClassic: 'Oomba חילקה את הסיפור לעמודים ושינתה את גודל התמונות. המילים הן של המחבר.',
    pagesOf: 'עמודים {from}-{to} מתוך {pages}',
  },
};

for (const f of fs.readdirSync(DIR).filter(x => x.endsWith('.json'))) {
  const code = f.replace(/\.json$/, '');
  const w = W[code];
  if (!w) throw new Error(`no words for ${code}`);
  const file = path.join(DIR, f);
  const j = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (Object.keys(w).length) j.library = j.library || {};
  if (w.classics) { j.library.sources = { ...(j.library.sources || {}), classics: w.classics }; }
  if (w.footClassics) j.library.footClassics = w.footClassics;
  for (const k of ['publicDomain', 'firstPublished', 'changesClassic']) if (w[k]) { j.library.credits = j.library.credits || {}; j.library.credits[k] = w[k]; }
  if (w.pagesOf) { j.js = j.js || {}; j.js.library = { ...(j.js.library || {}), pagesOf: w.pagesOf }; }
  fs.writeFileSync(file, JSON.stringify(j, null, 2) + '\n');
}
console.log('done');
