<script lang="ts">
	import { t, tn, LANG, NAME_HERE as NAME } from '$lib/i18n';
	// My worksheets: every activity this teacher saved on Oomba (school staff: BRB.canListSets), newest first, with its
	// class code. Open takes it to the editor (saving keeps the same link and code); Print, Copy link, Duplicate,
	// Rename and Delete (after a confirm) work on the saved one. Its own printed instructions stay with its activity.
	import { Check, Copy, CopyPlus, FolderOpen, KeyRound, Pencil, Plus, Printer, Tag, Trash2 } from '@lucide/svelte';
	import { deletedSet, openSaved, printNoteFor, renamedSet } from '$lib/activities.svelte';
	import { kindInfo, levelInfo, parseItem, toItem } from '$lib/logic';
	import { methodInfo } from '$lib/methods';
	import { canAssign, canPrint, copy, deleteSet, duplicateSet, listSets, printSheet, renameSet, setLink, type MySet } from '$lib/oomba';
	import { go, goBack } from '$lib/nav.svelte';
	import Logo from '$lib/Logo.svelte';
	import Footer from '$lib/Footer.svelte';

	let sets = $state<MySet[] | null>(null);
	let failed = $state(false);
	let said = $state('');
	/** The row a message, a rename box or a delete question belongs to. */
	let note = $state<{ id: string; text: string } | null>(null);
	let renaming = $state<string | null>(null);
	let newName = $state('');
	let asking = $state<string | null>(null);
	let busy = $state<string | null>(null);
	let copied = $state<string | null>(null);
	const printing = canPrint();
	const keys = canPrint() && canAssign();

	async function load(focus?: string) {
		failed = false;
		const r = await listSets();
		if ('sets' in r && Array.isArray(r.sets)) {
			sets = r.sets;
			if (focus) setTimeout(() => (document.querySelector(`[data-set="${focus}"] .title`) as HTMLElement | null)?.focus(), 0);
		} else failed = true;
	}
	load();
	$effect(() => {
		document.title = `${NAME} · ${t('ui.ws.title')}`;
	});

	const dateFmt = (() => {
		try {
			return new Intl.DateTimeFormat(LANG, { day: 'numeric', month: 'short', year: 'numeric' });
		} catch {
			return null;
		}
	})();
	const playable = (s: MySet) => parseItem(s.items[0]);
	const nameOf = (s: MySet) => {
		const p = playable(s);
		return s.title.trim() || (p ? kindInfo(p.kind).title : s.label);
	};
	function meta(s: MySet) {
		const p = playable(s);
		if (!p) return s.label;
		const { level, perStudent } = p.settings;
		const label = level === 'custom' ? t('ui.home.ownMix') : levelInfo(level)?.label;
		const way = p.settings.method && p.settings.method !== 'standard' ? ` · ${methodInfo(p.kind, p.settings.method).label}` : '';
		return `${kindInfo(p.kind).title} · ${tn('ui.home.problems', s.n)}${way} · ${label}${perStudent ? ` · ${t('ui.home.perStudent')}` : ''}`;
	}
	const changed = (s: MySet) => (s.updated && dateFmt ? t('ui.ws.changed', { date: dateFmt.format(new Date(s.updated)) }) : '');
	const why = (e?: string) => t(e === 'none' ? 'ui.ws.gone' : e === 'full' ? 'ui.save.full' : e === 'title' ? 'ui.ws.renameBad' : 'ui.ws.actionFailed');
	function tell(text: string) {
		said = '';
		setTimeout(() => (said = text), 30);
	}

	function open(s: MySet) {
		const a = openSaved(s.id, s.items[0], s.title);
		if (!a) {
			note = { id: s.id, text: t('ui.ws.actionFailed') };
			return;
		}
		go({ name: 'edit', id: a.id });
	}
	async function print(s: MySet, key: boolean) {
		const p = playable(s);
		if (!p) return;
		// a fresh set for each student: print a set of the kind it makes
		const problems = p.problems.length ? p.problems : kindInfo(p.kind).makeSet(Math.random, kindInfo(p.kind).setSize);
		const { k, p: list, r, dec, m } = toItem({ ...p, problems });
		const mine = printNoteFor(s.id);
		const out = await printSheet({ k, p: list, ...(r ? { r } : {}), ...(dec ? { dec } : {}), ...(m ? { m } : {}), ...(mine ? { note: mine } : {}), key, set: s.id });
		if (out !== 'ok') note = { id: s.id, text: t(out === 'key' ? 'ui.print.key' : out === 'bad' ? 'ui.print.bad' : out === 'tap' ? 'ui.print.tap' : 'ui.print.offline') };
	}
	async function copyLink(s: MySet) {
		if (await copy(setLink(s.id))) {
			copied = s.id;
			tell(t('ui.home.copied'));
			setTimeout(() => (copied = null), 1500);
		} else note = { id: s.id, text: t('ui.home.copyFailed') };
	}
	async function dup(s: MySet) {
		if (busy) return;
		busy = s.id;
		const r = await duplicateSet(s.id);
		busy = null;
		if ('id' in r && r.id) {
			tell(t('ui.ws.dupDone'));
			await load(r.id);
		} else note = { id: s.id, text: why(r.error) };
	}
	function startRename(s: MySet) {
		renaming = s.id;
		asking = null;
		note = null;
		newName = s.title || nameOf(s);
		setTimeout(() => (document.getElementById(`bb-rename-${s.id}`) as HTMLInputElement | null)?.select(), 0);
	}
	async function saveName(s: MySet) {
		if (busy) return;
		busy = s.id;
		const r = await renameSet(s.id, newName.replace(/\s+/g, ' ').trim());
		busy = null;
		if ('ok' in r && r.ok) {
			renamedSet(s.id, typeof r.title === 'string' ? r.title : newName.trim());
			renaming = null;
			tell(t('ui.ws.renamed'));
			await load(s.id);
		} else note = { id: s.id, text: why(r.error) };
	}
	async function del(s: MySet) {
		if (busy) return;
		busy = s.id;
		const r = await deleteSet(s.id);
		busy = null;
		if (('ok' in r && r.ok) || r.error === 'none') {
			deletedSet(s.id);
			asking = null;
			sets = (sets ?? []).filter((x) => x.id !== s.id);
			tell(t('ui.ws.deleted'));
			setTimeout(() => document.querySelector<HTMLElement>('#bb-ws-title')?.focus(), 0);
		} else note = { id: s.id, text: why(r.error) };
	}
