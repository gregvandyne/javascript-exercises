// The teacher's own instructions for the top of a printed sheet (BRB.print's optional `note`, Crossword and The Big
// Divide): plain text, at most PRINT_NOTE_MAX characters, printed as typed (escaped by the printer) with its line
// breaks kept. Control characters other than a line break are dropped, three or more line breaks become two, and the
// ends are trimmed; blank means no note.
export const PRINT_NOTE_MAX = 300;

/** raw note -> the cleaned note ('' for none), or null when it is not a string of at most PRINT_NOTE_MAX characters. */
export function cleanPrintNote(raw) {
  if (raw === undefined) return '';
  if (typeof raw !== 'string' || raw.length > PRINT_NOTE_MAX) return null;
  return raw.replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, '').replace(/\n{3,}/g, '\n\n').trim();
}
