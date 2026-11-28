// The Builder's full playthrough, in the browser (docs/decisions.md "Played all the way through before it is published").
// snapshot.js opens the game exactly as players get it (mode 'playthrough') and hands the page to playToEnd(), which plays
// it to its end by the kind of game, using only what the games and kits already offer from outside:
//   - canvas  an Oomba Canvas activity: every problem answered with the activity's own worked answers (the kit's own
//             Oc.logic solve(), applied by tapping and typing like a student), one wrong answer first to check the hint
//             path, through the results card; on a phone held upright, then again on a desktop.
//   - kit     a game on the Oomba Kit (Oomba.game): __brbTest.seed / start / step, played like a kid (hold right, jump,
//             answer, tap speech bubbles) level by level; a level the bot cannot finish in its share of the time is
//             cleared with the kit's own __brbTest.win(), so every level is loaded and played, to the last results card.
//   - hook    any other game whose __brbTest has win() (the Kit 2 3D starter): played for a while, then win().
//   - free    no hook: a simple bot (keys, taps, swipes, the game's own buttons) for a bounded time, with the game's
//             clocks running faster, until the game says it is over (BRB.gameOver).
//   - endless a page that has no end by design (no BRB.gameOver anywhere, not on a kit): played for a few seconds.
// It returns raw facts; services/playthrough.js judges them. The in-page functions below run with frame.evaluate, so each
// must stay self-contained (no imports, no outer names).

const wait = ms => new Promise(r => setTimeout(r, ms));

// ---- in the game frame -------------------------------------------------------------------------------------------------

/** An Oomba Canvas activity, played to its results card with the activity's own answers. o: { data (the oc-activity
 *  block), wrongFirst (one wrong answer and a hint on the first problem), ms (a time limit) }. */
