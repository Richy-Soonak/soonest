<script lang="ts">
	import { config } from '#lib/config';

	// ---- live metrics (v0: price via Jupiter lite API; holders/LP wiring next) ----
	let price = $state<string | null>(null);
	let priceErr = $state('');
	let lastFetch = $state<Date | null>(null);

	async function fetchPrice() {
		try {
			const r = await fetch(
				`https://lite-api.jup.ag/price/v3?ids=${config.token.contract}`
			);
			if (!r.ok) throw new Error(`HTTP ${r.status}`);
			const j = await r.json();
			const entry = j?.[config.token.contract];
			price = entry?.usdPrice != null ? Number(entry.usdPrice).toPrecision(4) : null;
			priceErr = '';
			lastFetch = new Date();
		} catch (e) {
			priceErr = e instanceof Error ? e.message : String(e);
		}
	}

	$effect(() => {
		fetchPrice();
		const t = setInterval(fetchPrice, 30_000); // spec: metrics refresh every 30s
		return () => clearInterval(t);
	});

	const metrics = $derived([
		{ label: 'Price', value: price ? `$${price}` : '—', sub: priceErr || 'live · Jupiter' },
		{ label: 'Volume 24h', value: '$0.00', sub: 'honest — not hiding it' },
		{ label: 'Holders', value: '—', sub: 'wiring next' },
		{ label: 'LP Lock', value: '95% 🔒', sub: 'never unlocking' }
	]);

	const queue = [
		{ time: '09:00', pillar: "Minister's Desk", status: 'ready' },
		{ time: '12:00', pillar: 'Meme Wars', status: 'scheduled' },
		{ time: '18:00', pillar: 'Ministry Report', status: 'draft' }
	];

	const pillarColor: Record<string, string> = {
		"Minister's Desk": 'text-cyan-glow',
		'Meme Wars': 'text-pink-glow',
		'Ministry Report': 'text-purple-glow'
	};
</script>

<div class="flex h-screen">
	<!-- sidebar -->
	<aside class="w-56 shrink-0 border-r border-navy-700 bg-navy-800/50 p-5">
		<div class="mb-8 flex items-center gap-3">
			<div
				class="grid h-14 w-14 place-items-center rounded-full border-2 border-cyan-glow shadow-[0_0_16px_#00e5ff55]"
			>
				<span class="font-display text-lg font-bold text-cyan-glow">RS</span>
				<span class="absolute mt-9 ml-9 h-3 w-3 rounded-full bg-green-400"></span>
			</div>
			<div>
				<div class="font-display font-bold">The Minister</div>
				<div class="text-xs text-green-400">● Active</div>
			</div>
		</div>
		<nav class="space-y-1 text-sm">
			{#each ['Desk', 'Calendar', 'Compose', 'Analytics', 'Telegram', 'Settings'] as item, i}
				<div
					class="rounded-lg px-3 py-2 {i === 0
						? 'bg-navy-700 text-cyan-glow'
						: 'text-offwhite/60'}"
				>
					{item}
				</div>
			{/each}
		</nav>
	</aside>

	<!-- main -->
	<main class="flex-1 overflow-auto p-8">
		<header class="mb-6 flex items-center justify-between">
			<h1 class="font-display text-2xl font-bold tracking-tight">MINISTRY DESK</h1>
			<div class="text-xs text-offwhite/40">
				{config.token.name} (${config.token.symbol})
				{#if lastFetch}
					· updated {lastFetch.toLocaleTimeString()}
				{/if}
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
			<h2 class="mb-3 text-sm font-semibold tracking-wide text-offwhite/60 uppercase">
				Today's Post Queue
			</h2>
			<div class="space-y-2">
				{#each queue as q}
					<div
						class="flex items-center gap-4 rounded-lg border border-navy-700 bg-navy-800/50 px-4 py-3"
					>
						<span class="nums text-sm text-offwhite/50">{q.time}</span>
						<span class="text-sm font-medium {pillarColor[q.pillar] ?? ''}">{q.pillar}</span>
						<span
							class="ml-auto rounded-full border border-navy-700 px-2 py-0.5 text-xs text-offwhite/60"
						>
							{q.status}
						</span>
					</div>
				{/each}
			</div>
		</section>

		<p class="text-xs text-offwhite/30">
			Phase 1 scaffold — calendar, composer, Telegram feed and settings land next.
		</p>
	</main>
</div>
