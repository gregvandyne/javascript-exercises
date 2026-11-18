<script lang="ts">
	// Who's playing? Opened without a link or a lesson, the game asks first: a teacher goes on to the gallery (making
	// problems and question sets to share), a student to their own screen (a class code, or practicing alone).
	import { GraduationCap, Backpack } from '@lucide/svelte';
	import { go } from '$lib/nav.svelte';
	import Logo from '$lib/Logo.svelte';
	import Footer from '$lib/Footer.svelte';
	import ActivityPicture from '$lib/ActivityPicture.svelte';
</script>

<div class="page">
	<main>
		<p class="brand"><Logo size={44} /> Algebra Builder</p>
		<h1>Who’s playing?</h1>
		<div class="paths">
			<button type="button" class="path student" onclick={() => go({ name: 'student' })}>
				<span class="icon"><Backpack size={30} /></span>
				<span class="who">I’m a student</span>
				<span class="what">Type the code your teacher gave you, or practice on your own.</span>
				<span class="go">Let’s go ▸</span>
			</button>
			<button type="button" class="path teacher" onclick={() => go({ name: 'home' })}>
				<span class="icon"><GraduationCap size={30} /></span>
				<span class="who">I’m a teacher</span>
				<span class="what">Make problems and question sets, share them with a link or a code, and assign them to a class.</span>
				<span class="go">Set up ▸</span>
			</button>
		</div>
		<div class="picture" aria-hidden="true"><ActivityPicture activity="solve" scale={0.42} /></div>
	</main>
	<Footer />
</div>

<style>
	.page {
		display: flex;
		flex-direction: column;
		min-height: 100dvh;
		max-width: 60rem;
		margin: 0 auto;
		padding: 2rem 1.25rem 1.25rem;
	}
	main {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		text-align: center;
	}
	.brand {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		color: var(--accent);
		font-size: 1.9rem;
		font-weight: 800;
	}
	h1 {
		margin-top: 1.4rem;
		font-size: 2.2rem;
		font-weight: 800;
		line-height: 1.1;
	}
	.paths {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 1rem;
		width: 100%;
		margin-top: 1.6rem;
	}
	.path {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 0.45rem;
		min-height: 12rem;
		padding: 1.4rem 1.3rem;
		border: 2px solid var(--line);
		border-radius: 20px;
		background: var(--paper);
		box-shadow: 0 4px 0 var(--line);
		color: var(--ink);
		font: inherit;
		text-align: left;
		cursor: pointer;
		transition:
			transform 0.15s,
			border-color 0.15s,
			box-shadow 0.15s;
	}
	.path:hover {
		transform: translateY(-2px);
		border-color: var(--line-strong);
	}
	.path:active {
		transform: translateY(2px);
		box-shadow: 0 1px 0 var(--line);
	}
	.icon {
		display: grid;
		place-items: center;
		width: 3.2rem;
		height: 3.2rem;
		border: 2px solid var(--ink);
		border-radius: 14px;
	}
	.student .icon {
		background: #fff1cc;
	}
	.teacher .icon {
		background: var(--accent-wash);
	}
	.who {
		margin-top: 0.3rem;
		font-size: 1.45rem;
		font-weight: 800;
	}
	.what {
		color: var(--muted);
		line-height: 1.4;
	}
	.go {
		margin-top: auto;
		padding-top: 0.4rem;
		color: var(--accent);
		font-weight: 800;
	}
	.picture {
		margin-top: 1.8rem;
		opacity: 0.9;
	}
	@media (max-width: 640px) {
		.page {
			padding-top: 1.4rem;
		}
		h1 {
			margin-top: 1rem;
			font-size: 1.8rem;
		}
		.paths {
			grid-template-columns: minmax(0, 1fr);
		}
		.path {
			min-height: 0;
		}
		.picture {
			display: none;
		}
	}
</style>
