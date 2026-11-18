<script lang="ts">
	// One problem, from an activity link or a lesson step (lib/oomba.ts openedWith), or from "Try it as a student" on
	// a setup page. Nothing is stored anywhere. A student's link has no way back to the gallery, as before; a teacher
	// trying their problem gets a Back button to their setup page.
	import ActivityBoard from '$lib/Activity.svelte';
	import { prettyText, readProblem, type Activity } from '$lib/algebra';
	import type { Start } from '$lib/settings';
	import { go, goBack } from '$lib/nav.svelte';

	let { type, p, start, live, from }: { type: Activity; p: string; start: Start; live: boolean; from: 'link' | 'setup' } =
		$props();

	const NAMES: Record<Activity, string> = {
		multiply: 'Multiply',
		factor: 'Factor',
		solve: 'Solve'
	};
	const problem = $derived(readProblem(type, p));
	const title = $derived(`${NAMES[type]} ${problem.ok ? prettyText(problem.given) : ''}`);
	$effect(() => {
		document.title = `${title} · Algebra Builder`;
	});
</script>

{#if problem.ok}
	{#key `${type}|${p}|${start}|${live}`}
		<ActivityBoard {problem} {start} {live} />
	{/key}
	{#if from === 'setup'}
		<button type="button" class="btn-ghost try-back" onclick={goBack}>← Back to setup</button>
	{/if}
{:else}
	<main class="broken">
		<h1>This link doesn’t have a problem we can build</h1>
		<p>{problem.reason}</p>
		<p>Ask your teacher for the link again.</p>
		<button type="button" class="btn-ghost" onclick={() => go({ name: 'home' })}>Make a problem</button>
	</main>
{/if}

<style>
	.broken {
		max-width: 34rem;
		margin: 4rem auto;
		padding: 1.5rem;
		border: 2px solid var(--line);
		border-radius: var(--radius-lg);
		background: var(--paper);
	}
	h1 {
		font-size: 1.4rem;
		font-weight: 800;
	}
	p {
		margin-top: 0.6rem;
		color: var(--muted);
	}
	button {
		margin-top: 1rem;
	}
	.try-back {
		position: fixed;
		left: 16px;
		top: 16px;
		margin: 0;
		z-index: 30;
		box-shadow: var(--shadow);
	}
	@media (max-width: 1299px) {
		/* Above the toolbar, so it never covers the problem's bar or the tiles. */
		.try-back {
			top: auto;
			bottom: 170px;
		}
	}
</style>
