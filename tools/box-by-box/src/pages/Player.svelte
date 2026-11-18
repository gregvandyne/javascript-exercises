<script lang="ts">
	// The student player: a start screen, then each problem worked on graph paper one box at a time with the support
	// the teacher chose, Check (one try again, then the answer), and the end screen with the score.
	import { onMount, tick } from 'svelte';
	import { Check, ChevronDown, ChevronUp, Eraser, Grid3x3, Lightbulb, Play, SkipForward, X } from '@lucide/svelte';
	import Sheet from '$lib/Sheet.svelte';
	import Keypad from '$lib/Keypad.svelte';
	import FloatingKeypad, { type Rect } from '$lib/FloatingKeypad.svelte';
	import Footer from '$lib/Footer.svelte';
	import {
		allFilled,
		allRight,
		boxOf,
		cellStep,
		correctValues,
		countNudge,
		countState,
		isRight,
		isWrong,
		kindInfo,
		levelInfo,
		problemsForRun,
		sheetFor,
		showAnswer,
		stepOfBox,
		type Cell,
		type Playable,
		type Problem,
		type Sheet as SheetT,
		type Step,
		type Values
	} from '$lib/logic';
	import { finished, load, right as soundRight, store, wrong as soundWrong } from '$lib/oomba';
	import { hintsFor } from '$lib/hints';

	let {
		activity,
		title,
		preview = false,
		extra,
		fresh,
		againLabel
	}: {
		activity: Playable;
		title: string;
		preview?: boolean;
		extra?: { label: string; onclick: () => void };
		/** Practicing alone: a new set of problems for each run (never ones the student has had lately). */
		fresh?: () => Problem[];
		/** The end screen's button, when it isn't "Start again". */
		againLabel?: string;
	} = $props();

	const SQUARE = 56;
	const STEP_MS = 650;
	const kind = $derived(kindInfo(activity.kind));
	let runs = 0;
	// The first run plays the activity's own problems; a practice run after that gets a new set.
	const makeSheets = () => (fresh && runs++ > 0 ? fresh() : problemsForRun(activity)).map((p) => sheetFor(activity, p));

	let phase = $state<'setup' | 'working' | 'feedback' | 'over'>('setup');
	let sheets = $state.raw<SheetT[]>([]);
	let index = $state(0);
	let rightCount = $state(0);
	let wrongCount = $state(0);
	let firstTry = $state(true);
	let fb = $state<'right' | 'again' | 'reveal'>('right');
	let sticky = $state(false);
	let values = $state<Values>({});
	let before = $state<Values>({});
	let current = $state<string | null>(null);
	let at = $state(0);
	let furthest = $state(0);
	let count = $state<number | null>(null);
	let pendingTens = $state('');
	let typed = $state('');
	let watchShown = $state(false);
	let nudge = $state('');
	let growLit = $state<string[] | null>(null);
	let floater = $state<{ text: string; row: number; col: number; toRow: number } | null>(null);
	let busy = $state(false);
	let carryStep = $state<number | null>(null);
	let W = $state(1024);
	let H = $state(768);
	let barH = $state(56);
	let bandH = $state(120);
	let still = $state(false);
	let padOpen = $state(false);
	let padRect = $state<Rect | undefined>();
	let padSaved = $state<Rect | null>(null);
	let planned = $state(0);

	// --- hints (Oomba): for the step being worked, up to three, one per press of Hint. "Stuck?" lights up after a
	// Check that didn't pass or a wrong count, or 45 seconds on the same step. ---
	let hintShown = $state(0);
	let hintOpen = $state(false);
	let fails = $state(0);
	/** Wrong digits typed on this step (Guided marks them as they're typed). */
	let misses = $state(0);
	let slow = $state(false);
	let hintTimer: ReturnType<typeof setTimeout> | undefined;
	let reported = false;

	const inputs: Record<string, HTMLInputElement | null> = {};
	let graphEl = $state<HTMLElement>();
	let worldEl = $state<HTMLElement>();
	let floaterEl = $state<HTMLElement>();
	let checkBtn = $state<HTMLButtonElement>();
	let feedbackBtn = $state<HTMLButtonElement>();
	let feedbackEl = $state<HTMLElement>();
	let nextBtn = $state<HTMLButtonElement>();

	const PAD_KEY = 'box-by-box-keypad-v1';
	function setPad(open: boolean) {
		padOpen = open;
		if (!open) padRect = undefined;
		savePad();
	}
	function savePad(rect?: Rect) {
		if (rect) padSaved = rect;
		store(PAD_KEY, { open: padOpen, ...(padSaved ? { rect: padSaved } : {}) });
	}

	const sheet = $derived<SheetT | undefined>(sheets[index]);
	const steps = $derived<Step[]>(sheet?.steps ?? []);
	const narrow = $derived(W <= 760);
	const level = $derived(activity.settings.level);
	const info = $derived(level === 'custom' ? undefined : levelInfo(level));
	const levelLabel = $derived(level === 'custom' ? 'Your teacher’s mix' : (info?.label ?? 'Guided'));
	const way = $derived(level === 'custom' ? 'type' : (info?.way ?? 'type'));
	const flags = $derived(level === 'custom' ? activity.settings.custom : info!.flags);
	const scored = $derived(level === 'custom' || !!info?.scored);
	const isReveal = $derived(phase === 'feedback' && fb === 'reveal');
	const settled = $derived(phase === 'feedback' && fb !== 'again');

	function isAuto(id: string): boolean {
		if (!sheet) return false;
		const st = steps[stepOfBox(sheet, id)];
		if (!st) return false;
		return (
			way === 'watch' ||
			st.liftCarry?.tens === id ||
			(way === 'countUp' && ((st.kind === 'multiply' && !st.skipCount) || st.kind === 'carry' || st.kind === 'zero' || st.kind === 'point' || st.kind === 'addZero')) ||
			(flags.bringDown && st.kind === 'bringDown')
		);
	}
	const isCountStep = (st: Step | undefined) => !!st && (st.kind === 'divide' || !!st.skipCount);
	function isCountBox(id: string): boolean {
		if (!sheet || way !== 'countUp') return false;
		const i = stepOfBox(sheet, id);
		return isCountStep(steps[i]) && carryStep !== i;
	}
	const counting = $derived(way === 'countUp' && phase === 'working' && isCountStep(steps[at]) && carryStep !== at);
	const counted = $derived(counting ? steps[at]?.skipCount : undefined);
	const typeable = $derived(sheet ? sheet.boxes.map((b) => b.id).filter((id) => !isAuto(id) && !isCountBox(id)) : []);
	const nextBox = (id: string) => typeable[typeable.indexOf(id) + 1] ?? null;
	const prevBox = (id: string) => typeable[typeable.indexOf(id) - 1] ?? null;
	const active = $derived(
		!sheet || phase !== 'working' ? -1 : way === 'type' ? (current ? stepOfBox(sheet, current) : -1) : at < steps.length ? at : -1
	);
	/** The step a hint is for: the one being worked, or (no box chosen) the first empty box's. */
	const hintStep = $derived.by(() => {
		if (!sheet || phase !== 'working' || way === 'watch') return -1;
		if (active >= 0) return active;
		const empty = typeable.find((id) => !values[id]);
		return empty ? stepOfBox(sheet, empty) : -1;
	});
	const hints = $derived(sheet && hintStep >= 0 ? hintsFor(sheet, hintStep, values) : []);
	/** A box that takes a decimal point, its cell (a fraction's half square, a regrouping 1 in a corner), and whether it
	 *  is crossed out now. */
	const isPoint = (id: string) => !!cellOf(id)?.point;
	const hasPoints = $derived(!!sheet?.cells.some((c) => c.kind === 'box' && c.point));
	function crossedNow(id: string) {
		const by = sheet?.crossedBy?.[id];
		if (by) return !!values[by] || isReveal;
		return sheet?.crossed?.[id] !== undefined && furthest >= sheet.crossed[id];
	}
	const givenCrossed = (c: Cell) => c.kind === 'given' && !!c.crossBy && (!!values[c.crossBy] || isReveal);
	$effect(() => {
		void index;
		void hintStep;
		hintShown = 0;
		hintOpen = false;
		misses = 0;
		slow = false;
		clearTimeout(hintTimer);
		if (hintStep >= 0) hintTimer = setTimeout(() => (slow = true), 45000);
		return () => clearTimeout(hintTimer);
	});
	$effect(() => {
		void index;
		fails = 0;
	});
	const stuck = $derived((fails >= 1 || misses >= 2 || slow) && hintShown < hints.length);
	function showHint() {
		hintOpen = true;
		if (hintShown < hints.length) hintShown += 1;
		slow = false;
		fails = 0;
		misses = 0;
		clearTimeout(hintTimer);
		hintTimer = setTimeout(() => (slow = true), 45000);
	}

	const canCheck = $derived(phase === 'working' && way !== 'watch' && !busy && !!sheet && allFilled(sheet, values));
	const stepperAt = $derived.by(() => {
		if (counted) return { row: counted.row, col: counted.onesCol };
		const id = counting ? steps[at]?.boxes[0] : undefined;
		for (const c of sheet?.cells ?? []) if (c.kind === 'box' && c.id === id) return { row: c.row, col: c.col };
		return null;
	});
	const live = $derived.by(() => {
		if (!counting || busy) return null;
		if (counted) {
			if (typed) {
				const want = String(skipValue(counted));
				return { digits: [...typed], row: counted.row, onesCol: counted.onesCol, over: typed.length >= want.length && typed !== want };
			}
			// The first ▲ puts the starting number in the box (count 0), every step alike, a step of 0 too: the sum so far
			// (addition), the product so far (multiplication), or (subtraction, which counts up to the top digit) how many
			// steps so far, which is its answer. Before that the box is empty, and That's it asks for the ▲ first.
			if (count === null) return null;
			const shown = counted.words === 'sub' ? count : (counted.start ?? 0) + count * counted.by;
			return { digits: [...String(shown)], row: counted.row, onesCol: counted.onesCol, over: count > counted.times };
		}
		const cu = steps[at]?.countUp;
		return !cu || count === null
			? null
			: { digits: [...String(count * cu.divisor)], row: cu.row, onesCol: cu.onesCol, over: countState(cu.partial, cu.divisor, count) === 'over' };
	});
	const PREFIX: Record<string, string> = { divide: 'Divide', multiply: 'Multiply', subtract: 'Subtract', carry: 'Carry', sumCarry: 'Carry', add: 'Add' };
	function prefixed(k: string, text: string) {
		const p = PREFIX[k];
		return !p || text.toLowerCase().startsWith(p.toLowerCase()) ? text : `${p}: ${text[0].toLowerCase()}${text.slice(1)}`;
	}
	const watchAnswer = $derived.by(() => {
		const st = way === 'watch' && watchShown ? steps[at] : undefined;
		if (!st) return '';
		const l = st.liftCarry;
		return l ? `${values[l.tens] ?? ''}${values[l.ones] ?? ''}` : st.boxes.map((b) => values[b] ?? '').join('');
	});
	/** What a count comes to, typed instead of counted: the product (multiplication), the column's sum, or (subtraction)
	 *  how many it took to count up. */
	const skipValue = (s: NonNullable<Step['skipCount']>) => (s.words === 'sub' ? s.times : (s.start ?? 0) + s.by * s.times);
	function skipPrompt(s: NonNullable<Step['skipCount']>) {
		const start = s.start ?? 0;
		// Every step the same way, a step of 0 too: ▲ starts at the starting number, then ▲ once for each to count, then
		// That's it (counting 0 times: start, then That's it).
		const done = count === s.times ? ' Press That’s it.' : '';
		if (s.words === 'add') {
			if (typed) return `${start} + ${s.times} = ${typed}? Press That’s it.`;
			if (count === null) return `${start} + ${s.times}: start at ${start} with ▲, then count on ${s.times}. Or type it.`;
			if (count === 0) return `${start}: you start at ${start}. Count on ${s.times} with ▲.${done}`;
			return `${Array.from({ length: count }, (_, i) => start + i + 1).join(', ')}: that’s ${count} on from ${start}.${done}`;
		}
		if (s.words === 'sub') {
			const goal = start + s.times;
			if (typed) return `From ${start} up to ${goal} is ${typed}? Press That’s it.`;
			if (count === null) return `${goal} − ${start}: start at ${start} with ▲, then count up to ${goal}. How many steps?`;
			const at = start + count;
			if (count === 0) return `You start at ${start}: 0 up.${at < goal ? ` Count up to ${goal} with ▲.` : ' Press That’s it.'}`;
			return `${Array.from({ length: count }, (_, i) => start + i + 1).join(', ')}: ${count} up, at ${at}.${at < goal ? ' Keep going.' : at === goal ? ' Press That’s it.' : ' Too far: go back with ▼.'}`;
		}
		if (typed) return `${s.by} × ${s.times} = ${typed}? Press That’s it.`;
		if (count === null) return `${s.by} × ${s.times}: start at 0 with ▲, then count by ${s.by}s, ${s.times} ${s.times === 1 ? 'time' : 'times'}. Or type it.`;
		if (count === 0) return `0: you start at 0. Count by ${s.by}s, ${s.times} ${s.times === 1 ? 'time' : 'times'}, with ▲.${done}`;
		return `${Array.from({ length: count }, (_, i) => (i + 1) * s.by).join(', ')}: that’s ${count} ${count === 1 ? 'time' : 'times'}.${done}`;
	}
	const prompt = $derived.by(() => {
		if (!sheet || phase !== 'working') return '';
		if (way === 'watch') {
			if (at >= steps.length) return `So ${sheet.title} = ${showAnswer(sheet.answer)}.${sheet.note ? ` ${sheet.note}` : ''}`;
			const st = steps[at];
			return st.kind === 'zero' ? (st.told?.(values) ?? '') : prefixed(st.kind, st.prompt(values));
		}
		if (way === 'countUp') {
			if (at >= steps.length) return 'Press Check, or Enter.';
			if (busy && steps[at].told) return steps[at].told!(values);
			if (nudge) return nudge;
			if (counted) return skipPrompt(counted);
			if (counting) return steps[at].prompt(values);
			const si = current ? stepOfBox(sheet, current) : at;
			const st = steps[si];
			const sc = st?.skipCount;
			const p =
				sc && carryStep === si
					? `${sc.by} × ${sc.times} = ${sc.by * sc.times}. Now add the ${sc.carry} you carried: what is ${sc.by * sc.times} + ${sc.carry}?`
					: (st?.prompt(values) ?? '');
			return current && flags.markNow && isWrong(sheet, values, current) ? `Not quite. ${p}` : p;
		}
		if (!flags.prompt) return '';
		if (!current || (values[current] && !nextBox(current) && allFilled(sheet, values))) return 'Press Check, or Enter.';
		const p = steps[stepOfBox(sheet, current)]?.prompt(values) ?? '';
		return flags.markNow && isWrong(sheet, values, current) ? `Not quite. ${p}` : p;
	});

	function shown(c: Cell) {
		if (!sheet || phase === 'setup') return true;
		// an arrow (a bring-down, a lifted point) is drawn once its box is filled, and stays
		if (c.kind === 'arrow' && c.after) return !!values[c.after];
		// a placed point where the count typed puts it; a zero in front of it once the count is right
		if (c.kind === 'given' && c.after) return c.when !== undefined ? values[c.after] === c.when : isRight(sheet, values, c.after);
		return isReveal || !flags.build ? true : cellStep(sheet, c) <= furthest;
	}
	const litSet = $derived.by(() => {
		if (!flags.spotlight || active < 0) return null;
		const st = steps[active];
		if (carryStep === active && st.skipCount) {
			const carry = st.lit.find((x) => /c\d+$/.test(x) && !st.boxes.includes(x));
			const own = st.boxes.filter((x) => x !== st.liftCarry?.tens);
			return new Set([...(carry ? [carry] : []), ...own]);
		}
		if (counting && st.skipCount && st.skipCount.carry > 0) {
			const carry = st.lit.find((x) => /c\d+$/.test(x) && !st.boxes.includes(x));
			return new Set(st.lit.filter((x) => x !== carry));
		}
		return new Set(growLit ?? st.lit);
	});
	const lit = (key: string) => !litSet || litSet.has(key);

	function fit(view: { top: number; left: number; bottom: number; right: number }, area: { left: number; top: number; width: number; height: number }, max: number) {
		const w = view.right - view.left + 3;
		const h = view.bottom - view.top + 3;
		const scale = Math.max(0.2, Math.min(max, area.width / (w * SQUARE), area.height / (h * SQUARE)));
		const s = SQUARE * scale;
		return {
			scale,
			x: Math.round(area.left + area.width / 2 - ((view.left + view.right + 1) / 2) * s),
			y: Math.round(area.top + area.height / 2 - ((view.top + view.bottom + 1) / 2) * s)
		};
	}
	const camera = $derived.by(() => {
		const area = { left: 8, top: barH + 8, width: W - 16, height: H - barH - bandH - 16 };
		if (padOpen && padRect && !narrow && way !== 'watch') {
			const leftSpace = padRect.x - 16;
			const rightSpace = W - (padRect.x + padRect.width) - 16;
			if (leftSpace >= rightSpace) area.width = Math.max(200, leftSpace);
			else {
				area.left = padRect.x + padRect.width + 8;
				area.width = Math.max(200, rightSpace);
			}
		}
		if (!sheet) return { scale: 1, x: 0, y: 0 };
		const zoomed = flags.zoom && active >= 0;
		return fit(
			zoomed ? { ...steps[active].view, left: 0, right: sheet.cols - 1 } : { top: 0, left: 0, bottom: sheet.rows - 1, right: sheet.cols - 1 },
			area,
			zoomed ? 2 : 1.3
		);
	});
	$effect(() => {
		void camera.scale, camera.x, camera.y;
		if (still && worldEl) worldEl.animate([{ opacity: 0.25 }, { opacity: 1 }], { duration: 350, easing: 'ease-out' });
	});

	// --- waiting and animations (Space or a digit finishes them at once) ---

	const waiters = new Set<() => void>();
	let hurry = false;
	function wait(ms: number) {
		if (hurry) return Promise.resolve();
		return new Promise<void>((done) => {
			const end = () => {
				clearTimeout(timer);
				waiters.delete(end);
				done();
			};
			const timer = setTimeout(end, ms);
			waiters.add(end);
		});
	}
	const running = () => (graphEl?.getAnimations({ subtree: true }) ?? []).filter((a) => a.playState === 'running');
	const animating = () => waiters.size > 0 || running().length > 0;
	function finishAll() {
		for (const w of [...waiters]) w();
		for (const a of running())
			try {
				a.finish();
			} catch {
				/* fine */
			}
	}
	async function busyDo(f: () => Promise<void>) {
		busy = true;
		try {
			await f();
		} finally {
			busy = false;
			hurry = false;
		}
	}
	const cellOf = (id: string) => {
		const c = sheet?.cells.find((x) => x.kind === 'box' && x.id === id);
		return c && c.kind === 'box' ? c : null;
	};
	function fill(id: string) {
		if (!sheet) return;
		values[id] = String(boxOf(sheet, id).digit);
		inputs[id]?.animate(
			still ? [{ opacity: 0 }, { opacity: 1 }] : [{ opacity: 0, transform: 'scale(0.5)' }, { opacity: 1, transform: 'none' }],
			{ duration: 350, easing: 'ease-out' }
		);
	}
	/** A bring-down: the digit slides down from the number being divided. */
	async function slide(i: number) {
		const st = steps[i];
		if (!sheet || !st?.slide) return;
		const id = st.boxes[0];
		const c = cellOf(id);
		if (!c || values[id]) return;
		floater = { text: String(boxOf(sheet, id).digit), row: st.slide.row, col: st.slide.col, toRow: c.row };
		await tick();
		const dy = (c.row - st.slide.row) * SQUARE;
		const a = floaterEl?.animate(
			still
				? [{ opacity: 0, transform: `translateY(${dy}px)` }, { opacity: 1, transform: `translateY(${dy}px)` }]
				: [{ transform: 'translateY(0)', opacity: 0.4 }, { transform: 'translateY(0)', opacity: 1, offset: 0.15 }, { transform: `translateY(${dy}px)`, opacity: 1 }],
			{ duration: hurry ? 0 : 845, easing: 'ease-in-out', fill: 'forwards' }
		);
		try {
			await a?.finished;
		} catch {
			/* fine */
		}
		values[id] = floater?.text ?? '';
		floater = null;
	}
	/** A carry: the tens digit floating over the tens column goes up, small, into the carry box. */
	async function lift(i: number, tens: string) {
		const l = steps[i]?.liftCarry;
		const o = l && cellOf(l.ones);
		const t = l && cellOf(l.tens);
		if (!l || !o || !t) return;
		floater = { text: tens, row: o.row, col: t.col, toRow: t.row };
		await tick();
		const dy = (t.row - o.row) * SQUARE;
		const a = floaterEl?.animate(
			still
				? [{ opacity: 0, transform: `translateY(${dy}px) scale(0.45)` }, { opacity: 1, transform: `translateY(${dy}px) scale(0.45)` }]
				: [{ transform: 'translateY(0) scale(1)' }, { transform: 'translateY(0) scale(1)', offset: 0.2 }, { transform: `translateY(${dy}px) scale(0.45)` }],
			{ duration: hurry ? 0 : 845, easing: 'ease-in-out', fill: 'forwards' }
		);
		try {
			await a?.finished;
		} catch {
			/* fine */
		}
		values[l.tens] = tens;
		floater = null;
	}
	/** A step the page does itself (Watch, the bring-downs, Count up's products). */
	async function autoStep(i: number) {
		const st = steps[i];
		furthest = Math.max(furthest, i);
		if (st.kind === 'bringDown') await slide(i);
		else if (st.liftCarry && sheet) {
			const l = st.liftCarry;
			for (const id of st.boxes) if (id !== l.tens) fill(id);
			const o = cellOf(l.ones);
			const t = cellOf(l.tens);
			const tens = String(boxOf(sheet, l.tens).digit);
			if (o && t) floater = { text: tens, row: o.row, col: t.col, toRow: t.row };
			await wait(STEP_MS * 0.7);
			await lift(i, tens);
		} else for (const id of st.boxes) fill(id);
	}
	async function focusBox(id: string | null) {
		current = id;
		if (id === null) return;
		if (sheet) furthest = Math.max(furthest, stepOfBox(sheet, id));
		await tick();
		inputs[id]?.focus();
	}

	// --- a problem ---

	function reset() {
		finishAll();
		values = {};
		before = {};
		firstTry = true;
		sticky = false;
		nudge = '';
		count = null;
		watchShown = false;
		at = 0;
		furthest = 0;
		floater = null;
		pendingTens = '';
		typed = '';
		carryStep = null;
		current = null;
		phase = 'working';
		if (!sheet) return;
		const grow = steps[0]?.grow;
		growLit = null;
		if (grow && flags.spotlight) {
			growLit = grow;
			setTimeout(() => (growLit = null), still ? 0 : 1100);
		}
		// (Count up from the first step, which the page does itself when the bottom number ends in 0)
		if (way === 'countUp') advance(0);
		else if (way === 'type') focusBox(typeable[0] ?? null);
		else tick().then(() => nextBtn?.focus());
	}
	function start() {
		sheets = makeSheets();
		index = 0;
		rightCount = 0;
		wrongCount = 0;
		reported = false;
		reset();
	}
	function clear() {
		if (sheet) reset();
	}

	async function enterDigit(id: string, d: string) {
		if (!sheet || phase !== 'working' || isAuto(id)) return;
		const sh = sheet;
		const el = inputs[id];
		const l = steps[stepOfBox(sh, id)]?.liftCarry;
		if (l && l.ones === id) {
			if (!d) {
				pendingTens = '';
				floater = null;
				values[id] = '';
				if (el) el.value = '';
				return;
			}
			if (!pendingTens) {
				pendingTens = d;
				values[id] = '';
				values[l.tens] = '';
				if (el) el.value = '';
				const o = cellOf(l.ones);
				const t = cellOf(l.tens);
				if (o && t) floater = { text: d, row: o.row, col: t.col, toRow: t.row };
				return;
			}
			const tens = pendingTens;
			pendingTens = '';
			values[id] = d;
			if (el) el.value = d;
			const si = stepOfBox(sh, id);
			await busyDo(() => lift(si, tens));
			if (flags.markNow && (isWrong(sh, values, id) || isWrong(sh, values, l.tens))) {
				misses += 1;
				inputs[id]?.select();
				return;
			}
		} else {
			values[id] = d;
			if (el) el.value = d;
		}
		if (!d) return;
		if (flags.markNow && isWrong(sh, values, id)) {
			misses += 1;
			el?.select();
			return;
		}
		const si = stepOfBox(sh, id);
		const next = steps[si + 1];
		const lastOfStep = id === steps[si].boxes.filter((b) => !isAuto(b)).at(-1);
		if (next && isAuto(next.boxes[0]) && lastOfStep) await busyDo(() => slide(si + 1));
		if (way === 'countUp' && lastOfStep) return advance(si + 1);
		const n = nextBox(id);
		if (n) focusBox(n);
		else {
			current = null;
			await tick();
			checkBtn?.focus();
		}
	}
	function onBoxInput(id: string, e: Event) {
		const el = e.currentTarget as HTMLInputElement;
		if (busy) el.value = values[id] ?? '';
		else if (isPoint(id)) enterDigit(id, el.value.replace(/,/g, '.').replace(/[^\d.]/g, '').slice(-1));
		else enterDigit(id, el.value.replace(/\D/g, '').slice(-1));
	}
	let enterHandled: Event | null = null;
	function onBoxKey(id: string, e: KeyboardEvent) {
		if (!sheet || counting) return;
		if (busy && /^\d$/.test(e.key)) {
			e.preventDefault();
			hurry = true;
			finishAll();
			queueMicrotask(async () => {
				await tick();
				if (current && !busy) enterDigit(current, e.key);
			});
		} else if ((e.key === '.' || e.key === ',') && !isPoint(id)) {
			e.preventDefault();
		} else if (e.key === 'Enter') {
			e.preventDefault();
			// this Enter checks; it must not also go on to the feedback (a second Enter does)
			enterHandled = e;
			check();
		} else if (e.key === ' ') {
			e.preventDefault();
			finishAll();
		} else if (e.key === 'Backspace' && pendingTens) {
			e.preventDefault();
			pendingTens = '';
			floater = null;
		} else if (e.key === 'Backspace' && !values[id]) {
			e.preventDefault();
			const p = prevBox(id);
			if (p) {
				values[p] = '';
				focusBox(p);
			}
		} else if (e.key === 'Tab') {
			const n = e.shiftKey ? prevBox(id) : nextBox(id);
			if (n) {
				e.preventDefault();
				focusBox(n);
			} else if (!e.shiftKey && checkBtn && !checkBtn.disabled) {
				e.preventDefault();
				checkBtn.focus();
			}
		}
	}

	// --- Count up ---

	function startCount() {
		if (!sheet || at >= steps.length) return;
		carryStep = null;
		count = null;
		typed = '';
		nudge = '';
		if (!steps[at].skipCount) values[steps[at].boxes[0]] = '';
		focusBox(steps[at].boxes[0]);
	}
	async function advance(from: number) {
		carryStep = null;
		let t = from;
		if (t < steps.length && isAuto(steps[t].boxes[0]))
			await busyDo(async () => {
				while (t < steps.length && isAuto(steps[t].boxes[0])) {
					at = t;
					await wait(STEP_MS / 3);
					await autoStep(t);
					await wait(STEP_MS);
					t++;
				}
			});
		at = t;
		furthest = Math.max(furthest, Math.min(at, steps.length - 1));
		if (at >= steps.length) {
			current = null;
			await tick();
			checkBtn?.focus();
		} else if (isCountStep(steps[at])) startCount();
		else focusBox(steps[at].boxes[0]);
	}
	function bump(by: number) {
		if (!counting || busy) return;
		typed = '';
		// a count by skips starts with ▲ at the starting number (count 0); a quotient digit starts at 1 (or 0 with ▼)
		if (steps[at]?.skipCount) setCount(count === null ? (by > 0 ? 0 : null) : Math.max(0, Math.min(9, count + by)));
		else setCount(count === null ? +(by > 0) : Math.max(0, Math.min(9, count + by)));
	}
	function setCount(n: number | null) {
		count = n;
		nudge = '';
		if (!steps[at].skipCount) values[steps[at].boxes[0]] = n === null ? '' : String(n);
	}
	async function thatsIt() {
		if (way !== 'countUp' || busy || phase !== 'working') return;
		if (at >= steps.length) return check();
		const sc = steps[at].skipCount;
		if (sc && typed) {
			if (Number(typed) !== skipValue(sc)) {
				nudge = sc.words
					? `${typed} isn’t it. Count with ▲ to find it.`
					: `${typed} isn’t ${sc.by} × ${sc.times}. Count by ${sc.by}s with ▲ to find it.`;
				fails += 1;
				typed = '';
				return;
			}
			typed = '';
			count = sc.times;
		}
		if (sc && sc.carry > 0 && count === sc.times) {
			nudge = '';
			carryStep = at;
			focusBox(steps[at].boxes.find((b) => !isAuto(b)) ?? null);
			return;
		}
		if (count === null) {
			nudge = sc ? `Start with ▲: you start at ${sc.start ?? 0}.` : 'Count up with ▲ first.';
			return;
		}
		if (sc) {
			if (count !== sc.times) {
				const word = sc.words === 'sub' ? `up to ${(sc.start ?? 0) + count}` : `${count} on`;
				nudge = sc.words
					? count < sc.times
						? `That’s ${word} so far. Keep counting.`
						: `That’s ${word}, too far. Count back with ▼.`
					: count < sc.times
						? `That’s ${count} times so far. Keep counting to ${sc.times}.`
						: `That’s ${count} times, more than ${sc.times}. Count back with ▼.`;
				fails += 1;
				return;
			}
			nudge = '';
			const i = at;
			await busyDo(async () => {
				await autoStep(i);
				await wait(STEP_MS * 1.4);
			});
			return advance(i + 1);
		}
		const cu = steps[at].countUp!;
		const n = countNudge(cu.partial, cu.divisor, count);
		if (n) nudge = n;
		else {
			nudge = '';
			return advance(at + 1);
		}
	}

	// --- Watch ---

	async function watchNext() {
		if (busy || animating()) return finishAll();
		if (!sheet || phase !== 'working') return;
		if (at >= steps.length) return nextProblem();
		if (watchShown) {
			watchShown = false;
			at++;
			furthest = Math.min(Math.max(furthest, at), steps.length - 1);
		} else {
			const i = at;
			await busyDo(async () => {
				await autoStep(i);
				await wait(325);
			});
			watchShown = true;
		}
	}

	// --- the keypad ---

	function keypad(k: string) {
		if (!sheet || phase !== 'working' || busy) return;
		if (counting && counted) {
			const most = counted.words ? 2 : String(counted.by * 9).length;
			typed = k === '' ? typed.slice(0, -1) : typed.length >= most ? k : typed + k;
			count = null;
			nudge = '';
			return;
		}
		if (counting) {
			setCount(k === '' ? null : Number(k));
			return;
		}
		if (way === 'watch') return;
		const id = current ?? typeable.find((b) => !values[b]) ?? null;
		if (!id || (k === '.' && !isPoint(id))) return;
		if (k === '') {
			if (values[id]) enterDigit(id, '');
			else {
				const p = prevBox(id);
				if (p) {
					values[p] = '';
					focusBox(p);
					return;
				}
			}
			focusBox(id);
		} else enterDigit(id, k);
	}

	// --- Check, and on ---

	async function check() {
		if (!sheet || !canCheck) return;
		if (allRight(sheet, values)) {
			fb = 'right';
			if (scored) rightCount++;
		} else if (firstTry) {
			fb = 'again';
			fails += 1;
			firstTry = false;
			sticky = true;
		} else {
			fb = 'reveal';
			fails += 1;
			if (scored) wrongCount++;
			before = { ...values };
			values = correctValues(sheet);
		}
		phase = 'feedback';
		current = null;
		await tick();
		if (fb === 'right') soundRight(feedbackEl);
		else soundWrong(feedbackEl);
		feedbackBtn?.focus();
	}
	async function onFeedback() {
		if (!sheet) return;
		if (fb === 'again') {
			phase = 'working';
			const sh = sheet;
			await focusBox(sh.answerBoxes.find((id) => isWrong(sh, values, id) && !isAuto(id)) ?? typeable[0] ?? null);
		} else nextProblem();
	}
	function nextProblem() {
		if (index + 1 < sheets.length) {
			index++;
			reset();
		} else {
			phase = 'over';
			if (!reported) {
				reported = true;
				finished(rightCount);
			}
		}
	}

	function onWindowKey(e: KeyboardEvent) {
		if (e === enterHandled) return;
		const t = e.target as HTMLElement;
		if (t.closest?.('button, a, form, [role="dialog"]')) return;
		if (phase === 'feedback' && e.key === 'Enter') {
			e.preventDefault();
			onFeedback();
		} else if (phase === 'working') {
			if (way === 'watch' && [' ', 'Enter', 'ArrowRight'].includes(e.key)) {
				e.preventDefault();
				watchNext();
			} else if (way === 'countUp' && (counting || at >= steps.length)) {
				if (e.key === 'ArrowUp') bump(1);
				else if (e.key === 'ArrowDown') bump(-1);
				else if (e.key === 'Enter') thatsIt();
				else if (e.key === ' ') finishAll();
				else if (/^\d$/.test(e.key)) keypad(e.key);
				else return;
				e.preventDefault();
			} else if (e.key === ' ' && t.tagName !== 'INPUT') {
				e.preventDefault();
				finishAll();
			}
		}
	}

	onMount(() => {
		planned = makeSheets().length;
		const saved = load(PAD_KEY) as { open?: unknown; rect?: Rect } | null;
		if (saved && typeof saved === 'object') {
			padOpen = saved.open === true;
			if (saved.rect && typeof saved.rect === 'object') padSaved = saved.rect;
		}
		const mq = matchMedia('(prefers-reduced-motion: reduce)');
		still = mq.matches;
		const on = () => (still = mq.matches);
		mq.addEventListener('change', on);
		return () => mq.removeEventListener('change', on);
	});
	$effect(() => {
		document.title = `${title} · ${kind.title}`;
	});

	const toGo = $derived(phase === 'over' ? 0 : sheets.length - index - +settled);
	function boxLabel(id: string) {
		if (isCountBox(id) && current === id)
			return { multiply: 'Product: ▲ and ▼ to count', divide: 'Quotient digit: ▲ and ▼ to count up', add: 'Sum: ▲ and ▼ to count on', subtract: 'Difference: ▲ and ▼ to count up' }[activity.kind];
		const c = cellOf(id);
		if (c?.point) return 'Decimal point';
		if (c?.half) return c.half === 'top' ? 'Fraction, top digit' : 'Fraction, bottom digit';
		if (c?.corner) return 'Regrouping 1';
		return sheet?.remainderBoxes?.includes(id) ? 'Remainder digit' : 'Digit';
	}
