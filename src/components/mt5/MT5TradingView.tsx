import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  createChart,
  CandlestickSeries,
  LineSeries,
  AreaSeries,
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
  Maximize2,
  Minimize2,
  SlidersHorizontal,
  Sparkles,
  BellPlus,
  Download,
  Slash,
  Layers,
  AlertTriangle,
  Send,
  X,
  CheckCircle2,
  Wifi,
  WifiOff,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { apiFetch } from '../../lib/api';
import { getCanonicalBalances } from '../../lib/balances';
import { computeAllIndicators, STRATEGY_CATALOG } from '../../lib/quant-engine';
import type { CandleData, MarketInstrument, WorkspacePreferences } from '../../types';

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
type ChartMode = 'candles' | 'line' | 'area';
type DrawMode = 'crosshair' | 'hline' | 'trendline' | 'fib' | 'fibext';

type IndicatorPrefs = NonNullable<WorkspacePreferences['chartIndicators']>;

interface TrendLineObj {
  id: string;
  t1: number;
  p1: number;
  t2: number;
  p2: number;
}

interface FibObj {
  id: string;
  low: number;
  high: number;
  mode: 'retracement' | 'extension';
}

type DrawingAction =
  | { type: 'hline'; price: number }
  | { type: 'trendline'; item: TrendLineObj }
  | { type: 'fib'; item: FibObj };

const DEFAULT_IND_PREFS: IndicatorPrefs = {
  chartMode: 'candles',
  ema9: false,
  ema20: true,
  ema50: false,
  ema200: false,
  sma20: false,
  sma50: false,
  bb: false,
  psar: false,
  vwap: false,
  smc: false,
  rsi14: true,
  macd: true,
  stochastic: false,
  atr14: true,
  adx14: true,
};

