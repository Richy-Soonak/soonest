/**
 * Credentials — secrets live in the OS Keychain, non-secret config in a
 * JSON file, both managed by the Rust `creds_load`/`creds_save` commands
 * (src-tauri/src/secrets.rs). Nothing secret is ever written to disk in
 * plaintext. The load/save signatures are unchanged from the store-plugin
 * era, so routes don't need rework (issue #1).
 */
import { invoke } from '@tauri-apps/api/core';

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
	const out = { ...EMPTY };
	const map = await invoke<Record<string, string>>('creds_load');
	for (const k of Object.keys(EMPTY) as (keyof Credentials)[]) {
		const v = map[k];
		if (typeof v === 'string') out[k] = v;
	}
	return out;
}

export async function saveCreds(c: Partial<Credentials>): Promise<{ ok: true } | { ok: false; error: string }> {
	try {
		const values: Record<string, string> = {};
		for (const [k, v] of Object.entries(c)) values[k] = v;
		await invoke('creds_save', { values });
		// round-trip proof — don't claim victory until the Rust side reads back
		const map = await invoke<Record<string, string>>('creds_load');
		for (const [k, v] of Object.entries(c)) {
			if ((map[k] ?? '') !== v) {
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

/** Strip model meta-commentary (length notes, variants, separators) from a returned draft. */
export function cleanDraft(text: string): string {
	const metaPatterns = [
		/^\d{2,4}\s*\/\s*\d{2,4}\b.*$/, // "280 / 280 ✓" style counters
		/^\d{3,}\s*chars?\b.*$/i, // "280 chars exactly? Let me count..."
		/let me count/i,
		/^variant\b.*$/i,
		/^option\s*\d.*$/i,
		/^draft\s*\d.*$/i,
		/^---+$/
	];
	return text
		.split('\n')
		.filter((ln) => !metaPatterns.some((re) => re.test(ln.trim())))
		.join('\n')
		.replace(/\n{3,}/g, '\n\n')
		.trim();
}

/** Single completion via OpenRouter chat completions. */
export async function aiComplete(
	c: Credentials,
	system: string,
	user: string,
	maxTokens = 1500
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
				// bound thinking where the model supports it (ignored where it doesn't)
				reasoning: { max_tokens: Math.min(400, Math.floor(maxTokens / 4)) },
				messages: [
					{ role: 'system', content: system },
					{ role: 'user', content: user }
				]
			})
		});
		const j = await r.json();
		if (j.error) return { ok: false, error: j.error.message ?? JSON.stringify(j.error) };
		const choice = j.choices?.[0];
		const msg = choice?.message ?? {};
		const text: string = (msg.content ?? '').trim();
		if (text) return { ok: true, text, model: j.model ?? model };
		// empty content — explain WHY (reasoning models eating the budget is the usual cause)
		const reasoning = msg.reasoning ?? msg.reasoning_content ?? '';
		const finish = choice?.finish_reason ?? 'unknown';
		if (finish === 'length' || reasoning) {
			return {
				ok: false,
				error: `${j.model ?? model} spent its token budget thinking (finish: ${finish}) and never wrote the post. Pick a non-reasoning model in Settings (or leave the field blank for gpt-4o-mini).`
			};
		}
		return {
			ok: false,
			error: `Model returned nothing (finish: ${finish}, HTTP ${r.status}). Try another model in Settings.`
		};
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
