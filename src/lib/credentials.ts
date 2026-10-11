/**
 * Credentials — stored in a local Tauri store file (app data dir, per-user
 * permissions, never synced, never in the repo). Secrets stay on this Mac.
 */
import { Store } from '@tauri-apps/plugin-store';

let storep: Promise<Store> | null = null;
function store(): Promise<Store> {
	return (storep ??= Store.load('credentials.json'));
}

export interface Credentials {
	tg_token: string;
	tg_chat: string;
	x_consumer_key: string;
	x_consumer_secret: string;
	x_access_token: string;
	x_access_secret: string;
	rpc_url: string;
	or_key: string;
	or_model: string;
}

const EMPTY: Credentials = {
	tg_token: '',
	tg_chat: '',
	x_consumer_key: '',
	x_consumer_secret: '',
	x_access_token: '',
	x_access_secret: '',
	rpc_url: '',
	or_key: '',
	or_model: ''
};

export async function loadCreds(): Promise<Credentials> {
	const s = await store();
	const out = { ...EMPTY };
	for (const k of Object.keys(EMPTY) as (keyof Credentials)[]) {
		const v = await s.get<string>(k);
		if (typeof v === 'string') out[k] = v;
	}
	return out;
}

export async function saveCreds(c: Partial<Credentials>): Promise<{ ok: true } | { ok: false; error: string }> {
	try {
		const s = await store();
		for (const [k, v] of Object.entries(c)) await s.set(k, v);
		await s.save();
		// round-trip proof — don't claim victory until the store reads back
		for (const [k, v] of Object.entries(c)) {
			const back = await s.get(k);
			if (back !== v) {
				return { ok: false, error: `store did not persist "${k}" — write failed silently` };
			}
		}
		return { ok: true };
	} catch (e) {
		return { ok: false, error: e instanceof Error ? e.message : String(e) };
	}
}

export function hasTelegram(c: Credentials): boolean {
	return c.tg_token.trim() !== '' && c.tg_chat.trim() !== '';
}

export function hasX(c: Credentials): boolean {
	return [c.x_consumer_key, c.x_consumer_secret, c.x_access_token, c.x_access_secret].every(
		(v) => v.trim() !== ''
	);
}

// ---- AI (OpenRouter) ----------------------------------------------------------

export const DEFAULT_AI_MODEL = 'openai/gpt-4o-mini';

export function hasAI(c: Credentials): boolean {
	return c.or_key.trim() !== '';
}

/** Single completion via OpenRouter chat completions. */
export async function aiComplete(
	c: Credentials,
	system: string,
	user: string,
	maxTokens = 400
): Promise<{ ok: true; text: string; model: string } | { ok: false; error: string }> {
	if (!hasAI(c)) return { ok: false, error: 'No OpenRouter API key set (Settings → AI)' };
	const model = c.or_model.trim() || DEFAULT_AI_MODEL;
	try {
		const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				authorization: `Bearer ${c.or_key.trim()}`
			},
			body: JSON.stringify({
				model,
				max_tokens: maxTokens,
				messages: [
					{ role: 'system', content: system },
					{ role: 'user', content: user }
				]
			})
		});
		const j = await r.json();
		if (j.error) return { ok: false, error: j.error.message ?? JSON.stringify(j.error) };
		const text: string | undefined = j.choices?.[0]?.message?.content?.trim();
		return text ? { ok: true, text, model } : { ok: false, error: 'Model returned nothing' };
	} catch (e) {
		return { ok: false, error: e instanceof Error ? e.message : String(e) };
	}
}

/** Post via the Telegram Bot API. Returns message id on success. */
export async function sendTelegram(
	c: Credentials,
	text: string
): Promise<{ ok: true; messageId: number } | { ok: false; error: string }> {
	try {
		const r = await fetch(`https://api.telegram.org/bot${c.tg_token.trim()}/sendMessage`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ chat_id: c.tg_chat.trim(), text })
		});
		const j = await r.json();
		if (!j.ok) return { ok: false, error: j.description ?? `HTTP ${r.status}` };
		return { ok: true, messageId: j.result.message_id };
	} catch (e) {
		return { ok: false, error: e instanceof Error ? e.message : String(e) };
	}
}

/** Verify the bot token + chat. Used by the Settings test button. */
export async function testTelegram(
	c: Credentials
): Promise<{ ok: true; bot: string } | { ok: false; error: string }> {
	try {
		const me = await fetch(`https://api.telegram.org/bot${c.tg_token.trim()}/getMe`).then((r) =>
			r.json()
		);
		if (!me.ok) return { ok: false, error: me.description ?? 'getMe failed' };
		const ping = await fetch(`https://api.telegram.org/bot${c.tg_token.trim()}/sendMessage`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				chat_id: c.tg_chat.trim(),
				text: 'Soonest desk online — the Minister is active. $SOONAK'
			})
		}).then((r) => r.json());
		if (!ping.ok) return { ok: false, error: `bot ok, but chat ping failed: ${ping.description}` };
		return { ok: true, bot: `@${me.result.username}` };
	} catch (e) {
		return { ok: false, error: e instanceof Error ? e.message : String(e) };
	}
}
