export const meta = {
  name: 'cs-quest-discover',
  description: 'Map the Oomba codebase, verify CSTA 1B/2 standards against official sources, and design the CS Quest program via a judged panel before building',
  phases: [
    { title: 'Map', detail: 'two readers map the subsystems the program will plug into' },
    { title: 'Standards', detail: 'fetch official CSTA 1B and 2 text, then independently verify it' },
    { title: 'Design', detail: 'three designers propose the full program from different angles' },
    { title: 'Judge', detail: 'two judges score every design' },
    { title: 'Synthesize', detail: 'one plan + implementer contracts, then a completeness critic' },
  ],
}

const REPO = '/home/user/javascript-exercises'
const OUT = '/tmp/claude-0/-home-user-javascript-exercises/db321ed6-437e-588f-beaf-65f7e9b106cd/scratchpad/cs-quest'

const CONTEXT = `You are helping build "CS Quest", a ready-made computer-science program for US teachers on Oomba Academy (repo at ${REPO}, a Node/Express + SQLite kids' learning-games site: official games under seed-games/, an AI game Builder, "Oomba Live" live class games, teacher lesson plans and classes, 13 UI languages). The program targets the CSTA K-12 Computer Science Standards (2017), level 1B (grades 3-5) and level 2 (grades 6-8). It will consist of several new official games (a block-coding puzzle game "Robo Route" for algorithms/programming/debugging; "Data Detective" for data & analysis; "Packet Post" for networks/internet/cybersecurity; "Inside the Machine" for computing systems), live quiz sets, a Would You Rather (Live) "tech choices" discussion set for impacts of computing, a Builder capstone where students design their own game, and ready-made 45-minute lesson plans (grade-band 1B and 2 variants) that teachers can run from a teacher page. Lesson content is English (US focus); all page UI chrome must follow the site's 13-language rules. Nothing is built yet.`

const MAP_SCHEMA = { type: 'object', required: ['path', 'summary', 'gotchas'], properties: { path: { type: 'string' }, summary: { type: 'string' }, gotchas: { type: 'array', items: { type: 'string' } } } }
const STD_SCHEMA = { type: 'object', required: ['path', 'count1B', 'count2', 'sources', 'unverified', 'notes'], properties: { path: { type: 'string' }, count1B: { type: 'number' }, count2: { type: 'number' }, sources: { type: 'array', items: { type: 'string' } }, unverified: { type: 'array', items: { type: 'string' } }, notes: { type: 'string' } } }
const VERIFY_SCHEMA = { type: 'object', required: ['discrepancies', 'confirmedCount', 'verdict', 'notes'], properties: { discrepancies: { type: 'array', items: { type: 'object', required: ['code', 'issue', 'fix'], properties: { code: { type: 'string' }, issue: { type: 'string' }, fix: { type: 'string' } } } }, confirmedCount: { type: 'number' }, verdict: { type: 'string', enum: ['trustworthy', 'fix-then-trust', 'unreliable'] }, notes: { type: 'string' } } }
const DESIGN_SCHEMA = { type: 'object', required: ['path', 'angle', 'summary', 'units', 'games', 'risks'], properties: { path: { type: 'string' }, angle: { type: 'string' }, summary: { type: 'string' }, units: { type: 'array', items: { type: 'object', required: ['title', 'lessons'], properties: { title: { type: 'string' }, lessons: { type: 'array', items: { type: 'string' } } } } }, games: { type: 'array', items: { type: 'object', required: ['slug', 'title', 'chapters'], properties: { slug: { type: 'string' }, title: { type: 'string' }, chapters: { type: 'array', items: { type: 'string' } } } } }, risks: { type: 'array', items: { type: 'string' } } } }
const JUDGE_SCHEMA = { type: 'object', required: ['scores', 'bestOverall', 'graft', 'notes'], properties: { scores: { type: 'array', items: { type: 'object', required: ['design', 'practicality', 'coverage', 'engagement', 'buildability', 'assessment', 'total', 'why'], properties: { design: { type: 'string' }, practicality: { type: 'number' }, coverage: { type: 'number' }, engagement: { type: 'number' }, buildability: { type: 'number' }, assessment: { type: 'number' }, total: { type: 'number' }, why: { type: 'string' } } } }, bestOverall: { type: 'string' }, graft: { type: 'array', items: { type: 'string' } }, notes: { type: 'string' } } }
const PLAN_SCHEMA = { type: 'object', required: ['planPath', 'contractsPath', 'summary', 'workItems'], properties: { planPath: { type: 'string' }, contractsPath: { type: 'string' }, summary: { type: 'string' }, workItems: { type: 'array', items: { type: 'object', required: ['id', 'title', 'owns', 'dependsOn'], properties: { id: { type: 'string' }, title: { type: 'string' }, owns: { type: 'array', items: { type: 'string' } }, dependsOn: { type: 'array', items: { type: 'string' } } } } } } }
const CRITIC_SCHEMA = { type: 'object', required: ['gaps', 'mustFix', 'verdict'], properties: { gaps: { type: 'array', items: { type: 'string' } }, mustFix: { type: 'array', items: { type: 'string' } }, verdict: { type: 'string' } } }

