export const meta = {
  name: 'cs-quest-platform-slice',
  description: 'Build the CS Quest platform slice (BRB.params, lesson step options/standards/template, QUIZ_STEPS, rubric marks, assign-unit, Builder status) with a 2-lens review and fix loop',
  phases: [
    { title: 'Implement', detail: 'P1-P5, P7-P11, P17-P18 with tests' },
    { title: 'Review', detail: 'security/correctness + behaviour/compat' },
    { title: 'Fix', detail: 'fix findings, re-verify' },
    { title: 'Gates', detail: 'npm test, i18n check, report' },
  ],
}
const BRIEF = '/tmp/claude-0/-home-user-javascript-exercises/db321ed6-437e-588f-beaf-65f7e9b106cd/scratchpad/cs-quest/phase2-brief.md'
const DIR = '/tmp/claude-0/-home-user-javascript-exercises/db321ed6-437e-588f-beaf-65f7e9b106cd/scratchpad/cs-quest'
const WT = '/home/user/javascript-exercises/.worktrees/platform-slice'
const COMMON = `You are owner A building the **platform slice** of the CS Quest program on Oomba Academy (Node/Express/SQLite).
Work ONLY in the git worktree ${WT} (branch cs-quest/platform-slice); cd there first. Local port 3171.
Read, in this order: (1) ${BRIEF} (whole file; your definition of done is the "platform-slice (A1)" section); (2) ${DIR}/contract-platform.json (whole file; criticAdditions wins over the base); (3) ${DIR}/plan.md lines 1420,1460 (platform additions and i18n rules), 1303,1367 (assessment and tracking), 1533,1561 (params grammar), 1561,1730 (critic additions); (4) ${DIR}/map-teach.md (whole file: how lessons, steps, progress, classes, live sets and the SDK token work today) and ${DIR}/map-games.md sections on the SDK/token/play page (grep for "signToken", "init", "BRB.params", "play.js").
Then read the real code you will touch: server/routes/games.js (token + /play + /frame), public/sdk/brb-sdk.js, public/js/play.js, server/db.js (migrations pattern), server/config.js, server/services/lessons.js, server/services/progress.js, server/routes/progress.js, and the existing tests in tests/unit for those modules.
Rules: additive, idempotent migrations; everything backwards compatible (empty new columns = today's behaviour); never touch routes/live.js (integration owns the quiz-step API gate), seed.js, scanner tests, seeds.spec, covers.js, decisions.md; locale keys only in your namespaces (cs.*, js.cs.*) and only if you need chrome now (the student page strings "Your teacher hosts this live" belong to you: add them to all 13 locale files, appended at the end, and run npm run i18n:check). Commit in chunks with the trailer lines from the brief and push at the end of each stage. No pull requests.`
const REPORT = { type: 'object', properties: { summary: { type: 'string' }, done: { type: 'array', items: { type: 'string' } }, notDone: { type: 'array', items: { type: 'string' } }, commits: { type: 'array', items: { type: 'string' } }, pushed: { type: 'boolean' }, tests: { type: 'string' }, openIssues: { type: 'array', items: { type: 'string' } }, crossOwnerRequests: { type: 'array', items: { type: 'string' } }, apiNotes: { type: 'string' } }, required: ['summary', 'done', 'notDone', 'pushed', 'openIssues'] }
const FINDINGS = { type: 'object', properties: { findings: { type: 'array', items: { type: 'object', properties: { severity: { type: 'string', enum: ['blocker', 'major', 'minor'] }, area: { type: 'string' }, what: { type: 'string' }, where: { type: 'string' }, how_to_fix: { type: 'string' } }, required: ['severity', 'what', 'where'] } }, verdict: { type: 'string' } }, required: ['findings', 'verdict'] }

phase('Implement')
const impl = await agent(`${COMMON}

STAGE 1 — implement all of it, with unit tests for each piece:
P1 BRB.params: /play/:slug reads allow-listed chapter, band, mode, level, lock (values [a-z0-9-]{1,16}; band in 1b|2; level 1-30; lock 0|1; unknown keys dropped), packs o = "chapter.band.mode.level.lock" (<= 40 chars, empty parts allowed) into the signed token, /frame copies init.params, the SDK exposes BRB.params as a frozen object ({} when absent; level and lock as numbers). Document in docs/sdk.md. Tests in tests/unit/sdk-protocol.test.js / visibility.test.js (or a new tests/unit/params.test.js).
P2 lesson_steps.options TEXT (that same query-string grammar), cleaned in lessons.js cleanStep, appended to the Play link on the student lesson page.
P3 lesson_steps.standards TEXT (comma-separated CSTA ids validated against server/standards/csta-2017.json via a new server/standards/csta.js loader exporting byId(), all(), isId()).
P4 keep cat and secs through addQuizStep snapshots (lessons.js ~line 234) so exit tickets keep their standard tag.
P5 Host-live link emits mode= via liveGameOf (routes/progress.js ~244, 286); the student page hides Play AND the "I played it" button on steps whose game slug is in classlive-access MODES or is would-you-rather-live, showing the text "Your teacher hosts this live" (locale key cs.step.hostedLive in all 13 files).
P7 QUIZ_STEPS config flag (default on) gating quiz-step rendering and the student quiz APIs in routes/progress.js; LIVE_HOMEWORK keeps gating only "Set as homework". README/config docs. Do not edit routes/live.js.
P8 copyLesson (lessons.js ~191, explicit column list) also copies options, standards, template and set_id and regenerates quiz items.
P9 lessons.template_key TEXT and template_version INTEGER (+ cleanLesson), surfaced in the lesson editor banner only if trivial; otherwise just stored and returned.
P10 lesson_steps.template (one of TEMPLATE_KEYS) -> templateHtml(key) prefill on the build route (routes/progress.js ~307).
P11 review marks 0-3 per rubric line on question and build steps: storage (JSON column on the review/step_progress record as fits the schema), API, teacher form, gradebook display, plus an "Also mark these teammates" multi-select of classmates that copies the marks to them. Tests.
P17 assignUnitWithCadence(classId, lessonIds, {start, cadence: 'daily'|'weekdays'|'weekly'|'twice-weekly', dueDays}) in lessons.js/progress.js setting opens_at and due_at per lesson (route lands later with the curriculum owner; export the function and test it).
P18 builderStatus() helper (server/services or routes level) reading the ai-budget service (resting/on) and config CS_QUEST_BUILD_TEAMS_PER_PERIOD (default 8); test.
Run npm test (no NEW failures: known ones are two three-frame tests, class-sharing screenshot 500, parents How-it-works) and npm run i18n:check. Commit and push. In apiNotes, write the exact function signatures, column names, flag names and locale keys you added (the curriculum owner builds on them).`, { label: 'platform:implement', phase: 'Implement', schema: REPORT })
log(`platform implement: ${impl ? impl.summary.slice(0, 160) : 'no result'}`)

