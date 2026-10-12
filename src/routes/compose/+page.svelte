<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import {
		getPost,
		insertPost,
		updatePost,
		markPosted,
		deletePost,
		PILLARS,
		PILLAR_KEYS,
		fmtDateTime,
		type Post,
		type PillarKey
	} from '$lib/db';
	import {
		loadCreds,
		hasTelegram,
		hasX,
		sendTelegram,
		aiComplete,
		cleanDraft,
		type Credentials
	} from '$lib/credentials';
	import { config } from '$lib/config';
	import { fetchWires, type Headline } from '$lib/news';

	let pillar = $state<PillarKey>('desk');
	let content = $state('');
	let platform = $state<Post['platform']>('both');
	let scheduledAt = $state(fmtDateTime(new Date()));
	let editingId = $state<number | null>(null);
	let editStatus = $state<string>('draft');
	let msg = $state('');
	let msgOk = $state(false);
	let creds = $state<Credentials | null>(null);
	let loadedFor = $state('');
	let drafting = $state(false);
	let headlines = $state<Headline[]>([]);
	let sel = $state<boolean[]>([]);
	let newsLoading = $state(false);

	async function refreshNews() {
		newsLoading = true;
		headlines = await fetchWires();
		sel = headlines.map((_, i) => i < 6); // pre-tick the six freshest
		newsLoading = false;
	}

	$effect(() => {
		refreshNews();
	});

	function chosenWires(): string[] {
		return headlines.filter((_, i) => sel[i]).map((h) => `- ${h.title} (${h.age} ago)`);
	}

	const maxLen = $derived(platform === 'telegram' ? 4096 : 280);
	const over = $derived(content.length > maxLen);

	const SNIPPETS: Record<string, string> = {
		"Minister's Rant":
			'Reminder: your portfolio is a reflection of your attention. Where is it looking? $SOONAK',
		'Meme Wars CTA':
			'Meme Wars round is open. Drop your best Richy Soonak meme. Winner gets clout + tokens. #MemeWars $SOONAK',
		'Honest Numbers':
			'The honest numbers: small volume, real holders, 95% LP locked and never unlocking. We are not pretending. $SOONAK',
		'Anti-Rug Thread':
			'Why we will not rug: liquidity is locked, the ministry is public, and every number we post is the real one. $SOONAK'
	};

	$effect(() => {
		const q = page.url.searchParams;
		const id = q.get('id');
		const key = id ? `id:${id}` : `new:${q.get('date') ?? ''}${q.get('time') ?? ''}`;
		if (key === loadedFor) return;
		loadedFor = key;
		msg = '';
		if (id) {
			getPost(Number(id)).then((p: Post | null) => {
				if (!p) return;
				editingId = p.id;
				editStatus = p.status;
				pillar = p.pillar;
				content = p.content;
				platform = p.platform;
				scheduledAt = p.scheduled_at;
			});
		} else {
			editingId = null;
			editStatus = 'draft';
			content = '';
			const date = q.get('date');
			const time = q.get('time');
			scheduledAt = date && time ? `${date}T${time}` : fmtDateTime(new Date());
			pillar = 'desk';
			platform = 'both';
		}
	});

	creds ??= null;
	$effect(() => {
		loadCreds().then((c) => (creds = c));
	});

	async function persist(status: Post['status']): Promise<number> {
		if (editingId !== null) {
			await updatePost(editingId, { pillar, content, platform, scheduled_at: scheduledAt, status });
			return editingId;
		}
		return insertPost({ pillar, content, platform, scheduled_at: scheduledAt, status });
	}

	function flash(text: string, ok = true) {
		msg = text;
		msgOk = ok;
	}

	async function saveDraft() {
		if (!content.trim()) return flash('Nothing to save — write something first.', false);
		await persist('draft');
		flash('Draft saved.');
	}

	async function schedule() {
		if (!content.trim()) return flash('Nothing to schedule — write something first.', false);
		if (!scheduledAt) return flash('Pick a date and time first.', false);
		await persist('scheduled');
		flash(`Scheduled for ${scheduledAt.replace('T', ' ')}.`);
	}

	async function postNow() {
		if (!content.trim()) return flash('Nothing to post — write something first.', false);
		if (!creds) return flash('Loading settings… try again in a second.', false);

		const wantsTg = platform !== 'x';
		const wantsX = platform !== 'telegram';

		if (wantsTg && !hasTelegram(creds)) {
			return flash('Telegram needs a bot token + chat ID — add them in Settings.', false);
		}

		let tgOk = false;
		let xNote = '';
		if (wantsTg) {
			const r = await sendTelegram(creds, content);
			if (!r.ok) return flash(`Telegram refused: ${r.error}`, false);
			tgOk = true;
		}
		if (wantsX) {
			xNote = hasX(creds)
				? ' X posting wires in with the Rust OAuth backend (Phase 2) — saved as scheduled meanwhile.'
				: ' X not configured in Settings — saved as scheduled.';
		}

		const id = await persist(tgOk ? 'posted' : 'scheduled');
		if (tgOk) await markPosted(id);
		flash(
			tgOk
				? `Posted to Telegram.${xNote}`
				: `Saved as scheduled.${xNote}`
		);
	}

	async function remove() {
		if (editingId !== null) await deletePost(editingId);
		goto('/');
	}

	async function draftAI() {
		if (!creds) return flash('Loading settings… try again in a second.', false);
		drafting = true;
		const system = [
			`You are "the Minister" — the voice of the ${config.token.name} ($${config.token.symbol}) memecoin ministry.`,
			'Tone: calm, deadpan-funny, meme-literate, radically honest. You react to real events — crypto, politics, geopolitics — and find the angle that makes people think.',
			'Ground every claim in the provided wires; never invent facts or numbers. Small volume and a real community are points of pride. 95% of LP is locked, never unlocking.',
			'Output ONLY the post text as ONE single block — no quotes, no preamble, no explanation, no length notes, no drafts-of-the-draft, no variants or alternatives. Everything you output is published to real followers as-is.',
			`Hard limit: ${maxLen} characters.`
		].join(' ');
		const wires = chosenWires();
		const user = wires.length
			? `Current wires:\n${wires.join('\n')}\n\nWrite a ${PILLARS[pillar].label} post reacting to the sharpest of these. Tie it back to the $${config.token.symbol} ministry ethos.`
			: `No wires selected — write a ${PILLARS[pillar].label} post on the general mood across crypto and world politics.`;
		const r = await aiComplete(creds, system, user, 1500);
		drafting = false;
		if (!r.ok) return flash(r.error, false);
		// fresh draft REPLACES the editor — appending stacked every retry into an
		// 828-char monster (three AI attempts glued together). One draft, one box.
		content = cleanDraft(r.text);
		flash(
			`Drafted with ${r.model}` +
				(wires.length
					? ` · grounded in ${wires.length} wire${wires.length > 1 ? 's' : ''}.`
					: ' · wires panel was empty — hit ↻ refresh for grounded drafts.')
		);
	}