phase('Map')
log('Mapping the codebase and fetching the standards')
const [mapGames, mapTeach, standards] = await parallel([
  () => agent(`${CONTEXT}

Read-only task: write a thorough, accurate map (markdown, with file paths and line references) of everything an engineer needs to build NEW OFFICIAL 2D GAMES on this platform, and save it to ${OUT}/map-games.md. Cover, by reading the actual code and docs (docs/kit.md, docs/kit-api.md, docs/sdk.md, docs/decisions.md relevant entries, docs/safety.md):
1. How an official seed game is defined and shipped: seed-games/<slug>.html + .json (every json field and what it does: featured, live, NOT_FOR_CLASS etc.), scripts/seed.js SEED_GAMES and how seeding/upgrades work on deploy, scripts/covers.js cover recipes (screenshot covers), public/covers, OG images.
2. The Oomba Kit (2D): current version, the kit tag + SRI pinning, the core API surface (Oomba.game, screens, HUD, settings, entities/props/art packs, text, input incl. touch/keyboard/gamepad, audio/sfx, tween, particles, i18n strings, save, testhooks/__brbTest), what UI primitives exist for building a drag-and-drop block palette / grids / charts (what kit pieces to reuse vs. draw yourself), the size/quality rules, and how code-isle.html does its coding mechanics (reusable?).
3. The SDK (public/sdk/brb-sdk.js): BRB.score/gameOver/save/load/speak/poll/user/theme/motion/retry, events available for progress reporting, and any way a game can report structured progress (e.g. level complete + tags) that the platform stores.
4. The sandbox: frame CSP (connect-src 'none'), postMessage relay, what a game can and cannot do; the scanner rules (server/services/scanner*, safety) a game must pass; the kid-safety text rules for anything a kid types or shares (class sharing of kid-made content, e.g. a level editor).
5. URL params / settings passthrough: how a game can receive teacher-chosen options (e.g. open chapter X, grade band, mode) from a lesson link or page-data; how BRB.user.lang and dir arrive; how Would You Rather and Atlas Quest pick topics/regions.
6. Testing & QA conventions: tests/unit patterns for seed games (e.g. gulp-city.test.js, atlas-quest.test.js), tests/e2e helpers, scripts/games-fit-audit.js (how to add a game, the 5 sizes, data-fit-dense), tests/e2e/frame-fit.js rules, i18n check (npm run i18n:check), scanner tests, how to start a local server on its own port + data dir and seed it, how screenshots are taken for covers.
7. Accessibility and settings parity expected of official games (read-aloud, reduced motion, high contrast, text size, keyboard).
Return the path, a 10-line summary, and a list of gotchas (things that commonly break: size caps, scanner refusals, i18n completeness rules, the .claude worktree path issue for one test, etc.).`, { label: 'map:games', schema: MAP_SCHEMA }),
  () => agent(`${CONTEXT}

Read-only task: write a thorough, accurate map (markdown, with file paths and line references) of everything an engineer needs to build the TEACHER-FACING PROGRAM (lesson plans, live quiz sets, teacher pages, class assignment and progress tracking), and save it to ${OUT}/map-teach.md. Read the actual code:
1. Lessons: server/routes/lessons.js, server/services/lessons.js, server/services/lesson-ai.js, server/routes/progress.js, server/services/progress.js — the lesson data model (steps of kinds game/build/text/question/quiz, fields, limits), who can create/assign lessons, how a lesson is assigned to a class, what students see, what progress is recorded and how teachers view it; whether "official/template lessons" exist that a teacher can copy into their library (if not, how one would seed them).
2. Classes/schools: server/services/schools.js — classes, teachers, students, staff, how class-shared games work (gameLiveInClass etc.), class pages.
3. Oomba Live: server/services/classlive-access.js (MODES, CAPACITY, teacherHost), classlive-sets.js (teacher question sets: LIMITS, SECS, copySet, AI draft), server/live/bank (engine.js, index.js, per-language JSON format: subjects/levels/items, how a bank set is referenced), how /live preselects a mode/set via URL (server/routes/live.js, public/js/live-sets.js), which modes take which content (Quest Race/Battle/Board quiz sets; Would You Rather (Live) topic choice from scripts/data/would-you-rather + public/vendor/data packs; Atlas (Live) regions), and how English-only content is handled when a set lacks other languages.
4. Teacher pages: server/routes/teachers.js (/teachers, /teachers/live) view patterns, server/views (layout, components, how), how-shots/screenshots pipeline for teacher pages, print CSS availability, the i18n system (server/i18n/locales/*.json, en-GB inheritance, npm run i18n:check, what text must be in 13 languages vs may be English-only), tests for teacher pages (tests/unit/seo.test.js, teachers tests).
5. Builder capstone hooks: how a teacher could assign a Builder challenge (lesson step kind 'build'?), Studio templates list, class sharing + publish flow + playtest ("Playing your game like a player would"), the safety review path for kid games shared to a class, limits (daily Builder turns, AI budget) that a 30-kid class capstone would hit — quantify.
6. Progress/standards: whether game results (BRB.score/gameOver), live results (classlive-results.js) or lesson progress are stored per student per game with any tag field we could attach CSTA codes to; what a minimal "standards practiced per class" view would need.
Return the path, a 10-line summary, and a list of gotchas.`, { label: 'map:teach', schema: MAP_SCHEMA }),
  async () => {
    const fetched = await agent(`${CONTEXT}

Task: produce an accurate machine-readable file of the CSTA K-12 Computer Science Standards (2017 revision) for level 1B (grades 3-5) and level 2 (grades 6-8), saved as ${OUT}/csta.json: an array of { id (e.g. "1B-AP-10"), level ("1B"|"2"), concept (Computing Systems | Networks & the Internet | Data & Analysis | Algorithms & Programming | Impacts of Computing), subconcept (e.g. Devices, Hardware & Software, Troubleshooting, Network Communication & Organization, Cybersecurity, Storage, Collection Visualization & Transformation, Inference & Models, Algorithms, Variables, Control, Modularity, Program Development, Culture, Social Interactions, Safety Law & Ethics), practices (array of practice numbers 1-7 as published), statement (the official standard text, verbatim), confidence ("verified"|"recalled") }. Use WebSearch and WebFetch to find the official text: csteachers.org (the standards page and the official PDF), the CSTA standards on Code.org's curriculum standards pages (studio.code.org/s/.../standards or code.org/educate/standards), state DOE crosswalk PDFs that reproduce the 1B/2 standards, GitHub repos mirroring the CSTA standards (search e.g. "1B-AP-10" "2-NI-05" json). Try several sources; the sandbox's own network may block many hosts but WebFetch may still work — try it. Expected counts: 1B has 21 standards and level 2 has 31 (2017). Every id must be real; do NOT invent ids. For any statement you could not confirm verbatim from a source, set confidence "recalled" and reproduce it as faithfully as you can. Also save the raw evidence you gathered (source URL + the text you saw) to ${OUT}/csta-sources.md. Return the json path, the counts, the sources used, the list of ids left as recalled, and notes.`, { label: 'standards:fetch', schema: STD_SCHEMA })
    const verify = await agent(`${CONTEXT}

Adversarial verification task. A colleague produced ${fetched.path} (CSTA 2017 standards for levels 1B and 2) with evidence in ${OUT}/csta-sources.md; they report ${fetched.count1B} 1B and ${fetched.count2} level-2 standards, sources ${JSON.stringify(fetched.sources)}, and these ids unverified: ${JSON.stringify(fetched.unverified)}. Independently check it: use WebSearch/WebFetch against sources they did NOT use where possible (e.g. a state crosswalk PDF, Code.org standards pages, a different mirror) plus your own knowledge. Check: (a) the set of ids is complete and correct for 1B (expect 21) and 2 (expect 31) — list any missing or extra ids; (b) each id's concept/subconcept/practice numbers; (c) the statement text — flag paraphrases, wrong grade level, swapped statements between neighbouring ids (e.g. 1B-AP-10 vs 1B-AP-11, 2-AP-11 vs 2-AP-12), and wording that looks invented. Correct anything you can prove wrong directly in ${fetched.path} (keep the schema; set confidence to "verified" only when you saw it in a source) and record what you changed. Return the discrepancies you found (code, issue, fix), how many ids you could confirm against a source, a verdict, and notes. Default to flagging when uncertain.`, { label: 'standards:verify', schema: VERIFY_SCHEMA })
    return { fetched, verify }
  },
])

