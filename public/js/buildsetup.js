// /build/new: the step-by-step setup before the Builder (server/routes/build-setup.js). One screen at a time: start,
// seven steps (game type, 2D or 3D, world, who is in it, how it is played, what it teaches, extras), then "Here is your
// game plan".
// The choices live in this page only (nothing is stored, here or on the server) until "Open the Builder": that makes
// the game, adds a chosen file with the Studio's own upload, and starts the first build with the plan as data
// ({ plan }: each of game type, world and character is { from: 'pack', id } or { from: 'custom', text }). The server
// writes the message from the plan and screens it like any typed message. "I know what I want" and "Skip to the
// Builder" make an empty game and open the Studio, exactly as "New game" always did.
import { api, toast, sheet, esc, $, $$, t } from '/js/app.js';
import { LANG } from '/js/i18n.js';

// "What are you making?" comes first: a Classroom activity (four short steps: what to practise, on the start screen;
// your lesson; what it is for; how much help; how it is played) or an Arcade game (the steps below, unchanged). D.canvas.kind is the
// card that starts selected (a teacher, or opened from a class); one tap switches. An activity's plan is { kind:
// 'activity', topic, help: [modes], played, grade, lesson: { text, doc } } (builder/plan.js): the topic, the class's
// grade and what they add about their lesson, never the class or its students. "Your lesson" is optional: a file
// (teachers: read on the server, never kept; only its text comes back, with the names of their students, emails and
// phone numbers already taken out) and a box to describe what they want. "How much help?" takes one or more.
const D = JSON.parse($('#page-data').textContent);
const STEPS = D.steps, KEYS = STEPS.map(s => s.key), CSTEPS = ['lesson', 'purpose', 'help', 'played'];
const ORDER = ['start', ...KEYS, ...CSTEPS, 'plan'];
const order = () => (S.kind === 'activity' ? ['start', ...CSTEPS, 'plan'] : ['start', ...KEYS, 'plan']);
const stepOf = key => STEPS.find(s => s.key === key) || (CSTEPS.includes(key) ? { key } : null);
const S = { kind: D.canvas.kind, topicText: '', lesson: { text: '', doc: null, busy: false }, screen: 'start', sel: { type: [], look: [], world: [], chars: [], play: [], learn: [], help: [...D.canvas.help], purpose: [...D.canvas.purpose], played: ['devices'] }, idea: { type: '', world: '', chars: '', learn: '' }, notes: '', files: [], back: null, gameId: null, busy: false, playPicked: false };
const list = items => { try { return new Intl.ListFormat(LANG, { style: 'long', type: 'conjunction' }).format(items); } catch { return items.join(', '); } };
const say = msg => { const l = $('#su-live'); l.textContent = ''; setTimeout(() => { l.textContent = msg; }, 30); };

// ---------------------------------------------------------------- screens
/** The steps the chosen kind of game skips (a survey or a scoreboard has no 2D or 3D, world or characters), and the
 *  steps that are left. */
const skipped = () => D.skip[S.sel.type[0]] || [];
const liveKeys = () => KEYS.filter(k => !skipped().includes(k));
/** "Step 2 of 3" and the dots, counting only the steps that are left. */
function paintProgress() {
  const keys = liveKeys(), skip = skipped();
  for (const key of KEYS) {
    const scr = $(`.su-screen[data-screen="${key}"]`); if (!scr) continue;
    const i = keys.indexOf(key), n = i < 0 ? KEYS.indexOf(key) + 1 : i + 1, total = i < 0 ? KEYS.length : keys.length;
    $('.su-count', scr).textContent = t('js.buildsetup.progress', { n, total });
    $$('.su-dots i', scr).forEach((dot, k) => {
      const at = keys.indexOf(KEYS[k]);
      dot.hidden = i >= 0 && skip.includes(KEYS[k]);
      dot.classList.toggle('on', i < 0 ? k <= KEYS.indexOf(key) : at >= 0 && at <= i);
    });
  }
}
/** Show one screen. focus: move to its heading (a step change); push: add it to the browser's Back. */
function show(screen, { focus = true, push = true } = {}) {
  S.screen = screen;
  paintProgress();
  for (const el of $$('.su-screen')) el.hidden = el.dataset.screen !== screen;
  $('#su-skipall').hidden = screen === 'start';
  if (screen === 'world' || screen === 'chars' || screen === 'play' || screen === 'plan') refreshLimits();
  if (screen === 'plan') renderPlan();
  if (push) history.pushState({ su: screen }, '', screen === 'start' ? location.pathname : `#${screen}`);
  if (focus) { const h = $(`#su-h-${screen}`); if (h) h.focus({ preventScroll: true }); scrollTo({ top: 0, behavior: 'instant' }); }
}
addEventListener('popstate', e => { const to = (e.state && e.state.su) || 'start'; show(ORDER.includes(to) ? to : 'start', { push: false }); });
history.replaceState({ su: 'start' }, '', location.pathname);   // a reload starts again: the choices were never stored

