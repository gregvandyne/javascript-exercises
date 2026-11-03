export const meta = {
  name: 'cs-quest-live-sets',
  description: 'Write the 14 CS Quest quiz banks and the Would You Rather tech/online topics with live plumbing, then review (content + code) and fix',
  phases: [
    { title: 'Banks', detail: '14 unit banks, 202+ items, validation test' },
    { title: 'WYR + plumbing', detail: 'tech/online topics x13, /live starter, cat kept, optgroup' },
    { title: 'Review', detail: 'content accuracy + code' },
    { title: 'Fix', detail: 'fix findings, re-verify' },
    { title: 'Gates', detail: 'npm test, i18n check, report' },
  ],
}
const BRIEF = '/tmp/claude-0/-home-user-javascript-exercises/db321ed6-437e-588f-beaf-65f7e9b106cd/scratchpad/cs-quest/phase2-brief.md'
const DIR = '/tmp/claude-0/-home-user-javascript-exercises/db321ed6-437e-588f-beaf-65f7e9b106cd/scratchpad/cs-quest'
const WT = '/home/user/javascript-exercises/.worktrees/live-sets'
const COMMON = `You are owner B building the **live quiz sets and Would You Rather topics** of the CS Quest program on Oomba Academy.
Work ONLY in the git worktree ${WT} (branch cs-quest/live-sets); cd there first. Local port 3172.
Read, in this order: (1) ${BRIEF} (whole file; your definition of done is the "live-sets (B)" section); (2) ${DIR}/contract-live-sets.json (whole file; criticAdditions wins over the base); (3) ${DIR}/plan.md lines 891,1245 (quiz sets §6 with every item written out, live hosting, Would You Rather §7), 1561,1730 (critic additions, especially CA-5 bank rule, CA-8 US spelling list, CA-9, CA-10); (4) ${DIR}/map-teach.md sections on live sets, the live bank, Would You Rather and classlive-results (grep for "classlive-sets", "wyr", "bank", "itemRow", "starter").
Then read the real code: scripts/wyr-bank.js, scripts/data/would-you-rather/ (all 13 files + ui.json), server/live/wyr.js, server/routes/live.js (~lines 160-175 starter parsing, the set picker), server/views/live.js, server/services/classlive-results.js (~line 80 itemRow), public/js/live-sets.js, seed-games/would-you-rather.html + would-you-rather-live.html (how topics are picked), tests/unit/live-wyr-atlas.test.js, live-pages.test.js, classlive-results.test.js.
Rules: kid-safe (no brands, products, real people, URLs, @, 7+ digit runs); US spelling; every quiz item has exactly one defensible correct answer and 3 plausible distractors; cat is a CSTA id from server/standards/csta-2017.json that is a primary id of the item's lesson; never edit seed.js, scanner tests, seeds.spec, covers.js, decisions.md, or locale keys outside live.cs.* and the WYR ui.json; append your locale keys at the END of each of the 13 files and keep npm run i18n:check green. Commit in chunks with the trailer lines from the brief; push at the end of each stage. No pull requests.`
const REPORT = { type: 'object', properties: { summary: { type: 'string' }, done: { type: 'array', items: { type: 'string' } }, notDone: { type: 'array', items: { type: 'string' } }, commits: { type: 'array', items: { type: 'string' } }, pushed: { type: 'boolean' }, tests: { type: 'string' }, openIssues: { type: 'array', items: { type: 'string' } }, crossOwnerRequests: { type: 'array', items: { type: 'string' } }, apiNotes: { type: 'string' } }, required: ['summary', 'done', 'notDone', 'pushed', 'openIssues'] }
const FINDINGS = { type: 'object', properties: { findings: { type: 'array', items: { type: 'object', properties: { severity: { type: 'string', enum: ['blocker', 'major', 'minor'] }, area: { type: 'string' }, what: { type: 'string' }, where: { type: 'string' }, how_to_fix: { type: 'string' } }, required: ['severity', 'what', 'where'] } }, verdict: { type: 'string' } }, required: ['findings', 'verdict'] }

phase('Banks')
const banks = await agent(`${COMMON}

STAGE 1 — the banks. Create seed-lessons/cs-quest/sets/<set id>.json for all 14 unit banks in the contract (7 Explorer, 7 Pro) using the contract's itemSchema exactly, transcribing the items written out in plan.md §6.2/§6.3 and then adding the 5 review items the critic named (CA-5) and applying the 13 US-spelling fixes (CA-8); stems <= 300 chars, choices <= 120, 4 choices, one correct, an explanation line per item if the schema has one, cat = a primary id of the item's lesson (contract lessons list), item ids exactly as the contract's warmupItems/exitItems reference them (every referenced id must exist). Also write seed-lessons/cs-quest/sets/README.md (format + how the materialiser derives warm-ups 5 / exit tickets 3 / unit reviews). Write tests/unit/cs-quest-sets.test.js: counts per bank match the contract, every lesson's warmupItems/exitItems resolve, every cat is a real id of the right level, >= 3 items per id across the program (CA-5 rule; list the ids that fall short in the assertion message), lengths, 4 unique choices, no duplicate stems, no digit runs/@/URLs, no UK spellings, every item passes the real scanner's text rules (scanVersion over a probe script of all strings). Make it green. Commit and push.`, { label: 'sets:banks', phase: 'Banks', schema: REPORT })
log(`banks: ${banks ? banks.summary.slice(0, 160) : 'no result'}`)

