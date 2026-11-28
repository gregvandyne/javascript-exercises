<script lang="ts">
	// A question in the page's own dialog (the frame has no confirm(), and the game never uses one): its title, a line
	// or two, and its buttons, the last one the main one. ask() answers with the button's value, or null when it was
	// closed (Escape, a tap outside, or the first button when it is a "Cancel").
	export type Choice = { value: string; label: string; danger?: boolean };
	let dialog = $state<HTMLDialogElement>();
	let q = $state<{ title: string; text: string; choices: Choice[] } | null>(null);
	let answer: ((v: string | null) => void) | null = null;
	// (shown: the question on screen now; a close event left over from the one before, which done() closed itself, comes
	// a moment later and must not answer a question asked since: the play page can ask again at once, audit 5)
	let shown = false;
	const uid = `cd${Math.random().toString(36).slice(2, 8)}`;

	export function ask(title: string, text: string, choices: Choice[]): Promise<string | null> {
		if (answer || !dialog) return Promise.resolve(null);
		q = { title, text, choices };
		const p = new Promise<string | null>((r) => (answer = r));
		const d = dialog;
		setTimeout(() => {
			if (!answer || d.open) return;
			d.showModal();
			shown = true;
			d.querySelector<HTMLButtonElement>('.actions button:last-child')?.focus();
		});
		return p;
	}
	export const isOpen = () => !!answer;
	function done(v: string | null) {
		const a = answer;
		answer = null;
		shown = false;
		if (dialog?.open) dialog.close();
		a?.(v);
	}
</script>

<dialog
	bind:this={dialog}
	class="confirm"
	aria-labelledby="{uid}-title"
	aria-describedby="{uid}-text"
	onclose={() => shown && done(null)}
	onclick={(e) => e.target === dialog && done(null)}
>
	{#if q}
		<div class="box">
			<h2 id="{uid}-title">{q.title}</h2>
			<p id="{uid}-text">{q.text}</p>
			<div class="actions">
				{#each q.choices as c, i (c.value)}
					<button
						type="button"
						class={i === q.choices.length - 1 ? (c.danger ? 'btn-danger' : 'btn-primary') : 'btn-ghost'}
						data-choice={c.value}
						onclick={() => done(c.value)}>{c.label}</button
					>
				{/each}
			</div>
		</div>
	{/if}
</dialog>

<style>
	dialog {
		width: min(28rem, 100vw - 2rem);
		max-height: calc(100dvh - 2rem);
		margin: auto;
		padding: 0;
		overflow: auto;
		border: 2px solid var(--line);
		border-radius: 20px;
		background: var(--paper);
		color: var(--ink);
		box-shadow: 0 18px 60px rgb(20 20 20 / 0.24);
	}
	dialog::backdrop {
		background: rgb(20 20 20 / 0.35);
	}
	.box {
		padding: 1.25rem;
	}
	h2 {
		margin: 0 0 0.5rem;
		font-size: 1.15rem;
		font-weight: 800;
	}
	p {
		margin: 0;
		font-size: 0.95rem;
		line-height: 1.55;
	}
	.actions {
		display: flex;
		flex-wrap: wrap;
		justify-content: flex-end;
		gap: 0.6rem;
		margin-top: 1.1rem;
	}
	.actions button {
		max-width: 100%;
		white-space: normal;
	}
</style>
