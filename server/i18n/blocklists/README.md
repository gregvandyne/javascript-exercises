# Word blocklists, one file per language

`server/services/textfilter.js` loads every `*.txt` file in this folder when the server starts. **All lists apply to
every message on the site** (usernames, game titles and descriptions, report details, friends chat, Builder messages),
whatever language the sender picked: a rude word in Russian is blocked in an English chat too.

## Format

```
# a comment
vqvbg            <- an entry: matches a word that STARTS with it ("idiot" also catches "idiots")
=pba             <- "=" first: whole word only ("con" but not "content")
!pbagrag         <- "!" first: an innocent word that contains a blocked one; it is removed before matching
```

- **ROT13**: every entry is ROT13-encoded, the same trick the launch games use, so the repository (and the game
  scanner's word checks) never contain the words spelled out. ROT13 only shifts the letters a–z; letters with accents
  and other alphabets (Cyrillic, Hebrew, Arabic, Japanese, Chinese) stay exactly as written. To encode a line:
  `node -e "const r=s=>s.replace(/[a-z]/gi,c=>{const b=c<='Z'?65:97;return String.fromCharCode((c.charCodeAt(0)-b+13)%26+b)});console.log(r(process.argv[1]))" 'word'`
- Matching ignores upper/lower case, accents on Latin letters (é = e), Hebrew vowel points, Arabic vowel marks and
  tatweel, and full-width letters. Leetspeak (`5h1t`), spaced-out letters (`s h i t`) and digits from any script are
  handled for you, so list only the plain word.
- Entries in Chinese or Japanese (no spaces between words) match anywhere in the text, even with spaces squeezed in.
- Keep lists short and obvious: slurs, sexual words, the worst swear words. Kids' everyday words that are only a bit
  rude ("stupid") are better left out, because every false match stops a child's message.
- After editing, run `npm test` (the safety tests check that innocent sentences still pass).
