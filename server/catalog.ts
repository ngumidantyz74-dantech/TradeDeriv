export interface SeedInstrument {
  symbol: string;
  display_name: string;
  category: 'Synthetic' | 'Forex' | 'Crypto' | 'Metals/Cmd' | 'Indices';
  market: string;
  submarket: string;
  pip_size: number;
  base_price: number;
  spread: number;
}

export const CURATED_DERIV_INSTRUMENTS: SeedInstrument[] = [
  // Synthetic Indices — ordered most traded to least traded
  { symbol: '1HZ100V', display_name: 'Volatility 100 (1s) Index', category: 'Synthetic', market: 'synthetic_index', submarket: 'random_index', pip_size: 0.01, base_price: 1458.22, spread: 0.16 },
  { symbol: '1HZ75V', display_name: 'Volatility 75 (1s) Index', category: 'Synthetic', market: 'synthetic_index', submarket: 'random_index', pip_size: 0.01, base_price: 4189.08, spread: 0.22 },
  { symbol: '1HZ10V', display_name: 'Volatility 10 (1s) Index', category: 'Synthetic', market: 'synthetic_index', submarket: 'random_index', pip_size: 0.01, base_price: 9461.78, spread: 0.18 },
  { symbol: '1HZ25V', display_name: 'Volatility 25 (1s) Index', category: 'Synthetic', market: 'synthetic_index', submarket: 'random_index', pip_size: 0.01, base_price: 890320.70, spread: 4.50 },
  { symbol: '1HZ50V', display_name: 'Volatility 50 (1s) Index', category: 'Synthetic', market: 'synthetic_index', submarket: 'random_index', pip_size: 0.01, base_price: 263418.42, spread: 3.10 },
  { symbol: 'R_100', display_name: 'Volatility 100 Index', category: 'Synthetic', market: 'synthetic_index', submarket: 'random_index', pip_size: 0.01, base_price: 1842.65, spread: 0.24 },
  { symbol: 'R_75', display_name: 'Volatility 75 Index', category: 'Synthetic', market: 'synthetic_index', submarket: 'random_index', pip_size: 0.0001, base_price: 112450.3210, spread: 12.40 },
  { symbol: 'R_50', display_name: 'Volatility 50 Index', category: 'Synthetic', market: 'synthetic_index', submarket: 'random_index', pip_size: 0.0001, base_price: 174.3824, spread: 0.018 },
  { symbol: 'R_25', display_name: 'Volatility 25 Index', category: 'Synthetic', market: 'synthetic_index', submarket: 'random_index', pip_size: 0.001, base_price: 2148.692, spread: 0.12 },
  { symbol: 'R_10', display_name: 'Volatility 10 Index', category: 'Synthetic', market: 'synthetic_index', submarket: 'random_index', pip_size: 0.001, base_price: 6342.185, spread: 0.14 },
  { symbol: 'BOOM1000', display_name: 'Boom 1000 Index', category: 'Synthetic', market: 'synthetic_index', submarket: 'crash_index', pip_size: 0.0001, base_price: 13290.4120, spread: 0.55 },
  { symbol: 'CRASH1000', display_name: 'Crash 1000 Index', category: 'Synthetic', market: 'synthetic_index', submarket: 'crash_index', pip_size: 0.0001, base_price: 7842.6600, spread: 0.45 },
  { symbol: 'BOOM500', display_name: 'Boom 500 Index', category: 'Synthetic', market: 'synthetic_index', submarket: 'crash_index', pip_size: 0.0001, base_price: 4912.3450, spread: 0.35 },
  { symbol: 'CRASH500', display_name: 'Crash 500 Index', category: 'Synthetic', market: 'synthetic_index', submarket: 'crash_index', pip_size: 0.0001, base_price: 5380.1120, spread: 0.35 },
  { symbol: 'BOOM300N', display_name: 'Boom 300 Index', category: 'Synthetic', market: 'synthetic_index', submarket: 'crash_index', pip_size: 0.001, base_price: 2845.190, spread: 0.25 },
  { symbol: 'CRASH300N', display_name: 'Crash 300 Index', category: 'Synthetic', market: 'synthetic_index', submarket: 'crash_index', pip_size: 0.001, base_price: 2419.830, spread: 0.25 },
  { symbol: 'stpRNG', display_name: 'Step Index', category: 'Synthetic', market: 'synthetic_index', submarket: 'step_index', pip_size: 0.1, base_price: 8420.5, spread: 0.2 },
  { symbol: '1HZ15V', display_name: 'Volatility 15 (1s) Index', category: 'Synthetic', market: 'synthetic_index', submarket: 'random_index', pip_size: 0.01, base_price: 14469.59, spread: 0.25 },
  { symbol: '1HZ150V', display_name: 'Volatility 150 (1s) Index', category: 'Synthetic', market: 'synthetic_index', submarket: 'random_index', pip_size: 0.01, base_price: 3824.15, spread: 0.30 },
  { symbol: '1HZ250V', display_name: 'Volatility 250 (1s) Index', category: 'Synthetic', market: 'synthetic_index', submarket: 'random_index', pip_size: 0.01, base_price: 7190.44, spread: 0.45 },
  { symbol: 'JD100', display_name: 'Jump 100 Index', category: 'Synthetic', market: 'synthetic_index', submarket: 'jump_index', pip_size: 0.01, base_price: 89320.18, spread: 2.20 },
  { symbol: 'JD75', display_name: 'Jump 75 Index', category: 'Synthetic', market: 'synthetic_index', submarket: 'jump_index', pip_size: 0.01, base_price: 142310.75, spread: 2.40 },
  { symbol: 'JD50', display_name: 'Jump 50 Index', category: 'Synthetic', market: 'synthetic_index', submarket: 'jump_index', pip_size: 0.01, base_price: 76490.40, spread: 1.90 },
  { symbol: 'JD25', display_name: 'Jump 25 Index', category: 'Synthetic', market: 'synthetic_index', submarket: 'jump_index', pip_size: 0.01, base_price: 118420.12, spread: 2.10 },
  { symbol: 'JD10', display_name: 'Jump 10 Index', category: 'Synthetic', market: 'synthetic_index', submarket: 'jump_index', pip_size: 0.01, base_price: 94120.55, spread: 1.80 },
  { symbol: 'RDBULL', display_name: 'Bull Market Index', category: 'Synthetic', market: 'synthetic_index', submarket: 'random_daily', pip_size: 0.0001, base_price: 1524.8120, spread: 0.22 },
  { symbol: 'RDBEAR', display_name: 'Bear Market Index', category: 'Synthetic', market: 'synthetic_index', submarket: 'random_daily', pip_size: 0.0001, base_price: 912.4410, spread: 0.18 },
  { symbol: 'RB100', display_name: 'Range Break 100 Index', category: 'Synthetic', market: 'synthetic_index', submarket: 'range_break', pip_size: 0.01, base_price: 3420.18, spread: 0.35 },
  { symbol: 'RB200', display_name: 'Range Break 200 Index', category: 'Synthetic', market: 'synthetic_index', submarket: 'range_break', pip_size: 0.01, base_price: 5180.44, spread: 0.45 },

  // Forex Majors & Crosses — ordered most traded to least traded
  { symbol: 'frxEURUSD', display_name: 'EUR/USD', category: 'Forex', market: 'forex', submarket: 'major_pairs', pip_size: 0.00001, base_price: 1.08425, spread: 0.00008 },
  { symbol: 'frxGBPUSD', display_name: 'GBP/USD', category: 'Forex', market: 'forex', submarket: 'major_pairs', pip_size: 0.00001, base_price: 1.26940, spread: 0.00011 },
  { symbol: 'frxUSDJPY', display_name: 'USD/JPY', category: 'Forex', market: 'forex', submarket: 'major_pairs', pip_size: 0.001, base_price: 151.425, spread: 0.014 },
  { symbol: 'frxAUDUSD', display_name: 'AUD/USD', category: 'Forex', market: 'forex', submarket: 'major_pairs', pip_size: 0.00001, base_price: 0.65840, spread: 0.00009 },
  { symbol: 'frxUSDCAD', display_name: 'USD/CAD', category: 'Forex', market: 'forex', submarket: 'major_pairs', pip_size: 0.00001, base_price: 1.38420, spread: 0.00012 },
  { symbol: 'frxUSDCHF', display_name: 'USD/CHF', category: 'Forex', market: 'forex', submarket: 'major_pairs', pip_size: 0.00001, base_price: 0.88140, spread: 0.00010 },
  { symbol: 'frxNZDUSD', display_name: 'NZD/USD', category: 'Forex', market: 'forex', submarket: 'major_pairs', pip_size: 0.00001, base_price: 0.59820, spread: 0.00012 },
  { symbol: 'frxEURJPY', display_name: 'EUR/JPY', category: 'Forex', market: 'forex', submarket: 'minor_pairs', pip_size: 0.001, base_price: 164.180, spread: 0.018 },
  { symbol: 'frxGBPJPY', display_name: 'GBP/JPY', category: 'Forex', market: 'forex', submarket: 'minor_pairs', pip_size: 0.001, base_price: 192.240, spread: 0.022 },
  { symbol: 'frxEURGBP', display_name: 'EUR/GBP', category: 'Forex', market: 'forex', submarket: 'minor_pairs', pip_size: 0.00001, base_price: 0.85410, spread: 0.00011 },
  { symbol: 'frxAUDJPY', display_name: 'AUD/JPY', category: 'Forex', market: 'forex', submarket: 'minor_pairs', pip_size: 0.001, base_price: 99.695, spread: 0.016 },
  { symbol: 'frxEURAUD', display_name: 'EUR/AUD', category: 'Forex', market: 'forex', submarket: 'minor_pairs', pip_size: 0.00001, base_price: 1.64680, spread: 0.00018 },
  { symbol: 'frxEURCAD', display_name: 'EUR/CAD', category: 'Forex', market: 'forex', submarket: 'minor_pairs', pip_size: 0.00001, base_price: 1.50080, spread: 0.00016 },
  { symbol: 'frxGBPAUD', display_name: 'GBP/AUD', category: 'Forex', market: 'forex', submarket: 'minor_pairs', pip_size: 0.00001, base_price: 1.92800, spread: 0.00022 },
  { symbol: 'frxGBPCAD', display_name: 'GBP/CAD', category: 'Forex', market: 'forex', submarket: 'minor_pairs', pip_size: 0.00001, base_price: 1.75710, spread: 0.00020 },
  { symbol: 'frxAUDCAD', display_name: 'AUD/CAD', category: 'Forex', market: 'forex', submarket: 'minor_pairs', pip_size: 0.00001, base_price: 0.91130, spread: 0.00015 },
  { symbol: 'frxCADJPY', display_name: 'CAD/JPY', category: 'Forex', market: 'forex', submarket: 'minor_pairs', pip_size: 0.001, base_price: 109.390, spread: 0.017 },
  { symbol: 'frxCHFJPY', display_name: 'CHF/JPY', category: 'Forex', market: 'forex', submarket: 'minor_pairs', pip_size: 0.001, base_price: 171.800, spread: 0.019 },
  { symbol: 'frxNZDJPY', display_name: 'NZD/JPY', category: 'Forex', market: 'forex', submarket: 'minor_pairs', pip_size: 0.001, base_price: 90.580, spread: 0.018 },

  // Cryptocurrencies — ordered most traded to least traded
  { symbol: 'cryBTCUSD', display_name: 'BTC/USD', category: 'Crypto', market: 'cryptocurrency', submarket: 'non_stable_coin', pip_size: 0.01, base_price: 91450.00, spread: 18.50 },
  { symbol: 'cryETHUSD', display_name: 'ETH/USD', category: 'Crypto', market: 'cryptocurrency', submarket: 'non_stable_coin', pip_size: 0.01, base_price: 3180.45, spread: 1.40 },
  { symbol: 'crySOLUSD', display_name: 'SOL/USD', category: 'Crypto', market: 'cryptocurrency', submarket: 'non_stable_coin', pip_size: 0.01, base_price: 184.20, spread: 0.15 },
  { symbol: 'cryXRPUSD', display_name: 'XRP/USD', category: 'Crypto', market: 'cryptocurrency', submarket: 'non_stable_coin', pip_size: 0.0001, base_price: 0.9876, spread: 0.0008 },
  { symbol: 'cryBNBUSD', display_name: 'BNB/USD', category: 'Crypto', market: 'cryptocurrency', submarket: 'non_stable_coin', pip_size: 0.01, base_price: 618.90, spread: 0.45 },
  { symbol: 'cryDOGEUSD', display_name: 'DOGE/USD', category: 'Crypto', market: 'cryptocurrency', submarket: 'non_stable_coin', pip_size: 0.00001, base_price: 0.05938, spread: 0.00012 },
  { symbol: 'cryADAUSD', display_name: 'ADA/USD', category: 'Crypto', market: 'cryptocurrency', submarket: 'non_stable_coin', pip_size: 0.0001, base_price: 0.1540, spread: 0.0003 },
  { symbol: 'cryLTCUSD', display_name: 'LTC/USD', category: 'Crypto', market: 'cryptocurrency', submarket: 'non_stable_coin', pip_size: 0.01, base_price: 78.15, spread: 0.12 },
  { symbol: 'cryAVAXUSD', display_name: 'AVAX/USD', category: 'Crypto', market: 'cryptocurrency', submarket: 'non_stable_coin', pip_size: 0.01, base_price: 34.80, spread: 0.06 },
  { symbol: 'cryLINKUSD', display_name: 'LINK/USD', category: 'Crypto', market: 'cryptocurrency', submarket: 'non_stable_coin', pip_size: 0.001, base_price: 14.850, spread: 0.025 },
  { symbol: 'cryDOTUSD', display_name: 'DOT/USD', category: 'Crypto', market: 'cryptocurrency', submarket: 'non_stable_coin', pip_size: 0.001, base_price: 5.420, spread: 0.012 },
  { symbol: 'cryTRXUSD', display_name: 'TRX/USD', category: 'Crypto', market: 'cryptocurrency', submarket: 'non_stable_coin', pip_size: 0.0001, base_price: 0.3095, spread: 0.0005 },

  // Metals & Commodities — Gold/Oil first
  { symbol: 'frxXAUUSD', display_name: 'Gold / USD (XAU/USD)', category: 'Metals/Cmd', market: 'commodities', submarket: 'metals', pip_size: 0.01, base_price: 3735.00, spread: 0.28 },
  { symbol: 'frxXAGUSD', display_name: 'Silver / USD (XAG/USD)', category: 'Metals/Cmd', market: 'commodities', submarket: 'metals', pip_size: 0.001, base_price: 31.420, spread: 0.024 },
  { symbol: 'USOUSD', display_name: 'WTI Crude Oil (US Oil)', category: 'Metals/Cmd', market: 'commodities', submarket: 'energy', pip_size: 0.01, base_price: 71.85, spread: 0.04 },
  { symbol: 'UKOUSD', display_name: 'Brent Crude Oil (UK Oil)', category: 'Metals/Cmd', market: 'commodities', submarket: 'energy', pip_size: 0.01, base_price: 75.40, spread: 0.04 },
  { symbol: 'WLDXAU', display_name: 'Gold Basket Index', category: 'Metals/Cmd', market: 'basket_index', submarket: 'commodity_basket', pip_size: 0.01, base_price: 2140.25, spread: 0.35 },
  { symbol: 'frxXPTUSD', display_name: 'Platinum / USD (XPT/USD)', category: 'Metals/Cmd', market: 'commodities', submarket: 'metals', pip_size: 0.01, base_price: 978.40, spread: 1.20 },
  { symbol: 'frxXPDUSD', display_name: 'Palladium / USD (XPD/USD)', category: 'Metals/Cmd', market: 'commodities', submarket: 'metals', pip_size: 0.01, base_price: 1024.80, spread: 2.10 },

  // Stock Indices & Baskets — NAS100/US30/SPX500 first
  { symbol: 'OTC_NDX', display_name: 'US Tech 100 (NAS100)', category: 'Indices', market: 'indices', submarket: 'americas', pip_size: 0.01, base_price: 20980.25, spread: 1.20 },
  { symbol: 'OTC_DJI', display_name: 'Wall Street 30 (US30)', category: 'Indices', market: 'indices', submarket: 'americas', pip_size: 0.01, base_price: 43890.50, spread: 2.40 },
  { symbol: 'OTC_SPC', display_name: 'US 500 (SPX500)', category: 'Indices', market: 'indices', submarket: 'americas', pip_size: 0.01, base_price: 5965.40, spread: 0.55 },
  { symbol: 'OTC_GDAXI', display_name: 'Germany 40 (DAX 40)', category: 'Indices', market: 'indices', submarket: 'europe', pip_size: 0.01, base_price: 19412.80, spread: 1.50 },
  { symbol: 'OTC_FTSE', display_name: 'UK 100 (FTSE 100)', category: 'Indices', market: 'indices', submarket: 'europe', pip_size: 0.01, base_price: 8145.60, spread: 1.10 },
  { symbol: 'OTC_N225', display_name: 'Japan 225 (Nikkei)', category: 'Indices', market: 'indices', submarket: 'asia', pip_size: 0.01, base_price: 38940.00, spread: 5.50 },
  { symbol: 'OTC_FCHI', display_name: 'France 40 (CAC 40)', category: 'Indices', market: 'indices', submarket: 'europe', pip_size: 0.01, base_price: 7324.10, spread: 1.10 },
  { symbol: 'OTC_AS51', display_name: 'Australia 200 (ASX)', category: 'Indices', market: 'indices', submarket: 'asia', pip_size: 0.01, base_price: 8312.40, spread: 1.40 },
  { symbol: 'WLDUSD', display_name: 'USD Basket Index', category: 'Indices', market: 'basket_index', submarket: 'forex_basket', pip_size: 0.001, base_price: 1076.310, spread: 0.14 },
  { symbol: 'WLDEUR', display_name: 'EUR Basket Index', category: 'Indices', market: 'basket_index', submarket: 'forex_basket', pip_size: 0.001, base_price: 1098.420, spread: 0.14 },
  { symbol: 'WLDGBP', display_name: 'GBP Basket Index', category: 'Indices', market: 'basket_index', submarket: 'forex_basket', pip_size: 0.001, base_price: 1124.880, spread: 0.16 },
  { symbol: 'WLDAUD', display_name: 'AUD Basket Index', category: 'Indices', market: 'basket_index', submarket: 'forex_basket', pip_size: 0.001, base_price: 1042.150, spread: 0.15 },
];

