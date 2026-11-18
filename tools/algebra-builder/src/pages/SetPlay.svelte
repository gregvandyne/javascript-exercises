<script lang="ts">
	// Oomba: a question set, one question after another on the whiteboard ("2 of 5" in the bar). Each question is
	// complete when its last step's Check passes; then Next question. The last one finishes the set: the cheer, the
	// confetti and (once) a lesson step done. A teacher trying their set gets a way back to it; a teacher opening
	// their own set's link can change it.
	import ActivityBoard from '$lib/Activity.svelte';
	import { prettyText, readProblem } from '$lib/algebra';
	import { go, goBack, sets } from '$lib/nav.svelte';
	import { complete, questionDone, type Item } from '$lib/oomba';
	import { LEVELS, practiceSet, type Level } from '$lib/practice';
	import { activityInfo } from '$lib/activities';
	import type { Activity } from '$lib/algebra';
	import Logo from '$lib/Logo.svelte';

	let {
		items: given,
		from,
		id,
		mine,
		practice
	}: {
		items: Item[];
		from: 'link' | 'set' | 'code' | 'practice';
		id?: string;
		mine?: boolean;
		practice?: { activity: Activity; level: Level };
	} = $props();
	// svelte-ignore state_referenced_locally
	let items = $state(given);
	/** Practising alone: a fresh set of the same activity and level (never ones they've had lately). */
	function more() {
		if (!practice) return;
		const fresh = practiceSet(practice.activity, practice.level);
		if (!fresh.length) return;
		items = fresh;
		at = 0;
		finished = false;
		window.scrollTo(0, 0);
	}
	const practiceName = $derived(
		practice ? `${activityInfo(practice.activity).name}, ${LEVELS.find((l) => l.level === practice.level)?.name}` : ''
	);

	let at = $state(0);
	let finished = $state(false);
	const item = $derived(items[at]);
	const problem = $derived(readProblem(item.a, item.p));
	const last = $derived(at === items.length - 1);

	$effect(() => {
		document.title = finished ? 'Question set · Algebra Builder' : `Question ${at + 1} of ${items.length} · Algebra Builder`;
	});

	function done(bar: HTMLElement | undefined) {
		if (last) complete();
		else questionDone(bar);
	}
	function next() {
		if (last) finished = true;
		else at += 1;
		window.scrollTo(0, 0);
	}
	function again() {
		at = 0;
		finished = false;
	}
	function editSet() {
		sets.draft = { items: items.map((i) => ({ ...i })), id: id ?? null, saved: true };
		go({ name: 'set' });
	}
</script>

{#if finished}
	<main class="finish">
		<Logo size={56} />
		<h1>All {items.length} questions done!</h1>
		{#if practice}<p class="what">{practiceName}</p>{/if}
		<ol class="list">
			{#each items as it, i (i)}
				<li><span class="tick">✓</span> {prettyText(it.p)}</li>
			{/each}
		</ol>
		<div class="buttons">
			{#if practice}
				<button type="button" class="btn-primary" onclick={more}>{items.length} new problems ▸</button>
				<button type="button" class="btn-ghost" onclick={goBack}>Practise something else</button>
			{:else}
				<button type="button" class="btn-primary" onclick={again}>Do them again</button>
			{/if}
			{#if from === 'code'}
				<button type="button" class="btn-ghost" onclick={goBack}>← Back</button>
			{:else if from === 'set'}
				<button type="button" class="btn-ghost" onclick={goBack}>← Back to the set</button>
			{:else if mine}
				<button type="button" class="btn-ghost" onclick={editSet}>Change this set</button>
			{/if}
		</div>
	</main>
{:else if problem.ok}
	{#key at}
		<ActivityBoard
			{problem}
			start={item.s}
			live={item.l}
			badge="{at + 1} of {items.length}"
			onfinish={done}
			onnext={next}
			nextLabel={last ? 'Finish' : 'Next question'}
		/>
	{/key}
	{#if from === 'set'}
		<button type="button" class="btn-ghost corner" onclick={goBack}>← Back to the set</button>
	{:else if from === 'practice' || from === 'code'}
		<button type="button" class="btn-ghost corner" onclick={goBack}>← {from === 'practice' ? 'Practice' : 'Back'}</button>
	{:else if mine}
		<button type="button" class="btn-ghost corner" onclick={editSet}>Change this set</button>
	{/if}
{:else}
	<main class="finish">
		<h1>Question {at + 1} can’t be built</h1>
		<p>{problem.reason}</p>
		<div class="buttons">
			<button type="button" class="btn-primary" onclick={next}>{last ? 'Finish' : 'Skip to the next question'}</button>
		</div>
	</main>
{/if}

<style>
	.finish {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.75rem;
		max-width: 30rem;
		margin: 4rem auto;
		padding: 2rem 1.5rem;
		border: 2px solid var(--line);
		border-radius: var(--radius-lg);
		background: var(--paper);
		box-shadow: var(--shadow);
		text-align: center;
	}
	h1 {
		font-size: 1.6rem;
		font-weight: 800;
	}
	p {
		color: var(--muted);
	}
	.what {
		margin-top: -0.4rem;
		font-weight: 700;
	}
	.list {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: 0.4rem;
		padding: 0;
		list-style: none;
	}
	.list li {
		padding: 0.25rem 0.7rem;
		border-radius: 999px;
		background: var(--accent-wash);
		font-weight: 700;
	}
	.tick {
		color: var(--accent);
	}
	.buttons {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: 0.5rem;
		margin-top: 0.5rem;
	}
	.corner {
		position: fixed;
		left: 16px;
		top: 16px;
		z-index: 30;
		box-shadow: var(--shadow);
	}
	@media (max-width: 1299px) {
		/* Above the toolbar's left end, level with the zoom on its right, so it never covers the problem's bar. */
		.corner {
			top: auto;
			bottom: 6.4rem;
		}
	}
	@media (max-width: 600px) {
		.corner {
			bottom: 170px;
		}
	}
</style>
