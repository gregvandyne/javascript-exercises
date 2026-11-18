<script lang="ts">
	// About: what the game is, how a problem travels, and the credit for the app it is adapted from (Apache-2.0: the
	// license and what was changed are in tools/algebra-builder/LICENSE and NOTICE).
	import Logo from '$lib/Logo.svelte';
	import Footer from '$lib/Footer.svelte';
	import { goBack } from '$lib/nav.svelte';
</script>

<div class="page">
	<header class="bar">
		<button type="button" class="btn-ghost" onclick={goBack}>← Back</button>
		<h1><Logo size={32} /> About Algebra Builder</h1>
	</header>

	<section class="card">
		<h2>What it is</h2>
		<p>
			Students multiply and factor polynomials, and solve equations, with algebra tiles on a whiteboard. A teacher
			types one problem and shares it as an activity link; there are no accounts in the game, and the problem
			travels in the link.
		</p>
	</section>

	<section class="card">
		<h2>Your privacy</h2>
		<p>
			The game keeps nothing about you. A problem is carried in its link, and the tiles you move stay on your
			screen.
		</p>
	</section>

	<section class="card">
		<h2>Credits</h2>
		<p>
			Adapted for Oomba from Algebra Tiles by teacher.dev, made at the EdTech-a-thon 2026, and used under the
			Apache License 2.0.
		</p>
	</section>

	<Footer />
</div>

<style>
	.page {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		min-height: 100dvh;
		max-width: 46rem;
		margin: 0 auto;
		padding: 1.5rem 1rem 1rem;
	}
	.bar {
		display: flex;
		align-items: center;
		gap: 1rem;
		flex-wrap: wrap;
	}
	h1 {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		margin: 0;
		font-size: 1.8rem;
		font-weight: 800;
	}
	.card {
		background: var(--paper);
		border: 2px solid var(--line);
		border-radius: var(--radius-lg);
		padding: 1.1rem 1.25rem;
	}
	h2 {
		margin: 0 0 0.4rem;
		font-size: 1.15rem;
		font-weight: 800;
	}
	p {
		margin: 0;
		color: var(--ink-soft);
		line-height: 1.5;
	}
</style>
