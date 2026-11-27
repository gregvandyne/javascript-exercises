// Oomba's chat panel, the shared client of services/oomba-chat.js (docs/decisions.md "Figures: Oomba's chat and the shared
// chat engine"). A surface (Figures now; the site companion next) mounts it with its own words and actions; the panel does
// the rest the same way everywhere:
// - Laptops and tablets (900 px and wider): a panel docked on the right below the top bar; the page narrows beside it
//   (body.oc-on). Phones: a sheet above the tab bar with Minimize and Close; minimized it is the round Oomba bubble at the
//   bottom right, with a dot when Oomba answered meanwhile. Escape minimizes. Closing while Oomba answers minimizes.
// - Each message is a job on the server: the page sends it and asks how it is going every 2 s, so a refresh or a closed
//   tab loses nothing. While it runs, Oomba's bubble is the progress card: the surface's steps (done, now, to come, with
//   their times) and an estimate ("Usually about 30 seconds · 0:12 so far").
// - A failed answer is calm (its reason in plain words) with Try again and Edit; the surface may add its own button.
// - A change Oomba made shows the surface's "What changed" card and Undo (the server puts back only what is still as
//   Oomba left it). The card also shows what the app read back after writing when not everything landed (turn.verify:
//   what did not change and why, with Try again), so it is true whatever Oomba said. A quote ("Question 4: ...") sits above the message box until it is sent or removed.
// Teachers only: a surface mounts it only on a teacher's own page.
import { t, api, esc } from '/js/app.js';
import { iconHtml } from '/js/icons.js';
import { toClipboard } from '/js/oomba-text.js';

/** The Oomba mark (public/icons/icon.svg): the yellow square with its two eyes. round: the bubble's circle. */
export const oombaMark = (size = 32, round = false) => `<svg class="oc-mark" width="${size}" height="${size}" viewBox="0 0 240 240" aria-hidden="true" focusable="false"><rect width="240" height="240" rx="${round ? 120 : 56}" fill="#FFD23F"/><g transform="${round ? 'translate(24 24) scale(.8)' : ''}"><g fill="none" stroke="#141414" stroke-width="30"><circle cx="66" cy="120" r="36"/><circle cx="178" cy="120" r="36"/></g><g fill="#141414"><circle cx="73" cy="114" r="13"/><circle cx="185" cy="114" r="13"/></g></g></svg>`;

