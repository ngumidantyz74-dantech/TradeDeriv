import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  createChart,
  CandlestickSeries,
  LineSeries,
  ColorType,
  CrosshairMode,
  LineStyle,
  type IChartApi,
  type ISeriesApi,
  type IPriceLine,
  type UTCTimestamp,
} from 'lightweight-charts';
import {
  Search,
  Star,
  Crosshair,
  Minus,
  Undo2,
  Redo2,
  Eye,
  EyeOff,
  Trash2,
  TrendingUp,
  TrendingDown,
  X,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { apiFetch } from '../../lib/api';
import type { CandleData, MarketInstrument } from '../../types';

const TIMEFRAMES: Array<{ label: string; granularity: number }> = [
  { label: '1t', granularity: 1 },
  { label: '1m', granularity: 60 },
  { label: '2m', granularity: 120 },
  { label: '3m', granularity: 180 },
  { label: '5m', granularity: 300 },
  { label: '10m', granularity: 600 },
  { label: '15m', granularity: 900 },
  { label: '30m', granularity: 1800 },
  { label: '1h', granularity: 3600 },
  { label: '2h', granularity: 7200 },
  { label: '4h', granularity: 14400 },
  { label: '8h', granularity: 28800 },
  { label: '1d', granularity: 86400 },
];

type SlTpUnit = 'USD' | 'Price' | '%' | 'Pips';
type TradeMode = 'MT5 Market' | 'Over/Under' | 'Rise/Fall';
type DockTab = 'open' | 'history' | 'exposure';

function computeSma(candles: CandleData[], period: number) {
  const out: Array<{ time: UTCTimestamp; value: number }> = [];
  for (let i = period - 1; i < candles.length; i++) {
    let sum = 0;
    for (let j = 0; j < period; j++) sum += candles[i - j].close;
    out.push({ time: candles[i].time as UTCTimestamp, value: sum / period });
  }
  return out;
}

function computeEma(candles: CandleData[], period: number) {
  const out: Array<{ time: UTCTimestamp; value: number }> = [];
  if (candles.length < period) return out;
  const k = 2 / (period + 1);
  let ema = candles.slice(0, period).reduce((a, b) => a + b.close, 0) / period;
  out.push({ time: candles[period - 1].time as UTCTimestamp, value: ema });
  for (let i = period; i < candles.length; i++) {
    ema = candles[i].close * k + ema * (1 - k);
    out.push({ time: candles[i].time as UTCTimestamp, value: ema });
  }
  return out;
}

function computeBollinger(candles: CandleData[], period = 20, mult = 2) {
  const upper: Array<{ time: UTCTimestamp; value: number }> = [];
  const lower: Array<{ time: UTCTimestamp; value: number }> = [];
  for (let i = period - 1; i < candles.length; i++) {
    const slice = candles.slice(i - period + 1, i + 1);
    const mean = slice.reduce((a, b) => a + b.close, 0) / period;
    const variance = slice.reduce((a, b) => a + Math.pow(b.close - mean, 2), 0) / period;
    const std = Math.sqrt(variance);
    upper.push({ time: candles[i].time as UTCTimestamp, value: mean + mult * std });
    lower.push({ time: candles[i].time as UTCTimestamp, value: mean - mult * std });
  }
  return { upper, lower };
}

export const MT5TradingView: React.FC = () => {
  const {
    user,
    accounts,
    accountMode,
    activeConnectedAccount,
    selectedSymbol,
    setSelectedSymbol,
    instruments,
    ticks,
    orders,
    watchlist,
    toggleWatchlist,
    refreshOrders,
    refreshAll,
    formatMoney,
    theme,
    showToast,
  } = useApp();

  // MarketWatch Panel
  const [catFilter, setCatFilter] = useState<'All' | MarketInstrument['category']>('All');
  const [mwSearch, setMwSearch] = useState('');
  const [showWatchlistOnly, setShowWatchlistOnly] = useState(false);

  // Chart State
  const [timeframe, setTimeframe] = useState(60);
  const [candles, setCandles] = useState<CandleData[]>([]);
  const [showSma20, setShowSma20] = useState(true);
  const [showEma50, setShowEma50] = useState(false);
  const [showBb, setShowBb] = useState(false);

  // Drawing Toolbar State
  const [drawMode, setDrawMode] = useState<'crosshair' | 'hline'>('crosshair');
  const [hLines, setHLines] = useState<number[]>([]);
  const [redoStack, setRedoStack] = useState<number[]>([]);
  const [drawingsVisible, setDrawingsVisible] = useState(true);

  // Order Ticket State
  const [tradeMode, setTradeMode] = useState<TradeMode>('MT5 Market');
  const [lots, setLots] = useState(0.1);
  const [stakeUsd, setStakeUsd] = useState(10);
  const [multiplier, setMultiplier] = useState(100);
  const [bulkCount, setBulkCount] = useState(1);
  const [barrier, setBarrier] = useState('4');
  const [durationTicks, setDurationTicks] = useState(5);

  // SL / TP Controls (4-mode defaulting to USD)
  const [slEnabled, setSlEnabled] = useState(true);
  const [tpEnabled, setTpEnabled] = useState(true);
  const [slUnit, setSlUnit] = useState<SlTpUnit>('USD');
  const [tpUnit, setTpUnit] = useState<SlTpUnit>('USD');
  const [slValue, setSlValue] = useState('15');
  const [tpValue, setTpValue] = useState('30');
  const [placing, setPlacing] = useState(false);

  // Bottom Dock
  const [dockTab, setDockTab] = useState<DockTab>('open');

  // Chart Refs
  const chartContainerRef = useRef<HTMLDivElement | null>(null);
  const chartApiRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const smaSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const emaSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const bbUpperRef = useRef<ISeriesApi<'Line'> | null>(null);
  const bbLowerRef = useRef<ISeriesApi<'Line'> | null>(null);
  const priceLinesRef = useRef<IPriceLine[]>([]);

  const activeInst = useMemo(
    () => instruments.find((i) => i.symbol === selectedSymbol) || instruments[0],
    [instruments, selectedSymbol]
  );

  const liveTick = ticks[selectedSymbol];
  const currentPrice = liveTick?.quote ?? activeInst?.price ?? 1000;
  const currentBid = liveTick?.bid ?? activeInst?.bid ?? currentPrice;
  const currentAsk = liveTick?.ask ?? activeInst?.ask ?? currentPrice;
  const pipSize = liveTick?.pipSize ?? activeInst?.pip_size ?? 0.01;
  const decimals = pipSize < 0.0001 ? 5 : pipSize < 0.001 ? 4 : 2;

  // Fetch candles
  const loadCandles = useCallback(async () => {
    try {
      const res = await apiFetch<{ candles: CandleData[] }>(
        `/api/market/candles?symbol=${encodeURIComponent(selectedSymbol)}&granularity=${timeframe}&count=140`,
        { skipAuth: true }
      );
      setCandles(res.candles || []);
    } catch {
      // ignore
    }
  }, [selectedSymbol, timeframe]);

  useEffect(() => {
    loadCandles();
  }, [loadCandles]);

  // Initialize Lightweight Chart v5
  useEffect(() => {
    const el = chartContainerRef.current;
    if (!el) return;

    const isDark = theme === 'dark';
    const chart = createChart(el, {
      width: el.clientWidth,
      height: 410,
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
      timeScale: { borderColor: isDark ? '#2A2F3D' : '#E2E8F0', timeVisible: true, secondsVisible: timeframe < 60 },
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#00A878',
      downColor: '#FF444F',
      borderVisible: false,
      wickUpColor: '#00A878',
      wickDownColor: '#FF444F',
    });

    const smaSeries = chart.addSeries(LineSeries, { color: '#3B82F6', lineWidth: 2, priceLineVisible: false });
    const emaSeries = chart.addSeries(LineSeries, { color: '#F59E0B', lineWidth: 2, priceLineVisible: false });
    const bbUpper = chart.addSeries(LineSeries, { color: '#8B5CF6', lineWidth: 1, lineStyle: LineStyle.Dashed, priceLineVisible: false });
    const bbLower = chart.addSeries(LineSeries, { color: '#8B5CF6', lineWidth: 1, lineStyle: LineStyle.Dashed, priceLineVisible: false });

    chartApiRef.current = chart;
    candleSeriesRef.current = candleSeries;
    smaSeriesRef.current = smaSeries;
    emaSeriesRef.current = emaSeries;
    bbUpperRef.current = bbUpper;
    bbLowerRef.current = bbLower;

    const ro = new ResizeObserver(() => {
      if (chartContainerRef.current) {
        chart.applyOptions({ width: chartContainerRef.current.clientWidth });
      }
    });
    ro.observe(el);

    return () => {
      ro.disconnect();
      chart.remove();
      chartApiRef.current = null;
      candleSeriesRef.current = null;
    };
  }, [theme, timeframe]);

  // Click chart to draw Horizontal Line when drawMode === 'hline'
  useEffect(() => {
    const chart = chartApiRef.current;
    const series = candleSeriesRef.current;
    if (!chart || !series) return;

    const handler = (param: any) => {
      if (drawMode !== 'hline' || !param.point) return;
      const price = series.coordinateToPrice(param.point.y);
      if (price !== null && Number.isFinite(price)) {
        setHLines((prev) => [...prev, Number(price.toFixed(decimals))]);
        setRedoStack([]);
        setDrawMode('crosshair');
      }
    };
    chart.subscribeClick(handler);
    return () => {
      chart.unsubscribeClick(handler);
    };
  }, [drawMode, decimals]);

  // Update Candles + Indicators
  useEffect(() => {
    const series = candleSeriesRef.current;
    if (!series || candles.length === 0) return;

    const formatted = candles.map((c) => ({
      time: c.time as UTCTimestamp,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    }));
    series.setData(formatted);

    smaSeriesRef.current?.setData(showSma20 ? computeSma(candles, 20) : []);
    emaSeriesRef.current?.setData(showEma50 ? computeEma(candles, 50) : []);
    if (showBb) {
      const bb = computeBollinger(candles, 20, 2);
      bbUpperRef.current?.setData(bb.upper);
      bbLowerRef.current?.setData(bb.lower);
    } else {
      bbUpperRef.current?.setData([]);
      bbLowerRef.current?.setData([]);
    }
  }, [candles, showSma20, showEma50, showBb]);

  // Update live last candle on tick
  useEffect(() => {
    if (!liveTick || !candleSeriesRef.current || candles.length === 0) return;
    const last = candles[candles.length - 1];
    const bucket = Math.floor(liveTick.epoch / Math.max(1, timeframe)) * Math.max(1, timeframe);
    const updated =
      bucket > last.time
        ? { time: bucket as UTCTimestamp, open: last.close, high: Math.max(last.close, liveTick.quote), low: Math.min(last.close, liveTick.quote), close: liveTick.quote }
        : { time: last.time as UTCTimestamp, open: last.open, high: Math.max(last.high, liveTick.quote), low: Math.min(last.low, liveTick.quote), close: liveTick.quote };
    try {
      candleSeriesRef.current.update(updated);
    } catch {
      // ignore out-of-order updates
    }
  }, [liveTick, timeframe, candles]);

  // Render horizontal drawings + active order lines
  useEffect(() => {
    const series = candleSeriesRef.current;
    if (!series) return;

    for (const pl of priceLinesRef.current) {
      try {
        series.removePriceLine(pl);
      } catch {
        // ignore
      }
    }
    priceLinesRef.current = [];

    if (drawingsVisible) {
      for (const price of hLines) {
        priceLinesRef.current.push(
          series.createPriceLine({
            price,
            color: '#F59E0B',
            lineWidth: 2,
            lineStyle: LineStyle.Dashed,
            axisLabelVisible: true,
            title: 'H-Line',
          })
        );
      }
    }

    const symOpenOrders = orders.filter((o) => o.status === 'OPEN' && o.symbol === selectedSymbol);
    for (const o of symOpenOrders) {
      priceLinesRef.current.push(
        series.createPriceLine({
          price: o.entry_price,
          color: o.side === 'BUY' ? '#00A878' : '#FF444F',
          lineWidth: 1,
          lineStyle: LineStyle.Solid,
          axisLabelVisible: true,
          title: `${o.side} ${o.lots}L`,
        })
      );
      if (o.tp_price) {
        priceLinesRef.current.push(
          series.createPriceLine({
            price: o.tp_price,
            color: '#10B981',
            lineWidth: 1,
            lineStyle: LineStyle.Dotted,
            axisLabelVisible: true,
            title: `TP $${(o.tp_usd || 0).toFixed(2)}`,
          })
        );
      }
      if (o.sl_price) {
        priceLinesRef.current.push(
          series.createPriceLine({
            price: o.sl_price,
            color: '#EF4444',
            lineWidth: 1,
            lineStyle: LineStyle.Dotted,
            axisLabelVisible: true,
            title: `SL -$${(o.sl_usd || 0).toFixed(2)}`,
          })
        );
      }
    }
  }, [hLines, drawingsVisible, orders, selectedSymbol]);

  const convertToUsdAndPrice = (
    valStr: string,
    unit: SlTpUnit,
    isTp: boolean,
    side: 'BUY' | 'SELL'
  ): { usd: number | null; price: number | null } => {
    const raw = Number(valStr);
    if (!valStr || Number.isNaN(raw) || raw <= 0) return { usd: null, price: null };
    const notional = stakeUsd * multiplier;
    if (unit === 'USD') {
      const pctMove = raw / Math.max(1, notional);
      const delta = currentPrice * pctMove;
      const p = isTp
        ? side === 'BUY' ? currentPrice + delta : currentPrice - delta
        : side === 'BUY' ? currentPrice - delta : currentPrice + delta;
      return { usd: raw, price: Number(p.toFixed(decimals)) };
    }
    if (unit === '%') {
      const usd = Number(((stakeUsd * raw) / 100).toFixed(2));
      const pctMove = usd / Math.max(1, notional);
      const delta = currentPrice * pctMove;
      const p = isTp
        ? side === 'BUY' ? currentPrice + delta : currentPrice - delta
        : side === 'BUY' ? currentPrice - delta : currentPrice + delta;
      return { usd, price: Number(p.toFixed(decimals)) };
    }
    if (unit === 'Pips') {
      const delta = raw * pipSize;
      const p = isTp
        ? side === 'BUY' ? currentPrice + delta : currentPrice - delta
        : side === 'BUY' ? currentPrice - delta : currentPrice + delta;
      const usd = Number(((delta / currentPrice) * notional).toFixed(2));
      return { usd, price: Number(p.toFixed(decimals)) };
    }
    // Price mode
    const delta = Math.abs(raw - currentPrice);
    const usd = Number(((delta / currentPrice) * notional).toFixed(2));
    return { usd, price: raw };
  };

  const handleLotsChange = (newLots: number) => {
    const clamped = Math.max(0.01, Math.min(100, Number(newLots.toFixed(2))));
    setLots(clamped);
    setStakeUsd(Number((clamped * 100).toFixed(2)));
  };

  const handleStakeChange = (newStake: number) => {
    const clamped = Math.max(1, Math.min(10000, newStake));
    setStakeUsd(clamped);
    setLots(Number((clamped / 100).toFixed(2)));
  };

  const applyRrPreset = (ratio: number) => {
    const base = Number(slValue) || 15;
    setSlEnabled(true);
    setTpEnabled(true);
    setTpUnit(slUnit);
    setTpValue(String(Number((base * ratio).toFixed(2))));
  };

  const handlePlaceOrder = async (sideInput: string, contractTypeOverride?: string) => {
    setPlacing(true);
    try {
      const normalizedSide = sideInput === 'BUY' || sideInput === 'CALL' || sideInput === 'DIGITOVER' ? 'BUY' : 'SELL';
      const slData = slEnabled ? convertToUsdAndPrice(slValue, slUnit, false, normalizedSide) : { usd: null, price: null };
      const tpData = tpEnabled ? convertToUsdAndPrice(tpValue, tpUnit, true, normalizedSide) : { usd: null, price: null };

      const endpoint = bulkCount > 1 ? '/api/orders/bulk' : '/api/orders';
      await apiFetch(endpoint, {
        method: 'POST',
        body: JSON.stringify({
          count: bulkCount,
          symbol: selectedSymbol,
          side: sideInput,
          contractType: contractTypeOverride || (tradeMode === 'MT5 Market' ? 'MULTUP' : undefined),
          lots,
          stake: stakeUsd,
          multiplier,
          slUsd: slData.usd,
          tpUsd: tpData.usd,
          slPrice: slData.price,
          tpPrice: tpData.price,
          barrier: tradeMode === 'Over/Under' ? barrier : null,
          duration: tradeMode === 'MT5 Market' ? 5 : durationTicks,
          durationUnit: 't',
          executionMode: accountMode === 'real' && activeConnectedAccount ? 'deriv' : 'virtual',
          connectedAccountId: activeConnectedAccount?.id || null,
        }),
      });
      await Promise.all([refreshOrders(), refreshAll()]);
      showToast(
        `${bulkCount > 1 ? `${bulkCount}x ` : ''}${sideInput} order executed on ${selectedSymbol}`,
        'success'
      );
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Order failed', 'error');
    } finally {
      setPlacing(false);
    }
  };

  const handleCloseOrder = async (id: number) => {
    try {
      await apiFetch(`/api/orders/${id}/close`, { method: 'POST' });
      await Promise.all([refreshOrders(), refreshAll()]);
      showToast('Position closed', 'info');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Close failed', 'error');
    }
  };

  const handleBulkClose = async (filter: 'all' | 'profitable' | 'losing' | 'buy' | 'sell' | 'over' | 'under') => {
    try {
      const res = await apiFetch<{ closedCount: number }>('/api/orders/bulk-close', {
        method: 'POST',
        body: JSON.stringify({ filter }),
      });
      await Promise.all([refreshOrders(), refreshAll()]);
      showToast(`Closed ${res.closedCount} position(s) (${filter})`, 'info');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Bulk close failed', 'error');
    }
  };

  // Filtered MarketWatch list
  const filteredInstruments = useMemo(() => {
    return instruments.filter((inst) => {
      if (showWatchlistOnly && !watchlist.includes(inst.symbol)) return false;
      if (catFilter !== 'All' && inst.category !== catFilter) return false;
      if (
        mwSearch &&
        !inst.display_name.toLowerCase().includes(mwSearch.toLowerCase()) &&
        !inst.symbol.toLowerCase().includes(mwSearch.toLowerCase())
      ) {
        return false;
      }
      return true;
    });
  }, [instruments, showWatchlistOnly, watchlist, catFilter, mwSearch]);

  const openOrders = orders.filter((o) => o.status === 'OPEN');
  const closedOrders = orders.filter((o) => o.status === 'CLOSED');
  const floatingPnl = openOrders.reduce((acc, o) => acc + Number(o.pnl || 0), 0);
  const usedMargin = openOrders.reduce((acc, o) => acc + Number(o.stake || 0), 0);
  const balance =
    accountMode === 'real' && activeConnectedAccount
      ? Number(activeConnectedAccount.balance)
      : Number(user?.virtual_workspace_balance ?? 10000);
  const equity = balance + floatingPnl;
  const freeMargin = Math.max(0, equity - usedMargin);

  // Exposure grouped by symbol
  const exposureBySymbol = useMemo(() => {
    const map: Record<string, { symbol: string; count: number; lots: number; stake: number; pnl: number }> = {};
    for (const o of openOrders) {
      if (!map[o.symbol]) map[o.symbol] = { symbol: o.symbol, count: 0, lots: 0, stake: 0, pnl: 0 };
      map[o.symbol].count += 1;
      map[o.symbol].lots += Number(o.lots || 0);
      map[o.symbol].stake += Number(o.stake || 0);
      map[o.symbol].pnl += Number(o.pnl || 0);
    }
    return Object.values(map);
  }, [openOrders]);

  return (
    <div className="max-w-[1600px] mx-auto px-3 sm:px-6 pt-4 pb-8 space-y-4">
      {/* Top 3-Column Trading Workspace */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
        {/* Left MarketWatch Panel (3 cols) */}
        <aside className="xl:col-span-3 bg-white dark:bg-[#181C25] rounded-2xl border border-slate-200 dark:border-[#2A2F3D] flex flex-col max-h-[540px]">
          <div className="p-3 border-b border-slate-100 dark:border-[#2A2F3D] space-y-2.5">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-sm font-bold">MarketWatch</h2>
              <button
                type="button"
                onClick={() => setShowWatchlistOnly(!showWatchlistOnly)}
                className={`px-2.5 py-1 rounded-full text-[11px] font-semibold flex items-center gap-1 cursor-pointer ${
                  showWatchlistOnly ? 'bg-amber-500/15 text-amber-500' : 'bg-[#F4F5F7] dark:bg-[#111319] text-slate-500'
                }`}
              >
                <Star className="w-3 h-3 fill-current" /> Watchlist
              </button>
            </div>
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#F4F5F7] dark:bg-[#111319]">
              <Search className="w-3.5 h-3.5 text-slate-400" />
              <input
                type="text"
                value={mwSearch}
                onChange={(e) => setMwSearch(e.target.value)}
                placeholder="Search 75+ instruments..."
                className="flex-1 bg-transparent text-xs outline-none"
              />
            </div>
            <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
              {(['All', 'Synthetic', 'Forex', 'Crypto', 'Metals/Cmd', 'Indices'] as const).map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setCatFilter(cat)}
                  className={`px-2.5 py-1 rounded-full text-[11px] font-semibold whitespace-nowrap cursor-pointer ${
                    catFilter === cat
                      ? 'bg-[#151820] text-white dark:bg-white dark:text-[#151820]'
                      : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-white/5'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-[#2A2F3D]">
            {filteredInstruments.map((inst) => {
              const t = ticks[inst.symbol];
              const bid = t?.bid ?? inst.bid;
              const ask = t?.ask ?? inst.ask;
              const active = inst.symbol === selectedSymbol;
              const starred = watchlist.includes(inst.symbol);
              return (
                <div
                  key={inst.symbol}
                  onClick={() => setSelectedSymbol(inst.symbol)}
                  className={`px-3 py-2.5 flex items-center justify-between gap-2 cursor-pointer transition-colors ${
                    active ? 'bg-[#FF444F]/8 border-l-2 border-[#FF444F]' : 'hover:bg-slate-50 dark:hover:bg-white/5'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleWatchlist(inst.symbol);
                      }}
                      className="text-slate-400 hover:text-amber-500 cursor-pointer shrink-0"
                      aria-label="Toggle watchlist"
                    >
                      <Star className={`w-3.5 h-3.5 ${starred ? 'fill-amber-400 text-amber-400' : ''}`} />
                    </button>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold truncate">{inst.display_name}</p>
                      <p className="text-[10px] text-slate-400">{inst.symbol}</p>
                    </div>
                  </div>
                  <div className="text-right font-mono-num text-[11px] shrink-0">
                    <p className="font-bold text-[#00A878]">{bid}</p>
                    <p className="text-slate-400">{ask}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </aside>

        {/* Center Lightweight Chart + Drawing Toolbar (6 cols) */}
        <section className="xl:col-span-6 bg-white dark:bg-[#181C25] rounded-2xl border border-slate-200 dark:border-[#2A2F3D] overflow-hidden flex flex-col">
          {/* Chart Header */}
          <div className="px-4 py-3 border-b border-slate-100 dark:border-[#2A2F3D] flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-display text-base font-bold">{activeInst?.display_name || selectedSymbol}</h1>
                <span className="text-xs font-mono-num px-2 py-0.5 rounded-full bg-[#1958B7]/10 text-[#1958B7] font-semibold">
                  {selectedSymbol}
                </span>
              </div>
              <div className="flex items-center gap-3 mt-0.5 text-xs font-mono-num">
                <span>Bid: <strong className="text-[#FF444F]">{currentBid.toFixed(decimals)}</strong></span>
                <span>Ask: <strong className="text-[#00A878]">{currentAsk.toFixed(decimals)}</strong></span>
                <span className="text-slate-400">Spread: {activeInst?.spread ?? 0.15}</span>
              </div>
            </div>

            {/* Indicators */}
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setShowSma20(!showSma20)}
                className={`px-2.5 py-1 rounded-full text-[11px] font-semibold cursor-pointer ${
                  showSma20 ? 'bg-blue-500/15 text-blue-500' : 'bg-[#F4F5F7] dark:bg-[#111319] text-slate-500'
                }`}
              >
                SMA 20
              </button>
              <button
                type="button"
                onClick={() => setShowEma50(!showEma50)}
                className={`px-2.5 py-1 rounded-full text-[11px] font-semibold cursor-pointer ${
                  showEma50 ? 'bg-amber-500/15 text-amber-500' : 'bg-[#F4F5F7] dark:bg-[#111319] text-slate-500'
                }`}
              >
                EMA 50
              </button>
              <button
                type="button"
                onClick={() => setShowBb(!showBb)}
                className={`px-2.5 py-1 rounded-full text-[11px] font-semibold cursor-pointer ${
                  showBb ? 'bg-violet-500/15 text-violet-500' : 'bg-[#F4F5F7] dark:bg-[#111319] text-slate-500'
                }`}
              >
                BB(20)
              </button>
            </div>
          </div>

          {/* Timeframe Bar + Drawing Toolbar */}
          <div className="px-3 py-2 border-b border-slate-100 dark:border-[#2A2F3D] flex flex-wrap items-center justify-between gap-2 bg-[#F8F9FB] dark:bg-[#151820]">
            <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
              {TIMEFRAMES.map((tf) => (
                <button
                  key={tf.label}
                  type="button"
                  onClick={() => setTimeframe(tf.granularity)}
                  className={`px-2 py-1 rounded-lg text-[11px] font-mono-num font-semibold cursor-pointer ${
                    timeframe === tf.granularity
                      ? 'bg-[#FF444F] text-white'
                      : 'text-slate-500 hover:bg-slate-200/70 dark:hover:bg-white/10'
                  }`}
                >
                  {tf.label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setDrawMode('crosshair')}
                title="Crosshair"
                className={`p-1.5 rounded-lg cursor-pointer ${drawMode === 'crosshair' ? 'bg-[#151820] text-white dark:bg-white dark:text-[#151820]' : 'text-slate-500'}`}
              >
                <Crosshair className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => {
                  setDrawMode(drawMode === 'hline' ? 'crosshair' : 'hline');
                  showToast('Click chart to place Horizontal Price Line', 'info');
                }}
                title="Horizontal Price Line"
                className={`p-1.5 rounded-lg cursor-pointer ${drawMode === 'hline' ? 'bg-[#FF444F] text-white' : 'text-slate-500'}`}
              >
                <Minus className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => {
                  if (hLines.length === 0) return;
                  const last = hLines[hLines.length - 1];
                  setHLines(hLines.slice(0, -1));
                  setRedoStack([...redoStack, last]);
                }}
                title="Undo"
                className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-200/60 dark:hover:bg-white/10 cursor-pointer"
              >
                <Undo2 className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => {
                  if (redoStack.length === 0) return;
                  const last = redoStack[redoStack.length - 1];
                  setRedoStack(redoStack.slice(0, -1));
                  setHLines([...hLines, last]);
                }}
                title="Redo"
                className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-200/60 dark:hover:bg-white/10 cursor-pointer"
              >
                <Redo2 className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setDrawingsVisible(!drawingsVisible)}
                title="Show/Hide Drawings"
                className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-200/60 dark:hover:bg-white/10 cursor-pointer"
              >
                {drawingsVisible ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
              </button>
              <button
                type="button"
                onClick={() => {
                  setHLines([]);
                  setRedoStack([]);
                }}
                title="Clear All"
                className="p-1.5 rounded-lg text-slate-500 hover:text-[#FF444F] cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div ref={chartContainerRef} className="w-full h-[410px]" />
        </section>

        {/* Right Order Ticket (3 cols) */}
        <aside className="xl:col-span-3 bg-white dark:bg-[#181C25] rounded-2xl border border-slate-200 dark:border-[#2A2F3D] p-4 space-y-4">
          {/* Trade Mode Selector */}
          <div className="grid grid-cols-3 gap-1 bg-[#F4F5F7] dark:bg-[#111319] p-1 rounded-xl">
            {(['MT5 Market', 'Over/Under', 'Rise/Fall'] as TradeMode[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setTradeMode(m)}
                className={`py-1.5 rounded-lg text-[11px] font-bold cursor-pointer ${
                  tradeMode === m ? 'bg-white dark:bg-[#2A2F3D] shadow-xs' : 'text-slate-500'
                }`}
              >
                {m}
              </button>
            ))}
          </div>

          {/* Volume Lots synced 1:100 USD */}
          <div>
            <div className="flex items-center justify-between text-xs mb-1.5">
              <span className="font-semibold text-slate-500">Volume, Lots</span>
              <span className="font-mono-num font-semibold text-slate-700 dark:text-slate-300">
                Stake: ${stakeUsd.toFixed(2)}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => handleLotsChange(lots - 0.01)}
                className="w-9 h-9 rounded-xl bg-[#F4F5F7] dark:bg-[#111319] font-bold cursor-pointer"
              >
                -
              </button>
              <input
                type="number"
                step="0.01"
                min="0.01"
                max="100"
                value={lots}
                onChange={(e) => handleLotsChange(Number(e.target.value))}
                className="flex-1 text-center py-2 rounded-xl bg-[#F4F5F7] dark:bg-[#111319] font-mono-num text-sm font-bold"
              />
              <button
                type="button"
                onClick={() => handleLotsChange(lots + 0.01)}
                className="w-9 h-9 rounded-xl bg-[#F4F5F7] dark:bg-[#111319] font-bold cursor-pointer"
              >
                +
              </button>
            </div>
            <div className="grid grid-cols-5 gap-1 mt-2">
              {[0.01, 0.05, 0.1, 0.5, 1.0].map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => handleLotsChange(preset)}
                  className={`py-1 rounded-lg font-mono-num text-[11px] font-semibold cursor-pointer ${
                    Math.abs(lots - preset) < 0.001
                      ? 'bg-[#1958B7] text-white'
                      : 'bg-[#F4F5F7] dark:bg-[#111319] text-slate-600 dark:text-slate-300'
                  }`}
                >
                  {preset}
                </button>
              ))}
            </div>
          </div>

          {/* Stake USD direct + Multiplier */}
          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="block text-[11px] font-semibold text-slate-500 mb-1">Stake (USD)</label>
              <input
                type="number"
                min="1"
                value={stakeUsd}
                onChange={(e) => handleStakeChange(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-xl bg-[#F4F5F7] dark:bg-[#111319] font-mono-num text-sm font-bold"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-500 mb-1">Leverage</label>
              <div className="grid grid-cols-4 gap-1">
                {[50, 100, 200, 400].map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMultiplier(m)}
                    className={`py-2 rounded-lg text-[10px] font-mono-num font-bold cursor-pointer ${
                      multiplier === m ? 'bg-[#151820] text-white dark:bg-white dark:text-[#151820]' : 'bg-[#F4F5F7] dark:bg-[#111319]'
                    }`}
                  >
                    x{m}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {tradeMode === 'Over/Under' && (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[11px] font-semibold text-slate-500 mb-1">Barrier Digit (0–9)</label>
                <input
                  type="number"
                  min="0"
                  max="9"
                  value={barrier}
                  onChange={(e) => setBarrier(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-[#F4F5F7] dark:bg-[#111319] font-mono-num text-sm font-bold"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-500 mb-1">Duration (Ticks)</label>
                <input
                  type="number"
                  min="1"
                  max="10"
                  value={durationTicks}
                  onChange={(e) => setDurationTicks(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-xl bg-[#F4F5F7] dark:bg-[#111319] font-mono-num text-sm font-bold"
                />
              </div>
            </div>
          )}

          {tradeMode === 'Rise/Fall' && (
            <div>
              <label className="block text-[11px] font-semibold text-slate-500 mb-1">Duration (Ticks)</label>
              <input
                type="number"
                min="1"
                max="10"
                value={durationTicks}
                onChange={(e) => setDurationTicks(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-xl bg-[#F4F5F7] dark:bg-[#111319] font-mono-num text-sm font-bold"
              />
            </div>
          )}

          {/* SL & TP 4-Mode Controls (Default USD) */}
          {tradeMode === 'MT5 Market' && (
            <div className="space-y-2.5 pt-1 border-t border-slate-100 dark:border-[#2A2F3D]">
              {/* Stop Loss */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="flex items-center gap-1.5 text-xs font-semibold">
                    <input type="checkbox" checked={slEnabled} onChange={(e) => setSlEnabled(e.target.checked)} />
                    Stop Loss
                  </label>
                  <div className="flex items-center gap-1">
                    {(['USD', 'Price', '%', 'Pips'] as SlTpUnit[]).map((u) => (
                      <button
                        key={u}
                        type="button"
                        onClick={() => setSlUnit(u)}
                        className={`px-1.5 py-0.5 rounded text-[10px] font-bold cursor-pointer ${
                          slUnit === u ? 'bg-[#FF444F] text-white' : 'bg-[#F4F5F7] dark:bg-[#111319] text-slate-500'
                        }`}
                      >
                        {u}
                      </button>
                    ))}
                  </div>
                </div>
                {slEnabled && (
                  <input
                    type="number"
                    step="any"
                    value={slValue}
                    onChange={(e) => setSlValue(e.target.value)}
                    className="w-full px-3 py-1.5 rounded-xl bg-[#F4F5F7] dark:bg-[#111319] font-mono-num text-xs font-bold"
                  />
                )}
              </div>

              {/* Take Profit */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="flex items-center gap-1.5 text-xs font-semibold">
                    <input type="checkbox" checked={tpEnabled} onChange={(e) => setTpEnabled(e.target.checked)} />
                    Take Profit
                  </label>
                  <div className="flex items-center gap-1">
                    {(['USD', 'Price', '%', 'Pips'] as SlTpUnit[]).map((u) => (
                      <button
                        key={u}
                        type="button"
                        onClick={() => setTpUnit(u)}
                        className={`px-1.5 py-0.5 rounded text-[10px] font-bold cursor-pointer ${
                          tpUnit === u ? 'bg-[#00A878] text-white' : 'bg-[#F4F5F7] dark:bg-[#111319] text-slate-500'
                        }`}
                      >
                        {u}
                      </button>
                    ))}
                  </div>
                </div>
                {tpEnabled && (
                  <input
                    type="number"
                    step="any"
                    value={tpValue}
                    onChange={(e) => setTpValue(e.target.value)}
                    className="w-full px-3 py-1.5 rounded-xl bg-[#F4F5F7] dark:bg-[#111319] font-mono-num text-xs font-bold"
                  />
                )}
              </div>

              {/* R:R Presets */}
              <div className="flex items-center justify-between gap-1.5">
                <span className="text-[11px] text-slate-500">R:R Presets</span>
                <div className="flex gap-1">
                  {[
                    { label: '1:1', r: 1 },
                    { label: '1:1.5', r: 1.5 },
                    { label: '1:2', r: 2 },
                  ].map((p) => (
                    <button
                      key={p.label}
                      type="button"
                      onClick={() => applyRrPreset(p.r)}
                      className="px-2 py-1 rounded-lg bg-[#F4F5F7] dark:bg-[#111319] text-[10px] font-mono-num font-semibold hover:bg-slate-200 dark:hover:bg-white/10 cursor-pointer"
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Bulk Order Count */}
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">Bulk Order Count</span>
            <select
              value={bulkCount}
              onChange={(e) => setBulkCount(Number(e.target.value))}
              className="px-3 py-1.5 rounded-xl bg-[#F4F5F7] dark:bg-[#111319] font-mono-num text-xs font-bold"
            >
              {[1, 2, 3, 5, 10].map((c) => (
                <option key={c} value={c}>
                  {c}x Order{c > 1 ? 's' : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Execution Buttons */}
          {tradeMode === 'MT5 Market' && (
            <div className="grid grid-cols-2 gap-2.5 pt-1">
              <button
                type="button"
                disabled={placing}
                onClick={() => handlePlaceOrder('SELL', 'MULTDOWN')}
                className="py-3 rounded-2xl bg-[#FF444F] hover:bg-[#E63946] text-white font-bold text-xs flex flex-col items-center cursor-pointer disabled:opacity-60"
              >
                <span className="flex items-center gap-1">
                  <TrendingDown className="w-3.5 h-3.5" /> SELL
                </span>
                <span className="font-mono-num text-[11px] opacity-90">{currentBid.toFixed(decimals)}</span>
              </button>
              <button
                type="button"
                disabled={placing}
                onClick={() => handlePlaceOrder('BUY', 'MULTUP')}
                className="py-3 rounded-2xl bg-[#00A878] hover:bg-[#00966B] text-white font-bold text-xs flex flex-col items-center cursor-pointer disabled:opacity-60"
              >
                <span className="flex items-center gap-1">
                  <TrendingUp className="w-3.5 h-3.5" /> BUY
                </span>
                <span className="font-mono-num text-[11px] opacity-90">{currentAsk.toFixed(decimals)}</span>
              </button>
            </div>
          )}

          {tradeMode === 'Over/Under' && (
            <div className="grid grid-cols-2 gap-2.5 pt-1">
              <button
                type="button"
                disabled={placing}
                onClick={() => handlePlaceOrder('DIGITOVER', 'DIGITOVER')}
                className="py-3 rounded-2xl bg-[#00A878] hover:bg-[#00966B] text-white font-bold text-xs cursor-pointer"
              >
                OVER {barrier}
              </button>
              <button
                type="button"
                disabled={placing}
                onClick={() => handlePlaceOrder('DIGITUNDER', 'DIGITUNDER')}
                className="py-3 rounded-2xl bg-[#FF444F] hover:bg-[#E63946] text-white font-bold text-xs cursor-pointer"
              >
                UNDER {barrier}
              </button>
            </div>
          )}

          {tradeMode === 'Rise/Fall' && (
            <div className="grid grid-cols-2 gap-2.5 pt-1">
              <button
                type="button"
                disabled={placing}
                onClick={() => handlePlaceOrder('CALL', 'CALL')}
                className="py-3 rounded-2xl bg-[#00A878] hover:bg-[#00966B] text-white font-bold text-xs cursor-pointer"
              >
                RISE / CALL
              </button>
              <button
                type="button"
                disabled={placing}
                onClick={() => handlePlaceOrder('PUT', 'PUT')}
                className="py-3 rounded-2xl bg-[#FF444F] hover:bg-[#E63946] text-white font-bold text-xs cursor-pointer"
              >
                FALL / PUT
              </button>
            </div>
          )}
        </aside>
      </div>

      {/* Bottom MT5 Terminal Dock */}
      <section className="bg-white dark:bg-[#181C25] rounded-2xl border border-slate-200 dark:border-[#2A2F3D] overflow-hidden">
        {/* Account Metrics Strip */}
        <div className="px-4 py-3 bg-[#151820] text-white flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-6 text-xs">
            <div>
              <span className="text-slate-400">Balance: </span>
              <strong className="font-mono-num">{formatMoney(balance)}</strong>
            </div>
            <div>
              <span className="text-slate-400">Equity: </span>
              <strong className="font-mono-num">{formatMoney(equity)}</strong>
            </div>
            <div>
              <span className="text-slate-400">Margin: </span>
              <strong className="font-mono-num">{formatMoney(usedMargin)}</strong>
            </div>
            <div>
              <span className="text-slate-400">Free Margin: </span>
              <strong className="font-mono-num">{formatMoney(freeMargin)}</strong>
            </div>
            <div>
              <span className="text-slate-400">Floating P/L: </span>
              <strong className={`font-mono-num ${floatingPnl >= 0 ? 'text-[#00A878]' : 'text-[#FF444F]'}`}>
                {floatingPnl >= 0 ? '+' : ''}
                {floatingPnl.toFixed(2)} USD
              </strong>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {([
              { id: 'open', label: `Open Positions (${openOrders.length})` },
              { id: 'history', label: `History (${closedOrders.length})` },
              { id: 'exposure', label: 'Exposure Summary' },
            ] as Array<{ id: DockTab; label: string }>).map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setDockTab(t.id)}
                className={`px-3 py-1 rounded-full text-xs font-semibold cursor-pointer ${
                  dockTab === t.id ? 'bg-[#FF444F] text-white' : 'bg-white/10 text-slate-300'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* 7 Bulk Close Actions */}
        {dockTab === 'open' && openOrders.length > 0 && (
          <div className="px-4 py-2.5 border-b border-slate-100 dark:border-[#2A2F3D] flex flex-wrap items-center gap-2 bg-[#F8F9FB] dark:bg-[#151820]">
            <span className="text-[11px] font-semibold text-slate-500 mr-1">Bulk Close:</span>
            {[
              { id: 'all', label: 'Close All' },
              { id: 'profitable', label: 'Close Profitable' },
              { id: 'losing', label: 'Close Losing' },
              { id: 'buy', label: 'Close All BUY' },
              { id: 'sell', label: 'Close All SELL' },
              { id: 'over', label: 'Close Over' },
              { id: 'under', label: 'Close Under' },
            ].map((b) => (
              <button
                key={b.id}
                type="button"
                onClick={() => handleBulkClose(b.id as any)}
                className="px-2.5 py-1 rounded-lg bg-white dark:bg-[#1A1D26] border border-slate-200 dark:border-[#2A2F3D] text-[11px] font-semibold hover:border-[#FF444F] cursor-pointer"
              >
                {b.label}
              </button>
            ))}
          </div>
        )}

        <div className="overflow-x-auto">
          {dockTab === 'open' && (
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-100 dark:border-[#2A2F3D] text-slate-500">
                  <th className="text-left px-4 py-2.5">Symbol</th>
                  <th className="text-left px-4 py-2.5">Side</th>
                  <th className="text-right px-4 py-2.5">Lots / Stake</th>
                  <th className="text-right px-4 py-2.5">Entry</th>
                  <th className="text-right px-4 py-2.5">Current</th>
                  <th className="text-right px-4 py-2.5">SL / TP</th>
                  <th className="text-right px-4 py-2.5">P/L</th>
                  <th className="text-right px-4 py-2.5">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-[#2A2F3D]">
                {openOrders.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-6 text-center text-slate-500">
                      No open positions. Select an instrument and click BUY or SELL above.
                    </td>
                  </tr>
                ) : (
                  openOrders.map((o) => (
                    <tr key={o.id}>
                      <td className="px-4 py-2.5 font-semibold">{o.symbol}</td>
                      <td className="px-4 py-2.5">
                        <span
                          className={`px-2 py-0.5 rounded-full font-bold text-[10px] ${
                            o.side === 'BUY' || o.side === 'CALL' || o.side === 'DIGITOVER'
                              ? 'bg-[#00A878]/15 text-[#00A878]'
                              : 'bg-[#FF444F]/15 text-[#FF444F]'
                          }`}
                        >
                          {o.side}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono-num">
                        {o.lots}L (${o.stake})
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono-num">{o.entry_price}</td>
                      <td className="px-4 py-2.5 text-right font-mono-num">{o.current_price}</td>
                      <td className="px-4 py-2.5 text-right font-mono-num text-slate-500">
                        {o.sl_usd ? `-$${o.sl_usd}` : '—'} / {o.tp_usd ? `+$${o.tp_usd}` : '—'}
                      </td>
                      <td
                        className={`px-4 py-2.5 text-right font-mono-num font-bold ${
                          o.pnl >= 0 ? 'text-[#00A878]' : 'text-[#FF444F]'
                        }`}
                      >
                        {o.pnl >= 0 ? '+' : ''}
                        {Number(o.pnl).toFixed(2)}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <button
                          type="button"
                          onClick={() => handleCloseOrder(o.id)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#FF444F]/10 text-[#FF444F] font-semibold hover:bg-[#FF444F] hover:text-white cursor-pointer"
                        >
                          <X className="w-3 h-3" /> Close
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}

          {dockTab === 'history' && (
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-100 dark:border-[#2A2F3D] text-slate-500">
                  <th className="text-left px-4 py-2.5">Symbol</th>
                  <th className="text-left px-4 py-2.5">Side</th>
                  <th className="text-right px-4 py-2.5">Stake</th>
                  <th className="text-right px-4 py-2.5">Entry → Exit</th>
                  <th className="text-right px-4 py-2.5">Realized P/L</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-[#2A2F3D]">
                {closedOrders.slice(0, 30).map((o) => (
                  <tr key={o.id}>
                    <td className="px-4 py-2.5 font-semibold">{o.symbol}</td>
                    <td className="px-4 py-2.5">{o.side}</td>
                    <td className="px-4 py-2.5 text-right font-mono-num">${o.stake}</td>
                    <td className="px-4 py-2.5 text-right font-mono-num">
                      {o.entry_price} → {o.exit_price ?? o.current_price}
                    </td>
                    <td
                      className={`px-4 py-2.5 text-right font-mono-num font-bold ${
                        o.pnl >= 0 ? 'text-[#00A878]' : 'text-[#FF444F]'
                      }`}
                    >
                      {o.pnl >= 0 ? '+' : ''}
                      {Number(o.pnl).toFixed(2)} USD
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {dockTab === 'exposure' && (
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-100 dark:border-[#2A2F3D] text-slate-500">
                  <th className="text-left px-4 py-2.5">Symbol</th>
                  <th className="text-right px-4 py-2.5">Open Trades</th>
                  <th className="text-right px-4 py-2.5">Net Lots</th>
                  <th className="text-right px-4 py-2.5">Total Margin</th>
                  <th className="text-right px-4 py-2.5">Net P/L</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-[#2A2F3D]">
                {exposureBySymbol.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-6 text-center text-slate-500">
                      No active market exposure.
                    </td>
                  </tr>
                ) : (
                  exposureBySymbol.map((ex) => (
                    <tr key={ex.symbol}>
                      <td className="px-4 py-2.5 font-semibold">{ex.symbol}</td>
                      <td className="px-4 py-2.5 text-right font-mono-num">{ex.count}</td>
                      <td className="px-4 py-2.5 text-right font-mono-num">{ex.lots.toFixed(2)}L</td>
                      <td className="px-4 py-2.5 text-right font-mono-num">${ex.stake.toFixed(2)}</td>
                      <td
                        className={`px-4 py-2.5 text-right font-mono-num font-bold ${
                          ex.pnl >= 0 ? 'text-[#00A878]' : 'text-[#FF444F]'
                        }`}
                      >
                        {ex.pnl >= 0 ? '+' : ''}
                        {ex.pnl.toFixed(2)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </div>
  );
};
