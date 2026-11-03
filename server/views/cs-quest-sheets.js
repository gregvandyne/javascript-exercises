// CS Quest print view, printables and projector questions (plan section 10.3; docs/cs-quest.md "Teacher pages"). All
// three are rendered without the site's navigation (layout bare: true) inside a .printdoc, black on white when printed,
// kit-free HTML with no images. Lesson text is English data (en() from cs-quest.js); the chrome is cs.* keys.
//
//   /teach/cs-quest/:key?print=1          page 1 the plan (header, I can, vocabulary, materials, the period table, the
//                                         projector script, look-fors, the misconception, differentiation, the quest code);
//                                         page 2 the rest (unplugged twin, the boxed sub plan, notes, discuss prompts,
//                                         login-card reminder); then the exit half-sheets and the teacher-only answer key.
//   /teach/cs-quest/:key?sheet=<name>     one printable: the half-sheet exit ticket, the sub plan, the unplugged twin,
//                                         the rubric, the planning sheet, the etiquette card, and the sheets a lesson's
//                                         unplugged twin names (grid mats, cards, tables, ...). A name without its own
//                                         renderer gets a generic sheet of its kind (cards, a table, a mat, lines).
//   /teach/cs-quest/:key?projector=warmup|exit   the items one per screen, big type, the answer hidden until revealed.
import { html, raw, esc } from './html.js';
import { en, enList, paras, idChips, idChip, periodTable, questCode, itemView, programBadge, BAND_KEY, GAME_EMOJI } from './cs-quest.js';
import * as T from '../services/lesson-templates.js';
import * as CSTA from '../standards/csta.js';

const bar = (t, { back, label }) => html`<div class="printbar row noprint"><a class="btn" href="${back}">← ${label || t('cs.print.back')}</a><button class="btn btn-primary" type="button" data-print>🖨️ ${t('cs.print.print')}</button></div>`;
const head = (t, cat, tpl, sub = '') => html`<header class="csq-print-head"><p class="small">${programBadge(cat)} · ${t('cs.unit.n', { n: tpl.unit })} · ${en('span', tpl.unitTitle)} · ${t(BAND_KEY[tpl.band])} · ${t('lessons.minutesN', { count: tpl.duration })}</p>
  <h1 lang="en" dir="ltr">${tpl.title}${sub ? html` <span class="muted">· ${sub}</span>` : ''}</h1></header>`;