/** Next / Skip this step / Back. A step opened with "Change" on the plan goes back to the plan. */
function go(dir) {
  if (S.back && S.screen !== 'plan') { const to = S.back; S.back = null; return show(to); }
  const list = order().filter(k => S.kind === 'activity' || !skipped().includes(k)), i = list.indexOf(S.screen);
  show(list[Math.max(0, Math.min(list.length - 1, i + (dir === 'back' ? -1 : 1)))]);
}

// ---------------------------------------------------------------- the two groups of game types
/** Show one group of the game-type step ("For your class" or "Games"); a pick in the other group stays picked. */
function showGroup(id) {
  for (const b of $$('[data-tgroup-btn]')) b.setAttribute('aria-pressed', String(b.dataset.tgroupBtn === id));
  for (const c of $$('.su-card[data-tgroup]')) c.hidden = c.dataset.tgroup !== id;
  for (const p of $$('[data-tgroup-hint]')) p.hidden = p.dataset.tgroupHint !== id;
}

// ---------------------------------------------------------------- picking
const cardsOf = key => $$(`.su-pick[data-step="${key}"]`);
function paint(key) {
  for (const b of cardsOf(key)) { const on = S.sel[key].includes(b.dataset.id); b.setAttribute('aria-pressed', String(on)); b.closest('.su-card').classList.toggle('is-on', on); }
  const box = $(`#su-else-${key}`);
  if (box) {
    const on = S.sel[key].includes('else'); box.hidden = !on;
    const btn = $(`.su-pick[data-step="${key}"][data-id="else"]`); if (btn) btn.setAttribute('aria-expanded', String(on));
  }
}
function pick(key, id) {
  if (key === 'played') { S.sel[key] = [id]; paint(key); return; }   // how an activity is played: one answer
  const st = stepOf(key), cur = S.sel[key], had = cur.includes(id);
  S.sel[key] = st.multi ? (had ? cur.filter(x => x !== id) : [...cur, id]) : had ? [] : [id];
  paint(key);
  if (key === 'type') paintProgress();
  if (key === 'play') S.playPicked = true;
  if (id === 'else' && !had) { const inp = $(`#su-idea-${key}`); inp.focus(); inp.scrollIntoView({ block: 'nearest' }); }
  if (key === 'chars' || key === 'world' || key === 'look' || key === 'type') refreshLimits(); else refreshAll();
}

// What can be picked follows the 2D or 3D choice, so the plan never promises what the Builder cannot do (a card that
// cannot be picked says why):
//   3D (or not chosen, or "You pick for me"): the characters of the 3D worlds. A world limits who lives in it, and
//     characters picked together must share a world. An animal that is only a 2D sprite so far (the dinosaurs) waits.
//   2D: the 2D sprites, as many as they like. The first one picked is who they play as (its card says so); the others
//     are friends who are in the game too. Only running and catching games draw our worlds and characters in 2D so
//     far: for the other kinds a note says the classic look is used.
const charById = id => D.characters.find(c => c.id === id);
const worldName = id => (D.worlds.find(w => w.id === id) || { name: id }).name;
const isFlat = () => S.sel.look[0] === '2d';
/** 2D with a kind of game that does not draw worlds or sprite characters yet (a quiz, a board game, their own kind). */
const flatPlain = () => isFlat() && !!S.sel.type[0] && !D.art2d.types.includes(S.sel.type[0]);
function refreshLimits() {
  const flat = isFlat();
  const world = !flat && S.sel.world[0] && S.sel.world[0] !== 'else' ? S.sel.world[0] : '';
  // Picks that no longer fit are taken out (the look or the world changed after they were picked).
  S.sel.chars = S.sel.chars.filter(id => { const c = charById(id); return !c || (flat ? c.in2d : c.in3d && (!world || c.worlds.includes(world))); });
  // 3D: the picks must share a world. In the order they were picked, one that shares no world with those before it
  // is taken out (picks made for a 2D game, then the look changed).
  let ok = world ? [world] : D.worlds.map(w => w.id);
  if (!flat) S.sel.chars = S.sel.chars.filter(id => { const c = charById(id); if (!c) return true; const both = ok.filter(w => c.worlds.includes(w)); if (!both.length) return false; ok = both; return true; });
  const player = flat ? S.sel.chars.find(id => id !== 'else') : '';
  for (const b of cardsOf('chars')) {
    const c = charById(b.dataset.id); if (!c) continue;
    const picked = S.sel.chars.includes(c.id);
    let line = c.kind === 'creature' ? '' : t('js.buildsetup.chars.hero'), can = true;
    if (flat) {
      if (!c.in2d) { can = false; line = t('js.buildsetup.chars.only3d'); }
      else if (c.id === player) line = t('js.buildsetup.chars.youPlay');
    } else if (!c.in3d) { can = false; line = t('js.buildsetup.chars.only2d'); }
    else if (!picked && !c.worlds.some(w => ok.includes(w))) { can = false; line = world ? t('js.buildsetup.chars.notIn', { world: worldName(world) }) : t('js.buildsetup.chars.otherWorld'); }
    else if (c.kind === 'creature') line = t('js.buildsetup.chars.livesIn', { worlds: list(c.worlds.map(worldName)) });
    b.disabled = !can;
    $('.su-desc', b).textContent = line;
  }
  paint('chars');
  for (const chip of $$('[data-soon3d]')) chip.hidden = flat;
  for (const id of ['su-chars-2d', 'su-world-2d', 'su-plan-2d']) $(`#${id}`).hidden = !flatPlain();
  refreshPlay();
  refreshAll();
}

