import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  createChart,
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from 'lightweight-charts';
import {
  BarChart2,
  ArrowLeftRight,
  BookOpen,
  PieChart,
  Settings,
  HelpCircle,
  User,
  ChevronDown,
  Menu,
  X,
  Check,
  TrendingUp,
  Zap,
  Activity,
  Play,
  Square,
  Pause,
  Download,
  ExternalLink,
  RefreshCw,
  Trash2,
  Plus,
  Clock,
  ShieldCheck,
  Shuffle,
  Trophy,
  CircleDollarSign,
  ArrowUp,
  ArrowDown,
  Search,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import {
  apiFetch,
  fetchDerivTickHistoryDirect,
  subscribeDerivTicksDirect,
  sanitizeUiError,
  getStoredToken,
} from '../lib/api';
import { getCanonicalBalances } from '../lib/balances';
import { BotInstrumentIcon, BotContractTypeIcon } from '../components/DerivBadges';
import type { QuantumPrediction, BotTelemetry, BotStrategy, CandleData } from '../types';

type QuantumNavTab = 'analysis' | 'transactions' | 'journal' | 'summary' | 'settings' | 'about';
type AnalysisMode = 'auto' | 'digit' | 'directional';
type BotContractChoice = 'AUTO' | 'DIGITMATCH' | 'DIGITDIFF' | 'CALL_PUT' | 'OVER_UNDER';

interface ScanTelemetry {
  dataPoints: number;
  targetDigit: number;
  targetDigitPct: number;
  digitDistribution: Array<{ digit: number; count: number; pct: number }>;
  trend: string;
  momentum: string;
  volatility: string;
  pattern: string;
}

interface JournalRow {
  id: number;
  symbol: string;
  side: string;
  strategy_key?: string;
  timeframe?: string;
  rationale?: string;
  emotions?: string;
  discipline_score?: number;
  lessons?: string;
  created_at: string;
}

interface PerformanceSummary {
  combined?: {
    totalTrades: number;
    openTrades: number;
    wins: number;
    losses: number;
    winRatePct: number;
    netPnlUsd: number;
    unrealizedPnlUsd: number;
    profitFactor: number;
    maxDrawdownUsd: number;
  };
  real?: {
    totalTrades: number;
    winRatePct: number;
    netPnlUsd: number;
  };
  demo?: {
    totalTrades: number;
    winRatePct: number;
    netPnlUsd: number;
  };
  periods?: {
    dailyPnlUsd: number;
    weeklyPnlUsd: number;
    monthlyPnlUsd: number;
  };
  bySymbol?: Array<{ symbol: string; trades: number; wins: number; netPnl: number }>;
}

const QUANTUM_BRIDGE_KEY = 'td_quantum_dbot_bridge';

const DerivChevronMark: React.FC = () => (
  <svg viewBox="0 0 24 24" className="w-5 h-5 shrink-0" fill="none" aria-hidden="true">
    <path d="M5 4L14.5 12L5 20H10.5L20 12L10.5 4H5Z" fill="#FF444F" />
  </svg>
);

const QuantumLogoMark: React.FC = () => (
  <svg viewBox="0 0 40 40" className="w-9 h-9 shrink-0" fill="none" aria-hidden="true">
    <path
      d="M31.5 29.5A14 14 0 1 1 34 20"
      stroke="#FF444F"
      strokeWidth="3.2"
      strokeLinecap="round"
    />
    <rect x="13" y="21" width="3.5" height="10" rx="1.2" fill="#FF444F" />
    <rect x="18.5" y="15" width="3.5" height="16" rx="1.2" fill="#FF444F" />
    <rect x="24" y="10" width="3.5" height="21" rx="1.2" fill="#FF444F" />
    <circle cx="31" cy="27.5" r="2.8" fill="#FF444F" />
  </svg>
);

const DerivBotRobotIcon: React.FC = () => (
  <svg viewBox="0 0 40 40" className="w-8 h-8 shrink-0" fill="none" aria-hidden="true">
    <rect x="18.5" y="3" width="3" height="5" rx="1.5" fill="#FF444F" />
    <circle cx="20" cy="3" r="2" fill="#FF444F" />
    <rect x="7" y="9" width="26" height="20" rx="6" fill="#FF444F" />
    <rect x="10.5" y="13" width="19" height="10.5" rx="3.5" fill="#FFFFFF" />
    <circle cx="15.5" cy="18.2" r="2.1" fill="#12161F" />
    <circle cx="24.5" cy="18.2" r="2.1" fill="#12161F" />
    <path d="M16 26H24" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" />
    <rect x="3.5" y="15.5" width="3" height="7" rx="1.5" fill="#E11D48" />
    <rect x="33.5" y="15.5" width="3" height="7" rx="1.5" fill="#E11D48" />
  </svg>
);

export const AnalysisToolPage: React.FC<{ standalone?: boolean }> = ({ standalone = true }) => {
  const {
    user,
    accounts,
    instruments,
    selectedSymbol,
    setSelectedSymbol,
    accountMode,
    setAccountMode,
    activeConnectedAccount,
    isDbLocked,
    wsConnected,
    orders,
    refreshOrders,
    refreshAll,
    setActiveTab,
    setTradePreset,
    formatMoney,
    logout,
    showToast,
  } = useApp();

  const { optionsBal } = getCanonicalBalances(user, accounts, accountMode, activeConnectedAccount);

  const [navTab, setNavTab] = useState<QuantumNavTab>('analysis');
  const [selectedDigit, setSelectedDigit] = useState<number>(7);
  const [analysisMode, setAnalysisMode] = useState<AnalysisMode>('auto');
  const [tickCount, setTickCount] = useState<number>(100);
  const [quantumStake, setQuantumStake] = useState<string>('1');
  const [autoScanEnabled, setAutoScanEnabled] = useState<boolean>(true);
  const [autoBroadcast, setAutoBroadcast] = useState<boolean>(true);

  // Bot control panel states (wired to real /api/bots/* backend)
  const [botStrategies, setBotStrategies] = useState<BotStrategy[]>([]);
  const [botStrategyName, setBotStrategyName] = useState<string>('Quantum Strategy');
  const [botContractChoice, setBotContractChoice] = useState<BotContractChoice>('AUTO');
  const [botDuration, setBotDuration] = useState<number>(1);
  const [botDurationUnit, setBotDurationUnit] = useState<'t' | 's' | 'm'>('t');
  const [botTakeProfit, setBotTakeProfit] = useState<string>('10');
  const [botStopLoss, setBotStopLoss] = useState<string>('6');
  const [botTelemetry, setBotTelemetry] = useState<BotTelemetry | null>(null);
  const [botBusy, setBotBusy] = useState<boolean>(false);

  const [prices, setPrices] = useState<number[]>([]);
  const [ticksLoading, setTicksLoading] = useState<boolean>(true);
  const [isScanning, setIsScanning] = useState<boolean>(false);

  const [predictions, setPredictions] = useState<QuantumPrediction[]>([]);
  const [activePrediction, setActivePrediction] = useState<QuantumPrediction | null>(null);
  const [scanTelemetry, setScanTelemetry] = useState<ScanTelemetry | null>(null);
  const [detailsOpen, setDetailsOpen] = useState<boolean>(false);
  const [analyzeSnapshot, setAnalyzeSnapshot] = useState<any>(null);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  // Candlestick chart state & refs (lightweight-charts v5)
  const [candles, setCandles] = useState<CandleData[]>([]);
  const [candlesLoading, setCandlesLoading] = useState<boolean>(true);
  const chartContainerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const candleReqIdRef = useRef<number>(0);

  const [profileMenuOpen, setProfileMenuOpen] = useState<boolean>(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState<boolean>(false);

  // Transactions filter
  const [txFilter, setTxFilter] = useState<'ALL' | 'OPEN' | 'CLOSED'>('ALL');
  const [txSearch, setTxSearch] = useState<string>('');

  // Journal & Summary real DB states
  const [journalEntries, setJournalEntries] = useState<JournalRow[]>([]);
  const [journalLoading, setJournalLoading] = useState<boolean>(false);
  const [newJournalText, setNewJournalText] = useState<string>('');
  const [newJournalLessons, setNewJournalLessons] = useState<string>('');
  const [perfData, setPerfData] = useState<PerformanceSummary | null>(null);
  const [perfLoading, setPerfLoading] = useState<boolean>(false);
  const [executingTrade, setExecutingTrade] = useState<boolean>(false);

  const lastAutoKeyRef = useRef<string>('');

  const activeInst = instruments.find((i) => i.symbol === selectedSymbol) || instruments[0];
  const decimals =
    (activeInst?.pip_size ?? 0.01) < 0.0001
      ? 5
      : (activeInst?.pip_size ?? 0.01) < 0.001
        ? 4
        : (activeInst?.pip_size ?? 0.01) < 0.01
          ? 3
          : 2;

  // Subscribe to real Deriv ticks
  useEffect(() => {
    let active = true;
    setTicksLoading(true);
    setPrices([]);
    fetchDerivTickHistoryDirect(selectedSymbol, tickCount, isDbLocked)
      .then((list) => {
        if (active && list.length) {
          setPrices(list);
          setTicksLoading(false);
        }
      })
      .catch(() => {
        if (active) setTicksLoading(false);
      });

    const unsub = subscribeDerivTicksDirect(
      selectedSymbol,
      (quote) => {
        if (!active) return;
        setTicksLoading(false);
        setPrices((prev) => [...prev.slice(-(tickCount - 1)), quote]);
      },
      isDbLocked
    );

    return () => {
      active = false;
      unsub();
    };
  }, [selectedSymbol, tickCount, isDbLocked]);

  // Load real candlesticks for chart
  const loadCandles = useCallback(async () => {
    const rid = ++candleReqIdRef.current;
    try {
      const res = await apiFetch<{ candles: CandleData[] }>(
        `/api/market/candles?symbol=${encodeURIComponent(selectedSymbol)}&granularity=60&count=120&mock=${isDbLocked ? '1' : '0'}&_t=${Date.now()}`,
        { skipAuth: true, cache: 'no-store' }
      );
      if (candleReqIdRef.current !== rid) return;
      if (Array.isArray(res.candles) && res.candles.length > 0) {
        setCandles(res.candles);
      }
    } catch {
      // ignore transient poll failure
    } finally {
      if (candleReqIdRef.current === rid) {
        setCandlesLoading(false);
      }
    }
  }, [selectedSymbol, isDbLocked]);

  useEffect(() => {
    setCandles([]);
    setCandlesLoading(true);
    loadCandles();
    const timer = setInterval(loadCandles, 4000);
    return () => clearInterval(timer);
  }, [loadCandles]);

  // Initialize lightweight-charts CandlestickSeries
  useEffect(() => {
    const el = chartContainerRef.current;
    if (!el || navTab !== 'analysis') return;

    const chart = createChart(el, {
      width: el.clientWidth,
      height: el.clientHeight || 260,
      layout: {
        background: { type: ColorType.Solid, color: '#10141D' },
        textColor: '#94A3B8',
        fontFamily: "'IBM Plex Sans', sans-serif",
      },
      grid: {
        vertLines: { color: '#1B2230' },
        horzLines: { color: '#1B2230' },
      },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: {
        borderColor: '#222938',
        scaleMargins: { top: 0.12, bottom: 0.1 },
      },
      timeScale: {
        borderColor: '#222938',
        timeVisible: true,
        secondsVisible: true,
        rightOffset: 3,
      },
    });

    const series = chart.addSeries(CandlestickSeries, {
      upColor: '#00D084',
      downColor: '#FF444F',
      borderVisible: false,
      wickUpColor: '#00D084',
      wickDownColor: '#FF444F',
      priceFormat: {
        type: 'price',
        precision: decimals,
        minMove: Math.pow(10, -decimals),
      },
    });

    chartRef.current = chart;
    candleSeriesRef.current = series;

    const ro = new ResizeObserver(() => {
      if (chartContainerRef.current) {
        chart.applyOptions({
          width: chartContainerRef.current.clientWidth,
          height: chartContainerRef.current.clientHeight || 260,
        });
      }
    });
    ro.observe(el);

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
    };
  }, [navTab, decimals]);

  useEffect(() => {
    const s = candleSeriesRef.current;
    if (!s) return;
    if (candles.length === 0) {
      s.setData([]);
      return;
    }
    s.setData(
      candles.map((c) => ({
        time: c.time as UTCTimestamp,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      }))
    );
  }, [candles]);

  // Update last candle live on incoming tick
  useEffect(() => {
    const s = candleSeriesRef.current;
    if (!s || prices.length === 0 || candles.length === 0) return;
    const latestPrice = prices[prices.length - 1];
    const lastCandle = candles[candles.length - 1];
    if (!lastCandle || !Number.isFinite(latestPrice)) return;
    const bucket = Math.floor(Date.now() / 1000 / 60) * 60;
    if (bucket > lastCandle.time) {
      s.update({
        time: bucket as UTCTimestamp,
        open: latestPrice,
        high: latestPrice,
        low: latestPrice,
        close: latestPrice,
      });
    } else {
      s.update({
        time: lastCandle.time as UTCTimestamp,
        open: lastCandle.open,
        high: Math.max(lastCandle.high, latestPrice),
        low: Math.min(lastCandle.low, latestPrice),
        close: latestPrice,
      });
    }
  }, [prices, candles]);

  // 1s live countdown ticker for Quantum 120s signals
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const broadcastSignalToDbot = useCallback((pred: QuantumPrediction) => {
    const payload = {
      type: 'QUANTUM_SIGNAL',
      predictionId: pred.prediction_id,
      symbol: pred.instrument,
      contractType: pred.contract_type,
      barrier: pred.barrier,
      stake: Number(pred.stake || 1),
      duration: Number(pred.duration || 1),
      durationUnit: pred.duration_unit || 't',
      probability: Number(pred.probability || 0),
      predictedCondition: pred.predicted_condition,
      expiresAt: pred.expires_at,
      sentAt: Date.now(),
    };
    try {
      localStorage.setItem(QUANTUM_BRIDGE_KEY, JSON.stringify(payload));
      if (typeof BroadcastChannel !== 'undefined') {
        const ch = new BroadcastChannel('td_quantum_dbot_bridge');
        ch.postMessage(payload);
        ch.close();
      }
    } catch {
      // ignore storage/channel errors
    }
  }, []);

  const loadPredictions = useCallback(async () => {
    try {
      const res = await apiFetch<{ predictions: QuantumPrediction[] }>('/api/quantum/predictions');
      const list = res.predictions || [];
      setPredictions(list);
      if (list.length > 0) {
        setActivePrediction((curr) => curr || list[0]);
      }
    } catch {
      // ignore transient fetch errors
    }
  }, []);

  const loadBotData = useCallback(async () => {
    try {
      const [statusRes, stratRes] = await Promise.all([
        apiFetch<{ telemetry: BotTelemetry | null }>(
          `/api/bots/status?accountMode=${encodeURIComponent(accountMode)}`
        ).catch(() => ({ telemetry: null })),
        apiFetch<{ strategies: BotStrategy[] }>('/api/bots/strategies').catch(() => ({ strategies: [] })),
      ]);
      if (statusRes) setBotTelemetry(statusRes.telemetry || null);
      if (stratRes?.strategies?.length) setBotStrategies(stratRes.strategies);
    } catch {
      // ignore
    }
  }, [accountMode]);

  const loadJournal = useCallback(async () => {
    setJournalLoading(true);
    try {
      const res = await apiFetch<{ entries: JournalRow[] }>('/api/journal?limit=30');
      setJournalEntries(res.entries || []);
    } catch {
      // ignore
    } finally {
      setJournalLoading(false);
    }
  }, []);

  const loadSummary = useCallback(async () => {
    setPerfLoading(true);
    try {
      const res = await apiFetch<PerformanceSummary>('/api/analytics/performance?limit=250');
      setPerfData(res || null);
    } catch {
      // ignore
    } finally {
      setPerfLoading(false);
    }
  }, []);

  const loadDetailsAnalytics = useCallback(async () => {
    try {
      const res = await apiFetch<any>(
        `/api/intelligence/analyze?symbol=${encodeURIComponent(selectedSymbol)}&granularity=300&count=120&_t=${Date.now()}`,
        { skipAuth: true, cache: 'no-store' }
      );
      setAnalyzeSnapshot(res);
    } catch {
      // ignore
    }
  }, [selectedSymbol]);

  useEffect(() => {
    loadPredictions();
    loadSummary();
    loadBotData();
  }, [loadPredictions, loadSummary, loadBotData]);

  // Poll live bot telemetry while bot is running (or every 6s when idle)
  useEffect(() => {
    const intervalMs = botTelemetry?.running ? 1600 : 6000;
    const id = setInterval(() => {
      loadBotData();
      if (botTelemetry?.running) {
        refreshOrders();
        loadSummary();
      }
    }, intervalMs);
    return () => clearInterval(id);
  }, [botTelemetry?.running, loadBotData, refreshOrders, loadSummary]);

  useEffect(() => {
    if (navTab === 'journal') loadJournal();
    if (navTab === 'summary') loadSummary();
    if (navTab === 'transactions') refreshOrders();
  }, [navTab, loadJournal, loadSummary, refreshOrders]);

  useEffect(() => {
    if (detailsOpen) {
      loadDetailsAnalytics();
    }
  }, [detailsOpen, loadDetailsAnalytics]);

  // Local live digit & regime analytics computed continuously from incoming ticks
  const liveAnalytics = useMemo(() => {
    const hasData = prices.length > 0;
    const list = hasData ? prices : [activeInst?.price ?? 1000];
    const counts = Array(10).fill(0);
    const digits: number[] = [];

    for (const p of list) {
      const str = Number(p).toFixed(decimals);
      const d = Number(str[str.length - 1] || 0);
      digits.push(d);
      counts[d] = (counts[d] || 0) + 1;
    }

    const n = Math.max(1, digits.length);
    const dist = counts.map((c, d) => ({
      digit: d,
      count: c,
      pct: Number(((c / n) * 100).toFixed(1)),
    }));

    const selectedCount = counts[selectedDigit] || 0;
    const matchesPct = Number(((selectedCount / n) * 100).toFixed(2));
    const differsPct = Number((((n - selectedCount) / n) * 100).toFixed(2));
    const overPct = Number(((digits.filter((d) => d > selectedDigit).length / n) * 100).toFixed(2));
    const underPct = Number(((digits.filter((d) => d < selectedDigit).length / n) * 100).toFixed(2));
    const evenPct = Number(((digits.filter((d) => d % 2 === 0).length / n) * 100).toFixed(2));
    const oddPct = Number((100 - evenPct).toFixed(2));

    const last10 = list.slice(-10);
    const prev10 = list.slice(-20, -10);
    const avg10 = last10.reduce((a, b) => a + b, 0) / Math.max(1, last10.length);
    const avgPrev = prev10.length ? prev10.reduce((a, b) => a + b, 0) / prev10.length : avg10;
    const latestPrice = list[list.length - 1] ?? 0;

    const diffs = list.slice(1).map((v, i) => Math.abs(v - list[i]));
    const avgStep = diffs.reduce((a, b) => a + b, 0) / Math.max(1, diffs.length);
    const volRatio = latestPrice > 0 ? (avgStep / latestPrice) * 10000 : 0;

    const trend = avg10 > avgPrev * 1.0001 ? 'Uptrend' : avg10 < avgPrev * 0.9999 ? 'Downtrend' : 'Sideways';
    const momentum =
      Math.abs(latestPrice - avg10) > avgStep * 1.5
        ? 'Strong'
        : Math.abs(latestPrice - avg10) > avgStep * 0.65
          ? 'Moderate'
          : 'Steady';
    const volatility = volRatio > 8 ? 'High' : volRatio > 2.5 ? 'Moderate' : 'Low';
    const pattern =
      latestPrice >= (list[0] || latestPrice) && evenPct >= 50
        ? 'Bullish'
        : latestPrice < (list[0] || latestPrice) && oddPct > 50
          ? 'Bearish'
          : avg10 >= avgPrev
            ? 'Accumulation'
            : 'Distribution';

    // Recent 10 scanned digits with sequence index & spot price
    const tailLen = Math.min(10, list.length);
    const recentSequence = hasData
      ? list.slice(-tailLen).map((p, idx) => {
          const d = digits[digits.length - tailLen + idx] ?? 0;
          return {
            seqIndex: digits.length - tailLen + idx + 1,
            digit: d,
            price: p,
            isLatest: idx === tailLen - 1,
          };
        })
      : [];

    return {
      hasData,
      latestPrice,
      lastDigit: digits[digits.length - 1] ?? 0,
      sampleSize: hasData ? digits.length : 0,
      selectedCount,
      matchesPct,
      differsPct,
      overPct,
      underPct,
      evenPct,
      oddPct,
      dist,
      recentSequence,
      trend,
      momentum,
      volatility,
      pattern,
    };
  }, [prices, activeInst?.price, decimals, selectedDigit]);

  const executeQuantumScan = useCallback(
    async (digitToScan: number, silent = false) => {
      setIsScanning(true);
      try {
        const cleanStake = Math.max(0.5, Number(quantumStake) || 1);
        const res = await apiFetch<{
          prediction: QuantumPrediction;
          telemetry?: ScanTelemetry;
        }>('/api/quantum/scan', {
          method: 'POST',
          body: JSON.stringify({
            symbol: selectedSymbol,
            stake: cleanStake,
            targetDigit: digitToScan,
            analysisMode,
          }),
        });

        if (res.prediction) {
          setActivePrediction(res.prediction);
          setPredictions((prev) => [
            res.prediction,
            ...prev.filter((p) => p.prediction_id !== res.prediction.prediction_id),
          ]);
          if (autoBroadcast) {
            broadcastSignalToDbot(res.prediction);
          }
          if (!silent) {
            showToast(
              `Digit ${digitToScan} scanned: ${res.prediction.contract_type} (${Number(res.prediction.probability).toFixed(2)}%)`,
              'success'
            );
          }
        }
        if (res.telemetry) {
          setScanTelemetry(res.telemetry);
        }
      } catch (err) {
        if (!silent) {
          showToast(sanitizeUiError(err, 'Quantum scan failed.'), 'error');
        }
      } finally {
        setIsScanning(false);
      }
    },
    [selectedSymbol, quantumStake, analysisMode, autoBroadcast, broadcastSignalToDbot, showToast]
  );

  // Auto-scan when symbol or mode changes (if Auto-Scan is active)
  useEffect(() => {
    if (!autoScanEnabled) return;
    const key = `${selectedSymbol}:${analysisMode}`;
    if (lastAutoKeyRef.current === key || prices.length < 5) return;
    lastAutoKeyRef.current = key;
    executeQuantumScan(selectedDigit, true);
  }, [autoScanEnabled, selectedSymbol, analysisMode, prices.length, selectedDigit, executeQuantumScan]);

  const handleDigitSelect = (digit: number) => {
    setSelectedDigit(digit);
    executeQuantumScan(digit, true);
  };

  const handleRandomDigitScan = () => {
    const others = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].filter((d) => d !== selectedDigit);
    const randomDigit = others[Math.floor(Math.random() * others.length)];
    setSelectedDigit(randomDigit);
    executeQuantumScan(randomDigit, false);
  };

  const handleScanNextDigit = () => {
    const nextDigit = (selectedDigit + 1) % 10;
    setSelectedDigit(nextDigit);
    executeQuantumScan(nextDigit, false);
  };

  const handleDownloadXml = async (pred: QuantumPrediction) => {
    try {
      const token = getStoredToken();
      const resp = await fetch(`/api/quantum/predictions/${encodeURIComponent(pred.prediction_id)}/xml`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}));
        throw new Error(body?.error || 'Prediction expired — run a new scan');
      }
      const xmlText = await resp.text();
      const blob = new Blob([xmlText], { type: 'application/xml' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `quantum_${pred.prediction_id}.xml`;
      a.click();
      URL.revokeObjectURL(url);
      showToast(`Exported signed XML (${pred.prediction_id})`, 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'XML download failed', 'error');
      loadPredictions();
    }
  };

  const handleSyncToDbot = (pred: QuantumPrediction) => {
    broadcastSignalToDbot(pred);
    if (!standalone) {
      setSelectedSymbol(pred.instrument);
      setTradePreset({
        symbol: pred.instrument,
        contractType: pred.contract_type,
        barrier: pred.barrier,
        stake: Number(pred.stake || 1),
        duration: Number(pred.duration || 1),
        durationUnit: pred.duration_unit || 't',
        strategyType: 'quantum_minimal_loss',
        analyserSync: true,
        quantumPredictionId: pred.prediction_id,
        quantumExpiresAt: pred.expires_at,
      });
      setActiveTab('bot-builder');
      return;
    }
    showToast(`Signal ${pred.prediction_id} synced to DBOT`, 'success');
    const url = `/?tab=bot-builder&quantum=${encodeURIComponent(pred.prediction_id)}`;
    window.open(url, '_blank', 'noopener,noreferrer') || (window.location.href = url);
  };

  const handleQuickContractExecute = async (contractType: string, side: string, barrierValue: string) => {
    setExecutingTrade(true);
    try {
      const stakeVal = Math.max(0.5, Number(quantumStake) || 1);
      await apiFetch('/api/orders', {
        method: 'POST',
        body: JSON.stringify({
          symbol: selectedSymbol,
          side,
          contractType,
          stake: stakeVal,
          barrier: barrierValue,
          duration: botDuration,
          durationUnit: botDurationUnit,
          strategyKey: 'quantum_analyser',
          accountMode,
          isAnalyserSynced: true,
          executionMode: activeConnectedAccount && !isDbLocked ? 'deriv' : 'virtual',
          connectedAccountId: activeConnectedAccount?.id || null,
        }),
      });
      await Promise.all([refreshOrders(), refreshAll(), loadSummary()]);
      showToast(`Executed ${contractType} ($${stakeVal.toFixed(2)}) on ${selectedSymbol}`, 'success');
    } catch (err) {
      showToast(sanitizeUiError(err, 'Execution failed'), 'error');
    } finally {
      setExecutingTrade(false);
    }
  };

  const handleQuickExecute = async (pred: QuantumPrediction) => {
    await handleQuickContractExecute(pred.contract_type, pred.contract_type, pred.barrier || String(selectedDigit));
  };

  const handleStartBot = async () => {
    setBotBusy(true);
    try {
      const cleanStake = Math.max(0.5, Number(quantumStake) || 1);
      const cleanTp = Math.max(0.5, Number(botTakeProfit) || 10);
      const cleanSl = Math.max(0.5, Number(botStopLoss) || 6);

      const resolvedCt =
        botContractChoice === 'DIGITMATCH'
          ? 'DIGITMATCH'
          : botContractChoice === 'DIGITDIFF'
            ? 'DIGITDIFF'
            : botContractChoice === 'CALL_PUT'
              ? liveAnalytics.trend === 'Downtrend'
                ? 'PUT'
                : 'CALL'
              : botContractChoice === 'OVER_UNDER'
                ? liveAnalytics.underPct > liveAnalytics.overPct
                  ? 'DIGITUNDER'
                  : 'DIGITOVER'
                : activePrediction?.contract_type || 'DIGITDIFF';

      const contractSideMode =
        botContractChoice === 'DIGITMATCH' || botContractChoice === 'DIGITDIFF' ? 'single' : 'both';

      const res = await apiFetch<{ telemetry: BotTelemetry }>('/api/bots/run', {
        method: 'POST',
        body: JSON.stringify({
          strategyName: botStrategyName || 'Quantum Strategy',
          strategyType: 'quantum_minimal_loss',
          symbol: selectedSymbol,
          contractType: resolvedCt,
          contractSideMode,
          tradeSide: resolvedCt,
          baseStake: cleanStake,
          barrier: String(selectedDigit),
          duration: botDuration,
          durationUnit: botDurationUnit,
          takeProfit: cleanTp,
          stopLoss: cleanSl,
          maxTrades: 15,
          executionMode: activeConnectedAccount && !isDbLocked ? 'deriv' : 'virtual',
          connectedAccountId: activeConnectedAccount?.id || null,
          accountMode,
          executionSpeed: 'fast',
          analyserSync: true,
          quantumPredictionId: activePrediction?.prediction_id || null,
        }),
      });
      setBotTelemetry(res.telemetry || null);
      showToast(`Deriv Bot started on ${selectedSymbol} (${accountMode.toUpperCase()})`, 'success');
    } catch (err) {
      showToast(sanitizeUiError(err, 'Failed to start Deriv Bot'), 'error');
    } finally {
      setBotBusy(false);
    }
  };

  const handleStopBot = async () => {
    setBotBusy(true);
    try {
      const res = await apiFetch<{ telemetry: BotTelemetry | null }>('/api/bots/stop', {
        method: 'POST',
        body: JSON.stringify({ accountMode }),
      });
      setBotTelemetry(res.telemetry || null);
      await Promise.all([refreshOrders(), refreshAll(), loadSummary()]);
      showToast('Deriv Bot stopped', 'info');
    } catch (err) {
      showToast(sanitizeUiError(err, 'Failed to stop bot'), 'error');
    } finally {
      setBotBusy(false);
    }
  };

  const handleAddJournalEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newJournalText.trim()) return;
    try {
      await apiFetch('/api/journal', {
        method: 'POST',
        body: JSON.stringify({
          symbol: selectedSymbol,
          side: activePrediction?.contract_type || 'CALL',
          strategy_key: 'quantum_analyser',
          timeframe: `${botDuration}${botDurationUnit}`,
          rationale: newJournalText.trim(),
          lessons: newJournalLessons.trim(),
          discipline_score: 9,
        }),
      });
      setNewJournalText('');
      setNewJournalLessons('');
      loadJournal();
      showToast('Saved entry to Trading Journal', 'success');
    } catch (err) {
      showToast(sanitizeUiError(err, 'Could not save journal entry'), 'error');
    }
  };

  const handleDeleteJournalEntry = async (id: number) => {
    try {
      await apiFetch(`/api/journal/${id}`, { method: 'DELETE' });
      setJournalEntries((prev) => prev.filter((item) => item.id !== id));
    } catch {
      showToast('Failed to delete entry', 'error');
    }
  };

  // Active signal summary values (strictly derived from real engine / tick data)
  const displayedPred = activePrediction;
  const remainingSecs = displayedPred
    ? Math.max(0, Math.floor((new Date(displayedPred.expires_at).getTime() - nowMs) / 1000))
    : 0;
  const isPredValid = Boolean(displayedPred && displayedPred.validity_status === 'VALID' && remainingSecs > 0);

  const displayedPct = displayedPred
    ? Number(displayedPred.probability).toFixed(1)
    : liveAnalytics.hasData
      ? liveAnalytics.differsPct.toFixed(1)
      : '—';

  const displayedContract = displayedPred
    ? displayedPred.contract_type === 'DIGITDIFF'
      ? `DIFFERS ${displayedPred.barrier}`
      : displayedPred.contract_type === 'DIGITMATCH'
        ? `MATCHES ${displayedPred.barrier}`
        : displayedPred.contract_type === 'DIGITOVER'
          ? `OVER ${displayedPred.barrier}`
          : displayedPred.contract_type === 'DIGITUNDER'
            ? `UNDER ${displayedPred.barrier}`
            : displayedPred.contract_type === 'DIGITEVEN'
              ? 'EVEN'
              : displayedPred.contract_type === 'DIGITODD'
                ? 'ODD'
                : displayedPred.contract_type === 'CALL'
                  ? 'CALL'
                  : displayedPred.contract_type === 'PUT'
                    ? 'PUT'
                    : displayedPred.contract_type
    : liveAnalytics.trend === 'Downtrend'
      ? 'PUT'
      : 'CALL';

  const isBearishSignal = ['PUT', 'FALL', 'UNDER', 'ODD', 'DIFFERS'].some((k) =>
    displayedContract.includes(k)
  );

  const trendValue = scanTelemetry?.trend || liveAnalytics.trend;
  const momentumValue = scanTelemetry?.momentum || liveAnalytics.momentum;
  const volatilityValue = scanTelemetry?.volatility || liveAnalytics.volatility;
  const patternValue = scanTelemetry?.pattern || liveAnalytics.pattern;
  const distRows = scanTelemetry?.digitDistribution || liveAnalytics.dist;

  // Derived real Matches & Differs stats from engine + live tick buffer
  const matchesDisplayPct =
    displayedPred?.contract_type === 'DIGITMATCH' && displayedPred.barrier === String(selectedDigit)
      ? Number(displayedPred.probability).toFixed(2)
      : liveAnalytics.hasData
        ? liveAnalytics.matchesPct.toFixed(2)
        : '—';

  const differsDisplayPct =
    displayedPred?.contract_type === 'DIGITDIFF' && displayedPred.barrier === String(selectedDigit)
      ? Number(displayedPred.probability).toFixed(2)
      : liveAnalytics.hasData
        ? liveAnalytics.differsPct.toFixed(2)
        : '—';

  // Bottom bar real KPIs (preferring live DB analytics, reflecting running bot stats cleanly)
  const summaryWinRate = Number(
    perfData?.combined?.winRatePct ??
      (botTelemetry && botTelemetry.tradesPlaced > 0
        ? (botTelemetry.wins / botTelemetry.tradesPlaced) * 100
        : 0)
  );
  const summaryTotalTrades = Number(
    perfData?.combined?.totalTrades ?? botTelemetry?.tradesPlaced ?? 0
  );
  const summaryNetPnl = Number(
    perfData?.combined?.netPnlUsd ?? botTelemetry?.realizedPnl ?? 0
  );

  const navItems: Array<{ id: QuantumNavTab; label: string; shortLabel: string; icon: React.ComponentType<any> }> = [
    { id: 'analysis', label: 'Quantum Analyser', shortLabel: 'Analyser', icon: BarChart2 },
    { id: 'transactions', label: 'Transactions', shortLabel: 'Trades', icon: ArrowLeftRight },
    { id: 'journal', label: 'Journal', shortLabel: 'Journal', icon: BookOpen },
    { id: 'summary', label: 'Summary', shortLabel: 'Summary', icon: PieChart },
    { id: 'settings', label: 'Settings', shortLabel: 'Settings', icon: Settings },
    { id: 'about', label: 'Help', shortLabel: 'Help', icon: HelpCircle },
  ];

  const recentOrders = useMemo(() => {
    const q = txSearch.trim().toLowerCase();
    return orders
      .filter((o) => (o.account_mode || (o.execution_mode === 'deriv' ? 'real' : 'demo')) === accountMode)
      .filter((o) => (txFilter === 'ALL' ? true : o.status === txFilter))
      .filter((o) =>
        q ? o.symbol.toLowerCase().includes(q) || String(o.contract_type || '').toLowerCase().includes(q) : true
      )
      .slice(0, 50);
  }, [orders, accountMode, txFilter, txSearch]);

  const botRunning = Boolean(botTelemetry?.running);

  return (
    <div className="min-h-screen bg-[#0B0E14] text-[#F1F5F9] flex flex-col overflow-x-hidden">
      {/* TOP APPLICATION HEADER */}
      <header className="border-b border-[#1E2533] bg-[#0F131B] flex items-center justify-between h-16 px-4 lg:px-0 shrink-0 z-30">
        <div className="flex items-center min-w-0">
          {/* Desktop Sidebar Brand Block */}
          <div className="hidden lg:flex items-center gap-2.5 w-[216px] shrink-0 px-5 h-16 border-r border-[#1E2533]">
            <DerivChevronMark />
            <span className="font-display text-[17px] font-bold tracking-wide text-white whitespace-nowrap">
              DERIV
            </span>
          </div>

          {/* Quantum Analyser Title & Subtitle */}
          <div className="flex items-center gap-3 lg:px-5 min-w-0">
            <QuantumLogoMark />
            <div className="min-w-0">
              <h1 className="font-display text-base sm:text-xl font-bold tracking-tight text-white leading-tight truncate">
                Quantum Analyser
              </h1>
              <p className="text-[11px] sm:text-xs text-[#94A3B8] italic leading-tight truncate">
                Deriv Options Analyser
              </p>
            </div>
          </div>
        </div>

        {/* Right Connection Status + Account & Profile Controls */}
        <div className="flex items-center gap-3 sm:gap-4 lg:pr-6 shrink-0 relative">
          <div className="hidden sm:flex items-center gap-2 text-xs text-[#CBD5E1]">
            <span
              className={`w-2 h-2 rounded-full shrink-0 ${
                wsConnected ? 'bg-[#00D084]' : isDbLocked ? 'bg-amber-400' : 'bg-[#FF444F]'
              }`}
              aria-hidden="true"
            />
            <span className="font-medium whitespace-nowrap">
              {wsConnected ? 'Ready' : isDbLocked ? 'Simulated' : 'Connecting'}
            </span>
            <span className="text-[#475569]" aria-hidden="true">
              |
            </span>
            <span className={accountMode === 'real' ? 'text-[#00D084] font-semibold' : 'text-amber-300 font-semibold'}>
              {accountMode === 'real' ? 'Real' : 'Demo'}
            </span>
            <span className="text-[#475569]" aria-hidden="true">
              ·
            </span>
            <span className="font-mono-num font-bold text-white whitespace-nowrap">
              {formatMoney(optionsBal)}
            </span>
          </div>

          <button
            type="button"
            onClick={() => setProfileMenuOpen((v) => !v)}
            aria-label="Account controls"
            className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg bg-[#161B26] hover:bg-[#1D2432] border border-[#262E3F] text-[#E2E8F0] transition-colors cursor-pointer"
          >
            <span className="w-7 h-7 rounded-full bg-[#222938] flex items-center justify-center text-white">
              <User className="w-4 h-4" />
            </span>
            <ChevronDown className="w-3.5 h-3.5 text-[#94A3B8] hidden sm:block" />
          </button>

          {/* Mobile / Tablet Hamburger */}
          <button
            type="button"
            onClick={() => setMobileMenuOpen((v) => !v)}
            aria-label="Toggle navigation menu"
            className="lg:hidden p-2 rounded-lg bg-[#161B26] border border-[#262E3F] text-slate-200 cursor-pointer"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>

          {profileMenuOpen && (
            <div className="absolute right-0 top-12 w-64 rounded-xl bg-[#12161F] border border-[#262E3F] shadow-2xl p-3 space-y-2.5 z-50">
              <div className="px-2 py-1.5 border-b border-[#1E2533]">
                <p className="text-xs font-bold text-white truncate">{user?.full_name || 'Trader'}</p>
                <p className="text-[11px] text-[#94A3B8] truncate">{user?.email}</p>
                <p className="text-[11px] font-mono-num text-white mt-1 sm:hidden">
                  {accountMode.toUpperCase()} · {formatMoney(optionsBal)}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => setAccountMode('demo')}
                  className={`py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${
                    accountMode === 'demo' ? 'bg-[#FF444F] text-white' : 'bg-[#19202E] text-slate-300'
                  }`}
                >
                  Demo
                </button>
                <button
                  type="button"
                  onClick={() => setAccountMode('real')}
                  className={`py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${
                    accountMode === 'real' ? 'bg-[#00D084] text-[#052E16]' : 'bg-[#19202E] text-slate-300'
                  }`}
                >
                  Real
                </button>
              </div>
              <a
                href="/?tab=bot-builder"
                target="_blank"
                rel="noopener noreferrer"
                className="w-full px-3 py-2 rounded-lg bg-[#19202E] hover:bg-[#222B3D] text-xs font-semibold text-white flex items-center justify-between"
              >
                <span>Open DBOT Workspace</span>
                <ExternalLink className="w-3.5 h-3.5 text-[#94A3B8]" />
              </a>
              <button
                type="button"
                onClick={() => {
                  setProfileMenuOpen(false);
                  logout();
                }}
                className="w-full px-3 py-2 rounded-lg bg-[#FF444F]/15 hover:bg-[#FF444F]/25 text-xs font-semibold text-[#FF6B74] text-left cursor-pointer"
              >
                Log out
              </button>
            </div>
          )}
        </div>
      </header>

      {/* MOBILE / TABLET SLIDE-OVER MENU */}
      {mobileMenuOpen && (
        <div className="lg:hidden fixed inset-0 z-50 bg-black/70" onClick={() => setMobileMenuOpen(false)}>
          <div
            onClick={(e) => e.stopPropagation()}
            className="ml-auto w-72 h-full bg-[#0F131B] border-l border-[#1E2533] p-5 flex flex-col justify-between"
          >
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <DerivChevronMark />
                  <span className="font-display font-bold text-sm text-white">Quantum Analyser</span>
                </div>
                <button type="button" onClick={() => setMobileMenuOpen(false)} className="p-1 text-slate-400">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-3 rounded-xl bg-[#141923] border border-[#222938]">
                <p className="text-xs font-bold text-white truncate">{user?.full_name || 'Trader'}</p>
                <p className="text-[11px] font-mono-num text-[#94A3B8] mt-0.5">
                  {accountMode.toUpperCase()} · {formatMoney(optionsBal)}
                </p>
                <div className="grid grid-cols-2 gap-1.5 mt-2.5">
                  <button
                    type="button"
                    onClick={() => setAccountMode('demo')}
                    className={`py-1.5 rounded-lg text-xs font-semibold ${
                      accountMode === 'demo' ? 'bg-[#FF444F] text-white' : 'bg-[#1D2432] text-slate-300'
                    }`}
                  >
                    Demo
                  </button>
                  <button
                    type="button"
                    onClick={() => setAccountMode('real')}
                    className={`py-1.5 rounded-lg text-xs font-semibold ${
                      accountMode === 'real' ? 'bg-[#00D084] text-[#052E16]' : 'bg-[#1D2432] text-slate-300'
                    }`}
                  >
                    Real
                  </button>
                </div>
              </div>

              <nav className="space-y-1">
                {navItems.map((it) => {
                  const Icon = it.icon;
                  const active = navTab === it.id;
                  return (
                    <button
                      key={it.id}
                      type="button"
                      onClick={() => {
                        setNavTab(it.id);
                        setMobileMenuOpen(false);
                      }}
                      className={`w-full px-3 py-2.5 rounded-lg flex items-center gap-3 text-sm font-medium transition-colors cursor-pointer ${
                        active
                          ? 'bg-gradient-to-r from-[#3D151D] to-[#1D1218] text-white border border-[#FF444F]/35'
                          : 'text-[#CBD5E1] hover:bg-[#161B26]'
                      }`}
                    >
                      <Icon className={`w-4 h-4 ${active ? 'text-[#FF444F]' : 'text-[#94A3B8]'}`} />
                      <span>{it.label}</span>
                    </button>
                  );
                })}
              </nav>

              <a
                href="/?tab=bot-builder"
                target="_blank"
                rel="noopener noreferrer"
                className="w-full px-3 py-2.5 rounded-lg bg-[#161B26] border border-[#222938] text-xs font-semibold text-white flex items-center justify-between"
              >
                <span>Open DBOT Workspace</span>
                <ExternalLink className="w-3.5 h-3.5 text-[#94A3B8]" />
              </a>
            </div>

            <button
              type="button"
              onClick={logout}
              className="w-full py-2.5 rounded-lg bg-[#FF444F]/15 text-[#FF6B74] text-xs font-bold cursor-pointer"
            >
              Log out
            </button>
          </div>
        </div>
      )}

      {/* MAIN BODY SHELL */}
      <div className="flex-1 flex w-full pb-16 lg:pb-0">
        {/* DESKTOP LEFT SIDEBAR */}
        <aside className="hidden lg:flex flex-col justify-between w-[216px] shrink-0 bg-[#0E121A] border-r border-[#1E2533] py-4 px-3">
          <nav className="space-y-1">
            {navItems.map((it) => {
              const Icon = it.icon;
              const active = navTab === it.id;
              return (
                <button
                  key={it.id}
                  type="button"
                  onClick={() => setNavTab(it.id)}
                  className={`w-full px-3.5 py-2.5 rounded-lg flex items-center gap-3 text-[13px] font-medium transition-colors cursor-pointer whitespace-nowrap ${
                    active
                      ? 'bg-gradient-to-r from-[#3D151D] to-[#1C1217] text-white border border-[#FF444F]/35'
                      : 'text-[#CBD5E1] hover:bg-[#151B26] hover:text-white border border-transparent'
                  }`}
                >
                  <Icon className={`w-4 h-4 shrink-0 ${active ? 'text-[#FF444F]' : 'text-[#94A3B8]'}`} />
                  <span className="truncate">{it.label}</span>
                </button>
              );
            })}
          </nav>

          {/* DBOT Bridge Status Card */}
          <div className="rounded-xl bg-[#12161F] border border-[#222938] p-3.5 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-white">DBOT Sync</span>
              <button
                type="button"
                onClick={() => setAutoBroadcast((v) => !v)}
                aria-label="Toggle auto-broadcast to DBOT"
                className={`w-10 h-5 rounded-full transition-colors p-0.5 cursor-pointer ${
                  autoBroadcast ? 'bg-[#FF444F]' : 'bg-[#262E3F]'
                }`}
              >
                <span
                  className={`block w-4 h-4 rounded-full bg-white transition-transform ${
                    autoBroadcast ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
            <p className="text-[11px] text-[#94A3B8] leading-snug">
              {autoBroadcast
                ? '120s signed signals broadcast automatically to Deriv Bot.'
                : 'Manual sync enabled for DBOT export.'}
            </p>
            <a
              href="/?tab=bot-builder"
              target="_blank"
              rel="noopener noreferrer"
              className="w-full py-1.5 px-2.5 rounded-lg bg-[#19202E] hover:bg-[#222B3E] border border-[#262E3F] text-[11px] font-semibold text-white flex items-center justify-center gap-1.5"
            >
              <span>DBOT Builder</span>
              <ExternalLink className="w-3 h-3 text-[#94A3B8]" />
            </a>
          </div>
        </aside>

        {/* MAIN STAGE */}
        <main className="flex-1 min-w-0 p-4 sm:p-5 lg:p-6 flex flex-col justify-between gap-4 max-w-[1440px]">
          {navTab === 'analysis' && (
            <>
              {/* TOP 2-COLUMN WORKSPACE: ANALYSIS (LEFT) + DERIV BOT (RIGHT) */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
                {/* LEFT ANALYSIS WORKSPACE */}
                <div className="lg:col-span-8 space-y-4 min-w-0">
                  {/* A. INSTRUMENT & ANALYSIS CONTROLS */}
                  <section className="rounded-xl bg-[#12161F] border border-[#222938] p-4 space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
                      {/* Instrument Dropdown */}
                      <div className="sm:col-span-5">
                        <label className="block text-xs font-medium text-[#CBD5E1] mb-1.5">
                          Instrument
                        </label>
                        <div className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-[#0D1118] border border-[#262E3F] focus-within:border-[#FF444F]">
                          <BotInstrumentIcon symbol={selectedSymbol} size="sm" />
                          <select
                            value={selectedSymbol}
                            onChange={(e) => setSelectedSymbol(e.target.value)}
                            aria-label="Select instrument"
                            className="flex-1 min-w-0 bg-transparent text-xs sm:text-sm font-semibold text-white outline-none cursor-pointer"
                          >
                            {instruments.map((inst) => (
                              <option key={inst.symbol} value={inst.symbol} className="bg-[#12161F] text-white">
                                {inst.display_name}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      {/* Timeframe / Observations */}
                      <div className="sm:col-span-3">
                        <label className="block text-xs font-medium text-[#CBD5E1] mb-1.5">
                          Timeframe / Sample
                        </label>
                        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[#0D1118] border border-[#262E3F] focus-within:border-[#FF444F]">
                          <Clock className="w-4 h-4 text-[#94A3B8] shrink-0" />
                          <select
                            value={tickCount}
                            onChange={(e) => setTickCount(Number(e.target.value))}
                            aria-label="Analysis sample ticks"
                            className="flex-1 min-w-0 bg-transparent text-xs sm:text-sm font-semibold text-white outline-none cursor-pointer"
                          >
                            <option value={50} className="bg-[#12161F]">50 Ticks</option>
                            <option value={100} className="bg-[#12161F]">100 Ticks</option>
                            <option value={250} className="bg-[#12161F]">250 Ticks</option>
                            <option value={500} className="bg-[#12161F]">500 Ticks</option>
                          </select>
                        </div>
                      </div>

                      {/* Analysis Mode */}
                      <div className="sm:col-span-4">
                        <label className="block text-xs font-medium text-[#CBD5E1] mb-1.5">
                          Analysis Mode
                        </label>
                        <select
                          value={analysisMode}
                          onChange={(e) => setAnalysisMode(e.target.value as AnalysisMode)}
                          aria-label="Analysis mode"
                          className="w-full px-3 py-2 rounded-lg bg-[#0D1118] border border-[#262E3F] text-xs sm:text-sm font-semibold text-white outline-none focus:border-[#FF444F] cursor-pointer"
                        >
                          <option value="auto" className="bg-[#12161F]">Auto (Digits &amp; Direction)</option>
                          <option value="digit" className="bg-[#12161F]">Digits (Matches / Differs)</option>
                          <option value="directional" className="bg-[#12161F]">Directional (Rise / Fall)</option>
                        </select>
                      </div>
                    </div>

                    {/* Live Feed Strip & Scan Controls */}
                    <div className="pt-2.5 border-t border-[#1E2533] flex flex-wrap items-center justify-between gap-2.5 text-xs">
                      <div className="flex flex-wrap items-center gap-3 text-[#94A3B8]">
                        <span>
                          Spot:{' '}
                          <strong className="font-mono-num text-white">
                            {liveAnalytics.hasData ? liveAnalytics.latestPrice.toFixed(decimals) : '—'}
                          </strong>
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>
                          Sample:{' '}
                          <strong className="font-mono-num text-white">{liveAnalytics.sampleSize} ticks</strong>
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>
                          Last Digit:{' '}
                          <strong className="font-mono-num text-[#FF444F]">{liveAnalytics.lastDigit}</strong>
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setAutoScanEnabled((v) => !v)}
                          className={`px-3 py-1.5 rounded-lg border text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                            autoScanEnabled
                              ? 'bg-[#19202E] border-[#2C364A] text-[#00D084]'
                              : 'bg-[#0D1118] border-[#262E3F] text-[#94A3B8]'
                          }`}
                        >
                          {autoScanEnabled ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                          <span>{autoScanEnabled ? 'Auto On' : 'Auto Paused'}</span>
                        </button>
                        <button
                          type="button"
                          disabled={isScanning}
                          onClick={() => executeQuantumScan(selectedDigit, false)}
                          className="px-3.5 py-1.5 rounded-lg bg-[#FF444F] hover:bg-[#E63946] text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-60 whitespace-nowrap"
                        >
                          <RefreshCw className={`w-3.5 h-3.5 ${isScanning ? 'animate-spin' : ''}`} />
                          <span>{isScanning ? 'Scanning...' : 'Scan Now'}</span>
                        </button>
                      </div>
                    </div>
                  </section>

                  {/* B. QUANTUM SIGNAL RESULT CARD (Matching Reference Banner) */}
                  <section
                    className={`rounded-xl border p-4 sm:p-5 transition-colors ${
                      isBearishSignal
                        ? 'bg-gradient-to-r from-[#2A1219] via-[#1C1217] to-[#131720] border-[#6E2430]'
                        : 'bg-gradient-to-r from-[#0C261F] via-[#101C1B] to-[#131720] border-[#1A533E]'
                    }`}
                  >
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                      {/* Left Signal Core */}
                      <div className="flex items-center gap-4">
                        <div
                          className={`w-16 h-16 rounded-full border-2 flex items-center justify-center shrink-0 ${
                            isBearishSignal
                              ? 'border-[#FF444F] bg-[#FF444F]/10 text-[#FF444F]'
                              : 'border-[#00D084] bg-[#00D084]/10 text-[#00D084]'
                          }`}
                        >
                          {isBearishSignal ? (
                            <ArrowDown className="w-8 h-8" strokeWidth={2.5} />
                          ) : (
                            <ArrowUp className="w-8 h-8" strokeWidth={2.5} />
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-[#CBD5E1]">Quantum Signal</p>
                          <p
                            className={`font-display text-3xl sm:text-4xl font-bold tracking-tight leading-none mt-1 ${
                              isBearishSignal ? 'text-[#FF444F]' : 'text-[#00D084]'
                            }`}
                          >
                            {displayedContract}
                          </p>
                          <p className="text-xs sm:text-sm text-[#E2E8F0] mt-1.5 font-mono-num">
                            Confidence:{' '}
                            <strong className={isBearishSignal ? 'text-[#FF444F]' : 'text-[#00D084]'}>
                              {displayedPct}%
                            </strong>
                            {displayedPred && (
                              <span className="text-[#94A3B8]">
                                {' '}
                                · {new Date(displayedPred.generated_at).toLocaleTimeString()}
                              </span>
                            )}
                          </p>
                        </div>
                      </div>

                      {/* Vertical Divider */}
                      <div className="hidden md:block w-px h-16 bg-white/10 shrink-0" />

                      {/* Right Market Indicators & Signal Actions */}
                      <div className="flex flex-col sm:flex-row md:flex-col lg:flex-row items-start sm:items-center justify-between gap-4">
                        <div className="space-y-1.5 text-xs">
                          <div className="flex items-center gap-2">
                            <Check className="w-3.5 h-3.5 text-[#00D084] shrink-0" />
                            <span className="text-[#94A3B8]">Trend:</span>
                            <span
                              className={`font-semibold ${
                                trendValue === 'Downtrend' ? 'text-[#FF444F]' : 'text-[#00D084]'
                              }`}
                            >
                              {trendValue}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <BarChart2 className="w-3.5 h-3.5 text-[#CBD5E1] shrink-0" />
                            <span className="text-[#94A3B8]">Momentum:</span>
                            <span className="font-semibold text-[#00D084]">{momentumValue}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Activity className="w-3.5 h-3.5 text-[#CBD5E1] shrink-0" />
                            <span className="text-[#94A3B8]">Volatility:</span>
                            <span className="font-semibold text-[#00D084]">{volatilityValue}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Clock className="w-3.5 h-3.5 text-[#CBD5E1] shrink-0" />
                            <span className="text-[#94A3B8]">Status:</span>
                            <span className="font-mono-num font-semibold text-white">
                              {isPredValid
                                ? `Valid (${Math.floor(remainingSecs / 60)}:${String(remainingSecs % 60).padStart(2, '0')})`
                                : 'Live Feed'}
                            </span>
                          </div>
                        </div>

                        {displayedPred && (
                          <div className="flex flex-wrap md:flex-col gap-1.5 shrink-0">
                            <button
                              type="button"
                              onClick={() => handleSyncToDbot(displayedPred)}
                              className="px-3 py-1.5 rounded-lg bg-[#19202E] hover:bg-[#232D40] border border-[#2D384E] text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                            >
                              <ExternalLink className="w-3.5 h-3.5 text-[#FF444F]" />
                              <span>Sync DBOT</span>
                            </button>
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => handleDownloadXml(displayedPred)}
                                className="px-2.5 py-1.5 rounded-lg bg-[#141923] hover:bg-[#1E2533] border border-[#262E3F] text-slate-200 text-xs font-medium inline-flex items-center gap-1 cursor-pointer whitespace-nowrap"
                              >
                                <Download className="w-3 h-3" />
                                <span>XML</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => setDetailsOpen(true)}
                                className="px-2.5 py-1.5 rounded-lg bg-[#141923] hover:bg-[#1E2533] border border-[#262E3F] text-slate-200 text-xs font-medium inline-flex items-center gap-1 cursor-pointer whitespace-nowrap"
                              >
                                <BarChart2 className="w-3 h-3" />
                                <span>Details</span>
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </section>

                  {/* C. MOST IMPORTANT: LARGE DIGIT SCANNER / DIGIT ANALYSIS PREVIEW + MATCHES / DIFFERS PANEL */}
                  <section className="rounded-xl bg-[#12161F] border border-[#222938] p-4 sm:p-5 space-y-4">
                    {/* Header + Target Digit Controls */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <h2 className="font-display text-base sm:text-lg font-bold text-white">
                          Digit Scanner Preview
                        </h2>
                        <p className="text-xs text-[#94A3B8] mt-0.5">
                          Live scanned last-digit sequence for {activeInst?.display_name || selectedSymbol} · Target Digit{' '}
                          <strong className="font-mono-num text-white">{selectedDigit}</strong>
                        </p>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          disabled={isScanning}
                          onClick={handleRandomDigitScan}
                          className="px-3 py-1.5 rounded-lg bg-[#161B26] hover:bg-[#1F2736] border border-[#2A3346] text-xs font-semibold text-white inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-60 whitespace-nowrap"
                        >
                          <Shuffle className="w-3.5 h-3.5 text-[#FF444F]" />
                          <span>Random Digit</span>
                        </button>
                        <button
                          type="button"
                          disabled={isScanning}
                          onClick={handleScanNextDigit}
                          className="px-3 py-1.5 rounded-lg bg-[#FF444F] hover:bg-[#E63946] text-xs font-semibold text-white inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-60 whitespace-nowrap"
                        >
                          <Play className="w-3.5 h-3.5 fill-white" />
                          <span>Scan Next</span>
                        </button>
                      </div>
                    </div>

                    {/* Interactive 0-9 Target Digit Picker */}
                    <div className="grid grid-cols-5 sm:grid-cols-10 gap-2">
                      {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => {
                        const isSel = selectedDigit === d;
                        const rowDist = distRows.find((r) => r.digit === d);
                        return (
                          <button
                            key={d}
                            type="button"
                            onClick={() => handleDigitSelect(d)}
                            className={`py-2 px-1 rounded-lg border text-center transition-colors cursor-pointer ${
                              isSel
                                ? 'bg-[#FF444F] border-[#FF444F] text-white'
                                : 'bg-[#0D1118] border-[#222938] text-[#E2E8F0] hover:border-[#3A455C]'
                            }`}
                          >
                            <span className="block font-mono-num text-base font-bold leading-none">{d}</span>
                            <span
                              className={`block font-mono-num text-[10px] mt-1 ${
                                isSel ? 'text-white/90' : 'text-[#94A3B8]'
                              }`}
                            >
                              {rowDist ? `${rowDist.pct}%` : '—'}
                            </span>
                          </button>
                        );
                      })}
                    </div>

                    {/* LARGE SCANNED DIGIT TILES */}
                    {ticksLoading && liveAnalytics.recentSequence.length === 0 ? (
                      <div className="grid grid-cols-5 sm:grid-cols-10 gap-2.5">
                        {Array.from({ length: 10 }).map((_, idx) => (
                          <div
                            key={idx}
                            className="h-24 rounded-xl bg-[#0D1118] border border-[#222938] animate-pulse"
                          />
                        ))}
                      </div>
                    ) : liveAnalytics.recentSequence.length === 0 ? (
                      <div className="rounded-xl bg-[#0D1118] border border-[#222938] py-10 px-4 text-center space-y-2">
                        <p className="text-sm font-semibold text-white">Waiting for live digit stream</p>
                        <p className="text-xs text-[#94A3B8]">
                          Tick observations for {selectedSymbol} will appear here automatically as quotes arrive.
                        </p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-5 sm:grid-cols-5 md:grid-cols-10 gap-2.5">
                        {liveAnalytics.recentSequence.map((item) => {
                          const isMatch = item.digit === selectedDigit;
                          return (
                            <button
                              key={`${item.seqIndex}-${item.digit}`}
                              type="button"
                              onClick={() => handleDigitSelect(item.digit)}
                              title={`Tick #${item.seqIndex} · Spot ${item.price.toFixed(decimals)} — click to target digit ${item.digit}`}
                              className={`min-h-[92px] sm:min-h-[104px] rounded-xl border p-2 flex flex-col items-center justify-between transition-colors cursor-pointer ${
                                item.isLatest
                                  ? isMatch
                                    ? 'bg-[#0D261F] border-[#00D084] ring-1 ring-[#00D084]/50'
                                    : 'bg-[#251318] border-[#FF444F] ring-1 ring-[#FF444F]/50'
                                  : isMatch
                                    ? 'bg-[#0E1E1A] border-[#1A4B3A]'
                                    : 'bg-[#0D1118] border-[#222938] hover:border-[#364156]'
                              }`}
                            >
                              <span className="text-[10px] font-mono-num font-semibold text-[#94A3B8]">
                                {item.isLatest ? 'LIVE' : `#${item.seqIndex}`}
                              </span>

                              <span
                                className={`font-mono-num text-3xl sm:text-[36px] font-bold leading-none ${
                                  item.isLatest
                                    ? isMatch
                                      ? 'text-[#00D084]'
                                      : 'text-white'
                                    : isMatch
                                      ? 'text-[#00D084]'
                                      : 'text-[#E2E8F0]'
                                }`}
                              >
                                {item.digit}
                              </span>

                              <span
                                className={`text-[10px] font-bold tracking-wide ${
                                  isMatch ? 'text-[#00D084]' : 'text-[#94A3B8]'
                                }`}
                              >
                                {item.isLatest ? (isMatch ? 'MATCH · NOW' : 'DIFF · NOW') : isMatch ? 'MATCH' : 'DIFF'}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    )}

                    {/* LARGE MATCHES vs DIFFERS PREDICTION PANEL */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 pt-1">
                      {/* MATCHES OUTCOME */}
                      <div className="rounded-xl bg-[#0D1118] border border-[#222938] p-4 flex flex-col justify-between gap-3">
                        <div className="space-y-2.5">
                          <div className="flex items-center justify-between gap-2">
                            <div>
                              <span className="text-[11px] font-semibold uppercase tracking-wider text-[#94A3B8]">
                                Prediction Outcome
                              </span>
                              <h3 className="font-display text-lg font-bold text-white">MATCHES</h3>
                            </div>
                            <div className="px-3 py-1.5 rounded-lg bg-[#161B26] border border-[#2D384E] text-center">
                              <span className="block text-[10px] text-[#94A3B8]">Target Digit</span>
                              <span className="font-mono-num text-xl font-bold text-[#FF444F] leading-tight">
                                {selectedDigit}
                              </span>
                            </div>
                          </div>

                          <div className="flex items-baseline justify-between border-y border-[#1B2230] py-2.5">
                            <span className="text-xs text-[#94A3B8]">Observed Match Rate</span>
                            <span className="font-mono-num text-2xl font-bold text-white">
                              {matchesDisplayPct}%
                            </span>
                          </div>

                          <p className="text-xs text-[#CBD5E1] leading-relaxed">
                            {displayedPred?.contract_type === 'DIGITMATCH' &&
                            displayedPred.barrier === String(selectedDigit) &&
                            displayedPred.rationale
                              ? displayedPred.rationale
                              : `Digit ${selectedDigit} appeared ${liveAnalytics.selectedCount} times across ${liveAnalytics.sampleSize} analysed ticks (${liveAnalytics.matchesPct.toFixed(1)}% vs 10.0% baseline). Predicts exit last digit equals ${selectedDigit}.`}
                          </p>
                        </div>

                        <button
                          type="button"
                          disabled={executingTrade || !liveAnalytics.hasData}
                          onClick={() => handleQuickContractExecute('DIGITMATCH', 'MATCH', String(selectedDigit))}
                          className="w-full py-2 px-3 rounded-lg bg-[#161B26] hover:bg-[#1E2636] border border-[#2D384E] text-xs font-semibold text-white cursor-pointer disabled:opacity-50"
                        >
                          {executingTrade
                            ? 'Executing...'
                            : `Trade Matches (${selectedDigit}) · $${Math.max(0.5, Number(quantumStake) || 1).toFixed(2)}`}
                        </button>
                      </div>

                      {/* DIFFERS OUTCOME */}
                      <div className="rounded-xl bg-[#0D1118] border border-[#1A533E] p-4 flex flex-col justify-between gap-3">
                        <div className="space-y-2.5">
                          <div className="flex items-center justify-between gap-2">
                            <div>
                              <span className="text-[11px] font-semibold uppercase tracking-wider text-[#00D084]">
                                Prediction Outcome
                              </span>
                              <h3 className="font-display text-lg font-bold text-[#00D084]">DIFFERS</h3>
                            </div>
                            <div className="px-3 py-1.5 rounded-lg bg-[#0E241C] border border-[#1A533E] text-center">
                              <span className="block text-[10px] text-[#94A3B8]">Excluded Digit</span>
                              <span className="font-mono-num text-xl font-bold text-[#00D084] leading-tight">
                                {selectedDigit}
                              </span>
                            </div>
                          </div>

                          <div className="flex items-baseline justify-between border-y border-[#1B2230] py-2.5">
                            <span className="text-xs text-[#94A3B8]">Observed Non-Match Rate</span>
                            <span className="font-mono-num text-2xl font-bold text-[#00D084]">
                              {differsDisplayPct}%
                            </span>
                          </div>

                          <p className="text-xs text-[#CBD5E1] leading-relaxed">
                            {displayedPred?.contract_type === 'DIGITDIFF' &&
                            displayedPred.barrier === String(selectedDigit) &&
                            displayedPred.rationale
                              ? displayedPred.rationale
                              : `Digit ${selectedDigit} excluded in ${Math.max(0, liveAnalytics.sampleSize - liveAnalytics.selectedCount)}/${liveAnalytics.sampleSize} recent ticks (${liveAnalytics.differsPct.toFixed(2)}% non-match rate). Statistical rates are historical and not guaranteed.`}
                          </p>
                        </div>

                        <button
                          type="button"
                          disabled={executingTrade || !liveAnalytics.hasData}
                          onClick={() => handleQuickContractExecute('DIGITDIFF', 'DIFF', String(selectedDigit))}
                          className="w-full py-2 px-3 rounded-lg bg-[#0C2B21] hover:bg-[#113A2C] border border-[#1A533E] text-xs font-semibold text-[#00D084] cursor-pointer disabled:opacity-50"
                        >
                          {executingTrade
                            ? 'Executing...'
                            : `Trade Differs (${selectedDigit}) · $${Math.max(0.5, Number(quantumStake) || 1).toFixed(2)}`}
                        </button>
                      </div>
                    </div>
                  </section>

                  {/* D. LIVE CANDLESTICK CHART (Matching Reference Chart Card) */}
                  <section className="rounded-xl bg-[#12161F] border border-[#222938] p-4 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2 text-xs">
                        <BotInstrumentIcon symbol={selectedSymbol} size="sm" />
                        <span className="font-semibold text-white">
                          {activeInst?.display_name || selectedSymbol}
                        </span>
                        <span className="text-[#475569]" aria-hidden="true">
                          ·
                        </span>
                        <span className="text-[#94A3B8]">1m Candlesticks</span>
                      </div>

                      <div className="flex items-center gap-3 text-xs">
                        <span className="text-[#94A3B8]">
                          Pattern: <strong className="text-white">{patternValue}</strong>
                        </span>
                        <button
                          type="button"
                          onClick={() => setDetailsOpen(true)}
                          className="text-xs font-semibold text-[#FF444F] hover:underline cursor-pointer"
                        >
                          Full Breakdown
                        </button>
                      </div>
                    </div>

                    <div className="relative h-[250px] sm:h-[270px] w-full rounded-lg overflow-hidden border border-[#1E2533] bg-[#10141D]">
                      <div ref={chartContainerRef} className="w-full h-full" />
                      {candlesLoading && candles.length === 0 && (
                        <div className="absolute inset-0 flex items-center justify-center text-xs text-[#94A3B8] bg-[#10141D]/80">
                          Loading market candlesticks...
                        </div>
                      )}
                    </div>
                  </section>
                </div>

                {/* RIGHT COLUMN: DERIV BOT AUTOMATED TRADING PANEL */}
                <aside className="lg:col-span-4 rounded-xl bg-[#12161F] border border-[#222938] p-4 sm:p-5 space-y-4">
                  {/* Deriv Bot Card Header */}
                  <div className="flex items-center justify-between gap-3 pb-3 border-b border-[#1E2533]">
                    <div className="flex items-center gap-3 min-w-0">
                      <DerivBotRobotIcon />
                      <div className="min-w-0">
                        <h2 className="font-display text-base font-bold text-white leading-tight truncate">
                          Deriv Bot
                        </h2>
                        <p className="text-xs text-[#94A3B8] truncate">Automated Trading</p>
                      </div>
                    </div>

                    <button
                      type="button"
                      disabled={botBusy}
                      onClick={() => (botRunning ? handleStopBot() : handleStartBot())}
                      aria-label={botRunning ? 'Stop Deriv Bot' : 'Start Deriv Bot'}
                      className={`w-12 h-6 rounded-full transition-colors p-0.5 cursor-pointer shrink-0 disabled:opacity-60 ${
                        botRunning ? 'bg-[#FF444F]' : 'bg-[#262E3F]'
                      }`}
                    >
                      <span
                        className={`block w-5 h-5 rounded-full bg-white transition-transform ${
                          botRunning ? 'translate-x-6' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>

                  {/* Bot Connection & Selected Instrument Summary */}
                  <div className="rounded-lg bg-[#0D1118] border border-[#222938] p-3 flex items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-2 min-w-0">
                      <BotInstrumentIcon symbol={selectedSymbol} size="sm" />
                      <div className="min-w-0">
                        <p className="font-semibold text-white truncate">
                          {activeInst?.display_name || selectedSymbol}
                        </p>
                        <p className="text-[11px] text-[#94A3B8]">
                          {accountMode === 'real' ? 'Real Account' : 'Demo Account'} ·{' '}
                          {activeConnectedAccount && !isDbLocked ? 'Deriv Live' : 'Virtual Engine'}
                        </p>
                      </div>
                    </div>
                    <span
                      className={`text-[11px] font-semibold shrink-0 ${
                        botRunning ? 'text-[#00D084]' : 'text-[#94A3B8]'
                      }`}
                    >
                      {botRunning ? 'Running' : 'Connected'}
                    </span>
                  </div>

                  {/* Strategy Select */}
                  <div>
                    <label className="block text-xs font-medium text-[#CBD5E1] mb-1.5">Strategy</label>
                    <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-[#0D1118] border border-[#262E3F] focus-within:border-[#FF444F]">
                      <BarChart2 className="w-4 h-4 text-[#FF444F] shrink-0" />
                      <select
                        value={botStrategyName}
                        onChange={(e) => setBotStrategyName(e.target.value)}
                        aria-label="Bot strategy"
                        className="flex-1 min-w-0 bg-transparent text-xs sm:text-sm font-semibold text-white outline-none cursor-pointer"
                      >
                        <option value="Quantum Strategy" className="bg-[#12161F]">
                          Quantum Strategy
                        </option>
                        {botStrategies.map((s) => (
                          <option key={s.id} value={s.name} className="bg-[#12161F]">
                            {s.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Contract Selection (Matches / Differs / Auto) */}
                  <div>
                    <label className="block text-xs font-medium text-[#CBD5E1] mb-1.5">
                      Contract Selection
                    </label>
                    <select
                      value={botContractChoice}
                      onChange={(e) => setBotContractChoice(e.target.value as BotContractChoice)}
                      aria-label="Contract selection"
                      className="w-full px-3 py-2.5 rounded-lg bg-[#0D1118] border border-[#262E3F] text-xs sm:text-sm font-semibold text-white outline-none focus:border-[#FF444F] cursor-pointer"
                    >
                      <option value="AUTO" className="bg-[#12161F]">
                        Auto from Analyser ({displayedContract})
                      </option>
                      <option value="DIGITMATCH" className="bg-[#12161F]">
                        Matches (Target Digit {selectedDigit})
                      </option>
                      <option value="DIGITDIFF" className="bg-[#12161F]">
                        Differs (Exclude Digit {selectedDigit})
                      </option>
                      <option value="CALL_PUT" className="bg-[#12161F]">
                        Rise / Fall (CALL / PUT)
                      </option>
                      <option value="OVER_UNDER" className="bg-[#12161F]">
                        Over / Under Digits
                      </option>
                    </select>
                  </div>

                  {/* Stake Input + Presets */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs font-medium text-[#CBD5E1]">Stake (USD)</label>
                      <div className="flex items-center gap-1">
                        {['1', '2', '5', '10'].map((amt) => (
                          <button
                            key={amt}
                            type="button"
                            onClick={() => setQuantumStake(amt)}
                            className={`px-1.5 py-0.5 rounded text-[10px] font-mono-num font-semibold cursor-pointer ${
                              quantumStake === amt
                                ? 'bg-[#FF444F] text-white'
                                : 'bg-[#19202E] text-[#94A3B8] hover:text-white'
                            }`}
                          >
                            ${amt}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="flex items-center px-3 py-2.5 rounded-lg bg-[#0D1118] border border-[#262E3F] focus-within:border-[#FF444F]">
                      <span className="text-sm font-mono-num text-[#94A3B8] mr-1">$</span>
                      <input
                        type="number"
                        min="0.5"
                        step="0.5"
                        value={quantumStake}
                        onChange={(e) => setQuantumStake(e.target.value)}
                        aria-label="Bot stake USD"
                        className="w-full bg-transparent text-sm font-mono-num font-bold text-white outline-none"
                      />
                    </div>
                  </div>

                  {/* Duration */}
                  <div>
                    <label className="block text-xs font-medium text-[#CBD5E1] mb-1.5">Duration</label>
                    <div className="grid grid-cols-2 gap-2">
                      <select
                        value={botDuration}
                        onChange={(e) => setBotDuration(Number(e.target.value))}
                        aria-label="Contract duration"
                        className="px-3 py-2.5 rounded-lg bg-[#0D1118] border border-[#262E3F] text-xs sm:text-sm font-mono-num font-semibold text-white outline-none focus:border-[#FF444F] cursor-pointer"
                      >
                        <option value={1} className="bg-[#12161F]">1</option>
                        <option value={2} className="bg-[#12161F]">2</option>
                        <option value={3} className="bg-[#12161F]">3</option>
                        <option value={5} className="bg-[#12161F]">5</option>
                        <option value={10} className="bg-[#12161F]">10</option>
                      </select>
                      <select
                        value={botDurationUnit}
                        onChange={(e) => setBotDurationUnit(e.target.value as 't' | 's' | 'm')}
                        aria-label="Duration unit"
                        className="px-3 py-2.5 rounded-lg bg-[#0D1118] border border-[#262E3F] text-xs sm:text-sm font-semibold text-white outline-none focus:border-[#FF444F] cursor-pointer"
                      >
                        <option value="t" className="bg-[#12161F]">Ticks</option>
                        <option value="s" className="bg-[#12161F]">Seconds</option>
                        <option value="m" className="bg-[#12161F]">Minutes</option>
                      </select>
                    </div>
                  </div>

                  {/* Take Profit & Stop Loss */}
                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <label className="block text-xs font-medium text-[#CBD5E1] mb-1.5">
                        Take Profit ($)
                      </label>
                      <input
                        type="number"
                        min="0.5"
                        step="0.5"
                        value={botTakeProfit}
                        onChange={(e) => setBotTakeProfit(e.target.value)}
                        aria-label="Take profit USD"
                        className="w-full px-3 py-2 rounded-lg bg-[#0D1118] border border-[#262E3F] text-sm font-mono-num font-semibold text-[#00D084] outline-none focus:border-[#FF444F]"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-[#CBD5E1] mb-1.5">
                        Stop Loss ($)
                      </label>
                      <input
                        type="number"
                        min="0.5"
                        step="0.5"
                        value={botStopLoss}
                        onChange={(e) => setBotStopLoss(e.target.value)}
                        aria-label="Stop loss USD"
                        className="w-full px-3 py-2 rounded-lg bg-[#0D1118] border border-[#262E3F] text-sm font-mono-num font-semibold text-[#FF444F] outline-none focus:border-[#FF444F]"
                      />
                    </div>
                  </div>

                  {/* Start / Stop Bot Primary CTA */}
                  {botRunning ? (
                    <button
                      type="button"
                      disabled={botBusy}
                      onClick={handleStopBot}
                      className="w-full h-12 rounded-lg bg-[#1E2533] hover:bg-[#273042] border border-[#FF444F] text-white font-bold text-sm inline-flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
                    >
                      <Square className="w-4 h-4 fill-[#FF444F] text-[#FF444F]" />
                      <span>{botBusy ? 'Stopping Bot...' : 'Stop Bot'}</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={botBusy}
                      onClick={handleStartBot}
                      className="w-full h-12 rounded-lg bg-[#FF444F] hover:bg-[#E63946] text-white font-bold text-sm inline-flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
                    >
                      <Play className="w-4 h-4 fill-white" />
                      <span>{botBusy ? 'Starting Bot...' : 'Start Bot'}</span>
                    </button>
                  )}

                  {/* Active Session Telemetry */}
                  {botTelemetry && (botTelemetry.running || botTelemetry.tradesPlaced > 0) && (
                    <div className="rounded-lg bg-[#0D1118] border border-[#222938] p-3 space-y-2 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="text-[#94A3B8]">Session Trades</span>
                        <span className="font-mono-num font-bold text-white">
                          {botTelemetry.tradesPlaced} ({botTelemetry.wins}W / {botTelemetry.losses}L)
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-[#94A3B8]">Session P/L</span>
                        <span
                          className={`font-mono-num font-bold ${
                            botTelemetry.realizedPnl >= 0 ? 'text-[#00D084]' : 'text-[#FF444F]'
                          }`}
                        >
                          {botTelemetry.realizedPnl >= 0 ? '+' : ''}$
                          {Number(botTelemetry.realizedPnl || 0).toFixed(2)}
                        </span>
                      </div>
                      {botTelemetry.lastSignal && (
                        <p className="text-[11px] text-[#94A3B8] truncate pt-1 border-t border-[#1E2533]">
                          Signal: {botTelemetry.lastSignal}
                        </p>
                      )}
                    </div>
                  )}

                  {/* Quick Bridge Actions */}
                  {displayedPred && (
                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => handleSyncToDbot(displayedPred)}
                        className="py-2 px-2.5 rounded-lg bg-[#161B26] hover:bg-[#1E2636] border border-[#262E3F] text-xs font-semibold text-white inline-flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap"
                      >
                        <ExternalLink className="w-3.5 h-3.5 text-[#FF444F]" />
                        <span>DBOT Builder</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDownloadXml(displayedPred)}
                        className="py-2 px-2.5 rounded-lg bg-[#161B26] hover:bg-[#1E2636] border border-[#262E3F] text-xs font-semibold text-white inline-flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap"
                      >
                        <Download className="w-3.5 h-3.5 text-[#94A3B8]" />
                        <span>Signed XML</span>
                      </button>
                    </div>
                  )}
                </aside>
              </div>

              {/* BOTTOM 4-COLUMN PERFORMANCE SUMMARY STRIP (Matching Reference Bottom Bar) */}
              <section className="rounded-xl bg-[#12161F] border border-[#222938] px-4 sm:px-6 py-3.5 grid grid-cols-2 lg:grid-cols-4 gap-4 items-center">
                {/* Win Rate */}
                <div className="flex items-center gap-3 lg:border-r lg:border-[#222938] lg:pr-4">
                  <div className="w-10 h-10 rounded-lg bg-[#F59E0B]/10 flex items-center justify-center text-[#F59E0B] shrink-0">
                    <Trophy className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-xs text-[#94A3B8]">Win Rate</p>
                    <p className="font-mono-num text-xl sm:text-2xl font-bold text-white leading-tight">
                      {summaryWinRate.toFixed(0)}%
                    </p>
                  </div>
                </div>

                {/* Total Trades */}
                <div className="flex items-center gap-3 lg:border-r lg:border-[#222938] lg:pr-4">
                  <div className="w-10 h-10 rounded-lg bg-[#19202E] flex items-center justify-center text-[#E2E8F0] shrink-0">
                    <BarChart2 className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-xs text-[#94A3B8]">Total Trades</p>
                    <p className="font-mono-num text-xl sm:text-2xl font-bold text-white leading-tight">
                      {summaryTotalTrades}
                    </p>
                  </div>
                </div>

                {/* Profit / Loss */}
                <div className="flex items-center gap-3 lg:border-r lg:border-[#222938] lg:pr-4">
                  <div
                    className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
                      summaryNetPnl >= 0 ? 'bg-[#00D084]/10 text-[#00D084]' : 'bg-[#FF444F]/10 text-[#FF444F]'
                    }`}
                  >
                    <CircleDollarSign className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-xs text-[#94A3B8]">Profit/Loss</p>
                    <p
                      className={`font-mono-num text-xl sm:text-2xl font-bold leading-tight ${
                        summaryNetPnl >= 0 ? 'text-[#00D084]' : 'text-[#FF444F]'
                      }`}
                    >
                      {summaryNetPnl >= 0 ? '+' : '-'}${Math.abs(summaryNetPnl).toFixed(2)}
                    </p>
                  </div>
                </div>

                {/* Bot Status Pill */}
                <div className="rounded-lg bg-[#0D1118] border border-[#222938] px-3.5 py-2.5 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span
                      className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                        botRunning ? 'bg-[#00D084]' : 'bg-[#64748B]'
                      }`}
                      aria-hidden="true"
                    />
                    <div className="min-w-0">
                      <p className="text-[11px] text-[#94A3B8] leading-none">Bot Status:</p>
                      <p
                        className={`text-sm font-semibold mt-1 leading-none truncate ${
                          botRunning ? 'text-[#00D084]' : 'text-white'
                        }`}
                      >
                        {botRunning ? 'Running...' : 'Idle · Ready'}
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    disabled={botBusy}
                    onClick={() => (botRunning ? handleStopBot() : handleStartBot())}
                    aria-label={botRunning ? 'Pause bot' : 'Start bot'}
                    className="w-8 h-8 rounded-full bg-[#1E2533] hover:bg-[#2A3347] text-white flex items-center justify-center cursor-pointer shrink-0 disabled:opacity-50"
                  >
                    {botRunning ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </section>
            </>
          )}

          {/* TRANSACTIONS VIEW */}
          {navTab === 'transactions' && (
            <section className="rounded-xl bg-[#12161F] border border-[#222938] p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="font-display text-base font-bold text-white">
                    Live Transactions ({accountMode.toUpperCase()})
                  </h2>
                  <p className="text-xs text-[#94A3B8]">
                    Real-time orders &amp; Deriv Bot settlements synced with your account
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#0D1118] border border-[#262E3F]">
                    <Search className="w-3.5 h-3.5 text-[#94A3B8]" />
                    <input
                      type="text"
                      value={txSearch}
                      onChange={(e) => setTxSearch(e.target.value)}
                      placeholder="Filter symbol..."
                      className="bg-transparent text-xs text-white outline-none w-28 sm:w-36"
                    />
                  </div>

                  <div className="flex items-center gap-1 p-1 rounded-lg bg-[#0D1118] border border-[#222938]">
                    {(['ALL', 'OPEN', 'CLOSED'] as const).map((st) => (
                      <button
                        key={st}
                        type="button"
                        onClick={() => setTxFilter(st)}
                        className={`px-2.5 py-1 rounded text-[11px] font-semibold cursor-pointer ${
                          txFilter === st ? 'bg-[#FF444F] text-white' : 'text-[#94A3B8] hover:text-white'
                        }`}
                      >
                        {st}
                      </button>
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={() => refreshOrders()}
                    className="px-3 py-1.5 rounded-lg bg-[#19202E] hover:bg-[#222B3E] border border-[#262E3F] text-xs font-semibold text-white inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <RefreshCw className="w-3.5 h-3.5" /> Refresh
                  </button>
                </div>
              </div>

              {recentOrders.length === 0 ? (
                <div className="py-12 text-center space-y-3">
                  <p className="text-xs text-[#94A3B8]">
                    No matching transactions recorded on your {accountMode} account yet.
                  </p>
                  <button
                    type="button"
                    onClick={() => setNavTab('analysis')}
                    className="px-4 py-2 rounded-lg bg-[#FF444F] hover:bg-[#E63946] text-xs font-semibold text-white cursor-pointer"
                  >
                    Back to Analyser
                  </button>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-[#222938] text-[#94A3B8]">
                        <th className="py-2.5 pr-3 font-medium">Symbol</th>
                        <th className="py-2.5 pr-3 font-medium">Contract</th>
                        <th className="py-2.5 pr-3 font-medium">Stake</th>
                        <th className="py-2.5 pr-3 font-medium">Entry / Exit</th>
                        <th className="py-2.5 pr-3 font-medium">Status</th>
                        <th className="py-2.5 text-right font-medium">Profit / Loss</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#1B2230]">
                      {recentOrders.map((o) => {
                        const pnl = Number(o.pnl || 0);
                        return (
                          <tr key={o.id} className="hover:bg-[#161B26]">
                            <td className="py-2.5 pr-3 font-semibold text-white">
                              <div className="inline-flex items-center gap-2">
                                <BotInstrumentIcon symbol={o.symbol} size="sm" />
                                <span>{o.symbol}</span>
                              </div>
                            </td>
                            <td className="py-2.5 pr-3 text-[#CBD5E1]">
                              <div className="inline-flex items-center gap-2">
                                <BotContractTypeIcon
                                  contractType={o.contract_type}
                                  side={o.side}
                                  barrier={o.barrier}
                                  className="w-4 h-4 shrink-0"
                                />
                                <span>{o.contract_type}</span>
                              </div>
                            </td>
                            <td className="py-2.5 pr-3 font-mono-num text-white">${Number(o.stake).toFixed(2)}</td>
                            <td className="py-2.5 pr-3 font-mono-num text-[#94A3B8]">
                              {Number(o.entry_price).toFixed(2)} /{' '}
                              {Number(o.exit_price ?? o.current_price ?? o.entry_price).toFixed(2)}
                            </td>
                            <td className="py-2.5 pr-3">
                              <span
                                className={`text-[11px] font-semibold ${
                                  o.status === 'OPEN' ? 'text-amber-300' : 'text-[#94A3B8]'
                                }`}
                              >
                                {o.status}
                              </span>
                            </td>
                            <td
                              className={`py-2.5 text-right font-mono-num font-bold ${
                                pnl > 0 ? 'text-[#00D084]' : pnl < 0 ? 'text-[#FF444F]' : 'text-[#CBD5E1]'
                              }`}
                            >
                              {pnl >= 0 ? '+' : ''}
                              {pnl.toFixed(2)} USD
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}

          {/* JOURNAL VIEW */}
          {navTab === 'journal' && (
            <div className="space-y-4">
              <form
                onSubmit={handleAddJournalEntry}
                className="rounded-xl bg-[#12161F] border border-[#222938] p-5 space-y-3"
              >
                <div className="flex items-center justify-between">
                  <h2 className="font-display text-base font-bold text-white">Quantum Trade Journal</h2>
                  <span className="text-xs text-[#94A3B8] inline-flex items-center gap-1.5">
                    <BotInstrumentIcon symbol={selectedSymbol} size="sm" />
                    {selectedSymbol}
                  </span>
                </div>
                <input
                  type="text"
                  value={newJournalText}
                  onChange={(e) => setNewJournalText(e.target.value)}
                  placeholder="Record setup rationale (e.g. Digit 7 frequency dipped to 5%, synced to DBOT)..."
                  className="w-full px-3.5 py-2.5 rounded-lg bg-[#0D1118] border border-[#262E3F] text-xs text-white outline-none focus:border-[#FF444F]"
                />
                <div className="flex flex-col sm:flex-row gap-2.5">
                  <input
                    type="text"
                    value={newJournalLessons}
                    onChange={(e) => setNewJournalLessons(e.target.value)}
                    placeholder="Key takeaway / risk discipline note (optional)"
                    className="flex-1 px-3.5 py-2 rounded-lg bg-[#0D1118] border border-[#262E3F] text-xs text-white outline-none focus:border-[#FF444F]"
                  />
                  <button
                    type="submit"
                    className="px-4 py-2 rounded-lg bg-[#FF444F] hover:bg-[#E63946] text-white text-xs font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add Note
                  </button>
                </div>
              </form>

              <section className="rounded-xl bg-[#12161F] border border-[#222938] p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-white">Recorded Entries</h3>
                  {journalLoading && <span className="text-xs text-[#94A3B8]">Syncing...</span>}
                </div>
                {journalEntries.length === 0 ? (
                  <p className="text-xs text-[#94A3B8] py-8 text-center">No journal notes saved yet.</p>
                ) : (
                  <div className="divide-y divide-[#1E2533]">
                    {journalEntries.map((entry) => (
                      <div key={entry.id} className="py-3 first:pt-0 last:pb-0 flex items-start justify-between gap-3">
                        <div className="space-y-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2 text-xs">
                            <BotInstrumentIcon symbol={entry.symbol} size="sm" />
                            <span className="font-bold text-white">{entry.symbol}</span>
                            <span className="text-[#FF444F] font-semibold">{entry.side}</span>
                            <span aria-hidden="true" className="text-[#475569]">·</span>
                            <span className="text-[#94A3B8] font-mono-num">
                              {new Date(entry.created_at).toLocaleString()}
                            </span>
                          </div>
                          {entry.rationale && <p className="text-xs text-[#E2E8F0]">{entry.rationale}</p>}
                          {entry.lessons && (
                            <p className="text-[11px] text-[#00D084]">Lesson: {entry.lessons}</p>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => handleDeleteJournalEntry(entry.id)}
                          className="p-1.5 rounded-lg text-[#94A3B8] hover:text-[#FF444F] hover:bg-white/5 cursor-pointer shrink-0"
                          aria-label="Delete journal entry"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>
          )}

          {/* SUMMARY VIEW */}
          {navTab === 'summary' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="rounded-xl bg-[#12161F] border border-[#222938] p-4">
                  <p className="text-xs text-[#94A3B8]">Net Profit / Loss</p>
                  <p
                    className={`font-mono-num text-2xl font-bold mt-1 ${
                      (perfData?.combined?.netPnlUsd ?? 0) >= 0 ? 'text-[#00D084]' : 'text-[#FF444F]'
                    }`}
                  >
                    {(perfData?.combined?.netPnlUsd ?? 0) >= 0 ? '+' : ''}
                    ${Number(perfData?.combined?.netPnlUsd ?? 0).toFixed(2)}
                  </p>
                </div>
                <div className="rounded-xl bg-[#12161F] border border-[#222938] p-4">
                  <p className="text-xs text-[#94A3B8]">Win Rate</p>
                  <p className="font-mono-num text-2xl font-bold text-white mt-1">
                    {Number(perfData?.combined?.winRatePct ?? 0).toFixed(1)}%
                  </p>
                </div>
                <div className="rounded-xl bg-[#12161F] border border-[#222938] p-4">
                  <p className="text-xs text-[#94A3B8]">Closed Trades</p>
                  <p className="font-mono-num text-2xl font-bold text-white mt-1">
                    {perfData?.combined?.totalTrades ?? 0}
                  </p>
                </div>
                <div className="rounded-xl bg-[#12161F] border border-[#222938] p-4">
                  <p className="text-xs text-[#94A3B8]">Profit Factor</p>
                  <p className="font-mono-num text-2xl font-bold text-white mt-1">
                    {Number(perfData?.combined?.profitFactor ?? 0).toFixed(2)}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="rounded-xl bg-[#12161F] border border-[#222938] p-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-white">Real vs Demo Account Split</h3>
                    {perfLoading && <span className="text-xs text-[#94A3B8]">Loading...</span>}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-lg bg-[#0D1118] border border-[#222938] p-3.5">
                      <p className="text-xs text-[#00D084] font-semibold">Real Account</p>
                      <p className="font-mono-num text-lg font-bold text-white mt-1">
                        ${Number(perfData?.real?.netPnlUsd ?? 0).toFixed(2)}
                      </p>
                      <p className="text-[11px] font-mono-num text-[#94A3B8] mt-0.5">
                        {perfData?.real?.totalTrades ?? 0} trades · {perfData?.real?.winRatePct ?? 0}% win
                      </p>
                    </div>
                    <div className="rounded-lg bg-[#0D1118] border border-[#222938] p-3.5">
                      <p className="text-xs text-amber-300 font-semibold">Demo Account</p>
                      <p className="font-mono-num text-lg font-bold text-white mt-1">
                        ${Number(perfData?.demo?.netPnlUsd ?? 0).toFixed(2)}
                      </p>
                      <p className="text-[11px] font-mono-num text-[#94A3B8] mt-0.5">
                        {perfData?.demo?.totalTrades ?? 0} trades · {perfData?.demo?.winRatePct ?? 0}% win
                      </p>
                    </div>
                  </div>
                </div>

                <div className="rounded-xl bg-[#12161F] border border-[#222938] p-5 space-y-3">
                  <h3 className="text-sm font-bold text-white">Recent Quantum Signals ({predictions.length})</h3>
                  {predictions.length === 0 ? (
                    <p className="text-xs text-[#94A3B8] py-4">No predictions generated yet.</p>
                  ) : (
                    <div className="divide-y divide-[#1E2533] max-h-56 overflow-y-auto pr-1">
                      {predictions.slice(0, 8).map((p) => {
                        const rem = Math.max(
                          0,
                          Math.floor((new Date(p.expires_at).getTime() - nowMs) / 1000)
                        );
                        return (
                          <div
                            key={p.prediction_id}
                            className="py-2.5 flex items-center justify-between gap-2 text-xs"
                          >
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <BotInstrumentIcon symbol={p.instrument} size="sm" />
                                <span className="font-bold text-white">{p.instrument}</span>
                                <span className="text-[#00D084] font-semibold">{p.contract_type}</span>
                              </div>
                              <p className="text-[11px] text-[#94A3B8] truncate mt-0.5">{p.predicted_condition}</p>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className="font-mono-num font-bold text-white">
                                {Number(p.probability).toFixed(1)}%
                              </span>
                              {rem > 0 && p.validity_status === 'VALID' ? (
                                <button
                                  type="button"
                                  onClick={() => handleSyncToDbot(p)}
                                  className="px-2.5 py-1 rounded bg-[#FF444F] hover:bg-[#E63946] text-white text-[11px] font-semibold cursor-pointer"
                                >
                                  DBOT
                                </button>
                              ) : (
                                <span className="text-[11px] text-[#64748B]">Expired</span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* SETTINGS VIEW */}
          {navTab === 'settings' && (
            <section className="rounded-xl bg-[#12161F] border border-[#222938] p-5 sm:p-6 space-y-5 max-w-3xl">
              <div>
                <h2 className="font-display text-base font-bold text-white">Analyser &amp; Bot Settings</h2>
                <p className="text-xs text-[#94A3B8] mt-0.5">
                  Configure instrument sampling, stake sizing, risk targets, and DBOT synchronization.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div>
                  <label className="block text-[#CBD5E1] font-medium mb-1.5">Active Instrument</label>
                  <select
                    value={selectedSymbol}
                    onChange={(e) => setSelectedSymbol(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-lg bg-[#0D1118] border border-[#262E3F] text-white font-semibold outline-none focus:border-[#FF444F]"
                  >
                    {instruments.map((inst) => (
                      <option key={inst.symbol} value={inst.symbol} className="bg-[#12161F]">
                        {inst.display_name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[#CBD5E1] font-medium mb-1.5">Signal Stake (USD)</label>
                  <input
                    type="number"
                    min="0.5"
                    step="0.5"
                    value={quantumStake}
                    onChange={(e) => setQuantumStake(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-lg bg-[#0D1118] border border-[#262E3F] text-white font-mono-num font-bold outline-none focus:border-[#FF444F]"
                  />
                </div>

                <div>
                  <label className="block text-[#CBD5E1] font-medium mb-1.5">Tick History Sample</label>
                  <select
                    value={tickCount}
                    onChange={(e) => setTickCount(Number(e.target.value))}
                    className="w-full px-3 py-2.5 rounded-lg bg-[#0D1118] border border-[#262E3F] text-white font-semibold outline-none focus:border-[#FF444F]"
                  >
                    <option value={50} className="bg-[#12161F]">50 Ticks (Fast)</option>
                    <option value={100} className="bg-[#12161F]">100 Ticks (Standard)</option>
                    <option value={250} className="bg-[#12161F]">250 Ticks (Deep)</option>
                    <option value={500} className="bg-[#12161F]">500 Ticks (Institutional)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[#CBD5E1] font-medium mb-1.5">Prediction Mode</label>
                  <select
                    value={analysisMode}
                    onChange={(e) => setAnalysisMode(e.target.value as AnalysisMode)}
                    className="w-full px-3 py-2.5 rounded-lg bg-[#0D1118] border border-[#262E3F] text-white font-semibold outline-none focus:border-[#FF444F]"
                  >
                    <option value="auto" className="bg-[#12161F]">Auto (Digits &amp; Direction)</option>
                    <option value="digit" className="bg-[#12161F]">Digit Contracts (Matches / Differs)</option>
                    <option value="directional" className="bg-[#12161F]">Directional Momentum (Rise / Fall)</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-between p-4 rounded-lg bg-[#0D1118] border border-[#222938]">
                <div>
                  <p className="text-xs font-bold text-white">Auto-Broadcast Scans to DBOT</p>
                  <p className="text-[11px] text-[#94A3B8] mt-0.5">
                    Pushes 120s signed signals automatically to Deriv Bot Builder
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setAutoBroadcast((v) => !v)}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${
                    autoBroadcast ? 'bg-[#FF444F] text-white' : 'bg-[#1E2533] text-[#CBD5E1]'
                  }`}
                >
                  {autoBroadcast ? 'Enabled' : 'Disabled'}
                </button>
              </div>
            </section>
          )}

          {/* HELP / ABOUT VIEW */}
          {navTab === 'about' && (
            <section className="rounded-xl bg-[#12161F] border border-[#222938] p-5 sm:p-6 space-y-4 max-w-3xl">
              <div className="flex items-center gap-3">
                <ShieldCheck className="w-6 h-6 text-[#FF444F]" />
                <h2 className="font-display text-base font-bold text-white">Quantum Analyser Help &amp; Architecture</h2>
              </div>
              <p className="text-xs text-[#CBD5E1] leading-relaxed">
                Quantum Analyser ingests live Deriv WebSocket tick feeds and evaluates 0–9 last-digit frequencies,
                EMA/RSI directional slope, and tick volatility to compute 120-second HMAC-SHA256 signed strategies
                synchronized with Deriv Bot.
              </p>
              <div className="rounded-lg bg-[#0D1118] border border-[#222938] p-4 text-xs text-[#94A3B8] space-y-1.5">
                <p className="font-bold text-white">Digit Scanner &amp; Deriv Bot Execution</p>
                <p>
                  Select any target digit (0–9) or click <strong className="text-white">Random Digit</strong> to
                  compare Matches and Differs probabilities in real time, then start the{' '}
                  <strong className="text-white">Deriv Bot</strong> panel or export the signed{' '}
                  <code className="text-[#FF444F]">.xml</code> strategy for DBOT Builder.
                </p>
              </div>
              <p className="text-[11px] text-amber-300/90">
                Risk Notice: Statistical probability analysis reflects historical tick distributions and never
                guarantees future trading results.
              </p>
            </section>
          )}
        </main>
      </div>

      {/* COMPACT MOBILE BOTTOM NAVIGATION */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-30 bg-[#0F131B]/95 backdrop-blur-md border-t border-[#1E2533] grid grid-cols-5 h-14 px-1">
        {navItems.slice(0, 5).map((it) => {
          const Icon = it.icon;
          const active = navTab === it.id;
          return (
            <button
              key={it.id}
              type="button"
              onClick={() => setNavTab(it.id)}
              className={`flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium cursor-pointer ${
                active ? 'text-[#FF444F]' : 'text-[#94A3B8]'
              }`}
            >
              <Icon className="w-[18px] h-[18px]" />
              <span className="truncate max-w-full px-1">{it.shortLabel}</span>
            </button>
          );
        })}
      </nav>

      {/* VIEW ANALYSIS DETAILS MODAL */}
      {detailsOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4"
          onClick={() => setDetailsOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-xl bg-[#12161F] border border-[#262E3F] p-5 sm:p-6 space-y-5 shadow-2xl"
          >
            <div className="flex items-center justify-between gap-3 border-b border-[#1E2533] pb-3.5">
              <div>
                <h3 className="font-display text-lg font-bold text-white">
                  Detailed Digit Analysis · {activeInst?.display_name || selectedSymbol} (Digit {selectedDigit})
                </h3>
                <p className="text-xs text-[#94A3B8]">
                  Live tick distribution across {liveAnalytics.sampleSize} recent ticks
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDetailsOpen(false)}
                className="p-2 rounded-lg bg-[#19202E] text-slate-300 hover:text-white cursor-pointer"
                aria-label="Close analysis details"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* 0-9 Digit Distribution Bars */}
            <div className="space-y-2.5">
              <p className="text-xs font-semibold text-[#94A3B8]">Digit Frequency Distribution (0 – 9)</p>
              <div className="grid grid-cols-5 sm:grid-cols-10 gap-2">
                {distRows.map((row) => {
                  const isTarget = row.digit === selectedDigit;
                  return (
                    <div
                      key={row.digit}
                      className={`rounded-lg p-2.5 border text-center ${
                        isTarget ? 'bg-[#FF444F]/15 border-[#FF444F]' : 'bg-[#0D1118] border-[#222938]'
                      }`}
                    >
                      <div className="h-16 flex items-end justify-center pb-1">
                        <div
                          className={`w-3.5 rounded-t ${isTarget ? 'bg-[#FF444F]' : 'bg-[#00D084]/70'}`}
                          style={{ height: `${Math.min(100, Math.max(12, row.pct * 4.5))}%` }}
                        />
                      </div>
                      <p className="text-xs font-mono-num font-bold text-white">{row.digit}</p>
                      <p className="text-[10px] font-mono-num text-[#94A3B8]">{row.pct}%</p>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Digit Ratios + Technical Snapshot */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div className="rounded-lg bg-[#0D1118] border border-[#222938] p-3">
                <p className="text-[#94A3B8]">Differs ({selectedDigit})</p>
                <p className="font-mono-num font-bold text-[#00D084] text-sm mt-1">
                  {liveAnalytics.differsPct.toFixed(1)}%
                </p>
              </div>
              <div className="rounded-lg bg-[#0D1118] border border-[#222938] p-3">
                <p className="text-[#94A3B8]">
                  Over {selectedDigit} / Under {selectedDigit}
                </p>
                <p className="font-mono-num font-bold text-white text-sm mt-1">
                  {liveAnalytics.overPct.toFixed(0)}% / {liveAnalytics.underPct.toFixed(0)}%
                </p>
              </div>
              <div className="rounded-lg bg-[#0D1118] border border-[#222938] p-3">
                <p className="text-[#94A3B8]">Even / Odd</p>
                <p className="font-mono-num font-bold text-white text-sm mt-1">
                  {liveAnalytics.evenPct.toFixed(0)}% / {liveAnalytics.oddPct.toFixed(0)}%
                </p>
              </div>
              <div className="rounded-lg bg-[#0D1118] border border-[#222938] p-3">
                <p className="text-[#94A3B8]">RSI (14) / Bias</p>
                <p className="font-mono-num font-bold text-white text-sm mt-1">
                  {analyzeSnapshot?.indicators?.rsi14 ? Number(analyzeSnapshot.indicators.rsi14).toFixed(1) : '—'} ·{' '}
                  {analyzeSnapshot?.smc?.bias || liveAnalytics.trend}
                </p>
              </div>
            </div>

            {displayedPred && (
              <div className="rounded-lg bg-[#0D1118] border border-[#1A533E] p-4 space-y-3">
                <div>
                  <span className="text-xs font-mono-num font-bold text-[#00D084]">
                    {displayedPred.prediction_id} · {displayedPred.contract_type}
                  </span>
                  <p className="text-xs text-[#CBD5E1] mt-1">{displayedPred.rationale}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => handleSyncToDbot(displayedPred)}
                    className="px-4 py-2 rounded-lg bg-[#FF444F] hover:bg-[#E63946] text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <ExternalLink className="w-3.5 h-3.5" /> Open &amp; Sync in DBOT
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDownloadXml(displayedPred)}
                    className="px-4 py-2 rounded-lg bg-[#19202E] hover:bg-[#222B3E] border border-[#262E3F] text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" /> Download Signed XML
                  </button>
                  <button
                    type="button"
                    disabled={executingTrade}
                    onClick={() => handleQuickExecute(displayedPred)}
                    className="px-4 py-2 rounded-lg bg-[#00D084] hover:bg-[#00B873] text-[#052E16] text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    {executingTrade ? 'Executing...' : `Trade Now ($${displayedPred.stake})`}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
