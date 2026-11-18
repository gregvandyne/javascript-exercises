<script lang="ts">
	// The speaker button: reads the step's question aloud with the platform's AI voice, on a tap (tap again: stop). It
	// shows only once the platform says the AI voice reads every line, and a line it doesn't read after all hides it
	// again: never the device's voice, and never by itself (docs/decisions.md "The Big Divide: read aloud").
	import { Volume2, Square } from '@lucide/svelte';
	import { LANG, t } from './i18n';
	import { readAloud, voiceReady } from './oomba';

	let { lines }: { lines: string[] } = $props();
	let ready = $state(false);
	let reading = $state(false);
	let stop: (() => void) | null = null;
	const key = $derived(lines.join('\n'));
	let timer: ReturnType<typeof setTimeout> | undefined;

	$effect(() => {
		const k = key;
		const asked = lines;
		// a new question: stop the old one, and ask whether this one gets the AI voice (a moment later, so a run of
		// steps the page writes itself doesn't ask for each)
		halt();
		ready = false;
		clearTimeout(timer);
		if (!k) return;
		timer = setTimeout(async () => {
			const ok = await voiceReady(asked, LANG);
			if (k === key) ready = ok;
		}, 250);
		return () => clearTimeout(timer);
	});
	function halt() {
		if (stop) stop();
		stop = null;
		reading = false;
	}
	function toggle() {
		if (reading) return halt();
		reading = true;
		stop = readAloud(lines, LANG, (ok) => {
			stop = null;
			reading = false;
			if (!ok) ready = false;
		});
		if (!stop && reading) {
			reading = false;
			ready = false;
		}
	}
</script>

{#if ready}
	<button
		type="button"
		class="speak"
		class:reading
		aria-pressed={reading}
		aria-label={reading ? t('ui.speak.stop') : t('ui.speak.read')}
		title={reading ? t('ui.speak.stop') : t('ui.speak.read')}
		onpointerdown={(e) => e.preventDefault()}
		onclick={toggle}
	>
		{#if reading}<Square size={16} aria-hidden="true" />{:else}<Volume2 size={19} aria-hidden="true" />{/if}
	</button>
{/if}

<style>
	.speak {
		flex: none;
		display: grid;
		place-items: center;
		width: 2.5rem;
		height: 2.5rem;
		padding: 0;
		border: 2px solid var(--line-strong);
		border-radius: 999px;
		background: var(--paper);
		color: var(--ink);
		cursor: pointer;
		touch-action: manipulation;
	}
	.speak:hover {
		background: var(--box-wash);
	}
	.speak.reading {
		border-color: var(--box);
		background: var(--box-wash);
		color: var(--box-dark);
		animation: pulse 1.2s ease-in-out infinite;
	}
	@keyframes pulse {
		50% {
			box-shadow: 0 0 0 5px color-mix(in srgb, var(--box) 25%, transparent);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.speak.reading {
			animation: none;
		}
	}
</style>
