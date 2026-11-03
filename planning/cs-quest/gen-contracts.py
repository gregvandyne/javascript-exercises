#!/usr/bin/env python3
"""CS Quest · contracts generator.

Writes contracts.json (the machine-readable program contract every owner reads) and the in-repo chapter table
seed-lessons/cs-quest/games.json (what tests/unit/cs-quest-catalogue.test.js checks quest codes and step standards against).

Since 3 Nov 2026 (stage 1 of the curriculum slice) the critic additions of plan.md (CA-1 lock chains and the 4.1 / 6.2 Pro
changes, CA-2 standards on the step that evidences them, CA-3 unit-7 step shapes, CA-5 mastery rules + the review items,
CA-8 US spelling / paths / period variants / FAQ, CA-9 6.1 timing) are BAKED INTO THE BASE DATA below. The
`criticAdditions` block is still carried over from the previous contracts.json for the record, and a redundancy check
(`criticAdditions.redundancyCheck`) proves every override it lists is now equal to the base data.

Run:  python3 gen-contracts.py            (CSQ_REPO=<worktree> to point games.json elsewhere)
"""
import json, os, re, datetime

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "contracts.json")
REPO = os.environ.get("CSQ_REPO", "/home/user/javascript-exercises/.worktrees/curriculum")
GAMES_OUT = os.path.join(REPO, "seed-lessons", "cs-quest", "games.json")
SETS_DIR = os.path.join(REPO, "seed-lessons", "cs-quest", "sets")   # owner B's banks (ignored, uncommitted copies locally)
CSTA = json.load(open(os.path.join(HERE, "csta.json")))
IDS = {s["id"] for s in CSTA}
LEVEL = {s["id"]: s["level"] for s in CSTA}

def ids(*xs):
    out = []
    for x in xs:
        for i in (x or "").split():
            assert i in IDS, i
            if i not in out:
                out.append(i)
    return out

LABEL_RE = r"^\d{1,2}/\d{1,2} (levels|cases|tickets|cards), \d{1,3} stars(, \d{1,2}/\d{1,2} checks)?$"

def progress(noun, extra=None):
    p = {
        "today": {
            "afterEachSolvedLevel": {"call": "BRB.score.submit(score, label)", "score": "starsInChapter (integer, monotonic within the chapter; chained chapters add their stars)",
                                      "label": f"'<done>/<total> {noun}, <stars> stars' plus ', <ok>/<n> checks' in lesson mode; must match " + LABEL_RE},
            "onChapterComplete": {"call": "BRB.gameOver({ won: true, score: starsInChapter })"}
        },
        "phase2": {"call": "BRB.progress(detail)", "detail": {"game": "rr|dd|pp|im", "chapter": "<chapter id>", "level": "n", "stars": "0-3", "band": "1|2",
                   "csta": ["<ids of the level>"], "check": "0|1", "confidence": "1-3", "hint": "0-3", "runs": "n", "skipped": "bool"},
                   "limits": "JSON <= 1 KB; keys [a-z][a-zA-Z0-9]{0,23}; values numbers/booleans/[A-Za-z0-9-] strings; one per 2 s; forwarded only with a lesson context"}
    }
    if extra:
        p["today"]["otherModes"] = extra
    return p

# ---------------------------------------------------------------------------------------------------------------- games
GAMES = [
    {
        "slug": "robo-route", "title": "Robo Route", "icon": "🛤️", "cover": "mint", "playersMax": 2, "crew": {"name": "Bolt", "look": "custom 3-layer SVG robot"},
        "kitPacks": ["art-props", "style-bold"], "bands": ["1B", "2"], "noun": "levels",
        "modes": {"0": "play", "1": "debug", "2": "maker", "3": "projector"},
        "chapters": [
            (1, "sequences", "Sequences", "1B", "1B-AP-10 1B-AP-08 1B-AP-11", 6, None),
            (1, "sequences", "Sequences", "2", "2-AP-10 2-AP-13", 6, None),
            (2, "loops", "Loops", "1B", "1B-AP-10", 7, None),
            (2, "loops", "Loops", "2", "2-AP-12", 8, None),
            (3, "conditionals", "Conditionals & events", "1B", "1B-AP-10", 7, None),
            (3, "conditionals", "Conditionals & events", "2", "2-AP-12", 7, None),
            (4, "variables", "Variables", "1B", "1B-AP-09", 6, None),
            (4, "variables", "Variables", "2", "2-AP-11", 6, None),
            (5, "functions", "Functions", "1B", "1B-AP-11 1B-AP-12", 6, None),
            (5, "functions", "Functions", "2", "2-AP-14 2-AP-13 2-AP-19 2-AP-16", 7, None),
            (6, "debug", "Debug Lab", "1B", "1B-AP-15", 7, "debug"),
            (6, "debug", "Debug Lab", "2", "2-AP-17", 7, "debug"),
            (7, "best-route", "Best Route", "1B", "1B-AP-08", 5, None),
            (7, "best-route", "Best Route", "2", "2-AP-10 2-AP-17", 5, None),
            (8, "level-maker", "Level Maker", "1B", "1B-AP-13 1B-AP-12", 3, "maker"),
            (8, "level-maker", "Level Maker", "2", "2-AP-15 2-AP-16", 3, "maker"),
        ],
        "extraProgress": {"maker": "BRB.score.submit(levelsTested, '<made> made, <tested> tested') matching ^\\d{1,2} made, \\d{1,2} tested$"},
        "specifics": {"levelCode": "28-symbol alphabet 23456789BCDFGHJKMNPQRSTVWXYZ, 14-26 symbols, carries the whole level; BFS Check proves solvability and computes par",
                       "randomLayouts": "levels with random:true run on 3 seeded layouts; all must pass",
                       "verdictFlags": ["namesOk", "chipsOk", "planMatch", "editsFromStarter", "perLayout"]}
    },
    {
        "slug": "data-detective", "title": "Data Detective", "icon": "🔎", "cover": "ocean", "playersMax": 2, "crew": {"name": "Dot", "look": "kit fox + dress trench coat"},
        "kitPacks": ["art-props", "dress", "style-bold"], "bands": ["1B", "2"], "noun": "cases",
        "modes": {"0": "play", "2": "tally", "3": "projector"},
        "chapters": [
            (1, "sort", "Sort & Group", "1B", "1B-DA-06", 6, None),
            (2, "chart", "Chart It", "1B", "1B-DA-06", 5, None),
            (3, "claims", "Clues & Claims", "1B", "1B-DA-07", 6, None),
            (4, "cleanup", "Clean-Up Crew", "2", "2-DA-08", 6, None),
            (5, "models", "Model Makers", "2", "2-DA-09", 5, None),
            (6, "fair", "Fair Data", "2", "2-IC-21", 4, None),
            (7, "my-data", "My Data", "1B", "1B-DA-06 1B-DA-07", 3, "tally"),
            (7, "my-data", "My Data", "2", "2-DA-08 2-IC-22", 3, "tally"),
        ],
        "extraProgress": {"tally": "BRB.score.submit(chartsMade, '<n> charts made') matching ^\\d{1,2} charts made$"},
        "specifics": {"showMeRule": "a claim can be pinned only when the evidence view on screen supports it", "views": "DOM table/bars with printed values, never canvas"}
    },
    {
        "slug": "packet-post", "title": "Packet Post", "icon": "📮", "cover": "gold", "playersMax": 1, "crew": {"name": "Pim", "look": "art-animals owl with a satchel"},
        "kitPacks": ["art-props", "art-animals", "art-school", "style-bold"], "bands": ["1B", "2"], "noun": "levels (tricks chapter: cards)",
        "modes": {"0": "play", "2": "wheel", "3": "projector"},
        "chapters": [
            (1, "packets", "Break It Up", "1B", "1B-NI-04", 5, None),
            (1, "packets", "Break It Up", "2", "2-NI-04", 5, None),
            (2, "routes", "Many Roads", "1B", "1B-NI-04", 4, None),
            (2, "routes", "Many Roads", "2", "2-NI-04", 6, None),
            (3, "protocols", "Rules of the Road", "1B", "1B-NI-04", 2, None),
            (3, "protocols", "Rules of the Road", "2", "2-NI-04", 6, None),
            (4, "locks", "Lock It", "1B", "1B-NI-05", 6, None),
            (4, "locks", "Lock It", "2", "2-NI-05 2-IC-23", 7, None),
            (5, "tricks", "Spot the Trick", "1B", "1B-NI-05", 6, None),
            (5, "tricks", "Spot the Trick", "2", "2-NI-05 2-IC-23", 10, None),
            (6, "ciphers", "Secret Messages", "1B", "", 3, None),
            (6, "ciphers", "Secret Messages", "2", "2-NI-06", 7, None),
        ],
        "extraProgress": {"wheel": "no score (tool mode)"},
        "specifics": {"enrichmentOnly": {"ciphers@1B": "no 1B id claimed"}, "safety": "no URLs/emails/@/digit runs; senders are roles; 'mailbox key' not 'password'; cipher word list screened by the 25-shift profanity check"}
    },
    {
        "slug": "inside-the-machine", "title": "Inside the Machine", "icon": "🔧", "cover": "night", "playersMax": 1, "crew": {"name": "Gizmo", "look": "art-animals mouse with dress goggles"},
        "kitPacks": ["art-school", "art-props", "art-animals", "dress", "style-bold"], "bands": ["1B", "2"], "noun": "levels (fixit chapter: tickets)",
        "modes": {"0": "play", "3": "projector"},
        "chapters": [
            (1, "parts", "Parts & Jobs", "1B", "1B-CS-01", 6, None),
            (1, "parts", "Parts & Jobs", "2", "1B-CS-01", 6, None),
            (2, "hw-sw", "Hardware or Software", "1B", "1B-CS-02", 5, None),
            (2, "hw-sw", "Hardware or Software", "2", "1B-CS-02", 5, None),
            (3, "fixit", "Fix-It Desk", "1B", "1B-CS-03", 7, None),
            (3, "fixit", "Fix-It Desk", "2", "2-CS-03", 7, None),
            (4, "bits", "Bits & Pixels", "1B", "1B-CS-02", 5, None),
            (4, "bits", "Bits & Pixels", "2", "2-DA-07", 7, None),
            (5, "gadget", "Design a Gadget", "2", "2-CS-02 2-CS-01", 5, None),
            (6, "design-lab", "Design Lab", "1B", "1B-IC-19", 3, None),
            (6, "design-lab", "Design Lab", "2", "2-CS-01 2-IC-21", 5, None),
        ],
        "extraProgress": None,
        "specifics": {"enrichmentOnly": {"bits@1B": "binary is enrichment; items tagged 1B-CS-02 (storage in the system model)"}, "flowchart": "band-2 fixit builds the flowchart first (builds toward 2-AP-10)"}
    },
]

