<script lang="ts">
	import { t } from '$lib/i18n';
	// A student's way in: the class code their teacher gave them (it opens the teacher's activity), or practicing on
	// their own: long division or multiplication, how hard, and how much help; then a fresh set every time.
	import { NAME_HERE as NAME } from '$lib/i18n';
	import { go, goBack } from '$lib/nav.svelte';
	import { findSet, isPreview, load, store } from '$lib/oomba';
	import { DECIMAL_METHODS, parseItem, kindInfo, KINDS, type Kind, type Level, type Numbers } from '$lib/logic';
	import { HARDS, HELPS, NUMBER_KINDS, SET_SIZE, practiceActivity, type Hard } from '$lib/practice';
	import { methodOr, methodsFor, type Method } from '$lib/methods';
	import Logo from '$lib/Logo.svelte';
	import Footer from '$lib/Footer.svelte';

	// --- a class code (no <form>: the game frame is sandboxed without forms, so a submit would be blocked) ---
	let code = $state('');
	let looking = $state(false);
	let problem = $state('');
	const typed = $derived(code.replace(/[^a-z0-9]/gi, '').length);
	async function open() {
		if (looking) return;
		problem = '';
		if (typed !== 10) {
			problem = t('ui.code.short');
			return;
		}
		looking = true;
		const r = await findSet(code);
		looking = false;
		if ('id' in r) {
			const a = parseItem(r.item);
			if (a) go({ name: 'play', activity: a, title: kindInfo(a.kind).title, from: 'code', setId: r.id, item: r.item });
			else problem = t('ui.code.bad');
		} else
			problem =
				r.error === 'none'
					? t('ui.code.none')
					: r.error === 'preview'
						? t('ui.code.preview')
						: t('ui.code.offline');
	}

	// --- practicing alone (the last choice is remembered in the student's save) ---
	const STUDENT_WAY: Record<string, string> = {
		'divide-standard': t('ui.way.divide.standard'),
		'divide-ladder': t('ui.way.divide.ladder'),
		'divide-area': t('ui.way.divide.area'),
		'multiply-standard': t('ui.way.multiply.standard'),
		'multiply-area': t('ui.way.multiply.area'),
		'multiply-partial': t('ui.way.multiply.partial')
	};
	const LAST = 'box-by-box-practice-v1';
	const last = (load(LAST) as { kind?: Kind; hard?: Hard; mode?: Level; method?: Partial<Record<Kind, Method>>; numbers?: Numbers } | null) ?? {};
	let kind = $state<Kind>(last.kind === 'multiply' ? 'multiply' : 'divide');
	let hard = $state<Hard>(HARDS.some((h) => h.hard === last.hard) ? last.hard! : 'easy');
	let mode = $state<Level>(HELPS.some((h) => h.mode === last.mode) ? last.mode! : 'guided');
	// the way they work it, kept for each kind
	let ways = $state<Record<Kind, Method>>({ divide: methodOr('divide', last.method?.divide), multiply: methodOr('multiply', last.method?.multiply) });
	let numbers = $state<Numbers>(last.numbers === 'decimal' ? 'decimal' : 'whole');
	// the ways this kind can be worked (decimals: the standard way or the area model); a way decimals don't have is
	// worked the standard way
	const ways_ = $derived(methodsFor(kind).filter((m) => numbers !== 'decimal' || DECIMAL_METHODS[kind].includes(m.name)));
	$effect(() => {
		if (!ways_.some((m) => m.name === ways[kind])) ways[kind] = 'standard';
	});
	function practice() {
		store(LAST, { kind, hard, mode, method: { ...ways }, ...(numbers === 'decimal' ? { numbers } : {}) });
		const a = practiceActivity(kind, hard, mode, ways[kind], numbers);
		if (a.problems.length) go({ name: 'play', activity: a, title: kindInfo(kind).title, from: 'practice', practice: { kind, hard, numbers, method: a.settings.method } });
	}
</script>

