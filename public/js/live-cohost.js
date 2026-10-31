// Oomba Live part 4: co-hosts on the host's surfaces (docs/live-protocol.md "Part 4 hooks"). Shared by the projector's
// Co-hosts dialog (/js/live-host.js, behind its "the class can't see your screen" gate) and the Teacher view's Co-hosts
// tab (/js/live-dash.js). The host's panel lists who runs the game (from GET /api/live/cohost/:sid), offers a picker of
// the people they may invite (a fixed list from the server: no search, no free text), the link, and Remove / Cancel
// invite / Make host (each asks first). A co-host's panel is read-only (from the socket's ch) with "Stop co-hosting".
// Activity lines (act, nak) are filled here from the translated templates: adults' names from ch, a player's name from
// the page's own roster (as that page may show it).
import { fill } from '/js/live-common.js';
import { api, toast } from '/js/app.js';

/** ch -> Map(ref -> name): the adults listed now and those who were (ch.past), merged into into (names are never
 *  dropped: the activity line still names a removed co-host or a cancelled invite). */
export function namesOf(ch, into = new Map()) {
  for (const r of ((ch && ch.past) || [])) if (r[1]) into.set(r[0], r[1]);
  for (const r of ((ch && ch.list) || [])) if (r[1]) into.set(r[0], r[1]);
  return into;
}

/** A name inside a right-to-left line, isolated (U+2068 ... U+2069): two Latin names never run together, and a name
 *  never takes the line's direction with it. Left-to-right pages keep plain text. */
const iso = x => (x && typeof document !== 'undefined' && document.documentElement.dir === 'rtl' ? `\u2068${x}\u2069` : x);
/** An act's text. ctx: { names: Map(ref -> name), player(seat) -> name, team(k) -> name, TX: the co-host texts }. */
export function actText(m, { names, player = () => '', team = () => '', TX }) {
  const A = (TX && TX.act) || {};
  const key = m.a === 'eyes' ? (m.v ? 'eyesOn' : 'eyesOff') : m.a === 'bonus' && m.k ? 'bonusTeam' : m.a;
  if (!A[key]) return '';
  return fill(A[key], { name: iso(names.get(m.by) || ''), other: iso(names.get(m.o) || ''), player: iso((m.n && player(m.n)) || TX.player || ''), team: iso((m.k && team(m.k)) || ''), s: m.v || 0 });
}
/** A refusal's text (nak): "{name} already did that", the conflict line, "{name} just did that", "Wait a moment", or
 *  "Only the class's teachers can do that". */
export function nakText(m, { names, TX }) {
  const A = (TX && TX.act) || {};
  return A[m.why] ? fill(A[m.why], { name: iso(names.get(m.by) || '') }) : '';
}

/**
 * The panel in root ([data-lv-cohost-panel], data-prefix, data-role 'host' | 'cohost'). -> { setCh(ch), setRecent(lines),
 * refresh() }. onLeft(): after "Stop co-hosting".
 */
