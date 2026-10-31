// Tool executor shared by every provider (Claude and mock). Each tool returns
//   { ok, forModel: string, event?: [name, data] }
// forModel goes back to the model as the tool result; event is streamed to the Studio over SSE.
// write_game / edit_game always create a NEW version (history is never rewritten) after sanitize + static scan.
// Each tool starts its live build step (steps.js) before exec() streams its event, so the row comes before its card.
// Once the build's signal is aborted (time cap, game deleted, ban, a restart hand-off: runner.js), exec() refuses every
// tool and saveVersion() writes nothing, so no version can land after a build ended or was handed off.
import * as games from '../services/games.js';
import { sanitizeGameHtml, MAX_GAME_BYTES } from '../services/sanitize.js';
import { scanVersion } from '../services/scanner.js';
import { respectChoices } from '../services/stylelint.js';
import { cleanText } from '../services/textfilter.js';
import { signToken } from '../auth.js';
import * as snapshot from '../services/snapshot.js';
import { localeInfo } from '../i18n/index.js';
import { templateHtml, templateInfo, TEMPLATE_KEYS } from './catalog.js';
import { NO_STEPS, cleanNote } from './steps.js';
import { stripLinks } from './search.js';

// Templates the Builder may start from with start_from_template: every template (all on the Oomba Kit; island is 3D).
const STARTERS = TEMPLATE_KEYS;

const CATS = games.CATEGORY_KEYS;
/** A Studio preview link (signed, short-lived). lang: the builder's language, passed to the game as BRB.user.lang. */
export const previewUrl = (version, game, userId, lang = null) => `/frame/${signToken({ v: version.id, g: game.id, u: userId, p: 1, ...(lang ? { l: lang } : {}) })}`;
const plainIssues = report => (report.issues || []).map(i => `${i.level === 'fail' ? 'Must fix' : 'Check'}: ${i.message}`);
/** The same, with the scan's model-only details (e.g. which word matched): only ever in the model's tool result. */
const modelIssues = report => (report.issues || []).map(i => `${i.level === 'fail' ? 'Must fix' : 'Check'}: ${i.message}${i.detail ? ' ' + i.detail : ''}`);
/** What the playtest's probe (snapshot.js probeGame) and the kit's state say is wrong with a kit game's round. */
export function probeProblems(r, after = {}) {
  const out = [], p = r && r.probe;
  let st = null; try { st = after && after.state ? JSON.parse(after.state) : null; } catch { st = null; }
  if (st && st.game && st.scene === 'play' && st.controls !== 'none' && typeof st.inView === 'number' && st.inView < 2) out.push('The play picture (it becomes the game\'s cover) shows almost nothing but the ground and the hero. Put pickups, friends or props near the start, or frame the camera on them.');
  if (!p || p.error || !p.s1) return out;
  const { s0, s1 } = p, cell = s1.cell || 48, ended = p.scenes.some(x => /^(win|lose|goal)$/.test(x));
  if (!ended && (s1.controls !== 'none' || s1.total > 0) && s1.score === s0.score && s1.got === s0.got && p.moved < cell && /^(play|talk|countdown)$/.test(s1.scene)) out.push('In 25 s of play (holding right, jumping, answering every question) nothing happened: no points, no pickups and the hero did not move. Check the controls, the level and that the round can be won (controls: \'none\' means no hero movement: move the hero from code). If it is played some other way, play it through yourself in your head.');
  else if (!ended && s1.total > 0 && s1.got === 0) out.push(`In 25 s of play nothing was picked up (0 of ${s1.total}). Check the pickups can be reached from the start.`);
  if (p.scenes.includes('talk') && s1.scene === 'talk') out.push('The game was stuck in a story beat (scene "talk") at the end of the playtest: a gate or talk handler may never finish (on.gate should ask, open the gate, or return true / false).');
  if (p.covered) out.push(`The hero is hidden under the game's own ${p.covered} on screen. Keep your own pieces clear of the play area (below var(--ok-safe-top), or in a card at the bottom with the camera framed above it).`);
  return out;
}
/** The style lint's notes for the model (kit games only; they never block a version). */
// The creative-freedom guarantee (stylelint.js respectChoices): look notes the builder's own words asked for are dropped,
// and the rest of the look notes are worded as suggestions. requests: the builder's messages for this game.
export const styleTips = (report, requests = []) => respectChoices(report.lint || [], requests).map(l => (l.look ? `Look suggestion, skip it if the builder asked for this look (${l.code}): ${l.message}` : `${l.level === 'warn' ? 'Style' : 'Tip'} (${l.code}): ${l.message}`));

