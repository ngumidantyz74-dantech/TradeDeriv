export type BlockMarketName =
  | 'Derived'
  | 'Forex'
  | 'Stocks'
  | 'Commodities'
  | 'Cryptocurrencies';

export interface SymbolCatalogItem {
  symbol: string;
  label: string;
  market: BlockMarketName;
  submarket: string;
}

export const BLOCK_MARKETS: BlockMarketName[] = [
  'Derived',
  'Forex',
  'Stocks',
  'Commodities',
  'Cryptocurrencies',
];

export const BLOCK_SUBMARKETS: Record<BlockMarketName, string[]> = {
  Derived: [
    'Continuous Indices',
    'Crash/Boom Indices',
    'Jump Indices',
    'Range Break Indices',
    'Daily Reset Indices',
    'Forex Basket',
    'Commodities Basket',
    'Step Indices',
  ],
  Forex: ['Forex Major Pairs', 'Forex Minor Pairs', 'Forex Exotic Pairs'],
  Stocks: ['US Stocks', 'UK Stocks', 'European Stocks', 'Stock Indices'],
  Commodities: ['Metals', 'Energy', 'Soft Commodities'],
  Cryptocurrencies: ['Crypto'],
};

export const BLOCK_SYMBOLS: SymbolCatalogItem[] = [
  // Continuous Indices
  { symbol: '1HZ100V', label: 'Volatility 100 (1s) Index', market: 'Derived', submarket: 'Continuous Indices' },
  { symbol: '1HZ75V', label: 'Volatility 75 (1s) Index', market: 'Derived', submarket: 'Continuous Indices' },
  { symbol: '1HZ50V', label: 'Volatility 50 (1s) Index', market: 'Derived', submarket: 'Continuous Indices' },
  { symbol: '1HZ25V', label: 'Volatility 25 (1s) Index', market: 'Derived', submarket: 'Continuous Indices' },
  { symbol: '1HZ10V', label: 'Volatility 10 (1s) Index', market: 'Derived', submarket: 'Continuous Indices' },
  { symbol: '1HZ15V', label: 'Volatility 15 (1s) Index', market: 'Derived', submarket: 'Continuous Indices' },
  { symbol: '1HZ150V', label: 'Volatility 150 (1s) Index', market: 'Derived', submarket: 'Continuous Indices' },
  { symbol: '1HZ250V', label: 'Volatility 250 (1s) Index', market: 'Derived', submarket: 'Continuous Indices' },
  { symbol: 'R_100', label: 'Volatility 100 Index', market: 'Derived', submarket: 'Continuous Indices' },
  { symbol: 'R_75', label: 'Volatility 75 Index', market: 'Derived', submarket: 'Continuous Indices' },
  { symbol: 'R_50', label: 'Volatility 50 Index', market: 'Derived', submarket: 'Continuous Indices' },
  { symbol: 'R_25', label: 'Volatility 25 Index', market: 'Derived', submarket: 'Continuous Indices' },
  { symbol: 'R_10', label: 'Volatility 10 Index', market: 'Derived', submarket: 'Continuous Indices' },
  // Crash/Boom Indices
  { symbol: 'CRASH300N', label: 'Crash 300 Index', market: 'Derived', submarket: 'Crash/Boom Indices' },
  { symbol: 'CRASH500', label: 'Crash 500 Index', market: 'Derived', submarket: 'Crash/Boom Indices' },
  { symbol: 'CRASH600', label: 'Crash 600 Index', market: 'Derived', submarket: 'Crash/Boom Indices' },
  { symbol: 'CRASH900', label: 'Crash 900 Index', market: 'Derived', submarket: 'Crash/Boom Indices' },
  { symbol: 'CRASH1000', label: 'Crash 1000 Index', market: 'Derived', submarket: 'Crash/Boom Indices' },
  { symbol: 'BOOM300N', label: 'Boom 300 Index', market: 'Derived', submarket: 'Crash/Boom Indices' },
  { symbol: 'BOOM500', label: 'Boom 500 Index', market: 'Derived', submarket: 'Crash/Boom Indices' },
  { symbol: 'BOOM600', label: 'Boom 600 Index', market: 'Derived', submarket: 'Crash/Boom Indices' },
  { symbol: 'BOOM900', label: 'Boom 900 Index', market: 'Derived', submarket: 'Crash/Boom Indices' },
  { symbol: 'BOOM1000', label: 'Boom 1000 Index', market: 'Derived', submarket: 'Crash/Boom Indices' },
  // Jump Indices
  { symbol: 'JD10', label: 'Jump 10 Index', market: 'Derived', submarket: 'Jump Indices' },
  { symbol: 'JD25', label: 'Jump 25 Index', market: 'Derived', submarket: 'Jump Indices' },
  { symbol: 'JD50', label: 'Jump 50 Index', market: 'Derived', submarket: 'Jump Indices' },
  { symbol: 'JD75', label: 'Jump 75 Index', market: 'Derived', submarket: 'Jump Indices' },
  { symbol: 'JD100', label: 'Jump 100 Index', market: 'Derived', submarket: 'Jump Indices' },
  // Range Break Indices
  { symbol: 'RB100', label: 'Range Break 100 Index', market: 'Derived', submarket: 'Range Break Indices' },
  { symbol: 'RB200', label: 'Range Break 200 Index', market: 'Derived', submarket: 'Range Break Indices' },
  // Daily Reset Indices
  { symbol: 'RDBULL', label: 'Bull Market Index', market: 'Derived', submarket: 'Daily Reset Indices' },
  { symbol: 'RDBEAR', label: 'Bear Market Index', market: 'Derived', submarket: 'Daily Reset Indices' },
  // Forex Basket
  { symbol: 'WLDAUD', label: 'AUD Basket', market: 'Derived', submarket: 'Forex Basket' },
  { symbol: 'WLDEUR', label: 'EUR Basket', market: 'Derived', submarket: 'Forex Basket' },
  { symbol: 'WLDGBP', label: 'GBP Basket', market: 'Derived', submarket: 'Forex Basket' },
  { symbol: 'WLDUSD', label: 'USD Basket', market: 'Derived', submarket: 'Forex Basket' },
  // Commodities Basket
  { symbol: 'WLDXAU', label: 'Gold Basket', market: 'Derived', submarket: 'Commodities Basket' },
  { symbol: 'WLDXAG', label: 'Silver Basket', market: 'Derived', submarket: 'Commodities Basket' },
  { symbol: 'WLDCMP', label: 'Commodity Basket', market: 'Derived', submarket: 'Commodities Basket' },
  // Step Indices
  { symbol: 'STPIDX', label: 'Step Index', market: 'Derived', submarket: 'Step Indices' },
  // Forex Major Pairs
  { symbol: 'frxEURUSD', label: 'EUR/USD', market: 'Forex', submarket: 'Forex Major Pairs' },
  { symbol: 'frxGBPUSD', label: 'GBP/USD', market: 'Forex', submarket: 'Forex Major Pairs' },
  { symbol: 'frxUSDJPY', label: 'USD/JPY', market: 'Forex', submarket: 'Forex Major Pairs' },
  { symbol: 'frxAUDUSD', label: 'AUD/USD', market: 'Forex', submarket: 'Forex Major Pairs' },
  { symbol: 'frxUSDCAD', label: 'USD/CAD', market: 'Forex', submarket: 'Forex Major Pairs' },
  { symbol: 'frxUSDCHF', label: 'USD/CHF', market: 'Forex', submarket: 'Forex Major Pairs' },
  { symbol: 'frxNZDUSD', label: 'NZD/USD', market: 'Forex', submarket: 'Forex Major Pairs' },
  // Forex Minor Pairs
  { symbol: 'frxEURGBP', label: 'EUR/GBP', market: 'Forex', submarket: 'Forex Minor Pairs' },
  { symbol: 'frxEURJPY', label: 'EUR/JPY', market: 'Forex', submarket: 'Forex Minor Pairs' },
  { symbol: 'frxGBPJPY', label: 'GBP/JPY', market: 'Forex', submarket: 'Forex Minor Pairs' },
  { symbol: 'frxAUDJPY', label: 'AUD/JPY', market: 'Forex', submarket: 'Forex Minor Pairs' },
  { symbol: 'frxEURAUD', label: 'EUR/AUD', market: 'Forex', submarket: 'Forex Minor Pairs' },
  // Forex Exotic Pairs
  { symbol: 'frxUSDTRY', label: 'USD/TRY', market: 'Forex', submarket: 'Forex Exotic Pairs' },
  { symbol: 'frxUSDZAR', label: 'USD/ZAR', market: 'Forex', submarket: 'Forex Exotic Pairs' },
  { symbol: 'frxUSDMXN', label: 'USD/MXN', market: 'Forex', submarket: 'Forex Exotic Pairs' },
  // US Stocks
  { symbol: 'AAPL', label: 'Apple Inc', market: 'Stocks', submarket: 'US Stocks' },
  { symbol: 'AMZN', label: 'Amazon.com', market: 'Stocks', submarket: 'US Stocks' },
  { symbol: 'TSLA', label: 'Tesla Inc', market: 'Stocks', submarket: 'US Stocks' },
  { symbol: 'MSFT', label: 'Microsoft Corp', market: 'Stocks', submarket: 'US Stocks' },
  // UK Stocks
  { symbol: 'BARC', label: 'Barclays PLC', market: 'Stocks', submarket: 'UK Stocks' },
  { symbol: 'BP', label: 'BP PLC', market: 'Stocks', submarket: 'UK Stocks' },
  { symbol: 'VOD', label: 'Vodafone Group', market: 'Stocks', submarket: 'UK Stocks' },
  // European Stocks
  { symbol: 'BMW', label: 'BMW AG', market: 'Stocks', submarket: 'European Stocks' },
  { symbol: 'SIE', label: 'Siemens AG', market: 'Stocks', submarket: 'European Stocks' },
  { symbol: 'AIR', label: 'Airbus SE', market: 'Stocks', submarket: 'European Stocks' },
  // Stock Indices
  { symbol: 'OTC_DJI', label: 'Wall Street 30', market: 'Stocks', submarket: 'Stock Indices' },
  { symbol: 'OTC_NDX', label: 'US Tech 100', market: 'Stocks', submarket: 'Stock Indices' },
  { symbol: 'OTC_SPC', label: 'US 500', market: 'Stocks', submarket: 'Stock Indices' },
  { symbol: 'OTC_FTSE', label: 'UK 100', market: 'Stocks', submarket: 'Stock Indices' },
  { symbol: 'OTC_GDAXI', label: 'Germany 40', market: 'Stocks', submarket: 'Stock Indices' },
  { symbol: 'OTC_N225', label: 'Japan 225', market: 'Stocks', submarket: 'Stock Indices' },
  // Commodities
  { symbol: 'frxXAUUSD', label: 'Gold', market: 'Commodities', submarket: 'Metals' },
  { symbol: 'frxXAGUSD', label: 'Silver', market: 'Commodities', submarket: 'Metals' },
  { symbol: 'frxXPDUSD', label: 'Palladium', market: 'Commodities', submarket: 'Metals' },
  { symbol: 'frxXPTUSD', label: 'Platinum', market: 'Commodities', submarket: 'Metals' },
  { symbol: 'USOUSD', label: 'Oil', market: 'Commodities', submarket: 'Energy' },
  { symbol: 'NATGAS', label: 'Natural Gas', market: 'Commodities', submarket: 'Energy' },
  { symbol: 'COFFEEUSD', label: 'Coffee', market: 'Commodities', submarket: 'Soft Commodities' },
  { symbol: 'COCOAUSD', label: 'Cocoa', market: 'Commodities', submarket: 'Soft Commodities' },
  { symbol: 'COTTONUSD', label: 'Cotton', market: 'Commodities', submarket: 'Soft Commodities' },
  { symbol: 'SUGARUSD', label: 'Sugar', market: 'Commodities', submarket: 'Soft Commodities' },
  // Cryptocurrencies
  { symbol: 'cryBTCUSD', label: 'Bitcoin', market: 'Cryptocurrencies', submarket: 'Crypto' },
  { symbol: 'cryETHUSD', label: 'Ethereum', market: 'Cryptocurrencies', submarket: 'Crypto' },
  { symbol: 'cryLTCUSD', label: 'Litecoin', market: 'Cryptocurrencies', submarket: 'Crypto' },
  { symbol: 'cryBCHUSD', label: 'Bitcoin Cash', market: 'Cryptocurrencies', submarket: 'Crypto' },
];

