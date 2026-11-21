<script lang="ts">
	// Oomba: My question sets. Every set this teacher saved on Oomba (school staff: BRB.canListSets), newest first, with
	// its class code. Each is one quiet row: the row opens it on the question set page (saving keeps the same link and
	// code); beside it only a More menu (Copy set link, Duplicate, Rename, Delete after a confirm).
	import { tick } from 'svelte';
	import { Copy, CopyPlus, Ellipsis, FolderOpen, ListPlus, Tag, Trash2 } from '@lucide/svelte';
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
	/** The row whose More menu is open. */
	let menuFor = $state<string | null>(null);

	async function load(focus?: string) {
		failed = false;
		const r = await listSets();
		if ('sets' in r && Array.isArray(r.sets)) {
			list = r.sets;
			if (focus) setTimeout(() => (document.querySelector(`[data-set="${focus}"] [data-ws-open]`) as HTMLElement | null)?.focus(), 0);
		} else failed = true;
	}
	load();

	const date = (ts: number) => {
		try {
			const d = new Date(ts);
			const thisYear = d.getFullYear() === new Date().getFullYear();
			return new Intl.DateTimeFormat('en-US', { day: 'numeric', month: 'short', ...(thisYear ? {} : { year: 'numeric' }) })
				.format(d)
				.replace(/ /g, '\u00a0'); // a date stays on one line
		} catch {
			return '';
		}
	};
	const count = (n: number) => `${n} question${n === 1 ? '' : 's'}`;
	const nameOf = (s: SavedOnOomba) => s.title.trim() || count(s.items.length);
	const kinds = (s: SavedOnOomba) => [...new Set(s.items.map((i) => KIND[i.a]).filter(Boolean))].join(', ');
	/** One quiet line: how many questions (when the set has a name), their kinds, the date it was saved. */
	const meta = (s: SavedOnOomba) => [s.title.trim() ? count(s.items.length) : '', kinds(s), s.updated ? date(s.updated) : ''].filter(Boolean).join(' · ');
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
		if (await copy(setLink(s.id))) tell('Copied the set link.');
		else note = { id: s.id, text: 'Couldn’t copy the link. Open the set to see it.' };
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
	function askDelete(s: SavedOnOomba) {
		asking = s.id;
		renaming = null;
		note = null;
		setTimeout(() => document.getElementById('ab-my-delno')?.focus(), 0);
	}
	const moreOf = (id: string) => document.querySelector<HTMLElement>(`[data-ws-more="${id}"]`);
	const itemsOf = () => [...document.querySelectorAll<HTMLElement>('.menu [role="menuitem"]')];
	/** Open (or close) a row's More menu, with the focus on its first item (its last, from the up arrow). */
	async function toggleMenu(s: SavedOnOomba, last = false) {
		if (menuFor === s.id) return closeMenu(true);
		menuFor = s.id;
		await tick();
		const items = itemsOf();
		items[last ? items.length - 1 : 0]?.focus();
	}
	function closeMenu(back: boolean) {
		const id = menuFor;
		menuFor = null;
		if (back && id) moreOf(id)?.focus();
	}
	/** A choice: the menu closes, the action runs, and the focus goes back to More unless the action moved it on. */
	async function choose(s: SavedOnOomba, act: () => unknown) {
		menuFor = null;
		act();
		await tick();
		if (!document.activeElement || document.activeElement === document.body) moreOf(s.id)?.focus();
	}
	function menuKey(e: KeyboardEvent) {
		const items = itemsOf();
		const i = items.indexOf(document.activeElement as HTMLElement);
		const to = (n: number) => items[(n + items.length) % items.length]?.focus();
		if (e.key === 'ArrowDown') to(i + 1);
		else if (e.key === 'ArrowUp') to(i - 1);
		else if (e.key === 'Home') to(0);
		else if (e.key === 'End') to(items.length - 1);
		else if (e.key === 'Escape') closeMenu(true);
		else if (e.key === 'Tab') return void (menuFor = null);
		else return;
		e.preventDefault();
		e.stopPropagation();
	}
	function outside(e: PointerEvent) {
		if (menuFor && !e.composedPath().some((el) => el instanceof HTMLElement && el.classList.contains('menu-wrap'))) menuFor = null;
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

<svelte:window onpointerdown={outside} />

<div class="page">
	<button type="button" class="brand" onclick={() => go({ name: 'home' })}>
		<Logo size={28} /> Algebra Builder
	</button>
	<header class="bar">
		<button type="button" class="btn-ghost back" id="ab-my-back" onclick={goBack}>← Back</button>
		<h1 id="ab-my-title" tabindex="-1"><FolderOpen size={28} aria-hidden="true" /> My question sets</h1>
	</header>
	<p class="lede">Your saved question sets. Open one to edit it; its class code stays the same.</p>
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
					<div class="line">
						<button type="button" class="open" data-ws-open={s.id} onclick={() => open(s)}>
							<span class="title" dir="auto">{name}</span>
							<span class="meta"
								><span>{meta(s)}</span>
								<span class="code" title="Class code"><span class="sr-only">Class code </span><b>{s.code}</b></span></span
							>
						</button>
						<div class="menu-wrap">
							<button
								type="button"
								class="iconbtn"
								data-ws-more={s.id}
								aria-haspopup="menu"
								aria-expanded={menuFor === s.id}
								aria-label="More for {name}"
								onclick={() => toggleMenu(s)}
								onkeydown={(e) => {
									if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && menuFor !== s.id) {
										e.preventDefault();
										toggleMenu(s, e.key === 'ArrowUp');
									}
								}}><Ellipsis size={20} strokeWidth={2.5} aria-hidden="true" /></button
							>
							{#if menuFor === s.id}
								<div class="menu" role="menu" tabindex="-1" aria-label="More for {name}" onkeydown={menuKey}>
									<button type="button" role="menuitem" tabindex="-1" data-ws-copy={s.id} onclick={() => choose(s, () => copyLink(s))}
										><Copy size={16} aria-hidden="true" /> Copy set link</button
									>
									<button type="button" role="menuitem" tabindex="-1" data-ws-dup={s.id} disabled={busy === s.id} onclick={() => choose(s, () => dup(s))}
										><CopyPlus size={16} aria-hidden="true" /> Duplicate</button
									>
									<button type="button" role="menuitem" tabindex="-1" data-ws-rename={s.id} onclick={() => choose(s, () => startRename(s))}
										><Tag size={16} aria-hidden="true" /> Rename</button
									>
									<div class="sep" role="separator"></div>
									<button type="button" role="menuitem" tabindex="-1" class="danger" data-ws-del={s.id} onclick={() => choose(s, () => askDelete(s))}
										><Trash2 size={16} aria-hidden="true" /> Delete</button
									>
								</div>
							{/if}
						</div>
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
							<input
								id="ab-rename-{s.id}"
								class="field"
								maxlength="60"
								dir="auto"
								placeholder="New name"
								bind:value={newName}
								onkeydown={(e) => {
									if (e.key === 'Escape') {
										renaming = null;
										moreOf(s.id)?.focus();
									}
								}}
							/>
							<button type="submit" class="btn-primary small" id="ab-rename-ok" disabled={busy === s.id}>Save name</button>
							<button
								type="button"
								class="btn-ghost small"
								onclick={() => {
									renaming = null;
									moreOf(s.id)?.focus();
								}}>Cancel</button
							>
						</form>
					{/if}
					{#if asking === s.id}
						<div class="ask">
							<p dir="auto">Delete “{name}”? Its class code and link stop working for everyone.</p>
							<div class="row">
								<button type="button" class="btn-primary small danger-fill" id="ab-my-delyes" disabled={busy === s.id} onclick={() => del(s)}><Trash2 size={15} aria-hidden="true" /> Delete</button>
								<button
									type="button"
									class="btn-ghost small"
									id="ab-my-delno"
									onclick={() => {
										asking = null;
										moreOf(s.id)?.focus();
									}}>Keep it</button
								>
							</div>
						</div>
					{/if}
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
		gap: 0.5rem;
		padding: 0.3rem;
		border: 1px solid var(--line);
		border-radius: 14px;
		background: var(--paper);
		box-shadow: 0 1px 2px rgb(29 40 56 / 0.06);
	}
	.card:has(.open:hover) {
		border-color: var(--line-strong);
	}
	.line {
		display: flex;
		align-items: center;
		gap: 0.15rem;
	}
	.open {
		display: flex;
		flex: 1;
		flex-direction: column;
		gap: 0.2rem;
		min-width: 0;
		min-height: 3.25rem;
		padding: 0.55rem 0.8rem;
		border: 0;
		border-radius: 10px;
		background: none;
		color: var(--ink);
		font: inherit;
		text-align: start;
		cursor: pointer;
	}
	.title {
		font-size: 1.1rem;
		font-weight: 800;
		overflow-wrap: anywhere;
	}
	.meta {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.15rem 0.5rem;
		color: var(--muted);
		font-size: 0.88rem;
	}
	.code {
		padding: 0 0.5rem;
		border: 1px solid var(--line);
		border-radius: 999px;
		background: var(--paper-low);
		color: var(--ink);
		white-space: nowrap;
	}
	.code b {
		font-family: ui-monospace, monospace;
		letter-spacing: 0.06em;
	}
	.menu-wrap {
		position: relative;
		flex: none;
	}
	.iconbtn {
		display: grid;
		place-items: center;
		width: 44px;
		height: 44px;
		padding: 0;
		border: 0;
		border-radius: 50%;
		background: none;
		color: var(--muted);
		cursor: pointer;
	}
	.iconbtn:hover,
	.iconbtn[aria-expanded='true'] {
		background: var(--paper-low);
		color: var(--ink);
	}
	.menu {
		position: absolute;
		top: calc(100% + 0.3rem);
		right: 0;
		z-index: 5;
		display: flex;
		flex-direction: column;
		width: max-content;
		min-width: 12rem;
		max-width: min(18rem, calc(100vw - 2.5rem));
		padding: 0.35rem;
		border: 1px solid var(--line);
		border-radius: 12px;
		background: var(--paper);
		box-shadow: 0 10px 28px rgb(29 40 56 / 0.16);
	}
	.menu button[role='menuitem'] {
		display: flex;
		align-items: center;
		gap: 0.55rem;
		min-height: 44px;
		padding: 0.4rem 0.65rem;
		border: 0;
		border-radius: 8px;
		background: none;
		color: var(--ink);
		font: inherit;
		font-size: 0.92rem;
		font-weight: 600;
		text-align: start;
		cursor: pointer;
	}
	.menu button[role='menuitem']:hover:not(:disabled),
	.menu button[role='menuitem']:focus {
		background: var(--paper-low);
	}
	.menu button[role='menuitem']:focus-visible {
		outline-offset: -3px;
	}
	.menu button[role='menuitem'].danger {
		color: var(--bad);
	}
	.sep {
		height: 1px;
		margin: 0.25rem 0.4rem;
		background: var(--line);
	}
	.card > .row,
	.ask,
	.problem {
		margin: 0 0.45rem 0.45rem;
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