async function ptCanvas(o) {
  const t0 = Date.now(), sleep = ms => new Promise(r => setTimeout(r, ms));
  const Oc = window.OombaCanvas, T = window.__brbTest;
  if (!Oc || !T || typeof T.state !== 'function') return { end: false, why: { code: 'start', text: 'the activity never started (Oomba Canvas did not draw it)' } };
  const out = { end: false, problems: 0, right: 0, hint: null, answered: 'own', steps: [] };
  const q = s => document.querySelector(s), qa = s => [...document.querySelectorAll(s)];
  const checkBtn = () => q('.oc-band .oc-btns .oc-btn:nth-child(1)'), hintBtn = () => q('.oc-band .oc-btns .oc-btn:nth-child(2)'), clearBtn = () => q('.oc-band .oc-btns .oc-btn:nth-child(3)');
  const key = k => window.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
  let st = T.state();
  out.problems = st.problems;
  // The set on screen: the kit deals it from the activity and the seed (1.1.0 and later say the seed; a fixed list needs none).
  const L = Oc.logic, A = o.data || {};
  const fixed = !(A.gen && L && L.TOOLS && L.TOOLS[A.gen.tool] && ((A.config || {}).fresh !== false || !Array.isArray(A.problems) || !A.problems.length));
  let set = null;
  try { if (L && L.deal && (fixed || Number.isInteger(st.seed))) set = L.deal(A, fixed ? {} : { seed: st.seed, seen: [] }); } catch (e) { set = null; }
  if (!set || set.length !== st.problems) { set = null; out.answered = 'shown'; }
  // One problem's worked answer, given on screen the way a student gives it.
  const give = (p, sol) => {
    const tap = el => { if (el) el.click(); return !!el; };
    switch (p.tool) {
      case 'fractions.equiv': for (const d of sol.pieces) if (!tap(q(`.oc-tray .oc-tile[aria-label="1/${d}"]`))) return false; return true;
      case 'fractions.shade': for (const i of sol.on) if (!tap(qa('.oc-bar.oc-tall .oc-part')[i])) return false; return true;
      case 'fractions.compare': return tap(qa('.oc-sign').find(b => b.textContent.trim() === sol.pick));
      case 'numberline.point': case 'numberline.jump': return tap(qa('.oc-line .oc-tick')[sol.tick - p.lo * p.sub]);
      case 'figure.choice': return tap(qa('.oc-choice')[sol.pick]);
      case 'figure.number': {
        const box = q('.oc-figbox'); if (!box) return false;
        if (!box.classList.contains('oc-sel')) box.click();
        for (const ch of String(sol.typed)) key(ch === ',' ? '.' : ch);
        return true;
      }
      case 'tiles.sort': for (let i = 0; i < sol.at.length; i++) { if (!tap(q('.oc-tray .oc-tile'))) return false; if (!tap(qa('.oc-bins .oc-bin')[sol.at[i]])) return false; } return true;
      case 'tiles.order': for (let k = 0; k < sol.slots.length; k++) {
        const item = sol.slots[k], before = sol.slots.slice(0, k);
        const pos = Array.from({ length: item }, (_, i) => i).filter(i => !before.includes(i)).length;
        if (!tap(qa('.oc-tray .oc-tile')[pos])) return false; if (!tap(qa('.oc-slots .oc-slotbox')[k])) return false;
      } return true;
      default:
        if (/^digits\./.test(p.tool)) {
          const cols = sol.ans.length;
          for (let i = 0; i < cols; i++) {
            if (sol.ans[i] === null || sol.ans[i] === undefined) continue;
            const box = qa('.oc-answer .oc-dbox')[cols - 1 - i]; if (!box) return false;
            if (!box.classList.contains('oc-sel')) box.click();
            key(String(sol.ans[i]));
          }
          return true;
        }
        return false;
    }
  };
  for (let i = 0; i < 80; i++) {
    if (Date.now() - t0 > (o.ms || 25000)) { out.why = { code: 'slow', text: `it was still on problem ${st.problem} of ${st.problems} when the time was up` }; return out; }
    st = T.state();
    if (st.screen === 'end') break;
    const n = st.problem, p = set ? set[n - 1] : null;
    // "Watch me" help: the kit shows the worked answer first; "You try" gives the student the problem.
    const youTry = q('.oc-fb .oc-btn'); if (checkBtn() && checkBtn().disabled && youTry) { youTry.click(); await sleep(30); }
    if (st.phase === 'work') {
      if (o.wrongFirst && i === 0) {
        // A wrong answer (the empty start is never right): "Not yet" with a hint, and the Hint button shows one.
        checkBtn().click(); await sleep(40);
        const fb = q('.oc-fb'), s2 = T.state();
        const tried = !!(fb && /oc-try/.test(fb.className) && fb.textContent.trim()) && s2.phase === 'work';
        hintBtn() && hintBtn().click(); await sleep(40);
        const h = q('.oc-hint'), hinted = !!(h && !h.hidden && h.textContent.trim().length > 3);
        out.hint = { tried, hinted };
        if (!tried) { out.why = { code: 'hint', text: 'after a wrong answer on problem 1 the activity did not say "Not yet" with a hint' }; return out; }
        if (!hinted) { out.why = { code: 'hint', text: 'the Hint button on problem 1 showed no hint' }; return out; }
        clearBtn() && clearBtn().click(); await sleep(20);
      }
      if (p) {
        const sol = L.TOOLS[p.tool].solve(p);
        if (!sol || !give(p, sol)) { out.why = { code: 'answer', text: `problem ${n}: its answer could not be given on screen`, n }; return out; }
        await sleep(30);
        const before = T.state().right;
        checkBtn().click(); await sleep(40);
        const after = T.state();
        if (after.right !== before + 1) { out.why = { code: 'answer', text: `problem ${n}: the right answer was not accepted`, n }; return out; }
      } else {
        // the set is not known here (an older kit with a generator): Check twice shows the worked answer
        // (1.6.0: an empty Check is not a try; the kit's giveUp() shows it the same way)
        if (typeof T.giveUp === 'function') T.giveUp();
        else { checkBtn().click(); await sleep(30); if (T.state().phase === 'work') { checkBtn().click(); await sleep(30); } }
      }
    }
    // Next (or, on the last problem, the results card)
    const nb = checkBtn(); if (!nb) break;
    if (T.state().phase === 'done') { nb.click(); await sleep(50); }
    else if (T.state().phase === 'work' && !p) { out.why = { code: 'stuck', text: `it got stuck on problem ${n}` }; return out; }
  }
  st = T.state();
  const end = q('.oc-end');
  out.right = st.right; out.end = st.screen === 'end' && !!(end && !end.hidden && end.textContent.trim());
  if (!out.end) out.why = { code: 'stuck', text: `the results card never showed (it stopped on problem ${st.problem} of ${st.problems})` };
  out.ms = Date.now() - t0;
  return out;
}

