// CS Quest: check every Robo Route picture's focus boxes and drawn paths against the real board.
// The board in each picture is recorded by the capture scripts (node scripts/csq-shots.js --geometry … and
// node scripts/csq-shots-rollout.js --geometry … robo-route) into scripts/csq-route-geometry.json: the cell grid in %
// of the 1280x720 picture, the cells, Bolt, the program blocks and the other parts a cue can name. This check:
//   - every path point sits on a cell centre, every leg is a straight row or column (Bolt never moves diagonally),
//     no leg crosses a wall or water, the path starts on Bolt (pictured or at the start) and ends on the goal or on
//     the target its slide names (ENDS below), and it stays inside its focus box;
//   - every path is a stretch of the route Bolt really drives: the pictured program run on the level by the game's
//     own engine, or the level's answer when the tray holds no program (FREE routes: a route the slide compares);
//   - every focus box and path sits inside the picture and inside the slide's view crop, when it has one;
//   - the pictured board still matches the level data (walls, water, goal), so a game change cannot leave a stale picture;
//   - the claims a slide makes about the pictured program (moves, pick-ups, reaching the flag) hold when it runs.
// Usage: node scripts/csq-route-check.js [--report]   (exit 1 on any error). tests/unit/cs-quest-route-paths.test.js runs it.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const COURSE = path.join(ROOT, 'seed-lessons', 'cs-quest', 'course');

// Paths that end somewhere other than the goal, by slide (band-step sN fK): the cell the cue names.
// A route split into legs (one focus step each) chains: a leg may start where the previous path ended and end where
// the next one starts.
const ENDS = {
  '1b-1.1 s4 f1': { cell: 'bolt', why: 'the trail Bolt has driven so far ends where Bolt stands' },
  '1b-1.4 s4 f2': { cell: 'bolt', why: 'the gems counted so far: up to where Bolt stands' },
  '1b-1.4 s4 f3': { cell: [0, 0], why: 'the gems still to count: up to the top gem' },
  '2-1.2 s3 f1': { cell: [1, 5], why: 'one stair of the staircase' },
  '2-1.5 s1 f1': { cell: [1, 6], why: 'one zigzag of the staircase' },
};
// Routes a slide draws that are not the pictured program or the level's answer (a slide comparing two routes).
const FREE = new Set(['2-1.1 s4 f1']);
// What a slide says the pictured program does, replayed on its level.
const CLAIMS = {
  '1b-1.1 s2': { moves: 4, goal: true },
  '1b-1.1 s3': { moves: 7, goal: true, turns: 2 },
  '1b-1.1 s4': { moves: 6, goal: true },
  '1b-1.2 s1': { moves: 5, goal: true },
  '1b-1.2 s3': { moves: 5, goal: true },
  '1b-1.2 s4': { moves: 5, picks: 2, goal: true },
  '1b-1.2 s5': { moves: 0, goal: false },
  '1b-1.3 s3': { goal: true },
  '1b-1.4 s2': { picks: 5, goal: true, vars: { count: 5 } },
  '1b-1.5 s3': { picks: 3, goal: true },
  '1b-1.5 s4': { moves: 0 },
  '1b-2.1 s4': { moves: 5, solved: false },
  '1b-2.1 s5': { goal: true },
  '2-1.1 s3': { picks: 2, goal: true },
  '2-1.2 s1': { moves: 7, goal: true },
  '2-1.2 s3': { moves: 9, goal: true },
  '2-1.2 s4': { picks: 6, goal: true },
  '2-1.3 s1': { goal: true },
  '2-1.3 s4': { goal: true },
  '2-1.4 s2': { picks: 7, goal: true, vars: { count: 7 } },
  '2-1.4 s4': { goal: true },
  '2-1.5 s2': { goal: true },
  '2-1.5 s3': { picks: 3, goal: true },
  '2-1.5 s4': { picks: 3, goal: true },
  '2-1.5 s5': { picks: 3, goal: true },
};

export function loadEngine() {
  const html = fs.readFileSync(path.join(ROOT, 'seed-games', 'robo-route.html'), 'utf8');
  const ctx = vm.createContext({ window: {} });
  for (const m of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) vm.runInContext(m[1], ctx);
  return { E: ctx.window.RoboRoute, LV: ctx.window.RoboRouteLevels };
}

export function loadDecks() {
  const out = [];
  for (const band of ['1b', '2']) {
    const dir = path.join(COURSE, band);
    for (const f of fs.readdirSync(dir).filter(x => x.endsWith('.json')).sort((a, b) => parseFloat(a) - parseFloat(b))) {
      const deck = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
      deck.slides.forEach((s, i) => out.push({ id: `${band}-${deck.n} s${i + 1}`, band, slide: s }));
    }
  }
  return out;
}

