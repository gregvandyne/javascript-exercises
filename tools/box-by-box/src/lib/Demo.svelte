<script lang="ts">
	// What a mode looks like: 92 ÷ 4 (or 24 × 13) worked on a small sheet of graph paper, a frame every 850 ms, with
	// the question and the button a student would see. It shows the last frame until Play (or a new mode) starts it.
	import { onDestroy } from 'svelte';
	import { Play } from '@lucide/svelte';
	import Sheet from './Sheet.svelte';
	import { cellStep, correctValues, kindInfo, showAnswer, type Cell, type Kind, type Level, type Values } from './logic';
	import { reducedMotion } from './oomba';

	let { kind, mode, play = 0, label }: { kind: Kind; mode: Level; play?: number; label: string } = $props();

	const sheet = $derived(kindInfo(kind).sheet(kindInfo(kind).sample));
	type Frame = { values: Values; step: number; lit?: string[]; caption: string; button?: string; pressed?: boolean; good?: boolean };
	const PREFIX: Record<string, string> = { divide: 'Divide', multiply: 'Multiply', subtract: 'Subtract', sumCarry: 'Carry', add: 'Add' };
	const prefixed = (k: string, t: string) => (PREFIX[k] && !t.toLowerCase().startsWith(PREFIX[k].toLowerCase()) ? `${PREFIX[k]}: ${t[0].toLowerCase()}${t.slice(1)}` : t);

	const frames = $derived.by(() => {
		const all = correctValues(sheet);
		const out: Frame[] = [];
		let v: Values = {};
		const fillStep = (i: number) => {
			v = { ...v };
			for (const id of sheet.steps[i].boxes) v[id] = all[id];
		};
		const last = sheet.steps.length - 1;
		if (mode === 'onMyOwn') {
			out.push({ values: {}, step: last, caption: '', button: 'Check' });
			sheet.steps.forEach((_, i) => {
				fillStep(i);
				out.push({ values: v, step: last, caption: '', button: 'Check' });
			});
			out.push({ values: v, step: last, caption: '', button: 'Check', pressed: true });
			out.push({ values: v, step: last, caption: `${sheet.title} = ${showAnswer(sheet.answer)}`, button: 'Correct!', good: true });
			return out;
		}
		sheet.steps.forEach((st, i) => {
			const ask = st.kind === 'zero' && mode !== 'guided' ? st.told!(v) : st.prompt(v);
			if (mode === 'watch') {
				out.push({ values: v, step: i, lit: st.lit, caption: prefixed(st.kind, ask), button: 'Next', pressed: true });
				fillStep(i);
				out.push({ values: v, step: i, lit: st.lit, caption: `${prefixed(st.kind, ask)} ${st.boxes.map((b) => all[b]).join('')}`, button: 'Next' });
			} else if (mode === 'countUp' && (st.kind === 'divide' || st.skipCount)) {
				const by = st.skipCount ? st.skipCount.by : sheet.steps[i].countUp!.divisor;
				const times = st.skipCount ? st.skipCount.times : Number(all[st.boxes[0]]);
				const from = st.skipCount?.start ?? 0;
				const words = st.skipCount?.words;
				out.push({
					values: v,
					step: i,
					lit: st.lit,
					caption: words === 'add' ? `${from} + ${times}: count on with ▲.` : words === 'sub' ? `Count up from ${from} with ▲.` : st.skipCount ? `${by} × ${times}: count by ${by}s with ▲.` : 'Press ▲ to count up.',
					button: 'That’s it'
				});
				for (let c = 1; c <= times; c++)
					out.push({
						values: st.skipCount ? v : { ...v, [st.boxes[0]]: String(c) },
						step: i,
						lit: st.lit,
						caption: words ? Array.from({ length: c }, (_, k) => from + k + 1).join(', ') : st.skipCount ? Array.from({ length: c }, (_, k) => (k + 1) * by).join(', ') : `▲ ${c} × ${by} = ${c * by}`,
						button: 'That’s it',
						pressed: c === times
					});
				fillStep(i);
				out.push({ values: v, step: i, lit: st.lit, caption: st.skipCount ? (st.told?.(v) ?? '') : `${times} it is.` });
			} else {
				const auto = mode === 'countUp' && (st.kind === 'zero' || st.kind === 'bringDown' || st.kind === 'carry' || st.kind === 'point' || (st.kind === 'multiply' && !st.skipCount));
				if (!auto) out.push({ values: v, step: i, lit: st.lit, caption: ask });
				fillStep(i);
				out.push({ values: v, step: i, lit: st.lit, caption: auto && st.kind === 'bringDown' ? `The ${all[st.boxes[0]]} comes down.` : (st.told?.(v) ?? ask) });
			}
		});
		if (mode === 'watch') out.push({ values: v, step: last, caption: `So ${sheet.title} = ${showAnswer(sheet.answer)}.`, button: 'Done' });
		return out;
	});

	let at = $state(Infinity);
	let playing = $state(false);
	let timer: ReturnType<typeof setTimeout>;
	let seen = 0;
	const frame = $derived(frames[Math.min(at, frames.length - 1)]);

	function run() {
		clearTimeout(timer);
		if (reducedMotion()) {
			at = Infinity;
			playing = false;
			return;
		}
		at = 0;
		playing = true;
		const next = () => {
			timer = setTimeout(() => {
				if (at >= frames.length - 1) playing = false;
				else {
					at++;
					next();
				}
			}, 850);
		};
		next();
	}
	$effect(() => {
		void mode, kind;
		if (play > seen) {
			seen = play;
			run();
		} else {
			clearTimeout(timer);
			playing = false;
			at = Infinity;
		}
	});
	onDestroy(() => clearTimeout(timer));

	const shown = (c: Cell) => mode === 'onMyOwn' || cellStep(sheet, c) <= frame.step;
	const lit = (key: string) => mode === 'onMyOwn' || !frame.lit || frame.lit.includes(key) || !playing;