export const CURATED_ORDER_RANK = new Map<string, number>(
  CURATED_DERIV_INSTRUMENTS.map((inst, idx) => [inst.symbol, idx])
);

export interface ExchangePairSeed {
  pair: string;
  base: string;
  quote: string;
  price: number;
  change24h: number;
  volume24hM: number;
  color: string;
}

export const EXCHANGE_PAIRS_CATALOG: ExchangePairSeed[] = [
  // Top Trending & USDT pairs (12)
  { pair: 'DOGE/USDT', base: 'DOGE', quote: 'USDT', price: 0.05540, change24h: -1.75, volume24hM: 387.15, color: '#C2A633' },
  { pair: 'ADA/USDT', base: 'ADA', quote: 'USDT', price: 0.1455, change24h: -2.08, volume24hM: 114.36, color: '#0033AD' },
  { pair: 'XRP/USDT', base: 'XRP', quote: 'USDT', price: 0.9265, change24h: -1.49, volume24hM: 92.71, color: '#111827' },
  { pair: 'TRX/USDT', base: 'TRX', quote: 'USDT', price: 0.3076, change24h: -0.77, volume24hM: 56.69, color: '#EF0027' },
  { pair: 'POL/USDT', base: 'POL', quote: 'USDT', price: 0.07597, change24h: -1.69, volume24hM: 27.61, color: '#7B3FE4' },
  { pair: 'SOL/USDT', base: 'SOL', quote: 'USDT', price: 70.05, change24h: -2.74, volume24hM: 1.87, color: '#14171F' },
  { pair: 'LTC/USDT', base: 'LTC', quote: 'USDT', price: 40.84, change24h: -1.51, volume24hM: 0.24893, color: '#8E95A2' },
  { pair: 'ETH/USDT', base: 'ETH', quote: 'USDT', price: 1680.23, change24h: -1.78, volume24hM: 0.22272, color: '#627EEA' },
  { pair: 'BNB/USDT', base: 'BNB', quote: 'USDT', price: 545.12, change24h: -2.08, volume24hM: 0.07155, color: '#F3BA2F' },
  { pair: 'BTC/USDT', base: 'BTC', quote: 'USDT', price: 59563.80, change24h: -2.81, volume24hM: 0.01355, color: '#F7931A' },
  { pair: 'DOT/USDT', base: 'DOT', quote: 'USDT', price: 0.6655, change24h: -1.42, volume24hM: 1.92, color: '#E6007A' },
  { pair: 'WBTC/USDT', base: 'WBTC', quote: 'USDT', price: 59684.14, change24h: -2.88, volume24hM: 0.0000731, color: '#282138' },

  // USDC pairs (11)
  { pair: 'DOGE/USDC', base: 'DOGE', quote: 'USDC', price: 0.05533, change24h: -1.77, volume24hM: 50.52, color: '#C2A633' },
  { pair: 'XRP/USDC', base: 'XRP', quote: 'USDC', price: 0.9257, change24h: -1.48, volume24hM: 30.82, color: '#111827' },
  { pair: 'ADA/USDC', base: 'ADA', quote: 'USDC', price: 0.1454, change24h: -2.02, volume24hM: 16.24, color: '#0033AD' },
  { pair: 'TRX/USDC', base: 'TRX', quote: 'USDC', price: 0.3072, change24h: -0.77, volume24hM: 7.80, color: '#EF0027' },
  { pair: 'POL/USDC', base: 'POL', quote: 'USDC', price: 0.07587, change24h: -1.73, volume24hM: 6.70, color: '#7B3FE4' },
  { pair: 'DOT/USDC', base: 'DOT', quote: 'USDC', price: 0.665, change24h: -1.48, volume24hM: 1.35, color: '#E6007A' },
  { pair: 'SOL/USDC', base: 'SOL', quote: 'USDC', price: 70.00, change24h: -2.75, volume24hM: 0.39095, color: '#14171F' },
  { pair: 'ETH/USDC', base: 'ETH', quote: 'USDC', price: 1677.78, change24h: -1.82, volume24hM: 0.06541, color: '#627EEA' },
  { pair: 'LTC/USDC', base: 'LTC', quote: 'USDC', price: 40.81, change24h: -1.47, volume24hM: 0.05320, color: '#8E95A2' },
  { pair: 'BNB/USDC', base: 'BNB', quote: 'USDC', price: 544.42, change24h: -2.10, volume24hM: 0.01565, color: '#F3BA2F' },
  { pair: 'BTC/USDC', base: 'BTC', quote: 'USDC', price: 59506.11, change24h: -2.79, volume24hM: 0.00360, color: '#F7931A' },

  // BTC pairs (9)
  { pair: 'DOGE/BTC', base: 'DOGE', quote: 'BTC', price: 0.00000092, change24h: 0.00, volume24hM: 63.55, color: '#C2A633' },
  { pair: 'ADA/BTC', base: 'ADA', quote: 'BTC', price: 0.00000244, change24h: 0.82, volume24hM: 20.24, color: '#0033AD' },
  { pair: 'TRX/BTC', base: 'TRX', quote: 'BTC', price: 0.00000516, change24h: 2.17, volume24hM: 9.80, color: '#EF0027' },
  { pair: 'DOT/BTC', base: 'DOT', quote: 'BTC', price: 0.00001118, change24h: 1.35, volume24hM: 3.76, color: '#E6007A' },
  { pair: 'LTC/BTC', base: 'LTC', quote: 'BTC', price: 0.000685, change24h: 1.33, volume24hM: 0.06539, color: '#8E95A2' },
  { pair: 'SOL/BTC', base: 'SOL', quote: 'BTC', price: 0.0011758, change24h: 0.00, volume24hM: 0.04398, color: '#14171F' },
  { pair: 'BNB/BTC', base: 'BNB', quote: 'BTC', price: 0.009149, change24h: 0.71, volume24hM: 0.01569, color: '#F3BA2F' },
  { pair: 'ETH/BTC', base: 'ETH', quote: 'BTC', price: 0.02819, change24h: 1.00, volume24hM: 0.00817, color: '#627EEA' },
  { pair: 'XRP/BTC', base: 'XRP', quote: 'BTC', price: 0.00001554, change24h: 0.94, volume24hM: 12.14, color: '#111827' },

  // ETH pairs (6)
  { pair: 'TRX/ETH', base: 'TRX', quote: 'ETH', price: 0.00018308, change24h: 1.00, volume24hM: 2.78, color: '#EF0027' },
  { pair: 'XRP/ETH', base: 'XRP', quote: 'ETH', price: 0.0005514, change24h: 0.27, volume24hM: 2.25, color: '#111827' },
  { pair: 'SOL/ETH', base: 'SOL', quote: 'ETH', price: 0.04169, change24h: -0.97, volume24hM: 0.03761, color: '#14171F' },
  { pair: 'LTC/ETH', base: 'LTC', quote: 'ETH', price: 0.02432, change24h: 0.45, volume24hM: 0.01769, color: '#8E95A2' },
  { pair: 'BNB/ETH', base: 'BNB', quote: 'ETH', price: 0.3246, change24h: -0.21, volume24hM: 0.00787, color: '#F3BA2F' },
  { pair: 'ADA/ETH', base: 'ADA', quote: 'ETH', price: 0.00008659, change24h: -0.31, volume24hM: 1.48, color: '#0033AD' },
];

