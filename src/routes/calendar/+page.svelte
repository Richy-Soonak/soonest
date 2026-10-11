<script lang="ts">
	import { goto } from '$app/navigation';
	import {
		ensureDefaultTemplates,
		postsInRange,
		postExistsAt,
		insertPost,
		listTemplates,
		setTemplateEnabled,
		PILLARS,
		fmtDate,
		startOfWeek,
		addDays,
		dayKey,
		type Post,
		type Template,
		type PillarKey
	} from '$lib/db';

	const SLOTS = ['09:00', '12:00', '18:00', '21:00'];
	const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

	let weekStart = $state(startOfWeek(new Date()));
	let posts = $state<Post[]>([]);
	let templates = $state<Template[]>([]);
	let filling = $state(false);
	let filledMsg = $state('');

	const days = $derived(Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)));
	const rangeFrom = $derived(`${fmtDate(days[0])}T00:00`);
	const rangeTo = $derived(`${fmtDate(days[6])}T23:59`);

	async function load() {
		await ensureDefaultTemplates();
		[posts, templates] = await Promise.all([postsInRange(rangeFrom, rangeTo), listTemplates()]);
	}
	$effect(() => {
		rangeFrom;
		load();
	});

	function cellPosts(date: Date, slot: string): Post[] {
		const prefix = `${fmtDate(date)}T${slot}`;
		return posts.filter((p) => p.scheduled_at.startsWith(prefix));
	}

	function weekLabel(): string {
		const a = days[0];
		const b = days[6];
		const mo = (d: Date) => d.toLocaleDateString('en', { month: 'short' });
		return `${mo(a)} ${a.getDate()} – ${mo(b)} ${b.getDate()}, ${b.getFullYear()}`;
	}

	async function toggleTemplate(t: Template, on: boolean) {
		await setTemplateEnabled(t.id, on);
		templates = await listTemplates();
	}

	async function fillWeek() {
		filling = true;
		filledMsg = '';
		let added = 0;
		for (const t of templates) {
			if (!t.enabled) continue;
			const daysWanted: string[] = JSON.parse(t.default_days ?? '[]');
			for (const d of days) {
				if (!daysWanted.includes(dayKey(d))) continue;
				const at = `${fmtDate(d)}T${t.default_time}`;
				if (!(await postExistsAt(at, t.pillar))) {
					await insertPost({
						pillar: t.pillar as PillarKey,
						scheduled_at: at,
						content: t.default_content ?? '',
						status: 'scheduled',
						platform: 'both'
					});
					added++;
				}
			}
		}
		posts = await postsInRange(rangeFrom, rangeTo);
		filling = false;
		filledMsg = added === 0 ? 'Week already filled.' : `${added} post${added > 1 ? 's' : ''} scheduled.`;
	}

	const offGrid = $derived(
		posts.filter((p) => !SLOTS.some((s) => p.scheduled_at.includes(`T${s}`)))
	);
</script>

<header class="mb-6 flex items-center justify-between">
	<div>
		<h1 class="font-display text-2xl font-bold tracking-tight">CONTENT CALENDAR</h1>
		<p class="mt-1 text-sm text-offwhite/50">Click a slot to compose · click a chip to edit</p>
	</div>
	<div class="flex items-center gap-2">
		<button
			class="rounded-lg border border-navy-700 px-3 py-1.5 text-sm text-offwhite/70 hover:bg-navy-800"
			onclick={() => (weekStart = addDays(weekStart, -7))}
		>
			‹
		</button>
		<span class="nums min-w-44 text-center text-sm font-medium">{weekLabel()}</span>
		<button
			class="rounded-lg border border-navy-700 px-3 py-1.5 text-sm text-offwhite/70 hover:bg-navy-800"
			onclick={() => (weekStart = addDays(weekStart, 7))}
		>
			›
		</button>
		<button
			class="rounded-lg border border-navy-700 px-3 py-1.5 text-sm text-offwhite/70 hover:bg-navy-800"
			onclick={() => (weekStart = startOfWeek(new Date()))}
		>
			Today
		</button>
	</div>
