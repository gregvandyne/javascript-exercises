<script lang="ts">
	// A problem worked by one of the other methods (methods.ts), laid out on graph paper squares: the ladder (partial
	// quotients), the area model for division (sections of a rectangle, which wrap onto more lines on a narrow screen),
	// the area model for multiplication (a box for each pair of place-value parts) and partial products (a list). Each
	// field is the caller's (an input in the player, plain digits in a picture of it). Digits and the work always read
	// left to right, whatever the page's language.
	import type { Snippet } from 'svelte';
	import type { Values } from './logic';
	import { partValue, type Field, type Work } from './methods';
	import { t } from './i18n';

	let {
		work,
		field,
		values,
		shown = () => true,
		lit = () => true,
		label
	}: {
		work: Work;
		field: Snippet<[Field]>;
		values: Values;
		shown?: (id: string) => boolean;
		lit?: (key: string) => boolean;
		label?: string;
	} = $props();

	const byId = $derived(new Map(work.fields.map((f) => [f.id, f])));
	const len = (n: number) => String(n).length;
	/** A number's digits in squares, lined up on the right in `n` squares. */
	const pad = (s: string, n: number) => [...s.padStart(n, ' ')].slice(-n);
	/** Decimals in a column line up on their points: each padded on the right to `places` decimal places. */
	const placesIn = (s: string) => (s.includes('.') ? s.length - s.indexOf('.') - 1 : 0);
	const aligned = (s: string, places: number) => (places ? s + ' '.repeat(places - placesIn(s) + (s.includes('.') ? 0 : 1)) : s);
</script>

