// Classroom dashboards, stage 5 (docs/decisions.md "Classroom dashboards, stage 5"): the renderers for video, the site
// window, the hall pass, class jobs, points for each student (the scoreboard's second mode), the mood check-in,
// breathing, a sticky note, a checklist and the schedule's "now and next" view. The document camera is in
// dash-camera.js (the only stage 5 file that touches a camera).
// - Video and site windows are the teacher's screen and projector only (the server never pins or pushes them).
// - What students do here (ask for a pass, tap a face) is fixed buttons, never text. A student sees only their own
//   pass, their own points and their own face; names show only inside the class, and the projector hides them where a
//   list of names would say something private (requests, points, faces).
// - Text a person typed is rendered with textContent only.
import { videoSrc } from './dash-video.js';

const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const typed = (tag, cls, text) => { const e = el(tag, cls, text); e.dir = 'auto'; return e; };
const btn = (label, cls = 'btn btn-sm', aria) => { const b = el('button', cls, label); b.type = 'button'; if (aria) b.setAttribute('aria-label', aria); return b; };
const fill = (s, vars = {}) => String(s || '').replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
const icon = (t, cls = 'dw5-ic') => { const e = el('span', cls, t); e.setAttribute('aria-hidden', 'true'); return e; };
/** An icon and its words on one button (stage 4: every icon button shows its words). */
const ibtn = (ic, words, cls = 'btn btn-sm', aria) => { const b = btn('', cls, aria); b.append(icon(ic), el('span', 'dw5-bt', words)); return b; };
/** ms -> "4:05" (whole seconds). */
export const clockOf = ms => { const s = Math.max(0, Math.floor(ms / 1000)), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60; return h ? `${h}:${String(m).padStart(2, '0')}:${String(x).padStart(2, '0')}` : `${m}:${String(x).padStart(2, '0')}`; };
/** Seconds -> "1:30" for the video's start and end. */
export const secsText = n => clockOf((+n || 0) * 1000);
const empty = (body, text) => { const p = el('p', 'dw-empty dw5-empty', text); body.appendChild(p); return p; };

// ---------------------------------------------------------------- video (teacher and projector only)
export const PASS_ICON = { bathroom: '🚻', water: '🚰', nurse: '🩹', office: '🏫', library: '📚' };
export const REASON_ICON = { kind: '💛', helpful: '🤝', teamwork: '🧩', effort: '💪', listening: '👂', responsible: '✅', brave: '🦁', creative: '🎨' };
export const MOOD_ICON = ['😄', '🙂', '😐', '😕', '😢'];
export const MOOD_KEYS = ['great', 'good', 'okay', 'meh', 'sad'];

function video(body, s, ctx) {
  const W = ctx.type.words;
  body.classList.add('dw-video', 'dw5');
  const src = s.video ? videoSrc(s.video, { start: s.start, end: s.end, mute: s.mute, loop: s.loop }) : null;
  if (!src) { const box = el('div', 'dw5-emptybox'); box.append(icon('🎬', 'dw5-bigic'), el('p', 'dw-empty', W.empty)); body.appendChild(box); return null; }
  const wrap = el('div', 'dw-vframe');
  const f = document.createElement('iframe');
  f.src = src; f.title = W.title; f.loading = 'lazy';
  f.setAttribute('allow', 'fullscreen; picture-in-picture; encrypted-media');
  f.setAttribute('allowfullscreen', '');
  // The players need to know which site embeds them (only the origin is sent); they never get to open windows or
  // navigate this page.
  f.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
  f.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-presentation');
  wrap.appendChild(f);
  body.appendChild(wrap);
  const bits = [];
  if (s.start) bits.push(`▶ ${secsText(s.start)}`);
  if (s.end > s.start) bits.push(`⏹ ${secsText(s.end)}`);
  if (s.mute) bits.push(`🔇 ${ctx.type.settings.find(x => x.key === 'mute').label}`);
  if (s.loop) bits.push(`🔁 ${ctx.type.settings.find(x => x.key === 'loop').label}`);
  if (bits.length) body.appendChild(el('p', 'dw5-meta', bits.join(' · ')));
  return null;
}

