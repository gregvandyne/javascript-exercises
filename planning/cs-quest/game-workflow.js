export const meta = {
  name: 'cs-quest-game',
  description: 'Build one CS Quest game end to end: core, chapters, hardening, 3-lens review + fix loop, 11 translations, packs, final gates',
  phases: [
    { title: 'Build core', detail: 'skeleton, engine, first chapters' },
    { title: 'Build rest', detail: 'remaining chapters and modes' },
    { title: 'Harden', detail: 'tests, cover recipe, fit audit' },
    { title: 'Review', detail: 'playtest, safety/standards, code' },
    { title: 'Fix', detail: 'fix findings, re-verify' },
    { title: 'Translate', detail: 'strings list, 11 languages, packs' },
    { title: 'Ship-ready', detail: 'final gates and report' },
  ],
}
const A = args
const BRIEF = '/tmp/claude-0/-home-user-javascript-exercises/db321ed6-437e-588f-beaf-65f7e9b106cd/scratchpad/cs-quest/phase2-brief.md'
const DIR = '/tmp/claude-0/-home-user-javascript-exercises/db321ed6-437e-588f-beaf-65f7e9b106cd/scratchpad/cs-quest'
const WT = `/home/user/javascript-exercises/.worktrees/${A.slug}`
const COMMON = `You are owner ${A.letter} building **${A.title}** (slug \`${A.slug}\`) for the CS Quest program on Oomba Academy.
Work ONLY in the git worktree ${WT} (branch cs-quest/${A.slug}); cd there first. Your local port is ${A.port}.
Read, in this order: (1) ${BRIEF} (whole file); (2) ${DIR}/contract-${A.slug}.json (whole file); (3) ${DIR}/plan.md lines ${A.planRanges} (use sed -n); (4) ${DIR}/map-games.md (whole file; it is the manual for building official games here: kit tag, scanner, fit audit, tests, SDK).
Look at seed-games/code-isle.html (interpreter/sim/verdict pattern, level records), seed-games/atlas-quest.html lines 190-215 (language pack loader) and seed-games/gulp-city.html + tests/unit/gulp-city.test.js (Chromium frame test pattern) in the worktree before you write code.
Non-negotiables: Oomba Kit 1.1.2 byte-exact tag; tap-only, no text inputs; no URLs/@/7+ digit runs/brands/real people in any literal or comment; US spelling; the quest-code keypad and BRB.params; the progress label regex; everything through tr() so it can be translated; commit on the branch with the required trailer lines and push at the end.`
const REPORT = { type: 'object', properties: { summary: { type: 'string' }, done: { type: 'array', items: { type: 'string' } }, notDone: { type: 'array', items: { type: 'string' } }, commits: { type: 'array', items: { type: 'string' } }, pushed: { type: 'boolean' }, tests: { type: 'string' }, openIssues: { type: 'array', items: { type: 'string' } }, crossOwnerRequests: { type: 'array', items: { type: 'string' } } }, required: ['summary', 'done', 'notDone', 'pushed', 'openIssues'] }
const FINDINGS = { type: 'object', properties: { findings: { type: 'array', items: { type: 'object', properties: { severity: { type: 'string', enum: ['blocker', 'major', 'minor'] }, area: { type: 'string' }, what: { type: 'string' }, where: { type: 'string' }, how_to_fix: { type: 'string' } }, required: ['severity', 'what', 'where'] } }, verdict: { type: 'string' } }, required: ['findings', 'verdict'] }

phase('Build core')
const core = await agent(`${COMMON}

STAGE 1 of 7 — build the core. Deliver, committed and pushed:
- seed-games/${A.slug}.html + .json (JSON fields per contract; English description now, l10n later), the Byte Crew character from the contract, title screen (audit-visible start button), chapter map with band toggle (Explorer/Pro), the Quest Card gear with the 4-digit quest-code keypad, BRB.params handling (chapter/band/mode/level/lock) with lock semantics from criticAdditions, HUD, learn cards, hint tiers, stars, Skip after two failed runs, the Case-closed card in lesson mode, projector mode, progress reporting exactly per contract.
- The game engine (${A.engineHint}) and the FIRST ${A.firstChapters} chapters fully playable with all their levels as data in window.${A.levelsGlobal} (level record shape from plan §5.0), each level with learn/hints/check text, random layouts where the contract says so.
- window.__brbTest hooks (start/step/skipAnimations/cover/state + game-specific) deterministic from a seed.
- All user-visible English text through one tr()/strings path (keys are the English text) so later stages can list and translate it; scripts/data/cs-quest/${A.slug}/en.json kept up to date (array of every English string).
- A first tests/unit/${A.slug}.test.js that vm-loads the levels and solves each with sol; make it pass.
Keep the file well under 2 MB and the kit rules from map-games.md (game clock, no own rAF next to Oomba.game, no setTimeout in play). Commit in chunks; push before you return. Report what is done and what is deferred to stage 2.`, { label: `${A.slug}:core`, phase: 'Build core', schema: REPORT })
log(`${A.slug} core: ${core ? core.summary.slice(0, 160) : 'no result'}`)

