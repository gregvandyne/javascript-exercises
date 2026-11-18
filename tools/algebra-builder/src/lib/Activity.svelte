<script lang="ts">
	// The student's view of one problem: a whiteboard with the mat on it. A bar
	// across the top names the problem, its steps and the step's Check (or, on
	// the last step, the answer field); what a failed Check found wrong shows
	// just under it, and the tiles it found are marked in red. The toolbar
	// floats at the bottom, with the zoom beside it.
	//
	// Multiply goes sides → rectangle → like-term groups → equation; Factor goes
	// rectangle → sides → equation. Only a passed Check opens the next step, and
	// it locks the tiles it read; once Multiply's rectangle passes, the T fades
	// away and its tiles are sorted into groups.
	//
	// Tiles behave the same everywhere and can go anywhere: they snap to the
	// edges near them, keep whichever way they face until the student turns
	// them, and zero out with their opposites. A side of the T holds one row,
	// laid end to end from the corner, so a tile dropped there slides into
	// place; a tile there can't be turned. Copies (Duplicate, paste,
	// Alt-drag) keep their originals' places: pasted and duplicated tiles go
	// directly below what was copied, in the same pan.
	//
	// Solve has a balance in place of the T, its two pans one for each side of
	// the equation, and goes same to both pans → division step → answer. The
	// live balance tips as tiles go in and out of the pans (see
	// the original project's design notes). With the live balance off
	// there's no balance: the equation's two sides lie either side of a line,
	// nothing tips, and only Check says whether they're equal. A pan's tiles are drawn as far down as it hangs, but kept on the
	// board where the pan would be level, so where a tile lies, and so every
	// check, ignores the tipping. Once step 1 passes, the balance fades to a
	// line standing for =, with a box across it for each x tile; the student
	// shares the units out among the boxes. Once that passes, all boxes but the
	// first fade away. With one x tile, there's no division step.
	import { onMount, tick } from 'svelte';
	import { complete, stepPassed, stepWrong, tap as tapSound } from '$lib/oomba';
	import { hintsFor } from '$lib/hints';
	import {
		Check,
		Copy,
		FlipVertical2,
		Hand,
		Lightbulb,
		Maximize,
		Minus,
		MousePointer2,
		Plus,
		Redo2,
		RotateCcw,
		RotateCw,
		Trash2,
		Undo2
	} from '@lucide/svelte';
	import {
		checkEquation,
		checkSolution,
		factorizations,
		formatFactor,
		formatPoly,
		prettyText,
		type Built,
		type Equation,
		type Factor,
		type Problem
	} from './algebra';
	import {
		BOX_PAD,
		PAN_PAD,
		balanceFor,
		boxHalf,
		boxIn,
		checkBoxes,
		checkPans,
		divisionFor,
		heapSpot,
		lean,
		panDrops,
		tiltOf,
		withHeight,
		type Division,
		type Lean,
		type Pan
	} from './balance';
	import {
		GAP,
		lenAdd,
		lenSub,
		GROUP_KINDS,
		SNAP_REACH,
		UNIT,
		XLEN,
		checkGroups,
		checkProduct,
		checkSides,
		checkSidesAgainst,
		lenPx,
		net,
		packSides,
		pairUp,
		readRectangle,
		readSide,
		rectOf,
		rowOf,
		settle,
		size,
		stackBelow,
		zeroPairs,
		type Cell,
		type Grid,
		type Kind,
		type Len,
		type Rect,
		type Result,
		type SideTile,
		type Sign,
		type Tile
	} from './mat';
	import MathInput from './MathInput.svelte';
	import TileView from './TileView.svelte';
	import BalanceArt from './BalanceArt.svelte';
	import { layPiles, panPiles, rectangleTiles, startingPiles, type Start } from './settings';

	let {
		problem,
		start = 'all',
		live = true,
		onfinish,
		onnext,
		nextLabel = 'Next question',
		badge = ''
	}: {
		problem: Extract<Problem, { ok: true }>;
		start?: Start;
		/** Solve: whether the balance tips as the student works, or always hangs level. */
		live?: boolean;
		/** Oomba, a question set: called when this problem is complete, in place of the finish (the set says when). */
		onfinish?: (bar: HTMLElement | undefined) => void;
		/** Oomba, a question set: a button to the next question once this one is complete. */
		onnext?: () => void;
		nextLabel?: string;
		/** Oomba, a question set: where this one is ("2 of 5"), shown before the activity in the bar. */
		badge?: string;
	} = $props();

	// The problem never changes for the life of this view; the page makes a new one per link.
	// svelte-ignore state_referenced_locally
	const p = problem;
	// Solve always starts with all its tiles in place: it has no choice of start.
	// svelte-ignore state_referenced_locally
	const startWith: Start = problem.type === 'solve' ? 'all' : start;
	// svelte-ignore state_referenced_locally
	const liveBalance = live;
	/** Multiply or Factor, built on the T; or Solve, on the balance. */
	const built: Built | null = p.type === 'solve' ? null : p;
	const eq: Equation | null = p.type === 'solve' ? p : null;
	const solving = eq !== null;
	/** Solve: the balance as it starts, with its pans sized for the problem. */
	const firstBal = eq && balanceFor(eq);
	/** Solve: the balance, whose pans grow taller when copies go below their tiles. */
	let bal = $state(firstBal);

	// --- steps ---

	type Step =
		'sides' | 'rectangle' | 'groups' | 'equation' | 'balance' | 'divide' | 'answer' | 'done';
	const STEPS: Record<Built['type'], Step[]> = {
		multiply: ['sides', 'rectangle', 'groups', 'equation'],
		factor: ['rectangle', 'sides', 'equation']
	};
	const STEP_NAMES: Record<Step, string> = {
		sides: 'Sides',
		rectangle: 'Rectangle',
		groups: 'Like terms',
		equation: 'Equation',
		// Solve's step 1, doing the same to both pans until x is alone.
		balance: 'Isolate',
		divide: 'Divide',
		answer: 'Answer',
		done: 'Done'
	};
	// Solve skips the division step when one x tile is left.
	const steps: Step[] = built
		? STEPS[built.type]
		: firstBal!.rows > 1
			? ['balance', 'divide', 'answer']
			: ['balance', 'answer'];
	let step = $state<Step>(steps[0]);
	/** Multiply's T fades away once its rectangle is done, leaving the tiles to sort. */
	const faded = $derived(
		p.type === 'multiply' && (step === 'groups' || step === 'equation' || step === 'done')
	);

	// --- the mat's size: long enough for the longest side any answer needs ---

	const sideLength = (f: Factor) => Math.abs(f.x) * XLEN + Math.abs(f.unit) * UNIT;
	const allSides = built ? [...built.factors, ...factorizations(built.poly).flat()] : [];
	const ARM = Math.max(Math.max(...allSides.map(sideLength)) + 2 * XLEN, 4 * XLEN);
	const STRIP = UNIT + 2 * GAP;
	const region: Rect = { x: 0, y: 0, w: ARM, h: ARM };
	const topStrip: Rect = { x: 0, y: -STRIP, w: ARM, h: STRIP };
	const leftStrip: Rect = { x: -STRIP, y: 0, w: STRIP, h: ARM };
	const rectTiles = built ? rectangleTiles(built) : [];

	// The like-term groups, beside the rectangle, each big enough for its tiles.
	const ZONE_W = 4.5 * XLEN;
	const zones: Record<Kind, Rect> = (() => {
		const out = {} as Record<Kind, Rect>;
		let y = 0;
		for (const k of GROUP_KINDS) {
			const n = rectTiles.filter((t) => t.kind === k).reduce((a, t) => a + t.n, 0);
			const area = n * lenPx(size(k).w) * lenPx(size(k).h);
			const h = Math.max(1.4 * XLEN, (area * 2.4) / ZONE_W + UNIT);
			out[k] = { x: ARM + 1.5 * XLEN, y, w: ZONE_W, h };
			y += h + UNIT;
		}
		return out;
	})();
	const ZONE_NAMES: Record<Kind, string> = { x2: 'x² tiles', x: 'x tiles', unit: 'Unit tiles' };

	// --- what's on the board ---

	let nextId = 1;
	let tiles = $state<Tile[]>(startingTiles());
	/** The sides, as read when their Check passed. */
	let top = $state<SideTile[]>([]);
	let left = $state<SideTile[]>([]);
	/** The tiles on the T's sides once they passed, which fade with the T. */
	let sideIds = $state(new Set<number>());
	/** Tiles a passed Check has locked in place. */
	let locked = $state(new Set<number>());
	/** Factor: the rectangle as read when its Check passed, to check the sides against. */
	let grid: Grid | null = null;
	/** Multiply: the rectangle's tiles, which all have to end up in a group. */
	let product = new Set<number>();

	/** The tiles the teacher chose to start with, lying beside the mat, or in
	 *  their pans in Solve, one row per kind and sign. */
	function startingTiles(): Tile[] {
		const id = () => nextId++;
		if (!firstBal)
			return layPiles(startingPiles(built!, startWith), ARM + 1.5 * XLEN, 0, 5 * XLEN, id);
		const [l, r] = panPiles(eq!, startWith);
		const inPan = (pan: Rect) => [pan.x + PAN_PAD, pan.y + PAN_PAD, pan.w - 2 * PAN_PAD] as const;
		return [
			...layPiles(l, ...inPan(firstBal.left), id),
			...layPiles(r, ...inPan(firstBal.right), id)
		];
	}

	const center = (r: Rect) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });
	const inside = (pt: { x: number; y: number }, r: Rect) =>
		pt.x >= r.x && pt.x <= r.x + r.w && pt.y >= r.y && pt.y <= r.y + r.h;
	const within = (t: Tile | Rect, r: Rect) => inside(center('kind' in t ? rectOf(t) : t), r);
	const zoneOf = (t: Tile): Kind | null =>
		faded ? (GROUP_KINDS.find((k) => within(t, zones[k])) ?? null) : null;
	/** Solve: the x tiles' pan, once step 1 has passed, and the units' pan. */
	let xPan = $state<Pan>('left');
	const unitPan = $derived<Pan>(xPan === 'left' ? 'right' : 'left');
	/** Solve: the tiles that faded away with every row but the first. */
	let fadedIds = $state(new Set<number>());
	/** Solve: the division step's line and boxes, once step 1 has passed. */
	let division = $state<Division | null>(null);
	/** Solve: how many unit tiles there were to share out when step 1 passed. */
	let unitCount = 0;
	/** Solve: the uneven boxes the division step's Check found. */
	let badBoxes = $state<number[]>([]);
	/** Tiles sliding into place on their own, as the x tiles line up after step 1. */
	let gliding = $state(false);

	/** Whether a tile is gone from the board with the faded T, or a faded row. */
	const vanished = (t: Tile) => (faded && sideIds.has(t.id)) || fadedIds.has(t.id);

	// --- the balance ---

	/** Which pan a tile lies in, if any, by where its middle is. */
	const panOf = (t: Tile): Pan | null =>
		bal ? (within(t, bal.left) ? 'left' : within(t, bal.right) ? 'right' : null) : null;
	const inPan = (which: Pan) => tiles.filter((t) => !vanished(t) && panOf(t) === which);
	/** Which way the balance hangs: live through step 1, unless the teacher
	 *  turned the live balance off, and level after. */
	const leaning = $derived.by((): Lean => {
		if (!eq || !liveBalance || step !== 'balance') return { toward: null };
		return lean(net(inPan('left')), net(inPan('right')), eq);
	});
	const tilt = $derived(tiltOf(leaning));
	/** How far each pan hangs down from level, in board pixels. */
	const drops = $derived(bal ? panDrops(bal, tilt) : { left: 0, right: 0 });
	/** How far down a rect on the board is drawn: as far as the pan it's in hangs. */
	const offset = (r: Rect): number => {
		if (!bal) return 0;
		const c = center(r);
		return inside(c, bal.left) ? drops.left : inside(c, bal.right) ? drops.right : 0;
	};
	const lifted = (r: Rect): Rect => ({ ...r, y: r.y + offset(r) });
	/** Where a tile drawn with its corner at (x, y) lies on the board: in a pan
	 *  that hangs down, that far up. Returns the board y. */
	function unlift(kind: Kind, turned: boolean, x: number, y: number): number {
		if (!bal) return y;
		const { w, h } = size(kind, turned);
		const c = { x: x + lenPx(w) / 2, y: y + lenPx(h) / 2 };
		for (const which of ['left', 'right'] as Pan[]) {
			const r = bal[which];
			if (inside(c, { ...r, y: r.y + drops[which] })) return y - drops[which];
		}
		return y;
	}

	// --- undo and redo ---

	// Every change to the tiles can be undone within a step; a passed Check
	// can't be taken back, so moving on to the next step clears the history.
	let past = $state.raw<Tile[][]>([]);
	let future = $state.raw<Tile[][]>([]);
	function change(next: Tile[]) {
		past = [...past.slice(-199), tiles];
		future = [];
		tiles = arrange(next);
	}
	/** Close up the rows on the T's sides, keeping locked tiles in front. Once
	 *  the T has faded, its sides are gone. */
	const arrange = (next: Tile[]) =>
		faded || solving ? next : packSides(next, ARM, (t) => locked.has(t.id));
	function undo() {
		if (!past.length || zeroing) return;
		future = [...future, tiles];
		tiles = past[past.length - 1];
		past = past.slice(0, -1);
		afterHistory();
	}
	function redo() {
		if (!future.length || zeroing) return;
		past = [...past, tiles];
		tiles = future[future.length - 1];
		future = future.slice(0, -1);
		afterHistory();
	}
	function afterHistory() {
		select([]);
		clearMarks();
	}

	// --- marks from the last Check ---

	let wrong = $state<Set<number>>(new Set());
	let gaps = $state<Cell[]>([]);
	/** What a failed Check found wrong: the only message the board shows. */
	let error = $state('');
	let note = $state('');

	// --- hints (Oomba): up to three for the step the student is on, one per press of Hint. "Stuck?" lights up after
	// two Checks that didn't pass, or a minute on the step without getting it. ---
	const hints = $derived(step === 'done' ? [] : hintsFor(step, p, liveBalance));
	let hintShown = $state(0);
	/** The hints box is open (closing it keeps the hints: Hint opens it again, with the next one). */
	let hintOpen = $state(false);
	let fails = $state(0);
	let slow = $state(false);
	let hintTimer: ReturnType<typeof setTimeout> | undefined;
	$effect(() => {
		void step;
		hintShown = 0;
		hintOpen = false;
		fails = 0;
		slow = false;
		clearTimeout(hintTimer);
		if (step !== 'done') hintTimer = setTimeout(() => (slow = true), 60000);
		return () => clearTimeout(hintTimer);
	});
	const stuck = $derived((fails >= 2 || slow) && hintShown < hints.length);
	function showHint() {
		if (hintShown >= hints.length) {
			hintOpen = true;
			return;
		}
		hintShown += 1;
		hintOpen = true;
		slow = false;
		fails = 0;
		clearTimeout(hintTimer);
		hintTimer = setTimeout(() => (slow = true), 60000);
		tapSound();
	}
	function clearMarks() {
		wrong = new Set();
		gaps = [];
		badBoxes = [];
	}
	function forget(id: number) {
		if (wrong.has(id)) wrong = new Set([...wrong].filter((w) => w !== id));
	}

	// --- checking ---

	let answer = $state('');
	/** The last step, where the answer field takes the steps' place in the bar. */
	const answering = $derived(step === 'answer' || step === 'equation');
	/** What the student found, as the bar shows it beside the problem once
	 *  they're done: always the same text, so the bar keeps its size whatever
	 *  was typed. */
	const solved = (() => {
		if (eq) return `x = ${prettyText(String(eq.solution))}`;
		const b = built!;
		if (b.type === 'multiply') return `= ${formatPoly(b.poly)}`;
		const paren = (f: Factor) => (f.x && f.unit ? `(${formatFactor(f)})` : formatFactor(f));
		return `= ${b.factors.map(paren).join('')}`;
	})();

	function checkSidesStep(): Result {
		const onTop = tiles.filter((t) => within(t, topStrip));
		const onLeft = tiles.filter((t) => within(t, leftStrip));
		if (!onTop.length || !onLeft.length)
			return { ok: false, message: 'Put a factor on each side of the T.', wrong: [], gaps: [] };
		const rt = readSide(onTop, 'top');
		if (!rt.ok) return rt;
		const rl = readSide(onLeft, 'left');
		if (!rl.ok) return rl;
		const r =
			built!.type === 'multiply'
				? checkSides(rt.side, rl.side, built!.factors)
				: checkSidesAgainst(rt.side, rl.side, grid!);
		if (r.ok) {
			top = rt.side;
			left = rl.side;
			const ids = [...rt.side, ...rl.side].map((t) => t.id);
			sideIds = new Set(ids);
			locked = new Set([...locked, ...ids]);
		}
		return r;
	}

	/** Solve, step 1: the pans have to be level, x tiles in one, units in the other. */
	function checkPansStep(): Result {
		const r = checkPans(inPan('left'), inPan('right'), eq!, liveBalance);
		if (r.ok) xPan = r.xPan!;
		return r;
	}

	/** Solve, the division step: the units shared evenly among the boxes. Every
	 *  tile the student can still move counts: the x tiles are locked in their boxes. */
	function checkDivideStep(): Result & { badBoxes?: number[] } {
		const d = division!;
		const units = tiles.filter((t) => movable(t) && !vanished(t));
		return checkBoxes(units, (t) => boxIn(d, t), d.boxes.length, unitCount);
	}

	function checkStep(): Result & { note?: string; badBoxes?: number[] } {
		const onMat = tiles.filter((t) => within(t, region));
		const none = { wrong: [], gaps: [] };
		if (step === 'balance') return checkPansStep();
		if (step === 'divide') return checkDivideStep();
		if (step === 'answer') {
			const v = checkSolution(eq!, answer);
			return v.ok ? { ok: true, message: '', ...none } : { ok: false, message: v.message, ...none };
		}
		if (step === 'sides') return checkSidesStep();
		if (step === 'rectangle') {
			if (built!.type === 'multiply') {
				const r = checkProduct(onMat, top, left);
				if (r.ok) product = new Set(onMat.map((t) => t.id));
				return r;
			}
			const r = readRectangle(onMat, built!.poly);
			if (r.ok) {
				grid = r.grid!;
				locked = new Set([...locked, ...onMat.map((t) => t.id)]);
			}
			return r;
		}
		if (step === 'groups') {
			const groups = Object.fromEntries(
				GROUP_KINDS.map((k) => [k, tiles.filter((t) => zoneOf(t) === k)])
			) as Record<Kind, Tile[]>;
			const outside = tiles.filter((t) => product.has(t.id) && !zoneOf(t));
			return checkGroups(outside, groups, built!.poly);
		}
		if (answer.includes('='))
			return { ok: false, message: 'Type just the other side. The = is already there.', ...none };
		const v = checkEquation(built!, `${p.given}=${answer}`);
		return v.ok
			? { ok: true, message: '', note: v.note, ...none }
			: { ok: false, message: v.message, ...none };
	}

	async function check() {
		if (zeroing) return;
		clearMarks();
		const result = checkStep();
		if (!result.ok) {
			wrong = new Set(result.wrong);
			gaps = result.gaps;
			badBoxes = result.badBoxes ?? [];
			error = result.message;
			fails += 1;
			// Oomba: the Kit's soft sound and a small shake of the bar (never a buzzer)
			stepWrong(headerEl);
			return;
		}
		error = '';
		if (result.note) note = result.note;
		const was = step;
		const next = steps[steps.indexOf(step) + 1] ?? 'done';
		step = next;
		// Oomba: the Kit's sounds and effects for a passed step, and the finish (the cheer, confetti, a lesson step done)
		if (next === 'done') {
			if (onfinish) onfinish(headerEl);
			else complete();
		}
		else stepPassed(headerEl);
		past = [];
		future = [];
		select([]);
		if (was === 'balance') lineUp();
		if (was === 'divide') fadeBoxes();
		if (next === 'groups' || was === 'balance' || was === 'divide') {
			await tick();
			fit(650);
		}
		// The answer field takes the steps' place in the bar, ready to type in.
		if (next === 'answer' || next === 'equation') {
			await tick();
			headerEl?.querySelector<HTMLElement>('.equation [aria-label]')?.focus();
		}
	}

	/** Solve, after step 1: the balance fades, leaving its post as a line for =,
	 *  and a box across the line for each x tile, stacked down and as tall as
	 *  the screen allows. Each x tile slides into its own box, lying across, on
	 *  its own side of the line, locked; the units wait in a heap above the
	 *  boxes on theirs. With one x tile, its units go straight into its box.
	 *  Tiles off the balance fade away: they never counted. */
	function lineUp() {
		const b = bal!;
		const order = (a: Tile, c: Tile) => a.y - c.y || a.x - c.x;
		const xs = inPan(xPan).sort(order);
		const units = inPan(unitPan).sort(order);
		const off = tiles.filter((t) => !vanished(t) && !panOf(t));
		const aspect = boardH && boardW ? viewH() / viewW() : 0.6;
		const d = divisionFor(b.pivot.x, b.left.y, b.rows, units.length, xPan, aspect);
		division = d;
		unitCount = units.length;
		const none = { x: null, y: null };
		// Read only here, so it needn't be reactive.
		// eslint-disable-next-line svelte/prefer-svelte-reactivity
		const moved = new Map<number, Tile>();
		xs.forEach((t, i) => {
			const half = boxHalf(d, i, false);
			const x = half.x + (half.w - XLEN) / 2;
			moved.set(t.id, { ...t, turned: false, x, y: half.y + (half.h - UNIT) / 2, at: none });
			if (t.turned) animate(t.id, 'up');
		});
		units.forEach((t, i) => {
			if (d.boxes.length === 1) {
				const half = boxHalf(d, 0, true);
				const across = Math.max(1, Math.floor((half.w - 2 * BOX_PAD) / UNIT));
				const rows = Math.ceil(units.length / across);
				const y0 = half.y + (half.h - rows * UNIT) / 2;
				moved.set(t.id, {
					...t,
					x: half.x + BOX_PAD + (i % across) * UNIT,
					y: y0 + Math.floor(i / across) * UNIT,
					at: none
				});
			} else moved.set(t.id, { ...t, ...heapSpot(d, i), at: none });
		});
		gliding = !still();
		setTimeout(() => (gliding = false), 650);
		tiles = tiles.map((t) => moved.get(t.id) ?? t);
		fadedIds = new Set([...fadedIds, ...off.map((t) => t.id)]);
		const lock = d.boxes.length === 1 ? [...xs, ...units] : xs;
		locked = new Set([...locked, ...lock.map((t) => t.id)]);
	}

	/** Solve, after the division step: every box but the first fades away with
	 *  its tiles, leaving one x tile and its share of the units. */
	function fadeBoxes() {
		const d = division!;
		const inBox = (t: Tile) => {
			const r = rectOf(t);
			const c = { x: r.x + r.w / 2, y: r.y + r.h / 2 };
			return d.boxes.findIndex((b) => inside(c, b));
		};
		const live = tiles.filter((t) => !vanished(t));
		fadedIds = new Set([...fadedIds, ...live.filter((t) => inBox(t) > 0).map((t) => t.id)]);
		locked = new Set([...locked, ...live.map((t) => t.id)]);
	}

	// --- the view: pan and zoom ---

	let boardEl = $state<HTMLDivElement>();
	let toolbarEl = $state<HTMLDivElement>();
	/** How tall the toolbar is: two rows on a phone, so the zoom sits above it. */
	let toolbarH = $state(0);
	let trashEl = $state<HTMLButtonElement>();
	let headerEl = $state<HTMLElement>();
	let boardW = $state(0);
	let boardH = $state(0);
	let panX = $state(0);
	let panY = $state(0);
	let zoom = $state(1);

	const toBoard = (cx: number, cy: number) => {
		const r = boardEl!.getBoundingClientRect();
		return { x: (cx - r.left - panX) / zoom, y: (cy - r.top - panY) / zoom };
	};
	/** A board point in pixels from the board's top-left corner on screen. */
	const toScreen = (x: number, y: number) => ({ x: panX + x * zoom, y: panY + y * zoom });

	/** Whether the student's system asks for less motion: animations then jump. */
	const still = () =>
		typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

	/** The camera move under way, if any, so a new move or a wheel can stop it. */
	let camera = 0;
	/** Move the view to a zoom and pan, eased over `ms`, or at once. Pan and zoom
	 *  move together, through the point on the board that's fixed between them,
	 *  so it's plainly the same board re-framed. */
	function moveView(z: number, x: number, y: number, ms = 0) {
		cancelAnimationFrame(camera);
		if (!ms || still()) {
			zoom = z;
			panX = x;
			panY = y;
			return;
		}
		const from = { z: zoom, x: panX, y: panY };
		const t0 = performance.now();
		const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
		const frame = (now: number) => {
			const t = Math.min(1, (now - t0) / ms);
			const e = ease(t);
			// Zoom eases on a log scale, so zooming in and out feel the same.
			zoom = from.z * (z / from.z) ** e;
			panX = from.x + (x - from.x) * e;
			panY = from.y + (y - from.y) * e;
			if (t < 1) camera = requestAnimationFrame(frame);
		};
		camera = requestAnimationFrame(frame);
	}

	function zoomAt(factor: number, cx: number, cy: number) {
		cancelAnimationFrame(camera);
		const r = boardEl!.getBoundingClientRect();
		const next = Math.min(4, Math.max(0.05, zoom * factor));
		const k = next / zoom;
		panX = cx - r.left - (cx - r.left - panX) * k;
		panY = cy - r.top - (cy - r.top - panY) * k;
		zoom = next;
	}
	/** The zoom buttons: about the middle of the view, eased. */
	function zoomBy(factor: number) {
		const next = Math.min(4, Math.max(0.05, zoom * factor));
		const k = next / zoom;
		moveView(next, boardW / 2 - (boardW / 2 - panX) * k, boardH / 2 - (boardH / 2 - panY) * k, 250);
	}

	/** The room on screen for the board's drawing, clear of the bars. */
	const marginT = () => (headerEl?.offsetHeight ?? 0) + 40;
	const marginB = () => (toolbarEl?.offsetHeight ?? 0) + 48;
	const viewW = () => Math.max(100, boardW - 48);
	const viewH = () => Math.max(100, boardH - marginT() - marginB());

	/** What the view has to show: the mat or the balance, or the division
	 *  step's line and boxes, and every tile. */
	function drawingRects(): Rect[] {
		const shown = tiles.filter((t) => !vanished(t)).map(rectOf);
		if (division && step !== 'balance') {
			const d = division;
			return [
				...(step === 'divide'
					? [{ x: d.line.x - d.half, y: d.line.top, w: 2 * d.half, h: d.line.bottom - d.line.top }]
					: []),
				...d.boxes.filter((_, i) => i === 0 || step === 'divide'),
				...shown
			];
		}
		if (bal && !liveBalance) return [bal.left, bal.right, ...shown];
		if (bal)
			return [
				{
					x: bal.left.x - 20,
					y: bal.pivot.y - 64,
					w: bal.right.x + bal.right.w - bal.left.x + 40,
					h: bal.foot + 24 - (bal.pivot.y - 64)
				},
				...shown
			];
		return [
			{ x: -STRIP, y: -STRIP, w: ARM + STRIP, h: ARM + STRIP },
			...shown,
			...(faded ? GROUP_KINDS.map((k) => zones[k]) : [])
		];
	}

	/** Zoom to show everything that matters, filling the room clear of the bars:
	 *  at once as the page opens, eased (`ms`) when a step re-frames the board. */
	function fit(ms = 0) {
		if (!boardEl) return;
		// Read the size directly: on the first fit, the bound size isn't in yet.
		boardW = boardEl.clientWidth;
		boardH = boardEl.clientHeight;
		const box = bounds(drawingRects());
		const w = viewW();
		const h = viewH();
		const z = Math.min(division && step !== 'balance' ? 3 : 1.5, w / box.w, h / box.h);
		moveView(
			z,
			24 + (w - box.w * z) / 2 - box.x * z,
			marginT() + (h - box.h * z) / 2 - box.y * z,
			ms
		);
	}

	onMount(() => {
		// After the first layout, once the bars have their sizes.
		requestAnimationFrame(() => {
			fit();
		});
		// Wheel and trackpad: scrolling pans, and pinching (which browsers send as
		// ctrl + wheel) or ctrl/⌘ + scroll zooms around the pointer.
		const wheel = (e: WheelEvent) => {
			e.preventDefault();
			cancelAnimationFrame(camera);
			if (e.ctrlKey || e.metaKey) zoomAt(Math.exp(-e.deltaY * 0.01), e.clientX, e.clientY);
			else {
				panX -= e.deltaX;
				panY -= e.deltaY;
			}
		};
		boardEl!.addEventListener('wheel', wheel, { passive: false });
		return () => boardEl?.removeEventListener('wheel', wheel);
	});

	// --- selecting, panning and pinching ---

	// Like a whiteboard app, the board has two tools. With Select, dragging
	// empty board draws a box that selects the tiles it touches; with Hand, or
	// while the space bar is held, it pans. Scrolling pans and pinching zooms
	// with either. Only presses that start on empty board land here: a tile's
	// own press stops at the tile.
	type Tool = 'select' | 'hand';
	let tool = $state<Tool>('select');
	let spaceHeld = $state(false);
	const panning = $derived(tool === 'hand' || spaceHeld);

	/** The tiles selected, whose buttons show above them. */
	let selected = $state(new Set<number>());
	const select = (ids: Iterable<number>) => (selected = new Set(ids));
	/** The box being dragged out to select tiles, in board pixels. */
	let marquee = $state<{ x0: number; y0: number; x1: number; y1: number; add: boolean } | null>(
		null
	);

	// Read only inside the pointer handlers, so it needn't be reactive.
	// eslint-disable-next-line svelte/prefer-svelte-reactivity
	const pointers = new Map<number, { x: number; y: number }>();
	let pinch: { d: number; mx: number; my: number } | null = null;
	let panMoved = false;

	function boardDown(e: PointerEvent) {
		cancelAnimationFrame(camera);
		boardEl!.setPointerCapture(e.pointerId);
		pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
		panMoved = false;
		if (pointers.size === 2) {
			const [a, b] = [...pointers.values()];
			pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
			marquee = null;
		} else if (pointers.size === 1 && !panning && e.button === 0) {
			const pt = toBoard(e.clientX, e.clientY);
			marquee = { x0: pt.x, y0: pt.y, x1: pt.x, y1: pt.y, add: e.shiftKey };
		}
	}
	function boardMove(e: PointerEvent) {
		const last = pointers.get(e.pointerId);
		if (!last) return;
		pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
		if (pointers.size === 2 && pinch) {
			// Two fingers zoom by how far apart they are, and pan as they move together.
			const [a, b] = [...pointers.values()];
			const d = Math.hypot(a.x - b.x, a.y - b.y);
			const mx = (a.x + b.x) / 2;
			const my = (a.y + b.y) / 2;
			panX += mx - pinch.mx;
			panY += my - pinch.my;
			zoomAt(d / pinch.d, mx, my);
			pinch = { d, mx, my };
			panMoved = true;
		} else if (pointers.size === 1 && marquee) {
			const pt = toBoard(e.clientX, e.clientY);
			marquee.x1 = pt.x;
			marquee.y1 = pt.y;
			if (Math.hypot(marquee.x1 - marquee.x0, marquee.y1 - marquee.y0) * zoom > 4) panMoved = true;
		} else if (pointers.size === 1) {
			const dx = e.clientX - last.x;
			const dy = e.clientY - last.y;
			panX += dx;
			panY += dy;
			if (Math.hypot(dx, dy) > 1) panMoved = true;
		}
	}
	function boardUp(e: PointerEvent) {
		// Only presses that began on empty board count: a tile dragged here and let
		// go is placed by its own drag, not placed again by this tap.
		if (!pointers.delete(e.pointerId)) return;
		if (pointers.size < 2) pinch = null;
		const box = marquee;
		marquee = null;
		if (box && panMoved) {
			const r = boxRect(box);
			const caught = selectable().filter((t) => {
				const o = lifted(rectOf(t));
				return o.x < r.x + r.w && r.x < o.x + o.w && o.y < r.y + r.h && r.y < o.y + o.h;
			});
			select([...(box.add ? selected : []), ...caught.map((t) => t.id)]);
			return;
		}
		if (panMoved || pointers.size) return;
		// A tap on empty board places the tile picked in the tray, or lets go of
		// the selected tiles.
		if (!e.shiftKey) select([]);
		if (picked) {
			const { w, h } = size(picked.kind, picked.turned);
			place(
				{
					source: { from: 'tray' },
					kind: picked.kind,
					sign: picked.sign,
					turned: picked.turned,
					dx: lenPx(w) / 2,
					dy: lenPx(h) / 2,
					group: []
				},
				e.clientX,
				e.clientY
			);
		}
	}
	const boxRect = (m: { x0: number; y0: number; x1: number; y1: number }): Rect => ({
		x: Math.min(m.x0, m.x1),
		y: Math.min(m.y0, m.y1),
		w: Math.abs(m.x1 - m.x0),
		h: Math.abs(m.y1 - m.y0)
	});

	// --- moving tiles ---

	type Source = { from: 'tray' } | { from: 'board'; id: number };
	interface Held {
		source: Source;
		kind: Kind;
		sign: Sign;
		turned: boolean;
		/** Where the tile was grabbed, in board pixels from its top-left corner. */
		dx: number;
		dy: number;
		/** The other selected tiles, which move with it. */
		group: number[];
		/** Alt/Option is held: copies go where it's let go, and the tiles stay put. */
		copy?: boolean;
	}
	let drag = $state<
		| (Held & {
				startX: number;
				startY: number;
				cx: number;
				cy: number;
				moved: boolean;
				shift: boolean;
		  })
		| null
	>(null);
	/** The tray tile tapped, waiting for a tap on the board. */
	let picked = $state<{ kind: Kind; sign: Sign; turned: boolean } | null>(null);
	/** The last tap on a board tile, to tell a double tap. */
	let lastTap = { id: -1, at: 0 };

	const movable = (t: Tile) => step !== 'done' && !locked.has(t.id) && !zeroing?.ids.includes(t.id);
	/** The tiles a student can select: every one they can still move. */
	const selectable = () => tiles.filter((t) => movable(t) && !vanished(t));

	/** Start holding a tile. `scale` is how many screen pixels its element draws per board pixel. */
	function grab(e: PointerEvent, held: Omit<Held, 'dx' | 'dy' | 'group'>, scale: number) {
		e.stopPropagation();
		e.preventDefault();
		// Measured from the tile itself: in the tray it sits in the middle of a bigger slot.
		const el = e.currentTarget as HTMLElement;
		const r = (el.querySelector('.tile') ?? el).getBoundingClientRect();
		const id = held.source.from === 'board' ? held.source.id : null;
		// A selected tile drags the whole selection along with it.
		const group = id !== null && selected.has(id) ? [...selected].filter((o) => o !== id) : [];
		drag = {
			...held,
			dx: (e.clientX - r.left) / scale,
			dy: (e.clientY - r.top) / scale,
			group,
			startX: e.clientX,
			startY: e.clientY,
			cx: e.clientX,
			cy: e.clientY,
			moved: false,
			shift: e.shiftKey,
			copy: e.altKey
		};
	}

	function dragMove(e: PointerEvent) {
		if (!drag) return;
		drag.cx = e.clientX;
		drag.cy = e.clientY;
		drag.copy = e.altKey;
		if (!drag.moved && Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) > 4) {
			drag.moved = true;
			if (!drag.group.length) select([]);
		}
	}

	function dragUp(e: PointerEvent) {
		if (!drag) return;
		const held = { ...drag, copy: e.altKey };
		drag = null;
		if (held.moved) place(held, e.clientX, e.clientY);
		else tap(held, held.shift);
	}

	function tap(held: Held, shift: boolean) {
		if (held.source.from === 'tray') {
			const same = picked?.kind === held.kind && picked.sign === held.sign;
			picked = same ? null : { kind: held.kind, sign: held.sign, turned: held.turned };
			return;
		}
		const id = held.source.id;
		// Shift adds a tile to the selection, or takes it out.
		if (shift) {
			select(selected.has(id) ? [...selected].filter((o) => o !== id) : [...selected, id]);
			return;
		}
		const now = Date.now();
		// A double tap turns the tile; a single tap selects it.
		if (lastTap.id === id && now - lastTap.at < 350) {
			turnAll([id]);
			lastTap = { id: -1, at: 0 };
			select([id]);
			return;
		}
		lastTap = { id, at: now };
		select(selected.size === 1 && selected.has(id) ? [] : [id]);
	}

	const hit = (el: HTMLElement | undefined, cx: number, cy: number) => {
		const r = el?.getBoundingClientRect();
		return !!r && cx >= r.left && cx <= r.right && cy >= r.top && cy <= r.bottom;
	};

	/** On a side of the T, a tile lies in the side's single row: its inner edge
	 *  against the side's line. Elsewhere it's free on both axes. */
	function pinFor(kind: Kind, turned: boolean, x: number, y: number): { x?: number; y?: number } {
		const { w, h } = size(kind, turned);
		const landing = { x, y, w: lenPx(w), h: lenPx(h) };
		if (solving || faded) return {};
		if (within(landing, topStrip)) return { y: -GAP - lenPx(h) };
		if (within(landing, leftStrip)) return { x: -GAP - lenPx(w) };
		return {};
	}

	/** The T's sides for snapping to, or none in Solve, which has no T. */
	const sides = (): [SideTile[] | null, SideTile[] | null] =>
		solving ? [null, null] : [top, left];

	/** The board with a tile set down at (x, y): on a side of the T it joins the
	 *  side's row, and anywhere else it snaps to the edges near it. Not yet
	 *  arranged: `change` closes up the rows. */
	function land(
		t: Omit<Tile, 'x' | 'y' | 'at'>,
		x: number,
		y: number,
		base: Tile[] = tiles
	): Tile[] {
		const pin = pinFor(t.kind, t.turned, x, y);
		const others = base.filter((o) => o.id !== t.id && !vanished(o));
		// In a row of the division step, the tile still snaps along the row to its neighbors.
		const at =
			pin.x !== undefined || (pin.y !== undefined && !solving)
				? { x: pin.x ?? x, y: pin.y ?? y, at: { x: null, y: null } }
				: settle(t, x, y, others, ...sides(), SNAP_REACH / zoom, pin);
		return [...base.filter((o) => o.id !== t.id), { ...t, ...at }];
	}

	/** The board with a held tile let go where the pointer is. The tile snaps,
	 *  and the rest of the selection keeps its place around it, moving as far.
	 *  Copying (Alt-drag), the tiles held stay where they were and copies,
	 *  with new ids, are added where they're let go. */
	function drop(held: Held, cx: number, cy: number, id: number): Tile[] {
		const pt = toBoard(cx, cy);
		const { kind, sign, turned } = held;
		const copying = !!held.copy && held.source.from === 'board';
		const src = held.source.from === 'board' ? held.source.id : id;
		const group = new Set(held.group);
		const base = copying ? tiles : tiles.filter((t) => !group.has(t.id));
		const x = pt.x - held.dx;
		const copyId = copying ? nextId + 1000 : id;
		const next = land(
			{ id: copyId, kind, sign, turned },
			x,
			unlift(kind, turned, x, pt.y - held.dy),
			base
		);
		const now = next.find((t) => t.id === copyId)!;
		const was = tiles.find((t) => t.id === src) ?? now;
		const shift = (a: Len | null, b: Len | null, o: Len | null) =>
			a && b && o ? lenAdd(o, lenSub(b, a)) : null;
		const moved = tiles
			.filter((t) => group.has(t.id))
			.map((t) => ({
				...t,
				x: t.x + now.x - was.x,
				y: t.y + now.y - was.y,
				at: { x: shift(was.at.x, now.at.x, t.at.x), y: shift(was.at.y, now.at.y, t.at.y) }
			}));
		if (!copying) return [...next, ...moved];
		const copies = [now, ...moved].map((t, i) => ({ ...t, id: i ? nextId + 1000 + i : copyId }));
		return [...tiles, ...copies];
	}

	/** Put a held tile down where the pointer is. A tile can go anywhere. */
	function place(held: Held, cx: number, cy: number) {
		picked = null;
		const copying = !!held.copy && held.source.from === 'board';
		if (hit(trashEl, cx, cy) || hit(toolbarEl, cx, cy)) {
			if (held.source.from === 'board' && !copying) remove([held.source.id, ...held.group]);
			return;
		}
		if (copying) {
			// Number the copies for real, in order, now that they're kept.
			const before = new Set(tiles.map((t) => t.id));
			const made = drop(held, cx, cy, -1)
				.filter((t) => !before.has(t.id))
				.map((t) => ({ ...t, id: nextId++ }));
			change([...tiles, ...made]);
			select(made.map((t) => t.id));
			return;
		}
		const id = held.source.from === 'board' ? held.source.id : nextId++;
		change(drop(held, cx, cy, id));
		forget(id);
		held.group.forEach(forget);
		// A selection moved together stays selected; a single tile is let go.
		select(held.group.length ? [id, ...held.group] : []);
	}

	/** A tile as copied: what it is, where it lay, and which pan it was in. */
	type Copied = Pick<Tile, 'kind' | 'sign' | 'turned' | 'x' | 'y' | 'at'> & { pan: Pan | null };
	const copied = (t: Tile): Copied => ({
		kind: t.kind,
		sign: t.sign,
		turned: t.turned,
		x: t.x,
		y: t.y,
		at: t.at,
		pan: bal && step === 'balance' ? panOf(t) : null
	});

	/** Copies of a block of tiles, laid out the same, directly below it and
	 *  flush, or further down past anything in the way. Each copy stays in its
	 *  original's pan, which grows taller to fit; a copy from off the balance
	 *  stays off it. Copies lined up with the mat know where they lie on it. */
	function below(block: Copied[]): Tile[] {
		const rects = block.map(rectOf);
		const others = tiles.filter((t) => !vanished(t)).map(rectOf);
		const pans = bal && step === 'balance' ? [bal.left, bal.right] : [];
		const dy = stackBelow(rects, (i) => (block[i].pan ? others : [...others, ...pans]));
		// The block's height as a length, if it's lined up with the mat, so the
		// copies are lined up too.
		const tops = block.map((c) => c.at.y);
		let tall: Len | null = null;
		if (tops.every(Boolean)) {
			const top = tops.reduce((a, b) => (lenPx(b!) < lenPx(a!) ? b : a))!;
			const ends = block.map((c) => lenAdd(c.at.y!, size(c.kind, c.turned).h));
			const end = ends.reduce((a, b) => (lenPx(b) > lenPx(a) ? b : a));
			tall = lenSub(end, top);
			if (Math.abs(lenPx(tall) - dy) > 0.5) tall = null;
		}
		const made = block.map((c) => ({
			id: nextId++,
			kind: c.kind,
			sign: c.sign,
			turned: c.turned,
			x: c.x,
			y: c.y + dy,
			at: { x: c.at.x, y: c.at.y && tall ? lenAdd(c.at.y, tall) : null }
		}));
		growPans(made.filter((_, i) => block[i].pan));
		return made;
	}

	/** Solve: grow both pans, together, tall enough to hold these tiles. */
	function growPans(inPans: Tile[]) {
		if (!bal || !inPans.length) return;
		const need = Math.max(...inPans.map((t) => t.y + rectOf(t).h)) + PAN_PAD - bal.left.y;
		if (need > bal.left.h) bal = withHeight(bal, need);
	}

	/** Copies of tiles. A selection's copies go directly below it, laid out the
	 *  same (see `below`); copies of tiles in one row on a side of the T go on
	 *  along the row. The copies are selected, so the next Duplicate copies on. */
	function duplicate(ids: number[]) {
		const chosen = tiles.filter((t) => ids.includes(t.id) && movable(t) && !vanished(t));
		if (!chosen.length) return;
		const row = !faded && !solving ? rowOf(chosen[0], ARM) : null;
		if (row && chosen.every((t) => rowOf(t, ARM) === row)) {
			const along = (r: Rect) => (row === 'top' ? [r.x, r.w] : [r.y, r.h]);
			const rowEnd = Math.max(
				...tiles
					.filter((t) => rowOf(t, ARM) === row)
					.map((t) => along(rectOf(t)).reduce((a, b) => a + b))
			);
			const start = Math.min(...chosen.map((t) => along(rectOf(t))[0]));
			const copies = chosen.map((t) => ({
				...t,
				id: nextId++,
				x: row === 'top' ? t.x + rowEnd - start : t.x,
				y: row === 'left' ? t.y + rowEnd - start : t.y,
				at: { x: null, y: null }
			}));
			change([...tiles, ...copies]);
			select(copies.map((t) => t.id));
			return;
		}
		const made = below(chosen.map(copied));
		change([...tiles, ...made]);
		select(made.map((t) => t.id));
	}

	function remove(ids: number[]) {
		const gone = new Set(ids.filter((id) => tiles.some((t) => t.id === id && movable(t))));
		if (!gone.size) return;
		change(tiles.filter((t) => !gone.has(t.id)));
		select([...selected].filter((id) => !gone.has(id)));
	}

	/** Tiles copied with Ctrl/⌘ + C or X, as they lay, kept in the page, not the
	 *  system clipboard. After each paste it holds the pasted tiles, so the
	 *  next paste goes below those. */
	let clipboard: Copied[] = [];
	/** The clipboard's tiles were cut, so the next paste puts them back where they were. */
	let cutFrom = false;

	function copy(ids: number[], cut = false): boolean {
		const chosen = tiles.filter((t) => ids.includes(t.id) && movable(t) && !vanished(t));
		if (!chosen.length) return false;
		clipboard = chosen.map(copied);
		cutFrom = cut;
		return true;
	}

	/** The copied tiles, directly below what was copied (or the last paste), or,
	 *  just after a cut, back where they were. The pasted tiles are selected. */
	function paste() {
		if (!clipboard.length || step === 'done') return;
		const made = cutFrom
			? clipboard.map((c) => ({
					id: nextId++,
					kind: c.kind,
					sign: c.sign,
					turned: c.turned,
					x: c.x,
					y: c.y,
					at: c.at
				}))
			: below(clipboard);
		clipboard = made.map((t, i) => ({ ...copied(t), pan: clipboard[i].pan }));
		cutFrom = false;
		change([...tiles, ...made]);
		select(made.map((t) => t.id));
	}

	const bounds = (rects: Rect[]): Rect => {
		const x = Math.min(...rects.map((r) => r.x));
		const y = Math.min(...rects.map((r) => r.y));
		return {
			x,
			y,
			w: Math.max(...rects.map((r) => r.x + r.w)) - x,
			h: Math.max(...rects.map((r) => r.y + r.h)) - y
		};
	};

	// --- turning and flipping a tile, with a little animation for each ---

	/** Tiles mid-turn, and which way: an x tile swings about its end, down to
	 *  stand up or up to lie flat. */
	let spinning = $state(new Map<number, 'down' | 'up'>());
	let flippingTile = $state(new Set<number>());
	function animate(id: number, how: 'down' | 'up' | 'flip') {
		if (how === 'flip') flippingTile = new Set([...flippingTile, id]);
		else spinning = new Map([...spinning, [id, how]]);
		setTimeout(() => {
			if (how === 'flip') flippingTile = new Set([...flippingTile].filter((i) => i !== id));
			else spinning = new Map([...spinning].filter(([i]) => i !== id));
		}, 300);
	}

	/** Whether a tile can turn: an x tile, and not on a side of the T, which
	 *  holds its tiles the way they run. */
	const turnable = (t: Tile) =>
		t.kind === 'x' && movable(t) && (faded || solving || !rowOf(t, ARM));

	/** An x tile turned about its end, snapped to what's near it. */
	function turned(t: Tile, base: Tile[]): Tile {
		const next = { ...t, turned: !t.turned };
		const others = base.filter((o) => o.id !== t.id && !vanished(o));
		const pin = pinFor(t.kind, next.turned, t.x, t.y);
		return { ...next, ...settle(next, t.x, t.y, others, ...sides(), SNAP_REACH / zoom, pin) };
	}

	/** Turn the x tiles among these, each about its own end. */
	function turnAll(ids: number[]) {
		let next = tiles;
		for (const id of ids) {
			const t = next.find((t) => t.id === id);
			if (!t || !turnable(t)) continue;
			const after = turned(t, next);
			next = next.map((o) => (o.id === id ? after : o));
			forget(id);
			animate(id, after.turned ? 'down' : 'up');
		}
		if (next !== tiles) change(next);
	}

	/** Flip these tiles over to their opposites. */
	function flipAll(ids: number[]) {
		const flip = new Set(ids.filter((id) => tiles.some((t) => t.id === id && movable(t))));
		if (!flip.size) return;
		change(tiles.map((o) => (flip.has(o.id) ? { ...o, sign: -o.sign as Sign } : o)));
		for (const id of flip) {
			forget(id);
			animate(id, 'flip');
		}
	}

	// --- zeroing out zero pairs: a rumble, the two slide into each other, and a poof ---

	const pairs = $derived(zeroPairs(tiles.filter((t) => movable(t) && !vanished(t))));
	const partner = (id: number) => {
		const pair = pairs.find(([a, b]) => a.id === id || b.id === id);
		return pair ? (pair[0].id === id ? pair[1] : pair[0]) : null;
	};
	let zeroing = $state<{
		ids: number[];
		phase: 'rumble' | 'merge';
		to: Record<number, { x: number; y: number }>;
		/** How long the slide together takes: longer when the pairs lie further apart. */
		ms: number;
	} | null>(null);

	/** One bit of a poof: a puff of cloud, a speck of dust or a sparkle, heading
	 *  out from the middle by (dx, dy). */
	interface Bit {
		type: 'cloud' | 'speck' | 'sparkle';
		dx: number;
		dy: number;
		d: number;
		delay: number;
		spin: number;
	}
	let poofs = $state<{ id: number; x: number; y: number; zero: number; bits: Bit[] }[]>([]);
	const RUMBLE_MS = 480;
	const MERGE_MS = 280;
	/** The cloud starts billowing just before the tiles meet, so it covers them as they go. */
	const POOF_LEAD_MS = 90;
	/** Until the 0 left behind has faded away. */
	const POOF_MS = 2800;

	/** A soft cartoon cloud over the pair: puffs spread across where the tiles
	 *  were, that billow out and drift up, with dust flying further and a few
	 *  sparkles. */
	function poofBits(w: number, h: number): Bit[] {
		const rnd = (lo: number, hi: number) => lo + Math.random() * (hi - lo);
		const puff = Math.min(72, Math.max(30, Math.max(w, h) * 0.42));
		const rx = Math.max(w / 2, puff * 0.6) * 0.8;
		const ry = Math.max(h / 2, puff * 0.5) * 0.8;
		const ring = (n: number, type: Bit['type'], far: [number, number], d: [number, number]) =>
			Array.from({ length: n }, (_, i): Bit => {
				const a = ((i + rnd(-0.25, 0.25)) / n) * 2 * Math.PI;
				const r = rnd(...far);
				return {
					type,
					dx: Math.cos(a) * (rx + puff * 0.3) * r,
					dy: Math.sin(a) * (ry + puff * 0.3) * r,
					d: rnd(...d) * puff,
					delay: type === 'sparkle' ? rnd(120, 220) : rnd(0, 50),
					spin: rnd(-90, 90)
				};
			});
		const middle = [-0.4, 0, 0.4].map((f): Bit => ({
			type: 'cloud',
			dx: f * rx,
			dy: rnd(-4, 4),
			d: 1.2 * puff,
			delay: 0,
			spin: 0
		}));
		return [
			...ring(12, 'speck', [1.5, 2.1], [0.1, 0.18]),
			...middle,
			...ring(9, 'cloud', [0.8, 1], [0.7, 1]),
			...ring(4, 'sparkle', [1.4, 1.7], [0.32, 0.42])
		];
	}

	/** The zero pairs these selected tiles make. One tile pairs with the
	 *  opposite tile lying flush against it, or a selected opposite; several
	 *  pair up nearest first, but in Solve only within one pan, or both off the
	 *  balance, never across the middle. */
	function pairsIn(chosen: Tile[]): [Tile, Tile][] {
		const region = (t: Tile) => (bal && step === 'balance' ? panOf(t) : null);
		if (chosen.length === 1) {
			const other = partner(chosen[0].id);
			return other ? [[chosen[0], other]] : [];
		}
		return pairUp(chosen, region);
	}

	/** Zero out these pairs together: they rumble, each pair slides into each
	 *  other, and they poof. */
	function zeroOut(pairs: [Tile, Tile][]) {
		if (!pairs.length || zeroing) return;
		const to: Record<number, { x: number; y: number }> = {};
		const spots = pairs.map(([t, other]) => {
			const a = rectOf(t);
			const b = rectOf(other);
			const mid = {
				x: (Math.min(a.x, b.x) + Math.max(a.x + a.w, b.x + b.w)) / 2,
				y: (Math.min(a.y, b.y) + Math.max(a.y + a.h, b.y + b.h)) / 2
			};
			// The middle between them, or between their middles when they lie apart.
			const ca = center(a);
			const cb = center(b);
			const meet = flushPair(t, other) ? mid : { x: (ca.x + cb.x) / 2, y: (ca.y + cb.y) / 2 };
			// How far each tile slides to land right on top of the other.
			to[t.id] = { x: meet.x - ca.x, y: meet.y - ca.y };
			to[other.id] = { x: meet.x - cb.x, y: meet.y - cb.y };
			return { meet, a, b, far: Math.hypot(ca.x - cb.x, ca.y - cb.y) };
		});
		const ids = pairs.flat().map((t) => t.id);
		const ms = Math.min(700, Math.max(MERGE_MS, Math.max(...spots.map((p) => p.far)) * 1.2));
		const paired = new Set(ids);
		// Tiles left without a partner stay selected.
		select([...selected].filter((id) => !paired.has(id)));
		// With less motion asked for, the pairs just go.
		if (still()) {
			change(tiles.filter((o) => !paired.has(o.id)));
			return;
		}
		zeroing = { ids, phase: 'rumble', to, ms };
		setTimeout(() => zeroing && (zeroing = { ...zeroing, phase: 'merge' }), RUMBLE_MS);
		setTimeout(
			() => {
				const made = spots.map(({ meet, a, b }) => {
					const w = Math.max(a.w, b.w);
					const h = Math.max(a.h, b.h);
					// The 0 they make, as big as the pair allows, waiting under the cloud.
					const zero = Math.min(48, Math.max(26, Math.min(w, h) * 0.95));
					// Drawn where the pair is seen, in a pan that hangs down.
					return { id: nextId++, x: meet.x, y: meet.y + offset(a), zero, bits: poofBits(w, h) };
				});
				poofs = [...poofs, ...made];
				const gone = new Set(made.map((q) => q.id));
				setTimeout(() => (poofs = poofs.filter((q) => !gone.has(q.id))), POOF_MS);
			},
			RUMBLE_MS + ms - POOF_LEAD_MS
		);
		setTimeout(() => {
			zeroing = null;
			change(tiles.filter((o) => !paired.has(o.id)));
		}, RUMBLE_MS + ms);
	}

	/** Whether two tiles lie flush, as `zeroPairs` finds them. */
	const flushPair = (a: Tile, b: Tile) => zeroPairs([a, b]).length === 1;

	// --- the buttons above the selected tiles ---

	const focus = $derived.by(() => {
		if (drag?.moved || zeroing || marquee) return null;
		const chosen = tiles.filter((t) => selected.has(t.id) && movable(t) && !vanished(t));
		if (!chosen.length) return null;
		// One tile in a zero pair can zero out; the buttons then sit above both
		// tiles, so neither is hidden.
		const zero = pairsIn(chosen);
		const other = chosen.length === 1 && zero.length ? zero[0][1] : null;
		const box = bounds([...chosen, ...(other ? [other] : [])].map(rectOf));
		return {
			ids: chosen.map((t) => t.id),
			canTurn: chosen.some(turnable),
			zero,
			x: box.x + box.w / 2,
			y: box.y + offset(box)
		};
	});

	// --- the tray ---

	let traySign = $state<Sign>(1);
	let trayTurned = $state(false);
	let flipping = $state(false);
	/** Each tray tile turns over about its own middle, and shows its other side. */
	function flipTray() {
		flipping = true;
		setTimeout(() => {
			traySign = -traySign as Sign;
			flipping = false;
		}, 150);
		picked = null;
	}
	/** Whether the tray's x tile has turned yet, so it doesn't spin as the page opens. */
	let trayTurnedOnce = $state(false);
	function turnTray() {
		trayTurned = !trayTurned;
		trayTurnedOnce = true;
		if (picked?.kind === 'x') picked.turned = trayTurned;
	}
	const TRAY_KINDS: Kind[] = ['x2', 'x', 'unit'];
	const TRAY_SCALE = 0.72;

	// Where the held tiles will land, shown as outlines while they're dragged.
	const landing = $derived.by(() => {
		if (!drag?.moved || !boardEl) return [];
		if (hit(trashEl, drag.cx, drag.cy) || hit(toolbarEl, drag.cx, drag.cy)) return [];
		const id = drag.source.from === 'board' ? drag.source.id : -1;
		const copying = drag.copy && drag.source.from === 'board';
		const before = new Set(tiles.map((t) => t.id));
		const moving = new Set([id, ...drag.group]);
		return arrange(drop(drag, drag.cx, drag.cy, id))
			.filter((t) => (copying ? !before.has(t.id) : moving.has(t.id)))
			.map((t) => lifted(rectOf(t)));
	});

	/** The board tiles being dragged, drawn by their ghosts while their places stay empty. */
	const held = $derived(
		drag?.moved && drag.source.from === 'board' && !drag.copy
			? new Set([drag.source.id, ...drag.group])
			: null
	);
	/** The ghosts: the tile under the pointer and the rest of the selection, as
	 *  far from it as they lie on the board. */
	const ghosts = $derived.by(() => {
		if (!drag?.moved) return [];
		const main = { kind: drag.kind, sign: drag.sign, turned: drag.turned, ox: 0, oy: 0 };
		if (drag.source.from === 'tray') return [main];
		const at = tiles.find((t) => t.id === (drag!.source as { id: number }).id)!;
		const rest = tiles
			.filter((t) => drag!.group.includes(t.id))
			.map((t) => ({
				kind: t.kind,
				sign: t.sign,
				turned: t.turned,
				ox: t.x - at.x,
				oy: t.y - at.y
			}));
		return [main, ...rest];
	});
	const holdingBoardTile = $derived(!!held);
	const overTrash = $derived(holdingBoardTile && hit(trashEl, drag!.cx, drag!.cy));

	const typing = (e: KeyboardEvent) =>
		e.target instanceof HTMLElement &&
		(e.target.isContentEditable || !!e.target.closest('input, textarea, .mf-field'));

	function key(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			picked = null;
			confirmingReset = false;
			select([]);
		}
		if (e.key === 'Alt' && drag) drag.copy = true;
		if (typing(e)) return;
		const mod = e.ctrlKey || e.metaKey;
		const k = e.key.toLowerCase();
		if (mod && k === 'z') {
			e.preventDefault();
			if (e.shiftKey) redo();
			else undo();
		} else if (mod && k === 'y') {
			e.preventDefault();
			redo();
		} else if (mod && k === 'a') {
			e.preventDefault();
			select(selectable().map((t) => t.id));
		} else if (mod && k === 'd') {
			e.preventDefault();
			duplicate([...selected]);
		} else if (mod && (e.code === 'KeyC' || e.code === 'KeyX' || k === 'c' || k === 'x')) {
			// With no tiles selected, leave it to the browser, to copy text.
			const cut = e.code === 'KeyX' || k === 'x';
			if (!selected.size || !copy([...selected], cut)) return;
			e.preventDefault();
			if (cut) remove([...selected]);
		} else if (mod && (k === 'v' || e.code === 'KeyV') && clipboard.length) {
			e.preventDefault();
			paste();
		} else if ((e.key === 'Delete' || e.key === 'Backspace') && selected.size) {
			e.preventDefault();
			remove([...selected]);
		} else if (mod || e.altKey) {
			return;
		} else if (k === '0' && focus?.zero.length) {
			e.preventDefault();
			zeroOut(focus.zero);
		} else if (k === 'v') tool = 'select';
		else if (k === 'h') tool = 'hand';
		else if (e.key === ' ') {
			e.preventDefault();
			spaceHeld = true;
		}
	}
	function keyUp(e: KeyboardEvent) {
		if (e.key === ' ') spaceHeld = false;
		if (e.key === 'Alt' && drag) drag.copy = false;
	}

	// --- starting again ---

	/** Whether the Reset button is asking to be sure. */
	let confirmingReset = $state(false);

	/** Back to step 1, with the starting tiles where they began. Asked first,
	 *  since passed Checks can't be undone. */
	async function reset() {
		confirmingReset = false;
		if (zeroing) return;
		step = steps[0];
		nextId = 1;
		tiles = startingTiles();
		bal = firstBal;
		top = [];
		left = [];
		sideIds = new Set();
		locked = new Set();
		grid = null;
		product = new Set();
		xPan = 'left';
		fadedIds = new Set();
		division = null;
		unitCount = 0;
		answer = '';
		error = '';
		note = '';
		past = [];
		future = [];
		clipboard = [];
		cutFrom = false;
		select([]);
		clearMarks();
		await tick();
		fit(500);
	}