// ---------------------------------------------------------------- site window (teacher and projector only)
const SITE_SANDBOX = 'allow-scripts allow-same-origin allow-forms allow-popups';
function site(body, s, ctx) {
  const W = ctx.type.words;
  body.classList.add('dw-site', 'dw5');
  if (!s.url) { const box = el('div', 'dw5-emptybox'); box.append(icon('🌐', 'dw5-bigic'), el('p', 'dw-empty', W.empty)); body.appendChild(box); return null; }
  let host = ''; try { host = new URL(s.url).hostname; } catch { host = ''; }
  const open = () => { const a = el('a', 'btn btn-sm dw5-open'); a.href = s.url; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.append(icon('↗'), el('span', 'dw5-bt', W.open)); return a; };
  const bar = el('div', 'dw5-sitebar');
  const hostEl = el('span', 'dw5-host'); hostEl.append(icon('🔒'), el('span', 'dw5-hosttext', host)); hostEl.dir = 'ltr';
  bar.appendChild(hostEl);
  const area = el('div', 'dw5-siteframe');
  const status = el('p', 'dw5-status', W.checking); status.setAttribute('role', 'status');
  area.appendChild(status);
  body.append(bar, area);
  let timer = 0, gone = false;
  const fallback = () => {
    if (gone) return;
    clearTimeout(timer);
    area.textContent = '';
    const card = el('div', 'dw5-fallback'); card.setAttribute('role', 'status');
    card.append(icon('🚫', 'dw5-bigic'), el('b', 'dw5-fbtitle', W.blocked), el('p', 'dw5-fbtext', W.blockedText));
    const a = open(); a.classList.add('btn-primary'); card.appendChild(a);
    area.appendChild(card);
  };
  (async () => {
    await ctx.flush();
    const r = await ctx.get(`/site/${encodeURIComponent(ctx.id)}`).catch(() => null);
    if (gone) return;
    if (!r || r.frame !== 'ok') return fallback();
    area.textContent = '';
    const f = document.createElement('iframe');
    f.title = fill(W.frameTitle, { host }); f.setAttribute('sandbox', SITE_SANDBOX); f.setAttribute('referrerpolicy', 'no-referrer');
    let loaded = false;
    f.addEventListener('load', () => { loaded = true; clearTimeout(timer); });
    // A site that says yes but never answers: the fallback after 12 seconds.
    timer = setTimeout(() => { if (!loaded) fallback(); }, 12000);
    f.src = `/class/${encodeURIComponent(ctx.classId)}/dashboard/frame/${encodeURIComponent(ctx.id)}`;
    area.appendChild(f);
    bar.appendChild(open());
  })();
  return { destroy() { gone = true; clearTimeout(timer); } };
}

