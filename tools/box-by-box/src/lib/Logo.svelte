<script lang="ts">
	// The game's mark: a tile of graph paper with one digit box lit, the box to fill.
	let { size = 36 }: { size?: number } = $props();
</script>

<svg viewBox="0 0 32 32" width={size} height={size} aria-hidden="true" class="logo">
	<rect x="1.5" y="1.5" width="29" height="29" rx="7" fill="var(--oomba-green)" stroke="var(--ink)" stroke-width="2" />
	<path d="M9 3v26M23 3v26M3 9h26M3 23h26" stroke="var(--ink)" stroke-opacity="0.25" stroke-width="1.2" />
	<rect x="9" y="9" width="14" height="14" rx="1.5" fill="var(--paper)" stroke="var(--ink)" stroke-width="1.8" />
	<path d="M11.2 20.6h9.6" stroke="var(--box)" stroke-width="2.2" stroke-linecap="round" />
	<text x="16" y="18.6" text-anchor="middle" font-size="10.5" font-weight="800" fill="var(--ink)" font-family="var(--sans)">4</text>
</svg>

<style>
	.logo {
		flex: none;
		display: block;
	}
</style>