// ---------------------------------------------------------------- the print view (?print=1)
/** d: { cat, tpl, warmupItems, exitItems, back } */
export function printBody(req, d) {
  const t = req.t, { cat, tpl } = d, ex = tpl.explore || {}, play = tpl.play || {};
  const game = play.type === 'game' ? play.game : null;
  const standards = html`<ul class="csq-plain" lang="en" dir="ltr">${tpl.csta.primary.map(id => { const s = CSTA.byId(id); return html`<li><b>${id}</b> ${s ? s.statement : ''} <span class="small muted">(${s ? s.practiceCodes.join(', ') : ''})</span></li>`; })}</ul>
    ${tpl.csta.also.length ? html`<p class="small">${t('cs.plan.also')} ${idChips(tpl.csta.also)}</p>` : ''}${tpl.csta.buildsToward.length ? html`<p class="small">${t('cs.plan.toward')} ${idChips(tpl.csta.buildsToward)}</p>` : ''}`;
  const page1 = html`<section class="csq-page">
    ${head(t, cat, tpl)}
    <div class="csq-sheet-grid">
      <div><h2>🎯 ${t('cs.plan.iCan')}</h2>${enList(tpl.iCan.map(s => `I can ${s}`))}</div>
      <div><h2>📐 ${t('cs.plan.standards')}</h2>${standards}</div>
      <div><h2>🔤 ${t('cs.plan.vocab')}</h2><p lang="en" dir="ltr">${(ex.vocab || []).join(' · ')}</p><h2>🧰 ${t('cs.plan.materials')}</h2>${enList(tpl.materials)}</div>
      <div><h2>✏️ ${t('cs.plan.doNow')}</h2>${en('p', tpl.doNow)}${tpl.questCode ? html`<h2>🔢 ${t('cs.plan.questCode')}</h2>${questCode(tpl.questCode)}` : ''}</div>
    </div>
    <h2>⏱️ ${t('cs.plan.period')}</h2>${periodTable(t, tpl.plan)}
    <h2>🖥️ ${t('cs.plan.explore')}</h2>
    <dl class="csq-script"><dt>${t('cs.plan.say')}</dt><dd>${enList(ex.say)}</dd><dt>${t('cs.plan.do')}</dt><dd>${enList(ex.do)}</dd><dt>${t('cs.plan.ask')}</dt><dd>${enList(ex.ask)}</dd>${ex.afterAsk ? html`<dt>${t('cs.plan.afterAsk')}</dt><dd>${en('p', ex.afterAsk)}</dd>` : ''}<dt>${t('cs.plan.bigIdea')}</dt><dd>${en('p', ex.bigIdea)}</dd></dl>
    <h2>🎮 ${t('cs.plan.play')}</h2>
    ${game ? html`<p lang="en" dir="ltr"><b>${cat.games[game]?.title || game} · ${play.chapterTitle || play.chapter}</b>${play.goal ? ` · Goal: ${play.goal}` : ''}${play.stretch ? ` · Stretch: ${play.stretch}` : ''}</p>` : ''}
    ${play.lookFors ? html`<p><b>${t('cs.plan.lookFors')}</b></p>${enList(play.lookFors)}` : ''}
    ${play.misconception ? html`<p><b>${t('cs.plan.misconception')}</b> ${en('span', play.misconception)}</p>` : ''}
    <div class="csq-sheet-grid"><div><h2>🪜 ${t('cs.plan.support')}</h2>${enList(tpl.differentiation.support)}</div><div><h2>🚀 ${t('cs.plan.stretch')}</h2>${enList(tpl.differentiation.stretch)}</div></div>
    <div class="csq-cut"><h3>⏳ ${t('cs.plan.short40')}</h3>${periodTable(t, tpl.shortPeriod40.table)}${en('p', tpl.shortPeriod40.keep, ' class="small"')}</div>
  </section>`;
  const page2 = html`<section class="csq-page">
    ${head(t, cat, tpl, t('cs.print.page2'))}
    <h2>✂️ ${t('cs.plan.unplugged')} · ${en('span', tpl.unpluggedTwin.title)} · ${t('lessons.minutesN', { count: tpl.unpluggedTwin.minutes })}</h2>
    <p class="small"><b>${t('cs.plan.materials')}</b> <span lang="en" dir="ltr">${tpl.unpluggedTwin.materials.join('; ')}</span></p>
    ${raw(`<ol class="csq-list" lang="en" dir="ltr">${tpl.unpluggedTwin.steps.map(s => `<li>${esc(s)}</li>`).join('')}</ol>`)}
    <div class="csq-box"><h2>🧑‍🏫 ${t('cs.plan.sub')}</h2>${raw(`<ol class="csq-list" lang="en" dir="ltr">${tpl.subPlan.map(s => `<li>${esc(s)}</li>`).join('')}</ol>`)}</div>
    <h2>💬 ${t('cs.plan.discuss')}</h2>${enList(tpl.discuss)}${tpl.showMe ? html`<p class="small"><b>${t('cs.plan.showMe')}</b> ${en('span', tpl.showMe)}</p>` : ''}
    ${tpl.notes?.length ? html`<h2>📝 ${t('cs.plan.notes')}</h2>${enList(tpl.notes)}` : ''}
    <h2>🧱 ${t('cs.plan.block')}</h2>${enList(tpl.block?.add || [])}
    <p class="small muted">🪪 ${t('cs.print.loginCards')}</p>
  </section>`;
  const key = d.exitItems ? html`<section class="csq-page csq-key"><h2>🔑 ${t('cs.print.key')}</h2>
    <ol class="csq-exititems">${d.exitItems.map((it, i) => itemView(it, { n: i + 1 }))}</ol>
    <p><b>${t('cs.plan.sentence')}</b> ${en('span', tpl.exit.sentencePrompt)} · <span class="small muted">${t('cs.plan.frame')}</span> ${en('span', tpl.exit.frame)}</p>
    ${rubricTable(t, tpl.exit.rubric)}
    ${d.warmupItems ? html`<h2>🏁 ${t('cs.plan.warmup')}</h2><ol class="csq-exititems">${d.warmupItems.map((it, i) => itemView(it, { n: i + 1 }))}</ol>` : ''}</section>` : '';
  return html`<div class="printdoc csq-print">${bar(t, { back: d.back })}${page1}${page2}${d.exitItems ? html`<section class="csq-page">${halfSheets(t, tpl, d.exitItems)}</section>` : ''}${key}</div>`;
}