const cellCenter = (g, c, r) => [g.cell.x0 + g.cell.w / 2 + c * g.cell.dx, g.cell.y0 + g.cell.h / 2 + r * g.cell.dy];
const toCell = (g, [x, y]) => [(x - g.cell.x0 - g.cell.w / 2) / g.cell.dx, (y - g.cell.y0 - g.cell.h / 2) / g.cell.dy];
const same = (a, b) => a[0] === b[0] && a[1] === b[1];

/** The cells Bolt drives (start first) when the program runs on the pictured board. */
export function routeOf(E, LV, g, text) {
  const l = LV.levelsFor(g.shot.chapter, g.shot.band)[g.shot.level - 1];
  const res = E.run(l, LV.parse(text), { planMatch: true, starter: l.starter ? LV.parse(l.starter) : null }).results[g.layout || 0];
  const start = res.grid.start, cells = [[start.x, start.y]];
  let picks = 0, turns = 0;
  for (const e of res.events) { if (e.k === 'move') cells.push([e.x, e.y]); else if (e.k === 'pick') picks++; else if (e.k === 'turn') turns++; }
  const last = cells[cells.length - 1];
  return { cells, picks, turns, moves: cells.length - 1, goal: !!res.grid.goal && same(last, [res.grid.goal.x, res.grid.goal.y]), ok: res.verdict.ok, vars: res.vars, grid: res.grid, level: l };
}

