// Maths tools combined (docs/decisions.md "Classroom dashboards: maths tools combined"). A maths tool with modes (place
// value: Place value chart | Base-ten blocks; geometry: Pattern blocks | 3D shapes and nets | Transformations...) is a
// thin wrapper: a switch at the top, then the mode's own renderer, unchanged, drawn into the widget's body with the
// mode's words, name (its ⓘ help: "How to use Base-ten blocks"), starting state, question and "Practice it" games.
// The state: the tool's own mode keeps the state's own keys (as before the modes); every other mode's state is under its
// id (the old tool's id), and `tab` says which shows. Switching keeps every mode's work (server/services/dash-tools.js
// cleans each part with its own spec). Nothing here touches the network or storage: the state goes through ctx.keep and
// ctx.send like any tool's.

const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const clone = x => JSON.parse(JSON.stringify(x));
const fill = (s, vars = {}) => String(s || '').replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));

/** The part of a tool's state one mode works on. */
export function modeState(st, own, modes, m) {
  if (m !== own) return st[m] && typeof st[m] === 'object' ? clone(st[m]) : null;
  const out = {};
  for (const [k, v] of Object.entries(st)) if (k !== 'tab' && !modes.includes(k)) out[k] = clone(v);
  return out;
}
/** The tool's whole state with one mode's part put back (the other modes' parts and `tab` untouched). */
export function withMode(st, own, modes, m, part) {
  if (m !== own) return { ...st, [m]: clone(part) };
  const out = clone(part);
  if (st.tab) out.tab = st.tab;
  for (const x of modes) if (x !== own && st[x]) out[x] = clone(st[x]);
  return out;
}

/** A renderer for tool `own` that shows the switch and draws the chosen mode with base[mode]. */
export function moded(own, base) {
  return (body, s, ctx) => {
    const type = ctx.type, modes = (type.modes || []).filter(m => base[m.id]);
    if (modes.length < 2) return base[own](body, s, ctx);
    const ids = modes.map(m => m.id);
    const def = ((type.settings || []).find(f => f.key === 'state') || {}).def || {};
    let st = clone(s.state && typeof s.state === 'object' ? s.state : def);
    const bodyClass = body.className;
    let cur = null;
    const current = () => (ids.includes(st.tab) ? st.tab : own);
    const keepAll = () => { if (!ctx.editing && ctx.keep) ctx.keep(clone(st)); };
    function switcher(m) {
      const g = el('div', 'dt-modes'); g.setAttribute('role', 'group'); g.setAttribute('aria-label', fill((ctx.common || {}).modeFor, { name: type.name }));
      for (const x of modes) {
        const b = el('button', 'btn btn-sm dt-mode'); b.type = 'button'; b.dataset.mode = x.id;
        const i = el('span', 'dt-modeic', x.icon || ''); i.setAttribute('aria-hidden', 'true');
        const t = el('span', 'dt-modetext', x.name); t.dir = 'auto';
        b.append(i, t); b.title = x.name;
        b.setAttribute('aria-pressed', String(x.id === m));
        b.addEventListener('click', () => {
          if (x.id === current()) return;
          if (x.id === own) delete st.tab; else st.tab = x.id;
          keepAll(); draw();
          body.querySelector(`.dt-modes [data-mode="${x.id}"]`)?.focus();
          ctx.say(x.name);
        });
        g.appendChild(b);
      }
      return g;
    }
    function draw() {
      if (cur && cur.destroy) { try { cur.destroy(); } catch { /* gone */ } }
      body.textContent = ''; body.className = bodyClass;
      const m = current(), mode = modes.find(x => x.id === m);
      const sub = m === own ? type : { ...type, name: mode.name, words: mode.words || {}, settings: [{ key: 'state', type: 'tool', hidden: true, def: mode.def || {} }] };
      const named = m === own ? { ...type, name: mode.name } : sub;
      const part = modeState(st, own, ids, m) || clone(mode.def || {});
      const subCtx = {
        ...ctx, type: named,
        keep: ctx.keep ? p => { st = withMode(st, own, ids, m, p); ctx.keep(clone(st)); } : ctx.keep,
        send: ctx.send ? p => ctx.send(clone(withMode(st, own, ids, m, p))) : ctx.send,
        practice: ctx.practiceOf ? ctx.practiceOf(m) : (m === own ? ctx.practice : []),
      };
      cur = base[m](body, { ...s, state: part }, subCtx) || null;
      body.prepend(switcher(m));
    }
    draw();
    return {
      destroy() { if (cur && cur.destroy) cur.destroy(); },
      tick: (...a) => (cur && cur.tick ? cur.tick(...a) : undefined),
      live: (...a) => (cur && cur.live ? cur.live(...a) : undefined),
    };
  };
}
/** The teaching tools' renderers, each wrapped so a tool the registry gives modes gets its switch (the others are drawn
 *  as before). The retired tools' renderers stay in the map: they draw those modes. */
export const withModes = render => ({ ...render, ...Object.fromEntries(Object.keys(render).map(id => [id, moded(id, render)])) });
