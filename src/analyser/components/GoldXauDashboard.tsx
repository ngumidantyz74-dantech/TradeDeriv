import React, { useState, useEffect, useCallback } from 'react';
import { RefreshCw, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { apiFetch } from '../../lib/api';
import { useAnalyser, type AnalyserSetupData } from '../AnalyserContext';
import { AnalyserChart } from './AnalyserChart';

const ALL_TFS = ['M1', 'M5', 'M15', 'M30', 'H1', 'H4', 'D1'];

export const GoldXauDashboard: React.FC = () => {
  const { notify } = useAnalyser();
  const [timeframe, setTimeframe] = useState('M15');
  const [selectedMtf, setSelectedMtf] = useState<string[]>(['M5', 'M15', 'H1', 'H4', 'D1']);
  const [setup, setSetup] = useState<AnalyserSetupData | null>(null);
  const [candles, setCandles] = useState<any[]>([]);
  const [quote, setQuote] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const loadGold = useCallback(async () => {
    setLoading(true);
    try {
      const mtfParam = selectedMtf.length > 0 ? selectedMtf.join(',') : 'M15,H1,H4';
      const res = await apiFetch<{ setup: AnalyserSetupData; candles: any[]; quote: any }>(
        `/api/analyser/gold?timeframe=${encodeURIComponent(timeframe)}&timeframes=${encodeURIComponent(mtfParam)}&_t=${Date.now()}`,
        { skipAuth: true, cache: 'no-store' }
      );
      setSetup(res.setup);
      setCandles(res.candles || []);
      setQuote(res.quote || null);
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Unable to load Gold setup', 'error');
    } finally {
      setLoading(false);
    }
  }, [timeframe, selectedMtf, notify]);

  useEffect(() => {
    loadGold();
  }, [loadGold]);

  const toggleMtf = (tf: string) => {
    setSelectedMtf((prev) =>
      prev.includes(tf) ? (prev.length > 1 ? prev.filter((x) => x !== tf) : prev) : [...prev, tf]
    );
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold">Gold (XAUUSD) Precision Desk</h1>
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 mt-0.5 font-mono tabular-nums">
            <span>Bid: <strong className="text-[#FF444F]">{quote?.bid ?? '—'}</strong></span>
            <span aria-hidden="true">·</span>
            <span>Ask: <strong className="text-[#00A878]">{quote?.ask ?? '—'}</strong></span>
            <span aria-hidden="true">·</span>
            <span>Spread: <strong>{quote?.spread ?? setup?.spread ?? '—'}</strong></span>
            <span aria-hidden="true">·</span>
            <span>{setup?.feedProvenance || 'Independent Feed'}</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 bg-white dark:bg-[#181C25] p-1 rounded-xl border border-slate-200 dark:border-[#2A2F3D]">
            {ALL_TFS.map((tf) => (
              <button
                key={tf}
                type="button"
                onClick={() => setTimeframe(tf)}
                className={`px-2.5 py-1 rounded-lg font-mono tabular-nums text-xs font-semibold cursor-pointer ${
                  timeframe === tf ? 'bg-[#FF444F] text-white' : 'text-slate-500'
                }`}
              >
                {tf}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={loadGold}
            className="px-3.5 py-2 rounded-xl bg-[#151820] text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </div>
      </div>

      {/* Multi-Timeframe Analysis Selector */}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="font-semibold text-slate-500">MTF Confluence Matrix:</span>
        {ALL_TFS.map((tf) => {
          const active = selectedMtf.includes(tf);
          return (
            <button
              key={tf}
              type="button"
              onClick={() => toggleMtf(tf)}
              className={`px-2.5 py-1 rounded-lg font-mono tabular-nums font-semibold cursor-pointer border ${
                active
                  ? 'border-[#1958B7] text-[#1958B7] bg-[#1958B7]/10'
                  : 'border-slate-200 dark:border-[#2A2F3D] text-slate-500'
              }`}
            >
              {tf}
            </button>
          );
        })}
      </div>

      {/* Main Chart + Precision Entry/SL/TP Card */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
        <div className="xl:col-span-8 bg-white dark:bg-[#181C25] rounded-2xl border border-slate-200 dark:border-[#2A2F3D] overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 dark:border-[#2A2F3D] flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="font-bold">XAUUSD · {timeframe} Candlesticks + Entry/SL/TP1/TP2/TP3 + S&R</span>
            <span className="font-mono tabular-nums text-slate-500">
              ATR(14): {setup?.atr ?? '—'} · RSI(14): {setup?.rsi14 ?? '—'} · Trend: {setup?.trendBias?.toUpperCase() ?? '—'}
            </span>
          </div>
          <AnalyserChart candles={candles} setup={setup} height={440} />
        </div>

        <div className="xl:col-span-4 space-y-4">
          {setup && (
            <div className="bg-white dark:bg-[#181C25] rounded-2xl border border-slate-200 dark:border-[#2A2F3D] p-5 space-y-4 text-xs">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[11px] text-slate-500">{setup.strategyName} · {setup.setupType}</p>
                  <h2 className="font-display text-xl font-bold mt-0.5">
                    Signal:{' '}
                    <span
                      className={
                        setup.direction === 'BUY'
                          ? 'text-[#00A878]'
                          : setup.direction === 'SELL'
                            ? 'text-[#FF444F]'
                            : 'text-slate-400'
                      }
                    >
                      {setup.direction}
                    </span>
                  </h2>
                </div>
                <div className="text-right font-mono tabular-nums">
                  <p className="text-lg font-bold">{setup.qualityScore}/100</p>
                  <p className="text-[11px] text-slate-400">{setup.lifecycleStatus}</p>
                </div>
              </div>

              {setup.blockedReason && (
                <div className="p-3 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-300 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold">Quality Gate Triggered</p>
                    <p>{setup.blockedReason}</p>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-2.5 font-mono tabular-nums">
                <div className="p-2.5 rounded-xl bg-[#F4F5F7] dark:bg-[#111319]">
                  <p className="text-[10px] text-slate-400">Entry Zone</p>
                  <p className="font-bold">{setup.entryZoneLow} – {setup.entryZoneHigh}</p>
                </div>
                <div className="p-2.5 rounded-xl bg-[#F4F5F7] dark:bg-[#111319]">
                  <p className="text-[10px] text-slate-400">Stop Loss</p>
                  <p className="font-bold text-[#FF444F]">{setup.stopLoss || '—'}</p>
                </div>
                <div className="p-2.5 rounded-xl bg-[#F4F5F7] dark:bg-[#111319]">
                  <p className="text-[10px] text-slate-400">TP1 / TP2 / TP3</p>
                  <p className="font-bold text-[#00A878]">{setup.tp1 || '—'} / {setup.tp2 || '—'} / {setup.tp3 || '—'}</p>
                </div>
                <div className="p-2.5 rounded-xl bg-[#F4F5F7] dark:bg-[#111319]">
                  <p className="text-[10px] text-slate-400">Risk / Reward</p>
                  <p className="font-bold">{setup.riskReward ? `${setup.riskReward}:1` : '—'}</p>
                </div>
              </div>

              <div className="space-y-1.5 pt-2 border-t border-slate-100 dark:border-[#2A2F3D]">
                <p className="font-bold">MTF Alignment</p>
                <div className="grid grid-cols-3 gap-1.5 font-mono tabular-nums">
                  {setup.mtfAlignment.map((m) => (
                    <div key={m.timeframe} className="p-2 rounded-lg bg-[#F4F5F7] dark:bg-[#111319] flex items-center justify-between">
                      <span className="font-bold">{m.timeframe}</span>
                      <span className={m.bias === 'bullish' ? 'text-[#00A878]' : m.bias === 'bearish' ? 'text-[#FF444F]' : 'text-slate-400'}>
                        {m.bias}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5 pt-2 border-t border-slate-100 dark:border-[#2A2F3D]">
                <p className="font-bold">Fibonacci Levels</p>
                <div className="grid grid-cols-2 gap-1 font-mono tabular-nums text-[11px]">
                  {setup.fibLevels.map((f) => (
                    <div key={f.ratio} className="flex justify-between px-2 py-1 rounded bg-[#F4F5F7] dark:bg-[#111319]">
                      <span className="text-slate-500">{f.ratio}</span>
                      <span className="font-bold">{f.price}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-1 pt-2 border-t border-slate-100 dark:border-[#2A2F3D]">
                <p className="font-bold">Qualification & Invalidation</p>
                {setup.qualificationReasons.map((r, i) => (
                  <p key={i} className="text-slate-600 dark:text-slate-300 flex items-start gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-[#00A878] shrink-0 mt-0.5" /> {r}
                  </p>
                ))}
                {setup.invalidationConditions.map((c, i) => (
                  <p key={i} className="text-slate-500">{c}</p>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
