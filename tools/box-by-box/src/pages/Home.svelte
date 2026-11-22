<script lang="ts">
	import { t, tn } from '$lib/i18n';
	// The teacher's activities: a card for each (newest first), a New activity menu, and on each card a menu to open
	// it, copy its student link (saving it first when it hasn't been shared as it is) or delete it.
	import { NAME_HERE as NAME } from '$lib/i18n';
	import { Ellipsis, FolderOpen, Plus } from '@lucide/svelte';
	import { create, isShared, list, loadList, remove, shareActivity, sorted, titleOf, type Activity } from '$lib/activities.svelte';
	import { KINDS, kindInfo, levelInfo, type Kind } from '$lib/logic';
	import { methodInfo } from '$lib/methods';
	import { canListSets, copy, setLink } from '$lib/oomba';
	import { go, show } from '$lib/nav.svelte';
	import Logo from '$lib/Logo.svelte';
	import Footer from '$lib/Footer.svelte';

	loadList();
	const items = $derived(list.loaded ? sorted() : []);

	const open = (a: Activity) => go({ name: 'edit', id: a.id });
	const make = (k: Kind) => open(create(k));
	const snippet = (a: Activity, n?: number) =>
		a.problems
			.slice(0, n)
			.map(([x, y]) => `${x} ${kindInfo(a.kind).sign} ${y}`)
			.join(', ');
	function meta(a: Activity) {
		const { level, perStudent } = a.settings;
		const label = level === 'custom' ? t('ui.home.ownMix') : levelInfo(level)?.label;
		const way = a.settings.method && a.settings.method !== 'standard' ? ` · ${methodInfo(a.kind, a.settings.method).label}` : '';
		return `${kindInfo(a.kind).title} · ${tn('ui.home.problems', a.problems.length)}${way} · ${label}${perStudent ? ` · ${t('ui.home.perStudent')}` : ''}`;
	}

	let newOpen = $state(false);
	let menuFor = $state<string | null>(null);
	let confirmFor = $state<string | null>(null);
	let copied = $state<string | null>(null);
	let working = $state<string | null>(null);
	let problem = $state<{ id: string; text: string } | null>(null);
	let opener: HTMLElement | null = null;
	let newBtn = $state<HTMLButtonElement>();

	function toggleMenu(id: string, el: HTMLElement) {
		menuFor = menuFor === id ? null : id;
		confirmFor = null;
		problem = null;
		opener = el;
	}
	function onKey(e: KeyboardEvent) {
		if (e.key === 'Escape' && newOpen) {
			newOpen = false;
			newBtn?.focus();
		} else if (e.key === 'Escape' && menuFor) {
			menuFor = null;
			confirmFor = null;
			opener?.focus();
		}
	}
	function onClick(e: MouseEvent) {
		if (e.composedPath().some((el) => el instanceof HTMLElement && el.classList.contains('menu-wrap'))) return;
		newOpen = false;
		menuFor = null;
		confirmFor = null;
	}
	async function copyLink(a: Activity) {
		problem = null;
		if (!isShared(a)) {
			working = a.id;
			const r = await shareActivity(a);
			working = null;
			if (r.error) {
				problem = { id: a.id, text: r.error };
				return;
			}
		}
		if (await copy(setLink(a.setId))) {
			copied = a.id;
			setTimeout(() => {
				copied = null;
				menuFor = null;
			}, 1200);
		} else problem = { id: a.id, text: t('ui.home.copyFailed') };
	}
	function del(a: Activity) {
		remove(a.id);
		menuFor = null;
		confirmFor = null;
	}
	$effect(() => {
		document.title = `${NAME} · ${t('ui.home.docTitle')}`;
	});
</script>

<svelte:window onclick={onClick} onkeydown={onKey} />

