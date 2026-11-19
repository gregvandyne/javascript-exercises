// The Studio's Activity panel saves here (docs/canvas-api.md "The Activity panel"): POST /api/studio/:id/activity with
// { base, data: { config, problems, gen }, changes: [{ k, n?, up? }] }. No AI turn and no Builder message: the server
// rewrites only the version's oc-activity block (builder/activity-data.js), screens any text the teacher typed exactly
// as a Builder message is screened, runs the kit's self-test and the scanner, and saves a new version labelled with what
// changed. Saves by the same person within a minute join into that one version (while it is the current version and not
// live or waiting for a check). The game's owner (or an admin) only.
//   409 busy      a Builder turn is running for this game
//   409 changed   the current version is not the one the panel loaded (base)
//   400 notActivity / data / problems / problem (at) / gen / config / big / html / personal / screen (the kind reply)
//   422 selfTest (problems: [{ at, why }]) / scan (issues)
import { Router } from 'express';
import * as games from '../services/games.js';
import { requireBuilder } from '../auth.js';
import { rateLimit } from '../services/ratelimit.js';
import { audit } from '../db.js';
import { isBusy } from '../builder/runner.js';
import { hooks } from '../builder/agent.js';
import { scrub, studentNames } from '../builder/lesson.js';
import { selfTestHtml } from '../services/canvaskit.js';
import { scanVersion } from '../services/scanner.js';
import { sanitizeGameHtml } from '../services/sanitize.js';
import { panelOf, cleanPanel, newTexts, hasMarkup, applyPanel, cleanChanges, noteFor } from '../builder/activity-data.js';
import { studioState } from './studio.js';

export const router = Router();
export const COALESCE_MS = 60e3;
/** game id -> the last panel save { versionId, userId, at, changes }: the next save within a minute joins it. */
const lastSave = new Map();
export const _panelSaves = lastSave;   // tests age a save past the minute

router.post('/api/studio/:id/activity', requireBuilder, rateLimit('studio-activity', 30, 60e3), async (req, res) => {
  const t = req.t, b = req.body || {};
  const fail = (status, code, extra = {}) => res.status(status).json({ error: t(`studio.activity.errors.${code}`, { n: extra.at || 1 }), code, ...extra });
  const g = games.getGame(req.params.id);
  if (!g || !games.canEdit(req.user, g)) return res.status(404).json({ error: t('game.api.notFound') });
  if (isBusy(g.id)) return fail(409, 'busy');
  const cur = g.current_version_id ? games.getVersion(g.current_version_id) : null;
  const was = cur && panelOf(cur.html);
  if (!was) return fail(400, 'notActivity');
  if (String(b.base || '') !== cur.id) return fail(409, 'changed');

  const c = cleanPanel(was.data, b.data);
  if (c.code) return fail(400, c.code, c.at ? { at: c.at } : {});
  // What the teacher typed (question wording, worked steps, units...): text only, no student's name or contact details,
  // then the Builder's own screening, as a typed Builder message is (builder/screen.js through agent.js hooks).
  const typed = newTexts(was.data, c.data);
  if (typed.length) {
    if (hasMarkup(typed)) return fail(400, 'html');
    const names = studentNames(req.user), joined = typed.join('\n');
    const r = scrub(joined, names);
    if (Object.values(r.removed).some(Boolean)) return fail(400, 'personal');
    const s = await hooks.screen(joined, { t });
    if (!s.ok) {
      audit(req.user.id, 'builder.refused', g.id, { category: s.category, by: s.by, panel: true, text: joined.slice(0, 300) });
      return res.status(400).json({ error: `${s.message} ${s.suggestion}`.trim(), code: 'screen', category: s.category });
    }
  }
  // The new page: the data block only (and the kit tag moved to the newest, 1.3.1), then the same checks as every Builder version.
  const { html } = sanitizeGameHtml(applyPanel(cur.html, c.data));
  const st = selfTestHtml(html);
  if (!st || !st.ok) return res.status(422).json({ error: t('studio.activity.errors.selfTest'), code: 'selfTest', problems: st ? st.problems : [] });
  const report = scanVersion(html);
  if (report.status === 'fail') return res.status(422).json({ error: t('studio.activity.errors.scan'), code: 'scan', issues: (report.issues || []).filter(i => i.level === 'fail').map(i => i.message) });

  // Within a minute of this person's last panel save, and that version is still the one being edited (not live, not
  // waiting for a check): the same version, its label listing every change. Otherwise a new version.
  const last = lastSave.get(g.id), now = Date.now();
  const join = !!last && last.versionId === cur.id && last.userId === req.user.id && now - last.at < COALESCE_MS && cur.id !== g.published_version_id && cur.id !== g.pending_version_id;
  const changes = cleanChanges([...(join ? last.changes : []), ...cleanChanges(b.changes)]);
  const notes = noteFor(changes, t);
  const v = join
    ? games.replaceVersion(cur.id, html, { notes, safetyStatus: report.status, safetyReport: report })
    : games.addVersion(g.id, html, { notes, createdBy: req.user.id, safetyStatus: report.status, safetyReport: report });
  lastSave.set(g.id, { versionId: v.id, userId: req.user.id, at: now, changes });
  audit(req.user.id, 'studio.activity_panel', g.id, { version: v.number, joined: join, changes: changes.length, screened: typed.length });
  res.json({ ok: true, joined: join, version: { id: v.id, number: v.number, notes: v.notes }, message: t(join ? 'studio.activity.savedJoined' : 'studio.activity.saved', { number: v.number }), state: studioState(req.user, g.id, t, req) });
});
