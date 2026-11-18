<script lang="ts">
	// One algebra tile drawn at its true size: an x² tile is x by x, an x tile
	// x by 1, a unit tile 1 by 1. Each is labeled with what it stands for, so
	// a negative tile reads as one without relying on its red alone.
	import { lenPx, size, type Kind, type Sign } from './mat';

	let {
		kind,
		sign,
		turned = false,
		scale = 1,
		wrong = false,
		lifted = false
	}: {
		kind: Kind;
		sign: Sign;
		turned?: boolean;
		/** Pixels per board pixel: the zoom, or smaller in the tray. */
		scale?: number;
		wrong?: boolean;
		lifted?: boolean;
	} = $props();

	const dims = $derived(size(kind, turned));
	const body = $derived(kind === 'x2' ? 'x²' : kind === 'x' ? 'x' : '1');
	// The label's size, kept small enough to fit across the tile's narrow side
	// however small the tile is drawn: "−x" on a standing x tile in a picture.
	const fontPx = $derived.by(() => {
		const chars = body.length + (sign < 0 ? 1 : 0);
		const narrow = Math.min(lenPx(dims.w), lenPx(dims.h)) * scale;
		return Math.min((kind === 'unit' ? 13 : 18) * scale, (narrow - 3) / (chars * 0.62));
	});
</script>

<span
	class="tile {kind}"
	class:neg={sign < 0}
	class:wrong
	class:lifted
	style:width="{lenPx(dims.w) * scale}px"
	style:height="{lenPx(dims.h) * scale}px"
	style:font-size="{fontPx}px"
>
	<span class="label">{sign < 0 ? '−' : ''}<span class:var={kind !== 'unit'}>{body}</span></span>
</span>

<style>
	.tile {
		display: grid;
		place-items: center;
		border: 1.5px solid;
		border-radius: 4px;
		box-shadow:
			inset 0 1px 0 rgb(255 255 255 / 0.45),
			0 1px 2px rgb(29 40 56 / 0.18);
		font-weight: 700;
		line-height: 1;
		overflow: hidden;
		user-select: none;
	}
	.x2 {
		background: var(--x2-fill);
		border-color: var(--x2-edge);
		color: var(--x2-ink);
	}
	.x {
		background: var(--x-fill);
		border-color: var(--x-edge);
		color: var(--x-ink);
	}
	.unit {
		background: var(--unit-fill);
		border-color: var(--unit-edge);
		color: var(--unit-ink);
	}
	.neg {
		background: var(--neg-fill);
		border-color: var(--neg-edge);
		color: var(--neg-ink);
	}
	.label {
		white-space: nowrap;
	}
	.var {
		font-style: italic;
	}
	.wrong {
		outline: 3px solid var(--bad);
		outline-offset: 1px;
		animation: shake 0.3s;
	}
	.lifted {
		box-shadow:
			0 6px 0 rgb(29 40 56 / 0.12),
			0 12px 22px rgb(29 40 56 / 0.25);
	}
	@keyframes shake {
		25% {
			transform: translateX(-3px);
		}
		75% {
			transform: translateX(3px);
		}
	}
</style>
