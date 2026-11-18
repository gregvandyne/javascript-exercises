// The schedule's agendas (docs/decisions.md "Schedule: a standard week, uploaded agendas, a connected calendar"):
// reading an agenda the teacher uploads or pastes, and a calendar (iCalendar, .ics) for one day. No DOM and no
// network here: the browser uses it for uploads, the server for a connected calendar, with the same rules.
// A period is { name, start: 'HH:MM', end: 'HH:MM' }, as the schedule widget stores it.

export const MAX_PERIODS = 16;
/** Days of the week as stored in a schedule's week: 1 Monday ... 7 Sunday (ISO). */
export const DAYS = [1, 2, 3, 4, 5, 6, 7];
const pad = n => String(n).padStart(2, '0');
const hm = min => `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;
const toMin = s => { const [h, m] = String(s).split(':').map(Number); return h * 60 + m; };

/** Periods in order, each ending after it starts, at most MAX_PERIODS; an end left out is the next start (or +45 min). */
export function tidy(list) {
  const rows = list.filter(p => p && Number.isFinite(p.s)).sort((a, b) => a.s - b.s);
  const out = [];
  rows.forEach((p, i) => {
    let e = Number.isFinite(p.e) ? p.e : (rows[i + 1] && rows[i + 1].s > p.s ? rows[i + 1].s : p.s + 45);
    e = Math.min(e, 23 * 60 + 59);
    if (e <= p.s || out.length >= MAX_PERIODS) return;
    out.push({ name: String(p.name || '').replace(/\s+/g, ' ').trim().slice(0, 40), start: hm(p.s), end: hm(e) });
  });
  return out;
}

// ---------------------------------------------------------------- typed or pasted agendas (text, CSV)
const TIME = /(\d{1,2})(?:[:.h](\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?/i;
const RANGE = new RegExp(`${TIME.source}\\s*(?:-|–|—|to|bis|à|a|al|tot|до|〜|~)\\s*${TIME.source}`, 'i');
/** "8:30", "8.30", "1:15 pm", "13h15" -> minutes after midnight; school-day guess for a bare 1–6 o'clock (afternoon). */
function clock(h, m, ap, after = -1) {
  let H = +h; const M = m === undefined ? 0 : +m;
  if (H > 23 || M > 59) return NaN;
  const a = (ap || '').toLowerCase().replace(/\./g, '');
  if (a === 'pm' && H < 12) H += 12; else if (a === 'am' && H === 12) H = 0;
  else if (!a && H >= 1 && H <= 6) H += 12;
  let t = H * 60 + M;
  // "11:30 - 1:00": an end before its start, with no am/pm, is in the afternoon.
  if (!a && after >= 0 && t <= after && H < 12) t += 12 * 60;
  return t;
}
/** Weekday names in English and the given language(s) -> 1..7. */
export function dayNames(locales = []) {
  const names = new Map();
  for (const loc of ['en', ...locales]) {
    for (const style of ['long', 'short']) {
      let f; try { f = new Intl.DateTimeFormat(loc, { weekday: style, timeZone: 'UTC' }); } catch { continue; }
      for (let d = 1; d <= 7; d++) names.set(f.format(Date.UTC(2024, 0, d)).toLowerCase().replace(/\.$/, ''), d); // 1 Jan 2024 was a Monday
    }
  }
  for (const [k, d] of [['tues', 2], ['weds', 3], ['thur', 4], ['thurs', 4]]) names.set(k, d);
  return names;
}
/** One line of a typed agenda -> { s, e, name } or null. Accepts "8:30-9:15 Reading", "8:30 Reading",
 *  "Reading 8:30–9:15", "Reading, 8:30, 9:15" (CSV) and a leading bullet or number. */
export function readLine(line) {
  const raw = String(line || '').replace(/^\s*(?:[-*•·]|\d+[.)])\s+/, '').trim();
  if (!raw) return null;
  const cells = raw.split(/\s*[,;\t]\s*/).filter(Boolean);
  if (cells.length >= 2) {
    // CSV: a name cell and one or two time cells, in any order.
    const times = [], words = [];
    for (const c of cells) { const m = new RegExp(`^${TIME.source}$`, 'i').exec(c.replace(/^"|"$/g, '')); if (m && times.length < 2) times.push(m); else words.push(c.replace(/^"|"$/g, '')); }
    if (times.length) {
      const s = clock(times[0][1], times[0][2], times[0][3]);
      const e = times[1] ? clock(times[1][1], times[1][2], times[1][3] || times[0][3], s) : NaN;
      if (Number.isFinite(s)) return { s, e, name: words.join(' ') };
    }
  }
  const r = RANGE.exec(raw);
  if (r) {
    const s = clock(r[1], r[2], r[3] || (r[6] && +r[4] <= 12 && !/pm/i.test(r[6]) ? r[6] : undefined)), e = clock(r[4], r[5], r[6], s);
    const name = (raw.slice(0, r.index) + ' ' + raw.slice(r.index + r[0].length)).replace(/^[\s:–—-]+|[\s:–—-]+$/g, '');
    if (Number.isFinite(s) && Number.isFinite(e)) return { s, e, name };
  }
  const one = new RegExp(`^${TIME.source}(?=\\s|$|[:–—-])\\s*[:–—-]?\\s*(.*)$`, 'i').exec(raw) || new RegExp(`^(.*?)\\s*[:–—-]?\\s*${TIME.source}$`, 'i').exec(raw);
  if (one) {
    const lead = /^\d/.test(raw);
    const [h, m, ap, name] = lead ? [one[1], one[2], one[3], one[4]] : [one[2], one[3], one[4], one[1]];
    if (lead && m === undefined && !ap) return null; // "3 groups": a number, not a time
    const s = clock(h, m, ap);
    if (Number.isFinite(s)) return { s, e: NaN, name };
  }
  return null;
}
/** A typed or pasted agenda (or a .txt/.csv file) -> { all: periods, days: { 1..7: periods } }. A line that is only a
 *  weekday ("Monday", "Tue:") starts that day's list; lines before any day are for every day. */
export function readText(text, locales = []) {
  const names = dayNames(locales), buckets = { all: [] };
  let cur = 'all';
  for (const line of String(text || '').replace(/^﻿/, '').split(/\r?\n/).slice(0, 400)) {
    const key = line.trim().toLowerCase().replace(/[:.,]+$/, '').replace(/^"|"$/g, '');
    if (names.has(key)) { cur = names.get(key); buckets[cur] = buckets[cur] || []; continue; }
    const p = readLine(line); if (p) buckets[cur].push(p);
  }
  const days = {};
  for (const d of DAYS) if (buckets[d] && buckets[d].length) days[d] = tidy(buckets[d]);
  return { all: tidy(buckets.all), days };
}

// ---------------------------------------------------------------- iCalendar (.ics)
// Enough of RFC 5545 for school calendars from Google, Outlook and Apple: VEVENT with DTSTART/DTEND or DURATION,
// SUMMARY, TZID or UTC or floating times, RRULE (DAILY, WEEKLY with BYDAY, MONTHLY by day of month, YEARLY; INTERVAL,
// COUNT, UNTIL), EXDATE, and moved or cancelled single times (RECURRENCE-ID, STATUS:CANCELLED). All-day events are
// left out: the schedule is the timed day.
const WIN_ZONES = {
  'eastern standard time': 'America/New_York', 'central standard time': 'America/Chicago', 'mountain standard time': 'America/Denver',
  'us mountain standard time': 'America/Phoenix', 'pacific standard time': 'America/Los_Angeles', 'alaskan standard time': 'America/Anchorage',
  'hawaiian standard time': 'Pacific/Honolulu', 'atlantic standard time': 'America/Halifax', 'gmt standard time': 'Europe/London',
  'greenwich standard time': 'Atlantic/Reykjavik', 'w. europe standard time': 'Europe/Berlin', 'romance standard time': 'Europe/Paris',
  'central europe standard time': 'Europe/Budapest', 'central european standard time': 'Europe/Warsaw', 'e. europe standard time': 'Europe/Chisinau',
  'fle standard time': 'Europe/Kiev', 'gtb standard time': 'Europe/Bucharest', 'russian standard time': 'Europe/Moscow', 'israel standard time': 'Asia/Jerusalem',
  'arab standard time': 'Asia/Riyadh', 'arabian standard time': 'Asia/Dubai', 'egypt standard time': 'Africa/Cairo', 'india standard time': 'Asia/Kolkata',
  'china standard time': 'Asia/Shanghai', 'taipei standard time': 'Asia/Taipei', 'tokyo standard time': 'Asia/Tokyo', 'korea standard time': 'Asia/Seoul',
  'singapore standard time': 'Asia/Singapore', 'aus eastern standard time': 'Australia/Sydney', 'e. australia standard time': 'Australia/Brisbane',
  'w. australia standard time': 'Australia/Perth', 'new zealand standard time': 'Pacific/Auckland', 'e. south america standard time': 'America/Sao_Paulo',
  'sa pacific standard time': 'America/Bogota', 'central standard time (mexico)': 'America/Mexico_City', 'south africa standard time': 'Africa/Johannesburg',
  'utc': 'UTC', 'coordinated universal time': 'UTC',
};
const zoneOk = z => { try { new Intl.DateTimeFormat('en', { timeZone: z }); return true; } catch { return false; } };
/** A calendar's TZID -> an IANA zone, or null (then the school's zone is used). */
export function zoneName(tzid) {
  const s = String(tzid || '').replace(/^"|"$/g, '').replace(/^\/[^/]+\/[^/]+\//, '').trim(); // "/mozilla.org/20050126_1/America/New_York"
  if (!s) return null;
  if (zoneOk(s) && /\//.test(s) || s === 'UTC') return s;
  const w = WIN_ZONES[s.toLowerCase()]; return w || null;
}
const fmtCache = new Map();
function parts(t, tz) {
  let f = fmtCache.get(tz);
  if (!f) { f = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' }); fmtCache.set(tz, f); }
  const o = {}; for (const p of f.formatToParts(new Date(t))) o[p.type] = +p.value;
  return { y: o.year, mo: o.month, d: o.day, h: o.hour % 24, mi: o.minute };
}
/** A wall-clock time in a zone -> the instant (ms). */
export function wallToUtc(y, mo, d, h, mi, tz) {
  const want = Date.UTC(y, mo - 1, d, h, mi);
  let t = want;
  for (let i = 0; i < 3; i++) { const p = parts(t, tz); t += want - Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi); }
  return t;
}
/** Unfolded content lines -> [{ name, params, value }]. */
function lines(text) {
  const out = [];
  for (const raw of String(text || '').replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '').split(/\r?\n/)) {
    const m = /^([A-Za-z0-9-]+)((?:;[^:]*)?):(.*)$/.exec(raw); if (!m) continue;
    const params = {};
    for (const p of m[2].split(';').slice(1)) { const i = p.indexOf('='); if (i > 0) params[p.slice(0, i).toUpperCase()] = p.slice(i + 1); }
    out.push({ name: m[1].toUpperCase(), params, value: m[3] });
  }
  return out;
}
const unescape = v => String(v).replace(/\\n/gi, ' ').replace(/\\([,;\\])/g, '$1');
/** A DATE or DATE-TIME value -> { y, mo, d, h, mi, utc, allDay, tz }. */
function when(value, params = {}) {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/.exec(String(value).trim());
  if (!m) return null;
  return { y: +m[1], mo: +m[2], d: +m[3], h: +(m[4] || 0), mi: +(m[5] || 0), utc: !!m[7], allDay: !m[4] || params.VALUE === 'DATE', tz: zoneName(params.TZID) };
}
/** The events of a calendar file: { uid, name, start, durMin, rrule, ex: Set(dayKeys), rid, cancelled, allDay }. */
export function readIcs(text) {
  const events = []; let ev = null;
  for (const l of lines(text)) {
    if (l.name === 'BEGIN' && l.value.toUpperCase() === 'VEVENT') { ev = { ex: [], name: '' }; continue; }
    if (l.name === 'END' && l.value.toUpperCase() === 'VEVENT') { if (ev && ev.start) events.push(ev); ev = null; if (events.length >= 3000) break; continue; }
    if (!ev) continue;
    if (l.name === 'SUMMARY') ev.name = unescape(l.value).trim().slice(0, 40);
    else if (l.name === 'UID') ev.uid = l.value;
    else if (l.name === 'DTSTART') ev.start = when(l.value, l.params);
    else if (l.name === 'DTEND') ev.end = when(l.value, l.params);
    else if (l.name === 'DURATION') ev.dur = duration(l.value);
    else if (l.name === 'RRULE') ev.rrule = rrule(l.value);
    else if (l.name === 'EXDATE') for (const v of l.value.split(',')) { const w = when(v, l.params); if (w) ev.ex.push(w); }
    else if (l.name === 'RECURRENCE-ID') ev.rid = when(l.value, l.params);
    else if (l.name === 'STATUS') ev.cancelled = l.value.trim().toUpperCase() === 'CANCELLED';
  }
  return events;
}
function duration(v) {
  const m = /^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(String(v).trim());
  if (!m) return null;
  return ((+m[2] || 0) * 7 * 1440 + (+m[3] || 0) * 1440 + (+m[4] || 0) * 60 + (+m[5] || 0)) * (m[1] === '-' ? -1 : 1);
}
const BYDAY = { MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6, SU: 7 };
function rrule(v) {
  const o = {};
  for (const kv of String(v).split(';')) { const i = kv.indexOf('='); if (i > 0) o[kv.slice(0, i).toUpperCase()] = kv.slice(i + 1); }
  const by = (o.BYDAY || '').split(',').map(x => BYDAY[x.replace(/^[+-]?\d+/, '').toUpperCase()]).filter(Boolean);
  return { freq: (o.FREQ || '').toUpperCase(), interval: Math.max(1, Math.min(365, +o.INTERVAL || 1)), count: +o.COUNT || 0, until: o.UNTIL ? when(o.UNTIL) : null,
    byday: by, bymonthday: (o.BYMONTHDAY || '').split(',').map(Number).filter(n => n >= 1 && n <= 31) };
}
const dayNum = (y, mo, d) => Math.floor(Date.UTC(y, mo - 1, d) / 864e5);
const isoDow = n => ((n + 3) % 7 + 7) % 7 + 1; // day 0 (1 Jan 1970) was a Thursday
const ymdOf = n => { const t = new Date(n * 864e5); return { y: t.getUTCFullYear(), mo: t.getUTCMonth() + 1, d: t.getUTCDate() }; };
/** Does a repeating event fall on day n (in its own zone)? start: its first day number. */
function repeatsOn(r, start, n, sd) {
  if (n < start) return false;
  const k = n - start, t = ymdOf(n);
  if (r.freq === 'DAILY') return k % r.interval === 0 && (!r.byday.length || r.byday.includes(isoDow(n)));
  if (r.freq === 'WEEKLY') {
    const days = r.byday.length ? r.byday : [isoDow(start)];
    const wk = Math.floor((n - (isoDow(n) - 1) - (start - (isoDow(start) - 1))) / 7);
    return days.includes(isoDow(n)) && wk % r.interval === 0;
  }
  if (r.freq === 'MONTHLY') {
    const months = (t.y - sd.y) * 12 + (t.mo - sd.mo);
    return months % r.interval === 0 && (r.bymonthday.length ? r.bymonthday.includes(t.d) : t.d === sd.d);
  }
  if (r.freq === 'YEARLY') return (t.y - sd.y) % r.interval === 0 && t.mo === sd.mo && t.d === sd.d;
  return false;
}
/** The timed events on one day ('YYYY-MM-DD', in zone tz), as schedule periods (clipped to that day). */
export function icsDay(events, ymd, tz) {
  const [Y, M, D] = ymd.split('-').map(Number), target = dayNum(Y, M, D);
  const dayStart = wallToUtc(Y, M, D, 0, 0, tz), dayEnd = wallToUtc(...Object.values(ymdOf(target + 1)), 0, 0, tz);
  const instant = (w, zone) => (w.utc ? Date.UTC(w.y, w.mo - 1, w.d, w.h, w.mi) : wallToUtc(w.y, w.mo, w.d, w.h, w.mi, w.tz || zone));
  // Single times that were moved or cancelled: the series leaves those out.
  const moved = new Set(events.filter(e => e.rid && e.uid).map(e => `${e.uid}@${instant(e.rid, tz)}`));
  const found = [];
  for (const e of events) {
    if (e.cancelled || !e.start || e.start.allDay) continue;
    const zone = e.start.utc ? 'UTC' : e.start.tz || tz;
    const first = instant(e.start, tz);
    const len = e.end && !e.end.allDay ? (instant(e.end, tz) - first) / 60e3 : Number.isFinite(e.dur) ? e.dur : 0;
    if (!(len > 0) || len > 24 * 60) continue;
    const starts = [];
    if (!e.rrule || e.rid) starts.push(first);
    else {
      // Occurrence days in the event's own zone around the target day (the zones may differ by a day either way).
      const sl = e.start.utc ? parts(first, zone) : e.start, s0 = dayNum(sl.y, sl.mo, sl.d);
      const until = e.rrule.until ? instant({ ...e.rrule.until, h: e.rrule.until.allDay ? 23 : e.rrule.until.h, mi: e.rrule.until.allDay ? 59 : e.rrule.until.mi }, zone) : Infinity;
      const ex = new Set(e.ex.map(x => instant(x, zone)));
      let counted = 0, countFrom = s0;
      for (let n = target - 1; n <= target + 1; n++) {
        if (!repeatsOn(e.rrule, s0, n, sl)) continue;
        const t = ymdOf(n), at = wallToUtc(t.y, t.mo, t.d, sl.h, sl.mi, zone);
        if (at > until || ex.has(at) || moved.has(`${e.uid}@${at}`)) continue;
        if (e.rrule.count) { // the COUNT-th occurrence at most (counted from the first, at most about three years)
          for (; countFrom <= n && countFrom - s0 < 1200; countFrom++) if (repeatsOn(e.rrule, s0, countFrom, sl)) counted++;
          if (countFrom <= n || counted > e.rrule.count) continue;
        }
        starts.push(at);
      }
    }
    for (const at of starts) {
      const a = Math.max(at, dayStart), b = Math.min(at + len * 60e3, dayEnd);
      if (b <= a) continue;
      const pa = parts(a, tz), pb = b >= dayEnd ? { h: 23, mi: 59 } : parts(b, tz);
      found.push({ s: pa.h * 60 + pa.mi, e: pb.h * 60 + pb.mi, name: e.name });
    }
  }
  return tidy(found);
}
/** A calendar file -> the week ahead from `today` ('YYYY-MM-DD'): { days: { 1..7: periods } } (days with events only). */
export function icsWeek(text, today, tz) {
  const events = readIcs(text), [Y, M, D] = today.split('-').map(Number), t0 = dayNum(Y, M, D), days = {};
  for (let i = 0; i < 7; i++) {
    const t = ymdOf(t0 + i), list = icsDay(events, `${t.y}-${pad(t.mo)}-${pad(t.d)}`, tz);
    if (list.length) days[isoDow(t0 + i)] = list;
  }
  return { all: [], days };
}
/** The weekday (1..7) of a 'YYYY-MM-DD'. */
export const weekdayOf = ymd => { const [y, m, d] = ymd.split('-').map(Number); return isoDow(dayNum(y, m, d)); };
/** Which list the schedule shows today: the weekday's own, else every day's. */
export const periodsFor = (s, weekday) => ((s.week && Array.isArray(s.week[weekday]) && s.week[weekday].length) ? s.week[weekday] : (s.periods || []));
export { toMin };
