<script lang="ts">
	// A setting that is on or off, with an (i) that explains it on hover or focus.
	import type { Snippet } from 'svelte';
	import { Info } from '@lucide/svelte';
	let { label, checked, onchange, children }: { label: string; checked: boolean; onchange: (v: boolean) => void; children: Snippet } = $props();
	const uid = $props.id();
</script>

<div class="row">
	<span class="name" id="{uid}-label">{label}</span>
	<span class="info-wrap">
		<button type="button" class="info" aria-label="What {label} does" aria-describedby="{uid}-info"><Info size={16} aria-hidden="true" /></button>
		<span class="tip" role="tooltip" id="{uid}-info">{@render children()}</span>
	</span>
	<button type="button" role="switch" class="switch" aria-checked={checked} aria-labelledby="{uid}-label" onclick={() => onchange(!checked)}
		><span class="knob" aria-hidden="true"></span></button
	>
</div>

<style>
	.row {
		position: relative;
		display: flex;
		align-items: center;
		gap: 0.3rem;
	}
	.name {
		font-size: 0.95rem;
		font-weight: 800;
	}
	.info-wrap {
		margin-right: auto;
	}
	.info {
		display: grid;
		place-items: center;
		width: 28px;
		height: 28px;
		border: 0;
		border-radius: 50%;
		background: none;
		color: var(--muted);
		cursor: pointer;
	}
	.info:hover,
	.info:focus-visible {
		background: var(--paper-low);
		color: var(--ink);
	}
	.tip {
		position: absolute;
		top: calc(100% + 6px);
		left: 0;
		right: 0;
		z-index: 20;
		display: none;
		padding: 0.6rem 0.75rem;
		border: 2px solid var(--line);
		border-radius: 12px;
		background: var(--paper);
		color: var(--ink-soft);
		font-size: 0.84rem;
		font-weight: 400;
		line-height: 1.4;
		pointer-events: none;
		box-shadow: 0 8px 24px rgb(20 20 20 / 0.14);
	}
	.info-wrap:hover .tip,
	.info:focus-visible + .tip {
		display: block;
	}
	.switch {
		position: relative;
		flex: none;
		width: 44px;
		height: 26px;
		padding: 0;
		border: 0;
		border-radius: 999px;
		background: #b9b4a3;
		cursor: pointer;
		transition: background 0.15s;
	}
	.switch[aria-checked='true'] {
		background: var(--oomba-green-press);
	}
	.knob {
		position: absolute;
		top: 3px;
		left: 3px;
		width: 20px;
		height: 20px;
		border-radius: 50%;
		background: #fff;
		box-shadow: 0 1px 2px rgb(20 20 20 / 0.25);
		transition: transform 0.15s;
	}
	.switch[aria-checked='true'] .knob {
		transform: translate(18px);
	}
	@media (prefers-reduced-motion: reduce) {
		.switch,
		.knob {
			transition: none;
		}
	}
</style>
