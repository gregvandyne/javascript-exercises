<script lang="ts">
	// The number keys: 7 8 9 / 4 5 6 / 1 2 3 / 0 and Erase. They never take the focus, so it stays in the box.
	import { Delete } from '@lucide/svelte';
	let {
		ontap,
		disabled = false,
		wide = false,
		fill = false,
		point = false
	}: { ontap: (key: string) => void; disabled?: boolean; wide?: boolean; fill?: boolean; point?: boolean } = $props();
</script>

<div class="keypad" class:wide class:fill class:point role="group" aria-label="Keypad">
	{#each ['7', '8', '9', '4', '5', '6', '1', '2', '3', '0', ...(point ? ['.'] : [])] as k (k)}
		<button type="button" class="key" class:zero={k === '0'} aria-label={k === '.' ? 'Decimal point' : undefined} {disabled} onpointerdown={(e) => e.preventDefault()} onclick={() => ontap(k)}
			>{k}</button
		>
	{/each}
	<button
		type="button"
		class="key erase"
		aria-label="Erase"
		{disabled}
		onpointerdown={(e) => e.preventDefault()}
		onclick={() => ontap('')}><Delete size={22} aria-hidden="true" /></button
	>
</div>

<style>
	.keypad {
		display: grid;
		grid-template-columns: repeat(3, 3.6rem);
		gap: 0.45rem;
	}
	.keypad.wide {
		grid-template-columns: repeat(6, 1fr);
		width: 100%;
	}
	.keypad.fill {
		grid-template-columns: repeat(3, 1fr);
		grid-template-rows: repeat(4, 1fr);
		width: 100%;
		height: 100%;
	}
	.key {
		display: grid;
		place-items: center;
		height: 3.6rem;
		border: 2px solid var(--line);
		border-radius: 12px;
		background: var(--paper);
		color: var(--ink);
		font: inherit;
		font-size: 1.5rem;
		font-weight: 800;
		touch-action: manipulation;
		cursor: pointer;
	}
	.fill .key {
		height: auto;
		font-size: clamp(1.2rem, min(11cqw, 9cqh), 3.4rem);
	}
	.wide .key {
		height: 2.9rem;
	}
	.key:hover:not(:disabled) {
		border-color: var(--line-strong);
		background: var(--box-wash);
	}
	.key:active:not(:disabled) {
		transform: scale(0.96);
	}
	.key:disabled {
		color: #b9b4a3;
		cursor: default;
	}
	.key.zero {
		grid-column: span 2;
	}
	.point .key.zero {
		grid-column: span 1;
	}
	.wide .key.zero {
		grid-column: span 1;
	}
	.key.erase {
		color: var(--muted);
	}
</style>