// ---------------------------------------------------------------- hall pass
function hallpass(body, s, ctx) {
  const W = ctx.type.words;
  body.classList.add('dw-pass', 'dw5');
  const placeWord = p => W[`p_${p}`] || p;
  const limit = (s.mins || 5) * 60e3;
  if (ctx.role === 'student') {
    const box = el('div', 'dw5-passme'); box.setAttribute('aria-live', 'polite');
    body.appendChild(box);
    let mine = null, timeEl = null, sig = '';
    const act = async b => { const r = await ctx.act('/pass', b); if (r) { ctx.live().pass = { mine: r.mine }; draw(); ctx.say(box.querySelector('.dw5-passline')?.textContent || W.ask); } };
    const draw = live => {
      mine = (((live || ctx.live()).pass) || {}).mine || null;
      const s2 = JSON.stringify(mine); if (s2 === sig) return; sig = s2;
      box.textContent = ''; timeEl = null;
      if (!mine) {
        box.appendChild(el('p', 'dw5-passline', W.ask));
        const grid = el('div', 'dw5-places'); grid.setAttribute('role', 'group'); grid.setAttribute('aria-label', W.ask);
        for (const p of s.places || []) { const b = ibtn(PASS_ICON[p] || '🚪', placeWord(p), 'btn dw5-place', fill(W.askFor, { place: placeWord(p) })); b.addEventListener('click', () => act({ action: 'ask', place: p })); grid.appendChild(b); }
        box.appendChild(grid);
        return;
      }
      const line = el('p', 'dw5-passline');
      const row = el('div', 'dw-row dw5-passacts');
      if (mine.state === 'asked') {
        line.append(icon('⏳'), el('span', null, fill(W.waiting, { place: placeWord(mine.place) })));
        const c = btn(W.cancel, 'btn btn-sm'); c.addEventListener('click', () => act({ action: 'cancel' })); row.appendChild(c);
      } else if (mine.state === 'out') {
        line.append(icon(PASS_ICON[mine.place] || '🚪'), el('span', null, fill(W.out, { place: placeWord(mine.place) })));
        timeEl = el('div', 'dw5-passtime'); timeEl.setAttribute('role', 'timer');
        const b = ibtn('🏠', W.back, 'btn btn-primary'); b.addEventListener('click', () => act({ action: 'back' })); row.appendChild(b);
      } else {
        line.append(icon('✋'), el('span', null, W.declined));
        const b = btn(W.ok, 'btn btn-sm'); b.addEventListener('click', () => act({ action: 'ok' })); row.appendChild(b);
      }
      box.append(line);
      if (timeEl) box.appendChild(timeEl);
      box.append(row, el('p', 'dw-note small muted', W.mine));
      tick();
    };
    const tick = () => { if (timeEl && mine && mine.at) { const ms = ctx.now() - mine.at; timeEl.textContent = clockOf(ms); timeEl.classList.toggle('is-over', ms > limit); } };
    draw();
    return { live: draw, tick };
  }
  // The teacher: requests (names hidden on the projector) and who is out, with how long.
  const counts = el('p', 'dw5-passcounts');
  const list = el('ul', 'dw5-passlist dw-scroll');
  const hidden = el('p', 'dw-public small muted', W.hiddenNames);
  const foot = el('div', 'dw-row dw-foot');
  const clear = btn(W.none, 'btn btn-sm');
  foot.appendChild(clear);
  body.append(counts, list, hidden, foot);
  let items = [], sig = '';
  const timers = new Map();
  const teacherAct = async b => { await ctx.flush(); const r = await ctx.act('/pass/teacher', b); if (r) { ctx.live().pass = { list: r.list }; sig = ''; draw(); } return r; };
  const draw = live => {
    items = (((live || ctx.live()).pass) || {}).list || [];
    const s2 = JSON.stringify(items); if (s2 === sig) return; sig = s2;
    const asking = items.filter(x => x.state === 'asked'), out = items.filter(x => x.state === 'out');
    counts.textContent = '';
    counts.append(el('span', 'dw5-count', `🙋 ${fill(W.asking, { n: asking.length })}`), el('span', 'dw5-count', `🚶 ${fill(W.outNow, { n: out.length })}`));
    if (s.oneOut) counts.appendChild(el('span', 'dw5-count dw5-muted', `☝️ ${W.oneOut}`));
    list.textContent = ''; timers.clear();
    if (!items.length) list.appendChild(el('li', 'dw-empty', W.nobody));
    for (const x of [...out, ...asking]) {
      const li = el('li', `dw5-passrow is-${x.state}${x.state === 'asked' ? ' dw-private' : ''}`);
      const who = el('span', 'dw5-who');
      who.append(el('b', 'dw5-name dw5-iso', x.name));
      const where = el('span', 'dw5-where dw-private'); where.append(icon(PASS_ICON[x.place] || '🚪'), el('span', null, placeWord(x.place)));
      who.appendChild(where);
      if (x.state === 'out') { const pub = el('span', 'dw5-where dw-public-inline', W.outPublic); who.appendChild(pub); }
      li.appendChild(who);
      if (x.state === 'out') {
        const tm = el('span', 'dw5-passtime dw5-small'); tm.setAttribute('role', 'timer'); timers.set(tm, x.at);
        const back = ibtn('🏠', W.markBack, 'btn btn-sm', `${W.markBack}: ${x.name}`); back.addEventListener('click', () => teacherAct({ action: 'back', pass: x.id }).then(r => r && ctx.say(fill(W.backSay, { name: x.name }))));
        const acts = el('span', 'dw5-acts'); acts.append(tm, back); li.appendChild(acts);
      } else {
        const ok = ibtn('✔', W.approve, 'btn btn-sm btn-primary', `${W.approve}: ${x.name}`), no = ibtn('✖', W.decline, 'btn btn-sm', `${W.decline}: ${x.name}`);
        ok.disabled = !!(s.oneOut && out.length);
        if (ok.disabled) ok.title = W.oneOut;
        ok.addEventListener('click', () => teacherAct({ action: 'approve', pass: x.id }));
        no.addEventListener('click', () => teacherAct({ action: 'decline', pass: x.id }));
        const acts = el('span', 'dw5-acts'); acts.append(ok, no); li.appendChild(acts);
      }
      list.appendChild(li);
    }
    clear.disabled = !items.length;
    tick();
  };
  const tick = () => { for (const [tm, at] of timers) { const ms = ctx.now() - at; tm.textContent = ms > limit ? `${clockOf(ms)} · ${W.over}` : clockOf(ms); tm.classList.toggle('is-over', ms > limit); } };
  clear.addEventListener('click', () => teacherAct({ action: 'clear' }));
  draw();
  return { live: draw, tick };
}

