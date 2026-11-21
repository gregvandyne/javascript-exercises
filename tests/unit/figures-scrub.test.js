// The privacy scrub for the ported figure code (docs/third-party.md names the project in its "ported" section; that
// record and figures/src/ported/LICENSE.txt are the only places allowed to). Every file of the Figures surface (the
// library's source, its version folders and lock, the product's pages, scripts and words, the Builder's figure rules,
// the figure API docs, the attribution docs and the figure tests; docs/decisions.md also holds older, unrelated records) is free of the source project's names, domains, package name, import alias, hosting and
// analytics names. The patterns are kept encoded here so this file does not name them either.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PATTERNS = JSON.parse(Buffer.from('WyJ0ZWFjaGVyLmRldiIsInRlYWNoZXJkb3RkZXYiLCJUZWFjaGVyRG90RGV2Iiwic3RlbWZpZ3VyZXMiLCJtYXRoZmlndXJlcyIsInBoeXNpY3NmaWd1cmVzIiwiY2hlbWlzdHJ5ZmlndXJlcyIsImJpb2xvZ3lmaWd1cmVzIiwiZW5naW5lZXJpbmdmaWd1cmVzIiwiZWNvbmZpZ3VyZXMiLCJlY29ub21pY3NmaWd1cmVzIiwic3RlbWZpZ3VyZXMuY29tIiwibWF0aGZpZ3VyZXMuY29tIiwicGh5c2ljc2ZpZ3VyZXMuY29tIiwiY2hlbWlzdHJ5ZmlndXJlcy5jb20iLCJiaW9sb2d5ZmlndXJlcy5jb20iLCJlbmdpbmVlcmluZ2ZpZ3VyZXMuY29tIiwiZWNvbmZpZ3VyZXMuY29tIiwiZWNvbm9taWNzZmlndXJlcy5jb20iLCJhIHRlYWNoZXIuZGV2IHByb2plY3QiLCJFZFRlY2gtYS10aG9uIiwiQHN0ZW1maWd1cmVzL3NoYXJlZCIsIiRzaGFyZWQvIiwiQ0ZfQkVBQ09OX1RPS0VOIiwidmVyY2VsIiwiU1RFTSBGaWd1cmVzIiwiTWF0aCBGaWd1cmVzIiwiUGh5c2ljcyBGaWd1cmVzIiwiQ2hlbWlzdHJ5IEZpZ3VyZXMiLCJCaW9sb2d5IEZpZ3VyZXMiLCJFbmdpbmVlcmluZyBGaWd1cmVzIiwiRWNvbm9taWNzIEZpZ3VyZXMiLCJFY29uIEZpZ3VyZXMiLCJzdGVtLWZpZ3VyZXMiXQ==', 'base64').toString('utf8'));
const ALLOWED = new Set(['docs/third-party.md', 'figures/src/ported/LICENSE.txt']);
const SURFACE = [/^figures\//, /^public\/vendor\/oomba-figures\//, /^public\/js\/figures/, /^public\/css\/figures/, /^server\/routes\/figures\.js$/, /^server\/services\/(figures|figlibs)\.js$/, /^server\/builder\/figure/, /^scripts\/build-figure/, /^docs\/(figures-api|third-party)\.md$/, /^tests\/unit\/(figures-|_bio-gens|_chem-gens|oomba-figures)/];
// One word, case-insensitive, except the hosting name, which must stand alone (an Italian word contains its letters).
const RE = PATTERNS.map(p => (/^[a-z]+$/.test(p) ? new RegExp(`\\b${p}\\b`, 'i') : new RegExp(p.replace(/[.*+?^${}()|[\]\\$]/g, '\\$&'), 'i')));

test('the scrub: the source project is named only in its attribution record and its license copy', () => {
  assert.ok(PATTERNS.length >= 30);
  const files = execFileSync('git', ['ls-files'], { cwd: ROOT, maxBuffer: 1 << 26 }).toString().split('\n').filter(f => f && SURFACE.some(r => r.test(f)) && !ALLOWED.has(f));
  assert.ok(files.length > 100, `${files.length} files scanned`);
  const hits = [];
  for (const f of files) {
    let s; try { s = fs.readFileSync(path.join(ROOT, f), 'utf8'); } catch { continue; }
    for (const r of RE) if (r.test(s)) hits.push(`${f}: ${r}`);
  }
  assert.deepEqual(hits, []);
  // and the attribution record does name it (Apache 2.0 section 4 needs it kept)
  assert.ok(RE.some(r => r.test(fs.readFileSync(path.join(ROOT, 'docs/third-party.md'), 'utf8'))));
});
