<script lang="ts">
	import {
		loadCreds,
		saveCreds,
		testTelegram,
		aiComplete,
		hasTelegram,
		hasX,
		hasAI,
		type Credentials
	} from '$lib/credentials';

	let creds = $state<Credentials | null>(null);
	let saving = $state(false);
	let savedAt = $state('');
	let testing = $state(false);
	let testResult = $state<{ ok: boolean; text: string } | null>(null);
	let testingAI = $state(false);
	let aiResult = $state<{ ok: boolean; text: string } | null>(null);
	let saveError = $state('');

	$effect(() => {
		loadCreds().then((c) => (creds = c));
	});

	async function save() {
		if (!creds) return;
		saving = true;
		saveError = '';
		const r = await saveCreds(creds);
		saving = false;
		if (!r.ok) {
			saveError = r.error;
			return;
		}
		const check = await loadCreds();
		if (check.or_key !== creds.or_key.trim()) {
			saveError = 'Write verified in store but reload mismatch — restarting the app clears this.';
			return;
		}
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

	async function runAITest() {
		if (!creds) return;
		testingAI = true;
		aiResult = null;
		const r = await aiComplete(
			creds,
			'You are a connectivity probe. Reply with exactly: MINISTRY ONLINE',
			'ping'
		);
		aiResult = r.ok
			? { ok: true, text: `${r.model} answered: "${r.text}"` }
			: { ok: false, text: r.error };
		testingAI = false;
	}

	const input =
		'mt-1 w-full rounded-lg border border-navy-700 bg-navy-800 px-3 py-2 text-sm placeholder:text-offwhite/25 focus:border-cyan-glow/50 focus:outline-none';
</script>

<header class="mb-6">
	<h1 class="font-display text-2xl font-bold tracking-tight">SETTINGS</h1>
	<p class="mt-1 text-sm text-offwhite/50">
		Credentials are stored locally on this Mac — secrets (bot token, X keys, OpenRouter key) in
		the <span class="text-offwhite/80">macOS Keychain, encrypted at rest</span>; everything else
		in the app-data folder. Never in the repo, never synced.
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
			<h2 class="font-display mb-1 font-bold">AI (OpenRouter)</h2>
			<p class="mb-4 text-xs text-offwhite/40">
				One key, any model — drafts, bot replies and scorecard verdicts run through whatever you
				pick here. {hasAI(creds)
					? `✓ configured${creds.or_model.trim() ? ` · ${creds.or_model.trim()}` : ''}`
					: 'not configured yet'}
			</p>
			<label class="block text-xs tracking-wide text-offwhite/50 uppercase">API key</label>
			<input type="password" bind:value={creds.or_key} placeholder="sk-or-…" class={input} />
			<label class="mt-3 block text-xs tracking-wide text-offwhite/50 uppercase">
				Model name
			</label>
			<input
				bind:value={creds.or_model}
				placeholder="e.g. anthropic/claude-sonnet-4 — blank = openai/gpt-4o-mini"
				class={input}
			/>
			<button
				class="mt-3 rounded-lg border border-navy-700 px-4 py-1.5 text-xs text-offwhite/70 hover:bg-navy-800 disabled:opacity-40"
				disabled={testingAI || !hasAI(creds)}
				onclick={runAITest}
			>
				{testingAI ? 'Asking the model…' : 'Test AI'}
			</button>
			{#if aiResult}
				<div class="mt-2 text-xs {aiResult.ok ? 'text-cyan-glow' : 'text-pink-glow'}">
					{aiResult.text}
				</div>
			{/if}
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
				<span class="text-xs text-cyan-glow">Saved & verified at {savedAt}</span>
			{/if}
		</div>
		{#if saveError}
			<div class="mt-3 rounded-lg border border-pink-glow/40 px-4 py-3 text-xs text-pink-glow">
				Save failed: {saveError}
			</div>
		{/if}
	</div>
{/if}
