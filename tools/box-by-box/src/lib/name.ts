// The game's name, the one place it is written: the brand line on each page, the footer, the browser tab, and (read by
// vite.config.js and build.mjs) index.html's <title> and the built file's banner. Renaming the game changes this line,
// ui.name in each src/i18n/<locale>.json and the titles in seed-games/arithmetic-lab.json. Its slug is arithmetic-lab (it
// was box-by-box: old links redirect, server/services/slug-aliases.js); its BRB.storage keys keep their box-by-box names.
export const NAME = 'Arithmetic Lab';
