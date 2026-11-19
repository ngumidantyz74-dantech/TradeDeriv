import React, { useState, useEffect, useCallback } from 'react';
import {
  Play,
  Sliders,
  Star,
  Bot,
  FlaskConical,
  Save,
  AlertTriangle,
  History,
  CheckCircle2,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { apiFetch, sanitizeUiError } from '../lib/api';
import type { BotDefinitionRecord, BotStrategy, BotStrategyAst } from '../types';
import type { StrategyDefinition, BacktestReport, StrategyKey } from '../lib/quant-engine';

interface UserStrategyRow {
  id: number;
  strategy_key: StrategyKey;
  name: string;
  enabled: boolean;
  execution_mode: 'paper' | 'live';
  symbol: string;
  timeframe: string;
  config_json: string;
  risk_json: string;
  updated_at: string;
}

const TIMEFRAMES = [
  { label: '1m', granularity: 60 },
  { label: '5m', granularity: 300 },
  { label: '15m', granularity: 900 },
  { label: '30m', granularity: 1800 },
  { label: '1h', granularity: 3600 },
  { label: '4h', granularity: 14400 },
];

export const TradingBotsPage: React.FC = () => {
  const {
    instruments,
    setActiveTab,
    accountMode,
    activeConnectedAccount,
    refreshOrders,
    refreshAll,
    showToast,
  } = useApp();

  const [viewMode, setViewMode] = useState<'lab' | 'marketplace'>('lab');

  // Prebuilt Bot Marketplace & AST Templates state
  const [strategies, setStrategies] = useState<BotStrategy[]>([]);
  const [astTemplates, setAstTemplates] = useState<BotDefinitionRecord[]>([]);
  const [astDefinitions, setAstDefinitions] = useState<BotDefinitionRecord[]>([]);
  const [editingTemplate, setEditingTemplate] = useState<{ record: BotDefinitionRecord; ast: BotStrategyAst } | null>(null);
  const [templateBusyId, setTemplateBusyId] = useState<number | null>(null);
  const [cat, setCat] = useState('All');
  const [runningSlug, setRunningSlug] = useState<string | null>(null);

  // Strategy Lab & Backtester state
  const [catalog, setCatalog] = useState<StrategyDefinition[]>([]);
  const [userStrategies, setUserStrategies] = useState<UserStrategyRow[]>([]);
  const [selectedKey, setSelectedKey] = useState<StrategyKey>('trend_following');

  // Editor form state
  const [stratSymbol, setStratSymbol] = useState('1HZ100V');
  const [stratTimeframe, setStratTimeframe] = useState('15m');
  const [execMode, setExecMode] = useState<'paper' | 'live'>('paper');
  const [enabled, setEnabled] = useState(true);
  const [stake, setStake] = useState('2');
  const [slAtrMult, setSlAtrMult] = useState('1.2');
  const [tpRr, setTpRr] = useState('3.0');
  const [adxThreshold, setAdxThreshold] = useState('22');
  const [rsiOversold, setRsiOversold] = useState('30');
  const [rsiOverbought, setRsiOverbought] = useState('70');
  const [candleCount, setCandleCount] = useState('300');
  const [spreadPct, setSpreadPct] = useState('0.06');

  const [savingConfig, setSavingConfig] = useState(false);
  const [backtesting, setBacktesting] = useState(false);
  const [backtestError, setBacktestError] = useState<string | null>(null);
  const [backtestReport, setBacktestReport] = useState<BacktestReport | null>(null);
  const [recentRuns, setRecentRuns] = useState<any[]>([]);

  const loadStrategyLab = useCallback(async () => {
    try {
      const ts = Date.now();
      const [catRes, userRes, runsRes, astRes] = await Promise.all([
        apiFetch<{ strategies: StrategyDefinition[] }>(`/api/strategies/catalog?_t=${ts}`, {
          skipAuth: true,
          cache: 'no-store',
        }),
        apiFetch<{ strategies: UserStrategyRow[] }>(`/api/strategies/user?_t=${ts}`, { cache: 'no-store' }).catch(
          () => ({ strategies: [] })
        ),
        apiFetch<{ runs: any[] }>(`/api/strategies/backtests?_t=${ts}`, { cache: 'no-store' }).catch(() => ({
          runs: [],
        })),
        apiFetch<{ definitions: BotDefinitionRecord[]; templates: BotDefinitionRecord[] }>('/api/bots/ast/definitions')
          .catch(() => ({ definitions: [], templates: [] })),
      ]);
      setCatalog(catRes.strategies || []);
      setUserStrategies(userRes.strategies || []);
      setRecentRuns(runsRes.runs || []);
      setAstDefinitions(astRes.definitions || []);
      setAstTemplates(astRes.templates || []);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    apiFetch<{ strategies: BotStrategy[] }>(`/api/bots/strategies?_t=${Date.now()}`, {
      skipAuth: true,
      cache: 'no-store',
    })
      .then((res) => setStrategies(res.strategies || []))
      .catch(() => {});
    loadStrategyLab();
  }, [loadStrategyLab]);

  // Populate editor when selecting a catalog strategy
  useEffect(() => {
    const def = catalog.find((s) => s.key === selectedKey);
    if (!def) return;
    const saved = userStrategies.find((u) => u.strategy_key === selectedKey);
    let parsedCfg: any = {};
    if (saved?.config_json) {
      try {
        parsedCfg = JSON.parse(saved.config_json);
      } catch {
        parsedCfg = {};
      }
    }
    setStratSymbol(saved?.symbol || '1HZ100V');
    setStratTimeframe(saved?.timeframe || def.recommendedTimeframes[1] || '15m');
    setExecMode(saved?.execution_mode || 'paper');
    setEnabled(saved?.enabled ?? true);
    setStake(String(parsedCfg.stake ?? def.defaultConfig.stake));
    setSlAtrMult(String(parsedCfg.stopLossAtrMult ?? def.defaultConfig.stopLossAtrMult));
    setTpRr(String(parsedCfg.takeProfitRr ?? def.defaultConfig.takeProfitRr));
    setAdxThreshold(String(parsedCfg.adxThreshold ?? def.defaultConfig.adxThreshold));
    setRsiOversold(String(parsedCfg.rsiOversold ?? def.defaultConfig.rsiOversold));
    setRsiOverbought(String(parsedCfg.rsiOverbought ?? def.defaultConfig.rsiOverbought));
  }, [selectedKey, catalog, userStrategies]);

  const handleSaveConfig = async () => {
    setSavingConfig(true);
    const def = catalog.find((s) => s.key === selectedKey);
    try {
      await apiFetch('/api/strategies/user', {
        method: 'PUT',
        body: JSON.stringify({
          strategyKey: selectedKey,
          name: def?.name || selectedKey,
          enabled,
          executionMode: execMode,
          symbol: stratSymbol,
          timeframe: stratTimeframe,
          config: {
            stake: Number(stake),
            stopLossAtrMult: Number(slAtrMult),
            takeProfitRr: Number(tpRr),
            adxThreshold: Number(adxThreshold),
            rsiOversold: Number(rsiOversold),
            rsiOverbought: Number(rsiOverbought),
          },
        }),
      });
      await loadStrategyLab();
      showToast(`Saved configuration for ${def?.name || selectedKey}`, 'success');
    } catch (err) {
      showToast(sanitizeUiError(err, 'Failed to save strategy config'), 'error');
    } finally {
      setSavingConfig(false);
    }
  };

  const handleRunBacktest = async () => {
    setBacktesting(true);
    setBacktestError(null);
    const granularity = TIMEFRAMES.find((t) => t.label === stratTimeframe)?.granularity || 900;
    try {
      const res = await apiFetch<{ report: BacktestReport }>('/api/strategies/backtest', {
        method: 'POST',
        body: JSON.stringify({
          strategyKey: selectedKey,
          symbol: stratSymbol,
          granularity,
          candleCount: Number(candleCount) || 300,
          stake: Number(stake) || 2,
          stopLossAtrMult: Number(slAtrMult) || 1.2,
          takeProfitRr: Number(tpRr) || 3.0,
          spreadCostPct: (Number(spreadPct) || 0.06) / 100,
          adxThreshold: Number(adxThreshold) || 20,
          rsiOversold: Number(rsiOversold) || 30,
          rsiOverbought: Number(rsiOverbought) || 70,
        }),
      });
      setBacktestReport(res.report);
      await loadStrategyLab();
      showToast('Backtest completed on real Deriv historical candles', 'success');
    } catch (err) {
      setBacktestError(sanitizeUiError(err, 'Backtest temporarily unavailable. Please retry in a moment.'));
    } finally {
      setBacktesting(false);
    }
  };

  // Preserved Prebuilt Marketplace handlers
  const categories = ['All', 'Free Bots', 'Scalper Bots', 'SpeedBots'];
  const filtered = strategies.filter((s) => cat === 'All' || s.category === cat);

  const handleRunInstant = async (s: BotStrategy) => {
    setRunningSlug(s.slug);
    try {
      await apiFetch('/api/bots/run', {
        method: 'POST',
        body: JSON.stringify({
          strategyName: s.name,
          symbol: s.symbol,
          contractType: s.contract_type,
          baseStake: s.config?.stake ?? 1,
          barrier: s.config?.barrier ?? '2',
          duration: s.config?.duration ?? 1,
          durationUnit: s.config?.duration_unit ?? 't',
          multiplier: s.config?.multiplier ?? 100,
          martingale: s.config?.martingale ?? 2.0,
          takeProfit: s.config?.takeProfit ?? 6,
          stopLoss: s.config?.stopLoss ?? 3,
          maxTrades: s.config?.maxTrades ?? 15,
          accountMode,
          executionMode: accountMode === 'real' && activeConnectedAccount ? 'deriv' : 'virtual',
          connectedAccountId: activeConnectedAccount?.id || null,
        }),
      });
      await Promise.all([refreshOrders(), refreshAll()]);
      showToast(`${s.name} launched in ${accountMode.toUpperCase()} Bot Engine`, 'success');
      setActiveTab('bot-builder');
    } catch (err) {
      showToast(sanitizeUiError(err, 'Failed to start strategy'), 'error');
    } finally {
      setRunningSlug(null);
    }
  };

  const handleLoadInBuilder = (s: BotStrategy) => {
    sessionStorage.setItem('td_loaded_bot', JSON.stringify(s));
    setActiveTab('bot-builder');
  };

  const handleOpenTemplateInBuilder = (record: BotDefinitionRecord, parsedAst: BotStrategyAst) => {
    sessionStorage.setItem('td_loaded_ast', JSON.stringify({ id: record.id, demo_tested: record.demo_tested, ast: parsedAst }));
    setActiveTab('bot-builder');
  };

  const handleSavePersonalTemplate = async () => {
    if (!editingTemplate) return;
    setTemplateBusyId(editingTemplate.record.id);
    try {
      await apiFetch('/api/bots/ast/definitions', {
        method: 'POST',
        body: JSON.stringify({
          ast: editingTemplate.ast,
          description: editingTemplate.record.description,
          category: editingTemplate.record.category,
          demoTested: false,
        }),
      });
      await loadStrategyLab();
      setEditingTemplate(null);
      showToast(`Saved personal version "${editingTemplate.ast.name}"`, 'success');
    } catch (err) {
      showToast(sanitizeUiError(err, 'Failed to save personal template'), 'error');
    } finally {
      setTemplateBusyId(null);
    }
  };

  const handleBacktestAstRecord = async (record: BotDefinitionRecord, parsedAst: BotStrategyAst) => {
    setTemplateBusyId(record.id);
    try {
      const res = await apiFetch<{ ok: boolean; demoTested: boolean; report: any }>(
        `/api/bots/ast/definitions/${record.id}/backtest`,
        {
          method: 'POST',
          body: JSON.stringify({
            symbol: parsedAst.market.instrument,
            granularity: parsedAst.market.granularity || 60,
          }),
        }
      );
      await loadStrategyLab();
      showToast(
        `${record.name} backtest: ${res.report?.trades ?? 0} trades, Win ${res.report?.winRatePct ?? 0}%`,
        'success'
      );
    } catch (err) {
      showToast(sanitizeUiError(err, 'Template backtest failed'), 'error');
    } finally {
      setTemplateBusyId(null);
    }
  };

  const handleLaunchAstRecord = async (record: BotDefinitionRecord, parsedAst: BotStrategyAst, mode: 'demo' | 'real') => {
    if (mode === 'real' && !record.demo_tested) {
      showToast('Run Historical Demo Backtest first to unlock authorized Live execution.', 'error');
      return;
    }
    setTemplateBusyId(record.id);
    try {
      await apiFetch('/api/bots/ast/run', {
        method: 'POST',
        body: JSON.stringify({
          definitionId: record.id,
          ast: parsedAst,
          accountMode: mode,
          executionMode: mode === 'real' && activeConnectedAccount ? 'deriv' : 'virtual',
          connectedAccountId: mode === 'real' ? activeConnectedAccount?.id || null : null,
          executionSpeed: 'fast',
        }),
      });
      await Promise.all([refreshOrders(), refreshAll()]);
      showToast(`${record.name} launched in ${mode.toUpperCase()} mode`, 'success');
      setActiveTab('bot-builder');
    } catch (err) {
      showToast(sanitizeUiError(err, 'Failed to run template'), 'error');
    } finally {
      setTemplateBusyId(null);
    }
  };

  const selectedDef = catalog.find((s) => s.key === selectedKey);

  // Clean SVG Equity Curve helper
  const renderEquitySvg = (curve: Array<{ time: number; equity: number }>) => {
    if (!curve || curve.length < 2) {
      return (
        <div className="h-36 flex items-center justify-center text-xs text-slate-400">
          Not enough closed trades to plot equity curve.
        </div>
      );
    }
    const vals = curve.map((c) => c.equity);
    const min = Math.min(...vals, 1000);
    const max = Math.max(...vals, 1000);
    const range = Math.max(1, max - min);
    const w = 600;
    const h = 130;
    const pad = 10;
    const pts = curve
      .map((c, idx) => {
        const x = pad + (idx / Math.max(1, curve.length - 1)) * (w - pad * 2);
        const y = h - pad - ((c.equity - min) / range) * (h - pad * 2);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
    const lastEq = curve[curve.length - 1].equity;
    const stroke = lastEq >= 1000 ? '#00A878' : '#FF444F';
    return (
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-36">
        <line
          x1={pad}
          x2={w - pad}
          y1={h - pad - ((1000 - min) / range) * (h - pad * 2)}
          y2={h - pad - ((1000 - min) / range) * (h - pad * 2)}
          stroke="#64748B"
          strokeDasharray="4 4"
          strokeOpacity="0.4"
        />
        <polyline fill="none" stroke={stroke} strokeWidth="2.5" points={pts} />
      </svg>
    );
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-8 py-6 space-y-6">
      {/* Top Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-display text-2xl font-bold">Algorithmic Strategy Lab & Bots</h1>
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                accountMode === 'real' ? 'bg-[#FF444F]/15 text-[#FF444F]' : 'bg-[#00A878]/15 text-[#00A878]'
              }`}
            >
              {accountMode} Mode
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Configure institutional 10-strategy rules, run causal In-Sample / Out-of-Sample backtests on real Deriv candles, or launch prebuilt bots.
          </p>
        </div>

        <div className="flex items-center gap-1 p-1 rounded-xl bg-[#F4F5F7] dark:bg-[#181C25] border border-slate-200 dark:border-[#2A2F3D]">
          <button
            type="button"
            onClick={() => setViewMode('lab')}
            className={`px-4 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
              viewMode === 'lab'
                ? 'bg-[#FF444F] text-white'
                : 'text-slate-600 dark:text-slate-300 hover:text-[#0E1117] dark:hover:text-white'
            }`}
          >
            <FlaskConical className="w-3.5 h-3.5" /> Strategy Lab & Backtester
          </button>
          <button
            type="button"
            onClick={() => setViewMode('marketplace')}
            className={`px-4 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
              viewMode === 'marketplace'
                ? 'bg-[#FF444F] text-white'
                : 'text-slate-600 dark:text-slate-300 hover:text-[#0E1117] dark:hover:text-white'
            }`}
          >
            <Bot className="w-3.5 h-3.5" /> Prebuilt Bot Marketplace
          </button>
        </div>
      </div>

      {/* VIEW 1: STRATEGY LAB & CAUSAL BACKTESTER */}
      {viewMode === 'lab' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left: 10-Strategy Catalog */}
          <div className="lg:col-span-4 bg-white dark:bg-[#181C25] rounded-2xl border border-slate-200 dark:border-[#2A2F3D] overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 dark:border-[#2A2F3D] text-xs font-bold flex items-center justify-between">
              <span>Institutional Strategy Engine (10)</span>
              <span className="text-slate-400 font-mono tabular-nums">{userStrategies.length} saved</span>
            </div>
            <div className="divide-y divide-slate-100 dark:divide-[#2A2F3D]">
              {catalog.map((s) => {
                const saved = userStrategies.find((u) => u.strategy_key === s.key);
                const active = selectedKey === s.key;
                return (
                  <button
                    key={s.key}
                    type="button"
                    onClick={() => setSelectedKey(s.key)}
                    className={`w-full text-left px-4 py-3 transition-colors cursor-pointer ${
                      active ? 'bg-[#FF444F]/10' : 'hover:bg-[#F8F9FB] dark:hover:bg-[#111319]'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className={`text-xs font-bold ${active ? 'text-[#FF444F]' : ''}`}>{s.name}</span>
                      <span className="text-[11px] text-slate-400">{s.category}</span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1 line-clamp-2">{s.summary}</p>
                    {saved && (
                      <div className="mt-1.5 text-[10px] font-mono tabular-nums text-[#00A878] flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" /> {saved.symbol} · {saved.timeframe} ·{' '}
                        {saved.execution_mode.toUpperCase()}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Right: Parameter Editor & Backtest Results */}
          <div className="lg:col-span-8 space-y-5">
            {selectedDef && (
              <div className="bg-white dark:bg-[#181C25] rounded-2xl border border-slate-200 dark:border-[#2A2F3D] p-5 space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-xs text-slate-500">
                      {selectedDef.category} · Markets: {selectedDef.supportedMarkets.join(', ')}
                    </div>
                    <h2 className="font-display text-lg font-bold mt-0.5">{selectedDef.name}</h2>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleSaveConfig}
                      disabled={savingConfig}
                      className="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-[#2A2F3D] text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                    >
                      <Save className="w-3.5 h-3.5" /> {savingConfig ? 'Saving...' : 'Save Config'}
                    </button>
                    <button
                      type="button"
                      onClick={handleRunBacktest}
                      disabled={backtesting}
                      className="px-4 py-2 rounded-xl bg-[#FF444F] hover:bg-[#E63946] text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                    >
                      <FlaskConical className="w-3.5 h-3.5" />
                      {backtesting ? 'Backtesting...' : 'Run Real Deriv Backtest'}
                    </button>
                  </div>
                </div>

                {/* Rule list */}
                <ul className="text-xs text-slate-600 dark:text-slate-300 list-disc pl-5 space-y-0.5">
                  {selectedDef.rules.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>

                {/* Parameters Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 border-t border-slate-100 dark:border-[#2A2F3D]">
                  <div>
                    <label className="block text-[11px] text-slate-500 mb-1">Symbol</label>
                    <select
                      value={stratSymbol}
                      onChange={(e) => setStratSymbol(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-[#F4F5F7] dark:bg-[#111319] text-xs font-semibold"
                    >
                      {instruments.map((i) => (
                        <option key={i.symbol} value={i.symbol}>
                          {i.display_name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] text-slate-500 mb-1">Timeframe</label>
                    <select
                      value={stratTimeframe}
                      onChange={(e) => setStratTimeframe(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-[#F4F5F7] dark:bg-[#111319] font-mono tabular-nums text-xs font-semibold"
                    >
                      {TIMEFRAMES.map((t) => (
                        <option key={t.label} value={t.label}>
                          {t.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] text-slate-500 mb-1">Execution Mode</label>
                    <select
                      value={execMode}
                      onChange={(e) => setExecMode(e.target.value as 'paper' | 'live')}
                      className="w-full px-3 py-2 rounded-xl bg-[#F4F5F7] dark:bg-[#111319] text-xs font-semibold"
                    >
                      <option value="paper">Paper / Simulation</option>
                      <option value="live">Live Deriv Guarded</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] text-slate-500 mb-1">Risk Stake (USD)</label>
                    <input
                      type="number"
                      min="1"
                      value={stake}
                      onChange={(e) => setStake(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-[#F4F5F7] dark:bg-[#111319] font-mono tabular-nums text-xs font-bold"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] text-slate-500 mb-1">SL ATR Mult</label>
                    <input
                      type="number"
                      step="0.1"
                      value={slAtrMult}
                      onChange={(e) => setSlAtrMult(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-[#F4F5F7] dark:bg-[#111319] font-mono tabular-nums text-xs font-bold"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] text-slate-500 mb-1">TP R:R Ratio</label>
                    <input
                      type="number"
                      step="0.1"
                      value={tpRr}
                      onChange={(e) => setTpRr(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-[#F4F5F7] dark:bg-[#111319] font-mono tabular-nums text-xs font-bold"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] text-slate-500 mb-1">ADX Threshold</label>
                    <input
                      type="number"
                      value={adxThreshold}
                      onChange={(e) => setAdxThreshold(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-[#F4F5F7] dark:bg-[#111319] font-mono tabular-nums text-xs font-bold"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] text-slate-500 mb-1">RSI OS / OB</label>
                    <div className="flex gap-1.5">
                      <input
                        type="number"
                        value={rsiOversold}
                        onChange={(e) => setRsiOversold(e.target.value)}
                        className="w-1/2 px-2 py-2 rounded-xl bg-[#F4F5F7] dark:bg-[#111319] font-mono tabular-nums text-xs font-bold"
                      />
                      <input
                        type="number"
                        value={rsiOverbought}
                        onChange={(e) => setRsiOverbought(e.target.value)}
                        className="w-1/2 px-2 py-2 rounded-xl bg-[#F4F5F7] dark:bg-[#111319] font-mono tabular-nums text-xs font-bold"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] text-slate-500 mb-1">Backtest Candles</label>
                    <select
                      value={candleCount}
                      onChange={(e) => setCandleCount(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-[#F4F5F7] dark:bg-[#111319] font-mono tabular-nums text-xs font-semibold"
                    >
                      <option value="180">180 Candles</option>
                      <option value="300">300 Candles</option>
                      <option value="450">450 Candles</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] text-slate-500 mb-1">Round-Trip Spread %</label>
                    <input
                      type="number"
                      step="0.01"
                      value={spreadPct}
                      onChange={(e) => setSpreadPct(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-[#F4F5F7] dark:bg-[#111319] font-mono tabular-nums text-xs font-bold"
                    />
                  </div>

                  <div className="col-span-2 flex items-end pb-1">
                    <label className="inline-flex items-center gap-2 text-xs font-semibold cursor-pointer">
                      <input
                        type="checkbox"
                        checked={enabled}
                        onChange={(e) => setEnabled(e.target.checked)}
                        className="accent-[#00A878]"
                      />
                      Strategy Armed in Personal Workspace
                    </label>
                  </div>
                </div>
              </div>
            )}

            {backtestError && (
              <div className="p-4 rounded-2xl bg-[#FF444F]/10 border border-[#FF444F]/30 text-xs text-[#FF444F] font-semibold flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" /> {backtestError}
              </div>
            )}

            {/* Backtest Report */}
            {backtestReport && (
              <div className="bg-white dark:bg-[#181C25] rounded-2xl border border-slate-200 dark:border-[#2A2F3D] p-5 space-y-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="font-display text-base font-bold">
                      Backtest Report: {backtestReport.strategyName} ({stratSymbol} · {stratTimeframe})
                    </h3>
                    <p className="text-[11px] text-slate-500">
                      {backtestReport.candleCount} real Deriv candles · Spread/Slippage {backtestReport.spreadCostPct}%
                    </p>
                  </div>
                </div>

                {backtestReport.warning && (
                  <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-700 dark:text-amber-300 font-semibold flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0" /> {backtestReport.warning}
                  </div>
                )}

                {/* Overall KPIs */}
                <div className="grid grid-cols-2 sm:grid-cols-6 gap-3">
                  {[
                    { label: 'Trades', val: `${backtestReport.overall.trades}` },
                    { label: 'Win Rate', val: `${backtestReport.overall.winRatePct}%` },
                    {
                      label: 'Net P/L',
                      val: `${backtestReport.overall.netPnlUsd >= 0 ? '+' : ''}$${backtestReport.overall.netPnlUsd.toFixed(2)}`,
                      color: backtestReport.overall.netPnlUsd >= 0 ? 'text-[#00A878]' : 'text-[#FF444F]',
                    },
                    { label: 'Profit Factor', val: `${backtestReport.overall.profitFactor}` },
                    { label: 'Max Drawdown', val: `${backtestReport.overall.maxDrawdownPct}%`, color: 'text-[#FF444F]' },
                    { label: 'Expectancy', val: `$${backtestReport.overall.expectancyUsd.toFixed(2)}` },
                  ].map((k) => (
                    <div key={k.label} className="p-3 rounded-xl bg-[#F8F9FB] dark:bg-[#111319]">
                      <p className="text-[11px] text-slate-500">{k.label}</p>
                      <p className={`font-mono tabular-nums text-base font-bold mt-0.5 ${k.color || ''}`}>{k.val}</p>
                    </div>
                  ))}
                </div>

                {/* In-Sample vs Out-of-Sample Split */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {[
                    { title: 'In-Sample (First 70% Bars)', data: backtestReport.inSample },
                    { title: 'Out-of-Sample (Final 30% Bars)', data: backtestReport.outOfSample },
                  ].map((seg) => (
                    <div
                      key={seg.title}
                      className="p-4 rounded-xl bg-[#F8F9FB] dark:bg-[#111319] border border-slate-200/70 dark:border-[#2A2F3D] text-xs space-y-1.5"
                    >
                      <div className="font-bold">{seg.title}</div>
                      <div className="grid grid-cols-3 gap-2 font-mono tabular-nums pt-1">
                        <div>
                          <span className="text-[10px] text-slate-400 block">Trades / Win%</span>
                          <strong>
                            {seg.data.trades} ({seg.data.winRatePct}%)
                          </strong>
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-400 block">Net P/L</span>
                          <strong className={seg.data.netPnlUsd >= 0 ? 'text-[#00A878]' : 'text-[#FF444F]'}>
                            ${seg.data.netPnlUsd.toFixed(2)}
                          </strong>
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-400 block">PF / Avg R</span>
                          <strong>
                            {seg.data.profitFactor} / {seg.data.avgRMultiple}R
                          </strong>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Equity Curve */}
                <div className="p-4 rounded-xl bg-[#F8F9FB] dark:bg-[#111319] border border-slate-200/70 dark:border-[#2A2F3D]">
                  <p className="text-xs font-semibold text-slate-500 mb-2">Simulated Equity Curve ($1,000 Reference Base)</p>
                  {renderEquitySvg(backtestReport.equityCurve)}
                </div>

                {/* Simulated Trades Table */}
                {backtestReport.trades.length > 0 && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-slate-100 dark:border-[#2A2F3D] text-slate-500">
                          <th className="text-left py-2">Sample</th>
                          <th className="text-left py-2">Dir</th>
                          <th className="text-right py-2">Entry → Exit</th>
                          <th className="text-right py-2">R Mult</th>
                          <th className="text-right py-2">Net P/L</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-[#2A2F3D]">
                        {backtestReport.trades.slice(-15).reverse().map((t, idx) => (
                          <tr key={idx}>
                            <td className="py-2 text-[11px] text-slate-500">
                              {t.sampleSplit === 'in_sample' ? 'In-Sample' : 'Out-of-Sample'}
                            </td>
                            <td className={`py-2 font-bold ${t.direction === 'BUY' ? 'text-[#00A878]' : 'text-[#FF444F]'}`}>
                              {t.direction}
                            </td>
                            <td className="py-2 text-right font-mono tabular-nums">
                              {t.entryPrice.toFixed(3)} → {t.exitPrice.toFixed(3)}
                            </td>
                            <td className="py-2 text-right font-mono tabular-nums">{t.rMultiple}R</td>
                            <td
                              className={`py-2 text-right font-mono tabular-nums font-bold ${
                                t.netPnlUsd >= 0 ? 'text-[#00A878]' : 'text-[#FF444F]'
                              }`}
                            >
                              {t.netPnlUsd >= 0 ? '+' : ''}
                              ${t.netPnlUsd.toFixed(2)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                <p className="text-[11px] text-slate-500">{backtestReport.methodologyNote}</p>
              </div>
            )}

            {/* Recent Backtest Runs */}
            {recentRuns.length > 0 && (
              <div className="bg-white dark:bg-[#181C25] rounded-2xl border border-slate-200 dark:border-[#2A2F3D] p-4 space-y-2">
                <h3 className="text-xs font-bold flex items-center gap-1.5">
                  <History className="w-3.5 h-3.5 text-[#FF444F]" /> Recent Saved Backtest Runs
                </h3>
                <div className="divide-y divide-slate-100 dark:divide-[#2A2F3D]">
                  {recentRuns.slice(0, 6).map((r) => {
                    let full: any = {};
                    try {
                      full = JSON.parse(r.full_metrics_json || '{}');
                    } catch {
                      full = {};
                    }
                    return (
                      <div key={r.id} className="py-2 flex items-center justify-between text-xs">
                        <span>
                          <strong>{r.strategy_key}</strong> · {r.symbol} ({r.candle_count} bars)
                        </span>
                        <span className="font-mono tabular-nums">
                          Win {full.winRatePct ?? 0}% ·{' '}
                          <strong className={Number(full.netPnlUsd || 0) >= 0 ? 'text-[#00A878]' : 'text-[#FF444F]'}>
                            ${Number(full.netPnlUsd || 0).toFixed(2)}
                          </strong>
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* VIEW 2: STRATEGY TEMPLATES LIBRARY & PREBUILT BOTS */}
      {viewMode === 'marketplace' && (
        <div className="space-y-6">
          {/* Structured AST Templates & Saved Personal Versions */}
          {(astTemplates.length > 0 || astDefinitions.length > 0) && (
            <div className="space-y-3">
              <div>
                <h2 className="font-display text-base font-bold">Executable Strategy Templates & Personal Versions</h2>
                <p className="text-xs text-slate-500">
                  Preview rules, customize parameters, run historical backtests, test in Demo, or enable guarded Real execution.
                </p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {[...astDefinitions, ...astTemplates].map((rec) => {
                  let parsed: BotStrategyAst | null = null;
                  try {
                    parsed = JSON.parse(rec.ast_json) as BotStrategyAst;
                  } catch {
                    parsed = null;
                  }
                  if (!parsed) return null;
                  const busy = templateBusyId === rec.id;
                  return (
                    <div
                      key={rec.id}
                      className="bg-white dark:bg-[#181C25] rounded-2xl border border-slate-200 dark:border-[#2A2F3D] p-5 flex flex-col justify-between space-y-4"
                    >
                      <div className="space-y-2">
                        <div className="text-[11px] text-slate-500 flex items-center justify-between">
                          <span>{rec.is_template ? 'Template' : 'Personal'} · {rec.category}</span>
                          <span className={rec.demo_tested ? 'text-[#00A878] font-bold' : 'text-amber-500 font-semibold'}>
                            {rec.demo_tested ? 'Demo Verified' : 'Untested'}
                          </span>
                        </div>
                        <h3 className="font-display text-base font-bold">{rec.name}</h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400">{rec.description}</p>
                        <div className="text-[11px] font-mono tabular-nums text-slate-600 dark:text-slate-300 space-y-1 pt-2 border-t border-slate-100 dark:border-[#2A2F3D]">
                          <p>Market: {parsed.market.instrument} · {parsed.market.timeframe} · {parsed.market.contractType}</p>
                          <p>Rules ({parsed.conditionLogic}): {parsed.conditions.map((c) => c.type).join(', ') || 'Every tick'}</p>
                          <p>Risk: TP ${parsed.risk.takeProfit} / SL ${parsed.risk.stopLoss} / MaxStake ${parsed.risk.maxStake}</p>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <button
                          type="button"
                          onClick={() => setEditingTemplate({ record: rec, ast: JSON.parse(JSON.stringify(parsed)) })}
                          className="py-2 rounded-xl bg-[#F4F5F7] dark:bg-[#111319] font-semibold cursor-pointer"
                        >
                          Customize
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => handleBacktestAstRecord(rec, parsed!)}
                          className="py-2 rounded-xl bg-[#F4F5F7] dark:bg-[#111319] font-semibold cursor-pointer"
                        >
                          {busy ? 'Running...' : 'Backtest'}
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => handleLaunchAstRecord(rec, parsed!, 'demo')}
                          className="py-2 rounded-xl bg-[#00A878] text-white font-bold cursor-pointer"
                        >
                          Run Demo
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => handleLaunchAstRecord(rec, parsed!, 'real')}
                          className={`py-2 rounded-xl font-bold cursor-pointer ${
                            rec.demo_tested
                              ? 'bg-[#FF444F] text-white'
                              : 'bg-slate-200 dark:bg-[#2A2F3D] text-slate-500'
                          }`}
                        >
                          Run Real
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleOpenTemplateInBuilder(rec, parsed!)}
                        className="w-full py-1.5 text-[11px] font-semibold text-[#1958B7] hover:underline cursor-pointer"
                      >
                        Open in Visual Blockly Builder
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Inline Template Customization Drawer */}
          {editingTemplate && (
            <div className="bg-white dark:bg-[#181C25] rounded-2xl border border-[#1958B7]/40 p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-display text-base font-bold">Customize & Save Personal Version</h3>
                <button
                  type="button"
                  onClick={() => setEditingTemplate(null)}
                  className="text-xs text-slate-500 hover:text-[#FF444F] cursor-pointer"
                >
                  Close
                </button>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs">
                <div>
                  <label className="block text-[11px] text-slate-500 mb-1">Personal Name</label>
                  <input
                    type="text"
                    value={editingTemplate.ast.name}
                    onChange={(e) =>
                      setEditingTemplate((prev) =>
                        prev ? { ...prev, ast: { ...prev.ast, name: e.target.value } } : null
                      )
                    }
                    className="w-full px-3 py-2 rounded-xl bg-[#F4F5F7] dark:bg-[#111319] font-semibold"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-500 mb-1">Instrument</label>
                  <select
                    value={editingTemplate.ast.market.instrument}
                    onChange={(e) =>
                      setEditingTemplate((prev) =>
                        prev
                          ? { ...prev, ast: { ...prev.ast, market: { ...prev.ast.market, instrument: e.target.value } } }
                          : null
                      )
                    }
                    className="w-full px-3 py-2 rounded-xl bg-[#F4F5F7] dark:bg-[#111319] font-semibold"
                  >
                    {instruments.map((inst) => (
                      <option key={inst.symbol} value={inst.symbol}>
                        {inst.symbol}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] text-slate-500 mb-1">Max Stake ($)</label>
                  <input
                    type="number"
                    step="0.5"
                    value={editingTemplate.ast.risk.maxStake}
                    onChange={(e) =>
                      setEditingTemplate((prev) =>
                        prev
                          ? { ...prev, ast: { ...prev.ast, risk: { ...prev.ast.risk, maxStake: Number(e.target.value) } } }
                          : null
                      )
                    }
                    className="w-full px-3 py-2 rounded-xl bg-[#F4F5F7] dark:bg-[#111319] font-mono tabular-nums font-bold"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-500 mb-1">Take Profit ($)</label>
                  <input
                    type="number"
                    value={editingTemplate.ast.risk.takeProfit}
                    onChange={(e) =>
                      setEditingTemplate((prev) =>
                        prev
                          ? { ...prev, ast: { ...prev.ast, risk: { ...prev.ast.risk, takeProfit: Number(e.target.value) } } }
                          : null
                      )
                    }
                    className="w-full px-3 py-2 rounded-xl bg-[#F4F5F7] dark:bg-[#111319] font-mono tabular-nums font-bold"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-500 mb-1">Stop Loss ($)</label>
                  <input
                    type="number"
                    value={editingTemplate.ast.risk.stopLoss}
                    onChange={(e) =>
                      setEditingTemplate((prev) =>
                        prev
                          ? { ...prev, ast: { ...prev.ast, risk: { ...prev.ast.risk, stopLoss: Number(e.target.value) } } }
                          : null
                      )
                    }
                    className="w-full px-3 py-2 rounded-xl bg-[#F4F5F7] dark:bg-[#111319] font-mono tabular-nums font-bold"
                  />
                </div>
              </div>
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={handleSavePersonalTemplate}
                  disabled={templateBusyId === editingTemplate.record.id}
                  className="px-4 py-2 rounded-xl bg-[#1958B7] text-white text-xs font-bold cursor-pointer"
                >
                  Save Personal Version
                </button>
              </div>
            </div>
          )}

          {/* Preserved Marketplace Quick Bots */}
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
            {categories.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCat(c)}
                className={`px-4 py-2 rounded-xl text-xs font-semibold cursor-pointer whitespace-nowrap ${
                  cat === c
                    ? 'bg-[#151820] text-white dark:bg-white dark:text-[#151820]'
                    : 'bg-[#F4F5F7] dark:bg-[#181C25] text-slate-600 dark:text-slate-300'
                }`}
              >
                {c}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((s) => (
              <div
                key={s.id}
                className="bg-white dark:bg-[#181C25] rounded-2xl border border-slate-200 dark:border-[#2A2F3D] p-5 flex flex-col justify-between space-y-4"
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <div className="flex items-center gap-2">
                      <span className="w-9 h-9 rounded-xl bg-[#FF444F]/10 text-[#FF444F] flex items-center justify-center">
                        <Bot className="w-4 h-4" />
                      </span>
                      <span className="text-[11px] font-semibold text-slate-500">{s.category}</span>
                    </div>
                    <span className="inline-flex items-center gap-1 text-xs font-bold text-amber-500 font-mono tabular-nums">
                      <Star className="w-3.5 h-3.5 fill-current" /> {s.rating.toFixed(1)}
                    </span>
                  </div>

                  <h2 className="font-display text-base font-bold">{s.name}</h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{s.description}</p>

                  <div className="grid grid-cols-3 gap-2 mt-4 p-3 rounded-xl bg-[#F8F9FB] dark:bg-[#111319] text-xs">
                    <div>
                      <p className="text-[10px] text-slate-400">Market</p>
                      <p className="font-mono tabular-nums font-bold">{s.symbol}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-slate-400">Type</p>
                      <p className="font-mono tabular-nums font-bold truncate">{s.contract_type}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-slate-400">Hist. Bench</p>
                      <p className="font-mono tabular-nums font-bold text-[#00A878]">{s.win_rate_est}%</p>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    disabled={runningSlug === s.slug}
                    onClick={() => handleRunInstant(s)}
                    className="py-2.5 rounded-full bg-[#00A878] hover:bg-[#00966B] text-white text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Play className="w-3.5 h-3.5 fill-current" />
                    {runningSlug === s.slug ? 'Starting...' : 'Run Instant'}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleLoadInBuilder(s)}
                    className="py-2.5 rounded-full border border-slate-300 dark:border-[#2A2F3D] text-xs font-bold flex items-center justify-center gap-1.5 hover:border-[#FF444F] cursor-pointer"
                  >
                    <Sliders className="w-3.5 h-3.5" />
                    Load Builder
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
