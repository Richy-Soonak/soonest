<script lang="ts">
	import { loadCreds, saveCreds, testTelegram, hasTelegram, hasX, type Credentials } from '$lib/credentials';

	let creds = $state<Credentials | null>(null);
	let saving = $state(false);
	let savedAt = $state('');
	let testing = $state(false);
	let testResult = $state<{ ok: boolean; text: string } | null>(null);

	$effect(() => {
		loadCreds().then((c) => (creds = c));
	});

	async function save() {
		if (!creds) return;
		saving = true;
		await saveCreds(creds);
		saving = false;
		savedAt = new Date().toLocaleTimeString();
	}

	async function runTest() {
		if (!creds) return;
		testing = true;
		testResult = null;
		const r = await testTelegram(creds);
		testResult = r.ok
			? { ok: true, text: `Bot ${r.bot} answered — test message sent to chat.` }
			: { ok: false, text: r.error };
		testing = false;
	}

	const input =
		'mt-1 w-full rounded-lg border border-navy-700 bg-navy-800 px-3 py-2 text-sm placeholder:text-offwhite/25 focus:border-cyan-glow/50 focus:outline-none';
</script>

<header class="mb-6">
	<h1 class="font-display text-2xl font-bold tracking-tight">SETTINGS</h1>
	<p class="mt-1 text-sm text-offwhite/50">
		Credentials are stored locally on this Mac (app-data, per-user) — never in the repo, never
		synced.
	</p>
</header>

{#if !creds}
	<p class="text-sm text-offwhite/40">Loading…</p>
{:else}
	<div class="max-w-2xl space-y-6">
		<section class="rounded-xl border border-navy-700 bg-navy-800/30 p-5">
			<h2 class="font-display mb-1 font-bold">Telegram</h2>
			<p class="mb-4 text-xs text-offwhite/40">
				Token from @BotFather · chat ID of your channel (negative number for groups/channels).
				{hasTelegram(creds) ? '✓ configured' : 'not configured yet'}
			</p>
			<label class="block text-xs tracking-wide text-offwhite/50 uppercase">Bot token</label>
			<input type="password" bind:value={creds.tg_token} placeholder="123456:ABC-DEF…" class={input} />
			<label class="mt-3 block text-xs tracking-wide text-offwhite/50 uppercase">Chat ID</label>
			<input bind:value={creds.tg_chat} placeholder="-1001234567890" class={input} />
			<button
				class="mt-3 rounded-lg border border-navy-700 px-4 py-1.5 text-xs text-offwhite/70 hover:bg-navy-800 disabled:opacity-40"
				disabled={testing || !hasTelegram(creds)}
				onclick={runTest}
			>
				{testing ? 'Testing…' : 'Test connection'}
			</button>
			{#if testResult}
				<div class="mt-2 text-xs {testResult.ok ? 'text-cyan-glow' : 'text-pink-glow'}">
					{testResult.text}
				</div>
			{/if}
		</section>

		<section class="rounded-xl border border-navy-700 bg-navy-800/30 p-5">
			<h2 class="font-display mb-1 font-bold">X / Twitter API</h2>
			<p class="mb-4 text-xs text-offwhite/40">
				OAuth 1.0a keys for @{creds.x_consumer_key ? 'your account' : 'RichySoonak'}.
				{hasX(creds) ? '✓ configured' : 'not configured yet'} — posting wires in with the Rust
				OAuth backend (Phase 2); analytics needs a paid read tier.
			</p>
			<div class="grid grid-cols-2 gap-4">
				<div>
					<label class="block text-xs tracking-wide text-offwhite/50 uppercase"
						>Consumer key</label
					>
					<input type="password" bind:value={creds.x_consumer_key} class={input} />
				</div>
				<div>
					<label class="block text-xs tracking-wide text-offwhite/50 uppercase"
						>Consumer secret</label
					>
					<input type="password" bind:value={creds.x_consumer_secret} class={input} />
				</div>
				<div>
					<label class="block text-xs tracking-wide text-offwhite/50 uppercase"
						>Access token</label
					>
					<input type="password" bind:value={creds.x_access_token} class={input} />
				</div>
				<div>
					<label class="block text-xs tracking-wide text-offwhite/50 uppercase"
						>Access secret</label
					>
					<input type="password" bind:value={creds.x_access_secret} class={input} />
				</div>
			</div>
		</section>

		<section class="rounded-xl border border-navy-700 bg-navy-800/30 p-5">
			<h2 class="font-display mb-1 font-bold">Solana RPC</h2>
			<p class="mb-4 text-xs text-offwhite/40">
				Public endpoint by default (rate-limited). Add a Helius/QuickNode URL for reliability.
			</p>
			<input bind:value={creds.rpc_url} placeholder="https://api.mainnet-beta.solana.com" class={input} />
		</section>

		<div class="flex items-center gap-4">
			<button
				class="rounded-lg bg-cyan-glow px-5 py-2 text-sm font-bold text-navy hover:brightness-110 disabled:opacity-40"
				disabled={saving}
				onclick={save}
			>
				{saving ? 'Saving…' : 'Save credentials'}
			</button>
			{#if savedAt}
				<span class="text-xs text-cyan-glow">Saved at {savedAt}</span>
			{/if}
		</div>
	</div>
{/if}
