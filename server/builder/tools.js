// Tool executor shared by every provider (Claude and mock). Each tool returns
//   { ok, forModel: string, event?: [name, data] }
// forModel goes back to the model as the tool result; event is streamed to the Studio over SSE.
// write_game / edit_game always create a NEW version (history is never rewritten) after sanitize + static scan.
import * as games from '../services/games.js';
import { sanitizeGameHtml, MAX_GAME_BYTES } from '../services/sanitize.js';
import { scanVersion } from '../services/scanner.js';
import { cleanText } from '../services/textfilter.js';
import { signToken } from '../auth.js';

const CATS = games.CATEGORY_KEYS;
export const previewUrl = (version, game, userId) => `/frame/${signToken({ v: version.id, g: game.id, u: userId, p: 1 })}`;
const plainIssues = report => (report.issues || []).map(i => `${i.level === 'fail' ? 'Must fix' : 'Check'}: ${i.message}`);

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

/** ctx: { user, gameId, emit(name, data), state } — state.scanFails counts failed scans this turn. */
export function toolbox(ctx) {
  const game = () => games.getGame(ctx.gameId);
  const current = () => { const g = game(); return g && g.current_version_id ? games.getVersion(g.current_version_id) : null; };

  function saveVersion(rawHtml, notes) {
    if (typeof rawHtml !== 'string' || rawHtml.trim().length < 20) return { ok: false, forModel: 'The game was empty. Send the complete game document.' };
    if (Buffer.byteLength(rawHtml) > MAX_GAME_BYTES) return { ok: false, forModel: 'The game is bigger than 2 MB. Make it smaller.' };
    const { html, removed } = sanitizeGameHtml(rawHtml.replace(/^\s*<!doctype[^>]*>/i, ''));
    const report = scanVersion(html);
    const note = String(notes || '').replace(/\s+/g, ' ').trim().slice(0, 200) || 'New version';
    const v = games.addVersion(ctx.gameId, html, { notes: note, createdBy: ctx.user.id, safetyStatus: report.status, safetyReport: report });
    const g = game();
    const event = ['version', { id: v.id, number: v.number, notes: v.notes, status: report.status, issues: plainIssues(report), preview: previewUrl(v, g, ctx.user.id), created_at: v.created_at }];
    let forModel = `Saved as version ${v.number}. Safety scan: ${report.status}.`;
    if (removed.length) forModel += ` The platform removed: ${[...new Set(removed)].join(', ')}.`;
    if (report.status === 'fail') {
      ctx.state.scanFails = (ctx.state.scanFails || 0) + 1;
      forModel += ` The safety scan FAILED, so this version cannot be shared. Problems: ${plainIssues(report).join(' ')} Fix every problem now with edit_game or write_game.`;
      return { ok: false, forModel, event, version: v, report };
    }
    if (report.status === 'flag') forModel += ` Please also look at: ${plainIssues(report).join(' ')}`;
    return { ok: true, forModel, event, version: v, report };
  }

  const tools = {
    ask_user(input) {
      const question = String((input && input.question) || '').trim().slice(0, 200);
      const options = (Array.isArray(input && input.options) ? input.options : []).map(o => String(o).trim().slice(0, 48)).filter(o => o && cleanText(o, 48).ok).slice(0, 8);
      if (!question) return { ok: false, forModel: 'ask_user needs a question.' };
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
      const out = { title: g.title, icon: g.icon, description: g.description, category: g.category, tags: g.tags, orientation: g.orientation, players_max: g.players_max, cover: g.cover };
      return { ok: true, forModel: `Game details saved.${problems.length ? ' Skipped: ' + problems.join('; ') + '.' : ''}`, event: ['meta', out] };
    },
    test_notes(input) {
      const list = (Array.isArray(input && input.checklist) ? input.checklist : []).map(s => String(s).trim().slice(0, 140)).filter(Boolean).slice(0, 8);
      if (!list.length) return { ok: false, forModel: 'checklist must list a few things to try.' };
      return { ok: true, forModel: 'Shown to the builder.', event: ['notes', { checklist: list }] };
    },
  };

  return {
    current,
    game,
    /** Run a tool by name; streams its event; returns the tool result. */
    exec(name, input) {
      const fn = tools[name];
      const r = fn ? fn(input) : { ok: false, forModel: `Unknown tool "${name}".` };
      if (r.event) ctx.emit(r.event[0], r.event[1]);
      return r;
    },
  };
}
