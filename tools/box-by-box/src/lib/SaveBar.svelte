<script lang="ts">
	// Save on the activity's own form: the same save as Share's (the problems and support on Oomba, for a link and a class
	// code), so a teacher doesn't have to open Share to save. Share then shows the link.
	import { t } from './i18n';
	import { Check, Save } from '@lucide/svelte';
	import { isShared, shareActivity, type Activity } from './activities.svelte';
	import { isGuest, isPreview } from './oomba';

	let { activity }: { activity: Activity } = $props();

	let saving = $state(false);
	let problem = $state('');
	const saved = $derived(isShared(activity));
	const noSave = isPreview() ? t('ui.save.preview') : isGuest() ? t('ui.save.guest') : '';

	async function save() {
		if (saving || saved) return;
		saving = true;
		problem = '';
		const r = await shareActivity(activity);
		saving = false;
		if (r.error) problem = r.error;
	}
</script>

<div class="save-bar">
	{#if noSave}
		<p class="note">{noSave}</p>
	{:else}
		<button type="button" class="btn-primary" disabled={saving || saved} onclick={save}>
			{#if saved}<Check size={16} aria-hidden="true" /> {t('ui.share.saved')}{:else if saving}{t('ui.saving')}{:else}<Save size={16} aria-hidden="true" /> {activity.setId ? t('ui.share.saveChanges') : t('ui.ed.save')}{/if}
		</button>
		<p class="note" aria-live="polite">{saved ? t('ui.ed.savedHint') : t('ui.ed.saveHint')}</p>
		{#if problem}<p class="note bad" role="alert">{problem}</p>{/if}
	{/if}
</div>

<style>
	.save-bar {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5rem 1rem;
		margin-top: 1.25rem;
		padding-top: 1rem;
		border-top: 2px solid var(--line);
	}
	.note {
		flex: 1 1 14rem;
		margin: 0;
		color: var(--muted);
		font-size: 0.95rem;
		line-height: 1.4;
	}
	.note.bad {
		flex-basis: 100%;
		color: var(--bad, #be3329);
	}
</style>
