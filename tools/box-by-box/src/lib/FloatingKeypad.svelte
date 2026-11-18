<script lang="ts" module>
	export type Rect = { x: number; y: number; width: number; height: number };
</script>

<script lang="ts">
	// The keypad on wide screens: a panel that floats over the paper, moved by its handle and sized by its corner (or
	// with the arrow keys on either), kept inside the window. Its place is kept in the player's save.
	import { onMount } from 'svelte';
	import { GripHorizontal, X } from '@lucide/svelte';
	import Keypad from './Keypad.svelte';

	let {
		ontap,
		onclose,
		disabled = false,
		top = 64,
		rect = $bindable(),
		saved,
		onmoved,
		point = false
	}: {
		ontap: (k: string) => void;
		onclose: () => void;
		disabled?: boolean;
		top?: number;
		rect?: Rect;
		saved?: Rect | null;
		onmoved: (r: Rect) => void;
		point?: boolean;
	} = $props();

	const MIN = { width: 200, height: 260 };
	let r = $state<Rect>({ x: -1, y: -1, width: 300, height: 390 });
	$effect(() => {
		rect = { ...r };
	});

	function keepIn() {
		const maxW = Math.max(MIN.width, innerWidth - 16);
		const maxH = Math.max(MIN.height, innerHeight - top - 16);
		r.width = Math.min(Math.max(r.width, MIN.width), maxW);
		r.height = Math.min(Math.max(r.height, MIN.height), maxH);
		r.x = Math.min(Math.max(r.x, 8), innerWidth - r.width - 8);
		r.y = Math.min(Math.max(r.y, top + 8), innerHeight - 48);
	}
	onMount(() => {
		if (saved && ['x', 'y', 'width', 'height'].every((k) => Number.isFinite(saved[k as keyof Rect]))) r = { ...saved };
		if (r.x < 0) {
			r.x = innerWidth - r.width - 24;
			r.y = top + 24;
		}
		keepIn();
		const onResize = () => keepIn();
		addEventListener('resize', onResize);
		return () => removeEventListener('resize', onResize);
	});

	function drag(e: PointerEvent, resize: boolean) {
		e.preventDefault();
		const el = e.currentTarget as HTMLElement;
		el.setPointerCapture?.(e.pointerId);
		const start = { px: e.clientX, py: e.clientY, ...r };
		const move = (ev: PointerEvent) => {
			const dx = ev.clientX - start.px;
			const dy = ev.clientY - start.py;
			if (resize) {
				r.width = start.width + dx;
				r.height = start.height + dy;
			} else {
				r.x = start.x + dx;
				r.y = start.y + dy;
			}
			keepIn();
		};
		const end = () => {
			el.removeEventListener('pointermove', move);
			el.removeEventListener('pointerup', end);
			el.removeEventListener('pointercancel', end);
			onmoved({ ...r });
		};
		el.addEventListener('pointermove', move);
		el.addEventListener('pointerup', end);
		el.addEventListener('pointercancel', end);
	}
	function nudge(e: KeyboardEvent, resize: boolean) {
		const d = ({ ArrowLeft: [-24, 0], ArrowRight: [24, 0], ArrowUp: [0, -24], ArrowDown: [0, 24] } as Record<string, number[]>)[e.key];
		if (!d) return;
		e.preventDefault();
		if (resize) {
			r.width += d[0];
			r.height += d[1];
		} else {
			r.x += d[0];
			r.y += d[1];
		}
		keepIn();
		onmoved({ ...r });
	}
</script>

<div class="floating" role="group" aria-label="Keypad" style:left="{r.x}px" style:top="{r.y}px" style:width="{r.width}px" style:height="{r.height}px">
	<button type="button" class="close" aria-label="Close the keypad" onpointerdown={(e) => e.preventDefault()} onclick={onclose}
		><X size={16} aria-hidden="true" /></button
	>
	<button
		type="button"
		class="handle"
		aria-label="Move the keypad: drag, or use the arrow keys"
		onpointerdown={(e) => drag(e, false)}
		onkeydown={(e) => nudge(e, false)}><GripHorizontal size={18} aria-hidden="true" /></button
	>
	<div class="keys"><Keypad fill {point} {disabled} {ontap} /></div>
	<button
		type="button"
		class="corner"
		aria-label="Resize the keypad: drag, or use the arrow keys"
		onpointerdown={(e) => drag(e, true)}
		onkeydown={(e) => nudge(e, true)}
	></button>
</div>

<style>
	.floating {
		position: fixed;
		z-index: 15;
		display: flex;
		flex-direction: column;
		padding: 0 0.6rem 0.6rem;
		border: 2px solid var(--line);
		border-radius: 18px;
		background: color-mix(in srgb, var(--paper) 96%, transparent);
		box-shadow: 0 10px 30px rgb(20 20 20 / 0.16);
		touch-action: none;
	}
	.handle {
		display: grid;
		place-items: center;
		height: 1.9rem;
		margin: 0 -0.6rem 0.2rem;
		border: 0;
		border-radius: 16px 16px 0 0;
		background: none;
		color: var(--muted);
		cursor: grab;
		touch-action: none;
	}
	.handle:active {
		cursor: grabbing;
	}
	.handle:hover,
	.handle:focus-visible {
		background: var(--paper-low);
		color: var(--ink-soft);
	}
	.close {
		position: absolute;
		top: 0.2rem;
		right: 0.35rem;
		z-index: 1;
		display: grid;
		place-items: center;
		width: 1.6rem;
		height: 1.6rem;
		border: 0;
		border-radius: 8px;
		background: none;
		color: var(--muted);
		cursor: pointer;
	}
	.close:hover {
		background: var(--paper-low);
		color: var(--ink);
	}
	.keys {
		flex: 1;
		min-height: 0;
		container-type: size;
	}
	.corner {
		position: absolute;
		right: 2px;
		bottom: 2px;
		width: 22px;
		height: 22px;
		padding: 0;
		border: 0;
		border-radius: 0 0 14px;
		background: linear-gradient(
			135deg,
			transparent 45%,
			var(--line-strong) 45% 52%,
			transparent 52% 62%,
			var(--line-strong) 62% 69%,
			transparent 69%
		);
		cursor: nwse-resize;
		touch-action: none;
	}
</style>
