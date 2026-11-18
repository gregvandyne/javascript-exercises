<script lang="ts">
	import { t } from './i18n';
	// The footer of the teacher pages and of the player's start and end screens.
	import { go } from './nav.svelte';
	import { NAME_HERE as NAME } from './i18n';
</script>

<footer>
	<span>{NAME}</span>
	<button type="button" class="link" onclick={() => go({ name: 'about' })}>{t('ui.about')}</button>
</footer>

<style>
	footer {
		margin-top: auto;
		display: flex;
		justify-content: center;
		align-items: center;
		gap: 1rem;
		padding: 2rem 0 0.5rem;
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
