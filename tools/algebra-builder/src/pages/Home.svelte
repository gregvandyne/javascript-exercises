<script lang="ts">
	// The teacher's page: every activity as a card with a worked example drawn
	// in tiles. On a wide screen the page is two panels the height of the
	// window: the cards scroll on their own, and the chosen one's details stay
	// put beside them. On a narrow one, tapping a card slides them up in a drawer. Either
	// way, Set up goes to the activity's own page to make an activity link.
	// On Oomba the drawer is not a history entry (the game frame's history would fight the play page's): it closes on
	// a drag down, a tap outside, Escape or its close button. The original's "Suggest another activity" card sent an
	// email, which a game can't, so it is left out.
	import { X } from '@lucide/svelte';
	import { onMount, tick, untrack } from 'svelte';
	import { prettyText, type Activity } from '$lib/algebra';
	import { ACTIVITIES, activityInfo, type ActivityInfo } from '$lib/activities';
	import ActivityPicture from '$lib/ActivityPicture.svelte';
	import Footer from '$lib/Footer.svelte';
	import Logo from '$lib/Logo.svelte';
	import { go, goBack, nav, sets } from '$lib/nav.svelte';
	import { mySets, type MySet } from '$lib/oomba';
	import { ListPlus } from '@lucide/svelte';

	// Oomba: question sets. The teacher's saved sets (kept in their game save), newest first.
	const saved: MySet[] = mySets().slice(0, 6);
	const KIND = { solve: 'Solve', multiply: 'Multiply', factor: 'Factor' } as const;
	const kinds = (s: MySet) => [...new Set(s.items.map((i) => KIND[i.a]))].join(', ');
	function newSet() {
		if (!sets.draft || sets.draft.saved) sets.draft = { items: [], id: null, saved: false };
		go({ name: 'set' });
	}
	function openSet(s: MySet) {
		sets.draft = { items: s.items.map((i) => ({ ...i })), id: s.id, saved: true };
		go({ name: 'set' });
	}

	/** Whether the details sit beside the cards, or come up in a drawer. */
	let wide = $state(false);
	/** The activity whose details show beside the cards, on a wide screen. */
	let chosen = $state<Activity>(ACTIVITIES[0].activity);
	onMount(() => {
		const query = window.matchMedia('(min-width: 1024px)');
		const update = () => (wide = query.matches);
		update();
		query.addEventListener('change', update);
		return () => query.removeEventListener('change', update);
	});

	function pick(a: Activity) {
		if (wide) chosen = a;
		else wanted = a;
	}

	// --- the drawer, on narrow screens ---

	let sheet = $state<HTMLDialogElement>();
	/** The activity the drawer shows, kept while it slides away. */
	let shown = $state<Activity | null>(null);
	/** Up on screen, as opposed to sliding in or out. */
	let up = $state(false);
	/** How far the drawer has been dragged down, in pixels. */
	let drag = $state(0);
	let dragging = $state(false);
	/** The activity the drawer is asked to show (null: closed). */
	let wanted = $state<Activity | null>(null);
	const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

	$effect(() => {
		const a = wanted;
		untrack(() => {
			if (a) open(a);
			else if (shown) slideAway();
		});
	});
	// Widening the window with the drawer open shows its activity beside the cards instead.
	$effect(() => {
		if (wide && wanted) {
			chosen = wanted;
			wanted = null;
		}
	});

	async function open(a: Activity) {
		shown = a;
		drag = 0;
		await tick();
		if (!sheet?.open) sheet?.showModal();
		requestAnimationFrame(() => (up = true));
	}

	function slideAway() {
		up = false;
		const done = () => {
			sheet?.close();
			shown = null;
			drag = 0;
		};
		if (reduced()) done();
		else setTimeout(done, 260);
	}

	function close() {
		wanted = null;
	}
	const setUp = (a: Activity) => go({ name: 'setup', activity: a });

	let dragFrom = 0;
	function grab(e: PointerEvent) {
		if ((e.target as HTMLElement).closest('button')) return;
		dragging = true;
		dragFrom = e.clientY;
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
	}
	function pull(e: PointerEvent) {
		if (dragging) drag = Math.max(0, e.clientY - dragFrom);
	}
	function release() {
		if (!dragging) return;
		dragging = false;
		if (drag > 80) close();
		else drag = 0;
	}
</script>