// "How will it be played?": Live with my class or group, On one screen, On my own. A kind of game that cannot be live
// (a tool for the board, the survey, the exit ticket) or a ready-made 3D world keeps its Live card, greyed out, with the
// reason as its line. Until they pick one themselves, the step follows the kind of game (D.play.def: for a teacher the
// classroom types that work live start on Live, for a kid On my own); a pick that no longer fits goes back to that.
const playText = new Map(cardsOf('play').map(b => [b.dataset.id, $('.su-desc', b).textContent]));
/** Is this plan a ready-made 3D world (Kit 2)? The same answer as plan.js planEngine. */
function isKit2() {
  const type = S.sel.type[0] && S.sel.type[0] !== 'else' ? S.sel.type[0] : '';
  if (type && D.skip[type] && D.skip[type].includes('world')) return false;   // a classroom starter
  const look = S.sel.look[0], flat = look === '2d';
  if (flat) return false;
  const picked = S.sel.chars.filter(id => id !== 'else').map(charById).filter(Boolean), in3d = picked.filter(c => c.in3d);
  const world = S.sel.world[0], packWorld = world && world !== 'else', customWorld = world === 'else' && !!ideaOf('world');
  if (look !== '3d') {
    if ((type && D.play.flat.includes(type)) || picked.some(c => !c.in3d)) return false;
    if (!packWorld && !in3d.length) return false;
  }
  return !(customWorld && !in3d.length);
}
function refreshPlay() {
  const type = S.sel.type[0] && S.sel.type[0] !== 'else' ? S.sel.type[0] : '';
  const why = (type && D.play.not[type]) || (isKit2() ? D.play.kit2 : '');
  for (const b of cardsOf('play')) {
    const off = b.dataset.id === 'live' && !!why;
    b.disabled = off; b.closest('.su-card').classList.toggle('is-off', off);
    $('.su-desc', b).textContent = off ? D.play.why[why] : playText.get(b.dataset.id);
  }
  let def = D.play.def[type] || 'solo';
  if (def === 'live' && why) def = type && D.play.not[type] ? 'screen' : 'solo';
  if (!S.playPicked || (why && S.sel.play[0] === 'live')) S.sel.play = [def];
  paint('play');
}

// "Select all" on a multi-select section (a group of characters, or what it teaches): picks every card of the section
// that can be picked right now (never a blocked one, never "Something else"); when they all are picked it reads "Clear
// all" and clears that section only. Hidden while fewer than two cards can be picked.
// In 3D, characters picked together must share a world. So "Select all" there picks the largest set of the section
// that shares one world with what is already picked (the first such world when two tie); the rest then grey out exactly
// as they do after single picks, and the message says which world it is.
const allCards = scope => (scope === 'learn' ? cardsOf('learn') : $$(`.su-group[data-group="${scope.split(':')[1]}"] .su-pick`)).filter(b => b.dataset.id !== 'else');
const allKey = scope => (scope === 'learn' ? 'learn' : 'chars');
function refreshAll() {
  for (const btn of $$('.su-all')) {
    const key = allKey(btn.dataset.all), cards = allCards(btn.dataset.all), can = cards.filter(b => !b.disabled);
    const done = can.length > 0 && can.every(b => S.sel[key].includes(b.dataset.id));
    btn.hidden = can.length < 2;
    btn.textContent = t(done ? 'js.buildsetup.all.clear' : 'js.buildsetup.all.select');
    btn.setAttribute('aria-pressed', String(done));
    btn.setAttribute('aria-label', t(done ? 'js.buildsetup.all.clearLabel' : 'js.buildsetup.all.selectLabel', { name: btn.dataset.name }));
  }
}
function selectAll(btn) {
  const scope = btn.dataset.all, key = allKey(scope), ids = allCards(scope).filter(b => !b.disabled).map(b => b.dataset.id);
  if (btn.getAttribute('aria-pressed') === 'true') {
    S.sel[key] = S.sel[key].filter(id => !ids.includes(id));
    paint(key); if (key === 'chars') refreshLimits(); else refreshAll();
    say(t('js.buildsetup.all.cleared')); btn.focus(); return;
  }
  let take = ids, world = '';
  if (key === 'chars' && !isFlat()) {
    // the worlds everything picked so far shares (and the chosen world, when there is one)
    const chosen = S.sel.world[0] && S.sel.world[0] !== 'else' ? S.sel.world[0] : '';
    let ok = chosen ? [chosen] : D.worlds.map(w => w.id);
    for (const id of S.sel.chars) { const c = charById(id); if (c) ok = ok.filter(w => c.worlds.includes(w)); }
    let best = []; for (const w of ok) { const set = ids.filter(id => charById(id).worlds.includes(w)); if (set.length > best.length) { best = set; world = w; } }
    take = best; if (take.length === ids.length || chosen) world = '';
  }
  S.sel[key] = [...S.sel[key], ...take.filter(id => !S.sel[key].includes(id))];
  paint(key); if (key === 'chars') refreshLimits(); else refreshAll();
  const n = take.length;
  say(world ? t('js.buildsetup.all.pickedWorld', { count: n, world: worldName(world) }) : t('js.buildsetup.all.picked', { count: n }));
  btn.focus();
}