/** A game on the Oomba Kit (Oomba.game), played level by level to the last results card. o: { ms, levelMs, seed }. */
async function ptKit(o) {
  const t0 = Date.now(), left = () => (o.ms || 45000) - (Date.now() - t0), sleep = ms => new Promise(r => setTimeout(r, ms));
  const T = window.__brbTest;
  const out = { end: false, levels: [], loses: 0, score: null, steps: 0 };
  if (!T || typeof T.state !== 'function') return { ...out, why: { code: 'start', text: 'the kit game never registered itself' } };
  // a game with its own test hook in place of the kit's (no step()): not an Oomba.game
  if (typeof T.step !== 'function') return { ...out, why: { code: 'nokit', text: 'the game has its own test hook' } };
  let s = T.state();
  for (let i = 0; i < 60 && !s.game; i++) { await sleep(100); s = T.state(); }
  if (!s.game) return { ...out, why: { code: 'nokit', text: 'the game is on the kit but not an Oomba.game' } };
  const keyEv = (type, code, k) => { try { window.dispatchEvent(new KeyboardEvent(type, { code, key: k, bubbles: true })); } catch (e) { /* ignore */ } };
  const modal = () => [...document.querySelectorAll('.ok-modal')].filter(m => m.offsetParent !== null || getComputedStyle(m).position === 'fixed').pop() || null;
  const focusBtn = () => { const m = modal(); return m ? m.querySelector('[data-ok-focus]') : null; };
  // The kit catches what the game's own setup / update / on() code throws and only warns ('[oomba]', the error): those
  // count as the game's errors, with the level they happened on.
  const thrown = [], cw = console.warn;
  console.warn = function (...a) { try { if (a[0] === '[oomba]' && a[1] instanceof Error && thrown.length < 5) { let lv = 1; try { lv = (T.state().level | 0) + 1; } catch (e) { /* ignore */ } thrown.push({ level: lv, text: String(a[1].message || a[1]).slice(0, 160) }); } } catch (e) { /* ignore */ } return cw.apply(this, a); };
  try { const r = await kitRounds(); return thrown.length ? { ...r, end: false, why: { code: 'error', text: thrown[0].text, level: thrown[0].level } } : r; } finally { console.warn = cw; }
  async function kitRounds() {
  const step = n => { if (thrown.length) return thrown[0].text; try { T.step(n); out.steps += n; return null; } catch (e) { return String((e && e.message) || e).slice(0, 160); } };
  const waitFor = async (fn, ms) => { const end = Date.now() + ms; while (Date.now() < end) { const v = fn(); if (v) return v; await sleep(60); if (!modal()) step(4); } return null; };
  if (typeof T.seed === 'function') T.seed(o.seed || 1);
  try { if (typeof T.start === 'function') T.start(); } catch (e) { return { ...out, why: { code: 'error', text: String(e.message || e).slice(0, 160), level: 1 } }; }
  if (!(await waitFor(() => T.state().scene === 'play' || T.state().scene === 'talk', 6000))) {
    // a how-to or countdown card in the way: tap its button
    const b = focusBtn(); if (b) b.click();
    if (!(await waitFor(() => /^(play|talk)$/.test(T.state().scene), 4000))) return { ...out, why: { code: 'start', text: `pressing start did not start a round (it stayed on "${T.state().scene}")` } };
  }
  for (let lv = 0; lv < 12; lv++) {
    s = T.state();
    const level = (s.level | 0) + 1, info = { level, how: '', ms: 0 }, l0 = Date.now();
    out.levels.push(info);
    const slice = Math.max(2500, Math.min(o.levelMs || 9000, left() - 9000));
    let i = 0, threw = null;
    keyEv('keydown', 'ArrowRight', 'ArrowRight');
    while (Date.now() - l0 < slice) {
      s = T.state();
      if (/^(win|lose|goal)$/.test(s.scene)) break;
      const jump = i % 3 === 0; if (jump) keyEv('keydown', 'Space', ' ');
      threw = step(30); if (threw) break;
      if (jump) keyEv('keyup', 'Space', ' ');
      const tile = document.querySelector('.ok-ask .ok-tile:not([disabled]):not([aria-disabled="true"])'); if (tile) tile.click();
      const bub = document.querySelector('.ok-bubble'); if (bub) { bub.click(); bub.click(); }
      if (!tile && i % 2 === 1) {
        const own = [...document.querySelectorAll('button:not([disabled])')].filter(x => !x.closest('.ok-hud, .ok-modal, .ok-touch, .ok-corner, .ok-bubble') && x.offsetParent);
        if (own.length) own[(i >> 1) % own.length].click();
        const d = 'Digit' + (1 + ((i >> 1) % 4)); keyEv('keydown', d, d.slice(5)); keyEv('keyup', d, d.slice(5));
      }
      i++;
      await sleep(25);
    }
    keyEv('keyup', 'ArrowRight', 'ArrowRight');
    if (threw) { out.why = thrown.length ? { code: 'error', text: thrown[0].text, level: thrown[0].level } : { code: 'error', text: threw, level }; return out; }
    s = T.state();
    if (s.scene === 'lose') {
      // the bot lost this level (a game over): the kit's try-again card starts it again
      out.loses++;
      const b = await waitFor(focusBtn, 5000); if (b) b.click();
      await waitFor(() => /^(play|talk)$/.test(T.state().scene), 4000);
    }
    s = T.state();
    if (s.scene !== 'win' && s.scene !== 'goal') {
      // not finished by playing in its share of the time: the kit's own win hook clears the level
      if (typeof T.win !== 'function') { out.why = { code: 'noend', text: `level ${level} was not finished in ${Math.round(slice / 1000)} s of play`, level }; return out; }
      info.how = 'hook';
      let done = false; try { Promise.resolve(T.win()).then(() => { done = true; }, () => { done = true; }); } catch (e) { out.why = { code: 'error', text: String(e.message || e).slice(0, 160), level }; return out; }
      if (!(await waitFor(() => done && T.state().scene === 'win', 9000))) { out.why = { code: 'stuck', text: `it got stuck on level ${level}: the results card never came (it stayed on "${T.state().scene}")`, level }; return out; }
    } else {
      info.how = 'played';
      if (!(await waitFor(() => T.state().scene === 'win', 9000))) { out.why = { code: 'stuck', text: `it got stuck on level ${level}: the results card never came after the goal`, level }; return out; }
    }
    info.ms = Date.now() - l0;
    const card = await waitFor(() => { const m = document.querySelector('.ok-modal.ok-win'); return m && m.querySelector('[data-ok-focus]') ? m : null; }, 4000);
    out.score = T.state().score;
    if (!card) { out.why = { code: 'stuck', text: `the results card of level ${level} has no button to go on`, level }; return out; }
    // Two buttons (Play again, Next): there is another level. One (Play again): that was the last.
    const more = card.querySelectorAll('.ok-row button').length > 1;
    if (!more) { out.end = true; break; }
    if (left() < 4000) { out.why = { code: 'slow', text: `it was on level ${level + 1} when the time was up`, level: level + 1 }; return out; }
    card.querySelector('[data-ok-focus]').click();
    if (!(await waitFor(() => { const x = T.state(); return /^(play|talk)$/.test(x.scene) && (x.level | 0) + 1 > level; }, 8000))) {
      const x = T.state();
      out.why = { code: 'stuck', text: `it got stuck going to level ${level + 1} (it stayed on "${x.scene}")`, level: level + 1 }; return out;
    }
  }
  out.ms = Date.now() - t0;
  return out;
  }
}

