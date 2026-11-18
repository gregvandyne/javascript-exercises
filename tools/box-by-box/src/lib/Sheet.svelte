<script lang="ts">
	// A problem laid out on graph paper: one square per cell, the given digits and signs, the rules, the division
	// bracket, and a slot for each box (the box itself is the caller's: an input in the player, plain text in a demo).
	import type { Snippet } from 'svelte';
	import { cellKey, type Cell, type Sheet } from './logic';

	let {
		sheet,
		box,
		paper = true,
		shown = () => true,
		lit = () => true,
		draw = false,
		label
	}: {
		sheet: Sheet;
		box: Snippet<[string, boolean]>;
		paper?: boolean;
		shown?: (c: Cell) => boolean;
		lit?: (key: string) => boolean;
		draw?: boolean;
		label?: string;
	} = $props();
</script>

<div class="sheet" class:paper role="group" aria-label={label ?? sheet.title} style:--cols={sheet.cols} style:--rows={sheet.rows}>
	{#each sheet.cells as c, i (i)}
		{#if shown(c)}
			{@const dim = !lit(cellKey(c))}
			{#if c.kind === 'given'}
				<span
					class="given"
					class:faint={c.faint}
					class:label={c.label}
					class:dim
					class:drawn={draw && c.step !== undefined}
					aria-hidden={c.faint}
					style:grid-row={c.row + 1}
					style:grid-column={c.col + 1}>{c.text}</span
				>
			{:else if c.kind === 'box'}
				<span class="slot" class:dim style:grid-row={c.row + 1} style:grid-column={c.col + 1}>{@render box(c.id, !!c.small)}</span>
			{:else if c.kind === 'rule'}
				<span
					class="rule"
					class:dim
					class:drawn={draw && c.step !== undefined}
					aria-hidden="true"
					style:grid-row={c.row + 1}
					style:grid-column="{c.from + 1} / {c.to + 1}"
				></span>
			{:else}
				<svg
					class="bracket"
					class:dim
					aria-hidden="true"
					preserveAspectRatio="none"
					viewBox="0 0 {c.to - c.col} 1"
					style:grid-row={c.row + 1}
					style:grid-column="{c.col + 1} / {c.to + 1}"
					><path fill="none" vector-effect="non-scaling-stroke" d="M {c.to - c.col} 0.02 H 0.02 Q 0.3 0.5 0.02 1" /></svg
				>
			{/if}
		{/if}
	{/each}
</div>

<style>
	.sheet {
		--cell: 3.5rem;
		display: grid;
		grid-template-columns: repeat(var(--cols), var(--cell));
		grid-template-rows: repeat(var(--rows), var(--cell));
		font-variant-numeric: tabular-nums;
		width: max-content;
	}
	.sheet.paper {
		background-image:
			linear-gradient(to right, var(--grid-line) 1px, transparent 1px),
			linear-gradient(to bottom, var(--grid-line) 1px, transparent 1px);
		background-size: var(--cell) var(--cell);
		border-right: 1px solid var(--grid-line);
		border-bottom: 1px solid var(--grid-line);
	}
	.given,
	.slot,
	.rule,
	.bracket {
		transition: opacity 0.4s;
	}
	.dim {
		opacity: 0.18;
	}
	.given,
	.slot {
		display: grid;
		place-items: center;
		min-width: 0;
	}
	.given {
		font-size: calc(var(--cell) * 0.58);
		color: var(--ink);
		font-weight: 700;
		line-height: 1;
	}
	.label {
		justify-self: end;
		padding-right: calc(var(--cell) * 0.08);
		color: var(--remainder);
		font-size: calc(var(--cell) * 0.42);
	}
	.faint {
		color: var(--muted);
		opacity: 0.55;
	}
	.slot {
		padding: calc(var(--cell) * 0.08);
	}
	.sheet:not(.paper) .slot {
		padding: 0;
	}
	.rule {
		align-self: end;
		height: 0;
		margin-bottom: -1.5px;
		border-bottom: 3px solid var(--ink);
		border-radius: 2px;
		pointer-events: none;
	}
	.sheet:not(.paper) .rule {
		border-bottom-width: 2.5px;
	}
	.bracket {
		width: 100%;
		height: 100%;
		overflow: visible;
		pointer-events: none;
		stroke: var(--ink);
		stroke-width: 3px;
		stroke-linecap: round;
	}
	.rule.drawn {
		transform-origin: 0;
		animation: draw-line 0.6s ease-out both;
	}
	.given.drawn {
		animation: write-sign 0.6s ease-out both;
	}
	@keyframes draw-line {
		0% {
			transform: scaleX(0);
		}
	}
	@keyframes write-sign {
		0% {
			opacity: 0;
			transform: scale(0.4);
		}
	}
	@keyframes fade-in {
		0% {
			opacity: 0;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.rule.drawn,
		.given.drawn {
			animation-name: fade-in;
		}
	}
</style>