LOCK_SEMANTICS = {
    "lock=1": "band locked; chapter map and band toggle hidden; start at `chapter`; at chapter end lesson mode continues into the lesson's `then` chapter for the band (levels as given), else the kit results screen and Back to class",
    "then": "declared per lesson in mainActivity.then = { chapter, levels: 'a-b', stretch?, enrichment? } and per band in each game's level data so the quest code (one chapter digit) gets the same chain",
    "scoreUnderChain": "chained chapters add their stars to score (still monotonic); the label keeps the locked chapter's noun and totals, so the gradebook cell always reads the locked chapter",
    "ciClauseFPrime": "a game step's standards is a subset of the union of the csta of its chapter and of its then chapter for the band",
    "questCodeCannotLock": "params win over codes; a typed quest code opens the chapter with the band toggle still visible",
}

games_out = []
CHAPTER = {}   # (slug, id, band) -> chapter row
for g in GAMES:
    chapters = []
    for idx, cid, title, band, csta, levels, mode in g["chapters"]:
        ch = {"index": idx, "id": cid, "title": title, "band": band, "csta": ids(csta) if csta else [], "levels": levels}
        if mode:
            ch["mode"] = mode
        if not csta:
            ch["enrichment"] = True
        chapters.append(ch)
        CHAPTER[(g["slug"], cid, band)] = ch
    games_out.append({
        "slug": g["slug"], "title": g["title"], "icon": g["icon"], "cover": g["cover"], "category": "learning", "featured": True,
        "orientation": "any", "players_max": g["playersMax"], "age_rating": "everyone", "crew": g["crew"], "kit": "1.1.2", "kitPacks": g["kitPacks"],
        "bands": g["bands"], "bandNames": {"1B": "Explorer", "2": "Pro"}, "chapters": chapters,
        "params": {"chapter": "one of chapters[].id", "band": "1b | 2", "mode": "one of modes (default play)", "level": "1-30 (optional)", "lock": "0 | 1 (hides chapter map and band toggle; see lockSemantics)"},
        "lockSemantics": LOCK_SEMANTICS,
        "modes": g["modes"],
        "questCode": "C B M L: C = chapters[].index (0 = map), B = 1 Explorer | 2 Pro, M = modes key, L = level 0-9 (0 = first unfinished); typed on the in-game keypad; params win over codes",
        "progressEvents": progress(g["noun"], g["extraProgress"]),
        "testHooks": ["__brbTest.start({chapter, band, mode, level, seed, lesson})", "step(n)", "skipAnimations()", "cover()", "state()"],
        "files": {
            "game": [f"seed-games/{g['slug']}.html", f"seed-games/{g['slug']}.json"],
            "strings": [f"scripts/data/cs-quest/{g['slug']}/<lang>.json", f"public/vendor/data/{g['slug']}/<version>/<lang>.js"],
            "cover": f"scripts/covers/{g['slug']}.recipe.js",
            "tests": [f"tests/unit/{g['slug']}.test.js", f"tests/e2e/{g['slug']}.spec.js"]
        },
        "stringBudget": {"chrome": 450, "levelText": 1000, "total": 1450},
        "lessonModeDefaults": {"music": "off", "captions": "on"},
        "specifics": g["specifics"],
    })
MODE_INDEX = {g["slug"]: {v: k for k, v in g["modes"].items()} for g in GAMES}

# ----------------------------------------------------------------------------------------------------------------- sets
SET_TAGS = {
    ("1", "1B"): "1B-AP-10 1B-AP-08 1B-AP-09 1B-AP-11 1B-AP-12",
    ("2", "1B"): "1B-AP-15 1B-AP-16 1B-AP-13 1B-AP-17",
    ("3", "1B"): "1B-DA-06 1B-DA-07 1B-IC-20",
    ("4", "1B"): "1B-NI-04 1B-NI-05",
    ("5", "1B"): "1B-CS-01 1B-CS-02 1B-CS-03",
    ("6", "1B"): "1B-IC-18 1B-IC-19 1B-IC-20 1B-IC-21 1B-AP-14",
    ("7", "1B"): "1B-AP-13 1B-AP-16 1B-AP-11 1B-AP-15 1B-IC-20 1B-AP-17 1B-AP-14",
    ("1", "2"): "2-AP-10 2-AP-13 2-AP-12 2-AP-11 2-AP-14",
    ("2", "2"): "2-AP-17 2-AP-18 2-AP-19 2-AP-15",
    ("3", "2"): "2-DA-08 2-DA-09 2-IC-22",
    ("4", "2"): "2-NI-04 2-NI-05 2-IC-23 2-NI-06",
    ("5", "2"): "2-CS-02 2-CS-01 2-CS-03 2-DA-07",
    ("6", "2"): "2-IC-20 2-IC-21 2-CS-01 2-IC-23 2-AP-16",
    ("7", "2"): "2-AP-18 2-AP-13 2-AP-10 2-AP-17 2-AP-15 2-DA-09 2-IC-22 2-AP-19 2-AP-16",
}
UNIT_NAMES = {1: "Think Like a Robot", 2: "Bug Hunters", 3: "Data Detectives", 4: "Packet Post", 5: "Inside the Machine", 6: "Tech Choices", 7: "Make Your Own Game"}
UNIT_TOOL = {1: "robo-route", 2: "robo-route", 3: "data-detective", 4: "packet-post", 5: "inside-the-machine", 6: "would-you-rather-live + inside-the-machine + data-detective", 7: "builder (Quiz Show template)"}
# Plan counts (section 6.1: 101 per band) plus the CA-5 review items and B's two extra ones (1B-AP-08 and 1B-AP-12 had one
# item each in the plan, so one review item apiece still left them under the ">= 3 bank items per id" rule).
PLAN_COUNTS = {1: 21, 2: 11, 3: 13, 4: 13, 5: 13, 6: 13, 7: 17}
REVIEW_ADDS = {
    "1b-1.1-r2": ("csq-u1-1b", "1B-AP-08", "CA-5"), "1b-1.1-r3": ("csq-u1-1b", "1B-AP-08", "B: third item for 1B-AP-08"),
    "1b-1.5-r2": ("csq-u1-1b", "1B-AP-12", "CA-5"), "1b-1.5-r3": ("csq-u1-1b", "1B-AP-12", "B: third item for 1B-AP-12"),
    "1b-6.3-r2": ("csq-u6-1b", "1B-AP-14", "CA-5"), "2-6.3-r2": ("csq-u6-2", "2-AP-16", "CA-5"), "2-5.1-r2": ("csq-u5-2", "2-CS-01", "CA-5"),
}
sets_out = []
for u in range(1, 8):
    for band, bl in (("1B", "1b"), ("2", "2")):
        sid = f"csq-u{u}-{bl}"
        adds = [k for k, v in REVIEW_ADDS.items() if v[0] == sid]
        grades = "3-5" if band == "1B" else "6-8"
        sets_out.append({
            "id": sid, "kind": "quiz", "unit": u, "band": band,
            "title": f"CSQ Unit {u} · {UNIT_NAMES[u]} ({grades})",
            "modes": ["quest-race", "battle", "board"] if band == "1B" else ["battle", "quest-race", "board"],
            "cstaTags": ids(SET_TAGS[(str(u), band)]), "questionCount": PLAN_COUNTS[u] + len(adds), "planCount": PLAN_COUNTS[u], "reviewAdds": adds,
            "file": f"seed-lessons/cs-quest/sets/u{u}-{bl}.json",
            "itemSchema": {"id": f"{bl}-<lesson>-e<n> | {bl}-<lesson>-r<n> | {bl}-u{u}-o1", "lesson": "u.n", "use": "exit | review | opener", "cat": "one CSTA id, a primary id of the item's lesson", "topic": "lesson short name (Brain Board column)", "kind": "recall | apply | analyze", "secs": "15 | 20", "q": "<= 300", "choices": "4 x <= 120 (right answer position varies)", "answer": "index"},
            "derived": {"warmup": f"5 items per lesson (ids in the lesson JSON warmup.items) hosted in {'quest-race' if band == '1B' else 'battle'} at 15 s, shuffle off; title 'CSQ <u.n> warm-up · <short> ({grades})'",
                        "exit": f"3 exit items per lesson -> quiz step (cat kept) or battle 20 s or paper; title 'CSQ <u.n> exit ticket ({grades})'",
                        "review": f"all items with cat replaced by topic -> board; title 'CSQ Unit {u} review ({grades})'"},
            "subject": "cs-quest",
        })
sets_out.append({"id": "wyr-tech", "kind": "wyr", "unit": 6, "band": "both", "title": "Tech choices", "modes": ["wyr"], "starter": "wyr:tech:8:20", "blockDayStarter": "wyr:tech:10:20",
                 "cstaTags": ids("1B-IC-18 2-IC-20 2-IC-23 1B-IC-19 2-IC-21 1B-AP-14 2-AP-16"), "questionCount": 20,
                 "files": ["scripts/data/would-you-rather/en.json (+ 12 locale files, English fallback per item)", "scripts/data/would-you-rather/ui.json (cat.tech x13)", "seed-lessons/cs-quest/wyr-tech.json (prompts + csta)"],
                 "rules": "a/b text <= 60 chars; tags from TAGS; no brands, names, URLs; no runs of 2+ digits (tech-13 '3D printer' is allowed)"})
