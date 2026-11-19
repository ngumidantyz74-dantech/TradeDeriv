export interface OhlcCandle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  tick_volume?: number;
}

export interface IndicatorSuite {
  ema9: Array<number | null>;
  ema20: Array<number | null>;
  ema50: Array<number | null>;
  ema200: Array<number | null>;
  sma20: Array<number | null>;
  sma50: Array<number | null>;
  rsi14: Array<number | null>;
  macd: {
    line: Array<number | null>;
    signal: Array<number | null>;
    histogram: Array<number | null>;
  };
  bollinger: {
    upper: Array<number | null>;
    middle: Array<number | null>;
    lower: Array<number | null>;
    bandwidth: Array<number | null>;
    percentB: Array<number | null>;
  };
  stochastic: {
    k: Array<number | null>;
    d: Array<number | null>;
  };
  atr14: Array<number | null>;
  adx14: {
    adx: Array<number | null>;
    plusDi: Array<number | null>;
    minusDi: Array<number | null>;
  };
  vwap: {
    available: boolean;
    reason?: string;
    values: Array<number | null>;
  };
  psar: {
    values: Array<number | null>;
    trend: Array<'bullish' | 'bearish' | null>;
  };
}

export interface SwingPivot {
  index: number;
  time: number;
  price: number;
  kind: 'high' | 'low';
  label: 'HH' | 'HL' | 'LH' | 'LL' | 'H' | 'L';
}

export interface StructureEvent {
  type: 'BOS' | 'CHoCH';
  direction: 'bullish' | 'bearish';
  index: number;
  time: number;
  price: number;
  description: string;
}

export interface SmcZone {
  id: string;
  kind: 'order_block' | 'supply' | 'demand' | 'fvg';
  bias: 'bullish' | 'bearish';
  top: number;
  bottom: number;
  timeStart: number;
  timeEnd: number;
  mitigated: boolean;
  label: string;
}

export interface LiquidityEvent {
  kind: 'BSL_SWEEP' | 'SSL_SWEEP' | 'EQH' | 'EQL';
  price: number;
  time: number;
  index: number;
  description: string;
}

export interface SmcAnalysis {
  bias: 'bullish' | 'bearish' | 'neutral';
  swings: SwingPivot[];
  structureEvents: StructureEvent[];
  zones: SmcZone[];
  supportLevels: number[];
  resistanceLevels: number[];
  liquidityEvents: LiquidityEvent[];
  dealingRange: {
    high: number;
    low: number;
    equilibrium: number;
    currentPct: number;
    zone: 'Premium' | 'Discount' | 'Equilibrium';
  };
  displacementCount: number;
  summary: string[];
}

export type BuyLowSellHighRegime =
  | 'CHEAP_OVERSOLD'
  | 'BULLISH_REVERSAL_CONFIRMATION'
  | 'BEARISH_CONTINUATION'
  | 'OVERBOUGHT_EXTENDED'
  | 'BEARISH_REVERSAL_CONFIRMATION'
  | 'BULLISH_CONTINUATION'
  | 'NEUTRAL_RANGE';

export interface BuyLowSellHighResult {
  action: 'BUY_LOW_CANDIDATE' | 'SELL_HIGH_CANDIDATE' | 'WAIT_AVOID_KNIFE' | 'NEUTRAL';
  regime: BuyLowSellHighRegime;
  regimeLabel: string;
  confidenceScore: number; // 0-100 rule-based score, NOT a profit guarantee
  rangePercentile: number; // 0-100
  rsi14: number | null;
  rsiDivergence: 'bullish' | 'bearish' | 'none';
  entryZone: [number, number] | null;
  stopLoss: number | null;
  takeProfit: number | null;
  riskReward: number | null;
  invalidationPrice: number | null;
  reasoning: string[];
  disclaimer: string;
}

export interface StrategySetup {
  strategyKey: StrategyKey;
  strategyName: string;
  direction: 'BUY' | 'SELL';
  setupType: string;
  entryZone: [number, number];
  stopLoss: number;
  takeProfit: number;
  riskReward: number;
  confidenceScore: number;
  timeframe: string;
  indicatorsUsed: string[];
  marketStructureNote: string;
  reasoning: string[];
  timestamp: number;
  validUntil: number;
  status: 'active' | 'watch';
}

export type StrategyKey =
  | 'trend_following'
  | 'rsi_reversal'
  | 'ema_crossover'
  | 'macd_momentum'
  | 'bollinger_reversion'
  | 'breakout_trading'
  | 'sr_reversal'
  | 'mtf_confluence'
  | 'smc_liquidity'
  | 'buy_low_sell_high';

export interface StrategyDefinition {
  key: StrategyKey;
  name: string;
  category: 'Trend' | 'Mean Reversion' | 'Breakout' | 'Smart Money' | 'Multi-Factor';
  summary: string;
  rules: string[];
  supportedMarkets: string[];
  recommendedTimeframes: string[];
  defaultConfig: {
    stake: number;
    stopLossAtrMult: number;
    takeProfitRr: number;
    adxThreshold: number;
    rsiOversold: number;
    rsiOverbought: number;
    emaFast: number;
    emaSlow: number;
  };
}