log(`Standards: ${standards?.verify?.verdict} (${standards?.verify?.confirmedCount} confirmed, ${standards?.verify?.discrepancies?.length} discrepancies fixed)`)

const INPUTS = `Read these first (they are your ground truth; do not re-derive what they already say):
- ${OUT}/map-games.md — how official games are built, tested and shipped here. Summary: ${mapGames?.summary}
- ${OUT}/map-teach.md — lessons, classes, Oomba Live content, teacher pages, Builder capstone hooks, progress. Summary: ${mapTeach?.summary}
- ${OUT}/csta.json — the CSTA 1B and 2 standards (verdict: ${standards?.verify?.verdict}; unverified ids: ${JSON.stringify(standards?.fetched?.unverified || [])}).
Gotchas from the mappers: ${JSON.stringify([...(mapGames?.gotchas || []), ...(mapTeach?.gotchas || [])])}`

phase('Design')
const ANGLES = [
  { key: 'teacher-first', brief: 'Design for the real classroom: a non-CS teacher with 45-minute periods, Chromebooks/iPads, 25-30 kids, little prep. Optimise for "open the lesson, press start, it works": minimal setup, clear pacing (warm-up / explore / play / discuss / exit ticket), unplugged fallbacks when devices fail, substitute-teacher friendly, printable pages, honest timing. Lessons must still cover every 1B and 2 standard at least once.' },
  { key: 'kid-first', brief: 'Design for maximum engagement and learning-by-doing: the games are the curriculum. Make each game genuinely fun and replayable (progression, characters, stars, make-and-share), with the standards embedded in play rather than quizzed. Lessons wrap the games lightly. Still cover every 1B and 2 standard at least once, and include assessment that does not feel like a test.' },
  { key: 'standards-first', brief: 'Design for airtight CSTA coverage and evidence: every 1B and 2 standard mapped to a specific activity that demonstrably practices it (not just mentions it), the 7 CSTA practices spread across the units, exit tickets that produce mastery data per standard, a capstone rubric per standard, and a coverage map a principal or district can audit. Keep it still runnable in 45-minute periods.' },
]
const designs = (await parallel(ANGLES.map(a => () => agent(`${CONTEXT}

${INPUTS}

You are one of three independent designers; your angle: ${a.key.toUpperCase()} — ${a.brief}
Write a complete program design to ${OUT}/design-${a.key}.md covering:
1. Program name/branding check (working name "CS Quest"; keep or improve, matching the site's naming like "Quest Race", "Atlas Quest").
2. Scope & sequence: units → lessons (each 45 min) with a 1B (gr 3-5) and a 2 (gr 6-8) variant; per lesson: title, CSTA ids covered (from csta.json only), CSTA practices, "I can" objectives, vocabulary, materials/devices, minute-by-minute plan (warm-up live quiz set / main activity / discussion / exit ticket), differentiation, unplugged fallback, teacher notes. Units should cover Algorithms & Programming, Debugging/Program Development, Data & Analysis, Networks & Internet + Cybersecurity, Computing Systems, Impacts of Computing, and a Builder capstone.
3. Game designs: for Robo Route (block coding: sequences, loops, conditionals, events, variables, functions/parameters, debugging mode, optimisation stars, make-your-own-level shared with class), Data Detective (data & analysis mysteries), Packet Post (packets/routing/protocols + passphrases/phishing/ciphers), Inside the Machine (parts, hardware vs software, troubleshooting, binary): chapters → levels with the exact standard each level practices, core mechanic, controls (touch + keyboard, tablets first), progression/rewards, hints that teach, what the grade-band switch changes, teacher deep-link params (e.g. ?chapter=loops&band=2&mode=debug), what progress the game should report. Be concrete and buildable with this platform's kit (per map-games.md): list which kit pieces to reuse and where custom drawing is needed. Also design the live quiz sets (per unit, both bands; question count and sample questions with the CSTA id each checks) and the Would You Rather (Live) "tech choices" set (kid-appropriate dilemmas on impacts of computing, ~30 items) and the Builder capstone (planning sheet, rubric mapped to CSTA ids, peer play-testing protocol, class-sharing safety).
4. Assessment & tracking: exit tickets, what a per-class "standards practiced" view shows, using only data the platform can realistically record (per map-teach.md), and what must be added.
5. How teachers reach it: /teachers/cs program page, lesson pages (printable), buttons that start the warm-up live set / open the game at the right chapter / assign to class; how it fits the existing lessons library (seeded template lessons a teacher copies? explain the mechanism the map describes).
6. Risks and open questions.
Return the file path, your angle, a 15-line summary, the units with lesson titles, the games with chapter lists, and the risks.`, { label: `design:${a.key}`, schema: DESIGN_SCHEMA })))).filter(Boolean)

