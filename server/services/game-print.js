// Printing for games that print (BRB.print, docs/sdk.md "Printing"): the game sends its own data, the play page asks
// POST /api/games/:id/print, and the game's printer here checks the data and makes the printable page. A printer is
// { clean(raw) -> { ok, doc } | { ok: false, code }, html(doc, { t, dir, lang, code, link }) }; doc.key asks for the
// answer key, which only school staff get (the route checks). Crossword (services/crossword-print.js) and The Big Divide
// (services/box-by-box-print.js), Mistake Hunt (services/proof-print.js) and Word Hunt (services/word-hunt-print.js)
// print; any other game gets 404.
import { cleanPrintDoc, printHtml } from './crossword-print.js';
import { cleanBoxPrintDoc, boxPrintHtml } from './box-by-box-print.js';
import { cleanProofPrintDoc, proofPrintHtml } from './proof-print.js';
import { cleanHuntPrintDoc, huntPrintHtml } from './word-hunt-print.js';

export const PRINTERS = new Map([
  ['crossword', { clean: cleanPrintDoc, html: printHtml }],
  ['box-by-box', { clean: cleanBoxPrintDoc, html: boxPrintHtml }],
  ['mistake-hunt', { clean: cleanProofPrintDoc, html: proofPrintHtml }],
  ['word-hunt', { clean: cleanHuntPrintDoc, html: huntPrintHtml }],
]);
