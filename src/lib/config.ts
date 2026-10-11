/**
 * Soonest — fork configuration (spec §12).
 * The ONLY file other memecoins need to touch to make this app theirs.
 */

export const config = {
	token: {
		name: 'Richy Soonak',
		symbol: 'SOONAK',
		contract: 'H218TQViAXsSqwCLnf7L41zewUTRmdN1r4neLtjBXYXS',
		decimals: 9,
		chain: 'solana' as const
	},
	dex: {
		pool: 'EsBiDt8LKDb24ZQpfb7MWj1RCBD7ewKCjt9xEXMyMCyD',
		type: 'raydium' as const
	},
	social: {
		x: '@RichySoonak',
		telegram: '@richysoonak',
		telegramChatId: '' // set in Settings after bot token is entered
	},
	rugcheck: 'https://rugcheck.xyz/tokens/H218TQViAXsSqwCLnf7L41zewUTRmdN1r4neLtjBXYXS',
	buyLinks: {
		raydium: `https://raydium.io/swap/?outputMint=H218TQViAXsSqwCLnf7L41zewUTRmdN1r4neLtjBXYXS`,
		jupiter: `https://jup.ag/swap/SOL-H218TQViAXsSqwCLnf7L41zewUTRmdN1r4neLtjBXYXS`
	},
	brand: {
		colors: {
			navy: '#0a0e27',
			cyan: '#00e5ff',
			yellow: '#e7f900',
			pink: '#ff2d95',
			purple: '#8b5cf6'
		}
	}
};

export type SoonakConfig = typeof config;
