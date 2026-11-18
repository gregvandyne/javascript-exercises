<script lang="ts">
	// Sharing an activity: saved on Oomba (its problems and support, not its title) for a student link and a QR code.
	// Saving again after a change keeps the same link.
	import { Check, Copy, GraduationCap, QrCode } from '@lucide/svelte';
	import { isShared, shareActivity, type Activity } from './activities.svelte';
	import { assign, canAssign, copy, isGuest, isPreview, setLink } from './oomba';
	import { makeQr, qrExtent, qrPath, qrPng } from './qr';

	let { activity }: { activity: Activity } = $props();

	let saving = $state(false);
	let problem = $state('');
	const saved = $derived(isShared(activity));
	const link = $derived(setLink(activity.setId));
	const qr = $derived(link ? makeQr(link) : null);
	const noSave = isPreview() ? 'Student links work in the published game, not in a preview.' : isGuest() ? 'Sign in to Oomba to share your activity.' : '';

	async function save() {
		if (saving || saved) return;
		saving = true;
		problem = '';
		const r = await shareActivity(activity);
		saving = false;
		if (r.error) problem = r.error;
	}

	let copied = $state<'link' | 'qr' | null>(null);
	let timer: ReturnType<typeof setTimeout>;
	function flash(what: 'link' | 'qr') {
		copied = what;
		clearTimeout(timer);
		timer = setTimeout(() => (copied = null), 1500);
	}
	async function copyLink() {
		if (link && (await copy(link))) flash('link');
	}
	async function copyQr() {
		if (!qr) return;
		try {
			const png = await qrPng(qr);
			if (await copy(png)) flash('qr');
		} catch {
			/* no copy */
		}
	}
</script>

<div class="share">
	<h2>Share with students</h2>
	{#if noSave}
		<p class="note">{noSave}</p>
	{:else}
		<button type="button" class="btn-primary wide" disabled={saving || saved} onclick={save}>
			{#if saved}<Check size={16} aria-hidden="true" /> Saved{:else if saving}Saving…{:else if activity.setId}Save changes{:else}Save and get link{/if}
		</button>
		{#if activity.setId && !saved && !saving}
			<p class="note">Saving changes keeps the same link. Students who open it get the new problems.</p>
		{/if}
		{#if problem}<p class="note bad" role="alert">{problem}</p>{/if}
	{/if}

	{#if link}
		<p class="link" title={link}>{link}</p>
		<button type="button" class="btn-primary wide" onclick={copyLink}>
			{#if copied === 'link'}<Check size={16} aria-hidden="true" /> Copied{:else}<Copy size={16} aria-hidden="true" /> Copy link{/if}
		</button>
		{#if canAssign()}
			<button type="button" class="btn-ghost wide" disabled={!saved} onclick={() => activity.setId && assign(activity.setId)}
				><GraduationCap size={16} aria-hidden="true" /> Assign to a class</button
			>
			{#if !saved}<p class="note">Save your changes to assign the activity.</p>{/if}
		{/if}
	{/if}
	<div class="qr">
		{#if qr}
			<svg viewBox="0 0 {qrExtent(qr)} {qrExtent(qr)}" width="168" height="168" role="img" aria-label="QR code for the student link">
				<rect width="100%" height="100%" fill="#fff" />
				<path d={qrPath(qr)} fill="#000" />
			</svg>
			<button type="button" class="btn-ghost" onclick={copyQr}>
				{#if copied === 'qr'}<Check size={16} aria-hidden="true" /> Copied{:else}<Copy size={16} aria-hidden="true" /> Copy QR code{/if}
			</button>
		{:else}
			<div class="qr-waiting"><QrCode size={40} aria-hidden="true" /></div>
			<p class="note">{noSave && isPreview() ? 'There’s no student link in a preview.' : 'The QR code and the link appear here once the activity is saved.'}</p>
		{/if}
	</div>
</div>

<style>
	.share {
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
	}
	h2 {
		margin: 0 0 0.2rem;
		font-size: 1.1rem;
		font-weight: 800;
	}
	.wide {
		width: 100%;
	}
	.note {
		margin: 0;
		color: var(--muted);
		font-size: 0.88rem;
		line-height: 1.4;
	}
	.note.bad {
		color: var(--bad);
		font-weight: 600;
	}
	.link {
		margin: 0;
		padding: 0.55rem 0.75rem;
		overflow: hidden;
		border-radius: 10px;
		background: var(--ground);
		font-family: ui-monospace, monospace;
		font-size: 0.82rem;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.qr {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.6rem;
		margin-top: 0.4rem;
		padding-top: 0.8rem;
		border-top: 2px solid var(--line);
		text-align: center;
	}
	.qr-waiting {
		display: grid;
		place-items: center;
		width: 168px;
		height: 110px;
		border: 2px dashed var(--line);
		border-radius: 12px;
		color: var(--muted);
	}
</style>