let copied = $state(false);
let copyTimer: ReturnType<typeof setTimeout> | undefined;

async function copyPost() {
	if (!content.trim()) return flash('Nothing to copy — the editor is empty.', false);
	try {
		await navigator.clipboard.writeText(content);
		copied = true;
		clearTimeout(copyTimer);
		copyTimer = setTimeout(() => (copied = false), 1600);
	} catch (e) {
		flash(`Copy failed: ${e instanceof Error ? e.message : String(e)}`, false);
	}
}
</script>

<header class="mb-6 flex items-center justify-between">
	<div>
		<h1 class="font-display text-2xl font-bold tracking-tight">
			COMPOSE {#if editingId !== null}<span class="text-sm text-offwhite/40">
					— editing #{editingId} ({editStatus})</span
				>{/if}
		</h1>
	</div>
	<select
		bind:value={pillar}
		class="rounded-lg border border-navy-700 bg-navy-800 px-3 py-2 text-sm"
	>
		{#each PILLAR_KEYS as k}
			<option value={k}>{PILLARS[k].label}</option>
		{/each}
	</select>
</header>

<div class="mx-auto max-w-3xl">
	<section class="mb-4 rounded-xl border border-navy-700 bg-navy-800/30 p-4">
	<div class="mb-2 flex items-center justify-between">
		<h2 class="text-xs font-semibold tracking-wide text-offwhite/60 uppercase">
			Today's wires — tick what the Minister reacts to
		</h2>
		<button
			class="rounded-lg border border-navy-700 px-3 py-1 text-xs text-offwhite/60 hover:bg-navy-800 disabled:opacity-40"
			disabled={newsLoading}
			onclick={() => refreshNews()}
		>
			{newsLoading ? 'Fetching…' : '↻ refresh'}
		</button>
	</div>
	{#if headlines.length === 0}
		<p class="text-xs text-offwhite/30">
			{newsLoading ? 'Pulling the wires…' : 'No wires loaded — hit refresh.'}
		</p>
	{:else}
		<div class="grid grid-cols-2 gap-x-6 gap-y-1.5">
			{#each headlines as h, i}
				<label class="flex cursor-pointer items-baseline gap-2 text-xs">
					<input type="checkbox" bind:checked={sel[i]} class="accent-cyan-glow" />
					<span
						class="flex-1 {h.topic === 'crypto' ? 'text-cyan-glow/90' : 'text-yellow-glow/90'}"
					>
						{h.title}
					</span>
					<span class="shrink-0 text-offwhite/30">{h.age}</span>
				</label>
			{/each}
		</div>
	{/if}
</section>

<textarea
		bind:value={content}
		rows="7"
		placeholder="The Minister speaks…"
		class="w-full resize-y rounded-xl border border-navy-700 bg-navy-800/40 p-4 text-sm leading-relaxed placeholder:text-offwhite/25 focus:border-cyan-glow/50 focus:outline-none"
	></textarea>

	<div class="mt-2 flex items-center justify-between text-xs">
		<span class="text-offwhite/30">Auto-formats for X / Telegram — no rich markup needed</span>
		<div class="flex items-center gap-2">
			<button
				class="rounded-lg border border-navy-700 p-1.5 text-offwhite/60 hover:border-cyan-glow/40 hover:text-cyan-glow disabled:opacity-30 disabled:hover:border-navy-700"
				disabled={!content.trim()}
				title={content.trim() ? 'Copy post to clipboard' : 'Nothing to copy'}
				aria-label={content.trim() ? 'Copy post to clipboard' : 'Nothing to copy'}
				onclick={copyPost}
			>
				{#if copied}
					<svg
						width="14"
						height="14"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2.5"
						stroke-linecap="round"
						stroke-linejoin="round"
						class="text-cyan-glow"
						aria-hidden="true"
					>
						<polyline points="20 6 9 17 4 12" />
					</svg>
				{:else}
					<svg
						width="14"
						height="14"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
						aria-hidden="true"
					>
						<rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
						<path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"
						/>
					</svg>
				{/if}
			</button>
			<span
				class="nums {over
					? 'text-pink-glow'
					: content.length > maxLen * 0.85
						? 'text-yellow-glow'
						: 'text-offwhite/40'}"
			>
				{content.length} / {maxLen} {over ? '— over limit' : '✓'}
			</span>
		</div>
	</div>

	<div class="mt-3 flex flex-wrap gap-2">
		{#each Object.entries(SNIPPETS) as [name, text]}
			<button
				class="rounded-full border border-navy-700 px-3 py-1 text-xs text-offwhite/60 hover:border-cyan-glow/40 hover:text-cyan-glow"
				onclick={() => (content = content.trim() ? `${content.trim()}\n\n${text}` : text)}
			>
				{name}
			</button>
		{/each}
	</div>

	<div class="mt-6 grid grid-cols-2 gap-4">
		<div>
			<label class="text-xs tracking-wide text-offwhite/50 uppercase">Schedule</label>
			<input
				type="datetime-local"
				bind:value={scheduledAt}
				class="nums mt-1 w-full rounded-lg border border-navy-700 bg-navy-800 px-3 py-2 text-sm"
			/>
		</div>
		<div>
			<label class="text-xs tracking-wide text-offwhite/50 uppercase">Platform</label>
			<div class="mt-2 flex gap-4 text-sm">
				{#each [['x', 'X'], ['telegram', 'Telegram'], ['both', 'Both']] as [v, label]}
					<label class="flex cursor-pointer items-center gap-1.5">
						<input type="radio" bind:group={platform} value={v} class="accent-cyan-glow" />
						{label}
					</label>
				{/each}
			</div>
		</div>
	</div>

	<div class="mt-6 flex items-center gap-3">
		<button
			class="rounded-lg bg-cyan-glow px-5 py-2 text-sm font-bold text-navy hover:brightness-110"
			onclick={postNow}
		>
			Post now
		</button>
		<button
			class="rounded-lg border border-cyan-glow/40 px-4 py-2 text-sm text-cyan-glow hover:bg-cyan-glow/10 disabled:opacity-40"
			disabled={drafting}
			title="Generates a draft in the Minister's voice from the ticked wires"
			onclick={draftAI}
		>
			{drafting ? 'Drafting…' : 'Draft with AI'}
		</button>
		<button
			class="rounded-lg border border-navy-700 px-4 py-2 text-sm text-offwhite/70 hover:bg-navy-800"
			onclick={schedule}
		>
			Schedule
		</button>
		<button
			class="rounded-lg border border-navy-700 px-4 py-2 text-sm text-offwhite/70 hover:bg-navy-800"
			onclick={saveDraft}
		>
			Save draft
		</button>
		{#if editingId !== null}
			<button
				class="ml-auto rounded-lg border border-pink-glow/40 px-4 py-2 text-sm text-pink-glow hover:bg-pink-glow/10"
				onclick={remove}
			>
				Delete
			</button>
		{/if}
	</div>

	{#if msg}
		<div class="mt-4 rounded-lg border px-4 py-3 text-sm {msgOk ? 'border-cyan-glow/30 text-cyan-glow' : 'border-pink-glow/40 text-pink-glow'}">
			{msg}
		</div>
	{/if}
</div>
