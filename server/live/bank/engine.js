// The Oomba Live question bank engine, shared by the server (live sessions, server/live/bank/index.js) and the games'
// solo practice (the same code is copied into each language pack, public/vendor/data/live-bank/<version>/<lang>.js, by
// scripts/live-bank.js). Plain ES2017, no imports: the pack builder strips the `export` keyword.
//
// data:    { <subject>: { <level>: [[question, right, wrong, wrong?, wrong?], …] } }  (hand-written subjects)
// strings: { subject: {id: name}, level: {id: name}, math: {kind: template with {a} {b}…}, tf: [true, false] }
// rand:    () => a number in [0, 1)
// Every item that comes out is { q, choices, answer, secs, cat, id } with the right answer at a random place.
export const SUBJECTS = ['math', 'science', 'geography', 'words', 'history', 'general'];
export const LEVELS = ['a6', 'a8', 'a10', 'a12'];
export const COUNTS = [5, 10, 15, 20];
const SECS = { a6: 30, a8: 25, a10: 20, a12: 20 };

export function makeBank(data, strings, rand) {
  const R = typeof rand === 'function' ? rand : Math.random;
  const ri = (lo, hi) => lo + Math.floor(R() * (hi - lo + 1));
  const fill = (tpl, v) => String(tpl).replace(/\{(\w+)\}/g, (m, k) => (k in v ? String(v[k]) : m));
  const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); const t = a[i]; a[i] = a[j]; a[j] = t; } return a; };
  const subjectName = id => (strings.subject && strings.subject[id]) || id;
  const levelName = id => (strings.level && strings.level[id]) || id;
  const hasText = s => !!(data[s] && LEVELS.some(l => data[s][l] && data[s][l].length));
  const subjects = () => SUBJECTS.filter(s => s === 'math' ? !!(strings.math && strings.math.add) : hasText(s));

  // ---- maths, made fresh at every level -------------------------------------------------------------------------
  function near(ans, spread, opts) {
    const out = [];
    for (let i = 0; out.length < 3 && i < 300; i++) {
      const d = ri(1, Math.max(2, spread)) * (R() < 0.5 ? -1 : 1), v = ans + d;
      if ((opts && opts.neg) || v >= 0) if (v !== ans && out.indexOf(v) < 0) out.push(v);
    }
    for (let v = ans + 1; out.length < 3; v++) if (out.indexOf(v) < 0) out.push(v);
    return out;
  }
  const M = strings.math || {};
  const KINDS = { a6: ['add', 'sub'], a8: ['add', 'sub', 'times', 'missing'], a10: ['add', 'sub', 'times', 'div', 'frac'], a12: ['pct', 'neg', 'alg', 'sq', 'frac', 'div'] };
  function mathItem(level) {
    const kinds = KINDS[level] || KINDS.a8, kind = kinds[ri(0, kinds.length - 1)];
    let q, ans, spread = 3, neg = false;
    if (kind === 'add') { const top = level === 'a6' ? 10 : level === 'a8' ? 100 : 1000; const a = ri(1, top), b = ri(1, top); ans = a + b; q = fill(M.add, { a, b }); spread = level === 'a6' ? 2 : level === 'a8' ? 10 : 40; }
    else if (kind === 'sub') { const top = level === 'a6' ? 10 : level === 'a8' ? 100 : 1000; let a = ri(1, top), b = ri(1, top); if (b > a) { const t = a; a = b; b = t; } ans = a - b; q = fill(M.sub, { a, b }); spread = level === 'a6' ? 2 : level === 'a8' ? 10 : 40; }
    else if (kind === 'times') { const top = level === 'a8' ? 5 : 12; const a = level === 'a8' ? [2, 3, 4, 5, 10][ri(0, 4)] : ri(2, top), b = ri(2, level === 'a8' ? 10 : 12); ans = a * b; q = fill(M.times, { a, b }); spread = Math.max(3, Math.round(ans / 8)); }
    else if (kind === 'missing') { const a = ri(2, 20), c = a + ri(2, 20); ans = c - a; q = fill(M.missing, { a, c }); spread = 4; }
    else if (kind === 'div') { const b = ri(2, level === 'a12' ? 15 : 10); ans = ri(2, 12); q = fill(M.div, { a: ans * b, b }); spread = 3; }
    else if (kind === 'frac') { const d = [2, 3, 4, 5, 10][ri(0, 4)], n = level === 'a12' ? ri(1, d - 1) : 1, x = d * ri(2, 12); ans = (x / d) * n; q = fill(M.frac, { n, d, x }); spread = Math.max(2, Math.round(ans / 5)); }
    else if (kind === 'pct') { const p = [10, 20, 25, 50, 75, 5][ri(0, 5)], x = [20, 40, 60, 80, 100, 120, 200, 400][ri(0, 7)]; ans = (p * x) / 100; q = fill(M.pct, { p, x }); spread = Math.max(2, Math.round(ans / 4)); }
    else if (kind === 'neg') { const a = ri(1, 15), b = a + ri(1, 15); ans = a - b; q = fill(M.sub, { a, b }); spread = 4; neg = true; }
    else if (kind === 'alg') { const x = ri(1, 12), a = ri(2, 9), b = ri(1, 20); ans = x; q = fill(M.alg, { a, b, c: a * x + b }); spread = 3; }
    else { const a = ri(2, 15); ans = a * a; q = fill(M.sq, { a }); spread = Math.max(3, Math.round(ans / 6)); }
    const right = String(ans), choices = shuffle([right].concat(near(ans, spread, { neg }).map(String)));
    return { q, choices, answer: choices.indexOf(right), secs: SECS[level] || 20, cat: subjectName('math'), id: 'math:' + level + ':' + q };
  }

  // ---- hand-written subjects ------------------------------------------------------------------------------------
  function textItem(s, level, i) {
    const row = data[s][level][i], right = row[1];
    const choices = shuffle(row.slice(1));
    return { q: row[0], choices, answer: choices.indexOf(right), secs: SECS[level] || 20, cat: subjectName(s), id: s + ':' + level + ':' + i };
  }
  /** The levels a subject has, the asked one first, then the nearest. */
  function levelsNear(s, level) {
    const at = Math.max(0, LEVELS.indexOf(level));
    return LEVELS.slice().sort((x, y) => Math.abs(LEVELS.indexOf(x) - at) - Math.abs(LEVELS.indexOf(y) - at)).filter(l => data[s] && data[s][l] && data[s][l].length);
  }
  /** n items of one subject at one level. seen: a Set of item ids already played (they come last; the pool refills). */
  function pickSubject(s, level, n, seen) {
    if (s === 'math') {
      // Made-up sums can come out the same twice (ages 6-7 have about 150 different ones): a question already in this
      // pick, or already played (seen), is drawn again. After 40 tries in a row a repeat is let through, so a pick
      // bigger than the level's pool still fills.
      const out = [], used = {};
      for (let i = 0; i < n; i++) {
        let it = mathItem(level);
        for (let k = 0; k < 40 && (used[it.q] || (seen && seen.has(it.id))); k++) it = mathItem(level);
        used[it.q] = true; out.push(it);
      }
      return out;
    }
    const lv = levelsNear(s, level); if (!lv.length) return [];
    let pool = [];
    for (const l of lv) { const rows = data[s][l]; const idx = shuffle(rows.map((r, i) => i)); for (const i of idx) pool.push([l, i]); if (pool.length >= n * 2 && l !== lv[0]) break; }
    // the asked level first, unplayed before played
    const fresh = pool.filter(p => !(seen && seen.has(s + ':' + p[0] + ':' + p[1])));
    const ordered = (fresh.length >= n ? fresh : fresh.concat(pool.filter(p => fresh.indexOf(p) < 0)));
    return ordered.slice(0, n).map(p => textItem(s, p[0], p[1]));
  }

  /**
   * A question set. subject: an id, or 'mixed' (every subject of this language, taken in turn). count: how many.
   * -> items in play order.
   */
  function pick({ subject = 'mixed', level = 'a8', count = 10, seen = null } = {}) {
    const n = Math.max(1, Math.min(50, count | 0 || 10)), lv = LEVELS.indexOf(level) >= 0 ? level : 'a8';
    if (subject !== 'mixed' && subjects().indexOf(subject) >= 0) return pickSubject(subject, lv, n, seen);
    const list = subjects(), per = {}, out = [];
    for (const s of list) per[s] = pickSubject(s, lv, Math.ceil(n / list.length) + 1, seen);
    for (let i = 0; out.length < n && i < n * list.length; i++) { const s = list[i % list.length]; const it = per[s].shift(); if (it) out.push(it); }
    return shuffle(out).slice(0, n);
  }

  /**
   * A Brain Board: up to 6 subjects (columns) x 5 rising tiles. The first tiles come from the level below the asked one,
   * the last from the level above, so a column goes from easy to hard. -> items grouped by column, easy to hard
   * (the board keeps the set's order).
   */
  function board({ subjects: cols = null, level = 'a8', seen = null } = {}) {
    const all = subjects();
    let use = (Array.isArray(cols) ? cols.filter(s => all.indexOf(s) >= 0) : []).slice(0, 6);
    if (use.length < 2) use = all.slice(0, 5);
    const at = Math.max(0, LEVELS.indexOf(level)), lower = LEVELS[Math.max(0, at - 1)], upper = LEVELS[Math.min(LEVELS.length - 1, at + 1)];
    const rows = [lower, LEVELS[at], LEVELS[at], upper, upper];
    const out = [];
    for (const s of use) {
      const got = [], ids = new Set(seen || []);
      for (const l of rows) { const it = pickSubject(s, l, 1, { has: id => ids.has(id) })[0]; if (it) { ids.add(it.id); got.push(it); } }
      for (const it of got) out.push(it);
    }
    return out;
  }

  return { subjects, levels: () => LEVELS.slice(), subjectName, levelName, pick, board, mathItem };
}

