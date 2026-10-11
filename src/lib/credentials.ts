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
}

const EMPTY: Credentials = {
	tg_token: '',
	tg_chat: '',
	x_consumer_key: '',
	x_consumer_secret: '',
	x_access_token: '',
	x_access_secret: '',
	rpc_url: ''
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

export async function saveCreds(c: Partial<Credentials>): Promise<void> {
	const s = await store();
	for (const [k, v] of Object.entries(c)) await s.set(k, v);
	await s.save();
}

export function hasTelegram(c: Credentials): boolean {
	return c.tg_token.trim() !== '' && c.tg_chat.trim() !== '';
}

export function hasX(c: Credentials): boolean {
	return [c.x_consumer_key, c.x_consumer_secret, c.x_access_token, c.x_access_secret].every(
		(v) => v.trim() !== ''
	);
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