export type TradeCategoryName =
  | 'Digits'
  | 'Up/Down'
  | 'Touch/No Touch'
  | 'In/Out'
  | 'Asians'
  | 'Reset Call/Reset Put'
  | 'High/Low Ticks'
  | 'Only Ups/Only Downs'
  | 'Multipliers'
  | 'Accumulators';

export interface TradeSubtypeDef {
  category: TradeCategoryName;
  subtype: string;
  legs: Array<{ value: string; label: string }>;
  usesPrediction: boolean;
  isAccu?: boolean;
}

export const TRADE_SUBTYPES: TradeSubtypeDef[] = [
  {
    category: 'Digits',
    subtype: 'Matches/Differs',
    legs: [
      { value: 'DIGITMATCH', label: 'Matches' },
      { value: 'DIGITDIFF', label: 'Differs' },
    ],
    usesPrediction: true,
  },
  {
    category: 'Digits',
    subtype: 'Even/Odd',
    legs: [
      { value: 'DIGITEVEN', label: 'Even' },
      { value: 'DIGITODD', label: 'Odd' },
    ],
    usesPrediction: false,
  },
  {
    category: 'Digits',
    subtype: 'Over/Under',
    legs: [
      { value: 'DIGITOVER', label: 'Over' },
      { value: 'DIGITUNDER', label: 'Under' },
    ],
    usesPrediction: true,
  },
  {
    category: 'Up/Down',
    subtype: 'Rise/Fall',
    legs: [
      { value: 'CALL', label: 'Rise' },
      { value: 'PUT', label: 'Fall' },
    ],
    usesPrediction: false,
  },
  {
    category: 'Up/Down',
    subtype: 'Higher/Lower',
    legs: [
      { value: 'HIGHER', label: 'Higher' },
      { value: 'LOWER', label: 'Lower' },
    ],
    usesPrediction: true,
  },
  {
    category: 'Touch/No Touch',
    subtype: 'Touch/No Touch',
    legs: [
      { value: 'ONETOUCH', label: 'Touch' },
      { value: 'NOTOUCH', label: 'No Touch' },
    ],
    usesPrediction: true,
  },
  {
    category: 'In/Out',
    subtype: 'In/Out',
    legs: [
      { value: 'EXPIRYRANGE', label: 'Stays In' },
      { value: 'EXPIRYMISS', label: 'Goes Out' },
    ],
    usesPrediction: true,
  },
  {
    category: 'In/Out',
    subtype: 'Ends In/Out',
    legs: [
      { value: 'ENDSIN', label: 'Ends In' },
      { value: 'ENDSOUT', label: 'Ends Out' },
    ],
    usesPrediction: true,
  },
  {
    category: 'Asians',
    subtype: 'Asians',
    legs: [
      { value: 'ASIANU', label: 'Asian Up' },
      { value: 'ASIAND', label: 'Asian Down' },
    ],
    usesPrediction: false,
  },
  {
    category: 'Reset Call/Reset Put',
    subtype: 'Reset Call/Reset Put',
    legs: [
      { value: 'RESETCALL', label: 'Reset Call' },
      { value: 'RESETPUT', label: 'Reset Put' },
    ],
    usesPrediction: false,
  },
  {
    category: 'High/Low Ticks',
    subtype: 'High/Low Ticks',
    legs: [
      { value: 'TICKHIGH', label: 'High Tick' },
      { value: 'TICKLOW', label: 'Low Tick' },
    ],
    usesPrediction: false,
  },
  {
    category: 'Only Ups/Only Downs',
    subtype: 'Only Ups/Only Downs',
    legs: [
      { value: 'RUNHIGH', label: 'Only Ups' },
      { value: 'RUNLOW', label: 'Only Downs' },
    ],
    usesPrediction: false,
  },
  {
    category: 'Multipliers',
    subtype: 'Multipliers',
    legs: [
      { value: 'MULTUP', label: 'Up' },
      { value: 'MULTDOWN', label: 'Down' },
    ],
    usesPrediction: false,
  },
  {
    category: 'Accumulators',
    subtype: 'Accumulators',
    legs: [
      { value: 'ACCU', label: 'Accumulators' },
      { value: 'ACCU', label: 'Growth' },
    ],
    usesPrediction: false,
    isAccu: true,
  },
];

export const CANDLE_INTERVALS: Array<{ value: string; label: string }> = [
  { value: '1t', label: '1 tick' },
  { value: '1m', label: '1 minute' },
  { value: '2m', label: '2 minutes' },
  { value: '3m', label: '3 minutes' },
  { value: '5m', label: '5 minutes' },
  { value: '10m', label: '10 minutes' },
  { value: '15m', label: '15 minutes' },
  { value: '30m', label: '30 minutes' },
  { value: '1h', label: '1 hour' },
];

export const DURATION_UNITS: Array<{ value: string; label: string }> = [
  { value: 't', label: 'Ticks' },
  { value: 's', label: 'Seconds' },
  { value: 'm', label: 'Minutes' },
  { value: 'h', label: 'Hours' },
];

export const BOT_VARIABLES: string[] = [
  'initialStake',
  'lastProfit',
  'lossStreak',
  'lossThreshold',
  'maxWinSteps',
  'maxStake',
  'Tick Count',
  'accumulatorTakeProfit',
  'msgInfo',
  'msgStake',
  'msgProfit',
  'msgStop',
  'nextStake',
  'profitThreshold',
  'resultIsWin',
  'totalProfit',
  'tradeSide',
  'winStep',
  'winStreak',
  'martingale:initialStake',
  'martingale:size',
  'martingale:profitThreshold',
  'martingale:lossThreshold',
  'initial_stake',
  'current_stake',
  'take_profit',
  'stop_loss',
  'max_losses',
];

export interface TextJoinPart {
  id: string;
  kind: 'text' | 'var' | 'fn';
  value: string;
}

export interface RunOnceAssignment {
  id: string;
  variable: string;
  value: string;
}

export interface AddedVisualBlock {
  id: string;
  section: 'purchase' | 'restart' | 'canvas';
  kind: 'if' | 'set' | 'purchase' | 'notify' | 'stop';
  label: string;
  left?: string;
  op?: 'EQ' | 'NEQ' | 'GT' | 'LT' | 'GTE' | 'LTE';
  right?: string;
  value?: string;
  contract?: string;
  x?: number;
  y?: number;
}

export interface ImportedProcedureGroup {
  id: string;
  title: string;
  kind: 'procedure' | 'custom';
  lines: string[];
  x: number;
  y: number;
}

