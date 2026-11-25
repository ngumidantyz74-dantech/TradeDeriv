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
  BookOpen,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { apiFetch } from '../lib/api';
import { getCanonicalBalances, computeLiveOrderMetrics } from '../lib/balances';
import { DepositSheet } from '../components/CashierFlows';
import { BotInstrumentIcon, BotContractTypeIcon, TradeTypeCell } from '../components/DerivBadges';
import { BotBlocklyCanvas } from '../components/BotBlocklyCanvas';
import {
  createDefaultXmlWorkspaceState,
  QUICK_STRATEGIES,
  getAssignmentVal,
  setAssignmentVal,
  resolveSubtypeDef,
  inferTradeCategoryFromContract,
  inferMarketFromSymbol,
  serializeBotWorkspaceXml,
  parseBotWorkspaceXml,
  type BotXmlWorkspaceState,
  type QuickStrategyDef,
} from '../lib/botXml';
import {
  DerivBotInitializingLoader,
  BlocklyOverlayLoader,
} from '../components/DerivLoadingModal';
import type { BotTelemetry, BotJournalEntry, CandleData } from '../types';

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
  winStep?: string;
  maxWinSteps?: string;
  growthRate?: number;
  xmlSnapshot?: BotXmlWorkspaceState;
}

const DEFAULT_SAVED_BOTS: SavedBotItem[] = [
  {
    id: 'preset-matches',
    name: 'MatchesScalper',
    lastModified: 'Just now',
    status: 'Local',
    symbol: '1HZ100V',
    contractType: 'DIGITMATCH',
    stake: '1',
    duration: '1',
    durationUnit: 't',
    barrier: '4',
    martingale: '1.2',
    takeProfit: '10',
    stopLoss: '6',
    winStep: '0.5',
    maxWinSteps: '3',
  },
  {
    id: 'preset-contwin',
    name: 'Contwin',
    lastModified: '23 Nov 2026',
    status: 'Local',
    symbol: '1HZ100V',
    contractType: 'CALL',
    stake: '1',
    duration: '1',
    durationUnit: 't',
    barrier: '1',
    martingale: '2.1',
    takeProfit: '10',
    stopLoss: '6',
    winStep: '0.5',
    maxWinSteps: '3',
  },
];

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

