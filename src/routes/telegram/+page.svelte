<script lang="ts">
	import { config } from '#lib/config';
</script>

<header class="mb-6">
	<h1 class="font-display text-2xl font-bold tracking-tight">TELEGRAM</h1>
	<p class="mt-1 text-sm text-offwhite/50">
		Live feed from {config.social.telegram} via Bot API, inline replies, bot commands (/minister
		/stats /meme /buy /roadmap).
	</p>
</header>

<div
	class="grid h-64 place-items-center rounded-xl border border-dashed border-navy-700 bg-navy-800/30"
>
	<div class="text-center">
		<div class="font-display text-lg text-offwhite/60">Live feed lands in the next drop</div>
		<div class="mt-1 text-xs text-offwhite/30">
			Phase 1 · paste a bot token in Settings to light it up
		</div>
	</div>
</div>
