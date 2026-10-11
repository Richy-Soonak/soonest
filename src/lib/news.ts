/**
 * Today's wires — free Google News RSS, no keys. Crypto + world/politics.
 * Cached in-memory for 10 minutes; titles deduped, newest first.
 */

export interface Headline {
	title: string;
	topic: 'crypto' | 'world';
	age: string;
}

const FEEDS: { topic: 'crypto' | 'world'; q: string }[] = [
	{ topic: 'crypto', q: 'cryptocurrency+OR+bitcoin+OR+solana+crypto' },
	{ topic: 'world', q: 'geopolitics+OR+politics+OR+war' }
];

const TTL_MS = 10 * 60 * 1000;
let cache: { at: number; items: Headline[] } | null = null;

function ageOf(pubDate: string): string {
	const t = new Date(pubDate).getTime();
	if (Number.isNaN(t)) return '';
	const mins = Math.max(0, Math.round((Date.now() - t) / 60000));
	if (mins < 60) return `${mins}m`;
	if (mins < 1440) return `${Math.round(mins / 60)}h`;
	return `${Math.round(mins / 1440)}d`;
}

function parseFeed(xml: string, topic: 'crypto' | 'world'): Headline[] {
	const doc = new DOMParser().parseFromString(xml, 'text/xml');
	const out: Headline[] = [];
	for (const it of doc.querySelectorAll('item')) {
		const raw = it.querySelector('title')?.textContent?.trim() ?? '';
		if (!raw) continue;
		// Google News appends " - Source" — strip it
		const title = raw.replace(/\s+-\s+[^-]+$/, '').trim();
		out.push({ title, topic, age: ageOf(it.querySelector('pubDate')?.textContent ?? '') });
	}
	return out;
}

export async function fetchWires(force = false): Promise<Headline[]> {
	if (!force && cache && Date.now() - cache.at < TTL_MS) return cache.items;

	const results = await Promise.allSettled(
		FEEDS.map(async (f) => {
			const r = await fetch(
				`https://news.google.com/rss/search?q=${f.q}&hl=en-US&gl=US&ceid=US:en`
			);
			return parseFeed(await r.text(), f.topic);
		})
	);

	const seen = new Set<string>();
	const items: Headline[] = [];
	for (const res of results) {
		if (res.status !== 'fulfilled') continue;
		for (const h of res.value) {
			const key = h.title.toLowerCase();
			if (seen.has(key)) continue;
			seen.add(key);
			items.push(h);
		}
	}
	items.sort((a, b) => a.age.length - b.age.length || a.age.localeCompare(b.age));
	const trimmed = items.slice(0, 16);
	cache = { at: Date.now(), items: trimmed };
	return trimmed;
}
