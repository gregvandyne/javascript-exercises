<script lang="ts">
	// Oomba: a question set. A teacher puts up to 20 questions together, from any activity (each made on that
	// activity's own setup page), saves the set on Oomba and shares one link and QR code for all of them. Students
	// answer them in order. A saved set keeps its link when it is changed and saved again.
	import { ArrowDown, ArrowUp, Check, Copy, Dices, ExternalLink, GraduationCap, Minus, Pencil, Plus, QrCode, Trash2 } from '@lucide/svelte';
	import { prettyText, type Activity } from '$lib/algebra';
	import { ACTIVITIES } from '$lib/activities';
	import { go, goBack, sets } from '$lib/nav.svelte';
	import { MAX_ITEMS, assignLink, canAssign, canSaveSets, classCode, isPreview, copy, keepMySet, saveSet, setLink, type Item } from '$lib/oomba';
	import { LEVELS, generate, type Level } from '$lib/practice';
	import { makeQr, qrExtent, qrPath, qrPng } from '$lib/qr';
	import Footer from '$lib/Footer.svelte';
	import Logo from '$lib/Logo.svelte';

	if (!sets.draft) sets.draft = { items: [], id: null, saved: false };
	const d = $derived(sets.draft!);

	const KIND: Record<Activity, string> = { solve: 'Solve', multiply: 'Multiply', factor: 'Factor' };
	const setting = (it: Item) =>
		it.a === 'solve' ? (it.l ? 'Live balance' : 'Balance off') : it.s === 'none' ? 'No tiles to start' : 'All tiles to start';

	function add(a: Activity) {
		if (d.items.length >= MAX_ITEMS) return;
		go({ name: 'setup', activity: a, forSet: d.items.length });
	}
	function edit(i: number) {
		const it = d.items[i];
		go({ name: 'setup', activity: it.a, text: it.p, start: it.s, live: it.l, forSet: i });
	}
	function move(i: number, by: number) {
		const j = i + by;
		if (j < 0 || j >= d.items.length) return;
		const list = [...d.items];
		[list[i], list[j]] = [list[j], list[i]];
		d.items = list;
		d.saved = false;
	}
	function remove(i: number) {
		d.items = d.items.filter((_, k) => k !== i);
		d.saved = false;
	}
	function fresh() {
		sets.draft = { items: [], id: null, saved: false };
		problem = '';
	}

	// --- saving and sharing ---

	let saving = $state(false);
	let problem = $state('');
	const why: Record<string, string> = {
		guest: 'Sign in to Oomba to save a question set and get its link.',
		preview: 'Question set links work in the published game, not in a preview.',
		full: 'You have saved as many question sets as you can. Change one of yours instead.',
		bad: 'Something in this set can’t be saved. Check each question works.',
		notYours: 'This set belongs to someone else. Save it as a new set instead.',
		offline: 'Couldn’t save just now. Check your connection and try again.'
	};
	const able = canSaveSets();
	async function save(asNew = false) {
		if (!d.items.length || saving) return;
		saving = true;
		problem = '';
		const r = await saveSet(
			d.items.map((i) => ({ ...i })),
			asNew ? null : d.id
		);
		saving = false;
		if (r.id) {
			d.id = r.id;
			d.saved = true;
			keepMySet(r.id, d.items.map((i) => ({ ...i })));
		} else problem = why[r.error ?? 'offline'] ?? why.offline;
	}

	const link = $derived(d.id ? setLink(d.id) : '');
	const qr = $derived(link ? makeQr(link) : null);
	let copied = $state<'link' | 'qr' | null>(null);
	let timer: ReturnType<typeof setTimeout>;
	function flash(what: 'link' | 'qr') {
		copied = what;
		clearTimeout(timer);
		timer = setTimeout(() => (copied = null), 1500);
	}
	async function copyLink() {
		if (await copy(link)) flash('link');
	}
	async function copyQr() {
		if (!qr) return;
		try {
			if (await copy(await qrPng(qr))) flash('qr');
		} catch {
			/* no copy */
		}
	}
	// --- Make questions for me: how many of each activity, and how hard; the game makes them (new ones each time) ---
	let mix = $state<Record<Activity, number>>({ solve: 4, multiply: 3, factor: 3 });
	let genLevel = $state<Level>('easy');
	let replace = $state(true);
	const room = $derived(replace ? MAX_ITEMS : MAX_ITEMS - d.items.length);
	const wanted = $derived(mix.solve + mix.multiply + mix.factor);
	function bump(a: Activity, by: number) {
		const n = Math.max(0, Math.min(MAX_ITEMS, mix[a] + by));
		if (by > 0 && wanted >= room) return;
		mix = { ...mix, [a]: n };
	}
	let made = $state('');
	function makeThem() {
		if (!wanted || wanted > room) return;
		const have = new Set((replace ? [] : d.items).map((i) => `${i.a}|${i.p}`));
		const fresh: Item[] = [];
		for (const a of ['solve', 'multiply', 'factor'] as Activity[]) {
			if (!mix[a]) continue;
			const avoid = new Set([...have].filter((k) => k.startsWith(`${a}|`)).map((k) => k.slice(a.length + 1)));
			for (const p of generate(a, genLevel, mix[a], avoid)) fresh.push({ a, p, s: 'all', l: true });
		}
		d.items = replace ? fresh : [...d.items, ...fresh];
		d.saved = false;
		made = `Made ${fresh.length} question${fresh.length === 1 ? '' : 's'}. Change, move or remove any of them, then save.`;
	}

	const tryIt = () => go({ name: 'set-play', items: d.items.map((i) => ({ ...i })), from: 'set' });