</script>

{#snippet piece(t: Tile)}
	{@const moving = zeroing?.ids.includes(t.id) ? zeroing : null}
	<button
		type="button"
		class="piece"
		class:fixed={!movable(t)}
		class:locked={sideIds.has(t.id)}
		class:gone={vanished(t)}
		class:selected={selected.has(t.id)}
		class:held={held?.has(t.id)}
		class:glide={gliding}
		class:rumble={moving?.phase === 'rumble'}
		class:merge={moving?.phase === 'merge'}
		style:left="{t.x}px"
		style:top="{t.y}px"
		style:--to-x="{moving?.to[t.id].x ?? 0}px"
		style:--to-y="{moving?.to[t.id].y ?? 0}px"
		style:--merge-ms="{moving?.ms ?? 280}ms"
		aria-label="{t.sign < 0 ? 'negative ' : ''}{t.kind === 'x2' ? 'x squared' : t.kind} tile"
		onpointerdown={(e) =>
			movable(t)
				? grab(
						e,
						{
							source: { from: 'board', id: t.id },
							kind: t.kind,
							sign: t.sign,
							turned: t.turned
						},
						zoom
					)
				: undefined}
	>
		<span
			class="face"
			class:swing-down={spinning.get(t.id) === 'down'}
			class:swing-up={spinning.get(t.id) === 'up'}
			class:flip={flippingTile.has(t.id)}
			style:--pivot="{UNIT / 2}px"
		>
			<TileView kind={t.kind} sign={t.sign} turned={t.turned} wrong={wrong.has(t.id)} />
		</span>
	</button>
{/snippet}

<svelte:window
	onpointermove={(e) => {
		dragMove(e);
	}}
	onpointerup={dragUp}
	onkeydown={key}
	onkeyup={keyUp}
	onblur={() => (spaceHeld = false)}
	onpointerdown={(e) => {
		if (confirmingReset && !(e.target as Element).closest?.('.reset-wrap')) confirmingReset = false;
	}}
/>

<div class="activity" style:--toolbar-h="{toolbarH}px">
	<!-- The whiteboard. Everything inside .layer is in board pixels and zooms together. -->
	<div
		class="board"
		class:placing={picked}
		class:panning
		bind:this={boardEl}
		bind:clientWidth={boardW}
		bind:clientHeight={boardH}
		onpointerdown={boardDown}
		onpointermove={boardMove}
		onpointerup={boardUp}
		onpointercancel={boardUp}
		role="application"
		aria-label="Algebra tiles board"
	>
		<div class="layer" style:transform="translate({panX}px, {panY}px) scale({zoom})">
			{#if bal}
				{#if !liveBalance}
					<!-- With the live balance off, no balance: the equation's two sides,
					     dashed boxes either side of a line standing for =. -->
					{#each [bal.left, bal.right] as r, i (i)}
						<div
							class="box side-box"
							class:gone={!!division}
							style:left="{r.x}px"
							style:top="{r.y}px"
							style:width="{r.w}px"
							style:height="{r.h}px"
						></div>
					{/each}
				{/if}
				{#if division}
					<!-- The division step: a box across the line for each x tile. -->
					{#each division.boxes as b, i (i)}
						<div
							class="box"
							class:bad={badBoxes.includes(i)}
							class:gone={i > 0 && step !== 'divide'}
							style:left="{b.x}px"
							style:top="{b.y}px"
							style:width="{b.w}px"
							style:height="{b.h}px"
						></div>
					{/each}
				{/if}
				<!-- The balance's post, which stays when the rest of the balance fades
				     after step 1, and stretches into the line standing for =, over
				     the boxes. With the live balance off, it's that line from the start. -->
				{@const d = division}
				{@const one = step !== 'divide'}
				{@const line = !!d || !liveBalance}
				{@const postTop = !d
					? liveBalance
						? bal.pivot.y
						: bal.left.y - UNIT / 2
					: one
						? d.boxes[0].y - UNIT / 2
						: d.line.top}
				{@const postEnd = !d
					? liveBalance
						? bal.foot + 8
						: bal.left.y + bal.left.h + UNIT / 2
					: one
						? d.boxes[0].y + d.boxes[0].h + UNIT / 2
						: d.line.bottom}
				<div
					class="post"
					class:equals={line}
					style:left="{(d ? d.line.x : bal.pivot.x) - (line ? 2 : 7)}px"
					style:top="{postTop}px"
					style:width="{line ? 4 : 14}px"
					style:height="{postEnd - postTop}px"
				></div>
				<!-- The rest of the balance, which fades once step 1 passes. -->
				{#if liveBalance}<svg class="art" width="1" height="1" aria-hidden="true">
						<BalanceArt
							post={false}
							left={bal.left}
							right={bal.right}
							pivot={bal.pivot}
							arm={bal.arm}
							foot={bal.foot}
							{tilt}
							{drops}
							faded={!!division}
						/>
					</svg>{/if}
			{:else}
				<!-- The mat: one box, split by lines into the corner, the two sides and
			     the rectangle. -->
				<div
					class="mat"
					class:faded
					style:left="{-STRIP}px"
					style:top="{-STRIP}px"
					style:width="{ARM + STRIP}px"
					style:height="{ARM + STRIP}px"
					style:--strip="{STRIP}px"
				>
					<div class="side top" class:open={step === 'sides'}></div>
					<div class="side left" class:open={step === 'sides'}></div>
					<div class="corner">×</div>
				</div>
			{/if}

			{#if faded}
				{#each GROUP_KINDS as k (k)}
					<div
						class="zone"
						style:left="{zones[k].x}px"
						style:top="{zones[k].y}px"
						style:width="{zones[k].w}px"
						style:height="{zones[k].h}px"
					>
						<span>{ZONE_NAMES[k]}</span>
					</div>
				{/each}
			{/if}

			{#each gaps as c, i (i)}
				<div
					class="gap"
					style:left="{lenPx(c.x)}px"
					style:top="{lenPx(c.y)}px"
					style:width="{lenPx(c.w)}px"
					style:height="{lenPx(c.h)}px"
				></div>
			{/each}

			<!-- The tiles, those in each pan drawn as far down as it hangs, moving with it. -->
			{#each [null, 'left', 'right'] as const as which (which ?? 'off')}
				<div class="pan-tiles" style:translate="0 {which ? drops[which] : 0}px">
					{#each tiles.filter((t) => panOf(t) === which) as t (t.id)}
						{@render piece(t)}
					{/each}
				</div>
			{/each}

			{#each poofs as q (q.id)}
				<div class="poof" style:left="{q.x}px" style:top="{q.y}px">
					<span class="zero" style:font-size="{q.zero}px">0</span>
					<!-- Each puff of cloud is drawn twice, outlined behind and plain in front,
					     so the cloud has one outline round the outside. -->
					{#each [...q.bits
							.filter((b) => b.type === 'cloud')
							.map((b) => ({ ...b, type: 'cloud back' })), ...q.bits] as bit, i (i)}
						<span
							class={bit.type}
							style:--dx="{bit.dx}px"
							style:--dy="{bit.dy}px"
							style:--d="{bit.d}px"
							style:--delay="{bit.delay}ms"
							style:--spin="{bit.spin}deg"
						></span>
					{/each}
				</div>
			{/each}

			{#each landing as r, i (i)}
				<div
					class="landing"
					style:left="{r.x}px"
					style:top="{r.y}px"
					style:width="{r.w}px"
					style:height="{r.h}px"
				></div>
			{/each}
		</div>
	</div>

	<!-- The box being dragged out to select tiles. -->
	{#if marquee}
		{@const r = boxRect(marquee)}
		{@const at = toScreen(r.x, r.y)}
		<div
			class="marquee"
			style:left="{at.x}px"
			style:top="{at.y}px"
			style:width="{r.w * zoom}px"
			style:height="{r.h * zoom}px"
		></div>
	{/if}

	<!-- The buttons above the selected tiles. -->
	{#if focus}
		{@const at = toScreen(focus.x, focus.y)}
		<div
			class="tile-actions"
			style:left="{at.x}px"
			style:top="{at.y}px"
			role="toolbar"
			aria-label="Tile actions"
		>
			{#if focus.ids.length > 1}<span class="count">{focus.ids.length} tiles</span>{/if}
			{#if focus.canTurn}
				<button
					type="button"
					onclick={() => turnAll(focus.ids)}
					title="Turn (or double-click a tile)"
				>
					<RotateCw size={15} /> Turn
				</button>
			{/if}
			<button type="button" onclick={() => flipAll(focus.ids)} title="Flip to the opposite sign: + becomes −, − becomes +">
				<FlipVertical2 size={15} /> Flip +/−
			</button>
			<button type="button" onclick={() => duplicate(focus.ids)} title="Duplicate (Ctrl+D)">
				<Copy size={15} /> Duplicate
			</button>
			{#if focus.zero.length}
				<button
					type="button"
					class="zero"
					onclick={() => zeroOut(focus.zero)}
					title="Zero out the zero pairs (0)"
				>
					Zero out
				</button>
			{/if}
			<button
				type="button"
				class="delete"
				onclick={() => remove(focus.ids)}
				aria-label="Delete"
				title="Delete"
			>
				<Trash2 size={15} />
			</button>
		</div>
	{/if}

	<!-- The problem, its steps and the step's Check, in one bar across the top.
	     On the last step, the answer field takes the steps' place. -->
	<div class="topbar" bind:this={headerEl}>
		<header class="bar">
			{#if badge}<span class="badge">{badge}</span>{/if}
			<span class="kind"
				>{p.type === 'multiply' ? 'Multiply' : p.type === 'factor' ? 'Factor' : 'Solve'}</span
			>
			<span class="rule" aria-hidden="true"></span>
			<h1 class="problem">{prettyText(p.given)}</h1>
			<span class="rule last" aria-hidden="true"></span>
			<!-- Every state of the steps' place is drawn, one over another, and only the
			     current one shows: the bar is as wide and tall as its widest state from
			     the start, and doesn't move as the steps go by. Check and Start again
			     share one slot the same way. -->
			<div class="work">
				<div class="states">
					<ol class="steps state" class:off={answering || step === 'done'}>
						{#each steps as s, i (s)}
							{@const done = steps.indexOf(step) > i}
							<li class:current={s === step} class:done>
								<span class="num"
									>{#if done}<Check size={12} strokeWidth={3} />{:else}{i + 1}{/if}</span
								>
								{STEP_NAMES[s]}
							</li>
						{/each}
					</ol>
					<div
						class="equation state"
						class:off={!answering}
						role="presentation"
						onkeydown={(e) => {
							if (e.key === 'Enter') {
								e.preventDefault();
								check();
							}
						}}
					>
						<span class="given">{eq ? 'x' : prettyText(p.given)} =</span>
						<div class="field">
							{#if eq}
								<MathInput bind:value={answer} aria-label="What x is" placeholder="a number" />
							{:else}
								<MathInput
									bind:value={answer}
									aria-label="The other side of the equation"
									placeholder={built?.type === 'multiply' ? 'the product' : 'the factors'}
								/>
							{/if}
						</div>
					</div>
					<p class="complete state" class:off={step !== 'done'}>
						<span class="final">{solved}</span>
						<span class="yay"><Check size={18} strokeWidth={3} /> Yay! It’s complete.</span>
					</p>
				</div>
				<!-- Hint and Check, or Start again and Next: one place, as wide as the
				     wider pair, so the steps keep the rest of the bar. -->
				<div class="actions">
					<div class="ask">
						<button
							type="button"
							class="btn-ghost hint-btn"
							class:off={step === 'done'}
							class:stuck
							disabled={hintShown >= hints.length && hintOpen}
							aria-label={hintShown >= hints.length ? (hintOpen ? 'No more hints for this step' : 'Show the hints again') : stuck ? 'Stuck? Get a hint' : 'Get a hint'}
							onclick={showHint}
						>
							<Lightbulb size={16} /><span class="hint-word">{stuck ? 'Stuck? Hint' : 'Hint'}</span>
						</button>
						<button
							type="button"
							class="btn-primary check"
							class:off={step === 'done'}
							onclick={check}>Check</button
						>
					</div>
					<div class="after" class:off={step !== 'done'}>
						<button type="button" class="btn-ghost again" onclick={reset}>
							<RotateCcw size={16} /> Start again
						</button>
						{#if onnext}
							<button type="button" class="btn-primary next" onclick={onnext}>{nextLabel} →</button>
						{/if}
					</div>
				</div>
			</div>
		</header>
		{#if hintShown && hintOpen && step !== 'done'}
			<!-- The hints, in the place of a Check's message (closing them shows it again). -->
		{:else if error && step !== 'done'}
			<p class="error" aria-live="polite">{error}</p>
		{:else if note}
			<p class="note">{note}</p>
		{/if}
		{#if hintShown && hintOpen && step !== 'done'}
			<div class="hint-box" aria-live="polite">
				<p class="hint-head">
					<Lightbulb size={15} /> Hint {hintShown} of {hints.length}
					<button type="button" class="hint-close" aria-label="Hide the hints" onclick={() => (hintOpen = false)}>✕</button>
				</p>
				<ol>
					{#each hints.slice(0, hintShown) as h, i (i)}<li>{h}</li>{/each}
				</ol>
			</div>
		{/if}
	</div>

	<!-- The toolbar, like a whiteboard app's: undo and redo; flip the tray to its
	     negative tiles and turn its x tile; the tiles; and the trash. -->
	{#if step !== 'done'}
		<div class="toolbar" bind:this={toolbarEl} bind:offsetHeight={toolbarH} aria-label="Tiles">
			<div class="group">
				<button
					type="button"
					class="tool"
					class:on={tool === 'select'}
					aria-pressed={tool === 'select'}
					onclick={() => (tool = 'select')}
					title="Select (V): drag to select tiles"
					aria-label="Select"
				>
					<MousePointer2 size={20} />
				</button>
				<button
					type="button"
					class="tool"
					class:on={tool === 'hand'}
					aria-pressed={tool === 'hand'}
					onclick={() => (tool = 'hand')}
					title="Hand (H, or hold space): drag to move around"
					aria-label="Hand"
				>
					<Hand size={20} />
				</button>
			</div>
			<div class="group">
				<button
					type="button"
					class="tool"
					onclick={undo}
					disabled={!past.length}
					title="Undo (Ctrl+Z)"
					aria-label="Undo"
				>
					<Undo2 size={20} />
				</button>
				<button
					type="button"
					class="tool"
					onclick={redo}
					disabled={!future.length}
					title="Redo (Ctrl+Shift+Z)"
					aria-label="Redo"
				>
					<Redo2 size={20} />
				</button>
				<div class="reset-wrap">
					<button
						type="button"
						class="tool"
						onclick={() => (confirmingReset = !confirmingReset)}
						aria-expanded={confirmingReset}
						title="Reset: start again from step 1"
						aria-label="Reset"
					>
						<RotateCcw size={20} />
					</button>
					{#if confirmingReset}
						<div class="confirm" role="dialog" aria-label="Start again?">
							<p>Start again from step 1, with the tiles back where they began?</p>
							<div>
								<button type="button" class="btn-ghost" onclick={() => (confirmingReset = false)}
									>Cancel</button
								>
								<button type="button" class="btn-primary" onclick={reset}>Reset</button>
							</div>
						</div>
					{/if}
				</div>
			</div>
			<div class="group">
				<!-- Oomba: the tray's sign as a + / − switch (it used to read "Flip", which didn't say what flips). -->
				<button
					type="button"
					class="tool labeled sign-tool"
					onclick={flipTray}
					title="Tile sign: now {traySign > 0 ? 'positive (+)' : 'negative (−)'}. Press for {traySign > 0 ? 'negative' : 'positive'} tiles"
					aria-label="Tile sign: {traySign > 0 ? 'positive' : 'negative'}. Press for {traySign > 0 ? 'negative' : 'positive'} tiles"
				>
					<span class="sign-switch" aria-hidden="true">
						<span class="sign-pos" class:now={traySign > 0}>+</span><span class="sign-neg" class:now={traySign < 0}>−</span>
					</span>
					<span>Sign</span>
				</button>
				<button
					type="button"
					class="tool labeled"
					onclick={turnTray}
					title="Turn the x tile"
					aria-label="Turn the x tile"
				>
					<RotateCw size={20} /><span>Turn</span>
				</button>
			</div>
			<div class="group palette">
				{#each TRAY_KINDS as kind (kind)}
					{@const turned = kind === 'x' && trayTurned}
					{@const isPicked = picked?.kind === kind && picked.sign === traySign}
					<button
						type="button"
						style:width="{XLEN * TRAY_SCALE}px"
						style:height="{XLEN * TRAY_SCALE}px"
						class="tray-tile"
						class:picked={isPicked}
						aria-pressed={isPicked}
						aria-label="{traySign < 0 ? 'Negative ' : ''}{kind === 'x2' ? 'x squared' : kind} tile"
						onpointerdown={(e) =>
							grab(e, { source: { from: 'tray' }, kind, sign: traySign, turned }, TRAY_SCALE)}
					>
						<span class="card" class:flipping>
							{#key turned}
								<span
									class="face"
									class:turn-in={kind === 'x' && trayTurnedOnce}
									class:back={!turned}
								>
									<TileView {kind} sign={traySign} {turned} scale={TRAY_SCALE} />
								</span>
							{/key}
						</span>
					</button>
				{/each}
			</div>
			<button
				type="button"
				class="trash"
				class:ready={holdingBoardTile || selected.size > 0}
				class:over={overTrash}
				bind:this={trashEl}
				onclick={() => remove([...selected])}
				aria-label="Delete the selected tiles"
				title="Drop a tile here to delete it"
			>
				<Trash2 size={22} />
			</button>
		</div>
	{/if}

	<div class="zoom" aria-label="Zoom">
		<button type="button" onclick={() => zoomBy(1 / 1.25)} aria-label="Zoom out" title="Zoom out"
			><Minus size={16} /></button
		>
		<span>{Math.round(zoom * 100)}%</span>
		<button type="button" onclick={() => zoomBy(1.25)} aria-label="Zoom in" title="Zoom in"
			><Plus size={16} /></button
		>
		<button type="button" onclick={() => fit(350)} aria-label="Fit everything on screen" title="Fit"
			><Maximize size={15} /></button
		>
	</div>

	{#if drag?.moved}
		{#each ghosts as g, i (i)}
			<div
				class="ghost"
				style:left="{drag.cx + (g.ox - drag.dx) * zoom}px"
				style:top="{drag.cy + (g.oy - drag.dy) * zoom}px"
				aria-hidden="true"
			>
				<TileView kind={g.kind} sign={g.sign} turned={g.turned} scale={zoom} lifted />
			</div>
		{/each}
	{/if}
</div>

<style>
	.activity {
		position: fixed;
		inset: 0;
		overflow: hidden;
	}
	.board {
		position: absolute;
		inset: 0;
		overflow: hidden;
		background-color: var(--ground);
		touch-action: none;
		cursor: grab;
	}
	.board {
		cursor: default;
	}
	.board.panning {
		cursor: grab;
	}
	.board.panning:active {
		cursor: grabbing;
	}
	.board.placing {
		cursor: copy;
	}
	.layer {
		position: absolute;
		top: 0;
		left: 0;
		transform-origin: 0 0;
	}
	.layer > * {
		position: absolute;
	}

	/* The mat is one box with square corners; lines inside it mark off the
	   corner and the sides, so no edge is ever drawn twice. */
	.mat {
		border: 1px solid var(--line-strong);
		background: var(--paper);
		transition: opacity 0.5s;
	}
	.mat.faded {
		opacity: 0;
		pointer-events: none;
	}
	.side {
		position: absolute;
		background: var(--paper-low);
	}
	.side.open {
		background: var(--accent-wash);
	}
	.side.top {
		top: 0;
		left: var(--strip);
		right: 0;
		height: var(--strip);
		border-bottom: 1px solid var(--line-strong);
	}
	.side.left {
		top: var(--strip);
		left: 0;
		bottom: 0;
		width: var(--strip);
		border-right: 1px solid var(--line-strong);
	}
	.corner {
		position: absolute;
		top: 0;
		left: 0;
		display: grid;
		place-items: center;
		width: var(--strip);
		height: var(--strip);
		border-right: 1px solid var(--line-strong);
		border-bottom: 1px solid var(--line-strong);
		background: var(--paper-low);
		color: var(--muted);
		font-weight: 700;
	}
	/* The balance, drawn by BalanceArt in board pixels; tiles lie over it. */
	.art {
		top: 0;
		left: 0;
		overflow: visible;
		pointer-events: none;
	}
	.pan-tiles {
		transition: translate 0.7s cubic-bezier(0.3, 0.7, 0.4, 1.1);
	}
	/* The division step: the balance's line, standing for =, and a dashed box
	   across it for each x tile. */
	/* The balance's post, gray like the rest of its stand; it stretches into
	   the division step's line, darker, as the rest fades. */
	.post {
		border-radius: 7px 7px 0 0;
		background: var(--line-strong);
		pointer-events: none;
		transition:
			left 0.6s ease-in-out,
			top 0.6s ease-in-out,
			width 0.6s ease-in-out,
			height 0.6s ease-in-out,
			border-radius 0.6s,
			background-color 0.6s;
	}
	.post.equals {
		border-radius: 2px;
		background: var(--muted);
	}
	.box {
		border: 2px dashed var(--accent-line);
		border-radius: 10px;
		background: rgb(251 252 254 / 0.55);
		pointer-events: none;
		animation: appear 0.6s 0.25s both;
		transition:
			opacity 0.5s,
			border-color 0.2s,
			background 0.2s;
	}
	.box.bad {
		border-color: var(--bad);
		background: var(--bad-wash);
	}
	.box.gone {
		opacity: 0;
	}
	/* With the live balance off, the equation's sides, there from the start. */
	.box.side-box {
		animation: none;
	}
	@keyframes appear {
		from {
			opacity: 0;
		}
	}
	.pan-tiles {
		top: 0;
		left: 0;
	}
	.pan-tiles > .piece {
		position: absolute;
	}
	.zone {
		border: 2px dashed var(--line-strong);
		border-radius: 12px;
		background: rgb(251 252 254 / 0.6);
	}
	.zone span {
		position: absolute;
		top: -1.6rem;
		left: 0.25rem;
		color: var(--muted);
		font-size: 0.9rem;
		font-weight: 700;
	}
	.gap {
		border: 2px dashed var(--bad);
		background: var(--bad-wash);
		pointer-events: none;
	}
	.landing {
		border: 2px dashed var(--accent);
		border-radius: 4px;
		background: rgb(44 95 199 / 0.08);
		pointer-events: none;
	}
	.piece {
		padding: 0;
		border: none;
		border-radius: 5px;
		background: none;
		cursor: grab;
		touch-action: none;
		transition:
			opacity 0.5s,
			filter 0.3s;
	}
	/* Sliding into place on its own, as the x tiles line up after step 1. */
	.piece.glide {
		transition:
			left 0.6s ease-in-out,
			top 0.6s ease-in-out,
			opacity 0.5s,
			filter 0.3s;
	}
	/* A locked tile can't be picked up, so a press on it is a press on the
	   board: a tap there still places the tray tile picked, even where a
	   phone's tap lands on the nearest button. */
	.piece.fixed {
		cursor: default;
		pointer-events: none;
	}
	.face {
		display: block;
	}
	/* Locked sides go gray, so it's plain they can't be changed now. */
	.piece.locked {
		filter: grayscale(1);
		opacity: 0.55;
	}
	.piece.gone {
		opacity: 0;
		pointer-events: none;
	}
	/* The tile being dragged is drawn by its ghost; its place stays empty. */
	.piece.held {
		visibility: hidden;
	}
	.piece.selected,
	.piece:focus-visible {
		outline: 3px solid var(--accent);
		outline-offset: 2px;
	}
	/* A turn swings an x tile a quarter about its end, the square at its top or
	   left; a flip turns a tile over like a card. */
	.face.swing-down,
	.face.swing-up {
		transform-origin: var(--pivot) var(--pivot);
		animation: swing-down 0.28s cubic-bezier(0.3, 0.7, 0.4, 1.15);
	}
	.face.swing-up {
		animation-name: swing-up;
	}
	@keyframes swing-down {
		from {
			transform: rotate(-90deg);
		}
	}
	@keyframes swing-up {
		from {
			transform: rotate(90deg);
		}
	}
	.face.flip {
		animation: flip 0.28s ease-out;
	}
	@keyframes flip {
		from {
			transform: perspective(400px) rotateX(90deg);
		}
	}

	/* Zeroing out: the pair rumbles, slides into each other, and poofs. */
	.piece.rumble {
		animation: rumble 0.12s linear infinite;
	}
	@keyframes rumble {
		0%,
		100% {
			transform: translate(0, 0) rotate(0);
		}
		25% {
			transform: translate(-2px, 1px) rotate(-2deg);
		}
		50% {
			transform: translate(2px, -1px) rotate(1.5deg);
		}
		75% {
			transform: translate(-1px, -2px) rotate(-1deg);
		}
	}
	/* The pair slides into each other, speeding up as they go, in one motion. */
	.piece.merge {
		animation: merge var(--merge-ms, 280ms) cubic-bezier(0.5, 0, 0.75, 0) forwards;
	}
	@keyframes merge {
		to {
			transform: translate(var(--to-x), var(--to-y));
		}
	}

	/* The poof. Moving, growing and fading are separate animations, each with
	   one easing curve from start to end, so nothing stops and starts. */
	.poof {
		width: 0;
		height: 0;
		pointer-events: none;
	}
	.poof span:not(.zero) {
		position: absolute;
		left: calc(var(--d) / -2);
		top: calc(var(--d) / -2);
		width: var(--d);
		height: var(--d);
		animation-delay: var(--delay);
		animation-fill-mode: both;
	}
	/* Puffs of cloud: the outlined ones behind give the cloud its edge, the
	   white ones in front hide the outlines where puffs overlap. The edge goes
	   first, then the smoke thins out as it spreads and drifts up. */
	.poof .cloud {
		border-radius: 50%;
		background: radial-gradient(circle at 40% 30%, #fff 0 45%, #f1f5fb 75%, #e2e9f3 100%);
		animation-name: drift, billow, clear;
		animation-duration: 1.4s;
		animation-timing-function: cubic-bezier(0.16, 0.84, 0.3, 1), linear, linear;
	}
	.poof .cloud.back {
		background: #fff;
		box-shadow: 0 0 0 2.5px #b4c3d9;
		animation-name: drift, billow, clear-edge;
	}
	@keyframes drift {
		from {
			translate: calc(var(--dx) * 0.6) calc(var(--dy) * 0.6);
		}
		to {
			translate: calc(var(--dx) * 1.25) calc(var(--dy) * 1.25 - 24px);
		}
	}
	@keyframes billow {
		0% {
			scale: 0.7;
			animation-timing-function: cubic-bezier(0.2, 0.9, 0.3, 1.2);
		}
		25% {
			scale: 1;
			animation-timing-function: cubic-bezier(0.4, 0, 0.6, 1);
		}
		100% {
			scale: 1.25;
		}
	}
	@keyframes clear {
		0%,
		35% {
			opacity: 1;
			animation-timing-function: cubic-bezier(0.4, 0, 0.6, 1);
		}
		100% {
			opacity: 0;
		}
	}
	@keyframes clear-edge {
		0%,
		22% {
			opacity: 1;
			animation-timing-function: cubic-bezier(0.4, 0, 0.6, 1);
		}
		55%,
		100% {
			opacity: 0;
		}
	}
	/* Dust: little specks thrown further out, slowing as they go. */
	.poof .speck {
		border-radius: 50%;
		background: #9fb1cb;
		animation-name: fling, speck-fade;
		animation-duration: 0.75s;
		animation-timing-function: cubic-bezier(0.1, 0.8, 0.3, 1), linear;
	}
	@keyframes fling {
		from {
			translate: 0 0;
		}
		to {
			translate: var(--dx) var(--dy);
		}
	}
	@keyframes speck-fade {
		0% {
			opacity: 0;
		}
		12% {
			opacity: 1;
			animation-timing-function: cubic-bezier(0.4, 0, 0.6, 1);
		}
		100% {
			opacity: 0;
		}
	}
	/* Sparkles: four-pointed stars that twinkle at the cloud's edge. */
	.poof .sparkle {
		background: #ffd15c;
		clip-path: polygon(50% 0, 62% 38%, 100% 50%, 62% 62%, 50% 100%, 38% 62%, 0 50%, 38% 38%);
		animation-name: twinkle-out, twinkle;
		animation-duration: 0.8s;
		animation-timing-function: cubic-bezier(0.2, 0.8, 0.3, 1), linear;
	}
	@keyframes twinkle-out {
		from {
			translate: calc(var(--dx) * 0.6) calc(var(--dy) * 0.6);
			rotate: 0deg;
		}
		to {
			translate: calc(var(--dx) * 1.1) calc(var(--dy) * 1.1);
			rotate: calc(var(--spin) * 2);
		}
	}
	@keyframes twinkle {
		0% {
			scale: 0;
			animation-timing-function: cubic-bezier(0.2, 0.9, 0.3, 1.3);
		}
		40% {
			scale: 1;
			animation-timing-function: cubic-bezier(0.5, 0, 0.8, 0.5);
		}
		100% {
			scale: 0;
		}
	}
	/* The 0 the pair made, found as the smoke clears, fading slowly as it rises. */
	.poof .zero {
		position: absolute;
		left: 0;
		top: 0;
		transform: translate(-50%, -50%);
		color: var(--accent-dark);
		font-weight: 800;
		line-height: 1;
		animation:
			zero-pop 0.5s cubic-bezier(0.2, 0.9, 0.3, 1.3) 0.1s both,
			zero-rise 2.7s cubic-bezier(0.3, 0, 0.4, 1) both,
			zero-fade 2.7s linear both;
	}
	@keyframes zero-pop {
		from {
			scale: 0.6;
		}
		to {
			scale: 1;
		}
	}
	@keyframes zero-rise {
		from {
			translate: 0 6px;
		}
		to {
			translate: 0 -10px;
		}
	}
	@keyframes zero-fade {
		0% {
			opacity: 0;
		}
		10%,
		65% {
			opacity: 1;
			animation-timing-function: cubic-bezier(0.4, 0, 0.6, 1);
		}
		100% {
			opacity: 0;
		}
	}
	.marquee {
		position: absolute;
		z-index: 5;
		border: 1px solid var(--accent);
		background: rgb(44 95 199 / 0.08);
		pointer-events: none;
	}
	.tile-actions .count {
		align-self: center;
		padding: 0 0.5rem;
		color: var(--muted);
		font-size: 0.78rem;
		font-weight: 700;
	}
	.ghost {
		position: fixed;
		z-index: 30;
		pointer-events: none;
	}
	.tile-actions {
		position: absolute;
		z-index: 15;
		display: flex;
		gap: 0.15rem;
		padding: 0.25rem;
		border: 1px solid var(--line);
		border-radius: 999px;
		background: var(--paper);
		box-shadow: 0 4px 14px rgb(29 40 56 / 0.18);
		transform: translate(-50%, calc(-100% - 8px));
		white-space: nowrap;
	}
	.tile-actions button {
		display: flex;
		align-items: center;
		gap: 0.3rem;
		height: 2rem;
		padding: 0 0.6rem;
		border: none;
		border-radius: 999px;
		background: none;
		color: var(--ink-soft);
		font-size: 0.82rem;
		font-weight: 700;
		cursor: pointer;
	}
	.tile-actions button:hover {
		background: var(--accent-wash);
		color: var(--accent-dark);
	}
	.tile-actions .zero {
		color: var(--accent-dark);
	}
	.tile-actions .delete:hover {
		background: var(--bad-wash);
		color: var(--bad);
	}

	/* The bars float over the board like a whiteboard app's toolbars. */
	.bar,
	.toolbar,
	.zoom {
		position: absolute;
		z-index: 10;
		border: 1px solid var(--line);
		background: var(--paper);
		box-shadow:
			0 1px 2px rgb(29 40 56 / 0.08),
			0 10px 28px rgb(29 40 56 / 0.12);
	}
	/* The top bar, one row: the activity │ the problem │ the steps … Check.
	   On a narrow screen it wraps, the steps (or the answer) on a row of their own. */
	.topbar {
		position: absolute;
		top: 0.75rem;
		left: 0.75rem;
		right: 0.75rem;
		z-index: 10;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.4rem;
		pointer-events: none;
	}
	.topbar > * {
		pointer-events: auto;
	}
	.bar {
		position: relative;
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5rem 1rem;
		width: max-content;
		max-width: 100%;
		padding: 0.55rem 0.6rem 0.55rem 1rem;
		border-radius: 14px;
	}
	.rule {
		align-self: stretch;
		width: 1px;
		background: var(--line);
	}
	.kind {
		padding: 0.15rem 0.55rem;
		border-radius: 999px;
		background: var(--accent-wash);
		color: var(--accent-dark);
		font-size: 0.72rem;
		font-weight: 700;
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}
	.problem {
		font-size: 1.35rem;
		font-weight: 700;
		white-space: nowrap;
	}
	/* The steps, or the answer, and Check pinned to the right. */
	.work {
		display: flex;
		flex: 1 1 auto;
		flex-wrap: nowrap;
		align-items: center;
		gap: 0.5rem 1rem;
		min-width: 0;
	}
	.states {
		display: grid;
		flex: 1 1 auto;
		align-items: center;
		min-width: 0;
	}
	.state,
	.actions > * {
		grid-area: 1 / 1;
	}
	.actions {
		display: grid;
		flex: none;
		justify-items: end;
		align-items: center;
		margin-left: auto;
	}
	.ask {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}
	/* A state that isn't the current one keeps its room, unseen. */
	.off {
		visibility: hidden;
	}
	@media (max-width: 640px) {
		.rule.last {
			display: none;
		}
		/* The steps (or the answer) on a line of their own, then Hint and Check
		   (or Start again and Next) on the right of the line under them. */
		.work {
			flex-basis: 100%;
			flex-wrap: wrap;
		}
		.states {
			flex-basis: 100%;
		}
		/* On the smallest phones, Start again and Next stack rather than spill out. */
		.actions {
			flex-shrink: 1;
			min-width: 0;
		}
		.after {
			flex-wrap: wrap;
			justify-content: flex-end;
		}
		.steps {
			gap: 0.3rem 0.55rem;
			font-size: 0.78rem;
		}
		.steps li {
			gap: 0.25rem;
		}
		.bar {
			padding: 0.5rem 0.6rem;
		}
		.bar .problem {
			font-size: 1.15rem;
		}
		.bar .given {
			font-size: 1rem;
		}
		.bar .field {
			min-width: 6rem;
		}
	}
	/* The given and its field stay together on one line; the field gives way first. */
	.equation {
		display: flex;
		flex: 1 1 auto;
		flex-wrap: nowrap;
		align-items: center;
		gap: 0.6rem;
		min-width: 0;
	}
	.given {
		flex: none;
		font-size: 1.2rem;
		font-weight: 700;
		white-space: nowrap;
	}
	.field {
		flex: 1 1 14rem;
		width: 14rem;
		min-width: 5rem;
		max-width: 24rem;
	}
	.complete {
		display: flex;
		flex: 1 1 auto;
		flex-wrap: wrap;
		min-width: 0;
		align-items: center;
		gap: 0.4rem 0.9rem;
		color: var(--good);
		font-weight: 700;
	}
	.yay {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		white-space: nowrap;
	}
	.final {
		white-space: nowrap;
		color: var(--ink);
		font-size: 1.15rem;
	}
	.again,
	.next {
		white-space: nowrap;
	}
	.badge {
		flex: none;
		padding: 0.2rem 0.6rem;
		border-radius: 999px;
		background: var(--ink);
		color: var(--paper);
		font-size: 0.78rem;
		font-weight: 800;
		white-space: nowrap;
	}
	.after {
		display: flex;
		gap: 0.5rem;
		align-items: center;
	}
	/* What a failed Check found wrong, just under the bar. */
	.hint-btn {
		flex: none;
		gap: 0.35rem;
		padding: 0.45rem 0.8rem;
		white-space: nowrap;
	}
	.hint-btn.stuck {
		border-color: #c58a12;
		background: #fff1cc;
		animation: hint-glow 1.6s ease-in-out infinite;
	}
	@keyframes hint-glow {
		50% {
			box-shadow: 0 0 0 5px rgb(245 186 66 / 0.35);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.hint-btn.stuck {
			animation: none;
		}
	}
	@media (max-width: 640px) {
		.hint-word {
			display: none;
		}
		.hint-btn.stuck .hint-word {
			display: inline;
		}
	}
	.hint-box {
		max-width: min(40rem, 100%);
		margin-top: 0.4rem;
		padding: 0.55rem 0.95rem;
		border: 1px solid #f0d58c;
		border-radius: 10px;
		background: #fff8e1;
		color: var(--ink);
		font-size: 0.92rem;
		line-height: 1.4;
		box-shadow: 0 4px 14px rgb(29 40 56 / 0.12);
	}
	.hint-head {
		display: flex;
		align-items: center;
		gap: 0.35rem;
		color: #8a5a00;
		font-size: 0.78rem;
		font-weight: 800;
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}
	.hint-close {
		margin-left: auto;
		padding: 0.1rem 0.4rem;
		border: 0;
		border-radius: 8px;
		background: none;
		color: #8a5a00;
		font: inherit;
		font-size: 0.9rem;
		cursor: pointer;
	}
	.hint-close:hover {
		background: #fde7a8;
	}
	.hint-box ol {
		margin: 0.25rem 0 0;
		padding-left: 1.2rem;
	}
	.hint-box li + li {
		margin-top: 0.25rem;
	}
	.error,
	.note {
		max-width: min(40rem, 100%);
		padding: 0.45rem 0.9rem;
		border-radius: 10px;
		font-size: 0.92rem;
		font-weight: 600;
		line-height: 1.35;
		text-align: center;
		box-shadow: 0 4px 14px rgb(29 40 56 / 0.12);
	}
	.error {
		border: 1px solid var(--bad-line);
		background: var(--bad-wash);
		color: var(--bad);
	}
	.note {
		border: 1px solid var(--line);
		background: var(--paper);
		color: var(--muted);
	}
	/* Reset asks first, in a little box over the toolbar. */
	.reset-wrap {
		position: relative;
	}
	.confirm {
		position: absolute;
		bottom: calc(100% + 0.9rem);
		left: 50%;
		width: 16rem;
		padding: 0.8rem;
		border: 1px solid var(--line);
		border-radius: 12px;
		background: var(--paper);
		box-shadow: 0 10px 28px rgb(29 40 56 / 0.18);
		transform: translateX(-50%);
	}
	.confirm p {
		font-size: 0.9rem;
		font-weight: 600;
		line-height: 1.35;
	}
	.confirm div {
		display: flex;
		justify-content: flex-end;
		gap: 0.4rem;
		margin-top: 0.6rem;
	}
	.steps {
		display: flex;
		flex-wrap: wrap;
		gap: 0.35rem 0.8rem;
		list-style: none;
		color: var(--muted);
		font-size: 0.82rem;
		font-weight: 600;
	}
	.steps li {
		display: flex;
		align-items: center;
		gap: 0.3rem;
	}
	.num {
		display: grid;
		place-items: center;
		width: 1.2rem;
		height: 1.2rem;
		border: 1.5px solid var(--line-strong);
		border-radius: 999px;
		font-size: 0.7rem;
	}
	.steps .current {
		color: var(--accent-dark);
	}
	.steps .current .num {
		border-color: var(--accent);
		background: var(--accent);
		color: var(--paper);
	}
	.steps .done {
		color: var(--good);
	}
	.steps .done .num {
		border-color: var(--good);
		background: var(--good-wash);
	}

	/* The toolbar: groups split by thin rules, the tiles standing up out of it. */
	.toolbar {
		bottom: 1rem;
		left: 50%;
		display: flex;
		align-items: stretch;
		height: 4.6rem;
		border-radius: 18px;
		transform: translateX(-50%);
	}
	.group {
		display: flex;
		align-items: center;
		gap: 0.25rem;
		padding: 0 0.6rem;
		border-right: 1px solid var(--line);
	}
	.tool {
		display: grid;
		place-items: center;
		width: 2.8rem;
		height: 2.8rem;
		border: none;
		border-radius: 10px;
		background: none;
		color: var(--ink-soft);
		cursor: pointer;
	}
	.tool.labeled {
		gap: 0.1rem;
		width: 3.2rem;
		height: 3.6rem;
	}
	.tool span {
		font-size: 0.68rem;
		font-weight: 700;
	}
	.sign-tool {
		width: auto;
		padding: 0 0.3rem;
	}
	.tool .sign-switch {
		display: flex;
		overflow: hidden;
		border: 2px solid var(--ink-soft);
		border-radius: 999px;
		font-size: 1rem;
		line-height: 1;
	}
	.tool .sign-switch span {
		display: grid;
		place-items: center;
		width: 1.35rem;
		height: 1.25rem;
		font-size: 1rem;
		font-weight: 900;
		color: var(--muted);
	}
	.tool .sign-switch .sign-pos.now {
		background: #f7d774;
		color: #5a4300;
	}
	.tool .sign-switch .sign-neg.now {
		background: #ee9a8d;
		color: #6b1a0f;
	}
	.tool:hover:not(:disabled) {
		background: var(--paper-low);
		color: var(--accent);
	}
	.tool.on {
		background: var(--accent);
		color: var(--paper);
	}
	.tool.on:hover {
		background: var(--accent-dark);
		color: var(--paper);
	}
	.tool:disabled {
		color: #b6c0ce;
		cursor: default;
	}
	/* Each tile sits in the middle of a square slot as big as the x² tile, so the
	   x tile turns about its own middle, and the toolbar keeps its width. */
	.palette {
		align-items: flex-end;
		gap: 0.9rem;
		padding: 0 1.1rem 0.45rem;
	}
	.card {
		display: grid;
		place-items: center;
		transition: transform 0.15s ease-in;
	}
	.card.flipping {
		transform: perspective(400px) rotateX(90deg);
	}
	.face.turn-in {
		animation: turn-in 0.28s cubic-bezier(0.3, 0.7, 0.4, 1.15);
	}
	.face.turn-in.back {
		animation-name: turn-back;
	}
	@keyframes turn-in {
		from {
			transform: rotate(-90deg);
		}
	}
	@keyframes turn-back {
		from {
			transform: rotate(90deg);
		}
	}
	.tray-tile {
		display: grid;
		place-items: center;
		padding: 0;
		border: none;
		border-radius: 6px;
		background: none;
		cursor: grab;
		touch-action: none;
		transition: transform 0.12s;
	}
	.tray-tile:hover {
		transform: translateY(-4px);
	}
	.tray-tile.picked {
		outline: 3px solid var(--accent);
		outline-offset: 3px;
	}
	/* The trash is a whole end of the toolbar, so a tile is easy to drop on it. */
	.trash {
		display: grid;
		place-items: center;
		width: 4.6rem;
		border: none;
		border-radius: 0 17px 17px 0;
		background: none;
		color: #b6c0ce;
		cursor: default;
		transition:
			background 0.15s,
			color 0.15s;
	}
	.trash.ready {
		color: var(--bad);
		cursor: pointer;
	}
	.trash.ready:hover,
	.trash.over {
		background: var(--bad-wash);
	}
	.trash.over {
		color: var(--bad);
	}
	.zoom {
		right: 1rem;
		bottom: 1rem;
		display: flex;
		align-items: center;
		gap: 0.15rem;
		padding: 0.25rem;
		border-radius: 10px;
		font-size: 0.8rem;
		font-weight: 600;
		color: var(--muted);
	}
	.zoom span {
		min-width: 2.8rem;
		text-align: center;
	}
	.zoom button {
		display: grid;
		place-items: center;
		width: 2rem;
		height: 2rem;
		border: none;
		border-radius: 6px;
		background: none;
		color: var(--ink-soft);
		cursor: pointer;
	}
	.zoom button:hover {
		background: var(--paper-low);
	}
	/* Less motion: everything that moves, turns, fades or slides happens at once. */
	@media (prefers-reduced-motion: reduce) {
		.activity :global(*),
		.activity :global(*::before),
		.activity :global(*::after) {
			animation-duration: 1ms !important;
			animation-delay: 0s !important;
			animation-iteration-count: 1 !important;
			transition-duration: 1ms !important;
			transition-delay: 0s !important;
		}
	}
	/* A tablet or a small laptop: the toolbar is as wide as the screen allows
	   and the zoom sits above its right end, so the two never overlap. */
	@media (max-width: 1299px) {
		.toolbar {
			max-width: calc(100% - 2rem);
		}
		.zoom {
			bottom: calc(var(--toolbar-h) + 1.75rem);
		}
	}
	/* A tablet held upright: the tools lose their labels to fit across. */
	@media (min-width: 601px) and (max-width: 900px) {
		.group {
			padding: 0 0.4rem;
		}
		.tool.labeled {
			width: 2.8rem;
			height: 2.8rem;
		}
		.tool.labeled > span:not(.sign-switch) {
			display: none;
		}
		.sign-tool {
			width: auto !important;
		}
		.palette {
			gap: 0.6rem;
			padding: 0 0.7rem 0.45rem;
		}
		.trash {
			width: 3.6rem;
		}
	}
	/* On a phone the toolbar fits the screen, 16px in from each side, in two
	   rows: the tools, icons only, then the tray and the trash. The zoom sits
	   above it, on the right. */
	@media (max-width: 600px) {
		.toolbar {
			right: 16px;
			bottom: 0.75rem;
			left: 16px;
			flex-wrap: wrap;
			justify-content: center;
			height: auto;
			transform: none;
		}
		.group {
			gap: 0;
			padding: 0.2rem 0.15rem;
			border-right: none;
		}
		.tool,
		.tool.labeled {
			width: 2.5rem;
			height: 2.5rem;
		}
		.tool.labeled > span:not(.sign-switch) {
			display: none;
		}
		/* The + / − switch keeps its two halves on a phone (only its "Sign" label goes). */
		.sign-tool {
			width: auto !important;
		}
		/* The tray and the trash share the second row, whatever the width. */
		.palette {
			flex: 1 1 calc(100% - 3.5rem);
			justify-content: center;
			gap: 0.6rem;
			padding: 0.3rem 0.5rem 0.45rem;
			border-top: 1px solid var(--line);
		}
		.trash {
			width: 3.5rem;
			border-top: 1px solid var(--line);
			border-radius: 0 0 17px 0;
		}
		.zoom {
			bottom: calc(var(--toolbar-h) + 1.25rem);
		}
		.zoom button {
			width: 2.5rem;
			height: 2.5rem;
		}
		.confirm {
			position: fixed;
			right: 16px;
			bottom: calc(var(--toolbar-h) + 1.5rem);
			left: 16px;
			width: auto;
			transform: none;
		}
	}
</style>
