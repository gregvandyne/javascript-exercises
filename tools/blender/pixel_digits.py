"""Oomba Pixel Digits: the digits, maths signs and digit-like letters of the kit's pixel style, on a 6 x 7 grid.

    python3 tools/blender/pixel_digits.py [--out public/fonts/oomba-pixel-digits.woff2]   (needs fontTools + brotli)

Pixelify Sans (the pixel style's text font) draws 5 almost like S and 2 almost like Z, which is no good for a maths game
for 6-9 year olds. This face has only 0-9 and the signs a question shows (+ - minus times divide = ? , . / and a
space), plus the letters Pixelify draws almost like digits (Z z G B), each drawn for one job: to be read at a glance. Vertical strokes are two pixels wide (bold, like Pixelify at 700),
the 5 has a flat top and a square corner, the 4 is open, the 1 has a foot, the 7 a straight stem. style-pixel puts it in
front of Pixelify with a unicode-range of just these characters, so words keep Pixelify and numbers use these.
"""
import argparse
import os

from fontTools.fontBuilder import FontBuilder
from fontTools.pens.ttGlyphPen import TTGlyphPen

CELL = 92          # font units per pixel (Pixelify's cap height is 7 of its ~92-unit pixels)
EM = 1000
GLYPHS = {
    '0': ['.####.', '##..##', '##.###', '######', '###.##', '##..##', '.####.'],
    '1': ['..##..', '.###..', '####..', '..##..', '..##..', '..##..', '######'],
    '2': ['.####.', '##..##', '....##', '...##.', '..##..', '.##...', '######'],
    '3': ['#####.', '....##', '....##', '.####.', '....##', '....##', '#####.'],
    '4': ['##..##', '##..##', '##..##', '######', '....##', '....##', '....##'],
    '5': ['######', '##....', '#####.', '....##', '....##', '##..##', '.####.'],
    '6': ['.####.', '##....', '##....', '#####.', '##..##', '##..##', '.####.'],
    '7': ['######', '....##', '...##.', '..##..', '..##..', '..##..', '..##..'],
    '8': ['.####.', '##..##', '##..##', '.####.', '##..##', '##..##', '.####.'],
    '9': ['.####.', '##..##', '##..##', '.#####', '....##', '....##', '.####.'],
    '+': ['......', '..##..', '..##..', '######', '..##..', '..##..', '......'],
    '-': ['......', '......', '......', '######', '......', '......', '......'],
    '−': ['......', '......', '......', '######', '......', '......', '......'],
    '×': ['......', '##..##', '.####.', '..##..', '.####.', '##..##', '......'],
    '÷': ['..##..', '......', '......', '######', '......', '......', '..##..'],
    '=': ['......', '......', '######', '......', '######', '......', '......'],
    '?': ['.####.', '##..##', '....##', '...##.', '..##..', '......', '..##..'],
    ',': ['......', '......', '......', '......', '......', '..##..', '.##...'],
    '.': ['......', '......', '......', '......', '......', '......', '..##..'],
    '/': ['....##', '....##', '...##.', '..##..', '.##...', '##....', '##....'],
    # letters Pixelify draws almost like digits (Z/2, G/6, B/8): square corners and straight strokes, so "Zoom!",
    # "Galaxy" and "Bolt" never read as "2oom!", "6alaxy", "8olt"
    'Z': ['######', '....##', '...##.', '..##..', '.##...', '##....', '######'],
    'z': ['......', '......', '######', '...##.', '..##..', '.##...', '######'],
    'G': ['.#####', '##....', '##....', '##.###', '##..##', '##..##', '.#####'],
    'B': ['#####.', '##..##', '##..##', '#####.', '##..##', '##..##', '#####.'],
}
NAMES = {'+': 'plus', '-': 'hyphen', '−': 'minus', '×': 'multiply', '÷': 'divide', '=': 'equal', '?': 'question',
         ',': 'comma', '.': 'period', '/': 'slash', ' ': 'space'}


def glyph(rows):
    pen = TTGlyphPen(None)
    for r, row in enumerate(rows):
        y = (6 - r) * CELL
        x0 = None
        for c, ch in enumerate(row + '.'):
            if ch == '#' and x0 is None:
                x0 = c
            elif ch != '#' and x0 is not None:   # one rectangle per run of pixels in a row
                a, b = x0 * CELL + CELL // 2, c * CELL + CELL // 2
                pen.moveTo((a, y)); pen.lineTo((a, y + CELL)); pen.lineTo((b, y + CELL)); pen.lineTo((b, y)); pen.closePath()
                x0 = None
    return pen.glyph()


def build(out):
    names = ['.notdef', 'space'] + [NAMES.get(ch, 'digit' + ch if ch.isdigit() else ch) for ch in GLYPHS]
    names = [('d' + n[-1]) if n.startswith('digit') else n for n in names]
    fb = FontBuilder(EM, isTTF=True)
    fb.setupGlyphOrder(names)
    cmap = {0x20: 'space'}
    glyphs = {'.notdef': TTGlyphPen(None).glyph(), 'space': TTGlyphPen(None).glyph()}
    metrics = {'.notdef': (7 * CELL, 0), 'space': (4 * CELL, 0)}
    for ch, rows in GLYPHS.items():
        n = names[2 + list(GLYPHS).index(ch)]
        cmap[ord(ch)] = n
        glyphs[n] = glyph(rows)
        metrics[n] = (7 * CELL + CELL // 2 * 2 - CELL, CELL // 2)   # 6 pixels and a one-pixel gap
    fb.setupCharacterMap(cmap)
    fb.setupGlyf(glyphs)
    fb.setupHorizontalMetrics(metrics)
    fb.setupHorizontalHeader(ascent=920, descent=-280)
    fb.setupNameTable({'familyName': 'Oomba Pixel Digits', 'styleName': 'Regular', 'copyright': 'Oomba Academy (drawn for the Oomba Kit pixel style)'})
    fb.setupOS2(sTypoAscender=920, sTypoDescender=-280, usWinAscent=920, usWinDescent=280, sCapHeight=7 * CELL, sxHeight=5 * CELL)
    fb.setupPost()
    fb.font.flavor = 'woff2'
    fb.save(out)


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', default=os.path.join(os.path.dirname(__file__), '..', '..', 'public', 'fonts', 'oomba-pixel-digits.woff2'))
    a = ap.parse_args()
    build(os.path.abspath(a.out))
    print(os.path.getsize(a.out), 'bytes')
