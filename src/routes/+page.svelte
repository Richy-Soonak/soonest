<script lang="ts">
	import { goto } from '$app/navigation';
	import { config } from '$lib/config';
	import { PILLARS, postsInRange, fmtDate, type Post } from '$lib/db';

	// ---- live metrics: Jupiter (price) + RugCheck (holders, LP lock) ----
	let price = $state<string | null>(null);
	let holders = $state<number | null>(null);
	let lpPct = $state<number | null>(null);
	let priceErr = $state('');
	let lastFetch = $state<Date | null>(null);

	async function fetchMetrics() {
		try {
			const j = await fetch(
				`https://lite-api.jup.ag/price/v3?ids=${config.token.contract}`
			).then((r) => r.json());
			const e = j?.[config.token.contract];
			price = e?.usdPrice != null ? Number(e.usdPrice).toPrecision(4) : null;
			priceErr = '';
		} catch (e) {
			priceErr = e instanceof Error ? e.message : String(e);
		}
		try {
			const r = await fetch(
				`https://api.rugcheck.xyz/v1/tokens/${config.token.contract}/report`
			).then((res) => res.json());
			holders = typeof r?.totalHolders === 'number' ? r.totalHolders : null;
			const lps: number[] = (r?.markets ?? [])
				.map((m: { lp?: { lpLockedPct?: number } }) => m?.lp?.lpLockedPct)
				.filter((v: unknown): v is number => typeof v === 'number');
			lpPct = lps.length ? Math.max(...lps) : null;
		} catch {
			// keep last known values; cards show '—' until first success
		}
		lastFetch = new Date();
	}

	$effect(() => {
		fetchMetrics();
		const t = setInterval(fetchMetrics, 30_000); // spec: metrics every 30s
		return () => clearInterval(t);
	});

	// ---- today's queue from SQLite ----
	let queue = $state<Post[]>([]);
	async function loadQueue() {
		const today = fmtDate(new Date());
		queue = await postsInRange(`${today}T00:00`, `${today}T23:59`);
	}
	$effect(() => {
		loadQueue();
	});

	const metrics = $derived([
		{
			label: 'Price',
			value: price ? `$${price}` : '—',
			sub: priceErr || 'live · Jupiter'
		},
		{ label: 'Volume 24h', value: '$0.00', sub: 'honest — not hiding it' },
		{ label: 'Holders', value: holders !== null ? String(holders) : '—', sub: 'live · RugCheck' },
		{
			label: 'LP Lock',
			value: lpPct !== null ? `${lpPct}% 🔒` : '—',
			sub: 'never unlocking'
		}
	]);
</script>

<header class="mb-6 flex items-center justify-between">
	<div class="flex items-center gap-3">
		<img
			src="/logo.png"
			alt="Richy Soonak"
			class="h-10 w-10 rounded-full border border-navy-700"
		/>
		<h1 class="font-display text-2xl font-bold tracking-tight">MINISTRY DESK</h1>
	</div>
	<div class="text-xs text-offwhite/40">
		{config.token.name} (${config.token.symbol})
		{#if lastFetch}· updated {lastFetch.toLocaleTimeString()}{/if}
	</div>
</header>

<section class="mb-6 grid grid-cols-4 gap-4">
	{#each metrics as m}
		<div class="rounded-xl border border-navy-700 bg-navy-800/50 p-4">
			<div class="text-xs tracking-wide text-offwhite/50 uppercase">{m.label}</div>
			<div class="nums font-display mt-2 text-2xl font-bold">{m.value}</div>
			<div class="mt-1 text-xs text-offwhite/40">{m.sub}</div>
		</div>
	{/each}
</section>

<section class="mb-6">
	<div class="mb-3 flex items-center justify-between">
		<h2 class="text-sm font-semibold tracking-wide text-offwhite/60 uppercase">
			Today's post queue
		</h2>
		<button
			class="text-xs text-cyan-glow/70 hover:text-cyan-glow"
			onclick={() => goto('/calendar')}
		>
			open calendar →
		</button>
	</div>
	{#if queue.length === 0}
		<div
			class="rounded-lg border border-dashed border-navy-700 bg-navy-800/30 px-4 py-6 text-center text-xs text-offwhite/30"
		>
			Nothing scheduled today. Fill the week from templates on the Calendar.
		</div>
	{:else}
		<div class="space-y-2">
			{#each queue as p}
				{@const meta = PILLARS[p.pillar]}
				<button
					class="flex w-full items-center gap-4 rounded-lg border border-navy-700 bg-navy-800/50 px-4 py-3 text-left hover:border-cyan-glow/40"
					onclick={() => goto(`/compose?id=${p.id}`)}
				>
					<span class="nums text-sm text-offwhite/50">{p.scheduled_at.slice(11)}</span>
					<span class="text-sm font-medium {meta.text}">{meta.label}</span>
					<span class="ml-auto rounded-full border border-navy-700 px-2 py-0.5 text-xs text-offwhite/60">
						{p.status}
					</span>
				</button>
			{/each}
		</div>
	{/if}
</section>

<p class="text-xs text-offwhite/30">
	Phase 1 · price, holders and LP lock update every 30s · Telegram posting live in the Composer
</p>
