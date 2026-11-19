import React, { useState, useEffect, useCallback } from 'react';
import { RefreshCw, ArrowUpRight, AlertTriangle } from 'lucide-react';
import { apiFetch } from '../../lib/api';
import { useAnalyser, type AnalyserSetupData } from '../AnalyserContext';

interface Props {
  onInspectGold: () => void;
  onInspectForex: () => void;
}

const TIMEFRAMES = ['M1', 'M5', 'M15', 'M30', 'H1', 'H4', 'D1'];

export const ScannerDashboard: React.FC<Props> = ({ onInspectGold, onInspectForex }) => {
  const { notify } = useAnalyser();
  const [timeframe, setTimeframe] = useState('M15');
  const [setups, setSetups] = useState<AnalyserSetupData[]>([]);
  const [scannedAt, setScannedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [filterClass, setFilterClass] = useState<'all' | 'commodity' | 'forex' | 'qualified'>('all');

  const runScan = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch<{ setups: AnalyserSetupData[]; scannedAt: string }>(
        `/api/analyser/scan?timeframe=${encodeURIComponent(timeframe)}&_t=${Date.now()}`,
        { skipAuth: true, cache: 'no-store' }
      );
      setSetups(res.setups || []);
      setScannedAt(res.scannedAt || new Date().toISOString());
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Scan unavailable', 'error');
    } finally {
      setLoading(false);
    }
  }, [timeframe, notify]);

  useEffect(() => {
    runScan();
  }, [runScan]);

  const visible = setups.filter((s) => {
    if (filterClass === 'commodity') return s.assetClass === 'commodity';
    if (filterClass === 'forex') return s.assetClass === 'forex';
    if (filterClass === 'qualified') return s.direction !== 'WAIT' && !s.blockedReason;
    return true;
  });

  const qualifiedCount = setups.filter((s) => s.direction !== 'WAIT' && !s.blockedReason).length;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold">Multi-Market AI Opportunity Scanner</h1>
          <p className="text-xs text-slate-500 mt-0.5 font-mono tabular-nums">
            {qualifiedCount} qualified setup(s) · {setups.length} instruments scanned
            {scannedAt ? ` · Last scan ${new Date(scannedAt).toLocaleTimeString()}` : ''}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 bg-white dark:bg-[#181C25] p-1 rounded-xl border border-slate-200 dark:border-[#2A2F3D]">
            {TIMEFRAMES.map((tf) => (
              <button
                key={tf}
                type="button"
                onClick={() => setTimeframe(tf)}
                className={`px-2.5 py-1 rounded-lg font-mono tabular-nums text-xs font-semibold cursor-pointer ${
                  timeframe === tf ? 'bg-[#FF444F] text-white' : 'text-slate-500 hover:text-[#0E1117] dark:hover:text-white'
                }`}
              >
                {tf}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={runScan}
            disabled={loading}
            className="px-4 py-2 rounded-xl bg-[#151820] dark:bg-[#181C25] border border-slate-200 dark:border-[#2A2F3D] text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            {loading ? 'Scanning...' : 'Scan Markets'}
          </button>
        </div>
      </div>

      {/* Category Segment */}
      <div className="flex items-center gap-1.5 bg-white dark:bg-[#181C25] p-1 rounded-xl border border-slate-200 dark:border-[#2A2F3D] w-fit">
        {(
          [
            { id: 'all', label: 'All Markets' },
            { id: 'commodity', label: 'Gold (XAUUSD)' },
            { id: 'forex', label: 'Forex Majors' },
            { id: 'qualified', label: 'Qualified Entries Only' },
          ] as const
        ).map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilterClass(f.id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer whitespace-nowrap ${
              filterClass === f.id
                ? 'bg-[#151820] text-white dark:bg-white dark:text-[#151820]'
                : 'text-slate-500'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Scanner Table */}
      <div className="bg-white dark:bg-[#181C25] rounded-2xl border border-slate-200 dark:border-[#2A2F3D] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-200 dark:border-[#2A2F3D] text-slate-500">
                <th className="text-left px-4 py-3">Instrument</th>
                <th className="text-left px-4 py-3">Direction / Setup</th>
                <th className="text-right px-4 py-3">Entry Zone</th>
                <th className="text-right px-4 py-3">Stop Loss</th>
                <th className="text-right px-4 py-3">TP1 / TP2 / TP3</th>
                <th className="text-right px-4 py-3">R:R · Spread · ATR</th>
                <th className="text-right px-4 py-3">Confluence Score</th>
                <th className="text-right px-4 py-3">Inspect</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-[#2A2F3D]">
              {visible.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                    {loading ? 'Scanning Gold & Forex instruments...' : 'No setups match the selected filter.'}
                  </td>
                </tr>
              ) : (
                visible.map((s) => (
                  <tr key={s.instrument} className="hover:bg-slate-50 dark:hover:bg-white/5">
                    <td className="px-4 py-3">
                      <p className="font-bold text-[#0E1117] dark:text-white">{s.instrument}</p>
                      <p className="text-[11px] text-slate-400">
                        {s.displayName} · {s.timeframe}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`font-bold ${
                          s.direction === 'BUY'
                            ? 'text-[#00A878]'
                            : s.direction === 'SELL'
                              ? 'text-[#FF444F]'
                              : 'text-slate-400'
                        }`}
                      >
                        {s.direction}
                      </span>
                      <span className="text-slate-400"> · {s.setupType}</span>
                      <p className="text-[11px] text-slate-500">{s.strategyName}</p>
                      {s.blockedReason && (
                        <p className="text-[10px] text-amber-500 mt-0.5 flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3 shrink-0" /> {s.blockedReason}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums">
                      <p className="font-bold">{s.entryPrice}</p>
                      <p className="text-[10px] text-slate-400">
                        {s.entryZoneLow} – {s.entryZoneHigh}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums font-bold text-[#FF444F]">
                      {s.stopLoss > 0 ? s.stopLoss : '—'}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums text-[#00A878]">
                      {s.tp1 > 0 ? `${s.tp1} / ${s.tp2} / ${s.tp3}` : '—'}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-500">
                      <p>{s.riskReward > 0 ? `${s.riskReward}:1` : '—'}</p>
                      <p className="text-[10px]">
                        Spd {s.spread} · ATR {s.atr}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums">
                      <span className="font-bold">{s.qualityScore}/100</span>
                      <p className="text-[10px] text-slate-400">{s.lifecycleStatus}</p>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={s.instrument === 'XAUUSD' ? onInspectGold : onInspectForex}
                        className="px-3 py-1.5 rounded-lg bg-[#F4F5F7] dark:bg-[#111319] hover:text-[#FF444F] text-xs font-semibold inline-flex items-center gap-1 cursor-pointer"
                      >
                        Chart <ArrowUpRight className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-[11px] text-slate-500">
        Rule-based Confluence Quality Score evaluates trend alignment, momentum, spread buffer, and structural R:R (0–100). It is not a win probability or performance guarantee.
      </p>
    </div>
  );
};
