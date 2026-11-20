import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  Play,
  Pause,
  Square,
  RotateCcw,
  Save,
  Upload,
  Download,
  Trash2,
  Activity,
  ShieldAlert,
  ArrowUp,
  ArrowDown,
  Plus,
  FlaskConical,
  CandlestickChart,
  CheckCircle2,
  XCircle,
  Code2,
  Layers,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { apiFetch, sanitizeUiError } from '../lib/api';
import { TemplateChart } from '../components/deriv-templates/TemplateChart';
import {
  DERIV_QUICK_STRATEGIES,
  quickStrategyToAst,
  fetchQuickStrategyXml,
  type DerivQuickStrategy,
} from '../lib/deriv-quick-strategies';
import type {
  BotAction,
  BotCondition,
  BotDefinitionRecord,
  BotRiskConfig,
  BotStrategyAst,
  BotTelemetry,
  MarketInstrument,
} from '../types';

type AnalysisType = BotCondition['type'];
type ActionType = BotAction['type'];

const CONDITION_CATALOG: Array<{
  type: AnalysisType;
  label: string;
  defaultParams: Record<string, string | number | boolean>;
}> = [
  { type: 'rsi_condition', label: 'RSI Condition', defaultParams: { period: 14, operator: '<', threshold: 35 } },
  { type: 'ema_crossover', label: 'EMA Crossover', defaultParams: { fast: 9, slow: 21, direction: 'cross_above' } },
  { type: 'macd_condition', label: 'MACD Momentum', defaultParams: { state: 'bullish' } },
  { type: 'bollinger_condition', label: 'Bollinger Bands', defaultParams: { trigger: 'touch_lower', period: 20 } },
  { type: 'sr_condition', label: 'Support / Resistance', defaultParams: { levelType: 'near_support' } },
  { type: 'trend_condition', label: 'Trend Filter (ADX/EMA)', defaultParams: { bias: 'bullish', minAdx: 20 } },
  { type: 'price_movement', label: 'Price / Last Digit', defaultParams: { operator: 'digit_gte', value: 2 } },
  { type: 'market_structure', label: 'Market Structure (SMC)', defaultParams: { pattern: 'BOS' } },
];

const ACTION_CATALOG: Array<{
  type: ActionType;
  label: string;
  defaultParams: Record<string, string | number | boolean>;
}> = [
  { type: 'SET_STAKE', label: 'Set Stake ($)', defaultParams: { stake: 1 } },
  { type: 'SET_DURATION', label: 'Set Duration', defaultParams: { duration: 5, unit: 't' } },
  { type: 'BUY', label: 'Execute BUY / CALL / OVER', defaultParams: { barrier: '2' } },
  { type: 'SELL', label: 'Execute SELL / PUT / UNDER', defaultParams: { barrier: '7' } },
  { type: 'WAIT', label: 'Wait / Hold Tick', defaultParams: { reason: 'Condition hold' } },
  { type: 'CLOSE', label: 'Close Open Position', defaultParams: { filter: 'all' } },
  { type: 'EVALUATE_OUTCOME', label: 'Evaluate Contract Outcome', defaultParams: { applyMartingale: true } },
];

const CONTRACT_OPTIONS = [
  { value: 'MULTUP', label: 'Multiplier Up (MULTUP)' },
  { value: 'MULTDOWN', label: 'Multiplier Down (MULTDOWN)' },
  { value: 'CALL', label: 'Rise (CALL)' },
  { value: 'PUT', label: 'Fall (PUT)' },
  { value: 'DIGITOVER', label: 'Digit Over (DIGITOVER)' },
  { value: 'DIGITUNDER', label: 'Digit Under (DIGITUNDER)' },
  { value: 'DIGITMATCH', label: 'Digit Matches (DIGITMATCH)' },
  { value: 'DIGITDIFF', label: 'Digit Differs (DIGITDIFF)' },
  { value: 'DIGITEVEN', label: 'Digit Even (DIGITEVEN)' },
  { value: 'DIGITODD', label: 'Digit Odd (DIGITODD)' },
  { value: 'ACCU', label: 'Accumulator (ACCU)' },
];

const TIMEFRAME_GRANULARITY: Record<string, number> = {
  '1t': 1,
  '1m': 60,
  '5m': 300,
  '15m': 900,
  '30m': 1800,
  '1h': 3600,
};

function createDefaultAst(symbol = '1HZ100V'): BotStrategyAst {
  return {
    version: '1.0',
    name: 'EMA_RSI_Momentum_Guard',
    market: {
      instrument: symbol,
      category: 'Synthetic',
      timeframe: '1m',
      granularity: 60,
      contractType: 'DIGITOVER',
    },
    conditions: [
      { id: 'cond_1', type: 'rsi_condition', params: { period: 14, operator: '<', threshold: 45 } },
      { id: 'cond_2', type: 'price_movement', params: { operator: 'digit_gte', value: 2 } },
    ],
    conditionLogic: 'ALL',
    actions: [
      { type: 'SET_STAKE', params: { stake: 1 } },
      { type: 'SET_DURATION', params: { duration: 1, unit: 't' } },
      { type: 'BUY', params: { barrier: '2' } },
      { type: 'EVALUATE_OUTCOME', params: { applyMartingale: true } },
    ],
    risk: {
      maxStake: 10,
      maxDailyLoss: 25,
      takeProfit: 12,
      stopLoss: 10,
      cooldownSeconds: 2,
      maxConsecutiveLosses: 4,
      maxSessions: 20,
      martingaleFactor: 1.8,
    },
  };
}

function astToBlocklyXml(ast: BotStrategyAst): string {
  const stakeAction = ast.actions.find((a) => a.type === 'SET_STAKE');
  const durAction = ast.actions.find((a) => a.type === 'SET_DURATION');
  const buyAction = ast.actions.find((a) => a.type === 'BUY' || a.type === 'SELL');
  return `<xml xmlns="https://developers.google.com/blockly/xml">
  <block type="trade_definition">
    <field name="STRATEGY_NAME">${ast.name}</field>
    <field name="SYMBOL_LIST">${ast.market.instrument}</field>
    <field name="TYPE_LIST">${ast.market.contractType}</field>
    <field name="TIMEFRAME">${ast.market.timeframe}</field>
    <field name="DURATION">${durAction?.params?.duration ?? 1}</field>
    <field name="DURATION_TYPE">${durAction?.params?.unit ?? 't'}</field>
    <field name="AMOUNT">${stakeAction?.params?.stake ?? 1}</field>
    <field name="PREDICTION">${buyAction?.params?.barrier ?? '2'}</field>
    <field name="MARTINGALE">${ast.risk.martingaleFactor}</field>
    <field name="TAKE_PROFIT">${ast.risk.takeProfit}</field>
    <field name="STOP_LOSS">${ast.risk.stopLoss}</field>
    <field name="MAX_STAKE">${ast.risk.maxStake}</field>
    <field name="MAX_DAILY_LOSS">${ast.risk.maxDailyLoss}</field>
  </block>
</xml>`;
}