phase('Judge')
const judgeInputs = designs.map(d => `- ${d.angle}: ${d.path}`).join('\n')
const judges = (await parallel(['practical classroom veteran', 'CS-standards assessor'].map((persona, i) => () => agent(`${CONTEXT}

${INPUTS}

You are a judge (${persona}). Read these three complete program designs:
${judgeInputs}
Score each design 1-10 on: practicality (a normal teacher can run it in 45-min periods with little prep), coverage (every CSTA 1B and 2 standard practiced somewhere, practices spread), engagement (kids want to play again; learning is in the play), buildability (realistic to build on THIS platform per map-games.md/map-teach.md within a few engineer-days per game; no impossible features), assessment (exit tickets/rubrics/tracking produce real evidence). total = sum. Name the best overall, and list specific ideas from the other designs worth grafting into it (quote the design and the idea). Be concrete and critical; call out standards any design misses or only name-checks, timing that is unrealistic, and features the platform cannot support. Return scores, the best, graft list, and notes.`, { label: `judge:${i + 1}`, schema: JUDGE_SCHEMA })))).filter(Boolean)

const tally = {}
for (const j of judges) for (const s of j.scores) tally[s.design] = (tally[s.design] || 0) + s.total
log(`Judge totals: ${JSON.stringify(tally)}`)