// ---------------------------------------------------------------- "What are you making?"
/** Pick a card: the topic box and the right buttons follow it. */
function setKind(kind) {
  S.kind = kind;
  for (const b of $$('.su-kind')) b.setAttribute('aria-pressed', String(b.dataset.kind === kind));
  for (const el of $$('.su-start [data-for]')) el.hidden = !(el.dataset.for === 'both' || el.dataset.for === kind);
  $('.su-start').dataset.kind = kind;
}
/** What they typed under "What should students practise?" (no chips since #431's follow-up: one box). */
const topicOf = () => { const text = S.topicText.trim().replace(/\s+/g, ' '); return text ? { text } : null; };

// ---------------------------------------------------------------- "How much help?": one or more (checkboxes)
const HELP_ORDER = D.canvas.supports;
/** Tick or untick a mode; the last one ticked cannot be unticked (at least one), and the page says so. */
function toggleHelp(box) {
  const id = box.dataset.help, on = box.checked;
  if (!on && S.sel.help.length === 1 && S.sel.help[0] === id) {
    box.checked = true; $('#su-help-one').hidden = false; say(t('js.buildsetup.lesson.atLeastOne')); return;
  }
  $('#su-help-one').hidden = true;
  S.sel.help = HELP_ORDER.filter(h => (h === id ? on : S.sel.help.includes(h)));
  paintHelp();
}
function paintHelp() {
  for (const b of $$('.su-cbox')) { const on = S.sel.help.includes(b.dataset.help); b.checked = on; b.closest('.su-card').classList.toggle('is-on', on); }
}

// ---------------------------------------------------------------- "What is it for?": one or more (checkboxes)
// Practice on screen, a printable worksheet, a question generator (builder/plan.js PURPOSES); at least one.
const PURPOSE_ORDER = D.canvas.purposes;
function togglePurpose(box) {
  const id = box.dataset.purpose, on = box.checked;
  if (!on && S.sel.purpose.length === 1 && S.sel.purpose[0] === id) {
    box.checked = true; $('#su-purpose-one').hidden = false; say(t('js.buildsetup.lesson.atLeastOne')); return;
  }
  $('#su-purpose-one').hidden = true;
  S.sel.purpose = PURPOSE_ORDER.filter(p => (p === id ? on : S.sel.purpose.includes(p)));
  paintPurpose();
}
function paintPurpose() {
  for (const b of $$('.su-pbox')) { const on = S.sel.purpose.includes(b.dataset.purpose); b.checked = on; b.closest('.su-card').classList.toggle('is-on', on); }
}

