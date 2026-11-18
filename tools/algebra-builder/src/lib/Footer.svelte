<script lang="ts">
	// The teacher pages' footer: what the game is, and the About screen (where the original's credits are).
	import { go } from '$lib/nav.svelte';
</script>

<footer>
	<span>Algebra Builder</span>
	<button type="button" class="link" onclick={() => go({ name: 'about' })}>About</button>
</footer>

<style>
	footer {
		margin-top: auto;
		display: flex;
		justify-content: center;
		align-items: center;
		gap: 1rem;
		padding: 1rem 0 0.5rem;
		border-top: 2px solid var(--line);
		color: var(--muted);
		font-size: 0.85rem;
		font-weight: 600;
	}
	.link {
		background: none;
		border: 0;
		padding: 0.4rem 0.2rem;
		font: inherit;
		color: var(--link);
		text-decoration: underline;
		text-underline-offset: 3px;
		cursor: pointer;
	}
</style>
