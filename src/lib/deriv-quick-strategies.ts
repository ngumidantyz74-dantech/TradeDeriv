import type { BotStrategyAst } from '../types';

export interface DerivQuickStrategy {
  id: string;
  name: string;
  xmlFile: string;
  category: 'Classic' | 'Accumulators';
  progression:
    | 'martingale'
    | 'dalembert'
    | 'oscars_grind'
    | '1_3_2_6'
    | 'reverse_martingale'
    | 'reverse_dalembert';
  hasMaxStake: boolean;
  onStatReset: boolean;
  defaultSymbol: string;
  defaultContractType: string;
  defaultStake: number;
  defaultMultiplier: number;
  defaultGrowthRate?: number;
  defaultTakeProfit: number;
  defaultStopLoss: number;
  defaultMaxStake: number;
  description: string;
}

export const DERIV_QUICK_STRATEGIES: DerivQuickStrategy[] = [
  {
    id: 'martingale',
    name: 'Martingale',
    xmlFile: 'martingale.xml',
    category: 'Classic',
    progression: 'martingale',
    hasMaxStake: false,
    onStatReset: false,
    defaultSymbol: '1HZ100V',
    defaultContractType: 'CALL',
    defaultStake: 1,
    defaultMultiplier: 2.0,
    defaultTakeProfit: 10,
    defaultStopLoss: 25,
    defaultMaxStake: 32,
    description: 'Doubles stake after each loss to recover previous losses and secure initial profit on the next win.',
  },
  {
    id: 'martingale_max_stake',
    name: 'Martingale (Max Stake)',
    xmlFile: 'martingale_max-stake.xml',
    category: 'Classic',
    progression: 'martingale',
    hasMaxStake: true,
    onStatReset: false,
    defaultSymbol: '1HZ100V',
    defaultContractType: 'CALL',
    defaultStake: 1,
    defaultMultiplier: 2.0,
    defaultTakeProfit: 10,
    defaultStopLoss: 25,
    defaultMaxStake: 16,
    description: 'Martingale progression capped with a strict maximum stake ceiling to protect account equity.',
  },
  {
    id: 'dalembert',
    name: "D'Alembert",
    xmlFile: 'dalembert.xml',
    category: 'Classic',
    progression: 'dalembert',
    hasMaxStake: false,
    onStatReset: false,
    defaultSymbol: '1HZ100V',
    defaultContractType: 'CALL',
    defaultStake: 1,
    defaultMultiplier: 1.25,
    defaultTakeProfit: 10,
    defaultStopLoss: 20,
    defaultMaxStake: 15,
    description: 'Increases stake by one unit after a loss and decreases by one unit after a win for smoother recovery.',
  },
  {
    id: 'dalembert_max_stake',
    name: "D'Alembert (Max Stake)",
    xmlFile: 'dalembert_max-stake.xml',
    category: 'Classic',
    progression: 'dalembert',
    hasMaxStake: true,
    onStatReset: false,
    defaultSymbol: '1HZ100V',
    defaultContractType: 'CALL',
    defaultStake: 1,
    defaultMultiplier: 1.25,
    defaultTakeProfit: 10,
    defaultStopLoss: 20,
    defaultMaxStake: 10,
    description: "D'Alembert unit-step staking with a hard maximum stake guardrail.",
  },
  {
    id: 'oscars_grind',
    name: "Oscar's Grind",
    xmlFile: 'oscars_grind.xml',
    category: 'Classic',
    progression: 'oscars_grind',
    hasMaxStake: false,
    onStatReset: false,
    defaultSymbol: '1HZ75V',
    defaultContractType: 'DIGITOVER',
    defaultStake: 1,
    defaultMultiplier: 1.35,
    defaultTakeProfit: 12,
    defaultStopLoss: 20,
    defaultMaxStake: 15,
    description: 'Targets one unit of profit per session cycle, increasing stake only after wins following a loss.',
  },
  {
    id: 'oscars_grind_max_stake',
    name: "Oscar's Grind (Max Stake)",
    xmlFile: 'oscars_grind_max-stake.xml',
    category: 'Classic',
    progression: 'oscars_grind',
    hasMaxStake: true,
    onStatReset: false,
    defaultSymbol: '1HZ75V',
    defaultContractType: 'DIGITOVER',
    defaultStake: 1,
    defaultMultiplier: 1.35,
    defaultTakeProfit: 12,
    defaultStopLoss: 20,
    defaultMaxStake: 10,
    description: "Oscar's Grind cycle staking bounded by an explicit maximum stake cap.",
  },
  {
    id: '1_3_2_6',
    name: '1-3-2-6 System',
    xmlFile: '1_3_2_6.xml',
    category: 'Classic',
    progression: '1_3_2_6',
    hasMaxStake: true,
    onStatReset: false,
    defaultSymbol: '1HZ100V',
    defaultContractType: 'DIGITEVEN',
    defaultStake: 1,
    defaultMultiplier: 1.5,
    defaultTakeProfit: 15,
    defaultStopLoss: 15,
    defaultMaxStake: 6,
    description: 'Positive progression cycling 1x → 3x → 2x → 6x stake across winning streaks and resetting on any loss.',
  },
  {
    id: 'reverse_martingale',
    name: 'Reverse Martingale',
    xmlFile: 'reverse_martingale.xml',
    category: 'Classic',
    progression: 'reverse_martingale',
    hasMaxStake: true,
    onStatReset: false,
    defaultSymbol: '1HZ100V',
    defaultContractType: 'CALL',
    defaultStake: 1,
    defaultMultiplier: 2.0,
    defaultTakeProfit: 15,
    defaultStopLoss: 15,
    defaultMaxStake: 16,
    description: 'Compounds stake during winning streaks and immediately resets to base stake on a loss.',
  },
  {
    id: 'reverse_dalembert',
    name: "Reverse D'Alembert",
    xmlFile: 'reverse_dalembert.xml',
    category: 'Classic',
    progression: 'reverse_dalembert',
    hasMaxStake: true,
    onStatReset: false,
    defaultSymbol: '1HZ100V',
    defaultContractType: 'CALL',
    defaultStake: 1,
    defaultMultiplier: 1.25,
    defaultTakeProfit: 12,
    defaultStopLoss: 15,
    defaultMaxStake: 10,
    description: 'Adds one stake unit after wins and reduces by one unit after losses to ride momentum safely.',
  },
  {
    id: 'accumulators_martingale',
    name: 'Accumulators Martingale',
    xmlFile: 'accumulators_martingale.xml',
    category: 'Accumulators',
    progression: 'martingale',
    hasMaxStake: true,
    onStatReset: false,
    defaultSymbol: '1HZ100V',
    defaultContractType: 'ACCU',
    defaultStake: 2,
    defaultMultiplier: 2.0,
    defaultGrowthRate: 0.02,
    defaultTakeProfit: 15,
    defaultStopLoss: 30,
    defaultMaxStake: 20,
    description: 'Trades Deriv Accumulators with 1%–5% tick growth and Martingale recovery on barrier knockouts.',
  },
  {
    id: 'accumulators_martingale_on_stat_reset',
    name: 'Accumulators Martingale (Stat Reset)',
    xmlFile: 'accumulators_martingale_on_stat_reset.xml',
    category: 'Accumulators',
    progression: 'martingale',
    hasMaxStake: true,
    onStatReset: true,
    defaultSymbol: '1HZ100V',
    defaultContractType: 'ACCU',
    defaultStake: 2,
    defaultMultiplier: 2.0,
    defaultGrowthRate: 0.02,
    defaultTakeProfit: 15,
    defaultStopLoss: 30,
    defaultMaxStake: 20,
    description: 'Enters Accumulators immediately after a statistical barrier reset, paired with Martingale recovery.',
  },
  {
    id: 'accumulators_dalembert',
    name: "Accumulators D'Alembert",
    xmlFile: 'accumulators_dalembert.xml',
    category: 'Accumulators',
    progression: 'dalembert',
    hasMaxStake: true,
    onStatReset: false,
    defaultSymbol: '1HZ75V',
    defaultContractType: 'ACCU',
    defaultStake: 2,
    defaultMultiplier: 1.3,
    defaultGrowthRate: 0.02,
    defaultTakeProfit: 12,
    defaultStopLoss: 25,
    defaultMaxStake: 15,
    description: "Combines Accumulator compounding with conservative D'Alembert unit recovery.",
  },
  {
    id: 'accumulators_dalembert_on_stat_reset',
    name: "Accumulators D'Alembert (Stat Reset)",
    xmlFile: 'accumulators_dalembert_on_stat_reset.xml',
    category: 'Accumulators',
    progression: 'dalembert',
    hasMaxStake: true,
    onStatReset: true,
    defaultSymbol: '1HZ75V',
    defaultContractType: 'ACCU',
    defaultStake: 2,
    defaultMultiplier: 1.3,
    defaultGrowthRate: 0.02,
    defaultTakeProfit: 12,
    defaultStopLoss: 25,
    defaultMaxStake: 15,
    description: "Accumulator D'Alembert strategy triggered on statistical barrier reset windows.",
  },
  {
    id: 'accumulators_reverse_martingale',
    name: 'Accumulators Reverse Martingale',
    xmlFile: 'accumulators_reverse_martingale.xml',
    category: 'Accumulators',
    progression: 'reverse_martingale',
    hasMaxStake: true,
    onStatReset: false,
    defaultSymbol: '1HZ50V',
    defaultContractType: 'ACCU',
    defaultStake: 2,
    defaultMultiplier: 1.8,
    defaultGrowthRate: 0.03,
    defaultTakeProfit: 20,
    defaultStopLoss: 20,
    defaultMaxStake: 20,
    description: 'Scales up Accumulator stake after successful take-profit harvests and resets on knockout.',
  },
  {
    id: 'accumulators_reverse_martingale_on_stat_reset',
    name: 'Accumulators Reverse Martingale (Stat Reset)',
    xmlFile: 'accumulators_reverse_martingale_on_stat_reset.xml',
    category: 'Accumulators',
    progression: 'reverse_martingale',
    hasMaxStake: true,
    onStatReset: true,
    defaultSymbol: '1HZ50V',
    defaultContractType: 'ACCU',
    defaultStake: 2,
    defaultMultiplier: 1.8,
    defaultGrowthRate: 0.03,
    defaultTakeProfit: 20,
    defaultStopLoss: 20,
    defaultMaxStake: 20,
    description: 'Reverse Martingale Accumulator triggered after barrier stat resets.',
  },
  {
    id: 'accumulators_reverse_dalembert',
    name: "Accumulators Reverse D'Alembert",
    xmlFile: 'accumulators_reverse_dalembert.xml',
    category: 'Accumulators',
    progression: 'reverse_dalembert',
    hasMaxStake: true,
    onStatReset: false,
    defaultSymbol: '1HZ25V',
    defaultContractType: 'ACCU',
    defaultStake: 2,
    defaultMultiplier: 1.25,
    defaultGrowthRate: 0.02,
    defaultTakeProfit: 15,
    defaultStopLoss: 20,
    defaultMaxStake: 15,
    description: "Gentle positive-progression Reverse D'Alembert tailored for Accumulator contracts.",
  },
  {
    id: 'accumulators_reverse_dalembert_on_stat_reset',
    name: "Accumulators Reverse D'Alembert (Stat Reset)",
    xmlFile: 'accumulators_reverse_dalembert_on_stat_reset.xml',
    category: 'Accumulators',
    progression: 'reverse_dalembert',
    hasMaxStake: true,
    onStatReset: true,
    defaultSymbol: '1HZ25V',
    defaultContractType: 'ACCU',
    defaultStake: 2,
    defaultMultiplier: 1.25,
    defaultGrowthRate: 0.02,
    defaultTakeProfit: 15,
    defaultStopLoss: 20,
    defaultMaxStake: 15,
    description: "Reverse D'Alembert Accumulator triggered on statistical reset intervals.",
  },
];

