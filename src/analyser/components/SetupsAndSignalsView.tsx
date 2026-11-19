import React, { useState, useEffect, useCallback } from 'react';
import { RefreshCw, Send, ShieldCheck } from 'lucide-react';
import { apiFetch, sanitizeUiError } from '../../lib/api';
import { useAnalyser } from '../AnalyserContext';

interface SignalRow {
  id: number;
  instrument: string;
  display_name: string;
  timeframe: string;
  direction: string;
  setup_type: string;
  strategy_name: string;
  entry_price: number;
  stop_loss: number;
  tp1: number;
  tp2: number;
  tp3: number;
  risk_reward: number;
  quality_score: number;
  lifecycle_status: string;
  created_at: string;
}

export const SetupsAndSignalsView: React.FC = () => {
  const { notify } = useAnalyser();
  const [signals, setSignals] = useState<SignalRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [execMode, setExecMode] = useState<'signal-only' | 'demo' | 'assisted' | 'authorized-auto'>('signal-only');
  const [lots, setLots] = useState('0.05');
  const [execMessage, setExecMessage] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const loadSignals = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch<{ signals: SignalRow[] }>('/api/analyser/signals', { skipAuth: true });
      setSignals(res.signals || []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSignals();
  }, [loadSignals]);

  const handleTransition = async (id: number, lifecycleStatus: string) => {
    setBusyId(id);
    try {
      await apiFetch(`/api/analyser/signals/${id}/transition`, {
        method: 'POST',
        body: JSON.stringify({ lifecycleStatus, reason: `Analyst marked ${lifecycleStatus}` }),
      });
      await loadSignals();
      notify(`Signal #${id} transitioned to ${lifecycleStatus}`, 'success');
    } catch (err) {
      notify(sanitizeUiError(err, 'Transition failed'), 'error');
    } finally {
      setBusyId(null);
    }
  };

  const handleExecuteSignal = async (s: SignalRow) => {
    setBusyId(s.id);
    setExecMessage(null);
    try {
      const res = await apiFetch<{
        venue: string;
        degradedToSignalOnly?: boolean;
        message?: string;
        order: any;
      }>('/api/analyser/execute', {
        method: 'POST',
        body: JSON.stringify({
          instrument: s.instrument,
          side: s.direction === 'SELL' ? 'SELL' : 'BUY',
          executionMode: execMode,
          lots: Number(lots) || 0.05,
          entryPrice: s.entry_price,
          stopLoss: s.stop_loss,
          takeProfit: s.tp2 || s.tp1,
          signalId: s.id,
        }),
      });
      setExecMessage(res.message || `Routed to ${res.venue}`);
      notify(res.degradedToSignalOnly ? 'No live MT5 bridge — logged as Signal-Only' : 'Execution instruction queued', res.degradedToSignalOnly ? 'info' : 'success');
    } catch (err) {
      notify(sanitizeUiError(err, 'Execution routing failed'), 'error');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold">Signal Lifecycle & Honest Execution Router</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            XAUUSD and Forex route strictly to an active MT5 EA Bridge or degrade cleanly to Signal-Only audit mode without faking broker fills.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <select
            value={execMode}
            onChange={(e) => setExecMode(e.target.value as any)}
            className="px-3 py-2 rounded-xl bg-white dark:bg-[#181C25] border border-slate-200 dark:border-[#2A2F3D] font-semibold"
          >
            <option value="signal-only">Signal-Only Audit</option>
            <option value="demo">Demo Simulated</option>
            <option value="assisted">Assisted Confirmation</option>
            <option value="authorized-auto">Authorized Auto (Requires Live MT5 EA)</option>
          </select>
          <input
            type="number"
            step="0.01"
            min="0.01"
            value={lots}
            onChange={(e) => setLots(e.target.value)}
            aria-label="Lots"
            className="w-20 px-3 py-2 rounded-xl bg-white dark:bg-[#181C25] border border-slate-200 dark:border-[#2A2F3D] font-mono tabular-nums font-bold"
          />
          <button
            type="button"
            onClick={loadSignals}
            className="px-3.5 py-2 rounded-xl bg-[#151820] text-white font-bold inline-flex items-center gap-1.5 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </div>
      </div>

      {execMessage && (
        <div className="p-3.5 rounded-2xl bg-[#1958B7]/10 border border-[#1958B7]/30 text-xs flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-[#1958B7] shrink-0" />
          <span>{execMessage}</span>
        </div>
      )}

      <div className="bg-white dark:bg-[#181C25] rounded-2xl border border-slate-200 dark:border-[#2A2F3D] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-200 dark:border-[#2A2F3D] text-slate-500">
                <th className="text-left px-4 py-3">Signal</th>
                <th className="text-left px-4 py-3">Status</th>
                <th className="text-right px-4 py-3">Entry</th>
                <th className="text-right px-4 py-3">SL</th>
                <th className="text-right px-4 py-3">TP1 / TP2</th>
                <th className="text-right px-4 py-3">Score</th>
                <th className="text-right px-4 py-3">Lifecycle & Execute</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-[#2A2F3D]">
              {signals.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                    No persisted analyser signals yet. Run the Scanner tab to detect qualified setups.
                  </td>
                </tr>
              ) : (
                signals.slice(0, 40).map((s) => (
                  <tr key={s.id} className="hover:bg-slate-50 dark:hover:bg-white/5">
                    <td className="px-4 py-3">
                      <span className="font-bold">{s.instrument}</span> ·{' '}
                      <span className={s.direction === 'BUY' ? 'text-[#00A878] font-bold' : 'text-[#FF444F] font-bold'}>
                        {s.direction}
                      </span>{' '}
                      · <span className="font-mono">{s.timeframe}</span>
                      <p className="text-[11px] text-slate-400">{s.strategy_name}</p>
                    </td>
                    <td className="px-4 py-3 font-semibold">{s.lifecycle_status}</td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums font-bold">{s.entry_price}</td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums text-[#FF444F]">{s.stop_loss}</td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums text-[#00A878]">
                      {s.tp1} / {s.tp2}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums">{s.quality_score}/100</td>
                    <td className="px-4 py-3 text-right whitespace-nowrap space-x-1">
                      <button
                        type="button"
                        disabled={busyId === s.id}
                        onClick={() => handleTransition(s.id, 'Confirmed')}
                        className="px-2 py-1 rounded bg-[#F4F5F7] dark:bg-[#111319] hover:text-[#00A878] font-semibold cursor-pointer"
                      >
                        Confirm
                      </button>
                      <button
                        type="button"
                        disabled={busyId === s.id}
                        onClick={() => handleTransition(s.id, 'Invalidated')}
                        className="px-2 py-1 rounded bg-[#F4F5F7] dark:bg-[#111319] hover:text-[#FF444F] font-semibold cursor-pointer"
                      >
                        Invalidate
                      </button>
                      <button
                        type="button"
                        disabled={busyId === s.id}
                        onClick={() => handleExecuteSignal(s)}
                        className="px-2.5 py-1 rounded bg-[#1958B7] text-white font-bold inline-flex items-center gap-1 cursor-pointer"
                      >
                        <Send className="w-3 h-3" /> Route
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