phase('Build rest')
const rest = await agent(`${COMMON}

STAGE 2 of 7 — finish the content. The core exists on the branch (git log; read seed-games/${A.slug}.html and the test). Stage 1 report: ${JSON.stringify(core && { done: core.done, notDone: core.notDone, openIssues: core.openIssues })}.
Deliver, committed and pushed: every remaining chapter and level in the contract (both bands), the special modes (${A.modesHint}), the Daily Crew Challenge, ${A.pairHint}, chapter crowns, Explorer-stars-silver-for-Pro, the Case-closed card on every level, learn card on level 1 of every chapter, and anything stage 1 deferred. Keep en.json complete. Extend the unit test so every level in every chapter is solved by its sol, starters fail where present, par >= blocks(sol), every csta/csta2 id exists in server/standards/csta-2017.json, and every codec round-trips. Run it green. Report precisely which chapters/levels exist now.`, { label: `${A.slug}:rest`, phase: 'Build rest', schema: REPORT })
log(`${A.slug} rest: ${rest ? rest.summary.slice(0, 160) : 'no result'}`)

phase('Harden')
const hard = await agent(`${COMMON}

STAGE 3 of 7 — harden. Previous reports: ${JSON.stringify({ core: core && core.notDone, rest: rest && { notDone: rest.notDone, openIssues: rest.openIssues } })}.
Deliver, committed and pushed:
1. The real-Chromium frame test inside tests/unit/${A.slug}.test.js (gulp-city pattern): open the game in the production frame wrapper with the kit served from public/vendor/oomba-kit, drive __brbTest to play level 1 of two chapters, assert the BRB score label matches the contract regex, assert no console errors, at 390x844 and 1280x800, in en and ar (RTL). Skips cleanly when there is no Chromium.
2. tests/e2e/${A.slug}.spec.js (kit-pilots pattern) and scripts/covers/${A.slug}.recipe.js (shape in the brief).
3. Fit audit: seed the game into a local DB and run GAMES=${A.slug} node scripts/games-fit-audit.js (all five sizes, title + after Play) and ALSO your densest level/editor screen; fix every failure (controls >= 48 px, data-fit-dense only on grids, no overlap/clipping, no sideways scroll, <= 8 buttons per palette page). Text at 150% (--ok-ts) must still fit.
4. node --test tests/unit/${A.slug}.test.js tests/unit/cs-quest-content-lint.test.js green (the lint's pack-pin test may still skip; the scanner test must pass NOW: fix any scanner fail/flag).
5. Accessibility parity checklist from map-games.md (settings panel, reduced motion, captions/read-aloud of learn cards, keyboard, announce, cvd shapes, left-handed, RTL on menus).
Report the exact commands and their last lines.`, { label: `${A.slug}:harden`, phase: 'Harden', schema: REPORT })
log(`${A.slug} harden: ${hard ? hard.summary.slice(0, 160) : 'no result'}`)