phase('Synthesize')
const plan = await agent(`${CONTEXT}

${INPUTS}

Three designs were written and judged. Designs:
${judgeInputs}
Judge results: ${JSON.stringify(judges)}
Judge totals: ${JSON.stringify(tally)}

Synthesize THE plan we will build: start from the best-scoring design and graft in the judges' recommended ideas; resolve contradictions explicitly; keep everything buildable on this platform per the maps. Write:
1. ${OUT}/plan.md — the final program (name, scope & sequence with both grade bands, every lesson fully specified, game designs chapter by chapter with CSTA ids per chapter, quiz sets with the questions themselves (English; at least 10 per set per band, each tagged with a CSTA id and with 3 wrong answers of similar length), the ~30-item Would You Rather tech-choices set, the capstone planning sheet + rubric, the exit tickets, the tracking view, the teacher pages and their buttons, the printable lesson format). Include a standards coverage matrix: every 1B and 2 id → the lesson(s) and activity that practice it; no id may be left uncovered. Mark anything the platform must add (new fields, routes) clearly.
2. ${OUT}/contracts.json — machine-readable contracts so independent implementers can build in parallel without talking: { program: { name, slug }, games: [{ slug, title, bands: ["1B","2"], chapters: [{ id, title, band, csta: [ids], levels: n, mode? }], params: { chapter, band, mode }, progressEvents: how the game reports completion (exact SDK call/shape) }], sets: [{ id, kind: "quiz"|"wyr", unit, band, title, modes: [...], cstaTags: [...], questionCount }], lessons: [{ id, unit, order, band, title, duration: 45, csta: [...], warmupSetId, mainActivity: { type: "game"|"unplugged"|"builder"|"discussion", slug?, params? }, exitTicketSetId, printable: true }], teacherPages: [{ route, purpose }], tracking: { what is stored, where, new fields }, i18n: { englishOnly: [...], mustBe13Languages: [...] } }.
3. A work breakdown with clear ownership and no overlapping files: workItems [{ id, title, owns: [file globs], dependsOn: [ids] }] — expected items: curriculum data + teacher pages + lessons seeding + tracking (owner A), live quiz sets + WYR set + bank integration (owner B), Robo Route (C), Data Detective (D), Packet Post (E), Inside the Machine (F), and a final integration item (seed list, covers, docs, decisions.md) that runs after all games. Every game owner must also own its tests, cover recipe and games-fit entry. Note shared files (scripts/seed.js SEED_GAMES, locale files) and the rule for them (the integration item edits seed.js; locale keys must be namespaced per owner to avoid conflicts: e.g. "cs.*" for pages, "live.sets.cs.*" for sets).
Return the plan path, the contracts path, a 20-line summary, and the workItems.`, { label: 'synthesize', schema: PLAN_SCHEMA })

