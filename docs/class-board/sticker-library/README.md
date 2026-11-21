# Oomba Sticker Library v2

3,657 stickers for the Class Board stickers widget.

- `illustrated-individual/` — 153 illustrated stickers, each its own
  transparent PNG (RGBA, hard white die-cut halo, no background). Redone one
  by one, no sheets, no grid cuts, no clipped letters.
- `greetings/` — 3,504 greeting SVGs (146 phrases in 9 languages x 8 palettes
  x 3 shapes). Each is its own file, transparent, placeable alone.
- `search-index.json` — one entry per sticker (id, file, theme, name, text,
  language, keywords, palette/shape for greetings). Use it to power the
  dashboard search box. Do not load all 3,504 greetings at once, filter
  through the index.
- `illustrated-catalog.csv`, `greetings-catalog.csv` — the same catalogs as
  spreadsheets.

Place stickers one at a time, drag anywhere (mouse and touch), resize about
60px to 600px, rotate, bring to front / send to back, duplicate and delete
per sticker. Save position, size and rotation with the layout. Do not place
whole sheets, and do not put a white background back behind a sticker.