/** Another game with a win() test hook (the Kit 2 3D starter): -> its state after asking it to win. */
async function ptHookWin() {
  const T = window.__brbTest;
  try { const r = T.win(); if (r && r.then) await Promise.race([r, new Promise(res => setTimeout(res, 6000))]); return { ok: true }; } catch (e) { return { ok: false, error: String((e && e.message) || e).slice(0, 160) }; }
}
/** What the game says about itself now. */
function ptState() {
  let st = null; try { st = window.__brbTest && typeof window.__brbTest.state === 'function' ? window.__brbTest.state() : null; st = st && typeof st === 'object' ? JSON.parse(JSON.stringify(st, (k, v) => (typeof v === 'string' ? v.slice(0, 40) : v))) : null; } catch (e) { st = { error: String((e && e.message) || e).slice(0, 80) }; }
  return { st, hook: !!(window.__brbTest && typeof window.__brbTest.win === 'function'), text: ((document.body && document.body.innerText) || '').replace(/\s+/g, ' ').trim().slice(0, 200) };
}
const END_SCENE = /^(win|lose|over|gameover|end|results?|done|finished)$/i;

// ---- in Node: the run ---------------------------------------------------------------------------------------------------

/**
 * Play the open game to its end. h: { page, frame, errors, o, shape, reopen (loads the game again at the current size ->
 * the new frame), helpers: { startTarget, apButtons, PLAY_WORDS, AVOID_WORDS } }.
 * o: { kind ('canvas'|'kit'|'hook'|'free'|'endless'), data (an activity's oc-activity block), budgetMs (60 s), scoring
 * (the game sends scores: BRB.score) }. -> raw facts: { kind, end, ms, errors, why: { code, text, level? }, events, ... }.
 */
