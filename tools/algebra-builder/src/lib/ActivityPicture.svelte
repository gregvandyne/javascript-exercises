<script lang="ts" module>
	import type { Activity } from './algebra';
	import { GAP, UNIT, XLEN, type Kind, type Sign } from './mat';

	// A worked example of each activity, drawn with the board's own tiles at
	// their true sizes: Multiply's (x + 2)(x + 1) and Factor's x² + 3x + 2 on
	// the T, and Solve's 2x + 3 = 7 on a level balance. Everything is laid out
	// in board pixels, as on the student's board, and scaled down as a whole.
	// The tiles students are given are drawn in color; the ones they make are
	// ghosts, dashed outlines, like the answer they find.

	interface Piece {
		kind: Kind;
		sign: Sign;
		turned: boolean;
		x: number;
		y: number;
		/** A tile the student makes, not one they're given. */
		ghost?: boolean;
	}

	/** The width and height of a tile in board pixels: an x tile lies across
	 *  unless turned to stand up. */
	const dims = (kind: Kind, turned: boolean) =>
		kind === 'x2'
			? { w: XLEN, h: XLEN }
			: kind === 'x'
				? turned
					? { w: UNIT, h: XLEN }
					: { w: XLEN, h: UNIT }
				: { w: UNIT, h: UNIT };

	const len = (k: 'x' | 'unit') => (k === 'x' ? XLEN : UNIT);
	/** The strip of each side of the T, a tile thick with a gap either side. */
	const STRIP = UNIT + 2 * GAP;
	/** Room left in the rectangle past the tiles. */
	const SPARE = 20;
	/** Room round the drawing. */
	const MARGIN = 8;

	interface Mat {
		pieces: Piece[];
		w: number;
		h: number;
	}

	/** The mat with one factor along the top side and one down the left, and
	 *  the rectangle they make filled in: one tile where each row meets each
	 *  column. The T's top-left corner is at (0, 0). `made` is what the student
	 *  builds, drawn as ghosts: the rectangle, or the sides. */
	function mat(top: ('x' | 'unit')[], left: ('x' | 'unit')[], made: 'rectangle' | 'sides'): Mat {
		const pieces: Piece[] = [];
		const at = (ks: ('x' | 'unit')[]) =>
			ks.map((_, i) => ks.slice(0, i).reduce((n, k) => n + len(k), 0));
		const cols = at(top);
		const rows = at(left);
		top.forEach((k, i) =>
			pieces.push({
				kind: k,
				sign: 1,
				turned: false,
				x: STRIP + cols[i],
				y: GAP,
				ghost: made === 'sides'
			})
		);
		left.forEach((k, j) =>
			pieces.push({
				kind: k,
				sign: 1,
				turned: true,
				x: GAP,
				y: STRIP + rows[j],
				ghost: made === 'sides'
			})
		);
		left.forEach((r, j) =>
			top.forEach((c, i) =>
				pieces.push({
					kind: r === 'x' && c === 'x' ? 'x2' : r === 'unit' && c === 'unit' ? 'unit' : 'x',
					sign: 1,
					// An x tile stands up in an x row, under a unit column.
					turned: r === 'x',
					x: STRIP + cols[i],
					y: STRIP + rows[j],
					ghost: made === 'rectangle'
				})
			)
		);
		const width = top.reduce((n, k) => n + len(k), 0);
		const height = left.reduce((n, k) => n + len(k), 0);
		return { pieces, w: STRIP + width + SPARE, h: STRIP + height + SPARE };
	}

	// Solve's balance, smaller than the student's but drawn the same way: two
	// pans hanging from a beam on a post, and the tiles of 2x + 3 = 7 in them.
	const PAN = 136;
	const PAN_GAP = 56;
	const HANG = 44;
	const NEEDLE = 30;
	const FOOT_Y = PAN + 30;
	const PAD = (PAN - 3 * UNIT - 2 * GAP) / 2;
	const step = UNIT + GAP;
	const RIGHT = PAN + PAN_GAP;
	const PIVOT = { x: PAN + PAN_GAP / 2, y: -HANG };
	const balancePieces: Piece[] = [
		// 2x + 3: two x tiles standing, and a column of three units.
		{ kind: 'x', sign: 1, turned: true, x: PAD, y: PAD },
		{ kind: 'x', sign: 1, turned: true, x: PAD + step, y: PAD },
		...[0, 1, 2].map((i) => ({
			kind: 'unit' as const,
			sign: 1 as const,
			turned: false,
			x: PAD + 2 * step,
			y: PAD + i * step
		})),
		// 7: three rows of units, three, three and one.
		...[0, 1, 2, 3, 4, 5, 7].map((i) => ({
			kind: 'unit' as const,
			sign: 1 as const,
			turned: false,
			x: RIGHT + PAD + (i % 3) * step,
			y: PAD + Math.floor(i / 3) * step
		}))
	];
	/** Solve's drawing, from the top of the needle to the bottom of the foot. */
	const BALANCE_BOX = {
		x: -12 - MARGIN,
		y: PIVOT.y - 7 - NEEDLE - MARGIN,
		w: 2 * PAN + PAN_GAP + 24 + 2 * MARGIN,
		h: FOOT_Y + 16 - (PIVOT.y - 7 - NEEDLE) + 2 * MARGIN
	};
	/** The balance as BalanceArt draws it. */
	const PICTURE_BALANCE = {
		left: { x: 0, y: 0, w: PAN, h: PAN },
		right: { x: RIGHT, y: 0, w: PAN, h: PAN },
		pivot: PIVOT,
		arm: (PAN + PAN_GAP) / 2,
		foot: FOOT_Y
	};

	const MULTIPLY = mat(['x', 'unit', 'unit'], ['x', 'unit'], 'rectangle');
	const FACTOR = mat(['x', 'unit'], ['x', 'unit', 'unit'], 'sides');

	/** The tallest of the three drawings, so every picture in a set is the same height. */
	export const PICTURE_HEIGHT = Math.max(
		BALANCE_BOX.h,
		MULTIPLY.h + 2 * MARGIN,
		FACTOR.h + 2 * MARGIN
	);