export function cohostPanel(root, { sid, TX, onLeft = () => {} }) {
  const prefix = root.dataset.prefix, role = root.dataset.role;
  const $ = id => document.getElementById(`${prefix}-${id}`);
  let ch = null, view = null, timer = null;
  async function refresh() {
    if (role !== 'host') { draw(); return; }
    try { view = await api(`/api/live/cohost/${sid}`); } catch { view = null; }
    draw();
  }
  const tierText = tier => (tier === 'full' ? TX.tierFull : TX.tierLimited);
  function button(label, a, row, confirmText) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'btn btn-sm'; b.textContent = label;
    b.dataset.cohostAct = a; b.dataset.userId = row.id || ''; if (confirmText) b.dataset.confirm = fill(confirmText, { name: row.name });
    b.setAttribute('aria-label', `${label}: ${row.name}`);
    return b;
  }
  function draw() {
    const list = $('list'); if (!list) return;
    list.textContent = '';
    const host = ch && ch.list && ch.list[0];
    const rows = role === 'host' && view ? view.list : ((ch && ch.list) || []).slice(1).map(r => ({ ref: r[0], name: r[1], state: r[2], tier: r[3] }));
    if (host) rows.unshift({ ref: host[0], name: host[1], state: 'host', tier: host[3], isHost: true });
    for (const r of rows) {
      const li = document.createElement('li'); li.className = 'lv-cohost-row'; li.dataset.state = r.state;
      const nm = document.createElement('span'); nm.className = 'lv-cohost-name'; nm.textContent = r.name;
      const st = document.createElement('span'); st.className = 'badge lv-cohost-state'; st.textContent = (TX.state || {})[r.state] || r.state;
      const tr = document.createElement('span'); tr.className = 'small muted lv-cohost-tier'; tr.textContent = tierText(r.tier);
      li.append(nm, st, tr);
      if (role === 'host' && !r.isHost && r.id) {
        const acts = document.createElement('span'); acts.className = 'lv-cohost-acts';
        if (r.state === 'invited') acts.append(button(TX.cancel, 'cancel', r, TX.cancelConfirm));
        else { acts.append(button(TX.makeHost, 'host', r, TX.makeHostConfirm), button(TX.remove, 'remove', r, TX.removeConfirm)); }
        li.append(acts);
      }
      list.append(li);
    }
    const pick = $('pick');
    if (pick && role === 'host') {
      const sel = $('who'), none = $('none');
      const cands = (view && view.candidates) || [];
      const full = view && view.list.length >= view.max;
      sel.textContent = '';
      // the same name twice (two staff rostered alike): numbered, so each option is its own; the picked person's access
      // level shows under the picker (a long name never cuts it off on a phone)
      const seen = new Map(), count = new Map();
      for (const c of cands) count.set(c.name, (count.get(c.name) || 0) + 1);
      const was = sel.value;
      for (const c of cands) {
        const o = document.createElement('option'); o.value = c.id; o.dataset.tier = c.tier;
        const k = (seen.get(c.name) || 0) + 1; seen.set(c.name, k);
        o.textContent = count.get(c.name) > 1 ? `${c.name} (${k})` : c.name;
        sel.append(o);
      }
      if (was && cands.some(c => c.id === was)) sel.value = was;
      showTier();
      sel.closest('.field').hidden = !cands.length || full;
      pick.querySelector('[type=submit]').hidden = !cands.length || full;
      none.hidden = !!cands.length || full;
      const err = $('err'); if (err) err.textContent = full ? fill(TX.full, { max: view.max }) : '';
    }
  }
  function showTier() {
    const el = $('tier'), sel = $('who'); if (!el || !sel) return;
    const o = sel.selectedOptions && sel.selectedOptions[0];
    el.textContent = o ? tierText(o.dataset.tier) : '';
  }
  async function post(body) {
    const err = $('err'); if (err) err.textContent = '';
    try {
      const r = await api(`/api/live/cohost/${sid}`, { method: 'POST', body });
      if (r.redirect) { location.href = r.redirect; return; }
      if (r.list) { view = { ...view, ...r }; draw(); }
      if (r.toast) toast(r.toast);
    } catch (e) { if (err) err.textContent = e.message; else toast(e.message, { bad: true }); }
  }
  root.addEventListener('click', async e => {
    const b = e.target.closest('[data-cohost-act]');
    if (b) { if (b.dataset.confirm && !confirm(b.dataset.confirm)) return; post({ a: b.dataset.cohostAct, userId: b.dataset.userId }); return; }
    if (e.target.id === 'lv-cohost-leave') {
      if (!confirm(TX.leaveConfirm)) return;
      try { const r = await api(`/api/live/cohost/${sid}/leave`, { method: 'POST', body: {} }); onLeft(); location.href = r.redirect || '/live'; } catch (er) { toast(er.message, { bad: true }); }
    }
  });
  const pick = $('pick');
  if (pick) $('who').addEventListener('change', showTier);
  if (pick) pick.addEventListener('submit', e => { e.preventDefault(); const v = $('who').value; if (v) post({ a: 'invite', userId: v }); });
  return {
    refresh,
    // ch changes often (presence): the host's panel refetches at most every 400 ms
    setCh(m) { ch = m; if (role === 'host') { clearTimeout(timer); timer = setTimeout(refresh, 400); } draw(); },
    setRecent(lines) {
      const ol = $('recent'); if (!ol) return;
      ol.textContent = '';
      if (!lines.length) { const li = document.createElement('li'); li.className = 'muted small'; li.textContent = TX.none; ol.append(li); return; }
      for (const x of lines) { const li = document.createElement('li'); li.className = 'small'; li.textContent = x; ol.append(li); }
    },
  };
}