export async function playToEnd(h) {
  const { page, o } = h;
  let frame = h.frame;
  const t0 = Date.now(), budget = o.budgetMs || 60_000, left = () => budget - (Date.now() - t0);
  const hostLog = () => page.evaluate(() => (window.__ap || []).slice(0, 200)).catch(() => []);
  const overs = async () => (await hostLog()).filter(e => e.type === 'brb:gameover');
  const base = { kind: o.kind, errors: h.errors };
  const done = async extra => {
    await wait(250);   // an error thrown by the last tap or the results card still counts
    const events = await hostLog();
    return { ...base, ...extra, ms: Date.now() - t0, events, errors: [...new Set(h.errors)].slice(0, 8) };
  };
  const ready = async ms => { const end = Date.now() + ms; while (Date.now() < end) { if (await frame.evaluate(() => !!(window.__brbTest && typeof window.__brbTest.state === 'function')).catch(() => false)) return true; await wait(100); } return false; };

  if (o.kind === 'canvas') {
    // A phone held upright, then (on a fresh page, a new set) a desktop.
    if (!(await ready(8000))) return done({ end: false, why: { code: 'start', text: 'the activity never started (Oomba Canvas did not draw it)' } });
    const sizes = [];
    const phone = await frame.evaluate(ptCanvas, { data: o.data, wrongFirst: true, ms: Math.min(25_000, left() - 8000) }).catch(e => ({ end: false, why: { code: 'error', text: String(e.message || e).split('\n')[0].slice(0, 160) } }));
    sizes.push({ size: 'phone', width: page.viewportSize().width, ...phone });
    const phoneOvers = await overs();
    if (phone.end && !h.errors.length && left() > 9000 && h.reopen) {
      await page.setViewportSize({ width: 1280, height: 800 }).catch(() => {});
      frame = await h.reopen();
      if (await ready(8000)) {
        const desk = await frame.evaluate(ptCanvas, { data: o.data, wrongFirst: false, ms: Math.min(20_000, left() - 3000) }).catch(e => ({ end: false, why: { code: 'error', text: String(e.message || e).split('\n')[0].slice(0, 160) } }));
        sizes.push({ size: 'desktop', width: 1280, ...desk });
      }
    }
    const bad = sizes.find(s => !s.end);
    const over = phoneOvers[0] || null;
    return done({ end: !bad, why: bad ? bad.why : null, sizes: sizes.map(({ size, width, end, right, problems, answered, hint, ms }) => ({ size, width, end, right, problems, answered, hint, ms })),
      score: over ? over.score : null, gameOver: !!over, board: !!(o.data && o.data.config && o.data.config.board === true) });
  }

  let kind = o.kind;
  if (kind === 'kit') {
    const r = await frame.evaluate(ptKit, { ms: left() - 2500, levelMs: 9000, seed: 1 }).catch(e => ({ end: false, why: { code: 'failed', text: String(e.message || e).split('\n')[0].slice(0, 160) } }));
    // on the kit but its own game loop (no Oomba.game): played like any other game
    if (!(r.why && r.why.code === 'nokit')) {
      const ov = await overs();
      const last = ov[ov.length - 1] || null;
      return done({ end: !!r.end, why: r.end ? null : r.why, levels: r.levels || [], loses: r.loses || 0, score: last ? last.score : r.score, gameOver: ov.length > 0 });
    }
    kind = o.over ? 'free' : 'endless'; base.kind = kind;
  }

  // hook / free / endless: start it the way the autoplay does (the test hook, a Play button, the middle), then play.
  const { startTarget, apButtons, PLAY_WORDS, AVOID_WORDS } = h.helpers;
  await ready(o.slow ? 15_000 : 3000);
  await wait(800);
  // A game whose test hook can win (the Kit 2 3D starter): played for a while, then asked to win.
  if (kind === 'free' && await frame.evaluate(() => !!(window.__brbTest && typeof window.__brbTest.win === 'function')).catch(() => false)) { kind = 'hook'; base.kind = 'hook'; }
  const target = await frame.evaluate(startTarget, PLAY_WORDS.source).catch(() => null);
  const shape = page.viewportSize(), W = shape.width, H = shape.height;
  if (target && !target.hook) await page.touchscreen.tap(target.x, target.y).catch(() => page.mouse.click(target.x, target.y).catch(() => {}));
  await page.focus('iframe').catch(() => {});
  await wait(600);
  const keyHold = async (k, ms) => { await page.keyboard.down(k).catch(() => {}); await wait(ms); await page.keyboard.up(k).catch(() => {}); };
  const keyTap = async k => { await page.keyboard.press(k).catch(() => {}); await wait(80); };
  const tap = async (x, y) => { await page.touchscreen.tap(x, y).catch(() => page.mouse.click(x, y).catch(() => {})); await wait(90); };
  const drag = async (x1, y1, x2, y2) => { await page.mouse.move(x1, y1).catch(() => {}); await page.mouse.down().catch(() => {}); for (let i = 1; i <= 5; i++) { await page.mouse.move(x1 + (x2 - x1) * i / 5, y1 + (y2 - y1) * i / 5).catch(() => {}); await wait(40); } await page.mouse.up().catch(() => {}); };
  let seed = 7;
  const rnd = () => { seed = (seed * 48271) % 2147483647; return seed / 2147483647; };
  // The game's own buttons first (answers, cards, the next question): the one pressed least so far, so a board of
  // clues or a card of squares is worked through rather than the same button pressed again and again.
  const pressed = new Map();
  const press = async () => {
    const list = await frame.evaluate(apButtons, AVOID_WORDS.source).catch(() => []);
    if (!list.length) return 0;
    const n = b => pressed.get(b.k || `${b.x},${b.y}`) || 0, low = Math.min(...list.map(n));
    const pick = list.filter(b => n(b) === low), b = pick[Math.floor(rnd() * pick.length)];
    pressed.set(b.k || `${b.x},${b.y}`, low + 1);
    await tap(b.x, b.y); return 1;
  };
  const actions = [
    () => keyHold('ArrowRight', 500), () => keyTap('Space'), () => press(), () => tap(W * (0.2 + rnd() * 0.6), H * (0.25 + rnd() * 0.6)), () => keyHold('ArrowUp', 300),
    () => press(), () => keyHold('ArrowLeft', 400), () => keyTap('Enter'), () => drag(W * 0.3, H * 0.6, W * 0.7, H * 0.5), () => press(), () => keyTap('Digit' + (1 + Math.floor(rnd() * 4))),
    () => keyHold('ArrowDown', 300), () => tap(W * rnd(), H * rnd()), () => keyHold('KeyD', 300), () => keyHold('KeyA', 300), () => press(),
  ];
  const playMs = kind === 'endless' ? Math.min(6000, left() - 2000) : kind === 'hook' ? Math.min(8000, left() - 15_000) : left() - 2500;
  const from = Date.now();
  let last = null, sameSince = Date.now(), i = 0, stuck = null;
  while (Date.now() - from < playMs) {
    // half the time a button of the game's own (when it has any), else the next key, tap or swipe in turn
    if (!(rnd() < 0.5 && await press())) await actions[i % actions.length]();
    i++;
    if (kind !== 'endless' && (await overs()).length) break;
    if (h.errors.length) break;
    if (i % 6 === 0) {
      const pic = await page.screenshot({ type: 'jpeg', quality: 30 }).catch(() => null);
      const s = await frame.evaluate(ptState).catch(() => null);
      const sig = (pic ? pic.length : 0) + ':' + JSON.stringify(s && s.st);
      if (sig !== last) { last = sig; sameSince = Date.now(); } else if (Date.now() - sameSince > 12_000) { stuck = s; break; }
      if (s && s.st && END_SCENE.test(String(s.st.scene ?? s.st.screen ?? ''))) { await wait(800); if ((await overs()).length) break; }
    }
  }
  if (kind === 'endless') return done({ end: true, endless: true, playMs: Date.now() - from, inputs: i });
  if (kind === 'hook' && !(await overs()).length && !h.errors.length) {
    const r = await frame.evaluate(ptHookWin).catch(e => ({ ok: false, error: String(e.message || e).split('\n')[0].slice(0, 160) }));
    if (!r.ok) h.errors.push(r.error);
    const end = Date.now() + Math.min(12_000, Math.max(2000, left() - 1500));
    while (Date.now() < end && !(await overs()).length && !h.errors.length) await wait(200);
  }
  const ov = await overs(), s = await frame.evaluate(ptState).catch(() => null);
  const sceneNow = s && s.st ? String(s.st.scene ?? s.st.screen ?? '') : '';
  const endScene = END_SCENE.test(sceneNow);
  const scoreSent = ov.some(e => typeof e.score === 'number') || (await hostLog()).some(e => e.type === 'brb:score' && typeof e.score === 'number');
  const secs = Math.round((Date.now() - from) / 1000);
  if (!ov.length) {
    const why = endScene ? { code: 'nogameover', text: `it reached the "${sceneNow}" screen but never told the platform the game was over (BRB.gameOver)` }
      : stuck ? { code: 'stuck', text: `it got stuck: nothing on screen changed for 12 s${sceneNow ? ` (on "${sceneNow}")` : ''}` }
        : { code: 'noend', text: `it never reached the end in ${secs} s of play` };
    return done({ end: false, why, playMs: Date.now() - from, inputs: i, scene: sceneNow });
  }
  if (o.scoring && !scoreSent) return done({ end: false, why: { code: 'noscore', text: 'the game ended but sent no score (BRB.gameOver({ won, score }))' }, gameOver: true, playMs: Date.now() - from, inputs: i });
  return done({ end: true, gameOver: true, score: ov[0].score, playMs: Date.now() - from, inputs: i, endHow: kind === 'hook' ? 'hook' : 'played' });
}

/** In every frame before its own code (free games only): the game's clocks run `k` times faster (performance.now,
 *  requestAnimationFrame's time, Date.now, setTimeout / setInterval), so a round with a timer ends inside the budget. */
export function speedScript(k) {
  return `(function(k){try{var P=window.performance,rn=P.now.bind(P),r0=rn(),dn=Date.now.bind(Date),d0=dn();P.now=function(){return r0+(rn()-r0)*k};Date.now=function(){return d0+(dn()-d0)*k};var raf=window.requestAnimationFrame.bind(window);window.requestAnimationFrame=function(cb){return raf(function(){cb(P.now())})};var st=window.setTimeout.bind(window),si=window.setInterval.bind(window);window.setTimeout=function(f,ms){var a=[].slice.call(arguments);a[1]=(+ms||0)/k;return st.apply(null,a)};window.setInterval=function(f,ms){var a=[].slice.call(arguments);a[1]=(+ms||0)/k;return si.apply(null,a)}}catch(e){}})(${+k || 1});`;
}