sets_out.append({"id": "wyr-online", "kind": "wyr", "unit": 6, "band": "both", "title": "Online: share or keep", "modes": ["wyr"], "starter": "wyr:online:8:20",
                 "cstaTags": ids("2-IC-23 1B-IC-21 1B-NI-05 2-NI-05 1B-AP-14"), "questionCount": 10,
                 "files": ["scripts/data/would-you-rather/en.json", "scripts/data/would-you-rather/ui.json (cat.online x13)", "seed-lessons/cs-quest/wyr-tech.json"],
                 "rules": "same as wyr-tech"})

# -------------------------------------------------------------------------------------------------------------- lessons
def then(chapter, levels, **kw):
    d = {"chapter": chapter, "levels": levels}
    d.update(kw)
    return d

def game(slug, chapter, code, mode=None, extra=None):
    band = "1b" if code[1] == "1" else "2"
    params = f"chapter={chapter}&band={band}" + (f"&mode={mode}" if mode else "") + "&lock=1"   # canonical key order (play-params.js)
    d = {"type": "game", "slug": slug, "chapter": chapter, "params": params, "questCode": " ".join(code)}
    if mode:
        d["mode"] = mode
    if extra:
        d.update(extra)
    return d

def live(starter, minutes):
    return {"type": "discussion", "slug": "would-you-rather-live", "liveMode": "wyr", "starter": starter, "minutes": minutes, "params": f"/live?mode=wyr&starter={starter}&class=<classId>"}

# (unit, n, title, short, {band: (primary, also, buildsToward, mainActivity)})  — titles US-spelled (CA-8)
LESSONS = [
    (1, 1, "Step by step (Sequences)", "Sequences", {
        "1B": ("1B-AP-10 1B-AP-08", "1B-AP-11", "", game("robo-route", "sequences", "1100")),
        "2": ("2-AP-10 2-AP-13", "", "", game("robo-route", "sequences", "1200"))}),
    (1, 2, "Again and again (Loops)", "Loops", {
        "1B": ("1B-AP-10", "1B-AP-16", "", game("robo-route", "loops", "2100")),
        "2": ("2-AP-12", "", "", game("robo-route", "loops", "2200"))}),
    (1, 3, "If this, then that (Conditionals and events)", "Conditionals", {
        "1B": ("1B-AP-10", "", "", game("robo-route", "conditionals", "3100")),
        "2": ("2-AP-12", "", "", game("robo-route", "conditionals", "3200"))}),
    (1, 4, "Counting and remembering (Variables)", "Variables", {
        "1B": ("1B-AP-09", "", "", game("robo-route", "variables", "4100")),
        "2": ("2-AP-11", "", "", game("robo-route", "variables", "4200"))}),
    (1, 5, "Build a block (Functions, decomposition, remix)", "Functions", {
        "1B": ("1B-AP-11 1B-AP-12", "", "", game("robo-route", "functions", "5100")),
        "2": ("2-AP-14 2-AP-13", "2-AP-16 2-AP-19", "", game("robo-route", "functions", "5200"))}),
    (2, 1, "Bug hunt (Test and debug)", "Debugging", {
        "1B": ("1B-AP-15", "1B-AP-08", "", game("robo-route", "debug", "6110", "debug")),
        "2": ("2-AP-17", "2-AP-10", "", game("robo-route", "debug", "6210", "debug"))}),
    (2, 2, "Level designers (Plan, build, test, explain)", "Level design", {
        "1B": ("1B-AP-13 1B-AP-16 1B-AP-17", "1B-AP-12", "", game("robo-route", "level-maker", "8120", "maker")),
        "2": ("2-AP-15 2-AP-18 2-AP-19", "2-AP-16", "", game("robo-route", "level-maker", "8220", "maker"))}),
    (3, 1, "Sort it out (Organize data)", "Sorting data", {
        "1B": ("1B-DA-06", "", "", game("data-detective", "sort", "1100")),
        "2": ("2-DA-08", "", "", game("data-detective", "cleanup", "4200"))}),
    (3, 2, "What does the data say? (Claims, predictions, models)", "Predictions", {
        "1B": ("1B-DA-07", "", "", game("data-detective", "claims", "3100")),
        "2": ("2-DA-09", "", "", game("data-detective", "models", "5200"))}),
    (3, 3, "Our class survey (Collect, chart, claim)", "Surveys", {
        "1B": ("1B-DA-06 1B-DA-07 1B-IC-20", "", "", game("data-detective", "my-data", "7120", "tally", {"collect": "paper slips"})),
        "2": ("2-DA-08 2-IC-22", "2-DA-09", "", game("data-detective", "my-data", "7220", "tally", {"collect": "paper slips or one WYR Live round"}))}),
    (4, 1, "How a message travels (Packets, routes, protocols)", "Packets", {
        "1B": ("1B-NI-04", "", "", game("packet-post", "packets", "1100", None, {"then": then("routes", "1-4"), "unpluggedFirst": "Envelope Relay"})),
        # CA-1: the locked chapter is protocols; routes level 5 (hop budget) is the Pro Explore demo; routes 5-6 is the stretch via then.
        "2": ("2-NI-04", "", "", game("packet-post", "protocols", "3200", None, {"then": then("routes", "5-6", stretch=True), "exploreDemo": {"chapter": "routes", "level": 5}, "unpluggedFirst": "Envelope Relay"}))}),
    (4, 2, "Lock it up (Passphrases, private information, security)", "Passphrases", {
        "1B": ("1B-NI-05", "", "", game("packet-post", "locks", "4100")),
        "2": ("2-NI-05 2-IC-23", "", "", game("packet-post", "locks", "4200"))}),
    (4, 3, "Secret messages (Spotting tricks, ciphers)", "Secret messages", {
        "1B": ("1B-NI-05", "", "", game("packet-post", "tricks", "5100", None, {"then": then("ciphers", "1-3", enrichment=True)})),
        "2": ("2-NI-06", "2-NI-05 2-IC-23", "", game("packet-post", "ciphers", "6200", None, {"then": then("tricks", "7-10")}))}),
    (5, 1, "What's inside? (Parts, hardware and software, gadgets)", "Parts", {
        "1B": ("1B-CS-01 1B-CS-02", "", "", game("inside-the-machine", "parts", "1100", None, {"then": then("hw-sw", "1-3")})),
        "2": ("2-CS-02 2-CS-01", "", "", game("inside-the-machine", "gadget", "5200"))}),
    (5, 2, "It's not working! (Troubleshooting)", "Troubleshooting", {
        "1B": ("1B-CS-03", "", "", game("inside-the-machine", "fixit", "3100")),
        "2": ("2-CS-03", "", "2-AP-10", game("inside-the-machine", "fixit", "3200"))}),
    (5, 3, "Bits and pixels (How computers store things)", "Bits and pixels", {
        "1B": ("1B-CS-02", "", "", game("inside-the-machine", "bits", "4100", None, {"enrichment": "binary"})),
        "2": ("2-DA-07", "", "", game("inside-the-machine", "bits", "4200"))}),
    (6, 1, "Tech that changed the world", "Tech changes", {
        # CA-9: no live warm-up; 8 dilemmas at 20 s (defend on every other reveal); Today 27 (Do Now, Timeline Walk 10 min, discuss) · WYR 13 · Exit 3 · Question 2.
        "1B": ("1B-IC-18", "", "", live("wyr:tech:8:20", 13)),
        "2": ("2-IC-20", "", "", live("wyr:tech:8:20", 13))}),
    (6, 2, "Made for everyone (Accessibility, usability, bias)", "For everyone", {
        "1B": ("1B-IC-19 1B-IC-20", "", "", game("inside-the-machine", "design-lab", "6100", None, {"also": "settings-panel audit sheet on any kit game (the first 4 minutes of Play)"})),
        # CA-1: two Play steps for Pro: Play A Design Lab (10 min, 2-CS-01; the audit sheet is its first 4 minutes) and Play B Fair Data (8 min, 2-IC-21).
        "2": ("2-IC-21 2-CS-01", "", "", game("inside-the-machine", "design-lab", "6200", None, {"minutes": 10, "second": dict(game("data-detective", "fair", "6200"), minutes=8)}))}),
    (6, 3, "Share or keep? (Public vs private, using others' work)", "Share or keep", {
        "1B": ("1B-IC-21 1B-AP-14", "1B-NI-05", "", live("wyr:online:8:20", 18)),
        "2": ("2-IC-23 2-AP-16", "", "", live("wyr:online:8:20", 18))}),
    (7, 1, "Plan your game", "Plan", {
        "1B": ("1B-AP-13 1B-AP-16 1B-AP-11", "", "", {"type": "unplugged", "artifact": "planning sheet", "steps": "3 question steps"}),
        "2": ("2-AP-18 2-AP-13 2-AP-10", "2-AP-15", "", {"type": "unplugged", "artifact": "planning sheet", "steps": "3 question steps"})}),
    (7, 2, "Build day", "Build", {
        "1B": ("1B-AP-15", "", "1B-AP-09 1B-AP-10", {"type": "builder", "template": "quiz", "prefill": "the sheet's Builder message (<= 300 chars) pasted first into the build step body", "paperPath": True, "shape": "one good message, then one fix; paper prototyping first for the teams not yet approved"}),
        "2": ("2-AP-17", "", "2-AP-11 2-AP-12", {"type": "builder", "template": "quiz", "prefill": "the sheet's Builder message (<= 300 chars) pasted first into the build step body", "paperPath": True, "shape": "one good message, then one fix; paper prototyping first for the teams not yet approved"})}),
    (7, 3, "Playtest party", "Playtest", {
        "1B": ("1B-IC-20 1B-AP-15", "1B-AP-16", "", {"type": "discussion", "protocol": "peer playtest, 3 x 5 min", "steps": "text + question"}),
        "2": ("2-AP-15 2-DA-09 2-IC-22", "", "", {"type": "discussion", "protocol": "peer playtest, 3 x 5 min, tally in data-detective my-data", "steps": "text + question"})}),
    (7, 4, "Show and credit", "Credits", {
        "1B": ("1B-AP-17 1B-AP-14", "1B-IC-21", "", {"type": "discussion", "protocol": "demo circles", "steps": "question (credits & how-to)"}),
        "2": ("2-AP-19 2-AP-16", "", "", {"type": "discussion", "protocol": "demo circles", "steps": "question (credits, how-to, how it works)"})}),
]

