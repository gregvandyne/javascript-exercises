<script lang="ts">
	// The game's mark: a finished rectangle, (x + 1)(x − 1): x², an x tile beside it, a −x tile below and a −1 in the
	// corner, in the tiles' colors with Oomba's ink edge.
	let { size = 40 }: { size?: number } = $props();
</script>

<svg viewBox="0 0 32 32" width={size} height={size} aria-hidden="true" class="logo">
	<rect x="2" y="3" width="18" height="18" rx="3" fill="var(--x2-fill)" stroke="var(--ink)" stroke-width="2" />
	<rect x="22" y="3" width="7.5" height="18" rx="2.5" fill="var(--x-fill)" stroke="var(--ink)" stroke-width="2" />
	<rect x="2" y="23" width="18" height="7" rx="2.5" fill="var(--neg-fill)" stroke="var(--ink)" stroke-width="2" />
	<rect x="22" y="23" width="7.5" height="7" rx="2" fill="var(--neg-fill)" stroke="var(--ink)" stroke-width="2" />
</svg>

<style>
	.logo {
		flex: none;
	}
</style>