</script>

<div class="page">
	<header class="top">
		<div class="top-row">
			<p class="brand"><Logo size={36} /> {NAME}</p>
			<button type="button" class="btn-ghost switch" id="bb-ws-back" onclick={goBack}>{t('ui.back')}</button>
		</div>
		<h1 id="bb-ws-title" tabindex="-1"><FolderOpen size={30} aria-hidden="true" /> {t('ui.ws.title')}</h1>
		<p class="lede">{t('ui.ws.lede')}</p>
	</header>
	<p class="sr-only" role="status">{said}</p>

	{#if failed}
		<div class="empty">
			<p>{t('ui.ws.failed')}</p>
			<div class="empty-actions"><button type="button" class="btn-ghost" id="bb-ws-retry" onclick={() => load()}>{t('ui.ws.retry')}</button></div>
		</div>
	{:else if !sets}
		<p class="loading">{t('ui.ws.loading')}</p>
	{:else if !sets.length}
		<div class="empty" id="bb-ws-empty">
			<p>{t('ui.ws.empty')}</p>
			<div class="empty-actions"><button type="button" class="btn-primary" onclick={goBack}><Plus size={16} aria-hidden="true" /> {t('ui.home.new')}</button></div>
		</div>
	{:else}
		<ul class="list">
			{#each sets as s (s.id)}
				{@const name = nameOf(s)}
				<li class="card" data-set={s.id}>
					<div class="head">
						<h2 class="title" tabindex="-1" dir="auto">{name}</h2>
						<span class="meta">{meta(s)}</span>
						<span class="meta">{changed(s)}</span>
						<span class="code">{t('ui.classCode')} <b dir="ltr">{s.code}</b></span>
					</div>
					{#if renaming === s.id}
						<form
							class="rename"
							onsubmit={(e) => {
								e.preventDefault();
								saveName(s);
							}}
						>
							<label class="sr-only" for="bb-rename-{s.id}">{t('ui.ws.renameLabel')}</label>
							<input id="bb-rename-{s.id}" class="field" maxlength="60" dir="auto" placeholder={t('ui.ws.renameLabel')} bind:value={newName} onkeydown={(e) => e.key === 'Escape' && (renaming = null)} />
							<button type="submit" class="btn-primary small" id="bb-rename-ok" disabled={busy === s.id}>{t('ui.ws.renameSave')}</button>
							<button type="button" class="btn-ghost small" onclick={() => (renaming = null)}>{t('ui.ws.cancel')}</button>
						</form>
					{/if}
					{#if asking === s.id}
						<div class="ask">
							<p dir="auto">{t('ui.ws.deleteAsk', { x: name })}</p>
							<div class="row">
								<button type="button" class="btn-danger small" id="bb-ws-delyes" disabled={busy === s.id} onclick={() => del(s)}><Trash2 size={15} aria-hidden="true" /> {t('ui.delete')}</button>
								<button type="button" class="btn-ghost small" id="bb-ws-delno" onclick={() => (asking = null)}>{t('ui.keep')}</button>
							</div>
						</div>
					{/if}
					<div class="acts">
						<button type="button" class="btn-primary small" data-ws-open={s.id} aria-label="{t('ui.open')}: {name}" onclick={() => open(s)}><Pencil size={15} aria-hidden="true" /> {t('ui.open')}</button>
						{#if printing}
							<button type="button" class="btn-ghost small" data-ws-print={s.id} aria-label="{t('ui.print.sheet')}: {name}" onclick={() => print(s, false)}><Printer size={15} aria-hidden="true" /> {t('ui.print.sheet')}</button>
							{#if keys}
								<button type="button" class="btn-ghost small" data-ws-key={s.id} aria-label="{t('ui.print.withKey')}: {name}" onclick={() => print(s, true)}><KeyRound size={15} aria-hidden="true" /> {t('ui.print.withKey')}</button>
							{/if}
						{/if}
						<button type="button" class="btn-ghost small" data-ws-copy={s.id} aria-label="{t('ui.share.copyLink')}: {name}" onclick={() => copyLink(s)}
							>{#if copied === s.id}<Check size={15} aria-hidden="true" />{:else}<Copy size={15} aria-hidden="true" />{/if} {t('ui.share.copyLink')}</button
						>
						<button type="button" class="btn-ghost small" data-ws-dup={s.id} aria-label="{t('ui.ws.dup')}: {name}" disabled={busy === s.id} onclick={() => dup(s)}><CopyPlus size={15} aria-hidden="true" /> {t('ui.ws.dup')}</button>
						<button type="button" class="btn-ghost small" data-ws-rename={s.id} aria-label="{t('ui.ws.rename')}: {name}" onclick={() => startRename(s)}><Tag size={15} aria-hidden="true" /> {t('ui.ws.rename')}</button>
						<button
							type="button"
							class="btn-ghost small danger"
							data-ws-del={s.id}
							aria-label="{t('ui.delete')}: {name}"
							onclick={() => {
								asking = s.id;
								renaming = null;
								note = null;
								setTimeout(() => document.getElementById('bb-ws-delno')?.focus(), 0);
							}}><Trash2 size={15} aria-hidden="true" /> {t('ui.delete')}</button
						>
					</div>
					{#if note?.id === s.id}<p class="problem" role="alert">{note.text}</p>{/if}
				</li>
			{/each}
		</ul>
	{/if}

	<Footer />
</div>

<style>
	.page {
		display: flex;
		flex-direction: column;
		max-width: 68rem;
		min-height: 100dvh;
		margin: 0 auto;
		padding: 2rem 1.25rem 1.5rem;
	}
	.top {
		margin-bottom: 1.5rem;
	}
	.top-row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 0.6rem 1rem;
	}
	.switch {
		padding: 0.45rem 0.9rem;
		font-size: 0.9rem;
	}
	.brand {
		display: flex;
		align-items: center;
		gap: 0.55rem;
		margin: 0;
		color: var(--ink);
		font-size: 1.3rem;
		font-weight: 800;
	}
	h1 {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		margin: 0.9rem 0 0;
		font-size: 2.1rem;
		font-weight: 800;
		line-height: 1.15;
	}
	h1:focus {
		outline: none;
	}
	.lede {
		max-width: 44rem;
		margin: 0.35rem 0 0;
		color: var(--muted);
		line-height: 1.5;
	}
	.loading {
		color: var(--muted);
	}
	.empty {
		width: 100%;
		padding: 2rem;
		border: 2px dashed var(--line-strong);
		border-radius: var(--radius-lg);
		background: var(--paper-low);
		color: var(--ink-soft);
		font-size: 1.1rem;
		text-align: center;
	}
	.empty p {
		margin: 0;
	}
	.empty-actions {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: 0.6rem;
		margin-top: 0.9rem;
	}
	.list {
		display: flex;
		flex-direction: column;
		gap: 0.8rem;
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.card {
		display: flex;
		flex-direction: column;
		gap: 0.7rem;
		padding: 0.95rem 1.05rem;
		border: 2px solid var(--line);
		border-radius: var(--radius-lg);
		background: var(--paper);
	}
	.head {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
		min-width: 0;
	}
	.title {
		margin: 0;
		overflow-wrap: anywhere;
		font-size: 1.15rem;
		font-weight: 800;
	}
	.title:focus {
		outline: none;
	}
	.meta {
		color: var(--muted);
		font-size: 0.85rem;
	}
	.code {
		color: var(--ink-soft);
		font-size: 0.85rem;
	}
	.code b {
		font-family: ui-monospace, monospace;
		letter-spacing: 0.06em;
	}
	.acts,
	.row,
	.rename {
		display: flex;
		flex-wrap: wrap;
		gap: 0.45rem;
	}
	.small {
		padding: 0.4rem 0.8rem;
		font-size: 0.88rem;
	}
	.danger {
		color: var(--bad);
	}
	.field {
		flex: 1 1 14rem;
		min-width: 0;
		padding: 0.45rem 0.7rem;
		border: 2px solid var(--line-strong);
		border-radius: 10px;
		background: var(--paper);
		color: var(--ink);
		font: inherit;
	}
	.ask {
		padding: 0.6rem 0.8rem;
		border: 2px solid var(--bad);
		border-radius: 12px;
		background: var(--paper-low);
	}
	.ask p {
		margin: 0 0 0.5rem;
		font-weight: 700;
	}
	.problem {
		margin: 0;
		color: var(--bad);
		font-size: 0.88rem;
		font-weight: 600;
	}
	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
		white-space: nowrap;
	}
</style>
