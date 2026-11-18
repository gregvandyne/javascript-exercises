<script lang="ts">
	// A student's way in: the class code their teacher gave them (it opens the teacher's question set), or practicing
	// on their own: an activity and a level, then a fresh set of problems, never the same ones as last time.
	import { goBack, go } from '$lib/nav.svelte';
	import { findSet, isPreview, keep, load } from '$lib/oomba';
	import { LEVELS, SET_SIZE, practiceSet, type Level } from '$lib/practice';
	import { ACTIVITIES } from '$lib/activities';
	import type { Activity } from '$lib/algebra';
	import ActivityPicture from '$lib/ActivityPicture.svelte';
	import Logo from '$lib/Logo.svelte';
	import Footer from '$lib/Footer.svelte';

	// --- a class code ---
	let code = $state('');
	let looking = $state(false);
	let problem = $state('');
	const typed = $derived(code.replace(/[^a-z0-9]/gi, '').length);
	// (No <form>: the game frame is sandboxed without forms, so a submit would be blocked before it ran.)
	async function open() {
		if (looking) return;
		problem = '';
		if (typed !== 10) {
			problem = 'A class code has 10 letters and numbers. Check it with your teacher.';
			return;
		}
		looking = true;
		const r = await findSet(code);
		looking = false;
		if ('id' in r) go({ name: 'set-play', items: r.items, from: 'code', id: r.id });
		else
			problem =
				r.error === 'none'
					? 'There’s no question set with that code. Check it with your teacher.'
					: r.error === 'preview'
						? 'Class codes work in the published game, not in a preview.'
						: 'Couldn’t check the code just now. Check your connection and try again.';
	}

	// --- practicing alone (the last choice is remembered in the student's save) ---
	const LAST = 'algebra-builder-practice-v1';
	const last = load<{ activity?: Activity; level?: Level }>(LAST) ?? {};
	let activity = $state<Activity>(ACTIVITIES.some((a) => a.activity === last.activity) ? last.activity! : 'solve');
	let level = $state<Level>(LEVELS.some((l) => l.level === last.level) ? last.level! : 'easy');
	function practise() {
		keep(LAST, { activity, level });
		const items = practiceSet(activity, level);
		if (items.length) go({ name: 'set-play', items, from: 'practice', practice: { activity, level } });
	}
</script>

