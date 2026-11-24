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
  Download,
  RotateCcw,
  CandlestickChart,
  ChevronRight,
  ChevronLeft,
  ChevronDown,
  ChevronUp,
  LayoutGrid,
  Sparkles,
  Search,
  X,
  FolderOpen,
  Save,
  Undo2,
  Redo2,
  ZoomIn,
  ZoomOut,
  Home,
  LineChart,
  Menu as MenuIcon,
  MoreVertical,
  Moon,
  Globe,
  LogOut,
  FileText,
  Clock,
  Monitor,
  Info,
  SlidersHorizontal,
  Check,
  XCircle,
  CheckCircle2,
  Flag,
  ShoppingBasket,
  ListChecks,
  BookOpen,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { apiFetch } from '../lib/api';
import { getCanonicalBalances, computeLiveOrderMetrics } from '../lib/balances';
import { DepositSheet } from '../components/CashierFlows';
import { SynthCandleBadge } from '../components/DerivBadges';
import {
  DerivBotInitializingLoader,
  BlocklyOverlayLoader,
} from '../components/DerivLoadingModal';
import type { BotTelemetry, BotJournalEntry, CandleData, MarketInstrument } from '../types';

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
    name: "Reverse D'Alembert",
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

interface SavedBotItem {
  id: string;
  name: string;
  lastModified: string;
  status: 'Unsaved' | 'Local';
  symbol: string;
  contractType: string;
  stake: string;
  duration: string;
  durationUnit: string;
  barrier: string;
  martingale: string;
  takeProfit: string;
  stopLoss: string;
}

