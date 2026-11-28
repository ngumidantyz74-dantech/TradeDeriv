import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  BarChart2,
  ArrowLeftRight,
  BookOpen,
  PieChart,
  Settings,
  Info,
  Crown,
  User,
  ChevronDown,
  Menu,
  X,
  Check,
  TrendingUp,
  Zap,
  Activity,
  LayoutGrid,
  Play,
  ArrowRight,
  Download,
  ExternalLink,
  RefreshCw,
  Trash2,
  Plus,
  Clock,
  ShieldCheck,
  Shuffle,
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
import type { QuantumPrediction } from '../types';

type QuantumNavTab = 'analysis' | 'transactions' | 'journal' | 'summary' | 'settings' | 'about';
type AnalysisMode = 'auto' | 'digit' | 'directional';

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

function formatElapsed(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const hrs = Math.floor(s / 3600);
  const mins = Math.floor((s % 3600) / 60);
  const rem = s % 60;
  return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(rem).padStart(2, '0')}`;
}

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
  const [autoBroadcast, setAutoBroadcast] = useState<boolean>(true);
  const [premiumActive, setPremiumActive] = useState<boolean>(true);

  const [prices, setPrices] = useState<number[]>([]);
  const [scanProgress, setScanProgress] = useState<number>(100);
  const [scanElapsedSec, setScanElapsedSec] = useState<number>(8);
  const [scanSpeedPts, setScanSpeedPts] = useState<number>(780);
  const [isScanning, setIsScanning] = useState<boolean>(false);

  const [predictions, setPredictions] = useState<QuantumPrediction[]>([]);
  const [activePrediction, setActivePrediction] = useState<QuantumPrediction | null>(null);
  const [scanTelemetry, setScanTelemetry] = useState<ScanTelemetry | null>(null);
  const [detailsOpen, setDetailsOpen] = useState<boolean>(false);
  const [analyzeSnapshot, setAnalyzeSnapshot] = useState<any>(null);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  const [profileMenuOpen, setProfileMenuOpen] = useState<boolean>(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState<boolean>(false);

  // Journal & Summary real DB states
  const [journalEntries, setJournalEntries] = useState<JournalRow[]>([]);
  const [journalLoading, setJournalLoading] = useState<boolean>(false);
  const [newJournalText, setNewJournalText] = useState<string>('');
  const [newJournalLessons, setNewJournalLessons] = useState<string>('');
  const [perfData, setPerfData] = useState<PerformanceSummary | null>(null);
  const [perfLoading, setPerfLoading] = useState<boolean>(false);
  const [executingTrade, setExecutingTrade] = useState<boolean>(false);

  const scanTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastAutoKeyRef = useRef<string>('');

  const activeInst = instruments.find((i) => i.symbol === selectedSymbol) || instruments[0];
  const decimals =
    (activeInst?.pip_size ?? 0.01) < 0.0001 ? 5 : (activeInst?.pip_size ?? 0.01) < 0.001 ? 4 : 2;

  // Subscribe to real Deriv ticks
  useEffect(() => {
    let active = true;
    fetchDerivTickHistoryDirect(selectedSymbol, tickCount, isDbLocked)
      .then((list) => {
        if (active && list.length) setPrices(list);
      })
      .catch(() => {});

    const unsub = subscribeDerivTicksDirect(
      selectedSymbol,
      (quote) => {
        if (!active) return;
        setPrices((prev) => [...prev.slice(-(tickCount - 1)), quote]);
      },
      isDbLocked
    );

    return () => {
      active = false;
      unsub();
    };
  }, [selectedSymbol, tickCount, isDbLocked]);

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
  }, [loadPredictions]);

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
    const list = prices.length > 0 ? prices : [activeInst?.price ?? 1000];
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

    return {
      latestPrice,
      lastDigit: digits[digits.length - 1] ?? 0,
      sampleSize: digits.length,
      dist,
      differsPct,
      overPct,
      underPct,
      evenPct,
      oddPct,
      trend,
      momentum,
      volatility,
      pattern,
    };
  }, [prices, activeInst?.price, decimals, selectedDigit]);

  const executeQuantumScan = useCallback(
    async (digitToScan: number, silent = false) => {
      if (scanTimerRef.current) {
        clearInterval(scanTimerRef.current);
        scanTimerRef.current = null;
      }

      setIsScanning(true);
      setScanProgress(18);
      const startedAt = Date.now();

      scanTimerRef.current = setInterval(() => {
        const elapsed = (Date.now() - startedAt) / 1000;
        setScanElapsedSec(Math.max(1, Math.round(elapsed)));
        setScanProgress((prev) => (prev < 92 ? Math.min(92, prev + 11) : prev));
        setScanSpeedPts(720 + Math.floor(Math.random() * 140));
      }, 140);

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

        if (scanTimerRef.current) {
          clearInterval(scanTimerRef.current);
          scanTimerRef.current = null;
        }
        setScanProgress(100);
        setScanElapsedSec(Math.max(1, Math.round((Date.now() - startedAt) / 1000) || 2));

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
              `Digit ${digitToScan} scanned: ${res.prediction.contract_type} (${Number(res.prediction.probability).toFixed(2)}%) · Ready for DBOT`,
              'success'
            );
          }
        }
        if (res.telemetry) {
          setScanTelemetry(res.telemetry);
        }
      } catch (err) {
        if (scanTimerRef.current) {
          clearInterval(scanTimerRef.current);
          scanTimerRef.current = null;
        }
        setScanProgress(100);
        if (!silent) {
          showToast(sanitizeUiError(err, 'Quantum scan failed.'), 'error');
        }
      } finally {
        setIsScanning(false);
      }
    },
    [selectedSymbol, quantumStake, analysisMode, autoBroadcast, broadcastSignalToDbot, showToast]
  );

  // Trigger an automatic scan on mount and whenever the selected instrument or analysisMode changes
  useEffect(() => {
    const key = `${selectedSymbol}:${analysisMode}`;
    if (lastAutoKeyRef.current === key || prices.length < 5) return;
    lastAutoKeyRef.current = key;
    executeQuantumScan(selectedDigit, true);
  }, [selectedSymbol, analysisMode, prices.length, selectedDigit, executeQuantumScan]);

  useEffect(() => {
    return () => {
      if (scanTimerRef.current) clearInterval(scanTimerRef.current);
    };
  }, []);

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
        throw new Error(body?.error || 'Prediction expired — run Scan Next Digit');
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

  const handleQuickExecute = async (pred: QuantumPrediction) => {
    setExecutingTrade(true);
    try {
      await apiFetch('/api/orders', {
        method: 'POST',
        body: JSON.stringify({
          symbol: pred.instrument,
          side: pred.contract_type,
          contractType: pred.contract_type,
          stake: Number(pred.stake || quantumStake || 1),
          barrier: pred.barrier,
          duration: Number(pred.duration || 1),
          durationUnit: pred.duration_unit || 't',
          strategyKey: 'quantum_minimal_loss',
          accountMode,
          executionMode: activeConnectedAccount && !isDbLocked ? 'deriv' : 'virtual',
          connectedAccountId: activeConnectedAccount?.id || null,
        }),
      });
      await Promise.all([refreshOrders(), refreshAll()]);
      showToast(`Executed ${pred.contract_type} ($${pred.stake}) on ${pred.instrument}`, 'success');
    } catch (err) {
      showToast(sanitizeUiError(err, 'Execution failed'), 'error');
    } finally {
      setExecutingTrade(false);
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
          timeframe: '1t',
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

  // Active signal summary values
  const displayedPred = activePrediction;
  const remainingSecs = displayedPred
    ? Math.max(0, Math.floor((new Date(displayedPred.expires_at).getTime() - nowMs) / 1000))
    : 0;
  const isPredValid = Boolean(displayedPred && displayedPred.validity_status === 'VALID' && remainingSecs > 0);

  const displayedPct = displayedPred
    ? Number(displayedPred.probability).toFixed(2)
    : liveAnalytics.differsPct.toFixed(2);
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
                  ? 'RISE'
                  : displayedPred.contract_type === 'PUT'
                    ? 'FALL'
                    : displayedPred.contract_type
    : liveAnalytics.trend === 'Downtrend'
      ? 'FALL'
      : 'RISE';
  const confidenceLabel =
    Number(displayedPct) >= 85 ? 'High Confidence' : Number(displayedPct) >= 65 ? 'Moderate Confidence' : 'Balanced Signal';

  const trendValue = scanTelemetry?.trend || liveAnalytics.trend;
  const momentumValue = scanTelemetry?.momentum || liveAnalytics.momentum;
  const volatilityValue = scanTelemetry?.volatility || liveAnalytics.volatility;
  const patternValue = scanTelemetry?.pattern || liveAnalytics.pattern;
  const distRows = scanTelemetry?.digitDistribution || liveAnalytics.dist;
  const displayDataPoints = (scanTelemetry?.dataPoints || liveAnalytics.sampleSize) * 62;

  // SVG circular gauge geometry
  const ringRadius = 50;
  const ringCircumference = 2 * Math.PI * ringRadius;
  const gaugePct = Math.max(8, Math.min(100, isScanning ? scanProgress : Math.round(Number(displayedPct))));
  const strokeOffset = ringCircumference * (1 - gaugePct / 100);

  const navItems: Array<{ id: QuantumNavTab; label: string; icon: React.ComponentType<any> }> = [
    { id: 'analysis', label: 'Analysis', icon: BarChart2 },
    { id: 'transactions', label: 'Transactions', icon: ArrowLeftRight },
    { id: 'journal', label: 'Journal', icon: BookOpen },
    { id: 'summary', label: 'Summary', icon: PieChart },
    { id: 'settings', label: 'Settings', icon: Settings },
    { id: 'about', label: 'About', icon: Info },
  ];

  const recentOrders = useMemo(
    () =>
      orders
        .filter((o) => (o.account_mode || (o.execution_mode === 'deriv' ? 'real' : 'demo')) === accountMode)
        .slice(0, 30),
    [orders, accountMode]
  );

  return (
    <div className="min-h-screen bg-[#060911] text-white relative overflow-x-hidden flex flex-col">
      {/* Ambient crimson mesh corner accents matching reference visual */}
      <div className="pointer-events-none fixed -top-28 -left-24 w-[360px] h-[360px] rounded-full bg-[#FF1F3D]/18 blur-[125px] z-0" />
      <div className="pointer-events-none fixed -bottom-28 -right-20 w-[380px] h-[380px] rounded-full bg-[#FF1F3D]/16 blur-[130px] z-0" />

      {/* TOP HEADER */}
      <header className="relative z-30 border-b border-[#182135] bg-[#070B15]/90 backdrop-blur-md px-4 sm:px-7 py-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          {/* Ascending 3 crimson rounded bars logo */}
          <div className="flex items-end gap-[4px] h-7 shrink-0" aria-hidden="true">
            <span className="w-[5px] h-3 rounded-full bg-[#FF243B]" />
            <span className="w-[5px] h-5 rounded-full bg-[#FF243B]" />
            <span className="w-[5px] h-7 rounded-full bg-[#FF243B]" />
          </div>
          <div className="min-w-0">
            <h1 className="font-display text-lg sm:text-[22px] font-bold tracking-tight leading-none truncate">
              <span className="text-white">Quantum </span>
              <span className="text-[#FF243B]">Analyser</span>
            </h1>
            <p className="text-[11px] sm:text-xs text-slate-400 mt-1 truncate">
              Scan • Analyse • Predict • Trade Smarter
            </p>
          </div>
        </div>

        {/* Desktop Profile + Account Controls */}
        <div className="hidden lg:flex items-center gap-3 relative">
          <div className="px-3 py-1.5 rounded-full bg-[#0E1526] border border-[#1E293B] text-xs flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[#10B981] animate-pulse" />
            <span className={accountMode === 'real' ? 'text-[#10B981] font-semibold' : 'text-amber-400 font-semibold'}>
              {accountMode === 'real' ? 'Real' : 'Demo'}
            </span>
            <span className="font-mono-num text-slate-200 font-semibold">
              {formatMoney(optionsBal)}
            </span>
          </div>

          <button
            type="button"
            onClick={() => setProfileMenuOpen((v) => !v)}
            className="flex items-center gap-1.5 pl-1 pr-2 py-1 rounded-full hover:bg-[#11192D] transition-colors cursor-pointer"
          >
            <span className="w-9 h-9 rounded-full bg-[#161F33] border border-[#2B3752] flex items-center justify-center text-slate-200">
              <User className="w-4 h-4" />
            </span>
            <ChevronDown className="w-4 h-4 text-slate-400" />
          </button>

          {profileMenuOpen && (
            <div className="absolute right-0 top-12 w-64 rounded-2xl bg-[#0B111E] border border-[#1E293B] shadow-2xl p-3 space-y-2 z-50">
              <div className="px-2 py-1.5 border-b border-[#182135]">
                <p className="text-xs font-bold text-white truncate">{user?.full_name || 'Trader'}</p>
                <p className="text-[11px] text-slate-400 truncate">{user?.email}</p>
              </div>
              <div className="flex items-center gap-1.5 px-1">
                <button
                  type="button"
                  onClick={() => setAccountMode('demo')}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${
                    accountMode === 'demo' ? 'bg-[#FF243B] text-white' : 'bg-[#121A2D] text-slate-300'
                  }`}
                >
                  Demo
                </button>
                <button
                  type="button"
                  onClick={() => setAccountMode('real')}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${
                    accountMode === 'real' ? 'bg-[#10B981] text-white' : 'bg-[#121A2D] text-slate-300'
                  }`}
                >
                  Real
                </button>
              </div>
              <a
                href="/?tab=bot-builder"
                target="_blank"
                rel="noopener noreferrer"
                className="w-full px-3 py-2 rounded-xl bg-[#121A2D] hover:bg-[#18223A] text-xs font-semibold text-white flex items-center justify-between"
              >
                <span>Open DBOT Workspace</span>
                <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
              </a>
              <button
                type="button"
                onClick={() => {
                  setProfileMenuOpen(false);
                  logout();
                }}
                className="w-full px-3 py-2 rounded-xl bg-[#FF243B]/15 hover:bg-[#FF243B]/25 text-xs font-semibold text-[#FF6B7B] text-left cursor-pointer"
              >
                Log out
              </button>
            </div>
          )}
        </div>

        {/* Mobile Hamburger */}
        <button
          type="button"
          onClick={() => setMobileMenuOpen((v) => !v)}
          aria-label="Toggle menu"
          className="lg:hidden p-2 rounded-xl bg-[#0E1526] border border-[#1E293B] text-slate-200 cursor-pointer"
        >
          {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </header>

      {/* Mobile Slide-Over Menu */}
      {mobileMenuOpen && (
        <div className="lg:hidden fixed inset-0 z-50 bg-black/65" onClick={() => setMobileMenuOpen(false)}>
          <div
            onClick={(e) => e.stopPropagation()}
            className="ml-auto w-72 h-full bg-[#090E1A] border-l border-[#1B2438] p-5 flex flex-col justify-between"
          >
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="font-display font-bold text-base">
                  Quantum <span className="text-[#FF243B]">Analyser</span>
                </span>
                <button type="button" onClick={() => setMobileMenuOpen(false)} className="p-1 text-slate-400">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-3 rounded-xl bg-[#0F172A] border border-[#1E293B]">
                <p className="text-xs font-bold text-white truncate">{user?.full_name || 'Trader'}</p>
                <p className="text-[11px] text-slate-400 truncate">{user?.email}</p>
                <div className="flex gap-1.5 mt-2.5">
                  <button
                    type="button"
                    onClick={() => setAccountMode('demo')}
                    className={`flex-1 py-1 rounded-lg text-[11px] font-bold ${
                      accountMode === 'demo' ? 'bg-[#FF243B] text-white' : 'bg-[#162036] text-slate-300'
                    }`}
                  >
                    Demo
                  </button>
                  <button
                    type="button"
                    onClick={() => setAccountMode('real')}
                    className={`flex-1 py-1 rounded-lg text-[11px] font-bold ${
                      accountMode === 'real' ? 'bg-[#10B981] text-white' : 'bg-[#162036] text-slate-300'
                    }`}
                  >
                    Real
                  </button>
                </div>
              </div>
              <div className="space-y-1">
                {navItems.map((it) => {
                  const Icon = it.icon;
                  return (
                    <button
                      key={it.id}
                      type="button"
                      onClick={() => {
                        setNavTab(it.id);
                        setMobileMenuOpen(false);
                      }}
                      className={`w-full px-3 py-2.5 rounded-xl flex items-center gap-3 text-sm font-medium ${
                        navTab === it.id
                          ? 'bg-gradient-to-r from-[#E11D48] to-[#FF243B] text-white'
                          : 'text-slate-300 hover:bg-[#11192D]'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                      <span>{it.label}</span>
                    </button>
                  );
                })}
              </div>
              <a
                href="/?tab=bot-builder"
                target="_blank"
                rel="noopener noreferrer"
                className="w-full px-3 py-2.5 rounded-xl bg-[#121A2D] border border-[#1E293B] text-xs font-semibold text-white flex items-center justify-between"
              >
                <span>Open DBOT Workspace</span>
                <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
              </a>
            </div>
            <button
              type="button"
              onClick={logout}
              className="w-full py-2.5 rounded-xl bg-[#FF243B]/15 text-[#FF6B7B] text-xs font-bold cursor-pointer"
            >
              Log out
            </button>
          </div>
        </div>
      )}

      {/* BODY SHELL: LEFT SIDEBAR (DESKTOP) + MAIN CONTENT */}
      <div className="relative z-10 flex-1 flex max-w-[1440px] w-full mx-auto pb-20 lg:pb-6">
        {/* Desktop Sidebar matching exact screenshot */}
        <aside className="hidden lg:flex flex-col justify-between w-[205px] shrink-0 border-r border-[#182135] px-3.5 py-6">
          <nav className="space-y-1.5">
            {navItems.map((it) => {
              const Icon = it.icon;
              const active = navTab === it.id;
              return (
                <button
                  key={it.id}
                  type="button"
                  onClick={() => setNavTab(it.id)}
                  className={`w-full px-4 py-3 rounded-xl flex items-center gap-3 text-[13.5px] font-medium transition-all cursor-pointer ${
                    active
                      ? 'bg-gradient-to-r from-[#E11D48] to-[#FF243B] text-white shadow-[0_6px_20px_rgba(255,36,59,0.3)]'
                      : 'text-slate-300 hover:bg-[#0E1526] hover:text-white'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span>{it.label}</span>
                </button>
              );
            })}
          </nav>

          {/* Bottom Premium Mode Card */}
          <div className="rounded-2xl bg-[#0A101E] border border-[#1B2438] p-4 flex flex-col items-center text-center gap-2.5">
            <Crown className="w-5 h-5 text-white" />
            <div>
              <p className="text-xs font-semibold text-white leading-tight">Premium</p>
              <p className="text-xs font-semibold text-white leading-tight">Mode</p>
            </div>
            <button
              type="button"
              onClick={() => {
                setPremiumActive((v) => !v);
                showToast(
                  !premiumActive
                    ? 'Quantum Premium HMAC Engine Active'
                    : 'Switched to Standard Scan Interval',
                  'info'
                );
              }}
              className={`px-5 py-1 rounded-full text-[11px] font-bold cursor-pointer transition-colors ${
                premiumActive
                  ? 'bg-[#FF243B] text-white shadow-sm shadow-[#FF243B]/40'
                  : 'bg-[#1E293B] text-slate-300'
              }`}
            >
              {premiumActive ? 'Active' : 'Standard'}
            </button>
          </div>
        </aside>

        {/* MAIN STAGE */}
        <main className="flex-1 p-4 sm:p-6 lg:p-7 min-w-0 space-y-4">
          {navTab === 'analysis' && (
            <>
              {/* TOP 2-COLUMN GRID: Select Digit + Scanning Progress */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                {/* CARD 1: Select Digit to Analyse */}
                <section className="lg:col-span-5 rounded-2xl bg-[#0B111E]/95 border border-[#1B2438] p-4 sm:p-5 flex flex-col justify-between gap-4 shadow-xl">
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <div className="inline-block">
                        <h2 className="text-[15px] font-semibold text-white">Select Digit to Analyse</h2>
                        <div className="h-[2.5px] w-16 bg-[#FF243B] rounded-full mt-1.5" />
                      </div>
                      <button
                        type="button"
                        disabled={isScanning}
                        onClick={handleRandomDigitScan}
                        className="px-2.5 py-1 rounded-lg bg-[#121A2D] hover:bg-[#19243D] border border-[#24304B] text-[11px] font-semibold text-slate-200 inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
                      >
                        <Shuffle className="w-3 h-3 text-[#FF4D64]" />
                        <span>Random</span>
                      </button>
                    </div>

                    <div className="grid grid-cols-5 gap-2.5 mt-4">
                      {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => {
                        const isSel = selectedDigit === d;
                        return (
                          <button
                            key={d}
                            type="button"
                            onClick={() => handleDigitSelect(d)}
                            className={`h-11 sm:h-12 rounded-xl font-display text-base font-bold transition-all cursor-pointer border ${
                              isSel
                                ? 'bg-[#FF1F3D] border-[#FF4D64] text-white shadow-[0_0_20px_rgba(255,31,61,0.45)]'
                                : 'bg-[#0E1525] border-[#1E293B] text-slate-200 hover:border-[#334155] hover:bg-[#141D32]'
                            }`}
                          >
                            {d}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Subtle compact real-feed footer bar */}
                  <div className="pt-2.5 border-t border-[#182135] flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-400">
                    <div className="flex items-center gap-2 min-w-0">
                      <select
                        value={selectedSymbol}
                        onChange={(e) => setSelectedSymbol(e.target.value)}
                        aria-label="Select instrument"
                        className="bg-[#0F172A] border border-[#1E293B] rounded-lg px-2 py-1 text-[11px] text-white font-semibold outline-none max-w-[165px]"
                      >
                        {instruments.map((inst) => (
                          <option key={inst.symbol} value={inst.symbol}>
                            {inst.display_name}
                          </option>
                        ))}
                      </select>
                      <span className="font-mono-num text-white font-bold">
                        {liveAnalytics.latestPrice.toFixed(decimals)}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span>Last:</span>
                      <span className="px-1.5 py-0.5 rounded bg-[#FF243B]/20 text-[#FF6B7B] font-mono-num font-bold">
                        {liveAnalytics.lastDigit}
                      </span>
                    </div>
                  </div>
                </section>

                {/* CARD 2: Scanning Digit Progress */}
                <section className="lg:col-span-7 rounded-2xl bg-[#0B111E]/95 border border-[#1B2438] p-4 sm:p-5 flex flex-col justify-between gap-4 shadow-xl">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <h2 className="text-[15px] font-semibold text-white">
                        {isScanning ? `Scanning Digit ${selectedDigit}...` : `Digit ${selectedDigit} Live Scan`}
                      </h2>
                      <div className="h-[2.5px] w-16 bg-[#FF243B] rounded-full mt-1.5" />
                    </div>
                    {isPredValid && (
                      <span className="px-2.5 py-1 rounded-full bg-[#10B981]/15 border border-[#10B981]/35 text-[#34D399] text-[11px] font-mono-num font-semibold inline-flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {Math.floor(remainingSecs / 60)}:{String(remainingSecs % 60).padStart(2, '0')}
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-12 items-center gap-4">
                    {/* Left Circular Gauge */}
                    <div className="sm:col-span-5 flex items-center justify-center">
                      <div className="relative w-[132px] h-[132px] flex items-center justify-center">
                        <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90">
                          <circle
                            cx="60"
                            cy="60"
                            r={ringRadius}
                            fill="none"
                            stroke="#1B2438"
                            strokeWidth="10"
                          />
                          <circle
                            cx="60"
                            cy="60"
                            r={ringRadius}
                            fill="none"
                            stroke="#FF1F3D"
                            strokeWidth="10"
                            strokeLinecap="round"
                            strokeDasharray={ringCircumference}
                            strokeDashoffset={strokeOffset}
                            className="transition-all duration-300"
                          />
                        </svg>
                        <span className="absolute font-display text-4xl font-bold text-white">
                          {selectedDigit}
                        </span>
                      </div>
                    </div>

                    {/* Right Progress % & Stats Table */}
                    <div className="sm:col-span-7 space-y-3">
                      <div className="text-center sm:text-left">
                        <div className="font-display text-3xl sm:text-4xl font-bold leading-none">
                          {isScanning ? `${scanProgress}%` : `${Math.round(Number(displayedPct))}%`}
                        </div>
                        <p className="text-xs text-slate-300 mt-1">Scanning Progress</p>
                      </div>

                      <div className="w-full h-2.5 rounded-full bg-[#192338] overflow-hidden">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-[#E11D48] to-[#FF3B5C] transition-all duration-300"
                          style={{ width: `${isScanning ? scanProgress : 100}%` }}
                        />
                      </div>

                      <div className="space-y-1.5 text-xs pt-1">
                        <div className="flex items-center justify-between text-slate-300">
                          <span className="inline-flex items-center gap-2 text-slate-400">
                            <span className="w-2 h-2 rounded-full bg-[#38BDF8]" />
                            Data Points
                          </span>
                          <span className="font-mono-num font-bold text-white">
                            {displayDataPoints.toLocaleString()}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-slate-300">
                          <span className="inline-flex items-center gap-2 text-slate-400">
                            <span className="w-2 h-2 rounded-full bg-[#38BDF8]" />
                            Elapsed Time
                          </span>
                          <span className="font-mono-num font-bold text-white">
                            {formatElapsed(scanElapsedSec)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-slate-300">
                          <span className="inline-flex items-center gap-2 text-slate-400">
                            <span className="w-2 h-2 rounded-full bg-[#38BDF8]" />
                            Scan Speed
                          </span>
                          <span className="font-mono-num font-bold text-white">
                            {scanSpeedPts} pts/sec
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </section>
              </div>

              {/* EMERALD ANALYSIS RESULT BANNER */}
              <section className="rounded-2xl bg-gradient-to-r from-[#042A1B] via-[#063A24] to-[#042316] border border-[#10B981]/50 px-5 py-4 sm:px-7 sm:py-5 shadow-[0_0_30px_rgba(16,185,129,0.12)]">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <span className="w-10 h-10 rounded-full bg-[#22C55E] text-[#052E16] flex items-center justify-center shrink-0 shadow-md">
                      <Check className="w-6 h-6" strokeWidth={3} />
                    </span>
                    <div>
                      <p className="text-xs sm:text-sm font-medium text-emerald-100">
                        Analysis Result · {activeInst?.display_name || selectedSymbol}
                      </p>
                      <p className="font-display text-3xl sm:text-[42px] font-bold leading-none text-white mt-1 font-mono-num">
                        {displayedPct}%
                      </p>
                    </div>
                  </div>

                  <div className="hidden sm:block w-px h-14 bg-emerald-400/25" />

                  <div className="flex flex-col sm:items-end gap-2">
                    <div className="flex items-center gap-2.5">
                      <span className="text-[#22C55E] text-2xl leading-none" aria-hidden="true">
                        {['FALL', 'PUT', 'UNDER', 'ODD'].some((k) => displayedContract.includes(k)) ? '▼' : '▲'}
                      </span>
                      <span className="font-display text-2xl sm:text-[32px] font-bold tracking-tight text-[#22C55E]">
                        {displayedContract}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs text-slate-200 font-medium">{confidenceLabel}</span>
                      {displayedPred && (
                        <>
                          <button
                            type="button"
                            onClick={() => handleSyncToDbot(displayedPred)}
                            className="px-2.5 py-1 rounded-lg bg-[#10B981]/20 hover:bg-[#10B981]/30 border border-[#10B981]/40 text-[#6EE7B7] text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer"
                          >
                            <ExternalLink className="w-3 h-3" />
                            Sync DBOT
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDownloadXml(displayedPred)}
                            className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/15 border border-white/15 text-white text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer"
                          >
                            <Download className="w-3 h-3" />
                            XML
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </section>

              {/* 4 MARKET REGIME CARDS: Trend | Momentum | Volatility | Pattern */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                <div className="rounded-2xl bg-[#0B111E] border border-[#1B2438] p-4 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-[#10B981]/10 flex items-center justify-center text-[#22C55E] shrink-0">
                    <TrendingUp className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-slate-400">Trend</p>
                    <p className="text-sm sm:text-base font-bold text-[#22C55E] truncate">{trendValue}</p>
                  </div>
                </div>

                <div className="rounded-2xl bg-[#0B111E] border border-[#1B2438] p-4 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-[#38BDF8]/10 flex items-center justify-center text-[#38BDF8] shrink-0">
                    <Zap className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-slate-400">Momentum</p>
                    <p className="text-sm sm:text-base font-bold text-[#38BDF8] truncate">{momentumValue}</p>
                  </div>
                </div>

                <div className="rounded-2xl bg-[#0B111E] border border-[#1B2438] p-4 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-[#C084FC]/10 flex items-center justify-center text-[#C084FC] shrink-0">
                    <Activity className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-slate-400">Volatility</p>
                    <p className="text-sm sm:text-base font-bold text-[#C084FC] truncate">{volatilityValue}</p>
                  </div>
                </div>

                <div className="rounded-2xl bg-[#0B111E] border border-[#1B2438] p-4 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-[#10B981]/10 flex items-center justify-center text-[#22C55E] shrink-0">
                    <LayoutGrid className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-slate-400">Pattern</p>
                    <p className="text-sm sm:text-base font-bold text-[#22C55E] truncate">{patternValue}</p>
                  </div>
                </div>
              </div>

              {/* BOTTOM 2 CTAs */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 pt-1">
                <button
                  type="button"
                  disabled={isScanning}
                  onClick={handleScanNextDigit}
                  className="h-12 sm:h-[52px] rounded-xl bg-gradient-to-r from-[#E11D48] to-[#FF243B] hover:brightness-110 text-white font-semibold text-sm sm:text-[15px] inline-flex items-center justify-center gap-2.5 shadow-[0_8px_24px_rgba(255,36,59,0.3)] cursor-pointer disabled:opacity-60"
                >
                  <Play className="w-4 h-4 fill-white" />
                  <span>{isScanning ? 'Scanning Live Ticks...' : 'Scan Next Digit'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setDetailsOpen(true)}
                  className="h-12 sm:h-[52px] rounded-xl bg-[#0B111E] hover:bg-[#111A2E] border border-[#1B2438] text-white font-semibold text-sm sm:text-[15px] inline-flex items-center justify-center gap-2.5 cursor-pointer"
                >
                  <BarChart2 className="w-4 h-4 text-slate-300" />
                  <span>View Analysis Details</span>
                  <ArrowRight className="w-4 h-4 text-slate-300" />
                </button>
              </div>
            </>
          )}

          {/* TRANSACTIONS VIEW */}
          {navTab === 'transactions' && (
            <section className="rounded-2xl bg-[#0B111E] border border-[#1B2438] p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-bold text-white">Live Transactions ({accountMode.toUpperCase()})</h2>
                  <p className="text-xs text-slate-400">Real-time orders & DBOT settlements synced with your account</p>
                </div>
                <button
                  type="button"
                  onClick={() => refreshOrders()}
                  className="px-3 py-1.5 rounded-xl bg-[#121A2D] hover:bg-[#1B253E] text-xs font-semibold text-white inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" /> Refresh
                </button>
              </div>

              {recentOrders.length === 0 ? (
                <div className="py-12 text-center text-xs text-slate-400">
                  No transactions recorded on your {accountMode} account yet. Run a scan or launch DBOT to trade.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-[#1B2438] text-slate-400">
                        <th className="py-2.5 pr-3">Symbol</th>
                        <th className="py-2.5 pr-3">Contract</th>
                        <th className="py-2.5 pr-3">Stake</th>
                        <th className="py-2.5 pr-3">Entry / Exit</th>
                        <th className="py-2.5 pr-3">Status</th>
                        <th className="py-2.5 text-right">Profit / Loss</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#151E30]">
                      {recentOrders.map((o) => {
                        const pnl = Number(o.pnl || 0);
                        return (
                          <tr key={o.id} className="hover:bg-[#10182A]">
                            <td className="py-2.5 pr-3 font-semibold text-white">
                              <div className="inline-flex items-center gap-2">
                                <BotInstrumentIcon symbol={o.symbol} size="sm" />
                                <span>{o.symbol}</span>
                              </div>
                            </td>
                            <td className="py-2.5 pr-3 text-slate-300">
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
                            <td className="py-2.5 pr-3 font-mono-num">${Number(o.stake).toFixed(2)}</td>
                            <td className="py-2.5 pr-3 font-mono-num text-slate-400">
                              {Number(o.entry_price).toFixed(2)} / {Number(o.exit_price ?? o.current_price ?? o.entry_price).toFixed(2)}
                            </td>
                            <td className="py-2.5 pr-3">
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                  o.status === 'OPEN'
                                    ? 'bg-amber-500/15 text-amber-300'
                                    : 'bg-slate-700/40 text-slate-300'
                                }`}
                              >
                                {o.status}
                              </span>
                            </td>
                            <td
                              className={`py-2.5 text-right font-mono-num font-bold ${
                                pnl > 0 ? 'text-[#22C55E]' : pnl < 0 ? 'text-[#FF4D64]' : 'text-slate-300'
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
                className="rounded-2xl bg-[#0B111E] border border-[#1B2438] p-5 space-y-3"
              >
                <div className="flex items-center justify-between">
                  <h2 className="text-base font-bold text-white">Quantum Trade Journal</h2>
                  <span className="text-[11px] text-slate-400">{selectedSymbol}</span>
                </div>
                <input
                  type="text"
                  value={newJournalText}
                  onChange={(e) => setNewJournalText(e.target.value)}
                  placeholder="Record setup rationale (e.g. Digit 7 frequency dipped to 5%, synced to DBOT)..."
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#070B14] border border-[#1E293B] text-xs text-white outline-none focus:border-[#FF243B]"
                />
                <div className="flex flex-col sm:flex-row gap-2.5">
                  <input
                    type="text"
                    value={newJournalLessons}
                    onChange={(e) => setNewJournalLessons(e.target.value)}
                    placeholder="Key takeaway / risk discipline note (optional)"
                    className="flex-1 px-3.5 py-2 rounded-xl bg-[#070B14] border border-[#1E293B] text-xs text-white outline-none focus:border-[#FF243B]"
                  />
                  <button
                    type="submit"
                    className="px-4 py-2 rounded-xl bg-gradient-to-r from-[#E11D48] to-[#FF243B] text-white text-xs font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add Note
                  </button>
                </div>
              </form>

              <section className="rounded-2xl bg-[#0B111E] border border-[#1B2438] p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-white">Recorded Entries</h3>
                  {journalLoading && <span className="text-xs text-slate-400">Syncing...</span>}
                </div>
                {journalEntries.length === 0 ? (
                  <p className="text-xs text-slate-400 py-6 text-center">No journal notes saved yet.</p>
                ) : (
                  <div className="space-y-2.5">
                    {journalEntries.map((entry) => (
                      <div
                        key={entry.id}
                        className="rounded-xl bg-[#070B14] border border-[#1B2438] p-3.5 flex items-start justify-between gap-3"
                      >
                        <div className="space-y-1 min-w-0">
                          <div className="flex items-center gap-2 text-xs">
                            <span className="font-bold text-white">{entry.symbol}</span>
                            <span className="px-1.5 py-0.5 rounded bg-[#FF243B]/20 text-[#FF6B7B] text-[10px] font-bold">
                              {entry.side}
                            </span>
                            <span className="text-slate-500">
                              {new Date(entry.created_at).toLocaleString()}
                            </span>
                          </div>
                          {entry.rationale && <p className="text-xs text-slate-200">{entry.rationale}</p>}
                          {entry.lessons && (
                            <p className="text-[11px] text-emerald-300/90">Lesson: {entry.lessons}</p>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => handleDeleteJournalEntry(entry.id)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-[#FF4D64] hover:bg-white/5 cursor-pointer shrink-0"
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
                <div className="rounded-2xl bg-[#0B111E] border border-[#1B2438] p-4">
                  <p className="text-xs text-slate-400">Net Profit / Loss</p>
                  <p
                    className={`font-display text-2xl font-bold mt-1 font-mono-num ${
                      (perfData?.combined?.netPnlUsd ?? 0) >= 0 ? 'text-[#22C55E]' : 'text-[#FF4D64]'
                    }`}
                  >
                    {(perfData?.combined?.netPnlUsd ?? 0) >= 0 ? '+' : ''}
                    ${Number(perfData?.combined?.netPnlUsd ?? 0).toFixed(2)}
                  </p>
                </div>
                <div className="rounded-2xl bg-[#0B111E] border border-[#1B2438] p-4">
                  <p className="text-xs text-slate-400">Win Rate</p>
                  <p className="font-display text-2xl font-bold text-white mt-1 font-mono-num">
                    {Number(perfData?.combined?.winRatePct ?? 0).toFixed(1)}%
                  </p>
                </div>
                <div className="rounded-2xl bg-[#0B111E] border border-[#1B2438] p-4">
                  <p className="text-xs text-slate-400">Closed Trades</p>
                  <p className="font-display text-2xl font-bold text-[#38BDF8] mt-1 font-mono-num">
                    {perfData?.combined?.totalTrades ?? 0}
                  </p>
                </div>
                <div className="rounded-2xl bg-[#0B111E] border border-[#1B2438] p-4">
                  <p className="text-xs text-slate-400">Profit Factor</p>
                  <p className="font-display text-2xl font-bold text-[#C084FC] mt-1 font-mono-num">
                    {Number(perfData?.combined?.profitFactor ?? 0).toFixed(2)}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="rounded-2xl bg-[#0B111E] border border-[#1B2438] p-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-white">Real vs Demo Split</h3>
                    {perfLoading && <span className="text-xs text-slate-400">Loading...</span>}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-xl bg-[#070B14] border border-[#1B2438] p-3.5">
                      <p className="text-xs text-[#10B981] font-semibold">Real Account</p>
                      <p className="font-mono-num text-lg font-bold text-white mt-1">
                        ${Number(perfData?.real?.netPnlUsd ?? 0).toFixed(2)}
                      </p>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        {perfData?.real?.totalTrades ?? 0} trades · {perfData?.real?.winRatePct ?? 0}% win
                      </p>
                    </div>
                    <div className="rounded-xl bg-[#070B14] border border-[#1B2438] p-3.5">
                      <p className="text-xs text-amber-400 font-semibold">Demo Account</p>
                      <p className="font-mono-num text-lg font-bold text-white mt-1">
                        ${Number(perfData?.demo?.netPnlUsd ?? 0).toFixed(2)}
                      </p>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        {perfData?.demo?.totalTrades ?? 0} trades · {perfData?.demo?.winRatePct ?? 0}% win
                      </p>
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl bg-[#0B111E] border border-[#1B2438] p-5 space-y-3">
                  <h3 className="text-sm font-bold text-white">Recent Quantum Signals ({predictions.length})</h3>
                  <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                    {predictions.slice(0, 6).map((p) => {
                      const rem = Math.max(
                        0,
                        Math.floor((new Date(p.expires_at).getTime() - nowMs) / 1000)
                      );
                      return (
                        <div
                          key={p.prediction_id}
                          className="rounded-xl bg-[#070B14] border border-[#1B2438] px-3 py-2 flex items-center justify-between gap-2 text-xs"
                        >
                          <div className="min-w-0">
                            <span className="font-bold text-white">{p.instrument}</span>{' '}
                            <span className="text-[#22C55E] font-semibold">{p.contract_type}</span>
                            <p className="text-[11px] text-slate-400 truncate">{p.predicted_condition}</p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="font-mono-num font-bold text-white">
                              {Number(p.probability).toFixed(1)}%
                            </span>
                            {rem > 0 && p.validity_status === 'VALID' ? (
                              <button
                                type="button"
                                onClick={() => handleSyncToDbot(p)}
                                className="px-2 py-1 rounded bg-[#FF243B] text-white text-[10px] font-bold cursor-pointer"
                              >
                                DBOT
                              </button>
                            ) : (
                              <span className="text-[10px] text-slate-500">Expired</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* SETTINGS VIEW */}
          {navTab === 'settings' && (
            <section className="rounded-2xl bg-[#0B111E] border border-[#1B2438] p-5 sm:p-6 space-y-5 max-w-3xl">
              <div>
                <h2 className="text-base font-bold text-white">Analyser &amp; DBOT Bridge Settings</h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Configure instrument sampling, stake sizing, and live DBOT synchronization.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div>
                  <label className="block text-slate-400 font-semibold mb-1.5">Active Instrument</label>
                  <select
                    value={selectedSymbol}
                    onChange={(e) => setSelectedSymbol(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl bg-[#070B14] border border-[#1E293B] text-white font-semibold outline-none"
                  >
                    {instruments.map((inst) => (
                      <option key={inst.symbol} value={inst.symbol}>
                        {inst.display_name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-slate-400 font-semibold mb-1.5">Signal Stake (USD)</label>
                  <input
                    type="number"
                    min="0.5"
                    step="0.5"
                    value={quantumStake}
                    onChange={(e) => setQuantumStake(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl bg-[#070B14] border border-[#1E293B] text-white font-mono-num font-bold outline-none"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 font-semibold mb-1.5">Tick History Sample</label>
                  <select
                    value={tickCount}
                    onChange={(e) => setTickCount(Number(e.target.value))}
                    className="w-full px-3 py-2.5 rounded-xl bg-[#070B14] border border-[#1E293B] text-white font-semibold outline-none"
                  >
                    <option value={50}>50 Ticks (Fast)</option>
                    <option value={100}>100 Ticks (Standard)</option>
                    <option value={250}>250 Ticks (Deep)</option>
                    <option value={500}>500 Ticks (Institutional)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-400 font-semibold mb-1.5">Prediction Bias Mode</label>
                  <select
                    value={analysisMode}
                    onChange={(e) => setAnalysisMode(e.target.value as AnalysisMode)}
                    className="w-full px-3 py-2.5 rounded-xl bg-[#070B14] border border-[#1E293B] text-white font-semibold outline-none"
                  >
                    <option value="auto">Auto Minimal-Loss (Recommended)</option>
                    <option value="digit">Digit Contracts (Differs / Over / Under)</option>
                    <option value="directional">Directional Momentum (Rise / Fall)</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-between p-3.5 rounded-xl bg-[#070B14] border border-[#1E293B]">
                <div>
                  <p className="text-xs font-bold text-white">Auto-Broadcast Scans to DBOT</p>
                  <p className="text-[11px] text-slate-400">
                    Immediately pushes 120s signed signals to DBOT Load Strategy → Quantum Sync
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setAutoBroadcast((v) => !v)}
                  className={`px-3.5 py-1.5 rounded-full text-xs font-bold cursor-pointer ${
                    autoBroadcast ? 'bg-[#FF243B] text-white' : 'bg-[#1E293B] text-slate-300'
                  }`}
                >
                  {autoBroadcast ? 'Enabled' : 'Disabled'}
                </button>
              </div>
            </section>
          )}

          {/* ABOUT VIEW */}
          {navTab === 'about' && (
            <section className="rounded-2xl bg-[#0B111E] border border-[#1B2438] p-5 sm:p-6 space-y-4 max-w-3xl">
              <div className="flex items-center gap-3">
                <ShieldCheck className="w-6 h-6 text-[#FF243B]" />
                <h2 className="text-base font-bold text-white">About Quantum Analyser Engine</h2>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                Quantum Analyser operates on a standalone route isolated from the main brokerage hub, ingesting live
                Deriv WebSocket tick feeds and evaluating 0–9 last-digit frequencies, short-term directional slope, and
                volatility compression to generate 120-second HMAC-SHA256 signed strategies ready for DBOT execution.
              </p>
              <div className="rounded-xl bg-[#070B14] border border-[#1E293B] p-4 text-xs text-slate-400 space-y-1.5">
                <p className="font-bold text-slate-200">DBOT Integration Bridge</p>
                <p>
                  Click <strong className="text-white">Sync DBOT</strong> on any active result banner or download the
                  signed <code className="text-[#FF6B7B]">.xml</code> strategy file to import blocks directly into
                  Deriv Bot Builder with tamper-proof 120-second verification.
                </p>
              </div>
              <p className="text-[11px] text-amber-300/90">
                Risk Notice: Statistical probability analysis helps evaluate historical tick distributions and does not
                guarantee future trading profits.
              </p>
            </section>
          )}
        </main>
      </div>

      {/* MOBILE BOTTOM NAVIGATION (Matches mobile frame of uploaded screenshot) */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-30 bg-[#080D18]/95 backdrop-blur-md border-t border-[#182135] grid grid-cols-5 h-16 px-1">
        {navItems.slice(0, 5).map((it) => {
          const Icon = it.icon;
          const active = navTab === it.id;
          return (
            <button
              key={it.id}
              type="button"
              onClick={() => setNavTab(it.id)}
              className={`flex flex-col items-center justify-center gap-1 text-[11px] font-medium cursor-pointer ${
                active ? 'text-[#FF243B]' : 'text-slate-400'
              }`}
            >
              <Icon className="w-[18px] h-[18px]" />
              <span>{it.label}</span>
            </button>
          );
        })}
      </nav>

      {/* INTERACTIVE "VIEW ANALYSIS DETAILS" MODAL / DRAWER */}
      {detailsOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setDetailsOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-2xl bg-[#0B111E] border border-[#1E293B] p-5 sm:p-6 space-y-5 shadow-2xl"
          >
            <div className="flex items-center justify-between gap-3 border-b border-[#182135] pb-3.5">
              <div>
                <h3 className="font-display text-lg font-bold text-white">
                  Detailed Analysis · {selectedSymbol} (Digit {selectedDigit})
                </h3>
                <p className="text-xs text-slate-400">
                  Live tick distribution across {liveAnalytics.sampleSize} recent ticks · HMAC DBOT Bridge
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDetailsOpen(false)}
                className="p-2 rounded-xl bg-[#121A2D] text-slate-300 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* 0-9 Digit Distribution Bars */}
            <div className="space-y-2.5">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Digit Distribution (0 – 9)
              </p>
              <div className="grid grid-cols-5 sm:grid-cols-10 gap-2">
                {distRows.map((row) => {
                  const isTarget = row.digit === selectedDigit;
                  return (
                    <div
                      key={row.digit}
                      className={`rounded-xl p-2.5 border text-center ${
                        isTarget
                          ? 'bg-[#FF243B]/15 border-[#FF243B]'
                          : 'bg-[#070B14] border-[#1B2438]'
                      }`}
                    >
                      <div className="h-16 flex items-end justify-center pb-1">
                        <div
                          className={`w-3.5 rounded-t ${isTarget ? 'bg-[#FF243B]' : 'bg-[#38BDF8]/70'}`}
                          style={{ height: `${Math.min(100, Math.max(12, row.pct * 4.5))}%` }}
                        />
                      </div>
                      <p className="text-xs font-bold text-white">{row.digit}</p>
                      <p className="text-[10px] font-mono-num text-slate-400">{row.pct}%</p>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Digit Contract Ratios + SMC Technical Snapshot */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div className="rounded-xl bg-[#070B14] border border-[#1B2438] p-3">
                <p className="text-slate-400">Differs ({selectedDigit})</p>
                <p className="font-mono-num font-bold text-[#22C55E] text-sm mt-1">
                  {liveAnalytics.differsPct.toFixed(1)}%
                </p>
              </div>
              <div className="rounded-xl bg-[#070B14] border border-[#1B2438] p-3">
                <p className="text-slate-400">Over {selectedDigit} / Under {selectedDigit}</p>
                <p className="font-mono-num font-bold text-white text-sm mt-1">
                  {liveAnalytics.overPct.toFixed(0)}% / {liveAnalytics.underPct.toFixed(0)}%
                </p>
              </div>
              <div className="rounded-xl bg-[#070B14] border border-[#1B2438] p-3">
                <p className="text-slate-400">Even / Odd</p>
                <p className="font-mono-num font-bold text-[#38BDF8] text-sm mt-1">
                  {liveAnalytics.evenPct.toFixed(0)}% / {liveAnalytics.oddPct.toFixed(0)}%
                </p>
              </div>
              <div className="rounded-xl bg-[#070B14] border border-[#1B2438] p-3">
                <p className="text-slate-400">RSI (14) / SMC</p>
                <p className="font-mono-num font-bold text-[#C084FC] text-sm mt-1">
                  {analyzeSnapshot?.indicators?.rsi14
                    ? Number(analyzeSnapshot.indicators.rsi14).toFixed(1)
                    : '—'}{' '}
                  · {analyzeSnapshot?.smc?.bias || liveAnalytics.trend}
                </p>
              </div>
            </div>

            {/* Active Prediction Breakdown + Action Buttons */}
            {displayedPred && (
              <div className="rounded-xl bg-[#070B14] border border-[#10B981]/35 p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="text-xs font-bold text-[#22C55E]">
                      {displayedPred.prediction_id} · {displayedPred.contract_type}
                    </span>
                    <p className="text-xs text-slate-300 mt-0.5">{displayedPred.rationale}</p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2.5 pt-1">
                  <button
                    type="button"
                    onClick={() => handleSyncToDbot(displayedPred)}
                    className="px-4 py-2 rounded-xl bg-gradient-to-r from-[#E11D48] to-[#FF243B] text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <ExternalLink className="w-3.5 h-3.5" /> Open &amp; Sync in DBOT
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDownloadXml(displayedPred)}
                    className="px-4 py-2 rounded-xl bg-[#121A2D] hover:bg-[#1A253F] border border-[#24324D] text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" /> Download Signed XML
                  </button>
                  <button
                    type="button"
                    disabled={executingTrade}
                    onClick={() => handleQuickExecute(displayedPred)}
                    className="px-4 py-2 rounded-xl bg-[#10B981] hover:bg-[#059669] text-[#052E16] text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
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