export function checkRoutes() {
  const geo = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts', 'csq-route-geometry.json'), 'utf8'));
  const { E, LV } = loadEngine();
  const errors = [], report = [];
  const err = (id, m) => errors.push(`${id}: ${m}`);

  // the pictured boards still match the level data
  for (const [key, g] of Object.entries(geo)) {
    if (!g || !g.rows || /^maker/.test(g.level)) continue;   // a maker design is the kid's own board, not level data
    const l = LV.levelsFor(g.shot.chapter, g.shot.band)[g.shot.level - 1];
    if (!l || l.id !== g.level) { err(key, `pictured level ${g.level} is not ${g.shot.chapter}/${g.shot.band}/${g.shot.level} any more (${l && l.id})`); continue; }
    const grid = E.layoutsOf(l)[g.layout || 0];
    for (let y = 0; y < grid.h; y++) for (let x = 0; x < grid.w; x++) {
      const t = grid.cells[y * grid.w + x], p = (g.rows[y] || '')[x];
      const want = grid.goal && grid.goal.x === x && grid.goal.y === y ? 'G' : t === 'wall' ? '#' : t === 'water' ? '~' : null;
      if (want && p !== want) err(key, `pictured cell ${x},${y} is ${p}, the level has ${want}: recapture the picture`);
      if (!want && (p === '#' || p === '~' || p === 'G')) err(key, `pictured cell ${x},${y} is ${p}, the level has ${t}: recapture the picture`);
    }
  }

  for (const { id, slide: s } of loadDecks()) {
    if (!s.img || !s.img.startsWith('csq/robo-route/')) continue;
    const g = geo[s.img];
    if (!g) { err(id, `${s.img} has no recorded geometry (run the capture scripts with --geometry)`); continue; }
    const v = s.view;
    if (v) {
      if (v.length !== 4 || v[0] < -0.01 || v[1] < -0.01 || v[0] + v[2] > 100.01 || v[1] + v[3] > 100.01) err(id, `view ${JSON.stringify(v)} is outside the picture`);
    }
    const inside = (x, y, b, tol = 0.3) => x >= b[0] - tol && y >= b[1] - tol && x <= b[0] + b[2] + tol && y <= b[1] + b[3] + tol;
    let prog = null;
    if (g.rows) {
      const l = LV.levelsFor(g.shot.chapter, g.shot.band)[g.shot.level - 1];
      const text = g.shot.program || l.starter || null;
      if (text) prog = routeOf(E, LV, g, text);
      if (prog) report.push(`${id.padEnd(10)} ${s.img.slice(15).padEnd(32)} ${l.id.padEnd(8)} moves ${prog.moves} picks ${prog.picks} turns ${prog.turns} end ${prog.cells[prog.cells.length - 1]} flag ${prog.goal ? 'yes' : 'no'} solved ${prog.ok ? 'yes' : 'no'} vars ${JSON.stringify(prog.vars)}`);
    }
    const claim = CLAIMS[id];
    if (claim) {
      if (!prog) err(id, 'the slide makes claims about a program, but the picture holds none');
      else {
        for (const k of ['moves', 'picks', 'turns']) if (claim[k] != null && prog[k] !== claim[k]) err(id, `the pictured program makes ${prog[k]} ${k}, the slide says ${claim[k]}`);
        if (claim.solved != null && prog.ok !== claim.solved) err(id, `the pictured program ${prog.ok ? 'solves' : 'does not solve'} the level, the slide says the opposite`);
        if (claim.goal != null && prog.goal !== claim.goal) err(id, `the pictured program ${prog.goal ? 'reaches' : 'does not reach'} the flag, the slide says the opposite`);
        for (const [k, val] of Object.entries(claim.vars || {})) if (prog.vars[k] !== val) err(id, `the pictured program ends with ${k} = ${prog.vars[k]}, the slide says ${val}`);
      }
    }
    const legs = (s.focus || []).map(f => (f.path && g.rows ? f.path.map(p => toCell(g, p).map(Math.round)) : null));
    (s.focus || []).forEach((f, j) => {
      const fid = `${id} f${j + 1}`, b = f.box;
      if (!Array.isArray(b) || b.length !== 4 || b[0] < 0 || b[1] < 0 || b[0] + b[2] > 100.01 || b[1] + b[3] > 100.01) err(fid, `box ${JSON.stringify(b)} is outside the picture`);
      else if (v && !(inside(b[0], b[1], v) && inside(b[0] + b[2], b[1] + b[3], v))) err(fid, `box ${JSON.stringify(b)} is outside the view ${JSON.stringify(v)}`);
      if (typeof f.cue !== 'string' || f.cue.length < 1 || f.cue.length > 80) err(fid, `cue is ${String(f.cue).length} chars (the engine takes 1-80)`);
      if (!f.path) return;
      if (f.path.length > 8) err(fid, `path has ${f.path.length} points (the engine takes 2-8)`);
      if (!g.rows) { err(fid, 'a path on a picture with no board'); return; }
      const pts = f.path;
      if (pts.length < 2) { err(fid, 'a path needs two points'); return; }
      for (const p of pts) if (!inside(p[0], p[1], b, 0.5)) err(fid, `path point ${p} is outside its box ${JSON.stringify(b)}`);
      const cells = [];
      for (const p of pts) {
        const [c, r] = toCell(g, p), rc = Math.round(c), rr = Math.round(r);
        if (Math.abs(c - rc) > 0.15 || Math.abs(r - rr) > 0.15) err(fid, `path point ${p} is not on a cell centre (cell ${c.toFixed(2)}, ${r.toFixed(2)})`);
        cells.push([rc, rr]);
      }
      const walk = [cells[0]];
      for (let k = 1; k < cells.length; k++) {
        const [a, c] = [cells[k - 1], cells[k]];
        if (same(a, c)) { err(fid, `path repeats cell ${c}`); continue; }
        if (a[0] !== c[0] && a[1] !== c[1]) { err(fid, `leg ${a} -> ${c} is diagonal: Bolt only drives along rows and columns`); continue; }
        const dx = Math.sign(c[0] - a[0]), dy = Math.sign(c[1] - a[1]);
        for (let x = a[0] + dx, y = a[1] + dy; ; x += dx, y += dy) { walk.push([x, y]); if (x === c[0] && y === c[1]) break; }
      }
      for (const [x, y] of walk) {
        const t = (g.rows[y] || '')[x];
        if (t == null) err(fid, `path leaves the board at ${x},${y}`);
        else if (t === '#') err(fid, `path crosses a wall at ${x},${y}`);
        else if (t === '~') err(fid, `path crosses water at ${x},${y}`);
      }
      const l = LV.levelsFor(g.shot.chapter, g.shot.band)[g.shot.level - 1];
      const grid = E.layoutsOf(l)[g.layout || 0], start = [grid.start.x, grid.start.y], bolt = [g.bolt.x, g.bolt.y], goal = grid.goal ? [grid.goal.x, grid.goal.y] : null;
      const prevLeg = legs.slice(0, j).reverse().find(Boolean), nextLeg = legs.slice(j + 1).find(Boolean);
      const chainedIn = prevLeg && same(walk[0], prevLeg[prevLeg.length - 1]), chainedOut = nextLeg && same(walk[walk.length - 1], nextLeg[0]);
      if (!chainedIn && !same(walk[0], start) && !same(walk[0], bolt)) err(fid, `path starts at ${walk[0]}, not on Bolt (${bolt}) or the start (${start})`);
      const end = ENDS[fid], last = walk[walk.length - 1];
      const target = end ? (end.cell === 'bolt' ? bolt : end.cell) : goal;
      if (!chainedOut && (!target || !same(last, target))) err(fid, `path ends at ${last}, not on ${end ? 'its target' : 'the goal'} (${target})`);
      if (!FREE.has(fid)) {
        // the pictured program's route, or the level's answer when the picture shows a starter, a lone My Block or no program
        const routes = [prog, routeOf(E, LV, g, l.sol)].filter(Boolean);
        const key = c => c.join(','), ws = walk.map(key).join(';');
        if (!routes.some(r => (';' + r.cells.map(key).join(';') + ';').includes(';' + ws + ';'))) err(fid, `path ${ws} is not part of the route Bolt really drives (${routes.map(r => r.cells.map(key).join(';')).join(' or ')})`);
      }
    });
  }
  return { errors, report };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { errors, report } = checkRoutes();
  if (process.argv.includes('--report')) for (const r of report) console.log(r);
  for (const e of errors) console.log(`✗ ${e}`);
  console.log(`robo-route pictures: ${report.length} pictured program(s) replayed, ${errors.length} error(s)`);
  process.exit(errors.length ? 1 : 0);
}
