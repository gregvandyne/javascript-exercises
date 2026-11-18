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
		crossed = () => false,
		label
	}: {
		sheet: Sheet;
		box: Snippet<[string, boolean]>;
		paper?: boolean;
		shown?: (c: Cell) => boolean;
		lit?: (key: string) => boolean;
		draw?: boolean;
		/** Whether a given digit is crossed out now (regrouping). */
		crossed?: (c: Cell) => boolean;
		label?: string;
	} = $props();

	/** An arrow down the middle of its column, from under the digit to just over the box it goes to; or (up) a short one
	 *  beside a lifted point, from the row below to the row above. */
	/** A decimal point's hop: an arc over the digits it moves past, ending in an arrowhead where the point lands. */
	function hopPath(x1: number, x2: number): string {
		const d = x2 > x1 ? 1 : -1;
		return `M ${x1} 0.8 Q ${(x1 + x2) / 2} -0.75 ${x2} 0.8 M ${x2 - d * 0.16} 0.68 L ${x2} 0.8 L ${x2 + d * 0.02} 0.6`;
	}
	function arrowPath(up: boolean, span: number, at = 0.86): string {
		if (up) {
			const x = at;
			// (numbers written out: the build's safety scan reads 0.58000000000001 in a string as a phone number)
			return `M ${x} ${span - 0.25} V 0.45 M ${x - 0.1} 0.58 L ${x} 0.45 L ${x + 0.1} 0.58`;
		}
		const y1 = 0.88;
		const y2 = span - 1 + 0.06;
		return `M 0.5 ${y1} V ${y2} M 0.38 ${y2 - 0.14} L 0.5 ${y2} L 0.62 ${y2 - 0.14}`;
	}
</script>

<div class="sheet" dir="ltr" class:paper role="group" aria-label={label ?? sheet.title} style:--cols={sheet.cols} style:--rows={sheet.rows}>
	{#each sheet.cells as c, i (i)}
		{#if shown(c)}
			{@const dim = !lit(cellKey(c))}
			{#if c.kind === 'given'}
				<span
					class="given"
					class:faint={c.faint}
					class:label={c.label}
					class:dot={c.dot}
					class:note={c.note}
					class:crossed={crossed(c)}
					class:nudge={c.nudge}
					class:dim
					class:drawn={draw && c.step !== undefined}
					aria-hidden={c.faint}
					style:grid-row={c.row + 1}
					style:grid-column={c.col + 1}>{c.text}</span
				>
			{:else if c.kind === 'box'}
				<span
					class="slot"
					class:half-top={c.half === 'top'}
					class:half-bottom={c.half === 'bottom'}
					class:corner={c.corner}
					class:on-line={c.point}
					class:dim
					style:grid-row={c.row + 1}
					style:grid-column={c.col + 1}>{@render box(c.id, !!c.small)}</span
				>
			{:else if c.kind === 'hop'}
				{@const left = Math.floor(c.from)}
				{@const w = Math.ceil(c.to) - left}
				<svg
					class="hop"
					class:dim
					aria-hidden="true"
					viewBox="0 0 {w} 1"
					style:grid-row={c.row + 1}
					style:grid-column="{left + 1} / span {w}"
					><path d={hopPath(c.from - left, c.to - left)} /><circle cx={c.to - left} cy="0.84" r="0.07" /></svg
				>
			{:else if c.kind === 'rule'}
				<span
					class="rule"
					class:mid={c.mid}
					class:dim
					class:drawn={draw && c.step !== undefined}
					aria-hidden="true"
					style:grid-row={c.row + 1}
					style:grid-column="{c.from + 1} / {c.to + 1}"
				></span>
			{:else if c.kind === 'arrow'}
				{@const top = Math.min(c.row, c.toRow)}
				{@const span = Math.abs(c.toRow - c.row) + 1}
				<svg
					class="arrow"
					class:dim
					aria-hidden="true"
					viewBox="0 0 1 {span}"
					style:grid-row="{top + 1} / span {span}"
					style:grid-column={c.col + 1}
					><path d={arrowPath(c.toRow < c.row, span, c.x)} /></svg
				>
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
	.hop {
		width: 100%;
		height: 100%;
		overflow: visible;
		pointer-events: none;
		fill: none;
		stroke: var(--accent);
		stroke-width: 0.05;
		stroke-linecap: round;
		stroke-linejoin: round;
	}
	.hop circle {
		fill: var(--accent);
		stroke: none;
	}
	.given.dot {
		justify-self: end;
		align-self: end;
		width: calc(var(--cell) * 0.3);
		margin-right: calc(var(--cell) * -0.15);
		padding-bottom: calc(var(--cell) * 0.1);
		z-index: 1;
	}
	.given.note {
		justify-self: end;
		padding-right: calc(var(--cell) * 0.12);
		color: var(--ink-soft);
		font-size: calc(var(--cell) * 0.28);
		white-space: nowrap;
	}
	/* the strike goes over the digit only, so a small 1 in the corner stays clear of it */
	.given.crossed {
		color: var(--muted);
		background-image: linear-gradient(
			to top right,
			transparent calc(50% - 1.5px),
			var(--ink-soft) calc(50% - 1.5px) calc(50% + 1.5px),
			transparent calc(50% + 1.5px)
		);
		background-repeat: no-repeat;
		background-position: center;
		background-size: 52% 62%;
	}
	.given.nudge {
		padding-left: calc(var(--cell) * 0.3);
	}
	.given.nudge.crossed {
		background-position: calc(50% + var(--cell) * 0.15) center;
	}
	/* a point: a small box on the line after its square */
	.slot.on-line {
		justify-self: end;
		align-self: end;
		width: 36%;
		height: 44%;
		margin-right: calc(var(--cell) * -0.18);
		padding: 0;
		z-index: 2;
	}
	.slot.half-top,
	.slot.half-bottom {
		height: 50%;
		padding: calc(var(--cell) * 0.04) calc(var(--cell) * 0.06);
	}
	.slot.half-top {
		align-self: start;
	}
	.slot.half-bottom {
		align-self: end;
	}
	.slot.corner {
		align-self: start;
		justify-self: start;
		width: 34%;
		height: 38%;
		padding: 0;
		z-index: 1;
	}
	.rule.mid {
		align-self: center;
		margin-bottom: 0;
		border-bottom-width: 2.5px;
	}
	.arrow {
		width: 100%;
		height: 100%;
		overflow: visible;
		pointer-events: none;
		fill: none;
		stroke: var(--arrow, var(--accent));
		stroke-width: 0.045;
		stroke-linecap: round;
		stroke-linejoin: round;
		opacity: 0.75;
	}
	.arrow.dim {
		opacity: 0.18;
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