// ---------------------------------------------------------------- class jobs
/** Who does job i this week (the same rule as services/dash.js jobAssign). */
export function jobAssign(jobCount, people, shift = 0) {
  const n = people.length;
  return Array.from({ length: jobCount }, (_, i) => (i < n ? people[((i + shift) % n + n) % n] : null));
}
export const jobList = (s, W) => { const own = String(s.jobs || '').split('\n').map(x => x.trim()).filter(Boolean).slice(0, 16); return own.length ? { list: own, typed: true } : { list: String(W.defaults || '').split('\n').filter(Boolean), typed: false }; };
const rnd = n => (globalThis.crypto && crypto.getRandomValues ? crypto.getRandomValues(new Uint32Array(1))[0] % n : Math.floor(Math.random() * n));
function jobs(body, s, ctx) {
  const W = ctx.type.words;
  body.classList.add('dw-jobs', 'dw5');
  const { list: names, typed: own } = jobList(s, W);
  const grid = el('ul', 'dw5-jobgrid dw-scroll');
  body.appendChild(grid);
  const crew = s.crew || { order: [], shift: 0 };
  let people = [];
  const draw = live => {
    people = (((live || ctx.live()).crew) || {})[ctx.id] || [];
    const who = jobAssign(names.length, people, crew.shift || 0);
    grid.textContent = '';
    names.forEach((job, i) => {
      const li = el('li', 'dw5-job');
      li.appendChild(own ? typed('span', 'dw5-jobname', job) : el('span', 'dw5-jobname', job));
      li.appendChild(who[i] ? el('b', 'dw5-jobwho dw5-iso', who[i].name) : el('span', 'dw5-jobwho dw5-muted', W.open));
      grid.appendChild(li);
    });
    if (!people.length) grid.appendChild(el('li', 'dw-empty dw5-jobnote', W.nobody));
  };
  if (ctx.teacher && !ctx.editing) {
    const row = el('div', 'dw-row dw-foot');
    const rot = ibtn('↻', W.rotate, 'btn btn-sm btn-primary'), mix = ibtn('🔀', W.shuffle, 'btn btn-sm');
    rot.addEventListener('click', () => { ctx.set('crew', { order: people.map(p => p.id), shift: (crew.shift || 0) + 1 }); ctx.say(W.rotated); });
    mix.addEventListener('click', () => {
      const ids = people.map(p => p.id);
      for (let i = ids.length - 1; i > 0; i--) { const j = rnd(i + 1); [ids[i], ids[j]] = [ids[j], ids[i]]; }
      // Shown at once in the new order (the server sends it again with the next check).
      const live = ctx.live(); live.crew = { ...(live.crew || {}), [ctx.id]: ids.map(id => people.find(p => p.id === id)) };
      ctx.set('crew', { order: ids, shift: 0 }); ctx.say(W.shuffled);
    });
    row.append(rot, mix);
    body.appendChild(row);
  }
  draw();
  return { live: draw };
}

