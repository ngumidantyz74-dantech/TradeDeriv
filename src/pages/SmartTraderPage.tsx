import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  createChart,
  AreaSeries,
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from 'lightweight-charts';
import {
  TrendingUp,
  TrendingDown,
  Zap,
  Sparkles,
  CheckCircle2,
  XCircle,
  ArrowUpRight,
  ChevronDown,
  Activity,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { apiFetch, sanitizeUiError } from '../lib/api';
import { getCanonicalBalances, computeLiveOrderMetrics } from '../lib/balances';
import { DepositSheet } from '../components/CashierFlows';
import type { CandleData } from '../types';

type TradeGroupId = 'risefall' | 'highlow' | 'touchnotouch' | 'matchesdiffers' | 'evenodd' | 'overunder' | 'accumulators';

interface TradeGroupMeta {
  id: TradeGroupId;
  label: string;
  buyLabel: string;
  buyContract: string;
  sellLabel: string;
  sellContract: string;
  payoutPct: number;
  usesDigit?: boolean;
  usesBarrierOffset?: boolean;
  isAccu?: boolean;
}

const TRADE_GROUPS: TradeGroupMeta[] = [
  {
    id: 'risefall',
    label: 'Up/Down · Rise/Fall',
    buyLabel: 'Rise',
    buyContract: 'CALL',
    sellLabel: 'Fall',
    sellContract: 'PUT',
    payoutPct: 95.3,
  },
  {
    id: 'highlow',
    label: 'Up/Down · Higher/Lower',
    buyLabel: 'Higher',
    buyContract: 'CALLE',
    sellLabel: 'Lower',
    sellContract: 'PUTE',
    payoutPct: 88.4,
    usesBarrierOffset: true,
  },
  {
    id: 'touchnotouch',
    label: 'Touch/No Touch',
    buyLabel: 'Touch',
    buyContract: 'ONETOUCH',
    sellLabel: 'No Touch',
    sellContract: 'NOTOUCH',
    payoutPct: 112.0,
    usesBarrierOffset: true,
  },
  {
    id: 'matchesdiffers',
    label: 'Digits · Matches/Differs',
    buyLabel: 'Matches',
    buyContract: 'DIGITMATCH',
    sellLabel: 'Differs',
    sellContract: 'DIGITDIFF',
    payoutPct: 810.0,
    usesDigit: true,
  },
  {
    id: 'evenodd',
    label: 'Digits · Even/Odd',
    buyLabel: 'Even',
    buyContract: 'DIGITEVEN',
    sellLabel: 'Odd',
    sellContract: 'DIGITODD',
    payoutPct: 96.1,
  },
  {
    id: 'overunder',
    label: 'Digits · Over/Under',
    buyLabel: 'Over',
    buyContract: 'DIGITOVER',
    sellLabel: 'Under',
    sellContract: 'DIGITUNDER',
    payoutPct: 124.0,
    usesDigit: true,
  },
  {
    id: 'accumulators',
    label: 'Accumulators',
    buyLabel: 'Buy Accumulator',
    buyContract: 'ACCU',
    sellLabel: 'Close Open Accu',
    sellContract: 'ACCU',
    payoutPct: 100.0,
    isAccu: true,
  },
];

export const SmartTraderPage: React.FC = () => {
  const {
    user,
    accounts,
    accountMode,
    setAccountMode,
    activeConnectedAccount,
    instruments,
    selectedSymbol,
    setSelectedSymbol,
    ticks,
    analyserSignal,
    refreshAnalyserSignal,
    tradePreset,
    setTradePreset,
    orders,
    refreshOrders,
    refreshAll,
    formatMoney,
    theme,
    setActiveTab,
    showToast,
  } = useApp();

  const [groupId, setGroupId] = useState<TradeGroupId>('risefall');
  const [duration, setDuration] = useState<number>(5);
  const [durationUnit, setDurationUnit] = useState<'t' | 'm'>('t');
  const [digitPrediction, setDigitPrediction] = useState<number>(4);
  const [barrierOffset, setBarrierOffset] = useState<string>('+0.50');
  const [growthRate, setGrowthRate] = useState<number>(0.02);
  // Pro <$50 USD risk management default: $1.00 base stake
  const [stake, setStake] = useState<number>(1.0);
  const [tpUsd, setTpUsd] = useState<number>(3.0);
  const [chartType, setChartType] = useState<'area' | 'candles'>('area');
  const [candles, setCandles] = useState<CandleData[]>([]);
  const [recentDigits, setRecentDigits] = useState<number[]>([2, 7, 4, 8, 1, 5, 9, 3, 6, 4, 0, 7, 2, 8, 5, 3, 6, 1, 9, 4]);
  const [placing, setPlacing] = useState<string | null>(null);
  const [closingId, setClosingId] = useState<number | null>(null);
  const [analyserSynced, setAnalyserSynced] = useState<boolean>(false);
  const [depositOpen, setDepositOpen] = useState<boolean>(false);

  const chartContainerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Area'> | ISeriesApi<'Candlestick'> | null>(null);
  const candlesRef = useRef<CandleData[]>([]);
  candlesRef.current = candles;
  const reqIdRef = useRef(0);

  const activeGroup = useMemo(
    () => TRADE_GROUPS.find((g) => g.id === groupId) || TRADE_GROUPS[0],
    [groupId]
  );

  const activeInst = useMemo(
    () => instruments.find((i) => i.symbol === selectedSymbol) || instruments[0],
    [instruments, selectedSymbol]
  );

  const { optionsBal } = getCanonicalBalances(user, accounts, accountMode, activeConnectedAccount);

  const liveTick = ticks[selectedSymbol];
  const hasLiveTick = liveTick?.source === 'deriv_ws' || liveTick?.source === 'live_pulse';
  const lastClose = candles.length > 0 ? candles[candles.length - 1].close : undefined;
  const spotPrice = hasLiveTick
    ? liveTick.quote
    : lastClose ?? liveTick?.quote ?? activeInst?.price ?? 1000;
  const pipSize = liveTick?.pipSize ?? activeInst?.pip_size ?? 0.01;
  const decimals = pipSize < 0.0001 ? 5 : pipSize < 0.001 ? 4 : 2;

  // Consume tradePreset when launched from OptionsHub or Market Analyser
  useEffect(() => {
    if (!tradePreset) return;
    if (tradePreset.symbol) setSelectedSymbol(tradePreset.symbol);
    if (tradePreset.stake && tradePreset.stake > 0) setStake(tradePreset.stake);
    if (tradePreset.growthRate) setGrowthRate(tradePreset.growthRate);
    if (tradePreset.barrier !== undefined && !Number.isNaN(Number(tradePreset.barrier))) {
      setDigitPrediction(Math.max(0, Math.min(9, Math.floor(Number(tradePreset.barrier)))));
    }
    if (tradePreset.analyserSync) setAnalyserSynced(true);

    const ct = String(tradePreset.contractType || '').toUpperCase();
    if (ct === 'ACCU') setGroupId('accumulators');
    else if (ct === 'DIGITOVER' || ct === 'DIGITUNDER') setGroupId('overunder');
    else if (ct === 'DIGITEVEN' || ct === 'DIGITODD') setGroupId('evenodd');
    else if (ct === 'DIGITMATCH' || ct === 'DIGITDIFF') setGroupId('matchesdiffers');
    else if (ct === 'ONETOUCH' || ct === 'NOTOUCH') setGroupId('touchnotouch');
    else if (ct === 'CALLE' || ct === 'PUTE') setGroupId('highlow');
    else if (ct === 'CALL' || ct === 'PUT') setGroupId('risefall');

    setTradePreset(null);
  }, [tradePreset, setSelectedSymbol, setTradePreset]);

  // Fetch uncached live candles on symbol or chart change
  const loadCandles = useCallback(async () => {
    const rid = ++reqIdRef.current;
    try {
      const res = await apiFetch<{ candles: CandleData[] }>(
        `/api/market/candles?symbol=${encodeURIComponent(selectedSymbol)}&granularity=60&count=120&_t=${Date.now()}`,
        { skipAuth: true, cache: 'no-store' }
      );
      if (reqIdRef.current !== rid) return;
      if (Array.isArray(res.candles) && res.candles.length > 0) {
        setCandles(res.candles);
      }
    } catch {
      // ignore transient poll failure
    }
  }, [selectedSymbol]);

  useEffect(() => {
    setCandles([]);
    loadCandles();
    const timer = setInterval(loadCandles, 3000);
    return () => clearInterval(timer);
  }, [loadCandles]);

  // Track recent last digits dynamically as ticks stream in
  useEffect(() => {
    if (!liveTick || liveTick.symbol !== selectedSymbol || !Number.isFinite(liveTick.quote)) return;
    const formatted = liveTick.quote.toFixed(decimals);
    const d = Number(formatted.charAt(formatted.length - 1));
    if (!Number.isNaN(d)) {
      setRecentDigits((prev) => [...prev.slice(-19), d]);
    }
  }, [liveTick, selectedSymbol, decimals]);

  // Initialize Lightweight Charts v5
  useEffect(() => {
    const el = chartContainerRef.current;
    if (!el) return;
    const isDark = theme === 'dark';
    const chart = createChart(el, {
      width: el.clientWidth,
      height: el.clientHeight || 320,
      layout: {
        background: { type: ColorType.Solid, color: isDark ? '#151820' : '#FFFFFF' },
        textColor: isDark ? '#94A3B8' : '#475569',
      },
      grid: {
        vertLines: { color: isDark ? '#1F2430' : '#F1F5F9' },
        horzLines: { color: isDark ? '#1F2430' : '#F1F5F9' },
      },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: isDark ? '#2A2F3D' : '#E2E8F0' },
      timeScale: {
        borderColor: isDark ? '#2A2F3D' : '#E2E8F0',
        timeVisible: true,
        secondsVisible: true,
        rightOffset: 2,
      },
    });

    const series =
      chartType === 'candles'
        ? chart.addSeries(CandlestickSeries, {
            upColor: '#00A878',
            downColor: '#FF444F',
            borderVisible: false,
            wickUpColor: '#00A878',
            wickDownColor: '#FF444F',
          })
        : chart.addSeries(AreaSeries, {
            lineColor: '#FF444F',
            topColor: 'rgba(255, 68, 79, 0.25)',
            bottomColor: 'rgba(255, 68, 79, 0.02)',
            lineWidth: 2,
          });

    chartRef.current = chart;
    seriesRef.current = series;

    const ro = new ResizeObserver(() => {
      if (chartContainerRef.current) {
        chart.applyOptions({
          width: chartContainerRef.current.clientWidth,
          height: chartContainerRef.current.clientHeight || 320,
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
  }, [theme, chartType]);

  // Populate historical candles
  useEffect(() => {
    const s = seriesRef.current;
    if (!s) return;
    if (candles.length === 0) {
      s.setData([]);
      return;
    }
    if (chartType === 'candles') {
      (s as ISeriesApi<'Candlestick'>).setData(
        candles.map((c) => ({
          time: c.time as UTCTimestamp,
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
        }))
      );
    } else {
      (s as ISeriesApi<'Area'>).setData(
        candles.map((c) => ({
          time: c.time as UTCTimestamp,
          value: c.close,
        }))
      );
    }
    chartRef.current?.timeScale().scrollToRealTime();
  }, [candles, chartType]);

  // Apply live ticks (deriv_ws OR live_pulse) directly onto chart series
  useEffect(() => {
    const s = seriesRef.current;
    const list = candlesRef.current;
    if (!s || !hasLiveTick || liveTick?.symbol !== selectedSymbol || list.length === 0) return;

    const last = list[list.length - 1];
    const bucket = Math.floor(liveTick.epoch / 60) * 60;
    const isNew = bucket > last.time;
    const bar: CandleData = isNew
      ? {
          time: bucket,
          open: last.close,
          high: Math.max(last.close, liveTick.quote),
          low: Math.min(last.close, liveTick.quote),
          close: liveTick.quote,
        }
      : {
          time: last.time,
          open: last.open,
          high: Math.max(last.high, liveTick.quote),
          low: Math.min(last.low, liveTick.quote),
          close: liveTick.quote,
        };

    try {
      if (chartType === 'candles') {
        (s as ISeriesApi<'Candlestick'>).update({
          ...bar,
          time: bar.time as UTCTimestamp,
        });
      } else {
        (s as ISeriesApi<'Area'>).update({
          time: bar.time as UTCTimestamp,
          value: liveTick.quote,
        });
      }
    } catch {
      // ignore out-of-order point
    }
  }, [liveTick, hasLiveTick, selectedSymbol, chartType]);

  const applyAnalyserSignal = async () => {
    const sig = analyserSignal || (await refreshAnalyserSignal(selectedSymbol));
    if (!sig) return;
    if (sig.symbol && sig.symbol !== selectedSymbol) setSelectedSymbol(sig.symbol);
    const ct = sig.contractType.toUpperCase();
    if (ct === 'ACCU') {
      setGroupId('accumulators');
      setGrowthRate(sig.growthRate || 0.02);
    } else if (ct === 'DIGITOVER' || ct === 'DIGITUNDER') {
      setGroupId('overunder');
      setDigitPrediction(Number(sig.barrier || 2));
    } else if (ct === 'DIGITEVEN' || ct === 'DIGITODD') {
      setGroupId('evenodd');
    } else if (ct === 'DIGITMATCH' || ct === 'DIGITDIFF') {
      setGroupId('matchesdiffers');
      setDigitPrediction(Number(sig.barrier || sig.lastDigit || 4));
    } else {
      setGroupId('risefall');
    }
    setDuration(sig.duration || 5);
    setDurationUnit(sig.durationUnit === 'm' ? 'm' : 't');
    setAnalyserSynced(true);
    showToast(`Applied Live Analyser Signal: ${sig.contractType} (${sig.confidence}% conf.)`, 'success');
  };

  const placeContract = async (contractType: string, side: 'BUY' | 'SELL') => {
    setPlacing(contractType);
    try {
      const barrier = activeGroup.usesDigit
        ? String(digitPrediction)
        : activeGroup.usesBarrierOffset
          ? barrierOffset
          : undefined;
      await apiFetch('/api/orders', {
        method: 'POST',
        body: JSON.stringify({
          symbol: selectedSymbol,
          side,
          contractType,
          stake: Number(stake),
          duration: activeGroup.isAccu ? 1 : Number(duration),
          durationUnit: activeGroup.isAccu ? 't' : durationUnit,
          barrier,
          growthRate: activeGroup.isAccu ? growthRate : undefined,
          tpUsd: activeGroup.isAccu ? tpUsd : undefined,
          accountMode,
          executionMode:
            activeConnectedAccount && !activeConnectedAccount.balance_locked_by_admin ? 'deriv' : 'virtual',
          connectedAccountId: activeConnectedAccount?.id || undefined,
          strategyKey: analyserSynced ? 'analyser_synced_smarttrader' : 'smart_trader',
          isAnalyserSynced: analyserSynced,
        }),
      });
      await Promise.all([refreshOrders(), refreshAll()]);
      showToast(`${contractType} contract opened on ${activeInst?.display_name || selectedSymbol}`, 'success');
    } catch (err) {
      showToast(sanitizeUiError(err, 'Unable to open SmartTrader contract'), 'error');
    } finally {
      setPlacing(null);
    }
  };

  const handleCloseOrder = async (orderId: number) => {
    setClosingId(orderId);
    try {
      await apiFetch(`/api/orders/${orderId}/close`, { method: 'POST' });
      await Promise.all([refreshOrders(), refreshAll()]);
      showToast('Contract settled & balance updated', 'success');
    } catch (err) {
      showToast(sanitizeUiError(err, 'Unable to settle contract'), 'error');
    } finally {
      setClosingId(null);
    }
  };

  const smartOrders = useMemo(
    () =>
      orders.filter((o) =>
        ['CALL', 'PUT', 'CALLE', 'PUTE', 'ONETOUCH', 'NOTOUCH', 'DIGITMATCH', 'DIGITDIFF', 'DIGITEVEN', 'DIGITODD', 'DIGITOVER', 'DIGITUNDER', 'ACCU'].includes(
          String(o.contract_type || '').toUpperCase()
        )
      ),
    [orders]
  );

  const openSmartOrders = smartOrders.filter((o) => o.status === 'OPEN');
  const estimatedPayout = Number((stake * (1 + activeGroup.payoutPct / 100)).toFixed(2));
  const netProfitEst = Number((estimatedPayout - stake).toFixed(2));

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-4 pb-12 space-y-5">
      {/* SmartTrader Header matching Deriv ST */}
      <div className="bg-white dark:bg-[#181C25] border border-slate-200 dark:border-[#2A2F3D] rounded-2xl px-4 py-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <span className="w-9 h-9 rounded-lg bg-[#FF444F] text-white font-display font-bold text-sm flex items-center justify-center shrink-0">
            ST
          </span>
          <div className="min-w-0">
            <h1 className="font-display text-base sm:text-lg font-bold leading-tight truncate">SmartTrader</h1>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Options, Digits &amp; Accumulators Terminal
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

          <button
            type="button"
            onClick={() => setDepositOpen(true)}
            className="px-3.5 py-1.5 rounded-full bg-[#FF444F] hover:bg-[#E63946] text-white text-xs font-bold inline-flex items-center gap-1 whitespace-nowrap cursor-pointer"
          >
            Deposit <ArrowUpRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Live Analyser Signal Banner */}
      {analyserSignal && (
        <div className="rounded-2xl bg-[#151820] text-white border border-[#2A2F3D] px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start sm:items-center gap-3 min-w-0">
            <span className="w-8 h-8 rounded-lg bg-[#00A878]/15 text-[#00A878] flex items-center justify-center shrink-0">
              <Sparkles className="w-4 h-4" />
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="font-bold text-[#00A878]">Market Analyser Signal</span>
                <span className="font-mono font-bold text-white">{analyserSignal.displayName}</span>
                <span className="px-2 py-0.5 rounded bg-white/10 font-mono text-[11px] font-bold">
                  {analyserSignal.contractType} · {analyserSignal.confidence}% conf.
                </span>
                {analyserSynced && (
                  <span className="px-2 py-0.5 rounded bg-[#00A878]/20 text-[#00A878] text-[10px] font-bold">
                    SYNC ACTIVE
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-400 truncate mt-0.5">{analyserSignal.reason}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={applyAnalyserSignal}
              className="px-3.5 py-1.5 rounded-lg bg-[#00A878] hover:bg-[#00966B] text-white text-xs font-bold cursor-pointer whitespace-nowrap"
            >
              Apply Signal
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('market-analyser')}
              className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-xs font-semibold cursor-pointer whitespace-nowrap"
            >
              Full Analyser
            </button>
          </div>
        </div>
      )}

      {/* Main Split: Contract Ticket + Live Lightweight Chart */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left: Contract Configuration & Execution */}
        <div className="lg:col-span-5 bg-white dark:bg-[#181C25] border border-slate-200 dark:border-[#2A2F3D] rounded-2xl p-4 sm:p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-3">
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                Underlying Market
              </label>
              <div className="relative">
                <select
                  value={selectedSymbol}
                  onChange={(e) => setSelectedSymbol(e.target.value)}
                  className="w-full appearance-none px-3.5 py-2.5 pr-9 rounded-xl bg-[#F4F5F7] dark:bg-[#111319] border border-slate-200 dark:border-[#2A2F3D] text-sm font-semibold"
                >
                  {instruments.map((inst) => (
                    <option key={inst.symbol} value={inst.symbol}>
                      {inst.display_name} ({inst.category})
                    </option>
                  ))}
                </select>
                <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                Trade Type
              </label>
              <div className="relative">
                <select
                  value={groupId}
                  onChange={(e) => setGroupId(e.target.value as TradeGroupId)}
                  className="w-full appearance-none px-3.5 py-2.5 pr-9 rounded-xl bg-[#F4F5F7] dark:bg-[#111319] border border-slate-200 dark:border-[#2A2F3D] text-sm font-semibold"
                >
                  {TRADE_GROUPS.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.label}
                    </option>
                  ))}
                </select>
                <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            </div>
          </div>

          {/* Conditional Parameters */}
          {activeGroup.isAccu ? (
            <div className="space-y-3">
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                  Accumulator Growth Rate
                </label>
                <div className="grid grid-cols-5 gap-1.5">
                  {[0.01, 0.02, 0.03, 0.04, 0.05].map((rate) => (
                    <button
                      key={rate}
                      type="button"
                      onClick={() => setGrowthRate(rate)}
                      className={`py-2 rounded-xl font-mono text-xs font-bold border cursor-pointer ${
                        growthRate === rate
                          ? 'bg-[#FF444F] text-white border-[#FF444F]'
                          : 'bg-[#F4F5F7] dark:bg-[#111319] border-slate-200 dark:border-[#2A2F3D] text-slate-600 dark:text-slate-300'
                      }`}
                    >
                      {(rate * 100).toFixed(0)}%
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                  Auto Take Profit (USD)
                </label>
                <input
                  type="number"
                  min="0.5"
                  step="0.5"
                  value={tpUsd}
                  onChange={(e) => setTpUsd(Number(e.target.value))}
                  className="w-full px-3.5 py-2 rounded-xl bg-[#F4F5F7] dark:bg-[#111319] border border-slate-200 dark:border-[#2A2F3D] font-mono tabular-nums text-sm font-bold"
                />
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                  Duration
                </label>
                <div className="flex gap-1.5">
                  <input
                    type="number"
                    min="1"
                    max={durationUnit === 't' ? 10 : 60}
                    value={duration}
                    onChange={(e) => setDuration(Math.max(1, Number(e.target.value)))}
                    className="w-20 px-3 py-2 rounded-xl bg-[#F4F5F7] dark:bg-[#111319] border border-slate-200 dark:border-[#2A2F3D] font-mono tabular-nums text-sm font-bold"
                  />
                  <select
                    value={durationUnit}
                    onChange={(e) => setDurationUnit(e.target.value as 't' | 'm')}
                    className="flex-1 px-2.5 py-2 rounded-xl bg-[#F4F5F7] dark:bg-[#111319] border border-slate-200 dark:border-[#2A2F3D] text-xs font-semibold"
                  >
                    <option value="t">Ticks</option>
                    <option value="m">Minutes</option>
                  </select>
                </div>
              </div>

              {activeGroup.usesDigit ? (
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                    Last Digit Prediction
                  </label>
                  <div className="grid grid-cols-5 gap-1">
                    {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => (
                      <button
                        key={d}
                        type="button"
                        onClick={() => setDigitPrediction(d)}
                        className={`py-1 rounded-lg font-mono text-xs font-bold cursor-pointer ${
                          digitPrediction === d
                            ? 'bg-[#FF444F] text-white'
                            : 'bg-[#F4F5F7] dark:bg-[#111319] text-slate-600 dark:text-slate-300'
                        }`}
                      >
                        {d}
                      </button>
                    ))}
                  </div>
                </div>
              ) : activeGroup.usesBarrierOffset ? (
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                    Barrier Offset
                  </label>
                  <input
                    type="text"
                    value={barrierOffset}
                    onChange={(e) => setBarrierOffset(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-[#F4F5F7] dark:bg-[#111319] border border-slate-200 dark:border-[#2A2F3D] font-mono tabular-nums text-sm font-bold"
                  />
                </div>
              ) : (
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                    Stake (USD)
                  </label>
                  <input
                    type="number"
                    min="0.35"
                    step="0.5"
                    value={stake}
                    onChange={(e) => setStake(Math.max(0.35, Number(e.target.value)))}
                    className="w-full px-3 py-2 rounded-xl bg-[#F4F5F7] dark:bg-[#111319] border border-slate-200 dark:border-[#2A2F3D] font-mono tabular-nums text-sm font-bold"
                  />
                </div>
              )}
            </div>
          )}

          {(activeGroup.usesDigit || activeGroup.usesBarrierOffset || activeGroup.isAccu) && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  Stake (USD · Pro &lt;$50 Default)
                </label>
                <div className="flex gap-1">
                  {[0.5, 1, 2, 5, 10].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setStake(preset)}
                      className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold cursor-pointer ${
                        stake === preset ? 'bg-[#151820] text-white dark:bg-white dark:text-[#151820]' : 'bg-slate-100 dark:bg-[#111319] text-slate-500'
                      }`}
                    >
                      ${preset}
                    </button>
                  ))}
                </div>
              </div>
              <input
                type="number"
                min="0.35"
                step="0.5"
                value={stake}
                onChange={(e) => setStake(Math.max(0.35, Number(e.target.value)))}
                className="w-full px-3.5 py-2 rounded-xl bg-[#F4F5F7] dark:bg-[#111319] border border-slate-200 dark:border-[#2A2F3D] font-mono tabular-nums text-sm font-bold"
              />
            </div>
          )}

          {/* Payout Summary */}
          <div className="rounded-xl bg-[#F4F5F7] dark:bg-[#111319] p-3 flex items-center justify-between text-xs">
            <div>
              <p className="text-slate-500">Est. Payout</p>
              <p className="font-mono tabular-nums font-bold text-sm">{formatMoney(estimatedPayout)}</p>
            </div>
            <div className="text-right">
              <p className="text-slate-500">Net Return</p>
              <p className="font-mono tabular-nums font-bold text-sm text-[#00A878]">
                +${netProfitEst.toFixed(2)} ({activeGroup.payoutPct.toFixed(1)}%)
              </p>
            </div>
          </div>

          {/* Purchase CTAs */}
          {activeGroup.isAccu ? (
            <button
              type="button"
              disabled={placing !== null}
              onClick={() => placeContract('ACCU', 'BUY')}
              className="w-full py-3.5 rounded-xl bg-[#00A878] hover:bg-[#00966B] text-white font-bold text-sm flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
            >
              <Zap className="w-4 h-4" />
              {placing === 'ACCU' ? 'Opening Accumulator...' : `Buy ${(growthRate * 100).toFixed(0)}% Accumulator · $${stake.toFixed(2)}`}
            </button>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                disabled={placing !== null}
                onClick={() => placeContract(activeGroup.buyContract, 'BUY')}
                className="py-3.5 px-4 rounded-xl bg-[#00A878] hover:bg-[#00966B] text-white font-bold text-sm flex flex-col items-center justify-center gap-0.5 cursor-pointer disabled:opacity-60"
              >
                <span className="flex items-center gap-1.5">
                  <TrendingUp className="w-4 h-4" />
                  {placing === activeGroup.buyContract ? 'Placing...' : activeGroup.buyLabel}
                </span>
                <span className="font-mono text-[11px] opacity-90">${estimatedPayout.toFixed(2)} payout</span>
              </button>

              <button
                type="button"
                disabled={placing !== null}
                onClick={() => placeContract(activeGroup.sellContract, 'SELL')}
                className="py-3.5 px-4 rounded-xl bg-[#FF444F] hover:bg-[#E63946] text-white font-bold text-sm flex flex-col items-center justify-center gap-0.5 cursor-pointer disabled:opacity-60"
              >
                <span className="flex items-center gap-1.5">
                  <TrendingDown className="w-4 h-4" />
                  {placing === activeGroup.sellContract ? 'Placing...' : activeGroup.sellLabel}
                </span>
                <span className="font-mono text-[11px] opacity-90">${estimatedPayout.toFixed(2)} payout</span>
              </button>
            </div>
          )}
        </div>

        {/* Right: Live Lightweight Chart + Digit Ticker */}
        <div className="lg:col-span-7 bg-white dark:bg-[#181C25] border border-slate-200 dark:border-[#2A2F3D] rounded-2xl p-4 flex flex-col">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100 dark:border-[#2A2F3D]">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-display font-bold text-sm">{activeInst?.display_name || selectedSymbol}</span>
                <span className="font-mono tabular-nums text-base font-bold text-[#00A878]">
                  {spotPrice.toFixed(decimals)}
                </span>
              </div>
              <p className="text-[11px] text-slate-500">Live Market Stream · Uncached</p>
            </div>

            <div className="flex items-center gap-2">
              <div className="inline-flex bg-[#F4F5F7] dark:bg-[#111319] p-0.5 rounded-lg">
                {(['area', 'candles'] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setChartType(mode)}
                    className={`px-2.5 py-1 rounded-md text-xs font-semibold capitalize cursor-pointer ${
                      chartType === mode ? 'bg-white dark:bg-[#181C25] shadow-sm text-[#FF444F]' : 'text-slate-500'
                    }`}
                  >
                    {mode}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setActiveTab('mt5-tv')}
                className="px-3 py-1.5 rounded-lg bg-[#151820] dark:bg-white/10 text-white text-xs font-semibold hover:opacity-90 cursor-pointer"
              >
                Full Chart
              </button>
            </div>
          </div>

          {/* Chart Canvas */}
          <div ref={chartContainerRef} className="w-full h-[300px] sm:h-[340px] mt-2 rounded-xl overflow-hidden" />

          {/* Live Last Digits Strip */}
          <div className="mt-3 pt-3 border-t border-slate-100 dark:border-[#2A2F3D]">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                <Activity className="w-3.5 h-3.5 text-[#FF444F]" /> Live Last-Digit Stream
              </span>
              <span className="text-[11px] font-mono text-slate-500">
                Latest: <strong className="text-[#FF444F]">{recentDigits[recentDigits.length - 1]}</strong>
              </span>
            </div>
            <div className="grid grid-cols-10 sm:grid-cols-20 gap-1">
              {recentDigits.map((d, idx) => (
                <div
                  key={`${idx}-${d}`}
                  className={`py-1 rounded text-center font-mono text-xs font-bold ${
                    idx === recentDigits.length - 1
                      ? 'bg-[#FF444F] text-white'
                      : d % 2 === 0
                        ? 'bg-[#00A878]/15 text-[#00A878]'
                        : 'bg-[#F4F5F7] dark:bg-[#111319] text-slate-600 dark:text-slate-300'
                  }`}
                >
                  {d}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Live SmartTrader Positions & Recent Settlements */}
      <section className="bg-white dark:bg-[#181C25] border border-slate-200 dark:border-[#2A2F3D] rounded-2xl overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 dark:border-[#2A2F3D] flex items-center justify-between">
          <h2 className="font-display text-sm font-bold">
            SmartTrader Positions ({openSmartOrders.length} open · {smartOrders.length} total)
          </h2>
          <button
            type="button"
            onClick={() => setActiveTab('reports')}
            className="text-xs font-semibold text-[#FF444F] hover:underline cursor-pointer"
          >
            View All Statements
          </button>
        </div>
        {smartOrders.length === 0 ? (
          <p className="p-6 text-center text-xs text-slate-500">
            No SmartTrader contracts placed yet. Select a contract above to execute immediately.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-100 dark:border-[#2A2F3D] text-slate-500">
                  <th className="text-left px-4 py-2.5 font-medium">Instrument</th>
                  <th className="text-left px-4 py-2.5 font-medium">Contract</th>
                  <th className="text-right px-4 py-2.5 font-medium">Stake</th>
                  <th className="text-right px-4 py-2.5 font-medium">Spot / Entry</th>
                  <th className="text-right px-4 py-2.5 font-medium">P/L</th>
                  <th className="text-right px-4 py-2.5 font-medium">Status / Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-[#2A2F3D]">
                {smartOrders.slice(0, 15).map((o) => {
                  const live = computeLiveOrderMetrics(o, ticks);
                  const win = live.pnl >= 0;
                  return (
                    <tr key={o.id}>
                      <td className="px-4 py-2.5 font-semibold">{o.symbol}</td>
                      <td className="px-4 py-2.5 font-mono">
                        {o.contract_type}
                        {o.barrier ? ` (${o.barrier})` : ''}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono tabular-nums">${Number(o.stake).toFixed(2)}</td>
                      <td className="px-4 py-2.5 text-right font-mono tabular-nums">
                        {live.currentPrice.toFixed(2)} / {Number(o.entry_price).toFixed(2)}
                      </td>
                      <td
                        className={`px-4 py-2.5 text-right font-mono tabular-nums font-bold ${
                          win ? 'text-[#00A878]' : 'text-[#FF444F]'
                        }`}
                      >
                        {win ? '+' : ''}${live.pnl.toFixed(2)}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        {o.status === 'OPEN' ? (
                          <button
                            type="button"
                            disabled={closingId === o.id}
                            onClick={() => handleCloseOrder(o.id)}
                            className="px-2.5 py-1 rounded-lg bg-[#151820] dark:bg-[#FF444F] text-white font-semibold cursor-pointer"
                          >
                            {closingId === o.id ? 'Closing...' : 'Sell / Close'}
                          </button>
                        ) : (
                          <span
                            className={`inline-flex items-center gap-1 font-semibold ${
                              win ? 'text-[#00A878]' : 'text-[#FF444F]'
                            }`}
                          >
                            {win ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
                            Closed
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <DepositSheet open={depositOpen} onClose={() => setDepositOpen(false)} />
    </div>
  );
};