// ---------------------------------------------------------------- "Your lesson": a file and a box (all optional)
const L = D.lesson;
const nf = n => { try { return new Intl.NumberFormat(LANG).format(n); } catch { return String(n); } };
function paintCount() { const n = $('#su-ltext').value.length; $('#su-lcount').innerHTML = `<span dir="ltr">${esc(t('js.buildsetup.lesson.count', { n: nf(n), max: nf(L.max) }))}</span>`; }   // "45 / 2,000" reads the same way in Hebrew and Arabic
/** A prompt chip: its heading at the end of the box (on a line of its own), and the cursor after it. */
function addHead(key) {
  const box = $('#su-ltext'), head = L.heads[key], cur = box.value;
  const sep = !cur.trim() ? '' : cur.endsWith('\n\n') ? '' : cur.endsWith('\n') ? '\n' : '\n\n';
  const next = `${cur.trim() ? cur : ''}${sep}${head} `;
  if (next.length > L.max) { say(t('js.buildsetup.lesson.full')); return; }
  box.value = next; S.lesson.text = next; paintCount();
  box.focus(); box.setSelectionRange(next.length, next.length); box.scrollTop = box.scrollHeight;
}
const lessonErr = msg => { const e = $('#su-lerr'); e.textContent = msg || ''; e.hidden = !msg; };
function paintFile() {
  const st = $('#su-lstatus'), d = S.lesson.doc; if (!st) return;
  if (S.lesson.busy) { st.hidden = false; st.className = 'su-lstatus is-busy'; st.innerHTML = `<span class="su-lname" dir="auto">${esc(t('js.buildsetup.lesson.reading', { name: S.lesson.busy }))}</span>`; return; }
  if (!d) { st.hidden = true; st.innerHTML = ''; $('#su-lfile-btn').hidden = false; return; }
  const read = d.kind === 'pdf' ? t('js.buildsetup.lesson.readPages', { count: d.pages, name: d.name }) : t('js.buildsetup.lesson.readWords', { count: d.words, n: nf(d.words), name: d.name });
  st.hidden = false; st.className = 'su-lstatus';
  st.innerHTML = `<span class="su-lread"><span class="su-lname" dir="auto">${esc(read)}</span>${d.removed ? `<span class="su-lnote">${esc(t('js.buildsetup.lesson.removed', { count: d.removed }))}</span>` : ''}${d.cut ? `<span class="su-lnote">${esc(t('js.buildsetup.lesson.cut'))}</span>` : ''}</span>
    <button type="button" class="btn btn-ghost btn-sm su-lremove" id="su-lremove" aria-label="${esc(t('js.buildsetup.lesson.removeLabel', { name: d.name }))}">${esc(t('js.buildsetup.lesson.remove'))}</button>`;
  $('#su-lfile-btn').hidden = true;
}
/** Read a file on the server (never kept there); only its text comes back. Checked here first (kind, size). */
async function readFile(f) {
  lessonErr('');
  const ext = ((f.name.match(/\.([a-z0-9]+)$/i) || [])[1] || '').toLowerCase().replace(/^markdown$/, 'md');
  if (!L.file.kinds.includes(ext)) { lessonErr(t('js.buildsetup.lesson.err.docType')); return; }
  if (f.size > L.file.bytes) { lessonErr(t('js.buildsetup.lesson.err.docBig')); return; }
  S.lesson.busy = f.name; paintFile();
  try {
    const res = await fetch(`/api/build/lesson-file?name=${encodeURIComponent(f.name)}`, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/octet-stream', Accept: 'application/json' }, body: f });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) { location.href = `/login?next=${encodeURIComponent('/build/new')}`; return; }
    if (!res.ok) { S.lesson.busy = false; paintFile(); lessonErr(data.code ? t(`js.buildsetup.lesson.err.${data.code}`) : data.error || t('js.buildsetup.lesson.err.failed')); return; }
    S.lesson.doc = { name: data.name, kind: data.kind, pages: data.pages, words: data.words, cut: !!data.cut, removed: data.removed | 0, text: data.text };
    S.lesson.busy = false; paintFile(); say($('#su-lstatus .su-lname').textContent);
    const rm = $('#su-lremove'); if (rm) rm.focus();
  } catch { S.lesson.busy = false; paintFile(); lessonErr(t('js.buildsetup.lesson.err.failed')); }
}
const lessonOf = () => { const text = S.lesson.text.trim(), d = S.lesson.doc; return text || d ? { text, doc: d ? { name: d.name, kind: d.kind, pages: d.pages, text: d.text } : null } : null; };

// ---------------------------------------------------------------- the plan
const ideaOf = key => S.idea[key].trim().replace(/\s+/g, ' ');
/** The choices as the Builder gets them: pack choices by id, typed ones as custom text; blank means it decides. */
function buildPlan() {
  const from = D.canvas.forClass ? { forClass: true } : {};
  if (S.kind === 'activity') { const lesson = lessonOf(); return { kind: 'activity', topic: topicOf(), help: [...S.sel.help], purpose: [...S.sel.purpose], played: S.sel.played[0] || 'devices', grade: D.canvas.grade || '', ...(lesson ? { lesson } : {}), ...from }; }
  const skip = skipped();
  const one = key => { const id = S.sel[key][0]; if (!id || skip.includes(key)) return null; if (id === 'else') return ideaOf(key) ? { from: 'custom', text: ideaOf(key) } : null; return { from: 'pack', id }; };
  return {
    type: one('type'), look: skip.includes('look') ? null : S.sel.look[0] || null, world: one('world'),
    characters: skip.includes('chars') ? [] : S.sel.chars.map(id => (id === 'else' ? (ideaOf('chars') ? { from: 'custom', text: ideaOf('chars') } : null) : { from: 'pack', id })).filter(Boolean),
    learn: skip.includes('learn') ? [] : S.sel.learn.map(id => (id === 'else' ? (ideaOf('learn') ? { text: ideaOf('learn') } : null) : { id })).filter(Boolean),
    notes: S.notes.trim(), play: S.sel.play[0] || null, ...from,
  };
}
// How it is played starts on an answer by itself: alone, it is a plan only once they picked it.
const isEmpty = p => p.kind !== 'activity' && !p.type && !p.look && !p.world && !p.characters.length && !p.learn.length && !p.notes && !S.files.length && !(p.play && S.playPicked);
const nameOf = (key, id) => { const el = $(`.su-pick[data-step="${key}"][data-id="${id}"] .su-name`); return el ? el.textContent : id; };
function renderPlan() {
  const h = $('#su-h-plan'); h.textContent = S.kind === 'activity' ? h.dataset.activity : h.dataset.game;
  if (S.kind === 'activity') return renderActivityPlan();
  const rows = STEPS.filter(s => !skipped().includes(s.key)).map(s => {
    const name = t(`js.buildsetup.stepNames.${s.key}`);
    let value, scratch = false;
    if (s.key === 'extras') {
      value = [S.files.length ? t('js.buildsetup.plan.files', { count: S.files.length }) : '', S.notes.trim()].filter(Boolean).join(' · ') || t('js.buildsetup.plan.nothing');
    } else {
      const labels = S.sel[s.key].map(id => (id === 'else' ? ideaOf(s.key) : nameOf(s.key, id))).filter(Boolean);
      value = labels.length ? list(labels) : t('js.buildsetup.plan.decides');
      scratch = !!s.pack && S.sel[s.key].includes('else') && !!ideaOf(s.key);
    }
    return `<div class="su-row"><dt>${esc(name)}</dt><dd><span class="su-val" dir="auto">${esc(value)}</span>${scratch ? ` <span class="stchip warn su-scratch">${esc(t('js.buildsetup.plan.scratch'))}</span>` : ''}</dd>
      <button type="button" class="btn btn-ghost btn-sm su-change" data-change="${s.key}" aria-label="${esc(t('js.buildsetup.plan.changeLabel', { name }))}">${esc(t('js.buildsetup.plan.change'))}</button></div>`;
  });
  $('#su-rows').innerHTML = rows.join('');
  const plan = buildPlan(), told = $('#su-told');
  if (isEmpty(plan)) { told.textContent = t('js.buildsetup.plan.empty'); return; }
  told.textContent = '…';
  api('/api/build/plan', { method: 'POST', body: { plan, files: S.files.length } })
    .then(r => { if (S.screen === 'plan') told.textContent = r.text || t('js.buildsetup.plan.empty'); })
    .catch(e => { if (e.signedOut) { location.href = `/login?next=${encodeURIComponent('/build/new')}`; return; } told.textContent = e.message; });
}

/** An activity's plan: what it is, what they practise, their lesson, how much help, how it is played. Under the rows,
 *  what the Builder will read about their lesson, as the server will send it (names, emails and phone numbers out). */
function renderActivityPlan() {
  const topic = topicOf(), lesson = lessonOf();
  const lessonVal = !lesson ? t('js.buildsetup.lesson.none') : [lesson.doc ? lesson.doc.name : '', lesson.text ? t('js.buildsetup.lesson.notes') : ''].filter(Boolean).join(' · ');
  const rows = [
    ['kind', t('js.buildsetup.canvas.activity'), 'start'],
    ...(topic ? [['practise', topic.text, 'start']] : []),
    ['lesson', lessonVal, 'lesson'],
    ['purpose', list(S.sel.purpose.map(id => $(`.su-pbox[data-purpose="${id}"]`).closest('label').querySelector('.su-name').textContent)), 'purpose'],
    ['help', list(S.sel.help.map(id => $(`.su-cbox[data-help="${id}"]`).closest('label').querySelector('.su-name').textContent)), 'help'],
    ['played', nameOf('played', S.sel.played[0]), 'played'],
  ];
  $('#su-rows').innerHTML = rows.map(([k, value, step]) => { const n = t(`js.buildsetup.canvas.rows.${k}`); return `<div class="su-row"><dt>${esc(n)}</dt><dd><span class="su-val" dir="auto">${esc(value)}</span></dd>
    <button type="button" class="btn btn-ghost btn-sm su-change" data-change="${step}" aria-label="${esc(t('js.buildsetup.plan.changeLabel', { name: n }))}">${esc(t('js.buildsetup.plan.change'))}</button></div>`; }).join('');
  const told = $('#su-told'), box = $('#su-lsum'); told.textContent = '…'; box.hidden = true; box.innerHTML = '';
  api('/api/build/plan', { method: 'POST', body: { plan: buildPlan(), files: 0 } })
    .then(r => { if (S.screen !== 'plan') return; told.textContent = r.text || t('js.buildsetup.plan.empty'); renderLessonSum(r); })
    .catch(e => { if (e.signedOut) { location.href = `/login?next=${encodeURIComponent('/build/new')}`; return; } told.textContent = e.message; });
}
/** "What the Builder reads about your lesson": each part they wrote, and the start of their file. */
function renderLessonSum(r) {
  const box = $('#su-lsum'), l = r.plan && r.plan.lesson;
  if (r.lessonBlocked) { box.hidden = false; box.innerHTML = `<p class="su-flag">${esc(t('js.buildsetup.lesson.blockedPlan'))}</p>`; return; }
  if (!l) return;
  const label = k => (k === 'details' ? t('js.buildsetup.lesson.details') : L.heads[k].replace(/[:：]\s*$/, ''));
  const part = (k, v) => `<div class="su-lpart"><dt>${esc(label(k))}</dt><dd dir="auto">${esc(v.length > 280 ? `${v.slice(0, 280)}…` : v)}</dd></div>`;
  const parts = ['goal', 'mistakes', 'vocabulary', 'avoid', 'details'].filter(k => l[k]).map(k => part(k, l[k]));
  if (l.doc) parts.push(`<div class="su-lpart"><dt>${esc(t('js.buildsetup.lesson.from', { name: l.doc.name }))}</dt><dd dir="auto" class="su-lexcerpt">${esc(l.doc.text.slice(0, 360))}${l.doc.text.length > 360 ? '…' : ''}</dd></div>`);
  box.hidden = false;
  box.innerHTML = `<h2 class="su-lsum-h">${esc(t('js.buildsetup.lesson.sumHeading'))}</h2><dl class="su-lparts">${parts.join('')}</dl>
    <p class="small muted su-lsum-note">${esc(r.removed ? t('js.buildsetup.lesson.sumRemoved', { count: r.removed }) : t('js.buildsetup.lesson.sumNote'))}</p>`;
}

// ---------------------------------------------------------------- files (worksheets and notes; the Studio's own upload)
function renderFiles() {
  $('#su-files').innerHTML = S.files.map((f, i) => `<li class="su-filerow"><span class="su-fname" dir="auto">${esc(f.file.name)}</span><button type="button" class="btn btn-ghost btn-sm" data-rmfile="${i}" aria-label="${esc(t('js.buildsetup.extras.removeLabel', { name: f.file.name }))}">${esc(t('js.buildsetup.extras.remove'))}</button></li>`).join('');
}
function addFiles(files) {
  for (const f of files) {
    if (S.files.length >= D.files.max) { toast(t('js.buildsetup.extras.tooMany', { max: D.files.max }), { bad: true }); break; }
    const ext = ((f.name.match(/\.([a-z0-9]+)$/i) || [])[1] || '').toLowerCase();
    if (!D.files.types.includes(f.type) && !D.files.ext.includes(ext)) { toast(t('js.buildsetup.extras.wrongType'), { bad: true }); continue; }
    if (f.size > (f.type === 'application/pdf' || ext === 'pdf' ? D.files.pdf : D.files.text)) { toast(t('js.buildsetup.extras.tooBig'), { bad: true }); continue; }
    S.files.push({ file: f, id: null });
  }
  renderFiles();
}

// ---------------------------------------------------------------- to the Builder
async function newGame(body = {}) { if (!S.gameId) S.gameId = (await api('/api/studio/new', { method: 'POST', body })).id; return S.gameId; }
/** Straight to the Builder, as "New game" always did: an empty game, nothing sent. */
async function direct(btn) {
  if (S.busy) return; S.busy = true;
  const old = btn.textContent; if (btn.id === 'su-skipall') btn.textContent = t('js.buildsetup.gettingReady'); btn.setAttribute('aria-busy', 'true');
  // "I know what I want" with Classroom activity picked: the activity starter, so the Builder works on an activity from
  // its first message (an arcade game starts empty, as it always did)
  try { location.href = `/studio/${await newGame(S.kind === 'activity' && btn.id === 'su-direct' ? { template: 'canvas' } : {})}`; }
  catch (e) { S.busy = false; btn.textContent = old; btn.removeAttribute('aria-busy'); if (e.signedOut) location.href = `/login?next=${encodeURIComponent('/build/new')}`; else toast(e.message, { bad: true }); }
}
const newCid = () => (crypto.randomUUID ? crypto.randomUUID() : Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, '0')).join(''));
/** "Open the Builder": the game, the file (if any), then the first build with the plan. If the build cannot start
 *  (no messages left today, the Builder is resting), the Studio opens with the sentence in the box and says why. */