// ---------------------------------------------------------------- points for each student (the scoreboard, "Students")
export function points(body, s, ctx) {
  const W = ctx.type.words;
  body.classList.add('dw-points', 'dw5');
  const reasonWord = r => W[`r_${r}`] || r;
  const REASONS = Object.keys(REASON_ICON);
  if (!ctx.teacher) {
    // A student: their own points and the class's total. Never anyone else's.
    const me = el('div', 'dw5-mine');
    const lab = el('span', 'dw5-minelab', W.mine), n = el('b', 'dw5-big');
    const why = el('ul', 'dw5-why');
    const tot = el('p', 'dw5-classtot');
    me.append(lab, n);
    body.append(me, why, tot);
    const draw = live => {
      const p = ((live || ctx.live()).points) || { mine: 0, r: {}, total: 0 };
      n.textContent = String(p.mine || 0);
      why.textContent = '';
      for (const r of REASONS) if (p.r && p.r[r]) { const li = el('li', 'dw5-chip'); li.append(icon(REASON_ICON[r]), el('span', null, `${reasonWord(r)} ${p.r[r]}`)); why.appendChild(li); }
      tot.textContent = fill(W.classTotal, { n: p.total || 0 });
    };
    draw();
    return { live: draw };
  }
  const top = el('div', 'dw5-ptop');
  const total = el('p', 'dw5-classtot dw5-classbig');
  top.appendChild(total);
  const list = el('ul', 'dw5-plist dw-scroll dw-private');
  const hidden = el('p', 'dw-public small muted', W.hidden);
  body.append(top, list, hidden);
  let last = null, sig = '';
  const give = (user, name) => {
    const sh = ctx.sheet({ title: user === 'all' ? W.awardAll : fill(W.award, { name }), content: `<p class="small muted">${ctx.esc(W.pick)}</p><div class="dw5-reasons" role="group" aria-label="${ctx.esc(W.reason)}">${REASONS.map(r => `<button class="btn dw5-reason" type="button" data-r="${r}"><span aria-hidden="true">${REASON_ICON[r]}</span> <span>${ctx.esc(reasonWord(r))}</span></button>`).join('')}</div>` });
    sh.el.querySelector('.dw5-reason')?.focus();
    sh.el.addEventListener('click', async e => {
      const b = e.target.closest('[data-r]'); if (!b) return;
      sh.close();
      const r = await ctx.act('/points', { action: 'award', user, reason: b.dataset.r });
      if (r) { last = { user, reason: b.dataset.r }; ctx.live().points = r; sig = ''; draw(); ctx.say(fill(W.given, { name: user === 'all' ? W.everyone : name, reason: reasonWord(b.dataset.r) })); }
    });
  };
  const draw = live => {
    const p = ((live || ctx.live()).points) || { list: [], total: 0 };
    const s2 = JSON.stringify(p); if (s2 === sig) return; sig = s2;
    total.textContent = '';
    total.append(icon('🏆'), el('span', null, fill(W.classTotal, { n: p.total || 0 })));
    list.textContent = '';
    if (!p.list.length) list.appendChild(el('li', 'dw-empty', W.nobody));
    for (const k of p.list) {
      const li = el('li', 'dw5-prow');
      li.append(el('span', 'dw5-name dw5-iso', k.name), el('b', 'dw5-pn', String(k.n)));
      const plus = btn('+1', 'btn btn-sm dw5-plus', fill(W.award, { name: k.name }));
      if (ctx.editing) plus.disabled = true;
      plus.addEventListener('click', () => give(k.id, k.name));
      li.appendChild(plus);
      list.appendChild(li);
    }
    allB.disabled = !p.list.length;
    undo.disabled = !last;
  };
  const foot = el('div', 'dw-row dw-foot dw-private');
  const allB = ibtn('🎉', W.awardAll, 'btn btn-sm btn-primary'), undo = ibtn('↶', W.undo, 'btn btn-sm'), reset = ibtn('↺', W.resetAll, 'btn btn-sm');
  foot.append(allB, undo, reset);
  if (!ctx.editing) body.appendChild(foot);
  allB.addEventListener('click', () => give('all', W.everyone));
  undo.addEventListener('click', async () => {
    if (!last) return;
    const r = await ctx.act('/points', { action: 'undo', ...last });
    if (r) { last = null; ctx.live().points = r; sig = ''; draw(); ctx.say(W.undone); }
  });
  reset.addEventListener('click', async () => {
    if (!confirm(W.resetConfirm)) return;
    const r = await ctx.act('/points', { action: 'reset' });
    if (r) { last = null; ctx.live().points = r; sig = ''; draw(); }
  });
  draw();
  return { live: draw };
}

