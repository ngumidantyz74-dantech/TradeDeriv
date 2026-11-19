import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  Play,
  Square,
  Upload,
  Download,
  Trash2,
  Activity,
  Zap,
  CheckCircle2,
  XCircle,
  RotateCcw,
  CandlestickChart,
  ChevronRight,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { apiFetch } from '../lib/api';
import type { BotTelemetry, MarketInstrument } from '../types';

type TradeTypeGroup =
  | 'Digits > Over/Under'
  | 'Digits > Even/Odd'
  | 'Digits > Match/Differ'
  | 'Options > Rise/Fall'
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
  'CFDs > Multipliers': [
    { value: 'MULTUP', label: 'Multiplier Up' },
    { value: 'MULTDOWN', label: 'Multiplier Down' },
  ],
};

function inferGroupFromContract(ct: string): TradeTypeGroup {
  if (ct === 'DIGITEVEN' || ct === 'DIGITODD') return 'Digits > Even/Odd';
  if (ct === 'DIGITMATCH' || ct === 'DIGITDIFF') return 'Digits > Match/Differ';
  if (ct === 'CALL' || ct === 'PUT') return 'Options > Rise/Fall';
  if (ct === 'MULTUP' || ct === 'MULTDOWN') return 'CFDs > Multipliers';
  return 'Digits > Over/Under';
}

