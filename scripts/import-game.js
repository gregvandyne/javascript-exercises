// Import a game from an HTML file + metadata JSON. Usage:
//   node scripts/import-game.js seed-games/shark-plank.html [seed-games/shark-plank.json] [--owner MagicCup]
// Re-running updates the game in place: a new version is added only when the HTML changed (builders' version history is kept).
import fs from 'node:fs';
import path from 'node:path';
import { q, now, audit } from '../server/db.js';
import * as games from '../server/services/games.js';
import { getUserByName } from '../server/auth.js';
import { scanVersion } from '../server/services/scanner.js';
import { sanitizeGameHtml } from '../server/services/sanitize.js';

export function importGame(htmlPath, metaPath, ownerId) {
  const raw = fs.readFileSync(htmlPath, 'utf8');
  const meta = JSON.parse(fs.readFileSync(metaPath || htmlPath.replace(/\.html?$/, '.json'), 'utf8'));
  const { html } = sanitizeGameHtml(raw);
  const report = scanVersion(html);
  if (report.status === 'fail') throw new Error(`${meta.title}: safety scan failed: ${report.issues.map(i => i.message).join('; ')}`);
  let g = games.getGameBySlug(meta.slug);
  const fields = { title: meta.title, description: meta.description, icon: meta.icon, cover: meta.cover, category: meta.category, tags: meta.tags, orientation: meta.orientation || 'any', players_max: meta.players_max || 1 };
  if (!g) g = games.createGame(ownerId, { ...fields, slug: meta.slug, source: 'seed' });
  else games.updateMeta(g.id, fields);
  const cur = games.getVersion(g.current_version_id);
  let v = cur;
  if (!cur || cur.html !== html) v = games.addVersion(g.id, html, { notes: meta.notes ? 'Imported. ' + meta.notes.slice(0, 300) : 'Imported', createdBy: ownerId, safetyStatus: report.status, safetyReport: report });
  // Seed games are reviewed by the team: mark approved and publish publicly.
  q.run("UPDATE game_versions SET review_status='approved', review_report=? WHERE id=?", JSON.stringify({ verdict: 'allowed', by: 'seed-import' }), v.id);
  q.run("UPDATE games SET visibility='public', status='published', published_version_id=?, pending_version_id=NULL, featured=?, age_rating=?, published_at=COALESCE(published_at, ?), updated_at=? WHERE id=?",
    v.id, meta.featured ? 1 : 0, meta.age_rating || 'everyone', now(), now(), g.id);
  audit(ownerId, 'game.import', g.id, { version: v.number });
  return games.getGame(g.id);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  const args = process.argv.slice(2);
  const oi = args.indexOf('--owner'); const ownerName = oi >= 0 ? args.splice(oi, 2)[1] : 'MagicCup';
  const owner = getUserByName(ownerName);
  if (!owner) { console.error(`Owner ${ownerName} not found. Run npm run seed first.`); process.exit(1); }
  const g = importGame(args[0], args[1], owner.id);
  console.log(`Imported ${g.title} -> /g/${g.slug}`);
}
