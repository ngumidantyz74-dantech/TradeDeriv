export type BlockMarketName =
  | 'Derived'
  | 'Forex'
  | 'Stock Indices'
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
  'Stock Indices',
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
  Forex: ['Major Pairs', 'Minor Pairs'],
  'Stock Indices': ['American Indices', 'European Indices', 'Asian Indices'],
  Commodities: ['Metals', 'Energy'],
  Cryptocurrencies: ['Cryptocurrencies'],
};

export const BLOCK_SYMBOLS: SymbolCatalogItem[] = [
  // Continuous Indices
  { symbol: '1HZ100V', label: 'Volatility 100 (1s) Index', market: 'Derived', submarket: 'Continuous Indices' },
  { symbol: '1HZ75V', label: 'Volatility 75 (1s) Index', market: 'Derived', submarket: 'Continuous Indices' },
  { symbol: '1HZ50V', label: 'Volatility 50 (1s) Index', market: 'Derived', submarket: 'Continuous Indices' },
  { symbol: '1HZ25V', label: 'Volatility 25 (1s) Index', market: 'Derived', submarket: 'Continuous Indices' },
  { symbol: '1HZ10V', label: 'Volatility 10 (1s) Index', market: 'Derived', submarket: 'Continuous Indices' },
  { symbol: '1HZ15V', label: 'Volatility 15 (1s) Index', market: 'Derived', submarket: 'Continuous Indices' },
  { symbol: 'R_100', label: 'Volatility 100 Index', market: 'Derived', submarket: 'Continuous Indices' },
  { symbol: 'R_75', label: 'Volatility 75 Index', market: 'Derived', submarket: 'Continuous Indices' },
  { symbol: 'R_50', label: 'Volatility 50 Index', market: 'Derived', submarket: 'Continuous Indices' },
  { symbol: 'R_25', label: 'Volatility 25 Index', market: 'Derived', submarket: 'Continuous Indices' },
  { symbol: 'R_10', label: 'Volatility 10 Index', market: 'Derived', submarket: 'Continuous Indices' },
  // Crash/Boom Indices
  { symbol: 'BOOM1000', label: 'Boom 1000 Index', market: 'Derived', submarket: 'Crash/Boom Indices' },
  { symbol: 'BOOM500', label: 'Boom 500 Index', market: 'Derived', submarket: 'Crash/Boom Indices' },
  { symbol: 'BOOM300N', label: 'Boom 300 Index', market: 'Derived', submarket: 'Crash/Boom Indices' },
  { symbol: 'CRASH1000', label: 'Crash 1000 Index', market: 'Derived', submarket: 'Crash/Boom Indices' },
  { symbol: 'CRASH500', label: 'Crash 500 Index', market: 'Derived', submarket: 'Crash/Boom Indices' },
  { symbol: 'CRASH300N', label: 'Crash 300 Index', market: 'Derived', submarket: 'Crash/Boom Indices' },
  // Jump Indices
  { symbol: 'JD10', label: 'Jump 10 Index', market: 'Derived', submarket: 'Jump Indices' },
  { symbol: 'JD25', label: 'Jump 25 Index', market: 'Derived', submarket: 'Jump Indices' },
  { symbol: 'JD50', label: 'Jump 50 Index', market: 'Derived', submarket: 'Jump Indices' },
  { symbol: 'JD75', label: 'Jump 75 Index', market: 'Derived', submarket: 'Jump Indices' },
  { symbol: 'JD100', label: 'Jump 100 Index', market: 'Derived', submarket: 'Jump Indices' },
  // Range Break Indices
  { symbol: 'RDBULL', label: 'Bull Market Index', market: 'Derived', submarket: 'Range Break Indices' },
  { symbol: 'RDBEAR', label: 'Bear Market Index', market: 'Derived', submarket: 'Range Break Indices' },
  // Daily Reset Indices
  { symbol: 'RDBULL', label: 'Bull Market Reset Index', market: 'Derived', submarket: 'Daily Reset Indices' },
  { symbol: 'RDBEAR', label: 'Bear Market Reset Index', market: 'Derived', submarket: 'Daily Reset Indices' },
  // Forex Basket & Commodities Basket
  { symbol: 'WLDAUD', label: 'AUD Basket', market: 'Derived', submarket: 'Forex Basket' },
  { symbol: 'WLDEUR', label: 'EUR Basket', market: 'Derived', submarket: 'Forex Basket' },
  { symbol: 'WLDGBP', label: 'GBP Basket', market: 'Derived', submarket: 'Forex Basket' },
  { symbol: 'WLDUSD', label: 'USD Basket', market: 'Derived', submarket: 'Forex Basket' },
  { symbol: 'WLDXAU', label: 'Gold Basket', market: 'Derived', submarket: 'Commodities Basket' },
  // Step Indices
  { symbol: 'STPIDX', label: 'Step Index', market: 'Derived', submarket: 'Step Indices' },
  // Forex
  { symbol: 'frxEURUSD', label: 'EUR/USD', market: 'Forex', submarket: 'Major Pairs' },
  { symbol: 'frxGBPUSD', label: 'GBP/USD', market: 'Forex', submarket: 'Major Pairs' },
  { symbol: 'frxUSDJPY', label: 'USD/JPY', market: 'Forex', submarket: 'Major Pairs' },
  { symbol: 'frxAUDUSD', label: 'AUD/USD', market: 'Forex', submarket: 'Major Pairs' },
  { symbol: 'frxEURGBP', label: 'EUR/GBP', market: 'Forex', submarket: 'Minor Pairs' },
  // Stock Indices
  { symbol: 'OTC_DJI', label: 'Wall Street 30', market: 'Stock Indices', submarket: 'American Indices' },
  { symbol: 'OTC_NDX', label: 'US Tech 100', market: 'Stock Indices', submarket: 'American Indices' },
  { symbol: 'OTC_SPC', label: 'US 500', market: 'Stock Indices', submarket: 'American Indices' },
  { symbol: 'OTC_FTSE', label: 'UK 100', market: 'Stock Indices', submarket: 'European Indices' },
  { symbol: 'OTC_GDAXI', label: 'Germany 40', market: 'Stock Indices', submarket: 'European Indices' },
  { symbol: 'OTC_N225', label: 'Japan 225', market: 'Stock Indices', submarket: 'Asian Indices' },
  // Commodities
  { symbol: 'frxXAUUSD', label: 'Gold/USD', market: 'Commodities', submarket: 'Metals' },
  { symbol: 'frxXAGUSD', label: 'Silver/USD', market: 'Commodities', submarket: 'Metals' },
  // Cryptocurrencies
  { symbol: 'cryBTCUSD', label: 'BTC/USD', market: 'Cryptocurrencies', submarket: 'Cryptocurrencies' },
  { symbol: 'cryETHUSD', label: 'ETH/USD', market: 'Cryptocurrencies', submarket: 'Cryptocurrencies' },
];

