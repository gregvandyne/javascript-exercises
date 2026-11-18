<script lang="ts">
	// Algebra Tiles on Oomba: the screens the original app had as pages. Opened with a problem (an activity link or a
	// lesson step), it goes straight to that problem, as the original's student links did; otherwise it starts on the
	// gallery of activities.
	import { nav } from '$lib/nav.svelte';
	import { openedWith } from '$lib/oomba';
	import Home from './pages/Home.svelte';
	import Play from './pages/Play.svelte';
	import About from './pages/About.svelte';
	import Setup from '$lib/Setup.svelte';

	const link = openedWith();
	if (link) nav.view = { name: 'play', ...link, from: 'link' };

	$effect(() => {
		if (nav.view.name !== 'play') document.title = 'Algebra Tiles';
	});
</script>

{#if nav.view.name === 'home'}
	<Home />
{:else if nav.view.name === 'setup'}
	{#key nav.view.activity}
		<Setup activity={nav.view.activity} />
	{/key}
{:else if nav.view.name === 'play'}
	<Play type={nav.view.type} p={nav.view.p} start={nav.view.start} live={nav.view.live} from={nav.view.from} />
{:else}
	<About />
{/if}