const POLL_MS = 2000;
const JOB_POLL_MS = 1500;   // while a background job (services/oomba-jobs.js) is waiting or being made
const FAILS = ['timeout', 'busy', 'resting', 'restart', 'error', 'names', 'words', 'personal', 'notFound'];
const SEND_ERRORS = ['names', 'words', 'personal', 'brief', 'chatBusy', 'otherBusy', 'notFound', 'tooMany'];
export const mmss = ms => { const s = Math.max(0, Math.round(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const store = { get: k => { try { return sessionStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { sessionStorage.setItem(k, v); } catch { /* no storage */ } } };
const wide = () => window.matchMedia('(min-width: 900px)').matches;

/**
 * Mount the panel. o: {
 *   id: a storage key for this context ('figures:<sheet>'), url(): the chat's API address (null until there is a context),
 *   ensure(): makes the context before the first message (a new worksheet), -> url
 *   sub: the header's second line, opener: the page's own Oomba button (toggles), placeholder(chat), hello(chat) -> text,
 *   ideas(chat) -> [{ label, text }], change(turn) -> html of "What changed", extra(turn, chat) -> html (buttons with
 *   data-c="act" data-act), onAct(act, turn) -> Promise, onAnswer(turn, chat): a new answer arrived (reload the page's data),
 *   onUndo(result, turnId): an undo came back, onMode(mode): the panel opened or closed, onQuote(null): the quote went (sent or
 *   removed), onSync(chat): a new copy of the conversation (a turn started or ended),
 *   working(chat) -> bool: a background job of the surface is still on its way (the panel keeps asking, every 1.5 s), start: 'open' | 'min' | 'closed',
 *   and for the site companion (public/js/companion.js): headExtra / aboveRow / toolsStart / toolsEnd / foot (html in the
 *   header and the message box), body() -> more fields for each message, meExtra(turn) -> html above a sent message,
 *   format(text, turn) -> Oomba's words as html (escaped by the surface), errText(code) -> a send error's words,
 *   alwaysBubble: the bubble shows whenever the panel is not open, bubbleHost: the element the bubble sits in }
 * -> { open, setMode, quote, refresh, send, state, root }
 */
export function mountChat(o) {
  const C = { o, mode: 'closed', chat: { turns: [], pending: null }, unread: false, timer: null, tick: null, quote: null, sig: '' };
  const root = document.createElement('div');
  root.id = 'oc-root';
  root.innerHTML = `<aside class="oc" id="oc" aria-labelledby="oc-title" hidden>
      <header class="oc-head"><span class="oc-av">${oombaMark(36)}</span><div class="oc-who"><h2 id="oc-title">${esc(t('js.oomba-chat.title'))}</h2><p class="oc-sub">${o.subHtml || esc(o.sub || '')}</p></div>${o.headExtra || ''}
        <button type="button" class="oc-hbtn" data-c="min" aria-label="${esc(t('js.oomba-chat.minimize'))}" title="${esc(t('js.oomba-chat.minimize'))}"><span class="oc-minbar" aria-hidden="true"></span></button>
        <button type="button" class="oc-hbtn" data-c="close" aria-label="${esc(t('js.oomba-chat.close'))}" title="${esc(t('js.oomba-chat.close'))}"><span aria-hidden="true">✕</span></button></header>
      <div class="oc-log" id="oc-log" role="log" aria-live="polite" aria-relevant="additions text"></div>
      <form class="oc-compose" id="oc-form" autocomplete="off">
        <p class="oc-err" id="oc-err" role="alert" hidden></p>
        <div class="oc-quote" id="oc-quote" hidden></div>${o.aboveRow || ''}
        <div class="oc-row">${o.toolsStart || ''}<label class="sr-only" for="oc-in">${esc(t('js.oomba-chat.inputLabel'))}</label>
          <textarea class="oc-in" id="oc-in" rows="1" maxlength="1000" dir="auto"></textarea>${o.toolsEnd || ''}
          <button class="btn btn-primary oc-send" type="submit" id="oc-send">${esc(t('js.oomba-chat.send'))}</button></div>
        ${o.foot || `<p class="oc-private">${iconHtml('🔒', { size: 14 })} ${esc(o.privacy || t('js.oomba-chat.private'))}</p>`}
      </form></aside>
    <button type="button" class="oc-bubble" id="oc-bubble" hidden aria-label="${esc(t('js.oomba-chat.reopen'))}">${oombaMark(56, true)}<span class="oc-dot" hidden></span></button>`;
  document.body.appendChild(root);
  if (o.bubbleHost) o.bubbleHost.appendChild(root.querySelector('#oc-bubble'));
  const $ = id => root.querySelector(`#${id}`) || document.getElementById(id);
  C.el = { panel: $('oc'), log: $('oc-log'), form: $('oc-form'), input: $('oc-in'), send: $('oc-send'), err: $('oc-err'), quote: $('oc-quote'), bubble: $('oc-bubble') };
  if (o.alwaysBubble) C.el.bubble.hidden = false;
  const draftKey = `oc-draft:${o.id}`;
  C.el.input.value = store.get(draftKey) || '';

  // ---------------------------------------------------------------- open, minimized, closed
  function setMode(mode, { focus = true, user = true } = {}) {
    if (user) C.touched = true;
    if (mode === 'closed' && C.chat.pending) mode = 'min';
    const was = C.mode; C.mode = mode;
    store.set(`oc:${o.id}`, mode);
    C.el.panel.hidden = mode !== 'open';
    C.el.bubble.hidden = o.alwaysBubble ? mode === 'open' : mode !== 'min';
    if (mode === 'open') C.unread = false;
    C.el.bubble.querySelector('.oc-dot').hidden = !C.unread;
    C.el.bubble.setAttribute('aria-label', t(C.unread ? 'js.oomba-chat.reopenNew' : 'js.oomba-chat.reopen'));
    document.body.classList.toggle('oc-on', mode === 'open');
    if (o.opener) { o.opener.setAttribute('aria-expanded', String(mode === 'open')); o.opener.classList.toggle('on', mode === 'open'); }
    if (mode === 'open') { render(); autosize(); scrollDown(); if (focus) C.el.input.focus(); }
    else if (focus && was === 'open') (mode === 'min' ? C.el.bubble : o.opener)?.focus();
    if (was !== mode && o.onMode) o.onMode(mode);
  }
  const open = () => setMode('open');
  function autosize() { const i = C.el.input; i.style.height = 'auto'; i.style.height = `${Math.min(140, i.scrollHeight + 4)}px`; }
  function scrollDown() { const l = C.el.log; l.scrollTop = l.scrollHeight; }
  function showErr(msg) { C.el.err.textContent = msg; C.el.err.hidden = !msg; }

  // ---------------------------------------------------------------- the server
  async function load({ initial = false } = {}) {
    const url = (o.getUrl || o.url)(); if (!url) { render(); return; }
    try { took((await api(url, { background: true })).chat, { initial }); } catch { /* the next tick asks again */ }
  }
  function took(chat, { initial = false } = {}) {
    if (!chat) return;
    const before = new Set(C.chat.turns.map(x => x.id));
    const sig = JSON.stringify([(chat.turns || []).map(x => [x.id, x.change && x.change.undone, x.starter, x.note && x.note.pick && x.note.pick.need, x.note && Object.values(x.note).map(v => (v && typeof v === 'object' && !Array.isArray(v) ? [v.state || null, v.v || null, v.savedAs ? v.savedAs.name || v.savedAs.id || 1 : null] : null)), x.note && x.note.jobs && x.note.jobs.map(j => [j.id, j.state, j.retried || false])]), chat.pending && [chat.pending.id, chat.pending.step]]);
    if (chat.pending) C.skew = Date.now() - chat.pending.now;
    if (!initial && sig === C.sig) return;
    C.sig = sig;
    C.chat = { ...chat, turns: chat.turns || [] };
    for (const x of C.chat.turns) {
      if (initial || before.has(x.id) || x.role !== 'oomba') continue;
      if (C.mode !== 'open') C.unread = true;
      if (o.onAnswer) o.onAnswer(x, C.chat);
    }
    // Ask how it is going while an answer is on its way, or (faster) while a surface's background job is (o.working).
    const want = C.chat.pending ? POLL_MS : o.working && o.working(C.chat) ? JOB_POLL_MS : 0;
    if (C.timer && C.timerMs !== want) { clearInterval(C.timer); clearInterval(C.tick); C.timer = null; C.tick = null; }
    if (want && !C.timer) { C.timer = setInterval(() => load(), want); C.timerMs = want; if (C.chat.pending) C.tick = setInterval(tickTime, 1000); }
    if (C.mode === 'min') setMode('min', { focus: false, user: false });
    render();
    if (o.onSync) o.onSync(C.chat);
  }
  async function send(raw, { retry = null } = {}) {
    const text = String(raw || '').trim();
    // Any words send, even one ("Assign it", "Yes"): the owner's live audit saw Send greyed out for a two-word message
    // and a false "Write a few words" warning. An empty box only puts the focus back; a second tap while one is
    // on its way does nothing.
    if (!text) { C.el.input.focus(); return; }
    if (C.sending) return;
    showErr('');
    if (C.chat.pending) { showErr(t('js.oomba-chat.err.chatBusy')); return; }
    C.sending = true;
    try {
      if (o.beforeSend) await o.beforeSend(text);   // the site companion: a page's own first step (a new worksheet is saved first)
      const url = o.url() || (o.ensure ? await o.ensure() : null);
      if (!url) throw new Error(t('js.oomba-chat.err.other'));
      const r = await api(url, { method: 'POST', body: { text, ...(C.quote ? { quote: C.quote.ref } : {}), ...(retry ? { retry } : {}), ...(o.body ? o.body({ retry }) : {}) } });
      if (!retry || C.el.input.value.trim() === text) { C.el.input.value = ''; store.set(draftKey, ''); autosize(); }
      C.quote = null; drawQuote(); if (o.onQuote) o.onQuote(null);
      took(r.chat);
      scrollDown();
    } catch (e) {
      const code = e.data && e.data.code;
      if (retry && !C.el.input.value.trim()) { C.el.input.value = text; autosize(); }
      showErr((o.errText && o.errText(code, e)) || (SEND_ERRORS.includes(code) ? t(`js.oomba-chat.err.${code}`) : e.status === 429 ? t('js.oomba-chat.err.slow') : e.message || t('js.oomba-chat.err.other')));
    } finally { C.sending = false; }
  }
  async function undo(id, btn) {
    if (btn) btn.disabled = true;
    try {
      const r = await api(`${o.url()}/undo`, { method: 'POST', body: { turnId: id } });
      took(r.chat);
      if (o.onUndo) o.onUndo(r, id);
      C.el.log.querySelector(`[data-undone="${CSS.escape(id)}"]`)?.focus();
    } catch (e) { showErr(e.message || t('js.oomba-chat.err.other')); if (btn) btn.disabled = false; }
  }

  // ---------------------------------------------------------------- a quote above the message box
  function drawQuote() {
    const q = C.quote;
    C.el.quote.hidden = !q;
    C.el.quote.innerHTML = q ? `<span>${q.html}</span><button type="button" data-c="unquote" aria-label="${esc(t('js.oomba-chat.unquote'))}" title="${esc(t('js.oomba-chat.unquote'))}">✕</button>` : '';
  }
  function quote(q) { C.quote = q; drawQuote(); setMode('open'); C.el.input.focus(); }

  // ---------------------------------------------------------------- drawing
  const bot = (inner, cls = '') => `<div class="oc-turn bot${cls}"><span class="oc-av sm">${oombaMark(28)}</span><div class="oc-msg bot">${inner}</div></div>`;
  const failText = r => t(`js.oomba-chat.fail.${FAILS.includes(r) ? r : 'error'}`);
  function etaLine() {
    const p = C.chat.pending, e = p.eta || {}, el = Date.now() - (C.skew || 0) - p.at;
    const base = el > (e.p75 || 45e3) ? t('js.oomba-chat.eta.longer') : e.p50 < 60e3 ? t(e.src === 'data' ? 'js.oomba-chat.eta.under' : 'js.oomba-chat.eta.guessUnder', { n: Math.round((e.p50 || 30e3) / 1000) }) : t('js.oomba-chat.eta.about', { n: Math.round(e.p50 / 60e3) });
    return `<b>${esc(base)}</b> <span>· ${esc(t('js.oomba-chat.eta.soFar', { time: mmss(el) }))}</span>`;
  }
  function progress() {
    const p = C.chat.pending, names = p.names || [];
    const rows = names.map((k, i) => {
      const state = i < p.step ? 'done' : i === p.step ? 'cur' : 'todo';
      const mark = state === 'done' ? iconHtml('✓', { size: 16 }) : state === 'cur' ? '<span class="oc-pulse" aria-hidden="true"></span>' : '<span class="oc-todo" aria-hidden="true"></span>';
      const ms = state === 'done' && typeof p.steps[i + 1] === 'number' ? p.steps[i + 1] - (p.steps[i] || 0) : null;
      const label = o.stepText ? o.stepText(k, state) : t(`js.oomba-chat.step.${k}.${state === 'done' ? 'done' : 'now'}`);
      return `<li class="${state}"${state === 'cur' ? ' aria-current="step"' : ''}><span class="m">${mark}</span><span>${esc(label)}</span>${ms !== null ? `<span class="tm">${mmss(ms)}</span>` : ''}</li>`;
    }).join('');
    return bot(`<div class="oc-prog"><p class="oc-eta" data-c-time>${etaLine()}</p><ol class="oc-steps">${rows}</ol><p class="oc-leave">${esc(o.leave || t('js.oomba-chat.leave'))}</p></div>`, ' oc-wait');
  }
  function tickTime() { const el = C.el.log.querySelector('[data-c-time]'); if (el && C.chat.pending) el.innerHTML = etaLine(); }
  function changeCard(x) {
    const ch = x.change;
    // "Change undone." only after an Undo (the server marks it only then), with why when it was not the teacher's tap.
    if (ch.undone) return `<div class="oc-change undone" tabindex="-1" data-undone="${esc(x.id)}"><p><b>${esc(t('js.oomba-chat.undone'))}</b>${ch.why ? ` <span>${esc(ch.why)}</span>` : ''}${ch.kept ? ` <span>${esc(t('js.oomba-chat.undoneKept', { count: ch.kept }))}</span>` : ''}</p></div>`;
    return `<div class="oc-change">${o.change ? o.change(x) : ''}${verifyHtml(x)}${ch.canUndo ? `<div class="oc-ch-row"><button type="button" class="btn btn-sm" data-c="undo" data-id="${esc(x.id)}">${iconHtml('↩', { size: 16 })} ${esc(t('js.oomba-chat.undo'))}</button>${o.changeLinks ? o.changeLinks(x) : ''}</div>` : ''}</div>`;
  }
  // Checked work (services/verify-change.js): what the app read back after writing. Shown in the app's own words, so
  // the card is true whatever Oomba said: what did not land (and why), and Try again.
  const VERIFY_CODES = ['cannotDraw', 'notAsked', 'noSuch', 'dropped', 'full', 'meanwhile', 'same', 'units', 'gone', 'filtered', 'notBuilt'];
  function verifyLines(v) {
    const lines = (v.notLanded || []).map(m => t(`js.oomba-chat.verify.${VERIFY_CODES.includes(m.code) ? m.code : 'other'}${m.n ? '' : 'Any'}`, { n: m.n || 0, units: m.units || '', count: m.count || 0 }));
    for (const n of v.swapped || []) lines.push(t('js.oomba-chat.verify.swapped', { n }));
    return lines;
  }
  function verifyHtml(x) {
    const v = x.verify; if (!v || v.ok) return '';
    const me = meBefore(x);
    return `<div class="oc-verify" role="note"><p><b>${iconHtml('⚠️', { size: 16 })} ${esc(t(v.landed ? 'js.oomba-chat.verify.partial' : 'js.oomba-chat.verify.nothing'))}</b></p><ul class="oc-list">${verifyLines(v).map(l => `<li>${esc(l)}</li>`).join('')}</ul>${me && !C.chat.pending ? `<div class="oc-ch-row"><button type="button" class="btn btn-sm" data-c="again" data-id="${esc(me.id)}">${esc(t('js.oomba-chat.retry'))}</button></div>` : ''}</div>`;
  }
  /** The teacher's message an answer answered (the one just before it). */
  const meBefore = x => { const ts = C.chat.turns, i = ts.indexOf(x); for (let k = i - 1; k >= 0; k--) if (ts[k].role === 'me') return ts[k]; return null; };
  // Copy on Oomba's answers (never on the teacher's own words): a small icon button, then "Copied" for a moment.
  const copyBtn = x => `<div class="oc-copyrow"><button type="button" class="oc-copy" data-c="copy" data-id="${esc(x.id)}" aria-label="${esc(t('js.oomba-chat.copy'))}" title="${esc(t('js.oomba-chat.copy'))}">${iconHtml('📋', { size: 16 })}</button><span class="oc-copied" role="status" aria-live="polite"></span></div>`;
  async function copy(turn, b) {
    const done = await toClipboard(o.copyText(turn));
    const say = b.parentElement && b.parentElement.querySelector('.oc-copied');
    if (!say) return;
    say.textContent = done ? t('js.oomba-chat.copied') : t('js.oomba-chat.copyFailed');
    b.classList.toggle('done', done);
    clearTimeout(b._t); b._t = setTimeout(() => { say.textContent = ''; b.classList.remove('done'); }, 2000);
  }
  function render() {
    if (C.mode !== 'open') return;
    const log = C.el.log, atEnd = log.scrollHeight - log.scrollTop - log.clientHeight < 40;
    const turns = C.chat.turns, parts = [];
    if (!turns.length && !C.chat.pending) {
      parts.push(bot(o.helloHtml ? o.helloHtml(C.chat) : `<span>${esc(o.hello ? o.hello(C.chat) : '')}</span>`));
      const ideas = o.ideas ? o.ideas(C.chat) : [];
      if (ideas.length) parts.push(`<div class="oc-chips" role="group" aria-label="${esc(t('js.oomba-chat.ideas'))}">${ideas.map(x => `<button type="button" class="chip" data-c="chip" data-text="${esc(x.text)}">${esc(x.label)}</button>`).join('')}</div>`);
    }
    const lastBot = [...turns].reverse().find(x => x.role === 'oomba');
    for (const x of turns) {
      if (x.role === 'me') {
        const failed = lastBot && lastBot.failed && lastBot.for === x.id && !C.chat.pending;
        const q = x.quote ? `<span class="oc-q">${esc(o.quoteText ? o.quoteText(x.quote) : x.quote.text)}</span>` : '';
        parts.push(`<div class="oc-turn me">${o.meExtra ? o.meExtra(x) : ''}<div class="oc-msg me" dir="auto">${q}${esc(x.text)}</div>${failed ? `<div class="oc-again"><button type="button" class="btn btn-sm" data-c="retry" data-id="${esc(x.id)}">${esc(t('js.oomba-chat.retry'))}</button><button type="button" class="btn btn-sm btn-ghost" data-c="edit" data-id="${esc(x.id)}">${esc(t('js.oomba-chat.edit'))}</button></div>` : ''}</div>`);
      } else if (x.failed) {
        parts.push(`<div class="oc-turn bot"><span class="oc-av sm">${oombaMark(28)}</span><div class="oc-msg bot calm"><span>${esc(o.failText ? o.failText(x) : failText(x.failed))}</span>${o.extra ? o.extra(x, C.chat) : ''}</div></div>`);
      } else {
        parts.push(bot(`${x.text ? (o.format ? o.format(x.text, x) : `<span dir="auto">${esc(x.text)}</span>`) : ''}${o.note ? o.note(x) : ''}${x.change ? changeCard(x) : x.verify && !x.verify.ok ? `<div class="oc-change">${verifyHtml(x)}</div>` : ''}${o.extra ? o.extra(x, C.chat) : ''}${x.text && o.copyText ? copyBtn(x) : ''}`));
      }
    }
    if (C.chat.pending) parts.push(progress());
    else if (turns.length && o.ideasAfter) {
      const ideas = o.ideasAfter(C.chat);
      if (ideas.length) parts.push(`<div class="oc-chips" role="group" aria-label="${esc(t('js.oomba-chat.ideas'))}">${ideas.map(x => `<button type="button" class="chip" data-c="chip" data-text="${esc(x.text)}">${esc(x.label)}</button>`).join('')}</div>`);
    }
    log.innerHTML = parts.join('');
    C.el.input.placeholder = o.placeholder ? o.placeholder(C.chat) : '';
    if (atEnd || C.chat.pending) scrollDown();
  }

  // ---------------------------------------------------------------- events
  root.addEventListener('click', e => {
    const b = e.target.closest('[data-c]'); if (!b) return;
    const k = b.dataset.c, id = b.dataset.id, turn = C.chat.turns.find(x => x.id === id);
    if (k === 'min') return setMode('min');
    if (k === 'close') return setMode('closed');
    if (k === 'unquote') { C.quote = null; drawQuote(); if (o.onQuote) o.onQuote(null); C.el.input.focus(); return; }
    if (k === 'chip') { C.el.input.value = b.dataset.text; autosize(); C.el.input.focus(); return; }
    if (k === 'undo') return undo(id, b);
    if (k === 'copy' && turn && o.copyText) return copy(turn, b);
    if (k === 'retry' && turn) return send(turn.text, { retry: turn.id });
    if (k === 'again' && turn) return send(turn.text);
    if (k === 'edit' && turn) { C.el.input.value = turn.text; autosize(); C.el.input.focus(); return; }
    if (k === 'act' && o.onAct) { const tt = C.chat.turns.find(x => x.id === b.dataset.turn); b.disabled = true; Promise.resolve(o.onAct(b.dataset.act, tt, b)).then(r => { if (r && r.chat) took(r.chat); }).finally(() => { b.disabled = false; }); }
  });
  C.el.panel.addEventListener('keydown', e => { if (e.key === 'Escape') { e.preventDefault(); setMode('min'); } });
  C.el.bubble.onclick = () => setMode('open');
  C.el.form.onsubmit = e => { e.preventDefault(); send(C.el.input.value); };
  C.el.input.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(C.el.input.value); } });
  C.el.input.addEventListener('input', () => { autosize(); store.set(draftKey, C.el.input.value); });
  if (o.opener) { o.opener.setAttribute('aria-controls', 'oc'); o.opener.setAttribute('aria-expanded', 'false'); o.opener.addEventListener('click', () => setMode(C.mode === 'open' ? 'closed' : 'open')); }

  load({ initial: true }).then(() => {
    const m = store.get(`oc:${o.id}`);
    const st0 = typeof o.start === 'function' ? o.start() : o.start;
    const start = C.chat.pending ? (wide() || st0 === 'open' ? 'open' : 'min') : st0 === 'open' ? 'open' : m || st0 || 'closed';
    // Only when the teacher hasn't opened or closed it meanwhile (a tap while the conversation was loading wins).
    if (start !== 'closed' && !C.touched) setMode(start, { focus: false, user: false });
  });
  return { open, setMode, quote, send, refresh: () => load(), took, state: () => C, render: () => render(), root, showErr };
}