async function openBuilder() {
  const btn = $('#su-open'), plan = buildPlan();
  if (isEmpty(plan)) return direct(btn);
  if (S.busy) return; S.busy = true;
  const old = btn.textContent; btn.textContent = t('js.buildsetup.plan.opening'); btn.setAttribute('aria-busy', 'true');
  const stop = () => { S.busy = false; btn.textContent = old; btn.removeAttribute('aria-busy'); };
  let id;
  try {
    id = await newGame();
    for (const f of S.files) {
      if (f.id) continue;
      const res = await fetch(`/api/studio/${id}/uploads?name=${encodeURIComponent(f.file.name)}`, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/octet-stream' }, body: f.file });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw Object.assign(new Error(data.error || t('js.app.wentWrong')), { signedOut: res.status === 401, file: f });
      f.id = data.upload.id;
    }
  } catch (e) {
    stop();
    if (e.signedOut) { location.href = `/login?next=${encodeURIComponent('/build/new')}`; return; }
    toast(e.message, { bad: true, ms: 6000 });
    if (e.file) { S.files = S.files.filter(x => x !== e.file); renderFiles(); renderPlan(); }   // that file is left out: they can open again
    return;
  }
  let pro = false; try { pro = localStorage.getItem('brb-pro') === '1'; } catch { /* private mode */ }
  let ok = false;
  try {
    const res = await fetch(`/api/studio/${id}/chat`, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ plan, uploads: S.files.map(f => f.id), cid: newCid(), detach: true, pro }) });
    ok = res.ok;
  } catch { ok = false; }
  const told = $('#su-told').textContent;
  location.href = ok || !told || told === '…' ? `/studio/${id}` : `/studio/${id}?ask=${encodeURIComponent(told.slice(0, 600))}`;
}

