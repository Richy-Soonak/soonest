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
	import { loadCreds, hasTelegram, hasX, sendTelegram, type Credentials } from '$lib/credentials';

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
	<textarea
		bind:value={content}
		rows="7"
		placeholder="The Minister speaks…"
		class="w-full resize-y rounded-xl border border-navy-700 bg-navy-800/40 p-4 text-sm leading-relaxed placeholder:text-offwhite/25 focus:border-cyan-glow/50 focus:outline-none"
	></textarea>

	<div class="mt-2 flex items-center justify-between text-xs">
		<span class="text-offwhite/30">Auto-formats for X / Telegram — no rich markup needed</span>
		<span class="nums {over ? 'text-pink-glow' : content.length > maxLen * 0.85 ? 'text-yellow-glow' : 'text-offwhite/40'}">
			{content.length} / {maxLen} {over ? '— over limit' : '✓'}
		</span>
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
