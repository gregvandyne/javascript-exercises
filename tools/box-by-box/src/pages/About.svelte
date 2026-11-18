<script lang="ts">
	// The About page.
	import { NAME } from '$lib/name';
	import Logo from '$lib/Logo.svelte';
	import Footer from '$lib/Footer.svelte';
	import { goBack } from '$lib/nav.svelte';
	$effect(() => {
		document.title = `About · ${NAME}`;
	});
</script>

<div class="page">
	<header class="bar">
		<button type="button" class="btn-ghost" onclick={goBack}>← Back</button>
		<h1><Logo size={32} /> About {NAME}</h1>
	</header>
	<p class="lede">Practice with the standard algorithms for long division and multiplication, one digit at a time.</p>

	<section class="card">
		<h2>What it is</h2>
		<p>
			Students work each problem on graph paper, box by box: divide, multiply, subtract and bring down, or multiply
			each digit, carry and add. A teacher picks the problems and how much help students get, from watching the page
			work a problem to doing it on their own, and shares the activity as a link or a QR code.
		</p>
	</section>

	<section class="card">
		<h2>Your privacy</h2>
		<p>
			A teacher’s activities are kept with their Oomba account. A shared activity is saved on Oomba with just its
			problems and the support chosen, not its title. Nothing a student types is saved or sent: when they finish, the
			game reports only how many problems they got right.
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
		flex-wrap: wrap;
		align-items: center;
		gap: 1rem;
	}
	h1 {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		margin: 0;
		font-size: 1.8rem;
		font-weight: 800;
	}
	.lede {
		margin: 0;
		color: var(--muted);
		line-height: 1.5;
	}
	.card {
		padding: 1.1rem 1.25rem;
		border: 2px solid var(--line);
		border-radius: var(--radius-lg);
		background: var(--paper);
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