// ---------------------------------------------------------------- a world's close-up
function preview(id) {
  const btn = $(`.su-pick[data-step="world"][data-id="${id}"]`), name = worldName(id);
  const cover = $('img', btn).getAttribute('src');
  const { el, close } = sheet({
    title: name,
    content: `<div class="su-zoom"><p class="su-zoom-d">${esc($('.su-desc', btn).textContent)}</p>
      <img class="su-zoom-big" src="/img/kit2/worlds/${esc(id)}-preview.webp" width="1280" height="720" alt="${esc(t('js.buildsetup.world.gameAlt', { name }))}" decoding="async">
      <img class="su-zoom-cover" src="${esc(cover)}" width="640" height="360" alt="${esc(t('js.buildsetup.world.coverAlt', { name }))}" decoding="async" loading="lazy">
      <div class="su-zoom-btns"><button type="button" class="btn" data-zclose>${esc(t('js.buildsetup.world.close'))}</button><button type="button" class="btn btn-primary" data-zchoose>${esc(t('js.buildsetup.world.choose'))}</button></div></div>`,
  });
  $('.sheet', el).classList.add('su-sheet');
  $('[data-zclose]', el).addEventListener('click', close);
  $('[data-zchoose]', el).addEventListener('click', () => { if (!S.sel.world.includes(id)) pick('world', id); close(); say(t('js.buildsetup.world.chosen', { name })); });
}

