<script lang="ts">
	// An activity's setup page: type one problem, choose what students start
	// with, and share it as an activity link. Nothing is saved; the link
	// carries the problem (on Oomba, in the game's lesson parameters: lib/oomba.ts).
	import { Check, Copy, ExternalLink, ListPlus, QrCode } from '@lucide/svelte';
	import { go, goBack, nav, sets } from '$lib/nav.svelte';
	import { MAX_ITEMS, copy, noLinkReason, shareLink, type Item } from '$lib/oomba';
	import { formatPoly, prettyText, readProblem, type Activity } from '$lib/algebra';
	import { activityInfo } from '$lib/activities';
	import { STARTS, layPiles, panPiles, startingPiles, type Start } from '$lib/settings';
	import { UNIT, XLEN, rectOf } from '$lib/mat';
	import BalanceArt from '$lib/BalanceArt.svelte';
	import MathInput from '$lib/MathInput.svelte';
	import TileView from '$lib/TileView.svelte';
	import Footer from '$lib/Footer.svelte';
	import Logo from '$lib/Logo.svelte';
	import { makeQr, qrExtent, qrPath, qrPng } from '$lib/qr';

	let { activity }: { activity: Activity } = $props();

	const info = $derived(activityInfo(activity));
	// Starts with the example the activity's card shows, ready to share or change (or, back from trying it as a
	// student, with what the teacher had typed and chosen).
	const was = nav.view.name === 'setup' ? nav.view : null;
	// svelte-ignore state_referenced_locally
	let text = $state(was?.text ?? activityInfo(activity).example.typed);
	let start = $state<Start>(was?.start ?? 'all');
	/** Solve: whether the balance tips as students work. Off, it always hangs level. */
	let live = $state(was?.live ?? true);
	/** Oomba: making a question for a question set (its place in the set), rather than one activity link. */
	const forSet = was?.forSet;
	const inSet = forSet !== undefined && !!sets.draft;
	const setFull = $derived(!!sets.draft && sets.draft.items.length >= MAX_ITEMS);
	/** Put this problem in the set being made (in its place, or at the end), and show the set. */
	function toSet() {
		if (!problem.ok) return;
		const item: Item = { a: activity, p: text, s: start, l: live };
		if (!sets.draft) sets.draft = { items: [], id: null, saved: false };
		const d = sets.draft;
		if (forSet !== undefined && forSet < d.items.length) d.items[forSet] = item;
		else if (d.items.length < MAX_ITEMS) d.items.push(item);
		d.saved = false;
		if (inSet) goBack();
		else go({ name: 'set' });
	}

	const problem = $derived(readProblem(activity, text));
	const link = $derived(problem.ok ? shareLink(activity, text, start, live) : '');
	/** Why a working problem has no link (a preview, or too long for one). */
	const why = $derived(problem.ok && !link ? noLinkReason(text) : '');
	/** Try it as a student: the problem on the board, with a way back here as it was. */
	function tryIt() {
		if (!problem.ok) return;
		if (nav.view.name === 'setup') Object.assign(nav.view, { text, start, live });
		go({ name: 'play', type: activity, p: text, start, live, from: 'setup' });
	}
	const summary = $derived.by(() => {
		if (!problem.ok) return '';
		if (problem.type === 'solve')
			return `Students solve ${prettyText(problem.given)} on a balance and find x = ${prettyText(String(problem.solution))}.`;
		if (problem.type === 'multiply')
			return `Students build ${prettyText(problem.given)} and find ${formatPoly(problem.poly)}.`;
		return `Students arrange ${prettyText(problem.given)} into a rectangle and read its factors off the sides.`;
	});

	/** The tiles students will find beside the mat, for the problem typed. In
	 *  Solve, the tiles in each pan, left and right. */
	/** Solve always starts with all its tiles, in its pans: it has no choice of start. */
	const solving = $derived(activity === 'solve');
	const pans = $derived(problem.ok && problem.type === 'solve' ? panPiles(problem, 'all') : null);
	const piles = $derived(
		problem.ok && problem.type !== 'solve' ? startingPiles(problem, start) : (pans?.flat() ?? [])
	);
	/** Solve: the balance students find, small and level, its pans' tiles as
	 *  the board lays them, flush. */
	const previewBalance = $derived.by(() => {
		if (!problem.ok || problem.type !== 'solve' || !pans) return null;
		// Pans as small as the gallery's picture, just wide enough for an x² tile
		// and a unit beside it, and as tall as their tiles need.
		const pad = 12;
		const inner = Math.max(XLEN + UNIT, 4 * UNIT);
		const w = inner + 2 * pad;
		let n = 0;
		const id = () => n++;
		const gap = 56;
		const tiles = [
			...layPiles(pans[0], pad, pad, inner, id),
			...layPiles(pans[1], w + gap + pad, pad, inner, id)
		];
		const h = Math.max(w, ...tiles.map((t) => rectOf(t).y + rectOf(t).h + pad));
		const b = {
			left: { x: 0, y: 0, w, h },
			right: { x: w + gap, y: 0, w, h },
			pivot: { x: w + gap / 2, y: -44 },
			arm: (w + gap) / 2,
			foot: h + 30
		};
		// From the top of the needle to the bottom of the foot, as BalanceArt
		// draws it. With the live balance off, the two sides and the line are
		// drawn in the same frame, the tiles where they were, so toggling it
		// only swaps the drawing.
		const box = { x: -20, y: b.pivot.y - 7 - 30 - 8, w: 2 * w + gap + 40 };
		return { b, tiles, box: { ...box, h: b.foot + 16 + 8 - box.y } };
	});
	let previewW = $state(0);
	/** Drawn smaller when there are lots of them, so they fit the preview. */
	const previewScale = $derived(piles.reduce((n, p) => n + p.n, 0) > 24 ? 0.3 : pans ? 0.4 : 0.48);

	// --- sharing ---

	let copied = $state<'link' | 'qr' | null>(null);
	let copiedTimer: ReturnType<typeof setTimeout>;
	const qr = $derived(link ? makeQr(link) : null);

	function flash(what: 'link' | 'qr') {
		copied = what;
		clearTimeout(copiedTimer);
		copiedTimer = setTimeout(() => (copied = null), 1500);
	}

	// The game frame can't use the clipboard: the play page copies for it (BRB.copy). If it can't, the link is on
	// screen to copy by hand, and the code to scan.
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
</script>

