<svelte:options namespace="svg" />

<script lang="ts">
	// Solve's balance, drawn like a cartoon scale in board pixels, for the
	// board, the gallery's picture and the setup page's preview. It draws
	// inside an <svg> the page provides, so tiles can sit in its pans.
	//
	// A gray post on a foot; a dark beam across the top, turning about the
	// round pin at the top of the post, which stays put; a needle standing up
	// from the beam; and a dashed pan hanging from each end on strings, with a
	// dish under it. As the beam turns, each pan moves straight up or down
	// with its end of the beam.
	import { XLEN, type Rect } from './mat';
	import type { Pan } from './balance';

	let {
		left,
		right,
		pivot,
		arm,
		foot,
		tilt = 0,
		drops = { left: 0, right: 0 },
		faded = false,
		post = true,
		needle = 44,
		small = false
	}: {
		left: Rect;
		right: Rect;
		pivot: { x: number; y: number };
		arm: number;
		foot: number;
		/** How far the beam turns, in degrees, clockwise. */
		tilt?: number;
		/** How far each pan hangs down from level. */
		drops?: Record<Pan, number>;
		/** Faded away, as in Solve's division step. */
		faded?: boolean;
		/** Whether to draw the post, or leave it to the page (Solve's board, whose
		 *  post becomes the division step's line). */
		post?: boolean;
		/** How tall the needle stands above the beam. */
		needle?: number;
		/** Drawn for a small picture: the strings a little heavier, so they show. */
		small?: boolean;
	} = $props();

	const pans = $derived([
		{ which: 'left' as const, r: left, end: pivot.x - arm },
		{ which: 'right' as const, r: right, end: pivot.x + arm }
	]);
	/** A pan's outline: square at the top, well rounded at the bottom. */
	const panPath = ({ x, y, w, h }: Rect) =>
		`M${x + 6} ${y}H${x + w - 6}Q${x + w} ${y} ${x + w} ${y + 6}V${y + h - 22}Q${x + w} ${y + h} ${x + w - 22} ${y + h}H${x + 22}Q${x} ${y + h} ${x} ${y + h - 22}V${y + 6}Q${x} ${y} ${x + 6} ${y}Z`;
	/** The dish under a pan, wider than it, rounded underneath. */
	const dishPath = ({ x, y, w, h }: Rect) =>
		`M${x - 12} ${y + h + 4}H${x + w + 12}Q${x + w + 12} ${y + h + 14} ${x + w + 2} ${y + h + 14}H${x - 2}Q${x - 12} ${y + h + 14} ${x - 12} ${y + h + 4}Z`;
</script>

<g class="balance" class:faded class:small aria-hidden="true">
	{#if post}
		<!-- Rounded at the top, square at the bottom, which runs on into the foot
		     so the two are joined with no seam at any size. -->
		<path
			class="stand"
			d="M{pivot.x - 7} {foot + 8}V{pivot.y + 7}A7 7 0 0 1 {pivot.x + 7} {pivot.y + 7}V{foot + 8}Z"
		/>
	{/if}
	<rect class="stand" x={pivot.x - 1.2 * XLEN} y={foot} width={2.4 * XLEN} height="16" rx="8" />
	{#each pans as { which, r, end } (which)}
		<g class="hanger" style:translate="0 {drops[which]}px">
			<polyline class="strings" points="{r.x},{r.y} {end},{pivot.y} {r.x + r.w},{r.y}" />
			<path class="dish" d={dishPath(r)} />
			<path class="pan" d={panPath(r)} />
		</g>
	{/each}
	<g class="beam" style:rotate="{tilt}deg" style:transform-origin="{pivot.x}px {pivot.y}px">
		<rect x={pivot.x - arm} y={pivot.y - 7} width={2 * arm} height="14" rx="7" />
		<rect x={pivot.x - 2} y={pivot.y - 7 - needle} width="4" height={needle} rx="2" />
	</g>
	<!-- The pin the beam turns about, fixed to the top of the post. -->
	<circle class="cap" cx={pivot.x} cy={pivot.y} r="10" />
</g>

<style>
	.balance {
		transition: opacity 0.6s;
		pointer-events: none;
	}
	.balance.faded {
		opacity: 0;
	}
	.stand,
	.dish {
		fill: var(--line-strong);
	}
	.beam {
		fill: var(--muted);
	}
	.cap {
		fill: var(--paper);
		stroke: var(--muted);
		stroke-width: 4;
	}
	.strings {
		fill: none;
		stroke: var(--line-strong);
		stroke-width: 2;
	}
	/* A little heavier in a small picture, so they still show. */
	.small .strings {
		stroke-width: 3;
	}
	.pan {
		fill: rgb(251 252 254 / 0.6);
		stroke: var(--line-strong);
		stroke-width: 2;
		stroke-dasharray: 6 4;
	}
	.beam,
	.hanger {
		transition:
			rotate 0.7s cubic-bezier(0.3, 0.7, 0.4, 1.1),
			translate 0.7s cubic-bezier(0.3, 0.7, 0.4, 1.1);
	}
</style>