// ---------------------------------------------------------------- printables (?sheet=<name>)
const rubricTable = (t, lines) => (lines && lines.length ? html`<div class="csq-tbl"><table class="tbl csq-rubric-tbl" lang="en" dir="ltr"><thead><tr><th>${t('cs.plan.rubricLine')}</th><th>0</th><th>1</th><th>2</th><th>3</th></tr></thead>
  <tbody>${lines.map(r => html`<tr><td><b>${r.line}</b>${r.ids && r.ids.length ? html`<br>${idChips(r.ids)}` : ''}</td>${(r.levels || ['', '', '', '']).map(l => html`<td>${l}</td>`)}</tr>`)}</tbody></table></div>` : '');
const fill = (t, keys) => html`<p class="csq-fill">${keys.map(k => html`<span>${t(`cs.sheets.fields.${k}`)}</span>`)}</p>`;
/** Two exit tickets per page: the three items with empty boxes, the sentence frame, name and date lines. */
function halfSheets(t, tpl, items) {
  const one = html`<div class="csq-half" lang="en" dir="ltr"><p class="small"><b>${tpl.title}</b> · ${t('cs.sheets.exitHalfTitle')}</p>${fill(t, ['name', 'date'])}
    <ol class="csq-exititems">${items.map(it => html`<li><p class="csq-q-print">${it.q}</p><ul class="csq-choices-sm">${it.choices.map((c, i) => html`<li>☐ ${'ABCD'[i]}. ${c}</li>`)}</ul></li>`)}</ol>
    <p>${tpl.exit.sentencePrompt}</p><p class="csq-q-print">${tpl.exit.frame}</p><div class="csq-lines"></div></div>`;
  return html`${one}${one}`;
}
const lines = n => html`<div class="csq-lines" style="min-height:${n * 28}px"></div>`;
const boxes = (t, titles, { tall = false } = {}) => html`<div class="csq-sheet-grid">${titles.map(x => html`<div class="csq-sheet-box ${tall ? 'tall' : ''}"><h3 lang="en" dir="ltr">${x}</h3></div>`)}</div>`;
const cards = (titles, { big = false } = {}) => html`<div class="csq-card-grid ${big ? 'is-big' : ''}">${titles.map(x => raw(`<div class="csq-cut-card" lang="en" dir="ltr">${esc(x)}</div>`))}</div>`;
const grid = (n = 6) => raw(`<table class="csq-mat" aria-hidden="true"><tbody>${Array.from({ length: n }, () => `<tr>${Array.from({ length: n }, () => '<td></td>').join('')}</tr>`).join('')}</tbody></table>`);
const table = (t, cols, rows = 5) => html`<div class="csq-tbl"><table class="tbl csq-rubric-tbl" lang="en" dir="ltr"><thead><tr>${cols.map(c => html`<th>${c}</th>`)}</tr></thead><tbody>${Array.from({ length: rows }, () => html`<tr>${cols.map(() => html`<td>&nbsp;</td>`)}</tr>`)}</tbody></table></div>`;
const ETIQUETTE = ['One change per message.', 'Say what you saw and what you expected.', 'Ten messages for the whole project, per team.', 'Play your game after every change.', 'Never put your full name, your school or anyone else\'s name in a message or in the game.', 'If the Builder is resting, switch to the paper prototype.', 'Demos show the game, not the chat.'];
const PLAN_1B = ['Working title (no names in it)', 'Who is it for?', 'The one-sentence game: You are a ___ who must ___ before ___.', 'Parts (3 or 4 boxes): start screen, playing, winning, losing', 'The main rule: if ___ then ___', 'One thing the player can see change: score, lives or time', 'What the player sees first (one sentence)', 'Roles: designer/typist · tester/note-taker (swap on build day)', 'Reused and credited: I reused ___', 'Accessibility check: big buttons · read-aloud on · shapes next to colors', 'The message to the Builder (at most 300 characters)', 'Three things to test, and what should happen'];
const PLAN_2 = ['Working title (no names in it)', 'User card: age, device, one need (text size, captions, one hand)', 'Pitch + genre + the win/lose rule', 'Feature tree: 3 features, 2 sub-parts each (mark must / nice)', 'The main rule as a 6-box flowchart (in words)', 'Variables table: name, type, starts at, changes when', 'Storyboard: 3 panels + the How to play text', 'Roles + timeline: period 2 build core, 3 test and fix, 4 credits and demo', 'Credits: template, ideas, kit art, the exact credit line', 'Accessibility check (5): text size, contrast, captions, one hand, no flashing', 'The message to the Builder (at most 300 characters)', 'Test plan: 5 rows (input, expected, actual, pass?)'];
const ROLE_CARDS = { '1B': ['Designer / typist: says the plan out loud, types the message', 'Tester / note-taker: plays after every change, writes what happened', 'Captain: signs in every unit-7 period; the login card stays in the team folder'], '2': ['Designer / typist', 'Tester / note-taker', 'Recorder: keeps the timeline and the test table', 'Captain: signs in every unit-7 period; the login card stays in the team folder'] };
const humanize = s => s.replace(/-/g, ' ').replace(/^\w/, c => c.toUpperCase());