</header>

<div class="grid grid-cols-7 gap-2">
	{#each days as d, i}
		<div
			class="mb-1 text-center text-xs font-semibold tracking-wide {fmtDate(d) ===
			fmtDate(new Date())
				? 'text-cyan-glow'
				: 'text-offwhite/40'} uppercase"
		>
			{DAY_LABELS[i]} {d.getDate()}
		</div>
	{/each}

	{#each days as d}
		{#each SLOTS as slot}
			{@const cell = cellPosts(d, slot)}
			<button
				class="group min-h-20 rounded-lg border border-navy-700 bg-navy-800/30 p-1.5 text-left hover:border-cyan-glow/40"
				onclick={() => goto(`/compose?date=${fmtDate(d)}&time=${slot}`)}
			>
				{#if cell.length === 0}
					<span
						class="text-xs text-offwhite/20 group-hover:text-cyan-glow/60"
					>
						{slot} · +
					</span>
				{:else}
					{#each cell as p}
						{@const meta = PILLARS[p.pillar]}
						<div class="mb-1 rounded border-l-2 {meta.edge} bg-navy-900/60 px-1.5 py-1">
							<div class="text-[10px] text-offwhite/40">
								{p.scheduled_at.slice(11)} · {p.status}
							</div>
							<div class="truncate text-xs {meta.text}">{meta.label}</div>
						</div>
					{/each}
				{/if}
			</button>
		{/each}
	{/each}
</div>

<section class="mt-8 grid grid-cols-2 gap-6">
	<div>
		<h2 class="mb-3 text-sm font-semibold tracking-wide text-offwhite/60 uppercase">
			Recurring templates
		</h2>
		<div class="space-y-2">
			{#each templates as t}
				{@const meta = PILLARS[t.pillar]}
				<label
					class="flex cursor-pointer items-center gap-3 rounded-lg border border-navy-700 bg-navy-800/30 px-4 py-2.5"
				>
					<input
						type="checkbox"
						checked={t.enabled === 1}
						onchange={(e) => toggleTemplate(t, e.currentTarget.checked)}
						class="accent-cyan-glow"
					/>
					<span class="text-sm {meta.text}">{t.name}</span>
					<span class="nums ml-auto text-xs text-offwhite/40">
						{JSON.parse(t.default_days ?? '[]').join(' ')} · {t.default_time}
					</span>
				</label>
			{/each}
		</div>
		<button
			class="mt-3 rounded-lg bg-cyan-glow/10 px-4 py-2 text-sm font-medium text-cyan-glow hover:bg-cyan-glow/20 disabled:opacity-40"
			disabled={filling}
			onclick={fillWeek}
		>
			{filling ? 'Filling…' : 'Fill this week from templates'}
		</button>
		{#if filledMsg}
			<span class="ml-3 text-xs text-offwhite/50">{filledMsg}</span>
		{/if}
	</div>

	<div>
		<h2 class="mb-3 text-sm font-semibold tracking-wide text-offwhite/60 uppercase">
			Off-grid this week
		</h2>
		{#if offGrid.length === 0}
			<p class="text-xs text-offwhite/30">Nothing outside the four daily slots.</p>
		{:else}
			<div class="space-y-2">
				{#each offGrid as p}
					{@const meta = PILLARS[p.pillar]}
					<button
						class="block w-full rounded-lg border border-navy-700 bg-navy-800/30 px-3 py-2 text-left hover:border-cyan-glow/40"
						onclick={() => goto(`/compose?id=${p.id}`)}
					>
						<span class="nums text-xs text-offwhite/40">{p.scheduled_at.replace('T', ' ')}</span>
						<span class="ml-2 text-xs {meta.text}">{meta.label}</span>
					</button>
				{/each}
			</div>
		{/if}
	</div>
</section>