<div class="page">
	<button type="button" class="brand" onclick={() => go({ name: 'home' })}>
		<Logo size={28} /> Algebra Builder
	</button>
	<header class="bar">
		<button type="button" class="btn-ghost back" onclick={goBack}>{inSet ? '← Question set' : '← Activities'}</button>
		<h1>{info.name}</h1>
	</header>
	<p class="lede">
		{#if inSet}{info.tagline} Type the problem for question {(forSet ?? 0) + 1} of your set.{:else}{info.tagline} Type one
			problem and share it as an activity link, or add it to a question set.{/if}
	</p>

	<div class="columns">
		<section class="card">
			<label class="field-label" for="problem">{info.fieldLabel}</label>
			<div class="field">
				<MathInput
					bind:value={text}
					id="problem"
					placeholder="e.g. {info.example.typed}"
					aria-describedby="problem-status"
					aria-invalid={text.trim() !== '' && !problem.ok}
				/>
			</div>
			<p
				id="problem-status"
				class="status"
				class:bad={text.trim() !== '' && !problem.ok}
				aria-live="polite"
			>
				{#if problem.ok}{summary}{:else if text.trim()}{problem.reason}{:else}For example,
					{prettyText(info.example.typed)}.{/if}
			</p>

			<fieldset class="starts">
				<legend>{solving ? 'The balance' : 'Students start with'}</legend>
				<div class="start-grid">
					<div class="start-list">
						{#each solving ? [] : STARTS as s (s.value)}
							<label class="start" class:chosen={start === s.value}>
								<input type="radio" name="start" value={s.value} bind:group={start} />
								<span class="start-text">
									<span class="start-name">{s.name}</span>
									<span class="about">{s.about}</span>
								</span>
							</label>
						{/each}
						{#if activity === 'solve'}
							<label class="start live" class:chosen={live}>
								<input type="checkbox" bind:checked={live} />
								<span class="start-text">
									<span class="start-name">Live balance</span>
									<span class="about"
										>Show a balance that tips as students work. Off: the equation’s two sides,
										divided by a line, and only Check tells them if the sides are equal.</span
									>
								</span>
							</label>
						{/if}
					</div>
					<!-- The tiles students will find beside the mat, for the choice and the problem typed. -->
					<div
						class="preview"
						class:empty={!solving && start === 'none'}
						aria-live="polite"
						bind:clientWidth={previewW}
					>
						{#if !solving && start === 'none'}
							<svg
								class="cross"
								viewBox="0 0 100 100"
								preserveAspectRatio="none"
								aria-hidden="true"
							>
								<line x1="0" y1="0" x2="100" y2="100" />
								<line x1="100" y1="0" x2="0" y2="100" />
							</svg>
							<p>Students start with no tiles</p>
						{:else if !problem.ok}
							<p>Type a problem to see the tiles students start with</p>
						{:else if previewBalance}
							<!-- Solve: the tiles in the balance's pans, left pan | right pan; or,
							     with the live balance off, on the equation's two sides. -->
							{@const { b, tiles, box } = previewBalance}
							{@const k = Math.min(0.6, (previewW - 34) / box.w)}
							<div
								class="mini-balance"
								role="img"
								aria-label={live
									? 'The tiles students start with in each pan'
									: 'The tiles students start with on each side'}
								style:width="{box.w * k}px"
								style:height="{box.h * k}px"
							>
								<div
									class="mini-layer"
									style:transform="scale({k}) translate({-box.x}px, {-box.y}px)"
								>
									<svg class="mini-art" width="1" height="1" aria-hidden="true">
										<g class="mode" class:shown={live}>
											<BalanceArt
												left={b.left}
												right={b.right}
												pivot={b.pivot}
												arm={b.arm}
												foot={b.foot}
												needle={30}
												small
											/>
										</g>
										<g class="mode" class:shown={!live}>
											{#each [b.left, b.right] as r, i (i)}
												<rect class="side-box" x={r.x} y={r.y} width={r.w} height={r.h} rx="10" />
											{/each}
											<rect
												class="equals"
												x={b.pivot.x - 3}
												y={b.left.y - 16}
												width="6"
												height={b.left.h + 32}
												rx="3"
											/>
										</g>
									</svg>
									{#each tiles as t (t.id)}
										<span class="mini-tile" style:left="{t.x}px" style:top="{t.y}px">
											<TileView kind={t.kind} sign={t.sign} />
										</span>
									{/each}
								</div>
							</div>
						{:else}
							<div class="piles" aria-label="The tiles students start with">
								{#each piles as pile (pile.kind + pile.sign)}
									<span class="pile">
										{#each { length: pile.n }, i (i)}
											<TileView kind={pile.kind} sign={pile.sign} scale={previewScale} />
										{/each}
									</span>
								{/each}
							</div>
						{/if}
					</div>
				</div>
			</fieldset>
		</section>

		{#if inSet}
		<section class="card share">
			<h2>Question {(forSet ?? 0) + 1}</h2>
			<p class="set-note">
				{#if problem.ok}{summary}{:else}Type a problem that works to add it to your set.{/if}
			</p>
			<div class="buttons">
				<button type="button" class="btn-primary" disabled={!problem.ok} onclick={toSet}>
					<ListPlus size={16} />
					{(forSet ?? 0) < (sets.draft?.items.length ?? 0) ? 'Save this question' : 'Add to the set'}
				</button>
				<button type="button" class="btn-ghost" disabled={!problem.ok} onclick={tryIt}
					><ExternalLink size={16} /> Try it as a student</button
				>
				<button type="button" class="btn-ghost" onclick={goBack}>Cancel</button>
			</div>
		</section>
		{:else}
		<div class="side">
		<section class="card share" class:off={!link}>
			<h2>Share it</h2>
			<p class="link" class:waiting={!link} title={link}>
				{link || why || 'The activity link appears here once the problem works.'}
			</p>
			<div class="buttons">
				<button type="button" class="btn-primary" disabled={!link} onclick={copyLink}>
					{#if copied === 'link'}<Check size={16} /> Copied{:else}<Copy size={16} /> Copy activity link{/if}
				</button>
				<button type="button" class="btn-ghost" disabled={!problem.ok} onclick={tryIt}
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
						aria-label="QR code for the activity link"
					>
						<rect width="100%" height="100%" fill="#fff" />
						<path d={qrPath(qr)} fill="#000" />
					</svg>
					<button type="button" class="btn-ghost" onclick={copyQr}>
						{#if copied === 'qr'}<Check size={16} /> Copied{:else}<Copy size={16} /> Copy QR code{/if}
					</button>
				{:else}
					<div class="qr-waiting"><QrCode size={40} aria-hidden="true" /></div>
					<p class="qr-note">The QR code appears here once the problem works.</p>
				{/if}
			</div>
		</section>
		<section class="card more">
			<h2>More than one question?</h2>
			<p class="set-note">Put this problem in a question set with others, from any activity. Students answer them in order.</p>
			<button type="button" class="btn-ghost" disabled={!problem.ok || setFull} onclick={toSet}>
				<ListPlus size={16} />
				{sets.draft?.items.length ? `Add to your set (${sets.draft.items.length} so far)` : 'Start a question set with it'}
			</button>
			{#if setFull}<p class="set-note">Your set has {MAX_ITEMS} questions, the most a set can have.</p>{/if}
		</section>
		</div>
		{/if}
	</div>

	<Footer />
</div>

<style>
	/* The footer sits at the bottom of the window, or after the content when it's taller. */
	.page {
		display: flex;
		flex-direction: column;
		min-height: 100dvh;
		max-width: 72rem;
		margin: 0 auto;
		padding: 2rem 1.25rem 1.5rem;
	}
	.brand {
		display: inline-flex;
		align-self: flex-start;
		align-items: center;
		gap: 0.5rem;
		color: var(--accent);
		font-size: 1.05rem;
		font-weight: 700;
		text-decoration: none;
	}
	.bar {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.9rem;
		margin-top: 1rem;
	}
	.back {
		padding: 0.5rem 0.85rem;
	}
	h1 {
		font-size: 2.2rem;
		font-weight: 700;
		line-height: 1.1;
	}
	.lede {
		margin-top: 0.5rem;
		color: var(--muted);
		line-height: 1.5;
	}
	/* The problem on the left; sharing it on the right, staying in view. */
	.columns {
		display: grid;
		grid-template-columns: minmax(0, 1fr) 21rem;
		gap: 1.25rem;
		align-items: start;
	}
	.columns > .share,
	.columns > .side {
		position: sticky;
		top: 1.25rem;
	}
	.side .share {
		margin-top: 1.25rem;
	}
	.more .btn-ghost {
		width: 100%;
		margin-top: 0.75rem;
	}
	.set-note {
		margin-top: 0.4rem;
		color: var(--muted);
		font-size: 0.92rem;
		line-height: 1.4;
	}
	@media (max-width: 960px) {
		.columns {
			grid-template-columns: minmax(0, 1fr);
		}
		.columns > .share,
		.columns > .side {
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
		font-size: 1.1rem;
		font-weight: 700;
	}
	.about {
		color: var(--muted);
		font-size: 0.88rem;
		line-height: 1.4;
	}
	.field-label {
		display: block;
		font-weight: 600;
	}
	.field {
		margin-top: 0.4rem;
	}
	.status {
		min-height: 1.4rem;
		margin-top: 0.5rem;
		color: var(--muted);
		font-size: 0.9rem;
	}
	.status.bad {
		color: var(--bad);
		font-weight: 600;
	}
	.starts {
		margin-top: 1.1rem;
		padding: 0;
		border: none;
	}
	.starts legend {
		font-weight: 600;
	}
	/* The choices on the left, and one preview of the chosen one beside them,
	   as tall as all of them. */
	.start-grid {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(0, 0.9fr);
		gap: 0.75rem;
		margin-top: 0.45rem;
	}
	.start-list {
		display: flex;
		flex-direction: column;
		gap: 0.45rem;
	}
	.start {
		display: flex;
		align-items: flex-start;
		gap: 0.6rem;
		padding: 0.6rem 0.75rem;
		border: 2px solid var(--line);
		border-radius: 10px;
		cursor: pointer;
	}
	.start.chosen {
		border-color: var(--accent);
		background: var(--accent-wash);
	}
	.start input {
		margin-top: 0.2rem;
		accent-color: var(--accent);
		cursor: pointer;
	}
	.start-text {
		display: flex;
		flex-direction: column;
		gap: 0.1rem;
	}
	.start-name {
		font-weight: 600;
	}
	.preview {
		position: relative;
		display: grid;
		place-items: center;
		min-height: 10rem;
		padding: 0.9rem;
		overflow: hidden;
		border: 1px solid var(--line);
		border-radius: 10px;
		background: var(--ground);
	}
	.preview p {
		position: relative;
		max-width: 14rem;
		color: var(--muted);
		font-size: 0.88rem;
		font-weight: 600;
		text-align: center;
	}
	/* No tiles: a gray box, crossed out faintly. */
	.preview.empty {
		background: var(--paper-low);
	}
	.cross {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
	}
	.cross line {
		stroke: var(--line);
		stroke-width: 1.5;
		vector-effect: non-scaling-stroke;
	}
	.piles {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 6px;
	}
	.pile {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		align-items: flex-end;
		gap: 3px;
	}
	/* Solve's preview: a small level balance, drawn in board pixels and scaled down. */
	.mini-balance {
		position: relative;
	}
	.mini-layer {
		position: absolute;
		top: 0;
		left: 0;
		transform-origin: 0 0;
	}
	.mini-art {
		position: absolute;
		top: 0;
		left: 0;
		overflow: visible;
	}
	.mini-tile {
		position: absolute;
	}
	/* With the live balance off: the sides as the board draws them, dashed, and
	   the gray line between them. */
	.side-box {
		fill: rgb(251 252 254 / 0.55);
		stroke: var(--accent-line);
		stroke-width: 3;
		stroke-dasharray: 9 6;
	}
	.equals {
		fill: var(--muted);
	}
	/* The balance and the two sides, one over the other: toggling crossfades. */
	.mode {
		opacity: 0;
		transition: opacity 0.25s;
	}
	.mode.shown {
		opacity: 1;
	}
	@media (prefers-reduced-motion: reduce) {
		.mode {
			transition: none;
		}
	}
	/* The live balance is a setting of its own, set apart from what students start with. */
	.start.live {
		margin-top: 0.35rem;
	}
	@media (max-width: 560px) {
		.start-grid {
			grid-template-columns: 1fr;
		}
	}
	.share.off {
		opacity: 0.7;
	}
	.link {
		margin-top: 0.5rem;
		padding: 0.6rem 0.75rem;
		overflow: hidden;
		border-radius: 8px;
		background: var(--paper-low);
		color: var(--ink-soft);
		font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
		font-size: 0.85rem;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.link.waiting {
		font-family: inherit;
		white-space: normal;
	}
	/* In the narrow column, the buttons stack, one full-width button each. */
	.buttons {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		margin-top: 0.75rem;
	}
	.qr {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.75rem;
		margin-top: 1rem;
		padding-top: 1rem;
		border-top: 1px solid var(--line);
	}
	.qr-waiting {
		display: grid;
		place-items: center;
		width: 180px;
		height: 180px;
		border: 2px dashed var(--line);
		border-radius: 8px;
		color: var(--line-strong);
	}
	.qr-note {
		color: var(--muted);
		font-size: 0.85rem;
		text-align: center;
	}
	.page :global(footer) {
		margin-top: auto;
		padding-top: 2rem;
	}
</style>