/** One printable by name for a lesson; null when the name is unknown and no generic kind fits. */
export function sheetBody(req, d) {
  const t = req.t, { cat, tpl, sheet } = d, play = tpl.play || {};
  const twin = tpl.unpluggedTwin, band = tpl.band;
  const title = t.has(`cs.sheets.${sheet}`) ? t(`cs.sheets.${sheet}`) : humanize(sheet);
  let body;
  switch (sheet) {
    case 'exit-half': body = d.exitItems ? halfSheets(t, tpl, d.exitItems) : html`<p class="notice warn">${t('cs.plan.bankMissing')}</p>`; break;
    case 'sub-plan': body = html`<div class="csq-box"><h2>🧑‍🏫 ${t('cs.plan.sub')}</h2>${raw(`<ol class="csq-list" lang="en" dir="ltr">${tpl.subPlan.map(s => `<li>${esc(s)}</li>`).join('')}</ol>`)}
      ${tpl.questCode ? html`<p>${t('cs.plan.questCode')}: ${questCode(tpl.questCode)}</p>` : ''}<p class="small muted">${t('cs.print.loginCards')}</p></div>
      <h2>✏️ ${t('cs.plan.doNow')}</h2>${en('p', tpl.doNow)}<h2>💬 ${t('cs.plan.discuss')}</h2>${enList(tpl.discuss)}`; break;
    case 'unplugged': body = html`<h2>${en('span', twin.title)} · ${t('lessons.minutesN', { count: twin.minutes })}</h2>
      <p><b>${t('cs.plan.materials')}</b></p>${enList(twin.materials)}<p><b>${t('cs.sheets.steps')}</b></p>${raw(`<ol class="csq-list" lang="en" dir="ltr">${twin.steps.map(s => `<li>${esc(s)}</li>`).join('')}</ol>`)}
      <p class="small">${t('cs.sheets.alsoPrint')} <span lang="en" dir="ltr">${twin.printables.map(humanize).join(', ')}</span></p>`; break;
    case 'rubric': body = html`<p class="small">${t('cs.plan.rubricHow')}</p>${rubricTable(t, [...tpl.exit.rubric, ...tpl.steps.flatMap(s => (Array.isArray(s.rubric) ? s.rubric : []))])}
      ${fill(t, ['name', 'date', 'team'])}`; break;
    case 'planning-sheet': case 'planning-sheet-pro': body = html`${fill(t, ['team', 'date'])}${boxes(t, Array.isArray(play.sheet) ? play.sheet : sheet === 'planning-sheet-pro' || band === '2' ? PLAN_2 : PLAN_1B, { tall: true })}`; break;
    case 'etiquette-card': body = html`<div class="csq-card"><h2 lang="en" dir="ltr">Builder etiquette</h2>${raw(`<ol lang="en" dir="ltr">${(Array.isArray(play.etiquette) ? play.etiquette : ETIQUETTE).map(s => `<li>${esc(s)}</li>`).join('')}</ol>`)}</div>
      <div class="csq-card"><h2 lang="en" dir="ltr">Builder etiquette</h2>${raw(`<ol lang="en" dir="ltr">${(Array.isArray(play.etiquette) ? play.etiquette : ETIQUETTE).map(s => `<li>${esc(s)}</li>`).join('')}</ol>`)}</div>`; break;
    case 'test-table': body = html`${fill(t, ['team', 'date'])}${table(t, ['#', 'Input (what the tester does)', 'Expected', 'Actual', 'Pass?'], 5)}`; break;
    case 'variables-table': body = html`${fill(t, ['name', 'date'])}${table(t, ['Variable name', 'Type', 'Starts at', 'Changes when'], 6)}`; break;
    case 'playtest-tally': case 'tally-grid': body = html`${fill(t, ['team', 'date'])}${table(t, band === '2' ? ['Row', '1', '2', '3', '4', '5', 'Notes'] : ['Face', 'Fun', 'Clear', 'Fair', 'Would play again', 'Word tile'], 6)}<p class="small" lang="en" dir="ltr">The one change the cards support: </p>${lines(3)}`; break;
    case 'two-stars-and-a-wish': case 'tester-card': body = html`${cards(Array.from({ length: 4 }, () => `★ Star: \n★ Star: \n✦ Wish: \nFun 😀😐🙁 · Clear 😀😐🙁 · Fair 😀😐🙁 · Again 😀😐🙁`), { big: true })}`; break;
    case 'storyboard': body = html`${fill(t, ['team', 'date'])}${boxes(t, ['1. What the player sees first', '2. Playing', '3. Winning or losing'], { tall: true })}<p lang="en" dir="ltr"><b>How to play (three lines):</b></p>${lines(3)}`; break;
    case 'credits-template': case 'credits-template-pro': body = html`${fill(t, ['team', 'date'])}${boxes(t, Array.isArray(play.creditsTemplate) ? play.creditsTemplate : ['Made by (first names or avatars)', 'Idea from', 'Art and sounds, each with its license', 'Thanks to our testers', 'How to play (three lines)', 'How it works (the rule and the variables)'])}`; break;
    case 'demo-card': body = cards(Array.from({ length: 4 }, () => 'Listen for: 1. who it is for · 2. one choice and the user need behind it · 3. how to play · 4. how it works (one line). One question for the team.'), { big: true }); break;
    case 'role-cards': body = cards(ROLE_CARDS[band].concat(ROLE_CARDS[band]), { big: true }); break;
    case 'playtest-protocol': body = html`<div class="csq-card"><h2 lang="en" dir="ltr">Playtest protocol</h2>${enList(Array.isArray(play.rotations) ? play.rotations : [])}${play.roles ? en('p', play.roles) : ''}${play.rules ? en('p', play.rules) : ''}</div>`; break;
    case 'grid-mat': body = html`<p class="small" lang="en" dir="ltr">Start ⭐ · Goal 🏁 · Wall ■</p>${grid(6)}`; break;
    case 'arrow-cards': body = cards(['↑ forward', '↑ forward', '↑ forward', '↑ forward', '↑ forward', '↑ forward', '↰ turn left', '↱ turn right', '↰ turn left', '↱ turn right', '● pick up', '● pick up']); break;
    case 'loop-cards': body = cards(['repeat [ ] times {', '}', 'repeat [ ] times {', '}', 'repeat [ ] times {', '}']); break;
    case 'nested-card': body = cards(['repeat [ ] times {  repeat [ ] times { ... }  }', 'repeat [ ] times {  repeat [ ] times { ... }  }']); break;
    case 'if-cards': case 'if-hat': body = cards(['if ______ then ______', 'if ______ then ______', 'if ______ then ______', 'if ______ then ______', 'else ______', 'else ______']); break;
    case 'when-cards': body = cards(['when ______ happens: ______', 'when ______ happens: ______', 'when ______ happens: ______', 'when ______ happens: ______']); break;
    case 'joiner-cards': body = cards(['and', 'or', 'not', 'and', 'or', 'not']); break;
    case 'jar-labels': case 'variable-cards': body = cards(['score = ___', 'lives = ___', 'time = ___', 'count = ___', 'name: ______ value: ______', 'name: ______ value: ______']); break;
    case 'paper-remote': body = html`<p class="small" lang="en" dir="ltr">A paper remote: six big buttons. Label each one.</p>${boxes(t, ['', '', '', '', '', ''], { tall: true })}`; break;
    case 'accessibility-audit': body = html`${fill(t, ['name', 'date'])}${table(t, ['Setting', 'Could I still play? (yes / kind of / no)', 'Who does it help?', 'Who else?'], 5)}<p lang="en" dir="ltr"><b>Two improvements, each with the user it comes from:</b></p>${lines(3)}`; break;
    case 'wyr-tech-sheet': case 'wyr-online-sheet': {
      const topic = sheet === 'wyr-tech-sheet' ? 'tech' : 'online';
      const items = (cat.wyr && Array.isArray(cat.wyr.items) ? cat.wyr.items : []).filter(x => String(x.id || '').startsWith(topic));
      body = items.length ? html`<ol class="csq-list" lang="en" dir="ltr">${items.map(x => html`<li><b>A</b> ${x.a?.text || x.a} · <b>B</b> ${x.b?.text || x.b}${x.prompt ? html`<br><span class="small">${x.prompt}</span>` : ''}</li>`)}</ol>` : html`<p class="small muted">${t('cs.sheets.wyrMissing')}</p>${table(t, ['#', 'A', 'B', 'Who chose A and why? What could go wrong with A? With B?'], 10)}`;
      break;
    }
    default: {
      if (!/^[a-z0-9-]{2,40}$/.test(sheet)) return null;
      if (/(-cards|-stickers|-badges|-labels|-tags?|-chips|-chip-cards)$/.test(sheet)) body = cards(Array.from({ length: 8 }, () => `${humanize(sheet)}: ______`));
      else if (/(-table|-tally|-grid|-lines)$/.test(sheet)) body = html`${fill(t, ['name', 'date'])}${table(t, ['', '', '', ''], 8)}`;
      else if (/-mat$/.test(sheet)) body = grid(6);
      else if (/(-sheet|-timeline-card|-card|-note|-template|-protocol|-remote)$/.test(sheet) || true) body = html`${fill(t, ['name', 'date'])}${boxes(t, [humanize(sheet), '', '', ''], { tall: true })}`;
    }
  }
  return html`<div class="printdoc csq-print">${bar(t, { back: d.back })}
    <header class="csq-print-head"><p class="small">${programBadge(cat)} · <span lang="en" dir="ltr">${tpl.title}</span> · ${t(BAND_KEY[band])}</p><h1>${title}</h1></header>
    ${body}</div>`;
}

