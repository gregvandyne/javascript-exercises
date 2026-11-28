<script lang="ts">
	// The player for the other methods (the ladder and the area model for division; the area model and partial products
	// for multiplication; methods.ts). The same start screen, support modes, Check (one try again, then a worked answer),
	// hints, sounds and end screen as the standard player (Player.svelte), on a page of graph paper that scrolls: each
	// field is a number typed into a row of squares. A division's ladder grows a rung while what's left still holds the
	// divisor, so any sensible path down it is right.
	import { onMount, tick } from 'svelte';
	import { Check, ChevronDown, ChevronUp, Eraser, Grid3x3, Lightbulb, Play, SkipForward, X, ArrowRight } from '@lucide/svelte';
	import Work from '$lib/Work.svelte';
	import Keypad from '$lib/Keypad.svelte';
	import FloatingKeypad, { type Rect } from '$lib/FloatingKeypad.svelte';
	import Footer from '$lib/Footer.svelte';
	import ConfirmDialog from '$lib/ConfirmDialog.svelte';
	import { formOf, kindInfo, levelInfo, numbersOf, problemsForRun, showAnswer, type Playable, type Problem, type Values } from '$lib/logic';
	import {
		allFilled,
		buildWork,
		checkWork,
		fieldWrong,
		friendlySteps,
		methodInfo,
		norm,
		watchValues,
		workWidth,
		wrongDigits,
		type Field,
		type Work as WorkT
	} from '$lib/methods';
	import { finished, guardLeave, load, progress, right as soundRight, store, wrong as soundWrong } from '$lib/oomba';
	import Speaker from '$lib/Speaker.svelte';
	import { m, segments, t, tn, tx, type Msg } from '$lib/i18n';
	import { sayAll } from '$lib/speech';

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
		fresh?: () => Problem[];
		againLabel?: string;
	} = $props();

	const STEP_MS = 650;
	const kind = $derived(kindInfo(activity.kind));
	const method = $derived(activity.settings.method);
	const mInfo = $derived(methodInfo(activity.kind, method));
	/** Decimals: the start screen's example is a decimal one (2.3 is 2 + 0.3), not 46 = 40 + 6. */
	const decimals = $derived(numbersOf((activity.plan as { numbers?: unknown } | undefined)?.numbers) === 'decimal');
	const introSteps = $derived(
		decimals && activity.kind === 'multiply' && method === 'area' ? [t('ui.method.multiply.area.1dec'), ...mInfo.steps.slice(1, -1), t('ui.method.multiply.area.3dec')] : mInfo.steps
	);
	let runs = 0;
	const makeProblems = () => (fresh && runs++ > 0 ? fresh() : problemsForRun(activity));

	let phase = $state<'setup' | 'working' | 'feedback' | 'over'>('setup');
	let problems = $state.raw<Problem[]>([]);
	let index = $state(0);
	let rightCount = $state(0);
	let wrongCount = $state(0);
	/** Steps got wrong and put right on the way, this run (they don't change the score; the teacher sees them). */
	let fixes = $state(0);
	let firstTry = $state(true);
	/** Guided (a wrong field is marked at once, so Check never fails): a wrong entry on this problem was its wrong try,
	 *  counted once in Wrong (and the problem isn't counted Right), as a failed Check is in the other modes. */
	let missed = $state(false);
	let leaveDialog = $state<ConfirmDialog>();
	let fb = $state<'right' | 'again' | 'reveal'>('right');
	let sticky = $state(false);
	// What has been typed, replaced (never changed in place) on each change, so the work worked out from it depends on
	// this one value and not on a field of one problem's object (see put).
	let values = $state.raw<Values>({});
	let before = $state<Values>({});
	let current = $state<string | null>(null);
	let reached = $state<string[]>([]);
	let count = $state<number | null>(null);
	let typed = $state('');
	// (each a line of the table, so the speaker button can read it; null or [] when there is none)
	let nudgeMsg = $state<Msg | null>(null);
	const nudge = $derived(nudgeMsg ? tx(nudgeMsg) : '');
	/** Advice on a choice that works but isn't the method's way, said once for that value (Next keeps it). */
	let tipMsg = $state<Msg | null>(null);
	const tip = $derived(tipMsg ? tx(tipMsg) : '');
	let tipped = '';
	let toldLines = $state<Msg[]>([]);
	const told = $derived(tx(toldLines));
	let busy = $state(false);
	let watchShown = $state(false);
	let watchVals: Values = {};
	let W = $state(1024);
	let H = $state(768);
	let barH = $state(56);
	let bandH = $state(120);
	let still = $state(false);
	let padOpen = $state(false);
	let padRect = $state<Rect | undefined>();
	let padSaved = $state<Rect | null>(null);
	let planned = $state(0);

	let hintShown = $state(0);
	let hintOpen = $state(false);
	let fails = $state(0);
	let misses = $state(0);
	let slow = $state(false);
	let hintTimer: ReturnType<typeof setTimeout> | undefined;
	let reported = false;

	/** A field's input, found by its id when it is needed (no bind:this: Svelte reads a binding's field again as the
	 *  last problem's work is taken down, which tied the work to that problem's values; decisions.md). */
	let paperEl = $state<HTMLElement>();
	const inputOf = (id: string) => paperEl?.querySelector<HTMLInputElement>(`input[data-field="${id}"]`) ?? null;
	/** A field's value: a new object each time, so everything worked out from what's typed sees the change. */
	function put(id: string, v: string) {
		values = { ...values, [id]: v };
	}
	let checkBtn = $state<HTMLButtonElement>();
	let feedbackBtn = $state<HTMLButtonElement>();
	let feedbackEl = $state<HTMLElement>();
	let nextBtn = $state<HTMLButtonElement>();

	const PAD_KEY = 'box-by-box-keypad-v1';
	function setPad(open: boolean) {
		padOpen = open;
		if (!open) padRect = undefined;
		store(PAD_KEY, { open: padOpen, ...(padSaved ? { rect: padSaved } : {}) });
	}

	const problem = $derived<Problem | undefined>(problems[index]);
	const form = $derived(formOf(activity));
	const work = $derived<WorkT | undefined>(problem ? buildWork(method, activity.kind, problem, values, form) : undefined);
	const fields = $derived<Field[]>(work?.fields ?? []);
	const fieldOf = (id: string | null) => (id ? fields.find((f) => f.id === id) : undefined);
	// a field the page copies (the remainder: what's left on the last rung) follows its source as it is typed
	$effect(() => {
		if (!work || phase !== 'working') return;
		for (const f of fields)
			if (f.copyOf) {
				const want = work.closed ? norm(values[f.copyOf] ?? '') : '';
				if ((values[f.id] ?? '') !== want) {
					put(f.id, want);
					if (want) reach(f.id);
				}
			}
	});
	const narrow = $derived(W <= 760);
	const level = $derived(activity.settings.level);
	const info = $derived(level === 'custom' ? undefined : levelInfo(level));
	const levelLabel = $derived(level === 'custom' ? t('ui.level.custom') : (info?.label ?? t('ui.level.guided')));
	const way = $derived(level === 'custom' ? 'type' : (info?.way ?? 'type'));
	const flags = $derived(level === 'custom' ? activity.settings.custom : info!.flags);
	const scored = $derived(level === 'custom' || !!info?.scored);
	const isReveal = $derived(phase === 'feedback' && fb === 'reveal');
	const settled = $derived(phase === 'feedback' && fb !== 'again');

	/** The page writes it: everything in Watch, a division's products in Count up. */
	const isAuto = (f: Field | undefined) => !!f && (way === 'watch' || !!f.copyOf || (way === 'countUp' && !!f.countUp && 'auto' in f.countUp));
	/** A field the student can work now: not the page's, and (the quotient and what follows) not before the ladder ends. */
	const workable = (f: Field | undefined) =>
		!!f && !isAuto(f) && (f.role === 'choice' || f.expect !== null) && (!!work?.closed || ['choice', 'product', 'difference', 'cell', 'sum'].includes(f.role));
	const isCount = (f: Field | undefined) => !!f && way === 'countUp' && !!f.countUp && !('auto' in f.countUp);
	const firstEmpty = $derived(fields.find((f) => !values[f.id]));
	/** Count up: the field being worked (a count keeps it while its value changes). */
	let at = $state<string | null>(null);
	/** The field being worked: the one with the focus when typing, the one counted or typed in Count up, else (Watch)
	 *  the next empty one. */
	const active = $derived.by(() => {
		if (!work || phase !== 'working') return undefined;
		if (way === 'type') return fieldOf(current);
		if (way === 'countUp' || watchShown) return fieldOf(at);
		return firstEmpty;
	});
	const counting = $derived(phase === 'working' && isCount(active) && !busy);
	const choose = $derived(counting && active?.countUp && 'choose' in active.countUp ? active.countUp.choose : null);
	const skip = $derived(counting && active?.countUp && 'skip' in active.countUp ? active.countUp.skip : null);
	const hintField = $derived(phase !== 'working' || way === 'watch' ? undefined : (active ?? firstEmpty));
	const hints = $derived(hintField?.hints ?? []);
	/** (Its id, so a new set of fields worked out after each digit is still the same step.) */
	const hintId = $derived(hintField?.id ?? null);
	$effect(() => {
		void index;
		const id = hintId;
		hintShown = 0;
		hintOpen = false;
		misses = 0;
		slow = false;
		clearTimeout(hintTimer);
		if (id) hintTimer = setTimeout(() => (slow = true), 45000);
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

	const canCheck = $derived(phase === 'working' && way !== 'watch' && !busy && !!work && allFilled(work, values));
	/** After a Check that didn't pass, the fields that are wrong stay marked (as the standard player marks its boxes). */
	const stickyWrong = $derived(sticky && work ? new Set(checkWork(work, values).wrong) : new Set<string>());

	function shown(id: string) {
		if (!work || isReveal || phase === 'setup' || !flags.build) return true;
		if (reached.includes(id) || id === current) return true;
		return way !== 'type' && active?.id === id;
	}
	const litSet = $derived(flags.spotlight && active && phase === 'working' ? new Set(active.lit) : null);
	const lit = (key: string) => !litSet || litSet.has(key);

	const askOf = (f: Field) => f.ask ?? [];
	/** The question for now, as lines of the table: shown in the band, and read by the speaker button. */
	const promptLines = $derived.by((): Msg[] => {
		if (!work || phase !== 'working') return [];
		if (way === 'watch') {
			if (watchShown && told) return toldLines;
			return firstEmpty ? askOf(firstEmpty) : [m('q.so', { e: work.title, x: showAnswer(work.answer) })];
		}
		if (busy && told) return toldLines;
		if (nudgeMsg) return [nudgeMsg];
		if (tipMsg) return [tipMsg];
		if (way === 'countUp') {
			if (!active) return firstEmpty ? [] : [m('q.pressCheck')];
			if (choose) {
				const v = values[active!.id];
				if (!v) return [...askOf(active!), m('q.lad.pick')];
				const S = choose.f.show;
				const n = choose.f.read(v);
				const x = n * choose.divisor;
				return n * choose.divisor > choose.left
					? [m('q.lad.tooMany', { a: S(n), b: choose.divisor, x: S(x), l: S(choose.left) })]
					: [m('q.lad.left', { a: S(n), b: choose.divisor, x: S(x), l: S(choose.left - x) })];
			}
			if (skip) {
				if (typed) return [m('q.skip.mulTyped', { a: skip.by, b: skip.times, x: typed }), m('q.skip.pressIt')];
				if (!count) return [...askOf(active!), m(skip.zeros ? (skip.zeros === 1 ? 'q.lad.countByZero1' : 'q.lad.countByZeros') : 'q.lad.countBy', { a: skip.by, z: skip.zeros }, skip.times)];
				return [m('q.skip.mulCount', { list: Array.from({ length: count }, (_, i) => (i + 1) * skip.by).join(', ') }, count)];
			}
		}
		if (!flags.prompt && way === 'type') return [];
		const f = way === 'type' ? fieldOf(current) : active;
		if (!f) return allFilled(work, values) ? [m('q.pressCheck')] : [];
		const typing = f.role !== 'choice' && norm(values[f.id] ?? '').length < (f.expect?.length ?? 0);
		const n = f.nudgeSay?.(values[f.id] ?? '');
		if (flags.markNow && !typing && fieldWrong(f, values)) return [m('q.notQuite'), ...(n ? [n] : askOf(f))];
		// a number of groups that could still take another digit: Enter (or Next) says it's done
		return f.role === 'choice' && way === 'type' && values[f.id] && current === f.id ? [...askOf(f), m('q.lad.enterDone')] : askOf(f);
	});
	const prompt = $derived(tx(promptLines));
	const sayLines = $derived(sayAll(promptLines));

	// --- waiting (Space finishes at once) ---

	const waiters = new Set<() => void>();
	let hurry = false;
	function wait(ms: number) {
		if (hurry || still) return Promise.resolve();
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
	function finishAll() {
		for (const w of [...waiters]) w();
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
	function reach(id: string) {
		if (!reached.includes(id)) reached = [...reached, id];
	}
	function fill(f: Field, value: string) {
		put(f.id, value);
		reach(f.id);
		tick().then(() =>
			inputOf(f.id)
				?.closest('.num')
				?.animate(still ? [{ opacity: 0 }, { opacity: 1 }] : [{ opacity: 0, transform: 'scale(0.6)' }, { opacity: 1, transform: 'none' }], {
					duration: 350,
					easing: 'ease-out'
				})
		);
	}
	async function focusField(id: string | null) {
		current = id;
		if (id === null) return;
		reach(id);
		await tick();
		const el = inputOf(id);
		if (!el) return;
		el.focus({ preventScroll: true });
		el.closest('.num')?.scrollIntoView?.({ block: 'nearest', inline: 'nearest', behavior: still ? 'auto' : 'smooth' });
	}

	// --- a problem ---

	function reset() {
		finishAll();
		values = {};
		before = {};
		reached = [];
		firstTry = true;
		missed = false;
		sticky = false;
		nudgeMsg = null;
		tipMsg = null;
		tipped = '';
		toldLines = [];
		count = null;
		typed = '';
		watchShown = false;
		current = null;
		at = null;
		phase = 'working';
		if (!problem) return;
		watchVals = watchValues(method, activity.kind, problem, form);
		if (way === 'countUp') advance();
		else if (way === 'type') focusField(fields[0]?.id ?? null);
		else tick().then(() => nextBtn?.focus());
	}
	function start() {
		problems = makeProblems();
		index = 0;
		rightCount = 0;
		wrongCount = 0;
		fixes = 0;
		reported = false;
		reset();
	}

	/** On from a field: the next empty field after it (else the first empty one); none left, Check. */
	async function goNext(id: string) {
		await tick();
		const i = fields.findIndex((f) => f.id === id);
		const next = fields.slice(i + 1).find((f) => !values[f.id]) ?? fields.find((f) => !values[f.id] && f.id !== id);
		if (way === 'countUp') return advance();
		if (next) focusField(next.id);
		else {
			current = null;
			await tick();
			checkBtn?.focus();
		}
	}
	/** A field is done (its digits all typed, or Enter): Guided marks a mistake at once and stays on it. */
	function commit(f: Field): boolean {
		const v = values[f.id] ?? '';
		if (!v) return false;
		if (flags.markNow && fieldWrong(f, values)) {
			misses += 1;
			fixes += 1;
			wrongTry();
			if (f.role === 'choice') nudgeMsg = f.nudgeSay?.(v) ?? null;
			inputOf(f.id)?.select();
			return false;
		}
		nudgeMsg = null;
		const advice = flags.markNow ? f.adviceSay?.(v) : null;
		if (advice && tipped !== `${f.id}:${v}`) {
			tipped = `${f.id}:${v}`;
			tipMsg = advice;
			inputOf(f.id)?.select();
			return false;
		}
		tipMsg = null;
		goNext(f.id);
		return true;
	}
	function setValue(f: Field, raw: string) {
		// (a decimal field takes one point too: 0.12)
		const v = (f.point ? raw.replace(/,/g, '.').replace(/[^\d.]/g, '').replace(/(\..*)\./g, '$1') : raw.replace(/\D/g, '')).slice(0, f.len);
		put(f.id, v);
		const el = inputOf(f.id);
		if (el && el.value !== v) el.value = v;
		nudgeMsg = null;
		tipMsg = null;
		if (choose && f.id === active?.id) return;
		// on by itself once all its digits are in (a choice: once its squares are full, or no more digits could fit: 20
		// groups of 7 from 945 can't take a third digit, as 200 × 7 is more than 945)
		if (f.role === 'choice' ? v.length >= f.len || choiceFull(f, v) : f.expect !== null && norm(v).length >= f.expect.length) commit(f);
	}
	function choiceFull(f: Field, v: string): boolean {
		const c = f.countUp && 'choose' in f.countUp ? f.countUp.choose : null;
		if (!c || !v || v.includes('.')) return false;
		return c.f.read(`${v}0`) * c.divisor > c.left;
	}
	function onInput(f: Field, e: Event) {
		if (busy || phase !== 'working' || isAuto(f)) {
			(e.currentTarget as HTMLInputElement).value = values[f.id] ?? '';
			return;
		}
		setValue(f, (e.currentTarget as HTMLInputElement).value);
	}
	/** A key the field already acted on (the window's handler leaves it). */
	let handled: Event | null = null;
	function onKey(f: Field, e: KeyboardEvent) {
		handled = e;
		if (e.key === 'Enter') {
			e.preventDefault();
			if (counting) return thatsIt();
			if (canCheck) return check();
			commit(f);
		} else if (e.key === 'Tab' && way === 'type') {
			// in the order the work is done (a rung's groups, product, what's left; the quotient once the ladder ends),
			// never past a field the page writes or one that can't be worked yet
			const i = fields.findIndex((x) => x.id === f.id);
			const to = e.shiftKey ? fields.slice(0, i).reverse().find(workable) : fields.slice(i + 1).find(workable);
			if (!e.shiftKey && f.role === 'choice' && values[f.id] && flags.markNow) {
				e.preventDefault();
				commit(f);
			} else if (to) {
				e.preventDefault();
				if (!e.shiftKey && flags.markNow && fieldWrong(f, values)) return commit(f);
				focusField(to.id);
			} else if (!e.shiftKey && checkBtn && !checkBtn.disabled) {
				e.preventDefault();
				checkBtn.focus();
			}
		} else if (e.key === 'Backspace' && !values[f.id] && way === 'type') {
			e.preventDefault();
			const i = fields.findIndex((x) => x.id === f.id);
			if (i > 0) focusField(fields[i - 1].id);
		} else if (e.key === ' ') {
			e.preventDefault();
			finishAll();
		} else if (counting && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
			e.preventDefault();
			bump(e.key === 'ArrowUp' ? 1 : -1);
		} else if (counting && skip && /^\d$/.test(e.key)) {
			e.preventDefault();
			keypad(e.key);
		}
	}

	// --- Count up ---

	/** On to the next empty field: the page writes the ones it does, then a count or a field to type. */
	async function advance() {
		at = null;
		count = null;
		typed = '';
		nudgeMsg = null;
		let f = fields.find((x) => !values[x.id]);
		if (f && isAuto(f))
			await busyDo(async () => {
				while (f && isAuto(f)) {
					at = f.id;
					await wait(STEP_MS / 2);
					toldLines = f.tell ?? [];
					fill(f, f.copyOf ? norm(values[f.copyOf] ?? '') : (f.expect ?? watchVals[f.id] ?? ''));
					await wait(STEP_MS * 1.6);
					await tick();
					f = fields.find((x) => !values[x.id]);
				}
				toldLines = [];
			});
		f = fields.find((x) => !values[x.id]);
		at = f?.id ?? null;
		if (!f) {
			current = null;
			await tick();
			checkBtn?.focus();
		} else focusField(f.id);
	}
	function bump(by: number) {
		if (!counting || !active) return;
		typed = '';
		nudgeMsg = null;
		if (choose) {
			const list = friendlySteps(choose.left, choose.divisor);
			const v = values[active.id] ? choose.f.read(values[active.id]) || 0 : 0;
			const at = list.findIndex((x) => x >= v);
			const i = !values[active.id] ? (by > 0 ? 0 : -1) : list[at] === v ? at + by : by > 0 ? at : at - 1;
			if (i >= 0) put(active.id, choose.f.show(list[Math.min(i, list.length - 1)]));
			reach(active.id);
		} else if (skip) count = count === null ? +(by > 0) : Math.max(0, Math.min(9, count + by));
	}
	async function thatsIt() {
		if (way !== 'countUp' || busy || phase !== 'working') return;
		if (!active) return check();
		const f = active;
		if (!f || !counting) return;
		if (choose) {
			const v = values[f.id] ?? '';
			if (!v) {
				nudgeMsg = m('q.lad.pickFirst');
				return;
			}
			const n = f.nudgeSay?.(v);
			if (n) {
				nudgeMsg = n;
				fails += 1;
				fixes += 1;
				return;
			}
			nudgeMsg = null;
			return advance();
		}
		if (!skip) return;
		if (typed) {
			if (Number(typed) !== skip.by * skip.times) {
				nudgeMsg = m('q.skip.notItMul', { x: typed, a: skip.by, b: skip.times });
				fails += 1;
				fixes += 1;
				typed = '';
				return;
			}
			count = skip.times;
			typed = '';
		}
		if (count === null) {
			nudgeMsg = m('q.skip.first');
			return;
		}
		if (count !== skip.times) {
			nudgeMsg = m(count < skip.times ? 'q.skip.mulSoFar' : 'q.skip.mulTooFar', { b: skip.times }, count);
			fails += 1;
			fixes += 1;
			return;
		}
		const sk = skip;
		const product = sk.by * sk.times;
		await busyDo(async () => {
			toldLines = sk.zeros
				? [m('q.lad.zerosOn', { a: sk.by, b: sk.times, p: product }, sk.zeros), ...(f.tell ?? [])]
				: sk.places
					? [m('q.lad.placesOn', { a: sk.by, b: sk.times, p: product }, sk.places), ...(f.tell ?? [])]
					: (f.tell ?? []);
			fill(f, String(sk.value));
			await wait(STEP_MS * 2);
			toldLines = [];
		});
		return advance();
	}

	// --- Watch ---

	async function watchNext() {
		if (busy) return finishAll();
		if (!work || phase !== 'working') return;
		if (watchShown) {
			watchShown = false;
			toldLines = [];
			return;
		}
		const f = firstEmpty;
		if (!f) return nextProblem();
		toldLines = f.tell ?? [];
		at = f.id;
		fill(f, f.copyOf ? norm(values[f.copyOf] ?? '') || (watchVals[f.id] ?? '') : (watchVals[f.id] ?? f.expect ?? ''));
		watchShown = true;
		if (!firstEmpty) settledOne();
		await tick();
		inputOf(f.id)?.closest('.num')?.scrollIntoView?.({ block: 'nearest', behavior: still ? 'auto' : 'smooth' });
	}

	// --- the keypad ---

	function keypad(k: string) {
		if (!work || phase !== 'working' || busy || way === 'watch') return;
		if (counting && skip) {
			const most = String(skip.by * 9).length;
			typed = k === '' ? typed.slice(0, -1) : typed.length >= most ? k : typed + k;
			count = null;
			nudgeMsg = null;
			return;
		}
		const f = (way === 'type' ? fieldOf(current) : active) ?? fields.find((x) => !values[x.id] && !isAuto(x));
		if (!f || isAuto(f)) return;
		const v = values[f.id] ?? '';
		if (k === '') {
			if (v) setValue(f, v.slice(0, -1));
			else if (way === 'type') {
				const i = fields.findIndex((x) => x.id === f.id);
				if (i > 0) return void focusField(fields[i - 1].id);
			}
			focusField(f.id);
		} else {
			if (current !== f.id) focusField(f.id);
			setValue(f, (v.length >= f.len ? '' : v) + k);
		}
	}

	// --- Check, and on ---

	/** A wrong entry Guided marked: this problem's wrong try (counted once), the feedback as friendly as ever. */
	function wrongTry() {
		if (way !== 'type' || !scored || missed) return;
		missed = true;
		wrongCount++;
	}
	/** A problem settled (right, or its answer shown): the lesson step hears how far the student is, so leaving before
	 *  See the score still counts (the last one finishes the step). */
	function settledOne() {
		if (!preview) progress(index + 1, problems.length, rightCount, fixes);
	}
	async function check() {
		if (!work || !canCheck || !problem) return;
		const c = checkWork(work, values);
		if (c.right) {
			fb = 'right';
			if (scored && !missed) rightCount++;
		} else if (firstTry) {
			fb = 'again';
			fails += 1;
			firstTry = false;
			sticky = true;
		} else {
			fb = 'reveal';
			fails += 1;
			if (scored && !missed) wrongCount++;
			missed = true;
			before = { ...values };
			values = { ...watchVals };
		}
		phase = 'feedback';
		if (fb !== 'again') settledOne();
		current = null;
		await tick();
		if (fb === 'right') soundRight(feedbackEl);
		else soundWrong(feedbackEl);
		feedbackBtn?.focus();
	}
	/** Give up after a Check that didn't pass: the answer is shown, as after a second try (it counts as wrong). */
	async function giveUp() {
		if (!work || phase !== 'feedback' || fb !== 'again') return;
		fb = 'reveal';
		if (scored && !missed) wrongCount++;
		missed = true;
		before = { ...values };
		values = { ...watchVals };
		settledOne();
		await tick();
		soundWrong(feedbackEl);
		feedbackBtn?.focus();
	}
	/** Leaving in the middle of a set (Practice, Back) asks first, in the page's own dialog: the set isn't kept. */
	async function leave(go: () => void) {
		if (await mayLeave()) go();
	}
	/** Once the set is started, every time (audit 4: a problem not typed in yet, a count or Watch left without a word).
	 *  The play page asks the same before any of its own ways out (audit 5: its Back links, the browser's Back,
	 *  Homeroom's layer), through BRB.leaveGuard. */
	const begun = $derived((phase === 'feedback' || phase === 'working') && !preview);
	async function mayLeave(): Promise<boolean> {
		if (!begun || !leaveDialog) return true;
		const done = index + +settled;
		const yes = await leaveDialog.ask(t('ui.leave.title'), tn('ui.leave.text', problems.length, { done }), [
			{ value: 'stay', label: t('ui.leave.stay') },
			{ value: 'go', label: t('ui.leave.go'), danger: true }
		]);
		return yes === 'go';
	}
	$effect(() => {
		guardLeave(begun ? mayLeave : null);
	});
	$effect(() => () => guardLeave(null));
	async function onFeedback() {
		if (!work) return;
		if (fb === 'again') {
			phase = 'working';
			const bad = fields.find((f) => stickyWrong.has(f.id) && !isAuto(f)) ?? fields.find((f) => !isAuto(f));
			if (way === 'countUp' && bad) {
				// Count up: back to the first field that's wrong, and on from there
				const kept = { ...values };
				for (const f of fields.slice(fields.indexOf(bad))) delete kept[f.id];
				values = kept;
				return advance();
			}
			await focusField(bad?.id ?? null);
		} else nextProblem();
	}
	function nextProblem() {
		if (index + 1 < problems.length) {
			index++;
			reset();
		} else {
			phase = 'over';
			if (!reported) {
				reported = true;
				finished(rightCount, fixes);
			}
		}
	}

	function onWindowKey(e: KeyboardEvent) {
		if (e === handled) return;
		const t = e.target as HTMLElement;
		if (t.closest?.('button, a, form, [role="dialog"]')) return;
		if (phase === 'feedback' && e.key === 'Enter') {
			e.preventDefault();
			onFeedback();
		} else if (phase === 'working') {
			if (way === 'watch' && [' ', 'Enter', 'ArrowRight'].includes(e.key)) {
				e.preventDefault();
				watchNext();
			} else if (counting || (way === 'countUp' && !active)) {
				if (e.key === 'ArrowUp') bump(1);
				else if (e.key === 'ArrowDown') bump(-1);
				else if (e.key === 'Enter') thatsIt();
				else if (/^\d$/.test(e.key) && t.tagName !== 'INPUT') keypad(e.key);
				else return;
				e.preventDefault();
			}
		}
	}

	onMount(() => {
		planned = makeProblems().length;
		runs = 0;
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

	/** The squares' size: as big as fits (at most 50px), never so small a finger can't hit one (26px; wider work scrolls). */
	const sq = $derived(work ? Math.round(Math.max(26, Math.min(50, (Math.min(W, 1400) - 48) / (workWidth(work) + 1), H / 13))) : 40);
	const toGo = $derived(phase === 'over' ? 0 : problems.length - index - +settled);
	const ROLE = (r: string) => t(`ui.field.${r}`);
	/** A field's accessible name: a rung's fields by their step ("What's left, step 2"), a part by its product ("Box
	 *  for 40 × 20", "Line for 9 × 10"), the rest by what they are. */
	function fieldLabel(f: Field): string {
		if (f.what) return t(f.role === 'cell' ? 'ui.field.cellOf' : 'ui.field.lineOf', { e: f.what });
		const n = /^[qpr](\d+)$/.exec(f.id);
		if (n && (f.role === 'choice' || f.role === 'product' || f.role === 'difference')) return t('ui.field.step', { f: ROLE(f.role), n: Number(n[1]) + 1 });
		return ROLE(f.role);
	}
	/** The squares of a field: its digits, lined up on the right, and which of them are wrong. */
	function squares(f: Field) {
		const v = values[f.id] ?? '';
		const marks = wrongDigits(f, v);
		return Array.from({ length: f.len }, (_, i) => {
			const k = i - (f.len - v.length);
			return { d: k >= 0 ? v[k] : '', bad: k >= 0 && marks[k] };
		});
	}
</script>

<svelte:window bind:innerWidth={W} bind:innerHeight={H} onkeydown={onWindowKey} />

{#snippet numField(f: Field)}
	{@const auto = isAuto(f)}
	{@const canType = way !== 'watch' && !auto && phase === 'working' && !(isCount(f) && f.countUp && 'skip' in f.countUp)}
	{@const typing = current === f.id && f.role !== 'choice' && norm(values[f.id] ?? '').length < (f.expect?.length ?? 0)}
	{@const wrongNow =
		!isReveal && !!values[f.id] && ((phase === 'working' && flags.markNow && !typing && fieldWrong(f, values)) || (sticky && stickyWrong.has(f.id)))}
	{@const marks = squares(f)}
	<span
		class="num"
		class:current={(current === f.id || active?.id === f.id) && phase === 'working'}
		class:counting={counting && active?.id === f.id}
		class:wrong={wrongNow}
		class:shown={isReveal && before[f.id] !== values[f.id]}
		class:remainder={f.role === 'remainder'}
		class:choice={f.role === 'choice'}
		style:--n={f.len}
	>
		{#each marks as m, i (i)}<span class="sq" class:bad={wrongNow && m.bad && f.role !== 'choice'}>{m.d}</span>{/each}
		<input
			data-field={f.id}
			type="text"
			pattern={f.point ? '[0-9.,]*' : '[0-9]*'}
			autocomplete="off"
			spellcheck="false"
			maxlength={f.len}
			inputmode={canType ? (f.point ? 'decimal' : 'numeric') : 'none'}
			aria-label={fieldLabel(f)}
			aria-invalid={wrongNow}
			value={values[f.id] ?? ''}
			readonly={!canType}
			tabindex={canType && workable(f) ? undefined : -1}
			onfocus={(e) => {
				if (!canType) return;
				current = f.id;
				reach(f.id);
				const el = e.currentTarget;
				el.setSelectionRange(el.value.length, el.value.length);
			}}
			onclick={(e) => {
				const el = e.currentTarget;
				el.setSelectionRange(el.value.length, el.value.length);
			}}
			oninput={(e) => onInput(f, e)}
			onkeydown={(e) => onKey(f, e)}
		/>
	</span>
{/snippet}

<header class="bar" bind:offsetHeight={barH}>
	{#if extra}
		<button type="button" class="extra" onclick={() => leave(extra.onclick)}>{extra.label}</button>
	{/if}
	<h1>{title}</h1>
	{#if preview}<span class="chip preview">{t('ui.preview')}</span>{/if}
	<span class="chip method-chip" title={t('ui.method')}>{mInfo.label}</span>
	<span class="chip level-chip" title={t('ui.player.levelTitle')}>{levelLabel}</span>
	{#if work && phase !== 'setup'}
		<div class="count" aria-label={t('ui.player.score')}>
			{#if scored}
				<span class="chip good" title={t('ui.player.right')}><Check size={14} aria-hidden="true" /> {rightCount}</span>
				<span class="chip bad" title={t('ui.player.wrong')}><X size={14} aria-hidden="true" /> {wrongCount}</span>
			{/if}
			{#if phase !== 'over'}<span class="chip">{t('ui.player.toGo', { n: toGo })}</span>{/if}
		</div>
		{#if way !== 'watch' && phase !== 'over'}
			<button type="button" class="pad-toggle" aria-pressed={padOpen} onpointerdown={(e) => e.preventDefault()} onclick={() => setPad(!padOpen)}
				><Grid3x3 size={16} aria-hidden="true" /> {t('ui.keypad')}</button
			>
		{/if}
	{/if}
</header>

{#if phase === 'setup' || phase === 'over'}
	<main class="menu" style:padding-top="{barH + 24}px">
		{#if phase === 'setup'}
			<h2>{kind.title}: {mInfo.label}</h2>
			<ol class="steps">
				{#each introSteps as s (s)}<li>{s}</li>{/each}
			</ol>
			<p class="level-line">
				{#each segments('ui.player.planned', planned) as x, i (i)}{#if x.v === 'level'}<b>{levelLabel}</b>{:else if x.v === 'n'}{planned}{:else}{x.s}{/if}{/each}{#if level !== 'custom'}{t('ui.colon')}{kind.studentLevelText?.[level] && method !== 'area' && method !== 'partial'
						? kind.studentLevelText[level]
						: level === 'countUp'
							? t(activity.kind === 'divide' ? 'ui.method.countUpDivide' : 'ui.method.countUpMultiply')
							: info?.detail}{/if}
			</p>
			<div class="menu-actions">
				<button type="button" class="btn-primary big" onclick={start}><Play size={18} aria-hidden="true" /> {t('ui.start')}</button>
			</div>
		{:else}
			<h2>{t('ui.player.allDone')}</h2>
			{#if rightCount + wrongCount > 0}
				<p class="final">
					{#each segments('ui.player.final') as x, i (i)}{#if x.v === 'r'}<b class="good-text">{rightCount}</b>{:else if x.v === 'w'}<b class="bad-text">{wrongCount}</b>{:else}{x.s}{/if}{/each}
				</p>
				{#if fixes > 0}<p class="fixes">{tn('ui.player.fixes', fixes)}</p>{/if}
			{:else}
				<p class="final">{tn('ui.player.watched', problems.length)}</p>
			{/if}
			<div class="menu-actions">
				<button type="button" class="btn-primary big" onclick={start}><Play size={18} aria-hidden="true" /> {againLabel ?? t('ui.player.again')}</button>
			</div>
		{/if}
		<Footer />
	</main>
{:else if work}
	<main class="paper" bind:this={paperEl} style:--sq="{sq}px" class:with-pad={padOpen && !narrow && way !== 'watch'} style:padding-top="{barH + 20}px" style:padding-bottom="{bandH + 28}px">
		<p class="sr-only">{work.title}</p>
		<div class="sheet-wrap">
			{#key index}
				<Work {work} field={numField} {values} {shown} {lit} />
			{/key}
		</div>
	</main>
	{#if padOpen && !narrow && way !== 'watch'}
		<FloatingKeypad top={barH} point={fields.some((x) => x.point)} disabled={phase !== 'working'} ontap={keypad} onclose={() => setPad(false)} bind:rect={padRect} saved={padSaved} onmoved={(r) => {
			padSaved = r;
			store(PAD_KEY, { open: padOpen, rect: r });
		}} />
	{/if}
	<div class="band" bind:offsetHeight={bandH}>
		{#if phase === 'feedback'}
			<div class="feedback {fb}" aria-live="polite" bind:this={feedbackEl}>
				<p>
					{#if fb === 'right'}<b>{t('ui.fb.correct')}</b> <span dir="ltr">{work.title} = {showAnswer(work.answer)}</span>{:else if fb === 'again'}<b
							>{t('ui.fb.notQuite')}</b
						>
						{t('ui.fb.tryAgainLine')}{:else}<b>{t('ui.fb.answerIs', { x: showAnswer(work.answer) })}</b> {t('ui.fb.oneWay')}{/if}
				</p>
				<span class="fb-actions">
					{#if fb === 'again'}<button type="button" class="btn-ghost give-up" onclick={giveUp}>{t('ui.fb.giveUp')}</button>{/if}
					<button type="button" class="btn-primary" bind:this={feedbackBtn} onclick={onFeedback}>
						{#if fb === 'again'}{t('ui.fb.tryAgain')}{:else if index + 1 < problems.length}{t('ui.nextProblem')}{:else}{t('ui.fb.seeScore')}{/if}
					</button>
				</span>
			</div>
		{:else}
			{#if hintOpen && hintShown && hints.length}
				<div class="hint-box" aria-live="polite">
					<p class="hint-head">
						<Lightbulb size={15} aria-hidden="true" /> {t('ui.hint.of', { i: Math.min(hintShown, hints.length), n: hints.length })}
						<button type="button" class="hint-close" aria-label={t('ui.hint.hide')} onclick={() => (hintOpen = false)}>✕</button>
					</p>
					<ol>
						{#each hints.slice(0, hintShown) as h, i (i)}<li>{h}</li>{/each}
					</ol>
				</div>
			{/if}
			<div class="prompt-row">
				<div class="prompt-line">
					<Speaker lines={sayLines} />
					<p class="prompt" class:nudge={!!nudge} class:tip={!nudge && !!tip} aria-live="polite">{prompt}</p>
				</div>
				<div class="actions">
					{#if way === 'watch'}
						<button type="button" class="btn-primary big" bind:this={nextBtn} onclick={watchNext}
							><SkipForward size={18} aria-hidden="true" />
							{!firstEmpty && !watchShown ? (index + 1 < problems.length ? t('ui.nextProblem') : t('ui.done')) : t('ui.next')}</button
						>
					{:else if counting}
						<span class="updown" role="group" aria-label={t('ui.level.countUp')}>
							<button type="button" class="btn-ghost step" aria-label={t('ui.oneMore')} onpointerdown={(e) => e.preventDefault()} onclick={() => bump(1)}
								><ChevronUp size={20} aria-hidden="true" /></button
							>
							<button type="button" class="btn-ghost step" aria-label={t('ui.oneLess')} onpointerdown={(e) => e.preventDefault()} onclick={() => bump(-1)}
								><ChevronDown size={20} aria-hidden="true" /></button
							>
						</span>
						<button type="button" class="btn-primary big" disabled={busy} onpointerdown={(e) => e.preventDefault()} onclick={thatsIt}
							><Check size={18} aria-hidden="true" /> {t('ui.thatsIt')}</button
						>
					{:else}
						{@const cf = fieldOf(current)}
						{#if cf && cf.role === 'choice' && values[cf.id] && !canCheck}
							<button type="button" class="btn-ghost" onpointerdown={(e) => e.preventDefault()} onclick={() => commit(cf)}
								>{t('ui.next')} <ArrowRight size={17} aria-hidden="true" /></button
							>
						{/if}
						<button type="button" class="btn-primary big" bind:this={checkBtn} disabled={!canCheck} onclick={check}
							><Check size={18} aria-hidden="true" /> {t('ui.check')}</button
						>
					{/if}
					{#if way !== 'watch' && hints.length}
						<button
							type="button"
							class="btn-ghost hint-btn"
							class:stuck
							disabled={hintShown >= hints.length && hintOpen}
							aria-label={t(hintShown >= hints.length ? (hintOpen ? 'ui.hint.noMore' : 'ui.hint.again') : stuck ? 'ui.hint.stuckGet' : 'ui.hint.get')}
							onpointerdown={(e) => e.preventDefault()}
							onclick={showHint}><Lightbulb size={17} aria-hidden="true" /><span class="hint-word">{t(stuck ? 'ui.hint.stuck' : 'ui.hint.word')}</span></button
						>
					{/if}
					{#if way === 'type'}
						<button type="button" class="btn-ghost" onclick={reset}><Eraser size={17} aria-hidden="true" /> {t('ui.clear')}</button>
					{/if}
				</div>
			</div>
			{#if padOpen && narrow && way !== 'watch'}
				<Keypad wide point={fields.some((x) => x.point)} disabled={phase !== 'working'} ontap={keypad} />
			{/if}
		{/if}
	</div>
{/if}

<ConfirmDialog bind:this={leaveDialog} />

<style>
	.paper {
		min-height: 100dvh;
		padding-inline: 16px;
		background-color: var(--graph-ground);
		background-image:
			linear-gradient(to right, var(--graph-line) 1px, transparent 1px),
			linear-gradient(to bottom, var(--graph-line) 1px, transparent 1px);
		background-size: var(--sq) var(--sq);
		background-attachment: local;
	}
	.sheet-wrap {
		display: flex;
		justify-content: flex-start;
		max-width: 100%;
		overflow-x: auto;
		padding: 4px 2px;
	}
	.sheet-wrap > :global(*) {
		flex: none;
		margin-inline: auto;
	}
	.num {
		position: relative;
		display: grid;
		grid-template-columns: repeat(var(--n), var(--sq));
		height: var(--sq);
		border-radius: 4px;
		background: color-mix(in srgb, var(--box-wash) 60%, transparent);
		color: var(--ink);
		transition: background 0.15s;
	}
	.num .sq {
		display: grid;
		place-items: center;
		width: var(--sq);
		height: var(--sq);
		box-shadow: inset -1px 0 0 color-mix(in srgb, var(--box-line) 70%, transparent);
	}
	.num .sq:last-of-type {
		box-shadow: none;
	}
	.num input {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		padding: 0;
		border: 0;
		background: transparent;
		color: transparent;
		caret-color: transparent;
		font-size: 16px;
		opacity: 0;
		cursor: text;
	}
	.num input[readonly] {
		cursor: default;
	}
	.num.choice {
		background: color-mix(in srgb, var(--accent-wash) 80%, transparent);
		color: var(--accent-dark);
	}
	.num.current,
	.num:focus-within {
		background: var(--box-wash);
		box-shadow:
			inset 0 0 0 2px var(--box),
			inset 0 -4px 0 var(--box);
	}
	.num.counting {
		box-shadow:
			inset 0 0 0 3px var(--box),
			0 0 0 4px color-mix(in srgb, var(--box) 25%, transparent);
	}
	.num.remainder {
		background: color-mix(in srgb, var(--remainder-wash) 75%, transparent);
		color: var(--remainder);
	}
	.num.wrong {
		background: var(--bad-wash);
		color: var(--bad);
		box-shadow: inset 0 -4px 0 var(--bad);
	}
	.num .sq.bad {
		background: color-mix(in srgb, var(--bad) 18%, transparent);
	}
	.num.shown {
		background: var(--good-wash);
		color: var(--good);
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
	.extra,
	.pad-toggle {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
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
	.pad-toggle:hover {
		background: var(--box-wash);
	}
	.pad-toggle[aria-pressed='true'] {
		border-color: var(--box);
		background: var(--box-wash);
		color: var(--box-dark);
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
	.chip.method-chip {
		background: var(--box-wash);
		color: var(--box-dark);
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
		font-size: 1.3rem;
		font-weight: 700;
		line-height: 1.3;
	}
	.prompt.nudge {
		color: var(--bad);
	}
	.prompt.tip {
		color: var(--accent-dark);
	}
	.actions {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5rem;
	}
	.updown {
		display: inline-flex;
		gap: 0.35rem;
	}
	.step {
		width: 2.9rem;
		height: 2.9rem;
		padding: 0;
		touch-action: manipulation;
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
	.feedback .btn-primary {
		padding: 0.75rem 1.2rem;
		font-size: 1rem;
	}
	.fb-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		margin-inline-start: auto;
	}
	.give-up {
		color: var(--ink);
		font-size: 0.95rem;
	}
	.fixes {
		margin: -0.75rem 0 1.25rem;
		color: var(--muted);
		font-size: 1rem;
	}
	@media (max-width: 760px) {
		h1 {
			display: none;
		}
		.prompt {
			font-size: 1.1rem;
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
