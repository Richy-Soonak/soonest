/**
 * The scheduler (issue #3).
 *
 * Two loops, both started once per app session from +layout.svelte:
 *   - tick (30s): publish every 'scheduled' post whose time has come.
 *     Failures are RECORDED (publish_attempts table) and retried on a
 *     backoff — never silently marked posted. After MAX_ATTEMPTS the post
 *     flips to 'failed' with its last error visible in the calendar.
 *   - fill (6h + on start): materialize enabled templates for the current
 *     and next week, so recurrence runs itself instead of waiting for a
 *     manual "Fill this week" click.
 *
 * Honest constraint (spec'd in the issue): this runs in the webview, so
 * publishing only happens while the Ministry Desk is open.
 */
import {
	duePosts,
	recordAttempt,
	scheduleRetry,
	markFailed,
	markPosted,
	retryPost,
	listTemplates,
	postExistsAt,
	insertPost,
	fmtDate,
	fmtDateTime,
	startOfWeek,
	addDays,
	dayKey,
	type Post,
	type PillarKey
} from '$lib/db';
import { loadCreds, hasTelegram, sendTelegram } from '$lib/credentials';

// 1m → 5m → 15m → 1h → 6h, then give up as 'failed'
const BACKOFF_MS = [60_000, 5 * 60_000, 15 * 60_000, 3_600_000, 6 * 3_600_000];
const MAX_ATTEMPTS = BACKOFF_MS.length;
const TICK_MS = 30_000;
const FILL_MS = 6 * 3_600_000;

let started = false;

export function startScheduler(): void {
	if (started) return;
	started = true;
	void tick();
	void fillFromTemplates();
	setInterval(() => void tick(), TICK_MS);
	setInterval(() => void fillFromTemplates(), FILL_MS);
}

// ---- publish loop -------------------------------------------------------------

export async function tick(): Promise<void> {
	try {
		const due = await duePosts(fmtDateTime(new Date()));
		for (const p of due) await attemptPublish(p);
	} catch (e) {
		console.error('scheduler tick failed:', e);
	}
}

async function attemptPublish(p: Post): Promise<void> {
	const creds = await loadCreds();
	const wantsTg = p.platform !== 'x';
	const wantsX = p.platform !== 'telegram';

	if (wantsTg) {
		if (!hasTelegram(creds)) {
			const err = 'Telegram not configured — add bot token + chat ID in Settings.';
			await recordAttempt(p.id, 'telegram', false, err, null);
			await failStep(p, err);
			return;
		}
		const r = await sendTelegram(creds, p.content);
		await recordAttempt(p.id, 'telegram', r.ok, r.ok ? null : r.error, r.ok ? r.messageId : null);
		if (!r.ok) {
			await failStep(p, r.error);
			return;
		}
	}

	// the X leg is Phase 2 (#7) — log the deferral so 'posted' never overclaims
	if (wantsX) {
		await recordAttempt(p.id, 'x', false, 'X posting arrives in Phase 2 (#7) — Telegram leg published.', null);
	}

	await markPosted(p.id);
}

/** Record the failure, schedule the backoff retry, surface a notification. */
async function failStep(p: Post, error: string): Promise<void> {
	const n = (p.attempt_count ?? 0) + 1;
	if (n >= MAX_ATTEMPTS) {
		await markFailed(p.id, error);
		void notify(p, error, true);
		return;
	}
	const nextAt = fmtDateTime(new Date(Date.now() + BACKOFF_MS[n - 1]));
	await scheduleRetry(p.id, n, nextAt, error);
	void notify(p, error, false);
}

async function notify(p: Post, error: string, final: boolean): Promise<void> {
	try {
		const { isPermissionGranted, requestPermission, sendNotification } = await import(
			'@tauri-apps/plugin-notification'
		);
		let granted = await isPermissionGranted();
		if (!granted) granted = (await requestPermission()) === 'granted';
		if (!granted) return;
		sendNotification({
			title: final
				? 'Publish failed — retries exhausted'
				: `Publish retry scheduled (attempt ${(p.attempt_count ?? 0) + 1}/${MAX_ATTEMPTS})`,
			body: `${p.scheduled_at.replace('T', ' ')} · ${error}`
		});
	} catch {
		// notifications unavailable — the attempt log still records everything
	}
}

// ---- template recurrence --------------------------------------------------------

/** Ensure enabled templates exist for the current + next week (no duplicates). */
export async function fillFromTemplates(): Promise<void> {
	try {
		const templates = await listTemplates();
		const weeks = [startOfWeek(new Date()), addDays(startOfWeek(new Date()), 7)];
		for (const weekStart of weeks) {
			const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
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
					}
				}
			}
		}
	} catch (e) {
		console.error('template fill failed:', e);
	}
}

// re-export so the calendar page (retry button) and anyone else can use it
export { retryPost };
