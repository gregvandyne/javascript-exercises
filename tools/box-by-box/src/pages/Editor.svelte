<script lang="ts">
	import { segments, t, tn } from '$lib/i18n';
	// The editor: the settings that make the problems (ranges, remainders), the support students get (the mode), and
	// the problems themselves, which the teacher can change, reorder, paste or add to. Every change is saved at once.
	import { NAME_HERE as NAME } from '$lib/i18n';
	import { onMount, tick } from 'svelte';
	import { ArrowLeft, Dices, ExternalLink, GripVertical, Plus, Share2, X } from '@lucide/svelte';
	import { find, isShared, list, loadList, titleOf, touch } from '$lib/activities.svelte';
	import { DECIMAL_METHODS, MAX_PROBLEMS, checkProblem, formOf, kindInfo, levelInfo, numbersOf, remainderForm, showAnswer, type Level, type Plan, type RangeKey } from '$lib/logic';
	import { go, show } from '$lib/nav.svelte';
	import Stepper from '$lib/Stepper.svelte';
	import SwitchRow from '$lib/SwitchRow.svelte';
	import ReplaceDialog from '$lib/ReplaceDialog.svelte';
	import Bracket from '$lib/Bracket.svelte';
	import Demo from '$lib/Demo.svelte';
	import MethodPicture from '$lib/MethodPicture.svelte';
	import { methodInfo, methodsFor, type Method } from '$lib/methods';
	import SharePanel from '$lib/SharePanel.svelte';
	import SaveBar from '$lib/SaveBar.svelte';
	import Footer from '$lib/Footer.svelte';

	let { id }: { id: string } = $props();
	loadList();
	const activity = $derived(list.loaded ? find(id) : undefined);
	const k = $derived(kindInfo(activity?.kind ?? 'divide'));
	const s = $derived(k.settings);

	type Row = { first: string; second: string };
	let rows = $state<Row[]>([]);
	function syncRows() {
		rows = (activity?.problems ?? []).map(([a, b]) => ({ first: String(a), second: String(b) }));
	}
	onMount(syncRows);

	/** Whole numbers, or decimals too (the Numbers choice): what a problem may be typed with. */
	const numbers = $derived(numbersOf(activity?.plan?.numbers));
	const fault = (r: Row) =>
		!r.first && !r.second ? '' : !r.first || !r.second ? t('ui.ed.both') : (checkProblem(activity!.kind, Number(r.first), Number(r.second), numbers, method) ?? '');
	const valid = (r: Row) => !!r.first && !!r.second && !fault(r);
	function answerOf(r: Row): [string, string] {
		if (!valid(r)) return ['', ''];
		const [q, rem = ''] = showAnswer(k.sheet([Number(r.first), Number(r.second)], { ...activity!.plan, remainders: form } as Plan).answer).split(' R ');
		return [q, rem];
	}
	const layout = $derived(activity?.kind === 'divide' ? 'bracket' : 'stacked');
	const fieldMax = (f: 0 | 1) => (activity?.plan ? String(planRange(s.ranges[f].key)[1]).length : k.widths[f]);
	const tileWidth = $derived.by(() => {
		if (layout !== 'bracket') return 10.5;
		let w = 0;
		for (const r of rows) {
			const rem = answerOf(r)[1];
			const digits = Math.max(r.first.length, fieldMax(0)) + Math.max(r.second.length, fieldMax(1));
			w = Math.max(w, digits * 0.95 + 1.6 + (rem ? rem.length * 0.6 + 1.2 : 0));
		}
		return Math.max(10.5, w + 1.4);
	});

	const save = () => touch(id);
	function edited() {
		if (activity) activity.edited = true;
	}
	/** After a tile changes: the activity keeps its valid problems, in order (none valid: nothing is saved). */
	function commitRows() {
		if (!activity) return;
		edited();
		const ok = rows.filter(valid).map((r) => [Number(r.first), Number(r.second)] as [number, number]);
		if (ok.length) {
			activity.problems = ok;
			if (numbers !== 'decimal') widen(ok);
			save();
		}
	}
	/** The most digits a field takes: the activity's own limit (Multiplication's top number up to 9999), never the
	 *  range's (a range of 10 to 99 cut 610 to 61: audit 4). */
	const limitDigits = (f: 0 | 1) => String(s.ranges[f].limits[1]).length;
	/** A word under the problems: a range made wider for a typed problem, or a field at its limit. */
	let fieldNote = $state<string | null>(null);
	/** A typed problem outside the settings' range (whole numbers): the range grows to take in numbers of its size (610
	 *  in a top range of 10 to 99: 10 to 999; a 9 below 10: from 2, the smallest there is), and says so (New problems
	 *  and fresh problems for each student use it too). Within the activity's limits, which the problem's own check
	 *  keeps to. */
	function widen(ps: [number, number][]) {
		if (!activity) return;
		const said: string[] = [];
		s.ranges.forEach((r, f) => {
			const [lo, hi] = planRange(r.key);
			const vs = ps.map((p) => p[f]);
			const small = Math.min(...vs);
			const big = Math.max(...vs);
			const a = small < lo ? Math.max(r.limits[0], Math.min(small, 10 ** (String(small).length - 1))) : lo;
			const b = big > hi ? Math.min(r.limits[1], Math.max(big, 10 ** String(big).length - 1)) : hi;
			if (a === lo && b === hi) return;
			(activity!.plan as Record<string, unknown>)[r.key] = [a, b];
			said.push(t('ui.ed.widened', { x: r.name, a, b }));
		});
		if (said.length) fieldNote = said.join(' ');
	}

	// --- moving between the tiles' fields ---

	const refs: (HTMLInputElement | null)[][] = [];
	let tilesEl = $state<HTMLElement>();
	const columns = () => (tilesEl ? Math.max(1, getComputedStyle(tilesEl).gridTemplateColumns.split(' ').length) : 1);
	type Spot = { index: number; field: 0 | 1 };
	function move(at: Spot, dir: string, cols: number, n: number, mode: string): Spot | null {
		const { index, field } = at;
		const ok = (i: number, f: 0 | 1): Spot | null => (i >= 0 && i < n ? { index: i, field: f } : null);
		if (mode === 'bracket')
			switch (dir) {
				case 'down':
					return ok(index + cols, field);
				case 'up':
					return ok(index - cols, field);
				case 'right':
					return field === 1 ? ok(index, 0) : ok(index + 1, 1);
				case 'left':
					return field === 0 ? ok(index, 1) : ok(index - 1, 0);
			}
		switch (dir) {
			case 'down':
				return field === 0 ? ok(index, 1) : ok(index + cols, 0);
			case 'up':
				return field === 1 ? ok(index, 0) : ok(index - cols, 1);
			case 'right':
				return ok(index + 1, field);
			case 'left':
				return ok(index - 1, field);
			case 'next':
				return field === 0 ? ok(index, 1) : ok(index + 1, 0);
			case 'previous':
				return field === 1 ? ok(index, 0) : ok(index - 1, 1);
		}
		return null;
	}
	async function focusSpot(at: Spot | null) {
		if (!at) return;
		await tick();
		const el = refs[at.index]?.[at.field];
		el?.focus();
		el?.select();
	}
	function addRow(): Spot | null {
		if (rows.length >= MAX_PROBLEMS) return null;
		rows.push({ first: '', second: '' });
		return { index: rows.length - 1, field: 0 };
	}
	function go2(at: Spot, dir: string) {
		focusSpot(move(at, dir, columns(), rows.length, layout) ?? (dir === 'next' ? addRow() : null));
	}
	const key = (f: 0 | 1) => (f === 0 ? 'first' : 'second') as 'first' | 'second';
	const atLimit = (f: 0 | 1) => t('ui.ed.atLimit', { x: s.ranges[f].name, n: limitDigits(f), max: s.ranges[f].limits[1] });
	function typed(i: number, f: 0 | 1, e: Event) {
		const el = e.currentTarget as HTMLInputElement;
		// decimals: digits and one point (a comma is taken as the point), and no jumping on: a point may come next
		const raw = numbers === 'decimal' ? el.value.replace(/,/g, '.').replace(/[^\d.]/g, '').replace(/(\..*)\./g, '$1') : el.value.replace(/\D/g, '');
		const v = raw.slice(0, limitDigits(f) + (numbers === 'decimal' ? 3 : 0));
		fieldNote = v.length < raw.length ? atLimit(f) : null;
		el.value = v;
		rows[i][key(f)] = v;
		commitRows();
		// on to the next field once no more digits fit (the activity's limit; Enter, a space or × go on sooner)
		if (numbers !== 'decimal' && v.length >= limitDigits(f)) {
			const n = move({ index: i, field: f }, 'next', columns(), rows.length, layout);
			if (n) focusSpot(n);
		}
	}
	const jumpChar = (c: string) => /^[\sx×*÷/),;:=+-]$/i.test(c);
	function fieldKey(i: number, f: 0 | 1, e: KeyboardEvent) {
		const el = e.currentTarget as HTMLInputElement;
		const at = { index: i, field: f };
		const a = el.selectionStart ?? 0;
		const b = el.selectionEnd ?? 0;
		const n = el.value.length;
		const all = a === 0 && b === n;
		if (e.metaKey || e.ctrlKey || e.altKey) return;
		if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
			e.preventDefault();
			go2(at, e.key === 'ArrowUp' ? 'up' : 'down');
		} else if (e.key === 'ArrowLeft' && (all || (a === 0 && b === 0))) {
			e.preventDefault();
			go2(at, 'left');
		} else if (e.key === 'ArrowRight' && (all || (a === n && b === n))) {
			e.preventDefault();
			go2(at, 'right');
		} else if (e.key === 'Enter') {
			e.preventDefault();
			go2(at, e.shiftKey ? 'previous' : 'next');
		} else if (e.key === 'Backspace' && n === 0) {
			e.preventDefault();
			go2(at, 'previous');
		} else if (numbers !== 'decimal' && /^\d$/.test(e.key) && a === b && n >= limitDigits(f)) {
			// full: say so, rather than leave the digit out without a word
			e.preventDefault();
			fieldNote = atLimit(f);
		} else if (e.key.length === 1 && !/\d/.test(e.key) && !(numbers === 'decimal' && (e.key === '.' || e.key === ','))) {
			e.preventDefault();
			if (jumpChar(e.key)) go2(at, 'next');
		}
	}
	function parsePaste(text: string): [number, number][] {
		const out: [number, number][] = [];
		for (const line of text.split(/[\n\r;,]+/)) {
			const m = line.match(numbers === 'decimal' ? /\d+(?:[.,]\d+)?|[.,]\d+/g : /\d+/g)?.map((x) => x.replace(',', '.'));
			if (m && m.length >= 2) out.push([Number(m.at(-2)), Number(m.at(-1))]);
		}
		return out;
	}
	function pasted(i: number, e: ClipboardEvent) {
		const ps = parsePaste(e.clipboardData?.getData('text') ?? '');
		if (!ps.length) return;
		e.preventDefault();
		ps.slice(0, MAX_PROBLEMS - i).forEach(([a, b], j) => {
			const r = { first: String(a), second: String(b) };
			if (i + j < rows.length) rows[i + j] = r;
			else rows.push(r);
		});
		commitRows();
		focusSpot({ index: Math.min(i + ps.length, MAX_PROBLEMS) - 1, field: 1 });
	}
	function addProblem() {
		edited();
		focusSpot(addRow());
	}
	let dragFrom = $state<number | null>(null);
	let dragOver = $state<number | null>(null);
	function reorder(from: number, to: number) {
		dragFrom = null;
		dragOver = null;
		if (from === to) return;
		const [r] = rows.splice(from, 1);
		rows.splice(to, 0, r);
		commitRows();
	}
	function removeRow(i: number) {
		if (rows.length <= 1) return;
		rows.splice(i, 1);
		refs.splice(i, 1);
		commitRows();
	}
	async function tileKey(i: number, e: KeyboardEvent) {
		const by = ({ ArrowLeft: -1, ArrowUp: -columns(), ArrowRight: 1, ArrowDown: columns() } as Record<string, number>)[e.key];
		if (!by) return;
		e.preventDefault();
		const to = Math.max(0, Math.min(rows.length - 1, i + by));
		reorder(i, to);
		await tick();
		(tilesEl?.querySelectorAll('.tile .n')[to] as HTMLElement | undefined)?.focus();
	}

	// --- the settings ---

	const planRange = (key: RangeKey) => (activity?.plan ?? s.fresh())[key as keyof Plan] as unknown as [number, number];
	let howMany = $state(0);
	$effect(() => {
		if (activity && howMany === 0) howMany = activity.plan?.count ?? (activity.problems.length || k.setSize);
	});
	let short = $state<number | null>(null);
	let note = $state<string | null>(null);
	let dialog = $state<ReplaceDialog>();
	function confirmThen(f: () => void) {
		if (!activity?.edited) return f();
		dialog?.ask().then((yes) => yes && f());
	}
	/** How remainders are written. Only None (every problem divides evenly) changes which problems fit: going to or
	 *  from it makes new ones; the others write the same problems' remainders another way. */
	const form = $derived(activity ? formOf(activity) : 'R');
	function setChoice(key: 'remainders' | 'numbers', v: string) {
		if (!activity) return;
		const was = (activity.plan as Record<string, unknown>)[key];
		const set = () => {
			if (key === 'numbers' && v === 'whole') delete activity.plan.numbers;
			else (activity.plan as Record<string, unknown>)[key] = v;
			// decimals: the standard method or the area model (any other method falls back to the standard one)
			if (key === 'numbers' && v === 'decimal' && !DECIMAL_METHODS[activity.kind].includes(activity.settings.method)) {
				methodNote = activity.settings.method !== 'standard';
				activity.settings.method = 'standard';
			}
			plays++;
		};
		if (key === 'numbers') {
			if (numbersOf(was) !== v) confirmThen(() => {
				set();
				regenerate();
			});
		} else if ((remainderForm(was) === 'none') === (v === 'none')) {
			set();
			save();
		} else
			confirmThen(() => {
				set();
				regenerate();
			});
	}
	const digitsWide = $derived(Math.max(...s.ranges.map((r) => String(r.limits[1]).length)));
	function setRange(key: RangeKey, lo: number, hi: number) {
		confirmThen(() => {
			if (!activity) return;
			(activity.plan as Record<string, unknown>)[key] = [lo, hi];
			const f = s.fix(activity.plan);
			Object.assign(activity.plan, f.plan);
			note = f.note;
			regenerate();
		});
	}
	function setCount(v: number) {
		if (!activity) return;
		const n = Math.max(1, Math.min(100, Number.isFinite(v) && v > 0 ? v : howMany));
		if (n === howMany) return;
		howMany = n;
		activity.plan.count = n;
		const kept = activity.problems.slice(0, n);
		const more = n > kept.length ? s.generate({ ...$state.snapshot(activity.plan), count: n - kept.length, method } as Plan, Math.random, kept) : [];
		const all = [...kept, ...more];
		short = all.length < n ? all.length : null;
		activity.problems = all;
		syncRows();
		save();
	}
	function regenerate() {
		if (!activity) return;
		const n = Math.max(1, Math.min(100, howMany));
		activity.plan.count = n;
		const made = s.generate({ ...$state.snapshot(activity.plan), method } as Plan);
		short = made.length < n ? made.length : null;
		if (made.length) {
			activity.problems = made;
			activity.edited = false;
			syncRows();
			save();
		}
	}

	// --- mode ---

	const TABS: { name: Level; title: string; text: string }[] = [
		{ name: 'watch', title: t('ui.level.watch'), text: t('ui.ed.tab.watch') },
		{ name: 'countUp', title: t('ui.level.countUp'), text: t('ui.ed.tab.countUp') },
		{ name: 'guided', title: t('ui.level.guided'), text: t('ui.ed.tab.guided') },
		{ name: 'onMyOwn', title: t('ui.level.onMyOwn'), text: t('ui.ed.tab.onMyOwn') }
	];
	const tabs = $derived(
		// (the tab is "tb", never "t": t is the words, and a tab named t made every method but the standard one throw here,
		// so the editor of a ladder or area model activity never opened: audit 4)
		TABS.filter((tb) => k.levels.includes(tb.name)).map((tb) => ({
			...tb,
			text:
				tb.name === 'countUp' && method !== 'standard'
					? activity?.kind === 'divide'
						? (COUNT_UP[method] ?? tb.text)
						: COUNT_UP_TIMES
					: method !== 'standard' && tb.name === 'guided'
						? t('ui.ed.tab.guidedMethod')
						: (k.levelText?.[tb.name] ?? tb.text)
		}))
	);
	const level = $derived(activity?.settings.level ?? 'guided');
	const onTab = $derived(tabs.some((tb) => tb.name === level));
	const demoMode = $derived(onTab ? level : 'guided');
	const tab = $derived(tabs.find((tb) => tb.name === demoMode));
	let plays = $state(0);
	function setLevel(l: Level) {
		if (!activity) return;
		activity.settings.level = l;
		plays++;
		save();
	}
	// --- method ---

	const method = $derived<Method>(activity?.settings.method ?? 'standard');
	const methods = $derived(methodsFor(activity?.kind ?? 'divide'));
	/** A method the decimals choice set back to the standard one (a short note says so). */
	let methodNote = $state(false);
	function setMethod(m: Method) {
		if (!activity) return;
		const a = activity;
		const apply = () => {
			a.settings.method = m;
			methodNote = false;
			plays++;
		};
		// decimals divided by the area model: whole divisors, coming out by hundredths, so problems that don't fit are made again
		const misfit = numbers === 'decimal' && a.kind === 'divide' && a.problems.some(([x, y]) => checkProblem('divide', x, y, numbers, m));
		if (misfit)
			confirmThen(() => {
				apply();
				regenerate();
			});
		else {
			apply();
			save();
		}
	}
	/** What Count up does in this method, for the Mode tab's line. */
	const COUNT_UP: Partial<Record<Method, string>> = {
		ladder: t('ui.ed.countUp.ladder'),
		area: t('ui.ed.countUp.area')
	};
	const COUNT_UP_TIMES = t('ui.ed.countUp.times');

	function setPerStudent(v: boolean) {
		if (!activity) return;
		activity.settings.perStudent = v;
		save();
	}

	// --- sharing and trying it ---

	let shareOpen = $state(false);
	const saved = $derived(activity ? isShared(activity) : false);
	function tryIt() {
		if (!activity) return;
		const a = $state.snapshot(activity);
		go({ name: 'play', activity: { kind: a.kind, problems: a.problems, settings: a.settings, plan: a.plan }, title: titleOf(a), from: 'editor', id: a.id });
	}
	function onWindowKey(e: KeyboardEvent) {
		if (e.key === 'Escape' && shareOpen) shareOpen = false;
	}
	function onWindowClick(e: MouseEvent) {
		if (!e.composedPath().some((el) => el instanceof HTMLElement && el.classList.contains('share-wrap'))) shareOpen = false;
	}
	$effect(() => {
		document.title = `${activity ? titleOf(activity) : t('ui.ed.activity')} · ${NAME}`;
	});
