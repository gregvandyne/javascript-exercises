// Oomba Figures: the notice a figure made in Oomba carries when it leaves the site. Oomba Academy dedicates what it
// contributes to a figure to the public domain under CC0 1.0; the notice says so in the file itself, as SVG <metadata>
// in the RDF form Creative Commons recommends (dc:rights with the words, cc:license with the deed). Pure text in, text
// out: the export path (download and copy, PNG text chunks and XMP) builds on it.
import { node, svgText } from './svg.js';

export const CC0_URL = 'https://creativecommons.org/publicdomain/zero/1.0/';
/** The words, exactly as Oomba states them. */
export const FIGURE_NOTICE = `Made with Oomba Academy. Everything Oomba Academy contributes to this figure is dedicated to the public domain under CC0 1.0 (${CC0_URL}). Anything original added by the person who made it is theirs.`;

/** The notice as an SVG <metadata> element (text). */
export function noticeMetadata() {
  return svgText(node('metadata', { class: 'of-notice' },
    node('rdf:RDF', { 'xmlns:rdf': 'http://www.w3.org/1999/02/22-rdf-syntax-ns#', 'xmlns:dc': 'http://purl.org/dc/elements/1.1/', 'xmlns:cc': 'http://creativecommons.org/ns#' },
      node('cc:Work', { 'rdf:about': '' }, node('dc:rights', {}, FIGURE_NOTICE), node('cc:license', { 'rdf:resource': CC0_URL })))));
}
/** A figure's SVG text with the notice in it, right after its <title> (or its opening tag). Already stamped: unchanged. */
export function withNotice(svg) {
  const s = String(svg || '');
  if (!/^<svg\b/.test(s)) throw new Error('Oomba Figures: withNotice() takes the SVG text of a figure (OF.svg)');
  if (s.includes('class="of-notice"')) return s;
  const t = s.indexOf('</title>');
  const at = t >= 0 ? t + '</title>'.length : s.indexOf('>') + 1;
  return s.slice(0, at) + noticeMetadata() + s.slice(at);
}
