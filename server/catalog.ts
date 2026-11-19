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
  { symbol: 'frxXAUUSD', display_name: 'Gold / USD (XAU/USD)', category: 'Metals/Cmd', market: 'commodities', submarket: 'metals', pip_size: 0.01, base_price: 2684.50, spread: 0.28 },
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
  { pair: 'DOGE/USDT', base: 'DOGE', quote: 'USDT', price: 0.05938, change24h: -1.23, volume24hM: 184.26, color: '#C2A633' },
  { pair: 'ADA/USDT', base: 'ADA', quote: 'USDT', price: 0.1540, change24h: -0.83, volume24hM: 67.80, color: '#0033AD' },
  { pair: 'XRP/USDT', base: 'XRP', quote: 'USDT', price: 0.9876, change24h: 0.39, volume24hM: 56.73, color: '#111827' },
  { pair: 'DOGE/BTC', base: 'DOGE', quote: 'BTC', price: 0.00000092, change24h: 0.00, volume24hM: 41.75, color: '#C2A633' },
  { pair: 'TRX/USDT', base: 'TRX', quote: 'USDT', price: 0.3095, change24h: 0.45, volume24hM: 41.33, color: '#EF0027' },
  { pair: 'BTC/USDT', base: 'BTC', quote: 'USDT', price: 91450.00, change24h: 2.18, volume24hM: 1420.50, color: '#F7931A' },
  { pair: 'ETH/USDT', base: 'ETH', quote: 'USDT', price: 3180.45, change24h: 1.64, volume24hM: 890.12, color: '#627EEA' },
  { pair: 'SOL/USDT', base: 'SOL', quote: 'USDT', price: 184.20, change24h: 4.12, volume24hM: 412.80, color: '#14F195' },
  { pair: 'LTC/ETH', base: 'LTC', quote: 'ETH', price: 0.02454, change24h: -1.20, volume24hM: 28.40, color: '#345D9D' },
  { pair: 'LTC/USDT', base: 'LTC', quote: 'USDT', price: 78.15, change24h: 0.85, volume24hM: 39.20, color: '#345D9D' },
  { pair: 'BNB/USDT', base: 'BNB', quote: 'USDT', price: 618.90, change24h: 1.15, volume24hM: 204.50, color: '#F3BA2F' },
  { pair: 'AVAX/USDT', base: 'AVAX', quote: 'USDT', price: 34.80, change24h: 3.45, volume24hM: 52.10, color: '#E84142' },
  { pair: 'DOT/USDT', base: 'DOT', quote: 'USDT', price: 5.420, change24h: -0.62, volume24hM: 24.90, color: '#E6007A' },
  { pair: 'LINK/USDT', base: 'LINK', quote: 'USDT', price: 14.85, change24h: 2.84, volume24hM: 76.30, color: '#2A5ADA' },
  { pair: 'ETH/BTC', base: 'ETH', quote: 'BTC', price: 0.03478, change24h: -0.52, volume24hM: 165.40, color: '#627EEA' },
  { pair: 'SOL/BTC', base: 'SOL', quote: 'BTC', price: 0.002014, change24h: 1.92, volume24hM: 61.20, color: '#14F195' },
  { pair: 'XRP/BTC', base: 'XRP', quote: 'BTC', price: 0.0000108, change24h: -1.40, volume24hM: 19.80, color: '#111827' },
  { pair: 'USDC/USDT', base: 'USDC', quote: 'USDT', price: 1.0001, change24h: 0.01, volume24hM: 540.00, color: '#2775CA' },
  { pair: 'ETH/USDC', base: 'ETH', quote: 'USDC', price: 3179.90, change24h: 1.62, volume24hM: 210.40, color: '#627EEA' },
  { pair: 'BTC/USDC', base: 'BTC', quote: 'USDC', price: 91440.00, change24h: 2.16, volume24hM: 380.20, color: '#F7931A' },
  { pair: 'MATIC/USDT', base: 'MATIC', quote: 'USDT', price: 0.4820, change24h: -2.14, volume24hM: 31.10, color: '#8247E5' },
  { pair: 'UNI/USDT', base: 'UNI', quote: 'USDT', price: 9.640, change24h: 1.38, volume24hM: 29.70, color: '#FF007A' },
  { pair: 'AAVE/USDT', base: 'AAVE', quote: 'USDT', price: 168.40, change24h: 5.12, volume24hM: 34.90, color: '#B6509E' },
  { pair: 'NEAR/USDT', base: 'NEAR', quote: 'USDT', price: 5.180, change24h: 2.40, volume24hM: 44.10, color: '#00C08B' },
  { pair: 'ARB/USDT', base: 'ARB', quote: 'USDT', price: 0.7640, change24h: -1.55, volume24hM: 38.60, color: '#28A0F0' },
  { pair: 'OP/USDT', base: 'OP', quote: 'USDT', price: 1.842, change24h: 0.94, volume24hM: 27.30, color: '#FF0420' },
  { pair: 'SUI/USDT', base: 'SUI', quote: 'USDT', price: 3.210, change24h: 6.42, volume24hM: 128.40, color: '#4DA2FF' },
  { pair: 'TON/USDT', base: 'TON', quote: 'USDT', price: 5.640, change24h: -0.44, volume24hM: 64.20, color: '#0098EA' },
  { pair: 'APT/USDT', base: 'APT', quote: 'USDT', price: 9.120, change24h: 1.78, volume24hM: 26.80, color: '#111827' },
  { pair: 'ATOM/USDT', base: 'ATOM', quote: 'USDT', price: 6.240, change24h: -1.12, volume24hM: 18.40, color: '#2E3148' },
  { pair: 'BCH/USDT', base: 'BCH', quote: 'USDT', price: 428.60, change24h: 0.72, volume24hM: 33.10, color: '#8DC351' },
  { pair: 'FIL/USDT', base: 'FIL', quote: 'USDT', price: 4.560, change24h: -2.40, volume24hM: 19.20, color: '#0090FF' },
  { pair: 'ETC/USDT', base: 'ETC', quote: 'USDT', price: 24.30, change24h: -0.35, volume24hM: 17.50, color: '#328332' },
  { pair: 'XLM/USDT', base: 'XLM', quote: 'USDT', price: 0.2410, change24h: 3.18, volume24hM: 48.90, color: '#111827' },
  { pair: 'ALGO/USDT', base: 'ALGO', quote: 'USDT', price: 0.1940, change24h: -0.95, volume24hM: 15.80, color: '#111827' },
  { pair: 'HBAR/USDT', base: 'HBAR', quote: 'USDT', price: 0.1480, change24h: 2.04, volume24hM: 36.20, color: '#111827' },
  { pair: 'VET/USDT', base: 'VET', quote: 'USDT', price: 0.0324, change24h: -1.65, volume24hM: 14.30, color: '#15BDFF' },
  { pair: 'SHIB/USDT', base: 'SHIB', quote: 'USDT', price: 0.0000248, change24h: 4.85, volume24hM: 92.40, color: '#FFA409' },
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
    config: { stake: 1.0, barrier: '2', duration: 1, duration_unit: 't', martingale: 2.1, takeProfit: 15, stopLoss: 30, maxTrades: 50 },
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
    config: { stake: 2.0, barrier: '0', duration: 1, duration_unit: 't', martingale: 11.0, takeProfit: 20, stopLoss: 50, maxTrades: 40 },
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
    config: { stake: 1.5, barrier: '7', duration: 1, duration_unit: 't', martingale: 2.2, takeProfit: 25, stopLoss: 45, maxTrades: 60 },
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
    config: { stake: 2.0, barrier: '', duration: 1, duration_unit: 't', martingale: 2.05, takeProfit: 30, stopLoss: 60, maxTrades: 80 },
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
    config: { stake: 5.0, barrier: '', duration: 5, duration_unit: 't', martingale: 2.0, takeProfit: 50, stopLoss: 75, maxTrades: 30 },
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
    config: { stake: 10.0, multiplier: 100, duration: 5, duration_unit: 't', martingale: 1.5, takeProfit: 40, stopLoss: 20, maxTrades: 25 },
  },
];
