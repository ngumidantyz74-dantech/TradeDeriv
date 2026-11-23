import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  createChart,
  AreaSeries,
  ColorType,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from 'lightweight-charts';
import {
  Play,
  Square,
  Upload,
  Download,
  Trash2,
  Activity,
  Zap,
  CheckCircle2,
  XCircle,
  RotateCcw,
  CandlestickChart,
  ChevronRight,
  ChevronLeft,
  LayoutGrid,
  Sparkles,
  Search,
  X,
  ArrowUpRight,
  Blocks,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { apiFetch } from '../lib/api';
import { getCanonicalBalances, computeLiveOrderMetrics } from '../lib/balances';
import type { BotTelemetry, CandleData, MarketInstrument } from '../types';

type TradeTypeGroup =
  | 'Digits > Over/Under'
  | 'Digits > Even/Odd'
  | 'Digits > Match/Differ'
  | 'Options > Rise/Fall'
  | 'Options > Accumulators'
  | 'CFDs > Multipliers';

const TRADE_TYPE_OPTIONS: Record<TradeTypeGroup, Array<{ value: string; label: string }>> = {
  'Digits > Over/Under': [
    { value: 'DIGITOVER', label: 'Over' },
    { value: 'DIGITUNDER', label: 'Under' },
  ],
  'Digits > Even/Odd': [
    { value: 'DIGITEVEN', label: 'Even' },
    { value: 'DIGITODD', label: 'Odd' },
  ],
  'Digits > Match/Differ': [
    { value: 'DIGITMATCH', label: 'Matches' },
    { value: 'DIGITDIFF', label: 'Differs' },
  ],
  'Options > Rise/Fall': [
    { value: 'CALL', label: 'Rise (CALL)' },
    { value: 'PUT', label: 'Fall (PUT)' },
  ],
  'Options > Accumulators': [{ value: 'ACCU', label: 'Accumulator (Growth)' }],
  'CFDs > Multipliers': [
    { value: 'MULTUP', label: 'Multiplier Up' },
    { value: 'MULTDOWN', label: 'Multiplier Down' },
  ],
};

interface QuickStrategyDef {
  key: string;
  name: string;
  category: 'Accumulators' | 'Options';
  contractType: string;
  desc: string;
  defaultFactor: string;
}

const QUICK_STRATEGIES: QuickStrategyDef[] = [
  {
    key: 'martingale',
    name: 'Martingale',
    category: 'Options',
    contractType: 'DIGITOVER',
    desc: 'Doubles or scales stake after a loss and resets to initial stake on a win.',
    defaultFactor: '2.1',
  },
  {
    key: 'martingale_stat_reset',
    name: 'Martingale on Stat Reset',
    category: 'Accumulators',
    contractType: 'ACCU',
    desc: 'Compounds accumulator targets and scales stake following statistical barrier resets.',
    defaultFactor: '2.0',
  },
  {
    key: 'dalembert',
    name: "D'Alembert",
    category: 'Options',
    contractType: 'DIGITEVEN',
    desc: 'Increases stake by one unit after a loss and decreases by one unit after a win.',
    defaultFactor: '1.25',
  },
  {
    key: 'dalembert_stat_reset',
    name: "D'Alembert on Stat Reset",
    category: 'Accumulators',
    contractType: 'ACCU',
    desc: 'Measured linear recovery progression synced to accumulator range resets.',
    defaultFactor: '1.25',
  },
  {
    key: 'reverse_martingale',
    name: 'Reverse Martingale',
    category: 'Options',
    contractType: 'CALL',
    desc: 'Increases stake during winning streaks to maximize trend momentum.',
    defaultFactor: '1.6',
  },
  {
    key: 'reverse_dalembert',
    name: 'Reverse D\'Alembert',
    category: 'Options',
    contractType: 'PUT',
    desc: 'Steps stake up gently after wins and steps down immediately after a loss.',
    defaultFactor: '1.2',
  },
  {
    key: 'oscars_grind',
    name: "Oscar's Grind",
    category: 'Options',
    contractType: 'DIGITOVER',
    desc: 'Targets steady +1 unit net session profit while capping drawdown during cold runs.',
    defaultFactor: '1.3',
  },
  {
    key: '1_3_2_6',
    name: '1-3-2-6',
    category: 'Options',
    contractType: 'CALL',
    desc: 'Structured 4-step positive progression cycle protecting early gains.',
    defaultFactor: '1.5',
  },
];

function inferGroupFromContract(ct: string): TradeTypeGroup {
  const upper = String(ct || '').toUpperCase();
  if (upper === 'ACCU') return 'Options > Accumulators';
  if (upper === 'DIGITEVEN' || upper === 'DIGITODD') return 'Digits > Even/Odd';
  if (upper === 'DIGITMATCH' || upper === 'DIGITDIFF') return 'Digits > Match/Differ';
  if (upper === 'CALL' || upper === 'PUT') return 'Options > Rise/Fall';
  if (upper === 'MULTUP' || upper === 'MULTDOWN') return 'CFDs > Multipliers';
  return 'Digits > Over/Under';
}

export const BotBuilderPage: React.FC = () => {
  const {
    user,
    accounts,
    instruments,
    selectedSymbol,
    accountMode,
    setAccountMode,
    activeConnectedAccount,
    setActiveTab,
    setSelectedSymbol,
    tradePreset,
    setTradePreset,
    analyserSignal,
    refreshAnalyserSignal,
    ticks,
    orders,
    theme,
    formatMoney,
    refreshOrders,
    refreshAll,
    showToast,
  } = useApp();

  // Deriv Bot Sub-view: Dashboard | Bot Builder | Chart
  const [botView, setBotView] = useState<'dashboard' | 'builder' | 'chart'>('builder');
  const [telemetryTab, setTelemetryTab] = useState<'summary' | 'transactions' | 'journal'>('summary');

  // Block 1: Trade parameters
  const [strategyName, setStrategyName] = useState('07_Over_Hit_n_Run');
  const [strategyType, setStrategyType] = useState<string>('martingale');
  const [marketCategory, setMarketCategory] = useState<'All' | MarketInstrument['category']>('Synthetic');
  const [symbol, setSymbol] = useState(selectedSymbol || '1HZ100V');
  const [alternateMarkets, setAlternateMarkets] = useState(false);
  const [tradeTypeGroup, setTradeTypeGroup] = useState<TradeTypeGroup>('Digits > Over/Under');
  const [contractType, setContractType] = useState('DIGITOVER');
  const [candleInterval, setCandleInterval] = useState<'1t' | '1m' | '5m' | '15m'>('1m');
  const [restartBuySellOnError, setRestartBuySellOnError] = useState(false);
  const [restartLastTradeOnError, setRestartLastTradeOnError] = useState(true);

  // Run once at start (calibrated for <$50 pro risk management)
  const [baseStake, setBaseStake] = useState('1.0');
  const [barrier, setBarrier] = useState('2');
  const [growthRate, setGrowthRate] = useState<number>(0.02);
  const [martingale, setMartingale] = useState('2.1');
  const [useMartingale, setUseMartingale] = useState<'true' | 'false'>('true');
  const [takeProfit, setTakeProfit] = useState('6');
  const [stopLoss, setStopLoss] = useState('3');
  const [maxTrades, setMaxTrades] = useState('15');
  const [multiplier, setMultiplier] = useState('100');

  // Analyser Sync Toggle
  const [analyserSync, setAnalyserSync] = useState<boolean>(false);

  // Trade options & Block 2
  const [duration, setDuration] = useState('1');
  const [durationUnit, setDurationUnit] = useState('t');
  const [tradeEachTick, setTradeEachTick] = useState(true);
  const [entryCondition, setEntryCondition] = useState<'any_tick' | 'last_digit_gte' | 'last_digit_lte' | 'rsi_signal'>(
    'last_digit_gte'
  );
  const [conditionDigit, setConditionDigit] = useState('2');
  const [allowBulk, setAllowBulk] = useState<'No' | 'Yes'>('No');
  const [bulkCount, setBulkCount] = useState('1');
  const [executionSpeed, setExecutionSpeed] = useState<'fast' | 'normal'>('fast');

  // Quick Strategy 2-Step Modal
  const [qsOpen, setQsOpen] = useState(false);
  const [qsStep, setQsStep] = useState<1 | 2>(1);
  const [qsSearch, setQsSearch] = useState('');
  const [qsFilter, setQsFilter] = useState<'All' | 'Accumulators' | 'Options'>('All');
  const [qsSelected, setQsSelected] = useState<QuickStrategyDef>(QUICK_STRATEGIES[0]);

  const [telemetry, setTelemetry] = useState<BotTelemetry | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  // Embedded Lightweight Chart refs (for Deriv Bot Chart tab)
  const chartContainerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Area'> | null>(null);
  const [candles, setCandles] = useState<CandleData[]>([]);

  const { optionsBal } = getCanonicalBalances(user, accounts, accountMode, activeConnectedAccount);

  const filteredSymbols = useMemo(() => {
    if (marketCategory === 'All') return instruments;
    const list = instruments.filter((i) => i.category === marketCategory);
    return list.length > 0 ? list : instruments;
  }, [instruments, marketCategory]);

  // Consume tradePreset from OptionsHub or Market Analyser
  useEffect(() => {
    if (!tradePreset) return;
    if (tradePreset.symbol) {
      setSymbol(tradePreset.symbol);
      const found = instruments.find((i) => i.symbol === tradePreset.symbol);
      if (found) setMarketCategory(found.category);
    }
    if (tradePreset.contractType) {
      setContractType(tradePreset.contractType);
      setTradeTypeGroup(inferGroupFromContract(tradePreset.contractType));
    }
    if (tradePreset.barrier !== undefined) setBarrier(String(tradePreset.barrier));
    if (tradePreset.growthRate) setGrowthRate(tradePreset.growthRate);
    if (tradePreset.stake && tradePreset.stake > 0) setBaseStake(String(tradePreset.stake));
    if (tradePreset.strategyType) setStrategyType(tradePreset.strategyType);
    if (tradePreset.analyserSync) {
      setAnalyserSync(true);
      setStrategyName(`AnalyserSync_${tradePreset.symbol || symbol}`);
    }
    setBotView('builder');
    setTradePreset(null);
  }, [tradePreset, instruments, symbol, setTradePreset]);

  // Load strategy if sent from TradingBotsPage
  useEffect(() => {
    const raw = sessionStorage.getItem('td_loaded_bot');
    if (raw) {
      sessionStorage.removeItem('td_loaded_bot');
      try {
        const s = JSON.parse(raw);
        if (s.name) setStrategyName(s.name);
        if (s.symbol) {
          setSymbol(s.symbol);
          const found = instruments.find((i) => i.symbol === s.symbol);
          if (found) setMarketCategory(found.category);
        }
        if (s.contract_type) {
          setContractType(s.contract_type);
          setTradeTypeGroup(inferGroupFromContract(s.contract_type));
        }
        if (s.config?.stake) setBaseStake(String(s.config.stake));
        if (s.config?.barrier !== undefined) setBarrier(String(s.config.barrier));
        if (s.config?.duration) setDuration(String(s.config.duration));
        if (s.config?.duration_unit) setDurationUnit(String(s.config.duration_unit));
        if (s.config?.multiplier) setMultiplier(String(s.config.multiplier));
        if (s.config?.martingale) setMartingale(String(s.config.martingale));
        if (s.config?.takeProfit) setTakeProfit(String(s.config.takeProfit));
        if (s.config?.stopLoss) setStopLoss(String(s.config.stopLoss));
        if (s.config?.maxTrades) setMaxTrades(String(s.config.maxTrades));
      } catch {
        // ignore
      }
    }
  }, [instruments]);

  // Sync blocks automatically when Analyser Sync is active
  const handleToggleAnalyserSync = async (enable: boolean) => {
    setAnalyserSync(enable);
    if (enable) {
      const sig = analyserSignal || (await refreshAnalyserSignal(symbol));
      if (sig) {
        setSymbol(sig.symbol || symbol);
        setContractType(sig.contractType || 'DIGITOVER');
        setTradeTypeGroup(inferGroupFromContract(sig.contractType));
        if (sig.barrier) setBarrier(sig.barrier);
        if (sig.growthRate) setGrowthRate(sig.growthRate);
        setDuration(String(sig.duration || 1));
        setDurationUnit(sig.durationUnit || 't');
        setStrategyName(`AnalyserSync_${sig.symbol}`);
        showToast(`Synced Bot Builder to Live Market Analyser (${sig.contractType} · ${sig.confidence}%)`, 'success');
      }
    }
  };

  const pollStatus = useCallback(async () => {
    try {
      const res = await apiFetch<{ telemetry: BotTelemetry | null }>('/api/bots/status');
      setTelemetry(res.telemetry);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    pollStatus();
    const timer = setInterval(pollStatus, 2000);
    return () => clearInterval(timer);
  }, [pollStatus]);

  // Embedded Lightweight Chart when botView === 'chart'
  useEffect(() => {
    if (botView !== 'chart') return;
    let active = true;
    const load = () => {
      apiFetch<{ candles: CandleData[] }>(
        `/api/market/candles?symbol=${encodeURIComponent(symbol)}&granularity=60&count=120&_t=${Date.now()}`,
        { skipAuth: true, cache: 'no-store' }
      )
        .then((res) => {
          if (active && Array.isArray(res.candles)) setCandles(res.candles);
        })
        .catch(() => {});
    };
    load();
    const id = setInterval(load, 3000);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [botView, symbol]);

  useEffect(() => {
    if (botView !== 'chart') return;
    const el = chartContainerRef.current;
    if (!el) return;
    const isDark = theme === 'dark';
    const chart = createChart(el, {
      width: el.clientWidth,
      height: 380,
      layout: {
        background: { type: ColorType.Solid, color: isDark ? '#151820' : '#FFFFFF' },
        textColor: isDark ? '#94A3B8' : '#475569',
      },
      grid: {
        vertLines: { color: isDark ? '#1F2430' : '#F1F5F9' },
        horzLines: { color: isDark ? '#1F2430' : '#F1F5F9' },
      },
      timeScale: { timeVisible: true, secondsVisible: true },
    });
    const series = chart.addSeries(AreaSeries, {
      lineColor: '#FF444F',
      topColor: 'rgba(255, 68, 79, 0.25)',
      bottomColor: 'rgba(255, 68, 79, 0.02)',
      lineWidth: 2,
    });
    chartRef.current = chart;
    seriesRef.current = series;

    const ro = new ResizeObserver(() => {
      if (chartContainerRef.current) {
        chart.applyOptions({ width: chartContainerRef.current.clientWidth, height: 380 });
      }
    });
    ro.observe(el);

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, [botView, theme]);

  useEffect(() => {
    if (botView !== 'chart' || !seriesRef.current || candles.length === 0) return;
    seriesRef.current.setData(candles.map((c) => ({ time: c.time as UTCTimestamp, value: c.close })));
    chartRef.current?.timeScale().scrollToRealTime();
  }, [botView, candles]);

  useEffect(() => {
    const t = ticks[symbol];
    if (botView !== 'chart' || !seriesRef.current || !t || candles.length === 0) return;
    if (t.source !== 'deriv_ws' && t.source !== 'live_pulse') return;
    try {
      const bucket = Math.floor(t.epoch / 60) * 60;
      seriesRef.current.update({ time: bucket as UTCTimestamp, value: t.quote });
    } catch {
      // ignore out-of-order point
    }
  }, [botView, ticks, symbol, candles.length]);

  const handleGroupChange = (group: TradeTypeGroup) => {
    setTradeTypeGroup(group);
    const first = TRADE_TYPE_OPTIONS[group][0];
    if (first) setContractType(first.value);
  };

  const handleResetDefaults = () => {
    setStrategyName('07_Over_Hit_n_Run');
    setStrategyType('martingale');
    setMarketCategory('Synthetic');
    setSymbol('1HZ100V');
    setTradeTypeGroup('Digits > Over/Under');
    setContractType('DIGITOVER');
    setBaseStake('1.0');
    setBarrier('2');
    setGrowthRate(0.02);
    setMartingale('2.1');
    setUseMartingale('true');
    setTakeProfit('6');
    setStopLoss('3');
    setMaxTrades('15');
    setDuration('1');
    setDurationUnit('t');
    setEntryCondition('last_digit_gte');
    setConditionDigit('2');
    setAllowBulk('No');
    setBulkCount('1');
    setExecutionSpeed('fast');
    setAnalyserSync(false);
    showToast('Bot blocks reset to default parameters', 'info');
  };

  const handleRunBot = async (e?: React.FormEvent, overrides?: Partial<Record<string, any>>) => {
    if (e) e.preventDefault();
    setSubmitting(true);
    try {
      const payload = {
        strategyName: overrides?.strategyName ?? strategyName,
        strategyType: overrides?.strategyType ?? strategyType,
        symbol: overrides?.symbol ?? symbol,
        contractType: overrides?.contractType ?? contractType,
        baseStake: Number(overrides?.baseStake ?? baseStake),
        barrier: overrides?.barrier ?? barrier,
        duration: Number(overrides?.duration ?? duration),
        durationUnit: overrides?.durationUnit ?? durationUnit,
        multiplier: Number(multiplier),
        martingale: useMartingale === 'true' ? Number(overrides?.martingale ?? martingale) : 1.0,
        takeProfit: Number(overrides?.takeProfit ?? takeProfit),
        stopLoss: Number(overrides?.stopLoss ?? stopLoss),
        maxTrades: Number(maxTrades),
        growthRate: overrides?.growthRate ?? growthRate,
        analyserSync: overrides?.analyserSync ?? analyserSync,
        accountMode,
        executionSpeed,
        executionMode: accountMode === 'real' && activeConnectedAccount ? 'deriv' : 'virtual',
        connectedAccountId: activeConnectedAccount?.id || null,
      };
      const res = await apiFetch<{ telemetry: BotTelemetry }>('/api/bots/run', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      setTelemetry(res.telemetry);
      await Promise.all([refreshOrders(), refreshAll()]);
      showToast(`${payload.strategyName} active in ${accountMode.toUpperCase()} mode`, 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to start bot', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleStopBot = async () => {
    try {
      const res = await apiFetch<{ telemetry: BotTelemetry | null }>('/api/bots/stop', { method: 'POST' });
      setTelemetry(res.telemetry);
      await Promise.all([refreshOrders(), refreshAll()]);
      showToast('Bot engine stopped', 'info');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to stop bot', 'error');
    }
  };

  const handleCloseAllBotOrders = async () => {
    try {
      const res = await apiFetch<{ closedCount: number }>('/api/bots/close-all', { method: 'POST' });
      await Promise.all([refreshOrders(), refreshAll()]);
      showToast(`Closed ${res.closedCount} bot order(s)`, 'info');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to close bot orders', 'error');
    }
  };

  const handleImportXml = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const xml = String(reader.result || '');
      const symMatch = xml.match(/<field\s+name=["']SYMBOL_LIST["']>([^<]+)<\/field>/i);
      const amtMatch = xml.match(/<field\s+name=["']AMOUNT["']>([^<]+)<\/field>/i);
      const typeMatch = xml.match(/<field\s+name=["']TYPE_LIST["']>([^<]+)<\/field>/i);
      const durMatch = xml.match(/<field\s+name=["']DURATION["']>([^<]+)<\/field>/i);
      const predMatch = xml.match(/<field\s+name=["']PREDICTION["']>([^<]+)<\/field>/i);

      if (symMatch?.[1]) setSymbol(symMatch[1].trim());
      if (amtMatch?.[1]) setBaseStake(amtMatch[1].trim());
      if (typeMatch?.[1]) {
        const ct = typeMatch[1].trim();
        setContractType(ct);
        setTradeTypeGroup(inferGroupFromContract(ct));
      }
      if (durMatch?.[1]) setDuration(durMatch[1].trim());
      if (predMatch?.[1]) setBarrier(predMatch[1].trim());
      setStrategyName(file.name.replace(/\.xml$/i, ''));
      showToast(`Imported Blockly XML (${file.name})`, 'success');
    };
    reader.readAsText(file);
  };

  const handleExportXml = () => {
    const xml = `<xml xmlns="https://developers.google.com/blockly/xml">
  <block type="trade_definition">
    <field name="SYMBOL_LIST">${symbol}</field>
    <field name="TYPE_LIST">${contractType}</field>
    <field name="DURATION">${duration}</field>
    <field name="DURATION_TYPE">${durationUnit}</field>
    <field name="AMOUNT">${baseStake}</field>
    <field name="PREDICTION">${barrier}</field>
    <field name="MARTINGALE">${martingale}</field>
    <field name="TAKE_PROFIT">${takeProfit}</field>
    <field name="STOP_LOSS">${stopLoss}</field>
  </block>
</xml>`;
    const blob = new Blob([xml], { type: 'application/xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${strategyName.replace(/[^a-z0-9_-]/gi, '_')}.xml`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Blockly XML exported', 'success');
  };

  const filteredQuickStrategies = useMemo(() => {
    const q = qsSearch.trim().toLowerCase();
    return QUICK_STRATEGIES.filter((s) => {
      if (qsFilter !== 'All' && s.category !== qsFilter) return false;
      if (q && !s.name.toLowerCase().includes(q) && !s.desc.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [qsSearch, qsFilter]);

  const applyQuickStrategy = (runNow: boolean) => {
    setStrategyName(qsSelected.name);
    setStrategyType(qsSelected.key);
    setContractType(qsSelected.contractType);
    setTradeTypeGroup(inferGroupFromContract(qsSelected.contractType));
    setUseMartingale('true');
    setQsOpen(false);
    setBotView('builder');
    if (runNow) {
      handleRunBot(undefined, {
        strategyName: qsSelected.name,
        strategyType: qsSelected.key,
        contractType: qsSelected.contractType,
      });
    } else {
      showToast(`${qsSelected.name} loaded into Bot Builder`, 'success');
    }
  };

  const botOrders = useMemo(
    () => orders.filter((o) => o.source === 'bot'),
    [orders]
  );
  const contractChoices = TRADE_TYPE_OPTIONS[tradeTypeGroup];

  return (
    <div className="max-w-7xl mx-auto px-3 sm:px-6 pt-4 pb-24 space-y-4">
      {/* Deriv Bot (DB) Top Header */}
      <div className="bg-white dark:bg-[#181C25] border border-slate-200 dark:border-[#2A2F3D] rounded-2xl px-4 py-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <span className="w-9 h-9 rounded-lg bg-[#FF444F] text-white font-display font-bold text-sm flex items-center justify-center shrink-0">
            DB
          </span>
          <div className="min-w-0">
            <h1 className="font-display text-base sm:text-lg font-bold leading-tight truncate">Deriv Bot</h1>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Visual Strategy Builder, Quick Strategies &amp; Live Signal Sync
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
          <div className="inline-flex items-center bg-[#F4F5F7] dark:bg-[#111319] p-0.5 rounded-full">
            <button
              type="button"
              onClick={() => setAccountMode('real')}
              className={`px-3 py-1 rounded-full text-xs font-bold cursor-pointer ${
                accountMode === 'real' ? 'bg-[#FF444F] text-white' : 'text-slate-500'
              }`}
            >
              Real
            </button>
            <button
              type="button"
              onClick={() => setAccountMode('demo')}
              className={`px-3 py-1 rounded-full text-xs font-bold cursor-pointer ${
                accountMode === 'demo' ? 'bg-[#151820] text-white dark:bg-white dark:text-[#151820]' : 'text-slate-500'
              }`}
            >
              Demo
            </button>
          </div>

          <div className="px-3 py-1.5 rounded-xl bg-[#F4F5F7] dark:bg-[#111319] font-mono tabular-nums text-xs sm:text-sm font-bold">
            {formatMoney(optionsBal, { hideable: true })}
          </div>

          <a
            href="https://app.deriv.com/cashier/deposit"
            target="_blank"
            rel="noopener noreferrer"
            className="px-4 py-1.5 rounded-full bg-[#FF444F] hover:bg-[#E63946] text-white text-xs font-bold inline-flex items-center gap-1 whitespace-nowrap"
          >
            Deposit <ArrowUpRight className="w-3.5 h-3.5" />
          </a>
        </div>
      </div>

      {/* Sub-navigation bar matching Deriv Bot: Dashboard | Bot Builder | Chart + Quick Strategy */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex items-center bg-white dark:bg-[#181C25] border border-slate-200 dark:border-[#2A2F3D] p-1 rounded-xl">
          {(
            [
              { id: 'dashboard', label: 'Dashboard', icon: LayoutGrid },
              { id: 'builder', label: 'Bot Builder', icon: Blocks },
              { id: 'chart', label: 'Chart', icon: CandlestickChart },
            ] as const
          ).map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setBotView(tab.id)}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer ${
                  botView === tab.id ? 'bg-[#FF444F] text-white' : 'text-slate-600 dark:text-slate-300'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {tab.label}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => {
              setQsStep(1);
              setQsOpen(true);
            }}
            className="px-3.5 py-2 rounded-xl bg-[#151820] dark:bg-white dark:text-[#151820] text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
          >
            <Zap className="w-3.5 h-3.5 text-[#FF444F]" />
            Quick strategy
          </button>

          <button
            type="button"
            onClick={() => handleToggleAnalyserSync(!analyserSync)}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 border cursor-pointer ${
              analyserSync
                ? 'bg-[#00A878]/15 border-[#00A878] text-[#00A878]'
                : 'bg-white dark:bg-[#181C25] border-slate-200 dark:border-[#2A2F3D] text-slate-700 dark:text-slate-200'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            {analyserSync ? 'Analyser Live Sync: ON' : 'Sync Market Analyser'}
          </button>
        </div>
      </div>

      {/* Live Market Analyser Feed Bar */}
      {analyserSignal && (
        <div className="rounded-2xl bg-[#151820] text-white border border-[#2A2F3D] px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-bold text-[#00A878]">Analyser Live Feed:</span>
            <span className="font-mono font-bold">{analyserSignal.displayName}</span>
            <span className="px-2 py-0.5 rounded bg-white/10 font-mono text-[11px] font-bold">
              {analyserSignal.contractType} · {analyserSignal.confidence}% conf.
            </span>
            <span className="text-slate-400 hidden sm:inline truncate max-w-md">{analyserSignal.reason}</span>
          </div>
          {!analyserSync && (
            <button
              type="button"
              onClick={() => handleToggleAnalyserSync(true)}
              className="text-xs font-bold text-[#00A878] hover:underline cursor-pointer"
            >
              Sync to Bot
            </button>
          )}
        </div>
      )}

      {/* VIEW 1: DASHBOARD */}
      {botView === 'dashboard' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            {
              title: 'Quick strategy',
              desc: 'Choose Martingale, D\'Alembert, Oscar\'s Grind, 1-3-2-6, or Accumulator resets in 2 simple steps.',
              cta: 'Open Quick Strategy',
              action: () => {
                setQsStep(1);
                setQsOpen(true);
              },
            },
            {
              title: 'Bot Builder',
              desc: 'Configure Trade parameters, Purchase conditions, and custom Blockly XML templates.',
              cta: 'Open Bot Builder',
              action: () => setBotView('builder'),
            },
            {
              title: 'Analyser Sync Engine',
              desc: 'Stream live high-confidence Market Analyser setups directly into your bot contract execution.',
              cta: analyserSync ? 'Sync Active' : 'Enable Analyser Sync',
              action: () => {
                handleToggleAnalyserSync(true);
                setBotView('builder');
              },
            },
            {
              title: 'Prebuilt Bots & Lab',
              desc: 'Browse strategy templates and inspect historical Deriv candle backtests.',
              cta: 'Open Strategy Lab',
              action: () => setActiveTab('trading-bots'),
            },
          ].map((card) => (
            <div
              key={card.title}
              className="p-5 rounded-2xl bg-white dark:bg-[#181C25] border border-slate-200 dark:border-[#2A2F3D] flex flex-col justify-between space-y-4"
            >
              <div>
                <h2 className="font-display text-base font-bold">{card.title}</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5">{card.desc}</p>
              </div>
              <button
                type="button"
                onClick={card.action}
                className="w-full py-2.5 rounded-xl bg-[#FF444F] hover:bg-[#E63946] text-white text-xs font-bold cursor-pointer"
              >
                {card.cta}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* VIEW 2: EMBEDDED CHART */}
      {botView === 'chart' && (
        <div className="bg-white dark:bg-[#181C25] border border-slate-200 dark:border-[#2A2F3D] rounded-2xl p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="font-display font-bold text-sm">{symbol}</span>
              <span className="font-mono text-sm font-bold text-[#00A878]">
                {ticks[symbol]?.quote ? ticks[symbol].quote.toFixed(2) : candles[candles.length - 1]?.close?.toFixed(2) || '—'}
              </span>
            </div>
            <button
              type="button"
              onClick={() => {
                setSelectedSymbol(symbol);
                setActiveTab('mt5-tv');
              }}
              className="px-3 py-1.5 rounded-lg bg-[#151820] text-white text-xs font-semibold cursor-pointer"
            >
              Open Advanced Terminal
            </button>
          </div>
          <div ref={chartContainerRef} className="w-full h-[380px] rounded-xl overflow-hidden" />
        </div>
      )}

      {/* VIEW 3: BOT BUILDER + TELEMETRY */}
      {botView === 'builder' && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 flex-wrap">
              <input ref={fileRef} type="file" accept=".xml" onChange={handleImportXml} className="hidden" />
              <input
                type="text"
                value={strategyName}
                onChange={(e) => setStrategyName(e.target.value)}
                aria-label="Bot Strategy Name"
                className="px-3 py-2 rounded-xl bg-white dark:bg-[#181C25] border border-slate-200 dark:border-[#2A2F3D] text-xs font-bold w-48"
              />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="px-3 py-2 rounded-xl bg-[#F4F5F7] dark:bg-[#181C25] border border-slate-200 dark:border-[#2A2F3D] text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
              >
                <Upload className="w-3.5 h-3.5" /> Import XML
              </button>
              <button
                type="button"
                onClick={handleExportXml}
                className="px-3 py-2 rounded-xl bg-[#F4F5F7] dark:bg-[#181C25] border border-slate-200 dark:border-[#2A2F3D] text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" /> Export XML
              </button>
            </div>
          </div>

          <div className="flex gap-3 sm:gap-4 items-start">
            {/* Left Vertical Workspace Rail */}
            <aside className="hidden sm:flex flex-col items-center gap-2 w-11 py-3 rounded-2xl bg-white dark:bg-[#181C25] border border-slate-200 dark:border-[#2A2F3D] shrink-0">
              <button
                type="button"
                onClick={handleResetDefaults}
                title="Reset Bot Parameters"
                className="p-2 rounded-xl text-slate-500 hover:bg-[#F4F5F7] dark:hover:bg-white/10 hover:text-[#FF444F] cursor-pointer"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                title="Load XML"
                className="p-2 rounded-xl text-slate-500 hover:bg-[#F4F5F7] dark:hover:bg-white/10 hover:text-[#1958B7] cursor-pointer"
              >
                <Upload className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={handleExportXml}
                title="Save XML"
                className="p-2 rounded-xl text-slate-500 hover:bg-[#F4F5F7] dark:hover:bg-white/10 hover:text-[#00A878] cursor-pointer"
              >
                <Download className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setBotView('chart')}
                title="Open Chart"
                className="p-2 rounded-xl text-slate-500 hover:bg-[#F4F5F7] dark:hover:bg-white/10 hover:text-[#FF444F] cursor-pointer"
              >
                <CandlestickChart className="w-4 h-4" />
              </button>
            </aside>

            <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
              {/* Structured Block Sequence */}
              <form onSubmit={handleRunBot} className="lg:col-span-7 space-y-4">
                {/* BLOCK 1: Trade parameters */}
                <div className="rounded-2xl overflow-hidden border border-slate-200 dark:border-[#2A2F3D] bg-white dark:bg-[#181C25] shadow-xs">
                  <div className="px-4 py-2.5 bg-[#0F1F38] text-white flex items-center justify-between">
                    <span className="font-display text-sm font-bold">1. Trade parameters</span>
                    <span className="text-[11px] font-mono-num text-slate-300">{symbol}</span>
                  </div>

                  <div className="p-4 space-y-3 text-xs">
                    <div className="p-3 rounded-xl bg-[#F4F5F7] dark:bg-[#111319] space-y-2">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-semibold text-slate-500">Market:</span>
                        <select
                          value={marketCategory}
                          onChange={(e) => setMarketCategory(e.target.value as any)}
                          className="px-2.5 py-1.5 rounded-lg bg-white dark:bg-[#181C25] border border-slate-200 dark:border-[#2A2F3D] font-semibold"
                        >
                          <option value="Synthetic">Synthetics</option>
                          <option value="Forex">Forex</option>
                          <option value="Crypto">Crypto</option>
                          <option value="Metals/Cmd">Commodities</option>
                          <option value="Indices">Indices</option>
                          <option value="All">All Markets</option>
                        </select>
                        <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                        <select
                          value={symbol}
                          onChange={(e) => setSymbol(e.target.value)}
                          className="flex-1 min-w-[170px] px-2.5 py-1.5 rounded-lg bg-white dark:bg-[#181C25] border border-slate-200 dark:border-[#2A2F3D] font-semibold"
                        >
                          {filteredSymbols.map((inst) => (
                            <option key={inst.symbol} value={inst.symbol}>
                              {inst.display_name} ({inst.symbol})
                            </option>
                          ))}
                        </select>
                      </div>

                      <label className="inline-flex items-center gap-2 text-[11px] text-slate-500 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={alternateMarkets}
                          onChange={(e) => setAlternateMarkets(e.target.checked)}
                          className="accent-[#FF444F]"
                        />
                        Alternate markets (Continuous Indices rotation)
                      </label>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <div className="p-2.5 rounded-xl bg-[#F4F5F7] dark:bg-[#111319] flex items-center justify-between gap-2">
                        <span className="font-semibold text-slate-500 shrink-0">Trade Type:</span>
                        <select
                          value={tradeTypeGroup}
                          onChange={(e) => handleGroupChange(e.target.value as TradeTypeGroup)}
                          className="px-2.5 py-1.5 rounded-lg bg-white dark:bg-[#181C25] border border-slate-200 dark:border-[#2A2F3D] font-semibold text-xs"
                        >
                          {(Object.keys(TRADE_TYPE_OPTIONS) as TradeTypeGroup[]).map((grp) => (
                            <option key={grp} value={grp}>
                              {grp}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="p-2.5 rounded-xl bg-[#F4F5F7] dark:bg-[#111319] flex items-center justify-between gap-2">
                        <span className="font-semibold text-slate-500 shrink-0">Contract Type:</span>
                        <select
                          value={contractType}
                          onChange={(e) => setContractType(e.target.value)}
                          className="px-2.5 py-1.5 rounded-lg bg-white dark:bg-[#181C25] border border-slate-200 dark:border-[#2A2F3D] font-bold text-xs"
                        >
                          {contractChoices.map((c) => (
                            <option key={c.value} value={c.value}>
                              {c.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {contractType === 'ACCU' && (
                      <div className="p-3 rounded-xl bg-[#F4F5F7] dark:bg-[#111319] flex flex-wrap items-center justify-between gap-2">
                        <span className="font-semibold text-slate-600 dark:text-slate-300">
                          Accumulator Growth Rate:
                        </span>
                        <div className="flex gap-1.5">
                          {[0.01, 0.02, 0.03, 0.04, 0.05].map((r) => (
                            <button
                              key={r}
                              type="button"
                              onClick={() => setGrowthRate(r)}
                              className={`px-2.5 py-1 rounded-lg font-mono font-bold cursor-pointer ${
                                growthRate === r
                                  ? 'bg-[#FF444F] text-white'
                                  : 'bg-white dark:bg-[#181C25] text-slate-600 dark:text-slate-300'
                              }`}
                            >
                              {(r * 100).toFixed(0)}%
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="flex flex-wrap items-center justify-between gap-3 p-2.5 rounded-xl bg-[#F4F5F7] dark:bg-[#111319]">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-slate-500">Default Candle Interval:</span>
                        <select
                          value={candleInterval}
                          onChange={(e) => setCandleInterval(e.target.value as any)}
                          className="px-2.5 py-1 rounded-lg bg-white dark:bg-[#181C25] border border-slate-200 dark:border-[#2A2F3D] font-mono-num font-semibold"
                        >
                          <option value="1t">1 tick</option>
                          <option value="1m">1 minute</option>
                          <option value="5m">5 minutes</option>
                          <option value="15m">15 minutes</option>
                        </select>
                      </div>

                      <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-500">
                        <label className="inline-flex items-center gap-1.5 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={restartBuySellOnError}
                            onChange={(e) => setRestartBuySellOnError(e.target.checked)}
                            className="accent-[#FF444F]"
                          />
                          Restart on error
                        </label>
                        <label className="inline-flex items-center gap-1.5 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={restartLastTradeOnError}
                            onChange={(e) => setRestartLastTradeOnError(e.target.checked)}
                            className="accent-[#00A878]"
                          />
                          Ignore failed tick
                        </label>
                      </div>
                    </div>

                    {/* Run once at start nested block */}
                    <div className="rounded-xl overflow-hidden border border-slate-200 dark:border-[#2A2F3D]">
                      <div className="px-3.5 py-2 bg-[#151820] text-white font-display text-xs font-bold flex items-center justify-between">
                        <span>Run once at start:</span>
                        <span className="text-[10px] font-normal text-slate-400">Strategy: {strategyType}</span>
                      </div>
                      <div className="p-3 bg-[#F8F9FB] dark:bg-[#111319] grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        <div className="flex items-center justify-between gap-2 px-3 py-1.5 rounded-xl bg-white dark:bg-[#181C25] border border-slate-200 dark:border-[#2A2F3D]">
                          <span className="text-slate-500">set <strong className="text-[#0F1F38] dark:text-white">Stake ($)</strong> to</span>
                          <input
                            type="number"
                            step="0.1"
                            min="0.35"
                            value={baseStake}
                            onChange={(e) => setBaseStake(e.target.value)}
                            className="w-20 text-right font-mono-num font-bold bg-transparent outline-none"
                          />
                        </div>

                        <div className="flex items-center justify-between gap-2 px-3 py-1.5 rounded-xl bg-white dark:bg-[#181C25] border border-slate-200 dark:border-[#2A2F3D]">
                          <span className="text-slate-500">set <strong className="text-[#0F1F38] dark:text-white">Prediction</strong> to</span>
                          <input
                            type="text"
                            value={barrier}
                            onChange={(e) => setBarrier(e.target.value)}
                            className="w-16 text-right font-mono-num font-bold bg-transparent outline-none"
                          />
                        </div>

                        <div className="flex items-center justify-between gap-2 px-3 py-1.5 rounded-xl bg-white dark:bg-[#181C25] border border-slate-200 dark:border-[#2A2F3D]">
                          <span className="text-slate-500">set <strong className="text-[#0F1F38] dark:text-white">Factor (x)</strong> to</span>
                          <input
                            type="number"
                            step="0.1"
                            min="1"
                            value={martingale}
                            onChange={(e) => setMartingale(e.target.value)}
                            className="w-16 text-right font-mono-num font-bold bg-transparent outline-none"
                          />
                        </div>

                        <div className="flex items-center justify-between gap-2 px-3 py-1.5 rounded-xl bg-white dark:bg-[#181C25] border border-slate-200 dark:border-[#2A2F3D]">
                          <span className="text-slate-500">set <strong className="text-[#00A878]">Take Profit ($)</strong> to</span>
                          <input
                            type="number"
                            min="1"
                            value={takeProfit}
                            onChange={(e) => setTakeProfit(e.target.value)}
                            className="w-20 text-right font-mono-num font-bold text-[#00A878] bg-transparent outline-none"
                          />
                        </div>

                        <div className="flex items-center justify-between gap-2 px-3 py-1.5 rounded-xl bg-white dark:bg-[#181C25] border border-slate-200 dark:border-[#2A2F3D]">
                          <span className="text-slate-500">set <strong className="text-[#FF444F]">Stop Loss ($)</strong> to</span>
                          <input
                            type="number"
                            min="1"
                            value={stopLoss}
                            onChange={(e) => setStopLoss(e.target.value)}
                            className="w-20 text-right font-mono-num font-bold text-[#FF444F] bg-transparent outline-none"
                          />
                        </div>

                        <div className="flex items-center justify-between gap-2 px-3 py-1.5 rounded-xl bg-white dark:bg-[#181C25] border border-slate-200 dark:border-[#2A2F3D]">
                          <span className="text-slate-500">set <strong className="text-[#0F1F38] dark:text-white">Max Trades</strong> to</span>
                          <input
                            type="number"
                            min="1"
                            value={maxTrades}
                            onChange={(e) => setMaxTrades(e.target.value)}
                            className="w-16 text-right font-mono-num font-bold bg-transparent outline-none"
                          />
                        </div>

                        <div className="flex items-center justify-between gap-2 px-3 py-1.5 rounded-xl bg-white dark:bg-[#181C25] border border-slate-200 dark:border-[#2A2F3D]">
                          <span className="text-slate-500">set <strong className="text-[#0F1F38] dark:text-white">Progression</strong> to</span>
                          <select
                            value={useMartingale}
                            onChange={(e) => setUseMartingale(e.target.value as 'true' | 'false')}
                            className="font-mono-num font-bold bg-transparent outline-none cursor-pointer"
                          >
                            <option value="true">enabled</option>
                            <option value="false">flat stake</option>
                          </select>
                        </div>

                        {tradeTypeGroup === 'CFDs > Multipliers' && (
                          <div className="flex items-center justify-between gap-2 px-3 py-1.5 rounded-xl bg-white dark:bg-[#181C25] border border-slate-200 dark:border-[#2A2F3D]">
                            <span className="text-slate-500">set <strong className="text-[#1958B7]">Multiplier</strong> to</span>
                            <input
                              type="number"
                              value={multiplier}
                              onChange={(e) => setMultiplier(e.target.value)}
                              className="w-20 text-right font-mono-num font-bold text-[#1958B7] bg-transparent outline-none"
                            />
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Trade options strip */}
                    <div className="rounded-xl overflow-hidden border border-slate-200 dark:border-[#2A2F3D]">
                      <div className="px-3.5 py-2 bg-[#0F1F38] text-white font-display text-xs font-bold">
                        Trade options:
                      </div>
                      <div className="p-3 bg-[#F4F5F7] dark:bg-[#111319] flex flex-wrap items-center gap-2.5 text-xs">
                        <div className="flex items-center gap-1.5">
                          <span className="text-slate-500 font-semibold">Duration:</span>
                          <select
                            value={durationUnit}
                            onChange={(e) => setDurationUnit(e.target.value)}
                            className="px-2 py-1 rounded-lg bg-white dark:bg-[#181C25] border border-slate-200 dark:border-[#2A2F3D] font-semibold"
                          >
                            <option value="t">Ticks</option>
                            <option value="s">Seconds</option>
                            <option value="m">Minutes</option>
                          </select>
                          <input
                            type="number"
                            min="1"
                            value={duration}
                            onChange={(e) => setDuration(e.target.value)}
                            className="w-14 px-2 py-1 rounded-lg bg-white dark:bg-[#181C25] border border-slate-200 dark:border-[#2A2F3D] font-mono-num font-bold text-center"
                          />
                        </div>
                        <span className="text-slate-500 font-mono-num">
                          Stake: <strong>${Number(baseStake || 0).toFixed(2)} USD</strong>
                        </span>
                        <label className="inline-flex items-center gap-1.5 text-[11px] text-slate-600 dark:text-slate-300 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={tradeEachTick}
                            onChange={(e) => setTradeEachTick(e.target.checked)}
                            className="accent-[#FF444F]"
                          />
                          Trade each tick
                        </label>
                      </div>
                    </div>
                  </div>
                </div>

                {/* BLOCK 2: Purchase conditions */}
                <div className="rounded-2xl overflow-hidden border border-slate-200 dark:border-[#2A2F3D] bg-white dark:bg-[#181C25] shadow-xs">
                  <div className="px-4 py-2.5 bg-[#0F1F38] text-white flex items-center justify-between">
                    <span className="font-display text-sm font-bold">2. Purchase conditions</span>
                    <span className="text-[11px] text-slate-300">Entry Trigger Block</span>
                  </div>

                  <div className="p-4 bg-[#F4F5F7]/70 dark:bg-[#111319] space-y-3 text-xs">
                    <div className="flex flex-wrap items-center gap-2 p-3 rounded-xl bg-white dark:bg-[#181C25] border border-slate-200 dark:border-[#2A2F3D]">
                      <span className="font-bold text-[#1958B7]">if</span>
                      <select
                        value={entryCondition}
                        onChange={(e) => setEntryCondition(e.target.value as any)}
                        className="px-2.5 py-1.5 rounded-lg bg-[#F4F5F7] dark:bg-[#111319] font-semibold"
                      >
                        <option value="any_tick">Every incoming tick (Instant)</option>
                        <option value="last_digit_gte">Last digit is greater than or equal to</option>
                        <option value="last_digit_lte">Last digit is less than or equal to</option>
                        <option value="rsi_signal">Market Analyser RSI/SMC confirms entry</option>
                      </select>
                      {(entryCondition === 'last_digit_gte' || entryCondition === 'last_digit_lte') && (
                        <input
                          type="number"
                          min="0"
                          max="9"
                          value={conditionDigit}
                          onChange={(e) => setConditionDigit(e.target.value)}
                          className="w-12 px-2 py-1 rounded-lg bg-[#F4F5F7] dark:bg-[#111319] font-mono-num font-bold text-center"
                        />
                      )}
                      <span className="font-bold text-[#1958B7]">then</span>
                      <span className="px-2.5 py-1 rounded-lg bg-[#00A878]/15 text-[#00A878] font-bold">
                        Purchase {contractChoices.find((c) => c.value === contractType)?.label || contractType}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-3 px-3 py-2.5 rounded-xl bg-white dark:bg-[#181C25] border border-slate-200 dark:border-[#2A2F3D]">
                      <div className="flex items-center gap-2">
                        <span className="text-slate-500 font-semibold">Allow Bulk Purchase:</span>
                        <select
                          value={allowBulk}
                          onChange={(e) => setAllowBulk(e.target.value as 'No' | 'Yes')}
                          className="px-2.5 py-1 rounded-lg bg-[#F4F5F7] dark:bg-[#111319] font-semibold"
                        >
                          <option value="No">No</option>
                          <option value="Yes">Yes</option>
                        </select>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-slate-500 font-semibold">No. of Trades:</span>
                        <input
                          type="number"
                          min="1"
                          max="10"
                          disabled={allowBulk === 'No'}
                          value={allowBulk === 'No' ? '1' : bulkCount}
                          onChange={(e) => setBulkCount(e.target.value)}
                          className="w-16 px-2 py-1 rounded-lg bg-[#F4F5F7] dark:bg-[#111319] font-mono-num font-bold text-center disabled:opacity-50"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </form>

              {/* Right Live Bot Telemetry: Summary | Transactions | Journal */}
              <section className="lg:col-span-5 bg-[#151820] text-white rounded-2xl border border-[#2A2F3D] p-5 flex flex-col justify-between space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Activity className="w-4 h-4 text-[#00A878]" />
                    <h2 className="font-display text-base font-bold">Bot Telemetry</h2>
                  </div>
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                      telemetry?.running ? 'bg-[#00A878]/20 text-[#00A878]' : 'bg-white/10 text-slate-400'
                    }`}
                  >
                    {telemetry?.running ? 'Running' : 'Idle'}
                  </span>
                </div>

                {/* Telemetry Sub-tabs */}
                <div className="grid grid-cols-3 gap-1 bg-[#1A1D26] p-1 rounded-xl text-xs">
                  {(['summary', 'transactions', 'journal'] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setTelemetryTab(t)}
                      className={`py-1.5 rounded-lg font-bold capitalize cursor-pointer ${
                        telemetryTab === t ? 'bg-[#FF444F] text-white' : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>

                {telemetryTab === 'summary' && (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3.5 rounded-2xl bg-[#1A1D26] border border-[#2A2F3D]">
                      <p className="text-[11px] text-slate-400">Realized P/L</p>
                      <p
                        className={`font-mono-num text-xl font-bold mt-1 ${
                          (telemetry?.realizedPnl || 0) >= 0 ? 'text-[#00A878]' : 'text-[#FF444F]'
                        }`}
                      >
                        {(telemetry?.realizedPnl || 0) >= 0 ? '+' : ''}
                        {(telemetry?.realizedPnl || 0).toFixed(2)} USD
                      </p>
                    </div>
                    <div className="p-3.5 rounded-2xl bg-[#1A1D26] border border-[#2A2F3D]">
                      <p className="text-[11px] text-slate-400">Current Stake / Step</p>
                      <p className="font-mono-num text-xl font-bold mt-1">
                        ${(telemetry?.currentStake ?? Number(baseStake || 1)).toFixed(2)}{' '}
                        <span className="text-xs text-slate-400">(Step {telemetry?.martingaleStep ?? 0})</span>
                      </p>
                    </div>
                    <div className="p-3.5 rounded-2xl bg-[#1A1D26] border border-[#2A2F3D]">
                      <p className="text-[11px] text-slate-400">Trades / Wins / Losses</p>
                      <div className="font-mono-num text-sm font-bold mt-1.5 flex items-center gap-3">
                        <span>{telemetry?.tradesPlaced || 0}</span>
                        <span className="text-[#00A878] inline-flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" /> {telemetry?.wins || 0}
                        </span>
                        <span className="text-[#FF444F] inline-flex items-center gap-1">
                          <XCircle className="w-3.5 h-3.5" /> {telemetry?.losses || 0}
                        </span>
                      </div>
                    </div>
                    <div className="p-3.5 rounded-2xl bg-[#1A1D26] border border-[#2A2F3D]">
                      <p className="text-[11px] text-slate-400">Ticks Processed</p>
                      <p className="font-mono-num text-xl font-bold mt-1">{telemetry?.tickCount || 0}</p>
                    </div>
                  </div>
                )}

                {telemetryTab === 'transactions' && (
                  <div className="max-h-60 overflow-y-auto divide-y divide-[#2A2F3D] text-xs">
                    {botOrders.length === 0 ? (
                      <p className="py-6 text-center text-slate-400">No bot contracts executed yet.</p>
                    ) : (
                      botOrders.slice(0, 12).map((o) => {
                        const live = computeLiveOrderMetrics(o, ticks);
                        return (
                          <div key={o.id} className="py-2 flex items-center justify-between gap-2">
                            <div>
                              <span className="font-bold">{o.symbol}</span>{' '}
                              <span className="font-mono text-[11px] text-slate-400">{o.contract_type}</span>
                              <p className="text-[10px] text-slate-400">Stake ${Number(o.stake).toFixed(2)}</p>
                            </div>
                            <span
                              className={`font-mono font-bold ${
                                live.pnl >= 0 ? 'text-[#00A878]' : 'text-[#FF444F]'
                              }`}
                            >
                              {live.pnl >= 0 ? '+' : ''}${live.pnl.toFixed(2)}
                            </span>
                          </div>
                        );
                      })
                    )}
                  </div>
                )}

                {telemetryTab === 'journal' && (
                  <div className="p-3.5 rounded-2xl bg-[#1A1D26] border border-[#2A2F3D] space-y-2 text-xs">
                    <div className="flex items-center gap-1.5 text-amber-400 font-semibold">
                      <Zap className="w-3.5 h-3.5" />
                      <span>Execution Log</span>
                    </div>
                    <p className="text-slate-300 font-mono-num">
                      {telemetry?.lastSignal || 'Ready. Click Run below to begin live execution.'}
                    </p>
                    <p className="text-[11px] text-slate-400">
                      Progression: {strategyType} · Analyser Sync: {analyserSync ? 'ACTIVE' : 'MANUAL'}
                    </p>
                  </div>
                )}

                <button
                  type="button"
                  onClick={handleCloseAllBotOrders}
                  className="w-full py-2.5 px-4 rounded-xl border border-[#2A2F3D] hover:border-[#FF444F] text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5 text-[#FF444F]" />
                  Close All Bot Orders
                </button>
              </section>
            </div>
          </div>
        </>
      )}

      {/* Sticky Bottom Execution Bar */}
      <div className="sticky bottom-16 lg:bottom-3 z-20 bg-white/95 dark:bg-[#151820]/95 backdrop-blur-md border border-slate-200 dark:border-[#2A2F3D] rounded-2xl px-3.5 py-2.5 shadow-lg flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {!telemetry?.running ? (
            <button
              type="button"
              disabled={submitting}
              onClick={() => handleRunBot()}
              className="px-5 py-2.5 rounded-xl bg-[#00A878] hover:bg-[#00966B] text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              {submitting ? 'Starting...' : 'Run'}
            </button>
          ) : (
            <button
              type="button"
              onClick={handleStopBot}
              className="px-5 py-2.5 rounded-xl bg-[#FF444F] hover:bg-[#E63946] text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer"
            >
              <Square className="w-3.5 h-3.5 fill-current" />
              Stop
            </button>
          )}

          <div className="text-xs">
            {telemetry?.running ? (
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-[#00A878] animate-pulse" />
                <span className="font-semibold">
                  Running · <span className="font-mono-num">{telemetry.tradesPlaced} trades</span> ·{' '}
                  <strong className={`font-mono-num ${telemetry.realizedPnl >= 0 ? 'text-[#00A878]' : 'text-[#FF444F]'}`}>
                    {telemetry.realizedPnl >= 0 ? '+' : ''}
                    ${telemetry.realizedPnl.toFixed(2)}
                  </strong>
                </span>
              </div>
            ) : (
              <span className="font-semibold text-slate-600 dark:text-slate-300">Bot is not running</span>
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={() => setExecutionSpeed((s) => (s === 'fast' ? 'normal' : 'fast'))}
          className="flex items-center gap-2.5 px-3 py-1.5 rounded-xl bg-[#F4F5F7] dark:bg-[#111319] border border-slate-200 dark:border-[#2A2F3D] cursor-pointer"
        >
          <div className="text-left leading-tight">
            <span className="block text-[10px] text-slate-500">Execution</span>
            <span className="block text-xs font-bold uppercase">{executionSpeed}</span>
          </div>
          <span
            className={`w-9 h-5 rounded-full p-0.5 transition-colors flex items-center ${
              executionSpeed === 'fast' ? 'bg-[#00A878] justify-end' : 'bg-slate-400 justify-start'
            }`}
          >
            <span className="w-4 h-4 rounded-full bg-white shadow-xs" />
          </span>
        </button>
      </div>

      {/* 2-Step Quick Strategy Modal matching Deriv Bot Screenshots */}
      {qsOpen && (
        <div className="fixed inset-0 z-50 bg-black/65 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-white dark:bg-[#181C25] rounded-2xl border border-slate-200 dark:border-[#2A2F3D] overflow-hidden shadow-2xl">
            <div className="px-5 py-4 flex items-center justify-between border-b border-slate-100 dark:border-[#2A2F3D]">
              <h3 className="font-display text-base font-bold">
                Step {qsStep}/2: {qsStep === 1 ? 'Choose your strategy' : `Configure ${qsSelected.name}`}
              </h3>
              <button
                type="button"
                onClick={() => setQsOpen(false)}
                className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-white/10 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            {/* Progress bar */}
            <div className="h-1 bg-slate-200 dark:bg-[#111319] w-full">
              <div className={`h-full bg-[#FF444F] transition-all ${qsStep === 1 ? 'w-1/2' : 'w-full'}`} />
            </div>

            {qsStep === 1 ? (
              <div className="p-5 space-y-4">
                <div className="relative">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={qsSearch}
                    onChange={(e) => setQsSearch(e.target.value)}
                    placeholder="Search strategy..."
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-[#F4F5F7] dark:bg-[#111319] text-sm outline-none"
                  />
                </div>

                <div className="flex items-center gap-2">
                  {(['All', 'Accumulators', 'Options'] as const).map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setQsFilter(cat)}
                      className={`px-3.5 py-1.5 rounded-full text-xs font-bold border cursor-pointer ${
                        qsFilter === cat
                          ? 'bg-[#151820] text-white border-[#151820] dark:bg-white dark:text-[#151820]'
                          : 'border-slate-200 dark:border-[#2A2F3D] text-slate-600 dark:text-slate-300'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>

                <div className="max-h-80 overflow-y-auto divide-y divide-slate-100 dark:divide-[#2A2F3D]">
                  {filteredQuickStrategies.map((strat) => (
                    <button
                      key={strat.key}
                      type="button"
                      onClick={() => {
                        setQsSelected(strat);
                        setMartingale(strat.defaultFactor);
                        if (strat.contractType === 'ACCU') setGrowthRate(0.02);
                        setQsStep(2);
                      }}
                      className="w-full py-3.5 px-2 flex items-center justify-between text-left hover:bg-[#F8F9FB] dark:hover:bg-white/5 cursor-pointer"
                    >
                      <div>
                        <p className="text-sm font-bold">{strat.name}</p>
                        <p className="text-[11px] text-slate-500">{strat.category} · {strat.desc}</p>
                      </div>
                      <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="p-5 space-y-4 text-xs">
                <p className="text-slate-500">{qsSelected.desc}</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-semibold text-slate-500 mb-1">Underlying Market</label>
                    <select
                      value={symbol}
                      onChange={(e) => setSymbol(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-[#F4F5F7] dark:bg-[#111319] font-semibold"
                    >
                      {instruments.slice(0, 20).map((inst) => (
                        <option key={inst.symbol} value={inst.symbol}>
                          {inst.display_name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-500 mb-1">Initial Stake (USD)</label>
                    <input
                      type="number"
                      min="0.35"
                      step="0.5"
                      value={baseStake}
                      onChange={(e) => setBaseStake(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-[#F4F5F7] dark:bg-[#111319] font-mono font-bold"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-500 mb-1">Factor / Multiplier</label>
                    <input
                      type="number"
                      min="1"
                      step="0.1"
                      value={martingale}
                      onChange={(e) => setMartingale(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-[#F4F5F7] dark:bg-[#111319] font-mono font-bold"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-500 mb-1">Take Profit / Stop Loss ($)</label>
                    <div className="flex gap-1.5">
                      <input
                        type="number"
                        min="1"
                        value={takeProfit}
                        onChange={(e) => setTakeProfit(e.target.value)}
                        className="w-1/2 px-2 py-2 rounded-xl bg-[#F4F5F7] dark:bg-[#111319] font-mono font-bold text-[#00A878]"
                      />
                      <input
                        type="number"
                        min="1"
                        value={stopLoss}
                        onChange={(e) => setStopLoss(e.target.value)}
                        className="w-1/2 px-2 py-2 rounded-xl bg-[#F4F5F7] dark:bg-[#111319] font-mono font-bold text-[#FF444F]"
                      />
                    </div>
                  </div>
                </div>

                {qsSelected.category === 'Accumulators' && (
                  <div>
                    <label className="block font-semibold text-slate-500 mb-1">Accumulator Growth Rate</label>
                    <div className="grid grid-cols-5 gap-1.5">
                      {[0.01, 0.02, 0.03, 0.04, 0.05].map((r) => (
                        <button
                          key={r}
                          type="button"
                          onClick={() => setGrowthRate(r)}
                          className={`py-2 rounded-xl font-mono font-bold cursor-pointer ${
                            growthRate === r ? 'bg-[#FF444F] text-white' : 'bg-[#F4F5F7] dark:bg-[#111319]'
                          }`}
                        >
                          {(r * 100).toFixed(0)}%
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-between gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setQsStep(1)}
                    className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-[#2A2F3D] font-semibold inline-flex items-center gap-1 cursor-pointer"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" /> Back
                  </button>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => applyQuickStrategy(false)}
                      className="px-4 py-2.5 rounded-xl bg-[#F4F5F7] dark:bg-[#111319] font-bold cursor-pointer"
                    >
                      Load Blocks
                    </button>
                    <button
                      type="button"
                      onClick={() => applyQuickStrategy(true)}
                      className="px-5 py-2.5 rounded-xl bg-[#00A878] hover:bg-[#00966B] text-white font-bold cursor-pointer"
                    >
                      Run Strategy
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