export type TradeCategoryName = 'Up/Down' | 'Digits' | 'Options' | 'Multipliers';

export interface TradeSubtypeDef {
  category: TradeCategoryName;
  subtype: string;
  legs: Array<{ value: string; label: string }>;
  usesPrediction: boolean;
  isAccu?: boolean;
}

export const TRADE_SUBTYPES: TradeSubtypeDef[] = [
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
    category: 'Options',
    subtype: 'Accumulators',
    legs: [
      { value: 'ACCU', label: 'Accumulators' },
      { value: 'ACCU', label: 'Growth' },
    ],
    usesPrediction: false,
    isAccu: true,
  },
  {
    category: 'Multipliers',
    subtype: 'Up/Down',
    legs: [
      { value: 'MULTUP', label: 'Up' },
      { value: 'MULTDOWN', label: 'Down' },
    ],
    usesPrediction: false,
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
  'msgInfo',
  'msgProfit',
  'nextStake',
  'profitThreshold',
  'resultIsWin',
  'totalProfit',
  'tradeSide',
  'winStep',
  'winStreak',
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
  martingaleFactor: string;
  maxTrades: string;
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
    tradeCategory: 'Options',
    tradeSubtype: 'Accumulators',
    defaultFactor: '2.0',
    desc: 'Doubles accumulator stake after a barrier knockout and resets on take-profit target.',
  },
  {
    key: 'accu_martingale_stat_reset',
    name: 'Martingale on Stat Reset',
    category: 'Accumulators',
    contractType: 'ACCU',
    tradeCategory: 'Options',
    tradeSubtype: 'Accumulators',
    defaultFactor: '2.0',
    desc: 'Compounds accumulator targets and scales stake following statistical barrier resets.',
  },
  {
    key: 'accu_dalembert',
    name: "D'Alembert",
    category: 'Accumulators',
    contractType: 'ACCU',
    tradeCategory: 'Options',
    tradeSubtype: 'Accumulators',
    defaultFactor: '1.25',
    desc: 'Steps accumulator stake up linearly by initial unit after a knockout and steps down on win.',
  },
  {
    key: 'accu_dalembert_stat_reset',
    name: "D'Alembert on Stat Reset",
    category: 'Accumulators',
    contractType: 'ACCU',
    tradeCategory: 'Options',
    tradeSubtype: 'Accumulators',
    defaultFactor: '1.25',
    desc: 'Measured linear recovery progression synced to accumulator range statistical resets.',
  },
  {
    key: 'accu_reverse_martingale',
    name: 'Reverse Martingale',
    category: 'Accumulators',
    contractType: 'ACCU',
    tradeCategory: 'Options',
    tradeSubtype: 'Accumulators',
    defaultFactor: '1.6',
    desc: 'Scales stake during winning accumulator runs to press profitable momentum.',
  },
  {
    key: 'accu_reverse_martingale_stat_reset',
    name: 'Reverse Martingale on Stat Reset',
    category: 'Accumulators',
    contractType: 'ACCU',
    tradeCategory: 'Options',
    tradeSubtype: 'Accumulators',
    defaultFactor: '1.6',
    desc: 'Positive progression on accumulator wins that resets safely after statistical stat cycles.',
  },
  {
    key: 'accu_reverse_dalembert',
    name: "Reverse D'Alembert",
    category: 'Accumulators',
    contractType: 'ACCU',
    tradeCategory: 'Options',
    tradeSubtype: 'Accumulators',
    defaultFactor: '1.2',
    desc: 'Adds one stake unit per consecutive accumulator win and resets on knockout.',
  },
  {
    key: 'accu_reverse_dalembert_stat_reset',
    name: "Reverse D'Alembert on Stat Reset",
    category: 'Accumulators',
    contractType: 'ACCU',
    tradeCategory: 'Options',
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
  if (u === 'ACCU') return { tradeCategory: 'Options', tradeSubtype: 'Accumulators' };
  if (u === 'MULTUP' || u === 'MULTDOWN') return { tradeCategory: 'Multipliers', tradeSubtype: 'Up/Down' };
  if (u === 'DIGITMATCH' || u === 'DIGITDIFF') return { tradeCategory: 'Digits', tradeSubtype: 'Matches/Differs' };
  if (u === 'DIGITEVEN' || u === 'DIGITODD') return { tradeCategory: 'Digits', tradeSubtype: 'Even/Odd' };
  if (u === 'DIGITOVER' || u === 'DIGITUNDER') return { tradeCategory: 'Digits', tradeSubtype: 'Over/Under' };
  return { tradeCategory: 'Up/Down', tradeSubtype: 'Rise/Fall' };
}

