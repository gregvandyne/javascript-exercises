// One Builder turn: screening -> turn limit -> provider agent loop (Claude or mock) -> transcript.
// emit(name, data) streams to the Studio (SSE): text, ask, version, meta, notes, refused, progress, error, done.
import * as games from '../services/games.js';
import { audit } from '../db.js';
import { config } from '../config.js';
import { screenInput } from './screen.js';
import { takeTurn, turnsLeft } from './usage.js';
import { loadChat, saveChat } from './chat.js';
import { toolbox } from './tools.js';
import { getUpload, takeForTurn, LIMITS } from './uploads.js';
import * as mock from './mock.js';
import * as claude from './claude.js';

export const MAX_INPUT = 2000;
/** Which provider runs the Builder: Claude when a key is set, the mock otherwise (BRB_BUILDER_PROVIDER=mock forces the mock). */
export function providerName() {
  if (process.env.BRB_BUILDER_PROVIDER === 'mock' || !config.anthropicKey) return 'mock';
  return 'claude';
}
const PROVIDERS = { mock, claude };
const busy = new Set();
export const isBusy = gameId => busy.has(gameId);

/**
 * Run one turn. opts: { user, gameId, text, pro, uploadIds, emit, signal, provider }.
 * Resolves to { ok, refused?, error?, turnsLeft }. Never throws for model errors (they are streamed as 'error').
 */
export async function runTurn({ user, gameId, text = '', pro = false, uploadIds = [], emit = () => {}, signal = null, provider = null }) {
  const game = games.getGame(gameId);
  if (!game) { emit('error', { message: 'Game not found.' }); return { ok: false, error: 'not_found' }; }
  const done = r => { const left = turnsLeft(user.id); emit('done', { turnsLeft: left }); return { ...r, turnsLeft: left }; };
  if (!user.builder_enabled) { emit('error', { message: 'Building is switched off for this account. A grown-up can ask us to turn it back on.' }); return done({ ok: false, error: 'disabled' }); }
  text = String(text || '').replace(/\r\n/g, '\n').trim().slice(0, MAX_INPUT);
  const wanted = (Array.isArray(uploadIds) ? uploadIds : []).slice(0, LIMITS.perMessage).map(getUpload).filter(u => u && u.game_id === gameId && !u.used_at);
  if (!text && !wanted.length) { emit('error', { message: 'Type a message or tap an idea first.' }); return done({ ok: false, error: 'empty' }); }
  if (busy.has(gameId)) { emit('error', { message: 'The Builder is still working on your last message. One moment!' }); return done({ ok: false, error: 'busy' }); }
  busy.add(gameId);
  try {
    const chat = loadChat(gameId);
    // 1. Screening, before any model sees the message.
    if (text) {
      const s = await screenInput(text);
      if (!s.ok) {
        audit(user.id, 'builder.refused', gameId, { category: s.category, by: s.by, text: text.slice(0, 300) });
        emit('refused', { message: s.message, suggestion: s.suggestion, chips: s.chips, category: s.category });
        chat.messages.push({ role: 'user', text, at: Date.now(), refused: true });
        chat.messages.push({ role: 'assistant', text: `${s.message} ${s.suggestion}`, at: Date.now(), refused: true, events: s.chips.length ? [['ask', { question: 'Want to try one of these?', options: s.chips }]] : [] });
        saveChat(gameId, user.id, { messages: chat.messages, state: chat.state });
        return done({ ok: false, refused: s.category });
      }
    }
    // 2. Daily turn limit.
    if (!takeTurn(user.id)) {
      emit('error', { message: `You have used all ${config.builderDailyTurns} Builder turns for today. Come back tomorrow for more!`, code: 'limit' });
      return done({ ok: false, error: 'limit' });
    }
    const uploads = takeForTurn(gameId, wanted.map(u => u.id));
    const history = chat.messages.slice();
    chat.messages.push({ role: 'user', text, at: Date.now(), uploads: uploads.map(u => ({ id: u.id, name: u.name, kind: u.kind, mime: u.mime })) });

    // 3. The agent loop.
    const events = []; let said = '';
    const relay = (name, data) => {
      if (name === 'text') said += data.text;
      if (['ask', 'version', 'meta', 'notes'].includes(name)) events.push([name, name === 'version' ? { ...data, preview: undefined } : data]);
      emit(name, data);
    };
    const state = { ...chat.state, scanFails: 0 };
    const tb = toolbox({ user, gameId, emit: relay, state });
    const name = provider || providerName();
    let usage = { tokensIn: 0, tokensOut: 0, model: name };
    try {
      usage = { ...usage, ...(await PROVIDERS[name].run({ user, game, text, pro: !!pro, history, uploads, state, tools: tb, emit: relay, signal })) };
    } catch (e) {
      if (!(signal && signal.aborted)) emit('error', { message: 'The Builder got muddled. Please try again in a moment.' });
      usage.error = e.message;
    }
    delete state.scanFails;
    chat.messages.push({ role: 'assistant', text: said.trim(), at: Date.now(), events, model: usage.model, pro: !!pro });
    chat.state = state;
    saveChat(gameId, user.id, { ...chat, tokensIn: usage.tokensIn || 0, tokensOut: usage.tokensOut || 0 });
    return done({ ok: !usage.error, error: usage.error });
  } finally {
    busy.delete(gameId);
  }
}
