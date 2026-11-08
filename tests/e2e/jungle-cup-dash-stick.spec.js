// Jungle Cup, Mango Dash: the joystick feels snappy, measured with real touches (CDP) on a 390 x 844 phone, game time
// stepped one 1/60 s frame at a time, the carrier's speed read every frame:
//   - the dead zone is small (about 10 % of the knob's travel) and a comfortable push (70 %) is already full speed,
//     while a light push is still slower (analog);
//   - from standing, a full push reaches 90 % of full speed within about 0.1 s, but not all in the first frame (not
//     twitchy); a juke (full right to full left) turns round about as fast; the keys too;
//   - a thumb that lands right by the screen's corner starts with no push at all (the centre is where it landed);
//   - a thumb dragged far past the rim and brought back steers back at once (the centre follows the thumb).
// Prints the numbers (JC_STICK_LOG=1). Run alone: E2E_PORT=5131 npx playwright test tests/e2e/jungle-cup-dash-stick.spec.js
import { test, expect } from '@playwright/test';
import { gameFrame, ownIp } from './helpers.js';

const J = (f, fn, ...a) => f.evaluate(([fn, a]) => window.__brbTest.jc[fn](...a), [fn, a]);
const H = (f, name, ...a) => f.evaluate(([n, a]) => window.__brbTest.jc.sport(n, ...a), [name, a]);
const FPS = 60, RUN = 62;   // the carrier's full speed (px/s) with no power-up
const ms = i => Math.round((i + 1) * 1000 / FPS);
/** The time (ms) until v reaches frac of target (same sign), or Infinity. */
const reach = (v, target, frac) => { const i = v.findIndex(x => Math.sign(target) * x >= Math.abs(target) * frac); return i < 0 ? Infinity : ms(i); };

