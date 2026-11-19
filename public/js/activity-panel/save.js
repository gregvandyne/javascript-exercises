// Saving the Activity panel (routes/activity-panel.js): only the activity's data goes; the server screens any typed text,
// runs the kit's self-test and the scanner, and saves a new version (or joins the one this person saved less than a
// minute ago). No Builder message and no AI turn. A refusal keeps every change on the page.
import { api, toast } from '/js/app.js';
import { P } from './shared.js';

export const JOIN_MS = 60e3;

/** -> the server's answer ({ ok, joined, version, state }) or null (the reason is shown). */
export async function save(M, gameId) {
  const body = { base: M.base, data: { config: M.data.config, problems: M.data.problems, gen: M.data.gen || null }, changes: M.changes };
  try {
    const r = await api(`/api/studio/${gameId}/activity`, { method: 'POST', body });
    M.lastSave = { id: r.version.id, at: Date.now() };
    toast(r.message);
    return r;
  } catch (e) {
    const d = (e && e.data) || {};
    // the self-test names a problem ("problem 3: ..."): its row is picked so the teacher sees which one
    if (d.code === 'selfTest' && Array.isArray(d.problems) && d.problems.length) {
      const m = /problem (\d+)/.exec(d.problems[0].at || ''); if (m) M.sel = +m[1] - 1;
      M.fail = `${e.message} ${d.problems.map(x => `${x.at}: ${x.why}`).join('; ')}`;
    } else M.fail = e && e.message ? e.message : P('saveFailed');
    if (d.code === 'problem' && d.at) M.sel = d.at - 1;
    M.failCode = d.code || '';
    toast(e && e.message ? e.message : P('saveFailed'), { bad: true });
    return null;
  }
}
/** The Save button's words: "Save as version 5", or "Save to version 4" when it will join this person's last save. */
export function saveLabel(M) {
  const join = M.lastSave && M.lastSave.id === M.base && Date.now() - M.lastSave.at < JOIN_MS;
  return join ? P('saveTo', { n: M.number }) : P('saveAs', { n: M.next });
}
