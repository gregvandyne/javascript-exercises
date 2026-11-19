<script lang="ts">
	// The About page.
	import { NAME_HERE as NAME } from '$lib/i18n';
	import Logo from '$lib/Logo.svelte';
	import Footer from '$lib/Footer.svelte';
	import { goBack } from '$lib/nav.svelte';
	import { t } from '$lib/i18n';
	import MethodPicture from '$lib/MethodPicture.svelte';
	import { methodInfo, type Method } from '$lib/methods';
	import type { Kind } from '$lib/logic';
	const WAYS: { kind: Kind; method: Method; title: string; kid: string }[] = (
		[
			['divide', 'ladder'],
			['divide', 'area'],
			['multiply', 'area'],
			['multiply', 'partial']
		] as [Kind, Method][]
	).map(([kind, method]) => ({ kind, method, title: t(`ui.aboutPage.${kind}.${method}`), kid: t(`ui.aboutPage.${kind}.${method}.kid`) }));
	$effect(() => {
		document.title = `${t('ui.about')} · ${NAME}`;
	});
</script>

<div class="page">
	<header class="bar">
		<button type="button" class="btn-ghost" onclick={goBack}>{t('ui.back')}</button>
		<h1><Logo size={32} /> {t('ui.aboutPage.title', { x: NAME })}</h1>
	</header>
	<p class="lede">{t('ui.aboutPage.lede')}</p>

	<section class="card">
		<h2>{t('ui.aboutPage.what')}</h2>
		<p>{t('ui.aboutPage.whatText')}</p>
		<p>{t('ui.aboutPage.helpText')}</p>
	</section>

	<section class="card">
		<h2>{t('ui.aboutPage.decimals')}</h2>
		<p>{t('ui.aboutPage.remText')}</p>
		<p>{t('ui.aboutPage.decText')}</p>
	</section>

	<section class="card">
		<h2>{t('ui.aboutPage.ways')}</h2>
		<p>{t('ui.aboutPage.waysText')}</p>
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
		<h2>{t('ui.aboutPage.privacy')}</h2>
		<p>{t('ui.aboutPage.privacyText')}</p>
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