const LENSES = [
  { key: 'playtest', prompt: `Play it like a 9-year-old and like a 13-year-old, for real, in Chromium (playwright-core, executablePath /opt/pw-browsers/chromium, --no-sandbox): seed a local DB, start the server on port ${A.port + 10}, log in as a test kid if needed or use the frame wrapper pattern from tests/unit/gulp-city.test.js, and play the first two levels of EVERY chapter in both bands with real taps and keyboard at 390x844 and 820x1180, plus the quest-code keypad (enter a code from the contract) and a BRB.params lock=1 run. Take screenshots into ${DIR}/review-${A.slug}/ (mkdir). Report: anything a kid could not understand or get stuck on in 18 minutes, dead ends, controls too small, text clipped, unclear verdicts, hints that do not help, misleading stars, timers, anything that is not fun. Severity blocker = cannot finish a level / crash / seed abort; major = confusing or wrong; minor = polish.` },
  { key: 'safety-standards', prompt: `Audit as the kid-safety reviewer AND the computer-science teacher. (1) Run the real scanner on the HTML (node -e with server/services/scanner.js scanVersion) and the content lint; search every string literal and comment for URLs, @, 7+ digit runs, brands, product names, real people, UK spelling, "grown-up ... code" phrasings (LINK_CODE_PROMPT), "what's your address/password" phrasings; confirm there is no text input of any kind and nothing a kid types can be seen by another. (2) Open the contract and server/standards/csta-2017.json and check every chapter's learn cards, checks (Case-closed tiles) and verdict wording against the standards the chapter claims: is the concept taught correctly, is the vocabulary right for the band, does the check actually assess the id? (3) Check the quest-code table, chapter indices, band handling, lock semantics and progress label grammar against the contract. (4) Fit rules (tests/e2e/frame-fit.js): run GAMES=${A.slug} node scripts/games-fit-audit.js yourself.` },
  { key: 'code', prompt: `Review the code as a senior engineer who knows this repo: read seed-games/${A.slug}.html fully. Look for: interpreter/verdict bugs (a wrong program accepted or a right one rejected; test adversarial programs), non-determinism (Math.random/Date.now instead of Oomba.rand/game clock; see stylelint timing rules in map-games.md), own rAF/setTimeout next to Oomba.game, save size (>32 KB Oomba.save / >450 KB BRB.storage), memory leaks across levels, RTL breakage, reduced-motion ignored, missing dir="ltr" on code/numbers, strings bypassing tr(), hard-coded English, label regex violations, chapter-end gameOver missing, params not honoured, keypad visible in live frames, anything violating the kit rules or CSP (inline images, fonts, external URLs). Run the unit test and read its coverage of levels.` },
]
phase('Review')
const reviews = (await parallel(LENSES.map(l => () => agent(`${COMMON}

STAGE 4 of 7 — independent review, lens: ${l.key}. Do NOT edit or commit anything in the worktree (read-only; you may create files under ${DIR}/review-${A.slug}/ and temp DBs under /tmp/claude-0/). Stage reports so far: ${JSON.stringify({ hard: hard && { notDone: hard.notDone, openIssues: hard.openIssues } })}.
${l.prompt}
Be concrete: file, line or selector, what you saw, how to reproduce, how to fix. Default to reporting; the fixer will verify.`, { label: `${A.slug}:review:${l.key}`, phase: 'Review', schema: FINDINGS })))).filter(Boolean)
const all = reviews.flatMap(r => r.findings)
log(`${A.slug} review: ${all.filter(f => f.severity === 'blocker').length} blockers, ${all.filter(f => f.severity === 'major').length} majors, ${all.filter(f => f.severity === 'minor').length} minors`)

phase('Fix')
let findings = all
let fixReport = null
for (let round = 1; round <= 2 && findings.some(f => f.severity !== 'minor'); round++) {
  fixReport = await agent(`${COMMON}

STAGE 5 of 7 — fix round ${round}. Here are the review findings (JSON): ${JSON.stringify(findings)}.
Reproduce each blocker/major before changing anything; fix all blockers and majors, and the minors that are cheap; if a finding is wrong, say why in your report instead of changing code. After fixing: node --test tests/unit/${A.slug}.test.js tests/unit/cs-quest-content-lint.test.js, GAMES=${A.slug} node scripts/games-fit-audit.js, and a quick Chromium playthrough of the levels you touched. Commit and push.`, { label: `${A.slug}:fix${round}`, phase: 'Fix', schema: REPORT })
  const verify = await agent(`${COMMON}

STAGE 5 of 7 — verification after fix round ${round} (read-only, no commits). Findings that were to be fixed: ${JSON.stringify(findings.filter(f => f.severity !== 'minor'))}. Fixer's report: ${JSON.stringify(fixReport)}.
For each blocker/major, reproduce it in Chromium or with the tests on the CURRENT branch state and decide fixed or not. Also run: node --test tests/unit/${A.slug}.test.js tests/unit/cs-quest-content-lint.test.js and GAMES=${A.slug} node scripts/games-fit-audit.js. Return only the findings that are still open (same shape, keep severities) plus any regression you see.`, { label: `${A.slug}:verify${round}`, phase: 'Fix', schema: FINDINGS })
  findings = verify ? verify.findings : []
  log(`${A.slug} after fix round ${round}: ${findings.filter(f => f.severity !== 'minor').length} non-minor open`)
}

