<script lang="ts">
	import '../app.css';
	import { page } from '$app/state';

	let { children } = $props();

	const nav = [
		{ label: 'Desk', href: '/' },
		{ label: 'Calendar', href: '/calendar' },
		{ label: 'Compose', href: '/compose' },
		{ label: 'Analytics', href: '/analytics' },
		{ label: 'Telegram', href: '/telegram' },
		{ label: 'Settings', href: '/settings' }
	];
</script>

<div class="flex h-screen">
	<aside class="w-56 shrink-0 border-r border-navy-700 bg-navy-800/50 p-5">
		<div class="mb-8 flex items-center gap-3">
			<div
				class="relative grid h-14 w-14 place-items-center rounded-full border-2 border-cyan-glow shadow-[0_0_16px_#00e5ff55]"
			>
				<span class="font-display text-lg font-bold text-cyan-glow">RS</span>
				<span class="absolute right-0 bottom-0 h-3 w-3 rounded-full bg-green-400"></span>
			</div>
			<div>
				<div class="font-display font-bold">The Minister</div>
				<div class="text-xs text-green-400">● Active</div>
			</div>
		</div>

		<nav class="space-y-1 text-sm">
			{#each nav as item}
				<a
					href={item.href}
					class="block rounded-lg px-3 py-2 transition-colors {page.url.pathname === item.href
						? 'bg-navy-700 text-cyan-glow'
						: 'text-offwhite/60 hover:bg-navy-800 hover:text-offwhite'}"
				>
					{item.label}
				</a>
			{/each}
		</nav>

		<div class="mt-10 text-[10px] leading-relaxed text-offwhite/25">
			Soonest v0.1 · Phase 1<br />
			$SOONAK · 95% LP locked
		</div>
	</aside>

	<main class="flex-1 overflow-auto p-8">
		{@render children()}
	</main>
</div>
