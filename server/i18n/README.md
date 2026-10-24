# Translating Magic Cups

Magic Cups is a free website where kids aged 6 to 12 play web games and build their own by chatting with an AI helper
called the **Builder**. Thank you for translating it!

## The files

| File | What it is |
|---|---|
| `locales/en.json` | The English (US) source: every string on the site. **Never edit it to translate.** |
| `locales/<code>.json` | Your language. Start from `{}` and add keys from `en.json`. |
| `notes.json` | Notes for translators: what a string is for, length limits, what `{placeholders}` mean. Read the note before translating a key that has one. |
| `blocklists/<code>.txt` | Rude words to block in your language (see `blocklists/README.md`). |

Languages: `en-GB` English (UK), `pt` Português (Brazilian), `fr` Français, `es` Español, `de` Deutsch, `he` עברית,
`ja` 日本語, `ar` العربية, `ru` Русский, `it` Italiano, `zh-Hant` 繁體中文 (Traditional), `nl` Nederlands.

## Keys

Keys are nested objects grouped by page, written as dotted paths in code and notes: `home.hero.play` is

```json
{ "home": { "hero": { "play": "Play" } } }
```

- Copy the same nesting as `en.json`. Use only keys that exist in `en.json` (extra keys are an error).
- A key you leave out shows the English text, so you can translate a little at a time. Most visible first:
  `layout`, `nav`, `home`, `cards`, `categories`, `game`, `play`, `chat`, `friends`, `builder`, then the rest.
- `js.*` keys are shown by the browser (pop-up messages, the Studio); they work exactly the same way.
- Keys starting with `_` (like `_about`) are comments and are ignored.
- `en-GB` only needs the strings whose British spelling or wording differs (colour, favourite, cancelled, maths,
  cosy...); everything else falls back to American English.

## Placeholders

Words in braces are filled in by the site: `"Games by {name}"` → "Games by RocketPanda".

- Keep every placeholder, spelled exactly as in English (`{name}` stays `{name}`, never translate the word inside).
- You may move it anywhere in the sentence: `"Jeux de {name}"`, `"{name} のゲーム"`.
- Numbers are formatted for your language automatically (1,234 / 1.234 / 1 234).
- Some strings contain a little HTML: keep tags like `<b>…</b>` around the matching words, and keep `{link}` (it becomes
  a link) where it fits.

## Plurals

Counted things use ICU plural syntax:

```
"{count, plural, one {# game} other {# games}}"
```

- `#` is the number. The forms your language has are: `zero`, `one`, `two`, `few`, `many`, `other` (always required).
  Use the ones your language needs:
  - Russian: `{count, plural, one {# игра} few {# игры} many {# игр} other {# игры}}`
  - Arabic: `zero`, `one`, `two`, `few`, `many`, `other`
  - Hebrew: `one`, `two`, `other`
  - French, Portuguese, Italian, Spanish, German, Dutch: `one`, `other` (French uses `one` for 0 and 1)
  - Japanese, Chinese: only `other`: `{count, plural, other {#本のゲーム}}`, or just `"{count}本のゲーム"`.
- `=0 {...}` matches exactly zero if you want a special sentence for it.
- If the English plural only picks a word and does not show the number (for example `game.stats.plays`
  `{count, plural, one {play} other {plays}}`), a language without plurals may drop it and write just the word.
- There is no escaping: a translation must not contain a literal `{` or `}`.

## Tone

- Warm, simple and encouraging, for kids aged 6 to 12. Many readers are 7: short sentences, everyday words.
- Talk to the child directly and kindly (informal "you": tu, du, tú, ты, je…). Safety messages are friendly, never scary
  or scolding. The pages for grown-ups (`info.parents.*`, `creator.*`) can use normal adult language.
- Buttons are short: respect the length hints in `notes.json` (phone screens are 390 px wide).
- Use one word consistently for the same idea everywhere: the **Builder** (the AI helper), the **Studio** (where you make
  games), a **friend code**, **Publish**, **Sponsored** (ads must be clearly marked).
- Keep emoji where they are.

## Never translate

- **Magic Cups** (the brand), game titles, usernames, and the code words on the SDK page (`BRB.storage.get(key)`,
  `localStorage`...).
- File types and product names: PNG, JPEG, PDF, Google Fonts, cdnjs.
- Language codes like `"fr"` or `"rtl"` inside sentences.

## Right-to-left (Hebrew, Arabic)

- The site switches to right-to-left automatically for `he` and `ar`: write naturally, do not add direction marks.
- Arrows in the interface are mirrored for you; do not swap "left/right" words unless they describe the screen
  (none of the current strings do).
- Usernames, game titles and numbers stay left-to-right inside your sentence automatically.
- Arabic uses Western digits (0-9) on Magic Cups, the same as in the games.

## Checking your work

```bash
npm run i18n:check          # missing / extra keys and placeholder problems for every language
npm run i18n:check -- --keys   # also list every key still missing
npm test                    # includes the same guard: extra keys or wrong placeholders fail the build
```

To see your language, start the site (`npm start`) and pick it with the 🌐 button, or open any page with `?lang=fr`.