phase('WYR + plumbing')
const wyr = await agent(`${COMMON}

STAGE 2 — Would You Rather topics and live plumbing. Stage 1 report: ${JSON.stringify(banks && { done: banks.done, notDone: banks.notDone, openIssues: banks.openIssues })}.
(1) WYR topics tech (20 dilemmas) and online (10) from plan §7: add to all 13 data files under scripts/data/would-you-rather/ (full translations where you can write them well; English fallback per item is allowed in the 12 non-English files if the format supports it, as the plan says; check how the bank handles a missing translation), cat.tech / cat.online names in ui.json in 13 languages, TOPICS/CATS in server/live/wyr.js and the game files as needed, rebuild the packs with scripts/wyr-bank.js (and whatever pins them), update seed/test counts; seed-lessons/cs-quest/wyr-tech.json with prompts + CSTA ids per dilemma (contract shape). WYR 'no digits' rule: rephrase tech-13 ('3D printer') per CA-10.
(2) P6: /live?starter=<wyr:topics:count:secs | bank:...> preselects topics/count/secs in the host form (routes/live.js ~166-171 + views/live.js); unknown starters ignored safely.
(3) P4-live: classlive-results.itemRow keeps cat (and secs) on saved live run items.
(4) P20: a "CS Quest" optgroup in the /live set picker for sets whose id starts with the CS Quest prefix (coordinate the prefix with the contract's set ids), so 35+ derived sets do not clutter the picker.
(5) live.cs.* locale keys for any new chrome, in all 13 files. Tests: extend tests/unit/live-wyr-atlas.test.js (topic counts, cat names x13, starter parsing), live-pages.test.js (optgroup, preselect), classlive-results.test.js (cat kept). npm test (no NEW failures vs the brief's known list) and npm run i18n:check green. Commit, push. In apiNotes list the exact set id prefix, starter grammar, topic ids and locale keys.`, { label: 'sets:wyr', phase: 'WYR + plumbing', schema: REPORT })
log(`wyr: ${wyr ? wyr.summary.slice(0, 160) : 'no result'}`)

const LENSES = [
  { key: 'content', prompt: `Lens: content accuracy and classroom fit. Read every one of the 200+ bank items and the 30 WYR dilemmas. For each item: is the keyed answer the only defensible one? Are distractors plausible but clearly wrong? Does the item actually assess the CSTA statement in its cat (open server/standards/csta-2017.json and compare)? Is the reading level right for the band (grades 3-5 vs 6-8)? Any ambiguity, trick wording, cultural assumptions, brands, real people, UK spelling, digits runs? Are the five added review items good? Are the WYR dilemmas genuinely two-sided, kid-safe and free of digits/brands? List every flawed item by id with a rewrite.` },
  { key: 'code', prompt: `Lens: code. Seed a fresh local DB (port 3192), start the server, and verify: /live?starter=wyr:tech:8:20 preselects correctly and bad starters are harmless; the set picker shows the CS Quest optgroup; a saved live run keeps cat on its items (host a short run with the test helpers or unit-level calls); the WYR packs rebuilt deterministically (git diff shows only the intended data changes; pack checksums pinned where needed; the solo Would You Rather game still loads every topic in en and ar); counts in tests match the data; npm test and npm run i18n:check results vs the known failing list; no edits to integration-only files or foreign locale namespaces (git diff origin/main --stat).` },
]
phase('Review')
const reviews = (await parallel(LENSES.map(l => () => agent(`${COMMON}

STAGE 3 — independent review, read-only (no edits or commits in the worktree; scratch files under /tmp/claude-0/sets-review/). Reports so far: ${JSON.stringify({ banks: banks && banks.openIssues, wyr: wyr && { apiNotes: wyr.apiNotes, openIssues: wyr.openIssues } })}.
${l.prompt}
Be concrete: file, item id or line, what is wrong, the fix.`, { label: `sets:review:${l.key}`, phase: 'Review', schema: FINDINGS })))).filter(Boolean)
let findings = reviews.flatMap(r => r.findings)
log(`sets review: ${findings.filter(f => f.severity === 'blocker').length} blockers, ${findings.filter(f => f.severity === 'major').length} majors, ${findings.filter(f => f.severity === 'minor').length} minors`)

phase('Fix')
let fixReport = null
for (let round = 1; round <= 2 && findings.some(f => f.severity !== 'minor'); round++) {
  fixReport = await agent(`${COMMON}

STAGE 4 — fix round ${round}. Findings (JSON): ${JSON.stringify(findings)}. Apply every content rewrite you agree with (say why when you do not), fix all blockers/majors and cheap minors, keep item ids stable, re-run tests/unit/cs-quest-sets.test.js and the live tests, npm test, npm run i18n:check. Commit and push.`, { label: `sets:fix${round}`, phase: 'Fix', schema: REPORT })
  const verify = await agent(`${COMMON}

STAGE 4 — verification after fix round ${round} (read-only). Findings to be fixed: ${JSON.stringify(findings.filter(f => f.severity !== 'minor'))}. Fixer's report: ${JSON.stringify(fixReport)}. Check each on the current branch; return only what is still open plus regressions (same shape).`, { label: `sets:verify${round}`, phase: 'Fix', schema: FINDINGS })
  findings = verify ? verify.findings : []
  log(`sets after fix round ${round}: ${findings.filter(f => f.severity !== 'minor').length} non-minor open`)
}

phase('Gates')
const final = await agent(`${COMMON}

STAGE 5 — gates and hand-off. Run npm test and npm run i18n:check; confirm git diff origin/main --stat touches no integration-only files or foreign locale namespaces; push. Write ${DIR}/live-sets-api-notes.md: set file format and ids, item schema, the derived-set rules, WYR topic ids, the starter grammar, locale keys, and anything the curriculum owner must know to reference the banks. Report.`, { label: 'sets:final', phase: 'Gates', schema: REPORT })
return { banks, wyr, reviewFindings: reviews.flatMap(r => r.findings), openAfterFix: findings, final }