# CA-2: standards live on the step that evidences them (game step, "In your own words" question step). Default: both = the primary ids.
STEP_STANDARDS = {
    "csq-1b-2.2": ("1B-AP-13 1B-AP-12", "1B-AP-16 1B-AP-17"),
    "csq-2-2.2": ("2-AP-15 2-AP-16", "2-AP-18 2-AP-19"),
    "csq-1b-3.3": ("1B-DA-06 1B-DA-07", "1B-IC-20"),
    "csq-1b-6.2": ("1B-IC-19", "1B-IC-20"),
}
# The capstone rubric (plan section 8.3); marked 0-3 per line on the lesson progress page (P11). "Program" counts as evidence for nothing.
CAPSTONE_LINES = [
    {"line": "Plan", "1B": ids("1B-AP-13 1B-AP-11"), "2": ids("2-AP-13 2-AP-10 2-AP-15")},
    {"line": "Roles / timeline", "1B": ids("1B-AP-16"), "2": ids("2-AP-18")},
    {"line": "Program", "buildsToward": ids("1B-AP-09 1B-AP-10 2-AP-11 2-AP-12"), "countsAsEvidence": False, "1B": [], "2": []},
    {"line": "Test with others", "1B": ids("1B-AP-15 1B-IC-20"), "2": ids("2-AP-17 2-AP-15 2-DA-09 2-IC-22")},
    {"line": "Explain & credit", "1B": ids("1B-AP-17 1B-AP-14 1B-IC-21"), "2": ids("2-AP-19 2-AP-16")},
]
def cap_line(name, band):
    l = next(x for x in CAPSTONE_LINES if x["line"] == name)
    return {"line": name, "ids": l[band], "levels": 4}

def today(minutes=17):
    return {"kind": "text", "title": "Today", "minutes": minutes, "body": "Do Now · big idea · the discuss prompts (kid-readable, no program name, no codes)"}
def warm_step(band):
    return {"kind": "game", "title": "Warm-up (live)", "minutes": 5, "gameSlug": "quest-race" if band == "1B" else "question-battle", "playHidden": True, "live": "warmup"}
def exit_step(setid, items):
    return {"kind": "quiz", "title": "Exit ticket", "minutes": 3, "setId": setid, "items": items, "fallbackWhenQuizStepsOff": "text step 'Exit ticket (paper or live)' + Host exit ticket live / printed half-sheet"}
def words_step(standards, rubric_ids):
    return {"kind": "question", "title": "In your own words", "minutes": 2, "standards": standards,
            "rubric": [{"ids": [i], "levels": 4} for i in rubric_ids], "body": "the sentence prompt + its frame (lesson JSON exit.sentencePrompt / exit.frame)"}
def game_step(title, minutes, m, standards):
    return {"kind": "game", "title": title, "minutes": minutes, "gameSlug": m["slug"], "options": m["params"], "questCode": m["questCode"], "standards": standards}
def question_step(title, minutes, standards, rubric=None):
    d = {"kind": "question", "title": title, "minutes": minutes, "standards": standards}
    if rubric:
        d["rubric"] = rubric
    return d

def chapter_title(m):
    for b in ("1B", "2"):
        ch = CHAPTER.get((m["slug"], m["chapter"], b))
        if ch:
            return ch["title"]
    raise KeyError((m["slug"], m["chapter"]))

def allowed_ids(m, band):
    """f': the ids a game step may claim = its chapter's csta ∪ its then chapter's csta, for the band."""
    out = set(CHAPTER[(m["slug"], m["chapter"], band)]["csta"])
    t = m.get("then")
    if t:
        out |= set(CHAPTER[(m["slug"], t["chapter"], band)]["csta"])
    return out

lessons_out = []
order = 0
by_unit = {}
for u, n, title, short, bands in LESSONS:
    by_unit.setdefault(u, []).append(n)
for u, n, title, short, bands in LESSONS:
    order += 1
    for band, bl in (("1B", "1b"), ("2", "2")):
        primary, also, toward, main = bands[band]
        key = f"csq-{bl}-{u}.{n}"
        grades = "3-5" if band == "1B" else "6-8"
        first = by_unit[u][0] == n
        prev = None if first else f"{u}.{by_unit[u][by_unit[u].index(n) - 1]}"
        own = f"{u}.{n}"
        setid = f"csq-u{u}-{bl}"
        prim = ids(primary)
        no_warm = (u, n) in ((7, 2), (6, 1))          # 7.2: Builder queue budget; 6.1: CA-9 timing
        if (u, n) == (6, 2):
            # 6.1 has no warm-up, so 6.2 opens the unit's warm-ups with the opener (CA-9 / criticAdditions.lessonOverrides)
            warm = [f"{bl}-u{u}-o1", f"{bl}-6.1-e1", f"{bl}-6.2-r1", f"{bl}-6.2-e1", f"{bl}-6.1-r1"]
        elif first:
            warm = [f"{bl}-u{u}-o1", f"{bl}-{own}-r1", f"{bl}-{own}-e1", f"{bl}-{own}-e2", f"{bl}-{own}-e3"]
        else:
            warm = [f"{bl}-{prev}-e1", f"{bl}-{prev}-e2", f"{bl}-{own}-r1", f"{bl}-{own}-e1", f"{bl}-{prev}-r1"]
        if no_warm:
            warm = []
        exit_items = [f"{bl}-{own}-e1", f"{bl}-{own}-e2", f"{bl}-{own}-e3"]
        play_std, words_std = STEP_STANDARDS.get(key, (primary, primary))
        play_std, words_std = ids(play_std), ids(words_std)

        steps = [today(27 if (u, n) == (6, 1) else 17)]
        if (u, n) == (7, 2):
            steps.append({"kind": "text", "title": "Builder etiquette", "minutes": 5, "body": "the etiquette card (plan 8.2): one change per message, say what you saw and expected, play after every change, never type names, resting = paper"})
        elif not no_warm:
            steps.append(warm_step(band))
        if main["type"] == "game":
            if main.get("second"):
                steps.append(game_step(f"Play A: {chapter_title(main)}", main["minutes"], main, play_std[1:2] if key == "csq-2-6.2" else play_std))
                sec = main["second"]
                steps.append(game_step(f"Play B: {chapter_title(sec)}", sec["minutes"], sec, play_std[0:1]))
            else:
                steps.append(game_step(f"Play: {chapter_title(main)}", 18, main, play_std))
        elif main["type"] == "discussion" and main.get("slug"):
            steps.append({"kind": "game", "title": "Would You Rather (live)", "minutes": main["minutes"], "gameSlug": "would-you-rather-live", "playHidden": True, "live": "wyr", "starter": main["starter"]})
        elif (u, n) == (7, 1):
            steps += [question_step("Who and what", 6, cap_line("Plan", band)["ids"], [cap_line("Plan", band)]),
                      question_step("Parts and the rule", 6, cap_line("Plan", band)["ids"], [cap_line("Plan", band)]),
                      question_step("Roles, timeline and test plan" if band == "2" else "Roles and test plan", 6, cap_line("Roles / timeline", band)["ids"], [cap_line("Roles / timeline", band)])]
            steps[-1]["note"] = "ends with the Builder message (<= 300 chars) the teacher pastes into 7.2's build step"
        elif (u, n) == (7, 2):
            steps.append({"kind": "build", "title": "Build your game", "minutes": 18, "template": "quiz", "standards": prim,
                          "rubric": [cap_line("Program", band)], "body": "the team's Builder message first (first 300 chars = the Studio prefill), then the etiquette card"})
        elif (u, n) == (7, 3):
            steps += [{"kind": "text", "title": "Playtest protocol", "minutes": 3, "body": "plan 8.4: hand in first; 3 rotations of 5 minutes; Player / Watcher / Note-taker; be specific, be kind, say what not who"},
                      question_step("Tally and the one change", 15, prim, [cap_line("Test with others", band)])]
        elif (u, n) == (7, 4):
            steps.append(question_step("Credits, How-to and How it works" if band == "2" else "Credits and How-to", 18, prim, [cap_line("Explain & credit", band)]))
        else:
            raise ValueError(key)
        steps.append(exit_step(setid, exit_items))
        steps.append(words_step(words_std, prim))
        assert sum(s["minutes"] for s in steps) == 45, (key, [(s["title"], s["minutes"]) for s in steps])

        # f': a game step claims only ids its chapter (or its then chapter) carries for the band
        for s in steps:
            if s["kind"] == "game" and s.get("standards"):
                m = main["second"] if s["title"].startswith("Play B") else main
                assert set(s["standards"]) <= allowed_ids(m, band), (key, s["title"], s["standards"], sorted(allowed_ids(m, band)))
            if s["kind"] == "game" and s.get("questCode"):
                m = main["second"] if s["title"].startswith("Play B") else main
                c, b, mo, lv = s["questCode"].split()
                ch = CHAPTER[(m["slug"], m["chapter"], band)]
                assert int(c) == ch["index"] and b == ("1" if band == "1B" else "2") and mo == MODE_INDEX[m["slug"]][m.get("mode", "play")] and lv == "0", (key, s["questCode"])
        # every primary id has Practiced evidence (a step's standards) and Applied evidence (a rubric line) somewhere in the lesson
        practiced = {i for s in steps for i in s.get("standards", [])}
        applied = {i for s in steps for r in s.get("rubric", []) for i in r["ids"]}
        assert set(prim) <= practiced, (key, prim, practiced)
        assert set(prim) <= applied, (key, prim, applied)

        lessons_out.append({
            "id": key, "key": key, "unit": u, "order": order, "n": own, "band": band, "bandCode": bl, "grade": f"Grades {grades}",
            "title": f"CS Quest {own} · {title}", "name": title, "short": short, "duration": 45, "version": 1,
            "csta": prim, "also": ids(also) if also else [], "buildsToward": ids(toward) if toward else [],
            "warmupSetId": None if no_warm else setid, "warmupItems": warm,
            "warmupMode": None if no_warm else ("quest-race" if band == "1B" else "battle"),
            "warmupDefault": "projector" if (u, n) in ((1, 1), (1, 2)) else "live",
            "mainActivity": main,
            "exitTicketSetId": setid, "exitItems": exit_items,
            "derivedSets": {"warmup": None if no_warm else f"CSQ {own} warm-up · {short} ({grades})", "exit": f"CSQ {own} exit ticket ({grades})", "review": f"CSQ Unit {u} review ({grades})"},
            "steps": steps, "printable": True,
            "shortPeriod40": "projector warm-up with 2 items, one Discuss prompt, Play 16, never cut the exit ticket (the lesson JSON holds the 40-minute table)",
            "file": f"seed-lessons/cs-quest/lessons/{own}-{bl}.json",
        })