export interface BotXmlWorkspaceState {
  strategyName: string;
  strategyType: string;
  market: BlockMarketName;
  submarket: string;
  symbol: string;
  tradeCategory: TradeCategoryName;
  tradeSubtype: string;
  contractTypeSelection: 'Both' | string;
  candleInterval: string;
  restartBuySellOnError: boolean;
  restartLastTradeOnError: boolean;
  assignments: RunOnceAssignment[];
  durationUnit: string;
  duration: string;
  prediction: string;
  growthRate: number;
  accumulatorTakeProfit?: string;
  martingaleFactor: string;
  maxTrades: string;
  maxStake?: string;
  sellTickCount?: string;
  maxLosses?: string;
  hasSellConditions?: boolean;
  sellByCountdown?: boolean;
  updateProcedureName?: string;
  notifyVar: string;
  notifyColor: 'blue' | 'green' | 'yellow' | 'red';
  notifySound: 'Silent' | 'Announcement' | 'Earned money' | 'Job done' | 'Severe error';
  notifyParts: TextJoinPart[];
  ifLeftVar: string;
  ifOperator: 'EQ' | 'NEQ' | 'GT' | 'LT' | 'GTE' | 'LTE';
  ifCompareValue: string;
  thenPurchase: string;
  elseEnabled: boolean;
  elsePurchase: string;
  restartResultCheck: 'win' | 'loss';
  restartDetailField: 'profit' | 'payout' | 'buy_price';
  restartElseEnabled: boolean;
  quantumPredictionId?: string | null;
  quantumExpiresAt?: string | null;
  customBlocks?: AddedVisualBlock[];
  importedGroups?: ImportedProcedureGroup[];
  blockPositions?: Record<string, { x: number; y: number }>;
  rawImportedXml?: string | null;
}

export function createDefaultXmlWorkspaceState(): BotXmlWorkspaceState {
  return {
    strategyName: 'xml_block_flow',
    strategyType: 'xml_block_flow',
    market: 'Derived',
    submarket: 'Continuous Indices',
    symbol: '1HZ100V',
    tradeCategory: 'Up/Down',
    tradeSubtype: 'Rise/Fall',
    contractTypeSelection: 'Both',
    candleInterval: '1m',
    restartBuySellOnError: false,
    restartLastTradeOnError: true,
    assignments: [
      { id: 'a1', variable: 'initialStake', value: '1' },
      { id: 'a2', variable: 'winStep', value: '0.5' },
      { id: 'a3', variable: 'maxWinSteps', value: '3' },
      { id: 'a4', variable: 'profitThreshold', value: '10' },
      { id: 'a5', variable: 'lossThreshold', value: '6' },
      { id: 'a6', variable: 'tradeSide', value: 'CALL' },
      { id: 'a7', variable: 'winStreak', value: '0' },
      { id: 'a8', variable: 'lossStreak', value: '0' },
      { id: 'a9', variable: 'totalProfit', value: '0' },
    ],
    durationUnit: 't',
    duration: '1',
    prediction: '1',
    growthRate: 0.02,
    martingaleFactor: '2.1',
    maxTrades: '50',
    notifyVar: 'msgInfo',
    notifyColor: 'blue',
    notifySound: 'Silent',
    notifyParts: [
      { id: 'p1', kind: 'text', value: 'Side:' },
      { id: 'p2', kind: 'var', value: 'tradeSide' },
      { id: 'p3', kind: 'text', value: '| Stake:' },
      { id: 'p4', kind: 'fn', value: 'Get Next Stake' },
    ],
    ifLeftVar: 'tradeSide',
    ifOperator: 'EQ',
    ifCompareValue: 'CALL',
    thenPurchase: 'CALL',
    elseEnabled: true,
    elsePurchase: 'PUT',
    restartResultCheck: 'win',
    restartDetailField: 'profit',
    restartElseEnabled: false,
  };
}

export interface QuickStrategyDef {
  key: string;
  name: string;
  category: 'Accumulators' | 'Options';
  contractType: string;
  tradeCategory: TradeCategoryName;
  tradeSubtype: string;
  defaultFactor: string;
  desc: string;
}

export const QUICK_STRATEGIES: QuickStrategyDef[] = [
  // Exact 8 Accumulators strategies (Screenshot 210125 & 210129)
  {
    key: 'accu_martingale',
    name: 'Martingale',
    category: 'Accumulators',
    contractType: 'ACCU',
    tradeCategory: 'Accumulators',
    tradeSubtype: 'Accumulators',
    defaultFactor: '2.0',
    desc: 'Doubles accumulator stake after a barrier knockout and resets on take-profit target.',
  },
  {
    key: 'accu_martingale_stat_reset',
    name: 'Martingale on Stat Reset',
    category: 'Accumulators',
    contractType: 'ACCU',
    tradeCategory: 'Accumulators',
    tradeSubtype: 'Accumulators',
    defaultFactor: '2.0',
    desc: 'Compounds accumulator targets and scales stake following statistical barrier resets.',
  },
  {
    key: 'accu_dalembert',
    name: "D'Alembert",
    category: 'Accumulators',
    contractType: 'ACCU',
    tradeCategory: 'Accumulators',
    tradeSubtype: 'Accumulators',
    defaultFactor: '1.25',
    desc: 'Steps accumulator stake up linearly by initial unit after a knockout and steps down on win.',
  },
  {
    key: 'accu_dalembert_stat_reset',
    name: "D'Alembert on Stat Reset",
    category: 'Accumulators',
    contractType: 'ACCU',
    tradeCategory: 'Accumulators',
    tradeSubtype: 'Accumulators',
    defaultFactor: '1.25',
    desc: 'Measured linear recovery progression synced to accumulator range statistical resets.',
  },
  {
    key: 'accu_reverse_martingale',
    name: 'Reverse Martingale',
    category: 'Accumulators',
    contractType: 'ACCU',
    tradeCategory: 'Accumulators',
    tradeSubtype: 'Accumulators',
    defaultFactor: '1.6',
    desc: 'Scales stake during winning accumulator runs to press profitable momentum.',
  },
  {
    key: 'accu_reverse_martingale_stat_reset',
    name: 'Reverse Martingale on Stat Reset',
    category: 'Accumulators',
    contractType: 'ACCU',
    tradeCategory: 'Accumulators',
    tradeSubtype: 'Accumulators',
    defaultFactor: '1.6',
    desc: 'Positive progression on accumulator wins that resets safely after statistical stat cycles.',
  },
  {
    key: 'accu_reverse_dalembert',
    name: "Reverse D'Alembert",
    category: 'Accumulators',
    contractType: 'ACCU',
    tradeCategory: 'Accumulators',
    tradeSubtype: 'Accumulators',
    defaultFactor: '1.2',
    desc: 'Adds one stake unit per consecutive accumulator win and resets on knockout.',
  },
  {
    key: 'accu_reverse_dalembert_stat_reset',
    name: "Reverse D'Alembert on Stat Reset",
    category: 'Accumulators',
    contractType: 'ACCU',
    tradeCategory: 'Accumulators',
    tradeSubtype: 'Accumulators',
    defaultFactor: '1.2',
    desc: 'Combines linear positive accumulator stepping with automated statistical cap resets.',
  },

  // Exact 6 Options strategies (Screenshot 210110 & 210125)
  {
    key: 'martingale',
    name: 'Martingale',
    category: 'Options',
    contractType: 'CALL',
    tradeCategory: 'Up/Down',
    tradeSubtype: 'Rise/Fall',
    defaultFactor: '2.1',
    desc: 'Multiplies stake after a loss and resets back to initialStake on a winning contract.',
  },
  {
    key: 'dalembert',
    name: "D'Alembert",
    category: 'Options',
    contractType: 'CALL',
    tradeCategory: 'Up/Down',
    tradeSubtype: 'Rise/Fall',
    defaultFactor: '1.25',
    desc: 'Increases stake by one unit after a loss and decreases by one unit after a win.',
  },
  {
    key: 'reverse_martingale',
    name: 'Reverse Martingale',
    category: 'Options',
    contractType: 'CALL',
    tradeCategory: 'Up/Down',
    tradeSubtype: 'Rise/Fall',
    defaultFactor: '1.6',
    desc: 'Increases stake during winning streaks to maximize trend momentum.',
  },
  {
    key: 'reverse_dalembert',
    name: "Reverse D'Alembert",
    category: 'Options',
    contractType: 'CALL',
    tradeCategory: 'Up/Down',
    tradeSubtype: 'Rise/Fall',
    defaultFactor: '1.2',
    desc: 'Steps stake up by winStep after wins and drops down immediately after a loss.',
  },
  {
    key: 'oscars_grind',
    name: "Oscar's Grind",
    category: 'Options',
    contractType: 'DIGITOVER',
    tradeCategory: 'Digits',
    tradeSubtype: 'Over/Under',
    defaultFactor: '1.3',
    desc: 'Targets steady +1 unit net session profit while capping drawdown during cold runs.',
  },
  {
    key: '1_3_2_6',
    name: '1-3-2-6',
    category: 'Options',
    contractType: 'CALL',
    tradeCategory: 'Up/Down',
    tradeSubtype: 'Rise/Fall',
    defaultFactor: '1.5',
    desc: 'Structured 4-step positive progression cycle protecting early gains.',
  },
];

export function getAssignmentVal(
  assignments: RunOnceAssignment[],
  variable: string,
  fallback = ''
): string {
  return assignments.find((a) => a.variable === variable)?.value ?? fallback;
}

export function setAssignmentVal(
  assignments: RunOnceAssignment[],
  variable: string,
  value: string
): RunOnceAssignment[] {
  const idx = assignments.findIndex((a) => a.variable === variable);
  if (idx === -1) return [...assignments, { id: `a-${Date.now()}`, variable, value }];
  return assignments.map((a, i) => (i === idx ? { ...a, value } : a));
}

export function resolveSubtypeDef(category: TradeCategoryName, subtype: string): TradeSubtypeDef {
  return (
    TRADE_SUBTYPES.find((t) => t.category === category && t.subtype === subtype) ||
    TRADE_SUBTYPES.find((t) => t.category === category) ||
    TRADE_SUBTYPES[0]
  );
}