export function quickStrategyToAst(
  s: DerivQuickStrategy,
  overrides?: Partial<{
    symbol: string;
    contractType: string;
    stake: number;
    takeProfit: number;
    stopLoss: number;
    maxStake: number;
    martingaleFactor: number;
    duration: number;
    barrier: string;
  }>
): BotStrategyAst {
  const symbol = overrides?.symbol || s.defaultSymbol;
  const contractType = overrides?.contractType || s.defaultContractType;
  const stake = overrides?.stake ?? s.defaultStake;
  const duration = overrides?.duration ?? (contractType === 'ACCU' ? 5 : 1);
  const barrier = overrides?.barrier ?? (contractType === 'DIGITOVER' ? '2' : contractType === 'DIGITUNDER' ? '7' : '2');

  return {
    version: '1.0',
    name: s.name.replace(/[^A-Za-z0-9_-]+/g, '_'),
    market: {
      instrument: symbol,
      category: 'Synthetic',
      timeframe: '1m',
      granularity: 60,
      contractType,
    },
    conditions: s.onStatReset
      ? [{ id: `cond_${s.id}_1`, type: 'rsi_condition', params: { period: 14, operator: '<', threshold: 65 } }]
      : [{ id: `cond_${s.id}_1`, type: 'price_movement', params: { operator: 'digit_gte', value: 0 } }],
    conditionLogic: 'ALL',
    actions: [
      { type: 'SET_STAKE', params: { stake } },
      { type: 'SET_DURATION', params: { duration, unit: 't' } },
      { type: 'BUY', params: { barrier } },
      { type: 'EVALUATE_OUTCOME', params: { applyMartingale: true } },
    ],
    risk: {
      maxStake: overrides?.maxStake ?? s.defaultMaxStake,
      maxDailyLoss: Math.max(overrides?.stopLoss ?? s.defaultStopLoss, 25),
      takeProfit: overrides?.takeProfit ?? s.defaultTakeProfit,
      stopLoss: overrides?.stopLoss ?? s.defaultStopLoss,
      cooldownSeconds: 1,
      maxConsecutiveLosses: 6,
      maxSessions: 40,
      martingaleFactor: overrides?.martingaleFactor ?? s.defaultMultiplier,
    },
  };
}

export async function fetchQuickStrategyXml(xmlFile: string): Promise<string> {
  const res = await fetch(`/bot-xml/${encodeURIComponent(xmlFile)}`);
  if (!res.ok) throw new Error(`Unable to load ${xmlFile}`);
  return res.text();
}