// ---------------------------------------------------------------- events
document.addEventListener('click', e => {
  const p = e.target.closest('button.su-pick'); if (p) { if (!p.disabled) pick(p.dataset.step, p.dataset.id); return; }
  const hd = e.target.closest('[data-head]'); if (hd) { addHead(hd.dataset.head); return; }
  if (e.target.closest('#su-lremove')) { S.lesson.doc = null; paintFile(); lessonErr(''); say(t('js.buildsetup.lesson.gone')); $('#su-lfile-btn').focus(); return; }
  const tg = e.target.closest('[data-tgroup-btn]'); if (tg) { showGroup(tg.dataset.tgroupBtn); return; }
  const all = e.target.closest('.su-all'); if (all) { selectAll(all); return; }
  const g = e.target.closest('[data-go]'); if (g) { go(g.dataset.go); return; }
  const pv = e.target.closest('[data-preview]'); if (pv) { preview(pv.dataset.preview); return; }
  const ch = e.target.closest('[data-change]'); if (ch) { S.back = 'plan'; show(ch.dataset.change); return; }
  const rm = e.target.closest('[data-rmfile]'); if (rm) { S.files.splice(+rm.dataset.rmfile, 1); renderFiles(); $('#su-file-btn').focus(); }
});
$('#su-guide').addEventListener('click', () => show(KEYS[0]));
$('#su-cnext').addEventListener('click', () => show(CSTEPS[0]));
for (const b of $$('.su-kind')) b.addEventListener('click', () => setKind(b.dataset.kind));
for (const b of $$('.su-cbox')) b.addEventListener('change', () => toggleHelp(b));
for (const b of $$('.su-pbox')) b.addEventListener('change', () => togglePurpose(b));
$('#su-ltext').addEventListener('input', e => { S.lesson.text = e.target.value; paintCount(); });
if (L.file) {
  $('#su-lfile-btn').addEventListener('click', () => $('#su-lfile').click());
  $('#su-lfile').addEventListener('change', e => { const f = e.target.files[0]; e.target.value = ''; if (f) readFile(f); });
}
// No topic box on the start screen any more ("Your lesson" asks for it all); kept optional for a page that has one.
$('#su-topic-in')?.addEventListener('input', e => { S.topicText = e.target.value; });
$('#su-topic-in')?.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); show(CSTEPS[0]); } });
// "Classroom tools": today's eight board starters (the game-type step, on its "For your class" group)
$('#su-tools').addEventListener('click', e => { e.preventDefault(); setKind('arcade'); show(KEYS[0]); if (D.typeGroups.some(g => g.id === 'class')) showGroup('class'); });
$('#su-direct').addEventListener('click', e => direct(e.currentTarget));
$('#su-skipall').addEventListener('click', e => direct(e.currentTarget));
$('#su-open').addEventListener('click', openBuilder);
for (const inp of $$('[data-idea]')) {
  inp.addEventListener('input', () => { S.idea[inp.dataset.idea] = inp.value; });
  inp.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); go('next'); } });
}
$('#su-notes').addEventListener('input', e => { S.notes = e.target.value; });
$('#su-notes').addEventListener('keydown', e => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); go('next'); } });
$('#su-file-btn').addEventListener('click', () => $('#su-file').click());
$('#su-file').addEventListener('change', e => { addFiles([...e.target.files]); e.target.value = ''; });
refreshLimits();
if (D.typeGroups.length) showGroup(D.typeGroups[0].id);
paintProgress();
setKind(S.kind); paintHelp(); paintPurpose(); paint('played'); paintCount();
