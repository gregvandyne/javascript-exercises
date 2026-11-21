// Classroom dashboards, stage 5 (docs/decisions.md "Classroom dashboards, stage 5"): the renderers for video, the site
// window, the hall pass, class jobs, points for each student (the scoreboard's second mode), the mood check-in,
// breathing, a sticky note, a checklist and the schedule's "now and next" view. The document camera is in
// dash-camera.js (the only stage 5 file that touches a camera).
// - Video and site windows are the teacher's screen and projector only (the server never pins or pushes them).
// - What students do here (ask for a pass, tap a face) is fixed buttons, never text. A student sees only their own
//   pass, their own points and their own face; names show only inside the class, and the projector hides them where a
//   list of names would say something private (requests, points, faces).
// - Text a person typed is rendered with textContent only.
import { videoSrc, watchUrl } from './dash-video.js';
import { setIcon, setLabel } from './icons.js';

const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const typed = (tag, cls, text) => { const e = el(tag, cls, text); e.dir = 'auto'; return e; };
const btn = (label, cls = 'btn btn-sm', aria) => { const b = setLabel(el('button', cls), label); b.type = 'button'; if (aria) b.setAttribute('aria-label', aria); return b; };
const fill = (s, vars = {}) => String(s || '').replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
const icon = (t, cls = 'dw5-ic') => { const e = setIcon(el('span', cls), t, cls === 'dw5-bigic' ? 128 : 18); e.setAttribute('aria-hidden', 'true'); return e; };
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
  // The players need to know which site embeds them (only the origin is sent). They may open a new tab (YouTube's
  // "Sign in to confirm you're not a bot", its logo) and ask for their own sign-in cookies after a tap, but never navigate
  // this page. Teacher only: the video widget is never on a student's screen.
  f.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
  f.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-presentation allow-popups allow-popups-to-escape-sandbox allow-storage-access-by-user-activation');
  wrap.appendChild(f);
  body.appendChild(wrap);
  const bits = [];
  if (s.start) bits.push(`▶ ${secsText(s.start)}`);
  if (s.end > s.start) bits.push(`⏹ ${secsText(s.end)}`);
  if (s.mute) bits.push(`🔇 ${ctx.type.settings.find(x => x.key === 'mute').label}`);
  if (s.loop) bits.push(`🔁 ${ctx.type.settings.find(x => x.key === 'loop').label}`);
  // When the player won't play here (a sign-in check, a video that can't be embedded), the teacher can open it there.
  const out = watchUrl(s.video, s.start);
  const meta = el('p', 'dw5-meta', bits.join(' · '));
  if (out && !ctx.editing) {
    const a = el('a', 'dw5-open', `↗ ${fill(W.openOn, { site: s.video.p === 'vimeo' ? 'Vimeo' : 'YouTube' })}`);
    a.href = out; a.target = '_blank'; a.rel = 'noopener noreferrer';
    if (bits.length) meta.append(' · ');
    meta.appendChild(a);
  }
  if (bits.length || meta.querySelector('a')) body.appendChild(meta);
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
    counts.append(setLabel(el('span', 'dw5-count'), `🙋 ${fill(W.asking, { n: asking.length })}`), setLabel(el('span', 'dw5-count'), `🚶 ${fill(W.outNow, { n: out.length })}`));
    if (s.oneOut) counts.appendChild(setLabel(el('span', 'dw5-count dw5-muted'), `☝️ ${W.oneOut}`));
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
/** The names the teacher typed for the chart (one a line, at most 60 of 40 characters), or [] to use the class's students. */
export const typedCrew = s => String(s.names || '').split('\n').map(x => x.trim().slice(0, 40)).filter(Boolean).slice(0, 60);
export const jobList = (s, W) => { const own = String(s.jobs || '').split('\n').map(x => x.trim()).filter(Boolean).slice(0, 16); return own.length ? { list: own, typed: true } : { list: String(W.defaults || '').split('\n').filter(Boolean), typed: false }; };
export const MAX_JOBS = 16, MAX_NAMES = 60;
/** Where the chart's people come from: 'names' (typed) or 'class' (the roster). Dashboards saved before the job cards
 *  ('auto', or nothing): the typed names if there are any, else the class. */
