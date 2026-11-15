// Classroom dashboards: what each widget type draws (server/services/dash.js WIDGETS is the registry: ids, sizes,
// settings). A renderer gets the widget's body element, its settings and ctx { type, intl, role } (type carries the
// translated words from the registry), and returns { tick(date) } if it changes over time (once a second). Stage 2 adds
// a renderer here and a registry entry there: the grid, library, settings form and saving need nothing new.
// Widgets render text with textContent only: never innerHTML with anything a person typed.

const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
/** Text a person typed: its own direction (an English agenda on a Hebrew page reads left to right). */
const typed = (tag, cls, text) => { const e = el(tag, cls, text); e.dir = 'auto'; return e; };
const SVG = 'http://www.w3.org/2000/svg';
const svgEl = (tag, attrs) => { const e = document.createElementNS(SVG, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); return e; };

function clock(body, s, ctx) {
  const timeFmt = new Intl.DateTimeFormat(ctx.intl, { hour: 'numeric', minute: '2-digit', ...(s.seconds ? { second: '2-digit' } : {}), hour12: !!s.hour12 });
  const dateFmt = new Intl.DateTimeFormat(ctx.intl, { weekday: 'long', month: 'long', day: 'numeric' });
  body.classList.add('dw-clock');
  let draw;
  if (s.face === 'analog') {
    const svg = svgEl('svg', { viewBox: '0 0 100 100', class: 'dw-analog', 'aria-hidden': 'true' });
    svg.appendChild(svgEl('circle', { cx: 50, cy: 50, r: 46, class: 'dw-face' }));
    for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6; svg.appendChild(svgEl('line', { x1: 50 + 38 * Math.sin(a), y1: 50 - 38 * Math.cos(a), x2: 50 + 43 * Math.sin(a), y2: 50 - 43 * Math.cos(a), class: 'dw-tick' })); }
    const hand = (cls, len) => { const l = svgEl('line', { x1: 50, y1: 50, x2: 50, y2: 50 - len, class: cls }); svg.appendChild(l); return l; };
    const hh = hand('dw-hh', 24), mh = hand('dw-mh', 36), sh = s.seconds ? hand('dw-sh', 38) : null;
    svg.appendChild(svgEl('circle', { cx: 50, cy: 50, r: 3, class: 'dw-pin' }));
    body.appendChild(svg);
    const label = el('span', 'sr-only');
    body.appendChild(label);
    draw = d => {
      const m = d.getMinutes() + d.getSeconds() / 60, h = (d.getHours() % 12) + m / 60;
      hh.setAttribute('transform', `rotate(${h * 30} 50 50)`); mh.setAttribute('transform', `rotate(${m * 6} 50 50)`);
      if (sh) sh.setAttribute('transform', `rotate(${d.getSeconds() * 6} 50 50)`);
      label.textContent = timeFmt.format(d);
    };
  } else {
    const time = el('div', 'dw-time');
    body.appendChild(time);
    draw = d => { time.textContent = timeFmt.format(d); };
  }
  const date = s.date ? body.appendChild(el('div', 'dw-date')) : null;
  const tick = d => { draw(d); if (date) date.textContent = dateFmt.format(d); };
  tick(new Date());
  return { tick };
}

function text(body, s, ctx) {
  body.classList.add('dw-text');
  if (s.title) body.appendChild(typed('div', 'dw-title', s.title));
  const lines = String(s.body || '').split('\n').map(x => x.trim());
  if (!lines.some(Boolean)) { body.appendChild(el('p', 'dw-empty', ctx.role === 'teacher' ? ctx.type.words.empty : '')); return null; }
  if (s.style === 'list') {
    const ol = el('ol', 'dw-list'); ol.dir = 'auto';
    for (const line of lines.filter(Boolean)) ol.appendChild(typed('li', null, line.replace(/^[-*•]\s*/, '')));
    body.appendChild(ol);
  } else body.appendChild(typed('p', 'dw-para', lines.join('\n')));
  return null;
}

function ican(body, s, ctx) {
  body.classList.add('dw-ican');
  body.appendChild(el('div', 'dw-lead', ctx.type.words.lead));
  if (s.goal) body.appendChild(typed('div', 'dw-goal', s.goal));
  else body.appendChild(el('p', 'dw-empty', ctx.type.words.empty));
  return null;
}

/** id -> renderer. A type the server lists but this file doesn't know yet is left out of the screen. */
export const RENDER = { clock, text, ican };