{#snippet digits(text: string, n: number, key: string, cls = '')}
	<span class="given {cls}" class:dim={!lit(key)} style:--n={n}>
		{#each pad(text, n) as d, i (i)}<span class="sq">{d.trim()}</span>{/each}
	</span>
{/snippet}
{#snippet slot(id: string)}
	{@const f = byId.get(id)}
	{#if f}
		<span class="slot" class:dim={!lit(id)} class:hidden={!shown(id)} style:--n={f.len}>
			{#if shown(id)}{@render field(f)}{:else}{#each Array(f.len) as _, i (i)}<span class="sq"></span>{/each}{/if}
		</span>
	{/if}
{/snippet}
{#snippet mirror(id: string, n: number, places = 0)}
	{@render digits(aligned(values[id] ?? '', places), n, id, 'mirror')}
{/snippet}

<div class="work" dir="ltr" role="group" aria-label={label ?? work.title}>
	{#if work.kind === 'divide' && work.method === 'ladder'}
		{@const D = len(work.divisor)}
		{@const shownN = work.f.show(work.dividend)}
		{@const N = Math.max(shownN.length, ...work.fields.filter((x) => x.role === 'product' || x.role === 'difference').map((x) => x.len))}
		{@const S = Math.max(1, byId.get('quotient')?.len ?? 1, ...work.fields.filter((x) => x.role === 'choice').map((x) => x.len))}
		{@const main = D + 1}
		{@const end = D + N}
		{@const sideEnd = end + 1 + S}
		{@const lastRow = 1 + work.rungs.length * 2}
		{@const fr = work.fraction && byId.has('den') ? (byId.get('remainder')?.len ?? 1) + byId.get('den')!.len + 2 : 0}
		<div class="ladder" style:--cols={sideEnd + fr} style:--rows={lastRow + 1}>
			<span class="cell" style:grid-row="1" style:grid-column="1 / span {D}">{@render digits(String(work.divisor), D, 'divisor')}</span>
			<span class="cell bracket" class:dim={!lit('dividend')} style:grid-row="1" style:grid-column="{main} / span {N}"
				>{@render digits(shownN, N, 'dividend')}</span
			>
			<span class="side-head" style:grid-row="1" style:grid-column="{end + 2} / span {S}" aria-hidden="true">×{work.divisor}</span>
			<span class="divider" style:grid-row="1 / span {lastRow + 1}" style:grid-column={end + 1} aria-hidden="true"></span>
			{#each work.rungs as r, i (r.q)}
				{@const pf = byId.get(r.p)!}
				{@const rf = byId.get(r.r)!}
				{@const qf = byId.get(r.q)!}
				{#if shown(r.p) || shown(r.q)}
					<span class="sign" class:dim={!lit(r.p)} style:grid-row={2 + i * 2} style:grid-column={D} aria-hidden="true">−</span>
					<span class="rule" class:dim={!lit(r.p)} style:grid-row={2 + i * 2} style:grid-column="{D} / span {N + 1}" aria-hidden="true"></span>
				{/if}
				<span class="cell" style:grid-row={2 + i * 2} style:grid-column="{end - pf.len + 1} / span {pf.len}">{@render slot(r.p)}</span>
				<span class="cell" style:grid-row={2 + i * 2} style:grid-column="{sideEnd - qf.len + 1} / span {qf.len}">{@render slot(r.q)}</span>
				<span class="cell" style:grid-row={3 + i * 2} style:grid-column="{end - rf.len + 1} / span {rf.len}">{@render slot(r.r)}</span>
			{/each}
			{#if work.closed || shown('quotient')}
				{@const qf = byId.get('quotient')!}
				{@const rm = byId.get('remainder')!}
				<span class="rule top" class:dim={!lit('quotient')} style:grid-row={lastRow + 1} style:grid-column="{end + 2} / span {S}" aria-hidden="true"></span>
				<span class="cell" style:grid-row={lastRow + 1} style:grid-column="{sideEnd - qf.len + 1} / span {qf.len}">{@render slot('quotient')}</span>
				{#if work.fraction}
					{#if fr}
						<span class="cell frac" style:grid-row={lastRow + 1} style:grid-column="{sideEnd + 1} / span {fr}"
							>{@render slot('remainder')}<span class="slash" class:dim={!lit('den')} aria-hidden="true">/</span>{@render slot('den')}</span
						>
					{/if}
				{:else if rm}
					{#if shown('remainder')}
						<span class="r-label" class:dim={!lit('remainder')} style:grid-row={lastRow + 1} style:grid-column={end - rm.len} aria-hidden="true">R</span>
					{/if}
					<span class="cell" style:grid-row={lastRow + 1} style:grid-column="{end - rm.len + 1} / span {rm.len}">{@render slot('remainder')}</span>
				{/if}
			{/if}
		</div>
	{:else if work.kind === 'divide'}
		{@const shown_ = work.f.show(work.dividend)}
		{@const N = Math.max(shown_.length, ...work.fields.filter((x) => x.role === 'product' || x.role === 'difference').map((x) => x.len))}
		<div class="adiv">
			<div class="sections">
				<span class="dvr" class:dim={!lit('divisor')}>{@render digits(String(work.divisor), len(work.divisor), 'divisor')}</span>
				{#each work.rungs as r, i (r.q)}
					{@const visible = shown(r.q) || shown(r.p)}
					<div class="section" class:faint={!visible} style:--w={N + 1}>
						<div class="width">{@render slot(r.q)}</div>
						<div class="box">
							<div class="line">
								{#if i === 0}{@render digits(shown_, N, 'dividend')}{:else}{@render mirror(work.rungs[i - 1].r, N)}{/if}
							</div>
							<div class="line take" class:dim={!lit(r.p)}>
								<span class="sq sign-sq" aria-hidden="true">{visible ? '−' : ''}</span>{@render slot(r.p)}
							</div>
							<div class="line under">{@render slot(r.r)}</div>
						</div>
					</div>
				{/each}
			</div>
			{#if work.closed || shown('quotient')}
				<div class="total" class:dim={!lit('quotient')}>
					<span class="words">{t('ui.field.quotient')}</span>
					{#if work.rungs.length > 1}
						<span class="sum-words" aria-hidden="true">{work.rungs.map((r) => values[r.q] || '?').join(' + ')} =</span>
					{/if}
					{@render slot('quotient')}
					{#if work.fraction}
						{#if byId.has('den')}
							<span class="frac">{@render slot('remainder')}<span class="slash" class:dim={!lit('den')} aria-hidden="true">/</span>{@render slot('den')}</span>
						{/if}
					{:else if byId.has('remainder')}
						<span class="words rem-word" class:dim={!lit('remainder')}>R</span>
						{@render slot('remainder')}
					{/if}
				</div>
			{/if}
		</div>
	{:else if work.method === 'area'}
		{@const widths = work.cells[0].map((_, j) => Math.max(...work.cells.map((row) => partValue(row[j]).length)) + 0.5)}
		{@const flat = work.cells.flat()}
		{@const places = Math.max(0, ...flat.map((c) => placesIn(partValue(c))))}
		{@const P = Math.max(aligned(work.answer, places).length, ...flat.map((c) => aligned(partValue(c), places).length))}
		<div class="amul" style:grid-template-columns="auto {widths.map((w) => `calc(var(--sq) * ${w})`).join(' ')}">
			<span class="corner" aria-hidden="true">×</span>
			{#each work.cells[0] as c (c.id)}
				<span class="part top-part" class:dim={!lit(`top${c.top}`)}>{c.text?.top ?? c.top}</span>
			{/each}
			{#each work.cells as row, i (i)}
				<span class="part side-part" class:dim={!lit(`bottom${row[0].bottom}`)}>{row[0].text?.bottom ?? row[0].bottom}</span>
				{#each row as c (c.id)}
					<span class="area-cell" class:faint={!shown(c.id)}>{@render slot(c.id)}</span>
				{/each}
			{/each}
		</div>
		{#if work.sum}
			<div class="list" style:--cols={P + 1} class:faint={!shown('sum')}>
				{#each flat as c, i (c.id)}
					<span class="row" style:grid-row={i + 1}>
						{#if i === flat.length - 1}<span class="sq sign-sq" aria-hidden="true">+</span>{/if}
						{@render mirror(c.id, P, places)}
					</span>
				{/each}
				<span class="rule" style:grid-row={flat.length} style:grid-column="1 / span {P + 1}" aria-hidden="true"></span>
				<span class="row" style:grid-row={flat.length + 1}>{@render slot('sum')}{#each Array(aligned(work.answer, places).length - work.answer.length) as _, i (i)}<span class="sq"></span>{/each}</span>
			</div>
		{/if}
	{:else}
		{@const P = work.answer.length}
		{@const tp = [...String(work.top)]}
		{@const bt = [...String(work.bottom)]}
		{@const rows = work.rows.length}
		<div class="pp" style:--cols={P + 1}>
			<span class="row" style:grid-row="1">
				{#each Array(P + 1 - tp.length) as _, i (i)}<span class="sq"></span>{/each}
				{#each tp as d, k (k)}<span class="sq given-sq" class:dim={!lit(`top${Number(d) * 10 ** (tp.length - 1 - k)}`)}>{d}</span>{/each}
			</span>
			<span class="row" style:grid-row="2">
				<span class="sq given-sq">×</span>
				{#each Array(P - bt.length) as _, i (i)}<span class="sq"></span>{/each}
				{#each bt as d, k (k)}<span class="sq given-sq" class:dim={!lit(`bottom${Number(d) * 10 ** (bt.length - 1 - k)}`)}>{d}</span>{/each}
			</span>
			<span class="rule" style:grid-row="2" style:grid-column="1 / span {P + 1}" aria-hidden="true"></span>
			{#each work.rows as p, i (p.id)}
				<span class="row" style:grid-row={3 + i}>
					{#if work.sum && i === rows - 1}<span class="sq sign-sq" aria-hidden="true">+</span>{/if}
					{@render slot(p.id)}
				</span>
				<span class="label" class:dim={!lit(p.id)} class:faint={!shown(p.id)} style:grid-row={3 + i} style:grid-column={P + 2}>{p.bottom} × {p.top}</span>
			{/each}
			{#if work.sum}
				<span class="rule" style:grid-row={2 + rows} style:grid-column="1 / span {P + 1}" aria-hidden="true"></span>
				<span class="row" style:grid-row={3 + rows}>{@render slot('sum')}</span>
			{/if}
		</div>
	{/if}
</div>

<style>
	.work {
		--line-ink: var(--ink);
		display: grid;
		width: max-content;
		max-width: none;
		justify-items: center;
		gap: calc(var(--sq) * 0.6);
		color: var(--ink);
		font-size: calc(var(--sq) * 0.58);
		font-weight: 700;
		font-variant-numeric: tabular-nums;
		line-height: 1;
	}
	.sq {
		display: grid;
		place-items: center;
		width: var(--sq);
		height: var(--sq);
	}
	.given,
	.slot {
		display: flex;
		height: var(--sq);
	}
	.mirror {
		color: var(--ink-soft);
	}
	.dim {
		opacity: 0.32;
		transition: opacity 0.25s;
	}
	.faint {
		opacity: 0.45;
	}
	.slot.hidden .sq {
		border-bottom: 2px dashed var(--line);
	}

	/* the ladder: divisor ) dividend, a product and a difference for each rung, the partial quotients on the side */
	.ladder {
		display: grid;
		grid-template-columns: repeat(var(--cols), var(--sq));
		grid-template-rows: repeat(var(--rows), var(--sq));
	}
	.cell {
		display: flex;
		justify-content: flex-end;
		z-index: 1;
	}
	.bracket {
		border-top: 3px solid var(--line-ink);
		border-left: 3px solid var(--line-ink);
		border-top-left-radius: calc(var(--sq) * 0.5) 30%;
	}
	.sign,
	.r-label {
		display: grid;
		place-items: center;
	}
	.r-label {
		color: var(--remainder);
	}
	.frac {
		display: flex;
		align-items: center;
		justify-content: flex-start;
		margin-left: calc(var(--sq) * 0.25);
	}
	.slash {
		display: grid;
		place-items: center;
		width: calc(var(--sq) * 0.6);
		color: var(--remainder);
	}
	.rule {
		align-self: end;
		height: 0;
		border-bottom: 3px solid var(--line-ink);
	}
	.rule.top {
		align-self: start;
		border-bottom: 0;
		border-top: 3px solid var(--line-ink);
	}
	.divider {
		justify-self: center;
		width: 0;
		border-left: 3px solid var(--accent);
	}
	.side-head {
		display: grid;
		place-items: center end;
		color: var(--accent-dark);
		font-size: 0.62em;
	}

	/* the area model for division: sections of one rectangle, the divisor on its side */
	.adiv {
		display: grid;
		justify-items: center;
		gap: calc(var(--sq) * 0.5);
	}
	.sections {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		align-items: flex-end;
		row-gap: calc(var(--sq) * 0.4);
	}
	.dvr {
		align-self: flex-end;
		margin-bottom: var(--sq);
		margin-right: calc(var(--sq) * 0.2);
	}
	.section {
		display: grid;
		grid-template-rows: var(--sq) auto;
	}
	.width {
		display: flex;
		justify-content: center;
		border-bottom: 0;
		color: var(--accent-dark);
	}
	.box {
		width: calc(var(--sq) * var(--w) + 6px);
		margin-left: -3px;
		padding: 0 3px 0 0;
		border: 3px solid var(--line-ink);
		background: color-mix(in srgb, var(--accent-wash) 45%, transparent);
	}
	.line {
		display: flex;
		justify-content: flex-end;
		height: var(--sq);
	}
	.line.under {
		border-top: 3px solid var(--line-ink);
	}
	.total {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: center;
		gap: 0 calc(var(--sq) * 0.25);
	}
	.words {
		font-size: 0.62em;
		color: var(--ink-soft);
	}
	.sum-words {
		font-size: 0.7em;
		color: var(--ink-soft);
	}
	.rem-word {
		margin-left: calc(var(--sq) * 0.3);
		color: var(--remainder);
		font-size: 1em;
	}

	/* the area model for multiplication: the top number's parts across, the bottom number's down the side */
	.amul {
		display: grid;
		grid-auto-rows: calc(var(--sq) * 1.6);
	}
	.corner,
	.part {
		display: grid;
		place-items: center;
		padding: 0 calc(var(--sq) * 0.2);
		color: var(--accent-dark);
	}
	.corner {
		color: var(--muted);
	}
	.top-part {
		align-self: end;
		height: var(--sq);
	}
	.side-part {
		justify-self: end;
	}
	.area-cell {
		display: grid;
		place-items: center;
		margin: -1.5px;
		border: 3px solid var(--line-ink);
		background: color-mix(in srgb, var(--accent-wash) 45%, transparent);
	}
	.list,
	.pp {
		display: grid;
		grid-template-columns: repeat(var(--cols), var(--sq)) auto;
		grid-auto-rows: var(--sq);
	}
	.row {
		display: flex;
		justify-content: flex-end;
		grid-column: 1 / span var(--cols);
	}
	.given-sq {
		color: var(--ink);
	}
	.sign-sq {
		margin-right: auto;
	}
	.label {
		display: grid;
		align-items: center;
		padding-left: calc(var(--sq) * 0.35);
		color: var(--muted);
		font-size: 0.55em;
		white-space: nowrap;
	}
</style>
