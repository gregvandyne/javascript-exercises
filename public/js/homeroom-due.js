// Due dates on Homeroom handouts (docs/decisions.md "Homeroom: week plans, due dates, copying plans"; server:
// services/homeroom-handouts.js dueOf, dueByOf). The hand-out sheet's "Due" row (dueField, wireDue): chips No due date,
// Today (the end of the day), Tomorrow, Friday and Pick a date (a date and an optional time). A Manipulatives tool has
// none: it is open practice. dueLabel: how a desk card, the teacher's desk sheet and the board say when a handout is due
// ("Due today", "Due Fri", "Due Nov 28, 3:00 PM"). Students never see lateness; the teacher sees "after due" calmly.
import { t, esc } from '/js/app.js';

const tu = (k, v) => t(`js.homeroom-due.${k}`, v);
const pad = n => String(n).padStart(2, '0');
const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays = (d, n) => { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() + n); return x; };
/** The chips' days from today (the teacher's own calendar): Today, Tomorrow, and the coming Friday (this week's from
 *  Monday to Thursday, else next week's). */
export function chipDays(now = new Date()) {
  const dow = now.getDay(), toFri = dow >= 1 && dow <= 4 ? 5 - dow : (12 - dow) % 7 || 7;
  return { today: iso(now), tomorrow: iso(addDays(now, 1)), friday: iso(addDays(now, toFri)) };
}
const LANG = () => document.documentElement.lang || undefined;
/** "3:00 PM" from minutes after midnight. */
export const timeText = min => new Date(Date.UTC(2000, 0, 1, 0, min)).toLocaleTimeString(LANG(), { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' });
/** When it is due, short: "today", "tomorrow", "Fri" within the week, else "Nov 28"; with its time when there is one. due:
 *  the stored day (00:00 UTC), dueMin: minutes after midnight or null. */
export function dueWhen(due, dueMin = null, now = new Date()) {
  if (!due) return '';
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()), days = Math.round((Math.floor(due / 864e5) * 864e5 - today) / 864e5);
  let day;
  try {
    day = days === 0 ? tu('today') : days === 1 ? tu('tomorrow') : days > 1 && days < 7 ? new Date(due).toLocaleDateString(LANG(), { weekday: 'short', timeZone: 'UTC' })
      : new Date(due).toLocaleDateString(LANG(), { month: 'short', day: 'numeric', timeZone: 'UTC' });
  } catch { day = ''; }
  return Number.isInteger(dueMin) ? tu('dayTime', { day, time: timeText(dueMin) }) : day;
}
/** "Due Fri", "Due today, 3:00 PM". */
export const dueLabel = (due, dueMin = null, now = new Date()) => (due ? tu('due', { when: dueWhen(due, dueMin, now) }) : '');

/** The hand-out sheet's Due row. id: a prefix unique on the page. */
export function dueField(id = 'hr') {
  const chips = [['', tu('none')], ['today', tu('chipToday')], ['tomorrow', tu('chipTomorrow')], ['friday', tu('chipFriday')], ['pick', tu('chipPick')]];
  return `<div class="hr-duebox" data-duebox><p class="hr-label" id="${id}-dueh">${esc(tu('label'))}</p>
    <div class="hr-seg hr-duechips" role="radiogroup" aria-labelledby="${id}-dueh">${chips.map(([v, label]) => `<button type="button" class="hr-segb${v ? '' : ' on'}" role="radio" aria-checked="${!v}" data-due="${v}">${esc(label)}</button>`).join('')}</div>
    <div class="hr-duepick" data-duepick hidden><label class="hr-duef"><span class="small">${esc(tu('date'))}</span><input class="input hr-due" type="date" id="${id}-due"></label>
      <label class="hr-duef"><span class="small">${esc(tu('time'))}</span><input class="input hr-duetime" type="time" id="${id}-duetime" step="300"></label></div>
    <p class="small muted hr-seghint" data-duehint aria-live="polite">${esc(tu('noneHint'))}</p></div>`;
}
/** Wire a form's Due row. -> () => { dueAt: 'YYYY-MM-DD' | null, dueTime: 'HH:MM' | null, tz } */
export function wireDue(form) {
  const box = form.querySelector('[data-duebox]'); if (!box) return () => ({ dueAt: null, dueTime: null });
  const pick = box.querySelector('[data-duepick]'), date = box.querySelector('input[type=date]'), time = box.querySelector('input[type=time]'), hint = box.querySelector('[data-duehint]');
  let on = '';
  const say = () => {
    const v = value();
    hint.textContent = !v.dueAt ? tu('noneHint') : v.dueTime ? tu('hintTime', { when: dueWhen(Date.parse(`${v.dueAt}T00:00:00Z`), toMin(v.dueTime)) }) : tu('hintDay', { when: dueWhen(Date.parse(`${v.dueAt}T00:00:00Z`)) });
  };
  box.addEventListener('click', e => {
    const b = e.target.closest('[data-due]'); if (!b) return;
    on = b.dataset.due;
    for (const x of box.querySelectorAll('[data-due]')) { const yes = x === b; x.classList.toggle('on', yes); x.setAttribute('aria-checked', String(yes)); }
    pick.hidden = on !== 'pick';
    if (on === 'pick') { if (!date.value) date.value = chipDays().tomorrow; date.focus(); }
    say();
  });
  date.addEventListener('input', say); time.addEventListener('input', say);
  function value() {
    const d = chipDays();
    const dueAt = on === 'pick' ? date.value || null : on ? d[on] : null;
    const dueTime = on === 'pick' && dueAt && time.value ? time.value : null;
    let tz = ''; try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch { /* none */ }
    return { dueAt, dueTime, tz };
  }
  return value;
}
const toMin = s => { const m = /^(\d{1,2}):(\d{2})/.exec(s || ''); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
/** The teacher's calm word for work not finished past its due time (never shown to students). */
export const afterDue = () => tu('afterDue');
