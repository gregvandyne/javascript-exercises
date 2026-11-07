/* ---- start: build the island, load the save, show the title ---- */
SAVE.load();
JC.refreshCappy();
buildCappy('coco', '#ffd23f', { b: '#c08048', l: '#e0a868', s: '#8a5530' }, { noPack: true });
buildCappy('pip', '#3fb7ff', { b: '#9a6438', l: '#c48a52', s: '#6e4424' }, { noPack: true });
WORLD.build();
JC.buildNpcs();
JC.start();
JC.go('title', {}, true);
// a sheet of every sprite, for looking at the art (window.__brbTest.jc.sheet(true))
const _draw = TITLE.draw;
TITLE.draw = function (g) {
  if (!JC.sheet) return _draw(g);
  g.fillStyle = '#6a8a6a'; g.fillRect(0, 0, VIEW.W, VIEW.H);
  let x = 4, y = 4, rowH = 0; const k = 2;
  for (const name in SPRITES) { const s = SPRITES[name]; if (x + s.w * k > VIEW.W - 4) { x = 4; y += rowH + 4; rowH = 0; } sprK(g, s, x, y, k); x += s.w * k + 4; rowH = Math.max(rowH, s.h * k); }
};