# ------------------------------------------------------------------------------------------------------------- program
PATHS = [
    {"id": "core10-no-builder", "title": "Core 10 (no Builder)", "default": True, "lessons": ["1.2", "1.3", "2.1", "2.2", "3.1", "3.2", "4.1", "4.2", "5.2", "6.1"],
     "note": "ten periods, no school plan needed; the program page lists the ids it misses"},
    {"id": "full", "title": "Full", "lessons": [f"{u}.{n}" for u in range(1, 8) for n in by_unit[u]], "note": "23 periods; unit 7 needs a school plan (optional: skip it or add it later with Add unit)"},
    {"id": "cs-ed-week", "title": "CS Ed Week", "lessons": ["1.1", "1.2", "2.1", "4.1", "6.1"], "note": "five periods, no Builder"},
    {"id": "device-first", "title": "Device-first", "lessons": ["5.2", "5.1", "5.3", "1.1", "1.2", "1.3", "1.4", "1.5", "2.1", "2.2", "3.1", "3.2", "3.3", "4.1", "4.2", "4.3", "6.1", "6.2", "6.3", "7.1", "7.2", "7.3", "7.4"],
     "note": "Computing Systems first settles device routines; Fix-It ticket 3 'no sound' is the class's own device test"},
]
PERIOD = [["0:00", 5, "Arrive, log in, Do Now"], ["0:05", 5, "Warm-up (live or projector)"], ["0:10", 6, "Explore (projector script)"], ["0:16", 18, "Play"], ["0:34", 6, "Discuss"], ["0:40", 5, "Exit ticket + pack up"]]
PERIOD_VARIANTS = {
    "short40": {"rule": "projector warm-up with 2 items, one Discuss prompt, Play 16 minutes, never cut the exit ticket",
                "table": [["0:00", 4, "Do Now"], ["0:04", 3, "Warm-up on the projector (2 items)"], ["0:07", 5, "Explore"], ["0:12", 16, "Play"], ["0:28", 6, "Discuss (one prompt)"], ["0:34", 6, "Exit ticket + pack up"]]},
    "block80-90": {"rule": "the lesson + the unplugged twin + the 3-star stretch (+ the unit review on Brain Board)"},
    "lesson6.1": "Today 27 (Do Now 5, Timeline Walk 10, discuss) · Would You Rather (live) 13 · Exit 3 · In your own words 2",
    "lesson7.2": "Do Now 5 · etiquette 4 · build or paper prototype 30 (two rotations) · Discuss 1 · Exit 5",
}
RULES = [
    "The program is sold as 45 minutes; every plan page documents the 40-minute cut.",
    "The first two periods lose 3-5 minutes to login: run the Do Now longer, cut Discuss to one prompt, never the exit ticket.",
    "Early finishers always have the same two moves: earn 3 stars, or help a neighbor without touching their screen (a role).",
    "Nothing depends on homework.",
    "Shared devices: alternate who signs in (odd lessons partner A, even lessons partner B); the Standards tab counts the signed-in student only and says so.",
    "Lesson mode starts with music off and captions on; headphones recommended.",
    "Kids never see the program name in a game or a standard code anywhere; teachers see 'CS Quest · CSTA 1B/2'.",
    "Lesson text says 'trusted adult'; in-game text keeps 'grown-up' (never within 40 characters of the word 'code').",
    "US spelling everywhere in lesson content, bank items and in-game English (color, gray, favorite, labeled, practiced, neighbor, recognize, math, catalog, center).",
]
MATERIALS = ["projector", "one device per pair (grades 3-5) or per student (grades 6-8)", "headphones", "login cards (/cards/:k)", "the lesson's printables (plan page > Printables)", "paper and pencils for the Do Now and the exit half-sheet"]
FAQ = [
    "Classes and lessons live inside a school on Oomba; set one up for free (one teacher is enough).",
    "Chromebooks without touch work: everything is click-or-tap plus keyboard.",
    "Headphones recommended; lesson mode starts with music off and captions on.",
    "No CS background needed: every plan page has a projector script (Say / Do / Ask), look-fors and the misconception of the day.",
    "Unit 7 (the Builder capstone) is optional and needs a school plan; the plan page says 'Builder: on / resting' and about how many teams can build this period. No prices on any page.",
    "Privacy: the Standards tab is teacher-only, inside the class, deleted with the class; coverage is claimed per class.",
]

teacher_pages = [
    {"route": "/teachers/cs-quest", "purpose": "public program page (indexed): promise, Byte Crew try-it buttons, units, paths (Core 10 (no Builder) first), how-it-works screenshots, coverage teaser, FAQ, JSON-LD educationalAlignment; copy under teachers.cs.*; no prices", "owner": "A"},
    {"route": "/learn/computer-science", "purpose": "public hub listing the four games (HUBS/LEARNING entries)", "owner": "A"},
    {"route": "/teach/cs-quest", "purpose": "signed-in program page: band toggle, units with lesson rows, Add lesson/unit/path, Before-you-start checks, Builder status ('Builder: on / resting', 'about N teams can build this period', N = CS_QUEST_BUILD_TEAMS_PER_PERIOD)", "owner": "A",
     "buttons": ["Add to my library", "Add unit", "Add Core 10 (no Builder) / Full / CS Ed Week / Device-first", "Open plan", "Preview game", "Coverage map"]},
    {"route": "/teach/cs-quest/coverage", "purpose": "program coverage map from the catalogue (44 ids -> lessons, chapters, items, rubric lines, practices); ?print=1", "owner": "A"},
    {"route": "/teach/cs-quest/:key", "purpose": "lesson plan page = printed plan rendered; ?print=1 print view; ?sheet=<name> printables; Short period (40 min) and Block rows", "owner": "A",
     "buttons": ["Start warm-up (live)", "Show questions on the projector", "Open game at this chapter", "Assign to class", "Assign unit... (cadence)", "Host exit ticket live", "Print", "Printables", "Reset to the CS Quest version", "band switch"]},
    {"route": "/class/:id/standards", "purpose": "class Standards tab: Practiced / Checked / Applied / Needs a look / Last / Status; .csv; ?report=1 principal aggregate report", "owner": "A"},
    {"route": "/teach/lessons/:id", "purpose": "existing editor; banner 'From CS Quest x.y (vN) · Open the plan page'", "owner": "A"},
    {"route": "/class/:cid/lessons/:clid", "purpose": "existing student page; Play carries options; Play and 'I played it' hidden on hosted-live steps", "owner": "A"},
    {"route": "POST /api/lessons/from-template/:key | /unit/:unit | /path/:path", "purpose": "materialiser (server/services/lesson-templates.js)", "owner": "A"},
    {"route": "POST /api/classes/:id/assign-unit", "purpose": "assign a unit with start date + cadence -> opens_at / due_at per lesson in the school zone (L.assignUnitWithCadence)", "owner": "A"},
    {"route": "GET /live?mode=&set=&class=&cl=&step=&starter=", "purpose": "live preselect incl. starter= for wyr/bank ids", "owner": "B"},
]

