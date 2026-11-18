<script lang="ts">
	// The About page.
	import { NAME } from '$lib/name';
	import Logo from '$lib/Logo.svelte';
	import Footer from '$lib/Footer.svelte';
	import { goBack } from '$lib/nav.svelte';
	import MethodPicture from '$lib/MethodPicture.svelte';
	import { methodInfo, type Method } from '$lib/methods';
	import type { Kind } from '$lib/logic';
	const WAYS: { kind: Kind; method: Method; title: string; kid: string }[] = [
		{
			kind: 'divide',
			method: 'ladder',
			title: 'The ladder (partial quotients)',
			kid: 'Instead of one digit at a time, take away big, easy groups. For 945 ÷ 7, take away 100 sevens (700), then 30 sevens (210), then 5 sevens (35). Add the groups: 100 + 30 + 5 = 135. You can take away any number of groups that fits, so there’s more than one right way down the ladder.'
		},
		{
			kind: 'divide',
			method: 'area',
			title: 'The area model for division (box method)',
			kid: 'Think of 945 as the area of a rectangle that is 7 tall. How wide is it? Fill it in sections: a section 100 wide holds 700, one 30 wide holds 210, and one 5 wide holds 35. Add the widths to get 135. Anything that doesn’t fill a whole column is the remainder.'
		},
		{
			kind: 'multiply',
			method: 'area',
			title: 'The area model for multiplication',
			kid: 'Split each number into its places: 46 is 40 + 6 and 23 is 20 + 3. Draw a rectangle with a box for each pair and multiply: 40 × 20 = 800, 6 × 20 = 120, 40 × 3 = 120 and 6 × 3 = 18. Add the boxes: 1,058.'
		},
		{
			kind: 'multiply',
			method: 'partial',
			title: 'Partial products',
			kid: 'The same parts as the area model, written as a list. Multiply each place of the bottom number by each place of the top: 3 × 6, 3 × 40, 20 × 6 and 20 × 40. Line them up on the right and add.'
		}
	];
	$effect(() => {
		document.title = `About · ${NAME}`;
	});
</script>

<div class="page">
	<header class="bar">
		<button type="button" class="btn-ghost" onclick={goBack}>← Back</button>
		<h1><Logo size={32} /> About {NAME}</h1>
	</header>
	<p class="lede">
		Practice for long division, multiplication, addition and subtraction, one box at a time, with whole numbers or
		decimals: the standard algorithms, the ladder and area model for division, and the area model and partial products
		for multiplication.
	</p>

	<section class="card">
		<h2>What it is</h2>
		<p>
			Students work each problem on graph paper, box by box: divide, multiply, subtract and bring down; multiply
			each digit, carry and add; or add and subtract in columns, carrying and regrouping. A teacher picks the problems
			and how much help students get, from watching the page work a problem to doing it on their own, and shares the
			activity as a link or a QR code.
		</p>
	</section>

	<section class="card">
		<h2>Remainders and decimals</h2>
		<p>
			A remainder can be written three ways: as R (7 R 2), as a fraction over the number you divided by (7 2/3, and
			2/4 or 1/2 are both right), or as a decimal. For a decimal, write a point and a 0 after the number you’re
			dividing, lift the point straight up, and keep bringing down zeros. Stop when nothing is left, or after 2 decimal
			places: then the answer ends in “…”, and says what it rounds to.
		</p>
		<p>
			With decimals, the point in the number you’re dividing goes straight up into the answer. Dividing by a decimal,
			first move the point in both numbers the same number of places, until the one you divide by is whole: 4.5 ÷ 0.3
			is the same as 45 ÷ 3. Multiplying decimals, multiply as if there were no points, then count the decimal places
			in both numbers: the answer has that many. Adding and subtracting, line up the points.
		</p>
	</section>

	<section class="card">
		<h2>Other ways to work it</h2>
		<p>
			Teachers can choose a method for each activity, and students practicing on their own can pick one too. The
			standard algorithms are the usual choice; these work the same problems another way.
		</p>
		{#each WAYS as w (w.kind + w.method)}
			<div class="way">
				<h3>{w.title}</h3>
				<p>{w.kid}</p>
				<ol>
					{#each methodInfo(w.kind, w.method).steps as st (st)}<li>{st}</li>{/each}
				</ol>
				<MethodPicture kind={w.kind} method={w.method} />
			</div>
		{/each}
	</section>

	<section class="card">
		<h2>Your privacy</h2>
		<p>
			A teacher’s activities are kept with their Oomba account. A shared activity is saved on Oomba with just its
			problems and the support chosen, not its title. Nothing a student types is saved or sent: when they finish, the
			game reports only how many problems they got right.
		</p>
	</section>

	<Footer />
</div>

<style>
	.page {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		min-height: 100dvh;
		max-width: 46rem;
		margin: 0 auto;
		padding: 1.5rem 1rem 1rem;
	}
	.bar {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 1rem;
	}
	h1 {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		margin: 0;
		font-size: 1.8rem;
		font-weight: 800;
	}
	.lede {
		margin: 0;
		color: var(--muted);
		line-height: 1.5;
	}
	.card {
		padding: 1.1rem 1.25rem;
		border: 2px solid var(--line);
		border-radius: var(--radius-lg);
		background: var(--paper);
	}
	h2 {
		margin: 0 0 0.4rem;
		font-size: 1.15rem;
		font-weight: 800;
	}
	p {
		margin: 0;
		color: var(--ink-soft);
		line-height: 1.5;
	}
	.way {
		display: grid;
		gap: 0.45rem;
		margin-top: 1rem;
		padding-top: 1rem;
		border-top: 2px solid var(--line);
	}
	h3 {
		margin: 0;
		font-size: 1rem;
		font-weight: 800;
	}
	.way ol {
		margin: 0;
		padding-left: 1.3rem;
		color: var(--ink-soft);
		line-height: 1.45;
		list-style: decimal;
	}
	.way :global(.picture) {
		border: 2px solid var(--line);
		border-radius: 12px;
	}
</style>
