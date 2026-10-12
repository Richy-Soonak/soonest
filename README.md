# Soonest — The Meme Coin Ministry Desk

Desktop app for the Richy Soonak ($SOONAK) ecosystem. Tauri 2 + SvelteKit 5 + Tailwind v4.
Open source, MIT. Fork it for your memecoin — all token-specific settings live in ONE file:
[`src/lib/config.ts`](src/lib/config.ts).

Tagline: *"The Ministry Desk. On your desktop. Always open."*

> **Scheduling note:** the publish scheduler runs inside the app — **the Ministry Desk must be
> open (Mac awake) for scheduled posts to publish.** Missed publishes retry on a backoff
> (1m → 5m → 15m → 1h → 6h, 5 attempts) and then surface as `failed` in the Calendar with a
> retry button; every attempt is recorded in the `publish_attempts` table. A hosted
> webhook/cron companion is the eventual fix for publish-while-closed.

## Quick start

```bash
npm install
npm run build          # frontend → build/
cd src-tauri && cargo tauri dev
```

## Fork instructions

1. Fork this repo
2. Edit `src/lib/config.ts` (token contract, symbol, DEX pool, handles, brand colors)
3. `cargo tauri dev` — done.

## Roadmap

- **Phase 1** — Ministry Desk dashboard (live Solana metrics), content calendar, post composer (X + Telegram), settings
- **Phase 2** — analytics + honest scorecard, Telegram bot commands, onboarding, mobile `/m` view
- **Phase 3** — notarized release builds, fork template polish

## License

MIT. Do whatever you want. Just don't rug people.
