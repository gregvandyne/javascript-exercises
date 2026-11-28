<script lang="ts">
	// Save on the activity's own form: the same save as Share's (the problems and support on Oomba, for a link and a class
	// code), so a teacher doesn't have to open Share to save. Share then shows the link. School staff can assign it to a
	// class from here once it is saved; opened from an Assign button (assignFirst), "Save and assign" comes first, with a
	// plain Save beside it (audit 4: a fresh editor had no way to save without assigning). An activity students may
	// already have asks first (saveMindful: for everyone, or as a copy).
	import { t } from './i18n';
	import { Check, GraduationCap, Save } from '@lucide/svelte';
	import { isShared, saveMindful, type Activity } from './activities.svelte';
	import { assign, assignFirst, canAssign, isGuest, isPreview } from './oomba';
	import { go, show } from './nav.svelte';
	import ConfirmDialog from './ConfirmDialog.svelte';

	let { activity }: { activity: Activity } = $props();

	let saving = $state(false);
	let problem = $state('');
	let dialog = $state<ConfirmDialog>();
	const saved = $derived(isShared(activity));
	const noSave = isPreview() ? t('ui.save.preview') : isGuest() ? t('ui.save.guest') : '';
	const staff = canAssign();
	const andAssign = staff && assignFirst();

	async function save(thenAssign = andAssign) {
		if (saving || saved) return;
		saving = true;
		problem = '';
		const r = await saveMindful(activity, dialog ? (a, b, c) => dialog!.ask(a, b, c) : undefined);
		saving = false;
		if (r.error) problem = r.error;
		const id = r.copy ? r.copy.setId : r.id;
		if (r.copy) {
			show({ name: 'home' });
			go({ name: 'edit', id: r.copy.id });
		}
		if (!r.error && id && thenAssign) toClass(id);
	}
	function toClass(id = activity.setId) {
		if (id && !assign(id)) problem = t('ui.assign.tapAgain');
	}
</script>

<div class="save-bar">
	{#if noSave}
		<p class="note">{noSave}</p>
	{:else}
		<button type="button" class="btn-primary" disabled={saving || saved} onclick={() => save()}>
			{#if saved}<Check size={16} aria-hidden="true" /> {t('ui.share.saved')}{:else if saving}{t('ui.saving')}{:else}<Save size={16} aria-hidden="true" /> {andAssign ? t('ui.ed.saveAssign') : activity.setId ? t('ui.share.saveChanges') : t('ui.ed.save')}{/if}
		</button>
		{#if andAssign && !saved}
			<button type="button" class="btn-ghost save-only" disabled={saving} onclick={() => save(false)}
				><Save size={16} aria-hidden="true" /> {activity.setId ? t('ui.share.saveChanges') : t('ui.ed.save')}</button
			>
		{/if}
		{#if staff && saved}
			<button type="button" class="btn-ghost" onclick={() => toClass()}><GraduationCap size={16} aria-hidden="true" /> {t('ui.share.assign')}</button>
		{/if}
		<p class="note" aria-live="polite">{saved ? t(staff ? 'ui.ed.savedHintStaff' : 'ui.ed.savedHint') : t(andAssign ? 'ui.ed.saveAssignHint' : 'ui.ed.saveHint')}</p>
		{#if problem}<p class="note bad" role="alert">{problem}</p>{/if}
	{/if}
</div>
<ConfirmDialog bind:this={dialog} />

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