{#snippet details(info: ActivityInfo, large: boolean)}
	<div class="details-picture">
		<ActivityPicture activity={info.activity} scale={large ? 0.56 : 0.66} />
	</div>
	<h2 id="details-{large ? 'panel' : 'sheet'}-title">{info.name}</h2>
	<p class="tagline">{info.tagline}</p>
	<h3>What students do</h3>
	<ol class="steps">
		{#each info.steps as step, i (i)}<li>{step}</li>{/each}
	</ol>
	<h3>Problems like</h3>
	<ul class="problems">
		{#each info.problemsLike as p (p)}<li>{prettyText(p)}</li>{/each}
	</ul>
{/snippet}

<div class="page">
	<div class="cards-side">
		<header>
			<div class="top">
				<p class="brand"><Logo size={40} /> Algebra Builder</p>
				<button type="button" class="btn-ghost switch" onclick={() => (nav.back.length ? goBack() : (nav.view = { name: 'start' }))}>← Not a teacher?</button>
			</div>
			<h1>Choose an activity</h1>
			<p class="lede">Type one problem, then share the activity link with your students. Or put several together in a question set.</p>
		</header>

		<section class="cards" aria-label="Activities">
			<ul class="grid">
				{#each ACTIVITIES as a (a.activity)}
					<li>
						<button
							type="button"
							class="card"
							class:on={chosen === a.activity}
							aria-pressed={wide ? chosen === a.activity : undefined}
							aria-haspopup={wide ? undefined : 'dialog'}
							onclick={() => pick(a.activity)}
						>
							<span class="card-picture"><ActivityPicture activity={a.activity} scale={0.4} /></span
							>
							<span class="name">{a.name}</span>
							<span class="about">{a.tagline}</span>
						</button>
					</li>
				{/each}
			</ul>
		</section>

		<section class="sets" aria-labelledby="sets-title">
			<div class="sets-head">
				<h2 id="sets-title">Question sets</h2>
				<button type="button" class="setup small" onclick={newSet}><ListPlus size={18} /> Make a question set</button>
			</div>
			<p class="sets-about">Up to 20 questions from any activity, on one link. Students answer them in order.</p>
			{#if saved.length}
				<ul class="saved">
					{#each saved as s (s.id)}
						<li>
							<button type="button" class="saved-set" onclick={() => openSet(s)}>
								<span class="saved-n">{s.items.length} question{s.items.length === 1 ? '' : 's'}</span>
								<span class="saved-kinds">{kinds(s)} · starts {prettyText(s.items[0].p)}</span>
							</button>
						</li>
					{/each}
				</ul>
			{/if}
		</section>
	</div>

	<!-- On a wide screen, the chosen activity's details, staying put beside the cards. -->
	<aside class="panel" aria-labelledby="details-panel-title">
		<div class="panel-body">{@render details(activityInfo(chosen), true)}</div>
		<button type="button" class="setup" onclick={() => setUp(chosen)}>Set up {activityInfo(chosen).name} ▸</button>
	</aside>

	<Footer />
</div>

<!-- On a narrow screen, the details slide up from the bottom. -->
<dialog
	bind:this={sheet}
	class="sheet"
	class:up
	class:dragging
	style:--drag="{drag}px"
	aria-labelledby="details-sheet-title"
	oncancel={(e) => {
		e.preventDefault();
		close();
	}}
	onclick={(e) => e.target === sheet && close()}
>
	{#if shown}
		{@const info = activityInfo(shown)}
		<!-- svelte-ignore a11y_no_static_element_interactions (dragging is extra: the close button, Escape and Back close it too) -->
		<div
			class="grab"
			onpointerdown={grab}
			onpointermove={pull}
			onpointerup={release}
			onpointercancel={release}
		>
			<span class="handle" aria-hidden="true"></span>
			<button type="button" class="close" aria-label="Close" onclick={close}>
				<X size={20} />
			</button>
		</div>
		<div class="sheet-body">
			{@render details(info, false)}
		</div>
		<div class="sheet-foot">
			<button type="button" class="setup" onclick={() => { close(); setUp(info.activity); }}>Set up {info.name} ▸</button>
		</div>
	{/if}
</dialog>



<style>
	/* The footer sits at the bottom of the window, or below the cards when
	   they're taller than it. */
	.page {
		display: flex;
		flex-direction: column;
		min-height: 100dvh;
		max-width: 72rem;
		margin: 0 auto;
		padding: 2rem 1.25rem 1.5rem;
	}
	.cards-side {
		flex: 1;
	}
	.top {
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
		gap: 0.6rem;
		color: var(--accent);
		font-size: 1.85rem;
		font-weight: 800;
		letter-spacing: -0.01em;
	}
	h1 {
		margin-top: 1rem;
		font-size: 1.6rem;
		font-weight: 700;
		line-height: 1.15;
	}
	.lede {
		max-width: 44rem;
		margin-top: 0.4rem;
		color: var(--muted);
		line-height: 1.5;
	}
	.cards {
		margin-top: 1.5rem;
	}
	.panel {
		display: none;
	}
	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(10rem, 1fr));
		gap: 0.75rem;
		padding: 0;
		list-style: none;
	}
	.grid li {
		display: flex;
	}
	.card {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
		width: 100%;
		padding: 0.75rem;
		border-radius: 14px;
		color: var(--ink);
		font: inherit;
		text-align: left;
		cursor: pointer;
	}
	.card {
		border: 2px solid var(--line);
		background: var(--paper);
		box-shadow: 0 1px 2px rgb(29 40 56 / 0.06);
		transition:
			border-color 0.15s,
			transform 0.15s;
	}
	.card:hover {
		border-color: var(--line-strong);
		transform: translateY(-2px);
	}
	.card-picture {
		display: grid;
		place-items: center;
		margin-bottom: 0.35rem;
		padding: 0.6rem 0.4rem;
		border-radius: 9px;
		background: var(--ground);
	}
	.name {
		font-size: 1.1rem;
		font-weight: 700;
	}
	.about {
		color: var(--muted);
		font-size: 0.88rem;
		line-height: 1.4;
	}
	.sets {
		margin-top: 2rem;
		padding-top: 1.5rem;
		border-top: 1px solid var(--line);
	}
	.sets-head {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
	}
	.sets h2 {
		font-size: 1.3rem;
		font-weight: 700;
	}
	.sets-about {
		margin-top: 0.3rem;
		color: var(--muted);
	}
	.setup.small {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		width: auto;
		margin: 0;
		padding: 0.6rem 1.1rem;
		font-size: 0.95rem;
	}
	.saved {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(14rem, 1fr));
		gap: 0.6rem;
		margin-top: 0.9rem;
		padding: 0;
		list-style: none;
	}
	.saved-set {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
		width: 100%;
		padding: 0.75rem 0.9rem;
		border: 2px solid var(--line);
		border-radius: 14px;
		background: var(--paper);
		color: var(--ink);
		font: inherit;
		text-align: left;
		cursor: pointer;
	}
	.saved-set:hover {
		border-color: var(--line-strong);
	}
	.saved-n {
		font-weight: 700;
	}
	.saved-kinds {
		color: var(--muted);
		font-size: 0.85rem;
	}
	/* On a wide screen, two panels the height of the window, and the page
	   itself doesn't scroll: the cards scroll on their own, on the left, and
	   the details stay put on the right, scrolling inside only when they're
	   taller than the window, with Set up always at the bottom. */
	@media (min-width: 1024px) {
		.page {
			display: grid;
			grid-template-columns: minmax(0, 1fr) 26rem;
			grid-template-rows: minmax(0, 1fr) auto;
			max-width: 90rem;
			height: 100dvh;
			min-height: 0;
			padding: 0;
			overflow: hidden;
		}
		/* Below both panels, along the bottom of the window. */
		.page.page > :global(footer) {
			grid-column: 1 / -1;
			margin: 0;
			padding: 0.6rem 1rem 0.8rem;
			border-top: 1px solid var(--line);
		}
		.cards-side {
			min-height: 0;
			padding: 2rem 1.5rem 1.5rem 2rem;
			overflow-y: auto;
		}
		.grid {
			grid-template-columns: repeat(auto-fill, minmax(15rem, 1fr));
			gap: 1rem;
		}
		.card-picture {
			--picture-scale: 0.55;
		}
		.card.on {
			border-color: var(--accent);
			background: var(--accent-wash);
		}
		.panel {
			display: flex;
			flex-direction: column;
			/* The column's full height whichever activity is chosen, so Set up
			   stays in the same place at the bottom. */
			min-height: 0;
			margin: 1.25rem 1.25rem 1.25rem 0;
			padding: 1.25rem;
			border: 1px solid var(--line);
			border-radius: 14px;
			background: var(--paper);
			box-shadow: 0 6px 24px rgb(29 40 56 / 0.08);
		}
		.panel-body {
			flex: 1;
			min-height: 0;
			margin: -0.25rem;
			padding: 0.25rem;
			overflow-y: auto;
		}
		.panel .setup {
			flex: none;
			margin-top: 0.85rem;
		}
	}

	/* In a short window, the panel's picture is smaller, so the details fit. */
	@media (min-width: 1024px) and (max-height: 860px) {
		.panel .details-picture {
			--picture-scale: 0.42;
		}
	}
	@media (min-width: 1024px) and (max-height: 700px) {
		.panel .details-picture {
			--picture-scale: 0.32;
		}
	}

	/* The details, beside the cards or in the drawer. */
	.details-picture {
		display: grid;
		place-items: center;
		padding: 0.75rem 0.5rem;
		border-radius: 10px;
		background: var(--ground);
	}
	h2 {
		margin-top: 0.75rem;
		font-size: 1.6rem;
		font-weight: 700;
	}
	.tagline {
		margin-top: 0.2rem;
		color: var(--ink-soft);
		line-height: 1.45;
	}
	h3 {
		margin-top: 0.9rem;
		color: var(--muted);
		font-size: 0.75rem;
		font-weight: 700;
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}
	.steps {
		display: grid;
		gap: 0.4rem;
		margin-top: 0.45rem;
		padding-left: 1.3rem;
		color: var(--ink-soft);
		line-height: 1.45;
		list-style: decimal;
	}
	.steps li::marker {
		color: var(--accent);
		font-weight: 700;
	}
	.problems {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
		margin-top: 0.45rem;
		padding: 0;
		list-style: none;
	}
	.problems li {
		padding: 0.3rem 0.6rem;
		border-radius: 7px;
		background: var(--paper-low);
		color: var(--ink-soft);
		font-weight: 600;
		white-space: nowrap;
	}
	.setup {
		display: block;
		width: 100%;
		padding: 0.85rem 1rem;
		border-radius: 999px;
		background: var(--oomba-green);
		color: var(--ink);
		box-shadow: 0 4px 0 var(--oomba-green-press);
		font-size: 1.05rem;
		font-weight: 800;
		text-align: center;
		text-decoration: none;
	}
	.setup:hover {
		background: var(--oomba-green-hover);
	}
	.setup:hover {
		background: var(--accent-dark);
	}

	/* The drawer: a sheet from the bottom of the window, over a dimmed page. */
	.sheet {
		position: fixed;
		inset: auto 0 0 0;
		width: 100%;
		max-width: 40rem;
		max-height: 88dvh;
		margin: 0 auto;
		padding: 0;
		border: none;
		border-radius: 18px 18px 0 0;
		background: var(--paper);
		color: var(--ink);
		box-shadow: 0 -12px 40px rgb(29 40 56 / 0.2);
		transform: translateY(100%);
		transition: transform 0.26s cubic-bezier(0.2, 0.8, 0.3, 1);
	}
	.sheet[open] {
		display: flex;
		flex-direction: column;
	}
	.sheet.up {
		transform: translateY(var(--drag));
	}
	.sheet.dragging {
		transition: none;
	}
	.sheet::backdrop {
		background: rgb(29 40 56 / 0.4);
	}
	@media (prefers-reduced-motion: reduce) {
		.sheet,
		.card {
			transition: none;
		}
	}
	:global(html:has(dialog.sheet[open])) {
		overflow: hidden;
	}
	.grab {
		position: relative;
		display: grid;
		flex: none;
		place-items: center;
		height: 2.5rem;
		cursor: grab;
		touch-action: none;
	}
	.handle {
		width: 2.75rem;
		height: 5px;
		border-radius: 3px;
		background: var(--line-strong);
	}
	.close {
		position: absolute;
		top: 0.35rem;
		right: 0.5rem;
		display: grid;
		place-items: center;
		width: 2.2rem;
		height: 2.2rem;
		border: none;
		border-radius: 8px;
		background: none;
		color: var(--muted);
		cursor: pointer;
	}
	.close:hover {
		background: var(--paper-low);
	}
	.sheet-body {
		flex: 1;
		min-height: 0;
		padding: 0 1.25rem 1rem;
		overflow-y: auto;
		overscroll-behavior: contain;
	}
	.sheet-foot {
		flex: none;
		padding: 0.75rem 1.25rem calc(0.75rem + env(safe-area-inset-bottom));
		border-top: 1px solid var(--line);
		background: var(--paper);
	}
	.page :global(footer) {
		margin-top: 2.5rem;
	}
</style>