export const crewFrom = s => (s.from === 'names' || s.from === 'class' ? s.from : (typedCrew(s).length ? 'names' : 'class'));
/** The class's students in the saved order (ids in crew.order first, the rest as they came): what the server sends,
 *  put in order at once after a change here. Students get names only (no ids), which leaves their list as it is. */
export const orderBy = (people, order = []) => { const at = new Map((order || []).map((id, i) => [id, i])); return people.map((p, i) => [p, at.has(p.id) ? at.get(p.id) : order.length + i]).sort((a, b) => a[1] - b[1]).map(x => x[0]); };
/** The same people, turned so that the shift is 0: the one with job 1, job 2, … then those waiting, in the order they
 *  come in (jobAssign(n, unturn(p, s), 0) is jobAssign(n, p, s)). */
export const unturn = (people, shift = 0) => { const n = people.length; if (!n) return []; const k = ((shift % n) + n) % n; return [...people.slice(k), ...people.slice(0, k)]; };
/** More people than jobs: who has no job this turn, in the order they come in with ↻ Next week. */
export const jobWaiting = (jobCount, people, shift = 0) => unturn(people, shift).slice(jobCount);
// The job cards' changes, on { jobs, people } turned to shift 0 (job i is people[i]; jobs from people.length on are open).
// The chart stays positional: a change puts people (or, for an open job, jobs) in a new order. -> a new { jobs, people, at }.
/** Job i goes to people[p]. A job someone has: the two change places (from another job, or from waiting). An open job
 *  (more jobs than people): p already has a job, so the two jobs change places and the job moves up to number p. at:
 *  where job i is now. */
export function pickFor(st, i, p) {
  const jobs = [...st.jobs], people = [...st.people], n = people.length;
  if (!(p >= 0 && p < n && i >= 0 && i < jobs.length)) return { jobs, people, at: i };
  if (i < n) { [people[i], people[p]] = [people[p], people[i]]; return { jobs, people, at: i }; }
  [jobs[i], jobs[p]] = [jobs[p], jobs[i]];
  return { jobs, people, at: p };
}
/** Job i is removed. Everyone else keeps their job; its person takes the first open job, or waits first in line. */
export function dropJob(st, i) {
  const jobs = [...st.jobs], people = [...st.people], m = Math.min(jobs.length, people.length);
  if (i < 0 || i >= jobs.length) return { jobs, people, at: i };
  jobs.splice(i, 1);
  if (i < m) { const [who] = people.splice(i, 1); people.splice(m - 1, 0, who); }
  return { jobs, people, at: Math.min(i, jobs.length - 1) };
}
/** A typed name is removed. Waiting: just gone. With a job: the next one waiting takes it; nobody waiting: the job goes
 *  to the end of the jobs people have, so everyone else keeps theirs. */
export function dropName(st, p) {
  const jobs = [...st.jobs], people = [...st.people], n = people.length, J = jobs.length;
  if (p < 0 || p >= n) return { jobs, people, at: -1 };
  if (p >= Math.min(J, n)) { people.splice(p, 1); return { jobs, people, at: -1 }; }
  if (n > J) { people[p] = people[J]; people.splice(J, 1); return { jobs, people, at: p }; }
  [jobs[p], jobs[n - 1]] = [jobs[n - 1], jobs[p]]; people[p] = people[n - 1]; people.pop();
  return { jobs, people, at: p };
}
/** A new typed name, given job i at once. */
export const addName = (st, name, i) => pickFor({ jobs: st.jobs, people: [...st.people, name] }, i, st.people.length);
/** What the cards save: empty jobs dropped (as dropJob), the people's order, and the shift back to 0. */
export function jobsSaved(st) {
  let cur = { jobs: st.jobs.map(x => String(x).trim()), people: st.people };
  for (let i = cur.jobs.length - 1; i >= 0; i--) if (!cur.jobs[i]) cur = dropJob(cur, i);
  return { jobs: cur.jobs, people: cur.people };
}
const listOf = names => { try { return new Intl.ListFormat(document.documentElement.lang || 'en', { style: 'short', type: 'unit' }).format(names); } catch { return names.join(', '); } };
/** The settings sheet's job cards (public/js/dash.js EDITORS.jobcards; docs/decisions.md "Class jobs: one card per
 *  job"): one card per job with its name and who does it this week, ➕ Add a job, where the students come from, and,
 *  for typed names, the names to take off. Saved as before: `jobs` and `names` one a line, `crew` { order, shift }, with
 *  the people put in order so job i is people[i] (shift 0), so ↻ Next week and 🔀 Shuffle work as they did.
 *  o: { id, roster() (the class's students, { id, name }, the teacher's live list), className, commit, redraw, say }. */