export const STRATEGY_CATALOG: StrategyDefinition[] = [
  {
    key: 'trend_following',
    name: 'Institutional Trend Following',
    category: 'Trend',
    summary: 'Aligns with directional expansion when ADX confirms trend strength and fast/slow EMAs fan cleanly.',
    rules: [
      'ADX(14) > threshold confirming directional strength',
      'EMA20 above EMA50 (long) or below EMA50 (short)',
      'Price pullback closes back in trend direction relative to EMA9',
    ],
    supportedMarkets: ['Synthetics (Volatility, Step)', 'Forex Majors', 'Gold & Indices'],
    recommendedTimeframes: ['5m', '15m', '1h', '4h'],
    defaultConfig: { stake: 2, stopLossAtrMult: 1.2, takeProfitRr: 3.0, adxThreshold: 22, rsiOversold: 30, rsiOverbought: 70, emaFast: 9, emaSlow: 21 },
  },
  {
    key: 'rsi_reversal',
    name: 'RSI Exhaustion Reversal',
    category: 'Mean Reversion',
    summary: 'Captures mean-reversion turns only after RSI exits extreme thresholds with candlestick confirmation.',
    rules: [
      'RSI(14) crosses back above oversold (<30) or below overbought (>70)',
      'Candle closes against prior bar extreme (confirmation hook)',
      'ATR-scaled stop outside swing extreme',
    ],
    supportedMarkets: ['Synthetics', 'Forex', 'Crypto'],
    recommendedTimeframes: ['5m', '15m', '1h'],
    defaultConfig: { stake: 2, stopLossAtrMult: 1.2, takeProfitRr: 2.5, adxThreshold: 20, rsiOversold: 30, rsiOverbought: 70, emaFast: 9, emaSlow: 21 },
  },
  {
    key: 'ema_crossover',
    name: 'Dynamic EMA Crossover',
    category: 'Trend',
    summary: 'Executes systematic fast/slow exponential moving average crossovers filtered by ATR volatility.',
    rules: [
      'Fast EMA crosses Slow EMA on candle close',
      'MACD histogram confirms directional slope',
      'Fixed ATR stop-loss and R:R target',
    ],
    supportedMarkets: ['All Deriv Markets'],
    recommendedTimeframes: ['1m', '5m', '15m', '1h'],
    defaultConfig: { stake: 2, stopLossAtrMult: 1.2, takeProfitRr: 3.0, adxThreshold: 18, rsiOversold: 30, rsiOverbought: 70, emaFast: 9, emaSlow: 21 },
  },
  {
    key: 'macd_momentum',
    name: 'MACD Impulse & Histogram Shift',
    category: 'Trend',
    summary: 'Tracks momentum acceleration via MACD line/signal crossovers and zero-line histogram expansion.',
    rules: [
      'MACD line crosses Signal line',
      'Histogram expands in trade direction for 2 consecutive bars',
      'EMA50 directional filter',
    ],
    supportedMarkets: ['Crypto', 'Indices', 'Volatility Indices'],
    recommendedTimeframes: ['15m', '30m', '1h', '4h'],
    defaultConfig: { stake: 2, stopLossAtrMult: 1.2, takeProfitRr: 3.0, adxThreshold: 20, rsiOversold: 30, rsiOverbought: 70, emaFast: 12, emaSlow: 26 },
  },
  {
    key: 'bollinger_reversion',
    name: 'Bollinger Band Snapback',
    category: 'Mean Reversion',
    summary: 'Fades statistically stretched closes outside 2-sigma Bollinger Bands back toward the 20-SMA mean.',
    rules: [
      'Prior bar pierced or closed outside upper/lower Bollinger Band',
      'Current candle closes back inside the band with Stochastic turn',
      'Target at middle band / opposite inner band',
    ],
    supportedMarkets: ['Range-bound Forex', 'Range Break', 'Volatility 10/25'],
    recommendedTimeframes: ['5m', '15m', '30m'],
    defaultConfig: { stake: 2, stopLossAtrMult: 1.1, takeProfitRr: 2.5, adxThreshold: 25, rsiOversold: 32, rsiOverbought: 68, emaFast: 9, emaSlow: 20 },
  },
  {
    key: 'breakout_trading',
    name: 'Volatility Range Breakout',
    category: 'Breakout',
    summary: 'Trades structural 20-bar high/low breakouts when ATR expands above its rolling average.',
    rules: [
      'Close breaks above 20-bar highest high or below 20-bar lowest low',
      'Bar range > 1.1x ATR(14) confirming expansion',
      'Avoids low-volatility false breaks',
    ],
    supportedMarkets: ['Gold (XAU/USD)', 'BTC/USD', 'V75 / V100'],
    recommendedTimeframes: ['5m', '15m', '1h'],
    defaultConfig: { stake: 2, stopLossAtrMult: 1.2, takeProfitRr: 3.0, adxThreshold: 20, rsiOversold: 30, rsiOverbought: 70, emaFast: 9, emaSlow: 21 },
  },
  {
    key: 'sr_reversal',
    name: 'Key S/R Rejection Model',
    category: 'Mean Reversion',
    summary: 'Identifies high-wick rejections right at historical clustered support & resistance zones.',
    rules: [
      'Price tests prior clustered swing support or resistance within 0.35 ATR',
      'Rejection wick exceeds body size',
      'RSI not continuing violently against trade',
    ],
    supportedMarkets: ['Forex', 'Metals', 'Synthetics'],
    recommendedTimeframes: ['15m', '1h', '4h'],
    defaultConfig: { stake: 2, stopLossAtrMult: 1.1, takeProfitRr: 2.8, adxThreshold: 22, rsiOversold: 35, rsiOverbought: 65, emaFast: 9, emaSlow: 21 },
  },
  {
    key: 'mtf_confluence',
    name: 'Multi-Timeframe Confluence',
    category: 'Multi-Factor',
    summary: 'Synthesizes macro higher-period EMA50/200 trend with lower-period Stochastic/RSI pullback timing.',
    rules: [
      'Macro trend aligned (Close vs EMA50 & EMA200 proxy)',
      'Short-term pullback resets Stochastic %K < 35 (bullish) or > 65 (bearish)',
      'Trigger when %K crosses %D back with macro flow',
    ],
    supportedMarkets: ['All Markets'],
    recommendedTimeframes: ['5m', '15m', '1h'],
    defaultConfig: { stake: 2, stopLossAtrMult: 1.2, takeProfitRr: 3.0, adxThreshold: 20, rsiOversold: 35, rsiOverbought: 65, emaFast: 9, emaSlow: 50 },
  },
  {
    key: 'smc_liquidity',
    name: 'Smart Money BOS + OB/FVG',
    category: 'Smart Money',
    summary: 'Follows Break of Structure / CHoCH and enters on retests into Discount/Premium Order Blocks or FVGs.',
    rules: [
      'Recent bullish/bearish BOS or CHoCH confirmed',
      'Price enters Discount (<50%) for longs or Premium (>50%) for shorts',
      'Candle reacts off unmitigated FVG or Order Block',
    ],
    supportedMarkets: ['EUR/USD', 'XAU/USD', 'V75 (1s)', 'BTC/USD'],
    recommendedTimeframes: ['5m', '15m', '1h'],
    defaultConfig: { stake: 2, stopLossAtrMult: 1.2, takeProfitRr: 3.0, adxThreshold: 18, rsiOversold: 35, rsiOverbought: 65, emaFast: 9, emaSlow: 21 },
  },
  {
    key: 'buy_low_sell_high',
    name: 'Buy Low / Sell High Intelligence',
    category: 'Multi-Factor',
    summary: 'Combines dealing-range extremes, RSI divergence, and reversal confirmation while filtering falling knives.',
    rules: [
      'Price in bottom 25% (Buy Low) or top 25% (Sell High) of swing range',
      'Bullish/Bearish divergence or Stochastic/MACD momentum inflection',
      'Blocks counter-trend entry during strong continuation ADX impulse',
    ],
    supportedMarkets: ['All Markets'],
    recommendedTimeframes: ['15m', '1h', '4h'],
    defaultConfig: { stake: 2, stopLossAtrMult: 1.1, takeProfitRr: 3.0, adxThreshold: 28, rsiOversold: 32, rsiOverbought: 68, emaFast: 9, emaSlow: 21 },
  },
];