<div class="page">
	<header class="top">
		<div>
			<div class="top-row">
				<p class="brand"><Logo size={36} /> {NAME}</p>
				<button type="button" class="btn-ghost switch" onclick={() => show({ name: 'start' })}>{t('ui.home.notTeacher')}</button>
			</div>
			<h1>{t('ui.home.title')}</h1>
			<p class="lede">
				{t('ui.home.lede')}
			</p>
		</div>
		<div class="top-actions">
			{#if canListSets()}
				<button type="button" class="btn-ghost" id="bb-ws" onclick={() => go({ name: 'sheets' })}><FolderOpen size={16} aria-hidden="true" /> {t('ui.ws.button')}</button>
			{/if}
			<div class="menu-wrap new-wrap">
				<button type="button" class="btn-primary" aria-haspopup="menu" aria-expanded={newOpen} bind:this={newBtn} onclick={() => (newOpen = !newOpen)}
					><Plus size={16} aria-hidden="true" /> {t('ui.home.new')}</button
				>
				{#if newOpen}
					<div class="menu" role="menu">
						{#each KINDS as k (k.name)}
							<button type="button" role="menuitem" onclick={() => make(k.name)}><b>{k.title}</b> <small>{k.tagline}</small></button>
						{/each}
					</div>
				{/if}
			</div>
		</div>
	</header>

	{#if list.loaded && !items.length}
		<div class="empty">
			<p>{t('ui.home.empty')}</p>
			<div class="empty-actions">
				{#each KINDS as k (k.name)}
					<button type="button" class="btn-ghost" onclick={() => make(k.name)}><Plus size={16} aria-hidden="true" /> {k.title}</button>
				{/each}
			</div>
		</div>
	{/if}

	<ul class="grid">
		{#each items as a (a.id)}
			<li class="card">
				<button type="button" class="open" onclick={() => open(a)}>
					<span class="title-row"><span class="title">{titleOf(a)}</span></span>
					<span class="snippet"
						>{#if a.settings.perStudent}{t('ui.home.freshLike', { x: snippet(a, 3) })}{:else}{snippet(a)}{/if}</span
					>
					<span class="meta">{meta(a)}</span>
				</button>
				<div class="menu-wrap">
					<button
						type="button"
						class="iconbtn"
						aria-haspopup="menu"
						aria-expanded={menuFor === a.id}
						aria-label={t('ui.home.more', { x: titleOf(a) })}
						onclick={(e) => toggleMenu(a.id, e.currentTarget)}><Ellipsis size={18} strokeWidth={3} aria-hidden="true" /></button
					>
					{#if menuFor === a.id}
						<div class="menu" role="menu">
							{#if confirmFor === a.id}
								<p class="confirm">{t('ui.home.deleteAsk', { x: titleOf(a) })}</p>
								<div class="confirm-row">
									<button type="button" class="btn-danger" onclick={() => del(a)}>{t('ui.delete')}</button>
									<button type="button" class="btn-ghost" onclick={() => (confirmFor = null)}>{t('ui.keep')}</button>
								</div>
							{:else}
								<button type="button" role="menuitem" onclick={() => open(a)}>{t('ui.open')}</button>
								<button type="button" role="menuitem" disabled={working === a.id} onclick={() => copyLink(a)}
									>{copied === a.id ? t('ui.home.copied') : working === a.id ? t('ui.saving') : t('ui.home.copyLink')}</button
								>
								<button type="button" role="menuitem" class="danger" onclick={() => (confirmFor = a.id)}>{t('ui.delete')}</button>
								{#if problem?.id === a.id}<p class="problem" role="alert">{problem.text}</p>{/if}
							{/if}
						</div>
					{/if}
				</div>
			</li>
		{/each}
	</ul>

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
		display: flex;
		justify-content: space-between;
		align-items: flex-end;
		gap: 1rem;
		margin-bottom: 1.75rem;
	}
	@media (max-width: 40rem) {
		.top {
			flex-wrap: wrap;
		}
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
		margin: 0.9rem 0 0;
		font-size: 2.1rem;
		font-weight: 800;
		line-height: 1.15;
	}
	.lede {
		max-width: 44rem;
		margin: 0.35rem 0 0;
		color: var(--muted);
		line-height: 1.5;
	}
	.top-actions {
		display: flex;
		flex: none;
		align-self: flex-start;
		gap: 0.5rem;
	}
	.menu-wrap {
		position: absolute;
		top: 0.6rem;
		right: 0.6rem;
	}
	.menu-wrap.new-wrap {
		position: relative;
		top: auto;
		right: auto;
	}
	.menu {
		position: absolute;
		top: calc(100% + 0.3rem);
		right: 0;
		z-index: 5;
		display: flex;
		flex-direction: column;
		min-width: 13rem;
		padding: 0.35rem;
		border: 2px solid var(--line);
		border-radius: 14px;
		background: var(--paper);
		box-shadow: 0 10px 28px rgb(20 20 20 / 0.16);
	}
	.new-wrap .menu {
		min-width: 17rem;
	}
	@media (max-width: 40rem) {
		/* The header wraps, so New activity sits at the left: open the menu to the right of it, within the screen. */
		.new-wrap .menu {
			right: auto;
			left: 0;
			min-width: 0;
			width: min(20rem, calc(100vw - 2.5rem));
		}
	}
	.menu button[role='menuitem'] {
		padding: 0.5rem 0.65rem;
		border: 0;
		border-radius: 8px;
		background: none;
		color: var(--ink);
		font: inherit;
		font-size: 0.9rem;
		text-align: left;
		cursor: pointer;
	}
	.menu button[role='menuitem']:hover:not(:disabled) {
		background: var(--paper-low);
	}
	.menu button[role='menuitem'] b,
	.menu button[role='menuitem'] small {
		display: block;
	}
	.menu button[role='menuitem'] small {
		color: var(--muted);
		font-size: 0.8rem;
	}
	.menu .danger {
		color: var(--bad);
	}
	.confirm {
		margin: 0;
		padding: 0.35rem 0.45rem;
		font-size: 0.88rem;
	}
	.confirm-row {
		display: flex;
		gap: 0.4rem;
		padding: 0 0.35rem 0.35rem;
	}
	.confirm-row button {
		padding: 0.4rem 0.75rem;
		font-size: 0.85rem;
	}
	.problem {
		max-width: 15rem;
		margin: 0.2rem 0.45rem 0.3rem;
		color: var(--bad);
		font-size: 0.82rem;
		font-weight: 600;
		line-height: 1.35;
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
	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(17rem, 1fr));
		gap: 1.1rem;
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.card {
		position: relative;
		border: 2px solid var(--line);
		border-radius: var(--radius-lg);
		background: var(--paper);
		transition: border-color 0.15s;
	}
	.card:hover {
		border-color: var(--line-strong);
	}
	.open {
		display: flex;
		flex-direction: column;
		gap: 0.45rem;
		width: 100%;
		padding: 0.9rem 1rem 0.85rem;
		border: 0;
		border-radius: var(--radius-lg);
		background: none;
		color: var(--ink);
		font: inherit;
		text-align: left;
		cursor: pointer;
	}
	.title-row {
		display: flex;
		align-items: baseline;
		gap: 0.5rem;
		padding-right: 2.2rem;
	}
	.title {
		overflow: hidden;
		font-size: 1.1rem;
		font-weight: 800;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.snippet {
		display: -webkit-box;
		overflow: hidden;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		color: var(--ink-soft);
		font-size: 0.92rem;
		line-height: 1.5;
		font-variant-numeric: tabular-nums;
	}
	.meta {
		color: var(--muted);
		font-size: 0.82rem;
	}
	.iconbtn {
		display: grid;
		place-items: center;
		width: 2rem;
		height: 2rem;
		border: 2px solid transparent;
		border-radius: 10px;
		background: none;
		color: var(--ink-soft);
		cursor: pointer;
	}
	.iconbtn:hover,
	.iconbtn[aria-expanded='true'] {
		border-color: var(--line-strong);
		background: var(--paper-low);
	}
</style>
