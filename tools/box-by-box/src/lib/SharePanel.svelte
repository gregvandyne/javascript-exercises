<script lang="ts">
	import { t } from './i18n';
	// Sharing an activity: saved on Oomba (its problems and support, not its title) for a student link and a QR code.
	// Saving again after a change keeps the same link.
	import { Check, Copy, GraduationCap, KeyRound, Printer, QrCode } from '@lucide/svelte';
	import { PRINT_NOTE_MAX, cleanPrintNote, isShared, saveMindful, setPrintNote, type Activity } from './activities.svelte';
	import ConfirmDialog from './ConfirmDialog.svelte';
	import { go, show } from './nav.svelte';
	import { assign, canAssign, canPrint, classCode, copy, isGuest, isPreview, printSheet, setLink } from './oomba';
	import { toItem } from './logic';
	import { makeQr, qrExtent, qrPath, qrPng } from './qr';

	let { activity }: { activity: Activity } = $props();

	let saving = $state(false);
	let problem = $state('');
	const saved = $derived(isShared(activity));
	const link = $derived(setLink(activity.setId));
	const qr = $derived(link ? makeQr(link) : null);
	const noSave = isPreview() ? t('ui.save.preview') : isGuest() ? t('ui.save.guest') : '';

	let dialog = $state<ConfirmDialog>();
	async function save() {
		if (saving || saved) return;
		saving = true;
		problem = '';
		const r = await saveMindful(activity, dialog ? (a, b, c) => dialog!.ask(a, b, c) : undefined);
		saving = false;
		if (r.error) problem = r.error;
		if (r.copy) {
			show({ name: 'home' });
			go({ name: 'edit', id: r.copy.id });
		}
	}

	// --- a worksheet to print: the activity's problems (a fresh set for each student: the ones it has now), as numbers
	// and fixed words; the answer key on a page of its own, for school staff only (the server checks too) ---
	let printing = $state(false);
	let printNote = $state('');
	// the teacher's own instructions for the top of the sheet, kept with the activity as they type
	let mine = $state('');
	// follows the activity shown (and its saved note)
	$effect.pre(() => {
		mine = activity.printNote ?? '';
	});
	async function print(key: boolean) {
		if (printing || !activity.problems.length) return;
		printing = true;
		printNote = '';
		const { k, p, r, dec, m } = toItem(activity);
		const out = await printSheet({ k, p, ...(r ? { r } : {}), ...(dec ? { dec } : {}), ...(m ? { m } : {}), ...(cleanPrintNote(mine) ? { note: cleanPrintNote(mine) } : {}), key, set: isShared(activity) ? (activity.setId ?? '') : '' });
		printing = false;
		if (out !== 'ok') printNote = t(out === 'key' ? 'ui.print.key' : out === 'bad' ? 'ui.print.bad' : out === 'tap' ? 'ui.print.tap' : 'ui.print.offline');
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
	<h2>{t('ui.share.title')}</h2>
	{#if noSave}
		<p class="note">{noSave}</p>
	{:else}
		<button type="button" class="btn-primary wide" disabled={saving || saved} onclick={save}>
			{#if saved}<Check size={16} aria-hidden="true" /> {t('ui.share.saved')}{:else if saving}{t('ui.saving')}{:else if activity.setId}{t('ui.share.saveChanges')}{:else}{t('ui.share.save')}{/if}
		</button>
		{#if activity.setId && !saved && !saving}
			<p class="note">{t('ui.share.sameLink')}</p>
		{/if}
		{#if problem}<p class="note bad" role="alert">{problem}</p>{/if}
	{/if}

	{#if link}
		<div class="code-box">
			<span class="code-label">{t('ui.classCode')}</span>
			<span class="code-val">{classCode(activity.setId ?? '')}</span>
			<span class="code-hint">{t('ui.share.codeHint')}</span>
		</div>
		<p class="link" title={link}>{link}</p>
		<button type="button" class="btn-primary wide" onclick={copyLink}>
			{#if copied === 'link'}<Check size={16} aria-hidden="true" /> {t('ui.copied')}{:else}<Copy size={16} aria-hidden="true" /> {t('ui.share.copyLink')}{/if}
		</button>
		{#if canAssign()}
			<button type="button" class="btn-ghost wide" disabled={!saved} onclick={() => activity.setId && assign(activity.setId)}
				><GraduationCap size={16} aria-hidden="true" /> {t('ui.share.assign')}</button
			>
			{#if !saved}<p class="note">{t('ui.share.saveToAssign')}</p>{/if}
		{/if}
	{/if}
	{#if canPrint()}
		<div class="print">
			<h2>{t('ui.print.title')}</h2>
			<p class="note">{t(canAssign() ? 'ui.print.aboutStaff' : 'ui.print.about')}</p>
			<label class="mine">
				<span>{t('ui.print.mineLabel')}</span>
				<textarea rows="3" maxlength={PRINT_NOTE_MAX} placeholder={t('ui.print.minePlaceholder')} bind:value={mine} onchange={() => setPrintNote(activity.id, mine)} onblur={() => setPrintNote(activity.id, mine)}></textarea>
				<small>{t('ui.print.mineHint')}</small>
			</label>
			<button type="button" class="btn-ghost wide" disabled={printing || !activity.problems.length} onclick={() => print(false)}
				><Printer size={16} aria-hidden="true" /> {t('ui.print.sheet')}</button
			>
			{#if canAssign()}
				<button type="button" class="btn-ghost wide" disabled={printing || !activity.problems.length} onclick={() => print(true)}
					><KeyRound size={16} aria-hidden="true" /> {t('ui.print.withKey')}</button
				>
			{/if}
			{#if printNote}<p class="note bad" role="alert">{printNote}</p>{/if}
		</div>
	{/if}
	<div class="qr">
		{#if qr}
			<svg viewBox="0 0 {qrExtent(qr)} {qrExtent(qr)}" width="168" height="168" role="img" aria-label={t('ui.share.qr')}>
				<rect width="100%" height="100%" fill="#fff" />
				<path d={qrPath(qr)} fill="#000" />
			</svg>
			<button type="button" class="btn-ghost" onclick={copyQr}>
				{#if copied === 'qr'}<Check size={16} aria-hidden="true" /> {t('ui.copied')}{:else}<Copy size={16} aria-hidden="true" /> {t('ui.share.copyQr')}{/if}
			</button>
		{:else}
			<div class="qr-waiting"><QrCode size={40} aria-hidden="true" /></div>
			<p class="note">{t(noSave && isPreview() ? 'ui.share.noLinkPreview' : 'ui.share.qrLater')}</p>
		{/if}
	</div>
</div>

<ConfirmDialog bind:this={dialog} />

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
	.code-box {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.15rem;
		margin-top: 0.75rem;
		padding: 0.65rem;
		border: 2px solid var(--ink);
		border-radius: 14px;
		background: #fff1cc;
		text-align: center;
	}
	.code-label {
		font-size: 0.75rem;
		font-weight: 800;
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}
	.code-val {
		font: 800 1.55rem/1.1 ui-monospace, monospace;
		letter-spacing: 0.08em;
	}
	.code-hint {
		color: var(--muted);
		font-size: 0.82rem;
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
	.print {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		margin-top: 0.4rem;
		padding-top: 0.8rem;
		border-top: 2px solid var(--line);
	}
	.mine {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
		font-weight: 700;
	}
	.mine textarea {
		width: 100%;
		box-sizing: border-box;
		min-height: 4.5rem;
		padding: 0.55rem 0.7rem;
		border: 2px solid var(--line);
		border-radius: 12px;
		background: var(--paper);
		color: var(--ink);
		font-family: inherit;
		font-size: 1rem;
		font-weight: 400;
		line-height: 1.4;
		resize: vertical;
	}
	.mine textarea:focus-visible {
		outline: 3px solid var(--focus, #2f5fd0);
		outline-offset: 1px;
	}
	.mine small {
		font-weight: 400;
		color: var(--muted);
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
