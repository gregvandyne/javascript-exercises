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
	import { kindInfo, levelInfo, problemsForRun, showAnswer, type Playable, type Problem, type Values } from '$lib/logic';
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
	import { finished, load, right as soundRight, store, wrong as soundWrong } from '$lib/oomba';

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
	let runs = 0;
	const makeProblems = () => (fresh && runs++ > 0 ? fresh() : problemsForRun(activity));

	let phase = $state<'setup' | 'working' | 'feedback' | 'over'>('setup');
	let problems = $state.raw<Problem[]>([]);
	let index = $state(0);
	let rightCount = $state(0);
	let wrongCount = $state(0);
	let firstTry = $state(true);
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
	let nudge = $state('');
	/** Advice on a choice that works but isn't the method's way, said once for that value (Next keeps it). */
	let tip = $state('');
	let tipped = '';
	let told = $state('');
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
	const work = $derived<WorkT | undefined>(problem ? buildWork(method, activity.kind, problem, values) : undefined);
	const fields = $derived<Field[]>(work?.fields ?? []);
	const fieldOf = (id: string | null) => (id ? fields.find((f) => f.id === id) : undefined);
	const narrow = $derived(W <= 760);
	const level = $derived(activity.settings.level);
	const info = $derived(level === 'custom' ? undefined : levelInfo(level));
	const levelLabel = $derived(level === 'custom' ? 'Your teacher’s mix' : (info?.label ?? 'Guided'));
	const way = $derived(level === 'custom' ? 'type' : (info?.way ?? 'type'));
	const flags = $derived(level === 'custom' ? activity.settings.custom : info!.flags);
	const scored = $derived(level === 'custom' || !!info?.scored);
	const isReveal = $derived(phase === 'feedback' && fb === 'reveal');
	const settled = $derived(phase === 'feedback' && fb !== 'again');

	/** The page writes it: everything in Watch, a division's products in Count up. */
	const isAuto = (f: Field | undefined) => !!f && (way === 'watch' || (way === 'countUp' && !!f.countUp && 'auto' in f.countUp));
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

	const prompt = $derived.by(() => {
		if (!work || phase !== 'working') return '';
		if (way === 'watch') {
			if (watchShown && told) return told;
			return firstEmpty ? firstEmpty.prompt : `So ${work.title} = ${showAnswer(work.answer)}.`;
		}
		if (busy && told) return told;
		if (nudge) return nudge;
		if (tip) return tip;
		if (way === 'countUp') {
			if (!active) return firstEmpty ? '' : 'Press Check, or Enter.';
			if (choose) {
				const v = values[active!.id];
				if (!v) return `${active!.prompt} Pick with ▲ and ▼, or type it.`;
				const n = Number(v);
				return n * choose.divisor > choose.left
					? `${n} × ${choose.divisor} = ${n * choose.divisor}: too many, more than ${choose.left}.`
					: `${n} × ${choose.divisor} = ${n * choose.divisor}, and ${choose.left - n * choose.divisor} is left. Press That’s it, or go up.`;
			}
			if (skip) {
				const zeros = skip.zeros ? `, then put on ${skip.zeros === 1 ? 'a zero' : `${skip.zeros} zeros`}` : '';
				if (typed) return `${skip.by} × ${skip.times} = ${typed}? Press That’s it.`;
				if (!count) return `${active!.prompt} Count by ${skip.by}s, ${skip.times} ${skip.times === 1 ? 'time' : 'times'}, with ▲${zeros}.`;
				return `${Array.from({ length: count }, (_, i) => (i + 1) * skip.by).join(', ')}: that’s ${count} ${count === 1 ? 'time' : 'times'}.`;
			}
		}
		if (!flags.prompt && way === 'type') return '';
		const f = way === 'type' ? fieldOf(current) : active;
		if (!f) return allFilled(work, values) ? 'Press Check, or Enter.' : '';
		const typing = f.role !== 'choice' && norm(values[f.id] ?? '').length < (f.expect?.length ?? 0);
		return flags.markNow && !typing && fieldWrong(f, values) ? `Not quite. ${f.nudge?.(values[f.id] ?? '') ?? f.prompt}` : f.prompt;
	});

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
		sticky = false;
		nudge = '';
		tip = '';
		tipped = '';
		told = '';
		count = null;
		typed = '';
		watchShown = false;
		current = null;
		at = null;
		phase = 'working';
		if (!problem) return;
		watchVals = watchValues(method, activity.kind, problem);
		if (way === 'countUp') advance();
		else if (way === 'type') focusField(fields[0]?.id ?? null);
		else tick().then(() => nextBtn?.focus());
	}
	function start() {
		problems = makeProblems();
		index = 0;
		rightCount = 0;
		wrongCount = 0;
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
			if (f.role === 'choice') nudge = f.nudge?.(v) ?? '';
			inputOf(f.id)?.select();
			return false;
		}
		nudge = '';
		const advice = flags.markNow ? f.advice?.(v) : null;
		if (advice && tipped !== `${f.id}:${v}`) {
			tipped = `${f.id}:${v}`;
			tip = advice;
			inputOf(f.id)?.select();
			return false;
		}
		tip = '';
		goNext(f.id);
		return true;
	}
	function setValue(f: Field, raw: string) {
		const v = raw.replace(/\D/g, '').slice(0, f.len);
		put(f.id, v);
		const el = inputOf(f.id);
		if (el && el.value !== v) el.value = v;
		nudge = '';
		tip = '';
		if (choose && f.id === active?.id) return;
		// on by itself once all its digits are in (a choice: once its squares are full)
		if (f.role === 'choice' ? v.length >= f.len : f.expect !== null && norm(v).length >= f.expect.length) commit(f);
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
			const i = fields.findIndex((x) => x.id === f.id);
			const to = e.shiftKey ? fields[i - 1] : fields[i + 1];
			if (to && (shown(to.id) || !e.shiftKey)) {
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
		nudge = '';
		let f = fields.find((x) => !values[x.id]);
		if (f && isAuto(f))
			await busyDo(async () => {
				while (f && isAuto(f)) {
					at = f.id;
					await wait(STEP_MS / 2);
					told = f.told;
					fill(f, f.expect ?? watchVals[f.id] ?? '');
					await wait(STEP_MS * 1.6);
					await tick();
					f = fields.find((x) => !values[x.id]);
				}
				told = '';
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
		nudge = '';
		if (choose) {
			const list = friendlySteps(choose.left, choose.divisor);
			const v = Number(values[active.id] || 0);
			const at = list.findIndex((x) => x >= v);
			const i = !values[active.id] ? (by > 0 ? 0 : -1) : list[at] === v ? at + by : by > 0 ? at : at - 1;
			if (i >= 0) put(active.id, String(list[Math.min(i, list.length - 1)]));
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
				nudge = 'Pick a number with ▲ first.';
				return;
			}
			const n = f.nudge?.(v);
			if (n) {
				nudge = n;
				fails += 1;
				return;
			}
			nudge = '';
			return advance();
		}
		if (!skip) return;
		if (typed) {
			if (Number(typed) !== skip.by * skip.times) {
				nudge = `${typed} isn’t ${skip.by} × ${skip.times}. Count by ${skip.by}s with ▲ to find it.`;
				fails += 1;
				typed = '';
				return;
			}
			count = skip.times;
			typed = '';
		}
		if (count === null) {
			nudge = 'Count up with ▲ first.';
			return;
		}
		if (count !== skip.times) {
			nudge = count < skip.times ? `That’s ${count} times so far. Keep counting to ${skip.times}.` : `That’s ${count} times, more than ${skip.times}. Count back with ▼.`;
			fails += 1;
			return;
		}
		const sk = skip;
		const product = sk.by * sk.times;
		await busyDo(async () => {
			told = sk.zeros ? `${sk.by} × ${sk.times} = ${product}, and ${sk.zeros === 1 ? 'a zero' : `${sk.zeros} zeros`} on the end: ${f.told}` : f.told;
			fill(f, String(sk.value));
			await wait(STEP_MS * 2);
			told = '';
		});
		return advance();
	}

	// --- Watch ---

	async function watchNext() {
		if (busy) return finishAll();
		if (!work || phase !== 'working') return;
		if (watchShown) {
			watchShown = false;
			told = '';
			return;
		}
		const f = firstEmpty;
		if (!f) return nextProblem();
		told = f.told;
		at = f.id;
		fill(f, watchVals[f.id] ?? f.expect ?? '');
		watchShown = true;
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
			nudge = '';
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

	async function check() {
		if (!work || !canCheck || !problem) return;
		const c = checkWork(work, values);
		if (c.right) {
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
			values = { ...watchVals };
		}
		phase = 'feedback';
		current = null;
		await tick();
		if (fb === 'right') soundRight(feedbackEl);
		else soundWrong(feedbackEl);
		feedbackBtn?.focus();
	}
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
				finished(rightCount);
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
	const ROLE: Record<string, string> = {
		choice: 'How many groups',
		product: 'Product',
		difference: 'What’s left',
		cell: 'Box',
		sum: 'Total',
		quotient: 'Quotient',
		remainder: 'Remainder'
	};
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
			pattern="[0-9]*"
			autocomplete="off"
			spellcheck="false"
			maxlength={f.len}
			inputmode={canType ? 'numeric' : 'none'}
			aria-label="{ROLE[f.role]}{f.role === 'choice' || f.role === 'product' || f.role === 'difference' ? `, step ${Number(f.id.slice(1)) + 1}` : ''}"
			aria-invalid={wrongNow}
			value={values[f.id] ?? ''}
			readonly={!canType}
			tabindex={canType ? undefined : -1}
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
		<button type="button" class="extra" onclick={extra.onclick}>{extra.label}</button>
	{/if}
	<h1>{title}</h1>
	{#if preview}<span class="chip preview">Preview</span>{/if}
	<span class="chip method-chip" title="Method">{mInfo.label}</span>
	<span class="chip level-chip" title="Level of support">{levelLabel}</span>
	{#if work && phase !== 'setup'}
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
			<h2>{kind.title}: {mInfo.label}</h2>
			<ol class="steps">
				{#each mInfo.steps as s (s)}<li>{s}</li>{/each}
			</ol>
			<p class="level-line">
				{planned}
				{planned === 1 ? 'problem' : 'problems'}, at <b>{levelLabel}</b>{#if level !== 'custom'}: {kind.studentLevelText?.[level] && method !== 'area' && method !== 'partial'
						? kind.studentLevelText[level]
						: level === 'countUp'
							? activity.kind === 'divide'
								? 'Pick how many to take away with ▲ and ▼, and the page multiplies. You subtract and add.'
								: 'Skip-count each box with ▲, and the page writes it in. Then type the adding.'
							: info?.detail}{/if}
			</p>
			<div class="menu-actions">
				<button type="button" class="btn-primary big" onclick={start}><Play size={18} aria-hidden="true" /> Start</button>
			</div>
		{:else}
			<h2>All done!</h2>
			{#if rightCount + wrongCount > 0}
				<p class="final">You got <b class="good-text">{rightCount}</b> right and <b class="bad-text">{wrongCount}</b> wrong.</p>
			{:else}
				<p class="final">You watched {problems.length} {problems.length === 1 ? 'problem' : 'problems'} worked.</p>
			{/if}
			<div class="menu-actions">
				<button type="button" class="btn-primary big" onclick={start}><Play size={18} aria-hidden="true" /> {againLabel ?? 'Start again'}</button>
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
		<FloatingKeypad top={barH} disabled={phase !== 'working'} ontap={keypad} onclose={() => setPad(false)} bind:rect={padRect} saved={padSaved} onmoved={(r) => {
			padSaved = r;
			store(PAD_KEY, { open: padOpen, rect: r });
		}} />
	{/if}
	<div class="band" bind:offsetHeight={bandH}>
		{#if phase === 'feedback'}
			<div class="feedback {fb}" aria-live="polite" bind:this={feedbackEl}>
				<p>
					{#if fb === 'right'}<b>Correct!</b> {work.title} = {showAnswer(work.answer)}{:else if fb === 'again'}<b>Not quite.</b> Check your work
						and try again.{:else}<b>The answer is {showAnswer(work.answer)}.</b> Here’s one way to work it.{/if}
				</p>
				<button type="button" class="btn-primary" bind:this={feedbackBtn} onclick={onFeedback}>
					{#if fb === 'again'}Try again{:else if index + 1 < problems.length}Next problem{:else}See the score{/if}
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
				<p class="prompt" class:nudge={!!nudge} class:tip={!nudge && !!tip} aria-live="polite">{prompt}</p>
				<div class="actions">
					{#if way === 'watch'}
						<button type="button" class="btn-primary big" bind:this={nextBtn} onclick={watchNext}
							><SkipForward size={18} aria-hidden="true" />
							{!firstEmpty && !watchShown ? (index + 1 < problems.length ? 'Next problem' : 'Done') : 'Next'}</button
						>
					{:else if counting}
						<span class="updown" role="group" aria-label="Count up">
							<button type="button" class="btn-ghost step" aria-label="One more" onpointerdown={(e) => e.preventDefault()} onclick={() => bump(1)}
								><ChevronUp size={20} aria-hidden="true" /></button
							>
							<button type="button" class="btn-ghost step" aria-label="One less" onpointerdown={(e) => e.preventDefault()} onclick={() => bump(-1)}
								><ChevronDown size={20} aria-hidden="true" /></button
							>
						</span>
						<button type="button" class="btn-primary big" disabled={busy} onpointerdown={(e) => e.preventDefault()} onclick={thatsIt}
							><Check size={18} aria-hidden="true" /> That’s it</button
						>
					{:else}
						{@const cf = fieldOf(current)}
						{#if cf && cf.role === 'choice' && values[cf.id] && !canCheck}
							<button type="button" class="btn-ghost" onpointerdown={(e) => e.preventDefault()} onclick={() => commit(cf)}
								>Next <ArrowRight size={17} aria-hidden="true" /></button
							>
						{/if}
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
						<button type="button" class="btn-ghost" onclick={reset}><Eraser size={17} aria-hidden="true" /> Clear</button>
					{/if}
				</div>
			</div>
			{#if padOpen && narrow && way !== 'watch'}
				<Keypad wide disabled={phase !== 'working'} ontap={keypad} />
			{/if}
		{/if}
	</div>
{/if}

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