function toSeriesPoints(candles: CandleData[], arr: Array<number | null>) {
  const out: Array<{ time: UTCTimestamp; value: number }> = [];
  for (let i = 0; i < candles.length; i++) {
    const v = arr[i];
    if (v !== null && v !== undefined && Number.isFinite(v)) {
      out.push({ time: candles[i].time as UTCTimestamp, value: v });
    }
  }
  return out;
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
    wsConnected,
    orders,
    watchlist,
    toggleWatchlist,
    refreshOrders,
    refreshAll,
    formatMoney,
    theme,
    showToast,
    workspacePreferences,
    saveWorkspacePreferences,
  } = useApp();

  // MarketWatch Panel
  const [catFilter, setCatFilter] = useState<'All' | MarketInstrument['category']>('All');
  const [mwSearch, setMwSearch] = useState('');
  const [showWatchlistOnly, setShowWatchlistOnly] = useState(false);
  const [mobileMwOpen, setMobileMwOpen] = useState(false);

  // Chart & Data State
  const [timeframe, setTimeframe] = useState(900);
  const [candles, setCandles] = useState<CandleData[]>([]);
  const [candleSource, setCandleSource] = useState<'deriv_ws' | 'unavailable'>('deriv_ws');
  const [candleError, setCandleError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [indPanelOpen, setIndPanelOpen] = useState(false);
  const [ohlcHover, setOhlcHover] = useState<{
    open: number;
    high: number;
    low: number;
    close: number;
    time: number;
  } | null>(null);

  // Indicator preferences synced with workspacePreferences
  const [indPrefs, setIndPrefs] = useState<IndicatorPrefs>(() => ({
    ...DEFAULT_IND_PREFS,
    ...(workspacePreferences.chartIndicators || {}),
  }));

  useEffect(() => {
    if (workspacePreferences.chartIndicators) {
      setIndPrefs((prev) => ({ ...prev, ...workspacePreferences.chartIndicators }));
    }
  }, [workspacePreferences.chartIndicators]);

  const updateIndPrefs = (patch: Partial<IndicatorPrefs>) => {
    setIndPrefs((prev) => {
      const next = { ...prev, ...patch };
      saveWorkspacePreferences({ chartIndicators: next });
      return next;
    });
  };

  // SMC Overlay data
  const [smcData, setSmcData] = useState<any>(null);

  // Drawing Toolbar State
  const [drawMode, setDrawMode] = useState<DrawMode>('crosshair');
  const [pendingPoint, setPendingPoint] = useState<{ time: number; price: number } | null>(null);
  const [hLines, setHLines] = useState<number[]>([]);
  const [trendLines, setTrendLines] = useState<TrendLineObj[]>([]);
  const [fibs, setFibs] = useState<FibObj[]>([]);
  const [undoHistory, setUndoHistory] = useState<DrawingAction[]>([]);
  const [redoHistory, setRedoHistory] = useState<DrawingAction[]>([]);
  const [drawingsVisible, setDrawingsVisible] = useState(true);

  // Load saved drawings when symbol or workspacePreferences changes
  useEffect(() => {
    const saved = workspacePreferences.chartDrawings?.[selectedSymbol];
    setHLines(saved?.hLines || []);
    setTrendLines(saved?.trendLines || []);
    setFibs(saved?.fibs || []);
    setPendingPoint(null);
    setUndoHistory([]);
    setRedoHistory([]);
  }, [selectedSymbol, workspacePreferences.chartDrawings]);

  const persistDrawings = useCallback(
    (nextH: number[], nextT: TrendLineObj[], nextF: FibObj[]) => {
      const currentAll = workspacePreferences.chartDrawings || {};
      saveWorkspacePreferences({
        chartDrawings: {
          ...currentAll,
          [selectedSymbol]: { hLines: nextH, trendLines: nextT, fibs: nextF },
        },
      });
    },
    [selectedSymbol, workspacePreferences.chartDrawings, saveWorkspacePreferences]
  );

  // Order Ticket State
  const [tradeMode, setTradeMode] = useState<TradeMode>('MT5 Market');
  const [lots, setLots] = useState(0.1);
  const [stakeUsd, setStakeUsd] = useState(10);
  const [multiplier, setMultiplier] = useState(100);
  const [bulkCount, setBulkCount] = useState(1);
  const [barrier, setBarrier] = useState('4');
  const [durationTicks, setDurationTicks] = useState(5);
  const [strategyTag, setStrategyTag] = useState<string>('');

  // Contract capabilities & live Deriv proposal
  const [contractsAvailable, setContractsAvailable] = useState<string[]>([]);
  const [proposalInfo, setProposalInfo] = useState<{ payout?: number; ask_price?: number; spot?: number; error?: string } | null>(null);

  // SL / TP Controls
  const [slEnabled, setSlEnabled] = useState(true);
  const [tpEnabled, setTpEnabled] = useState(true);
  const [slUnit, setSlUnit] = useState<SlTpUnit>('USD');
  const [tpUnit, setTpUnit] = useState<SlTpUnit>('USD');
  const [slValue, setSlValue] = useState('15');
  const [tpValue, setTpValue] = useState('30');
  const [placing, setPlacing] = useState(false);

  // Real-Money Confirmation Modal
  const [confirmRealOrder, setConfirmRealOrder] = useState<{
    sideInput: string;
    contractTypeOverride?: string;
  } | null>(null);

  // Quick Price Alert Modal
  const [alertModalOpen, setAlertModalOpen] = useState(false);
  const [alertTargetPrice, setAlertTargetPrice] = useState('');
  const [alertDirection, setAlertDirection] = useState<'price_above' | 'price_below'>('price_above');
  const [alertMsg, setAlertMsg] = useState('');

  // AI Co-Pilot Drawer
  const [copilotOpen, setCopilotOpen] = useState(false);
  const [copilotPrompt, setCopilotPrompt] = useState('');
  const [copilotLoading, setCopilotLoading] = useState(false);
  const [copilotAnswer, setCopilotAnswer] = useState<string | null>(null);
  const [copilotError, setCopilotError] = useState<string | null>(null);

  // Bottom Dock
  const [dockTab, setDockTab] = useState<DockTab>('open');
  const [historySearch, setHistorySearch] = useState('');
  const [historyModeFilter, setHistoryModeFilter] = useState<'all' | 'real' | 'demo'>('all');

  // Chart Refs
  const chartContainerRef = useRef<HTMLDivElement | null>(null);
  const chartApiRef = useRef<IChartApi | null>(null);
  const mainSeriesRef = useRef<ISeriesApi<'Candlestick'> | ISeriesApi<'Line'> | ISeriesApi<'Area'> | null>(null);
  const overlaySeriesRef = useRef<Record<string, ISeriesApi<'Line'>>>({});
  const trendSeriesRef = useRef<Array<ISeriesApi<'Line'>>>([]);
  const priceLinesRef = useRef<IPriceLine[]>([]);
  const liveBarRef = useRef<CandleData | null>(null);

  const activeInst = useMemo(
    () => instruments.find((i) => i.symbol === selectedSymbol) || instruments[0],
    [instruments, selectedSymbol]
  );

  const liveTick = ticks[selectedSymbol];
  const hasLiveWsTick = liveTick?.source === 'deriv_ws';
  const lastCandleClose = candles.length > 0 ? candles[candles.length - 1].close : undefined;
  const currentPrice = hasLiveWsTick ? liveTick.quote : (lastCandleClose ?? liveTick?.quote ?? activeInst?.price ?? 1000);
  const spreadVal = activeInst?.spread ?? 0.2;
  const pipSize = liveTick?.pipSize ?? activeInst?.pip_size ?? 0.01;
  const decimals = pipSize < 0.0001 ? 5 : pipSize < 0.001 ? 4 : 2;
  const currentBid = hasLiveWsTick
    ? liveTick.bid
    : lastCandleClose !== undefined
      ? Number((lastCandleClose - spreadVal / 2).toFixed(decimals))
      : (activeInst?.bid ?? currentPrice);
  const currentAsk = hasLiveWsTick
    ? liveTick.ask
    : lastCandleClose !== undefined
      ? Number((lastCandleClose + spreadVal / 2).toFixed(decimals))
      : (activeInst?.ask ?? currentPrice);
  const chartMode: ChartMode = indPrefs.chartMode || 'candles';

  // Fetch candles
  const loadCandles = useCallback(async () => {
    try {
      const res = await apiFetch<{
        candles: CandleData[];
        source?: 'deriv_ws' | 'unavailable';
        error?: string | null;
        lastUpdated?: string;
      }>(`/api/market/candles?symbol=${encodeURIComponent(selectedSymbol)}&granularity=${timeframe}&count=180`, {
        skipAuth: true,
      });
      setCandles(res.candles || []);
      setCandleSource(res.source || (res.candles?.length ? 'deriv_ws' : 'unavailable'));
      setCandleError(res.error || null);
      setLastUpdated(res.lastUpdated || new Date().toISOString());
    } catch (err) {
      setCandles([]);
      setCandleSource('unavailable');
      setCandleError(err instanceof Error ? err.message : 'Unable to load candles');
    }
  }, [selectedSymbol, timeframe]);

  useEffect(() => {
    loadCandles();
    const intervalMs = timeframe <= 60 ? 4000 : 12000;
    const timer = setInterval(loadCandles, intervalMs);
    return () => clearInterval(timer);
  }, [loadCandles, timeframe]);

  // Fetch SMC analysis when enabled
  useEffect(() => {
    if (!indPrefs.smc) {
      setSmcData(null);
      return;
    }
    const g = timeframe < 60 ? 60 : timeframe;
    apiFetch(`/api/intelligence/analyze?symbol=${encodeURIComponent(selectedSymbol)}&granularity=${g}&count=160`, {
      skipAuth: true,
    })
      .then((res) => setSmcData(res))
      .catch(() => setSmcData(null));
  }, [indPrefs.smc, selectedSymbol, timeframe]);

  // Fetch Deriv contract capabilities for symbol
  useEffect(() => {
    apiFetch<{ available: Array<{ contract_type: string }> }>(
      `/api/deriv/contracts-for?symbol=${encodeURIComponent(selectedSymbol)}`,
      { skipAuth: true }
    )
      .then((res) => {
        const types = Array.from(new Set((res.available || []).map((c) => String(c.contract_type || '').toUpperCase())));
        setContractsAvailable(types);
      })
      .catch(() => setContractsAvailable([]));
  }, [selectedSymbol]);

  // Compute all 10 indicators causally
  const computedIndicators = useMemo(() => {
    if (candles.length < 5) return null;
    return computeAllIndicators(candles);
  }, [candles]);

  const latestIndReadout = useMemo(() => {
    if (!computedIndicators || candles.length === 0) return null;
    const n = candles.length - 1;
    return {
      rsi14: computedIndicators.rsi14[n],
      macdLine: computedIndicators.macd.line[n],
      macdSignal: computedIndicators.macd.signal[n],
      macdHist: computedIndicators.macd.histogram[n],
      stochK: computedIndicators.stochastic.k[n],
      stochD: computedIndicators.stochastic.d[n],
      atr14: computedIndicators.atr14[n],
      adx14: computedIndicators.adx14.adx[n],
      plusDi: computedIndicators.adx14.plusDi[n],
      minusDi: computedIndicators.adx14.minusDi[n],
      vwapAvailable: computedIndicators.vwap.available,
      vwapReason: computedIndicators.vwap.reason,
      vwapVal: computedIndicators.vwap.values[n],
    };
  }, [computedIndicators, candles.length]);

  // Initialize Lightweight Chart v5
  useEffect(() => {
    const el = chartContainerRef.current;
    if (!el) return;

    const isDark = theme === 'dark';
    const chartHeight = isFullscreen ? Math.max(460, window.innerHeight - 230) : 420;
    const chart = createChart(el, {
      width: el.clientWidth,
      height: chartHeight,
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

    let mainSeries: ISeriesApi<'Candlestick'> | ISeriesApi<'Line'> | ISeriesApi<'Area'>;
    if (chartMode === 'line') {
      mainSeries = chart.addSeries(LineSeries, { color: '#FF444F', lineWidth: 2 });
    } else if (chartMode === 'area') {
      mainSeries = chart.addSeries(AreaSeries, {
        lineColor: '#FF444F',
        topColor: 'rgba(255, 68, 79, 0.28)',
        bottomColor: 'rgba(255, 68, 79, 0.02)',
        lineWidth: 2,
      });
    } else {
      mainSeries = chart.addSeries(CandlestickSeries, {
        upColor: '#00A878',
        downColor: '#FF444F',
        borderVisible: false,
        wickUpColor: '#00A878',
        wickDownColor: '#FF444F',
      });
    }

    const overlayDefs: Array<{ key: string; color: string; lineStyle?: LineStyle; lineWidth?: 1 | 2 }> = [
      { key: 'ema9', color: '#06B6D4', lineWidth: 1 },
      { key: 'ema20', color: '#3B82F6', lineWidth: 2 },
      { key: 'ema50', color: '#F59E0B', lineWidth: 2 },
      { key: 'ema200', color: '#EC4899', lineWidth: 2 },
      { key: 'sma20', color: '#6366F1', lineWidth: 1 },
      { key: 'sma50', color: '#14B8A6', lineWidth: 1 },
      { key: 'bbUpper', color: '#8B5CF6', lineStyle: LineStyle.Dashed, lineWidth: 1 },
      { key: 'bbLower', color: '#8B5CF6', lineStyle: LineStyle.Dashed, lineWidth: 1 },
      { key: 'psar', color: '#F97316', lineStyle: LineStyle.Dotted, lineWidth: 2 },
      { key: 'vwap', color: '#10B981', lineStyle: LineStyle.Solid, lineWidth: 2 },
    ];

    const overlays: Record<string, ISeriesApi<'Line'>> = {};
    for (const def of overlayDefs) {
      overlays[def.key] = chart.addSeries(LineSeries, {
        color: def.color,
        lineWidth: def.lineWidth || 1,
        lineStyle: def.lineStyle ?? LineStyle.Solid,
        priceLineVisible: false,
        lastValueVisible: false,
      });
    }

    chartApiRef.current = chart;
    mainSeriesRef.current = mainSeries;
    overlaySeriesRef.current = overlays;
    trendSeriesRef.current = [];

    chart.subscribeCrosshairMove((param) => {
      if (!param.time) {
        setOhlcHover(null);
        return;
      }
      const bar = candles.find((c) => c.time === Number(param.time));
      if (bar) setOhlcHover(bar);
    });

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
      mainSeriesRef.current = null;
      overlaySeriesRef.current = {};
      trendSeriesRef.current = [];
    };
  }, [theme, timeframe, chartMode, isFullscreen]);

  // Interactive Chart Click Handler for Drawing Tools (H-Line, Trendline, Fib Retracement/Extension)
  useEffect(() => {
    const chart = chartApiRef.current;
    const series = mainSeriesRef.current;
    if (!chart || !series) return;

    const handler = (param: any) => {
      if (drawMode === 'crosshair' || !param.point) return;
      const price = series.coordinateToPrice(param.point.y);
      if (price === null || !Number.isFinite(price)) return;
      const cleanPrice = Number(price.toFixed(decimals));
      const clickTime = Number(param.time || candles[candles.length - 1]?.time || Math.floor(Date.now() / 1000));

      if (drawMode === 'hline') {
        const nextH = [...hLines, cleanPrice];
        setHLines(nextH);
        setUndoHistory((prev) => [...prev, { type: 'hline', price: cleanPrice }]);
        setRedoHistory([]);
        persistDrawings(nextH, trendLines, fibs);
        setDrawMode('crosshair');
        return;
      }

      if (drawMode === 'trendline' || drawMode === 'fib' || drawMode === 'fibext') {
        if (!pendingPoint) {
          setPendingPoint({ time: clickTime, price: cleanPrice });
          showToast('Click second point on chart to complete drawing', 'info');
          return;
        }
        if (drawMode === 'trendline') {
          const item: TrendLineObj = {
            id: `tl-${Date.now()}`,
            t1: Math.min(pendingPoint.time, clickTime),
            p1: pendingPoint.time <= clickTime ? pendingPoint.price : cleanPrice,
            t2: Math.max(pendingPoint.time, clickTime),
            p2: pendingPoint.time <= clickTime ? cleanPrice : pendingPoint.price,
          };
          const nextT = [...trendLines, item];
          setTrendLines(nextT);
          setUndoHistory((prev) => [...prev, { type: 'trendline', item }]);
          setRedoHistory([]);
          persistDrawings(hLines, nextT, fibs);
        } else {
          const item: FibObj = {
            id: `fib-${Date.now()}`,
            low: Math.min(pendingPoint.price, cleanPrice),
            high: Math.max(pendingPoint.price, cleanPrice),
            mode: drawMode === 'fibext' ? 'extension' : 'retracement',
          };
          const nextF = [...fibs, item];
          setFibs(nextF);
          setUndoHistory((prev) => [...prev, { type: 'fib', item }]);
          setRedoHistory([]);
          persistDrawings(hLines, trendLines, nextF);
        }
        setPendingPoint(null);
        setDrawMode('crosshair');
      }
    };

    chart.subscribeClick(handler);
    return () => {
      chart.unsubscribeClick(handler);
    };
  }, [drawMode, pendingPoint, decimals, candles, hLines, trendLines, fibs, persistDrawings, showToast]);

  // Populate Candles + Overlays
  useEffect(() => {
    const series = mainSeriesRef.current;
    const ov = overlaySeriesRef.current;
    if (!series) return;

    if (candles.length === 0) {
      series.setData([]);
      Object.values(ov).forEach((s) => s.setData([]));
      return;
    }

    if (chartMode === 'candles') {
      (series as ISeriesApi<'Candlestick'>).setData(
        candles.map((c) => ({
          time: c.time as UTCTimestamp,
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
        }))
      );
    } else {
      (series as ISeriesApi<'Line' | 'Area'>).setData(
        candles.map((c) => ({ time: c.time as UTCTimestamp, value: c.close }))
      );
    }

    if (!computedIndicators) return;

    ov.ema9?.setData(indPrefs.ema9 ? toSeriesPoints(candles, computedIndicators.ema9) : []);
    ov.ema20?.setData(indPrefs.ema20 ? toSeriesPoints(candles, computedIndicators.ema20) : []);
    ov.ema50?.setData(indPrefs.ema50 ? toSeriesPoints(candles, computedIndicators.ema50) : []);
    ov.ema200?.setData(indPrefs.ema200 ? toSeriesPoints(candles, computedIndicators.ema200) : []);
    ov.sma20?.setData(indPrefs.sma20 ? toSeriesPoints(candles, computedIndicators.sma20) : []);
    ov.sma50?.setData(indPrefs.sma50 ? toSeriesPoints(candles, computedIndicators.sma50) : []);
    ov.bbUpper?.setData(indPrefs.bb ? toSeriesPoints(candles, computedIndicators.bollinger.upper) : []);
    ov.bbLower?.setData(indPrefs.bb ? toSeriesPoints(candles, computedIndicators.bollinger.lower) : []);
    ov.psar?.setData(indPrefs.psar ? toSeriesPoints(candles, computedIndicators.psar.values) : []);
    ov.vwap?.setData(
      indPrefs.vwap && computedIndicators.vwap.available
        ? toSeriesPoints(candles, computedIndicators.vwap.values)
        : []
    );
  }, [candles, chartMode, computedIndicators, indPrefs]);

  // Live Last Candle Tick Update — only apply authentic deriv_ws ticks to prevent seed-price spikes
  useEffect(() => {
    liveBarRef.current = null;
  }, [selectedSymbol, timeframe]);

  useEffect(() => {
    if (candles.length > 0) {
      const last = candles[candles.length - 1];
      if (!liveBarRef.current || liveBarRef.current.time < last.time) {
        liveBarRef.current = { ...last };
      }
    } else {
      liveBarRef.current = null;
    }
  }, [candles]);

  useEffect(() => {
    if (!liveTick || liveTick.source !== 'deriv_ws' || !mainSeriesRef.current || candles.length === 0) return;
    const baseLast = liveBarRef.current || candles[candles.length - 1];
    const bucket = Math.floor(liveTick.epoch / Math.max(1, timeframe)) * Math.max(1, timeframe);
    try {
      if (chartMode === 'candles') {
        const updated: CandleData =
          bucket > baseLast.time
            ? {
                time: bucket,
                open: baseLast.close,
                high: Math.max(baseLast.close, liveTick.quote),
                low: Math.min(baseLast.close, liveTick.quote),
                close: liveTick.quote,
              }
            : {
                time: baseLast.time,
                open: baseLast.open,
                high: Math.max(baseLast.high, liveTick.quote),
                low: Math.min(baseLast.low, liveTick.quote),
                close: liveTick.quote,
              };
        liveBarRef.current = updated;
        (mainSeriesRef.current as ISeriesApi<'Candlestick'>).update({
          ...updated,
          time: updated.time as UTCTimestamp,
        });
      } else {
        const t = Math.max(bucket, baseLast.time);
        liveBarRef.current = { ...baseLast, time: t, close: liveTick.quote };
        (mainSeriesRef.current as ISeriesApi<'Line' | 'Area'>).update({
          time: t as UTCTimestamp,
          value: liveTick.quote,
        });
      }
      setLastUpdated(new Date().toISOString());
    } catch {
      // ignore out-of-order updates
    }
  }, [liveTick, timeframe, candles, chartMode]);

  // Render Horizontal Lines, Trendlines, Fibs, SMC Levels, and Open Orders
  useEffect(() => {
    const chart = chartApiRef.current;
    const series = mainSeriesRef.current;
    if (!chart || !series) return;

    for (const pl of priceLinesRef.current) {
      try {
        series.removePriceLine(pl);
      } catch {
        // ignore
      }
    }
    priceLinesRef.current = [];

    for (const ts of trendSeriesRef.current) {
      try {
        chart.removeSeries(ts);
      } catch {
        // ignore
      }
    }
    trendSeriesRef.current = [];

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

      for (const tl of trendLines) {
        if (tl.t2 > tl.t1) {
          const ts = chart.addSeries(LineSeries, {
            color: '#38BDF8',
            lineWidth: 2,
            priceLineVisible: false,
            lastValueVisible: false,
          });
          ts.setData([
            { time: tl.t1 as UTCTimestamp, value: tl.p1 },
            { time: tl.t2 as UTCTimestamp, value: tl.p2 },
          ]);
          trendSeriesRef.current.push(ts);
        }
      }

      for (const f of fibs) {
        const span = Math.max(1e-9, f.high - f.low);
        const ratios = f.mode === 'retracement' ? [0, 0.382, 0.5, 0.618, 0.786, 1] : [0, 1, 1.272, 1.618];
        for (const r of ratios) {
          const lvl = Number((f.low + span * r).toFixed(decimals));
          priceLinesRef.current.push(
            series.createPriceLine({
              price: lvl,
              color: '#A855F7',
              lineWidth: 1,
              lineStyle: LineStyle.Dotted,
              axisLabelVisible: true,
              title: `${f.mode === 'retracement' ? 'Fib' : 'Ext'} ${(r * 100).toFixed(1)}%`,
            })
          );
        }
      }
    }

    // SMC Overlay levels
    if (indPrefs.smc && smcData?.smc) {
      const s = smcData.smc;
      if (s.dealingRange?.equilibrium) {
        priceLinesRef.current.push(
          series.createPriceLine({
            price: s.dealingRange.equilibrium,
            color: '#94A3B8',
            lineWidth: 1,
            lineStyle: LineStyle.Dashed,
            axisLabelVisible: true,
            title: 'EQ 50%',
          })
        );
      }
      for (const r of (s.resistanceLevels || []).slice(0, 2)) {
        priceLinesRef.current.push(
          series.createPriceLine({
            price: r,
            color: '#EF4444',
            lineWidth: 1,
            lineStyle: LineStyle.Dotted,
            axisLabelVisible: true,
            title: 'SMC Res',
          })
        );
      }
      for (const sup of (s.supportLevels || []).slice(0, 2)) {
        priceLinesRef.current.push(
          series.createPriceLine({
            price: sup,
            color: '#00A878',
            lineWidth: 1,
            lineStyle: LineStyle.Dotted,
            axisLabelVisible: true,
            title: 'SMC Sup',
          })
        );
      }
      const latestZones = (s.zones || []).filter((z: any) => !z.mitigated).slice(-2);
      for (const z of latestZones) {
        priceLinesRef.current.push(
          series.createPriceLine({
            price: (z.top + z.bottom) / 2,
            color: z.bias === 'bullish' ? '#06B6D4' : '#F97316',
            lineWidth: 1,
            lineStyle: LineStyle.SparseDotted,
            axisLabelVisible: true,
            title: z.label,
          })
        );
      }
    }

    // Open Order Lines (strictly matching active Real vs Demo mode)
    const symOpenOrders = orders.filter(
      (o) =>
        o.status === 'OPEN' &&
        o.symbol === selectedSymbol &&
        (o.account_mode || (o.execution_mode === 'deriv' ? 'real' : 'demo')) === accountMode
    );
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
  }, [hLines, trendLines, fibs, drawingsVisible, orders, selectedSymbol, decimals, indPrefs.smc, smcData]);

  const handleUndoDrawing = () => {
    if (undoHistory.length === 0) return;
    const last = undoHistory[undoHistory.length - 1];
    setUndoHistory(undoHistory.slice(0, -1));
    setRedoHistory((prev) => [...prev, last]);
    let nextH = hLines;
    let nextT = trendLines;
    let nextF = fibs;
    if (last.type === 'hline') nextH = hLines.slice(0, -1);
    if (last.type === 'trendline') nextT = trendLines.filter((x) => x.id !== last.item.id);
    if (last.type === 'fib') nextF = fibs.filter((x) => x.id !== last.item.id);
    setHLines(nextH);
    setTrendLines(nextT);
    setFibs(nextF);
    persistDrawings(nextH, nextT, nextF);
  };

  const handleRedoDrawing = () => {
    if (redoHistory.length === 0) return;
    const last = redoHistory[redoHistory.length - 1];
    setRedoHistory(redoHistory.slice(0, -1));
    setUndoHistory((prev) => [...prev, last]);
    let nextH = hLines;
    let nextT = trendLines;
    let nextF = fibs;
    if (last.type === 'hline') nextH = [...hLines, last.price];
    if (last.type === 'trendline') nextT = [...trendLines, last.item];
    if (last.type === 'fib') nextF = [...fibs, last.item];
    setHLines(nextH);
    setTrendLines(nextT);
    setFibs(nextF);
    persistDrawings(nextH, nextT, nextF);
  };

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
        ? side === 'BUY'
          ? currentPrice + delta
          : currentPrice - delta
        : side === 'BUY'
          ? currentPrice - delta
          : currentPrice + delta;
      return { usd: raw, price: Number(p.toFixed(decimals)) };
    }
    if (unit === '%') {
      const usd = Number(((stakeUsd * raw) / 100).toFixed(2));
      const pctMove = usd / Math.max(1, notional);
      const delta = currentPrice * pctMove;
      const p = isTp
        ? side === 'BUY'
          ? currentPrice + delta
          : currentPrice - delta
        : side === 'BUY'
          ? currentPrice - delta
          : currentPrice + delta;
      return { usd, price: Number(p.toFixed(decimals)) };
    }
    if (unit === 'Pips') {
      const delta = raw * pipSize;
      const p = isTp
        ? side === 'BUY'
          ? currentPrice + delta
          : currentPrice - delta
        : side === 'BUY'
          ? currentPrice - delta
          : currentPrice + delta;
      const usd = Number(((delta / currentPrice) * notional).toFixed(2));
      return { usd, price: Number(p.toFixed(decimals)) };
    }
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

  const previewProposal = async (contractType: string) => {
    try {
      const res = await apiFetch<{ proposal: any }>('/api/deriv/proposal', {
        method: 'POST',
        body: JSON.stringify({
          symbol: selectedSymbol,
          contractType,
          stake: stakeUsd,
          multiplier,
          barrier: tradeMode === 'Over/Under' ? barrier : undefined,
          duration: durationTicks,
          durationUnit: 't',
          connectedAccountId: activeConnectedAccount?.id || null,
        }),
      });
      setProposalInfo({
        payout: res.proposal?.payout,
        ask_price: res.proposal?.ask_price,
        spot: res.proposal?.spot,
      });
    } catch (err) {
      setProposalInfo({ error: err instanceof Error ? err.message : 'Proposal unavailable' });
    }
  };

  const executeOrderConfirmed = async (sideInput: string, contractTypeOverride?: string) => {
    setPlacing(true);
    try {
      const normalizedSide =
        sideInput === 'BUY' || sideInput === 'CALL' || sideInput === 'DIGITOVER' ? 'BUY' : 'SELL';
      const isMultiplier = tradeMode === 'MT5 Market';
      const slData =
        isMultiplier && slEnabled ? convertToUsdAndPrice(slValue, slUnit, false, normalizedSide) : { usd: null, price: null };
      const tpData =
        isMultiplier && tpEnabled ? convertToUsdAndPrice(tpValue, tpUnit, true, normalizedSide) : { usd: null, price: null };

      const tfLabel = TIMEFRAMES.find((t) => t.granularity === timeframe)?.label || '15m';
      const idempotencyKey = `${selectedSymbol}-${sideInput}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

      const endpoint = bulkCount > 1 ? '/api/orders/bulk' : '/api/orders';
      await apiFetch(endpoint, {
        method: 'POST',
        body: JSON.stringify({
          count: bulkCount,
          symbol: selectedSymbol,
          side: sideInput,
          contractType:
            contractTypeOverride ||
            (tradeMode === 'MT5 Market' ? (normalizedSide === 'BUY' ? 'MULTUP' : 'MULTDOWN') : undefined),
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
          strategyKey: strategyTag,
          timeframe: tfLabel,
          accountMode,
          idempotencyKey,
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

  const handlePlaceOrder = (sideInput: string, contractTypeOverride?: string) => {
    if (placing) return;
    if (accountMode === 'real') {
      setConfirmRealOrder({ sideInput, contractTypeOverride });
      return;
    }
    executeOrderConfirmed(sideInput, contractTypeOverride);
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

  const handleCreateAlert = async (e: React.FormEvent) => {
    e.preventDefault();
    const target = Number(alertTargetPrice);
    if (!Number.isFinite(target) || target <= 0) {
      showToast('Enter a valid price level', 'error');
      return;
    }
    try {
      await apiFetch('/api/alerts', {
        method: 'POST',
        body: JSON.stringify({
          symbol: selectedSymbol,
          alertType: alertDirection,
          condition: { targetPrice: target },
          message: alertMsg || `${selectedSymbol} crossed ${target}`,
        }),
      });
      setAlertModalOpen(false);
      setAlertMsg('');
      showToast(`Price alert armed on ${selectedSymbol} @ ${target}`, 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to arm alert', 'error');
    }
  };

  const handleAskCopilot = async (customQ?: string) => {
    const q = (customQ || copilotPrompt || 'Analyze structure, indicators, Buy Low/Sell High regime, and risk exposure.').trim();
    setCopilotLoading(true);
    setCopilotError(null);
    try {
      const g = timeframe < 60 ? 60 : timeframe;
      const res = await apiFetch<{ answer: string }>('/api/intelligence/copilot', {
        method: 'POST',
        body: JSON.stringify({
          symbol: selectedSymbol,
          granularity: g,
          prompt: q,
        }),
      });
      setCopilotAnswer(res.answer);
    } catch (err) {
      setCopilotError(err instanceof Error ? err.message : 'AI Co-Pilot failed');
    } finally {
      setCopilotLoading(false);
    }
  };

  const exportHistoryCsv = () => {
    const header = 'ID,Symbol,Side,Mode,AccountMode,Strategy,Stake,Entry,Exit,PnL,OpenedAt,ClosedAt\n';
    const rows = filteredClosedOrders
      .map(
        (o) =>
          `${o.id},${o.symbol},${o.side},${o.execution_mode},${o.account_mode || 'demo'},${o.strategy_key || o.source},${o.stake},${o.entry_price},${o.exit_price ?? ''},${o.pnl},${o.opened_at},${o.closed_at || ''}`
      )
      .join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tradederiv_orders_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Order history CSV exported', 'success');
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

  const openOrders = useMemo(() => {
    return orders
      .filter(
        (o) =>
          o.status === 'OPEN' &&
          (o.account_mode || (o.execution_mode === 'deriv' ? 'real' : 'demo')) === accountMode
      )
      .map((o) => {
        const symTick = ticks[o.symbol];
        const isMult = ['MULTUP', 'MULTDOWN', 'BUY', 'SELL'].includes(String(o.contract_type || '').toUpperCase());
        if (symTick && symTick.source === 'deriv_ws' && isMult && Number(o.entry_price) > 0) {
          const isUp = o.contract_type === 'MULTUP' || o.side === 'BUY';
          const pctDiff = (symTick.quote - Number(o.entry_price)) / Number(o.entry_price);
          const directional = isUp ? pctDiff : -pctDiff;
          const livePnl = Number(
            Math.max(-Number(o.stake), directional * Number(o.stake) * Number(o.multiplier || 100)).toFixed(2)
          );
          return { ...o, current_price: symTick.quote, pnl: livePnl };
        }
        return o;
      });
  }, [orders, accountMode, ticks]);
  const closedOrders = orders.filter((o) => o.status === 'CLOSED');
  const filteredClosedOrders = useMemo(() => {
    return closedOrders.filter((o) => {
      if (historyModeFilter !== 'all') {
        const isReal = o.account_mode === 'real' || o.execution_mode === 'deriv';
        if (historyModeFilter === 'real' && !isReal) return false;
        if (historyModeFilter === 'demo' && isReal) return false;
      }
      if (
        historySearch &&
        !o.symbol.toLowerCase().includes(historySearch.toLowerCase()) &&
        !o.side.toLowerCase().includes(historySearch.toLowerCase())
      ) {
        return false;
      }
      return true;
    });
  }, [closedOrders, historyModeFilter, historySearch]);

  const floatingPnl = openOrders.reduce((acc, o) => acc + Number(o.pnl || 0), 0);
  const usedMargin = openOrders.reduce((acc, o) => acc + Number(o.stake || 0), 0);
  const canonicalBalances = useMemo(
    () => getCanonicalBalances(user, accounts, accountMode, activeConnectedAccount),
    [user, accounts, accountMode, activeConnectedAccount]
  );
  const balance = canonicalBalances.activeTradingBalance;
  const equity = balance + floatingPnl;
  const freeMargin = Math.max(0, equity - usedMargin);

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

  const displayBar = ohlcHover || candles[candles.length - 1] || null;
  const activeIndicatorCount = [
    indPrefs.ema9,
    indPrefs.ema20,
    indPrefs.ema50,
    indPrefs.ema200,
    indPrefs.sma20,
    indPrefs.sma50,
    indPrefs.bb,
    indPrefs.psar,
    indPrefs.vwap,
    indPrefs.smc,
  ].filter(Boolean).length;

  return (
    <div className="max-w-[1600px] mx-auto px-3 sm:px-6 pt-3 pb-8 space-y-3">
      {/* Compact Mobile Market Switcher (Chart-first UX: never pushes chart below 75 instruments) */}
      <div className="xl:hidden bg-white dark:bg-[#181C25] rounded-2xl border border-slate-200 dark:border-[#2A2F3D] p-2.5 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setMobileMwOpen((v) => !v)}
            className="flex items-center gap-2 min-w-0 text-left cursor-pointer"
          >
            <span className="px-2 py-0.5 rounded-lg bg-[#FF444F]/10 text-[#FF444F] font-mono-num text-[11px] font-bold shrink-0">
              {selectedSymbol}
            </span>
            <span className="text-xs font-bold truncate">{activeInst?.display_name || selectedSymbol}</span>
            <span className="inline-flex items-center gap-0.5 text-[11px] text-slate-400 shrink-0">
              {mobileMwOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </span>
          </button>
          <div className="flex items-center gap-2 font-mono-num text-[11px] shrink-0">
            <span className="text-[#FF444F] font-bold">{currentBid.toFixed(decimals)}</span>
            <span className="text-slate-400">/</span>
            <span className="text-[#00A878] font-bold">{currentAsk.toFixed(decimals)}</span>
          </div>
        </div>

        {/* Most-Traded Quick-Tap Bar */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
          {instruments.slice(0, 6).map((inst) => (
            <button
              key={inst.symbol}
              type="button"
              onClick={() => {
                setSelectedSymbol(inst.symbol);
                setMobileMwOpen(false);
              }}
              className={`px-2.5 py-1 rounded-full text-[11px] font-semibold whitespace-nowrap cursor-pointer ${
                inst.symbol === selectedSymbol
                  ? 'bg-[#151820] text-white dark:bg-[#FF444F]'
                  : 'bg-[#F4F5F7] dark:bg-[#111319] text-slate-600 dark:text-slate-300'
              }`}
            >
              {inst.display_name.replace(' Index', '')}
            </button>
          ))}
        </div>

        {mobileMwOpen && (
          <div className="pt-2 border-t border-slate-100 dark:border-[#2A2F3D] space-y-2">
            <div className="flex items-center gap-2">
              <div className="flex-1 flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#F4F5F7] dark:bg-[#111319]">
                <Search className="w-3.5 h-3.5 text-slate-400" />
                <input
                  type="text"
                  value={mwSearch}
                  onChange={(e) => setMwSearch(e.target.value)}
                  placeholder="Search 75+ instruments..."
                  className="flex-1 bg-transparent text-xs outline-none"
                />
              </div>
              <button
                type="button"
                onClick={() => setShowWatchlistOnly(!showWatchlistOnly)}
                className={`px-2.5 py-1.5 rounded-xl text-[11px] font-semibold flex items-center gap-1 cursor-pointer ${
                  showWatchlistOnly ? 'bg-amber-500/15 text-amber-500' : 'bg-[#F4F5F7] dark:bg-[#111319] text-slate-500'
                }`}
              >
                <Star className="w-3 h-3 fill-current" />
              </button>
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
            <div className="max-h-60 overflow-y-auto divide-y divide-slate-100 dark:divide-[#2A2F3D]">
              {filteredInstruments.map((inst) => {
                const t = ticks[inst.symbol];
                const bid = t?.bid ?? inst.bid;
                const ask = t?.ask ?? inst.ask;
                const active = inst.symbol === selectedSymbol;
                return (
                  <button
                    key={inst.symbol}
                    type="button"
                    onClick={() => {
                      setSelectedSymbol(inst.symbol);
                      setMobileMwOpen(false);
                    }}
                    className={`w-full px-2.5 py-2 flex items-center justify-between text-left cursor-pointer ${
                      active ? 'bg-[#FF444F]/8' : ''
                    }`}
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-semibold truncate">{inst.display_name}</p>
                      <p className="text-[10px] text-slate-400">{inst.symbol}</p>
                    </div>
                    <span className="font-mono-num text-[11px] font-bold text-[#00A878]">
                      {bid} / {ask}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Top 3-Column Trading Workspace */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
        {/* Desktop Left MarketWatch Panel (3 cols, hidden on mobile to keep Chart first) */}
        <aside className="hidden xl:flex xl:col-span-3 bg-white dark:bg-[#181C25] rounded-2xl border border-slate-200 dark:border-[#2A2F3D] flex-col max-h-[600px]">
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

        {/* Center Institutional Chart + Indicators + Drawing Toolbar (6 cols, or fullscreen) */}
        <section
          className={`${
            isFullscreen ? 'fixed inset-3 z-50 shadow-2xl' : 'xl:col-span-6'
          } bg-white dark:bg-[#181C25] rounded-2xl border border-slate-200 dark:border-[#2A2F3D] overflow-hidden flex flex-col relative`}
        >
          {/* Chart Header */}
          <div className="px-4 py-3 border-b border-slate-100 dark:border-[#2A2F3D] flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="font-display text-base font-bold">{activeInst?.display_name || selectedSymbol}</h1>
                <span className="text-xs font-mono-num px-2 py-0.5 rounded-full bg-[#1958B7]/10 text-[#1958B7] font-semibold">
                  {selectedSymbol}
                </span>
                <span
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                    wsConnected && candleSource === 'deriv_ws'
                      ? 'bg-[#00A878]/15 text-[#00A878]'
                      : 'bg-amber-500/15 text-amber-500'
                  }`}
                >
                  {wsConnected ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
                  {candleSource === 'deriv_ws' ? 'Deriv WS Live' : 'Feed Unavailable'}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-3 mt-0.5 text-xs font-mono-num">
                <span>
                  Bid: <strong className="text-[#FF444F]">{currentBid.toFixed(decimals)}</strong>
                </span>
                <span>
                  Ask: <strong className="text-[#00A878]">{currentAsk.toFixed(decimals)}</strong>
                </span>
                {displayBar && (
                  <span className="text-[11px] text-slate-500 hidden sm:inline">
                    O:{displayBar.open.toFixed(decimals)} H:{displayBar.high.toFixed(decimals)} L:
                    {displayBar.low.toFixed(decimals)} C:{displayBar.close.toFixed(decimals)}
                  </span>
                )}
              </div>
            </div>

            {/* Chart Mode, Indicators Manager, AI Co-Pilot & Fullscreen */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <div className="flex items-center bg-[#F4F5F7] dark:bg-[#111319] p-0.5 rounded-lg">
                {(['candles', 'line', 'area'] as ChartMode[]).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => updateIndPrefs({ chartMode: m })}
                    className={`px-2 py-1 rounded-md text-[10px] font-bold capitalize cursor-pointer ${
                      chartMode === m
                        ? 'bg-white dark:bg-[#2A2F3D] text-[#0E1117] dark:text-white shadow-xs'
                        : 'text-slate-500'
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={() => setIndPanelOpen(!indPanelOpen)}
                className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer ${
                  indPanelOpen || activeIndicatorCount > 0
                    ? 'bg-[#1958B7]/15 text-[#1958B7]'
                    : 'bg-[#F4F5F7] dark:bg-[#111319] text-slate-600 dark:text-slate-300'
                }`}
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
                Indicators ({activeIndicatorCount})
              </button>

              <button
                type="button"
                onClick={() => updateIndPrefs({ smc: !indPrefs.smc })}
                className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer ${
                  indPrefs.smc
                    ? 'bg-cyan-500/15 text-cyan-500'
                    : 'bg-[#F4F5F7] dark:bg-[#111319] text-slate-600 dark:text-slate-300'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                SMC
              </button>

              <button
                type="button"
                onClick={() => setCopilotOpen(true)}
                className="px-2.5 py-1.5 rounded-lg bg-[#151820] text-white text-[11px] font-semibold inline-flex items-center gap-1 hover:bg-[#242936] cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5 text-[#FF444F]" />
                AI Co-Pilot
              </button>

              <button
                type="button"
                onClick={() => setIsFullscreen(!isFullscreen)}
                title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen Chart'}
                className="p-1.5 rounded-lg bg-[#F4F5F7] dark:bg-[#111319] text-slate-600 dark:text-slate-300 cursor-pointer"
              >
                {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>

          {/* Indicators Manager Dropdown Strip */}
          {indPanelOpen && (
            <div className="px-4 py-2.5 border-b border-slate-100 dark:border-[#2A2F3D] bg-[#F8F9FB] dark:bg-[#111319] flex flex-wrap items-center gap-1.5 text-[11px]">
              {(
                [
                  { key: 'ema9', label: 'EMA 9', color: 'text-cyan-500' },
                  { key: 'ema20', label: 'EMA 20', color: 'text-blue-500' },
                  { key: 'ema50', label: 'EMA 50', color: 'text-amber-500' },
                  { key: 'ema200', label: 'EMA 200', color: 'text-pink-500' },
                  { key: 'sma20', label: 'SMA 20', color: 'text-indigo-500' },
                  { key: 'sma50', label: 'SMA 50', color: 'text-teal-500' },
                  { key: 'bb', label: 'Bollinger(20)', color: 'text-violet-500' },
                  { key: 'psar', label: 'Parabolic SAR', color: 'text-orange-500' },
                  { key: 'vwap', label: 'VWAP', color: 'text-emerald-500' },
                ] as Array<{ key: keyof IndicatorPrefs; label: string; color: string }>
              ).map((item) => {
                const on = Boolean(indPrefs[item.key]);
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => updateIndPrefs({ [item.key]: !on })}
                    className={`px-2.5 py-1 rounded-full font-semibold cursor-pointer border ${
                      on
                        ? `border-current ${item.color} bg-white dark:bg-[#181C25]`
                        : 'border-slate-200 dark:border-[#2A2F3D] text-slate-500'
                    }`}
                  >
                    {item.label}
                  </button>
                );
              })}
              {indPrefs.vwap && latestIndReadout && !latestIndReadout.vwapAvailable && (
                <span className="text-[10px] text-amber-500 ml-1">
                  VWAP unavailable: Deriv synthetic candles omit tick_volume
                </span>
              )}
            </div>
          )}

          {/* Timeframe Bar + Expanded Drawing Toolbar */}
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

            <div className="flex items-center gap-1 flex-wrap">
              <button
                type="button"
                onClick={() => {
                  setPendingPoint(null);
                  setDrawMode('crosshair');
                }}
                title="Crosshair"
                className={`p-1.5 rounded-lg cursor-pointer ${
                  drawMode === 'crosshair'
                    ? 'bg-[#151820] text-white dark:bg-white dark:text-[#151820]'
                    : 'text-slate-500'
                }`}
              >
                <Crosshair className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => {
                  setPendingPoint(null);
                  setDrawMode(drawMode === 'hline' ? 'crosshair' : 'hline');
                  showToast('Click chart to place Horizontal Price Line', 'info');
                }}
                title="Horizontal Price Line"
                className={`p-1.5 rounded-lg cursor-pointer ${
                  drawMode === 'hline' ? 'bg-[#FF444F] text-white' : 'text-slate-500'
                }`}
              >
                <Minus className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => {
                  setPendingPoint(null);
                  setDrawMode(drawMode === 'trendline' ? 'crosshair' : 'trendline');
                  showToast('Click 2 points on chart to draw Trendline', 'info');
                }}
                title="Trendline (2-Click)"
                className={`p-1.5 rounded-lg cursor-pointer ${
                  drawMode === 'trendline' ? 'bg-[#FF444F] text-white' : 'text-slate-500'
                }`}
              >
                <Slash className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => {
                  setPendingPoint(null);
                  setDrawMode(drawMode === 'fib' ? 'crosshair' : 'fib');
                  showToast('Click 2 swing prices for Fibonacci Retracement', 'info');
                }}
                title="Fib Retracement"
                className={`px-1.5 py-1 rounded-lg text-[10px] font-bold cursor-pointer ${
                  drawMode === 'fib' ? 'bg-[#FF444F] text-white' : 'text-slate-500 hover:bg-slate-200/60 dark:hover:bg-white/10'
                }`}
              >
                Fib
              </button>
              <button
                type="button"
                onClick={() => {
                  setPendingPoint(null);
                  setDrawMode(drawMode === 'fibext' ? 'crosshair' : 'fibext');
                  showToast('Click 2 swing prices for Fibonacci Extension', 'info');
                }}
                title="Fib Extension"
                className={`px-1.5 py-1 rounded-lg text-[10px] font-bold cursor-pointer ${
                  drawMode === 'fibext' ? 'bg-[#FF444F] text-white' : 'text-slate-500 hover:bg-slate-200/60 dark:hover:bg-white/10'
                }`}
              >
                Ext
              </button>
              <button
                type="button"
                onClick={() => {
                  setAlertTargetPrice(currentPrice.toFixed(decimals));
                  setAlertModalOpen(true);
                }}
                title="Create Price Alert"
                className="p-1.5 rounded-lg text-slate-500 hover:text-[#FF444F] cursor-pointer"
              >
                <BellPlus className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={handleUndoDrawing}
                title="Undo"
                className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-200/60 dark:hover:bg-white/10 cursor-pointer"
              >
                <Undo2 className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={handleRedoDrawing}
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
                  setTrendLines([]);
                  setFibs([]);
                  setPendingPoint(null);
                  persistDrawings([], [], []);
                }}
                title="Clear All"
                className="p-1.5 rounded-lg text-slate-500 hover:text-[#FF444F] cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Truthful Candle / Feed Error Banner if Deriv Candles Unavailable */}
          {candles.length === 0 && (
            <div className="px-4 py-3 bg-amber-500/10 border-b border-amber-500/25 flex items-center justify-between gap-2 text-xs text-amber-600 dark:text-amber-300">
              <span className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                {candleError || 'Real historical candles from Deriv are temporarily unavailable for this symbol.'}
              </span>
              <button
                type="button"
                onClick={loadCandles}
                className="px-3 py-1 rounded-full bg-amber-500/20 font-semibold cursor-pointer"
              >
                Retry
              </button>
            </div>
          )}

          <div ref={chartContainerRef} className={`w-full ${isFullscreen ? 'flex-1 min-h-[460px]' : 'h-[420px]'}`} />

          {/* Oscillator / Volatility Telemetry Strip */}
          {latestIndReadout && (
            <div className="px-4 py-2 border-t border-slate-100 dark:border-[#2A2F3D] bg-[#F8F9FB] dark:bg-[#151820] flex flex-wrap items-center justify-between gap-3 text-[11px] font-mono-num">
              <div className="flex flex-wrap items-center gap-4">
                <span>
                  RSI(14):{' '}
                  <strong
                    className={
                      (latestIndReadout.rsi14 ?? 50) >= 70
                        ? 'text-[#FF444F]'
                        : (latestIndReadout.rsi14 ?? 50) <= 30
                          ? 'text-[#00A878]'
                          : ''
                    }
                  >
                    {latestIndReadout.rsi14?.toFixed(1) ?? '—'}
                  </strong>
                </span>
                <span>
                  MACD:{' '}
                  <strong className={(latestIndReadout.macdHist ?? 0) >= 0 ? 'text-[#00A878]' : 'text-[#FF444F]'}>
                    {latestIndReadout.macdHist?.toFixed(decimals) ?? '—'}
                  </strong>
                </span>
                <span>
                  Stoch: <strong>{latestIndReadout.stochK?.toFixed(1) ?? '—'}</strong> /{' '}
                  {latestIndReadout.stochD?.toFixed(1) ?? '—'}
                </span>
                <span>
                  ATR(14): <strong>{latestIndReadout.atr14?.toFixed(decimals) ?? '—'}</strong>
                </span>
                <span>
                  ADX(14): <strong>{latestIndReadout.adx14?.toFixed(1) ?? '—'}</strong> (+DI{' '}
                  {latestIndReadout.plusDi?.toFixed(1) ?? '—'} / -DI {latestIndReadout.minusDi?.toFixed(1) ?? '—'})
                </span>
              </div>
              {lastUpdated && (
                <span className="text-[10px] text-slate-400">
                  Updated {new Date(lastUpdated).toLocaleTimeString()}
                </span>
              )}
            </div>
          )}
        </section>

        {/* Right Contract-Aware Order Ticket (3 cols) */}
        <aside className="xl:col-span-3 bg-white dark:bg-[#181C25] rounded-2xl border border-slate-200 dark:border-[#2A2F3D] p-4 space-y-3.5">
          <div className="flex items-center justify-between text-[11px]">
            <span className="font-semibold text-slate-500">Execution Mode</span>
            <span
              className={`px-2.5 py-0.5 rounded-full font-bold ${
                accountMode === 'real'
                  ? 'bg-[#FF444F]/15 text-[#FF444F]'
                  : 'bg-[#00A878]/15 text-[#00A878]'
              }`}
            >
              {accountMode === 'real'
                ? activeConnectedAccount
                  ? `REAL (${activeConnectedAccount.deriv_account_id})`
                  : 'REAL WALLET (DB)'
                : 'DEMO WORKSPACE'}
            </span>
          </div>

          {/* Trade Mode Selector */}
          <div className="grid grid-cols-3 gap-1 bg-[#F4F5F7] dark:bg-[#111319] p-1 rounded-xl">
            {(['MT5 Market', 'Over/Under', 'Rise/Fall'] as TradeMode[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => {
                  setTradeMode(m);
                  setProposalInfo(null);
                }}
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

          {/* Stake USD + Multiplier */}
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
                      multiplier === m
                        ? 'bg-[#151820] text-white dark:bg-white dark:text-[#151820]'
                        : 'bg-[#F4F5F7] dark:bg-[#111319]'
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

          {/* SL & TP 4-Mode Controls (Supported on Multipliers only) */}
          {tradeMode === 'MT5 Market' ? (
            <div className="space-y-2.5 pt-1 border-t border-slate-100 dark:border-[#2A2F3D]">
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
          ) : (
            <div className="p-2.5 rounded-xl bg-[#F8F9FB] dark:bg-[#111319] text-[11px] text-slate-500">
              Fixed-payout Deriv option contract: risk is strictly capped at your stake (${stakeUsd.toFixed(2)}); price SL/TP limits apply to Multipliers only.
            </div>
          )}

          {/* Strategy Tag & Bulk Count */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[10px] font-semibold text-slate-500 mb-1">Strategy Tag</label>
              <select
                value={strategyTag}
                onChange={(e) => setStrategyTag(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded-xl bg-[#F4F5F7] dark:bg-[#111319] text-[11px] font-semibold"
              >
                <option value="">Manual</option>
                {STRATEGY_CATALOG.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-slate-500 mb-1">Bulk Orders</label>
              <select
                value={bulkCount}
                onChange={(e) => setBulkCount(Number(e.target.value))}
                className="w-full px-2.5 py-1.5 rounded-xl bg-[#F4F5F7] dark:bg-[#111319] font-mono-num text-[11px] font-bold"
              >
                {[1, 2, 3, 5, 10].map((c) => (
                  <option key={c} value={c}>
                    {c}x Order{c > 1 ? 's' : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Live Deriv Proposal Quote Preview */}
          <div className="flex items-center justify-between text-[11px] bg-[#F8F9FB] dark:bg-[#111319] px-3 py-2 rounded-xl">
            <button
              type="button"
              onClick={() =>
                previewProposal(
                  tradeMode === 'MT5 Market' ? 'MULTUP' : tradeMode === 'Over/Under' ? 'DIGITOVER' : 'CALL'
                )
              }
              className="text-[#1958B7] font-semibold hover:underline cursor-pointer"
            >
              Check Live Quote
            </button>
            <span className="font-mono-num text-slate-500">
              {proposalInfo?.payout
                ? `Payout: $${Number(proposalInfo.payout).toFixed(2)}`
                : proposalInfo?.error
                  ? 'Quote unavailable'
                  : contractsAvailable.length > 0
                    ? `${contractsAvailable.length} contracts ready`
                    : 'Deriv WS Quote'}
            </span>
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
                className="py-3 rounded-2xl bg-[#00A878] hover:bg-[#00966B] text-white font-bold text-xs cursor-pointer disabled:opacity-60"
              >
                OVER {barrier}
              </button>
              <button
                type="button"
                disabled={placing}
                onClick={() => handlePlaceOrder('DIGITUNDER', 'DIGITUNDER')}
                className="py-3 rounded-2xl bg-[#FF444F] hover:bg-[#E63946] text-white font-bold text-xs cursor-pointer disabled:opacity-60"
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
                className="py-3 rounded-2xl bg-[#00A878] hover:bg-[#00966B] text-white font-bold text-xs cursor-pointer disabled:opacity-60"
              >
                RISE / CALL
              </button>
              <button
                type="button"
                disabled={placing}
                onClick={() => handlePlaceOrder('PUT', 'PUT')}
                className="py-3 rounded-2xl bg-[#FF444F] hover:bg-[#E63946] text-white font-bold text-xs cursor-pointer disabled:opacity-60"
              >
                FALL / PUT
              </button>
            </div>
          )}
        </aside>
      </div>

      {/* Bottom MT5 Terminal Dock */}
      <section className="bg-white dark:bg-[#181C25] rounded-2xl border border-slate-200 dark:border-[#2A2F3D] overflow-hidden">
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
            {(
              [
                { id: 'open', label: `Open Positions (${openOrders.length})` },
                { id: 'history', label: `History (${closedOrders.length})` },
                { id: 'exposure', label: 'Exposure Summary' },
              ] as Array<{ id: DockTab; label: string }>
            ).map((t) => (
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

        {/* History Filter Bar */}
        {dockTab === 'history' && (
          <div className="px-4 py-2.5 border-b border-slate-100 dark:border-[#2A2F3D] flex flex-wrap items-center justify-between gap-2 bg-[#F8F9FB] dark:bg-[#151820]">
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={historySearch}
                onChange={(e) => setHistorySearch(e.target.value)}
                placeholder="Filter symbol or side..."
                className="px-3 py-1.5 rounded-lg bg-white dark:bg-[#1A1D26] border border-slate-200 dark:border-[#2A2F3D] text-xs outline-none"
              />
              {(['all', 'real', 'demo'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setHistoryModeFilter(m)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold capitalize cursor-pointer ${
                    historyModeFilter === m ? 'bg-[#151820] text-white dark:bg-white dark:text-[#151820]' : 'text-slate-500'
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={exportHistoryCsv}
              className="px-3 py-1.5 rounded-lg bg-white dark:bg-[#1A1D26] border border-slate-200 dark:border-[#2A2F3D] text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" /> Export CSV
            </button>
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
                      <td className="px-4 py-2.5 font-semibold">
                        {o.symbol}
                        {o.strategy_key && (
                          <span className="ml-1.5 text-[10px] text-slate-400">({o.strategy_key})</span>
                        )}
                      </td>
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
                  <th className="text-left px-4 py-2.5">Side / Mode</th>
                  <th className="text-right px-4 py-2.5">Stake</th>
                  <th className="text-right px-4 py-2.5">Entry → Exit</th>
                  <th className="text-right px-4 py-2.5">Realized P/L</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-[#2A2F3D]">
                {filteredClosedOrders.slice(0, 50).map((o) => (
                  <tr key={o.id}>
                    <td className="px-4 py-2.5 font-semibold">{o.symbol}</td>
                    <td className="px-4 py-2.5">
                      {o.side} ·{' '}
                      <span className="text-[10px] text-slate-400 uppercase">
                        {o.account_mode || (o.execution_mode === 'deriv' ? 'real' : 'demo')}
                      </span>
                    </td>
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

      {/* Real-Money Order Confirmation Modal */}
      {confirmRealOrder && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white dark:bg-[#181C25] rounded-3xl p-6 border border-[#FF444F]/40 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-lg font-bold text-[#FF444F] flex items-center gap-2">
                <AlertTriangle className="w-5 h-5" /> Confirm Live Real-Money Order
              </h3>
              <button
                type="button"
                onClick={() => setConfirmRealOrder(null)}
                className="p-1.5 rounded-full hover:bg-slate-100 dark:hover:bg-white/10 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 rounded-2xl bg-[#F8F9FB] dark:bg-[#111319] space-y-1.5 text-xs">
              <p>
                Account:{' '}
                <strong className="font-mono-num">
                  {activeConnectedAccount?.deriv_account_id || 'Real DB USD Wallet'}
                </strong>{' '}
                (Real Funds)
              </p>
              <p>
                Instrument: <strong>{selectedSymbol}</strong> · Side: <strong>{confirmRealOrder.sideInput}</strong>
              </p>
              <p>
                Stake: <strong className="font-mono-num">${(stakeUsd * bulkCount).toFixed(2)} USD</strong> ({bulkCount}x)
              </p>
            </div>
            <p className="text-[11px] text-slate-500">
              This order routes directly to Deriv. If Deriv rejects the execution, TradeDeriv will report the rejection honestly without downgrading to virtual execution.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setConfirmRealOrder(null)}
                className="py-2.5 rounded-full border border-slate-300 dark:border-[#2A2F3D] text-xs font-bold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  const pending = confirmRealOrder;
                  setConfirmRealOrder(null);
                  executeOrderConfirmed(pending.sideInput, pending.contractTypeOverride);
                }}
                className="py-2.5 rounded-full bg-[#FF444F] hover:bg-[#E63946] text-white text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <CheckCircle2 className="w-4 h-4" /> Execute Live
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Quick Price Alert Modal */}
      {alertModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <form
            onSubmit={handleCreateAlert}
            className="w-full max-w-md bg-white dark:bg-[#181C25] rounded-3xl p-6 border border-slate-200 dark:border-[#2A2F3D] space-y-4 shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-display text-base font-bold">Arm Price Alert ({selectedSymbol})</h3>
              <button
                type="button"
                onClick={() => setAlertModalOpen(false)}
                className="p-1.5 rounded-full hover:bg-slate-100 dark:hover:bg-white/10 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-slate-500 mb-1">Condition</label>
                <select
                  value={alertDirection}
                  onChange={(e) => setAlertDirection(e.target.value as any)}
                  className="w-full px-3 py-2 rounded-xl bg-[#F4F5F7] dark:bg-[#111319] text-xs font-semibold"
                >
                  <option value="price_above">Price Above (&ge;)</option>
                  <option value="price_below">Price Below (&le;)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Target Price</label>
                <input
                  type="number"
                  step="any"
                  required
                  value={alertTargetPrice}
                  onChange={(e) => setAlertTargetPrice(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-[#F4F5F7] dark:bg-[#111319] font-mono-num text-xs font-bold"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Alert Note</label>
              <input
                type="text"
                value={alertMsg}
                onChange={(e) => setAlertMsg(e.target.value)}
                placeholder={`${selectedSymbol} key liquidity level reached`}
                className="w-full px-3 py-2 rounded-xl bg-[#F4F5F7] dark:bg-[#111319] text-xs"
              />
            </div>
            <button
              type="submit"
              className="w-full py-2.5 rounded-full bg-[#FF444F] text-white text-xs font-bold cursor-pointer"
            >
              Arm Real-Time Alert
            </button>
          </form>
        </div>
      )}

      {/* Slide-in AI Trading Co-Pilot Drawer */}
      {copilotOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex justify-end">
          <div className="w-full max-w-md bg-white dark:bg-[#151820] border-l border-slate-200 dark:border-[#2A2F3D] h-full p-5 flex flex-col justify-between">
            <div className="space-y-4 overflow-y-auto pr-1">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-[#FF444F]" />
                  <div>
                    <h3 className="font-display text-base font-bold">Institutional AI Co-Pilot</h3>
                    <p className="text-[11px] text-slate-500">
                      Grounded in live {selectedSymbol} candles, SMC & your risk limits
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setCopilotOpen(false)}
                  className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-white/10 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {[
                  'Analyze SMC structure & key liquidity zones',
                  'Evaluate Buy Low / Sell High vs falling-knife risk',
                  'Audit my open exposure against risk limits',
                ].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    disabled={copilotLoading}
                    onClick={() => {
                      setCopilotPrompt(preset);
                      handleAskCopilot(preset);
                    }}
                    className="px-3 py-1.5 rounded-xl bg-[#F4F5F7] dark:bg-[#181C25] text-[11px] font-semibold text-left hover:border-[#FF444F] border border-transparent cursor-pointer"
                  >
                    {preset}
                  </button>
                ))}
              </div>

              {copilotLoading && (
                <div className="p-4 rounded-2xl bg-[#F8F9FB] dark:bg-[#181C25] text-xs text-slate-500 flex items-center gap-2">
                  <span className="w-4 h-4 rounded-full border-2 border-[#FF444F] border-t-transparent animate-spin" />
                  Evaluating live Deriv market snapshot & indicators...
                </div>
              )}

              {copilotError && (
                <div className="p-4 rounded-2xl bg-[#FF444F]/10 border border-[#FF444F]/30 text-xs text-[#FF444F]">
                  {copilotError}
                </div>
              )}

              {copilotAnswer && (
                <div className="p-4 rounded-2xl bg-[#F8F9FB] dark:bg-[#181C25] border border-slate-200 dark:border-[#2A2F3D] text-xs leading-relaxed whitespace-pre-wrap">
                  {copilotAnswer}
                </div>
              )}
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleAskCopilot();
              }}
              className="pt-3 border-t border-slate-200 dark:border-[#2A2F3D] flex items-center gap-2"
            >
              <input
                type="text"
                value={copilotPrompt}
                onChange={(e) => setCopilotPrompt(e.target.value)}
                placeholder={`Ask about ${selectedSymbol} setup or risk...`}
                className="flex-1 px-3.5 py-2.5 rounded-xl bg-[#F4F5F7] dark:bg-[#181C25] text-xs outline-none"
              />
              <button
                type="submit"
                disabled={copilotLoading}
                className="p-2.5 rounded-xl bg-[#FF444F] text-white cursor-pointer disabled:opacity-60"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