export function inferTradeCategoryFromContract(ct: string): {
  tradeCategory: TradeCategoryName;
  tradeSubtype: string;
} {
  const u = String(ct || '').toUpperCase();
  if (u === 'ACCU') return { tradeCategory: 'Accumulators', tradeSubtype: 'Accumulators' };
  if (u === 'MULTUP' || u === 'MULTDOWN') return { tradeCategory: 'Multipliers', tradeSubtype: 'Multipliers' };
  if (u === 'DIGITMATCH' || u === 'DIGITDIFF') return { tradeCategory: 'Digits', tradeSubtype: 'Matches/Differs' };
  if (u === 'DIGITEVEN' || u === 'DIGITODD') return { tradeCategory: 'Digits', tradeSubtype: 'Even/Odd' };
  if (u === 'DIGITOVER' || u === 'DIGITUNDER') return { tradeCategory: 'Digits', tradeSubtype: 'Over/Under' };
  if (u === 'HIGHER' || u === 'LOWER') return { tradeCategory: 'Up/Down', tradeSubtype: 'Higher/Lower' };
  if (u === 'ONETOUCH' || u === 'NOTOUCH' || u === 'TOUCH') return { tradeCategory: 'Touch/No Touch', tradeSubtype: 'Touch/No Touch' };
  if (u === 'EXPIRYRANGE' || u === 'EXPIRYMISS') return { tradeCategory: 'In/Out', tradeSubtype: 'In/Out' };
  if (u === 'ENDSIN' || u === 'ENDSOUT') return { tradeCategory: 'In/Out', tradeSubtype: 'Ends In/Out' };
  if (u === 'ASIANU' || u === 'ASIAND') return { tradeCategory: 'Asians', tradeSubtype: 'Asians' };
  if (u === 'RESETCALL' || u === 'RESETPUT') return { tradeCategory: 'Reset Call/Reset Put', tradeSubtype: 'Reset Call/Reset Put' };
  if (u === 'TICKHIGH' || u === 'TICKLOW') return { tradeCategory: 'High/Low Ticks', tradeSubtype: 'High/Low Ticks' };
  if (u === 'RUNHIGH' || u === 'RUNLOW') return { tradeCategory: 'Only Ups/Only Downs', tradeSubtype: 'Only Ups/Only Downs' };
  return { tradeCategory: 'Up/Down', tradeSubtype: 'Rise/Fall' };
}

export function inferMarketFromSymbol(sym: string): {
  market: BlockMarketName;
  submarket: string;
} {
  const normSym = sym.toUpperCase() === 'STPRNG' ? 'STPIDX' : sym;
  const found = BLOCK_SYMBOLS.find((s) => s.symbol.toUpperCase() === normSym.toUpperCase());
  if (found) return { market: found.market, submarket: found.submarket };
  if (sym.startsWith('frxX')) return { market: 'Commodities', submarket: 'Metals' };
  if (sym.startsWith('frxUSDTRY') || sym.startsWith('frxUSDZAR') || sym.startsWith('frxUSDMXN')) {
    return { market: 'Forex', submarket: 'Forex Exotic Pairs' };
  }
  if (sym.startsWith('frx')) return { market: 'Forex', submarket: 'Forex Major Pairs' };
  if (sym.startsWith('cry')) return { market: 'Cryptocurrencies', submarket: 'Crypto' };
  if (sym.startsWith('OTC_')) return { market: 'Stocks', submarket: 'Stock Indices' };
  if (['AAPL', 'AMZN', 'TSLA', 'MSFT'].includes(sym)) return { market: 'Stocks', submarket: 'US Stocks' };
  if (['BARC', 'BP', 'VOD'].includes(sym)) return { market: 'Stocks', submarket: 'UK Stocks' };
  if (['BMW', 'SIE', 'AIR'].includes(sym)) return { market: 'Stocks', submarket: 'European Stocks' };
  if (sym.startsWith('BOOM') || sym.startsWith('CRASH')) return { market: 'Derived', submarket: 'Crash/Boom Indices' };
  if (sym.startsWith('JD')) return { market: 'Derived', submarket: 'Jump Indices' };
  if (sym.startsWith('RB')) return { market: 'Derived', submarket: 'Range Break Indices' };
  if (sym.startsWith('STP')) return { market: 'Derived', submarket: 'Step Indices' };
  if (['WLDAUD', 'WLDEUR', 'WLDGBP', 'WLDUSD'].includes(sym)) return { market: 'Derived', submarket: 'Forex Basket' };
  if (['WLDXAU', 'WLDXAG', 'WLDCMP'].includes(sym)) return { market: 'Derived', submarket: 'Commodities Basket' };
  if (['USOUSD', 'NATGAS'].includes(sym)) return { market: 'Commodities', submarket: 'Energy' };
  if (['COFFEEUSD', 'COCOAUSD', 'COTTONUSD', 'SUGARUSD'].includes(sym)) return { market: 'Commodities', submarket: 'Soft Commodities' };
  return { market: 'Derived', submarket: 'Continuous Indices' };
}

