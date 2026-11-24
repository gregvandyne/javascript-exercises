#!/usr/bin/env node
// Builds Castle Clash's puzzle packs from the Lichess puzzle database (CC0, https://database.lichess.org/#puzzles):
//   public/vendor/data/castle-clash/<version>/p<band>.js   one file per 200-point rating band (600 to 2199)
// and writes the version, the bands and each file's sha384 into seed-games/castle-clash.html between its
// `// ==== PUZZLE PACKS START ====` and `// ==== PUZZLE PACKS END ====` markers (the game loads one band at a time
// with a script tag and its checksum, the way the other games load /vendor/data packs; the frame CSP allows no fetch).
//
// The database is streamed (curl -> Node's own zstd) and only read until every band has enough candidates; it is never
// written to disk. Each kept puzzle is replayed with the game's own move generator (the ENGINE block of the HTML, run
// in node:vm): every move must be legal, a mate puzzle must end in checkmate, any other puzzle must not lose material
// for the solver. GameUrl (a link out) and OpeningTags are dropped.
//
//   node scripts/chess-puzzles.mjs              download, select, validate, write packs and patch the game
//   node scripts/chess-puzzles.mjs --rows 2000000   read at most this many rows (default 2,500,000)
//
// Lichess puzzle format: FEN is the position BEFORE the opponent's move; Moves[0] is that move (the game plays it),
// then the solver plays Moves[1], Moves[3], ... and the game answers with Moves[2], Moves[4], ...
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import readline from 'node:readline';
import { spawn } from 'node:child_process';
import { Transform } from 'node:stream';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HTML_FILE = path.join(ROOT, 'seed-games/castle-clash.html');
const OUT = path.join(ROOT, 'public/vendor/data/castle-clash');
const URL = 'https://database.lichess.org/lichess_db_puzzle.csv.zst';
const argRows = process.argv.indexOf('--rows');
const MAX_ROWS = argRows > 0 ? +process.argv[argRows + 1] : 2_500_000;

// The themes the game knows, in bit order (the packs store a bit mask). Keep this list in step with PZ_THEMES in the game.
export const THEMES = ['mateIn1', 'mateIn2', 'mateIn3', 'mateIn4', 'fork', 'pin', 'skewer', 'hangingPiece', 'discoveredAttack',
  'backRankMate', 'promotion', 'endgame', 'sacrifice', 'deflection', 'attraction', 'smotheredMate', 'doubleCheck', 'trappedPiece',
  'kingsideAttack', 'quietMove', 'defensiveMove', 'clearance', 'interference', 'xRayAttack', 'capturingDefender', 'intermezzo',
  'opening', 'middlegame', 'advancedPawn', 'mate'];
// What a band's selection is spread over (round robin), so every theme pack has puzzles at every level.
const SPREAD = ['mateIn1', 'mateIn2', 'mateIn3', 'fork', 'pin', 'skewer', 'hangingPiece', 'discoveredAttack', 'backRankMate',
  'promotion', 'endgame', 'sacrifice', 'deflection', 'attraction', 'trappedPiece', 'other'];
export const BANDS = [600, 800, 1000, 1200, 1400, 1600, 1800, 2000];   // each band is [b, b + 200)
const PER_BAND = 520, CANDIDATES = 2600;   // ~4,160 puzzles in all

/** The game's engine (the ENGINE block of the HTML), evaluated in an empty context. */
export function loadEngine(html = fs.readFileSync(HTML_FILE, 'utf8')) {
  const m = /\/\/ ==== ENGINE START ====([\s\S]*?)\/\/ ==== ENGINE END ====/.exec(html);
  if (!m) throw new Error('no ENGINE block in castle-clash.html');
  const ctx = vm.createContext({});
  vm.runInContext(m[1] + '\n;globalThis.Engine = Engine;', ctx, { timeout: 5000 });
  return ctx.Engine;
}