export function computeSMA(values: number[], period: number): Array<number | null> {
  const out: Array<number | null> = new Array(values.length).fill(null);
  if (period <= 0 || values.length < period) return out;
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

export function computeEMA(values: number[], period: number): Array<number | null> {
  const out: Array<number | null> = new Array(values.length).fill(null);
  if (period <= 0 || values.length < period) return out;
  const k = 2 / (period + 1);
  let seed = 0;
  for (let i = 0; i < period; i++) seed += values[i];
  let prev = seed / period;
  out[period - 1] = prev;
  for (let i = period; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

function computeNullableEMA(values: Array<number | null>, period: number): Array<number | null> {
  const out: Array<number | null> = new Array(values.length).fill(null);
  const validIndices: number[] = [];
  const validValues: number[] = [];
  for (let i = 0; i < values.length; i++) {
    if (values[i] !== null && !Number.isNaN(values[i])) {
      validIndices.push(i);
      validValues.push(values[i] as number);
    }
  }
  const ema = computeEMA(validValues, period);
  for (let j = 0; j < validIndices.length; j++) {
    out[validIndices[j]] = ema[j];
  }
  return out;
}

export function computeRSI(closes: number[], period = 14): Array<number | null> {
  const out: Array<number | null> = new Array(closes.length).fill(null);
  if (closes.length <= period) return out;
  let gainSum = 0;
  let lossSum = 0;
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gainSum += diff;
    else lossSum += Math.abs(diff);
  }
  let avgGain = gainSum / period;
  let avgLoss = lossSum / period;
  out[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);

  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? Math.abs(diff) : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return out;
}

export function computeATR(candles: OhlcCandle[], period = 14): Array<number | null> {
  const out: Array<number | null> = new Array(candles.length).fill(null);
  if (candles.length <= period) return out;
  const trs: number[] = [candles[0].high - candles[0].low];
  for (let i = 1; i < candles.length; i++) {
    const c = candles[i];
    const prevClose = candles[i - 1].close;
    const tr = Math.max(c.high - c.low, Math.abs(c.high - prevClose), Math.abs(c.low - prevClose));
    trs.push(tr);
  }
  let sum = 0;
  for (let i = 1; i <= period; i++) sum += trs[i];
  let atr = sum / period;
  out[period] = atr;
  for (let i = period + 1; i < candles.length; i++) {
    atr = (atr * (period - 1) + trs[i]) / period;
    out[i] = atr;
  }
  return out;
}

export function computeADX(
  candles: OhlcCandle[],
  period = 14
): { adx: Array<number | null>; plusDi: Array<number | null>; minusDi: Array<number | null> } {
  const len = candles.length;
  const adx: Array<number | null> = new Array(len).fill(null);
  const plusDi: Array<number | null> = new Array(len).fill(null);
  const minusDi: Array<number | null> = new Array(len).fill(null);
  if (len <= period * 2) return { adx, plusDi, minusDi };

  const tr: number[] = new Array(len).fill(0);
  const plusDm: number[] = new Array(len).fill(0);
  const minusDm: number[] = new Array(len).fill(0);

  for (let i = 1; i < len; i++) {
    const upMove = candles[i].high - candles[i - 1].high;
    const downMove = candles[i - 1].low - candles[i].low;
    plusDm[i] = upMove > downMove && upMove > 0 ? upMove : 0;
    minusDm[i] = downMove > upMove && downMove > 0 ? downMove : 0;
    tr[i] = Math.max(
      candles[i].high - candles[i].low,
      Math.abs(candles[i].high - candles[i - 1].close),
      Math.abs(candles[i].low - candles[i - 1].close)
    );
  }

  let smTr = 0;
  let smPlus = 0;
  let smMinus = 0;
  for (let i = 1; i <= period; i++) {
    smTr += tr[i];
    smPlus += plusDm[i];
    smMinus += minusDm[i];
  }

  const dxArr: Array<number | null> = new Array(len).fill(null);
  for (let i = period; i < len; i++) {
    if (i > period) {
      smTr = smTr - smTr / period + tr[i];
      smPlus = smPlus - smPlus / period + plusDm[i];
      smMinus = smMinus - smMinus / period + minusDm[i];
    }
    const pdi = smTr === 0 ? 0 : (100 * smPlus) / smTr;
    const mdi = smTr === 0 ? 0 : (100 * smMinus) / smTr;
    plusDi[i] = pdi;
    minusDi[i] = mdi;
    const sum = pdi + mdi;
    dxArr[i] = sum === 0 ? 0 : (100 * Math.abs(pdi - mdi)) / sum;
  }

  let dxSum = 0;
  let count = 0;
  for (let i = period; i < period * 2; i++) {
    if (dxArr[i] !== null) {
      dxSum += dxArr[i]!;
      count++;
    }
  }
  if (count > 0) {
    let prevAdx = dxSum / count;
    adx[period * 2 - 1] = prevAdx;
    for (let i = period * 2; i < len; i++) {
      prevAdx = (prevAdx * (period - 1) + (dxArr[i] ?? 0)) / period;
      adx[i] = prevAdx;
    }
  }
  return { adx, plusDi, minusDi };
}

export function computeParabolicSAR(
  candles: OhlcCandle[],
  step = 0.02,
  maxStep = 0.2
): { values: Array<number | null>; trend: Array<'bullish' | 'bearish' | null> } {
  const len = candles.length;
  const values: Array<number | null> = new Array(len).fill(null);
  const trend: Array<'bullish' | 'bearish' | null> = new Array(len).fill(null);
  if (len < 3) return { values, trend };

  let bull = candles[1].close >= candles[0].close;
  let af = step;
  let ep = bull ? Math.max(candles[0].high, candles[1].high) : Math.min(candles[0].low, candles[1].low);
  let sar = bull ? Math.min(candles[0].low, candles[1].low) : Math.max(candles[0].high, candles[1].high);

  values[1] = sar;
  trend[1] = bull ? 'bullish' : 'bearish';

  for (let i = 2; i < len; i++) {
    sar = sar + af * (ep - sar);
    if (bull) {
      sar = Math.min(sar, candles[i - 1].low, candles[i - 2].low);
      if (candles[i].low < sar) {
        bull = false;
        sar = ep;
        ep = candles[i].low;
        af = step;
      } else {
        if (candles[i].high > ep) {
          ep = candles[i].high;
          af = Math.min(maxStep, af + step);
        }
      }
    } else {
      sar = Math.max(sar, candles[i - 1].high, candles[i - 2].high);
      if (candles[i].high > sar) {
        bull = true;
        sar = ep;
        ep = candles[i].high;
        af = step;
      } else {
        if (candles[i].low < ep) {
          ep = candles[i].low;
          af = Math.min(maxStep, af + step);
        }
      }
    }
    values[i] = sar;
    trend[i] = bull ? 'bullish' : 'bearish';
  }
  return { values, trend };
}

export function computeAllIndicators(
  candles: OhlcCandle[],
  opts?: { emaFast?: number; emaSlow?: number; rsiPeriod?: number; bbPeriod?: number; bbStd?: number }
): IndicatorSuite {
  const closes = candles.map((c) => c.close);
  const emaFast = opts?.emaFast ?? 9;
  const emaSlow = opts?.emaSlow ?? 20;
  const rsiPeriod = opts?.rsiPeriod ?? 14;
  const bbPeriod = opts?.bbPeriod ?? 20;
  const bbStd = opts?.bbStd ?? 2;

  const ema9 = computeEMA(closes, emaFast);
  const ema20 = computeEMA(closes, emaSlow);
  const ema50 = computeEMA(closes, 50);
  const ema200 = computeEMA(closes, 200);
  const sma20 = computeSMA(closes, bbPeriod);
  const sma50 = computeSMA(closes, 50);
  const rsi14 = computeRSI(closes, rsiPeriod);

  const ema12 = computeEMA(closes, 12);
  const ema26 = computeEMA(closes, 26);
  const macdLine: Array<number | null> = closes.map((_, i) =>
    ema12[i] !== null && ema26[i] !== null ? ema12[i]! - ema26[i]! : null
  );
  const macdSignal = computeNullableEMA(macdLine, 9);
  const macdHist = macdLine.map((v, i) => (v !== null && macdSignal[i] !== null ? v - macdSignal[i]! : null));

  const bbUpper: Array<number | null> = new Array(closes.length).fill(null);
  const bbLower: Array<number | null> = new Array(closes.length).fill(null);
  const bbBandwidth: Array<number | null> = new Array(closes.length).fill(null);
  const bbPercentB: Array<number | null> = new Array(closes.length).fill(null);

  for (let i = bbPeriod - 1; i < closes.length; i++) {
    const mean = sma20[i]!;
    let sq = 0;
    for (let j = i - bbPeriod + 1; j <= i; j++) {
      const d = closes[j] - mean;
      sq += d * d;
    }
    const sd = Math.sqrt(sq / bbPeriod);
    const up = mean + bbStd * sd;
    const lo = mean - bbStd * sd;
    bbUpper[i] = up;
    bbLower[i] = lo;
    bbBandwidth[i] = mean !== 0 ? ((up - lo) / mean) * 100 : 0;
    bbPercentB[i] = up !== lo ? (closes[i] - lo) / (up - lo) : 0.5;
  }

  // Stochastic (14, 3, 3)
  const rawK: Array<number | null> = new Array(closes.length).fill(null);
  for (let i = 13; i < candles.length; i++) {
    let hh = -Infinity;
    let ll = Infinity;
    for (let j = i - 13; j <= i; j++) {
      if (candles[j].high > hh) hh = candles[j].high;
      if (candles[j].low < ll) ll = candles[j].low;
    }
    rawK[i] = hh === ll ? 50 : ((closes[i] - ll) / (hh - ll)) * 100;
  }
  const stochK: Array<number | null> = new Array(closes.length).fill(null);
  for (let i = 15; i < closes.length; i++) {
    if (rawK[i] !== null && rawK[i - 1] !== null && rawK[i - 2] !== null) {
      stochK[i] = (rawK[i]! + rawK[i - 1]! + rawK[i - 2]!) / 3;
    }
  }
  const stochD: Array<number | null> = new Array(closes.length).fill(null);
  for (let i = 17; i < closes.length; i++) {
    if (stochK[i] !== null && stochK[i - 1] !== null && stochK[i - 2] !== null) {
      stochD[i] = (stochK[i]! + stochK[i - 1]! + stochK[i - 2]!) / 3;
    }
  }

  const atr14 = computeATR(candles, 14);
  const adx14 = computeADX(candles, 14);
  const psar = computeParabolicSAR(candles);

  // VWAP only if meaningful real tick_volume exists
  const hasRealVolume = candles.some((c) => Number(c.tick_volume || 0) > 0);
  const vwapValues: Array<number | null> = new Array(candles.length).fill(null);
  if (hasRealVolume) {
    let cumPv = 0;
    let cumVol = 0;
    for (let i = 0; i < candles.length; i++) {
      const vol = Number(candles[i].tick_volume || 0);
      if (vol > 0) {
        const tp = (candles[i].high + candles[i].low + candles[i].close) / 3;
        cumPv += tp * vol;
        cumVol += vol;
        vwapValues[i] = cumVol > 0 ? cumPv / cumVol : null;
      }
    }
  }

  return {
    ema9,
    ema20,
    ema50,
    ema200,
    sma20,
    sma50,
    rsi14,
    macd: { line: macdLine, signal: macdSignal, histogram: macdHist },
    bollinger: { upper: bbUpper, middle: sma20, lower: bbLower, bandwidth: bbBandwidth, percentB: bbPercentB },
    stochastic: { k: stochK, d: stochD },
    atr14,
    adx14,
    vwap: {
      available: hasRealVolume,
      reason: hasRealVolume ? undefined : 'Deriv synthetic/OTC candles do not always provide exchange volume; VWAP requires tick_volume > 0.',
      values: vwapValues,
    },
    psar,
  };
}

export function analyzeSmartMoneyConcepts(candles: OhlcCandle[], indicators?: IndicatorSuite): SmcAnalysis {
  if (candles.length < 15) {
    const last = candles[candles.length - 1]?.close ?? 0;
    return {
      bias: 'neutral',
      swings: [],
      structureEvents: [],
      zones: [],
      supportLevels: [],
      resistanceLevels: [],
      liquidityEvents: [],
      dealingRange: { high: last, low: last, equilibrium: last, currentPct: 50, zone: 'Equilibrium' },
      displacementCount: 0,
      summary: ['Insufficient candle history (minimum 15 bars required for market structure analysis).'],
    };
  }

  const ind = indicators || computeAllIndicators(candles);
  const atrLast = ind.atr14[candles.length - 1] ?? Math.abs(candles[candles.length - 1].high - candles[candles.length - 1].low);
  const lookback = 3;
  const rawSwings: SwingPivot[] = [];

  for (let i = lookback; i < candles.length - lookback; i++) {
    let isHigh = true;
    let isLow = true;
    for (let k = 1; k <= lookback; k++) {
      if (candles[i].high <= candles[i - k].high || candles[i].high < candles[i + k].high) isHigh = false;
      if (candles[i].low >= candles[i - k].low || candles[i].low > candles[i + k].low) isLow = false;
    }
    if (isHigh) {
      rawSwings.push({ index: i, time: candles[i].time, price: candles[i].high, kind: 'high', label: 'H' });
    }
    if (isLow) {
      rawSwings.push({ index: i, time: candles[i].time, price: candles[i].low, kind: 'low', label: 'L' });
    }
  }

  // Label HH/HL/LH/LL
  let prevHigh: number | null = null;
  let prevLow: number | null = null;
  for (const s of rawSwings) {
    if (s.kind === 'high') {
      if (prevHigh !== null) s.label = s.price >= prevHigh ? 'HH' : 'LH';
      prevHigh = s.price;
    } else {
      if (prevLow !== null) s.label = s.price >= prevLow ? 'HL' : 'LL';
      prevLow = s.price;
    }
  }

  // Detect BOS & CHoCH
  const structureEvents: StructureEvent[] = [];
  let runningTrend: 'bullish' | 'bearish' | 'neutral' = 'neutral';
  let lastSwingHigh: SwingPivot | null = null;
  let lastSwingLow: SwingPivot | null = null;
  let swingPtr = 0;

  for (let i = lookback + 1; i < candles.length; i++) {
    while (swingPtr < rawSwings.length && rawSwings[swingPtr].index < i - lookback) {
      const sw = rawSwings[swingPtr++];
      if (sw.kind === 'high') lastSwingHigh = sw;
      else lastSwingLow = sw;
    }

    const c = candles[i];
    if (lastSwingHigh && c.close > lastSwingHigh.price) {
      const isChoch = runningTrend === 'bearish';
      structureEvents.push({
        type: isChoch ? 'CHoCH' : 'BOS',
        direction: 'bullish',
        index: i,
        time: c.time,
        price: lastSwingHigh.price,
        description: `${isChoch ? 'Bullish CHoCH' : 'Bullish BOS'} above ${lastSwingHigh.price.toFixed(4)}`,
      });
      runningTrend = 'bullish';
      lastSwingHigh = null;
    } else if (lastSwingLow && c.close < lastSwingLow.price) {
      const isChoch = runningTrend === 'bullish';
      structureEvents.push({
        type: isChoch ? 'CHoCH' : 'BOS',
        direction: 'bearish',
        index: i,
        time: c.time,
        price: lastSwingLow.price,
        description: `${isChoch ? 'Bearish CHoCH' : 'Bearish BOS'} below ${lastSwingLow.price.toFixed(4)}`,
      });
      runningTrend = 'bearish';
      lastSwingLow = null;
    }
  }

  // Fair Value Gaps (FVG) & Order Blocks (OB)
  const zones: SmcZone[] = [];
  let displacementCount = 0;
  const lastTime = candles[candles.length - 1].time;

  for (let i = 2; i < candles.length; i++) {
    const c0 = candles[i - 2];
    const c1 = candles[i - 1];
    const c2 = candles[i];
    const barAtr = ind.atr14[i - 1] ?? atrLast;
    const body1 = Math.abs(c1.close - c1.open);
    if (barAtr > 0 && body1 > 1.5 * barAtr) displacementCount++;

    // Bullish FVG: c0.high < c2.low
    if (c0.high < c2.low && c1.close > c1.open) {
      const mitigated = candles.slice(i + 1).some((b) => b.low <= c0.high);
      zones.push({
        id: `fvg-bull-${i}`,
        kind: 'fvg',
        bias: 'bullish',
        top: c2.low,
        bottom: c0.high,
        timeStart: c1.time,
        timeEnd: lastTime,
        mitigated,
        label: 'Bullish FVG',
      });
    }

    // Bearish FVG: c0.low > c2.high
    if (c0.low > c2.high && c1.close < c1.open) {
      const mitigated = candles.slice(i + 1).some((b) => b.high >= c0.low);
      zones.push({
        id: `fvg-bear-${i}`,
        kind: 'fvg',
        bias: 'bearish',
        top: c0.low,
        bottom: c2.high,
        timeStart: c1.time,
        timeEnd: lastTime,
        mitigated,
        label: 'Bearish FVG',
      });
    }

    // Order Blocks / Demand & Supply around strong impulse candles
    if (barAtr > 0 && body1 > 1.35 * barAtr) {
      if (c1.close > c1.open && c0.close < c0.open) {
        const mitigated = candles.slice(i + 1).some((b) => b.low <= c0.low);
        zones.push({
          id: `ob-bull-${i - 2}`,
          kind: 'order_block',
          bias: 'bullish',
          top: c0.high,
          bottom: c0.low,
          timeStart: c0.time,
          timeEnd: lastTime,
          mitigated,
          label: 'Bullish OB / Demand',
        });
      } else if (c1.close < c1.open && c0.close > c0.open) {
        const mitigated = candles.slice(i + 1).some((b) => b.high >= c0.high);
        zones.push({
          id: `ob-bear-${i - 2}`,
          kind: 'order_block',
          bias: 'bearish',
          top: c0.high,
          bottom: c0.low,
          timeStart: c0.time,
          timeEnd: lastTime,
          mitigated,
          label: 'Bearish OB / Supply',
        });
      }
    }
  }

  // Liquidity Sweeps & EQH/EQL
  const liquidityEvents: LiquidityEvent[] = [];
  const highSwings = rawSwings.filter((s) => s.kind === 'high');
  const lowSwings = rawSwings.filter((s) => s.kind === 'low');
  const eqTol = Math.max(atrLast * 0.2, candles[candles.length - 1].close * 0.0005);

  for (let i = 1; i < highSwings.length; i++) {
    if (Math.abs(highSwings[i].price - highSwings[i - 1].price) <= eqTol) {
      liquidityEvents.push({
        kind: 'EQH',
        price: highSwings[i].price,
        time: highSwings[i].time,
        index: highSwings[i].index,
        description: `Equal Highs resting BSL near ${highSwings[i].price.toFixed(4)}`,
      });
    }
  }
  for (let i = 1; i < lowSwings.length; i++) {
    if (Math.abs(lowSwings[i].price - lowSwings[i - 1].price) <= eqTol) {
      liquidityEvents.push({
        kind: 'EQL',
        price: lowSwings[i].price,
        time: lowSwings[i].time,
        index: lowSwings[i].index,
        description: `Equal Lows resting SSL near ${lowSwings[i].price.toFixed(4)}`,
      });
    }
  }

  // Recent wick sweeps of prior swing highs/lows
  const recentStart = Math.max(10, candles.length - 30);
  for (let i = recentStart; i < candles.length; i++) {
    const bar = candles[i];
    const priorH = highSwings.filter((h) => h.index < i - 2).slice(-3);
    for (const h of priorH) {
      if (bar.high > h.price && bar.close < h.price) {
        liquidityEvents.push({
          kind: 'BSL_SWEEP',
          price: h.price,
          time: bar.time,
          index: i,
          description: `Buy-side liquidity sweep above ${h.price.toFixed(4)} (rejected close)`,
        });
        break;
      }
    }
    const priorL = lowSwings.filter((l) => l.index < i - 2).slice(-3);
    for (const l of priorL) {
      if (bar.low < l.price && bar.close > l.price) {
        liquidityEvents.push({
          kind: 'SSL_SWEEP',
          price: l.price,
          time: bar.time,
          index: i,
          description: `Sell-side liquidity sweep below ${l.price.toFixed(4)} (reclaimed close)`,
        });
        break;
      }
    }
  }

  // Support & Resistance clustering
  const clusterLevels = (prices: number[]): number[] => {
    const sorted = [...prices].sort((a, b) => a - b);
    const groups: number[][] = [];
    for (const p of sorted) {
      const lastGrp = groups[groups.length - 1];
      if (lastGrp && Math.abs(p - lastGrp[0]) <= Math.max(atrLast * 0.4, p * 0.0012)) {
        lastGrp.push(p);
      } else {
        groups.push([p]);
      }
    }
    return groups
      .sort((a, b) => b.length - a.length)
      .slice(0, 4)
      .map((g) => g.reduce((a, b) => a + b, 0) / g.length);
  };

  const supportLevels = clusterLevels(lowSwings.map((l) => l.price));
  const resistanceLevels = clusterLevels(highSwings.map((h) => h.price));

  const recentSlice = candles.slice(-50);
  const rangeHigh = Math.max(...recentSlice.map((c) => c.high));
  const rangeLow = Math.min(...recentSlice.map((c) => c.low));
  const equilibrium = (rangeHigh + rangeLow) / 2;
  const lastClose = candles[candles.length - 1].close;
  const span = Math.max(1e-9, rangeHigh - rangeLow);
  const currentPct = Number((((lastClose - rangeLow) / span) * 100).toFixed(1));
  const zone: 'Premium' | 'Discount' | 'Equilibrium' =
    currentPct >= 55 ? 'Premium' : currentPct <= 45 ? 'Discount' : 'Equilibrium';

  const latestBias =
    structureEvents.length > 0
      ? structureEvents[structureEvents.length - 1].direction
      : runningTrend;

  const unmitigatedZones = zones.filter((z) => !z.mitigated).slice(-8);
  const summary = [
    `Market Structure Bias: ${latestBias.toUpperCase()} (${structureEvents.slice(-1)[0]?.description || 'Consolidation'})`,
    `Dealing Range: ${currentPct}% (${zone}) · EQ ${equilibrium.toFixed(4)}`,
    `Active Unmitigated Zones: ${unmitigatedZones.length} (OB/FVG) · Displacements: ${displacementCount}`,
  ];

  return {
    bias: latestBias,
    swings: rawSwings.slice(-24),
    structureEvents: structureEvents.slice(-12),
    zones: unmitigatedZones,
    supportLevels,
    resistanceLevels,
    liquidityEvents: liquidityEvents.slice(-10),
    dealingRange: {
      high: rangeHigh,
      low: rangeLow,
      equilibrium,
      currentPct,
      zone,
    },
    displacementCount,
    summary,
  };
}

export function analyzeBuyLowSellHigh(
  candles: OhlcCandle[],
  indicators?: IndicatorSuite,
  smcInput?: SmcAnalysis
): BuyLowSellHighResult {
  const disclaimer =
    'Heuristic rule-based confluence score derived from historical Deriv price structure and indicators. Not financial advice and never a guaranteed win.';
  if (candles.length < 30) {
    return {
      action: 'NEUTRAL',
      regime: 'NEUTRAL_RANGE',
      regimeLabel: 'Insufficient History',
      confidenceScore: 0,
      rangePercentile: 50,
      rsi14: null,
      rsiDivergence: 'none',
      entryZone: null,
      stopLoss: null,
      takeProfit: null,
      riskReward: null,
      invalidationPrice: null,
      reasoning: ['Need at least 30 historical candles to evaluate range extremes and RSI divergence.'],
      disclaimer,
    };
  }

  const ind = indicators || computeAllIndicators(candles);
  const smc = smcInput || analyzeSmartMoneyConcepts(candles, ind);
  const n = candles.length - 1;
  const close = candles[n].close;
  const prevClose = candles[n - 1].close;
  const rsi = ind.rsi14[n];
  const prevRsi = ind.rsi14[n - 1];
  const adx = ind.adx14.adx[n] ?? 20;
  const plusDi = ind.adx14.plusDi[n] ?? 20;
  const minusDi = ind.adx14.minusDi[n] ?? 20;
  const atr = ind.atr14[n] ?? Math.abs(candles[n].high - candles[n].low);
  const macdHist = ind.macd.histogram[n] ?? 0;
  const prevHist = ind.macd.histogram[n - 1] ?? 0;
  const stochK = ind.stochastic.k[n] ?? 50;
  const ema20 = ind.ema20[n] ?? close;
  const ema50 = ind.ema50[n] ?? close;

  const pct = smc.dealingRange.currentPct;

  // Regular RSI divergence check over last 25 bars
  let rsiDivergence: 'bullish' | 'bearish' | 'none' = 'none';
  const lowPivots = smc.swings.filter((s) => s.kind === 'low' && s.index >= n - 35);
  if (lowPivots.length >= 2) {
    const a = lowPivots[lowPivots.length - 2];
    const b = lowPivots[lowPivots.length - 1];
    const rA = ind.rsi14[a.index];
    const rB = ind.rsi14[b.index];
    if (rA !== null && rB !== null && b.price < a.price && rB > rA + 1.5) {
      rsiDivergence = 'bullish';
    }
  }
  const highPivots = smc.swings.filter((s) => s.kind === 'high' && s.index >= n - 35);
  if (highPivots.length >= 2) {
    const a = highPivots[highPivots.length - 2];
    const b = highPivots[highPivots.length - 1];
    const rA = ind.rsi14[a.index];
    const rB = ind.rsi14[b.index];
    if (rA !== null && rB !== null && b.price > a.price && rB < rA - 1.5) {
      rsiDivergence = 'bearish';
    }
  }

  const nearSupport = smc.supportLevels.some((s) => Math.abs(close - s) <= atr * 0.75);
  const nearResistance = smc.resistanceLevels.some((r) => Math.abs(close - r) <= atr * 0.75);
  const recentSslSweep = smc.liquidityEvents.some((e) => e.kind === 'SSL_SWEEP' && n - e.index <= 5);
  const recentBslSweep = smc.liquidityEvents.some((e) => e.kind === 'BSL_SWEEP' && n - e.index <= 5);

  const reasoning: string[] = [];
  let score = 40;
  let regime: BuyLowSellHighRegime = 'NEUTRAL_RANGE';
  let regimeLabel = 'Neutral Mid-Range';
  let action: BuyLowSellHighResult['action'] = 'NEUTRAL';
  let sl: number | null = null;
  let tp: number | null = null;
  let entryZone: [number, number] | null = null;

  const strongBearTrend = adx > 28 && minusDi > plusDi && ema20 < ema50 && macdHist <= prevHist;
  const strongBullTrend = adx > 28 && plusDi > minusDi && ema20 > ema50 && macdHist >= prevHist;

  if (pct <= 30) {
    reasoning.push(`Price sits in the lower ${pct.toFixed(1)}% Discount area of the active swing range.`);
    if (strongBearTrend && rsiDivergence !== 'bullish' && macdHist < 0 && close < prevClose) {
      regime = 'BEARISH_CONTINUATION';
      regimeLabel = 'Strong Bearish Continuation (Falling Knife Warning)';
      action = 'WAIT_AVOID_KNIFE';
      score = 68;
      reasoning.push(`ADX(${adx.toFixed(1)}) with -DI dominance and falling MACD indicates active bearish expansion.`);
      reasoning.push('Avoid blind Buy Low entries until CHoCH, SSL sweep, or RSI hook confirms reversal.');
    } else {
      const momentumTurn = (rsi !== null && prevRsi !== null && rsi > prevRsi) || macdHist > prevHist || stochK < 30;
      if (rsi !== null && rsi <= 35) score += 15;
      if (rsiDivergence === 'bullish') {
        score += 18;
        reasoning.push('Regular bullish RSI divergence detected across recent swing lows.');
      }
      if (nearSupport) {
        score += 10;
        reasoning.push('Price testing clustered historical Support.');
      }
      if (recentSslSweep) {
        score += 12;
        reasoning.push('Sell-side liquidity sweep reclaimed below prior low.');
      }
      if (momentumTurn) {
        score += 8;
        reasoning.push('Short-term momentum inflection upward (RSI/MACD/Stoch turning).');
      }
      regime = rsiDivergence === 'bullish' || recentSslSweep ? 'BULLISH_REVERSAL_CONFIRMATION' : 'CHEAP_OVERSOLD';
      regimeLabel =
        regime === 'BULLISH_REVERSAL_CONFIRMATION'
          ? 'Buy Low · Reversal Confirmation'
          : 'Cheap / Oversold Zone';
      action = 'BUY_LOW_CANDIDATE';
      entryZone = [close - atr * 0.25, close + atr * 0.1];
      sl = smc.dealingRange.low - atr * 0.5;
      tp = smc.dealingRange.equilibrium + (smc.dealingRange.high - smc.dealingRange.equilibrium) * 0.5;
    }
  } else if (pct >= 70) {
    reasoning.push(`Price sits in the upper ${pct.toFixed(1)}% Premium area of the active swing range.`);
    if (strongBullTrend && rsiDivergence !== 'bearish' && macdHist > 0 && close > prevClose) {
      regime = 'BULLISH_CONTINUATION';
      regimeLabel = 'Strong Bullish Continuation (Avoid Premature Short)';
      action = 'WAIT_AVOID_KNIFE';
      score = 68;
      reasoning.push(`ADX(${adx.toFixed(1)}) with +DI dominance and rising MACD indicates strong bullish continuation.`);
      reasoning.push('Wait for bearish CHoCH, BSL sweep, or RSI divergence before fading the rally.');
    } else {
      const momentumTurn = (rsi !== null && prevRsi !== null && rsi < prevRsi) || macdHist < prevHist || stochK > 70;
      if (rsi !== null && rsi >= 65) score += 15;
      if (rsiDivergence === 'bearish') {
        score += 18;
        reasoning.push('Regular bearish RSI divergence detected across recent swing highs.');
      }
      if (nearResistance) {
        score += 10;
        reasoning.push('Price rejecting clustered historical Resistance.');
      }
      if (recentBslSweep) {
        score += 12;
        reasoning.push('Buy-side liquidity sweep rejected above prior high.');
      }
      if (momentumTurn) {
        score += 8;
        reasoning.push('Momentum rolling over (RSI/MACD histogram weakening).');
      }
      regime = rsiDivergence === 'bearish' || recentBslSweep ? 'BEARISH_REVERSAL_CONFIRMATION' : 'OVERBOUGHT_EXTENDED';
      regimeLabel =
        regime === 'BEARISH_REVERSAL_CONFIRMATION'
          ? 'Sell High · Reversal Confirmation'
          : 'Overbought / Extended Zone';
      action = 'SELL_HIGH_CANDIDATE';
      entryZone = [close - atr * 0.1, close + atr * 0.25];
      sl = smc.dealingRange.high + atr * 0.5;
      tp = smc.dealingRange.equilibrium - (smc.dealingRange.equilibrium - smc.dealingRange.low) * 0.5;
    }
  } else {
    reasoning.push(`Price is in Equilibrium (${pct.toFixed(1)}% of swing range); wait for Discount (<30%) or Premium (>70%) extremes.`);
  }

  const boundedScore = Math.max(0, Math.min(95, Math.round(score)));
  const risk = sl !== null ? Math.abs(close - sl) : 0;
  const reward = tp !== null ? Math.abs(tp - close) : 0;
  const rr = risk > 0 ? Number((reward / risk).toFixed(2)) : null;

  return {
    action,
    regime,
    regimeLabel,
    confidenceScore: boundedScore,
    rangePercentile: pct,
    rsi14: rsi !== null ? Number(rsi.toFixed(2)) : null,
    rsiDivergence,
    entryZone,
    stopLoss: sl,
    takeProfit: tp,
    riskReward: rr,
    invalidationPrice: sl,
    reasoning,
    disclaimer,
  };
}

function evaluateStrategyAtBar(
  key: StrategyKey,
  candles: OhlcCandle[],
  i: number,
  ind: IndicatorSuite,
  cfg: StrategyDefinition['defaultConfig']
): { direction: 'BUY' | 'SELL'; score: number; note: string } | null {
  if (i < 55) return null;
  const c = candles[i];
  const prev = candles[i - 1];
  const emaFast = ind.ema9[i];
  const prevEmaFast = ind.ema9[i - 1];
  const emaSlow = ind.ema20[i];
  const prevEmaSlow = ind.ema20[i - 1];
  const ema50 = ind.ema50[i];
  const rsi = ind.rsi14[i];
  const prevRsi = ind.rsi14[i - 1];
  const macd = ind.macd.line[i];
  const prevMacd = ind.macd.line[i - 1];
  const sig = ind.macd.signal[i];
  const prevSig = ind.macd.signal[i - 1];
  const hist = ind.macd.histogram[i];
  const prevHist = ind.macd.histogram[i - 1];
  const adx = ind.adx14.adx[i] ?? 0;
  const plusDi = ind.adx14.plusDi[i] ?? 0;
  const minusDi = ind.adx14.minusDi[i] ?? 0;
  const bbUp = ind.bollinger.upper[i];
  const bbLo = ind.bollinger.lower[i];
  const prevBbUp = ind.bollinger.upper[i - 1];
  const prevBbLo = ind.bollinger.lower[i - 1];
  const stochK = ind.stochastic.k[i];
  const stochD = ind.stochastic.d[i];
  const prevK = ind.stochastic.k[i - 1];
  const prevD = ind.stochastic.d[i - 1];
  const atr = ind.atr14[i] ?? Math.abs(c.high - c.low);

  switch (key) {
    case 'trend_following': {
      if (!emaFast || !emaSlow || !ema50 || adx < cfg.adxThreshold) return null;
      if (emaSlow > ema50 && plusDi > minusDi && c.close > emaFast && prev.close <= (prevEmaFast ?? prev.close)) {
        return { direction: 'BUY', score: 74, note: `ADX ${adx.toFixed(1)} + EMA20>EMA50 bullish trend continuation` };
      }
      if (emaSlow < ema50 && minusDi > plusDi && c.close < emaFast && prev.close >= (prevEmaFast ?? prev.close)) {
        return { direction: 'SELL', score: 74, note: `ADX ${adx.toFixed(1)} + EMA20<EMA50 bearish trend continuation` };
      }
      return null;
    }
    case 'rsi_reversal': {
      if (rsi === null || prevRsi === null) return null;
      if (prevRsi < cfg.rsiOversold && rsi >= cfg.rsiOversold && c.close > c.open) {
        return { direction: 'BUY', score: 70, note: `RSI(14) recovered from ${prevRsi.toFixed(1)} above ${cfg.rsiOversold}` };
      }
      if (prevRsi > cfg.rsiOverbought && rsi <= cfg.rsiOverbought && c.close < c.open) {
        return { direction: 'SELL', score: 70, note: `RSI(14) rolled down from ${prevRsi.toFixed(1)} below ${cfg.rsiOverbought}` };
      }
      return null;
    }
    case 'ema_crossover': {
      if (!emaFast || !emaSlow || !prevEmaFast || !prevEmaSlow) return null;
      if (prevEmaFast <= prevEmaSlow && emaFast > emaSlow && (hist ?? 0) >= 0) {
        return { direction: 'BUY', score: 69, note: 'Bullish Fast/Slow EMA crossover confirmed by MACD' };
      }
      if (prevEmaFast >= prevEmaSlow && emaFast < emaSlow && (hist ?? 0) <= 0) {
        return { direction: 'SELL', score: 69, note: 'Bearish Fast/Slow EMA crossover confirmed by MACD' };
      }
      return null;
    }
    case 'macd_momentum': {
      if (macd === null || prevMacd === null || sig === null || prevSig === null || hist === null || prevHist === null) return null;
      if (prevMacd <= prevSig && macd > sig && hist > prevHist) {
        return { direction: 'BUY', score: 72, note: 'MACD bullish signal cross with expanding positive histogram' };
      }
      if (prevMacd >= prevSig && macd < sig && hist < prevHist) {
        return { direction: 'SELL', score: 72, note: 'MACD bearish signal cross with expanding negative histogram' };
      }
      return null;
    }
    case 'bollinger_reversion': {
      if (!bbUp || !bbLo || !prevBbUp || !prevBbLo) return null;
      if (prev.close < prevBbLo && c.close >= bbLo && (stochK ?? 50) < 35) {
        return { direction: 'BUY', score: 71, note: 'Close reclaimed lower Bollinger Band with oversold Stochastic' };
      }
      if (prev.close > prevBbUp && c.close <= bbUp && (stochK ?? 50) > 65) {
        return { direction: 'SELL', score: 71, note: 'Close rejected upper Bollinger Band with overbought Stochastic' };
      }
      return null;
    }
    case 'breakout_trading': {
      const look = candles.slice(i - 20, i);
      const hh = Math.max(...look.map((b) => b.high));
      const ll = Math.min(...look.map((b) => b.low));
      const barRange = c.high - c.low;
      if (c.close > hh && barRange > atr * 0.9) {
        return { direction: 'BUY', score: 73, note: `20-bar breakout above ${hh.toFixed(4)} with ATR expansion` };
      }
      if (c.close < ll && barRange > atr * 0.9) {
        return { direction: 'SELL', score: 73, note: `20-bar breakdown below ${ll.toFixed(4)} with ATR expansion` };
      }
      return null;
    }
    case 'sr_reversal': {
      const look = candles.slice(i - 35, i - 3);
      const sup = Math.min(...look.map((b) => b.low));
      const res = Math.max(...look.map((b) => b.high));
      const lowerWick = Math.min(c.open, c.close) - c.low;
      const upperWick = c.high - Math.max(c.open, c.close);
      const body = Math.abs(c.close - c.open);
      if (Math.abs(c.low - sup) <= atr * 0.4 && lowerWick > body * 1.1 && c.close > c.open) {
        return { direction: 'BUY', score: 72, note: `Pin-bar support rejection near ${sup.toFixed(4)}` };
      }
      if (Math.abs(c.high - res) <= atr * 0.4 && upperWick > body * 1.1 && c.close < c.open) {
        return { direction: 'SELL', score: 72, note: `Pin-bar resistance rejection near ${res.toFixed(4)}` };
      }
      return null;
    }
    case 'mtf_confluence': {
      if (!ema50 || stochK === null || stochD === null || prevK === null || prevD === null) return null;
      const ema200 = ind.ema200[i] ?? ema50;
      if (c.close > ema50 && ema50 >= ema200 && prevK <= prevD && stochK > stochD && stochK < 45) {
        return { direction: 'BUY', score: 78, note: 'Macro uptrend aligned + Stochastic pullback cross' };
      }
      if (c.close < ema50 && ema50 <= ema200 && prevK >= prevD && stochK < stochD && stochK > 55) {
        return { direction: 'SELL', score: 78, note: 'Macro downtrend aligned + Stochastic rally cross' };
      }
      return null;
    }
    case 'smc_liquidity': {
      // Causal slice up to bar i only (no future look-ahead!)
      const windowCandles = candles.slice(Math.max(0, i - 60), i + 1);
      const hi = Math.max(...windowCandles.map((b) => b.high));
      const lo = Math.min(...windowCandles.map((b) => b.low));
      const pct = ((c.close - lo) / Math.max(1e-9, hi - lo)) * 100;
      const sweepLow = c.low < Math.min(...windowCandles.slice(-15, -1).map((b) => b.low)) && c.close > prev.low;
      const sweepHigh = c.high > Math.max(...windowCandles.slice(-15, -1).map((b) => b.high)) && c.close < prev.high;
      if (pct < 45 && sweepLow && c.close > c.open) {
        return { direction: 'BUY', score: 77, note: `Discount (${pct.toFixed(0)}%) SSL liquidity sweep + bullish reclaim` };
      }
      if (pct > 55 && sweepHigh && c.close < c.open) {
        return { direction: 'SELL', score: 77, note: `Premium (${pct.toFixed(0)}%) BSL liquidity sweep + bearish reclaim` };
      }
      return null;
    }
    case 'buy_low_sell_high': {
      const windowCandles = candles.slice(Math.max(0, i - 40), i + 1);
      const hi = Math.max(...windowCandles.map((b) => b.high));
      const lo = Math.min(...windowCandles.map((b) => b.low));
      const pct = ((c.close - lo) / Math.max(1e-9, hi - lo)) * 100;
      if (pct <= 25 && (rsi ?? 50) <= 36 && (hist ?? 0) > (prevHist ?? 0) && c.close > c.open) {
        return { direction: 'BUY', score: 76, note: `Buy Low (${pct.toFixed(0)}% range) + RSI ${rsi?.toFixed(1)} momentum turn` };
      }
      if (pct >= 75 && (rsi ?? 50) >= 64 && (hist ?? 0) < (prevHist ?? 0) && c.close < c.open) {
        return { direction: 'SELL', score: 76, note: `Sell High (${pct.toFixed(0)}% range) + RSI ${rsi?.toFixed(1)} momentum turn` };
      }
      return null;
    }
  }
}

export function scanStrategySetups(
  candles: OhlcCandle[],
  timeframeLabel: string,
  indicators?: IndicatorSuite,
  smcInput?: SmcAnalysis
): StrategySetup[] {
  if (candles.length < 60) return [];
  const ind = indicators || computeAllIndicators(candles);
  const smc = smcInput || analyzeSmartMoneyConcepts(candles, ind);
  const lastIdx = candles.length - 1;
  const lastBar = candles[lastIdx];
  const atr = ind.atr14[lastIdx] ?? Math.abs(lastBar.high - lastBar.low);
  const setups: StrategySetup[] = [];

  for (const def of STRATEGY_CATALOG) {
    // Evaluate most recent 3 bars causally so traders see fresh active setups
    for (let offset = 0; offset < 3; offset++) {
      const barIdx = lastIdx - offset;
      const hit = evaluateStrategyAtBar(def.key, candles, barIdx, ind, def.defaultConfig);
      if (!hit) continue;

      const slDist = Math.max(atr * def.defaultConfig.stopLossAtrMult, lastBar.close * 0.001);
      const tpDist = slDist * def.defaultConfig.takeProfitRr;
      const entry = lastBar.close;
      const stopLoss = hit.direction === 'BUY' ? entry - slDist : entry + slDist;
      const takeProfit = hit.direction === 'BUY' ? entry + tpDist : entry - tpDist;
      const score = Math.min(92, Math.max(45, hit.score - offset * 5));

      setups.push({
        strategyKey: def.key,
        strategyName: def.name,
        direction: hit.direction,
        setupType: def.category,
        entryZone: [entry - atr * 0.2, entry + atr * 0.2],
        stopLoss,
        takeProfit,
        riskReward: Number(def.defaultConfig.takeProfitRr.toFixed(2)),
        confidenceScore: score,
        timeframe: timeframeLabel,
        indicatorsUsed: ['RSI(14)', 'EMA(9/20/50)', 'MACD', 'ATR(14)', 'ADX(14)'],
        marketStructureNote: `SMC Bias: ${smc.bias.toUpperCase()} · ${smc.dealingRange.zone} (${smc.dealingRange.currentPct}%)`,
        reasoning: [hit.note, smc.summary[0]],
        timestamp: candles[barIdx].time,
        validUntil: lastBar.time + 3600,
        status: offset === 0 ? 'active' : 'watch',
      });
      break;
    }
  }

  return setups.sort((a, b) => b.confidenceScore - a.confidenceScore);
}

export interface BacktestTrade {
  entryIndex: number;
  exitIndex: number;
  entryTime: number;
  exitTime: number;
  direction: 'BUY' | 'SELL';
  entryPrice: number;
  exitPrice: number;
  netPnlUsd: number;
  rMultiple: number;
  sampleSplit: 'in_sample' | 'out_of_sample';
}

export interface BacktestSegmentMetrics {
  trades: number;
  wins: number;
  losses: number;
  winRatePct: number;
  netPnlUsd: number;
  returnPct: number;
  profitFactor: number;
  maxDrawdownPct: number;
  avgRMultiple: number;
  expectancyUsd: number;
}

export interface BacktestReport {
  strategyKey: StrategyKey;
  strategyName: string;
  candleCount: number;
  spreadCostPct: number;
  inSample: BacktestSegmentMetrics;
  outOfSample: BacktestSegmentMetrics;
  overall: BacktestSegmentMetrics;
  equityCurve: Array<{ time: number; equity: number }>;
  trades: BacktestTrade[];
  warning: string | null;
  methodologyNote: string;
}

function summarizeBacktestTrades(trades: BacktestTrade[], initialCapital = 1000): BacktestSegmentMetrics {
  if (trades.length === 0) {
    return {
      trades: 0,
      wins: 0,
      losses: 0,
      winRatePct: 0,
      netPnlUsd: 0,
      returnPct: 0,
      profitFactor: 0,
      maxDrawdownPct: 0,
      avgRMultiple: 0,
      expectancyUsd: 0,
    };
  }

  let wins = 0;
  let grossWin = 0;
  let grossLoss = 0;
  let equity = initialCapital;
  let peak = initialCapital;
  let maxDdPct = 0;
  let totalR = 0;

  for (const t of trades) {
    totalR += t.rMultiple;
    equity += t.netPnlUsd;
    if (t.netPnlUsd > 0) {
      wins++;
      grossWin += t.netPnlUsd;
    } else {
      grossLoss += Math.abs(t.netPnlUsd);
    }
    if (equity > peak) peak = equity;
    const dd = peak > 0 ? ((peak - equity) / peak) * 100 : 0;
    if (dd > maxDdPct) maxDdPct = dd;
  }

  const netPnlUsd = Number((equity - initialCapital).toFixed(2));
  return {
    trades: trades.length,
    wins,
    losses: trades.length - wins,
    winRatePct: Number(((wins / trades.length) * 100).toFixed(1)),
    netPnlUsd,
    returnPct: Number(((netPnlUsd / initialCapital) * 100).toFixed(2)),
    profitFactor: grossLoss === 0 ? (grossWin > 0 ? 99 : 0) : Number((grossWin / grossLoss).toFixed(2)),
    maxDrawdownPct: Number(maxDdPct.toFixed(2)),
    avgRMultiple: Number((totalR / trades.length).toFixed(2)),
    expectancyUsd: Number((netPnlUsd / trades.length).toFixed(2)),
  };
}

export function runStrategyBacktest(
  strategyKey: StrategyKey,
  candles: OhlcCandle[],
  opts?: {
    stake?: number;
    stopLossAtrMult?: number;
    takeProfitRr?: number;
    spreadCostPct?: number;
    adxThreshold?: number;
    rsiOversold?: number;
    rsiOverbought?: number;
  }
): BacktestReport {
  const def = STRATEGY_CATALOG.find((s) => s.key === strategyKey) || STRATEGY_CATALOG[0];
  const cfg = {
    ...def.defaultConfig,
    ...(opts || {}),
  };
  const stake = Math.max(1, Number(opts?.stake ?? cfg.stake));
  const spreadCostPct = Number(opts?.spreadCostPct ?? 0.0006); // ~0.06% round-trip friction
  const ind = computeAllIndicators(candles);

  const splitIndex = Math.floor(candles.length * 0.7);
  const trades: BacktestTrade[] = [];
  const equityCurve: Array<{ time: number; equity: number }> = [];
  let equity = 1000;

  let activeTrade: {
    entryIndex: number;
    entryTime: number;
    direction: 'BUY' | 'SELL';
    entryPrice: number;
    sl: number;
    tp: number;
    riskDist: number;
    split: 'in_sample' | 'out_of_sample';
  } | null = null;

  // Strictly causal bar-by-bar simulation: signal on bar i enters on bar i+1 open
  for (let i = 55; i < candles.length - 1; i++) {
    const bar = candles[i];

    if (activeTrade) {
      let exitPrice: number | null = null;
      if (activeTrade.direction === 'BUY') {
        if (bar.low <= activeTrade.sl) exitPrice = activeTrade.sl;
        else if (bar.high >= activeTrade.tp) exitPrice = activeTrade.tp;
      } else {
        if (bar.high >= activeTrade.sl) exitPrice = activeTrade.sl;
        else if (bar.low <= activeTrade.tp) exitPrice = activeTrade.tp;
      }

      if (exitPrice !== null || i === candles.length - 2) {
        const finalExit = exitPrice ?? bar.close;
        const rawDirReturn =
          activeTrade.direction === 'BUY'
            ? (finalExit - activeTrade.entryPrice) / activeTrade.riskDist
            : (activeTrade.entryPrice - finalExit) / activeTrade.riskDist;
        const frictionInR = (activeTrade.entryPrice * spreadCostPct) / activeTrade.riskDist;
        const netR = rawDirReturn - frictionInR;
        const netPnlUsd = Number((netR * stake).toFixed(2));
        equity = Number((equity + netPnlUsd).toFixed(2));

        trades.push({
          entryIndex: activeTrade.entryIndex,
          exitIndex: i,
          entryTime: activeTrade.entryTime,
          exitTime: bar.time,
          direction: activeTrade.direction,
          entryPrice: activeTrade.entryPrice,
          exitPrice: finalExit,
          netPnlUsd,
          rMultiple: Number(netR.toFixed(2)),
          sampleSplit: activeTrade.split,
        });
        equityCurve.push({ time: bar.time, equity });
        activeTrade = null;
      }
      continue;
    }

    const signal = evaluateStrategyAtBar(strategyKey, candles, i, ind, cfg);
    if (signal) {
      const nextBar = candles[i + 1];
      const atr = ind.atr14[i] ?? Math.abs(bar.high - bar.low);
      const riskDist = Math.max(atr * cfg.stopLossAtrMult, nextBar.open * 0.001);
      const rewardDist = riskDist * cfg.takeProfitRr;

      activeTrade = {
        entryIndex: i + 1,
        entryTime: nextBar.time,
        direction: signal.direction,
        entryPrice: nextBar.open,
        sl: signal.direction === 'BUY' ? nextBar.open - riskDist : nextBar.open + riskDist,
        tp: signal.direction === 'BUY' ? nextBar.open + rewardDist : nextBar.open - rewardDist,
        riskDist,
        split: i < splitIndex ? 'in_sample' : 'out_of_sample',
      };
    }
  }

  const inSampleTrades = trades.filter((t) => t.sampleSplit === 'in_sample');
  const outSampleTrades = trades.filter((t) => t.sampleSplit === 'out_of_sample');

  const inSample = summarizeBacktestTrades(inSampleTrades, 1000);
  const outOfSample = summarizeBacktestTrades(outSampleTrades, 1000);
  const overall = summarizeBacktestTrades(trades, 1000);

  const warning =
    trades.length < 15
      ? `Low sample size (${trades.length} trades). Increase candle count or test a faster timeframe before drawing statistical conclusions.`
      : null;

  return {
    strategyKey: def.key,
    strategyName: def.name,
    candleCount: candles.length,
    spreadCostPct: Number((spreadCostPct * 100).toFixed(3)),
    inSample,
    outOfSample,
    overall,
    equityCurve,
    trades: trades.slice(-50),
    warning,
    methodologyNote:
      'Causal bar-by-bar simulation on real Deriv OHLC candles (70% In-Sample / 30% Out-of-Sample) with round-trip spread/slippage friction and no future look-ahead. Past historical performance does not guarantee future results.',
  };
}
