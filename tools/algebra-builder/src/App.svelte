<script lang="ts">
	// Algebra Builder: the screens the original app had as pages, and Oomba's question sets. Opened with a problem (an
	// activity link or a lesson step) it goes straight to that problem, as the original's student links did; opened
	// with a question set's link, straight to its first question; otherwise it asks who's playing: a teacher goes on to
	// the gallery of activities, a student to a class code or practising alone.
	import { nav } from '$lib/nav.svelte';
	import { openedSet, openedWith } from '$lib/oomba';
	import Home from './pages/Home.svelte';
	import Start from './pages/Start.svelte';
	import Student from './pages/Student.svelte';
	import Play from './pages/Play.svelte';
	import About from './pages/About.svelte';
	import SetBuilder from './pages/SetBuilder.svelte';
	import SetPlay from './pages/SetPlay.svelte';
	import Setup from '$lib/Setup.svelte';

	const set = openedSet();
	const link = openedWith();
	if (set === 'missing') nav.view = { name: 'set-missing' };
	else if (set) nav.view = { name: 'set-play', items: set.items, from: 'link', id: set.id, mine: set.mine };
	else if (link) nav.view = { name: 'play', ...link, from: 'link' };

	$effect(() => {
		if (nav.view.name !== 'play' && nav.view.name !== 'set-play') document.title = 'Algebra Builder';
	});
</script>

{#if nav.view.name === 'start'}
	<Start />
{:else if nav.view.name === 'student'}
	<Student />
{:else if nav.view.name === 'home'}
	<Home />
{:else if nav.view.name === 'setup'}
	{#key nav.view}
		<Setup activity={nav.view.activity} />
	{/key}
{:else if nav.view.name === 'play'}
	<Play type={nav.view.type} p={nav.view.p} start={nav.view.start} live={nav.view.live} from={nav.view.from} />
{:else if nav.view.name === 'set'}
	<SetBuilder />
{:else if nav.view.name === 'set-play'}
	{#key nav.view}
		<SetPlay items={nav.view.items} from={nav.view.from} id={nav.view.id} mine={nav.view.mine} practice={nav.view.practice} />
	{/key}
{:else if nav.view.name === 'set-missing'}
	<main class="missing">
		<h1>This question set isn’t here any more</h1>
		<p>It may have been removed. Ask your teacher for the link again.</p>
	</main>
{:else}
	<About />
{/if}

<style>
	.missing {
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
</style>