const LENSES = [
  { key: 'security-correctness', prompt: `Lens: security and correctness. Attack BRB.params and the token: can a kid or a crafted URL smuggle anything into the frame (length, characters, prototype keys, unicode, arrays, duplicate keys)? Is the token still signed over the new field, and do old tokens still verify? Do the migrations run twice safely and on a fresh DB (BRB_DATA_DIR in /tmp/claude-0/)? Can a student call the review marks API or the teammates copy for a class they are not in (authz on every new route)? Can marks exceed 0-3 or target non-classmates? Does QUIZ_STEPS off truly hide the API, not just the UI? Does hiding Play on MODES steps break the existing Quest Race lesson flow or the "done after 120 s" rule? Write throwaway probe scripts under /tmp/claude-0/platform-review/ and run them against a local server on port 3181.` },
  { key: 'behaviour-compat', prompt: `Lens: behaviour and backwards compatibility. Seed a fresh local DB (port 3182), create a teacher, class, a lesson with game/quiz/question/build steps the OLD way (no new columns), assign it, play it as a student, review it as the teacher, host it live: nothing may have changed. Then exercise every new thing from the implementer's apiNotes end to end (params on a Play link reaching BRB.params inside a real game frame in Chromium; options/standards stored and shown; cat kept on quiz items; "Your teacher hosts this live" on a quest-race step; copyLesson; template prefill on a build step; rubric marks + teammates in the gradebook; assignUnitWithCadence dates; builderStatus). Check test coverage: every new branch has a unit test; run npm test and npm run i18n:check and report the exact failing names vs the known list.` },
]
phase('Review')
const reviews = (await parallel(LENSES.map(l => () => agent(`${COMMON}

STAGE 2 — independent review, read-only (no edits or commits in the worktree). Implementer's report: ${JSON.stringify(impl)}.
${l.prompt}
Be concrete: file:line, what you saw, how to reproduce, how to fix.`, { label: `platform:review:${l.key}`, phase: 'Review', schema: FINDINGS })))).filter(Boolean)
let findings = reviews.flatMap(r => r.findings)
log(`platform review: ${findings.filter(f => f.severity === 'blocker').length} blockers, ${findings.filter(f => f.severity === 'major').length} majors, ${findings.filter(f => f.severity === 'minor').length} minors`)

phase('Fix')
let fixReport = null
for (let round = 1; round <= 2 && findings.some(f => f.severity !== 'minor'); round++) {
  fixReport = await agent(`${COMMON}

STAGE 3 — fix round ${round}. Findings (JSON): ${JSON.stringify(findings)}. Reproduce each blocker/major first; fix all blockers and majors and the cheap minors; if a finding is wrong, say why. Re-run the affected tests, npm test and npm run i18n:check. Commit and push.`, { label: `platform:fix${round}`, phase: 'Fix', schema: REPORT })
  const verify = await agent(`${COMMON}

STAGE 3 — verification after fix round ${round} (read-only). Findings to be fixed: ${JSON.stringify(findings.filter(f => f.severity !== 'minor'))}. Fixer's report: ${JSON.stringify(fixReport)}. Reproduce each on the current branch; return only what is still open plus any regression (same shape).`, { label: `platform:verify${round}`, phase: 'Fix', schema: FINDINGS })
  findings = verify ? verify.findings : []
  log(`platform after fix round ${round}: ${findings.filter(f => f.severity !== 'minor').length} non-minor open`)
}

phase('Gates')
const final = await agent(`${COMMON}

STAGE 4 — gates and hand-off. Run npm test, npm run i18n:check, and (if a local server runs) npx playwright test tests/e2e/lessons*.spec.js tests/e2e/progress*.spec.js or whichever e2e specs cover lessons and the student page (list what you ran). Confirm git diff origin/main --stat touches no integration-only files. Push. Write ${DIR}/platform-api-notes.md: every new column, flag, function signature, route, locale key and the exact Play-link grammar, so the curriculum owner can build on it without reading the diff. Report.`, { label: 'platform:final', phase: 'Gates', schema: REPORT })
return { impl, reviewFindings: reviews.flatMap(r => r.findings), openAfterFix: findings, final }