// ---------------------------------------------------------------- mood check-in (faces only)
function mood(body, s, ctx) {
  const W = ctx.type.words, word = i => W[`m_${MOOD_KEYS[i]}`];
  body.classList.add('dw-mood', 'dw5');
  if (ctx.role === 'student') {
    const q = el('p', 'dw5-moodq', W.ask);
    const row = el('div', 'dw5-faces'); row.setAttribute('role', 'group'); row.setAttribute('aria-label', W.ask);
    const status = el('p', 'dw5-moodme'); status.setAttribute('role', 'status');
    const note = el('p', 'dw-note small muted', W.saved);
    const btns = MOOD_ICON.map((f, i) => {
      const b = btn('', 'btn dw5-face'); b.append(icon(f, 'dw5-faceic'), el('span', 'dw5-facew', word(i)));
      b.addEventListener('click', async () => { const r = await ctx.act('/mood', { mood: i }); if (r) { ctx.live().mood = { mine: r.mine }; draw(); ctx.say(status.textContent); } });
      row.appendChild(b); return b;
    });
    body.append(q, row, status, note);
    const draw = live => {
      const mine = (((live || ctx.live()).mood) || {}).mine;
      btns.forEach((b, i) => b.setAttribute('aria-pressed', String(mine === i)));
      status.textContent = mine == null ? '' : fill(W.mine, { face: `${MOOD_ICON[mine]} ${word(mine)}` });
    };
    draw();
    return { live: draw };
  }
  const bars = el('ul', 'dw-bars dw5-moodbars');
  const metaRow = el('div', 'dw-checkmetarow');
  const meta = el('span', 'dw-checkmeta');
  const names = ibtn('👀', W.names, 'btn btn-sm dw-private');
  metaRow.append(meta, names);
  body.append(bars, metaRow);
  let sig = '';
  const draw = live => {
    const m = ((live || ctx.live()).mood) || { counts: [0, 0, 0, 0, 0], n: 0, size: 0 };
    const s2 = JSON.stringify(m); if (s2 === sig) return; sig = s2;
    bars.textContent = '';
    const max = Math.max(1, ...m.counts);
    m.counts.forEach((n, i) => {
      const li = el('li', 'dw-barrow');
      const lab = el('span', 'dw-barlab'); lab.append(icon(MOOD_ICON[i], 'dw-ic'), el('span', null, word(i)));
      const track = el('span', 'dw-bartrack'); track.setAttribute('aria-hidden', 'true');
      track.appendChild(el('span', 'dw-barfill2')).style.inlineSize = `${(100 * n) / max}%`;
      li.append(lab, track, el('b', 'dw-barn', String(n)));
      bars.appendChild(li);
    });
    meta.textContent = fill(W.counts, { n: m.n, total: m.size });
  };
  names.addEventListener('click', async () => {
    if (ctx.private()) return;
    const r = await ctx.get('/mood/names').catch(() => null); if (!r) return;
    const esc = ctx.esc;
    const group = (head, arr) => `<li class="dw-namegroup"><div class="dw-nghead">${head}<span class="dash-count">${arr.length}</span></div><div class="dw-namelist">${arr.map(n => `<span class="dw-name" dir="auto">${esc(n)}</span>`).join('') || `<span class="small muted">${esc(W.nobody)}</span>`}</div></li>`;
    ctx.sheet({ title: W.names, content: `<ul class="dw-names">${MOOD_ICON.map((f, i) => group(`<span aria-hidden="true">${f}</span><b>${esc(word(i))}</b>`, r.groups[i] || [])).join('')}${group(`<b>${esc(W.notYet)}</b>`, r.missing)}</ul>` });
  });
  draw();
  return { live: draw };
}