export const BotBuilderPage: React.FC = () => {
  const {
    instruments,
    orders,
    selectedSymbol,
    accountMode,
    activeConnectedAccount,
    setActiveTab,
    setSelectedSymbol,
    refreshOrders,
    refreshAll,
    showToast,
  } = useApp();

  const [ast, setAst] = useState<BotStrategyAst>(() => createDefaultAst(selectedSymbol || '1HZ100V'));
  const [quickStratOpen, setQuickStratOpen] = useState(false);
  const [quickStratCat, setQuickStratCat] = useState<'All' | 'Classic' | 'Accumulators'>('All');
  const [showLiveChart, setShowLiveChart] = useState(true);
  const [definitionId, setDefinitionId] = useState<number | null>(null);
  const [demoTested, setDemoTested] = useState(false);
  const [definitions, setDefinitions] = useState<BotDefinitionRecord[]>([]);
  const [templates, setTemplates] = useState<BotDefinitionRecord[]>([]);
  const [telemetry, setTelemetry] = useState<BotTelemetry | null>(null);
  const [botLogs, setBotLogs] = useState<Array<{ id: number; level: string; event_type: string; message: string; created_at: string }>>([]);
  const [botRuns, setBotRuns] = useState<Array<{ id: number; strategy_name: string; symbol: string; status: string; realized_pnl: number; trades_placed: number; started_at: string }>>([]);

  const [executionSpeed, setExecutionSpeed] = useState<'fast' | 'normal'>('fast');
  const [barrier, setBarrier] = useState('2');
  const [growthRate, setGrowthRate] = useState('0.02');
  const [multiplier, setMultiplier] = useState('100');

  const [submitting, setSubmitting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [backtesting, setBacktesting] = useState(false);
  const [backtestReport, setBacktestReport] = useState<any>(null);
  const [showCodeModal, setShowCodeModal] = useState(false);
  const [dragPayload, setDragPayload] = useState<{ kind: 'condition' | 'action'; type: string } | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const filteredSymbols = useMemo(() => {
    const list = instruments.filter((i) => ast.market.category === 'All' || i.category === ast.market.category);
    return list.length > 0 ? list : instruments;
  }, [instruments, ast.market.category]);

  const loadDefinitionsAndLogs = useCallback(async () => {
    try {
      const [defRes, logsRes, runsRes] = await Promise.all([
        apiFetch<{ definitions: BotDefinitionRecord[]; templates: BotDefinitionRecord[] }>('/api/bots/ast/definitions'),
        apiFetch<{ logs: any[] }>('/api/bots/logs?limit=25').catch(() => ({ logs: [] })),
        apiFetch<{ runs: any[] }>('/api/bots/runs').catch(() => ({ runs: [] })),
      ]);
      setDefinitions(defRes.definitions || []);
      setTemplates(defRes.templates || []);
      setBotLogs(logsRes.logs || []);
      setBotRuns(runsRes.runs || []);
    } catch {
      // ignore if guest
    }
  }, []);

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
    loadDefinitionsAndLogs();
    const timer = setInterval(pollStatus, 2000);
    return () => clearInterval(timer);
  }, [pollStatus, loadDefinitionsAndLogs]);

  // Load strategy routed from TradingBotsPage
  useEffect(() => {
    const rawAst = sessionStorage.getItem('td_loaded_ast');
    if (rawAst) {
      sessionStorage.removeItem('td_loaded_ast');
      try {
        const parsed = JSON.parse(rawAst);
        if (parsed.ast) {
          setAst(parsed.ast);
          setDefinitionId(parsed.id || null);
          setDemoTested(Boolean(parsed.demo_tested));
        }
      } catch {
        // ignore
      }
      return;
    }

    const rawLegacy = sessionStorage.getItem('td_loaded_bot');
    if (rawLegacy) {
      sessionStorage.removeItem('td_loaded_bot');
      try {
        const s = JSON.parse(rawLegacy);
        const foundInst = instruments.find((i) => i.symbol === s.symbol);
        setAst((prev) => ({
          ...prev,
          name: s.name || prev.name,
          market: {
            instrument: s.symbol || prev.market.instrument,
            category: foundInst?.category || prev.market.category,
            timeframe: '1m',
            granularity: 60,
            contractType: s.contract_type || prev.market.contractType,
          },
          risk: {
            ...prev.risk,
            takeProfit: Number(s.config?.takeProfit ?? prev.risk.takeProfit),
            stopLoss: Number(s.config?.stopLoss ?? prev.risk.stopLoss),
            maxSessions: Number(s.config?.maxTrades ?? prev.risk.maxSessions),
            martingaleFactor: Number(s.config?.martingale ?? prev.risk.martingaleFactor),
          },
        }));
      } catch {
        // ignore
      }
    }
  }, [instruments]);

  const addCondition = (type: AnalysisType) => {
    const spec = CONDITION_CATALOG.find((c) => c.type === type);
    if (!spec) return;
    setAst((prev) => ({
      ...prev,
      conditions: [
        ...prev.conditions,
        { id: `cond_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`, type, params: { ...spec.defaultParams } },
      ],
    }));
    setDemoTested(false);
  };

  const addAction = (type: ActionType) => {
    const spec = ACTION_CATALOG.find((a) => a.type === type);
    if (!spec) return;
    setAst((prev) => ({
      ...prev,
      actions: [...prev.actions, { type, params: { ...spec.defaultParams } }],
    }));
    setDemoTested(false);
  };

  const handleCanvasDrop = (targetZone: 'condition' | 'action', e: React.DragEvent) => {
    e.preventDefault();
    const rawType = e.dataTransfer.getData('text/plain') || dragPayload?.type;
    const kind = e.dataTransfer.getData('application/x-block-kind') || dragPayload?.kind;
    if (!rawType || kind !== targetZone) return;
    if (targetZone === 'condition') addCondition(rawType as AnalysisType);
    else addAction(rawType as ActionType);
    setDragPayload(null);
  };

  const updateConditionParam = (index: number, key: string, val: string | number | boolean) => {
    setAst((prev) => {
      const copy = prev.conditions.slice();
      copy[index] = { ...copy[index], params: { ...copy[index].params, [key]: val } };
      return { ...prev, conditions: copy };
    });
    setDemoTested(false);
  };

  const moveCondition = (idx: number, dir: -1 | 1) => {
    const target = idx + dir;
    if (target < 0 || target >= ast.conditions.length) return;
    setAst((prev) => {
      const next = prev.conditions.slice();
      [next[idx], next[target]] = [next[target], next[idx]];
      return { ...prev, conditions: next };
    });
  };

  const removeCondition = (idx: number) => {
    setAst((prev) => ({ ...prev, conditions: prev.conditions.filter((_, i) => i !== idx) }));
    setDemoTested(false);
  };

  const updateActionParam = (index: number, key: string, val: string | number | boolean) => {
    setAst((prev) => {
      const copy = prev.actions.slice();
      copy[index] = { ...copy[index], params: { ...copy[index].params, [key]: val } };
      return { ...prev, actions: copy };
    });
    setDemoTested(false);
  };

  const moveAction = (idx: number, dir: -1 | 1) => {
    const target = idx + dir;
    if (target < 0 || target >= ast.actions.length) return;
    setAst((prev) => {
      const next = prev.actions.slice();
      [next[idx], next[target]] = [next[target], next[idx]];
      return { ...prev, actions: next };
    });
  };

  const removeAction = (idx: number) => {
    setAst((prev) => ({ ...prev, actions: prev.actions.filter((_, i) => i !== idx) }));
    setDemoTested(false);
  };

  const updateRisk = <K extends keyof BotRiskConfig>(key: K, val: number) => {
    setAst((prev) => ({ ...prev, risk: { ...prev.risk, [key]: val } }));
    setDemoTested(false);
  };

  const handleSaveDefinition = async (): Promise<number | null> => {
    setSaving(true);
    try {
      const xmlSource = astToBlocklyXml(ast);
      if (definitionId) {
        const res = await apiFetch<{ definition: BotDefinitionRecord }>(`/api/bots/ast/definitions/${definitionId}`, {
          method: 'PUT',
          body: JSON.stringify({ ast, xmlSource, demoTested }),
        });
        setDefinitionId(res.definition.id);
        await loadDefinitionsAndLogs();
        showToast(`Saved AST definition "${ast.name}"`, 'success');
        return res.definition.id;
      } else {
        const res = await apiFetch<{ definition: BotDefinitionRecord }>('/api/bots/ast/definitions', {
          method: 'POST',
          body: JSON.stringify({
            ast,
            description: `${ast.market.contractType} strategy on ${ast.market.instrument}`,
            category: ast.market.category,
            xmlSource,
            demoTested,
          }),
        });
        setDefinitionId(res.definition.id);
        await loadDefinitionsAndLogs();
        showToast(`Created AST definition "${ast.name}"`, 'success');
        return res.definition.id;
      }
    } catch (err) {
      showToast(sanitizeUiError(err, 'Failed to save strategy AST'), 'error');
      return null;
    } finally {
      setSaving(false);
    }
  };

  const handleBacktestDemoGate = async () => {
    setBacktesting(true);
    try {
      let idToTest = definitionId;
      if (!idToTest) {
        idToTest = await handleSaveDefinition();
      }
      if (!idToTest) return;
      const res = await apiFetch<{ ok: boolean; demoTested: boolean; report: any }>(
        `/api/bots/ast/definitions/${idToTest}/backtest`,
        {
          method: 'POST',
          body: JSON.stringify({
            symbol: ast.market.instrument,
            granularity: ast.market.granularity || 60,
          }),
        }
      );
      setDemoTested(Boolean(res.demoTested));
      setBacktestReport(res.report);
      await loadDefinitionsAndLogs();
      showToast('Historical backtest passed — Demo validation badge granted', 'success');
    } catch (err) {
      showToast(sanitizeUiError(err, 'Historical AST backtest failed'), 'error');
    } finally {
      setBacktesting(false);
    }
  };

  const handleRunBot = async () => {
    if (accountMode === 'real' && !demoTested) {
      showToast('Run Historical Demo Test first before activating Real execution.', 'error');
      return;
    }
    setSubmitting(true);
    try {
      const res = await apiFetch<{ telemetry: BotTelemetry }>('/api/bots/ast/run', {
        method: 'POST',
        body: JSON.stringify({
          definitionId,
          ast,
          barrier,
          growthRate: Number(growthRate) || 0.02,
          multiplier: Number(multiplier) || 100,
          accountMode,
          executionSpeed,
          executionMode: accountMode === 'real' && activeConnectedAccount ? 'deriv' : 'virtual',
          connectedAccountId: activeConnectedAccount?.id || null,
        }),
      });
      setTelemetry(res.telemetry);
      await Promise.all([refreshOrders(), refreshAll(), loadDefinitionsAndLogs()]);
      showToast(`${ast.name} started in ${accountMode.toUpperCase()} mode`, 'success');
    } catch (err) {
      showToast(sanitizeUiError(err, 'Failed to start strategy AST'), 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handlePauseResume = async () => {
    try {
      const endpoint = telemetry?.paused ? '/api/bots/resume' : '/api/bots/pause';
      const res = await apiFetch<{ telemetry: BotTelemetry | null }>(endpoint, { method: 'POST' });
      setTelemetry(res.telemetry);
      await loadDefinitionsAndLogs();
      showToast(telemetry?.paused ? 'Bot resumed' : 'Bot paused', 'info');
    } catch (err) {
      showToast(sanitizeUiError(err, 'Unable to change pause state'), 'error');
    }
  };

  const handleStopBot = async () => {
    try {
      const res = await apiFetch<{ telemetry: BotTelemetry | null }>('/api/bots/stop', { method: 'POST' });
      setTelemetry(res.telemetry);
      await Promise.all([refreshOrders(), refreshAll(), loadDefinitionsAndLogs()]);
      showToast('Bot engine stopped', 'info');
    } catch (err) {
      showToast(sanitizeUiError(err, 'Failed to stop bot'), 'error');
    }
  };

  const handleResetBot = async () => {
    try {
      const res = await apiFetch<{ telemetry: BotTelemetry | null }>('/api/bots/reset', { method: 'POST' });
      setTelemetry(res.telemetry);
      setAst(createDefaultAst(selectedSymbol || '1HZ100V'));
      setDefinitionId(null);
      setDemoTested(false);
      setBacktestReport(null);
      await loadDefinitionsAndLogs();
      showToast('Bot session counters and workspace blocks reset', 'info');
    } catch (err) {
      showToast(sanitizeUiError(err, 'Reset failed'), 'error');
    }
  };

  const handleKillAll = async () => {
    try {
      await apiFetch('/api/bots/kill-all', { method: 'POST' });
      await Promise.all([pollStatus(), refreshOrders(), refreshAll(), loadDefinitionsAndLogs()]);
      showToast('Emergency Kill Switch engaged: all bots halted & bot orders closed', 'info');
    } catch (err) {
      showToast(sanitizeUiError(err, 'Kill switch error'), 'error');
    }
  };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const raw = String(reader.result || '');
      if (file.name.endsWith('.json')) {
        try {
          const parsed = JSON.parse(raw);
          if (parsed?.version === '1.0' && parsed?.market && Array.isArray(parsed?.actions)) {
            setAst(parsed);
            setDefinitionId(null);
            setDemoTested(false);
            showToast(`Imported AST JSON (${file.name})`, 'success');
            return;
          }
        } catch {
          showToast('Invalid AST JSON structure', 'error');
          return;
        }
      }
      // XML import fallback
      const symMatch = raw.match(/<field\s+name=["']SYMBOL_LIST["']>([^<]+)<\/field>/i);
      const amtMatch = raw.match(/<field\s+name=["']AMOUNT["']>([^<]+)<\/field>/i);
      const typeMatch = raw.match(/<field\s+name=["']TYPE_LIST["']>([^<]+)<\/field>/i);
      const durMatch = raw.match(/<field\s+name=["']DURATION["']>([^<]+)<\/field>/i);
      const predMatch = raw.match(/<field\s+name=["']PREDICTION["']>([^<]+)<\/field>/i);
      setAst((prev) => ({
        ...prev,
        name: file.name.replace(/\.(xml|json)$/i, ''),
        market: {
          ...prev.market,
          instrument: symMatch?.[1]?.trim() || prev.market.instrument,
          contractType: typeMatch?.[1]?.trim() || prev.market.contractType,
        },
        actions: prev.actions.map((a) => {
          if (a.type === 'SET_STAKE' && amtMatch?.[1]) return { ...a, params: { stake: Number(amtMatch[1]) || 1 } };
          if (a.type === 'SET_DURATION' && durMatch?.[1]) return { ...a, params: { ...a.params, duration: Number(durMatch[1]) || 1 } };
          if ((a.type === 'BUY' || a.type === 'SELL') && predMatch?.[1]) return { ...a, params: { ...a.params, barrier: predMatch[1].trim() } };
          return a;
        }),
      }));
      setDefinitionId(null);
      setDemoTested(false);
      showToast(`Imported Blockly XML (${file.name})`, 'success');
    };
    reader.readAsText(file);
  };

  const handleExport = (fmt: 'json' | 'xml') => {
    const content = fmt === 'json' ? JSON.stringify(ast, null, 2) : astToBlocklyXml(ast);
    const mime = fmt === 'json' ? 'application/json' : 'application/xml';
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${ast.name.replace(/[^a-z0-9_-]/gi, '_')}.${fmt}`;
    a.click();
    URL.revokeObjectURL(url);
    showToast(`Exported AST ${fmt.toUpperCase()}`, 'success');
  };

  const loadDefinitionRecord = (rec: BotDefinitionRecord) => {
    try {
      const parsed = JSON.parse(rec.ast_json) as BotStrategyAst;
      setAst(parsed);
      setDefinitionId(rec.id);
      setDemoTested(Boolean(rec.demo_tested));
      setBacktestReport(null);
      showToast(`Loaded "${rec.name}" into canvas`, 'info');
    } catch {
      showToast('Corrupt definition JSON', 'error');
    }
  };

  return (
    <div className="max-w-[1600px] mx-auto px-3 sm:px-6 pt-4 pb-24 space-y-5">
      {/* Header + Persistence & File Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2.5 text-xs text-slate-500 mb-0.5">
            <span className={accountMode === 'real' ? 'text-[#FF444F] font-bold' : 'text-[#00A878] font-bold'}>
              {accountMode.toUpperCase()} ENGINE
            </span>
            <span aria-hidden="true">·</span>
            <span className={demoTested ? 'text-[#00A878] font-semibold' : 'text-amber-500 font-semibold'}>
              {demoTested ? 'Demo Validation Verified' : 'Demo Backtest Required for Real Mode'}
            </span>
          </div>
          <h1 className="font-display text-xl sm:text-2xl font-bold">Visual Blockly AST Strategy Builder</h1>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input ref={fileRef} type="file" accept=".json,.xml" onChange={handleImportFile} className="hidden" />
          <input
            type="text"
            value={ast.name}
            onChange={(e) => {
              setAst((prev) => ({ ...prev, name: e.target.value }));
              setDemoTested(false);
            }}
            aria-label="Strategy Name"
            className="px-3 py-2 rounded-xl bg-white dark:bg-[#181C25] border border-slate-200 dark:border-[#2A2F3D] text-xs font-bold w-44"
          />
          <button
            type="button"
            onClick={handleSaveDefinition}
            disabled={saving}
            className="px-3.5 py-2 rounded-xl bg-[#1958B7] hover:bg-[#144694] text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50 whitespace-nowrap"
          >
            <Save className="w-3.5 h-3.5" /> {saving ? 'Saving...' : 'Save'}
          </button>
          <button
            type="button"
            onClick={handleBacktestDemoGate}
            disabled={backtesting}
            className="px-3.5 py-2 rounded-xl bg-[#F4F5F7] dark:bg-[#181C25] border border-slate-200 dark:border-[#2A2F3D] text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer hover:border-[#00A878] whitespace-nowrap"
          >
            <FlaskConical className="w-3.5 h-3.5 text-[#00A878]" />
            {backtesting ? 'Testing...' : 'Demo Backtest'}
          </button>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="px-3 py-2 rounded-xl bg-[#F4F5F7] dark:bg-[#181C25] border border-slate-200 dark:border-[#2A2F3D] text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
          >
            <Upload className="w-3.5 h-3.5" /> Import
          </button>
          <button
            type="button"
            onClick={() => handleExport('json')}
            className="px-3 py-2 rounded-xl bg-[#F4F5F7] dark:bg-[#181C25] border border-slate-200 dark:border-[#2A2F3D] text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5" /> JSON
          </button>
          <button
            type="button"
            onClick={() => handleExport('xml')}
            className="px-3 py-2 rounded-xl bg-[#F4F5F7] dark:bg-[#181C25] border border-slate-200 dark:border-[#2A2F3D] text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5" /> XML
          </button>
          <button
            type="button"
            onClick={() => setShowCodeModal((v) => !v)}
            className="px-3 py-2 rounded-xl bg-[#F4F5F7] dark:bg-[#181C25] border border-slate-200 dark:border-[#2A2F3D] text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
          >
            <Code2 className="w-3.5 h-3.5" /> AST
          </button>
          <button
            type="button"
            onClick={() => setQuickStratOpen((v) => !v)}
            className={`px-3 py-2 rounded-xl border text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
              quickStratOpen
                ? 'bg-[#FF444F] text-white border-[#FF444F]'
                : 'bg-[#F4F5F7] dark:bg-[#181C25] border-slate-200 dark:border-[#2A2F3D]'
            }`}
          >
            <Layers className="w-3.5 h-3.5" /> Quick Strategies (17 XML)
          </button>
          <button
            type="button"
            onClick={() => setShowLiveChart((v) => !v)}
            className={`px-3 py-2 rounded-xl border text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
              showLiveChart
                ? 'bg-[#00A878]/10 text-[#00A878] border-[#00A878]/40'
                : 'bg-[#F4F5F7] dark:bg-[#181C25] border-slate-200 dark:border-[#2A2F3D]'
            }`}
          >
            <CandlestickChart className="w-3.5 h-3.5" /> Live Candles
          </button>
          <button
            type="button"
            onClick={() => {
              setSelectedSymbol(ast.market.instrument);
              setActiveTab('mt5-tv');
            }}
            className="p-2 rounded-xl bg-[#F4F5F7] dark:bg-[#181C25] border border-slate-200 dark:border-[#2A2F3D] text-slate-600 dark:text-slate-300 hover:text-[#FF444F] cursor-pointer"
            title="Open Full MT5 TradingView"
          >
            <Activity className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 17 Official Deriv Bot Quick Strategies Panel (Unpacked from bot-app.zip) */}
      {quickStratOpen && (
        <div className="bg-white dark:bg-[#181C25] rounded-2xl border border-slate-200 dark:border-[#2A2F3D] p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="font-display text-sm font-bold">Official Deriv Bot Quick Strategies (17 XML Templates)</h2>
              <p className="text-[11px] text-slate-500">
                Martingale, D&apos;Alembert, Oscar&apos;s Grind, 1-3-2-6, Reverse &amp; Accumulators strategies from Deriv Bot.
              </p>
            </div>
            <div className="inline-flex items-center gap-1 bg-[#F4F5F7] dark:bg-[#111319] p-1 rounded-lg text-xs">
              {(['All', 'Classic', 'Accumulators'] as const).map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setQuickStratCat(c)}
                  className={`px-3 py-1 rounded-md font-semibold cursor-pointer ${
                    quickStratCat === c
                      ? 'bg-[#FF444F] text-white'
                      : 'text-slate-500 hover:text-[#0E1117] dark:hover:text-white'
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 max-h-80 overflow-y-auto pr-1">
            {DERIV_QUICK_STRATEGIES.filter((s) => quickStratCat === 'All' || s.category === quickStratCat).map(
              (strat: DerivQuickStrategy) => (
                <div
                  key={strat.id}
                  className="p-3 rounded-xl bg-[#F8F9FB] dark:bg-[#111319] border border-slate-200 dark:border-[#2A2F3D] flex flex-col justify-between gap-2.5"
                >
                  <div>
                    <div className="flex items-center justify-between gap-1 text-[10px] text-slate-400 font-mono-num">
                      <span>{strat.category}</span>
                      <span>{strat.defaultContractType}</span>
                    </div>
                    <h3 className="font-display text-xs font-bold mt-0.5">{strat.name}</h3>
                    <p className="text-[11px] text-slate-500 mt-1 line-clamp-2">{strat.description}</p>
                  </div>
                  <div className="flex items-center gap-1.5 text-[11px]">
                    <button
                      type="button"
                      onClick={() => {
                        const nextAst = quickStrategyToAst(strat);
                        setAst(nextAst);
                        setDefinitionId(null);
                        setDemoTested(false);
                        if (strat.defaultGrowthRate) setGrowthRate(String(strat.defaultGrowthRate));
                        setQuickStratOpen(false);
                        showToast(`Loaded "${strat.name}" into Visual Bot Builder`, 'success');
                      }}
                      className="flex-1 py-1.5 rounded-lg bg-[#FF444F] hover:bg-[#E63946] text-white font-bold cursor-pointer"
                    >
                      Load Bot
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          const xml = await fetchQuickStrategyXml(strat.xmlFile);
                          const blob = new Blob([xml], { type: 'application/xml' });
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement('a');
                          a.href = url;
                          a.download = strat.xmlFile;
                          a.click();
                          URL.revokeObjectURL(url);
                          showToast(`Downloaded ${strat.xmlFile}`, 'success');
                        } catch {
                          showToast(`Failed to download ${strat.xmlFile}`, 'error');
                        }
                      }}
                      className="px-2.5 py-1.5 rounded-lg bg-white dark:bg-[#181C25] border border-slate-200 dark:border-[#2A2F3D] font-semibold cursor-pointer"
                      title={`Download ${strat.xmlFile}`}
                    >
                      XML
                    </button>
                  </div>
                </div>
              )
            )}
          </div>
        </div>
      )}

      {/* Live Lightweight Charts Candlestick & Bot Execution Monitor */}
      {showLiveChart && (
        <div className="bg-white dark:bg-[#181C25] rounded-2xl border border-slate-200 dark:border-[#2A2F3D] p-4 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs">
              <span className="font-display font-bold text-sm">
                Live Bot Candlestick Chart · {ast.market.instrument}
              </span>
              {telemetry?.running && (
                <span className="px-2 py-0.5 rounded-full bg-[#00A878]/15 text-[#00A878] text-[10px] font-bold">
                  AUTO BOT ACTIVE · {telemetry.tradesPlaced} TRADES · P/L{' '}
                  {telemetry.realizedPnl >= 0 ? '+' : ''}${Number(telemetry.realizedPnl || 0).toFixed(2)}
                </span>
              )}
            </div>
            <span className="text-[11px] text-slate-500">
              Live entries, SL/TP &amp; bot markers plotted directly on candles
            </span>
          </div>
          <TemplateChart
            symbol={ast.market.instrument}
            granularity={ast.market.granularity || 60}
            showControls
            onGranularityChange={(g) => {
              const tfLabel =
                Object.entries(TIMEFRAME_GRANULARITY).find(([, val]) => val === g)?.[0] || '1m';
              setAst((prev) => ({
                ...prev,
                market: { ...prev.market, granularity: g, timeframe: tfLabel },
              }));
            }}
            openOrders={orders.filter(
              (o) =>
                o.status === 'OPEN' &&
                o.symbol === ast.market.instrument &&
                (o.account_mode || (o.execution_mode === 'deriv' ? 'real' : 'demo')) === accountMode
            )}
            recentOrders={orders.filter((o) => o.symbol === ast.market.instrument).slice(0, 15)}
            heightClass="h-[260px] sm:h-[310px]"
          />
        </div>
      )}

      {/* AST JSON / XML Preview Strip */}
      {showCodeModal && (
        <div className="bg-[#111319] text-slate-200 rounded-2xl border border-[#2A2F3D] p-4 grid grid-cols-1 lg:grid-cols-2 gap-4 text-xs">
          <div>
            <p className="font-semibold text-slate-400 mb-1.5">Validated AST v1.0 Payload (Zero eval)</p>
            <pre className="p-3 rounded-xl bg-[#181C25] overflow-auto max-h-56 font-mono text-[11px]">
              {JSON.stringify(ast, null, 2)}
            </pre>
          </div>
          <div>
            <p className="font-semibold text-slate-400 mb-1.5">Generated Blockly XML</p>
            <pre className="p-3 rounded-xl bg-[#181C25] overflow-auto max-h-56 font-mono text-[11px]">
              {astToBlocklyXml(ast)}
            </pre>
          </div>
        </div>
      )}

      {/* Main 3-Zone Visual Blockly Builder */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-start">
        {/* LEFT TOOLBOX PALETTE (3 cols) */}
        <aside className="xl:col-span-3 bg-white dark:bg-[#181C25] rounded-2xl border border-slate-200 dark:border-[#2A2F3D] p-4 space-y-4">
          <div>
            <h2 className="font-display text-sm font-bold flex items-center gap-1.5">
              <Layers className="w-4 h-4 text-[#1958B7]" /> Draggable Block Toolbox
            </h2>
            <p className="text-[11px] text-slate-500 mt-0.5">Drag or click blocks to append to canvas.</p>
          </div>

          <div className="space-y-1.5">
            <p className="text-[11px] font-bold text-slate-500">Market Analysis Blocks (8)</p>
            {CONDITION_CATALOG.map((item) => (
              <div
                key={item.type}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData('text/plain', item.type);
                  e.dataTransfer.setData('application/x-block-kind', 'condition');
                  setDragPayload({ kind: 'condition', type: item.type });
                }}
                onClick={() => addCondition(item.type)}
                className="px-3 py-2 rounded-xl bg-[#F8F9FB] dark:bg-[#111319] border border-slate-200 dark:border-[#2A2F3D] hover:border-[#1958B7] text-xs font-semibold flex items-center justify-between cursor-grab active:cursor-grabbing"
              >
                <span>{item.label}</span>
                <Plus className="w-3.5 h-3.5 text-[#1958B7]" />
              </div>
            ))}
          </div>

          <div className="space-y-1.5 pt-2 border-t border-slate-100 dark:border-[#2A2F3D]">
            <p className="text-[11px] font-bold text-slate-500">Trading Action Blocks (7)</p>
            {ACTION_CATALOG.map((item) => (
              <div
                key={item.type}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData('text/plain', item.type);
                  e.dataTransfer.setData('application/x-block-kind', 'action');
                  setDragPayload({ kind: 'action', type: item.type });
                }}
                onClick={() => addAction(item.type)}
                className="px-3 py-2 rounded-xl bg-[#F8F9FB] dark:bg-[#111319] border border-slate-200 dark:border-[#2A2F3D] hover:border-[#00A878] text-xs font-semibold flex items-center justify-between cursor-grab active:cursor-grabbing"
              >
                <span>{item.label}</span>
                <Plus className="w-3.5 h-3.5 text-[#00A878]" />
              </div>
            ))}
          </div>

          {/* Saved Personal Strategies & Templates */}
          {(definitions.length > 0 || templates.length > 0) && (
            <div className="space-y-1.5 pt-2 border-t border-slate-100 dark:border-[#2A2F3D]">
              <p className="text-[11px] font-bold text-slate-500">Saved AST Library ({definitions.length + templates.length})</p>
              <div className="max-h-48 overflow-y-auto divide-y divide-slate-100 dark:divide-[#2A2F3D]">
                {[...definitions, ...templates].slice(0, 10).map((rec) => (
                  <button
                    key={rec.id}
                    type="button"
                    onClick={() => loadDefinitionRecord(rec)}
                    className="w-full py-2 text-left text-xs hover:text-[#FF444F] flex items-center justify-between gap-2 cursor-pointer"
                  >
                    <span className="font-semibold truncate">{rec.name}</span>
                    <span className="text-[10px] font-mono tabular-nums text-slate-400 shrink-0">
                      {rec.demo_tested ? 'Verified' : 'Draft'}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </aside>

        {/* CENTER STRUCTURED AST WORKSPACE (6 cols) */}
        <section className="xl:col-span-6 space-y-4">
          {/* Block 1: Market Selection */}
          <div className="rounded-2xl overflow-hidden border border-slate-200 dark:border-[#2A2F3D] bg-white dark:bg-[#181C25]">
            <div className="px-4 py-2.5 bg-[#151820] text-white flex items-center justify-between">
              <span className="font-display text-sm font-bold">1. Market Selection Block</span>
              <span className="text-[11px] font-mono tabular-nums text-slate-300">
                {ast.market.instrument} · {ast.market.contractType}
              </span>
            </div>
            <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block text-[11px] text-slate-500 mb-1">Market Category</label>
                <select
                  value={ast.market.category}
                  onChange={(e) => {
                    const cat = e.target.value;
                    setAst((prev) => ({ ...prev, market: { ...prev.market, category: cat } }));
                  }}
                  className="w-full px-3 py-2 rounded-xl bg-[#F4F5F7] dark:bg-[#111319] font-semibold"
                >
                  <option value="Synthetic">Synthetic</option>
                  <option value="Forex">Forex</option>
                  <option value="Crypto">Crypto</option>
                  <option value="Metals/Cmd">Metals / Cmd</option>
                  <option value="Indices">Indices</option>
                  <option value="All">All Markets</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] text-slate-500 mb-1">Instrument</label>
                <select
                  value={ast.market.instrument}
                  onChange={(e) => {
                    const sym = e.target.value;
                    setAst((prev) => ({ ...prev, market: { ...prev.market, instrument: sym } }));
                    setDemoTested(false);
                  }}
                  className="w-full px-3 py-2 rounded-xl bg-[#F4F5F7] dark:bg-[#111319] font-semibold"
                >
                  {filteredSymbols.map((inst: MarketInstrument) => (
                    <option key={inst.symbol} value={inst.symbol}>
                      {inst.display_name} ({inst.symbol})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] text-slate-500 mb-1">Timeframe</label>
                <select
                  value={ast.market.timeframe}
                  onChange={(e) => {
                    const tf = e.target.value;
                    setAst((prev) => ({
                      ...prev,
                      market: { ...prev.market, timeframe: tf, granularity: TIMEFRAME_GRANULARITY[tf] || 60 },
                    }));
                    setDemoTested(false);
                  }}
                  className="w-full px-3 py-2 rounded-xl bg-[#F4F5F7] dark:bg-[#111319] font-mono tabular-nums font-semibold"
                >
                  {Object.keys(TIMEFRAME_GRANULARITY).map((tf) => (
                    <option key={tf} value={tf}>
                      {tf}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] text-slate-500 mb-1">Contract Type</label>
                <select
                  value={ast.market.contractType}
                  onChange={(e) => {
                    const ct = e.target.value;
                    setAst((prev) => ({ ...prev, market: { ...prev.market, contractType: ct } }));
                    setDemoTested(false);
                  }}
                  className="w-full px-3 py-2 rounded-xl bg-[#F4F5F7] dark:bg-[#111319] font-bold"
                >
                  {CONTRACT_OPTIONS.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] text-slate-500 mb-1">Digit Barrier / Multiplier / Accu Growth</label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={barrier}
                    onChange={(e) => setBarrier(e.target.value)}
                    placeholder="Barrier"
                    className="w-20 px-2.5 py-2 rounded-xl bg-[#F4F5F7] dark:bg-[#111319] font-mono tabular-nums font-bold text-center"
                  />
                  <input
                    type="number"
                    value={multiplier}
                    onChange={(e) => setMultiplier(e.target.value)}
                    placeholder="x100"
                    className="w-20 px-2.5 py-2 rounded-xl bg-[#F4F5F7] dark:bg-[#111319] font-mono tabular-nums font-bold text-center"
                  />
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    max="0.05"
                    value={growthRate}
                    onChange={(e) => setGrowthRate(e.target.value)}
                    placeholder="0.02"
                    className="w-20 px-2.5 py-2 rounded-xl bg-[#F4F5F7] dark:bg-[#111319] font-mono tabular-nums font-bold text-center"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Block 2: Market Analysis Dropzone */}
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => handleCanvasDrop('condition', e)}
            className="rounded-2xl overflow-hidden border border-slate-200 dark:border-[#2A2F3D] bg-white dark:bg-[#181C25]"
          >
            <div className="px-4 py-2.5 bg-[#1958B7] text-white flex items-center justify-between gap-2">
              <span className="font-display text-sm font-bold">2. Analysis Condition Blocks ({ast.conditions.length})</span>
              <div className="flex items-center gap-1.5 text-xs">
                <span>Match:</span>
                {(['ALL', 'ANY'] as const).map((logic) => (
                  <button
                    key={logic}
                    type="button"
                    onClick={() => setAst((prev) => ({ ...prev, conditionLogic: logic }))}
                    className={`px-2 py-0.5 rounded font-bold cursor-pointer ${
                      ast.conditionLogic === logic ? 'bg-white text-[#1958B7]' : 'bg-white/15 text-white'
                    }`}
                  >
                    {logic}
                  </button>
                ))}
              </div>
            </div>

            <div className="p-4 space-y-2.5">
              {ast.conditions.length === 0 ? (
                <div className="py-6 text-center text-xs text-slate-400 border border-dashed border-slate-300 dark:border-[#2A2F3D] rounded-xl">
                  Drag analysis blocks here from the toolbox or evaluate every incoming tick.
                </div>
              ) : (
                ast.conditions.map((cond, idx) => {
                  const label = CONDITION_CATALOG.find((c) => c.type === cond.type)?.label || cond.type;
                  return (
                    <div
                      key={cond.id}
                      className="p-3 rounded-xl bg-[#F8F9FB] dark:bg-[#111319] border border-slate-200 dark:border-[#2A2F3D] flex flex-wrap items-center justify-between gap-2 text-xs"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-bold text-[#1958B7]">{label}</span>
                        {Object.entries(cond.params).map(([k, v]) => (
                          <label key={k} className="inline-flex items-center gap-1 text-[11px] text-slate-500">
                            <span>{k}:</span>
                            <input
                              type={typeof v === 'number' ? 'number' : 'text'}
                              value={String(v)}
                              onChange={(e) =>
                                updateConditionParam(
                                  idx,
                                  k,
                                  typeof v === 'number' ? Number(e.target.value) : e.target.value
                                )
                              }
                              className="w-20 px-2 py-1 rounded bg-white dark:bg-[#181C25] border border-slate-200 dark:border-[#2A2F3D] font-mono tabular-nums font-bold text-[#0E1117] dark:text-white"
                            />
                          </label>
                        ))}
                      </div>
                      <div className="flex items-center gap-1">
                        <button type="button" onClick={() => moveCondition(idx, -1)} className="p-1 text-slate-400 hover:text-[#1958B7] cursor-pointer">
                          <ArrowUp className="w-3.5 h-3.5" />
                        </button>
                        <button type="button" onClick={() => moveCondition(idx, 1)} className="p-1 text-slate-400 hover:text-[#1958B7] cursor-pointer">
                          <ArrowDown className="w-3.5 h-3.5" />
                        </button>
                        <button type="button" onClick={() => removeCondition(idx)} className="p-1 text-slate-400 hover:text-[#FF444F] cursor-pointer">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Block 3: Trading Action Dropzone */}
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => handleCanvasDrop('action', e)}
            className="rounded-2xl overflow-hidden border border-slate-200 dark:border-[#2A2F3D] bg-white dark:bg-[#181C25]"
          >
            <div className="px-4 py-2.5 bg-[#00A878] text-white flex items-center justify-between">
              <span className="font-display text-sm font-bold">3. Trading Action Sequence ({ast.actions.length})</span>
              <span className="text-[11px]">Drop Buy / Sell / Set Stake / Duration / Outcome blocks</span>
            </div>
            <div className="p-4 space-y-2.5">
              {ast.actions.map((act, idx) => (
                <div
                  key={`${act.type}-${idx}`}
                  className="p-3 rounded-xl bg-[#F8F9FB] dark:bg-[#111319] border border-slate-200 dark:border-[#2A2F3D] flex flex-wrap items-center justify-between gap-2 text-xs"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono font-bold text-[#00A878]">{act.type}</span>
                    {Object.entries(act.params).map(([k, v]) => (
                      <label key={k} className="inline-flex items-center gap-1 text-[11px] text-slate-500">
                        <span>{k}:</span>
                        <input
                          type={typeof v === 'number' ? 'number' : 'text'}
                          value={String(v)}
                          onChange={(e) =>
                            updateActionParam(idx, k, typeof v === 'number' ? Number(e.target.value) : e.target.value)
                          }
                          className="w-20 px-2 py-1 rounded bg-white dark:bg-[#181C25] border border-slate-200 dark:border-[#2A2F3D] font-mono tabular-nums font-bold text-[#0E1117] dark:text-white"
                        />
                      </label>
                    ))}
                  </div>
                  <div className="flex items-center gap-1">
                    <button type="button" onClick={() => moveAction(idx, -1)} className="p-1 text-slate-400 hover:text-[#00A878] cursor-pointer">
                      <ArrowUp className="w-3.5 h-3.5" />
                    </button>
                    <button type="button" onClick={() => moveAction(idx, 1)} className="p-1 text-slate-400 hover:text-[#00A878] cursor-pointer">
                      <ArrowDown className="w-3.5 h-3.5" />
                    </button>
                    <button type="button" onClick={() => removeAction(idx)} className="p-1 text-slate-400 hover:text-[#FF444F] cursor-pointer">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Block 4: 8-Field Risk Management Guardrails */}
          <div className="rounded-2xl overflow-hidden border border-slate-200 dark:border-[#2A2F3D] bg-white dark:bg-[#181C25]">
            <div className="px-4 py-2.5 bg-[#151820] text-white flex items-center justify-between">
              <span className="font-display text-sm font-bold">4. Risk Management Guardrails</span>
              <span className="text-[11px] text-slate-300">Server-Enforced Caps</span>
            </div>
            <div className="p-4 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              {(
                [
                  { key: 'maxStake', label: 'Max Stake ($)', step: 0.5 },
                  { key: 'maxDailyLoss', label: 'Max Daily Loss ($)', step: 1 },
                  { key: 'takeProfit', label: 'Take Profit ($)', step: 1 },
                  { key: 'stopLoss', label: 'Stop Loss ($)', step: 1 },
                  { key: 'cooldownSeconds', label: 'Cooldown (s)', step: 1 },
                  { key: 'maxConsecutiveLosses', label: 'Max Consec. Losses', step: 1 },
                  { key: 'maxSessions', label: 'Max Sessions / Trades', step: 1 },
                  { key: 'martingaleFactor', label: 'Martingale (1–4x)', step: 0.1 },
                ] as Array<{ key: keyof BotRiskConfig; label: string; step: number }>
              ).map((rf) => (
                <div key={rf.key}>
                  <label className="block text-[11px] text-slate-500 mb-1">{rf.label}</label>
                  <input
                    type="number"
                    step={rf.step}
                    value={ast.risk[rf.key]}
                    onChange={(e) => updateRisk(rf.key, Number(e.target.value))}
                    className="w-full px-2.5 py-2 rounded-xl bg-[#F4F5F7] dark:bg-[#111319] font-mono tabular-nums font-bold"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Backtest Result Box */}
          {backtestReport && (
            <div className="rounded-2xl border border-[#00A878]/40 bg-white dark:bg-[#181C25] p-4 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div>
                <p className="text-slate-500">Demo Backtest Trades</p>
                <p className="font-mono tabular-nums font-bold text-base">{backtestReport.trades ?? 0}</p>
              </div>
              <div>
                <p className="text-slate-500">Historical Win Rate</p>
                <p className="font-mono tabular-nums font-bold text-base">{backtestReport.winRatePct ?? 0}%</p>
              </div>
              <div>
                <p className="text-slate-500">Simulated Net P/L</p>
                <p className={`font-mono tabular-nums font-bold text-base ${(backtestReport.netPnlUsd || 0) >= 0 ? 'text-[#00A878]' : 'text-[#FF444F]'}`}>
                  ${Number(backtestReport.netPnlUsd || 0).toFixed(2)}
                </p>
              </div>
              <div>
                <p className="text-slate-500">Candles Evaluated</p>
                <p className="font-mono tabular-nums font-bold text-base">{backtestReport.candleCount ?? 0}</p>
              </div>
            </div>
          )}
        </section>

        {/* RIGHT PERSISTENT TELEMETRY, LOGS & KILL SWITCH (3 cols) */}
        <section className="xl:col-span-3 space-y-4">
          <div className="bg-[#151820] text-white rounded-2xl border border-[#2A2F3D] p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-[#00A878]" />
                <h2 className="font-display text-sm font-bold">Live Telemetry</h2>
              </div>
              <span className="font-mono text-xs uppercase text-slate-300">{telemetry?.status || 'idle'}</span>
            </div>

            <div className="grid grid-cols-2 gap-2.5 text-xs">
              <div className="p-3 rounded-xl bg-[#1A1D26] border border-[#2A2F3D]">
                <p className="text-[11px] text-slate-400">Realized P/L</p>
                <p className={`font-mono tabular-nums text-lg font-bold ${(telemetry?.realizedPnl || 0) >= 0 ? 'text-[#00A878]' : 'text-[#FF444F]'}`}>
                  {(telemetry?.realizedPnl || 0) >= 0 ? '+' : ''}
                  {(telemetry?.realizedPnl || 0).toFixed(2)}
                </p>
              </div>
              <div className="p-3 rounded-xl bg-[#1A1D26] border border-[#2A2F3D]">
                <p className="text-[11px] text-slate-400">Current Stake</p>
                <p className="font-mono tabular-nums text-lg font-bold">${(telemetry?.currentStake ?? 1).toFixed(2)}</p>
              </div>
              <div className="p-3 rounded-xl bg-[#1A1D26] border border-[#2A2F3D]">
                <p className="text-[11px] text-slate-400">Wins / Losses</p>
                <p className="font-mono tabular-nums text-sm font-bold flex items-center gap-2 mt-1">
                  <span className="text-[#00A878] inline-flex items-center gap-0.5">
                    <CheckCircle2 className="w-3.5 h-3.5" /> {telemetry?.wins || 0}
                  </span>
                  <span className="text-[#FF444F] inline-flex items-center gap-0.5">
                    <XCircle className="w-3.5 h-3.5" /> {telemetry?.losses || 0}
                  </span>
                </p>
              </div>
              <div className="p-3 rounded-xl bg-[#1A1D26] border border-[#2A2F3D]">
                <p className="text-[11px] text-slate-400">Ticks / Consec. L</p>
                <p className="font-mono tabular-nums text-sm font-bold mt-1">
                  {telemetry?.tickCount || 0} / {telemetry?.consecutiveLosses || 0}
                </p>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-[#1A1D26] border border-[#2A2F3D] text-xs font-mono tabular-nums text-slate-300">
              {telemetry?.lastSignal || 'Ready. Assemble AST blocks or click Start.'}
            </div>

            <button
              type="button"
              onClick={handleKillAll}
              className="w-full py-2.5 px-3 rounded-xl bg-[#FF444F]/15 border border-[#FF444F]/40 hover:bg-[#FF444F] text-[#FF444F] hover:text-white text-xs font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
            >
              <ShieldAlert className="w-4 h-4" /> Emergency Kill Switch
            </button>
          </div>

          {/* Execution Audit Logs */}
          <div className="bg-white dark:bg-[#181C25] rounded-2xl border border-slate-200 dark:border-[#2A2F3D] p-4 space-y-2.5">
            <h3 className="text-xs font-bold">Recent Bot Execution Logs ({botLogs.length})</h3>
            <div className="max-h-60 overflow-y-auto divide-y divide-slate-100 dark:divide-[#2A2F3D] text-[11px]">
              {botLogs.length === 0 ? (
                <p className="text-slate-400 py-3">No execution events logged yet.</p>
              ) : (
                botLogs.map((log) => (
                  <div key={log.id} className="py-1.5 space-y-0.5">
                    <div className="flex items-center justify-between text-slate-400 font-mono tabular-nums">
                      <span className={log.level === 'error' ? 'text-[#FF444F] font-bold' : 'text-[#00A878] font-bold'}>
                        {log.event_type}
                      </span>
                      <span>{new Date(log.created_at).toLocaleTimeString()}</span>
                    </div>
                    <p className="text-slate-600 dark:text-slate-300">{log.message}</p>
                  </div>
                ))
              )}
            </div>
          </div>

          {botRuns.length > 0 && (
            <div className="bg-white dark:bg-[#181C25] rounded-2xl border border-slate-200 dark:border-[#2A2F3D] p-4 space-y-2">
              <h3 className="text-xs font-bold">Recent Runs</h3>
              <div className="divide-y divide-slate-100 dark:divide-[#2A2F3D] text-[11px]">
                {botRuns.slice(0, 5).map((r) => (
                  <div key={r.id} className="py-1.5 flex items-center justify-between gap-2">
                    <span className="truncate font-semibold">
                      {r.strategy_name} · {r.symbol}
                    </span>
                    <span className="font-mono tabular-nums shrink-0">
                      ${Number(r.realized_pnl || 0).toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      </div>

      {/* Bottom Sticky Complete Execution Bar: Start, Pause/Resume, Stop, Reset, Speed */}
      <div className="sticky bottom-16 lg:bottom-3 z-20 bg-white/95 dark:bg-[#151820]/95 backdrop-blur-md border border-slate-200 dark:border-[#2A2F3D] rounded-2xl px-4 py-2.5 shadow-lg flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {!telemetry?.running ? (
            <button
              type="button"
              disabled={submitting}
              onClick={handleRunBot}
              className="px-4 py-2 rounded-xl bg-[#00A878] hover:bg-[#00966B] text-white font-bold text-xs inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              {submitting ? 'Starting...' : 'Start Bot'}
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={handlePauseResume}
                className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs inline-flex items-center gap-1.5 cursor-pointer"
              >
                {telemetry.paused ? <Play className="w-3.5 h-3.5 fill-current" /> : <Pause className="w-3.5 h-3.5" />}
                {telemetry.paused ? 'Resume' : 'Pause'}
              </button>
              <button
                type="button"
                onClick={handleStopBot}
                className="px-4 py-2 rounded-xl bg-[#FF444F] hover:bg-[#E63946] text-white font-bold text-xs inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Square className="w-3.5 h-3.5 fill-current" />
                Stop
              </button>
            </>
          )}

          <button
            type="button"
            onClick={handleResetBot}
            className="px-3.5 py-2 rounded-xl bg-[#F4F5F7] dark:bg-[#111319] border border-slate-200 dark:border-[#2A2F3D] text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" /> Reset
          </button>

          <span className="text-xs text-slate-500 font-mono tabular-nums pl-2">
            {telemetry?.running
              ? `${telemetry.paused ? 'Paused' : 'Running'} · ${telemetry.tradesPlaced} trades · $${telemetry.realizedPnl.toFixed(2)}`
              : 'Idle'}
          </span>
        </div>

        <button
          type="button"
          onClick={() => setExecutionSpeed((s) => (s === 'fast' ? 'normal' : 'fast'))}
          className="px-3 py-1.5 rounded-xl bg-[#F4F5F7] dark:bg-[#111319] border border-slate-200 dark:border-[#2A2F3D] text-xs font-bold cursor-pointer"
        >
          Speed: {executionSpeed.toUpperCase()}
        </button>
      </div>
    </div>
  );
};
