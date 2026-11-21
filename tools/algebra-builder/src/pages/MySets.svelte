<script lang="ts">
	// Oomba: My question sets. Every set this teacher saved on Oomba (school staff: BRB.canListSets), newest first, with
	// its class code. Open takes it to the question set page (saving keeps the same link and code); Copy link,
	// Duplicate, Rename and Delete (after a confirm) work on the saved set.
	import { Check, Copy, CopyPlus, FolderOpen, ListPlus, Pencil, Tag, Trash2 } from '@lucide/svelte';
	import { prettyText } from '$lib/algebra';
	import { go, goBack, sets as drafts } from '$lib/nav.svelte';
	import { copy, deleteSet, duplicateSet, forgetMySet, listSets, renameSet, setLink, type SavedOnOomba } from '$lib/oomba';
	import Footer from '$lib/Footer.svelte';
	import Logo from '$lib/Logo.svelte';

	const KIND = { solve: 'Solve', multiply: 'Multiply', factor: 'Factor' } as const;
	let list = $state<SavedOnOomba[] | null>(null);
	let failed = $state(false);
	let said = $state('');
	let note = $state<{ id: string; text: string } | null>(null);
	let renaming = $state<string | null>(null);
	let newName = $state('');
	let asking = $state<string | null>(null);
	let busy = $state<string | null>(null);
	let copied = $state<string | null>(null);

	async function load(focus?: string) {
		failed = false;
		const r = await listSets();
		if ('sets' in r && Array.isArray(r.sets)) {
			list = r.sets;
			if (focus) setTimeout(() => (document.querySelector(`[data-set="${focus}"] .title`) as HTMLElement | null)?.focus(), 0);
		} else failed = true;
	}
	load();

	const dateFmt = (() => {
		try {
			return new Intl.DateTimeFormat('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
		} catch {
			return null;
		}
	})();
	const count = (n: number) => `${n} question${n === 1 ? '' : 's'}`;
	const nameOf = (s: SavedOnOomba) => s.title.trim() || count(s.items.length);
	const kinds = (s: SavedOnOomba) => [...new Set(s.items.map((i) => KIND[i.a]).filter(Boolean))].join(', ');
	const meta = (s: SavedOnOomba) => [s.title.trim() ? count(s.items.length) : '', kinds(s), s.items[0] ? `starts ${prettyText(s.items[0].p)}` : ''].filter(Boolean).join(' · ');
	const changed = (s: SavedOnOomba) => (s.updated && dateFmt ? `Changed ${dateFmt.format(new Date(s.updated))}` : '');
	const WHY: Record<string, string> = {
		none: 'That question set isn’t there any more.',
		full: 'You have saved as many question sets as you can. Delete one first.',
		title: 'That name isn’t allowed (personal details, links or rude words). Try another.',
		offline: 'That didn’t work just now. Check your connection and try again.'
	};
	const why = (e?: string) => WHY[e ?? 'offline'] ?? WHY.offline;
	function tell(text: string) {
		said = '';
		setTimeout(() => (said = text), 30);
	}

	function open(s: SavedOnOomba) {
		drafts.draft = { items: s.items.map((i) => ({ ...i })), id: s.id, saved: true };
		go({ name: 'set' });
	}
	function newSet() {
		drafts.draft = { items: [], id: null, saved: false };
		go({ name: 'set' });
	}
	async function copyLink(s: SavedOnOomba) {
		if (await copy(setLink(s.id))) {
			copied = s.id;
			tell('Copied the set link.');
			setTimeout(() => (copied = null), 1500);
		} else note = { id: s.id, text: 'Couldn’t copy the link. Open the set to see it.' };
	}
	async function dup(s: SavedOnOomba) {
		if (busy) return;
		busy = s.id;
		const r = await duplicateSet(s.id);
		busy = null;
		if ('id' in r && r.id) {
			tell('Copy made. It’s at the top of the list.');
			await load(r.id);
		} else note = { id: s.id, text: why(r.error) };
	}
	function startRename(s: SavedOnOomba) {
		renaming = s.id;
		asking = null;
		note = null;
		newName = s.title;
		setTimeout(() => (document.getElementById(`ab-rename-${s.id}`) as HTMLInputElement | null)?.select(), 0);
	}
	async function saveName(s: SavedOnOomba) {
		if (busy) return;
		busy = s.id;
		const r = await renameSet(s.id, newName.replace(/\s+/g, ' ').trim());
		busy = null;
		if ('ok' in r && r.ok) {
			renaming = null;
			tell('Renamed.');
			await load(s.id);
		} else note = { id: s.id, text: why(r.error) };
	}
	async function del(s: SavedOnOomba) {
		if (busy) return;
		busy = s.id;
		const r = await deleteSet(s.id);
		busy = null;
		if (('ok' in r && r.ok) || r.error === 'none') {
			forgetMySet(s.id);
			if (drafts.draft?.id === s.id) drafts.draft = null;
			asking = null;
			list = (list ?? []).filter((x) => x.id !== s.id);
			tell('Deleted.');
			setTimeout(() => document.querySelector<HTMLElement>('#ab-my-title')?.focus(), 0);
		} else note = { id: s.id, text: why(r.error) };
	}
</script>

<div class="page">
	<button type="button" class="brand" onclick={() => go({ name: 'home' })}>
		<Logo size={28} /> Algebra Builder
	</button>
	<header class="bar">
		<button type="button" class="btn-ghost back" id="ab-my-back" onclick={goBack}>← Back</button>
		<h1 id="ab-my-title" tabindex="-1"><FolderOpen size={28} aria-hidden="true" /> My question sets</h1>
	</header>
	<p class="lede">Every question set you saved on Oomba, with its class code, newest first. Open one to change it: saving keeps the same class code and link.</p>
	<p class="sr-only" role="status">{said}</p>

	{#if failed}
		<div class="empty">
			<p>Couldn’t load your question sets. Check your connection and try again.</p>
			<button type="button" class="btn-ghost" id="ab-my-retry" onclick={() => load()}>Try again</button>
		</div>
	{:else if !list}
		<p class="loading">Loading your question sets…</p>
	{:else if !list.length}
		<div class="empty" id="ab-my-empty">
			<p>Nothing here yet. Make a question set and press “Save and get link”, and it shows up here.</p>
			<button type="button" class="btn-primary" onclick={newSet}><ListPlus size={16} aria-hidden="true" /> Make a question set</button>
		</div>
	{:else}
		<ul class="list">
			{#each list as s (s.id)}
				{@const name = nameOf(s)}
				<li class="card" data-set={s.id}>
					<div class="head">
						<h2 class="title" tabindex="-1" dir="auto">{name}</h2>
						<span class="meta">{meta(s)}</span>
						<span class="meta">{changed(s)}</span>
						<span class="code">Class code <b>{s.code}</b></span>
					</div>
					{#if renaming === s.id}
						<form
							class="row"
							onsubmit={(e) => {
								e.preventDefault();
								saveName(s);
							}}
						>
							<label class="sr-only" for="ab-rename-{s.id}">New name</label>
							<input id="ab-rename-{s.id}" class="field" maxlength="60" dir="auto" placeholder="New name" bind:value={newName} onkeydown={(e) => e.key === 'Escape' && (renaming = null)} />
							<button type="submit" class="btn-primary small" id="ab-rename-ok" disabled={busy === s.id}>Save name</button>
							<button type="button" class="btn-ghost small" onclick={() => (renaming = null)}>Cancel</button>
						</form>
					{/if}
					{#if asking === s.id}
						<div class="ask">
							<p dir="auto">Delete “{name}”? Its class code and link stop working for everyone.</p>
							<div class="row">
								<button type="button" class="btn-primary small danger-fill" id="ab-my-delyes" disabled={busy === s.id} onclick={() => del(s)}><Trash2 size={15} aria-hidden="true" /> Delete</button>
								<button type="button" class="btn-ghost small" id="ab-my-delno" onclick={() => (asking = null)}>Keep it</button>
							</div>
						</div>
					{/if}
					<div class="row">
						<button type="button" class="btn-primary small" data-ws-open={s.id} aria-label="Open: {name}" onclick={() => open(s)}><Pencil size={15} aria-hidden="true" /> Open</button>
						<button type="button" class="btn-ghost small" data-ws-copy={s.id} aria-label="Copy set link: {name}" onclick={() => copyLink(s)}
							>{#if copied === s.id}<Check size={15} aria-hidden="true" /> Copied{:else}<Copy size={15} aria-hidden="true" /> Copy set link{/if}</button
						>
						<button type="button" class="btn-ghost small" data-ws-dup={s.id} aria-label="Duplicate: {name}" disabled={busy === s.id} onclick={() => dup(s)}><CopyPlus size={15} aria-hidden="true" /> Duplicate</button>
						<button type="button" class="btn-ghost small" data-ws-rename={s.id} aria-label="Rename: {name}" onclick={() => startRename(s)}><Tag size={15} aria-hidden="true" /> Rename</button>
						<button
							type="button"
							class="btn-ghost small danger"
							data-ws-del={s.id}
							aria-label="Delete: {name}"
							onclick={() => {
								asking = s.id;
								renaming = null;
								note = null;
								setTimeout(() => document.getElementById('ab-my-delno')?.focus(), 0);
							}}><Trash2 size={15} aria-hidden="true" /> Delete</button
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
		max-width: 60rem;
		margin: 0 auto;
		padding: 1.5rem 1.25rem;
	}
	.brand {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		color: var(--accent);
		font-size: 1.15rem;
		font-weight: 800;
	}
	.bar {
		display: flex;
		align-items: center;
		gap: 1rem;
		margin-top: 1rem;
	}
	h1 {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 2.1rem;
		font-weight: 800;
		line-height: 1.1;
	}
	h1:focus,
	.title:focus {
		outline: none;
	}
	.lede {
		margin-top: 0.6rem;
		color: var(--muted);
	}
	.loading {
		margin-top: 1.25rem;
		color: var(--muted);
	}
	.empty {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.9rem;
		margin-top: 1.25rem;
		padding: 2rem;
		border: 2px dashed var(--line-strong);
		border-radius: 16px;
		background: var(--paper);
		text-align: center;
	}
	.list {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		margin-top: 1.25rem;
		padding: 0;
		list-style: none;
	}
	.card {
		display: flex;
		flex-direction: column;
		gap: 0.7rem;
		padding: 1rem 1.15rem;
		border: 1px solid var(--line);
		border-radius: 14px;
		background: var(--paper);
		box-shadow: 0 1px 2px rgb(29 40 56 / 0.06);
	}
	.head {
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
	}
	.title {
		font-size: 1.15rem;
		font-weight: 800;
		overflow-wrap: anywhere;
	}
	.meta {
		color: var(--muted);
		font-size: 0.88rem;
	}
	.code {
		font-size: 0.88rem;
	}
	.code b {
		font-family: ui-monospace, monospace;
		letter-spacing: 0.06em;
	}
	.row {
		display: flex;
		flex-wrap: wrap;
		gap: 0.45rem;
	}
	.small {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		padding: 0.45rem 0.85rem;
		font-size: 0.9rem;
	}
	.danger {
		color: var(--bad);
	}
	.danger-fill {
		background: var(--bad);
		color: #fff;
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
		border: 2px solid var(--bad-line);
		border-radius: 12px;
		background: var(--bad-wash);
	}
	.ask p {
		margin: 0 0 0.5rem;
		font-weight: 700;
	}
	.problem {
		color: var(--bad);
		font-size: 0.9rem;
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