const DEFAULT_SAVED_BOTS: SavedBotItem[] = [
  {
    id: 'preset-matches',
    name: 'MatchesScalper',
    lastModified: 'Just now',
    status: 'Local',
    symbol: '1HZ100V',
    contractType: 'DIGITMATCH',
    stake: '0.5',
    duration: '1',
    durationUnit: 't',
    barrier: '4',
    martingale: '1.2',
    takeProfit: '5',
    stopLoss: '3',
  },
  {
    id: 'preset-contwin',
    name: 'Contwin',
    lastModified: '23 Nov 2026',
    status: 'Local',
    symbol: '1HZ100V',
    contractType: 'CALL',
    stake: '1.0',
    duration: '1',
    durationUnit: 't',
    barrier: '2',
    martingale: '2.1',
    takeProfit: '10',
    stopLoss: '6',
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

function getContractDisplayLabel(ct: string): string {
  const u = String(ct || '').toUpperCase();
  if (u === 'DIGITMATCH') return 'Matches';
  if (u === 'DIGITDIFF') return 'Differs';
  if (u === 'DIGITOVER') return 'Over';
  if (u === 'DIGITUNDER') return 'Under';
  if (u === 'DIGITEVEN') return 'Even';
  if (u === 'DIGITODD') return 'Odd';
  if (u === 'CALL' || u === 'CALLE') return 'Rise';
  if (u === 'PUT' || u === 'PUTE') return 'Fall';
  if (u === 'ACCU') return 'Accumulators';
  if (u === 'MULTUP') return 'Mult Up';
  if (u === 'MULTDOWN') return 'Mult Down';
  return u || 'Options';
}

function getSymbolBadgeNum(sym: string): string {
  const m = String(sym || '').match(/\d+/);
  return m?.[0] || '100';
}

function formatGmtStamp(iso?: string | null): string {
  const d = iso ? new Date(iso) : new Date();
  if (Number.isNaN(d.getTime())) return new Date().toISOString().replace('T', ' ').slice(0, 19) + ' GMT';
  return d.toISOString().replace('T', ' ').slice(0, 19) + ' GMT';
}

function formatJournalTime(iso?: string | null): string {
  const d = iso ? new Date(iso) : new Date();
  const s = d.toISOString();
  return `${s.slice(0, 10)} | ${s.slice(11, 19)} GMT`;
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
    toggleTheme,
    hideBalances,
    logout,
    refreshOrders,
    refreshAll,
    showToast,
  } = useApp();

  // Deriv Bot initialization & Blockly splash sequence (Screenshots 152354 & 152357)
  const [initLoading, setInitLoading] = useState<boolean>(true);
  const [blocklyLoading, setBlocklyLoading] = useState<boolean>(false);

  useEffect(() => {
    const t1 = setTimeout(() => {
      setInitLoading(false);
      setBlocklyLoading(true);
    }, 380);
    const t2 = setTimeout(() => {
      setBlocklyLoading(false);
    }, 760);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);

  // Deriv Bot Sub-view: Dashboard | Bot Builder | Chart
  const [botView, setBotView] = useState<'dashboard' | 'builder' | 'chart'>('builder');
  const [telemetryOpen, setTelemetryOpen] = useState<boolean>(false);
  const [telemetryTab, setTelemetryTab] = useState<'summary' | 'transactions' | 'journal'>('summary');
  const [txDetailOpen, setTxDetailOpen] = useState<boolean>(false);
  const [journalFilter, setJournalFilter] = useState<'all' | 'error' | 'profit' | 'bought'>('all');
  const [filterMenuOpen, setFilterMenuOpen] = useState<boolean>(false);
  const [accountSheetOpen, setAccountSheetOpen] = useState<boolean>(false);
  const [depositOpen, setDepositOpen] = useState<boolean>(false);
  const [menuOpen, setMenuOpen] = useState<boolean>(false);
  const [utcNow, setUtcNow] = useState<string>(() => formatGmtStamp());

  // Load Strategy Modal (Screenshots 152508 & 152544)
  const [loadModalOpen, setLoadModalOpen] = useState<boolean>(false);
  const [loadModalTab, setLoadModalTab] = useState<'local' | 'drive'>('local');
  const [pendingXmlImport, setPendingXmlImport] = useState<{
    fileName: string;
    symbol?: string;
    contractType?: string;
    stake?: string;
    duration?: string;
    barrier?: string;
    martingale?: string;
    takeProfit?: string;
    stopLoss?: string;
  } | null>(null);

  // Saved Bots List (Dashboard "Your bots:")
  const [savedBots, setSavedBots] = useState<SavedBotItem[]>(() => {
    try {
      const raw = localStorage.getItem('td_saved_bots_v1');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {
      // ignore
    }
    return DEFAULT_SAVED_BOTS;
  });
  const [botRowMenuId, setBotRowMenuId] = useState<string | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem('td_saved_bots_v1', JSON.stringify(savedBots.slice(0, 20)));
    } catch {
      // ignore
    }
  }, [savedBots]);

  useEffect(() => {
    if (!menuOpen) return;
    setUtcNow(formatGmtStamp());
    const id = setInterval(() => setUtcNow(formatGmtStamp()), 1000);
    return () => clearInterval(id);
  }, [menuOpen]);

  // Block 1: Trade parameters
  const [strategyName, setStrategyName] = useState('MatchesScalper');
  const [strategyType, setStrategyType] = useState<string>('martingale');
  const [marketCategory, setMarketCategory] = useState<'All' | MarketInstrument['category']>('Synthetic');
  const [symbol, setSymbol] = useState(selectedSymbol || '1HZ100V');
  const [tradeTypeGroup, setTradeTypeGroup] = useState<TradeTypeGroup>('Digits > Over/Under');
  const [contractType, setContractType] = useState('DIGITOVER');
  const [candleInterval, setCandleInterval] = useState<'1t' | '1m' | '5m' | '15m'>('1m');
  const [restartBuySellOnError, setRestartBuySellOnError] = useState(false);
  const [restartLastTradeOnError, setRestartLastTradeOnError] = useState(true);

  // Run once at start
  const [baseStake, setBaseStake] = useState('0.5');
  const [barrier, setBarrier] = useState('2');
  const [growthRate, setGrowthRate] = useState<number>(0.02);
  const [martingale, setMartingale] = useState('2.1');
  const [useMartingale, setUseMartingale] = useState<'true' | 'false'>('true');
  const [takeProfit, setTakeProfit] = useState('10');
  const [stopLoss, setStopLoss] = useState('6');
  const [maxTrades, setMaxTrades] = useState('15');
  const [multiplier, setMultiplier] = useState('100');

  // Analyser Sync Toggle
  const [analyserSync, setAnalyserSync] = useState<boolean>(false);

  // Trade options & Block 2
  const [duration, setDuration] = useState('1');
  const [durationUnit, setDurationUnit] = useState('t');
  const [entryCondition, setEntryCondition] = useState<'any_tick' | 'last_digit_gte' | 'last_digit_lte' | 'rsi_signal'>(
    'any_tick'
  );
  const [conditionDigit, setConditionDigit] = useState('2');
  const [executionSpeed, setExecutionSpeed] = useState<'fast' | 'normal'>('fast');
  const [canvasZoom, setCanvasZoom] = useState<number>(100);

  // Quick Strategy 2-Step Modal
  const [qsOpen, setQsOpen] = useState(false);
  const [qsStep, setQsStep] = useState<1 | 2>(1);
  const [qsSearch, setQsSearch] = useState('');
  const [qsFilter, setQsFilter] = useState<'All' | 'Accumulators' | 'Options'>('All');
  const [qsSelected, setQsSelected] = useState<QuickStrategyDef>(QUICK_STRATEGIES[0]);

  const [telemetry, setTelemetry] = useState<BotTelemetry | null>(null);
  const sessionAnchorKey = useMemo(
    () => (user?.id ? `td_bot_session_${user.id}_${accountMode}` : null),
    [user?.id, accountMode]
  );
  const [sessionResetAt, setSessionResetAt] = useState<number>(() => Date.now());
  const [submitting, setSubmitting] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  // Restore active/last session anchor per user + accountMode (never mix Demo/Real or stale historical runs)
  useEffect(() => {
    if (!sessionAnchorKey) return;
    try {
      const saved = sessionStorage.getItem(sessionAnchorKey);
      const parsed = saved ? Number(saved) : 0;
      if (parsed > 0 && Number.isFinite(parsed)) {
        setSessionResetAt(parsed);
        return;
      }
    } catch {
      // ignore
    }
    const now = Date.now();
    setSessionResetAt(now);
    try {
      sessionStorage.setItem(sessionAnchorKey, String(now));
    } catch {
      // ignore
    }
  }, [sessionAnchorKey]);

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
      const tel = res.telemetry;
      setTelemetry(tel);
      if (tel?.running && tel.startedAt && tel.accountMode === accountMode) {
        const startedMs = new Date(tel.startedAt).getTime() - 2000;
        if (Number.isFinite(startedMs) && startedMs > 0) {
          setSessionResetAt((prev) => {
            if (prev === 0 || prev > startedMs) {
              if (sessionAnchorKey) {
                try {
                  sessionStorage.setItem(sessionAnchorKey, String(startedMs));
                } catch {
                  // ignore
                }
              }
              return startedMs;
            }
            return prev;
          });
        }
      }
    } catch {
      // ignore
    }
  }, [accountMode, sessionAnchorKey]);

  useEffect(() => {
    pollStatus();
    const timer = setInterval(pollStatus, 1400);
    return () => clearInterval(timer);
  }, [pollStatus]);

  // Keep header balance & session transactions synced immediately after every bot trade / settlement
  useEffect(() => {
    if (!telemetry) return;
    if ((telemetry.tradesPlaced || 0) === 0 && !telemetry.running) return;
    refreshOrders();
    refreshAll();
  }, [telemetry?.tradesPlaced, telemetry?.wins, telemetry?.losses, telemetry?.running, refreshOrders, refreshAll]);

  // Embedded Lightweight Chart when botView === 'chart' (Screenshot 152825)
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
    const id = setInterval(load, 2500);
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
      height: el.clientHeight || 440,
      layout: {
        background: { type: ColorType.Solid, color: isDark ? '#151820' : '#FFFFFF' },
        textColor: isDark ? '#94A3B8' : '#8E95A2',
      },
      grid: {
        vertLines: { color: isDark ? '#1F2430' : '#F3F4F6' },
        horzLines: { color: isDark ? '#1F2430' : '#F3F4F6' },
      },
      rightPriceScale: {
        borderVisible: false,
      },
      timeScale: { timeVisible: true, secondsVisible: true, borderVisible: false },
    });
    const series = chart.addSeries(AreaSeries, {
      lineColor: isDark ? '#E2E8F0' : '#111319',
      topColor: isDark ? 'rgba(226, 232, 240, 0.18)' : 'rgba(17, 19, 25, 0.14)',
      bottomColor: isDark ? 'rgba(226, 232, 240, 0.01)' : 'rgba(17, 19, 25, 0.01)',
      lineWidth: 2,
      priceLineColor: isDark ? '#94A3B8' : '#111319',
      lastValueVisible: true,
    });
    chartRef.current = chart;
    seriesRef.current = series;

    const ro = new ResizeObserver(() => {
      if (chartContainerRef.current) {
        chart.applyOptions({
          width: chartContainerRef.current.clientWidth,
          height: chartContainerRef.current.clientHeight || 440,
        });
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
    setStrategyName('MatchesScalper');
    setStrategyType('martingale');
    setMarketCategory('Synthetic');
    setSymbol('1HZ100V');
    setTradeTypeGroup('Digits > Over/Under');
    setContractType('DIGITOVER');
    setBaseStake('0.5');
    setBarrier('2');
    setGrowthRate(0.02);
    setMartingale('2.1');
    setUseMartingale('true');
    setTakeProfit('10');
    setStopLoss('6');
    setMaxTrades('15');
    setDuration('1');
    setDurationUnit('t');
    setEntryCondition('any_tick');
    setConditionDigit('2');
    setExecutionSpeed('fast');
    setAnalyserSync(false);
    showToast('Workspace reset to default blocks', 'info');
  };

  const handleSwitchAccount = (mode: 'demo' | 'real') => {
    setAccountSheetOpen(false);
    if (mode !== accountMode) {
      setBlocklyLoading(true);
      setAccountMode(mode);
      setTimeout(() => setBlocklyLoading(false), 450);
    }
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
        executionMode: accountMode === 'real' ? 'deriv' : 'virtual',
        connectedAccountId: activeConnectedAccount?.id || null,
      };
      const res = await apiFetch<{ telemetry: BotTelemetry }>('/api/bots/run', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      const anchorMs = res.telemetry?.startedAt
        ? new Date(res.telemetry.startedAt).getTime() - 2000
        : Date.now() - 2000;
      setSessionResetAt(anchorMs);
      if (sessionAnchorKey) {
        try {
          sessionStorage.setItem(sessionAnchorKey, String(anchorMs));
        } catch {
          // ignore
        }
      }
      setTelemetry(res.telemetry);
      setTelemetryOpen(true);
      await Promise.all([refreshOrders(), refreshAll()]);
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
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to stop bot', 'error');
    }
  };

  const handleImportXmlFile = (e: React.ChangeEvent<HTMLInputElement>) => {
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
      const martMatch = xml.match(/<field\s+name=["']MARTINGALE["']>([^<]+)<\/field>/i);
      const tpMatch = xml.match(/<field\s+name=["']TAKE_PROFIT["']>([^<]+)<\/field>/i);
      const slMatch = xml.match(/<field\s+name=["']STOP_LOSS["']>([^<]+)<\/field>/i);

      setPendingXmlImport({
        fileName: file.name,
        symbol: symMatch?.[1]?.trim(),
        contractType: typeMatch?.[1]?.trim(),
        stake: amtMatch?.[1]?.trim(),
        duration: durMatch?.[1]?.trim(),
        barrier: predMatch?.[1]?.trim(),
        martingale: martMatch?.[1]?.trim(),
        takeProfit: tpMatch?.[1]?.trim(),
        stopLoss: slMatch?.[1]?.trim(),
      });
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const confirmOpenPendingXml = () => {
    if (!pendingXmlImport) return;
    const p = pendingXmlImport;
    const cleanName = p.fileName.replace(/\.xml$/i, '');
    if (p.symbol) setSymbol(p.symbol);
    if (p.stake) setBaseStake(p.stake);
    if (p.contractType) {
      setContractType(p.contractType);
      setTradeTypeGroup(inferGroupFromContract(p.contractType));
    }
    if (p.duration) setDuration(p.duration);
    if (p.barrier) setBarrier(p.barrier);
    if (p.martingale) setMartingale(p.martingale);
    if (p.takeProfit) setTakeProfit(p.takeProfit);
    if (p.stopLoss) setStopLoss(p.stopLoss);
    setStrategyName(cleanName);

    setSavedBots((prev) => [
      {
        id: `xml-${Date.now()}`,
        name: cleanName,
        lastModified: 'Just now',
        status: 'Local',
        symbol: p.symbol || symbol,
        contractType: p.contractType || contractType,
        stake: p.stake || baseStake,
        duration: p.duration || duration,
        durationUnit,
        barrier: p.barrier || barrier,
        martingale: p.martingale || martingale,
        takeProfit: p.takeProfit || takeProfit,
        stopLoss: p.stopLoss || stopLoss,
      },
      ...prev.filter((b) => b.name !== cleanName),
    ]);

    setPendingXmlImport(null);
    setLoadModalOpen(false);
    setBotView('builder');
    showToast(`Loaded ${cleanName} into Bot Builder`, 'success');
  };

  const handleSaveAndExportXml = () => {
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

    setSavedBots((prev) => [
      {
        id: `local-${Date.now()}`,
        name: strategyName,
        lastModified: 'Just now',
        status: 'Local',
        symbol,
        contractType,
        stake: baseStake,
        duration,
        durationUnit,
        barrier,
        martingale,
        takeProfit,
        stopLoss,
      },
      ...prev.filter((b) => b.name !== strategyName),
    ]);
    showToast('Strategy saved & Blockly XML exported', 'success');
  };

  const loadSavedBot = (b: SavedBotItem) => {
    setStrategyName(b.name);
    setSymbol(b.symbol);
    setContractType(b.contractType);
    setTradeTypeGroup(inferGroupFromContract(b.contractType));
    setBaseStake(b.stake);
    setDuration(b.duration);
    setDurationUnit(b.durationUnit);
    setBarrier(b.barrier);
    setMartingale(b.martingale);
    setTakeProfit(b.takeProfit);
    setStopLoss(b.stopLoss);
    setBotRowMenuId(null);
    setBotView('builder');
    showToast(`Loaded ${b.name}`, 'success');
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
    () =>
      orders.filter((o) => {
        if (o.source !== 'bot') return false;
        const mode = o.account_mode || (o.execution_mode === 'deriv' ? 'real' : 'demo');
        if (mode !== accountMode) return false;
        const openedMs = new Date(o.opened_at).getTime();
        if (sessionResetAt > 0 && Number.isFinite(openedMs) && openedMs < sessionResetAt) return false;
        return true;
      }),
    [orders, accountMode, sessionResetAt]
  );

  const closedBotOrders = useMemo(
    () => botOrders.filter((o) => o.status === 'CLOSED'),
    [botOrders]
  );

  // Totals for the 2x3 Drawer Footer — derived cleanly from session orders so profit/loss matches the header balance to the cent
  const totalStake = useMemo(
    () => Number(botOrders.reduce((s, o) => s + Number(o.stake || 0), 0).toFixed(2)),
    [botOrders]
  );
  const totalPayout = useMemo(
    () =>
      Number(
        closedBotOrders
          .reduce((s, o) => {
            const p = Number(o.pnl || 0);
            if (p > 0) return s + Number(o.payout || Number(o.stake || 0) + p);
            return s + Math.max(0, Number(o.payout || 0));
          }, 0)
          .toFixed(2)
      ),
    [closedBotOrders]
  );
  const totalRuns = botOrders.length;
  const contractsWon = useMemo(
    () => closedBotOrders.filter((o) => Number(o.pnl || 0) > 0).length,
    [closedBotOrders]
  );
  const contractsLost = useMemo(
    () => closedBotOrders.filter((o) => Number(o.pnl || 0) <= 0).length,
    [closedBotOrders]
  );
  const totalProfitLoss = useMemo(
    () => Number(closedBotOrders.reduce((s, o) => s + Number(o.pnl || 0), 0).toFixed(2)),
    [closedBotOrders]
  );

  const latestBotOrder = botOrders[0];
  const latestMetrics = latestBotOrder ? computeLiveOrderMetrics(latestBotOrder, ticks) : null;
  const activeInst = instruments.find((i) => i.symbol === symbol) || instruments[0];
  const latestQuote = ticks[symbol]?.quote ?? candles[candles.length - 1]?.close ?? activeInst?.price ?? 1684.45;
  const prevQuote = candles.length > 1 ? candles[candles.length - 2].close : latestQuote;
  const quoteDiff = latestQuote - prevQuote;
  const quotePct = prevQuote > 0 ? Math.abs((quoteDiff / prevQuote) * 100) : 0.01;

  const contractChoices = TRADE_TYPE_OPTIONS[tradeTypeGroup];

  const journalEntries: BotJournalEntry[] = useMemo(() => {
    const raw = telemetry?.journal || [];
    if (raw.length === 0) {
      return [
        {
          id: 'init-acct',
          time: new Date().toISOString(),
          type: 'info',
          text: 'You are using your USD account.',
        },
      ];
    }
    return raw.filter((j) => {
      if (journalFilter === 'all') return true;
      if (journalFilter === 'error') return j.type === 'error';
      if (journalFilter === 'profit') return j.type === 'profit' || j.type === 'loss';
      if (journalFilter === 'bought') return j.type === 'bought' || j.type === 'stake';
      return true;
    });
  }, [telemetry?.journal, journalFilter]);

  const handleDownloadTransactions = () => {
    const rows = [
      'Ref ID,Symbol,Contract,Entry Spot,Exit Spot,Buy Price,Profit/Loss,Timestamp',
      ...botOrders.map((o) => {
        const refId = o.deriv_contract_id || `4150${String(o.id).padStart(6, '0')}`;
        const exitSpot = o.exit_price ?? o.current_price ?? o.entry_price;
        return `${refId},${o.symbol},${getContractDisplayLabel(o.contract_type)},${Number(o.entry_price).toFixed(2)},${Number(exitSpot).toFixed(2)},${Number(o.stake).toFixed(2)},${Number(o.pnl || 0).toFixed(2)},${formatGmtStamp(o.opened_at)}`;
      }),
    ].join('\n');
    const blob = new Blob([rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `deriv_bot_transactions_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadJournal = () => {
    const txt = journalEntries.map((j) => `[${formatJournalTime(j.time)}] ${j.text}`).join('\n');
    const blob = new Blob([txt], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `deriv_bot_journal_${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleResetSummaryStats = () => {
    if (telemetry?.running) return;
    const now = Date.now();
    setSessionResetAt(now);
    if (sessionAnchorKey) {
      try {
        sessionStorage.setItem(sessionAnchorKey, String(now));
      } catch {
        // ignore
      }
    }
    setTelemetry(null);
  };

  const runState = telemetry?.runState || (telemetry?.running ? 'buying' : 'idle');

  if (initLoading) {
    return <DerivBotInitializingLoader />;
  }

  return (
    <div className="relative h-[100dvh] lg:h-[calc(100vh-64px)] flex flex-col bg-white dark:bg-[#0F1115] text-[#111319] dark:text-white overflow-hidden select-none">
      {blocklyLoading && <BlocklyOverlayLoader />}

      {/* 1. EXACT DERIV BOT TOP HEADER (Screenshots 152359, 152411, 152825, 152836) */}
      <header className="h-[54px] shrink-0 px-3.5 bg-white dark:bg-[#151820] border-b border-slate-200/80 dark:border-white/[0.08] flex items-center justify-between gap-2 z-30">
        <div className="flex items-center gap-3 min-w-0">
          <span className="w-[34px] h-[34px] rounded-[6px] bg-[#FF444F] text-white font-display font-bold text-[15px] flex items-center justify-center shrink-0 tracking-tight">
            DB
          </span>
          <button
            type="button"
            onClick={() => setAccountSheetOpen(true)}
            className="flex flex-col items-start text-left cursor-pointer min-w-0"
          >
            <span
              className={`inline-flex items-center gap-1.5 text-[12px] font-medium leading-tight ${
                accountMode === 'demo' ? 'text-[#E5A93B]' : 'text-[#2A9D8F]'
              }`}
            >
              {accountMode === 'demo' ? 'Demo account' : 'Real account'}
              <ChevronDown
                className={`w-3.5 h-3.5 text-[#333333] dark:text-slate-300 transition-transform ${
                  accountSheetOpen ? 'rotate-180' : ''
                }`}
              />
            </span>
            <span className="font-mono-num text-[14px] font-bold text-[#111319] dark:text-white leading-tight tabular-nums">
              {hideBalances ? '*****' : `${optionsBal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD`}
            </span>
          </button>
        </div>

        <button
          type="button"
          onClick={() => setDepositOpen(true)}
          className="px-4 py-[7px] rounded-full bg-[#FF444F] hover:bg-[#E63946] text-white text-[13px] font-bold cursor-pointer shrink-0 transition-colors"
        >
          Deposit
        </button>
      </header>

      {/* 2. MAIN WORKSPACE AREA */}
      <div className="relative flex-1 min-h-0 flex flex-col overflow-hidden bg-[#F4F5F7]/60 dark:bg-[#0F1115]">
        {/* VIEW 1: DASHBOARD (Screenshot 152836) */}
        {botView === 'dashboard' && (
          <div className="flex-1 overflow-y-auto bg-white dark:bg-[#0F1115] px-4 py-4 space-y-5">
            <p className="text-[13px] text-[#374151] dark:text-[#9BA3B0] leading-relaxed">
              Import a bot from your computer or Google Drive, build it from scratch, or start with a quick strategy.
            </p>

            {/* 4 Square Centered Action Tiles */}
            <div className="grid grid-cols-4 gap-2.5 max-w-xl">
              <button
                type="button"
                onClick={() => {
                  setLoadModalTab('local');
                  setPendingXmlImport(null);
                  setLoadModalOpen(true);
                }}
                className="flex flex-col items-center gap-2 cursor-pointer group"
              >
                <span className="w-[54px] h-[54px] rounded-xl bg-[#F4F5F7] dark:bg-[#181C25] flex items-center justify-center group-hover:ring-2 group-hover:ring-[#FF444F]/40">
                  <svg viewBox="0 0 28 36" className="w-7 h-8" aria-hidden="true">
                    <rect x="4" y="2" width="20" height="32" rx="3" fill="#0F4C6C" stroke="#7BB3B8" strokeWidth="1.5" />
                    <circle cx="14" cy="29.5" r="1.4" fill="#E2E8F0" />
                    <rect x="11" y="5" width="6" height="1.5" rx="0.75" fill="#7BB3B8" />
                  </svg>
                </span>
                <span className="text-[11px] font-medium text-[#374151] dark:text-[#C7CDD6]">Local</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setLoadModalTab('drive');
                  setLoadModalOpen(true);
                }}
                className="flex flex-col items-center gap-2 cursor-pointer group"
              >
                <span className="w-[54px] h-[54px] rounded-xl bg-[#F4F5F7] dark:bg-[#181C25] flex items-center justify-center group-hover:ring-2 group-hover:ring-[#FF444F]/40">
                  <svg viewBox="0 0 36 32" className="w-8 h-7" aria-hidden="true">
                    <polygon points="12,3 24,3 33,19 21,19" fill="#FBC02D" />
                    <polygon points="3,19 12,3 18,13.5 9,29" fill="#0F9D58" />
                    <polygon points="9,29 15,19 33,19 27,29" fill="#4285F4" />
                  </svg>
                </span>
                <span className="text-[11px] font-medium text-[#374151] dark:text-[#C7CDD6]">Google Drive</span>
              </button>

              <button
                type="button"
                onClick={() => setBotView('builder')}
                className="flex flex-col items-center gap-2 cursor-pointer group"
              >
                <span className="w-[54px] h-[54px] rounded-xl bg-[#F4F5F7] dark:bg-[#181C25] flex items-center justify-center group-hover:ring-2 group-hover:ring-[#FF444F]/40">
                  <svg viewBox="0 0 32 32" className="w-7 h-7" aria-hidden="true">
                    <path d="M12 4h6v5a2 2 0 1 0 0 4v5h-6v-3a2 2 0 1 1 0-4V4z" fill="#0F4C6C" />
                    <path d="M10 15h8v10H10z" fill="#5CA3AC" />
                  </svg>
                </span>
                <span className="text-[11px] font-medium text-[#374151] dark:text-[#C7CDD6]">Bot Builder</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setQsStep(1);
                  setQsOpen(true);
                }}
                className="flex flex-col items-center gap-2 cursor-pointer group"
              >
                <span className="w-[54px] h-[54px] rounded-xl bg-[#F4F5F7] dark:bg-[#181C25] flex items-center justify-center group-hover:ring-2 group-hover:ring-[#FF444F]/40">
                  <svg viewBox="0 0 32 32" className="w-7 h-7" aria-hidden="true">
                    <rect x="4" y="4" width="11" height="11" rx="2" fill="#0F4C6C" />
                    <rect x="17" y="4" width="11" height="11" rx="2" fill="#68A3AA" />
                    <rect x="4" y="17" width="11" height="11" rx="2" fill="#68A3AA" />
                    <rect x="17" y="17" width="11" height="11" rx="2" fill="#0F4C6C" />
                  </svg>
                </span>
                <span className="text-[11px] font-medium text-[#374151] dark:text-[#C7CDD6]">Quick strategy</span>
              </button>
            </div>

            {/* Analyser & Strategy Lab Quick Row */}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  handleToggleAnalyserSync(true);
                  setBotView('builder');
                }}
                className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold border inline-flex items-center gap-1.5 cursor-pointer ${
                  analyserSync
                    ? 'bg-[#00A878]/15 border-[#00A878] text-[#00A878]'
                    : 'bg-[#F8F9FA] dark:bg-[#181C25] border-slate-200 dark:border-white/10 text-[#374151] dark:text-slate-300'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5" />
                {analyserSync ? 'Analyser Live Sync: ON' : 'Sync Market Analyser'}
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('trading-bots')}
                className="px-3 py-1.5 rounded-lg text-[11px] font-semibold bg-[#F8F9FA] dark:bg-[#181C25] border border-slate-200 dark:border-white/10 text-[#374151] dark:text-slate-300 cursor-pointer"
              >
                Prebuilt Bots Lab
              </button>
            </div>

            {/* Your bots: table matching Screenshot 152836 */}
            <div className="pt-1">
              <h2 className="text-[14px] font-bold text-[#111319] dark:text-white mb-2.5">Your bots:</h2>
              <div className="overflow-visible">
                <table className="w-full text-[12px]">
                  <thead>
                    <tr className="text-left text-[#111319] dark:text-slate-300 font-bold border-b border-slate-100 dark:border-white/[0.06]">
                      <th className="py-2 pr-2">Bot name</th>
                      <th className="py-2 px-2">Last modified</th>
                      <th className="py-2 pl-2">Status</th>
                      <th className="py-2 w-8"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-white/[0.06]">
                    {savedBots.map((b) => (
                      <tr key={b.id} className="hover:bg-[#F8F9FA] dark:hover:bg-white/[0.02]">
                        <td
                          onClick={() => loadSavedBot(b)}
                          className="py-3 pr-2 font-normal text-[#1F2329] dark:text-white cursor-pointer"
                        >
                          {b.name}
                        </td>
                        <td className="py-3 px-2 text-[#525866] dark:text-[#9BA3B0] whitespace-nowrap">
                          {b.lastModified}
                        </td>
                        <td className="py-3 pl-2 text-[#525866] dark:text-[#9BA3B0]">
                          <span className="inline-flex items-center gap-1.5">
                            {b.status === 'Local' ? (
                              <Monitor className="w-3.5 h-3.5 text-[#0F4C6C] dark:text-[#7BB3B8]" />
                            ) : (
                              <FileText className="w-3.5 h-3.5 text-[#525866]" />
                            )}
                            {b.status}
                          </span>
                        </td>
                        <td className="py-3 text-right relative">
                          <button
                            type="button"
                            onClick={() => setBotRowMenuId(botRowMenuId === b.id ? null : b.id)}
                            className="p-1 rounded hover:bg-slate-100 dark:hover:bg-white/10 cursor-pointer"
                            aria-label="Bot actions"
                          >
                            <MoreVertical className="w-4 h-4 text-[#525866]" />
                          </button>
                          {botRowMenuId === b.id && (
                            <div className="absolute right-0 top-9 z-40 w-36 bg-white dark:bg-[#1E222B] border border-slate-200 dark:border-white/10 rounded-xl shadow-lg py-1 text-left text-xs">
                              <button
                                type="button"
                                onClick={() => loadSavedBot(b)}
                                className="w-full px-3 py-2 hover:bg-[#F4F5F7] dark:hover:bg-white/5 font-medium cursor-pointer"
                              >
                                Open in Builder
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setSavedBots((prev) => prev.filter((item) => item.id !== b.id));
                                  setBotRowMenuId(null);
                                }}
                                className="w-full px-3 py-2 hover:bg-[#F4F5F7] dark:hover:bg-white/5 text-[#FF444F] font-medium cursor-pointer"
                              >
                                Delete
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* VIEW 2: CHART TAB (Screenshot 152825) */}
        {botView === 'chart' && (
          <div className="relative flex-1 bg-white dark:bg-[#151820] overflow-hidden">
            {/* Floating Symbol Card Top-Left matching Screenshot 152825 */}
            <div className="absolute top-3 left-3 z-20 bg-white/95 dark:bg-[#181C25]/95 backdrop-blur-sm border border-slate-200 dark:border-white/10 rounded-lg shadow-md px-3 py-2 flex items-center gap-2.5 max-w-[300px]">
              <SynthCandleBadge num={getSymbolBadgeNum(symbol)} />
              <div className="min-w-0">
                <div className="flex items-center gap-1">
                  <select
                    value={symbol}
                    onChange={(e) => setSymbol(e.target.value)}
                    aria-label="Chart symbol"
                    className="bg-transparent text-[13px] font-bold text-[#111319] dark:text-white outline-none cursor-pointer truncate max-w-[165px]"
                  >
                    {instruments.map((inst) => (
                      <option key={inst.symbol} value={inst.symbol} className="text-[#111319]">
                        {inst.display_name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center gap-1.5 text-[11px] font-mono-num tabular-nums mt-0.5">
                  <span className="font-semibold text-[#525866] dark:text-slate-300">
                    {latestQuote.toFixed(2)}
                  </span>
                  <span className="text-[#525866] dark:text-slate-400">
                    {quoteDiff >= 0 ? '+' : '-'}
                    {Math.abs(quoteDiff).toFixed(2)} ({quotePct.toFixed(2)}%)
                  </span>
                  <span className={quoteDiff >= 0 ? 'text-[#2A9D8F]' : 'text-[#FF444F]'}>
                    {quoteDiff >= 0 ? '▲' : '▼'}
                  </span>
                </div>
              </div>
            </div>

            <div ref={chartContainerRef} className="w-full h-full" />
          </div>
        )}

        {/* VIEW 3: BOT BUILDER WORKSPACE (Screenshots 152359, 152411, 152424) */}
        {botView === 'builder' && (
          <div className="flex-1 min-h-0 flex overflow-hidden">
            {/* Left Vertical Workspace Icon Rail (Screenshots 152359, 152424) */}
            <aside className="w-[46px] shrink-0 bg-white dark:bg-[#151820] border-r border-slate-200/80 dark:border-white/[0.08] flex flex-col items-center py-3 gap-3.5 z-10 overflow-y-auto no-scrollbar">
              <button
                type="button"
                onClick={handleResetDefaults}
                title="Reset"
                className="p-1.5 text-[#374151] dark:text-slate-300 hover:text-[#FF444F] cursor-pointer"
              >
                <RotateCcw className="w-[18px] h-[18px]" />
              </button>
              <button
                type="button"
                onClick={() => {
                  setLoadModalTab('local');
                  setPendingXmlImport(null);
                  setLoadModalOpen(true);
                }}
                title="Load strategy"
                className="p-1.5 text-[#374151] dark:text-slate-300 hover:text-[#0F4C6C] cursor-pointer"
              >
                <FolderOpen className="w-[18px] h-[18px]" />
              </button>
              <button
                type="button"
                onClick={handleSaveAndExportXml}
                title="Save XML"
                className="p-1.5 text-[#374151] dark:text-slate-300 hover:text-[#00A878] cursor-pointer"
              >
                <Save className="w-[18px] h-[18px]" />
              </button>
              <button
                type="button"
                onClick={() => handleToggleAnalyserSync(!analyserSync)}
                title={analyserSync ? 'Analyser Live Sync ON' : 'Sync Market Analyser'}
                className={`p-1.5 rounded cursor-pointer ${
                  analyserSync ? 'text-[#00A878] bg-[#00A878]/10' : 'text-[#374151] dark:text-slate-300 hover:text-[#00A878]'
                }`}
              >
                <SlidersHorizontal className="w-[18px] h-[18px]" />
              </button>

              <div className="w-6 border-t border-slate-200 dark:border-white/10" />

              <button
                type="button"
                onClick={handleResetDefaults}
                title="Undo"
                className="p-1.5 text-[#6B7280] dark:text-slate-400 hover:text-[#111319] dark:hover:text-white cursor-pointer"
              >
                <Undo2 className="w-[18px] h-[18px]" />
              </button>
              <button
                type="button"
                onClick={() => setExecutionSpeed((s) => (s === 'fast' ? 'normal' : 'fast'))}
                title={`Execution Speed: ${executionSpeed}`}
                className="p-1.5 text-[#6B7280] dark:text-slate-400 hover:text-[#111319] dark:hover:text-white cursor-pointer"
              >
                <Redo2 className="w-[18px] h-[18px]" />
              </button>

              <div className="w-6 border-t border-slate-200 dark:border-white/10" />

              <button
                type="button"
                onClick={() => setCanvasZoom((z) => Math.min(115, z + 5))}
                title="Zoom in"
                className="p-1.5 text-[#374151] dark:text-slate-300 hover:text-[#111319] dark:hover:text-white cursor-pointer"
              >
                <ZoomIn className="w-[18px] h-[18px]" />
              </button>
              <button
                type="button"
                onClick={() => setCanvasZoom((z) => Math.max(85, z - 5))}
                title="Zoom out"
                className="p-1.5 text-[#374151] dark:text-slate-300 hover:text-[#111319] dark:hover:text-white cursor-pointer"
              >
                <ZoomOut className="w-[18px] h-[18px]" />
              </button>
            </aside>

            {/* Right Blockly-style Workspace Canvas */}
            <form
              onSubmit={handleRunBot}
              className="flex-1 overflow-auto bg-[#F4F5F7] dark:bg-[#0B0E14] px-3.5 py-3.5 space-y-5"
            >
              {/* Top Row: Quick strategy button + Analyser sync pill */}
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setQsStep(1);
                    setQsOpen(true);
                  }}
                  className="px-4 py-2 rounded-[4px] bg-[#FF444F] hover:bg-[#E63946] text-white text-[13px] font-bold shadow-xs cursor-pointer"
                >
                  Quick strategy
                </button>

                <button
                  type="button"
                  onClick={() => handleToggleAnalyserSync(!analyserSync)}
                  className={`px-3 py-1.5 rounded-[4px] text-[11px] font-semibold border inline-flex items-center gap-1.5 cursor-pointer ${
                    analyserSync
                      ? 'bg-[#00A878] border-[#00A878] text-white'
                      : 'bg-white dark:bg-[#181C25] border-slate-200 dark:border-white/10 text-[#374151] dark:text-slate-300'
                  }`}
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  {analyserSync ? 'Analyser Sync ON' : 'Analyser Sync'}
                </button>

                <input
                  type="text"
                  value={strategyName}
                  onChange={(e) => setStrategyName(e.target.value)}
                  aria-label="Strategy Name"
                  className="px-2.5 py-1.5 rounded-[4px] bg-white/90 dark:bg-[#181C25] border border-slate-200 dark:border-white/10 text-[12px] font-semibold w-36 outline-none"
                />
              </div>

              {/* Blocks Container with Zoom & Horizontal Scroll for Block 4 matching 152359 & 152424 */}
              <div
                className="flex flex-col lg:flex-row gap-5 items-start pb-10 origin-top-left transition-transform"
                style={{ transform: `scale(${canvasZoom / 100})` }}
              >
                <div className="space-y-6 w-full max-w-[460px]">
                  {/* BLOCK 1: 1. Trade parameters (#0A405C Navy Blockly Frame) */}
                  <div className="rounded-[4px] border-l-[6px] border-[#0A405C] bg-[#0A405C] shadow-xs overflow-hidden">
                    <div className="px-3 py-2 text-white text-[12px] font-semibold flex items-center gap-2">
                      <ListChecks className="w-3.5 h-3.5 text-white/90" />
                      <span>1. Trade parameters</span>
                    </div>

                    <div className="bg-[#0A405C] pr-1 pb-2 space-y-1">
                      {/* Market selector pill */}
                      <div className="bg-[#E5E7EB] dark:bg-[#1E2532] rounded-r-[4px] px-2.5 py-1.5 flex flex-wrap items-center gap-1 text-[11px] text-[#111319] dark:text-slate-200">
                        <span className="font-medium">Market:</span>
                        <select
                          value={marketCategory}
                          onChange={(e) => setMarketCategory(e.target.value as any)}
                          className="px-2 py-0.5 rounded-full bg-white dark:bg-[#151820] border border-slate-300 dark:border-white/15 font-medium outline-none"
                        >
                          <option value="Synthetic">Derived</option>
                          <option value="Forex">Forex</option>
                          <option value="Crypto">Crypto</option>
                          <option value="Metals/Cmd">Commodities</option>
                          <option value="Indices">Indices</option>
                          <option value="All">All Markets</option>
                        </select>
                        <span className="text-slate-500">&gt;</span>
                        <select
                          value={symbol}
                          onChange={(e) => setSymbol(e.target.value)}
                          className="px-2 py-0.5 rounded-full bg-white dark:bg-[#151820] border border-slate-300 dark:border-white/15 font-medium outline-none max-w-[180px]"
                        >
                          {filteredSymbols.map((inst) => (
                            <option key={inst.symbol} value={inst.symbol}>
                              {inst.display_name}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Trade Type pill */}
                      <div className="bg-[#E5E7EB] dark:bg-[#1E2532] rounded-r-[4px] px-2.5 py-1.5 flex flex-wrap items-center gap-1 text-[11px] text-[#111319] dark:text-slate-200 w-fit max-w-full">
                        <span className="font-medium">Trade Type:</span>
                        <select
                          value={tradeTypeGroup}
                          onChange={(e) => handleGroupChange(e.target.value as TradeTypeGroup)}
                          className="px-2 py-0.5 rounded-full bg-white dark:bg-[#151820] border border-slate-300 dark:border-white/15 font-medium outline-none"
                        >
                          {(Object.keys(TRADE_TYPE_OPTIONS) as TradeTypeGroup[]).map((grp) => (
                            <option key={grp} value={grp}>
                              {grp}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Contract Type pill */}
                      <div className="bg-[#E5E7EB] dark:bg-[#1E2532] rounded-r-[4px] px-2.5 py-1.5 flex items-center gap-1.5 text-[11px] text-[#111319] dark:text-slate-200 w-fit">
                        <span className="font-medium">Contract Type:</span>
                        <select
                          value={contractType}
                          onChange={(e) => setContractType(e.target.value)}
                          className="px-2 py-0.5 rounded-full bg-white dark:bg-[#151820] border border-slate-300 dark:border-white/15 font-semibold outline-none"
                        >
                          {contractChoices.map((c) => (
                            <option key={c.value} value={c.value}>
                              {c.label}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Default Candle Interval pill */}
                      <div className="bg-[#E5E7EB] dark:bg-[#1E2532] rounded-r-[4px] px-2.5 py-1.5 flex items-center gap-1.5 text-[11px] text-[#111319] dark:text-slate-200 w-fit">
                        <span className="font-medium">Default Candle Interval:</span>
                        <select
                          value={candleInterval}
                          onChange={(e) => setCandleInterval(e.target.value as any)}
                          className="px-2 py-0.5 rounded-full bg-white dark:bg-[#151820] border border-slate-300 dark:border-white/15 font-medium outline-none"
                        >
                          <option value="1t">1 tick</option>
                          <option value="1m">1 minute</option>
                          <option value="5m">5 minutes</option>
                          <option value="15m">15 minutes</option>
                        </select>
                      </div>

                      {/* Restart buy/sell checkboxes matching Screenshot 152359 */}
                      <label className="bg-[#E5E7EB] dark:bg-[#1E2532] rounded-r-[4px] px-2.5 py-1.5 flex items-center gap-2 text-[11px] text-[#111319] dark:text-slate-200 w-fit cursor-pointer">
                        <span>Restart buy/sell on error (disable for better performance):</span>
                        <input
                          type="checkbox"
                          checked={restartBuySellOnError}
                          onChange={(e) => setRestartBuySellOnError(e.target.checked)}
                          className="accent-[#0A405C]"
                        />
                      </label>

                      <label className="bg-[#E5E7EB] dark:bg-[#1E2532] rounded-r-[4px] px-2.5 py-1.5 flex items-center gap-2 text-[11px] text-[#111319] dark:text-slate-200 w-fit cursor-pointer">
                        <span>Restart last trade on error (bot ignores the unsuccessful trade):</span>
                        <input
                          type="checkbox"
                          checked={restartLastTradeOnError}
                          onChange={(e) => setRestartLastTradeOnError(e.target.checked)}
                          className="accent-[#0A405C]"
                        />
                      </label>

                      {/* Run once at start: */}
                      <div className="pt-2">
                        <div className="px-3 py-1.5 text-white text-[12px] font-semibold">Run once at start:</div>
                        <div className="pl-2 space-y-1">
                          {[
                            {
                              varName: 'initialStake',
                              node: (
                                <input
                                  type="number"
                                  step="0.1"
                                  min="0.35"
                                  value={baseStake}
                                  onChange={(e) => setBaseStake(e.target.value)}
                                  className="w-12 px-1.5 py-0.5 rounded-full bg-white dark:bg-[#151820] border border-slate-300 dark:border-white/15 font-mono-num text-center font-bold outline-none"
                                />
                              ),
                            },
                            {
                              varName: 'prediction',
                              node: (
                                <input
                                  type="text"
                                  value={barrier}
                                  onChange={(e) => setBarrier(e.target.value)}
                                  className="w-12 px-1.5 py-0.5 rounded-full bg-white dark:bg-[#151820] border border-slate-300 dark:border-white/15 font-mono-num text-center font-bold outline-none"
                                />
                              ),
                            },
                            {
                              varName: 'martingaleFactor',
                              node: (
                                <input
                                  type="number"
                                  step="0.1"
                                  min="1"
                                  value={martingale}
                                  onChange={(e) => setMartingale(e.target.value)}
                                  className="w-12 px-1.5 py-0.5 rounded-full bg-white dark:bg-[#151820] border border-slate-300 dark:border-white/15 font-mono-num text-center font-bold outline-none"
                                />
                              ),
                            },
                            {
                              varName: 'profitThreshold',
                              node: (
                                <input
                                  type="number"
                                  min="1"
                                  value={takeProfit}
                                  onChange={(e) => setTakeProfit(e.target.value)}
                                  className="w-12 px-1.5 py-0.5 rounded-full bg-white dark:bg-[#151820] border border-slate-300 dark:border-white/15 font-mono-num text-center font-bold outline-none"
                                />
                              ),
                            },
                            {
                              varName: 'lossThreshold',
                              node: (
                                <input
                                  type="number"
                                  min="1"
                                  value={stopLoss}
                                  onChange={(e) => setStopLoss(e.target.value)}
                                  className="w-12 px-1.5 py-0.5 rounded-full bg-white dark:bg-[#151820] border border-slate-300 dark:border-white/15 font-mono-num text-center font-bold outline-none"
                                />
                              ),
                            },
                            {
                              varName: 'maxTrades',
                              node: (
                                <input
                                  type="number"
                                  min="1"
                                  value={maxTrades}
                                  onChange={(e) => setMaxTrades(e.target.value)}
                                  className="w-12 px-1.5 py-0.5 rounded-full bg-white dark:bg-[#151820] border border-slate-300 dark:border-white/15 font-mono-num text-center font-bold outline-none"
                                />
                              ),
                            },
                            {
                              varName: 'progression',
                              node: (
                                <select
                                  value={useMartingale}
                                  onChange={(e) => setUseMartingale(e.target.value as 'true' | 'false')}
                                  className="px-2 py-0.5 rounded-full bg-white dark:bg-[#151820] border border-slate-300 dark:border-white/15 font-semibold outline-none"
                                >
                                  <option value="true">enabled</option>
                                  <option value="false">flat</option>
                                </select>
                              ),
                            },
                          ].map((row) => (
                            <div
                              key={row.varName}
                              className="bg-[#E5E7EB] dark:bg-[#1E2532] rounded-[4px] px-2.5 py-1 flex items-center gap-1.5 text-[11px] text-[#111319] dark:text-slate-200 w-fit"
                            >
                              <span>set</span>
                              <span className="px-2 py-0.5 rounded-full bg-white dark:bg-[#151820] border border-slate-300 dark:border-white/15 font-semibold">
                                {row.varName} ▾
                              </span>
                              <span>to</span>
                              {row.node}
                            </div>
                          ))}

                          {contractType === 'ACCU' && (
                            <div className="bg-[#E5E7EB] dark:bg-[#1E2532] rounded-[4px] px-2.5 py-1 flex items-center gap-1.5 text-[11px] w-fit">
                              <span>growthRate</span>
                              {[0.01, 0.02, 0.03, 0.04, 0.05].map((r) => (
                                <button
                                  key={r}
                                  type="button"
                                  onClick={() => setGrowthRate(r)}
                                  className={`px-2 py-0.5 rounded-full font-mono font-bold cursor-pointer ${
                                    growthRate === r ? 'bg-[#FF444F] text-white' : 'bg-white dark:bg-[#151820]'
                                  }`}
                                >
                                  {(r * 100).toFixed(0)}%
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Trade options: */}
                      <div className="pt-2">
                        <div className="px-3 py-1.5 text-white text-[12px] font-semibold">Trade options:</div>
                        <div className="pl-2">
                          <div className="bg-[#E5E7EB] dark:bg-[#1E2532] rounded-[4px] px-2.5 py-1.5 flex flex-wrap items-center gap-1.5 text-[11px] text-[#111319] dark:text-slate-200 w-fit">
                            <span>Duration:</span>
                            <select
                              value={durationUnit}
                              onChange={(e) => setDurationUnit(e.target.value)}
                              className="px-2 py-0.5 rounded-full bg-white dark:bg-[#151820] border border-slate-300 dark:border-white/15 font-semibold outline-none"
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
                              className="w-10 px-1.5 py-0.5 rounded-full bg-white dark:bg-[#151820] border border-slate-300 dark:border-white/15 font-mono-num text-center font-bold outline-none"
                            />
                            <span>Stake: USD</span>
                            <span className="px-2 py-0.5 rounded-full bg-white dark:bg-[#151820] border border-slate-300 dark:border-white/15 font-mono-num font-bold">
                              {Number(baseStake || 0).toFixed(2)}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* BLOCK 2: 2. Purchase conditions */}
                  <div className="rounded-[4px] border-l-[6px] border-[#0A405C] bg-[#0A405C] shadow-xs overflow-hidden">
                    <div className="px-3 py-2 text-white text-[12px] font-semibold flex items-center gap-2">
                      <ShoppingBasket className="w-3.5 h-3.5 text-white/90" />
                      <span>2. Purchase conditions</span>
                    </div>
                    <div className="bg-[#0A405C] pr-1 pb-2 pl-2 space-y-1">
                      <div className="bg-[#E5E7EB] dark:bg-[#1E2532] rounded-[4px] px-2.5 py-1.5 flex flex-wrap items-center gap-1.5 text-[11px] text-[#111319] dark:text-slate-200 w-fit max-w-full">
                        <span className="font-semibold">if</span>
                        <select
                          value={entryCondition}
                          onChange={(e) => setEntryCondition(e.target.value as any)}
                          className="px-2 py-0.5 rounded-full bg-white dark:bg-[#151820] border border-slate-300 dark:border-white/15 font-medium outline-none max-w-[210px]"
                        >
                          <option value="any_tick">Every incoming tick (Instant)</option>
                          <option value="last_digit_gte">Last digit is greater or equal</option>
                          <option value="last_digit_lte">Last digit is less or equal</option>
                          <option value="rsi_signal">Analyser RSI / SMC confirms</option>
                        </select>
                        {(entryCondition === 'last_digit_gte' || entryCondition === 'last_digit_lte') && (
                          <input
                            type="number"
                            min="0"
                            max="9"
                            value={conditionDigit}
                            onChange={(e) => setConditionDigit(e.target.value)}
                            className="w-10 px-1.5 py-0.5 rounded-full bg-white dark:bg-[#151820] border border-slate-300 dark:border-white/15 font-mono-num text-center font-bold outline-none"
                          />
                        )}
                        <span className="font-semibold">then</span>
                        <span className="px-2 py-0.5 rounded-full bg-[#00A878]/15 text-[#007F5B] dark:text-[#00A878] font-bold">
                          Purchase ({getContractDisplayLabel(contractType)})
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* BLOCK 4: 4. Restart trading conditions (Screenshots 152359, 152424) */}
                <div className="w-full max-w-[420px] rounded-[4px] border-l-[6px] border-[#0A405C] bg-[#0A405C] shadow-xs overflow-hidden shrink-0">
                  <div className="px-3 py-2 text-white text-[12px] font-semibold flex items-center gap-2">
                    <Flag className="w-3.5 h-3.5 text-white/90" />
                    <span>4. Restart trading conditions</span>
                  </div>
                  <div className="bg-[#0A405C] pr-1 pb-2 pl-2 space-y-1">
                    <div className="bg-[#E5E7EB] dark:bg-[#1E2532] rounded-[4px] px-2.5 py-1.5 text-[11px] text-[#111319] dark:text-slate-200 flex flex-wrap items-center gap-1.5 w-fit">
                      <span>Update Stake And Side On Result: resultIsWin</span>
                      <span className="px-2 py-0.5 rounded-full bg-white dark:bg-[#151820] border border-slate-300 dark:border-white/15 font-semibold">
                        Result is Win ▾
                      </span>
                    </div>
                    <div className="bg-[#E5E7EB] dark:bg-[#1E2532] rounded-[4px] px-2.5 py-1.5 text-[11px] text-[#111319] dark:text-slate-200 flex flex-wrap items-center gap-1.5 w-fit">
                      <span className="font-semibold">if</span>
                      <span className="px-2 py-0.5 rounded-full bg-white/80 dark:bg-[#151820] border border-slate-300 dark:border-white/15">
                        Evaluate Profit And Loss Limits with: lastProfit Contract Details:{' '}
                        <strong>profit</strong>
                      </span>
                      <span className="font-semibold">then</span>
                    </div>
                    <div className="pl-2">
                      <span className="inline-block bg-[#E5E7EB] dark:bg-[#1E2532] rounded-[4px] px-3 py-1.5 text-[11px] font-semibold text-[#111319] dark:text-slate-200">
                        Trade again
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </form>
          </div>
        )}

        {/* EXPANDED RUN SUMMARY / TRANSACTIONS / JOURNAL DRAWER (Screenshots 152525 - 152731) */}
        {telemetryOpen && botView !== 'dashboard' && (
          <section className="absolute inset-0 z-25 bg-white dark:bg-[#151820] flex flex-col">
            {/* Drawer Header Bar: centered down chevron + Reset button */}
            <div className="relative h-10 shrink-0 px-3 border-b border-slate-200/80 dark:border-white/[0.08] flex items-center justify-center bg-[#F9FAFB] dark:bg-[#181C25]">
              <button
                type="button"
                onClick={() => setTelemetryOpen(false)}
                aria-label="Collapse run summary"
                className="p-1.5 cursor-pointer text-[#374151] dark:text-slate-200"
              >
                <ChevronDown className="w-5 h-5" />
              </button>
              <button
                type="button"
                disabled={Boolean(telemetry?.running)}
                onClick={handleResetSummaryStats}
                className="absolute right-3 px-3 py-1 rounded-[4px] border border-slate-200 dark:border-white/15 bg-white dark:bg-[#111319] text-[12px] font-bold text-[#6B7280] dark:text-slate-300 disabled:opacity-45 cursor-pointer"
              >
                Reset
              </button>
            </div>

            {/* 3 Tabs: Summary | Transactions | Journal */}
            <div className="grid grid-cols-3 border-b border-slate-200 dark:border-white/[0.08] shrink-0 text-[13px]">
              {(['summary', 'transactions', 'journal'] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setTelemetryTab(tab)}
                  className={`py-2.5 font-semibold capitalize border-b-2 transition-colors cursor-pointer ${
                    telemetryTab === tab
                      ? 'border-[#FF444F] text-[#111319] dark:text-white font-bold'
                      : 'border-transparent text-[#6B7280] dark:text-slate-400'
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>

            {/* Tab Content */}
            <div className="flex-1 overflow-y-auto">
              {/* SUMMARY TAB (Screenshots 152631, 152655) */}
              {telemetryTab === 'summary' && (
                <div className="p-3.5 space-y-4">
                  {latestBotOrder ? (
                    <>
                      <div
                        className={`rounded-xl overflow-hidden border border-slate-200/80 dark:border-white/10 shadow-xs bg-white dark:bg-[#181C25]`}
                      >
                        <div
                          className={`px-3.5 py-2.5 flex items-center justify-between bg-gradient-to-b ${
                            (latestMetrics?.pnl ?? 0) >= 0
                              ? 'from-[#00A878]/10 to-transparent'
                              : 'from-[#FF444F]/10 to-transparent'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <SynthCandleBadge num={getSymbolBadgeNum(latestBotOrder.symbol)} />
                            <span className="text-[12px] font-bold text-[#111319] dark:text-white">
                              {instruments.find((i) => i.symbol === latestBotOrder.symbol)?.display_name ||
                                latestBotOrder.symbol}
                            </span>
                          </div>
                          <span className="inline-flex items-center gap-1.5 text-[12px] font-bold text-[#111319] dark:text-white">
                            <Sparkles className="w-3.5 h-3.5 text-[#FF444F]" />
                            {getContractDisplayLabel(latestBotOrder.contract_type)}
                          </span>
                        </div>

                        <div className="px-3.5 pb-3.5 pt-2 space-y-2.5 text-[11px]">
                          <span className="inline-block px-2 py-0.5 rounded bg-[#7BB3B8] text-white font-bold text-[10px]">
                            USD
                          </span>

                          <div className="grid grid-cols-3 gap-2 items-center">
                            <div>
                              <p className="text-[#6B7280] dark:text-slate-400">Total profit/loss:</p>
                              <p
                                className={`font-mono-num font-bold text-[12px] mt-0.5 ${
                                  (latestMetrics?.pnl ?? 0) >= 0 ? 'text-[#2A9D8F]' : 'text-[#FF444F]'
                                }`}
                              >
                                {(latestMetrics?.pnl ?? 0) >= 0 ? '+' : ''}
                                {(latestMetrics?.pnl ?? 0).toFixed(2)}{' '}
                                {(latestMetrics?.pnl ?? 0) >= 0 ? '▲' : '▼'}
                              </p>
                            </div>
                            <div>
                              <p className="text-[#6B7280] dark:text-slate-400">Contract value:</p>
                              <p
                                className={`font-mono-num font-bold text-[12px] mt-0.5 ${
                                  (latestMetrics?.pnl ?? 0) >= 0 ? 'text-[#2A9D8F]' : 'text-[#FF444F]'
                                }`}
                              >
                                {(latestMetrics?.pnl ?? 0) > 0
                                  ? (Number(latestBotOrder.stake) + (latestMetrics?.pnl ?? 0)).toFixed(2)
                                  : '0.00'}{' '}
                                {(latestMetrics?.pnl ?? 0) > 0 ? '▲' : '▼'}
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="text-[#6B7280] dark:text-slate-400">
                                Tick {latestBotOrder.duration || 1}
                              </p>
                              <span className="inline-block w-2 h-2 rounded-full bg-[#7BB3B8] mt-1" />
                            </div>
                          </div>

                          <div className="grid grid-cols-3 gap-2 pt-1">
                            <div>
                              <p className="text-[#6B7280] dark:text-slate-400">Stake:</p>
                              <p className="font-mono-num font-bold text-[12px]">
                                {Number(latestBotOrder.stake || 0).toFixed(2)}
                              </p>
                            </div>
                            <div>
                              <p className="text-[#6B7280] dark:text-slate-400">Potential payout:</p>
                              <p className="font-mono-num font-bold text-[12px]">
                                {(
                                  Number(latestBotOrder.payout || 0) ||
                                  Number(latestBotOrder.stake || 0) * 1.95
                                ).toFixed(2)}
                              </p>
                            </div>
                            <div />
                          </div>
                        </div>
                      </div>
                      <p className="text-center text-[11px] text-[#6B7280] dark:text-slate-400">
                        Resale not offered
                      </p>
                    </>
                  ) : (
                    <div className="py-12 text-center space-y-2">
                      <p className="text-[13px] font-semibold text-[#525866] dark:text-slate-300">
                        No open or recent contract summary yet
                      </p>
                      <p className="text-[11px] text-[#8E95A2]">
                        Tap Run below to start live {accountMode.toUpperCase()} execution.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* TRANSACTIONS TAB (Screenshots 152544, 152613, 152615) */}
              {telemetryTab === 'transactions' && (
                <div>
                  <div className="p-3 flex items-center gap-2 border-b border-slate-100 dark:border-white/[0.06]">
                    <button
                      type="button"
                      disabled={botOrders.length === 0}
                      onClick={handleDownloadTransactions}
                      className="px-4 py-1.5 rounded-[4px] border border-slate-300 dark:border-white/20 text-[12px] font-bold text-[#374151] dark:text-slate-200 disabled:opacity-45 cursor-pointer"
                    >
                      Download
                    </button>
                    <button
                      type="button"
                      disabled={botOrders.length === 0}
                      onClick={() => setTxDetailOpen(true)}
                      className="px-4 py-1.5 rounded-[4px] border border-slate-400 dark:border-white/25 text-[12px] font-bold text-[#111319] dark:text-white disabled:opacity-45 cursor-pointer"
                    >
                      View Detail
                    </button>
                  </div>

                  <div className="grid grid-cols-3 px-4 py-2.5 text-[11px] font-bold text-[#374151] dark:text-slate-300 border-b border-slate-100 dark:border-white/[0.06]">
                    <span>Type</span>
                    <span className="text-center">Entry/Exit spot</span>
                    <span className="text-right">Buy price and P/L</span>
                  </div>

                  {runState === 'buying' && botOrders.length === 0 && (
                    <div className="px-4 py-3 flex items-center justify-between border-b border-slate-100 dark:border-white/[0.06] animate-pulse">
                      <div className="flex gap-2">
                        <span className="w-5 h-5 rounded bg-slate-200 dark:bg-white/10" />
                        <span className="w-5 h-5 rounded bg-slate-200 dark:bg-white/10" />
                      </div>
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full border-2 border-[#FF444F]" />
                          <span className="w-16 h-2.5 rounded bg-slate-200 dark:bg-white/10" />
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full border-2 border-slate-400" />
                          <span className="w-16 h-2.5 rounded bg-slate-200 dark:bg-white/10" />
                        </div>
                      </div>
                      <div className="space-y-1.5 flex flex-col items-end">
                        <span className="w-14 h-2.5 rounded bg-slate-200 dark:bg-white/10" />
                        <span className="w-14 h-2.5 rounded bg-slate-200 dark:bg-white/10" />
                      </div>
                    </div>
                  )}

                  <div className="divide-y divide-slate-100 dark:divide-white/[0.06]">
                    {botOrders.slice(0, 40).map((o) => {
                      const live = computeLiveOrderMetrics(o, ticks);
                      const win = live.pnl >= 0;
                      const exitVal = Number(o.exit_price ?? live.currentPrice ?? o.entry_price);
                      return (
                        <div key={o.id} className="grid grid-cols-3 items-center px-4 py-2.5 text-[11px]">
                          <div className="flex items-center gap-2">
                            <SynthCandleBadge num={getSymbolBadgeNum(o.symbol)} />
                            <Sparkles className="w-3.5 h-3.5 text-[#FF444F]" />
                          </div>

                          <div className="flex flex-col items-center font-mono-num tabular-nums space-y-0.5">
                            <div className="flex items-center gap-2">
                              <span className="w-2.5 h-2.5 rounded-full border-2 border-[#FF444F] shrink-0" />
                              <span>{Number(o.entry_price || 0).toFixed(2)}</span>
                            </div>
                            <div className="flex items-center gap-2 text-[#525866] dark:text-slate-400">
                              <span className="w-2.5 h-2.5 rounded-full border-2 border-[#9CA3AF] shrink-0" />
                              <span>{exitVal.toFixed(2)}</span>
                            </div>
                          </div>

                          <div className="text-right font-mono-num tabular-nums space-y-0.5">
                            <p className="text-[#525866] dark:text-slate-300">
                              {Number(o.stake || 0).toFixed(2)} USD
                            </p>
                            <p className={`font-semibold ${win ? 'text-[#2A9D8F]' : 'text-[#FF444F]'}`}>
                              {win ? '+' : ''}
                              {live.pnl.toFixed(2)} USD
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* JOURNAL TAB (Screenshots 152525, 152731) */}
              {telemetryTab === 'journal' && (
                <div>
                  <div className="p-3 flex items-center justify-between border-b border-slate-100 dark:border-white/[0.06] relative">
                    <button
                      type="button"
                      onClick={handleDownloadJournal}
                      className="px-4 py-1.5 rounded-[4px] border border-slate-300 dark:border-white/20 text-[12px] font-bold text-[#111319] dark:text-white cursor-pointer"
                    >
                      Download
                    </button>

                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setFilterMenuOpen((v) => !v)}
                        className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-[#111319] dark:text-white cursor-pointer"
                      >
                        Filters <SlidersHorizontal className="w-3.5 h-3.5" />
                      </button>
                      {filterMenuOpen && (
                        <div className="absolute right-0 top-7 z-40 w-36 bg-white dark:bg-[#1E222B] border border-slate-200 dark:border-white/10 rounded-xl shadow-lg py-1 text-xs">
                          {(
                            [
                              { id: 'all', label: 'All entries' },
                              { id: 'bought', label: 'Bought / Stake' },
                              { id: 'profit', label: 'Profit / Loss' },
                              { id: 'error', label: 'Errors only' },
                            ] as const
                          ).map((f) => (
                            <button
                              key={f.id}
                              type="button"
                              onClick={() => {
                                setJournalFilter(f.id);
                                setFilterMenuOpen(false);
                              }}
                              className={`w-full px-3 py-2 text-left hover:bg-[#F4F5F7] dark:hover:bg-white/5 cursor-pointer ${
                                journalFilter === f.id ? 'font-bold text-[#FF444F]' : ''
                              }`}
                            >
                              {f.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  <div>
                    {journalEntries.map((entry, idx) => {
                      const stripeBg = idx % 2 === 1 ? 'bg-[#F4F5F7]/75 dark:bg-[#181C25]' : 'bg-white dark:bg-[#151820]';
                      const colonIdx = entry.text.indexOf(':');
                      const prefix = colonIdx > 0 ? entry.text.slice(0, colonIdx + 1) : '';
                      const rest = colonIdx > 0 ? entry.text.slice(colonIdx + 1) : entry.text;
                      const prefixColor =
                        entry.type === 'error'
                          ? 'text-[#FF444F]'
                          : entry.type === 'profit'
                            ? 'text-[#2A9D8F]'
                            : entry.type === 'bought' || entry.type === 'stake'
                              ? 'text-[#2563EB] dark:text-[#60A5FA]'
                              : entry.type === 'loss'
                                ? 'text-[#374151] dark:text-slate-200'
                                : 'text-[#111319] dark:text-white';

                      return (
                        <div key={entry.id} className={`px-3.5 py-2.5 ${stripeBg}`}>
                          <p className="text-[12px] leading-snug break-words">
                            {entry.type === 'error' ? (
                              <span className="text-[#FF444F]">{entry.text}</span>
                            ) : prefix ? (
                              <>
                                <span className={`${prefixColor} font-medium`}>{prefix}</span>
                                <span
                                  className={
                                    entry.type === 'loss'
                                      ? 'text-[#FF444F] font-medium'
                                      : entry.type === 'profit'
                                        ? 'text-[#2A9D8F] font-medium'
                                        : entry.type === 'stake'
                                          ? 'text-[#2563EB] dark:text-[#60A5FA]'
                                          : 'text-[#111319] dark:text-slate-200'
                                  }
                                >
                                  {rest}
                                </span>
                              </>
                            ) : (
                              <span className="text-[#111319] dark:text-slate-200">{entry.text}</span>
                            )}
                          </p>
                          <p className="text-[10px] text-[#8E95A2] mt-1 font-mono-num">
                            {formatJournalTime(entry.time)}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Pinned 2x3 Session Totals Footer inside Drawer (Screenshots 152613, 152655) */}
            <div className="shrink-0 bg-white dark:bg-[#151820] border-t border-slate-200 dark:border-white/[0.08] px-4 py-3 grid grid-cols-3 gap-y-3 text-center text-[11px]">
              <div>
                <p className="font-bold text-[#374151] dark:text-slate-300">Total stake</p>
                <p className="font-mono-num mt-0.5 text-[#111319] dark:text-white">
                  {totalStake.toFixed(2)} USD
                </p>
              </div>
              <div>
                <p className="font-bold text-[#374151] dark:text-slate-300">Total payout</p>
                <p className="font-mono-num mt-0.5 text-[#111319] dark:text-white">
                  {totalPayout.toFixed(2)} USD
                </p>
              </div>
              <div>
                <p className="text-[10px] underline decoration-dotted text-[#6B7280] dark:text-slate-400">
                  What&apos;s this?
                </p>
                <p className="font-bold text-[#374151] dark:text-slate-300">No. of runs</p>
                <p className="font-mono-num mt-0.5 text-[#111319] dark:text-white">{totalRuns}</p>
              </div>

              <div>
                <p className="font-bold text-[#374151] dark:text-slate-300">Contracts lost</p>
                <p className="font-mono-num mt-0.5 text-[#111319] dark:text-white">{contractsLost}</p>
              </div>
              <div>
                <p className="font-bold text-[#374151] dark:text-slate-300">Contracts won</p>
                <p className="font-mono-num mt-0.5 text-[#111319] dark:text-white">{contractsWon}</p>
              </div>
              <div>
                <p className="font-bold text-[#374151] dark:text-slate-300">Total profit/loss</p>
                <p
                  className={`font-mono-num font-bold mt-0.5 ${
                    totalProfitLoss > 0
                      ? 'text-[#2A9D8F]'
                      : totalProfitLoss < 0
                        ? 'text-[#FF444F]'
                        : 'text-[#111319] dark:text-white'
                  }`}
                >
                  {totalProfitLoss > 0 ? '+' : ''}
                  {totalProfitLoss.toFixed(2)} USD
                </p>
              </div>
            </div>
          </section>
        )}

        {/* TRANSACTIONS DETAILED SUMMARY MODAL VIEW (Screenshot 152706) */}
        {txDetailOpen && (
          <div className="absolute inset-0 z-35 bg-white dark:bg-[#151820] flex flex-col">
            <div className="h-12 shrink-0 px-4 border-b border-slate-200 dark:border-white/[0.08] flex items-center justify-between">
              <h3 className="text-[14px] font-bold text-[#111319] dark:text-white">
                Transactions detailed summary
              </h3>
              <button
                type="button"
                onClick={() => setTxDetailOpen(false)}
                className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-white/10 cursor-pointer"
                aria-label="Close detailed summary"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-3.5 space-y-3 bg-[#F8F9FA] dark:bg-[#0F1115]">
              {botOrders.map((o) => {
                const live = computeLiveOrderMetrics(o, ticks);
                const win = live.pnl >= 0;
                const refId = o.deriv_contract_id || `4150${String(o.id).padStart(6, '0')}`;
                const exitVal = Number(o.exit_price ?? live.currentPrice ?? o.entry_price);
                return (
                  <div
                    key={o.id}
                    className="bg-white dark:bg-[#181C25] rounded-xl border border-slate-200/80 dark:border-white/[0.08] p-4 space-y-3 text-[12px]"
                  >
                    <div className="flex items-center gap-2.5">
                      <SynthCandleBadge num={getSymbolBadgeNum(o.symbol)} />
                      <Sparkles className="w-4 h-4 text-[#FF444F]" />
                    </div>
                    <div>
                      <p className="font-bold text-[#111319] dark:text-white text-[11px]">Ref. ID</p>
                      <p className="font-mono-num text-[#525866] dark:text-slate-300 mt-0.5">{refId}</p>
                    </div>
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="font-bold text-[#111319] dark:text-white text-[11px]">Timestamp</p>
                        <p className="text-[#525866] dark:text-slate-300 mt-0.5 font-mono-num">
                          {formatGmtStamp(o.opened_at)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-[#111319] dark:text-white text-[11px]">Entry Spot</p>
                        <p className="font-mono-num text-[#525866] dark:text-slate-300 mt-0.5">
                          {Number(o.entry_price || 0).toFixed(2)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="font-bold text-[#111319] dark:text-white text-[11px]">Buy Price</p>
                        <p className="font-mono-num text-[#525866] dark:text-slate-300 mt-0.5">
                          {Number(o.stake || 0).toFixed(2)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-[#111319] dark:text-white text-[11px]">Exit Spot</p>
                        <p className="font-mono-num text-[#525866] dark:text-slate-300 mt-0.5">
                          {exitVal.toFixed(2)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-white/[0.06]">
                      <span className="font-bold text-[#111319] dark:text-white text-[11px]">Profit / Loss</span>
                      <span className={`font-mono-num font-bold ${win ? 'text-[#2A9D8F]' : 'text-[#FF444F]'}`}>
                        {win ? '+' : ''}
                        {live.pnl.toFixed(2)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* LOAD STRATEGY SHEET / MODAL (Screenshots 152508 & 152544) */}
        {loadModalOpen && (
          <div className="absolute inset-0 z-35 bg-white dark:bg-[#151820] flex flex-col">
            <div className="h-12 shrink-0 px-4 border-b border-slate-200 dark:border-white/[0.08] flex items-center justify-between">
              <h3 className="text-[15px] font-bold text-[#111319] dark:text-white">Load strategy</h3>
              <button
                type="button"
                onClick={() => {
                  setPendingXmlImport(null);
                  setLoadModalOpen(false);
                }}
                className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-white/10 cursor-pointer"
                aria-label="Close Load Strategy"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 border-b border-slate-200 dark:border-white/[0.08] text-[13px] shrink-0">
              <button
                type="button"
                onClick={() => setLoadModalTab('local')}
                className={`py-2.5 border-b-2 cursor-pointer ${
                  loadModalTab === 'local'
                    ? 'border-[#FF444F] font-bold text-[#111319] dark:text-white'
                    : 'border-transparent text-[#6B7280]'
                }`}
              >
                Local
              </button>
              <button
                type="button"
                onClick={() => setLoadModalTab('drive')}
                className={`py-2.5 border-b-2 cursor-pointer ${
                  loadModalTab === 'drive'
                    ? 'border-[#FF444F] font-bold text-[#111319] dark:text-white'
                    : 'border-transparent text-[#6B7280]'
                }`}
              >
                Google Drive
              </button>
            </div>

            <input ref={fileRef} type="file" accept=".xml" onChange={handleImportXmlFile} className="hidden" />

            <div className="flex-1 overflow-y-auto p-3.5 flex flex-col gap-3">
              {/* Warm amber notice matching Screenshot 152508 */}
              <div className="rounded-md bg-[#FFF9E6] dark:bg-amber-500/10 border border-[#FDE68A] dark:border-amber-500/30 px-3 py-2.5 flex items-start gap-2.5 text-[12px] text-[#374151] dark:text-amber-100">
                <Info className="w-4 h-4 text-[#D99B26] shrink-0 mt-0.5" />
                <span>Importing XML files from Binary Bot and other third-party platforms may take longer.</span>
              </div>

              {loadModalTab === 'local' ? (
                pendingXmlImport ? (
                  <div className="flex-1 flex flex-col justify-between gap-4">
                    <div className="rounded-xl border border-slate-200 dark:border-white/10 p-4 bg-[#F8F9FA] dark:bg-[#181C25] space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-sm">{pendingXmlImport.fileName}</span>
                        <span className="px-2 py-0.5 rounded bg-[#00A878]/15 text-[#00A878] text-[11px] font-bold">
                          Ready
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div>
                          <span className="text-slate-500">Market:</span>{' '}
                          <strong>{pendingXmlImport.symbol || symbol}</strong>
                        </div>
                        <div>
                          <span className="text-slate-500">Contract:</span>{' '}
                          <strong>{pendingXmlImport.contractType || contractType}</strong>
                        </div>
                        <div>
                          <span className="text-slate-500">Stake:</span>{' '}
                          <strong>${pendingXmlImport.stake || baseStake}</strong>
                        </div>
                        <div>
                          <span className="text-slate-500">Duration:</span>{' '}
                          <strong>{pendingXmlImport.duration || duration} ticks</strong>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3 pt-2">
                      <button
                        type="button"
                        onClick={() => setPendingXmlImport(null)}
                        className="py-2.5 rounded-[4px] border border-[#111319] dark:border-white/30 text-[13px] font-bold cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={confirmOpenPendingXml}
                        className="py-2.5 rounded-[4px] bg-[#FF444F] hover:bg-[#E63946] text-white text-[13px] font-bold cursor-pointer"
                      >
                        Open
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex-1 border-2 border-dashed border-slate-300 dark:border-white/15 rounded-lg flex flex-col items-center justify-center p-6 gap-5">
                    <svg viewBox="0 0 48 64" className="w-12 h-16" aria-hidden="true">
                      <rect x="6" y="4" width="36" height="56" rx="6" fill="#0F4C6C" stroke="#7BB3B8" strokeWidth="2.5" />
                      <circle cx="24" cy="52" r="2.6" fill="#E2E8F0" />
                    </svg>
                    <button
                      type="button"
                      onClick={() => fileRef.current?.click()}
                      className="px-5 py-2.5 rounded-[4px] bg-[#FF444F] hover:bg-[#E63946] text-white text-[13px] font-bold cursor-pointer"
                    >
                      Select an XML file from your device
                    </button>
                  </div>
                )
              ) : (
                <div className="flex-1 border-2 border-dashed border-slate-300 dark:border-white/15 rounded-lg flex flex-col items-center justify-center p-6 text-center gap-4">
                  <p className="text-[13px] text-[#525866] dark:text-slate-300 max-w-xs">
                    Import saved strategies from your device storage or browse Prebuilt Bots Lab templates.
                  </p>
                  <div className="flex flex-wrap items-center justify-center gap-2.5">
                    <button
                      type="button"
                      onClick={() => fileRef.current?.click()}
                      className="px-4 py-2 rounded-[4px] bg-[#FF444F] text-white text-xs font-bold cursor-pointer"
                    >
                      Select XML from device
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setLoadModalOpen(false);
                        setActiveTab('trading-bots');
                      }}
                      className="px-4 py-2 rounded-[4px] border border-slate-300 dark:border-white/20 text-xs font-bold cursor-pointer"
                    >
                      Open Prebuilt Bots
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* 3. DRAWER HANDLE + STICKY RUN / STOP PROGRESS BAR (Screenshots 152359, 152544, 152613, 152655) */}
      <div className="shrink-0 bg-white dark:bg-[#151820] border-t border-slate-200 dark:border-white/[0.08] z-30">
        {botView !== 'dashboard' && !telemetryOpen && (
          <button
            type="button"
            onClick={() => setTelemetryOpen(true)}
            aria-label="Open bot run summary"
            className="w-full h-7 flex items-center justify-center border-b border-slate-100 dark:border-white/[0.06] text-[#374151] dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5 cursor-pointer"
          >
            <ChevronUp className="w-4 h-4" />
          </button>
        )}

        <div className="px-3 py-2 flex items-center gap-2">
          {!telemetry?.running ? (
            <button
              type="button"
              disabled={submitting}
              onClick={() => handleRunBot()}
              className="px-4 py-2.5 rounded-[4px] bg-[#2A9D8F] hover:bg-[#23867A] text-white font-bold text-[13px] flex items-center gap-1.5 cursor-pointer shrink-0 disabled:opacity-50"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              {submitting ? 'Starting' : 'Run'}
            </button>
          ) : (
            <button
              type="button"
              onClick={handleStopBot}
              className="px-4 py-2.5 rounded-[4px] bg-[#FF444F] hover:bg-[#E63946] text-white font-bold text-[13px] flex items-center gap-1.5 cursor-pointer shrink-0"
            >
              <Square className="w-3.5 h-3.5 fill-current" />
              Stop
            </button>
          )}

          {/* Status & Progress Bar matching 152544 (Buying contract), 152613 (Won), 152655 (Lost) */}
          <button
            type="button"
            onClick={() => botView !== 'dashboard' && setTelemetryOpen((v) => !v)}
            className={`flex-1 h-[40px] rounded-[4px] border px-3 flex flex-col justify-center cursor-pointer overflow-hidden ${
              runState === 'won'
                ? 'bg-[#00A878]/10 border-[#00A878]/30'
                : runState === 'lost'
                  ? 'bg-[#FF444F]/10 border-[#FF444F]/30'
                  : 'bg-[#F9FAFB] dark:bg-[#111319] border-slate-200 dark:border-white/[0.08]'
            }`}
          >
            <div className="flex items-center justify-center gap-1.5 text-[12px] font-bold">
              {runState === 'won' ? (
                <span className="text-[#2A9D8F] inline-flex items-center gap-1">
                  Won <CheckCircle2 className="w-3.5 h-3.5" />
                </span>
              ) : runState === 'lost' ? (
                <span className="text-[#FF444F] inline-flex items-center gap-1">
                  Lost <XCircle className="w-3.5 h-3.5" />
                </span>
              ) : runState === 'bought' ? (
                <span className="text-[#111319] dark:text-white">Contract bought</span>
              ) : runState === 'buying' ? (
                <span className="text-[#111319] dark:text-white">Buying contract</span>
              ) : (
                <span className="text-[#374151] dark:text-slate-300">Bot is not running</span>
              )}
            </div>

            {/* Progress bar + 3-node timeline track */}
            <div className="relative w-full h-[3px] bg-slate-200 dark:bg-white/10 rounded-full mt-1.5">
              <div
                className={`h-full rounded-full transition-all duration-300 ${
                  runState === 'bought' || runState === 'won'
                    ? 'bg-[#2A9D8F] w-full'
                    : runState === 'buying'
                      ? 'bg-[#FF444F] w-1/3'
                      : runState === 'lost'
                        ? 'bg-[#FF444F] w-full'
                        : 'w-0'
                }`}
              />
              <span
                className={`absolute left-0 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full ${
                  telemetry?.running ? 'bg-[#FF444F]/60' : 'bg-slate-400'
                }`}
              />
              <span
                className={`absolute left-1/2 -translate-x-1/2 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full ${
                  runState === 'bought' || runState === 'won' ? 'bg-[#2A9D8F]' : 'bg-slate-300'
                }`}
              />
              <span
                className={`absolute right-0 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full ${
                  runState === 'won' ? 'bg-[#2A9D8F]' : 'bg-slate-300'
                }`}
              />
            </div>
          </button>
        </div>

        {/* 4. DERIV BOT BOTTOM 5-TAB BAR (Home | Dashboard | Bot builder | Chart | Menu) */}
        <nav className="grid grid-cols-5 h-[56px] border-t border-slate-200/80 dark:border-white/[0.08] bg-white dark:bg-[#151820] pb-safe">
          <button
            type="button"
            onClick={() => setActiveTab('options')}
            className="flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium text-[#525866] dark:text-[#9BA3B0] cursor-pointer"
          >
            <Home className="w-[18px] h-[18px]" />
            <span>Home</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setTelemetryOpen(false);
              setBotView('dashboard');
            }}
            className={`flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium cursor-pointer ${
              botView === 'dashboard' ? 'text-[#FF444F]' : 'text-[#525866] dark:text-[#9BA3B0]'
            }`}
          >
            <LayoutGrid className="w-[18px] h-[18px]" />
            <span>Dashboard</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setTelemetryOpen(false);
              setBotView('builder');
            }}
            className={`flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium cursor-pointer ${
              botView === 'builder' ? 'text-[#FF444F]' : 'text-[#525866] dark:text-[#9BA3B0]'
            }`}
          >
            <Sparkles className="w-[18px] h-[18px]" />
            <span>Bot builder</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setTelemetryOpen(false);
              setBotView('chart');
            }}
            className={`flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium cursor-pointer ${
              botView === 'chart' ? 'text-[#FF444F]' : 'text-[#525866] dark:text-[#9BA3B0]'
            }`}
          >
            <LineChart className="w-[18px] h-[18px]" />
            <span>Chart</span>
          </button>

          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            className={`flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium cursor-pointer ${
              menuOpen ? 'text-[#FF444F]' : 'text-[#525866] dark:text-[#9BA3B0]'
            }`}
          >
            <MenuIcon className="w-[18px] h-[18px]" />
            <span>Menu</span>
          </button>
        </nav>
      </div>

      {/* ACCOUNT SWITCHER BOTTOM SHEET (Screenshot 152404) */}
      {accountSheetOpen && (
        <div
          onClick={() => setAccountSheetOpen(false)}
          className="fixed inset-0 z-50 bg-black/45 flex items-end justify-center"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg bg-white dark:bg-[#181C25] rounded-t-[20px] p-4 pb-7 space-y-2.5 shadow-2xl"
          >
            <div className="w-10 h-1 rounded-full bg-slate-300 dark:bg-white/20 mx-auto mb-2" />
            {(
              [
                {
                  mode: 'demo' as const,
                  label: 'Demo account',
                  labelColor: 'text-[#E5A93B]',
                  bal: getCanonicalBalances(user, accounts, 'demo', null).optionsBal,
                },
                {
                  mode: 'real' as const,
                  label: 'Real account',
                  labelColor: 'text-[#2A9D8F]',
                  bal: getCanonicalBalances(user, accounts, 'real', activeConnectedAccount).optionsBal,
                },
              ] as const
            ).map((opt) => {
              const selected = accountMode === opt.mode;
              return (
                <button
                  key={opt.mode}
                  type="button"
                  onClick={() => handleSwitchAccount(opt.mode)}
                  className={`w-full px-4 py-3.5 rounded-xl flex items-center justify-between text-left cursor-pointer ${
                    selected ? 'bg-[#F4F5F7] dark:bg-white/10' : 'hover:bg-[#F8F9FA] dark:hover:bg-white/5'
                  }`}
                >
                  <div>
                    <p className={`text-[13px] font-medium ${opt.labelColor}`}>{opt.label}</p>
                    <p className="font-mono-num text-[15px] font-bold text-[#111319] dark:text-white mt-0.5">
                      {hideBalances
                        ? '*****'
                        : `${opt.bal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD`}
                    </p>
                  </div>
                  {selected && <Check className="w-4 h-4 text-[#00A878]" />}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* FULLSCREEN MENU OVERLAY (Screenshot 152813) */}
      {menuOpen && (
        <div className="fixed inset-0 z-[80] bg-white dark:bg-[#0F1115] flex flex-col">
          <div className="px-4 pt-4 pb-2 flex items-center justify-end">
            <button
              type="button"
              onClick={() => setMenuOpen(false)}
              className="w-8 h-8 rounded-full bg-[#F4F5F7] dark:bg-white/10 flex items-center justify-center cursor-pointer"
              aria-label="Close menu"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-5 py-2 space-y-6 text-[14px]">
            <div>
              <h3 className="font-bold text-[15px] text-[#111319] dark:text-white mb-2">Guide</h3>
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  setActiveTab('learning-hub');
                }}
                className="w-full py-3.5 flex items-center justify-between border-b border-slate-100 dark:border-white/[0.06] cursor-pointer"
              >
                <span className="inline-flex items-center gap-3 text-[#374151] dark:text-slate-200">
                  <BookOpen className="w-4 h-4" /> Tutorials
                </span>
                <ChevronRight className="w-4 h-4 text-[#8E95A2]" />
              </button>
            </div>

            <div>
              <h3 className="font-bold text-[15px] text-[#111319] dark:text-white mb-2">Reports</h3>
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  setActiveTab('portfolio');
                }}
                className="w-full py-3.5 flex items-center justify-between border-b border-slate-100 dark:border-white/[0.06] cursor-pointer"
              >
                <span className="inline-flex items-center gap-3 text-[#374151] dark:text-slate-200">
                  <Clock className="w-4 h-4" /> Open positions
                </span>
                <ChevronRight className="w-4 h-4 text-[#8E95A2]" />
              </button>
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  setActiveTab('reports');
                }}
                className="w-full py-3.5 flex items-center justify-between border-b border-slate-100 dark:border-white/[0.06] cursor-pointer"
              >
                <span className="inline-flex items-center gap-3 text-[#374151] dark:text-slate-200">
                  <FileText className="w-4 h-4" /> Trade table
                </span>
                <ChevronRight className="w-4 h-4 text-[#8E95A2]" />
              </button>
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  setActiveTab('reports');
                }}
                className="w-full py-3.5 flex items-center justify-between border-b border-slate-100 dark:border-white/[0.06] cursor-pointer"
              >
                <span className="inline-flex items-center gap-3 text-[#374151] dark:text-slate-200">
                  <FileText className="w-4 h-4" /> Statement
                </span>
                <ChevronRight className="w-4 h-4 text-[#8E95A2]" />
              </button>
            </div>

            <div>
              <h3 className="font-bold text-[15px] text-[#111319] dark:text-white mb-2">Settings</h3>
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  setActiveTab('profile');
                }}
                className="w-full py-3.5 flex items-center justify-between border-b border-slate-100 dark:border-white/[0.06] cursor-pointer"
              >
                <span className="inline-flex items-center gap-3 text-[#374151] dark:text-slate-200">
                  <Globe className="w-4 h-4" /> Language
                </span>
                <ChevronRight className="w-4 h-4 text-[#8E95A2]" />
              </button>

              <div className="w-full py-3.5 flex items-center justify-between border-b border-slate-100 dark:border-white/[0.06]">
                <span className="inline-flex items-center gap-3 text-[#374151] dark:text-slate-200">
                  <Moon className="w-4 h-4" /> Dark theme
                </span>
                <button
                  type="button"
                  onClick={toggleTheme}
                  aria-label="Toggle dark theme"
                  className={`w-11 h-6 rounded-full p-0.5 transition-colors flex items-center cursor-pointer ${
                    theme === 'dark' ? 'bg-[#00A878] justify-end' : 'bg-slate-300 justify-start'
                  }`}
                >
                  <span className="w-5 h-5 rounded-full bg-white shadow-xs" />
                </button>
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                logout();
              }}
              className="py-3 inline-flex items-center gap-3 text-[#FF444F] font-medium cursor-pointer"
            >
              <LogOut className="w-4 h-4" /> Log out
            </button>
          </div>

          <div className="shrink-0 h-11 px-4 border-t border-slate-200 dark:border-white/[0.08] flex items-center justify-center gap-2 text-[12px] text-[#525866] dark:text-slate-400 font-mono-num">
            <span>{utcNow}</span>
            <span className="w-2.5 h-2.5 rounded-full bg-[#2A9D8F]" />
          </div>
        </div>
      )}

      {/* 2-STEP QUICK STRATEGY MODAL */}
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
                        <p className="text-[11px] text-slate-500">
                          {strat.category} · {strat.desc}
                        </p>
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

      {/* IN-APP DEPOSIT CASHIER SHEET */}
      <DepositSheet open={depositOpen} onClose={() => setDepositOpen(false)} />
    </div>
  );
};
