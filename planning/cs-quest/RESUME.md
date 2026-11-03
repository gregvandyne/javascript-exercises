# CS Quest build: how to resume

State when the build paused (3 Nov 2026, weekly usage limit; resets 5 Nov 14:00 UTC):
- Merged to main: #147 scaffolding (scripts/cs-quest-i18n.mjs, content lint, server/standards/csta-2017.json), #148 platform slice.
- Branches on origin, all pushed, not merged: cs-quest/live-sets (banks + WYR done, review stage not run), cs-quest/robo-route,
  cs-quest/data-detective, cs-quest/packet-post, cs-quest/inside-the-machine (games part-built: core + some chapters; no translations,
  no cover recipes, review not run), cs-quest/curriculum (reconcile stage done; lessons not written).
- This folder holds the plan (plan.md), contracts.json, per-owner contracts, the Phase 2 brief (phase2-brief.md), maps, CSTA
  sources, the API notes from the platform slice, and the workflow scripts that were running (workflows/ + game-workflow.js).

To resume: recreate worktrees `.worktrees/<item>` from each branch (symlink node_modules), copy this folder back to the scratchpad
path named inside phase2-brief.md (or edit the paths), and re-run the game workflow per slug from its "Build rest" stage, the
live-sets workflow from "Review", and the curriculum workflow from "Lessons".