// ---------------------------------------------------------------- breathing (calm, in every browser on its own)
export const PACES = { calm: [['in', 4], ['out', 4]], box: [['in', 4], ['hold', 4], ['out', 4], ['hold', 4]], long: [['in', 4], ['out', 6]] };
/** Where a breathing pattern is t seconds after it started: { phase, left (whole seconds), i }. */
export function breathAt(pace, t) {
  const steps = PACES[pace] || PACES.calm, cycle = steps.reduce((a, b) => a + b[1], 0);
  let x = ((t % cycle) + cycle) % cycle;
  for (let i = 0; i < steps.length; i++) { if (x < steps[i][1]) return { phase: steps[i][0], left: Math.ceil(steps[i][1] - x), i, len: steps[i][1] }; x -= steps[i][1]; }
  return { phase: steps[0][0], left: steps[0][1], i: 0, len: steps[0][1] };
}
const breathing = new Map();
function breathe(body, s, ctx) {
  const W = ctx.type.words;
  body.classList.add('dw-breathe', 'dw5');
  const stage = el('div', 'dw5-bstage');
  const ring = el('div', 'dw5-bring'); ring.setAttribute('aria-hidden', 'true');
  const words = el('div', 'dw5-bwords'); words.setAttribute('aria-live', 'polite');
  const phase = el('b', 'dw5-bphase', W.ready), count = el('span', 'dw5-bcount');
  words.append(phase, count);
  stage.append(ring, words);
  const row = el('div', 'dw-row dw-foot');
  const go = ibtn('▶', W.start, 'btn btn-sm btn-primary');
  row.appendChild(go);
  body.append(stage, row);
  let last = '';
  const draw = () => {
    const st = breathing.get(ctx.id);
    go.lastChild.textContent = st ? W.pause : W.start; go.firstChild.textContent = st ? '⏸' : '▶';
    if (!st) { ring.classList.remove('is-big'); phase.textContent = W.ready; count.textContent = ''; return; }
    const b = breathAt(s.pace, (Date.now() - st) / 1000);
    // The circle grows while breathing in and shrinks while breathing out (over the step's length); it stays put while
    // holding. With reduced motion it doesn't move: the words and the count say it all.
    if (last !== `${b.i}`) { ring.style.setProperty('--len', `${b.len}s`); if (b.phase === 'in') ring.classList.add('is-big'); else if (b.phase === 'out') ring.classList.remove('is-big'); last = `${b.i}`; }
    phase.textContent = W[b.phase]; count.textContent = String(b.left);
  };
  go.addEventListener('click', () => { if (breathing.has(ctx.id)) breathing.delete(ctx.id); else breathing.set(ctx.id, Date.now()); last = ''; draw(); });
  const t = setInterval(draw, 250);
  draw();
  return { destroy() { clearInterval(t); } };
}

// ---------------------------------------------------------------- sticky note (the teacher's own words)
function note(body, s, ctx) {
  body.classList.add('dw-sticky', 'dw5', `dw5-note-${s.color || 'yellow'}`);
  if (!String(s.body || '').trim()) { empty(body, ctx.type.words.empty); return null; }
  body.appendChild(typed('p', 'dw5-notetext dw-scroll', s.body));
  return null;
}

// ---------------------------------------------------------------- checklist
function checklist(body, s, ctx) {
  const W = ctx.type.words;
  body.classList.add('dw-checklist', 'dw5');
  const items = String(s.items || '').split('\n').map(x => x.trim()).filter(Boolean).slice(0, 20);
  if (s.title) body.appendChild(typed('div', 'dw5-cltitle', s.title));
  if (!items.length) { empty(body, ctx.role === 'teacher' ? W.empty : ''); return null; }
  const ticks = items.map((_, i) => !!(s.ticks || [])[i]);
  const control = ctx.teacher && !ctx.editing;
  const ul = el('ul', 'dw5-cl dw-scroll');
  items.forEach((text, i) => {
    const li = el('li', `dw5-clrow${ticks[i] ? ' is-done' : ''}`);
    const box = el(control ? 'button' : 'span', 'dw5-clbox');
    const mark = icon(ticks[i] ? '✔' : '', 'dw5-clmark');
    if (control) {
      box.type = 'button'; box.setAttribute('aria-pressed', String(ticks[i]));
      box.append(mark, typed('span', 'dw5-cltext', text));
      box.addEventListener('click', () => { const next = ticks.slice(); next[i] = !next[i]; ctx.set('ticks', next); ctx.say(`${text}: ${next[i] ? W.ticked : W.unticked}`); });
    } else {
      box.append(mark, typed('span', 'dw5-cltext', text));
      if (ticks[i]) box.appendChild(el('span', 'sr-only', ` (${W.ticked})`));
    }
    li.appendChild(box); ul.appendChild(li);
  });
  body.appendChild(ul);
  const foot = el('div', 'dw-row dw-foot dw5-clfoot');
  foot.appendChild(el('span', 'dw5-clcount', fill(W.done, { n: ticks.filter(Boolean).length, total: items.length })));
  if (control) { const c = ibtn('🧹', W.clear, 'btn btn-sm'); c.disabled = !ticks.some(Boolean); c.addEventListener('click', () => ctx.set('ticks', [])); foot.appendChild(c); }
  body.appendChild(foot);
  return null;
}

/** Stage 5 renderers, merged into RENDER (public/js/dash-widgets.js). The camera's is in dash-camera.js. */
export const RENDER5 = { video, site, hallpass, jobs, mood, breathe, note, checklist };