// ---------------------------------------------------------------- the projector questions (?projector=warmup|exit)
/** d: { cat, tpl, which: 'warmup' | 'exit', items, back } */
export function projectorBody(req, d) {
  const t = req.t, { tpl, items } = d;
  const slide = (it, i) => html`<section class="csq-slide ${i === 0 ? 'is-current' : ''}" data-right="${it.answer}" aria-label="${t('cs.projector.of', { n: i + 1, count: items.length })}">
    <p class="csq-n" dir="ltr">${t('cs.projector.of', { n: i + 1, count: items.length })}</p>
    <p class="csq-q" lang="en" dir="ltr">${it.q}</p>
    <ul class="csq-choices" lang="en" dir="ltr">${it.choices.map((c, k) => html`<li data-i="${k}"><span class="csq-letter">${'ABCD'[k]}</span>${c}</li>`)}</ul>
    <details class="csq-reveal" data-reveal><summary>👁️ ${t('cs.projector.reveal')}</summary><p class="csq-answer" lang="en" dir="ltr">✓ ${'ABCD'[it.answer]}. ${it.choices[it.answer]}</p></details>
  </section>`;
  return html`<div class="csq-proj" data-projector>
    <div class="csq-proj-top noprint"><h1><span lang="en" dir="ltr">${tpl.title}</span> · ${t(d.which === 'exit' ? 'cs.projector.exit' : 'cs.projector.warmup')}</h1>
      <div class="row"><a class="btn btn-sm" href="${d.back}">← ${t('cs.print.back')}</a><span class="small muted">${t('cs.projector.keys')}</span></div></div>
    ${items.map(slide)}
    <nav class="csq-proj-nav noprint" aria-label="${t('cs.projector.nav')}"><button class="btn btn-big" type="button" data-prev>← ${t('cs.projector.prev')}</button><span class="csq-proj-count" data-count></span><button class="btn btn-big btn-primary" type="button" data-next>${t('cs.projector.next')} →</button></nav>
  </div>`;
}