// ---- solo practice: the setup card the three live games show before playing alone ------------------------------
// setup(host, { strings, board: bool, saved }, onStart(choice)) puts a card in `host` (a DOM element) to choose the
// subject (or, for a board, the subjects), the level and the number of questions. choice: { subject, subjects, level,
// count }. Only DOM and its own CSS (class prefix obk-); sized for phones, tablets and projectors.
export function setupCard(doc, host, opts, onStart) {
  const S = opts.strings || {}, bank = opts.bank, isBoard = !!opts.board, saved = opts.saved || {};
  const st = {
    subject: saved.subject && (saved.subject === 'mixed' || bank.subjects().indexOf(saved.subject) >= 0) ? saved.subject : 'mixed',
    subjects: Array.isArray(saved.subjects) ? saved.subjects.filter(s => bank.subjects().indexOf(s) >= 0) : bank.subjects().slice(0, 5),
    level: LEVELS.indexOf(saved.level) >= 0 ? saved.level : 'a8',
    count: COUNTS.indexOf(saved.count) >= 0 ? saved.count : 10,
  };
  if (st.subjects.length < 2) st.subjects = bank.subjects().slice(0, 5);
  if (!doc.getElementById('obk-css')) {
    const css = doc.createElement('style'); css.id = 'obk-css';
    css.textContent = '.obk{position:fixed;inset:0;z-index:50;display:flex;align-items:center;justify-content:center;padding:12px;background:rgba(15,20,48,.55);overflow:auto}'
      + '.obk-card{width:min(640px,100%);max-height:100%;overflow:auto;box-sizing:border-box;background:#fff8e6;color:#1d2340;border:4px solid #1d2340;border-radius:24px;box-shadow:0 8px 0 #1d2340;padding:clamp(14px,3vw,26px);font-family:inherit;display:flex;flex-direction:column;gap:clamp(10px,2vh,16px)}'
      + '.obk-card h2{margin:0;text-align:center;font-size:clamp(22px,4vw,32px)}'
      + '.obk-card h3{margin:0 0 6px;font-size:clamp(15px,2.4vw,19px)}'
      + '.obk-chips{display:flex;flex-wrap:wrap;gap:8px}'
      + '.obk-chip{min-height:46px;min-width:46px;padding:8px 14px;border-radius:999px;border:3px solid #1d2340;background:#fff;color:#1d2340;font:inherit;font-weight:800;font-size:clamp(15px,2.4vw,18px);cursor:pointer;box-shadow:0 3px 0 #1d2340}'
      + '.obk-chip[aria-pressed="true"]{background:#ffd24a}'
      + '.obk-chip:focus-visible{outline:4px solid #3d6bff;outline-offset:2px}'
      + '.obk-go{min-height:56px;border-radius:18px;border:3px solid #1d2340;background:#37c47a;color:#0b2a17;font:inherit;font-weight:900;font-size:clamp(19px,3.2vw,24px);cursor:pointer;box-shadow:0 5px 0 #1d2340}'
      + '.obk-go:disabled{opacity:.5;cursor:default}'
      + '.obk-note{margin:0;font-size:14px;opacity:.8;text-align:center}'
      // tablets and big screens: bigger card and chips
      + '@media (min-width:700px) and (min-height:700px){.obk-card{width:min(760px,100%)}.obk-card h2{font-size:34px}.obk-card h3{font-size:20px}.obk-chip{min-height:56px;padding:10px 18px;font-size:20px}.obk-go{min-height:66px;font-size:26px}}'
      // short screens (a phone on its side): two columns, the title and the Start button across both
      + '@media (max-height:520px){.obk{padding:6px}.obk-card{gap:6px 16px;padding:10px 14px;border-width:3px}.obk-card h2{font-size:19px}.obk-card h3{font-size:14px;margin-bottom:4px}.obk-chips{gap:6px}.obk-chip{min-height:42px;padding:4px 12px;font-size:15px}.obk-go{min-height:46px;font-size:19px}}'
      + '@media (max-height:520px) and (min-width:560px){.obk-card{display:grid;grid-template-columns:1fr 1fr;align-content:start;width:min(900px,100%)}.obk-card h2,.obk-go,.obk-note{grid-column:1/-1}}';
    doc.head.appendChild(css);
  }
  const wrap = doc.createElement('div'); wrap.className = 'obk';
  const card = doc.createElement('section'); card.className = 'obk-card'; card.setAttribute('role', 'dialog'); card.setAttribute('aria-modal', 'true');
  wrap.appendChild(card);
  const h = (tag, text, cls) => { const e = doc.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const title = h('h2', S.title || 'Choose your questions'); title.id = 'obk-title'; card.setAttribute('aria-labelledby', 'obk-title'); card.appendChild(title);
  function group(label, items, isOn, onPick, multi) {
    const g = h('div'); const head = h('h3', label); g.appendChild(head);
    const row = h('div', null, 'obk-chips'); row.setAttribute('role', multi ? 'group' : 'radiogroup'); row.setAttribute('aria-label', label);
    items.forEach(([id, name]) => {
      const b = h('button', name, 'obk-chip'); b.type = 'button'; b.dataset.id = String(id);
      b.setAttribute('aria-pressed', String(isOn(id)));
      b.addEventListener('click', () => { onPick(id); items.forEach(([iid], k) => row.children[k].setAttribute('aria-pressed', String(isOn(iid)))); refresh(); });
      row.appendChild(b);
    });
    g.appendChild(row); card.appendChild(g);
  }
  const subs = bank.subjects().map(s => [s, bank.subjectName(s)]);
  if (isBoard) {
    group(S.boardSubjects || 'Board subjects (2 to 6)', subs, id => st.subjects.indexOf(id) >= 0, id => {
      const i = st.subjects.indexOf(id);
      if (i >= 0) { if (st.subjects.length > 2) st.subjects.splice(i, 1); } else if (st.subjects.length < 6) st.subjects.push(id);
    }, true);
  } else {
    group(S.subject || 'Subject', [['mixed', S.mixed || 'Mixed']].concat(subs), id => st.subject === id, id => { st.subject = id; });
  }
  group(S.level || 'Level', LEVELS.map(l => [l, bank.levelName(l)]), id => st.level === id, id => { st.level = id; });
  if (!isBoard) group(S.count || 'Questions', COUNTS.map(n => [n, String(n)]), id => st.count === id, id => { st.count = id; });
  const go = h('button', S.start || 'Start!', 'obk-go'); go.type = 'button'; card.appendChild(go);
  if (S.note) card.appendChild(h('p', S.note, 'obk-note'));
  function refresh() { go.disabled = isBoard && st.subjects.length < 2; }
  go.addEventListener('click', () => { wrap.remove(); onStart({ subject: st.subject, subjects: st.subjects.slice(), level: st.level, count: st.count }); });
  host.appendChild(wrap); refresh();
  setTimeout(() => { const f = card.querySelector('[aria-pressed="true"]') || go; try { f.focus({ preventScroll: true }); } catch (e) { /* ignore */ } }, 30);
  return { close: () => wrap.remove() };
}