tracking = {
    "stores": {
        "step_progress": "status/score/label/plays/seconds/answer/feedback/marks per class_lesson x step x user (existing); marks reused for 0-3 rubric lines on question/build steps (P11)",
        "lesson_steps.options": "TEXT: query-string params appended to the Play link (chapter=&band=&mode=&level=&lock=), canonical key order",
        "lesson_steps.standards": "TEXT: comma list of CSTA ids set by the materialiser on game, question and build steps",
        "lesson_steps.template": "TEXT: Studio template key for build steps (quiz)",
        "lesson_steps.rubric": "TEXT JSON [{ line, ids, levels[4] }] on question/build steps (<= 8 lines)",
        "lesson_steps.items[].cat": "cat (+secs) kept in quiz snapshots (lessons.js addQuizStep)",
        "live_runs.items[].cat": "cat kept in saved run items (classlive-results.js itemRow)",
        "lessons.template_key / template_version": "which catalogue lesson a library copy came from (csq-1b-1.2, 1)",
        "live_sets": "derived warm-up / exit / review sets per lesson owned by the teacher (lesson_id set, subject 'cs-quest')",
        "server/standards/csta.js": "loads csta-2017.json -> id -> {level, concept, subconcept, statement, practiceCodes}",
        "games label": "score = starsInChapter, label per Appendix C grammar (existing scores/step_progress columns)",
        "phase2": "step_progress.detail TEXT + step_progress_events(class_lesson_id, step_id, user_id, at, detail) capped 200 per cell via brb:progress"
    },
    "tiers": {
        "Practiced": "students with >= 1 done step whose standards contains the id: a game step when done, a question step when answered, a build step when handed in (+ live_run_scores on runs whose items carry the id)",
        "Checked": "mean per-item accuracy from step_progress.marks x items[i].cat and live_run_scores.marks x live_runs.items[i].cat; shown with item and student counts",
        "Applied": "mean of 0-3 rubric marks on question/build steps whose rubric line carries the id (every lesson has one from the In your own words step; unit 7 adds the capstone lines)"
    },
    "mastery": {
        "checked": ">= 2 of the items tagged with the id on the most recent exit ticket are right, or all of them when fewer than 2 are tagged",
        "applied": "a rubric line tagged with the id marked >= 2 on any question/build step",
        "student": "meets when checked OR applied",
        "class": ">= 80% of students meet",
        "bankCoverage": ">= 3 bank items per id per band (CI clause b')",
        "note": "raw numbers always shown; thresholds decided by the orchestrator (brief 'Decisions already made' 1)"
    },
    "view": {"route": "/class/:id/standards", "columns": ["Lessons", "Practiced n/m", "Checked % · items · students", "Applied mean · marked", "Needs a look", "Last", "Status"], "csv": "/class/:id/standards.csv", "report": "?report=1 aggregate only, no names"},
    "privacy": "teacher/class-manager only; never on projector/results/public pages; per-student drill-down inside the class; deleted with the class (onClassLeave/onAccountMerge); coverage claimed per class (pairs: signed-in student only); docs/legal-review.md line next to items 42-43",
    "flags": {"QUIZ_STEPS": "default on: gates quiz-step rendering and the student quiz APIs", "LIVE_HOMEWORK": "unchanged: gates 'Set as homework' only", "CS_QUEST_BUILD_TEAMS_PER_PERIOD": "default 8 (1-60): the plan page's 'about N teams can build this period'"},
    "inGameCheck": "Case-closed card in lesson mode: 1 concept check (3 tiles, from level.check) + 1 confidence face; tally in the label today, per level with brb:progress",
    "ciTest": {
        "file": "tests/unit/cs-quest-catalogue.test.js",
        "clauses": {
            "a": ">= 1 lesson of the band lists the id as primary, outside unit 7",
            "b'": ">= 3 bank items of the band have cat = id",
            "c": "an id in a unit-7 lesson's primary list has a rubric line",
            "d": "every cat / standards / csta value in the catalogue and the WYR prompts file is a real id (games' level data at integration)",
            "e": "every lesson's steps sum to 45 and fit L.cleanStep limits (title 100, body 4000, <= 40 steps, minutes 0-240) and SETS.LIMITS",
            "f'": "every game chapter named in a lesson exists for that band and the quest code matches chapter index / band / mode; a game step's standards is a subset of its chapter's csta plus its then chapter's",
            "g": "every exit item's cat is a primary id of its lesson",
            "h": "every options string is canonical under cleanOptions and names the lesson's chapter / band / mode with lock=1",
            "i": "the practices table has every practice in >= 3 units",
            "j": "every set has >= 10 items with 4 choices; no digit run >= 7, @, //host, http anywhere; US spelling in every English string",
            "ca": "warm-up / exit item ids resolve in the local banks; every primary id has a rubric line on the In your own words step; a hosted-live warm-up step uses the band's mode game; 7.2 build step template = quiz"
        },
        "coverageScript": "scripts/cs-quest-coverage.js prints the map"
    }
}

i18n = {
    "englishOnly": [
        "lesson text and step bodies (seed-lessons/cs-quest/lessons/**)",
        "quiz bank items (seed-lessons/cs-quest/sets/**)",
        "WYR dilemma text (English fallback per item in the 12 non-English data files is allowed)",
        "WYR prompts and CSTA tags (seed-lessons/cs-quest/wyr-tech.json)",
        "rubric lines, planning sheet, printables (seed-lessons/cs-quest/printables/**)",
        "CSTA ids and statements (rendered with el() as lang=en)",
        "game level data (maps, sol, par, csta)",
        "public landing copy under teachers.cs.* (uncounted prefix; English-first, rendered with el()/fb())"
    ],
    "mustBe13Languages": [
        "cs.* (program page chrome, plan page buttons, banners, toasts, state chips, 'Your teacher hosts this live', 'game not available yet')",
        "school.classTabs.standards and all Standards tab headings, legend, status words, CSV headers (cs.standards.*)",
        "js.cs.* for any browser module",
        "live.cs.* (anything B adds to /live chrome)",
        "WYR ui.json cat.tech and cat.online",
        "in-game strings of robo-route, data-detective, packet-post, inside-the-machine (own packs under /vendor/data/<slug>/<version>/<lang>.js, identical {slots}, chrome <= 450 + level text <= 1000 per game)",
        "JSON l10n description/tags for the four games (11 non-English locales)"
    ],
    "namespaces": {"A": ["cs.*", "js.cs.*", "school.classTabs.standards", "teachers.cs.*", "learn.cs*"], "B": ["live.cs.*", "scripts/data/would-you-rather/ui.json"], "games": ["no locale files; own packs only"]},
    "rule": "each owner appends its own block at the end of every locale file through its own merge script (A: scripts/i18n-add-cs-quest.mjs pattern); extra keys or placeholder mismatches fail npm test; run npm run i18n:check",
    "usSpelling": {"rule": "US spelling in lesson content, bank items and in-game en text; en-GB packs may differ; teacher chrome says 'catalog'", "words": ["color", "gray", "favorite", "labeled", "license", "organize", "practiced", "neighbor", "recognize", "math", "center", "program", "catalog"]},
    "translationWorkflow": "the implementing workflow writes all 11 translations itself through scripts/cs-quest-i18n.mjs; native review is a launch note, not a merge gate",
}

platform = [
    {"id": "P1", "change": "BRB.params (chapter band mode level lock) signed into the frame token as o=chapter.band.mode.level.lock (<=40), init.params, frozen SDK object", "files": ["server/routes/games.js", "public/sdk/brb-sdk.js", "docs/sdk.md", "tests/unit/params.test.js"], "owner": "A", "status": "merged (platform slice)"},
    {"id": "P2", "change": "lesson_steps.options TEXT appended to the Play link", "files": ["server/db.js", "server/services/lessons.js", "server/routes/progress.js"], "owner": "A", "status": "merged"},
    {"id": "P3", "change": "lesson_steps.standards TEXT + server/standards/csta.js", "files": ["server/db.js", "server/services/lessons.js", "server/standards/csta.js"], "owner": "A", "status": "merged"},
    {"id": "P4", "change": "keep cat (+secs) through quiz snapshots and saved live run items", "files": ["server/services/lessons.js (A)", "server/services/classlive-results.js (B)"], "owner": "A+B", "status": "A merged; B on cs-quest/live-sets"},
    {"id": "P5", "change": "Host-live link emits mode= via liveGameOf; student page hides Play AND 'I played it' on MODES-slug and WYR-live steps (hosted-live steps refuse student calls)", "files": ["server/routes/progress.js", "server/services/progress.js"], "owner": "A", "status": "merged"},
    {"id": "P6", "change": "/live?starter= preselects wyr/bank starters", "files": ["server/routes/live.js", "server/views/live.js", "tests/unit/live-pages.test.js"], "owner": "B"},
    {"id": "P7", "change": "QUIZ_STEPS flag default on (quiz steps + student quiz APIs); LIVE_HOMEWORK keeps homework only; routes/live.js:650 gate moves at integration", "files": ["server/config.js", "server/routes/progress.js", "README.md"], "owner": "A", "status": "merged"},
    {"id": "P8", "change": "copyLesson copies options, standards, template, rubric, set_id and regenerates quiz items", "files": ["server/services/lessons.js"], "owner": "A", "status": "merged"},
    {"id": "P9", "change": "lessons.template_key, template_version", "files": ["server/db.js", "server/services/lessons.js"], "owner": "A", "status": "merged"},
    {"id": "P10", "change": "lesson_steps.template -> templateHtml(key) on the build route", "files": ["server/db.js", "server/routes/progress.js"], "owner": "A", "status": "merged"},
    {"id": "P11", "change": "review marks 0-3 per rubric line on question/build steps (API, form, gradebook) + 'Also mark these teammates'; rubric lines on every lesson's In your own words step", "files": ["server/services/progress.js", "server/routes/progress.js"], "owner": "A", "status": "merged"},
    {"id": "P12", "change": "Standards class tab + CSV + principal report + 13-language keys + deletion hooks", "files": ["server/routes/schools.js (CLASS_TABS)", "server/services/standards.js", "server/routes/cs-quest.js", "public/css/schools.css"], "owner": "A"},
    {"id": "P13", "change": "plan page, print view, projector-questions page", "files": ["server/routes/cs-quest.js", "server/views/cs-quest.js"], "owner": "A"},
    {"id": "P14", "change": "WYR topics tech and online (data x13, ui.json, TOPICS, CATS, pack rebuild)", "files": ["scripts/data/would-you-rather/**", "server/live/wyr.js", "scripts/wyr-bank.js", "tests/unit/live-wyr-atlas.test.js"], "owner": "B"},
    {"id": "P15", "change": "catalogue + materialiser + routes + pages + CI test + coverage script", "files": ["seed-lessons/cs-quest/**", "server/services/lesson-templates.js", "server/routes/cs-quest.js", "server/app.js", "tests/unit/cs-quest-catalogue.test.js", "scripts/cs-quest-coverage.js"], "owner": "A (sets: B)"},
    {"id": "P16", "change": "covers.js merges scripts/covers/*.recipe.js", "files": ["scripts/covers.js"], "owner": "integration"},
    {"id": "P17", "change": "POST /api/classes/:id/assign-unit with cadence -> opens_at and due_at (the day before the next lesson opens; last + 7 days)", "files": ["server/routes/cs-quest.js", "server/services/lessons.js (assignUnitWithCadence merged)"], "owner": "A"},
    {"id": "P18", "change": "Builder status endpoint (builderStatus(): on / resting, teamsPerPeriod) for the plan page", "files": ["server/routes/cs-quest.js", "server/services/builder-status.js (merged)"], "owner": "A"},
    {"id": "P19", "change": "SEED_GAMES, scanner slug lists, seeds.spec.js, covers + OG run, decisions.md, status.md", "files": ["scripts/seed.js", "tests/unit/scanner.test.js", "tests/safety/scanner.test.js", "tests/e2e/seeds.spec.js", "docs/decisions.md", "docs/status.md"], "owner": "integration"},
    {"id": "P20", "change": "/live set picker 'CS Quest' optgroup for sets with subject cs-quest or lesson_id + CSQ title", "files": ["server/views/live.js", "server/services/classlive-sets.js"], "owner": "B"},
    {"id": "P21", "change": "Reset to the CS Quest version: materialise a fresh copy, re-assign it to the same classes with the old opens_at/due_at, unassign the old copy (student work stays restorable)", "files": ["server/services/lesson-templates.js", "server/routes/cs-quest.js"], "owner": "A"},
    {"id": "legal", "change": "docs/legal-review.md line for the Standards tab and rubric marks (per-student education records; school-only; deletion hooks; teacher CSV only)", "files": ["docs/legal-review.md"], "owner": "A"},
    {"id": "phase2", "change": "brb:progress + step_progress.detail/events; class level shelf; survey mode for live sets; computing bank subject; games.standards", "files": [], "owner": "later"},
]

