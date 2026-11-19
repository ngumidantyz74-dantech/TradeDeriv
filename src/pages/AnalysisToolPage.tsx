import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  Activity,
  TrendingUp,
  TrendingDown,
  Radar,
  Layers,
  Target,
  Clock,
  Sparkles,
  ArrowUpRight,
  AlertTriangle,
  RefreshCw,
  Send,
  ShieldAlert,
  Search,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { apiFetch, fetchDerivTickHistoryDirect, subscribeDerivTicksDirect, sanitizeUiError } from '../lib/api';
import type { SmcAnalysis, BuyLowSellHighResult, StrategySetup } from '../lib/quant-engine';

type AnalyserTab =
  | 'radar'
  | 'smc'
  | 'blsh'
  | 'sessions'
  | 'copilot'
  | 'dcircles'
  | 'signals'
  | 'over-under'
  | 'rise-fall';

interface RadarInstrument {
  symbol: string;
  displayName: string;
  category: string;
  price: number | null;
  source: string;
  error: string | null;
  volatilityPct: number | null;
  trendStrengthAdx: number | null;
  rsi14: number | null;
  smcBias: 'bullish' | 'bearish' | 'neutral';
  dealingZone: 'Premium' | 'Discount' | 'Equilibrium';
  rangePct: number;
  buyLowSellHigh: BuyLowSellHighResult | null;
  topSetup: StrategySetup | null;
  setupCount: number;
}

interface AnalyzeResponse {
  symbol: string;
  granularity: number;
  timeframe: string;
  source: string;
  error: string | null;
  lastUpdated: number | null;
  candlesCount: number;
  indicators: {
    close: number;
    ema9: number | null;
    ema20: number | null;
    ema50: number | null;
    ema200: number | null;
    rsi14: number | null;
    macd: { line: number | null; signal: number | null; histogram: number | null };
    bollinger: { upper: number | null; middle: number | null; lower: number | null; percentB: number | null };
    stochastic: { k: number | null; d: number | null };
    atr14: number | null;
    adx14: { adx: number | null; plusDi: number | null; minusDi: number | null };
    vwap: { available: boolean; reason: string | null; latest: number | null };
    psar: { value: number | null; trend: 'bullish' | 'bearish' | null };
  } | null;
  smc: SmcAnalysis | null;
  buyLowSellHigh: BuyLowSellHighResult | null;
  setups: StrategySetup[];
}

interface SessionsResponse {
  utcTime: string;
  sessions: Array<{
    name: string;
    openUtc: string;
    closeUtc: string;
    isOpen: boolean;
    focus: string;
  }>;
  derivTradingTimes: {
    source: string;
    error: string | null;
    markets: Array<{
      name: string;
      submarkets: Array<{
        name: string;
        symbolsCount: number;
        sampleSymbols: Array<{ symbol: string; name: string; tradingDays: string[] }>;
      }>;
    }>;
  };
  integrityNote: string;
}

const GRANULARITY_OPTIONS = [
  { label: '1m', value: 60 },
  { label: '5m', value: 300 },
  { label: '15m', value: 900 },
  { label: '30m', value: 1800 },
  { label: '1h', value: 3600 },
  { label: '4h', value: 14400 },
];