export function jobsEditor(field, w, W, o) {
  field.className = 'field dw5-jobed';
  const sOf = () => w.s;
  const peopleOf = from => {
    const s = sOf(), crew = s.crew || { order: [], shift: 0 };
    return unturn(from === 'names' ? typedCrew(s) : orderBy(o.roster() || [], crew.order), crew.shift || 0);
  };
  const { list, typed: own } = jobList(sOf(), W);
  const st = { from: crewFrom(sOf()), own, jobs: [...list], people: [] };
  st.people = peopleOf(st.from);
  let typing = -1;
  const nameOf = p => (st.from === 'names' ? p : p.name);
  const jobName = i => String(st.jobs[i] || '').trim() || fill(W.jobN, { n: i + 1 });
  /** Saves the cards: the jobs (once the teacher has changed one, or always once they are their own), the names or the
   *  class's order, the shift back to 0, and where the people come from. */
  const write = touchJobs => {
    const s = sOf(), cur = jobsSaved(st), crew = s.crew || { order: [], shift: 0 };
    if (touchJobs) st.own = true;
    if (st.own && cur.jobs.length) s.jobs = cur.jobs.join('\n');
    s.from = st.from;
    if (st.from === 'names') { s.names = cur.people.join('\n'); s.crew = { order: crew.order || [], shift: 0 }; }
    else if (cur.people.length) s.crew = { order: cur.people.map(p => p.id), shift: 0 };
  };
  const apply = (next, focus, msg) => {
    const moved = next.jobs.join('\n') !== st.jobs.join('\n');
    st.jobs = next.jobs; st.people = next.people;
    write(moved); o.commit(); o.redraw(); render(focus);
    if (msg) o.say(msg);
  };
  const ctl = (tag, cls, f) => { const e = el(tag, cls); if (f) e.dataset.f = f; return e; };
  const labelled = (cls, text, input, idx) => {
    const box = el('div', cls), lab = el('label', 'dw5-jlabel', text);
    input.id = `${o.id}-${idx}`; lab.htmlFor = input.id;
    box.append(lab, input);
    return box;
  };
  function render(focus) {
    field.textContent = '';
    const n = st.people.length, J = st.jobs.length;
    field.appendChild(el('p', 'small muted dw5-jtop', fill(W.cardsIntro, { rotate: `↻ ${W.rotate}` })));
    const ol = el('ol', 'dw5-jcards');
    ol.setAttribute('aria-label', o.label || W.job);
    st.jobs.forEach((job, i) => {
      const li = el('li', 'dw5-jcard'), row = el('div', 'dw5-jrow');
      const num = el('span', 'dw5-jn', String(i + 1)); num.setAttribute('aria-hidden', 'true');
      const inp = ctl('input', 'input', `job:${i}`);
      inp.value = job; inp.maxLength = 40; inp.dir = 'auto'; inp.autocomplete = 'off'; inp.placeholder = W.newJob;
      inp.setAttribute('aria-label', `${W.job} ${i + 1}`);
      inp.addEventListener('input', () => { st.jobs[i] = inp.value; write(true); o.redraw(); });
      const x = ctl('button', 'btn dw5-jx', `x:${i}`); x.type = 'button'; x.textContent = '✕';
      const sel = ctl('select', 'input', `who:${i}`);
      const names = () => { x.setAttribute('aria-label', fill(W.removeJob, { job: jobName(i) })); sel.setAttribute('aria-label', fill(W.studentFor, { job: jobName(i) })); };
      names();
      inp.addEventListener('change', () => { o.commit(); names(); });
      x.disabled = J <= 1;
      x.addEventListener('click', () => { const name = jobName(i), next = dropJob(st, i); apply(next, next.jobs.length ? `x:${Math.min(i, next.jobs.length - 1)}` : 'add', fill(W.removedJob, { job: name })); });
      row.append(num, labelled('dw5-jlab', W.job, inp, `j${i}`), x);
      if (i >= n) sel.appendChild(new Option(W.nobodyYet, '', true, true));
      st.people.forEach((p, k) => { const op = new Option(nameOf(p), String(k), false, k === i); op.dir = 'auto'; sel.appendChild(op); });
      if (st.from === 'names' && n < MAX_NAMES) sel.appendChild(new Option(`✏️ ${W.typeName}`, '+'));
      sel.disabled = sel.options.length < 2;
      sel.addEventListener('change', () => {
        const v = sel.value;
        if (v === '+') { typing = i; render(`type:${i}`); return; }
        if (v === '') return;
        const p = +v, who = nameOf(st.people[p]), next = pickFor(st, i, p);
        apply(next, `who:${next.at}`, next.at === i ? fill(W.picked, { name: who, job: jobName(i) }) : fill(W.movedUp, { job: jobName(i), n: next.at + 1, name: who }));
      });
      li.append(row, labelled('dw5-jlab dw5-jsub', W.student, sel, `w${i}`));
      if (typing === i) {
        const t = ctl('input', 'input', `type:${i}`); t.maxLength = 40; t.dir = 'auto'; t.autocomplete = 'off'; t.setAttribute('autocapitalize', 'words');
        const add = el('button', 'btn btn-primary dw5-jadd2', W.addName); add.type = 'button';
        const go = () => {
          const name = t.value.trim().replace(/\s+/g, ' ').slice(0, 40);
          typing = -1;
          if (!name) { render(`who:${i}`); return; }
          const next = addName(st, name, i);
          apply(next, `who:${next.at}`, next.at === i ? fill(W.picked, { name, job: jobName(i) }) : fill(W.movedUp, { job: jobName(i), n: next.at + 1, name }));
        };
        add.addEventListener('click', go);
        t.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); go(); } else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); typing = -1; render(`who:${i}`); } });
        const box = labelled('dw5-jlab dw5-jsub dw5-jtype', W.nameLabel, t, `t${i}`), r2 = el('div', 'dw5-jtrow');
        r2.append(t, add); box.appendChild(r2);
        li.appendChild(box);
      }
      ol.appendChild(li);
    });
    field.appendChild(ol);
    // More people than jobs: who waits this turn, as the widget shows it.
    const waiting = st.people.slice(J);
    if (waiting.length) { const p = el('p', 'dw5-jobwait small', fill(W.waiting, { names: listOf(waiting.map(nameOf)) })); p.dir = 'auto'; field.appendChild(p); }
    const add = ctl('button', 'btn dw5-jaddjob', 'add'); add.type = 'button';
    add.append(icon('➕'), el('span', '', ` ${W.addJob}`));
    add.disabled = J >= MAX_JOBS;
    add.addEventListener('click', () => { if (st.jobs.length >= MAX_JOBS) return; st.jobs.push(''); render(`job:${st.jobs.length - 1}`); });
    field.appendChild(add);
    if (J >= MAX_JOBS) field.appendChild(el('p', 'small muted', fill(W.maxJobs, { n: MAX_JOBS })));
    // Where the students come from.
    const from = ctl('select', 'input', 'from');
    from.append(new Option(W.fromNames, 'names', false, st.from === 'names'), new Option(fill(W.fromClass, { class: o.className || '' }), 'class', false, st.from === 'class'));
    from.addEventListener('change', () => { st.from = from.value; typing = -1; st.people = peopleOf(st.from); write(false); o.commit(); o.redraw(); render('from'); });
    field.appendChild(labelled('dw5-jlab dw5-jfrom', o.fromLabel || W.fromNames, from, 'from'));
    if (!n) field.appendChild(el('p', 'small muted dw5-jnote', st.from === 'names' ? W.noNames : W.nobody));
    // Typed names: each can be taken off the chart.
    if (st.from === 'names' && n) {
      const h = el('p', 'dw5-jlabel', o.namesLabel || W.fromNames); h.id = `${o.id}-names`;
      const ul = el('ul', 'dw5-jnames'); ul.setAttribute('aria-labelledby', h.id);
      st.people.forEach((name, p) => {
        const li = el('li'), b = ctl('button', 'btn btn-sm dw5-jname', `name:${p}`); b.type = 'button';
        b.append(typed('span', '', name), icon(' ✕'));
        b.setAttribute('aria-label', fill(W.removeName, { name }));
        b.addEventListener('click', () => { const next = dropName(st, p); apply(next, st.people.length > 1 ? `name:${Math.min(p, st.people.length - 2)}` : 'from', fill(W.removedName, { name })); });
        li.appendChild(b); ul.appendChild(li);
      });
      field.append(h, ul);
    }
    if (focus) field.querySelector(`[data-f="${CSS.escape(focus)}"]`)?.focus();
  }
  render();
}
const rnd = n => (globalThis.crypto && crypto.getRandomValues ? crypto.getRandomValues(new Uint32Array(1))[0] % n : Math.floor(Math.random() * n));
function jobs(body, s, ctx) {
  const W = ctx.type.words;
  body.classList.add('dw-jobs', 'dw5');
  const { list: names, typed: own } = jobList(s, W);
  const grid = el('ul', 'dw5-jobgrid dw-scroll');
  body.appendChild(grid);
  const crew = s.crew || { order: [], shift: 0 };
  // Typed names, or the class's students (from the server, put in the saved order).
  const typedNames = typedCrew(s), byHand = crewFrom(s) === 'names';
  let people = [];
  const wait = el('p', 'dw5-jobwait small');
  wait.dir = 'auto';
  body.appendChild(wait);
  const draw = live => {
    people = byHand ? typedNames.map((name, i) => ({ id: `t${i}`, name })) : orderBy((((live || ctx.live()).crew) || {})[ctx.id] || [], crew.order);
    const who = jobAssign(names.length, people, crew.shift || 0);
    // More students than jobs: the ones with no job this turn, on one line (they come in with ↻ Next week).
    const waiting = jobWaiting(names.length, people, crew.shift || 0);
    wait.textContent = waiting.length ? fill(W.waiting, { names: listOf(waiting.map(p => p.name)) }) : '';
    wait.hidden = !waiting.length;
    grid.textContent = '';
    names.forEach((job, i) => {
      const li = el('li', 'dw5-job');
      li.appendChild(own ? typed('span', 'dw5-jobname', job) : el('span', 'dw5-jobname', job));
      li.appendChild(who[i] ? (byHand ? typed('b', 'dw5-jobwho dw5-iso', who[i].name) : el('b', 'dw5-jobwho dw5-iso', who[i].name)) : el('span', 'dw5-jobwho dw5-muted', W.open));
      grid.appendChild(li);
    });
    if (!people.length) grid.appendChild(el('li', 'dw-empty dw5-jobnote', W.nobodyTyped || W.nobody));
  };
  if (ctx.teacher && !ctx.editing) {
    const row = el('div', 'dw-row dw-foot');
    const rot = ibtn('↻', W.rotate, 'btn btn-sm btn-primary'), mix = ibtn('🔀', W.shuffle, 'btn btn-sm');
    rot.addEventListener('click', () => { ctx.set('crew', { order: byHand ? (crew.order || []) : people.map(p => p.id), shift: (crew.shift || 0) + 1 }); ctx.say(W.rotated); });
    mix.addEventListener('click', () => {
      if (byHand) {   // typed names: the list itself is put in a new order (and the chart starts from the top)
        const list = [...typedNames];
        for (let i = list.length - 1; i > 0; i--) { const j = rnd(i + 1); [list[i], list[j]] = [list[j], list[i]]; }
        ctx.set('names', list.join('\n')); ctx.set('crew', { order: crew.order || [], shift: 0 }); ctx.say(W.shuffled);
        return;
      }
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
    // the site's own question box (app.js ask, passed in as ctx.ask: this file is also loaded by the Node tests)
    if (!(await ctx.ask({ text: W.resetConfirm, ok: W.resetAll, danger: true }))) return;
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
  // Each face's count stays on the teacher's own screen: on the projector, in a small class, "Sad 1" could point to one
  // child. The projector shows only how many have checked in.
  const bars = el('ul', 'dw-bars dw5-moodbars dw-private');
  const metaRow = el('div', 'dw-checkmetarow dw5-moodmeta');
  const meta = el('span', 'dw-checkmeta');
  const names = ibtn('👀', W.names, 'btn btn-sm dw-private');
  metaRow.append(meta, names);
  const hidden = el('p', 'dw-public dw5-moodhidden', W.countsHidden);
  body.append(bars, metaRow, hidden);
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