</script>

<div class="page">
	<button type="button" class="brand" onclick={() => go({ name: 'home' })}>
		<Logo size={28} /> Algebra Builder
	</button>
	<header class="bar">
		<button type="button" class="btn-ghost back" onclick={goBack}>← Back</button>
		<h1>Question set</h1>
	</header>
	<p class="lede">
		Put up to {MAX_ITEMS} questions together, from any activity. Students answer them in order, with Check at every
		step, on one link.
	</p>

	<div class="columns">
		<section class="card">
			<h2>Questions <span class="count">{d.items.length} of {MAX_ITEMS}</span></h2>
			{#if d.items.length}
				<ol class="items">
					{#each d.items as it, i (i + it.a + it.p)}
						<li class="item">
							<span class="num">{i + 1}</span>
							<span class="kind">{KIND[it.a]}</span>
							<span class="what">
								<span class="problem">{prettyText(it.p)}</span>
								<span class="setting">{setting(it)}</span>
							</span>
							<span class="tools">
								<button type="button" class="icon" aria-label="Change question {i + 1}" onclick={() => edit(i)}
									><Pencil size={16} /></button
								>
								<button
									type="button"
									class="icon"
									aria-label="Move question {i + 1} up"
									disabled={i === 0}
									onclick={() => move(i, -1)}><ArrowUp size={16} /></button
								>
								<button
									type="button"
									class="icon"
									aria-label="Move question {i + 1} down"
									disabled={i === d.items.length - 1}
									onclick={() => move(i, 1)}><ArrowDown size={16} /></button
								>
								<button type="button" class="icon" aria-label="Remove question {i + 1}" onclick={() => remove(i)}
									><Trash2 size={16} /></button
								>
							</span>
						</li>
					{/each}
				</ol>
			{:else}
				<p class="empty">No questions yet. Add the first one below.</p>
			{/if}

			<div class="gen">
				<h3><Dices size={18} /> Make questions for me</h3>
				<p class="gen-about">Choose how many of each, and how hard. New problems every time.</p>
				<div class="mix">
					{#each ACTIVITIES as a (a.activity)}
						<div class="mix-row">
							<span class="mix-name">{a.name}</span>
							<span class="stepper" role="group" aria-label="{a.name}: how many">
								<button type="button" class="icon" aria-label="One fewer {a.name}" disabled={mix[a.activity] === 0} onclick={() => bump(a.activity, -1)}><Minus size={16} /></button>
								<span class="count-n" aria-live="polite">{mix[a.activity]}</span>
								<button type="button" class="icon" aria-label="One more {a.name}" disabled={wanted >= room} onclick={() => bump(a.activity, 1)}><Plus size={16} /></button>
							</span>
						</div>
					{/each}
				</div>
				<div class="gen-levels" role="radiogroup" aria-label="How hard">
					{#each LEVELS as l (l.level)}
						<button type="button" role="radio" aria-checked={genLevel === l.level} class="seg" class:on={genLevel === l.level} onclick={() => (genLevel = l.level)}>{l.name}</button>
					{/each}
				</div>
				{#if d.items.length}
					<label class="replace"><input type="checkbox" bind:checked={replace} /> Replace the questions already here</label>
				{/if}
				<button type="button" class="btn-primary gen-go" disabled={!wanted || wanted > room} onclick={makeThem}>
					<Dices size={16} /> Make {wanted} question{wanted === 1 ? '' : 's'}
				</button>
				{#if wanted > room}<p class="note">A set holds up to {MAX_ITEMS} questions{replace ? '' : `: there’s room for ${room} more`}.</p>{/if}
				{#if made}<p class="note" role="status">{made}</p>{/if}
			</div>

			<h3>Or add one at a time</h3>
			{#if d.items.length >= MAX_ITEMS}
				<p class="empty">This set has {MAX_ITEMS} questions, the most a set can have.</p>
			{:else}
				<div class="adds">
					{#each ACTIVITIES as a (a.activity)}
						<button type="button" class="btn-ghost add" onclick={() => add(a.activity)}>
							<Plus size={16} />
							{a.name}
						</button>
					{/each}
				</div>
			{/if}
		</section>

		<section class="card share">
			<h2>Share it</h2>
			{#if !able}
				<p class="note">{why[isPreview() ? 'preview' : 'guest']}</p>
			{:else}
				<div class="buttons">
					<button
						type="button"
						class="btn-primary"
						disabled={!d.items.length || saving || d.saved}
						onclick={() => save()}
					>
						{#if d.saved}<Check size={16} /> Saved{:else if saving}Saving…{:else if d.id}Save changes{:else}Save and get link{/if}
					</button>
				</div>
				{#if d.id && !d.saved}
					<p class="note">Saving changes keeps the same link. Students who open it get the new questions.</p>
				{/if}
				{#if problem}<p class="note bad" role="alert">{problem}</p>{/if}
			{/if}

			{#if link}
				<div class="code-box">
					<span class="code-label">Class code</span>
					<span class="code-val">{classCode(d.id ?? '')}</span>
					<span class="code-hint">Students choose “I’m a student” and type it.</span>
				</div>
				<p class="link" title={link}>{link}</p>
				<div class="buttons">
					<button type="button" class="btn-primary" onclick={copyLink}>
						{#if copied === 'link'}<Check size={16} /> Copied{:else}<Copy size={16} /> Copy set link{/if}
					</button>
					{#if canAssign()}
						<button type="button" class="btn-ghost" disabled={!d.saved} onclick={() => assignLink(link)}
							><GraduationCap size={16} /> Assign to a class</button
						>
					{/if}
				</div>
				{#if canAssign() && !d.saved}<p class="note">Save your changes to assign the set.</p>{/if}
			{/if}
			<div class="buttons">
				<button type="button" class="btn-ghost" disabled={!d.items.length} onclick={tryIt}
					><ExternalLink size={16} /> Try it as a student</button
				>
			</div>
			<div class="qr">
				{#if qr}
					<svg
						viewBox="0 0 {qrExtent(qr)} {qrExtent(qr)}"
						width="180"
						height="180"
						role="img"
						aria-label="QR code for the set link"
					>
						<rect width="100%" height="100%" fill="#fff" />
						<path d={qrPath(qr)} fill="#000" />
					</svg>
					<button type="button" class="btn-ghost" onclick={copyQr}>
						{#if copied === 'qr'}<Check size={16} /> Copied{:else}<Copy size={16} /> Copy QR code{/if}
					</button>
				{:else}
					<div class="qr-waiting"><QrCode size={40} aria-hidden="true" /></div>
					<p class="note">The link and QR code appear here once the set is saved.</p>
				{/if}
			</div>
			{#if d.items.length}
				<button type="button" class="btn-ghost fresh" onclick={fresh}>Start a new set</button>
			{/if}
		</section>
	</div>

	<Footer />
</div>

<style>
	.page {
		max-width: 72rem;
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
		font-size: 2.1rem;
		font-weight: 800;
		line-height: 1.1;
	}
	.lede {
		margin-top: 0.6rem;
		color: var(--muted);
	}
	.columns {
		display: grid;
		grid-template-columns: minmax(0, 1fr) 21rem;
		gap: 1.25rem;
		align-items: start;
	}
	.columns > .share {
		position: sticky;
		top: 1.25rem;
	}
	@media (max-width: 960px) {
		.columns {
			grid-template-columns: minmax(0, 1fr);
		}
		.columns > .share {
			position: static;
		}
	}
	.card {
		margin-top: 1.25rem;
		padding: 1.25rem;
		border: 1px solid var(--line);
		border-radius: 14px;
		background: var(--paper);
		box-shadow: 0 1px 2px rgb(29 40 56 / 0.06);
	}
	h2 {
		display: flex;
		align-items: baseline;
		gap: 0.6rem;
		font-size: 1.1rem;
		font-weight: 700;
	}
	.count {
		color: var(--muted);
		font-size: 0.9rem;
		font-weight: 600;
	}
	h3 {
		margin-top: 1.4rem;
		font-size: 0.95rem;
		font-weight: 700;
	}
	.items {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		margin-top: 0.9rem;
		padding: 0;
		list-style: none;
	}
	.item {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.6rem 0.75rem;
		border: 2px solid var(--line);
		border-radius: 12px;
		background: var(--ground);
	}
	.num {
		display: grid;
		flex: none;
		place-items: center;
		width: 1.8rem;
		height: 1.8rem;
		border-radius: 50%;
		background: var(--ink);
		color: var(--paper);
		font-size: 0.85rem;
		font-weight: 800;
	}
	.kind {
		flex: none;
		padding: 0.15rem 0.55rem;
		border-radius: 999px;
		background: var(--accent-wash);
		color: var(--accent);
		font-size: 0.72rem;
		font-weight: 800;
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}
	.what {
		display: flex;
		flex: 1;
		flex-direction: column;
		min-width: 0;
	}
	.problem {
		font-size: 1.05rem;
		font-weight: 700;
	}
	.setting {
		color: var(--muted);
		font-size: 0.82rem;
	}
	.tools {
		display: flex;
		flex: none;
		gap: 0.15rem;
	}
	.icon {
		display: grid;
		place-items: center;
		width: 2.25rem;
		height: 2.25rem;
		border: 0;
		border-radius: 10px;
		background: none;
		color: var(--ink);
		cursor: pointer;
	}
	.icon:hover:not(:disabled) {
		background: var(--accent-wash);
	}
	.icon:disabled {
		opacity: 0.3;
		cursor: default;
	}
	.empty {
		margin-top: 0.75rem;
		color: var(--muted);
	}
	.adds {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		margin-top: 0.6rem;
	}
	.buttons {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		margin-top: 0.75rem;
	}
	.note {
		margin-top: 0.6rem;
		color: var(--muted);
		font-size: 0.9rem;
		line-height: 1.4;
	}
	.note.bad {
		color: #a4332a;
	}
	.link {
		margin-top: 0.75rem;
		padding: 0.6rem 0.75rem;
		overflow: hidden;
		border-radius: 8px;
		background: var(--ground);
		font-family: ui-monospace, monospace;
		font-size: 0.85rem;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.qr {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.75rem;
		margin-top: 1rem;
		padding-top: 1rem;
		border-top: 1px solid var(--line);
		text-align: center;
	}
	.qr-waiting {
		display: grid;
		place-items: center;
		width: 180px;
		height: 120px;
		border: 2px dashed var(--line);
		border-radius: 12px;
		color: var(--muted);
	}
	.gen {
		margin-top: 1.4rem;
		padding: 1rem;
		border: 2px dashed var(--line-strong);
		border-radius: 16px;
		background: var(--ground);
	}
	.gen h3 {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		margin-top: 0;
	}
	.gen-about {
		margin-top: 0.2rem;
		color: var(--muted);
		font-size: 0.9rem;
	}
	.mix {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 0.5rem;
		margin-top: 0.75rem;
	}
	.mix-row {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.35rem;
		padding: 0.6rem 0.4rem;
		border: 1px solid var(--line);
		border-radius: 12px;
		background: var(--paper);
		text-align: center;
	}
	.mix-name {
		font-size: 0.9rem;
		font-weight: 700;
	}
	.stepper {
		display: flex;
		align-items: center;
		gap: 0.3rem;
	}
	.count-n {
		min-width: 1.6rem;
		font-size: 1.3rem;
		font-weight: 800;
		text-align: center;
	}
	.gen-levels {
		display: flex;
		gap: 0.3rem;
		margin-top: 0.75rem;
		padding: 0.25rem;
		border-radius: 999px;
		background: var(--paper);
		border: 1px solid var(--line);
	}
	.seg {
		flex: 1;
		padding: 0.45rem 0.6rem;
		border: 0;
		border-radius: 999px;
		background: none;
		color: var(--ink);
		font: inherit;
		font-weight: 700;
		cursor: pointer;
	}
	.seg.on {
		background: var(--oomba-green);
	}
	.replace {
		display: flex;
		align-items: center;
		gap: 0.45rem;
		margin-top: 0.7rem;
		font-size: 0.9rem;
	}
	.gen-go {
		margin-top: 0.75rem;
	}
	.code-box {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.15rem;
		margin-top: 0.9rem;
		padding: 0.75rem;
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
		font: 800 1.7rem/1.1 ui-monospace, monospace;
		letter-spacing: 0.08em;
	}
	.code-hint {
		color: var(--muted);
		font-size: 0.82rem;
	}
	@media (max-width: 520px) {
		.mix {
			grid-template-columns: minmax(0, 1fr);
		}
		.mix-row {
			flex-direction: row;
			justify-content: space-between;
		}
	}
	.fresh {
		width: 100%;
		margin-top: 1rem;
	}
	@media (max-width: 520px) {
		.item {
			flex-wrap: wrap;
		}
		.tools {
			width: 100%;
			justify-content: flex-end;
		}
	}
</style>