function getOrderRunKey(notes?: string | null): string | null {
  const m = String(notes || '').match(/run:([^\s|]+)/i);
  return m?.[1] || null;
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
    isDbLocked,
    setActiveTab,
    setSelectedSymbol,
    tradePreset,
    setTradePreset,
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
  const [xmlImportError, setXmlImportError] = useState<string | null>(null);
  const [validatingXml, setValidatingXml] = useState<boolean>(false);
  const [quantumNowMs, setQuantumNowMs] = useState<number>(() => Date.now());
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
    parsedState?: Partial<BotXmlWorkspaceState>;
    isQuantum?: boolean;
    quantumPrediction?: {
      prediction_id: string;
      expires_at: string;
      probability?: number;
      remainingSeconds?: number;
    } | null;
  } | null>(null);

  // Saved Bots List (Dashboard "Your bots:" - session memory only, zero browser storage caching)
  const [savedBots, setSavedBots] = useState<SavedBotItem[]>(DEFAULT_SAVED_BOTS);
  const [botRowMenuId, setBotRowMenuId] = useState<string | null>(null);

  useEffect(() => {
    if (!menuOpen) return;
    setUtcNow(formatGmtStamp());
    const id = setInterval(() => setUtcNow(formatGmtStamp()), 1000);
    return () => clearInterval(id);
  }, [menuOpen]);

  // XML Blockly Workspace State + Undo / Redo Stacks
  const [xmlState, setXmlState] = useState<BotXmlWorkspaceState>(() => {
    const base = createDefaultXmlWorkspaceState();
    const sym = selectedSymbol || base.symbol;
    const inf = inferMarketFromSymbol(sym);
    return { ...base, symbol: sym, market: inf.market, submarket: inf.submarket };
  });
  const [undoStack, setUndoStack] = useState<BotXmlWorkspaceState[]>([]);
  const [redoStack, setRedoStack] = useState<BotXmlWorkspaceState[]>([]);
  const [canvasZoom, setCanvasZoom] = useState<number>(100);
  const [qsStep2Symbol, setQsStep2Symbol] = useState<string>(xmlState.symbol);
  const [qsStep2Stake, setQsStep2Stake] = useState<string>('1');
  const [qsStep2Factor, setQsStep2Factor] = useState<string>('2.1');
  const [qsStep2TP, setQsStep2TP] = useState<string>('10');
  const [qsStep2SL, setQsStep2SL] = useState<string>('6');
  const [qsStep2Growth, setQsStep2Growth] = useState<number>(0.02);

  // Derived active parameters from XML Workspace
  const symbol = xmlState.symbol;
  const baseStake = getAssignmentVal(xmlState.assignments, 'initialStake', '1');
  const winStep = getAssignmentVal(xmlState.assignments, 'winStep', '0.5');
  const maxWinSteps = getAssignmentVal(xmlState.assignments, 'maxWinSteps', '3');
  const takeProfit = getAssignmentVal(xmlState.assignments, 'profitThreshold', '10');
  const stopLoss = getAssignmentVal(xmlState.assignments, 'lossThreshold', '6');
  const tradeSide = getAssignmentVal(xmlState.assignments, 'tradeSide', xmlState.thenPurchase || 'CALL');
  const subtypeDef = resolveSubtypeDef(xmlState.tradeCategory, xmlState.tradeSubtype);
  const contractType =
    xmlState.contractTypeSelection !== 'Both'
      ? xmlState.contractTypeSelection
      : xmlState.thenPurchase || subtypeDef.legs[0].value;

  const updateXmlState = useCallback(
    (updater: (prev: BotXmlWorkspaceState) => BotXmlWorkspaceState) => {
      setXmlState((prev) => {
        const next = updater(prev);
        if (next === prev) return prev;
        setUndoStack((u) => [...u.slice(-39), prev]);
        setRedoStack([]);
        if (next.symbol !== prev.symbol) {
          setSelectedSymbol(next.symbol);
        }
        return next;
      });
    },
    [setSelectedSymbol]
  );

  const handleUndo = () => {
    setUndoStack((u) => {
      if (u.length === 0) return u;
      const target = u[u.length - 1];
      setXmlState((curr) => {
        setRedoStack((r) => [curr, ...r.slice(0, 39)]);
        return target;
      });
      return u.slice(0, -1);
    });
  };

  const handleRedo = () => {
    setRedoStack((r) => {
      if (r.length === 0) return r;
      const target = r[0];
      setXmlState((curr) => {
        setUndoStack((u) => [...u.slice(-39), curr]);
        return target;
      });
      return r.slice(1);
    });
  };

  // Quick Strategy 2-Step Modal (Exact 14 Deriv strategies)
  const [qsOpen, setQsOpen] = useState(false);
  const [qsStep, setQsStep] = useState<1 | 2>(1);
  const [qsSearch, setQsSearch] = useState('');
  const [qsFilter, setQsFilter] = useState<'All' | 'Accumulators' | 'Options'>('All');
  const [qsSelected, setQsSelected] = useState<QuickStrategyDef>(QUICK_STRATEGIES[0]);

  const [telemetry, setTelemetry] = useState<BotTelemetry | null>(null);
  const [sessionResetAt, setSessionResetAt] = useState<number>(() => Date.now());
  const [dismissedOutcomeKey, setDismissedOutcomeKey] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  // Reset telemetry cleanly whenever active user or accountMode changes
  useEffect(() => {
    setTelemetry(null);
    setSessionResetAt(Date.now());
    setDismissedOutcomeKey('');
  }, [user?.id, accountMode]);

  // Embedded Lightweight Chart refs (for Deriv Bot Chart tab)
  const chartContainerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Area'> | null>(null);
  const [candles, setCandles] = useState<CandleData[]>([]);

  const { optionsBal } = getCanonicalBalances(user, accounts, accountMode, activeConnectedAccount);

  // Consume tradePreset from OptionsHub or Strategy Lab
  useEffect(() => {
    if (!tradePreset) return;
    updateXmlState((prev) => {
      let next = { ...prev };
      if (tradePreset.symbol) {
        const infMkt = inferMarketFromSymbol(tradePreset.symbol);
        next.symbol = tradePreset.symbol;
        next.market = infMkt.market;
        next.submarket = infMkt.submarket;
      }
      if (tradePreset.contractType) {
        const infCat = inferTradeCategoryFromContract(tradePreset.contractType);
        const sub = resolveSubtypeDef(infCat.tradeCategory, infCat.tradeSubtype);
        next.tradeCategory = infCat.tradeCategory;
        next.tradeSubtype = infCat.tradeSubtype;
        next.contractTypeSelection = tradePreset.contractType;
        next.thenPurchase = tradePreset.contractType;
        next.elsePurchase = sub.legs.find((l) => l.value !== tradePreset.contractType)?.value || tradePreset.contractType;
        next.assignments = setAssignmentVal(next.assignments, 'tradeSide', tradePreset.contractType);
      }
      if (tradePreset.barrier !== undefined) next.prediction = String(tradePreset.barrier);
      if (tradePreset.growthRate) next.growthRate = tradePreset.growthRate;
      if (tradePreset.stake && tradePreset.stake > 0) {
        next.assignments = setAssignmentVal(next.assignments, 'initialStake', String(tradePreset.stake));
      }
      if (tradePreset.duration !== undefined) next.duration = String(tradePreset.duration);
      if (tradePreset.durationUnit) next.durationUnit = tradePreset.durationUnit;
      if (tradePreset.strategyType) next.strategyType = tradePreset.strategyType;
      if (tradePreset.quantumPredictionId) {
        next.quantumPredictionId = tradePreset.quantumPredictionId;
        next.quantumExpiresAt = tradePreset.quantumExpiresAt || null;
        next.strategyName = `Quantum_${tradePreset.quantumPredictionId}`;
      } else {
        next.quantumPredictionId = null;
        next.quantumExpiresAt = null;
      }
      return next;
    });
    setBotView('builder');
    setTradePreset(null);
  }, [tradePreset, updateXmlState, setTradePreset]);

  useEffect(() => {
    if (!xmlState.quantumPredictionId && !pendingXmlImport?.quantumPrediction) return;
    const id = setInterval(() => setQuantumNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, [xmlState.quantumPredictionId, pendingXmlImport?.quantumPrediction]);

  const pollStatus = useCallback(async () => {
    try {
      const res = await apiFetch<{ telemetry: BotTelemetry | null }>(
        `/api/bots/status?accountMode=${encodeURIComponent(accountMode)}`
      );
      const tel = res.telemetry;
      if (tel && tel.accountMode && tel.accountMode !== accountMode) {
        return;
      }
      setTelemetry(tel);
    } catch {
      // ignore
    }
  }, [accountMode]);

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

  // Embedded Lightweight Chart when botView === 'chart'
  useEffect(() => {
    if (botView !== 'chart') return;
    let active = true;
    const load = () => {
      apiFetch<{ candles: CandleData[] }>(
        `/api/market/candles?symbol=${encodeURIComponent(symbol)}&granularity=60&count=120&mock=${isDbLocked ? '1' : '0'}&_t=${Date.now()}`,
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
  }, [botView, symbol, isDbLocked]);

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

  const handleResetDefaults = () => {
    setXmlState(createDefaultXmlWorkspaceState());
    setUndoStack([]);
    setRedoStack([]);
    showToast('Workspace reset to default XML blocks', 'info');
  };

  const handleSwitchAccount = (mode: 'demo' | 'real') => {
    setAccountSheetOpen(false);
    if (mode !== accountMode) {
      setTelemetry(null);
      setBlocklyLoading(true);
      setAccountMode(mode);
      setTimeout(() => setBlocklyLoading(false), 450);
    }
  };

  const handleRunBot = async (e?: React.FormEvent, overrides?: Partial<Record<string, any>>) => {
    if (e) e.preventDefault();
    const activeQId = overrides?.quantumPredictionId !== undefined ? overrides.quantumPredictionId : xmlState.quantumPredictionId;
    if (activeQId && xmlState.quantumExpiresAt) {
      const qSecs = Math.floor((new Date(xmlState.quantumExpiresAt).getTime() - Date.now()) / 1000);
      if (qSecs <= 0) {
        showToast('Quantum prediction expired after 120 seconds. Re-scan in standalone Quantum Analyser.', 'error');
        return;
      }
    }
    setSubmitting(true);
    try {
      // Trade with REAL Deriv account balances (Demo OR Real) when connected & NOT altered/locked by admin
      const isLiveDerivUnlocked = Boolean(activeConnectedAccount) && !isDbLocked;

      const resolvedMaxStake = Number(getAssignmentVal(xmlState.assignments, 'maxStake', xmlState.maxStake || '0')) || undefined;
      const resolvedSellTicks = Number(getAssignmentVal(xmlState.assignments, 'Tick Count', xmlState.sellTickCount || '0')) || 0;
      const resolvedMaxLosses = Number(xmlState.maxLosses || '0') || undefined;

      const payload = {
        strategyName: overrides?.strategyName ?? xmlState.strategyName,
        strategyType: overrides?.strategyType ?? xmlState.strategyType,
        symbol: overrides?.symbol ?? symbol,
        contractType: overrides?.contractType ?? contractType,
        contractSideMode: overrides?.contractSideMode ?? (xmlState.contractTypeSelection === 'Both' ? 'Both' : 'Single'),
        tradeSide: overrides?.tradeSide ?? tradeSide,
        winStep: Number(overrides?.winStep ?? winStep) || 0,
        maxWinSteps: Number(overrides?.maxWinSteps ?? maxWinSteps) || 3,
        baseStake: Number(overrides?.baseStake ?? baseStake) || 1,
        barrier: overrides?.barrier ?? xmlState.prediction,
        duration: Number(overrides?.duration ?? xmlState.duration) || 1,
        durationUnit: overrides?.durationUnit ?? xmlState.durationUnit,
        multiplier: 100,
        martingale: Number(overrides?.martingale ?? xmlState.martingaleFactor) || 2.1,
        takeProfit: Number(overrides?.takeProfit ?? xmlState.accumulatorTakeProfit ?? takeProfit) || 10,
        stopLoss: Number(overrides?.stopLoss ?? stopLoss) || 6,
        maxStake: resolvedMaxStake,
        sellTickCount: resolvedSellTicks,
        maxLosses: resolvedMaxLosses,
        maxTrades: Number(overrides?.maxTrades ?? xmlState.maxTrades) || 50,
        growthRate: overrides?.growthRate ?? xmlState.growthRate,
        analyserSync: false,
        quantumPredictionId: activeQId || null,
        accountMode,
        executionSpeed: 'fast',
        executionMode: isLiveDerivUnlocked ? 'deriv' : 'virtual',
        connectedAccountId: activeConnectedAccount?.id || null,
      };
      const res = await apiFetch<{ telemetry: BotTelemetry }>('/api/bots/run', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      setDismissedOutcomeKey('');
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
      const res = await apiFetch<{ telemetry: BotTelemetry | null }>('/api/bots/stop', {
        method: 'POST',
        body: JSON.stringify({ accountMode }),
      });
      setTelemetry(res.telemetry);
      await Promise.all([refreshOrders(), refreshAll()]);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to stop bot', 'error');
    }
  };

  const handleImportXmlFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setXmlImportError(null);
    setValidatingXml(true);
    const reader = new FileReader();
    reader.onload = async () => {
      const xml = String(reader.result || '');
      try {
        const validation = await apiFetch<{
          valid: boolean;
          isQuantum: boolean;
          quantumPrediction?: {
            prediction_id: string;
            expires_at: string;
            probability?: number;
            remainingSeconds?: number;
          } | null;
          summary?: {
            symbol: string;
            contractType: string;
            stake: number;
            duration: number;
            durationUnit: string;
            barrier: string;
          };
        }>('/api/quantum/validate-xml', {
          method: 'POST',
          body: JSON.stringify({ xml }),
        });

        const parsed = parseBotWorkspaceXml(xml, xmlState);
        const parsedAssignments = parsed.assignments || xmlState.assignments;
        if (validation.quantumPrediction) {
          parsed.quantumPredictionId = validation.quantumPrediction.prediction_id;
          parsed.quantumExpiresAt = validation.quantumPrediction.expires_at;
        } else {
          parsed.quantumPredictionId = null;
          parsed.quantumExpiresAt = null;
        }

        setPendingXmlImport({
          fileName: file.name,
          symbol: validation.summary?.symbol || parsed.symbol,
          contractType: validation.summary?.contractType || parsed.thenPurchase || parsed.contractTypeSelection,
          stake: validation.summary?.stake ? String(validation.summary.stake) : getAssignmentVal(parsedAssignments, 'initialStake', baseStake),
          duration: validation.summary?.duration ? String(validation.summary.duration) : parsed.duration,
          barrier: validation.summary?.barrier ?? parsed.prediction,
          martingale: parsed.martingaleFactor,
          takeProfit: getAssignmentVal(parsedAssignments, 'profitThreshold', takeProfit),
          stopLoss: getAssignmentVal(parsedAssignments, 'lossThreshold', stopLoss),
          parsedState: parsed,
          isQuantum: validation.isQuantum,
          quantumPrediction: validation.quantumPrediction || null,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'XML validation failed.';
        setPendingXmlImport(null);
        setXmlImportError(msg);
        showToast(msg, 'error');
      } finally {
        setValidatingXml(false);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const confirmOpenPendingXml = () => {
    if (!pendingXmlImport) return;
    const p = pendingXmlImport;
    if (p.quantumPrediction?.expires_at) {
      const rem = Math.floor((new Date(p.quantumPrediction.expires_at).getTime() - Date.now()) / 1000);
      if (rem <= 0) {
        setXmlImportError('Quantum prediction expired after 120 seconds. Re-scan in Quantum Analyser.');
        setPendingXmlImport(null);
        return;
      }
    }
    const cleanName = p.fileName.replace(/\.xml$/i, '');

    const nextSnapshot: BotXmlWorkspaceState = {
      ...xmlState,
      ...(p.parsedState || {}),
      quantumPredictionId: p.quantumPrediction?.prediction_id || null,
      quantumExpiresAt: p.quantumPrediction?.expires_at || null,
      strategyName: cleanName,
      strategyType: p.isQuantum ? 'quantum_minimal_loss' : p.parsedState?.strategyType || 'xml_block_flow',
    };

    updateXmlState(() => nextSnapshot);
    setXmlImportError(null);

    const parsedAssignments = nextSnapshot.assignments || xmlState.assignments;
    const resolvedContract =
      nextSnapshot.contractTypeSelection !== 'Both'
        ? nextSnapshot.contractTypeSelection
        : nextSnapshot.thenPurchase || contractType;

    setSavedBots((prev) => [
      {
        id: `xml-${Date.now()}`,
        name: cleanName,
        lastModified: 'Just now',
        status: 'Local',
        symbol: nextSnapshot.symbol || symbol,
        contractType: resolvedContract,
        stake: getAssignmentVal(parsedAssignments, 'initialStake', baseStake),
        duration: nextSnapshot.duration || xmlState.duration,
        durationUnit: nextSnapshot.durationUnit || xmlState.durationUnit,
        barrier: nextSnapshot.prediction || xmlState.prediction,
        martingale: nextSnapshot.martingaleFactor || xmlState.martingaleFactor,
        takeProfit: getAssignmentVal(parsedAssignments, 'profitThreshold', takeProfit),
        stopLoss: getAssignmentVal(parsedAssignments, 'lossThreshold', stopLoss),
        winStep: getAssignmentVal(parsedAssignments, 'winStep', winStep),
        maxWinSteps: getAssignmentVal(parsedAssignments, 'maxWinSteps', maxWinSteps),
        growthRate: nextSnapshot.growthRate ?? xmlState.growthRate,
        xmlSnapshot: nextSnapshot,
      },
      ...prev.filter((b) => b.name !== cleanName),
    ]);

    setPendingXmlImport(null);
    setLoadModalOpen(false);
    setBotView('builder');
    showToast(`Verified & loaded ${cleanName} XML blocks into Bot Builder`, 'success');
  };

  const handleSaveAndExportXml = () => {
    const xml = serializeBotWorkspaceXml(xmlState);
    const blob = new Blob([xml], { type: 'application/xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${xmlState.strategyName.replace(/[^a-z0-9_-]/gi, '_')}.xml`;
    a.click();
    URL.revokeObjectURL(url);

    setSavedBots((prev) => [
      {
        id: `local-${Date.now()}`,
        name: xmlState.strategyName,
        lastModified: 'Just now',
        status: 'Local',
        symbol,
        contractType,
        stake: baseStake,
        duration: xmlState.duration,
        durationUnit: xmlState.durationUnit,
        barrier: xmlState.prediction,
        martingale: xmlState.martingaleFactor,
        takeProfit,
        stopLoss,
        winStep,
        maxWinSteps,
        growthRate: xmlState.growthRate,
        xmlSnapshot: xmlState,
      },
      ...prev.filter((b) => b.name !== xmlState.strategyName),
    ]);
    showToast('Strategy saved & Blockly XML exported', 'success');
  };

  const loadSavedBot = (b: SavedBotItem) => {
    if (b.xmlSnapshot) {
      updateXmlState(() => b.xmlSnapshot!);
    } else {
      updateXmlState((prev) => {
        const infCat = inferTradeCategoryFromContract(b.contractType);
        const sub = resolveSubtypeDef(infCat.tradeCategory, infCat.tradeSubtype);
        const infMkt = inferMarketFromSymbol(b.symbol);
        let assignments = setAssignmentVal(prev.assignments, 'initialStake', b.stake);
        assignments = setAssignmentVal(assignments, 'profitThreshold', b.takeProfit);
        assignments = setAssignmentVal(assignments, 'lossThreshold', b.stopLoss);
        if (b.winStep) assignments = setAssignmentVal(assignments, 'winStep', b.winStep);
        if (b.maxWinSteps) assignments = setAssignmentVal(assignments, 'maxWinSteps', b.maxWinSteps);
        assignments = setAssignmentVal(assignments, 'tradeSide', b.contractType);
        return {
          ...prev,
          quantumPredictionId: null,
          quantumExpiresAt: null,
          strategyName: b.name,
          market: infMkt.market,
          submarket: infMkt.submarket,
          symbol: b.symbol,
          tradeCategory: infCat.tradeCategory,
          tradeSubtype: infCat.tradeSubtype,
          contractTypeSelection: 'Both',
          thenPurchase: b.contractType,
          elsePurchase: sub.legs.find((l) => l.value !== b.contractType)?.value || b.contractType,
          duration: b.duration,
          durationUnit: b.durationUnit,
          prediction: b.barrier,
          martingaleFactor: b.martingale,
          growthRate: b.growthRate ?? prev.growthRate,
          assignments,
        };
      });
    }
    setBotRowMenuId(null);
    setBotView('builder');
    showToast(`Loaded ${b.name}`, 'success');
  };

  const openQuickStrategyModal = () => {
    setQsStep2Symbol(xmlState.symbol);
    setQsStep2Stake(baseStake || '1');
    setQsStep2Factor(xmlState.martingaleFactor || '2.1');
    setQsStep2TP(takeProfit || '10');
    setQsStep2SL(stopLoss || '6');
    setQsStep2Growth(xmlState.growthRate || 0.02);
    setQsStep(1);
    setQsOpen(true);
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
    const sub = resolveSubtypeDef(qsSelected.tradeCategory, qsSelected.tradeSubtype);
    const infMkt = inferMarketFromSymbol(qsStep2Symbol);

    updateXmlState((prev) => {
      let assignments = setAssignmentVal(prev.assignments, 'initialStake', qsStep2Stake);
      assignments = setAssignmentVal(assignments, 'profitThreshold', qsStep2TP);
      assignments = setAssignmentVal(assignments, 'lossThreshold', qsStep2SL);
      assignments = setAssignmentVal(assignments, 'tradeSide', qsSelected.contractType);
      return {
        ...prev,
        quantumPredictionId: null,
        quantumExpiresAt: null,
        strategyName: qsSelected.name,
        strategyType: qsSelected.key,
        market: infMkt.market,
        submarket: infMkt.submarket,
        symbol: qsStep2Symbol,
        tradeCategory: qsSelected.tradeCategory,
        tradeSubtype: qsSelected.tradeSubtype,
        contractTypeSelection: qsSelected.contractType === 'ACCU' ? 'ACCU' : 'Both',
        thenPurchase: qsSelected.contractType,
        elsePurchase: sub.legs.find((l) => l.value !== qsSelected.contractType)?.value || qsSelected.contractType,
        martingaleFactor: qsStep2Factor,
        growthRate: qsStep2Growth,
        assignments,
      };
    });

    setQsOpen(false);
    setBotView('builder');
    if (runNow) {
      handleRunBot(undefined, {
        quantumPredictionId: null,
        strategyName: qsSelected.name,
        strategyType: qsSelected.key,
        symbol: qsStep2Symbol,
        contractType: qsSelected.contractType,
        contractSideMode: qsSelected.contractType === 'ACCU' ? 'Single' : 'Both',
        tradeSide: qsSelected.contractType,
        baseStake: Number(qsStep2Stake) || 1,
        martingale: Number(qsStep2Factor) || 2.1,
        takeProfit: Number(qsStep2TP) || 10,
        stopLoss: Number(qsStep2SL) || 6,
        growthRate: qsStep2Growth,
      });
    } else {
      showToast(`${qsSelected.name} XML blocks loaded into workspace`, 'success');
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

  const journalEntries: BotJournalEntry[] = useMemo(() => {
    const raw = telemetry?.journal || [];
    if (raw.length === 0) {
      return [
        {
          id: 'init-acct',
          time: new Date().toISOString(),
          type: 'info',
          text: activeConnectedAccount && !isDbLocked
            ? `You are using your live ${accountMode === 'demo' ? 'Demo' : 'Real'} Deriv account (${activeConnectedAccount.deriv_account_id}).`
            : 'You are using your USD account (Mock Mode).',
        },
      ];
    }
    return raw.filter((j) => {
      if (journalFilter === 'all') return true;
      if (journalFilter === 'error') return j.type === 'error' || j.type === 'warning';
      if (journalFilter === 'profit') return j.type === 'profit' || j.type === 'loss' || j.type === 'session_profit';
      if (journalFilter === 'bought') return j.type === 'bought' || j.type === 'stake';
      return true;
    });
  }, [telemetry?.journal, journalFilter, activeConnectedAccount, accountMode, isDbLocked]);

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
    setSessionResetAt(Date.now());
    setDismissedOutcomeKey('');
    setTelemetry(null);
  };

  const runState = telemetry?.runState || (telemetry?.running ? 'buying' : 'idle');
  const outcomeKey = `${runState}:${telemetry?.tradesPlaced ?? 0}:${telemetry?.startedAt ?? ''}:${telemetry?.realizedPnl ?? 0}`;
  const showOutcomePill =
    (runState === 'won' || runState === 'lost') && !telemetry?.running && dismissedOutcomeKey !== outcomeKey;

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
                onClick={openQuickStrategyModal}
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

            {/* Strategy Lab Quick Row */}
            <div className="flex flex-wrap items-center gap-2 pt-1">
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
              <BotInstrumentIcon symbol={symbol} size="md" />
              <div className="min-w-0">
                <div className="flex items-center gap-1">
                  <select
                    value={symbol}
                    onChange={(e) => {
                      const nextSym = e.target.value;
                      const infMkt = inferMarketFromSymbol(nextSym);
                      updateXmlState((prev) => ({
                        ...prev,
                        symbol: nextSym,
                        market: infMkt.market,
                        submarket: infMkt.submarket,
                      }));
                    }}
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

        {/* VIEW 3: EXACT DERIV BOT XML BLOCKLY WORKSPACE (Screenshots 205837, 210134, 210512, 210517, 210527) */}
        {botView === 'builder' && (
          <div className="flex-1 min-h-0 flex overflow-hidden">
            {/* Left Vertical Workspace Icon Rail */}
            <aside className="w-[46px] shrink-0 bg-white dark:bg-[#151820] border-r border-slate-200/80 dark:border-white/[0.08] flex flex-col items-center py-3 gap-4 z-10 overflow-y-auto no-scrollbar">
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
                title="Import / Load XML"
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
                onClick={() => {
                  setCanvasZoom(100);
                  showToast('Blocks aligned to 100% zoom', 'info');
                }}
                title="Clean up blocks"
                className="p-1.5 rounded cursor-pointer text-[#374151] dark:text-slate-300 hover:text-[#111319] dark:hover:text-white"
              >
                <SlidersHorizontal className="w-[18px] h-[18px]" />
              </button>

              <button
                type="button"
                disabled={undoStack.length === 0}
                onClick={handleUndo}
                title="Undo"
                className="p-1.5 text-[#6B7280] dark:text-slate-400 hover:text-[#111319] dark:hover:text-white disabled:opacity-35 cursor-pointer"
              >
                <Undo2 className="w-[18px] h-[18px]" />
              </button>
              <button
                type="button"
                disabled={redoStack.length === 0}
                onClick={handleRedo}
                title="Redo"
                className="p-1.5 text-[#6B7280] dark:text-slate-400 hover:text-[#111319] dark:hover:text-white disabled:opacity-35 cursor-pointer"
              >
                <Redo2 className="w-[18px] h-[18px]" />
              </button>

              <button
                type="button"
                onClick={() => setCanvasZoom((z) => Math.min(120, z + 5))}
                title="Zoom in"
                className="p-1.5 text-[#374151] dark:text-slate-300 hover:text-[#111319] dark:hover:text-white cursor-pointer"
              >
                <ZoomIn className="w-[18px] h-[18px]" />
              </button>
              <button
                type="button"
                onClick={() => setCanvasZoom((z) => Math.max(80, z - 5))}
                title="Zoom out"
                className="p-1.5 text-[#374151] dark:text-slate-300 hover:text-[#111319] dark:hover:text-white cursor-pointer"
              >
                <ZoomOut className="w-[18px] h-[18px]" />
              </button>
            </aside>

            {/* Right Clean Blockly XML Canvas */}
            <BotBlocklyCanvas
              state={xmlState}
              onChange={updateXmlState}
              instruments={instruments}
              canvasZoom={canvasZoom}
              onOpenQuickStrategy={openQuickStrategyModal}
            />
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
                            <BotInstrumentIcon symbol={latestBotOrder.symbol} size="sm" />
                            <span className="text-[12px] font-bold text-[#111319] dark:text-white">
                              {instruments.find((i) => i.symbol === latestBotOrder.symbol)?.display_name ||
                                latestBotOrder.symbol}
                            </span>
                          </div>
                          <span className="inline-flex items-center gap-1.5 text-[12px] font-bold text-[#111319] dark:text-white">
                            <BotContractTypeIcon
                              contractType={latestBotOrder.contract_type}
                              side={latestBotOrder.side}
                              barrier={latestBotOrder.barrier}
                              className="w-3.5 h-3.5 shrink-0"
                            />
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

                  {telemetry?.running && runState === 'buying' && botOrders.length === 0 && (
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
                    {botOrders.slice(0, 40).map((o, idx, arr) => {
                      const live = computeLiveOrderMetrics(o, ticks);
                      const win = live.pnl >= 0;
                      const exitVal = Number(o.exit_price ?? live.currentPrice ?? o.entry_price);
                      const prevOrder = idx > 0 ? arr[idx - 1] : null;
                      let hasRunSeparator = false;
                      if (prevOrder) {
                        const prevRun = getOrderRunKey(prevOrder.notes);
                        const currRun = getOrderRunKey(o.notes);
                        if (prevRun && currRun) {
                          hasRunSeparator = prevRun !== currRun;
                        } else if (Boolean(prevRun) !== Boolean(currRun)) {
                          hasRunSeparator = true;
                        } else {
                          const prevTs = new Date(prevOrder.opened_at).getTime();
                          const currTs = new Date(o.opened_at).getTime();
                          if (Number.isFinite(prevTs) && Number.isFinite(currTs) && Math.abs(prevTs - currTs) > 45000) {
                            hasRunSeparator = true;
                          }
                        }
                      }
                      return (
                        <React.Fragment key={o.id}>
                          {hasRunSeparator && (
                            <div
                              aria-hidden="true"
                              className="h-[6px] w-full bg-[#F2F3F5] dark:bg-[#0E1015]"
                            />
                          )}
                          <div className="grid grid-cols-3 items-center px-4 py-2.5 text-[11px]">
                            <TradeTypeCell
                              symbol={o.symbol}
                              contractType={o.contract_type}
                              side={o.side}
                              barrier={o.barrier}
                              size="sm"
                            />

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
                        </React.Fragment>
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
                      const stripeBg =
                        idx % 2 === 1 ? 'bg-[#F4F5F7] dark:bg-[#181C25]' : 'bg-white dark:bg-[#151820]';
                      const colonIdx = entry.text.indexOf(':');
                      const prefix = colonIdx > 0 ? entry.text.slice(0, colonIdx + 1) : '';
                      const rest = colonIdx > 0 ? entry.text.slice(colonIdx + 1) : entry.text;
                      const prefixColor =
                        entry.type === 'error'
                          ? 'text-[#FF444F]'
                          : entry.type === 'warning'
                            ? 'text-[#D99B26]'
                            : entry.type === 'session_profit' || entry.type === 'profit'
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
                            ) : entry.type === 'warning' ? (
                              <span className="text-[#D99B26] font-medium">{entry.text}</span>
                            ) : entry.type === 'session_profit' ? (
                              <span className="text-[#2A9D8F] font-medium">{entry.text}</span>
                            ) : entry.type === 'stake' ? (
                              <span className="text-[#2563EB] dark:text-[#60A5FA]">{entry.text}</span>
                            ) : prefix ? (
                              <>
                                <span className={`${prefixColor} font-medium`}>{prefix}</span>
                                <span
                                  className={
                                    entry.type === 'loss'
                                      ? 'text-[#FF444F] font-medium'
                                      : entry.type === 'profit'
                                        ? 'text-[#2A9D8F] font-medium'
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
                    <TradeTypeCell
                      symbol={o.symbol}
                      contractType={o.contract_type}
                      side={o.side}
                      barrier={o.barrier}
                      size="sm"
                    />
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
                <span>All uploaded Bot XML files undergo server-side structure, contract parameter, and 120s Quantum HMAC validation.</span>
              </div>

              {xmlImportError && (
                <div className="rounded-md bg-[#FF444F]/10 border border-[#FF444F]/35 px-3 py-2.5 text-[12px] text-[#FF444F] font-semibold">
                  {xmlImportError}
                </div>
              )}

              {loadModalTab === 'local' ? (
                pendingXmlImport ? (
                  <div className="flex-1 flex flex-col justify-between gap-4">
                    <div className="rounded-xl border border-slate-200 dark:border-white/10 p-4 bg-[#F8F9FA] dark:bg-[#181C25] space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold text-sm truncate">{pendingXmlImport.fileName}</span>
                        {pendingXmlImport.quantumPrediction ? (() => {
                          const remSecs = Math.max(0, Math.floor((new Date(pendingXmlImport.quantumPrediction!.expires_at).getTime() - quantumNowMs) / 1000));
                          return remSecs > 0 ? (
                            <span className="px-2 py-0.5 rounded bg-[#00A878]/15 text-[#00A878] text-[11px] font-bold font-mono shrink-0">
                              Quantum Verified · {Math.floor(remSecs / 60)}:{String(remSecs % 60).padStart(2, '0')}
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded bg-[#FF444F]/15 text-[#FF444F] text-[11px] font-bold shrink-0">
                              Expired (120s)
                            </span>
                          );
                        })() : (
                          <span className="px-2 py-0.5 rounded bg-[#00A878]/15 text-[#00A878] text-[11px] font-bold shrink-0">
                            Verified Ready
                          </span>
                        )}
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
                          <strong>
                            {pendingXmlImport.duration || xmlState.duration}{' '}
                            {pendingXmlImport.parsedState?.durationUnit || xmlState.durationUnit}
                          </strong>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3 pt-2">
                      <button
                        type="button"
                        onClick={() => {
                          setPendingXmlImport(null);
                          setXmlImportError(null);
                        }}
                        className="py-2.5 rounded-[4px] border border-[#111319] dark:border-white/30 text-[13px] font-bold cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        disabled={
                          Boolean(
                            pendingXmlImport.quantumPrediction &&
                              new Date(pendingXmlImport.quantumPrediction.expires_at).getTime() <= quantumNowMs
                          )
                        }
                        onClick={confirmOpenPendingXml}
                        className="py-2.5 rounded-[4px] bg-[#FF444F] hover:bg-[#E63946] text-white text-[13px] font-bold cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
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
                      disabled={validatingXml}
                      onClick={() => fileRef.current?.click()}
                      className="px-5 py-2.5 rounded-[4px] bg-[#FF444F] hover:bg-[#E63946] text-white text-[13px] font-bold cursor-pointer disabled:opacity-50"
                    >
                      {validatingXml ? 'Validating XML...' : 'Select an XML file from your device'}
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

        {xmlState.quantumPredictionId && xmlState.quantumExpiresAt && (() => {
          const qRem = Math.max(0, Math.floor((new Date(xmlState.quantumExpiresAt).getTime() - quantumNowMs) / 1000));
          const qValid = qRem > 0;
          return (
            <div
              className={`px-3 py-1.5 border-b text-[11px] font-semibold flex items-center justify-between gap-2 ${
                qValid
                  ? 'bg-[#00A878]/10 border-[#00A878]/25 text-[#008C64] dark:text-[#2A9D8F]'
                  : 'bg-[#FF444F]/10 border-[#FF444F]/25 text-[#FF444F]'
              }`}
            >
              <span className="truncate font-mono-num">
                {qValid
                  ? `Quantum Signed XML · ${Math.floor(qRem / 60)}:${String(qRem % 60).padStart(2, '0')} remaining`
                  : 'Quantum Signal Expired (120s) — Import a fresh Quantum XML'}
              </span>
            </div>
          );
        })()}

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

          {/* Status & Progress Bar matching 210257 (Dismissible Won/Lost overlay pill) */}
          <div
            role="button"
            tabIndex={0}
            onClick={() => botView !== 'dashboard' && setTelemetryOpen((v) => !v)}
            onKeyDown={(e) => {
              if ((e.key === 'Enter' || e.key === ' ') && botView !== 'dashboard') {
                setTelemetryOpen((v) => !v);
              }
            }}
            className={`relative flex-1 h-[40px] rounded-[4px] border px-3 flex flex-col justify-center cursor-pointer overflow-hidden ${
              showOutcomePill && runState === 'won'
                ? 'bg-gradient-to-r from-[#2A9D8F]/5 via-[#2A9D8F]/12 to-[#2A9D8F]/5 border-[#2A9D8F]/30'
                : showOutcomePill && runState === 'lost'
                  ? 'bg-gradient-to-r from-[#FF444F]/5 via-[#FF444F]/12 to-[#FF444F]/5 border-[#FF444F]/30'
                  : 'bg-[#F9FAFB] dark:bg-[#111319] border-slate-200 dark:border-white/[0.08]'
            }`}
          >
            <div className="flex items-center justify-center gap-2 text-[13px] font-bold">
              {showOutcomePill && runState === 'won' ? (
                <>
                  <span className="text-[#2A9D8F]">Won</span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDismissedOutcomeKey(outcomeKey);
                    }}
                    aria-label="Dismiss won status"
                    className="w-4 h-4 rounded-full border border-[#111319] dark:border-slate-300 text-[#111319] dark:text-slate-200 flex items-center justify-center hover:bg-black/5 cursor-pointer"
                  >
                    <X className="w-2.5 h-2.5" strokeWidth={2.5} />
                  </button>
                </>
              ) : showOutcomePill && runState === 'lost' ? (
                <>
                  <span className="text-[#FF444F]">Lost</span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDismissedOutcomeKey(outcomeKey);
                    }}
                    aria-label="Dismiss lost status"
                    className="w-4 h-4 rounded-full border border-[#111319] dark:border-slate-300 text-[#111319] dark:text-slate-200 flex items-center justify-center hover:bg-black/5 cursor-pointer"
                  >
                    <X className="w-2.5 h-2.5" strokeWidth={2.5} />
                  </button>
                </>
              ) : runState === 'bought' ? (
                <span className="text-[#111319] dark:text-white text-[12px]">Contract bought</span>
              ) : runState === 'buying' ? (
                <span className="text-[#111319] dark:text-white text-[12px]">Buying contract</span>
              ) : (
                <span className="text-[#374151] dark:text-slate-300 text-[12px]">Bot is not running</span>
              )}
            </div>

            {/* Progress bar + 3-node timeline track */}
            <div className="relative w-full h-[2px] bg-slate-200 dark:bg-white/10 rounded-full mt-1.5">
              <div
                className={`h-full rounded-full transition-all duration-300 ${
                  runState === 'bought' || (showOutcomePill && runState === 'won')
                    ? 'bg-[#2A9D8F] w-full'
                    : runState === 'buying'
                      ? 'bg-[#FF444F] w-1/3'
                      : showOutcomePill && runState === 'lost'
                        ? 'bg-[#FF444F] w-full'
                        : 'w-0'
                }`}
              />
              <span
                className={`absolute left-0 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full ${
                  telemetry?.running ? 'bg-[#FF444F]/70' : 'bg-slate-400'
                }`}
              />
              <span
                className={`absolute left-1/2 -translate-x-1/2 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full ${
                  runState === 'bought' || (showOutcomePill && runState === 'won')
                    ? 'bg-[#2A9D8F]'
                    : 'bg-slate-400'
                }`}
              />
              <span
                className={`absolute right-0 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full ${
                  showOutcomePill && runState === 'won' ? 'bg-[#2A9D8F]' : 'bg-slate-400'
                }`}
              />
            </div>
          </div>
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

      {/* EXACT 2-STEP QUICK STRATEGY VIEW (Matches Screenshots 210110, 210125, 210129) */}
      {qsOpen && (
        <div className="absolute top-[54px] bottom-[56px] inset-x-0 z-45 bg-white dark:bg-[#151820] flex flex-col">
          <div className="px-4 py-3.5 flex items-center justify-between border-b border-slate-100 dark:border-white/[0.06] shrink-0">
            <h3 className="text-[15px] font-bold text-[#111319] dark:text-white">
              Step {qsStep}/2: {qsStep === 1 ? 'Choose your strategy' : qsSelected.name}
            </h3>
            <button
              type="button"
              onClick={() => setQsOpen(false)}
              aria-label="Close Quick Strategy"
              className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-white/10 cursor-pointer text-[#374151] dark:text-slate-300"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="h-[3px] bg-slate-200 dark:bg-[#111319] w-full shrink-0">
            <div className={`h-full bg-[#FF444F] transition-all ${qsStep === 1 ? 'w-1/2' : 'w-full'}`} />
          </div>

          {qsStep === 1 ? (
            <div className="flex-1 overflow-y-auto px-4 py-3.5 space-y-4">
              {/* Search + Video Guide Box (Matches 210110) */}
              <div className="flex items-center gap-2.5">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-[#6B7280] absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={qsSearch}
                    onChange={(e) => setQsSearch(e.target.value)}
                    placeholder="Search"
                    className="w-full pl-9 pr-3 py-2 rounded-[4px] bg-[#F2F3F5] dark:bg-[#111319] text-[13px] text-[#111319] dark:text-white placeholder:text-[#8E95A2] outline-none"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setQsOpen(false);
                    setActiveTab('learning-hub');
                  }}
                  title="Strategy video guide"
                  className="w-9 h-9 rounded-[4px] border border-slate-200 dark:border-white/15 flex items-center justify-center hover:bg-slate-50 dark:hover:bg-white/5 cursor-pointer shrink-0"
                >
                  <svg viewBox="0 0 24 24" className="w-4 h-4 text-[#111319] dark:text-slate-200" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <rect x="3" y="4" width="18" height="14" rx="2" />
                    <polygon points="10,8 16,11 10,14" fill="currentColor" stroke="none" />
                    <path d="M8 21h8" strokeLinecap="round" />
                  </svg>
                </button>
              </div>

              {/* Filter Chips: All | Accumulators | Options */}
              <div className="flex items-center gap-2">
                {(['All', 'Accumulators', 'Options'] as const).map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setQsFilter(cat)}
                    className={`px-3.5 py-1 rounded-full text-[12px] font-medium border cursor-pointer transition-colors ${
                      qsFilter === cat
                        ? 'bg-[#111319] text-white border-[#111319] dark:bg-white dark:text-[#111319]'
                        : 'bg-white dark:bg-transparent border-slate-200 dark:border-white/15 text-[#374151] dark:text-slate-300'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>

              {/* Grouped Strategy Rows matching Screenshots 210110 & 210125 */}
              <div className="space-y-4 pb-6">
                {(['Accumulators', 'Options'] as const).map((groupName) => {
                  const groupItems = filteredQuickStrategies.filter((s) => s.category === groupName);
                  if (groupItems.length === 0) return null;
                  return (
                    <div key={groupName}>
                      <h4 className="text-[13px] font-bold text-[#111319] dark:text-white mb-1">
                        {groupName}
                      </h4>
                      <div className="divide-y divide-slate-100 dark:divide-white/[0.06]">
                        {groupItems.map((strat) => (
                          <button
                            key={strat.key}
                            type="button"
                            onClick={() => {
                              setQsSelected(strat);
                              setQsStep2Factor(strat.defaultFactor);
                              if (strat.contractType === 'ACCU') setQsStep2Growth(0.02);
                              setQsStep(2);
                            }}
                            className="w-full py-3.5 flex items-center justify-between text-left hover:bg-[#F8F9FA] dark:hover:bg-white/[0.03] cursor-pointer"
                          >
                            <span className="text-[13.5px] font-normal text-[#1F2329] dark:text-slate-100">
                              {strat.name}
                            </span>
                            <ChevronRight className="w-4 h-4 text-[#6B7280] shrink-0" />
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
              <p className="text-[12.5px] text-[#525866] dark:text-slate-300 leading-relaxed">
                {qsSelected.desc}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-[#525866] dark:text-slate-400 mb-1">
                    Underlying Market
                  </label>
                  <select
                    value={qsStep2Symbol}
                    onChange={(e) => setQsStep2Symbol(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-[4px] bg-[#F4F5F7] dark:bg-[#111319] border border-slate-200 dark:border-white/10 font-semibold outline-none"
                  >
                    {instruments.slice(0, 24).map((inst) => (
                      <option key={inst.symbol} value={inst.symbol}>
                        {inst.display_name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-[#525866] dark:text-slate-400 mb-1">
                    Initial Stake (USD)
                  </label>
                  <input
                    type="number"
                    min="0.35"
                    step="0.5"
                    value={qsStep2Stake}
                    onChange={(e) => setQsStep2Stake(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-[4px] bg-[#F4F5F7] dark:bg-[#111319] border border-slate-200 dark:border-white/10 font-mono-num font-bold outline-none"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-[#525866] dark:text-slate-400 mb-1">
                    Factor / Multiplier
                  </label>
                  <input
                    type="number"
                    min="1"
                    step="0.1"
                    value={qsStep2Factor}
                    onChange={(e) => setQsStep2Factor(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-[4px] bg-[#F4F5F7] dark:bg-[#111319] border border-slate-200 dark:border-white/10 font-mono-num font-bold outline-none"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-[#525866] dark:text-slate-400 mb-1">
                    Take Profit / Stop Loss ($)
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      min="1"
                      value={qsStep2TP}
                      onChange={(e) => setQsStep2TP(e.target.value)}
                      className="w-1/2 px-2.5 py-2.5 rounded-[4px] bg-[#F4F5F7] dark:bg-[#111319] border border-slate-200 dark:border-white/10 font-mono-num font-bold text-[#2A9D8F] outline-none"
                    />
                    <input
                      type="number"
                      min="1"
                      value={qsStep2SL}
                      onChange={(e) => setQsStep2SL(e.target.value)}
                      className="w-1/2 px-2.5 py-2.5 rounded-[4px] bg-[#F4F5F7] dark:bg-[#111319] border border-slate-200 dark:border-white/10 font-mono-num font-bold text-[#FF444F] outline-none"
                    />
                  </div>
                </div>
              </div>

              {qsSelected.category === 'Accumulators' && (
                <div>
                  <label className="block font-semibold text-[#525866] dark:text-slate-400 mb-1.5">
                    Accumulator Growth Rate
                  </label>
                  <div className="grid grid-cols-5 gap-1.5">
                    {[0.01, 0.02, 0.03, 0.04, 0.05].map((r) => (
                      <button
                        key={r}
                        type="button"
                        onClick={() => setQsStep2Growth(r)}
                        className={`py-2 rounded-[4px] font-mono-num font-bold cursor-pointer ${
                          qsStep2Growth === r
                            ? 'bg-[#FF444F] text-white'
                            : 'bg-[#F4F5F7] dark:bg-[#111319] text-[#111319] dark:text-slate-200'
                        }`}
                      >
                        {(r * 100).toFixed(0)}%
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between gap-2 pt-3 border-t border-slate-100 dark:border-white/[0.06]">
                <button
                  type="button"
                  onClick={() => setQsStep(1)}
                  className="px-4 py-2.5 rounded-[4px] border border-slate-200 dark:border-white/15 font-bold inline-flex items-center gap-1 cursor-pointer"
                >
                  <ChevronLeft className="w-3.5 h-3.5" /> Back
                </button>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => applyQuickStrategy(false)}
                    className="px-4 py-2.5 rounded-[4px] border border-slate-300 dark:border-white/20 font-bold cursor-pointer"
                  >
                    Load
                  </button>
                  <button
                    type="button"
                    onClick={() => applyQuickStrategy(true)}
                    className="px-5 py-2.5 rounded-[4px] bg-[#FF444F] hover:bg-[#E63946] text-white font-bold cursor-pointer"
                  >
                    Run
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* IN-APP DEPOSIT CASHIER SHEET */}
      <DepositSheet open={depositOpen} onClose={() => setDepositOpen(false)} />
    </div>
  );
};