export const SEEDED_BOT_STRATEGIES = [
  {
    name: '07_Over_Hit_n_Run',
    slug: '07_Over_Hit_n_Run',
    category: 'SpeedBots',
    symbol: '1HZ100V',
    contract_type: 'DIGITOVER',
    description: 'High-frequency digit-over scalper targeting barriers 2 and 3 with instant 1-tick settlement and controlled 2.1x recovery.',
    win_rate_est: 78.4,
    rating: 4.9,
    is_premium: 0,
    config: { stake: 1.0, barrier: '2', duration: 1, duration_unit: 't', martingale: 2.1, takeProfit: 6, stopLoss: 3, maxTrades: 15 },
  },
  {
    name: 'AutoDifferbylegoo',
    slug: 'AutoDifferbylegoo',
    category: 'Free Bots',
    symbol: 'R_100',
    contract_type: 'DIGITDIFF',
    description: 'Coldest-digit avoidance Differ bot scanning the last 25 ticks and firing immediately against the lowest frequency digit.',
    win_rate_est: 89.2,
    rating: 4.8,
    is_premium: 0,
    config: { stake: 1.0, barrier: '0', duration: 1, duration_unit: 't', martingale: 11.0, takeProfit: 6, stopLoss: 3, maxTrades: 15 },
  },
  {
    name: 'MagicRecovery',
    slug: 'MagicRecovery',
    category: 'Scalper Bots',
    symbol: '1HZ75V',
    contract_type: 'DIGITUNDER',
    description: 'Adaptive Under-7 recovery engine with immediate startup execution and dynamic stake reset on win.',
    win_rate_est: 74.6,
    rating: 4.7,
    is_premium: 0,
    config: { stake: 1.0, barrier: '7', duration: 1, duration_unit: 't', martingale: 2.1, takeProfit: 6, stopLoss: 3, maxTrades: 15 },
  },
  {
    name: 'Autovolt5Probot1',
    slug: 'Autovolt5Probot1',
    category: 'Scalper Bots',
    symbol: '1HZ10V',
    contract_type: 'DIGITEVEN',
    description: 'Even/Odd parity momentum scanner engineered for Volatility 10 (1s) with zero-delay tick entry.',
    win_rate_est: 64.5,
    rating: 4.8,
    is_premium: 1,
    config: { stake: 1.0, barrier: '', duration: 1, duration_unit: 't', martingale: 2.0, takeProfit: 8, stopLoss: 4, maxTrades: 20 },
  },
  {
    name: 'AlphaVersion2026Edition',
    slug: 'AlphaVersion2026Edition',
    category: 'SpeedBots',
    symbol: '1HZ25V',
    contract_type: 'CALL',
    description: 'Short-burst Rise/Fall momentum runner comparing live spot against 5-tick rolling mean for immediate directional entries.',
    win_rate_est: 68.9,
    rating: 4.9,
    is_premium: 1,
    config: { stake: 1.5, barrier: '', duration: 5, duration_unit: 't', martingale: 2.0, takeProfit: 8, stopLoss: 4, maxTrades: 15 },
  },
  {
    name: 'SignalSniperAutoBot',
    slug: 'SignalSniperAutoBot',
    category: 'Free Bots',
    symbol: 'R_75',
    contract_type: 'MULTUP',
    description: 'Volatility 75 Multiplier sniper with strict USD Stop Loss & Take Profit protection and automated position cycling.',
    win_rate_est: 71.2,
    rating: 4.8,
    is_premium: 0,
    config: { stake: 2.0, multiplier: 100, duration: 5, duration_unit: 't', martingale: 1.5, takeProfit: 6, stopLoss: 1.5, maxTrades: 15 },
  },
];
