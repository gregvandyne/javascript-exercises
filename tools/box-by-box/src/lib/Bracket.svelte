<script lang="ts">
	// The long division bracket around a problem tile's dividend, drawn to the size of what it holds.
	import type { Snippet } from 'svelte';
	let { stroke = 2, children }: { stroke?: number; children: Snippet } = $props();
	let w = $state(0);
	let h = $state(0);
	const d = $derived.by(() => {
		const s = stroke / 2;
		const bow = Math.max(4, h * 0.16);
		return `M${s} ${h - s} Q${s + bow * 2} ${h / 2} ${s} ${s} H${w - s}`;
	});
</script>

<span class="bracket" style:--stroke="{stroke}px" bind:clientWidth={w} bind:clientHeight={h}>
	{#if w && h}
		<svg aria-hidden="true" width={w} height={h}><path {d} stroke-width={stroke} /></svg>
	{/if}
	{@render children()}
</span>

<style>
	.bracket {
		position: relative;
		display: inline-flex;
		align-items: center;
		margin-left: 0.12em;
		padding: calc(var(--stroke) + 0.08em) 0 0 0.38em;
	}
	svg {
		position: absolute;
		inset: 0;
		overflow: visible;
		pointer-events: none;
	}
	path {
		fill: none;
		stroke: var(--ink-soft);
		stroke-linecap: round;
		stroke-linejoin: round;
	}
</style>