const VAL = [0, 1, 3, 3, 5, 9, 0];
function material(pos, side) {   // the side's material minus the other's (kid values)
  let s = 0;
  for (let sq = 0; sq < 120; sq++) { if (sq & 0x88) continue; const p = pos.board[sq]; if (p) s += ((p & 8) === side ? 1 : -1) * VAL[p & 7]; }
  return s;
}
/** Replays a puzzle; null when it is good, else the reason it is not. */
export function checkPuzzle(E, fen, moves, themes) {
  const pos = new E.Position();
  if (!pos.setFen(fen)) return 'fen';
  if (moves.length < 2 || moves.length % 2) return 'length';
  const m0 = E.parseMove(pos, moves[0]); if (!m0) return 'opening move';
  pos.make(m0);
  const solver = pos.side, before = material(pos, solver);
  for (let i = 1; i < moves.length; i++) {
    const m = E.parseMove(pos, moves[i]);
    if (!m || !pos.legalMoves().includes(m)) return 'illegal ' + i;
    pos.make(m);
    const st = E.status(pos);
    if (st.over && i < moves.length - 1) return 'over early';
  }
  const st = E.status(pos);
  const mate = themes.some(t => /^mate/.test(t));
  if (mate) return st.reason === 'checkmate' && pos.side !== solver ? null : 'no mate';
  if (st.over) return 'draw';
  return material(pos, solver) >= before ? null : 'loses material';
}

// The file is in pzstd's format: every zstd frame comes after a skippable frame that holds its size. Node's decoder
// stops at the first skippable frame, so this passes the zstd frames on and drops the skippable ones.
function skipSkippable() {
  let buf = Buffer.alloc(0), pass = 0;
  return new Transform({
    transform(chunk, enc, cb) {
      buf = buf.length ? Buffer.concat([buf, chunk]) : chunk;
      const out = [];
      for (;;) {
        if (pass > 0) { const n = Math.min(pass, buf.length); if (!n) break; out.push(buf.subarray(0, n)); buf = buf.subarray(n); pass -= n; continue; }
        if (buf.length < 8) break;
        if ((buf.readUInt32LE(0) & 0xFFFFFFF0) === 0x184D2A50) {
          const size = buf.readUInt32LE(4); if (buf.length < 8 + size) break;
          if (size === 4) pass = -buf.readUInt32LE(8);   // the size of the zstd frame that follows
          buf = buf.subarray(8 + size);
          if (pass < 0) pass = -pass; else pass = Infinity;
          continue;
        }
        pass = Infinity;   // no size known: pass the rest through
      }
      cb(null, out.length ? Buffer.concat(out) : undefined);
    },
  });
}

