<script lang="ts">
	// A math field: ^ starts a power, brackets pair themselves, and the value
	// stays as plain text. Other attributes (id, aria-label, placeholder…) go
	// to the field's text box.
	import { MathField } from '@oomba-mathfield/svelte';
	import { commands, fromText, schema, toText } from './math';

	let { value = $bindable(''), ...rest }: { value?: string; [attribute: string]: unknown } =
		$props();
</script>

<MathField {schema} bind:value {fromText} {toText} {commands} {...rest} />

<style>
	:global(.mf-field) {
		--mf-border: var(--line-strong);
		--mf-focus: var(--accent);
		--mf-invalid: var(--bad);
		--mf-cursor: var(--ink);
		--mf-font-size: 1.35rem;
		--mf-placeholder-font: var(--sans);
	}
</style>