/** Apply exact find/replace edits. Each find must occur exactly once (in the text as it is when that edit runs). */
export function applyEdits(html, edits) {
  if (!Array.isArray(edits) || !edits.length) return { ok: false, error: 'edits must be a non-empty list of { find, replace }.' };
  if (edits.length > 60) return { ok: false, error: 'Too many edits in one go (max 60). Use write_game for big changes.' };
  let out = String(html);
  for (let i = 0; i < edits.length; i++) {
    const e = edits[i] || {};
    if (typeof e.find !== 'string' || typeof e.replace !== 'string') return { ok: false, error: `Edit ${i + 1}: find and replace must both be text.` };
    if (!e.find) return { ok: false, error: `Edit ${i + 1}: find is empty.` };
    const n = out.split(e.find).length - 1;
    if (n === 0) return { ok: false, error: `Edit ${i + 1}: the find text was not found in the current game. Copy it exactly (spaces and quotes too), or include more surrounding text.` };
    if (n > 1) return { ok: false, error: `Edit ${i + 1}: the find text appears ${n} times. Include more surrounding text so it appears exactly once.` };
    const at = out.indexOf(e.find);
    out = out.slice(0, at) + e.replace + out.slice(at + e.find.length);
  }
  return { ok: true, html: out };
}

/** ctx: { user, gameId, emit(name, data), state, locale, steps?, signal?, requests? (the builder's own messages: the style check respects them) } — state.scanFails counts failed scans this turn. */
export function toolbox(ctx) {
  const steps = ctx.steps || NO_STEPS;
  const game = () => games.getGame(ctx.gameId);
  const current = () => { const g = game(); return g && g.current_version_id ? games.getVersion(g.current_version_id) : null; };

  const stopped = () => !!(ctx.signal && ctx.signal.aborted);
  function saveVersion(rawHtml, notes) {
    // Checked here, not only in exec(): start_from_template awaits the template files before it saves.
    if (stopped()) return { ok: false, forModel: 'Stopped.', stop: true };
    const g0 = game(); if (!g0 || g0.status === 'deleted') return { ok: false, forModel: 'The game was deleted.', stop: true };
    if (typeof rawHtml !== 'string' || rawHtml.trim().length < 20) return { ok: false, forModel: 'The game was empty. Send the complete game document.' };
    if (Buffer.byteLength(rawHtml) > MAX_GAME_BYTES) return { ok: false, forModel: 'The game is bigger than 2 MB. Make it smaller.' };
    const { html, removed } = sanitizeGameHtml(rawHtml.replace(/^\s*<!doctype[^>]*>/i, ''));
    const report = scanVersion(html);
    // Shown on the version card: no links or site names (the model may have read web pages), nothing the filter refuses.
    const n0 = cleanNote(stripLinks(notes), 200);
    const note = (n0 && cleanText(n0, 200).ok && n0) || 'New version';
    const v = games.addVersion(ctx.gameId, html, { notes: note, createdBy: ctx.user.id, safetyStatus: report.status, safetyReport: report });
    // The safety program (not AI) ran, and the version is saved. k (flag/fail): how many things it listed at that level.
    const listed = (report.issues || []).filter(i => i.level === report.status).length;
    steps.start('check', { st: report.status, v: v.number, ...(listed ? { k: listed } : {}) });
    const g = game();
    const event = ['version', { id: v.id, number: v.number, notes: v.notes, status: report.status, issues: plainIssues(report), preview: previewUrl(v, g, ctx.user.id, ctx.locale), created_at: v.created_at }];
    let forModel = `Saved as version ${v.number}. Safety scan: ${report.status}.`;
    if (removed.length) forModel += ` The platform removed: ${[...new Set(removed)].join(', ')}.`;
    if (report.status === 'fail') {
      ctx.state.scanFails = (ctx.state.scanFails || 0) + 1;
      forModel += ` The safety scan FAILED, so this version cannot be shared. Problems: ${modelIssues(report).join(' ')} Fix every problem now with edit_game or write_game.`;
      return { ok: false, forModel, event, version: v, report };
    }
    if (report.status === 'flag') forModel += ` Please also look at: ${modelIssues(report).join(' ')}`;
    const tips = styleTips(report, ctx.requests);
    if (tips.length) forModel += ` The style check (the game still works; fix these so it looks and plays like a first-party Oomba game, but the builder's own choices always win: never undo a colour, character, creature, theme or plain look they asked for): ${tips.join(' ')}`;
    return { ok: true, forModel, event, version: v, report };
  }

  const tools = {
    ask_user(input) {
      // Shown in the chat: links and site names removed, and nothing the text filter refuses (personal details, rude words).
      const question = stripLinks(String((input && input.question) || '')).trim().slice(0, 200);
      const options = (Array.isArray(input && input.options) ? input.options : []).map(o => stripLinks(String(o)).trim().slice(0, 48)).filter(o => o && cleanText(o, 48).ok).slice(0, 8);
      if (!question) return { ok: false, forModel: 'ask_user needs a question.' };
      if (!cleanText(question, 200).ok) return { ok: false, forModel: 'That question was not shown: it had personal details, contact details or words that are not allowed. Never ask for personal details. Ask again in your own simple words.' };
      steps.start('ask');
      return { ok: true, forModel: 'The question is on screen. Stop now and wait for the builder to answer.', event: ['ask', { question, options }], stop: true };
    },
    write_game(input) {
      return saveVersion(input && input.html, input && input.notes);
    },
    edit_game(input) {
      const cur = current();
      if (!cur) return { ok: false, forModel: 'There is no game yet. Use write_game to build the whole game first.' };
      const r = applyEdits(cur.html, input && input.edits);
      if (!r.ok) return { ok: false, forModel: `No changes were made. ${r.error}` };
      if (r.html === cur.html) return { ok: false, forModel: 'Those edits did not change anything.' };
      return saveVersion(r.html, input && input.notes);
    },
    set_game(input) {
      input = input || {}; const fields = {}; const problems = [];
      const text = (k, v, max) => { if (v === undefined || v === null || v === '') return; const c = cleanText(String(v), max); if (c.ok && c.value) fields[k] = c.value; else problems.push(`${k} was not allowed`); };
      text('title', input.title, 60); text('description', input.description, 600);
      if (input.tags !== undefined) text('tags', (Array.isArray(input.tags) ? input.tags : String(input.tags).split(',')).map(t => String(t).trim().toLowerCase()).filter(Boolean).slice(0, 8).join(','), 200);
      if (input.icon) { const ic = String(input.icon).trim(); if (/^\p{Extended_Pictographic}/u.test(ic) && [...ic].length <= 4 && !/[a-z0-9]/i.test(ic)) fields.icon = ic; else problems.push('icon must be one emoji'); }
      if (input.category) { if (CATS.includes(input.category)) fields.category = input.category; else problems.push('unknown category'); }
      if (input.orientation) { if (games.ORIENTATIONS.includes(input.orientation)) fields.orientation = input.orientation; else problems.push('orientation must be any, portrait or landscape'); }
      if (input.players !== undefined) fields.players_max = Math.max(1, Math.min(8, Math.round(+input.players || 1)));
      if (input.cover && games.COVERS.includes(input.cover)) fields.cover = input.cover;
      if (!Object.keys(fields).length) return { ok: false, forModel: `Nothing was changed. ${problems.join('; ')}` };
      const g = games.updateMeta(ctx.gameId, fields);
      steps.start('name', { title: fields.title, icon: fields.icon });
      const out = { title: g.title, icon: g.icon, description: g.description, category: g.category, tags: g.tags, orientation: g.orientation, players_max: g.players_max, cover: g.cover };
      return { ok: true, forModel: `Game details saved.${problems.length ? ' Skipped: ' + problems.join('; ') + '.' : ''}`, event: ['meta', out] };
    },
    // Play the current version at phone size like a real player would, and show the model what happened:
    // a picture of the title screen, a picture two seconds after tapping Play, errors, and layout problems.
    async playtest_game() {
      const cur = current(); const g = game();
      if (!cur) return { ok: false, forModel: 'There is no game yet. Build it with write_game first.' };
      // The AI really asked for a playtest, so it gets a row; without screenshots that row says it couldn't run
      // (ok:false) and never claims a test happened. shown: the failure is on the card (the next round reads it).
      const row = steps.start('playtest', { v: cur.number });
      if (!snapshot.enabled()) { steps.info({ ok: false }, row); return { ok: false, shown: true, forModel: 'Playtesting is not available on this server right now. Re-read the game carefully instead.' }; }
      const orientation = g.orientation === 'landscape' ? 'landscape' : 'portrait';
      let r;
      try {
        r = await snapshot.runGame(cur.html, { size: 'phone', orientation, lang: ctx.locale || 'en', dir: localeInfo(ctx.locale || 'en').dir, title: g.title, scale: 1, quality: 62, titleMs: 1500, playMs: 2500, probe: true });
      } catch (e) {
        steps.info({ ok: false }, row);
        // The screenshot worker is down or busy: say so, rather than blame the game.
        if (e.workerDown) return { ok: false, shown: true, forModel: 'Playtesting is not available on this server right now. Re-read the game carefully instead.' };
        return { ok: false, shown: true, forModel: `The playtest could not run (${String(e.message || e).split('\n')[0]}). The game may freeze or loop forever while loading: check the start-up code.` };
      }
      const a = r.after || {}, b = r.before || {};
      const problems = [];
      if (r.errors.length) problems.push(`Errors while playing: ${r.errors.join(' | ')}`);
      if (b.sideways || a.sideways) {
        const wide = [...new Set([...(b.wide || []), ...(a.wide || [])])];
        problems.push(`Something is wider than the phone screen (${orientation === 'landscape' ? 844 : 390}px), so a phone zooms the whole game out and everything looks tiny.${wide.length ? ` Sticking out: ${wide.join('; ')}.` : ''} Keep every element inside the screen (max-width:100%, sizes from the screen size, overflow:hidden on the page).`);
      }
      const off = [...new Set([...(b.offscreenText || []), ...(a.offscreenText || [])])];
      if (off.length) problems.push(`Text past the screen edge: ${off.map(x => `"${x}"`).join(', ')}.`);
      const small = [...new Set([...(b.smallButtons || []), ...(a.smallButtons || [])])];
      if (small.length) problems.push(`Buttons smaller than 40px (hard for small fingers): ${small.map(x => `"${x}"`).join(', ')}.`);
      if (!a.testHook) problems.push('window.__brbTest is missing (add state() and start(), see the Game Contract).');
      else if (a.state && /"game":false/.test(a.state)) problems.push('This Oomba Kit game never registered its test hooks: call Oomba.test({ state: () => ({...}), start: () => ... }) so the playtest can start a round and read the game state.');
      problems.push(...probeProblems(r, a));
      const tips = styleTips(scanVersion(cur.html), ctx.requests);
      steps.info({ pics: (r.title ? 1 : 0) + (r.play ? 1 : 0), probs: problems.length }, row);
      const size = orientation === 'landscape' ? '844x390 landscape' : '390x700 portrait';
      const text = [
        `Playtest of version ${cur.number} on a phone (${size}), in the builder's language.`,
        `Picture 1: the title screen after 1.5 seconds. Then I ${r.started || 'could not find anything to tap'}. Picture 2: 2.5 seconds later.`,
        a.state ? `__brbTest.state() after starting: ${a.state}` : '',
        problems.length ? `Problems found:\n- ${problems.join('\n- ')}` : 'No errors or layout problems were detected.',
        r.probe && !r.probe.error && r.probe.s1 ? `Then I played on for about 25 s of game time (holding right, jumping, answering each question with the first answer left, pressing the game's own buttons and 1-4 in turn): scenes ${r.probe.scenes.join(' → ')}; score ${r.probe.s0.score} → ${r.probe.s1.score}; picked up ${r.probe.s1.got} of ${r.probe.s1.total}.` : '',
        r.kitWarnings && r.kitWarnings.length ? `Oomba Kit warnings (the game runs, but each is a mistake to fix):\n- ${r.kitWarnings.join('\n- ')}` : '',
        tips.length ? `Style check:\n- ${tips.join('\n- ')}` : '',
        'Now look at both pictures like a picky player and art director: Is it clear what to do? Does it look polished and fun, with a real',
        'background, characters with personality and a tidy HUD? Is anything blank, overlapping, cut off, too small, misaligned or ugly?',
        'Did the game actually start? Fix every real problem with edit_game (then playtest again), or say it looks good and carry on.',
      ].filter(Boolean).join('\n');
      const img = buf => ({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: buf.toString('base64') } });
      const content = [{ type: 'text', text }, img(r.title), ...(r.play ? [img(r.play)] : [])];
      return { ok: true, forModel: content, event: ['playtest', { version: cur.number, problems: problems.length }] };
    },
    // A ready-made game saved as a new version on the server, so the model does not have to write it out.
    async start_from_template(input) {
      const key = String((input && input.template) || '');
      if (!STARTERS.includes(key)) return { ok: false, forModel: `Unknown template. Use one of: ${STARTERS.join(', ')}.` };
      const [{ html, fallback }, info] = await Promise.all([templateHtml(key), templateInfo(key)]);
      if (fallback) return { ok: false, forModel: 'That template is not available right now. Write the game with write_game instead.' };
      if (stopped()) return { ok: false, forModel: 'Stopped.', stop: true };   // stopped while the files were read
      steps.start('template');
      const r = saveVersion(html, (input && input.notes) || `Started from ${info ? info.title : key}`);
      if (r.ok) r.forModel += key === 'island'
        ? ` It is ${info ? info.title : key}. Now make it theirs with edit_game: change the CONFIG block near the top of the module script (and the I18N table for words), following the 3D RULES.`
        : ` It is ${info ? info.title : key}, an Oomba Kit game. Now make it theirs with edit_game: change lines of its CONFIG block (one key per line: title, the hero and cast as character specs, the biome, numbers, item lists), its content lists, and the WORDS table (every language you change), following the KIT RULES.`;
      return r;
    },
    test_notes(input) {
      const list = (Array.isArray(input && input.checklist) ? input.checklist : []).map(s => String(s).trim().slice(0, 140)).filter(Boolean).slice(0, 8);
      if (!list.length) return { ok: false, forModel: 'checklist must list a few things to try.' };
      steps.start('notes');
      return { ok: true, forModel: 'Shown to the builder.', event: ['notes', { checklist: list }] };
    },
  };

  return {
    current,
    game,
    /** Run a tool by name; streams its event; returns the tool result (a promise for playtest_game). */
    exec(name, input) {
      if (stopped()) return { ok: false, forModel: 'Stopped.' };
      const fn = tools[name];
      const r = fn ? fn(input) : { ok: false, forModel: `Unknown tool "${name}".` };
      const done = x => { if (x.event) ctx.emit(x.event[0], x.event[1]); return x; };
      // A tool that awaited (playtest, template) checks again: the build may have ended meanwhile.
      return r && typeof r.then === 'function' ? r.then(x => (stopped() && !x.version ? { ok: false, forModel: 'Stopped.' } : done(x))) : done(r);
    },
  };
}