async function main() {
  const E = loadEngine();
  const bands = new Map(BANDS.map(b => [b, []]));
  const curl = spawn('curl', ['-sSL', '--fail', URL], { stdio: ['ignore', 'pipe', 'inherit'] });
  const z = zlib.createZstdDecompress();
  let streamErr = null;
  z.on('error', e => { streamErr = e; });
  const rl = readline.createInterface({ input: curl.stdout.pipe(skipSkippable()).pipe(z), crlfDelay: Infinity });
  let rows = 0, kept = 0; const reasons = {};
  const full = () => [...bands.values()].every(l => l.length >= CANDIDATES);
  for await (const line of rl) {
    if (rows++ === 0) { if (!line.startsWith('PuzzleId,FEN,Moves')) throw new Error('unexpected header: ' + line); continue; }
    if (rows > MAX_ROWS || full()) break;
    const c = line.split(',');
    const [id, fen, mv, rating, rd, pop, plays, th] = c;
    const r = +rating;
    if (!Number.isFinite(r) || !(+pop >= 90 && +plays >= 1000 && +rd <= 80) || r < 600 || r >= 2200) continue;
    const band = BANDS[Math.floor((r - 600) / 200)], list = bands.get(band);
    if (list.length >= CANDIDATES) continue;
    const moves = mv.split(' '), themes = th.split(' ');
    if (moves.length > 8) continue;   // at most four moves to find
    const bad = checkPuzzle(E, fen, moves, themes);
    if (bad) { reasons[bad] = (reasons[bad] || 0) + 1; continue; }
    list.push({ id, fen, moves, r, pop: +pop, plays: +plays, themes });
    kept++;
    if (rows % 200000 === 0) process.stderr.write(`  ${rows} rows, ${kept} candidates\n`);
  }
  curl.kill();
  if (streamErr && rows < 1000) throw streamErr;
  console.log(`read ${rows} rows; ${kept} candidates; rejected by replay: ${JSON.stringify(reasons)}`);

  // per band: round robin over the spread themes, most loved first (popularity, then plays)
  const packs = {};
  let total = 0; const themeCount = {};
  for (const [b, list] of bands) {
    list.sort((a, c) => c.pop - a.pop || c.plays - a.plays);
    const buckets = new Map(SPREAD.map(s => [s, []]));
    for (const p of list) { const s = SPREAD.find(x => p.themes.includes(x)) || 'other'; buckets.get(s).push(p); }
    const pick = [];
    while (pick.length < PER_BAND && [...buckets.values()].some(x => x.length)) for (const x of buckets.values()) if (x.length && pick.length < PER_BAND) pick.push(x.shift());
    pick.sort((a, c) => a.r - c.r);
    packs[b] = pick.map(p => {
      let mask = 0; for (const t of p.themes) { const i = THEMES.indexOf(t); if (i >= 0) mask |= 1 << i; themeCount[t] = (themeCount[t] || 0) + 1; }
      return [p.id, p.fen, p.moves.join(' '), p.r, mask >>> 0];
    });
    total += pick.length;
    console.log(`band ${b}-${b + 199}: ${pick.length} of ${list.length} candidates`);
  }
  const bodies = {};
  for (const b of BANDS) {
    bodies[b] = `/* Castle Clash puzzles, rated ${b} to ${b + 199}: from the Lichess puzzle database (CC0 1.0, database.lichess.org),\n`
      + `   built and checked by scripts/chess-puzzles.mjs. Each: [id, FEN before the opponent's move, moves (UCI), rating, theme bits]. */\n`
      + `(window.CCPuzzles = window.CCPuzzles || {})[${JSON.stringify('p' + b)}] = ${JSON.stringify(packs[b])};\n`;
  }
  const hash = crypto.createHash('sha256').update(BANDS.map(b => bodies[b]).join('\n')).digest('hex').slice(0, 8);
  const ver = `v1-${hash.replace(/[0-9]/g, d => 'ghijklmnop'[+d])}`;   // letters only (no digit runs in the game file)
  fs.mkdirSync(OUT, { recursive: true });
  for (const d of fs.readdirSync(OUT)) if (d !== ver && d.startsWith('v1-')) fs.rmSync(path.join(OUT, d), { recursive: true, force: true });
  fs.mkdirSync(path.join(OUT, ver), { recursive: true });
  const sri = {}; let bytes = 0;
  for (const b of BANDS) {
    const f = path.join(OUT, ver, `p${b}.js`); fs.writeFileSync(f, bodies[b]); bytes += Buffer.byteLength(bodies[b]);
    sri['p' + b] = 'sha384-' + crypto.createHash('sha384').update(bodies[b]).digest('base64');
  }
  // the game's content scanner reads the checksums too: a checksum that happens to spell a blocked word gets a new one
  const { scanVersion } = await import('../server/services/scanner.js');
  for (const b of BANDS) {
    for (let n = 1; scanVersion(`<title>T</title><script>const s = "${sri['p' + b]}";</script>`).status !== 'pass'; n++) {
      bodies[b] = bodies[b].replace(/\n\/\/ salt \d+\n$/, '\n') + `// salt ${n}\n`;
      fs.writeFileSync(path.join(OUT, ver, `p${b}.js`), bodies[b]);
      sri['p' + b] = 'sha384-' + crypto.createHash('sha384').update(bodies[b]).digest('base64');
    }
  }
  const block = `// ==== PUZZLE PACKS START ====\n// written by scripts/chess-puzzles.mjs (${total} Lichess puzzles, CC0): do not edit by hand\n`
    + `const PZ_VER = ${JSON.stringify(ver)};\nconst PZ_BANDS = ${JSON.stringify(BANDS)};\nconst PZ_THEMES = ${JSON.stringify(THEMES)};\n`
    + `const PZ_SRI = ${JSON.stringify(sri)};\n// ==== PUZZLE PACKS END ====`;
  let html = fs.readFileSync(HTML_FILE, 'utf8');
  const re = /\/\/ ==== PUZZLE PACKS START ====[\s\S]*?\/\/ ==== PUZZLE PACKS END ====/;
  if (!re.test(html)) throw new Error('no PUZZLE PACKS markers in castle-clash.html');
  html = html.replace(re, () => block);
  fs.writeFileSync(HTML_FILE, html);
  const top = Object.entries(themeCount).sort((a, b) => b[1] - a[1]).slice(0, 30).map(([k, v]) => `${k} ${v}`).join(', ');
  console.log(`wrote ${total} puzzles in ${BANDS.length} packs (${(bytes / 1024).toFixed(0)} KB) to public/vendor/data/castle-clash/${ver}/`);
  console.log('themes: ' + top);
  process.exit(0);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