<div class="page">
	<button type="button" class="brand" onclick={goBack}><Logo size={28} /> Algebra Builder</button>
	<header class="bar">
		<button type="button" class="btn-ghost back" onclick={goBack}>← Back</button>
		<h1>Let’s build some algebra</h1>
	</header>

	<div class="columns">
		<section class="card code" aria-labelledby="code-h">
			<h2 id="code-h">Got a code from your teacher?</h2>
			<p class="about">Type it here to open your teacher’s questions.</p>
			<div class="form">
				<label class="sr-only" for="class-code">Class code</label>
				<input
					id="class-code"
					class="code-input"
					bind:value={code}
					placeholder="ABCDE 23456"
					autocomplete="off"
					autocapitalize="characters"
					spellcheck="false"
					maxlength="16"
					aria-describedby="code-msg"
					aria-invalid={!!problem}
					enterkeyhint="go"
					onkeydown={(e) => {
						if (e.key === 'Enter') {
							e.preventDefault();
							open();
						}
					}}
				/>
				<button type="button" class="btn-primary" disabled={looking || typed === 0} onclick={open}>
					{looking ? 'Opening…' : 'Open'}
				</button>
			</div>
			<p id="code-msg" class="msg" class:bad={!!problem} role={problem ? 'alert' : undefined}>
				{problem || (isPreview() ? 'Class codes work in the published game.' : '')}
			</p>
		</section>

		<section class="card practise" aria-labelledby="practise-h">
			<h2 id="practise-h">Practice on your own</h2>
			<p class="about">Pick what to practice and how hard. You get {SET_SIZE} new problems every time.</p>

			<fieldset>
				<legend>What to practice</legend>
				<div class="choices three">
					{#each ACTIVITIES as a (a.activity)}
						<label class="choice" class:on={activity === a.activity}>
							<input type="radio" name="activity" value={a.activity} bind:group={activity} />
							<span class="pic" aria-hidden="true"><ActivityPicture activity={a.activity} scale={0.24} /></span>
							<span class="name">{a.name}</span>
						</label>
					{/each}
				</div>
			</fieldset>

			<fieldset>
				<legend>How hard</legend>
				<div class="choices levels">
					{#each LEVELS as l (l.level)}
						<label class="choice level" class:on={level === l.level}>
							<input type="radio" name="level" value={l.level} bind:group={level} />
							<span class="name">{l.name}</span>
							<span class="small">{l.about[activity]}</span>
						</label>
					{/each}
				</div>
			</fieldset>

			<button type="button" class="btn-primary start" onclick={practise}>Start practicing ▸</button>
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
		flex-wrap: wrap;
		align-items: center;
		gap: 0.75rem 1rem;
		margin-top: 1rem;
	}
	h1 {
		font-size: 2rem;
		font-weight: 800;
		line-height: 1.1;
	}
	.columns {
		display: grid;
		grid-template-columns: minmax(0, 22rem) minmax(0, 1fr);
		gap: 1.25rem;
		align-items: start;
		margin-top: 1.25rem;
	}
	.card {
		padding: 1.25rem;
		border: 1px solid var(--line);
		border-radius: 18px;
		background: var(--paper);
		box-shadow: 0 1px 2px rgb(29 40 56 / 0.06);
	}
	h2 {
		font-size: 1.2rem;
		font-weight: 800;
	}
	.about {
		margin-top: 0.3rem;
		color: var(--muted);
	}
	.form {
		display: flex;
		gap: 0.5rem;
		margin-top: 0.9rem;
	}
	.code-input {
		flex: 1;
		min-width: 0;
		padding: 0.7rem 0.85rem;
		border: 2px solid var(--line-strong);
		border-radius: 12px;
		background: #fff;
		color: var(--ink);
		font: 800 1.25rem/1.1 ui-monospace, monospace;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}
	.code-input:focus {
		border-color: var(--accent);
		outline: 3px solid var(--accent-wash);
	}
	.code-input[aria-invalid='true'] {
		border-color: var(--bad);
	}
	.msg {
		min-height: 1.3rem;
		margin-top: 0.5rem;
		color: var(--muted);
		font-size: 0.9rem;
	}
	.msg.bad {
		color: var(--bad);
		font-weight: 600;
	}
	fieldset {
		margin-top: 1.1rem;
		padding: 0;
		border: 0;
	}
	legend {
		margin-bottom: 0.5rem;
		font-size: 0.82rem;
		font-weight: 800;
		letter-spacing: 0.05em;
		text-transform: uppercase;
		color: var(--muted);
	}
	.choices {
		display: grid;
		gap: 0.6rem;
	}
	.three,
	.levels {
		grid-template-columns: repeat(3, minmax(0, 1fr));
	}
	.choice {
		position: relative;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.3rem;
		padding: 0.7rem 0.6rem;
		border: 2px solid var(--line);
		border-radius: 14px;
		background: var(--paper);
		text-align: center;
		cursor: pointer;
	}
	.choice:hover {
		border-color: var(--line-strong);
	}
	.choice.on {
		border-color: var(--accent);
		background: var(--accent-wash);
	}
	.choice input {
		position: absolute;
		opacity: 0;
		pointer-events: none;
	}
	.choice:has(input:focus-visible) {
		outline: 3px solid var(--accent);
		outline-offset: 2px;
	}
	.pic {
		display: grid;
		place-items: center;
		height: 5.2rem;
		overflow: hidden;
	}
	.name {
		font-weight: 800;
	}
	.level {
		align-items: flex-start;
		text-align: left;
	}
	.small {
		color: var(--muted);
		font-size: 0.85rem;
		line-height: 1.35;
	}
	.start {
		width: 100%;
		margin-top: 1.2rem;
		padding: 0.85rem 1rem;
		font-size: 1.1rem;
	}
	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
		white-space: nowrap;
	}
	@media (max-width: 860px) {
		.columns {
			grid-template-columns: minmax(0, 1fr);
		}
	}
	@media (max-width: 560px) {
		h1 {
			font-size: 1.6rem;
		}
		.levels {
			grid-template-columns: minmax(0, 1fr);
		}
		.level {
			flex-direction: row;
			flex-wrap: wrap;
			align-items: baseline;
			gap: 0.15rem 0.6rem;
		}
		.pic {
			height: 3.6rem;
		}
		.three .name {
			font-size: 0.85rem;
		}
	}
</style>
