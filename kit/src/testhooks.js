// window.__brbTest: created or merged (keys a game already set are never replaced). step(n) advances n fixed updates
// with a frozen clock, so tests and snapshots are deterministic. start / win / skip exist only once the game registers
// them (Oomba.test), so `typeof __brbTest.start === 'function'` stays an honest signal for the screenshot worker and
// the Builder's playtest; until a game registers its state, state() says game: false.
export function installTestHooks(win, kit) {
  const T = win.__brbTest && typeof win.__brbTest === 'object' ? win.__brbTest : {};
  const add = (k, fn) => { if (!(k in T)) T[k] = fn; };
  add('state', () => Object.assign({ game: !!kit.testState, scene: kit.scene, tier: kit.tier, backend: kit.backend, kit: kit.version, theme: kit.theme.mode, lang: kit.i18n.lang, dir: kit.i18n.dir, reduced: kit.settings.reduced }, kit.testState ? kit.testState() : {}));
  add('step', n => { kit.loop.step(Math.max(1, Math.min(6000, n | 0 || 1))); });
  add('seed', n => { kit.seed = n; });
  add('frameStats', () => (kit.stage ? kit.stage.frameStats() : kit.loop.frameStats()));
  add('setTier', t => { if (kit.stage) kit.stage.setTier(t); });
  add('setBackend', b => { if (kit.stage) kit.stage.setBackend(b); });
  add('setTheme', m => kit.theme.set(m));
  add('setLang', l => kit.setLang(l));
  const owned = new Set();
  /** Called by Oomba.test({start, win, skip}). */
  kit.installTestAction = k => { if (!(k in T) || owned.has(k)) { T[k] = (...a) => kit.testActions[k](...a); owned.add(k); } };
  try { win.__brbTest = T; } catch (e) { /* read-only */ }
  return T;
}
