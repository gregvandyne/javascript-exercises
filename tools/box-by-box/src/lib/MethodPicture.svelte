<script lang="ts">
	import { t } from './i18n';
	// A finished example of a method (the ladder or area model for 945 ÷ 7; the area model or partial products for
	// 46 × 23), small, on graph paper: the picture beside a method's name in the editor and on the About page.
	import Work from './Work.svelte';
	import { buildWork, watchValues, type Field, type Method } from './methods';
	import type { Kind, Problem } from './logic';

	let { kind, method, size = 22 }: { kind: Kind; method: Method; size?: number } = $props();
	const problem = $derived<Problem>(kind === 'divide' ? [945, 7] : [46, 23]);
	const values = $derived(watchValues(method, kind, problem));
	const work = $derived(buildWork(method, kind, problem, values));
</script>

{#snippet still(f: Field)}
	{@const v = values[f.id] ?? ''}
	<span class="num" class:choice={f.role === 'choice'} class:remainder={f.role === 'remainder'}
		>{#each Array.from({ length: f.len }, (_, i) => v[i - (f.len - v.length)] ?? '') as d, i (i)}<span class="sq">{d}</span>{/each}</span
	>
{/snippet}

<div class="picture" dir="ltr" style:--sq="{size}px" role="img" aria-label={t('ui.picture', { x: `${work.title} = ${work.answer.replace(' R 0', '')}` })}>
	<Work {work} field={still} {values} />
</div>

<style>
	.picture {
		display: flex;
		justify-content: center;
		padding: 0.6rem 0.4rem;
		overflow-x: auto;
		background-color: var(--graph-ground);
		background-image:
			linear-gradient(to right, var(--graph-line) 1px, transparent 1px),
			linear-gradient(to bottom, var(--graph-line) 1px, transparent 1px);
		background-size: var(--sq) var(--sq);
	}
	.picture > :global(*) {
		flex: none;
	}
	.num {
		display: flex;
		height: var(--sq);
		border-radius: 3px;
		background: color-mix(in srgb, var(--box-wash) 60%, transparent);
	}
	.num.choice {
		background: color-mix(in srgb, var(--accent-wash) 80%, transparent);
		color: var(--accent-dark);
	}
	.num.remainder {
		color: var(--remainder);
	}
	.sq {
		display: grid;
		place-items: center;
		width: var(--sq);
		height: var(--sq);
	}
</style>
