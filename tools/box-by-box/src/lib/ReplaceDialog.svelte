<script lang="ts">
	// "Replace your problems?": asked before new problems would replace ones the teacher changed by hand.
	let dialog = $state<HTMLDialogElement>();
	let answer: ((yes: boolean) => void) | null = null;

	export function ask(): Promise<boolean> {
		if (answer || !dialog) return Promise.resolve(false);
		const p = new Promise<boolean>((r) => (answer = r));
		const d = dialog;
		setTimeout(() => answer && d.showModal());
		return p;
	}
	function done(yes: boolean) {
		const a = answer;
		answer = null;
		if (dialog?.open) dialog.close();
		a?.(yes);
	}
</script>

<dialog
	bind:this={dialog}
	aria-labelledby="replace-title"
	aria-describedby="replace-text"
	onclose={() => done(false)}
	onclick={(e) => e.target === dialog && done(false)}
>
	<div class="box">
		<h2 id="replace-title">Replace your problems?</h2>
		<p id="replace-text">This will replace your problems, including the changes you made by hand. Continue?</p>
		<div class="actions">
			<button type="button" class="btn-ghost" onclick={() => done(false)}>Keep my problems</button>
			<button type="button" class="btn-primary" onclick={() => done(true)}>Replace them</button>
		</div>
	</div>
</dialog>

<style>
	dialog {
		width: min(27rem, 100vw - 2rem);
		margin: auto;
		padding: 0;
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
</style>