export const BotBuilderPage: React.FC = () => {
  const {
    instruments,
    selectedSymbol,
    accountMode,
    activeConnectedAccount,
    setActiveTab,
    setSelectedSymbol,
    refreshOrders,
    refreshAll,
    showToast,
  } = useApp();

  // Block 1: Trade parameters
  const [strategyName, setStrategyName] = useState('07_Over_Hit_n_Run');
  const [marketCategory, setMarketCategory] = useState<'All' | MarketInstrument['category']>('Synthetic');
  const [symbol, setSymbol] = useState(selectedSymbol || '1HZ100V');
  const [alternateMarkets, setAlternateMarkets] = useState(false);
  const [tradeTypeGroup, setTradeTypeGroup] = useState<TradeTypeGroup>('Digits > Over/Under');
  const [contractType, setContractType] = useState('DIGITOVER');
  const [candleInterval, setCandleInterval] = useState<'1t' | '1m' | '5m' | '15m'>('1m');
  const [restartBuySellOnError, setRestartBuySellOnError] = useState(false);
  const [virtualHook, setVirtualHook] = useState(false);
  const [restartLastTradeOnError, setRestartLastTradeOnError] = useState(true);

  // Run once at start
  const [baseStake, setBaseStake] = useState('1.0');
  const [barrier, setBarrier] = useState('2');
  const [recoveryPrediction, setRecoveryPrediction] = useState('5');
  const [martingale, setMartingale] = useState('2.1');
  const [useMartingale, setUseMartingale] = useState<'true' | 'false'>('true');
  const [takeProfit, setTakeProfit] = useState('6');
  const [stopLoss, setStopLoss] = useState('3');
  const [maxTrades, setMaxTrades] = useState('15');
  const [multiplier, setMultiplier] = useState('100');

  // Trade options
  const [duration, setDuration] = useState('1');
  const [durationUnit, setDurationUnit] = useState('t');
  const [tradeEachTick, setTradeEachTick] = useState(true);

  // Block 2: Purchase conditions
  const [entryCondition, setEntryCondition] = useState<'any_tick' | 'last_digit_gte' | 'last_digit_lte' | 'rsi_signal'>(
    'last_digit_gte'
  );
  const [conditionDigit, setConditionDigit] = useState('2');
  const [allowBulk, setAllowBulk] = useState<'No' | 'Yes'>('No');
  const [bulkCount, setBulkCount] = useState('1');

  // Bottom bar execution speed toggle
  const [executionSpeed, setExecutionSpeed] = useState<'fast' | 'normal'>('fast');

  const [telemetry, setTelemetry] = useState<BotTelemetry | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const filteredSymbols = useMemo(() => {
    if (marketCategory === 'All') return instruments;
    const list = instruments.filter((i) => i.category === marketCategory);
    return list.length > 0 ? list : instruments;
  }, [instruments, marketCategory]);

  // Check if a strategy was loaded from TradingBotsPage
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
    const timer = setInterval(pollStatus, 2000);
    return () => clearInterval(timer);
  }, [pollStatus]);

  const handleGroupChange = (group: TradeTypeGroup) => {
    setTradeTypeGroup(group);
    const first = TRADE_TYPE_OPTIONS[group][0];
    if (first) setContractType(first.value);
  };

  const handleResetDefaults = () => {
    setStrategyName('07_Over_Hit_n_Run');
    setMarketCategory('Synthetic');
    setSymbol('1HZ100V');
    setTradeTypeGroup('Digits > Over/Under');
    setContractType('DIGITOVER');
    setBaseStake('1.0');
    setBarrier('2');
    setRecoveryPrediction('5');
    setMartingale('2.1');
    setUseMartingale('true');
    setTakeProfit('6');
    setStopLoss('3');
    setMaxTrades('15');
    setDuration('1');
    setDurationUnit('t');
    setEntryCondition('last_digit_gte');
    setConditionDigit('2');
    setAllowBulk('No');
    setBulkCount('1');
    setExecutionSpeed('fast');
    showToast('Bot blocks reset to default parameters', 'info');
  };

  const handleRunBot = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setSubmitting(true);
    try {
      const res = await apiFetch<{ telemetry: BotTelemetry }>('/api/bots/run', {
        method: 'POST',
        body: JSON.stringify({
          strategyName,
          symbol,
          contractType,
          baseStake: Number(baseStake),
          barrier,
          duration: Number(duration),
          durationUnit,
          multiplier: Number(multiplier),
          martingale: useMartingale === 'true' ? Number(martingale) : 1.0,
          takeProfit: Number(takeProfit),
          stopLoss: Number(stopLoss),
          maxTrades: Number(maxTrades),
          accountMode,
          executionSpeed,
          executionMode: accountMode === 'real' && activeConnectedAccount ? 'deriv' : 'virtual',
          connectedAccountId: activeConnectedAccount?.id || null,
        }),
      });
      setTelemetry(res.telemetry);
      await Promise.all([refreshOrders(), refreshAll()]);
      showToast(`${strategyName} active in ${accountMode.toUpperCase()} mode (${executionSpeed.toUpperCase()})`, 'success');
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
      showToast('Bot engine stopped', 'info');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to stop bot', 'error');
    }
  };

  const handleCloseAllBotOrders = async () => {
    try {
      const res = await apiFetch<{ closedCount: number }>('/api/bots/close-all', { method: 'POST' });
      await Promise.all([refreshOrders(), refreshAll()]);
      showToast(`Closed ${res.closedCount} bot order(s)`, 'info');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to close bot orders', 'error');
    }
  };

  const handleImportXml = (e: React.ChangeEvent<HTMLInputElement>) => {
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

      if (symMatch?.[1]) setSymbol(symMatch[1].trim());
      if (amtMatch?.[1]) setBaseStake(amtMatch[1].trim());
      if (typeMatch?.[1]) {
        const ct = typeMatch[1].trim();
        setContractType(ct);
        setTradeTypeGroup(inferGroupFromContract(ct));
      }
      if (durMatch?.[1]) setDuration(durMatch[1].trim());
      if (predMatch?.[1]) setBarrier(predMatch[1].trim());
      setStrategyName(file.name.replace(/\.xml$/i, ''));
      showToast(`Imported Blockly XML (${file.name})`, 'success');
    };
    reader.readAsText(file);
  };

  const handleExportXml = () => {
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
    showToast('Blockly XML exported', 'success');
  };

  const contractChoices = TRADE_TYPE_OPTIONS[tradeTypeGroup];

  return (
    <div className="max-w-7xl mx-auto px-3 sm:px-6 pt-4 pb-24 space-y-5">
      {/* Top Action Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-display text-xl sm:text-2xl font-bold">Visual Deriv Bot Builder</h1>
            <span
              className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                accountMode === 'real' ? 'bg-[#FF444F]/15 text-[#FF444F]' : 'bg-[#00A878]/15 text-[#00A878]'
              }`}
            >
              {accountMode} Account
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Structured Deriv block workspace · Instant 25-tick seeding · Blockly XML compatible
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <input ref={fileRef} type="file" accept=".xml" onChange={handleImportXml} className="hidden" />
          <input
            type="text"
            value={strategyName}
            onChange={(e) => setStrategyName(e.target.value)}
            aria-label="Bot Strategy Name"
            className="px-3 py-2 rounded-xl bg-white dark:bg-[#181C25] border border-slate-200 dark:border-[#2A2F3D] text-xs font-bold w-44"
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="px-3.5 py-2 rounded-xl bg-[#F4F5F7] dark:bg-[#181C25] border border-slate-200 dark:border-[#2A2F3D] text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
          >
            <Upload className="w-3.5 h-3.5" /> Import XML
          </button>
          <button
            type="button"
            onClick={handleExportXml}
            className="px-3.5 py-2 rounded-xl bg-[#F4F5F7] dark:bg-[#181C25] border border-slate-200 dark:border-[#2A2F3D] text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" /> Export XML
          </button>
        </div>
      </div>

      {/* Main PipFlow-inspired Block Workspace + Telemetry */}
      <div className="flex gap-3 sm:gap-4 items-start">
        {/* Left Vertical Workspace Rail */}
        <aside className="hidden sm:flex flex-col items-center gap-2 w-11 py-3 rounded-2xl bg-white dark:bg-[#181C25] border border-slate-200 dark:border-[#2A2F3D] shrink-0">
          <button
            type="button"
            onClick={handleResetDefaults}
            title="Reset Bot Parameters"
            className="p-2 rounded-xl text-slate-500 hover:bg-[#F4F5F7] dark:hover:bg-white/10 hover:text-[#FF444F] cursor-pointer"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            title="Load XML"
            className="p-2 rounded-xl text-slate-500 hover:bg-[#F4F5F7] dark:hover:bg-white/10 hover:text-[#1958B7] cursor-pointer"
          >
            <Upload className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={handleExportXml}
            title="Save XML"
            className="p-2 rounded-xl text-slate-500 hover:bg-[#F4F5F7] dark:hover:bg-white/10 hover:text-[#00A878] cursor-pointer"
          >
            <Download className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => {
              setSelectedSymbol(symbol);
              setActiveTab('mt5-tv');
            }}
            title="Open Symbol Chart"
            className="p-2 rounded-xl text-slate-500 hover:bg-[#F4F5F7] dark:hover:bg-white/10 hover:text-[#FF444F] cursor-pointer"
          >
            <CandlestickChart className="w-4 h-4" />
          </button>
        </aside>

        {/* Center/Right Grid: Visual Blocks + Live Telemetry */}
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          {/* Structured Block Sequence */}
          <form onSubmit={handleRunBot} className="lg:col-span-7 space-y-4">
            {/* BLOCK 1: 1. Trade parameters */}
            <div className="rounded-2xl overflow-hidden border border-slate-200 dark:border-[#2A2F3D] bg-white dark:bg-[#181C25] shadow-xs">
              <div className="px-4 py-2.5 bg-[#0F1F38] text-white flex items-center justify-between">
                <span className="font-display text-sm font-bold">1. Trade parameters</span>
                <span className="text-[11px] font-mono-num text-slate-300">{symbol}</span>
              </div>

              <div className="p-4 space-y-3 text-xs">
                {/* Market Selector Path */}
                <div className="p-3 rounded-xl bg-[#F4F5F7] dark:bg-[#111319] space-y-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-semibold text-slate-500">Market:</span>
                    <select
                      value={marketCategory}
                      onChange={(e) => setMarketCategory(e.target.value as any)}
                      className="px-2.5 py-1.5 rounded-lg bg-white dark:bg-[#181C25] border border-slate-200 dark:border-[#2A2F3D] font-semibold"
                    >
                      <option value="Synthetic">Synthetics</option>
                      <option value="Forex">Forex</option>
                      <option value="Crypto">Crypto</option>
                      <option value="Metals/Cmd">Commodities</option>
                      <option value="Indices">Indices</option>
                      <option value="All">All Markets</option>
                    </select>
                    <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                    <select
                      value={symbol}
                      onChange={(e) => setSymbol(e.target.value)}
                      className="flex-1 min-w-[170px] px-2.5 py-1.5 rounded-lg bg-white dark:bg-[#181C25] border border-slate-200 dark:border-[#2A2F3D] font-semibold"
                    >
                      {filteredSymbols.map((inst) => (
                        <option key={inst.symbol} value={inst.symbol}>
                          {inst.display_name} ({inst.symbol})
                        </option>
                      ))}
                    </select>
                  </div>

                  <label className="inline-flex items-center gap-2 text-[11px] text-slate-500 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={alternateMarkets}
                      onChange={(e) => setAlternateMarkets(e.target.checked)}
                      className="accent-[#FF444F]"
                    />
                    Alternate markets (Continuous Indices rotation)
                  </label>
                </div>

                {/* Trade Type & Contract Type */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div className="p-2.5 rounded-xl bg-[#F4F5F7] dark:bg-[#111319] flex items-center justify-between gap-2">
                    <span className="font-semibold text-slate-500 shrink-0">Trade Type:</span>
                    <select
                      value={tradeTypeGroup}
                      onChange={(e) => handleGroupChange(e.target.value as TradeTypeGroup)}
                      className="px-2.5 py-1.5 rounded-lg bg-white dark:bg-[#181C25] border border-slate-200 dark:border-[#2A2F3D] font-semibold text-xs"
                    >
                      {(Object.keys(TRADE_TYPE_OPTIONS) as TradeTypeGroup[]).map((grp) => (
                        <option key={grp} value={grp}>
                          {grp}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="p-2.5 rounded-xl bg-[#F4F5F7] dark:bg-[#111319] flex items-center justify-between gap-2">
                    <span className="font-semibold text-slate-500 shrink-0">Contract Type:</span>
                    <select
                      value={contractType}
                      onChange={(e) => setContractType(e.target.value)}
                      className="px-2.5 py-1.5 rounded-lg bg-white dark:bg-[#181C25] border border-slate-200 dark:border-[#2A2F3D] font-bold text-xs"
                    >
                      {contractChoices.map((c) => (
                        <option key={c.value} value={c.value}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 p-2.5 rounded-xl bg-[#F4F5F7] dark:bg-[#111319]">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-slate-500">Default Candle Interval:</span>
                    <select
                      value={candleInterval}
                      onChange={(e) => setCandleInterval(e.target.value as any)}
                      className="px-2.5 py-1 rounded-lg bg-white dark:bg-[#181C25] border border-slate-200 dark:border-[#2A2F3D] font-mono-num font-semibold"
                    >
                      <option value="1t">1 tick</option>
                      <option value="1m">1 minute</option>
                      <option value="5m">5 minutes</option>
                      <option value="15m">15 minutes</option>
                    </select>
                  </div>

                  <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-500">
                    <label className="inline-flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={restartBuySellOnError}
                        onChange={(e) => setRestartBuySellOnError(e.target.checked)}
                        className="accent-[#FF444F]"
                      />
                      Restart on error
                    </label>
                    <label className="inline-flex items-center gap-1 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={virtualHook}
                        onChange={(e) => setVirtualHook(e.target.checked)}
                        className="accent-[#00A878]"
                      />
                      Virtual Hook <Zap className="w-3 h-3 text-amber-500 inline" />
                    </label>
                    <label className="inline-flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={restartLastTradeOnError}
                        onChange={(e) => setRestartLastTradeOnError(e.target.checked)}
                        className="accent-[#00A878]"
                      />
                      Ignore failed tick
                    </label>
                  </div>
                </div>

                {/* Run once at start nested block */}
                <div className="rounded-xl overflow-hidden border border-slate-200 dark:border-[#2A2F3D]">
                  <div className="px-3.5 py-2 bg-[#151820] text-white font-display text-xs font-bold flex items-center justify-between">
                    <span>Run once at start:</span>
                    <span className="text-[10px] font-normal text-slate-400">Initialization Variables</span>
                  </div>
                  <div className="p-3 bg-[#F8F9FB] dark:bg-[#111319] grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <div className="flex items-center justify-between gap-2 px-3 py-1.5 rounded-xl bg-white dark:bg-[#181C25] border border-slate-200 dark:border-[#2A2F3D]">
                      <span className="text-slate-500">set <strong className="text-[#0F1F38] dark:text-white">Stake ($)</strong> to</span>
                      <input
                        type="number"
                        step="0.1"
                        min="0.35"
                        value={baseStake}
                        onChange={(e) => setBaseStake(e.target.value)}
                        className="w-20 text-right font-mono-num font-bold bg-transparent outline-none"
                      />
                    </div>

                    <div className="flex items-center justify-between gap-2 px-3 py-1.5 rounded-xl bg-white dark:bg-[#181C25] border border-slate-200 dark:border-[#2A2F3D]">
                      <span className="text-slate-500">set <strong className="text-[#0F1F38] dark:text-white">Initial Prediction</strong> to</span>
                      <input
                        type="text"
                        value={barrier}
                        onChange={(e) => setBarrier(e.target.value)}
                        className="w-16 text-right font-mono-num font-bold bg-transparent outline-none"
                      />
                    </div>

                    <div className="flex items-center justify-between gap-2 px-3 py-1.5 rounded-xl bg-white dark:bg-[#181C25] border border-slate-200 dark:border-[#2A2F3D]">
                      <span className="text-slate-500">set <strong className="text-[#0F1F38] dark:text-white">Recovery Pred</strong> to</span>
                      <input
                        type="text"
                        value={recoveryPrediction}
                        onChange={(e) => setRecoveryPrediction(e.target.value)}
                        className="w-16 text-right font-mono-num font-bold bg-transparent outline-none"
                      />
                    </div>

                    <div className="flex items-center justify-between gap-2 px-3 py-1.5 rounded-xl bg-white dark:bg-[#181C25] border border-slate-200 dark:border-[#2A2F3D]">
                      <span className="text-slate-500">set <strong className="text-[#0F1F38] dark:text-white">Martingale (x)</strong> to</span>
                      <input
                        type="number"
                        step="0.1"
                        min="1"
                        value={martingale}
                        onChange={(e) => setMartingale(e.target.value)}
                        className="w-16 text-right font-mono-num font-bold bg-transparent outline-none"
                      />
                    </div>

                    <div className="flex items-center justify-between gap-2 px-3 py-1.5 rounded-xl bg-white dark:bg-[#181C25] border border-slate-200 dark:border-[#2A2F3D]">
                      <span className="text-slate-500">set <strong className="text-[#00A878]">Take Profit ($)</strong> to</span>
                      <input
                        type="number"
                        min="1"
                        value={takeProfit}
                        onChange={(e) => setTakeProfit(e.target.value)}
                        className="w-20 text-right font-mono-num font-bold text-[#00A878] bg-transparent outline-none"
                      />
                    </div>

                    <div className="flex items-center justify-between gap-2 px-3 py-1.5 rounded-xl bg-white dark:bg-[#181C25] border border-slate-200 dark:border-[#2A2F3D]">
                      <span className="text-slate-500">set <strong className="text-[#FF444F]">Stop Loss ($)</strong> to</span>
                      <input
                        type="number"
                        min="1"
                        value={stopLoss}
                        onChange={(e) => setStopLoss(e.target.value)}
                        className="w-20 text-right font-mono-num font-bold text-[#FF444F] bg-transparent outline-none"
                      />
                    </div>

                    <div className="flex items-center justify-between gap-2 px-3 py-1.5 rounded-xl bg-white dark:bg-[#181C25] border border-slate-200 dark:border-[#2A2F3D]">
                      <span className="text-slate-500">set <strong className="text-[#0F1F38] dark:text-white">Max Trades</strong> to</span>
                      <input
                        type="number"
                        min="1"
                        value={maxTrades}
                        onChange={(e) => setMaxTrades(e.target.value)}
                        className="w-16 text-right font-mono-num font-bold bg-transparent outline-none"
                      />
                    </div>

                    <div className="flex items-center justify-between gap-2 px-3 py-1.5 rounded-xl bg-white dark:bg-[#181C25] border border-slate-200 dark:border-[#2A2F3D]">
                      <span className="text-slate-500">set <strong className="text-[#0F1F38] dark:text-white">Use Martingale</strong> to</span>
                      <select
                        value={useMartingale}
                        onChange={(e) => setUseMartingale(e.target.value as 'true' | 'false')}
                        className="font-mono-num font-bold bg-transparent outline-none cursor-pointer"
                      >
                        <option value="true">true</option>
                        <option value="false">false</option>
                      </select>
                    </div>

                    {tradeTypeGroup === 'CFDs > Multipliers' && (
                      <div className="sm:col-span-2 flex items-center justify-between gap-2 px-3 py-1.5 rounded-xl bg-white dark:bg-[#181C25] border border-slate-200 dark:border-[#2A2F3D]">
                        <span className="text-slate-500">set <strong className="text-[#1958B7]">CFD Multiplier</strong> to</span>
                        <input
                          type="number"
                          value={multiplier}
                          onChange={(e) => setMultiplier(e.target.value)}
                          className="w-20 text-right font-mono-num font-bold text-[#1958B7] bg-transparent outline-none"
                        />
                      </div>
                    )}
                  </div>
                </div>

                {/* Trade options strip */}
                <div className="rounded-xl overflow-hidden border border-slate-200 dark:border-[#2A2F3D]">
                  <div className="px-3.5 py-2 bg-[#0F1F38] text-white font-display text-xs font-bold">
                    Trade options:
                  </div>
                  <div className="p-3 bg-[#F4F5F7] dark:bg-[#111319] flex flex-wrap items-center gap-2.5 text-xs">
                    <div className="flex items-center gap-1.5">
                      <span className="text-slate-500 font-semibold">Duration:</span>
                      <select
                        value={durationUnit}
                        onChange={(e) => setDurationUnit(e.target.value)}
                        className="px-2 py-1 rounded-lg bg-white dark:bg-[#181C25] border border-slate-200 dark:border-[#2A2F3D] font-semibold"
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
                        className="w-14 px-2 py-1 rounded-lg bg-white dark:bg-[#181C25] border border-slate-200 dark:border-[#2A2F3D] font-mono-num font-bold text-center"
                      />
                    </div>
                    <span className="text-slate-500 font-mono-num">
                      Stake: <strong>${Number(baseStake || 0).toFixed(2)} USD</strong> (min 0.35)
                    </span>
                    <label className="inline-flex items-center gap-1.5 text-[11px] text-slate-600 dark:text-slate-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={tradeEachTick}
                        onChange={(e) => setTradeEachTick(e.target.checked)}
                        className="accent-[#FF444F]"
                      />
                      Trade each tick
                    </label>
                    <span className="px-2 py-0.5 rounded-lg bg-white dark:bg-[#181C25] border border-slate-200 dark:border-[#2A2F3D] font-mono-num">
                      Prediction: <strong>{barrier}</strong>
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* BLOCK 2: 2. Purchase conditions */}
            <div className="rounded-2xl overflow-hidden border border-slate-200 dark:border-[#2A2F3D] bg-white dark:bg-[#181C25] shadow-xs">
              <div className="px-4 py-2.5 bg-[#0F1F38] text-white flex items-center justify-between">
                <span className="font-display text-sm font-bold">2. Purchase conditions</span>
                <span className="text-[11px] text-slate-300">Entry Trigger Block</span>
              </div>

              <div className="p-4 bg-[#F4F5F7]/70 dark:bg-[#111319] space-y-3 text-xs">
                <div className="flex flex-wrap items-center gap-2 p-3 rounded-xl bg-white dark:bg-[#181C25] border border-slate-200 dark:border-[#2A2F3D]">
                  <span className="font-bold text-[#1958B7]">if</span>
                  <select
                    value={entryCondition}
                    onChange={(e) => setEntryCondition(e.target.value as any)}
                    className="px-2.5 py-1.5 rounded-lg bg-[#F4F5F7] dark:bg-[#111319] font-semibold"
                  >
                    <option value="any_tick">Every incoming tick (Instant)</option>
                    <option value="last_digit_gte">Last digit is greater than or equal to</option>
                    <option value="last_digit_lte">Last digit is less than or equal to</option>
                    <option value="rsi_signal">RSI(14) momentum confirms entry</option>
                  </select>
                  {(entryCondition === 'last_digit_gte' || entryCondition === 'last_digit_lte') && (
                    <input
                      type="number"
                      min="0"
                      max="9"
                      value={conditionDigit}
                      onChange={(e) => setConditionDigit(e.target.value)}
                      className="w-12 px-2 py-1 rounded-lg bg-[#F4F5F7] dark:bg-[#111319] font-mono-num font-bold text-center"
                    />
                  )}
                  <span className="font-bold text-[#1958B7]">then</span>
                  <span className="px-2.5 py-1 rounded-lg bg-[#00A878]/15 text-[#00A878] font-bold">
                    Purchase {contractChoices.find((c) => c.value === contractType)?.label || contractType}
                  </span>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 px-3 py-2.5 rounded-xl bg-white dark:bg-[#181C25] border border-slate-200 dark:border-[#2A2F3D]">
                  <div className="flex items-center gap-2">
                    <span className="text-slate-500 font-semibold">Allow Bulk Purchase:</span>
                    <select
                      value={allowBulk}
                      onChange={(e) => setAllowBulk(e.target.value as 'No' | 'Yes')}
                      className="px-2.5 py-1 rounded-lg bg-[#F4F5F7] dark:bg-[#111319] font-semibold"
                    >
                      <option value="No">No</option>
                      <option value="Yes">Yes</option>
                    </select>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-slate-500 font-semibold">No. of Trades:</span>
                    <input
                      type="number"
                      min="1"
                      max="10"
                      disabled={allowBulk === 'No'}
                      value={allowBulk === 'No' ? '1' : bulkCount}
                      onChange={(e) => setBulkCount(e.target.value)}
                      className="w-16 px-2 py-1 rounded-lg bg-[#F4F5F7] dark:bg-[#111319] font-mono-num font-bold text-center disabled:opacity-50"
                    />
                  </div>
                </div>
              </div>
            </div>
          </form>

          {/* Right Live Bot Telemetry */}
          <section className="lg:col-span-5 bg-[#151820] text-white rounded-2xl border border-[#2A2F3D] p-5 flex flex-col justify-between space-y-4">
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Activity className="w-4 h-4 text-[#00A878]" />
                  <h2 className="font-display text-base font-bold">Live Execution Telemetry</h2>
                </div>
                <span
                  className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                    telemetry?.running ? 'bg-[#00A878]/20 text-[#00A878]' : 'bg-white/10 text-slate-400'
                  }`}
                >
                  {telemetry?.running ? 'Running' : 'Idle'}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="p-3.5 rounded-2xl bg-[#1A1D26] border border-[#2A2F3D]">
                  <p className="text-[11px] text-slate-400">Realized P/L</p>
                  <p
                    className={`font-mono-num text-xl font-bold mt-1 ${
                      (telemetry?.realizedPnl || 0) >= 0 ? 'text-[#00A878]' : 'text-[#FF444F]'
                    }`}
                  >
                    {(telemetry?.realizedPnl || 0) >= 0 ? '+' : ''}
                    {(telemetry?.realizedPnl || 0).toFixed(2)} USD
                  </p>
                </div>
                <div className="p-3.5 rounded-2xl bg-[#1A1D26] border border-[#2A2F3D]">
                  <p className="text-[11px] text-slate-400">Current Stake / Step</p>
                  <p className="font-mono-num text-xl font-bold mt-1">
                    ${(telemetry?.currentStake ?? Number(baseStake || 1)).toFixed(2)}{' '}
                    <span className="text-xs text-slate-400">(Step {telemetry?.martingaleStep ?? 0})</span>
                  </p>
                </div>
                <div className="p-3.5 rounded-2xl bg-[#1A1D26] border border-[#2A2F3D]">
                  <p className="text-[11px] text-slate-400">Trades / Wins / Losses</p>
                  <div className="font-mono-num text-sm font-bold mt-1.5 flex items-center gap-3">
                    <span>{telemetry?.tradesPlaced || 0}</span>
                    <span className="text-[#00A878] inline-flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" /> {telemetry?.wins || 0}
                    </span>
                    <span className="text-[#FF444F] inline-flex items-center gap-1">
                      <XCircle className="w-3.5 h-3.5" /> {telemetry?.losses || 0}
                    </span>
                  </div>
                </div>
                <div className="p-3.5 rounded-2xl bg-[#1A1D26] border border-[#2A2F3D]">
                  <p className="text-[11px] text-slate-400">Ticks Processed</p>
                  <p className="font-mono-num text-xl font-bold mt-1">{telemetry?.tickCount || 0}</p>
                </div>
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-[#1A1D26] border border-[#2A2F3D] space-y-2">
              <div className="flex items-center gap-1.5 text-xs text-amber-400 font-semibold">
                <Zap className="w-3.5 h-3.5" />
                <span>Signal Feed</span>
              </div>
              <p className="text-xs text-slate-300 font-mono-num">
                {telemetry?.lastSignal || 'Ready. Click Run below to seed 25 ticks and execute immediate trade.'}
              </p>
            </div>

            <button
              type="button"
              onClick={handleCloseAllBotOrders}
              className="w-full py-2.5 px-4 rounded-xl border border-[#2A2F3D] hover:border-[#FF444F] text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5 text-[#FF444F]" />
              Close All Bot Orders
            </button>
          </section>
        </div>
      </div>

      {/* Sticky Bottom Execution Bar matching reference flow */}
      <div className="sticky bottom-16 lg:bottom-3 z-20 bg-white/95 dark:bg-[#151820]/95 backdrop-blur-md border border-slate-200 dark:border-[#2A2F3D] rounded-2xl px-3.5 py-2.5 shadow-lg flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {!telemetry?.running ? (
            <button
              type="button"
              disabled={submitting}
              onClick={() => handleRunBot()}
              className="px-5 py-2.5 rounded-xl bg-[#00A878] hover:bg-[#00966B] text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              {submitting ? 'Starting...' : 'Run'}
            </button>
          ) : (
            <button
              type="button"
              onClick={handleStopBot}
              className="px-5 py-2.5 rounded-xl bg-[#FF444F] hover:bg-[#E63946] text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer"
            >
              <Square className="w-3.5 h-3.5 fill-current" />
              Stop
            </button>
          )}

          <div className="text-xs">
            {telemetry?.running ? (
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-[#00A878] animate-pulse" />
                <span className="font-semibold">
                  Running · <span className="font-mono-num">{telemetry.tradesPlaced} trades</span> ·{' '}
                  <strong className={`font-mono-num ${telemetry.realizedPnl >= 0 ? 'text-[#00A878]' : 'text-[#FF444F]'}`}>
                    {telemetry.realizedPnl >= 0 ? '+' : ''}
                    ${telemetry.realizedPnl.toFixed(2)}
                  </strong>
                </span>
              </div>
            ) : (
              <span className="font-semibold text-slate-600 dark:text-slate-300">Bot is not running</span>
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={() => setExecutionSpeed((s) => (s === 'fast' ? 'normal' : 'fast'))}
          className="flex items-center gap-2.5 px-3 py-1.5 rounded-xl bg-[#F4F5F7] dark:bg-[#111319] border border-slate-200 dark:border-[#2A2F3D] cursor-pointer"
        >
          <div className="text-left leading-tight">
            <span className="block text-[10px] text-slate-500">Execution</span>
            <span className="block text-xs font-bold uppercase">{executionSpeed}</span>
          </div>
          <span
            className={`w-9 h-5 rounded-full p-0.5 transition-colors flex items-center ${
              executionSpeed === 'fast' ? 'bg-[#00A878] justify-end' : 'bg-slate-400 justify-start'
            }`}
          >
            <span className="w-4 h-4 rounded-full bg-white shadow-xs" />
          </span>
        </button>
      </div>
    </div>
  );
};
