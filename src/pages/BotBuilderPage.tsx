import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Play, Square, Upload, Download, Trash2, Activity, Zap, CheckCircle2, XCircle } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { apiFetch } from '../lib/api';
import type { BotTelemetry } from '../types';

export const BotBuilderPage: React.FC = () => {
  const { instruments, selectedSymbol, accountMode, activeConnectedAccount, refreshOrders, refreshAll, showToast } =
    useApp();

  const [strategyName, setStrategyName] = useState('07_Over_Hit_n_Run');
  const [symbol, setSymbol] = useState(selectedSymbol || '1HZ100V');
  const [contractType, setContractType] = useState('DIGITOVER');
  const [baseStake, setBaseStake] = useState('1.0');
  const [barrier, setBarrier] = useState('2');
  const [duration, setDuration] = useState('1');
  const [durationUnit, setDurationUnit] = useState('t');
  const [multiplier, setMultiplier] = useState('100');
  const [martingale, setMartingale] = useState('2.1');
  const [takeProfit, setTakeProfit] = useState('25');
  const [stopLoss, setStopLoss] = useState('50');
  const [maxTrades, setMaxTrades] = useState('50');

  const [telemetry, setTelemetry] = useState<BotTelemetry | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  // Check if a strategy was loaded from TradingBotsPage
  useEffect(() => {
    const raw = sessionStorage.getItem('td_loaded_bot');
    if (raw) {
      sessionStorage.removeItem('td_loaded_bot');
      try {
        const s = JSON.parse(raw);
        if (s.name) setStrategyName(s.name);
        if (s.symbol) setSymbol(s.symbol);
        if (s.contract_type) setContractType(s.contract_type);
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
    const timer = setInterval(pollStatus, 2000);
    return () => clearInterval(timer);
  }, [pollStatus]);

  const handleRunBot = async (e: React.FormEvent) => {
    e.preventDefault();
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
          martingale: Number(martingale),
          takeProfit: Number(takeProfit),
          stopLoss: Number(stopLoss),
          maxTrades: Number(maxTrades),
          executionMode: accountMode === 'real' && activeConnectedAccount ? 'deriv' : 'virtual',
          connectedAccountId: activeConnectedAccount?.id || null,
        }),
      });
      setTelemetry(res.telemetry);
      await Promise.all([refreshOrders(), refreshAll()]);
      showToast(`${strategyName} active — 25 ticks seeded & immediate trade fired`, 'success');
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

      if (symMatch?.[1]) setSymbol(symMatch[1].trim());
      if (amtMatch?.[1]) setBaseStake(amtMatch[1].trim());
      if (typeMatch?.[1]) setContractType(typeMatch[1].trim());
      if (durMatch?.[1]) setDuration(durMatch[1].trim());
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

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-8 py-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold">Instant Deriv Bot Builder</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Zero-delay execution · Seeds 25 ticks & fires first trade immediately · Blockly XML compatible
          </p>
        </div>

        <div className="flex items-center gap-2">
          <input ref={fileRef} type="file" accept=".xml" onChange={handleImportXml} className="hidden" />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="px-4 py-2 rounded-full bg-[#F4F5F7] dark:bg-[#181C25] border border-slate-200 dark:border-[#2A2F3D] text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
          >
            <Upload className="w-3.5 h-3.5" /> Import XML
          </button>
          <button
            type="button"
            onClick={handleExportXml}
            className="px-4 py-2 rounded-full bg-[#F4F5F7] dark:bg-[#181C25] border border-slate-200 dark:border-[#2A2F3D] text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" /> Export XML
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Builder Configuration */}
        <form
          onSubmit={handleRunBot}
          className="lg:col-span-7 bg-white dark:bg-[#181C25] rounded-2xl border border-slate-200 dark:border-[#2A2F3D] p-5 space-y-4"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Bot Name</label>
              <input
                type="text"
                value={strategyName}
                onChange={(e) => setStrategyName(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#F4F5F7] dark:bg-[#111319] border border-slate-200 dark:border-[#2A2F3D] text-sm font-semibold"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Market Symbol</label>
              <select
                value={symbol}
                onChange={(e) => setSymbol(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#F4F5F7] dark:bg-[#111319] border border-slate-200 dark:border-[#2A2F3D] text-sm font-semibold"
              >
                {instruments.map((inst) => (
                  <option key={inst.symbol} value={inst.symbol}>
                    {inst.display_name} ({inst.symbol})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Contract Type</label>
              <select
                value={contractType}
                onChange={(e) => setContractType(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#F4F5F7] dark:bg-[#111319] border border-slate-200 dark:border-[#2A2F3D] text-sm font-semibold"
              >
                <option value="DIGITOVER">Digits Over</option>
                <option value="DIGITUNDER">Digits Under</option>
                <option value="DIGITDIFF">Digits Differs</option>
                <option value="DIGITMATCH">Digits Matches</option>
                <option value="DIGITEVEN">Even</option>
                <option value="DIGITODD">Odd</option>
                <option value="CALL">Rise (CALL)</option>
                <option value="PUT">Fall (PUT)</option>
                <option value="MULTUP">Multiplier Up</option>
                <option value="MULTDOWN">Multiplier Down</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Barrier / Prediction</label>
              <input
                type="text"
                value={barrier}
                onChange={(e) => setBarrier(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#F4F5F7] dark:bg-[#111319] border border-slate-200 dark:border-[#2A2F3D] font-mono-num text-sm font-bold"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Duration (Ticks)</label>
              <div className="flex gap-2">
                <input
                  type="number"
                  min="1"
                  value={duration}
                  onChange={(e) => setDuration(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl bg-[#F4F5F7] dark:bg-[#111319] border border-slate-200 dark:border-[#2A2F3D] font-mono-num text-sm font-bold"
                />
                <select
                  value={durationUnit}
                  onChange={(e) => setDurationUnit(e.target.value)}
                  className="px-2.5 py-2 rounded-xl bg-[#F4F5F7] dark:bg-[#111319] border border-slate-200 dark:border-[#2A2F3D] text-xs font-bold"
                >
                  <option value="t">t</option>
                  <option value="s">s</option>
                  <option value="m">m</option>
                </select>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Base Stake ($)</label>
              <input
                type="number"
                step="0.1"
                min="0.35"
                value={baseStake}
                onChange={(e) => setBaseStake(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-[#F4F5F7] dark:bg-[#111319] border border-slate-200 dark:border-[#2A2F3D] font-mono-num text-sm font-bold"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Martingale (x)</label>
              <input
                type="number"
                step="0.1"
                min="1"
                value={martingale}
                onChange={(e) => setMartingale(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-[#F4F5F7] dark:bg-[#111319] border border-slate-200 dark:border-[#2A2F3D] font-mono-num text-sm font-bold"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Take Profit ($)</label>
              <input
                type="number"
                step="1"
                min="1"
                value={takeProfit}
                onChange={(e) => setTakeProfit(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-[#F4F5F7] dark:bg-[#111319] border border-slate-200 dark:border-[#2A2F3D] font-mono-num text-sm font-bold text-[#00A878]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Stop Loss ($)</label>
              <input
                type="number"
                step="1"
                min="1"
                value={stopLoss}
                onChange={(e) => setStopLoss(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-[#F4F5F7] dark:bg-[#111319] border border-slate-200 dark:border-[#2A2F3D] font-mono-num text-sm font-bold text-[#FF444F]"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Multiplier (CFDs)</label>
              <input
                type="number"
                value={multiplier}
                onChange={(e) => setMultiplier(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-[#F4F5F7] dark:bg-[#111319] border border-slate-200 dark:border-[#2A2F3D] font-mono-num text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Max Trades</label>
              <input
                type="number"
                min="1"
                value={maxTrades}
                onChange={(e) => setMaxTrades(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-[#F4F5F7] dark:bg-[#111319] border border-slate-200 dark:border-[#2A2F3D] font-mono-num text-sm"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-2">
            {!telemetry?.running ? (
              <button
                type="submit"
                disabled={submitting}
                className="flex-1 py-3 px-6 rounded-full bg-[#00A878] hover:bg-[#00966B] text-white font-bold text-sm flex items-center justify-center gap-2 cursor-pointer"
              >
                <Play className="w-4 h-4 fill-current" />
                {submitting ? 'Seeding 25 ticks...' : 'Run Bot Immediately'}
              </button>
            ) : (
              <button
                type="button"
                onClick={handleStopBot}
                className="flex-1 py-3 px-6 rounded-full bg-[#FF444F] hover:bg-[#E63946] text-white font-bold text-sm flex items-center justify-center gap-2 cursor-pointer"
              >
                <Square className="w-4 h-4 fill-current" />
                Stop Bot
              </button>
            )}

            <button
              type="button"
              onClick={handleCloseAllBotOrders}
              className="py-3 px-5 rounded-full border border-slate-300 dark:border-[#2A2F3D] text-xs font-bold flex items-center gap-1.5 hover:border-[#FF444F] cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5 text-[#FF444F]" />
              Close All Bot Orders
            </button>
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
                  ${(telemetry?.currentStake ?? Number(baseStake)).toFixed(2)}{' '}
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
              {telemetry?.lastSignal || 'Ready. Click Run Bot Immediately to seed 25 ticks and fire first order.'}
            </p>
          </div>
        </section>
      </div>
    </div>
  );
};