contracts = {
    "program": {"name": "CS Quest", "slug": "cs-quest", "tagline": "Computer science, one period at a time.", "standards": "CSTA K-12 CS Standards 2017, levels 1B (grades 3-5) and 2 (grades 6-8)",
                "bands": {"1B": {"grade": "Grades 3-5", "inGame": "Explorer", "code": "1b"}, "2": {"grade": "Grades 6-8", "inGame": "Pro", "code": "2"}},
                "units": [{"n": u, "title": UNIT_NAMES[u], "tool": UNIT_TOOL[u], "lessons": [f"{u}.{n}" for n in by_unit[u]], "needsSchoolPlan": u == 7, "optional": u == 7} for u in range(1, 8)],
                "paths": PATHS,
                "retiredPaths": {"core10": "Core 10 with the four Builder lessons (1.2, 2.1, 3.1, 4.1, 5.2, 6.1, 7.1-7.4) is not published: unit 7 is optional and needs a school plan; teachers add it with Add unit"},
                "period": PERIOD, "periodVariants": PERIOD_VARIANTS, "rules": RULES, "materials": MATERIALS, "faq": FAQ,
                "lessonModeDefaults": {"music": "off", "captions": "on"},
                "catalogue": {"units": "seed-lessons/cs-quest/units.json", "lessons": "seed-lessons/cs-quest/lessons/<unit>.<n>-<1b|2>.json (46)", "games": "seed-lessons/cs-quest/games.json (chapter table for the CI test)", "sets": "seed-lessons/cs-quest/sets/u<n>-<1b|2>.json (14, owner B)", "wyr": "seed-lessons/cs-quest/wyr-tech.json (owner B)", "schema": "seed-lessons/cs-quest/README.md"},
                "planPath": os.path.join(HERE, "plan.md")},
    "params": {"urlKeys": ["chapter", "band", "mode", "level", "lock"], "valueRegex": "^[a-z0-9-]{1,16}$", "band": "1b|2", "level": "1-30", "lock": "0|1",
               "tokenField": "o = chapter.band.mode.level.lock (<= 40 chars, empty parts allowed)", "sdk": "BRB.params frozen object, {} when absent; games read (window.BRB && BRB.params) || {}",
               "stepColumn": "lesson_steps.options holds the query-string form in canonical key order (chapter, band, mode, level, lock); routes/progress.js appends it to the Play link",
               "questCode": "C B M L (4 digits): C chapter index (0 map), B 1 Explorer | 2 Pro, M mode index (0 play, 1 debug, 2 maker/tally/wheel, 3 projector), L level 0-9; typed in-game; params win; hidden in live frames",
               "lockSemantics": LOCK_SEMANTICS},
    "progressLabelRegex": LABEL_RE,
    "games": games_out,
    "sets": sets_out,
    "lessons": lessons_out,
    "teacherPages": teacher_pages,
    "tracking": tracking,
    "i18n": i18n,
    "platformChanges": platform,
    "capstone": {"teams": {"1B": 2, "2": 3}, "oneDevicePerTeam": True, "startRule": "teams press Start building when their sheet is approved (staggered by design)", "paperPath": "half of 7.2 by design: teams not yet approved build on paper (storyboard + 5-row test table) and swap in rotation 2",
                 "shape72": "one good message, then one fix; paper path first", "template": "quiz", "budget": "school plan required; no prices anywhere on public or teacher pages",
                 "builderStatusLine": "'Builder: on / resting' + 'about N teams can build this period' (N = config CS_QUEST_BUILD_TEAMS_PER_PERIOD, default 8) on the unit-7 plan pages and the program page",
                 "captainLogin": "one Studio game per account per build step: the team captain signs in for every unit-7 period (role card + plan page say so; the captain's login card stays in the team folder); other members have no build cell",
                 "markTeammates": "P11 review form 'Also mark these teammates' (<= 60) copies the rubric marks onto teammates' step_progress rows (question/build steps only) so the Standards tab counts every member; no team feature in v1",
                 "credits": "first names or avatars only; never full names, school or address in the Builder or the game",
                 "rubricLines": [{k: v for k, v in l.items()} for l in CAPSTONE_LINES],
                 "rubricOnSteps": {"7.1": "Plan line on 'Who and what' and 'Parts and the rule'; Roles / timeline line on the third question", "7.2": "Program line (builds toward; counts as evidence for nothing) on the build step", "7.3": "Test with others on 'Tally and the one change'", "7.4": "Explain & credit on the credits question", "every lesson": "one line per primary id on In your own words"},
                 "marks": "0-3 per line, stored in step_progress.marks for the build/question steps (P11)"},
    "sharedFiles": {
        "integrationOnly": ["scripts/seed.js (SEED_GAMES single-quoted array literal)", "tests/unit/scanner.test.js slug list", "tests/safety/scanner.test.js slug list", "tests/e2e/seeds.spec.js", "scripts/covers.js (recipe loader)", "docs/decisions.md", "docs/status.md"],
        "localeFiles": "server/i18n/locales/*.json: each owner appends only its namespace block (see i18n.namespaces)",
        "coversRecipes": "game owners write scripts/covers/<slug>.recipe.js; covers.js loads them (P16)",
        "contentLint": "tests/unit/cs-quest-content-lint.test.js (owned by C) scans all four games' string literals and packs; D/E/F only add their slug to its list via integration",
        "i18nScaffold": "scripts/cs-quest-i18n.mjs (owned by C) builds packs for all four games from scripts/data/cs-quest/<slug>/<lang>.json",
        "banks": "seed-lessons/cs-quest/sets/*.json and wyr-tech.json are owner B's (branch cs-quest/live-sets); the curriculum branch keeps ignored, uncommitted copies for its tests and never commits them"
    }
}

# ------------------------------------------------------------------------------------------------------------- sanity
for s in CSTA:
    band = s["level"]
    assert any(s["id"] in l["csta"] for l in lessons_out if l["band"] == band and l["unit"] != 7), ("no primary lesson outside unit 7", s["id"])
    assert any(s["id"] in st["cstaTags"] for st in sets_out if st.get("kind") == "quiz" and st["band"] == band), ("no set", s["id"])
assert len(lessons_out) == 46 and len([x for x in sets_out if x["kind"] == "quiz"]) == 14
for l in lessons_out:
    for i in l["csta"] + l["also"] + l["buildsToward"]:
        assert LEVEL[i] == l["band"], (l["id"], i)
    assert len(l["title"]) <= 100
    assert l["warmupItems"] == [] or len(set(l["warmupItems"])) == 5
    # (c) a unit-7 primary id has a rubric line on some step
    if l["unit"] == 7:
        lines = {i for s in l["steps"] for r in s.get("rubric", []) for i in r["ids"]}
        assert set(l["csta"]) <= lines, (l["id"], l["csta"], lines)
# (i) every practice in >= 3 units (from the primary ids' practiceCodes)
PRACTICE = {s["id"]: {int(str(c).split(".")[0]) for c in s["practiceCodes"]} for s in CSTA}
units_by_practice = {}
for l in lessons_out:
    for i in l["csta"]:
        for p in PRACTICE[i]:
            units_by_practice.setdefault(p, set()).add(l["unit"])
for p in range(1, 8):
    assert len(units_by_practice.get(p, ())) >= 3, (p, units_by_practice.get(p))
contracts["practicesByUnit"] = {str(p): sorted(units_by_practice[p]) for p in range(1, 8)}

# optional: the local banks (owner B's files, when present) must carry every warm-up / exit id, cats must be primaries, >= 3 items per id
bank_report = {"checked": False}
if os.path.isdir(SETS_DIR):
    items = {}
    counts = {}
    for st in sets_out:
        if st["kind"] != "quiz":
            continue
        p = os.path.join(REPO, st["file"])
        if not os.path.exists(p):
            continue
        b = json.load(open(p))
        assert len(b["items"]) == st["questionCount"], (st["id"], len(b["items"]), st["questionCount"])
        for it in b["items"]:
            items[it["id"]] = it
            counts[it["cat"]] = counts.get(it["cat"], 0) + 1
    if items:
        for l in lessons_out:
            for i in l["warmupItems"] + l["exitItems"]:
                assert i in items, (l["id"], i)
            for i in l["exitItems"]:
                assert items[i]["cat"] in l["csta"], (l["id"], i, items[i]["cat"], l["csta"])
                assert items[i]["lesson"] == l["n"]
            for s in l["steps"]:
                if s["kind"] == "quiz":
                    assert s["items"] == l["exitItems"]
        for s in CSTA:
            assert counts.get(s["id"], 0) >= 3, ("b' fails", s["id"], counts.get(s["id"], 0))
        for rid, (sid, cat, why) in REVIEW_ADDS.items():
            assert items[rid]["cat"] == cat, (rid, items[rid]["cat"], cat)
        bank_report = {"checked": True, "items": len(items), "perIdMin": min(counts.get(s["id"], 0) for s in CSTA)}