<div class="page">
	<button type="button" class="brand" onclick={goBack}><Logo size={28} /> {NAME}</button>
	<header class="bar">
		<button type="button" class="btn-ghost back" onclick={goBack}>{t('ui.back')}</button>
		<h1>{t('ui.student.title')}</h1>
	</header>

	<div class="columns">
		<section class="card" aria-labelledby="code-h">
			<h2 id="code-h">{t('ui.student.codeTitle')}</h2>
			<p class="about">{t('ui.student.codeAbout')}</p>
			<div class="form">
				<label class="sr-only" for="class-code">{t('ui.classCode')}</label>
				<input
					id="class-code"
					class="code-input"
					bind:value={code}
					placeholder="ABCDE 23456"
					autocomplete="off"
					autocapitalize="characters"
					spellcheck="false"
					maxlength="16"
					enterkeyhint="go"
					aria-describedby="code-msg"
					aria-invalid={!!problem}
					onkeydown={(e) => {
						if (e.key === 'Enter') {
							e.preventDefault();
							open();
						}
					}}
				/>
				<button type="button" class="btn-primary" disabled={looking || typed === 0} onclick={open}>
					{looking ? t('ui.opening') : t('ui.open')}
				</button>
			</div>
			<p id="code-msg" class="msg" class:bad={!!problem} role={problem ? 'alert' : undefined}>
				{problem || (isPreview() ? t('ui.code.previewShort') : '')}
			</p>
		</section>

		<section class="card" aria-labelledby="practice-h">
			<h2 id="practice-h">{t('ui.student.practice')}</h2>
			<p class="about">{t('ui.student.practiceAbout', { n: SET_SIZE })}</p>

			<fieldset>
				<legend>{t('ui.student.what')}</legend>
				<div class="choices two">
					{#each KINDS as k (k.name)}
						<label class="choice" class:on={kind === k.name}>
							<input type="radio" name="kind" value={k.name} bind:group={kind} />
							<span class="sign" aria-hidden="true">{k.sign}</span>
							<span class="name">{k.title}</span>
						</label>
					{/each}
				</div>
			</fieldset>

			<fieldset>
				<legend>{t('ui.student.hard')}</legend>
				<div class="choices three">
					{#each HARDS as h (h.hard)}
						<label class="choice level" class:on={hard === h.hard}>
							<input type="radio" name="hard" value={h.hard} bind:group={hard} />
							<span class="name">{h.name}</span>
							<span class="small">{h.about[kind]}</span>
						</label>
					{/each}
				</div>
			</fieldset>

			<fieldset>
				<legend>{t('ui.numbers.name')}</legend>
				<div class="choices two">
					{#each NUMBER_KINDS as n (n.numbers)}
						<label class="choice level" class:on={numbers === n.numbers}>
							<input type="radio" name="numbers" value={n.numbers} bind:group={numbers} />
							<span class="name">{n.name}</span>
							<span class="small">{n.about}</span>
						</label>
					{/each}
				</div>
			</fieldset>

			{#if ways_.length > 1}
			<fieldset>
				<legend>{t('ui.student.way')}</legend>
				<div class="choices three">
					{#each ways_ as m (m.name)}
						<label class="choice level" class:on={ways[kind] === m.name}>
							<input type="radio" name="method-{kind}" value={m.name} bind:group={ways[kind]} />
							<span class="name">{m.label}</span>
							<span class="small">{STUDENT_WAY[`${kind}-${m.name}`]}</span>
						</label>
					{/each}
				</div>
			</fieldset>
			{/if}

			<fieldset>
				<legend>{t('ui.student.help')}</legend>
				<div class="choices three">
					{#each HELPS as h (h.mode)}
						<label class="choice level" class:on={mode === h.mode}>
							<input type="radio" name="mode" value={h.mode} bind:group={mode} />
							<span class="name">{h.name}</span>
							<span class="small">{h.about}</span>
						</label>
					{/each}
				</div>
			</fieldset>

			<button type="button" class="btn-primary start" onclick={practice}>{t('ui.student.go')}</button>
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
		color: var(--muted);
		font-size: 0.82rem;
		font-weight: 800;
		letter-spacing: 0.05em;
		text-transform: uppercase;
	}
	.choices {
		display: grid;
		gap: 0.6rem;
	}
	.two {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}
	.three {
		grid-template-columns: repeat(3, minmax(0, 1fr));
	}
	.choice {
		position: relative;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.25rem;
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
	.sign {
		display: grid;
		place-items: center;
		width: 2.6rem;
		height: 2.6rem;
		border: 2px solid var(--ink);
		border-radius: 12px;
		background: var(--box-wash);
		font-size: 1.6rem;
		font-weight: 900;
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
		.three {
			grid-template-columns: minmax(0, 1fr);
		}
		.level {
			flex-direction: row;
			flex-wrap: wrap;
			align-items: baseline;
			gap: 0.15rem 0.6rem;
		}
	}
</style>