export const AnalysisToolPage: React.FC = () => {
  const {
    instruments,
    selectedSymbol,
    setSelectedSymbol,
    setActiveTab,
    accountMode,
    activeConnectedAccount,
    refreshOrders,
    refreshAll,
    showToast,
  } = useApp();

  const [tab, setTab] = useState<AnalyserTab>('radar');
  const [granularity, setGranularity] = useState(900);
  const [tickCount, setTickCount] = useState(100);
  const [prices, setPrices] = useState<number[]>([]);
  const [barrier, setBarrier] = useState(4);
  const [stake, setStake] = useState('5');
  const [executing, setExecuting] = useState(false);

  // Market Radar state
  const [radarLoading, setRadarLoading] = useState(false);
  const [radarError, setRadarError] = useState<string | null>(null);
  const [radarRows, setRadarRows] = useState<RadarInstrument[]>([]);
  const [radarScannedAt, setRadarScannedAt] = useState<string | null>(null);
  const [radarCatFilter, setRadarCatFilter] = useState<string>('All');
  const [radarSearch, setRadarSearch] = useState('');
  const [radarSort, setRadarSort] = useState<'setups' | 'volatility' | 'adx'>('setups');

  // SMC & Buy Low/Sell High analysis state
  const [analyzeLoading, setAnalyzeLoading] = useState(false);
  const [analyzeData, setAnalyzeData] = useState<AnalyzeResponse | null>(null);

  // Sessions state
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [sessionsData, setSessionsData] = useState<SessionsResponse | null>(null);
  const [utcNow, setUtcNow] = useState(() => new Date().toISOString().slice(11, 19));

  // Co-pilot state
  const [copilotPrompt, setCopilotPrompt] = useState(
    'Evaluate current SMC structure, indicator alignment, and Buy Low / Sell High regime with strict invalidation levels.'
  );
  const [copilotBusy, setCopilotBusy] = useState(false);
  const [copilotError, setCopilotError] = useState<string | null>(null);
  const [copilotAnswer, setCopilotAnswer] = useState<string | null>(null);
  const [copilotSummary, setCopilotSummary] = useState<any>(null);

  const activeInst = instruments.find((i) => i.symbol === selectedSymbol);
  const decimals = (activeInst?.pip_size ?? 0.01) < 0.0001 ? 5 : (activeInst?.pip_size ?? 0.01) < 0.001 ? 4 : 2;
  const isDigitStreamTab = tab === 'dcircles' || tab === 'signals' || tab === 'over-under' || tab === 'rise-fall';

  // Tick stream subscription for live spot & digit tabs
  useEffect(() => {
    let active = true;
    fetchDerivTickHistoryDirect(selectedSymbol, tickCount)
      .then((list) => {
        if (active && list.length) setPrices(list);
      })
      .catch(() => {});

    const unsub = subscribeDerivTicksDirect(selectedSymbol, (quote) => {
      if (!active) return;
      setPrices((prev) => [...prev.slice(-(tickCount - 1)), quote]);
    });

    return () => {
      active = false;
      unsub();
    };
  }, [selectedSymbol, tickCount]);

  // Live UTC clock for Sessions tab
  useEffect(() => {
    const timer = setInterval(() => {
      setUtcNow(new Date().toISOString().slice(11, 19));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const radarReqRef = useRef(0);
  const analyzeReqRef = useRef(0);

  const loadRadar = useCallback(async () => {
    const reqId = ++radarReqRef.current;
    setRadarLoading(true);
    setRadarError(null);
    try {
      const res = await apiFetch<{
        instruments: RadarInstrument[];
        scannedAt: string;
      }>(`/api/intelligence/radar?granularity=${granularity}&_t=${Date.now()}`, {
        skipAuth: true,
        cache: 'no-store',
      });
      if (radarReqRef.current !== reqId) return;
      setRadarRows(res.instruments || []);
      setRadarScannedAt(res.scannedAt || null);
    } catch (err) {
      if (radarReqRef.current !== reqId) return;
      setRadarError(sanitizeUiError(err, 'Unable to load Market Radar right now.'));
    } finally {
      if (radarReqRef.current === reqId) setRadarLoading(false);
    }
  }, [granularity]);

  const loadAnalyze = useCallback(async () => {
    const reqId = ++analyzeReqRef.current;
    setAnalyzeLoading(true);
    try {
      const res = await apiFetch<AnalyzeResponse>(
        `/api/intelligence/analyze?symbol=${encodeURIComponent(selectedSymbol)}&granularity=${granularity}&count=200&_t=${Date.now()}`,
        { skipAuth: true, cache: 'no-store' }
      );
      if (analyzeReqRef.current !== reqId) return;
      setAnalyzeData({
        ...res,
        error: res.error ? sanitizeUiError(res.error, 'Analysis temporarily unavailable.') : null,
      });
    } catch (err) {
      if (analyzeReqRef.current !== reqId) return;
      setAnalyzeData({
        symbol: selectedSymbol,
        granularity,
        timeframe: `${Math.round(granularity / 60)}m`,
        source: 'unavailable',
        error: sanitizeUiError(err, 'Analysis temporarily unavailable.'),
        lastUpdated: null,
        candlesCount: 0,
        indicators: null,
        smc: null,
        buyLowSellHigh: null,
        setups: [],
      });
    } finally {
      if (analyzeReqRef.current === reqId) setAnalyzeLoading(false);
    }
  }, [selectedSymbol, granularity]);

  const loadSessions = useCallback(async () => {
    setSessionsLoading(true);
    try {
      const res = await apiFetch<SessionsResponse>(`/api/intelligence/sessions?_t=${Date.now()}`, {
        skipAuth: true,
        cache: 'no-store',
      });
      setSessionsData(res);
    } catch {
      // ignore transient error
    } finally {
      setSessionsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (tab === 'radar') loadRadar();
    if (tab === 'smc' || tab === 'blsh') loadAnalyze();
    if (tab === 'sessions') loadSessions();
  }, [tab, loadRadar, loadAnalyze, loadSessions]);

  const analytics = useMemo(() => {
    const list = prices.length ? prices : [activeInst?.price ?? 0];
    const counts = Array(10).fill(0);
    const digits: number[] = [];
    let rises = 0;
    let falls = 0;

    list.forEach((p, idx) => {
      const str = p.toFixed(decimals);
      const d = Number(str[str.length - 1] || 0);
      digits.push(d);
      counts[d] += 1;
      if (idx > 0) {
        if (p >= list[idx - 1]) rises += 1;
        else falls += 1;
      }
    });

    const total = Math.max(1, digits.length);
    const dist = counts.map((c, d) => ({ digit: d, count: c, pct: Number(((c / total) * 100).toFixed(1)) }));
    const maxPct = Math.max(...dist.map((x) => x.pct));
    const minPct = Math.min(...dist.map((x) => x.pct));

    const overPct = Number(((digits.filter((d) => d > barrier).length / total) * 100).toFixed(1));
    const underPct = Number(((digits.filter((d) => d < barrier).length / total) * 100).toFixed(1));
    const evenPct = Number(((digits.filter((d) => d % 2 === 0).length / total) * 100).toFixed(1));
    const oddPct = Number((100 - evenPct).toFixed(1));
    const risePct = Number(((rises / Math.max(1, total - 1)) * 100).toFixed(1));
    const fallPct = Number(((falls / Math.max(1, total - 1)) * 100).toFixed(1));

    let gains = 0;
    let losses = 0;
    const pLen = Math.min(14, list.length - 1);
    for (let i = list.length - pLen; i < list.length; i++) {
      const diff = list[i] - list[i - 1];
      if (diff > 0) gains += diff;
      else losses += Math.abs(diff);
    }
    const rs = losses === 0 ? 100 : gains / losses;
    const rsi14 = Number((100 - 100 / (1 + rs)).toFixed(1));

    return {
      latestPrice: list[list.length - 1],
      lastDigit: digits[digits.length - 1],
      recentDigits: digits.slice(-20),
      dist,
      maxPct,
      minPct,
      overPct,
      underPct,
      evenPct,
      oddPct,
      risePct,
      fallPct,
      rsi14,
    };
  }, [prices, decimals, barrier, activeInst?.price]);

  const handleInstantTrade = async (
    contractType: string,
    customBarrier?: string,
    extra?: {
      symbolOverride?: string;
      strategyKey?: string;
      slPrice?: number | null;
      tpPrice?: number | null;
      duration?: number;
      durationUnit?: string;
    }
  ) => {
    setExecuting(true);
    const targetSymbol = extra?.symbolOverride || selectedSymbol;
    const isReal = accountMode === 'real';
    const rawUpper = String(contractType || '').toUpperCase().trim();
    const normalizedContractType =
      rawUpper === 'BUY' ? 'MULTUP' : rawUpper === 'SELL' ? 'MULTDOWN' : rawUpper || 'MULTUP';
    const isMultiplier = normalizedContractType === 'MULTUP' || normalizedContractType === 'MULTDOWN';
    try {
      await apiFetch('/api/orders', {
        method: 'POST',
        body: JSON.stringify({
          symbol: targetSymbol,
          side: contractType,
          contractType: normalizedContractType,
          stake: Number(stake) || 5,
          multiplier: 100,
          barrier: customBarrier,
          duration: isMultiplier ? undefined : extra?.duration ?? 5,
          durationUnit: isMultiplier ? undefined : extra?.durationUnit ?? 't',
          strategyKey: extra?.strategyKey,
          slPrice: extra?.slPrice ?? undefined,
          tpPrice: extra?.tpPrice ?? undefined,
          timeframe: GRANULARITY_OPTIONS.find((g) => g.value === granularity)?.label || '15m',
          accountMode,
          executionMode: isReal && activeConnectedAccount ? 'deriv' : 'virtual',
          connectedAccountId: activeConnectedAccount?.id || null,
        }),
      });
      await Promise.all([refreshOrders(), refreshAll()]);
      showToast(`Executed ${contractType} ($${stake}) on ${targetSymbol}`, 'success');
    } catch (err) {
      showToast(sanitizeUiError(err, 'Execution failed'), 'error');
    } finally {
      setExecuting(false);
    }
  };

  const handleRunCopilot = async (customQ?: string) => {
    const q = (customQ ?? copilotPrompt).trim();
    if (!q) return;
    setCopilotBusy(true);
    setCopilotError(null);
    try {
      const res = await apiFetch<{
        answer: string;
        model: string;
        groundedSummary: any;
      }>('/api/intelligence/copilot', {
        method: 'POST',
        body: JSON.stringify({
          symbol: selectedSymbol,
          granularity,
          prompt: q,
        }),
      });
      setCopilotAnswer(res.answer);
      setCopilotSummary(res.groundedSummary || null);
    } catch (err) {
      setCopilotError(sanitizeUiError(err, 'Market intelligence assistant is temporarily busy. Please try again.'));
    } finally {
      setCopilotBusy(false);
    }
  };

  const openInChart = (sym: string) => {
    setSelectedSymbol(sym);
    setActiveTab('mt5-tv');
    window.scrollTo({ top: 0, behavior: 'auto' });
  };

  const filteredRadar = useMemo(() => {
    const q = radarSearch.trim().toLowerCase();
    const list = radarRows.filter((row) => {
      if (radarCatFilter !== 'All' && row.category !== radarCatFilter) return false;
      if (q && !row.symbol.toLowerCase().includes(q) && !row.displayName.toLowerCase().includes(q)) return false;
      return true;
    });
    return [...list].sort((a, b) => {
      if (radarSort === 'volatility') return (b.volatilityPct ?? -1) - (a.volatilityPct ?? -1);
      if (radarSort === 'adx') return (b.trendStrengthAdx ?? -1) - (a.trendStrengthAdx ?? -1);
      return (b.topSetup?.confidenceScore ?? 0) - (a.topSetup?.confidenceScore ?? 0) || b.setupCount - a.setupCount;
    });
  }, [radarRows, radarCatFilter, radarSearch, radarSort]);

  const radarCategories = useMemo(() => {
    const set = new Set<string>(['All']);
    radarRows.forEach((r) => set.add(r.category));
    return Array.from(set);
  }, [radarRows]);

  const tabItems: Array<{ id: AnalyserTab; label: string }> = [
    { id: 'radar', label: 'Market Radar' },
    { id: 'smc', label: 'SMC & Structure' },
    { id: 'blsh', label: 'Buy Low / Sell High' },
    { id: 'sessions', label: 'Sessions & Schedule' },
    { id: 'copilot', label: 'AI Co-Pilot' },
    { id: 'dcircles', label: 'Dcircles (0–9)' },
    { id: 'signals', label: 'Signals & RSI(14)' },
    { id: 'over-under', label: 'Over / Under' },
    { id: 'rise-fall', label: 'Rise / Fall' },
  ];

  const symbolOptions = isDigitStreamTab ? instruments.filter((i) => i.category === 'Synthetic') : instruments;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-8 py-6 space-y-6">
      {/* Header Controls */}
      <div className="bg-[#151820] text-white rounded-3xl p-5 sm:p-6 flex flex-wrap items-center justify-between gap-4 border border-[#2A2F3D]">
        <div>
          <div className="flex items-center gap-2 text-xs text-[#00A878] font-semibold mb-1">
            <Activity className="w-4 h-4" /> Real-Time Deriv Quant & Tick Intelligence
          </div>
          <h1 className="font-display text-2xl font-bold">Market Intelligence Hub</h1>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <select
            value={selectedSymbol}
            onChange={(e) => setSelectedSymbol(e.target.value)}
            className="px-3.5 py-2 rounded-xl bg-[#1A1D26] border border-[#2A2F3D] text-sm font-semibold"
          >
            {symbolOptions.map((inst) => (
              <option key={inst.symbol} value={inst.symbol}>
                {inst.display_name} ({inst.symbol})
              </option>
            ))}
          </select>

          {!isDigitStreamTab ? (
            <div className="flex items-center bg-[#1A1D26] border border-[#2A2F3D] rounded-xl p-1 gap-0.5">
              {GRANULARITY_OPTIONS.map((g) => (
                <button
                  key={g.value}
                  type="button"
                  onClick={() => setGranularity(g.value)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-mono font-semibold cursor-pointer whitespace-nowrap ${
                    granularity === g.value ? 'bg-[#FF444F] text-white' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {g.label}
                </button>
              ))}
            </div>
          ) : (
            <select
              value={tickCount}
              onChange={(e) => setTickCount(Number(e.target.value))}
              className="px-3 py-2 rounded-xl bg-[#1A1D26] border border-[#2A2F3D] font-mono tabular-nums text-xs font-bold"
            >
              {[50, 100, 250, 500].map((c) => (
                <option key={c} value={c}>
                  {c} Ticks
                </option>
              ))}
            </select>
          )}

          <div className="px-4 py-2 rounded-xl bg-[#1A1D26] border border-[#2A2F3D] font-mono tabular-nums">
            <span className="text-[10px] text-slate-400 mr-2">Spot</span>
            <strong className="text-sm">{analytics.latestPrice.toFixed(decimals)}</strong>
          </div>
        </div>
      </div>

      {/* Sub-Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
        {tabItems.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 rounded-xl text-xs font-semibold cursor-pointer whitespace-nowrap shrink-0 transition-colors ${
              tab === t.id
                ? 'bg-[#FF444F] text-white'
                : 'bg-[#F4F5F7] dark:bg-[#181C25] text-slate-700 dark:text-slate-300 border border-slate-200/80 dark:border-[#2A2F3D]'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* 1. MARKET RADAR */}
      {tab === 'radar' && (
        <div className="space-y-4">
          <div className="bg-white dark:bg-[#181C25] rounded-2xl border border-slate-200 dark:border-[#2A2F3D] p-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={radarSearch}
                  onChange={(e) => setRadarSearch(e.target.value)}
                  placeholder="Filter symbol..."
                  className="pl-8 pr-3 py-1.5 rounded-xl bg-[#F4F5F7] dark:bg-[#111319] border border-slate-200 dark:border-[#2A2F3D] text-xs"
                />
              </div>
              <div className="flex items-center gap-1 bg-[#F4F5F7] dark:bg-[#111319] p-1 rounded-xl">
                {radarCategories.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setRadarCatFilter(c)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold cursor-pointer whitespace-nowrap ${
                      radarCatFilter === c
                        ? 'bg-white dark:bg-[#181C25] text-[#0E1117] dark:text-white shadow-sm'
                        : 'text-slate-500'
                    }`}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <select
                value={radarSort}
                onChange={(e) => setRadarSort(e.target.value as any)}
                className="px-3 py-1.5 rounded-xl bg-[#F4F5F7] dark:bg-[#111319] border border-slate-200 dark:border-[#2A2F3D] text-xs font-semibold"
              >
                <option value="setups">Rank by Active Setup Score</option>
                <option value="volatility">Rank by ATR Volatility %</option>
                <option value="adx">Rank by ADX Trend Strength</option>
              </select>
              <button
                type="button"
                onClick={loadRadar}
                disabled={radarLoading}
                className="px-3.5 py-1.5 rounded-xl bg-[#151820] dark:bg-[#FF444F] text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${radarLoading ? 'animate-spin' : ''}`} />
                {radarLoading ? 'Scanning...' : 'Rescan Deriv'}
              </button>
            </div>
          </div>

          {radarError && (
            <div className="p-4 rounded-2xl bg-[#FF444F]/10 border border-[#FF444F]/30 text-xs text-[#FF444F] font-semibold flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" /> {radarError}
            </div>
          )}

          <div className="bg-white dark:bg-[#181C25] rounded-2xl border border-slate-200 dark:border-[#2A2F3D] overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 dark:border-[#2A2F3D] flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
              <span className="flex items-center gap-1.5 font-semibold text-[#0E1117] dark:text-white">
                <Radar className="w-4 h-4 text-[#FF444F]" /> Live Multi-Market Quant Scanner
              </span>
              <span>
                {radarScannedAt ? `Scanned ${new Date(radarScannedAt).toLocaleTimeString()}` : 'Real Deriv OHLC scan'}
              </span>
            </div>

            {radarLoading && radarRows.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500">Scanning live Deriv instruments...</div>
            ) : filteredRadar.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500">No instruments match current filter.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-slate-100 dark:border-[#2A2F3D] text-slate-500">
                      <th className="text-left px-4 py-3 font-semibold">Instrument</th>
                      <th className="text-right px-4 py-3 font-semibold">Spot</th>
                      <th className="text-right px-4 py-3 font-semibold">ATR Vol %</th>
                      <th className="text-right px-4 py-3 font-semibold">ADX(14)</th>
                      <th className="text-right px-4 py-3 font-semibold">RSI(14)</th>
                      <th className="text-left px-4 py-3 font-semibold">SMC / Range</th>
                      <th className="text-left px-4 py-3 font-semibold">Buy Low / Sell High</th>
                      <th className="text-left px-4 py-3 font-semibold">Top Setup</th>
                      <th className="text-right px-4 py-3 font-semibold">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-[#2A2F3D]">
                    {filteredRadar.map((row) => (
                      <tr key={row.symbol} className="hover:bg-[#F8F9FB] dark:hover:bg-[#111319]/60">
                        <td className="px-4 py-3">
                          <button
                            type="button"
                            onClick={() => openInChart(row.symbol)}
                            className="text-left group cursor-pointer"
                          >
                            <div className="font-bold text-[#0E1117] dark:text-white group-hover:text-[#FF444F] transition-colors">
                              {row.displayName}
                            </div>
                            <div className="text-[11px] text-slate-500 font-mono tabular-nums">
                              {row.symbol} · {row.category}
                            </div>
                          </button>
                        </td>
                        <td className="px-4 py-3 text-right font-mono tabular-nums font-bold">
                          {row.price !== null ? row.price.toFixed(row.price < 10 ? 4 : 2) : 'Unavailable'}
                        </td>
                        <td className="px-4 py-3 text-right font-mono tabular-nums">
                          {row.volatilityPct !== null ? `${row.volatilityPct.toFixed(3)}%` : '—'}
                        </td>
                        <td className="px-4 py-3 text-right font-mono tabular-nums">
                          {row.trendStrengthAdx !== null ? row.trendStrengthAdx.toFixed(1) : '—'}
                        </td>
                        <td
                          className={`px-4 py-3 text-right font-mono tabular-nums font-semibold ${
                            (row.rsi14 ?? 50) >= 70
                              ? 'text-[#FF444F]'
                              : (row.rsi14 ?? 50) <= 30
                                ? 'text-[#00A878]'
                                : ''
                          }`}
                        >
                          {row.rsi14 !== null ? row.rsi14.toFixed(1) : '—'}
                        </td>
                        <td className="px-4 py-3">
                          <div
                            className={`font-semibold capitalize ${
                              row.smcBias === 'bullish'
                                ? 'text-[#00A878]'
                                : row.smcBias === 'bearish'
                                  ? 'text-[#FF444F]'
                                  : 'text-slate-500'
                            }`}
                          >
                            {row.smcBias} · {row.dealingZone}
                          </div>
                          <div className="text-[11px] text-slate-500 font-mono tabular-nums">
                            Range {row.rangePct.toFixed(0)}%
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          {row.error ? (
                            <span className="text-amber-600 dark:text-amber-400">{row.error}</span>
                          ) : row.buyLowSellHigh ? (
                            <div>
                              <span
                                className={`font-semibold ${
                                  row.buyLowSellHigh.action === 'BUY_LOW_CANDIDATE'
                                    ? 'text-[#00A878]'
                                    : row.buyLowSellHigh.action === 'SELL_HIGH_CANDIDATE'
                                      ? 'text-[#FF444F]'
                                      : row.buyLowSellHigh.action === 'WAIT_AVOID_KNIFE'
                                        ? 'text-amber-600 dark:text-amber-400'
                                        : 'text-slate-500'
                                }`}
                              >
                                {row.buyLowSellHigh.action.replace(/_/g, ' ')}
                              </span>
                              <div className="text-[11px] text-slate-500 truncate max-w-[180px]">
                                {row.buyLowSellHigh.regimeLabel}
                              </div>
                            </div>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {row.topSetup ? (
                            <div>
                              <div className="font-semibold">
                                <span
                                  className={
                                    row.topSetup.direction === 'BUY' ? 'text-[#00A878]' : 'text-[#FF444F]'
                                  }
                                >
                                  {row.topSetup.direction}
                                </span>{' '}
                                · {row.topSetup.strategyName}
                              </div>
                              <div className="text-[11px] text-slate-500 font-mono tabular-nums">
                                Score {row.topSetup.confidenceScore}/100 · R:R {row.topSetup.riskReward}:1
                              </div>
                            </div>
                          ) : (
                            <span className="text-slate-400">No active trigger</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right whitespace-nowrap space-x-1.5">
                          <button
                            type="button"
                            onClick={() => openInChart(row.symbol)}
                            className="px-2.5 py-1.5 rounded-lg bg-[#1958B7]/10 text-[#1958B7] hover:bg-[#1958B7]/20 font-semibold cursor-pointer inline-flex items-center gap-1"
                          >
                            Chart <ArrowUpRight className="w-3 h-3" />
                          </button>
                          {row.topSetup && (
                            <button
                              type="button"
                              disabled={executing}
                              onClick={() =>
                                handleInstantTrade(row.topSetup!.direction, undefined, {
                                  symbolOverride: row.symbol,
                                  strategyKey: row.topSetup!.strategyKey,
                                  slPrice: row.topSetup!.stopLoss,
                                  tpPrice: row.topSetup!.takeProfit,
                                  duration: 15,
                                  durationUnit: 'm',
                                })
                              }
                              className={`px-2.5 py-1.5 rounded-lg text-white font-semibold cursor-pointer ${
                                row.topSetup.direction === 'BUY'
                                  ? 'bg-[#00A878] hover:bg-[#00966B]'
                                  : 'bg-[#FF444F] hover:bg-[#E63946]'
                              }`}
                            >
                              Execute {row.topSetup.direction}
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 2. SMC & MARKET STRUCTURE */}
      {tab === 'smc' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm font-bold">
              <Layers className="w-4 h-4 text-[#FF444F]" />
              Smart Money Concepts & Structural Liquidity ({selectedSymbol})
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={loadAnalyze}
                disabled={analyzeLoading}
                className="px-3.5 py-1.5 rounded-xl bg-[#F4F5F7] dark:bg-[#181C25] border border-slate-200 dark:border-[#2A2F3D] text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${analyzeLoading ? 'animate-spin' : ''}`} /> Refresh
              </button>
              <button
                type="button"
                onClick={() => openInChart(selectedSymbol)}
                className="px-3.5 py-1.5 rounded-xl bg-[#FF444F] text-white text-xs font-semibold flex items-center gap-1 cursor-pointer"
              >
                Open Chart Overlay <ArrowUpRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {analyzeLoading && !analyzeData ? (
            <div className="p-8 rounded-2xl bg-white dark:bg-[#181C25] border border-slate-200 dark:border-[#2A2F3D] text-center text-xs text-slate-500">
              Computing SMC structure from real Deriv candles...
            </div>
          ) : analyzeData?.error || !analyzeData?.smc ? (
            <div className="p-5 rounded-2xl bg-[#FF444F]/10 border border-[#FF444F]/30 text-xs text-[#FF444F] font-semibold">
              {analyzeData?.error || 'Real historical candles unavailable for SMC computation.'}
            </div>
          ) : (
            <div className="space-y-4">
              {/* Top Dealing Range & Bias Summary */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="p-4 rounded-2xl bg-white dark:bg-[#181C25] border border-slate-200 dark:border-[#2A2F3D]">
                  <p className="text-xs text-slate-500">Structural Bias</p>
                  <p
                    className={`font-display text-xl font-bold capitalize mt-1 ${
                      analyzeData.smc.bias === 'bullish'
                        ? 'text-[#00A878]'
                        : analyzeData.smc.bias === 'bearish'
                          ? 'text-[#FF444F]'
                          : ''
                    }`}
                  >
                    {analyzeData.smc.bias}
                  </p>
                  <p className="text-[11px] text-slate-500 mt-1 font-mono tabular-nums">
                    {analyzeData.smc.displacementCount} displacement impulses
                  </p>
                </div>

                <div className="p-4 rounded-2xl bg-white dark:bg-[#181C25] border border-slate-200 dark:border-[#2A2F3D] md:col-span-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-500">Dealing Range (Discount vs Premium)</span>
                    <span className="font-mono tabular-nums font-bold">
                      {analyzeData.smc.dealingRange.zone} ({analyzeData.smc.dealingRange.currentPct.toFixed(1)}%)
                    </span>
                  </div>
                  <div className="mt-3 h-2.5 rounded-full bg-slate-200 dark:bg-[#111319] overflow-hidden relative">
                    <div
                      className="h-full bg-gradient-to-r from-[#00A878] via-slate-400 to-[#FF444F]"
                      style={{ width: '100%' }}
                    />
                    <div
                      className="w-3 h-3 rounded-full bg-white border-2 border-[#0E1117] absolute top-1/2 -translate-y-1/2 -translate-x-1/2"
                      style={{ left: `${Math.min(98, Math.max(2, analyzeData.smc.dealingRange.currentPct))}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-[11px] font-mono tabular-nums text-slate-500 mt-2">
                    <span>Low: {analyzeData.smc.dealingRange.low.toFixed(decimals)}</span>
                    <span>EQ: {analyzeData.smc.dealingRange.equilibrium.toFixed(decimals)}</span>
                    <span>High: {analyzeData.smc.dealingRange.high.toFixed(decimals)}</span>
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-white dark:bg-[#181C25] border border-slate-200 dark:border-[#2A2F3D]">
                  <p className="text-xs text-slate-500">Clustered S/R Levels</p>
                  <div className="mt-1 space-y-1 font-mono tabular-nums text-xs">
                    <div className="text-[#FF444F]">
                      R:{' '}
                      {analyzeData.smc.resistanceLevels.length
                        ? analyzeData.smc.resistanceLevels.slice(0, 2).map((v) => v.toFixed(decimals)).join(' · ')
                        : '—'}
                    </div>
                    <div className="text-[#00A878]">
                      S:{' '}
                      {analyzeData.smc.supportLevels.length
                        ? analyzeData.smc.supportLevels.slice(0, 2).map((v) => v.toFixed(decimals)).join(' · ')
                        : '—'}
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {/* Structure Events BOS / CHoCH */}
                <div className="bg-white dark:bg-[#181C25] rounded-2xl border border-slate-200 dark:border-[#2A2F3D] p-4 space-y-2.5">
                  <h2 className="font-display text-sm font-bold">BOS / CHoCH & Swing Labels</h2>
                  {analyzeData.smc.structureEvents.length === 0 ? (
                    <p className="text-xs text-slate-500">No recent structure breaks.</p>
                  ) : (
                    <div className="divide-y divide-slate-100 dark:divide-[#2A2F3D]">
                      {analyzeData.smc.structureEvents
                        .slice(-8)
                        .reverse()
                        .map((ev, idx) => (
                          <div key={idx} className="py-2 flex items-center justify-between text-xs">
                            <div>
                              <span
                                className={`font-bold ${
                                  ev.direction === 'bullish' ? 'text-[#00A878]' : 'text-[#FF444F]'
                                }`}
                              >
                                {ev.type} ({ev.direction})
                              </span>
                              <p className="text-[11px] text-slate-500">{ev.description}</p>
                            </div>
                            <span className="font-mono tabular-nums text-[11px] text-slate-400">
                              {new Date(ev.time * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                        ))}
                    </div>
                  )}
                </div>

                {/* Unmitigated Order Blocks, FVGs, Supply & Demand */}
                <div className="bg-white dark:bg-[#181C25] rounded-2xl border border-slate-200 dark:border-[#2A2F3D] p-4 space-y-2.5">
                  <h2 className="font-display text-sm font-bold">Unmitigated Zones (OB · FVG · S/D)</h2>
                  {analyzeData.smc.zones.filter((z) => !z.mitigated).length === 0 ? (
                    <p className="text-xs text-slate-500">No active unmitigated zones in current lookback.</p>
                  ) : (
                    <div className="divide-y divide-slate-100 dark:divide-[#2A2F3D]">
                      {analyzeData.smc.zones
                        .filter((z) => !z.mitigated)
                        .slice(-8)
                        .reverse()
                        .map((z) => (
                          <div key={z.id} className="py-2 flex items-center justify-between text-xs">
                            <div>
                              <span className={`font-bold ${z.bias === 'bullish' ? 'text-[#00A878]' : 'text-[#FF444F]'}`}>
                                {z.label}
                              </span>
                              <p className="text-[11px] text-slate-500 capitalize">{z.kind.replace('_', ' ')} · Active</p>
                            </div>
                            <span className="font-mono tabular-nums font-semibold">
                              {z.bottom.toFixed(decimals)} – {z.top.toFixed(decimals)}
                            </span>
                          </div>
                        ))}
                    </div>
                  )}
                </div>

                {/* Liquidity Sweeps & Strategy Setups */}
                <div className="bg-white dark:bg-[#181C25] rounded-2xl border border-slate-200 dark:border-[#2A2F3D] p-4 space-y-2.5">
                  <h2 className="font-display text-sm font-bold">Liquidity Sweeps & Active Setups</h2>
                  <div className="divide-y divide-slate-100 dark:divide-[#2A2F3D]">
                    {analyzeData.smc.liquidityEvents
                      .slice(-4)
                      .reverse()
                      .map((l, idx) => (
                        <div key={idx} className="py-2 flex items-center justify-between text-xs">
                          <div>
                            <span className="font-bold text-amber-600 dark:text-amber-400">
                              {l.kind.replace('_', ' ')}
                            </span>
                            <p className="text-[11px] text-slate-500">{l.description}</p>
                          </div>
                          <span className="font-mono tabular-nums">{l.price.toFixed(decimals)}</span>
                        </div>
                      ))}
                    {analyzeData.setups.slice(0, 3).map((s) => (
                      <div key={s.strategyKey} className="py-2 flex items-center justify-between text-xs">
                        <div>
                          <span className={`font-bold ${s.direction === 'BUY' ? 'text-[#00A878]' : 'text-[#FF444F]'}`}>
                            {s.direction} · {s.strategyName}
                          </span>
                          <p className="text-[11px] text-slate-500 font-mono tabular-nums">
                            SL {s.stopLoss.toFixed(decimals)} · TP {s.takeProfit.toFixed(decimals)}
                          </p>
                        </div>
                        <span className="font-mono tabular-nums font-bold">{s.confidenceScore}/100</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 3. BUY LOW / SELL HIGH ENGINE */}
      {tab === 'blsh' && (
        <div className="space-y-4">
          {analyzeLoading && !analyzeData ? (
            <div className="p-8 rounded-2xl bg-white dark:bg-[#181C25] border border-slate-200 dark:border-[#2A2F3D] text-center text-xs text-slate-500">
              Evaluating Buy Low / Sell High regime...
            </div>
          ) : analyzeData?.error || !analyzeData?.buyLowSellHigh ? (
            <div className="p-5 rounded-2xl bg-[#FF444F]/10 border border-[#FF444F]/30 text-xs text-[#FF444F] font-semibold">
              {analyzeData?.error || 'Real historical candles unavailable.'}
            </div>
          ) : (
            <div className="bg-white dark:bg-[#181C25] rounded-2xl border border-slate-200 dark:border-[#2A2F3D] p-5 sm:p-6 space-y-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
                    <Target className="w-4 h-4 text-[#FF444F]" />
                    Regime-Filtered Mean Reversion Engine · {selectedSymbol} ({analyzeData.timeframe})
                  </div>
                  <h2
                    className={`font-display text-2xl font-bold mt-1 ${
                      analyzeData.buyLowSellHigh.action === 'BUY_LOW_CANDIDATE'
                        ? 'text-[#00A878]'
                        : analyzeData.buyLowSellHigh.action === 'SELL_HIGH_CANDIDATE'
                          ? 'text-[#FF444F]'
                          : analyzeData.buyLowSellHigh.action === 'WAIT_AVOID_KNIFE'
                            ? 'text-amber-600 dark:text-amber-400'
                            : ''
                    }`}
                  >
                    {analyzeData.buyLowSellHigh.action.replace(/_/g, ' ')} — {analyzeData.buyLowSellHigh.regimeLabel}
                  </h2>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => openInChart(selectedSymbol)}
                    className="px-4 py-2 rounded-xl border border-slate-200 dark:border-[#2A2F3D] text-xs font-semibold cursor-pointer"
                  >
                    Inspect on Chart
                  </button>
                  {(analyzeData.buyLowSellHigh.action === 'BUY_LOW_CANDIDATE' ||
                    analyzeData.buyLowSellHigh.action === 'SELL_HIGH_CANDIDATE') && (
                    <button
                      type="button"
                      disabled={executing}
                      onClick={() =>
                        handleInstantTrade(
                          analyzeData.buyLowSellHigh!.action === 'BUY_LOW_CANDIDATE' ? 'BUY' : 'SELL',
                          undefined,
                          {
                            strategyKey: 'buy_low_sell_high',
                            slPrice: analyzeData.buyLowSellHigh!.stopLoss,
                            tpPrice: analyzeData.buyLowSellHigh!.takeProfit,
                            duration: 15,
                            durationUnit: 'm',
                          }
                        )
                      }
                      className={`px-4 py-2 rounded-xl text-white text-xs font-bold cursor-pointer ${
                        analyzeData.buyLowSellHigh.action === 'BUY_LOW_CANDIDATE' ? 'bg-[#00A878]' : 'bg-[#FF444F]'
                      }`}
                    >
                      {analyzeData.buyLowSellHigh.action === 'BUY_LOW_CANDIDATE'
                        ? 'Execute BUY LOW'
                        : 'Execute SELL HIGH'}
                    </button>
                  )}
                </div>
              </div>

              {analyzeData.buyLowSellHigh.action === 'WAIT_AVOID_KNIFE' && (
                <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-700 dark:text-amber-300 flex items-center gap-2 font-semibold">
                  <ShieldAlert className="w-4 h-4 shrink-0" />
                  Falling-Knife / Parabolic Extension Guard Active: Trend impulse is still expanding against counter-trend entry. Wait for reversal confirmation.
                </div>
              )}

              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <div className="p-3.5 rounded-xl bg-[#F8F9FB] dark:bg-[#111319]">
                  <p className="text-[11px] text-slate-500">Range Percentile</p>
                  <p className="font-mono tabular-nums text-lg font-bold mt-0.5">
                    {analyzeData.buyLowSellHigh.rangePercentile.toFixed(1)}%
                  </p>
                </div>
                <div className="p-3.5 rounded-xl bg-[#F8F9FB] dark:bg-[#111319]">
                  <p className="text-[11px] text-slate-500">RSI(14) & Divergence</p>
                  <p className="font-mono tabular-nums text-lg font-bold mt-0.5">
                    {analyzeData.buyLowSellHigh.rsi14?.toFixed(1) ?? '—'} ·{' '}
                    <span className="capitalize text-xs">{analyzeData.buyLowSellHigh.rsiDivergence}</span>
                  </p>
                </div>
                <div className="p-3.5 rounded-xl bg-[#F8F9FB] dark:bg-[#111319]">
                  <p className="text-[11px] text-slate-500">Heuristic Score</p>
                  <p className="font-mono tabular-nums text-lg font-bold mt-0.5">
                    {analyzeData.buyLowSellHigh.confidenceScore}/100
                  </p>
                </div>
                <div className="p-3.5 rounded-xl bg-[#F8F9FB] dark:bg-[#111319]">
                  <p className="text-[11px] text-slate-500">Invalidation / SL</p>
                  <p className="font-mono tabular-nums text-lg font-bold mt-0.5 text-[#FF444F]">
                    {analyzeData.buyLowSellHigh.stopLoss !== null
                      ? analyzeData.buyLowSellHigh.stopLoss.toFixed(decimals)
                      : '—'}
                  </p>
                </div>
                <div className="p-3.5 rounded-xl bg-[#F8F9FB] dark:bg-[#111319]">
                  <p className="text-[11px] text-slate-500">Target / R:R</p>
                  <p className="font-mono tabular-nums text-lg font-bold mt-0.5 text-[#00A878]">
                    {analyzeData.buyLowSellHigh.takeProfit !== null
                      ? `${analyzeData.buyLowSellHigh.takeProfit.toFixed(decimals)} (${analyzeData.buyLowSellHigh.riskReward ?? 1}:1)`
                      : '—'}
                  </p>
                </div>
              </div>

              <div className="space-y-1.5">
                <p className="text-xs font-semibold text-slate-500">Rule Evaluation & Confluence Notes</p>
                <ul className="space-y-1 text-xs text-slate-700 dark:text-slate-300 list-disc pl-5">
                  {analyzeData.buyLowSellHigh.reasoning.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              </div>

              <p className="text-[11px] text-slate-500 border-t border-slate-100 dark:border-[#2A2F3D] pt-3">
                {analyzeData.buyLowSellHigh.disclaimer}
              </p>
            </div>
          )}
        </div>
      )}

      {/* 4. SESSIONS & DERIV SCHEDULE */}
      {tab === 'sessions' && (
        <div className="space-y-4">
          <div className="bg-white dark:bg-[#181C25] rounded-2xl border border-slate-200 dark:border-[#2A2F3D] p-5 flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="font-display text-lg font-bold flex items-center gap-2">
                <Clock className="w-5 h-5 text-[#FF444F]" /> Global Liquidity Windows & Deriv Trading Times
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">{sessionsData?.integrityNote}</p>
            </div>
            <div className="px-4 py-2 rounded-xl bg-[#151820] text-white font-mono tabular-nums text-sm font-bold">
              UTC {utcNow}
            </div>
          </div>

          {sessionsLoading && !sessionsData ? (
            <div className="p-8 text-center text-xs text-slate-500">Fetching live Deriv trading_times...</div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                {(sessionsData?.sessions || []).map((s) => (
                  <div
                    key={s.name}
                    className={`p-4 rounded-2xl border ${
                      s.isOpen
                        ? 'bg-[#00A878]/5 border-[#00A878]/40'
                        : 'bg-white dark:bg-[#181C25] border-slate-200 dark:border-[#2A2F3D]'
                    }`}
                  >
                    <div className="flex items-center justify-between text-xs font-bold">
                      <span>{s.name}</span>
                      <span className={s.isOpen ? 'text-[#00A878]' : 'text-slate-400'}>
                        {s.isOpen ? 'OPEN' : 'CLOSED'}
                      </span>
                    </div>
                    <p className="font-mono tabular-nums text-xs text-slate-500 mt-1">
                      {s.openUtc} – {s.closeUtc}
                    </p>
                    <p className="text-[11px] text-slate-500 mt-2">{s.focus}</p>
                  </div>
                ))}
              </div>

              {sessionsData?.derivTradingTimes.error ? (
                <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-600 dark:text-amber-300">
                  Deriv trading_times feed: {sessionsData.derivTradingTimes.error}
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {(sessionsData?.derivTradingTimes.markets || []).map((m) => (
                    <div
                      key={m.name}
                      className="bg-white dark:bg-[#181C25] rounded-2xl border border-slate-200 dark:border-[#2A2F3D] p-4 space-y-2"
                    >
                      <h3 className="font-display text-sm font-bold">{m.name}</h3>
                      <div className="divide-y divide-slate-100 dark:divide-[#2A2F3D]">
                        {m.submarkets.map((sm) => (
                          <div key={sm.name} className="py-2 text-xs">
                            <div className="flex justify-between font-semibold">
                              <span>{sm.name}</span>
                              <span className="font-mono tabular-nums text-slate-400">{sm.symbolsCount} symbols</span>
                            </div>
                            <p className="text-[11px] text-slate-500 mt-0.5">
                              {sm.sampleSymbols.map((s) => s.name).join(' · ')}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* 5. EMBEDDED AI CO-PILOT */}
      {tab === 'copilot' && (
        <div className="bg-white dark:bg-[#181C25] rounded-2xl border border-slate-200 dark:border-[#2A2F3D] p-5 sm:p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-lg font-bold flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-[#FF444F]" /> TradeDeriv Grounded AI Co-Pilot
              </h2>
              <p className="text-xs text-slate-500">
                Institutional quantitative analysis grounded strictly in live Deriv candles, SMC zones, risk rules, and open positions.
              </p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {[
                'Full multi-indicator + SMC breakdown & invalidation',
                'Check Buy Low / Sell High risk & falling-knife guard',
                'Review my open positions vs daily risk limits',
              ].map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => {
                    setCopilotPrompt(preset);
                    handleRunCopilot(preset);
                  }}
                  className="px-3 py-1.5 rounded-xl bg-[#F4F5F7] dark:bg-[#111319] hover:border-[#FF444F] border border-slate-200 dark:border-[#2A2F3D] text-xs font-medium cursor-pointer"
                >
                  {preset}
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-2">
            <input
              type="text"
              value={copilotPrompt}
              onChange={(e) => setCopilotPrompt(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleRunCopilot()}
              placeholder="Ask about structure, RSI/MACD confluence, invalidation, or position risk..."
              className="flex-1 px-4 py-2.5 rounded-xl bg-[#F4F5F7] dark:bg-[#111319] border border-slate-200 dark:border-[#2A2F3D] text-sm"
            />
            <button
              type="button"
              disabled={copilotBusy}
              onClick={() => handleRunCopilot()}
              className="px-5 py-2.5 rounded-xl bg-[#FF444F] hover:bg-[#E63946] text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
            >
              <Send className="w-3.5 h-3.5" /> {copilotBusy ? 'Analyzing...' : 'Analyze'}
            </button>
          </div>

          {copilotError && (
            <div className="p-3.5 rounded-xl bg-[#FF444F]/10 border border-[#FF444F]/30 text-xs text-[#FF444F] font-semibold">
              {copilotError}
            </div>
          )}

          {copilotSummary && (
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 p-3 rounded-xl bg-[#F8F9FB] dark:bg-[#111319] text-xs font-mono tabular-nums">
              <div>
                <span className="text-[10px] text-slate-400 block">SMC Bias</span>
                <strong className="capitalize">{copilotSummary.bias}</strong>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 block">Zone</span>
                <strong>
                  {copilotSummary.dealingZone} ({Number(copilotSummary.rangePct || 0).toFixed(0)}%)
                </strong>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 block">RSI(14)</span>
                <strong>{copilotSummary.rsi14 !== null ? Number(copilotSummary.rsi14).toFixed(1) : '—'}</strong>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 block">ADX(14)</span>
                <strong>{copilotSummary.adx !== null ? Number(copilotSummary.adx).toFixed(1) : '—'}</strong>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 block">BLSH Signal</span>
                <strong>{String(copilotSummary.buyLowSellHighAction || '').replace(/_/g, ' ')}</strong>
              </div>
            </div>
          )}

          {copilotAnswer && (
            <div className="p-4 rounded-2xl bg-[#F8F9FB] dark:bg-[#111319] border border-slate-200 dark:border-[#2A2F3D] text-xs leading-relaxed whitespace-pre-wrap">
              {copilotAnswer}
            </div>
          )}
        </div>
      )}

      {/* 6. DCIRCLES 0–9 CIRCULAR HEATMAP */}
      {tab === 'dcircles' && (
        <div className="bg-white dark:bg-[#181C25] rounded-2xl border border-slate-200 dark:border-[#2A2F3D] p-5 space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-5 lg:grid-cols-10 gap-3">
            {analytics.dist.map((item) => {
              const isHot = item.pct === analytics.maxPct;
              const isCold = item.pct === analytics.minPct;
              const isLast = item.digit === analytics.lastDigit;
              return (
                <div
                  key={item.digit}
                  className={`p-3 rounded-2xl border flex flex-col items-center justify-center transition-all ${
                    isHot
                      ? 'border-[#00A878] bg-[#00A878]/10'
                      : isCold
                        ? 'border-[#FF444F] bg-[#FF444F]/10'
                        : 'border-slate-200 dark:border-[#2A2F3D] bg-[#F8F9FB] dark:bg-[#111319]'
                  }`}
                >
                  <div
                    className={`w-12 h-12 rounded-full flex items-center justify-center font-mono tabular-nums text-lg font-bold border-2 ${
                      isLast
                        ? 'border-[#FF444F] bg-[#151820] text-white'
                        : isHot
                          ? 'border-[#00A878] text-[#00A878]'
                          : isCold
                            ? 'border-[#FF444F] text-[#FF444F]'
                            : 'border-slate-300 dark:border-[#2A2F3D]'
                    }`}
                  >
                    {item.digit}
                  </div>
                  <p className="font-mono tabular-nums text-xs font-bold mt-2">{item.pct}%</p>
                  <p className="text-[10px] text-slate-400">
                    {isHot ? 'Hottest' : isCold ? 'Coldest' : `${item.count}x`}
                  </p>
                </div>
              );
            })}
          </div>

          <div>
            <p className="text-xs font-semibold text-slate-500 mb-2">Recent 20 Last Digits</p>
            <div className="flex flex-wrap gap-1.5">
              {analytics.recentDigits.map((d, i) => (
                <span
                  key={i}
                  className={`w-8 h-8 rounded-lg font-mono tabular-nums text-xs font-bold flex items-center justify-center ${
                    d % 2 === 0 ? 'bg-[#00A878]/15 text-[#00A878]' : 'bg-[#FF444F]/15 text-[#FF444F]'
                  }`}
                >
                  {d}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 7. SIGNALS & RSI(14) */}
      {tab === 'signals' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white dark:bg-[#181C25] rounded-2xl border border-slate-200 dark:border-[#2A2F3D] p-5">
            <p className="text-xs text-slate-500">RSI (14) Momentum</p>
            <p className="font-mono tabular-nums text-3xl font-bold mt-1">{analytics.rsi14}</p>
            <p className="text-xs mt-2 font-semibold text-[#00A878]">
              {analytics.rsi14 > 70
                ? 'Overbought (PUT Bias)'
                : analytics.rsi14 < 30
                  ? 'Oversold (CALL Bias)'
                  : 'Neutral Equilibrium'}
            </p>
          </div>
          <div className="bg-white dark:bg-[#181C25] rounded-2xl border border-slate-200 dark:border-[#2A2F3D] p-5">
            <p className="text-xs text-slate-500">Even / Odd Parity</p>
            <p className="font-mono tabular-nums text-2xl font-bold mt-1">
              {analytics.evenPct}% / {analytics.oddPct}%
            </p>
            <div className="h-2 rounded-full bg-[#FF444F]/25 overflow-hidden mt-3">
              <div className="h-full bg-[#00A878]" style={{ width: `${analytics.evenPct}%` }} />
            </div>
          </div>
          <div className="bg-white dark:bg-[#181C25] rounded-2xl border border-slate-200 dark:border-[#2A2F3D] p-5">
            <p className="text-xs text-slate-500">1-Click Execution Stake ($)</p>
            <input
              type="number"
              min="1"
              value={stake}
              onChange={(e) => setStake(e.target.value)}
              className="w-full mt-2 px-3 py-2 rounded-xl bg-[#F4F5F7] dark:bg-[#111319] font-mono tabular-nums text-sm font-bold"
            />
            <div className="grid grid-cols-2 gap-2 mt-3">
              <button
                type="button"
                disabled={executing}
                onClick={() => handleInstantTrade('DIGITEVEN')}
                className="py-2 rounded-full bg-[#00A878] text-white text-xs font-bold cursor-pointer"
              >
                Trade EVEN
              </button>
              <button
                type="button"
                disabled={executing}
                onClick={() => handleInstantTrade('DIGITODD')}
                className="py-2 rounded-full bg-[#FF444F] text-white text-xs font-bold cursor-pointer"
              >
                Trade ODD
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 8. OVER / UNDER */}
      {tab === 'over-under' && (
        <div className="bg-white dark:bg-[#181C25] rounded-2xl border border-slate-200 dark:border-[#2A2F3D] p-5 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs text-slate-500 mb-2">Select Barrier Digit (0–9)</p>
              <div className="flex gap-1.5 flex-wrap">
                {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setBarrier(d)}
                    className={`w-9 h-9 rounded-xl font-mono tabular-nums text-sm font-bold cursor-pointer ${
                      barrier === d ? 'bg-[#151820] text-white dark:bg-white dark:text-[#151820]' : 'bg-[#F4F5F7] dark:bg-[#111319]'
                    }`}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="number"
                min="1"
                value={stake}
                onChange={(e) => setStake(e.target.value)}
                className="w-24 px-3 py-2 rounded-xl bg-[#F4F5F7] dark:bg-[#111319] font-mono tabular-nums text-sm font-bold"
              />
              <button
                type="button"
                disabled={executing}
                onClick={() => handleInstantTrade('DIGITOVER', String(barrier))}
                className="px-5 py-2.5 rounded-full bg-[#00A878] text-white text-xs font-bold cursor-pointer"
              >
                Buy OVER {barrier}
              </button>
              <button
                type="button"
                disabled={executing}
                onClick={() => handleInstantTrade('DIGITUNDER', String(barrier))}
                className="px-5 py-2.5 rounded-full bg-[#FF444F] text-white text-xs font-bold cursor-pointer"
              >
                Buy UNDER {barrier}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="p-4 rounded-2xl bg-[#00A878]/10 border border-[#00A878]/30">
              <p className="text-xs font-semibold text-[#00A878]">Over {barrier} Probability</p>
              <p className="font-mono tabular-nums text-3xl font-bold mt-1">{analytics.overPct}%</p>
            </div>
            <div className="p-4 rounded-2xl bg-[#FF444F]/10 border border-[#FF444F]/30">
              <p className="text-xs font-semibold text-[#FF444F]">Under {barrier} Probability</p>
              <p className="font-mono tabular-nums text-3xl font-bold mt-1">{analytics.underPct}%</p>
            </div>
          </div>
        </div>
      )}

      {/* 9. RISE / FALL */}
      {tab === 'rise-fall' && (
        <div className="bg-white dark:bg-[#181C25] rounded-2xl border border-slate-200 dark:border-[#2A2F3D] p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="p-5 rounded-2xl bg-[#00A878]/10 border border-[#00A878]/30 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-[#00A878] flex items-center gap-1">
                <TrendingUp className="w-4 h-4" /> Rise Momentum
              </p>
              <p className="font-mono tabular-nums text-3xl font-bold mt-1">{analytics.risePct}%</p>
            </div>
            <button
              type="button"
              disabled={executing}
              onClick={() => handleInstantTrade('CALL')}
              className="px-5 py-2.5 rounded-full bg-[#00A878] text-white text-xs font-bold cursor-pointer"
            >
              Buy RISE
            </button>
          </div>
          <div className="p-5 rounded-2xl bg-[#FF444F]/10 border border-[#FF444F]/30 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-[#FF444F] flex items-center gap-1">
                <TrendingDown className="w-4 h-4" /> Fall Momentum
              </p>
              <p className="font-mono tabular-nums text-3xl font-bold mt-1">{analytics.fallPct}%</p>
            </div>
            <button
              type="button"
              disabled={executing}
              onClick={() => handleInstantTrade('PUT')}
              className="px-5 py-2.5 rounded-full bg-[#FF444F] text-white text-xs font-bold cursor-pointer"
            >
              Buy FALL
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