contracts["bankCheck"] = bank_report

# ----------------------------------------------------------------------------- critic additions: carried over + proven redundant
try:
    _prev = json.load(open(OUT))
except Exception:
    _prev = {}
ca = _prev.get("criticAdditions")
if ca:
    L = {l["id"]: l for l in lessons_out}
    def step(l, title):
        return next(s for s in l["steps"] if s["title"] == title)
    def shape(steps):
        return [(s["kind"], s["title"], s["minutes"], s.get("gameSlug"), s.get("options"), tuple(s.get("standards") or [])) for s in steps]
    checks = []
    def chk(name, cond, detail=""):
        checks.append({"override": name, "redundant": bool(cond), **({"detail": detail} if detail else {})})
    ov = ca.get("lessonOverrides", {})
    for k in ("csq-1b-2.2", "csq-2-2.2", "csq-1b-3.3", "csq-1b-6.2"):
        want = ov[k]
        play = next(s for s in L[k]["steps"] if s["title"].startswith("Play"))
        chk(f"{k} steps.Play.standards", play["standards"] == want["steps.Play.standards"])
        chk(f"{k} steps.In your own words.standards", step(L[k], "In your own words")["standards"] == want["steps.In your own words.standards"])
    want = ov["csq-2-6.2"]["steps"]
    got = L["csq-2-6.2"]["steps"]
    # (the override's last step predates the "every lesson" rule of the same block, so In your own words is compared without its standards)
    sig = lambda s: (s["kind"], s["title"], s["minutes"], s.get("gameSlug"), s.get("options"), tuple(s.get("standards") or []) if s["title"] != "In your own words" else ())
    chk("csq-2-6.2 steps (kinds, titles, minutes, games, options, standards)", [sig(s) for s in want] == [sig(s) for s in got])
    chk("csq-2-6.2 Play B quest code 6 2 0 0", step(L["csq-2-6.2"], "Play B: Fair Data")["questCode"] == "6 2 0 0")
    for k in ("csq-1b-6.1", "csq-2-6.1"):
        l = L[k]
        chk(f"{k} no warm-up", l["warmupSetId"] is None and l["warmupMode"] is None and l["warmupItems"] == [] and not any(s["title"] == "Warm-up (live)" for s in l["steps"]))
        chk(f"{k} starter wyr:tech:8:20", l["mainActivity"]["starter"] == "wyr:tech:8:20")
        chk(f"{k} steps Today 27 · WYR 13 · Exit 3 · Question 2", [(s["kind"], s["title"], s["minutes"]) for s in l["steps"]] == [(s["kind"], s["title"], s["minutes"]) for s in ov["csq-1b-6.1"]["steps"]])
    chk("csq-1b-6.2.warmupItems", L["csq-1b-6.2"]["warmupItems"] == ov["csq-1b-6.2.warmupItems"])
    chk("csq-2-6.2.warmupItems", L["csq-2-6.2"]["warmupItems"] == ov["csq-2-6.2.warmupItems"])
    for bl, band in (("1b", "1B"), ("2", "2")):
        l = L[f"csq-{bl}-7.1"]
        chk(f"csq-{bl}-7.1 three question steps 6+6+6 with Plan / Plan / Roles ids", [(s["kind"], s["minutes"]) for s in l["steps"][2:5]] == [("question", 6)] * 3 and
            l["steps"][2]["standards"] == cap_line("Plan", band)["ids"] and l["steps"][3]["standards"] == cap_line("Plan", band)["ids"] and l["steps"][4]["standards"] == cap_line("Roles / timeline", band)["ids"])
        l = L[f"csq-{bl}-7.2"]
        b = next(s for s in l["steps"] if s["kind"] == "build")
        chk(f"csq-{bl}-7.2 build step template quiz + standards", b["template"] == "quiz" and b["standards"] == ov["csq-*-7.2"]["steps.Play"]["standards"][band])
        l = L[f"csq-{bl}-7.3"]
        chk(f"csq-{bl}-7.3 text 3 + question 15 with the Test ids", [(s["kind"], s["minutes"]) for s in l["steps"][2:4]] == [("text", 3), ("question", 15)] and set(l["steps"][3]["standards"]) == set(l["csta"]))
        l = L[f"csq-{bl}-7.4"]
        chk(f"csq-{bl}-7.4 question 18 with the credit ids", (l["steps"][2]["kind"], l["steps"][2]["minutes"]) == ("question", 18))
    chk("every lesson: In your own words has standards + one rubric line per primary id", all(step(l, "In your own words").get("standards") and [r["ids"] for r in step(l, "In your own words")["rubric"]] == [[i] for i in l["csta"]] for l in lessons_out))
    chk("lockSemantics.then (4.1 / 4.3 / 5.1 Explorer) in mainActivity.then", L["csq-1b-4.1"]["mainActivity"]["then"]["chapter"] == "routes" and L["csq-1b-4.3"]["mainActivity"]["then"]["chapter"] == "ciphers" and L["csq-1b-5.1"]["mainActivity"]["then"]["chapter"] == "hw-sw")
    chk("csq-2-4.1 'first: routes 1-6' withdrawn; protocols locked; routes 5 explore demo; routes 5-6 stretch", "first" not in L["csq-2-4.1"]["mainActivity"] and L["csq-2-4.1"]["mainActivity"]["chapter"] == "protocols" and L["csq-2-4.1"]["mainActivity"]["exploreDemo"] == {"chapter": "routes", "level": 5} and L["csq-2-4.1"]["mainActivity"]["then"]["levels"] == "5-6")
    chk("mastery rules (checked / applied / b')", tracking["mastery"]["checked"].startswith(">= 2 of the items") and "rubric line" in tracking["mastery"]["applied"] and ">= 3" in tracking["mastery"]["bankCoverage"])
    chk("mastery.addItems in sets[].reviewAdds", all(any(a["id"] in st.get("reviewAdds", []) for st in sets_out) for a in ca["mastery"]["addItems"]))
    chk("sets: wyr-tech starter 8:20", next(st for st in sets_out if st["id"] == "wyr-tech")["starter"] == "wyr:tech:8:20")
    chk("program.pathsAdd.core10NoBuilder first", PATHS[0]["id"] == "core10-no-builder" and PATHS[0]["lessons"] == ca["program"]["pathsAdd"]["core10NoBuilder"])
    chk("program.periodVariants short40 / block", "short40" in PERIOD_VARIANTS and "block80-90" in PERIOD_VARIANTS)
    chk("program.faqAdd", all(any(f.lower().startswith(a.split(";")[0][:20].lower()) for f in FAQ) for a in ca["program"]["faqAdd"]))
    chk("US spelling in titles / activity fields", not any(re.search(r"organis|artefact|colour|grey|favourite", json.dumps(l)) for l in lessons_out))
    chk("standardsOnSteps (question / build steps carry standards)", all(any(s["kind"] in ("question", "build") and s.get("standards") for s in l["steps"]) for l in lessons_out))
    chk("capstone captainLogin / markTeammates / no prices", "captainLogin" in contracts["capstone"] and "markTeammates" in contracts["capstone"] and "no prices" in contracts["capstone"]["budget"])
    chk("platformChangesAdd P5 / P8 / P11 / P17 / P20 / P21 / legal in platformChanges", all(any(p["id"] == a["id"] for p in platform) for a in ca["platformChangesAdd"]))
    chk("lessonModeDefaults music off, captions on", contracts["program"]["lessonModeDefaults"] == {"music": "off", "captions": "on"})
    ca = dict(ca)
    ca["bakedIn"] = {"on": "2026-11-03", "by": "curriculum stage 1 (gen-contracts.py)", "note": "Every override below is now equal to the base data (lessons[], sets[], program, tracking, capstone, platformChanges); the block is kept for the record. A false 'redundant' flag means the base data drifted: fix gen-contracts.py, never the override."}
    ca["redundancyCheck"] = {"allRedundant": all(c["redundant"] for c in checks), "checks": checks}
    contracts["criticAdditions"] = ca
    assert ca["redundancyCheck"]["allRedundant"], [c for c in checks if not c["redundant"]]

json.dump(contracts, open(OUT, "w"), indent=1, ensure_ascii=False)
os.makedirs(os.path.dirname(GAMES_OUT), exist_ok=True)
games_json = {
    "about": "CS Quest chapter table, generated by the program's gen-contracts.py (scratchpad). The catalogue CI test (tests/unit/cs-quest-catalogue.test.js) checks every lesson's quest code, params and game-step standards against it. Band keys are CSTA levels: 1B = Explorer (grades 3-5), 2 = Pro (grades 6-8).",
    "questCode": "C B M L: C = chapter index (0 = map), B = 1 Explorer | 2 Pro, M = mode index, L = level 0-9 (0 = first unfinished)",
    "lockSemantics": LOCK_SEMANTICS,
    "games": {g["slug"]: {"title": g["title"], "crew": g["crew"]["name"], "noun": src["noun"], "modes": g["modes"], "playersMax": g["players_max"],
                          "chapters": [{"index": ch["index"], "id": ch["id"], "title": ch["title"], "band": ch["band"], "levels": ch["levels"], "csta": ch["csta"], **({"mode": ch["mode"]} if ch.get("mode") else {}), **({"enrichment": True} if ch.get("enrichment") else {})}
                                       for ch in g["chapters"]]}
              for g, src in zip(games_out, GAMES)},
}
json.dump(games_json, open(GAMES_OUT, "w"), indent=1, ensure_ascii=False)
open(GAMES_OUT, "a").write("\n")
print("ok", len(lessons_out), "lessons", len(sets_out), "sets", sum(len(g["chapters"]) for g in games_out), "chapter rows;",
      "banks", bank_report, "; critic overrides redundant:", contracts.get("criticAdditions", {}).get("redundancyCheck", {}).get("allRedundant"), "->", GAMES_OUT)
