/**
 * SQLite data layer via tauri-plugin-sql + shared pillar metadata.
 */
import Database from '@tauri-apps/plugin-sql';

let dbp: Promise<Database> | null = null;
export function db(): Promise<Database> {
	return (dbp ??= Database.load('sqlite:soonest.db'));
}

// ---- pillars ----------------------------------------------------------------

export type PillarKey = 'desk' | 'decree' | 'report' | 'memewars';

export const PILLARS: Record<
	PillarKey,
	{ label: string; text: string; dot: string; edge: string }
> = {
	desk: {
		label: "Minister's Desk",
		text: 'text-cyan-glow',
		dot: 'bg-cyan-glow',
		edge: 'border-l-cyan-glow'
	},
	decree: {
		label: 'Ministerial Decree',
		text: 'text-yellow-glow',
		dot: 'bg-yellow-glow',
		edge: 'border-l-yellow-glow'
	},
	report: {
		label: 'Ministry Report',
		text: 'text-purple-glow',
		dot: 'bg-purple-glow',
		edge: 'border-l-purple-glow'
	},
	memewars: {
		label: 'Meme Wars',
		text: 'text-pink-glow',
		dot: 'bg-pink-glow',
		edge: 'border-l-pink-glow'
	}
};

export const PILLAR_KEYS = Object.keys(PILLARS) as PillarKey[];

// ---- types ------------------------------------------------------------------

export interface Post {
	id: number;
	pillar: PillarKey;
	scheduled_at: string; // 'YYYY-MM-DDTHH:mm'
	content: string;
	status: 'draft' | 'scheduled' | 'posted';
	posted_at: string | null;
	platform: 'x' | 'telegram' | 'both';
	media_url: string | null;
	created_at: string;
}

export interface Template {
	id: number;
	name: string;
	pillar: PillarKey;
	default_time: string; // 'HH:mm'
	default_days: string; // JSON array '["mon","wed"]'
	default_content: string | null;
	enabled: number;
}

// ---- date helpers (local time, ISO-ish 'YYYY-MM-DDTHH:mm') -------------------

export function fmtDate(d: Date): string {
	const p = (n: number) => String(n).padStart(2, '0');
	return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function fmtDateTime(d: Date): string {
	const p = (n: number) => String(n).padStart(2, '0');
	return `${fmtDate(d)}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function addDays(d: Date, n: number): Date {
	const c = new Date(d);
	c.setDate(c.getDate() + n);
	return c;
}

/** Monday-anchored week start. */
export function startOfWeek(d: Date): Date {
	const c = new Date(d.getFullYear(), d.getMonth(), d.getDate());
	const dow = (c.getDay() + 6) % 7; // mon=0
	return addDays(c, -dow);
}

const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
export function dayKey(d: Date): string {
	return DAY_KEYS[(d.getDay() + 6) % 7];
}

// ---- posts ------------------------------------------------------------------

export async function postsInRange(from: string, to: string): Promise<Post[]> {
	const d = await db();
	return d.select<Post[]>(
		'SELECT * FROM posts WHERE scheduled_at >= ? AND scheduled_at <= ? ORDER BY scheduled_at',
		[from, to]
	);
}

export async function getPost(id: number): Promise<Post | null> {
	const d = await db();
	const rows = await d.select<Post[]>('SELECT * FROM posts WHERE id = ?', [id]);
	return rows[0] ?? null;
}

export async function insertPost(p: Partial<Post>): Promise<number> {
	const d = await db();
	const res = await d.execute(
		`INSERT INTO posts (pillar, scheduled_at, content, status, platform)
		 VALUES (?, ?, ?, ?, ?)`,
		[
			p.pillar ?? 'desk',
			p.scheduled_at ?? fmtDateTime(new Date()),
			p.content ?? '',
			p.status ?? 'draft',
			p.platform ?? 'both'
		]
	);
	return res.lastInsertId as number;
}

export async function updatePost(id: number, p: Partial<Post>): Promise<void> {
	const d = await db();
	await d.execute(
		`UPDATE posts SET pillar = ?, scheduled_at = ?, content = ?, status = ?, platform = ?
		 WHERE id = ?`,
		[p.pillar, p.scheduled_at, p.content, p.status, p.platform, id]
	);
}

export async function markPosted(id: number): Promise<void> {
	const d = await db();
	await d.execute("UPDATE posts SET status = 'posted', posted_at = ? WHERE id = ?", [
		new Date().toISOString(),
		id
	]);
}

export async function deletePost(id: number): Promise<void> {
	const d = await db();
	await d.execute('DELETE FROM posts WHERE id = ?', [id]);
}

export async function postExistsAt(scheduled_at: string, pillar: string): Promise<boolean> {
	const d = await db();
	const rows = await d.select<{ id: number }[]>(
		'SELECT id FROM posts WHERE scheduled_at = ? AND pillar = ? LIMIT 1',
		[scheduled_at, pillar]
	);
	return rows.length > 0;
}

// ---- templates ----------------------------------------------------------------

const DEFAULT_TEMPLATES = [
	{
		name: "Minister's Desk (daily)",
		pillar: 'desk',
		default_time: '09:00',
		default_days: '["mon","tue","wed","thu","fri","sat","sun"]',
		default_content:
			'Reminder: your portfolio is a reflection of your attention. Where is it looking? $SOONAK'
	},
	{
		name: 'Ministerial Decree (3x/week)',
		pillar: 'decree',
		default_time: '12:00',
		default_days: '["mon","wed","fri"]',
		default_content:
			'DECREE: 95% of liquidity locked. Never unlocking. No rugs at this ministry — only policy that actually pays. $SOONAK'
	},
	{
		name: 'Ministry Report (weekly)',
		pillar: 'report',
		default_time: '18:00',
		default_days: '["mon"]',
		default_content:
			'Ministry Report — the honest numbers. Volume: what it is. Holders: real people. We are small, honest, and trying. $SOONAK'
	},
	{
		name: 'Meme Wars Round (weekly)',
		pillar: 'memewars',
		default_time: '12:00',
		default_days: '["sat"]',
		default_content:
			'Meme Wars round open. Drop your best Richy Soonak meme. Winner gets clout + tokens. #MemeWars $SOONAK'
	}
];

export async function ensureDefaultTemplates(): Promise<void> {
	const d = await db();
	const rows = await d.select<{ c: number }[]>('SELECT COUNT(*) AS c FROM templates');
	if ((rows[0]?.c ?? 0) > 0) return;
	for (const t of DEFAULT_TEMPLATES) {
		await d.execute(
			'INSERT INTO templates (name, pillar, default_time, default_days, default_content, enabled) VALUES (?, ?, ?, ?, ?, 1)',
			[t.name, t.pillar, t.default_time, t.default_days, t.default_content]
		);
	}
}

export async function listTemplates(): Promise<Template[]> {
	const d = await db();
	return d.select<Template[]>('SELECT * FROM templates ORDER BY id');
}

export async function setTemplateEnabled(id: number, enabled: boolean): Promise<void> {
	const d = await db();
	await d.execute('UPDATE templates SET enabled = ? WHERE id = ?', [enabled ? 1 : 0, id]);
}