</script>

<svelte:window onkeydown={onWindowKey} onclick={onWindowClick} />

{#snippet operand(i: number, f: 0 | 1, r: Row, bad: boolean)}
	<input
		bind:this={() => refs[i]?.[f] ?? null, (el) => ((refs[i] ??= [null, null])[f] = el)}
		class="operand"
		type="text"
		inputmode={numbers === 'decimal' ? 'decimal' : 'numeric'}
		autocomplete="off"
		spellcheck="false"
		maxlength={k.widths[f] + (numbers === 'decimal' ? 3 : 0)}
		aria-label={t('ui.ed.problemField', { n: i + 1, x: k.labels[f] })}
		aria-invalid={bad}
		value={r[key(f)]}
		style:width="{Math.max(fieldMax(f), r[key(f)].length) + 0.6}ch"
		onfocus={(e) => e.currentTarget.select()}
		oninput={(e) => typed(i, f, e)}
		onkeydown={(e) => fieldKey(i, f, e)}
		onpaste={(e) => pasted(i, e)}
	/>
{/snippet}

{#if !activity}
	<div class="missing">
		<button type="button" class="back" onclick={() => show({ name: 'home' })}><ArrowLeft size={16} aria-hidden="true" /> {t('ui.home.title')}</button>
		<h1>{t('ui.ed.missing')}</h1>
		<p>{t('ui.ed.missingText')}</p>
	</div>
{:else}
	<div class="screen">
		<header class="top">
			<!-- (a labeled link back to the list, so it isn't taken for the page's own Back just above it, which leaves the game) -->
			<button type="button" class="back-list" onclick={() => show({ name: 'home' })}
				><ArrowLeft size={16} aria-hidden="true" /> {t('ui.home.title')}</button
			>
			<input class="title" type="text" aria-label={t('ui.ed.title')} placeholder={k.title} bind:value={activity.title} oninput={save} />
			<div class="top-actions">
				<button type="button" class="btn-ghost" onclick={tryIt}><ExternalLink size={16} aria-hidden="true" /> {t('ui.ed.try')}</button>
				<div class="share-wrap">
					<button type="button" class="btn-primary" aria-expanded={shareOpen} aria-haspopup="dialog" onclick={() => (shareOpen = !shareOpen)}
						><Share2 size={16} aria-hidden="true" /> {saved ? t('ui.ed.shared') : t('ui.ed.share')}</button
					>
					{#if shareOpen}
						<div class="share-pop" role="dialog" aria-label={t('ui.share.title')}>
							<SharePanel {activity} />
						</div>
					{/if}
				</div>
			</div>
		</header>

		<div class="layout">
			<aside class="settings" aria-labelledby="settings-title">
				<h2 id="settings-title">{t('ui.ed.settings')}</h2>
				<div class="group">
					{#each s.ranges as r (r.key)}
						{@const [lo, hi] = planRange(r.key)}
						<div class="range-row" role="group" aria-label={r.name}>
							<span class="range-name">{r.name}</span>
							<span class="range-boxes">
								<Stepper label={t('ui.ed.from', { x: r.name })} value={lo} min={r.limits[0]} max={r.limits[1]} digits={digitsWide} onchange={(v) => setRange(r.key, v, hi)} />
								<span class="to">{t('ui.ed.to')}</span>
								<Stepper label={t('ui.ed.toLabel', { x: r.name })} value={hi} min={r.limits[0]} max={r.limits[1]} digits={digitsWide} onchange={(v) => setRange(r.key, lo, v)} />
							</span>
						</div>
					{/each}
					{#if note}<p class="range-note" role="status">{note}</p>{/if}
					{#each s.choices.filter((c) => c.key !== 'remainders' || numbers !== 'decimal') as ch (ch.key)}
						{@const options = ch.key === 'remainders' ? ch.options.filter((o) => o.value !== 'decimal' || method === 'standard') : ch.options}
						{@const now = ch.key === 'numbers' ? numbers : form}
						<div class="choice-row">
							<h3 id="choice-{ch.key}">{ch.name}</h3>
							<div class="tabs" role="radiogroup" aria-labelledby="choice-{ch.key}">
								{#each options as o (o.value)}
									<button type="button" role="radio" class="tab" aria-checked={now === o.value} onclick={() => setChoice(ch.key, o.value)}>{o.label}</button>
								{/each}
							</div>
							<p class="about">{ch.options.find((o) => o.value === now)?.about ?? ''}</p>
						</div>
					{/each}
				</div>
				{#if methods.length > 1}
				<section class="group methods" aria-labelledby="method-title">
					<h3 id="method-title">{t('ui.method')}</h3>
					<div class="method-list" role="radiogroup" aria-labelledby="method-title">
						{#each methods.filter((m) => numbers !== 'decimal' || DECIMAL_METHODS[activity.kind].includes(m.name)) as m (m.name)}
							<button type="button" role="radio" class="method" aria-checked={method === m.name} onclick={() => setMethod(m.name)}>
								<span class="method-name">{m.name === 'standard' ? t(activity.kind === 'divide' ? 'ui.ed.standardDivide' : 'ui.ed.standardOther') : m.name === 'ladder' ? t('ui.ed.ladder') : m.label}</span>
								<span class="method-about">{m.about}</span>
							</button>
						{/each}
					</div>
					{#if numbers === 'decimal' && methods.length > 1}
						<p class="about">{methodNote ? `${t('ui.ed.decBack')} ` : ''}{t(activity.kind === 'divide' ? 'ui.ed.decDivide' : 'ui.ed.decMultiply')}</p>
					{/if}
					{#if method !== 'standard'}
						<details class="how">
							<summary>{t('ui.ed.how')}</summary>
							<ol>
								{#each methodInfo(activity.kind, method).steps as st (st)}<li>{st}</li>{/each}
							</ol>
							<p>
								{t(activity.kind === 'divide' ? 'ui.ed.howDivide' : 'ui.ed.howMultiply')}
							</p>
						</details>
					{/if}
				</section>
				{/if}
				<div class="group students">
					<SwitchRow label={t('ui.ed.perStudent')} checked={activity.settings.perStudent} onchange={setPerStudent}
						>{tn('ui.ed.perStudentText', activity.problems.length)}</SwitchRow
					>
					<section class="mode" aria-labelledby="mode-title">
						<h3 id="mode-title">{t('ui.ed.mode')}</h3>
						<div class="tabs" role="radiogroup" aria-labelledby="mode-title">
							{#each tabs as tb (tb.name)}
								<button type="button" role="radio" class="tab" aria-checked={level === tb.name} onclick={() => setLevel(tb.name)}>{tb.title}</button>
							{/each}
						</div>
						{#if onTab}
							<p class="about">{tab?.text}</p>
						{:else}
							<p class="about">
								{#each segments('ui.ed.kept') as x, i (i)}{#if x.v}<strong>{level === 'custom' ? t('ui.ed.ownMix') : levelInfo(level)?.label}</strong>{:else}{x.s}{/if}{/each}
							</p>
						{/if}
						<div class="preview">
							{#if method === 'standard'}
								<Demo kind={activity.kind} mode={demoMode} play={plays} label={t('ui.ed.looks', { x: tab?.title ?? '' })} />
							{:else}
								<MethodPicture kind={activity.kind} {method} />
							{/if}
						</div>
					</section>
				</div>
			</aside>

			<section class="problems" aria-labelledby="problems-title">
				<div class="problems-head">
					<h2 id="problems-title">{t('ui.ed.problems')}</h2>
					<div class="make">
						<div class="count">
							<span aria-hidden="true">{t('ui.ed.howMany')}</span>
							<Stepper label={t('ui.ed.howMany')} value={howMany} min={1} max={100} onchange={setCount} />
						</div>
						<button type="button" class="btn-ghost" onclick={() => confirmThen(regenerate)}><Dices size={16} aria-hidden="true" /> {t('ui.ed.newProblems')}</button>
					</div>
				</div>
				{#if short !== null}
					<p class="short" role="status">{tn('ui.ed.short', short)}</p>
				{/if}
				<ol class="tiles" bind:this={tilesEl} style:--tile="{tileWidth}rem">
					{#each rows as r, i (i)}
						{@const bad = fault(r)}
						<li
							class="tile"
							class:dragging={dragFrom === i}
							class:drop-before={dragOver === i && dragFrom !== null && dragFrom > i}
							class:drop-after={dragOver === i && dragFrom !== null && dragFrom < i}
							class:faulty={!!bad}
							title={bad || undefined}
							ondragover={(e) => {
								if (dragFrom !== null) {
									e.preventDefault();
									dragOver = i;
								}
							}}
							ondrop={(e) => {
								e.preventDefault();
								if (dragFrom !== null) reorder(dragFrom, i);
							}}
						>
							<button
								type="button"
								class="n"
								draggable="true"
								aria-label={t('ui.ed.move', { n: i + 1 })}
								ondragstart={(e) => {
									dragFrom = i;
									e.dataTransfer?.setData('text/plain', String(i + 1));
									if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
									const li = (e.currentTarget as HTMLElement).closest('li');
									if (li) e.dataTransfer?.setDragImage(li, 16, 16);
								}}
								ondragend={() => {
									dragFrom = null;
									dragOver = null;
								}}
								onkeydown={(e) => tileKey(i, e)}><span class="num">{i + 1}</span><GripVertical class="grip" size={14} aria-hidden="true" /></button
							>
							<div class="stack">
								{#if layout === 'bracket'}
									{@const [q, rem] = answerOf(r)}
									<div class="bracketed" style:--r={rem.length}>
										<span class="above"
											>{q}{#if rem}<span class="rem"><span class="r-label">R</span>{rem}</span>{/if}</span
										>
										<span class="dvr">{@render operand(i, 1, r, !!bad)}</span>
										<span class="dvd"><Bracket>{@render operand(i, 0, r, !!bad)}</Bracket></span>
									</div>
								{:else}
									{@render operand(i, 0, r, !!bad)}
									<span class="sign" aria-hidden="true">{k.sign}</span>
									{@render operand(i, 1, r, !!bad)}
									<i aria-hidden="true"></i>
								{/if}
								{#if bad}
									<span class="result">{t('ui.ed.notYet')}</span>
								{:else if layout === 'stacked'}
									<span class="result">{answerOf(r)[0]}</span>
								{/if}
							</div>
							<button type="button" class="remove" tabindex="-1" aria-label={t('ui.ed.remove', { n: i + 1 })} disabled={rows.length <= 1} onclick={() => removeRow(i)}
								><X size={12} aria-hidden="true" /></button
							>
						</li>
					{/each}
					{#if rows.length < MAX_PROBLEMS}
						<li class="add-tile"><button type="button" onclick={addProblem}><Plus size={20} aria-hidden="true" /> {t('ui.ed.add')}</button></li>
					{/if}
				</ol>
				{#if fieldNote}<p class="field-note" role="status">{fieldNote}</p>{/if}
				{#each rows as r, i (i)}
					{@const bad = fault(r)}
					{#if bad}<p class="fault" role="alert">{t('ui.ed.fault', { n: i + 1, x: bad })}</p>{/if}
				{/each}
				<SaveBar {activity} />
				<Footer />
			</section>
		</div>
	</div>
	<ReplaceDialog bind:this={dialog} />
{/if}

<style>
	.missing {
		max-width: 40rem;
		margin: 3rem auto;
		padding: 0 1.25rem;
	}
	.missing h1 {
		margin: 0.8rem 0 0.4rem;
		font-size: 1.6rem;
		font-weight: 800;
	}
	.back {
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
		padding: 0;
		border: 0;
		background: none;
		color: var(--link);
		font: inherit;
		font-weight: 700;
		cursor: pointer;
	}
	.screen {
		display: flex;
		flex-direction: column;
		height: 100dvh;
	}
	@media (max-width: 54rem) {
		.screen {
			height: auto;
			min-height: 100dvh;
		}
	}
	.top {
		position: sticky;
		top: 0;
		z-index: 10;
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5rem 0.75rem;
		padding: 0.6rem max(1rem, 50vw - 36rem);
		border-bottom: 2px solid var(--line);
		background: var(--paper);
	}
	.back-list {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		min-height: 2.4rem;
		padding: 0.3rem 0.8rem;
		border: 2px solid var(--line);
		border-radius: 999px;
		background: var(--paper);
		color: var(--ink);
		font: inherit;
		font-size: 0.92rem;
		font-weight: 700;
		white-space: nowrap;
		cursor: pointer;
	}
	.back-list:hover {
		background: var(--paper-low);
	}
	@media (max-width: 30rem) {
		/* a phone: the title on a line of its own under the buttons, and the header scrolls away with the page (three
		   rows held at the top would take a third of the screen) */
		.top {
			position: static;
		}
		.title {
			flex-basis: 100%;
			order: 2;
		}
		.top-actions {
			order: 1;
		}
	}
	.title {
		flex: 12rem;
		min-width: 0;
		padding: 0.35rem 0.5rem;
		border: 2px solid transparent;
		border-radius: 10px;
		background: none;
		color: var(--ink);
		font: inherit;
		font-size: 1.3rem;
		font-weight: 800;
	}
	.title::placeholder {
		color: #8d887a;
	}
	.title:hover {
		border-color: var(--line);
	}
	.title:focus {
		border-color: var(--accent);
		background: var(--paper);
		outline: none;
	}
	.top-actions {
		display: flex;
		gap: 0.5rem;
		margin-left: auto;
	}
	.share-wrap {
		position: relative;
	}
	.share-pop {
		position: absolute;
		top: calc(100% + 0.6rem);
		right: 0;
		z-index: 30;
		width: 22rem;
		max-height: calc(100dvh - 5rem);
		overflow-y: auto;
		padding: 1rem;
		border: 2px solid var(--line);
		border-radius: 18px;
		background: var(--paper);
		box-shadow: 0 14px 40px rgb(20 20 20 / 0.18);
	}
	@media (max-width: 30rem) {
		.share-pop {
			position: fixed;
			top: 6.5rem;
			left: 0.75rem;
			right: 0.75rem;
			width: auto;
		}
	}
	.layout {
		display: grid;
		flex: 1;
		grid-template-columns: 24rem minmax(0, 1fr);
		grid-template-rows: minmax(0, 1fr);
		align-items: start;
		gap: 2rem;
		width: 100%;
		max-width: 76rem;
		min-height: 0;
		margin: 0 auto;
		padding: 0 1rem;
	}
	.problems {
		display: flex;
		flex-direction: column;
		align-self: stretch;
		min-height: 0;
		margin: 0 -0.5rem;
		padding: 1.5rem 0.5rem;
		overflow-y: auto;
		overscroll-behavior: contain;
	}
	.settings {
		max-height: calc(100% - 3rem);
		margin: 1.5rem 0;
		padding: 1.1rem 1.15rem 0.4rem;
		overflow-y: auto;
		overscroll-behavior: contain;
		border: 2px solid var(--line);
		border-radius: var(--radius-lg);
		background: var(--paper);
	}
	@media (max-width: 54rem) {
		.layout {
			grid-template-columns: minmax(0, 1fr);
			grid-template-rows: auto;
		}
		.settings,
		.problems {
			max-height: none;
			overflow: visible;
		}
	}
	h2 {
		margin: 0;
		font-size: 1.2rem;
		font-weight: 800;
	}
	.range-note {
		margin: 0;
		color: var(--remainder);
		font-size: 0.8rem;
		font-weight: 700;
	}
	.group {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: 1.1rem;
		padding: 1rem 0 1.2rem;
	}
	/* a small phone (320 wide): the ranges' steppers and the choices wrap inside the card instead of poking out */
	@media (max-width: 26rem) {
		.range-boxes {
			flex-wrap: wrap;
			row-gap: 0.35rem;
		}
		.tabs {
			flex-wrap: wrap;
			border-radius: 18px;
		}
		.tab {
			flex: 1 1 auto;
		}
	}
	.students,
	.methods {
		padding-top: 1.2rem;
		border-top: 2px solid var(--line);
	}
	.methods {
		gap: 0.5rem;
	}
	.methods h3 {
		margin: 0;
	}
	.method-list {
		display: grid;
		gap: 0.4rem;
	}
	.method {
		display: grid;
		gap: 0.15rem;
		padding: 0.55rem 0.75rem;
		border: 2px solid var(--line);
		border-radius: 12px;
		background: var(--paper);
		color: var(--ink);
		font: inherit;
		text-align: left;
		cursor: pointer;
	}
	.method:hover {
		border-color: var(--line-strong);
	}
	.method[aria-checked='true'] {
		border-color: var(--accent);
		background: var(--accent-wash);
	}
	.method-name {
		font-size: 0.9rem;
		font-weight: 800;
	}
	.method-about {
		color: var(--ink-soft);
		font-size: 0.8rem;
		line-height: 1.35;
	}
	.how {
		color: var(--ink-soft);
		font-size: 0.85rem;
		line-height: 1.4;
	}
	.how summary {
		color: var(--link);
		font-weight: 700;
		cursor: pointer;
	}
	.how ol {
		margin: 0.4rem 0;
		padding-left: 1.2rem;
		list-style: decimal;
	}
	.how p {
		margin: 0;
	}
	.range-row {
		display: grid;
		gap: 0.4rem;
	}
	.range-boxes {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}
	.range-name {
		font-size: 0.95rem;
		font-weight: 800;
	}
	.to {
		color: var(--muted);
		font-size: 0.88rem;
		font-weight: 600;
	}
	h3 {
		margin: 0 0 0.4rem;
		font-size: 0.95rem;
		font-weight: 800;
	}
	.tabs {
		display: flex;
		gap: 2px;
		padding: 3px;
		border-radius: 999px;
		background: var(--paper-low);
	}
	.tab {
		flex: 1;
		min-height: 34px;
		padding: 0 0.3rem;
		border: 0;
		border-radius: 999px;
		background: none;
		color: var(--ink-soft);
		font: inherit;
		font-size: 0.84rem;
		font-weight: 600;
		white-space: nowrap;
		cursor: pointer;
	}
	.tab:hover {
		color: var(--ink);
	}
	.tab[aria-checked='true'] {
		background: var(--oomba-green);
		color: var(--ink);
		font-weight: 800;
		box-shadow: 0 2px 0 var(--oomba-green-press);
	}
	.about {
		margin: 0.55rem 0 0;
		color: var(--ink-soft);
		font-size: 0.85rem;
		line-height: 1.4;
	}
	.preview {
		margin-top: 0.6rem;
		overflow: hidden;
		border: 2px solid var(--line);
		border-radius: 14px;
		background: var(--paper-low);
	}
	.problems-head {
		position: sticky;
		top: -1.5rem;
		z-index: 5;
		display: flex;
		flex-wrap: wrap;
		justify-content: space-between;
		align-items: center;
		gap: 0.75rem 1rem;
		margin: -1.5rem -0.5rem 0.4rem;
		padding: 1.5rem 0.5rem 0.75rem;
		background: var(--ground);
	}
	.problems-head h2 {
		font-size: 1.35rem;
	}
	.make {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 1rem;
	}
	.count {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		color: var(--ink-soft);
		font-size: 0.88rem;
		font-weight: 700;
	}
	.short {
		margin: 0 0 0.4rem;
		color: var(--bad);
		font-size: 0.88rem;
		font-weight: 700;
	}
	.tiles {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(var(--tile, 10.5rem), 1fr));
		gap: 0.45rem;
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.tile {
		position: relative;
		display: flex;
		justify-content: flex-end;
		align-items: flex-start;
		padding: 1.15rem 0.6rem 0.35rem;
		border: 2px solid var(--line);
		border-radius: 14px;
		background: var(--paper);
		transition: border-color 0.12s;
	}
	.tile:hover,
	.tile:focus-within {
		border-color: var(--accent-line);
	}
	.tile:focus-within {
		box-shadow: 0 0 0 2px var(--accent-wash);
	}
	.tile.faulty {
		border-color: var(--bad);
		box-shadow: 0 0 0 2px var(--bad-wash);
	}
	.n {
		position: absolute;
		top: 0.2rem;
		left: 0.3rem;
		display: grid;
		place-items: center;
		min-width: 1.4rem;
		height: 1.4rem;
		padding: 0 0.2rem;
		border: 0;
		border-radius: 6px;
		background: none;
		color: var(--muted);
		font: inherit;
		font-size: 0.8rem;
		font-weight: 800;
		cursor: grab;
	}
	.n > :global(*) {
		grid-area: 1 / 1;
	}
	.n :global(.grip),
	.tile:hover .n .num,
	.n:focus-visible .num {
		opacity: 0;
	}
	.tile:hover .n :global(.grip),
	.n:focus-visible :global(.grip) {
		opacity: 1;
	}
	.n:hover,
	.n:focus-visible {
		background: var(--paper-low);
		color: var(--ink-soft);
		outline: none;
	}
	.tile.dragging {
		opacity: 0.4;
	}
	.tile.drop-before::before,
	.tile.drop-after::before {
		content: '';
		position: absolute;
		top: 0;
		bottom: 0;
		width: 3px;
		background: var(--accent);
		pointer-events: none;
	}
	.tile.drop-before::before {
		left: calc(-0.225rem - 3px);
	}
	.tile.drop-after::before {
		right: calc(-0.225rem - 3px);
	}
	.stack {
		display: grid;
		grid-template-columns: auto auto;
		justify-content: end;
		align-items: center;
		gap: 1px 4px;
	}
	.operand {
		grid-column: 2;
		justify-self: end;
		box-sizing: content-box;
		padding: 0 0.2rem;
		border: 1px solid transparent;
		border-radius: 7px;
		background: none;
		color: var(--ink);
		font: inherit;
		font-size: 1.25rem;
		font-weight: 800;
		line-height: 1.25;
		text-align: right;
		font-variant-numeric: tabular-nums;
	}
	.operand:hover {
		background: var(--paper-low);
	}
	.operand:focus {
		border-color: var(--accent);
		background: var(--paper);
		box-shadow: 0 0 0 2px var(--accent-wash);
		outline: none;
	}
	.sign {
		grid-column: 1;
		color: var(--accent);
		font-size: 1.3rem;
		font-weight: 800;
	}
	.stack i {
		grid-column: 1 / -1;
		height: 2px;
		margin-top: 3px;
		border-radius: 2px;
		background: var(--ink-soft);
	}
	.bracketed {
		display: grid;
		grid-template-columns: auto auto;
		justify-content: end;
		align-items: center;
		margin-right: calc(var(--r) * 0.45em + min(var(--r), 1) * 0.9em);
		font-size: 1.25rem;
	}
	.bracketed .operand {
		grid-column: auto;
	}
	.above {
		position: relative;
		grid-column: 2;
		justify-self: end;
		min-height: 1.3em;
		padding-right: calc(0.2rem + 1px);
		color: var(--muted);
		font-weight: 800;
		line-height: 1.3;
		font-variant-numeric: tabular-nums;
	}
	.above .rem {
		position: absolute;
		top: 50%;
		left: 100%;
		margin-left: 0.15rem;
		font-size: 0.72em;
		white-space: nowrap;
		transform: translateY(-50%);
	}
	.stack:has(.bracketed) {
		margin: 0 auto;
	}
	.dvr {
		grid-area: 2 / 1;
	}
	.dvd {
		grid-area: 2 / 2;
	}
	.result {
		display: flex;
		grid-column: 1 / -1;
		justify-content: flex-end;
		align-items: baseline;
		gap: 0.35rem;
		min-height: 1.4em;
		margin-top: 0.15rem;
		color: var(--ink-soft);
		font-size: 0.92rem;
		font-weight: 700;
		font-variant-numeric: tabular-nums;
	}
	.rem {
		padding: 0 0.35rem;
		border-radius: 6px;
		background: var(--remainder-wash);
		color: var(--remainder);
		font-weight: 800;
	}
	.r-label {
		margin-right: 0.15rem;
		font-size: 0.78em;
	}
	.faulty .result {
		color: var(--bad);
	}
	.field-note {
		margin: 0.6rem 0 0;
		color: var(--ink-soft);
		font-size: 0.9rem;
		font-weight: 600;
		line-height: 1.4;
	}
	.fault {
		margin: 0.6rem 0 0;
		color: var(--bad);
		font-size: 0.9rem;
		font-weight: 700;
	}
	.remove {
		position: absolute;
		top: 0.15rem;
		right: 0.15rem;
		display: grid;
		place-items: center;
		width: 1.5rem;
		height: 1.5rem;
		border: 0;
		border-radius: 6px;
		background: none;
		color: var(--muted);
		opacity: 0;
		cursor: pointer;
	}
	.tile:hover .remove,
	.tile:focus-within .remove {
		opacity: 1;
	}
	.remove:hover:not(:disabled) {
		background: var(--bad-wash);
		color: var(--bad);
	}
	.remove:disabled {
		visibility: hidden;
	}
	.add-tile button {
		display: flex;
		flex-direction: column;
		justify-content: center;
		align-items: center;
		gap: 0.3rem;
		width: 100%;
		height: 100%;
		min-height: 6rem;
		border: 2px dashed var(--line-strong);
		border-radius: 14px;
		background: none;
		color: var(--muted);
		font: inherit;
		font-size: 0.88rem;
		font-weight: 800;
		cursor: pointer;
		transition:
			border-color 0.12s,
			color 0.12s,
			background 0.12s;
	}
	.add-tile button:hover,
	.add-tile button:focus-visible {
		border-color: var(--accent);
		background: var(--accent-wash);
		color: var(--accent-dark);
		outline: none;
	}
</style>