</script>

<svelte:window bind:innerWidth={W} bind:innerHeight={H} onkeydown={onWindowKey} />

{#snippet box(id: string, small: boolean)}
	{@const auto = isAuto(id)}
	{@const cell = cellOf(id)}
	{@const countBox = isCountBox(id)}
	{@const canType = way !== 'watch' && !auto && !countBox}
	{@const liftTens = !!sheet && steps[stepOfBox(sheet, id)]?.liftCarry?.tens === id && way === 'type'}
	{@const wrongNow =
		!!sheet &&
		!isReveal &&
		isWrong(sheet, values, id) &&
		((phase === 'working' && (canType || liftTens) && flags.markNow) || (sticky && sheet.answerBoxes.includes(id)))}
	<input
		bind:this={inputs[id]}
		type="text"
		pattern="[0-9]*"
		autocomplete="off"
		maxlength="2"
		class="digit"
		data-box={id}
		class:small
		class:current={current === id && phase === 'working'}
		class:wrong={wrongNow}
		class:shown={isReveal && before[id] !== values[id]}
		class:counting={countBox && current === id && !busy && phase === 'working'}
		class:remainder={sheet?.remainderBoxes?.includes(id)}
		class:half={!!cell?.half}
		class:corner={!!cell?.corner}
		class:point={!!cell?.point}
		class:crossed={crossedNow(id)}
		inputmode={canType ? (cell?.point ? 'decimal' : 'numeric') : 'none'}
		aria-label={boxLabel(id)}
		value={values[id] ?? ''}
		readonly={phase !== 'working' || !canType}
		tabindex={canType ? undefined : -1}
		onfocus={(e) => {
			if (canType) {
				current = id;
				e.currentTarget.select();
			}
		}}
		oninput={(e) => onBoxInput(id, e)}
		onkeydown={(e) => onBoxKey(id, e)}
	/>
{/snippet}

<div
	class="graph"
	class:still
	bind:this={graphEl}
	aria-hidden={phase === 'setup' || phase === 'over'}
	style:--zoom={camera.scale}
	style:--pan-x="{camera.x}px"
	style:--pan-y="{camera.y}px"
	style:--square="{SQUARE}px"
>
	{#if sheet && phase !== 'setup' && phase !== 'over'}
		<div class="world" bind:this={worldEl}>
			{#key sheet}
				<Sheet {sheet} {box} paper={false} {shown} {lit} crossed={givenCrossed} draw={flags.build && flags.drawSigns} />
			{/key}
			{#if live}
				<span
					class="live"
					class:over={live.over}
					aria-hidden="true"
					style:left="{(live.onesCol - live.digits.length + 1) * SQUARE}px"
					style:top="{live.row * SQUARE}px"
					style:width="{live.digits.length * SQUARE}px"
				>
					{#each live.digits as d, i (i)}<span>{d}</span>{/each}
				</span>
			{/if}
			{#if counting && stepperAt}
				<div class="stepper" role="group" aria-label="Count up" style:left="{(stepperAt.col + 1) * SQUARE + 6}px" style:top="{stepperAt.row * SQUARE}px">
					<button type="button" aria-label="One more" disabled={busy || count === 9} onpointerdown={(e) => e.preventDefault()} onclick={() => bump(1)}
						><ChevronUp size={22} aria-hidden="true" /></button
					>
					<button type="button" aria-label="One less" disabled={busy || count === 0} onpointerdown={(e) => e.preventDefault()} onclick={() => bump(-1)}
						><ChevronDown size={22} aria-hidden="true" /></button
					>
				</div>
			{/if}
			{#if floater}
				<span class="slide" aria-hidden="true" bind:this={floaterEl} style:left="{floater.col * SQUARE}px" style:top="{floater.row * SQUARE}px"
					>{floater.text}</span
				>
			{/if}
		</div>
	{/if}
</div>

<header class="bar" bind:offsetHeight={barH}>
	{#if extra}
		<button type="button" class="extra" onclick={extra.onclick}>{extra.label}</button>
	{/if}
	<h1>{title}</h1>
	{#if preview}<span class="chip preview">Preview</span>{/if}
	<span class="chip level-chip" title="Level of support">{levelLabel}</span>
	{#if sheet && phase !== 'setup'}
		<div class="count" aria-label="Score">
			{#if scored}
				<span class="chip good" title="Right"><Check size={14} aria-hidden="true" /> {rightCount}</span>
				<span class="chip bad" title="Wrong"><X size={14} aria-hidden="true" /> {wrongCount}</span>
			{/if}
			{#if phase !== 'over'}<span class="chip">{toGo} to go</span>{/if}
		</div>
		{#if way !== 'watch' && phase !== 'over'}
			<button type="button" class="pad-toggle" aria-pressed={padOpen} onpointerdown={(e) => e.preventDefault()} onclick={() => setPad(!padOpen)}
				><Grid3x3 size={16} aria-hidden="true" /> Keypad</button
			>
		{/if}
	{/if}
</header>

{#if phase === 'setup' || phase === 'over'}
	<main class="menu" style:padding-top="{barH + 24}px">
		{#if phase === 'setup'}
			<h2>{kind.title}</h2>
			<ol class="steps">
				{#each kind.steps as s (s)}<li>{s}</li>{/each}
			</ol>
			<p class="level-line">
				{planned}
				{planned === 1 ? 'problem' : 'problems'}, at <b>{levelLabel}</b>{#if level !== 'custom'}: {kind.studentLevelText?.[level] ?? info?.detail}{/if}
			</p>
			<div class="menu-actions">
				<button type="button" class="btn-primary big" onclick={start}><Play size={18} aria-hidden="true" /> Start</button>
			</div>
		{:else}
			<h2>All done!</h2>
			{#if rightCount + wrongCount > 0}
				<p class="final">You got <b class="good-text">{rightCount}</b> right and <b class="bad-text">{wrongCount}</b> wrong.</p>
			{:else}
				<p class="final">You watched {sheets.length} {sheets.length === 1 ? 'problem' : 'problems'} worked.</p>
			{/if}
			<div class="menu-actions">
				<button type="button" class="btn-primary big" onclick={start}><Play size={18} aria-hidden="true" /> {againLabel ?? 'Start again'}</button>
			</div>
		{/if}
		<Footer />
	</main>
{:else if sheet}
	<p class="sr-only">{sheet.title}</p>
	{#if padOpen && !narrow && way !== 'watch'}
		<FloatingKeypad
			top={barH}
			disabled={phase !== 'working'}
			ontap={keypad}
			onclose={() => setPad(false)}
			bind:rect={padRect}
			saved={padSaved}
			onmoved={(r) => savePad(r)}
		/>
	{/if}
	<div class="band" bind:offsetHeight={bandH}>
		{#if phase === 'feedback'}
			<div class="feedback {fb}" aria-live="polite" bind:this={feedbackEl}>
				<p>
					{#if fb === 'right'}<b>Correct!</b> {sheet.title} = {showAnswer(sheet.answer)}{:else if fb === 'again'}<b>Not quite.</b> Check your work
						and try again.{:else}<b>The answer is {showAnswer(sheet.answer)}.</b> The digits you missed are filled in.{/if}
					{#if fb !== 'again' && sheet.note}<span class="note">{sheet.note}</span>{/if}
				</p>
				<button type="button" class="btn-primary" bind:this={feedbackBtn} onclick={onFeedback}>
					{#if fb === 'again'}Try again{:else if index + 1 < sheets.length}Next problem{:else}See the score{/if}
				</button>
			</div>
		{:else}
			{#if hintOpen && hintShown && hints.length}
				<div class="hint-box" aria-live="polite">
					<p class="hint-head">
						<Lightbulb size={15} aria-hidden="true" /> Hint {Math.min(hintShown, hints.length)} of {hints.length}
						<button type="button" class="hint-close" aria-label="Hide the hints" onclick={() => (hintOpen = false)}>✕</button>
					</p>
					<ol>
						{#each hints.slice(0, hintShown) as h, i (i)}<li>{h}</li>{/each}
					</ol>
				</div>
			{/if}
			<div class="prompt-row">
				<p class="prompt" class:nudge={!!nudge} aria-live="polite">
					{prompt}{#if watchAnswer}<b class="answer">{watchAnswer}</b>{/if}
				</p>
				<div class="actions">
					{#if way === 'watch'}
						<button type="button" class="btn-primary big" bind:this={nextBtn} onclick={watchNext}
							><SkipForward size={18} aria-hidden="true" />
							{at >= steps.length ? (index + 1 < sheets.length ? 'Next problem' : 'Done') : 'Next'}</button
						>
					{:else if counting}
						<button type="button" class="btn-primary big" disabled={busy} onpointerdown={(e) => e.preventDefault()} onclick={thatsIt}
							><Check size={18} aria-hidden="true" /> That’s it</button
						>
					{:else}
						<button type="button" class="btn-primary big" bind:this={checkBtn} disabled={!canCheck} onclick={check}
							><Check size={18} aria-hidden="true" /> Check</button
						>
					{/if}
					{#if way !== 'watch' && hints.length}
						<button
							type="button"
							class="btn-ghost hint-btn"
							class:stuck
							disabled={hintShown >= hints.length && hintOpen}
							aria-label={hintShown >= hints.length ? (hintOpen ? 'No more hints for this step' : 'Show the hints again') : stuck ? 'Stuck? Get a hint' : 'Get a hint'}
							onpointerdown={(e) => e.preventDefault()}
							onclick={showHint}><Lightbulb size={17} aria-hidden="true" /><span class="hint-word">{stuck ? 'Stuck? Hint' : 'Hint'}</span></button
						>
					{/if}
					{#if way === 'type'}
						<button type="button" class="btn-ghost" onclick={clear}><Eraser size={17} aria-hidden="true" /> Clear</button>
					{/if}
				</div>
			</div>
			{#if padOpen && narrow && way !== 'watch'}
				<Keypad wide point={hasPoints} disabled={phase !== 'working'} ontap={keypad} />
			{/if}
		{/if}
	</div>
{/if}

<style>
	.graph {
		position: fixed;
		inset: 0;
		overflow: hidden;
		background-color: var(--graph-ground);
		background-image:
			linear-gradient(to right, var(--graph-line) 1px, transparent 1px),
			linear-gradient(to bottom, var(--graph-line) 1px, transparent 1px);
		background-size: calc(var(--square) * var(--zoom)) calc(var(--square) * var(--zoom));
		background-position: var(--pan-x) var(--pan-y);
		transition:
			--zoom 0.8s ease-in-out,
			--pan-x 0.8s ease-in-out,
			--pan-y 0.8s ease-in-out;
	}
	.graph.still {
		transition: none;
	}
	.world {
		position: absolute;
		top: 0;
		left: 0;
		transform-origin: 0 0;
		transform: translate(var(--pan-x), var(--pan-y)) scale(var(--zoom));
	}
	.world :global(.sheet) {
		--cell: var(--square);
	}
	.digit {
		display: block;
		width: 100%;
		height: 100%;
		padding: 0;
		border: 0;
		border-radius: 0;
		background: color-mix(in srgb, var(--box-wash) 55%, transparent);
		color: var(--ink);
		caret-color: transparent;
		font: inherit;
		font-size: calc(var(--cell) * 0.58);
		font-weight: 700;
		line-height: 1;
		text-align: center;
		font-variant-numeric: tabular-nums;
		transition: background 0.15s;
	}
	.digit:focus,
	.digit.current {
		outline: none;
		background: var(--box-wash);
		caret-color: var(--box);
		box-shadow: inset 0 -3px 0 var(--box);
	}
	.digit.crossed {
		color: var(--muted);
		background-image: linear-gradient(
			to top right,
			transparent calc(50% - 1.5px),
			var(--ink-soft) calc(50% - 1.5px) calc(50% + 1.5px),
			transparent calc(50% + 1.5px)
		);
	}
	.digit.counting {
		box-shadow:
			inset 0 0 0 2px var(--box),
			inset 0 -3px 0 var(--box);
	}
	.digit.small {
		place-self: end center;
		width: 62%;
		height: 62%;
		font-size: calc(var(--cell) * 0.36);
	}
	.digit.half {
		font-size: calc(var(--cell) * 0.42);
	}
	.digit.corner {
		font-size: calc(var(--cell) * 0.28);
		border-radius: 4px;
	}
	.digit.point {
		border-radius: 5px;
		font-size: calc(var(--cell) * 0.5);
		line-height: 0.6;
	}
	.digit.remainder {
		background: color-mix(in srgb, var(--remainder-wash) 70%, transparent);
		color: var(--remainder);
	}
	.digit.remainder:focus,
	.digit.remainder.current {
		background: var(--remainder-wash);
		box-shadow: inset 0 -3px 0 var(--remainder);
	}
	.digit.wrong {
		background: var(--bad-wash);
		color: var(--bad);
	}
	.digit.wrong:focus {
		box-shadow: inset 0 -3px 0 var(--bad);
	}
	.digit.shown {
		background: var(--good-wash);
		color: var(--good);
	}
	.digit[readonly] {
		cursor: default;
	}
	.live,
	.slide {
		position: absolute;
		display: flex;
		height: var(--square);
		font-size: calc(var(--square) * 0.58);
		font-weight: 700;
		line-height: 1;
		color: var(--box-dark);
		font-variant-numeric: tabular-nums;
		pointer-events: none;
	}
	.live span {
		display: grid;
		place-items: center;
		width: var(--square);
	}
	.live.over {
		border-radius: 6px;
		background: var(--bad-wash);
		box-shadow: inset 0 0 0 2.5px var(--bad);
		color: var(--bad);
	}
	.slide {
		z-index: 1;
		display: grid;
		place-items: center;
		width: var(--square);
		color: var(--ink);
	}
	.stepper {
		position: absolute;
		z-index: 2;
		display: grid;
		grid-template-rows: 1fr 1fr;
		gap: 3px;
		width: calc(var(--square) * 0.62);
		height: var(--square);
	}
	.stepper button {
		display: grid;
		place-items: center;
		padding: 0;
		border: 2px solid var(--box-line);
		border-radius: 8px;
		background: var(--paper);
		color: var(--box-dark);
		touch-action: manipulation;
		cursor: pointer;
	}
	.stepper button:hover:not(:disabled) {
		background: var(--box-wash);
	}
	.stepper button:disabled {
		color: #b9b4a3;
		border-color: var(--line);
		cursor: default;
	}

	.bar {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		z-index: 20;
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.4rem 0.6rem;
		padding: 0.45rem 0.75rem;
		border-bottom: 2px solid var(--line);
		background: color-mix(in srgb, var(--paper) 92%, transparent);
		backdrop-filter: blur(4px);
	}
	h1 {
		margin: 0 0.4rem 0 0;
		font-size: 1.05rem;
		font-weight: 800;
		white-space: nowrap;
	}
	.extra {
		padding: 0.3rem 0.75rem;
		border: 2px solid var(--line-strong);
		border-radius: 999px;
		background: var(--paper);
		color: var(--ink-soft);
		font: inherit;
		font-size: 0.82rem;
		font-weight: 700;
		cursor: pointer;
	}
	.extra:hover {
		background: var(--paper-low);
	}
	.count {
		display: flex;
		gap: 0.3rem;
		margin-left: auto;
	}
	.chip {
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
		padding: 0.25rem 0.6rem;
		border-radius: 999px;
		background: var(--paper-low);
		color: var(--ink-soft);
		font-size: 0.88rem;
		font-weight: 700;
		white-space: nowrap;
	}
	.chip.level-chip {
		background: var(--accent-wash);
		color: var(--accent-dark);
	}
	.chip.preview {
		background: var(--ink-soft);
		color: var(--paper);
	}
	.chip.good {
		background: var(--good-wash);
		color: var(--good);
	}
	.chip.bad {
		background: var(--bad-wash);
		color: var(--bad);
	}
	.pad-toggle {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		padding: 0.3rem 0.7rem;
		border: 2px solid var(--line-strong);
		border-radius: 999px;
		background: var(--paper);
		color: var(--ink-soft);
		font: inherit;
		font-size: 0.82rem;
		font-weight: 700;
		cursor: pointer;
	}
	.pad-toggle:hover {
		background: var(--box-wash);
	}
	.pad-toggle[aria-pressed='true'] {
		border-color: var(--box);
		background: var(--box-wash);
		color: var(--box-dark);
	}

	.menu {
		position: relative;
		z-index: 1;
		display: flex;
		flex-direction: column;
		width: min(38rem, 100%);
		min-height: 100dvh;
		margin: 0 auto;
		padding: 0 1rem 1rem;
	}
	.menu h2 {
		margin: 0;
		font-size: 1.6rem;
		font-weight: 800;
		line-height: 1.3;
	}
	.steps {
		display: grid;
		gap: 0.35rem;
		margin: 0.9rem 0 1rem;
		padding-left: 1.4rem;
		color: var(--ink-soft);
		line-height: 1.45;
		list-style: decimal;
	}
	.steps li::marker {
		color: var(--accent);
		font-weight: 800;
	}
	.level-line {
		margin: 0 0 1.1rem;
		color: var(--ink-soft);
		line-height: 1.45;
	}
	.menu-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.6rem;
	}
	.big {
		padding: 0.85rem 1.3rem;
		font-size: 1.05rem;
	}
	.final {
		margin: 0.6rem 0 1.25rem;
		color: var(--ink-soft);
		font-size: 1.2rem;
	}
	.good-text {
		color: var(--good);
	}
	.bad-text {
		color: var(--bad);
	}

	.band {
		position: fixed;
		left: 0;
		right: 0;
		bottom: 0;
		z-index: 10;
		display: grid;
		gap: 0.6rem;
		padding: 0.75rem max(1rem, 50vw - 30rem) 0.9rem;
		border-top: 2px solid var(--line);
		background: color-mix(in srgb, var(--paper) 94%, transparent);
		backdrop-filter: blur(4px);
	}
	.prompt-row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.6rem 1rem;
	}
	.prompt {
		flex: 18rem;
		min-height: 1.6em;
		margin: 0;
		color: var(--ink);
		font-size: 1.35rem;
		font-weight: 700;
		line-height: 1.3;
	}
	.prompt .answer {
		margin-left: 0.5rem;
		padding: 0 0.45rem;
		border-radius: 6px;
		background: var(--box-wash);
		color: var(--box-dark);
	}
	.prompt.nudge {
		color: var(--bad);
	}
	.hint-btn {
		gap: 0.35rem;
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
	.hint-box {
		padding: 0.55rem 0.95rem;
		border: 1px solid #f0d58c;
		border-radius: 12px;
		background: #fff8e1;
		color: var(--ink);
		font-size: 0.95rem;
		line-height: 1.4;
	}
	.hint-head {
		display: flex;
		align-items: center;
		gap: 0.35rem;
		margin: 0;
		color: #8a5a00;
		font-size: 0.78rem;
		font-weight: 800;
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}
	.hint-close {
		margin-left: auto;
		padding: 0.1rem 0.45rem;
		border: 0;
		border-radius: 8px;
		background: none;
		color: #8a5a00;
		font: inherit;
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
		margin-top: 0.2rem;
	}
	.actions {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5rem;
	}
	.feedback {
		display: flex;
		flex-wrap: wrap;
		justify-content: space-between;
		align-items: center;
		gap: 0.75rem;
		padding: 0.75rem 1rem;
		border: 2px solid;
		border-radius: 14px;
		font-size: 1.15rem;
		line-height: 1.4;
	}
	.feedback.right {
		border-color: var(--good-line);
		background: var(--good-wash);
		color: var(--good);
	}
	.feedback.again,
	.feedback.reveal {
		border-color: var(--bad-line);
		background: var(--bad-wash);
		color: var(--bad);
	}
	.feedback p {
		flex: 14rem;
		margin: 0;
	}
	.feedback .note {
		display: block;
		margin-top: 0.25rem;
		color: var(--ink-soft);
		font-size: 0.95rem;
	}
	.feedback .btn-primary {
		padding: 0.75rem 1.2rem;
		font-size: 1rem;
	}
	@media (max-width: 760px) {
		h1 {
			display: none;
		}
		.prompt {
			font-size: 1.15rem;
		}
		.hint-word {
			display: none;
		}
		.hint-btn.stuck .hint-word {
			display: inline;
		}
		.big {
			padding: 0.7rem 1rem;
			font-size: 1rem;
		}
		.count {
			margin-left: 0;
		}
	}
</style>