const critic = await agent(`${CONTEXT}

${INPUTS}

A plan was synthesized: ${plan.planPath} and ${plan.contractsPath} (work items: ${JSON.stringify(plan.workItems)}). You are the completeness critic. Read the plan, the contracts and the two maps, and answer: what is missing or wrong that would hurt us when we build or ship? Check at least: every CSTA 1B (21) and 2 (31) id appears in the coverage matrix with a real practising activity; lesson timings add up to 45 min; each game's chapters are buildable with the kit per map-games.md (flag anything needing capabilities the sandbox forbids, e.g. network, typing free text shared with others without the safe-text rules, huge assets); the contracts are complete and consistent (slugs, params, set ids, lesson ids all cross-reference); kid-safety for the Robo Route level editor and the capstone sharing; accessibility parity; the 13-language rule for every page string vs English-only lesson content; the Builder capstone's AI budget/turn limits for a class of 30 (quantified per map-teach.md) and what the plan does about it; tests and QA per item; deployment/seeding order; anything a US teacher would find odd (grade bands, period length, device assumptions). Fix small omissions directly in the plan/contracts files (append a "Critic additions" section rather than rewriting) and list what you changed; list mustFix items that need a human decision. Return gaps, mustFix, verdict.`, { label: 'critic', schema: CRITIC_SCHEMA })

return { maps: { games: mapGames, teach: mapTeach }, standards, designs: designs.map(d => ({ angle: d.angle, path: d.path, risks: d.risks })), tally, plan, critic }