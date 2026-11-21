<script lang="ts">
	import { t, tn, LANG, NAME_HERE as NAME } from '$lib/i18n';
	// My worksheets: every activity this teacher saved on Oomba (school staff: BRB.canListSets), newest first, with its
	// class code. Each is one quiet row: the row opens it in the editor (saving keeps the same link and code); beside it
	// only Print and a More menu (answer key, Copy link, Duplicate, Rename, Delete after a confirm). Its own printed
	// instructions stay with its activity.
	import { tick } from 'svelte';
	import { Copy, CopyPlus, Ellipsis, FolderOpen, KeyRound, Plus, Printer, Tag, Trash2 } from '@lucide/svelte';
	import { deletedSet, openSaved, printNoteFor, renamedSet } from '$lib/activities.svelte';
	import { kindInfo, parseItem, toItem } from '$lib/logic';
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
	/** The row whose More menu is open. */
	let menuFor = $state<string | null>(null);
	const printing = canPrint();
	const keys = canPrint() && canAssign();

	async function load(focus?: string) {
		failed = false;
		const r = await listSets();
		if ('sets' in r && Array.isArray(r.sets)) {
			sets = r.sets;
			if (focus) setTimeout(() => (document.querySelector(`[data-set="${focus}"] [data-ws-open]`) as HTMLElement | null)?.focus(), 0);
		} else failed = true;
	}
	load();
	$effect(() => {
		document.title = `${NAME} · ${t('ui.ws.title')}`;
	});

	const date = (ts: number) => {
		try {
			const d = new Date(ts);
			const thisYear = d.getFullYear() === new Date().getFullYear();
			return new Intl.DateTimeFormat(LANG, { day: 'numeric', month: 'short', ...(thisYear ? {} : { year: 'numeric' }) })
				.format(d)
				.replace(/ /g, '\u00a0'); // a date stays on one line
		} catch {
			return '';
		}
	};
	const playable = (s: MySet) => parseItem(s.items[0]);
	const nameOf = (s: MySet) => {
		const p = playable(s);
		return s.title.trim() || (p ? kindInfo(p.kind).title : s.label);
	};
	/** One quiet line: how many problems, the kind (and its way, when not the usual one), the date it was saved. */
	function meta(s: MySet) {
		const p = playable(s);
		const day = s.updated ? date(s.updated) : '';
		if (!p) return [s.label, day].filter(Boolean).join(' · ');
		const way = p.settings.method && p.settings.method !== 'standard' ? ` (${methodInfo(p.kind, p.settings.method).label})` : '';
		return [tn('ui.home.problems', s.n), kindInfo(p.kind).title + way, day].filter(Boolean).join(' · ');
	}
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
		if (await copy(setLink(s.id))) tell(t('ui.home.copied'));
		else note = { id: s.id, text: t('ui.home.copyFailed') };
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
	function askDelete(s: MySet) {
		asking = s.id;
		renaming = null;
		note = null;
		setTimeout(() => document.getElementById('bb-ws-delno')?.focus(), 0);
	}
	const moreOf = (id: string) => document.querySelector<HTMLElement>(`[data-ws-more="${id}"]`);
	const itemsOf = () => [...document.querySelectorAll<HTMLElement>('.menu [role="menuitem"]')];
	/** Open (or close) a row's More menu, with the focus on its first item (its last, from the up arrow). */
	async function toggleMenu(s: MySet, last = false) {
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
	async function choose(s: MySet, act: () => unknown) {
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

<svelte:window onpointerdown={outside} />

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
					<div class="line">
						<button type="button" class="open" data-ws-open={s.id} onclick={() => open(s)}>
							<span class="title" dir="auto">{name}</span>
							<span class="meta"
								><span>{meta(s)}</span>
								<span class="code" title={t('ui.classCode')}><span class="sr-only">{t('ui.classCode')} </span><b dir="ltr">{s.code}</b></span></span
							>
						</button>
						<div class="tools">
							{#if printing}
								<button type="button" class="iconbtn" data-ws-print={s.id} title={t('ui.print.sheet')} aria-label="{t('ui.print.sheet')}: {name}" onclick={() => print(s, false)}
									><Printer size={20} aria-hidden="true" /></button
								>
							{/if}
							<div class="menu-wrap">
								<button
									type="button"
									class="iconbtn"
									data-ws-more={s.id}
									aria-haspopup="menu"
									aria-expanded={menuFor === s.id}
									aria-label={t('ui.home.more', { x: name })}
									onclick={() => toggleMenu(s)}
									onkeydown={(e) => {
										if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && menuFor !== s.id) {
											e.preventDefault();
											toggleMenu(s, e.key === 'ArrowUp');
										}
									}}><Ellipsis size={20} strokeWidth={2.5} aria-hidden="true" /></button
								>
								{#if menuFor === s.id}
									<div class="menu" role="menu" tabindex="-1" aria-label={t('ui.home.more', { x: name })} onkeydown={menuKey}>
										{#if keys}
											<button type="button" role="menuitem" tabindex="-1" data-ws-key={s.id} onclick={() => choose(s, () => print(s, true))}
												><KeyRound size={16} aria-hidden="true" /> {t('ui.ws.printKey')}</button
											>
										{/if}
										<button type="button" role="menuitem" tabindex="-1" data-ws-copy={s.id} onclick={() => choose(s, () => copyLink(s))}
											><Copy size={16} aria-hidden="true" /> {t('ui.share.copyLink')}</button
										>
										<button type="button" role="menuitem" tabindex="-1" data-ws-dup={s.id} disabled={busy === s.id} onclick={() => choose(s, () => dup(s))}
											><CopyPlus size={16} aria-hidden="true" /> {t('ui.ws.dup')}</button
										>
										<button type="button" role="menuitem" tabindex="-1" data-ws-rename={s.id} onclick={() => choose(s, () => startRename(s))}
											><Tag size={16} aria-hidden="true" /> {t('ui.ws.rename')}</button
										>
										<div class="sep" role="separator"></div>
										<button type="button" role="menuitem" tabindex="-1" class="danger" data-ws-del={s.id} onclick={() => choose(s, () => askDelete(s))}
											><Trash2 size={16} aria-hidden="true" /> {t('ui.delete')}</button
										>
									</div>
								{/if}
							</div>
						</div>
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
							<input
								id="bb-rename-{s.id}"
								class="field"
								maxlength="60"
								dir="auto"
								placeholder={t('ui.ws.renameLabel')}
								bind:value={newName}
								onkeydown={(e) => {
									if (e.key === 'Escape') {
										renaming = null;
										moreOf(s.id)?.focus();
									}
								}}
							/>
							<button type="submit" class="btn-primary small" id="bb-rename-ok" disabled={busy === s.id}>{t('ui.ws.renameSave')}</button>
							<button
								type="button"
								class="btn-ghost small"
								onclick={() => {
									renaming = null;
									moreOf(s.id)?.focus();
								}}>{t('ui.ws.cancel')}</button
							>
						</form>
					{/if}
					{#if asking === s.id}
						<div class="ask">
							<p dir="auto">{t('ui.ws.deleteAsk', { x: name })}</p>
							<div class="ask-row">
								<button type="button" class="btn-danger small" id="bb-ws-delyes" disabled={busy === s.id} onclick={() => del(s)}><Trash2 size={15} aria-hidden="true" /> {t('ui.delete')}</button>
								<button
									type="button"
									class="btn-ghost small"
									id="bb-ws-delno"
									onclick={() => {
										asking = null;
										moreOf(s.id)?.focus();
									}}>{t('ui.keep')}</button
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
		gap: 0.6rem;
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.card {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		padding: 0.3rem;
		border: 2px solid var(--line);
		border-radius: var(--radius-lg);
		background: var(--paper);
		transition: border-color 0.15s;
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
		padding: 0.55rem 0.75rem;
		border: 0;
		border-radius: calc(var(--radius-lg) - 6px);
		background: none;
		color: var(--ink);
		font: inherit;
		text-align: start;
		cursor: pointer;
	}
	.title {
		overflow-wrap: anywhere;
		font-size: 1.1rem;
		font-weight: 800;
	}
	.meta {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.15rem 0.5rem;
		color: var(--muted);
		font-size: 0.85rem;
	}
	.code {
		padding: 0 0.5rem;
		border: 1px solid var(--line);
		border-radius: 999px;
		background: var(--paper-low);
		color: var(--ink-soft);
		white-space: nowrap;
	}
	.code b {
		font-family: ui-monospace, monospace;
		letter-spacing: 0.06em;
	}
	.tools {
		display: flex;
		flex: none;
		align-items: center;
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
		color: var(--ink-soft);
		cursor: pointer;
	}
	.iconbtn:hover,
	.iconbtn[aria-expanded='true'] {
		background: var(--paper-low);
		color: var(--ink);
	}
	.menu-wrap {
		position: relative;
	}
	.menu {
		position: absolute;
		top: calc(100% + 0.3rem);
		right: 0;
		z-index: 5;
		display: flex;
		flex-direction: column;
		width: max-content;
		min-width: 13rem;
		max-width: min(18rem, calc(100vw - 2.5rem));
		padding: 0.35rem;
		border: 2px solid var(--line);
		border-radius: 14px;
		background: var(--paper);
		box-shadow: 0 10px 28px rgb(20 20 20 / 0.16);
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
	.ask-row,
	.rename {
		display: flex;
		flex-wrap: wrap;
		gap: 0.45rem;
	}
	.rename,
	.ask,
	.problem {
		margin: 0 0.45rem 0.45rem;
	}
	.small {
		padding: 0.4rem 0.8rem;
		font-size: 0.88rem;
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