phase('Translate')
const strings = await agent(`${COMMON}

STAGE 6 of 7 — strings. Make scripts/data/cs-quest/${A.slug}/en.json the complete, deduplicated list of EVERY user-visible English string in the game (chrome, learn cards, hints, checks, case files, verdict lines, button labels, HUD, keypad, Case-closed card, results), each passing through tr(); fix any string that bypasses tr(). Keep it <= 1,450 entries (trim prose, do not drop meaning). Write ${DIR}/${A.slug}-translation-notes.md for translators: the character names and invented place names that stay untranslated, what each {slot} holds, strings that are button labels (keep short), the band names Explorer/Pro, tone (friendly, grades 3-8), and any term glossary (block names, loop, condition, variable, procedure, packet, protocol, bit, etc. with the natural school term per language if you know it). Run node scripts/cs-quest-i18n.mjs ${A.slug} stub so every <lang>.json exists with empty values. Commit and push.`, { label: `${A.slug}:strings`, phase: 'Translate', schema: REPORT })
const LANGS = ['es', 'fr', 'de', 'it', 'pt', 'nl', 'ru', 'ja', 'zh-Hant', 'he', 'ar']
const NAMES = { es: 'Spanish (Latin American, neutral)', fr: 'French', de: 'German', it: 'Italian', pt: 'Portuguese (Brazil)', nl: 'Dutch', ru: 'Russian', ja: 'Japanese', 'zh-Hant': 'Traditional Chinese (Taiwan)', he: 'Hebrew', ar: 'Arabic (Modern Standard, kid-friendly)' }
const translated = await parallel(LANGS.map(lang => () => agent(`You are a professional game localizer translating a children's computer-science game (grades 3-8) into ${NAMES[lang]}.
Worktree: ${WT}. Read ${DIR}/${A.slug}-translation-notes.md, then scripts/data/cs-quest/${A.slug}/en.json (the English master list) and the stub scripts/data/cs-quest/${A.slug}/${lang}.json.
Fill EVERY value of ${lang}.json with a natural, age-appropriate translation (${lang === 'he' || lang === 'ar' ? 'RTL script; keep {slots} and code/block names exactly; numbers stay Western digits' : 'keep {slots} exactly as in English'}; keep character names and the invented place names; button labels short; school terminology a teacher in that language would use; US-neutral content). Plural strings may be an object {one, other}${lang === 'ru' ? ' (or {one, few, many, other})' : ''}. No empty values, no English left behind except proper names, no added keys.
Write the file with a script in parts if it is long (e.g. Python: load JSON, update a slice of keys, dump with ensure_ascii=False, indent=1) so no single output is enormous. Then run: node scripts/cs-quest-i18n.mjs ${A.slug} check and fix every line that names ${lang} until it reports none for your language. Commit only your file (git add scripts/data/cs-quest/${A.slug}/${lang}.json) with the trailer lines from ${BRIEF} (section "Where you work") and push to the branch cs-quest/${A.slug} (git pull --rebase=false is forbidden; if the push is rejected because another translator pushed, run git pull --no-rebase origin cs-quest/${A.slug} and push again). Return the count of strings translated and any English strings you found ambiguous.`, { label: `${A.slug}:tr:${lang}`, phase: 'Translate' })))
log(`${A.slug}: ${translated.filter(Boolean).length}/11 translators returned`)

phase('Ship-ready')
const final = await agent(`${COMMON}

STAGE 7 of 7 — ship-ready. git pull --no-rebase origin cs-quest/${A.slug} first (translators pushed). Then:
1. node scripts/cs-quest-i18n.mjs ${A.slug} check must say complete; fix any gaps yourself (translate the missing strings in that language).
2. node scripts/cs-quest-i18n.mjs ${A.slug} build; paste the printed PACK_VER/PACK_SRI into the HTML's pack loader (atlas-quest pattern; the HTML must contain PACK_VER = '...', PACK_SRI = {...}; and CsqPacks); verify in Chromium that the game runs in fr and ar with the pack (pack strings appear, RTL menus mirror, code stays LTR) and in en without one.
3. Write the JSON l10n descriptions for all 11 locales in seed-games/${A.slug}.json (gulp-city.json pattern) and the 11-locale assertion in the unit test.
4. Gates, all green: node --test tests/unit/${A.slug}.test.js tests/unit/cs-quest-content-lint.test.js; GAMES=${A.slug} node scripts/games-fit-audit.js; npm test (no NEW failures vs the known list in the brief); npm run i18n:check; the e2e spec if a local server can run it (npx playwright test tests/e2e/${A.slug}.spec.js).
5. Make sure the branch contains no edits to integration-only files (git diff origin/main --stat). Commit, push. Report: commits, test outputs (last lines), chapters/levels table, the five fit sizes, residual issues, crossOwnerRequests.`, { label: `${A.slug}:final`, phase: 'Ship-ready', schema: REPORT })
return { slug: A.slug, core, rest, hard, reviewFindings: all, openAfterFix: findings, strings, translators: translated, final }