function escapeXml(str: string): string {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function serializeBotWorkspaceXml(state: BotXmlWorkspaceState): string {
  const varSetXml = state.assignments
    .map(
      (a) =>
        `        <block type="variables_set">
          <field name="VAR">${escapeXml(a.variable)}</field>
          <value name="VALUE"><shadow type="math_number"><field name="NUM">${escapeXml(a.value)}</field></shadow></value>
        </block>`
    )
    .join('\n');

  const notifyItemsXml = state.notifyParts
    .map(
      (p, idx) =>
        `        <item name="ADD${idx}" kind="${escapeXml(p.kind)}">${escapeXml(p.value)}</item>`
    )
    .join('\n');

  const isAccu =
    state.tradeSubtype === 'Accumulators' ||
    state.contractTypeSelection.toUpperCase() === 'ACCU' ||
    state.thenPurchase.toUpperCase() === 'ACCU';

  const stakeVal = getAssignmentVal(state.assignments, 'initialStake', '1');
  const accuTpVal = state.accumulatorTakeProfit || getAssignmentVal(state.assignments, 'profitThreshold', '5');
  const includeDuring = Boolean(state.hasSellConditions || isAccu);

  const submarketXml = isAccu
    ? `    <statement name="SUBMARKET">
      <block type="trade_definition_accumulator">
        <field name="GROWTHRATE_LIST">${escapeXml(String(state.growthRate || 0.02))}</field>
        <value name="AMOUNT">
          <shadow type="math_number_positive"><field name="NUM">${escapeXml(stakeVal)}</field></shadow>
        </value>
        <statement name="ACCUMULATOR_PARAMS">
          <block type="accumulator_take_profit">
            <value name="AMOUNT">
              <shadow type="math_number"><field name="NUM">${escapeXml(accuTpVal)}</field></shadow>
            </value>
          </block>
        </statement>
      </block>
    </statement>`
    : `    <statement name="SUBMARKET">
      <block type="trade_definition_tradeoptions">
        <field name="DURATIONTYPE_LIST">${escapeXml(state.durationUnit)}</field>
        <field name="DURATION">${escapeXml(state.duration)}</field>
        <field name="PREDICTION">${escapeXml(state.prediction)}</field>
        <field name="AMOUNT">${escapeXml(stakeVal)}</field>
        <field name="GROWTHRATE">${escapeXml(String(state.growthRate))}</field>
      </block>
    </statement>`;

  const duringBlockXml = includeDuring
    ? `
  <block type="during_purchase" id="during_purchase_root" x="40" y="760">
    <statement name="DURING_PURCHASE_STACK">
      <block type="controls_if">
        <field name="SELL_BY_COUNTDOWN">${state.sellByCountdown ? 'TRUE' : 'FALSE'}</field>
        <field name="TICK_COUNT">${escapeXml(state.sellTickCount || '0')}</field>
        <statement name="DO0">
          <block type="sell_at_market" />
        </statement>
      </block>
    </statement>
  </block>`
    : '';

  return `<xml xmlns="https://developers.google.com/blockly/xml" is_dbot="true">
  <variables>
${BOT_VARIABLES.map((v) => `    <variable>${escapeXml(v)}</variable>`).join('\n')}
  </variables>
  <block type="trade_definition" id="trade_def_root" x="40" y="20">
    <field name="MARKET_LIST">${escapeXml(state.market)}</field>
    <field name="SUBMARKET_LIST">${escapeXml(state.submarket)}</field>
    <field name="SYMBOL_LIST">${escapeXml(state.symbol)}</field>
    <field name="TRADETYPECAT_LIST">${escapeXml(state.tradeCategory)}</field>
    <field name="TRADETYPE_LIST">${escapeXml(state.tradeSubtype)}</field>
    <field name="TYPE_LIST">${escapeXml(state.contractTypeSelection)}</field>
    <field name="CANDLEINTERVAL_LIST">${escapeXml(state.candleInterval)}</field>
    <field name="TIME_MACHINE_ENABLED">${state.restartBuySellOnError ? 'TRUE' : 'FALSE'}</field>
    <field name="RESTARTONERROR">${state.restartLastTradeOnError ? 'TRUE' : 'FALSE'}</field>
    <field name="MARTINGALE">${escapeXml(state.martingaleFactor)}</field>
    <field name="MAX_TRADES">${escapeXml(state.maxTrades)}</field>
    <statement name="INITIALIZATION">
${varSetXml}
    </statement>
${submarketXml}
  </block>
  <block type="before_purchase" id="before_purchase_root" x="40" y="420">
    <statement name="BEFOREPURCHASE_STACK">
      <block type="variables_set">
        <field name="VAR">${escapeXml(state.notifyVar)}</field>
        <mutation items="${state.notifyParts.length}">
${notifyItemsXml}
        </mutation>
      </block>
      <block type="notify">
        <field name="NOTIFICATION_TYPE">${escapeXml(state.notifyColor)}</field>
        <field name="NOTIFICATION_SOUND">${escapeXml(state.notifySound)}</field>
        <field name="MSG_VAR">${escapeXml(state.notifyVar)}</field>
      </block>
      <block type="controls_if">
        <field name="LEFT_VAR">${escapeXml(state.ifLeftVar)}</field>
        <field name="OP">${escapeXml(state.ifOperator)}</field>
        <field name="RIGHT_VAL">${escapeXml(state.ifCompareValue)}</field>
        <field name="THEN_PURCHASE">${escapeXml(state.thenPurchase)}</field>
        <field name="ELSE_ENABLED">${state.elseEnabled ? 'TRUE' : 'FALSE'}</field>
        <field name="ELSE_PURCHASE">${escapeXml(state.elsePurchase)}</field>
      </block>
    </statement>
  </block>${duringBlockXml}
  <block type="after_purchase" id="after_purchase_root" x="520" y="20">
    <statement name="AFTERPURCHASE_STACK">
      <block type="update_stake_and_side">
        <field name="CHECK_RESULT">${escapeXml(state.restartResultCheck)}</field>
      </block>
      <block type="controls_if">
        <field name="CONTRACT_DETAIL">${escapeXml(state.restartDetailField)}</field>
        <field name="ELSE_ENABLED">${state.restartElseEnabled ? 'TRUE' : 'FALSE'}</field>
        <statement name="DO0">
          <block type="trade_again" />
        </statement>
      </block>
    </statement>
  </block>
</xml>`;
}

function normalizeMarketName(raw?: string | null): BlockMarketName | undefined {
  if (!raw) return undefined;
  const low = raw.trim().toLowerCase();
  if (low === 'derived' || low === 'synthetic_index' || low === 'synthetics' || low === 'volidx' || low === 'basket_index') return 'Derived';
  if (low === 'forex' || low === 'fx') return 'Forex';
  if (low === 'stocks' || low === 'stock indices' || low === 'indices' || low === 'stock_indices') return 'Stocks';
  if (low === 'commodities' || low === 'commodity') return 'Commodities';
  if (low === 'cryptocurrencies' || low === 'cryptocurrency' || low === 'crypto') return 'Cryptocurrencies';
  const exact = BLOCK_MARKETS.find((m) => m.toLowerCase() === low);
  return exact;
}

function normalizeSubmarketName(raw?: string | null, market?: BlockMarketName): string | undefined {
  if (!raw) return undefined;
  const low = raw.trim().toLowerCase();
  const map: Record<string, string> = {
    random_index: 'Continuous Indices',
    continuous_indices: 'Continuous Indices',
    random_daily: 'Daily Reset Indices',
    daily_reset_indices: 'Daily Reset Indices',
    crash_index: 'Crash/Boom Indices',
    crash_boom: 'Crash/Boom Indices',
    jump_index: 'Jump Indices',
    range_break: 'Range Break Indices',
    forex_basket: 'Forex Basket',
    commodity_basket: 'Commodities Basket',
    step_index: 'Step Indices',
    major_pairs: 'Forex Major Pairs',
    'major pairs': 'Forex Major Pairs',
    minor_pairs: 'Forex Minor Pairs',
    'minor pairs': 'Forex Minor Pairs',
    exotic_pairs: 'Forex Exotic Pairs',
    'exotic pairs': 'Forex Exotic Pairs',
    us_stocks: 'US Stocks',
    uk_stocks: 'UK Stocks',
    eu_stocks: 'European Stocks',
    americas: 'Stock Indices',
    american_indices: 'Stock Indices',
    europe: 'Stock Indices',
    european_indices: 'Stock Indices',
    asia: 'Stock Indices',
    asian_indices: 'Stock Indices',
    metals: 'Metals',
    energy: 'Energy',
    soft_commodities: 'Soft Commodities',
    non_financial: 'Crypto',
    non_stable_coin: 'Crypto',
    cryptocurrencies: 'Crypto',
    crypto: 'Crypto',
  };
  if (map[low]) return map[low];
  if (market && BLOCK_SUBMARKETS[market]) {
    const matched = BLOCK_SUBMARKETS[market].find((s) => s.toLowerCase() === low);
    if (matched) return matched;
  }
  return raw.trim();
}

function normalizeCandleInterval(raw?: string | null): string | undefined {
  if (!raw) return undefined;
  const val = raw.trim().toLowerCase();
  const map: Record<string, string> = {
    '0': '1t',
    '1t': '1t',
    '60': '1m',
    '1m': '1m',
    '120': '2m',
    '2m': '2m',
    '180': '3m',
    '3m': '3m',
    '300': '5m',
    '5m': '5m',
    '600': '10m',
    '10m': '10m',
    '900': '15m',
    '15m': '15m',
    '1800': '30m',
    '30m': '30m',
    '3600': '1h',
    '1h': '1h',
  };
  return map[val] || (CANDLE_INTERVALS.some((c) => c.value === val) ? val : undefined);
}

function normalizeTradeTypeAndCategory(
  rawCat?: string | null,
  rawSub?: string | null,
  rawContract?: string | null
): { tradeCategory?: TradeCategoryName; tradeSubtype?: string } {
  const ct = String(rawContract || '').trim().toUpperCase();
  if (ct && ct !== 'BOTH') {
    return inferTradeCategoryFromContract(ct);
  }
  const sub = String(rawSub || '').trim().toLowerCase();
  if (sub.includes('match') || sub.includes('differ')) {
    return { tradeCategory: 'Digits', tradeSubtype: 'Matches/Differs' };
  }
  if (sub.includes('even') || sub.includes('odd')) {
    return { tradeCategory: 'Digits', tradeSubtype: 'Even/Odd' };
  }
  if (sub.includes('over') || sub.includes('under')) {
    return { tradeCategory: 'Digits', tradeSubtype: 'Over/Under' };
  }
  if (sub.includes('accu')) {
    return { tradeCategory: 'Accumulators', tradeSubtype: 'Accumulators' };
  }
  if (sub.includes('mult')) {
    return { tradeCategory: 'Multipliers', tradeSubtype: 'Multipliers' };
  }
  if (sub.includes('touch')) {
    return { tradeCategory: 'Touch/No Touch', tradeSubtype: 'Touch/No Touch' };
  }
  if (sub.includes('ends')) {
    return { tradeCategory: 'In/Out', tradeSubtype: 'Ends In/Out' };
  }
  if (sub.includes('in/out') || sub.includes('inout') || sub.includes('stays')) {
    return { tradeCategory: 'In/Out', tradeSubtype: 'In/Out' };
  }
  if (sub.includes('asian')) {
    return { tradeCategory: 'Asians', tradeSubtype: 'Asians' };
  }
  if (sub.includes('reset')) {
    return { tradeCategory: 'Reset Call/Reset Put', tradeSubtype: 'Reset Call/Reset Put' };
  }
  if (sub.includes('tick')) {
    return { tradeCategory: 'High/Low Ticks', tradeSubtype: 'High/Low Ticks' };
  }
  if (sub.includes('only')) {
    return { tradeCategory: 'Only Ups/Only Downs', tradeSubtype: 'Only Ups/Only Downs' };
  }
  if (sub.includes('higher') || sub.includes('lower')) {
    return { tradeCategory: 'Up/Down', tradeSubtype: 'Higher/Lower' };
  }
  if (sub.includes('rise') || sub.includes('fall') || sub.includes('callput')) {
    return { tradeCategory: 'Up/Down', tradeSubtype: 'Rise/Fall' };
  }
  const cat = String(rawCat || '').trim().toLowerCase();
  if (cat.includes('digit')) return { tradeCategory: 'Digits', tradeSubtype: 'Matches/Differs' };
  if (cat.includes('accu') || cat === 'options') return { tradeCategory: 'Accumulators', tradeSubtype: 'Accumulators' };
  if (cat.includes('mult')) return { tradeCategory: 'Multipliers', tradeSubtype: 'Multipliers' };
  if (cat.includes('touch')) return { tradeCategory: 'Touch/No Touch', tradeSubtype: 'Touch/No Touch' };
  if (cat.includes('in/out') || cat.includes('inout')) return { tradeCategory: 'In/Out', tradeSubtype: 'In/Out' };
  if (cat.includes('asian')) return { tradeCategory: 'Asians', tradeSubtype: 'Asians' };
  if (cat.includes('reset')) return { tradeCategory: 'Reset Call/Reset Put', tradeSubtype: 'Reset Call/Reset Put' };
  if (cat.includes('high/low')) return { tradeCategory: 'High/Low Ticks', tradeSubtype: 'High/Low Ticks' };
  if (cat.includes('only')) return { tradeCategory: 'Only Ups/Only Downs', tradeSubtype: 'Only Ups/Only Downs' };
  if (cat.includes('up') || cat.includes('callput')) return { tradeCategory: 'Up/Down', tradeSubtype: 'Rise/Fall' };
  return {};
}

export function parseBotWorkspaceXml(xmlText: string, baseState: BotXmlWorkspaceState): Partial<BotXmlWorkspaceState> {
  const rawInput = String(xmlText || '').trim();
  const normalizedRoot = /^<workspace\b/i.test(rawInput) && /<\/workspace>\s*$/i.test(rawInput)
    ? rawInput.replace(/^<workspace\b([^>]*)>/i, '<xml$1>').replace(/<\/workspace>\s*$/i, '</xml>')
    : rawInput;
  const xml = !normalizedRoot.toLowerCase().startsWith('<xml')
    ? `<xml xmlns="https://developers.google.com/blockly/xml" is_dbot="true">${normalizedRoot}</xml>`
    : normalizedRoot;
  const out: Partial<BotXmlWorkspaceState> = { rawImportedXml: rawInput };

  const parseWithRegexFallback = (): Partial<BotXmlWorkspaceState> => {
    const getField = (name: string): string | undefined => {
      const m = xml.match(new RegExp(`<field\\s+name=["']${name}["'][^>]*>([^<]+)<\\/field>`, 'i'));
      return m?.[1]?.trim();
    };
    const res: Partial<BotXmlWorkspaceState> = {};
    const symbol = getField('SYMBOL_LIST');
    if (symbol) {
      res.symbol = symbol;
      const inferred = inferMarketFromSymbol(symbol);
      res.market = normalizeMarketName(getField('MARKET_LIST')) || inferred.market;
      res.submarket = normalizeSubmarketName(getField('SUBMARKET_LIST'), res.market) || inferred.submarket;
    }
    const typeList = getField('TYPE_LIST') || getField('PURCHASE_LIST') || getField('THEN_PURCHASE');
    if (typeList) {
      const normType = typeList.toLowerCase() === 'both' ? 'Both' : typeList.toUpperCase();
      const inf = normalizeTradeTypeAndCategory(getField('TRADETYPECAT_LIST'), getField('TRADETYPE_LIST'), normType);
      if (inf.tradeCategory) res.tradeCategory = inf.tradeCategory;
      if (inf.tradeSubtype) res.tradeSubtype = inf.tradeSubtype;
      res.contractTypeSelection = normType;
      if (normType !== 'Both') res.thenPurchase = normType;
    }
    const dur = getField('DURATION');
    if (dur) res.duration = dur;
    const durUnit = getField('DURATIONTYPE_LIST') || getField('DURATION_TYPE');
    if (durUnit) res.durationUnit = durUnit;
    const pred = getField('PREDICTION');
    if (pred) res.prediction = pred;
    const gr = getField('GROWTHRATE_LIST') || getField('GROWTHRATE') || getField('GROWTH_RATE');
    if (gr && Number.isFinite(Number(gr))) {
      const n = Number(gr);
      res.growthRate = n > 0.1 ? Number((n / 100).toFixed(2)) : n;
    }
    const mart = getField('MARTINGALE');
    if (mart) res.martingaleFactor = mart;
    const candle = normalizeCandleInterval(getField('CANDLEINTERVAL_LIST'));
    if (candle) res.candleInterval = candle;
    if (/type=["']during_purchase["']/i.test(xml)) res.hasSellConditions = true;
    const qPredMatch = xml.match(/<prediction_id[^>]*>([^<]+)<\/prediction_id>/i);
    if (qPredMatch?.[1]?.trim()) res.quantumPredictionId = qPredMatch[1].trim();
    const qExpMatch = xml.match(/<expires_at[^>]*>([^<]+)<\/expires_at>/i);
    if (qExpMatch?.[1]?.trim()) res.quantumExpiresAt = qExpMatch[1].trim();
    return res;
  };

  if (typeof DOMParser === 'undefined') {
    return parseWithRegexFallback();
  }

  try {
    const doc = new DOMParser().parseFromString(xml, 'text/xml');
    if (!doc || doc.getElementsByTagName('parsererror').length > 0) {
      return parseWithRegexFallback();
    }

    // Build variable id -> variable name dictionary from <variables>
    const varIdToName = new Map<string, string>();
    const varEls = Array.from(doc.getElementsByTagName('variable'));
    for (const vEl of varEls) {
      const id = vEl.getAttribute('id');
      const name = (vEl.textContent || '').trim();
      if (id && name) varIdToName.set(id, name);
    }

    const getDirectFields = (el: Element): Map<string, string> => {
      const fields = new Map<string, string>();
      for (const child of Array.from(el.children)) {
        if (child.tagName.toLowerCase() === 'field') {
          const n = child.getAttribute('name');
          const t = (child.textContent || '').trim();
          if (n) fields.set(n.toUpperCase(), t);
        }
      }
      return fields;
    };

    const extractValueLiteral = (valEl: Element | null | undefined): string | undefined => {
      if (!valEl) return undefined;
      const children = Array.from(valEl.children).filter((c) => {
        const t = c.tagName.toLowerCase();
        return t === 'block' || t === 'shadow';
      });
      if (children.length === 0) return undefined;
      // Prefer explicit block over shadow when literal, else fall back to shadow (e.g. AMOUNT with shadow=1 + callreturn)
      const ordered = [
        ...children.filter((c) => c.tagName.toLowerCase() === 'block'),
        ...children.filter((c) => c.tagName.toLowerCase() === 'shadow'),
      ];
      for (const innerBlock of ordered) {
        const bType = (innerBlock.getAttribute('type') || '').toLowerCase();
        const fields = getDirectFields(innerBlock);
        if (bType === 'math_number' || bType === 'math_integer' || bType === 'math_positive_number') {
          const num = fields.get('NUM');
          if (num !== undefined && num !== '') return num;
        }
        if (bType === 'text') {
          const txt = fields.get('TEXT');
          if (txt !== undefined && txt !== '') return txt;
        }
        if (bType === 'logic_boolean') {
          const boolVal = fields.get('BOOL');
          if (boolVal !== undefined && boolVal !== '') return boolVal;
        }
      }
      return undefined;
    };

    const getDirectValues = (el: Element): Map<string, string> => {
      const vals = new Map<string, string>();
      for (const child of Array.from(el.children)) {
        if (child.tagName.toLowerCase() === 'value') {
          const n = child.getAttribute('name');
          const v = extractValueLiteral(child);
          if (n && v !== undefined) vals.set(n.toUpperCase(), v);
        }
      }
      return vals;
    };

    const allFieldValues = new Map<string, string>();
    for (const fEl of Array.from(doc.getElementsByTagName('field'))) {
      const n = fEl.getAttribute('name');
      const v = (fEl.textContent || '').trim();
      if (n && v && !allFieldValues.has(n.toUpperCase())) {
        allFieldValues.set(n.toUpperCase(), v);
      }
    }

    const blocks = Array.from(doc.getElementsByTagName('block'));
    const tradeDefBlock = blocks.find((b) => {
      const t = (b.getAttribute('type') || '').toLowerCase();
      return t === 'trade_definition' || t === 'trade';
    });

    // Collect fields across trade_definition & its trade_definition_* sub-blocks (excluding accumulator_take_profit)
    const tradeFields = new Map<string, string>();
    const tradeValues = new Map<string, string>();
    let accumulatorTakeProfitVal: string | undefined;

    for (const b of blocks) {
      const bType = (b.getAttribute('type') || '').toLowerCase();
      if (bType === 'accumulator_take_profit') {
        const tpAmt = getDirectValues(b).get('AMOUNT') || getDirectFields(b).get('AMOUNT');
        if (tpAmt && Number.isFinite(Number(tpAmt))) {
          accumulatorTakeProfitVal = tpAmt;
        }
        continue;
      }
      if (
        bType === 'trade_definition' ||
        bType === 'trade' ||
        bType.startsWith('trade_definition_') ||
        bType === 'tradeoptions'
      ) {
        getDirectFields(b).forEach((v, k) => {
          if (v !== '') tradeFields.set(k, v);
        });
        getDirectValues(b).forEach((v, k) => {
          if (v !== '') tradeValues.set(k, v);
        });
      }
    }

    const pickTradeParam = (...keys: string[]): string | undefined => {
      for (const k of keys) {
        const uk = k.toUpperCase();
        if (tradeValues.has(uk)) return tradeValues.get(uk);
        if (tradeFields.has(uk)) return tradeFields.get(uk);
        if (allFieldValues.has(uk)) return allFieldValues.get(uk);
      }
      return undefined;
    };

    const symbol = pickTradeParam('SYMBOL_LIST');
    if (symbol) {
      out.symbol = symbol;
      const inferred = inferMarketFromSymbol(symbol);
      out.market = normalizeMarketName(pickTradeParam('MARKET_LIST')) || inferred.market;
      out.submarket = normalizeSubmarketName(pickTradeParam('SUBMARKET_LIST'), out.market) || inferred.submarket;
    } else {
      const mkt = normalizeMarketName(pickTradeParam('MARKET_LIST'));
      if (mkt) out.market = mkt;
      const subMkt = normalizeSubmarketName(pickTradeParam('SUBMARKET_LIST'), out.market);
      if (subMkt) out.submarket = subMkt;
    }

    const rawTypeList = pickTradeParam('TYPE_LIST');
    const rawCat = pickTradeParam('TRADETYPECAT_LIST');
    const rawSub = pickTradeParam('TRADETYPE_LIST');
    const purchaseBlocks = blocks.filter((b) => (b.getAttribute('type') || '').toLowerCase() === 'purchase');
    const purchaseChoices = purchaseBlocks
      .map((pb) => getDirectFields(pb).get('PURCHASE_LIST')?.toUpperCase())
      .filter((x): x is string => Boolean(x));

    const normTypeList = rawTypeList
      ? rawTypeList.toLowerCase() === 'both'
        ? 'Both'
        : rawTypeList.toUpperCase()
      : purchaseChoices[0] || pickTradeParam('THEN_PURCHASE')?.toUpperCase();

    const inferredCatSub = normalizeTradeTypeAndCategory(
      rawCat,
      rawSub,
      normTypeList !== 'Both' ? normTypeList : purchaseChoices[0]
    );
    if (inferredCatSub.tradeCategory) out.tradeCategory = inferredCatSub.tradeCategory;
    if (inferredCatSub.tradeSubtype) out.tradeSubtype = inferredCatSub.tradeSubtype;

    const effCat = out.tradeCategory || baseState.tradeCategory;
    const effSub = out.tradeSubtype || baseState.tradeSubtype;
    const subtypeDef = resolveSubtypeDef(effCat, effSub);

    if (normTypeList) {
      out.contractTypeSelection = normTypeList === 'Both' ? 'Both' : normTypeList;
    }

    if (purchaseChoices.length > 0) {
      out.thenPurchase = purchaseChoices[0];
      out.elsePurchase =
        purchaseChoices[1] ||
        subtypeDef.legs.find((l) => l.value !== purchaseChoices[0])?.value ||
        purchaseChoices[0];
      out.elseEnabled = purchaseChoices.length > 1 || (Boolean(out.elsePurchase) && out.elsePurchase !== out.thenPurchase);
    } else if (normTypeList && normTypeList !== 'Both') {
      out.thenPurchase = normTypeList;
      out.elsePurchase = subtypeDef.legs.find((l) => l.value !== normTypeList)?.value || normTypeList;
    } else if (subtypeDef.legs.length > 0) {
      out.thenPurchase = pickTradeParam('THEN_PURCHASE')?.toUpperCase() || subtypeDef.legs[0].value;
      out.elsePurchase =
        pickTradeParam('ELSE_PURCHASE')?.toUpperCase() ||
        subtypeDef.legs[1]?.value ||
        subtypeDef.legs[0].value;
    }

    const candle = normalizeCandleInterval(pickTradeParam('CANDLEINTERVAL_LIST'));
    if (candle) out.candleInterval = candle;

    const timeMachine = pickTradeParam('TIME_MACHINE_ENABLED');
    if (timeMachine !== undefined) {
      out.restartBuySellOnError = ['true', '1', 'yes'].includes(timeMachine.toLowerCase());
    }
    const restartErr = pickTradeParam('RESTARTONERROR');
    if (restartErr !== undefined) {
      out.restartLastTradeOnError = ['true', '1', 'yes'].includes(restartErr.toLowerCase());
    }

    const dur = pickTradeParam('DURATION');
    if (dur && Number.isFinite(Number(dur))) out.duration = dur;

    const durUnit = pickTradeParam('DURATIONTYPE_LIST', 'DURATION_TYPE');
    if (durUnit && DURATION_UNITS.some((d) => d.value === durUnit.toLowerCase())) {
      out.durationUnit = durUnit.toLowerCase();
    }

    const pred = pickTradeParam('PREDICTION');
    if (pred && Number.isFinite(Number(pred))) out.prediction = pred;

    const grRaw = pickTradeParam('GROWTHRATE_LIST', 'GROWTHRATE', 'GROWTH_RATE');
    if (grRaw && Number.isFinite(Number(grRaw))) {
      const n = Number(grRaw);
      out.growthRate = n > 0.1 ? Number((n / 100).toFixed(2)) : n;
    }

    if (accumulatorTakeProfitVal) {
      out.accumulatorTakeProfit = accumulatorTakeProfitVal;
    }

    const mart = pickTradeParam('MARTINGALE');
    if (mart && Number.isFinite(Number(mart))) out.martingaleFactor = mart;

    const maxTr = pickTradeParam('MAX_TRADES');
    if (maxTr && Number.isFinite(Number(maxTr))) out.maxTrades = maxTr;

    // Parse initial variable assignments & initialization blocks
    let assignments: RunOnceAssignment[] = [];
    const seenVars = new Set<string>();
    const pushAssign = (variable: string, value: string) => {
      seenVars.add(variable);
      assignments = setAssignmentVal(assignments, variable, value);
    };

    const amt = tradeValues.get('AMOUNT') || tradeFields.get('AMOUNT') || pickTradeParam('STAKE');
    if (amt && Number.isFinite(Number(amt))) {
      pushAssign('initialStake', amt);
    }
    if (accumulatorTakeProfitVal) {
      pushAssign('profitThreshold', accumulatorTakeProfitVal);
    }
    const tp = pickTradeParam('TAKE_PROFIT');
    if (tp && Number.isFinite(Number(tp))) {
      pushAssign('profitThreshold', tp);
    }
    const sl = pickTradeParam('STOP_LOSS');
    if (sl && Number.isFinite(Number(sl))) {
      pushAssign('lossThreshold', sl);
    }

    const varAliasMap: Record<string, string> = {
      initialstake: 'initialStake',
      initial_stake: 'initialStake',
      'martingale:initialstake': 'initialStake',
      stake: 'initialStake',
      amount: 'initialStake',
      base_stake: 'initialStake',
      basestake: 'initialStake',
      winstep: 'winStep',
      win_step: 'winStep',
      maxwinsteps: 'maxWinSteps',
      max_win_steps: 'maxWinSteps',
      profitthreshold: 'profitThreshold',
      profit_threshold: 'profitThreshold',
      'martingale:profitthreshold': 'profitThreshold',
      takeprofit: 'profitThreshold',
      take_profit: 'profitThreshold',
      targetprofit: 'profitThreshold',
      target_profit: 'profitThreshold',
      lossthreshold: 'lossThreshold',
      loss_threshold: 'lossThreshold',
      'martingale:lossthreshold': 'lossThreshold',
      stoploss: 'lossThreshold',
      stop_loss: 'lossThreshold',
      maxloss: 'lossThreshold',
      max_loss: 'lossThreshold',
      tradeside: 'tradeSide',
      trade_side: 'tradeSide',
      maxstake: 'maxStake',
      max_stake: 'maxStake',
      'tick count': 'Tick Count',
      tick_count: 'Tick Count',
      selltickcount: 'Tick Count',
      winstreak: 'winStreak',
      lossstreak: 'lossStreak',
      totalprofit: 'totalProfit',
      lastprofit: 'lastProfit',
      resultiswin: 'resultIsWin',
    };

    // Prioritize INITIALIZATION variables_set blocks first, then other blocks without overwriting explicit INITIALIZATION values
    const initStatement = blocks
      .flatMap((b) => Array.from(b.children))
      .find((c) => c.tagName.toLowerCase() === 'statement' && c.getAttribute('name')?.toUpperCase() === 'INITIALIZATION');
    const initBlocks = initStatement ? Array.from(initStatement.getElementsByTagName('block')) : [];
    const otherVarSetBlocks = blocks.filter((b) => (b.getAttribute('type') || '').toLowerCase() === 'variables_set');
    const orderedVarSetBlocks = [
      ...initBlocks.filter((b) => (b.getAttribute('type') || '').toLowerCase() === 'variables_set'),
      ...otherVarSetBlocks.filter((b) => !initBlocks.includes(b)),
    ];

    for (const vs of orderedVarSetBlocks) {
      const isInitBlock = initBlocks.includes(vs);
      const varField = Array.from(vs.children).find(
        (c) => c.tagName.toLowerCase() === 'field' && c.getAttribute('name')?.toUpperCase() === 'VAR'
      );
      const varId = varField?.getAttribute('id');
      const rawName = (varId && varIdToName.get(varId)) || (varField?.textContent || '').trim();
      if (!rawName) continue;

      const valueChild = Array.from(vs.children).find(
        (c) => c.tagName.toLowerCase() === 'value' && c.getAttribute('name')?.toUpperCase() === 'VALUE'
      );
      const val = extractValueLiteral(valueChild);
      const lowName = rawName.toLowerCase();

      if (
        lowName === 'martingale' ||
        lowName === 'martingale_factor' ||
        lowName === 'martingalefactor' ||
        lowName === 'martingale:size' ||
        lowName === 'multiplier'
      ) {
        if (val && Number.isFinite(Number(val)) && !out.martingaleFactor) out.martingaleFactor = val;
        continue;
      }
      if (lowName === 'max_trades' || lowName === 'maxtrades') {
        if (val && Number.isFinite(Number(val)) && !out.maxTrades) out.maxTrades = val;
        continue;
      }
      if (lowName === 'max_losses' || lowName === 'maxlosses') {
        if (val && Number.isFinite(Number(val)) && !out.maxLosses) out.maxLosses = val;
        continue;
      }
      if (lowName === 'prediction' || lowName === 'barrier') {
        if (val && Number.isFinite(Number(val))) out.prediction = val;
        continue;
      }
      if (lowName.startsWith("sell by 'count down'") && val) {
        out.sellByCountdown = val.toUpperCase() === 'TRUE';
        continue;
      }

      const mappedVar = varAliasMap[lowName] || (BOT_VARIABLES.includes(rawName) ? rawName : undefined);
      if (mappedVar && val !== undefined) {
        if (mappedVar === 'maxStake' && Number.isFinite(Number(val))) out.maxStake = val;
        if (mappedVar === 'Tick Count' && Number.isFinite(Number(val))) out.sellTickCount = val;
        if (isInitBlock || !seenVars.has(mappedVar)) {
          pushAssign(mappedVar, val);
        }
      }

      // Check notify text_join mutation inside variables_set if present
      const mutation = Array.from(vs.children).find((c) => c.tagName.toLowerCase() === 'mutation');
      if (mutation) {
        const items = Array.from(mutation.children).filter((c) => c.tagName.toLowerCase() === 'item');
        if (items.length > 0) {
          out.notifyVar = rawName;
          out.notifyParts = items.map((it, idx) => ({
            id: `xml-p-${idx}`,
            kind: ((it.getAttribute('kind') as 'text' | 'var' | 'fn') || 'text'),
            value: (it.textContent || '').trim(),
          }));
        }
      }
    }

    // Extract text_join blocks inside before_purchase (as used in Contwin, DiffersScalper, MatchesScalper, DigitScalper, winloss)
    const beforeBlock = blocks.find((b) => (b.getAttribute('type') || '').toLowerCase() === 'before_purchase');
    if (beforeBlock) {
      const textJoinBlock = Array.from(beforeBlock.getElementsByTagName('block')).find(
        (b) => (b.getAttribute('type') || '').toLowerCase() === 'text_join'
      );
      if (textJoinBlock) {
        const varF = Array.from(textJoinBlock.children).find(
          (c) => c.tagName.toLowerCase() === 'field' && c.getAttribute('name')?.toUpperCase() === 'VARIABLE'
        );
        const varId = varF?.getAttribute('id');
        const vName = (varId && varIdToName.get(varId)) || (varF?.textContent || '').trim();
        if (vName) out.notifyVar = vName;
        const textStmts = Array.from(textJoinBlock.getElementsByTagName('block')).filter(
          (b) => (b.getAttribute('type') || '').toLowerCase() === 'text_statement'
        );
        if (textStmts.length > 0) {
          out.notifyParts = textStmts.map((stmt, idx) => {
            const valEl = Array.from(stmt.children).find(
              (c) => c.tagName.toLowerCase() === 'value' && c.getAttribute('name')?.toUpperCase() === 'TEXT'
            );
            const inner = valEl ? Array.from(valEl.children).find((c) => ['block', 'shadow'].includes(c.tagName.toLowerCase())) : undefined;
            const iType = (inner?.getAttribute('type') || '').toLowerCase();
            if (inner && iType === 'variables_get') {
              const vf = getDirectFields(inner).get('VAR') || '';
              return { id: `tj-${idx}`, kind: 'var' as const, value: vf };
            }
            if (inner && iType === 'procedures_callreturn') {
              const mut = Array.from(inner.children).find((c) => c.tagName.toLowerCase() === 'mutation');
              return { id: `tj-${idx}`, kind: 'fn' as const, value: mut?.getAttribute('name') || 'Get Next Stake' };
            }
            const literal = extractValueLiteral(valEl);
            return { id: `tj-${idx}`, kind: 'text' as const, value: literal ?? 'text' };
          });
        }
      }
    }

    // Backfill defaults from baseState only for core missing assignments when XML omitted them completely
    if (!seenVars.has('initialStake')) {
      pushAssign('initialStake', getAssignmentVal(baseState.assignments, 'initialStake', '1'));
    }
    if (!seenVars.has('profitThreshold')) {
      pushAssign('profitThreshold', accumulatorTakeProfitVal || getAssignmentVal(baseState.assignments, 'profitThreshold', '10'));
    }
    if (!seenVars.has('lossThreshold')) {
      pushAssign('lossThreshold', getAssignmentVal(baseState.assignments, 'lossThreshold', '6'));
    }
    const explicitSide = assignments.find((a) => a.variable === 'tradeSide')?.value;
    if (out.thenPurchase && (!explicitSide || explicitSide === baseState.thenPurchase)) {
      pushAssign('tradeSide', out.thenPurchase);
    } else if (!explicitSide) {
      pushAssign('tradeSide', out.thenPurchase || baseState.thenPurchase || 'CALL');
    }
    out.assignments = assignments;

    // Also pull multiplier factor from math_arithmetic MULTIPLY inside strategy.xml (e.g. 1.3) if not already set
    if (!out.martingaleFactor) {
      const multBlock = blocks.find(
        (b) =>
          (b.getAttribute('type') || '').toLowerCase() === 'math_arithmetic' &&
          getDirectFields(b).get('OP')?.toUpperCase() === 'MULTIPLY'
      );
      if (multBlock) {
        const bVal = getDirectValues(multBlock).get('B');
        if (bVal && Number.isFinite(Number(bVal)) && Number(bVal) > 1) {
          out.martingaleFactor = bVal;
        }
      }
    }

    // Parse before_purchase notify / controls_if blocks
    const notifyBlock = blocks.find((b) => (b.getAttribute('type') || '').toLowerCase() === 'notify');
    if (notifyBlock) {
      const nf = getDirectFields(notifyBlock);
      const nColor = nf.get('NOTIFICATION_TYPE')?.toLowerCase();
      if (nColor === 'blue' || nColor === 'green' || nColor === 'yellow' || nColor === 'red') {
        out.notifyColor = nColor;
      } else if (nColor === 'info') {
        out.notifyColor = 'blue';
      } else if (nColor === 'success') {
        out.notifyColor = 'green';
      } else if (nColor === 'warn') {
        out.notifyColor = 'yellow';
      } else if (nColor === 'error') {
        out.notifyColor = 'red';
      }
      const nSound = nf.get('NOTIFICATION_SOUND');
      if (
        nSound === 'Silent' ||
        nSound === 'Announcement' ||
        nSound === 'Earned money' ||
        nSound === 'Job done' ||
        nSound === 'Severe error'
      ) {
        out.notifySound = nSound;
      }
      const msgVar = nf.get('MSG_VAR');
      if (msgVar) out.notifyVar = msgVar;
    }

    if (beforeBlock) {
      const bpControlsIf = Array.from(beforeBlock.getElementsByTagName('block')).find(
        (b) => (b.getAttribute('type') || '').toLowerCase() === 'controls_if'
      );
      if (bpControlsIf) {
        const cf = getDirectFields(bpControlsIf);
        if (cf.get('LEFT_VAR')) out.ifLeftVar = cf.get('LEFT_VAR')!;
        const op = cf.get('OP')?.toUpperCase();
        if (op === 'EQ' || op === 'NEQ' || op === 'GT' || op === 'LT' || op === 'GTE' || op === 'LTE') {
          out.ifOperator = op;
        }
        if (cf.get('RIGHT_VAL')) out.ifCompareValue = cf.get('RIGHT_VAL')!;
        if (cf.get('THEN_PURCHASE')) out.thenPurchase = cf.get('THEN_PURCHASE')!.toUpperCase();
        if (cf.get('ELSE_ENABLED')) out.elseEnabled = cf.get('ELSE_ENABLED')!.toUpperCase() === 'TRUE';
        if (cf.get('ELSE_PURCHASE')) out.elsePurchase = cf.get('ELSE_PURCHASE')!.toUpperCase();
      }
    }

    // Parse during_purchase (3. Sell conditions)
    const duringBlock = blocks.find((b) => (b.getAttribute('type') || '').toLowerCase() === 'during_purchase');
    if (duringBlock) {
      out.hasSellConditions = true;
    }

    // Parse after_purchase restart settings & procedure call names
    const afterBlock = blocks.find((b) => (b.getAttribute('type') || '').toLowerCase() === 'after_purchase');
    if (afterBlock) {
      const procNoRet = Array.from(afterBlock.getElementsByTagName('block')).find(
        (b) => (b.getAttribute('type') || '').toLowerCase() === 'procedures_callnoreturn'
      );
      if (procNoRet) {
        const mut = Array.from(procNoRet.children).find((c) => c.tagName.toLowerCase() === 'mutation');
        const procName = mut?.getAttribute('name')?.trim();
        if (procName) out.updateProcedureName = procName;
      }
      const updBlock = Array.from(afterBlock.getElementsByTagName('block')).find(
        (b) => (b.getAttribute('type') || '').toLowerCase() === 'update_stake_and_side'
      );
      if (updBlock) {
        const cr = getDirectFields(updBlock).get('CHECK_RESULT')?.toLowerCase();
        if (cr === 'win' || cr === 'loss') out.restartResultCheck = cr;
      }
      const apIf = Array.from(afterBlock.getElementsByTagName('block')).find(
        (b) => (b.getAttribute('type') || '').toLowerCase() === 'controls_if'
      );
      if (apIf) {
        const af = getDirectFields(apIf);
        const det = af.get('CONTRACT_DETAIL')?.toLowerCase();
        if (det === 'profit' || det === 'payout' || det === 'buy_price') out.restartDetailField = det;
        if (af.get('ELSE_ENABLED')) out.restartElseEnabled = af.get('ELSE_ENABLED')!.toUpperCase() === 'TRUE';
      }
    }

    const qPredEl = doc.getElementsByTagName('prediction_id')[0];
    const qExpEl = doc.getElementsByTagName('expires_at')[0];
    if (qPredEl?.textContent?.trim()) {
      out.quantumPredictionId = qPredEl.textContent.trim();
      out.quantumExpiresAt = qExpEl?.textContent?.trim() || null;
    }

    // Collect top-level procedure blocks & custom strategy blocks so ANY DBot XML visualizes cleanly
    const importedGroups: ImportedProcedureGroup[] = [];
    const rootTopBlocks = Array.from(doc.documentElement.children).filter(
      (c) => c.tagName.toLowerCase() === 'block'
    );
    let procOffsetY = 0;
    for (const tb of rootTopBlocks) {
      const t = (tb.getAttribute('type') || '').toLowerCase();
      if (['trade_definition', 'trade', 'before_purchase', 'during_purchase', 'after_purchase'].includes(t)) {
        continue;
      }
      const procName = getDirectFields(tb).get('NAME') || t;
      const innerStmts = Array.from(tb.getElementsByTagName('block'))
        .slice(0, 6)
        .map((subB) => {
          const st = subB.getAttribute('type') || 'block';
          const sf = Array.from(subB.children)
            .filter((c) => c.tagName.toLowerCase() === 'field')
            .map((f) => `${f.getAttribute('name')}: ${(f.textContent || '').trim()}`)
            .filter(Boolean)
            .join(', ');
          return sf ? `${st} (${sf})` : st;
        });
      importedGroups.push({
        id: tb.getAttribute('id') || `proc-${importedGroups.length}`,
        title: procName,
        kind: t.startsWith('procedures_') ? 'procedure' : 'custom',
        lines: innerStmts.length > 0 ? innerStmts : [t],
        x: Number(tb.getAttribute('x')) || 520,
        y: Number(tb.getAttribute('y')) || 340 + procOffsetY,
      });
      procOffsetY += 110;
    }
    if (importedGroups.length > 0) {
      out.importedGroups = importedGroups;
    }

    void tradeDefBlock;
    return out;
  } catch {
    return parseWithRegexFallback();
  }
}
