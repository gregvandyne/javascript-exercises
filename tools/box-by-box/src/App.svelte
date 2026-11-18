<script lang="ts">
	// Box by Box. Opened with an activity (a student link, or a lesson step) it goes straight to the player for it;
	// otherwise it asks who's playing: a teacher goes on to their list of activities, a student to a class code or
	// practising alone.
	import { nav, go, goBack, show } from '$lib/nav.svelte';
	import { openedSet } from '$lib/oomba';
	import { parseItem, kindInfo } from '$lib/logic';
	import { adopt } from '$lib/activities.svelte';
	import Home from './pages/Home.svelte';
	import Start from './pages/Start.svelte';
	import Student from './pages/Student.svelte';
	import { practiceProblems } from '$lib/practice';
	import Editor from './pages/Editor.svelte';
	import Player from './pages/Player.svelte';
	import About from './pages/About.svelte';

	const opened = openedSet();
	if (opened === 'missing') nav.view = { name: 'invalid' };
	else if (opened) {
		const p = parseItem(opened.item);
		nav.view = p
			? { name: 'play', activity: p, title: kindInfo(p.kind).title, from: 'link', setId: opened.id, mine: opened.mine, item: opened.item }
			: { name: 'invalid' };
	}

	function editOwn() {
		const v = nav.view;
		if (v.name !== 'play' || !v.setId) return;
		const a = adopt(v.setId, v.activity, v.item);
		show({ name: 'home' });
		go({ name: 'edit', id: a.id });
	}
</script>

{#if nav.view.name === 'start'}
	<Start />
{:else if nav.view.name === 'student'}
	<Student />
{:else if nav.view.name === 'home'}
	<Home />
{:else if nav.view.name === 'edit'}
	{#key nav.view.id}
		<Editor id={nav.view.id} />
	{/key}
{:else if nav.view.name === 'play'}
	{#key nav.view}
		<Player
			activity={nav.view.activity}
			title={nav.view.title}
			preview={nav.view.from === 'editor'}
			extra={nav.view.from === 'editor'
				? { label: '← Back to the editor', onclick: goBack }
				: nav.view.from === 'practice'
					? { label: '← Practice', onclick: goBack }
					: nav.view.from === 'code'
						? { label: '← Back', onclick: goBack }
						: nav.view.mine
							? { label: 'Edit this activity', onclick: editOwn }
							: undefined}
			fresh={nav.view.practice ? () => practiceProblems(nav.view.practice!.kind, nav.view.practice!.hard) : undefined}
			againLabel={nav.view.practice ? '5 new problems' : undefined}
		/>
	{/key}
{:else if nav.view.name === 'invalid'}
	<main class="broken">
		<h1>This link doesn’t open an activity</h1>
		<p>Ask your teacher for the link again.</p>
	</main>
{:else}
	<About />
{/if}

<style>
	.broken {
		max-width: 32rem;
		margin: 4rem auto;
		padding: 1.5rem;
		border: 2px solid var(--line);
		border-radius: var(--radius-lg);
		background: var(--paper);
	}
	h1 {
		margin: 0;
		font-size: 1.5rem;
		font-weight: 800;
	}
	p {
		margin: 0.5rem 0 0;
		color: var(--ink-soft);
	}
</style>