test.describe('touch', () => {
  test.use({ hasTouch: true, isMobile: true });

  test('Mango Dash: the joystick answers fast, with a small dead zone, full speed at 70 % and no phantom push', async ({ page }) => {
    test.setTimeout(180_000);
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.setViewportSize({ width: 390, height: 844 });
    await ownIp(page);
    await page.goto('/play/jungle-cup');
    const f = await gameFrame(page);
    await f.waitForFunction(() => window.__brbTest && window.__brbTest.jc && window.__brbTest.jc.state().screen === 'title', null, { timeout: 30000 });
    await J(f, 'manual', true);
    await J(f, 'setSave', { plays: { dash: 1 } });
    await J(f, 'play', 'dash');
    for (let i = 0; i < 60 && (await J(f, 'step', 100)).sport.phase !== 'play'; i++);
    const fb = await (await f.frameElement()).boundingBox();
    const c = await f.evaluate(() => { const r = document.getElementById('jc').getBoundingClientRect(); const v = window.__brbTest.jc.state().view; return { x: r.left, y: r.top, k: v.S / v.dpr, W: v.W, H: v.H }; });
    const toPage = (vx, vy) => ({ x: fb.x + c.x + vx * c.k, y: fb.y + c.y + vy * c.k });
    const cdp = await page.context().newCDPSession(page);
    const tp = q => ({ x: q.x, y: q.y, id: 1, radiusX: 6, radiusY: 6, force: 1 });
    let held = false;
    // touch moves reach the page with the next animation frame: wait for it before stepping game time
    const raf = () => f.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
    const down = async q => { held = true; await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [tp(q)] }); await raf(); };
    const move = async q => { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [tp(q)] }); await raf(); };
    const up = async () => { if (held) await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); held = false; await raf(); };
    const frames = async n => { const out = []; for (let i = 0; i < n; i++) { const s = await J(f, 'step', 16); const d = await H(f); out.push({ vx: d.vx, vd: d.vd, axis: s.axis }); } return out; };
    // a quiet field (no pigs, obstacles or events), the carrier standing still
    const park = async () => { await up(); await H(f, 'quiet', 9999); await J(f, 'step', 600); };
    await park();
    const R = (await J(f, 'state')).stick.R * c.k;   // the knob's full travel, CSS px
    const O = toPage(c.W * 0.25, c.H * 0.72);
    const push = async (dx, dy) => { await park(); await down(O); await frames(3); await move({ x: O.x + dx * R, y: O.y + dy * R }); };
    const out = { R: Math.round(R) };

    // 1. steady speed up the field for a push of each size
    out.curve = [];
    for (const k of [0.06, 0.12, 0.3, 0.5, 0.7, 1]) { await push(0, -k); const fr = await frames(40); out.curve.push([k, fr[fr.length - 1].vd]); }
    const at = k => out.curve.find(r => r[0] === k)[1];
    expect(at(0.06), 'inside the dead zone').toBe(0);
    expect(at(0.12), 'just past a ~10 % dead zone it moves').toBeGreaterThan(0);
    expect(at(0.3), 'a light push is slower').toBeLessThan(RUN * 0.5);
    expect(at(0.5)).toBeGreaterThan(at(0.3));
    expect(at(0.7), 'a 70 % push is full speed').toBeGreaterThanOrEqual(RUN - 1);
    expect(at(1)).toBeGreaterThanOrEqual(RUN - 1);

    // 2. from standing, a full push and a 70 % push
    await push(0, -1); const full = (await frames(30)).map(r => r.vd);
    await push(0, -0.7); const p70 = (await frames(30)).map(r => r.vd);
    out.full = { t50: reach(full, RUN, 0.5), t90: reach(full, RUN, 0.9), first: full[0] };
    out.p70 = { t50: reach(p70, RUN, 0.5), t90: reach(p70, RUN, 0.9) };
    expect(out.full.t50).toBeLessThanOrEqual(50);
    expect(out.full.t90).toBeLessThanOrEqual(120);
    expect(out.p70.t90).toBeLessThanOrEqual(120);
    expect(out.full.first, 'eased in over a few frames, not a jump').toBeLessThan(RUN * 0.5);

    // 3. a juke: full right, then full left in one move
    await push(1, 0); await frames(20);
    await move({ x: O.x - R, y: O.y });
    const juke = (await frames(30)).map(r => r.vx);
    out.juke = { t50: reach(juke, -RUN, 0.5), t90: reach(juke, -RUN, 0.9) };
    expect(out.juke.t50).toBeLessThanOrEqual(67);
    expect(out.juke.t90).toBeLessThanOrEqual(135);

    // 4. a thumb landing in the bottom-left corner of the canvas and barely moving: no push
    await park();
    const corner = toPage(4, c.H - 4);
    await down(corner); await frames(2);
    await move({ x: corner.x + 1, y: corner.y - 1 });
    const cf = await frames(30);
    out.corner = { mag: cf[0].axis.mag, vx: cf[cf.length - 1].vx || 0, vd: cf[cf.length - 1].vd || 0 };
    expect(out.corner).toEqual({ mag: 0, vx: 0, vd: 0 });

    // 5. dragged 3x the travel up the field, then brought back down 1.5x: it now steers back down
    await push(0, -3); await frames(20);
    await move({ x: O.x, y: O.y - 1.5 * R });
    const bk = await frames(30);
    out.overshoot = { axisY: Math.round(bk[0].axis.y * 100) / 100, vd: bk[bk.length - 1].vd };
    expect(out.overshoot.axisY).toBeGreaterThan(0.3);
    expect(out.overshoot.vd).toBeLessThan(0);
    await up();

    // 6. the keyboard: hold Up from standing
    await park();
    await J(f, 'press', 'up'); const kb = (await frames(30)).map(r => r.vd); await J(f, 'release', 'up');
    out.keys = { t50: reach(kb, RUN, 0.5), t90: reach(kb, RUN, 0.9) };
    expect(out.keys.t90).toBeLessThanOrEqual(120);

    if (process.env.JC_STICK_LOG) console.log(JSON.stringify(out));
    expect(errors).toEqual([]);
  });
});
