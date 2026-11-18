# Algebra Tiles on Oomba

The source of `seed-games/algebra-tiles.html`, a Svelte app adapted from Algebra Tiles by teacher.dev
(Apache License 2.0: `LICENSE`, and `NOTICE` for what changed).

```
cd tools/algebra-tiles
npm install
node build.mjs          # writes seed-games/algebra-tiles.html
node build.mjs --check  # exit 1 if the committed game is not what these sources build
```

`npm run build:algebra-tiles` from the repository root does the same as `node build.mjs`.

- `src/lib/oomba.ts`: everything that talks to Oomba (lesson parameters, links, copy, Oomba Kit effects).
- `src/lib/nav.svelte.ts`, `src/App.svelte`: the screens (gallery, setup, play, about).
- The other files in `src/lib` are the original's activities, checks, whiteboard and pictures.
- `vendor/mathfield-*`: the math input field, vendored.

A link to one problem: `/play/algebra-tiles?mode=solve&chapter=2xp3q7&level=1&lock=1`
(`chapter` is the problem with `+ = ^ ( )` written as `p q e o c`; `level` 1 or 2 is the live balance on or off for
Solve, and all tiles or none for Multiply and Factor). The same query works in a lesson step.
