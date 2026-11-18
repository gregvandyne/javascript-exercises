<script lang="ts">
	import { t } from './i18n';
	// A number with − and + beside it (the ranges and How many). Typing commits after a pause, on Enter or on leaving;
	// the arrow keys step it (Shift: by 10). It is kept within min and max; an empty box goes back to the value.
	import { tick } from 'svelte';
	import { Minus, Plus } from '@lucide/svelte';

	let {
		label,
		value,
		min,
		max,
		digits,
		onchange
	}: { label: string; value: number; min: number; max: number; digits?: number; onchange: (v: number) => void } = $props();

	let input = $state<HTMLInputElement>();
	let timer: ReturnType<typeof setTimeout>;
	const clamp = (v: number) => Math.max(min, Math.min(max, v));

	function commit(v: number) {
		clearTimeout(timer);
		const n = clamp(Number.isFinite(v) ? Math.round(v) : value);
		if (input) input.value = String(n);
		if (n !== value) onchange(n);
		tick().then(() => {
			if (input) input.value = String(value);
		});
	}
	function typing() {
		if (!input) return;
		input.value = input.value.replace(/\D/g, '');
		const n = Number(input.value);
		clearTimeout(timer);
		if (input.value && n >= min && n <= max) timer = setTimeout(() => commit(n), 450);
	}
	function key(e: KeyboardEvent) {
		if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
			e.preventDefault();
			const by = (e.shiftKey ? 10 : 1) * (e.key === 'ArrowUp' ? 1 : -1);
			commit(Number(input?.value || value) + by);
			input?.select();
		} else if (e.key === 'Enter') {
			commit(Number(input?.value));
			input?.select();
		}
	}
</script>

<div class="stepper" role="group" aria-label={label}>
	<button type="button" tabindex="-1" aria-label={t('ui.stepper.less', { x: label })} disabled={value <= min} onclick={() => commit(value - 1)}
		><Minus size={15} aria-hidden="true" /></button
	>
	<input
		bind:this={input}
		type="text"
		inputmode="numeric"
		autocomplete="off"
		aria-label={label}
		{value}
		style:width="{(digits ?? String(max).length) + 0.8}ch"
		onfocus={(e) => e.currentTarget.select()}
		oninput={typing}
		onkeydown={key}
		onblur={() => input && commit(Number(input.value || value))}
	/>
	<button type="button" tabindex="-1" aria-label={t('ui.stepper.more', { x: label })} disabled={value >= max} onclick={() => commit(value + 1)}
		><Plus size={15} aria-hidden="true" /></button
	>
</div>

<style>
	.stepper {
		display: inline-flex;
		align-items: stretch;
		height: 2.4rem;
		overflow: hidden;
		border: 2px solid var(--line-strong);
		border-radius: 999px;
		background: var(--paper);
	}
	.stepper:focus-within {
		border-color: var(--accent);
		box-shadow: 0 0 0 3px var(--accent-wash);
	}
	button {
		display: grid;
		place-items: center;
		width: 2.1rem;
		padding: 0;
		border: 0;
		background: none;
		color: var(--ink-soft);
		cursor: pointer;
	}
	button:hover:not(:disabled) {
		background: var(--accent-wash);
		color: var(--accent-dark);
	}
	button:disabled {
		color: #c4bfae;
		cursor: default;
	}
	input {
		box-sizing: content-box;
		min-width: 2.4rem;
		padding: 0 0.25rem;
		border: 0;
		border-inline: 1px solid var(--line);
		background: none;
		color: var(--ink);
		font: inherit;
		font-size: 1rem;
		font-weight: 800;
		font-variant-numeric: tabular-nums;
		text-align: center;
	}
	input:focus {
		outline: none;
	}
</style>