</script>

<script lang="ts">
	import { activityInfo } from './activities';
	import BalanceArt from './BalanceArt.svelte';

	let { activity, scale = 0.5 }: { activity: Activity; scale?: number } = $props();

	const example = $derived(activityInfo(activity).example);
	const box = $derived(
		activity === 'solve'
			? BALANCE_BOX
			: {
					x: -MARGIN,
					y: -MARGIN,
					w: (activity === 'multiply' ? MULTIPLY : FACTOR).w + 2 * MARGIN,
					h: (activity === 'multiply' ? MULTIPLY : FACTOR).h + 2 * MARGIN
				}
	);
	const pieces = $derived(
		activity === 'solve' ? balancePieces : (activity === 'multiply' ? MULTIPLY : FACTOR).pieces
	);
	const T = $derived(activity === 'multiply' ? MULTIPLY : FACTOR);

	/** A tile's label size, as TileView works it out: small enough to fit across
	 *  its narrow side at this scale. In board pixels. */
	function fontSize(p: Piece) {
		const d = dims(p.kind, p.turned);
		const chars = (p.kind === 'x2' ? 2 : 1) + (p.sign < 0 ? 1 : 0);
		const narrow = Math.min(d.w, d.h) * scale;
		return Math.min((p.kind === 'unit' ? 13 : 18) * scale, (narrow - 3) / (chars * 0.62)) / scale;
	}

	/** Typed math with its x in italics, as the tiles label it. */
	const parts = (text: string) => text.split(/(x)/).filter(Boolean);
</script>