</script>

{#snippet box(id: string, small: boolean)}
	<span
		class="b"
		class:small
		class:crossed={!!sheet.crossedBy?.[id] && !!frame.values[sheet.crossedBy[id]]}
		class:on={playing && frame.lit?.includes(id)}
		class:empty={!frame.values[id]}>{frame.values[id] ?? ''}</span
	>
{/snippet}

<figure class="demo" aria-label={label}>
	<div class="paper">
		<Sheet {sheet} {box} {shown} {lit} crossed={(c) => c.kind === 'given' && !!c.crossBy && !!frame.values[c.crossBy]} label={sheet.title} />
		{#if !playing}
			<button type="button" class="replay" onclick={run}><Play size={14} aria-hidden="true" /> Play</button>
		{/if}
	</div>
	<figcaption>
		<span class="caption">{playing ? frame.caption : ''}</span>
		{#if playing && frame.button}
			<span class="button" class:pressed={frame.pressed} class:good={frame.good}>{frame.button}</span>
		{/if}
	</figcaption>
</figure>

<style>
	.demo {
		position: relative;
		display: grid;
		gap: 0.5rem;
		margin: 0;
		padding: 0.75rem;
	}
	.paper {
		position: relative;
		display: flex;
		justify-content: center;
		padding: 0.6rem;
		border-radius: 10px;
		background: var(--paper);
		overflow: hidden;
	}
	.paper :global(.sheet) {
		--cell: 1.55rem;
	}
	.b {
		display: grid;
		place-items: center;
		width: 100%;
		height: 100%;
		color: var(--box-dark);
		font-size: calc(var(--cell) * 0.62);
		font-weight: 800;
		line-height: 1;
	}
	.b.empty {
		outline: 1px dashed var(--line-strong);
		outline-offset: -1px;
	}
	.b.on {
		background: var(--box-wash);
		outline: 1.5px solid var(--box);
		outline-offset: -1px;
	}
	.b.crossed {
		color: var(--muted);
		background-image: linear-gradient(to top right, transparent calc(50% - 1px), var(--ink-soft) calc(50% - 1px) calc(50% + 1px), transparent calc(50% + 1px));
	}
	:global(.demo .slot.corner .b) {
		font-size: calc(var(--cell) * 0.3);
	}
	:global(.demo .slot.half-top .b),
	:global(.demo .slot.half-bottom .b) {
		font-size: calc(var(--cell) * 0.4);
	}
	.b.small {
		place-self: end center;
		width: 62%;
		height: 62%;
		font-size: calc(var(--cell) * 0.4);
	}
	.replay {
		position: absolute;
		top: 0.5rem;
		right: 0.5rem;
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		padding: 0.3rem 0.65rem;
		border: 2px solid var(--accent-line);
		border-radius: 999px;
		background: var(--paper);
		color: var(--accent-dark);
		font: inherit;
		font-size: 0.8rem;
		font-weight: 800;
		cursor: pointer;
	}
	.replay:hover {
		background: var(--accent-wash);
	}
	figcaption {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 0.5rem;
		min-height: 2rem;
	}
	.caption {
		color: var(--ink-soft);
		font-size: 0.82rem;
		font-weight: 600;
		line-height: 1.3;
	}
	.button {
		flex: none;
		padding: 0.3rem 0.7rem;
		border-radius: 999px;
		background: var(--oomba-green);
		color: var(--ink);
		font-size: 0.8rem;
		font-weight: 800;
		transition: transform 0.12s;
	}
	.button.pressed {
		background: var(--oomba-green-press);
		transform: scale(0.92);
	}
	.button.good {
		background: var(--good);
		color: #fff;
	}
</style>