export function inferMarketFromSymbol(sym: string): {
  market: BlockMarketName;
  submarket: string;
} {
  const found = BLOCK_SYMBOLS.find((s) => s.symbol === sym);
  if (found) return { market: found.market, submarket: found.submarket };
  if (sym.startsWith('frxX')) return { market: 'Commodities', submarket: 'Metals' };
  if (sym.startsWith('frx')) return { market: 'Forex', submarket: 'Major Pairs' };
  if (sym.startsWith('cry')) return { market: 'Cryptocurrencies', submarket: 'Cryptocurrencies' };
  if (sym.startsWith('OTC_')) return { market: 'Stock Indices', submarket: 'American Indices' };
  if (sym.startsWith('BOOM') || sym.startsWith('CRASH')) return { market: 'Derived', submarket: 'Crash/Boom Indices' };
  if (sym.startsWith('JD')) return { market: 'Derived', submarket: 'Jump Indices' };
  if (sym.startsWith('STP')) return { market: 'Derived', submarket: 'Step Indices' };
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
    <statement name="SUBMARKET">
      <block type="trade_definition_tradeoptions">
        <field name="DURATIONTYPE_LIST">${escapeXml(state.durationUnit)}</field>
        <field name="DURATION">${escapeXml(state.duration)}</field>
        <field name="PREDICTION">${escapeXml(state.prediction)}</field>
        <field name="AMOUNT">${escapeXml(getAssignmentVal(state.assignments, 'initialStake', '1'))}</field>
        <field name="GROWTHRATE">${escapeXml(String(state.growthRate))}</field>
      </block>
    </statement>
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
  </block>
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

export function parseBotWorkspaceXml(xmlText: string, baseState: BotXmlWorkspaceState): Partial<BotXmlWorkspaceState> {
  const xml = String(xmlText || '');
  const getField = (name: string): string | undefined => {
    const m = xml.match(new RegExp(`<field\\s+name=["']${name}["'][^>]*>([^<]+)<\\/field>`, 'i'));
    return m?.[1]?.trim();
  };

  const out: Partial<BotXmlWorkspaceState> = {};
  const symbol = getField('SYMBOL_LIST');
  if (symbol) {
    out.symbol = symbol;
    const inferred = inferMarketFromSymbol(symbol);
    out.market = (getField('MARKET_LIST') as BlockMarketName) || inferred.market;
    out.submarket = getField('SUBMARKET_LIST') || inferred.submarket;
  }

  const typeList = getField('TYPE_LIST') || getField('PURCHASE_LIST') || getField('THEN_PURCHASE');
  if (typeList) {
    if (typeList !== 'Both') {
      const inf = inferTradeCategoryFromContract(typeList);
      out.tradeCategory = (getField('TRADETYPECAT_LIST') as TradeCategoryName) || inf.tradeCategory;
      out.tradeSubtype = getField('TRADETYPE_LIST') || inf.tradeSubtype;
      out.thenPurchase = typeList;
      out.contractTypeSelection = typeList;
    } else {
      const cat = getField('TRADETYPECAT_LIST') as TradeCategoryName | undefined;
      const sub = getField('TRADETYPE_LIST');
      if (cat) out.tradeCategory = cat;
      if (sub) out.tradeSubtype = sub;
      out.contractTypeSelection = 'Both';
    }
  }

  const dur = getField('DURATION');
  if (dur) out.duration = dur;
  const durUnit = getField('DURATIONTYPE_LIST') || getField('DURATION_TYPE');
  if (durUnit) out.durationUnit = durUnit;
  const pred = getField('PREDICTION');
  if (pred) out.prediction = pred;
  const mart = getField('MARTINGALE');
  if (mart) out.martingaleFactor = mart;
  const candle = getField('CANDLEINTERVAL_LIST');
  if (candle) out.candleInterval = candle;

  let assignments = [...baseState.assignments];
  const amt = getField('AMOUNT');
  if (amt) assignments = setAssignmentVal(assignments, 'initialStake', amt);
  const tp = getField('TAKE_PROFIT');
  if (tp) assignments = setAssignmentVal(assignments, 'profitThreshold', tp);
  const sl = getField('STOP_LOSS');
  if (sl) assignments = setAssignmentVal(assignments, 'lossThreshold', sl);

  // Also parse <block type="variables_set"> tags
  const varSetRegex =
    /<block\s+type=["']variables_set["'][^>]*>[\s\S]*?<field\s+name=["']VAR["'][^>]*>([^<]+)<\/field>[\s\S]*?<field\s+name=["'](?:NUM|TEXT|VAR)["'][^>]*>([^<]+)<\/field>/gi;
  let m: RegExpExecArray | null;
  while ((m = varSetRegex.exec(xml)) !== null) {
    const varName = m[1].trim();
    const val = m[2].trim();
    if (assignments.some((a) => a.variable === varName)) {
      assignments = setAssignmentVal(assignments, varName, val);
    }
  }
  out.assignments = assignments;

  const gr = getField('GROWTHRATE');
  if (gr && Number.isFinite(Number(gr))) out.growthRate = Number(gr);

  return out;
}