<!-- Drawn at `scale`, unless the page sets --picture-scale to fit its layout. -->
<figure class="picture" style:--s="var(--picture-scale, {scale})">
	<p class="math" aria-hidden="true">
		{#each parts(example.problem) as part, i (i)}{#if part === 'x'}<i>x</i>{:else}{part}{/if}{/each}
	</p>
	<div class="frame" style:height="calc({PICTURE_HEIGHT}px * var(--s))">
		<svg
			viewBox="{box.x} {box.y} {box.w} {box.h}"
			style:width="calc({box.w}px * var(--s))"
			aria-hidden="true"
		>
			{#if activity === 'solve'}
				<BalanceArt {...PICTURE_BALANCE} needle={NEEDLE} small />
			{:else}
				<!-- The mat: the corner, the two sides and the rectangle. -->
				<rect class="mat" x="0" y="0" width={T.w} height={T.h} />
				<rect class="side" x={STRIP} y="0" width={T.w - STRIP} height={STRIP} />
				<rect class="side" x="0" y={STRIP} width={STRIP} height={T.h - STRIP} />
				<rect class="side" x="0" y="0" width={STRIP} height={STRIP} />
				<path class="rule" d="M{STRIP} 0V{T.h}M0 {STRIP}H{T.w}" />
				<text class="corner" x={STRIP / 2} y={STRIP / 2}>×</text>
			{/if}

			{#each pieces as p, i (i)}
				{@const d = dims(p.kind, p.turned)}
				<g class="tile {p.kind}" class:neg={p.sign < 0} class:ghost={p.ghost}>
					<rect
						class="shadow"
						x={p.x}
						y={p.y + 1 / scale}
						width={d.w}
						height={d.h}
						rx={4 / scale}
					/>
					<rect class="body" x={p.x} y={p.y} width={d.w} height={d.h} rx={4 / scale} />
					<text x={p.x + d.w / 2} y={p.y + d.h / 2} font-size={fontSize(p)}
						>{p.sign < 0 ? '−' : ''}<tspan font-style={p.kind === 'unit' ? null : 'italic'}
							>{p.kind === 'x2' ? 'x²' : p.kind === 'x' ? 'x' : '1'}</tspan
						></text
					>
				</g>
			{/each}
		</svg>
	</div>
	<p class="math answer" aria-hidden="true">
		{#each parts(example.answer) as part, i (i)}{#if part === 'x'}<i>x</i>{:else}{part}{/if}{/each}
	</p>
</figure>

<style>
	.picture {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: calc(var(--s) * 0.7rem);
		margin: 0;
	}
	.frame {
		display: grid;
		place-items: center;
		max-width: 100%;
	}
	svg {
		display: block;
		max-width: 100%;
		height: auto;
		max-height: 100%;
	}
	.math {
		color: var(--ink);
		font-size: calc(var(--s) * 2rem);
		font-weight: 700;
		line-height: 1.2;
		white-space: nowrap;
	}
	/* The answer, like the ghost tiles, is what the student finds. */
	.math.answer {
		padding: 0 calc(var(--s) * 0.6rem);
		border: max(1px, calc(var(--s) * 3px)) dashed var(--line-strong);
		border-radius: calc(var(--s) * 0.8rem);
		color: var(--muted);
	}
	.mat {
		fill: var(--paper);
		stroke: var(--line-strong);
		stroke-width: 1px;
		vector-effect: non-scaling-stroke;
	}
	.side {
		fill: var(--paper-low);
	}
	.rule {
		fill: none;
		stroke: var(--line-strong);
		stroke-width: 1px;
		vector-effect: non-scaling-stroke;
	}
	.corner {
		fill: var(--muted);
		font-size: 20px;
		font-weight: 700;
		text-anchor: middle;
		dominant-baseline: central;
	}
	.shadow {
		fill: rgb(29 40 56 / 0.18);
	}
	.body {
		stroke-width: 1.5px;
		vector-effect: non-scaling-stroke;
	}
	.tile text {
		font-weight: 700;
		text-anchor: middle;
		dominant-baseline: central;
	}
	.x2 .body {
		fill: var(--x2-fill);
		stroke: var(--x2-edge);
	}
	.x2 text {
		fill: var(--x2-ink);
	}
	.x .body {
		fill: var(--x-fill);
		stroke: var(--x-edge);
	}
	.x text {
		fill: var(--x-ink);
	}
	.unit .body {
		fill: var(--unit-fill);
		stroke: var(--unit-edge);
	}
	.unit text {
		fill: var(--unit-ink);
	}
	.neg .body {
		fill: var(--neg-fill);
		stroke: var(--neg-edge);
	}
	.neg text {
		fill: var(--neg-ink);
	}
	/* A ghost: the tile's outline dashed in its own edge color, its label faint. */
	.ghost .shadow {
		display: none;
	}
	.ghost .body {
		fill: rgb(251 252 254 / 0.7);
		stroke-width: 1.5px;
		stroke-dasharray: 5 3;
	}
	.ghost text {
		opacity: 0.55;
	}
</style>
